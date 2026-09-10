# Fix — la secretaría puede crear entrenadores (ISSUE-078, ISSUE-073, ISSUE-079)

**Fecha:** 2026-09-10
**Rama del informe:** `reports`
**Rama de trabajo:** `fix/alta-entrenador-operador` — **pusheada, SIN MERGEAR**
**SHA del fix:** `e5050cdf04c290cad078324e8c95cc8bd065d525`
**Base:** `main` @ `eface80078b99a56c9ae3160053cd8fd0c425d31` (intacto)
**Informe previo del que sale:** `docs/diagnosticos/2026-09-10_alta-entrenador-desde-solicitudes.md`

## Guards verificados

```
$ pwd
/home/clio/dev/SGH
```

```sql
select count(*) as spcs_count from spcs;
```
```json
[{"spcs_count":181}]
```

Los dos dan lo esperado. Todo el relevamiento de código se hizo contra `main`
(`git show main:<archivo>` / `git grep … main`); el trabajo se hizo en una rama nueva creada
desde `main`.

---

## Resumen de las cuatro respuestas

| # | Pedido | Qué se hizo |
|---|---|---|
| 1 | El fix del botón | **Hecho.** El patrón de `jockeys.html` / `caballerizas.html` es **no tener gate**: la pantalla no filtra por rol, filtra la policy. Se copió eso. Con una excepción razonada: Eliminar. |
| 2 | El tipo fijo | **Se decidió el selector**, no el aviso. `<select id="f-tipo">` con los tres valores del ENUM en las dos pantallas. Justificación abajo. |
| 3 | Verificar `club_id` | **INSERT ya estaba bien** (ISSUE-049); el probe lo fija con un assert. **UPDATE no lo estaba** — era ISSUE-073, y se cerró acá, junto con el toggle y el DELETE. |
| 4 | Duplicados | **Se implementó**, no se dejó como issue: la mitigación por UI. Lo que sí queda como issue es el **índice único** (ISSUE-079), que es DDL. |
| — | Probe | 30 asserts, 14 mutantes, todos muertos. |
| — | Hook `python: not found` | **Arreglado.** No es de SGH: es el plugin `claude-seo`. Detalle al final. |

---

## 1. EL FIX — cuál es el patrón que usan jockeys y caballerizas

**El patrón es: no hay patrón de gate. Esas dos pantallas no filtran botones por rol.**

```bash
git show main:jockeys.html       | grep -n "super_admin\|btn-nuevo\|style.display"
git show main:caballerizas.html  | grep -n "super_admin\|btn-nuevo\|openModal()"
git show main:profesionales.html | grep -n "super_admin"
```

Salida cruda (la línea de `initAuth()` aparece en las tres porque menciona `super_admin` para
resolver `CLUB_ID`; es idéntica en los tres archivos y está transcripta entera en el informe del
2026-09-10, §1):

```
=== jockeys.html ===
236:async function initAuth(){…usr.rol==='super_admin'… resolución de CLUB_ID …}
     (ninguna otra aparición de super_admin, btn-nuevo ni style.display)

=== caballerizas.html ===
144:    <button class="btn-primary" onclick="openModal()">+ Nueva Caballeriza</button>
243:async function initAuth(){…usr.rol==='super_admin'… resolución de CLUB_ID …}
     (ninguna otra aparición de super_admin ni btn-nuevo)

=== profesionales.html ===
234:async function initAuth(){…}
268:  if (currentUser.rol !== 'super_admin') {
338:      ${currentUser.rol === 'super_admin'
```

Y no es que lo hayan tenido y lo hayan sacado:

```bash
git log --oneline -S"style.display = 'none'" main -- jockeys.html caballerizas.html
```
```
d5b441a Adaptar UI de caballerizas al modelo relacional de responsables
```

(ese commit es sobre el modal de co-propietarios, no sobre un gate de rol).

**Formulado como criterio: la pantalla no gatea, gatea la policy.** Es coherente con cómo está
armada la seguridad del sistema — `profesionales_insert` y `profesionales_update` son
`WITH CHECK (fn_is_staff())`, y `fn_is_staff()` incluye `operador`.

### Lo que se cambió

`profesionales.html`, dos lugares:

```diff
 async function load() {
-  if (currentUser.rol !== 'super_admin') {
-    document.getElementById('btn-nuevo').style.display = 'none';
-  }
+  // El botón "+ Nuevo Entrenador" NO se oculta por rol. […]
+  // El criterio que rige ahora es el de jockeys.html y caballerizas.html: la pantalla no gatea,
+  // gatea la policy. […]
   document.getElementById('list-container').innerHTML = '…Cargando entrenadores…';
```

```diff
     <div class="card-actions">
-      ${currentUser.rol === 'super_admin'
-        ? `<button class="btn-sm btn-edit" …>✏️ Editar</button>
-           <button class="btn-sm btn-delete" …>🗑️ Eliminar</button>`
-        : ((r.estado || 'activo') === 'baja' ? '' :
-           `<button class="btn-sm …btn-desactivar…">…</button>`)
-      }
+      <button class="btn-sm btn-edit" onclick='openModal(${JSON.stringify(r)})'>✏️ Editar</button>
+      ${(r.estado || 'activo') === 'baja' ? '' :
+        `<button class="btn-sm …btn-desactivar…">…</button>`}
+      ${currentUser.rol === 'super_admin'
+        ? `<button class="btn-sm btn-delete" …>🗑️ Eliminar</button>`
+        : ''}
     </div>
```

### La única excepción, y por qué

**Eliminar sigue oculto para quien no es `super_admin`.** Copiar `jockeys.html` *tal cual* habría
sido copiar también un defecto:

```sql
-- policy vigente
profesionales_delete   DELETE   qual: ( SELECT fn_is_super_admin() )
```

