# R8 — Tanda 2: cruce de la planilla actualizada de Yesi

**Fecha**: 2026-08-05 · **Branch**: `fix/spcs-r8-tanda-2`
**Fuente**: planilla actualizada de Yesi (xlsx, 12 categorías).
**Circuito**: [`docs/CIRCUITO_ALTA_SPCS_R8.md`](CIRCUITO_ALTA_SPCS_R8.md) ·
tandas previas: [`TANDA_1_R8.md`](TANDA_1_R8.md) · [`TANDA_1B_R8.md`](TANDA_1B_R8.md)

## Guard

| chequeo | valor |
|---|---|
| `pwd` | `/home/clio/dev/SGH` |
| project ref | `unlhcuanfrtpatoipwve` |
| `SELECT count(*) FROM spcs` | **158** ✅ (coincide con lo esperado post-tanda 1b) |
| snapshot | `data/spcs_snapshot.json` regenerado por MCP el 05/08 — 158 filas |
| selftest scraper | **16/16 OK**, exit 0 — el HTML/JSON del SB no cambió |
| casts validados read-only | `'jockey'/'entrenador'/'ambos'::tipo_profesional` ✅ |

Estado: **los tres gates fueron aprobados por Leo y aplicados el 05/08**. El detalle de
verificación de cada uno está en su sección. Lo único que quedó sin aplicar es el bloque de
`DON NITO` (§2), que quedó diferido. **Se aplicó después, el 06/08** — ver §2 y §4.3.

---

## Cambio de regla (autorizado por Leo, 05/08)

Hasta la tanda 1b, caballerizas y personas quedaban **fuera** del circuito: las cargaba
Yesi a mano con el DNI. Desde esta tanda **sí se crean por SQL**, con nombre completo y
`documento_nro` NULL donde no haya DNI. El DNI llega después por auto-registro (Gate 3, ya
vivo). Motivo: las inscripciones cierran el **viernes 07/08** y no se puede esperar al
documento de cada uno.

Typos normalizados aguas arriba, **no propagados**: `PAGANDO`→`PAGANO`,
`LOGARCIUS`→`LOGUACIOUS`, `WISKA`→`WISLA KEN`, `GRAND VUETERA`→`GRAND VUELTERA`,
`EL POBRE`→`EL POE`.

---

## 1. SPCs — 13 pedidos, 5 altas

`data/r8_tanda_2.txt` → `python3 tools/sb_alta_spcs.py --tanda 2`.

| resultado | cantidad |
|---|---|
| ya existen en `spcs` | 8 |
| altas propuestas (ALTA_OK) | 5 |
| homónimos / sin match / dudosos | **0** |

### Altas propuestas (5)

| nombre SB | sb_id | nac | sexo | pelaje | padre | madre |
|---|---|---|---|---|---|---|
| RECUERDAME IN YOU | 423281 | 2020-10-05 | hembra | Zaino | Star In You | Olvidame |
| REINA ATREVIDA | 418581 | 2019-10-12 | hembra | Alazan | Detonator | Atrevida Sola |
| TIENE RITMO | 427217 | 2021-08-04 | macho | Alazan | Touareg | Muy Alegre |
| EL GRAN HECTOR | 430047 | 2021-08-25 | macho | Zaino | Grand Reward (USA) | Beauty Shiner |
| IDALIA MARO | 431374 | 2021-10-15 | hembra | Zaino | Engelhard | Itzel Chica |

### Ya existen (8) — no se dan de alta

GRILLADA RYE · **FLORENTINA IN YOU** (sb 423146) · ALIADO SCAT (sb 414038) · IX GOAL TUN ·
TATA FOOT · INDIO VALIDO · COLONIAL JOHAN (sb 432758) · QUE TAL OREJA.

De la corazonada de Leo ("FLORENTINA/RECUERDAME casi seguro ya están"), **media**:
`FLORENTINA IN YOU` sí estaba, `RECUERDAME IN YOU` **no** — es alta.

SQL en `migrations/spcs_r8_tanda_2.sql`, evidencia cruda en
`data/spcs_r8_tanda_2_scrape.json`, reporte del script en
`data/spcs_r8_tanda_2_reporte.md`.

