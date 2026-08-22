# Diagnóstico — 8 problemas de Diego (Stud Book) en el JSON de R8

**Fecha:** 2026-08-22 · **Modo:** READ-ONLY (0 escrituras en DB, 0 cambios de código)
**Branch:** `chore/scrub-pii-arbol-actual` @ `599c9a1`
**Proyecto Supabase:** `unlhcuanfrtpatoipwve` · guard `SELECT count(*) FROM spcs` = **183** ✅
**Edge Function:** `reunion-json` v17 (última actualización 2026-08-05)

## Objeto bajo análisis

- **R8** = reunión `7b6e003e-22e2-4629-bf55-f18560b1260f`, número 8, fecha **2026-08-16**, estado `publicada`.
- **12 turnos** en la reunión. 4 anuladas (turnos 1, 6, 7, 9) → **8 carreras viajan en el JSON**. Coincide con lo que vio Diego.
- **67 competidores** en el JSON (los 8 con resultado oficial → filas de `resultado_posiciones`).
- Todo el armado del JSON está en `buildReunionJson()` — `supabase/functions/reunion-json/_shared/studbook_format.mjs`, inlineado en el build desplegado.

### Mapa turno → número de programa (para hablar el mismo idioma que Diego)

| nro programa | turno | nombre | dist | categoría | computable |
|---|---|---|---|---|---|
| 1 | 2 | PACHAMAMA | 800 | ONC | no |
| 2 | 12 | GRAL JOSÉ DE SAN MARTIN | 800 | **OC** | **sí** |
| 3 | 4 | DIA DEL VETERINARIO | 1000 | ONC | no |
| 4 | 5 | DIA DEL FOLKLORE | 1000 | ONC | no |
| 5 | 10 | DÍA DEL NIÑO | 1000 | ONC | no |
| 6 | 11 | ANIV- DOLORES PRIMER PUEBLO PATRIO | 1100 | **OC** | **sí** |
| 7 | 3 | FUERZA AÉREA ARGENTINA | 1200 | ONC | no |
| 8 | 8 | SANTA ROSA | 1200 | ONC | no |

---

# A · BUGS

## 1. Tiempo mal convertido — **bug de DATO + bug de CONTRATO**. Confirmado.

**Cómo se construye.** `parseTiempo(res.tiempo_ganador)` en `studbook_format.mjs`:

```js
if (s.includes(':')) { [m, r] = s.split(':'); minutos = parseInt(m,10); resto = r; }
if (resto.includes('.')) { [seg, dec] = resto.split('.'); segundos = parseInt(seg,10); decimas = parseInt(dec,10); }
```

**Formato en la base.** `resultados.tiempo_ganador` es `character varying` (texto libre). El input de
`resultados.html` (`getTiempoGanador`, línea ~1368) valida contra `^(\d{1,2}):([0-5]\d)\.(\d{2})$`
→ máscara **MM:SS.CC**.

**Las 8 carreras de R8:**

| nro | dist | `tiempo_ganador` en DB | JSON que sale | ¿Coherente? |
|---|---|---|---|---|
| 1 | 800 | `43:13.00` | `{43, 13, 0}` | 🔴 **NO** — 43 minutos |
| 2 | 800 | `49:00.00` | `{49, 0, 0}` | 🔴 **NO** — 49 minutos |
| 3 | 1000 | `01:02.03` | `{1, 2, 3}` | ✅ |
| 4 | 1000 | `01:00.72` | `{1, 0, 72}` | ✅ |
| 5 | 1000 | `00:59.90` | `{0, 59, 90}` | ✅ |
| 6 | 1100 | `01:04.81` | `{1, 4, 81}` | ✅ |
| 7 | 1200 | `01:15.51` | `{1, 15, 51}` | ✅ |
| 8 | 1200 | `01:15.19` | `{1, 15, 19}` | ✅ |

**Diagnóstico — son tres cosas distintas, no una:**

**(a) DATO — las 2 carreras de 800 m están cargadas con otra convención.** Son las únicas sub-minuto
de la reunión. El operador tipeó `43:13` queriendo decir "43 segundos 13 centésimas", y la máscara
`MM:SS.CC` lo aceptó como válido (43 minutos, 13 segundos). Lo mismo con `49:00`. Barrido sobre
**toda** la tabla `resultados`: son las **únicas 2 filas** con este defecto en el histórico, y las
**únicas 2 de 800 m**. Todas las de ≥1000 m están bien.

