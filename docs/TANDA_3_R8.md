# R8 — Tanda 3: planilla final del cierre

**Fecha**: 2026-08-06 · **Branch**: `fix/spcs-r8-tanda-3`
**Fuente**: planilla final de Yesi (la del cierre).
**Circuito**: [`docs/CIRCUITO_ALTA_SPCS_R8.md`](CIRCUITO_ALTA_SPCS_R8.md) ·
tandas previas: [`TANDA_1_R8.md`](TANDA_1_R8.md) · [`TANDA_1B_R8.md`](TANDA_1B_R8.md) ·
[`TANDA_2_R8.md`](TANDA_2_R8.md)

**Ventana**: mañana cierra la inscripción; el congelamiento arranca al mediodía.
Esta tanda tiene que quedar aplicada hoy.

## Guard

| chequeo | valor |
|---|---|
| `pwd` | `/home/clio/dev/SGH` |
| project ref | `unlhcuanfrtpatoipwve` |
| `SELECT count(*) FROM spcs` | **163** ✅ (coincide con el cierre de la tanda 2) |
| branch base | `main` @ `d8472c0` — sin tocar |
| snapshot | `data/spcs_snapshot.json` regenerado por MCP el 06/08 — 163 filas, **idéntico al previo** |
| selftest scraper | **16/16 OK**, exit 0 — el HTML/JSON del SB no cambió |

Typos normalizados aguas arriba por Leo, **no propagados**: `PAGANDO`→`PAGANO`,
`LOGUACIUS`→`LOGUACIOUS`, `WISKA`→`WISLA`, `EL POBRE`→`EL POE`.

---

## Resumen de la tanda

| grupo | pedidos | ya existen | altas | vuelven a Yesi |
|---|---|---|---|---|
| SPCs | 10 | 5 | **4** | 0 — `ESPLENDID CRAF` se cerró con un UPDATE |
| Caballerizas | 6 | 6 | **0** | 0 — `HS EL ORIGEN` se unificó sin escribir |
| Personas | 11 | 9 | **2** | 0 |

**Es una tanda de cruce, no de alta.** 20 de los 27 nombres ya estaban en la base.
El valor de esta pasada está en los dos casos que se detuvieron a tiempo: `ESPLENDID CRAF`
y `HS EL ORIGEN` habrían entrado como duplicados si se aplicaba la salida del script sin
revisar.

---

## 1. SPCs — 10 pedidos, 4 altas

`data/r8_tanda_3.txt` → `python3 tools/sb_alta_spcs.py --tanda 3`.

El cruce contra el snapshot corre **antes** del scrape (`sb_alta_spcs.py:306` vs `:316`),
así que los 5 que ya estaban no se scrapearon. Se scrapearon 5 nombres, no 10 — como pidió
Leo.

### Altas propuestas (4)

| nombre SB | sb_id | nac | sexo | pelaje | padre | madre |
|---|---|---|---|---|---|---|
| BAHIA ROMANA | 435330 | 2022-08-10 | hembra | Alazan | Roman Joy | Oh Bahia |
| INDIO GOLDEN | 439349 | 2022-10-30 | macho | Zaino | Golden Cigars | India Candela's |
| CONI ROSE | 430718 | 2021-10-15 | hembra | Tordillo | Marconi (USA) | Rose City |
| ES SABALERO | 432333 | 2021-10-20 | macho | Tordillo | Pure Miron | Ori Champ |

### Ya existen (5) — no se dan de alta

`LOCA DUBAI` · `AMIGUITO JESUS` (sb 436018) · `KUCCINI` · `CHAMPION GOLDEN` ·
**`DESTINADO JOHAN`**.

La corazonada de Leo sobre `DESTINADO JOHAN` era correcta: ya estaba (nac 2020-09-07,
macho, `studbook_id` NULL). No se scrapeó.

### ⚠ ESPLENDID CRAF — no se inserta, es la misma mancha que ya está

El script lo clasificó `ALTA_OK`. **Está mal**, y el motivo es interesante porque puede
volver a pasar:

- la base tiene `Esplendido Craf` — normalizado `ESPLENDIDOCRAF`;
- la planilla pide `ESPLENDID CRAF` — normalizado `ESPLENDIDCRAF`;
- `norm()` ignora acentos, puntuación y mayúsculas, pero **no** una letra de diferencia,
  así que no matchean;
- la fila de la base tiene `studbook_id` **NULL**, así que el
  `WHERE NOT EXISTS (… studbook_id = '421807')` tampoco la ve.

Los dos guards de idempotencia fallan a la vez. Lo que lo resuelve es el dato duro:

