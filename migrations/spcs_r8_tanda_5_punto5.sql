-- ============================================================
-- spcs_r8_tanda_5_punto5.sql — altas de SPCs de la planilla final (R8, tanda 5 pto 5)
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo.
--
-- Pedido de Yesi el 10/08/2026: faltantes detectados contra el xlsx final,
-- mientras está inscribiendo para R8 (16/08).
--
-- Padrón del punto 5: 7 nombres de SPC.
--   4 altas   -> CURIOSA GO ON, EL JOROBA, GRAND FITO, LA DE ETIQUETA
--   3 ya están-> DEVIL'S KING (sb 407323), NOCHE EN VELA, Wave Rimout
--                (⚠ Wave Rimout está DUPLICADO — ver el reporte, no se toca acá)
--
-- Origen: www.studbook.org.ar, endpoint
--   /ejemplares/autocomplete?tipo=1&muerto=1&term=<nombre>
-- Match EXACTO por nombre normalizado, 4/4, 0 casos ambiguos.
-- Evidencia: data/spcs_r8_tanda_5_scrape.json
-- Script:    tools/studbook_scrape_tanda.mjs
-- Snapshot spcs usado: 179 filas.
--
-- caballeriza_id / entrenador_id / jockey_habitual_id quedan NULL: los asigna
-- Yesi al inscribir. club_id NULL: los SPCs son globales.
-- registro_stud_book queda NULL: en la base es seed legacy (SB-D001…), no es
-- el registro real del Stud Book — el real va en studbook_id.
--
-- Idempotente: cada INSERT se saltea si el studbook_id ya está
-- (índice único parcial spcs_studbook_id_uniq).
--
-- Guards corridos ANTES de escribir (4/4 limpios):
--   a) pwd = /home/clio/dev/SGH                                       ✅
--   b) SELECT count(*) FROM spcs                                      -> 179 ✅
--   c) sb 434886 / 429575 / 431958 / 427052 contra spcs.studbook_id   -> 0 ocupados ✅
--   d) anti-duplicado por grafía:
--      spcs.nombre ~* 'CURIOS|JOROB|GRAND *FITO|ETIQUET|MUCURA|JUANY|LADY *GLAM'
--      -> 1 fila, BESO CURIOSO (sb 439623). Otro ejemplar: no comparte
--         sb ni madre. No bloquea. ✅
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Altas (4)
-- ------------------------------------------------------------

-- CURIOSA GO ON
--   https://www.studbook.org.ar/ejemplares/perfil/434886/curiosa-go-on
--   (2022 H SP) · tomo 1246 folio 154 · raza 4 (SPC) · bandera argentina
--   abuelo materno: The Leopard (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'CURIOSA GO ON', '2022-07-16'::date, 'hembra'::sexo_spc, 'Alazan',
       'Curioso Johan', 'Mucura Cat', 'Argentina', '434886', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '434886');

-- EL JOROBA
--   https://www.studbook.org.ar/ejemplares/perfil/429575/el-joroba
--   (2021 M SP) · tomo 1240 folio 959 · raza 4 (SPC) · bandera argentina
--   abuelo materno: Manipulator (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'EL JOROBA', '2021-08-27'::date, 'macho'::sexo_spc, 'Zaino',
       'In The Dark', 'Juany', 'Argentina', '429575', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '429575');

-- GRAND FITO
--   https://www.studbook.org.ar/ejemplares/perfil/431958/grand-fito
--   (2021 M SP) · tomo 1243 folio 287 · raza 4 (SPC) · bandera argentina
--   abuelo materno: Huido
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'GRAND FITO', '2021-10-06'::date, 'macho'::sexo_spc, 'Zaino',
       'Telematico', 'Lady Glamour', 'Argentina', '431958', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '431958');

-- LA DE ETIQUETA
--   https://www.studbook.org.ar/ejemplares/perfil/427052/la-de-etiqueta
--   (2021 H SP) · tomo 1238 folio 474 · raza 4 (SPC) · bandera argentina
--   abuelo materno: Sunray Spirit (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'LA DE ETIQUETA', '2021-07-16'::date, 'hembra'::sexo_spc, 'Zaino',
       'Aspire (USA)', 'Etiquetag', 'Argentina', '427052', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '427052');

-- ------------------------------------------------------------
-- 2. Verificación ANTES del COMMIT
-- ------------------------------------------------------------

-- Debe dar 183 (179 + 4).
SELECT count(*) AS spcs_total FROM spcs;

-- Deben dar 4 filas, con los datos del SB y los FK de asignación en NULL.
SELECT nombre, fecha_nacimiento, sexo, color, padrillo_nombre, madre_nombre,
       pais_origen, studbook_id, estado,
       club_id, caballeriza_id, entrenador_id, jockey_habitual_id, registro_stud_book
FROM spcs WHERE studbook_id IN ('434886','429575','431958','427052')
ORDER BY nombre;

-- Debe dar 0 filas.
SELECT studbook_id, count(*) FROM spcs WHERE studbook_id IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DELETE FROM spcs WHERE studbook_id IN ('434886','429575','431958','427052');
-- (Seguro sólo mientras no tengan inscripciones — si Yesi ya inscribió,
--  primero hay que borrar resultado_posiciones y luego inscripciones.
--  Ver GOTCHA #12.)