Un `operador` que aprieta Eliminar en `jockeys.html` **hoy** obtiene un DELETE que la RLS filtra:
PostgREST devuelve `error: null` y 0 filas, y la pantalla canta *"Jockey eliminado"* sobre nada.
Es un botón que miente. Mostrarlo también en Entrenadores habría multiplicado el problema en vez
de resolverlo.

Se hicieron las dos cosas: **ocultarlo en `profesionales.html`** (donde nunca estuvo visible para
la secretaría, así que no se le quita nada a nadie) y **contar filas en las dos pantallas**, para
que si algún día se muestra, avise:

```js
const { data: filasDel, error } = await sb.from('profesionales').delete()
  .eq('id', id).eq('club_id', CLUB_ID).select('id');
if (error) { toast(error.message, 'error'); return; }
if (!filasDel || filasDel.length === 0) {
  toast('No se pudo eliminar: hace falta permiso de super_admin.', 'error'); return;
}
```

Esto último **está fuera de lo que pediste** — lo marco explícito para que se pueda sacar del diff
si preferís. La razón para incluirlo: es el mismo defecto de 0-filas-silenciosas que el punto 3 ya
obligaba a arreglar en el UPDATE, en la función de al lado, y con el alta habilitada el botón queda
al alcance de más gente. Assert A10, mutantes M3 y M11.

---

## 2. EL TIPO FIJO — la decisión, y por qué

**Decisión: el formulario deja elegir el tipo. En las dos pantallas.** Se descarta la variante
"cada pantalla crea con el suyo pero avisa".

### El estado del que se parte

```bash
git grep -n "in('tipo'" main -- '*.html' '*.js'
```
```
main:index.html:253:        …profesionales…in('tipo', ['entrenador', 'ambos'])…
main:index.html:254:        …profesionales…in('tipo', ['jockey', 'ambos'])…
main:inscripciones.html:405: …profesionales…in('tipo', ['jockey', 'ambos'])…
main:inscripciones.html:406: …profesionales…in('tipo', ['entrenador', 'ambos'])…
main:jockeys.html:271:       …profesionales…in('tipo', ['jockey', 'ambos'])…
main:profesionales.html:273: …profesionales…in('tipo', ['entrenador', 'ambos'])…
main:sanciones.html:256:     …profesionales…in('tipo', ['jockey', 'ambos'])…
main:sanciones.html:259:     …profesionales…in('tipo', ['entrenador', 'ambos'])…
main:spcs.html:315:          …profesionales…in('tipo', ['jockey', 'ambos'])…
main:spcs.html:317:          …profesionales…in('tipo', ['entrenador', 'ambos'])…
```

**Nueve lugares** de la app dependen de esa columna. Una ficha mal tipada desaparece de la mitad.

```sql
select tipo, count(*) from profesionales group by tipo order by 2 desc;
```
```json
[{"tipo":"entrenador","count":133},{"tipo":"jockey","count":51},{"tipo":"ambos","count":1}]
```

Ese `ambos` es ALDECOA IVAN, y entró por importación: **desde la UI no había forma de crear uno**.

### Las cuatro razones de la decisión

1. **El tipo es un atributo de la persona, no de la pantalla.** Es una sola tabla y un solo ENUM.
   Que el valor lo fije el archivo HTML desde el que entraste es un accidente de navegación.
2. **`ambos` era inalcanzable.** Con la variante "cada pantalla crea el suyo y avisa", sigue
   siéndolo. El caso existe en la realidad del turf y hay una fila que lo prueba.
3. **Avisar no alcanza, porque después no se puede corregir.** Si Yesi crea una entrenadora desde
   Jockeys y la pantalla le avisa *"quedó como jockey"*, ¿y después qué? La ficha **no aparece** en
   Entrenadores (el listado filtra `entrenador`/`ambos`), y el `update` de Jockeys volvía a forzar
   `'jockey'`. El aviso la deja mirando un error que no puede arreglar. El selector hace
   self-service tanto el alta como la corrección.
4. **Es más chico que la alternativa.** Un `<select>` y una línea de payload por archivo, contra
   una heurística de "detectar que el tipo probablemente esté mal" que después igual no arregla nada.

### El cuidado con el ENUM: no es binario

El ternario viejo existía por una razón buena, y esa razón se conserva:

```js
// antes — preservaba 'ambos' al editar, pero de forma implícita e incorregible
tipo: prev?.tipo === 'ambos' ? 'ambos' : 'entrenador',

// ahora — el selector lo lleva, y openModal lo precarga con el tipo REAL de la ficha
tipo: document.getElementById('f-tipo').value,
```
```js
// openModal()
document.getElementById('f-tipo').value = rec?.tipo || TIPO_DEFAULT;
```

Editar un `ambos` desde cualquiera de las dos pantallas lo deja en `ambos`, igual que antes — pero
ahora se ve en pantalla y se puede cambiar. Assert **A7**, mutante **M7**.

### Un detalle que conviene saber

Los dos formularios tienen campos distintos: `profesionales.html` tiene `patente`, `jockeys.html`
tiene `matricula_nro` y `categoria_jockey`. El payload de cada uno **sólo lista sus columnas**, y
un `update` de PostgREST es un patch parcial: editar un `ambos` desde Entrenadores **no** le borra
la matrícula de jockey. Un `ambos` creado desde Jockeys nace sin patente y se le carga después
desde Entrenadores, donde también aparece.

### Y el toast de destino

Si el tipo elegido saca la ficha del listado en el que estás, se avisa — si no, parece que se
perdió:

```js
if (!TIPOS_PANTALLA.includes(payload.tipo)) {
  toast('Quedó como Jockey: la vas a encontrar en la pantalla de Jockeys.');
}
```

---

## 3. VERIFICACIÓN DEL `club_id`

### 3.1 El INSERT — ya estaba bien

