-- Portal — declaración de monta al anotar (Yesi + Fede, 25/08/2026)
-- ---------------------------------------------------------------------------
-- Quien anota declara, al INSCRIBIR y no en la ratificación:
--   · caballeriza  — obligatoria
--   · entrenador   — obligatorio, el que PRESENTA el caballo
--   · jockey       — OPCIONAL: se anota de lunes a viernes y el compromiso de
--                    monta va hasta el martes. Obligatorio recién al ratificar.
--   · suplente     — opcional, y sólo si hay titular
--
-- Dos cambios de fondo:
--   1. `entrenador_id` deja de derivarse del que llama al RPC. Quien anota no
--      es necesariamente quien entrena. Quién anotó sigue quedando registrado
--      aparte, en `inscripto_por` + `canal='portal'`.
--   2. El PROPIETARIO puede anotar, declarando qué entrenador presenta el
--      caballo. El gate de los dos RPC deja de ser "sólo entidad profesional".
--      Si puede anotar tiene que poder retirar lo suyo, así que
--      `rpc_baja_inscripcion` se abre igual: la fila sigue protegida por
--      `canal='portal' AND inscripto_por = el que llama`, que es más fuerte
--      que el tipo de entidad.
--
-- No hay DDL de tablas: `inscripciones` ya tiene las cuatro columnas
-- (caballeriza_id, entrenador_id, jockey_titular_id, jockey_suplente_id).
--
-- `rpc_padron_profesionales()` existe porque el portal no puede leer
-- `profesionales` por RLS (`profesionales_select` = staff o uno mismo): sin
-- ella los selects del modal quedan vacíos.

DROP FUNCTION IF EXISTS public.rpc_padron_jockeys();

