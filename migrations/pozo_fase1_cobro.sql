-- ═══════════════════════════════════════════════════════════════════════════════
-- Pozo de ratificación a premios — Fase 1 (COBRO) · Pieza 1: schema
-- Rama: feat/pozo-ratificacion-fase1-cobro
-- Plan: docs/diagnosticos/2026-09-19_plan-pozo-ratificacion-fase1-cobro.md (reports)
-- ⚠️ NO APLICADA. Pusheada para revisión. Aplicar por MCP `apply_migration` con OK
--    explícito. Idempotente (re-ejecutable). Rollback: rollback_pozo_fase1_cobro.sql
--
-- QUÉ ES EL POZO (reglas de Fede y Valeria, 19/09/2026)
--   Cada caballo ratificado paga un monto para poder correr (por carrera: hoy
--   100.000; 200.000 en la Especial). El hipódromo retiene un % por reunión (hoy
--   20). El resto va ENTERO al propietario del ganador, sin reparto por roles. Se
--   cobra ANTES de correr; si paga y no larga, se le devuelve. El que no paga no
--   corre (el sistema avisa al oficializar, no bloquea — decisión de Fede, NO por
--   consistencia con el gate de montas, que bloquea).
--
-- POR QUÉ ES UN CIRCUITO APARTE Y NO UNA LÍNEA DE liquidacion_detalle (decisión
-- de Leonardo 19/09, opción B del plan §6)
--   1. El pozo es plata de los PROPIETARIOS ENTRE SÍ que el club CUSTODIA. No es
--      deuda del club por un resultado, que es exactamente lo que modela
--      liquidacion_detalle (ADR-042: "la LÍNEA es la unidad de deuda").
--   2. Se paga EN EL MOMENTO, después de la carrera, ANTES de que exista la
--      liquidación (que se genera al oficializar). No puede ser una línea de algo
--      que todavía no existe. Y no queda retenido por anti-doping.
--   3. Es un ciclo cerrado con su propia reconciliación:
--        Σ cobrado = Σ devuelto + Σ retenido + Σ pagado al ganador + pendiente
--      Mezclarlo en liquidacion_detalle descuadra el Resumen de cierre
--      (pagado + impago + retenido + fondo = total) y hace que el motor paid-safe
--      dependa del estado de la caja en vez de sólo de los resultados oficiales.
--   4. Dos recibos, uno por el premio y otro por el pozo. Valeria lo prefiere así.
--   Por lo mismo, serie de numeración PROPIA (club_secuencias tipo 'recibo_cobro'):
--   un recibo de cobro y uno de pago no comparten número ni tabla.
--
-- QUÉ HACE ESTA MIGRACIÓN (sólo schema; los RPC cobrar/devolver/anular son la
-- pieza 2, la pantalla pozo.html la pieza 4)
--   1. carreras.pozo_monto_caballo   — monto por caballo, POR CARRERA (Yesi, modal
--                                       de turno en carta-llamados.html). NULL/0 =
--                                       esta carrera no tiene pozo.
--   2. reuniones.pozo_retencion_pct  — % que retiene el hipódromo, POR REUNIÓN
--                                       (Yesi, modal de reunión). NULL = sin cargar:
--                                       la vista devuelve retención NULL, no asume 20.
--   3. ENUM estado_pozo_cobro        — cobrado / devuelto / anulado.
--   4. TABLA pozo_cobros             — UNA fila por inscripción cobrada. `monto` es
--                                       SNAPSHOT de carreras.pozo_monto_caballo al
--                                       cobrar (si Yesi corrige el monto después, lo
--                                       cobrado no cambia). Devolver y anular NO
--                                       borran: cambian el estado y dejan foto jsonb
--                                       (patrón anular_recibo v2). Un solo cobro VIVO
--                                       por inscripción (índice parcial).
--   5. RLS: SELECT para staff del club y super_admin. SIN policy de INSERT/UPDATE/
--      DELETE y ADEMÁS REVOKE de esos privilegios a authenticated/anon: toda
--      escritura va por RPC SECURITY DEFINER (pieza 2). Las dos capas a propósito,
--      como en revocar_recibos_delete.sql: sin policy el rechazo es SILENCIOSO
--      (0 filas); con REVOKE es un 42501 ruidoso. Se testean por separado
--      (GOTCHA #86).
--   6. Auditoría: trg_audit_pozo_cobros → fn_auditoria_log (mismo que recibos).
--   7. fn_siguiente_numero(p_club_id, p_tipo) — serie genérica por club.
--      fn_siguiente_recibo(p_club_id) queda como WRAPPER con la misma firma y el
--      mismo comportamiento → emitir_recibo NO se toca. Nueva serie: 'recibo_cobro'.
--   8. VISTA v_pozo_carrera — la fórmula del pozo en UN solo lugar (la consumen
--      pozo.html, el chip de resultados.html y los probes):
--        esperado      = n_ratificados × pozo_monto_caballo
--        cobrado_bruto = Σ monto de cobros estado='cobrado'
--        retencion     = round(cobrado_bruto × pct / 100, 2)   (NULL si pct NULL)
--        al_ganador    = cobrado_bruto − retencion              (NULL si pct NULL)
--      Se calcula sobre lo COBRADO, no sobre lo esperado: el que no paga no corre y
--      no puede ganar (Fede). security_invoker=true: la RLS de las tablas base
--      aplica al que consulta (advisor de security_hardening_fase2).
--
-- QUÉ NO HACE
--   · No toca liquidacion_detalle, liquidaciones, recibos ni emitir_recibo.
--   · No crea RPCs (pieza 2). Hasta entonces la tabla es de sólo lectura para la app.
--   · No agrega el pozo al Resumen de liquidaciones.html.
--   · No expone pozo_cobros al portal (propietarios): SELECT sólo staff. Si en Fase 2
--     el propietario tiene que ver su recibo de cobro desde el portal, se agrega una
--     policy con fn_mis_entidades() como en recibos_select.
--
-- Guards (2026-09-19): pwd=/home/clio/dev/SGH · spcs=210 · ref=unlhcuanfrtpatoipwve
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. carreras.pozo_monto_caballo
ALTER TABLE public.carreras
  ADD COLUMN IF NOT EXISTS pozo_monto_caballo NUMERIC(15,2);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_carreras_pozo_monto') THEN
    ALTER TABLE public.carreras
      ADD CONSTRAINT chk_carreras_pozo_monto
      CHECK (pozo_monto_caballo IS NULL OR pozo_monto_caballo >= 0);
  END IF;
END $$;
COMMENT ON COLUMN public.carreras.pozo_monto_caballo IS
  'Pozo de ratificación a premios: monto que paga cada ratificado para correr ESTA carrera. NULL/0 = sin pozo. Lo carga secretaría (carta-llamados.html). El cobro guarda snapshot en pozo_cobros.monto.';

-- 2. reuniones.pozo_retencion_pct
ALTER TABLE public.reuniones
  ADD COLUMN IF NOT EXISTS pozo_retencion_pct NUMERIC(6,3);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_reuniones_pozo_retencion_pct') THEN
    ALTER TABLE public.reuniones
      ADD CONSTRAINT chk_reuniones_pozo_retencion_pct
      CHECK (pozo_retencion_pct IS NULL OR (pozo_retencion_pct >= 0 AND pozo_retencion_pct <= 100));
  END IF;
END $$;
COMMENT ON COLUMN public.reuniones.pozo_retencion_pct IS
  'Pozo de ratificación: % que retiene el hipódromo sobre lo cobrado, POR REUNIÓN (hoy 20). NULL = sin cargar (v_pozo_carrera devuelve retención NULL, no asume nada). Se congela al pagar al ganador (Fase 2).';

-- 3. ENUM
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_pozo_cobro') THEN
    CREATE TYPE public.estado_pozo_cobro AS ENUM ('cobrado', 'devuelto', 'anulado');
  END IF;
END $$;

-- 4. TABLA pozo_cobros
CREATE TABLE IF NOT EXISTS public.pozo_cobros (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id               uuid NOT NULL REFERENCES public.clubs(id),
  reunion_id            uuid NOT NULL REFERENCES public.reuniones(id),
  carrera_id            uuid NOT NULL REFERENCES public.carreras(id),
  inscripcion_id        uuid NOT NULL REFERENCES public.inscripciones(id),
  numero_recibo         integer NOT NULL,
  monto                 numeric(15,2) NOT NULL,
  forma_pago            public.forma_pago_recibo NOT NULL,
  pagador_nombre        text,
  pagador_documento     text,
  comprobante_url       text,
  estado                public.estado_pozo_cobro NOT NULL DEFAULT 'cobrado',
  cobrado_por           uuid REFERENCES public.usuarios(id),
  cobrado_at            timestamptz NOT NULL DEFAULT now(),
  devuelto_at           timestamptz,
  devuelto_por          uuid REFERENCES public.usuarios(id),
  motivo_devolucion     text,
  devolucion_forma_pago public.forma_pago_recibo,
  anulado_at            timestamptz,
  anulado_por           uuid REFERENCES public.usuarios(id),
  motivo_anulacion      text,
  foto_anulacion        jsonb,
  notas                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pozo_cobro_monto  CHECK (monto > 0),
  CONSTRAINT uq_pozo_cobro_numero  UNIQUE (club_id, numero_recibo),
  -- Coherencia de estado: los sellos de devolución/anulación sólo en su estado.
  CONSTRAINT chk_pozo_cobro_estado CHECK (
    (estado = 'cobrado'  AND devuelto_at IS NULL AND anulado_at IS NULL) OR
    (estado = 'devuelto' AND devuelto_at IS NOT NULL AND motivo_devolucion IS NOT NULL AND anulado_at IS NULL) OR
    (estado = 'anulado'  AND anulado_at  IS NOT NULL AND motivo_anulacion  IS NOT NULL AND devuelto_at IS NULL)
  )
);
COMMENT ON TABLE public.pozo_cobros IS
  'Pozo de ratificación a premios — COBRO a cada ratificado (plata que ENTRA). Circuito aparte de liquidacion_detalle: el pozo es plata de los propietarios entre sí que el club custodia, no deuda del club por un resultado, y se paga en el momento, antes de que exista la liquidación. Una fila por inscripción cobrada; monto = snapshot; devolver/anular no borran. Escritura sólo por RPC (cobrar_pozo / devolver_pozo / anular_cobro_pozo).';
COMMENT ON COLUMN public.pozo_cobros.monto IS 'SNAPSHOT de carreras.pozo_monto_caballo al momento de cobrar. No se recalcula.';
COMMENT ON COLUMN public.pozo_cobros.numero_recibo IS 'Serie propia por club: club_secuencias tipo ''recibo_cobro'' (fn_siguiente_numero). En pantalla y papel se muestra C-NNNN para no confundir con los recibos de pago.';
COMMENT ON COLUMN public.pozo_cobros.pagador_nombre IS 'Quién trajo la plata (libre). El vínculo formal (a quién devolver / a quién pagar si gana) sale de la inscripción, no del cobro.';
COMMENT ON COLUMN public.pozo_cobros.foto_anulacion IS 'to_jsonb(fila) ANTES de pasar a devuelto/anulado (patrón anular_recibo v2).';

-- Un solo cobro VIVO por inscripción; devueltos/anulados pueden repetirse (pagó, se devolvió, volvió a pagar).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pozo_cobro_vivo
  ON public.pozo_cobros (inscripcion_id) WHERE estado = 'cobrado';
CREATE INDEX IF NOT EXISTS idx_pozo_cobros_carrera ON public.pozo_cobros (carrera_id, estado);
CREATE INDEX IF NOT EXISTS idx_pozo_cobros_reunion ON public.pozo_cobros (reunion_id, estado);
CREATE INDEX IF NOT EXISTS idx_pozo_cobros_inscripcion ON public.pozo_cobros (inscripcion_id);

-- 5. RLS + privilegios. Dos capas (ver cabecera).
ALTER TABLE public.pozo_cobros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pozo_cobros_select ON public.pozo_cobros;
CREATE POLICY pozo_cobros_select ON public.pozo_cobros FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_super_admin())
    OR ((SELECT fn_is_staff()) AND club_id = (SELECT fn_get_user_club_id()))
  );
