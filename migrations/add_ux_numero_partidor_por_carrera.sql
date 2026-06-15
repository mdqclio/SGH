-- add_ux_numero_partidor_por_carrera.sql
-- Feature "Cargar sorteo" de gateras (2026-06).
--
-- Unicidad de la GATERA (inscripciones.numero_partidor) dentro de una carrera:
-- no puede haber dos inscripciones con el mismo numero_partidor en la misma carrera.
--
-- Índice PARCIAL (WHERE numero_partidor IS NOT NULL):
--   - permite múltiples filas con numero_partidor NULL (caballos aún sin sortear / forfait).
--   - sólo aplica unicidad entre gateras efectivamente cargadas.
--   - scope por carrera_id: la misma gatera puede repetirse en carreras distintas (es por-carrera).
--
-- Seguro de aplicar: hoy numero_partidor es 100% NULL en toda la tabla -> 0 conflictos al crear.

CREATE UNIQUE INDEX IF NOT EXISTS ux_insc_partidor_carrera
  ON inscripciones (carrera_id, numero_partidor)
  WHERE numero_partidor IS NOT NULL;

-- ROLLBACK:
-- DROP INDEX IF EXISTS ux_insc_partidor_carrera;
