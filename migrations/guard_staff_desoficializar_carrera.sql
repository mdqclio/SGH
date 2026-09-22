-- ═══════════════════════════════════════════════════════════════════════════════
-- GUARD DE STAFF (3/6) — desoficializar_carrera
--
-- ESTADO EN PRODUCCIÓN: **APLICADA en prod el 2026-09-22** — migración `20260922170817 guard_staff_desoficializar_carrera`; md5 en prod: c3247d72
--
--
-- Vector del portal (2026-09-22, `…_paso3-vector-portal.md` §4): la función NO tenía
-- guard de ningún tipo — ni de rol ni de club — y el portal lee las 60 carreras del club
-- con sus id por RLS. O sea: un propietario o entrenador con cuenta podía des-oficializar
-- cualquier carrera del hipódromo con líneas no cobradas.
--
-- Cambios (el guard de pagos y el UPDATE quedan idénticos):
--   1. guard 0 (quién llama), antes de cualquier SELECT.
--   2. guard de club: la carrera tiene que ser del club del que llama
--      (fn_club_de_carrera), con bypass de super_admin y service_role.
--
-- La llama `resultados.html:1694` con sesión staff, y `probe_oficializar_carrera.mjs`
-- con service_role.
--
-- Guards (2026-09-22): pwd=/home/clio/dev/SGH · spcs=210 · ref=unlhcuanfrtpatoipwve.
-- Rollback: migrations/rollback_guard_staff_desoficializar_carrera.sql
--           (md5 de la versión que restaura: f4d376803f2a694480a1469a6f92eeae)
-- ═══════════════════════════════════════════════════════════════════════════════

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
