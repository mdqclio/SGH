-- ROLLBACK de migrations/guard_staff_emitir_recibo.sql
-- ESTADO EN PRODUCCIÓN (2026-09-22): la migración que revierte NO está aplicada: hoy prod ya es esta versión. Correr esto no cambia nada.
-- Restaura emitir_recibo v1.2, la versión viva en prod hasta el 2026-09-22.
-- md5 de pg_get_functiondef de esa versión: 6076089feb365e26b6f88d3cc6345b1d (3637 bytes)
-- Con esto vuelve el patrón "club NULL pasa" del guard 1 (ISSUE-090) y desaparece el guard 0.

CREATE OR REPLACE FUNCTION public.emitir_recibo(p_club_id uuid, p_beneficiario_tipo beneficiario_tipo, p_beneficiario_id uuid, p_linea_ids uuid[], p_forma_pago forma_pago_recibo, p_cobrador_nombre text, p_cobrador_documento text, p_comprobante_url text DEFAULT NULL::text)
 RETURNS recibos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_num        int;
  v_recibo     recibos;
  v_marcadas   int;
  v_bruto      numeric;
  v_desc       numeric;
  v_ajenas     int;
  v_usuario_id uuid;
BEGIN
  IF p_linea_ids IS NULL OR array_length(p_linea_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'emitir_recibo: sin líneas';
  END IF;
  IF p_club_id IS NULL THEN
    RAISE EXCEPTION 'emitir_recibo: falta el club del recibo';
  END IF;

  -- ── ISSUE-059 · guard 1: el club del que llama ────────────────────────────
  -- service_role (auth.uid() NULL → fn_get_user_club_id() NULL) y super_admin pasan.
  IF fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin()
     AND p_club_id IS DISTINCT FROM fn_get_user_club_id() THEN
    RAISE EXCEPTION 'emitir_recibo: no se puede emitir un recibo de otro club'
      USING ERRCODE = '42501';
  END IF;

  -- ── ISSUE-059 · guard 2: las líneas son del MISMO club que el recibo ───────
  -- Sin condicionar a la sesión: es la invariante del dato, no un permiso.
  SELECT count(*) INTO v_ajenas
    FROM liquidacion_detalle d
    JOIN liquidaciones l ON l.id = d.liquidacion_id
   WHERE d.id = ANY(p_linea_ids)
     AND l.club_id IS DISTINCT FROM p_club_id;

  IF v_ajenas > 0 THEN
    RAISE EXCEPTION 'emitir_recibo: % de % línea(s) pertenecen a otro club — el recibo no se emite',
      v_ajenas, array_length(p_linea_ids, 1)
      USING ERRCODE = '42501';
  END IF;

  -- ── ISSUE-057 · quién emite ───────────────────────────────────────────────
  -- FK a usuarios(id), no a auth.users. NULL legítimo bajo service_role.
  SELECT u.id INTO v_usuario_id
    FROM usuarios u
   WHERE u.auth_user_id = auth.uid() AND u.activo
   LIMIT 1;

  v_num := fn_siguiente_recibo(p_club_id);

  INSERT INTO recibos (
    club_id, numero_recibo, beneficiario_tipo, profesional_id, propietario_id,
    forma_pago, cobrador_nombre, cobrador_documento, comprobante_url, estado,
    emitido_por
  ) VALUES (
    p_club_id, v_num, p_beneficiario_tipo,
    CASE WHEN p_beneficiario_tipo = 'profesional' THEN p_beneficiario_id END,
    CASE WHEN p_beneficiario_tipo = 'propietario' THEN p_beneficiario_id END,
    p_forma_pago, p_cobrador_nombre, p_cobrador_documento, p_comprobante_url, 'emitido',
    v_usuario_id
  ) RETURNING * INTO v_recibo;

  UPDATE liquidacion_detalle d
     SET estado_linea = 'pagado', recibo_id = v_recibo.id, pagado_at = now()
   WHERE d.id = ANY(p_linea_ids)
     AND d.beneficiario_id   = p_beneficiario_id
     AND d.beneficiario_tipo = p_beneficiario_tipo
     AND d.recibo_id IS NULL
     AND d.estado_linea = 'impago'
     -- red de seguridad del guard 2 (carrera entre el chequeo y el UPDATE)
     AND EXISTS (
       SELECT 1 FROM liquidaciones l
        WHERE l.id = d.liquidacion_id AND l.club_id = p_club_id
     );
  GET DIAGNOSTICS v_marcadas = ROW_COUNT;

  IF v_marcadas = 0 THEN
    RAISE EXCEPTION 'emitir_recibo: ninguna línea pagable (ya cobradas, retenidas, de otro beneficiario o de otro club)';
  END IF;

  SELECT COALESCE(sum(monto_bruto), 0), COALESCE(sum(monto_descuento), 0)
    INTO v_bruto, v_desc
    FROM liquidacion_detalle WHERE recibo_id = v_recibo.id;
  UPDATE recibos SET total_premios = v_bruto, total_descuentos = v_desc
    WHERE id = v_recibo.id RETURNING * INTO v_recibo;

  RETURN v_recibo;
END $function$;