```bash
git show main:profesionales.html | sed -n '395,400p'
```
```javascript
  const prev = id ? (allData || []).find(r => r.id === id) : null;
  const payload = {
    club_id: CLUB_ID,
    tipo: prev?.tipo === 'ambos' ? 'ambos' : 'entrenador',
    nombre: document.getElementById('f-nombre').value.trim(),
    apellido: document.getElementById('f-apellido').value.trim(),
```

`club_id: CLUB_ID` está en el payload desde **ISSUE-049** (cerrado el 05/08/2026). Éste es el
archivo que en su momento sirvió de patrón para arreglar `propietarios.html`, no al revés. No hubo
que tocar nada.

**Igual se le puso assert** (A3), y un mutante que lo saca (M4). El motivo es literal: lo que
falló en `propietarios.html` fue que nadie lo estaba mirando. El mutante M4 mata A3, A4 y A4b —
o sea, sacar el `club_id` rompe también el circuito de la bandeja, que es lo que hay que ver.

Estado de los datos, medido antes de tocar nada:

```sql
select count(*) total,
 count(*) filter (where club_id is null) nulos,
 count(*) filter (where club_id='0649e9c5-9e87-4aad-842f-101458e6b33c') dolores,
 count(*) filter (where club_id='a6da7e40-1515-45dc-8933-4eef33ce937a') otro,
 count(*) filter (where documento_nro is null or btrim(documento_nro)='') sin_dni
from profesionales;
```
```json
[{"total":185,"nulos":0,"dolores":174,"otro":11,"sin_dni":40}]
```

**0 fichas huérfanas.** El defecto de `propietarios.html` no existe acá.

### 3.2 El UPDATE — NO estaba acotado. Era ISSUE-073, y se cierra en este cambio

El issue lo dejé abierto yo mismo al cerrar ISSUE-072, con el razonamiento entero
(`docs/ISSUES.md`, ISSUE-073). El punto central:

> Con el `club_id` en el payload compartido entre INSERT y UPDATE, ese archivo tiene hoy
> exactamente el agujero que ISSUE-072 acaba de cerrar. […] Antes de ISSUE-049, un UPDATE por id
> de una ficha ajena la **editaba**. Después de ISSUE-049, ese mismo UPDATE la **mueve de
> hipódromo**. Es estrictamente **peor**.

**Coincido con el planteo del pedido: habilitar el alta sin esto repite el bug.** Van en el mismo
diff. Los cuatro caminos que quedaron acotados:

| archivo | camino | antes | ahora |
|---|---|---|---|
| `profesionales.html` | modal (`:413` en main) | `.update(payload).eq('id', id)` | `+ .eq('club_id', CLUB_ID).select('id')` + chequeo de 0 filas |
| `profesionales.html` | toggle de estado (`:287`) | `.update({estado,activo}).eq('id', id)` | idem |
| `profesionales.html` | delete (`:424`) | `.delete().eq('id', id)` | idem |
| `jockeys.html` | modal (`:402`) | `.update(payload).eq('id', id)` | idem |
| `jockeys.html` | delete (`:413`) | `.delete().eq('id', id)` | idem |

El chequeo de 0 filas **no es decoración**:

```js
const { data: filasUpd, error } = id
  ? await sb.from('profesionales').update(payload).eq('id', id).eq('club_id', CLUB_ID).select('id')
  : await sb.from('profesionales').insert(payload);
btn.disabled = false; btn.textContent = 'Guardar';
if (error) { toast(error.message, 'error'); return; }
if (id && (!filasUpd || filasUpd.length === 0)) {
  toast('No se pudo actualizar: la ficha no pertenece a este hipódromo.', 'error'); return;
}
```

PostgREST **no** devuelve error cuando un UPDATE no matchea ninguna fila: devuelve `error: null`.
Sin contar filas, la pantalla cantaba "actualizado", cerraba el modal y recargaba sobre una
escritura que nunca ocurrió. Mutante **M9**.

**Lo que este cambio NO cubre**, igual que decía el issue: las policies. `profesionales_update`
sigue siendo `fn_is_staff()` sin condición de club, así que el acote es **de la pantalla, no de la
base**. Eso es DDL y va con el trabajo de RLS (ISSUE-017).

---

## 4. LOS DUPLICADOS

**Se implementó la mitigación por UI en este mismo diff.** Lo que se deja como issue es el índice
único (ISSUE-079), que es DDL.

### Por qué no se dejó todo como issue

```sql
select indexname, indexdef from pg_indexes where tablename='profesionales' order by indexname;
```
```json
[{"indexname":"idx_profesionales_club","indexdef":"CREATE INDEX idx_profesionales_club ON public.profesionales USING btree (club_id)"},
 {"indexname":"profesionales_pkey","indexdef":"CREATE UNIQUE INDEX profesionales_pkey ON public.profesionales USING btree (id)"}]
```

Eso es todo. **`profesionales` no tiene ningún índice único por documento.** Su tabla hermana
`propietarios` sí lo tiene (`ux_propietarios_club_doc`) — es lo que hace que el assert A7 del probe
de ISSUE-072 rechace el alta repetida. Acá no choca contra nada.

O sea: el pedido habilita el alta manual de a uno **sobre la única de las dos tablas donde la base
no frena el duplicado**. Dejar el aviso para después sería habilitar el camino y la trampa juntos.

### Cómo está diseñado, y por qué NO bloquea

Dos señales de fuerza muy distinta, separadas a propósito:

| señal | presentación | por qué |
|---|---|---|
| mismo `documento_nro` en el mismo club | panel rojo, "Si es la misma persona, cerrá y editá esa ficha en vez de crear otra" | es un duplicado real, y la base no lo frena |
| apellido parecido (`ilike %ape%`) | panel gris, con el documento y el tipo de cada uno a la vista | en este padrón es lo **normal**, no la excepción |

La razón de que sea informativo son los datos, no la pereza:

```sql
select lower(btrim(apellido)) ap, count(*),
       string_agg(apellido||', '||nombre||' ['||tipo||'] dni='||coalesce(documento_nro,'—'), ' | ') fichas
from profesionales where club_id='0649e9c5-9e87-4aad-842f-101458e6b33c'
group by 1 having count(*)>1 order by 2 desc limit 15;
```
```json
[{"ap":"diestra","count":5,"fichas":"DIESTRA, CLAUDIO MAXIMILIANO [entrenador] dni=34457348 | DIESTRA, FLORENCIA [entrenador] dni=40721323 | DIESTRA, JUAN DOMINGO [entrenador] dni=— | DIESTRA, BAUTISTA [jockey] dni=48773968 | DIESTRA, PEDRO EMANUEL [jockey] dni=39328682"},
 {"ap":"gonzalez","count":5,"fichas":"GONZALEZ, LUCAS [jockey] dni=— | GONZALEZ, AGUSTIN [jockey] dni=— | GONZALEZ, ADRIAN AGUSTIN [entrenador] dni=— | GONZALEZ, EDUARDO CECILIO [jockey] dni=— | GONZALEZ, JOSE ANTONIO [jockey] dni=36625637"},
 {"ap":"canto","count":3,"fichas":"CANTO, HORACIO [entrenador] dni=— | CANTO, TOMAS [entrenador] dni=— | CANTO, TOBIAS [jockey] dni=48160527"},
 {"ap":"alday","count":3,"fichas":"ALDAY, GERMAN CEFERINO [entrenador] dni=22727150 | ALDAY, SERGIO ESTEBAN [entrenador] dni=— | ALDAY, ADRIAN ALFREDO [entrenador] dni=26850159"},
 {"ap":"diaz","count":3,"fichas":"DIAZ, EMILIANO LUJAN [entrenador] dni=32006224 | DIAZ, CARLOS RODOLFO [entrenador] dni=14520938 | DIAZ, AMERICO RAMON [entrenador] dni=5214110"},
 {"ap":"gimenez","count":2,"fichas":"Gimenez, Roberto [entrenador] dni=14223344 | GIMENEZ, MARCOS EZEQUIEL [entrenador] dni=27776972"},
 {"ap":"san martin","count":2,"fichas":"SAN MARTIN, ERNESTO HUGO [entrenador] dni=21921706 | SAN MARTIN, SERGIO SEBASTIAN [entrenador] dni=31024086"},
 {"ap":"castro","count":2,"fichas":"CASTRO, FABIO JOSE [entrenador] dni=14979152 | CASTRO, CRISTIAN FABIO [entrenador] dni=32555190"},
 {"ap":"machicote","count":2,"fichas":"MACHICOTE, JULIO CESAR [entrenador] dni=16237205 | MACHICOTE, MIGUEL ANGEL [entrenador] dni=10663560"},
 {"ap":"carli","count":2,"fichas":"CARLI, FEDERICO [entrenador] dni=29785033 | CARLI, ORNELA [entrenador] dni=34653709"},
 {"ap":"acuña","count":2,"fichas":"ACUÑA, LUIS OMAR [jockey] dni=43851710 | ACUÑA, MATIAS EZEQUIEL [jockey] dni=38284072"},
 {"ap":"yalet","count":2,"fichas":"YALET, JORGE [jockey] dni=35950645 | YALET, IRINEO [jockey] dni=42047182"},
 {"ap":"martinez","count":2,"fichas":"MARTINEZ, AGUSTIN [jockey] dni=— | MARTINEZ, JULIO MIGUEL [entrenador] dni=23438468"},
 {"ap":"maitia","count":2,"fichas":"MAITIA, LUIS [entrenador] dni=— | MAITIA, MIGUEL A [entrenador] dni=—"},
 {"ap":"presa","count":2,"fichas":"PRESA, LUIS HORACIO [entrenador] dni=12735421 | PRESA, DANIEL [jockey] dni=32334794"}]
```

**5 DIESTRA, 5 GONZALEZ, 3 CANTO, 3 ALDAY, 3 DIAZ** — familias del turf, todas personas distintas.
Un aviso que corta el alta se dispararía en la mayoría de las cargas y se aprendería a saltear en
una semana.

Y el caso que motivó el pedido es exactamente un falso positivo de apellido:

```sql
select id,nombre,apellido,tipo,documento_nro,club_id from profesionales
where apellido ilike '%zubi%' or nombre ilike '%zubi%' order by apellido;
```
```json
[{"id":"1f46b478-5edf-4cb5-be36-957d7fec99d3","nombre":"SANTIAGO","apellido":"ZUBIARRAIN","tipo":"entrenador","documento_nro":"14527442","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c"},
 {"id":"674157cf-9393-419e-bf50-0881802b785e","nombre":"SANTIAGO","apellido":"ZUBIRIA","tipo":"jockey","documento_nro":"39342378","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c"}]
```

Mismo nombre de pila, apellidos parecidos, **documentos distintos**. Por eso el aviso muestra
**siempre** el documento y el tipo al lado de cada parecido: es el dato con el que se descartan.
El probe fija ese caso con esos dos registros reales (**A13b**).

### Dónde vive

`profesionales-duplicados.js` (nuevo, 108 líneas), compartido por las dos pantallas — misma
convención que `edad-spc.js` / `renumerar-chapas.js`. Se dispara al salir de **Apellido** o de
**N° documento**, sólo en un alta nueva. Guardas: no consulta con apellido de menos de 3 letras
(traería medio padrón — mutante M14), escapa los comodines `%` y `_` de PostgREST, filtra siempre
por club (mutante M13), y **si la consulta falla, el alta sigue siendo posible** (es una ayuda, no
un requisito).

### Lo que queda pendiente — ISSUE-079

El índice. Se puede crear ya, sin limpieza previa:

