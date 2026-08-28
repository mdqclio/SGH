# Diff propuesto — Montas reales + gate duro al oficializar (A + B, sin aplicar)

- **Fecha**: 2026-08-28
- **Base**: `main` = `2754c5f`
- **Branch con el cambio**: `feat/montas-reales-y-gate` = `7f3827f` (pusheada, **NO mergeada**)
- **Estado de `main`**: intacto en `2754c5f`, working tree limpio. Nada aplicado, nada deployado.
- **Guards verificados**:
  - `pwd` → `/home/clio/dev/SGH` ✔
  - `SELECT count(*) FROM spcs` → `181` ✔
  - ref del proyecto → `unlhcuanfrtpatoipwve` ✔
- **Relevamiento base**: `docs/diagnosticos/2026-08-28_monta-real-vs-jockey-inscripto.md`
- **Alcance**: §7 opciones 1 y 2 del relevamiento. La opción 3 (columna en
  `resultado_posiciones`) **no entra**, como se pidió.

---

## 0. Mediciones que decidieron el diseño

### 0.1 Exposición del gate (pedida antes de codear)

De las 52 inscripciones sin jockey, **15 están ratificadas** — 11 en R6, 4 en R8. Las otras 37
son forfait (33), inscripto (3) y mal_inscrito (1), que el motor ya filtra.

```sql
SELECT r.numero AS reunion, i.estado::text AS estado_insc, count(*) AS total,
       count(*) FILTER (WHERE i.jockey_titular_id IS NULL) AS sin_jockey
FROM inscripciones i
JOIN carreras c ON c.id = i.carrera_id
JOIN reuniones r ON r.id = c.reunion_id
GROUP BY 1,2 ORDER BY 1,2;
```

```
 reunion | estado_insc  | total | sin_jockey
---------+--------------+-------+------------
       6 | forfait      |    36 |         27
       6 | inscripto    |     8 |          0
       6 | ratificado   |    81 |         11
       8 | forfait      |    29 |          6
       8 | inscripto    |     7 |          2
       8 | mal_inscrito |     3 |          1
       8 | ratificado   |    67 |          4
       9 | inscripto    |     1 |          1
    9999 | ratificado   |    17 |          0
```

Y los 15 ratificados sin jockey **son todos `no_largo = true`**:

```
 reunion |   situacion   | estado_res | n
---------+---------------+------------+----
       6 | no_largo=true | oficial    | 11
       8 | no_largo=true | oficial    |  4
```

Cruzado contra los que sí largaron: **0 sin jockey** en R6, R8 y 9999.
**Exposición del gate hoy: 0 carreras bloqueadas.**

### 0.2 Pero ese 0 es el estado *después* del parche manual

Reconstruido desde `auditoria` — ratificados que **largaron** y tuvieron el jockey en `null`
hasta después de la carrera:

```sql
SELECT r.numero AS reunion, count(DISTINCT a.registro_id) AS largaron_backfilleados_post_carrera
FROM auditoria a
JOIN inscripciones i ON i.id = a.registro_id
JOIN carreras c ON c.id = i.carrera_id
JOIN reuniones r ON r.id = c.reunion_id
JOIN resultados res ON res.carrera_id = c.id
JOIN resultado_posiciones rp ON rp.inscripcion_id = i.id AND rp.resultado_id = res.id
WHERE a.tabla='inscripciones' AND a.accion='UPDATE'
  AND (a.datos_antes->>'jockey_titular_id') IS NULL
  AND (a.datos_despues->>'jockey_titular_id') IS NOT NULL
  AND a.created_at::date >= r.fecha
  AND i.estado::text='ratificado' AND rp.no_largo = false
GROUP BY 1 ORDER BY 1;
```

```
 reunion | largaron_backfilleados_post_carrera
---------+-------------------------------------
       6 |                                  19
       8 |                                   9
```

**28 casos.** En R6 son 19 sobre 58 que largaron: un tercio de la carrera oficializada sin
jockey, sin que el sistema dijera nada.

⚠️ **Corrección de una medición anterior.** Mi primer intento filtraba por
`a.created_at > res.oficializado_at` y devolvió vacío. No era ausencia de casos: es que
**`resultados.oficializado_at` y `oficializado_por` están en NULL en las 19 filas** —
`oficializar()` nunca los escribe. La comparación contra NULL descartaba todo. El número
bueno es el de arriba.

```
   estado    | n  | con_oficializado_at | con_oficializado_por
-------------+----+---------------------+----------------------
 oficial     | 18 |                   0 |                    0
 provisional |  1 |                   0 |                    0
```

