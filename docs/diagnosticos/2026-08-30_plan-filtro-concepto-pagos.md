# Plan — Filtro por tipo de concepto en el detalle de Pagos

**Fecha:** 2026-08-30
**SHA de `main` al momento del relevamiento:** `cb5b77cc52cfa5138c7bdb98ba330c92833a46f8`
**Rama de este informe:** `reports`
**Estado:** PLAN. No se aplicó ningún cambio a `liquidaciones.html` ni a ningún otro archivo del producto.
**Pedido:** Valeria, 30/08 — *"destildo los demás y tildo solamente el incentivo en el caso que cobre de otra carrera"*.

---

## Guards verificados

```
$ pwd
/home/clio/dev/SGH
```

```sql
SELECT count(*) AS spcs_count FROM spcs;
```
```json
[{"spcs_count":181}]
```

```
ref del proyecto: unlhcuanfrtpatoipwve   (Supabase MCP — el mismo que sirve prod)
```

```
$ git rev-parse HEAD
cb5b77cc52cfa5138c7bdb98ba330c92833a46f8
$ git ls-remote origin main | head -1
cb5b77cc52cfa5138c7bdb98ba330c92833a46f8	refs/heads/main
```

Los tres dan. Ninguna operación de escritura sobre producción en esta sesión: el relevamiento es
sólo lectura y el plan no se aplicó.

---

# 1. RELEVAMIENTO

## 1.a — Contra qué se va a filtrar

### El eje es `concepto_tipo`, no el texto de `concepto`

`liquidacion_detalle.concepto_tipo` es un ENUM. Valores, tal como los define la base:

```sql
SELECT t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS valores
FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
WHERE t.typname IN ('concepto_liq','estado_linea_liq')
GROUP BY t.typname;
```
```json
[{"typname":"concepto_liq","valores":"premio, bono, actuacion, incentivo_jockey, incentivo_entrenador, fondo_solidario"},
 {"typname":"estado_linea_liq","valores":"impago, pagado, retenido"}]
```

`concepto` en cambio es texto libre por carrera y por puesto. Filtrar por ahí sería filtrar por
42 valores distintos que en realidad son un solo concepto. Salida cruda abajo (Q5).

### Comando tal como se corrió

El script se escribió en el scratchpad y se copió a la raíz del repo para que node resolviera
`node_modules` (ESM ignora `NODE_PATH`); se borró al terminar.

```bash
cp /tmp/claude-1000/-home-clio-dev-SGH/4e92703c-295b-415c-81af-7c6ec9d3cd7a/scratchpad/relev.mjs ./_relev_tmp.mjs
set -a && . ./.env && set +a && node ./_relev_tmp.mjs
rm -f ./_relev_tmp.mjs
```

Fuente del script (`relev.mjs`) — lee `liquidacion_detalle` completa con el join a `liquidaciones`
para poder aplicar el mismo filtro de club que aplica la UI (`cobDelClub`):

```javascript
import { createClient } from '@supabase/supabase-js';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('falta SUPABASE_SECRET_KEY'); process.exit(2); }
const sb = createClient('https://unlhcuanfrtpatoipwve.supabase.co', KEY,
  { auth:{ autoRefreshToken:false, persistSession:false } });
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';

const { data: ld, error } = await sb.from('liquidacion_detalle')
  .select('id,concepto,concepto_tipo,estado_linea,recibo_id,monto_neto,beneficiario_tipo,beneficiario_id,reunion_id,liquidaciones(club_id)');
if (error) { console.error(error); process.exit(1); }

const delClub = l => l?.liquidaciones?.club_id === CLUB;
const pagable = l => l.recibo_id === null && l.estado_linea === 'impago';
// … (agregaciones Q1..Q5, ver salida)
```

### Salida cruda, completa

