-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK de migrations/sanciones_insert_update_staff.sql
--
-- Vuelve sanciones_insert y sanciones_update a sus definiciones de prod medidas el 2026-09-25
-- (pg_policies): `super_admin OR club_id = fn_get_user_club_id()`, SIN fn_is_staff(). Reabre el
-- agujero del portal: un profesional/propietario con club_id vuelve a poder insertar y editar.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS sanciones_insert ON public.sanciones;
CREATE POLICY sanciones_insert ON public.sanciones
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id())));

DROP POLICY IF EXISTS sanciones_update ON public.sanciones;
CREATE POLICY sanciones_update ON public.sanciones
  FOR UPDATE TO authenticated
  USING ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id())))
  WITH CHECK ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id())));

COMMIT;
