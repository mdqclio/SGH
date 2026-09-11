# PLAN — merge de LOS URONES duplicada (NO ejecutado)

**Fecha:** 2026-09-11 (noche) · **`main`:** `9843e80` (merge `--no-ff` de `feat/caballeriza-el-don-jorge-lp`, ya pusheado — EL DON JORGE ejecutada, este SQL propuesto) · **SQL:** `migrations/merge_los_urones_duplicada.sql` (en `main`)
**Solo lectura** en este informe. Ninguna de las 7 sentencias corrió.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 201 | ✅ |
| ref | `unlhcuanfrtpatoipwve` | ✅ |
| caballerizas / propietarios / provisorios / responsables | 301 / 265 / 41 / 264 | ✅ (post EL DON JORGE) |

---

## 1. Las dos respuestas

### Dirección: **sobrevive la VIEJA y adopta al titular real.** La nueva se borra.

| | VIEJA `6d5138dc-…` (18/08) | NUEVA `34fdf68d-…` (hoy 16:57 AR) |
|---|---|---|
| propietario | `380bb7cb-…` — provisorio R8, **con 1 liquidación de R8** | `484b14a9-…` — "HUGO FABIAN, TRUPPA" (invertido), DNI 24525603, **0 liquidaciones, 0 recibos** |
| inscripciones | DOCTOR SKY **R8 T2** ratificado | DOCTOR SKY **R9 T2** inscripto |
| qué aporta | la historia y la plata | el dato del titular (nombre + DNI) y `hipodromo_patente 'DOL'` |

Por qué en esa dirección y no al revés: la plata está referenciada por **id** de propietario (`liquidaciones.propietario_id` es FK a `propietarios`; `liquidacion_detalle.beneficiario_id` apunta al mismo id sin FK). Mover la historia a la nueva implicaría reescribir `liquidaciones.propietario_id` y `liquidacion_detalle.beneficiario_id` de una línea **ya pagada** — tocar plata saldada para conservar un id que tiene 3 horas de vida. Al revés es un `UPDATE` de nombre y DNI sobre una fila que no tiene plata, y **cero escrituras en las tablas de liquidación**. Es además lo que Fede aprobó el 15/08: el provisorio **se completa**, no se reemplaza.

### La línea de $100.000: **no se toca. Ni la lee.**

```json
liquidaciones:      {"liq_id":"8e9da3e9-fd69-4e5c-a970-9a70284fb438","reunion":8,"estado":"borrador","propietario_id":"380bb7cb-aac3-48a7-974a-328daf47859b","total_neto":100000}
liquidacion_detalle:{"det_id":"8e67d828-c04d-460a-a3e4-8a0fdfa637e5","concepto":"Carrera 1 — Bono 8° puesto","concepto_tipo":"bono","monto_neto":100000,"estado_linea":"pagado","recibo_id":null,"pagado_at":"2026-08-28T15:00:00+00:00","beneficiario_tipo":"propietario","beneficiario_id":"380bb7cb-…","inscripcion_id":"10b4601e-…","spc":"DOCTOR SKY"}
```

