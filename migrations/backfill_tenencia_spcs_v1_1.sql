-- ============================================================
-- Gate 4.1 — Backfill de tenencia, segunda pasada (v1.1)
-- ============================================================
-- ✅ APLICADA 2026-08-23 por MCP, como migración `backfill_tenencia_spcs_v1_1`.
--    Resultado real: +33 entrenadores (114 → 147 de 183), +0 caballerizas (152).
--    TIRSO quedó con MALENA, GUSTAVO — el que la v1 dejaba afuera. 0 campos pisados,
--    verificado por huella md5 de los 114 valores preexistentes: idéntica antes y
--    después. 0 entrenadores inexistentes.
--
-- POR QUÉ HACE FALTA UNA v1.1 EN VEZ DE RE-CORRER LA v1
--   La v1 (backfill_tenencia_spcs.sql, aplicada el 2026-08-06) es idempotente
--   para el UPDATE, pero el INSERT a la tabla de auditoría usa
--   `ON CONFLICT (spc_id) DO NOTHING`, y el UPDATE se apoya en esa tabla.
--   Consecuencia: un SPC que ya tiene fila de auditoría NUNCA vuelve a
--   actualizarse, aunque desde entonces haya aparecido evidencia nueva.
--
--   Hoy eso afecta a UN caballo: TIRSO (e08e7cd3-…). El 06/08 sólo había
--   evidencia de caballeriza, así que quedó con entrenador_id_nuevo = NULL.
--   Después, R8 (16/08) le dio entrenador — MALENA, GUSTAVO. Re-correr la v1
--   tal cual lo dejaría afuera en silencio: 32 en vez de 33.
--
-- QUÉ CAMBIA respecto de la v1
--   Sólo el ON CONFLICT: pasa de DO NOTHING a DO UPDATE, y **únicamente
--   rellena los `_nuevo` que estén en NULL**. Nunca pisa un `_nuevo` ya
--   escrito y NUNCA toca los `_previo`, que son la base del rollback.
--
-- LO QUE NO CAMBIA
--   Mismo criterio de derivación, palabra por palabra que la v1:
--     · por spc_id, el entrenador_id (resp. caballeriza_id) de su inscripción
--       MÁS RECIENTE con ese campo NO NULO
--     · orden: reuniones.fecha DESC, desempate por inscripciones.created_at DESC
--     · se EXCLUYE la reunión 9999 (PRUEBA RESUMEN, sintética)
--     · las reuniones canceladas SÍ cuentan: una inscripción cargada por la
--       secretaría es evidencia real de quién entrenaba al caballo
--   Y sigue rellenando SÓLO donde spcs.entrenador_id / caballeriza_id están en
--   NULL: no pisa ninguna corrección manual de Yesi.
--
-- EFECTO ESPERADO (dry run del 2026-08-23 contra prod)
--   entrenador_id  : +33  → 114 de 183 pasa a 147 de 183 (62,3 % → 80,3 %)
--   caballeriza_id : +0   (no hay nada nuevo que derivar)
--   Quedan 36 sin entrenador, que no tienen evidencia utilizable y van a la
--   lista manual — ver docs/TENENCIA_SPC_LISTA_YESI.md.
--
-- ROLLBACK: migrations/rollback_tenencia_spcs.sql, que lee la misma tabla de
--   auditoría. Sigue sirviendo sin cambios.
-- ============================================================

BEGIN;

WITH base AS (
  SELECT i.spc_id, i.entrenador_id, i.caballeriza_id,
         r.fecha, r.numero AS reunion, i.created_at
  FROM inscripciones i
  JOIN carreras  c ON c.id = i.carrera_id
  JOIN reuniones r ON r.id = c.reunion_id
  WHERE r.numero <> 9999
),
ult_entrenador AS (
  SELECT DISTINCT ON (spc_id) spc_id, entrenador_id, reunion, fecha
  FROM base WHERE entrenador_id IS NOT NULL
  ORDER BY spc_id, fecha DESC, created_at DESC
),
ult_caballeriza AS (
  SELECT DISTINCT ON (spc_id) spc_id, caballeriza_id
  FROM base WHERE caballeriza_id IS NOT NULL
  ORDER BY spc_id, fecha DESC, created_at DESC
),
derivado AS (
  SELECT COALESCE(e.spc_id, c.spc_id) AS spc_id,
         e.entrenador_id, c.caballeriza_id, e.reunion, e.fecha
  FROM ult_entrenador e
  FULL OUTER JOIN ult_caballeriza c ON c.spc_id = e.spc_id
)
INSERT INTO _gate41_backfill_tenencia
  (spc_id, entrenador_id_previo, caballeriza_id_previo,
   entrenador_id_nuevo, caballeriza_id_nuevo, evidencia_reunion, evidencia_fecha)
SELECT s.id, s.entrenador_id, s.caballeriza_id,
       CASE WHEN s.entrenador_id  IS NULL THEN d.entrenador_id  END,
       CASE WHEN s.caballeriza_id IS NULL THEN d.caballeriza_id END,
       d.reunion, d.fecha
FROM derivado d
JOIN spcs s ON s.id = d.spc_id
WHERE (s.entrenador_id  IS NULL AND d.entrenador_id  IS NOT NULL)
   OR (s.caballeriza_id IS NULL AND d.caballeriza_id IS NOT NULL)
ON CONFLICT (spc_id) DO UPDATE
   SET entrenador_id_nuevo  = COALESCE(_gate41_backfill_tenencia.entrenador_id_nuevo,
                                       EXCLUDED.entrenador_id_nuevo),
       caballeriza_id_nuevo = COALESCE(_gate41_backfill_tenencia.caballeriza_id_nuevo,
                                       EXCLUDED.caballeriza_id_nuevo),
       evidencia_reunion    = COALESCE(_gate41_backfill_tenencia.evidencia_reunion,
                                       EXCLUDED.evidencia_reunion),
       evidencia_fecha      = COALESCE(_gate41_backfill_tenencia.evidencia_fecha,
                                       EXCLUDED.evidencia_fecha),
       aplicado_at          = now()
 -- Los _previo NO se tocan: son la foto original y la base del rollback.
 WHERE _gate41_backfill_tenencia.entrenador_id_nuevo  IS NULL
    OR _gate41_backfill_tenencia.caballeriza_id_nuevo IS NULL;

UPDATE spcs s
   SET entrenador_id  = COALESCE(s.entrenador_id,  b.entrenador_id_nuevo),
       caballeriza_id = COALESCE(s.caballeriza_id, b.caballeriza_id_nuevo),
       updated_at     = now()
  FROM _gate41_backfill_tenencia b
 WHERE b.spc_id = s.id
   AND (   (s.entrenador_id  IS NULL AND b.entrenador_id_nuevo  IS NOT NULL)
        OR (s.caballeriza_id IS NULL AND b.caballeriza_id_nuevo IS NOT NULL));

COMMIT;

-- ============================================================
-- VERIFICACIÓN (correr después, fuera de la transacción)
-- ============================================================
--   SELECT count(*) FILTER (WHERE entrenador_id IS NOT NULL) AS con_entrenador,
--          count(*) AS total FROM spcs;
--   -- esperado: 147 de 183
--
--   SELECT entrenador_id IS NOT NULL AS ok FROM spcs
--    WHERE id = 'e08e7cd3-e462-4778-a42d-0fbe859ec0ef';   -- TIRSO → true
--
--   SELECT count(*) FROM spcs s WHERE s.entrenador_id IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM profesionales p WHERE p.id = s.entrenador_id);
--   -- esperado: 0