Es un bug real de `oficializar()` — el histórico no sabe quién oficializó ni cuándo — pero
**está fuera del alcance de este cambio y no lo toqué**. Queda anotado.

### 0.3 Jockeys que corrieron y no estaban en `profesionales`

**Pasó.** 4 de los 22 jockeys que corrieron en R6 se dieron de alta entre el 05 y el 07/08,
mes y medio después de la carrera:

```
 apellido | nombre        | tipo   |        created_at        | corrio_en | fecha
----------+---------------+--------+--------------------------+-----------+------------
 GUZMAN   | CLAUDIO       | jockey | 2026-08-05 20:59:08+00   |         6 | 2026-06-20
 MARCHANT | JUAN          | jockey | 2026-08-06 19:38:01+00   |         6 | 2026-06-20
 DE MAIO  | FACUNDO       | jockey | 2026-08-07 03:39:34+00   |         6 | 2026-06-20
 GONZALEZ | JOSE ANTONIO  | jockey | 2026-08-07 03:39:34+00   |         6 | 2026-06-20
```

R8: 0 de 24. Inexistentes hoy en `profesionales`: 0 en ambas (el FK lo impide).

Es el mismo evento que los backfills de monta: el 07/08 a las 03:39 se crean dos jockeys, y a
las 03:43 se corrigen las montas de R6.

**Por eso el diff incluye alta rápida de jockey en el modal** (sección C del diff). Sin ella el
gate duro deja al operador trabado justo en el caso que ya se dio 4 veces. Es la parte que
pediste hablar: está implementada y es fácil de sacar — son 30 líneas contiguas más el bloque
`.mo-alta` del HTML y el CSS. Si preferís que no vaya, la quito y el resto queda igual.

---

## 1. Decisión del gate: **bloqueo duro** (confirmada)

Con el número de §0.1 y §0.2:

- **No frena nada que hoy esté bien.** De los que largaron, 0 sin jockey. En la operación
  normal el gate es invisible. El probe lo verifica contra R8 real (assert `M5b`).
- **Los 15 ratificados sin jockey quedan fuera por diseño**: los 15 son `no_largo`, y el gate
  los excluye con el mismo criterio que usa `perfInserts`.
- **Los 28 históricos no son casos borde**: 19/58 en R6.
- **El error hoy es silencioso.** `addActor` hace `if (!id) return;` — oficializar con el campo
  vacío no da error, el jockey simplemente no cobra. En R8 se detectó día y medio después.
- **El 20/09 lo carga Martín**, primera vez con SGH. Una advertencia se acepta sin leer.
- **Es reversible y con salida en la misma pantalla**: `desoficializar_carrera` ya existe, y el
  gate ofrece abrir Montas para arreglar el faltante sin cambiar de página.

Riesgo asumido y mitigado: jockey que corrió y no está en `profesionales` → cubierto por la
alta rápida de §0.3.

---

## 2. Qué toca el diff

| Archivo | Qué |
|---|---|
| `resultados.html` | +223 / −1 |
| `tests/probe_montas_reales.mjs` | nuevo, 28 asserts |

**No toca**: `ratificacion.html`, `inscripciones.html`, `liquidaciones-engine.js`,
`hora_cierre_ratificacion`, ni el schema. Ninguna migración. Verificado:

```
$ git diff --stat main..feat/montas-reales-y-gate
 resultados.html | 224 +++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 tests/probe_montas_reales.mjs | (nuevo)
```

### Los 6 hunks

1. **`init()`** — `select('id,nombre,apellido')` → `select('id,nombre,apellido,tipo')`.
   `profsMap` no traía `tipo`, y sin eso no se puede filtrar `jockey|ambos` como hace
   `ratificacion.html:839`. Un campo.
2. **CSS** — `.mo-select`, `.mo-select.mo-vacio` (borde ámbar cuando está sin asignar),
   `.mo-alta`. Reusa `.pb-th` / `.pb-td` del modal de pesos.
3. **HTML** — `#modal-montas`, calcado del `#modal-peso-balanza` que está justo arriba.
4. **Botonera** — `🏇 Montas` al lado de `⚖️ Pesos balanza`, en la misma `actions-grp`.
   Queda **antes** de "Hacer oficial", que es el punto.
5. **Gate en `oficializar()`** — entre las anclas `GATE MONTAS — INICIO/FIN`, **antes** del
   `confirm` existente y antes de `aplicar()`, para que no se escriba nada al bloquear.