### 🚦 GATE 1 — SPCs · ✅ APLICADO (05/08)

OK de Leo. Los 5 INSERT se aplicaron por MCP `apply_migration`, migración `spcs_r8_tanda_2`
(mismos valores que el `.sql`, sin `BEGIN/COMMIT` ni los SELECT: `apply_migration` ya
envuelve todo en una transacción).

| chequeo | esperado | obtenido | |
|---|---|---|---|
| `SELECT count(*) FROM spcs` | 163 (158 + 5) | **163** | ✅ |
| filas con los 5 `studbook_id` | 5 | **5** | ✅ |
| `studbook_id` duplicados | 0 | **0** | ✅ |
| `club_id` / `caballeriza_id` / `registro_stud_book` | NULL | NULL | ✅ |
| `pais_origen` / `estado` | Argentina / activo | ídem | ✅ |

Nombre, fecha, sexo, color, padre y madre coinciden fila por fila con
`data/spcs_r8_tanda_2_scrape.json`. `data/spcs_snapshot.json` actualizado a **163**.

---

## 2. Caballerizas — 16 cruzadas, 9 altas + 1 en duda

Cruce contra las **272** caballerizas de Dolores (276 en total).

### Ya existen (6) — no se tocan

| pedida | en base |
|---|---|
| EL HINDU | `EL HINDU` (DOL) |
| CRAZY HORSE | `CRAZY HORSE` |
| ABUELO ELDO | `ABUELO ELDO` (DOL) |
| EL DERBY | `EL DERBY` |
| EL MANZANAR | `EL MANZANAR` (DOL) |
| LOS MONCHITOS | `LOS MONCHITOS` |

### Altas propuestas (9)

| caballeriza | origen | vecino más cercano en base |
|---|---|---|
| SAICA | tanda 1 | — |
| NUEVO MUNDO | tanda 1 | — |
| SANTOS VEGA | tanda 1 | — |
| BETTY SANTI | tanda 1 | `LA BETTY (TDL)` — otra caballeriza (confirmado en tanda 1) |
| LOS MORENITOS | tanda 1 | `LOS MONCHITOS` — otra caballeriza (confirmado en tanda 1) |
| LOS EDUCADITOS | tanda 1 | — |
| ESTAMPA DEL SUR | tanda 1 | — |
| ABUELO FLORO | tanda 2 | `FLOR Y AGUS` — no es lo mismo |
| EL CHINGA | tanda 2 | — |

### DON NITO — diferido el 05/08, ✅ aplicado el 06/08

En la base ya está **`DON NINO` (DOL)**. `DON NITO` vs `DON NINO` es **una sola letra** y no
está en la lista de typos que Leo mandó normalizar. Si se inserta y era typo, quedan dos
caballerizas para el mismo dueño y los caballos se reparten mal entre las dos.

Por eso el 05/08 el INSERT quedó comentado en `migrations/caballerizas_r8_tanda_2.sql`.

**Desbloqueado el 06/08 por Leo**, sin respuesta de Yesi todavía. El razonamiento que lo
destraba: la duda era de **unificación**, no de **existencia**, y son dos problemas
distintos. Para la existencia la evidencia alcanza — la planilla la usa, el Stud Book la
tiene registrada como stud, y Yesi la chequeó. Y la caballeriza tiene que existir para que
Yesi pueda inscribir a `TIENE RITMO` en el cierre.

Aplicado por migración `caballerizas_r8_tanda_2_don_nito`: Dolores 281 → **282**.
`DON NITO` = `49ed956b-9678-480b-8421-d3326c077f40`, DOL, activo, responsable NULL.
`DON NINO` intacto (`b50cec95-…`, responsable HOURCADE ABEL PEDRO).

La **unificación sigue abierta** — ver §4.3.

### Convención de alta

Copiada de `caballerizas.html` (alta por pantalla): `club_id` = Dolores,
`hipodromo_patente = 'DOL'` (el form lo pone por default en un alta nueva), `estado`
`'activo'`, `activo` true. `responsable`, `telefono` y chaquetilla quedan NULL — los
completa Yesi.

