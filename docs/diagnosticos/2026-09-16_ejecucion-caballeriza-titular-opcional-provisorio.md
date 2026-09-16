# Ejecución — caballeriza sin titular → propietario provisorio automático (plan A, dos commits) — GATE antes del merge

- **Fecha**: 2026-09-16, 19:20–19:45 UTC (16:20–16:45 AR). Reunión: **domingo 20/09**.
- **Plan**: `2026-09-16_plan-caballeriza-titular-opcional-provisorio.md` (`417716e`). OK de Leo: "Dale con A. El primer
  commit = B lo decide. Y el fix de edición va en el mismo cambio."
- **Rama**: `feat/caballeriza-titular-opcional-provisorio` sobre `main` `7887a27`, pusheada:
  - **`bb27e8b`** = **B** + fix de edición (form solo). Mergeable por sí mismo.
  - **`e5c7094`** = **A** (RPC + llamada desde el form + badge/botón + docs).
- **Base**: `rpc_caballeriza_provisorio` **aplicada** (`20260916192822`). Sin gemelas, sin fixtures, `spcs` 210,
  conteos reales sin cambio (295/43 · 271/47 · 270).
- **Estado: NO mergeada. Este archivo es el gate.**
- Guards: `pwd=/home/clio/dev/SGH`, `spcs=210`, ref `unlhcuanfrtpatoipwve`.

## 0. Resumen

| | B (`bb27e8b`) | A (`e5c7094`) |
|---|---|---|
| Titular en el alta | opcional, todo-o-nada (los tres vacíos o los tres) | idem |
| Alta con titular vacío | la caballeriza nace **sin** responsable (el `DO` la agarra después) | **`rpc_caballeriza_provisorio`** → nace con provisorio a su nombre; toast lo dice; si el RPC falla, toast "quedó SIN propietario" |
| Edición sin tocar responsables | **no valida, no toca `caballeriza_responsables`** (snapshot al abrir) | idem |
| Edición cambiando el titular | delete + insert (camino de siempre) | idem; si lo vacían → delete + RPC |
| Titular provisorio prellenado | aviso en el modal (ISSUE-080) | idem |
| Cards | sin cambio | badge `⚠ sin titular` / `◐ provisorio`; botón **Crear provisorio** en las 43 sin titular |
| Probe | 10/10 (UI) · mutantes HTML 5/5 | **22/22** (UI 9 + RPC 10 + restore 2) · mutantes **6 HTML + 9 SQL = 15/15** |

## 1. Diff completo de `caballerizas.html` (`main..e5c7094`)

```diff
diff --git a/caballerizas.html b/caballerizas.html
index beb52d3..f5fa679 100644
--- a/caballerizas.html
+++ b/caballerizas.html
@@ -53,6 +53,9 @@
     .btn-sm { padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; border: none; transition: all 0.2s; }
     .btn-edit { background: rgba(201,168,76,0.15); color: var(--accent); border: 1px solid rgba(201,168,76,0.3); }
     .btn-edit:hover { background: rgba(201,168,76,0.25); }
+    .badge-sin-titular { background: rgba(224,82,82,0.12); color: var(--danger); border: 1px solid rgba(224,82,82,0.35); }
+    .badge-provisorio  { background: rgba(201,168,76,0.12); color: var(--accent); border: 1px solid rgba(201,168,76,0.35); }
+    .btn-provisorio    { background: rgba(201,168,76,0.12); color: var(--accent); border: 1px solid rgba(201,168,76,0.35); }
     .btn-delete { background: rgba(224,82,82,0.1); color: var(--danger); border: 1px solid rgba(224,82,82,0.3); }
     .btn-delete:hover { background: rgba(224,82,82,0.2); }
     .btn-spcs { background: rgba(74,144,226,0.1); color: #74b0f7; border: 1px solid rgba(74,144,226,0.3); }
@@ -209,17 +212,26 @@
             <!-- Fila fija: propietario -->
             <div class="resp-row" id="row-propietario">
               <div class="resp-row-header">
-                <span class="resp-row-label">Propietario *</span>
+                <span class="resp-row-label">Propietario <span style="font-weight:400;color:var(--muted);">(si lo conocés)</span></span>
                 <div id="rp-badge" class="badge-prof" style="display:none">✓ Entrenador con patente</div>
               </div>
+              <!-- Criterio de Fede (15/08/2026): sin titular conocido, la caballeriza se crea igual y el
+                   dueño queda PROVISORIO con el nombre de la caballeriza (rpc_caballeriza_provisorio).
+                   El form exigía apellido+nombre+DNI desde el 11/05 y bloqueaba alta y edición (ISSUE-083). -->
+              <div id="rp-provisorio-aviso" hidden style="font-size:12px;color:#f59e0b;margin-bottom:8px;line-height:1.5;"></div>
               <div class="resp-inputs">
-                <input id="rp-apellido" placeholder="Apellido *">
-                <input id="rp-nombre"   placeholder="Nombre *">
-                <input id="rp-dni"      placeholder="DNI *" inputmode="numeric"
+                <input id="rp-apellido" placeholder="Apellido">
+                <input id="rp-nombre"   placeholder="Nombre">
+                <input id="rp-dni"      placeholder="DNI" inputmode="numeric"
                        onblur="this.value = formatDNI(this.value); checkProfesional(this, document.getElementById('rp-badge'))">
                 <input id="rp-fnac"     type="date" title="Fecha de nacimiento">
                 <input id="rp-localidad" placeholder="Localidad" class="span2">
               </div>
+              <div style="font-size:12px;color:var(--muted);margin-top:6px;line-height:1.5;">
+                Si no conocés al titular, dejá los tres campos vacíos: la caballeriza se crea con un
+                <strong>propietario provisorio</strong> a su nombre, que la secretaría completa después.
+                Si cargás alguno, completá apellido, nombre y DNI.
+              </div>
             </div>
 
             <!-- Co-propietarios dinámicos -->
@@ -244,6 +256,13 @@ async function initAuth(){const{createClient}=supabase;sb=createClient('https://
 function logout(){sb.auth.signOut().then(()=>window.location.replace('login.html'));}
 
 let allData = [];
+// Snapshot (JSON) del bloque de responsables tal como lo prellenó openModal. Si al
+// guardar está igual, NO se toca caballeriza_responsables: el camino viejo hacía
+// delete + insert siempre, y con un titular provisorio (sin DNI) eso lo borraba o
+// creaba otro propietario por el trigger (ISSUE-080). Ver saveRecord.
+let responsablesAlCargar = null;
+// caballeriza_id → { titular: bool, provisorio: bool } para badges y botón "Crear provisorio".
+let titularPorCaballeriza = {};
 
 // Escapa datos tipeados por el usuario antes de interpolarlos en innerHTML (anti-XSS).
 function escapeHtml(s) {
@@ -282,10 +301,48 @@ async function load() {
   const { data, error } = await query;
   if (error) { toast(error.message, 'error'); document.getElementById('list-container').innerHTML = ''; return; }
   allData = data || [];
+  await cargarTitulares();
   updateStats();
   filterRender();
 }
 
+// caballeriza_id → { titular, provisorio }. Una sola query por carga (policy por club).
+// Sirve para el badge de la card y para mostrar "Crear provisorio" sólo donde falta.
+async function cargarTitulares() {
+  const { data, error } = await sb.from('caballeriza_responsables')
+    .select('caballeriza_id, documento_nro, apellido, nombre, propietarios(notas)')
+    .eq('rol', 'propietario').eq('activo', true);
+  if (error) { console.error('[caballeriza_responsables]', error); toast(error.message, 'error'); titularPorCaballeriza = {}; return; }
+  titularPorCaballeriza = {};
+  (data || []).forEach(r => {
+    const prev = titularPorCaballeriza[r.caballeriza_id];
+    const prov = esProvisorio(r);
+    // si hubiera dos titulares activos (no debería), gana el real
+    titularPorCaballeriza[r.caballeriza_id] = { titular: true, provisorio: prev ? (prev.provisorio && prov) : prov };
+  });
+}
+
+// Badge de titular para la card: nada si es real, «provisorio» si es provisorio, «sin titular» si no hay.
+function titularBadge(cabId) {
+  const t = titularPorCaballeriza[cabId];
+  if (!t) return '<span class="badge badge-sin-titular" title="Sin propietario cargado: las inscripciones de esta caballeriza quedan sin propietario para la liquidación">⚠ sin titular</span>';
+  if (t.provisorio) return '<span class="badge badge-provisorio" title="Propietario provisorio con el nombre de la caballeriza (criterio Fede 15/08). La secretaría lo completa cuando aparece el titular real.">◐ provisorio</span>';
+  return '';
+}
+
+// Botón "Crear provisorio" de la card: mismo RPC que el alta sin titular.
+async function crearProvisorio(cabId, nombre) {
+  if (!confirm(`¿Crear un propietario provisorio «${nombre}» para esta caballeriza?
+
+Queda con el nombre de la caballeriza y sin DNI hasta que se cargue el titular real. Las inscripciones que hoy no tienen propietario pasan a él.`)) return;
+  const { data, error } = await sb.rpc('rpc_caballeriza_provisorio', { p_caballeriza_id: cabId });
+  if (error) { console.error('[rpc_caballeriza_provisorio]', error); toast(error.message.replace(/^.*?:\s*/, ''), 'error'); return; }
+  toast(data?.creado === false && !data?.responsable_id
+    ? 'Esa caballeriza ya tiene titular.'
+    : `Provisorio «${nombre}» creado${data?.inscripciones_rederivadas ? ` · ${data.inscripciones_rederivadas} inscripción(es) ahora con propietario` : ''}.`);
+  load();
+}
+
 function updateStats() {
   document.getElementById('cnt-total').textContent     = allData.length;
   document.getElementById('cnt-activas').textContent   = allData.filter(r => r.estado === 'activo').length;
@@ -318,16 +375,19 @@ function cardHTML(r) {
   const detailBlock = r.chaquetilla_url
     ? `<div class="chaq-row"><div class="card-detail">${detailInner}</div><div class="chaq-big-wrap"><img src="${encodeURI(r.chaquetilla_url)}" class="chaq-big" alt="Chaquetilla"></div></div>`
     : `<div class="card-detail">${detailInner}</div>`;
+  const tBadge = titularBadge(r.id);
   return `<div class="card">
     <div class="card-header">
       <div>
         <div class="card-name">${escapeHtml(r.nombre)}${r.hipodromo_patente ? ` (${escapeHtml(r.hipodromo_patente)})` : ''}</div>
+        ${tBadge ? `<div style="margin-top:6px;">${tBadge}</div>` : ''}
       </div>
       ${badge}
     </div>
     ${detailBlock}
     <div class="card-actions">
       <button class="btn-sm btn-edit" onclick='openModal(${JSON.stringify(r)})'>✏️ Editar</button>
