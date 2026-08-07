-- ============================================================
-- spcs_r8_tanda_4.sql — alta incremental de SPCs para R8 (tanda 4, llenado final)
-- ============================================================
-- ✅ APLICADO el 07/08/2026 en DOS migraciones:
--    `spcs_r8_tanda_4`          10 altas de planilla. spcs 167 -> 177.
--    `spcs_r8_tanda_4_acapulco`  1 alta fuera de planilla. spcs 177 -> 178.
--    Total 11 altas. Verificado: 10 filas con los sb_id de la tanda + 1 con
--    sb 434487, 0 studbook_id duplicados, 0 filas con club_id no nulo, 0 filas
--    con los sb de los homónimos viejos de ACAPULCO (85188, 378421).
--    data/spcs_snapshot.json actualizado a 178.
--
-- Origen: www.studbook.org.ar, endpoint
--   /ejemplares/autocomplete?tipo=1&muerto=1&term=<nombre>
-- Match EXACTO por nombre normalizado (upper + sin acentos + sin no-alfanuméricos).
-- Evidencia: data/spcs_r8_tanda_4_scrape.json
-- Script del scrape: tools/studbook_scrape_tanda.mjs
-- Snapshot spcs usado: 167 filas.
--
-- Padrón de la tanda: 24 nombres.
--   14 ya están en la base (no se tocan, ver §2).
--   10 son alta (abajo). 0 casos no resueltos, 0 alertas del scrape.
--
-- caballeriza_id / entrenador_id / jockey_habitual_id quedan NULL:
--   los asigna Yesi al inscribir. club_id NULL: los SPCs son globales.
--   registro_stud_book queda NULL: en la base es seed legacy (SB-D001…),
--   no es el registro real del Stud Book — el real va en studbook_id.
--
-- Idempotente: cada INSERT se saltea si el studbook_id ya está
-- (índice único parcial spcs_studbook_id_uniq).
--
-- Guards corridos ANTES de escribir (los dos dieron limpio):
--   a) los 10 sb_id contra spcs.studbook_id  -> 0 ocupados.
--   b) anti-duplicado por grafía (lección ESPLENDID CRAF de la tanda 3):
--      regex acento-insensible sobre spcs.nombre con los radicales
--      ABELIT|BELLOS|GAUCH|INFILTRAD|BATEAU|LIVIA|NELIDA|REINA|TERRIBL|
--      YOOK|DRUSA|SLEW|EDITION|MIMOSO|PRECIOS -> 4 filas, las 4 son
--      ejemplares distintos (Gaucha Linda, Gaucho Bravo, QUIET GAUCHO,
--      REINA ATREVIDA), ninguna es la misma mancha con otra grafía.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Altas (10)
-- ------------------------------------------------------------

-- ABELITO MIMOSO
--   https://www.studbook.org.ar/ejemplares/perfil/439663/abelito-mimoso
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'ABELITO MIMOSO', '2022-11-10'::date, 'macho'::sexo_spc, 'Zaino',
       'Magic Stripes', 'Fairy Mosa', 'Argentina', '439663', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '439663');

-- DE BELLOSO
--   https://www.studbook.org.ar/ejemplares/perfil/432979/de-belloso
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'DE BELLOSO', '2021-09-01'::date, 'hembra'::sexo_spc, 'Zaino Doradillo',
       'Defuniak', 'Mad Conda', 'Argentina', '432979', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '432979');

-- GAUCHA PRECIOSA
--   https://www.studbook.org.ar/ejemplares/perfil/435676/gaucha-preciosa
--   ⚠ media hermana materna de CHINITA SALTEÑA (ya en la base): misma madre
--     'Hola Nena', distinto padre. Son dos ejemplares, no un duplicado.
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'GAUCHA PRECIOSA', '2022-09-01'::date, 'hembra'::sexo_spc, 'Alazan',
       'Sea Dog', 'Hola Nena', 'Argentina', '435676', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '435676');

-- INFILTRADO SLEW
--   https://www.studbook.org.ar/ejemplares/perfil/420517/infiltrado-slew
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'INFILTRADO SLEW', '2020-07-27'::date, 'macho'::sexo_spc, 'Zaino',
       'Magic Stripes', 'Compadrona Slew', 'Argentina', '420517', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '420517');

