-- ═══════════════════════════════════════════════════════════════════════════════
-- GUARD DE STAFF (4/6) — aplicar_resultado
--
-- ESTADO EN PRODUCCIÓN: **APLICADA en prod el 2026-09-22** — migración `20260922171044 guard_staff_aplicar_resultado`;
--   md5 de `pg_get_functiondef` VERIFICADO en prod: 94d46dc0ed70e78329169bb3926f64c2. Re-verificado el 2026-09-23 con la tanda completa
--   (probe 60/60 y 8/8 mutantes).
--
-- MD5 ESPERADO de `pg_get_functiondef` DESPUÉS de aplicar (es el ÚNICO md5 que prueba algo
-- sobre prod; el md5 de este archivo no — GOTCHA #99):
--   aplicar_resultado: 94d46dc0ed70e78329169bb3926f64c2  (4546 bytes, 122 líneas)
-- Paso obligatorio inmediatamente después del apply_migration:
--   select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='aplicar_resultado';
-- Si no coincide, REAPLICAR con el texto exacto de este archivo antes de dar nada por hecho.
--
-- Vector del portal (2026-09-22, `…_paso3-vector-portal.md` §4): la función NO tenía
-- guard de ningún tipo. Medido con una sesión de portal real y un carrera_id inexistente,
-- llegaba hasta el INSERT (`23503 …violates foreign key "resultados_carrera_id_fkey"`).
-- Con un carrera_id REAL —y el portal lee las 60 carreras del club con sus id por RLS—
-- escribía el resultado: estado, posiciones y dividendos de cualquier carrera del club.
--
-- Cambios (el cuerpo —lock optimista, upsert, posiciones, apuestas— queda IDÉNTICO):
--   1. guard 0 (quién llama), antes del lock optimista y de cualquier SELECT.
--   2. guard de club sobre la carrera (fn_club_de_carrera), con bypass de super_admin y
--      service_role. Se resuelve el carrera_id del resultado cuando viene p_resultado_id
--      y p_carrera_id es NULL, para que el guard no se pueda esquivar mandando sólo el id
--      del resultado.
--
-- NO agrega el guard de "resultado ya oficial" — eso es ISSUE-089 y va aparte.
--
-- La llama `resultados.html:1571` (F10 `aplicar()` y `oficializar()`) con sesión staff, y
-- los probes `smoke_full`, `probe_estado_pista`, `probe_nav_dirty`, `probe_tiempo_ganador`
-- con service_role.
--
-- Guards (2026-09-22): pwd=/home/clio/dev/SGH · spcs=210 · ref=unlhcuanfrtpatoipwve.
-- Rollback: migrations/rollback_guard_staff_aplicar_resultado.sql
--           (md5 de la versión que restaura: 2af0444ad430c634d3648bb6dd0c9daf)
-- ═══════════════════════════════════════════════════════════════════════════════

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
BEGIN
  -- ── guard 0 · QUIÉN LLAMA ───────────────────────────────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role'
          OR fn_is_super_admin() OR fn_is_staff()) THEN
    RAISE EXCEPTION 'aplicar_resultado: sin permiso' USING ERRCODE = '42501';
  END IF;

  -- ── guard de club (nuevo: antes no había) ───────────────────────────────────
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR fn_is_super_admin()) THEN
    v_carrera_id := COALESCE(p_carrera_id,
                             (SELECT r.carrera_id FROM resultados r WHERE r.id = p_resultado_id));
    v_club := fn_club_de_carrera(v_carrera_id);
    v_user_club := fn_get_user_club_id();
    IF v_user_club IS NULL THEN
      RAISE EXCEPTION 'aplicar_resultado: la sesión no tiene hipódromo asignado' USING ERRCODE = '42501';
    END IF;
    IF v_club IS DISTINCT FROM v_user_club THEN
      RAISE EXCEPTION 'aplicar_resultado: la carrera es de otro hipódromo' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Optimistic locking con FOR UPDATE para cerrar race en escrituras concurrentes
  IF p_resultado_id IS NOT NULL AND p_expected_updated_at IS NOT NULL THEN
    SELECT updated_at INTO v_current_updated_at
      FROM resultados
      WHERE id = p_resultado_id
      FOR UPDATE;
    IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'CONCURRENT_MODIFICATION'
        USING DETAIL = 'El resultado fue modificado por otro operador. Recargá antes de guardar.';
    END IF;
  END IF;

  -- Upsert resultado
  IF p_resultado_id IS NULL THEN
    INSERT INTO resultados (
      carrera_id, estado, tiempo_ganador, incidentes,
      estado_pista, favorito_mandil, redistribucion_legs
    ) VALUES (
      p_carrera_id,
      p_estado::estado_resultado,
      p_tiempo_ganador,
      p_incidentes,
      p_estado_pista,
      p_favorito_mandil,
      COALESCE(p_redistribucion_legs, '{}'::jsonb)
    )
    RETURNING id INTO v_res_id;
  ELSE
    UPDATE resultados SET
      estado              = p_estado::estado_resultado,
      tiempo_ganador      = p_tiempo_ganador,
      incidentes          = p_incidentes,
      estado_pista        = p_estado_pista,
      favorito_mandil     = p_favorito_mandil,
      redistribucion_legs = COALESCE(p_redistribucion_legs, '{}'::jsonb)
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
