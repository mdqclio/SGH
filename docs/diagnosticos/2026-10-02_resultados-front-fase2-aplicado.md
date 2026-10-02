# Front de resultados — fase 2 (A, B, C, D) mergeada y en prod (PR #44)

- **Fecha**: 2026-10-02 · **`main`**: `0227588f3710477cd82453bba38f38b4caae75ca` (merge del #44, 18:17:33 UTC)
- **Guards**: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` ✅ · clubs Dolores por uuid ✅
- **Anonimizado**: sin nombres de personas.

## Qué quedó

| | Pedido | Hecho |
|---|---|---|
| A | F10 no manda nada en la vista oficial | `onF10()`: en la vista oficial avisa "La carrera está oficial: para corregirla, des-oficializala primero." y no llama a `aplicar()`; en reunión cerrada, tampoco |
| B | Reunión cerrada: botones deshabilitados con el motivo, **no escondidos** | la lista de reuniones trae `liquidacion_cerrada_at`; banner arriba; **Aplicar**, **Hacer oficial** y **Des-oficializar** con `disabled` y el motivo en el tooltip; `oficializar()` corta antes de los gates |
| C | P0092: "La liquidación de esta reunión está cerrada: el resultado no se puede cambiar." sin super_admin ni resolución | `mensajeBloqueo()` traduce por **código**: P0092 → ese texto exacto; P0089 → "La carrera está oficial…"; el resto, "Error al guardar: …" como antes. En `aplicar()` y `desoficializar()` |
| D | Borrar la legacy (404) | `resultados_legacy.html` borrada; **`sigh.com.ar/resultados_legacy.html` → HTTP 404**. Cierra ISSUE-046 |

También: CHANGELOG, ISSUES (102: paso 3 hecho; 046: cerrado), CLAUDE.md (línea del probe) y `correr_todos.sh` (probe sumado).

## Verificación

| | Resultado |
|---|---|
| `probe_resultados_front_cerrada.mjs` (nuevo; jsdom + `sb` stub, `resultados.html` real) | **16/16** |
| sus mutantes | **13/13** muertos, todos por asserts |
| el mismo probe contra el `resultados.html` de antes (`main` en `e82a548…`) | **4/16** |
| `correr_todos.sh` sobre la rama (checkout principal) | **30 verdes · 12 conocidos · 0 nuevos · 0 ausentes** |
| ventana | última actividad de la operadora de Pagos 13:23 ART, sesión sin renovar desde 13:20; merge a las 15:17 ART. El cambio es de Resultados, no de Pagos |
| deploy | `resultados.html` servido = `main` (md5) y la legacy da 404, a los ~50 s del merge |

## Salida cruda

### Deploy

```
desde 18:17:35 hasta 18:18:21 UTC
resultados.html  main=d3cfe39626c276dfb0be87cbcf7a7b05 servido=d3cfe39626c276dfb0be87cbcf7a7b05
resultados_legacy.html HTTP 404
```

### `correr_todos.sh` sobre `fix/resultados-front-cerrada`

```
rama=fix/resultados-front-cerrada sha=d083b3b02cef5c15b623ede78c522a7f31beaf05
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       6s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       6s
probe_aviso_jockey_repetido                🟢 verde                                                      3s
probe_badge_overlap                        🟢 verde                                                      0s
probe_bolsa_efectiva                       🟢 verde                                                      2s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      1s
probe_chapa_4medio                         🟢 verde                                                      0s
probe_cobros_caballeriza                   🟢 verde                                                      3s
probe_condicion_sexo_r9                    🟢 verde                                                      4s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=2)                                       1s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       1s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      12s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      1s
probe_montas_reales                        🟢 verde                                                      4s
probe_motor_chequeo_errores                🟢 verde                                                      0s
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       8s
probe_orden_inscriptos                     🟢 verde                                                      4s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde                                                     33s
probe_pagos_vista_carrera                  🟢 verde                                                     14s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     14s
probe_portal_alta_spc_ui                   🟢 verde                                                      1s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      1s
probe_programa_null_estado                 🟢 verde                                                      3s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      0s
probe_recibo_una_hoja                      🟢 verde                                                     65s
probe_regex_datos_personales               🟢 verde                                                      1s
probe_resultados_front_cerrada             🟢 verde                                                      1s
probe_reparto_100                          🟢 verde                                                     42s
probe_rls_no_permissive                    🟢 verde                                                      0s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                       1s
probe_studbook_v2                          🟢 verde                                                      1s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       1s

