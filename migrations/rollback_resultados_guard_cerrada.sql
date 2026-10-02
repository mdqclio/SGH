-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK de migrations/resultados_guard_cerrada.sql
-- Saca el guard de reunión cerrada y la auditoría de posiciones/apuestas, y vuelve las 6 políticas de
-- escritura de resultados / resultado_posiciones al texto EXACTO de prod al 2026-10-02 (pg_policies).
-- Las filas que la auditoría nueva haya escrito quedan (no se borra auditoría).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DROP TRIGGER IF EXISTS trg_resultado_cerrado ON public.resultados;
DROP TRIGGER IF EXISTS trg_resultado_cerrado ON public.resultado_posiciones;
DROP TRIGGER IF EXISTS trg_resultado_cerrado ON public.resultado_apuestas;
DROP FUNCTION IF EXISTS public.fn_resultado_cerrado_guard();
DROP TRIGGER IF EXISTS trg_audit_resultado_posiciones ON public.resultado_posiciones;
DROP TRIGGER IF EXISTS trg_audit_resultado_apuestas ON public.resultado_apuestas;

DROP POLICY resultados_insert ON public.resultados;
CREATE POLICY resultados_insert ON public.resultados AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));
DROP POLICY resultados_update ON public.resultados;
CREATE POLICY resultados_update ON public.resultados AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));
DROP POLICY resultados_delete ON public.resultados;
CREATE POLICY resultados_delete ON public.resultados AS PERMISSIVE FOR DELETE TO authenticated
  USING (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_posiciones_insert ON public.resultado_posiciones;
CREATE POLICY resultado_posiciones_insert ON public.resultado_posiciones AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));
DROP POLICY resultado_posiciones_update ON public.resultado_posiciones;
CREATE POLICY resultado_posiciones_update ON public.resultado_posiciones AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));
DROP POLICY resultado_posiciones_delete ON public.resultado_posiciones;
CREATE POLICY resultado_posiciones_delete ON public.resultado_posiciones AS PERMISSIVE FOR DELETE TO authenticated
  USING (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

COMMIT;
