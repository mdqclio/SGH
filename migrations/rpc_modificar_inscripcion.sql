-- ============================================================================
-- rpc_modificar_inscripcion — el entrenador modifica lo suyo desde el portal
--
-- Pedido de Yesi (14/09/2026): botón "Modificar" en Mis inscripciones. Puede
-- cambiar caballeriza, entrenador que presenta, jockey y suplente. NO el SPC
-- ni el turno (eso es retirar y anotar de nuevo).
--
-- Plan: docs/diagnosticos/2026-09-14_plan-modificar-inscripcion-portal.md
-- (reports). GATE-1 resuelto en B: NO se transfiere inscripto_por al cambiar
-- el entrenador — la tenencia sigue siendo "quién la cargó" (ISSUE-082).
--
-- Guards: los mismos de rpc_baja_inscripcion, en el mismo orden —
--   propia (canal='portal' AND inscripto_por = yo), reunión publicada, ventana
--   de inscripción O de ratificación (fail-closed sobre carreras.*).
-- Validaciones de padrón: las de rpc_inscribir, contra el club de la reunión.
--
-- Cadena del propietario: trg_insc_set_propietario (BEFORE UPDATE OF
-- caballeriza_id) re-deriva propietario_id. Si la caballeriza nueva no tiene
-- titular activo, el trigger deja NULL sin avisar (GOTCHA #47). Acá se detecta
-- ANTES y se devuelve `sin_propietario` para que la UI lo diga. No se bloquea:
-- ese pozo lo regulariza la secretaría (propietarios_provisorios_r9.sql).
--
-- Aplicar por MCP apply_migration (nombre: rpc_modificar_inscripcion_portal).
-- 2026-09-16: el classifier del auto mode denegó el apply_migration ("Production
-- Deploy"); la función se validó en una transacción con ROLLBACK (compila) y
-- queda PENDIENTE de aplicar con OK de Leo. Hasta entonces el botón del portal
-- falla con "Could not find the function".
-- Rollback: DROP FUNCTION public.rpc_modificar_inscripcion(uuid,uuid,uuid,uuid,uuid);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_modificar_inscripcion(
  p_inscripcion_id     uuid,
  p_caballeriza_id     uuid,
  p_entrenador_id      uuid,
  p_jockey_titular_id  uuid DEFAULT NULL,
  p_jockey_suplente_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_usuario_id         uuid;
  v_insc               RECORD;
  v_carrera            RECORD;
  v_club_id            uuid;
  v_en_inscripcion     boolean;
  v_en_ratificacion    boolean;
  v_titular_nuevo      uuid;      -- propietario_id que va a derivar el trigger
  v_sin_propietario    boolean;
  v_cambio_entrenador  boolean;
  v_propietario_post   uuid;
  v_inscripto_por_post uuid;
BEGIN
  -- (1) entidad de portal
  IF NOT EXISTS (
    SELECT 1 FROM fn_mis_entidades() e
     WHERE e.entidad_tipo IN ('profesional', 'propietario')
  ) THEN
    RAISE EXCEPTION 'No autorizado: esta operación es para usuarios del portal.';
  END IF;

  -- (2) usuario activo
  SELECT u.id INTO v_usuario_id
    FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: la cuenta no tiene usuario activo.';
  END IF;

  -- (3) la fila existe. FOR UPDATE: dos pestañas no se pisan, y si la
  --     secretaría está ratificando esta misma fila, el estado que se chequea
  --     en (7) es el que va a quedar.
  SELECT * INTO v_insc FROM inscripciones WHERE id = p_inscripcion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa inscripción no existe.';
  END IF;

  -- (4) propia: canal='portal' AND inscripto_por = el que llama (= baja)
  IF v_insc.canal IS DISTINCT FROM 'portal'
     OR v_insc.inscripto_por IS DISTINCT FROM v_usuario_id
  THEN
    RAISE EXCEPTION 'Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.';
  END IF;

  -- (5) reunión publicada, carrera no anulada
  SELECT c.*, r.estado::text AS reunion_estado, r.club_id AS club_id
    INTO v_carrera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE c.id = v_insc.carrera_id;
  v_club_id := v_carrera.club_id;

  IF v_carrera.reunion_estado IS DISTINCT FROM 'publicada' THEN
    RAISE EXCEPTION 'Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.';
  END IF;
  IF v_carrera.estado IS NOT DISTINCT FROM 'anulada' THEN
    RAISE EXCEPTION 'Ese turno está anulado.';
  END IF;

  -- (6) las dos ventanas, fail-closed (idéntico a rpc_baja_inscripcion)
  v_en_inscripcion := v_carrera.apertura_inscripcion IS NOT NULL
                  AND v_carrera.cierre_inscripcion   IS NOT NULL
                  AND now() >= v_carrera.apertura_inscripcion
                  AND now() <= v_carrera.cierre_inscripcion;

  v_en_ratificacion := v_carrera.apertura_ratificacion IS NOT NULL
                   AND v_carrera.cierre_ratificacion   IS NOT NULL
                   AND now() >= v_carrera.apertura_ratificacion
                   AND now() <= v_carrera.cierre_ratificacion;

  IF NOT (v_en_inscripcion OR v_en_ratificacion) THEN
    RAISE EXCEPTION 'Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.';
  END IF;

  -- (7) estado admitido según ventana (espejo de la baja)
  IF v_en_inscripcion AND NOT v_en_ratificacion THEN
    IF v_insc.estado IS DISTINCT FROM 'inscripto' THEN
      RAISE EXCEPTION 'Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.';
    END IF;
  ELSE
    IF v_insc.estado NOT IN ('inscripto', 'ratificado') THEN
      RAISE EXCEPTION 'Ese caballo ya figura como % y no se puede modificar desde el portal.', v_insc.estado;
    END IF;
  END IF;

  -- (8) padrón, contra el club de la reunión (= rpc_inscribir)
  IF p_caballeriza_id IS NULL THEN
    RAISE EXCEPTION 'Falta la caballeriza: es obligatoria.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM caballerizas
     WHERE id = p_caballeriza_id AND activo AND club_id = v_club_id
  ) THEN
    RAISE EXCEPTION 'Esa caballeriza no existe o no está activa en este hipódromo.';
  END IF;

  IF p_entrenador_id IS NULL THEN
    RAISE EXCEPTION 'Falta el entrenador: hay que declarar quién presenta el caballo.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM profesionales
     WHERE id = p_entrenador_id AND activo
       AND tipo IN ('entrenador', 'ambos') AND club_id = v_club_id
  ) THEN
    RAISE EXCEPTION 'El entrenador declarado no está en el padrón activo de este hipódromo.';
  END IF;

  IF p_jockey_titular_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM profesionales
        WHERE id = p_jockey_titular_id AND activo
          AND tipo IN ('jockey', 'ambos') AND club_id = v_club_id
     )
  THEN
    RAISE EXCEPTION 'El jockey declarado no está en el padrón activo de este hipódromo.';
  END IF;

  IF p_jockey_suplente_id IS NOT NULL THEN
    IF p_jockey_titular_id IS NULL THEN
      RAISE EXCEPTION 'No se puede declarar un suplente sin jockey titular.';
    END IF;
    IF p_jockey_suplente_id = p_jockey_titular_id THEN
      RAISE EXCEPTION 'El suplente no puede ser el mismo jockey que el titular.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM profesionales
       WHERE id = p_jockey_suplente_id AND activo
         AND tipo IN ('jockey', 'ambos') AND club_id = v_club_id
    ) THEN
      RAISE EXCEPTION 'El jockey suplente no está en el padrón activo de este hipódromo.';
    END IF;
  END IF;

  -- (9) un ratificado no se queda sin jockey (ratificacion.html no ratifica sin jockey)
  IF v_insc.estado = 'ratificado' AND p_jockey_titular_id IS NULL THEN
    RAISE EXCEPTION 'Un caballo ratificado tiene que tener jockey. Para cambiarlo, elegí otro; para sacarlo, hablá con la secretaría.';
  END IF;

  -- (10) cadena del propietario: qué va a derivar el trigger para la
  --      caballeriza nueva. Se mira ANTES para poder decirlo.
  SELECT cr.propietario_id INTO v_titular_nuevo
    FROM caballeriza_responsables cr
   WHERE cr.caballeriza_id = p_caballeriza_id AND cr.rol = 'propietario' AND cr.activo = true
   LIMIT 1;
  v_sin_propietario := v_titular_nuevo IS NULL;

  v_cambio_entrenador := p_entrenador_id IS DISTINCT FROM v_insc.entrenador_id;

  -- (11) el UPDATE. Sólo las cuatro columnas. spc_id, carrera_id, estado,
  --      numero_partidor, canal, inscripto_por NO están en el SET: no hay
  --      forma de tocarlos. El trigger trg_insc_set_propietario re-deriva
  --      propietario_id.
  UPDATE inscripciones
     SET caballeriza_id     = p_caballeriza_id,
         entrenador_id      = p_entrenador_id,
         jockey_titular_id  = p_jockey_titular_id,
         jockey_suplente_id = p_jockey_suplente_id
   WHERE id = p_inscripcion_id;

  -- ── GATE-1 = A (regla literal de Yesi) — NO ACTIVO, se eligió B ──────────
  -- Si el entrenador que presenta cambió y no soy yo, la fila pasaría a ser
  -- del usuario del portal de ese entrenador; si no tiene usuario, de nadie
  -- (sólo secretaría). Queda el rastro en auditoria (OLD/NEW). Para activarlo,
  -- descomentar este bloque y cambiar el texto del confirm() en portal.html.
  -- IF v_cambio_entrenador AND NOT EXISTS (
  --      SELECT 1 FROM fn_mis_entidades() e
  --       WHERE e.entidad_tipo = 'profesional' AND e.entidad_id = p_entrenador_id)
  -- THEN
  --   UPDATE inscripciones
  --      SET inscripto_por = (SELECT u.id FROM usuarios u
  --                            WHERE u.entidad_tipo = 'profesional'
  --                              AND u.entidad_id = p_entrenador_id
  --                              AND u.activo
  --                            ORDER BY u.created_at LIMIT 1)
  --    WHERE id = p_inscripcion_id;
  -- END IF;
  -- ─────────────────────────────────────────────────────────────────────────

  -- (12) releer y verificar que el trigger hizo lo que se esperaba
  SELECT propietario_id, inscripto_por INTO v_propietario_post, v_inscripto_por_post
    FROM inscripciones WHERE id = p_inscripcion_id;

  IF v_propietario_post IS DISTINCT FROM v_titular_nuevo THEN
    -- Defensivo: si esto salta, el trigger cambió o alguien lo deshabilitó.
    RAISE EXCEPTION 'La derivación del propietario no coincide (esperado %, quedó %). No se guardó.',
      v_titular_nuevo, v_propietario_post;
  END IF;

  RETURN jsonb_build_object(
    'ok',                true,
    'inscripcion_id',    p_inscripcion_id,
    'propietario_id',    v_propietario_post,
    'sin_propietario',   v_sin_propietario,
    'cambio_entrenador', v_cambio_entrenador,
    'sigue_siendo_mia',  v_inscripto_por_post = v_usuario_id
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_modificar_inscripcion(uuid, uuid, uuid, uuid, uuid) IS
  'Portal: modificar caballeriza/entrenador/jockey/suplente de una inscripción propia (canal=portal, inscripto_por=yo) dentro de la ventana de inscripción o de ratificación. Devuelve jsonb con sin_propietario y sigue_siendo_mia. Pedido de Yesi 14/09/2026.';

REVOKE ALL     ON FUNCTION public.rpc_modificar_inscripcion(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.rpc_modificar_inscripcion(uuid, uuid, uuid, uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_modificar_inscripcion(uuid, uuid, uuid, uuid, uuid) TO authenticated;
