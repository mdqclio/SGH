# Programa R8 — cambios para imprenta del 16/08

**Fecha**: 2026-08-13 · **Pedido**: Yesi (secretaría)
**Branch**: `fix/programa-r8-imprenta` (desde `main` @ `42f9942`)
**Gate**: `tests/probe_programa_r8_imprenta.mjs` → **34/34** · regresión previa
`probe_alineado_programa.mjs` → OK

**GUARD**: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` ✅ ·
`spcs` = **183** ✅ · `main` = `42f9942` ✅ · cero DDL, cero DML.

---

## PARTE 1 — Cambios aplicados

### 1. Separación K E S P

**Estado previo.** Lo que estaba pegado era **edad + sexo** (`3H`, `4M`), que se leian como
un solo dato. En el programa color el problema era peor: no habia ningun separador entre los
cuatro valores.

| | codigo anterior | lo que imprimia |
|---|---|---|
| B&N (418) | `` `${i.peso_declarado \|\| ''} ${edad}${sexoCodigo(spc.sexo)} ${pelajeCodigo(spc.color)}` `` | `55 3H Z` |
| COLOR (669) | `` `${i.peso_declarado \|\| ''}${edad}${sexoCodigo(spc.sexo)}${pelajeCodigo(spc.color)}` `` | `553HZ` |

> **Correccion a una version previa de este informe.** Habia anotado que `peso_declarado`
> llegaba al render como `"55.00"` y que los decimales eran parte del problema. Es falso:
> PostgREST devuelve `numeric` como **numero JS** (`58`, `typeof number`), no como string con
> decimales. El `"55.00"` que aparecia era el formato del cliente SQL del MCP, no lo que
> recibe el browser. El peso siempre salio limpio y separado en el B&N. Por eso se elimino la
> funcion `pesoKesp()` que se habia agregado: no hacia falta.

**CSS de la columna** (sin cambios): `table.inscriptos .col-kesp { white-space: nowrap; }` —
no tiene `width` propio, asi que el ancho lo negocia el algoritmo `auto` de la tabla contra
las columnas que si lo declaran (`col-jockey` 15%, `col-entrenador` 15%, `col-pedigree` 20%).

**Aplicado** — espacios simples, sin ningun caracter separador; pelaje faltante queda vacio:

```js
// K E S P = Kilos Edad Sexo Pelaje: cuatro tokens separados por un espacio simple, sin
// ningun caracter separador. Antes la edad y el sexo iban pegados ("3H") y se leian como
// un solo dato. Se arma por partes y se filtran las vacias para que un dato faltante
// (p.ej. pelaje sin cargar) no deje un espacio colgando al final.
function kespTexto(peso, edad, sexo, color) {
  return [peso, edad, sexoCodigo(sexo), pelajeCodigo(color)]
    .filter(v => v !== '' && v !== null && v !== undefined).join(' ');
}
```

Los dos documentos llaman `kespTexto(i.peso_declarado, edad, spc.sexo, spc.color)`.
Antes/despues medido sobre las 67 celdas de R8:

```
B&N    antes:   55 3H Z  | 57 3M Z  | 57 3M Z  | 55 3H Z
COLOR  antes:   553HZ    | 573MZ    | 573MZ    | 553HZ
ambos  despues: 55 3 H Z | 57 3 M Z | 57 3 M Z | 55 3 H Z
```

**Ancho de columna y linea unica — medido, no estimado.**

| | mas largo antes | mas largo despues |
|---|---:|---:|
| B&N | 7 chars | **8 chars** |
| COLOR | 5 chars | **8 chars** |

El encabezado `K E S P` ya ocupa **7 caracteres**, y la columna es `auto`: la fija el mayor
entre encabezado y contenido. Pasa de 7 a 8 — **un caracter**. El gate verifica ademas que
`.col-kesp` sigue **sin `width` fijo** y conserva **`white-space: nowrap`**, y que las 8
carreras mantienen **una fila `<tr>` por caballo ratificado** (67 filas, 67 celdas).

**`word-spacing`: no se aplico.** Con +1 caracter sobre el ancho que ya imponia el
encabezado no hay evidencia de que la columna quede ajustada, y meter `word-spacing` seria
presion de ancho sin justificacion sobre un layout ya aprobado. Si al ver la prueba de
imprenta hace falta aire, es una linea:
`table.inscriptos .col-kesp { word-spacing: 2px; }` (y su equivalente
`table.inscriptos-color .col-kesp` en el color) — separa mas sin agregar ningun caracter.

### 2. Fuera la ganancia mínima de la línea BOLSA

Eliminado el fragmento `— GAN. MÍN. $X/puesto` en los tres documentos:

```diff
-${dist.ganancia_minima ? ` — GAN. MÍN. ${formatMonto(dist.ganancia_minima)}/puesto` : ''}
```
(`programa-oficial.html:446` y `programa-oficial-color.html:707`)

```diff
-      if (dist.ganancia_minima)   bolsaLine += ` &mdash; GAN. MÍN. ${formatMonto(dist.ganancia_minima)}/puesto`;
```
(`carta-llamados.html:943`)

**El cálculo no se tocó.** `repartoDisplay()` de `premios-utils.js` sigue aplicando el piso
`ganancia_minima` exactamente igual: el gate compara el total de BOLSA de las 8 carreras
contra el que produce `main` y da **idéntico en las 8**. Ejemplo (carrera 1): `$1.125.167`
antes y después, con 4° y 5° elevados al piso de $100.000.

### 3. Bono por posición en los dos programas

Agregado en reemplazo, con el patrón textual de `carta-llamados.html:944` y leyendo los tres
campos del JSONB — **sin hardcodear 6, 8 ni 100.000**:

```js
const bonoPosD   = dist.bono_posicion_desde || 6;
const bonoPosH   = dist.bono_posicion_hasta || 0;
const bonoPosMon = dist.bono_posicion_monto || 0;
…
${bonoPosH && bonoPosMon ? ` — BONO ${bonoPosD}°-${bonoPosH}° ${formatMonto(bonoPosMon)}/puesto` : ''}
```

El `|| 6` de `bonoPosD` es el mismo default que ya usa `carta-llamados.html:917`, y solo
entra en juego si `hasta` y `monto` existen pero `desde` no. En R8 los tres están cargados en
las 12 carreras, así que sale del dato real. La guarda `bonoPosH && bonoPosMon` hace que una
carrera sin bono no imprima nada.

Resultado en la línea BOLSA (carrera 1, idéntico en B&N y COLOR):

```
antes:   BOLSA: $1.125.167 — 1° $610.000 — 2° $193.167 — 3° $122.000 — 4° $100.000 — 5° $100.000 — GAN. MÍN. $100.000/puesto
después: BOLSA: $1.125.167 — 1° $610.000 — 2° $193.167 — 3° $122.000 — 4° $100.000 — 5° $100.000 — BONO 6°-8° $100.000/puesto
```

---

## Verificaciones pedidas

Harness de código real (`tests/README.md`): se extrae del HTML la función que renderiza cada
carrera (`renderCarrera` / `renderCarreraColor`) y se ejecuta con datos reales de R8 y con
`premios-utils.js` + `partidor-colors.js` reales. El "antes" sale de
`git show main:<archivo>`. Sin browser (chromium no corre en Ubuntu 26.04), así que se
inspecciona el HTML que el print consume, no un screenshot.

| verificación | B&N | COLOR |
|---|:--:|:--:|
| las 8 carreras SIN "GAN. MÍN." | 8/8 ✅ | 8/8 ✅ |
| las 8 carreras CON "BONO 6°-8° $100.000/puesto" | 8/8 ✅ | 8/8 ✅ |
| total de BOLSA idéntico al de `main` (el piso sigue aplicando) | 8/8 ✅ | 8/8 ✅ |
| una fila por caballo ratificado | 8/8 ✅ | 8/8 ✅ |
| 67 celdas K E S P (una por ratificado) | ✅ | ✅ |
| espacio simple, sin caracteres separadores | ✅ | ✅ |
| edad y sexo separados (antes "3H") | ✅ | ✅ |
| `.col-kesp` sin `width` fijo y con `nowrap` | ✅ | ✅ |
| el string más largo entra en 9 chars | 8 ✅ | 8 ✅ |
| el documento entero no menciona GAN. MÍN. | ✅ | ✅ |

`carta-llamados.html`: la línea BOLSA ya no arma "GAN. MÍN." ✅ · conserva el BONO desde el
JSONB ✅ · sigue calculando con `repartoDisplay` ✅.
Sin hardcodeos: los dos programas leen `bono_posicion_desde/hasta/monto` ✅.

**Gate: 34/34.** Regresión previa `probe_alineado_programa.mjs`: OK (pedigrí, vertical-align
y anchos intactos).

---

## PARTE 2 — Diagnósticos

### 4. Pelajes faltantes en R8 — RESUELTO el 13/08

**Diagnostico**: eran exactamente 2, con el campo `spcs.color` en **NULL en la base**. No era
perdida del render: los otros 65 ratificados tenian el dato y los 65 imprimian su letra.

**Resuelto**: se consulto el Stud Book (fuente del dato) y se cargo el valor, con aprobacion
explicita de secretaria. Unico DML de la sesion.

Evidencia del scraper (`tools/studbook_scrape_tanda.mjs`, no escribe en DB):

| SPC | sb_id | `h.pelo` crudo | nacimiento SB / DB | padre / madre SB / DB |
|---|---:|:--|:--|:--|
| WAVE RIMOUT | 397805 | `Zaino` | 08/08/2017 = 2017-08-08 ✅ | Remote (GB) / Holiday Wave ✅ |
| ICY TOM | 408138 | `Zaino` | 02/09/2018 = 2018-09-02 ✅ | Icy Glory / Normandina ✅ |

0 casos no resueltos, 0 alertas, match exacto por nombre. Cada uno consultado por separado.

**Formato verificado antes de escribir.** La duda era si la base guarda la letra (`Z`) o la
palabra. Guarda la palabra: **0 filas** de `spcs.color` tienen un solo caracter (`len_min` = 5,
`len_max` = 15). La letra se deriva en el render con `pelajeCodigo()`, que mapea
`startsWith('zaino') -> 'Z'`. `Zaino` es ademas el valor exacto de las 84 filas mayoritarias,
byte por byte (`5a 61 69 6e 6f`).

```sql
UPDATE spcs SET color = 'Zaino', updated_at = now()
WHERE id IN ('5ebc5e48-2caf-4c44-be6a-ad75f2716850',   -- Wave Rimout (R8)
             '8a6aea98-d121-4ad6-90d6-c08e8cfd8c75')   -- Icy Tom
  AND color IS NULL;
