-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ISSUE-102 — el resultado de una reunión con la liquidación cerrada no se cambia (en la base)
--
-- ESTADO EN PRODUCCIÓN: ver CHANGELOG / informe del día. Paso 2 de 4 (después del backfill de
-- ISSUE-101; antes de aplicar_resultado_v2.sql y desoficializar_carrera_v2.sql).
-- md5(pg_get_functiondef) esperado, medido en el sandbox aplicando ESTE archivo: ver
-- tests/local/resultados_cerrada_md5_esperado.txt (función + las 6 políticas).
--
-- Relevamiento: docs/diagnosticos/2026-10-02_resultados-reunion-cerrada-fase1.md (reports). Hasta hoy el
-- cierre (ISSUE-091) protegía las líneas y los headers de liquidación, no el resultado: F10 en la vista
-- oficial, la API directa, resultados_legacy.html o aplicar_resultado cambiaban posiciones de R6/R8 sin
-- registro y sin que la liquidación (ya pagada) se enterara.
--
-- Qué hace:
--   1. fn_resultado_cerrado_guard() + trg_resultado_cerrado (BEFORE INSERT/UPDATE/DELETE) en resultados,
--      resultado_posiciones y resultado_apuestas: si la carrera (por OLD y por NEW) es de una reunión con
--      liquidacion_cerrada_at → RAISE P0092. Pasan SÓLO:
--        · la sesión directa a la base (migraciones por MCP/psql: session_user <> 'authenticator');
--        · la marca de sesión sgh.correccion_resultado = '1' (la va a poner la RPC de corrección con
--          resolución, paso 4, todavía no existe).
--      service_role NO pasa (decisión del 02/10): un resultado no se regulariza por la API.
--   2. Auditoría de resultado_posiciones y resultado_apuestas (fn_auditoria_log), que no tenían: el corrió
--      / no corrió y los dividendos no dejaban rastro por fila (ISSUE-089).
--   3. Las políticas de ESCRITURA de resultados y resultado_posiciones exigen fn_is_staff() en la rama de
--      club (patrón ISSUE-093; resultado_apuestas ya lo tenía). SELECT no cambia.
--
-- Rollback: migrations/rollback_resultados_guard_cerrada.sql (políticas exactas de hoy).
-- Guards de esta migración (2026-10-02): pwd=/home/clio/dev/SGH · spcs=238 · ref=unlhcuanfrtpatoipwve
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 1. Guard de reunión cerrada ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_resultado_cerrado_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_carreras uuid[];
  v_c        RECORD;
BEGIN
  -- Migración (sesión directa a la base) o corrección con resolución (marca de la RPC, paso 4).
  -- service_role NO está exento: entra por 'authenticator' como cualquier llamada a la API.
  IF session_user::text <> 'authenticator'
     OR coalesce(current_setting('sgh.correccion_resultado', true), '') = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'resultados' THEN
    v_carreras := ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.carrera_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.carrera_id END ];
  ELSE
    v_carreras := ARRAY(
      SELECT r.carrera_id FROM resultados r
       WHERE r.id IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD.resultado_id END,
                      CASE WHEN TG_OP <> 'DELETE' THEN NEW.resultado_id END));
  END IF;

  FOR v_c IN
    SELECT c.numero_turno, c.numero_carrera_programa, c.reunion_id
      FROM carreras c WHERE c.id = ANY (v_carreras)
  LOOP
    IF fn_reunion_liq_cerrada(v_c.reunion_id) THEN
      RAISE EXCEPTION 'La liquidación de esta reunión está cerrada (saldada): el resultado de la carrera % no se puede modificar. Si un fallo (p. ej. de doping) obliga a cambiarlo, lo corrige un super_admin con la resolución. ISSUE-102',
        coalesce(v_c.numero_carrera_programa::text, 'del turno ' || v_c.numero_turno)
        USING ERRCODE = 'P0092';
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END $function$;

REVOKE ALL ON FUNCTION public.fn_resultado_cerrado_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_resultado_cerrado ON public.resultados;
CREATE TRIGGER trg_resultado_cerrado BEFORE INSERT OR UPDATE OR DELETE ON public.resultados
  FOR EACH ROW EXECUTE FUNCTION public.fn_resultado_cerrado_guard();
DROP TRIGGER IF EXISTS trg_resultado_cerrado ON public.resultado_posiciones;
CREATE TRIGGER trg_resultado_cerrado BEFORE INSERT OR UPDATE OR DELETE ON public.resultado_posiciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_resultado_cerrado_guard();
DROP TRIGGER IF EXISTS trg_resultado_cerrado ON public.resultado_apuestas;
CREATE TRIGGER trg_resultado_cerrado BEFORE INSERT OR UPDATE OR DELETE ON public.resultado_apuestas
  FOR EACH ROW EXECUTE FUNCTION public.fn_resultado_cerrado_guard();

-- ── 2. Auditoría de posiciones y apuestas ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_resultado_posiciones ON public.resultado_posiciones;
CREATE TRIGGER trg_audit_resultado_posiciones AFTER INSERT OR DELETE OR UPDATE ON public.resultado_posiciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_log();
DROP TRIGGER IF EXISTS trg_audit_resultado_apuestas ON public.resultado_apuestas;
CREATE TRIGGER trg_audit_resultado_apuestas AFTER INSERT OR DELETE OR UPDATE ON public.resultado_apuestas
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_log();

-- ── 3. Políticas de escritura con fn_is_staff() (patrón ISSUE-093) ────────────────────────────
DROP POLICY resultados_insert ON public.resultados;
CREATE POLICY resultados_insert ON public.resultados AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultados_update ON public.resultados;
CREATE POLICY resultados_update ON public.resultados AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultados_delete ON public.resultados;
CREATE POLICY resultados_delete ON public.resultados AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_posiciones_insert ON public.resultado_posiciones;
CREATE POLICY resultado_posiciones_insert ON public.resultado_posiciones AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_posiciones_update ON public.resultado_posiciones;
CREATE POLICY resultado_posiciones_update ON public.resultado_posiciones AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_posiciones_delete ON public.resultado_posiciones;
CREATE POLICY resultado_posiciones_delete ON public.resultado_posiciones AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

COMMIT;
