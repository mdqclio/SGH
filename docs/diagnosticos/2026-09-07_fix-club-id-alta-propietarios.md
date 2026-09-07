# Fix — `propietarios.html` crea las fichas con `club_id` y lista sólo su club (ISSUE-072)

**Fecha:** 2026-09-07
**Branch del fix:** `fix/club-id-alta-propietarios` — **pusheada, SIN mergear a `main`**. Gate pedido.
**Commit:** `bba68945c14b739aff3e3565665c311c533b74bc`
**Base:** `origin/main` en `cc0ea64c8847d5eafb78a234cfedc749ab597afe`
**Antecedente:** este mismo informe, §4.2 de
`docs/diagnosticos/2026-09-07_aprobacion-solicitud-sin-ficha-propietario.md`
**Issue abierto:** ISSUE-072 (propio, gemelo de ISSUE-049; el 049 NO se reabrió)

---

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ git branch --show-current     # al arrancar
reports
```

```sql
select (select count(*) from spcs) spcs,
       (select count(*) from propietarios) prop_total,
       (select count(*) from propietarios where club_id='0649e9c5-9e87-4aad-842f-101458e6b33c') prop_dolores,
       (select count(*) from propietarios where club_id is null) prop_sin_club,
       (select count(*) from propietarios where club_id='a6da7e40-1515-45dc-8933-4eef33ce937a') prop_miclub;