+      ${!titularPorCaballeriza[r.id] ? `<button class="btn-sm btn-provisorio" onclick="crearProvisorio('${r.id}','${escapeHtml(r.nombre||'').replace(/'/g,"&#39;")}')">◐ Crear provisorio</button>` : ''}
       <button class="btn-sm btn-delete" onclick="deleteRecord('${r.id}','${escapeHtml(r.nombre||'').replace(/'/g,"&#39;")}')">🗑️ Eliminar</button>
     </div>
   </div>`;
@@ -420,6 +480,16 @@ async function checkProfesional(dniInput, badgeEl) {
   if (data) badgeEl.style.display = 'inline-flex';
 }
 
+// Un titular es provisorio si su propietarios.notas empieza con 'provisorio' (marcas
+// 'provisorio R8 15/08', 'provisorio R9 11/09', 'provisorio alta DD/MM/YYYY'). Las
+// 'ex provisorio … completado' NO cuentan. Sin propietario embebido, se infiere por
+// "sin DNI y sin apellido" (la forma de los 47 del backfill).
+function esProvisorio(resp) {
+  const notas = resp?.propietarios?.notas;
+  if (typeof notas === 'string') return /^provisorio/i.test(notas.trim());
+  return !resp?.documento_nro && !resp?.apellido;
+}
+
 function getResponsableData() {
   const rows = [{
     rol:              'propietario',
@@ -443,10 +513,18 @@ function getResponsableData() {
   return rows;
 }
 
+// El propietario es OPCIONAL (criterio Fede 15/08): los tres vacíos = "no lo conozco"
+// → provisorio automático. Si viene alguno, vienen los tres: el DNI es la llave con la
+// que el trigger deriva `propietarios`.
+function propietarioVacio(rows) {
+  const p = rows[0] || {};
+  return !p.apellido && !p.nombre && !p.documento_nro;
+}
+
 function validateResponsables(rows) {
   const prop = rows[0];
-  if (!prop.apellido || !prop.nombre || !prop.documento_nro) {
-    return 'El propietario requiere apellido, nombre y DNI.';
+  if (!propietarioVacio(rows) && (!prop.apellido || !prop.nombre || !prop.documento_nro)) {
+    return 'Si cargás el propietario, completá apellido, nombre y DNI. Si todavía no lo sabés, dejá los tres vacíos: se crea un propietario provisorio con el nombre de la caballeriza.';
   }
   for (let i = 1; i < rows.length; i++) {
     const r = rows[i];
@@ -539,17 +617,26 @@ async function openModal(rec = null) {
   clearPropietario();
   clearCopropietarios();
 
+  const avisoProv = document.getElementById('rp-provisorio-aviso');
+  avisoProv.hidden = true; avisoProv.textContent = '';
+
   if (rec?.id) {
-    const { data: respons } = await sb
+    // propietarios(notas): para saber si el titular es provisorio (notas 'provisorio …').
+    const { data: respons, error: errResp } = await sb
       .from('caballeriza_responsables')
-      .select('*')
+      .select('*, propietarios(notas)')
       .eq('caballeriza_id', rec.id)
       .order('rol', { ascending: false })
       .order('id',  { ascending: true });
+    if (errResp) { console.error('[caballeriza_responsables]', errResp); toast(errResp.message, 'error'); }
 
     if (respons?.length) {
       const prop = respons.find(r => r.rol === 'propietario');
       if (prop) {
+        if (esProvisorio(prop)) {
+          avisoProv.textContent = `Titular provisorio «${prop.nombre || rec.nombre}» (sin DNI), creado por la secretaría para poder liquidar. Completarlo desde acá todavía crea un propietario NUEVO en vez de completar el provisorio (ISSUE-080): si tenés el titular real, avisale a Leo. Si no tocás este bloque, se guarda todo lo demás sin cambiar el titular.`;
+          avisoProv.hidden = false;
+        }
         document.getElementById('rp-apellido').value  = prop.apellido        || '';
         document.getElementById('rp-nombre').value    = prop.nombre          || '';
         document.getElementById('rp-dni').value       = formatDNI(prop.documento_nro);
@@ -566,6 +653,9 @@ async function openModal(rec = null) {
     }
   }
 
+  // Foto del bloque tal como quedó prellenado: saveRecord compara contra esto.
+  responsablesAlCargar = JSON.stringify(getResponsableData());
+
   document.getElementById('f-hipodromo-patente').value = rec?.hipodromo_patente || (rec ? '' : 'DOL');
   document.getElementById('f-chaq-desc').value = rec?.chaquetilla_descripcion || '';
   document.getElementById('f-chaq-file').value = '';
@@ -587,13 +677,18 @@ async function saveRecord(e) {
   e.preventDefault();
 
   const rows = getResponsableData();
-  const validErr = validateResponsables(rows);
-  if (validErr) { toast(validErr, 'error'); return; }
+  const id = document.getElementById('f-id').value;
+  // Edición sin tocar el bloque de responsables → no se valida ni se reescribe: así las
+  // caballerizas con titular provisorio (sin DNI) o sin titular se pueden editar igual.
+  const responsablesSinCambios = !!id && JSON.stringify(rows) === responsablesAlCargar;
+  if (!responsablesSinCambios) {
+    const validErr = validateResponsables(rows);
+    if (validErr) { toast(validErr, 'error'); return; }
+  }
 
   const btn = document.getElementById('btn-save');
   btn.disabled = true; btn.textContent = 'Guardando…';
 
-  const id = document.getElementById('f-id').value;
   const nuevoEstado = document.getElementById('f-estado').value;
   const estadoOriginal = document.getElementById('f-estado-original').value;
   if (nuevoEstado === 'baja' && estadoOriginal !== 'baja') {
@@ -640,8 +735,18 @@ async function saveRecord(e) {
     cabId = data.id;
   }
 
+  if (responsablesSinCambios) {
+    // Datos de la caballeriza guardados; el titular (real, provisorio o ninguno) queda como estaba.
+    btn.disabled = false; btn.textContent = 'Guardar';
+    toast('Caballeriza actualizada');
+    closeModal();
+    load();
+    return;
+  }
+
   if (id) {
-    await sb.from('caballeriza_responsables').delete().eq('caballeriza_id', cabId);
+    const { error: delErr } = await sb.from('caballeriza_responsables').delete().eq('caballeriza_id', cabId);
+    if (delErr) { btn.disabled = false; btn.textContent = 'Guardar'; toast(delErr.message, 'error'); return; }
   }
 
   try {
@@ -652,6 +757,22 @@ async function saveRecord(e) {
     return;
   }
 
+  if (propietarioVacio(rows)) {
+    // Sin titular conocido → provisorio con el nombre de la caballeriza (Fede 15/08),
+    // igual que el DO de propietarios_provisorios_r9.sql pero para esta sola.
+    const { data: prov, error: provErr } = await sb.rpc('rpc_caballeriza_provisorio', { p_caballeriza_id: cabId });
+    btn.disabled = false; btn.textContent = 'Guardar';
+    if (provErr) {
+      console.error('[rpc_caballeriza_provisorio]', provErr);
+      toast(`Caballeriza ${id ? 'actualizada' : 'creada'}, pero quedó SIN propietario: ${provErr.message.replace(/^.*?:\s*/, '')}`, 'error');
+    } else {
+      toast(`Caballeriza ${id ? 'actualizada' : 'creada'} con propietario provisorio «${document.getElementById('f-nombre').value.trim()}». Completá el titular cuando lo tengas.`);
+    }
+    closeModal();
+    load();
+    return;
+  }
+
   const responsableText = buildResponsableText(rows.filter(r => r.apellido || r.nombre)) || null;
   await sb.from('caballerizas').update({ responsable: responsableText }).eq('id', cabId);
 
```

`git diff --stat main..bb27e8b` (B):
```
 CHANGELOG.md                           |  17 ++
 caballerizas.html                      |  85 +++++-
 tests/probe_caballeriza_provisorio.mjs | 490 +++++++++++++++++++++++++++++++++
 3 files changed, 580 insertions(+), 12 deletions(-)
```
`git diff --stat bb27e8b..e5c7094` (A):
```
 CHANGELOG.md                              |  38 ++++++----
 CLAUDE.md                                 |  10 ++-
 SCHEMA.md                                 |  15 ++++
 caballerizas.html                         |  68 ++++++++++++++++--
 docs/GOTCHAS.md                           |  17 +++++
 docs/ISSUES.md                            |  16 +++++
 docs/MODULOS.md                           |   3 +
 docs/SCHEMA.md                            |   3 +
 migrations/rpc_caballeriza_provisorio.sql | 113 ++++++++++++++++++++++++++++++
 tests/README.md                           |   1 +
 tests/probe_caballeriza_provisorio.mjs    |   4 +-
 11 files changed, 266 insertions(+), 22 deletions(-)
```

El RPC completo está en `migrations/rpc_caballeriza_provisorio.sql` de la rama (113 líneas; el cuerpo es el borrador del
plan §3.1 sin cambios).

## 2. Apply del RPC y advisors

```
mcp__supabase__apply_migration(name='rpc_caballeriza_provisorio', query=<migrations/rpc_caballeriza_provisorio.sql sin cabecera>)
→ {"success":true}
```

`get_advisors(security)`: 71 lints (4 ERROR, 64 WARN, 3 INFO). Sobre la función nueva: **un** WARN
`authenticated_security_definer_function_executable` — el mismo de `rpc_inscribir`, `rpc_baja_inscripcion`,
`rpc_modificar_inscripcion` y las otras 30 (diseño: los guards van adentro; `anon` revocado). Los 4 ERROR son los
preexistentes de siempre (`v_inscriptos_carrera` SECURITY DEFINER view; tablas de backup sin RLS).

## 3. Probe — commit B (10/10) y mutantes HTML sobre B (5/5)

```
$ node tests/probe_caballeriza_provisorio.mjs          # sobre bb27e8b (el RPC no existía todavía → asserts A salteados)

── La UI (caballerizas.html extraída) ──

── El RPC: rpc_caballeriza_provisorio NO existe en la base → asserts A salteados ──

── Probe · caballeriza sin titular → provisorio ──
   html=/home/clio/dev/SGH/caballerizas.html  ·  rpc=rpc_caballeriza_provisorio  ·  run=o7tlcm
 ✅ U1) validateResponsables: vacío OK · parcial (sólo apellido / sin DNI) ERROR · completo OK · co-prop parcial ERROR  → vacio=null parcial=Si cargás el propietario, completá apellido, nombre y DNI. Si todavía no lo sabés, dejá los tres vacíos: la secretaría le pone después un propietario provisorio con el nombre de la caballeriza.
 ✅ U2) [commit B] ALTA con titular vacío → inserta la caballeriza sin responsables, sin error, sin RPC (nace sin titular)  → rpc=0 toasts=["Caballeriza creada"]
 ✅ U3) EDICIÓN sin tocar el bloque (titular provisorio prellenado: nombre sin DNI) → guarda la caballeriza, NO toca caballeriza_responsables, NO valida, NO llama al RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-o7tlcm\",\"telefono\":\"2245-1\",\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})"] toasts=["Caballeriza actualizada"]
 ✅ U4) EDICIÓN con titular nuevo completo → delete + insert en caballeriza_responsables (camino actual), sin RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-o7tlcm\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","profesionales:select(id)","caballeriza_responsables:insert([{\"caballeriza_id\":\"CAB-1\",\"profesional_id\":null,\"apellido\":\"PEREZ\",\"nombre\":\"JUAN\",\"documento_nro\":\"12345678\",\"fecha_nacimiento\":null,\"localidad\":null,\"rol\":\"propietario\",\"activo\":true}])","caballerizas:update({\"responsable\":\"PEREZ JUAN (propietario)\"})"]
 ✅ U5) [commit B] EDICIÓN vaciando el titular → delete de responsables, sin insert, sin RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-o7tlcm\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","caballerizas:update({\"responsable\":null})"]
 ✅ U6) esProvisorio: marcas "provisorio R8 15/08" / "provisorio R9 11/09" / "provisorio alta 16/09/2026" → true; "ex provisorio … completado" → false; sin propietario embebido: sin DNI y sin apellido → true, con DNI → false
 ✅ U7) el HTML: sólo f-nombre es required; el propietario ya no lleva asterisco; hay hint de provisorio y aviso rp-provisorio-aviso
 ✅ U8) openModal pide propietarios(notas) al cargar responsables y toma el snapshot responsablesAlCargar
 ✅ R1) restore: cero filas del run en caballerizas/propietarios/responsables/spcs/usuarios/profesionales/reuniones 9985; spcs antes = después  → {"caballerizas":0,"propietarios":0,"responsables":0,"spcs":0,"usuarios":0,"profesionales":0,"reuniones":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline CLAUDE.md)  → spcs=210

10/10 OK
```

```
$ node tests/probe_caballeriza_provisorio.mjs --mutantes=P1,P2,P3,P4,P6

═══ MUTATION TESTING · 5/15 mutantes ═══
(copias en /tmp/mut-cabprov-mMQi69 — el repo y la función real no se tocan)

✅ P1 muere — validateResponsables vuelve a exigir DNI siempre  [esperaba matar U1; murieron U1]
✅ P2 muere — validación parcial se acepta (apellido sin DNI pasa)  [esperaba matar U1; murieron U1]
✅ P3 muere — la edición borra/reinserta responsables aunque no cambiaron  [esperaba matar U3; murieron U3]
✅ P4 muere — la edición nunca escribe responsables (ni cuando cambiaron)  [esperaba matar U4; murieron U4]
✅ P6 muere — esProvisorio toma "ex provisorio … completado" como provisorio  [esperaba matar U6; murieron U6]

✅ TANDA LIMPIA — 5 automáticos · 5 muertos
```

## 4. Probe — commit A, contra el RPC real (22/22)

