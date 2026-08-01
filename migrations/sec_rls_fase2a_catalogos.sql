-- ===========================================================================
-- SEC_RLS FASE 2a — Cierre de los cuatro USING (true)
-- ===========================================================================
-- PORTAL_V2_PLAN §D.3 paso 2. Cierra los huecos D-H1, D-H3 y D-H4:
--
--   D-H1  propietarios / profesionales  → volcado de PII + vector de
--         suplantación (assert 3 de probe_rls_portal: una cuenta de portal
--         reescribió el email de otra persona)
--   D-H3  spcs   → Stud Book global escribible por cualquier autenticado
--   D-H4  spc_propietarios → reclamar la propiedad de un caballo ajeno
--
-- ROLLBACK: migrations/sec_rls_fase2a_rollback.sql (commiteado antes).
--
-- ---------------------------------------------------------------------------
-- DESVÍO RESPECTO DEL PLAN, deliberado: `fn_is_staff()` en vez de
-- `NOT fn_is_portal_user()`
-- ---------------------------------------------------------------------------
-- El plan pedía `NOT fn_is_portal_user()`. Esa forma falla ABIERTA: para un
-- usuario autenticado SIN fila en `usuarios`, fn_is_portal_user() devuelve
-- false y el NOT lo convierte en acceso total de secretaría.
--
-- No es hipotético: hoy `auth.users` tiene 5 filas y `public.usuarios` 3. Las
-- dos huérfanas (sanfrancisco@sgh.com, clio@mdq.com.ar) caerían justo en ese
-- caso.
--
-- `fn_is_staff()` es la forma afirmativa: exige fila en `usuarios`, activa, con
-- rol de secretaría. Da el MISMO resultado para la secretaría real —requisito
-- explícito del gate— y falla CERRADA para todo lo demás.
--
-- fn_is_portal_user() se define igual porque los grupos 2b/2c la usan y el plan
-- la nombra.
--
-- ---------------------------------------------------------------------------
-- fn_mis_entidades() — implementación mínima, forward-compatible
-- ---------------------------------------------------------------------------
-- El plan la define sobre `usuario_entidades`, tabla que todavía no existe
-- (es FASE 2 del PORTAL_V2_PLAN, otra pasada). Acá se implementa sobre
-- `usuarios.entidad_tipo` / `entidad_id`, que YA existen en el schema.
--
-- Diferencia: hoy devuelve 0..1 filas por cuenta; con `usuario_entidades`
-- devolverá 0..N. La FIRMA no cambia, así que las policies de esta migración
-- no hay que tocarlas cuando llegue la tabla — sólo el cuerpo de la función.
--
-- ---------------------------------------------------------------------------
-- Todas las llamadas van envueltas en (SELECT fn()) desde el vamos: nacen
-- optimizadas para InitPlan (R2a / FASE 3), y la migración R2a es idempotente
-- así que no las va a re-envolver.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Funciones de autorización
-- ---------------------------------------------------------------------------
-- STABLE + SECURITY DEFINER + search_path fijo.
-- GOTCHA #10: sin SECURITY DEFINER, una policy que consulte `usuarios` entra
-- en recursión infinita al evaluar la policy de `usuarios`.

CREATE OR REPLACE FUNCTION public.fn_is_staff()
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE auth_user_id = auth.uid()
      AND activo
      AND rol IN ('super_admin', 'secretario_carreras', 'operador')
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_is_portal_user()
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE auth_user_id = auth.uid()
      AND activo
      AND rol IN ('propietario', 'profesional')
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_mis_entidades()
 RETURNS TABLE (entidad_tipo text, entidad_id uuid)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT u.entidad_tipo::text, u.entidad_id
  FROM usuarios u
  WHERE u.auth_user_id = auth.uid()
    AND u.activo
    AND u.entidad_tipo IS NOT NULL
    AND u.entidad_id IS NOT NULL;
$function$;

-- Los SPCs alcanzables por la cuenta: por tenencia de entrenador o por
-- propiedad activa. SECURITY DEFINER ⇒ corre como owner ⇒ no re-evalúa las
-- policies de spcs / spc_propietarios (relforcerowsecurity = false en ambas),
-- así que no hay recursión.
CREATE OR REPLACE FUNCTION public.fn_mis_spc_ids()
 RETURNS TABLE (spc_id uuid)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT s.id FROM spcs s
   WHERE s.entrenador_id IN (
     SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'profesional')
  UNION
  SELECT sp.spc_id FROM spc_propietarios sp
   WHERE sp.activo
     AND sp.propietario_id IN (
       SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'propietario');