```

```json
[{"spcs":181,"prop_total":260,"prop_dolores":253,"prop_sin_club":0,"prop_miclub":7}]
```

- `pwd` → `/home/clio/dev/SGH` ✅ (esperado)
- `SELECT count(*) FROM spcs` → **181** ✅ (esperado; baseline de CLAUDE.md al 2026-08-23)
- ref del proyecto Supabase → `unlhcuanfrtpatoipwve` ✅

Todo grep y lectura de código de este informe se hizo contra **`main`**, no contra `reports`
(`git show origin/main:<archivo>`), según el protocolo.

---

## 1. El fix

Se aplicó el mismo patrón de `profesionales.html`, no uno nuevo. Antes de usarlo se verificó cómo
resuelve `CLUB_ID` la pantalla: `propietarios.html:268-269` tiene el mismo `initAuth()` inline que
el resto de los módulos —`let sb, CLUB_ID, currentUser;` y `CLUB_ID = usr.club_id` (o el del
club-switcher para `super_admin`)— y `saveRecord()`/`load()` están en ese mismo scope de script.
Ya lo usaban las dos funciones de apoderados de este archivo (`:462` y `:483`). **Estaba disponible;
no hubo que improvisar nada.**

Las tres piezas:

| # | Dónde | Qué | Patrón de referencia |
|---|---|---|---|
| 1 | `saveRecord()`, payload | `club_id: CLUB_ID` | `profesionales.html:397` |
| 2 | `load()`, query | `.eq('club_id', CLUB_ID)` | `profesionales.html:273`, `jockeys.html:271` |
| 3 | `saveRecord()`, branch de UPDATE | `.eq('club_id', CLUB_ID).select('id')` + aviso si 0 filas | **decisión propia — ver §2** |

### Diff completo (`propietarios.html`)

```diff
diff --git a/propietarios.html b/propietarios.html
index f3328b0..d80c480 100644
--- a/propietarios.html
+++ b/propietarios.html
@@ -304,7 +304,11 @@ function estadoBadge(estado) {
 async function load() {
   setList('<div class="loading-state"><div class="spinner"></div> Cargando propietarios…</div>');
   const filtro = document.getElementById('filter-estado').value;
-  let query = sb.from('propietarios').select('*').order('nombre');
+  // Acotado por club, igual que profesionales.html:273 y jockeys.html:271 (ISSUE-049). Sin el
+  // filtro, propietarios_select —que para staff es fn_is_staff() a secas, sin condición de
+  // club— devolvía también las fichas de otros hipódromos: desde Dolores se veían y se podían
+  // editar las 7 de "Mi Club Hípico".
+  let query = sb.from('propietarios').select('*').eq('club_id', CLUB_ID).order('nombre');
   if (filtro === 'activos')  query = query.eq('estado', 'activo');
   else if (filtro === 'visibles') query = query.in('estado', ['activo', 'inactivo']);
   const { data, error } = await query;
@@ -415,7 +419,13 @@ async function saveRecord(e) {
       btn.disabled = false; btn.textContent = 'Guardar'; return;
     }
   }
+  // club_id explícito, igual que profesionales.html:397 (ISSUE-049). La columna es nullable y
+  // no tiene default ni trigger que la complete, así que sin esta línea TODA alta por pantalla
+  // nacía con club_id NULL — y una ficha sin club es invisible para buscarFichas() de
+  // solicitudes.html, que filtra .eq('club_id', CLUB_ID). Ése es el circuito que rompía: Yesi
+  // creaba la ficha acá, volvía a la bandeja y no la encontraba ni buscándola por DNI.
   const payload = {
+    club_id: CLUB_ID,
     tipo: document.getElementById('f-tipo').value,
     estado: nuevoEstado,
     activo: nuevoEstado === 'activo',
@@ -431,11 +441,19 @@ async function saveRecord(e) {
     colores_desc: document.getElementById('f-colores').value.trim() || null,
     notas: document.getElementById('f-notas').value.trim() || null,
   };
-  const { error } = id
-    ? await sb.from('propietarios').update(payload).eq('id', id)
+  // El UPDATE va acotado por club ADEMÁS de por id. Con club_id en el payload, un update por id
+  // sobre una ficha ajena no la editaría: la MOVERÍA de hipódromo. El .eq lo convierte en un
+  // no-op de 0 filas. Desde la UI el caso ya no es alcanzable —load() filtra—, pero la policy
+  // propietarios_update es fn_is_staff() sin condición de club, así que por API seguía abierto.
+  // El .select('id') es para no cantar "actualizado" sobre 0 filas afectadas.
+  const { data: filasUpd, error } = id
+    ? await sb.from('propietarios').update(payload).eq('id', id).eq('club_id', CLUB_ID).select('id')
     : await sb.from('propietarios').insert(payload);
   btn.disabled = false; btn.textContent = 'Guardar';
   if (error) { toast(error.message, 'error'); return; }
+  if (id && (!filasUpd || filasUpd.length === 0)) {
+    toast('No se pudo actualizar: la ficha no pertenece a este hipódromo.', 'error'); return;
+  }
   toast(id ? 'Propietario actualizado' : 'Propietario creado');
   closeModal();
   load();
```

### Diff completo del branch (todos los archivos)

```
 CHANGELOG.md                              |  54 ++++
 CLAUDE.md                                 |   1 +
 docs/ISSUES.md                            |  82 ++++++
 propietarios.html                         |  24 +-
 tests/README.md                           |  36 +++
 tests/probe_club_id_alta_propietarios.mjs | 439 ++++++++++++++++++++++++++++++
 6 files changed, 633 insertions(+), 3 deletions(-)
```

---

## 2. El branch de UPDATE — la decisión que se pidió justificar

**Pregunta:** ¿hoy permite editar una ficha de otro club por id? ¿Corresponde acotarlo? ¿Queda
abierto por API?

**Respuesta corta: sí, sí, y sí quedaba abierto — se acotó.**

### Estado antes del fix

```js
const { error } = id
  ? await sb.from('propietarios').update(payload).eq('id', id)
  : await sb.from('propietarios').insert(payload);
```

El `payload` no tenía `club_id`, y el `update` sólo filtra por `id`. La policy de escritura no
agrega nada:

```sql
select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr,
       pg_get_expr(polwithcheck, polrelid) as check_expr
from pg_policy p join pg_class c on c.oid=p.polrelid where c.relname='propietarios';
```

```
propietarios_select  r  USING (fn_is_staff() OR id IN (SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo='propietario'))
propietarios_insert  a  WITH CHECK (fn_is_staff())
propietarios_update  w  USING (fn_is_staff())  WITH CHECK (fn_is_staff())
propietarios_delete  d  USING (fn_is_super_admin())
```

`propietarios_update` es **`fn_is_staff()` a secas, sin condición de club**. O sea: cualquier staff
de cualquier hipódromo podía —y puede— hacer UPDATE de cualquier propietario del sistema por API.
Antes del fix, desde la UI también, porque `load()` le servía las fichas ajenas en bandeja.

### Por qué NO alcanzaba con poner el filtro de lectura

Con el filtro de `load()` puesto, el caso deja de ser **alcanzable desde la UI** — cierto. Pero
poner `club_id: CLUB_ID` en el payload compartido entre INSERT y UPDATE **empeora** el caso por API
en vez de dejarlo igual:

- **Antes:** un UPDATE por id de una ficha ajena la **editaba** (le pisaba nombre, DNI, estado).
- **Con `club_id` en el payload y sin acote:** ese mismo UPDATE la **mueve de hipódromo**. La ficha
  desaparece del padrón de su club y aparece en el de Dolores.

Mover una ficha de tenant es estrictamente peor que editarla. Así que el `club_id` en el payload
—que es lo que arregla el INSERT— obliga a acotar el UPDATE. No son dos decisiones separadas: la
segunda es consecuencia de la primera.

### Lo que se hizo

```js
const { data: filasUpd, error } = id
  ? await sb.from('propietarios').update(payload).eq('id', id).eq('club_id', CLUB_ID).select('id')
  : await sb.from('propietarios').insert(payload);
btn.disabled = false; btn.textContent = 'Guardar';
if (error) { toast(error.message, 'error'); return; }
if (id && (!filasUpd || filasUpd.length === 0)) {
  toast('No se pudo actualizar: la ficha no pertenece a este hipódromo.', 'error'); return;
}
```

Dos piezas, y la segunda no es decoración:

1. **`.eq('club_id', CLUB_ID)`** convierte el UPDATE de una ficha ajena en un no-op de 0 filas.
2. **`.select('id')` + el chequeo de 0 filas.** PostgREST **no** devuelve error cuando un UPDATE no
   matchea ninguna fila: devuelve `error: null` y listo. Sin el chequeo, el código diría
   *"Propietario actualizado"*, cerraría el modal y recargaría la lista sobre una escritura que
   nunca ocurrió — un éxito mentido, que es justamente el modo de falla que este informe vino a
   arreglar en otro lado. El mutante **M6** existe para eso.

**El `.select('id')` va sólo en el branch de UPDATE, no en el de INSERT.** Razón: en el INSERT, un
`.select()` que volviera vacío por RLS haría decir "no se pudo guardar" sobre una fila que **sí** se
creó. El camino del alta es el que tiene que entrar sin sorpresas (es el de Fede), así que se dejó
tal cual estaba.

### Lo que queda abierto, dicho explícitamente

- La **policy** sigue siendo `fn_is_staff()` sin club. Un cliente que no sea esta pantalla —curl,
  otro módulo, un script— sigue pudiendo actualizar propietarios de otro hipódromo. El acote es de
  la pantalla, **no de la base**. Cerrar eso es cambiar la policy, que es DDL sobre 4 policies de
  `propietarios` (y las gemelas de `profesionales`), fuera del alcance de este fix.
- `profesionales.html:413-414` **no** tiene este acote: el fix de ISSUE-049 puso `club_id` en el
  payload y filtró la lectura, pero dejó el UPDATE sólo por id. O sea que el archivo hermano tiene
  hoy exactamente el agujero que acá se cerró. **No se tocó a propósito** —el pedido era
  `propietarios.html`— y queda anotado en ISSUE-072 como deuda simétrica.

---

## 3. Verificación post-fix: 253 quedan, 7 desaparecen

No se contó "a ojo": se corrió el `load()` **real** de las dos versiones del archivo —la de
`origin/main` y la del branch— contra la misma base de producción, en la misma corrida, y se
contaron las filas que devuelve cada una agrupadas por `club_id`.

Script usado (temporal, no commiteado — necesita estar dentro del repo para resolver
`@supabase/supabase-js` de `node_modules`):

```js
const fn = new AsyncFunction('document','sb','CLUB_ID','toast','setList','updateStats','filterRender','allData',
  cuerpoDe(html,'async function load() {') + '\n return allData;');
const filas = await fn(doc, sb, CLUB_DOLORES, ...);
```

Salida cruda, completa:

```
$ node tmp_verif_load.mjs <propietarios.html de origin/main> <propietarios.html del branch>
EN LA DB          : {"total":260,"dolores":253,"otro":7,"nulos":0}
load() ANTES (main): {"total":260,"porClub":{"0649e9c5-9e87-4aad-842f-101458e6b33c":253,"a6da7e40-1515-45dc-8933-4eef33ce937a":7}}
load() DESPUÉS(fix): {"total":253,"porClub":{"0649e9c5-9e87-4aad-842f-101458e6b33c":253}}

Dolores visibles antes = 253  · después = 253
Mi Club Hípico visibles antes = 7  · después = 0
exit=0
```

| | en la DB | `load()` de `main` | `load()` del fix |
|---|---|---|---|
| **Total devuelto** | 260 | **260** | **253** |
| Hipódromo de Dolores | 253 | **253** | **253** ✅ siguen todas |
| Mi Club Hípico | 7 | **7** ❌ fuga | **0** ✅ desaparecen |
| `club_id NULL` (huérfanas) | 0 | 0 | 0 |

Las 253 de Dolores siguen visibles, exactamente las mismas; las 7 de `Mi Club Hípico` dejan de
listarse. El 0 de la última columna es del filtro, no de una tabla vacía: la fila "en la DB" de la
misma corrida muestra que las 7 siguen ahí.

---

## 4. El probe

`tests/probe_club_id_alta_propietarios.mjs` (nuevo, 370 líneas, en el branch del fix).

Patrón vigente de `tests/README.md` § *Browser NO disponible*: extrae de los HTML los cuerpos
**reales** por ancla y balance de llaves, y los corre con `new AsyncFunction` inyectando cliente
Supabase real + mini-DOM. Nada se reimplementa: si el archivo cambia, el probe corre el archivo
cambiado.

Código real que ejecuta:

| Función | Archivo | Para qué |
|---|---|---|
| `saveRecord(e)` | `propietarios.html` | el alta y la edición bajo prueba |
| `load()` | `propietarios.html` | el listado bajo prueba |
| `parseDNI(str)` | `propietarios.html` | normalización del documento — real, no stub |
| `buscarFichas(sol, textoManual)` | `solicitudes.html` | **el verificador del circuito.** Entra tal cual está en `main`; no se tocó |

El mini-DOM **parsea los ids del archivo** (`/\bid="([^"]+)"/g`): pedir un id que el HTML no tiene
revienta el probe en vez de devolver un nodo fantasma. Renombrar `#f-doc-nro` rompe el test, no
producción.

