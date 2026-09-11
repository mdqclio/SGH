-- ============================================================
-- fix_condicion_sexo_r6_r7_r8.sql — 5 carreras con condicion_sexo='ambos' y texto de yeguas / exclusión de yeguas
-- ============================================================
-- ✅ EJECUTADA el 11/09/2026 por MCP apply_migration (nombre: fix_condicion_sexo_r6_r7_r8), con OK de Leo.
--    DO con foto to_jsonb de liquidaciones/liquidacion_detalle/resultados/resultado_posiciones/inscripciones
--    de R6 T2 y R8 T12 antes y después (idéntica), 2 + 3 filas, 0 desacuerdos texto/columna al final.
--
-- Mismo defecto que R9 T8/T10 (fix del 08/09, migrations/fix_condicion_sexo_r9_t8_t10.sql en la rama
-- fix/condicion-sexo-t8-t10-r9): la columna dice 'ambos' y el texto dice otra cosa. Detectado el 11/09
-- (docs/diagnosticos/2026-09-11_relevamiento-studbook-tres-pedidos-diego.md §2.2) con:
--   (lower(condicion_handicap) ~ 'yegua' AND condicion_sexo <> 'hembras')
--   OR (lower(condicion_handicap) ~ 'exclusi.n de yeguas' AND condicion_sexo <> 'machos')
--
-- Qué lee condicion_sexo (verificado el 11/09):
--   · validar_inscripcion()  — gate al ANOTAR (pg_proc.prosrc). No corre sobre inscripciones ya hechas.
--   · v_programa_reunion     — vista de lectura.
--   · carta-llamados / inscripciones / ratificacion / programa / portal — display.
--   · studbook_format.mjs    — el JSON (condicion.sexo).
--   NO lo leen: aplicar_resultado, liquidaciones.html, liquidaciones-engine.js, emitir_recibo, ninguna RPC de
--   plata (grep en main + pg_proc). Cambiar la columna no toca resultados ni liquidación: es dato de la carrera.
--   trg_audit_carreras deja el rastro (datos_antes/datos_despues), como con el fix de R9.
--
-- Las 5 (ids verificados):
--   R6 T2  c06f15a1-a570-434f-acf1-4c412fd50108  "Caballos 3 años perdedores (con exclusión de yeguas)"  → machos   (oficial, 16 líneas liq, 8 machos ratificados, 0 hembras)
--   R6 T4  d6a71a62-0dc2-426b-838e-25f95c396824  "Caballos 4 años perdedores (con exclusión de yeguas)"  → machos   (anulada)
--   R6 T10 f23f5078-1928-4715-8ef8-f81149f20531  "Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras." → hembras (anulada)
--   R7 T7  c611e802-d149-4a7b-a889-f0486b89b407  "Yeguas 4 y 5 años perdedoras."                          → hembras (R7 cancelada, 0 inscr)
--   R8 T12 5fdacd51-9d7b-4d42-a83c-894f8eb35b8b  "Yeguas de 4 y 5 años perdedoras"                        → hembras (oficial, 20 líneas liq, 0 machos)
--
-- SUPUESTO: "con exclusión de yeguas" = 'machos' (el ENUM tiene también 'machos_castrados'; el texto no
-- distingue, y 'machos' es el valor que ya usa la única carrera con ese sexo en la base). Confirmar con Fede
-- si "machos" en Dolores incluye castrados; si no, es cambiar 2 literales.
-- ============================================================

-- 0. Pre: exactamente estas 5 filas con 'ambos'.
SELECT r.numero, c.numero_turno, c.id, c.condicion_sexo, c.condicion_handicap
FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
WHERE c.id IN ('c06f15a1-a570-434f-acf1-4c412fd50108','d6a71a62-0dc2-426b-838e-25f95c396824','f23f5078-1928-4715-8ef8-f81149f20531','c611e802-d149-4a7b-a889-f0486b89b407','5fdacd51-9d7b-4d42-a83c-894f8eb35b8b')
ORDER BY r.numero, c.numero_turno;

-- 0.b Foto de plata y resultados de las 2 oficiales, para comparar después (no tiene que cambiar nada).
SELECT c.id, (SELECT count(*) FROM liquidacion_detalle d WHERE d.carrera_id = c.id) AS lineas,
       (SELECT sum(monto_neto) FROM liquidacion_detalle d WHERE d.carrera_id = c.id) AS neto,
       (SELECT estado FROM resultados WHERE carrera_id = c.id) AS res_estado,
       (SELECT updated_at FROM resultados WHERE carrera_id = c.id) AS res_updated
FROM carreras c WHERE c.id IN ('c06f15a1-a570-434f-acf1-4c412fd50108','5fdacd51-9d7b-4d42-a83c-894f8eb35b8b');

BEGIN;

UPDATE carreras SET condicion_sexo = 'machos'
WHERE id IN ('c06f15a1-a570-434f-acf1-4c412fd50108','d6a71a62-0dc2-426b-838e-25f95c396824') AND condicion_sexo = 'ambos';
-- 2 filas

UPDATE carreras SET condicion_sexo = 'hembras'
WHERE id IN ('f23f5078-1928-4715-8ef8-f81149f20531','c611e802-d149-4a7b-a889-f0486b89b407','5fdacd51-9d7b-4d42-a83c-894f8eb35b8b') AND condicion_sexo = 'ambos';
-- 3 filas

-- Verificación: 0 carreras con texto de yeguas/exclusión y columna en desacuerdo (en toda la base).
SELECT count(*) AS desacuerdos FROM carreras c
WHERE (lower(c.condicion_handicap) ~ 'yegua' AND lower(c.condicion_handicap) !~ 'exclusi.n de yeguas' AND c.condicion_sexo <> 'hembras')
   OR (lower(c.condicion_handicap) ~ 'exclusi.n de yeguas' AND c.condicion_sexo <> 'machos');
-- 0
-- Repetir 0.b: mismas líneas, mismo neto, mismo res_updated.

COMMIT;

-- ROLLBACK: UPDATE carreras SET condicion_sexo='ambos' WHERE id IN (…las 5…);
