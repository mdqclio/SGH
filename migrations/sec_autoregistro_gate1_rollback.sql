-- ============================================================
-- ROLLBACK del Gate 1 de auto-registro
-- ============================================================
-- Escrito y commiteado ANTES de aplicar la migración, según la disciplina de
-- las pasadas SEC_RLS.
--
-- Restaura EXACTAMENTE el estado de prod al 2026-08-04, main @ eb61639:
--   · performances_select               USING (true)
--   · sanciones_select                  USING (true)
--   · fn_get_user_club_id()             sin el filtro AND activo
--   · usuarios.rol                      DEFAULT 'operador'
--   · fn_audit_policies_permisivas()    sólo INSERT/UPDATE/DELETE/ALL
--   · ux_entidad_una_cuenta             no existía
--
-- ⚠️ Revertir esto REABRE los huecos:
--   · cualquier cuenta autenticada —incluida una recién registrada sin fila en
--     usuarios— vuelve a leer performances y sanciones enteras;
--   · una fila de usuarios con activo=false vuelve a otorgar lectura de todo el
--     club vía fn_get_user_club_id();
--   · un INSERT en usuarios que omita el rol vuelve a crear un 'operador', que
--     fn_is_staff() cuenta como staff.
-- Sólo correr si el Gate 1 rompió algo peor.
-- ============================================================

BEGIN;

-- ---------------------------------------------------------------- 1
DROP POLICY IF EXISTS performances_select ON performances;
CREATE POLICY performances_select ON performances
  FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------- 2
DROP POLICY IF EXISTS sanciones_select ON sanciones;
CREATE POLICY sanciones_select ON sanciones
  FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------- 3
DROP INDEX IF EXISTS ux_entidad_una_cuenta;

-- ---------------------------------------------------------------- 4
CREATE OR REPLACE FUNCTION public.fn_get_user_club_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid();
$function$;

-- ---------------------------------------------------------------- 5
ALTER TABLE usuarios ALTER COLUMN rol SET DEFAULT 'operador'::rol_usuario;

-- ---------------------------------------------------------------- 6
CREATE OR REPLACE FUNCTION public.fn_audit_policies_permisivas()
RETURNS TABLE(schemaname text, tablename text, policyname text,
              cmd text, roles text, qual text, with_check text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.schemaname::text, p.tablename::text, p.policyname::text,
         p.cmd::text, p.roles::text, p.qual::text, p.with_check::text
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
    AND (p.qual = 'true' OR p.with_check = 'true')
$function$;

-- Verificación dentro de la transacción, ANTES del COMMIT.
SELECT tablename, policyname, qual
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('performances','sanciones') AND cmd='SELECT';

SELECT column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='usuarios' AND column_name='rol';

COMMIT;
