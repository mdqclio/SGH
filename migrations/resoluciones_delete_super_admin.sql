-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ISSUE-097 · pieza C — borrar una resolución: sólo super_admin (como sanciones_delete, que ya lo era).
-- Antes (desde ISSUE-093): super_admin o staff del club. md5(USING) de hoy = 9d695686b22058200e7561b36d525ed9.
-- Después: USING = ( SELECT fn_is_super_admin() ), idéntica a sanciones_delete (md5 06c736d81c93b99ecdc19b348c5804d5).
-- resolucion_entidades_delete no cambia: el borrado de la resolución arrastra sus entidades por la FK
-- ON DELETE CASCADE (las acciones de FK no pasan por RLS).
-- Front (misma rama): resoluciones.html y sanciones.html sólo muestran el botón de borrar a super_admin.
-- Rollback: migrations/rollback_resoluciones_delete_super_admin.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;
DROP POLICY resoluciones_delete ON public.resoluciones;
CREATE POLICY resoluciones_delete ON public.resoluciones AS PERMISSIVE FOR DELETE TO authenticated
  USING (( SELECT fn_is_super_admin() AS fn_is_super_admin));
COMMIT;
