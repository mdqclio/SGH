# Colores de mandil 1..16 — relevamiento + fix aplicado (nomenclador oficial de Fede)

- **Fecha:** 2026-09-18
- **`main` relevado:** `4876106` → **fix mergeado:** `ef7847218bfb47f06f72d9df814d1aba02a1a14c` (`--no-ff` de `fix/mandil-colores-nomenclador`)
- **Guards:** `pwd` = `/home/clio/dev/SGH` · `spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- **Sin gate**, por instrucción de Fede/Leo (18/09): "si los cambios son solo de valores de color, aplicalo directo". **Son sólo valores** — §3.
- **Prod:** md5 de `partidor-colors.js` coincide con `ef78472` (§6); probe 18/18 contra el archivo servido; programa R9 renderizado desde `sigh.com.ar` (§7).

---

## 0. Respuestas

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Dónde están definidos? | **`partidor-colors.js`, líneas 2–19** (`PARTIDOR_COLORS`, `{ bg, fg }` por mandil). Único lugar. `chapas.js` NO es esto: son los SVG de **margen de llegada** (empate, hocico, cuerpos), mal rotulado en `CLAUDE.md` como "chapas SBARG por mandil". Valores actuales (antes del fix) en §1. |
| 2 | ¿Cuáles no coinciden? | Antes del fix: **fondo mal en 6** (11 gris medio, 12 marrón, 13 turquesa, 14 beige, 15 verde limón, 16 bordó) + **2 de tono** (5 verde medio en vez de oscuro, 9 celeste claro en vez de celeste) · **número mal en 7** (6, 7, 11, 12, 13, 14, 16). Coincidían enteros: 1, 2, 3, 4, 8, 10. Tabla en §2. |
| 3 | ¿Sólo el programa color? | No. **`programa-oficial-color.html`** (chip N° del inscripto, línea 707) y **`resultados.html`** (marcador, panel M.(F), vistas de dividendos, "no corrió" — líneas 624, 717, 806, 1139). El programa B/N (`programa-oficial.html:478`) imprime el número sin color. Los 4 `mockup-no-corrio-*.html` tienen hex copiados a mano — son maquetas, no prod. |
| 4 | ¿Hasta qué número? ¿>16? | Tabla hasta **16**. `partidorColor(n)` con n>16 (o no numérico) devuelve **gris `#CCCCCC` / negro**, sin error ni borde. En Dolores no puede pasar: `hipodromos.cantidad_gateras = 16`; máximo histórico en la base: **15 ratificados** en una carrera, 0 carreras con >16. |

**Causa raíz:** el 22/05 (`5379f75`) la paleta ya seguía el nomenclador (16/16 en fondo, 14/16 en número). El **26/05 (`234a833`, "actualizar a convención SBARG")** la reemplazó por una paleta inventada. El fix es volver a la del 22/05 con el número en negro en 7 y 12 (allí estaban en blanco).

---

## 1. Definición actual (antes del fix) — `main:partidor-colors.js`

```
$ git show 4876106:partidor-colors.js
// Colores canónicos SBARG (Stud Book Argentino) — 16 mandiles
const PARTIDOR_COLORS = {
   1: { bg: '#D50000', fg: '#FFFFFF' },  // Rojo
   2: { bg: '#FFFFFF', fg: '#000000' },  // Blanco
   3: { bg: '#0047AB', fg: '#FFFFFF' },  // Azul
   4: { bg: '#FFD400', fg: '#000000' },  // Amarillo
   5: { bg: '#009B3A', fg: '#FFFFFF' },  // Verde
   6: { bg: '#000000', fg: '#FFFFFF' },  // Negro
   7: { bg: '#FF6A00', fg: '#FFFFFF' },  // Naranja
   8: { bg: '#FF69B4', fg: '#000000' },  // Rosa
   9: { bg: '#4FC3F7', fg: '#000000' },  // Celeste
  10: { bg: '#7B1FA2', fg: '#FFFFFF' },  // Violeta
  11: { bg: '#808080', fg: '#FFFFFF' },  // Gris
  12: { bg: '#6D4C41', fg: '#FFFFFF' },  // Marrón
  13: { bg: '#00B8B8', fg: '#000000' },  // Turquesa
  14: { bg: '#D8C3A5', fg: '#000000' },  // Beige
  15: { bg: '#A4C400', fg: '#000000' },  // Verde limón
  16: { bg: '#800020', fg: '#FFFFFF' },  // Bordó
};

function partidorColor(n) {
  const num = parseInt(n, 10);
  return PARTIDOR_COLORS[num] || { bg: '#CCCCCC', fg: '#000000' };
}

function partidorChipHTML(n) {
  const { bg, fg } = partidorColor(n);
  const border = bg.toUpperCase() === '#FFFFFF' ? '1px solid #000' : 'none';
  return `<span class="partidor-chip" style="background:${bg};color:${fg};border:${border}">${n}</span>`;
}
```