CREATE FUNCTION public.rpc_padron_profesionales()
RETURNS TABLE (id uuid, nombre text, apellido text, matricula_nro text, tipo text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.nombre::text, p.apellido::text, p.matricula_nro::text, p.tipo::text
    FROM profesionales p
   WHERE p.activo
     AND p.club_id = fn_get_user_club_id()
   ORDER BY p.apellido, p.nombre;
$function$;

REVOKE ALL ON FUNCTION public.rpc_padron_profesionales() FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_padron_profesionales() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- rpc_inscribir — DROP + CREATE: agregar parámetros crea un overload y
-- PostgREST no lo resuelve.

DROP FUNCTION IF EXISTS public.rpc_inscribir(uuid, uuid);
DROP FUNCTION IF EXISTS public.rpc_inscribir(uuid, uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.rpc_inscribir(uuid, uuid, uuid, uuid, uuid, uuid);

CREATE FUNCTION public.rpc_inscribir(
  p_spc_id             uuid,
  p_carrera_id         uuid,
  p_caballeriza_id     uuid,
  p_entrenador_id      uuid,
  p_jockey_titular_id  uuid DEFAULT NULL,
  p_jockey_suplente_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario_id     uuid;
  v_carrera        RECORD;
  v_reunion_estado text;
  v_club_id        uuid;
  v_spc            RECORD;
  v_ok             boolean;
  v_motivo         text;
  v_id             uuid;
BEGIN
  -- Entidad de portal: profesional O propietario. Quién anota queda en
  -- inscripto_por; quién entrena se declara en p_entrenador_id.
  IF NOT EXISTS (
    SELECT 1 FROM fn_mis_entidades() e
     WHERE e.entidad_tipo IN ('profesional', 'propietario')
  ) THEN
    RAISE EXCEPTION 'No autorizado: esta operación es para usuarios del portal.';
  END IF;

  SELECT u.id INTO v_usuario_id
    FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: la cuenta no tiene usuario activo.';
  END IF;

  -- SIN validación de tenencia (cambio de regla 24/08/2026). El caballo sólo
  -- tiene que existir; el control es disciplinario vía inscripto_por.
  SELECT * INTO v_spc FROM spcs WHERE id = p_spc_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El caballo no existe.';
  END IF;

  SELECT c.*, r.estado::text AS reunion_estado, r.club_id AS club_id
    INTO v_carrera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE c.id = p_carrera_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La carrera no existe.';
  END IF;

  v_reunion_estado := v_carrera.reunion_estado;
  v_club_id        := v_carrera.club_id;

  IF v_reunion_estado IS DISTINCT FROM 'publicada'
     OR v_carrera.estado IS NOT DISTINCT FROM 'anulada'
     OR v_carrera.apertura_inscripcion IS NULL
     OR v_carrera.cierre_inscripcion  IS NULL
     OR now() < v_carrera.apertura_inscripcion
     OR now() > v_carrera.cierre_inscripcion
  THEN
    RAISE EXCEPTION 'La inscripción para ese turno no está abierta.';
  END IF;

  -- Lo declarado se valida contra el padrón del club de la REUNIÓN, no del
  -- usuario: es el hipódromo donde se corre.
  IF p_caballeriza_id IS NULL THEN
    RAISE EXCEPTION 'Falta la caballeriza: es obligatoria para anotar.';
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

  -- Jockey OPCIONAL al anotar. Si viene, tiene que ser del padrón.
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

  SELECT v.puede_inscribirse, v.motivo
    INTO v_ok, v_motivo
    FROM validar_inscripcion(p_spc_id, p_carrera_id) v;

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'No se puede inscribir: %', COALESCE(v_motivo, 'no cumple las condiciones de la carrera');
  END IF;

  IF EXISTS (
    SELECT 1 FROM inscripciones
     WHERE carrera_id = p_carrera_id AND spc_id = p_spc_id
  ) THEN
    RAISE EXCEPTION 'Ese caballo ya está anotado en ese turno.';
  END IF;

  INSERT INTO inscripciones (
    carrera_id, spc_id, estado, canal, inscripto_por,
    entrenador_id, caballeriza_id, jockey_titular_id, jockey_suplente_id
  ) VALUES (
    p_carrera_id, p_spc_id,
    'inscripto',
    'portal',
    v_usuario_id,
    p_entrenador_id,
    p_caballeriza_id,
    p_jockey_titular_id,
    p_jockey_suplente_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION public.rpc_inscribir(uuid, uuid, uuid, uuid, uuid, uuid) IS
  'Inscripción desde el portal (profesionales y propietarios). Caballeriza y entrenador son obligatorios y DECLARADOS por quien anota, no derivados de él. El jockey es opcional al anotar: se define hasta el martes y es obligatorio en la ratificación. Quién anotó queda en inscripto_por + canal=portal.';

REVOKE ALL ON FUNCTION public.rpc_inscribir(uuid, uuid, uuid, uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_inscribir(uuid, uuid, uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- rpc_baja_inscripcion — mismo gate. Sólo cambia el IF de entidad; el resto
-- queda igual que en migrations/rpc_baja_inscripcion.sql.

CREATE OR REPLACE FUNCTION public.rpc_baja_inscripcion(p_inscripcion_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario_id uuid;
  v_insc    RECORD;
  v_carrera RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM fn_mis_entidades() e
     WHERE e.entidad_tipo IN ('profesional', 'propietario')
  ) THEN
    RAISE EXCEPTION 'No autorizado: esta operación es para usuarios del portal.';
  END IF;

  SELECT u.id INTO v_usuario_id
    FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: la cuenta no tiene usuario activo.';
  END IF;

  SELECT * INTO v_insc FROM inscripciones WHERE id = p_inscripcion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa inscripción no existe.';
  END IF;

  IF v_insc.canal IS DISTINCT FROM 'portal'
     OR v_insc.inscripto_por IS DISTINCT FROM v_usuario_id
  THEN
    RAISE EXCEPTION 'Esa inscripción no la cargó usted desde el portal. Para darla de baja, hablá con la secretaría.';
  END IF;

  IF v_insc.estado IS DISTINCT FROM 'inscripto' THEN
    RAISE EXCEPTION 'Esa inscripción ya fue procesada por la secretaría y no se puede retirar desde el portal.';
  END IF;

  -- Sin revalidación de tenencia (cambio de regla 24/08/2026): la fila queda
  -- protegida por canal='portal' AND inscripto_por = el que llama.

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

  DELETE FROM resultado_posiciones WHERE inscripcion_id = p_inscripcion_id;
  DELETE FROM inscripciones        WHERE id = p_inscripcion_id;

  RETURN true;
END;
$function$;
