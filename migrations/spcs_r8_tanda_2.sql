-- ============================================================
-- spcs_r8_tanda_2.sql — alta incremental de SPCs para R8
-- ============================================================
-- PROPUESTA. NO EJECUTADO. Requiere OK explícito de Leo.
--
-- Origen: www.studbook.org.ar, match EXACTO por nombre normalizado.
-- Evidencia: data/spcs_r8_tanda_2_scrape.json
-- Casos no resueltos: data/spcs_r8_tanda_2_reporte.md
-- Snapshot spcs usado: 158 filas.
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

-- RECUERDAME IN YOU  (pedido como 'RECUERDAME IN YOU')
--   https://www.studbook.org.ar/ejemplares/perfil/423281/recuerdame-in-you
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'RECUERDAME IN YOU', '2020-10-05'::date, 'hembra'::sexo_spc, 'Zaino',
       'Star In You', 'Olvidame', 'Argentina',
       '423281', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '423281'
);

-- REINA ATREVIDA  (pedido como 'REINA ATREVIDA')
--   https://www.studbook.org.ar/ejemplares/perfil/418581/reina-atrevida
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'REINA ATREVIDA', '2019-10-12'::date, 'hembra'::sexo_spc, 'Alazan',
       'Detonator', 'Atrevida Sola', 'Argentina',
       '418581', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '418581'
);

-- TIENE RITMO  (pedido como 'TIENE RITMO')
--   https://www.studbook.org.ar/ejemplares/perfil/427217/tiene-ritmo
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'TIENE RITMO', '2021-08-04'::date, 'macho'::sexo_spc, 'Alazan',
       'Touareg', 'Muy Alegre', 'Argentina',
       '427217', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '427217'
);

-- EL GRAN HECTOR  (pedido como 'EL GRAN HECTOR')
--   https://www.studbook.org.ar/ejemplares/perfil/430047/el-gran-hector
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'EL GRAN HECTOR', '2021-08-25'::date, 'macho'::sexo_spc, 'Zaino',
       'Grand Reward (USA)', 'Beauty Shiner', 'Argentina',
       '430047', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '430047'
);

-- IDALIA MARO  (pedido como 'IDALIA MARO')
--   https://www.studbook.org.ar/ejemplares/perfil/431374/idalia-maro
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'IDALIA MARO', '2021-10-15'::date, 'hembra'::sexo_spc, 'Zaino',
       'Engelhard', 'Itzel Chica', 'Argentina',
       '431374', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '431374'
);

-- Verificación dentro de la misma transacción:
--   revisar el conteo ANTES de hacer COMMIT.
SELECT count(*) AS spcs_total FROM spcs;
SELECT nombre, fecha_nacimiento, sexo, color, padrillo_nombre,
       madre_nombre, studbook_id
FROM spcs WHERE studbook_id IN ('423281', '418581', '427217', '430047', '431374')
ORDER BY nombre;

COMMIT;
