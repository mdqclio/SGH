# TANDA 4 de R8 — llenado final de la planilla

**Fecha:** 07/08/2026 · **Branch:** `fix/spcs-r8-tanda-4` · **Congelamiento:** hoy al mediodía.

Última tanda del cierre de R8. Padrón: 24 SPCs + 16 caballerizas + 14 personas de planilla,
más un agregado de último momento que pasó Silvio (SPC `ACAPULCO` + caballeriza `EL DOMADOR`).
Padrón crudo en `data/r8_tanda_4.txt`.

> **Estado: CERRADO.** 20 altas en 4 migraciones. `spcs` 167 → **178**, `caballerizas` 286 →
> **292**, `profesionales` 181 → **184**. Cero pendientes bloqueantes, y cero pendientes
> heredados de las tandas 1–3. Detalle en §6.

Mismas reglas que las tandas 2 y 3: se crean personas con nombre completo y `documento_nro`
NULL donde no hay DNI (el DNI llega después por auto-registro, Gate 3), y los typos conocidos
se normalizan contra la grafía de la base.

---

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `SELECT count(*) FROM spcs` | 167 | ✅ 167 |

Estado adicional tomado en el mismo baseline: `caballerizas` 286, `profesionales` 181.
(Los 181 de `profesionales` traen los +2 de `fix/montas-r6` del 07/08 a la madrugada, que no
son de las tandas de R8.)

---

## 1. SPCs — 10 altas de 24

**14 ya estaban** (corrieron R6): `TIRSO`, `ASTUTO NOTES`, `DOCTOR SKY`, `VISION SECURITY`,
`PORTEÑO Y BAILARIN`, `FALAYS`, `LA DIVERTENTE`, `LUMIN`, `CHINITA SALTEÑA`, `ICY TOM`,
`GINIYA GOOD`, `BELLO PRESAGIO`, `REY DE PILA`, `HEART OF GOLD`.

**10 son alta**, todas con match **exacto** contra el Stud Book, 0 alertas del scrape:

| nombre | sb_id | nac | sexo | pelo | padre / madre |
|---|---|---|---|---|---|
| ABELITO MIMOSO | 439663 | 2022-11-10 | macho | Zaino | Magic Stripes / Fairy Mosa |
| DE BELLOSO | 432979 | 2021-09-01 | hembra | Zaino Doradillo | Defuniak / Mad Conda |
| GAUCHA PRECIOSA | 435676 | 2022-09-01 | hembra | Alazan | Sea Dog / Hola Nena |
| INFILTRADO SLEW | 420517 | 2020-07-27 | macho | Zaino | Magic Stripes / Compadrona Slew |
| LE BATEAU | 422126 | 2020-10-20 | macho | Zaino | Interaction / Le Yaca (CHI) |
| LIVIA DRUSA | 426999 | 2020-09-16 | hembra | Zaino | Santillano / Wilkenia |
| NELIDA RIM | 439480 | 2022-11-02 | hembra | Zaino | Remote (GB) / Vedette's Day |
| REINA EDITION | 432407 | 2021-10-24 | hembra | Alazan | Equal Edition / Reina Gloriosa |
| TERRIBLE KING | 414959 | 2019-08-23 | macho | Tordillo | Charles King / Bien Terrible |
| YOOKY | 431580 | 2020-08-15 | hembra | Tordillo | Cima De Triomphe (IRE) / Solicitada |

Evidencia: `data/spcs_r8_tanda_4_scrape.json`. Migración: `migrations/spcs_r8_tanda_4.sql`.

### El scrape quedó scripteado

Las tandas anteriores scrapearon a mano. Esta vez el circuito quedó en
`tools/studbook_scrape_tanda.mjs`, reutilizable para la próxima reunión. Endpoint:

```
GET https://www.studbook.org.ar/ejemplares/autocomplete?tipo=1&muerto=1&term=<nombre>
    X-Requested-With: XMLHttpRequest
```

Sale del `select2` de `/ejemplares` (`ej.html:208`). Devuelve en una sola llamada todo lo
que necesita el INSERT — `id`, `text`, `sexo`, `nacimiento`, `pelo`, `padre`, `madre`,
`abuelo_materno`, `tomo`, `folio` — así que **no hace falta abrir el perfil**. El script
clasifica en `ALTAS` / `NO_RESUELTOS` (`SIN_MATCH_EXACTO`, `MATCH_AMBIGUO`, `ERROR_HTTP`),
normaliza el nombre (upper + sin acentos + sin no-alfanuméricos) y levanta alerta si el
ejemplar no es `raza:4` o no tiene bandera argentina. **No escribe en la DB.**

