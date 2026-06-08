-- ============================================================
-- Fase 4 v1.1 — emitir_recibo: pagable = SOLO impago
-- Rama: feat/cobros-v1.1
--
-- CAMBIO: la liberación del doping pasa a ser 100% MANUAL (decisión Fede). Antes una
-- línea 'retenido' con fecha_liberacion <= hoy era pagable automáticamente. Ahora NO:
-- pagable = estado_linea='impago' solamente. La línea retenido se libera a mano con
-- liberar_linea() (retenido→impago) cuando llega el resultado del doping. fecha_liberacion
-- queda como referencia, no libera sola. La retención automática 1°/2° (Fase C) NO se toca.
--
-- Único cambio respecto de la versión en prod: la cláusula de pagable en el UPDATE.
-- Reversible: re-aplicar la versión anterior (migrations/emitir_recibo_fase4.sql).
-- ============================================================

CREATE OR REPLACE FUNCTION emitir_recibo(
  p_club_id            uuid,
  p_beneficiario_tipo  beneficiario_tipo,
  p_beneficiario_id    uuid,
  p_linea_ids          uuid[],
  p_forma_pago         forma_pago_recibo,
  p_cobrador_nombre    text,
  p_cobrador_documento text,
  p_comprobante_url    text DEFAULT NULL
) RETURNS recibos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- pagable = SOLO impago (la retención se libera a mano con liberar_linea)
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
END $$;
