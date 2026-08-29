# ISSUE-055 — `reuniones.es_prueba`: plan, diff y SQL (sin aplicar)

| | |
|---|---|
| **Fecha** | 2026-08-29 |
| **SHA base** | `323ad85b831afe6dac228242cd114af8730834bf` (main) |
| **Rama del trabajo** | `feat/reunion-es-prueba` — commit `342956e`, pusheada, **sin mergear** |
| **Estado** | ⛔ **NADA APLICADO**: la migración no corrió, el HTML no está en `main`, el probe no se corrió |

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) AS spcs_count FROM spcs;
[{"spcs_count":181}]

$ get_project_url
{"url":"https://unlhcuanfrtpatoipwve.supabase.co"}
```

Los tres coinciden con el baseline de `CLAUDE.md` (181 al 2026-08-23, ref `unlhcuanfrtpatoipwve`).

---

## 0. Corrección al número del issue

ISSUE-055 dice **36 líneas por $488.000,00**. Medido hoy, lo pagable de la 9999 es **27 líneas por
$396.000,00**. La diferencia no es un error de medición: entre el 28/08 y hoy corrió
`probe_recibo_pie_cobrador.mjs`, que emitió los recibos 9001/9002 y dejó **11 líneas en `pagado`
por $262.000** que antes estaban impagas.

Foto exacta de la 9999 (`liquidacion_detalle`, todos los estados):

```sql
SELECT beneficiario_tipo, estado_linea, (recibo_id IS NULL) AS sin_recibo, count(*) n, sum(monto_neto) tot
FROM liquidacion_detalle WHERE reunion_id='a0000000-0000-0000-0000-000000009999'
GROUP BY 1,2,3 ORDER BY 1,2,3;
```

| beneficiario_tipo | estado_linea | sin_recibo | n | monto_neto |
|---|---|---|---:|---:|
| profesional | impago | true | **27** | **396.000,00** | ← lo que ve Valeria hoy
| profesional | pagado | false | 11 | 262.000,00 |
| profesional | retenido | true | 21 | 604.800,00 |
| propietario | pagado | false | 2 | 700.000,00 |
| club | impago | true | 15 | 65.040,00 | ← `beneficiario_tipo='club'` ya está excluido de Pagos

Y el estado del resto de la base, para contexto (nada más queda impago en todo Dolores):

| reunión | estado | estado_linea | n | total |
|---|---|---|---:|---:|
| R6 | borrador | pagado | 157 | 7.116.984,19 |
| R8 | publicada | pagado | 185 | 15.036.756,66 |
| **9999** | **cancelada** | **impago** | **27** | **396.000,00** |
| 9999 | cancelada | pagado | 13 | 962.000,00 |
| 9999 | cancelada | retenido | 21 | 604.800,00 |

**El diagnóstico del issue no cambia**: la 9999 sigue siendo lo único que ensucia la vista pagable.
Cambia el número. Vale actualizar ISSUE-055 cuando se cierre.

---

## 1. La columna

### ¿Ya existe algo equivalente?

No. `reuniones` tiene 18 columnas y ninguna sirve:

```
id · club_id · hipodromo_id · numero · fecha · tipo · estado · tiempo_clima · observaciones
creado_por · created_at · updated_at · hora_cierre_ratificacion · fechas_inscripciones
fechas_forfaits · fechas_compromiso_montas · sorteo_partidores · numero_publico
```

Los dos candidatos y por qué no alcanzan:

- **`tipo` (`tipo_reunion`)** — valores: `oficial`, `extraoficial`, `especial`, `nocturna`. Las 13
  reuniones de la base son `oficial`. Se podría agregar `ADD VALUE 'prueba'`, pero mezcla dos ejes:
  `tipo` describe **qué clase de evento real** es (nocturna, especial). Un dato de prueba no es una
  clase de evento. Además los ENUM de Postgres no admiten quitar valores (GOTCHA #11): un
  `tipo='prueba'` queda para siempre.
- **`estado` (`estado_reunion`)** — `borrador`, `publicada`, `en_curso`, `finalizada`, `cancelada`,
  `suspendida`, `programada`. Es exactamente lo que la decisión descarta, y con razón: existe
  `suspendida` **además** de `cancelada`, o sea que el modelo ya distingue dos formas de que una
  reunión real no se corra. Ninguna de las dos significa "esto es un fixture".

Conclusión: **columna nueva, no redundante**.

### DDL — `migrations/reuniones_es_prueba.sql`

```sql
BEGIN;

