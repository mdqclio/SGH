-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SÓLO SANDBOX (tests/local) — NUNCA APLICAR EN PROD.
-- Réplica de lo que protege `usuarios` en prod al 2026-09-27: RLS + las 4 políticas, los dos
-- triggers de privilegios (rol/club/entidad/auth_user_id sólo super_admin) y el CHECK de estado.
-- Copiado de pg_policy / pg_get_functiondef / pg_get_constraintdef de prod (informe
-- docs/diagnosticos/2026-09-27_usuarios-roles-portal-escalada.md, reports). No replica
-- trg_audit_usuarios (el sandbox no tiene auditoria) ni trg_usuarios_set_auth_user_id (no hay auth.users).
--   tests/local/up.sh sql < tests/local/usuarios_sandbox.sql        (idempotente)
-- Lo usa tests/probe_usuarios_pantalla.mjs.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_estado_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_estado_check CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'activo'::character varying, 'rechazado'::character varying, 'suspendido'::character varying])::text[])));

CREATE OR REPLACE FUNCTION public.fn_proteger_rol_club_id_usuario()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT fn_is_super_admin() THEN
    IF NEW.rol IS DISTINCT FROM OLD.rol THEN
      RAISE EXCEPTION 'Solo super_admin puede cambiar el rol de un usuario';
    END IF;
    IF NEW.club_id IS DISTINCT FROM OLD.club_id THEN
      RAISE EXCEPTION 'Solo super_admin puede cambiar el club de un usuario';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_usuarios_guard_privilegios()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF fn_is_super_admin() THEN RETURN NEW; END IF;

  IF NEW.rol          IS DISTINCT FROM OLD.rol
  OR NEW.club_id      IS DISTINCT FROM OLD.club_id
  OR NEW.entidad_tipo IS DISTINCT FROM OLD.entidad_tipo
  OR NEW.entidad_id   IS DISTINCT FROM OLD.entidad_id
  OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION
      'No autorizado: solo un super_admin puede cambiar rol, club, entidad o vinculo de Auth';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_proteger_rol_club_id_usuario ON public.usuarios;
CREATE TRIGGER trg_proteger_rol_club_id_usuario BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_proteger_rol_club_id_usuario();
DROP TRIGGER IF EXISTS trg_usuarios_guard_privilegios ON public.usuarios;
CREATE TRIGGER trg_usuarios_guard_privilegios BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_usuarios_guard_privilegios();

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios TO authenticated, anon;

DROP POLICY IF EXISTS usuarios_delete ON public.usuarios;
CREATE POLICY usuarios_delete ON public.usuarios AS PERMISSIVE FOR DELETE TO authenticated
  USING (( SELECT fn_is_super_admin() AS fn_is_super_admin));
DROP POLICY IF EXISTS usuarios_insert ON public.usuarios;
CREATE POLICY usuarios_insert ON public.usuarios AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (( SELECT fn_is_super_admin() AS fn_is_super_admin));
DROP POLICY IF EXISTS usuarios_select ON public.usuarios;
CREATE POLICY usuarios_select ON public.usuarios AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (auth_user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));
DROP POLICY IF EXISTS usuarios_update ON public.usuarios;
CREATE POLICY usuarios_update ON public.usuarios AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (auth_user_id = ( SELECT auth.uid() AS uid))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (auth_user_id = ( SELECT auth.uid() AS uid))));
