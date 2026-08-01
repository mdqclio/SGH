-- ===========================================================================
-- SEC_RLS FASE 2b — Escritura de portal bloqueada en tablas operativas
-- ===========================================================================
-- PORTAL_V2_PLAN §D.3 paso 3. Cierra D-H5, D-H6 y D-H7:
--
--   D-H5  inscripciones → poner en forfait / borrar la inscripción de un rival
--   D-H6  reuniones, carreras → borrar una reunión entera (assert 7 de
--         probe_rls_portal: la reunión fixture FUE borrada por una cuenta de
--         portal)
--   D-H7  resultados, resultado_posiciones → alterar el orden de llegada
--
-- Más liquidaciones, liquidacion_detalle, caballerizas y apoderados por el
-- mismo criterio. `recibos` NO está acá: tiene una sola policy FOR ALL que
-- mezcla lectura y escritura, y se reescribe entera en el grupo 2c.
--
-- ROLLBACK: migrations/sec_rls_fase2b_rollback.sql (commiteado antes).
--
-- ---------------------------------------------------------------------------
-- LA TRANSFORMACIÓN
-- ---------------------------------------------------------------------------
--   antes:  (fn_is_super_admin() OR (X = fn_get_user_club_id()))
--   después: (NOT (SELECT fn_is_portal_user())
--             AND ((SELECT fn_is_super_admin()) OR (X = (SELECT fn_get_user_club_id()))))
--
-- Acá SÍ se usa la forma negada `NOT fn_is_portal_user()` —a diferencia del
-- grupo 2a, donde se prefirió la afirmativa fn_is_staff()— y la razón es que
-- la condición de club ya cierra el caso del usuario desconocido: sin fila en
-- `usuarios`, fn_get_user_club_id() devuelve NULL, `X = NULL` es NULL, y la
-- policy no concede. O sea: acá el NOT no puede fallar abierto.
--
-- REQUISITO DEL GATE: `NOT fn_is_portal_user()` no debe cambiar el resultado
-- para la secretaría. No lo cambia — para un rol de secretaría la función da
-- false y el AND queda neutro. Se verifica con probe_rls_secretaria (S3 hace
-- un UPDATE real sobre inscripciones y comprueba que persistió).
--
-- Las llamadas van envueltas en (SELECT fn()) para InitPlan (R2a / FASE 3).
-- Las fn_club_de_*(col) NO se envuelven: toman una columna de la fila, son
-- correlacionadas por definición y el wrap no produciría InitPlan.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- inscripciones — D-H5
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS inscripciones_insert ON public.inscripciones;
CREATE POLICY inscripciones_insert ON public.inscripciones FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_carrera(carrera_id) = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS inscripciones_update ON public.inscripciones;
CREATE POLICY inscripciones_update ON public.inscripciones FOR UPDATE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_carrera(carrera_id) = (SELECT fn_get_user_club_id()))))
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_carrera(carrera_id) = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS inscripciones_delete ON public.inscripciones;
CREATE POLICY inscripciones_delete ON public.inscripciones FOR DELETE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_carrera(carrera_id) = (SELECT fn_get_user_club_id()))));

-- ---------------------------------------------------------------------------
-- reuniones — D-H6
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS reuniones_insert ON public.reuniones;
CREATE POLICY reuniones_insert ON public.reuniones FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS reuniones_update ON public.reuniones;
CREATE POLICY reuniones_update ON public.reuniones FOR UPDATE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))))
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS reuniones_delete ON public.reuniones;
CREATE POLICY reuniones_delete ON public.reuniones FOR DELETE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))));

-- ---------------------------------------------------------------------------
-- carreras — D-H6
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS carreras_insert ON public.carreras;
CREATE POLICY carreras_insert ON public.carreras FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_reunion(reunion_id) = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS carreras_update ON public.carreras;
CREATE POLICY carreras_update ON public.carreras FOR UPDATE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_reunion(reunion_id) = (SELECT fn_get_user_club_id()))))
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_reunion(reunion_id) = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS carreras_delete ON public.carreras;
CREATE POLICY carreras_delete ON public.carreras FOR DELETE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_reunion(reunion_id) = (SELECT fn_get_user_club_id()))));

