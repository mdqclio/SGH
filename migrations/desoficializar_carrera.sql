-- ============================================================
-- 2bis — desoficializar_carrera: guard duro (pay-safe) + estado->provisional
-- Rama: feat/oficializar-carrera
--
-- HARDENING DB OPCIONAL (defense-in-depth). El guard de pagos hoy se enforce en el
-- cliente (resultados.html::desoficializar) y el motor paid-safe NUNCA dropea una línea
-- pagada (backstop). Esta RPC mueve el guard + el flip de estado a la DB, atómico, con
-- RAISE real e imposible de bypassear desde el cliente. Aplicar por MCP (apply_migration);
-- luego el cliente puede llamar sb.rpc('desoficializar_carrera',{p_carrera_id}) en vez del
-- UPDATE directo. NO recalcula la liquidación: eso lo sigue haciendo el motor (cliente),
-- consistente con "orquestación del cliente, no transacción única".
--
-- Idempotente / reversible: CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION desoficializar_carrera(p_carrera_id uuid)
RETURNS resultados
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res    resultados;
  v_pagas  int;
BEGIN
  -- Guard duro: alguna línea de la carrera comprometida (cobrada o con recibo) bloquea.
  -- Scope de "línea de la carrera": carrera_id directo O inscripcion en la carrera (las
  -- líneas histericas pueden tener carrera_id null y derivarse por inscripcion_id).
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
END $$;
