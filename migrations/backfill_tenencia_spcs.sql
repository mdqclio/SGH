-- ============================================================
-- Gate 4.1 — Backfill de tenencia en spcs (semilla por única vez)
-- ============================================================
-- Ver docs/AUTOREGISTRO_GATE_4.md §A y docs/GATE_4_1_BACKFILL_TENENCIA.md
--
-- QUÉ HACE
--   Puebla spcs.entrenador_id y spcs.caballeriza_id, hoy 0/163 ambos,
--   derivándolos de la inscripción MÁS RECIENTE de cada caballo que traiga
--   el dato. Es una SEMILLA por única vez: después de esto la fuente de
--   verdad es spcs.entrenador_id, que es lo que ya lee fn_mis_spc_ids().
--   NO se instala ninguna derivación permanente.
--
-- REGLA
--   Por spc_id: el entrenador_id (resp. caballeriza_id) de su inscripción
--   más reciente con ese campo NO NULO, ordenando por reuniones.fecha DESC
--   y desempatando por inscripciones.created_at DESC.
--
-- EXCLUSIÓN
--   Reunión 9999 (PRUEBA RESUMEN, sintética). Sin este filtro la derivación
--   toma datos de prueba: la consulta sin filtrar da fecha_max = 2099-01-01
--   y suma 17 SPCs que sólo existen en esa reunión.
--   Las reuniones CANCELADAS sí cuentan: una inscripción que la secretaría
--   cargó es evidencia real de quién entrenaba al caballo, aunque después
--   se haya suspendido la fecha.
--
-- IDEMPOTENTE
--   Sólo escribe donde el campo está en NULL. Correr esto dos veces no
--   pisa nada, y no revierte ninguna corrección manual que haga Yesi.
--
-- LO QUE NO HACE
--   No inventa. Los SPCs sin evidencia quedan en NULL y por lo tanto no
--   aparecen en el portal — se inscriben por secretaría, como siempre.
--
-- ROLLBACK: migrations/rollback_tenencia_spcs.sql (usa la tabla de auditoría
--   que crea este mismo archivo).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Tabla de auditoría del backfill — es la base del rollback.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS _gate41_backfill_tenencia (
  spc_id                 uuid PRIMARY KEY REFERENCES spcs(id),
  entrenador_id_previo   uuid,
  caballeriza_id_previo  uuid,
  entrenador_id_nuevo    uuid,
  caballeriza_id_nuevo   uuid,
  evidencia_reunion      integer,
  evidencia_fecha        date,
  aplicado_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE _gate41_backfill_tenencia IS
  'Gate 4.1 — qué tocó el backfill de tenencia y con qué valores previos. Base del rollback. No la lee ninguna función de la app.';

-- ------------------------------------------------------------
-- 2. Derivación + snapshot de los valores PREVIOS.
-- ------------------------------------------------------------
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
       -- sólo se registra como "nuevo" lo que este backfill realmente va a escribir
       CASE WHEN s.entrenador_id  IS NULL THEN d.entrenador_id  END,
       CASE WHEN s.caballeriza_id IS NULL THEN d.caballeriza_id END,
       d.reunion, d.fecha
FROM derivado d
JOIN spcs s ON s.id = d.spc_id
WHERE (s.entrenador_id  IS NULL AND d.entrenador_id  IS NOT NULL)
   OR (s.caballeriza_id IS NULL AND d.caballeriza_id IS NOT NULL)
ON CONFLICT (spc_id) DO NOTHING;

-- ------------------------------------------------------------
-- 3. El UPDATE. Sólo rellena NULLs — nunca pisa un valor existente.
-- ------------------------------------------------------------
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
-- Esperado: entrenador 113, caballeriza 114, tocados 114, sin entrenador 50.
--
--   SELECT count(*) FILTER (WHERE entrenador_id  IS NOT NULL) AS con_entrenador,
--          count(*) FILTER (WHERE caballeriza_id IS NOT NULL) AS con_caballeriza,
--          count(*)                                            AS total
--     FROM spcs;
--
--   SELECT count(*) AS filas_tocadas FROM _gate41_backfill_tenencia;
--
-- Ningún SPC puede haber quedado con un entrenador que no exista:
--   SELECT count(*) FROM spcs s
--    WHERE s.entrenador_id IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM profesionales p WHERE p.id = s.entrenador_id);
--   -- esperado: 0
