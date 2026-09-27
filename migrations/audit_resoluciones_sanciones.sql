-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ESTADO EN PRODUCCIÓN: **APLICADA el 2026-09-27** (`20260927223701 audit_resoluciones_sanciones`). Foto de prod después = tests/local/resoluciones_sanciones_md5_esperado.txt (55/55). Probe --prod 32/32. Este bloque de ESTADO
-- se agregó DESPUÉS de aplicar: las sentencias son idénticas a las aplicadas.
-- ISSUE-097 · pieza B — auditoría de resoluciones, resolucion_entidades y sanciones.
-- Mismo patrón que trg_audit_liquidacion_config / trg_audit_clubs: AFTER INSERT OR DELETE OR UPDATE,
-- fn_auditoria_log() sin cambios (usuario por el email del JWT; sin sesión → usuario_id NULL, "Sistema").
-- Corre DESPUÉS de trg_*_autor (BEFORE), así que registra el creado_por/modificado_* definitivos.
-- Rollback: migrations/rollback_audit_resoluciones_sanciones.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE TRIGGER trg_audit_resoluciones AFTER INSERT OR DELETE OR UPDATE ON public.resoluciones
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();
CREATE TRIGGER trg_audit_resolucion_entidades AFTER INSERT OR DELETE OR UPDATE ON public.resolucion_entidades
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();
CREATE TRIGGER trg_audit_sanciones AFTER INSERT OR DELETE OR UPDATE ON public.sanciones
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();
COMMIT;
