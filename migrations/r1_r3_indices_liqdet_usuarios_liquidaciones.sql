-- R1/R3 — Índices de acceso + ANALYZE
-- Origen: docs/PERF_AUDIT.md (auditoría de performance y escalabilidad a 10 hipódromos)
-- Hallazgo principal: H1 — liquidacion_detalle sin índice en liquidacion_id.
-- Aplicado: 2026-07-28 vía MCP apply_migration (nombre: r1_r3_indices_liqdet_usuarios_liquidaciones)
-- Alcance: SOLO Prioridad 1. NO incluye Prioridad 2/3/4 ni el wrap de policies (R2a).
--
-- DESVIACIONES respecto de lo propuesto en PERF_AUDIT.md:
--
--   1. usuarios.email va NO ÚNICO (el informe proponía CREATE UNIQUE INDEX ux_usuarios_email).
--      Rechazado: el UNIQUE (club_id, email) existente permite deliberadamente el mismo email
--      en dos clubes distintos — justo el escenario de 10 hipódromos (una persona que trabaja
--      en más de un club). Un unique global lo prohibiría para siempre. El índice no-único da
--      el mismo beneficio de lookup para fn_get_user_club_id(). La unicidad global es una
--      decisión de diseño multi-tenant aparte, no un índice de performance.
--      Dato de apoyo: SELECT email, count(*) FROM usuarios GROUP BY email HAVING count(*)>1
--      devolvió 0 filas — hoy no hay duplicados, la decisión futura queda abierta.
--
--   2. Sin CONCURRENTLY. CREATE INDEX CONCURRENTLY no corre dentro de una transacción y
--      apply_migration envuelve el DDL. Las tablas son chicas al momento de aplicar
--      (liquidacion_detalle=279, liquidaciones=89, usuarios=3), así que el lock del
--      CREATE INDEX normal es trivial. Evita además el riesgo de dejar un índice INVALID.
--      Si esto se re-aplica sobre una base grande, usar CONCURRENTLY fuera de transacción.

CREATE INDEX IF NOT EXISTS idx_liqdet_liquidacion
  ON public.liquidacion_detalle (liquidacion_id);

CREATE INDEX IF NOT EXISTS idx_usuarios_email
  ON public.usuarios (email);

CREATE INDEX IF NOT EXISTS idx_liquidaciones_reunion_club
  ON public.liquidaciones (reunion_id, club_id);

-- ANALYZE — corrido aparte (execute_sql), no dentro de la migración.
-- CREATE INDEX actualiza pg_class.reltuples/relpages pero NO puebla pg_statistic
-- (n_distinct, MCV, histogramas), que es lo que el planner necesita para estimar la
-- selectividad del IN-list. Sin ANALYZE el planner puede ignorar el índice nuevo.
-- Por eso liquidacion_detalle y liquidaciones también se analizan, no sólo las 6 tablas
-- que listaba el informe.

ANALYZE public.liquidacion_detalle;
ANALYZE public.liquidaciones;
ANALYZE public.spcs;
ANALYZE public.reuniones;
ANALYZE public.usuarios;
ANALYZE public.propietarios;
ANALYZE public.profesionales;
ANALYZE public.caballerizas;
