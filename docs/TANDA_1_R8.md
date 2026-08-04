# R8 — Tanda 1: cruce de la planilla de Yesi

**Fecha**: 2026-08-04 · **Branch**: `fix/spcs-r8-tanda-1`
**Fuente**: anotaciones de R8 que mandó Yesi — 12 carreras, 27 SPCs únicos.
**Circuito**: [`docs/CIRCUITO_ALTA_SPCS_R8.md`](CIRCUITO_ALTA_SPCS_R8.md)

## Guard

| chequeo | valor |
|---|---|
| `pwd` | `/home/clio/dev/SGH` |
| project ref | `unlhcuanfrtpatoipwve` |
| `SELECT count(*) FROM spcs` | **144** (27 con `studbook_id`) |
| snapshot | `data/spcs_snapshot.json` regenerado por MCP el 04/08 — 144 filas |
| selftest scraper | **16/16 OK**, exit 0 — el HTML/JSON del SB no cambió |

**Nada fue ejecutado contra la base.** El SQL está propuesto y espera OK.

---

## 1. Cruce de SPCs (27 pedidos)

| resultado | cantidad |
|---|---|
| ya existen en `spcs` | 11 |
| altas propuestas (ALTA_OK) | 12 |
| homónimos en el SB (AMBIGUO_SB) | 1 |
| sin match en el SB (SIN_MATCH_SB) | 3 |

### Ya existen (11) — no se dan de alta

| pedido | en base | studbook_id |
|---|---|---|
| MOSQUITA GARDEN | MOSQUITA GARDEN | — |
| BACHUNA | BACHUNA | 440655 |
| BENDITO PRESAGIO | BENDITO PRESAGIO | 438827 |
| QUINIELA TREND | QUINIELA TREND | 408157 |
| BABY PARADISE | BABY PARADISE | — |
| GLAM METAL | GLAM METAL | 420280 |
| SEÑOR MONCHI | SEÑOR MONCHI | 420852 |
| ECHO IN THE SKY | ECHO IN THE SKY | — |
| SANTA LISA | SANTA LISA | — |
| MARUKA PLUS | MARUKA PLUS | 430437 |
| CHE CARABANERA | CHE CARABANERA | 437182 |

### Altas propuestas (12)

| nombre SB | sb_id | nac | sexo | pelaje | padre | madre |
|---|---|---|---|---|---|---|
| SI TIN | 446891 | 2023-10-07 | macho | Alazan | Il Mercato | Sobra Fe |
| ELSEPTIMOESDECALDERA | 440489 | 2022-10-27 | macho | Zaino Colorado | Presagio Key | La Dama Alada |
| TOUCH OF BLUE | 441094 | 2022-10-30 | hembra | Zaino | Heliostatic (IRE) | Honradeza |
| LINDA MAIPUENSE | 438809 | 2022-09-30 | hembra | Zaino Colorado | Lucky Island | Mirror Plus |
| BESO CURIOSO | 439623 | 2022-10-22 | macho | Zaino | Curioso Johan | Belhart |
| WILSON SECURITY | 436668 | 2022-08-05 | macho | Alazan | Victor Security | Cataluya |
| MAC VITAL | 440906 | 2022-11-23 | macho | Zaino | Manipuler | Vital Spark |
| LA GRAN TEMPESTAD | 431248 | 2021-09-08 | hembra | Alazan | Sea Dog | Me Salvo El Doctor |
| LA LAGUNERA J | 438800 | 2022-10-10 | hembra | Zaino | Shawerton | Señorita Ana J |
| BOHEMIO TOP | 433253 | 2020-08-12 | macho | Zaino | Maipo Top | Bohemia Mia |
| NORMANDO LU | 414815 | 2019-08-27 | macho | Tordillo | Lunatico Emperor | Normandina |
| AMOROUS | 429711 | 2021-09-13 | hembra | Zaino | Angiolo | Shadow Queen |