```
=== Q1 · TODAS las líneas de la base, por concepto_tipo (sin filtro de club) ===
┌─────────┬────────────────────────┬───────┬──────────┬───────────┬─────────────┬───────────┬─────────────────────┐
│ (index) │ concepto_tipo          │ total │ pagables │ retenidas │ ya_cobradas │ conceptos │ conceptos_distintos │
├─────────┼────────────────────────┼───────┼──────────┼───────────┼─────────────┼───────────┼─────────────────────┤
│ 0       │ 'premio'               │ 223   │ 18       │ 12        │ 4           │ undefined │ 42                  │
│ 1       │ 'incentivo_entrenador' │ 108   │ 15       │ 0         │ 0           │ undefined │ 1                   │
│ 2       │ 'incentivo_jockey'     │ 44    │ 3        │ 0         │ 2           │ undefined │ 1                   │
│ 3       │ 'fondo_solidario'      │ 90    │ 90       │ 0         │ 0           │ undefined │ 40                  │
│ 4       │ 'bono'                 │ 19    │ 0        │ 0         │ 2           │ undefined │ 17                  │
│ 5       │ 'actuacion'            │ 9     │ 0        │ 9         │ 0           │ undefined │ 3                   │
└─────────┴────────────────────────┴───────┴──────────┴───────────┴─────────────┴───────────┴─────────────────────┘

=== Q2 · PAGABLES de Dolores (recibo_id IS NULL AND estado_linea=impago AND club=HDO) por concepto_tipo ===
┌─────────┬────────────────────────┬────────┬─────────────┬───────────────┬───────────┐
│ (index) │ concepto_tipo          │ lineas │ suma        │ beneficiarios │ reuniones │
├─────────┼────────────────────────┼────────┼─────────────┼───────────────┼───────────┤
│ 0       │ 'fondo_solidario'      │ 90     │ '643793.99' │ 1             │ 3         │
│ 1       │ 'premio'               │ 18     │ '188000.00' │ 8             │ 1         │
│ 2       │ 'incentivo_entrenador' │ 15     │ '150000.00' │ 4             │ 1         │
│ 3       │ 'incentivo_jockey'     │ 3      │ '150000.00' │ 3             │ 1         │
└─────────┴────────────────────────┴────────┴─────────────┴───────────────┴───────────┘

=== Q3 · PAGABLES por beneficiario — cuántos concepto_tipo distintos ve cada uno ===
┌─────────┬────────────────────────────────────────────────────┬────────┬─────────┬────────────────────────────────┬─────────────┐
│ (index) │ beneficiario                                       │ lineas │ n_tipos │ tipos                          │ suma        │
├─────────┼────────────────────────────────────────────────────┼────────┼─────────┼────────────────────────────────┼─────────────┤
│ 0       │ 'profesional|6361df8c-179c-4e1b-9846-b589a46a0a2d' │ 9      │ 2       │ 'incentivo_entrenador, premio' │ '92000.00'  │
│ 1       │ 'profesional|f6cdb63a-30b8-4221-812f-0527b5b9c433' │ 6      │ 2       │ 'incentivo_entrenador, premio' │ '60000.00'  │
│ 2       │ 'profesional|62423e35-81cb-43f2-a572-59bba7226c37' │ 5      │ 2       │ 'incentivo_entrenador, premio' │ '52000.00'  │
│ 3       │ 'profesional|fa2bf88c-dad6-435a-a5fc-a45b70e0b8d0' │ 4      │ 2       │ 'incentivo_jockey, premio'     │ '82000.00'  │
│ 4       │ 'profesional|b75e4ec7-6439-417d-8b95-131ba0dbb011' │ 4      │ 2       │ 'incentivo_entrenador, premio' │ '40000.00'  │
│ 5       │ 'profesional|2a4a0c3f-abfe-47b4-93ff-2fa6a678632b' │ 4      │ 2       │ 'incentivo_jockey, premio'     │ '82000.00'  │
│ 6       │ 'profesional|8f24be30-e951-4287-82bd-2db54d0e32dc' │ 2      │ 2       │ 'incentivo_jockey, premio'     │ '60000.00'  │
│ 7       │ 'club|0649e9c5-9e87-4aad-842f-101458e6b33c'        │ 90     │ 1       │ 'fondo_solidario'              │ '643793.99' │
│ 8       │ 'profesional|7381c730-f95c-459f-8b24-41637300f117' │ 2      │ 1       │ 'premio'                       │ '20000.00'  │
└─────────┴────────────────────────────────────────────────────┴────────┴─────────┴────────────────────────────────┴─────────────┘

=== Q4 · lo que REALMENTE llega a cobrosDetalle (buscador excluye beneficiario_tipo=club) ===
┌─────────┬────────────────────────┬────────┬─────────────┬───────────────┐
│ (index) │ concepto_tipo          │ lineas │ suma        │ beneficiarios │
├─────────┼────────────────────────┼────────┼─────────────┼───────────────┤
│ 0       │ 'premio'               │ 18     │ '188000.00' │ 8             │
│ 1       │ 'incentivo_entrenador' │ 15     │ '150000.00' │ 4             │
│ 2       │ 'incentivo_jockey'     │ 3      │ '150000.00' │ 3             │
└─────────┴────────────────────────┴────────┴─────────────┴───────────────┘
TOTAL líneas que puede ver un detalle de Pagos: 36
Máximo de concepto_tipo distintos en UN beneficiario: 2

=== Q5 · texto de `concepto` por concepto_tipo — cardinalidad (por qué NO se filtra por concepto) ===
┌─────────┬────────────────────────┬──────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ (index) │ concepto_tipo          │ textos_distintos │ ejemplos                                                                                                                      │
├─────────┼────────────────────────┼──────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 0       │ 'premio'               │ 42               │ 'Carrera 1 — 3° puesto | Carrera 2 — 4° puesto | Carrera 7 — 5° puesto'                                                       │
│ 1       │ 'incentivo_entrenador' │ 1                │ 'Incentivo entrenador'                                                                                                        │
│ 2       │ 'incentivo_jockey'     │ 1                │ 'Incentivo jockey'                                                                                                            │
│ 3       │ 'fondo_solidario'      │ 40               │ 'Carrera 1 — 1° puesto — Fondo solidario | Carrera 1 — 2° puesto — Fondo solidario | Carrera 1 — 3° puesto — Fondo solidario' │
│ 4       │ 'bono'                 │ 17               │ 'Carrera 7 — Bono 6° puesto | Bono ganador | Carrera 1 — Bono 7° puesto'                                                      │
│ 5       │ 'actuacion'            │ 3                │ 'Peón — Pedro Peón | Capataz — Carlos Capataz | Sereno — Sergio Sereno'                                                       │
└─────────┴────────────────────────┴──────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Query de respaldo (misma pregunta, vía MCP `execute_sql`), salida cruda completa

```sql
WITH pag AS (
  SELECT ld.* FROM liquidacion_detalle ld
  JOIN liquidaciones lq ON lq.id = ld.liquidacion_id
  WHERE ld.recibo_id IS NULL AND ld.estado_linea='impago'
    AND lq.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c')
SELECT beneficiario_tipo, beneficiario_id::text, count(*) AS lineas,
       count(DISTINCT concepto_tipo) AS n_tipos,
       string_agg(DISTINCT concepto_tipo::text, ', ') AS tipos,
       sum(monto_neto) AS suma
FROM pag GROUP BY 1,2 ORDER BY n_tipos DESC, lineas DESC;
```
```json
[{"beneficiario_tipo":"profesional","beneficiario_id":"6361df8c-179c-4e1b-9846-b589a46a0a2d","lineas":9,"n_tipos":2,"tipos":"incentivo_entrenador, premio","suma":"92000.00"},
 {"beneficiario_tipo":"profesional","beneficiario_id":"f6cdb63a-30b8-4221-812f-0527b5b9c433","lineas":6,"n_tipos":2,"tipos":"incentivo_entrenador, premio","suma":"60000.00"},
 {"beneficiario_tipo":"profesional","beneficiario_id":"62423e35-81cb-43f2-a572-59bba7226c37","lineas":5,"n_tipos":2,"tipos":"incentivo_entrenador, premio","suma":"52000.00"},
 {"beneficiario_tipo":"profesional","beneficiario_id":"fa2bf88c-dad6-435a-a5fc-a45b70e0b8d0","lineas":4,"n_tipos":2,"tipos":"incentivo_jockey, premio","suma":"82000.00"},
 {"beneficiario_tipo":"profesional","beneficiario_id":"2a4a0c3f-abfe-47b4-93ff-2fa6a678632b","lineas":4,"n_tipos":2,"tipos":"incentivo_jockey, premio","suma":"82000.00"},
 {"beneficiario_tipo":"profesional","beneficiario_id":"b75e4ec7-6439-417d-8b95-131ba0dbb011","lineas":4,"n_tipos":2,"tipos":"incentivo_entrenador, premio","suma":"40000.00"},
 {"beneficiario_tipo":"profesional","beneficiario_id":"8f24be30-e951-4287-82bd-2db54d0e32dc","lineas":2,"n_tipos":2,"tipos":"incentivo_jockey, premio","suma":"60000.00"},
 {"beneficiario_tipo":"club","beneficiario_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","lineas":90,"n_tipos":1,"tipos":"fondo_solidario","suma":"643793.99"},
 {"beneficiario_tipo":"profesional","beneficiario_id":"7381c730-f95c-459f-8b24-41637300f117","lineas":2,"n_tipos":1,"tipos":"premio","suma":"20000.00"}]
```

Coincide con Q3. Dos caminos independientes (PostgREST + agregación en JS / SQL puro por MCP)
dan lo mismo.

### Qué dice el relevamiento

1. **En el detalle de Pagos aparecen hoy 3 `concepto_tipo`:** `premio` (18 líneas / 8
   beneficiarios), `incentivo_entrenador` (15 / 4) e `incentivo_jockey` (3 / 3). 36 líneas
   pagables en total, todas de una sola reunión.
2. **`fondo_solidario` NO llega nunca al detalle.** Son 90 líneas y $643.793,99 —el bloque más
   grande de la base—, pero su `beneficiario_tipo` es `club` y `cobrosBuscar` filtra
   `.neq('beneficiario_tipo','club')` (`liquidaciones.html:963`). El beneficiario del fondo
   solidario es el propio hipódromo; nunca se abre un detalle sobre él. **No hay que ofrecer un
   botón de fondo solidario.**
3. **`bono` y `actuacion` existen en el ENUM y pueden aparecer,** aunque hoy tengan 0 pagables:
   los 19 bonos están cobrados o sin liquidar, y las 9 líneas de actuación (peón / capataz /
   sereno) están **retenidas** por doping. Una retenida que se habilita con `liberar_linea` pasa
   a `impago` y aparece en la tabla de pagables. El control tiene que soportarlos sin que haya
   que tocar código.
4. **Ningún beneficiario tiene hoy más de 2 `concepto_tipo` pagables a la vez.** El patrón real
   es exactamente el que describe Valeria: `premio + un incentivo`. 8 de 9 beneficiarios
   pagables están en ese caso; el noveno tiene sólo premios.
5. **El texto de `concepto` no sirve como eje.** 42 textos distintos para `premio`, 40 para
   `fondo_solidario`, 17 para `bono`. Son "Carrera N — P° puesto": la carrera y el puesto ya
   tienen columna propia en la tabla. Filtrar por ahí sería filtrar por carrera con otro nombre,
   y agrupar por carrera está fuera de alcance por decisión previa.

---

## 1.b — Cómo está armada hoy la tabla del detalle

Todo vive en `liquidaciones.html`, panel `#panel-cobros`.

### Dónde se pintan las filas

`cobrosDetalle(tipo, id)` — `liquidaciones.html:1043`. Trae las líneas y arma el HTML de una
sola vez con un template string:

```javascript
// liquidaciones.html:1096
const rows = cobLineas.map(l=>`<tr><td><input type="checkbox" class="cob-chk" value="${l.id}" data-monto="${l.monto_neto}" checked onchange="cobrosRecalc()"></td>
    <td>${cellFecha(l)}</td><td>${cellCarrera(l)}</td><td>${cellCaballo(l)}</td><td>${l.posicion?l.posicion+'°':'—'}</td><td>${rolDeLinea(l)||'—'}</td><td>${l.concepto||''}</td>
    <td style="text-align:right">${fmt(l.monto_neto)}</td></tr>`).join('');
```

Se inyecta en `#cob-detalle` (`liquidaciones.html:1113–1128`), dentro de una
`<table class="detalle-table">` con `<tfoot>`:

```html
<!-- liquidaciones.html:1117 -->
<tfoot><tr><td colspan="7">TOTAL SELECCIONADO</td><td style="text-align:right;color:var(--success)" id="cob-total">${fmt(total)}</td></tr></tfoot>
```

Puntos a retener:

- La fila **no tiene clase ni `data-*`**. Hoy no hay forma de saber de qué `concepto_tipo` es una
  fila mirando el DOM.
- El checkbox **nace `checked`**. Al abrir un detalle está todo tildado.
- `concepto_tipo` **ya viene en el `select`** de `cobrosDetalle` (`liquidaciones.html:1054`),
  así que no hay que pedir ninguna columna nueva.
- La tabla de **retenidas** (`retRows`, `liquidaciones.html:1103`) es otra tabla, sin
  checkboxes, con su propio botón "Habilitar". **Queda fuera del filtro**: no es seleccionable
  y no entra en ningún recibo.

### Dónde vive el estado de los checkboxes

**En el DOM, y en ningún otro lado.** No hay un `Set` ni un array de seleccionados. Los tres
lugares que lo leen usan la misma consulta:

```javascript
// liquidaciones.html:1129 — el total
function cobrosRecalc(){
  let t=0; document.querySelectorAll('.cob-chk:checked').forEach(c=>t+=parseFloat(c.dataset.monto)||0);
  document.getElementById('cob-total').textContent = fmt(t);
}
```

```javascript
// liquidaciones.html:1146 — la emisión
const chks = [...document.querySelectorAll('.cob-chk:checked')];
const ids = chks.map(c=>c.value);
```

`cobLineas` (`liquidaciones.html:846`) es la lista de líneas traídas de la base, **no** la
selección: se llena en `cobrosDetalle` y no se toca después.

Esto es una ventaja para lo que hay que construir, y conviene decirlo explícito porque es el eje
de todo el punto 3: **el DOM es la única fuente de verdad de la selección.** Mientras el checkbox
no salga del DOM, no hay dos copias que puedan desincronizarse.

### Filtros previos de los que colgarse

Hay dos, pero **los dos son del buscador, no del detalle** (`liquidaciones.html:218–226`):

```html
<input id="cob-q" ... oninput="cobrosBuscarDebounced()">
<select id="cob-reunion" onchange="cobLoadCarreras()">
<select id="cob-carrera" onchange="cobrosBuscar()">
```

Actúan en `cobrosBuscar()` (`liquidaciones.html:950`), que arma las **tarjetas de beneficiario**.
`cobrosDetalle` los lee sólo de refilón: toma `#cob-reunion` para el filtro de sandbox
(`ridSel`, `liquidaciones.html:1051`) y **ignora `#cob-carrera` por completo** — el detalle trae
toda la deuda del beneficiario, cruzando reuniones, a propósito (comentario en
`liquidaciones.html:1048`).

**Conclusión: no hay de qué colgarse.** El filtro nuevo es el primer filtro que vive dentro del
detalle. Va en el `<div class="config-card">` que arma `cobrosDetalle`, no en la `selector-bar`
de arriba — si fuera arriba, cambiar de filtro tendría que re-disparar `cobrosDetalle`, que
re-renderiza y por lo tanto **pierde la selección**. Es exactamente lo que hay que evitar.

### `tildar / destildar todo`

```
$ grep -n "selectAll\|toggleAll\|chk-all\|Tildar\|tildar\|Destildar\|indeterminate" liquidaciones.html
NO existe tildar/destildar todo
```

**No existe.** Se responde en detalle en el punto 5.

---

# 2. EL FILTRO

## Decisión: botones tipo pestaña (segmented control), armados desde los datos

### Justificación con los números del punto 1

| Opción | Por qué no / por qué sí |
|---|---|
| `<select>` | Los grupos presentes por beneficiario son **2** (medido: máximo 2 `concepto_tipo`, en 8 de 9 casos `premio` + un incentivo). Con "Todo" son 3 opciones. Un desplegable para 3 opciones cuesta un click extra, esconde los conteos y esconde en qué filtro estás cuando no lo mirás. |
| Checkboxes | **Descartado por riesgo, no por espacio.** El control quedaría a centímetros de los checkboxes de las filas, cuyo significado es *"esto se paga"*. Dos controles con la misma forma y significados distintos —uno filtra, el otro cobra— en la misma tarjeta es la confusión precisa que este cambio tiene que eliminar. Además sugiere multi-selección y abre el caso "ningún tipo tildado", que no significa nada. |
| **Botones pestaña** | ✅ Single-select, siempre visibles, muestran el conteo por grupo sin abrir nada, y no se parecen a un checkbox de cobro. Con los datos reales son **3 chips**; en el peor caso teórico (un beneficiario con premio + bono + actuación + un incentivo) son **5**, que entran holgados en el ancho de la tarjeta. |

### Grupos

Se mapea el ENUM a rótulos de ventanilla:

| Grupo (rótulo) | `concepto_tipo` |
|---|---|
| Premios | `premio` |
| Incentivos | `incentivo_jockey`, `incentivo_entrenador` |
| Bonos | `bono` |
| Actuación | `actuacion` |
| *(Fondo solidario)* | `fondo_solidario` — **inalcanzable**: `beneficiario_tipo='club'`, excluido en `cobrosBuscar` |

Los dos incentivos van juntos porque un beneficiario es entrenador **o** jockey, nunca los dos
(Q3: ningún beneficiario tiene los dos tipos). Separarlos daría siempre un chip vacío.

### Armado dinámico — el control se construye desde `cobLineas`, no desde el ENUM

Sólo se renderiza un chip si hay al menos una línea pagable de ese grupo. Consecuencias:

- Un beneficiario con un solo grupo **no ve el control** (nada que filtrar → no se dibuja).
  Hoy eso aplica a 1 de los 9 beneficiarios pagables.
- Nunca hay un chip que al tocarlo deje la tabla vacía.
- Si mañana aparece un `concepto_tipo` nuevo en el ENUM y nadie actualiza el mapa, cae en un
  grupo "Otros" con su rótulo crudo en vez de desaparecer de la vista. **Una línea que no entra
  en ningún grupo tiene que seguir siendo visible y tildable** — perder plata de la vista por un
  ENUM nuevo es peor que un rótulo feo.

### Forma del control

```
[ Todo (9) ]  [ Premios (6) ]  [ Incentivos (3) ]
```

El chip activo va con `background: var(--accent)` y texto oscuro; los inactivos con borde
`var(--verde-borde)`, siguiendo la paleta ya usada en la página. Va inmediatamente arriba de la
`<table class="detalle-table">` de pagables, dentro de la misma `config-card`.

---

# 3. LO QUE NO PUEDE PASAR — el riesgo central

## La regla

> **Filtrar oculta filas. Nunca las saca del DOM, nunca las re-renderiza, nunca toca `checked`.**

## Cómo se resuelve

El filtro se implementa como **una pasada de CSS sobre filas que ya existen**:

```javascript
// PLAN — no aplicado
function cobrosFiltrar(grupo){
  cobFiltro = grupo;
  document.querySelectorAll('#cob-detalle tr.cob-row').forEach(tr => {
    const visible = grupo === 'todo' || tr.dataset.grupo === grupo;
    tr.classList.toggle('cob-row-oculta', !visible);
  });
  cobrosRenderChips();   // marca el chip activo y reescribe los rótulos de tildar/destildar
  cobrosRecalc();        // recalcula total + aviso de tildadas ocultas
}
```

La fila se marca en el render con su grupo, que es el único cambio a `rows`:

```javascript
// PLAN — no aplicado. Único cambio en la línea 1096: class + data-grupo en el <tr>.
const rows = cobLineas.map(l=>`<tr class="cob-row" data-grupo="${grupoDeTipo(l.concepto_tipo)}"><td><input type="checkbox" ...
```

**Por qué esto cierra el riesgo, y no por disciplina sino por construcción:**

1. **`cobrosFiltrar` no menciona `checked`.** No lo lee, no lo escribe. Un checkbox no puede
   cambiar de estado por filtrar, del mismo modo que no puede cambiar por hacer scroll.
2. **`querySelectorAll('.cob-chk:checked')` no mira visibilidad.** Un `<input>` dentro de un
   `<tr>` con `display:none` sigue estando en el documento y sigue matcheando `:checked`. Por lo
   tanto `cobrosEmitir` y `cobrosRecalc` **no se tocan**: emiten y suman lo tildado porque nunca
   supieron qué era lo visible. El diff en esas dos funciones es cero.
3. **No hay segunda fuente de verdad.** No se guarda un `Set` de ids seleccionados que después
   haya que reconciliar. El bug "filtré, tildé, saqué el filtro y se perdió" requiere dos copias
   del estado; acá hay una.

### La alternativa que se descarta, y por qué

Re-renderizar `rows` filtrando `cobLineas` en cada cambio de filtro. Es lo que sale natural
porque el render ya está escrito así. **Obliga** a mantener un `Set cobSeleccionadas` en paralelo
al DOM, a volcarlo antes de re-renderizar y a restaurarlo después. Ese volcado-restauración es
justamente donde vive el bug que este punto pide evitar, y además rompe el foco y el scroll.
Más código, más riesgo, cero beneficio. Descartada.

### Detalle de implementación: clase, no atributo `hidden`

Se usa `tr.classList.toggle('cob-row-oculta')` con

```css
.cob-row-oculta { display: none !important; }
```

y no `tr.hidden = true`. Motivo: `[hidden]` depende de que ninguna regla de autor le gane a la
del user-agent. En este archivo hoy no hay ninguna regla `tr { display: … }` —

```
$ grep -n "^\s*tr\s*{\|tr *{ *display\|display: *table-row" liquidaciones.html
(sin resultados)
```

— así que `hidden` funcionaría hoy. Pero una regla de layout agregada meses después lo rompería
en silencio, y el modo de falla es el peor posible: filas que deberían estar ocultas se ven, o
—peor— el operador cree que filtró y no filtró. Una clase propia con `!important` no tiene ese
acoplamiento. Además, la clase es **observable desde el probe sin motor de layout**, que es lo
que hace testeable el punto 3 (ver PROBE).

## Qué asserts lo cubren

| Assert | Qué prueba |
|---|---|
| `F1` | Filtrar por un grupo pone `cob-row-oculta` en **todas** las filas de los otros grupos. |
| `F1b` | Y **no** la pone en ninguna fila del grupo elegido. |
| `F2` | **El assert central.** Tildar/destildar con filtro puesto, volver a "Todo", y el vector de `checked` de las 9 filas es **exactamente** el esperado — fila por fila, no por conteo. |
| `F2b` | Además: filtrar y desfiltrar **sin tocar nada** deja el vector de `checked` idéntico al inicial. Cubre el caso de que el filtro por sí solo pise la selección. |
| `F3` | Con filtro puesto, `cobrosEmitir` arma `cobEmitirIds` con los ids **tildados**, incluidos los de filas ocultas — se compara el conjunto de ids, ordenado. |
| `F3b` | Y el importe del resumen del modal es la suma de lo tildado, no de lo visible. |

`F2` compara el vector completo `[true,false,true,…]` contra el esperado, no `count(checked)`.
Es la lección de GOTCHA #77: contar no es verificar estado. Dos filas que se intercambian el
tilde dan el mismo conteo y son un recibo distinto.

---

# 4. EL TOTAL Y EL BOTÓN

## Qué muestra "TOTAL SELECCIONADO" con filtro puesto

**Lo tildado, visible u oculto** — sin cambiarle una línea a `cobrosRecalc` (ver punto 3.2). El
rótulo ya dice "SELECCIONADO", no "VISIBLE", así que sigue siendo cierto.

## Cómo se entera el operador de que hay tildado fuera del filtro

Esto es lo que hoy no existe y sin lo cual el filtro es peligroso. **El caso concreto:** las
filas nacen **todas tildadas**. Si Valeria filtra "Incentivos" y emite sin más, el recibo
incluye los premios que nunca vio. El filtro por sí solo no arregla su problema — lo empeora.

Se agrega una **segunda fila de `<tfoot>`**, presente sólo cuando hay filtro activo **y** hay
tildadas ocultas:

```
┌──────────────────────────────────────────────────────────────────┐
│ TOTAL SELECCIONADO                                    $ 150.000  │
│ ⚠ 6 línea(s) tildada(s) fuera del filtro · $ 92.000 —            │
│   el recibo LAS INCLUYE.                        [ Ver todo ]     │
└──────────────────────────────────────────────────────────────────┘
```

- Se pinta con `var(--danger)`, no con `--muted`: es un aviso, no una nota al pie.
- Dice **"el recibo las incluye"**, en presente y afirmativo. No "revisá" ni "atención".
- `[ Ver todo ]` es el mismo `cobrosFiltrar('todo')` — un click para ir a mirarlas.
- Se recalcula dentro de `cobrosRecalc`, así que se actualiza al tildar, al destildar y al
  cambiar de filtro, sin ningún listener nuevo.
- Con filtro en "Todo" **no aparece nunca**, aunque haya destildadas: no hay nada oculto.

### Segundo control, ya existente

El modal de cobrador ya muestra `N línea(s) · $total` calculado sobre `.cob-chk:checked`
(`liquidaciones.html:1152`). Es un segundo punto de verificación antes del RPC, y sigue siendo
correcto sin tocarlo. No se agrega nada ahí: dos avisos del mismo hecho en dos pantallas
consecutivas se leen como uno solo y se saltean los dos.

| Assert | Qué prueba |
|---|---|
| `F4` | Con filtro puesto y tildadas ocultas, `#cob-total` es la suma de **todo lo tildado**, no de lo visible. |
| `F4b` | Destildar una fila **oculta** cambia el total. (Prueba que el total no está congelado ni acotado a lo visible.) |
| `F5` | El aviso aparece y nombra el conteo y el importe correctos de lo tildado-oculto. |
| `F5b` | Con filtro en "Todo" el aviso no está, aunque haya destildadas. |
| `F5c` | Con filtro puesto pero **cero** tildadas ocultas, el aviso no está. |

---

# 5. EL "TILDAR TODO"

## Qué hay hoy

Nada:

```
$ grep -n "selectAll\|toggleAll\|chk-all\|Tildar\|tildar\|Destildar\|indeterminate" liquidaciones.html
NO existe tildar/destildar todo
```

El único "Todos" del archivo es `<option value="">Todos los estados</option>`
(`liquidaciones.html:199`), que es el filtro de estado del panel de Liquidaciones — otra pantalla,
sin relación.

Verificado también que el `<th>` de la primera columna está vacío
(`liquidaciones.html:1115`: `<thead><tr><th></th><th>Fecha</th>…`) — no hay un checkbox maestro
escondido en la cabecera.

## Qué se agrega

Como pide el enunciado, **con filtro puesto opera sobre lo visible**, y el rótulo lo dice.
Los rótulos se reescriben en cada `cobrosFiltrar`:

| Filtro | Rótulos |
|---|---|
| Todo | `Tildar todo` · `Destildar todo` |
| Incentivos (3 visibles) | `Tildar los 3 visibles` · `Destildar los 3 visibles` |

El número va en el rótulo, no un genérico "(visibles)": es la diferencia entre leer una etiqueta
y leer una cantidad. Implementación:

```javascript
// PLAN — no aplicado
function cobrosTildarVisibles(valor){
  document.querySelectorAll('#cob-detalle tr.cob-row:not(.cob-row-oculta) .cob-chk')
    .forEach(c => { c.checked = valor; });
  cobrosRecalc();
}
```

El `:not(.cob-row-oculta)` es la única diferencia con un select-all normal, y es la que hace que
la operación respete el filtro.

## El tercer botón — y por qué el filtro solo no alcanza

Con filtro + tildar/destildar-visibles, el flujo de Valeria sigue siendo de dos pasos, porque
todo nace tildado:

1. Filtro "Todo" → `Destildar todo`
2. Filtro "Incentivos" → `Tildar los 3 visibles`

Funciona, pero obliga a pasar por "Todo" para poder limpiar lo que no se ve. Se propone un tercer
botón, visible **sólo cuando hay un filtro activo**:

```
Tildar sólo estos 3
```

que destilda **todas** las filas y tilda las visibles. Es, literalmente, la frase de Valeria
—*"destildo los demás y tildo solamente el incentivo"*— en un click, y su rótulo enuncia el
efecto completo, incluida la parte que ocurre fuera de la vista ("sólo"). No es un select-all
ambiguo: es una acción distinta, con nombre distinto.

Esto es una **decisión de producto**; siguiendo la convención del repo se deja anotada acá en vez
de resolverla sola. Si preferís que el cambio se limite a filtrar + tildar/destildar visibles,
se saca este botón y el resto del plan queda igual — es una función de tres líneas y un assert.
Se recomienda incluirlo: **sin él, el filtro no elimina el destildado a mano, que es el pedido.**

| Assert | Qué prueba |
|---|---|
| `F6` | `Tildar visibles` con filtro puesto tilda **sólo** las visibles y deja las ocultas como estaban (vector completo). |
| `F6b` | `Destildar visibles` con filtro puesto destilda **sólo** las visibles; una oculta tildada sigue tildada. |
| `F6c` | Sin filtro, opera sobre las 9 filas. |
| `F7` | `Tildar sólo estas` deja tildadas exactamente las visibles y ninguna otra. |
| `F8` | El rótulo del botón contiene la cantidad de visibles cuando hay filtro. |
| `F8b` | Y **no** dice "visibles" cuando el filtro es "Todo". |

---

# PROBE

`tests/probe_filtro_concepto_pagos.mjs` — real-code, sin browser, patrón vigente
(`tests/README.md` § *Browser NO disponible*).

## Forma

Extrae del `liquidaciones.html` real, por ancla y con balance de llaves, las funciones
`cobrosDetalle`, `cobrosFiltrar`, `cobrosRecalc`, `cobrosEmitir`, `cobrosTildarVisibles`,
`cobrosTildarSoloVisibles`, `cobrosRenderChips`, `grupoDeTipo` y `rolDeLinea`, y las corre con
`new AsyncFunction` inyectando el cliente Supabase real y stubs de DOM. **Nada se reimplementa
en el probe:** si el HTML cambia, el probe corre el HTML cambiado.

```bash
set -a; . ./.env; set +a
node tests/probe_filtro_concepto_pagos.mjs             # corrida normal
node tests/probe_filtro_concepto_pagos.mjs --mutantes  # mutation testing
```

## Lo que hay que construir para que sea real: un mini-DOM con selectores

Los probes anteriores stubbean `querySelectorAll: () => []` porque no lo necesitan. Acá **el
comportamiento bajo prueba ES el DOM**, así que hace falta un stub con filas de verdad: nodos
`<tr>` con `classList` respaldada por un `Set` real, un `<input>` con `checked` y `dataset`, y un
`querySelectorAll` que entienda **exactamente** los selectores que usa el código:

```
.cob-chk
.cob-chk:checked
#cob-detalle tr.cob-row
#cob-detalle tr.cob-row:not(.cob-row-oculta) .cob-chk
```

**Guard del arnés:** ante un selector que no esté en esa lista, el stub **tira**. Sin eso, si
alguien cambia un selector en el HTML el stub devuelve `[]` en silencio, el filtro no hace nada,
y el probe pasa en verde probando nada. Es la misma clase de falso verde del recibo #4.
Ese guard se testea a sí mismo con `F9`.

Las 9 filas del fixture se arman desde las líneas **reales** que devuelve `cobrosDetalle` contra
la base, no inventadas: `cobrosDetalle` corre de verdad, se le captura el HTML que escribe en
`#cob-detalle` y de ahí sale la tabla del mini-DOM. Así el probe también verifica que el `<tr>`
lleva `class="cob-row"` y `data-grupo` correcto — si el render se olvida del `data-grupo`, el
fixture nace roto y F1 muere.

## Fixtures y restore

- Se planta en el club de pruebas (`Mi Club Hípico`), no en Dolores — mismo criterio que
  `probe_anular_recibo_ui.mjs`.
- 9 líneas: 6 `premio` + 3 `incentivo_entrenador`, un solo beneficiario. Elegido para que los dos
  grupos tengan tamaños distintos: con 3 y 3, un bug que devuelva el grupo equivocado da el mismo
  conteo y no se detecta.
- **Restore por ESTADO**, con `tests/lib/estado_lineas.mjs`: `snapshotLineas` antes,
  `restaurarLineas` + `diffLineas` en el `finally`, más los dos asserts de rigor —`R1` quedó
  limpio, `R2` no hubo que restaurar nada— y `recibosDesde()` **sin filtro de club** (GOTCHA #76).
- `F3` **no llama a `emitir_recibo`.** Espía el borde: corre `cobrosEmitir` (que sólo arma
  `cobEmitirIds` y abre el modal) y asserta sobre `cobEmitirIds`. La emisión de verdad ya está
  cubierta por `probe_recibos_emision.mjs`; acá lo que se prueba es **qué ids se le mandan al
  RPC**, que es distinto y es el riesgo. Es la lección de GOTCHA #81: para saber si un guard
  corrió hay que espiar el borde del RPC, no el estado final.
- El probe **no** emite recibos, así que no toca `club_secuencias` y no hace falta restaurarla.

## Asserts

| ID | Assert |
|---|---|
| `F1` | filtrar por un grupo oculta TODAS las filas de los otros grupos |
| `F1b` | y no oculta ninguna del grupo elegido |
| `F1c` | volver a "Todo" no deja ninguna fila oculta |
| `F1d` | el `<tr>` renderizado trae `class="cob-row"` y el `data-grupo` correcto por línea |
| `F1e` | los chips que se renderizan son los grupos PRESENTES, con el conteo real; ninguno vacío |
| `F2` | **tildar con filtro → sacar el filtro → el vector de `checked` es exactamente el esperado** |
| `F2b` | filtrar y desfiltrar sin tocar nada deja el vector de `checked` idéntico |
| `F3` | `cobEmitirIds` = lo TILDADO (incluye ocultas), no lo visible — conjunto de ids ordenado |
| `F3b` | el importe del resumen del modal es la suma de lo tildado |
| `F4` | `#cob-total` con filtro puesto = suma de lo tildado, visible u oculto |
| `F4b` | destildar una fila OCULTA cambia el total |
| `F5` | el aviso de tildadas-fuera-del-filtro aparece con conteo e importe correctos |
| `F5b` | con filtro "Todo" el aviso no está, aunque haya destildadas |
| `F5c` | con filtro puesto y cero tildadas ocultas, el aviso no está |
| `F6` | `Tildar visibles` no toca las ocultas (vector completo) |
| `F6b` | `Destildar visibles` no toca las ocultas |
| `F6c` | sin filtro, opera sobre las 9 |
| `F7` | `Tildar sólo estas` deja tildadas exactamente las visibles |
| `F8` | el rótulo lleva la cantidad de visibles cuando hay filtro |
| `F8b` | y no dice "visibles" con filtro en "Todo" |
| `F9` | el mini-DOM tira ante un selector desconocido (guard del arnés) |
| `R1` | restore por ESTADO: las líneas quedaron como estaban |
| `R2` | y no hubo que restaurar nada a mano |
| `R3` | no quedaron recibos del probe en NINGÚN club |
| `R4` | no quedaron líneas del probe en la base |

## Mutation testing

Un mutante por comportamiento, como pediste. Cada uno neutraliza **una** cosa sobre una copia del
HTML en un tmpdir —el repo no se toca— y re-corre el probe con `LIQ_HTML` apuntando a la copia.

| # | Mutante | Debe matar |
|---|---|---|
| `M1` | `cobrosFiltrar` no aplica la clase (`toggle(..., false)` siempre) | `F1` |
| `M2` | el filtro invierte el match (`!==` por `===`) | `F1`, `F1b` |
| `M3` | **`cobrosFiltrar` re-renderiza en vez de ocultar** — el mutante del punto 3 | `F2` |
| `M4` | `cobrosFiltrar` pone `c.checked = visible` (el bug de "filtrar es seleccionar") | `F2`, `F2b` |
| `M5` | `cobrosEmitir` usa `tr.cob-row:not(.cob-row-oculta) .cob-chk:checked` — emite lo VISIBLE | `F3`, `F3b` |
| `M6` | `cobrosRecalc` suma sólo las visibles | `F4`, `F4b` |
| `M7` | el aviso de tildadas-ocultas nunca se renderiza | `F5` |
| `M8` | el aviso se renderiza siempre, también sin filtro | `F5b`, `F5c` |
| `M9` | `cobrosTildarVisibles` pierde el `:not(.cob-row-oculta)` — pisa las ocultas | `F6`, `F6b` |
| `M10` | `Tildar sólo estas` no destilda las ocultas primero | `F7` |
| `M11` | el rótulo se queda en "Tildar todo" con filtro puesto | `F8` |
| `M12` | el render del `<tr>` pierde el `data-grupo` | `F1d` |
| `M13` | los chips se arman desde el ENUM y no desde `cobLineas` (chip vacío) | `F1e` |
| `M14` | el mini-DOM devuelve `[]` ante selector desconocido en vez de tirar | `F9` |

`M3`, `M4` y `M5` son los tres que importan: son el punto 3 del pedido escrito como mutante.
Si alguno sobrevive, el probe no está probando lo que dice.

**Nota del arnés (GOTCHA #82):** el matcher de mutantes ancla en `` `❌ ${a})` ``, no en `\b`.
Con ids como `F1` y `F1b`, `\b` no separa `F1` de `F1b` (`1` y `b` son ambos `\w`) y un mutante
que mata `F1b` se reportaría como sobreviviente. El paréntesis del rótulo es el delimitador.

---

# RESUMEN

| | |
|---|---|
| Eje del filtro | `concepto_tipo` (ENUM, 6 valores). El texto `concepto` se descarta: 42 valores distintos para `premio`. |
| Grupos alcanzables en el detalle | 4 — Premios, Incentivos, Bonos, Actuación. `fondo_solidario` es del club y nunca llega. |
| Presentes hoy | 3 — `premio` (18 líneas), `incentivo_entrenador` (15), `incentivo_jockey` (3). 36 líneas pagables. |
| Máximo de grupos por beneficiario | **2**, medido. 8 de 9 beneficiarios: `premio` + un incentivo. |
| Control | Botones tipo pestaña, armados desde `cobLineas`, con conteo. 3 chips reales, 5 en el peor caso. |
| Mecánica | Ocultar filas con `.cob-row-oculta`. El checkbox nunca sale del DOM. |
| Diff en `cobrosEmitir` / `cobrosRecalc` | **Cero** en la selección: siguen leyendo `.cob-chk:checked`, que ignora la visibilidad. `cobrosRecalc` sólo suma el render del aviso. |
| Tildar todo hoy | **No existe** (grep sin resultados). Se agrega, con alcance visible y rótulo con la cantidad. |
| Aviso | 2ª fila de `<tfoot>`, en `--danger`, con conteo, importe y `[Ver todo]`. Sólo con filtro activo y tildadas ocultas. |
| Probe | `tests/probe_filtro_concepto_pagos.mjs` — 21 asserts `F*` + 4 de restore, 14 mutantes. |
| Fuera de alcance, respetado | modelo de recibos, `emitir_recibo`, agrupar por carrera, apoderados. |

---

# PREGUNTAS ABIERTAS

1. **¿Va el botón "Tildar sólo estas N"?** Es lo que Valeria pidió en un click. Recomendado
   incluirlo: sin él, el filtro reduce el destildado a mano pero no lo elimina, y el flujo obliga
   a volver a "Todo" para limpiar. Es la única decisión de producto del plan.
2. **¿Los dos incentivos van juntos en un chip o separados?** El plan los junta —ningún
   beneficiario tiene los dos (Q3)—, así que separarlos daría siempre un chip vacío. Si Fede
   prefiere ver "Incentivo jockey" / "Incentivo entrenador" con el nombre completo, se pone el
   rótulo del que esté presente en vez del genérico "Incentivos". Es un `if`.
3. **¿El filtro sobrevive al cambio de beneficiario?** El plan dice que **no**: abrir otro
   detalle arranca en "Todo". Un filtro pegajoso entre beneficiarios distintos es la forma de
   emitir un recibo incompleto sin enterarse — mismo criterio que `cobLimpiarPanelRecibo`
   (`liquidaciones.html:1046`), que descarta el panel al abrir otro detalle.
4. **¿Las líneas retenidas por doping entran al filtro?** El plan dice que no: son otra tabla,
   sin checkboxes, y no entran en ningún recibo. Si Valeria las quiere filtradas también, es un
   segundo control sobre la tabla de retenidas y no cambia nada de los puntos 3, 4 y 5.

---

# GATE

Este documento es el plan. **No se aplicó ningún cambio a `liquidaciones.html` ni se creó
`tests/probe_filtro_concepto_pagos.mjs`.** Con el OK, el diff va a `feat/filtro-concepto-pagos`,
pusheado, sin mergear.

---

# VERIFICACIÓN DE PUBLICACIÓN

Commit del plan: `d31dfb3a82826df047b5de15e7c297a41b1a316c` en `reports`.

```
$ git push -u origin reports
To github.com:mdqclio/SGH.git
   1b824a4..d31dfb3  reports -> reports
branch 'reports' set up to track 'origin/reports'.

$ git ls-remote origin reports
d31dfb3a82826df047b5de15e7c297a41b1a316c	refs/heads/reports

$ git rev-parse HEAD
d31dfb3a82826df047b5de15e7c297a41b1a316c

$ curl -s -o /dev/null -w "HTTP %{http_code} · %{size_download} bytes\n" \
    "https://raw.githubusercontent.com/mdqclio/SGH/reports/docs/diagnosticos/2026-08-30_plan-filtro-concepto-pagos.md"
HTTP 200 · 44922 bytes
```

El SHA de `git ls-remote` coincide con el de `git rev-parse HEAD`, y el archivo se sirve por raw
con 200. El commit está en `origin`.

*(Esta sección se agregó en un commit posterior — su propio SHA queda en el `git log` de la rama.)*