**(b) DATO — además hay un dígito mal.** El ticket dice **47.13**; la base dice **43.13**. Las
centésimas (`13`) coinciden, los segundos no. O sea que arreglar sólo el formato dejaría el tiempo
igual de mal. La carrera 1 necesita revisión contra el ticket, no re-parseo.

**(c) CÓDIGO — el campo `decimas` transporta CENTÉSIMAS.** `parseTiempo` hace
`parseInt(dec, 10)` sobre los 2 dígitos que siguen al punto. Para `01:15.51` emite `decimas: 51`, que
son 51 **centésimas**, no décimas. Esto afecta a las **6 carreras bien cargadas**, no sólo a las 2
rotas, y es exactamente la notación que usa Diego (`"47.13c"`). Es un problema de contrato del JSON,
independiente del dato.

**(d) UI — no hay guarda de plausibilidad.** `savePesoBalanza`/`getTiempoGanador` aceptan hasta 99
minutos. Nada cruza el tiempo contra `carreras.distancia_metros`. Una carrera de 800 m con 43 minutos
pasa sin chistar.

> Nota: hay 3 filas legacy con formato `1:11.20` (sin cero a la izquierda). Parsean bien — no son problema.

---

## 2. Jockey siempre nulo — **confirmado, y `jockey` está hardcodeado**

**De dónde sale cada bloque** (`studbook_format.mjs`, armado de `competidores`):

```js
jockey_inscripto: { nombre: nombreCompleto(jock), dni: jock?.documento_nro ?? null, cuit: null },
jockey:           { nombre: null, dni: null, cuit: null }, // v1
```

- `jockey_inscripto` ← `inscripciones.jockey_titular_id` → `profesionales`.
- `jockey` ← **tres `null` literales en el código**. No hay consulta detrás. Está marcado `// v1` — nunca
  se implementó. No es un dato que falte: es un campo que la función no llena.

**¿Existe el dato del jockey que corrió, separado del inscripto?** **No.** Barrido de schema:

- No hay tabla `montas` / `jockeys` / `jinetes` (0 resultados en `information_schema.tables`).
- `inscripciones` tiene exactamente dos columnas de jockey: `jockey_titular_id` y `jockey_suplente_id`.
- `jockey_suplente_id` está en NULL en **los 67 competidores de R8** (0 usos).
- `resultado_posiciones` no tiene ninguna columna de jockey.

O sea: **`jockey_titular_id` es la única fuente, y hace las veces de las dos cosas a la vez.** No hay
manera de distinguir "el que estaba inscripto" de "el que largó" — la columna se pisa.

**El precedente de R6 que mencionaste** — commit `d1600d3` (07/08, mergeado en `865ee73`):

> "Los jockeys cambiados el día de la reunión (20/06/2026) nunca entraron al sistema porque el alta de
> profesionales estaba rota (bug de club_id, ISSUE-049). La planilla oficial de Yesi es la fuente
> autoritativa. Alcance: SOLO `inscripciones.jockey_titular_id`."

Se aplicaron **32 UPDATEs** sobre `jockey_titular_id` (17 altas de monta + 15 reasignaciones sobre 81
ratificados) + alta de 2 jockeys faltantes. La corrección se hizo **a mano contra la planilla de Yesi**,
tres meses después de la carrera. ISSUE-049 está marcado RESUELTO en `docs/ISSUES.md:324`.

**Consecuencia para R8:** el bug estructural que originó el desfasaje de R6 está cerrado, pero
**no hay ninguna reconciliación de montas de R8 contra la planilla de Yesi** — no existe ni doc ni
commit equivalente (`docs/MONTAS_R6_CORRECCION.md` no tiene par para R8). Así que el
`jockey_inscripto` de R8 es literalmente el jockey de la inscripción, sin pasada de corrección. Diego
tiene razón: no coincide con el que corrió, y no tenemos con qué verificarlo del lado nuestro.

**Cobertura en R8:** 26 jockeys distintos sobre 67 competidores. 4 competidores con
`jockey_titular_id` NULL — y los 4 son caballos que **no largaron** (`posicion IS NULL`), así que ese
null es correcto: SANTA LISA (c2), QUINIELA TREND (c3), COLONIAL JOHAN (c6), SEÑOR MONCHI (c8).