SQL en `migrations/spcs_r8_tanda_1.sql`, evidencia cruda en `data/spcs_r8_tanda_1_scrape.json`.

Nota: **WILSON SECURITY** sonaba a typo de `VISION SECURITY` (0.867 de similitud contra la
base), pero el SB lo resuelve como ejemplar propio (sb 436668, padre Victor Security). Es
otro caballo, no un typo.

### Dudosos — 4 casos que vuelven a Yesi

| pedido | qué pasa | qué hay que preguntar |
|---|---|---|
| **SOY RICARDO** | 2 homónimos exactos en el SB | ¿Cuál? `434608` (2022-08-01, macho, Alazan, El Moises × Western Dream) o `35625` (1976, sin pedigree asignado). Casi seguro el primero, pero **no lo elegimos nosotros**. |
| **GRAND VUETERA** | 0 matches exactos en el SB. En la base ya está **`GRAND VUELTERA`** (0.963, sin studbook_id) | ¿Es typo de la planilla y en realidad es GRAND VUELTERA (ya existe)? |
| **WISKA KEN** | 0 matches exactos en el SB. En la base ya está **`WISLA KEN`** (0.889, sb 433894) | ¿Es typo de la planilla y en realidad es WISLA KEN (ya existe)? |
| **LOGARCIUS** | 0 matches exactos en el SB, y **ningún parecido** ni en el SB ni en la base | Confirmar grafía exacta con el dueño/cuidador. |

---

## 2. Cruce de caballerizas (22 únicas en la planilla)

`caballerizas` tiene 276 filas. **14 matchean, 8 faltan.**

| caballeriza | estado |
|---|---|
| LAGUNA VERDE · LA MORALEJA · EL PIMPO · ABUELO ANIBAL · JYB (`JyB`) · LOS CATACHOS · EL LALO · C&C · DON RAUL · EL COLORADO · LOS MELLI · EL HORNERITO CAFE · EL NIETO · MI BELLA GIULIA | ✅ existen |
| **SAICA** | ❌ falta — sin parecidos |
| **NUEVO MUNDO** | ❌ falta — sin parecidos |
| **SANTOS VEGA** | ❌ falta — sin parecidos |
| **BETTY SANTI** | ❌ falta — hay `LA BETTY (TDL)`, pero no es lo mismo |
| **LOS MORENITOS** | ❌ falta — ojo: existe `LOS MONCHITOS` (parecido, otra caballeriza) |
| **LOS EDUCADITOS** | ❌ falta — sin parecidos |
| **EL POBRE** | ❌ falta — ojo: existe `EL POE`. ¿Es la misma o son dos? |
| **ESTAMPA DEL SUR** | ❌ falta — sin parecidos |

Fuera de alcance del circuito: **las crea Yesi a mano**.

---

## 3. Cruce de personas

### Jockeys (14 en la planilla) — 11 OK, 3 faltan

✅ DIESTRA PEDRO · PRESA DANIEL · YALET JORGE · DELLI QUADRI IGNACIO · TORRES ANIBAL ·
GATICA DARIO · YALET IRINEO · ROJAS HERNAN · AGUIRRE HUGO · GIL SANTINO · MARTINEZ AGUSTIN

❌ **Faltan** (ningún apellido parecido en `profesionales` tipo `jockey`):
- **GUZMAN CLAUDIO**
- **GONZALEZ LUCAS**
- **GONZALEZ AGUSTIN**

### Cuidadores (17 en la planilla) — 12 OK, 5 faltan

✅ MAITIA LUIS · FARIAS OSVALDO (`FARIAS, OSVALDO ISMAEL`) · FLEKSTEIN LEONARDO ·
ETCHEVERRY MARIO ALFREDO · QUINTEROS CARLA (`CARLA ELISABETH`) · GIMENEZ MARCOS
(`MARCOS EZEQUIEL`) · DIAZ CARLOS RODOLFO · SAN MARTIN SERGIO (`SERGIO SEBASTIAN`) ·
ZUBIARRAIN SANTIAGO · MEDINA OSCAR (`OSCAR ROBERTO`)