ALTER TABLE public.reuniones
  ADD COLUMN IF NOT EXISTS es_prueba boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.reuniones.es_prueba IS
  'Reunión de datos de prueba (sandbox), no un evento real. Sus líneas se excluyen del circuito de cobro (Pagos) cuando el operador no eligió reunión. NO confundir con estado=''cancelada'': eso es una reunión real suspendida, que sí puede tener plata legítima para pagar.';

CREATE INDEX IF NOT EXISTS reuniones_es_prueba_idx
  ON public.reuniones (club_id) WHERE es_prueba;

UPDATE public.reuniones
   SET es_prueba = true
 WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
   AND numero  = 9999
   AND id      = 'a0000000-0000-0000-0000-000000009999';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.reuniones WHERE es_prueba;
  IF n <> 1 THEN
    RAISE EXCEPTION 'es_prueba: esperaba 1 reunión marcada, encontré %', n;
  END IF;
END $$;

COMMIT;
```

Notas de aplicación:

- El `UPDATE` lleva **triple condición** (club + número + id) a propósito. Cualquiera sola podría
  alcanzar otra fila en el futuro; el `id` fijo la clava.
- El bloque `DO` aborta la transacción si quedara marcada más de una reunión. Es el guard del
  requisito "solo la 9999, ninguna otra".
- `NOT NULL DEFAULT false` no reescribe la tabla en PG ≥ 11 y son 13 filas de todos modos.
- **Efecto colateral esperado**: `trg_audit_reuniones` (AFTER UPDATE) va a dejar una entrada en
  `auditoria` y `trg_reuniones_updated_at` va a mover `reuniones.updated_at` de la 9999. Ninguna
  pantalla depende de ese `updated_at` (el optimistic lock de resultados es sobre
  `resultados.updated_at`, no sobre reuniones).
- Vistas dependientes de `reuniones`: `v_inscriptos_carrera` y `v_programa_reunion`. Ninguna
  referencia `es_prueba` (se crearon antes), así que ni el ADD ni el DROP necesitan `CASCADE`.

---

## 2. Marcar la 9999 — y qué hay en los otros clubes

El `UPDATE` de arriba toca **una sola fila**:

| id | numero | fecha | estado | club |
|---|---:|---|---|---|
| `a0000000-0000-0000-0000-000000009999` | 9999 | 2099-01-01 | cancelada | Hipódromo de Dolores |

### Los otros dos clubes — reportado, **no marcado**

```sql
SELECT c.id, c.nombre, c.activo,
 (SELECT count(*) FROM reuniones r WHERE r.club_id=c.id) reuns,
 (SELECT count(*) FROM carreras ca JOIN reuniones r ON r.id=ca.reunion_id WHERE r.club_id=c.id) carreras,
 (SELECT count(*) FROM liquidacion_detalle ld JOIN reuniones r ON r.id=ld.reunion_id WHERE r.club_id=c.id) ld_lineas
