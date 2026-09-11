-- ============================================================
-- merge_los_urones_duplicada.sql — unificar las dos "LOS URONES" (la del 18/08 y la que Yesi creó el 11/09)
-- ============================================================
-- ✅ EJECUTADA el 11/09/2026 por MCP apply_migration (nombre: merge_los_urones_duplicada), con OK de Leo.
--    Los 7 pasos dentro de un DO con ROW_COUNT=1 por paso, la línea 8e67d828 comparada byte a byte
--    (to_jsonb antes/después) y conteos 300/264/40/263. Resultado: sobrevive 6d5138dc con TRUPPA, HUGO
--    FABIAN (DNI 24525603) como titular sobre el propietario 380bb7cb; borrados 34fdf68d y 484b14a9.
--    ISSUE-080 abierto con el caso.
--
-- Estado medido el 11/09/2026 (docs/diagnosticos/2026-09-11_ejecucion-el-don-jorge-y-plan-los-urones.md):
--
--   VIEJA  6d5138dc-a13e-4fb1-8bde-c8e52e148dd2  hipodromo_patente NULL, responsable NULL
--          responsable: rol propietario, nombre 'LOS URONES', sin DNI → propietario 380bb7cb (provisorio R8 15/08)
--          inscripciones: DOCTOR SKY, R8 T2, ratificado, propietario_id = 380bb7cb
--          el provisorio 380bb7cb tiene 1 liquidación / 1 línea (R8, 100.000, estado_linea 'pagado' = saldado 28/08)
--   NUEVA  34fdf68d-fa3b-4591-a93d-7a9a6f753445  hipodromo_patente 'DOL', responsable 'HUGO FABIAN TRUPPA (propietario)'
--          responsable: rol propietario, nombre 'TRUPPA', apellido 'HUGO FABIAN', DNI 24525603 → propietario 484b14a9
--          ('HUGO FABIAN, TRUPPA' — creado por el trigger con apellido/nombre invertidos; 0 liq, 0 recibos)
--          inscripciones: DOCTOR SKY, R9 T2, inscripto, propietario_id = 484b14a9
--
-- Es el mismo stud, el mismo caballo, y Yesi cargó el dato que faltaba: el titular real. Es
-- EXACTAMENTE el caso previsto por Fede el 15/08 para los provisorios: se COMPLETA el provisorio,
-- no se crea otro. Entonces:
--   · sobrevive la VIEJA (tiene la historia de R8 y la plata saldada cuelga de su propietario 380bb7cb)
--   · el propietario 380bb7cb deja de ser provisorio: nombre 'TRUPPA, HUGO FABIAN' (convención
--     "APELLIDO, NOMBRES" del padrón), DNI 24525603
--   · la inscripción de R9 se re-apunta a la vieja; el trigger deriva propietario_id = 380bb7cb solo
--   · se borran responsable + propietario + caballeriza NUEVOS (sin plata: 0 liq, 0 recibos)
--   · la vieja hereda hipodromo_patente 'DOL' y el texto de responsable
--
-- SUPUESTO a confirmar con Yesi: que 'TRUPPA' es el apellido y 'HUGO FABIAN' los nombres (en el
-- padrón hay un entrenador TRUPPA ROBERTO; Yesi los cargó al revés en el formulario).
--
-- Orden dentro de la tx (importa por el índice único ux_propietarios_club_doc (club, tipo_doc, nro)
-- y por los triggers):
--   1 re-apuntar inscripción R9 → trigger fn_inscripcion_set_propietario pone 380bb7cb
--   2 borrar responsable NUEVO
--   3 borrar propietario NUEVO 484b14a9 (libera el DNI en el índice único)
--   4 completar propietario VIEJO 380bb7cb con nombre + DNI
--   5 completar responsable VIEJO (nombre/apellido/DNI) → trigger fn_caballeriza_resp_set_propietario
--     busca por DNI en el club y encuentra 380bb7cb (recién cargado) → propietario_id no cambia
--   6 caballeriza VIEJA: hipodromo_patente 'DOL', responsable 'TRUPPA HUGO FABIAN (propietario)'
--   7 borrar caballeriza NUEVA (ya sin responsables ni inscripciones)
-- ============================================================

-- 0. Pre-chequeos: exactamente esto, o NO seguir.
SELECT c.id, c.hipodromo_patente, c.responsable,
       (SELECT count(*) FROM inscripciones i WHERE i.caballeriza_id = c.id) AS n_inscr,
       (SELECT count(*) FROM spcs s WHERE s.caballeriza_id = c.id) AS n_spcs,
       (SELECT count(*) FROM profesionales p WHERE p.caballeriza_id = c.id) AS n_prof
