-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SEGURIDAD — tanda 2 (03/10, después de ISSUE-099):
--   A) fn_insc_monta_oficial_guard() — función de TRIGGER (trg_insc_monta_oficial, BEFORE UPDATE OF
--      jockey_titular_id ON inscripciones), SECURITY DEFINER, ejecutable por authenticated por /rest/v1/rpc.
--      Pasa al "grupo B" de ISSUE-099: sólo service_role (+ dueño). Postgres chequea EXECUTE de la
--      función de trigger al CREAR el trigger, no al dispararlo: sigue disparando para todos.
--      ACL antes (prod 03/10): {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--      md5(pg_get_functiondef) = 935d8dfad71878efef3b7b75efad2b75 (no cambia: un REVOKE no toca la definición).
--   B) default privileges de postgres en `public` para TABLAS y SECUENCIAS nuevas: sin anon.
--      Antes: r {postgres,anon,authenticated,service_role = arwdDxtm}; S {… = rwU}. Mismo patrón que causó
--      ISSUE-099 con las funciones: cada tabla nueva nacía con todos los permisos para anon (la RLS la
--      protegía, pero el GRANT quedaba). authenticated y service_role siguen recibiéndolos.
--      NO toca las tablas existentes (37 tablas de public con SELECT para anon, protegidas por RLS — queda
--      anotado), ni los defaults de supabase_admin (plataforma), ni el esquema storage (decisión 03/10).
-- Probe: tests/probe_seguridad_tanda_2.mjs (sandbox; --prod sólo lectura). Rollback:
-- migrations/rollback_seguridad_tanda_2.sql.
-- ESTADO EN PRODUCCIÓN: APLICADA 2026-10-03 (`20261003140631`). Verificado: función {postgres,service_role}, md5 sin cambios,
-- defaults r/S de postgres en public sin anon, ACL de las 41 tablas/secuencias existentes idéntico (md5 48b4c8f1…),
-- trigger sigue disparando (probe_montas_post_oficial 24/24 en prod), advisor sin la función.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

REVOKE EXECUTE ON FUNCTION public.fn_insc_monta_oficial_guard() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_insc_monta_oficial_guard() TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

COMMIT;
