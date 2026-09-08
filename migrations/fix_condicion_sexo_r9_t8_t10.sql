-- fix_condicion_sexo_r9_t8_t10.sql
--
-- R9 de Dolores (2026-09-20): T8 y T10 son carreras de YEGUAS y quedaron con
-- condicion_sexo = 'ambos'. El gate de inscripción (validar_inscripcion) sólo mira
-- la columna, no el texto, así que hoy aceptan machos. Cero inscriptos en los dos
-- turnos al 2026-09-08, cierre 11/09 12:00 AR.
--
-- Evidencia (docs/diagnosticos/2026-09-08_machos-en-t8-t10-r9.md y
-- docs/diagnosticos/2026-09-08_plan-fix-condicion-sexo-t8-t10-r9.md):
--   1. condicion_handicap dice "Yeguas" — sólo en T8 y T10 de los once turnos.
--   2. Peso 55 en vez de 57 — sólo en T8 y T10.
--   3. Sin "Descargo 2 kilos a las hembras" — en T8, T10 y T9 (T9 es la Especial,
--      con handicap por victorias y peso 52: no tiene peso base del que descargar).
--   4. T8 dice "ganadoras", T10 "perdedoras": femenino.
--   Precedente del club: las tres carreras de la base que dicen "Yeguas…" (R6 T3,
--   R7 T2, R7 T4) tienen condicion_sexo = 'hembras', y la que dice "Caballos…"
--   (R7 T3) tiene 'machos'. El criterio ya estaba fijado; en R9 se pasó por alto.
--
-- NO toca T5, T9 ni T11: ahí el desacuerdo es de EDAD, texto vs columna son dos
-- criterios posibles y se espera definición de Fede.
--
-- Idempotente: el predicado condicion_sexo = 'ambos' hace que una segunda corrida
-- toque 0 filas, y los guards chequean el estado final (no el ROW_COUNT), así que
-- pasan igual.

BEGIN;

WITH objetivo AS (
  SELECT c.id, c.numero_turno, c.condicion_sexo AS antes
    FROM carreras c
    JOIN reuniones r ON r.id = c.reunion_id
   WHERE r.club_id      = '0649e9c5-9e87-4aad-842f-101458e6b33c'   -- Dolores
     AND r.numero       = 9
     AND c.numero_turno IN (8, 10)
     AND c.condicion_sexo = 'ambos'                                -- idempotencia
),
upd AS (
  UPDATE carreras c
     SET condicion_sexo = 'hembras'
    FROM objetivo o
   WHERE c.id = o.id
  RETURNING c.id,
            c.numero_turno,
            o.antes::text            AS antes,
            c.condicion_sexo::text   AS despues,
            c.condicion_handicap
)
SELECT * FROM upd ORDER BY numero_turno;

-- Guard: si el estado final no es el esperado, RAISE aborta la transacción entera.
DO $guard$
DECLARE
  v_hembras INT; v_ambos INT; v_fuera INT;
BEGIN
  SELECT count(*) FILTER (WHERE c.condicion_sexo = 'hembras'),
         count(*) FILTER (WHERE c.condicion_sexo = 'ambos')
    INTO v_hembras, v_ambos
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9;

  IF v_hembras <> 2 OR v_ambos <> 9 THEN
    RAISE EXCEPTION 'R9 quedó en % hembras / % ambos; esperaba 2 / 9. Abortado.', v_hembras, v_ambos;
  END IF;

  SELECT count(*) INTO v_fuera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9
     AND c.condicion_sexo = 'hembras' AND c.numero_turno NOT IN (8, 10);
  IF v_fuera <> 0 THEN
    RAISE EXCEPTION 'Hay % turnos de R9 en hembras fuera de T8/T10. Abortado.', v_fuera;
  END IF;

  -- Nada fuera de R9 de Dolores cambió: 3 'hembras' + 1 'machos' históricos = 4.
  SELECT count(*) INTO v_fuera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE NOT (r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9)
     AND c.condicion_sexo <> 'ambos';
  IF v_fuera <> 4 THEN
    RAISE EXCEPTION 'Fuera de R9 hay % carreras con sexo restringido; esperaba 4. Abortado.', v_fuera;
  END IF;
END
$guard$;

COMMIT;
