-- RPC que atomiza upsert resultado + posiciones + apuestas en una sola transacción.
-- Incluye optimistic locking via updated_at para detectar modificaciones concurrentes.

CREATE OR REPLACE FUNCTION aplicar_resultado(
  p_resultado_id        UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_carrera_id          UUID,
  p_estado              TEXT,
  p_tiempo_clima        TEXT,
  p_estado_pista        TEXT,
  p_tiempo_ganador      TEXT,
  p_incidentes          TEXT,
  p_favorito_mandil     INTEGER,
  p_redistribucion_legs JSONB,
  p_posiciones          JSONB,
  p_apuestas            JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_updated_at TIMESTAMPTZ;
  v_res_id             UUID;
BEGIN

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
      estado_pista, favorito_mandil, redistribucion_legs, tiempo_clima
    ) VALUES (
      p_carrera_id,
      p_estado::estado_resultado,
      p_tiempo_ganador,
      p_incidentes,
      p_estado_pista,
      p_favorito_mandil,
      COALESCE(p_redistribucion_legs, '{}'::jsonb),
      p_tiempo_clima
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
      tiempo_clima        = p_tiempo_clima
    WHERE id = p_resultado_id;
    v_res_id := p_resultado_id;
  END IF;

  -- Posiciones
  DELETE FROM resultado_posiciones WHERE resultado_id = v_res_id;
  IF p_posiciones IS NOT NULL AND jsonb_array_length(p_posiciones) > 0 THEN
    INSERT INTO resultado_posiciones (
      resultado_id, inscripcion_id, posicion, descalificado,
      tiempo, diferencia, motivo_desc, empate, dividendo
    )
    SELECT
      v_res_id,
      (x->>'inscripcion_id')::uuid,
      (x->>'posicion')::integer,
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
$$;

GRANT EXECUTE ON FUNCTION aplicar_resultado TO anon, authenticated;