Resumen: 30 verdes · 12 rojos conocidos · 0 rojos NUEVOS · 0 ausentes
Rojos conocidos (no bloquean):
  - probe_activacion_pendiente          drift del probe: su stub de sb no tiene .select() después de update().eq() (TypeError)
  - probe_alineado_programa             drift: el check de márgenes de página (10mm 8mm) del programa color no coincide — el CSS de impresión cambió desde que se escribió
  - probe_apuestas_especiales           drift: 9 checks de tarjetas (cantidad, número, nombre, rango) no coinciden con la pantalla actual
  - probe_cuerpos_oficial               drift de datos: espera 8 carreras oficiales en R6 y hay 7 (C3 está provisional desde el 14/08)
  - probe_edad_display                  drift: no encuentra el ancla de fin del bloque de edad en el HTML
  - probe_edad_reglamentaria            2/32: el Stud Book no devuelve dato para los ejemplares de R9 (fuente externa; ver studbook_buscar_fn)
  - probe_forfait_anulada               drift de extracción: ReferenceError renumerarChapas
  - probe_orden_carreras                drift de datos: 2/18 asumen R9 con 0 anuladas y sin sortear (R9 ya tiene anuladas y sorteo)
  - probe_portal_carta                  drift: no encuentra loadCarta en portal.html (hoy se llama loadLlamado)
  - probe_spcs_r9_tanda_1               evidencia histórica: asserta count(spcs) = 205 (hoy 239)
  - probe_studbook_buscar_fn            fuente externa: el Stud Book responde HTTP 403 a las búsquedas desde este servidor
  - probe_tapa_flyer                    drift de extracción: ReferenceError edadSPC
Salida completa de cada probe: <scratchpad>/pre3/out/<probe>.txt
exit=0
```

### `probe_resultados_front_cerrada.mjs --mutantes`

```
✅ B4 la lista de reuniones pide liquidacion_cerrada_at
✅ C0 el texto de reunión cerrada es el pedido y no menciona super_admin ni resolución
✅ B1 reunión cerrada, formulario: Aplicar y Hacer oficial están (no escondidos), deshabilitados y con el motivo; banner
✅ B2 reunión abierta, formulario: botones habilitados y sin banner
✅ B3 reunión cerrada, vista oficial: Des-oficializar está, deshabilitado con el motivo; banner
✅ B3b reunión abierta, vista oficial: Des-oficializar habilitado
✅ A1 F10 en la vista oficial: no llama a aplicar(), avisa que está oficial
✅ A2 F10 en el formulario de una reunión abierta: aplicar() una vez
✅ A3 F10 en el formulario de una reunión cerrada: no llama a aplicar(), avisa
✅ C1 P0092 → exactamente el texto de reunión cerrada, sin super_admin/resolución ni "Error al guardar"
✅ C2 P0089 → "La carrera está oficial…"
✅ C3 otro error → "Error al guardar: …" como antes
✅ C4 des-oficializar con P0092 de la RPC → el texto de reunión cerrada
✅ C5 oficializar() en reunión cerrada corta con el aviso, sin llamar a aplicar()
✅ D1 resultados_legacy.html no está en el repo
✅ D2 ningún HTML/JS del repo la enlaza

16/16 asserts OK  (/home/clio/dev/SGH/resultados.html)

── mutantes ──
✅ muere MU1 F10 vuelve a llamar a aplicar() siempre  ← A1, A3
✅ muere MU2 F10 no mira si la carrera está oficial  ← A1
✅ muere MU3 F10 no mira si la reunión está cerrada  ← A3
✅ muere MU4 botones sin deshabilitar en reunión cerrada  ← B1, B3
✅ muere MU5 botones escondidos en vez de deshabilitados  ← B1, B3
✅ muere MU6 sin banner  ← B1, B3
✅ muere MU7 P0092 sin traducir  ← C1, C4
✅ muere MU8 P0089 sin traducir  ← C2
✅ muere MU9 aplicar() no usa la traducción  ← C1, C2
✅ muere MU10 des-oficializar no usa la traducción  ← C4
✅ muere MU11 la lista de reuniones no trae liquidacion_cerrada_at  ← B4
✅ muere MU12 el texto vuelve a nombrar super_admin y resolución  ← C0, B1, B3, A3, C1, C4, C5
✅ muere MU13 oficializar() sin corte de reunión cerrada  ← C5