### El assert que importa

**A3**, y está marcado con ⭐ en la salida. Verificar que el INSERT manda `club_id` (A1) no prueba
que el camino de Yesi funcione: lo que hay que probar es que **una ficha creada por la pantalla es
encontrable después por el `buscarFichas()` de la bandeja**, que filtra `.eq('club_id', CLUB_ID)`.
Ése es el circuito que estaba roto, y A2/A3 lo recorren entero — por DNI exacto y por el buscador
manual.

### Por qué usa `SUPABASE_SECRET_KEY`

Bypasea RLS **a propósito**. Lo que se prueba es el filtro del **cliente**. Con la anon key,
`propietarios_select` —que para staff es `fn_is_staff()` sin condición de club— no cambiaría nada:
el probe daría verde sobre el bug intacto.

### Teardown

Crea 2 fixtures (una en Dolores, una en `Mi Club Hípico`, ambas con prefijo `ZZ PROBE CLUBID`) y las
borra en el `finally`. Verificado de las dos formas, como se pidió:

- **Z1 — por estado**: cada id creado tiene que dejar de existir (`.in('id', creados)` → 0 filas)
  **y** no puede quedar ninguna fila con el prefijo del fixture. No es "debería": se consulta.
- **Z2 — por conteo**: `total` / Dolores / otro club / huérfanos vuelven a la línea de base tomada
  **antes** de correr, no a un número escrito en el test.

