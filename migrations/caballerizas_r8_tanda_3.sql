-- ============================================================
-- caballerizas_r8_tanda_3.sql — R8, tanda 3
-- ============================================================
-- PROPUESTA. NO EJECUTADO — y no hay nada que ejecutar.
--
-- Las 6 caballerizas de la planilla final se cruzaron contra las 281 de
-- Dolores (285 en total). Resultado: **0 altas**. Cinco ya están con el
-- nombre exacto y la sexta ya está con la abreviatura expandida.
--
-- Este archivo queda como constancia del cruce y del único caso que
-- vuelve a Yesi (HS EL ORIGEN).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Ya existen con nombre exacto (5) — no se tocan
--
--   pedida             | en base            | patente | responsable
--   -------------------+--------------------+---------+---------------------------------
--   RD NECOCHEA        | RD NECOCHEA        | NULL    | NULL
--   MARTIN Y NICOLAS   | MARTIN Y NICOLAS   | NULL    | NULL
--   MI MARTINCITO      | MI MARTINCITO      | NULL    | NULL
--   EL DESEMPEÑO       | EL DESEMPEÑO       | DOL     | MORAGA MILLAN ADRIAN LEONARDO (propietario)
--   LA INTERPERIE      | LA INTERPERIE      | DOL     | CASINELLI FABRICIO (propietario)
--
--   Las tres de patente NULL / responsable NULL son anteriores a esta
--   tanda: el total de Dolores sigue en 281, el mismo número con el que
--   cerró la tanda 2.
--
--   ⚠ MI MARTINCITO convive con MI MARTINA (DOL, responsable AGUIRRE
--     DIEGO FELIX ALBERTO). Son dos caballerizas distintas, no un typo.
--     Igual que MARTIN Y NICOLAS convive con GRAN NICOLAS.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 2. ⚠ HS EL ORIGEN — no se inserta. Vuelve a Yesi.
--
--   En la base ya está **HARAS EL ORIGEN** (Dolores, patente NULL,
--   responsable NULL). `HS` es la abreviatura corriente de `Haras` en las
--   planillas del turf, así que casi con seguridad es la misma
--   caballeriza escrita corta.
--
--   No es un caso equivalente a DON NITO / DON NINO (tanda 2, §4.3): allá
--   la duda era si eran dos caballerizas distintas y el riesgo estaba en
--   insertar. Acá el riesgo es el mismo —insertar duplicaría— pero la
--   hipótesis contraria (que 'HS EL ORIGEN' sea un haras distinto de
--   'HARAS EL ORIGEN') es mucho más difícil de sostener.
--
--   Se aplica el criterio conservador: NO insertar. Si Yesi confirma que
--   son dos, se descomenta.
--
-- INSERT INTO caballerizas (club_id, nombre, hipodromo_patente, estado, activo)
-- SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid, 'HS EL ORIGEN', 'DOL', 'activo', true
-- WHERE NOT EXISTS (
--   SELECT 1 FROM caballerizas WHERE upper(btrim(nombre)) = 'HS EL ORIGEN'
-- );
-- ------------------------------------------------------------

-- Verificación (read-only, no hace falta transacción):
SELECT count(*) AS total FROM caballerizas;                                    -- esperado 285
SELECT count(*) AS dolores FROM caballerizas
 WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c';                       -- esperado 281
SELECT nombre, hipodromo_patente, estado, activo, responsable
FROM caballerizas
WHERE nombre IN ('RD NECOCHEA','MARTIN Y NICOLAS','MI MARTINCITO',
                 'EL DESEMPEÑO','LA INTERPERIE','HARAS EL ORIGEN')
ORDER BY nombre;                                                               -- esperado 6 filas
SELECT count(*) AS hs_el_origen FROM caballerizas
 WHERE upper(btrim(nombre)) = 'HS EL ORIGEN';                                  -- esperado 0
