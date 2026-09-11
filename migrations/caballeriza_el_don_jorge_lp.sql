-- ============================================================
-- caballeriza_el_don_jorge_lp.sql — alta de la caballeriza "EL DON JORGE (LP)" con propietario provisorio
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo.
--
-- Pedido de Yesi (11/09/2026): la planilla de R9 la trae como "DON JORGE" (T4 NIÑO OCEANICO,
-- T3 MARIA CATULENGA; cuidador TAVAGNUTTI RICARDO H). El nombre correcto es con "EL".
-- No hay datos del titular → propietario PROVISORIO, mismo criterio que Fede aprobó el
-- 15/08 para los 40 de R8 (docs/RUNBOOK_R8_PROVISORIOS.md §B4): el propietario nace con el
-- nombre de la caballeriza, tipo 'persona', sin documento, y una marca en `notas` para
-- encontrarlo después. Se completa cuando alguien viene a cobrar.
--
-- Verificado antes (2026-09-11, docs/diagnosticos/2026-09-11_caballeriza-el-don-jorge-lp.md
-- y …_plan-alta-el-don-jorge-lp.md):
--   · no existe ninguna caballeriza JORGE / DON JORGE / EL DON JORGE, con o sin (LP), en ningún club
--   · no existe propietario "EL DON JORGE"
--   · caballerizas.html manda club_id en el INSERT y filtra el listado por club — no hace falta fix
--   · 0 inscripciones apuntan a esta caballeriza (no existe) → la re-derivación defensiva del §4 da 0
--
-- Formato de los 40 de R8, medido en la base (replicado tal cual, sin inventar):
--   propietarios:             tipo='persona', nombre=<caballeriza>, documento_tipo NULL, documento_nro NULL,
--                             activo=true, estado='activo', club_id=Dolores, notas='provisorio R8 15/08'
--   caballeriza_responsables: rol='propietario', activo=true, nombre=<caballeriza>, apellido NULL,
--                             documento_tipo='DNI', documento_nro NULL, profesional_id NULL, propietario_id=<nuevo>
--   caballerizas.responsable: NULL en las 40 (el texto lo arma la UI al re-guardar)
-- La marca de notas acá es 'provisorio R9 11/09' — misma forma, otra reunión/fecha, para que
-- `notas LIKE 'provisorio R%'` los agarre a todos y `= 'provisorio R9 11/09'` sólo a éste.
--
-- Sufijo: en la base conviven 'GARIN CITY (LP)' (paréntesis en el nombre), 'JUVENTUD LP' /
-- 'LA ESCUELITA LP' (sin paréntesis) y 'TIAN Y ROMA' / 'BETTY SANTI' (hipodromo_patente='LP').
-- Yesi fijó el nombre: 'EL DON JORGE (LP)'. hipodromo_patente='LP' como en TIAN Y ROMA/BETTY SANTI.
--
-- Trigger fn_caballeriza_resp_set_propietario: sólo actúa si documento_nro IS NOT NULL → con NULL
-- no crea ni busca propietario, por eso propietario_id va explícito (igual que en R8).
-- Trigger fn_inscripcion_set_propietario: BEFORE INSERT/UPDATE en inscripciones, deriva
-- propietario_id de caballeriza_responsables(rol='propietario', activo) SIN condición → cualquier
-- inscripción que reciba esta caballeriza DESPUÉS de este alta sale derivada sola.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Pre-chequeos (fuera de la tx). Todos tienen que dar lo indicado o NO seguir.
-- ------------------------------------------------------------

