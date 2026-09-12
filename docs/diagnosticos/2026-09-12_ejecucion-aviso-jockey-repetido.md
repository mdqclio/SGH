# Ejecución — aviso de jockey repetido en el turno, 4 pantallas, sin bloqueo

- **Fecha:** 2026-09-12
- **Rama:** `fix/aviso-jockey-repetido` @ `5e0a57ba0f8f36587991549127f2dad128870d93` (sobre `main` `e951884`)
- **GATE:** diff a branch, **sin mergear**. Pusheada a `origin` (verificación al pie).
- **Guards:** `pwd` `/home/clio/dev/SGH` ✔ · `count(spcs)` 205 ✔ · ref `unlhcuanfrtpatoipwve` ✔
- **Relevamiento previo:** `docs/diagnosticos/2026-09-12_jockey-repetido-misma-carrera.md` (§7 es lo que se implementó)
- **Base:** no se tocó. El probe lee; el único `UPDATE` que ejercita (`saveMontas`) va contra un `sb` falso.

## Qué cambió

| Archivo | Cambio |
|---|---|
| `jockey-repetido.js` (nuevo) | `ESTADOS_ACTIVOS_MONTA = ['inscripto','ratificado']`; `conteoJockeysActivos(insc)`, `jockeysRepetidos(insc)`, `badgeJockeyDup(n)`. Cabecera con el porqué del aviso-no-bloqueo y los dos casos (inscripción normal, R8 T5). |
| `inscripciones.html` | Carga el helper. `renderInscripciones()`: `jockeyCount` sobre activos, `tr.jockey-duplicado` + badge en la celda Jockey. `saveRecord()` → `avisarJockeyRepetido(jockey)`: toast `warning` si queda en 2+ caballos del turno. CSS `.toast-warning`, `.badge-jockey-dup`, `tr.jockey-duplicado`. |
| `portal.html` | Carga el helper. `cargarInscripcionesCrudas` pide `jockey_titular_id`. `<div id="minsc-jockey-aviso">` bajo el select, `avisoJockeyRepetidoPortal()` en `onchange` y en `renderSelectsMonta()`; toast `warning` tras anotar. Sólo inscripciones propias del turno (las ajenas no se ven). |
| `ratificacion.html` | Carga el helper. Render: `jockeyCount = conteoJockeysActivos(insc)` (antes: todas las filas). `estadoDeFila(row)` lee el badge de estado; `recalcJockeyColisiones` cuenta por estado. `updateCounter()` llama a `recalcJockeyColisiones` (ratificar / volver / forfait / mal inscripto pasan por ahí). `ratificar()` intacto. |
| `resultados.html` | Carga el helper. `noLargoIds(carreraId)` extraído de `montasFaltantes` (mismo criterio). Montas: `moRecalcJockeyDup()` en render y `onchange`, badge por fila, excluye los "no corrió". `saveMontas()`: guarda igual y, si un jockey queda en 2+ que largaron, toast `warning` con los nombres. CSS. |
| `tests/probe_aviso_jockey_repetido.mjs` (nuevo) | 60 asserts, sólo lectura. |
| `CLAUDE.md`, `CHANGELOG.md`, `docs/MODULOS.md` | Árbol + lista de probes; entrada; párrafo en inscripciones. |

Decisiones de implementación (no de producto):

- **Helper compartido** en vez de cuatro copias: el criterio "sólo activos" tiene que ser el mismo en las
  cuatro pantallas o el aviso dice cosas distintas según dónde se mire. Mismo patrón que `renumerar-chapas.js`.
- **Montas excluye los "no corrió"** con la misma fuente que el gate de oficializar (`noLargoMandiles` /
  `resultado_posiciones.no_largo`): el caso legítimo post-carrera es justamente ése y no tiene que avisar.