```sql
select club_id, documento_tipo, documento_nro, count(*),
       string_agg(apellido||', '||nombre||' ['||tipo||']', ' | ') as fichas
from profesionales
where documento_nro is not null and btrim(documento_nro)<>''
group by 1,2,3 having count(*)>1 order by 4 desc;
```
```json
[]
```

**0 duplicados exactos** sobre las 145 filas con documento cargado. El DDL propuesto queda escrito
en ISSUE-079; no se aplicó porque es DDL y merece su propio diff con su migración versionada.

---

## PROBE

`tests/probe_alta_entrenador_operador.mjs` — **30 asserts, 14 mutantes**.

Corre el código **real** de las dos pantallas (`load`, `saveRecord`, `cardHTML`, `openModal`,
`toggleEstado`, `deleteRecord`), el `buscarFichas()` **real** de `solicitudes.html` sin tocar, y
carga de verdad `profesionales-duplicados.js`. Las constantes `TIPO_DEFAULT` / `TIPOS_PANTALLA` se
**leen del archivo**, no se hardcodean en el test.

### Corrida normal — salida cruda completa

```bash
set -a; . ./.env; set +a
node tests/probe_alta_entrenador_operador.mjs
```

```
   línea de base: total=185 dolores=174 otro=11 nulos=0

── Probe · alta de entrenador para el rol operador (profesionales.html / jockeys.html) ──
   profesionales=/home/clio/dev/SGH/profesionales.html
   jockeys      =/home/clio/dev/SGH/jockeys.html
   solicitudes  =/home/clio/dev/SGH/solicitudes.html
   duplicados   =/home/clio/dev/SGH/profesionales-duplicados.js
   dnis_fixture ={"A":"77002887","B":"78002887","C":"79002887","D":"76002887","E":"75002887"}
 ✅ A0) la línea de base no tiene fichas huérfanas (club_id NULL) antes de empezar  → nulos=0
 ✅ A1) ⭐ corriendo el load() REAL como rol `operador`, "+ Nuevo Entrenador" NO queda oculto  → style.display=undefined · el botón sigue en el HTML=true
 ✅ A2) cardHTML() le da Editar al operador (la policy de UPDATE es fn_is_staff, que lo incluye)  → operador_tiene_editar=true · admin=true
 ✅ A2b) …y NO le da Eliminar, porque profesionales_delete es fn_is_super_admin: sería un botón que miente. El super_admin sí lo ve  → operador_tiene_eliminar=false · admin=true
 ✅ A3) saveRecord() de profesionales.html crea la ficha CON club_id del hipódromo activo  → toasts=[{"msg":"Entrenador creado","tipo":"success"}] · fila={"id":"c7bfc8ca-0728-4644-93d6-37f8b06263ca","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","nombre":"Luciana","apellido":"ZZPROBEALTAENT","tipo":"entrenador","documento_tipo":"DNI","documento_nro":"77002887","estado":"activo","activo":true,"patente":"ENT-PROBE"}
 ✅ A3b) y el resto del payload llegó entero, con el DNI normalizado por parseDNI  → {"id":"c7bfc8ca-0728-4644-93d6-37f8b06263ca","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","nombre":"Luciana","apellido":"ZZPROBEALTAENT","tipo":"entrenador","documento_tipo":"DNI","documento_nro":"77002887","estado":"activo","activo":true,"patente":"ENT-PROBE"}
 ✅ A4) ⭐ buscarFichas() de solicitudes.html la encuentra por DNI exacto y la marca EXACTO — el botón "Vincular y aprobar" se habilita  → exactas=[{"id":"c7bfc8ca-0728-4644-93d6-37f8b06263ca","nombre":"Luciana","apellido":"ZZPROBEALTAENT","documento_nro":"77002887","tipo":"entrenador","hipodromo_patente":null}] · sugeridas=0
 ✅ A4b) …y el buscador manual de la bandeja también — circuito completo profesionales.html → solicitudes.html  → sugeridas=[{"id":"c7bfc8ca-0728-4644-93d6-37f8b06263ca","ap":"ZZPROBEALTAENT"}]
 ✅ A5) con el selector en "Entrenador", la ficha queda `entrenador` y aparece en el listado de esta pantalla  → tipo=entrenador · TIPOS_PANTALLA=["entrenador","ambos"]
 ✅ A5b) ⭐ eligiendo "Jockey" desde profesionales.html la ficha queda `jockey` — el tipo sale del selector, no de una constante escondida en el código  → tipo=jockey · toasts=[{"msg":"Entrenador creado","tipo":"success"},{"msg":"Quedó como Jockey: la vas a encontrar en la pantalla de Jockeys.","tipo":"success"}]
 ✅ A6) ⭐ un alta hecha desde jockeys.html eligiendo "Entrenador" queda `entrenador`, no `jockey` — era el defecto del tipo fijo  → fila={"id":"f552b26b-b773-4623-8f7b-fd914c238361","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","nombre":"Desde Jockeys","apellido":"ZZPROBEALTAENT","tipo":"entrenador","documento_tipo":"DNI","documento_nro":"78002887","estado":"activo","activo":true,"patente":null} · toasts=[{"msg":"Jockey creado","tipo":"success"},{"msg":"Quedó como Entrenador: la vas a encontrar en la pantalla de Entrenadores.","tipo":"success"}]
 ✅ A6b) …y avisa que la ficha quedó fuera de este listado, en vez de dejarla "desaparecer"  → [{"msg":"Jockey creado","tipo":"success"},{"msg":"Quedó como Entrenador: la vas a encontrar en la pantalla de Entrenadores.","tipo":"success"}]
 ✅ A6c) coherencia de los dos listados: la ficha `entrenador` está en Entrenadores y NO en Jockeys, y los dos filtran por club  → en_prof=131 · en_jock=47
 ✅ A6d) ahora se puede crear un `ambos`, y aparece en LOS DOS listados  → tipo=ambos
 ✅ A7) openModal() precarga el tipo REAL de la ficha: al editar un `ambos` desde Entrenadores, el selector viene en `ambos` y no lo degrada  → f-tipo="ambos"
 ✅ A7b) …y en un alta nueva el selector arranca en el tipo de la pantalla  → f-tipo="entrenador" · TIPO_DEFAULT=entrenador
 ✅ A8) editar por id una ficha de otro club es un no-op: no la pisa NI la mueve de hipódromo  → {"id":"520f20f4-ff4f-419d-bbbc-edc730fe19c3","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","nombre":"Ajeno","tipo":"entrenador","estado":"activo"}
 ✅ A8b) …y avisa, en vez de cantar "Entrenador actualizado" sobre 0 filas  → [{"msg":"No se pudo actualizar: la ficha no pertenece a este hipódromo.","tipo":"error"}]
 ✅ A9) el toggle rápido de estado tampoco puede tocar una ficha de otro club  → estado={"estado":"activo","activo":true} · toasts=[{"msg":"No se pudo actualizar: la ficha no pertenece a este hipódromo.","tipo":"error"}]
 ✅ A10) el DELETE tampoco: la ficha de otro club sigue existiendo y la pantalla lo dice  → sigue=true · toasts=[{"msg":"No se pudo eliminar: hace falta permiso de super_admin.","tipo":"error"}]
 ✅ A8c) editar una ficha del propio club sigue guardando y no le cambia el club (el acote no es un falso positivo)  → {"id":"c7bfc8ca-0728-4644-93d6-37f8b06263ca","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","nombre":"Luciana","apellido":"ZZPROBEALTAENT","tipo":"entrenador","documento_tipo":"DNI","documento_nro":"77002887","estado":"inactivo","activo":false,"patente":"ENT-PROBE-2"} · toasts=[{"msg":"Entrenador actualizado","tipo":"success"}]
 ✅ A11) el aviso detecta el duplicado REAL: mismo documento en el mismo club  → porDocumento=["c7bfc8ca-0728-4644-93d6-37f8b06263ca"]
 ✅ A11b) …y el mismo apellido lo lista aparte, sin repetir la ficha que ya salió por documento  → porApellido=["ZZPROBEALTAENT/Desde Jockeys","ZZPROBEALTAENT/Jockey Desde Entrenadores","ZZPROBEALTAENT/Los Dos"]
 ✅ A12) el aviso NO cruza clubes: la ficha de "Mi Club Hípico" con el mismo apellido no sale  → ids=["f552b26b-b773-4623-8f7b-fd914c238361","7cbe9748-f25f-4130-a422-3abb85875904","adc12ec7-7587-464b-819c-f809c66b57c5","c7bfc8ca-0728-4644-93d6-37f8b06263ca"]
 ✅ A13) un apellido de menos de 3 letras NO dispara consulta: traería medio padrón y no es una señal  → {"porDocumento":[],"porApellido":[],"consultado":false}
 ✅ A13b) con "ZUBI" trae los dos parecidos reales del padrón, con documentos DISTINTOS a la vista — es un falso positivo legítimo y por eso no puede bloquear  → ["ZUBIARRAIN/14527442/entrenador","ZUBIRIA/39342378/jockey"]
 ✅ A14) `excluirId` saca a la propia ficha: editando, no se avisa a sí misma  → porDocumento=0 · porApellido=3
 ✅ A14b) los comodines de PostgREST van escapados: un apellido con % no matchea de más  → escapado=50\%\_x · normalizado=acuna
 ✅ Z1) teardown por estado: ninguno de los ids creados sigue existiendo, y no queda ninguna fila con el apellido del fixture  → ids_creados=5 · siguen_vivos=[] · por_apellido=[]
 ✅ Z2) teardown por conteo: total, Dolores, otro club y huérfanos vuelven a la línea de base  → base={"total":185,"dolores":174,"otro":11,"nulos":0} · fin={"total":185,"dolores":174,"otro":11,"nulos":0}

30/30 OK
```

