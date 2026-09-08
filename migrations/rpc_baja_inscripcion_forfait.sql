-- ============================================================================
-- rpc_baja_inscripcion_forfait.sql
--
-- Agrega la ventana de RATIFICACIÓN al retiro desde el portal.
--
-- Pedido de Fede (08/09/2026): "forfait es retirar y tiene que ser el lunes
-- antes de las 12 hs". Esa es la ventana de ratificación —en R9, lunes 14/09 de
-- 00:00 a 12:00— y no un mecanismo nuevo: es este mismo RPC mirando una ventana
-- más.
--
-- ── LA DECISIÓN QUE NO ES OBVIA ────────────────────────────────────────────
-- Es la misma acción con DOS RESULTADOS distintos, no la misma acción con dos
-- ventanas:
--
--   · Ventana de INSCRIPCIÓN  → DELETE, como hasta ahora.
--     docs/AUTOREGISTRO_GATE_4.md:300 lo justifica, y su justificación tiene
--     fecha de vencimiento explícita: "mientras la ventana está abierta, esa
--     fila todavía no produjo nada: no hay programa, ni sorteo de gateras, ni
--     carta impresa, ni mandiles. Borrarla no deja huella en ningún documento".
--
--   · Ventana de RATIFICACIÓN → UPDATE estado='forfait'.
--     Cerrada la inscripción esa premisa deja de valer: la fila YA produjo
--     documentos, y el forfait no es una ausencia, es una ENTRADA IMPRESA —
--     bloque BORRADOS del PDF de ratificación (ratificacion.html:397-405) y
--     tachado en el programa (programa.html:67-68). Un DELETE ahí borra el
--     rastro de que el caballo estuvo anotado, y el programa no puede tachar
--     una fila que no existe.
--
-- ── LA FUENTE DE VERDAD DE LA VENTANA ──────────────────────────────────────
-- `carreras.apertura_ratificacion` / `cierre_ratificacion`. Son las columnas
-- que ISSUE-074 documentó como "no las lee nadie" — y son la única de las tres
-- candidatas cuyo valor codifica la regla de Fede:
--
--   R8: cierre_ratificacion = lunes 10/08, reunión domingo 16/08  (6 días)
--   R9: cierre_ratificacion = lunes 14/09, reunión domingo 20/09  (6 días)
--
-- `reuniones.hora_cierre_ratificacion` es un `time` sin fecha; y lo que deriva
-- ratificacion.html (fecha de la reunión + esa hora) pone el cierre el DOMINGO
-- de la carrera, seis días tarde. Ver ISSUE-075.
--
-- Este cambio convierte esas dos columnas en columnas LEÍDAS por primera vez, o
-- sea que cierra parcialmente ISSUE-074 por su opción (1). Sólo es seguro
-- porque el fix de zona de carta-llamados (merge 5d108ab, GOTCHA #92) ya está
-- en main: antes, cada edición del turno corría la ventana −3 h.
--
-- ── LO QUE NO CAMBIA ───────────────────────────────────────────────────────
-- Sigue sin poder retirarse lo que cargó la secretaría (`canal <> 'portal'`) ni
-- lo de otro (`inscripto_por <> el que llama`). El forfait CONSERVA canal e
-- inscripto_por: son el rastro de quién retiró, que es el control por auditoría
-- que reemplaza al filtro por tenencia (regla del 24/08/2026).
--
-- Informes: docs/diagnosticos/2026-09-08_plan-forfait-desde-el-portal.md
--           docs/diagnosticos/2026-09-08_forfait-portal-aplicado.md
-- Probe:    tests/probe_forfait_portal.mjs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_baja_inscripcion(p_inscripcion_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario_id      uuid;
  v_insc            RECORD;
  v_carrera         RECORD;
  v_en_inscripcion  boolean;
  v_en_ratificacion boolean;
BEGIN
  -- Entidad de portal: profesional O propietario.
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

  -- Sin revalidación de tenencia (regla del 24/08/2026): la fila queda
  -- protegida por canal='portal' AND inscripto_por = el que llama.
  IF v_insc.canal IS DISTINCT FROM 'portal'
     OR v_insc.inscripto_por IS DISTINCT FROM v_usuario_id
  THEN
    RAISE EXCEPTION 'Esa inscripción no la cargó usted desde el portal. Para darla de baja, hablá con la secretaría.';
  END IF;

  SELECT c.*, r.estado::text AS reunion_estado
    INTO v_carrera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE c.id = v_insc.carrera_id;

  IF v_carrera.reunion_estado IS DISTINCT FROM 'publicada' THEN
    RAISE EXCEPTION 'Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.';
  END IF;

  -- Las dos ventanas, fail-closed: si a una le falta cualquiera de sus dos
  -- fechas, esa ventana NO está abierta. Mismo criterio que ventanaAbierta()
  -- del portal para la inscripción.
  v_en_inscripcion := v_carrera.apertura_inscripcion IS NOT NULL
                  AND v_carrera.cierre_inscripcion   IS NOT NULL
                  AND now() >= v_carrera.apertura_inscripcion
                  AND now() <= v_carrera.cierre_inscripcion;

  v_en_ratificacion := v_carrera.apertura_ratificacion IS NOT NULL
                   AND v_carrera.cierre_ratificacion   IS NOT NULL
                   AND now() >= v_carrera.apertura_ratificacion
                   AND now() <= v_carrera.cierre_ratificacion;

  IF NOT (v_en_inscripcion OR v_en_ratificacion) THEN
    RAISE EXCEPTION 'Fuera de plazo: se puede retirar mientras la inscripción está abierta, o dar forfait durante la ratificación. Hablá con la secretaría.';
  END IF;

  -- ── RAMA 1: INSCRIPCIÓN ABIERTA → borrar ─────────────────────────────────
  -- Sólo cuando la de ratificación NO está abierta. Si por un dato mal cargado
  -- las dos se solaparan, gana el FORFAIT: conserva la fila. Entre perder datos
  -- y dejar un borrado de más, se elige lo segundo.
  IF v_en_inscripcion AND NOT v_en_ratificacion THEN
    IF v_insc.estado IS DISTINCT FROM 'inscripto' THEN
      RAISE EXCEPTION 'Esa inscripción ya fue procesada por la secretaría y no se puede retirar desde el portal.';
    END IF;

    DELETE FROM resultado_posiciones WHERE inscripcion_id = p_inscripcion_id;
    DELETE FROM inscripciones        WHERE id = p_inscripcion_id;
    RETURN true;
  END IF;

  -- ── RAMA 2: RATIFICACIÓN ABIERTA → forfait ───────────────────────────────
  -- Se admite 'ratificado' además de 'inscripto': la ventana de ratificación es
  -- justo cuando la secretaría ratifica, así que exigir 'inscripto' dejaría
  -- afuera exactamente el caso que pidió Fede. Y un caballo ratificado que se
  -- retira es la definición literal de forfait.
  IF v_insc.estado NOT IN ('inscripto', 'ratificado') THEN
    RAISE EXCEPTION 'Ese caballo ya figura como % y no se puede dar de baja desde el portal.', v_insc.estado;
  END IF;

  -- numero_partidor = NULL: el sorteo de gateras se genera al pedir el PDF de
  -- ratificación, que cae DENTRO de esta ventana, así que puede haber corrido
  -- ya. Un forfait con gatera dejaría un cajón asignado a un caballo que no
  -- corre. En R8 los 29 forfait tienen numero_partidor NULL y los 67
  -- ratificados lo tienen cargado: esto mantiene esa invariante.
  --
  -- motivo_estado con marca de origen: es el campo que la secretaría ya usa
  -- para el motivo (inscripciones.html:318), y así el forfait del portal se
  -- distingue del que carga ella sin agregar ninguna columna.
  --
  -- canal e inscripto_por NO se tocan: son el rastro de quién retiró.
  UPDATE inscripciones
     SET estado          = 'forfait',
         numero_partidor = NULL,
         motivo_estado   = 'Forfait desde el portal'
   WHERE id = p_inscripcion_id;

  RETURN true;
END;
$function$;