-- Sin policy de INSERT / UPDATE / DELETE: la app no escribe directo.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pozo_cobros FROM authenticated, anon;
GRANT  SELECT ON public.pozo_cobros TO authenticated;
REVOKE ALL    ON public.pozo_cobros FROM anon;

-- 6. Auditoría
DROP TRIGGER IF EXISTS trg_audit_pozo_cobros ON public.pozo_cobros;
CREATE TRIGGER trg_audit_pozo_cobros
  AFTER INSERT OR UPDATE OR DELETE ON public.pozo_cobros
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_log();

-- 7. Serie genérica + wrapper
CREATE OR REPLACE FUNCTION public.fn_siguiente_numero(p_club_id uuid, p_tipo text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_num INTEGER;
BEGIN
  IF p_club_id IS NULL OR p_tipo IS NULL OR btrim(p_tipo) = '' THEN
    RAISE EXCEPTION 'fn_siguiente_numero: faltan club o tipo de serie';
  END IF;
  INSERT INTO club_secuencias (club_id, tipo, ultimo_numero)
  VALUES (p_club_id, p_tipo, 1)
  ON CONFLICT (club_id, tipo)
  DO UPDATE SET ultimo_numero = club_secuencias.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_num;
  RETURN v_num;
END $function$;
REVOKE ALL ON FUNCTION public.fn_siguiente_numero(uuid, text) FROM PUBLIC, anon, authenticated;
-- Sólo los RPC SECURITY DEFINER (dueño postgres) la llaman. authenticated NO puede
-- consumir números a mano. (fn_siguiente_recibo conserva sus grants actuales.)

-- Mismo nombre, misma firma, mismo retorno, mismo comportamiento: emitir_recibo no cambia.
CREATE OR REPLACE FUNCTION public.fn_siguiente_recibo(p_club_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.fn_siguiente_numero(p_club_id, 'recibo');
END $function$;

-- 8. Vista del pozo por carrera
CREATE OR REPLACE VIEW public.v_pozo_carrera AS
SELECT
  ca.id                                   AS carrera_id,
  ca.reunion_id,
  r.club_id,
  ca.numero_turno,
  ca.numero_carrera_programa,
  ca.nombre                               AS carrera_nombre,
  ca.estado                               AS carrera_estado,
  ca.pozo_monto_caballo,
  (COALESCE(ca.pozo_monto_caballo, 0) > 0) AS tiene_pozo,
  r.pozo_retencion_pct,
  (SELECT count(*) FROM public.inscripciones i
     WHERE i.carrera_id = ca.id AND i.estado = 'ratificado')                       AS n_ratificados,
  (SELECT count(*) FROM public.pozo_cobros pc
     WHERE pc.carrera_id = ca.id AND pc.estado = 'cobrado')                        AS n_cobrados,
  (SELECT count(*) FROM public.pozo_cobros pc
     WHERE pc.carrera_id = ca.id AND pc.estado = 'devuelto')                       AS n_devueltos,
  (SELECT count(*) FROM public.pozo_cobros pc
     WHERE pc.carrera_id = ca.id AND pc.estado = 'anulado')                        AS n_anulados,
  ((SELECT count(*) FROM public.inscripciones i
      WHERE i.carrera_id = ca.id AND i.estado = 'ratificado')
    * COALESCE(ca.pozo_monto_caballo, 0))::numeric(15,2)                           AS esperado,
  (SELECT COALESCE(sum(pc.monto), 0) FROM public.pozo_cobros pc
     WHERE pc.carrera_id = ca.id AND pc.estado = 'cobrado')::numeric(15,2)         AS cobrado_bruto,
  (SELECT COALESCE(sum(pc.monto), 0) FROM public.pozo_cobros pc
     WHERE pc.carrera_id = ca.id AND pc.estado = 'devuelto')::numeric(15,2)        AS devuelto,
  CASE WHEN r.pozo_retencion_pct IS NULL THEN NULL
       ELSE round(
         (SELECT COALESCE(sum(pc.monto), 0) FROM public.pozo_cobros pc
            WHERE pc.carrera_id = ca.id AND pc.estado = 'cobrado')
         * r.pozo_retencion_pct / 100, 2)
  END::numeric(15,2)                                                               AS retencion,
  CASE WHEN r.pozo_retencion_pct IS NULL THEN NULL
       ELSE (SELECT COALESCE(sum(pc.monto), 0) FROM public.pozo_cobros pc
               WHERE pc.carrera_id = ca.id AND pc.estado = 'cobrado')
            - round(
              (SELECT COALESCE(sum(pc.monto), 0) FROM public.pozo_cobros pc
                 WHERE pc.carrera_id = ca.id AND pc.estado = 'cobrado')
              * r.pozo_retencion_pct / 100, 2)
  END::numeric(15,2)                                                               AS al_ganador
FROM public.carreras ca
JOIN public.reuniones r ON r.id = ca.reunion_id;
-- Todas las carreras (incluidas anuladas y sin pozo): la pantalla decide qué colapsa.
-- Filtrar NULL-safe del lado del cliente: .or('carrera_estado.is.null,carrera_estado.neq.anulada') (gotcha #5).
ALTER VIEW public.v_pozo_carrera SET (security_invoker = true);
COMMENT ON VIEW public.v_pozo_carrera IS
  'Pozo de ratificación por carrera, calculado sobre lo COBRADO (cobros estado=cobrado). esperado = ratificados × monto. retencion/al_ganador NULL si reuniones.pozo_retencion_pct es NULL. Única definición de la fórmula: la consumen pozo.html, resultados.html y los probes.';
GRANT SELECT ON public.v_pozo_carrera TO authenticated;
REVOKE ALL   ON public.v_pozo_carrera FROM anon;