FROM caballerizas c WHERE c.nombre ILIKE 'LOS URONES' ORDER BY c.id;
-- 2 filas: 6d5138dc (NULL, NULL, 1, 0, 0) y 34fdf68d ('DOL', 'HUGO FABIAN TRUPPA (propietario)', 1, 0, 0)

SELECT (SELECT count(*) FROM liquidaciones WHERE propietario_id = '484b14a9-8d61-4e1c-9769-978bd729fffb') AS liq_nuevo,
       (SELECT count(*) FROM recibos       WHERE propietario_id = '484b14a9-8d61-4e1c-9769-978bd729fffb') AS rec_nuevo,
       (SELECT count(*) FROM apoderados    WHERE autorizante_id  = '484b14a9-8d61-4e1c-9769-978bd729fffb') AS apod_nuevo,
       (SELECT count(*) FROM propietarios  WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND documento_tipo = 'DNI' AND documento_nro = '24525603') AS dni_en_uso;
-- 0 / 0 / 0 / 1 (el 1 es 484b14a9, que se borra en el paso 3)

BEGIN;

-- 1. inscripción R9 → caballeriza vieja (el trigger deriva propietario_id)
UPDATE inscripciones SET caballeriza_id = '6d5138dc-a13e-4fb1-8bde-c8e52e148dd2'
WHERE caballeriza_id = '34fdf68d-fa3b-4591-a93d-7a9a6f753445';
-- 1 fila (DOCTOR SKY R9 T2)

-- 2. responsable nuevo
DELETE FROM caballeriza_responsables WHERE caballeriza_id = '34fdf68d-fa3b-4591-a93d-7a9a6f753445';
-- 1 fila

-- 3. propietario nuevo (sin plata, sin inscripciones desde el paso 1)
DELETE FROM propietarios WHERE id = '484b14a9-8d61-4e1c-9769-978bd729fffb'
  AND NOT EXISTS (SELECT 1 FROM inscripciones WHERE propietario_id = '484b14a9-8d61-4e1c-9769-978bd729fffb')
  AND NOT EXISTS (SELECT 1 FROM liquidaciones WHERE propietario_id = '484b14a9-8d61-4e1c-9769-978bd729fffb')
  AND NOT EXISTS (SELECT 1 FROM recibos       WHERE propietario_id = '484b14a9-8d61-4e1c-9769-978bd729fffb');
-- 1 fila

-- 4. completar el provisorio viejo (deja de ser provisorio: la marca sale de notas)
UPDATE propietarios
SET nombre = 'TRUPPA, HUGO FABIAN',
    documento_tipo = 'DNI',
    documento_nro  = '24525603',
    notas = 'ex provisorio R8 15/08 — completado 11/09/2026 con el titular cargado por Yesi (LOS URONES duplicada, merge)'
WHERE id = '380bb7cb-aac3-48a7-974a-328daf47859b' AND notas = 'provisorio R8 15/08';
-- 1 fila

-- 5. completar el responsable viejo
UPDATE caballeriza_responsables
SET nombre = 'HUGO FABIAN', apellido = 'TRUPPA', documento_tipo = 'DNI', documento_nro = '24525603'
WHERE caballeriza_id = '6d5138dc-a13e-4fb1-8bde-c8e52e148dd2' AND rol = 'propietario' AND propietario_id = '380bb7cb-aac3-48a7-974a-328daf47859b';
-- 1 fila; el trigger resuelve por DNI → 380bb7cb (mismo id)

-- 6. caballeriza vieja hereda lo que Yesi cargó
UPDATE caballerizas
SET hipodromo_patente = 'DOL', responsable = 'TRUPPA HUGO FABIAN (propietario)'
WHERE id = '6d5138dc-a13e-4fb1-8bde-c8e52e148dd2';
-- 1 fila

-- 7. caballeriza nueva
DELETE FROM caballerizas WHERE id = '34fdf68d-fa3b-4591-a93d-7a9a6f753445'
  AND NOT EXISTS (SELECT 1 FROM inscripciones WHERE caballeriza_id = '34fdf68d-fa3b-4591-a93d-7a9a6f753445')
  AND NOT EXISTS (SELECT 1 FROM caballeriza_responsables WHERE caballeriza_id = '34fdf68d-fa3b-4591-a93d-7a9a6f753445');
