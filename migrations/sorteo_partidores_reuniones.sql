-- ============================================================
-- sorteo_partidores_reuniones.sql — caja de sorteo al pie de los PDFs (4c)
-- ============================================================
-- Pedido de Yesi: "que se agregue el orden de partidor y sorteo en algún
-- rincón cuando genere el PDF, tanto en inscriptos como en ratificados".
-- Cambia cada reunión -> lo carga la secretaría por pantalla.
--
-- ✅ APLICADA el 12/08/2026 por MCP (DDL por apply_migration, valor de R8 por
--    execute_sql). Verificación post-aplicación:
--      reunión 8 (16/08) con los 12 pares, 77 caracteres   ✅
--      reuniones ajenas modificadas .................... 0 ✅
--
-- TEXTO LIBRE. El formato lo decide la secretaría; el sistema NO interpreta
-- ni valida el contenido: lo renderiza tal cual (con escape de HTML) al pie
-- de los dos PDFs. Si está vacío, la caja no se dibuja.
--
-- OJO — no confundir con la matriz "ORDEN DE LARGADA" que ya existe en el
-- PDF de inscriptos (inscripciones.html:889). Esa es una grilla calculada
-- de inscripciones.numero_partidor por turno. Esto es otra cosa: el par
-- turno -> partidor del sorteo, cargado a mano. Conviven, no se pisan.
--
-- Guards corridos ANTES de escribir:
--   a) pwd = /home/clio/dev/SGH                          ✅
--   b) SELECT count(*) FROM spcs                         -> 183 ✅
--      (179 + las 4 altas de la tanda 5 punto 5)
--   c) reuniones NO tiene ya una columna de sorteo       ✅
--   d) reuniones con fecha 2026-08-16                    -> 1 fila ✅
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. DDL
-- ------------------------------------------------------------
ALTER TABLE reuniones ADD COLUMN IF NOT EXISTS sorteo_partidores text;

COMMENT ON COLUMN reuniones.sorteo_partidores IS
  'Sorteo y orden de partidores de la reunión. Texto libre cargado por la '
  'secretaría; se renderiza tal cual al pie de los PDFs de inscriptos y '
  'ratificados. Vacío = la caja no se dibuja. El sistema no lo interpreta.';

-- ------------------------------------------------------------
-- 2. Valor de R8 (16/08/2026)
-- ------------------------------------------------------------
-- Una sola línea con separador ' · ': entra en un renglón tanto en el
-- inscriptos (A4 landscape) como en el ratificados (A4 portrait), que es
-- lo que menos altura le roba a documentos que ya entran justos.
UPDATE reuniones
   SET sorteo_partidores = '1→7 · 2→16 · 3→8 · 4→9 · 5→14 · 6→11 · 7→3 · 8→6 · 9→13 · 10→12 · 11→2 · 12→5'
 WHERE fecha = '2026-08-16'
   AND sorteo_partidores IS NULL;   -- guard: nunca pisa lo que cargó Yesi

-- ------------------------------------------------------------
-- 3. Verificación ANTES del COMMIT
-- ------------------------------------------------------------

-- V1 — 1 fila, con los 12 pares.
SELECT numero, fecha, sorteo_partidores FROM reuniones WHERE fecha = '2026-08-16';

-- V2 — debe dar 0: ninguna otra reunión tocada.
SELECT count(*) FROM reuniones WHERE sorteo_partidores IS NOT NULL AND fecha <> '2026-08-16';

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- UPDATE reuniones SET sorteo_partidores = NULL WHERE fecha = '2026-08-16';
-- ALTER TABLE reuniones DROP COLUMN sorteo_partidores;
