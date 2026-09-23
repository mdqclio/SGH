-- ROLLBACK de migrations/guard_staff_liberar_linea.sql
-- ESTADO EN PRODUCCIÓN (2026-09-22): la migración que revierte está APLICADA en prod (20260922170638). Correr esto DESHACE el guard.
-- Restaura la versión viva en prod hasta el 2026-09-22.
-- md5 de pg_get_functiondef de esa versión: da404453eda5a68ed28f612b46c878e2 (989 bytes)
-- Con esto vuelve el patrón "club NULL pasa" y el portal vuelve a poder liberar una línea
-- retenida de su propio club.

CREATE OR REPLACE FUNCTION public.liberar_linea(p_linea_id uuid)
 RETURNS liquidacion_detalle
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row  liquidacion_detalle;
  v_club uuid;
BEGIN
  SELECT fn_club_de_liquidacion(liquidacion_id) INTO v_club
    FROM liquidacion_detalle WHERE id = p_linea_id;
  IF v_club IS NULL AND NOT EXISTS (SELECT 1 FROM liquidacion_detalle WHERE id = p_linea_id) THEN
    RAISE EXCEPTION 'liberar_linea: línea inexistente';
  END IF;

  IF fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin()
     AND v_club IS DISTINCT FROM fn_get_user_club_id() THEN
    RAISE EXCEPTION 'liberar_linea: línea de otro club';
  END IF;

  UPDATE liquidacion_detalle
     SET estado_linea = 'impago'
   WHERE id = p_linea_id AND estado_linea = 'retenido'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'liberar_linea: la línea no existe o no está en retenido';
  END IF;

  RETURN v_row;
END $function$;
