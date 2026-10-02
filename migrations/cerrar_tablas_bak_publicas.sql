-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SEGURIDAD + destrabe — tres tablas de respaldo en `public` sin RLS, con GRANT completo a anon
--
-- ESTADO EN PRODUCCIÓN: ver CHANGELOG / informe del día (se aplica ANTES de portal_alta_spc_studbook.sql).
--
-- Por qué (informe docs/diagnosticos/2026-10-01_portal-alta-spc-aplicacion-bloqueada.md, reports):
--   1. `portal_alta_spc_studbook.sql` falló en prod con
--      `0A000: cannot alter table "spcs" because column "_bak_merge_duplicados_spc.fila" uses its row type`:
--      el respaldo de la unificación del 23/08 guarda la ficha como TIPO FILA de spcs, y eso impide
--      agregarle columnas a spcs. Se pasa a jsonb: mismo contenido, sin atar el tipo.
--   2. get_advisors: `rls_disabled_in_public` (ERROR) en las tres. anon/authenticated tienen
--      SELECT/INSERT/UPDATE/DELETE/TRUNCATE: con la key publishable cualquiera las lee o las vacía por
--      la API. bak_r8_propietario tiene inscripción → propietario de R8; las tres son base de rollbacks.
--
-- Qué hace:
--   · _bak_merge_duplicados_spc.fila: spcs → jsonb (to_jsonb(fila)). El rollback de la unificación pasa
--     a jsonb_populate_record(NULL::spcs, fila) (migrations/rollback_merge_duplicados_spc.sql, mismo commit).
--   · ENABLE ROW LEVEL SECURITY sin políticas en las tres + REVOKE ALL de anon y authenticated: sólo
--     service_role / postgres (migraciones, MCP) las pueden leer o escribir.
--   · Guards: conteos esperados antes (2 / 67 / 148) y después (iguales), y los ids de las 2 fichas del
--     respaldo intactos. Si algo no da, RAISE y no se aplica nada.
--
-- Uso en main (grep 2026-10-01 contra origin/main): sólo docs/ y migrations/. En la base: ninguna función
-- ni vista las nombra; la única FK es _gate41_backfill_tenencia.spc_id → spcs (RLS no la afecta).
--
-- Rollback: migrations/rollback_cerrar_tablas_bak_publicas.sql (vuelve a abrirlas: sólo si hace falta).
-- Guards de esta migración (2026-10-02): pwd=/home/clio/dev/SGH · spcs=238 · ref=unlhcuanfrtpatoipwve
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE a int; b int; c int;
BEGIN
  SELECT count(*) INTO a FROM public._bak_merge_duplicados_spc;
  SELECT count(*) INTO b FROM public.bak_r8_propietario;
  SELECT count(*) INTO c FROM public._gate41_backfill_tenencia;
  IF (a, b, c) IS DISTINCT FROM (2, 67, 148) THEN
    RAISE EXCEPTION 'cerrar_tablas_bak_publicas: conteos inesperados antes (% / % / %), esperaba 2 / 67 / 148', a, b, c;
  END IF;
END $$;

ALTER TABLE public._bak_merge_duplicados_spc
  ALTER COLUMN fila TYPE jsonb USING to_jsonb(fila);

COMMENT ON TABLE public._bak_merge_duplicados_spc IS
  'Fichas de SPC borradas al unificar duplicados (23/08). Base del rollback. `fila` es jsonb desde 2026-10 '
  '(antes tipo fila spcs, que impedía agregar columnas a spcs): reinsertar con jsonb_populate_record(NULL::spcs, fila). '
  'RLS sin políticas: sólo service_role.';

ALTER TABLE public._bak_merge_duplicados_spc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bak_r8_propietario        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._gate41_backfill_tenencia ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public._bak_merge_duplicados_spc FROM anon, authenticated;
REVOKE ALL ON public.bak_r8_propietario        FROM anon, authenticated;
REVOKE ALL ON public._gate41_backfill_tenencia FROM anon, authenticated;

DO $$
DECLARE a int; b int; c int; ids text;
BEGIN
  SELECT count(*) INTO a FROM public._bak_merge_duplicados_spc;
  SELECT count(*) INTO b FROM public.bak_r8_propietario;
  SELECT count(*) INTO c FROM public._gate41_backfill_tenencia;
  SELECT string_agg(fila->>'id', ',' ORDER BY fila->>'id') INTO ids FROM public._bak_merge_duplicados_spc;
  IF (a, b, c) IS DISTINCT FROM (2, 67, 148)
     OR ids IS DISTINCT FROM '0dc2f58f-0e2f-4915-be79-a7515fdd6ee4,da839b11-00a3-4eb8-b09f-03790d425ed9' THEN
    RAISE EXCEPTION 'cerrar_tablas_bak_publicas: verificación posterior falló (% / % / %, ids %)', a, b, c, ids;
  END IF;
END $$;

COMMIT;