-- 1 fila

-- Verificación antes del COMMIT
SELECT c.id, c.nombre, c.hipodromo_patente, c.responsable, cr.nombre, cr.apellido, cr.documento_nro, cr.propietario_id, p.nombre AS prop, p.documento_nro AS prop_dni, p.notas
FROM caballerizas c JOIN caballeriza_responsables cr ON cr.caballeriza_id = c.id JOIN propietarios p ON p.id = cr.propietario_id
WHERE c.nombre ILIKE 'LOS URONES';
-- 1 fila: 6d5138dc · DOL · TRUPPA HUGO FABIAN (propietario) · HUGO FABIAN / TRUPPA / 24525603 · 380bb7cb · 'TRUPPA, HUGO FABIAN' · 24525603

SELECT re.numero, ca.numero_turno, s.nombre, i.estado, i.caballeriza_id, i.propietario_id
FROM inscripciones i JOIN carreras ca ON ca.id = i.carrera_id JOIN reuniones re ON re.id = ca.reunion_id JOIN spcs s ON s.id = i.spc_id
WHERE i.caballeriza_id = '6d5138dc-a13e-4fb1-8bde-c8e52e148dd2' ORDER BY re.numero;
-- 2 filas (R8 ratificado, R9 inscripto), las dos con propietario_id 380bb7cb

SELECT (SELECT count(*) FROM caballerizas) AS caballerizas, (SELECT count(*) FROM propietarios) AS propietarios,
       (SELECT count(*) FROM propietarios WHERE notas LIKE 'provisorio R%') AS provisorios, (SELECT count(*) FROM caballeriza_responsables) AS responsables;
-- 300 / 264 / 40 / 263  (desde 301 / 265 / 41 / 264 post EL DON JORGE)
-- La plata de R8 sigue colgada de 380bb7cb: 1 liquidación, 1 línea pagada, sin cambios.

COMMIT;

-- ============================================================
-- ROLLBACK (recrea la nueva con los MISMOS ids, así el rastro de Yesi vuelve igual)
-- ============================================================
-- BEGIN;
-- INSERT INTO caballerizas (id, club_id, nombre, estado, activo, hipodromo_patente, responsable)
--   VALUES ('34fdf68d-fa3b-4591-a93d-7a9a6f753445', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'LOS URONES', 'activo', true, 'DOL', 'HUGO FABIAN TRUPPA (propietario)');
-- UPDATE propietarios SET nombre = 'LOS URONES', documento_tipo = NULL, documento_nro = NULL, notas = 'provisorio R8 15/08'
--   WHERE id = '380bb7cb-aac3-48a7-974a-328daf47859b';
-- INSERT INTO propietarios (id, club_id, tipo, nombre, documento_tipo, documento_nro, activo, estado)
--   VALUES ('484b14a9-8d61-4e1c-9769-978bd729fffb', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'persona', 'HUGO FABIAN, TRUPPA', 'DNI', '24525603', true, 'activo');
-- UPDATE caballeriza_responsables SET nombre = 'LOS URONES', apellido = NULL, documento_tipo = 'DNI', documento_nro = NULL
--   WHERE caballeriza_id = '6d5138dc-a13e-4fb1-8bde-c8e52e148dd2' AND rol = 'propietario';
-- INSERT INTO caballeriza_responsables (caballeriza_id, propietario_id, rol, activo, nombre, apellido, documento_tipo, documento_nro)
--   VALUES ('34fdf68d-fa3b-4591-a93d-7a9a6f753445', '484b14a9-8d61-4e1c-9769-978bd729fffb', 'propietario', true, 'TRUPPA', 'HUGO FABIAN', 'DNI', '24525603');
-- UPDATE caballerizas SET hipodromo_patente = NULL, responsable = NULL WHERE id = '6d5138dc-a13e-4fb1-8bde-c8e52e148dd2';
-- UPDATE inscripciones SET caballeriza_id = '34fdf68d-fa3b-4591-a93d-7a9a6f753445'
--   WHERE caballeriza_id = '6d5138dc-a13e-4fb1-8bde-c8e52e148dd2' AND carrera_id IN (SELECT id FROM carreras WHERE reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9');
-- COMMIT;
-- (El orden de los UPDATE de propietarios/responsables respeta el índice único por DNI: primero se
--  vacía el DNI del viejo, después se inserta el nuevo con ese DNI.)
