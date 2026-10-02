-- ROLLBACK de migrations/desoficializar_carrera_v2.sql: vuelve a la v1 EXACTA de prod al 2026-10-02
-- (pg_get_functiondef, md5 c3247d72656833cd534e4c601900f25a).
BEGIN;

CREATE OR REPLACE FUNCTION public.desoficializar_carrera(p_carrera_id uuid)
 RETURNS resultados
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_res       resultados;
  v_pagas     int;
  v_club      uuid;
  v_user_club uuid;
BEGIN
  -- ── guard 0 · QUIÉN LLAMA ───────────────────────────────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role'
          OR fn_is_super_admin() OR fn_is_staff()) THEN
    RAISE EXCEPTION 'desoficializar_carrera: sin permiso' USING ERRCODE = '42501';
  END IF;

  -- ── guard de club (nuevo: antes no había) ───────────────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR fn_is_super_admin()) THEN
    v_club := fn_club_de_carrera(p_carrera_id);
    v_user_club := fn_get_user_club_id();
    IF v_user_club IS NULL THEN
      RAISE EXCEPTION 'desoficializar_carrera: la sesión no tiene hipódromo asignado' USING ERRCODE = '42501';
    END IF;
    IF v_club IS DISTINCT FROM v_user_club THEN
      RAISE EXCEPTION 'desoficializar_carrera: la carrera es de otro hipódromo' USING ERRCODE = '42501';
    END IF;
  END IF;

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

COMMIT;
