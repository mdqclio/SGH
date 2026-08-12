-- ============================================================
-- performance_inscripciones.sql — 4 últimas performances por inscripción
-- ============================================================
-- ✅ APLICADA el 12/08/2026 por MCP (DDL por apply_migration, backfill por
--    execute_sql). Verificación post-aplicación, todo según lo previsto:
--      filas con performance en R8 ............ 88   (previsto 88)
--      SPCs distintos ......................... 67   (previsto 67)
--      carreras ............................... 11
--      DEBUTA ................................. 6 SPCs
--      inscripciones con performance (global) . 88   (no se tocó nada fuera de R8)
--    Y el dato que importa para el papel del domingo:
--      ratificados en R8 ...................... 67
--      ratificados SIN performance ............ 0    -> 0 celdas en blanco
--    Las 18 filas que quedaron en NULL son forfait (12), inscripto (5) y
--    mal_inscrito (1) — no salen en el programa, que filtra por ratificado.
--    El mapa de Yesi coincide exactamente con el conjunto de ratificados.
--
-- Pedido de Yesi (12/08/2026): que el programa del 16 imprima las
-- "4 ULT. PERF." que ella arma en sus Excel por carrera.
--
-- CONTEXTO VERIFICADO ANTES DE ESCRIBIR (ver docs/PERFORMANCES_R8.md):
--   · La columna "4 ULT. PERF." YA EXISTE en programa-oficial.html:419
--     y en programa-oficial-color.html — lee spcs.ult_performances (text).
--   · spcs.ult_performances está poblada en 0 de 179 filas -> la columna
--     imprime vacía hoy para las 80 líneas de R8.
--   · inscripciones NO tiene campo de performance.
--   · Existe además la tabla relacional `performances` (autopoblada por
--     resultados.html con resultados propios). Alimenta los chips de
--     programa.html (pantalla), NO el PDF. No se toca acá.
--
-- DECISIÓN (punto 2 del pedido): el dato va POR INSCRIPCIÓN, no por SPC.
-- Cambia después de cada reunión; guardándolo en la inscripción el
-- programa histórico queda fiel al papel que se imprimió ese día.
-- spcs.ult_performances queda como fallback de lectura (no se borra).
--
-- Guards corridos ANTES de escribir:
--   a) pwd = /home/clio/dev/SGH                                    ✅
--   b) mapa de Yesi = 67 pares                                     ✅
--   c) SPCs distintos inscriptos en R8 (16/08)                     -> 80
--   d) match del mapa contra R8 por nombre normalizado             -> 67/67 ✅
--   e) sin match en R8                                             -> 0 ✅
--   f) conflictos (valor previo distinto)                          -> 0 ✅
--   g) filas de inscripción alcanzadas por los 67 SPCs             -> 88
--      (algunos SPC están inscriptos en más de un turno; el valor de
--       performance es el mismo para todas sus filas de esa reunión)
--
-- WISKA KEN del Excel = WISLA KEN en la base: el mapa de abajo ya viene
-- con el nombre de la base, no hace falta alias.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. DDL
-- ------------------------------------------------------------
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS performance text;

COMMENT ON COLUMN inscripciones.performance IS
  '4 últimas performances tal como se imprimen en el programa (ej. 9S0L0S). '
  'Texto libre, se carga por pantalla. "DEBUTA" es un valor válido. '
  'Por inscripción y no por SPC: cambia cada reunión y así el programa '
  'histórico queda fiel. Fallback de lectura: spcs.ult_performances.';

