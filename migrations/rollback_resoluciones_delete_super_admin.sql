-- ROLLBACK de migrations/resoluciones_delete_super_admin.sql (ISSUE-097, pieza C): la política exacta de antes
-- (la de ISSUE-093), md5(USING) = 9d695686b22058200e7561b36d525ed9.
BEGIN;
DROP POLICY resoluciones_delete ON public.resoluciones;
CREATE POLICY resoluciones_delete ON public.resoluciones AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));
COMMIT;