⚠ `caballerizas` **no tiene unique en `nombre`** (sólo PK en `id`). La idempotencia la da
el `WHERE NOT EXISTS` de cada INSERT, no la base. La tabla ya trae duplicados históricos
por mayúsculas (`LA NARCISA`/`La Narcisa`, `EL LINYE Y RAMI`/`El linye y Rami`) — por eso
el chequeo final de duplicados está acotado a los nombres de esta tanda.

### 🚦 GATE 2 — caballerizas · ✅ APLICADO (05/08)

OK de Leo. Las 9 altas se aplicaron por MCP `apply_migration`, migración
`caballerizas_r8_tanda_2`. **DON NITO no entró en este gate** — se difirió, y se aplicó
aparte el 06/08 (ver arriba). La tabla de abajo es la foto del 05/08, con `DON NITO` todavía
en 0.

| chequeo | esperado | obtenido | |
|---|---|---|---|
| caballerizas de Dolores | 281 (272 + 9) | **281** | ✅ |
| caballerizas totales | 285 | **285** | ✅ |
| filas de la tanda | 9 | **9** | ✅ |
| filas con nombre `DON NITO` | 0 | **0** | ✅ |
| `hipodromo_patente` / `estado` / `activo` en las 9 | DOL / activo / true | ídem | ✅ |
| `responsable` en las 9 | NULL | NULL — lo completa Yesi | ✅ |

---

## 3. Personas — padrón completo cruzado, 10 altas + 1 cambio de tipo

Padrón del xlsx: **18 jockeys + 25 cuidadores** (ALDECOA IVAN figura en las dos listas →
42 personas distintas). `XX` en la planilla = sin jockey asignado, no es persona.
Cruce contra las 167 filas de `profesionales`: **32 ya existían, 10 son alta, 1 es cambio
de tipo**.

### Altas aplicadas (10)

| tipo | apellido | nombre | por qué era alta |
|---|---|---|---|
| jockey | GUZMAN | CLAUDIO | ningún GUZMAN en la tabla |
| jockey | GONZALEZ | LUCAS | ningún GONZALEZ en la tabla |
| jockey | GONZALEZ | AGUSTIN | ídem |
| jockey | MUÑIZ | MATIAS | ni MUÑIZ ni MUNIZ |
| entrenador | GONZALEZ | ADRIAN AGUSTIN | ídem GONZALEZ |
| entrenador | VARELA | LORENA SOLEDAD | ningún VARELA |
| entrenador | ALLEN | JUAN JOSE | ningún ALLEN |
| entrenador | DIAZ | EMILIANO LUJAN | hay `DIAZ AMERICO RAMON` y `DIAZ CARLOS RODOLFO`, ningún Emiliano |
| entrenador | CAMPELO | LEONARDO | ningún CAMPELO |
| entrenador | PAGANO | JUAN MAURICIO | ningún PAGANO — resuelve el typo `PAGANDO` de la hoja 12 |

Todas con `documento_nro` NULL (regla nueva), `hipodromo_patente` NULL —lo que produce un
alta por pantalla—, `club_id` = Dolores, `estado` activo.

### Ya existían (32) — no se tocaron

**Jockeys (13)**: DIESTRA PEDRO · PRESA DANIEL · YALET JORGE · DELLI QUADRI IGNACIO ·
TORRES ANIBAL · GATICA DARIO · YALET IRINEO · ROJAS HERNAN · AGUIRRE HUGO · GIL SANTINO ·
OSUNA JOSE · CONTRERAS JUAN CRUZ · MARTINEZ AGUSTIN.

**Cuidadores (19)**: MAITIA LUIS · MAITIA MIGUEL A · FLEKSTEIN LEONARDO ·
ALDAY SERGIO ESTEBAN · ETCHEVERRY MARIO ALFREDO · GIULIANI NICOLAS JULIAN ·
DIAZ CARLOS RODOLFO · TEDESCHI ALEJANDRO · ZUBIARRAIN SANTIAGO · BARRERA MARIA LAURA ·
DI FRANCO GUSTAVO · GAINLE JOSE MARIA · ALDECOA IVAN (→ ver cambio de tipo) · más los 6
que matchean contra una grafía más larga de la base:

