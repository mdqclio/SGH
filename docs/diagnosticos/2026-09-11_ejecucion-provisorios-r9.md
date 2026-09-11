# Provisorios R9 — EJECUTADO · R9 sin ninguna inscripción con caballeriza y sin dueño

**Fecha:** 2026-09-11 (noche) · **`main`:** `c64fdc3` · **Branch:** `feat/provisorios-r9` @ `c97f2f0` (pusheada, **sin mergear** — con tu OK; trae el SQL marcado EJECUTADA con el bloque `DO` re-ejecutable y la entrada de CHANGELOG) · **Plan:** `2026-09-11_r9-cuadro-72-y-plan-provisorios.md`
**Escritura:** una — `apply_migration propietarios_provisorios_r9`.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 201 | ✅ |
| ref | `unlhcuanfrtpatoipwve` | ✅ |
| propietarios / provisorios / responsables / liq / det antes | 264 / 40 / 263 / 189 / 493 | ✅ |

---

## 1. Pre-chequeo data-driven (la misma consulta que usa el `DO`)

```json
[{"k":"falta","v":["2 DE ABRIL MAIPU","Abuelo Calin","HARAS EL ORIGEN","LA COLONIA","LOS 6 CORAZONES","MONTE DEL TORDILLO","SAICA"]},
 {"k":"n_cabs","v":7},
 {"k":"inscr_null_por_reunion","v":{"6":8,"8":5,"9":8}},
 {"k":"inscr_null_total","v":21},
 {"k":"con_titular_y_null","v":0},
 {"k":"homonimos","v":0},
 {"k":"counts","v":{"det":493,"liq":189,"r9_total":76,"r9_sin_cab":8,"provisorios":40,"propietarios":264,"responsables":263}}]
```

7 caballerizas; **21** inscripciones sin dueño sobre ellas (R6 8 — no 9 como decía el plan, error mío de suma —, R8 5, R9 8); 0 con titular y NULL (trigger sano); 0 homónimos. R9 ya iba por **76** (Yesi cargó 4 más desde el cuadro de las 72).

---

## 2. Ejecución — condiciones de parada, calculadas adentro del `DO`

Ningún id ni conteo hardcodeado: el bloque arma `TEMP TABLE falta` con la misma regla, cuenta `n_cabs` y `n_null` **antes** de escribir, y cada paso tiene que coincidir con eso.

| guarda | esperado (calculado) | resultado |
|---|---|---|
| `n_cabs = 0` → abortar ("nada que hacer") | — | 7, sigue |
| inscripciones de R9 con titular activo y `propietario_id NULL` | 0 | ✅ 0 |
| propietarios homónimos de las caballerizas de `falta` | 0 | ✅ 0 |
| `INSERT propietarios` = `n_cabs` | 7 | ✅ 7 |
| `INSERT caballeriza_responsables` = `n_cabs` | 7 | ✅ 7 |
| **re-derivación = `n_null`** (todas las reuniones) | **21** | ✅ **21** |
| quedan inscripciones NULL sobre esas caballerizas | 0 | ✅ 0 |
| R9 con caballeriza y sin propietario | 0 | ✅ 0 |
| caballerizas con >1 titular activo | 0 | ✅ 0 |
| propietarios / responsables | +7 / +7 | ✅ 271 / 270 |
| liquidaciones / líneas | sin cambio | ✅ 189 / 493 |

`{"success":true}`. Marca: **`'provisorio R9 11/09'`** (fecha real de ejecución; misma marca que EL DON JORGE, de hoy).

---

## 3. Estado final