6. **Funciones del modal** — detrás de `savePesoBalanza()`.

### Decisiones que tomé y conviene que mires

- **El gate corre antes de `aplicar()`.** Si corriera después, `aplicar(carreraId,'oficial')` ya
  habría escrito el estado y habría que revertir. Assert `G6c`.
- **`montasFaltantes()` tiene dos fuentes de "no largó"**: si la carrera es la abierta usa
  `noLargoMandiles` + `renumerarChapas` (lo que el operador acaba de marcar en el marcador, que
  todavía no está en la DB); si no, cae a `resultado_posiciones.no_largo`. Sin la primera rama,
  marcar "no corrió" y oficializar en el mismo gesto bloquearía mal. Asserts `G3` y `G4`.
- **`saveMontas()` actualiza fila por fila**, igual que `savePesoBalanza()`. No es lo más
  eficiente, pero son ≤14 filas y mantiene el patrón del archivo. No inventé un upsert nuevo.
- **`closeMontas()` pregunta si hay cambios sin guardar** (`_moHasChanges`, calcado de
  `_pbHasChanges`). El modal de pesos tiene esa función pero **no la llama** desde `closePesoBalanza` —
  no lo arreglé ahí, está fuera de alcance; lo anoto como hallazgo.
- **La alta rápida chequea duplicado por apellido+nombre** antes de insertar, para no sembrar
  dos "GONZALEZ, JOSE". No es una restricción de la DB, es una comprobación en cliente.

---

## 3. El diff

