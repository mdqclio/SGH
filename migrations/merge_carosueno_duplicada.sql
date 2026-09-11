-- ============================================================
-- merge_carosueno_duplicada.sql — unificar "CAROSUEÑO (DOL)" (historia, sin titular) y "CAROSUEÑO" (titular, sin historia)
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo.
--
-- Estado medido el 11/09/2026 (docs/diagnosticos/2026-09-11_plan-merge-carosueno.md):
--
--   HISTORIA  46cc818b-aac4-4d39-b3c9-0b0c156fc6cc  'CAROSUEÑO (DOL)', hipodromo_patente NULL, responsable NULL,
--             notas 'Alta para inscripciones reunión 2026-06-20 (planilla Yesica)'
--             spcs.caballeriza_id: LATIN RAIN, LATIN PRESUMIDA
--             inscripciones: 7 — R6 T3/T5/T9/T10 y R9 T7/T8/T10 — TODAS con propietario_id NULL
--             responsables: 0.  Liquidaciones: 0 líneas para esas inscripciones (R6 no generó nada para este stud)
--   TITULAR   e6830f69-2474-4d98-881a-2fcddc56b1b4  'CAROSUEÑO', hipodromo_patente 'DOL', domicilio 'LOBOS',
--             responsable 'BRIGANTI MARIA LAURA (propietario)'
--             caballeriza_responsables ef52073e: BRIGANTI MARIA LAURA, DNI 27122763, propietario_id a7b7fe52,
--             profesional_id fe884181 (es también la entrenadora de las 3 inscripciones de R9)
--             spcs: 0. inscripciones: 0. propietario a7b7fe52: 0 inscripciones, 0 liquidaciones.
--
-- Dirección: SOBREVIVE LA DE LA HISTORIA (46cc818b) y recibe al titular. Motivo: es la fila a la que
-- apuntan 2 SPC y 7 inscripciones (3 de R9 abiertas); mover eso son 9 UPDATEs sobre filas vivas
-- (4 de ellas en reuniones ya oficializadas), mover al titular es 1 UPDATE sobre una fila sin plata.
-- Ninguna de las dos tiene liquidaciones → no hay plata saldada que tocar en ningún sentido.
--
-- Orden dentro de la tx:
--   1 mover el responsable ef52073e a 46cc818b  (trigger fn_caballeriza_resp_set_propietario, BEFORE UPDATE:
--     documento_nro no NULL → busca propietario por DNI en el club → a7b7fe52, el mismo → propietario_id no cambia)
--   2 la fila superviviente hereda nombre limpio, hipodromo_patente, domicilio, texto de responsable
--   3 borrar e6830f69 (ya sin responsables; 0 spcs, 0 inscripciones, 0 profesionales)
--   4 re-derivar propietario_id en las 7 inscripciones (trigger fn_inscripcion_set_propietario, BEFORE UPDATE,
--     recalcula desde caballeriza_responsables activo → a7b7fe52). Se hace explícito con el mismo criterio
--     que B6 del runbook de R8, acotado a esta caballeriza y a propietario_id IS NULL.
--     R9 (3): evita que la liquidación del 20/09 nazca sin propietario (el patrón de R8).
--     R6 (4): no hay líneas de liquidación de este stud, así que no cambia ninguna plata; deja el
--     historial correcto por si R6 se re-liquida alguna vez (entonces BRIGANTI cobraría lo suyo, que es lo correcto).
-- ============================================================

-- 0. Pre-chequeos: exactamente esto, o NO seguir.
SELECT c.id, c.nombre, c.hipodromo_patente, c.responsable,
       (SELECT count(*) FROM inscripciones i WHERE i.caballeriza_id = c.id) AS n_inscr,
       (SELECT count(*) FROM inscripciones i WHERE i.caballeriza_id = c.id AND i.propietario_id IS NULL) AS n_inscr_sin_prop,
       (SELECT count(*) FROM spcs s WHERE s.caballeriza_id = c.id) AS n_spcs,
       (SELECT count(*) FROM profesionales p WHERE p.caballeriza_id = c.id) AS n_prof,
       (SELECT count(*) FROM caballeriza_responsables r WHERE r.caballeriza_id = c.id) AS n_resp
FROM caballerizas c WHERE c.id IN ('46cc818b-aac4-4d39-b3c9-0b0c156fc6cc','e6830f69-2474-4d98-881a-2fcddc56b1b4') ORDER BY c.nombre;
-- 'CAROSUEÑO'       e6830f69  DOL  'BRIGANTI MARIA LAURA (propietario)'  0 0 0 0 1
-- 'CAROSUEÑO (DOL)' 46cc818b  NULL NULL                                   7 7 2 0 0

SELECT (SELECT count(*) FROM liquidacion_detalle d WHERE d.inscripcion_id IN (SELECT id FROM inscripciones WHERE caballeriza_id = '46cc818b-aac4-4d39-b3c9-0b0c156fc6cc')) AS lineas_stud,
       (SELECT count(*) FROM liquidaciones WHERE propietario_id = 'a7b7fe52-bb01-4576-9fc4-0b815ad94aaf') AS liq_briganti,
       (SELECT count(*) FROM recibos       WHERE propietario_id = 'a7b7fe52-bb01-4576-9fc4-0b815ad94aaf') AS rec_briganti;
-- 0 / 0 / 0  → no hay plata de ningún lado

BEGIN;

-- 1. el titular pasa a la fila con historia
UPDATE caballeriza_responsables
SET caballeriza_id = '46cc818b-aac4-4d39-b3c9-0b0c156fc6cc'
WHERE id = 'ef52073e-e9d9-4275-aa75-b36781499d85'
  AND caballeriza_id = 'e6830f69-2474-4d98-881a-2fcddc56b1b4'
  AND propietario_id = 'a7b7fe52-bb01-4576-9fc4-0b815ad94aaf';