```
$ node tests/probe_caballeriza_provisorio.mjs          # sobre e5c7094

── La UI (caballerizas.html extraída) ──
[rpc_caballeriza_provisorio] { message: 'P0001: Ya existe un propietario "X" en este hipódromo.' }

── El RPC (sesiones reales) ──

── Probe · caballeriza sin titular → provisorio ──
   html=/home/clio/dev/SGH/caballerizas.html  ·  rpc=rpc_caballeriza_provisorio  ·  run=ruvmmj
 ✅ U1) validateResponsables: vacío OK · parcial (sólo apellido / sin DNI) ERROR · completo OK · co-prop parcial ERROR  → vacio=null parcial=Si cargás el propietario, completá apellido, nombre y DNI. Si todavía no lo sabés, dejá los tres vacíos: se crea un propietario provisorio con el nombre de la caballeriza.
 ✅ U2) ALTA con titular vacío → inserta la caballeriza, NO inserta responsables y llama a rpc_caballeriza_provisorio con el id nuevo; toast dice "provisorio"  → rpc=1 toasts=["Caballeriza creada con propietario provisorio «PRO"]
 ✅ U3) EDICIÓN sin tocar el bloque (titular provisorio prellenado: nombre sin DNI) → guarda la caballeriza, NO toca caballeriza_responsables, NO valida, NO llama al RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-ruvmmj\",\"telefono\":\"2245-1\",\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})"] toasts=["Caballeriza actualizada"]
 ✅ U4) EDICIÓN con titular nuevo completo → delete + insert en caballeriza_responsables (camino actual), sin RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-ruvmmj\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","profesionales:select(id)","caballeriza_responsables:insert([{\"caballeriza_id\":\"CAB-1\",\"profesional_id\":null,\"apellido\":\"PEREZ\",\"nombre\":\"JUAN\",\"documento_nro\":\"12345678\",\"fecha_nacimiento\":null,\"localidad\":null,\"rol\":\"propietario\",\"activo\":true}])","caballerizas:update({\"responsable\":\"PEREZ JUAN (propietario)\"})"]
 ✅ U5) EDICIÓN vaciando el titular → delete de responsables + rpc_caballeriza_provisorio (no queda huérfana)  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-ruvmmj\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","rpc:rpc_caballeriza_provisorio:{\"p_caballeriza_id\":\"CAB-1\"}"]
 ✅ U5b) si el RPC falla, el toast lo dice ("quedó SIN propietario: …") y la caballeriza ya está creada  → ["Caballeriza creada, pero quedó SIN propietario: Ya existe un propietario \"X\" en "]
 ✅ U6) esProvisorio: marcas "provisorio R8 15/08" / "provisorio R9 11/09" / "provisorio alta 16/09/2026" → true; "ex provisorio … completado" → false; sin propietario embebido: sin DNI y sin apellido → true, con DNI → false
 ✅ U7) el HTML: sólo f-nombre es required; el propietario ya no lleva asterisco; hay hint de provisorio y aviso rp-provisorio-aviso
 ✅ U8) openModal pide propietarios(notas) al cargar responsables y toma el snapshot responsablesAlCargar
 ✅ F0) fixture: cA con 2 inscripciones sin propietario (la caballeriza no tiene titular → el trigger dejó NULL) y 1 con propietario real  → {"i1":{"propietario_id":null,"estado":"inscripto","numero_partidor":null,"caballeriza_id":"24f31d64-0d8a-4699-865c-2f095bf01bf4"},"i2":{"propietario_id":null,"estado":"ratificado","numero_partidor":3,"caballeriza_id":"24f31d64-0d8a-4699-865c-2f095bf01bf4"},"i3":{"propietario_id":"11a9408c-8aa1-4603-a7b3-c58977a8f417","estado":"inscripto","numero_partidor":null,"caballeriza_id":"24f31d64-0d8a-4699-865c-2f095bf01bf4"}}
 ✅ A1) staff crea el provisorio: ok, creado=true; 1 vínculo rol propietario activo SIN DNI apuntando a un propietarios tipo persona, nombre = caballeriza, sin documento, notas "provisorio alta DD/MM/YYYY", activo; responsable legado seteado  → ok=true msg=null data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":true,"propietario_id":"c8cefc68-d300-4779-bf6d-c8ed6f357e23","responsable_id":"f304da62-fc84-4ece-ad23-222fcfc22b51","inscripciones_rederivadas":2} titular=[{"id":"f304da62-fc84-4ece-ad23-222fcfc22b51","propietario_id":"c8cefc68-d300-4779-bf6d-c8ed6f357e23","documento_nro":null,"apellido":null,"nombre":"PROBE-CAB-A-ruvmmj","rol":"propietario","activo":true,"propietarios":{"tipo":"persona","notas":"provisorio alta 16/09/2026","activo":true,"nombre":"PROBE-CAB-A-ruvmmj","documento_nro":null}}] responsable=PROBE-CAB-A-ruvmmj (propietario provisorio)
 ✅ A3) re-deriva las 2 inscripciones sin propietario al provisorio (inscripciones_rederivadas=2); la que tenía propietario real queda intacta; estado/partidor intactos  → {"i1":{"propietario_id":"c8cefc68-d300-4779-bf6d-c8ed6f357e23","estado":"inscripto","numero_partidor":null,"caballeriza_id":"24f31d64-0d8a-4699-865c-2f095bf01bf4"},"i2":{"propietario_id":"c8cefc68-d300-4779-bf6d-c8ed6f357e23","estado":"ratificado","numero_partidor":3,"caballeriza_id":"24f31d64-0d8a-4699-865c-2f095bf01bf4"},"i3":{"propietario_id":"11a9408c-8aa1-4603-a7b3-c58977a8f417","estado":"inscripto","numero_partidor":null,"caballeriza_id":"24f31d64-0d8a-4699-865c-2f095bf01bf4"}}
 ✅ A2) segunda llamada: creado=false, motivo "ya tiene titular"; sigue habiendo 1 vínculo y 1 propietario con ese nombre  → data={"ok":true,"creado":false,"motivo":"ya tiene titular","propietario_id":"c8cefc68-d300-4779-bf6d-c8ed6f357e23","inscripciones_rederivadas":0} vinculos=1 props=1
 ✅ A4) caballeriza homónima sin titular: reusa el mismo provisorio (creado=false, mismo propietario_id), vínculo nuevo; sigue habiendo 1 propietario con ese nombre  → data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":false,"propietario_id":"c8cefc68-d300-4779-bf6d-c8ed6f357e23","responsable_id":"b01f2045-8425-4080-860b-15b9aa9bc1bc","inscripciones_rederivadas":0} props=1
 ✅ A5) existe un propietario REAL con el nombre de la caballeriza → error "Ya existe un propietario"; sin vínculo, sin provisorio nuevo  → msg=Ya existe un propietario "PROBE-CAB-REAL-ruvmmj" en este hipódromo. Cargalo como titular (apellido, nombre y DNI) en vez de crear un provisorio. vinculos=0 props=1
 ✅ A6) sesión de PORTAL → "No autorizado"; sin vínculo  → msg=No autorizado: esta operación es de la secretaría.
 ✅ A7) staff de OTRO club → "otro hipódromo"; sin vínculo  → msg=Esa caballeriza es de otro hipódromo.
 ✅ A8) caballeriza inexistente → "no existe"  → msg=La caballeriza no existe.
 ✅ A9) después del RPC, una inscripción nueva en esa caballeriza nace con propietario_id = provisorio (trg_insc_set_propietario)  → {"propietario_id":"c8cefc68-d300-4779-bf6d-c8ed6f357e23","estado":"inscripto","numero_partidor":null,"caballeriza_id":"24f31d64-0d8a-4699-865c-2f095bf01bf4"}
 ✅ A0) caballeriza (nombre/club/activo) y el propietario REAL de probe no cambiaron  → {"cabA2":{"nombre":"PROBE-CAB-A-ruvmmj","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},"pReal":{"nombre":"PROBE-CAB-REAL-ruvmmj","documento_nro":"77111111","notas":null}}
 ✅ R1) restore: cero filas del run en caballerizas/propietarios/responsables/spcs/usuarios/profesionales/reuniones 9985; spcs antes = después  → {"caballerizas":0,"propietarios":0,"responsables":0,"spcs":0,"usuarios":0,"profesionales":0,"reuniones":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline CLAUDE.md)  → spcs=210

22/22 OK
```

Lectura de lo que importa para el domingo:
- **U3**: editar una caballeriza con titular provisorio (o sin titular) y guardar sin tocar el bloque → sólo `UPDATE
  caballerizas`; cero llamadas a `caballeriza_responsables`; cero validación. **Las 95 vuelven a ser editables.**
- **A1/A3/A9**: la cadena cierra — provisorio creado con la forma exacta de los 47 del `DO`, las 2 inscripciones sin
  propietario re-derivadas, la que tenía propietario real intacta, y una inscripción nueva en esa caballeriza nace con el
  provisorio por el trigger.
- **A2/A4/A5**: idempotente; homónima reusa; homónimo real corta.
- **A6/A7**: portal y staff de otro club, afuera.

## 5. Mutantes — 15/15 muertos

HTML (automáticos, sobre A):
```

═══ MUTATION TESTING · 6/15 mutantes ═══
(copias en /tmp/mut-cabprov-uZKRt1 — el repo y la función real no se tocan)

✅ P1 muere — validateResponsables vuelve a exigir DNI siempre  [esperaba matar U1; murieron U1]
✅ P2 muere — validación parcial se acepta (apellido sin DNI pasa)  [esperaba matar U1; murieron U1]
✅ P3 muere — la edición borra/reinserta responsables aunque no cambiaron  [esperaba matar U3; murieron U3]
✅ P4 muere — la edición nunca escribe responsables (ni cuando cambiaron)  [esperaba matar U4; murieron U4]
✅ P5 muere — titular vacío no llama al RPC (queda huérfana)  [esperaba matar U2,U5; murieron U2,U5]
✅ P6 muere — esProvisorio toma "ex provisorio … completado" como provisorio  [esperaba matar U6; murieron U6]

✅ TANDA LIMPIA — 6 automáticos · 6 muertos
```

SQL (gemela `rpc_caballeriza_provisorio_mut` construida en la base desde `pg_get_functiondef` con el `from→to` del array
`MUTANTES` del probe, por `execute_sql`; `RPC_PROV=rpc_caballeriza_provisorio_mut`; `DROP` al final):

| id | mutante | tenía que matar | murieron | resultado | |
|---|---|---|---|---|---|
| M1 | cae fn_is_staff | A6 | A6, A7 | 20/22 OK | ✅ muere |
| M2 | cae el guard de club | A7 | A7 | 21/22 OK | ✅ muere |
| M3 | cae el no-op "ya tiene titular" | A2 | A2 | 21/22 OK | ✅ muere |
| M4 | cae el corte por homónimo REAL | A5 | A5 | 21/22 OK | ✅ muere |
| M5 | no reusa el provisorio homónimo | A4 | A4 | 21/22 OK | ✅ muere |
| M6 | el vínculo lleva DNI (el trigger crea otro propietario) | A1 | A1, A2, A4, A9 | 18/22 OK | ✅ muere |
| M7 | cae la re-derivación | A3 | A3 | 21/22 OK | ✅ muere |
| M8 | re-deriva también las que ya tenían propietario | A3 | A3 | 21/22 OK | ✅ muere |
| M9 | la marca no empieza con "provisorio" | A1 | A1, A4 | 20/22 OK | ✅ muere |

15/15 en total (6 HTML + 9 SQL), 0 sobrevivientes, 0 errores de arnés. **M6 se corrigió sobre la marcha**: la
primera versión sólo agregaba un valor al `VALUES` (7 valores para 6 columnas → error de SQL, no el mutante que quería);
la definitiva agrega también la columna `documento_nro`. M10 (`FOR UPDATE`) declarado no cubierto (concurrencia).

### Salidas crudas de los 9 SQL

### cab_mut_M1.txt

```

── La UI (caballerizas.html extraída) ──
[rpc_caballeriza_provisorio] { message: 'P0001: Ya existe un propietario "X" en este hipódromo.' }

── El RPC (sesiones reales) ──

── Probe · caballeriza sin titular → provisorio ──
   html=/home/clio/dev/SGH/caballerizas.html  ·  rpc=rpc_caballeriza_provisorio_mut  ·  run=9owf7q
 ✅ U1) validateResponsables: vacío OK · parcial (sólo apellido / sin DNI) ERROR · completo OK · co-prop parcial ERROR  → vacio=null parcial=Si cargás el propietario, completá apellido, nombre y DNI. Si todavía no lo sabés, dejá los tres vacíos: se crea un propietario provisorio con el nombre de la caballeriza.
 ✅ U2) ALTA con titular vacío → inserta la caballeriza, NO inserta responsables y llama a rpc_caballeriza_provisorio con el id nuevo; toast dice "provisorio"  → rpc=1 toasts=["Caballeriza creada con propietario provisorio «PRO"]
 ✅ U3) EDICIÓN sin tocar el bloque (titular provisorio prellenado: nombre sin DNI) → guarda la caballeriza, NO toca caballeriza_responsables, NO valida, NO llama al RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-9owf7q\",\"telefono\":\"2245-1\",\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})"] toasts=["Caballeriza actualizada"]
 ✅ U4) EDICIÓN con titular nuevo completo → delete + insert en caballeriza_responsables (camino actual), sin RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-9owf7q\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","profesionales:select(id)","caballeriza_responsables:insert([{\"caballeriza_id\":\"CAB-1\",\"profesional_id\":null,\"apellido\":\"PEREZ\",\"nombre\":\"JUAN\",\"documento_nro\":\"12345678\",\"fecha_nacimiento\":null,\"localidad\":null,\"rol\":\"propietario\",\"activo\":true}])","caballerizas:update({\"responsable\":\"PEREZ JUAN (propietario)\"})"]
 ✅ U5) EDICIÓN vaciando el titular → delete de responsables + rpc_caballeriza_provisorio (no queda huérfana)  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-9owf7q\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","rpc:rpc_caballeriza_provisorio:{\"p_caballeriza_id\":\"CAB-1\"}"]
 ✅ U5b) si el RPC falla, el toast lo dice ("quedó SIN propietario: …") y la caballeriza ya está creada  → ["Caballeriza creada, pero quedó SIN propietario: Ya existe un propietario \"X\" en "]
 ✅ U6) esProvisorio: marcas "provisorio R8 15/08" / "provisorio R9 11/09" / "provisorio alta 16/09/2026" → true; "ex provisorio … completado" → false; sin propietario embebido: sin DNI y sin apellido → true, con DNI → false
 ✅ U7) el HTML: sólo f-nombre es required; el propietario ya no lleva asterisco; hay hint de provisorio y aviso rp-provisorio-aviso
 ✅ U8) openModal pide propietarios(notas) al cargar responsables y toma el snapshot responsablesAlCargar
 ✅ F0) fixture: cA con 2 inscripciones sin propietario (la caballeriza no tiene titular → el trigger dejó NULL) y 1 con propietario real  → {"i1":{"propietario_id":null,"estado":"inscripto","numero_partidor":null,"caballeriza_id":"3d21ec6c-9a73-4c02-ac07-fcd4a3502082"},"i2":{"propietario_id":null,"estado":"ratificado","numero_partidor":3,"caballeriza_id":"3d21ec6c-9a73-4c02-ac07-fcd4a3502082"},"i3":{"propietario_id":"cda6dc6f-b9f8-4408-a3b3-d4557f889120","estado":"inscripto","numero_partidor":null,"caballeriza_id":"3d21ec6c-9a73-4c02-ac07-fcd4a3502082"}}
 ✅ A1) staff crea el provisorio: ok, creado=true; 1 vínculo rol propietario activo SIN DNI apuntando a un propietarios tipo persona, nombre = caballeriza, sin documento, notas "provisorio alta DD/MM/YYYY", activo; responsable legado seteado  → ok=true msg=null data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":true,"propietario_id":"384f9a77-1004-45d0-9b08-cafd9f664d93","responsable_id":"52513ad0-a129-4b42-9766-3bb2a4e07227","inscripciones_rederivadas":2} titular=[{"id":"52513ad0-a129-4b42-9766-3bb2a4e07227","propietario_id":"384f9a77-1004-45d0-9b08-cafd9f664d93","documento_nro":null,"apellido":null,"nombre":"PROBE-CAB-A-9owf7q","rol":"propietario","activo":true,"propietarios":{"tipo":"persona","notas":"provisorio alta 16/09/2026","activo":true,"nombre":"PROBE-CAB-A-9owf7q","documento_nro":null}}] responsable=PROBE-CAB-A-9owf7q (propietario provisorio)
 ✅ A3) re-deriva las 2 inscripciones sin propietario al provisorio (inscripciones_rederivadas=2); la que tenía propietario real queda intacta; estado/partidor intactos  → {"i1":{"propietario_id":"384f9a77-1004-45d0-9b08-cafd9f664d93","estado":"inscripto","numero_partidor":null,"caballeriza_id":"3d21ec6c-9a73-4c02-ac07-fcd4a3502082"},"i2":{"propietario_id":"384f9a77-1004-45d0-9b08-cafd9f664d93","estado":"ratificado","numero_partidor":3,"caballeriza_id":"3d21ec6c-9a73-4c02-ac07-fcd4a3502082"},"i3":{"propietario_id":"cda6dc6f-b9f8-4408-a3b3-d4557f889120","estado":"inscripto","numero_partidor":null,"caballeriza_id":"3d21ec6c-9a73-4c02-ac07-fcd4a3502082"}}
 ✅ A2) segunda llamada: creado=false, motivo "ya tiene titular"; sigue habiendo 1 vínculo y 1 propietario con ese nombre  → data={"ok":true,"creado":false,"motivo":"ya tiene titular","propietario_id":"384f9a77-1004-45d0-9b08-cafd9f664d93","inscripciones_rederivadas":0} vinculos=1 props=1
 ✅ A4) caballeriza homónima sin titular: reusa el mismo provisorio (creado=false, mismo propietario_id), vínculo nuevo; sigue habiendo 1 propietario con ese nombre  → data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":false,"propietario_id":"384f9a77-1004-45d0-9b08-cafd9f664d93","responsable_id":"c1509c3a-e13e-41b9-8f26-18931c7282e8","inscripciones_rederivadas":0} props=1
 ✅ A5) existe un propietario REAL con el nombre de la caballeriza → error "Ya existe un propietario"; sin vínculo, sin provisorio nuevo  → msg=Ya existe un propietario "PROBE-CAB-REAL-9owf7q" en este hipódromo. Cargalo como titular (apellido, nombre y DNI) en vez de crear un provisorio. vinculos=0 props=1
 ❌ A6) sesión de PORTAL → "No autorizado"; sin vínculo  → msg=null
 ❌ A7) staff de OTRO club → "otro hipódromo"; sin vínculo  → msg=Esa caballeriza es de otro hipódromo.
 ✅ A8) caballeriza inexistente → "no existe"  → msg=La caballeriza no existe.
 ✅ A9) después del RPC, una inscripción nueva en esa caballeriza nace con propietario_id = provisorio (trg_insc_set_propietario)  → {"propietario_id":"384f9a77-1004-45d0-9b08-cafd9f664d93","estado":"inscripto","numero_partidor":null,"caballeriza_id":"3d21ec6c-9a73-4c02-ac07-fcd4a3502082"}
 ✅ A0) caballeriza (nombre/club/activo) y el propietario REAL de probe no cambiaron  → {"cabA2":{"nombre":"PROBE-CAB-A-9owf7q","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},"pReal":{"nombre":"PROBE-CAB-REAL-9owf7q","documento_nro":"77971111","notas":null}}
 ✅ R1) restore: cero filas del run en caballerizas/propietarios/responsables/spcs/usuarios/profesionales/reuniones 9985; spcs antes = después  → {"caballerizas":0,"propietarios":0,"responsables":0,"spcs":0,"usuarios":0,"profesionales":0,"reuniones":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline CLAUDE.md)  → spcs=210

20/22 OK
```