### Anti-duplicado por grafía (lección `ESPLENDID CRAF` de la tanda 3)

El guard de idempotencia es por `studbook_id`, y no ve una fila preexistente con el mismo
caballo escrito distinto y `studbook_id` NULL — que es exactamente cómo se coló
`Esplendido Craf`. Así que además del chequeo de `sb_id` (0 ocupados) se corrió un scan por
radical sobre `spcs.nombre`: `ABELIT|BELLOS|GAUCH|INFILTRAD|BATEAU|LIVIA|NELIDA|REINA|TERRIBL|YOOK|DRUSA|SLEW|EDITION|MIMOSO|PRECIOS`.

4 hits, los 4 ejemplares **distintos**, ninguno la misma mancha con otra grafía:

- `Gaucha Linda`, `Gaucho Bravo`, `QUIET GAUCHO` — otros nombres.
- `REINA ATREVIDA` (sb 418581) — distinto padre, distinta madre, distinto año que `REINA EDITION`.

Un caso más que conviene tener anotado: **`GAUCHA PRECIOSA` es media hermana materna de
`CHINITA SALTEÑA`** (misma madre `Hola Nena`, distinto padre). Son dos ejemplares.

---

## 2. Caballerizas — 6 altas de 16

**10 de planilla ya estaban**: `PARAJE LA TABLADA`, `LOS PERRITOS`, `LOS AMIGOS`, `LA PICHI`,
`MELINA A`, `EL DESTINO`, `EL LINYE Y RAMI`, `SANTA BARBARA`, `EL GALPON`, `STUD CHICO`.

**6 son alta**: `LOS URONES`, `MAR DEL TUYU`, `EL VETERANO`, `FEDERICO Y MIGUEL`, `EMI`,
`DON BENICIO`. Migración: `migrations/caballerizas_r8_tanda_4.sql`.

### `EL GALPON` vs `EL GALPON LOBOS` — resuelto por evidencia, después confirmado

La duda de Leo era si el `EL GALPON` de la planilla es el `EL GALPON LOBOS` de junio. Se
resolvió **antes** de la respuesta de Yesi, mirando qué caballos aloja cada fila:

| | id | patente | responsable | caballos |
|---|---|---|---|---|
| `EL GALPON` | `ed92deda-…` | DOL | PALLET GUIDO (propietario) | BELLO PRESAGIO, NO TIENE CONTRAS |
| `EL GALPON LOBOS (DOL)` | `aaa17d36-…` | NULL | — | Es Mistres |

Conjuntos disjuntos. Y las dos puntas cierran con esta misma planilla: `BELLO PRESAGIO` es
un SPC de esta tanda y `PALLET GUIDO` es un cuidador de esta tanda. **Yesi confirmó el 07/08
que son distintas**, coincidiendo con la evidencia.

> ⚠ Sobre la instrucción *"descomentá/incluí el alta como caballeriza propia"*: **no había
> alta que descomentar y no se insertó nada**. `EL GALPON` ya es una fila propia, con
> patente, responsable y 2 caballos — nunca estuvo comentada, el cruce la encontró existente.
> Insertarla habría creado un duplicado y repartido las inscripciones entre las dos filas
> (el mismo daño que se evitó con `ESPLENDID CRAF`). El pedido ya está satisfecho por el
> estado actual de la base. El guard `NOT EXISTS` de la migración lo habría frenado igual.

### `DON BENICIO (SR)` y la convención de procedencia

Se aplicó como pidió Leo: `nombre = 'DON BENICIO'` + `hipodromo_patente = 'SR'`.

**Divergencia que conviene tener registrada**: hasta hoy `caballerizas.hipodromo_patente`
sólo tenía dos valores — `DOL` (217) y NULL (69). `SR` es **el primer valor distinto de DOL
de la tabla**. Las otras procedencias que hay en la base están metidas *dentro del nombre*,
con la columna en NULL:

`ERICK (TDL)` · `GARIN CITY (LP)` · `LA BETTY (TDL)` · `N.R.A (AZ)` · `TRES AMIGOS (AZ)` ·
`CAROSUEÑO (DOL)` · `EL GALPON LOBOS (DOL)` · `SANTA BARBARA (DOL)`

La forma que se aplicó acá es la correcta, y la UI ya la soporta: `caballerizas.html:324` e
`inscripciones.html:508` renderizan `${nombre}${patente ? ' ('+patente+')' : ''}`, o sea que
`DON BENICIO` + `SR` se muestra como **"DON BENICIO (SR)"**, exactamente el texto de la
planilla. Las 8 de arriba son las que están mal modeladas.

