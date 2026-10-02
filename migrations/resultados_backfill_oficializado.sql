-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ISSUE-101 (1/2) — backfill de resultados.oficializado_at / oficializado_por desde la auditoría
--
-- ESTADO EN PRODUCCIÓN: ver CHANGELOG / informe del día. Paso 1 de 4 (luego resultados_guard_cerrada.sql,
-- aplicar_resultado_v2.sql, desoficializar_carrera_v2.sql).
--
-- Al 2026-10-02 los 23 resultados oficiales tenían las dos columnas en NULL: aplicar_resultado nunca las
-- escribió. Cada uno tiene en `auditoria` el UPDATE/INSERT que lo pasó a 'oficial'; se toma la ÚLTIMA
-- transición (hay re-oficializaciones), con su fecha y su usuario. Las de la 9999 no tienen usuario
-- (probes con service_role): quedan con fecha y oficializado_por NULL.
--
-- Corre como sesión directa a la base (migración): pasa el guard de reunión cerrada (que se aplica en el
-- paso 2) aunque R6/R8 estén cerradas. No toca posiciones, apuestas ni líneas. El UPDATE mueve
-- updated_at (trigger resultados_set_updated_at): una pantalla abierta en esa carrera da
-- CONCURRENT_MODIFICATION al guardar → aplicar fuera del horario de carga.
--
-- Guard: ningún resultado oficial puede quedar sin oficializado_at (si alguno no tiene transición
-- auditada, RAISE y no se aplica nada).
-- Rollback: migrations/rollback_resultados_backfill_oficializado.sql (vuelve a NULL las filas de este
-- backfill, identificadas por la fecha = la de su fila de auditoría).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

WITH ultima AS (
  SELECT DISTINCT ON (a.registro_id) a.registro_id, a.created_at, a.usuario_id
    FROM auditoria a
   WHERE a.tabla = 'resultados'
     AND a.datos_despues->>'estado' = 'oficial'
     AND coalesce(a.datos_antes->>'estado', '') <> 'oficial'
   ORDER BY a.registro_id, a.created_at DESC
)
UPDATE resultados r
   SET oficializado_at  = u.created_at,
       oficializado_por = u.usuario_id
  FROM ultima u
 WHERE r.id = u.registro_id
   AND r.estado = 'oficial'
   AND r.oficializado_at IS NULL;

DO $$
DECLARE n_sin int; n_ofi int; n_por int;
BEGIN
  SELECT count(*) FILTER (WHERE estado = 'oficial' AND oficializado_at IS NULL),
         count(*) FILTER (WHERE estado = 'oficial'),
         count(*) FILTER (WHERE estado = 'oficial' AND oficializado_por IS NOT NULL)
    INTO n_sin, n_ofi, n_por FROM resultados;
  IF n_sin > 0 THEN
    RAISE EXCEPTION 'resultados_backfill_oficializado: % de % resultados oficiales quedaron sin oficializado_at (sin transición auditada)', n_sin, n_ofi;
  END IF;
  RAISE NOTICE 'resultados_backfill_oficializado: % oficiales con fecha, % con usuario', n_ofi, n_por;
END $$;

COMMIT;