- **Portal**: el aviso es parcial por diseño — el entrenador sólo ve lo suyo. El texto lo dice ("Podés anotar
  igual: la monta se define en la ratificación").
- **Toast `warning`** (ámbar) y no `error` (rojo) en las tres pantallas de secretaría: es aviso.

## Diff de código (`git diff main..fix/aviso-jockey-repetido -- jockey-repetido.js inscripciones.html portal.html ratificacion.html resultados.html`)

```diff
diff --git a/inscripciones.html b/inscripciones.html
index 0ed8277..cd0826e 100644
--- a/inscripciones.html
+++ b/inscripciones.html
@@ -77,6 +77,8 @@
     .badge-inscripto  { background: rgba(76,175,130,0.15);  color: var(--success); border: 1px solid rgba(76,175,130,0.3); }
     .badge-ratificado { background: rgba(201,168,76,0.15);  color: var(--accent);  border: 1px solid rgba(201,168,76,0.3); }
     .badge-forfait      { background: rgba(224,82,82,0.1);    color: var(--danger);  border: 1px solid rgba(224,82,82,0.3); }
+    tr.jockey-duplicado td { background: rgba(245,158,11,0.06) !important; }
+    .badge-jockey-dup { display: inline-block; margin-left: 4px; font-size: 10px; font-weight: 700; color: #f59e0b; vertical-align: middle; white-space: nowrap; }
     .badge-mal_inscrito { background: rgba(232,168,76,0.15); color: #e8a84c;        border: 1px solid rgba(232,168,76,0.3); }
     .badge-reabierta    { background: rgba(232,168,76,0.15); color: #e8a84c;        border: 1px solid rgba(232,168,76,0.3); }
     .badge-anulada      { background: rgba(160,160,160,0.15); color: var(--muted); border: 1px solid rgba(160,160,160,0.3); }
@@ -121,6 +123,7 @@
     .toast { padding: 12px 20px; border-radius: 10px; font-size: 14px; font-weight: 500; max-width: 320px; animation: slideIn 0.3s ease; }
     .toast-success { background: #1a4a30; border: 1px solid var(--success); color: var(--text); }
     .toast-error { background: #4a1a1a; border: 1px solid var(--danger); color: var(--text); }
+    .toast-warning { background: #4a3a10; border: 1px solid #f59e0b; color: var(--text); }
     @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
     /* PRINT — estilo Palermo */
     #print-only { display: none; }
@@ -198,6 +201,7 @@
   <script src="premios-utils.js"></script>
   <script src="active-reunion.js"></script>
   <script src="edad-spc.js"></script>
+  <script src="jockey-repetido.js"></script>
 </head>
 <body>
 <div id="auth-overlay"><div class="spinner" style="width:32px;height:32px;border-width:3px;"></div></div>
@@ -649,8 +653,12 @@ function renderInscripciones() {
     const cEl=document.getElementById('inscriptos-count'); cEl.textContent='0 inscriptos'; cEl.style.display='';
     return;
   }
+  // Aviso de jockey repetido en el turno (jockey-repetido.js): sólo cuenta
+  // inscripto + ratificado; no bloquea nada.
+  const jockeyCount = conteoJockeysActivos(inscripciones);
   const rows = inscripciones.map(i => {
     const spc = getSpc(i.spc_id);
+    const jockeyDup = ESTADOS_ACTIVOS_MONTA.includes(i.estado) && !!i.jockey_titular_id && jockeyCount[i.jockey_titular_id] >= 2;
     const cab = getCab(i.caballeriza_id);
     const jkey = getProf(i.jockey_titular_id);
     const jkeySup = getProf(i.jockey_suplente_id);
@@ -667,13 +675,13 @@ function renderInscripciones() {
     const gateraCell = (i.estado==='forfait'||i.estado==='mal_inscrito')
       ? `<span style="color:var(--muted)">—</span>`
       : `<input type="number" min="1" step="1" class="gatera-input" value="${i.numero_partidor??''}" data-prev="${i.numero_partidor??''}" onchange="guardarGatera('${i.id}', this)" style="width:60px;text-align:center" title="N° de gatera (sorteo)">`;
-    return `<tr>
+    return `<tr${jockeyDup ? ' class="jockey-duplicado"' : ''}>
       <td><div class="spc-name">${i.spcs?.nombre||spc?.nombre||i.spc_id}</div></td>
       <td>${gateraCell}</td>
       <td>${certCell}</td>
       <td>${cab?`${cab.nombre}${cab.hipodromo_patente?` (${cab.hipodromo_patente})`:''}`:'—'}</td>
       <td>${entr?`${entr.apellido}, ${entr.nombre}`:'-'}</td>
-      <td>${jkey?`${jkey.apellido}, ${jkey.nombre}`:'-'}</td>
+      <td>${jkey?`${jkey.apellido}, ${jkey.nombre}`:'-'}${jockeyDup ? badgeJockeyDup(jockeyCount[i.jockey_titular_id]) : ''}</td>
       <td>${jkeySup?`${jkeySup.apellido}, ${jkeySup.nombre}`:'—'}</td>
       <td>${(() => { const l=[]; if(i.peon) l.push(`Peón: ${i.peon}`); if(i.capataz) l.push(`Cap: ${i.capataz}`); if(i.sereno) l.push(`Sereno: ${i.sereno}`); return l.length?`<div style="font-size:12px;color:var(--muted);">${l.join('<br>')}</div>`:''; })()}</td>
       <td>${cargadaCell}</td>
@@ -844,6 +852,19 @@ async function saveRecord() {
   toast(id ? 'Inscripción actualizada' : 'SPC inscripto');
   closeModal();
   await loadInscripciones();
+  avisarJockeyRepetido(payload.jockey_titular_id);
+}
+
+// Aviso (no bloqueo) al guardar: el jockey elegido ya está en otro caballo
+// activo de este turno. La tabla ya lo marca con ⚠ dup.; el toast es para que
+// no pase inadvertido si la fila quedó fuera de la vista.
+function avisarJockeyRepetido(jockeyId) {
+  if (!jockeyId) return;
+  const n = conteoJockeysActivos(inscripciones)[jockeyId] || 0;
+  if (n < 2) return;
+  const j = getProf(jockeyId);
+  const nombre = j ? `${j.apellido}, ${j.nombre}` : 'Este jockey';
+  toast(`⚠ ${nombre} queda en ${n} caballos de este turno. Es un aviso: se define en la ratificación.`, 'warning');
 }
 
 async function deleteRecord(id) {
diff --git a/jockey-repetido.js b/jockey-repetido.js
new file mode 100644
index 0000000..adcb620
--- /dev/null
+++ b/jockey-repetido.js
@@ -0,0 +1,48 @@
+/**
+ * Jockey repetido dentro de una misma carrera — AVISO, no bloqueo.
+ *
+ * Pedido de Yesi (12/09/2026): que se vea cuando un jockey ya está cargado en
+ * otro caballo del mismo turno. Es aviso y no bloqueo porque en la inscripción
+ * es normal declarar el mismo jockey en dos o tres caballos (el compromiso de
+ * monta se cierra en la ratificación — Fede 25/08/2026), y porque después de la
+ * carrera el jockey puede quedar en un caballo que no largó mientras se lo carga
+ * en el que sí corrió (R8 T5, Aguirre: NOCHE EN VELA no largó, LA LAGUNERA J
+ * se cargó al día siguiente). Un bloqueo rompería los dos flujos. Relevamiento:
+ * docs/diagnosticos/2026-09-12_jockey-repetido-misma-carrera.md (reports).
+ *
+ * Sólo cuentan las inscripciones ACTIVAS: 'inscripto' y 'ratificado'. Un forfait
+ * o un mal inscripto con el mismo jockey no es colisión — el aviso anterior de
+ * ratificacion.html los contaba, y 7 de los 8 casos históricos eran eso.
+ *
+ * @param {Array} inscripciones  Objetos con { jockey_titular_id, estado } del
+ *                               MISMO turno (el que llama filtra por carrera).
+ * @returns {Object}  Mapa { jockey_titular_id: cantidad } sólo sobre activos.
+ */
+const ESTADOS_ACTIVOS_MONTA = ['inscripto', 'ratificado'];
+
+function conteoJockeysActivos(inscripciones) {
+  const conteo = {};
+  (inscripciones || []).forEach(i => {
+    if (!i || !i.jockey_titular_id) return;
+    if (!ESTADOS_ACTIVOS_MONTA.includes(i.estado)) return;
+    conteo[i.jockey_titular_id] = (conteo[i.jockey_titular_id] || 0) + 1;
+  });
+  return conteo;
+}
+
+/**
+ * Set de jockey_titular_id que aparecen en 2+ inscripciones activas del turno.
+ */
+function jockeysRepetidos(inscripciones) {
+  const conteo = conteoJockeysActivos(inscripciones);
+  return new Set(Object.keys(conteo).filter(id => conteo[id] >= 2));
+}
+
+/**
+ * Badge HTML del aviso. Mismo texto y clase en las cuatro pantallas
+ * (inscripciones, portal, ratificación, Montas).
+ */
+function badgeJockeyDup(cantidad) {
+  const n = cantidad >= 2 ? ` ×${cantidad}` : '';
+  return `<span class="badge-jockey-dup" title="Este jockey ya está cargado en otro caballo de este turno. Es un aviso: no bloquea.">⚠ dup.${n}</span>`;
+}
diff --git a/portal.html b/portal.html
index a5fdcb4..3d2143e 100644
--- a/portal.html
+++ b/portal.html
@@ -135,6 +135,7 @@
     .toast { padding: 12px 20px; border-radius: 10px; font-size: 14px; font-weight: 500; max-width: 320px; animation: slideIn 0.3s ease; }
     .toast-success { background: #1a4a30; border: 1px solid var(--success); color: var(--text); }
     .toast-error { background: #4a1a1a; border: 1px solid var(--danger); color: var(--text); }
+    .toast-warning { background: #4a3a10; border: 1px solid #f59e0b; color: var(--text); }
     @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
     #auth-overlay { position: fixed; inset: 0; background: var(--bg); z-index: 9999; display: flex; align-items: center; justify-content: center; }
 
@@ -246,7 +247,8 @@
           </label>
           <label style="display:block;font-size:12px;color:var(--muted);">
             Jockey <span style="opacity:.7;">(opcional — se puede definir hasta el martes)</span>
-            <select id="minsc-jockey" class="minsc-select"><option value="">Cargando…</option></select>
+            <select id="minsc-jockey" class="minsc-select" onchange="avisoJockeyRepetidoPortal()"><option value="">Cargando…</option></select>
+            <div id="minsc-jockey-aviso" hidden style="margin-top:6px;font-size:12px;color:#f59e0b;line-height:1.5;"></div>
           </label>
           <label style="display:block;font-size:12px;color:var(--muted);">
             Suplente <span style="opacity:.7;">(opcional)</span>
@@ -292,6 +294,10 @@
      reimplementarla acá: una tercera copia de la misma regla es una tercera
      copia que se puede desincronizar. -->
 <script src="edad-spc.js"></script>
+<!-- conteoJockeysActivos(): aviso de jockey repetido en el turno, el mismo
+     helper que inscripciones / ratificación / Montas. Acá sólo puede mirar las
+     inscripciones propias: las ajenas no se ven hasta que sale el listado. -->
+<script src="jockey-repetido.js"></script>
 <script>
 let sb, currentUser, miUsuarioId = null, esEntrenador = false, miProfesionalId = null;
 let misCaballos = [], misInscripciones = [];
@@ -754,7 +760,7 @@ function buscarEnPadron(termino) {
 // caballos propios, así que no hace falta filtrar por spc_id acá.
 async function cargarInscripcionesCrudas() {
   const { data, error } = await sb.from('inscripciones')
-    .select('id,estado,canal,inscripto_por,spc_id,carrera_id,created_at,spcs(nombre),'
+    .select('id,estado,canal,inscripto_por,spc_id,carrera_id,created_at,jockey_titular_id,spcs(nombre),'
           // apertura/cierre_ratificacion: son la fuente de verdad de la ventana de
           // forfait (ver modoRetiro). Sin ellas el front no puede decidir el modo.
           + 'carreras(numero_turno,nombre,estado,apertura_inscripcion,cierre_inscripcion,'
@@ -821,6 +827,26 @@ function renderSelectsMonta() {
     || (padronEntrenadores.some(p => p.id === miProfesionalId) ? miProfesionalId : '');
   selJoc.value = prev.joc || '';
   selSup.value = prev.sup || '';
+  avisoJockeyRepetidoPortal();
+}
+
+// Aviso (no bloqueo): el jockey elegido ya está en otro caballo MÍO, activo, de
+// este turno. Sólo se ven las inscripciones propias, así que es parcial — el
+// aviso completo lo da la secretaría en inscripciones/ratificación.
+function avisoJockeyRepetidoPortal() {
+  const el = document.getElementById('minsc-jockey-aviso');
+  const jockeyId = document.getElementById('minsc-jockey').value || null;
+  if (!el) return;
+  el.hidden = true; el.textContent = '';
+  if (!jockeyId || !carreraSeleccionada) return;
+  const otras = misInscripciones.filter(i =>
+    i.carrera_id === carreraSeleccionada.id
+    && i.jockey_titular_id === jockeyId
+    && ESTADOS_ACTIVOS_MONTA.includes(i.estado));
+  if (!otras.length) return;
+  const nombres = otras.map(i => i.spcs?.nombre || '—').join(', ');
+  el.textContent = `⚠ Ya declaraste este jockey en ${nombres} para este turno. Podés anotar igual: la monta se define en la ratificación.`;
+  el.hidden = false;
 }
 
 // Caballeriza de la ficha del propio entrenador: sólo es un valor inicial,
@@ -1001,6 +1027,13 @@ async function anotar(spcId) {
   await cargarInscripcionesCrudas();
   renderListaCaballosModal();
   loadLlamado();
+  // Con la fila nueva ya en misInscripciones, el aviso cuenta el caballo recién
+  // anotado: si el jockey quedó en 2+ caballos míos del turno, se dice.
+  if (jockeyId) {
+    const n = conteoJockeysActivos(misInscripciones.filter(i => i.carrera_id === carreraSeleccionada?.id))[jockeyId] || 0;
+    if (n >= 2) toast(`⚠ Ese jockey queda en ${n} caballos tuyos de este turno. Es un aviso: la monta se define en la ratificación.`, 'warning');
+  }
+  avisoJockeyRepetidoPortal();
 }
 
 /* ========== MIS INSCRIPCIONES ========== */
diff --git a/ratificacion.html b/ratificacion.html
index 4359249..a53f32b 100644
--- a/ratificacion.html
+++ b/ratificacion.html
@@ -200,6 +200,7 @@
   <script src="premios-utils.js"></script>
   <script src="active-reunion.js"></script>
   <script src="renumerar-chapas.js"></script>
+  <script src="jockey-repetido.js"></script>
 </head>
 <body>
 <div id="auth-overlay"><div class="spinner" style="width:32px;height:32px;border-width:3px;"></div></div>
@@ -615,8 +616,10 @@ function renderAll(carreras, inscripciones) {
     const mal = insc.filter(i=>i.estado==='mal_inscrito').length;
     const activos = rat + pre;
     const carCerrada = isCerrada || car.estado === 'confirmada' || car.estado === 'anulada';
-    const jockeyCount = {};
-    insc.forEach(i => { if (i.jockey_titular_id) jockeyCount[i.jockey_titular_id] = (jockeyCount[i.jockey_titular_id]||0)+1; });
+    // Sólo inscripto + ratificado (jockey-repetido.js): un forfait o mal
+    // inscripto con el mismo jockey no es colisión — antes se contaban y 7 de
+    // los 8 casos históricos del aviso eran eso (relevamiento 12/09/2026).
+    const jockeyCount = conteoJockeysActivos(insc);
     const chapaMap = renumerarChapas(insc);
     const rows = insc.map((i, idx) => {
       const spc = getSpc(i.spc_id);
@@ -630,7 +633,7 @@ function renderAll(carreras, inscripciones) {
         <td class="num-part print-hide">${chapaMap[i.id] || ''}</td>
         <td><div class="spc-name">${spc?.nombre||i.spc_id}</div></td>
         <td style="font-size:12px;color:var(--muted)">${cab?.nombre||'—'}</td>
-        <td class="jockey-cell">${buildJockeySelect(i, carCerrada)}${hasColision?'<span class="badge-jockey-dup">⚠ dup.</span>':''}</td>
+        <td class="jockey-cell">${buildJockeySelect(i, carCerrada)}${hasColision?badgeJockeyDup(jockeyCount[i.jockey_titular_id]):''}</td>
         <td class="col-peso-display">${i.peso_final?`<strong>${i.peso_final} kg</strong>`:i.peso_declarado?`${i.peso_declarado} kg`:'—'}</td>
         <td><input class="peso-input print-hide" type="number" id="peso-${i.id}" value="${i.peso_final||i.peso_declarado||''}" min="40" max="80" step="0.1" placeholder="kg" onblur="updatePeso('${i.id}', this.value)"${carCerrada?' disabled':''}></td>
         <td><span class="badge badge-${i.estado}" id="badge-${i.id}">${i.estado?.replace('_',' ')||'—'}</span></td>
@@ -808,30 +811,36 @@ function updateCounter(inscId) {
   });
   const counter = document.getElementById(`counter-${carreraId}`);
   if (counter) counter.innerHTML = buildCounterHtml(total, rat, pre, fort, mal);
+  // El estado cambió (ratificar / volver / forfait / mal inscripto): el aviso de
+  // jockey repetido sólo cuenta activos, así que se recalcula acá.
+  recalcJockeyColisiones(carreraId);
+}
+
+// Estado de la fila según el badge de estado (es lo que actualizan ratificar /
+// volverInscripto / forfait / mal inscripto sin re-renderizar la sección).
+function estadoDeFila(row) {
+  const b = row.querySelector('.badge');
+  if (!b) return null;
+  const cls = [...b.classList].find(c => c.startsWith('badge-') && c !== 'badge');
+  return cls ? cls.slice('badge-'.length) : null;
 }
 
 function recalcJockeyColisiones(carreraId) {
   const sec = document.getElementById(`csec-${carreraId}`);
   if (!sec) return;
-  const conteo = {};
-  sec.querySelectorAll('.jockey-select').forEach(sel => {
-    if (sel.value) conteo[sel.value] = (conteo[sel.value]||0)+1;
-  });
-  sec.querySelectorAll('.jockey-select').forEach(sel => {
-    const row = sel.closest('tr');
-    const cell = sel.closest('.jockey-cell');
-    if (!row || !cell) return;
-    const hasColision = !!sel.value && conteo[sel.value] >= 2;
+  // Mismo criterio que el render inicial: sólo inscripto + ratificado.
+  const filas = [...sec.querySelectorAll('.jockey-select')].map(sel => ({
+    sel, row: sel.closest('tr'), cell: sel.closest('.jockey-cell'),
+  })).filter(f => f.row && f.cell);
+  const conteo = conteoJockeysActivos(filas.map(f => ({
+    jockey_titular_id: f.sel.value || null, estado: estadoDeFila(f.row),
+  })));
+  filas.forEach(({ sel, row, cell }) => {
+    const hasColision = !!sel.value && (conteo[sel.value] || 0) >= 2;
     row.classList.toggle('jockey-duplicado', hasColision);
-    let badge = cell.querySelector('.badge-jockey-dup');
-    if (hasColision && !badge) {
-      badge = document.createElement('span');
-      badge.className = 'badge-jockey-dup';
-      badge.textContent = '⚠ dup.';
-      cell.appendChild(badge);
-    } else if (!hasColision && badge) {
-      badge.remove();
-    }
+    const badge = cell.querySelector('.badge-jockey-dup');
+    if (badge) badge.remove();
+    if (hasColision) cell.insertAdjacentHTML('beforeend', badgeJockeyDup(conteo[sel.value]));
   });
 }
 
diff --git a/resultados.html b/resultados.html
index 2f2ed30..94fe17e 100644
--- a/resultados.html
+++ b/resultados.html
@@ -62,6 +62,7 @@
     .toast { padding: 12px 20px; border-radius: 10px; font-size: 14px; font-weight: 500; max-width: 340px; animation: slideIn 0.3s ease; }
     .toast-success { background: #1a4a30; border: 1px solid var(--success); color: var(--text); }
     .toast-error   { background: #4a1a1a; border: 1px solid var(--danger);  color: var(--text); }
+    .toast-warning { background: #4a3a10; border: 1px solid #f59e0b;      color: var(--text); }
     @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
 
     /* ── Estados vacíos / loading ── */
@@ -293,6 +294,8 @@
     .pb-input { width:80px; padding:6px 8px; font-size:13px; border-radius:8px; background:var(--input-bg); border:1px solid var(--border); color:var(--text); text-align:right; font-family:'DM Sans',sans-serif; }
     .mo-select { width:100%; padding:6px 8px; font-size:13px; border-radius:8px; background:var(--input-bg); border:1px solid var(--border); color:var(--text); font-family:'DM Sans',sans-serif; }
     .mo-select.mo-vacio { border-color:#e5a55e; background:rgba(229,165,94,0.10); }
+    .badge-jockey-dup { display:inline-block; margin-left:6px; font-size:10px; font-weight:700; color:#f59e0b; vertical-align:middle; white-space:nowrap; }
+    tr.jockey-duplicado td { background: rgba(245,158,11,0.06) !important; }
     .mo-alta { display:flex; gap:8px; align-items:center; padding:10px 14px; border-top:1px solid var(--border); }
     .mo-alta input { flex:1; min-width:0; padding:6px 8px; font-size:13px; border-radius:8px; background:var(--input-bg); border:1px solid var(--border); color:var(--text); font-family:'DM Sans',sans-serif; }
 
@@ -399,6 +402,7 @@
 <script src="partidor-colors.js"></script>
 <script src="chapas.js"></script>
 <script src="renumerar-chapas.js"></script>
+<script src="jockey-repetido.js"></script>
 <script>
 /* ═══════════════════════════════════════════════
    AUTH
@@ -1963,15 +1967,55 @@ function moRenderFilas() {
   const chapaForInsc = renumerarChapas(insc);
   document.getElementById('mo-tbody').innerHTML = insc.map(i => {
     const spc = spcsMap[i.spc_id];
-    return `<tr>
+    return `<tr id="mo-row-${i.id}">
       <td class="pb-td">${chapaForInsc[i.id] ?? '—'}</td>
       <td class="pb-td" style="font-weight:600;">${spc?.nombre || '—'}</td>
       <td class="pb-td">
         <select class="mo-select${i.jockey_titular_id ? '' : ' mo-vacio'}" id="mo-${i.id}"
-                onchange="this.classList.toggle('mo-vacio', !this.value)">${moOpciones(i)}</select>
+                onchange="this.classList.toggle('mo-vacio', !this.value); moRecalcJockeyDup()">${moOpciones(i)}</select><span id="mo-dup-${i.id}"></span>
       </td>
     </tr>`;
   }).join('');
