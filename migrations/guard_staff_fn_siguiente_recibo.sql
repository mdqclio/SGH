-- ═══════════════════════════════════════════════════════════════════════════════
-- GUARD DE STAFF (1/6) — fn_siguiente_recibo
--
-- ESTADO EN PRODUCCIÓN: **NO APLICADA — espera OK** — camino de pago: `emitir_recibo` la llama por dentro. Va junto con las otras dos.
--
-- MD5 ESPERADO de `pg_get_functiondef` después de aplicar — medido aplicando ESTE archivo en
-- el sandbox (tests/local/) el 2026-09-22. Es el ÚNICO md5 que prueba algo sobre prod: el del
-- archivo .sql no, porque Postgres normaliza el texto al guardarlo (GOTCHA #99).
--   fn_siguiente_recibo: 95d2bdc2fef65622e3997fbff45285f4  (1288 bytes, 35 líneas)
-- Paso obligatorio inmediatamente después del apply_migration:
--   select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='fn_siguiente_recibo';
-- Si no coincide, REAPLICAR con el texto exacto de este archivo antes de dar nada por hecho.
--
-- Parte de la tanda que cierra el vector del portal medido el 2026-09-22:
-- `docs/diagnosticos/2026-09-22_paso3-vector-portal.md` (reports). Un usuario del portal
-- ENTRABA al cuerpo de las seis RPC; `fn_siguiente_recibo` además no tenía guard de
-- ningún tipo, así que cualquier `authenticated` podía consumir la numeración de recibos
-- de cualquier club.
--
-- Cambios:
--   1. guard 0 (quién llama), ANTES de cualquier escritura: service_role por auth.role(),
--      super_admin o staff (fn_is_staff = super_admin | secretario_carreras | operador,
--      activo). Portal, sesión sin fila en `usuarios` y anon → 42501.
--   2. guard de club: el número que se pide tiene que ser del club del que llama
--      (super_admin y service_role pasan, como en rpc_cambiar_monta).
--
-- OJO — esta función se invoca DESDE ADENTRO de `emitir_recibo` (emitir_recibo v1.2, línea
-- `v_num := fn_siguiente_recibo(p_club_id)`). Adentro de un SECURITY DEFINER el
-- `current_user` cambia, pero `auth.uid()`/`auth.role()` leen el GUC `request.jwt.claims`,
-- que se conserva: el guard ve al mismo llamador que el de emitir_recibo y no corta la
-- cadena. Por eso esta migración está EN EL CAMINO DE PAGO y se aplica junto con
-- emitir_recibo, no antes.
--
-- Guards (2026-09-22): pwd=/home/clio/dev/SGH · spcs=210 · ref=unlhcuanfrtpatoipwve.
-- Rollback: migrations/rollback_guard_staff_fn_siguiente_recibo.sql
--           (md5 de pg_get_functiondef de la versión que restaura: 1b92fbbac309e175c1f0b145638a6399)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_siguiente_recibo(p_club_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_num       INTEGER;
  v_user_club uuid;
BEGIN
  -- ── guard 0 · QUIÉN LLAMA ───────────────────────────────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role'
          OR fn_is_super_admin() OR fn_is_staff()) THEN
    RAISE EXCEPTION 'fn_siguiente_recibo: sin permiso' USING ERRCODE = '42501';
  END IF;

  -- ── guard de club ───────────────────────────────────────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR fn_is_super_admin()) THEN
    v_user_club := fn_get_user_club_id();
    IF v_user_club IS NULL THEN
      RAISE EXCEPTION 'fn_siguiente_recibo: la sesión no tiene hipódromo asignado' USING ERRCODE = '42501';
    END IF;
    IF p_club_id IS DISTINCT FROM v_user_club THEN
      RAISE EXCEPTION 'fn_siguiente_recibo: es de otro hipódromo' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO club_secuencias (club_id, tipo, ultimo_numero)
  VALUES (p_club_id, 'recibo', 1)
  ON CONFLICT (club_id, tipo)
  DO UPDATE SET ultimo_numero = club_secuencias.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_num;
  RETURN v_num;
END $function$;