Causa probable: `caballerizas.html:569` propone `'DOL'` por defecto en un alta nueva, así que
cargar una caballeriza de afuera desde la UI obliga a pisar ese default a mano. Queda como
deuda — mover los 8 sufijos a la columna es un cambio de datos con riesgo y el congelamiento
es hoy.

### Duplicados detectados (ninguno de esta tanda) — a Yesi

El scan de duplicados por nombre normalizado devolvió **2 pares preexistentes**, y un tercero
apareció mirando a mano las filas con paréntesis:

| par | filas | estado |
|---|---|---|
| `EL LINYE Y RAMI` | `d8f78de4-…` DOL, resp CUEVAS CESAR DANIEL, 2 caballos · `a692fdea-…` DOL, sin responsable, **0 caballos** | la segunda está vacía, merge de costo cero |
| `LA NARCISA` | `La Narcisa` · `LA NARCISA` | no estaba en el radar de la tanda, apareció en el scan |
| `SANTA BARBARA` | `1bb92f70-…` patente NULL, sin responsable, aloja **LUMIN** · `0dc1260f-…` `SANTA BARBARA (DOL)`, resp PEREZ GUILLERMO HERNESTO, 0 caballos | ambiguo, ver abajo |

El par `SANTA BARBARA` es el único donde las señales apuntan a las dos filas a la vez: `LUMIN`
es un SPC de esta tanda (favorece la primera) y `PEREZ GUILLERMO` es cuidador de esta planilla
(favorece la segunda). **Sea cual sea la buena, ninguna requiere alta**, así que no bloquea el
cierre.

Ninguno de los tres se tocó: limpiar duplicados no es parte del llenado y el congelamiento es
hoy. Van a Yesi.

> El scan por nombre normalizado **no detecta** los duplicados con la procedencia pegada al
> nombre (`SANTA BARBARA` vs `SANTA BARBARA (DOL)` normalizan distinto). Para esos hay que
> mirar a mano las 8 filas con paréntesis. Es otra consecuencia de la deuda de modelado.

---

## 3. Personas — 3 altas de 14

**11 ya estaban.** El jockey pedido, `ROMAY ABEL I.`, está como `ROMAY` / `ABEL I` (sin el
punto): misma persona, el punto es puntuación de la planilla.

Cinco cuidadores matchean contra una grafía más larga de la base — mismo criterio de las
tandas 2 y 3 (`FARIAS OSVALDO` = `OSVALDO ISMAEL`, `MORAGA ADRIAN` = `ADRIAN LEONARDO`):

| planilla | en base | confirmación cruzada |
|---|---|---|
| ANRIQUEZ GERONIMO | GERONIMO FERNANDO · DNI 25395876 | — |
| AZURI SANTIAGO | SANTIAGO DAMIAN · DNI 21446180 | responsable de `LOS AMIGOS` |
| CUEVAS CESAR | CESAR DANIEL · DNI 23983195 | responsable de `EL LINYE Y RAMI` |
| PEREZ GUILLERMO | GUILLERMO HERNESTO · DNI 27105881 | responsable de `SANTA BARBARA (DOL)` |
| PRESA LUIS | LUIS HORACIO · DNI 12735421 | — |

`ALZA MAXIMILIANO`, `TRUPPA ROBERTO`, `CARLI FEDERICO`, `CLAVERIE CLAUDIO` y `PALLET GUIDO`
matchean exacto. `PALLET GUIDO` es además responsable de `EL GALPON`, el dato que resolvió §2.

✅ **`PRESA LUIS` es persona distinta de `PRESA DANIEL`**, como avisó Leo: distinto tipo
(entrenador vs jockey), distinto nombre, distinto DNI. No se unifican.
⚠ `CARLI FEDERICO` (sin DNI) convive con `CARLI ORNELA` (DNI 34653709). Dos personas.

**3 son alta**, las tres como `entrenador` (`cuidador` en la planilla = `entrenador` en
`profesionales`): `MALENA GUSTAVO`, `PALMIERI LEONARDO`, `VILLANUEVA SANTINO`.
Migración: `migrations/personas_r8_tanda_4.sql`.

⚠ El único `SANTINO` de la tabla es `GIL SANTINO` (jockey) — otro apellido, otra persona, así
que `VILLANUEVA SANTINO` es alta igual.