-- ------------------------------------------------------------
-- 2. Backfill R8 (16/08/2026) — 67 SPCs, 88 filas de inscripción
-- ------------------------------------------------------------
-- Sólo donde performance IS NULL. Idempotente: correrlo dos veces no
-- pisa nada. El match es por nombre normalizado DENTRO de la reunión
-- del 16/08, así los SPC duplicados de la tabla (p.ej. WAVE RIMOUT,
-- que tiene dos filas) no pueden desviar el UPDATE: sólo se toca la
-- fila que está efectivamente inscripta.
WITH mapa(nombre, perf) AS (VALUES
  ('TOUCH OF BLUE','9S0L0S'),         ('ELSEPTIMOESDECALDERA','3D0L0P'),
  ('BESO CURIOSO','9D8D6D6D'),        ('LOCA DUBAI','2T3T8L4D'),
  ('LINDA MAIPUENSE','4D'),           ('DOCTOR SKY','6D3D4D7D'),
  ('ASTUTO NOTES','6D8D4D5D'),        ('BACHUNA','DEBUTA'),
  ('BENDITO PRESAGIO','2D3D'),        ('WILSON SECURITY','8L0L'),
  ('DE BELLOSO','DEBUTA'),            ('LA GRAN TEMPESTAD','DEBUTA'),
  ('MARUKA PLUS','8L9L'),             ('LOGUACIOUS','8L3L7L5S'),
  ('IDALIA MARO','0P'),               ('CHE CARABANERA','8L9P0L6P'),
  ('SANTA LISA','0P'),                ('RECUERDAME IN YOU','0L'),
  ('INFILTRADO SLEW','8D'),           ('GLAM METAL','3S8S6S2L'),
  ('QUINIELA TREND','3D5D4D4D'),      ('LIVIA DRUSA','0P8L4D8L'),
  ('GRAND VUELTERA','7L3L0L5D'),      ('ALIADO SCAT','0L0L0L8L'),
  ('BABY PARADISE','0L6D4D3D'),       ('DESTINADO JOHAN','3D2D'),
  ('TERRIBLE KING','6P3P5P3S'),       ('FLORENTINA IN YOU','4S7S2D5D'),
  ('GRILLADA RYE','7D6D8D7D'),        ('PORTEÑO Y BAILARIN','5L6L0L6D4D'),
  ('LA LAGUNERA J','5D2D1D7L'),       ('FALAYS','2L2L1L6L'),
  ('NOCHE EN VELA','3D1D7L'),         ('NELIDA RIM','8L1L0L0L'),
  ('IX GOAL TUN','0T5T7T7T'),         ('AMIGUITO JESUS','1T2L3L4L'),
  ('CONI ROSE','0L7L1L0S'),           ('WISLA KEN','0L7L1D1P'),
  ('LA DIVERTENTE','1D9L6D8L'),       ('ESPLENDID CRAF','1D2D1D2D'),
  ('WAVE RIMOUT','3D6L8L0L'),         ('NORMANDO LU','1L2L4L6L'),
  ('ICY TOM','4D5D4D5T'),             ('BELLO PRESAGIO','0L2D4L3L'),
  ('CHINITA SALTEÑA','4P0L1D3L'),     ('TATA FOOT','0L7L'),
  ('QUE TAL OREJA','3P4P8P4L'),       ('ES SABALERO','2L0L0P'),
  ('REY DE PILA','DEBUTA'),           ('REINA EDITION','7T8L'),
  ('HEART OF GOLD','9L6L9L'),         ('COLONIAL JOHAN','0S0L7T8L'),
  ('EL GRAN HECTOR','3L7L9L0L'),      ('VISION SECURITY','2D5D0L3D'),
  ('DESDEN','2D7L'),                  ('ABELITO MIMOSO','DEBUTA'),
  ('SOY RICARDO','0L'),               ('MAC VITAL','DEBUTA'),
  ('BAHIA ROMANA','4S6L5T8S'),        ('YOOKY','5P6L3L5L'),
  ('LE CHAT MIMOUS','5L3L1D0L'),      ('ECHO IN THE SKY','0L3D0L7D'),
  ('SEÑOR MONCHI','7L2D1D4D'),        ('REINA ATREVIDA','3P1Z0P0Z'),
  ('LE BATEAU','8L6L9L3L'),           ('BOHEMIO TOP','2L1D1L0L'),
  ('DEVIL''S KING','6P1D2D7P')
)
UPDATE inscripciones i
   SET performance = m.perf
  FROM carreras c, reuniones r, spcs s, mapa m
 WHERE c.id = i.carrera_id
   AND r.id = c.reunion_id
   AND s.id = i.spc_id
   AND r.fecha = '2026-08-16'
   AND regexp_replace(upper(translate(s.nombre,'ÁÉÍÓÚÑÜáéíóúñü','AEIOUNUAEIOUNU')),'[^A-Z0-9]','','g')
     = regexp_replace(upper(translate(m.nombre,'ÁÉÍÓÚÑÜáéíóúñü','AEIOUNUAEIOUNU')),'[^A-Z0-9]','','g')
   AND i.performance IS NULL;   -- guard: nunca pisa un valor existente

-- ------------------------------------------------------------
-- 3. Verificación ANTES del COMMIT
-- ------------------------------------------------------------

-- V1 — debe dar 88 filas / 67 SPCs.
SELECT count(*) AS filas, count(DISTINCT i.spc_id) AS spcs
  FROM inscripciones i
  JOIN carreras c ON c.id = i.carrera_id
  JOIN reuniones r ON r.id = c.reunion_id
 WHERE r.fecha = '2026-08-16' AND i.performance IS NOT NULL;

-- V2 — los ratificados sin performance (los 13 que Yesi no pasó).
SELECT s.nombre, i.estado
  FROM inscripciones i
  JOIN carreras c ON c.id = i.carrera_id
  JOIN reuniones r ON r.id = c.reunion_id
  JOIN spcs s ON s.id = i.spc_id
 WHERE r.fecha = '2026-08-16' AND i.performance IS NULL
 ORDER BY s.nombre;

-- V3 — DEBUTA debe aparecer tal cual, 6 SPCs.
SELECT DISTINCT s.nombre
  FROM inscripciones i
  JOIN carreras c ON c.id = i.carrera_id
  JOIN reuniones r ON r.id = c.reunion_id
  JOIN spcs s ON s.id = i.spc_id
 WHERE r.fecha = '2026-08-16' AND i.performance = 'DEBUTA'
 ORDER BY 1;

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Sólo el backfill (deja la columna):
--   UPDATE inscripciones i SET performance = NULL
--     FROM carreras c, reuniones r
--    WHERE c.id = i.carrera_id AND r.id = c.reunion_id AND r.fecha = '2026-08-16';
-- Todo:
--   ALTER TABLE inscripciones DROP COLUMN performance;
