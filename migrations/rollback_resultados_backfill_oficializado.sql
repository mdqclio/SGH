-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK de migrations/resultados_backfill_oficializado.sql
-- Vuelve a NULL oficializado_at / oficializado_por de los resultados cuyo oficializado_at coincide con
-- la fecha de su última transición a 'oficial' en la auditoría (= lo que puso el backfill). Lo que haya
-- escrito aplicar_resultado v2 después (now() al oficializar) no coincide con una fila de auditoría
-- anterior y no se toca. Sesión directa a la base: pasa el guard de reunión cerrada.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

WITH ultima AS (
  SELECT DISTINCT ON (a.registro_id) a.registro_id, a.created_at
    FROM auditoria a
   WHERE a.tabla = 'resultados'
     AND a.datos_despues->>'estado' = 'oficial'
     AND coalesce(a.datos_antes->>'estado', '') <> 'oficial'
   ORDER BY a.registro_id, a.created_at DESC
)
UPDATE resultados r
   SET oficializado_at = NULL, oficializado_por = NULL
  FROM ultima u
 WHERE r.id = u.registro_id
   AND r.oficializado_at = u.created_at;

COMMIT;