✅ **Las dos dudas de matcheo, confirmadas por Yesi (04/08)** — ninguna requiere alta:
- **ALDAY ESTEBAN** = `ALDAY, SERGIO ESTEBAN` (había 3 ALDAY en la base: `ADRIAN ALFREDO`,
  `GERMAN CEFERINO`, `SERGIO ESTEBAN`).
- **GIULINIANI NICOLAS** = `GIULIANI, NICOLAS JULIAN`. Era typo de la planilla.

❌ **Faltan (5)**:
- **GONZALEZ ADRIAN AGUSTIN**
- **VARELA LORENA**
- **ALLEN JUAN JOSE**
- **DIAZ EMILIANO** — hay `DIAZ, AMERICO RAMON` y `DIAZ, CARLOS RODOLFO`, ningún Emiliano.
- **CAMPELO LEONARDO**

Fuera de alcance del circuito: **las carga Yesi con el DNI**.

---

## 4. Pendiente — todo carga de Yesi por pantalla, nada nuestro

Los 4 SPCs dudosos **están cerrados** (ver [`TANDA_1B_R8.md`](TANDA_1B_R8.md)): `LOGARCIUS`
resultó ser `LOGUACIOUS` y `SOY RICARDO` (sb 434608) se dieron de alta; `GRAND VUETERA` y
`WISKA KEN` eran typos de la planilla contra ejemplares que ya estaban. **0 SPCs pendientes.**

Queda sólo alta de entidades por pantalla — fuera del alcance del circuito, con el DNI que
Yesi le pida a cada uno:

**Caballerizas (8)**: SAICA · NUEVO MUNDO · SANTOS VEGA · BETTY SANTI · LOS MORENITOS ·
LOS EDUCADITOS · EL POBRE (⚠️ existe `EL POE`, confirmar si es la misma) · ESTAMPA DEL SUR.

**Jockeys (3)**: GUZMAN CLAUDIO · GONZALEZ LUCAS · GONZALEZ AGUSTIN.

**Cuidadores (5)**: GONZALEZ ADRIAN AGUSTIN · VARELA LORENA · ALLEN JUAN JOSE ·
DIAZ EMILIANO · CAMPELO LEONARDO.

Confirmado por Yesi el 04/08, **sin alta**: `GIULINIANI NICOLAS` = `GIULIANI, NICOLAS JULIAN`
y `ALDAY ESTEBAN` = `ALDAY, SERGIO ESTEBAN` — los dos ya estaban en `profesionales`.

---

## 5. 🚦 GATE — ✅ APLICADO (04/08)

OK de Leo. Los 12 INSERTs se aplicaron por MCP `apply_migration`, migración
`spcs_r8_tanda_1` (mismos valores que `migrations/spcs_r8_tanda_1.sql`, sin el
`BEGIN/COMMIT` ni los SELECT: `apply_migration` ya envuelve todo en una transacción).

### Verificación post-ejecución

| chequeo | esperado | obtenido | |
|---|---|---|---|
| `SELECT count(*) FROM spcs` | 156 (144 + 12) | **156** | ✅ |
| filas con los 12 `studbook_id` de la tanda | 12 | **12** | ✅ |
| `studbook_id` duplicados | 0 filas | **0** | ✅ |
| `club_id` / `caballeriza_id` / `registro_stud_book` en las 12 | NULL | NULL | ✅ |
| `pais_origen` / `estado` | `Argentina` / `activo` | ídem | ✅ |

Todos los campos (nombre, fecha, sexo, color, padre, madre) coinciden fila por fila con
el scrape de `data/spcs_r8_tanda_1_scrape.json`.

`data/spcs_snapshot.json` actualizado a **156** — queda listo para la tanda 2.

### Sigue pendiente

Los 4 SPCs dudosos (§1) y las altas de caballerizas/jockeys/cuidadores (§2, §3) **no**
se tocaron. Van por Yesi.
