-- Rollback de migrations/anular_recibo_v1.sql (ISSUE-056).
--
-- Se dropea la función. Las tres columnas se DEJAN: son aditivas y nullable, no
-- rompen nada, y si ya hubo alguna anulación borrarlas perdería el único registro de
-- qué contenía ese recibo (lineas_anuladas) y de quién lo anuló.
DROP FUNCTION IF EXISTS public.anular_recibo(uuid, text);

-- Sólo si NUNCA se anuló nada y se quiere volver al schema exacto previo.
-- Verificar primero:
--   SELECT count(*) FROM recibos WHERE estado='anulado' OR lineas_anuladas IS NOT NULL;
-- Tiene que dar 0.
--
-- ALTER TABLE recibos
--   DROP COLUMN IF EXISTS anulado_por,
--   DROP COLUMN IF EXISTS motivo_anulacion,
--   DROP COLUMN IF EXISTS lineas_anuladas;
