-- ROLLBACK de seguridad_tanda_2.sql: devuelve EXECUTE a authenticated en fn_insc_monta_oficial_guard() y los
-- default privileges de postgres en public para tablas y secuencias nuevas a anon (como estaban el 03/10).
BEGIN;

GRANT EXECUTE ON FUNCTION public.fn_insc_monta_oficial_guard() TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES    TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;

COMMIT;
