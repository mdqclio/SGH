# Recibo de cobro — el pie no se separa de las líneas + captura del cobrador

| | |
|---|---|
| **Fecha** | 2026-08-28 |
| **Branch** | `fix/recibo-pie-cobrador` (pusheada, **NO** mergeada a `main`) |
| **Commits** | `a23c0cc` (fix principal) + `8a19800` (margin del body + precisión de la causa) |
| **Base** | `73428dd` |
| **Archivo tocado** | `liquidaciones.html` (único) |

**Guards verificados al arrancar:**

```
pwd                      → /home/clio/dev/SGH
SELECT count(*) FROM spcs → 181
project ref              → unlhcuanfrtpatoipwve
```

---

## 1. TAREA 0 — qué es el recibo nuevo

**Es real, no es una prueba en sandbox.** Recibo **N° 4**, sobre la **reunión 8** (16/08/2026,
Dolores), 6 líneas de `liquidacion_detalle` que estaban impagas y **quedaron pagadas de verdad**.
No es la reunión de prueba 9999 (ésa tiene los recibos 9001/9002, aparte).

Es exactamente el caso que describió Fede: entrenadora con 3 incentivos de $10.000 más un 3°, un
4° y un 5° puesto — 6 líneas. Alguien lo emitió para reproducir el bug de impresión, y al hacerlo
cobró líneas reales.

### Query 1 — todos los recibos

```sql
SELECT r.numero_recibo, r.beneficiario_tipo, r.forma_pago, r.neto_a_cobrar,
       r.cobrador_nombre, r.cobrador_documento, r.emitido_por, r.emitido_at,
       coalesce(p.nombre, pr.nombre||' '||pr.apellido) AS beneficiario,
       (SELECT count(*) FROM liquidacion_detalle d WHERE d.recibo_id = r.id) AS lineas
FROM recibos r
LEFT JOIN propietarios p ON p.id = r.propietario_id
LEFT JOIN profesionales pr ON pr.id = r.profesional_id
ORDER BY r.numero_recibo;
```

Salida cruda:

```json
[{"numero_recibo":1,"beneficiario_tipo":"propietario","forma_pago":"efectivo","neto_a_cobrar":"70000.00","cobrador_nombre":null,"cobrador_documento":null,"emitido_por":null,"emitido_at":"2026-08-16 18:46:44.652601+00","beneficiario":"QUINTEROS, CARLA ELISABETH","lineas":1},
 {"numero_recibo":2,"beneficiario_tipo":"propietario","forma_pago":"efectivo","neto_a_cobrar":"100000.00","cobrador_nombre":null,"cobrador_documento":null,"emitido_por":null,"emitido_at":"2026-08-28 12:58:16.28662+00","beneficiario":"MAR DEL TUYU","lineas":1},
 {"numero_recibo":3,"beneficiario_tipo":"profesional","forma_pago":"efectivo","neto_a_cobrar":"60000.00","cobrador_nombre":null,"cobrador_documento":null,"emitido_por":null,"emitido_at":"2026-08-28 14:10:26.492625+00","beneficiario":"DANIEL PRESA","lineas":2},
 {"numero_recibo":4,"beneficiario_tipo":"profesional","forma_pago":"efectivo","neto_a_cobrar":"62700.00","cobrador_nombre":null,"cobrador_documento":null,"emitido_por":null,"emitido_at":"2026-08-28 18:13:59.248561+00","beneficiario":"LORENA SOLEDAD VARELA","lineas":6},
 {"numero_recibo":9001,"beneficiario_tipo":"profesional","forma_pago":"efectivo","neto_a_cobrar":"0.00","cobrador_nombre":null,"cobrador_documento":null,"emitido_por":null,"emitido_at":"2026-06-10 02:33:53.506047+00","beneficiario":"DARIO GATICA","lineas":2},
 {"numero_recibo":9002,"beneficiario_tipo":"propietario","forma_pago":"efectivo","neto_a_cobrar":"0.00","cobrador_nombre":null,"cobrador_documento":null,"emitido_por":null,"emitido_at":"2026-06-10 02:33:53.506047+00","beneficiario":"AFFOLTER, EMILIANO MATIAS","lineas":2}]
```

### El recibo #4 en detalle

| campo | valor |
|---|---|
| `id` | `b670cfc5-ec4f-4c8f-8452-8c892c597f41` |
| `numero_recibo` | **4** |
| reunión | **R8** — 2026-08-16 — **real** |
| beneficiario | `profesional` `efda8456-9edc-4dbb-aa51-26eb2c0b07d6` = **LORENA SOLEDAD VARELA**, entrenadora |
| forma de pago | `efectivo` |
| neto | **$62.700** |
| líneas | **6** |
| `cobrador_nombre` / `cobrador_documento` | **NULL / NULL** ← lo que este trabajo viene a arreglar |
| `emitido_por` | **NULL** — el RPC no lo setea, **no hay traza de qué usuario lo emitió** |
| `emitido_at` | `2026-08-28 18:13:59Z` = **15:13 ART** |

### Query 2 — las 6 líneas

```sql
SELECT ld.concepto, ld.concepto_tipo, ld.posicion, ld.monto_neto, ld.estado_linea, ld.pagado_at,
       c.numero_turno, c.numero_carrera_programa, r.numero AS reunion, r.fecha
FROM liquidacion_detalle ld
LEFT JOIN carreras c ON c.id = ld.carrera_id
LEFT JOIN reuniones r ON r.id = ld.reunion_id
WHERE ld.recibo_id = 'b670cfc5-ec4f-4c8f-8452-8c892c597f41'
ORDER BY c.numero_turno, ld.orden_display;
```