-- 1 fila; propietario_id sigue a7b7fe52

-- 2. la superviviente queda como la ficha "buena"
UPDATE caballerizas
SET nombre = 'CAROSUEÑO',
    hipodromo_patente = 'DOL',
    domicilio = 'LOBOS',
    responsable = 'BRIGANTI MARIA LAURA (propietario)',
    notas = concat_ws(' · ', notas, 'Unificada 11/09/2026 con la ficha CAROSUEÑO (e6830f69) que tenía el titular; ver migrations/merge_carosueno_duplicada.sql')
WHERE id = '46cc818b-aac4-4d39-b3c9-0b0c156fc6cc' AND nombre = 'CAROSUEÑO (DOL)';
-- 1 fila

-- 3. la vacía
DELETE FROM caballerizas WHERE id = 'e6830f69-2474-4d98-881a-2fcddc56b1b4'
  AND NOT EXISTS (SELECT 1 FROM caballeriza_responsables WHERE caballeriza_id = 'e6830f69-2474-4d98-881a-2fcddc56b1b4')
  AND NOT EXISTS (SELECT 1 FROM inscripciones           WHERE caballeriza_id = 'e6830f69-2474-4d98-881a-2fcddc56b1b4')
  AND NOT EXISTS (SELECT 1 FROM spcs                    WHERE caballeriza_id = 'e6830f69-2474-4d98-881a-2fcddc56b1b4')
  AND NOT EXISTS (SELECT 1 FROM profesionales           WHERE caballeriza_id = 'e6830f69-2474-4d98-881a-2fcddc56b1b4');
-- 1 fila

-- 4. re-derivar propietario_id (7 filas: 3 de R9 + 4 de R6)
UPDATE inscripciones i
SET propietario_id = cr.propietario_id
FROM caballeriza_responsables cr
WHERE cr.caballeriza_id = '46cc818b-aac4-4d39-b3c9-0b0c156fc6cc' AND cr.rol = 'propietario' AND cr.activo = true
  AND i.caballeriza_id = '46cc818b-aac4-4d39-b3c9-0b0c156fc6cc'
  AND i.propietario_id IS NULL;
-- 7 filas

-- Verificación antes del COMMIT
SELECT count(*) AS carosuenos FROM caballerizas WHERE upper(regexp_replace(translate(nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^A-Za-z0-9]','','g')) LIKE 'CAROSUENO%';
-- 1

SELECT c.nombre, c.hipodromo_patente, c.responsable, cr.apellido, cr.nombre, cr.documento_nro, cr.propietario_id
FROM caballerizas c JOIN caballeriza_responsables cr ON cr.caballeriza_id = c.id AND cr.rol = 'propietario' AND cr.activo
WHERE c.id = '46cc818b-aac4-4d39-b3c9-0b0c156fc6cc';
-- 1 fila: CAROSUEÑO · DOL · BRIGANTI MARIA LAURA (propietario) · BRIGANTI / MARIA LAURA / 27122763 / a7b7fe52

SELECT re.numero, ca.numero_turno, s.nombre, i.estado, i.propietario_id
FROM inscripciones i JOIN carreras ca ON ca.id = i.carrera_id JOIN reuniones re ON re.id = ca.reunion_id JOIN spcs s ON s.id = i.spc_id
WHERE i.caballeriza_id = '46cc818b-aac4-4d39-b3c9-0b0c156fc6cc' ORDER BY re.numero, ca.numero_turno;
-- 7 filas, todas propietario_id = a7b7fe52-bb01-4576-9fc4-0b815ad94aaf

SELECT (SELECT count(*) FROM caballerizas) AS caballerizas, (SELECT count(*) FROM propietarios) AS propietarios,
       (SELECT count(*) FROM caballeriza_responsables) AS responsables,
       (SELECT count(*) FROM liquidacion_detalle) AS lineas_total, (SELECT count(*) FROM liquidaciones) AS liq_total;
-- caballerizas 299 (desde 300) · propietarios 264 (sin cambio) · responsables 263 (sin cambio) · liquidaciones y líneas: SIN CAMBIO

COMMIT;

-- ============================================================
-- ROLLBACK (recrea e6830f69 con el mismo id)
-- ============================================================
-- BEGIN;
-- INSERT INTO caballerizas (id, club_id, nombre, estado, activo, hipodromo_patente, domicilio, responsable)
--   VALUES ('e6830f69-2474-4d98-881a-2fcddc56b1b4', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'CAROSUEÑO', 'activo', true, 'DOL', 'LOBOS', 'BRIGANTI MARIA LAURA (propietario)');
-- UPDATE caballeriza_responsables SET caballeriza_id = 'e6830f69-2474-4d98-881a-2fcddc56b1b4' WHERE id = 'ef52073e-e9d9-4275-aa75-b36781499d85';
-- UPDATE caballerizas SET nombre = 'CAROSUEÑO (DOL)', hipodromo_patente = NULL, domicilio = NULL, responsable = NULL,
--   notas = 'Alta para inscripciones reunión 2026-06-20 (planilla Yesica)' WHERE id = '46cc818b-aac4-4d39-b3c9-0b0c156fc6cc';
-- UPDATE inscripciones SET propietario_id = NULL WHERE caballeriza_id = '46cc818b-aac4-4d39-b3c9-0b0c156fc6cc' AND propietario_id = 'a7b7fe52-bb01-4576-9fc4-0b815ad94aaf';
-- COMMIT;
-- (El último UPDATE dispara el trigger, que al no encontrar responsable activo en 46cc818b vuelve a dejar NULL — coherente.)
