# Ejecución — studbook-buscar, Pieza C (pantalla `spcs.html`) — 2026-09-11

**Fecha:** 2026-09-11 (noche)
**Rama de trabajo:** `feat/studbook-buscar` @ `9b364c0fe0c3713d943fa3668f8fc88a5dfb17b0` (pusheada, ver §6)
**Commits de la rama sobre `main` (`4f6ff13`):** `6646da4` pieza A · `c39f2fa` pieza B · **`9b364c0` pieza C**
**Plan:** `docs/diagnosticos/2026-09-11_plan-studbook-buscar-edge-function.md` §4
**Guards:** `pwd` = `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` = **203** (sin cambios: esta pieza no toca la base) · ref `unlhcuanfrtpatoipwve`

**NO está en prod.** `spcs.html` sólo cambió en la rama; `main` sigue igual. Deploy = merge con OK (después de D-pantalla y docs).

## 1. Qué se hizo (contra el plan §4)

| Plan | Qué | Dónde en `spcs.html` |
|---|---|---|
| 4.1 bloque de búsqueda, sólo en alta | `#sb-box` arriba del `form-grid` del tab Datos; `openModal(rec)` lo oculta si `rec` (edición). Input `#sb-term` (Enter = buscar) + botón `#sb-btn` + `#sb-fuente` (muestra el `fuente` que devuelve la función) | HTML 204-215, CSS 105-123, JS `sbReset` / `buscarStudBook` / `renderCandidatos` / `candidatoHTML` |
| 4.1 lista de candidatos | Por candidato: **nombre · dd/mm/yyyy (edad reglamentaria vía `edadSPCTexto`, ya cargado) · sexo · pelaje** + chips ⚠ de `alertas` / segunda línea **padre × madre · ab. mat. · SB id** / botón **Usar** | `candidatoHTML` |
| 4.1 reglas | 1 exacto → "1 coincidencia exacta", **no prellena** hasta Usar · N exactos → "N coincidencias exactas — elegí por fecha, sexo y padres" · 0 exactos + parciales → "Sin coincidencia exacta — parecidos" · 0/0 → "No está en el Stud Book con ese nombre. Probá con menos letras, o cargalo a mano." · 502 → "El Stud Book no responde. Cargalo a mano." · 403 → "sólo para la secretaría" · 400 → detalle de la función | `renderCandidatos`, `buscarStudBook` |
| 4.1 † si figura muerto | **No implementado**: el hit del autocomplete no trae ningún campo de muerto (`muerto=1` sólo incluye a los muertos en la búsqueda; ni `leyenda` ni otro campo lo marcan — verificado con `curl` sobre BIEN COQUETA, §4). Si Diego lo da en su API, es un campo más en `Candidato` y una línea acá | — |
| 4.2 prellenado | `usarCandidato(idx)`: `f-nombre`, `f-studbook-id`, `f-nacimiento`, `f-sexo-form` (si vino), `f-color`, `f-padrillo`, `f-madre`, `f-pais`, `f-notas` = `SB <id> · <url_perfil> · alta desde spcs.html DD/MM/YYYY · abuelo materno: X · (leyenda) · alertas Stud Book: …`. `f-abuela` **no** (el SB da abuelo, no abuela). `f-registro` no se toca. Marca el candidato elegido en verde; toast "Revisá y guardá" | `usarCandidato` |
| 4.2 `studbook_id` | Campo nuevo **visible y read-only** "Nº Stud Book (vínculo)" `#f-studbook-id` al lado de "N° Registro". Viaja en el payload como `studbook_id` (alta y edición; en edición muestra el existente) | HTML 224-230, `openModal`, `saveRecord` |
| 4.3 duplicados antes del INSERT | En `saveRecord()`, sólo alta y salvo `opts.omitirDuplicados`: `sb.rpc('rpc_spcs_duplicados', {p_studbook_id, p_nombre, p_fecha_nacimiento, p_padrillo, p_madre})`. Error del RPC → `console.error('[spcs.duplicados]')` + toast, **no inserta**. Con filas → `mostrarPanelDuplicados(dups)`, **no inserta** | `saveRecord` |
| 4.3 panel | `#dup-panel` (entre los tabs y el footer, visible en cualquier tab): una fila por hallazgo con motivo traducido (mismo nº Stud Book / mismo nombre / misma fecha y padres), nombre, fecha, sexo, estado, padre × madre, SB id, botón **Abrir esa ficha** (`openModal(rec)` del listado). Si algún motivo es `studbook_id` o `fecha_padre_madre` → texto "es el mismo animal", **sin** botón de guardar. Si el único motivo es `nombre` → botón **"Guardar igual (es otro caballo)"** → `saveRecord({omitirDuplicados:true})` | `mostrarPanelDuplicados`, `abrirFichaExistente`, `ocultarDuplicados` |
| 4.4 carga a mano sin buscar | El chequeo corre igual (sin `studbook_id` aplican los otros dos motivos) | `saveRecord` |
| 4.4 edición | Sin bloque de búsqueda; `studbook_id` read-only visible; el chequeo de duplicados **no** corre en UPDATE (igual que el plan) | `openModal`, `saveRecord` |