Historia del archivo:

```
$ git log --format='%h %ad %s' --date=short -- partidor-colors.js
234a833 2026-05-26 feat(colores): actualizar partidor-colors.js a convención SBARG
5379f75 2026-05-22 feat(partidor-colors): helper compartido con nomenclador hípico estándar
```

Paleta del 22/05:

```
$ git show 5379f75:partidor-colors.js | sed -n 1,18p
const PARTIDOR_COLORS = {
   1: { bg: '#E10600', fg: '#FFFFFF' },
   2: { bg: '#FFFFFF', fg: '#000000' },
   3: { bg: '#1E2691', fg: '#FFFFFF' },
   4: { bg: '#FFE600', fg: '#000000' },
   5: { bg: '#006B3C', fg: '#FFFFFF' },
   6: { bg: '#000000', fg: '#FFE600' },
   7: { bg: '#F26522', fg: '#FFFFFF' },
   8: { bg: '#ED1C76', fg: '#000000' },
   9: { bg: '#1FB7E0', fg: '#000000' },
  10: { bg: '#6D2C8F', fg: '#FFFFFF' },
  11: { bg: '#B8B8B8', fg: '#E10600' },
  12: { bg: '#3DB54A', fg: '#FFFFFF' },
  13: { bg: '#4D1414', fg: '#FFFFFF' },
  14: { bg: '#7A1E1E', fg: '#FFE600' },
  15: { bg: '#6E6E6E', fg: '#000000' },
  16: { bg: '#7BD5E5', fg: '#E10600' },
};
```

---

## 2. Comparación uno por uno (antes del fix vs nomenclador)

| # | Oficial (fondo / número) | `main` antes: bg / fg | Fondo | Número |
|---|---|---|---|---|
| 1 | rojo / blanco | `#D50000` / `#FFFFFF` | ✓ | ✓ |
| 2 | blanco / negro | `#FFFFFF` / `#000000` | ✓ | ✓ |
| 3 | azul marino / blanco | `#0047AB` / `#FFFFFF` | ✓ (cobalto; marino más oscuro) | ✓ |
| 4 | amarillo / negro | `#FFD400` / `#000000` | ✓ | ✓ |
| 5 | verde oscuro / blanco | `#009B3A` / `#FFFFFF` | ~ tono (verde medio, L30) | ✓ |
| 6 | negro / amarillo | `#000000` / `#FFFFFF` | ✓ | **✗ blanco** |
| 7 | naranja / negro | `#FF6A00` / `#FFFFFF` | ✓ | **✗ blanco** |
| 8 | rosa / negro | `#FF69B4` / `#000000` | ✓ | ✓ |
| 9 | celeste / negro | `#4FC3F7` / `#000000` | ~ tono (celeste claro, L64) | ✓ |
| 10 | violeta / blanco | `#7B1FA2` / `#FFFFFF` | ✓ | ✓ |
| 11 | gris claro / rojo | `#808080` / `#FFFFFF` | **✗ gris medio (L50)** | **✗ blanco** |
| 12 | verde claro / negro | `#6D4C41` / `#FFFFFF` | **✗ marrón** | **✗ blanco** |
| 13 | bordó oscuro / blanco | `#00B8B8` / `#000000` | **✗ turquesa** | **✗ negro** |
| 14 | bordó / amarillo | `#D8C3A5` / `#000000` | **✗ beige** | **✗ negro** |
| 15 | gris oscuro / negro | `#A4C400` / `#000000` | **✗ verde limón** | ✓ |
| 16 | celeste claro / rojo | `#800020` / `#FFFFFF` | **✗ bordó** | **✗ blanco** |

Muestrario (chip de 22px como en el programa): `img/2026-09-18_mandil-colores/mandiles_actual_vs_original.png` — columna "ACTUAL" = antes del fix, "ORIGINAL 22/05" = lo que volvió (salvo número de 7 y 12).

---

## 3. Fix aplicado — sólo valores

