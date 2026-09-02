# Carta de llamados — selector de reunión y default que no cae en la más vieja

**Fecha:** 2026-09-02
**Rama de trabajo:** `feat/carta-llamados-selector-reunion`
**SHA:** `481b45709278d985ac731f81209baa40fff1bd1d`
**Base:** `main` en `2597ba0`
**Estado:** pusheado, **sin mergear**. Falta OK explícito.
**Antecedente:** [`2026-09-01_carta-llamados-r8-no-visible.md`](2026-09-01_carta-llamados-r8-no-visible.md)

---

## Guards

| Guard | Esperado | Obtenido | |
|---|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | `/home/clio/dev/SGH` | ✅ |
| `SELECT count(*) FROM spcs` | 181 | 181 | ✅ |
| ref del proyecto | `unlhcuanfrtpatoipwve` | `unlhcuanfrtpatoipwve` | ✅ |

```
$ pwd
/home/clio/dev/SGH
```

```sql
SELECT count(*) AS spcs_count FROM spcs;
```
```
[{"spcs_count":181}]
```

---

## Cuatro cosas que aparecieron en el relevamiento y cambiaron el plan

Ninguna bloqueó el trabajo, pero tres de ellas cambiaron el código que terminé escribiendo.
Van primero porque dos corrigen supuestos del pedido y del diagnóstico del 01/09.

### 1. `reports` está 62 commits atrás de `main` — el diagnóstico del 01/09 se hizo sobre esa copia

```
$ git rev-list --count reports..main
62
$ git rev-list --count main..reports
64
```

Los cuatro archivos que importan acá son idénticos en las dos ramas, así que las líneas y las
conclusiones del informe del 01/09 valen:

```
$ for f in carta-llamados.html index.html active-reunion.js reuniones.html; do
    echo -n "$f: "; if git diff --quiet reports main -- "$f"; then echo "IDENTICO reports==main"; else echo "DIFIERE"; fi; done
carta-llamados.html: IDENTICO reports==main
index.html: IDENTICO reports==main
active-reunion.js: IDENTICO reports==main
reuniones.html: IDENTICO reports==main
```

Y `main` es lo que sirve prod:

```
$ curl -s -o /tmp/prod_carta.html -w "http=%{http_code} size=%{size_download} url=%{url_effective}\n" -L https://mdqclio.github.io/SGH/carta-llamados.html
http=200 size=66528 url=https://sigh.com.ar/carta-llamados.html

$ git show main:carta-llamados.html > /tmp/main_carta.html
$ diff /tmp/main_carta.html /tmp/prod_carta.html | wc -l
0
```

(El primer `curl` que corrí no tenía `-L` y hasheaba el cuerpo del 301, no el archivo. El `diff`
sobre el contenido real da 0 líneas: `main` == prod.)

**Pero sí me afectó para leer el resto del repo**, y de ahí sale el punto 2.

### 2. El rótulo `⚗ PRUEBA` de Pagos SÍ existe — mi primer grep estaba mirando la rama vieja

Busqué `⚗` y `es_prueba` estando parado en `reports` y no encontré nada, así que iba a introducir
la convención de cero. Estaba equivocado: en `main` está, y es un **sufijo**, no un reemplazo del
número:

```
$ grep -rn "es_prueba\|⚗" --include=*.html --include=*.js .
liquidaciones.html:635:    sb.from('reuniones').select('id,numero,fecha,es_prueba,hipodromos(nombre)').eq('club_id', CLUB_ID).order('fecha', {ascending:false}),
liquidaciones.html:649:  sel.innerHTML = '<option value="">— Todas —</option>' + (reuns||[]).map(r=>`<option value="${r.id}">Reunión ${r.numero||''} — ${new Date(r.fecha+'T12:00:00').toLocaleDateString('es-AR')} — ${r.hipodromos?.nombre||''}${r.es_prueba?' ⚗ PRUEBA':''}</option>`).join('');
liquidaciones.html:964:// ISSUE-055 — reuniones sandbox (es_prueba). Sus líneas salen del circuito de cobro.
liquidaciones.html:968:let cobReunPrueba = null;   // Set de reunion_id con es_prueba=true; se carga una vez por sesión
liquidaciones.html:972:    .select('id').eq('club_id', CLUB_ID).eq('es_prueba', true);
```

El rótulo de la carta copia ese formato: sufijo ` ⚗ PRUEBA` al final de la opción.

### 3. La sandbox se marca con `reuniones.es_prueba`, no con el número 9999

```sql
SELECT id, numero, numero_publico, fecha, estado, es_prueba FROM reuniones WHERE es_prueba = true ORDER BY fecha;
```
```
[{"id":"a0000000-0000-0000-0000-000000009999","numero":9999,"numero_publico":null,"fecha":"2099-01-01","estado":"cancelada","es_prueba":true}]
```

Es una columna real (`boolean NOT NULL DEFAULT false`, ISSUE-055) y hay una sola fila marcada. El
código usa el flag, no el número mágico: si mañana se crea otra sandbox, entra sola.

### 4. `reuniones.estado` es un ENUM de siete valores, no los tres del default viejo

```sql
SELECT unnest(enum_range(NULL::estado_reunion))::text AS estado_valido;
```
```
[{"estado_valido":"borrador"},{"estado_valido":"publicada"},{"estado_valido":"en_curso"},{"estado_valido":"finalizada"},{"estado_valido":"cancelada"},{"estado_valido":"suspendida"},{"estado_valido":"programada"}]
```

El default viejo miraba tres (`borrador`, `programada`, `publicada`). Quedaban sin considerar
`en_curso` y `suspendida`. **Decisión de producto, tomada por el lado conservador** (CLAUDE.md):

- **`en_curso` entra** en los estados abiertos. Una reunión que se está corriendo es lo más
  actual que hay; no considerarla sería el mismo error de fondo que el bug original.
- **`suspendida` queda afuera.** Puede volver, pero mientras esté suspendida no es "la próxima".
  Si se retoma pasa a `programada` y entra sola, sin tocar código.

Queda como pregunta abierta 1 por si Fede lo ve distinto.

---

## Estado de la base al momento del cambio

