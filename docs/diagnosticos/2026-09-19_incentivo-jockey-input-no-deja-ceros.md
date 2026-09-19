# Config. Comisiones — "no me deja ingresar los ceros" en Incentivo jockey (50.000 → 60.000)

- **Fecha**: 2026-09-19 (R9 es mañana 20/09)
- **Relevado contra**: `main` @ `ef7847218bfb47f06f72d9df814d1aba02a1a14c` (prod `sigh.com.ar/liquidaciones.html` md5 = main, ver §5)
- **Modo**: SOLO LECTURA. No se tocó código ni base. El diff de §6 es una propuesta, no está aplicado.
- **Guards**: `pwd` = `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` = **210** · ref `unlhcuanfrtpatoipwve`

---

## TL;DR

**Es un bug de UI, reproducible, chico.** El input es `type="text"` con `oninput="fmtInput(this)"`:
reformatea en **cada tecla** a `$N,00`. Al reasignar `el.value` el caret salta al final, así que el
siguiente `0` cae **después de `,00`** → `$6,000` → `parseMonto` lo lee como `6.000` = **6** → vuelve a
`$6,00`. Cada cero que Valeria tipea después del primer dígito se come. Si guarda así, a la base llega **6**
(no 60000).

- No hay `max`, `step` ni validación que limite el valor. La base guarda **pesos** (`NUMERIC(15,2)`, hoy `50000.00`).
- El parseo de guardado está bien (`"60000"` → 60000). El problema es sólo el reformateo por tecla.
- **Fix de 4 atributos**: `oninput` → `onblur` en los 4 inputs de monto (líneas 355, 356, 400, 408). §6.
- **Hoy, sin tocar código**: pegar `60000` de un saque (Ctrl+V) o seleccionar SOLO el `5` de `$50.000,00`
  y tipear `6`. Ambos dan `$60.000,00` → base 60000. Verificado en §4 (casos D y E).
- **SQL exacto** (no ejecutado) en §7. Es 1 fila de config; R9 tiene **0** liquidaciones; R6/R8 tienen
  todas las líneas de incentivo `pagado` (protegidas — memoria 10643/10644 del 19/09).

---

## 1. ¿Cómo es el input?

`liquidaciones.html:355` (main `ef78472`; idéntico en prod):

```html
        <div class="form-group"><label>Sereno (%)</label><input type="number" id="rp-sereno" min="0" max="100" step="0.001"></div>
        <div class="form-group"><label>Fondo solidario (%)</label><input type="number" id="rp-fondo" min="0" max="100" step="0.001"></div>
        <div class="form-group"><label>Incentivo jockey ($)</label><input type="text" id="rp-inc-jockey" placeholder="0" oninput="fmtInput(this)"></div>
        <div class="form-group"><label>Incentivo entrenador ($)</label><input type="text" id="rp-inc-entrenador" placeholder="0" oninput="fmtInput(this)"></div>
        <div class="form-group"><label>Días antidoping</label><input type="number" id="rp-antidoping" min="0" max="365"></div>
        <div class="form-group">
          <label>Monto fijo ($)</label>
          <input type="text" id="cf-monto" placeholder="0" oninput="fmtInput(this)">
        </div>
        <div class="form-group">
          <label>Posición bono</label>
          <input type="number" id="cf-pos-bono" min="1" max="10" placeholder="1">
        </div>
        <div class="form-group">
          <label>Monto bono ($)</label>
          <input type="text" id="cf-monto-bono" placeholder="0" oninput="fmtInput(this)">
        </div>
```

- `type="text"`, sin máscara de librería, sin `bindARSInput` (esa helper vive sólo en `resultados.html:477`;
  `liquidaciones.html` tiene su propio trío `formatMonto` / `parseMonto` / `fmtInput`, commit `302e684`
  del 2026-05-08 "Formato de montos con puntos y permisos por rol").
- El listener que reformatea mientras se escribe es `oninput="fmtInput(this)"` → `liquidaciones.html:547`:

```javascript
// liquidaciones.html:531-551 (main ef78472)
function formatMonto(num) {
  if (num === null || num === undefined || isNaN(num)) return '$0,00';
  const n = parseFloat(num);
  const signo = n < 0 ? '-' : '';
  const [entero, dec] = Math.abs(n).toFixed(2).split('.');
  const enteroFmt = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return signo + '$' + enteroFmt + ',' + dec;
}
function parseMonto(str) {
  if (str === null || str === undefined) return 0;
  const s = String(str).replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(s) || 0;
}
const fmt = formatMonto;
...
function fmtInput(el) {
  if (el.value.match(/,\d{0,1}$/)) return;   // deja tipear ",5" — pero ",00" ya son 2 dígitos y no matchea
  const v = parseMonto(el.value);
  el.value = v ? formatMonto(v) : '';
}
```

**Mecánica del bug**: `fmtInput` corre en cada `input`. Tecla `6` → `$6,00`. Asignar `el.value` mueve el
caret al final. Tecla `0` → el input queda `$6,000` → el guard `/,\d{0,1}$/` no matchea (3 dígitos tras la
coma) → `parseMonto("$6,000")` = `parseFloat("6.000")` = **6** → `formatMonto(6)` = `$6,00`. El cero
desapareció. Y así con cada cero.

Mismo bug en `cf-monto` (400) y `cf-monto-bono` (408) del modal de comisiones — nadie lo reportó porque
esos montos se cargan menos.

## 2. ¿Hay max / step / validación?

No. El input no tiene `min`, `max`, `step`, `pattern`, `maxlength` ni `required`. En `saveReparto()`
(`liquidaciones.html:604-631`) la única validación es que los **porcentajes** sumen 100; los incentivos
pasan por `parseMonto(...) || 0` y se mandan tal cual. En la base la columna es `NUMERIC(15,2) NOT NULL
DEFAULT 0`, sin CHECK. Nada limita 60000.

## 3. ¿En qué unidad se guarda?

**Pesos, con 2 decimales.** No hay conversión de unidad en ningún lado.

```sql
select column_name, data_type, numeric_precision, numeric_scale, column_default, is_nullable
  from information_schema.columns
 where table_name='liquidacion_config'
   and column_name in ('incentivo_jockey_monto','incentivo_entrenador_monto','updated_at','activo')
 order by ordinal_position;
```
```json
[{"column_name":"incentivo_jockey_monto","data_type":"numeric","numeric_precision":15,"numeric_scale":2,"column_default":"0","is_nullable":"NO"},
 {"column_name":"incentivo_entrenador_monto","data_type":"numeric","numeric_precision":15,"numeric_scale":2,"column_default":"0","is_nullable":"NO"},
 {"column_name":"activo","data_type":"boolean","numeric_precision":null,"numeric_scale":null,"column_default":"true","is_nullable":"NO"}]
```
(no hay `updated_at` en la tabla; la auditoría la hace el trigger `trg_audit_liquidacion_config`, ver §7).

```sql
select id, club_id, incentivo_jockey_monto, incentivo_entrenador_monto, activo, vigente_desde, vigente_hasta, created_at
  from liquidacion_config order by created_at;
```
```json
[{"id":"346c30f9-729e-468b-9abb-8e5c2f85cdea","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","incentivo_jockey_monto":"50000.00","incentivo_entrenador_monto":"10000.00","activo":true,"vigente_desde":"2026-06-02","vigente_hasta":null,"created_at":"2026-06-02 04:19:52.542081+00"}]
```

Una sola fila en toda la tabla (Dolores, activa). Valor actual **50000.00** — Valeria todavía no logró
guardar nada (ni el 6 ni el 60000).

Ida y vuelta: `openRepartoModal()` (598) muestra `formatMonto(50000)` = `$50.000,00`; `saveReparto()`
(617) manda `parseMonto(valor_del_input)`. El parseo en sí **no** come dígitos: `parseMonto("$60.000,00")`
= 60000, `parseMonto("60000")` = 60000, `parseMonto("60.000")` = 60000. El que come es `fmtInput` por tecla.

⚠️ Trampa lateral (no es este bug, pero vale saberla): `parseMonto("60000.00")` = **6000000** (el punto se
trata como separador de miles). Con el fix de §6 eso se **ve** en pantalla al salir del campo
(`$6.000.000,00`) antes de guardar; hoy ni siquiera se llega ahí.

## 4. Camino completo — simulación con las funciones reales del archivo

Harness sin browser (patrón `tests/README.md`): extrae `formatMonto`/`parseMonto`/`fmtInput` de
`liquidaciones.html` por ancla + balance de llaves y simula un `input` por tecla, con el caret al final
(que es lo que pasa al reasignar `el.value`).