---

## 3. IDs de caballos nulos o incorrectos — **nulos confirmados; "incorrecto" no es nuestro**

**De dónde sale.** `ejemplar: { nombre: spc?.nombre, id: str(spc?.studbook_id) }` ← `spcs.studbook_id`.

**¿Es el registro del Stud Book?** Sí. Es el "Idcaballo" del SB — el id del perfil de
studbook.org.ar. Columna `text`, agregada en `db0b2fc` (migración `add_studbook_id.sql`), con índice
único parcial `spcs_studbook_id_uniq`. **No confundir con `spcs.registro_stud_book`**, que es seed
legacy (`SB-D001`, `SB-10007`…) y no es el registro real.

**Cobertura:**

| Alcance | Total | Con `studbook_id` | En NULL |
|---|---|---|---|
| Tabla `spcs` completa | 183 | 67 (36,6 %) | **116 (63,4 %)** |
| SPCs distintos de R8 | 80 | 50 (62,5 %) | **30 (37,5 %)** |
| **Competidores en el JSON de R8** | **67** | **44** | **23 (34,3 %)** |

Los 67 valores cargados son numéricos limpios de 6 dígitos, sin excepción. Cero duplicados
(el índice único lo impide).

Los 23 competidores de R8 que salen con `ejemplar.id: null` — LOCA DUBAI, ASTUTO NOTES, DOCTOR SKY
(c1); SANTA LISA (c2); DESTINADO JOHAN, BABY PARADISE, GRAND VUELTERA, GRILLADA RYE (c3); FALAYS,
PORTEÑO Y BAILARIN, IX GOAL TUN, NOCHE EN VELA (c4); CHINITA SALTEÑA, LA DIVERTENTE, Wave Rimout,
Icy Tom (c5); HEART OF GOLD, TATA FOOT, REY DE PILA, QUE TAL OREJA (c6); DESDEN, VISION SECURITY (c7);
ECHO IN THE SKY (c8). Nótese que **DESTINADO JOHAN (c3) y CHINITA SALTEÑA (c5) son ganadores** y
salen sin id.

**El caso 441094.** Nuestra fila:

```
spcs.id     4b7dd532-b140-4a3e-99f4-12bbc4990a6d
nombre      TOUCH OF BLUE
studbook_id 441094
nacimiento  2022-10-30   sexo hembra
```

Corrió en la **carrera 1, puesto 6**. El valor no lo inventamos: viene del scrape de la tanda 1 de R8,
con match exacto de nombre contra el SB —
`data/spcs_r8_tanda_1_scrape.json:54` guarda la URL del perfil:
`https://www.studbook.org.ar/ejemplares/perfil/441094/touch-of-blue`.

Así que del lado nuestro `441094` ↔ TOUCH OF BLUE está respaldado por el perfil público del propio
Stud Book. **Si en el padrón de Diego 441094 es otro caballo, la discrepancia no está en nuestro
mapeo** — o el id que él espera no es el id de perfil del sitio, o hay una colisión del lado del SB.
Hay que preguntárselo con la URL en la mano; no lo podemos resolver acá.

