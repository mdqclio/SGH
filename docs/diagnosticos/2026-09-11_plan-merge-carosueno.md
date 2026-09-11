# PLAN — merge de CAROSUEÑO (DOL) / CAROSUEÑO (NO ejecutado)

**Fecha:** 2026-09-11 (noche) · **`main`:** `1f381c7` · **Branch:** `fix/merge-carosueno` @ `dfbe640` (pusheada) · **SQL:** `migrations/merge_carosueno_duplicada.sql`
**Solo lectura.** Complementa `2026-09-11_barrido-caballerizas-duplicadas.md` §3.3.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 201 | ✅ |
| ref | `unlhcuanfrtpatoipwve` | ✅ |
| `caballerizas` | 300 | ✅ |

---

## 1. Las tres de R9: **NULL las tres.** Es el patrón de R8.

```json
[{"t":7, "spc":"LATIN PRESUMIDA","estado":"inscripto","cab":"46cc818b-…","propietario_id":null,"entrenador":"BRIGANTI MARIA LAURA","jockey":"D'ELIA","created":"10/09 23:59","insc_id":"cdb0ee6c-4f98-443c-adc9-3c9db9cf70ce"},
 {"t":8, "spc":"LATIN PRESUMIDA","estado":"inscripto","cab":"46cc818b-…","propietario_id":null,"entrenador":"BRIGANTI MARIA LAURA","jockey":"D'ELIA","created":"11/09 00:00","insc_id":"33549954-7ea5-41ff-ac3f-0ac1fc7335cb"},
 {"t":10,"spc":"LATIN RAIN",     "estado":"inscripto","cab":"46cc818b-…","propietario_id":null,"entrenador":"BRIGANTI MARIA LAURA","jockey":"D'ELIA","created":"11/09 00:02","insc_id":"f2173cb9-b3e5-433b-be14-6e117c423ae6"}]
```