Además hay **barrido preflight** por prefijo antes de empezar, por si una corrida anterior murió a
mitad de camino, y **A0** verifica que la línea de base no tenga huérfanas antes de arrancar.

### Corrida — salida cruda completa

```
$ node tests/probe_club_id_alta_propietarios.mjs
   línea de base: total=260 dolores=253 otro=7 nulos=0

── Probe · club_id en el alta y el listado de propietarios.html (ISSUE-072) ──
   propietarios=/home/clio/dev/SGH/propietarios.html
   solicitudes =/home/clio/dev/SGH/solicitudes.html
   dni_fixture =99933892
 ✅ A0) la línea de base no tiene fichas huérfanas (club_id NULL) antes de empezar  → nulos=0
 ✅ A1) saveRecord() crea la ficha CON club_id del hipódromo activo (no NULL)  → toasts=[{"msg":"Propietario creado","tipo":"success"}] · fila={"id":"f0ff2619-eef1-45ff-8685-5d6afc8cdf98","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","nombre":"ZZ PROBE CLUBID Iguacel Loeda, Federico","nombre_stud":"Kazan","documento_tipo":"DNI","documento_nro":"99933892","tipo":"persona","estado":"activo","activo":true}
 ✅ A1b) y el resto del payload llegó entero, con el DNI normalizado por parseDNI  → {"id":"f0ff2619-eef1-45ff-8685-5d6afc8cdf98","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","nombre":"ZZ PROBE CLUBID Iguacel Loeda, Federico","nombre_stud":"Kazan","documento_tipo":"DNI","documento_nro":"99933892","tipo":"persona","estado":"activo","activo":true}
 ✅ A2) buscarFichas() la encuentra por DNI exacto y la marca EXACTO — el botón "Vincular y aprobar" se habilita  → exactas=[{"id":"f0ff2619-eef1-45ff-8685-5d6afc8cdf98","nombre":"ZZ PROBE CLUBID Iguacel Loeda, Federico","nombre_stud":"Kazan","documento_nro":"99933892","tipo":"persona"}] · sugeridas=0
 ✅ A3) ⭐ y el buscador manual de la bandeja también la encuentra — circuito completo propietarios.html → solicitudes.html  → sugeridas=[{"id":"f0ff2619-eef1-45ff-8685-5d6afc8cdf98","nombre":"ZZ PROBE CLUBID Iguacel Loeda, Federico"}]
 ✅ A4) load() lista TODAS las fichas de Dolores y NINGUNA de otro club  → listadas=254 · dolores_en_db=254 · otro_en_db=8 · ajenas_en_lista=0 · ejemplo_ajena=[]
 ✅ A4b) la ficha ajena SÍ está en la DB — el 0 de arriba es del filtro, no de una tabla vacía  → otro_base=7 · otro_ahora=8
 ✅ A4c) el filtro por estado sigue funcionando encima del filtro por club  → activos=254
 ✅ A5) editar por id una ficha de otro club es un no-op: no la pisa NI la mueve de hipódromo  → {"id":"9fb5d05a-30c8-48b4-95ce-906d912d6b70","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","nombre":"ZZ PROBE CLUBID Ajeno De Otro Club","tipo":"persona"}
 ✅ A5b) y avisa que no se guardó, en vez de cantar "Propietario actualizado"  → [{"msg":"No se pudo actualizar: la ficha no pertenece a este hipódromo.","tipo":"error"}] · cerroModal=0
 ✅ A6) editar una ficha del propio club sigue guardando, y no le cambia el club  → {"id":"f0ff2619-eef1-45ff-8685-5d6afc8cdf98","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","nombre_stud":"Kazan II","estado":"inactivo","activo":false,"localidad":"Dolores"} · toasts=[{"msg":"Propietario actualizado","tipo":"success"}]
 ✅ A7) con club_id cargado, ux_propietarios_club_doc rechaza el alta repetida del mismo DNI  → fila_duplicada=null · toasts=[{"msg":"duplicate key value violates unique constraint \"ux_propietarios_club_doc\"","tipo":"error"}]
 ✅ Z1) teardown por estado: ninguno de los ids creados sigue existiendo, y no queda ninguna fila con el prefijo del fixture  → ids_creados=2 · siguen_vivos=[] · por_prefijo=[]
 ✅ Z2) teardown por conteo: total, Dolores, otro club y huérfanos vuelven a la línea de base  → base={"total":260,"dolores":253,"otro":7,"nulos":0} · fin={"total":260,"dolores":253,"otro":7,"nulos":0}

14/14 OK
exit=0
```

