-- ============================================================
-- reordenar_turnos — reordenamiento manual de los llamados de una carta
-- Rama: feat/orden-llamados
-- Diseño: docs/CARTA_LLAMADOS_ORDEN.md §2.2
--
-- Aplica una permutación de carreras.numero_turno dentro de una reunión.
--
-- Por qué una RPC y no dos UPDATE desde el front:
--   carreras_reunion_id_numero_turno_key es UNIQUE (reunion_id, numero_turno) y NO es
--   deferrable. Bajar el turno 3 al 4 y subir el 4 al 3 pasa por un estado intermedio con
--   dos filas en el mismo número y Postgres lo rechaza. Se resuelve con permutación en dos
--   fases dentro de una transacción (opción B del diseño — sin DDL sobre la constraint):
--     fase 1: todos los turnos a su negativo. Los negativos no pueden chocar con los
--             positivos que todavía no se movieron, y entre sí son únicos porque la
--             negación es inyectiva y los originales eran únicos.
--     fase 2: de los negativos a los valores finales 1..N.
--   La fase 1 sólo es segura si TODOS los turnos vigentes son positivos, así que se valida
--   antes (v_min_turno). Si algún día se agrega CHECK (numero_turno > 0), la fase 1 tiene
--   que pasar a un offset alto (+10000) en vez de negativo.
--
-- Estados: se permite reordenar en 'borrador' y 'programada' — el mismo criterio que el
--   canEdit de carta-llamados.html:621. 'publicada' y posteriores quedan bloqueados, como
--   hoy. Aflojar esa regla está PROPUESTO en §3.4 del diseño y NO implementado.
--   Ojo: la reunión objetivo (R9) está en 'programada', no en 'borrador'.
--
-- La confirmación por inscripciones afectadas es responsabilidad de la UI: esta función no
--   pregunta. Para eso está p_dry_run, que valida y devuelve el mismo resumen sin escribir.
--
-- Club scoping: SECURITY DEFINER saltea la RLS de carreras, así que se replica a mano el
--   criterio de la policy carreras_update (no portal + super_admin o club propio). El
--   service_role (sin usuario → fn_get_user_club_id() NULL) pasa, como en liberar_linea.
--   A diferencia de aquella, acá se revoca EXECUTE a anon/PUBLIC: la publishable key es
--   pública y sin eso cualquiera podría reordenar la carta de cualquier hipódromo.
--
-- Reversible: DROP FUNCTION reordenar_turnos(uuid, jsonb, boolean);
-- ============================================================

