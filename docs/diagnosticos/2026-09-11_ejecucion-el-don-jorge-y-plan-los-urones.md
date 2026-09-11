# EL DON JORGE (LP) — EJECUTADO · LOS URONES duplicada — diagnóstico y plan de merge (NO ejecutado)

**Fecha:** 2026-09-11 (noche) · **`main`:** `95b7369` · **Branch:** `feat/caballeriza-el-don-jorge-lp` @ `3f35445` (pusheada, sin mergear a `main`)
**Escrituras:** una — `apply_migration caballeriza_el_don_jorge_lp`. El merge de LOS URONES está escrito (`migrations/merge_los_urones_duplicada.sql`) y **espera tu OK**.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 201 | ✅ |
| ref | `unlhcuanfrtpatoipwve` | ✅ |
| caballerizas / propietarios / provisorios / responsables antes | 300 / 264 / 40 / 263 | ✅ (propietarios pasó 263 → 264 entre la tarde y ahora: TRUPPA, creado por el trigger al cargar LOS URONES) |

---

## 1. EL DON JORGE (LP) — hecho

Pre-chequeos 0.a / 0.b: `[]` / `[]`. Conteos 300 / 264 / 40 / 263.

`apply_migration caballeriza_el_don_jorge_lp`: el bloque `WITH cab … prop … INSERT responsables` + UPDATE defensivo + `DO` que aborta si los conteos no dan 301 / 265 / 41 / 264 o si `titulares_activos <> 1`. `{"success":true}`.

```json
{"cab_id":"5c9890a5-392b-4915-97a7-f7ea6c7c2d7d","nombre":"EL DON JORGE (LP)","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","hip":"LP","estado":"activo","activo":true,"responsable_txt":null,
 "prop_id":"7ae60b44-7144-4549-92a8-2118b4141f95","prop_nombre":"EL DON JORGE (LP)","tipo":"persona","doc":null,"prop_notas":"provisorio R9 11/09",
 "rol":"propietario","resp_activo":true,"doc_tipo":"DNI","prof":null}
{"caballerizas":301,"propietarios":265,"provisorios":41,"responsables":264}
```

| | esperado | real |
|---|---|---|
| caballeriza | `EL DON JORGE (LP)`, Dolores, `hipodromo_patente 'LP'`, activa | ✅ `5c9890a5-…` |
| propietario provisorio | forma R8: persona, sin doc, `notas 'provisorio R9 11/09'` | ✅ `7ae60b44-…` |
| vínculo | rol propietario, activo, `documento_tipo 'DNI'`, sin nro, sin profesional | ✅ |
| titulares activos | 1 | ✅ |
| conteos | 301 / 265 / 41 / 264 | ✅ |
| UPDATE defensivo de inscripciones | 0 filas | ✅ (ninguna inscripción apuntaba; la caballeriza no existía) |

Yesi ya puede asignarla en Inscripciones a MARIA CATULENGA (T3, hoy con caballeriza NULL) y a NIÑO OCEANICO. Al guardar, el trigger deriva `propietario_id = 7ae60b44-…` solo. Query de control el lunes: §6 del SQL.

`migrations/caballeriza_el_don_jorge_lp.sql` marcado **EJECUTADA** en la rama.

---

## 2. LOS URONES — qué pasó exactamente

