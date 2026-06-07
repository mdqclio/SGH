-- ============================================================
-- SECURITY HARDENING — FASE 2: hardening reversible
-- Rama: fix/security-hardening   Fecha: 2026-06-07
-- ============================================================
-- (a) Vistas SECURITY DEFINER → security_invoker=true (4 vistas; advisor ERROR)
-- (b) search_path=public en 6 funciones (advisor function_search_path_mutable)
-- (c) Grants RPC: sacar EXECUTE de PUBLIC/anon donde no corresponde
-- (d) Bucket chaquetillas: SELECT solo authenticated (cortar listado anon;
--     URLs directas siguen porque el bucket es público — endpoint público sin RLS)
-- NO se recrea ninguna función (ALTER only) — evita el gotcha de overloads de aplicar_resultado.
-- NO se tocan helpers de RLS fn_club_de_* / fn_is_super_admin / fn_get_user_club_id (GOTCHA #26).
-- ============================================================

-- ---------- (a) Vistas a security_invoker ----------
ALTER VIEW public.v_spcs_activos        SET (security_invoker = true);
ALTER VIEW public.v_programa_reunion    SET (security_invoker = true);
ALTER VIEW public.v_inscriptos_carrera  SET (security_invoker = true);
ALTER VIEW public.v_sanciones_vigentes  SET (security_invoker = true);

-- ---------- (b) search_path = public ----------
ALTER FUNCTION public.calcular_premio(numeric, jsonb, integer)            SET search_path = public;
ALTER FUNCTION public.validar_inscripcion(uuid, uuid)                     SET search_path = public;
ALTER FUNCTION public.set_updated_at()                                    SET search_path = public;
ALTER FUNCTION public.fn_purgar_auditoria()                               SET search_path = public;
ALTER FUNCTION public.fn_proteger_rol_club_id_usuario()                   SET search_path = public;
ALTER FUNCTION public.aplicar_resultado(
    uuid, timestamptz, uuid, text, text, text, text, integer, jsonb, jsonb, jsonb
) SET search_path = public;

-- ---------- (c) Grants RPC ----------
-- Nota: el EXECUTE por defecto se otorga a PUBLIC, por eso hay que revocar de PUBLIC
-- (revocar solo de anon sería no-op: anon hereda vía PUBLIC).

-- aplicar_resultado: la app lo llama como authenticated (F10 en resultados.html). anon fuera.
REVOKE EXECUTE ON FUNCTION public.aplicar_resultado(
    uuid, timestamptz, uuid, text, text, text, text, integer, jsonb, jsonb, jsonb
) FROM PUBLIC, anon;

-- fn_siguiente_recibo: numeración de recibos, app authenticated. anon fuera.
REVOKE EXECUTE ON FUNCTION public.fn_siguiente_recibo(uuid) FROM PUBLIC, anon;

-- fn_purgar_auditoria: tarea de mantenimiento → solo service_role (secret key / edge fn / cron).
REVOKE EXECUTE ON FUNCTION public.fn_purgar_auditoria() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_purgar_auditoria() TO service_role;

-- fn_auditoria_log: trigger function; los triggers disparan sin EXECUTE explícito.
-- No debe ser invocable por RPC desde ningún rol de cliente.
REVOKE EXECUTE ON FUNCTION public.fn_auditoria_log() FROM PUBLIC, anon, authenticated;

-- ---------- (d) Bucket chaquetillas: cortar listado anónimo ----------
-- El bucket es público: las URLs directas (/storage/v1/object/public/chaquetillas/...)
-- se sirven sin pasar por RLS, así que las imágenes siguen cargando.
-- Solo se restringe la operación list()/select (que el advisor marca como "allows listing").
DROP POLICY IF EXISTS "chaquetillas_public_read" ON storage.objects;

CREATE POLICY "chaquetillas_auth_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chaquetillas');
