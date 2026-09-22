-- ROLLBACK de migrations/guard_staff_desoficializar_carrera.sql
-- ESTADO EN PRODUCCIÓN (2026-09-22): la migración que revierte está APLICADA en prod (20260922170817). Correr esto DESHACE el guard.
-- Restaura la versión viva en prod hasta el 2026-09-22.
-- md5 de pg_get_functiondef de esa versión: f4d376803f2a694480a1469a6f92eeae (891 bytes)
-- Con esto la función vuelve a quedar SIN guard de rol ni de club.

CREATE OR REPLACE FUNCTION public.desoficializar_carrera(p_carrera_id uuid)
 RETURNS resultados
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_res    resultados;
  v_pagas  int;
BEGIN
  SELECT count(*) INTO v_pagas
    FROM liquidacion_detalle d
   WHERE (d.recibo_id IS NOT NULL OR d.estado_linea = 'pagado')
     AND ( d.carrera_id = p_carrera_id
        OR d.inscripcion_id IN (SELECT i.id FROM inscripciones i WHERE i.carrera_id = p_carrera_id) );

  IF v_pagas > 0 THEN
    RAISE EXCEPTION 'carrera con pagos emitidos, anulá los recibos primero';
  END IF;

  UPDATE resultados
     SET estado = 'provisional', oficializado_at = NULL, oficializado_por = NULL
   WHERE carrera_id = p_carrera_id
   RETURNING * INTO v_res;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no hay resultado para esta carrera';
  END IF;

  RETURN v_res;
END $function$;