FROM clubs c ORDER BY c.nombre;
```

| club | activo | reuniones | carreras | líneas de liquidación |
|---|---|---:|---:|---:|
| Hipódromo de Dolores | true | 13 | 49 | 493 |
| Jockey Club San Francisco – Hipodromo Oscar C. Boero | true | **0** | 0 | 0 |
| **Mi Club Hípico** | **false** | **1** | **0** | **0** |

**Respuesta: no, no hay ninguna reunión de prueba que convenga marcar en los otros clubes.**

- **San Francisco**: cero reuniones. Nada que marcar.
- **Mi Club Hípico**: club **inactivo** (`activo=false`), con **una** reunión —
  `1d6ee50e-0a9d-4681-8e96-7bdec3a7816f`, número 5, 2026-05-17, `borrador`— que tiene
  **0 carreras, 0 inscripciones y 0 líneas de liquidación**. Es una cáscara: no puede ensuciar
  Pagos porque no tiene plata, y `cobrosBuscar` ya está acotado por `CLUB_ID`, así que ni siquiera
  es alcanzable desde Dolores.

Los datos de prueba que mencionás en Mi Club Hípico **no viven en `reuniones`**, y por eso
`es_prueba` no los toca:

- `Pampa Libre` (`a37acadd-89e9-47ca-8741-1e8c871f196c`) y `Don Facundo`
  (`29fc7bef-7ec1-4f44-81b8-3baaf9de4d79`) están en **`spcs`**, que es una tabla **global sin
  `club_id`** (GOTCHA #13). Cuentan contra el baseline de 181 y ensucian el Stud Book de todos los
  hipódromos, no el circuito de cobro.
- El `(profesional)` que ves en las tarjetas **no es un registro con ese nombre**: es el *fallback*
  de `nombreBenef()` en `liquidaciones.html:845` cuando el `beneficiario_id` no está en el mapa
  `profesionales` cargado. La búsqueda por profesionales con nombre/apellido vacío o con "prueba"
  o "test" en el nombre devolvió **0 filas**. Es un síntoma de mapa incompleto (o de un
  beneficiario de otro club), no un registro basura.

**Recomendación**: no marcar nada más. Los SPC de prueba son un problema distinto (limpieza del
Stud Book, en la línea de `docs/PLAN_DUPLICADOS_SPC.md`) y merecen su propio issue, no un flag de
reunión.

---

## 3. El filtro — dónde va y dónde más aparecen las reuniones

### Dónde va (implementado en la rama)

Dos lugares en `liquidaciones.html`, **no uno**:

1. **`cobrosBuscar()`** — el listado de beneficiarios con deuda. Es el que pedías.
2. **`cobrosDetalle(tipo, id)`** — el detalle que se abre al tocar 🧾 Pagar. **Esto no era
   opcional.** `cobrosDetalle` **no está acotado por reunión en absoluto** (a propósito: se paga
   todo lo adeudado de una). Con el filtro sólo en `cobrosBuscar`, en septiembre pasaría esto: un
   entrenador entra a la lista por sus líneas legítimas de R9, Valeria toca Pagar, y el detalle
   abre con las líneas de la 9999 **mezcladas y ya tildadas** (`checked` por defecto). El recibo
   sale con plata de sandbox adentro. El agujero se mueve un click, no se cierra.

### Los helpers

```javascript
// ISSUE-055 — reuniones sandbox (es_prueba). Sus líneas salen del circuito de cobro.
// NO se filtra por estado='cancelada': en el turf una reunión se suspende de verdad, a veces con
// carreras ya corridas, y esa reunión queda cancelada CON plata legítima para pagar. Esconderla
// sería el bug opuesto al que este filtro viene a cerrar.
let cobReunPrueba = null;   // Set de reunion_id con es_prueba=true; se carga una vez por sesión
async function cobCargarReunPrueba(){
  if (cobReunPrueba) return true;
  const { data, error } = await sb.from('reuniones')
    .select('id').eq('club_id', CLUB_ID).eq('es_prueba', true);
  // Falla CERRADA: sin la lista no se puede saber qué es sandbox, y mostrar de más es justamente
  // el riesgo de doble pago. Se corta el render en vez de listar sin filtrar.
  if (error) { console.error('[cobros/reuniones-prueba]', error); toast(error.message,'error'); return false; }
  cobReunPrueba = new Set((data||[]).map(r=>r.id));
  return true;
}
// Una línea se ve si no es de sandbox, o si el operador eligió la reunión sandbox a mano en el
// selector. Sin rol nuevo ni parámetro de URL: elegirla es el acto explícito.
// NULL-safe por construcción: Set.has(null) es false → una línea sin reunion_id nunca se esconde.
function cobVisible(l, rid){ return (!!rid && cobReunPrueba.has(rid)) || !cobReunPrueba.has(l.reunion_id); }
```

### Por qué **no** un `!inner` de PostgREST

La alternativa obvia era resolverlo en la query:

```javascript
.select('...,reuniones!inner(es_prueba)').eq('reuniones.es_prueba', false)   // ← NO
```

La FK existe (`liquidacion_detalle_reunion_id_fkey`) así que funcionaría, pero **`!inner` descarta
en silencio toda fila con `reunion_id` NULL** — es la misma trampa de ISSUE-038 / GOTCHA #5 con
`.neq()`. Hoy `liquidacion_detalle` tiene **0 de 493 filas** con `reunion_id` NULL, así que no
rompería nada *hoy*; el día que aparezca una línea sin reunión, desaparecería de Pagos sin ruido.
Lo mismo vale para `.not('reunion_id','in',(...))`. El `Set.has()` client-side es NULL-safe por
construcción y el costo es una consulta de 1 fila por sesión.

### El diff completo de `liquidaciones.html` (+35 / −5)

```diff
@@ -543,7 +543,7 @@ async function init() {
-    sb.from('reuniones').select('id,numero,fecha,hipodromos(nombre)').eq('club_id', CLUB_ID).order('fecha', {ascending:false}),
+    sb.from('reuniones').select('id,numero,fecha,es_prueba,hipodromos(nombre)').eq('club_id', CLUB_ID).order('fecha', {ascending:false}),

@@ -554,7 +554,10 @@
-  sel.innerHTML = '<option value="">— Todas —</option>' + (reuns||[]).map(r=>`<option ...>${r.hipodromos?.nombre||''}</option>`).join('');
+  // ISSUE-055 — la reunión sandbox se rotula, no se esconde: sigue elegible a mano (es lo que
+  // mantiene usable el banco de pruebas). El rótulo viaja por textContent a los selects de Pagos
+  // y Resumen, que copian estas mismas opciones.
+  sel.innerHTML = '<option value="">— Todas —</option>' + (reuns||[]).map(r=>`<option ...>${r.hipodromos?.nombre||''}${r.es_prueba?' ⚗ PRUEBA':''}</option>`).join('');

@@ -818,6 +821,25 @@   (justo después de `let cobReunInit = false;`)
+  [los dos helpers de arriba: cobReunPrueba / cobCargarReunPrueba / cobVisible]

@@ -885,6 +907,8 @@ async function cobrosBuscar()
   if (error) { toast(error.message,'error'); document.getElementById('cob-beneficiarios').innerHTML=''; return; }
+  // ISSUE-055 — reuniones sandbox fuera de la vista agregada (ver cobCargarReunPrueba).
+  if (!await cobCargarReunPrueba()) { document.getElementById('cob-beneficiarios').innerHTML=''; return; }

@@ -899,7 +923,8 @@
-  const lineas = (data||[]).filter(l => !inscFiltro || inscFiltro.has(l.inscripcion_id));
+  const lineas = (data||[]).filter(l => (!inscFiltro || inscFiltro.has(l.inscripcion_id))
+                                     && cobVisible(l, rid));

@@ -968,6 +993,11 @@ async function cobrosDetalle(tipo, id)
   cobBenef = {tipo, id, nombre:nombreBenef(tipo,id)};
+  // ISSUE-055 — cobrosDetalle NO está acotado por reunión (a propósito: se paga todo lo adeudado).
+  // Por eso el filtro de sandbox tiene que repetirse acá: si no, un beneficiario que entra a la
+  // lista por una reunión real abre el detalle con las líneas de la 9999 mezcladas y ya tildadas.
+  const ridSel = document.getElementById('cob-reunion')?.value || '';
+  if (!await cobCargarReunPrueba()) return;

@@ -988,8 +1018,8 @@
-  cobLineas = pag||[];
-  const retLineas = ret||[];
+  cobLineas = (pag||[]).filter(l => cobVisible(l, ridSel));
+  const retLineas = (ret||[]).filter(l => cobVisible(l, ridSel));
```

`node --check` sobre el bloque `<script>` extraído: **OK**.

### Dónde MÁS aparecen las reuniones — alcance medido antes de decidir

Barrido de las 32 consultas a `reuniones` en el repo (`grep -rn "from('reuniones')"`):

| Pantalla / lugar | ¿Ve la 9999 hoy? | ¿Riesgo? | Alcance propuesto |
|---|---|---|---|
| **`cobrosBuscar` (Pagos)** | **Sí, sin elegir reunión** | **Doble pago** | ✅ **filtrado** |
| **`cobrosDetalle` (Pagos → 🧾 Pagar)** | **Sí, siempre** | **Doble pago** | ✅ **filtrado** |
| `cob-carrera` (Pagos) | Sólo si elegís la 9999 | ninguno | sin cambio (acotado por `cob-reunion`) |
| `sel-reunion` (tab Liquidaciones, "— Todas —") | Sí | bajo: read-only, sin botón de pago | ⚠️ **sólo rótulo `⚗ PRUEBA`** — ver abajo |
| `res-reunion` (tab Resumen) | Sólo si la elegís | ninguno: `loadResumen` **exige** reunión (`if (!rid) return`) | sin cambio; hereda el rótulo |
| `cobInit()` / `resumenInit()` | copian las opciones de `sel-reunion` | — | heredan el rótulo automáticamente |
| `reuniones.html` (ABM) | Sí | ninguno: es la pantalla donde se administra el sandbox | sin cambio (**debe** verla) |
| `calendario.html` | **No** — filtra por año en curso, la 9999 es 2099 | — | sin cambio |
| `portal.html` | **No** — `.eq('estado','publicada')` y la 9999 es `cancelada` | — | sin cambio |
| `index.html` (contador super_admin) | Sí — dice **13** reuniones en vez de 12 | cosmético | sin cambio (o `.eq('es_prueba',false)` de yapa) |
| `index.html` (contador secretario) | **No** — acotado al año en curso | — | sin cambio |
| `inscripciones` · `ratificacion` · `programa` · `programa-oficial*` · `resultados` · `resoluciones` · `carta-llamados` | Sí, en sus selectores | ninguno: no mueven plata, y son las pantallas donde se arman los fixtures | sin cambio |
| RPC `emitir_recibo` | acepta cualquier línea | el filtro es sólo de UI | ver §7 |

**Recomendación de alcance: sólo Pagos (los dos puntos) + el rótulo en el selector.** No filtrar en
`sel-reunion` ni en el Resumen: son read-only, no emiten nada, y el Resumen es precisamente donde
se verifica que el sandbox quedó consistente después de un probe. Esconder la 9999 ahí sacaría la
única forma de auditarla sin SQL.

El único que dudé es el contador de `index.html` (dice 13). Es cosmético y lo dejé afuera para que
el diff no se desparrame; si querés, es una línea.

---

## 4. Quién la ve igual — cómo sigue usable el sandbox

**Propuesta: elegir la reunión a mano en el selector.** Nada más.

La regla completa es una línea:

```javascript
function cobVisible(l, rid){ return (!!rid && cobReunPrueba.has(rid)) || !cobReunPrueba.has(l.reunion_id); }
```

- Sin reunión elegida (`— Toda reunión —`, que es el default y donde está el riesgo): las líneas de
  sandbox no existen.
- Con la 9999 elegida a mano: vuelven, completas, y el detalle también.
- Con una reunión real elegida: nada cambia (la query ya venía acotada por `rid`).

Por qué esta y no las otras dos:

- **Un rol nuevo** viola "no inventes un sistema de permisos nuevo" y encima es el peor encaje:
  el que prueba a mano es el mismo `secretario_carreras` que cobra. Habría que darle y sacarle el
  rol para probar.
- **Un parámetro de URL** (`?sandbox=1`) es estado invisible: te lo dejás pegado en un bookmark y
  volvés a estar donde empezamos, sin señal en pantalla.
- **Elegir la reunión** ya es un acto explícito y deliberado que la UI registra visiblemente. Y la
  9999 queda rotulada en el desplegable:

  ```
  Reunión 9999 — 01/01/2099 — Hipódromo de Dolores ⚗ PRUEBA
  ```

  El rótulo sale de `es_prueba` en el `<select>` de `init()`, y como `cobInit()` y `resumenInit()`
  copian el `textContent` de esas mismas opciones, aparece en los tres tabs sin código extra.

**El tradeoff, dicho de frente**: esto no es una exclusión dura. Si Valeria elige la 9999 a mano
—y para hacerlo tiene que pasar por encima del `⚗ PRUEBA`— la plata de sandbox vuelve a estar
pagable. Es a propósito: la exclusión dura obliga a un bypass, y todos los bypass que se me ocurren
son peores que el rótulo. Si preferís exclusión dura, el cambio es sacar el primer término de
`cobVisible` y no rompe ningún probe (§5).

---

## 5. Efecto sobre los probes — **ninguno de los cinco se rompe**

Auditados uno por uno, contra el diff real:

| Probe | Qué toca | ¿Rompe? | Por qué |
|---|---|---|---|
| `probe_recibo_pie_cobrador.mjs` | escribe en la 9999 | **No** | Extrae `cobrosEmitir` / `cobrosConfirmarEmision` / `imprimirReciboCobro` / `docBenef` / `rolDeLinea`. **Ninguna de esas toca `cobVisible`.** Y `cobrosBuscar` entra al sandbox como **stub** (`async()=>{}`, línea 125) — nunca corre el código real. Sus fixtures las crea por `sb` directo, sin pasar por la UI. |
| `probe_recuperacion_monta.mjs` | escribe en la 9999 | **No** | Stubea `sel-reunion` con `R9999` y llama al motor `liquidaciones-engine.js`. No importa nada del tab Pagos. |
| `probe_pagos_rol_carrera.mjs` | lee `cobrosBuscar` | **No**, y lo verifiqué con cuidado | Tiene 3 asserts frágiles y los tres sobreviven: **(1)** el regex `/let qy = sb\.from\('liquidacion_detalle'\)\s*\n\s*\.select\('([^']+)'\)/` — no toqué esa línea; **(2)** el bloque `CACHE MAPAS CARRERA INICIO/FIN` — intacto; **(3)** `/let cobCaballerizas = \[\];[\s\S]{0,600}let cobInscCarrera = \{\};/` — **por esto puse los helpers después de `cobReunInit` y no al lado de `cobCaballerizas`**. Medido tras el cambio: la distancia sigue en **367 caracteres** de 600. |
| `probe_cobros_caballeriza.mjs` | extrae un bloque de `cobrosBuscar` | **No** | Corta de `// caballerizas → propietario titular` hasta `const propIdsPorCaballeriza`. Mi inserción cae **antes** de esa marca. |
| `probe_cobros_v11.mjs` | Pagos | fuera de alcance por pedido | ya estaba roto (apunta a R5, que tiene 0 carreras) |