```sql
SELECT id, numero, numero_publico, fecha, estado FROM reuniones
WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' ORDER BY fecha DESC;
```
```
[{"id":"a0000000-0000-0000-0000-000000009999","numero":9999,"numero_publico":null,"fecha":"2099-01-01","estado":"cancelada"},
 {"id":"a982b59e-808a-4799-bc95-d50511c9b58e","numero":12,"numero_publico":11,"fecha":"2026-12-27","estado":"programada"},
 {"id":"7678b605-6cd0-4457-9e23-ea8b7d832b3c","numero":11,"numero_publico":10,"fecha":"2026-11-22","estado":"programada"},
 {"id":"4d53f231-3819-4080-a214-cd623d7d4d87","numero":10,"numero_publico":9,"fecha":"2026-10-11","estado":"programada"},
 {"id":"cafa37d6-89f4-45cb-a0d9-835bc27407e9","numero":9,"numero_publico":8,"fecha":"2026-09-20","estado":"publicada"},
 {"id":"7b6e003e-22e2-4629-bf55-f18560b1260f","numero":8,"numero_publico":7,"fecha":"2026-08-16","estado":"finalizada"},
 {"id":"7b83f624-374d-471d-a716-5310b7dbef6e","numero":7,"numero_publico":null,"fecha":"2026-07-19","estado":"cancelada"},
 {"id":"b02ca761-6f44-4720-86aa-a3c3099019ea","numero":6,"numero_publico":6,"fecha":"2026-06-20","estado":"borrador"},
 {"id":"c90b6186-268d-4089-8cc6-71626b627cf8","numero":5,"numero_publico":5,"fecha":"2026-05-17","estado":"finalizada"},
 {"id":"0e1d82c6-90ec-485c-8153-f8c8d2408711","numero":4,"numero_publico":4,"fecha":"2026-04-19","estado":"finalizada"},
 {"id":"daac4e2a-a66a-4189-bc88-67a23db54906","numero":3,"numero_publico":3,"fecha":"2026-03-22","estado":"finalizada"},
 {"id":"decb58b7-2b70-4176-bb67-4e8191a78130","numero":2,"numero_publico":2,"fecha":"2026-02-08","estado":"finalizada"},
 {"id":"cf460086-f458-4f87-b443-3c548efe7481","numero":1,"numero_publico":1,"fecha":"2026-01-18","estado":"finalizada"}]
```

13 reuniones. Con el default viejo la página abría en la de **20/06/2026, borrador** (la más vieja
abierta). Con el nuevo abre en la de **20/09/2026, publicada** (la próxima). R8 —16/08, pública
N° 7, finalizada— entra al selector, que antes no existía.

---

## 1. El selector

`<select id="sel-reunion">` en el topbar, entre el título y los botones de impresión. Se puebla
con la misma query sin filtro de estado que usa `reuniones.html:276`, orden `fecha DESC`.

Rótulo de cada opción — número público si lo tiene, fecha y estado, con el sufijo de Pagos para la
sandbox:

```
N° 11 — 27/12/2026 — programada
N° 7 — 16/8/2026 — finalizada
interna 7 — 19/7/2026 — cancelada          ← numero_publico NULL: cae al número interno
interna 9999 — 1/1/2099 — cancelada ⚗ PRUEBA
```

Las dos reuniones sin `numero_publico` (la 9999 y la cancelada de julio) muestran `interna <n>`.
Sin ese fallback quedarían como `N° null`.

Elegir una opción recarga con `?reunion_id=`, como pediste — sin SPA. Se conserva el `?club=` del
club-switcher, que si no se perdía en el salto y el super_admin volvía a caer en el club de
`localStorage`.

El selector **no** está en el `@media print`: la regla `body > *:not(#print-only) { display: none
!important; }` ya lo tapa, porque el topbar es hijo directo de `<body>`. No hizo falta CSS de
impresión.

## 2. El fallback

```js
const ESTADOS_ABIERTOS = ['borrador', 'programada', 'publicada', 'en_curso'];

function elegirReunionPorDefecto(lista) {
  const activa = ActiveReunion.get();
  if (activa && lista.some(r => r.id === activa)) return activa;
  const reales = lista.filter(r => !r.es_prueba);
  const hoy = new Date().toISOString().slice(0, 10);
  const proximas = reales
    .filter(r => r.fecha >= hoy && ESTADOS_ABIERTOS.includes(r.estado))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (proximas.length) return proximas[0].id;
  const recientes = [...reales].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return recientes.length ? recientes[0].id : null;
}
```

- **(a)** la ACTIVA si existe; si no, la PRÓXIMA abierta con piso `fecha >= hoy` y orden ASC. El
  piso de fecha es lo que faltaba: sin él, "la primera abierta" es la más vieja.
- **(b)** si no hay ninguna próxima, la MÁS RECIENTE de todas, del estado que sea — sin filtro de
  estado, así que una carta finalizada es un default válido.

Dos cosas que no estaban en el pedido y agregué:

- **La sandbox nunca entra por (a-próxima) ni por (b).** Al sandbox se entra a mano, nunca por
  descarte (ISSUE-055). Pero sí vale como activa: si alguien la fijó con 📍 Activar fue una
  decisión explícita y se respeta. La 9999 tiene fecha 2099 y estado `cancelada`, así que hoy
  quedaría afuera igual — pero por el estado, no por una regla. Si mañana alguien la pone en
  `publicada` para probar algo, sin este filtro pasaría a ser el default de todo el mundo.
- **Un `?reunion_id` que no está en la lista se descarta antes del `.single()`.** Pasa con una
  reunión borrada o con un id de otro club después del club-switcher. Antes eso llegaba al
  `.single()` como error y dejaba la pantalla en blanco; ahora cae al default.

## 3. Lo que no se tocó, y la decisión sobre `ActiveReunion`

### Modo lectura: verificado, no rediseñado

`applyEstadoUI()` quedó igual. Los asserts **B1/B2/B3** lo verifican con la reunión llegando desde
el selector: `finalizada` y `publicada` esconden "+ Nuevo Turno" y "Publicar carta"; `borrador`
los devuelve. El banner 🔒 tampoco se tocó.

Vale repetir algo del informe del 01/09 porque es lo que hace que esto alcance: **los tres botones
de impresión nunca estuvieron condicionados por estado**. Imprimir una carta finalizada ya
funcionaba — el único problema era que no había forma de llegar a esa reunión.

### La decisión: el selector NO fija la reunión activa

**Tu intuición es la correcta, y no encontré nada que dependa de lo contrario.** El código ya no
llama `ActiveReunion.set()` en ningún lado; la sigue **leyendo** para el default.

Las dos líneas que se fueron:

```js
if (reunionId) { ActiveReunion.set(reunionId); }                       // línea 478
try { localStorage.setItem('sgh_active_reunion_id', reunionId); } catch(_) {}   // línea 686
```