-- LE BATEAU
--   https://www.studbook.org.ar/ejemplares/perfil/422126/le-bateau
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'LE BATEAU', '2020-10-20'::date, 'macho'::sexo_spc, 'Zaino',
       'Interaction', 'Le Yaca (CHI)', 'Argentina', '422126', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '422126');

-- LIVIA DRUSA
--   https://www.studbook.org.ar/ejemplares/perfil/426999/livia-drusa
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'LIVIA DRUSA', '2020-09-16'::date, 'hembra'::sexo_spc, 'Zaino',
       'Santillano', 'Wilkenia', 'Argentina', '426999', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '426999');

-- NELIDA RIM
--   https://www.studbook.org.ar/ejemplares/perfil/439480/nelida-rim
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'NELIDA RIM', '2022-11-02'::date, 'hembra'::sexo_spc, 'Zaino',
       'Remote (GB)', 'Vedette''s Day', 'Argentina', '439480', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '439480');

-- REINA EDITION
--   https://www.studbook.org.ar/ejemplares/perfil/432407/reina-edition
--   ⚠ convive con REINA ATREVIDA (sb 418581, ya en la base). Distinto padre,
--     distinta madre, distinto año. No es la misma.
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'REINA EDITION', '2021-10-24'::date, 'hembra'::sexo_spc, 'Alazan',
       'Equal Edition', 'Reina Gloriosa', 'Argentina', '432407', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '432407');

-- TERRIBLE KING
--   https://www.studbook.org.ar/ejemplares/perfil/414959/terrible-king
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'TERRIBLE KING', '2019-08-23'::date, 'macho'::sexo_spc, 'Tordillo',
       'Charles King', 'Bien Terrible', 'Argentina', '414959', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '414959');

-- YOOKY
--   https://www.studbook.org.ar/ejemplares/perfil/431580/yooky
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'YOOKY', '2020-08-15'::date, 'hembra'::sexo_spc, 'Tordillo',
       'Cima De Triomphe (IRE)', 'Solicitada', 'Argentina', '431580', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '431580');

