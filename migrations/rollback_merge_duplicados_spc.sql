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

INSERT INTO spcs
SELECT (fila).*
  FROM _bak_merge_duplicados_spc
 WHERE (fila).id NOT IN (SELECT id FROM spcs);

COMMIT;

--   SELECT count(*) FROM spcs;   -- vuelve a 183
