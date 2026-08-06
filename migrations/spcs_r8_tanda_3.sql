-- ============================================================
-- spcs_r8_tanda_3.sql — alta incremental de SPCs para R8
-- ============================================================
-- ✅ APLICADO el 06/08/2026 por MCP apply_migration, migración `spcs_r8_tanda_3`
--    4 altas (ESPLENDID CRAF excluido, ver abajo). spcs 163 -> 167.
--    Verificado: 4 filas con los sb_id de la tanda, 0 studbook_id duplicados,
--    0 filas con nombre 'ESPLENDID CRAF', 0 con club_id/caballeriza_id/
--    registro_stud_book no nulos. data/spcs_snapshot.json actualizado a 167.
--
-- Origen: www.studbook.org.ar, match EXACTO por nombre normalizado.
-- Evidencia: data/spcs_r8_tanda_3_scrape.json
-- Casos no resueltos: data/spcs_r8_tanda_3_reporte.md
-- Snapshot spcs usado: 163 filas.
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

-- BAHIA ROMANA  (pedido como 'BAHIA ROMANA')
--   https://www.studbook.org.ar/ejemplares/perfil/435330/bahia-romana
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'BAHIA ROMANA', '2022-08-10'::date, 'hembra'::sexo_spc, 'Alazan',
       'Roman Joy', 'Oh Bahia', 'Argentina',
       '435330', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '435330'
);

-- INDIO GOLDEN  (pedido como 'INDIO GOLDEN')
--   https://www.studbook.org.ar/ejemplares/perfil/439349/indio-golden
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'INDIO GOLDEN', '2022-10-30'::date, 'macho'::sexo_spc, 'Zaino',
       'Golden Cigars', 'India Candela''s', 'Argentina',
       '439349', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '439349'
);

-- CONI ROSE  (pedido como 'CONI ROSE')
--   https://www.studbook.org.ar/ejemplares/perfil/430718/coni-rose
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'CONI ROSE', '2021-10-15'::date, 'hembra'::sexo_spc, 'Tordillo',
       'Marconi (USA)', 'Rose City', 'Argentina',
       '430718', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '430718'
);

-- ⚠ ESPLENDID CRAF — NO SE INSERTA. Ya está en la base como 'Esplendido Craf'.
--
--   El script lo clasificó ALTA_OK porque el nombre normalizado no coincide
--   ('ESPLENDIDCRAF' vs 'ESPLENDIDOCRAF') y la fila de la base tiene
--   studbook_id NULL, así que el guard de idempotencia no la ve.
--
--   Evidencia de que es la MISMA mancha:
--     base : 'Esplendido Craf' · id f78a132a-7fe7-4713-8ac2-9bd41a34f565
--            · nac 2020-10-18 · macho · studbook_id NULL
--     SB   : 'ESPLENDID CRAF'  · sb 421807 · nac 2020-10-18 · Macho · Zaino
--            · Mastercraftsman (IRE) / Esplendida Halo
--     El autocomplete del SB con el término 'ESPLENDIDO CRAF' devuelve
--     CERO resultados → no existe un ejemplar con esa grafía. El typo
--     está en la base, no en la planilla.
--
--   Insertarlo dejaría dos SPCs para el mismo caballo (spcs no tiene unique
--   en nombre) y las inscripciones se repartirían entre las dos filas.
--
-- INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
--                   padrillo_nombre, madre_nombre, pais_origen,
--                   studbook_id, estado)
-- SELECT 'ESPLENDID CRAF', '2020-10-18'::date, 'macho'::sexo_spc, 'Zaino',
--        'Mastercraftsman (IRE)', 'Esplendida Halo', 'Argentina',
--        '421807', 'activo'::estado_spc
-- WHERE NOT EXISTS (
--   SELECT 1 FROM spcs WHERE studbook_id = '421807'
-- );
--
--   ALTERNATIVA — ✅ APLICADA el 06/08/2026 por MCP apply_migration, migración
--   `spcs_r8_tanda_3_esplendid_craf_grafia`. Corrige la grafía de la fila
--   existente y la enriquece con el dato del SB. No toca ninguna FK — las
--   inscripciones referencian spcs.id, no el nombre (y eran 0 al aplicar).
--   Precondiciones verificadas antes: sb 421807 libre (0 filas), fila target
--   con studbook_id NULL (1 fila), 0 inscripciones apuntando.
--   Post: 1 fila 'ESPLENDID CRAF', 0 filas con 'ESPLENDIDO', 0 sb_id duplicados.
--   El SQL aplicado es exactamente el de abajo:
--
-- UPDATE spcs
--    SET nombre          = 'ESPLENDID CRAF',
--        studbook_id     = '421807',
--        color           = 'Zaino',
--        padrillo_nombre = 'Mastercraftsman (IRE)',
--        madre_nombre    = 'Esplendida Halo',
--        pais_origen     = 'Argentina'
--  WHERE id = 'f78a132a-7fe7-4713-8ac2-9bd41a34f565'
--    AND studbook_id IS NULL;

-- ES SABALERO  (pedido como 'ES SABALERO')
--   https://www.studbook.org.ar/ejemplares/perfil/432333/es-sabalero
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen,
                  studbook_id, estado)
SELECT 'ES SABALERO', '2021-10-20'::date, 'macho'::sexo_spc, 'Tordillo',
       'Pure Miron', 'Ori Champ', 'Argentina',
       '432333', 'activo'::estado_spc
WHERE NOT EXISTS (
  SELECT 1 FROM spcs WHERE studbook_id = '432333'
);

-- Verificación dentro de la misma transacción:
--   revisar el conteo ANTES de hacer COMMIT.
SELECT count(*) AS spcs_total FROM spcs;
SELECT nombre, fecha_nacimiento, sexo, color, padrillo_nombre,
       madre_nombre, studbook_id
FROM spcs WHERE studbook_id IN ('435330', '439349', '430718', '432333')
ORDER BY nombre;
-- ESPLENDID CRAF (421807) queda fuera a propósito — ver el bloque comentado.

COMMIT;
