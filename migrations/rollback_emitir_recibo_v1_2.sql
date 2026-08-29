-- ROLLBACK de emitir_recibo v1.2 → vuelve a la v1.1 EXACTA que estaba viva en prod
-- el 2026-08-29 (copiada de pg_get_functiondef, no reescrita de memoria).
--
-- Efecto de correr esto: se pierden los tres guards (club del llamador, club de las
-- líneas, beneficiario_tipo) y emitido_por vuelve a quedar NULL siempre.
-- Los recibos ya emitidos con emitido_por cargado NO se tocan.

CREATE OR REPLACE FUNCTION public.emitir_recibo(
  p_club_id uuid, p_beneficiario_tipo beneficiario_tipo, p_beneficiario_id uuid,
  p_linea_ids uuid[], p_forma_pago forma_pago_recibo, p_cobrador_nombre text,
  p_cobrador_documento text, p_comprobante_url text DEFAULT NULL::text
)
RETURNS recibos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_num      int;
  v_recibo   recibos;
  v_marcadas int;
  v_bruto    numeric;
  v_desc     numeric;
BEGIN
  IF p_linea_ids IS NULL OR array_length(p_linea_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'emitir_recibo: sin líneas';
  END IF;

  v_num := fn_siguiente_recibo(p_club_id);

  INSERT INTO recibos (
    club_id, numero_recibo, beneficiario_tipo, profesional_id, propietario_id,
    forma_pago, cobrador_nombre, cobrador_documento, comprobante_url, estado
  ) VALUES (
    p_club_id, v_num, p_beneficiario_tipo,
    CASE WHEN p_beneficiario_tipo = 'profesional' THEN p_beneficiario_id END,
    CASE WHEN p_beneficiario_tipo = 'propietario' THEN p_beneficiario_id END,
    p_forma_pago, p_cobrador_nombre, p_cobrador_documento, p_comprobante_url, 'emitido'
  ) RETURNING * INTO v_recibo;

  UPDATE liquidacion_detalle d
     SET estado_linea = 'pagado', recibo_id = v_recibo.id, pagado_at = now()
   WHERE d.id = ANY(p_linea_ids)
     AND d.beneficiario_id = p_beneficiario_id
     AND d.recibo_id IS NULL
     AND d.estado_linea = 'impago';
  GET DIAGNOSTICS v_marcadas = ROW_COUNT;

  IF v_marcadas = 0 THEN
    RAISE EXCEPTION 'emitir_recibo: ninguna línea pagable (ya cobradas, retenidas o de otro beneficiario)';
  END IF;

  SELECT COALESCE(sum(monto_bruto), 0), COALESCE(sum(monto_descuento), 0)
    INTO v_bruto, v_desc
    FROM liquidacion_detalle WHERE recibo_id = v_recibo.id;
  UPDATE recibos SET total_premios = v_bruto, total_descuentos = v_desc
    WHERE id = v_recibo.id RETURNING * INTO v_recibo;

  RETURN v_recibo;
END $function$;