```
$ git diff 4876106..ef78472 -- partidor-colors.js
diff --git a/partidor-colors.js b/partidor-colors.js
index fe38b98..7eea8c0 100644
--- a/partidor-colors.js
+++ b/partidor-colors.js
@@ -1,21 +1,26 @@
-// Colores canónicos SBARG (Stud Book Argentino) — 16 mandiles
+// Colores de mandil 1..16 según el nomenclador oficial que mandó Fede el 18/09/2026
+// (fondo / número). El 26/05 (234a833) se habían reemplazado por una paleta "SBARG" que
+// tenía 8 fondos y 7 números cambiados (12 marrón, 13 turquesa, 14 beige, 15 verde limón,
+// 16 bordó…); vuelve la del 22/05 (5379f75), que ya seguía el nomenclador, con el número
+// en negro en el 7 (naranja) y el 12 (verde claro), que ahí estaban en blanco.
+// Más de 16: partidorColor() devuelve gris #CCCCCC / negro (Dolores tiene 16 gateras).
 const PARTIDOR_COLORS = {
-   1: { bg: '#D50000', fg: '#FFFFFF' },  // Rojo
-   2: { bg: '#FFFFFF', fg: '#000000' },  // Blanco
-   3: { bg: '#0047AB', fg: '#FFFFFF' },  // Azul
-   4: { bg: '#FFD400', fg: '#000000' },  // Amarillo
-   5: { bg: '#009B3A', fg: '#FFFFFF' },  // Verde
-   6: { bg: '#000000', fg: '#FFFFFF' },  // Negro
-   7: { bg: '#FF6A00', fg: '#FFFFFF' },  // Naranja
-   8: { bg: '#FF69B4', fg: '#000000' },  // Rosa
-   9: { bg: '#4FC3F7', fg: '#000000' },  // Celeste
-  10: { bg: '#7B1FA2', fg: '#FFFFFF' },  // Violeta
-  11: { bg: '#808080', fg: '#FFFFFF' },  // Gris
-  12: { bg: '#6D4C41', fg: '#FFFFFF' },  // Marrón
-  13: { bg: '#00B8B8', fg: '#000000' },  // Turquesa
-  14: { bg: '#D8C3A5', fg: '#000000' },  // Beige
-  15: { bg: '#A4C400', fg: '#000000' },  // Verde limón
-  16: { bg: '#800020', fg: '#FFFFFF' },  // Bordó
+   1: { bg: '#E10600', fg: '#FFFFFF' },  // rojo / blanco
+   2: { bg: '#FFFFFF', fg: '#000000' },  // blanco / negro
+   3: { bg: '#1E2691', fg: '#FFFFFF' },  // azul marino / blanco
+   4: { bg: '#FFE600', fg: '#000000' },  // amarillo / negro
+   5: { bg: '#006B3C', fg: '#FFFFFF' },  // verde oscuro / blanco
+   6: { bg: '#000000', fg: '#FFE600' },  // negro / amarillo
+   7: { bg: '#F26522', fg: '#000000' },  // naranja / negro
+   8: { bg: '#ED1C76', fg: '#000000' },  // rosa / negro
+   9: { bg: '#1FB7E0', fg: '#000000' },  // celeste / negro
+  10: { bg: '#6D2C8F', fg: '#FFFFFF' },  // violeta / blanco
+  11: { bg: '#B8B8B8', fg: '#E10600' },  // gris claro / rojo
+  12: { bg: '#3DB54A', fg: '#000000' },  // verde claro / negro
+  13: { bg: '#4D1414', fg: '#FFFFFF' },  // bordó oscuro / blanco
+  14: { bg: '#7A1E1E', fg: '#FFE600' },  // bordó / amarillo
+  15: { bg: '#6E6E6E', fg: '#000000' },  // gris oscuro / negro
+  16: { bg: '#7BD5E5', fg: '#E10600' },  // celeste claro / rojo
 };
 
 function partidorColor(n) {
```

Estructura intacta: 16 claves, `{bg, fg}`, `partidorColor()`, `partidorChipHTML()` (borde negro sólo para el blanco), fallback gris. Ninguna pantalla cambia.

Valores nuevos = 22/05 + número negro en 7 (`#F26522`, naranja) y 12 (`#3DB54A`, verde claro), donde el 22/05 tenía blanco.

---

## 4. Probe — `tests/probe_mandil_colores.mjs` (18 asserts, sin Supabase)

Fondo por **HSL** (matiz/saturación/luminosidad: "claro/oscuro" con L), número por clase exacta; estructura y fallback; consumidores; mutante documentado = paleta de `234a833`.

### 4.1 Contra la rama fix

