-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- GENERADO por tests/local/gen_revoke_anon_funciones.py — no editar a mano: cambiar la lista y regenerar.
-- ROLLBACK de revoke_anon_funciones_publicas.sql — deja el ACL de cada una de las 31 EXACTO como estaba en prod
-- el 2026-10-02 (proacl medido) y los default privileges de postgres como antes (sin entrada global; la de
-- esquema con anon). Verificar después: proacl de las 31 = el de la lista del generador COMO CONJUNTO (el GRANT
-- puede dejar las entradas en otro orden: `{postgres=X/postgres,=X/postgres,…}` es el mismo permiso).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;
REVOKE ALL ON FUNCTION public.calcular_premio(numeric, jsonb, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calcular_premio(numeric, jsonb, integer) TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_autor_fila() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_autor_fila() TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_club_de_caballeriza(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_club_de_caballeriza(uuid) TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_club_de_carrera(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_club_de_carrera(uuid) TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_club_de_inscripcion(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_club_de_inscripcion(uuid) TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_club_de_liquidacion(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_club_de_liquidacion(uuid) TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_club_de_resolucion(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_club_de_resolucion(uuid) TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_club_de_resultado(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_club_de_resultado(uuid) TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_club_de_reunion(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_club_de_reunion(uuid) TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_edad_reglamentaria(date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_edad_reglamentaria(date, date) TO anon, authenticated, service_role;   -- {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_get_user_club_id() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_get_user_club_id() TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_is_portal_user() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_is_portal_user() TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_is_staff() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_is_staff() TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_is_super_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_is_super_admin() TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_mis_entidades() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_mis_entidades() TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_mis_spc_ids() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_mis_spc_ids() TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_mis_spc_visibles() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_mis_spc_visibles() TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_proteger_rol_club_id_usuario() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_proteger_rol_club_id_usuario() TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_solicitudes_guard_staff(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_solicitudes_guard_staff(uuid) TO anon, authenticated, service_role;   -- {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_usuarios_guard_privilegios() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_usuarios_guard_privilegios() TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.fn_usuarios_set_auth_user_id() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_usuarios_set_auth_user_id() TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.rpc_aprobar_solicitud(uuid, text, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_aprobar_solicitud(uuid, text, uuid, boolean) TO anon, authenticated, service_role;   -- {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.rpc_descartar_solicitud(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_descartar_solicitud(uuid) TO anon, authenticated, service_role;   -- {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.rpc_inscribir(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_inscribir(uuid, uuid, uuid, uuid, uuid, uuid) TO anon, authenticated, service_role;   -- {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.rpc_padron_profesionales() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_padron_profesionales() TO anon, authenticated, service_role;   -- {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.rpc_padron_spcs() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_padron_spcs() TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.rpc_rechazar_solicitud(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_rechazar_solicitud(uuid, text) TO anon, authenticated, service_role;   -- {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.rpc_solicitar_acceso(text, text, text, text, text, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_solicitar_acceso(text, text, text, text, text, uuid, text, text, text, text, text) TO anon, authenticated, service_role;   -- {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.siguiente_numero_publico(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.siguiente_numero_publico(uuid, date) TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
REVOKE ALL ON FUNCTION public.validar_inscripcion(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validar_inscripcion(uuid, uuid) TO PUBLIC, anon, authenticated, service_role;   -- {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;   -- borra la entrada global (vuelve al default de Postgres)

COMMIT;
