-- ROLLBACK de migrations/guard_staff_fn_siguiente_recibo.sql
-- ESTADO EN PRODUCCIÓN (2026-09-22): la migración que revierte NO está aplicada: hoy prod ya es esta versión. Correr esto no cambia nada.
-- Restaura la versión viva en prod hasta el 2026-09-22.
-- md5 de pg_get_functiondef de esa versión: 1b92fbbac309e175c1f0b145638a6399 (455 bytes)
-- Con esto vuelve a NO tener guard: cualquier authenticated puede consumir la numeración
-- de recibos de cualquier club.

CREATE OR REPLACE FUNCTION public.fn_siguiente_recibo(p_club_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_num INTEGER;
BEGIN
  INSERT INTO club_secuencias (club_id, tipo, ultimo_numero)
  VALUES (p_club_id, 'recibo', 1)
  ON CONFLICT (club_id, tipo)
  DO UPDATE SET ultimo_numero = club_secuencias.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_num;
  RETURN v_num;
END $function$;
