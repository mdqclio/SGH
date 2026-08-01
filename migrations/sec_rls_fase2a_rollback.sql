-- ===========================================================================
-- ROLLBACK del grupo 2a (catálogos: los cuatro USING (true))
-- ===========================================================================
-- Commiteado ANTES de aplicar sec_rls_fase2a_catalogos.sql.
--
-- Contenido: dump TEXTUAL de pg_policies tomado el 01/08/2026 antes de tocar
-- nada. Restaura las 16 policies de spcs / propietarios / profesionales /
-- spc_propietarios exactamente como estaban — incluidos los USING (true).
--
-- ⚠️ Correr esto REABRE los huecos D-H1, D-H3 y D-H4. Es lo correcto si el
--    canario se pone rojo: primero se recupera la operación de la secretaría,
--    después se averigua. Con R8 a una semana, la secretaría trabajando vale
--    más que un hueco cerrado.
--
-- Las funciones nuevas (fn_is_staff, fn_is_portal_user, fn_mis_entidades,
-- fn_mis_spc_ids) NO se dropean acá a propósito: quedar huérfanas no molesta a
-- nadie y las necesitan los grupos 2b/2c. Para removerlas del todo, ver el
-- bloque comentado del final.
-- ===========================================================================

BEGIN;

DROP POLICY IF EXISTS profesionales_delete ON public.profesionales;
CREATE POLICY profesionales_delete ON public.profesionales FOR DELETE TO authenticated
  USING (fn_is_super_admin());
DROP POLICY IF EXISTS profesionales_insert ON public.profesionales;
CREATE POLICY profesionales_insert ON public.profesionales FOR INSERT TO authenticated
  WITH CHECK (true);
DROP POLICY IF EXISTS profesionales_select ON public.profesionales;
CREATE POLICY profesionales_select ON public.profesionales FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS profesionales_update ON public.profesionales;
CREATE POLICY profesionales_update ON public.profesionales FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS propietarios_delete ON public.propietarios;
CREATE POLICY propietarios_delete ON public.propietarios FOR DELETE TO authenticated
  USING (fn_is_super_admin());
DROP POLICY IF EXISTS propietarios_insert ON public.propietarios;
CREATE POLICY propietarios_insert ON public.propietarios FOR INSERT TO authenticated
  WITH CHECK (true);
DROP POLICY IF EXISTS propietarios_select ON public.propietarios;
CREATE POLICY propietarios_select ON public.propietarios FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS propietarios_update ON public.propietarios;
CREATE POLICY propietarios_update ON public.propietarios FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS spc_propietarios_delete ON public.spc_propietarios;
CREATE POLICY spc_propietarios_delete ON public.spc_propietarios FOR DELETE TO authenticated
  USING (fn_is_super_admin());
DROP POLICY IF EXISTS spc_propietarios_insert ON public.spc_propietarios;
CREATE POLICY spc_propietarios_insert ON public.spc_propietarios FOR INSERT TO authenticated
  WITH CHECK (true);
DROP POLICY IF EXISTS spc_propietarios_select ON public.spc_propietarios;
CREATE POLICY spc_propietarios_select ON public.spc_propietarios FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS spc_propietarios_update ON public.spc_propietarios;
CREATE POLICY spc_propietarios_update ON public.spc_propietarios FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS spcs_delete ON public.spcs;
CREATE POLICY spcs_delete ON public.spcs FOR DELETE TO authenticated
  USING (fn_is_super_admin());
DROP POLICY IF EXISTS spcs_insert ON public.spcs;
CREATE POLICY spcs_insert ON public.spcs FOR INSERT TO authenticated
  WITH CHECK (true);
DROP POLICY IF EXISTS spcs_select ON public.spcs;
CREATE POLICY spcs_select ON public.spcs FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS spcs_update ON public.spcs;
CREATE POLICY spcs_update ON public.spcs FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;

-- ---------------------------------------------------------------------------
-- Remoción total de las funciones nuevas — sólo si se aborta TODA la FASE 2.
-- Correrlo con los grupos 2b y 2c ya revertidos; si no, sus policies quedan
-- referenciando funciones inexistentes.
-- ---------------------------------------------------------------------------
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.fn_mis_spc_ids();
-- DROP FUNCTION IF EXISTS public.fn_mis_entidades();
-- DROP FUNCTION IF EXISTS public.fn_is_portal_user();
-- DROP FUNCTION IF EXISTS public.fn_is_staff();
-- COMMIT;

-- ===========================================================================
-- VERIFICACIÓN — esperado: 8 policies con USING/WITH CHECK = true
-- ===========================================================================
-- SELECT count(*) FROM pg_policies
--  WHERE schemaname='public'
--    AND tablename IN ('spcs','propietarios','profesionales','spc_propietarios')
--    AND (qual = 'true' OR with_check = 'true');
