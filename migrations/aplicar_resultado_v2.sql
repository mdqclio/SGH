-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- aplicar_resultado v2 — ISSUE-102 (reunión cerrada), ISSUE-089 (oficial → provisional) e ISSUE-101
-- (oficializado_at / oficializado_por)
--
-- ESTADO EN PRODUCCIÓN: ver CHANGELOG / informe del día. Paso 3 de 4 (después de
-- resultados_guard_cerrada.sql).
-- md5(pg_get_functiondef) esperado: tests/local/resultados_cerrada_md5_esperado.txt (medido en el sandbox
-- aplicando ESTE archivo). Paso obligatorio después del apply_migration: compararlo (GOTCHA #99).
--
-- Cambios contra v1 (md5 94d46dc0ed70e78329169bb3926f64c2), guards 0 y de club iguales:
--   · reunión con liquidación cerrada → RAISE P0092 'aplicar_resultado: …' antes de leer o escribir nada
--     del resultado (el trigger del paso 2 lo sostiene igual). Pasa sólo la marca sgh.correccion_resultado.
--   · lock FOR UPDATE siempre que haya p_resultado_id (antes sólo con p_expected_updated_at), para leer el
--     estado previo; el chequeo optimista no cambia.
--   · oficial → cualquier otro estado → RAISE P0089: se des-oficializa con desoficializar_carrera (que
--     mira la plata comprometida). Corta el F10 de la vista oficial (ISSUE-089).
--   · → oficial desde otro estado: oficializado_at = now(), oficializado_por = usuario de la sesión
--     (NULL con service_role). oficial → oficial: se conservan. Cualquier otro estado: NULL.
-- Rollback: migrations/rollback_aplicar_resultado_v2.sql (v1 exacta).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE OR REPLACE FUNCTION public.aplicar_resultado(p_resultado_id uuid, p_expected_updated_at timestamp with time zone, p_carrera_id uuid, p_estado text, p_estado_pista text, p_tiempo_ganador text, p_incidentes text, p_favorito_mandil integer, p_redistribucion_legs jsonb, p_posiciones jsonb, p_apuestas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at TIMESTAMPTZ;
  v_res_id             UUID;
  v_carrera_id         UUID;
  v_club               UUID;
  v_user_club          UUID;
  v_reunion_id         UUID;
  v_carrera_txt        TEXT;
  v_prev_estado        TEXT;
  v_prev_at            TIMESTAMPTZ;
  v_prev_por           UUID;
  v_ofi_at             TIMESTAMPTZ;
  v_ofi_por            UUID;
BEGIN
  -- ── guard 0 · QUIÉN LLAMA ───────────────────────────────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role'
          OR fn_is_super_admin() OR fn_is_staff()) THEN
    RAISE EXCEPTION 'aplicar_resultado: sin permiso' USING ERRCODE = '42501';
  END IF;

  v_carrera_id := COALESCE(p_carrera_id,
                           (SELECT r.carrera_id FROM resultados r WHERE r.id = p_resultado_id));

  -- ── guard de club ───────────────────────────────────────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR fn_is_super_admin()) THEN
    v_club := fn_club_de_carrera(v_carrera_id);
    v_user_club := fn_get_user_club_id();
    IF v_user_club IS NULL THEN
      RAISE EXCEPTION 'aplicar_resultado: la sesión no tiene hipódromo asignado' USING ERRCODE = '42501';
    END IF;
    IF v_club IS DISTINCT FROM v_user_club THEN
      RAISE EXCEPTION 'aplicar_resultado: la carrera es de otro hipódromo' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── guard de reunión cerrada (ISSUE-102) ────────────────────────────────────
  -- Primera capa: el trigger trg_resultado_cerrado lo sostiene igual en las tres tablas. Pasa sólo la
  -- corrección con resolución (marca sgh.correccion_resultado, paso 4). service_role NO pasa.
  SELECT c.reunion_id, coalesce(c.numero_carrera_programa::text, 'del turno ' || c.numero_turno)
    INTO v_reunion_id, v_carrera_txt
    FROM carreras c WHERE c.id = v_carrera_id;
  IF fn_reunion_liq_cerrada(v_reunion_id)
     AND coalesce(current_setting('sgh.correccion_resultado', true), '') <> '1' THEN
    RAISE EXCEPTION 'aplicar_resultado: la liquidación de esta reunión está cerrada (saldada): el resultado de la carrera % no se puede modificar. Si un fallo (p. ej. de doping) obliga a cambiarlo, lo corrige un super_admin con la resolución. ISSUE-102', v_carrera_txt
      USING ERRCODE = 'P0092';
  END IF;

  -- Estado previo + lock (siempre que haya resultado) + optimistic locking
  IF p_resultado_id IS NOT NULL THEN
    SELECT updated_at, estado::text, oficializado_at, oficializado_por
      INTO v_current_updated_at, v_prev_estado, v_prev_at, v_prev_por
      FROM resultados
      WHERE id = p_resultado_id
      FOR UPDATE;
    IF p_expected_updated_at IS NOT NULL
       AND v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'CONCURRENT_MODIFICATION'
        USING DETAIL = 'El resultado fue modificado por otro operador. Recargá antes de guardar.';
    END IF;
  END IF;

  -- ── oficial → otro estado: no por acá (ISSUE-089) ───────────────────────────
  -- F10 en la vista oficial degradaba la carrera con todos "no corrió". Des-oficializar tiene su RPC,
  -- que mira la plata comprometida.
  IF v_prev_estado = 'oficial' AND p_estado IS DISTINCT FROM 'oficial' THEN
    RAISE EXCEPTION 'aplicar_resultado: la carrera % está oficial; para corregirla, des-oficializala primero (botón Des-oficializar). ISSUE-089', v_carrera_txt
      USING ERRCODE = 'P0089';
  END IF;

  -- ── quién y cuándo oficializó (ISSUE-101) ───────────────────────────────────
  IF p_estado = 'oficial' THEN
    IF v_prev_estado = 'oficial' THEN
      v_ofi_at := v_prev_at;           -- re-aplicar una oficial no cambia quién ni cuándo
      v_ofi_por := v_prev_por;
    ELSE
      v_ofi_at := now();
      v_ofi_por := (SELECT u.id FROM usuarios u WHERE u.auth_user_id = auth.uid() LIMIT 1);   -- NULL con service_role
    END IF;
  ELSE
    v_ofi_at := NULL;
    v_ofi_por := NULL;
  END IF;

  -- Upsert resultado
  IF p_resultado_id IS NULL THEN
    INSERT INTO resultados (
      carrera_id, estado, tiempo_ganador, incidentes,
      estado_pista, favorito_mandil, redistribucion_legs,
      oficializado_at, oficializado_por
    ) VALUES (
      p_carrera_id,
      p_estado::estado_resultado,
      p_tiempo_ganador,
      p_incidentes,
      p_estado_pista,
      p_favorito_mandil,
      COALESCE(p_redistribucion_legs, '{}'::jsonb),
      v_ofi_at,
      v_ofi_por
    )
    RETURNING id INTO v_res_id;
  ELSE
    UPDATE resultados SET
      estado              = p_estado::estado_resultado,
      tiempo_ganador      = p_tiempo_ganador,
      incidentes          = p_incidentes,
      estado_pista        = p_estado_pista,
      favorito_mandil     = p_favorito_mandil,
      redistribucion_legs = COALESCE(p_redistribucion_legs, '{}'::jsonb),
      oficializado_at     = v_ofi_at,
      oficializado_por    = v_ofi_por
    WHERE id = p_resultado_id;
    v_res_id := p_resultado_id;
  END IF;

  -- Posiciones
  DELETE FROM resultado_posiciones WHERE resultado_id = v_res_id;
  IF p_posiciones IS NOT NULL AND jsonb_array_length(p_posiciones) > 0 THEN
    INSERT INTO resultado_posiciones (
      resultado_id, inscripcion_id, posicion, no_largo, descalificado,
      tiempo, diferencia, motivo_desc, empate, dividendo
    )
    SELECT
      v_res_id,
      (x->>'inscripcion_id')::uuid,
      (x->>'posicion')::integer,
      COALESCE((x->>'no_largo')::boolean, false),
      COALESCE((x->>'descalificado')::boolean, false),
      x->>'tiempo',
      x->>'diferencia',
      x->>'motivo_desc',
      COALESCE((x->>'empate')::boolean, false),
      (x->>'dividendo')::numeric
    FROM jsonb_array_elements(p_posiciones) AS x;
  END IF;

  -- Apuestas
  DELETE FROM resultado_apuestas WHERE resultado_id = v_res_id;
  IF p_apuestas IS NOT NULL AND jsonb_array_length(p_apuestas) > 0 THEN
    INSERT INTO resultado_apuestas (
      resultado_id, tipo, val_apu, composicion,
      pozo, vales, div_orig, div_inc, vacante, orden
    )
    SELECT
      v_res_id,
      x->>'tipo',
      COALESCE((x->>'val_apu')::numeric, 100),
      NULLIF(x->>'composicion', ''),
      (x->>'pozo')::numeric,
      (x->>'vales')::integer,
      (x->>'div_orig')::numeric,
      (x->>'div_inc')::numeric,
      COALESCE((x->>'vacante')::boolean, false),
      COALESCE((x->>'orden')::smallint, 0)
    FROM jsonb_array_elements(p_apuestas) AS x;
  END IF;

  RETURN jsonb_build_object(
    'resultado_id', v_res_id,
    'updated_at',   (SELECT updated_at FROM resultados WHERE id = v_res_id)
  );

END;
$function$;

COMMIT;
