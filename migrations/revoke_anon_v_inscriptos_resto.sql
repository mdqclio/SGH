-- SEGURIDAD — complemento de revoke_anon_tablas_publicas.sql (03/10): v_inscriptos_carrera conservaba para anon
-- todo menos SELECT (ISSUE-098 revocó sólo SELECT): anon=awdDxtm. Nadie la usa desde el código; anon no la lee.
-- Después de esto, ningún objeto de public tiene privilegios para anon.
-- ESTADO EN PRODUCCIÓN: APLICADA 2026-10-03 (`20261003150235`); 0 objetos de public con privilegios para anon.
BEGIN;
REVOKE ALL ON TABLE public.v_inscriptos_carrera FROM anon;
COMMIT;
