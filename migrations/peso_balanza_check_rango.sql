-- peso_balanza: CHECK de rango (300-600 kg)  — APLICADO 2026-08-23
--
-- peso_balanza es el peso del CABALLO medido en balanza. El error de R6/R8 fue
-- cargar ahi el handicap del jockey (~50-64 kg). Fede confirmo (2026-08-23) que
-- en Dolores SI se pesan los caballos y que desde la reunion del 20/09 el dato
-- correcto lo carga la persona asignada. La definicion de la columna no cambia:
-- esto es la barrera para que no se vuelva a cargar mal.
--
-- NULL sigue permitido: CHECK con NULL evalua UNKNOWN, no es violacion.
--
-- Orden de aplicacion (los tres pasos se corrieron el 2026-08-23):
--   1. Saneamiento: las 104 filas de R6/R8 fuera de rango -> NULL.
--      Rollback en migrations/ROLLBACK_peso_balanza_null_r6_r8.sql
--   2. Verificacion:
--      SELECT count(*) FROM inscripciones
--      WHERE peso_balanza IS NOT NULL AND (peso_balanza < 300 OR peso_balanza > 600);
--      -- devolvio 0
--   3. Este ALTER, validado (convalidated = true).

ALTER TABLE inscripciones
  ADD CONSTRAINT inscripciones_peso_balanza_rango
  CHECK (peso_balanza IS NULL OR (peso_balanza >= 300 AND peso_balanza <= 600));

-- Se descarto NOT VALID a proposito. NOT VALID saltea el scan inicial pero la
-- constraint IGUAL se aplica a todo UPDATE posterior: con las 104 filas sucias
-- en su lugar, cualquier UPDATE sobre una de ellas (aunque tocara otra columna)
-- habria fallado con una violacion de peso_balanza desde modulos que no tienen
-- nada que ver. Ver GOTCHAS #72.