**El único orden que importa**: los probes que leen `reuniones` con `.eq('es_prueba', true)`
—o sea el nuevo— fallan con 400 si la columna no existe. Por eso `probe_reunion_es_prueba.mjs`
arranca chequeando la columna y aborta con mensaje explícito:

```
la columna reuniones.es_prueba no existe o no es legible — aplicá
migrations/reuniones_es_prueba.sql antes de correr este probe.
```

Y lo mismo aplica al HTML: **si se mergea `liquidaciones.html` sin aplicar la migración, el tab
Pagos queda en blanco** (falla cerrada, con toast del error de PostgREST). **La migración va
primero, el merge después.** No al revés.

---

## 6. Rollback — `migrations/rollback_reuniones_es_prueba.sql`

```sql
BEGIN;

-- 1) Desmarcar (rollback blando — suficiente para que vuelva a aparecer en Pagos).
UPDATE public.reuniones SET es_prueba = false WHERE es_prueba;

-- 2) Índice.
DROP INDEX IF EXISTS public.reuniones_es_prueba_idx;

-- 3) Columna. Sólo con el HTML ya revertido.
ALTER TABLE public.reuniones DROP COLUMN IF EXISTS es_prueba;

COMMIT;
```

Tres niveles, de menos a más:

1. **Blando (paso 1 solo)**: desmarca la 9999. El filtro queda vivo pero no esconde nada y la plata
   de sandbox vuelve a Pagos al instante. Es el que se usa si el filtro esconde algo que no debía.