**Riesgo aparte que conviene que sepas:** `spcs` **no tiene unique en `nombre`**, sólo en
`studbook_id` (`docs/CIRCUITO_ALTA_SPCS_R8.md:96`). Hay un duplicado histórico vivo:
**`Wave Rimout` ×2** (dos filas, misma fecha de nacimiento 2017-08-08, **ambas con `studbook_id` NULL**).
Una de las dos corrió en la carrera 5, puesto 7. Mientras el `studbook_id` siga NULL, el duplicado es
invisible para el guard de idempotencia — es exactamente el modo de falla que documenta
`docs/TANDA_4_R8.md:74` ("el guard es por `studbook_id`, y no ve una fila preexistente con el mismo
caballo escrito distinto y `studbook_id` NULL").

---

## 4. Kilos del ejemplar vacíos — **peor que vacío: cuando viene, viene mal**

**Mapeo actual.** `kilos_ejemplar: str(i.peso_balanza)` y `jockey_kilos: str2(i.peso_final)`.

**¿Existe el dato?** La columna existe. **El dato del caballo, no.**

`SCHEMA.md:297` y `docs/SCHEMA.md:92` definen `inscripciones.peso_balanza NUMERIC(5,2)` como
**"peso real del CABALLO medido en balanza post-carrera (300–600 kg). Distinto del handicap
(`peso_declarado`/`peso_final`)"**. El modal "Pesos balanza" de `resultados.html` tiene el input con
`min="300" max="600"`.

Lo que hay realmente cargado en la columna, en toda la base:

| Rango | Filas | Min | Max |
|---|---|---|---|
| < 100 kg (rango jockey) | **104** | 54,00 | 64,00 |
| 300–600 kg (rango caballo) | 17 | 433,00 | 538,00 |

Y por reunión:

| Reunión | Con `peso_balanza` | Rango jockey | Rango caballo | **= `peso_final`** |
|---|---|---|---|---|
| R6 (20/06) | 57 | 57 | 0 | **57 / 57** |
| **R8 (16/08)** | **47** | **47** | **0** | **46 / 47** |
| 9999 (reunión de prueba) | 17 | 0 | 17 | 0 |

**Las únicas 17 filas con un peso de caballo de verdad están en la reunión ficticia 9999.** En los
datos reales, `peso_balanza` es una **copia del handicap del jockey** — el mismo número que ya viaja
en `jockey_kilos`.

**Entonces, respondiendo la pregunta: `kilos_ejemplar` es hoy el peso del JOCKEY, no el del caballo.**
El peso corporal del ejemplar **no existe en la base**.

**Por qué Diego lo vio "siempre vacío":** en R8 se cargó tarde. Cronología de `inscripciones.updated_at`:
el primer `peso_balanza` de R8 entró el **17/08** (13 filas) y el resto el **18/08** (34 filas). Si él
bajó el JSON el 16 o 17, todo salía null. Estado a hoy:

- **20 de 67** → `kilos_ejemplar: null`
- **47 de 67** → `kilos_ejemplar` con el kilaje del jockey duplicado

Por carrera (nulos): c1 **10/10** (ninguna cargada — casi seguro la que él miró), c2 2/7, c3 2/12,
c4 1/8, c5 0/8, c6 2/8, c7 0/6, c8 3/8.

**Guarda faltante:** `savePesoBalanza()` (resultados.html:~1744) hace `parseFloat(raw)` y manda el
UPDATE sin validar nada. El `min`/`max` del `<input type="number">` es decoración: no bloquea el
guardado. Tampoco hay CHECK en la columna.

---

## 5. DNI y CUIT de personas vacíos — **DNI parcial (está en la base y sí se emite); CUIT no existe**

**DNI.** Sí se emite: `dni: jock?.documento_nro` y `dni: cuid?.documento_nro`, desde
`profesionales.documento_nro` (varchar). No se omite a propósito. Lo que falta es el dato.

Cobertura sobre las personas que aparecen en el JSON de R8:

| Rol | Personas distintas | Con documento | Sin documento |
|---|---|---|---|
| Jockeys | 26 | **23** (88 %) | 3 |
| Cuidadores | 43 | **26** (60 %) | **17** |

Contexto de toda la tabla `profesionales`: jockeys 41/51 (80 %), entrenadores 103/133 (77 %),
"ambos" 1/1. Hay un solo `documento_tipo` en uso.

> Los 2 jockeys dados de alta en la corrección de montas de R6 (`d1600d3`) entraron **sin DNI** por
> regla explícita de esa tanda. Parte de los faltantes son de ese origen.

**CUIT.** No hay dato ni columna. Doble confirmación:

1. En el código: `cuit: null` **hardcodeado** en los tres bloques (`jockey_inscripto`, `jockey`, `cuidador`).
2. En el schema: barrido de `information_schema.columns` por `cuit|cuil` en todo `public` → **un solo
   hit, `clubs.cuit`**. `profesionales` **no tiene columna de CUIT**. Tampoco ninguna otra tabla de personas.

O sea: para el CUIT no hay nada que emitir. Habilitar ese campo es agregar columna + ABM + carga, no
tocar la Edge Function.

---

# B · DECISIONES DE FEDE (relevadas, no resueltas)

## 6. Carreras "Oficial No Computable" en el JSON

**De las 8 carreras de R8 que viajan: 2 computables, 6 no computables.**

- **Computables (OC — `es_computable = true`):** nro **2** (GRAL JOSÉ DE SAN MARTIN) y nro **6**
  (ANIV- DOLORES PRIMER PUEBLO PATRIO).
- **No computables (ONC — `es_computable = false`):** nros 1, 3, 4, 5, 7, 8.

Dato técnico para cuando Fede decida: **el flag ya existe y ya se lee.** `categorias_carrera` tiene
`es_oficial` y `es_computable` como columnas separadas, y la Edge Function **ya trae las dos** en el
`catMap` (`'id, nombre, codigo, es_oficial, es_computable'`). El filtro de `buildReunionJson` usa
sólo `es_oficial`:

```js
const carrerasVisibles = carreras.filter(c => {
  if (c.estado === 'anulada') return false;
  const cat = c.categoria_id ? catMap.get(c.categoria_id) : null;
  return cat?.es_oficial === true;   // es_computable se trae pero no se aplica
});
```

Las 12 carreras de R8 tienen `es_oficial = true`. Si Fede decide excluir las no computables, es
**una condición más en ese filtro** y el JSON de R8 pasa de 8 a 2 carreras.

## 7. Los 5 campos de condición

**Qué existe en el schema y qué no:**

| Campo del JSON | Columna | ¿Existe? |
|---|---|---|
| `edaddesde` | `carreras.edad_minima_anos` (integer) | ✅ existe |
| `edadhasta` | `carreras.edad_maxima_anos` (integer) | ✅ existe |
| `sexo` | `carreras.condicion_sexo` (ENUM) | ✅ existe |
| `ganadadesde` | — | 🔴 **no existe ninguna columna** |
| `ganadahasta` | — | 🔴 **no existe ninguna columna** |

`ganadadesde`/`ganadahasta` están **hardcodeados a `null`** en `studbook_format.mjs`. Barrido de
`information_schema.columns` por `ganad|gana_` en todo `public`: los únicos hits son
`resultados.tiempo_ganador` y `performances.tiempo_ganador` — nada de "ganadas". No es un dato que
falte cargar: no hay dónde ponerlo.

**Cobertura de los tres que sí existen:**

| Alcance | Carreras | `edad_minima_anos` | `edad_maxima_anos` | `condicion_sexo` |
|---|---|---|---|---|
| **R8** | 12 | **0** | **0** | **12 / 12** |
| Global (todas las reuniones) | 49 | **34** (69 %) | **30** (61 %) | **49 / 49** |

Es decir: las columnas de edad **no están muertas** — 34 y 30 carreras del histórico las tienen
cargadas. **R8 es el hueco: 0 de 12.** Se cargó entera con la condición como texto libre.

`condicion_sexo` está en `'ambos'` en las 12 carreras de R8, y `mapSexo()` lo traduce a `'T'`. Por eso
Diego ve sexo lleno y el resto vacío. Los otros valores del ENUM (`machos`, `hembras`,
`machos_castrados`) **no tienen mapeo definido** — salen tal cual, en castellano.

La condición real viaja en `condicion.texto` ← `condicion_handicap ?? condicion_adicional`. En R8 las
12 carreras tienen ambos campos cargados (ej. `"Todo caballo de 4 años perdedores"` +
`"Peso: 57 kilos. Descargo 2 kilos a las hembras…"`) — pero sólo se emite **el primero de los dos**,
el resto del texto se pierde.

## 8. IDs numéricos en vez de UUID

**Formato actual de cada uno:**

| Campo del JSON | Se llena con | Tipo real | ¿Hay id numérico disponible? |
|---|---|---|---|
| `tipo_pista.id` | `carreras.tipo_pista` | **ENUM `tipo_pista`** | 🟡 sólo el orden del ENUM |
| `tipo_pista.nombre` | idem — **el mismo valor** | | |
| `estado_pista.id` | `resultados.estado_pista` | **varchar libre** | 🔴 no |
| `estado_pista.nombre` | idem — **el mismo valor** | | |

En los dos casos el código emite **el mismo string en `id` y en `nombre`**:

```js
tipo_pista:   { id: c.tipo_pista ?? null,       nombre: c.tipo_pista ?? null },
estado_pista: { id: res?.estado_pista ?? null,  nombre: res?.estado_pista ?? null },
```

En R8: `tipo_pista` = `"tierra"` en las 12; `estado_pista` = `"humeda"` en las 8 con resultado.

**`tipo_pista`** es un ENUM de Postgres con 5 labels y un `enumsortorder` estable:

| enumsortorder | label |
|---|---|
| 1 | cesped |
| 2 | arena |
| 3 | mixta |
| 4 | sintetica |
| 5 | tierra |

Ese `enumsortorder` **es** un entero estable y ya está en la base — se podría emitir sin migración
alguna. Ojo con el compromiso: los ENUM de Postgres sólo admiten `ADD VALUE`, y un valor agregado
después queda con sortorder al final o fraccionario. Como identificador externo es usable pero no es
una PK.

**`estado_pista`** es peor: **no hay catálogo**. Es `character varying` libre en `resultados`, sin
ENUM, sin tabla, sin CHECK. El único control es el `<select>` de `resultados.html`, que ofrece
`seca / humeda / fangosa / pesada`. En la base hoy hay 3 valores distintos en uso (`humeda`, `pesada`,
`seca`). **No hay ningún id numérico disponible** — habría que crear la tabla de catálogo.

**Barrido de toda la base:** `information_schema.columns` con `column_name = 'id'` y tipo
`integer|bigint|smallint` en el schema `public` → **cero tablas**. Todas las PK del sistema son UUID.
No hay ningún id numérico en ningún lado para reutilizar. Los otros ids del JSON
(`tipo_carrera.id` = UUID de `categorias_carrera`, `caballeriza.id` = UUID) están en la misma
situación.

---

# Resumen ejecutivo

| # | Problema | Veredicto | Dónde está |
|---|---|---|---|
| 1 | Tiempo mal convertido | 🔴 **Bug nuestro, triple** | (a) dato: 2 carreras de 800 m con convención SS:CC · (b) dato: 43 vs 47 del ticket · (c) código: `decimas` transporta centésimas en las 6 buenas · (d) UI sin guarda de plausibilidad |
| 2 | Jockey nulo | 🔴 **Bug nuestro + gap de modelo** | `jockey` hardcodeado a null (`// v1`). **No existe columna del jockey que corrió**; `jockey_titular_id` es la única fuente. R8 sin reconciliación contra la planilla de Yesi (R6 sí la tuvo: 32 UPDATEs) |
| 3 | IDs de caballos | 🟡 **Nulos: bug de datos. "Incorrecto": no es nuestro** | `studbook_id` NULL en **23/67** competidores (2 son ganadores). El 441094 ↔ TOUCH OF BLUE está respaldado por el perfil público del SB → preguntarle a Diego. Aparte: `Wave Rimout` duplicado, ambos sin id |
| 4 | Kilos del ejemplar | 🔴 **Bug nuestro, silencioso** | El peso del caballo **no existe en la base**. `peso_balanza` está contaminada con el kilaje del jockey: 46/47 de R8 son idénticos a `peso_final`. 20/67 en null. Sin validación en el guardado |
| 5 | DNI / CUIT | 🟡 **DNI: dato faltante. CUIT: no existe** | DNI sí se emite — 23/26 jockeys, **26/43 cuidadores**. CUIT: hardcodeado null **y sin columna** en `profesionales` |
| 6 | ONC en el JSON | ⚖️ **Fede** | **2 computables / 6 no computables** de las 8. El flag `es_computable` ya se trae en el `catMap`, sólo no se aplica en el filtro |
| 7 | Campos de condición | ⚖️ **Fede + dato** | `edad_minima/maxima_anos` existen y están al 69 %/61 % global, pero **0/12 en R8**. `ganadadesde/ganadahasta` **no existen** en el schema. `sexo` sale por `mapSexo('ambos')='T'` |
| 8 | IDs numéricos | ⚖️ **Fede** | `tipo_pista` = ENUM, hay `enumsortorder` 1–5 usable sin migración. `estado_pista` = varchar libre, **sin catálogo ni id**. Cero tablas con PK numérica en toda la base |

**Lo que bloquea a Diego para arrancar mañana, por orden de daño:** #4 (kilos silenciosamente
errados en 47 filas — es peor que un null porque parece un dato bueno), #1a/#1b (2 tiempos
inutilizables + 1 dígito mal), #2 (sin el jockey que corrió no puede atribuir montas), #3 (34 % de
los caballos sin id contra el que normalizar).

---

*Diagnóstico read-only. No se modificó ninguna fila de la base, ningún archivo de código y ninguna
Edge Function.*
