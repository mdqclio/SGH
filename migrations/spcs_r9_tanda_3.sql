-- ============================================================
-- spcs_r9_tanda_3.sql — BIEN COQUETA (T11) y EL MAS SABIO (T6): los dos que quedaban de la planilla de R9
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo.
--
-- Eran los 2 "edad no cierra" del informe del scrape (11/09): la planilla los tenía en T2 (4 años) y T5
-- (3-4 años) y los dos son de 2021 (5 años). Yesi definió los turnos correctos:
--   BIEN COQUETA  -> T11 (Todo caballo 5 años y + edad perdedor; columnas 5-∞, ambos)   5 años ✔
--   EL MAS SABIO  -> T6  (Todo caballo de 5 años ganador de 1 o 2; columnas 5-5, ambos)  5 años ✔
-- Stud Book (sondeo 11/09, data/spcs_r9_tanda_3_probe.json):
--   BIEN COQUETA  sb 429819, 15/10/2021, Hembra, Zaino Colorado, Bien Terminado × Gritty, ab.mat. Luhuk (USA), tomo 1241 folio 202.
--                 Homónima sb 216248 (1998) descartada por edad.
--   EL MAS SABIO  sb 431662, 26/10/2021, Macho, Alazan, Il Campione (CHI) × Indigirka, ab.mat. Interprete, tomo 1242 folio 998. Único.
-- Duplicados contra las 201: por studbook_id 0, por nombre normalizado 0, por fecha+padre+madre 0.
-- Mismo criterio que tandas 1 y 2: registro_stud_book NULL, studbook_id en columna, notas con SB + url + tanda.
-- Idempotente por studbook_id. Esperado: spcs 201 -> 203.
-- ============================================================

-- 0. Pre-chequeos: 201 / 0 / 0 / 0
SELECT count(*) AS spcs_total_antes FROM spcs;
SELECT nombre, studbook_id FROM spcs WHERE studbook_id IN ('429819', '431662');
SELECT nombre FROM spcs WHERE upper(regexp_replace(translate(nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^A-Za-z0-9]','','g')) IN ('BIENCOQUETA','ELMASSABIO');
SELECT s.nombre FROM spcs s JOIN (VALUES ('2021-10-15'::date,'Bien Terminado','Gritty'),('2021-10-26'::date,'Il Campione (CHI)','Indigirka')) v(fn,padre,madre)
  ON s.fecha_nacimiento = v.fn AND upper(s.padrillo_nombre) = upper(v.padre) AND upper(s.madre_nombre) = upper(v.madre);

BEGIN;

-- BIEN COQUETA  [T11]
--   https://www.studbook.org.ar/ejemplares/perfil/429819/bien-coqueta
--   (2021 H SP) · tomo 1241 folio 202 · abuelo materno: Luhuk (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'BIEN COQUETA', '2021-10-15'::date, 'hembra'::sexo_spc, 'Zaino Colorado',
       'Bien Terminado', 'Gritty', 'Argentina', '429819', 'activo'::estado_spc,
       'SB 429819 · https://www.studbook.org.ar/ejemplares/perfil/429819/bien-coqueta · alta R9 tanda 3 11/09/2026 · Homónima sb 216248 (1998) descartada por edad. Planilla R9 la tenía en T2; Yesi la pasó a T11.'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '429819');

-- EL MAS SABIO  [T6]
--   https://www.studbook.org.ar/ejemplares/perfil/431662/el-mas-sabio
--   (2021 M SP) · tomo 1242 folio 998 · abuelo materno: Interprete
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'EL MAS SABIO', '2021-10-26'::date, 'macho'::sexo_spc, 'Alazan',
       'Il Campione (CHI)', 'Indigirka', 'Argentina', '431662', 'activo'::estado_spc,
       'SB 431662 · https://www.studbook.org.ar/ejemplares/perfil/431662/el-mas-sabio · alta R9 tanda 3 11/09/2026 · Planilla R9 lo tenía en T5; Yesi lo pasó a T6.'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '431662');

-- Verificación antes del COMMIT: 203; 2 filas; 0 studbook_id repetidos.
SELECT count(*) AS spcs_total FROM spcs;
SELECT nombre, fecha_nacimiento, sexo, color, padrillo_nombre, madre_nombre, studbook_id, registro_stud_book, notas
FROM spcs WHERE studbook_id IN ('429819', '431662') ORDER BY nombre;
SELECT studbook_id, count(*) FROM spcs WHERE studbook_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;

COMMIT;

-- ROLLBACK: DELETE FROM spcs WHERE studbook_id IN ('429819','431662');  (sólo sin inscripciones — GOTCHA #12) → 201