Nada cambia para el portal: `spcs.html` es de staff y la función devuelve 403 al portal (pieza B).

## 2. Verificación estática (sin browser — D-pantalla es la pieza que sigue)

```
$ awk '/^<script>$/{f=1;next}/^<\/script>$/{f=0}f' spcs.html > spcs_script.js && node --check spcs_script.js
SYNTAX_OK
$ wc -l spcs.html
763 spcs.html
$ git diff --stat   (antes del commit)
 spcs.html | 227 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 1 file changed, 226 insertions(+), 1 deletion(-)
```

Todos los `getElementById('…')` del script tienen su `id="…"` en el HTML (0 faltantes):

```
ok  auth-overlay
ok  btn-save
ok  cnt-activos
ok  cnt-castrados
ok  cnt-hembras
ok  cnt-machos
ok  cnt-total
ok  dup-actions
ok  dup-list
ok  dup-panel
ok  dup-texto
ok  f-abuela
ok  f-caballeriza-form
ok  f-color
ok  f-entrenador
ok  f-estado
ok  f-estado-spc
ok  f-jockey
ok  f-madre
ok  f-marcas
ok  f-nacimiento
ok  f-nombre
ok  f-notas
ok  f-padrillo
ok  f-pais
ok  f-registro
ok  f-sexo
ok  f-sexo-form
ok  f-studbook-id
ok  f-ult-perf
ok  list-container
ok  modal
ok  modal-title
ok  pct-total
ok  prop-list
ok  sb-box
ok  sb-btn
ok  sb-fuente
ok  sb-result
ok  sb-term
ok  search
ok  toast-container
ok  user-name
```

## 3. Diff completo `c39f2fa..9b364c0 -- spcs.html`