Estado de la base después de la corrida (confirmación independiente del teardown, por MCP):

```sql
select count(*) total, count(*) filter (where club_id is null) nulos,
       count(*) filter (where nombre like 'ZZ PROBE%') fixtures,
       count(*) filter (where club_id='0649e9c5-9e87-4aad-842f-101458e6b33c') dolores,
       count(*) filter (where club_id='a6da7e40-1515-45dc-8933-4eef33ce937a') otro
from propietarios;
```

```json
[{"total":260,"nulos":0,"fixtures":0,"dolores":253,"otro":7}]
```

Idéntico a los guards de arranque. La base quedó como estaba.

---

## 5. Mutation testing — 7 mutantes, uno por pieza

Se pidió "por cada uno de los dos fixes"; salieron 7 porque el fix tiene tres piezas y cada una
admite más de una forma de romperse. **M1 y M3 son los dos bugs originales tal cual estaban en
`main`**: el runner los resucita sobre una copia en `/tmp` y verifica que el probe los mate.

| # | Qué rompe | Debe matar |
|---|---|---|
| **M1** | **BUG ORIGINAL 1** — el payload del INSERT vuelve a no mandar `club_id` | A1, A2, A3 |
| M2 | `club_id` se manda pero en `null`: la ficha nace igual de huérfana | A1, A2, A3 |
| **M3** | **BUG ORIGINAL 2** — `load()` vuelve a listar todos los clubes | A4 |
| M4 | `load()` filtra por un club fijo equivocado en vez de por `CLUB_ID` | A4 |
| M5 | el UPDATE pierde el acote por club (la ficha ajena se puede mover de hipódromo) | A5 |
| M6 | el UPDATE de 0 filas canta "actualizado" igual | A5b |
| M7 | el UPDATE legítimo del propio club deja de funcionar (falso positivo del acote) | A6 |

