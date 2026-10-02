-- ============================================================
-- ROLLBACK de merge_duplicados_spc.sql
-- ============================================================
-- Reinserta las fichas borradas con su UUID original, desde el snapshot que
-- dejó el script de merge. Con el mismo id, cualquier referencia guardada
-- fuera de la base vuelve a resolver.
--
-- ⚠️ Si el merge llegó a repuntar filas hijas (hoy no hay ninguna, pero el
-- script lo soporta), esto NO las devuelve al SPC original: sólo revive la
-- ficha. El repunte se deshace a mano mirando _bak_merge_duplicados_spc, que
-- guarda a qué sobreviviente fue cada uno.
-- ============================================================

BEGIN;

-- Desde 2026-10 (migrations/cerrar_tablas_bak_publicas.sql) `fila` es jsonb, no el tipo fila de spcs
-- (que impedía agregarle columnas a spcs). jsonb_populate_record la vuelve a armar como spcs; las columnas
-- que spcs ganó después quedan NULL y las completan sus defaults/triggers (p.ej. trg_spcs_alta_revision).
INSERT INTO spcs
SELECT (jsonb_populate_record(NULL::spcs, fila)).*
  FROM _bak_merge_duplicados_spc
 WHERE (fila->>'id')::uuid NOT IN (SELECT id FROM spcs);

COMMIT;

--   SELECT count(*) FROM spcs;   -- vuelve a 183
