-- ROLLBACK de migrations/audit_resoluciones_sanciones.sql (ISSUE-097, pieza B).
-- Las filas de auditoria generadas mientras estuvo activo se CONSERVAN (son historia).
BEGIN;
DROP TRIGGER IF EXISTS trg_audit_resoluciones ON public.resoluciones;
DROP TRIGGER IF EXISTS trg_audit_resolucion_entidades ON public.resolucion_entidades;
DROP TRIGGER IF EXISTS trg_audit_sanciones ON public.sanciones;
COMMIT;
