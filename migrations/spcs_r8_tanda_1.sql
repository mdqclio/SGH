-- ============================================================
-- spcs_r8_tanda_1.sql — alta incremental de SPCs para R8
-- ============================================================
-- PROPUESTA. NO EJECUTADO. Requiere OK explícito de Leo.
--
-- Origen: www.studbook.org.ar, match EXACTO por nombre normalizado.
-- Evidencia: data/spcs_r8_tanda_1_scrape.json
-- Casos no resueltos: data/spcs_r8_tanda_1_reporte.md
-- Snapshot spcs usado: 144 filas.
--
-- caballeriza_id / entrenador_id / jockey_habitual_id quedan NULL:
--   los asigna Yesi al inscribir. club_id NULL: los SPCs son globales.
--   registro_stud_book queda NULL: en la base es seed legacy (SB-D001…),
--   no es el registro real del Stud Book.
--
-- Idempotente: cada INSERT se saltea si el studbook_id ya está
-- (índice único parcial spcs_studbook_id_uniq).
-- ============================================================

BEGIN;

-- SI TIN  (pedido como 'SI TIN')
--   https://www.studbook.org.ar/ejemplares/perfil/446891/si-tin
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'SI TIN', '2023-10-07'::date, 'macho'::sexo_spc, 'Alazan',
       'Il Mercato', 'Sobra Fe', 'Argentina',
       '446891', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '446891'
);

-- ELSEPTIMOESDECALDERA  (pedido como 'ELSEPTIMOESDECALDERA')
--   https://www.studbook.org.ar/ejemplares/perfil/440489/elseptimoesdecaldera
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'ELSEPTIMOESDECALDERA', '2022-10-27'::date, 'macho'::sexo_spc, 'Zaino Colorado',
       'Presagio Key', 'La Dama Alada', 'Argentina',
       '440489', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '440489'
);

-- TOUCH OF BLUE  (pedido como 'TOUCH OF BLUE')
--   https://www.studbook.org.ar/ejemplares/perfil/441094/touch-of-blue
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'TOUCH OF BLUE', '2022-10-30'::date, 'hembra'::sexo_spc, 'Zaino',
       'Heliostatic (IRE)', 'Honradeza', 'Argentina',
       '441094', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '441094'
);

-- LINDA MAIPUENSE  (pedido como 'LINDA MAIPUENSE')
--   https://www.studbook.org.ar/ejemplares/perfil/438809/linda-maipuense
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'LINDA MAIPUENSE', '2022-09-30'::date, 'hembra'::sexo_spc, 'Zaino Colorado',
       'Lucky Island', 'Mirror Plus', 'Argentina',
       '438809', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '438809'
);

-- BESO CURIOSO  (pedido como 'BESO CURIOSO')
--   https://www.studbook.org.ar/ejemplares/perfil/439623/beso-curioso
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'BESO CURIOSO', '2022-10-22'::date, 'macho'::sexo_spc, 'Zaino',
       'Curioso Johan', 'Belhart', 'Argentina',
       '439623', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '439623'
);

-- WILSON SECURITY  (pedido como 'WILSON SECURITY')
--   https://www.studbook.org.ar/ejemplares/perfil/436668/wilson-security
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'WILSON SECURITY', '2022-08-05'::date, 'macho'::sexo_spc, 'Alazan',
       'Victor Security', 'Cataluya', 'Argentina',
       '436668', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '436668'
);

-- MAC VITAL  (pedido como 'MAC VITAL')
--   https://www.studbook.org.ar/ejemplares/perfil/440906/mac-vital
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'MAC VITAL', '2022-11-23'::date, 'macho'::sexo_spc, 'Zaino',
       'Manipuler', 'Vital Spark', 'Argentina',
       '440906', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '440906'
);

-- LA GRAN TEMPESTAD  (pedido como 'LA GRAN TEMPESTAD')
--   https://www.studbook.org.ar/ejemplares/perfil/431248/la-gran-tempestad
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'LA GRAN TEMPESTAD', '2021-09-08'::date, 'hembra'::sexo_spc, 'Alazan',
       'Sea Dog', 'Me Salvo El Doctor', 'Argentina',
       '431248', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '431248'
);

-- LA LAGUNERA J  (pedido como 'LA LAGUNERA J')
--   https://www.studbook.org.ar/ejemplares/perfil/438800/la-lagunera-j
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'LA LAGUNERA J', '2022-10-10'::date, 'hembra'::sexo_spc, 'Zaino',
       'Shawerton', 'Señorita Ana J', 'Argentina',
       '438800', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '438800'
);

-- BOHEMIO TOP  (pedido como 'BOHEMIO TOP')
--   https://www.studbook.org.ar/ejemplares/perfil/433253/bohemio-top
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'BOHEMIO TOP', '2020-08-12'::date, 'macho'::sexo_spc, 'Zaino',
       'Maipo Top', 'Bohemia Mia', 'Argentina',
       '433253', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '433253'
);

-- NORMANDO LU  (pedido como 'NORMANDO LU')
--   https://www.studbook.org.ar/ejemplares/perfil/414815/normando-lu
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'NORMANDO LU', '2019-08-27'::date, 'macho'::sexo_spc, 'Tordillo',
       'Lunatico Emperor', 'Normandina', 'Argentina',
       '414815', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '414815'
);

-- AMOROUS  (pedido como 'AMOROUS')
--   https://www.studbook.org.ar/ejemplares/perfil/429711/amorous
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'AMOROUS', '2021-09-13'::date, 'hembra'::sexo_spc, 'Zaino',
       'Angiolo', 'Shadow Queen', 'Argentina',
       '429711', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '429711'
);

-- Verificación dentro de la misma transacción:
--   revisar el conteo ANTES de hacer COMMIT.
SELECT count(*) AS spcs_total FROM spcs;
SELECT nombre, fecha_nacimiento, sexo, color, padrillo_nombre,
       madre_nombre, studbook_id
FROM spcs WHERE studbook_id IN ('446891', '440489', '441094', '438809', '439623', '436668', '440906', '431248', '438800', '433253', '414815', '429711')
ORDER BY nombre;

COMMIT;