| concepto | tipo | pos | neto | turno | carrera | reunión |
|---|---|---|---|---|---|---|
| Carrera 1 — 3° puesto | premio | 3 | $12.200 | 2 | C1 | 8 |
| Carrera 7 — 5° puesto | premio | 5 | $10.000 | 3 | C7 | 8 |
| Carrera 2 — 4° puesto | premio | 4 | $10.500 | 12 | C2 | 8 |
| Incentivo entrenador | incentivo_entrenador | — | $10.000 | — | — | 8 |
| Incentivo entrenador | incentivo_entrenador | — | $10.000 | — | — | 8 |
| Incentivo entrenador | incentivo_entrenador | — | $10.000 | — | — | 8 |

Las 6 quedaron `estado_linea = 'pagado'`, `pagado_at = 2026-08-28 18:13:59.248561+00`, con
`recibo_id` apuntando al #4.

### Query 3 — por qué NO es el saldado administrativo

```sql
SELECT pagado_at, count(*) AS lineas, count(recibo_id) AS con_recibo
FROM liquidacion_detalle WHERE pagado_at IS NOT NULL GROUP BY 1 ORDER BY 1;
```

Salida cruda:

```json
[{"pagado_at":"2026-08-16 18:46:44.652601+00","lineas":1,"con_recibo":1},
 {"pagado_at":"2026-08-28 12:58:16.28662+00","lineas":1,"con_recibo":1},
 {"pagado_at":"2026-08-28 14:10:26.492625+00","lineas":2,"con_recibo":2},
 {"pagado_at":"2026-08-28 15:00:00+00","lineas":332,"con_recibo":0},
 {"pagado_at":"2026-08-28 18:13:59.248561+00","lineas":6,"con_recibo":6}]
```

El saldado administrativo es el bloque de **332 líneas** con el timestamp fijo
`2026-08-28 15:00:00+00` (= 12:00 ART) y **sin recibo**. El recibo #4 está a las **18:13:59Z**,
tres horas después, con recibo — es otra cosa.

Además `emitir_recibo` v1.1 sólo toma líneas `estado_linea = 'impago'`
(`migrations/emitir_recibo_v1_1.sql`), así que **esas 6 líneas estaban impagas** antes: el saldado
no las había tocado. **Son cobro real sobre R8.**

### Números de resumen

| | |
|---|---|
| recibos totales | 6 (4 reales de R8 + 2 de la reunión de prueba 9999) |
| líneas con `recibo_id` | **14** = 1 + 1 + 2 + 6 (R8) + 4 (R9999) |
| líneas del saldado administrativo | 332, sin recibo, timestamp fijo 12:00 ART |
| recibos emitidos hoy | 3 — #2 (09:58 ART, 1 línea), #3 (11:10 ART, 2 líneas), #4 (15:13 ART, 6 líneas) |
| todos con cobrador | **NULL** (la UI mandaba `null`) |

**Sólo reporte, como se pidió. No se tocó ni una fila.**

---

## 2. CAMBIO 1 — el pie no se separa de las líneas

### Diagnóstico

El código viejo (`liquidaciones.html:119`):

```css
.recibo-copia { max-width: 700px; margin: 0 auto; padding: 20px;
                min-height: 100vh; display: flex; flex-direction: column;
                box-sizing: border-box; }
```

y la firma con `margin-top: auto`, es decir **anclada al fondo de esa caja**.

La caja mide **una página entera por declaración**, no por contenido. Entonces cualquier
milímetro de más la desborda, y lo primero que cae del otro lado del corte es justamente lo que
está anclado abajo de todo: el pie.

Lo que la desbordaba:

1. **`body { margin }` sin resetear.** El bloque `@media print` fijaba `background`, `color` y
   `font-family` del body, pero **no `margin`** — quedaba el default del browser, 8px
   (≈2,12mm arriba + 2,12mm abajo). Ese margen va **afuera** de la caja, así que se suma
   a los 100vh. Con `100vh` = área imprimible (267mm), el total ya da 269,1mm > 267mm →
   desborde garantizado. Esto lo arregla `8a19800`.
2. **`vh` en impresión.** Según el motor, `100vh` puede resolver contra el *page box* (A4 =
   297mm) en vez de contra el área imprimible (297 − 2×15mm = 267mm). Si resuelve así, la caja
   sola ya se pasa 30mm.
3. **`padding: 20px`** propio (queda adentro por `box-sizing: border-box`, así que éste no suma,
   pero achica el espacio útil).

### El contenido nunca fue el problema

Presupuesto en mm del recibo de 6 líneas **con el CSS viejo** (96dpi, `line-height` normal):

| bloque | mm |
|---|---|
| rótulo ORIGINAL/DUPLICADO | 3,8 |
| header (logo 100px + títulos + borde) | 46,4 |
| línea "Beneficiario" (`<p>` con márgenes de 1em) | 12,3 |
| `margin-top` de la tabla + `thead` | 11,2 |
| 6 filas × 8,04mm | 48,2 |
| bloque de totales (3 `<p>` con márgenes de 1em) | 27,0 |
| firma | 4,8 |
| **contenido real** | **≈ 154mm** |
| + `padding: 20px` de la copia | 10,6 |
| **total** | **≈ 165mm** |

Contra 267mm de hoja útil. **El recibo de Fede entraba de sobra.** No se iba a la hoja siguiente
por largo: se iba porque la caja estaba *declarada* del alto de una página y el margen del body
la empujaba afuera.