### cab_mut_M2.txt

```

── La UI (caballerizas.html extraída) ──
[rpc_caballeriza_provisorio] { message: 'P0001: Ya existe un propietario "X" en este hipódromo.' }

── El RPC (sesiones reales) ──

── Probe · caballeriza sin titular → provisorio ──
   html=/home/clio/dev/SGH/caballerizas.html  ·  rpc=rpc_caballeriza_provisorio_mut  ·  run=sveima
 ✅ U1) validateResponsables: vacío OK · parcial (sólo apellido / sin DNI) ERROR · completo OK · co-prop parcial ERROR  → vacio=null parcial=Si cargás el propietario, completá apellido, nombre y DNI. Si todavía no lo sabés, dejá los tres vacíos: se crea un propietario provisorio con el nombre de la caballeriza.
 ✅ U2) ALTA con titular vacío → inserta la caballeriza, NO inserta responsables y llama a rpc_caballeriza_provisorio con el id nuevo; toast dice "provisorio"  → rpc=1 toasts=["Caballeriza creada con propietario provisorio «PRO"]
 ✅ U3) EDICIÓN sin tocar el bloque (titular provisorio prellenado: nombre sin DNI) → guarda la caballeriza, NO toca caballeriza_responsables, NO valida, NO llama al RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-sveima\",\"telefono\":\"2245-1\",\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})"] toasts=["Caballeriza actualizada"]
 ✅ U4) EDICIÓN con titular nuevo completo → delete + insert en caballeriza_responsables (camino actual), sin RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-sveima\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","profesionales:select(id)","caballeriza_responsables:insert([{\"caballeriza_id\":\"CAB-1\",\"profesional_id\":null,\"apellido\":\"PEREZ\",\"nombre\":\"JUAN\",\"documento_nro\":\"12345678\",\"fecha_nacimiento\":null,\"localidad\":null,\"rol\":\"propietario\",\"activo\":true}])","caballerizas:update({\"responsable\":\"PEREZ JUAN (propietario)\"})"]
 ✅ U5) EDICIÓN vaciando el titular → delete de responsables + rpc_caballeriza_provisorio (no queda huérfana)  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-sveima\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","rpc:rpc_caballeriza_provisorio:{\"p_caballeriza_id\":\"CAB-1\"}"]
 ✅ U5b) si el RPC falla, el toast lo dice ("quedó SIN propietario: …") y la caballeriza ya está creada  → ["Caballeriza creada, pero quedó SIN propietario: Ya existe un propietario \"X\" en "]
 ✅ U6) esProvisorio: marcas "provisorio R8 15/08" / "provisorio R9 11/09" / "provisorio alta 16/09/2026" → true; "ex provisorio … completado" → false; sin propietario embebido: sin DNI y sin apellido → true, con DNI → false
 ✅ U7) el HTML: sólo f-nombre es required; el propietario ya no lleva asterisco; hay hint de provisorio y aviso rp-provisorio-aviso
 ✅ U8) openModal pide propietarios(notas) al cargar responsables y toma el snapshot responsablesAlCargar
 ✅ F0) fixture: cA con 2 inscripciones sin propietario (la caballeriza no tiene titular → el trigger dejó NULL) y 1 con propietario real  → {"i1":{"propietario_id":null,"estado":"inscripto","numero_partidor":null,"caballeriza_id":"b55b1fcf-dc10-4122-a0bc-629609b0057a"},"i2":{"propietario_id":null,"estado":"ratificado","numero_partidor":3,"caballeriza_id":"b55b1fcf-dc10-4122-a0bc-629609b0057a"},"i3":{"propietario_id":"c4fa6212-0eea-4652-87e9-1b52e54204e0","estado":"inscripto","numero_partidor":null,"caballeriza_id":"b55b1fcf-dc10-4122-a0bc-629609b0057a"}}
 ✅ A1) staff crea el provisorio: ok, creado=true; 1 vínculo rol propietario activo SIN DNI apuntando a un propietarios tipo persona, nombre = caballeriza, sin documento, notas "provisorio alta DD/MM/YYYY", activo; responsable legado seteado  → ok=true msg=null data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":true,"propietario_id":"f61e3c4c-7c08-4efa-a15e-314e58025d97","responsable_id":"34de6129-1e78-42d7-9d00-a0b846931ca0","inscripciones_rederivadas":2} titular=[{"id":"34de6129-1e78-42d7-9d00-a0b846931ca0","propietario_id":"f61e3c4c-7c08-4efa-a15e-314e58025d97","documento_nro":null,"apellido":null,"nombre":"PROBE-CAB-A-sveima","rol":"propietario","activo":true,"propietarios":{"tipo":"persona","notas":"provisorio alta 16/09/2026","activo":true,"nombre":"PROBE-CAB-A-sveima","documento_nro":null}}] responsable=PROBE-CAB-A-sveima (propietario provisorio)
 ✅ A3) re-deriva las 2 inscripciones sin propietario al provisorio (inscripciones_rederivadas=2); la que tenía propietario real queda intacta; estado/partidor intactos  → {"i1":{"propietario_id":"f61e3c4c-7c08-4efa-a15e-314e58025d97","estado":"inscripto","numero_partidor":null,"caballeriza_id":"b55b1fcf-dc10-4122-a0bc-629609b0057a"},"i2":{"propietario_id":"f61e3c4c-7c08-4efa-a15e-314e58025d97","estado":"ratificado","numero_partidor":3,"caballeriza_id":"b55b1fcf-dc10-4122-a0bc-629609b0057a"},"i3":{"propietario_id":"c4fa6212-0eea-4652-87e9-1b52e54204e0","estado":"inscripto","numero_partidor":null,"caballeriza_id":"b55b1fcf-dc10-4122-a0bc-629609b0057a"}}
 ✅ A2) segunda llamada: creado=false, motivo "ya tiene titular"; sigue habiendo 1 vínculo y 1 propietario con ese nombre  → data={"ok":true,"creado":false,"motivo":"ya tiene titular","propietario_id":"f61e3c4c-7c08-4efa-a15e-314e58025d97","inscripciones_rederivadas":0} vinculos=1 props=1
 ✅ A4) caballeriza homónima sin titular: reusa el mismo provisorio (creado=false, mismo propietario_id), vínculo nuevo; sigue habiendo 1 propietario con ese nombre  → data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":false,"propietario_id":"f61e3c4c-7c08-4efa-a15e-314e58025d97","responsable_id":"b4351816-4dfc-4153-8799-22d2631ceef9","inscripciones_rederivadas":0} props=1
 ✅ A5) existe un propietario REAL con el nombre de la caballeriza → error "Ya existe un propietario"; sin vínculo, sin provisorio nuevo  → msg=Ya existe un propietario "PROBE-CAB-REAL-sveima" en este hipódromo. Cargalo como titular (apellido, nombre y DNI) en vez de crear un provisorio. vinculos=0 props=1
 ✅ A6) sesión de PORTAL → "No autorizado"; sin vínculo  → msg=No autorizado: esta operación es de la secretaría.
 ❌ A7) staff de OTRO club → "otro hipódromo"; sin vínculo  → msg=null
 ✅ A8) caballeriza inexistente → "no existe"  → msg=La caballeriza no existe.
 ✅ A9) después del RPC, una inscripción nueva en esa caballeriza nace con propietario_id = provisorio (trg_insc_set_propietario)  → {"propietario_id":"f61e3c4c-7c08-4efa-a15e-314e58025d97","estado":"inscripto","numero_partidor":null,"caballeriza_id":"b55b1fcf-dc10-4122-a0bc-629609b0057a"}
 ✅ A0) caballeriza (nombre/club/activo) y el propietario REAL de probe no cambiaron  → {"cabA2":{"nombre":"PROBE-CAB-A-sveima","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},"pReal":{"nombre":"PROBE-CAB-REAL-sveima","documento_nro":"77111111","notas":null}}
 ✅ R1) restore: cero filas del run en caballerizas/propietarios/responsables/spcs/usuarios/profesionales/reuniones 9985; spcs antes = después  → {"caballerizas":0,"propietarios":0,"responsables":0,"spcs":0,"usuarios":0,"profesionales":0,"reuniones":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline CLAUDE.md)  → spcs=210

21/22 OK
```

### cab_mut_M3.txt

