-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK de migrations/portal_alta_spc_studbook.sql
--
-- Deja spcs como estaba el 2026-10-01: sin la RPC, sin el trigger de alta/revisión, sin la
-- auditoría de spcs y sin las 6 columnas. Las fichas creadas desde el portal NO se borran (son
-- caballos reales del Stud Book y pueden tener inscripciones): pierden sólo la marca. Si hace falta
-- saber cuáles eran, ANTES de correr esto:
--   select id, nombre, studbook_id, alta_por, revision_pendiente, revision_motivos, created_at
--     from spcs where alta_origen = 'portal';
-- Las filas que trg_audit_spcs escribió en auditoria quedan (no se borra auditoría).
-- Antes de aplicarlo, sacar de main el portal/spcs.html/inscripciones.html que leen las columnas
-- (inscripciones.html pide spcs(revision_pendiente) y fallaría).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DROP FUNCTION IF EXISTS public.rpc_spc_alta_studbook_portal(uuid, uuid, text, text, date, text, text, text, text, text, text, text, text, integer, text[]);
DROP TRIGGER IF EXISTS trg_audit_spcs ON public.spcs;
DROP TRIGGER IF EXISTS trg_spcs_alta_revision ON public.spcs;
DROP FUNCTION IF EXISTS public.fn_spcs_alta_revision();
DROP INDEX IF EXISTS public.spcs_revision_pendiente_idx;
ALTER TABLE public.spcs DROP CONSTRAINT IF EXISTS spcs_alta_origen_check;
ALTER TABLE public.spcs
  DROP COLUMN IF EXISTS revisado_at,
  DROP COLUMN IF EXISTS revisado_por,
  DROP COLUMN IF EXISTS revision_motivos,
  DROP COLUMN IF EXISTS revision_pendiente,
  DROP COLUMN IF EXISTS alta_por,
  DROP COLUMN IF EXISTS alta_origen;

COMMIT;
