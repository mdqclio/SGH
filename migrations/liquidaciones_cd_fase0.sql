-- ===========================================================================
-- ISSUE-001 - Liquidaciones C+D - Fase 0 (migracion de schema)
-- Branch: feat/liquidaciones-cd
-- Arquitectura C1: la LINEA (liquidacion_detalle) es la unidad de deuda con su
-- estado; `recibos` (nueva) es la capa de cobro que agrupa lineas impagas
-- cross-reunion via recibo_id. Beneficiario denormalizado en la linea.
-- Correr en el SQL Editor de Supabase. Idempotente (re-ejecutable).
-- Comentarios SOLO en lineas propias (paste-safe) y en ASCII.
-- ===========================================================================

-- 1. ENUM types
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_linea_liq') THEN
    CREATE TYPE estado_linea_liq AS ENUM ('impago', 'pagado', 'retenido');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'concepto_liq') THEN
    CREATE TYPE concepto_liq AS ENUM
      ('premio', 'bono', 'actuacion', 'incentivo_jockey', 'incentivo_entrenador', 'fondo_solidario');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'beneficiario_tipo') THEN
    CREATE TYPE beneficiario_tipo AS ENUM ('profesional', 'propietario', 'club');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'forma_pago_recibo') THEN
    CREATE TYPE forma_pago_recibo AS ENUM ('efectivo', 'transferencia');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_recibo') THEN
    CREATE TYPE estado_recibo AS ENUM ('emitido', 'anulado');
  END IF;
END $$;

-- 2. Config de liquidacion por club (saca lo hardcodeado del JS).
--    Reparto 1-5 + 2% fondo solidario = 100. Incentivos por reunion.
--    Dias anti-doping. Retencion DGI nullable (Dolores no retiene; sin escala).
CREATE TABLE IF NOT EXISTS liquidacion_config (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                     UUID NOT NULL REFERENCES clubs(id),
  pct_propietario             NUMERIC(6,3) NOT NULL DEFAULT 70,
  pct_entrenador              NUMERIC(6,3) NOT NULL DEFAULT 10,
  pct_jockey                  NUMERIC(6,3) NOT NULL DEFAULT 10,
  pct_peon                    NUMERIC(6,3) NOT NULL DEFAULT 4,
  pct_capataz                 NUMERIC(6,3) NOT NULL DEFAULT 3,
  pct_sereno                  NUMERIC(6,3) NOT NULL DEFAULT 1,
  pct_fondo_solidario         NUMERIC(6,3) NOT NULL DEFAULT 2,
  incentivo_jockey_monto      NUMERIC(15,2) NOT NULL DEFAULT 0,
  incentivo_entrenador_monto  NUMERIC(15,2) NOT NULL DEFAULT 0,
  dias_antidoping             INTEGER NOT NULL DEFAULT 30,
  retencion_dgi_pct           NUMERIC(6,3),
  vigente_desde               DATE NOT NULL DEFAULT CURRENT_DATE,
  vigente_hasta               DATE,
  activo                      BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_reparto_suma_100 CHECK (
    pct_propietario + pct_entrenador + pct_jockey + pct_peon
    + pct_capataz + pct_sereno + pct_fondo_solidario = 100
  )
);

-- Seed para Dolores con los % confirmados (incentivos en 0 hasta tener monto).
INSERT INTO liquidacion_config (club_id)
SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c'
WHERE NOT EXISTS (
  SELECT 1 FROM liquidacion_config
  WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND activo = true
);

-- 3. Numeracion correlativa de recibo POR CLUB (secuencia + funcion con lock).
CREATE TABLE IF NOT EXISTS club_secuencias (
  club_id        UUID NOT NULL REFERENCES clubs(id),
  tipo           TEXT NOT NULL,
  ultimo_numero  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (club_id, tipo)
);

