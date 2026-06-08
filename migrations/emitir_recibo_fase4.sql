-- ============================================================
-- Fase 4 — RPC emitir_recibo (cobro atómico estilo tesorería)
-- Rama: feat/buscador-liquidaciones
--
-- Emite un recibo por persona consolidando líneas pagables (cruzando reuniones) en
-- UNA transacción: número correlativo por club + insert en `recibos` + marcado de las
-- líneas pasadas (pagables, sin recibo) como 'pagado'. Idempotente: una línea con
-- recibo_id ya seteado se ignora. Si ninguna línea queda marcada → RAISE (rollback:
-- no se crea recibo ni se consume número).
--
-- Pagable = estado_linea='impago' OR (estado_linea='retenido' AND fecha_liberacion <= hoy).
-- Solo marca líneas cuyo beneficiario_id == p_beneficiario_id (blindaje).
-- Reversible: DROP FUNCTION emitir_recibo(...).
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

  -- (a) número correlativo por club (atómico, SECURITY DEFINER)
  v_num := fn_siguiente_recibo(p_club_id);

  -- (b) cabecera del recibo
  INSERT INTO recibos (
    club_id, numero_recibo, beneficiario_tipo, profesional_id, propietario_id,
    forma_pago, cobrador_nombre, cobrador_documento, comprobante_url, estado
  ) VALUES (
    p_club_id, v_num, p_beneficiario_tipo,
    CASE WHEN p_beneficiario_tipo = 'profesional' THEN p_beneficiario_id END,
    CASE WHEN p_beneficiario_tipo = 'propietario' THEN p_beneficiario_id END,
    p_forma_pago, p_cobrador_nombre, p_cobrador_documento, p_comprobante_url, 'emitido'
  ) RETURNING * INTO v_recibo;

  -- (c) marcar SOLO líneas pasadas, del beneficiario, pagables y sin recibo → pagado
  UPDATE liquidacion_detalle d
     SET estado_linea = 'pagado', recibo_id = v_recibo.id, pagado_at = now()
   WHERE d.id = ANY(p_linea_ids)
     AND d.beneficiario_id = p_beneficiario_id
     AND d.recibo_id IS NULL
     AND ( d.estado_linea = 'impago'
        OR (d.estado_linea = 'retenido' AND d.fecha_liberacion IS NOT NULL AND d.fecha_liberacion <= current_date) );
  GET DIAGNOSTICS v_marcadas = ROW_COUNT;

  -- idempotencia / blindaje: si no se marcó nada, abortar (rollback del insert + secuencia)
  IF v_marcadas = 0 THEN
    RAISE EXCEPTION 'emitir_recibo: ninguna línea pagable (ya cobradas, retenidas a futuro o de otro beneficiario)';
  END IF;

  -- totales desde las líneas efectivamente marcadas (neto_a_cobrar es GENERATED)
  SELECT COALESCE(sum(monto_bruto), 0), COALESCE(sum(monto_descuento), 0)
    INTO v_bruto, v_desc
    FROM liquidacion_detalle WHERE recibo_id = v_recibo.id;
  UPDATE recibos SET total_premios = v_bruto, total_descuentos = v_desc
    WHERE id = v_recibo.id RETURNING * INTO v_recibo;

  RETURN v_recibo;
END $$;
