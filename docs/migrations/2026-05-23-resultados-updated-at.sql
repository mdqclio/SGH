-- Agrega updated_at a resultados para optimistic locking en aplicar_resultado RPC.

ALTER TABLE resultados
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE resultados SET updated_at = created_at WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_resultados_updated_at ON resultados(id, updated_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS resultados_set_updated_at ON resultados;
CREATE TRIGGER resultados_set_updated_at
  BEFORE UPDATE ON resultados
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