```diff
diff --git a/spcs.html b/spcs.html
index 2cf3852..b2ed3b1 100644
--- a/spcs.html
+++ b/spcs.html
@@ -102,6 +102,35 @@
     .toast-success { background: #1a4a30; border: 1px solid var(--success); color: var(--text); }
     .toast-error { background: #4a1a1a; border: 1px solid var(--danger); color: var(--text); }
     @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
+    /* STUD BOOK — búsqueda en el alta (Edge Function studbook-buscar) */
+    .sb-box { background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; }
+    .sb-box[hidden] { display: none; }
+    .sb-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
+    .sb-head .sb-title { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; flex: 0 0 100%; margin-bottom: 4px; }
+    .sb-head input { flex: 1; min-width: 180px; }
+    .sb-fuente { font-size: 11px; color: var(--muted); flex: 0 0 100%; margin-top: 4px; }
+    .sb-result { margin-top: 12px; font-size: 13px; }
+    .sb-result .sb-rotulo { color: var(--muted); font-size: 12px; margin: 8px 0 6px; }
+    .sb-cand { display: flex; gap: 10px; align-items: center; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 6px; background: rgba(0,0,0,0.15); }
+    .sb-cand .sb-cand-info { flex: 1; min-width: 0; }
+    .sb-cand .sb-cand-l1 { font-weight: 600; color: var(--text); }
+    .sb-cand .sb-cand-l1 .spc-name { font-size: 14px; }
+    .sb-cand .sb-cand-l2 { font-size: 12px; color: var(--muted); margin-top: 2px; }
+    .sb-cand.sb-elegido { border-color: var(--success); background: rgba(76,175,130,0.08); }
+    .sb-alerta { display: inline-block; padding: 1px 7px; border-radius: 20px; font-size: 10px; font-weight: 600; background: rgba(224,82,82,0.12); color: var(--danger); border: 1px solid rgba(224,82,82,0.35); margin-left: 6px; vertical-align: middle; }
+    .sb-msg { color: var(--muted); font-size: 13px; padding: 6px 0; }
+    .sb-msg.err { color: var(--danger); }
+    input[readonly] { color: var(--muted); border-style: dashed; cursor: default; }
+    /* DUPLICADOS — panel antes del INSERT (rpc_spcs_duplicados) */
+    .dup-panel { margin: 0 24px 16px; border: 1px solid rgba(224,82,82,0.4); background: rgba(224,82,82,0.07); border-radius: 12px; padding: 14px 16px; }
+    .dup-panel[hidden] { display: none; }
+    .dup-panel h3 { font-size: 15px; color: var(--danger); margin-bottom: 8px; }
+    .dup-panel p { font-size: 13px; color: var(--muted); margin-bottom: 10px; }
+    .dup-row { display: flex; gap: 10px; align-items: center; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 6px; background: rgba(0,0,0,0.2); font-size: 13px; }
+    .dup-row .dup-motivo { flex: 0 0 auto; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--danger); min-width: 130px; }
+    .dup-row .dup-info { flex: 1; min-width: 0; }
+    .dup-row .dup-info small { color: var(--muted); }
+    .dup-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px; }
     @media (max-width: 900px) { table { font-size: 12px; } thead th, tbody td { padding: 8px 10px; } }
     @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } .form-group.full { grid-column: 1; } }
     #auth-overlay { position:fixed;inset:0;background:var(--bg);z-index:9999;display:flex;align-items:center;justify-content:center; }
@@ -172,6 +201,18 @@
 
     <!-- TAB DATOS -->
     <div class="tab-panel active" id="tab-datos">
+      <!-- Búsqueda en el Stud Book: sólo en alta. Llama a la Edge Function studbook-buscar
+           (scraping del buscador público, no API — ver supabase/functions/studbook-buscar/index.ts).
+           Nunca elige sola: los homónimos vuelven todos y se elige acá con fecha/edad/sexo/pelaje/padres. -->
+      <div class="sb-box" id="sb-box" hidden>
+        <div class="sb-head">
+          <div class="sb-title">Buscar en el Stud Book</div>
+          <input type="text" id="sb-term" placeholder="Nombre del ejemplar (3 letras o más)" onkeydown="if(event.key==='Enter'){event.preventDefault();buscarStudBook();}">
+          <button type="button" class="btn-primary" id="sb-btn" onclick="buscarStudBook()">Buscar</button>
+          <div class="sb-fuente" id="sb-fuente">fuente: studbook.org.ar (buscador público)</div>
+        </div>
+        <div class="sb-result" id="sb-result"></div>
+      </div>
       <div class="form-grid">
         <div class="form-group full">
           <label>Nombre *</label>
@@ -181,6 +222,12 @@
           <label>N° Registro Stud Book</label>
           <input type="text" id="f-registro" placeholder="SB-XXXX">
         </div>
+        <div class="form-group">
+          <label>Nº Stud Book (vínculo)</label>
+          <!-- studbook_id: se llena al elegir un candidato; read-only para que no se tipee a mano
+               (el índice spcs_studbook_id_uniq frena un duplicado, pero no un número mal tipeado). -->
+          <input type="text" id="f-studbook-id" readonly placeholder="— se completa al elegir del Stud Book —">
+        </div>
         <div class="form-group">
           <label>Fecha nacimiento</label>
           <input type="date" id="f-nacimiento">
@@ -265,6 +312,14 @@
       <div class="pct-total" id="pct-total">Total: 0%</div>
     </div>
 
+    <!-- Panel de duplicados: lo llena rpc_spcs_duplicados antes del INSERT (sólo alta). -->
+    <div class="dup-panel" id="dup-panel" hidden>
+      <h3>⚠ Ya hay un SPC parecido cargado</h3>
+      <p id="dup-texto"></p>
+      <div id="dup-list"></div>
+      <div class="dup-actions" id="dup-actions"></div>
+    </div>
+
     <div class="modal-footer">
       <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
       <button class="btn-primary" onclick="saveRecord()" id="btn-save">Guardar</button>
@@ -445,6 +500,7 @@ function openModal(rec=null) {
   document.getElementById('modal-title').textContent = rec ? `Editar: ${rec.nombre}` : 'Nuevo SPC';
   document.getElementById('f-nombre').value = rec?.nombre || '';
   document.getElementById('f-registro').value = rec?.registro_stud_book || '';
+  document.getElementById('f-studbook-id').value = rec?.studbook_id || '';
   document.getElementById('f-nacimiento').value = rec?.fecha_nacimiento || '';
   document.getElementById('f-sexo-form').value = rec?.sexo || 'macho';
   document.getElementById('f-color').value = rec?.color || '';
@@ -465,6 +521,10 @@ function openModal(rec=null) {
   const owners = rec ? (propOwners[rec.id]||[]) : [];
   if (owners.length) owners.forEach(o => addPropRow(o.propietario_id, o.porcentaje));
   else addPropRow();
+  // Stud Book: bloque de búsqueda sólo en alta; en edición se ve el studbook_id existente (read-only).
+  sbReset();
+  document.getElementById('sb-box').hidden = !!rec;
+  ocultarDuplicados();
   switchTab('datos');
   document.getElementById('modal').classList.add('open');
 }
@@ -474,7 +534,159 @@ function closeModal() {
   editingId = null;
 }
 
-async function saveRecord() {
+// ---------------------------------------------------------------------------
+// STUD BOOK — buscar, elegir, prellenar. Edge Function `studbook-buscar` (solo staff).
+// La fuente hoy es el buscador público del Stud Book (no API): si cambia la fuente, cambia
+// adentro de la función; esta pantalla sólo conoce { ok, term, exactos, parciales, fuente }.
+// ---------------------------------------------------------------------------
+let sbCandidatos = [];   // último resultado, exactos + parciales (para usarCandidato por índice)
+
+function sbReset() {
+  document.getElementById('sb-term').value = '';
+  document.getElementById('sb-result').innerHTML = '';
+  document.getElementById('sb-fuente').textContent = 'fuente: studbook.org.ar (buscador público)';
+  sbCandidatos = [];
+}
+
+// supabase-js no parsea el body cuando la función responde != 2xx (deja el Response en `context`).
+async function parseFnError(error) {
+  const status = error?.context?.status ?? null;
+  let body = null;
+  try { body = await error?.context?.json?.(); } catch (_) { /* body no-JSON */ }
+  return { status, code: body?.error || null, detalle: body?.detalle || error?.message || 'Error desconocido.' };
+}
+
+async function buscarStudBook() {
+  const termEl = document.getElementById('sb-term');
+  let term = termEl.value.trim();
+  if (!term) { term = document.getElementById('f-nombre').value.trim(); termEl.value = term; }
+  const out = document.getElementById('sb-result');
+  if (term.length < 3) { out.innerHTML = '<div class="sb-msg err">Escribí al menos 3 letras del nombre.</div>'; return; }
+  const btn = document.getElementById('sb-btn');
+  btn.disabled = true; btn.textContent = 'Buscando…';
+  out.innerHTML = '<div class="sb-msg">Consultando el Stud Book…</div>';
+  try {
+    const { data, error } = await sb.functions.invoke('studbook-buscar', { body: { term } });
+    if (error) {
+      const e = await parseFnError(error);
+      console.error('[spcs.buscarStudBook]', { term, status: e.status, code: e.code, detalle: e.detalle });
+      const msg = e.code === 'studbook_no_disponible' ? 'El Stud Book no responde. Cargalo a mano.'
+                : e.code === 'solo_staff' ? 'Esta consulta es sólo para la secretaría.'
+                : e.code === 'term_invalido' ? e.detalle
+                : `No se pudo consultar el Stud Book (${e.status ?? '?'}). Cargalo a mano.`;
+      out.innerHTML = `<div class="sb-msg err">${escapeHtml(msg)}</div>`;
+      return;
+    }
+    if (data?.fuente) document.getElementById('sb-fuente').textContent = `fuente: ${data.fuente}`;
+    renderCandidatos(data);
+  } finally {
+    btn.disabled = false; btn.textContent = 'Buscar';
+  }
+}
+
+function candidatoHTML(c, idx) {
+  const edad = c.fecha_nacimiento ? edadSPCTexto(c.fecha_nacimiento, null, true) : '';
+  const fecha = c.fecha_nacimiento ? c.fecha_nacimiento.split('-').reverse().join('/') : 's/fecha';
+  const sexo = c.sexo ? c.sexo[0].toUpperCase() + c.sexo.slice(1) : (c.sexo_sb || '¿sexo?');
+  const alertas = (c.alertas || []).map(a => `<span class="sb-alerta" title="${escapeHtml(a)}">⚠ ${escapeHtml(a.split(':')[0])}</span>`).join('');
+  return `<div class="sb-cand" id="sb-cand-${idx}">
+    <div class="sb-cand-info">
+      <div class="sb-cand-l1"><span class="spc-name">${escapeHtml(c.nombre)}</span> · ${escapeHtml(fecha)}${edad ? ` (${escapeHtml(edad)})` : ''} · ${escapeHtml(sexo)} · ${escapeHtml(c.color || '¿pelaje?')}${alertas}</div>
+      <div class="sb-cand-l2">${escapeHtml(c.padrillo_nombre || '¿padre?')} × ${escapeHtml(c.madre_nombre || '¿madre?')}${c.abuelo_materno ? ` · ab. mat. ${escapeHtml(c.abuelo_materno)}` : ''} · SB ${escapeHtml(c.sb_id)}</div>
+    </div>
+    <button type="button" class="btn-sm btn-edit" onclick="usarCandidato(${idx})">Usar</button>
+  </div>`;
+}
+
+function renderCandidatos(data) {
+  const out = document.getElementById('sb-result');
+  const exactos = data?.exactos || [], parciales = data?.parciales || [];
+  sbCandidatos = [...exactos, ...parciales];
+  if (!sbCandidatos.length) {
+    out.innerHTML = '<div class="sb-msg">No está en el Stud Book con ese nombre. Probá con menos letras, o cargalo a mano.</div>';
+    return;
+  }
+  let html = '';
+  if (exactos.length) {
+    html += `<div class="sb-rotulo">${exactos.length === 1 ? '1 coincidencia exacta' : `${exactos.length} coincidencias exactas — elegí por fecha, sexo y padres`}:</div>`;
+    html += exactos.map((c, i) => candidatoHTML(c, i)).join('');
+  }
+  if (parciales.length) {
+    html += `<div class="sb-rotulo">${exactos.length ? 'Parecidos' : 'Sin coincidencia exacta — parecidos'}:</div>`;
+    html += parciales.map((c, i) => candidatoHTML(c, exactos.length + i)).join('');
+  }
+  out.innerHTML = html;
+}
+
+// Prellena el formulario con el candidato elegido. No guarda: Yesi revisa y aprieta Guardar.
+// f-abuela NO: el Stud Book da abuelo materno, no abuela → va en notas. f-registro queda como está
+// (criterio de las tandas R9: registro_stud_book NULL, studbook_id en columna, notas con SB + url).
+function usarCandidato(idx) {
+  const c = sbCandidatos[idx];
+  if (!c) return;
+  document.getElementById('f-nombre').value = c.nombre || '';
+  document.getElementById('f-studbook-id').value = c.sb_id || '';
+  document.getElementById('f-nacimiento').value = c.fecha_nacimiento || '';
+  if (c.sexo) document.getElementById('f-sexo-form').value = c.sexo;
+  document.getElementById('f-color').value = c.color || '';
+  document.getElementById('f-padrillo').value = c.padrillo_nombre || '';
+  document.getElementById('f-madre').value = c.madre_nombre || '';
+  document.getElementById('f-pais').value = c.pais_origen || '';
+  const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
+  const partes = [`SB ${c.sb_id}`, c.url_perfil, `alta desde spcs.html ${hoy}`];
+  if (c.abuelo_materno) partes.push(`abuelo materno: ${c.abuelo_materno}`);
+  if (c.leyenda) partes.push(c.leyenda);
+  if ((c.alertas || []).length) partes.push(`alertas Stud Book: ${c.alertas.join('; ')}`);
+  document.getElementById('f-notas').value = partes.join(' · ');
+  document.querySelectorAll('.sb-cand').forEach(el => el.classList.remove('sb-elegido'));
+  document.getElementById(`sb-cand-${idx}`)?.classList.add('sb-elegido');
+  ocultarDuplicados();
+  toast(`Datos de ${c.nombre} cargados desde el Stud Book. Revisá y guardá.`);
+}
+
+// ---------------------------------------------------------------------------
+// DUPLICADOS — rpc_spcs_duplicados antes del INSERT (sólo alta; los mismos 3 chequeos de las
+// tandas R9: studbook_id, nombre normalizado, fecha + padre + madre).
+//  - motivo studbook_id / fecha_padre_madre → BLOQUEA (es el mismo animal).
+//  - motivo nombre solo → "Guardar igual" (homónimos legítimos existen: Wave Rimout).
+// ---------------------------------------------------------------------------
+const DUP_MOTIVO = { studbook_id: 'mismo nº Stud Book', nombre: 'mismo nombre', fecha_padre_madre: 'misma fecha y padres' };
+
+function ocultarDuplicados() {
+  const p = document.getElementById('dup-panel');
+  p.hidden = true;
+  document.getElementById('dup-list').innerHTML = '';
+  document.getElementById('dup-actions').innerHTML = '';
+}
+
+function mostrarPanelDuplicados(dups) {
+  const bloquea = dups.some(d => d.motivo === 'studbook_id' || d.motivo === 'fecha_padre_madre');
+  document.getElementById('dup-texto').textContent = bloquea
+    ? 'Coincide el número de Stud Book o la fecha de nacimiento con el mismo padre y madre: es el mismo animal. No se crea otra ficha — abrí la existente.'
+    : 'Hay otro SPC con el mismo nombre. Si es un homónimo distinto (otra fecha, otros padres), podés guardar igual.';
+  document.getElementById('dup-list').innerHTML = dups.map(d => {
+    const fecha = d.fecha_nacimiento ? d.fecha_nacimiento.split('-').reverse().join('/') : 's/fecha';
+    return `<div class="dup-row">
+      <div class="dup-motivo">${escapeHtml(DUP_MOTIVO[d.motivo] || d.motivo)}</div>
+      <div class="dup-info"><strong>${escapeHtml(d.nombre)}</strong> · ${escapeHtml(fecha)} · ${escapeHtml(d.sexo || '—')} · ${escapeHtml(d.estado || '—')}<br>
+        <small>${escapeHtml(d.padrillo_nombre || '¿padre?')} × ${escapeHtml(d.madre_nombre || '¿madre?')}${d.studbook_id ? ` · SB ${escapeHtml(d.studbook_id)}` : ''}</small></div>
+      <button type="button" class="btn-sm btn-edit" onclick="abrirFichaExistente('${d.id}')">Abrir esa ficha</button>
+    </div>`;
+  }).join('');
+  document.getElementById('dup-actions').innerHTML = bloquea
+    ? ''
+    : `<button type="button" class="btn-secondary" onclick="saveRecord({ omitirDuplicados: true })">Guardar igual (es otro caballo)</button>`;
+  document.getElementById('dup-panel').hidden = false;
+  document.getElementById('dup-panel').scrollIntoView({ block: 'nearest' });
+}
+
+function abrirFichaExistente(id) {
+  const rec = allData.find(r => r.id === id);
+  if (!rec) { toast('No encontré esa ficha en el listado; recargá la página.', 'error'); return; }
+  openModal(rec);
+}
+
+async function saveRecord(opts = {}) {
   const nombre = document.getElementById('f-nombre').value.trim();
   if (!nombre) { toast('El nombre es requerido','error'); switchTab('datos'); return; }
   const btn = document.getElementById('btn-save');
@@ -483,6 +695,7 @@ async function saveRecord() {
     club_id: null,
     nombre,
     registro_stud_book: document.getElementById('f-registro').value.trim() || null,
+    studbook_id: document.getElementById('f-studbook-id').value.trim() || null,
     fecha_nacimiento: document.getElementById('f-nacimiento').value || null,
     sexo: document.getElementById('f-sexo-form').value,
     color: document.getElementById('f-color').value.trim() || null,
@@ -503,6 +716,18 @@ async function saveRecord() {
     const { error } = await sb.from('spcs').update(payload).eq('id', editingId);
     if (error) { toast(error.message,'error'); btn.disabled=false; btn.textContent='Guardar'; return; }
   } else {
+    // Chequeo de duplicados ANTES del INSERT. Corre siempre en alta, también si se cargó a mano
+    // sin buscar (sin studbook_id aplican los otros dos motivos). "Guardar igual" lo saltea sólo
+    // cuando el único motivo fue `nombre` (el panel no ofrece el botón en los otros casos).
+    if (!opts.omitirDuplicados) {
+      const { data: dups, error: dupErr } = await sb.rpc('rpc_spcs_duplicados', {
+        p_studbook_id: payload.studbook_id, p_nombre: payload.nombre,
+        p_fecha_nacimiento: payload.fecha_nacimiento, p_padrillo: payload.padrillo_nombre, p_madre: payload.madre_nombre,
+      });
+      if (dupErr) { console.error('[spcs.duplicados]', dupErr); toast('No se pudo verificar duplicados: ' + dupErr.message, 'error'); btn.disabled=false; btn.textContent='Guardar'; return; }
+      if (dups?.length) { mostrarPanelDuplicados(dups); btn.disabled=false; btn.textContent='Guardar'; return; }
+    }
+    ocultarDuplicados();
     const { data, error } = await sb.from('spcs').insert(payload).select().single();
     if (error) { toast(error.message,'error'); btn.disabled=false; btn.textContent='Guardar'; return; }
     spcId = data.id;
```