M7 es el mutante de signo contrario: comprueba que el acote no rompa el camino bueno. Sin él, un
fix que bloqueara **todas** las ediciones pasaría los otros seis.

El runner distingue **muere** de **ERROR DE ARNÉS** (GOTCHA #90): si el hijo no llega a imprimir la
línea `NN/NN OK`, no se sabe nada del mutante y reportarlo como sobreviviente sería mentir. Además
chequea que el teardown del hijo haya quedado limpio: un mutante que deja basura en producción es un
hallazgo aunque muera.

### Corrida — salida cruda completa

```
$ node tests/probe_club_id_alta_propietarios.mjs --mutantes

═══ MUTATION TESTING · 7/7 mutantes ═══
(copias en /tmp/mut-clubid-prop-9wpWlh — el repo no se toca)

✅ M1 muere — BUG ORIGINAL 1 — el payload del INSERT vuelve a no mandar club_id  [esperaba matar A1,A2,A3; murieron A1,A2,A3]
✅ M2 muere — club_id se manda pero en null: la ficha nace igual de huérfana  [esperaba matar A1,A2,A3; murieron A1,A2,A3]
✅ M3 muere — BUG ORIGINAL 2 — load() vuelve a listar todos los clubes  [esperaba matar A4; murieron A4]
✅ M4 muere — load() filtra por un club fijo equivocado en vez de por CLUB_ID  [esperaba matar A4; murieron A4]
✅ M5 muere — el UPDATE pierde el acote por club: una ficha ajena se puede mover de hipódromo  [esperaba matar A5; murieron A5]
✅ M6 muere — el UPDATE de 0 filas canta "actualizado" igual  [esperaba matar A5b; murieron A5b]
✅ M7 muere — el UPDATE legítimo del propio club deja de funcionar (falso positivo del acote)  [esperaba matar A6; murieron A6]

✅ TANDA LIMPIA — 7 probados · 7 muertos

exit=0
```

**7/7 muertos, 0 sobrevivientes, 0 errores de arnés, 0 teardowns sucios.**

---

## 6. Efecto colateral: el índice anti-duplicado empieza a morder

```sql
select indexname, indexdef from pg_indexes where tablename='propietarios';
```

```json
[{"indexname":"propietarios_pkey","indexdef":"CREATE UNIQUE INDEX propietarios_pkey ON public.propietarios USING btree (id)"},
 {"indexname":"idx_propietarios_club","indexdef":"CREATE INDEX idx_propietarios_club ON public.propietarios USING btree (club_id)"},
 {"indexname":"ux_propietarios_club_doc","indexdef":"CREATE UNIQUE INDEX ux_propietarios_club_doc ON public.propietarios USING btree (club_id, documento_tipo, documento_nro) WHERE (documento_nro IS NOT NULL)"}]
```

`ux_propietarios_club_doc` es `UNIQUE (club_id, documento_tipo, documento_nro)`. En un índice único
de Postgres **los NULL son distintos entre sí**, así que con `club_id NULL` dos altas del mismo DNI
nunca chocaban: el índice existía y no protegía nada en el camino de la pantalla.

Con el `club_id` cargado empieza a funcionar. El assert **A7** lo verifica dando de alta dos veces
el mismo DNI:

```
✅ A7) con club_id cargado, ux_propietarios_club_doc rechaza el alta repetida del mismo DNI
   → fila_duplicada=null · toasts=[{"msg":"duplicate key value violates unique constraint \"ux_propietarios_club_doc\"","tipo":"error"}]
```

No estaba pedido; salió del fix y conviene que quede asentado, porque cambia el comportamiento
visible: cargar dos veces al mismo propietario ahora da error en vez de duplicar la ficha en
silencio. El mensaje que ve la secretaría es el crudo de Postgres — feo, pero correcto. Anotado
como pregunta abierta.

---

## 7. Verificación del push

```
$ git ls-remote origin main reports fix/club-id-alta-propietarios
bba68945c14b739aff3e3565665c311c533b74bc	refs/heads/fix/club-id-alta-propietarios
cc0ea64c8847d5eafb78a234cfedc749ab597afe	refs/heads/main
57acd3a1b6a9900905d45877db242735ab714aba	refs/heads/reports

$ git rev-parse fix/club-id-alta-propietarios
bba68945c14b739aff3e3565665c311c533b74bc

$ git log --oneline -1 fix/club-id-alta-propietarios
bba6894 fix: propietarios.html crea con club_id y lista sólo su club (ISSUE-072)
```

`git rev-parse fix/club-id-alta-propietarios` y `git ls-remote origin fix/club-id-alta-propietarios`
dan el mismo SHA: **`bba68945c14b739aff3e3565665c311c533b74bc`**. La rama está en `origin` y se puede
leer.

**`main` sigue en `cc0ea64`. NO se mergeó nada.** El gate está pedido: el fix espera OK.

Para verlo:

```bash
git fetch origin
git diff origin/main..origin/fix/club-id-alta-propietarios
```

---

## Resumen

| Ítem pedido | Estado |
|---|---|
| 1. `club_id: CLUB_ID` en el payload, `.eq('club_id', CLUB_ID)` en `load()`, mismo patrón que `profesionales.html` | ✅ hecho — `CLUB_ID` estaba disponible en el scope, no hubo que improvisar |
| 2. Revisar el branch de UPDATE, decidir y justificar | ✅ acotado por club + aviso de 0 filas. Justificación en §2. Por API **quedaba** abierto; ahora la pantalla no lo permite, **la policy sigue abierta** |
| 3. 253 de Dolores visibles, 7 de Mi Club Hípico fuera, conteo antes y después | ✅ 253 → 253 y 7 → 0, corriendo el `load()` real de las dos versiones contra la misma base |
| Probe real-code, patrón vigente, con el assert del circuito | ✅ 14/14, A3 es el circuito completo |
| Mutation test por cada fix | ✅ 7/7 muertos, incluidos M1 y M3 (los dos bugs originales) |
| Teardown verificado por conteo, no por "debería" | ✅ Z1 por estado + Z2 por conteo contra la línea de base + preflight |
| Issue propio, gemelo del 049, sin reabrirlo | ✅ ISSUE-072, con el 049 referenciado como antecedente |
| Diff a branch, pusheado, sin mergear | ✅ `fix/club-id-alta-propietarios` = `bba6894` en `origin`; `main` intacto en `cc0ea64` |

Fuera de alcance, no tocado: el botón "Crear ficha nueva" de la bandeja, `rpc_aprobar_solicitud`,
`buscarFichas()`, el matcheo por apellido y `origen_caballeriza`.

## Preguntas abiertas

1. **¿Se mergea?** El fix destraba el caso de Fede: con esto, "crear la ficha en Propietarios y
   volver a la bandeja" pasa a funcionar de verdad. Sin merge, Yesi sigue sin poder resolver la
   solicitud por ninguna vía.
2. **El error de duplicado que ve la secretaría es el crudo de Postgres**
   (`duplicate key value violates unique constraint "ux_propietarios_club_doc"`). ¿Se traduce a algo
   como *"Ya existe un propietario con ese DNI en este hipódromo"*? Es un cambio de una línea, pero
   es producto: hoy nadie lo veía porque el índice no mordía.
3. **`profesionales.html` tiene el UPDATE sin acote por club** (`:413-414`) — el mismo agujero que
   acá se cerró, alcanzable sólo por API. ¿Se hace ahora en un fix aparte, o se junta con el cambio
   de las policies?
4. **Las 4 policies de `propietarios` (y las de `profesionales`) no tienen condición de club.**
   `propietarios_update` es `fn_is_staff()` a secas. El acote de la pantalla no es el de la base.
   ¿Entra en el trabajo de RLS que ya está en ISSUE-017, o va por su cuenta?
5. **`super_admin` sin club seleccionado** (`CLUB_ID` null) no ve propietarios, y un alta suya
   volvería a nacer con `club_id NULL`. Es el comportamiento que hoy tienen `profesionales.html` y
   `jockeys.html`; se unifica, no se empeora. Si se quiere cerrar, hay que hacerlo en las tres
   pantallas a la vez — decisión de producto, no la tomé sola.
6. **ISSUE-016 pregunta si `propietarios.html` debería deprecarse** en favor de
   `caballeriza_responsables`. Este fix lo deja sano, pero si la respuesta a ISSUE-016 es "se
   deprecia", el botón "Crear ficha nueva" de la bandeja debería crear la ficha por RPC y no
   mandar a nadie a esta pantalla.

---

## Adenda — verificación final de los tres refs en `origin`

Corrido después de commitear este informe:

```
$ git ls-remote origin main reports fix/club-id-alta-propietarios
bba68945c14b739aff3e3565665c311c533b74bc	refs/heads/fix/club-id-alta-propietarios
cc0ea64c8847d5eafb78a234cfedc749ab597afe	refs/heads/main
b793e96808e08d87619d51e5721b9678f8806d41	refs/heads/reports

$ git rev-parse HEAD          # en reports
b793e96808e08d87619d51e5721b9678f8806d41
```

- **`main` = `cc0ea64`** — intacto, sin merge. ✅ gate respetado.
- **`fix/club-id-alta-propietarios` = `bba6894`** — en `origin`, legible. ✅
- **`reports` = `b793e96`** — el commit de este informe está publicado. ✅

Ese `b793e96` es el commit del cuerpo del informe; esta adenda va en el commit siguiente, cuyo SHA
se deja anotado abajo una vez pusheado.

SHA de esta adenda, verificado en `origin/reports`: **`4c9db942623ba0db9824a9d787ec007d975164e0`**.
