-- rollback_condicion_sexo_r9_t8_t10.sql
--
-- Deshace fix_condicion_sexo_r9_t8_t10.sql: R9 de Dolores, T8 y T10 vuelven a 'ambos'.
-- Simétrico: mismo acotamiento (club + numero de reunión + turnos), predicado invertido
-- ('hembras' en vez de 'ambos') como idempotencia, mismo RETURNING, mismos guards al revés.
--
-- OJO: volver a 'ambos' REABRE el gate — T8 y T10 vuelven a aceptar machos y castrados.
-- Antes de correr esto, verificar que no haya inscriptos que dejarían de ser válidos:
--   SELECT c.numero_turno, s.nombre, s.sexo FROM inscripciones i
--     JOIN carreras c ON c.id = i.carrera_id JOIN spcs s ON s.id = i.spc_id
--    WHERE c.id IN ('bae8008f-87fc-479e-a416-27502c7489b3','099b050d-b7e5-412c-b789-55dae7d5cd13');

BEGIN;

WITH objetivo AS (
  SELECT c.id, c.numero_turno, c.condicion_sexo AS antes
    FROM carreras c
    JOIN reuniones r ON r.id = c.reunion_id
   WHERE r.club_id      = '0649e9c5-9e87-4aad-842f-101458e6b33c'
     AND r.numero       = 9
     AND c.numero_turno IN (8, 10)
     AND c.condicion_sexo = 'hembras'                              -- idempotencia
),
upd AS (
  UPDATE carreras c
     SET condicion_sexo = 'ambos'
    FROM objetivo o
   WHERE c.id = o.id
  RETURNING c.id,
            c.numero_turno,
            o.antes::text          AS antes,
            c.condicion_sexo::text AS despues,
            c.condicion_handicap
)
SELECT * FROM upd ORDER BY numero_turno;

DO $guard$
DECLARE
  v_hembras INT; v_ambos INT; v_fuera INT;
BEGIN
  SELECT count(*) FILTER (WHERE c.condicion_sexo = 'hembras'),
         count(*) FILTER (WHERE c.condicion_sexo = 'ambos')
    INTO v_hembras, v_ambos
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9;

  IF v_hembras <> 0 OR v_ambos <> 11 THEN
    RAISE EXCEPTION 'R9 quedó en % hembras / % ambos; esperaba 0 / 11. Abortado.', v_hembras, v_ambos;
  END IF;

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