## 4. Por qué no hay † (muerto)

Hit crudo del autocomplete para BIEN COQUETA (la de 1998 está muerta según el sitio; el JSON no lo dice):

```
$ curl -s -H 'X-Requested-With: XMLHttpRequest' 'https://www.studbook.org.ar/ejemplares/autocomplete?tipo=1&muerto=1&term=BIEN%20COQUETA'
[{"icon":"\/img\/banderas\/10.png","id":429819,"text":"BIEN COQUETA","leyenda":"(2021 H SP)","padre":"Bien Terminado","madre":"Gritty","abuelo_materno":"Luhuk (USA)","tomo":1241,"folio":202,"sexo":"Hembra","nacimiento":"15\/10\/2021","pelo":"Zaino Colorado","raza":4,"url_friendly":"bien-coqueta","adn":1,"pasaporte":1,"mc":1,"revisado":1},{"icon":"\/img\/banderas\/10.png","id":216248,"text":"BIEN COQUETA","leyenda":"(1998 H SP)","padre":"Yale Twentyniner (USA)","madre":"Coquetisima","abuelo_materno":"Friul","tomo":1057,"folio":260,"sexo":"Hembra","nacimiento":"29\/07\/1998","pelo":"Alazan","raza":4,"url_friendly":"bien-coqueta","adn":0,"pasaporte":0,"mc":0,"revisado":0}]
```

