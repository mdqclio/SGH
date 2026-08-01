-- ===========================================================================
-- ROLLBACK del grupo 2c (lectura de plata + usuarios)
-- ===========================================================================
-- Commiteado ANTES de aplicar sec_rls_fase2c_lectura.sql.
-- Dump TEXTUAL de pg_policies del 01/08/2026, estado posterior a 2a/2b.
--
-- ⚠️ Correr esto REABRE D-H2 (una cuenta de portal lee las liquidaciones, el
--    detalle y los recibos de TODO el club) y D-H8 (enumera los usuarios del
--    club). También devuelve la rama por email a las policies de `usuarios`.
-- ===========================================================================

BEGIN;

-- Trigger de guarda de privilegios (nace en 2c)
DROP TRIGGER IF EXISTS trg_usuarios_guard_privilegios ON public.usuarios;
DROP FUNCTION IF EXISTS public.fn_usuarios_guard_privilegios();

DROP POLICY IF EXISTS liquidacion_detalle_select ON public.liquidacion_detalle;
CREATE POLICY liquidacion_detalle_select ON public.liquidacion_detalle FOR SELECT TO authenticated
  USING ((fn_is_super_admin() OR (fn_club_de_liquidacion(liquidacion_id) = fn_get_user_club_id())));

DROP POLICY IF EXISTS liquidaciones_select ON public.liquidaciones;
CREATE POLICY liquidaciones_select ON public.liquidaciones FOR SELECT TO authenticated
  USING ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())));

-- recibos vuelve a ser UNA sola policy FOR ALL
DROP POLICY IF EXISTS recibos_select ON public.recibos;
DROP POLICY IF EXISTS recibos_insert ON public.recibos;
DROP POLICY IF EXISTS recibos_update ON public.recibos;
DROP POLICY IF EXISTS recibos_delete ON public.recibos;
DROP POLICY IF EXISTS recibos_rls ON public.recibos;
CREATE POLICY recibos_rls ON public.recibos FOR ALL TO authenticated
  USING ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())))
  WITH CHECK ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())));

DROP POLICY IF EXISTS usuarios_select ON public.usuarios;
CREATE POLICY usuarios_select ON public.usuarios FOR SELECT TO authenticated
  USING ((fn_is_super_admin() OR ((email)::text = (auth.jwt() ->> 'email'::text)) OR (club_id = fn_get_user_club_id())));

DROP POLICY IF EXISTS usuarios_update ON public.usuarios;
CREATE POLICY usuarios_update ON public.usuarios FOR UPDATE TO authenticated
  USING ((fn_is_super_admin() OR ((email)::text = (auth.jwt() ->> 'email'::text))))
  WITH CHECK ((fn_is_super_admin() OR ((email)::text = (auth.jwt() ->> 'email'::text))));

COMMIT;

-- ===========================================================================
-- VERIFICACIÓN — esperado: 1 policy en recibos, y usuarios_select con auth.jwt
-- ===========================================================================
-- SELECT tablename, policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename IN ('recibos','usuarios') ORDER BY 1,3;