**Corolario incómodo:** bajo este mecanismo, los recibos #1, #2 y #3 (de 1 y 2 líneas) **también**
imprimían el pie huérfano. Fede lo reportó recién ahora con el #4, pero el defecto no dependía de
la cantidad de líneas. Vale la pena confirmarlo reimprimiendo el #1 con el código viejo.

### (a) Qué regla se eligió y por qué

`break-inside: avoid` (+ `page-break-inside: avoid` legacy) sobre un bloque nuevo `.recibo-pie`
que envuelve **total + quién retira + firma**:

```css
.recibo-pie { break-inside: avoid; page-break-inside: avoid; margin-top: 10px; }
```

Por qué ésa y no otra:

- **`break-before: avoid` / `break-after: avoid` no sirven acá**: Chrome no los implementa en
  impresión. Habría sido la regla "natural" para decir *no cortes justo antes del pie*, pero se
  ignora en silencio y el bug seguiría.
- **`break-inside: avoid` sí lo respeta Chrome**, y alcanza: si el pie es un bloque atómico, o
  entra entero en la hoja donde vienen las líneas, o baja entero — nunca se parte al medio, y
  nunca queda la firma sola sin el total.
- Pero la regla de break **sola no habría arreglado nada**: mientras la copia siguiera midiendo
  `min-height: 100vh` con la firma en `margin-top: auto`, el pie estaba anclado al fondo de una
  caja más alta que la hoja. Por eso el fix **saca `min-height`, saca el `flex` y saca
  `margin-top: auto`**, y deja que la copia fluya con alto natural. Se elimina la clase entera de
  falla en vez de apostar a cuál de las tres causas pesaba más.

### (b) Cuántas líneas entran ahora en una hoja

Layout compactado: logo 100→64px, padding de celda `7px 10px`→`3px 6px`, fuente de tabla
12→11px, márgenes de `<p>` colapsados a 1–2px, header 20→17px.

| | mm |
|---|---|
| alto fijo (rótulo + header + beneficiario + `thead` + pie completo) | ≈ 89,7 |
| alto de una fila | ≈ 5,6 |
| hoja útil A4 (297 − 2×15) | 267 |
| **filas que entran en una hoja** | **(267 − 89,7) / 5,6 ≈ 31** |

El caso de Fede (6 líneas) ocupa ≈ 123mm — **46% de la hoja**. Una copia por hoja, dos hojas en
total. Objetivo cumplido con margen amplio.

### (c) El caso extremo sigue andando

Con 20 líneas (≈ 202mm) todavía entra en **una** hoja por copia. Por encima de ~31 líneas la
tabla parte por hoja —el `thead` se repite solo, es `display: table-header-group` por defecto— y
el pie, al ser atómico, cae **entero al final de las líneas**. Que es exactamente lo que pidió
Fede para el caso extremo.

### Cómo se verificó el layout — y qué NO se pudo verificar

**Lo que se puede asertar sin browser** (y lo hace el probe):

- el CSS ya no tiene `min-height: 100vh` ni `margin-top: auto` en la copia/firma;
- `.recibo-pie` existe y tiene `break-inside: avoid` + `page-break-inside: avoid`;
- `body` en `@media print` tiene `margin: 0`;
- el HTML que **realmente genera** `imprimirReciboCobro` mete total + retira + firma **dentro**
  del mismo `.recibo-pie`, y hay exactamente 2 copias con 6 filas cada una;
- la aritmética de presupuesto en mm, recalculada a partir de los valores de CSS **parseados del
  archivo**, da ≤ 267mm para 6 líneas.

**Lo que NO se puede asertar sin browser:** el corte de página real. Chromium no corre en este
Ubuntu (`docs/SERVER.md`), así que **nadie midió una hoja de verdad**. El presupuesto en mm es
aritmética sobre el CSS, no una medición del render: da el orden de magnitud correcto, pero las
métricas exactas de fuente y el `line-height` real pueden mover algunos milímetros.

