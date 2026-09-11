-- ============================================================
-- spcs_r9_tanda_2.sql — altas de SPCs de R9, tanda 2 (los dos typos de la planilla)
-- ============================================================
-- ✅ EJECUTADA el 11/09/2026 por MCP apply_migration (nombre: spcs_r9_tanda_2), con OK de Leo.
--    2 INSERTs + DO que aborta si count <> 201, sb repetido o alguna no hembra. Pre-chequeos 199/0/0/0.
--    Resultado: spcs 199 -> 201. Probe: tests/probe_spcs_r9_tanda_1.mjs (extendido, assert I).
--
-- Yesi confirmó el 11/09 que la planilla tenía dos errores de tipeo:
--   BELLA DOÑA  -> QUE BELLA DOÑA  (T1, 3 años perdedores)
--   INDIA MARO  -> INDIANA MARO    (T10, yeguas 5 años y +)
-- Con los nombres corregidos el Stud Book devuelve match EXACTO y ÚNICO para
-- los dos (0 homónimos), y edad y sexo cierran con el turno:
--   QUE BELLA DOÑA  2023-10-08 hembra -> 3 años  ✔ T1
--   INDIANA MARO    2021-09-15 hembra -> 5 años  ✔ T10 (yeguas, min 5)
-- El "BELLA DOÑA" macho de 2017 (sb 403664) que apareció en la tanda 1 era
-- otro caballo. Descartado.
--
-- Origen: www.studbook.org.ar, /ejemplares/autocomplete?tipo=1&muerto=1&term=
-- Evidencia: data/spcs_r9_tanda_2_scrape.json · Script: tools/studbook_scrape_tanda.mjs
-- Snapshot spcs usado: 199 filas.
--
-- Mismo criterio que la tanda 1 (migrations/spcs_r9_tanda_1.sql):
--   registro_stud_book NULL · studbook_id en columna · notas = 'SB <id> · <url>
--   · alta R9 tanda 2 11/09/2026 · Planilla R9: <variante>' · club_id NULL ·
--   caballeriza/entrenador/jockey NULL (los asigna Yesi al inscribir).
-- Idempotente: cada INSERT se saltea si el studbook_id ya está.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Chequeo de duplicados ANTES de insertar (corrido el 11/09 contra las 199: 199 / 0 / 0 / 0)
-- ------------------------------------------------------------

-- 0.a  Baseline: tiene que dar 199.
SELECT count(*) AS spcs_total_antes FROM spcs;

-- 0.b  Por studbook_id: 0 filas.
SELECT nombre, studbook_id FROM spcs WHERE studbook_id IN ('446458', '432433');

-- 0.c  Por nombre normalizado: 0 filas.
SELECT nombre, studbook_id, fecha_nacimiento FROM spcs
WHERE upper(regexp_replace(translate(nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^A-Za-z0-9]', '', 'g'))
   IN ('QUEBELLADONA', 'INDIANAMARO');

-- 0.d  Por fecha + padre + madre: 0 filas.
SELECT s.nombre, s.studbook_id, s.fecha_nacimiento, s.padrillo_nombre, s.madre_nombre
FROM spcs s
JOIN (VALUES
  ('2023-10-08'::date, 'Sea Dog', 'Paradise Nistel'),
  ('2021-09-15'::date, 'Gokstad', 'Ilusionada Chica')
) v(fn, padre, madre)
  ON s.fecha_nacimiento = v.fn
 AND upper(s.padrillo_nombre) = upper(v.padre)
 AND upper(s.madre_nombre)    = upper(v.madre);

-- 0.e  Parecidos por substring (BELLA / MARO / INDIA): la única fila es IDALIA MARO
--      (2021-10-15, Engelhard × Itzel Chica) — otra yegua del mismo criador, no es ésta.

BEGIN;

-- ------------------------------------------------------------
-- 1. Altas (2)
-- ------------------------------------------------------------

-- QUE BELLA DOÑA  [T1]  (planilla: BELLA DOÑA)
--   https://www.studbook.org.ar/ejemplares/perfil/446458/que-bella-dona
--   (2023 H SP) · tomo 1257 folio 587 · abuelo materno: Van Nistelrooy (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'QUE BELLA DOÑA', '2023-10-08'::date, 'hembra'::sexo_spc, 'Zaino',
       'Sea Dog', 'Paradise Nistel', 'Argentina', '446458', 'activo'::estado_spc,
       'SB 446458 · https://www.studbook.org.ar/ejemplares/perfil/446458/que-bella-dona · alta R9 tanda 2 11/09/2026 · Planilla R9: BELLA DOÑA.'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '446458');

-- INDIANA MARO  [T10]  (planilla: INDIA MARO)
--   https://www.studbook.org.ar/ejemplares/perfil/432433/indiana-maro
--   (2021 H SP) · tomo 1243 folio 758 · abuelo materno: Iberique
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'INDIANA MARO', '2021-09-15'::date, 'hembra'::sexo_spc, 'Alazan',
       'Gokstad', 'Ilusionada Chica', 'Argentina', '432433', 'activo'::estado_spc,
       'SB 432433 · https://www.studbook.org.ar/ejemplares/perfil/432433/indiana-maro · alta R9 tanda 2 11/09/2026 · Planilla R9: INDIA MARO.'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '432433');

-- ------------------------------------------------------------
-- 2. Verificación ANTES del COMMIT
-- ------------------------------------------------------------

-- Debe dar 201 (199 + 2).
SELECT count(*) AS spcs_total FROM spcs;

-- 2 filas, las dos hembra, registro_stud_book y FKs en NULL.
SELECT nombre, fecha_nacimiento, sexo, color, padrillo_nombre, madre_nombre,
       pais_origen, studbook_id, estado, registro_stud_book,
       club_id, caballeriza_id, entrenador_id, jockey_habitual_id, notas
FROM spcs WHERE studbook_id IN ('446458', '432433') ORDER BY nombre;

-- 0 filas.
SELECT studbook_id, count(*) FROM spcs WHERE studbook_id IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DELETE FROM spcs WHERE studbook_id IN ('446458', '432433');
-- (Seguro sólo mientras no tengan inscripciones. GOTCHA #12.)
-- Después: SELECT count(*) FROM spcs -> 199.