Comando tal como se corrió (desde `main`):
```bash
node /tmp/claude-1000/-home-clio-dev-SGH/2be960c5-50ab-494b-82e6-a47c31f08413/scratchpad/sim_fmtinput.mjs liquidaciones.html
```
Script:
```javascript
// Simula tecleo en #rp-inc-jockey de liquidaciones.html con las funciones REALES del archivo
// (formatMonto / parseMonto / fmtInput extraídas por ancla). Sin browser, sin Supabase.
import { readFileSync } from 'node:fs';
const src = readFileSync(process.argv[2] || 'liquidaciones.html', 'utf8');
function extract(name) {
  const i = src.indexOf(`function ${name}(`);
  let d = 0, j = i;
  for (; j < src.length; j++) { if (src[j] === '{') d++; if (src[j] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, j + 1);
}
const code = ['formatMonto', 'parseMonto', 'fmtInput'].map(extract).join('\n');
const { fmtInput, parseMonto } = new Function(code + '\nreturn { fmtInput, parseMonto };')();

// oninput dispara en cada tecla; al reasignar el.value el caret salta al final,
// así que cada tecla siguiente se APPENDEA al valor ya formateado.
function tipear(inicial, teclas) {
  const el = { value: inicial };
  const log = [`inicial: "${el.value}"`];
  for (const t of teclas) { el.value += t; const antes = el.value; fmtInput(el); log.push(`tecla "${t}" → oninput ve "${antes}" → queda "${el.value}"`); }
  log.push(`parseMonto al guardar → ${parseMonto(el.value)}`);
  return log.join('\n');
}
const casos = [
  ['A) campo vacío (borró todo), tipea 60000', '', '60000'],
  ['B) campo vacío, tipea 60.000', '', '60.000'],
  ['C) campo vacío, tipea 60000,00', '', '60000,00'],
  ['D) pega "60000" de una sola vez (un solo oninput)', '', ['60000']],
  ['E) selecciona SOLO el 5 de $50.000,00 y tipea 6', '$6', ['0.000,00']],
];
for (const [t, ini, k] of casos) { console.log(`\n== ${t}`); console.log(tipear(ini, k)); }
// E: simular "seleccionar el 5 y tipear 6" = valor resultante "$60.000,00" en un solo oninput
console.log('\n== E bis) valor "$60.000,00" en un solo oninput');
{ const el = { value: '$60.000,00' }; fmtInput(el); console.log(`queda "${el.value}" → parseMonto ${parseMonto(el.value)}`); }
```
Salida cruda completa:
```

== A) campo vacío (borró todo), tipea 60000
inicial: ""
tecla "6" → oninput ve "6" → queda "$6,00"
tecla "0" → oninput ve "$6,000" → queda "$6,00"
tecla "0" → oninput ve "$6,000" → queda "$6,00"
tecla "0" → oninput ve "$6,000" → queda "$6,00"
tecla "0" → oninput ve "$6,000" → queda "$6,00"
parseMonto al guardar → 6

== B) campo vacío, tipea 60.000
inicial: ""
tecla "6" → oninput ve "6" → queda "$6,00"
tecla "0" → oninput ve "$6,000" → queda "$6,00"
tecla "." → oninput ve "$6,00." → queda "$6,00"
tecla "0" → oninput ve "$6,000" → queda "$6,00"
tecla "0" → oninput ve "$6,000" → queda "$6,00"
tecla "0" → oninput ve "$6,000" → queda "$6,00"
parseMonto al guardar → 6

== C) campo vacío, tipea 60000,00
inicial: ""
tecla "6" → oninput ve "6" → queda "$6,00"
tecla "0" → oninput ve "$6,000" → queda "$6,00"
tecla "0" → oninput ve "$6,000" → queda "$6,00"
tecla "0" → oninput ve "$6,000" → queda "$6,00"
tecla "0" → oninput ve "$6,000" → queda "$6,00"
tecla "," → oninput ve "$6,00," → queda "$6,00,"
tecla "0" → oninput ve "$6,00,0" → queda "$6,00,0"
tecla "0" → oninput ve "$6,00,00" → queda "$6,00"
parseMonto al guardar → 6

== D) pega "60000" de una sola vez (un solo oninput)
inicial: ""
tecla "60000" → oninput ve "60000" → queda "$60.000,00"
parseMonto al guardar → 60000

== E) selecciona SOLO el 5 de $50.000,00 y tipea 6
inicial: "$6"
tecla "0.000,00" → oninput ve "$60.000,00" → queda "$60.000,00"
parseMonto al guardar → 60000

== E bis) valor "$60.000,00" en un solo oninput
queda "$60.000,00" → parseMonto 60000
```

Lectura:
- **A/B/C** — lo que hace cualquiera (borrar y tipear 60000, con o sin punto, con o sin `,00`): queda
  `$6,00` y **si guarda, a la base llega 6**. Es exactamente "no me deja ingresar los ceros".
- **D** — pegar `60000` de una sola vez: un solo `input`, `$60.000,00`, base **60000**. ✔
- **E** — seleccionar sólo el `5` de `$50.000,00` y tipear `6`: un solo `input` con `$60.000,00`, base **60000**. ✔
- Camino de guardado (`saveReparto` 604-631): `update liquidacion_config set {…, incentivo_jockey_monto: 60000, …}
  where id = '346c30f9-…'` (hay `liqConfig.id`, así que es UPDATE, no INSERT). Sin más validación.
  `liquidaciones-engine.js:116` lo lee con `parseFloat(liqConfig.incentivo_jockey_monto) || 0` al generar.

## 5. Prod = main

```bash
curl -s "https://sigh.com.ar/liquidaciones.html?v=$RANDOM" -o prod_liq.html
git show main:liquidaciones.html > local_liq.html
md5sum local_liq.html prod_liq.html
```
```
ef57d92f0794a9724c2df52608c68279  local_liq.html
ef57d92f0794a9724c2df52608c68279  prod_liq.html
```
`grep -n 'oninput="fmtInput' prod_liq.html` → líneas 355, 356, 400, 408 (las mismas 4).

## 6. Fix propuesto (NO aplicado) — 4 atributos

Formatear al **salir** del campo en vez de en cada tecla. `parseMonto` ya acepta el valor crudo
(`60000`, `60.000`, `$60.000,00`), y el botón Guardar dispara `blur` antes del `click`, así que el usuario
ve `$60.000,00` antes de que salga el UPDATE. No cambia `fmtInput`, `parseMonto`, `formatMonto` ni
`saveReparto`.

```diff
--- a/liquidaciones.html	2026-09-19 17:49:01.228619647 +0000
+++ b/liquidaciones.html	2026-09-19 17:49:01.227619643 +0000
@@ -352,8 +352,8 @@
         <div class="form-group"><label>Capataz (%)</label><input type="number" id="rp-capataz" min="0" max="100" step="0.001"></div>
         <div class="form-group"><label>Sereno (%)</label><input type="number" id="rp-sereno" min="0" max="100" step="0.001"></div>
         <div class="form-group"><label>Fondo solidario (%)</label><input type="number" id="rp-fondo" min="0" max="100" step="0.001"></div>
-        <div class="form-group"><label>Incentivo jockey ($)</label><input type="text" id="rp-inc-jockey" placeholder="0" oninput="fmtInput(this)"></div>
-        <div class="form-group"><label>Incentivo entrenador ($)</label><input type="text" id="rp-inc-entrenador" placeholder="0" oninput="fmtInput(this)"></div>
+        <div class="form-group"><label>Incentivo jockey ($)</label><input type="text" id="rp-inc-jockey" placeholder="0" onblur="fmtInput(this)"></div>
+        <div class="form-group"><label>Incentivo entrenador ($)</label><input type="text" id="rp-inc-entrenador" placeholder="0" onblur="fmtInput(this)"></div>
         <div class="form-group"><label>Días antidoping</label><input type="number" id="rp-antidoping" min="0" max="365"></div>
       </div>
     </div>
@@ -397,7 +397,7 @@
         </div>
         <div class="form-group">
           <label>Monto fijo ($)</label>
-          <input type="text" id="cf-monto" placeholder="0" oninput="fmtInput(this)">
+          <input type="text" id="cf-monto" placeholder="0" onblur="fmtInput(this)">
         </div>
         <div class="form-group">
           <label>Posición bono</label>
@@ -405,7 +405,7 @@
         </div>
         <div class="form-group">
           <label>Monto bono ($)</label>
-          <input type="text" id="cf-monto-bono" placeholder="0" oninput="fmtInput(this)">
+          <input type="text" id="cf-monto-bono" placeholder="0" onblur="fmtInput(this)">
         </div>
         <div class="form-group">
           <label>Desc. fondo solidario (%)</label>
```

Cobertura del fix con el mismo harness: caso **D** (un solo evento con `"60000"`) es exactamente lo que
ve `onblur` → `$60.000,00` → 60000. Si lo aplicamos hoy: rama `fix/liquidaciones-fmtinput-onblur`, probe
`tests/probe_fmtinput_onblur.mjs` (el script de §4 con assert de que el archivo ya no tiene
`oninput="fmtInput` y de que A/B/C dan 60000 con un único evento), merge `--no-ff`, md5 contra
`sigh.com.ar`. ~15 min.

Alternativa más grande (no para hoy): pasar los 4 inputs a `bindARSInput` como pide `CLAUDE.md`
(§Dinero) — implica traer la helper de `resultados.html` a un `.js` compartido. Queda para ISSUE.

## 7. Plan B — UPDATE directo (NO ejecutado)

Es una fila de configuración por club; la única fila de la tabla. Impacto: **cero sobre plata ya
liquidada**. R9 no tiene liquidaciones generadas (query abajo); R6/R8 tienen todas las líneas de
incentivo en `estado_linea='pagado'` y el motor paid-safe no las recalcula (memoria 10643/10644, 19/09).
El trigger `trg_audit_liquidacion_config` deja el diff en `auditoria` (con MCP, `usuario` = null).

```sql
select (select count(*) from liquidaciones where reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9') as liq_r9,
       (select count(*) from spcs) as spcs,
       (select tgname from pg_trigger where tgname='trg_audit_liquidacion_config') as trigger_audit;
```
```json
[{"liq_r9":0,"spcs":210,"trigger_audit":"trg_audit_liquidacion_config"}]
```

UPDATE exacto, con el valor viejo en el WHERE para que sea idempotente y no pise nada si Valeria
lo llega a guardar antes por la UI (con el workaround de §TL;DR):

```sql
UPDATE liquidacion_config
   SET incentivo_jockey_monto = 60000
 WHERE id = '346c30f9-729e-468b-9abb-8e5c2f85cdea'
   AND club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
   AND activo = true
   AND incentivo_jockey_monto = 50000;
-- esperado: UPDATE 1 (UPDATE 0 = alguien ya lo cambió; mirar antes de insistir)
```

Control después:
```sql
select id, incentivo_jockey_monto, incentivo_entrenador_monto, activo
  from liquidacion_config where club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c';
-- esperado: 1 fila, incentivo_jockey_monto = 60000.00, entrenador sigue 10000.00
```

Si Valeria guardó **6** sin darse cuenta (caso A/B/C de §4), el mismo UPDATE con
`AND incentivo_jockey_monto = 6` lo corrige. La pantalla Config. Comisiones muestra el valor vigente al
abrir la solapa (`loadReparto`, línea 583) — con eso se chequea qué quedó.

## 8. Resumen en números

| | |
|---|---|
| Inputs afectados | 4 (`rp-inc-jockey`, `rp-inc-entrenador`, `cf-monto`, `cf-monto-bono`) |
| Líneas a tocar en el fix | 4 atributos (355, 356, 400, 408) |
| Filas en `liquidacion_config` | 1 (Dolores, activa, `50000.00` / `10000.00`) |
| Liquidaciones de R9 | 0 |
| Valor que llega a la base si guarda "como sale" | **6** |
| Bug presente desde | `302e684` 2026-05-08 |

## 9. Preguntas abiertas

1. ¿Aplicamos el fix hoy (§6) o va SQL (§7) y el fix el lunes? Recomendación: **las dos**, SQL primero
   si Valeria necesita verlo ya; el fix igual porque los otros 3 inputs tienen el mismo problema.
2. ¿El incentivo de **entrenador** (10.000) también cambia para R9? No lo dijo nadie; no se toca.
3. ISSUE nuevo para unificar formateo de dinero (`bindARSInput` compartido) — deuda, no para esta semana.

## 10. Verificación de push

```bash
git push -u origin reports
git ls-remote origin reports
git rev-parse HEAD
```
```
b75db86cb03a2cc1ccf686f78b99f7a82712487b	refs/heads/reports
b75db86cb03a2cc1ccf686f78b99f7a82712487b
```
(este commit de verificación se agrega encima; ver `git log -1 reports`.)
