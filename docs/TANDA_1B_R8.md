# R8 — Tanda 1b: respuestas de Yesi a los dudosos de la tanda 1

**Fecha**: 2026-08-04 · **Branch**: `fix/spcs-r8-tanda-1b` (sale de `fix/spcs-r8-tanda-1`)
**Circuito**: [`docs/CIRCUITO_ALTA_SPCS_R8.md`](CIRCUITO_ALTA_SPCS_R8.md) · **Tanda anterior**: [`TANDA_1_R8.md`](TANDA_1_R8.md)

## Guard

| chequeo | valor |
|---|---|
| `pwd` | `/home/clio/dev/SGH` |
| project ref | `unlhcuanfrtpatoipwve` |
| `SELECT count(*) FROM spcs` | **156** (39 con `studbook_id`) |
| snapshot | `data/spcs_snapshot.json` — 156 filas, coincide con la base |
| selftest scraper | **16/16 OK**, exit 0 |

---

## 1. Los 4 dudosos de la tanda 1 — cómo quedaron

| pedido original | respuesta de Yesi | acción |
|---|---|---|
| `LOGARCIUS` | No era typo: el nombre real es **`LOGUACIOUS`** | ✅ scrapeado, **alta propuesta** |
| `SOY RICARDO` | Confirmado el del **2022, sb `434608`** | ✅ **alta propuesta** (homónimo resuelto) |
| `GRAND VUETERA` | Es **`GRAND VUELTERA`**, que ya existe | ⛔ **resuelto sin alta** — ver §3 |
| `WISKA KEN` | Es **`WISLA KEN`**, ya cargado (sb `433894`) | ⛔ **resuelto sin alta** — ver §4 |

**Los 4 dudosos de la tanda 1 quedaron cerrados**: 2 con alta, 2 sin alta por ser typos de
la planilla contra ejemplares que ya estaban.

## 2. Altas propuestas (2)

| nombre SB | sb_id | nac | sexo | pelaje | padre | madre | nota |
|---|---|---|---|---|---|---|---|
| LOGUACIOUS | 431567 | 2021-10-23 | hembra | Zaino | Le Blues | Effervesence | — |
| SOY RICARDO | 434608 | 2022-08-01 | macho | Alazan | El Moises | Western Dream | homónimo desambiguado por Yesi |

Cero casos no resueltos en esta corrida. SQL en `migrations/spcs_r8_tanda_1b.sql`,
evidencia en `data/spcs_r8_tanda_1b_scrape.json`.

Los datos de `SOY RICARDO` coinciden exactamente con el candidato `434608` que el reporte
de la tanda 1 le había listado a Yesi (2022-08-01 · Alazan · El Moises × Western Dream),
así que la elección es sobre el mismo ejemplar que vio.

### Cambio en el scraper: `sb=NNNN` en el archivo de nombres

`tools/sb_alta_spcs.py` ahora acepta `NOMBRE | sb=NNNN` para los homónimos que Yesi ya
resolvió. Sigue valiendo la regla del circuito — **el script no desambigua solo**: sólo
obedece una elección hecha por una persona y registrada en el archivo de entrada, y
verifica que ese `sb_id` esté entre los matches exactos que devuelve el SB. Si no está,
no da de alta: nuevo caso **`PIN_NO_MATCHEA`**, que vuelve a Yesi.

```
data/r8_tanda_1b.txt
  LOGUACIOUS
  SOY RICARDO | sb=434608
```

## 3. `GRAND VUETERA` — resuelto sin alta

Yesi confirmó que es **`GRAND VUELTERA`**, ya en la base
(`id e1b371d4-4326-4ebb-976d-81a016538cb6`). Era typo de la planilla. **No se da de alta**
y se saca de la lista de pendientes.

⚠️ Nota aparte, no se tocó: ese registro **no tiene `studbook_id`**. Es parte del backlog
de SPCs sin vincular al Stud Book, no un problema de esta tanda.

## 4. `WISKA KEN` — resuelto sin alta

Yesi confirmó que es **`WISLA KEN`**, ya cargado. Era typo de la planilla (`K`/`L`), el
mismo patrón que `GRAND VUETERA`. **No se da de alta.**

Fila en la base, verificada el 04/08:

| campo | valor |
|---|---|
| `id` | `29db5000-920f-4185-9cc7-2d310d584b78` |
| `nombre` | WISLA KEN |
| `studbook_id` | 433894 |
| `fecha_nacimiento` | 2021-09-28 |
| `sexo` / `color` | hembra / Zaino |
| padre / madre | Le Ken × Wilkenia |
| `estado` | activo |

Fila única — no hay duplicado por nombre ni por `studbook_id`. Que el SB no devuelva
ningún match exacto para `WISKA KEN` es coherente con que el nombre correcto sea el otro.

Con esto **no queda ningún SPC pendiente** de la tanda 1.

---

## 5. Dato de dominio: inscripciones múltiples

Yesi confirmó que **un caballo se anota en varias categorías** hasta que el **lunes previo**
la secretaría decide en cuál queda. Es proceso normal, **no** error de carga.

Verificado contra el schema y contra los datos:
- El único constraint es `inscripciones_carrera_id_spc_id_key` = `UNIQUE (carrera_id, spc_id)`
  — **por carrera, no por reunión**. El schema ya lo permite.
- En prod, **R6 del 20/06 tiene 13 ejemplares anotados en 2 turnos cada uno**
  (BELLO PRESAGIO 7/11, DESDEN 2/5, DOCTORA MIA 3/5, EL BORJA 2/5, HEART OF GOLD 2/5,
  LATIN PRESUMIDA 9/10, LATIN RAIN 3/5, LE BIRD 7/11, MAESTRO DE ARMAS 4/5,
  NO TIENE CONTRAS 7/11, QUIET GAUCHO 9/11, THE SULTAN 2/5, VISION SECURITY 2/5).

Documentado en:
- **`docs/GOTCHAS.md` #69** — la regla, la evidencia y las tres consecuencias
  (no agregar unique por reunión; los conteos por caballo/reunión sobrecuentan; después
  de la ratificación se resuelve solo vía `forfait`/`mal_inscrito`).
- **`docs/ISSUES.md` ISSUE-048** — requisito de diseño del Gate 4: el RPC de inscripción
  **no** valida unicidad por reunión y la UI muestra las otras inscripciones del ejemplar.
- **`docs/AUTOREGISTRO_PLAN.md` §Gate 4** — el requisito y un assert nuevo para el probe:
  el mismo `spc_id` en dos carreras de la misma reunión tiene que ser **aceptado**.

**División de responsabilidades, resuelta por Leo el 04/08**: *el portal anota, la
secretaría resuelve.* El entrenador **sí** puede anotar el mismo caballo en varias
categorías desde el portal — es el proceso real, el papel funciona así. La **resolución
del lunes** (elegir la categoría definitiva y dar de baja las otras) queda **fuera del
portal**: la hace la secretaría desde el back office. El Gate 4 no necesita UI de baja.

---

## 6. 🚦 GATE — ✅ APLICADO (04/08)

OK de Leo. Aplicado por MCP `apply_migration`, migración `spcs_r8_tanda_1b`.

| chequeo | esperado | obtenido | |
|---|---|---|---|
| `count(*) FROM spcs` | 158 (156 + 2) | **158** | ✅ |
| filas con sb `431567` / `434608` | 2 | **2** | ✅ |
| `studbook_id` duplicados | 0 filas | **0** | ✅ |
| sb `35625` (el `SOY RICARDO` de 1976) NO cargado | 0 filas | **0** | ✅ |
| `club_id`/`caballeriza_id`/`registro_stud_book` | NULL | NULL | ✅ |
| `pais_origen` / `estado` | `Argentina` / `activo` | ídem | ✅ |

`data/spcs_snapshot.json` actualizado a **158**.

## 7. Estado de los 27 SPCs de R8 tras la tanda 1b

| | n |
|---|---|
| ya estaban en la base | 11 |
| dados de alta en la tanda 1 | 12 |
| dados de alta en la tanda 1b | 2 |
| typos de la planilla, resueltos sin alta | 2 (`GRAND VUETERA`→`GRAND VUELTERA`, `WISKA KEN`→`WISLA KEN`) |
| **pendientes** | **0** |

Sigue pendiente de Yesi, pero **fuera del circuito** (los carga a mano con el DNI): 8
caballerizas, 3 jockeys y 5 cuidadores + 2 a confirmar. Detalle en
[`TANDA_1_R8.md`](TANDA_1_R8.md) §4.
