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

**Nada fue ejecutado contra la base.** Hay tres migraciones propuestas y tres gates
separados.

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

### 🚦 GATE 1 — SPCs · esperando OK

`spcs` pasa de **158 → 163**.

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

### ⚠ DON NITO — bloque comentado, no se inserta

En la base ya está **`DON NINO` (DOL)**. `DON NITO` vs `DON NINO` es **una sola letra** y no
está en la lista de typos que Leo mandó normalizar. Si se inserta y era typo, quedan dos
caballerizas para el mismo dueño y los caballos se reparten mal entre las dos.

El INSERT está en `migrations/caballerizas_r8_tanda_2.sql` **comentado**. Se descomenta
sólo con confirmación de Yesi de que `DON NITO` existe y es distinto de `DON NINO`.

### Convención de alta

Copiada de `caballerizas.html` (alta por pantalla): `club_id` = Dolores,
`hipodromo_patente = 'DOL'` (el form lo pone por default en un alta nueva), `estado`
`'activo'`, `activo` true. `responsable`, `telefono` y chaquetilla quedan NULL — los
completa Yesi.

⚠ `caballerizas` **no tiene unique en `nombre`** (sólo PK en `id`). La idempotencia la da
el `WHERE NOT EXISTS` de cada INSERT, no la base. La tabla ya trae duplicados históricos
por mayúsculas (`LA NARCISA`/`La Narcisa`, `EL LINYE Y RAMI`/`El linye y Rami`) — por eso
el chequeo final de duplicados está acotado a los nombres de esta tanda.

### 🚦 GATE 2 — caballerizas · esperando OK

Caballerizas de Dolores: **272 → 281** (282 si se descomenta DON NITO).

---

## 3. Personas — 8 altas + 1 cambio de tipo

Cruce contra las **167** filas de `profesionales`. Para cada alta se verificó: 0 filas con
el mismo apellido, 0 con el apellido cargado en el campo `nombre`, 0 con el nombre cargado
en el campo `apellido`.

### Altas propuestas (8) — todas venían pendientes de la tanda 1

| tipo | apellido | nombre | nota |
|---|---|---|---|
| jockey | GUZMAN | CLAUDIO | — |
| jockey | GONZALEZ | LUCAS | ningún GONZALEZ en la base |
| jockey | GONZALEZ | AGUSTIN | ídem |
| entrenador | GONZALEZ | ADRIAN AGUSTIN | ídem |
| entrenador | VARELA | LORENA | — |
| entrenador | ALLEN | JUAN JOSE | — |
| entrenador | DIAZ | EMILIANO | hay `DIAZ AMERICO RAMON` y `DIAZ CARLOS RODOLFO`, ningún Emiliano |
| entrenador | CAMPELO | LEONARDO | — |

`documento_nro` y `documento_tipo` quedan **NULL** (regla nueva). `hipodromo_patente` NULL
—es lo que produce un alta por pantalla en `profesionales.html` / `jockeys.html`.
"Cuidador" en la planilla = `tipo = 'entrenador'` en la base.

### Los 4 casos que marcó Leo — ninguno es alta

| caso | resultado del cruce |
|---|---|
| **ALDECOA IVAN** (jockey Y cuidador) | Ya está, como `entrenador`, con DNI `39491188` y patente DOL. **No es alta: es `UPDATE tipo → 'ambos'`.** El enum `tipo_profesional` tiene ese valor justo para esto. No se toca ningún otro campo. |
| **MAITIA MIGUEL A** | **No hay duda que reportar.** En la base el registro es literalmente `MAITIA, MIGUEL A` (entrenador, sin DNI). No existe ningún `MAITIA MIGUEL` a secas — los dos MAITIA de la base son `LUIS` y `MIGUEL A`. Es la misma persona. Sin alta, sin duplicado. |
| **TEDESCHI ALEJANDRO** | Ya existe (`entrenador`, sin DNI). ✅ como anticipó Leo |
| **OSUNA JOSE** | Ya existe (`jockey`, sin DNI). ✅ como anticipó Leo |

### 🚦 GATE 3 — personas · esperando OK

`profesionales`: **167 → 175**, más 1 UPDATE de tipo sobre ALDECOA IVAN.

---

## 4. Lo que quedó abierto — necesita respuesta

### 4.1 ⚠ La planilla xlsx no está en el repo ni en el disco

No hay ningún `.xlsx` en `/home/clio/dev/SGH` ni en el árbol de `/home/clio`. El cruce de
esta tanda se hizo con **las listas que vinieron en el mensaje**, no con el archivo.

Consecuencia concreta: para SPCs y caballerizas la lista vino completa y el cruce cierra.
Para **personas** vinieron sólo los 4 nombres que Leo marcó como dudosos —
**el padrón de jockeys y cuidadores de la tanda 2 no se pudo cruzar entero**. Las 8 altas
de §3 son las que ya venían pendientes de la tanda 1, no las nuevas de la tanda 2.

**Hace falta**: el listado de jockeys y cuidadores de las 12 categorías de la planilla
(o el xlsx en `data/`) para completar el gate 3.

### 4.2 ⚠ `PAGANO` — no se pudo clasificar

El typo `PAGANDO`→`PAGANO` está normalizado, pero `PAGANO` **no aparece en ningún lado**:
0 hits en `caballerizas.nombre`, `caballerizas.responsable`, `propietarios.nombre`,
`profesionales` y `spcs`. Sin la planilla no se sabe si es un cuidador, un jockey, un
propietario o una caballeriza, así que no se propone alta.

**Hace falta**: qué es PAGANO.

### 4.3 `DON NITO` vs `DON NINO`

Ver §2. Bloque comentado esperando confirmación de Yesi.

---

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

## 6. Estado

| | antes | después de los 3 gates |
|---|---|---|
| `spcs` | 158 | 163 |
| `caballerizas` (Dolores) | 272 | 281 |
| `profesionales` | 167 | 175 |

**Cero cambios en la base hasta acá.** Tres migraciones propuestas:

- `migrations/spcs_r8_tanda_2.sql` — 5 INSERT
- `migrations/caballerizas_r8_tanda_2.sql` — 9 INSERT + 1 bloque comentado
- `migrations/personas_r8_tanda_2.sql` — 8 INSERT + 1 UPDATE

Las tres son idempotentes (`WHERE NOT EXISTS`) y traen sus SELECT de verificación **antes**
del `COMMIT`.