2. **Índice (paso 2)**: cosmético, no cambia comportamiento.
3. **Completo (paso 3)**: **requiere revertir `liquidaciones.html` primero**. Si la columna
   desaparece con el HTML nuevo en prod, `cobCargarReunPrueba` devuelve 400 y el tab Pagos queda en
   blanco. `git revert` del merge, esperar el CDN (§Deploy de CLAUDE.md), después el DROP.

Ninguna vista referencia `es_prueba`, así que el DROP no necesita `CASCADE`.

---

## 7. El probe — `tests/probe_reunion_es_prueba.mjs`

**No corrido**: necesita la columna, que no está aplicada. 231 líneas, patrón real-code del
`tests/README.md` (extracción por firma con balance de llaves + `AsyncFunction` + Supabase real +
DOM stubeado). Corre `cobrosBuscar` y `cobrosDetalle` **de verdad**, no una copia.

Fixtures (snapshot → run → assert → restore en el `finally`):

- **Reunión normal**: R9 (2026-09-20, `publicada`, `es_prueba=false`) — se planta 1 línea impaga de
  $111.111 para un beneficiario que **también** tiene plata en la 9999 (el "mixto").
- **Reunión cancelada de verdad**: R7 (2026-07-19, **`cancelada`**, `es_prueba=false`) — 1 línea
  impaga de $222.222 para un profesional ajeno a la 9999. **Este es el caso que justifica el flag**
  y es el que fallaría si alguien "simplificara" el filtro a `estado != 'cancelada'`.