CREATE OR REPLACE FUNCTION fn_siguiente_recibo(p_club_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_num INTEGER;
BEGIN
  INSERT INTO club_secuencias (club_id, tipo, ultimo_numero)
  VALUES (p_club_id, 'recibo', 1)
  ON CONFLICT (club_id, tipo)
  DO UPDATE SET ultimo_numero = club_secuencias.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_num;
  RETURN v_num;
END $$;

-- 4. Recibos (capa de cobro, cross-reunion, por persona).
CREATE TABLE IF NOT EXISTS recibos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id            UUID NOT NULL REFERENCES clubs(id),
  numero_recibo      INTEGER NOT NULL,
  beneficiario_tipo  beneficiario_tipo NOT NULL,
  profesional_id     UUID REFERENCES profesionales(id),
  propietario_id     UUID REFERENCES propietarios(id),
  forma_pago         forma_pago_recibo NOT NULL,
  total_premios      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_descuentos   NUMERIC(15,2) NOT NULL DEFAULT 0,
  retencion_dgi      NUMERIC(15,2),
  neto_a_cobrar      NUMERIC(15,2) GENERATED ALWAYS AS
                       (total_premios - total_descuentos - COALESCE(retencion_dgi, 0)) STORED,
  cobrador_nombre    TEXT,
  cobrador_documento TEXT,
  comprobante_url    TEXT,
  estado             estado_recibo NOT NULL DEFAULT 'emitido',
  emitido_por        UUID REFERENCES usuarios(id),
  emitido_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulado_at         TIMESTAMPTZ,
  notas              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_recibo_por_club UNIQUE (club_id, numero_recibo),
  CONSTRAINT chk_recibo_beneficiario CHECK (
    (beneficiario_tipo = 'profesional' AND profesional_id IS NOT NULL AND propietario_id IS NULL)
 OR (beneficiario_tipo = 'propietario' AND propietario_id IS NOT NULL AND profesional_id IS NULL)
  )
);

-- 5. La LINEA como unidad de deuda - ampliar liquidacion_detalle.
--    carrera_id ya existe y es nullable -> sirve para incentivos por-reunion.
--    inscripcion_id: caballo/SPC + carrera del premio; NULL para incentivos.
--    beneficiario_id es polimorfico (sin FK).
ALTER TABLE liquidacion_detalle ADD COLUMN IF NOT EXISTS estado_linea      estado_linea_liq NOT NULL DEFAULT 'impago';
ALTER TABLE liquidacion_detalle ADD COLUMN IF NOT EXISTS concepto_tipo     concepto_liq;
ALTER TABLE liquidacion_detalle ADD COLUMN IF NOT EXISTS posicion          INTEGER;
ALTER TABLE liquidacion_detalle ADD COLUMN IF NOT EXISTS inscripcion_id    UUID REFERENCES inscripciones(id);
ALTER TABLE liquidacion_detalle ADD COLUMN IF NOT EXISTS fecha_liberacion  DATE;
ALTER TABLE liquidacion_detalle ADD COLUMN IF NOT EXISTS pagado_at         TIMESTAMPTZ;
ALTER TABLE liquidacion_detalle ADD COLUMN IF NOT EXISTS recibo_id         UUID REFERENCES recibos(id);
ALTER TABLE liquidacion_detalle ADD COLUMN IF NOT EXISTS beneficiario_tipo beneficiario_tipo;
ALTER TABLE liquidacion_detalle ADD COLUMN IF NOT EXISTS beneficiario_id   UUID;
ALTER TABLE liquidacion_detalle ADD COLUMN IF NOT EXISTS reunion_id        UUID REFERENCES reuniones(id);

CREATE INDEX IF NOT EXISTS idx_liqdet_beneficiario
  ON liquidacion_detalle (beneficiario_tipo, beneficiario_id, estado_linea);
CREATE INDEX IF NOT EXISTS idx_liqdet_recibo ON liquidacion_detalle (recibo_id);

-- 6. RLS (patron 2A club_id directo - fn_get_user_club_id / fn_is_super_admin).
ALTER TABLE liquidacion_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE recibos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_secuencias    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "liquidacion_config_rls" ON liquidacion_config;
CREATE POLICY "liquidacion_config_rls" ON liquidacion_config FOR ALL TO authenticated
  USING      (fn_is_super_admin() OR club_id = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());

DROP POLICY IF EXISTS "recibos_rls" ON recibos;
CREATE POLICY "recibos_rls" ON recibos FOR ALL TO authenticated
  USING      (fn_is_super_admin() OR club_id = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());

DROP POLICY IF EXISTS "club_secuencias_rls" ON club_secuencias;
CREATE POLICY "club_secuencias_rls" ON club_secuencias FOR ALL TO authenticated
  USING      (fn_is_super_admin() OR club_id = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());

-- 7. Auditoria (mismo patron que trg_audit_liquidaciones -> fn_auditoria_log).
DROP TRIGGER IF EXISTS trg_audit_recibos ON recibos;
CREATE TRIGGER trg_audit_recibos
  AFTER INSERT OR UPDATE OR DELETE ON recibos
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();

DROP TRIGGER IF EXISTS trg_audit_liquidacion_config ON liquidacion_config;
CREATE TRIGGER trg_audit_liquidacion_config
  AFTER INSERT OR UPDATE OR DELETE ON liquidacion_config
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();

-- NOTA oficializar reunion (Fase 2bis): NO requiere schema. Boton que setea
-- resultados.estado='oficial' en bloque (columna existente).
-- NOTA bono 6-8: el monto sigue en carreras.distribucion_premios JSONB
-- (hoy 100k). El fix de calcPremio (que pague + 100% propietario) es Fase 2.
