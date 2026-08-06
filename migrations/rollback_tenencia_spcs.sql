-- ============================================================
-- Gate 4.1 — ROLLBACK del backfill de tenencia
-- ============================================================
-- Revierte exactamente lo que escribió migrations/backfill_tenencia_spcs.sql,
-- usando la tabla de auditoría _gate41_backfill_tenencia.
--
-- ⚠️ REVIERTE AL VALOR PREVIO, NO A NULL A CIEGAS.
--    Si Yesi ya corrigió a mano la tenencia de un caballo después del
--    backfill, ese caballo NO se toca: la condición exige que el valor
--    actual siga siendo el que puso el backfill.
--
-- Correr sólo si el gate 4.1 se da de baja. No es parte del flujo normal.
-- ============================================================

BEGIN;

-- 1. Entrenador — sólo donde el valor actual es todavía el que puso el backfill.
UPDATE spcs s
   SET entrenador_id = b.entrenador_id_previo,
       updated_at    = now()
  FROM _gate41_backfill_tenencia b
 WHERE b.spc_id = s.id
   AND b.entrenador_id_nuevo IS NOT NULL
   AND s.entrenador_id IS NOT DISTINCT FROM b.entrenador_id_nuevo;

-- 2. Caballeriza — misma guarda.
UPDATE spcs s
   SET caballeriza_id = b.caballeriza_id_previo,
       updated_at     = now()
  FROM _gate41_backfill_tenencia b
 WHERE b.spc_id = s.id
   AND b.caballeriza_id_nuevo IS NOT NULL
   AND s.caballeriza_id IS NOT DISTINCT FROM b.caballeriza_id_nuevo;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
--   SELECT count(*) FILTER (WHERE entrenador_id  IS NOT NULL) AS con_entrenador,
--          count(*) FILTER (WHERE caballeriza_id IS NOT NULL) AS con_caballeriza
--     FROM spcs;
--   -- esperado: los valores previos al backfill (hoy: 0 y 0)
--
-- Lo que quedó fuera del rollback porque alguien lo editó después:
--   SELECT s.nombre, s.entrenador_id, b.entrenador_id_nuevo
--     FROM _gate41_backfill_tenencia b JOIN spcs s ON s.id = b.spc_id
--    WHERE b.entrenador_id_nuevo IS NOT NULL
--      AND s.entrenador_id IS DISTINCT FROM b.entrenador_id_previo;
--
-- La tabla de auditoría NO se borra: es el registro de que esto pasó.
-- Para eliminarla, explícitamente:  DROP TABLE _gate41_backfill_tenencia;