-- ---------------------------------------------------------------------------
-- resultados — D-H7
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS resultados_insert ON public.resultados;
CREATE POLICY resultados_insert ON public.resultados FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_carrera(carrera_id) = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS resultados_update ON public.resultados;
CREATE POLICY resultados_update ON public.resultados FOR UPDATE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_carrera(carrera_id) = (SELECT fn_get_user_club_id()))))
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_carrera(carrera_id) = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS resultados_delete ON public.resultados;
CREATE POLICY resultados_delete ON public.resultados FOR DELETE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_carrera(carrera_id) = (SELECT fn_get_user_club_id()))));

-- ---------------------------------------------------------------------------
-- resultado_posiciones — D-H7
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS resultado_posiciones_insert ON public.resultado_posiciones;
CREATE POLICY resultado_posiciones_insert ON public.resultado_posiciones FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_inscripcion(inscripcion_id) = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS resultado_posiciones_update ON public.resultado_posiciones;
CREATE POLICY resultado_posiciones_update ON public.resultado_posiciones FOR UPDATE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_inscripcion(inscripcion_id) = (SELECT fn_get_user_club_id()))))
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_inscripcion(inscripcion_id) = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS resultado_posiciones_delete ON public.resultado_posiciones;
CREATE POLICY resultado_posiciones_delete ON public.resultado_posiciones FOR DELETE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_inscripcion(inscripcion_id) = (SELECT fn_get_user_club_id()))));

-- ---------------------------------------------------------------------------
-- liquidaciones
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS liquidaciones_insert ON public.liquidaciones;
CREATE POLICY liquidaciones_insert ON public.liquidaciones FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS liquidaciones_update ON public.liquidaciones;
CREATE POLICY liquidaciones_update ON public.liquidaciones FOR UPDATE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))))
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS liquidaciones_delete ON public.liquidaciones;
CREATE POLICY liquidaciones_delete ON public.liquidaciones FOR DELETE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))));

-- ---------------------------------------------------------------------------
-- liquidacion_detalle
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS liquidacion_detalle_insert ON public.liquidacion_detalle;
CREATE POLICY liquidacion_detalle_insert ON public.liquidacion_detalle FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_liquidacion(liquidacion_id) = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS liquidacion_detalle_update ON public.liquidacion_detalle;
CREATE POLICY liquidacion_detalle_update ON public.liquidacion_detalle FOR UPDATE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_liquidacion(liquidacion_id) = (SELECT fn_get_user_club_id()))))
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_liquidacion(liquidacion_id) = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS liquidacion_detalle_delete ON public.liquidacion_detalle;
CREATE POLICY liquidacion_detalle_delete ON public.liquidacion_detalle FOR DELETE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (fn_club_de_liquidacion(liquidacion_id) = (SELECT fn_get_user_club_id()))));

-- ---------------------------------------------------------------------------
-- caballerizas
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS caballerizas_insert ON public.caballerizas;
CREATE POLICY caballerizas_insert ON public.caballerizas FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS caballerizas_update ON public.caballerizas;
CREATE POLICY caballerizas_update ON public.caballerizas FOR UPDATE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))))
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS caballerizas_delete ON public.caballerizas;
CREATE POLICY caballerizas_delete ON public.caballerizas FOR DELETE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))));

-- ---------------------------------------------------------------------------
-- apoderados
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS apoderados_insert ON public.apoderados;
CREATE POLICY apoderados_insert ON public.apoderados FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS apoderados_update ON public.apoderados;
CREATE POLICY apoderados_update ON public.apoderados FOR UPDATE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))))
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))));
DROP POLICY IF EXISTS apoderados_delete ON public.apoderados;
CREATE POLICY apoderados_delete ON public.apoderados FOR DELETE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))));

COMMIT;

-- ===========================================================================
-- VERIFICACIÓN — esperado: 27 policies de escritura con fn_is_portal_user
-- ===========================================================================
-- SELECT count(*) FROM pg_policies
--  WHERE schemaname='public' AND cmd IN ('INSERT','UPDATE','DELETE')
--    AND (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%fn_is_portal_user%';
--
-- Y después, SIEMPRE y en este orden:
--   node tests/probe_rls_secretaria.mjs   → 18/18, si no: ROLLBACK sin preguntar
--   node tests/probe_rls_portal.mjs       → asserts 6, 7, 8 pasan a verde