+  moRecalcJockeyDup();
+}
+
+// Ratificados de la carrera que NO largaron, por id de inscripción. Cuando la
+// carrera es la abierta sale del marcador (noLargoMandiles, que a su vez se
+// inicializa desde lo persistido); si no, de resultado_posiciones.
+function noLargoIds(carreraId) {
+  const insc = moInscripciones(carreraId);
+  if (carreraId === currentCarreraId) {
+    const chapaForInsc = renumerarChapas(insc);
+    return new Set(insc.filter(i => noLargoMandiles.has(chapaForInsc[i.id])).map(i => i.id));
+  }
+  const res = resultados[carreraId];
+  const pos = (res && posicionesMap[res.id]) || [];
+  return new Set(pos.filter(p => p.no_largo).map(p => p.inscripcion_id));
+}
+
+// Aviso (no bloqueo) de jockey repetido en Montas, sobre lo que hay en los
+// selects. Los "no corrió" quedan afuera: el caso normal después de la carrera
+// es que el jockey siga cargado en el caballo que no largó mientras se lo
+// carga en el que sí corrió (R8 T5, Aguirre). Ahí no hay nada que avisar.
+function moJockeysRepetidos() {
+  const noLargo = noLargoIds(currentCarreraId);
+  const filas = moInscripciones(currentCarreraId)
+    .filter(i => !noLargo.has(i.id))
+    .map(i => ({ id: i.id, estado: 'ratificado', jockey_titular_id: document.getElementById(`mo-${i.id}`)?.value || null }));
+  return { filas, conteo: conteoJockeysActivos(filas) };
+}
+
+function moRecalcJockeyDup() {
+  const { filas, conteo } = moJockeysRepetidos();
+  const conDup = new Set(filas.filter(f => f.jockey_titular_id && conteo[f.jockey_titular_id] >= 2).map(f => f.id));
+  moInscripciones(currentCarreraId).forEach(i => {
+    const slot = document.getElementById(`mo-dup-${i.id}`);
+    const row  = document.getElementById(`mo-row-${i.id}`);
+    if (!slot || !row) return;
+    const dup = conDup.has(i.id);
+    slot.innerHTML = dup ? badgeJockeyDup(conteo[filas.find(f => f.id === i.id).jockey_titular_id]) : '';
+    row.classList.toggle('jockey-duplicado', dup);
+  });
 }
 
 function openMontas() {
@@ -2066,6 +2110,14 @@ async function saveMontas() {
   }
   if (errors.length) { toast(`Error al guardar ${errors.length} monta(s)`, 'error'); return; }
   toast(`${updates.length} monta(s) guardada(s)`, 'success');
+  // Aviso, no bloqueo: se guardó igual. Si un jockey quedó en 2+ caballos que
+  // largaron, la liquidación va a generar dos líneas de monta para él.
+  const { conteo } = moJockeysRepetidos();
+  const repetidos = Object.keys(conteo).filter(id => conteo[id] >= 2);
+  if (repetidos.length) {
+    const nombres = repetidos.map(id => { const p = profsMap[id]; return p ? `${p.apellido}, ${p.nombre}` : id; }).join('; ');
+    toast(`⚠ Jockey repetido entre caballos que largaron: ${nombres}. Se guardó igual — revisalo antes de oficializar.`, 'warning');
+  }
   document.getElementById('modal-montas').classList.remove('open');
 }
 
