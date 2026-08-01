-- ===========================================================================
-- ROLLBACK del grupo 2b (escritura de portal en tablas operativas)
-- ===========================================================================
-- Commiteado ANTES de aplicar sec_rls_fase2b_escritura.sql.
-- Dump TEXTUAL de pg_policies del 01/08/2026: 27 policies de escritura
-- (INSERT/UPDATE/DELETE) sobre 9 tablas operativas.
--
-- ⚠️ Correr esto REABRE D-H5 (una cuenta de portal pone en forfait la
--    inscripción de un rival), D-H6 (borra una reunión entera) y D-H7
--    (altera resultados oficiales).
-- ===========================================================================

BEGIN;

DROP POLICY IF EXISTS apoderados_delete ON public.apoderados;
CREATE POLICY apoderados_delete ON public.apoderados FOR DELETE TO authenticated
  USING ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())));
DROP POLICY IF EXISTS apoderados_insert ON public.apoderados;
CREATE POLICY apoderados_insert ON public.apoderados FOR INSERT TO authenticated
  WITH CHECK ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())));
DROP POLICY IF EXISTS apoderados_update ON public.apoderados;
CREATE POLICY apoderados_update ON public.apoderados FOR UPDATE TO authenticated
  USING ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())))
  WITH CHECK ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())));

DROP POLICY IF EXISTS caballerizas_delete ON public.caballerizas;
CREATE POLICY caballerizas_delete ON public.caballerizas FOR DELETE TO authenticated
  USING ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())));
DROP POLICY IF EXISTS caballerizas_insert ON public.caballerizas;
CREATE POLICY caballerizas_insert ON public.caballerizas FOR INSERT TO authenticated
  WITH CHECK ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())));
DROP POLICY IF EXISTS caballerizas_update ON public.caballerizas;
CREATE POLICY caballerizas_update ON public.caballerizas FOR UPDATE TO authenticated
  USING ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())))
  WITH CHECK ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())));

DROP POLICY IF EXISTS carreras_delete ON public.carreras;
CREATE POLICY carreras_delete ON public.carreras FOR DELETE TO authenticated
  USING ((fn_is_super_admin() OR (fn_club_de_reunion(reunion_id) = fn_get_user_club_id())));
DROP POLICY IF EXISTS carreras_insert ON public.carreras;
CREATE POLICY carreras_insert ON public.carreras FOR INSERT TO authenticated
  WITH CHECK ((fn_is_super_admin() OR (fn_club_de_reunion(reunion_id) = fn_get_user_club_id())));
DROP POLICY IF EXISTS carreras_update ON public.carreras;
CREATE POLICY carreras_update ON public.carreras FOR UPDATE TO authenticated
  USING ((fn_is_super_admin() OR (fn_club_de_reunion(reunion_id) = fn_get_user_club_id())))
  WITH CHECK ((fn_is_super_admin() OR (fn_club_de_reunion(reunion_id) = fn_get_user_club_id())));

DROP POLICY IF EXISTS inscripciones_delete ON public.inscripciones;
CREATE POLICY inscripciones_delete ON public.inscripciones FOR DELETE TO authenticated
  USING ((fn_is_super_admin() OR (fn_club_de_carrera(carrera_id) = fn_get_user_club_id())));
DROP POLICY IF EXISTS inscripciones_insert ON public.inscripciones;
CREATE POLICY inscripciones_insert ON public.inscripciones FOR INSERT TO authenticated
  WITH CHECK ((fn_is_super_admin() OR (fn_club_de_carrera(carrera_id) = fn_get_user_club_id())));
DROP POLICY IF EXISTS inscripciones_update ON public.inscripciones;
CREATE POLICY inscripciones_update ON public.inscripciones FOR UPDATE TO authenticated
  USING ((fn_is_super_admin() OR (fn_club_de_carrera(carrera_id) = fn_get_user_club_id())))
  WITH CHECK ((fn_is_super_admin() OR (fn_club_de_carrera(carrera_id) = fn_get_user_club_id())));

DROP POLICY IF EXISTS liquidacion_detalle_delete ON public.liquidacion_detalle;
CREATE POLICY liquidacion_detalle_delete ON public.liquidacion_detalle FOR DELETE TO authenticated
  USING ((fn_is_super_admin() OR (fn_club_de_liquidacion(liquidacion_id) = fn_get_user_club_id())));
DROP POLICY IF EXISTS liquidacion_detalle_insert ON public.liquidacion_detalle;
CREATE POLICY liquidacion_detalle_insert ON public.liquidacion_detalle FOR INSERT TO authenticated
  WITH CHECK ((fn_is_super_admin() OR (fn_club_de_liquidacion(liquidacion_id) = fn_get_user_club_id())));