Campos disponibles: `icon, id, text, leyenda, padre, madre, abuelo_materno, tomo, folio, sexo, nacimiento, pelo, raza, url_friendly, adn, pasaporte, mc, revisado`. Ninguno es "muerto". La edad reglamentaria (28 años) cumple la misma función para distinguir.

## 5. Decisiones chicas (anotadas, no de producto)

- `f-pais` se prellena con `pais_origen` del candidato (`'Argentina'` si bandera `/10.png`, si no vacío + alerta) — antes el form ponía `'Argentina'` fijo en alta; sigue así cuando no se busca.
- `f-sexo-form` sólo se pisa si el candidato trae sexo mapeado (`macho`/`hembra`); `castrado` no viene del Stud Book, se elige a mano.
- El UPDATE en edición ahora manda `studbook_id` (el existente, read-only): no cambia nada para las 203 filas; permite que una ficha vieja sin vínculo lo reciba si algún día se agrega "buscar" en edición (no en v1).
- `parseFnError` copiado de `admin.html:658` (mismo problema: supabase-js no parsea el body != 2xx).

## 6. Commit y push

```
$ git add spcs.html && git commit … && git push -q origin feat/studbook-buscar
9b364c0fe0c3713d943fa3668f8fc88a5dfb17b0
9b364c0fe0c3713d943fa3668f8fc88a5dfb17b0	refs/heads/feat/studbook-buscar
9b364c0 feat(spcs): pantalla — buscar en el Stud Book al dar de alta, elegir candidato, prellenar, chequear duplicados antes del INSERT
c39f2fa feat(studbook): Edge Function studbook-buscar DEPLOYADA v1 (verify_jwt, solo staff) + probes lógica 11/11 y e2e 8/8
6646da4 feat(spcs): rpc_spcs_duplicados APLICADA + probe con sesiones reales (staff ok, portal 42501) 10/10
```

