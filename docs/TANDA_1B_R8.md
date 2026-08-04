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
| `WISKA KEN` | Sin respuesta todavía | ⏳ **sigue pendiente**, no se tocó |

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

## 4. `WISKA KEN` — sigue abierto

Único pendiente de la tanda 1. La base tiene `WISLA KEN` (sb `433894`, similitud 0.889) y
el SB no devuelve ningún match exacto para `WISKA KEN`. Falta que Yesi diga si son el mismo.

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
  **no** valida unicidad por reunión, la UI muestra las otras inscripciones del ejemplar,
  y queda por definir quién da de baja las sobrantes del lunes.
- **`docs/AUTOREGISTRO_PLAN.md` §Gate 4** — el requisito y un assert nuevo para el probe:
  el mismo `spc_id` en dos carreras de la misma reunión tiene que ser **aceptado**.

---

## 6. 🚦 GATE

`migrations/spcs_r8_tanda_1b.sql` está **propuesto, no ejecutado**. Espera OK explícito.
Con el OK: aplicar por MCP y verificar que `spcs` quede en **158** (156 + 2).
