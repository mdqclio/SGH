-- ═══════════════════════════════════════════════════════════════════════════════
-- GUARD DE STAFF (2/6) — liberar_linea
--
-- ESTADO EN PRODUCCIÓN: **APLICADA en prod el 2026-09-22** — migración `20260922170638 guard_staff_liberar_linea`;
--   md5 de `pg_get_functiondef` VERIFICADO en prod: 127d7199a4c22aaf20b6dd057758fc32. Re-verificado el 2026-09-23 con la tanda completa
--   (probe 60/60 y 8/8 mutantes).
--
-- MD5 ESPERADO de `pg_get_functiondef` DESPUÉS de aplicar (es el ÚNICO md5 que prueba algo
-- sobre prod; el md5 de este archivo no — GOTCHA #99):
--   liberar_linea: 127d7199a4c22aaf20b6dd057758fc32  (1606 bytes, 46 líneas)
-- Paso obligatorio inmediatamente después del apply_migration:
--   select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='liberar_linea';
-- Si no coincide, REAPLICAR con el texto exacto de este archivo antes de dar nada por hecho.
--
-- Vector del portal (2026-09-22, `…_paso3-vector-portal.md` §4): un usuario del portal
-- ENTRABA al cuerpo, y su `fn_get_user_club_id()` es el de Dolores, así que el guard de
-- club lo dejaba pasar. Con el id de una línea retenida propia (que ve por RLS) podía
-- liberarla antes del control anti-doping.
--
-- Cambios:
--   1. guard 0 (quién llama), antes de cualquier SELECT.
--   2. guard de club: se reemplaza el patrón `fn_get_user_club_id() IS NOT NULL AND …`
--      (que infiere service_role de un club NULL — ISSUE-090) por el de rpc_cambiar_monta.
--   3. El 42501 del guard de club: antes ese RAISE no llevaba ERRCODE (salía P0001).
--
-- Nada más cambia: mismo mensaje de "línea inexistente", misma transición retenido→impago,
-- mismo RETURN. Lo usa `liquidaciones.html:1607` (botón "Habilitar" en Pagos) con sesión
-- staff, y los probes con service_role.
--
-- Guards (2026-09-22): pwd=/home/clio/dev/SGH · spcs=210 · ref=unlhcuanfrtpatoipwve ·
-- R9: 30/30 líneas de premio 1°/2° en `retenido`, 0 con recibo, liberación 2026-10-20.
-- Rollback: migrations/rollback_guard_staff_liberar_linea.sql
--           (md5 de la versión que restaura: da404453eda5a68ed28f612b46c878e2)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.liberar_linea(p_linea_id uuid)
 RETURNS liquidacion_detalle
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row       liquidacion_detalle;
  v_club      uuid;
  v_user_club uuid;
BEGIN
  -- ── guard 0 · QUIÉN LLAMA ───────────────────────────────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role'
          OR fn_is_super_admin() OR fn_is_staff()) THEN
    RAISE EXCEPTION 'liberar_linea: sin permiso' USING ERRCODE = '42501';
  END IF;

  SELECT fn_club_de_liquidacion(liquidacion_id) INTO v_club
    FROM liquidacion_detalle WHERE id = p_linea_id;
  IF v_club IS NULL AND NOT EXISTS (SELECT 1 FROM liquidacion_detalle WHERE id = p_linea_id) THEN
    RAISE EXCEPTION 'liberar_linea: línea inexistente';
  END IF;

  -- ── guard de club (ISSUE-090: club NULL ya no pasa) ─────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR fn_is_super_admin()) THEN
    v_user_club := fn_get_user_club_id();
    IF v_user_club IS NULL THEN
      RAISE EXCEPTION 'liberar_linea: la sesión no tiene hipódromo asignado' USING ERRCODE = '42501';
    END IF;
    IF v_club IS DISTINCT FROM v_user_club THEN
      RAISE EXCEPTION 'liberar_linea: línea de otro club' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE liquidacion_detalle
     SET estado_linea = 'impago'
   WHERE id = p_linea_id AND estado_linea = 'retenido'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'liberar_linea: la línea no existe o no está en retenido';
  END IF;

  RETURN v_row;
END $function$;