@@ -2076,15 +2128,7 @@ async function saveMontas() {
 // Mismo criterio que el armado de perfInserts en oficializar().
 function montasFaltantes(carreraId) {
   const insc = moInscripciones(carreraId);
-  let noLargo;
-  if (carreraId === currentCarreraId) {
-    const chapaForInsc = renumerarChapas(insc);
-    noLargo = new Set(insc.filter(i => noLargoMandiles.has(chapaForInsc[i.id])).map(i => i.id));
-  } else {
-    const res = resultados[carreraId];
-    const pos = (res && posicionesMap[res.id]) || [];
-    noLargo = new Set(pos.filter(p => p.no_largo).map(p => p.inscripcion_id));
-  }
+  const noLargo = noLargoIds(carreraId);
   return insc
     .filter(i => !noLargo.has(i.id) && !i.jockey_titular_id)
     .map(i => spcsMap[i.spc_id]?.nombre || '(sin nombre)');
```

## Probe — `node tests/probe_aviso_jockey_repetido.mjs`

```
✅ H1) forfait + ratificado, mismo jockey → NO repetido
✅ H2) mal_inscrito + ratificado, mismo jockey → NO repetido
✅ H3) inscripto + inscripto, mismo jockey → repetido
✅ H4) ratificado + ratificado, mismo jockey → repetido
✅ H5) inscripto + ratificado, mismo jockey → repetido
✅ H6) dos jockeys distintos → nada
✅ H7) sin jockey no cuenta
✅ H8) conteo ×3
✅ H9) badge lleva ⚠ dup. y la cantidad
✅ R9) T1 sin aviso
✅ R9) T2 avisa: GONZALEZ, LUCAS  — GONZALEZ, LUCAS
✅ R9) T3 sin aviso
✅ R9) T4 sin aviso
✅ R9) T5 avisa: CANTO, TOBIAS  — CANTO, TOBIAS
✅ R9) T6 sin aviso
✅ R9) T7 sin aviso
✅ R9) T8 sin aviso
✅ R9) T9 sin aviso
✅ R9) T10 avisa: AGUIRRE, HUGO  — AGUIRRE, HUGO
✅ R9) T11 avisa: CANTO, TOBIAS  — CANTO, TOBIAS
✅ R9) T2 Gonzalez ×3
✅ R9) T10 Aguirre ×3
✅ R8) R6 T9 PRESA, DANIEL: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T2 LOPEZ, ALEXIS: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T3 GONZALEZ, LUCAS: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T5 DELLI QUADRI, IGNACIO DANIEL: forfait/mal_inscrito + ratificado → ya no avisa  — AGUIRRE, HUGO
✅ R8) R8 T8 PRESA, DANIEL: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T10 TORRES, ANIBAL: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T11 CONTRERAS, JUAN CRUZ: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) T5 AGUIRRE, HUGO: los dos ratificados → avisa en ratificación (correcto)  — AGUIRRE, HUGO
✅ A0) inscripciones.html carga jockey-repetido.js
✅ A1) R9 T2: 3 filas con ⚠ dup. (Gonzalez ×3)  — badges: 3
✅ A2) R9 T2: las filas marcadas son las de Gonzalez
✅ A3) R9 T2: ALHENA (Hahn, único) sin badge
✅ A4) R9 T1 (turno limpio): 0 badges
✅ A5) R8 T2 (Lopez: ratificado + forfait): 0 badges
✅ A6) saveRecord llama avisarJockeyRepetido (toast, no return antes del insert)
✅ A7) toast de aviso al guardar con Gonzalez en T2, tipo warning  — [["⚠ GONZALEZ, LUCAS queda en 3 caballos de este turno. Es un aviso: se define en la ratificación.","warning"]]
✅ B0) portal.html carga jockey-repetido.js y pide jockey_titular_id
✅ B1) jockey ya en 2 caballos míos del turno → aviso visible con los nombres  — ⚠ Ya declaraste este jockey en DEL CAMPEON, TOUCH OF BLUE para este turno. Podés anotar igual: la monta se define en la ratificación.
✅ B2) los otros en forfait → sin aviso
✅ B3) otro turno → sin aviso
✅ B4) sin jockey elegido → sin aviso
✅ B5) el aviso dice que se puede anotar igual (no bloqueo)
✅ C0) ratificacion.html carga jockey-repetido.js
✅ C1) render: jockeyCount = conteoJockeysActivos(insc)
✅ C2) el conteo viejo sobre todas las filas ya no está
✅ C3) recalcJockeyColisiones cuenta por estado de fila
✅ C4) updateCounter recalcula el aviso tras cada cambio de estado
✅ C5) ratificar() sigue sin mirar colisiones (no bloqueo)
✅ C6) estadoDeFila lee badge-ratificado / badge-mal_inscrito
✅ D0) resultados.html carga jockey-repetido.js
✅ D1) R8 T5: NOCHE EN VELA no largó (dato persistido)  — noLargo mandiles: 4
✅ D2) R8 T5: Aguirre en los dos, ratificados
✅ D3) estado actual (Aguirre ×2, NOCHE EN VELA no largó) → moJockeysRepetidos sin repetidos  — {"654dc3ea-5c90-46cd-a579-eb0efa3bd1c0":1,"a66df20c-cd72-4125-a1d7-b32e48fcf037":1,"8f24be30-e951-4287-82bd-2db54d0e32dc":1,"484361c0-abb5-41af-b20e-3090535cb075":1,"2e3428cb-be99-4c91-9b99-13c3b499e147":1,"005caa02-fc91-45b3-9ae6-6f55d989fa2e":1,"0bbe6666-bdf5-446b-8ee2-5279eafdc844":1}
✅ D4) backfill R8 T5: saveMontas emite el UPDATE de LA LAGUNERA J (no bloqueado)  — [{"jockey_titular_id":"a66df20c-cd72-4125-a1d7-b32e48fcf037","id":"4370d235-6dd9-479a-b7af-cd7c4d81c82f"}]
✅ D5) backfill R8 T5: toast de guardado y NINGÚN aviso de repetido (el otro no largó)  — [["1 monta(s) guardada(s)","success"]]
✅ D6) Aguirre en dos que largaron → se guarda igual (UPDATE emitido) + toast warning  — {"updates":[{"jockey_titular_id":"a66df20c-cd72-4125-a1d7-b32e48fcf037","id":"b6ef2dbb-59aa-45c7-8385-386197acb0e8"}],"toasts":[["1 monta(s) guardada(s)","success"],["⚠ Jockey repetido entre caballos que largaron: AGUIRRE, HUGO. Se guardó igual — revisalo antes de oficializar.","warning"]]}
✅ D7) montasFaltantes usa noLargoIds (refactor sin cambio de criterio)
✅ D8) la base no se tocó: LA LAGUNERA J y el tercer caballo siguen como estaban  — [{"id":"4370d235-6dd9-479a-b7af-cd7c4d81c82f","jockey_titular_id":"a66df20c-cd72-4125-a1d7-b32e48fcf037","estado":"ratificado"},{"id":"b6ef2dbb-59aa-45c7-8385-386197acb0e8","jockey_titular_id":"654dc3ea-5c90-46cd-a579-eb0efa3bd1c0","estado":"ratificado"}]