-- UPDATE 2
```

El `AND color IS NULL` lo deja idempotente. Verificacion posterior: `Zaino` 84 -> **86**,
NULL 25 -> **23**, total 183 sin cambios, filas de una sola letra siguen en **0**.

Print preview de la carrera 5 (`DÍA DEL NIÑO`, turno 10) con el `renderCarrera()` real:

```
   4  WAVE RIMOUT               64 9 M Z
   6  ICY TOM                   60 7 M Z
```

Ambos con la `Z`, mismo formato que el resto. Celdas sin pelaje en la carrera: 0 (antes 2).

**Observacion colateral** (no se toco): `pelajeCodigo()` colapsa las variantes de zaino en una
sola letra — `Zaino`, `Zaino Colorado`, `Zaino Doradillo`, `Zaino Negro` imprimen todas `Z`.
En R8 son 49 de 67 caballos con `Z`. El dato distinto existe en la base y se pierde en el papel.
Necesita criterio de Fede: es cambio de criterio, no bug.

La columna arrastra ademas inconsistencias propias de carga: `Alazan`/`Alazán` y
`Alazan tostado`/`Alazán tostado` conviven con y sin tilde, y hay modificadores en minuscula
(`Zaino oscuro`, `Zaino claro`) contra otros en mayuscula. No se normalizo.

---

## PENDIENTES PARA EL LUNES (anotados, no tocados hoy)

### P1 — `Wave Rimout` duplicado en `spcs`

Dos filas para el mismo caballo, ambas con `registro_stud_book` y `studbook_id` en NULL:

| id | creado | usado en | color |
|---|---|---|---|
| `5ebc5e48-2caf-4c44-be6a-ad75f2716850` | 2026-06-12 | **R8** (programa del domingo) | `Zaino` (cargado hoy) |
| `f277af1c-a4ac-4a98-87d7-b41871718c8d` | 2026-05-07 | R6 | `NULL` — sin tocar |

**Diagnostico: es ruido, no ensucio las liquidaciones de R6.** Lo unico que le cuelga a la
fila de R6:

| tabla | filas | detalle |
|---|---:|---|
| `inscripciones` | 1 | R6 turno 11 — estado **`forfait`** |
| `resultado_posiciones` | 0 | |
| `performances` | 0 | |
| `liquidacion_detalle` | 0 | |
| `novedades_reunion` | 0 | |
| `spc_propietarios` | 0 | |
| `spc_entrenadores_hist` | 0 | |

El caballo no largo (forfait), asi que no genero posicion ni linea de premio. Contraste que lo
cierra: R6 turno 11 tiene **15 lineas** de `liquidacion_detalle` y **0** son del duplicado.

Consolidarlo = borrar una fila huerfana de `spcs` y una inscripcion en forfait. **Sin recalculo
de liquidaciones.** Orden: primero la inscripcion, despues el SPC (GOTCHA #12, FK).

### P2 — `studbook_id` / `registro_stud_book` en NULL

Los tres SPCs mirados hoy los tienen en NULL. El scraper ya devuelve el `sb_id`, asi que el
dato esta disponible sin trabajo extra:

| SPC | sb_id | tomo/folio |
|---|---:|---|
| WAVE RIMOUT | 397805 | 1209/804 |
| ICY TOM | 408138 | 1219/792 |

Conviene dimensionar cuantos SPCs del padron estan igual antes de decidir un backfill. **No
entra hoy** — es otro pedido.

---

### 5. Paginación del B&N — cuántas páginas A4 da hoy

**No puedo darte el número exacto desde acá, y prefiero decirlo antes que inventarlo.** El
conteo depende de métricas de fuente y del salto de página real, que solo produce un motor de
render; en este VPS no hay browser (`npx playwright install chromium` →
`"Playwright does not support chromium on ubuntu26.04-x64"`, ver `tests/README.md`).

**Estimación estructural** (con la aritmética explícita, para que se pueda contrastar):

- Área útil A4 con `@page { margin: 1.5cm 8mm 2cm 8mm }` → **262 mm** de alto por página.
- En print: `table.inscriptos { font-size: 8.5px }`, `td { padding: 2px 3px }` → fila ≈ 3,4 mm.
- Las 8 carreras suman 67 filas + 8 encabezados = **75 filas ≈ 255 mm**.
- Bloque `.carrera-meta` por carrera (premio, condiciones, BOLSA, apuestas) ≈ 15 mm × 8 ≈ **120 mm**.
- Cola del documento: header + título + banner próxima + banda de sponsors + sponsor destacado
  + `.pagina-final` ≈ **200 mm**.
- Total ≈ **575 mm** ÷ 262 → ~2,2, y como `.carrera-block` tiene `page-break-inside: avoid`
  los bloques no se parten y empujan: **estimado 3 páginas** (impar → le falta 1 para cerrar par).

El número autoritativo lo da el propio print preview de Chrome (indica el total de hojas).
⚠️ Ojo con una trampa: el `@bottom-center { content: "Página " counter(page) " de " counter(pages) }`
de la línea 70 **no lo renderiza Chrome** — no soporta margin boxes de `@page`. Ese pie no
sale impreso; conviene verificarlo en el preview antes de contar con él.

**Propuesta (no aplicada).**

*Lo condicional automático no se puede hacer solo con CSS en Chrome.* No existe selector de
paridad del total de páginas. Lo que la especificación sí define para esto es
`break-before: recto | verso` (inserta una hoja en blanco si hace falta para caer en página
derecha), pero **Chrome no lo implementa** — solo procesadores como PrinceXML o Paged.js.
Medirlo por JS tampoco es confiable: `scrollHeight` en pantalla no coincide con el layout
paginado del print.

Por eso la opción recomendada es **manual pero determinista**: un botón de la barra (que no se
imprime) que agrega o saca una hoja en blanco al final, para que Yesi la active después de ver
el preview.

```html
<!-- en la barra de acciones, junto a Imprimir -->
<button class="no-print" onclick="togglePaginaBlanco()">+ Hoja en blanco al final</button>
```
```css
.pagina-blanco { page-break-before: always; height: 0; }
```
```js
function togglePaginaBlanco() {
  const p = document.getElementById('programa-page');
  const ya = p.querySelector('.pagina-blanco');
  if (ya) ya.remove();
  else p.insertAdjacentHTML('beforeend', '<div class="pagina-blanco"></div>');
}
```

Ventajas: no depende de adivinar el conteo, funciona igual si mañana R9 da par, y Yesi
controla el resultado mirando el preview. Son ~10 líneas y no tocan nada del render.

*Alternativa si se quiere automático de verdad*: incorporar Paged.js (permite leer
`counter(pages)` y decidir por paridad). Es una dependencia nueva y un cambio de motor de
paginación — no para hoy, con la imprenta esperando.

---

## Alcance

```
carta-llamados.html               |  4 +-
programa-oficial.html             | 22 ++++++--
programa-oficial-color.html       | 22 ++++++--
tests/probe_programa_r8_imprenta.mjs  | (nuevo)
docs/diagnosticos/2026-08-13_programa-r8-imprenta.md | (este archivo)
```

**No tocado, a propósito:**

- El desglose **en pantalla** de `carta-llamados.html` (línea ~824) sigue mostrando la fila
  "· Ganancia mínima por puesto". Es la pantalla interna de trabajo, no el documento impreso;
  el pedido era sobre la línea BOLSA del impreso. Si Yesi también la quiere fuera de la
  pantalla, es un cambio de una línea.
- Los pelajes NULL de Wave Rimout e Icy Tom (carga de datos).
- El colapso de variantes de zaino en `pelajeCodigo()` (necesita criterio de Fede).
- La hoja en blanco (propuesta arriba, sin aplicar).

Cero `INSERT` / `UPDATE` / `DELETE` / DDL contra prod. Sin merge a `main`.