CREATE OR REPLACE FUNCTION reordenar_turnos(
  p_reunion_id uuid,
  p_orden      jsonb,               -- [{"id": "<uuid>", "turno": 1}, ...] orden final COMPLETO
  p_dry_run    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado     text;
  v_club       uuid;
  v_n          integer;
  v_entradas   integer;
  v_min_turno  integer;
  v_detalle    jsonb;
  v_movidas    integer;
  v_afectadas  integer;
BEGIN
  -- ---------- reunión y permisos ----------
  SELECT estado::text INTO v_estado FROM reuniones WHERE id = p_reunion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reordenar_turnos: reunión inexistente';
  END IF;

  IF fn_is_portal_user() THEN
    RAISE EXCEPTION 'reordenar_turnos: sin permiso';
  END IF;

  v_club := fn_club_de_reunion(p_reunion_id);
  IF fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin()
     AND v_club IS DISTINCT FROM fn_get_user_club_id() THEN
    RAISE EXCEPTION 'reordenar_turnos: reunión de otro club';
  END IF;

  -- ---------- validación 1: el estado habilita reordenar ----------
  IF v_estado NOT IN ('borrador', 'programada') THEN
    RAISE EXCEPTION 'reordenar_turnos: la reunión está %, la carta no se puede reordenar', v_estado;
  END IF;

  -- ---------- validación 4: el programa no puede estar numerado ----------
  -- Post-ratificación numero_carrera_programa fija el orden del programa impreso;
  -- reordenar los turnos ahí desincroniza la carta del programa. Bloqueo duro,
  -- independiente del estado.
  IF EXISTS (
    SELECT 1 FROM carreras
     WHERE reunion_id = p_reunion_id AND numero_carrera_programa IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'reordenar_turnos: el programa ya está numerado (numero_carrera_programa), reordenar desincronizaría la carta del programa';
  END IF;

  SELECT count(*), coalesce(min(numero_turno), 1)
    INTO v_n, v_min_turno
    FROM carreras WHERE reunion_id = p_reunion_id;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'reordenar_turnos: la reunión no tiene carreras';
  END IF;

  -- precondición de la fase 1 (ver cabecera)
  IF v_min_turno <= 0 THEN
    RAISE EXCEPTION 'reordenar_turnos: hay turnos <= 0 en la reunión, la permutación no es segura';
  END IF;

  -- ---------- validación 2: el orden coincide EXACTAMENTE con las carreras ----------
  -- Es también el control de concurrencia: si otra persona agregó o borró un turno mientras
  -- ésta armaba el orden, los conjuntos difieren y se rechaza en vez de pisar.
  SELECT count(*) INTO v_entradas FROM jsonb_array_elements(p_orden);
  IF v_entradas <> v_n THEN
    RAISE EXCEPTION 'reordenar_turnos: el orden trae % entradas y la reunión tiene % turnos', v_entradas, v_n;
  END IF;

  IF EXISTS (
    SELECT (e->>'id')::uuid FROM jsonb_array_elements(p_orden) e
    EXCEPT
    SELECT id FROM carreras WHERE reunion_id = p_reunion_id
  ) OR EXISTS (
    SELECT id FROM carreras WHERE reunion_id = p_reunion_id
    EXCEPT
    SELECT (e->>'id')::uuid FROM jsonb_array_elements(p_orden) e
  ) THEN
    RAISE EXCEPTION 'reordenar_turnos: el orden no coincide con las carreras de la reunión (¿alguien agregó o borró un turno?)';
  END IF;

  -- ---------- validación 3: los turnos son exactamente 1..N ----------
  IF EXISTS (
    SELECT (e->>'turno')::int FROM jsonb_array_elements(p_orden) e
    EXCEPT
    SELECT generate_series(1, v_n)
  ) OR (
    SELECT count(DISTINCT (e->>'turno')::int) FROM jsonb_array_elements(p_orden) e
  ) <> v_n THEN
    RAISE EXCEPTION 'reordenar_turnos: los turnos deben ser exactamente 1..% sin huecos ni repetidos', v_n;
  END IF;

  -- ---------- resumen (se calcula ANTES de escribir, sirve igual para el dry run) ----------
  SELECT jsonb_agg(x.fila ORDER BY x.turno_nuevo),
         count(*) FILTER (WHERE x.movida),
         coalesce(sum(x.inscriptos) FILTER (WHERE x.movida), 0)::int
    INTO v_detalle, v_movidas, v_afectadas
    FROM (
      SELECT n.turno AS turno_nuevo,
             c.numero_turno IS DISTINCT FROM n.turno AS movida,
             (SELECT count(*) FROM inscripciones i WHERE i.carrera_id = c.id)::int AS inscriptos,
             jsonb_build_object(
               'id',             c.id,
               'nombre',         c.nombre,
               'turno_anterior', c.numero_turno,
               'turno_nuevo',    n.turno,
               'inscriptos',     (SELECT count(*) FROM inscripciones i WHERE i.carrera_id = c.id)
             ) AS fila
        FROM carreras c
        JOIN (
          SELECT (e->>'id')::uuid AS id, (e->>'turno')::int AS turno
            FROM jsonb_array_elements(p_orden) e
        ) n ON n.id = c.id
       WHERE c.reunion_id = p_reunion_id
    ) x;

  -- ---------- escritura: permutación en dos fases ----------
  IF NOT p_dry_run THEN
    -- fase 1 — a negativos: no chocan con los positivos que todavía no se movieron
    UPDATE carreras SET numero_turno = -numero_turno WHERE reunion_id = p_reunion_id;

    -- fase 2 — a los valores finales
    UPDATE carreras c
       SET numero_turno = n.turno
      FROM (
        SELECT (e->>'id')::uuid AS id, (e->>'turno')::int AS turno
          FROM jsonb_array_elements(p_orden) e
      ) n
     WHERE c.id = n.id AND c.reunion_id = p_reunion_id;
  END IF;

  RETURN jsonb_build_object(
    'reunion_id',              p_reunion_id,
    'dry_run',                 p_dry_run,
    'turnos',                  v_n,
    'carreras_movidas',        v_movidas,
    'inscripciones_afectadas', v_afectadas,
    'detalle',                 coalesce(v_detalle, '[]'::jsonb)
  );
END;
$$;

-- La publishable key es pública: sin esto, un anónimo podría reordenar la carta de
-- cualquier hipódromo (la función es SECURITY DEFINER y saltea RLS).
REVOKE ALL ON FUNCTION reordenar_turnos(uuid, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION reordenar_turnos(uuid, jsonb, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION reordenar_turnos(uuid, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION reordenar_turnos(uuid, jsonb, boolean) TO service_role;