```diff
diff --git a/resultados.html b/resultados.html
index 8ed57bf..00e050b 100644
--- a/resultados.html
+++ b/resultados.html
@@ -291,6 +291,10 @@
     .pb-td { padding:8px 14px; font-size:13px; border-bottom:1px solid rgba(201,168,76,0.1); }
     .pb-invalid { border-color:#e55 !important; background:rgba(229,85,85,0.08); }
     .pb-input { width:80px; padding:6px 8px; font-size:13px; border-radius:8px; background:var(--input-bg); border:1px solid var(--border); color:var(--text); text-align:right; font-family:'DM Sans',sans-serif; }
+    .mo-select { width:100%; padding:6px 8px; font-size:13px; border-radius:8px; background:var(--input-bg); border:1px solid var(--border); color:var(--text); font-family:'DM Sans',sans-serif; }
+    .mo-select.mo-vacio { border-color:#e5a55e; background:rgba(229,165,94,0.10); }
+    .mo-alta { display:flex; gap:8px; align-items:center; padding:10px 14px; border-top:1px solid var(--border); }
+    .mo-alta input { flex:1; min-width:0; padding:6px 8px; font-size:13px; border-radius:8px; background:var(--input-bg); border:1px solid var(--border); color:var(--text); font-family:'DM Sans',sans-serif; }
 
     /* ── Auth overlay ── */
     #auth-overlay { position:fixed;inset:0;background:var(--bg);z-index:9999;display:flex;align-items:center;justify-content:center; }
@@ -355,6 +359,38 @@
   </div>
 </div>
 
+<!-- Modal: Montas (jockey que corrio realmente) -->
+<div class="modal-overlay" id="modal-montas">
+  <div class="modal" style="max-width:660px;">
+    <div class="modal-header">
+      <h3 id="mo-title">Montas</h3>
+      <button class="btn-close" onclick="closeMontas()">&#10005;</button>
+    </div>
+    <div class="modal-body" style="padding:0;">
+      <table style="width:100%;border-collapse:collapse;">
+        <thead>
+          <tr>
+            <th class="pb-th" style="width:48px;">N&deg;</th>
+            <th class="pb-th">Caballo</th>
+            <th class="pb-th" style="width:280px;">Jockey que corri&oacute;</th>
+          </tr>
+        </thead>
+        <tbody id="mo-tbody"></tbody>
+      </table>
+      <div class="mo-alta">
+        <span style="font-size:12px;color:var(--muted);white-space:nowrap;">Jockey nuevo:</span>
+        <input type="text" id="mo-alta-apellido" placeholder="Apellido" autocomplete="off">
+        <input type="text" id="mo-alta-nombre" placeholder="Nombre" autocomplete="off">
+        <button class="btn-outline" onclick="altaJockeyRapida()">+ Crear</button>
+      </div>
+    </div>
+    <div class="modal-footer">
+      <button class="btn-outline" onclick="closeMontas()">Cerrar</button>
+      <button class="btn-primary" onclick="saveMontas()">Guardar y cerrar</button>
+    </div>
+  </div>
+</div>
+
 <!-- Chapa dropdown compartido — posicionado via JS -->
 <div id="chapa-shared-dd" class="chapa-shared-dd"></div>
 
@@ -464,7 +500,7 @@ function toast(msg, type='success') {
 async function init() {
   const [{ data: reuns }, { data: profs }, { data: spcs }] = await Promise.all([
     sb.from('reuniones').select('id,numero,fecha,estado,hipodromos(nombre)').eq('club_id', CLUB_ID).order('fecha', {ascending:false}),
-    sb.from('profesionales').select('id,nombre,apellido').eq('club_id', CLUB_ID),
+    sb.from('profesionales').select('id,nombre,apellido,tipo').eq('club_id', CLUB_ID),
     sb.from('spcs').select('id,nombre').order('nombre'),
   ]);
   reuniones = reuns || [];
@@ -863,6 +899,7 @@ function renderFormulario(carrera, res, pos, apus, insc) {
             <div class="actions-grp">
               <button class="btn-outline" onclick="f8Dividendos()">Recargar dividendos <kbd>F8</kbd></button>
               <button class="btn-outline" onclick="openPesoBalanza()">⚖️ Pesos balanza</button>
+              <button class="btn-outline" onclick="openMontas()">🏇 Montas</button>
             </div>
             <div class="actions-grp">
               <button class="btn-primary" onclick="aplicar('${carrera.id}','provisional')">Aplicar <kbd>F10</kbd></button>
@@ -1579,6 +1616,25 @@ async function cancelar(carreraId) {
 // del cliente, NO transacción única: si la generación falla tras marcar oficial, la carrera
 // queda oficial sin liquidar → se arregla con "Recalcular reunión" en liquidaciones.html.
 async function oficializar(carreraId) {
+  // ═══ GATE MONTAS — INICIO (el probe extrae este bloque por estas anclas) ═══
+  // Sin jockey no se oficializa. El motor descarta la línea en SILENCIO
+  // (liquidaciones-engine.js, addActor: `if (!id) return;`): oficializar con el campo vacío no
+  // da error, simplemente el jockey no cobra y nadie se entera hasta que alguien mira el recibo.
+  // Medido el 2026-08-28 sobre auditoria: pasó 19 veces en R6 y 9 en R8 — ratificados que
+  // LARGARON, con jockey null, parchados a mano días después (R8: el 17/08 a las 23:11).
+  // Bloqueo duro y no advertencia: hoy la exposición es 0 (de los que largaron, ninguno sin
+  // jockey), así que no frena nada que ya esté bien; y el 20/09 la carga la hace alguien que
+  // usa SGH por primera vez, que a una advertencia le da Aceptar.
+  const faltanMontas = montasFaltantes(carreraId);
+  if (faltanMontas.length) {
+    const lista = faltanMontas.map(n => `  • ${n}`).join('\n');
+    const msg = `No se puede oficializar: ${faltanMontas.length} caballo(s) que largaron no tienen jockey cargado.\n\n${lista}\n\n`
+              + `Sin jockey, la liquidación no genera la línea de premio de esa monta y no avisa.\n\n`
+              + `¿Abrir Montas para cargarlos?`;
+    if (confirm(msg)) openMontas();
+    return;
+  }
+  // ═══ GATE MONTAS — FIN ═══
   if (!confirm('¿Hacer oficial el resultado y generar su liquidación?\nEs reversible: se puede des-oficializar mientras no haya pagos emitidos.')) return;
   await aplicar(carreraId, 'oficial');
   const res = resultados[carreraId];
@@ -1858,6 +1914,172 @@ async function savePesoBalanza() {
   document.getElementById('modal-peso-balanza').classList.remove('open');
 }
 
+/* ═══════════════════════════════════════════════
+   MONTAS — el jockey que corrió realmente
+   Fede (2026-08-28): "tiene que cargar todo y también poner los jockeys que corrieron
+   realmente cada caballo. Eso es importantísimo. Entonces generamos la oficialidad de la
+   carrera con los datos correctos."
+   Los cambios de monta los pasa Yesi el día de la reunión, después de las 12:00 — justo
+   cuando el selector de jockey de ratificacion.html ya quedó disabled (calcCierreStatus).
+   Este modal es el punto de carga en la pantalla donde el operador ya está parado.
+   Escribe inscripciones.jockey_titular_id, que es el campo que la liquidación lee de punta a
+   punta (motor → línea → recibo): sin schema nuevo, sin tocar liquidaciones-engine.js.
+   Misma forma que openPesoBalanza/savePesoBalanza, unas líneas más arriba.
+═══════════════════════════════════════════════ */
+let moOriginal = {};
+
+// Ratificados de la carrera ordenados por GATERA (numero_partidor ASC, los sin gatera al
+// final). Mismo orden que el modal de pesos y que renumerarChapas.
+function moInscripciones(carreraId) {
+  return inscripciones
+    .filter(i => i.carrera_id === carreraId && i.estado === 'ratificado')
+    .sort((a, b) => (a.numero_partidor || 999) - (b.numero_partidor || 999));
+}
+
+// Opciones del desplegable. El SUPLENTE va primero y etiquetado, igual que
+// ratificacion.html:840-844: es la única utilidad implementada de jockey_suplente_id y hoy se
+// apaga con el gate de las 12:00. (Hay 0 suplentes cargados sobre 249 inscripciones al
+// 2026-08-28; el orden está igual para cuando se empiecen a usar.)
+function moOpciones(i) {
+  const jockeys = Object.values(profsMap)
+    .filter(p => p.tipo === 'jockey' || p.tipo === 'ambos')
+    .sort((a, b) => (a.apellido || '').localeCompare(b.apellido || '', 'es'));
+  const supl = i.jockey_suplente_id ? profsMap[i.jockey_suplente_id] : null;
+  let opts = `<option value=""${!i.jockey_titular_id ? ' selected' : ''}>— Sin asignar —</option>`;
+  if (supl) {
+    const sel = i.jockey_titular_id === supl.id ? ' selected' : '';
+    opts += `<option value="${supl.id}"${sel}>${supl.apellido}, ${supl.nombre} (suplente)</option>`;
+  }
+  jockeys.filter(p => !supl || p.id !== supl.id).forEach(p => {
+    const sel = i.jockey_titular_id === p.id ? ' selected' : '';
+    opts += `<option value="${p.id}"${sel}>${p.apellido}, ${p.nombre}</option>`;
+  });
+  return opts;
+}
+
+function moRenderFilas() {
+  const insc = moInscripciones(currentCarreraId);
+  const chapaForInsc = renumerarChapas(insc);
+  document.getElementById('mo-tbody').innerHTML = insc.map(i => {
+    const spc = spcsMap[i.spc_id];
+    return `<tr>
+      <td class="pb-td">${chapaForInsc[i.id] ?? '—'}</td>
+      <td class="pb-td" style="font-weight:600;">${spc?.nombre || '—'}</td>
+      <td class="pb-td">
+        <select class="mo-select${i.jockey_titular_id ? '' : ' mo-vacio'}" id="mo-${i.id}"
+                onchange="this.classList.toggle('mo-vacio', !this.value)">${moOpciones(i)}</select>
+      </td>
+    </tr>`;
+  }).join('');
+}
+
+function openMontas() {
+  if (!currentCarreraId) return;
+  const carrera = carreras.find(c => c.id === currentCarreraId);
+  document.getElementById('mo-title').textContent =
+    `Montas — Carrera N° ${carrera?.numero_carrera_programa ?? carrera?.numero_turno ?? '?'}`;
+  moOriginal = {};
+  moInscripciones(currentCarreraId).forEach(i => { moOriginal[i.id] = i.jockey_titular_id || null; });
+  moRenderFilas();
+  document.getElementById('mo-alta-apellido').value = '';
+  document.getElementById('mo-alta-nombre').value   = '';
+  document.getElementById('modal-montas').classList.add('open');
+}
+
+function _moHasChanges() {
+  return Object.keys(moOriginal).some(id => {
+    const el = document.getElementById(`mo-${id}`);
+    if (!el) return false;
+    return (el.value || null) !== moOriginal[id];
+  });
+}
+
+function closeMontas() {
+  if (_moHasChanges() && !confirm('Hay montas sin guardar. ¿Descartar?')) return;
+  document.getElementById('modal-montas').classList.remove('open');
+}
+
+// Alta rápida. 4 de los 22 jockeys que corrieron en R6 (20/06) recién se cargaron en
+// profesionales entre el 05 y el 07/08 — mes y medio después. Sin esta salida, el gate duro
+// deja al operador trabado cuando corre un jockey que todavía no está en la base.
+// Payload mínimo, mismo shape que jockeys.html:384. El resto de la ficha (matrícula, DNI,
+// categoría, patente) se completa después en jockeys.html.
+async function altaJockeyRapida() {
+  const apellido = document.getElementById('mo-alta-apellido').value.trim();
+  const nombre   = document.getElementById('mo-alta-nombre').value.trim();
+  if (!apellido || !nombre) { toast('Apellido y nombre son obligatorios', 'error'); return; }
+  const dup = Object.values(profsMap).find(p =>
+    (p.apellido || '').toLowerCase() === apellido.toLowerCase() &&
+    (p.nombre   || '').toLowerCase() === nombre.toLowerCase());
+  if (dup) { toast(`Ya existe: ${dup.apellido}, ${dup.nombre}`, 'error'); return; }
+  const { data, error } = await sb.from('profesionales')
+    .insert({ club_id: CLUB_ID, tipo: 'jockey', nombre, apellido, estado: 'activo', activo: true })
+    .select('id,nombre,apellido,tipo').single();
+  if (error) { console.error('[altaJockeyRapida]', error); toast(error.message, 'error'); return; }
+  profsMap[data.id] = data;
+  // Re-render preservando lo que el operador ya eligió en las filas.
+  const elegidos = {};
+  Object.keys(moOriginal).forEach(id => {
+    const el = document.getElementById(`mo-${id}`);
+    if (el) elegidos[id] = el.value || null;
+  });
+  moRenderFilas();
+  Object.entries(elegidos).forEach(([id, val]) => {
+    const el = document.getElementById(`mo-${id}`);
+    if (el && val) { el.value = val; el.classList.toggle('mo-vacio', !el.value); }
+  });
+  document.getElementById('mo-alta-apellido').value = '';
+  document.getElementById('mo-alta-nombre').value   = '';
+  toast(`Jockey creado: ${apellido}, ${nombre}`);
+}
+
+async function saveMontas() {
+  const insc = moInscripciones(currentCarreraId);
+  const updates = [];
+  for (const i of insc) {
+    const el = document.getElementById(`mo-${i.id}`);
+    if (!el) continue;
+    const val = el.value || null;
+    if (val !== moOriginal[i.id]) updates.push({ id: i.id, jockey_titular_id: val });
+  }
+  if (!updates.length) { document.getElementById('modal-montas').classList.remove('open'); return; }
+  const errors = [];
+  for (const u of updates) {
+    const { error } = await sb.from('inscripciones')
+      .update({ jockey_titular_id: u.jockey_titular_id }).eq('id', u.id);
+    if (error) { console.error('[saveMontas]', error); errors.push(error); }
+    else {
+      const local = inscripciones.find(i => i.id === u.id);
+      if (local) local.jockey_titular_id = u.jockey_titular_id;
+      moOriginal[u.id] = u.jockey_titular_id;
+    }
+  }
+  if (errors.length) { toast(`Error al guardar ${errors.length} monta(s)`, 'error'); return; }
+  toast(`${updates.length} monta(s) guardada(s)`, 'success');
+  document.getElementById('modal-montas').classList.remove('open');
+}
+
+// Ratificados que LARGARON y no tienen jockey — lo que mira el gate de oficializar().
+// Los "no corrió" se excluyen con la misma fuente que usa el marcador (noLargoMandiles +
+// renumerarChapas) cuando la carrera es la abierta; si no, cae a lo persistido en
+// resultado_posiciones. Los forfait y mal_inscrito ya quedaron afuera por estado==='ratificado'.
+// Mismo criterio que el armado de perfInserts en oficializar().
+function montasFaltantes(carreraId) {
+  const insc = moInscripciones(carreraId);
+  let noLargo;
+  if (carreraId === currentCarreraId) {
+    const chapaForInsc = renumerarChapas(insc);
+    noLargo = new Set(insc.filter(i => noLargoMandiles.has(chapaForInsc[i.id])).map(i => i.id));
+  } else {
+    const res = resultados[carreraId];
+    const pos = (res && posicionesMap[res.id]) || [];
+    noLargo = new Set(pos.filter(p => p.no_largo).map(p => p.inscripcion_id));
+  }
+  return insc
+    .filter(i => !noLargo.has(i.id) && !i.jockey_titular_id)
+    .map(i => spcsMap[i.spc_id]?.nombre || '(sin nombre)');
+}
+
 /* ═══════════════════════════════════════════════
    ARRANQUE
 ═══════════════════════════════════════════════ */
```