```

── La UI (caballerizas.html extraída) ──
[rpc_caballeriza_provisorio] { message: 'P0001: Ya existe un propietario "X" en este hipódromo.' }

── El RPC (sesiones reales) ──

── Probe · caballeriza sin titular → provisorio ──
   html=/home/clio/dev/SGH/caballerizas.html  ·  rpc=rpc_caballeriza_provisorio_mut  ·  run=bhymxk
 ✅ U1) validateResponsables: vacío OK · parcial (sólo apellido / sin DNI) ERROR · completo OK · co-prop parcial ERROR  → vacio=null parcial=Si cargás el propietario, completá apellido, nombre y DNI. Si todavía no lo sabés, dejá los tres vacíos: se crea un propietario provisorio con el nombre de la caballeriza.
 ✅ U2) ALTA con titular vacío → inserta la caballeriza, NO inserta responsables y llama a rpc_caballeriza_provisorio con el id nuevo; toast dice "provisorio"  → rpc=1 toasts=["Caballeriza creada con propietario provisorio «PRO"]
 ✅ U3) EDICIÓN sin tocar el bloque (titular provisorio prellenado: nombre sin DNI) → guarda la caballeriza, NO toca caballeriza_responsables, NO valida, NO llama al RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-bhymxk\",\"telefono\":\"2245-1\",\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})"] toasts=["Caballeriza actualizada"]
 ✅ U4) EDICIÓN con titular nuevo completo → delete + insert en caballeriza_responsables (camino actual), sin RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-bhymxk\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","profesionales:select(id)","caballeriza_responsables:insert([{\"caballeriza_id\":\"CAB-1\",\"profesional_id\":null,\"apellido\":\"PEREZ\",\"nombre\":\"JUAN\",\"documento_nro\":\"12345678\",\"fecha_nacimiento\":null,\"localidad\":null,\"rol\":\"propietario\",\"activo\":true}])","caballerizas:update({\"responsable\":\"PEREZ JUAN (propietario)\"})"]
 ✅ U5) EDICIÓN vaciando el titular → delete de responsables + rpc_caballeriza_provisorio (no queda huérfana)  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-bhymxk\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","rpc:rpc_caballeriza_provisorio:{\"p_caballeriza_id\":\"CAB-1\"}"]
 ✅ U5b) si el RPC falla, el toast lo dice ("quedó SIN propietario: …") y la caballeriza ya está creada  → ["Caballeriza creada, pero quedó SIN propietario: Ya existe un propietario \"X\" en "]
 ✅ U6) esProvisorio: marcas "provisorio R8 15/08" / "provisorio R9 11/09" / "provisorio alta 16/09/2026" → true; "ex provisorio … completado" → false; sin propietario embebido: sin DNI y sin apellido → true, con DNI → false
 ✅ U7) el HTML: sólo f-nombre es required; el propietario ya no lleva asterisco; hay hint de provisorio y aviso rp-provisorio-aviso
 ✅ U8) openModal pide propietarios(notas) al cargar responsables y toma el snapshot responsablesAlCargar
 ✅ F0) fixture: cA con 2 inscripciones sin propietario (la caballeriza no tiene titular → el trigger dejó NULL) y 1 con propietario real  → {"i1":{"propietario_id":null,"estado":"inscripto","numero_partidor":null,"caballeriza_id":"27285676-6a2d-46ba-8146-716bb0ce41d0"},"i2":{"propietario_id":null,"estado":"ratificado","numero_partidor":3,"caballeriza_id":"27285676-6a2d-46ba-8146-716bb0ce41d0"},"i3":{"propietario_id":"7e3a000e-2d44-4d55-a174-9d5a78692434","estado":"inscripto","numero_partidor":null,"caballeriza_id":"27285676-6a2d-46ba-8146-716bb0ce41d0"}}
 ✅ A1) staff crea el provisorio: ok, creado=true; 1 vínculo rol propietario activo SIN DNI apuntando a un propietarios tipo persona, nombre = caballeriza, sin documento, notas "provisorio alta DD/MM/YYYY", activo; responsable legado seteado  → ok=true msg=null data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":true,"propietario_id":"5eb92a6a-8cc9-4c9d-b8ec-c8df5ef6f137","responsable_id":"4b8d92c2-fdbe-4fba-a198-7650d64c57fd","inscripciones_rederivadas":2} titular=[{"id":"4b8d92c2-fdbe-4fba-a198-7650d64c57fd","propietario_id":"5eb92a6a-8cc9-4c9d-b8ec-c8df5ef6f137","documento_nro":null,"apellido":null,"nombre":"PROBE-CAB-A-bhymxk","rol":"propietario","activo":true,"propietarios":{"tipo":"persona","notas":"provisorio alta 16/09/2026","activo":true,"nombre":"PROBE-CAB-A-bhymxk","documento_nro":null}}] responsable=PROBE-CAB-A-bhymxk (propietario provisorio)
 ✅ A3) re-deriva las 2 inscripciones sin propietario al provisorio (inscripciones_rederivadas=2); la que tenía propietario real queda intacta; estado/partidor intactos  → {"i1":{"propietario_id":"5eb92a6a-8cc9-4c9d-b8ec-c8df5ef6f137","estado":"inscripto","numero_partidor":null,"caballeriza_id":"27285676-6a2d-46ba-8146-716bb0ce41d0"},"i2":{"propietario_id":"5eb92a6a-8cc9-4c9d-b8ec-c8df5ef6f137","estado":"ratificado","numero_partidor":3,"caballeriza_id":"27285676-6a2d-46ba-8146-716bb0ce41d0"},"i3":{"propietario_id":"7e3a000e-2d44-4d55-a174-9d5a78692434","estado":"inscripto","numero_partidor":null,"caballeriza_id":"27285676-6a2d-46ba-8146-716bb0ce41d0"}}
 ❌ A2) segunda llamada: creado=false, motivo "ya tiene titular"; sigue habiendo 1 vínculo y 1 propietario con ese nombre  → data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":false,"propietario_id":"5eb92a6a-8cc9-4c9d-b8ec-c8df5ef6f137","responsable_id":"78ee003d-087d-49c1-a642-305afb4e9aa5","inscripciones_rederivadas":0} vinculos=2 props=1
 ✅ A4) caballeriza homónima sin titular: reusa el mismo provisorio (creado=false, mismo propietario_id), vínculo nuevo; sigue habiendo 1 propietario con ese nombre  → data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":false,"propietario_id":"5eb92a6a-8cc9-4c9d-b8ec-c8df5ef6f137","responsable_id":"641e1118-df37-43fd-be79-e29a1a993063","inscripciones_rederivadas":0} props=1
 ✅ A5) existe un propietario REAL con el nombre de la caballeriza → error "Ya existe un propietario"; sin vínculo, sin provisorio nuevo  → msg=Ya existe un propietario "PROBE-CAB-REAL-bhymxk" en este hipódromo. Cargalo como titular (apellido, nombre y DNI) en vez de crear un provisorio. vinculos=0 props=1
 ✅ A6) sesión de PORTAL → "No autorizado"; sin vínculo  → msg=No autorizado: esta operación es de la secretaría.
 ✅ A7) staff de OTRO club → "otro hipódromo"; sin vínculo  → msg=Esa caballeriza es de otro hipódromo.
 ✅ A8) caballeriza inexistente → "no existe"  → msg=La caballeriza no existe.
 ✅ A9) después del RPC, una inscripción nueva en esa caballeriza nace con propietario_id = provisorio (trg_insc_set_propietario)  → {"propietario_id":"5eb92a6a-8cc9-4c9d-b8ec-c8df5ef6f137","estado":"inscripto","numero_partidor":null,"caballeriza_id":"27285676-6a2d-46ba-8146-716bb0ce41d0"}
 ✅ A0) caballeriza (nombre/club/activo) y el propietario REAL de probe no cambiaron  → {"cabA2":{"nombre":"PROBE-CAB-A-bhymxk","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},"pReal":{"nombre":"PROBE-CAB-REAL-bhymxk","documento_nro":"77111111","notas":null}}
 ✅ R1) restore: cero filas del run en caballerizas/propietarios/responsables/spcs/usuarios/profesionales/reuniones 9985; spcs antes = después  → {"caballerizas":0,"propietarios":0,"responsables":0,"spcs":0,"usuarios":0,"profesionales":0,"reuniones":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline CLAUDE.md)  → spcs=210

21/22 OK
```

### cab_mut_M4.txt

```

── La UI (caballerizas.html extraída) ──
[rpc_caballeriza_provisorio] { message: 'P0001: Ya existe un propietario "X" en este hipódromo.' }

── El RPC (sesiones reales) ──

── Probe · caballeriza sin titular → provisorio ──
   html=/home/clio/dev/SGH/caballerizas.html  ·  rpc=rpc_caballeriza_provisorio_mut  ·  run=vbq0yf
 ✅ U1) validateResponsables: vacío OK · parcial (sólo apellido / sin DNI) ERROR · completo OK · co-prop parcial ERROR  → vacio=null parcial=Si cargás el propietario, completá apellido, nombre y DNI. Si todavía no lo sabés, dejá los tres vacíos: se crea un propietario provisorio con el nombre de la caballeriza.
 ✅ U2) ALTA con titular vacío → inserta la caballeriza, NO inserta responsables y llama a rpc_caballeriza_provisorio con el id nuevo; toast dice "provisorio"  → rpc=1 toasts=["Caballeriza creada con propietario provisorio «PRO"]
 ✅ U3) EDICIÓN sin tocar el bloque (titular provisorio prellenado: nombre sin DNI) → guarda la caballeriza, NO toca caballeriza_responsables, NO valida, NO llama al RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-vbq0yf\",\"telefono\":\"2245-1\",\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})"] toasts=["Caballeriza actualizada"]
 ✅ U4) EDICIÓN con titular nuevo completo → delete + insert en caballeriza_responsables (camino actual), sin RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-vbq0yf\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","profesionales:select(id)","caballeriza_responsables:insert([{\"caballeriza_id\":\"CAB-1\",\"profesional_id\":null,\"apellido\":\"PEREZ\",\"nombre\":\"JUAN\",\"documento_nro\":\"12345678\",\"fecha_nacimiento\":null,\"localidad\":null,\"rol\":\"propietario\",\"activo\":true}])","caballerizas:update({\"responsable\":\"PEREZ JUAN (propietario)\"})"]
 ✅ U5) EDICIÓN vaciando el titular → delete de responsables + rpc_caballeriza_provisorio (no queda huérfana)  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-vbq0yf\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","rpc:rpc_caballeriza_provisorio:{\"p_caballeriza_id\":\"CAB-1\"}"]
 ✅ U5b) si el RPC falla, el toast lo dice ("quedó SIN propietario: …") y la caballeriza ya está creada  → ["Caballeriza creada, pero quedó SIN propietario: Ya existe un propietario \"X\" en "]
 ✅ U6) esProvisorio: marcas "provisorio R8 15/08" / "provisorio R9 11/09" / "provisorio alta 16/09/2026" → true; "ex provisorio … completado" → false; sin propietario embebido: sin DNI y sin apellido → true, con DNI → false
 ✅ U7) el HTML: sólo f-nombre es required; el propietario ya no lleva asterisco; hay hint de provisorio y aviso rp-provisorio-aviso
 ✅ U8) openModal pide propietarios(notas) al cargar responsables y toma el snapshot responsablesAlCargar
 ✅ F0) fixture: cA con 2 inscripciones sin propietario (la caballeriza no tiene titular → el trigger dejó NULL) y 1 con propietario real  → {"i1":{"propietario_id":null,"estado":"inscripto","numero_partidor":null,"caballeriza_id":"6d334a4f-d105-4b89-924e-ccd38e7218ae"},"i2":{"propietario_id":null,"estado":"ratificado","numero_partidor":3,"caballeriza_id":"6d334a4f-d105-4b89-924e-ccd38e7218ae"},"i3":{"propietario_id":"2f41bb5c-760a-4a7f-b6b7-91334cb56401","estado":"inscripto","numero_partidor":null,"caballeriza_id":"6d334a4f-d105-4b89-924e-ccd38e7218ae"}}
 ✅ A1) staff crea el provisorio: ok, creado=true; 1 vínculo rol propietario activo SIN DNI apuntando a un propietarios tipo persona, nombre = caballeriza, sin documento, notas "provisorio alta DD/MM/YYYY", activo; responsable legado seteado  → ok=true msg=null data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":true,"propietario_id":"e840fec1-0248-457f-9869-f840d35d6fcb","responsable_id":"b31e760f-ff53-4405-b49c-3c744fdc1896","inscripciones_rederivadas":2} titular=[{"id":"b31e760f-ff53-4405-b49c-3c744fdc1896","propietario_id":"e840fec1-0248-457f-9869-f840d35d6fcb","documento_nro":null,"apellido":null,"nombre":"PROBE-CAB-A-vbq0yf","rol":"propietario","activo":true,"propietarios":{"tipo":"persona","notas":"provisorio alta 16/09/2026","activo":true,"nombre":"PROBE-CAB-A-vbq0yf","documento_nro":null}}] responsable=PROBE-CAB-A-vbq0yf (propietario provisorio)
 ✅ A3) re-deriva las 2 inscripciones sin propietario al provisorio (inscripciones_rederivadas=2); la que tenía propietario real queda intacta; estado/partidor intactos  → {"i1":{"propietario_id":"e840fec1-0248-457f-9869-f840d35d6fcb","estado":"inscripto","numero_partidor":null,"caballeriza_id":"6d334a4f-d105-4b89-924e-ccd38e7218ae"},"i2":{"propietario_id":"e840fec1-0248-457f-9869-f840d35d6fcb","estado":"ratificado","numero_partidor":3,"caballeriza_id":"6d334a4f-d105-4b89-924e-ccd38e7218ae"},"i3":{"propietario_id":"2f41bb5c-760a-4a7f-b6b7-91334cb56401","estado":"inscripto","numero_partidor":null,"caballeriza_id":"6d334a4f-d105-4b89-924e-ccd38e7218ae"}}
 ✅ A2) segunda llamada: creado=false, motivo "ya tiene titular"; sigue habiendo 1 vínculo y 1 propietario con ese nombre  → data={"ok":true,"creado":false,"motivo":"ya tiene titular","propietario_id":"e840fec1-0248-457f-9869-f840d35d6fcb","inscripciones_rederivadas":0} vinculos=1 props=1
 ✅ A4) caballeriza homónima sin titular: reusa el mismo provisorio (creado=false, mismo propietario_id), vínculo nuevo; sigue habiendo 1 propietario con ese nombre  → data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":false,"propietario_id":"e840fec1-0248-457f-9869-f840d35d6fcb","responsable_id":"2e2cb99f-a4de-4c99-ad39-3d10f104a1cc","inscripciones_rederivadas":0} props=1
 ❌ A5) existe un propietario REAL con el nombre de la caballeriza → error "Ya existe un propietario"; sin vínculo, sin provisorio nuevo  → msg=null vinculos=1 props=2
 ✅ A6) sesión de PORTAL → "No autorizado"; sin vínculo  → msg=No autorizado: esta operación es de la secretaría.
 ✅ A7) staff de OTRO club → "otro hipódromo"; sin vínculo  → msg=Esa caballeriza es de otro hipódromo.
 ✅ A8) caballeriza inexistente → "no existe"  → msg=La caballeriza no existe.
 ✅ A9) después del RPC, una inscripción nueva en esa caballeriza nace con propietario_id = provisorio (trg_insc_set_propietario)  → {"propietario_id":"e840fec1-0248-457f-9869-f840d35d6fcb","estado":"inscripto","numero_partidor":null,"caballeriza_id":"6d334a4f-d105-4b89-924e-ccd38e7218ae"}
 ✅ A0) caballeriza (nombre/club/activo) y el propietario REAL de probe no cambiaron  → {"cabA2":{"nombre":"PROBE-CAB-A-vbq0yf","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},"pReal":{"nombre":"PROBE-CAB-REAL-vbq0yf","documento_nro":"77011111","notas":null}}
 ✅ R1) restore: cero filas del run en caballerizas/propietarios/responsables/spcs/usuarios/profesionales/reuniones 9985; spcs antes = después  → {"caballerizas":0,"propietarios":0,"responsables":0,"spcs":0,"usuarios":0,"profesionales":0,"reuniones":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline CLAUDE.md)  → spcs=210

21/22 OK
```

### cab_mut_M5.txt