```
$ node tests/probe_mandil_colores.mjs
✅ A1) 16 entradas, 1..16  (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16)
✅ A2) cada entrada tiene bg y fg hex de 6 dígitos
✅ A3) >16 y no-número caen al gris #CCCCCC / negro (sin error)  ({"bg":"#CCCCCC","fg":"#000000"})
✅ A4) partidorChipHTML: el blanco (2) lleva borde negro; los demás no
✅ B) NÚMERO: los 16 coinciden con el nomenclador
✅ C) FONDO: los 16 coinciden con el nomenclador (matiz/sat/luz)
✅ C6) mandil 6 = negro / amarillo  (#000000 / #FFE600)
✅ C7) mandil 7 = naranja / negro  (#F26522 / #000000)
✅ C11) mandil 11 = gris claro / rojo  (#B8B8B8 / #E10600)
✅ C12) mandil 12 = verde claro / negro  (#3DB54A / #000000)
✅ C13) mandil 13 = bordó oscuro / blanco  (#4D1414 / #FFFFFF)
✅ C14) mandil 14 = bordó / amarillo  (#7A1E1E / #FFE600)
✅ C15) mandil 15 = gris oscuro / negro  (#6E6E6E / #000000)
✅ C16) mandil 16 = celeste claro / rojo  (#7BD5E5 / #E10600)
✅ D1) programa-oficial-color.html carga partidor-colors.js y pinta el chip con partidorChipHTML
✅ D2) resultados.html carga partidor-colors.js y usa partidorColor
✅ D3) ninguna pantalla define su propia tabla de colores de mandil
✅ E) la paleta del 26/05 (234a833) da rojo: 8 fondos y 7 números mal  (fondos: 5,9,11,12,13,14,15,16 · números: 6,7,11,12,13,14,16)

18/18 OK
```

### 4.2 Mutante — `main` antes del fix

```
$ git show main:partidor-colors.js > partidor_main.js; PARTIDOR_JS=partidor_main.js node tests/probe_mandil_colores.mjs
✅ A1) 16 entradas, 1..16  (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16)
✅ A2) cada entrada tiene bg y fg hex de 6 dígitos
✅ A3) >16 y no-número caen al gris #CCCCCC / negro (sin error)  ({"bg":"#CCCCCC","fg":"#000000"})
✅ A4) partidorChipHTML: el blanco (2) lleva borde negro; los demás no
❌ B) NÚMERO: los 16 coinciden con el nomenclador  (6: #FFFFFF no es "amarillo" | 7: #FFFFFF no es "negro" | 11: #FFFFFF no es "rojo" | 12: #FFFFFF no es "negro" | 13: #000000 no es "blanco" | 14: #000000 no es "amarillo" | 16: #FFFFFF no es "rojo")
❌ C) FONDO: los 16 coinciden con el nomenclador (matiz/sat/luz)  (5: #009B3A no es "verde oscuro" (h142 s100 l30) | 9: #4FC3F7 no es "celeste" (h199 s91 l64) | 11: #808080 no es "gris claro" (h0 s0 l50) | 12: #6D4C41 no es "verde claro" (h15 s25 l34) | 13: #00B8B8 no es "bordó oscuro" (h180 s100 l36) | 14: #D8C3A5 no es "bordó" (h35 s40 l75) | 15: #A4C400 no es "gris oscuro" (h70 s100 l38) | 16: #800020 no es "celeste claro" (h345 s100 l25))
❌ C6) mandil 6 = negro / amarillo  (#000000 / #FFFFFF)
❌ C7) mandil 7 = naranja / negro  (#FF6A00 / #FFFFFF)
❌ C11) mandil 11 = gris claro / rojo  (#808080 / #FFFFFF)
❌ C12) mandil 12 = verde claro / negro  (#6D4C41 / #FFFFFF)
❌ C13) mandil 13 = bordó oscuro / blanco  (#00B8B8 / #000000)
❌ C14) mandil 14 = bordó / amarillo  (#D8C3A5 / #000000)
❌ C15) mandil 15 = gris oscuro / negro  (#A4C400 / #000000)
❌ C16) mandil 16 = celeste claro / rojo  (#800020 / #FFFFFF)
✅ D1) programa-oficial-color.html carga partidor-colors.js y pinta el chip con partidorChipHTML
✅ D2) resultados.html carga partidor-colors.js y usa partidorColor
✅ D3) ninguna pantalla define su propia tabla de colores de mandil
✅ E) la paleta del 26/05 (234a833) da rojo: 8 fondos y 7 números mal  (fondos: 5,9,11,12,13,14,15,16 · números: 6,7,11,12,13,14,16)

8/18 OK — 10 FALLARON
```

(El probe cuenta 8 fondos porque toma 5 y 9 como fuera de tono; a ojo son 6 fondos equivocados + 2 de tono.)

---

## 5. Merge y push

```
$ git merge --no-ff fix/mandil-colores-nomenclador
$ git push origin main
$ git ls-remote origin main
ef7847218bfb47f06f72d9df814d1aba02a1a14c	refs/heads/main
```