### Mutantes — salida cruda completa

```bash
node tests/probe_alta_entrenador_operador.mjs --mutantes
```

```
═══ MUTATION TESTING · 14/14 mutantes ═══
(copias en /tmp/mut-alta-entrenador-48OwPa — el repo no se toca)

✅ M1 muere — BUG ORIGINAL — load() vuelve a esconder "+ Nuevo Entrenador" salvo super_admin  [esperaba matar A1; murieron A1]
✅ M2 muere — BUG ORIGINAL — cardHTML vuelve a dar Editar sólo a super_admin  [esperaba matar A2; murieron A2]
✅ M3 muere — Eliminar se muestra a cualquiera — botón que miente (la policy es super_admin)  [esperaba matar A2b; murieron A2b]
✅ M4 muere — el payload del alta pierde club_id: la ficha nace huérfana e invisible para la bandeja  [esperaba matar A3,A4,A4b; murieron A3,A4,A4b]
✅ M5 muere — BUG ORIGINAL — en profesionales.html el tipo vuelve a estar fijo en el código  [esperaba matar A5b,A6d; murieron A5b,A6d]
✅ M6 muere — BUG ORIGINAL — en jockeys.html el tipo vuelve a estar fijo en 'jockey'  [esperaba matar A6,A6b; murieron A6,A6b]
✅ M7 muere — openModal no precarga el tipo real: editar un 'ambos' lo degrada  [esperaba matar A7; murieron A7]
✅ M8 muere — ISSUE-073 — el UPDATE del modal pierde el acote por club  [esperaba matar A8; murieron A8]
✅ M9 muere — el UPDATE de 0 filas canta "actualizado" igual  [esperaba matar A8b; murieron A8b]
✅ M10 muere — ISSUE-073 — el toggle rápido de estado pierde el acote por club  [esperaba matar A9; murieron A9]
✅ M11 muere — el DELETE pierde el acote por club y borra una ficha de otro hipódromo  [esperaba matar A10; murieron A10]
✅ M12 muere — el helper de duplicados deja de buscar por documento — el duplicado real pasa mudo  [esperaba matar A11; murieron A11]
✅ M13 muere — el helper de duplicados pierde el filtro por club: sugiere fichas de otro hipódromo  [esperaba matar A12; murieron A12]
✅ M14 muere — el helper acepta apellidos de 1-2 letras y trae medio padrón como "parecido"  [esperaba matar A13; murieron A13]

✅ TANDA LIMPIA — 14 probados · 14 muertos
```

