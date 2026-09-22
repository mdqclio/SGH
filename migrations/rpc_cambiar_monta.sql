-- ═══════════════════════════════════════════════════════════════════════════════
-- ISSUE-084 — cambio de monta después de oficializar: RPC rpc_cambiar_monta + trigger
--
-- ESTADO EN PRODUCCIÓN: la RPC y el trigger están APLICADOS desde el 2026-09-22 (migración
-- `20260922161415 rpc_cambiar_monta_issue_084`), pero **el `guard 0` de este archivo NO**:
-- se agregó después, junto con la tanda del guard de staff, y todavía no se aplicó. La
-- versión viva en prod tiene md5 5b3dce84 y su guard de rol sigue DESPUÉS del lookup de la
-- inscripción (por eso, con un id inexistente, contesta "la inscripción no existe" en vez de
-- 42501). Al aplicar este archivo, esa diferencia se cierra.
--
--
-- Origen: R9 20/09/2026, FREE CRY (C3). Martín oficializó C3 a las 17:36 UTC; Yesi,
-- desde un navegador que todavía mostraba el formulario provisional, cambió la monta
-- GIL SANTINO → ARREGUY a las 18:19 con `saveMontas`, que escribe sólo
-- `inscripciones.jockey_titular_id` y no recalcula. El header de GIL ($150.000, con
-- $60.000 pagables) siguió en el buscador de Pagos hasta que la oficialización de C5
-- recalculó la reunión a las 19:10. En la última carrera de una reunión no hay recálculo
-- posterior: la ventana queda abierta sin límite. Diagnóstico completo:
-- docs/diagnosticos/2026-09-21_issue-084-montas-post-oficial-fase1.md (reports).
--
-- Qué hace (opción B del diagnóstico, OK de Leo 22/09):
--
--   1. TRIGGER trg_insc_monta_oficial (BEFORE UPDATE OF jockey_titular_id):
--      si la monta CAMBIA (NEW IS DISTINCT FROM OLD — un payload entero con el mismo
--      jockey, como el de inscripciones.html, pasa) y la carrera tiene resultado
--      oficial, RAISE. Única excepción: la sesión trae
--      current_setting('sgh.cambiar_monta') = '1', que sólo setea la RPC de abajo y
--      sólo para su transacción (set_config(..., true)). Así ratificacion.html,
--      inscripciones.html y un cliente desactualizado de resultados.html no pueden
--      escribir la columna directo en carrera oficial: tienen que pasar por la RPC.
--
--   2. RPC rpc_cambiar_monta(p_inscripcion_id, p_jockey_id) — SECURITY DEFINER, con
--      los guards adentro (GOTCHA #80):
--      · guard 0 (rol): antes de cualquier SELECT. Pasa `service_role` (auth.role()),
--        el super_admin y el staff (fn_is_staff = super_admin | secretario_carreras |
--        operador, activo). Portal, sesión sin fila en `usuarios` y anon → 42501. Va
--        primero para que el mensaje no delate si el id de la inscripción existe.
--      · guard 1 (club): pasa `service_role` (auth.role(), NO "club NULL") y el
--        super_admin; cualquier otro necesita `fn_get_user_club_id()` NO NULL y que
--        coincida con el club de la carrera. Un club NULL sin service_role — sesión sin
--        fila en `usuarios`, o un JWT `authenticated` cualquiera — es 42501, no un pase
--        libre. El patrón de emitir_recibo v1.2 (`fn_get_user_club_id() IS NOT NULL AND
--        NOT fn_is_super_admin()`) INFIERE service_role de un club NULL y por eso deja
--        pasar a cualquier `authenticated` sin fila en `usuarios`: acá no se copia.
--      · el portal (`fn_is_portal_user()`) queda afuera antes que nada.
--      · jockey válido: profesional tipo jockey|ambos, o NULL ("Sin asignar").
--      · carrera NO oficial → UPDATE y listo (lo que hacía saveMontas).
--      · carrera oficial → cuenta las líneas COMPROMETIDAS del jockey saliente
--        (recibo_id IS NOT NULL OR estado_linea='pagado' — regla 18 de CLAUDE.md):
--          - el premio de ESA inscripción;
--          - su incentivo de jockey de la reunión, sólo si el saliente no monta
--            ningún otro largador de la reunión (si monta otro, el incentivo es suyo
--            igual y no se toca).
--        Si hay alguna → RAISE con el N° de recibo (o "saldado administrativo, sin
--        recibo" — caso ISSUE-054 / GOTCHA #74: queda bloqueado, sin RPC de reversa).
--        Si no hay → en la MISMA transacción: borra las líneas NO comprometidas del
--        saliente (premio de la inscripción + incentivo si corresponde), recomputa
--        los totales de su header (o lo borra si quedó vacío), cambia la monta,
--        actualiza performances.jockey_id de esa inscripción y devuelve
--        {recalcular:true}. El cliente recalcula la reunión enseguida con el motor
--        (liquidaciones-engine.js) para generar las líneas del entrante. Si ese
--        recálculo falla, el saliente YA no tiene nada pagable: la ventana es cero.
--
--      · concurrencia: las líneas del saliente que el guard va a contar se toman con
--        `SELECT … FOR UPDATE` ANTES de contarlas, así un `emitir_recibo` simultáneo
--        sobre esas mismas líneas espera el commit de esta transacción (y ve la monta
--        ya cambiada) en vez de colarse entre el conteo y el DELETE.
--
--   3. Permisos: las dos funciones se REVOCAN de PUBLIC y de anon; sólo `authenticated`
--      tiene EXECUTE sobre la RPC (mismo patrón que rpc_modificar_inscripcion.sql).
--      La función del trigger no necesita EXECUTE de nadie: la invoca el trigger.
--
-- No cambia ninguna regla de plata: el motor sigue generando las líneas del entrante
-- exactamente como antes. Sólo se cierra la ventana entre el cambio y el recálculo.
--
-- Guards de esta migración (2026-09-22): pwd=/home/clio/dev/SGH · spcs=210 ·
-- ref=unlhcuanfrtpatoipwve · query de control de ISSUE-084 en R6/R8/R9 = 0 filas.
--
-- Rollback: migrations/rollback_rpc_cambiar_monta.sql (dropea trigger + 2 funciones).
-- Probe: tests/probe_montas_post_oficial.mjs (A1–A11 + R1/R2, mutantes M1–M8).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Trigger: nadie cambia la monta de una carrera oficial por fuera de la RPC ──
CREATE OR REPLACE FUNCTION public.fn_insc_monta_oficial_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_nro text;
BEGIN
  -- Sólo si la monta CAMBIA. Un UPDATE con payload entero y el mismo jockey pasa.
  IF NEW.jockey_titular_id IS NOT DISTINCT FROM OLD.jockey_titular_id THEN
    RETURN NEW;
  END IF;
  -- Vía autorizada: la RPC, y sólo dentro de su transacción.
  IF current_setting('sgh.cambiar_monta', true) = '1' THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(c.numero_carrera_programa, c.numero_turno)::text INTO v_nro
    FROM resultados r
    JOIN carreras c ON c.id = r.carrera_id
   WHERE r.carrera_id = NEW.carrera_id AND r.estado = 'oficial'
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'La carrera % ya está oficializada: la monta se cambia desde Montas (resultados.html), que recalcula la liquidación. ISSUE-084', v_nro
      USING ERRCODE = 'P0084';
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.fn_insc_monta_oficial_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_insc_monta_oficial_guard() FROM anon;

DROP TRIGGER IF EXISTS trg_insc_monta_oficial ON public.inscripciones;
CREATE TRIGGER trg_insc_monta_oficial
  BEFORE UPDATE OF jockey_titular_id ON public.inscripciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_insc_monta_oficial_guard();

-- ── 2. RPC ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_cambiar_monta(
  p_inscripcion_id uuid,
  p_jockey_id      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_insc          inscripciones%ROWTYPE;
  v_car           carreras%ROWTYPE;
  v_club          uuid;
  v_user_club     uuid;
  v_viejo         uuid;
  v_oficial       boolean := false;
  v_caballo       text;
  v_nro           text;
  v_otras_montas  int := 0;
  v_comp_premio   int := 0;
  v_comp_incent   int := 0;
  v_recibo_nro    int;
  v_borradas      int := 0;
  v_borradas_inc  int := 0;
  v_perf          int := 0;
  v_hdr           record;
BEGIN
  IF p_inscripcion_id IS NULL THEN
    RAISE EXCEPTION 'rpc_cambiar_monta: falta la inscripción';
  END IF;

  -- ── guard 0 · QUIÉN LLAMA ─────────────────────────────────────────────────
  -- VA ANTES del lookup: si va después, el mensaje de error delata si el id existe.
  -- service_role (auth.role()), super_admin o staff (fn_is_staff). El portal tiene su
  -- propio mensaje porque es el caso que se quiere explicar en pantalla.
  IF NOT (coalesce(auth.role(), '') = 'service_role'
          OR fn_is_super_admin() OR fn_is_staff()) THEN
    IF fn_is_portal_user() THEN
      RAISE EXCEPTION 'rpc_cambiar_monta: el portal no cambia montas' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'rpc_cambiar_monta: sin permiso' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_insc FROM inscripciones WHERE id = p_inscripcion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_cambiar_monta: la inscripción no existe';
  END IF;
  SELECT * INTO v_car FROM carreras WHERE id = v_insc.carrera_id;
  v_club := fn_club_de_carrera(v_insc.carrera_id);

  -- ── guard 1 · CLUB ────────────────────────────────────────────────────────────
  -- service_role se reconoce por auth.role(), NO por "club NULL": un club NULL es un
  -- usuario sin fila en `usuarios`, que NO tiene que poder tocar nada. (El guard de rol
  -- —portal incluido— ya corrió arriba, antes del lookup.)
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR fn_is_super_admin()) THEN
    v_user_club := fn_get_user_club_id();
    IF v_user_club IS NULL THEN
      RAISE EXCEPTION 'rpc_cambiar_monta: la sesión no tiene hipódromo asignado' USING ERRCODE = '42501';
    END IF;
    IF v_club IS DISTINCT FROM v_user_club THEN
      RAISE EXCEPTION 'rpc_cambiar_monta: la inscripción es de otro hipódromo' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── jockey válido (NULL = "Sin asignar") ──
  IF p_jockey_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM profesionales p WHERE p.id = p_jockey_id AND p.tipo IN ('jockey', 'ambos')) THEN
    RAISE EXCEPTION 'rpc_cambiar_monta: el jockey no existe o no es jockey';
  END IF;

  v_viejo := v_insc.jockey_titular_id;
  SELECT s.nombre INTO v_caballo FROM spcs s WHERE s.id = v_insc.spc_id;
  v_nro := COALESCE(v_car.numero_carrera_programa, v_car.numero_turno)::text;

  -- Sin cambio: no se toca nada (ni performances, ni líneas).
  IF v_viejo IS NOT DISTINCT FROM p_jockey_id THEN
    RETURN jsonb_build_object('cambio', false, 'oficial', EXISTS (
      SELECT 1 FROM resultados r WHERE r.carrera_id = v_insc.carrera_id AND r.estado = 'oficial'),
      'recalcular', false);
  END IF;

  v_oficial := EXISTS (SELECT 1 FROM resultados r WHERE r.carrera_id = v_insc.carrera_id AND r.estado = 'oficial');

  IF v_oficial AND v_viejo IS NOT NULL THEN
    -- ¿El saliente tiene OTRA monta en la reunión que le dé derecho al incentivo? Si sí,
    -- el incentivo sigue siendo suyo y no se toca. Cuentan las dos formas:
    --   (a) ya largó en una carrera oficial (no_largo=false) — lo que mira el motor hoy;
    --   (b) está ratificado en una carrera NO anulada que todavía NO tiene resultado
    --       oficial: esa carrera puede oficializarse después y generarle el incentivo.
    -- Con sólo (a), cambiar la monta de la primera carrera de la reunión le borraría el
    -- incentivo pagado a un jockey que igual va a correr más tarde.
    SELECT count(*) INTO v_otras_montas
      FROM inscripciones i
      JOIN carreras c ON c.id = i.carrera_id
     WHERE c.reunion_id = v_car.reunion_id
       AND i.id <> v_insc.id
       AND i.estado = 'ratificado'
       AND i.jockey_titular_id = v_viejo
       AND ( EXISTS (SELECT 1 FROM resultados r
                       JOIN resultado_posiciones rp ON rp.resultado_id = r.id
                      WHERE r.carrera_id = c.id AND r.estado = 'oficial'
                        AND rp.inscripcion_id = i.id AND rp.no_largo = false)
          OR ( (c.estado IS NULL OR c.estado <> 'anulada')
               AND NOT EXISTS (SELECT 1 FROM resultados r
                                WHERE r.carrera_id = c.id AND r.estado = 'oficial') ) );

    -- ── guard 2 · INVARIANTE DEL DATO (no depende de la sesión) ──
    -- Concurrencia: se BLOQUEAN primero las líneas del saliente que el guard va a mirar
    -- (premio de esta inscripción + su incentivo de la reunión). Sin esto, un
    -- `emitir_recibo` simultáneo podría marcarlas `pagado` entre el conteo y el DELETE.
    -- Con el lock, ese emitir_recibo espera el commit y ve la monta ya cambiada.
    PERFORM 1 FROM liquidacion_detalle d
      WHERE d.beneficiario_tipo = 'profesional' AND d.beneficiario_id = v_viejo
        AND ( (d.inscripcion_id = v_insc.id AND d.concepto_tipo = 'premio')
           OR (d.reunion_id = v_car.reunion_id AND d.concepto_tipo = 'incentivo_jockey') )
      FOR UPDATE;

    -- Plata comprometida del saliente: premio de ESTA inscripción…
    SELECT count(*), max(r.numero_recibo) INTO v_comp_premio, v_recibo_nro
      FROM liquidacion_detalle d
      LEFT JOIN recibos r ON r.id = d.recibo_id
     WHERE d.inscripcion_id = v_insc.id
       AND d.beneficiario_tipo = 'profesional' AND d.beneficiario_id = v_viejo
       AND d.concepto_tipo = 'premio'
       AND (d.recibo_id IS NOT NULL OR d.estado_linea = 'pagado');
    -- …y su incentivo de la reunión, sólo si esta era su única monta.
    IF v_otras_montas = 0 THEN
      SELECT count(*), COALESCE(v_recibo_nro, max(r.numero_recibo)) INTO v_comp_incent, v_recibo_nro
        FROM liquidacion_detalle d
        LEFT JOIN recibos r ON r.id = d.recibo_id
       WHERE d.reunion_id = v_car.reunion_id
         AND d.beneficiario_tipo = 'profesional' AND d.beneficiario_id = v_viejo
         AND d.concepto_tipo = 'incentivo_jockey'
         AND (d.recibo_id IS NOT NULL OR d.estado_linea = 'pagado');
    END IF;

    IF v_comp_premio + v_comp_incent > 0 THEN
      IF v_recibo_nro IS NOT NULL THEN
        RAISE EXCEPTION 'La monta de % (carrera %) ya tiene un pago emitido al jockey anterior: recibo N° %. Anulá el recibo primero. ISSUE-084',
          v_caballo, v_nro, v_recibo_nro USING ERRCODE = 'P0084';
      ELSE
        RAISE EXCEPTION 'La monta de % (carrera %) ya tiene plata saldada al jockey anterior sin recibo (saldado administrativo): no se puede cambiar desde acá — hablá con la secretaría. ISSUE-084',
          v_caballo, v_nro USING ERRCODE = 'P0084';
      END IF;
    END IF;

    -- Nada comprometido: se borra lo pagable del saliente AHORA, en esta transacción.
    -- El motor regenera para el entrante en el recálculo que sigue; si ese recálculo
    -- falla, el saliente ya no tiene nada cobrable (ventana cero).
    DELETE FROM liquidacion_detalle d
     WHERE d.inscripcion_id = v_insc.id
       AND d.beneficiario_tipo = 'profesional' AND d.beneficiario_id = v_viejo
       AND d.concepto_tipo = 'premio'
       AND d.recibo_id IS NULL AND d.estado_linea <> 'pagado';
    GET DIAGNOSTICS v_borradas = ROW_COUNT;

    IF v_otras_montas = 0 THEN
      DELETE FROM liquidacion_detalle d
       WHERE d.reunion_id = v_car.reunion_id
         AND d.beneficiario_tipo = 'profesional' AND d.beneficiario_id = v_viejo
         AND d.concepto_tipo = 'incentivo_jockey'
         AND d.recibo_id IS NULL AND d.estado_linea <> 'pagado';
      GET DIAGNOSTICS v_borradas_inc = ROW_COUNT;
    END IF;

    -- Header(s) del saliente en la reunión: totales al día, o fuera si quedó vacío.
    FOR v_hdr IN
      SELECT l.id FROM liquidaciones l
       WHERE l.reunion_id = v_car.reunion_id AND l.profesional_id = v_viejo
    LOOP
      IF EXISTS (SELECT 1 FROM liquidacion_detalle d WHERE d.liquidacion_id = v_hdr.id) THEN
        UPDATE liquidaciones l
           SET total_bruto      = s.tb,
               total_descuentos = s.td
          FROM (SELECT COALESCE(sum(monto_bruto), 0) tb, COALESCE(sum(monto_descuento), 0) td
                  FROM liquidacion_detalle WHERE liquidacion_id = v_hdr.id) s
         WHERE l.id = v_hdr.id;
      ELSE
        DELETE FROM liquidaciones WHERE id = v_hdr.id;
      END IF;
    END LOOP;
  END IF;

  -- El cambio, por la única vía que el trigger deja pasar — y sólo en esta transacción.
  PERFORM set_config('sgh.cambiar_monta', '1', true);
  UPDATE inscripciones SET jockey_titular_id = p_jockey_id WHERE id = v_insc.id;
  PERFORM set_config('sgh.cambiar_monta', '', true);

  -- performances.jockey_id se escribió al oficializar con el jockey de ese momento.
  UPDATE performances
     SET jockey_id = p_jockey_id
   WHERE carrera_id = v_insc.carrera_id AND spc_id = v_insc.spc_id;
  GET DIAGNOSTICS v_perf = ROW_COUNT;

  RETURN jsonb_build_object(
    'cambio', true,
    'oficial', v_oficial,
    'jockey_anterior', v_viejo,
    'lineas_borradas', v_borradas + v_borradas_inc,
    'performances', v_perf,
    'recalcular', v_oficial
  );
END $function$;

COMMENT ON FUNCTION public.rpc_cambiar_monta(uuid, uuid) IS
  'ISSUE-084: cambiar la monta de una inscripción. En carrera oficial bloquea si el jockey saliente tiene plata comprometida (recibo o saldado administrativo) y, si no, borra sus líneas pagables, recomputa su header, actualiza performances y pide recalcular la reunión. Única vía autorizada por el trigger trg_insc_monta_oficial.';

REVOKE ALL     ON FUNCTION public.rpc_cambiar_monta(uuid, uuid) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.rpc_cambiar_monta(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_cambiar_monta(uuid, uuid) TO authenticated;
-- service_role explícito: en prod lo da el ALTER DEFAULT PRIVILEGES de Supabase (todas las RPC
-- del proyecto tienen `service_role=X`), pero el REVOKE FROM PUBLIC se lo lleva puesto en
-- cualquier base que no lo tenga configurado — y los probes corren como service_role.
GRANT  EXECUTE ON FUNCTION public.rpc_cambiar_monta(uuid, uuid) TO service_role;