DROP POLICY IF EXISTS liquidacion_detalle_update ON public.liquidacion_detalle;
CREATE POLICY liquidacion_detalle_update ON public.liquidacion_detalle FOR UPDATE TO authenticated
  USING ((fn_is_super_admin() OR (fn_club_de_liquidacion(liquidacion_id) = fn_get_user_club_id())))
  WITH CHECK ((fn_is_super_admin() OR (fn_club_de_liquidacion(liquidacion_id) = fn_get_user_club_id())));

DROP POLICY IF EXISTS liquidaciones_delete ON public.liquidaciones;
CREATE POLICY liquidaciones_delete ON public.liquidaciones FOR DELETE TO authenticated
  USING ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())));
DROP POLICY IF EXISTS liquidaciones_insert ON public.liquidaciones;
CREATE POLICY liquidaciones_insert ON public.liquidaciones FOR INSERT TO authenticated
  WITH CHECK ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())));
DROP POLICY IF EXISTS liquidaciones_update ON public.liquidaciones;
CREATE POLICY liquidaciones_update ON public.liquidaciones FOR UPDATE TO authenticated
  USING ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())))
  WITH CHECK ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())));

DROP POLICY IF EXISTS resultado_posiciones_delete ON public.resultado_posiciones;
CREATE POLICY resultado_posiciones_delete ON public.resultado_posiciones FOR DELETE TO authenticated
  USING ((fn_is_super_admin() OR (fn_club_de_inscripcion(inscripcion_id) = fn_get_user_club_id())));
DROP POLICY IF EXISTS resultado_posiciones_insert ON public.resultado_posiciones;
CREATE POLICY resultado_posiciones_insert ON public.resultado_posiciones FOR INSERT TO authenticated
  WITH CHECK ((fn_is_super_admin() OR (fn_club_de_inscripcion(inscripcion_id) = fn_get_user_club_id())));
DROP POLICY IF EXISTS resultado_posiciones_update ON public.resultado_posiciones;
CREATE POLICY resultado_posiciones_update ON public.resultado_posiciones FOR UPDATE TO authenticated
  USING ((fn_is_super_admin() OR (fn_club_de_inscripcion(inscripcion_id) = fn_get_user_club_id())))
  WITH CHECK ((fn_is_super_admin() OR (fn_club_de_inscripcion(inscripcion_id) = fn_get_user_club_id())));

DROP POLICY IF EXISTS resultados_delete ON public.resultados;
CREATE POLICY resultados_delete ON public.resultados FOR DELETE TO authenticated
  USING ((fn_is_super_admin() OR (fn_club_de_carrera(carrera_id) = fn_get_user_club_id())));
DROP POLICY IF EXISTS resultados_insert ON public.resultados;
CREATE POLICY resultados_insert ON public.resultados FOR INSERT TO authenticated
  WITH CHECK ((fn_is_super_admin() OR (fn_club_de_carrera(carrera_id) = fn_get_user_club_id())));
DROP POLICY IF EXISTS resultados_update ON public.resultados;
CREATE POLICY resultados_update ON public.resultados FOR UPDATE TO authenticated
  USING ((fn_is_super_admin() OR (fn_club_de_carrera(carrera_id) = fn_get_user_club_id())))
  WITH CHECK ((fn_is_super_admin() OR (fn_club_de_carrera(carrera_id) = fn_get_user_club_id())));

DROP POLICY IF EXISTS reuniones_delete ON public.reuniones;
CREATE POLICY reuniones_delete ON public.reuniones FOR DELETE TO authenticated
  USING ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())));
DROP POLICY IF EXISTS reuniones_insert ON public.reuniones;
CREATE POLICY reuniones_insert ON public.reuniones FOR INSERT TO authenticated
  WITH CHECK ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())));
DROP POLICY IF EXISTS reuniones_update ON public.reuniones;
CREATE POLICY reuniones_update ON public.reuniones FOR UPDATE TO authenticated
  USING ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())))
  WITH CHECK ((fn_is_super_admin() OR (club_id = fn_get_user_club_id())));

COMMIT;

-- ===========================================================================
-- VERIFICACIÓN — esperado: 0 policies de escritura con fn_is_portal_user
-- ===========================================================================
-- SELECT count(*) FROM pg_policies
--  WHERE schemaname='public' AND cmd IN ('INSERT','UPDATE','DELETE')
--    AND (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%fn_is_portal_user%';