```json
[{"id":"6d5138dc-a13e-4fb1-8bde-c8e52e148dd2","hip":null,"responsable_txt":null,"estado":"activo","activo":true,"notas":null,"n_resp":1,
  "resp":[{"rol":"propietario","activo":true,"nombre":"LOS URONES","apellido":null,"doc":null,"prop_id":"380bb7cb-aac3-48a7-974a-328daf47859b","created":"2026-08-18T16:16:40.270291"}],
  "n_inscr":1,"inscr":[{"reunion":8,"turno":2,"spc":"DOCTOR SKY","estado":"ratificado","prop":"380bb7cb-aac3-48a7-974a-328daf47859b"}],"n_spcs":0,"n_prof":0},
 {"id":"34fdf68d-fa3b-4591-a93d-7a9a6f753445","hip":"DOL","responsable_txt":"HUGO FABIAN TRUPPA (propietario)","estado":"activo","activo":true,"notas":null,"n_resp":1,
  "resp":[{"rol":"propietario","activo":true,"nombre":"TRUPPA","apellido":"HUGO FABIAN","doc":"24525603","prop_id":"484b14a9-8d61-4e1c-9769-978bd729fffb","created":"2026-09-11T19:57:14.385209"}],
  "n_inscr":1,"inscr":[{"reunion":9,"turno":2,"spc":"DOCTOR SKY","estado":"inscripto","prop":"484b14a9-8d61-4e1c-9769-978bd729fffb"}],"n_spcs":0,"n_prof":0}]
```
```json
propietario viejo 380bb7cb: {"nombre":"LOS URONES","notas":"provisorio R8 15/08","n_liq":1,"n_det":1,"det_estados":[{"estado":"pagado","n":1,"monto":100000}],"n_rec":0,"n_apod":0}
propietario nuevo 484b14a9: {"nombre":"HUGO FABIAN, TRUPPA","doc":"24525603","notas":null,"n_liq":0,"n_rec":0,"n_inscr":1}
```

| | VIEJA `6d5138dc` (18/08) | NUEVA `34fdf68d` (hoy 16:57 AR) |
|---|---|---|
| `hipodromo_patente` / texto responsable | NULL / NULL | `DOL` / "HUGO FABIAN TRUPPA (propietario)" |
| responsable | `LOS URONES`, sin DNI → **provisorio R8** `380bb7cb` | `TRUPPA` / `HUGO FABIAN` / DNI 24525603 → propietario `484b14a9` `"HUGO FABIAN, TRUPPA"` |
| inscripciones | **DOCTOR SKY R8 T2** ratificado, `propietario_id` = provisorio | **DOCTOR SKY R9 T2** inscripto, `propietario_id` = TRUPPA |
| plata | provisorio: **1 liquidación R8, 1 línea 100.000 `pagado`** (saldado 28/08) | 0 liquidaciones, 0 recibos |

Lectura: **es el mismo stud** (mismo caballo en R8 y R9), y Yesi, al no encontrar... o al encontrar la vieja sin titular, creó una nueva **con el dato que faltaba**: el titular real, HUGO FABIAN TRUPPA, DNI 24525603. O sea, hizo a mano lo que el criterio de Fede del 15/08 prevé para los provisorios — sólo que en vez de **completar** el provisorio, **duplicó** la caballeriza. Dos detalles más: el propietario nuevo quedó con apellido y nombre invertidos (`"HUGO FABIAN, TRUPPA"`; el trigger arma `apellido, nombre` y ella tipeó `TRUPPA` en nombre) — **supuesto**: TRUPPA es el apellido (hay un entrenador TRUPPA ROBERTO en el padrón); y la R9 quedó apuntando a la nueva.

Por qué importa resolverlo ya: el lunes se ratifica R9, el 20/09 corre, y la liquidación de DOCTOR SKY va a caer sobre `484b14a9` mientras la de R8 (saldada) está sobre `380bb7cb`. Dos propietarios para la misma persona → dos recibos, y el historial de R8 no aparece cuando TRUPPA venga a cobrar.

---

## 3. Plan de merge — `migrations/merge_los_urones_duplicada.sql` (NO ejecutado)

Regla: **sobrevive la VIEJA** (tiene R8 y la plata saldada cuelga de su propietario) y **se completa el provisorio** con lo que Yesi cargó. Se borran los tres registros nuevos (no tienen plata: 0 liq, 0 recibos, 0 apoderados).