| | base | Stud Book |
|---|---|---|
| nombre | `Esplendido Craf` | `ESPLENDID CRAF` |
| id | `f78a132a-7fe7-4713-8ac2-9bd41a34f565` | sb 421807 |
| nacimiento | 2020-10-18 | 18/10/2020 |
| sexo | macho | Macho |

Misma fecha y mismo sexo. Y el autocomplete del SB con el término `ESPLENDIDO CRAF`
devuelve **cero** resultados: no existe un ejemplar con esa grafía. **El typo está en la
base, no en la planilla.**

Insertarlo dejaría dos SPCs para el mismo caballo —`spcs` no tiene unique en `nombre`— y
las inscripciones se repartirían entre las dos filas.

El INSERT quedó **comentado** en `migrations/spcs_r8_tanda_3.sql`.

En su lugar se aplicó un **UPDATE** que corrige la grafía de la fila existente y la
enriquece con el dato del SB (`studbook_id`, color, padre, madre). Va aparte del gate 1
porque no es un alta.

#### 🚦 UPDATE `Esplendido Craf` → `ESPLENDID CRAF` · ✅ APLICADO (06/08)

OK de Leo en la segunda pasada. Migración `spcs_r8_tanda_3_esplendid_craf_grafia`.

Precondiciones verificadas **antes** de escribir:

| chequeo | esperado | obtenido | |
|---|---|---|---|
| filas con `studbook_id = '421807'` | 0 (libre) | **0** | ✅ |
| fila target `f78a132a-…` con `studbook_id` NULL | 1 | **1** | ✅ |
| `inscripciones` apuntando a ese `spc_id` | — | **0** | ✅ |

Resultado:

| chequeo | esperado | obtenido | |
|---|---|---|---|
| filas con nombre `ESPLENDID CRAF` | 1 | **1** | ✅ |
| filas con nombre que contenga `ESPLENDIDO` | 0 | **0** | ✅ |
| `studbook_id` duplicados en toda la tabla | 0 | **0** | ✅ |
| `count(*) FROM spcs` | 167 (sin cambio: es UPDATE) | **167** | ✅ |

La fila quedó: `ESPLENDID CRAF` · 2020-10-18 · macho · Zaino ·
Mastercraftsman (IRE) / Esplendida Halo · sb 421807 · Argentina · activo.

El `id` **no cambió**, así que cualquier inscripción futura o pasada sigue resolviendo.

### Chequeo extra — colisión por fecha+sexo

Como `ESPLENDID CRAF` mostró que el match por nombre puede fallar, se cruzaron las otras 4
altas por `(fecha_nacimiento, sexo)` contra toda la tabla. Única coincidencia:
`IDALIA MARO` (2021-10-15, hembra, sb **431374**) contra `CONI ROSE` (2021-10-15, hembra,
sb **430718**). Distinto `studbook_id`, distinto pedigree (`Engelhard`/`Itzel Chica` vs
`Marconi (USA)`/`Rose City`) → dos yeguas distintas nacidas el mismo día. No hay colisión.

SQL en `migrations/spcs_r8_tanda_3.sql`, evidencia cruda en
`data/spcs_r8_tanda_3_scrape.json`, reporte del script en
`data/spcs_r8_tanda_3_reporte.md`.

### 🚦 GATE 1 — SPCs · ✅ APLICADO (06/08)

OK de Leo. Los 4 INSERT se aplicaron por MCP `apply_migration`, migración `spcs_r8_tanda_3`
(mismos valores que el `.sql`, sin `BEGIN/COMMIT` ni los SELECT: `apply_migration` ya
envuelve todo en una transacción).

| chequeo | esperado | obtenido | |
|---|---|---|---|
| `SELECT count(*) FROM spcs` | 167 (163 + 4) | **167** | ✅ |
| filas con los 4 `studbook_id` | 4 | **4** | ✅ |
| `studbook_id` duplicados en toda la tabla | 0 | **0** | ✅ |
| `club_id` / `caballeriza_id` / `registro_stud_book` | NULL | NULL | ✅ |
| `pais_origen` / `estado` | Argentina / activo | ídem | ✅ |
| filas con nombre `ESPLENDID CRAF` | 0 | **0** | ✅ |

Nombre, fecha, sexo, color, padre y madre coinciden fila por fila con
`data/spcs_r8_tanda_3_scrape.json`. `data/spcs_snapshot.json` actualizado a **167**.

---

## 2. Caballerizas — 6 cruzadas, 0 altas

Cruce contra las **281** caballerizas de Dolores (285 en total).

### Ya existen con nombre exacto (5)

| pedida | en base | patente | responsable |
|---|---|---|---|
| RD NECOCHEA | `RD NECOCHEA` | NULL | NULL |
| MARTIN Y NICOLAS | `MARTIN Y NICOLAS` | NULL | NULL |
| MI MARTINCITO | `MI MARTINCITO` | NULL | NULL |
| EL DESEMPEÑO | `EL DESEMPEÑO` | DOL | MORAGA MILLAN ADRIAN LEONARDO (propietario) |
| LA INTERPERIE | `LA INTERPERIE` | DOL | CASINELLI FABRICIO (propietario) |

