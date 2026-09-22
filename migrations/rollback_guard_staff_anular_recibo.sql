-- ROLLBACK de migrations/guard_staff_anular_recibo.sql
-- ESTADO EN PRODUCCIÓN (2026-09-22): la migración que revierte NO está aplicada: hoy prod ya es esta versión. Correr esto no cambia nada.
-- Restaura la versión viva en prod hasta el 2026-09-22 (la del REVOKE, con los guards viejos).
-- md5 de pg_get_functiondef de esa versión: ea0f2a30112afa5aa6576ff7dca727dc (3097 bytes)
-- Con esto vuelven el patrón "club NULL pasa" en el guard de club Y en la ventana de 5 días.
-- El REVOKE de PUBLIC/anon NO se revierte acá: eso es rollback_revoke_anon_anular_recibo.sql.

CREATE OR REPLACE FUNCTION public.anular_recibo(p_recibo_id uuid, p_motivo text)
 RETURNS recibos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_recibo     recibos;
  v_usuario_id uuid;
  v_lineas     jsonb;
  v_liberadas  int;
BEGIN
  IF p_recibo_id IS NULL THEN
    RAISE EXCEPTION 'anular_recibo: falta el recibo';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'anular_recibo: el motivo de anulación es obligatorio';
  END IF;

  SELECT * INTO v_recibo FROM recibos WHERE id = p_recibo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'anular_recibo: el recibo no existe';
  END IF;

  IF fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin()
     AND v_recibo.club_id IS DISTINCT FROM fn_get_user_club_id() THEN
    RAISE EXCEPTION 'anular_recibo: el recibo % es de otro club', v_recibo.numero_recibo
      USING ERRCODE = '42501';
  END IF;

  IF NOT fn_is_super_admin() AND fn_get_user_club_id() IS NOT NULL
     AND v_recibo.emitido_at < now() - interval '5 days' THEN
    RAISE EXCEPTION
      'anular_recibo: el recibo % se emitió el % (hace más de 5 días) — sólo un super_admin puede anularlo',
      v_recibo.numero_recibo, v_recibo.emitido_at::date
      USING ERRCODE = '42501';
  END IF;

  IF v_recibo.estado = 'anulado' THEN
    RAISE EXCEPTION 'anular_recibo: el recibo % ya fue anulado el % — no se anula dos veces',
      v_recibo.numero_recibo, v_recibo.anulado_at::date;
  END IF;

  SELECT u.id INTO v_usuario_id
    FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo LIMIT 1;

  -- v2: to_jsonb(d) en vez de d.id — foto de la fila completa, no sólo el id.
  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]'::jsonb) INTO v_lineas
    FROM liquidacion_detalle d WHERE d.recibo_id = p_recibo_id;

  IF jsonb_array_length(v_lineas) = 0 THEN
    RAISE EXCEPTION 'anular_recibo: el recibo % no tiene líneas asociadas — no se anula un recibo vacío',
      v_recibo.numero_recibo;
  END IF;

  UPDATE liquidacion_detalle d
     SET recibo_id    = NULL,
         pagado_at    = NULL,
         estado_linea = CASE
           WHEN d.fecha_liberacion IS NOT NULL AND d.fecha_liberacion > CURRENT_DATE
             THEN 'retenido'::estado_linea_liq
           ELSE 'impago'::estado_linea_liq
         END
   WHERE d.recibo_id = p_recibo_id;
  GET DIAGNOSTICS v_liberadas = ROW_COUNT;

  IF v_liberadas <> jsonb_array_length(v_lineas) THEN
    RAISE EXCEPTION 'anular_recibo: se soltaron % línea(s) pero el recibo % tenía % — se aborta',
      v_liberadas, v_recibo.numero_recibo, jsonb_array_length(v_lineas);
  END IF;

  UPDATE recibos
     SET estado           = 'anulado',
         anulado_at       = now(),
         anulado_por      = v_usuario_id,
         motivo_anulacion = btrim(p_motivo),
         lineas_anuladas  = v_lineas
   WHERE id = p_recibo_id
     AND estado = 'emitido'
  RETURNING * INTO v_recibo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'anular_recibo: el recibo cambió de estado durante la anulación';
  END IF;

  RETURN v_recibo;
END $function$;