Es el bono de 8° de DOCTOR SKY en R8 C1, `pagado` **sin recibo** (`recibo_id NULL`, `pagado_at` 28/08 15:00) = el saldado administrativo del 28/08 (GOTCHA #74/#88). Cuelga de `380bb7cb`. El SQL:

- **no** tiene ninguna sentencia sobre `liquidaciones`, `liquidacion_detalle` ni `recibos`;
- **no** cambia el `id` de `380bb7cb` — le cambia `nombre`, `documento_tipo`, `documento_nro`, `notas`;
- por lo tanto la línea sigue apuntando al mismo propietario, que después del merge se llama **TRUPPA, HUGO FABIAN** con DNI 24525603. Cuando TRUPPA venga a cobrar R9, Pagos lo busca por nombre/DNI, cae en `380bb7cb`, y **ve también la de R8 como pagada**. Sin el merge, la R9 caería en `484b14a9` y la de R8 quedaría huérfana bajo un "LOS URONES" sin documento.

Verificación explícita dentro de la tx (antes del `COMMIT`): la misma query de arriba tiene que devolver **la misma fila, byte a byte**, con `beneficiario_id = 380bb7cb`. Está en el §Verificación del SQL.

### El nombre invertido: corregido en el paso 4 y 5

Yesi tipeó `TRUPPA` en el campo *nombre* y `HUGO FABIAN` en *apellido*; el trigger `fn_caballeriza_resp_set_propietario` arma `concat_ws(', ', apellido, nombre)` → `"HUGO FABIAN, TRUPPA"`. El merge:

- paso 4: `propietarios 380bb7cb` → `nombre = 'TRUPPA, HUGO FABIAN'` (convención del padrón: `APELLIDO, NOMBRES`, muestreo: `DIAZ, MIGUEL FLORENTINO`, `JACQUEMAIN, ALBERTO MARCELO`, …), `documento_tipo 'DNI'`, `documento_nro '24525603'`;
- paso 5: `caballeriza_responsables` (fila vieja) → `apellido = 'TRUPPA'`, `nombre = 'HUGO FABIAN'`, DNI. El trigger BEFORE UPDATE resuelve por DNI dentro del club y encuentra `380bb7cb` (ya con el DNI desde el paso 4) → `propietario_id` no cambia;
- paso 6: `caballerizas.responsable = 'TRUPPA HUGO FABIAN (propietario)'` (formato `buildResponsableText`: `apellido nombre (rol)`).

El propietario mal armado `484b14a9` se **borra** (paso 3), no se corrige: no tiene nada colgado salvo la inscripción de R9, que ya fue re-apuntada en el paso 1.

---

## 2. Qué referencia a lo que se borra — verificado

FKs hacia `propietarios`: `spc_propietarios, inscripciones, liquidaciones, recibos, caballeriza_responsables` (`.propietario_id`). Hacia `caballerizas`: `profesionales, spcs, inscripciones, caballeriza_responsables` (`.caballeriza_id`).

```json
{"inscr_cab_nueva":1,"inscr_prop_nueva":1,"liq_prop_nueva":0,"det_prop_nueva":0,"rec_prop_nueva":0,"spcs_cab_nueva":0,"prof_cab_nueva":0,"spc_prop_nueva":0,"usuarios_entidad":0}
```

Lo único que apunta a la caballeriza nueva o al propietario nuevo es **la inscripción de DOCTOR SKY en R9** (1 fila, las dos columnas). El paso 1 la re-apunta; a partir de ahí los DELETE de los pasos 2, 3 y 7 no rompen ninguna FK, y además llevan `NOT EXISTS` de guarda por si algo se coló entre el plan y la ejecución.

---

## 3. Los 7 pasos, en orden, y por qué ese orden

| # | sentencia | filas | por qué acá |
|---|---|---|---|
| 1 | `UPDATE inscripciones SET caballeriza_id = vieja WHERE caballeriza_id = nueva` | 1 | `trg_insc_set_propietario` (BEFORE UPDATE) pone `propietario_id = 380bb7cb` en la misma sentencia. Tiene que ir **antes** de borrar la caballeriza y el propietario nuevos (FK). |
| 2 | `DELETE caballeriza_responsables WHERE caballeriza_id = nueva` | 1 | libera la FK hacia `484b14a9` y hacia la caballeriza nueva |
| 3 | `DELETE propietarios 484b14a9` (guardas: sin inscripciones / liq / recibos) | 1 | **libera el DNI 24525603** en `ux_propietarios_club_doc (club_id, documento_tipo, documento_nro)` — si el paso 4 fuera antes, chocaría con el unique |
| 4 | `UPDATE propietarios 380bb7cb`: nombre, DNI, `notas 'ex provisorio R8 15/08 — completado 11/09/2026 …'` (`WHERE notas = 'provisorio R8 15/08'`) | 1 | el provisorio se completa. La marca sale del prefijo → `LIKE 'provisorio R%'` deja de contarlo: 41 → 40 |
| 5 | `UPDATE caballeriza_responsables` (vieja, rol propietario, `propietario_id = 380bb7cb`): nombre/apellido/DNI | 1 | después del 4, para que el trigger encuentre `380bb7cb` por DNI y no cree otro propietario |
| 6 | `UPDATE caballerizas` vieja: `hipodromo_patente 'DOL'`, `responsable 'TRUPPA HUGO FABIAN (propietario)'` | 1 | hereda lo que Yesi cargó |
| 7 | `DELETE caballerizas` nueva (guardas: sin inscripciones ni responsables) | 1 | último, ya sin nada colgado |

Verificación antes del `COMMIT` (en el SQL): **1** LOS URONES (`6d5138dc`, DOL, TRUPPA/24525603 → `380bb7cb`, `'TRUPPA, HUGO FABIAN'`); **2** inscripciones sobre ella (R8 ratificado, R9 inscripto) las dos con `propietario_id 380bb7cb`; la liquidación/línea de R8 idéntica; conteos **300 / 264 / 40 / 263**. Si algo no da, `ROLLBACK`. Al ejecutarlo por `apply_migration` va envuelto en un `DO` con esas mismas condiciones como `RAISE`, igual que las tandas de hoy.

---

## 4. Rollback

Al pie del SQL. Recrea la caballeriza nueva y el propietario nuevo **con los mismos ids** (`34fdf68d`, `484b14a9`, así el rastro de lo que cargó Yesi vuelve idéntico), devuelve `380bb7cb` a `LOS URONES` sin DNI / `notas 'provisorio R8 15/08'`, restaura el responsable viejo, quita `hipodromo_patente`/texto de la vieja y re-apunta la inscripción de R9 a la nueva. Orden que respeta el unique por DNI: primero se vacía el DNI del viejo, después se inserta el nuevo con ese DNI. La línea de $100.000 tampoco se toca en el rollback.

Ventana: es seguro **mientras `484b14a9` y `34fdf68d` no vuelvan a tener plata**, o sea hasta que se liquide R9 (20/09). Después del merge eso ya no puede pasar (no existen).

---

## 5. Decisiones que dejo marcadas

1. **Nombre** `'TRUPPA, HUGO FABIAN'` — confirmado por vos. ✅
2. **`notas`**: `'ex provisorio R8 15/08 — completado 11/09/2026 con el titular cargado por Yesi (LOS URONES duplicada, merge)'`. Es el **primer provisorio que se completa**; no hay precedente de formato. Con este texto deja de contar como provisorio. Si preferís que siga contando (prefijo `provisorio R8` intacto), es un literal.
3. **Cuándo**: antes de la ratificación del lunes 14/09 — así la R9 se ratifica ya derivada de `380bb7cb`. (Si Yesi vuelve a guardar esa inscripción antes del merge, el trigger la re-deriva desde la nueva y no pasa nada: el paso 1 la corrige igual.)

---

## 6. `migrations/merge_los_urones_duplicada.sql` — tal como está en `main` @ `9843e80`

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

## 7. Queries de respaldo (hoy, solo lectura)

```sql
select 'liq' k, (select jsonb_agg(jsonb_build_object('liq_id',l.id,'reunion',r.numero,'estado',l.estado,'propietario_id',l.propietario_id,'profesional_id',l.profesional_id,'total_neto',l.total_neto)) from liquidaciones l join reuniones r on r.id=l.reunion_id where l.propietario_id='380bb7cb-aac3-48a7-974a-328daf47859b') v
union all select 'det', (select jsonb_agg(jsonb_build_object('det_id',d.id,'liq_id',d.liquidacion_id,'concepto',d.concepto,'concepto_tipo',d.concepto_tipo,'monto_neto',d.monto_neto,'estado_linea',d.estado_linea,'recibo_id',d.recibo_id,'pagado_at',d.pagado_at,'beneficiario_tipo',d.beneficiario_tipo,'beneficiario_id',d.beneficiario_id,'inscripcion_id',d.inscripcion_id,'spc',(select s.nombre from inscripciones i join spcs s on s.id=i.spc_id where i.id=d.inscripcion_id))) from liquidacion_detalle d where d.beneficiario_tipo='propietario' and d.beneficiario_id='380bb7cb-aac3-48a7-974a-328daf47859b')
union all select 'fk_a_propietarios', (select jsonb_agg(tc.table_name||'.'||kcu.column_name) from information_schema.table_constraints tc join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name where tc.constraint_type='FOREIGN KEY' and ccu.table_name='propietarios')
union all select 'fk_a_caballerizas', (select jsonb_agg(tc.table_name||'.'||kcu.column_name) from information_schema.table_constraints tc join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name where tc.constraint_type='FOREIGN KEY' and ccu.table_name='caballerizas')
union all select 'refs_nuevos', (select jsonb_build_object('inscr_cab_nueva',(select count(*) from inscripciones where caballeriza_id='34fdf68d-fa3b-4591-a93d-7a9a6f753445'),'inscr_prop_nueva',(select count(*) from inscripciones where propietario_id='484b14a9-8d61-4e1c-9769-978bd729fffb'),'liq_prop_nueva',(select count(*) from liquidaciones where propietario_id='484b14a9-8d61-4e1c-9769-978bd729fffb'),'det_prop_nueva',(select count(*) from liquidacion_detalle where beneficiario_id='484b14a9-8d61-4e1c-9769-978bd729fffb'),'rec_prop_nueva',(select count(*) from recibos where propietario_id='484b14a9-8d61-4e1c-9769-978bd729fffb'),'spcs_cab_nueva',(select count(*) from spcs where caballeriza_id='34fdf68d-fa3b-4591-a93d-7a9a6f753445'),'prof_cab_nueva',(select count(*) from profesionales where caballeriza_id='34fdf68d-fa3b-4591-a93d-7a9a6f753445'),'spc_prop_nueva',(select count(*) from spc_propietarios where propietario_id='484b14a9-8d61-4e1c-9769-978bd729fffb'),'usuarios_entidad',(select count(*) from usuarios where entidad_id='484b14a9-8d61-4e1c-9769-978bd729fffb')))
```
```json
[{"k":"liq","v":[{"estado":"borrador","liq_id":"8e9da3e9-fd69-4e5c-a970-9a70284fb438","reunion":8,"total_neto":100000,"profesional_id":null,"propietario_id":"380bb7cb-aac3-48a7-974a-328daf47859b"}]},
 {"k":"det","v":[{"spc":"DOCTOR SKY","det_id":"8e67d828-c04d-460a-a3e4-8a0fdfa637e5","liq_id":"8e9da3e9-fd69-4e5c-a970-9a70284fb438","concepto":"Carrera 1 — Bono 8° puesto","pagado_at":"2026-08-28T15:00:00+00:00","recibo_id":null,"monto_neto":100000,"estado_linea":"pagado","concepto_tipo":"bono","inscripcion_id":"10b4601e-dba0-4772-b4f4-e0755991f34b","beneficiario_id":"380bb7cb-aac3-48a7-974a-328daf47859b","beneficiario_tipo":"propietario"}]},
 {"k":"fk_a_propietarios","v":["spc_propietarios.propietario_id","inscripciones.propietario_id","liquidaciones.propietario_id","recibos.propietario_id","caballeriza_responsables.propietario_id"]},
 {"k":"fk_a_caballerizas","v":["profesionales.caballeriza_id","spcs.caballeriza_id","inscripciones.caballeriza_id","caballeriza_responsables.caballeriza_id"]},
 {"k":"refs_nuevos","v":{"det_prop_nueva":0,"liq_prop_nueva":0,"prof_cab_nueva":0,"rec_prop_nueva":0,"spc_prop_nueva":0,"spcs_cab_nueva":0,"inscr_cab_nueva":1,"inscr_prop_nueva":1,"usuarios_entidad":0}}]
```

---

## 8. Verificación de push

```
$ git ls-remote origin main
9843e8042d472a6d4972717691b7bfb42b556aea	refs/heads/main
$ git push origin reports
$ git ls-remote origin reports
4c20b5182e3f79343a4bf7571f2c513a6706f445	refs/heads/reports
$ git rev-parse HEAD
4c20b5182e3f79343a4bf7571f2c513a6706f445
```