Las de patente NULL son anteriores a esta tanda: el total de Dolores sigue en 281, el mismo
número con el que cerró la tanda 2.

Dos vecinos que **no** son typo: `MI MARTINCITO` convive con `MI MARTINA` (DOL, AGUIRRE
DIEGO FELIX ALBERTO), y `MARTIN Y NICOLAS` con `GRAN NICOLAS` (DOL, LORENTE NICOLAS).

### ✅ HS EL ORIGEN — unificada con HARAS EL ORIGEN (ratificado por Leo, 06/08)

En la base ya está **`HARAS EL ORIGEN`** (Dolores, patente NULL, responsable NULL). `HS` es
la abreviatura corriente de `Haras` en las planillas del turf.

No es el mismo dilema que `DON NITO`/`DON NINO` de la tanda 2: allá las dos hipótesis
—misma caballeriza o dos distintas— eran igual de sostenibles. Acá la hipótesis de que
`HS EL ORIGEN` sea un haras **distinto** de `HARAS EL ORIGEN` es mucho más floja.

Leo ratificó la unificación el 06/08 sin esperar a Yesi. **La unificación no requiere
ninguna escritura**: es exactamente el estado que ya tenía la base. `HS EL ORIGEN` nunca se
insertó, `HARAS EL ORIGEN` es la fila única, y las inscripciones de esa caballeriza van a
resolver contra ella. La decisión *es* el no-INSERT.

El INSERT quedó comentado en `migrations/caballerizas_r8_tanda_3.sql` como escape, por si
Yesi contradice más adelante.

### 🚦 GATE 2 — caballerizas · ✅ SIN ACCIÓN (verificado 06/08)

**No hubo nada que aplicar.** El `.sql` es sólo constancia del cruce. Verificado después de
los otros dos gates:

| chequeo | esperado | obtenido | |
|---|---|---|---|
| caballerizas totales | 285 | **285** | ✅ |
| caballerizas de Dolores | 281 | **281** | ✅ |
| filas con nombre `HS EL ORIGEN` | 0 | **0** | ✅ |

Esos conteos son la foto del momento del gate. Más tarde ese mismo día subieron a
**286 / 282** por el alta de `DON NITO`, que es de la tanda 2 y no de ésta (§4).

---

## 3. Personas — 11 cruzadas, 2 altas

Padrón de la tanda: **4 jockeys + 5 cuidadores**, más los 2 que Leo pidió cruzar por venir
de junio. Cruce contra las **177** filas de `profesionales`: **9 ya existían, 2 son alta,
0 cambios de tipo**.

### Altas propuestas (2)

| tipo | apellido | nombre | por qué es alta |
|---|---|---|---|
| jockey | LOPEZ | ALEXIS | 0 filas con apellido `L[OÓ]PEZ` en las 177 |
| jockey | MARCHANT | JUAN | 0 filas con apellido `MARCHAN` en las 177 |

El chequeo se hizo con regex acento-insensible (`~*`), no con `ILIKE`, justamente para que
un `LÓPEZ` acentuado no se escapara. El único `ALEXIS` de la tabla es
`CONSTANCIO ALEXIS` (entrenador) — otro apellido, otra persona.

Las dos van con `documento_nro` NULL (regla de la tanda 2), `hipodromo_patente` NULL,
`club_id` = Dolores, estado activo.

### Ya existían (9) — no se tocan

**Jockeys (2 de 4)**: `D'ELIA THIAGO` · `DIESTRA BAUTISTA`.

**Cuidadores (5 de 5)**: `BLANCO MARCELO` · `PREBE JOSE` · `CANTO HORACIO` ·
`MORAGA ADRIAN` (en base `MORAGA, 'ADRIAN LEONARDO'`, DNI 43001366, DOL) ·
`CASINELLI FABRICIO` (DNI 41434669, DOL).

**Los 2 de junio (2 de 2)**: `BOLONTI ROBERTO` · `CANTO TOBIAS`. Están los dos, como
esperaba Leo.

`MORAGA ADRIAN` matchea contra la grafía más larga de la base, el mismo patrón que los 6
casos de la tanda 2. Confirmado además por dato externo: la caballeriza `EL DESEMPEÑO`
tiene responsable `MORAGA MILLAN ADRIAN LEONARDO (propietario)`.

### DIESTRA BAUTISTA — confirmado, no es typo de DIESTRA PEDRO

