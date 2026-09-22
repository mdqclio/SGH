-- ═══════════════════════════════════════════════════════════════════════════════
-- GUARD DE STAFF (6/6) — emitir_recibo (v1.3)
--
-- ESTADO EN PRODUCCIÓN: **NO APLICADA — espera OK** — camino de pago: se aplica con Valeria fuera de Pagos. Va última.
--
-- MD5 ESPERADO de `pg_get_functiondef` después de aplicar — medido aplicando ESTE archivo en
-- el sandbox (tests/local/) el 2026-09-22. Es el ÚNICO md5 que prueba algo sobre prod: el del
-- archivo .sql no, porque Postgres normaliza el texto al guardarlo (GOTCHA #99).
--   emitir_recibo: 14951f502c0816de2d52923b45435c12  (4063 bytes, 103 líneas)
-- Paso obligatorio inmediatamente después del apply_migration:
--   select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='emitir_recibo';
-- Si no coincide, REAPLICAR con el texto exacto de este archivo antes de dar nada por hecho.
--
-- Sobre v1.2 (`emitir_recibo_v1_2_aislamiento_club.sql`, ISSUE-059/057). Lo que v1.2 dejó
-- abierto y cierra esta migración es el guard 1: está escrito como
-- `fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin() AND …`, con el comentario
-- «service_role (auth.uid() NULL → fn_get_user_club_id() NULL) y super_admin pasan». Ese
-- "club NULL = service_role" también es verdad para una sesión `authenticated` SIN fila en
-- `usuarios` (hay 5 cuentas confirmadas así) — ISSUE-090 — y el guard no corre para ellas.
-- Y un usuario del PORTAL, cuyo club coincide con el del recibo, lo pasa de largo: medido
-- el 22/09, entraba hasta el INSERT del recibo.
--
-- Cambios (el guard 2 —las líneas son del mismo club que el recibo, la invariante del dato—
-- y todo el resto del cuerpo quedan IDÉNTICOS):
--   1. guard 0 (quién llama), antes de cualquier SELECT.
--   2. guard 1: patrón de rpc_cambiar_monta — service_role por auth.role(), super_admin, y
--      para el resto club explícito (NULL → 42501).
--
-- CAMINO DE PAGO: se aplica con Valeria fuera de Pagos. Va ÚLTIMA de las seis.
-- La llama `liquidaciones.html:1675` con sesión staff; los probes con service_role (y con
-- `RPC_EMITIR` a una gemela para los mutantes).
--
-- Guards (2026-09-22): pwd=/home/clio/dev/SGH · spcs=210 · ref=unlhcuanfrtpatoipwve ·
-- recibos=42.
-- Rollback: migrations/rollback_guard_staff_emitir_recibo.sql
--           (md5 de la versión que restaura: 6076089feb365e26b6f88d3cc6345b1d)
-- ═══════════════════════════════════════════════════════════════════════════════

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
  v_user_club  uuid;
BEGIN
  -- ── guard 0 · QUIÉN LLAMA ───────────────────────────────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role'
          OR fn_is_super_admin() OR fn_is_staff()) THEN
    RAISE EXCEPTION 'emitir_recibo: sin permiso' USING ERRCODE = '42501';
  END IF;

  IF p_linea_ids IS NULL OR array_length(p_linea_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'emitir_recibo: sin líneas';
  END IF;
  IF p_club_id IS NULL THEN
    RAISE EXCEPTION 'emitir_recibo: falta el club del recibo';
  END IF;

  -- ── ISSUE-059 · guard 1: el club del que llama (ISSUE-090: club NULL ya no pasa) ──
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR fn_is_super_admin()) THEN
    v_user_club := fn_get_user_club_id();
    IF v_user_club IS NULL THEN
      RAISE EXCEPTION 'emitir_recibo: la sesión no tiene hipódromo asignado' USING ERRCODE = '42501';
    END IF;
    IF p_club_id IS DISTINCT FROM v_user_club THEN
      RAISE EXCEPTION 'emitir_recibo: no se puede emitir un recibo de otro club'
        USING ERRCODE = '42501';
    END IF;
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

GRANT EXECUTE ON FUNCTION public.emitir_recibo(
  uuid, beneficiario_tipo, uuid, uuid[], forma_pago_recibo, text, text, text
) TO authenticated;