El probe (`tests/probe_montas_reales.mjs`, 250 líneas) va completo en la branch; no lo pego acá
para no duplicarlo. Su cabecera lista los 13 grupos de checks.

---

## 4. Probe — 28 asserts, real-code, sin browser, read-only

Patrón vigente de `tests/README.md`: extrae `moInscripciones`, `moOpciones` y `montasFaltantes`
del propio `resultados.html` por nombre con balance de llaves, y **el bloque del gate por sus
anclas** `GATE MONTAS — INICIO/FIN`. Los corre con `new AsyncFunction(...)` inyectando el
`renumerar-chapas.js` real y stubs de `confirm` / `openMontas` que registran las llamadas.

**No escribe una sola fila.** Los escenarios se arman clonando en memoria filas reales de R8
traídas de producción y mutando la copia. No hace falta `restore` porque no hay `snapshot`.

```bash
set -a; . ./.env; set +a
node tests/probe_montas_reales.mjs
```

```
── Probe montas reales + gate de oficialización ──
✅  S0 · el archivo tiene gate + modal (contra main falla acá)
✅  G2 · carrera completa → el gate deja pasar — 10 ratificados, 0 sin jockey
✅  G2b · no dispara el diálogo del gate
✅  G1 · ratificado que largó sin jockey → el gate rechaza
✅  G1b · el mensaje nombra al caballo, no es genérico — TOUCH OF BLUE
✅  G1c · el mensaje dice cuántos faltan
✅  G6 · al bloquear NO se oficializa nada
✅  G6b · ofrece abrir Montas y lo abre si el operador acepta
✅  G6c · el gate corre ANTES del confirm de oficializar
✅  G3 · sin jockey y sin marcar → rechaza — mandil 1
✅  G3b · el mismo caballo marcado "no corrió" → pasa
✅  G4 · hay en R8 una carrera con no_largo persistido para probar — 355537ae-3a74-49ad-b283-26008cf6f8ba
✅  G4b · el no_largo elegido es un ratificado
✅  G4c · no_largo persistido sin jockey → NO bloquea — QUINIELA TREND
✅  G5 · forfait sin jockey → no bloquea
✅  G5 · mal_inscrito sin jockey → no bloquea
✅  G5 · inscripto sin jockey → no bloquea
✅  M1 · el modal ordena por gatera (numero_partidor ASC) — gateras: 1,2,3,4,5,6,7,8,9,10
✅  M1b · los sin gatera quedan al final
✅  M2 · el suplente va primero, después de "Sin asignar" — GUZMAN, CLAUDIO (suplente)
✅  M2b · el suplente no aparece duplicado más abajo
✅  M3 · sin suplente: "Sin asignar" primero — — Sin asignar —
✅  M3b · el resto va alfabético por apellido
✅  M4 · sólo entran jockey|ambos, no entrenadores — probado contra Gimenez (entrenador)
✅  M4b · están todos los jockeys del club — 46 en el select vs 46 en la base
✅  M2c · marca selected el jockey actual
✅  M5 · montasFaltantes sobre R8 coincide con la base — código 0 vs base 0
✅  M5b · R8 hoy no tiene ratificados que largaron sin jockey — si esto falla, R8 quedaría bloqueada al re-oficializar

28/28 OK
```