Docs tocados en el mismo commit: `CHANGELOG.md` (entrada 18/09), `tests/README.md`, `CLAUDE.md` (probe en la lista; descripción de `partidor-colors.js` en el árbol).

---

## 6. Prod — md5 + probe contra el archivo servido

```
$ git show ef78472:partidor-colors.js > local_pc.js
$ for i in $(seq 1 20); do curl -sL "https://sigh.com.ar/partidor-colors.js?v=$RANDOM" -o prod_pc.js; [ md5 igual ] && { echo "match en intento $i"; break; }; sleep 20; done
match en intento 3
53dbe20de6ddae75395112ce1b310c55  /tmp/claude-1000/-home-clio-dev-SGH/9be9e852-7aae-40af-92ba-45234dfdbacc/scratchpad/local_pc.js
53dbe20de6ddae75395112ce1b310c55  /tmp/claude-1000/-home-clio-dev-SGH/9be9e852-7aae-40af-92ba-45234dfdbacc/scratchpad/prod_pc.js

$ PARTIDOR_JS=https://sigh.com.ar/partidor-colors.js node tests/probe_mandil_colores.mjs
✅ A1) 16 entradas, 1..16  (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16)
✅ A2) cada entrada tiene bg y fg hex de 6 dígitos
✅ A3) >16 y no-número caen al gris #CCCCCC / negro (sin error)  ({"bg":"#CCCCCC","fg":"#000000"})
✅ A4) partidorChipHTML: el blanco (2) lleva borde negro; los demás no
✅ B) NÚMERO: los 16 coinciden con el nomenclador
✅ C) FONDO: los 16 coinciden con el nomenclador (matiz/sat/luz)
✅ C6) mandil 6 = negro / amarillo  (#000000 / #FFE600)
✅ C7) mandil 7 = naranja / negro  (#F26522 / #000000)
✅ C11) mandil 11 = gris claro / rojo  (#B8B8B8 / #E10600)
✅ C12) mandil 12 = verde claro / negro  (#3DB54A / #000000)
✅ C13) mandil 13 = bordó oscuro / blanco  (#4D1414 / #FFFFFF)
✅ C14) mandil 14 = bordó / amarillo  (#7A1E1E / #FFE600)
✅ C15) mandil 15 = gris oscuro / negro  (#6E6E6E / #000000)
✅ C16) mandil 16 = celeste claro / rojo  (#7BD5E5 / #E10600)
✅ D1) programa-oficial-color.html carga partidor-colors.js y pinta el chip con partidorChipHTML
✅ D2) resultados.html carga partidor-colors.js y usa partidorColor
✅ D3) ninguna pantalla define su propia tabla de colores de mandil
✅ E) la paleta del 26/05 (234a833) da rojo: 8 fondos y 7 números mal  (fondos: 5,9,11,12,13,14,15,16 · números: 6,7,11,12,13,14,16)

18/18 OK
exit=0
```

---

## 7. Verificación visual — programa R9 a color renderizado desde `sigh.com.ar`

```
$ node tests/render_programa_pdf.mjs cafa37d6-89f4-45cb-a0d9-835bc27407e9 color <out> https://sigh.com.ar
(exit 0; teardown: usuarios=0 auth=0)
```

- `img/2026-09-18_mandil-colores/prod_despues_tira2.png` — carreras 1–3: se ven 1..11 (6 negro/amarillo, 7 naranja/negro, 11 gris claro/rojo).
- `img/2026-09-18_mandil-colores/prod_despues_tira4.png` — carreras 7–8: 12 verde claro/negro, 13 bordó oscuro/blanco.
- R9 no tiene carreras con 14, 15 ni 16 ratificados; esos tres quedan verificados por hex (probe C14–C16) y por el muestrario de §2.

---

## 8. Notas

- `CLAUDE.md` describe `chapas.js` como "Paleta SVG de chapas SBARG por mandil": es incorrecto — son los márgenes de llegada. No se tocó (fuera del pedido).
- Los `mockup-no-corrio-*.html` conservan hex de la paleta vieja copiados a mano; son maquetas, no se sirven en el flujo.
- `docs/MODULOS.md:37` dice "colores SBARG (partidor-colors.js)"; el nombre "SBARG" quedó del 26/05 y ya no describe la fuente. Cosmético.

## 9. Verificación de publicación

```
$ git ls-remote origin reports
e42c76f0e8bb6b29fd566b48f3985031e1485126	refs/heads/reports
$ git rev-parse HEAD
e42c76f0e8bb6b29fd566b48f3985031e1485126
```