## 7. Qué sigue (esperando OK)

- **Pieza D(pantalla)** — `tests/probe_spcs_studbook_alta.mjs`: extraer de `spcs.html` `renderCandidatos`/`candidatoHTML`/`usarCandidato`/`mostrarPanelDuplicados` y el tramo de `saveRecord` con stubs de DOM; casos: BIEN COQUETA → 2 candidatos y ninguno prellenado; Usar(0) → form con sb 429819 y notas con SB + url; alta con `studbook_id` 431567 (LOGUACIOUS) → panel bloqueado sin botón; alta "WAVE RIMOUT" sin sb → panel con "Guardar igual"; `omitirDuplicados` → llega al INSERT (contra sandbox, con teardown).
- Docs: `CLAUDE.md` (árbol: función + probes; sección Supabase MCP no cambia), `docs/GOTCHAS.md` #96 (autocomplete: header obligatorio, sin campo muerto, homónimos), `docs/SCHEMA.md` (RPC `rpc_spcs_duplicados`), `CHANGELOG.md`.
- Merge a `main` (= deploy de la pantalla) sólo con OK.

## 8. Verificación de push (reports)

```
$ git push -u origin reports
$ git ls-remote origin reports
ffbc2ac1e4e8a0c13c9e3af0460ed96be1365429	refs/heads/reports
$ git rev-parse HEAD
ffbc2ac1e4e8a0c13c9e3af0460ed96be1365429
```