Cobertura contra lo pedido:

| Pedido | Assert |
|---|---|
| El gate rechaza una carrera con un ratificado sin jockey | `G1`, `G1b`, `G1c` |
| El gate deja pasar una carrera completa | `G2`, `G2b` |
| Los `no_largo` no cuentan | `G3`/`G3b` (marcador abierto), `G4`/`G4b`/`G4c` (persistido) |
| Los forfait no cuentan | `G5` (+ `mal_inscrito` e `inscripto` de yapa) |
| El modal ordena por gatera | `M1`, `M1b` |
| El suplente va primero | `M2`, `M2b` |
| Sensibilidad: contra main falla | §5 |

### 4.1 Un detalle honesto sobre `M2`

**No hay ningún suplente cargado en producción**: 0 de 249 inscripciones tienen
`jockey_suplente_id`. El assert `M2` inyecta uno en la copia en memoria (`GUZMAN, CLAUDIO`) para
poder probar el orden. Es decir: **el orden con suplente está probado contra un dato fabricado**,
no observado. Es lo máximo que se puede afirmar hoy. Si Dolores nunca usa el campo, esa rama del
código no se va a ejecutar nunca en prod.

---

## 5. Sensibilidad — el probe mide algo

### 5.1 Contra `main`

```bash
git show main:resultados.html > resultados.html   # temporal
node tests/probe_montas_reales.mjs
```