```

── La UI (caballerizas.html extraída) ──
[rpc_caballeriza_provisorio] { message: 'P0001: Ya existe un propietario "X" en este hipódromo.' }

── El RPC (sesiones reales) ──

── Probe · caballeriza sin titular → provisorio ──
   html=/home/clio/dev/SGH/caballerizas.html  ·  rpc=rpc_caballeriza_provisorio_mut  ·  run=zneolm
 ✅ U1) validateResponsables: vacío OK · parcial (sólo apellido / sin DNI) ERROR · completo OK · co-prop parcial ERROR  → vacio=null parcial=Si cargás el propietario, completá apellido, nombre y DNI. Si todavía no lo sabés, dejá los tres vacíos: se crea un propietario provisorio con el nombre de la caballeriza.
 ✅ U2) ALTA con titular vacío → inserta la caballeriza, NO inserta responsables y llama a rpc_caballeriza_provisorio con el id nuevo; toast dice "provisorio"  → rpc=1 toasts=["Caballeriza creada con propietario provisorio «PRO"]
 ✅ U3) EDICIÓN sin tocar el bloque (titular provisorio prellenado: nombre sin DNI) → guarda la caballeriza, NO toca caballeriza_responsables, NO valida, NO llama al RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-zneolm\",\"telefono\":\"2245-1\",\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})"] toasts=["Caballeriza actualizada"]
 ✅ U4) EDICIÓN con titular nuevo completo → delete + insert en caballeriza_responsables (camino actual), sin RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-zneolm\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","profesionales:select(id)","caballeriza_responsables:insert([{\"caballeriza_id\":\"CAB-1\",\"profesional_id\":null,\"apellido\":\"PEREZ\",\"nombre\":\"JUAN\",\"documento_nro\":\"12345678\",\"fecha_nacimiento\":null,\"localidad\":null,\"rol\":\"propietario\",\"activo\":true}])","caballerizas:update({\"responsable\":\"PEREZ JUAN (propietario)\"})"]
 ✅ U5) EDICIÓN vaciando el titular → delete de responsables + rpc_caballeriza_provisorio (no queda huérfana)  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-zneolm\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","rpc:rpc_caballeriza_provisorio:{\"p_caballeriza_id\":\"CAB-1\"}"]
 ✅ U5b) si el RPC falla, el toast lo dice ("quedó SIN propietario: …") y la caballeriza ya está creada  → ["Caballeriza creada, pero quedó SIN propietario: Ya existe un propietario \"X\" en "]
 ✅ U6) esProvisorio: marcas "provisorio R8 15/08" / "provisorio R9 11/09" / "provisorio alta 16/09/2026" → true; "ex provisorio … completado" → false; sin propietario embebido: sin DNI y sin apellido → true, con DNI → false
 ✅ U7) el HTML: sólo f-nombre es required; el propietario ya no lleva asterisco; hay hint de provisorio y aviso rp-provisorio-aviso
 ✅ U8) openModal pide propietarios(notas) al cargar responsables y toma el snapshot responsablesAlCargar
 ✅ F0) fixture: cA con 2 inscripciones sin propietario (la caballeriza no tiene titular → el trigger dejó NULL) y 1 con propietario real  → {"i1":{"propietario_id":null,"estado":"inscripto","numero_partidor":null,"caballeriza_id":"73810850-5cd5-4cef-a96a-d1367ef41d8e"},"i2":{"propietario_id":null,"estado":"ratificado","numero_partidor":3,"caballeriza_id":"73810850-5cd5-4cef-a96a-d1367ef41d8e"},"i3":{"propietario_id":"c059d774-c9ef-4cc1-a336-bf68cd3aae16","estado":"inscripto","numero_partidor":null,"caballeriza_id":"73810850-5cd5-4cef-a96a-d1367ef41d8e"}}
 ✅ A1) staff crea el provisorio: ok, creado=true; 1 vínculo rol propietario activo SIN DNI apuntando a un propietarios tipo persona, nombre = caballeriza, sin documento, notas "provisorio alta DD/MM/YYYY", activo; responsable legado seteado  → ok=true msg=null data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":true,"propietario_id":"178f705a-bc51-428d-8cf3-47445ed2b512","responsable_id":"0d5155ef-9e10-4747-99f0-495a01142660","inscripciones_rederivadas":2} titular=[{"id":"0d5155ef-9e10-4747-99f0-495a01142660","propietario_id":"178f705a-bc51-428d-8cf3-47445ed2b512","documento_nro":null,"apellido":null,"nombre":"PROBE-CAB-A-zneolm","rol":"propietario","activo":true,"propietarios":{"tipo":"persona","notas":"provisorio alta 16/09/2026","activo":true,"nombre":"PROBE-CAB-A-zneolm","documento_nro":null}}] responsable=PROBE-CAB-A-zneolm (propietario provisorio)
 ✅ A3) re-deriva las 2 inscripciones sin propietario al provisorio (inscripciones_rederivadas=2); la que tenía propietario real queda intacta; estado/partidor intactos  → {"i1":{"propietario_id":"178f705a-bc51-428d-8cf3-47445ed2b512","estado":"inscripto","numero_partidor":null,"caballeriza_id":"73810850-5cd5-4cef-a96a-d1367ef41d8e"},"i2":{"propietario_id":"178f705a-bc51-428d-8cf3-47445ed2b512","estado":"ratificado","numero_partidor":3,"caballeriza_id":"73810850-5cd5-4cef-a96a-d1367ef41d8e"},"i3":{"propietario_id":"c059d774-c9ef-4cc1-a336-bf68cd3aae16","estado":"inscripto","numero_partidor":null,"caballeriza_id":"73810850-5cd5-4cef-a96a-d1367ef41d8e"}}
 ✅ A2) segunda llamada: creado=false, motivo "ya tiene titular"; sigue habiendo 1 vínculo y 1 propietario con ese nombre  → data={"ok":true,"creado":false,"motivo":"ya tiene titular","propietario_id":"178f705a-bc51-428d-8cf3-47445ed2b512","inscripciones_rederivadas":0} vinculos=1 props=1
 ❌ A4) caballeriza homónima sin titular: reusa el mismo provisorio (creado=false, mismo propietario_id), vínculo nuevo; sigue habiendo 1 propietario con ese nombre  → data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":true,"propietario_id":"a123adef-5630-4402-b45b-09bcea3bc750","responsable_id":"6a8aea27-e4aa-46ca-9200-9174a6835272","inscripciones_rederivadas":0} props=2
 ✅ A5) existe un propietario REAL con el nombre de la caballeriza → error "Ya existe un propietario"; sin vínculo, sin provisorio nuevo  → msg=Ya existe un propietario "PROBE-CAB-REAL-zneolm" en este hipódromo. Cargalo como titular (apellido, nombre y DNI) en vez de crear un provisorio. vinculos=0 props=1
 ✅ A6) sesión de PORTAL → "No autorizado"; sin vínculo  → msg=No autorizado: esta operación es de la secretaría.
 ✅ A7) staff de OTRO club → "otro hipódromo"; sin vínculo  → msg=Esa caballeriza es de otro hipódromo.
 ✅ A8) caballeriza inexistente → "no existe"  → msg=La caballeriza no existe.
 ✅ A9) después del RPC, una inscripción nueva en esa caballeriza nace con propietario_id = provisorio (trg_insc_set_propietario)  → {"propietario_id":"178f705a-bc51-428d-8cf3-47445ed2b512","estado":"inscripto","numero_partidor":null,"caballeriza_id":"73810850-5cd5-4cef-a96a-d1367ef41d8e"}
 ✅ A0) caballeriza (nombre/club/activo) y el propietario REAL de probe no cambiaron  → {"cabA2":{"nombre":"PROBE-CAB-A-zneolm","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},"pReal":{"nombre":"PROBE-CAB-REAL-zneolm","documento_nro":"77111111","notas":null}}
 ✅ R1) restore: cero filas del run en caballerizas/propietarios/responsables/spcs/usuarios/profesionales/reuniones 9985; spcs antes = después  → {"caballerizas":0,"propietarios":0,"responsables":0,"spcs":0,"usuarios":0,"profesionales":0,"reuniones":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline CLAUDE.md)  → spcs=210

21/22 OK
```

### cab_mut_M6.txt

```

── La UI (caballerizas.html extraída) ──
[rpc_caballeriza_provisorio] { message: 'P0001: Ya existe un propietario "X" en este hipódromo.' }

── El RPC (sesiones reales) ──

── Probe · caballeriza sin titular → provisorio ──
   html=/home/clio/dev/SGH/caballerizas.html  ·  rpc=rpc_caballeriza_provisorio_mut  ·  run=uw6yde
 ✅ U1) validateResponsables: vacío OK · parcial (sólo apellido / sin DNI) ERROR · completo OK · co-prop parcial ERROR  → vacio=null parcial=Si cargás el propietario, completá apellido, nombre y DNI. Si todavía no lo sabés, dejá los tres vacíos: se crea un propietario provisorio con el nombre de la caballeriza.
 ✅ U2) ALTA con titular vacío → inserta la caballeriza, NO inserta responsables y llama a rpc_caballeriza_provisorio con el id nuevo; toast dice "provisorio"  → rpc=1 toasts=["Caballeriza creada con propietario provisorio «PRO"]
 ✅ U3) EDICIÓN sin tocar el bloque (titular provisorio prellenado: nombre sin DNI) → guarda la caballeriza, NO toca caballeriza_responsables, NO valida, NO llama al RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-uw6yde\",\"telefono\":\"2245-1\",\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})"] toasts=["Caballeriza actualizada"]
 ✅ U4) EDICIÓN con titular nuevo completo → delete + insert en caballeriza_responsables (camino actual), sin RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-uw6yde\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","profesionales:select(id)","caballeriza_responsables:insert([{\"caballeriza_id\":\"CAB-1\",\"profesional_id\":null,\"apellido\":\"PEREZ\",\"nombre\":\"JUAN\",\"documento_nro\":\"12345678\",\"fecha_nacimiento\":null,\"localidad\":null,\"rol\":\"propietario\",\"activo\":true}])","caballerizas:update({\"responsable\":\"PEREZ JUAN (propietario)\"})"]
 ✅ U5) EDICIÓN vaciando el titular → delete de responsables + rpc_caballeriza_provisorio (no queda huérfana)  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-uw6yde\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","rpc:rpc_caballeriza_provisorio:{\"p_caballeriza_id\":\"CAB-1\"}"]
 ✅ U5b) si el RPC falla, el toast lo dice ("quedó SIN propietario: …") y la caballeriza ya está creada  → ["Caballeriza creada, pero quedó SIN propietario: Ya existe un propietario \"X\" en "]
 ✅ U6) esProvisorio: marcas "provisorio R8 15/08" / "provisorio R9 11/09" / "provisorio alta 16/09/2026" → true; "ex provisorio … completado" → false; sin propietario embebido: sin DNI y sin apellido → true, con DNI → false
 ✅ U7) el HTML: sólo f-nombre es required; el propietario ya no lleva asterisco; hay hint de provisorio y aviso rp-provisorio-aviso
 ✅ U8) openModal pide propietarios(notas) al cargar responsables y toma el snapshot responsablesAlCargar
 ✅ F0) fixture: cA con 2 inscripciones sin propietario (la caballeriza no tiene titular → el trigger dejó NULL) y 1 con propietario real  → {"i1":{"propietario_id":null,"estado":"inscripto","numero_partidor":null,"caballeriza_id":"81ed4091-d59c-44d5-995f-40733ef4839f"},"i2":{"propietario_id":null,"estado":"ratificado","numero_partidor":3,"caballeriza_id":"81ed4091-d59c-44d5-995f-40733ef4839f"},"i3":{"propietario_id":"107e84d0-995c-4c4f-8f9e-3203835d430a","estado":"inscripto","numero_partidor":null,"caballeriza_id":"81ed4091-d59c-44d5-995f-40733ef4839f"}}
 ❌ A1) staff crea el provisorio: ok, creado=true; 1 vínculo rol propietario activo SIN DNI apuntando a un propietarios tipo persona, nombre = caballeriza, sin documento, notas "provisorio alta DD/MM/YYYY", activo; responsable legado seteado  → ok=true msg=null data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":true,"propietario_id":"420d015e-a81a-469a-aee0-9871517190c4","responsable_id":"e77c4f61-d80f-4ce7-9008-d443be779ff3","inscripciones_rederivadas":2} titular=[{"id":"e77c4f61-d80f-4ce7-9008-d443be779ff3","propietario_id":"a8e6292f-7c5b-4bea-915c-203f49642e07","documento_nro":"99999999","apellido":null,"nombre":"PROBE-CAB-A-uw6yde","rol":"propietario","activo":true,"propietarios":{"tipo":"persona","notas":null,"activo":true,"nombre":"PROBE-CAB-A-uw6yde","documento_nro":"99999999"}}] responsable=PROBE-CAB-A-uw6yde (propietario provisorio)
 ✅ A3) re-deriva las 2 inscripciones sin propietario al provisorio (inscripciones_rederivadas=2); la que tenía propietario real queda intacta; estado/partidor intactos  → {"i1":{"propietario_id":"420d015e-a81a-469a-aee0-9871517190c4","estado":"inscripto","numero_partidor":null,"caballeriza_id":"81ed4091-d59c-44d5-995f-40733ef4839f"},"i2":{"propietario_id":"420d015e-a81a-469a-aee0-9871517190c4","estado":"ratificado","numero_partidor":3,"caballeriza_id":"81ed4091-d59c-44d5-995f-40733ef4839f"},"i3":{"propietario_id":"107e84d0-995c-4c4f-8f9e-3203835d430a","estado":"inscripto","numero_partidor":null,"caballeriza_id":"81ed4091-d59c-44d5-995f-40733ef4839f"}}
 ❌ A2) segunda llamada: creado=false, motivo "ya tiene titular"; sigue habiendo 1 vínculo y 1 propietario con ese nombre  → data={"ok":true,"creado":false,"motivo":"ya tiene titular","propietario_id":"a8e6292f-7c5b-4bea-915c-203f49642e07","inscripciones_rederivadas":0} vinculos=1 props=2
 ❌ A4) caballeriza homónima sin titular: reusa el mismo provisorio (creado=false, mismo propietario_id), vínculo nuevo; sigue habiendo 1 propietario con ese nombre  → data=null props=2
 ✅ A5) existe un propietario REAL con el nombre de la caballeriza → error "Ya existe un propietario"; sin vínculo, sin provisorio nuevo  → msg=Ya existe un propietario "PROBE-CAB-REAL-uw6yde" en este hipódromo. Cargalo como titular (apellido, nombre y DNI) en vez de crear un provisorio. vinculos=0 props=1
 ✅ A6) sesión de PORTAL → "No autorizado"; sin vínculo  → msg=No autorizado: esta operación es de la secretaría.
 ✅ A7) staff de OTRO club → "otro hipódromo"; sin vínculo  → msg=Esa caballeriza es de otro hipódromo.
 ✅ A8) caballeriza inexistente → "no existe"  → msg=La caballeriza no existe.
 ❌ A9) después del RPC, una inscripción nueva en esa caballeriza nace con propietario_id = provisorio (trg_insc_set_propietario)  → {"propietario_id":"a8e6292f-7c5b-4bea-915c-203f49642e07","estado":"inscripto","numero_partidor":null,"caballeriza_id":"81ed4091-d59c-44d5-995f-40733ef4839f"}
 ✅ A0) caballeriza (nombre/club/activo) y el propietario REAL de probe no cambiaron  → {"cabA2":{"nombre":"PROBE-CAB-A-uw6yde","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},"pReal":{"nombre":"PROBE-CAB-REAL-uw6yde","documento_nro":"77611111","notas":null}}
 ✅ R1) restore: cero filas del run en caballerizas/propietarios/responsables/spcs/usuarios/profesionales/reuniones 9985; spcs antes = después  → {"caballerizas":0,"propietarios":0,"responsables":0,"spcs":0,"usuarios":0,"profesionales":0,"reuniones":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline CLAUDE.md)  → spcs=210

18/22 OK
```

