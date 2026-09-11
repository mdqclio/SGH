# LOS URONES — merge EJECUTADO · ISSUE-080 abierto

**Fecha:** 2026-09-11 (noche) · **`main`:** `9843e80` · **Branch docs:** `chore/issue-080-caballerizas-duplicadas` @ `5a3a385` (pusheada, sin mergear: ISSUE-080 + SQL marcado EJECUTADA + CHANGELOG) · **Plan:** `2026-09-11_plan-merge-los-urones.md`
**Escritura:** una — `apply_migration merge_los_urones_duplicada`.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 201 | ✅ |
| ref | `unlhcuanfrtpatoipwve` | ✅ |
| caballerizas / propietarios / provisorios / responsables antes | 301 / 265 / 41 / 264 | ✅ |

---

## 1. Condiciones de parada (las tuyas) — todas dentro de la transacción

Ejecuté los 7 pasos del plan envueltos en **un solo `DO`** con estas guardas, cada una con `RAISE EXCEPTION` (= rollback de todo):

| guarda | cómo | resultado |
|---|---|---|
| línea de $100.000 idéntica | `to_jsonb(liquidacion_detalle 8e67d828)` **antes** del paso 1 y **después** del paso 7; `IF v_despues IS DISTINCT FROM v_antes THEN RAISE` | ✅ idéntica |
| `beneficiario_id = 380bb7cb` | chequeado antes (si no, ni arranca) y después | ✅ |
| cada paso afecta exactamente 1 fila | `GET DIAGNOSTICS ROW_COUNT` en los 7 | ✅ 1/1/1/1/1/1/1 |
| queda **una** LOS URONES | `count(*) = 1` | ✅ |
| las 2 inscripciones (R8 + R9) derivan a `380bb7cb` | `count(*) = 2` | ✅ |
| responsable viejo con DNI y `propietario_id 380bb7cb` | `count(*) = 1` | ✅ |
| conteos | 300 / 264 / 40 / 263 | ✅ |

`{"success":true}`.

---

## 2. Estado final (query post, solo lectura)

```json
LOS URONES (única): {"id":"6d5138dc-a13e-4fb1-8bde-c8e52e148dd2","nombre":"LOS URONES","hip":"DOL","resp_txt":"TRUPPA HUGO FABIAN (propietario)","cr_nombre":"HUGO FABIAN","cr_apellido":"TRUPPA","cr_dni":"24525603","cr_prop":"380bb7cb-aac3-48a7-974a-328daf47859b","prop_nombre":"TRUPPA, HUGO FABIAN","prop_dni":"24525603","prop_notas":"ex provisorio R8 15/08 — completado 11/09/2026 con el titular cargado por Yesi (LOS URONES duplicada, merge)"}

inscripciones sobre ella: [{"reunion":8,"turno":2,"spc":"DOCTOR SKY","estado":"ratificado","cab":"6d5138dc-…","prop":"380bb7cb-…"},{"reunion":9,"turno":2,"spc":"DOCTOR SKY","estado":"inscripto","cab":"6d5138dc-…","prop":"380bb7cb-…"}]

línea 8e67d828 (después): {"id":"8e67d828-c04d-460a-a3e4-8a0fdfa637e5","concepto":"Carrera 1 — Bono 8° puesto","posicion":8,"pagado_at":"2026-08-28T15:00:00+00:00","recibo_id":null,"carrera_id":"41ff3ee7-4464-468e-b5ed-988a921d8cad","monto_neto":100000,"reunion_id":"7b6e003e-22e2-4629-bf55-f18560b1260f","descripcion":"Bono 8° puesto (100% propietario): $100.000,00 [REGULARIZACION 2026-08-28: saldado administrativo pre-sistema, sin recibo; estado previo=impago]","monto_bruto":100000,"estado_linea":"pagado","concepto_tipo":"bono","orden_display":1,"inscripcion_id":"10b4601e-dba0-4772-b4f4-e0755991f34b","liquidacion_id":"8e9da3e9-fd69-4e5c-a970-9a70284fb438","beneficiario_id":"380bb7cb-aac3-48a7-974a-328daf47859b","monto_descuento":0,"porcentaje_desc":null,"fecha_liberacion":null,"beneficiario_tipo":"propietario"}

conteos: {"caballerizas":300,"propietarios":264,"provisorios":40,"responsables":263,"nuevo_cab":0,"nuevo_prop":0}
```

La línea "después" es la misma que la "antes" del pre-chequeo (campo por campo, incluido `descripcion` con la marca de regularización del 28/08). `34fdf68d` y `484b14a9` ya no existen.

Lo que ve Yesi ahora: **una** LOS URONES, hipódromo DOL, responsable "TRUPPA HUGO FABIAN (propietario)"; en Pagos, TRUPPA HUGO FABIAN con DNI 24525603 tiene la de R8 pagada y la de R9 por venir, bajo el mismo beneficiario.

---

## 3. Anotado como pediste — ISSUE-080

`docs/ISSUES.md` → **ISSUE-080: `caballerizas.html` no guía a completar un provisorio — Yesi creó una caballeriza duplicada para cargar al titular** (branch `chore/issue-080-caballerizas-duplicadas`). Con el caso concreto tal como lo dijiste:

- primer provisorio de los 41 que se completa con datos reales — y se hizo por SQL, no por la pantalla;
- el camino de Yesi fue crear una caballeriza nueva en vez de completar el provisorio existente;
- segundo duplicado del día por el mismo motivo;
- por qué la pantalla lo permite (sin unique por nombre, sin aviso de parecidos, sin rótulo de "titular provisorio — completar", campos apellido/nombre sin guía);
- tres propuestas independientes: aviso de parecidos tipo `profesionales-duplicados.js` con botón "Abrir esa"; rótulo + atajo a completar el responsable provisorio; índice único parcial `(club_id, upper(btrim(nombre)))` después de barrer duplicados.

También en esa rama: `migrations/merge_los_urones_duplicada.sql` marcado **EJECUTADA**, y la entrada `[2026-09-11 noche, 2]` en `CHANGELOG.md` (EL DON JORGE + merge + ISSUE-080). **Merge a `main` con tu OK.**

---

## 4. Queda

1. Merge de `chore/issue-080-caballerizas-duplicadas` a `main`.
2. Barrido de duplicados por nombre normalizado en las 300 caballerizas (para saber si LOS URONES era la única antes de pensar el índice único). No lo corrí.
3. Convención de `notas` para provisorios completados: usé `'ex provisorio R8 15/08 — completado <fecha> …'` (sale del `LIKE 'provisorio R%'`). Primer caso; si te sirve, queda como regla para los 40 que faltan.

---

## 5. Verificación de push

```
$ git ls-remote origin chore/issue-080-caballerizas-duplicadas
5a3a3855409276fab35f078929231e8c52de431a	refs/heads/chore/issue-080-caballerizas-duplicadas
$ git push origin reports
$ git ls-remote origin reports
878ef8d465700917c7ad56dfad421779b6b84f2a	refs/heads/reports
$ git rev-parse HEAD
878ef8d465700917c7ad56dfad421779b6b84f2a
```