```
❌ S0 — resultados.html no tiene los cambios. El probe mide algo: contra main corta acá.
❌  S0 · el archivo tiene gate + modal — faltan: moInscripciones, moOpciones, montasFaltantes, openMontas, saveMontas
exit=1
```

Corta limpio en `S0` y no corre los otros 27, porque el código que prueban **no existe** en
`main`. Es la sensibilidad correcta para código nuevo, pero es débil: sólo demuestra que el
probe nota la ausencia del archivo, no que los asserts del gate midan el gate.

### 5.2 Mutation test — la prueba fuerte

Para cerrar esa duda, neutralicé el gate dejando todo lo demás en pie
(`const faltanMontas = [];` en lugar de la llamada real) y volví a correr:

```
✅  S0 · el archivo tiene gate + modal        ← S0 sigue pasando: no es S0 el que mide
❌  G1 · ratificado que largó sin jockey → el gate rechaza
❌  G1b · el mensaje nombra al caballo, no es genérico
❌  G1c · el mensaje dice cuántos faltan
❌  G6 · al bloquear NO se oficializa nada
❌  G6b · ofrece abrir Montas y lo abre si el operador acepta
❌  G3 · sin jockey y sin marcar → rechaza
22/28 OK · 6 FALLAN
```

Con el gate neutralizado caen exactamente los 6 asserts que lo verifican, y `S0` sigue en verde.
Los asserts del gate miden el gate.

