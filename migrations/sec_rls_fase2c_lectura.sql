-- ===========================================================================
-- SEC_RLS FASE 2c — Lectura de plata acotada + usuarios sólo-su-fila
-- ===========================================================================
-- PORTAL_V2_PLAN §D.3 pasos 4 y 5. Cierra:
--
--   D-H2  liquidaciones / liquidacion_detalle / recibos → una cuenta de portal
--         leía los premios de TODOS los propietarios y profesionales del club,
--         más los recibos con nombre y documento de quien cobró. Sin suplantar
--         a nadie: alcanzaba con tener cuenta.
--   D-H8  usuarios → enumeración de email, nombre, teléfono y rol de todo el
--         club.
--
-- ROLLBACK: migrations/sec_rls_fase2c_rollback.sql (commiteado antes).
--
-- ---------------------------------------------------------------------------
-- FORMA DE LAS POLICIES DE PLATA
-- ---------------------------------------------------------------------------
--   super_admin                                        → todo
--   secretaría (fn_is_staff) con club coincidente      → todo lo del club
--   portal                                             → SÓLO donde es
--                                                        beneficiario
--
-- Se usa fn_is_staff() y no NOT fn_is_portal_user() por lo mismo que en 2a:
-- la forma negada concede acceso de secretaría a cualquier autenticado sin
-- fila en `usuarios`.
--
-- ---------------------------------------------------------------------------
-- recibos: se parte la policy FOR ALL
-- ---------------------------------------------------------------------------
-- `recibos_rls` era una sola policy FOR ALL que mezclaba lectura y escritura,
-- por eso quedó fuera del grupo 2b. Acá se reemplaza por cuatro policies por
-- comando: la de SELECT deja ver al beneficiario, las de escritura son sólo
-- secretaría.
--
-- ---------------------------------------------------------------------------
-- EL AGUJERO QUE HABRÍA ABIERTO usuarios_update — leer esto
-- ---------------------------------------------------------------------------
-- `usuarios_update` permite a cualquiera editar SU PROPIA fila, y RLS no tiene
-- granularidad de columna. Con la identidad del portal resuelta por
-- `usuarios.entidad_id` (introducida en 2a), una cuenta de portal podría
-- reapuntar su propio entidad_id a la ficha de otro propietario y quedar
-- suplantándolo — peor que el D-H1 original, porque no necesitaría tocar la
-- fila de la víctima.
--
-- No se puede cerrar restringiendo la policy a super_admin: `reset-password.html`
-- actualiza `activo`/`estado` de la fila propia y dejaría de funcionar.
--
-- Se cierra con un trigger que rechaza cambios en las columnas de privilegio
-- (rol, club_id, entidad_tipo, entidad_id, auth_user_id) salvo super_admin.
-- El resto de la fila sigue siendo editable por su dueño.
--
-- El trigger deja pasar a `service_role` (auth.uid() IS NULL): esa key ya
-- bypasea RLS por completo, así que bloquearla no agregaría seguridad y
-- rompería los scripts de administración y los probes.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Guarda de privilegios sobre usuarios
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_usuarios_guard_privilegios()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- service_role / server-side: ya bypasea RLS, no tiene sentido frenarlo acá
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF fn_is_super_admin() THEN RETURN NEW; END IF;

  IF NEW.rol          IS DISTINCT FROM OLD.rol
  OR NEW.club_id      IS DISTINCT FROM OLD.club_id
  OR NEW.entidad_tipo IS DISTINCT FROM OLD.entidad_tipo
  OR NEW.entidad_id   IS DISTINCT FROM OLD.entidad_id
  OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION
      'No autorizado: sólo un super_admin puede cambiar rol, club, entidad o vínculo de Auth';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_usuarios_guard_privilegios ON public.usuarios;
CREATE TRIGGER trg_usuarios_guard_privilegios
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.fn_usuarios_guard_privilegios();

-- ---------------------------------------------------------------------------
-- liquidaciones — D-H2
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS liquidaciones_select ON public.liquidaciones;
CREATE POLICY liquidaciones_select ON public.liquidaciones FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_super_admin())
    OR ((SELECT fn_is_staff()) AND club_id = (SELECT fn_get_user_club_id()))
    OR propietario_id IN (SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'propietario')
    OR profesional_id IN (SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'profesional')
  );

-- ---------------------------------------------------------------------------
-- liquidacion_detalle — D-H2
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS liquidacion_detalle_select ON public.liquidacion_detalle;
CREATE POLICY liquidacion_detalle_select ON public.liquidacion_detalle FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_super_admin())
    OR ((SELECT fn_is_staff()) AND fn_club_de_liquidacion(liquidacion_id) = (SELECT fn_get_user_club_id()))
    OR (beneficiario_tipo::text, beneficiario_id)
         IN (SELECT e.entidad_tipo, e.entidad_id FROM fn_mis_entidades() e)
  );

-- ---------------------------------------------------------------------------
-- recibos — D-H2. Se parte la policy FOR ALL en cuatro.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS recibos_rls ON public.recibos;

CREATE POLICY recibos_select ON public.recibos FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_super_admin())
    OR ((SELECT fn_is_staff()) AND club_id = (SELECT fn_get_user_club_id()))
    OR propietario_id IN (SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'propietario')
    OR profesional_id IN (SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'profesional')
  );

CREATE POLICY recibos_insert ON public.recibos FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))));

CREATE POLICY recibos_update ON public.recibos FOR UPDATE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))))
  WITH CHECK (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))));

CREATE POLICY recibos_delete ON public.recibos FOR DELETE TO authenticated
  USING (NOT (SELECT fn_is_portal_user()) AND ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))));

-- ---------------------------------------------------------------------------
-- usuarios — D-H8 + eliminación de la rama por email
-- ---------------------------------------------------------------------------
-- La rama `email = auth.jwt()->>'email'` se reemplaza por `auth_user_id =
-- auth.uid()`. Es el residual que la FASE 1 dejó explícitamente anotado: esa
-- fase cambió las FUNCIONES, no estas dos policies.
DROP POLICY IF EXISTS usuarios_select ON public.usuarios;
CREATE POLICY usuarios_select ON public.usuarios FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_super_admin())
    OR auth_user_id = (SELECT auth.uid())
    OR ((SELECT fn_is_staff()) AND club_id = (SELECT fn_get_user_club_id()))
  );

DROP POLICY IF EXISTS usuarios_update ON public.usuarios;
CREATE POLICY usuarios_update ON public.usuarios FOR UPDATE TO authenticated
  USING ((SELECT fn_is_super_admin()) OR auth_user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT fn_is_super_admin()) OR auth_user_id = (SELECT auth.uid()));

COMMIT;

-- ===========================================================================
-- VERIFICACIÓN
-- ===========================================================================
-- Esperado: recibos con 4 policies; ninguna policy de usuarios con auth.jwt.
--
-- SELECT tablename, policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename IN ('recibos','usuarios') ORDER BY 1,3;
--
-- SELECT count(*) AS usuarios_por_email FROM pg_policies
--  WHERE schemaname='public' AND tablename='usuarios'
--    AND (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%auth.jwt%';   -- → 0
--
-- Y después, SIEMPRE y en este orden:
--   node tests/probe_rls_secretaria.mjs   → 18/18, si no: ROLLBACK sin preguntar
--   node tests/probe_rls_portal.mjs       → asserts 1, 2 y 9 pasan a verde
--                                           (1-10 completos)
