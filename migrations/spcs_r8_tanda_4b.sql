-- ============================================================
-- spcs_r8_tanda_4b.sql — alta de un SPC de último momento para R8 (tanda 4b)
-- ============================================================
-- ✅ APLICADO el 07/08/2026 como migración `spcs_r8_tanda_4b`. spcs 178 -> 179.
--    id = fa61f989-ede8-436f-a5fa-1475d442dd58
--    Verificado (5/5): spcs 179, 1 fila con sb 421129, 1 fila con nombre
--    'LE CHAT MIMOUS', 0 filas con club_id no nulo, 0 studbook_id duplicados.
--    Fila inspeccionada campo por campo: club_id / caballeriza_id /
--    entrenador_id / jockey_habitual_id / registro_stud_book todos NULL,
--    certificado_correr false. data/spcs_snapshot.json actualizado a 179.
--
-- Pedido de Yesi el 07/08/2026, después del cierre de la tanda 4.
-- Padrón de la tanda: 1 nombre — LE CHAT MIMOUS. 1 alta, 0 casos no resueltos.
--
-- Origen: www.studbook.org.ar, endpoint
--   /ejemplares/autocomplete?tipo=1&muerto=1&term=<nombre>
-- Match EXACTO por nombre normalizado (upper + sin acentos + sin no-alfanuméricos).
-- Evidencia:  data/spcs_r8_tanda_4b_scrape.json     (el match)
--             data/spcs_r8_tanda_4b_variantes.json  (la sonda de grafías)
-- Scripts:    tools/studbook_scrape_tanda.mjs · tools/studbook_probe_terms.mjs
-- Snapshot spcs usado: 178 filas.
--
-- Sobre la grafía francesa: el SB devolvió el nombre EXACTO tal cual lo mandó
-- Yesi, con un único match. No hubo que probar variantes para resolverlo, pero
-- se sondearon igual (ver el reporte): el autocomplete matchea por PREFIJO, así
-- que 'MIMOUS', 'MIMOU' y 'CHAT MIMO' dan 0 hits por construcción. El prefijo
-- 'LE CHAT' devuelve 14 filas — 9 son 'LE CHAT <algo>' y una sola es MIMOUS.
-- No existe en el SB ninguna variante competidora (no hay LE CHAT MIMOSA/MIMOSO).
--
-- caballeriza_id / entrenador_id / jockey_habitual_id quedan NULL:
--   los asigna Yesi al inscribir. club_id NULL: los SPCs son globales.
--   registro_stud_book queda NULL: en la base es seed legacy (SB-D001…),
--   no es el registro real del Stud Book — el real va en studbook_id.
--
-- Idempotente: el INSERT se saltea si el studbook_id ya está
-- (índice único parcial spcs_studbook_id_uniq).
--
-- Guards corridos ANTES de escribir (5/5 limpios):
--   a) spcs total                                          -> 178 (esperado).
--   b) sb 421129 contra spcs.studbook_id                   -> 0 ocupados.
--   c) anti-duplicado por grafía (lección ESPLENDID CRAF):
--      spcs.nombre ~* '(CHAT|MIMOU|ASSASSIN|CHATEAU)'      -> 0 filas.
--   d) parientes de la familia LE CHAT en la base
--      (sb 341714/437055/434205/358610/455444)             -> 0 filas.
--   e) spcs.padrillo_nombre ~* 'BODEMEISTER'               -> 0 filas.
--   Nota: 'ABELITO MIMOSO' (sb 439663, tanda 4) NO es la misma mancha —
--   macho 2022, Magic Stripes / Fairy Mosa. Otro ejemplar.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Alta (1)
-- ------------------------------------------------------------

-- LE CHAT MIMOUS
--   https://www.studbook.org.ar/ejemplares/perfil/421129/le-chat-mimous
--   (2020 H SP) · tomo 1232 folio 637 · raza 4 (SPC) · bandera argentina
--   abuelo materno: Exchange Rate (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT 'LE CHAT MIMOUS', '2020-09-18'::date, 'hembra'::sexo_spc, 'Zaino',
       'Bodemeister (USA)', 'Le Chat Assassin', 'Argentina', '421129', 'activo'::estado_spc
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '421129');

-- ------------------------------------------------------------
-- 2. Verificación ANTES del COMMIT
-- ------------------------------------------------------------

-- Debe dar 179.
SELECT count(*) AS spcs_total FROM spcs;

-- Debe dar 1 fila, con los datos del SB y los FK de asignación en NULL.
SELECT nombre, fecha_nacimiento, sexo, color, padrillo_nombre, madre_nombre,
       pais_origen, studbook_id, estado,
       club_id, caballeriza_id, entrenador_id, jockey_habitual_id, registro_stud_book
FROM spcs WHERE studbook_id = '421129';

-- Debe dar 0 filas.
SELECT studbook_id, count(*) FROM spcs WHERE studbook_id IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;

COMMIT;
