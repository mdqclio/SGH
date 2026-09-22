-- ═══════════════════════════════════════════════════════════════════════════════
-- ISSUE-084 — cambio de monta después de oficializar: RPC rpc_cambiar_monta + trigger
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
--      · guard 1 (permiso): usuario de club sólo sobre inscripciones de su club;
--        portal no. service_role y super_admin pasan (mismo patrón que emitir_recibo).
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

  SELECT * INTO v_insc FROM inscripciones WHERE id = p_inscripcion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_cambiar_monta: la inscripción no existe';
  END IF;
  SELECT * INTO v_car FROM carreras WHERE id = v_insc.carrera_id;
  v_club := fn_club_de_carrera(v_insc.carrera_id);

  -- ── guard 1 · PERMISO (depende de la sesión; service_role y super_admin pasan) ──
  IF fn_is_portal_user() THEN
    RAISE EXCEPTION 'rpc_cambiar_monta: el portal no cambia montas' USING ERRCODE = '42501';
  END IF;
  IF fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin()
     AND v_club IS DISTINCT FROM fn_get_user_club_id() THEN
    RAISE EXCEPTION 'rpc_cambiar_monta: la inscripción es de otro hipódromo' USING ERRCODE = '42501';
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
    -- ¿El saliente monta OTRO largador de la reunión? Si sí, su incentivo sigue siendo suyo.
    SELECT count(*) INTO v_otras_montas
      FROM inscripciones i
      JOIN carreras c  ON c.id = i.carrera_id
      JOIN resultados r ON r.carrera_id = c.id AND r.estado = 'oficial'
      JOIN resultado_posiciones rp ON rp.resultado_id = r.id AND rp.inscripcion_id = i.id AND rp.no_largo = false
     WHERE c.reunion_id = v_car.reunion_id
       AND i.id <> v_insc.id
       AND i.estado = 'ratificado'
       AND i.jockey_titular_id = v_viejo;

    -- ── guard 2 · INVARIANTE DEL DATO (no depende de la sesión) ──
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

GRANT EXECUTE ON FUNCTION public.rpc_cambiar_monta(uuid, uuid) TO authenticated;