| planilla | en base |
|---|---|
| FARIAS OSVALDO | `FARIAS, OSVALDO ISMAEL` |
| QUINTEROS CARLA | `QUINTEROS, CARLA ELISABETH` |
| GIMENEZ MARCOS | `GIMENEZ, MARCOS EZEQUIEL` |
| SAN MARTIN SERGIO | `SAN MARTIN, SERGIO SEBASTIAN` |
| MEDINA OSCAR | `MEDINA, OSCAR ROBERTO` |
| VALENCIA GERARDO | `VALENCIA, GERARDO MANUEL` |

Cuatro de estos —**CONTRERAS JUAN CRUZ, DI FRANCO GUSTAVO, BARRERA MARIA LAURA,
GAINLE JOSE MARIA**— estaban en la lista de altas de la versión anterior de este
documento, armada sin el padrón. El cruce completo los descartó: ya estaban.

### ALDECOA IVAN — cambio de tipo, no alta

Figura en la lista de jockeys **y** en la de cuidadores. En la base ya estaba como
`entrenador` con DNI `39491188` y patente DOL. Se aplicó
`UPDATE tipo → 'ambos'`; ningún otro campo se tocó.

### ⚠ MAITIA MIGUEL A — no hacía falta ni comentarlo

Leo pidió dejarlo comentado como DON NITO, por dudoso contra "el MAITIA MIGUEL existente".
El cruce lo resuelve: en la base el registro es literalmente `MAITIA, 'MIGUEL A'`
(entrenador, sin DNI), y **no existe ningún `MAITIA MIGUEL` a secas** — los dos MAITIA de
la tabla son `LUIS` y `MIGUEL A`. Coincide carácter por carácter con la planilla: es la
misma persona. No había nada que duplicar ni que desambiguar, así que no lleva ni INSERT ni
bloque comentado. Queda la nota en el `.sql`.

### 🚦 GATE 3 — personas · ✅ APLICADO (05/08)

Migración `personas_r8_tanda_2` por MCP `apply_migration`.

| chequeo | esperado | obtenido | |
|---|---|---|---|
| `SELECT count(*) FROM profesionales` | 177 (167 + 10) | **177** | ✅ |
| filas con `club_id IS NULL` | 0 | **0** | ✅ |
| filas con `tipo = 'ambos'` | 1 (ALDECOA IVAN) | **1** | ✅ |
| duplicados de (apellido, nombre) en toda la tabla | 0 | **0** | ✅ |
| las 10 altas: `documento_nro` | NULL | NULL | ✅ |
| ALDECOA IVAN: DNI tras el UPDATE | 39491188 | **39491188** | ✅ |

## 4. Lo que quedó abierto

### 4.1 ✅ Padrón de personas — resuelto

La versión anterior de este documento marcaba que el xlsx no estaba en el disco y que el
padrón de personas de la tanda 2 no se había podido cruzar entero. Leo pasó el listado
completo el 05/08 (18 jockeys + 25 cuidadores) y el cruce se rehízo sobre ese padrón. Ver §3.

El resultado cambió lo propuesto: **4 personas que iban a darse de alta ya existían**
(CONTRERAS JUAN CRUZ, DI FRANCO GUSTAVO, BARRERA MARIA LAURA, GAINLE JOSE MARIA) y
aparecieron **2 altas nuevas** (MUÑIZ MATIAS, PAGANO JUAN MAURICIO). Dos nombres se
cargaron con la grafía completa del padrón en vez de la corta de la tanda 1
(`VARELA LORENA SOLEDAD`, `DIAZ EMILIANO LUJAN`).

Moraleja para la próxima tanda: **el cruce de personas sin el padrón completo no sirve** —
sobre 10 altas propuestas a ciegas, 4 habrían sido duplicados.

### 4.2 ✅ `PAGANO` — resuelto

Es **PAGANO JUAN MAURICIO**, cuidador (de REINA ATREVIDA en la cat. 8, TIENE RITMO en la
ESPECIAL, IDALIA MARO en la 11 y la 12). El `PAGANDO` de la hoja 12 es typo. Dado de alta
como `entrenador` en el gate 3.

### 4.3 ✅ `DON NITO` vs `DON NINO` — CERRADO: son distintas (Yesi, 07/08)

**Existencia: cerrada** el 06/08. `DON NITO` se aplicó (ver §2). Las dos filas conviven:

| | id | patente | responsable |
|---|---|---|---|
| `DON NINO` | `b50cec95-6637-4193-abb3-123d63026cdb` | DOL | HOURCADE ABEL PEDRO (propietario) |
| `DON NITO` | `49ed956b-9678-480b-8421-d3326c077f40` | DOL | NULL |

**Unificación: cerrada** el 07/08. Yesi confirmó que **`DON NITO` y `DON NINO` son dos
caballerizas distintas**. No hay nada que unificar: el merge descripto abajo no se hace,
las dos filas quedan vivas y separadas, y la única letra de diferencia no es un typo.

Con esto queda cerrado el último pendiente abierto de la tanda 2. No requirió ninguna
escritura — la respuesta confirmó el estado que ya tenía la base.

> Plan de merge que **queda descartado** (se conserva sólo como registro de lo que se
> había previsto): repuntar los `spcs.caballeriza_id` e `inscripciones.caballeriza_id` de
> la sobrante a la que queda, y desactivar la sobrante (`activo = false`). Al 06/08
> `DON NITO` no tenía nada apuntándole, así que habría sido de costo cero.

## 5. Hallazgo lateral — aislamiento por tenant en `profesionales.html` (ISSUE-049, ya resuelto)

**Corrección**: la primera versión de esta sección decía que `profesionales.html` **y**
`jockeys.html` armaban el INSERT sin `club_id`. Falso: `jockeys.html:382` sí lo manda. El
defecto era sólo de `profesionales.html`, y al revisarlo apareció uno más grave al lado.

Los dos defectos, los dos en `profesionales.html`:

1. **Fuga cross-tenant en la lectura** — `load()` consultaba `profesionales` filtrando sólo
   por `tipo = 'entrenador'`, **sin** `.eq('club_id', CLUB_ID)`. Desde Dolores se listaban,
   editaban y daban de baja los **11** profesionales de `Mi Club Hípico`.
   `jockeys.html:271` sí filtraba: era una asimetría entre las dos pantallas hermanas.
2. **Alta sin tenant** — el payload del INSERT no incluía `club_id` (nullable), así que el
   alta por pantalla creaba la fila con `club_id = NULL`.

Chequeo read-only contra prod antes de tocar nada: `count(*) FILTER (WHERE club_id IS NULL)`
= **0** sobre 167 filas (Dolores 156, Mi Club Hípico 11). **No hubo filas huérfanas que
adoptar** → ninguna migración de datos.

Fix aplicado en branch aparte `fix/club-id-alta-profesionales` (`8f08e70`): `.eq('club_id',
CLUB_ID)` en `load()` + `club_id: CLUB_ID` en el payload. Detalle en `docs/ISSUES.md`
ISSUE-049. Nada de esto toca el SQL de esta tanda, que ya seteaba `club_id`.

---

## 6. Estado — aplicado 05/08

| tabla | antes | después | migración |
|---|---|---|---|
| `spcs` | 158 | **163** | `spcs_r8_tanda_2` |
| `caballerizas` (Dolores) | 272 | **281** | `caballerizas_r8_tanda_2` |
| `caballerizas` (total) | 276 | **285** | ídem |
| `profesionales` | 167 | **177** | `personas_r8_tanda_2` |

Más 1 UPDATE: ALDECOA IVAN pasó de `entrenador` a `ambos`.

Las tres migraciones son idempotentes (`WHERE NOT EXISTS`) — correrlas de nuevo no duplica.
Los archivos `.sql` en `migrations/` quedan como fuente de verdad, con la cabecera de
APLICADO y los SELECT de verificación que se corrieron.

### Pendiente

- ~~**`DON NITO`** — bloque comentado~~ → aplicado el 06/08. ~~Queda abierta sólo la
  **unificación** con `DON NINO` (§4.3)~~ → **cerrada el 07/08**: Yesi confirmó que son
  dos caballerizas distintas, no hay nada que unificar (§4.3). **La tanda 2 no deja
  pendientes de caballerizas.**
- **DNI de las 10 personas nuevas** — llegan por auto-registro (Gate 3), no por esta vía.
- **`responsable` de las 9 caballerizas nuevas** — lo completa Yesi por pantalla.
