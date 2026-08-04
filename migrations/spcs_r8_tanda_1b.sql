-- ============================================================
-- spcs_r8_tanda_1b.sql — alta incremental de SPCs para R8
-- ============================================================
-- PROPUESTA. NO EJECUTADO. Requiere OK explícito de Leo.
--
-- Origen: www.studbook.org.ar, match EXACTO por nombre normalizado.
-- Evidencia: data/spcs_r8_tanda_1b_scrape.json
-- Casos no resueltos: data/spcs_r8_tanda_1b_reporte.md
-- Snapshot spcs usado: 156 filas.
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

-- LOGUACIOUS  (pedido como 'LOGUACIOUS')
--   https://www.studbook.org.ar/ejemplares/perfil/431567/loguacious
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'LOGUACIOUS', '2021-10-23'::date, 'hembra'::sexo_spc, 'Zaino',
       'Le Blues', 'Effervesence', 'Argentina',
       '431567', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '431567'
);

-- SOY RICARDO  (pedido como 'SOY RICARDO')
--   https://www.studbook.org.ar/ejemplares/perfil/434608/soy-ricardo
--   ALERTA: homónimo desambiguado por Yesi (sb=434608)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'SOY RICARDO', '2022-08-01'::date, 'macho'::sexo_spc, 'Alazan',
       'El Moises', 'Western Dream', 'Argentina',
       '434608', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '434608'
);

-- Verificación dentro de la misma transacción:
--   revisar el conteo ANTES de hacer COMMIT.
SELECT count(*) AS spcs_total FROM spcs;
SELECT nombre, fecha_nacimiento, sexo, color, padrillo_nombre,
       madre_nombre, studbook_id
FROM spcs WHERE studbook_id IN ('431567', '434608')
ORDER BY nombre;

COMMIT;