-- ------------------------------------------------------------
-- 2. Ya existen — 0 altas, no se tocan (14)
--
--   TIRSO              e08e7cd3-…  2023-10-06 macho   Peten Itza / La Calcomania
--   ASTUTO NOTES       045409b7-…  2022-10-13 macho   Footnotes (USA) / Astata Ride
--   DOCTOR SKY         e5b66d8e-…  2022-10-25 macho   Doctor Embrujo / Matrera Sky
--   VISION SECURITY    2916cc0f-…  2022-10-08 macho   Victor Security / Ibaraki
--   PORTEÑO Y BAILARIN de84352b-…  2021-08-03 macho   Hurricane Cat (USA) / Triumvirale
--   FALAYS             fb319df9-…  2021-10-26 macho   Fyrulays / Pasion Fatal
--   LA DIVERTENTE      cc1d70a1-…  2020-07-27 hembra  Endorsement (USA) / La Funny
--   LUMIN              19c4b222-…  2021-11-07 macho   Mask (USA) / Cora Lu
--   CHINITA SALTEÑA    f3b5ea21-…  2021-08-01 hembra  Golden Cigars / Hola Nena
--   ICY TOM            8a6aea98-…  2018-09-02 macho   Icy Glory / Normandina
--   GINIYA GOOD        e6aae323-…  2019-09-29 macho   Sounds Good (BRZ) / Nena Titi
--   BELLO PRESAGIO     66ee9d0e-…  2021-09-10 macho   Presagio Key / Bella Duquesa  · sb 428861
--   REY DE PILA        5f94e992-…  2021-10-14 macho   Manipuler / Naftalina
--   HEART OF GOLD      8e72a714-…  2021-11-24 macho   Pure Miron / Shy Salediza
--
--   ⚠ ICY TOM está en la base con grafía 'Icy Tom' (mixed case), igual que
--     'Gaucha Linda', 'Gaucho Bravo', 'De Moda', 'Es Mistres' — es seed
--     legacy anterior a las tandas de R8, no un typo de esta planilla.
--     No se normaliza acá: la UI no distingue mayúsculas y tocar el nombre
--     no aporta nada al cierre. Queda como deuda cosmética.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3. ✅ ACAPULCO — agregado fuera de planilla (Silvio, 07/08). APLICADO.
--
--    ✅ APLICADO el 07/08/2026 por MCP apply_migration, migración
--       `spcs_r8_tanda_4_acapulco`. spcs 177 -> 178.
--       Leo autorizó el sb 434487 sin esperar a Yesi: la desambiguación es
--       estructural, no una preferencia. Mismo criterio que SOY RICARDO en
--       la tanda 1/1b (sb 434608 de 2022 vs sb 35625 de 1976).
--       Precondiciones verificadas antes: spcs 177, sb 434487 libre (0 filas),
--       0 filas con radical ACAPULC, 0 filas con los sb de los otros dos
--       homónimos. Post: 1 fila 'ACAPULCO' id 6350d628-9949-4e79-a321-0ca116f8f4ee,
--       club_id/caballeriza_id/entrenador_id/jockey_habitual_id/registro_stud_book
--       todos NULL, 0 studbook_id duplicados.
--
--    Antes de aplicar, en spcs: 0 filas con radical ACAPULC → no existía.
--    En el Stud Book: el autocomplete devuelve TRES ejemplares con el
--    nombre exacto 'ACAPULCO' (más ACAPULCO CREST / GOLD / MOON / VUELA,
--    que son otros nombres y no compiten):
--
--      sb 434487 · nac 22/07/2022 · Macho · Zaino · Angiolo / Intermar
--                 · tomo 1245 folio 761 · adn+pasaporte+microchip, revisado
--      sb 85188  · nac 22/08/1983 · Macho · Zaino · Salt Marsh (USA) / Antiope
--                 · tomo 663 folio 113 · sin adn, sin pasaporte
--      sb 378421 · nac 01/01/1961 · Macho · 'No Consigna' · padre y madre
--                 'Sin Asignar' · tomo 7012 folio 387
--
--    ELEGIDO: sb 434487. Es el único que puede correr R8 — los otros dos
--    nacieron en 1983 y 1961, o sea que en 2026 tendrían 43 y 65 años.
--    Además es el único con adn/pasaporte/microchip y marca 'revisado',
--    que es lo que tienen los ejemplares en actividad; los de 1961/1983
--    son fichas históricas (el de 1961 ni siquiera tiene padre y madre
--    asignados, y su tomo 7012 es de los bloques de carga retroactiva).
--
--    La primera pasada lo dejó comentado y lo mandó a Yesi por la regla de
--    homónimos de la tanda. Leo lo destrabó el mismo día: la evidencia es
--    ESTRUCTURAL, no una preferencia — un caballo de 1961 no corre en 2026,
--    así que no hay nada que Yesi pueda aportar que cambie la elección.
--    Mismo criterio que SOY RICARDO (tanda 1/1b): ahí también el homónimo
--    viejo (sb 35625, 1976) quedaba descartado solo, y la confirmación de
--    Yesi terminó coincidiendo con el candidato que el reporte ya señalaba.
--
--    El INSERT que se aplicó es exactamente éste:
--
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'ACAPULCO', '2022-07-22'::date, 'macho'::sexo_spc, 'Zaino',
       'Angiolo', 'Intermar', 'Argentina', '434487', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '434487');
--
--    La caballeriza que Silvio pasó junto con ACAPULCO —EL DOMADOR— ya
--    está en la base y no requiere alta: ver §3 de caballerizas_r8_tanda_4.sql.
-- ------------------------------------------------------------

-- Verificación dentro de la misma transacción:
--   revisar los conteos ANTES de hacer COMMIT.
SELECT count(*) AS spcs_total FROM spcs;                                  -- esperado 177
SELECT count(*) AS altas_tanda_4 FROM spcs WHERE studbook_id IN
  ('439663','432979','435676','420517','422126','426999','439480','432407','414959','431580');
                                                                          -- esperado 10
SELECT studbook_id, count(*) FROM spcs WHERE studbook_id IS NOT NULL
 GROUP BY 1 HAVING count(*) > 1;                                          -- esperado 0 filas
SELECT count(*) AS con_club FROM spcs WHERE club_id IS NOT NULL;          -- esperado 0

COMMIT;
