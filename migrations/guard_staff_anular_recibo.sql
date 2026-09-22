-- ═══════════════════════════════════════════════════════════════════════════════
-- GUARD DE STAFF (5/6) — anular_recibo
--
-- ESTADO EN PRODUCCIÓN: **NO APLICADA — espera OK** — camino de pago: se aplica con Valeria fuera de Pagos.
--
-- MD5 ESPERADO de `pg_get_functiondef` después de aplicar — medido aplicando ESTE archivo en
-- el sandbox (tests/local/) el 2026-09-22. Es el ÚNICO md5 que prueba algo sobre prod: el del
-- archivo .sql no, porque Postgres normaliza el texto al guardarlo (GOTCHA #99).
--   anular_recibo: 844e9e1ff62f4dbba30df71b8a88e309  (3850 bytes, 106 líneas)
-- Paso obligatorio inmediatamente después del apply_migration:
--   select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='anular_recibo';
-- Si no coincide, REAPLICAR con el texto exacto de este archivo antes de dar nada por hecho.
--
-- Tercera capa sobre la misma función. Las dos anteriores, del 2026-09-22:
--   · `migrations/revoke_anon_anular_recibo.sql` — sacó el EXECUTE de PUBLIC y de anon
--     (era la única RPC sin REVOKE: con la publishable key, sin sesión, entraba al cuerpo).
--   · nada más: los guards seguían siendo los mismos.
-- Lo que queda abierto y cierra esta migración: una sesión `authenticated` **sin fila en
-- `usuarios`** (hay 5 cuentas confirmadas así) saltea LOS DOS guards, porque los dos están
-- escritos como `fn_get_user_club_id() IS NOT NULL AND …` — ISSUE-090. Y un usuario del
-- PORTAL, cuyo club SÍ coincide con el del recibo, los pasa de largo: con el id de un
-- recibo propio podía anularlo y devolver sus líneas a `impago` (riesgo de doble cobro).
--
-- Cambios (el resto del cuerpo queda IDÉNTICO: motivo obligatorio, no anular dos veces,
-- foto `lineas_anuladas` v2, el chequeo de que se soltaron todas las líneas):
--   1. guard 0 (quién llama), antes de cualquier SELECT.
--   2. guard de club: patrón de rpc_cambiar_monta (club NULL ya no pasa).
--   3. ventana de 5 días: mismo arreglo — antes, con club NULL, no corría.
--
-- CAMINO DE PAGO: se aplica con Valeria fuera de Pagos.
-- La llama `liquidaciones.html:1793` con sesión staff; `probe_anular_recibo.mjs` con
-- service_role (y `RPC_ANULAR` apuntando a una gemela para los mutantes).
--
-- Guards (2026-09-22): pwd=/home/clio/dev/SGH · spcs=210 · ref=unlhcuanfrtpatoipwve ·
-- recibos=42, anulados=0.
-- Rollback: migrations/rollback_guard_staff_anular_recibo.sql
--           (md5 de la versión que restaura: ea0f2a30112afa5aa6576ff7dca727dc)
-- ═══════════════════════════════════════════════════════════════════════════════

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
  v_user_club  uuid;
  v_es_admin   boolean;
BEGIN
  -- ── guard 0 · QUIÉN LLAMA ───────────────────────────────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role'
          OR fn_is_super_admin() OR fn_is_staff()) THEN
    RAISE EXCEPTION 'anular_recibo: sin permiso' USING ERRCODE = '42501';
  END IF;

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

  -- `service_role` y super_admin quedan exentos de club y de la ventana de 5 días.
  v_es_admin := (coalesce(auth.role(), '') = 'service_role' OR fn_is_super_admin());

  -- ── guard de club (ISSUE-090: club NULL ya no pasa) ─────────────────────────
  IF NOT v_es_admin THEN
    v_user_club := fn_get_user_club_id();
    IF v_user_club IS NULL THEN
      RAISE EXCEPTION 'anular_recibo: la sesión no tiene hipódromo asignado' USING ERRCODE = '42501';
    END IF;
    IF v_recibo.club_id IS DISTINCT FROM v_user_club THEN
      RAISE EXCEPTION 'anular_recibo: el recibo % es de otro club', v_recibo.numero_recibo
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── ventana de 5 días (mismo arreglo: antes con club NULL no corría) ────────
  IF NOT v_es_admin AND v_recibo.emitido_at < now() - interval '5 days' THEN
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

-- El REVOKE del 22/09 sobrevive a CREATE OR REPLACE, pero se deja explícito.
-- Los GRANT también: en prod los da el ALTER DEFAULT PRIVILEGES de Supabase, pero el
-- REVOKE FROM PUBLIC se los lleva puestos en cualquier base que no lo tenga configurado
-- (pasó en el sandbox: service_role se quedó sin EXECUTE y el probe dio 42501).
REVOKE ALL     ON FUNCTION public.anular_recibo(uuid, text) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.anular_recibo(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.anular_recibo(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.anular_recibo(uuid, text) TO service_role;
