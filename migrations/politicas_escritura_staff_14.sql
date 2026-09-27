-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ISSUE-093 — las políticas de ESCRITURA de 14 tablas exigen fn_is_staff() en la rama de club.
--
-- Hasta hoy la rama no-super_admin era sólo "el club de la fila = fn_get_user_club_id()", y
-- fn_get_user_club_id() devuelve el club de CUALQUIER usuario activo: un profesional o propietario
-- del portal (club Dolores) podía, por la API directa, escribir en liquidacion_config,
-- club_secuencias, clubs, comision_config, resultado_apuestas, etc.
-- Informe: docs/diagnosticos/2026-09-27_issue093-politicas-escritura-portal.md (reports).
--
-- Tablas: caballeriza_responsables, carrera_apuestas, categorias_carrera, club_configuracion, club_secuencias, clubs, comision_config, hipodromos, liquidacion_config, novedades_reunion, resolucion_entidades, resoluciones, resultado_apuestas, resultado_log.
-- 36 políticas (INSERT/UPDATE/DELETE, y las dos FOR ALL `_rls`). SELECT no se toca, salvo que las
-- dos FOR ALL (liquidacion_config_rls, club_secuencias_rls) también cubren SELECT: el portal deja de
-- leer esas dos tablas (no las usa).
--
-- No afecta: aplicar_resultado, fn_siguiente_recibo, rpc_caballeriza_provisorio (SECURITY DEFINER,
-- dueño postgres, RLS no forzada), service_role (probes, Edge Functions), migraciones.
--
-- GENERADO por tests/local/gen_politicas_escritura_staff.py — no editar a mano.
-- Rollback: migrations/rollback_politicas_escritura_staff_14.sql (políticas exactas de hoy, 36/36 md5).
-- Probe: tests/probe_politicas_escritura_staff.mjs (sandbox: réplica tests/local/politicas_escritura_sandbox.sql).
-- md5 esperado de cada expresión DESPUÉS de aplicar: medido en el sandbox, ver
-- tests/local/politicas_escritura_md5_esperado.txt.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DROP POLICY caballeriza_responsables_delete ON public.caballeriza_responsables;
CREATE POLICY caballeriza_responsables_delete ON public.caballeriza_responsables AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY caballeriza_responsables_insert ON public.caballeriza_responsables;
CREATE POLICY caballeriza_responsables_insert ON public.caballeriza_responsables AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY caballeriza_responsables_update ON public.caballeriza_responsables;
CREATE POLICY caballeriza_responsables_update ON public.caballeriza_responsables AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY carrera_apuestas_delete ON public.carrera_apuestas;
CREATE POLICY carrera_apuestas_delete ON public.carrera_apuestas AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY carrera_apuestas_insert ON public.carrera_apuestas;
CREATE POLICY carrera_apuestas_insert ON public.carrera_apuestas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY carrera_apuestas_update ON public.carrera_apuestas;
CREATE POLICY carrera_apuestas_update ON public.carrera_apuestas AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY categorias_carrera_delete ON public.categorias_carrera;
CREATE POLICY categorias_carrera_delete ON public.categorias_carrera AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY categorias_carrera_insert ON public.categorias_carrera;
CREATE POLICY categorias_carrera_insert ON public.categorias_carrera AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY categorias_carrera_update ON public.categorias_carrera;
CREATE POLICY categorias_carrera_update ON public.categorias_carrera AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY club_configuracion_delete ON public.club_configuracion;
CREATE POLICY club_configuracion_delete ON public.club_configuracion AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY club_configuracion_insert ON public.club_configuracion;
CREATE POLICY club_configuracion_insert ON public.club_configuracion AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY club_configuracion_update ON public.club_configuracion;
CREATE POLICY club_configuracion_update ON public.club_configuracion AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY club_secuencias_rls ON public.club_secuencias;
CREATE POLICY club_secuencias_rls ON public.club_secuencias AS PERMISSIVE FOR ALL TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY clubs_update_self_or_admin ON public.clubs;
CREATE POLICY clubs_update_self_or_admin ON public.clubs AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY comision_config_delete ON public.comision_config;
CREATE POLICY comision_config_delete ON public.comision_config AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY comision_config_insert ON public.comision_config;
CREATE POLICY comision_config_insert ON public.comision_config AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY comision_config_update ON public.comision_config;
CREATE POLICY comision_config_update ON public.comision_config AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY hipodromos_delete ON public.hipodromos;
CREATE POLICY hipodromos_delete ON public.hipodromos AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY hipodromos_insert ON public.hipodromos;
CREATE POLICY hipodromos_insert ON public.hipodromos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY hipodromos_update ON public.hipodromos;
CREATE POLICY hipodromos_update ON public.hipodromos AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY liquidacion_config_rls ON public.liquidacion_config;
CREATE POLICY liquidacion_config_rls ON public.liquidacion_config AS PERMISSIVE FOR ALL TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY novedades_reunion_delete ON public.novedades_reunion;
CREATE POLICY novedades_reunion_delete ON public.novedades_reunion AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY novedades_reunion_insert ON public.novedades_reunion;
CREATE POLICY novedades_reunion_insert ON public.novedades_reunion AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY novedades_reunion_update ON public.novedades_reunion;
CREATE POLICY novedades_reunion_update ON public.novedades_reunion AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resolucion_entidades_delete ON public.resolucion_entidades;
CREATE POLICY resolucion_entidades_delete ON public.resolucion_entidades AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resolucion_entidades_insert ON public.resolucion_entidades;
CREATE POLICY resolucion_entidades_insert ON public.resolucion_entidades AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resolucion_entidades_update ON public.resolucion_entidades;
CREATE POLICY resolucion_entidades_update ON public.resolucion_entidades AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resoluciones_delete ON public.resoluciones;
CREATE POLICY resoluciones_delete ON public.resoluciones AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resoluciones_insert ON public.resoluciones;
CREATE POLICY resoluciones_insert ON public.resoluciones AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resoluciones_update ON public.resoluciones;
CREATE POLICY resoluciones_update ON public.resoluciones AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_apuestas_delete ON public.resultado_apuestas;
CREATE POLICY resultado_apuestas_delete ON public.resultado_apuestas AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_apuestas_insert ON public.resultado_apuestas;
CREATE POLICY resultado_apuestas_insert ON public.resultado_apuestas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_apuestas_update ON public.resultado_apuestas;
CREATE POLICY resultado_apuestas_update ON public.resultado_apuestas AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_log_delete ON public.resultado_log;
CREATE POLICY resultado_log_delete ON public.resultado_log AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_log_insert ON public.resultado_log;
CREATE POLICY resultado_log_insert ON public.resultado_log AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_log_update ON public.resultado_log;
CREATE POLICY resultado_log_update ON public.resultado_log AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

COMMIT;