- **Sandbox**: las 27 líneas impagas que ya tiene la 9999, sin tocar.

Los 14 checks:

| # | Check |
|---|---|
| 0a | exactamente 1 reunión marcada `es_prueba` en toda la base |
| 0b | la marcada es la 9999 del club de Dolores |
| 0c | el circuito de cobro **no** filtra por `estado='cancelada'` (assert de texto sobre el fuente) |
| 4a | el archivo trae `cobVisible` y `cobCargarReunPrueba` (el filtro está conectado) |
| 4b | `cobrosDetalle` también aplica el filtro, no sólo el listado |
| **A** | **el beneficiario que sólo tiene plata en la 9999 NO aparece** |
| A2 | ningún otro beneficiario de la 9999 se cuela |
| **B** | **el beneficiario de la reunión normal SÍ aparece** |
| **C** | **el beneficiario de la reunión CANCELADA SÍ aparece** |
| D | el total del mixto es sólo la plata real, no suma la del sandbox |
| D2 | su tarjeta declara 1 línea pagable, no las del sandbox |
| D3 | su **detalle** no trae ninguna línea de la 9999 tildada |
| **E** | **eligiendo la 9999 a mano, sus beneficiarios vuelven** (el sandbox sigue usable) |
| E2 | y el detalle vuelve a traer las líneas del sandbox |
| E3 | el selector rotula la reunión de prueba con `⚗ PRUEBA` |
| R | restore: no quedaron líneas `TEST ISSUE-055%` en la base |

