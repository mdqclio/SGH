-- ============================================================
-- spcs_conesera_sexo.sql — corrección de sexo + studbook_id de Conesera
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo (y confirmación de Yesi).
--
-- Fila: spcs 1f645327-a6da-449b-8a62-fdb577a8658e — 'Conesera', cargada a
-- mano el 09/05/2026 (sin studbook_id, sin color). Corrió R6, inscripta en
-- R9 T1 (3 años perdedores, ambos sexos).
--
-- Stud Book sb 444373, CONESERA, (2023 H SP), nac. 20/09/2023, Alazan,
-- Emmanuel × Milonga Burrera, abuelo materno Manipulator (USA),
-- tomo 1255 folio 510, raza 4, bandera argentina.
--   https://www.studbook.org.ar/ejemplares/perfil/444373/conesera
--
-- Por qué es el mismo animal: fecha de nacimiento EXACTA (20/09/2023) +
-- mismo padre + misma madre. Una yegua pare una cría por año; dos animales
-- distintos con la misma madre y la misma fecha no existen. El homónimo
-- (sb 183273, 1993) no es candidato. Lo único que difiere es el sexo:
-- DB 'macho', Stud Book 'Hembra'. Con ADN, pasaporte y revisión del SB en 1,
-- el dato bueno es el del Stud Book: sexo mal cargado a mano.
--
-- Efecto práctico: T1 tiene "Descargo 2 kilos a las hembras". Hoy el
-- programa/peso la trataría como macho.
--
-- Va SEPARADO de spcs_r9_tanda_1.sql: es UPDATE, no alta. No cambia el
-- count de spcs (181 antes, 181 después; o 199 si corre después de la tanda).
-- ============================================================

-- 0. Antes: tiene que dar exactamente esta fila (sexo=macho, studbook_id NULL).
SELECT id, nombre, fecha_nacimiento, sexo, color, padrillo_nombre, madre_nombre,
       studbook_id, registro_stud_book, notas
FROM spcs WHERE id = '1f645327-a6da-449b-8a62-fdb577a8658e';

-- 0.b sb 444373 libre: 0 filas.
SELECT id, nombre FROM spcs WHERE studbook_id = '444373';

BEGIN;

UPDATE spcs
SET sexo        = 'hembra'::sexo_spc,
    nombre      = 'CONESERA',
    color       = COALESCE(color, 'Alazan'),
    studbook_id = '444373',
    notas       = concat_ws(' · ', NULLIF(notas, ''),
                    'SB 444373 · https://www.studbook.org.ar/ejemplares/perfil/444373/conesera',
                    'sexo corregido macho->hembra segun Stud Book 11/09/2026 (planilla R9: CONESERSA)')
WHERE id = '1f645327-a6da-449b-8a62-fdb577a8658e'
  AND sexo = 'macho'
  AND fecha_nacimiento = '2023-09-20'
  AND studbook_id IS NULL;

-- 1 fila afectada. Si 0, algo cambió desde el relevamiento: ROLLBACK.

-- Verificación antes del COMMIT: sexo=hembra, studbook_id=444373, nombre=CONESERA.
SELECT id, nombre, sexo, color, studbook_id, notas
FROM spcs WHERE id = '1f645327-a6da-449b-8a62-fdb577a8658e';

-- registro_stud_book sigue NULL (criterio acordado). 1 fila.
SELECT id FROM spcs WHERE id = '1f645327-a6da-449b-8a62-fdb577a8658e' AND registro_stud_book IS NULL;

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- UPDATE spcs SET sexo='macho', nombre='Conesera', studbook_id=NULL, color=NULL
-- WHERE id='1f645327-a6da-449b-8a62-fdb577a8658e';
-- (color: antes era NULL — ver el SELECT 0. notas: quitar el sufijo a mano.)
