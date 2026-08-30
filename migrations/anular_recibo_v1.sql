-- ═══════════════════════════════════════════════════════════════════════════════
-- anular_recibo v1 — ISSUE-056
--
-- Origen: el 28/08 Valeria emitió el recibo #4 probando (R8, LORENA SOLEDAD VARELA,
-- 6 líneas, $62.700) y hubo que revertirlo con SQL a mano sobre producción, con
-- plan, ejecución y verificación en tres documentos. Con gente en la ventanilla el
-- 20/09 eso no es viable.
--
-- Regla de Valeria que lo hace urgente: recibo impreso = pago hecho. El papel existe
-- apenas se imprime, así que anular tiene que ser una operación normal del sistema.
--
-- Qué hace, y por qué en este orden:
--   1. Guarda en `lineas_anuladas` (jsonb) los ids de las líneas del recibo ANTES de
--      soltarlas. Si no, el vínculo se pierde para siempre: al poner recibo_id=NULL
--      el recibo ya no las nombra, y `liquidacion_detalle` NO tiene trigger de
--      auditoría (a diferencia de `recibos`, que sí lo tiene). Reconstruir el #4 hoy
--      exige leer un informe de diagnóstico; con esto es un SELECT.
--   2. Suelta recibo_id + pagado_at y devuelve cada línea al estado que le
--      corresponde. NO siempre es 'impago': si `fecha_liberacion` es futura, la línea
--      vuelve a 'retenido'. La retención por anti-doping es una restricción
--      reglamentaria, no una comodidad del flujo — devolver a 'impago' una línea con
--      liberación futura haría que el sistema declare pagable plata que el reglamento
--      retiene. Un click de más (volver a apretar Habilitar) es barato; eso no.
--      La regla es derivable de la propia línea: `fecha_liberacion` sobrevive tanto a
--      `liberar_linea` (que no la limpia) como a `emitir_recibo` (que no la toca).
--   3. Marca el recibo 'anulado' SIN borrarlo, así el hueco de numeración se
--      documenta solo. El #4 borrado del 28/08 es justamente lo que se quiere evitar.
--   4. NO devuelve el correlativo. `fn_siguiente_recibo` es un contador monótono en
--      `club_secuencias` (no un MAX+1), así que alcanza con no tocarlo. El probe lo
--      asserta igual: "se cumple solo" es lo que deja de cumplirse en silencio.
--   5. Registra quién anuló. FK a usuarios(id), NO a auth.users — auth.uid() a secas
--      viola la FK. Ver GOTCHA #79.
--   6. Motivo obligatorio, validado en el RPC y no con NOT NULL en la columna: las 5
--      filas históricas quedarían inválidas y habría que backfillear con un valor
--      inventado.
--
-- Permisos (decisión tomada con Fede/el usuario):
--   · Mismo club, dentro de 5 días corridos de emitido → puede anular.
--   · Pasados los 5 días → sólo super_admin. La ventana no está para darle tiempo a
--     Valeria: está para separar el caso rutinario (el error se ve el mismo día, como
--     el #4) del excepcional. Un error que aparece en la reunión siguiente DEBERÍA
--     requerir super_admin.
--   · Candado de club, igual que emitir_recibo v1.2.
--
-- Por qué los guards van escritos acá y no se delegan a la RLS: la función es
-- SECURITY DEFINER, así que las policies de las tablas NO se evalúan adentro.
-- Ver GOTCHA #80.
--
-- Guards de esta migración (2026-08-30): pwd=/home/clio/dev/SGH · spcs=181 ·
-- ref=unlhcuanfrtpatoipwve · recibos=5, todos en 'emitido' · líneas con recibo=8,
-- todas 'pagado' · líneas de regularización con recibo_id = 0.
--
-- FUERA DE ALCANCE, a propósito: no se toca emitir_recibo, ni el saldado
-- administrativo ni sus marcas, ni la policy recibos_delete (va en migración aparte,
-- ver ISSUE-065).
--
-- Rollback: migrations/rollback_anular_recibo_v1.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- `estado_recibo` YA tiene el valor 'anulado' y `anulado_at` YA existe (schema de
-- Fase 0, nunca usados). No hay que tocar el ENUM — lo que evita GOTCHA #11.
ALTER TABLE recibos
  ADD COLUMN IF NOT EXISTS anulado_por      uuid REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS motivo_anulacion text,
  ADD COLUMN IF NOT EXISTS lineas_anuladas  jsonb;

COMMENT ON COLUMN recibos.anulado_por IS
  'usuarios.id (NO auth.users) del que anuló. NULL bajo service_role. Ver GOTCHA #79.';
COMMENT ON COLUMN recibos.motivo_anulacion IS
  'Obligatorio por anular_recibo; nullable en la columna por las filas previas a ISSUE-056.';
COMMENT ON COLUMN recibos.lineas_anuladas IS
  'Array jsonb con los liquidacion_detalle.id que tenía el recibo al anularse. Se escribe '
  'ANTES de soltar recibo_id: es el único rastro de qué contenía, porque liquidacion_detalle '
  'no tiene trigger de auditoría.';

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
  -- service_role (fn_get_user_club_id() NULL) y super_admin pasan.
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

  -- ── 1: fotografiar las líneas ANTES de soltarlas ──────────────────────────
  SELECT COALESCE(jsonb_agg(d.id ORDER BY d.id), '[]'::jsonb) INTO v_lineas
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

  -- La foto y lo efectivamente soltado tienen que coincidir. Si no, algo cambió
  -- entre medio y el jsonb quedaría mintiendo — que es peor que no tenerlo.
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
     AND estado = 'emitido'          -- red ante concurrencia
  RETURNING * INTO v_recibo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'anular_recibo: el recibo cambió de estado durante la anulación';
  END IF;

  -- 4: club_secuencias NO se toca. El número no vuelve.
  RETURN v_recibo;
END $function$;

GRANT EXECUTE ON FUNCTION public.anular_recibo(uuid, text) TO authenticated;