$function$;

-- ---------------------------------------------------------------------------
-- spcs — D-H3
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS spcs_select ON public.spcs;
CREATE POLICY spcs_select ON public.spcs FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_staff())
    OR id IN (SELECT s.spc_id FROM fn_mis_spc_ids() s)
  );

DROP POLICY IF EXISTS spcs_insert ON public.spcs;
CREATE POLICY spcs_insert ON public.spcs FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_staff()));

DROP POLICY IF EXISTS spcs_update ON public.spcs;
CREATE POLICY spcs_update ON public.spcs FOR UPDATE TO authenticated
  USING ((SELECT fn_is_staff()))
  WITH CHECK ((SELECT fn_is_staff()));

-- spcs_delete queda igual: sólo super_admin.

-- ---------------------------------------------------------------------------
-- propietarios — D-H1
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS propietarios_select ON public.propietarios;
CREATE POLICY propietarios_select ON public.propietarios FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_staff())
    OR id IN (SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'propietario')
  );

DROP POLICY IF EXISTS propietarios_insert ON public.propietarios;
CREATE POLICY propietarios_insert ON public.propietarios FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_staff()));

DROP POLICY IF EXISTS propietarios_update ON public.propietarios;
CREATE POLICY propietarios_update ON public.propietarios FOR UPDATE TO authenticated
  USING ((SELECT fn_is_staff()))
  WITH CHECK ((SELECT fn_is_staff()));

-- ---------------------------------------------------------------------------
-- profesionales — D-H1
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profesionales_select ON public.profesionales;
CREATE POLICY profesionales_select ON public.profesionales FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_staff())
    OR id IN (SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'profesional')
  );

DROP POLICY IF EXISTS profesionales_insert ON public.profesionales;
CREATE POLICY profesionales_insert ON public.profesionales FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_staff()));

DROP POLICY IF EXISTS profesionales_update ON public.profesionales;
CREATE POLICY profesionales_update ON public.profesionales FOR UPDATE TO authenticated
  USING ((SELECT fn_is_staff()))
  WITH CHECK ((SELECT fn_is_staff()));

-- ---------------------------------------------------------------------------
-- spc_propietarios — D-H4
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS spc_propietarios_select ON public.spc_propietarios;
CREATE POLICY spc_propietarios_select ON public.spc_propietarios FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_staff())
    OR spc_id IN (SELECT s.spc_id FROM fn_mis_spc_ids() s)
  );

DROP POLICY IF EXISTS spc_propietarios_insert ON public.spc_propietarios;
CREATE POLICY spc_propietarios_insert ON public.spc_propietarios FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_staff()));

DROP POLICY IF EXISTS spc_propietarios_update ON public.spc_propietarios;
CREATE POLICY spc_propietarios_update ON public.spc_propietarios FOR UPDATE TO authenticated
  USING ((SELECT fn_is_staff()))
  WITH CHECK ((SELECT fn_is_staff()));

COMMIT;

-- ===========================================================================
-- VERIFICACIÓN
-- ===========================================================================
-- Esperado: 0 policies con USING/WITH CHECK = true en estas cuatro tablas.
--
-- SELECT count(*) AS permisivas FROM pg_policies
--  WHERE schemaname='public'
--    AND tablename IN ('spcs','propietarios','profesionales','spc_propietarios')
--    AND (qual = 'true' OR with_check = 'true');
--
-- Y después, SIEMPRE y en este orden:
--   node tests/probe_rls_secretaria.mjs   → 18/18, si no: ROLLBACK
--   node tests/probe_rls_portal.mjs       → asserts 3, 4, 5 deben pasar a verde
--
-- RESIDUAL CONOCIDO: la secretaría sigue leyendo TODOS los propietarios,
-- profesionales y SPCs, sin filtro por club. `spcs` no tiene club_id (son
-- globales por diseño) y acotar propietarios/profesionales por club puede
-- romper consultas con club_id NULL. Se deja como está a propósito: el modelo
-- de amenaza de esta pasada es la cuenta de portal, no el personal de
-- secretaría. Acotar por club merece su propia pasada con su propio canario.
