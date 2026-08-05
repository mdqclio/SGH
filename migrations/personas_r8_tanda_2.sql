-- ============================================================
-- personas_r8_tanda_2.sql — alta de jockeys/cuidadores faltantes (R8, tandas 1 + 2)
-- ============================================================
-- ✅ APLICADO el 05/08/2026 por MCP apply_migration, migración `personas_r8_tanda_2`
--    10 altas + UPDATE de ALDECOA IVAN a tipo 'ambos'. profesionales 167 -> 177.
--    Verificado: 0 con club_id NULL, 0 duplicados de (apellido, nombre).
-- Cambio de regla autorizado por Leo el 05/08: esta tanda SÍ crea
-- personas, con nombre completo y documento_nro NULL donde no haya DNI.
-- El DNI llega después por auto-registro (Gate 3 ya vivo). El cierre de
-- inscripciones es el viernes 07/08 y no se puede esperar al documento.
--
-- Padrón cruzado: 18 jockeys + 25 cuidadores del xlsx (ALDECOA IVAN
-- figura en las dos listas), contra las 167 filas de profesionales.
-- Resultado: 32 ya existen, 10 son alta, 1 es cambio de tipo.
--
-- Para cada alta se verificó: 0 filas con el mismo apellido en la tabla.
-- Los nombres de la planilla que matchearon contra una grafía más larga
-- de la base NO se dan de alta (FARIAS OSVALDO = FARIAS OSVALDO ISMAEL,
-- QUINTEROS CARLA = CARLA ELISABETH, GIMENEZ MARCOS = MARCOS EZEQUIEL,
-- SAN MARTIN SERGIO = SERGIO SEBASTIAN, MEDINA OSCAR = OSCAR ROBERTO,
-- VALENCIA GERARDO = GERARDO MANUEL).
--
-- Convención copiada de profesionales.html / jockeys.html:
--   estado 'activo', activo true, hipodromo_patente NULL (el form lo
--   deja vacío en un alta nueva), documento_tipo/documento_nro NULL.
--   club_id = Dolores (ver ISSUE-049: profesionales.html no lo mandaba;
--   ya corregido en fix/club-id-alta-profesionales).
--
-- ⚠ profesionales NO tiene unique en (apellido, nombre) — sólo PK en id.
--   La idempotencia la da el WHERE NOT EXISTS, no la base.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Jockeys faltantes (4)
--    Los otros 13 del padrón ya están: DIESTRA PEDRO, PRESA DANIEL,
--    YALET JORGE, DELLI QUADRI IGNACIO, TORRES ANIBAL, GATICA DARIO,
--    YALET IRINEO, ROJAS HERNAN, AGUIRRE HUGO, GIL SANTINO, OSUNA JOSE,
--    CONTRERAS JUAN CRUZ, MARTINEZ AGUSTIN.
--    ALDECOA IVAN va por el UPDATE del bloque 3.
-- ------------------------------------------------------------
INSERT INTO profesionales (club_id, tipo, apellido, nombre, estado, activo)
SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid, 'jockey'::tipo_profesional,
       v.apellido, v.nombre, 'activo', true
FROM (VALUES
  ('GUZMAN',   'CLAUDIO'),
  ('GONZALEZ', 'LUCAS'),     -- ningún GONZALEZ en la tabla
  ('GONZALEZ', 'AGUSTIN'),   -- ídem
  ('MUÑIZ',    'MATIAS')     -- sin MUÑIZ ni MUNIZ en la tabla
) AS v(apellido, nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM profesionales p
  WHERE upper(btrim(p.apellido)) = upper(btrim(v.apellido))
    AND upper(btrim(p.nombre))   = upper(btrim(v.nombre))
);

-- ------------------------------------------------------------
-- 2. Cuidadores faltantes (6)
--    'cuidador' en la planilla = tipo 'entrenador' en profesionales.
--    Los otros 18 del padrón ya están.
-- ------------------------------------------------------------
INSERT INTO profesionales (club_id, tipo, apellido, nombre, estado, activo)
SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid, 'entrenador'::tipo_profesional,
       v.apellido, v.nombre, 'activo', true