Las tres apuntan a `CAROSUEÑO (DOL)` (`46cc818b`), que **no tiene responsable** → el trigger no tuvo de dónde derivar → `propietario_id NULL`. Si el domingo alguna de estas dos yeguas se ubica, el motor genera premio/bono para entrenador y jockey y **nada para el propietario** (GOTCHA #47): la plata del dueño no existe en la liquidación. Detalle que lo hace más absurdo: la **entrenadora** de las tres es BRIGANTI MARIA LAURA — la misma persona que es la titular en la otra ficha (`caballeriza_responsables.profesional_id = fe884181`). El sistema le pagaría como entrenadora y no como dueña.

Las 4 de R6 (T3 forfait, T5 y T9 ratificadas con resultado oficial, T10 inscripto) están igual: `propietario_id NULL`, y **cero líneas de liquidación** para esas 4 inscripciones (`liquidacion_detalle.inscripcion_id` → 0). O sea que en R6 este stud ya quedó afuera de la liquidación del propietario. No hay plata que tocar porque nunca se generó.

---

## 2. Dirección: **sobrevive `CAROSUEÑO (DOL)` (la de la historia) y recibe al titular.** La otra se borra.

| | HISTORIA `46cc818b` | TITULAR `e6830f69` |
|---|---|---|
| nombre / `hipodromo_patente` / domicilio | `CAROSUEÑO (DOL)` / NULL / NULL | `CAROSUEÑO` / `DOL` / `LOBOS` |
| `notas` | "Alta para inscripciones reunión 2026-06-20 (planilla Yesica)" | NULL |
| responsables | **0** | 1: BRIGANTI MARIA LAURA, DNI 27122763 → propietario `a7b7fe52` (`"BRIGANTI, MARIA LAURA"`), `profesional_id fe884181` |
| `spcs.caballeriza_id` | LATIN RAIN, LATIN PRESUMIDA | 0 |
| inscripciones | **7** (4 R6 + 3 R9) | 0 |
| plata | 0 líneas | propietario `a7b7fe52`: 0 liquidaciones, 0 recibos, 0 inscripciones |

Con el criterio de LOS URONES — *no tocar plata saldada, que las inscripciones queden derivando al propietario correcto* — acá **no hay plata en ningún lado**, así que el criterio se reduce al segundo punto y a mover lo menos posible:

- **Quedarse con la historia** = mover **1 fila** (`caballeriza_responsables ef52073e` cambia de `caballeriza_id`) + 1 UPDATE cosmético a la superviviente + 1 DELETE de una ficha vacía. Los 2 SPC y las 7 inscripciones **no se tocan** salvo la re-derivación de `propietario_id`.
- **Quedarse con el titular** (la inversa) = mover 2 SPC + 7 inscripciones (4 de ellas en R6, carreras **oficializadas**; un UPDATE ahí dispara auditoría y re-derivación sobre filas de una reunión cerrada) + borrar la que tiene las notas de origen. Mismo resultado final, 9 escrituras sobre filas vivas en vez de 1.

Es exactamente el mismo razonamiento que en LOS URONES (allá la historia tenía además la plata; acá sólo la historia), sólo que la fila con historia es la del sufijo. El sufijo `(DOL)` en el nombre se limpia en el paso 2, y `hipodromo_patente` pasa a `'DOL'` — que es donde el dato tiene que estar (tu criterio de EL DON JORGE).

**Nota sobre el trigger al mover el responsable**: `fn_caballeriza_resp_set_propietario` (BEFORE UPDATE en `caballeriza_responsables`) se dispara en el paso 1; como `documento_nro` no es NULL, busca `propietarios` por (club, DNI 27122763) → encuentra `a7b7fe52` → `NEW.propietario_id` queda igual. No crea nada.

---

## 3. Re-derivación — 7 filas, y por qué también las de R6

`fn_inscripcion_set_propietario` corre BEFORE UPDATE **en cualquier UPDATE** de la inscripción y recalcula desde `caballeriza_responsables(rol='propietario', activo)`. Después del paso 1 la caballeriza `46cc818b` tiene ese responsable, así que:

- Cualquier guardado posterior de Yesi sobre esas inscripciones (asignar jockey, ratificar el lunes) las derivaría solas. **Pero no hay que depender de eso**: si una de las tres no se toca hasta el domingo, llega a la liquidación con NULL. Por eso el paso 4 las deriva explícitamente ahora — misma forma que B6 del runbook de R8, acotado a esta caballeriza y a `propietario_id IS NULL`.
- **Las 4 de R6** entran en el mismo UPDATE. No cambia ninguna plata (no hay líneas de este stud en R6) y deja el historial diciendo la verdad: esas dos yeguas eran de BRIGANTI cuando corrieron. Si alguna vez se re-liquida R6 (el motor es paid-safe), a BRIGANTI le saldrían sus líneas de propietaria — que es lo correcto, no un riesgo. Si preferís acotar el paso 4 a R9 (3 filas), es agregar `AND i.carrera_id IN (SELECT id FROM carreras WHERE reunion_id = 'cafa37d6-…')`; lo dejo marcado como decisión.

Esperado del paso 4: **7 filas**. Verificación en la tx: las 7 con `propietario_id = a7b7fe52`.

---

## 4. Los 4 pasos

| # | qué | filas | guarda |
|---|---|---|---|
| 1 | `UPDATE caballeriza_responsables SET caballeriza_id = 46cc818b WHERE id = ef52073e AND caballeriza_id = e6830f69 AND propietario_id = a7b7fe52` | 1 | trigger resuelve por DNI → mismo propietario |
| 2 | `UPDATE caballerizas 46cc818b`: `nombre 'CAROSUEÑO'`, `hipodromo_patente 'DOL'`, `domicilio 'LOBOS'`, `responsable 'BRIGANTI MARIA LAURA (propietario)'`, `notas` + marca del merge | 1 | `WHERE nombre = 'CAROSUEÑO (DOL)'` |
| 3 | `DELETE caballerizas e6830f69` con `NOT EXISTS` sobre responsables / inscripciones / spcs / profesionales | 1 | ya sin nada colgado (paso 1 la vació) |
| 4 | `UPDATE inscripciones SET propietario_id = cr.propietario_id … WHERE caballeriza_id = 46cc818b AND propietario_id IS NULL` | 7 | |

Verificación antes del `COMMIT`: 1 sola CAROSUEÑO (por nombre normalizado); titular activo BRIGANTI/27122763 → `a7b7fe52`; 7 inscripciones con `propietario_id = a7b7fe52`; `caballerizas` 299, `propietarios` 264 (sin cambio), `responsables` 263 (sin cambio), **`liquidaciones` y `liquidacion_detalle` sin cambio de conteo**. Al ejecutar por `apply_migration` va en un `DO` con `ROW_COUNT` por paso (1/1/1/7) y esas condiciones como `RAISE`.

**Rollback** al pie del SQL: recrea `e6830f69` con el mismo id, devuelve el responsable, restaura nombre/notas de `46cc818b`, y pone `propietario_id = NULL` en las 7 (el trigger, al no encontrar responsable en `46cc818b`, lo confirma).

---

## 5. Cuándo

Antes de la ratificación del lunes 14/09 — así las tres de R9 se ratifican ya derivadas, y cualquier guardado de Yesi las mantiene. Sin dependencia de LOS URONES ni de los otros pares.

Nota lateral: el conteo de "la fila con historia" incluye **LATIN PRESUMIDA en T7 y T8** — doble categoría, se resuelve el lunes como las demás; no afecta el merge.

---

## 6. `migrations/merge_carosueno_duplicada.sql` — contenido completo

```sql
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
```

---

## 7. Queries de respaldo (hoy, solo lectura)

```sql
select 'r9' k, (select jsonb_agg(jsonb_build_object('insc_id',i.id,'t',ca.numero_turno,'spc',s.nombre,'estado',i.estado,'cab',i.caballeriza_id,'propietario_id',i.propietario_id,'entrenador',(select apellido||' '||coalesce(nombre,'') from profesionales where id=i.entrenador_id),'jockey',(select apellido from profesionales where id=i.jockey_titular_id),'created',to_char(i.created_at at time zone 'America/Argentina/Buenos_Aires','DD/MM HH24:MI')) order by ca.numero_turno) from inscripciones i join carreras ca on ca.id=i.carrera_id join spcs s on s.id=i.spc_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.caballeriza_id in ('46cc818b-aac4-4d39-b3c9-0b0c156fc6cc','e6830f69-2474-4d98-881a-2fcddc56b1b4')) v
union all select 'r6_inscr', (select jsonb_agg(jsonb_build_object('insc_id',i.id,'t',ca.numero_turno,'spc',s.nombre,'estado',i.estado,'propietario_id',i.propietario_id,'posicion',(select rp.posicion from resultado_posiciones rp where rp.inscripcion_id=i.id),'res_estado',(select r.estado from resultados r where r.carrera_id=ca.id),'lineas',(select jsonb_agg(jsonb_build_object('tipo',d.concepto_tipo,'benef',d.beneficiario_tipo,'monto',d.monto_neto,'estado',d.estado_linea)) from liquidacion_detalle d where d.inscripcion_id=i.id)) order by ca.numero_turno) from inscripciones i join carreras ca on ca.id=i.carrera_id join reuniones re on re.id=ca.reunion_id join spcs s on s.id=i.spc_id where re.numero=6 and i.caballeriza_id='46cc818b-aac4-4d39-b3c9-0b0c156fc6cc')
union all select 'refs', (select jsonb_build_object('prof_dol',(select count(*) from profesionales where caballeriza_id='46cc818b-aac4-4d39-b3c9-0b0c156fc6cc'),'prof_plain',(select count(*) from profesionales where caballeriza_id='e6830f69-2474-4d98-881a-2fcddc56b1b4'),'spcs_plain',(select count(*) from spcs where caballeriza_id='e6830f69-2474-4d98-881a-2fcddc56b1b4'),'inscr_plain',(select count(*) from inscripciones where caballeriza_id='e6830f69-2474-4d98-881a-2fcddc56b1b4'),'resp_dol',(select count(*) from caballeriza_responsables where caballeriza_id='46cc818b-aac4-4d39-b3c9-0b0c156fc6cc'),'resp_plain',(select jsonb_agg(to_jsonb(r)) from caballeriza_responsables r where r.caballeriza_id='e6830f69-2474-4d98-881a-2fcddc56b1b4')))
union all select 'briganti', (select jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'doc',documento_nro,'notas',notas,'club',club_id,'n_inscr',(select count(*) from inscripciones where propietario_id=p.id),'n_liq',(select count(*) from liquidaciones where propietario_id=p.id),'n_spc_prop',(select count(*) from spc_propietarios where propietario_id=p.id))) from propietarios p where documento_nro='27122763' or nombre ilike '%BRIGANTI%')
union all select 'cab_rows', (select jsonb_agg(to_jsonb(c)) from caballerizas c where c.id in ('46cc818b-aac4-4d39-b3c9-0b0c156fc6cc','e6830f69-2474-4d98-881a-2fcddc56b1b4'))
```
```json
[{"k":"r9","v":[…las 3 filas de §1…]},
 {"k":"r6_inscr","v":[{"t":3,"spc":"LATIN RAIN","estado":"forfait","lineas":null,"insc_id":"2fbbf2ec-cf5b-4bdc-b5c6-b7818235fe54","posicion":null,"res_estado":"provisional","propietario_id":null},{"t":5,"spc":"LATIN RAIN","estado":"ratificado","lineas":null,"insc_id":"7c4d1517-542b-4b1a-9d1f-f236d3eabd48","posicion":null,"res_estado":"oficial","propietario_id":null},{"t":9,"spc":"LATIN PRESUMIDA","estado":"ratificado","lineas":null,"insc_id":"615e796b-6c0e-4b2f-b0e0-0a822fd1c442","posicion":null,"res_estado":"oficial","propietario_id":null},{"t":10,"spc":"LATIN PRESUMIDA","estado":"inscripto","lineas":null,"insc_id":"79ee695c-dd71-42d2-a9aa-3da619939599","posicion":null,"res_estado":null,"propietario_id":null}]},
 {"k":"refs","v":{"prof_dol":0,"resp_dol":0,"prof_plain":0,"resp_plain":[{"id":"ef52073e-e9d9-4275-aa75-b36781499d85","rol":"propietario","activo":true,"nombre":"MARIA LAURA","apellido":"BRIGANTI","localidad":"LOBOS","created_at":"2026-05-11T01:29:31.349892","porcentaje":null,"documento_nro":"27122763","caballeriza_id":"e6830f69-2474-4d98-881a-2fcddc56b1b4","documento_tipo":"DNI","profesional_id":"fe884181-0da8-49ad-8a84-f015045bc781","propietario_id":"a7b7fe52-bb01-4576-9fc4-0b815ad94aaf","fecha_nacimiento":"1979-02-19"}],"spcs_plain":0,"inscr_plain":0}},
 {"k":"briganti","v":[{"id":"a7b7fe52-bb01-4576-9fc4-0b815ad94aaf","doc":"27122763","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","n_liq":0,"notas":null,"nombre":"BRIGANTI, MARIA LAURA","n_inscr":0,"n_spc_prop":0}]},
 {"k":"cab_rows","v":[{"id":"46cc818b-aac4-4d39-b3c9-0b0c156fc6cc","notas":"Alta para inscripciones reunión 2026-06-20 (planilla Yesica)","activo":true,"estado":"activo","nombre":"CAROSUEÑO (DOL)","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","telefono":null,"domicilio":null,"responsable":null,"chaquetilla_url":null,"hipodromo_patente":null,"chaquetilla_descripcion":null},{"id":"e6830f69-2474-4d98-881a-2fcddc56b1b4","notas":null,"activo":true,"estado":"activo","nombre":"CAROSUEÑO","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","telefono":null,"domicilio":"LOBOS","responsable":"BRIGANTI MARIA LAURA (propietario)","chaquetilla_url":null,"hipodromo_patente":"DOL","chaquetilla_descripcion":null}]}]
```
(`posicion: null` en las de R6 con resultado oficial: **sin verificar** si fue `no_largo` o resultado sin cargar para esas dos; en cualquier caso no hay líneas.)
