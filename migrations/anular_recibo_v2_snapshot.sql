-- ═══════════════════════════════════════════════════════════════════════════════
-- anular_recibo v2 — `lineas_anuladas` pasa de ids a FOTO de las filas
--
-- Origen: al planificar la vista de historial de recibos (opción B de ISSUE-056)
-- salió que `lineas_anuladas` guardaba `jsonb_agg(d.id)` — sólo los identificadores.
-- Eso alcanza para reconstruir el detalle de un anulado (las filas de
-- liquidacion_detalle siguen existiendo; anular sólo les pone recibo_id=NULL), pero
-- es una RECONSTRUCCIÓN, no una foto:
--
--   Si después de anular alguien corre "Recalcular reunión", el motor puede cambiar
--   el monto_neto de una línea que quedó impaga, y el detalle del recibo anulado
--   pasaría a mostrar un importe distinto del que se imprimió en el papel.
--
-- Con plata en juego y un recibo firmado del otro lado del mostrador, eso es una
-- discusión de mostrador que el sistema no puede ganar.
--
-- POR QUÉ AHORA Y NO DESPUÉS — la ventana:
--   Hoy hay CERO recibos anulados en la base (medido el 2026-08-30, ver guards). El
--   cambio de formato es gratis exactamente hoy: no hay una sola fila que migrar ni
--   que quede a medias. En cuanto se anule el primer recibo con el formato viejo, esa
--   fila queda con sólo ids PARA SIEMPRE — el monto del momento ya no se puede
--   recuperar de ningún lado, porque liquidacion_detalle no tiene trigger de
--   auditoría. No es una optimización que se puede postergar: es una puerta que se
--   cierra sola con la primera anulación.
--
-- QUÉ CAMBIA, exactamente una línea de la función:
--     ANTES:  jsonb_agg(d.id      ORDER BY d.id)   → ["uuid", "uuid"]
--     AHORA:  jsonb_agg(to_jsonb(d) ORDER BY d.id) → [{...fila completa...}, {...}]
--
--   `to_jsonb(d)` captura la fila ENTERA, incluida la columna GENERATED monto_neto
--   (GOTCHA #9: no se puede insertar, pero sí leer) y cualquier columna que se agregue
--   a liquidacion_detalle en el futuro. Es literalmente "las filas completas", sin
--   tener que mantener una lista de campos que se desactualice.
--
-- COMPATIBILIDAD HACIA ATRÁS — obligatoria, aunque hoy no haya filas viejas:
--   El consumidor (liquidaciones.html) discrimina por el tipo del primer elemento:
--     · string → formato v1 (ids)      → .in('id', ids), reconstrucción
--     · object → formato v2 (foto)     → se usa tal cual
--   Se implementa igual con cero filas viejas, por dos razones: el código de lectura
--   no puede depender de un conteo que cambia, y si algún día se restaura un backup
--   anterior a esta migración las filas viejas siguen leyéndose.
--
-- LO QUE NO CAMBIA:
--   · La semántica de la anulación: mismo orden (fotografiar ANTES de soltar), mismos
--     guards de club y de 5 días, misma idempotencia, mismo CASE de retenido, mismo
--     "el número no vuelve".
--   · La firma y el tipo de retorno (RETURNS recibos).
--   · emitir_recibo: no se toca.
--   · liquidacion_detalle: no se toca. La foto se guarda en recibos, del lado del
--     recibo, que es quien la necesita.
--
-- COSTO: el jsonb pasa de ~40 bytes por línea a ~600. Un recibo de 6 líneas ocupa
-- ~3,6 KB en vez de ~250 bytes. Con 5 recibos en la base y una reunión por semana, es
-- irrelevante frente a lo que compra.
--
-- Guards de esta migración (2026-08-30): pwd=/home/clio/dev/SGH · spcs=181 ·
-- ref=unlhcuanfrtpatoipwve · recibos=5, todos 'emitido' · recibos anulados=0 ·
-- filas con lineas_anuladas NOT NULL = 0.
--
-- Verificación de la ventana, ANTES de aplicar:
--   SELECT count(*) FROM recibos WHERE lineas_anuladas IS NOT NULL;   -- tiene que dar 0
--
-- Rollback: volver a aplicar migrations/anular_recibo_v1.sql (la función es
-- CREATE OR REPLACE y el v1 es autocontenido). Las filas ya anuladas con el formato
-- v2 quedan con la foto — no molestan, el lector las sigue entendiendo.
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN recibos.lineas_anuladas IS
  'FOTO jsonb de las filas de liquidacion_detalle que tenía el recibo al anularse '
  '(v2, 2026-08-30: array de objetos to_jsonb(d), antes era array de ids). Se escribe '
  'ANTES de soltar recibo_id: es el único rastro de qué contenía y por cuánto, porque '
  'liquidacion_detalle no tiene trigger de auditoría y un recálculo posterior puede '
  'cambiarle el monto a la línea. Formato v1 (array de strings) se sigue leyendo.';

CREATE OR REPLACE FUNCTION public.anular_recibo(
  p_recibo_id uuid,
  p_motivo    text
)
RETURNS recibos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recibo     recibos;
  v_usuario_id uuid;
  v_lineas     jsonb;
  v_liberadas  int;
BEGIN
  IF p_recibo_id IS NULL THEN
    RAISE EXCEPTION 'anular_recibo: falta el recibo';
  END IF;

  -- Motivo obligatorio (requisito 6). Antes de tocar nada.
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'anular_recibo: el motivo de anulación es obligatorio';
  END IF;

  -- FOR UPDATE: serializa dos anulaciones concurrentes del mismo recibo.
  SELECT * INTO v_recibo FROM recibos WHERE id = p_recibo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'anular_recibo: el recibo no existe';
  END IF;

  -- ── guard 1: club ─────────────────────────────────────────────────────────
  IF fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin()
     AND v_recibo.club_id IS DISTINCT FROM fn_get_user_club_id() THEN
    RAISE EXCEPTION 'anular_recibo: el recibo % es de otro club', v_recibo.numero_recibo
      USING ERRCODE = '42501';
  END IF;

  -- ── guard 2: ventana de 5 días corridos ───────────────────────────────────
  IF NOT fn_is_super_admin() AND fn_get_user_club_id() IS NOT NULL
     AND v_recibo.emitido_at < now() - interval '5 days' THEN
    RAISE EXCEPTION
      'anular_recibo: el recibo % se emitió el % (hace más de 5 días) — sólo un super_admin puede anularlo',
      v_recibo.numero_recibo, v_recibo.emitido_at::date
      USING ERRCODE = '42501';
  END IF;

  -- ── idempotencia ──────────────────────────────────────────────────────────
  IF v_recibo.estado = 'anulado' THEN
    RAISE EXCEPTION 'anular_recibo: el recibo % ya fue anulado el % — no se anula dos veces',
      v_recibo.numero_recibo, v_recibo.anulado_at::date;
  END IF;

  -- ── quién anula (GOTCHA #79: FK a usuarios, NO a auth.users) ──────────────
  SELECT u.id INTO v_usuario_id
    FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo LIMIT 1;

  -- ── 1: FOTOGRAFIAR las líneas ANTES de soltarlas ──────────────────────────
  -- v2: to_jsonb(d) en vez de d.id. La foto incluye monto_neto (columna GENERATED:
  -- no se puede escribir, sí leer) y todo lo que necesita el historial para mostrar
  -- el recibo tal como se imprimió, sin depender de que la línea no haya cambiado.
  -- El ORDER BY d.id se mantiene: hace la foto determinística, que es lo que permite
  -- compararla en un probe.
  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]'::jsonb) INTO v_lineas
    FROM liquidacion_detalle d WHERE d.recibo_id = p_recibo_id;

  IF jsonb_array_length(v_lineas) = 0 THEN
    RAISE EXCEPTION 'anular_recibo: el recibo % no tiene líneas asociadas — no se anula un recibo vacío',
      v_recibo.numero_recibo;
  END IF;

  -- ── 2: soltar recibo_id y devolver el estado que corresponde ──────────────
  UPDATE liquidacion_detalle d
     SET recibo_id    = NULL,
         pagado_at    = NULL,
         estado_linea = CASE
           WHEN d.fecha_liberacion IS NOT NULL AND d.fecha_liberacion > CURRENT_DATE
             THEN 'retenido'::estado_linea_liq
           ELSE 'impago'::estado_linea_liq
         END
   WHERE d.recibo_id = p_recibo_id;
  GET DIAGNOSTICS v_liberadas = ROW_COUNT;

  IF v_liberadas <> jsonb_array_length(v_lineas) THEN
    RAISE EXCEPTION 'anular_recibo: se soltaron % línea(s) pero el recibo % tenía % — se aborta',
      v_liberadas, v_recibo.numero_recibo, jsonb_array_length(v_lineas);
  END IF;

  -- ── 3+5+6: marcar anulado SIN borrar ──────────────────────────────────────
  UPDATE recibos
     SET estado           = 'anulado',
         anulado_at       = now(),
         anulado_por      = v_usuario_id,
         motivo_anulacion = btrim(p_motivo),
         lineas_anuladas  = v_lineas
   WHERE id = p_recibo_id
     AND estado = 'emitido'
  RETURNING * INTO v_recibo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'anular_recibo: el recibo cambió de estado durante la anulación';
  END IF;

  -- 4: club_secuencias NO se toca. El número no vuelve.
  RETURN v_recibo;
END $function$;