Leo avisó y el cruce lo respalda: los dos ya están en la tabla como filas separadas
(`70907ee8-…` y `654dc3ea-…`), los dos jockeys. La tabla tiene además tres DIESTRA
entrenadores (`CLAUDIO MAXIMILIANO`, `FLORENCIA`, `JUAN DOMINGO`). Es una familia, no
duplicados. **Ninguno se tocó.**

Mismo caso con los CANTO: `HORACIO` (entrenador), `TOMAS` (entrenador) y `TOBIAS` (jockey)
son tres personas distintas.

### 🚦 GATE 3 — personas · ✅ APLICADO (06/08)

OK de Leo. Migración `personas_r8_tanda_3` por MCP `apply_migration`.

| chequeo | esperado | obtenido | |
|---|---|---|---|
| `SELECT count(*) FROM profesionales` | 179 (177 + 2) | **179** | ✅ |
| filas con `club_id IS NULL` | 0 | **0** | ✅ |
| las 2 altas: `documento_nro` / `documento_tipo` / `hipodromo_patente` | NULL | NULL | ✅ |
| las 2 altas: `tipo` | jockey | jockey | ✅ |
| las 2 altas: `club_id` | Dolores | Dolores | ✅ |
| duplicados de (apellido, nombre) en toda la tabla | 0 | **0** | ✅ |

---

## 4. Lo que vuelve a Yesi

Los dos casos que esta tanda levantó se cerraron por decisión de Leo el 06/08, sin esperar
respuesta:

1. ~~**`ESPLENDID CRAF`**~~ — resuelto: se corrigió la grafía de la fila existente (§1).
2. ~~**`HS EL ORIGEN`**~~ — resuelto: unificada con `HARAS EL ORIGEN`, sin escritura (§2).

Queda uno solo, heredado, y también se movió el 06/08:

3. **`DON NITO`** — abierto desde la tanda 2 (`TANDA_2_R8.md` §4.3). Se partió en dos:
   - **existencia** → cerrada. Leo mandó descomentar y aplicar el INSERT diferido de la
     tanda 2 (migración `caballerizas_r8_tanda_2_don_nito`), porque la caballeriza tiene
     que existir para que Yesi pueda inscribir a `TIENE RITMO` en el cierre. Dolores
     281 → **282**.
   - **unificación con `DON NINO`** → sigue abierta, preguntada a Yesi/Silvio. No bloquea
     la R8: con las dos filas vivas, Yesi inscribe contra la que corresponda. Si alguna vez
     contesta que son la misma, es un merge de datos post-hito.

Si Yesi contradice alguna de las dos decisiones cerradas, las dos son reversibles: el
INSERT de `HS EL ORIGEN` está comentado y listo, y el UPDATE de `ESPLENDID CRAF` se
deshace volviendo el `nombre` a `Esplendido Craf` y el `studbook_id` a NULL sobre el mismo
`id` (`f78a132a-7fe7-4713-8ac2-9bd41a34f565`), que no cambió.

## 5. Estado — aplicado 06/08

| tabla | antes | después | migración |
|---|---|---|---|
| `spcs` | 163 | **167** | `spcs_r8_tanda_3` |
| `profesionales` | 177 | **179** | `personas_r8_tanda_3` |
| `caballerizas` (Dolores) | 281 | **282** | — (0 altas de la tanda 3; +1 por `DON NITO`) |
| `caballerizas` (total) | 285 | **286** | ídem |

La tanda 3 no dio de alta ninguna caballeriza. El +1 es `DON NITO`, el bloque diferido de
la **tanda 2** que Leo mandó aplicar el 06/08 (migración `caballerizas_r8_tanda_2_don_nito`,
detalle en `TANDA_2_R8.md` §2 y §4.3).

Más 1 UPDATE (migración `spcs_r8_tanda_3_esplendid_craf_grafia`): `Esplendido Craf` pasó a
`ESPLENDID CRAF` con `studbook_id` 421807 y pedigree del SB. No mueve el conteo.

`HS EL ORIGEN` → `HARAS EL ORIGEN`: unificación ratificada, **cero escrituras** — ya era el
estado de la base.

Las dos migraciones de alta son idempotentes (`WHERE NOT EXISTS`) — correrlas de nuevo no duplica.
Los `.sql` en `migrations/` quedan como fuente de verdad, con la cabecera de APLICADO.

## 6. Pendientes que no van por esta vía

- **DNI de las 2 personas nuevas** — llegan por auto-registro (Gate 3), como en la tanda 2.
- **`responsable` de las caballerizas con patente NULL** (`RD NECOCHEA`,
  `MARTIN Y NICOLAS`, `MI MARTINCITO`, `HARAS EL ORIGEN`) — lo completa Yesi por pantalla.
  No es alcance de esta tanda, pero son 4 caballerizas que van a aparecer en la R8 sin
  responsable cargado.
