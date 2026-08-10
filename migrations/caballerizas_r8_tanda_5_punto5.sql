-- ============================================================
-- caballerizas_r8_tanda_5_punto5.sql — R8, tanda 5 punto 5
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo.
--
-- Pedido de Yesi el 10/08/2026: 5 caballerizas de la planilla final.
-- Cruzadas contra la base por nombre normalizado (upper, sin acentos,
-- sin no-alfanuméricos), tolerando el prefijo 'STUD ' en cualquiera
-- de los dos lados:
--
--   DON GIOVANNI     -> YA EXISTE  de9c5157-7b6b-4cfa-bdd5-0eda799afa2d
--                       (⚠ hipodromo_patente NULL — ver reporte)
--   LOS MELOS        -> YA EXISTE  a07b8f01-0be1-4e02-a63f-55fecfa346dd  (DOL)
--   MARIA EVA        -> YA EXISTE  d91f7c30-d59f-435f-8884-649e71530565  (DOL)
--   STUD LOS GRINGOS -> YA EXISTE  8ab122ff-91d6-4eda-9aca-fc28cda980b0  (DOL)
--   LA CALIFORNIA    -> NO EXISTE  -> única alta de esta migración
--
-- O sea: 4 de 5 ya estaban. Sólo LA CALIFORNIA es alta real.
--
-- Convención copiada de caballerizas.html (igual que tandas 2/3/4/5):
--   club_id = Dolores, estado 'activo', activo true, patente 'DOL'.
--   responsable / domicilio / telefono quedan NULL — los carga Yesi.
--
-- Guards corridos ANTES de escribir:
--   a) pwd = /home/clio/dev/SGH                         ✅
--   b) SELECT count(*) FROM spcs                        -> 179 ✅
--   c) caballerizas ~* 'CALIFOR'                        -> 0 filas ✅
--
-- ⚠ caballerizas NO tiene unique en nombre. La idempotencia la da el
--   WHERE NOT EXISTS, no la base.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Alta (1 de 5)
-- ------------------------------------------------------------
INSERT INTO caballerizas (club_id, nombre, hipodromo_patente, estado, activo)
SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid, v.nombre, v.patente, 'activo', true
FROM (VALUES
  ('LA CALIFORNIA', 'DOL'),
  -- 5 ESTRELLAS: stud de CURIOSA GO ON, GRAND FITO y LA DE ETIQUETA.
  -- Se escapó del cruce original porque arranca con número y las sondas
  -- por texto no lo levantaron. Verificado: caballerizas ~* 'ESTRELLA' -> 0 filas.
  ('5 ESTRELLAS',   'DOL')
) AS v(nombre, patente)
WHERE NOT EXISTS (
  SELECT 1 FROM caballerizas c
  WHERE regexp_replace(upper(translate(c.nombre,'ÁÉÍÓÚÑÜáéíóúñü','AEIOUNUAEIOUNU')),'[^A-Z0-9]','','g')
      = regexp_replace(upper(translate(v.nombre,'ÁÉÍÓÚÑÜáéíóúñü','AEIOUNUAEIOUNU')),'[^A-Z0-9]','','g')
);

-- ------------------------------------------------------------
-- 2. Verificación ANTES del COMMIT
-- ------------------------------------------------------------

-- Debe dar 1 fila: LA CALIFORNIA, patente DOL, club Dolores, activo.
SELECT id, nombre, hipodromo_patente, club_id, estado, activo
FROM caballerizas WHERE nombre = 'LA CALIFORNIA';

-- Deben aparecer las 5 del pedido, una fila cada una.
SELECT nombre, hipodromo_patente, activo FROM caballerizas
WHERE nombre IN ('DON GIOVANNI','LA CALIFORNIA','LOS MELOS','MARIA EVA','STUD LOS GRINGOS')
ORDER BY nombre;

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DELETE FROM caballerizas WHERE nombre = 'LA CALIFORNIA'
--   AND NOT EXISTS (SELECT 1 FROM spcs WHERE caballeriza_id = caballerizas.id);
