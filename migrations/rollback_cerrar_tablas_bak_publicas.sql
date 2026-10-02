-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK de migrations/cerrar_tablas_bak_publicas.sql
--
-- ⚠ VUELVE A EXPONER las tres tablas a anon (estado previo: sin RLS, GRANT completo). Usarlo sólo si algo
-- que dependía de leerlas con la key publishable se rompió — no había nada en main al 2026-10-01.
-- `fila` vuelve a tipo spcs con jsonb_populate_record; si spcs ya tiene columnas que el respaldo no tenía,
-- quedan NULL dentro de la fila guardada (no se pierde nada de lo que había). OJO: devolverle el tipo fila
-- vuelve a impedir ALTER TABLE spcs ADD COLUMN — no hace falta para el rollback de la unificación, que ya
-- funciona con jsonb (rollback_merge_duplicados_spc.sql).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE public._bak_merge_duplicados_spc DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bak_r8_propietario        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public._gate41_backfill_tenencia DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public._bak_merge_duplicados_spc TO anon, authenticated;
GRANT ALL ON public.bak_r8_propietario        TO anon, authenticated;
GRANT ALL ON public._gate41_backfill_tenencia TO anon, authenticated;

ALTER TABLE public._bak_merge_duplicados_spc
  ALTER COLUMN fila TYPE spcs USING jsonb_populate_record(NULL::spcs, fila);

COMMENT ON TABLE public._bak_merge_duplicados_spc IS
  'Fichas de SPC borradas al unificar duplicados. Base del rollback. No la lee ninguna función de la app.';

COMMIT;