FROM (VALUES
  ('GONZALEZ', 'ADRIAN AGUSTIN'),
  ('VARELA',   'LORENA SOLEDAD'),
  ('ALLEN',    'JUAN JOSE'),
  ('DIAZ',     'EMILIANO LUJAN'),  -- hay DIAZ AMERICO RAMON y DIAZ CARLOS RODOLFO, ningún Emiliano
  ('CAMPELO',  'LEONARDO'),
  ('PAGANO',   'JUAN MAURICIO')    -- el 'PAGANDO' de la hoja 12 es typo de PAGANO
) AS v(apellido, nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM profesionales p
  WHERE upper(btrim(p.apellido)) = upper(btrim(v.apellido))
    AND upper(btrim(p.nombre))   = upper(btrim(v.nombre))
);

-- ------------------------------------------------------------
-- 3. ALDECOA IVAN — NO es alta, es cambio de tipo
--    En la planilla figura en la lista de jockeys Y en la de cuidadores.
--    En la base ya está como 'entrenador' (DNI 39491188, patente DOL).
--    El enum tipo_profesional tiene 'ambos' justo para esto.
--    No se toca ningún otro campo — el DNI que ya tiene queda igual.
-- ------------------------------------------------------------
UPDATE profesionales
SET tipo = 'ambos'::tipo_profesional, updated_at = now()
WHERE upper(btrim(apellido)) = 'ALDECOA'
  AND upper(btrim(nombre))   = 'IVAN'
  AND tipo = 'entrenador'::tipo_profesional;

-- ------------------------------------------------------------
-- ⚠ MAITIA MIGUEL A — NO lleva INSERT ni bloque comentado
-- ------------------------------------------------------------
-- Leo pidió dejarlo comentado como DON NITO por ser dudoso contra "el
-- MAITIA MIGUEL existente". El cruce lo resuelve: en la base el registro
-- es literalmente MAITIA, 'MIGUEL A' (entrenador, sin DNI). No existe
-- ningún MAITIA MIGUEL a secas — los dos MAITIA de la tabla son 'LUIS' y
-- 'MIGUEL A'. Coincide carácter por carácter con la planilla: es la
-- misma persona. No hay nada que dar de alta ni que desambiguar, así que
-- no hace falta ni el bloque comentado.

-- Verificación dentro de la misma transacción:
--   revisar ANTES de hacer COMMIT.
SELECT count(*) AS profesionales_total FROM profesionales;

SELECT tipo::text, apellido, nombre, coalesce(documento_nro,'(sin DNI)') AS doc,
       estado, activo
FROM profesionales
WHERE (upper(apellido), upper(nombre)) IN (
  ('GUZMAN','CLAUDIO'), ('GONZALEZ','LUCAS'), ('GONZALEZ','AGUSTIN'), ('MUÑIZ','MATIAS'),
  ('GONZALEZ','ADRIAN AGUSTIN'), ('VARELA','LORENA SOLEDAD'), ('ALLEN','JUAN JOSE'),
  ('DIAZ','EMILIANO LUJAN'), ('CAMPELO','LEONARDO'), ('PAGANO','JUAN MAURICIO'),
  ('ALDECOA','IVAN')
)
ORDER BY tipo, apellido, nombre;

-- Ninguno de los nombres de esta tanda quedó duplicado (debe dar 0 filas).
SELECT upper(apellido) AS ap, upper(nombre) AS nom, count(*)
FROM profesionales
WHERE (upper(apellido), upper(nombre)) IN (
  ('GUZMAN','CLAUDIO'), ('GONZALEZ','LUCAS'), ('GONZALEZ','AGUSTIN'), ('MUÑIZ','MATIAS'),
  ('GONZALEZ','ADRIAN AGUSTIN'), ('VARELA','LORENA SOLEDAD'), ('ALLEN','JUAN JOSE'),
  ('DIAZ','EMILIANO LUJAN'), ('CAMPELO','LEONARDO'), ('PAGANO','JUAN MAURICIO'),
  ('ALDECOA','IVAN')
)
GROUP BY 1,2 HAVING count(*) > 1;

COMMIT;
