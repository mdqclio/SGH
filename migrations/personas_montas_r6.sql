-- ============================================================
-- personas_montas_r6.sql — alta de jockeys faltantes para la
-- corrección de montas de R6 (planilla oficial de Yesi)
-- ============================================================
-- ⏳ PROPUESTO — pendiente de gate (Leo). NO aplicar sin OK.
--
-- Contexto: los jockeys cambiados el día de la reunión (20/06/2026)
-- nunca entraron al sistema porque el alta de profesionales estaba
-- rota (bug de club_id, ISSUE-049, ya corregido). La planilla oficial
-- de Yesi — la misma que le manda a los jockeys por mail — es la
-- fuente autoritativa de las montas.
--
-- Cruce del mapa oficial (25 jockeys distintos) contra profesionales
-- (179 filas): 23 ya existen, 2 son alta.
--
-- Ya existen (NO se dan de alta):
--   TORRES ANIBAL, DIESTRA BAUTISTA, DELLI QUADRI IGNACIO,
--   IBARRA FERNANDO (= IBARRA FERNANDO AUGUSTO, grafía larga en base),
--   GUZMAN CLAUDIO, YALET IRINEO, YALET JORGE, CANTO TOBIAS,
--   GIL SANTINO, ZAPICO DIEGO, PRESA DANIEL, CONTRERAS JUAN CRUZ,
--   MARCHANT JUAN, GATICA DARIO, MARTINEZ AGUSTIN, AGUIRRE HUGO,
--   CAÑETE FACUNDO, ROJAS HERNAN, ACUÑA MATIAS, ACUÑA LUIS,
--   ALDECOA IVAN (tipo 'ambos'), D'ELIA THIAGO, GIULIANO BRUNO.
--
-- Faltantes verificados con búsqueda amplia por regex sobre
-- apellido||nombre (no sólo igualdad exacta):
--   * DE MAIO FACUNDO  — 0 filas con 'maio' en el padrón entero.
--     Único FACUNDO jockey = CAÑETE FACUNDO (persona distinta).
--   * GONZALEZ JOSE    — hay GONZALEZ ADRIAN AGUSTIN (entrenador),
--     GONZALEZ AGUSTIN (jockey) y GONZALEZ LUCAS (jockey), ningún JOSE.
--     OSUNA JOSE y PREBE JOSE son personas distintas.
--
-- Regla de la tanda 2 (autorizada por Leo el 05/08, ver
-- personas_r8_tanda_2.sql): alta con nombre completo y
-- documento_nro NULL; el DNI llega después por auto-registro.
--   club_id = Dolores (ISSUE-049), tipo 'jockey', estado 'activo',
--   activo true, hipodromo_patente NULL, documento_tipo/nro NULL.
--
-- ⚠ profesionales NO tiene unique en (apellido, nombre) — sólo PK en
--   id. La idempotencia la da el WHERE NOT EXISTS, no la base.
-- ============================================================

BEGIN;

INSERT INTO profesionales (club_id, tipo, apellido, nombre, estado, activo)
SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid, 'jockey'::tipo_profesional,
       v.apellido, v.nombre, 'activo', true
FROM (VALUES
  ('DE MAIO',  'FACUNDO'),
  ('GONZALEZ', 'JOSE')
) AS v(apellido, nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM profesionales p
  WHERE upper(btrim(p.apellido)) = upper(btrim(v.apellido))
    AND upper(btrim(p.nombre))   = upper(btrim(v.nombre))
);

-- Verificación esperada: profesionales 179 -> 181
COMMIT;
