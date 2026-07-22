# fix/chapa-4-medio — chapa "4½ cpos" (id 20)

Fecha: 2026-07-22 · branch `fix/chapa-4-medio` (desde main `8cb0f09`) · sin tocar la DB

## Contexto

Yesi carga los resultados reales de la reunión 6 y una carrera tiene margen de 4½ cuerpos.
El catálogo (spec Fede 25/05) saltaba de `4 cpos` (id 16, valor 4.0) a `Varios` (id 17,
solo enteros N≥5) — 4½ no se podía cargar.

## Diff

```diff
diff --git a/chapas.js b/chapas.js
index d9f7b72..d55a514 100644
--- a/chapas.js
+++ b/chapas.js
@@ -3,17 +3,23 @@
  * Spec validada por Fede 25/05/2026.
  *
  * Uso:
- *   CHAPAS_CATALOG               → array con las 19 entradas en orden.
- *   getChapa(id)                 → devuelve la entrada por id (1-19).
+ *   CHAPAS_CATALOG               → array con las 20 entradas en orden de distancia.
+ *   getChapa(id)                 → devuelve la entrada por id.
  *   getChapaByCodigo(codigo)     → devuelve por código de texto (ej. "1 cpo").
  *   renderVariosChapa(n)         → SVG dinámico para "varios + N" (n ≥ 5).
  *   getVariosCodigo(n)           → string "N cpos" (siempre plural, n ≥ 5).
  *
+ * Los ids NO son contiguos ni siguen el orden del array: están persistidos por
+ * código en resultado_posiciones.diferencia, así que nunca se renumeran. El
+ * orden del dropdown lo da la POSICIÓN en el array, no el id. Altas nuevas
+ * toman el siguiente id libre y se insertan donde corresponda por distancia
+ * (así entró id 20 = "4½ cpos", entre id 16 y id 17).
+ *
  * Tipos:
- *   "distancia" → entradas 1-16, distancias fijas con SVG estático.
- *   "varios"    → entrada 17. El operador ingresa N ≥ 5 entero; SVG y código
+ *   "distancia" → ids 1-16 y 20, distancias fijas con SVG estático.
+ *   "varios"    → id 17. El operador ingresa N ≥ 5 entero; SVG y código
  *                 se arman dinámicamente vía render/getVarios.
- *   "estado"    → entradas 18-19. No son distancias; reemplazan al campo.
+ *   "estado"    → ids 18-19. No son distancias; reemplazan al campo.
  *
  * En la columna "Cpos" de los resultados se muestra el código (texto).
  * Los SVG son para mostrar al lado del código en la UI cuando aplique.
@@ -206,6 +212,20 @@ const CHAPAS_CATALOG = [
   <circle cx="68" cy="32" r="14" fill="#000000"/>
   <circle cx="32" cy="68" r="14" fill="#000000"/>
   <circle cx="68" cy="68" r="14" fill="#000000"/>
+</svg>`
+  },
+  {
+    id: 20,
+    codigo: '4½ cpos',
+    nombre: '4½ cuerpos',
+    valor: 4.5,
+    tipo: 'distancia',
+    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
+  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
+  <circle cx="32" cy="32" r="11" fill="none" stroke="#000000" stroke-width="6"/>
+  <circle cx="68" cy="32" r="11" fill="none" stroke="#000000" stroke-width="6"/>
+  <circle cx="32" cy="68" r="11" fill="none" stroke="#000000" stroke-width="6"/>
+  <circle cx="68" cy="68" r="11" fill="none" stroke="#000000" stroke-width="6"/>
 </svg>`
   },
   {
```

## Probe

`node tests/probe_chapa_4medio.mjs` — lógica pura, sin DB, sin browser.
Carga el `chapas.js` REAL con `new Function` y extrae los cuerpos REALES de
`parseDif` / `chapaGetCodigo` / `chapaGetSvg` desde `resultados.html`. Nada mockeado.

```
[load] catálogo real: 20 entradas; parseDif/chapaGetCodigo/chapaGetSvg extraídos de resultados.html

── Resultados ─────────────────────────────
✅ T01a  getChapaByCodigo("4½ cpos") devuelve entrada (no null)
✅ T01b  id === 20 (fue: 20)
✅ T01c  valor === 4.5 (fue: 4.5)
✅ T01d  tipo === "distancia" (fue: distancia)
✅ T01e  nombre === "4½ cuerpos" (fue: 4½ cuerpos)
✅ T01f  getChapa(20) devuelve la MISMA entrada que getChapaByCodigo
✅ T01g  usa el mismo carácter ½ (U+00BD) que "2½ cpos" (fue: U+BD)
✅ T02a  chapaGetCodigo({id:20}) === "4½ cpos" (fue: "4½ cpos")
✅ T02b  round-trip código→parseDif→chapaGetCodigo estable (fue: "4½ cpos")
✅ T03a  ids 16, 20 y 17 presentes en el array
✅ T03b  "4½ cpos" entre "4 cpos" y Varios (posiciones: 4cpos=15, 4½=16, varios=17)
✅ T03c  los "distancia" quedan ordenados por valor ASC (0 < 0.01 < 0.05 < 0.1 < 0.2 < 0.3 < 0.4 < 0.5 < 0.75 < 1 < 1.5 < 2 < 2.5 < 3 < 3.5 < 4 < 4.5)
✅ T04a  parseDif("4½ cpos").id === 20 (fue: {"id":20,"n":null})
✅ T04b  NO cae en la rama varios (id 17)
✅ T04c  n === null, no es un "varios + N" (fue: null)
✅ T05a  parseDif("4 cpos") → id 16 sin n (fue: {"id":16,"n":null})
✅ T05b  parseDif("5 cpos") → varios id 17 n=5 (fue: {"id":17,"n":5})
✅ T05c  round-trip de "5 cpos" intacto (getVariosCodigo)
✅ T05d  "4 cpos" sigue valiendo 4.0
✅ T05e  "3½ cpos" sigue resolviendo a id 15
✅ T05f  parseDif(null|"") sigue devolviendo null
✅ T05g  parseDif de un código inválido sigue devolviendo null
✅ T05h  "2 cpos" no cae en varios (id 12)
✅ T06a  ids únicos (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,20,17,18,19)
✅ T06b  id 16 sigue siendo "4 cpos"
✅ T06c  id 17 sigue siendo "varios"
✅ T06d  id 18 sigue siendo "s.a." (persistido por código)
✅ T06e  id 19 sigue siendo "desm." (persistido por código)
✅ T06f  20 entradas (fue: 20)
✅ T07a  SVG con el viewBox 100x100 del catálogo
✅ T07b  fondo amarillo + trazo negro como las demás
✅ T07c  4 círculos huecos, igual criterio que 2½ (2) y 3½ (3) — fue: 4
✅ T07d  chapaGetSvg({id:20}) devuelve el SVG nuevo
✅ T08  "4½ cpos" = 7 chars ≤ varchar(20) de resultado_posiciones.diferencia
✅ T09a  el dropdown itera el catálogo (no una lista hardcodeada)
✅ T09b  ningún loop 1..19 sobre ids en resultados.html
✅ T09c  nadie recorta el catálogo por longitud/índice fijo
✅ T09d  la entrada nueva renderiza su código en la opción del dropdown

38/38 OK
✅ Todos los asserts pasan.
```

### Sensibilidad (el probe no es vacuo)

Con `git stash push -- chapas.js` (o sea, revirtiendo el fix) el probe **falla**: 21/38, exit 1.
Caen T01a-g, T02a-b, T03a-b, T04a, T04c, T06f, T07a-d, T09d. Working tree restaurado después.

## Auditoría de consumidores

Grep de `CHAPAS_CATALOG` / `getChapa` / `getChapaByCodigo` / `parseDif` /
`renderVariosChapa` / `getVariosCodigo` / `diferencia` en todo el repo.

**Nadie asume ids contiguos 1-19 ni hardcodea la lista en el camino vivo.**

| Consumidor | Qué hace | Veredicto |
|---|---|---|
| `resultados.html:360` | `<script src="chapas.js">` | único importador |
| `resultados.html:908` `parseDif` | regex `/^(\d+)\s*cpos$/i` y si no, `getChapaByCodigo` | ✅ `4½ cpos` no matchea `\d+` (el ½ no es dígito ASCII) → cae al catálogo, id 20. Y `4 cpos` sí matchea pero el guard `n >= 5` lo rebota al catálogo → id 16, sin cambio |
| `resultados.html:916` `chapaGetCodigo` | `getChapa(st.id)?.codigo`, con caso especial `id === 17` | ✅ id-agnóstico |
| `resultados.html:922` `chapaGetSvg` | ídem, `getChapa(st.id)?.svg` | ✅ id-agnóstico |
| `resultados.html:944` dropdown | `CHAPAS_CATALOG.map(...)`, caso especial solo `ch.id === 17` | ✅ el orden lo da la posición en el array, no el id → `4½ cpos` aparece entre `4 cpos` y Varios |
| `resultados.html:1402` guardado | `diferencia: chapaGetCodigo(chapaValues[p]) \|\| null` | ✅ persiste el string `'4½ cpos'` |
| `resultados.html:731` carga | `parseDif(difMap[p])` | ✅ round-trip cerrado |
| `supabase/functions/_shared/studbook_format.mjs:169` | `cuerpos: { id_interno: null, nombre: rp?.diferencia ?? null }` | ✅ pass-through del string, no consulta el catálogo |
| `ratificacion.html:194` | `renumerar-chapas.js` — otro archivo, mandiles 1..N | ✅ no relacionado |

### DB (solo lectura, no se tocó nada)

`resultado_posiciones.diferencia` = `character varying(20)`, nullable. `'4½ cpos'` son 7
caracteres → entra. No hay CHECK ni enum sobre la columna, así que **no hace falta migración**.

### ⚠️ Un hardcodeo encontrado — NO lo toqué, como pediste

`resultados_legacy.html:202` define su propio `const CUERPOS_OPCIONES = [...]` hardcodeado y lo
usa como `<datalist id="dl-cuerpos">` (línea 448) sobre un input de texto libre (línea 473).
**No importa `chapas.js`** — es una lista paralela, anterior al catálogo.

Por qué lo dejé quieto:
- Es el archivo legacy: no está linkeado desde ninguna nav ni desde `index.html`; solo aparece
  en los inventarios de CSP de `REMEDIACION_RESULTADO.md` y `docs/auditoria/SGH-REMEDIACION.md`.
- El input es texto libre con datalist de *sugerencia*, no un select cerrado: aunque la opción
  no esté en la lista, un operador puede tipear `4½ cpos` y se guarda igual.
- Sincronizarlo con el catálogo es un cambio de otro alcance (deduplicar la lista o borrar el
  archivo), no parte de este fix.

**Decisión para Leo:** si `resultados_legacy.html` está muerto, conviene borrarlo en una tanda
aparte. Si sigue vivo para alguien, hay que sincronizar `CUERPOS_OPCIONES` con `CHAPAS_CATALOG`.

## Fuera de scope

Medios cuerpos ≥5 (5½, 6½): sigue sin poder cargarse. `getVariosCodigo` / `renderVariosChapa` /
el input de Varios exigen entero ≥5. Preguntado a Fede/Yesi; si lo confirman es otra tanda.
