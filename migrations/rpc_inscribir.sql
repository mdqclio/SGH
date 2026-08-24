-- ============================================================
-- Gate 4.3 — rpc_inscribir: inscripción desde el portal
-- ============================================================
-- Ver docs/AUTOREGISTRO_GATE_4.md §C.
--
-- POR QUÉ UN RPC Y NO UN INSERT DIRECTO
--   Las policies de `inscripciones` excluyen explícitamente al portal
--   (NOT fn_is_portal_user()) para INSERT/UPDATE/DELETE, y NO se tocan.
--   Toda la escritura del portal entra por acá. Es la diferencia entre
--   "el cliente puede insertar y confiamos en el JS" y "el cliente no
--   puede insertar, punto".
--
-- ⚠️ CAMBIO DE REGLA 24/08/2026 — INSCRIPCIÓN LIBRE
--    Se eliminó la validación de tenencia (paso 2). Cualquier entrenador
--    puede anotar CUALQUIER SPC del padrón: el control es disciplinario,
--    no técnico. Ver migrations/portal_inscripcion_libre.sql y
--    docs/PORTAL_INSCRIPCION_LIBRE_PROPUESTA.md.
--
-- ⚠️ REQUIERE migrations/canal_portal.sql aplicado ANTES (agrega el valor
--    'portal' al ENUM canal_inscripcion). Postgres no permite usar un valor
--    de ENUM en la misma transacción en que se lo agregó.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_inscribir(p_spc_id uuid, p_carrera_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id     uuid;
  v_entrenador_id  uuid;
  v_carrera        RECORD;
  v_reunion_estado text;
  v_spc            RECORD;
  v_ok             boolean;
  v_motivo         text;
  v_id             uuid;
BEGIN
  -- ----------------------------------------------------------
  -- 1. Quién llama: usuario de portal vinculado a un PROFESIONAL.
  --    El propietario queda fuera a propósito (§A.5): no hay fuente
  --    confiable de tenencia por propiedad (spc_propietarios está vacía).
  --    La secretaría tampoco entra por acá — tiene su propio camino.
  -- ----------------------------------------------------------
  SELECT e.entidad_id INTO v_entrenador_id
    FROM fn_mis_entidades() e
   WHERE e.entidad_tipo = 'profesional'
   LIMIT 1;
  IF v_entrenador_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: esta operación es para entrenadores del portal.';
  END IF;

  -- inscripciones.inscripto_por es FK a usuarios(id), NO a auth.users.
  -- Meter auth.uid() ahí revienta con inscripciones_inscripto_por_fkey.
  SELECT u.id INTO v_usuario_id
    FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: la cuenta no tiene usuario activo.';
  END IF;

  -- ----------------------------------------------------------
  -- 2. SIN VALIDACIÓN DE TENENCIA — es el cambio de regla del 24/08/2026.
  --    Antes acá se exigía que el caballo estuviera en fn_mis_spc_ids().
  --    Eso dejaba fuera a 34 de 181 SPC (los que no tienen entrenador_id
  --    cargado): nadie los podía anotar desde el portal.
  --
  --    Lo que reemplaza al filtro NO es nada técnico: es el registro de
  --    quién inscribió (inscripto_por + canal + auditoría) y la sanción de
  --    la comisión de carreras si la inscripción es falsa.
  --
  --    El caballo tiene que EXISTIR, eso sí. SECURITY DEFINER ⇒ este SELECT
  --    ve todo el padrón aunque el que llama no vea la fila por RLS.
  -- ----------------------------------------------------------
  SELECT * INTO v_spc FROM spcs WHERE id = p_spc_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El caballo no existe.';
  END IF;

  -- ----------------------------------------------------------
  -- 3. VENTANA. Fail-closed: si falta cualquiera de las dos fechas,
  --    la carrera NO está abierta. Sin fallback, sin heredar de la
  --    reunión, sin "si es NULL asumimos abierta".
  --
  --    carreras.estado NO se usa como señal de ventana: carta-llamados.html
  --    escribe 'abierta' en toda carrera que guarda. Sólo sirve para
  --    excluir 'anulada'.
  -- ----------------------------------------------------------
  SELECT c.*, r.estado::text AS reunion_estado
    INTO v_carrera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE c.id = p_carrera_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La carrera no existe.';
  END IF;

  v_reunion_estado := v_carrera.reunion_estado;

  IF v_reunion_estado IS DISTINCT FROM 'publicada'
     OR v_carrera.estado IS NOT DISTINCT FROM 'anulada'
     OR v_carrera.apertura_inscripcion IS NULL
     OR v_carrera.cierre_inscripcion  IS NULL
     OR now() < v_carrera.apertura_inscripcion
     OR now() > v_carrera.cierre_inscripcion
  THEN
    RAISE EXCEPTION 'La inscripción para ese turno no está abierta.';
  END IF;

  -- ----------------------------------------------------------
  -- 4. Reglas de la carrera: edad, sexo, sanción vigente, cupo.
  --
  --    ⚠️ validar_inscripcion devuelve TABLE(puede_inscribirse, motivo).
  --    portal.html:560 leía `.valido`, un campo que no existe, así que
  --    `undefined === false` daba false y la validación NUNCA bloqueó nada.
  --    Acá se chequea IS NOT TRUE — si la función no devuelve fila, el NULL
  --    bloquea en vez de dejar pasar.
  -- ----------------------------------------------------------
  SELECT v.puede_inscribirse, v.motivo
    INTO v_ok, v_motivo
    FROM validar_inscripcion(p_spc_id, p_carrera_id) v;

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'No se puede inscribir: %', COALESCE(v_motivo, 'no cumple las condiciones de la carrera');
  END IF;

  -- ----------------------------------------------------------
  -- 5. Duplicado EN ESE TURNO. Por carrera, nunca por reunión.
  --
  --    MULTI-CATEGORÍA PERMITIDO (GOTCHAS #69): el mismo caballo anotado en
  --    varias carreras de la misma reunión es el estado ESPERADO entre el
  --    cierre de anotaciones y el lunes previo, cuando la secretaría decide
  --    en cuál queda. En R6 ya pasa con 13 ejemplares. NO agregar acá una
  --    validación por reunión ni un constraint (reunion_id, spc_id).
  -- ----------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM inscripciones
     WHERE carrera_id = p_carrera_id AND spc_id = p_spc_id
  ) THEN
    RAISE EXCEPTION 'Ese caballo ya está anotado en ese turno.';
  END IF;

  -- ----------------------------------------------------------
  -- 6. INSERT.
  --    entrenador_id = EL QUE INSCRIBE, no spcs.entrenador_id. Con la regla
  --    nueva el que anota se está declarando entrenador del caballo para esa
  --    carrera, y es el dato que la comisión necesita si hay que sancionar.
  --    Copiar spcs.entrenador_id sería peor: en 34 casos es NULL y en el
  --    resto puede estar desactualizado.
  --
  --    caballeriza_id sale del SPC y PUEDE QUEDAR NULL (29 de 181 no la
  --    tienen). Con caballeriza NULL el trigger fn_inscripcion_set_propietario
  --    deja propietario_id en NULL y la inscripción no liquida hasta que la
  --    secretaría la complete (GOTCHAS #47) — que es exactamente lo que ya
  --    pasa hoy cuando la carga Yesi a mano. Decisión de Fede/Yesi: no se le
  --    pide la caballeriza al entrenador, la completa la secretaría en
  --    ratificación.
  --    NO se hereda la caballeriza del que inscribe: le atribuiría el
  --    propietario equivocado a un caballo ajeno.
  --    propietario_id NO se setea a mano — lo pone el trigger.
  -- ----------------------------------------------------------
  INSERT INTO inscripciones (
    carrera_id, spc_id, estado, canal, inscripto_por,
    entrenador_id, caballeriza_id
  ) VALUES (
    p_carrera_id, p_spc_id,
    'inscripto',          -- el valor que usa el circuito real; no 'pre_inscripto'
    'portal',             -- estrena la trazabilidad: 0/186 filas la tenían
    v_usuario_id,         -- usuarios.id, no auth.uid() — ver arriba
    v_entrenador_id,      -- el que inscribe, no el del padrón
    v_spc.caballeriza_id  -- puede ser NULL; la completa la secretaría
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_inscribir(uuid, uuid) IS
  'Gate 4 — inscripción desde el portal. Valida entidad, ventana y reglas de carrera (SIN tenencia desde 24/08/2026: inscripción libre); escribe canal=portal e inscripto_por. Multi-categoría permitido (GOTCHAS #69).';

REVOKE ALL     ON FUNCTION public.rpc_inscribir(uuid, uuid) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.rpc_inscribir(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_inscribir(uuid, uuid) TO authenticated;

-- ============================================================
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.rpc_inscribir(uuid, uuid);
-- Nada más que revertir: las policies de inscripciones no se tocaron.
-- Las inscripciones creadas por el RPC quedan identificables con
--   SELECT * FROM inscripciones WHERE canal = 'portal';
-- ============================================================