### cab_mut_M7.txt

```

── La UI (caballerizas.html extraída) ──
[rpc_caballeriza_provisorio] { message: 'P0001: Ya existe un propietario "X" en este hipódromo.' }

── El RPC (sesiones reales) ──

── Probe · caballeriza sin titular → provisorio ──
   html=/home/clio/dev/SGH/caballerizas.html  ·  rpc=rpc_caballeriza_provisorio_mut  ·  run=bkvs8k
 ✅ U1) validateResponsables: vacío OK · parcial (sólo apellido / sin DNI) ERROR · completo OK · co-prop parcial ERROR  → vacio=null parcial=Si cargás el propietario, completá apellido, nombre y DNI. Si todavía no lo sabés, dejá los tres vacíos: se crea un propietario provisorio con el nombre de la caballeriza.
 ✅ U2) ALTA con titular vacío → inserta la caballeriza, NO inserta responsables y llama a rpc_caballeriza_provisorio con el id nuevo; toast dice "provisorio"  → rpc=1 toasts=["Caballeriza creada con propietario provisorio «PRO"]
 ✅ U3) EDICIÓN sin tocar el bloque (titular provisorio prellenado: nombre sin DNI) → guarda la caballeriza, NO toca caballeriza_responsables, NO valida, NO llama al RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-bkvs8k\",\"telefono\":\"2245-1\",\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})"] toasts=["Caballeriza actualizada"]
 ✅ U4) EDICIÓN con titular nuevo completo → delete + insert en caballeriza_responsables (camino actual), sin RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-bkvs8k\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","profesionales:select(id)","caballeriza_responsables:insert([{\"caballeriza_id\":\"CAB-1\",\"profesional_id\":null,\"apellido\":\"PEREZ\",\"nombre\":\"JUAN\",\"documento_nro\":\"12345678\",\"fecha_nacimiento\":null,\"localidad\":null,\"rol\":\"propietario\",\"activo\":true}])","caballerizas:update({\"responsable\":\"PEREZ JUAN (propietario)\"})"]
 ✅ U5) EDICIÓN vaciando el titular → delete de responsables + rpc_caballeriza_provisorio (no queda huérfana)  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-bkvs8k\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","rpc:rpc_caballeriza_provisorio:{\"p_caballeriza_id\":\"CAB-1\"}"]
 ✅ U5b) si el RPC falla, el toast lo dice ("quedó SIN propietario: …") y la caballeriza ya está creada  → ["Caballeriza creada, pero quedó SIN propietario: Ya existe un propietario \"X\" en "]
 ✅ U6) esProvisorio: marcas "provisorio R8 15/08" / "provisorio R9 11/09" / "provisorio alta 16/09/2026" → true; "ex provisorio … completado" → false; sin propietario embebido: sin DNI y sin apellido → true, con DNI → false
 ✅ U7) el HTML: sólo f-nombre es required; el propietario ya no lleva asterisco; hay hint de provisorio y aviso rp-provisorio-aviso
 ✅ U8) openModal pide propietarios(notas) al cargar responsables y toma el snapshot responsablesAlCargar
 ✅ F0) fixture: cA con 2 inscripciones sin propietario (la caballeriza no tiene titular → el trigger dejó NULL) y 1 con propietario real  → {"i1":{"propietario_id":null,"estado":"inscripto","numero_partidor":null,"caballeriza_id":"b4807327-d2a6-4b48-881d-5b8f2b00a88c"},"i2":{"propietario_id":null,"estado":"ratificado","numero_partidor":3,"caballeriza_id":"b4807327-d2a6-4b48-881d-5b8f2b00a88c"},"i3":{"propietario_id":"13ca541a-e54c-4a29-b1d0-29eebd82e7be","estado":"inscripto","numero_partidor":null,"caballeriza_id":"b4807327-d2a6-4b48-881d-5b8f2b00a88c"}}
 ✅ A1) staff crea el provisorio: ok, creado=true; 1 vínculo rol propietario activo SIN DNI apuntando a un propietarios tipo persona, nombre = caballeriza, sin documento, notas "provisorio alta DD/MM/YYYY", activo; responsable legado seteado  → ok=true msg=null data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":true,"propietario_id":"f1883a43-fb8d-4ca0-98a6-ca50e9306ad9","responsable_id":"b8e8e722-e36c-47fb-b861-7fd9b29f4995","inscripciones_rederivadas":0} titular=[{"id":"b8e8e722-e36c-47fb-b861-7fd9b29f4995","propietario_id":"f1883a43-fb8d-4ca0-98a6-ca50e9306ad9","documento_nro":null,"apellido":null,"nombre":"PROBE-CAB-A-bkvs8k","rol":"propietario","activo":true,"propietarios":{"tipo":"persona","notas":"provisorio alta 16/09/2026","activo":true,"nombre":"PROBE-CAB-A-bkvs8k","documento_nro":null}}] responsable=PROBE-CAB-A-bkvs8k (propietario provisorio)
 ❌ A3) re-deriva las 2 inscripciones sin propietario al provisorio (inscripciones_rederivadas=2); la que tenía propietario real queda intacta; estado/partidor intactos  → {"i1":{"propietario_id":null,"estado":"inscripto","numero_partidor":null,"caballeriza_id":"b4807327-d2a6-4b48-881d-5b8f2b00a88c"},"i2":{"propietario_id":null,"estado":"ratificado","numero_partidor":3,"caballeriza_id":"b4807327-d2a6-4b48-881d-5b8f2b00a88c"},"i3":{"propietario_id":"13ca541a-e54c-4a29-b1d0-29eebd82e7be","estado":"inscripto","numero_partidor":null,"caballeriza_id":"b4807327-d2a6-4b48-881d-5b8f2b00a88c"}}
 ✅ A2) segunda llamada: creado=false, motivo "ya tiene titular"; sigue habiendo 1 vínculo y 1 propietario con ese nombre  → data={"ok":true,"creado":false,"motivo":"ya tiene titular","propietario_id":"f1883a43-fb8d-4ca0-98a6-ca50e9306ad9","inscripciones_rederivadas":0} vinculos=1 props=1
 ✅ A4) caballeriza homónima sin titular: reusa el mismo provisorio (creado=false, mismo propietario_id), vínculo nuevo; sigue habiendo 1 propietario con ese nombre  → data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":false,"propietario_id":"f1883a43-fb8d-4ca0-98a6-ca50e9306ad9","responsable_id":"354f91dd-05b1-402b-ac4c-69bf88668ca2","inscripciones_rederivadas":0} props=1
 ✅ A5) existe un propietario REAL con el nombre de la caballeriza → error "Ya existe un propietario"; sin vínculo, sin provisorio nuevo  → msg=Ya existe un propietario "PROBE-CAB-REAL-bkvs8k" en este hipódromo. Cargalo como titular (apellido, nombre y DNI) en vez de crear un provisorio. vinculos=0 props=1
 ✅ A6) sesión de PORTAL → "No autorizado"; sin vínculo  → msg=No autorizado: esta operación es de la secretaría.
 ✅ A7) staff de OTRO club → "otro hipódromo"; sin vínculo  → msg=Esa caballeriza es de otro hipódromo.
 ✅ A8) caballeriza inexistente → "no existe"  → msg=La caballeriza no existe.
 ✅ A9) después del RPC, una inscripción nueva en esa caballeriza nace con propietario_id = provisorio (trg_insc_set_propietario)  → {"propietario_id":"f1883a43-fb8d-4ca0-98a6-ca50e9306ad9","estado":"inscripto","numero_partidor":null,"caballeriza_id":"b4807327-d2a6-4b48-881d-5b8f2b00a88c"}
 ✅ A0) caballeriza (nombre/club/activo) y el propietario REAL de probe no cambiaron  → {"cabA2":{"nombre":"PROBE-CAB-A-bkvs8k","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},"pReal":{"nombre":"PROBE-CAB-REAL-bkvs8k","documento_nro":"77811111","notas":null}}
 ✅ R1) restore: cero filas del run en caballerizas/propietarios/responsables/spcs/usuarios/profesionales/reuniones 9985; spcs antes = después  → {"caballerizas":0,"propietarios":0,"responsables":0,"spcs":0,"usuarios":0,"profesionales":0,"reuniones":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline CLAUDE.md)  → spcs=210

21/22 OK
```

### cab_mut_M8.txt

```

── La UI (caballerizas.html extraída) ──
[rpc_caballeriza_provisorio] { message: 'P0001: Ya existe un propietario "X" en este hipódromo.' }

── El RPC (sesiones reales) ──

── Probe · caballeriza sin titular → provisorio ──
   html=/home/clio/dev/SGH/caballerizas.html  ·  rpc=rpc_caballeriza_provisorio_mut  ·  run=x6uejx
 ✅ U1) validateResponsables: vacío OK · parcial (sólo apellido / sin DNI) ERROR · completo OK · co-prop parcial ERROR  → vacio=null parcial=Si cargás el propietario, completá apellido, nombre y DNI. Si todavía no lo sabés, dejá los tres vacíos: se crea un propietario provisorio con el nombre de la caballeriza.
 ✅ U2) ALTA con titular vacío → inserta la caballeriza, NO inserta responsables y llama a rpc_caballeriza_provisorio con el id nuevo; toast dice "provisorio"  → rpc=1 toasts=["Caballeriza creada con propietario provisorio «PRO"]
 ✅ U3) EDICIÓN sin tocar el bloque (titular provisorio prellenado: nombre sin DNI) → guarda la caballeriza, NO toca caballeriza_responsables, NO valida, NO llama al RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-x6uejx\",\"telefono\":\"2245-1\",\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})"] toasts=["Caballeriza actualizada"]
 ✅ U4) EDICIÓN con titular nuevo completo → delete + insert en caballeriza_responsables (camino actual), sin RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-x6uejx\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","profesionales:select(id)","caballeriza_responsables:insert([{\"caballeriza_id\":\"CAB-1\",\"profesional_id\":null,\"apellido\":\"PEREZ\",\"nombre\":\"JUAN\",\"documento_nro\":\"12345678\",\"fecha_nacimiento\":null,\"localidad\":null,\"rol\":\"propietario\",\"activo\":true}])","caballerizas:update({\"responsable\":\"PEREZ JUAN (propietario)\"})"]
 ✅ U5) EDICIÓN vaciando el titular → delete de responsables + rpc_caballeriza_provisorio (no queda huérfana)  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-x6uejx\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","rpc:rpc_caballeriza_provisorio:{\"p_caballeriza_id\":\"CAB-1\"}"]
 ✅ U5b) si el RPC falla, el toast lo dice ("quedó SIN propietario: …") y la caballeriza ya está creada  → ["Caballeriza creada, pero quedó SIN propietario: Ya existe un propietario \"X\" en "]
 ✅ U6) esProvisorio: marcas "provisorio R8 15/08" / "provisorio R9 11/09" / "provisorio alta 16/09/2026" → true; "ex provisorio … completado" → false; sin propietario embebido: sin DNI y sin apellido → true, con DNI → false
 ✅ U7) el HTML: sólo f-nombre es required; el propietario ya no lleva asterisco; hay hint de provisorio y aviso rp-provisorio-aviso
 ✅ U8) openModal pide propietarios(notas) al cargar responsables y toma el snapshot responsablesAlCargar
 ✅ F0) fixture: cA con 2 inscripciones sin propietario (la caballeriza no tiene titular → el trigger dejó NULL) y 1 con propietario real  → {"i1":{"propietario_id":null,"estado":"inscripto","numero_partidor":null,"caballeriza_id":"d302e1b4-29f6-45a0-9330-81ba3434b620"},"i2":{"propietario_id":null,"estado":"ratificado","numero_partidor":3,"caballeriza_id":"d302e1b4-29f6-45a0-9330-81ba3434b620"},"i3":{"propietario_id":"145a6f5e-f7de-4ed8-a043-33581ae67a57","estado":"inscripto","numero_partidor":null,"caballeriza_id":"d302e1b4-29f6-45a0-9330-81ba3434b620"}}
 ✅ A1) staff crea el provisorio: ok, creado=true; 1 vínculo rol propietario activo SIN DNI apuntando a un propietarios tipo persona, nombre = caballeriza, sin documento, notas "provisorio alta DD/MM/YYYY", activo; responsable legado seteado  → ok=true msg=null data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":true,"propietario_id":"5f64eaf5-6306-46cd-adb1-5c6e65eeae93","responsable_id":"fb0a9ead-2c71-4d50-a759-43c3f3429365","inscripciones_rederivadas":3} titular=[{"id":"fb0a9ead-2c71-4d50-a759-43c3f3429365","propietario_id":"5f64eaf5-6306-46cd-adb1-5c6e65eeae93","documento_nro":null,"apellido":null,"nombre":"PROBE-CAB-A-x6uejx","rol":"propietario","activo":true,"propietarios":{"tipo":"persona","notas":"provisorio alta 16/09/2026","activo":true,"nombre":"PROBE-CAB-A-x6uejx","documento_nro":null}}] responsable=PROBE-CAB-A-x6uejx (propietario provisorio)
 ❌ A3) re-deriva las 2 inscripciones sin propietario al provisorio (inscripciones_rederivadas=2); la que tenía propietario real queda intacta; estado/partidor intactos  → {"i1":{"propietario_id":"5f64eaf5-6306-46cd-adb1-5c6e65eeae93","estado":"inscripto","numero_partidor":null,"caballeriza_id":"d302e1b4-29f6-45a0-9330-81ba3434b620"},"i2":{"propietario_id":"5f64eaf5-6306-46cd-adb1-5c6e65eeae93","estado":"ratificado","numero_partidor":3,"caballeriza_id":"d302e1b4-29f6-45a0-9330-81ba3434b620"},"i3":{"propietario_id":"5f64eaf5-6306-46cd-adb1-5c6e65eeae93","estado":"inscripto","numero_partidor":null,"caballeriza_id":"d302e1b4-29f6-45a0-9330-81ba3434b620"}}
 ✅ A2) segunda llamada: creado=false, motivo "ya tiene titular"; sigue habiendo 1 vínculo y 1 propietario con ese nombre  → data={"ok":true,"creado":false,"motivo":"ya tiene titular","propietario_id":"5f64eaf5-6306-46cd-adb1-5c6e65eeae93","inscripciones_rederivadas":0} vinculos=1 props=1
 ✅ A4) caballeriza homónima sin titular: reusa el mismo provisorio (creado=false, mismo propietario_id), vínculo nuevo; sigue habiendo 1 propietario con ese nombre  → data={"ok":true,"marca":"provisorio alta 16/09/2026","creado":false,"propietario_id":"5f64eaf5-6306-46cd-adb1-5c6e65eeae93","responsable_id":"b229218b-40f5-4124-8261-4fd2732b9a97","inscripciones_rederivadas":0} props=1
 ✅ A5) existe un propietario REAL con el nombre de la caballeriza → error "Ya existe un propietario"; sin vínculo, sin provisorio nuevo  → msg=Ya existe un propietario "PROBE-CAB-REAL-x6uejx" en este hipódromo. Cargalo como titular (apellido, nombre y DNI) en vez de crear un provisorio. vinculos=0 props=1
 ✅ A6) sesión de PORTAL → "No autorizado"; sin vínculo  → msg=No autorizado: esta operación es de la secretaría.
 ✅ A7) staff de OTRO club → "otro hipódromo"; sin vínculo  → msg=Esa caballeriza es de otro hipódromo.
 ✅ A8) caballeriza inexistente → "no existe"  → msg=La caballeriza no existe.
 ✅ A9) después del RPC, una inscripción nueva en esa caballeriza nace con propietario_id = provisorio (trg_insc_set_propietario)  → {"propietario_id":"5f64eaf5-6306-46cd-adb1-5c6e65eeae93","estado":"inscripto","numero_partidor":null,"caballeriza_id":"d302e1b4-29f6-45a0-9330-81ba3434b620"}
 ✅ A0) caballeriza (nombre/club/activo) y el propietario REAL de probe no cambiaron  → {"cabA2":{"nombre":"PROBE-CAB-A-x6uejx","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},"pReal":{"nombre":"PROBE-CAB-REAL-x6uejx","documento_nro":"77611111","notas":null}}
 ✅ R1) restore: cero filas del run en caballerizas/propietarios/responsables/spcs/usuarios/profesionales/reuniones 9985; spcs antes = después  → {"caballerizas":0,"propietarios":0,"responsables":0,"spcs":0,"usuarios":0,"profesionales":0,"reuniones":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline CLAUDE.md)  → spcs=210

21/22 OK
```