**Qué hay que mirar a ojo antes de dar OK** (Ctrl+P en `liquidaciones.html`, destino "Guardar como
PDF", A4, márgenes por defecto, **sin** "Gráficos de fondo"):

1. Emitir el recibo de 6 líneas → el PDF tiene que dar **exactamente 2 páginas**, no 4.
2. En cada página: firma / aclaración / DNI **debajo de las líneas, en la misma hoja**.
3. Que el rótulo ORIGINAL esté en la hoja 1 y DUPLICADO en la hoja 2 — que el `break-after: page`
   no se haya comido una hoja en blanco entre medio.
4. Un recibo de 1 línea: 2 páginas, sin hoja en blanco al final.
5. Un caso largo (>31 líneas, si se puede armar): la tabla parte, el `thead` se repite, y el pie
   cae entero al final.
6. Que el logo a 64px no quede pixelado ni desalineado del nombre del club.

---

## 3. CAMBIO 2 — el cobrador en el pie

### (a) Desplegable con titular + apoderados

Modal nuevo `#modal-cobrador`, previo a la emisión. `cobrosEmitir()` pasó de emitir directo a
juntar las líneas tildadas y abrir el modal; el RPC lo llama ahora `cobrosConfirmarEmision()`.

El select se arma con:

- **Titular** — `cobBenef.nombre`, con el documento traído de `docBenef()`
  (`propietarios.documento_nro` / `profesionales.documento_nro`);
- **un ítem por apoderado vigente** — los que ya consultaba `cobrosDetalle`, ahora cacheados en
  `cobApoderados` para que el modal los reuse sin volver a pegarle al servidor;
- **"Otro — cargar a mano"**.

Al elegir una opción se **completan** nombre y documento.

### (b) Se puede cargar a alguien que no está en la lista

**El select precarga; no bloquea.** Los dos inputs quedan editables siempre, en las tres opciones.
La opción "Otro" además los limpia para tipear de cero.

Es deliberado y es el caso mayoritario, no la excepción: hoy `apoderados` tiene **0 filas** y hay
**21 caballerizas** cuyo titular es un provisorio sin persona real detrás. Con un desplegable
cerrado, Valeria no podría emitir esos recibos. También cubre el titular real sin
`documento_nro` cargado: se precarga el nombre y el documento se completa a mano.

Se validan nombre y documento **no vacíos** antes de llamar al RPC. `emitir_recibo` recibe ahora
`p_cobrador_nombre` y `p_cobrador_documento` con valor real, nunca `null`.

### (c) Qué muestra el pie impreso

| | |
|---|---|
| a nombre de quién se cobra | `A nombre de: <beneficiario> — <rol/es>` |
| quién retira | `Retira: <nombre> — Doc. <documento>` |
| espacio para firma | Firma / Aclaración / DNI |

**Sin redundancia cuando es la misma persona:** si cobra el titular, imprime
`Retira: el titular — Doc. 12345678` en vez de repetir el nombre que ya está arriba. Se detecta
por el origen del select **y además** por comparación de texto normalizado (minúsculas, espacios
colapsados), porque alguien puede tipear al titular desde la opción "Otro".

Los datos del pie salen del `recibo` que devuelve el RPC (`RETURNING`), no del estado del modal:
el papel imprime exactamente lo que quedó persistido.

### (d) Transferencia

`emitir_recibo` ya tenía `p_forma_pago` y `p_comprobante_url`, y el enum `forma_pago_recibo` ya
tenía los dos valores:

```sql
SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
WHERE t.typname = 'forma_pago_recibo' ORDER BY e.enumsortorder;
-- forma_pago_recibo | efectivo
-- forma_pago_recibo | transferencia
```

Pero **la UI mandaba `'efectivo'` hardcodeado** y el recibo impreso **no distinguía**: siempre
imprimía el bloque de firma. Ahora:

- select de forma de pago en el modal, con campo de comprobante que **sólo aparece** en
  transferencia;
- en transferencia el recibo imprime `Forma de pago: TRANSFERENCIA — no requiere firma; se adjunta
  el comprobante.` (más la referencia del comprobante si se cargó) y **omite el bloque de firma**;
- en efectivo, el bloque de firma como siempre.

---

## 4. Diff completo

`git diff 73428dd..8a19800 -- liquidaciones.html` — 1 archivo, +183/−32.

```diff
diff --git a/liquidaciones.html b/liquidaciones.html
index e775c87..2e504ea 100644
--- a/liquidaciones.html
+++ b/liquidaciones.html
@@ -110,20 +110,47 @@
     /* RECIBO PRINT */
     .recibo-print { display: none; }
     @media print {
-      body { background: #fff !important; color: #000 !important; font-family: Arial, sans-serif; }
+      /* margin:0 — el default del browser (8px) se sumaba ARRIBA de una caja que ya medía una
+         página entera y empujaba el pie fuera de la hoja. El margen de la hoja lo pone @page. */
+      body { background: #fff !important; color: #000 !important; font-family: Arial, sans-serif; margin: 0; padding: 0; }
       .topbar, .tabs, .selector-bar, .liq-acciones, #toast-container { display: none !important; }
       .recibo-print { display: block; }
       .content { display: none; }
       .recibo-container { max-width: 700px; margin: 0 auto; padding: 20px; min-height: 100vh; display: flex; flex-direction: column; box-sizing: border-box; }
-      /* Recibo de Pagos: cada copia es una página entera; firma al pie via margin-top:auto. */
-      .recibo-copia { max-width: 700px; margin: 0 auto; padding: 20px; min-height: 100vh; display: flex; flex-direction: column; box-sizing: border-box; }
-      .recibo-copia:not(:last-child) { page-break-after: always; }
-      .recibo-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
-      .recibo-header h2 { font-size: 20px; }
-      .recibo-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
-      .recibo-table th, .recibo-table td { border: 1px solid #ccc; padding: 7px 10px; font-size: 12px; }
+      /* Recibo de Pagos — el pie (total + quién retira + firma) NUNCA se separa de las líneas.
+         Antes: .recibo-copia era min-height:100vh + flex column, con la firma anclada al fondo
+         por margin-top:auto. Esa caja mide UNA PÁGINA ENTERA por diseño, así que cualquier mm
+         de más la desborda y lo primero que se va a la hoja siguiente es justamente el pie.
+         Tres cosas la desbordaban, y sin browser acá no se puede medir cuál pesa más en cada
+         impresión (ver el informe): (1) el margin:8px del body, que se sumaba afuera de la caja;
+         (2) `vh` en impresión no resuelve contra el área imprimible (A4 menos el @page margin de
+         15mm = 267mm) sino contra el page box, según el motor; (3) el padding:20px propio.
+         Con original + duplicado el resultado eran 4 hojas en vez de 2 (caso Fede: entrenador con
+         3 incentivos + 3°/4°/5°). El fix elimina la clase entera de falla en vez de una causa:
+         la copia fluye con alto natural (sin min-height, sin flex, sin margin-top:auto) y el pie
+         es un bloque atómico. `break-before/after: avoid` NO sirve acá — Chrome no lo implementa
+         en impresión; el único control de corte que respeta es break-inside. Con 20 líneas la
+         tabla parte por hoja (el thead se repite solo: display:table-header-group por defecto) y
+         el pie cae entero al final de las líneas. */
+      .recibo-copia { width: 100%; box-sizing: border-box; }
+      .recibo-copia:not(:last-child) { break-after: page; page-break-after: always; }
+      .recibo-pie { break-inside: avoid; page-break-inside: avoid; margin-top: 10px; }
+      .recibo-rotulo { text-align: right; font-size: 11px; font-weight: bold; letter-spacing: 1px; }
+      .recibo-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
+      .recibo-header h2 { font-size: 17px; }
+      .recibo-header h3 { font-size: 15px; margin-top: 8px; }
+      .recibo-header p { margin: 2px 0; font-size: 11px; }
+      .recibo-logo { height: 64px; object-fit: contain; flex-shrink: 0; }
+      .recibo-benef { font-size: 12px; margin: 6px 0; }
+      .recibo-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
+      .recibo-table th, .recibo-table td { border: 1px solid #ccc; padding: 3px 6px; font-size: 11px; }
       .recibo-table th { background: #f0f0f0; }
-      .recibo-total { font-weight: 700; font-size: 14px; text-align: right; margin-top: 12px; }
+      .recibo-total { font-weight: 700; font-size: 13px; text-align: right; margin-top: 8px; }
+      .recibo-total p { margin: 1px 0; }
+      .recibo-cobrador { font-size: 12px; margin-top: 10px; }
+      .recibo-cobrador p { margin: 2px 0; }
+      .recibo-firma { display: flex; justify-content: center; gap: 30px; text-align: center; font-size: 11px; margin-top: 24px; }
+      .recibo-firma div { border-top: 1px solid #000; padding-top: 5px; }
       @page { size: A4; margin: 15mm; }
     }
     #toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; }
@@ -361,6 +388,49 @@
   </div>
 </div>
 
+<!-- MODAL COBRADOR (Fase 4 v1.2) — quién retira el pago + forma de pago.
+     Fede revirtió la decisión de no capturar cobrador: "se lleva una copia firmada, aclarada y
+     con número de documento por la persona que cobre". El select PRE-CARGA titular/apoderado,
+     pero los campos quedan editables: hoy `apoderados` tiene 0 filas y hay 21 caballerizas cuyo
+     titular es un provisorio sin persona real detrás — con un desplegable cerrado esos recibos
+     no se podrían emitir, y ése es el caso más frecuente, no la excepción. -->
+<div class="modal-overlay" id="modal-cobrador">
+  <div class="modal" style="max-width:560px;">
+    <div class="modal-header">
+      <h2>🧾 Emitir recibo</h2>
+      <button class="btn-close" onclick="closeModal('modal-cobrador')">✕</button>
+    </div>
+    <div class="modal-body">
+      <div id="cobr-resumen" style="font-size:13px;margin-bottom:14px;"></div>
+      <div class="form-group full">
+        <label>¿Quién cobra?</label>
+        <select id="cobr-quien" onchange="cobrosQuienCambio()"></select>
+      </div>
+      <div class="form-grid" style="margin-top:10px;">
+        <div class="form-group"><label>Nombre y apellido</label><input type="text" id="cobr-nombre" placeholder="Quien retira el pago"></div>
+        <div class="form-group"><label>Documento (DNI)</label><input type="text" id="cobr-doc" placeholder="Sin puntos"></div>
+      </div>
+      <div class="form-grid" style="margin-top:10px;">
+        <div class="form-group">
+          <label>Forma de pago</label>
+          <select id="cobr-forma" onchange="cobrosFormaCambio()">
+            <option value="efectivo">Efectivo</option>
+            <option value="transferencia">Transferencia</option>
+          </select>
+        </div>
+        <div class="form-group" id="cobr-comprobante-row" style="display:none;">
+          <label>Comprobante (URL / referencia)</label><input type="text" id="cobr-comprobante" placeholder="Opcional">
+        </div>
+      </div>
+      <div id="cobr-nota-firma" style="font-size:12px;color:var(--muted);margin-top:12px;"></div>
+    </div>
+    <div class="modal-footer">
+      <button class="btn-secondary" onclick="closeModal('modal-cobrador')">Cancelar</button>
+      <button class="btn-primary" onclick="cobrosConfirmarEmision()" id="btn-cobr-emitir">Emitir e imprimir</button>
+    </div>
+  </div>
+</div>
+
 <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 <script src="liquidaciones-engine.js"></script>
 <script>
@@ -737,6 +807,8 @@ async function loadResumen(){
 // PAGOS — Pagable = estado_linea='impago' (la retención se libera A MANO con liberar_linea).
 let cobLineas = [];        // líneas pagables del beneficiario seleccionado
 let cobBenef = null;       // {tipo, id, nombre}
+let cobApoderados = [];    // apoderados vigentes del beneficiario abierto (alimenta el select de cobrador)
+let cobEmitirIds = [];     // líneas tildadas al abrir el modal de cobrador
 let cobCaballerizas = [];  // {nombre, propietario_id} para resolver búsqueda por caballeriza
 // Mapas de carrera cacheados: no dependen del texto tipeado (el filtro por q es client-side y va
 // al final), sólo del scope de reunión. Sin esto cobrosBuscar pegaba 3 viajes al servidor por cada
@@ -752,6 +824,13 @@ function nombreBenef(tipo, id){
   if (tipo==='propietario') return propietariosMap[id]?.nombre || '(propietario)';
   const p = profesionales[id]; return p ? `${p.apellido}, ${p.nombre}` : '(profesional)';
 }
+// Documento del titular del beneficiario, para pre-cargar el campo del cobrador. Puede venir
+// vacío (21 caballerizas tienen titular provisorio sin persona real detrás) — por eso el campo
+// del modal es editable y no se valida contra este valor.
+function docBenef(tipo, id){
+  const p = (tipo==='propietario' ? propietariosMap[id] : profesionales[id]) || {};
+  return p.documento_nro || '';
+}
 // string de búsqueda por beneficiario: nombre/apellido/DNI (+ nombre_stud en propietarios)
 function benefSearch(tipo, id){
   if (tipo==='propietario'){ const p=propietariosMap[id]||{}; return [p.nombre,p.nombre_stud,p.documento_nro].filter(Boolean).join(' ').toLowerCase(); }
@@ -899,6 +978,7 @@ async function cobrosDetalle(tipo, id){
   ]);
   if (ePag) { toast(ePag.message,'error'); return; }
   const apoderados = apos||[];
+  cobApoderados = apoderados;   // los reusa el modal de cobrador al emitir
   cobLineas = pag||[];
   const retLineas = ret||[];
   // enriquecer: fecha de reunión + caballo/carrera (via inscripcion → carreras + spcs)
@@ -967,22 +1047,68 @@ async function habilitarLinea(lineaId, tipo, id){
   cobrosDetalle(tipo, id);   // refresca el detalle (pasa de retenida a pagable)
 }
 
-async function cobrosEmitir(){
-  const ids = [...document.querySelectorAll('.cob-chk:checked')].map(c=>c.value);
+// Emisión en 2 pasos: paso 1 junta las líneas tildadas y abre el modal de cobrador / forma de
+// pago; paso 2 (cobrosConfirmarEmision) llama al RPC. Fede revirtió la decisión previa de no
+// capturar cobrador: la copia se la lleva firmada, aclarada y con documento quien cobra.
+function cobrosEmitir(){
+  const chks = [...document.querySelectorAll('.cob-chk:checked')];
+  const ids = chks.map(c=>c.value);
   if (!ids.length) { toast('Seleccioná al menos una línea','error'); return; }
-  const forma = 'efectivo';   // todo efectivo (decisión Fede)
-  const comprobante = null;
-  if (!confirm(`Emitir recibo para ${cobBenef.nombre} por ${ids.length} línea(s)? Marca las líneas como pagadas.`)) return;
-  // Ya no se captura cobrador (decisión Fede). El RPC mantiene su firma; nombre/documento van null
-  // (recibos.cobrador_nombre/documento son TEXT nullable).
+  cobEmitirIds = ids;
+  const total = chks.reduce((t,c)=>t+(parseFloat(c.dataset.monto)||0),0);
+  document.getElementById('cobr-resumen').innerHTML =
+    `<strong>${escapeHtml(cobBenef.nombre)}</strong> · ${ids.length} línea(s) · <span style="color:var(--success)">${fmt(total)}</span>`;
+  // Titular + apoderados vigentes + "Otro". Es un pre-cargador, no un desplegable cerrado:
+  // los inputs quedan editables siempre (ver comentario del modal).
+  document.getElementById('cobr-quien').innerHTML =
+    [`<option value="titular">Titular — ${escapeHtml(cobBenef.nombre)}</option>`]
+    .concat(cobApoderados.map((a,i)=>`<option value="apo:${i}">Apoderado — ${escapeHtml(a.autorizado_nombre)}</option>`))
+    .concat([`<option value="otro">Otro — cargar a mano</option>`]).join('');
+  document.getElementById('cobr-forma').value = 'efectivo';
+  document.getElementById('cobr-comprobante').value = '';
+  cobrosQuienCambio();
+  cobrosFormaCambio();
+  document.getElementById('modal-cobrador').classList.add('open');
+}
+
+// El select sólo PRE-CARGA los campos; nunca los bloquea. 'otro' los deja en blanco para tipear.
+function cobrosQuienCambio(){
+  const v = document.getElementById('cobr-quien').value;
+  const nom = document.getElementById('cobr-nombre'), doc = document.getElementById('cobr-doc');
+  if (v === 'titular')      { nom.value = cobBenef?.nombre || ''; doc.value = docBenef(cobBenef.tipo, cobBenef.id); }
+  else if (v === 'otro')    { nom.value = ''; doc.value = ''; }
+  else { const a = cobApoderados[Number(v.split(':')[1])] || {}; nom.value = a.autorizado_nombre || ''; doc.value = a.autorizado_documento || ''; }
+}
+
+// Transferencia: no hay firma, se abrocha el comprobante (Fede). Sólo ahí se pide comprobante.
+function cobrosFormaCambio(){
+  const esTransfer = document.getElementById('cobr-forma').value === 'transferencia';
+  document.getElementById('cobr-comprobante-row').style.display = esTransfer ? '' : 'none';
+  document.getElementById('cobr-nota-firma').textContent = esTransfer
+    ? 'Transferencia: el recibo se imprime SIN espacio de firma — se abrocha el comprobante.'
+    : 'Efectivo: el recibo imprime firma, aclaración y documento de quien retira.';
+}
+
+async function cobrosConfirmarEmision(){
+  const nombre    = (document.getElementById('cobr-nombre').value||'').trim();
+  const documento = (document.getElementById('cobr-doc').value||'').trim();
+  const forma     = document.getElementById('cobr-forma').value;
+  const comprobante = (document.getElementById('cobr-comprobante').value||'').trim() || null;
+  if (!nombre)    { toast('Falta el nombre de quien cobra','error'); return; }
+  if (!documento) { toast('Falta el documento de quien cobra','error'); return; }
+  const origen = document.getElementById('cobr-quien').value;
+  const btn = document.getElementById('btn-cobr-emitir'); btn.disabled = true;
   const { data, error } = await sb.rpc('emitir_recibo', {
     p_club_id: CLUB_ID, p_beneficiario_tipo: cobBenef.tipo, p_beneficiario_id: cobBenef.id,
-    p_linea_ids: ids, p_forma_pago: forma, p_cobrador_nombre: null, p_cobrador_documento: null, p_comprobante_url: comprobante,
+    p_linea_ids: cobEmitirIds, p_forma_pago: forma,
+    p_cobrador_nombre: nombre, p_cobrador_documento: documento, p_comprobante_url: comprobante,
   });
+  btn.disabled = false;
   if (error) { toast(error.message,'error'); return; }
+  closeModal('modal-cobrador');
   const recibo = Array.isArray(data)?data[0]:data;
   toast(`Recibo N° ${recibo.numero_recibo} emitido`);
-  imprimirReciboCobro(recibo, ids);
+  imprimirReciboCobro(recibo, cobEmitirIds, { origen });
   cobrosBuscar();   // refresca la lista (las líneas pagadas ya no aparecen)
 }
 
@@ -1000,7 +1126,7 @@ function rolDeLinea(l){
   return ROL_POR_BENEFICIARIO[l.beneficiario_tipo] || '';
 }
 
-async function imprimirReciboCobro(recibo, lineaIds){
+async function imprimirReciboCobro(recibo, lineaIds, opts){
   // re-leer las líneas marcadas para el print
   const { data: lns, error: eLns } = await sb.from('liquidacion_detalle')
     .select('concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id').eq('recibo_id',recibo.id);
@@ -1026,36 +1152,56 @@ async function imprimirReciboCobro(recibo, lineaIds){
     return `<tr><td>${fecha}</td><td>${carrera}</td><td>${caballo}</td><td>${puesto}</td><td>${rolDeLinea(l)||'—'}</td><td>${l.concepto||''}</td><td style="text-align:right">${fmt(l.monto_neto)}</td></tr>`;}).join('');
   // Fetch del club con logo_url (el global `club` puede no tenerlo en el flujo de Pagos).
   const { data: cl } = await sb.from('clubs').select('nombre,domicilio,localidad,provincia,logo_url').eq('id', CLUB_ID).single();
-  // Recibo siempre en efectivo (decisión Fede) → siempre bloque de firma.
-  const firma = '<div style="margin-top:auto;display:flex;justify-content:center;gap:36px;text-align:center;font-size:11px;"><div style="border-top:1px solid #000;width:200px;padding-top:6px;">Firma</div><div style="border-top:1px solid #000;width:240px;padding-top:6px;">Aclaración</div><div style="border-top:1px solid #000;width:140px;padding-top:6px;">DNI</div></div>';
-  // Bloque reutilizable: UNA copia = contenedor de página entera (.recibo-copia: flex columna,
-  // min-height:100vh) con la firma al pie (margin-top:auto). Se imprimen 2 copias rotuladas
+  // Pie: quién retira + firma. Los datos salen del recibo recién creado (RETURNING del RPC),
+  // no del estado del modal — así el pie imprime exactamente lo que quedó persistido.
+  const cobNombre = recibo.cobrador_nombre || '';
+  const cobDoc    = recibo.cobrador_documento || '';
+  const norm = v => String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
+  // Si cobra el titular no se repite el nombre (ya está arriba en "A nombre de"). Se compara por
+  // origen del select y también por texto: alguien puede tipear al titular desde la opción 'Otro'.
+  const esTitular = opts?.origen === 'titular' || (!!cobNombre && norm(cobNombre) === norm(cobBenef?.nombre));
+  const quienRetira = cobNombre
+    ? `<p><strong>Retira:</strong> ${esTitular ? 'el titular' : escapeHtml(cobNombre)} — Doc. ${escapeHtml(cobDoc)||'—'}</p>`
+    : '';
+  // Transferencia: no se firma, se abrocha el comprobante (Fede). Efectivo: firma/aclaración/DNI.
+  const esTransfer = recibo.forma_pago === 'transferencia';
+  const firma = esTransfer
+    ? `<p><strong>Forma de pago:</strong> TRANSFERENCIA — no requiere firma; se adjunta el comprobante.</p>`
+      + (recibo.comprobante_url ? `<p style="font-size:10px;">Comprobante: ${escapeHtml(recibo.comprobante_url)}</p>` : '')
+    : '<div class="recibo-firma"><div style="width:200px;">Firma</div><div style="width:240px;">Aclaración</div><div style="width:140px;">DNI</div></div>';
+  // Bloque reutilizable: UNA copia con alto natural. Se imprimen 2 copias rotuladas
   // ORIGINAL / DUPLICADO (pedido Fede) — mismo contenido, distinto rótulo —, separadas por
-  // page-break-after:always (CSS .recibo-copia:not(:last-child)), con un solo window.print().
+  // break-after:page (CSS .recibo-copia:not(:last-child)), con un solo window.print().
+  // El pie (total + retira + firma) va en `.recibo-pie` con break-inside:avoid para que NUNCA
+  // se despegue de las líneas: sin eso, un recibo de 6 líneas mandaba el pie a la hoja 2 y las
+  // 2 copias salían en 4 hojas.
   const copia = (rotulo) => `<div class="recibo-copia">
-    <div style="text-align:right;font-size:12px;font-weight:bold;letter-spacing:1px;">${rotulo}</div>
+    <div class="recibo-rotulo">${rotulo}</div>
     <div class="recibo-header">
       <div style="display:flex;align-items:center;justify-content:center;gap:18px;">
-        ${cl?.logo_url ? `<img src="${cl.logo_url}" alt="${cl.nombre||''}" style="height:100px;object-fit:contain;flex-shrink:0;">` : ''}
+        ${cl?.logo_url ? `<img class="recibo-logo" src="${cl.logo_url}" alt="${cl.nombre||''}">` : ''}
         <div>
           <h2>${cl?.nombre||'SGH'}</h2>
           <p>${cl?.domicilio||''} — ${cl?.localidad||''}, ${cl?.provincia||''}</p>
         </div>
       </div>
-      <h3 style="margin-top:10px;">RECIBO DE PAGO N° ${recibo.numero_recibo}</h3>
+      <h3>RECIBO DE PAGO N° ${recibo.numero_recibo}</h3>
       <p>Fecha: ${new Date().toLocaleDateString('es-AR')}</p>
     </div>
-    <p><strong>Beneficiario:</strong> ${cobBenef?.nombre||'—'}${rolesLineas.length?` — <strong>${rolesLineas.join(' / ')}</strong>`:''}</p>
+    <p class="recibo-benef"><strong>A nombre de:</strong> ${cobBenef?.nombre||'—'}${rolesLineas.length?` — <strong>${rolesLineas.join(' / ')}</strong>`:''}</p>
     <table class="recibo-table">
       <thead><tr><th>Fecha</th><th>Carrera</th><th>Caballo</th><th>Puesto</th><th>Rol</th><th>Concepto</th><th>Neto</th></tr></thead>
       <tbody>${rows}</tbody>
     </table>
-    <div class="recibo-total">
-      <p>Total premios: ${fmt(recibo.total_premios)}</p>
-      <p>Descuentos: -${fmt(recibo.total_descuentos)}</p>
-      <p style="font-size:16px;">NETO A COBRAR: ${fmt(recibo.neto_a_cobrar)}</p>
+    <div class="recibo-pie">
+      <div class="recibo-total">
+        <p>Total premios: ${fmt(recibo.total_premios)}</p>
+        <p>Descuentos: -${fmt(recibo.total_descuentos)}</p>
+        <p style="font-size:15px;">NETO A COBRAR: ${fmt(recibo.neto_a_cobrar)}</p>
+      </div>
+      <div class="recibo-cobrador">${quienRetira}${esTransfer?firma:''}</div>
+      ${esTransfer?'':firma}
     </div>
-    ${firma}
   </div>`;
   // 2 copias rotuladas (mismo contenido). Original primero, duplicado en la 2ª hoja.
   document.getElementById('recibo-print').innerHTML = copia('ORIGINAL') + copia('DUPLICADO');
```

---

## 5. Probe

Pendiente en esta versión del informe — se agrega en el commit siguiente sobre esta misma branch.

---

## 6. Fuera de alcance — respetado

| límite | estado |
|---|---|
| no tocar `emitir_recibo` ni su firma | ✅ ni el RPC ni `migrations/` se tocaron; la firma ya aceptaba los 4 parámetros |
| no agregar columnas a `apoderados` | ✅ sólo lectura |
| no tocar el flag `es_prueba` de la 9999 | ✅ intacto |
| no construir `anular_recibo` | ✅ no existe y no se creó |
| no mergear a `main` | ✅ `main` sin tocar |

Sin cambios de schema. Sin DDL. Sin DML sobre producción en todo el trabajo.

---

## 7. Preguntas abiertas

1. **El recibo #4 quedó emitido con `cobrador_nombre = NULL`.** Son $62.700 cobrados de verdad
   sobre R8 sin registro de quién retiró. ¿Se deja así como dato histórico, se completa a mano en
   la base, o se anula y se reemite con el flujo nuevo? Anular no se puede hoy: `anular_recibo`
   no existe (Fede lo mencionó, quedó fuera de alcance). Mismo tema, menor, con #1, #2 y #3.
2. **`emitido_por` es NULL en los 6 recibos.** El RPC no lo setea, así que no hay traza de qué
   usuario emitió cada recibo. No es de este trabajo (tocaría el RPC), pero es una laguna de
   auditoría en un módulo de dinero. ¿Se abre issue?
3. **¿Los recibos #1–#3 también imprimían el pie huérfano?** El diagnóstico dice que sí, con
   independencia del número de líneas. Confirmarlo reimprimiendo el #1 con el código viejo.
4. **Documento obligatorio.** Hoy se exige documento no vacío también en transferencia. Si Valeria
   transfiere a un CBU sin tener el DNI a mano, la emisión se traba. ¿Se relaja sólo para
   transferencia?
5. **El pie no imprime el rol del cobrador** (titular / apoderado / tercero). Se sabe por el
   select, pero no se persiste ni se imprime — `apoderados` no se toca por alcance. ¿Hace falta?
6. **Falta el OK visual del corte de página.** Nadie midió una hoja real (sin browser en este
   entorno). Los 6 puntos de la checklist de la sección 2 necesitan un ojo humano antes del merge.
