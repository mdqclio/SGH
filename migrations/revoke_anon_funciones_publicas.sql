-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- GENERADO por tests/local/gen_revoke_anon_funciones.py — no editar a mano: cambiar la lista y regenerar.
-- SEGURIDAD ISSUE-099 — las 31 funciones de `public` que `anon` podía ejecutar + ALTER DEFAULT PRIVILEGES
--
-- Fase 1 (relevamiento, sólo lectura): docs/diagnosticos/2026-10-02_issue-099-funciones-anon-y-v-inscriptos-fase1.md (reports).
-- Llamadas legítimas como anon: 0 (código, políticas, Edge Functions, pg_stat_statements).
--
--   A) 25 → REVOKE de PUBLIC y anon; GRANT explícito a authenticated y service_role (no dependen de PUBLIC).
--   B)  6 → sólo service_role (+ dueño): fn_solicitudes_guard_staff (la llaman 3 RPC definer, como dueño) y los 5
--       de trigger. Postgres chequea EXECUTE de la función de trigger al CREAR el trigger, no al dispararlo
--       (probado en el sandbox: tests/probe_revoke_anon_funciones.mjs, caso T).
--   C) para que no se repita:
--      C1  default de esquema (postgres, public): sin anon  → las funciones nuevas nacen sin EXECUTE para anon.
--      C2  default GLOBAL de postgres: sin PUBLIC          → y sin EXECUTE para PUBLIC (el default de Postgres
--          lo da a PUBLIC en TODO esquema; no se puede quitar con IN SCHEMA). authenticated y service_role lo
--          siguen recibiendo por el default de esquema.
--      No toca los defaults de supabase_admin (los administra la plataforma) ni los de tablas/secuencias.
--
-- No cambia ningún pg_get_functiondef (un GRANT/REVOKE no toca la definición): el probe compara el md5 de las 31
-- antes y después. Rollback: migrations/rollback_revoke_anon_funciones_publicas.sql (ACL exacto anterior).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- A) 25 → authenticated + service_role
REVOKE EXECUTE ON FUNCTION public.calcular_premio(numeric, jsonb, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.calcular_premio(numeric, jsonb, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_club_de_caballeriza(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_club_de_caballeriza(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_club_de_carrera(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_club_de_carrera(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_club_de_inscripcion(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_club_de_inscripcion(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_club_de_liquidacion(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_club_de_liquidacion(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_club_de_resolucion(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_club_de_resolucion(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_club_de_resultado(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_club_de_resultado(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_club_de_reunion(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_club_de_reunion(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_edad_reglamentaria(date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_edad_reglamentaria(date, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_get_user_club_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_get_user_club_id() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_is_portal_user() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_is_portal_user() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_is_staff() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_is_staff() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_is_super_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_is_super_admin() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_mis_entidades() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_mis_entidades() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_mis_spc_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_mis_spc_ids() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_mis_spc_visibles() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_mis_spc_visibles() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_aprobar_solicitud(uuid, text, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_aprobar_solicitud(uuid, text, uuid, boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_descartar_solicitud(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_descartar_solicitud(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_inscribir(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_inscribir(uuid, uuid, uuid, uuid, uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_padron_profesionales() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_padron_profesionales() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_padron_spcs() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_padron_spcs() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_rechazar_solicitud(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_rechazar_solicitud(uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_solicitar_acceso(text, text, text, text, text, uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_solicitar_acceso(text, text, text, text, text, uuid, text, text, text, text, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.siguiente_numero_publico(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.siguiente_numero_publico(uuid, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.validar_inscripcion(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.validar_inscripcion(uuid, uuid) TO authenticated, service_role;

-- B) 6 → sólo service_role (+ dueño)
REVOKE EXECUTE ON FUNCTION public.fn_autor_fila() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_autor_fila() TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_proteger_rol_club_id_usuario() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_proteger_rol_club_id_usuario() TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_solicitudes_guard_staff(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_solicitudes_guard_staff(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_usuarios_guard_privilegios() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_usuarios_guard_privilegios() TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_usuarios_set_auth_user_id() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_usuarios_set_auth_user_id() TO service_role;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

-- C) default privileges de postgres
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;   -- C1
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;                  -- C2

COMMIT;