### Un mutante sobrevivió en la primera pasada, y por qué importa

La primera corrida dio **13/14**: **M5** (volver a poner `tipo: 'entrenador'` fijo en
`profesionales.html`) **sobrevivía**. El motivo es instructivo: el assert que lo nombraba, A5,
creaba la ficha con el selector puesto en `'entrenador'` — o sea, el mutante producía exactamente
el mismo resultado. **El assert no probaba que el valor viniera del selector.**

Se agregó **A5b**: un alta hecha desde `profesionales.html` eligiendo *Jockey*. Con el tipo fijo esa
ficha saldría `entrenador` y el assert cae. Es además un caso real (crear un jockey estando parado
en Entrenadores). Con eso la tanda queda limpia.

### El probe escribe en producción — verificación de que quedó limpio

Teardown por estado (Z1) y por conteo (Z2), más una verificación independiente por fuera del probe:

```sql
select count(*) total,
       count(*) filter (where apellido like 'ZZPROBE%') fixtures_sueltos,
       count(*) filter (where club_id is null) nulos
from profesionales;
```
```json
[{"total":185,"fixtures_sueltos":0,"nulos":0}]
```

185 filas, las mismas de la línea de base. Cero fixtures sueltos, cero huérfanas.

---

## GATE — la rama está pusheada y SIN MERGEAR

```bash
git commit -F <mensaje>
git push -u origin fix/alta-entrenador-operador
```
```
e5050cd fix: la secretaria puede crear entrenadores (ISSUE-078, 073, 079)
To github.com:mdqclio/SGH.git
 * [new branch]      fix/alta-entrenador-operador -> fix/alta-entrenador-operador
branch 'fix/alta-entrenador-operador' set up to track 'origin/fix/alta-entrenador-operador'.
```

```bash
git ls-remote origin fix/alta-entrenador-operador
git rev-parse HEAD
git diff --stat main...HEAD
git log --oneline -1 main
```
```
e5050cdf04c290cad078324e8c95cc8bd065d525	refs/heads/fix/alta-entrenador-operador
e5050cdf04c290cad078324e8c95cc8bd065d525
=== diffstat vs main ===
 CHANGELOG.md                             |  73 ++++
 CLAUDE.md                                |   2 +
 docs/ISSUES.md                           | 159 ++++++-
 jockeys.html                             | 136 +++++-
 profesionales-duplicados.js              | 108 +++++
 profesionales.html                       | 173 +++++++-
 tests/README.md                          |  42 ++
 tests/probe_alta_entrenador_operador.mjs | 701 +++++++++++++++++++++++++++++++
 8 files changed, 1358 insertions(+), 36 deletions(-)
=== main intacto ===
eface80 docs: ISSUE-075 reescrito (son dos plazos, no dos cálculos) e ISSUE-077 nuevo
```

`main` sigue en `eface80`. **Nada se mergeó, nada se desplegó**: `sigh.com.ar` sirve desde `main`,
así que producción sigue con el botón oculto hasta que digas que sí.

Para verlo:

```bash
git fetch origin
git diff main...origin/fix/alta-entrenador-operador -- profesionales.html jockeys.html
```

---

## Números de resumen

| dato | valor |
|---|---|
| Archivos tocados | 8 (2 pantallas, 1 helper nuevo, 1 probe nuevo, 4 de documentación) |
| Líneas de código de producto | +173 `profesionales.html`, +136 `jockeys.html`, +108 helper nuevo |
| Asserts del probe | **30**, todos verdes |
| Mutantes | **14**, todos muertos (13 en la primera pasada, 14 tras agregar A5b) |
| Issues cerrados en el branch | ISSUE-078 (nuevo), ISSUE-073 (estaba abierto desde el 07/09) |
| Issues abiertos por el branch | ISSUE-079 (índice único en `profesionales`) |
| Fichas de `profesionales` antes y después | 185 / 185 · 174 Dolores · 11 otro club · **0 huérfanas** |
| Duplicados exactos por (club, documento) | **0** — el índice de ISSUE-079 se puede crear sin limpieza |
| Lugares de la app que filtran por `tipo` | 9 |
| Filas con `tipo='ambos'` en la base | **1** (entró por importación; ahora se pueden crear) |

---

## Lo que hice de más, marcado explícito

Tres cosas están fuera de la letra del pedido. Las separo para que se puedan sacar del diff:

1. **`deleteRecord()` con chequeo de 0 filas** en las dos pantallas, y **Eliminar oculto** para
   quien no es `super_admin` en `profesionales.html`. Razón: es el mismo defecto de
   0-filas-silenciosas del punto 3, en la función de al lado, y copiar `jockeys.html` tal cual lo
   habría importado. Commits: es parte de `e5050cd`; las líneas están en `deleteRecord` y en
   `cardHTML`.
2. **El acote por club en `jockeys.html`**, no sólo en `profesionales.html`. Razón: ISSUE-073 nombra
   los dos archivos, y con el selector de tipo `jockeys.html` pasa a ser una vía de alta de
   entrenadores tanto como la otra.
3. **El toast de destino** cuando el tipo elegido saca la ficha del listado actual. Razón: sin eso,
   la consecuencia del selector es que la ficha "desaparece".

---

## Preguntas abiertas

