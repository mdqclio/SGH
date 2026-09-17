# GATE — Carta de llamado: `TURNO N —` en el encabezado del PDF

- **Fecha:** 2026-09-17
- **Rama:** `fix/carta-llamados-pdf-numero-turno` — commit `261b3c73ef97f69dfc1ac6ac5ec3118c975c01ca` (base `main` = `030089a`)
- **Pusheada:** sí (ls-remote abajo). **NO mergeada** — esperando OK.
- **Guards:** `pwd` = `/home/clio/dev/SGH` · `spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- **Escrituras en prod:** ninguna. El probe es sólo lectura. Sí se tocó el **VPS** (fuera del repo): `~/chromium-libs` y `~/.local/share/fonts` (§5).
- **Diagnóstico previo:** `docs/diagnosticos/2026-09-17_carta-llamados-pdf-numero-turno.md`

---

## 0. Resumen

| | |
|---|---|
| Cambio | `carta-llamados.html` `renderPrint()`: título de la caja = `TURNO ${c.numero_turno} — condición \| BONO…`. Borrado el código muerto (`catLabel`, `turnoLabel`, `headParts`, `headText`) y el comentario viejo. 12 líneas de diff (+4 −8). |
| Número usado | `numero_turno` a secas, como se acordó. |
| Probe | `tests/probe_carta_numero_turno.mjs` — **16/16**. Mutantes: `main` sin fix → 8 rojos; título con `numero_carrera_programa` → 5 rojos. |
| Ancho | Nadie desborda; el chip de distancia conserva su ancho natural en las 11 cajas (assert C4/C5). |
| **Corrección al diagnóstico** | Con el número, en R9 pasan a 2 líneas **4 títulos (T5, T6, T7, T8)**, no 2. El mock del diagnóstico escribía el bono como `$ 250.000`; `formatMonto()` real da `$250.000,00` — 2 chars más, y T5 (81→91c) y T6 (80→90c) quedaban justo en el borde (590/587px de 590.7). Sin el número, hoy, **0** a 2 líneas (mutante `main`, C3: todos `1`). Ninguno a 3 líneas. Costo en papel: 4 × 13pt ≈ 18mm. |

---

## 1. Diff de `carta-llamados.html`

```
diff --git a/carta-llamados.html b/carta-llamados.html
index 1b5c4f8..bf797a7 100644
--- a/carta-llamados.html
+++ b/carta-llamados.html
@@ -1048,14 +1048,10 @@ function renderPrint() {
     const bonoPosD   = dist.bono_posicion_desde || 6;
     const bonoPosMon = dist.bono_posicion_monto || 0;
 
-    // Encabezado: "TURNO N — CATEGORÍA (cód) — condición"
-    const catLabel  = cat ? cat.nombre.toUpperCase() + (cat.codigo ? ` (${cat.codigo})` : '') : '';
+    // Título de la caja: "TURNO N — condición | BONO…". Siempre numero_turno: la carta es
+    // pre-sorteo, y numero_carrera_programa queda cargado después de ratificar (R9: T3→7),
+    // así que ensuciaría una reimpresión. Categoría y distancia van en el caption y el chip.
     const condMain  = c.condicion_handicap || c.nombre || '';
-    const turnoLabel = c.numero_carrera_programa
-      ? `CARRERA ${c.numero_carrera_programa} (TURNO ${c.numero_turno})`
-      : `TURNO ${c.numero_turno}`;
-    const headParts = [turnoLabel, catLabel, condMain].filter(Boolean);
-    const headText  = headParts.join(' &mdash; ');
 
     // Condición adicional (línea pequeña bajo encabezado)
     const condAdicional = c.condicion_adicional || '';
@@ -1077,7 +1073,7 @@ function renderPrint() {
 
     const captionCat = cat ? `CARRERA ${cat.nombre.toUpperCase()}` : '';
     const bonoGanTag = bonoGan > 0 ? ` <span class="p-head-bono">| BONO de ${formatMonto(bonoGan)} al ganador</span>` : '';
-    const tituloHtml = `${condMain || c.nombre || ''}${bonoGanTag}`;
+    const tituloHtml = `TURNO ${c.numero_turno} &mdash; ${condMain || c.nombre || ''}${bonoGanTag}`;
     return `<div class="p-carrera-wrap" data-cat="${cat?.codigo||''}">
       ${captionCat ? `<div class="p-carrera-caption">${captionCat}</div>` : ''}
       <div class="p-carrera-box">
```

Stat completo de la rama:

```
 CHANGELOG.md                       |  26 ++++
 CLAUDE.md                          |   1 +
 carta-llamados.html                |  12 +-
 docs/SERVER.md                     |  17 +++
 tests/README.md                    |   6 +
 tests/probe_carta_numero_turno.mjs | 266 +++++++++++++++++++++++++++++++++++++
 6 files changed, 320 insertions(+), 8 deletions(-)
```

Además del HTML: `tests/probe_carta_numero_turno.mjs` (nuevo), `CHANGELOG.md` (entrada del 17/09), `tests/README.md` y `CLAUDE.md` (probe en la lista), `docs/SERVER.md` (fuentes + ruta real de las libs).

---

## 2. Probe — `tests/probe_carta_numero_turno.mjs`

Qué hace (detalle en el header del archivo):

- **A** texto: `tituloHtml` lleva `TURNO ${c.numero_turno} &mdash;`; `renderPrint` no usa `numero_carrera_programa` (código, no comentarios); sin código muerto.
- **B** `renderPrint()` **real** (extraída por ancla, `new Function`, con `formatMonto` real y `repartoDisplay` de `premios-utils.js`) contra R9 leída de la base: 11 títulos, cada uno empieza con `TURNO <numero_turno> — ` en orden; **T3 (numero_carrera_programa=7) dice TURNO 3**; el caption sigue siendo la categoría.
- **C** geometría: Chromium headless + el bloque `@media print` del archivo extraído por balance de llaves (hay tres `@media print`; se toma el que abre con `html, body, #print-only`) + el HTML que produjo B, a 186mm. Control = mismas cajas con título `X` → ancho natural del chip. Canario de fuente (Arial ≡ Liberation, no DejaVu). Asserts: nadie desborda; exactamente T5–T8 a 2 líneas y ninguno a 3; en las 11 el chip tiene ancho natural ±0.5px, una línea, `right` dentro del padding de la caja, y el título termina antes del gap de 10pt. Screenshot del bloque.

### 2.1 Salida cruda — rama fix (final)

```
$ set -a; . ./.env; set +a; node tests/probe_carta_numero_turno.mjs <out_dir>

PNG del bloque impreso: /tmp/claude-1000/-home-clio-dev-SGH/9be9e852-7aae-40af-92ba-45234dfdbacc/scratchpad/probe_out/carta_r9_print.png

✅ A1) tituloHtml lleva `TURNO ${c.numero_turno} &mdash;` adelante
✅ A2) renderPrint no usa numero_carrera_programa (código, no comentarios)
✅ A3) sin código muerto (turnoLabel / headText / headParts / catLabel)
✅ B0) R9 tiene 11 turnos en la DB  (11)
✅ B1) hay turnos con numero_carrera_programa ≠ numero_turno (caso discriminante)  (T3→C7 T4→C2 T5→C4 T6→C3 T7→C5 T9→C6 T11→C8)
✅ B2) un título por carrera  (11 títulos / 11 carreras)
✅ B3) cada título empieza con "TURNO <numero_turno> — " en orden de DB
✅ B4) R9 T3 (numero_carrera_programa=7) dice TURNO 3, no 7  ("TURNO 3 — Todo caballo 4 años perdedor. | BONO de $250.000,00 al ganador")
✅ B5) después del número viene la condición tal cual  ("Todo caballo 4 años perdedor.")
✅ B6) el caption sigue siendo la categoría, no el número
✅ C0) Chromium headless corrió (libs en CHROMIUM_LIBS / ~/chromium-libs)
✅ C1) métricas de Arial (Liberation Sans instalada): canario 470±8px  (475.3px)
✅ C2) ninguna caja desborda
✅ C3) exactamente 4 títulos de R9 pasan a 2 líneas: T5, T6, T7 y T8; ninguno a 3  (T1:1 T2:1 T3:1 T4:1 T5:2 T6:2 T7:2 T8:2 T9:1 T10:1 T11:1)
✅ C4) el chip de distancia no se empuja en ninguna carrera (ancho natural, 1 línea, dentro de la caja, título termina antes del gap)
✅ C5) en los títulos a 2 líneas el chip conserva el ancho natural  (T5: chip 76.4px | T6: chip 76.4px | T7: chip 75.6px | T8: chip 76.4px)

16/16 OK
exit=0
```

### 2.2 Mutante 1 — `main` sin el fix (`CARTA_HTML=<git show main:carta-llamados.html>`)

```
❌ A1) tituloHtml lleva `TURNO ${c.numero_turno} &mdash;` adelante
❌ A2) renderPrint no usa numero_carrera_programa (código, no comentarios)
❌ A3) sin código muerto (turnoLabel / headText / headParts / catLabel)
✅ B0) R9 tiene 11 turnos en la DB  (11)
✅ B1) hay turnos con numero_carrera_programa ≠ numero_turno (caso discriminante)  (T3→C7 T4→C2 T5→C4 T6→C3 T7→C5 T9→C6 T11→C8)
✅ B2) un título por carrera  (11 títulos / 11 carreras)
❌ B3) cada título empieza con "TURNO <numero_turno> — " en orden de DB  (T1: "Todo caballo 3 años perdedor. | BONO de $250.000,00 al ganador" | T2: "Todo caballo 4 años perdedor. | BONO de $250.000,00 al ganador" | T3: "Todo caballo 4 años perdedor. | BONO de $250.000,00 al ganador" | T4: "Todo caballo 5 años y + edad perdedor. | BONO de $250.000,00 al ganador" | T5: "Todo caballo 3 y 4 años ganador de 1 o 2 carreras. | BONO de $250.000,00 al ganador" | T6: "Todo caballo de 5 años ganador de 1 o 2 carreras. | BONO de $250.000,00 al ganador" | T7: "Todo caballo 6 años y + edad ganadores de 1 o 2 carreras. | BONO de $250.000,00 al ganador" | T8: "Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras. | BONO de $250.000,00 al ganador" | T9: "Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras." | T10: "Yeguas 5 años y + edad perdedoras." | T11: "Todo caballo 5 años y + edad perdedor.")
❌ B4) R9 T3 (numero_carrera_programa=7) dice TURNO 3, no 7  ("Todo caballo 4 años perdedor. | BONO de $250.000,00 al ganador")
❌ B5) después del número viene la condición tal cual  ("Todo caballo 4 años perdedor.")
✅ B6) el caption sigue siendo la categoría, no el número
✅ C0) Chromium headless corrió (libs en CHROMIUM_LIBS / ~/chromium-libs)
✅ C1) métricas de Arial (Liberation Sans instalada): canario 470±8px  (475.3px)
✅ C2) ninguna caja desborda
❌ C3) exactamente 4 títulos de R9 pasan a 2 líneas: T5, T6, T7 y T8; ninguno a 3  (T1:1 T2:1 T3:1 T4:1 T5:1 T6:1 T7:1 T8:1 T9:1 T10:1 T11:1)
✅ C4) el chip de distancia no se empuja en ninguna carrera (ancho natural, 1 línea, dentro de la caja, título termina antes del gap)
❌ C5) en los títulos a 2 líneas el chip conserva el ancho natural

8/16 OK — 8 FALLARON
```

8 rojos. Notar C3: en `main` los 11 títulos van a **1** línea — es el "hoy: 0 a 2 líneas".

### 2.3 Mutante 2 — título con `numero_carrera_programa ?? numero_turno`

```
$ sed 's/TURNO ${c.numero_turno} &mdash;/TURNO ${c.numero_carrera_programa ?? c.numero_turno} \&mdash;/' carta-llamados.html > carta_mut2.html
$ CARTA_HTML=carta_mut2.html node tests/probe_carta_numero_turno.mjs | grep "❌\|OK"
❌ A1) tituloHtml lleva `TURNO ${c.numero_turno} &mdash;` adelante
❌ A2) renderPrint no usa numero_carrera_programa (código, no comentarios)
❌ B3) cada título empieza con "TURNO <numero_turno> — " en orden de DB  (T3: "TURNO 7 — Todo caballo 4 años perdedor. | BONO de $250.000,00 al ganador" | T4: "TURNO 2 — Todo caballo 5 años y + edad perdedor. | BONO de $250.000,00 al ganador" | T5: "TURNO 4 — Todo caballo 3 y 4 años ganador de 1 o 2 carreras. | BONO de $250.000,00 al ganador" | T6: "TURNO 3 — Todo caballo de 5 años ganador de 1 o 2 carreras. | BONO de $250.000,00 al ganador" | T7: "TURNO 5 — Todo caballo 6 años y + edad ganadores de 1 o 2 carreras. | BONO de $250.000,00 al ganador" | T9: "TURNO 6 — Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras." | T11: "TURNO 8 — Todo caballo 5 años y + edad perdedor.")
❌ B4) R9 T3 (numero_carrera_programa=7) dice TURNO 3, no 7  ("TURNO 7 — Todo caballo 4 años perdedor. | BONO de $250.000,00 al ganador")
❌ B5) después del número viene la condición tal cual  ("Todo caballo 4 años perdedor.")
11/16 OK — 5 FALLARON
```

5 rojos; B3/B4 muestran exactamente el ruido que se quería evitar ("TURNO 7" en el turno 3).

---

## 3. Cómo queda (render del probe, R9, CSS real, métricas Arial)

`img/2026-09-17_carta-numero-turno/despues_probe_r9.png` — el bloque `#print-only` completo de R9 con el fix.

Los cuatro a 2 líneas (T5–T8) parten en el bono rojo (`| BONO de $250.000,00 al` / `ganador`), el chip verde queda a la derecha, alineado al centro de la caja (`align-items:center`), con el mismo ancho que en las cajas de 1 línea (75.6–76.4px según el texto "1000 m"/"1100 m"/"1200 m").

---

## 4. Correcciones respecto del diagnóstico

1. **2 → 4 títulos a 2 líneas** en R9 (ver §0). La conclusión no cambia: nada desborda ni empuja; sólo son dos cajas más que crecen 13pt.
2. El canario de fuente mide **475px** vía fontconfig contra **465px** vía `@font-face` (Chromium engrosa el 800 sobre la Liberation Bold cuando viene del sistema). El assert tolera 470±8; DejaVu da ~559 y sigue afuera.

---

## 5. VPS — cambios fuera del repo

- `~/chromium-libs/usr/lib/x86_64-linux-gnu/` (28 libs): copiadas desde el scratchpad de la sesión de la mañana, que es donde realmente estaban (`docs/SERVER.md` decía `~/chromium-libs` y no existía). `ldd … | grep -c "not found"` → `0`.
- `~/.local/share/fonts/LiberationSans-*.ttf` + `fc-cache`: `fc-match Arial` → `LiberationSans-Regular.ttf`. Antes daba DejaVu Sans (~10% más ancha). **Consecuencia para el programa color del 17/09:** sus conteos de celdas que envuelven se midieron con DejaVu — en la impresora de Yesi (Arial) envuelven menos. No invalida el fix de columnas fijas; queda anotado en SERVER.md y README.

---

## 6. Pendiente (no bloquea el merge)

- `renderPrint()` imprime también los turnos **anulados** (sin filtro de `estado`). Hoy R9 tiene T2/T8/T10 anulados y saldrían en una reimpresión. Fuera de este pedido.

---

## 7. Verificación de publicación

```
$ git ls-remote origin fix/carta-llamados-pdf-numero-turno
261b3c73ef97f69dfc1ac6ac5ec3118c975c01ca	refs/heads/fix/carta-llamados-pdf-numero-turno
```

```
$ git ls-remote origin reports
e12a1654756d5a21a07110e1be06352c92bb4d85	refs/heads/reports
$ git rev-parse HEAD
e12a1654756d5a21a07110e1be06352c92bb4d85
```

(`reports` avanza un commit más con esta sección; se verifica igual abajo.)