Por qué no rompe nada — el mapa completo de quién toca la activa:

```
$ grep -rn "ActiveReunion\.\(get\|resolve\|set\|findClosest\)" --include=*.html --include=*.js . | grep -v active-reunion.js
carta-llamados.html:477:let reunionId = params.get('reunion_id') || ActiveReunion.get();
carta-llamados.html:478:if (reunionId) { ActiveReunion.set(reunionId); }
resultados.html:478:  const rid = ActiveReunion.resolve(reuniones);
resultados.html:484:  if (rid) ActiveReunion.set(rid);
resultados_legacy.html:272:  const rid = ActiveReunion.resolve(reuniones);
resultados_legacy.html:282:  if (rid) { ActiveReunion.set(rid); }
liquidaciones.html:488:  const rid = ActiveReunion.resolve(reuns||[]);
liquidaciones.html:496:  if (rid) { ActiveReunion.set(rid); }
reuniones.html:322:  const activeId = ActiveReunion.get();
reuniones.html:471:  ActiveReunion.set(id);
inscripciones.html:390:    const rid = ActiveReunion.resolve(reuniones);
inscripciones.html:407:  if (rid) { ActiveReunion.set(rid); }
ratificacion.html:527:  const rid = ActiveReunion.resolve(reuniones);
ratificacion.html:570:  if (rid) { ActiveReunion.set(rid); }
```

Tres hechos que salen de ahí:

1. **Ningún módulo lee un valor que sólo la carta escribiera.** Los cinco consumidores
   (`resultados`, `resultados_legacy`, `inscripciones`, `ratificacion`, `liquidaciones`) llaman
   `ActiveReunion.resolve(lista)`, que resuelve solo: URL → localStorage validado contra la lista
   → `findClosest()`. Con la clave vacía caen en la reunión más cercana por su cuenta. Ninguno se
   queda sin reunión.
2. **El modo deliberado de fijarla ya existe y no es la carta**: `reuniones.html:471`, detrás del
   botón 📍 Activar. Es una acción con intención; abrir una carta no lo es.
3. **Cada uno de esos módulos fija la activa cuando vos elegís algo adentro** (`inscripciones:407`,
   `ratificacion:570`, `liquidaciones:496`, `resultados:484`). Ahí tiene sentido: elegir una
   reunión en el módulo donde se trabaja es una decisión. Mirar una carta vieja de plantilla no.

El argumento de fondo: sin el selector, abrir la carta te dejaba en la reunión que el sistema ya
consideraba actual, así que el `set()` era casi un no-op. Con el selector, mirar la de agosto para
copiarla pasa varias veces por mes, y cada vez arrastraría a los otros cinco módulos a agosto sin
que nadie lo pidiera. El efecto lateral que documenté el 01/09 pasaba de raro a rutinario.

Los asserts **D1–D7** lo fijan: `irAReunion` no llama `set` (D1), el default tampoco (D2), y el
texto del archivo no tiene ninguna llamada a `ActiveReunion.set(` ni escritura de
`sgh_active_reunion_id` (D5/D6) — ignorando comentarios, porque el comentario que explica la
decisión nombra la función y un grep pelado la contaría como llamada. D7 verifica que la lectura
sigue ahí.

**Contrapartida, para que esté escrita:** después de mirar la carta de R8, ir a Inscripciones te
deja en la reunión próxima, no en R8. Si Fede quisiera trabajar sobre R8 en otro módulo tiene que
activarla desde Reuniones con 📍. Me parece el comportamiento correcto —la carta es una vista de
lectura— pero es un cambio observable y va como pregunta abierta 2.

## 4. El dashboard y los puntos de entrada

Barrido completo, sin excluir nada salvo `docs/`:

```
$ grep -rn "carta-llamados.html" --include=*.html --include=*.js . | grep -v "^./docs/"
reuniones.html:356:        <button class="btn-sm btn-carta" onclick="window.location.href='carta-llamados.html?reunion_id=${r.id}'">📋 Carta llamados</button>
index.html:313:        ['carta-llamados.html',           '📄', 'Carta de llamados'],
index.html:338:        moduleCard('carta-llamados.html',           '📄', 'Carta de llamados',     'Programación de carreras y distribución de premios'),
index.html:366:        ['carta-llamados.html',           '📄', 'Carta de llamados'],
index.html:391:        moduleCard('carta-llamados.html',           '📄', 'Carta de llamados',     'Programación de carreras y distribución de premios'),
calendario.html:187:      return `<a class="reunion-row" href="carta-llamados.html?reunion_id=${r.id}">
portal.html:488:// carreras.estado NO sirve como señal: carta-llamados.html escribe 'abierta'
programa-oficial-color.html:653:  // carta-llamados.html. El piso ganancia_minima sigue aplicandose en repartoDisplay()
programa-oficial.html:444:  // carta-llamados.html. El piso ganancia_minima sigue aplicandose en repartoDisplay()
```

- **`index.html` ×4, sin parámetros.** Son los cuatro que documentaste: dos listas de tiles y dos
  `moduleCard`, por rol. Con el default arreglado quedan bien: caen en la activa o en la próxima,
  y el selector está ahí para el resto. **No los toqué** — cambiarlos a un `?reunion_id` fijo sería
  peor, porque el dashboard no sabe cuál querés.
- **`reuniones.html:356` y `calendario.html:187`** pasan `?reunion_id`. Siguen andando igual, y
  ahora además llegan con el selector puesto en la reunión correcta.
- **Los tres restantes son comentarios**, no links: `portal.html:488` y los dos
  `programa-oficial*.html`. No son puntos de entrada.

**No hay ningún otro punto de entrada roto.** Los asserts **E1/E2/E3** lo dejan verificado en
código: E1 cuenta los 4 links sin parámetros de `index.html` (si alguien agrega un quinto, o saca
uno, el probe avisa).

## El diff

```
$ git diff --stat main..feat/carta-llamados-selector-reunion
 carta-llamados.html                    | 125 +++++++++--
 tests/README.md                        |   1 +
 tests/probe_carta_selector_reunion.mjs | 398 +++++++++++++++++++++++++++++++++
 3 files changed, 501 insertions(+), 23 deletions(-)
```

### `carta-llamados.html`

```diff
diff --git a/carta-llamados.html b/carta-llamados.html
index 7ab66f7..5e9b69d 100644
--- a/carta-llamados.html
+++ b/carta-llamados.html
@@ -23,6 +23,8 @@
     .btn-back { background: none; border: 1px solid var(--border); color: var(--muted); padding: 7px 14px; border-radius: 8px; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 13px; text-decoration: none; display: inline-flex; align-items: center; gap: 5px; transition: all 0.2s; }
     .btn-back:hover { border-color: var(--accent); color: var(--accent); }
     .topbar h1 { font-size: 18px; color: var(--accent); flex: 1; min-width: 200px; }
