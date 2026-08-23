-- peso_balanza: CHECK de rango (300-600 kg)
--
-- peso_balanza es el peso del CABALLO medido en balanza. El error de R6/R8 fue
-- cargar ahi el handicap del jockey (~50-64 kg). Fede confirmo (2026-08-23) que
-- en Dolores SI se pesan los caballos y que desde la reunion del 20/09 el dato
-- correcto lo carga la persona asignada. La definicion de la columna no cambia:
-- lo que se agrega es la barrera para que no se vuelva a cargar mal.
--
-- NULL sigue permitido: CHECK con NULL evalua UNKNOWN, no es violacion.
-- Requiere que NO queden filas fuera de rango. Verificar antes:
--
--   SELECT count(*) FROM inscripciones
--   WHERE peso_balanza IS NOT NULL AND (peso_balanza < 300 OR peso_balanza > 600);
--   -- debe dar 0

ALTER TABLE inscripciones
  ADD CONSTRAINT inscripciones_peso_balanza_rango
  CHECK (peso_balanza IS NULL OR (peso_balanza >= 300 AND peso_balanza <= 600));

-- ── Variante NOT VALID ────────────────────────────────────────────────────────
-- Solo si se decide DEJAR las 104 filas de R6/R8 con el valor equivocado.
-- NOT VALID saltea el scan inicial, pero la constraint IGUAL se aplica a todo
-- INSERT y a todo UPDATE posterior: cualquier UPDATE sobre una de esas 104 filas
-- (aunque toque otra columna) va a fallar mientras peso_balanza siga fuera de
-- rango. Ver nota en docs/GOTCHAS.md.
--
-- ALTER TABLE inscripciones
--   ADD CONSTRAINT inscripciones_peso_balanza_rango
--   CHECK (peso_balanza IS NULL OR (peso_balanza >= 300 AND peso_balanza <= 600))
--   NOT VALID;
--
-- Y cuando las filas viejas esten saneadas:
-- ALTER TABLE inscripciones VALIDATE CONSTRAINT inscripciones_peso_balanza_rango;