| paso | qué | filas | por qué en ese orden |
|---|---|---|---|
| 1 | `UPDATE inscripciones SET caballeriza_id = vieja WHERE caballeriza_id = nueva` | 1 (DOCTOR SKY R9) | el trigger `fn_inscripcion_set_propietario` pone `propietario_id = 380bb7cb` en el mismo UPDATE |
| 2 | `DELETE caballeriza_responsables` de la nueva | 1 | |
| 3 | `DELETE propietarios 484b14a9` (con guardas: sin inscripciones/liq/recibos) | 1 | **libera el DNI** en `ux_propietarios_club_doc` antes del paso 4 |
| 4 | `UPDATE propietarios 380bb7cb`: `nombre 'TRUPPA, HUGO FABIAN'`, DNI 24525603, `notas 'ex provisorio R8 15/08 — completado 11/09/2026 …'` | 1 | la marca sale de `notas` → deja de contar como provisorio (41 → 40) |
| 5 | `UPDATE caballeriza_responsables` viejo: nombre/apellido/DNI | 1 | el trigger `fn_caballeriza_resp_set_propietario` busca por DNI en el club y encuentra 380bb7cb (recién cargado) → `propietario_id` no cambia |
| 6 | `UPDATE caballerizas` vieja: `hipodromo_patente 'DOL'`, `responsable 'TRUPPA HUGO FABIAN (propietario)'` | 1 | hereda lo que Yesi cargó |
| 7 | `DELETE caballerizas` nueva (guardas: sin inscripciones ni responsables) | 1 | |

Verificación antes del COMMIT: 1 sola LOS URONES con titular TRUPPA/24525603 → `380bb7cb`; 2 inscripciones (R8 ratificado, R9 inscripto) las dos con `propietario_id 380bb7cb`; conteos **300 / 264 / 40 / 263** (desde 301 / 265 / 41 / 264 de hoy); la liquidación de R8 intacta (1 línea, 100.000, pagado).

**Rollback** (al pie del SQL): recrea la nueva caballeriza y el propietario nuevo **con los mismos ids** (`34fdf68d`, `484b14a9`), vuelve el provisorio a `LOS URONES` sin DNI, re-apunta la R9. Con el orden que respeta el índice único por DNI.

**Decisiones que dejo marcadas para vos**:
1. Nombre `'TRUPPA, HUGO FABIAN'` (supuesto apellido/nombres) — si Yesi dice otra cosa, es un literal.
2. `notas` del ex provisorio: propongo sacarle `provisorio R8` del prefijo (`'ex provisorio R8 15/08 — completado …'`) para que `LIKE 'provisorio R%'` deje de contarlo. No hay precedente: es el **primer provisorio que se completa**. Si preferís conservar el prefijo para trazabilidad, `LIKE` seguiría contándolo (41).
3. Ejecutarlo **antes de la ratificación del lunes 14/09**, así la R9 ya nace derivada del propietario bueno.

**Deuda que este caso deja a la vista**: `caballerizas.html` no avisa parecidos ni tiene unique por nombre → candidato a ISSUE-080 (aviso tipo `profesionales-duplicados.js`, y/o índice único parcial por `(club_id, upper(btrim(nombre)))`). Hoy hay **una** duplicada (LOS URONES); **sin verificar** si hay más por nombre normalizado en las 301 — lo corro si querés.

---

## 4. `migrations/merge_los_urones_duplicada.sql` — contenido completo

```sql
-- ============================================================
-- merge_los_urones_duplicada.sql — unificar las dos "LOS URONES" (la del 18/08 y la que Yesi creó el 11/09)
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo.
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
```

---

## 5. Queda

- Merge de `feat/caballeriza-el-don-jorge-lp` a `main` (con OK): trae el SQL ejecutado de EL DON JORGE y el propuesto de LOS URONES.
- OK para ejecutar el merge de LOS URONES (§3), idealmente antes del lunes.
- Avisar a Yesi: (a) EL DON JORGE (LP) ya está para asignar; (b) para un stud que ya existe sin titular, no crear otro — editar el existente y cargarle el responsable.
