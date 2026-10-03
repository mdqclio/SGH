-- ROLLBACK: devuelve a anon lo que tenía en v_inscriptos_carrera el 03/10 (todo menos SELECT: awdDxtm).
BEGIN;
GRANT ALL ON TABLE public.v_inscriptos_carrera TO anon;
REVOKE SELECT ON TABLE public.v_inscriptos_carrera FROM anon;
COMMIT;