1. **¿Se aplica el índice único de ISSUE-079?** Hay 0 duplicados exactos, así que se crea sin
   limpieza previa. Con él, el alta repetida del mismo DNI da error en la base y no sólo un aviso
   en pantalla. Es DDL: no lo apliqué.
2. **¿Yesi debería ser `operador` o `secretario_carreras`?** Hoy la distinción casi no opera —
   `fn_is_staff()` los trata igual y el gate de `302e684` los trataba igual. Si el rol `operador`
   se pensó como más limitado, conviene decidirlo explícito, porque este cambio le suma capacidades.
3. **Las policies siguen sin club.** `profesionales_update` es `fn_is_staff()` a secas, así que el
   acote de ISSUE-073 es de pantalla, no de base. Cerrar eso es DDL sobre las policies y va con
   ISSUE-017. Lo mismo vale para `propietarios_update`.
4. **¿Se aprueban ya Lo Gioia y Caporale?** Con este branch mergeado, Yesi las resuelve sola. Sin
   mergear, siguen necesitando un `super_admin`. Son las dos pendientes sin ficha.
5. **`jockeys.html` sigue mostrando Eliminar a todos.** Ahora avisa en vez de mentir, pero el botón
   está. ¿Se oculta también ahí, para que las dos pantallas se comporten igual? No lo hice porque
   sería **quitar** un botón que hoy se ve, y eso es decisión de producto.

---

## Aparte — el hook `python: not found`

**No es de SGH.** No hay ningún hook configurado en el repo ni en `~/.claude/settings.json`:

```bash
for f in .claude/settings.json .claude/settings.local.json; do echo "--- $f"; [ -f "$f" ] && cat "$f" || echo "(no existe)"; done
```
```
--- .claude/settings.json
(no existe)
--- .claude/settings.local.json
{ "permissions": { "allow": [ … ] } }        # sólo permisos, ningún hook
```

Viene del **plugin `claude-seo`** (`agricidaniel-claude-seo`, habilitado en
`~/.claude/settings.json` → `enabledPlugins`). Su `hooks.json` decía:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "python \"${CLAUDE_PLUGIN_ROOT}/hooks/validate-schema.py\" \"$FILE_PATH\""
          }
        ]
      }
    ]
  }
}
```

En este Ubuntu no existe el binario `python`, sólo `python3`:

```bash
which python python3; python3 --version
```
```
/usr/bin/python3
Python 3.14.4
```

Y el matcher es `Edit|Write`, así que fallaba en **cada** escritura de archivo, en cualquier
proyecto.

**Es un bug del plugin, no de la configuración.** El propio docstring del script dice cuál era el
comando correcto:

```python
#!/usr/bin/env python3
"""Post-edit schema validation hook for Claude Code.
…
            "command": "python3 ~/.claude/skills/seo/hooks/validate-schema.py \"$FILE_PATH\"",
```

**Arreglado**: se cambió `python` → `python3` en los dos ejemplares del archivo (el de la caché del
plugin y el del marketplace):

```bash
for f in ~/.claude/plugins/cache/agricidaniel-claude-seo/claude-seo/2.0.0/hooks/hooks.json \
         ~/.claude/plugins/marketplaces/agricidaniel-claude-seo/hooks/hooks.json; do
  sed -i 's|"command": "python \\"|"command": "python3 \\"|' "$f"; grep -n "command" "$f"
done
```
```
--- /home/clio/.claude/plugins/cache/agricidaniel-claude-seo/claude-seo/2.0.0/hooks/hooks.json
8:            "type": "command",
9:            "command": "python3 \"${CLAUDE_PLUGIN_ROOT}/hooks/validate-schema.py\" \"$FILE_PATH\""
--- /home/clio/.claude/plugins/marketplaces/agricidaniel-claude-seo/hooks/hooks.json
8:            "type": "command",
9:            "command": "python3 \"${CLAUDE_PLUGIN_ROOT}/hooks/validate-schema.py\" \"$FILE_PATH\""
```

Tres cosas para tener en cuenta:

- **Se revierte si el plugin se actualiza.** El archivo está en la caché del plugin, no en tu
  configuración. Si el arreglo tiene que ser permanente, las opciones son: deshabilitar `claude-seo`
  (`enabledPlugins` en `~/.claude/settings.json`), o reportarlo upstream
  (`github.com/AgriciDaniel/claude-seo`).
- **Ahora el hook efectivamente corre.** Antes fallaba y no hacía nada; ahora valida JSON-LD en cada
  Write/Edit. Es inocuo para SGH: el script sale con `[]` si el archivo no tiene bloques
  `<script type="application/ld+json">`, y en este repo no hay ninguno. Puede devolver exit 2 y
  **bloquear** si alguna vez se escribe un JSON-LD malformado.
- **No toqué nada de la configuración tuya** — sólo el `hooks.json` del plugin, que ya estaba roto.

---

## Verificación de push a `origin`

### La rama de trabajo

```bash
git ls-remote origin fix/alta-entrenador-operador
```
```
e5050cdf04c290cad078324e8c95cc8bd065d525	refs/heads/fix/alta-entrenador-operador
```

Coincide con el `git rev-parse HEAD` de la rama, transcripto en la sección GATE. El código está
en `origin`.

### Este informe

```bash
git push origin reports
git ls-remote origin reports
git rev-parse HEAD
```
```
To github.com:mdqclio/SGH.git
   1dfd1a3..31fabf7  reports -> reports
31fabf717fa122fbbce37c0b5d2c38c5152efe28	refs/heads/reports
31fabf717fa122fbbce37c0b5d2c38c5152efe28
```

Coinciden: el contenido de arriba está en `origin/reports` en el commit
`31fabf717fa122fbbce37c0b5d2c38c5152efe28`. Este bloque de verificación viaja en un segundo
commit — el primero no puede contener el SHA de sí mismo.