⚠ **`MALENA` como apellido es poco habitual** (suele ser nombre de pila). La planilla viene en
formato `APELLIDO NOMBRE` y no hay ninguna fila en la base con `MALENA` en apellido *ni* en
nombre, así que no hay contra qué matchear ni evidencia de inversión: se cargó tal cual vino.
Si Yesi avisa que es `GUSTAVO MALENA`, es un UPDATE de dos campos sin impacto en FKs.

---

## 4. Agregado de Silvio (07/08) — fuera de planilla

### `EL DOMADOR` — ya existe, 0 altas

`0ee13029-fc1c-4af0-a217-0d00e2a45c69` · club Dolores · `hipodromo_patente` NULL · sin
responsable · aloja `AFRICUM` y `CALAVERIANDO`.

**Respuesta a la pregunta de la grafía**: en la base está como **`EL DOMADOR`**, la grafía de
los resultados de junio. El `EL DONMADOR (TDL)` del programa de mayo **no existe** en
`caballerizas` — el scan `DOMADOR|DONMADOR|DOMAD` devuelve 2 filas: ésta y `LOS DOMADORES`
(DOL, resp HERRERA ANIBAL JUSTO), que es otra caballeriza. El typo de mayo nunca llegó a la
base: no hay nada que deduplicar ni que dar de alta.

### ✅ `ACAPULCO` — aplicado, sb 434487

No estaba en `spcs` (0 filas con radical `ACAPULC`). En el Stud Book el autocomplete devuelve
**tres ejemplares con el nombre exacto `ACAPULCO`**:

| sb_id | nac | sexo | pelo | padre / madre | tomo/folio | adn·pasaporte·mc·revisado |
|---|---|---|---|---|---|---|
| **434487** | 22/07/2022 | Macho | Zaino | Angiolo / Intermar | 1245/761 | 1·1·1·1 |
| 85188 | 22/08/1983 | Macho | Zaino | Salt Marsh (USA) / Antiope | 663/113 | 0·0·0·0 |
| 378421 | 01/01/1961 | Macho | No Consigna | Sin Asignar / Sin Asignar | 7012/387 | 0·0·0·0 |

(`ACAPULCO CREST` / `GOLD` / `MOON` / `VUELA` también salen en el autocomplete pero son otros
nombres y no compiten.)

**Elegido: `sb 434487`.** Es el único que puede correr R8 — los otros dos nacieron en 1983 y
1961, o sea que en 2026 tendrían 43 y 65 años. Y es el único con ADN, pasaporte, microchip y
marca `revisado`, que es lo que tienen los ejemplares en actividad; los otros dos son fichas
históricas (el de 1961 ni siquiera tiene padre y madre asignados, y su tomo 7012 es de los
bloques de carga retroactiva).

**Aplicado el 07/08**, migración `spcs_r8_tanda_4_acapulco`. `spcs` 177 → **178**.
`id = 6350d628-9949-4e79-a321-0ca116f8f4ee`.

La primera pasada lo dejó comentado y lo mandó a Yesi por la regla de homónimos de la tanda.
**Leo lo destrabó el mismo día**, con el argumento correcto: la evidencia es **estructural**,
no una preferencia. Un caballo de 1961 no corre en 2026, así que no hay nada que Yesi pueda
aportar que cambie la elección — la regla "homónimos → Yesi" está para los empates reales,
no para los que se resuelven solos.

Es el mismo criterio de **`SOY RICARDO`** (tandas 1 y 1b): ahí también el homónimo viejo
(`sb 35625`, 1976) quedaba descartado por edad, el reporte ya señalaba `sb 434608` (2022), y
la confirmación de Yesi terminó coincidiendo con ese candidato. La diferencia es que esta vez
no se esperó la vuelta.

Precondiciones verificadas antes de escribir (4/4): `spcs` 177, `sb 434487` libre, 0 filas con
radical `ACAPULC`, 0 filas con los `sb` de los otros dos homónimos.

---

## 5. Pendiente heredado que se cierra — `DON NITO` vs `DON NINO`

**Yesi confirmó el 07/08 que son dos caballerizas distintas.** No hay nada que unificar: el
merge previsto no se hace, las dos filas quedan vivas y separadas, y la única letra de
diferencia no es un typo.

Cero escrituras — la respuesta confirmó el estado que ya tenía la base. Actualizado en
`TANDA_2_R8.md` §4.3 y `TANDA_3_R8.md`. **Con esto las tandas 2 y 3 no dejan pendientes
abiertos.**

---

## 6. Estado final — aplicado 07/08. Padrón de R8 CERRADO.