60/60 asserts OK
```

Lo que cubre, en una línea cada bloque: **H** helper sintético (forfait/mal_inscrito no cuentan); **R9** los 4
turnos avisan con el jockey esperado y los otros 7 no; **R8** los 7 casos históricos de forfait+ratificado ya
no avisan, R8 T5 sí (los dos ratificados — correcto en ratificación); **A** `renderInscripciones` real: 3
badges en T2 sobre las filas de Gonzalez, 0 en un turno limpio y 0 en R8 T2; **B** `avisoJockeyRepetidoPortal`
real: visible con nombres, oculto si el otro está en forfait / otro turno / sin jockey; **C** ratificación por
texto + `estadoDeFila`; **D** Montas sobre R8 T5: sin aviso con NOCHE EN VELA no largó, el backfill de LA
LAGUNERA J emite el UPDATE (no bloqueado) sin warning, y con Aguirre en dos que largaron se guarda igual +
warning; D8 relee la base y confirma que no cambió nada.

## Mutantes — archivos de `main` (versión anterior)

```bash
git show main:ratificacion.html > rati_main.html
SRC_RATIFICACION_HTML=rati_main.html node tests/probe_aviso_jockey_repetido.mjs
```

```
file:///home/clio/dev/SGH/tests/probe_aviso_jockey_repetido.mjs:81
  if (i < 0) throw new Error(`no encontré: ${firma}`);
                   ^