+    .sel-reunion-top { width: auto; max-width: 320px; padding: 7px 10px; font-size: 12.5px; cursor: pointer; }
+    .sel-reunion-top:hover { border-color: var(--accent); }
     .btn-primary { background: var(--accent); color: #1a1a0a; border: none; padding: 9px 18px; border-radius: 9px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: opacity 0.2s; }
     .btn-primary:hover { opacity: 0.9; }
     .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 9px 18px; border-radius: 9px; font-family: 'DM Sans', sans-serif; font-size: 13px; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
@@ -266,6 +268,8 @@
 <div class="topbar">
   <a href="reuniones.html" class="btn-back">← Reuniones</a>
   <h1 id="topbar-title">Carta de Llamados</h1>
+  <select id="sel-reunion" class="sel-reunion-top" onchange="irAReunion(this.value)"
+          title="Reunión — incluye las pasadas: la carta vieja es la plantilla de la siguiente"></select>
   <button class="btn-outline" onclick="guardarCartaPDF()">💾 Guardar PDF</button>
   <button class="btn-outline" onclick="imprimirCartaColor()">🖨️ Imprimir Color</button>
   <button class="btn-outline" onclick="imprimirCartaBN()">🖨️ Imprimir B/N</button>
@@ -474,8 +478,20 @@ function imprimirCartaBN() {
 }
 
 const params = new URLSearchParams(location.search);
-let reunionId = params.get('reunion_id') || ActiveReunion.get();
-if (reunionId) { ActiveReunion.set(reunionId); }
+// Sólo lo que vino por URL. Cuál reunión se muestra de verdad lo decide load() contra la
+// lista real (elegirReunionPorDefecto): un id guardado hace meses puede ya no existir, o
+// ser de otro club después del club-switcher, y con .single() eso es un error, no un vacío.
+//
+// ACÁ NO SE LLAMA A ActiveReunion.set() — a propósito, y es un cambio de conducta.
+// Antes, abrir cualquier carta fijaba esa reunión como la activa de TODO el sistema
+// (inscripciones, ratificación, resultados, liquidaciones la leen con ActiveReunion.resolve).
+// Con el selector, mirar la carta de agosto para copiarla es una operación de lectura que
+// pasa varias veces por mes: si arrastra la reunión activa, el próximo módulo que se abra
+// aparece parado en agosto sin que nadie lo haya pedido. Ningún módulo depende de que la
+// carta fije la activa —todos resuelven solos y caen en findClosest si no hay nada—, y el
+// modo deliberado de fijarla sigue siendo el botón 📍 Activar de reuniones.html.
+let reunionId = params.get('reunion_id') || null;
+let reuniones = [];
 let reunion=null, carreras=[], categorias=[], hipodromos=[], clubData=null, condPista=null;
 
 // ---- Reordenamiento manual de llamados (docs/CARTA_LLAMADOS_ORDEN.md) ----
@@ -652,25 +668,89 @@ function updPct() {
   el.className = 'total-premios ' + (Math.abs(total-100)<0.01 ? 'ok' : 'bad');
 }
 
+const escH = s => (s === null || s === undefined ? '' : String(s))
+  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
+
+// Estados en los que una reunión todavía va a correrse. El ENUM estado_reunion tiene siete
+// valores; los tres que faltan quedan afuera a propósito: 'finalizada' y 'cancelada' porque ya
+// pasaron, y 'suspendida' porque mientras lo esté no es la próxima (decisión conservadora: si
+// alguna vez se retoma, vuelve a 'programada' y entra sola). Se usa SOLO para elegir el default:
+// el selector lista todas, sin filtro de estado.
+const ESTADOS_ABIERTOS = ['borrador', 'programada', 'publicada', 'en_curso'];
+
+/** Número público si lo tiene, fecha y estado. Sufijo ⚗ PRUEBA igual que el selector de Pagos. */
+function rotuloReunion(r) {
+  const fecha = new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-AR');
+  const num = r.numero_publico != null ? `N° ${r.numero_publico}` : `interna ${r.numero}`;
+  return `${num} — ${fecha} — ${r.estado}${r.es_prueba ? ' ⚗ PRUEBA' : ''}`;
+}
+
+/**
+ * Qué reunión mostrar cuando no vino ninguna por ?reunion_id:
+ *   1. la ACTIVA, si todavía existe en la lista
+ *   2. la PRÓXIMA abierta — fecha >= hoy, la más cercana
+ *   3. la MÁS RECIENTE de todas, del estado que sea
+ *
+ * El default viejo era `.in(estado, abiertos).order(fecha ASC).limit(1)`: sin piso de fecha, la
+ * primera abierta es la más VIEJA, así que la página abría parada en un borrador de junio y
+ * daba a entender que las cartas anteriores se habían borrado.
+ *
+ * La sandbox (es_prueba) queda fuera de los pasos 2 y 3 — al sandbox se entra a mano, nunca por
+ * descarte (ISSUE-055) —, pero sí vale en el paso 1: si alguien la activó desde reuniones.html
+ * fue una decisión explícita y se respeta.
+ */
+function elegirReunionPorDefecto(lista) {
+  const activa = ActiveReunion.get();
+  if (activa && lista.some(r => r.id === activa)) return activa;
+  const reales = lista.filter(r => !r.es_prueba);
+  const hoy = new Date().toISOString().slice(0, 10);
+  const proximas = reales
+    .filter(r => r.fecha >= hoy && ESTADOS_ABIERTOS.includes(r.estado))
+    .sort((a, b) => a.fecha.localeCompare(b.fecha));
+  if (proximas.length) return proximas[0].id;
+  const recientes = [...reales].sort((a, b) => b.fecha.localeCompare(a.fecha));
+  return recientes.length ? recientes[0].id : null;
+}
+
+function renderSelectorReuniones() {
+  const sel = document.getElementById('sel-reunion');
+  if (!sel) return;
+  sel.innerHTML = reuniones
+    .map(r => `<option value="${escH(r.id)}">${escH(rotuloReunion(r))}</option>`)
+    .join('');
+  sel.value = reunionId || '';
+}
+
+/**
+ * Cambiar de reunión = recargar con otro ?reunion_id. Recarga simple a propósito: load() ya
+ * arma todo desde cero y no hay estado en memoria que valga la pena preservar. Se conserva el
+ * ?club= del club-switcher, que si no se perdería en el salto.
+ * NO toca ActiveReunion — ver el comentario largo arriba de `let reunionId`.
+ */
+function irAReunion(id) {
+  if (!id || id === reunionId) return;
+  const qs = new URLSearchParams(location.search);
+  qs.set('reunion_id', id);
+  location.href = `carta-llamados.html?${qs}`;
+}
+
 async function load() {
+  // Una sola query, sin filtro de estado, igual que reuniones.html: de acá salen el selector y
+  // el default, y así los dos ven exactamente la misma lista.
+  const { data: reuns, error: erReuns } = await sb.from('reuniones')
+    .select('id, numero, numero_publico, fecha, estado, es_prueba')
+    .eq('club_id', CLUB_ID)
+    .order('fecha', { ascending: false });
+  if (erReuns) { toast(erReuns.message, 'error'); return; }
+  reuniones = reuns || [];
+
+  // Un id que no está en la lista (reunión borrada, o de otro club tras el club-switcher) se
+  // descarta acá: si llegara al .single() de abajo, sería un error y una pantalla en blanco.
+  if (reunionId && !reuniones.some(r => r.id === reunionId)) reunionId = null;
+  if (!reunionId) reunionId = elegirReunionPorDefecto(reuniones);
+  renderSelectorReuniones();
+
   if (!reunionId) {
-    const { data: activas } = await sb.from('reuniones')
-      .select('id, fecha, estado')
-      .eq('club_id', CLUB_ID)
-      .in('estado', ['borrador', 'programada', 'publicada'])
-      .order('fecha', { ascending: true })
-      .limit(1);
-    let elegida = activas?.[0];
-    if (!elegida) {
-      const { data: ultima } = await sb.from('reuniones')
-        .select('id')
-        .eq('club_id', CLUB_ID)
-        .order('fecha', { ascending: false })
-        .limit(1)
-        .maybeSingle();
-      elegida = ultima;
-    }
-    if (!elegida) {
       document.getElementById('reunion-info').innerHTML = '';
       document.getElementById('list-container').innerHTML = `
         <div class="empty-state">
@@ -680,11 +760,10 @@ async function load() {
           <a href="reuniones.html" class="btn-primary" style="display:inline-block;margin-top:20px;text-decoration:none;padding:10px 22px;">Ir a Reuniones</a>
         </div>`;
       return;
-    }
-    reunionId = elegida.id;
-    history.replaceState(null, '', `?reunion_id=${reunionId}`);
-    try { localStorage.setItem('sgh_active_reunion_id', reunionId); } catch(_) {}
   }
+  const qsUrl = new URLSearchParams(location.search);
+  qsUrl.set('reunion_id', reunionId);
+  history.replaceState(null, '', `?${qsUrl}`);
   const [{ data: r, error: er }, { data: cars }, { data: cats }, { data: hips }, { data: club }] = await Promise.all([
     sb.from('reuniones').select('*, hipodromos(nombre,sigla,localidad)').eq('id', reunionId).single(),
     sb.from('carreras').select('*').eq('reunion_id', reunionId).order('numero_turno'),
```

### `tests/README.md`

```diff
diff --git a/tests/README.md b/tests/README.md
index 4b80956..258b0c1 100644
--- a/tests/README.md
+++ b/tests/README.md
@@ -84,6 +84,7 @@ node tests/probe_cobros_caballeriza.mjs  # Pagos: búsqueda por caballeriza →
 node tests/probe_recibo_rol.mjs         # Pagos: rótulo del rol en el recibo, propietario vs entrenador/jockey (real-code, read-only)
 node tests/probe_pedigree_programa.mjs   # Columna PADRE-MADRE en los 3 programas: vacío sin placeholder, separador no colgado (real-code, 9998 + teardown)
 node tests/probe_apuestas_especiales.mjs # Caja de especiales de la tapa derivada de carrera_apuestas (real-code, sólo lectura)
+node tests/probe_carta_selector_reunion.mjs # Carta de llamados: selector de reunión + default activa/próxima + ActiveReunion intacta (real-code, sólo lectura, --mutantes)
 node tests/probe_cuerpos_oficial.mjs     # Ventaja de llegada en la vista oficial: cotejo de R6 contra la planilla (real-code, sólo lectura)
 node tests/probe_reordenar_turnos.mjs    # RPC reordenar_turnos: permutación + 4 validaciones (→ R9, snapshot→restore)
 node tests/probe_orden_ui.mjs            # Lógica ▲▼ de carta-llamados: payload a la RPC y confirmación (real-code, sin DB)
```

El probe nuevo (`tests/probe_carta_selector_reunion.mjs`, 398 líneas) va entero en la rama; no lo pego acá porque el diff sería el archivo completo.

---

## Probe

`tests/probe_carta_selector_reunion.mjs` — código real, patrón vigente de `tests/README.md`
(extracción por ancla con balance de llaves + `new AsyncFunction` con Supabase real y mini-DOM).

**Sólo lectura contra la base.** No planta fixtures: la parte A consulta y el resto son funciones
puras sobre listas, reales o sintéticas. No hay `restore` porque no hay nada que restaurar, y no
puede dejar residuo si lo cortan a la mitad.

Dos detalles del arnés que valen la pena:

- **La query del selector se extrae del HTML, no se escribe en el probe.** Si alguien repone un
  `.in('estado', …)` en el archivo, A2/A4/A8 mueren; si el probe tuviera su propia copia de la
  query, pasaría en verde probando nada. Es el mismo falso verde del recibo #4.
- **`extractStmt` corta en la primera línea en blanco, no en el primer `;`.** `escH` termina en
  `.replace(/'/g,'&#39;');` y ese `&#39;` tiene un punto y coma adentro: cortar ahí devolvía la
  const truncada y el arnés no compilaba.

### Corrida

```
$ set -a; . ./.env; set +a
$ node tests/probe_carta_selector_reunion.mjs

── Probe · selector de reunión en carta-llamados ──
   html=/home/clio/dev/SGH/carta-llamados.html  ·  hoy=2026-09-02
 ✅ A0) la query del selector no dio error
 ✅ A1) el selector trae TODAS las reuniones del club, sin filtro de estado  → selector=13 · base=13
 ✅ A2) R8 (16/08, finalizada) está en el selector  → 13 opciones
 ✅ A3) la reunión de prueba 9999 está en el selector
 ✅ A4) el rótulo de R8 usa el número PÚBLICO, con fecha y estado  → N° 7 — 16/8/2026 — finalizada
 ✅ A5) la 9999 va rotulada ⚗ PRUEBA, igual que en Pagos  → interna 9999 — 1/1/2099 — cancelada ⚗ PRUEBA
 ✅ A6) las opciones van de la más reciente a la más vieja  → 2099-01-01 > 2026-12-27 > 2026-11-22 > 2026-10-11 > 2026-09-20 > 2026-08-16 > 2026-07-19 > 2026-06-20 > 2026-05-17 > 2026-04-19 > 2026-03-22 > 2026-02-08 > 2026-01-18
 ✅ A7) la opción seleccionada es la reunión mostrada
 ✅ A8) aparecen TODOS los estados que existen en la base, finalizada incluida  → base=borrador,cancelada,finalizada,programada,publicada · selector=borrador,cancelada,finalizada,programada,publicada
 ✅ B1) reunión finalizada → sin "+ Nuevo Turno" ni "Publicar carta"  → {"nuevo":"none","pub":"none"}
 ✅ B2) reunión en borrador → los dos botones vuelven  → {"nuevo":"","pub":""}
 ✅ B3) reunión publicada → tampoco es editable  → {"nuevo":"none","pub":"none"}
 ✅ C1) sin activa, cae en la PRÓXIMA abierta (fecha >= hoy)  → eligió=cafa37d6-89f4-45cb-a0d9-835bc27407e9 · esperada=cafa37d6-89f4-45cb-a0d9-835bc27407e9 (2026-09-20)
 ✅ C1b) y NO en R6 de junio, que es donde caía antes  → eligió=cafa37d6-89f4-45cb-a0d9-835bc27407e9
 ✅ C2) con una activa vigente, gana la activa aunque esté finalizada  → 7b6e003e-22e2-4629-bf55-f18560b1260f
 ✅ C3) una activa que ya no existe se ignora y cae en la próxima  → cafa37d6-89f4-45cb-a0d9-835bc27407e9
 ✅ C4) sin ninguna próxima, cae en la MÁS RECIENTE, del estado que sea  → p2
 ✅ C5) la sandbox no se elige por descarte, ni siendo la única próxima abierta  → p2
 ✅ C6) pero sí se respeta si alguien la activó a mano  → sbx
 ✅ C7) sin reuniones, devuelve null y la página muestra el vacío  → null
 ✅ D1) elegir en el selector NO fija la reunión activa del sistema  → ActiveReunion.set llamado 0 vez/veces
 ✅ D2) el default tampoco la fija: sólo la lee
 ✅ D3) navega a la reunión elegida por ?reunion_id  → carta-llamados.html?reunion_id=7b6e003e-22e2-4629-bf55-f18560b1260f
 ✅ D4) conserva el ?club= del club-switcher al saltar de reunión  → carta-llamados.html?club=abc&reunion_id=7b6e003e-22e2-4629-bf55-f18560b1260f
 ✅ D5) no queda ninguna llamada a ActiveReunion.set() en la página
 ✅ D6) ni una escritura suelta de sgh_active_reunion_id
 ✅ D7) pero sí se sigue LEYENDO la activa para el default
 ✅ E1) el dashboard sigue linkeando sin parámetros — ahora el default se hace cargo  → 4 links
 ✅ E2) reuniones.html y calendario.html pasan ?reunion_id
 ✅ E3) el selector quedó cableado en el topbar

30/30 OK
```

### Mutation testing — 10 mutantes en tandas de 4+3+3

En tandas por el mismo motivo que en `probe_filtro_concepto_pagos.mjs`: cada mutante es una
corrida completa y los 120 s de timeout del harness llegan como SIGKILL (exit 137). El runner
distingue tres estados —muere / SOBREVIVE / ERROR DE ARNÉS— y ancla el rótulo en el `)` para no
confundir `C1` con `C1b` (GOTCHA #82).

```
$ node tests/probe_carta_selector_reunion.mjs --mutantes=M1,M2,M3,M4

═══ MUTATION TESTING · 4/10 mutantes (tanda: M1,M2,M3,M4) ═══
(copias en /tmp/mut-carta-selector-p0Gb9y — el repo no se toca)

✅ M1 muere — el default ignora la reunión activa  [esperaba matar C2,C6; murieron C2,C6]
✅ M2 muere — vuelve el bug: sin piso de fecha, la próxima es la MÁS VIEJA abierta (R6 de junio)  [esperaba matar C1,C1b; murieron C1,C1b]
✅ M3 muere — vuelve el bug: el selector filtra por estado y pierde las finalizadas  [esperaba matar A2,A4,A8; murieron A2,A4,A8]
✅ M4 muere — el selector esconde la reunión de prueba  [esperaba matar A3,A5; murieron A3,A5]

✅ TANDA LIMPIA — 4 probados · 4 muertos


$ node tests/probe_carta_selector_reunion.mjs --mutantes=M5,M6,M7

═══ MUTATION TESTING · 3/10 mutantes (tanda: M5,M6,M7) ═══
(copias en /tmp/mut-carta-selector-MCLru3 — el repo no se toca)

✅ M5 muere — el default puede caer en la sandbox por descarte  [esperaba matar C5; murieron C5]
✅ M6 muere — el rótulo usa el número interno en vez del público  [esperaba matar A4; murieron A4]
✅ M7 muere — elegir en el selector fija la reunión activa del sistema  [esperaba matar D1; murieron D1]

✅ TANDA LIMPIA — 3 probados · 3 muertos


$ node tests/probe_carta_selector_reunion.mjs --mutantes=M8,M9,M10

═══ MUTATION TESTING · 3/10 mutantes (tanda: M8,M9,M10) ═══
(copias en /tmp/mut-carta-selector-zXVozw — el repo no se toca)

✅ M8 muere — applyEstadoUI deja editable una reunión finalizada  [esperaba matar B1; murieron B1]
✅ M9 muere — el selector lista las reuniones más viejas arriba  [esperaba matar A6; murieron A6]
✅ M10 muere — el último recurso devuelve la reunión más VIEJA en vez de la más reciente  [esperaba matar C4; murieron C4]

✅ TANDA LIMPIA — 3 probados · 3 muertos

```

**M2 y M3 son el bug original.** M2 le saca el piso de fecha al filtro (vuelve a elegir la más
vieja abierta) y M3 le repone el `.in('estado', …)` al selector. Los dos mueren, así que si el bug
vuelve por un revert o un merge mal resuelto, el probe lo dice.

---

## Números de resumen

| | |
|---|---|
| Archivos tocados | 3 (`carta-llamados.html`, `tests/README.md`, probe nuevo) |
| Líneas | +501 / −23 |
| Asserts del probe | **30/30 OK** |
| Mutantes | **10/10 muertos** · 0 sobrevivientes · 0 error de arnés |
| Equivalentes declarados | 0 |
| Reuniones en el selector | 13 de 13 (antes: 0 — no había selector) |
| Estados visibles | los 5 que existen en la base, `finalizada` incluida |
| Default hoy | `N° 8 — 20/9/2026 — publicada` (antes: `N° 6 — 20/6/2026 — borrador`) |
| Escrituras a la base | **ninguna** — ni el cambio ni el probe escriben |
| Llamadas a `ActiveReunion.set()` en la carta | 0 (antes: 2) |
| Puntos de entrada rotos | 0 |

---

## Verificación de push

```
$ git push -u origin feat/carta-llamados-selector-reunion
remote: Create a pull request for 'feat/carta-llamados-selector-reunion' on GitHub by visiting:
remote:      https://github.com/mdqclio/SGH/pull/new/feat/carta-llamados-selector-reunion

$ git ls-remote --heads origin feat/carta-llamados-selector-reunion
481b45709278d985ac731f81209baa40fff1bd1d	refs/heads/feat/carta-llamados-selector-reunion

$ git rev-parse HEAD
481b45709278d985ac731f81209baa40fff1bd1d

$ git log -1 --format=%H%n%s
481b45709278d985ac731f81209baa40fff1bd1d
feat: selector de reunión en la carta de llamados + default que no cae en la más vieja
```

El SHA remoto coincide con el HEAD local. **Sin mergear a `main`** — falta tu OK, así que esto
todavía no está en prod.

---

## Preguntas abiertas

1. **`suspendida` en los estados abiertos.** La dejé afuera: mientras una reunión está suspendida
   no es "la próxima". Si Dolores usa `suspendida` para algo que sí debería ser el default, es
   agregar un string a `ESTADOS_ABIERTOS`. Hoy no hay ninguna fila en ese estado, así que no
   cambia nada en la práctica — es una decisión para cuando aparezca.

2. **La contrapartida de no fijar la activa.** Después de mirar la carta de R8, ir a Inscripciones
   te deja en la próxima, no en R8. Para trabajar sobre R8 en otro módulo hay que activarla desde
   Reuniones con 📍. ¿Le sirve así a Fede, o esperaría que el sistema lo "siga"?

3. **El rótulo `interna <n>`.** Es lo que ven las dos reuniones sin `numero_publico` (la cancelada
   de julio y la sandbox). ¿Le dice algo a Fede esa palabra, o preferís otra? El número interno no
   es el que él usa para hablar de una reunión.

4. **`⚗ PRUEBA` en la carta de llamados.** La sandbox ahora aparece en el selector de un documento
   imprimible. Si alguien la elige y le da a Imprimir, sale una carta de una reunión de prueba con
   el membrete del hipódromo. El rótulo avisa en pantalla, pero el PDF no lleva ninguna marca.
   ¿Querés que el impreso lleve una marca de agua o similar, o alcanza con el rótulo?

5. **Backport del selector a `programa-oficial.html` / `programa-oficial-color.html`.** Esas dos
   siguen exigiendo `?reunion_id` y muestran "No hay reunión seleccionada" si entrás sin él —
   mismo problema, otra página. Quedó fuera del alcance de este pedido.

---

## Fuera de alcance (no tocado, como pediste)

- `reuniones.html` y `calendario.html`: intactos.
- El flujo de edición de la carta (alta/edición de turnos, reordenamiento, publicar): intacto.
- La desalineación `usuarios.id` / `auth.users.id`: **no la toqué**. La verificación de
  `auth_user_id` que pediste va en informe aparte y todavía no la hice — queda pendiente y no está
  cubierta por este documento.

---

## Anexo — verificación de push de este informe

Salida cruda de la verificación del commit anterior de este archivo (`7838caa`), registrada acá
como se hace siempre: la verificación de un commit no puede ir adentro de ese mismo commit.

```
$ git push origin reports
$ git ls-remote --heads origin reports
7838caa04e8c197b3214fe4b1c9c65cc08cdea9d	refs/heads/reports

$ git rev-parse HEAD
7838caa04e8c197b3214fe4b1c9c65cc08cdea9d
```

Coinciden. El informe está en `origin/reports` y es legible desde
`raw.githubusercontent.com`.

---

## Merge a `main` y verificación en prod (2026-09-02)

OK dado. Las dos preguntas abiertas 1 y 2 quedaron **cerradas por decisión, sin consultar a Fede**:

- **`suspendida` queda afuera** de `ESTADOS_ABIERTOS`. El default conservador es el correcto: si
  una reunión suspendida se retoma, vuelve a `programada` y entra sola.
- **El cambio de `ActiveReunion` queda.** Consultar no es activar; el modo deliberado de fijar la
  reunión activa sigue siendo el botón 📍 Activar de `reuniones.html`.

Siguen abiertas la 3 (rótulo `interna <n>`), la 4 (impresión de la sandbox sin marca) y la 5
(backport del selector a los programas oficiales).

### Merge

```
$ git merge --no-ff feat/carta-llamados-selector-reunion
Merge made by the 'ort' strategy.
 carta-llamados.html                    | 125 +++++++++--
 tests/README.md                        |   1 +
 tests/probe_carta_selector_reunion.mjs | 398 +++++++++++++++++++++++++++++++++
 3 files changed, 501 insertions(+), 23 deletions(-)
 create mode 100644 tests/probe_carta_selector_reunion.mjs

$ git log --oneline -3
7be6de0 merge: selector de reunión en la carta de llamados (feat/carta-llamados-selector-reunion)
481b457 feat: selector de reunión en la carta de llamados + default que no cae en la más vieja
2597ba0 merge: cierre de ISSUE-065, ISSUE-067 parcial y GOTCHA 88

$ git ls-remote --heads origin main
7be6de018188d90df0531897733aa1b48bd4e284	refs/heads/main

$ git rev-parse HEAD
7be6de018188d90df0531897733aa1b48bd4e284
```

**SHA del merge: `7be6de018188d90df0531897733aa1b48bd4e284`**

### md5 contra `sigh.com.ar`

Con `-L`: sin seguir el redirect se hashea el cuerpo del 301, no el archivo — el error que cometí
en el relevamiento. Los dos primeros intentos dan el md5 VIEJO: el CDN todavía servía la versión
anterior. Es la ventana de propagación de `docs/SERVER.md`, no un deploy fallido.

```
$ for i in $(seq 1 20); do
    curl -s -L -o /tmp/prod2.html "https://sigh.com.ar/carta-llamados.html?v=$RANDOM"
    P=$(md5sum /tmp/prod2.html | cut -d' ' -f1)
    L=$(git show 7be6de018188d90df0531897733aa1b48bd4e284:carta-llamados.html | md5sum | cut -d' ' -f1)
    echo "intento $i  prod=$P  local=$L"
    [ "$P" = "$L" ] && { echo "MATCH"; break; }
    sleep 20
  done
intento 1  prod=de4608bbf58d6f5e9503363b1cd3df6e  local=e8f0421e2705366bc2afeb0627d2282f
intento 2  prod=de4608bbf58d6f5e9503363b1cd3df6e  local=e8f0421e2705366bc2afeb0627d2282f
intento 3  prod=e8f0421e2705366bc2afeb0627d2282f  local=e8f0421e2705366bc2afeb0627d2282f
MATCH
```

`de4608b…` es el archivo de antes del merge; `e8f0421…` es el del commit `7be6de0`. Prod sirve el
merge.

### Probe contra el HTML SERVIDO

No contra el archivo local: `CARTA_HTML` apunta al que bajó `curl`, así que lo que corre son las
funciones extraídas del HTML que Fede va a recibir en el browser.

```
$ set -a; . ./.env; set +a
$ CARTA_HTML=/tmp/prod2.html node tests/probe_carta_selector_reunion.mjs

── Probe · selector de reunión en carta-llamados ──
   html=/tmp/claude-1000/-home-clio-dev-SGH/1fcfe00c-32a0-443f-ad00-f98626904cd0/scratchpad/prod2.html  ·  hoy=2026-09-02
 ✅ A0) la query del selector no dio error
 ✅ A1) el selector trae TODAS las reuniones del club, sin filtro de estado  → selector=13 · base=13
 ✅ A2) R8 (16/08, finalizada) está en el selector  → 13 opciones
 ✅ A3) la reunión de prueba 9999 está en el selector
 ✅ A4) el rótulo de R8 usa el número PÚBLICO, con fecha y estado  → N° 7 — 16/8/2026 — finalizada
 ✅ A5) la 9999 va rotulada ⚗ PRUEBA, igual que en Pagos  → interna 9999 — 1/1/2099 — cancelada ⚗ PRUEBA
 ✅ A6) las opciones van de la más reciente a la más vieja  → 2099-01-01 > 2026-12-27 > 2026-11-22 > 2026-10-11 > 2026-09-20 > 2026-08-16 > 2026-07-19 > 2026-06-20 > 2026-05-17 > 2026-04-19 > 2026-03-22 > 2026-02-08 > 2026-01-18
 ✅ A7) la opción seleccionada es la reunión mostrada
 ✅ A8) aparecen TODOS los estados que existen en la base, finalizada incluida  → base=borrador,cancelada,finalizada,programada,publicada · selector=borrador,cancelada,finalizada,programada,publicada
 ✅ B1) reunión finalizada → sin "+ Nuevo Turno" ni "Publicar carta"  → {"nuevo":"none","pub":"none"}
 ✅ B2) reunión en borrador → los dos botones vuelven  → {"nuevo":"","pub":""}
 ✅ B3) reunión publicada → tampoco es editable  → {"nuevo":"none","pub":"none"}
 ✅ C1) sin activa, cae en la PRÓXIMA abierta (fecha >= hoy)  → eligió=cafa37d6-89f4-45cb-a0d9-835bc27407e9 · esperada=cafa37d6-89f4-45cb-a0d9-835bc27407e9 (2026-09-20)
 ✅ C1b) y NO en R6 de junio, que es donde caía antes  → eligió=cafa37d6-89f4-45cb-a0d9-835bc27407e9
 ✅ C2) con una activa vigente, gana la activa aunque esté finalizada  → 7b6e003e-22e2-4629-bf55-f18560b1260f
 ✅ C3) una activa que ya no existe se ignora y cae en la próxima  → cafa37d6-89f4-45cb-a0d9-835bc27407e9
 ✅ C4) sin ninguna próxima, cae en la MÁS RECIENTE, del estado que sea  → p2
 ✅ C5) la sandbox no se elige por descarte, ni siendo la única próxima abierta  → p2
 ✅ C6) pero sí se respeta si alguien la activó a mano  → sbx
 ✅ C7) sin reuniones, devuelve null y la página muestra el vacío  → null
 ✅ D1) elegir en el selector NO fija la reunión activa del sistema  → ActiveReunion.set llamado 0 vez/veces
 ✅ D2) el default tampoco la fija: sólo la lee
 ✅ D3) navega a la reunión elegida por ?reunion_id  → carta-llamados.html?reunion_id=7b6e003e-22e2-4629-bf55-f18560b1260f
 ✅ D4) conserva el ?club= del club-switcher al saltar de reunión  → carta-llamados.html?club=abc&reunion_id=7b6e003e-22e2-4629-bf55-f18560b1260f
 ✅ D5) no queda ninguna llamada a ActiveReunion.set() en la página
 ✅ D6) ni una escritura suelta de sgh_active_reunion_id
 ✅ D7) pero sí se sigue LEYENDO la activa para el default
 ✅ E1) el dashboard sigue linkeando sin parámetros — ahora el default se hace cargo  → 4 links
 ✅ E2) reuniones.html y calendario.html pasan ?reunion_id
 ✅ E3) el selector quedó cableado en el topbar

30/30 OK
```

**30/30 contra prod.** Mismos asserts que en local, incluido C1 (el default cae en la reunión del
20/09, no en el borrador de junio) y A2/A4 (R8 en el selector, rotulada `N° 7 — 16/8/2026 —
finalizada`).

### Lección al protocolo de CLAUDE.md

El hallazgo 1 de este informe quedó escrito en el protocolo de informes, commit `d67726b`:
**`reports` se publica, `main` se lee.** `reports` nunca se mergea, así que siempre está atrás de
`main`, y un grep desde ahí devuelve cero resultados que parecen cero resultados. El near-miss del
`⚗ PRUEBA` quedó como el ejemplo.

```
$ git ls-remote --heads origin main
d67726be41d17b140b8f14151558b4569b88ffb5	refs/heads/main

$ git rev-parse HEAD
d67726be41d17b140b8f14151558b4569b88ffb5
```
