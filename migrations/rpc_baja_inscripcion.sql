-- ============================================================
-- Gate 4.3 — rpc_baja_inscripcion: el entrenador retira lo suyo
-- ============================================================
-- Ver docs/AUTOREGISTRO_GATE_4.md §D. Autorizado por Leo el 06/08.
--
-- ALCANCE, Y POR QUÉ ES ESTE Y NO OTRO
--   Sólo se puede borrar una fila que cumpla LAS CUATRO condiciones:
--     1. canal = 'portal' AND inscripto_por = el usuarios.id del que llama
--        (inscripto_por es FK a usuarios, no a auth.users)
--          → es una fila que creó él, desde el portal. El portal NUNCA
--            puede borrar una inscripción cargada por la secretaría,
--            aunque sea del mismo caballo: si Yesi la cargó a mano hubo
--            una decisión de secretaría atrás.
--     2. la ventana de esa carrera SIGUE ABIERTA
--          → mientras la ventana está abierta la fila todavía no produjo
--            nada: no hay programa, ni sorteo, ni carta impresa, ni
--            mandiles. Con la ventana cerrada, retirarse es un FORFAIT,
--            que es acto de ratificación y está fuera de v1.
--     3. estado = 'inscripto'
--          → si ya está ratificada hay un acto de secretaría encima.
--   (Hasta el 24/08/2026 había una quinta condición: que el SPC siguiera en
--   fn_mis_spc_ids(). Se eliminó con el cambio de regla de inscripción libre
--   — si no hay tenencia al inscribir, tampoco puede haberla al retirar. La
--   fila sigue protegida por canal='portal' AND inscripto_por = el que llama,
--   que es más fuerte: sólo se borra lo que uno mismo cargó.)
--
--   Es DELETE y no un estado nuevo: la fila nunca tuvo efecto, y agregar un
--   valor al ENUM estado_inscripcion (rígido, GOTCHAS #4) para representar
--   algo que operativamente no existe sería peor.
--
-- ESTO NO ES LA BAJA DEL LUNES. La resolución multi-categoría —elegir en qué
-- carrera queda el caballo y dar de baja las otras— la sigue haciendo la
-- secretaría desde el back office.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_baja_inscripcion(p_inscripcion_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id uuid;
  v_insc    RECORD;
  v_carrera RECORD;
BEGIN
  -- 1. Sólo entrenadores del portal.
  IF NOT EXISTS (
    SELECT 1 FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'profesional'
  ) THEN
    RAISE EXCEPTION 'No autorizado: esta operación es para entrenadores del portal.';
  END IF;

  -- inscripto_por es FK a usuarios(id), no a auth.users.
  SELECT u.id INTO v_usuario_id
    FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: la cuenta no tiene usuario activo.';
  END IF;

  SELECT * INTO v_insc FROM inscripciones WHERE id = p_inscripcion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa inscripción no existe.';
  END IF;

  -- 2. Tiene que ser una fila que creó él, desde el portal.
  --    Las dos condiciones juntas, no una u otra.
  IF v_insc.canal IS DISTINCT FROM 'portal'
     OR v_insc.inscripto_por IS DISTINCT FROM v_usuario_id
  THEN
    RAISE EXCEPTION 'Esa inscripción no la cargó usted desde el portal. Para darla de baja, hablá con la secretaría.';
  END IF;

  -- 3. No ratificada.
  IF v_insc.estado IS DISTINCT FROM 'inscripto' THEN
    RAISE EXCEPTION 'Esa inscripción ya fue procesada por la secretaría y no se puede retirar desde el portal.';
  END IF;

  -- 4. Ventana abierta — mismo criterio que rpc_inscribir, fail-closed.
  SELECT c.*, r.estado::text AS reunion_estado
    INTO v_carrera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE c.id = v_insc.carrera_id;

  IF v_carrera.reunion_estado IS DISTINCT FROM 'publicada'
     OR v_carrera.apertura_inscripcion IS NULL
     OR v_carrera.cierre_inscripcion  IS NULL
     OR now() < v_carrera.apertura_inscripcion
     OR now() > v_carrera.cierre_inscripcion
  THEN
    RAISE EXCEPTION 'La inscripción para ese turno ya cerró. Para retirar el caballo, hablá con la secretaría.';
  END IF;

  -- 5. Borrado. Orden de FK: resultado_posiciones antes que inscripciones
  --    (GOTCHAS #12). Con la ventana abierta no puede haber resultados,
  --    pero el DELETE va igual para no depender de esa suposición.
  DELETE FROM resultado_posiciones WHERE inscripcion_id = p_inscripcion_id;
  DELETE FROM inscripciones        WHERE id = p_inscripcion_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.rpc_baja_inscripcion(uuid) IS
  'Gate 4 — el entrenador retira una inscripción propia hecha desde el portal, con la ventana abierta y antes de ratificar. Nunca toca filas cargadas por la secretaría.';

REVOKE ALL     ON FUNCTION public.rpc_baja_inscripcion(uuid) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.rpc_baja_inscripcion(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_baja_inscripcion(uuid) TO authenticated;

-- ============================================================
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.rpc_baja_inscripcion(uuid);
-- ============================================================