Error: no encontré: function estadoDeFila(row) {
```

```bash
git show main:resultados.html > resu_main.html
SRC_RESULTADOS_HTML=resu_main.html node tests/probe_aviso_jockey_repetido.mjs
```

```
file:///home/clio/dev/SGH/tests/probe_aviso_jockey_repetido.mjs:81
  if (i < 0) throw new Error(`no encontré: ${firma}`);
                   ^

Error: no encontré: function noLargoIds(carreraId) {
```

Contra la versión anterior el probe corta en la extracción (las funciones nuevas no existen): rojo duro,
no verde falso. No hay mutante "sutil" que probar: el criterio viejo (contar todas las filas) está
cubierto por H1/H2 y por los 7 casos R8 — con el helper contando todos los estados, esos 9 asserts caen.

## Verificación de push de la rama

```bash
git push -u origin fix/aviso-jockey-repetido
git ls-remote origin fix/aviso-jockey-repetido
git rev-parse HEAD
```

```
5e0a57ba0f8f36587991549127f2dad128870d93	refs/heads/fix/aviso-jockey-repetido
5e0a57ba0f8f36587991549127f2dad128870d93
```

## Pendiente (tuyo)

- OK para mergear `fix/aviso-jockey-repetido` → `main`.
- Sigue abierto del relevamiento: qué es "DOBLE MONTA" en el T1 de la planilla de R9 (dos candidatos para un
  caballo, no lo cubre esto); si Yesi quiere que Montas limpie el jockey del que no largó.

## Verificación de publicación de este informe

Commit del informe: `58c79137c6cda193fca56c580f31098d21cc7c3d`

```
58c79137c6cda193fca56c580f31098d21cc7c3d	refs/heads/reports
58c79137c6cda193fca56c580f31098d21cc7c3d
```

(Este bloque va en un segundo commit; su `ls-remote` queda en el mensaje de commit.)