Correr, **después** de aplicar la migración:

```bash
set -a; . ./.env; set +a
node tests/probe_reunion_es_prueba.mjs
```

---

## 8. Orden de aplicación propuesto

1. `apply_migration` con `migrations/reuniones_es_prueba.sql` (el guard `DO` aborta si marca ≠ 1).
2. Verificar: `SELECT id,numero,fecha,estado,es_prueba FROM reuniones WHERE es_prueba;` → 1 fila.
3. `node tests/probe_reunion_es_prueba.mjs` → 16/16.
4. Merge de `feat/reunion-es-prueba` a `main`, push, verificar md5 contra `sigh.com.ar`.
5. Re-correr `probe_pagos_rol_carrera.mjs` y `probe_cobros_caballeriza.mjs` (regresión de los
   asserts frágiles del §5).
6. Cerrar ISSUE-055 en `docs/ISSUES.md` — **corrigiendo el número**: eran 27 líneas / $396.000, no
   36 / $488.000 (§0).

**Nada de esto está hecho.** La rama está pusheada y sin mergear.

---

## 9. Fuera de alcance — respetado

No se tocó `anular_recibo` (ISSUE-056), ni `emitido_por` (ISSUE-057), ni
`tests/probe_cobros_v11.mjs`, ni se borró la 9999.

---

## 10. Preguntas abiertas

1. **¿Exclusión dura o rótulo?** (§4) Elegí rótulo + visible-si-la-elegís, que es lo más simple que
   funciona y no rompe el sandbox. Si querés que la 9999 no sea pagable **nunca** desde la UI, es
   sacar el primer término de `cobVisible` — pero entonces las pruebas manuales de cobro hay que
   hacerlas en otra reunión, y no hay otra reunión segura.
2. **¿El RPC `emitir_recibo` debería rechazar líneas de reuniones `es_prueba`?** Sería la defensa
   real (el filtro de hoy es sólo de UI), pero **rompería `probe_recibo_pie_cobrador.mjs`**, que
   emite recibos contra la 9999 a propósito. Necesitaría un bypass, que es exactamente lo que §4
   evita. Mi voto: no, salvo que Fede quiera el candado en la base.
3. **El contador de `index.html`** dice 13 reuniones en vez de 12 para super_admin. ¿Lo arreglo o
   lo dejo?
4. **Los SPC de prueba** (`Pampa Libre`, `Don Facundo`) siguen en el Stud Book global y cuentan
   contra el baseline de 181. ¿Issue aparte?
5. **ISSUE-055 dice 36 líneas / $488.000; son 27 / $396.000** (§0). ¿Actualizo el issue en el mismo
   merge o va aparte?