-- 0.a  Caballeriza parecida (sin acentos, sin espacios/paréntesis, cualquier club): 0 filas.
SELECT id, nombre, club_id, hipodromo_patente FROM caballerizas
WHERE upper(regexp_replace(translate(nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^A-Za-z0-9]','','g')) LIKE '%JORGE%';

-- 0.b  Propietario con ese nombre en Dolores: 0 filas.
SELECT id, nombre, notas FROM propietarios
WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND upper(btrim(nombre)) = 'EL DON JORGE (LP)';

-- 0.c  Conteos base (para el rollback y la verificación): anotar.
SELECT (SELECT count(*) FROM caballerizas) AS caballerizas,
       (SELECT count(*) FROM propietarios) AS propietarios,
       (SELECT count(*) FROM propietarios WHERE notas LIKE 'provisorio R%') AS provisorios,
       (SELECT count(*) FROM caballeriza_responsables) AS responsables;
-- Medido el 11/09 noche: caballerizas 300 · propietarios 263 · provisorios 40 · responsables (anotar al ejecutar).

BEGIN;

-- ------------------------------------------------------------
-- 1. Caballeriza
-- ------------------------------------------------------------
-- Mismas columnas que manda caballerizas.html (línea 620): club_id, nombre, estado, activo,
-- hipodromo_patente; telefono/notas/chaquetilla NULL. `responsable` NULL como en R8.
WITH cab AS (
  INSERT INTO caballerizas (club_id, nombre, estado, activo, hipodromo_patente, notas)
  SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c', 'EL DON JORGE (LP)', 'activo', true, 'LP',
         'Alta 11/09/2026 (planilla R9 dice DON JORGE). Titular sin datos: propietario provisorio.'
  WHERE NOT EXISTS (
    SELECT 1 FROM caballerizas
    WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
      AND upper(btrim(nombre)) = 'EL DON JORGE (LP)'
  )
  RETURNING id, club_id, nombre
),
-- ------------------------------------------------------------
-- 2. Propietario provisorio (forma de R8)
-- ------------------------------------------------------------
prop AS (
  INSERT INTO propietarios (club_id, tipo, nombre, activo, estado, notas)
  SELECT cab.club_id, 'persona', cab.nombre, true, 'activo', 'provisorio R9 11/09'
  FROM cab
  RETURNING id, club_id, nombre
)
-- ------------------------------------------------------------
-- 3. Vínculo (forma de R8: rol propietario, activo, nombre=caballeriza, documento_tipo 'DNI', sin nro)
-- ------------------------------------------------------------
INSERT INTO caballeriza_responsables (caballeriza_id, propietario_id, rol, activo, nombre, documento_tipo)
SELECT cab.id, prop.id, 'propietario', true, cab.nombre, 'DNI'
FROM cab JOIN prop ON prop.club_id = cab.club_id AND prop.nombre = cab.nombre;

-- ------------------------------------------------------------
-- 4. Re-derivación defensiva de propietario_id (esperado: 0 filas)
-- ------------------------------------------------------------
-- Sólo tendría efecto si ya existieran inscripciones apuntando a esta caballeriza con
-- propietario_id NULL. Hoy no puede haber ninguna (la caballeriza no existía). Queda por si
-- el alta se ejecuta DESPUÉS de que Yesi la haya creado y asignado a mano — en ese caso el
-- WHERE NOT EXISTS del §1 no inserta y este UPDATE cubre a las inscripciones huérfanas.
UPDATE inscripciones i
SET propietario_id = cr.propietario_id
FROM caballerizas c
JOIN caballeriza_responsables cr ON cr.caballeriza_id = c.id AND cr.rol = 'propietario' AND cr.activo = true
WHERE c.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND upper(btrim(c.nombre)) = 'EL DON JORGE (LP)'
  AND i.caballeriza_id = c.id
  AND i.propietario_id IS NULL;

-- ------------------------------------------------------------
-- 5. Verificación ANTES del COMMIT
-- ------------------------------------------------------------
-- 1 fila: la caballeriza, con su propietario provisorio y el vínculo.
SELECT c.id AS cab_id, c.nombre, c.club_id, c.hipodromo_patente, c.estado, c.activo, c.responsable,
       p.id AS prop_id, p.nombre AS prop_nombre, p.tipo, p.documento_nro, p.notas AS prop_notas,
       cr.rol, cr.activo AS resp_activo, cr.documento_tipo, cr.profesional_id
FROM caballerizas c
JOIN caballeriza_responsables cr ON cr.caballeriza_id = c.id
JOIN propietarios p ON p.id = cr.propietario_id
WHERE c.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND upper(btrim(c.nombre)) = 'EL DON JORGE (LP)';

-- Exactamente 1 propietario activo para la caballeriza (si hay 2, el LIMIT 1 del trigger elige al azar).
SELECT count(*) AS titulares_activos
FROM caballeriza_responsables cr JOIN caballerizas c ON c.id = cr.caballeriza_id
WHERE upper(btrim(c.nombre)) = 'EL DON JORGE (LP)' AND cr.rol = 'propietario' AND cr.activo = true;

-- Conteos: caballerizas +1, propietarios +1, provisorios 41, responsables +1.
SELECT (SELECT count(*) FROM caballerizas) AS caballerizas,
       (SELECT count(*) FROM propietarios) AS propietarios,
       (SELECT count(*) FROM propietarios WHERE notas LIKE 'provisorio R%') AS provisorios,
       (SELECT count(*) FROM caballeriza_responsables) AS responsables;

COMMIT;

-- ------------------------------------------------------------
-- 6. Después (el lunes, cuando Yesi haya asignado la caballeriza en Inscripciones)
-- ------------------------------------------------------------
-- Las inscripciones de R9 con esta caballeriza tienen que salir con propietario_id = el provisorio.
-- 0 filas con propietario_id NULL.
SELECT s.nombre AS spc, ca.numero_turno, i.estado, i.propietario_id
FROM inscripciones i
JOIN carreras ca ON ca.id = i.carrera_id
JOIN spcs s ON s.id = i.spc_id
JOIN caballerizas c ON c.id = i.caballeriza_id
WHERE ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'
  AND upper(btrim(c.nombre)) = 'EL DON JORGE (LP)';

-- ============================================================
-- ROLLBACK (en este orden, por FK: responsables → propietario → caballeriza)
-- ============================================================
-- Seguro sólo mientras ninguna inscripción apunte a la caballeriza ni ninguna liquidación /
-- recibo al propietario. Chequear antes:
--   SELECT count(*) FROM inscripciones WHERE caballeriza_id IN (SELECT id FROM caballerizas WHERE upper(btrim(nombre))='EL DON JORGE (LP)');
--   SELECT count(*) FROM liquidaciones WHERE propietario_id IN (SELECT id FROM propietarios WHERE nombre='EL DON JORGE (LP)' AND notas='provisorio R9 11/09');
--   SELECT count(*) FROM recibos WHERE propietario_id IN (SELECT id FROM propietarios WHERE nombre='EL DON JORGE (LP)' AND notas='provisorio R9 11/09');
-- Si las inscripciones ya la usan: primero UPDATE inscripciones SET caballeriza_id=NULL (el trigger pone propietario_id NULL solo).
--
-- BEGIN;
-- DELETE FROM caballeriza_responsables
--  WHERE caballeriza_id IN (SELECT id FROM caballerizas WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND upper(btrim(nombre))='EL DON JORGE (LP)');
-- DELETE FROM propietarios
--  WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND nombre='EL DON JORGE (LP)' AND notas='provisorio R9 11/09';
-- DELETE FROM caballerizas
--  WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND upper(btrim(nombre))='EL DON JORGE (LP)';
-- -- conteos vuelven a los de 0.c
-- COMMIT;
