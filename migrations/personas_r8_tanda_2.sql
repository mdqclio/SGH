-- ============================================================
-- personas_r8_tanda_2.sql — alta de jockeys/cuidadores faltantes (R8, tandas 1 + 2)
-- ============================================================
-- PROPUESTA. NO EJECUTADO. Requiere OK explícito de Leo (gate 3 de 3).
--
-- Cambio de regla autorizado por Leo el 05/08: esta tanda SÍ crea
-- personas, con nombre completo y documento_nro NULL donde no haya DNI.
-- El DNI llega después por auto-registro (Gate 3 ya vivo). El cierre de
-- inscripciones es el viernes 07/08 y no se puede esperar al documento.
--
-- Cruce hecho contra las 167 filas de profesionales el 05/08. Para cada
-- una de las 8 altas se verificó: 0 filas con el mismo apellido, 0 filas
-- con el apellido cargado en el campo nombre, 0 filas con el nombre
-- cargado en el campo apellido.
--
-- Convención copiada de profesionales.html / jockeys.html:
--   estado 'activo', activo true, hipodromo_patente NULL (el form lo
--   deja vacío en un alta nueva), documento_tipo/documento_nro NULL.
--   club_id = Dolores: los dos forms NO mandan club_id en el insert
--   (ver ISSUE nuevo en el reporte), pero las 167 filas de la base lo
--   tienen cargado, así que acá se respeta el dato de la base.
--
-- ⚠ profesionales NO tiene unique en (apellido, nombre) — sólo PK en id.
--   La idempotencia la da el WHERE NOT EXISTS, no la base.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Jockeys faltantes (3) — pendientes desde la tanda 1
-- ------------------------------------------------------------
INSERT INTO profesionales (club_id, tipo, apellido, nombre, estado, activo)
SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid, 'jockey'::tipo_profesional,
       v.apellido, v.nombre, 'activo', true
FROM (VALUES
  ('GUZMAN',   'CLAUDIO'),
  ('GONZALEZ', 'LUCAS'),
  ('GONZALEZ', 'AGUSTIN')
) AS v(apellido, nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM profesionales p
  WHERE upper(btrim(p.apellido)) = upper(btrim(v.apellido))
    AND upper(btrim(p.nombre))   = upper(btrim(v.nombre))
);

-- ------------------------------------------------------------
-- 2. Cuidadores faltantes (5) — pendientes desde la tanda 1
--    'cuidador' en la planilla = tipo 'entrenador' en profesionales.
-- ------------------------------------------------------------
INSERT INTO profesionales (club_id, tipo, apellido, nombre, estado, activo)
SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid, 'entrenador'::tipo_profesional,
       v.apellido, v.nombre, 'activo', true
FROM (VALUES
  ('GONZALEZ', 'ADRIAN AGUSTIN'),
  ('VARELA',   'LORENA'),
  ('ALLEN',    'JUAN JOSE'),
  ('DIAZ',     'EMILIANO'),   -- en base hay DIAZ AMERICO RAMON y DIAZ CARLOS RODOLFO, ningún Emiliano
  ('CAMPELO',  'LEONARDO')
) AS v(apellido, nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM profesionales p
  WHERE upper(btrim(p.apellido)) = upper(btrim(v.apellido))
    AND upper(btrim(p.nombre))   = upper(btrim(v.nombre))
);

-- ------------------------------------------------------------
-- 3. ALDECOA IVAN — NO es alta, es cambio de tipo
--    En la planilla de la tanda 2 figura como jockey Y como cuidador.
--    En la base ya está como 'entrenador' (DNI 39491188, patente DOL).
--    El enum tipo_profesional tiene el valor 'ambos' justo para esto.
--    No se toca ningún otro campo — el DNI que ya tiene queda igual.
-- ------------------------------------------------------------
UPDATE profesionales
SET tipo = 'ambos'::tipo_profesional, updated_at = now()
WHERE upper(btrim(apellido)) = 'ALDECOA'
  AND upper(btrim(nombre))   = 'IVAN'
  AND tipo = 'entrenador'::tipo_profesional;

-- Verificación dentro de la misma transacción:
--   revisar ANTES de hacer COMMIT.
SELECT count(*) AS profesionales_total FROM profesionales;

SELECT tipo::text, apellido, nombre, coalesce(documento_nro,'(sin DNI)') AS doc,
       coalesce(hipodromo_patente,'(sin patente)') AS pat, estado, activo
FROM profesionales
WHERE (upper(apellido), upper(nombre)) IN (
  ('GUZMAN','CLAUDIO'), ('GONZALEZ','LUCAS'), ('GONZALEZ','AGUSTIN'),
  ('GONZALEZ','ADRIAN AGUSTIN'), ('VARELA','LORENA'), ('ALLEN','JUAN JOSE'),
  ('DIAZ','EMILIANO'), ('CAMPELO','LEONARDO'), ('ALDECOA','IVAN')
)
ORDER BY tipo, apellido, nombre;

-- Ninguno de los nombres de esta tanda quedó duplicado (debe dar 0 filas).
SELECT upper(apellido) AS ap, upper(nombre) AS nom, count(*)
FROM profesionales
WHERE (upper(apellido), upper(nombre)) IN (
  ('GUZMAN','CLAUDIO'), ('GONZALEZ','LUCAS'), ('GONZALEZ','AGUSTIN'),
  ('GONZALEZ','ADRIAN AGUSTIN'), ('VARELA','LORENA'), ('ALLEN','JUAN JOSE'),
  ('DIAZ','EMILIANO'), ('CAMPELO','LEONARDO'), ('ALDECOA','IVAN')
)
GROUP BY 1,2 HAVING count(*) > 1;

COMMIT;
