# Fix — filtro de estado NULL-safe en el programa oficial

**Fecha**: 2026-07-22 · **Branch**: `fix/programa-null-estado` · **Base**: `main` (`d291d7d`)
**DB**: read-only. Ninguna escritura, ningún DDL. El probe sólo hace `SELECT`.
**Diagnóstico de origen**: `tmp/diag_programa.md` (SHA `da33f8e`).

> Repo público: sólo conteos, estados y códigos de error. Sin nombres ni documentos.

## GUARD

| Chequeo | Esperado | Obtenido |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ `/home/clio/dev/SGH` |
| `SELECT count(*) FROM spcs` | ~144 | ✅ **144** |

---

## Qué se arregló

### A) Carreras — la carrera que desaparecía

`carreras.estado` es VARCHAR libre y admite NULL (gotcha #5). `.neq('estado','anulada')`
se traduce a `estado <> 'anulada'`, que para una fila con `estado IS NULL` da NULL en vez
de `true`, así que Postgres la descarta. En la reunión 6 eso borraba del programa la
carrera del turno 2 (`numero_carrera_programa = 2`, 8 ratificados), sin ningún error: la
numeración impresa saltaba de 1 a 3.

### B) Banner "próxima reunión" — erroraba, no era cosmético

El pedido asumía que `'anulada'` simplemente no existía como estado de reuniones y que el
filtro "no excluía nada". La verificación mostró algo peor: **`reuniones.estado` es el ENUM
`estado_reunion`**, y pasarle una etiqueta inexistente no devuelve cero filas — **revienta**:

```
{"code":"22P02","message":"invalid input value for enum estado_reunion: \"anulada\""}
```

La respuesta venía con `data: null`, así que `proximaReunion` quedaba en `null` **siempre**.
El banner de próxima reunión **nunca se renderizó**, en ninguno de los dos programas. Con el
filtro nuevo la query no errora y encuentra la reunión nº 7 del 19/07.

Los comentarios en el código se corrigieron para reflejar esto (decían "no excluía nada").

---

## git diff

```diff
diff --git a/programa-oficial-color.html b/programa-oficial-color.html
index cd752cb..a406bb0 100644
--- a/programa-oficial-color.html
+++ b/programa-oficial-color.html
@@ -286,7 +286,10 @@ async function load() {
   const clubId = reunion.hipodromos?.club_id || reunion.club_id;
   const { data: club } = await sb.from('clubs').select('*').eq('id', clubId).single();
 
-  const { data: carreras } = await sb.from('carreras').select('*').eq('reunion_id', reunionId).neq('estado', 'anulada');
+  // carreras.estado es VARCHAR libre y admite NULL (gotcha #5). Un .neq() se traduce a
+  // estado <> 'anulada', que para NULL da NULL y descarta la fila en silencio: la carrera
+  // desaparecía del programa con sus ratificados. El .or() lo hace NULL-safe.
+  const { data: carreras } = await sb.from('carreras').select('*').eq('reunion_id', reunionId).or('estado.is.null,estado.neq.anulada');
   const carIds = (carreras || []).map(c => c.id);
 
   const { data: ins } = carIds.length
@@ -325,7 +328,10 @@ async function load() {
 
   const { data: proxRe } = await sb.from('reuniones')
     .select('id,fecha,numero').eq('club_id', clubId)
-    .gt('fecha', reunion.fecha).neq('estado', 'anulada')
+    // reuniones.estado es el ENUM estado_reunion, que NO tiene la etiqueta 'anulada'
+    // (usa 'cancelada'). El filtro viejo reventaba con 22P02 y dejaba proximaReunion
+    // en null: el banner de próxima reunión nunca se renderizaba. Además, NULL-safe.
+    .gt('fecha', reunion.fecha).or('estado.is.null,estado.neq.cancelada')
     .order('fecha', { ascending: true }).limit(1);
   const proximaReunion = proxRe?.[0] || null;
 
diff --git a/programa-oficial.html b/programa-oficial.html
index ea539a4..2793e5c 100644
--- a/programa-oficial.html
+++ b/programa-oficial.html
@@ -143,7 +143,10 @@ async function load() {
   const { data: club } = await sb.from('clubs').select('*').eq('id', clubId).single();
 
   // 2) Carreras
-  const { data: carreras } = await sb.from('carreras').select('*').eq('reunion_id', reunionId).neq('estado', 'anulada');
+  // carreras.estado es VARCHAR libre y admite NULL (gotcha #5). Un .neq() se traduce a
+  // estado <> 'anulada', que para NULL da NULL y descarta la fila en silencio: la carrera
+  // desaparecía del programa con sus ratificados. El .or() lo hace NULL-safe.
+  const { data: carreras } = await sb.from('carreras').select('*').eq('reunion_id', reunionId).or('estado.is.null,estado.neq.anulada');
   const carIds = (carreras || []).map(c => c.id);
 
   // 3) Inscripciones y entidades relacionadas
@@ -185,7 +188,10 @@ async function load() {
     .select('id,fecha,numero')
     .eq('club_id', clubId)
     .gt('fecha', reunion.fecha)
-    .neq('estado', 'anulada')
+    // reuniones.estado es el ENUM estado_reunion, que NO tiene la etiqueta 'anulada'
+    // (usa 'cancelada'). El filtro viejo reventaba con 22P02 y dejaba proximaReunion
+    // en null: el banner de próxima reunión nunca se renderizaba. Además, NULL-safe.
+    .or('estado.is.null,estado.neq.cancelada')
     .order('fecha', { ascending: true })
     .limit(1);
   const proximaReunion = proxRe?.[0] || null;
```

---

## Probe de regresión

`tests/probe_programa_null_estado.mjs` — **persistente**, read-only contra prod, reunión 6
como caso vivo. No seedea ni borra, así que no necesita teardown.

El filtro nuevo **no está hardcodeado en el probe**: se extrae con regex de
`programa-oficial.html`, así que verifica el texto que realmente se sirve. Si alguien
revierte el fix, el probe falla.

```bash
set -a; . ./.env; set +a
node tests/probe_programa_null_estado.mjs
```

### Salida

```
[código] programa-oficial.html        → .or('estado.is.null,estado.neq.anulada')
[código] programa-oficial-color.html  → .or('estado.is.null,estado.neq.anulada')

[conteos] filtro viejo .neq('estado','anulada')  → 7 carreras
[conteos] filtro nuevo .or('estado.is.null,estado.neq.anulada') → 8 carreras
[conteos] diferencia                      → 1

[banner] filtro viejo → error: 22P02 | filas: null
[banner] filtro nuevo → error: ninguno | filas: 1

==== RESULTADOS ====
✅ C1 los dos programas usan el mismo filtro de carreras  → oficial="estado.is.null,estado.neq.anulada" color="estado.is.null,estado.neq.anulada"
✅ C2 el filtro contempla estado NULL  → estado.is.null,estado.neq.anulada
✅ Q1 la query vieja devuelve 7 (pierde la de estado NULL)  → 7
✅ Q2 la query nueva devuelve 8  → 8
✅ A1 el resultado nuevo trae 8 filas  → 8
✅ A2 incluye la carrera con numero_carrera_programa=2 y estado NULL  → turno 2, nº prog 2
✅ A3 0 filas con estado anulada (las 3 siguen excluidas)  → 0
✅ A4 lo que recuperó el fix es exactamente 1 carrera, la de estado NULL  → turno 2/estado NULL
✅ B1 el filtro viejo erroraba con 22P02 ('anulada' no existe en el enum estado_reunion)  → invalid input value for enum estado_reunion: "anulada"
✅ B2 con el filtro viejo el banner nunca tenía datos (proximaReunion siempre null)  → null
✅ B3 el filtro nuevo no errora  → sin error
✅ B4 el filtro nuevo sí encuentra la próxima reunión  → nº7 2026-07-19
✅ B5 'cancelada' sí es una etiqueta válida del enum y es lo que hay que excluir  → 1 cancelada(s)

13/13 OK
```

### Conteos

| Filtro | Carreras devueltas |
|---|---|
| Viejo — `.neq('estado','anulada')` | **7** |
| Nuevo — `.or('estado.is.null,estado.neq.anulada')` | **8** |
| Diferencia | **+1** (la de estado NULL) |

Las 3 carreras `anulada` siguen excluidas: el fix recupera exactamente una fila, la del
turno 2, y ninguna otra.

---

## Alcance

- 2 archivos, 4 líneas de query modificadas (más comentarios explicativos).
- **No se tocó** `programa.html`: su query de carreras no usa este filtro.
- **No se tocó** la DB. Queda pendiente, como decisión aparte, si `carreras.estado` debería
  tener DEFAULT `'programada'` en lugar de admitir NULL — eso eliminaría la clase de bug en
  origen, pero es un cambio de schema con su propio riesgo.
- Otros módulos que usen `.neq('estado', ...)` sobre columnas nullable no fueron auditados
  en esta tanda.

## Sin mergear

`main` sigue en `d291d7d`. El merge espera revisión del diff por raw y OK de Leo.
