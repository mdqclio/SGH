-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- desoficializar_carrera v2 — ISSUE-102: no se des-oficializa una carrera de reunión con liquidación
-- cerrada (antes lo frenaba sólo la pantalla)
--
-- ESTADO EN PRODUCCIÓN: ver CHANGELOG / informe del día. Paso 4 de 4.
-- md5(pg_get_functiondef) esperado: tests/local/resultados_cerrada_md5_esperado.txt.
-- Cambio contra v1 (md5 c3247d72656833cd534e4c601900f25a): después de los guards 0 y de club, si la
-- reunión está cerrada → RAISE P0092 'desoficializar_carrera: …' (antes que el chequeo de pagos, para
-- que el mensaje sea éste). Pasa sólo la marca sgh.correccion_resultado. El resto, igual.
-- Rollback: migrations/rollback_desoficializar_carrera_v2.sql (v1 exacta).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

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
  v_reunion_id  uuid;
  v_carrera_txt text;
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

  -- ── guard de reunión cerrada (ISSUE-102) ────────────────────────────────────
  -- Antes sólo lo miraba la pantalla (resultados.html desoficializar()). El trigger trg_resultado_cerrado
  -- lo sostiene igual; acá va primero para que el mensaje sea éste y no el de "pagos emitidos".
  SELECT c.reunion_id, coalesce(c.numero_carrera_programa::text, 'del turno ' || c.numero_turno)
    INTO v_reunion_id, v_carrera_txt
    FROM carreras c WHERE c.id = p_carrera_id;
  IF fn_reunion_liq_cerrada(v_reunion_id)
     AND coalesce(current_setting('sgh.correccion_resultado', true), '') <> '1' THEN
    RAISE EXCEPTION 'desoficializar_carrera: la liquidación de esta reunión está cerrada (saldada): la carrera % no se puede des-oficializar. Si un fallo (p. ej. de doping) obliga a cambiar el resultado, lo corrige un super_admin con la resolución. ISSUE-102', v_carrera_txt
      USING ERRCODE = 'P0092';
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

COMMIT;
