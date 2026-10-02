-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- GENERADO por tests/local/gen_revoke_anon_funciones.py — no editar a mano: cambiar la lista y regenerar.
-- Sandbox de ISSUE-099: sobre una COPIA de la base `sgh` (el probe la crea: sgh_anon_run), deja las 31 firmas con
-- el ACL de prod y el default de prod. Las que no existen en `sgh` se crean como STUB con la firma exacta (el
-- paquete sólo cambia permisos: el cuerpo no importa para lo que se prueba). Las de trigger que sí están montadas
-- en `sgh` (set_updated_at en inscripciones, fn_autor_fila en sanciones, las dos de usuarios) conservan su cuerpo.
SET check_function_bodies = off;
DO $do$ BEGIN
  IF to_regprocedure('public.calcular_premio(numeric, jsonb, integer)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.calcular_premio(p_bolsa_total numeric, p_distribucion jsonb, p_puesto integer) RETURNS numeric LANGUAGE sql AS $$ SELECT NULL::numeric $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.calcular_premio(numeric, jsonb, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calcular_premio(numeric, jsonb, integer) TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_autor_fila()') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_autor_fila() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_autor_fila() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_autor_fila() TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_club_de_caballeriza(uuid)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_club_de_caballeriza(p_caballeriza_id uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_club_de_caballeriza(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_club_de_caballeriza(uuid) TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_club_de_carrera(uuid)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_club_de_carrera(p_carrera_id uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_club_de_carrera(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_club_de_carrera(uuid) TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_club_de_inscripcion(uuid)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_club_de_inscripcion(p_inscripcion_id uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_club_de_inscripcion(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_club_de_inscripcion(uuid) TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_club_de_liquidacion(uuid)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_club_de_liquidacion(p_liquidacion_id uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_club_de_liquidacion(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_club_de_liquidacion(uuid) TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_club_de_resolucion(uuid)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_club_de_resolucion(p_resolucion_id uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_club_de_resolucion(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_club_de_resolucion(uuid) TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_club_de_resultado(uuid)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_club_de_resultado(p_resultado_id uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_club_de_resultado(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_club_de_resultado(uuid) TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_club_de_reunion(uuid)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_club_de_reunion(p_reunion_id uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_club_de_reunion(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_club_de_reunion(uuid) TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_edad_reglamentaria(date, date)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_edad_reglamentaria(p_fecha_ref date, p_fecha_nac date) RETURNS integer LANGUAGE sql AS $$ SELECT NULL::integer $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_edad_reglamentaria(date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_edad_reglamentaria(date, date) TO anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_get_user_club_id()') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_get_user_club_id() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_get_user_club_id() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_get_user_club_id() TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_is_portal_user()') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_is_portal_user() RETURNS boolean LANGUAGE sql AS $$ SELECT NULL::boolean $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_is_portal_user() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_is_portal_user() TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_is_staff()') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_is_staff() RETURNS boolean LANGUAGE sql AS $$ SELECT NULL::boolean $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_is_staff() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_is_staff() TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_is_super_admin()') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_is_super_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT NULL::boolean $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_is_super_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_is_super_admin() TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_mis_entidades()') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_mis_entidades() RETURNS TABLE(entidad_tipo text, entidad_id uuid) LANGUAGE sql AS $$ SELECT NULL::text, NULL::uuid WHERE false $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_mis_entidades() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_mis_entidades() TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_mis_spc_ids()') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_mis_spc_ids() RETURNS TABLE(spc_id uuid) LANGUAGE sql AS $$ SELECT NULL::uuid WHERE false $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_mis_spc_ids() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_mis_spc_ids() TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_mis_spc_visibles()') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_mis_spc_visibles() RETURNS TABLE(spc_id uuid) LANGUAGE sql AS $$ SELECT NULL::uuid WHERE false $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_mis_spc_visibles() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_mis_spc_visibles() TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_proteger_rol_club_id_usuario()') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_proteger_rol_club_id_usuario() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_proteger_rol_club_id_usuario() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_proteger_rol_club_id_usuario() TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_solicitudes_guard_staff(uuid)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_solicitudes_guard_staff(p_solicitud_id uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_solicitudes_guard_staff(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_solicitudes_guard_staff(uuid) TO anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_usuarios_guard_privilegios()') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_usuarios_guard_privilegios() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_usuarios_guard_privilegios() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_usuarios_guard_privilegios() TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.fn_usuarios_set_auth_user_id()') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.fn_usuarios_set_auth_user_id() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.fn_usuarios_set_auth_user_id() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_usuarios_set_auth_user_id() TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_aprobar_solicitud(uuid, text, uuid, boolean)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.rpc_aprobar_solicitud(p_solicitud_id uuid, p_entidad_tipo text, p_entidad_id uuid, p_copiar_documento boolean) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.rpc_aprobar_solicitud(uuid, text, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_aprobar_solicitud(uuid, text, uuid, boolean) TO anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_descartar_solicitud(uuid)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.rpc_descartar_solicitud(p_solicitud_id uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.rpc_descartar_solicitud(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_descartar_solicitud(uuid) TO anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_inscribir(uuid, uuid, uuid, uuid, uuid, uuid)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.rpc_inscribir(p_spc_id uuid, p_carrera_id uuid, p_caballeriza_id uuid, p_entrenador_id uuid, p_jockey_titular_id uuid, p_jockey_suplente_id uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.rpc_inscribir(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_inscribir(uuid, uuid, uuid, uuid, uuid, uuid) TO anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_padron_profesionales()') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.rpc_padron_profesionales() RETURNS TABLE(id uuid, nombre text, apellido text, matricula_nro text, tipo text) LANGUAGE sql AS $$ SELECT NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text WHERE false $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.rpc_padron_profesionales() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_padron_profesionales() TO anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_padron_spcs()') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.rpc_padron_spcs() RETURNS TABLE(id uuid, nombre text, sexo text, fecha_nacimiento date, color text, studbook_id text, padrillo_nombre text, madre_nombre text, estado text, habilitado boolean) LANGUAGE sql AS $$ SELECT NULL::uuid, NULL::text, NULL::text, NULL::date, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::boolean WHERE false $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.rpc_padron_spcs() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_padron_spcs() TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_rechazar_solicitud(uuid, text)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.rpc_rechazar_solicitud(p_solicitud_id uuid, p_motivo text) RETURNS void LANGUAGE sql AS $$ SELECT $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.rpc_rechazar_solicitud(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_rechazar_solicitud(uuid, text) TO anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.rpc_solicitar_acceso(text, text, text, text, text, uuid, text, text, text, text, text)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.rpc_solicitar_acceso(p_nombre text, p_apellido text, p_documento_nro text, p_telefono text, p_rol_pedido text, p_club_id uuid, p_documento_tipo text, p_email text, p_origen_hipodromo text, p_origen_patente_nro text, p_origen_caballeriza text) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.rpc_solicitar_acceso(text, text, text, text, text, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_solicitar_acceso(text, text, text, text, text, uuid, text, text, text, text, text) TO anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.siguiente_numero_publico(uuid, date)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.siguiente_numero_publico(p_club_id uuid, p_fecha date) RETURNS integer LANGUAGE sql AS $$ SELECT NULL::integer $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.siguiente_numero_publico(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.siguiente_numero_publico(uuid, date) TO PUBLIC, anon, authenticated, service_role;
DO $do$ BEGIN
  IF to_regprocedure('public.validar_inscripcion(uuid, uuid)') IS NULL THEN
    EXECUTE $s$CREATE FUNCTION public.validar_inscripcion(p_spc_id uuid, p_carrera_id uuid) RETURNS TABLE(puede_inscribirse boolean, motivo text) LANGUAGE sql AS $$ SELECT NULL::boolean, NULL::text WHERE false $$$s$;
  END IF;
END $do$;
REVOKE ALL ON FUNCTION public.validar_inscripcion(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validar_inscripcion(uuid, uuid) TO PUBLIC, anon, authenticated, service_role;

-- default de prod para funciones de postgres en public (y sin entrada global)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