mutantes: 13/13 muertos
```

### El mismo probe contra el `resultados.html` previo

```
❌ B4 la lista de reuniones pide liquidacion_cerrada_at
❌ C0 el texto de reunión cerrada es el pedido y no menciona super_admin ni resolución
❌ B1 reunión cerrada, formulario: Aplicar y Hacer oficial están (no escondidos), deshabilitados y con el motivo; banner  → {"of":false,"banner":false}
❌ B2 reunión abierta, formulario: botones habilitados y sin banner
❌ B3 reunión cerrada, vista oficial: Des-oficializar está, deshabilitado con el motivo; banner
❌ B3b reunión abierta, vista oficial: Des-oficializar habilitado
❌ A1 F10 en la vista oficial: no llama a aplicar(), avisa que está oficial  → {"n":1,"toasts":[["Resultado provisional guardado",null]]}
✅ A2 F10 en el formulario de una reunión abierta: aplicar() una vez
❌ A3 F10 en el formulario de una reunión cerrada: no llama a aplicar(), avisa  → {"n":1,"toasts":[["Resultado provisional guardado",null]]}
❌ C1 P0092 → exactamente el texto de reunión cerrada, sin super_admin/resolución ni "Error al guardar"  → ["Error al guardar: aplicar_resultado: la liquidación de esta reunión está cerrada (saldada): … lo corrige un super_admin con la resolución. ISSUE-102"]
❌ C2 P0089 → "La carrera está oficial…"  → ["Error al guardar: aplicar_resultado: la carrera 3 está oficial; … ISSUE-089"]
✅ C3 otro error → "Error al guardar: …" como antes
❌ C4 des-oficializar con P0092 de la RPC → el texto de reunión cerrada  → [["desoficializar_carrera: la liquidación … ISSUE-102","error"]]
❌ X  excepción en los casos (cuenta como fallo)  → TypeError: Cannot read properties of null (reading 'resultado_id')     at aplicar (https://sigh.com.ar/resultados.html:1189:25)     at async oficializar (https://sigh.com.ar/resultados.html:1254:3)
✅ D1 resultados_legacy.html no está en el repo
✅ D2 ningún HTML/JS del repo la enlaza

4/16 asserts OK  (<scratchpad>/res_main_pre.html)
```

### Diff de `resultados.html` (encabezados de hunk como `[hunk …]`)

```diff
diff --git a/resultados.html b/resultados.html
index 5043ae1..0dea17e 100644
--- a/resultados.html
+++ b/resultados.html
[hunk -498,12 +498,45] function toast(msg, type='success') {
   setTimeout(()=>t.remove(), 3500);
 }
 
+/* ═══════════════════════════════════════════════
+   BLOQUEOS: reunión con la liquidación cerrada / carrera oficial (ISSUE-102 paso 3)
+═══════════════════════════════════════════════ */
+// ═══ BLOQUEOS — INICIO (el probe extrae este bloque por estas anclas) ═══
+// La base ya lo impide (trigger P0092 en resultados/posiciones/apuestas; aplicar_resultado v2 rechaza
+// oficial → provisional con P0089). Acá la pantalla lo dice antes y con palabras de la operación:
+// en reunión cerrada los botones quedan DESHABILITADOS con el motivo (no se esconden), F10 no
+// manda nada en la vista oficial, y si igual llega un error de la base se traduce por su código.
+const MSG_CERRADA = 'La liquidación de esta reunión está cerrada: el resultado no se puede cambiar.';
+const MSG_OFICIAL = 'La carrera está oficial: para corregirla, des-oficializala primero.';
+function reunionCerrada() {
+  const rid = document.getElementById('sel-reunion')?.value;
+  return !!reuniones.find(r => r.id === rid)?.liquidacion_cerrada_at;
+}
+function mensajeBloqueo(err) {
+  if (err?.code === 'P0092') return MSG_CERRADA;
+  if (err?.code === 'P0089') return MSG_OFICIAL;
+  return null;
+}
+// Atributos para un botón que cambia el resultado: deshabilitado y con el motivo en el tooltip.
+function attrsCerrada() { return reunionCerrada() ? ` disabled title="${MSG_CERRADA}"` : ''; }
+function bannerCerrada() {
+  return reunionCerrada() ? `<div class="warning-box no-print" id="banner-cerrada" style="margin-bottom:12px;">🔒 ${MSG_CERRADA}</div>` : '';
+}
+// F10 = Aplicar del formulario. En la vista oficial no hay formulario: no se manda nada.
+function onF10() {
+  if (!currentCarreraId) return;
+  if (resultados[currentCarreraId]?.estado === 'oficial') { toast(MSG_OFICIAL, 'error'); return; }
+  if (reunionCerrada()) { toast(MSG_CERRADA, 'error'); return; }
+  aplicar(currentCarreraId, 'provisional');
+}
+// ═══ BLOQUEOS — FIN ═══
+
 /* ═══════════════════════════════════════════════
    CARGA DE DATOS
 ═══════════════════════════════════════════════ */
 async function init() {
   const [{ data: reuns }, { data: profs }, { data: spcs }] = await Promise.all([
-    sb.from('reuniones').select('id,numero,fecha,estado,hipodromos(nombre)').eq('club_id', CLUB_ID).order('fecha', {ascending:false}),
+    sb.from('reuniones').select('id,numero,fecha,estado,liquidacion_cerrada_at,hipodromos(nombre)').eq('club_id', CLUB_ID).order('fecha', {ascending:false}),
     sb.from('profesionales').select('id,nombre,apellido,tipo').eq('club_id', CLUB_ID),
     sb.from('spcs').select('id,nombre').order('nombre'),
   ]);
[hunk -899,6 +932,7] function renderFormulario(carrera, res, pos, apus, insc) {
           <div id="div-view-container"></div>
 
           <!-- Acciones -->
+          ${bannerCerrada()}
           <div class="actions-bar no-print">
             <div class="actions-grp">
               <button class="btn-outline" onclick="f8Dividendos()">Recargar dividendos <kbd>F8</kbd></button>
[hunk -906,13 +940,13] function renderFormulario(carrera, res, pos, apus, insc) {
               <button class="btn-outline" onclick="openMontas()">🏇 Montas</button>
             </div>
             <div class="actions-grp">
-              <button class="btn-primary" onclick="aplicar('${carrera.id}','provisional')">Aplicar <kbd>F10</kbd></button>
+              <button class="btn-primary" id="btn-aplicar" onclick="aplicar('${carrera.id}','provisional')"${attrsCerrada()}>Aplicar <kbd>F10</kbd></button>
               <button class="btn-outline" onclick="cancelar('${carrera.id}')">Cancelar <kbd>F9</kbd></button>
             </div>
           </div>
           <div class="actions-bar no-print" style="border-top:none;padding-top:0;">
             <div class="actions-grp">
-              <button class="btn-success" onclick="oficializar('${carrera.id}')">✅ Hacer oficial</button>
+              <button class="btn-success" id="btn-oficializar" onclick="oficializar('${carrera.id}')"${attrsCerrada()}>✅ Hacer oficial</button>
             </div>
             <div class="warning-box" style="font-size:11px;flex:1;">
               Hacer oficial marca el resultado y genera su liquidación. Es reversible: se puede des-oficializar mientras la carrera no tenga pagos emitidos.
[hunk -1583,7 +1617,10] async function aplicar(carreraId, estado) {
   });
 
   if (rpcErr) {
-    if (rpcErr.message?.includes('CONCURRENT_MODIFICATION')) {
+    const bloqueo = mensajeBloqueo(rpcErr);
+    if (bloqueo) {
+      toast(bloqueo, 'error');
+    } else if (rpcErr.message?.includes('CONCURRENT_MODIFICATION')) {
       toast('Otro operador modificó este resultado. Recargá antes de guardar.', 'error');
     } else {
       toast('Error al guardar: ' + rpcErr.message, 'error');
[hunk -1621,6 +1658,7] async function cancelar(carreraId) {
 // del cliente, NO transacción única: si la generación falla tras marcar oficial, la carrera
 // queda oficial sin liquidar → se arregla con "Recalcular reunión" en liquidaciones.html.
 async function oficializar(carreraId) {
+  if (reunionCerrada()) { toast(MSG_CERRADA, 'error'); return; }
   // ═══ GATE MONTAS — INICIO (el probe extrae este bloque por estas anclas) ═══
   // Sin jockey no se oficializa. El motor descarta la línea en SILENCIO
   // (liquidaciones-engine.js, addActor: `if (!id) return;`): oficializar con el campo vacío no
[hunk -1700,7 +1738,7] async function desoficializar(resId, carreraId) {
   // que ya no es oficial y el recálculo no corre. select('*'): la columna puede no existir todavía.
   const ridCierre = (carreras.find(c=>c.id===carreraId)?.reunion_id) || document.getElementById('sel-reunion').value;
   const { data: reuCierre } = await sb.from('reuniones').select('*').eq('id', ridCierre).single();
-  if (reuCierre?.liquidacion_cerrada_at) { toast('La liquidación de esta reunión está cerrada (saldada): no se puede des-oficializar.', 'error', 9000); return; }
+  if (reuCierre?.liquidacion_cerrada_at) { toast(MSG_CERRADA, 'error', 9000); return; }
   const { data: insX } = await sb.from('inscripciones').select('id').eq('carrera_id', carreraId);
   const inscIds = (insX||[]).map(i=>i.id);
   const scope = inscIds.length ? `carrera_id.eq.${carreraId},inscripcion_id.in.(${inscIds.join(',')})` : `carrera_id.eq.${carreraId}`;
[hunk -1713,7 +1751,7] async function desoficializar(resId, carreraId) {
 
   // RPC atómica: guard de pagos (RAISE) + estado->provisional + limpieza oficializado_*. Keya por carrera_id.
   const { error } = await sb.rpc('desoficializar_carrera', { p_carrera_id: carreraId });
-  if (error) { toast(error.message,'error'); return; }   // incluye el RAISE del guard ('carrera con pagos emitidos...') → no recalcula
+  if (error) { toast(mensajeBloqueo(error) || error.message,'error'); return; }   // P0092 traducido; el RAISE del guard ('carrera con pagos emitidos...') va tal cual → no recalcula
   await sb.from('performances').delete().eq('carrera_id', carreraId);
   resultados[carreraId] = {...resultados[carreraId], estado:'provisional'};
   const rid = (carreras.find(c=>c.id===carreraId)?.reunion_id) || document.getElementById('sel-reunion').value;
[hunk -1759,6 +1797,7] function renderOficial(carrera, res, pos, apus, insc) {
   const _divHtml = renderDivHTML(apus, _habMap, _chapaAt, true, false);
 
   document.getElementById('main-container').innerHTML = `
+    ${bannerCerrada()}
     <div class="res-panel">
       <div class="res-panel-header">
         <div>
[hunk -1771,7 +1810,7] function renderOficial(carrera, res, pos, apus, insc) {
           <span style="font-size:13px;color:var(--muted);min-width:60px;text-align:center;">Carrera ${_cIdx+1} / ${carreras.length}</span>
           <button class="btn-outline no-print" onclick="navCarrera(1)"  ${_isLast?'disabled':''}>Siguiente →</button>
           <button class="btn-outline no-print" onclick="window.print()">🖨️ Imprimir</button>
-          <button class="btn-danger  no-print" onclick="desoficializar('${res.id}','${carrera.id}')">↩️ Des-oficializar</button>
+          <button class="btn-danger  no-print" id="btn-desoficializar" onclick="desoficializar('${res.id}','${carrera.id}')"${attrsCerrada()}>↩️ Des-oficializar</button>
           <button class="btn-outline no-print" onclick="navigateToLista()">← Carreras</button>
         </div>
       </div>
[hunk -1833,7 +1872,7] function setStatus(msg) {
 document.addEventListener('keydown', e => {
   if (e.key==='F8')       { e.preventDefault(); if (currentCarreraId) f8Dividendos(); }
   if (e.key==='F9')       { e.preventDefault(); if (currentCarreraId) cancelar(currentCarreraId); }
-  if (e.key==='F10')      { e.preventDefault(); if (currentCarreraId) aplicar(currentCarreraId,'provisional'); }
+  if (e.key==='F10')      { e.preventDefault(); onF10(); }   // no manda nada en la vista oficial ni en reunión cerrada
   if (e.key==='PageDown') { e.preventDefault(); navCarrera(1); }
   if (e.key==='PageUp')   { e.preventDefault(); navCarrera(-1); }
 });
```