```json
nuevos: [
 {"cab":"2 DE ABRIL MAIPU","prop":"2 DE ABRIL MAIPU","prop_id":"ddad6fce-5455-4f22-8a34-667049c12b3a","notas":"provisorio R9 11/09","doc":null,"resp_rol":"propietario","resp_activo":true,"inscr_derivadas":{"6":1,"9":1}},
 {"cab":"Abuelo Calin","prop":"Abuelo Calin","prop_id":"07e9bbaa-f32f-4a34-8e5f-bb9e7140780b","notas":"provisorio R9 11/09","doc":null,"resp_rol":"propietario","resp_activo":true,"inscr_derivadas":{"6":1,"9":1}},
 {"cab":"EL DON JORGE (LP)","prop":"EL DON JORGE (LP)","prop_id":"7ae60b44-…","notas":"provisorio R9 11/09","doc":null,"resp_rol":"propietario","resp_activo":true,"inscr_derivadas":null},   ← el de esta tarde, misma marca; sin inscripciones todavía
 {"cab":"HARAS EL ORIGEN","prop":"HARAS EL ORIGEN","prop_id":"fc87cecb-da4e-4b6a-b926-d8cc0d061e3e","notas":"provisorio R9 11/09","doc":null,"resp_rol":"propietario","resp_activo":true,"inscr_derivadas":{"6":3,"8":4,"9":1}},
 {"cab":"LA COLONIA","prop":"LA COLONIA","prop_id":"cb9f818e-3009-4511-a170-393507920788","notas":"provisorio R9 11/09","doc":null,"resp_rol":"propietario","resp_activo":true,"inscr_derivadas":{"6":1,"9":1}},
 {"cab":"LOS 6 CORAZONES","prop":"LOS 6 CORAZONES","prop_id":"eeeda994-2bec-4ec0-bcf5-6852231e6afe","notas":"provisorio R9 11/09","doc":null,"resp_rol":"propietario","resp_activo":true,"inscr_derivadas":{"6":1,"9":1}},
 {"cab":"MONTE DEL TORDILLO","prop":"MONTE DEL TORDILLO","prop_id":"298aa5ca-1f18-4ec2-a0e2-1afc5a37f36d","notas":"provisorio R9 11/09","doc":null,"resp_rol":"propietario","resp_activo":true,"inscr_derivadas":{"6":1,"9":2}},
 {"cab":"SAICA","prop":"SAICA","prop_id":"0f9e7621-5139-493b-bcea-3b68f0c277d5","notas":"provisorio R9 11/09","doc":null,"resp_rol":"propietario","resp_activo":true,"inscr_derivadas":{"8":1,"9":1}}]
r9_estado: {"total":76,"con_prop":68,"con_cab_sin_prop":0,"sin_cab":8}
r9_sin_cab: [{"t":3,"spc":"MARIA CATULENGA"},{"t":4,"spc":"NIÑO OCEANICO"},{"t":7,"spc":"EL RISKO"},{"t":7,"spc":"ATOMIZADOR"},{"t":9,"spc":"THE BEAST PARTY"},{"t":10,"spc":"INDIANA MARO"},{"t":10,"spc":"ABARAJALA"},{"t":11,"spc":"GOIADORA"}]
counts: {"propietarios":271,"provisorios":47,"responsables":270,"liq":189,"det":493,"multi_titular":0}
```

**R9: 76 inscripciones · 68 con propietario · 0 con caballeriza y sin propietario · 8 sin caballeriza** (los SPC de hoy; cuando Yesi les ponga stud, derivan solas si el stud tiene titular — y si no lo tiene, §4).

Provisorios con marca `provisorio R%`: **47** = 40 (R8) − 1 (TRUPPA completado hoy) + 1 (EL DON JORGE) + 7. Formato de los 7 idéntico a los 40 de R8 (verificado en la salida: `persona`, `doc null`, `notas`, `rol propietario`, `activo`).

Las 13 de R6/R8 re-derivadas (HARAS EL ORIGEN 7, SAICA 1, y 1 de cada una de las otras cinco en R6) no generaron ni tocaron ninguna línea de liquidación — `189 / 493` antes y después. Sólo historial.

---

## 4. Re-ejecutable, como pediste

El bloque `DO` está en `migrations/propietarios_provisorios_r9.sql` (§ EJECUTADO, al final del archivo). Para volver a correrlo entre hoy y el lunes:

1. cambiar `marca := 'provisorio R9 11/09'` a la fecha del día;
2. `apply_migration` (o SQL Editor) con el bloque tal cual.

Se calcula la lista al correr: agarra cualquier caballeriza de Dolores que **en ese momento** tenga una inscripción en R9 sin dueño y ningún titular activo. Si no hay ninguna, aborta con "nada que hacer" (no deja rastro). No duplica: el `INSERT propietarios` tiene `NOT EXISTS` por nombre + marca `provisorio R%`, y el `INSERT responsables` sólo actúa sobre `falta` (que por definición no tiene titular). Las 8 sin caballeriza de hoy son el caso típico: ABARAJALA (MONGAY) y ATOMIZADOR (MARTIN) tienen entrenador cargado y stud pendiente — **sin verificar** si esos studs tienen titular.

Control final del lunes, después de ratificar (una línea):
```sql
select count(*) from inscripciones i join carreras ca on ca.id=i.carrera_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.estado='ratificado' and i.propietario_id is null;
-- 0 = ningún ratificado corre sin dueño
```

---

## 5. Queda

1. Merge de `feat/provisorios-r9` a `main` — con tu OK.
2. Lunes 14/09 post-ratificación: re-correr el `DO` si hace falta + la query de control (§4).
3. Los otros tres pares del barrido (LA NARCISA, SANTA BARBARA, EL LINYE Y RAMI) — sin urgencia de R9.
4. ISSUE-080 (pantalla no guía a completar / no avisa parecidos): abierto.

---

## 6. Verificación de push

```
$ git ls-remote origin feat/provisorios-r9
c97f2f029e412fb39c33aac877920e47b4829300	refs/heads/feat/provisorios-r9
$ git push origin reports
$ git ls-remote origin reports
8ef9e817c9176f232307388ff5e6c30964e06eb1	refs/heads/reports
$ git rev-parse HEAD
8ef9e817c9176f232307388ff5e6c30964e06eb1
```