| tabla | antes | después | migraciones |
|---|---|---|---|
| `spcs` | 167 | **178** | `spcs_r8_tanda_4` (+10) · `spcs_r8_tanda_4_acapulco` (+1) |
| `caballerizas` (total) | 286 | **292** | `caballerizas_r8_tanda_4` (+6) |
| `caballerizas` (Dolores) | 282 | **288** | ídem |
| `profesionales` | 181 | **184** | `personas_r8_tanda_4` (+3) |

**20 altas en total.** Cuatro migraciones, las cuatro idempotentes (`WHERE NOT EXISTS`) —
correrlas de nuevo no duplica. Los `.sql` en `migrations/` quedan como fuente de verdad, con
la cabecera de APLICADO y los SELECT de verificación.

### Verificación — pasada 1 (las 3 migraciones de planilla), 11 checks

| check | esperado | real |
|---|---|---|
| `spcs` total | 177 | ✅ |
| filas con los 10 `sb_id` de la tanda | 10 | ✅ |
| `spcs` con `club_id` no nulo | 0 | ✅ |
| `studbook_id` duplicados | 0 | ✅ |
| `caballerizas` total | 292 | ✅ |
| `caballerizas` de Dolores | 288 | ✅ |
| `caballerizas` con `club_id` NULL | 0 | ✅ |
| `profesionales` total | 184 | ✅ |
| `profesionales` con `club_id` NULL | 0 | ✅ |
| `profesionales` duplicados (apellido, nombre) | 0 | ✅ |
| filas `spcs` con nombre `ACAPULCO` | 0 (todavía a resolver) | ✅ |

Más: las 6 caballerizas nuevas verificadas una por una (`estado` activo, `activo` true,
`DON BENICIO` con patente `SR`), y el scan de duplicados devolviendo sólo los 2 preexistentes.

### Verificación — pasada 2 (`ACAPULCO`), 10 checks

| check | esperado | real |
|---|---|---|
| `spcs` total | 178 | ✅ |
| filas con nombre `ACAPULCO` | 1 | ✅ |
| filas con los `sb` de los homónimos viejos (85188, 378421) | 0 | ✅ |
| `spcs` con `club_id` no nulo | 0 | ✅ |
| `studbook_id` duplicados | 0 | ✅ |
| `caballerizas` total | 292 | ✅ |
| `caballerizas` de Dolores | 288 | ✅ |
| `profesionales` total | 184 | ✅ |
| `profesionales` con `club_id` NULL | 0 | ✅ |
| `profesionales` duplicados (apellido, nombre) | 0 | ✅ |

Y la fila de `ACAPULCO` inspeccionada campo por campo: `club_id`, `caballeriza_id`,
`entrenador_id`, `jockey_habitual_id` y `registro_stud_book` todos NULL, como corresponde
(los asigna Yesi al inscribir; los SPCs son globales).

**No se tocó ningún archivo de frontend en toda la tanda.**

---

## 7. Pendientes que deja la tanda 4

**Ninguno bloquea.** El padrón de R8 quedó cerrado antes del congelamiento.

1. ~~**`ACAPULCO`**~~ — ✅ cerrado el 07/08, `sb 434487` aplicado (§4).
2. **Duplicados de caballerizas** — `EL LINYE Y RAMI`, `LA NARCISA`, `SANTA BARBARA` (§2).
   No bloquean: ninguno requiere alta. Van a Yesi.
3. **`MALENA GUSTAVO`** — confirmar que no está invertido (§3). No bloquea.
4. **Deuda de modelado**: 8 caballerizas con la procedencia pegada al nombre en vez de en
   `hipodromo_patente`, y el default `'DOL'` de `caballerizas.html:569` que la sigue
   causando (§2). Post-hito.
5. **DNI de las 3 personas nuevas** — llegan por auto-registro (Gate 3), no por esta vía.

### Cierre del padrón de R8 — las 4 tandas

| tanda | `spcs` | `caballerizas` (total) | `profesionales` |
|---|---|---|---|
| baseline pre-R8 | — | — | — |
| tanda 3 (cierre) | 167 | 286 | 179 |
| `fix/montas-r6` (07/08, ajeno a las tandas) | 167 | 286 | **181** |
| **tanda 4 (cierre final)** | **178** | **292** | **184** |

Pendientes heredados: **cero**. `DON NITO`/`DON NINO` (tanda 2) cerrado el 07/08 (§5);
`ESPLENDID CRAF` y `HS EL ORIGEN` (tanda 3) cerrados el 06/08.