### cab_mut_M9.txt

```

── La UI (caballerizas.html extraída) ──
[rpc_caballeriza_provisorio] { message: 'P0001: Ya existe un propietario "X" en este hipódromo.' }

── El RPC (sesiones reales) ──

── Probe · caballeriza sin titular → provisorio ──
   html=/home/clio/dev/SGH/caballerizas.html  ·  rpc=rpc_caballeriza_provisorio_mut  ·  run=o5k1hm
 ✅ U1) validateResponsables: vacío OK · parcial (sólo apellido / sin DNI) ERROR · completo OK · co-prop parcial ERROR  → vacio=null parcial=Si cargás el propietario, completá apellido, nombre y DNI. Si todavía no lo sabés, dejá los tres vacíos: se crea un propietario provisorio con el nombre de la caballeriza.
 ✅ U2) ALTA con titular vacío → inserta la caballeriza, NO inserta responsables y llama a rpc_caballeriza_provisorio con el id nuevo; toast dice "provisorio"  → rpc=1 toasts=["Caballeriza creada con propietario provisorio «PRO"]
 ✅ U3) EDICIÓN sin tocar el bloque (titular provisorio prellenado: nombre sin DNI) → guarda la caballeriza, NO toca caballeriza_responsables, NO valida, NO llama al RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-o5k1hm\",\"telefono\":\"2245-1\",\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})"] toasts=["Caballeriza actualizada"]
 ✅ U4) EDICIÓN con titular nuevo completo → delete + insert en caballeriza_responsables (camino actual), sin RPC  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-o5k1hm\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","profesionales:select(id)","caballeriza_responsables:insert([{\"caballeriza_id\":\"CAB-1\",\"profesional_id\":null,\"apellido\":\"PEREZ\",\"nombre\":\"JUAN\",\"documento_nro\":\"12345678\",\"fecha_nacimiento\":null,\"localidad\":null,\"rol\":\"propietario\",\"activo\":true}])","caballerizas:update({\"responsable\":\"PEREZ JUAN (propietario)\"})"]
 ✅ U5) EDICIÓN vaciando el titular → delete de responsables + rpc_caballeriza_provisorio (no queda huérfana)  → calls=["caballerizas:update({\"club_id\":\"0649e9c5-9e87-4aad-842f-101458e6b33c\",\"nombre\":\"PROBE-CAB-o5k1hm\",\"telefono\":null,\"estado\":\"activo\",\"activo\":true,\"notas\":null,\"hipodromo_patente\":\"DOL\",\"chaquetilla_descripcion\":null,\"chaquetilla_url\":null})","caballeriza_responsables:delete()","rpc:rpc_caballeriza_provisorio:{\"p_caballeriza_id\":\"CAB-1\"}"]
 ✅ U5b) si el RPC falla, el toast lo dice ("quedó SIN propietario: …") y la caballeriza ya está creada  → ["Caballeriza creada, pero quedó SIN propietario: Ya existe un propietario \"X\" en "]
 ✅ U6) esProvisorio: marcas "provisorio R8 15/08" / "provisorio R9 11/09" / "provisorio alta 16/09/2026" → true; "ex provisorio … completado" → false; sin propietario embebido: sin DNI y sin apellido → true, con DNI → false
 ✅ U7) el HTML: sólo f-nombre es required; el propietario ya no lleva asterisco; hay hint de provisorio y aviso rp-provisorio-aviso
 ✅ U8) openModal pide propietarios(notas) al cargar responsables y toma el snapshot responsablesAlCargar
 ✅ F0) fixture: cA con 2 inscripciones sin propietario (la caballeriza no tiene titular → el trigger dejó NULL) y 1 con propietario real  → {"i1":{"propietario_id":null,"estado":"inscripto","numero_partidor":null,"caballeriza_id":"c7f939e1-b5dc-4c8a-9466-e33c1aae4036"},"i2":{"propietario_id":null,"estado":"ratificado","numero_partidor":3,"caballeriza_id":"c7f939e1-b5dc-4c8a-9466-e33c1aae4036"},"i3":{"propietario_id":"3d8d7141-a09b-4611-8ded-39225ed8d37b","estado":"inscripto","numero_partidor":null,"caballeriza_id":"c7f939e1-b5dc-4c8a-9466-e33c1aae4036"}}
 ❌ A1) staff crea el provisorio: ok, creado=true; 1 vínculo rol propietario activo SIN DNI apuntando a un propietarios tipo persona, nombre = caballeriza, sin documento, notas "provisorio alta DD/MM/YYYY", activo; responsable legado seteado  → ok=true msg=null data={"ok":true,"marca":"alta provisoria 16/09/2026","creado":true,"propietario_id":"ef6de43c-fcf7-454e-83c7-33ba13009bad","responsable_id":"7f31b3c5-deef-4d13-a0f8-50b5227d8cee","inscripciones_rederivadas":2} titular=[{"id":"7f31b3c5-deef-4d13-a0f8-50b5227d8cee","propietario_id":"ef6de43c-fcf7-454e-83c7-33ba13009bad","documento_nro":null,"apellido":null,"nombre":"PROBE-CAB-A-o5k1hm","rol":"propietario","activo":true,"propietarios":{"tipo":"persona","notas":"alta provisoria 16/09/2026","activo":true,"nombre":"PROBE-CAB-A-o5k1hm","documento_nro":null}}] responsable=PROBE-CAB-A-o5k1hm (propietario provisorio)
 ✅ A3) re-deriva las 2 inscripciones sin propietario al provisorio (inscripciones_rederivadas=2); la que tenía propietario real queda intacta; estado/partidor intactos  → {"i1":{"propietario_id":"ef6de43c-fcf7-454e-83c7-33ba13009bad","estado":"inscripto","numero_partidor":null,"caballeriza_id":"c7f939e1-b5dc-4c8a-9466-e33c1aae4036"},"i2":{"propietario_id":"ef6de43c-fcf7-454e-83c7-33ba13009bad","estado":"ratificado","numero_partidor":3,"caballeriza_id":"c7f939e1-b5dc-4c8a-9466-e33c1aae4036"},"i3":{"propietario_id":"3d8d7141-a09b-4611-8ded-39225ed8d37b","estado":"inscripto","numero_partidor":null,"caballeriza_id":"c7f939e1-b5dc-4c8a-9466-e33c1aae4036"}}
 ✅ A2) segunda llamada: creado=false, motivo "ya tiene titular"; sigue habiendo 1 vínculo y 1 propietario con ese nombre  → data={"ok":true,"creado":false,"motivo":"ya tiene titular","propietario_id":"ef6de43c-fcf7-454e-83c7-33ba13009bad","inscripciones_rederivadas":0} vinculos=1 props=1
 ❌ A4) caballeriza homónima sin titular: reusa el mismo provisorio (creado=false, mismo propietario_id), vínculo nuevo; sigue habiendo 1 propietario con ese nombre  → data=null props=1
 ✅ A5) existe un propietario REAL con el nombre de la caballeriza → error "Ya existe un propietario"; sin vínculo, sin provisorio nuevo  → msg=Ya existe un propietario "PROBE-CAB-REAL-o5k1hm" en este hipódromo. Cargalo como titular (apellido, nombre y DNI) en vez de crear un provisorio. vinculos=0 props=1
 ✅ A6) sesión de PORTAL → "No autorizado"; sin vínculo  → msg=No autorizado: esta operación es de la secretaría.
 ✅ A7) staff de OTRO club → "otro hipódromo"; sin vínculo  → msg=Esa caballeriza es de otro hipódromo.
 ✅ A8) caballeriza inexistente → "no existe"  → msg=La caballeriza no existe.
 ✅ A9) después del RPC, una inscripción nueva en esa caballeriza nace con propietario_id = provisorio (trg_insc_set_propietario)  → {"propietario_id":"ef6de43c-fcf7-454e-83c7-33ba13009bad","estado":"inscripto","numero_partidor":null,"caballeriza_id":"c7f939e1-b5dc-4c8a-9466-e33c1aae4036"}
 ✅ A0) caballeriza (nombre/club/activo) y el propietario REAL de probe no cambiaron  → {"cabA2":{"nombre":"PROBE-CAB-A-o5k1hm","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},"pReal":{"nombre":"PROBE-CAB-REAL-o5k1hm","documento_nro":"77511111","notas":null}}
 ✅ R1) restore: cero filas del run en caballerizas/propietarios/responsables/spcs/usuarios/profesionales/reuniones 9985; spcs antes = después  → {"caballerizas":0,"propietarios":0,"responsables":0,"spcs":0,"usuarios":0,"profesionales":0,"reuniones":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline CLAUDE.md)  → spcs=210

20/22 OK
```

## 6. Limpieza y estado de la base (19:37:35 UTC)

```json
[{"k":"funciones_rpc_caballeriza%","v":"rpc_caballeriza_provisorio"},{"k":"gemelas_cualquiera","v":"(ninguna)"},
 {"k":"real_md5","v":"40de86921ac5625d8b05b71ea1bff492"},{"k":"real_guards","v":"true"},
 {"k":"schema_migrations_mut","v":"0"},{"k":"schema_migrations_ultima","v":"20260916192822 rpc_caballeriza_provisorio"},
 {"k":"spcs","v":"210"},{"k":"fixtures_probe_cab","v":"0"},
 {"k":"caballerizas 295/sin_titular 43 / propietarios 271 / provisorios 47 / responsables 270","v":"295/43 / 271 / 47 / 270"},
 {"k":"now","v":"2026-09-16 19:37:35.006534+00"}]
```

`real_guards` verifica en el texto vivo: tiene `IF NOT fn_is_staff()`, `provisorio alta `, `AND propietario_id IS NULL;`,
no tiene `IF false THEN` ni `99999999`. Ningún dato real tocado: los conteos son los del diagnóstico de las 18:50.

## 7. Verificación de publicación de la rama

```
$ git push origin feat/caballeriza-titular-opcional-provisorio
$ git rev-parse HEAD ; git ls-remote origin feat/caballeriza-titular-opcional-provisorio
e5c7094be19a814ae4c07d0c35eb4342ec699b38
e5c7094be19a814ae4c07d0c35eb4342ec699b38	refs/heads/feat/caballeriza-titular-opcional-provisorio
```

## 8. Después del OK

1. Merge `--no-ff` de la rama entera (A) — o `git merge --no-ff bb27e8b` si sólo va B (el RPC queda aplicado e inerte:
   nadie lo llama hasta que entre A).
2. md5 de `caballerizas.html` contra `sigh.com.ar`; `CABALLERIZAS_HTML=https://sigh.com.ar/caballerizas.html node
   tests/probe_caballeriza_provisorio.mjs` → 22/22 contra el HTML servido.
3. Operativo R9 con Yesi: las **8 caballerizas nuevas** de la planilla (`2026-09-16_cruce-planilla-r9-y-beast-party.md`
   §2.1) las crea ella con el form, sin titular → nacen con provisorio; **PARAJE LA TABLADA** → botón Crear provisorio
   (TIRSO T1 y GRAN RAUL T6 quedan con dueño); las 13 ratificadas sin caballeriza → les asigna el stud. Control: la query
   de CLAUDE.md tiene que dar 0. El `DO` ya no hace falta.

## 9. Preguntas abiertas

1. ¿Merge de A, o sólo B?
2. Las 4 caballerizas dudosas del cruce (HS EL ORIGEN / DON JORGE / SAUCE CORRIENTE / DON VENICIO): que Yesi confirme antes
   de crear duplicados — el form no avisa parecidos (ISSUE-080 §2).

## 10. Verificación de publicación

(se completa en el commit siguiente)