El archivo se restauró después de cada corrida; md5 verificado contra la copia de la branch:

```
9609e7fc0d0cadd4e08e04347b72b90a  resultados.html
9609e7fc0d0cadd4e08e04347b72b90a  .../resultados.branch.html
```

---

## 6. Lo que NO hice

- **No apliqué nada a `main`.** `main` sigue en `2754c5f`, working tree limpio.
- **No mergeé.** La branch `feat/montas-reales-y-gate` (`7f3827f`) está pusheada y sola.
- **No toqué** `ratificacion.html`, `inscripciones.html`, `liquidaciones-engine.js` ni
  `hora_cierre_ratificacion`.
- **No agregué columnas** ni corrí una migración. Cero DDL, cero DML: todas las consultas de
  este informe son `SELECT`.
- **No implementé la opción 3** del relevamiento (`resultado_posiciones.jockey_id`).

---

## 7. Hallazgos laterales (no tocados, para decidir aparte)

1. **`resultados.oficializado_at` y `oficializado_por` nunca se escriben.** NULL en las 19 filas
   de `resultados`. El histórico no registra quién oficializó ni cuándo. Es el bug que hizo
   fallar en silencio mi primera medición de §0.2. Arreglo chico dentro de `oficializar()`, pero
   es alcance nuevo.
2. **`closePesoBalanza()` no llama a `_pbHasChanges()`.** La función existe
   (`resultados.html:1803`) pero el botón Cerrar del modal de pesos descarta sin preguntar. En
   Montas sí lo cablé; no toqué el de pesos.
3. **52 de 249 inscripciones no tienen jockey**, y el motor las saltea sin avisar. El gate del
   punto B cubre el momento de oficializar, pero no la inscripción: si nadie oficializa, nadie
   se entera.
4. **Reunión de prueba 9999 sigue viva** con 90 líneas de liquidación, 4 pagadas con recibo.
   Ensucia toda consulta agregada. Vencida desde el 20/06. Ya es A5 en la auditoría del 27/08.

---

## 8. Preguntas abiertas

1. **¿La alta rápida de jockey va?** Está implementada (§0.3). Crea con
   `{club_id, tipo:'jockey', nombre, apellido, estado:'activo', activo:true}` — el resto de la
   ficha (matrícula, DNI, categoría, patente) queda en null hasta que alguien la complete en
   `jockeys.html`. Si preferís que un jockey sólo se cree desde su módulo, la saco.
2. **¿"Montas" es la palabra?** Usé el término que usaste vos y que ya está en
   `probe_incentivos_montas.mjs` y en el resumen de liquidaciones ("montas perdidas"). El botón
   dice `🏇 Montas`. Si Fede le dice distinto, es un string.
3. **¿El gate debería mirar también los `inscripto` sin ratificar?** Hoy no: sólo
   `estado === 'ratificado'`. Un `inscripto` que largó sería un error de otro tipo.
4. **¿Hace falta que el modal quede accesible después de oficializar?** Hoy la botonera con
   `🏇 Montas` es la del formulario de carga; en la vista oficial (`renderOficial`) no aparece.
   Corregir una monta post-oficialización requiere des-oficializar primero. Es más estricto y me
   pareció lo conservador, pero es decisión de producto.
