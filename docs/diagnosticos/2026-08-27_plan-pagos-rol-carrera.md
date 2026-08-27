# Plan + diff — rol y nº de carrera en la pantalla de Pagos (SIN APLICAR)

| | |
|---|---|
| **Fecha** | 2026-08-27 |
| **Estado** | 🟡 **SIN APLICAR.** Branch pusheada, **NO mergeada a `main`**. No llegó a producción. |
| **Branch del código** | `feat/pagos-rol-y-carrera` — `aee09bc`, sobre `main` `68444a2` |
| **SHA de este informe** | `94952bf` — branch `reports` |
| **Probe** | `tests/probe_pagos_rol_carrera.mjs` — **32/32, exit 0** |
| **Antecedente** | `2026-08-27_relevamiento-pagos.md` (`64542b5`) |
| **Alcance** | Consulta y render. **Cero cambios de modelo de datos, cero DDL, cero escritura en prod.** |

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

SELECT count(*) AS spcs_count FROM spcs;
[{"spcs_count":181}]
```

---

## Números de resumen

| # | | |
|---|---|---|
| **1** | Asserts del probe | **32 / 32 OK**, exit 0 |
| **2** | Diff | **+70 / −18** en `liquidaciones.html`, 1 archivo de código |
| **3** | Beneficiarios cuya tarjeta cambia de rótulo | **127 de 127** |
| **4** | Beneficiarios con más de un rol — el caso que decide el diseño de 1c | **1** (ALDECOA, IVAN) |
| **5** | Líneas que caen al genérico "profesional" después del cambio | **0 de 299** |
| **6** | Líneas pagables rescatadas por el respaldo `?? carrera_id` | **0** — va por corrección, no por volumen |

---

## ⚠️ Gate

**No apliqué nada y no mergeé a `main`.** El código vive en `feat/pagos-rol-y-carrera`; `main` sigue en `68444a2` y GitHub Pages sirve `main`, así que producción está intacta. Con tu OK explícito, mergeo.

---

# 1. La decisión que pediste antes de codear (punto 1c)

Preguntaste si alcanza con derivar el rol de la primera línea o hay que mostrar todos los presentes, verificando cuál es el caso con datos reales. **Lo medí primero. Hay que mostrarlos todos.**

Repliqué `rolDeLinea()` en SQL y conté roles distintos por beneficiario sobre las líneas pagables:

```sql
WITH rol AS (
  SELECT beneficiario_tipo, beneficiario_id,
    CASE
      WHEN concepto_tipo::text = 'bono'                 THEN 'Propietario'
      WHEN concepto_tipo::text = 'incentivo_entrenador' THEN 'Entrenador'
      WHEN concepto_tipo::text = 'incentivo_jockey'     THEN 'Jockey'
      WHEN substring(descripcion from '—\s*(Propietario|Entrenador|Jockey)') IS NOT NULL
        THEN substring(descripcion from '—\s*(Propietario|Entrenador|Jockey)')
      WHEN beneficiario_tipo::text = 'propietario' THEN 'Propietario'
      WHEN beneficiario_tipo::text = 'profesional' THEN 'Profesional'
      ELSE '' END AS rol
  FROM liquidacion_detalle
  WHERE estado_linea='impago' AND recibo_id IS NULL AND beneficiario_tipo <> 'club'
), g AS (
  SELECT beneficiario_tipo, beneficiario_id, count(*) lineas,
         count(DISTINCT rol) roles_distintos, string_agg(DISTINCT rol,' / ' ORDER BY rol) roles
  FROM rol GROUP BY 1,2
)
SELECT roles_distintos, count(*) beneficiarios, sum(lineas) lineas,
       string_agg(DISTINCT roles,' | ') combinaciones
FROM g GROUP BY 1 ORDER BY 1;
```

```json
[{"roles_distintos":1,"beneficiarios":126,"lineas":"297","combinaciones":"Entrenador | Jockey | Propietario"},
 {"roles_distintos":2,"beneficiarios":1,  "lineas":"2",  "combinaciones":"Entrenador / Jockey"}]
```

**126 de 127 tienen un rol solo. Uno tiene dos.** Quién es:

```json
[{"persona":"ALDECOA, IVAN","tipo":"ambos","id":"17ea2904-ce23-4ba1-94be-202b1f62eb50",
  "roles":"Entrenador / Jockey","lineas":2}]
```

Es el único `profesionales.tipo = 'ambos'` con deuda abierta. Sus dos líneas pagables tienen roles distintos: **derivar de la primera diría "Entrenador" y le borraría la línea de Jockey de la vista.** Un caso sobre 127 es poco, pero es exactamente el caso que Valeria reportó —el mismo nombre repetido sin poder distinguirlo— y es justo donde la etiqueta tiene que ser precisa.

**Decisión: mostrar todos los roles presentes, unidos con ` / `.** Tres razones:

1. **Es correcto en los 127 casos.** Con un solo rol, `join` devuelve ese rol y el resultado es idéntico a derivar del primero. Con dos, no miente.
2. **No es un patrón nuevo.** El encabezado del recibo ya hace exactamente esto desde `67f9371` (`:977`, `rolesLineas.join(' / ')`). Usar otro criterio en la pantalla sería inventar una segunda regla para el mismo dato.
3. **Cuesta cero.** El agrupador ya recorre todas las líneas del beneficiario para sumar el total; acumular un `Set` de roles en el mismo bucle no agrega ni una consulta.

Verifiqué además que **ninguna línea cae a la rama genérica** de `rolDeLinea`:

```json
[{"por_concepto_tipo":169,"por_descripcion":130,"cae_al_generico":0,"total":299}]
```

169 líneas se resuelven por `concepto_tipo`, 130 por el regex sobre `descripcion`, **0 por el genérico**. Es decir: después del cambio **ninguna tarjeta vuelve a decir "profesional"**. El fallback a `g.tipo` queda igual, como red.

---

# 2. Vocabulario (punto 1d)

`etiquetaRoles` **no traduce nada**: devuelve literalmente lo que produce `rolDeLinea`, que son `Propietario`, `Entrenador` y `Jockey`. Confirmado sobre los datos: los únicos tres valores que aparecen en las 299 líneas.

No toqué `Incentivo cuidadores` del Resumen (`:655`), que sigue diciendo *cuidadores*. **Queda la inconsistencia a la vista, a propósito** — es la que sigue pendiente de Fede. El probe tiene dos asserts que fallan si alguien mete "cuidador" en estas funciones.

---

# 3. El diff

```
 liquidaciones.html | 88 +++++++++++++++++++++++++++++++++++++++++++-----------
 1 file changed, 70 insertions(+), 18 deletions(-)
```

```diff
diff --git a/liquidaciones.html b/liquidaciones.html
index 89e4ec0..f9afee2 100644
--- a/liquidaciones.html
+++ b/liquidaciones.html
@@ -773,6 +773,22 @@ async function cobLoadCarreras(){
   cobrosBuscar();
 }
 
+// Rol(es) de la tarjeta del listado. Se muestran TODOS los roles presentes, no el de la primera
+// línea: 126 de los 127 beneficiarios con deuda tienen un rol solo, pero uno (tipo 'ambos') cobra
+// como Entrenador y como Jockey en la misma tarjeta, y derivar del primero mentiría en la mitad de
+// sus líneas. Es además lo que ya hace el encabezado del recibo con rolesLineas.join(' / ').
+// El fallback a g.tipo es red: hoy no se usa (0 de 299 líneas caen al genérico).
+function etiquetaRoles(g){ return [...g.roles].join(' / ') || g.tipo; }
+
+// Carreras pendientes del beneficiario. Orden NUMÉRICO, no textual: hay reuniones de 12 turnos y
+// un sort de strings pondría C10 antes que C2. Máximo medido hoy: 5 carreras, 18 caracteres.
+function etiquetaCarreras(g){
+  const cs = [...g.carreras].sort((a,b)=>a-b).map(n=>`C${n}`).join(', ');
+  if (cs && g.sinCarrera) return `${cs} · + incentivo por reunión`;
+  if (cs) return cs;
+  return g.sinCarrera ? 'incentivo por reunión' : '—';
+}
+
 async function cobrosBuscar(){
   const q = (document.getElementById('cob-q').value||'').trim().toLowerCase();
   const rid = document.getElementById('cob-reunion')?.value || '';
@@ -787,7 +803,7 @@ async function cobrosBuscar(){
   }
   // líneas pagables (SOLO impago), persona (no club), sin recibo. Scope opcional por reunión.
   let qy = sb.from('liquidacion_detalle')
-    .select('beneficiario_tipo,beneficiario_id,monto_neto,reunion_id,inscripcion_id')
+    .select('beneficiario_tipo,beneficiario_id,monto_neto,reunion_id,inscripcion_id,carrera_id,descripcion,concepto_tipo')
     .eq('estado_linea','impago').neq('beneficiario_tipo','club').is('recibo_id', null);
   if (rid) qy = qy.eq('reunion_id', rid);
   const { data, error } = await qy;
@@ -800,13 +816,36 @@ async function cobrosBuscar(){
     cobCaballerizas = (cab||[]).map(c=>({nombre:(c.caballerizas?.nombre||'').toLowerCase(), propietario_id:c.propietario_id}));
   }
   const propIdsPorCaballeriza = q ? new Set(cobCaballerizas.filter(c=>c.nombre.includes(q)).map(c=>c.propietario_id)) : new Set();
+  // Nº de carrera de cada línea. Dos caminos, ninguno completo solo: `inscripcion_id` cubre los
+  // incentivos de entrenador (que no traen carrera_id) y `carrera_id` cubre las 3 líneas de
+  // premio/bono que quedaron sin inscripción. Se prueba inscripción primero y carrera_id de
+  // respaldo. El incentivo de jockey no tiene ninguno de los dos y eso es correcto: es por
+  // reunión, no por carrera — se rotula en la tarjeta, no se deja en blanco.
+  const lineas = (data||[]).filter(l => !inscFiltro || inscFiltro.has(l.inscripcion_id));
+  const bInscIds = [...new Set(lineas.map(l=>l.inscripcion_id).filter(Boolean))];
+  const { data: bInscs, error: eInsc } = bInscIds.length
+    ? await sb.from('inscripciones').select('id,carrera_id').in('id', bInscIds)
+    : { data: [] };
+  if (eInsc) console.error('[cobrosBuscar/inscripciones]', eInsc);
+  const inscCarrera = Object.fromEntries((bInscs||[]).map(i=>[i.id, i.carrera_id]));
+  const carreraDe = l => inscCarrera[l.inscripcion_id] ?? l.carrera_id;
+  const carrIds = [...new Set(lineas.map(carreraDe).filter(Boolean))];
+  const { data: bCarrs, error: eCarr } = carrIds.length
+    ? await sb.from('carreras').select('id,numero_turno,numero_carrera_programa').in('id', carrIds)
+    : { data: [] };
+  if (eCarr) console.error('[cobrosBuscar/carreras]', eCarr);
+  // GOTCHA: numero_carrera_programa puede ser null → fallback numero_turno. Nunca un offset.
+  const nroCarrera = Object.fromEntries((bCarrs||[]).map(c=>[c.id, c.numero_carrera_programa ?? c.numero_turno]));
   // agrupar por beneficiario (aplicando filtro de carrera si corresponde)
   const grupos = {};
-  for (const l of (data||[])) {
-    if (inscFiltro && !inscFiltro.has(l.inscripcion_id)) continue;
+  for (const l of lineas) {
     const k = `${l.beneficiario_tipo}|${l.beneficiario_id}`;
-    if (!grupos[k]) grupos[k] = {tipo:l.beneficiario_tipo, id:l.beneficiario_id, total:0, n:0};
+    if (!grupos[k]) grupos[k] = {tipo:l.beneficiario_tipo, id:l.beneficiario_id, total:0, n:0,
+                                 roles:new Set(), carreras:new Set(), sinCarrera:0};
     grupos[k].total += parseFloat(l.monto_neto)||0; grupos[k].n++;
+    const rol = rolDeLinea(l); if (rol) grupos[k].roles.add(rol);
+    const nro = nroCarrera[carreraDe(l)];
+    if (nro != null) grupos[k].carreras.add(nro); else grupos[k].sinCarrera++;
   }
   let lista = Object.values(grupos).map(g=>({...g, nombre:nombreBenef(g.tipo,g.id)}));
   if (q) lista = lista.filter(g => benefSearch(g.tipo,g.id).includes(q) || propIdsPorCaballeriza.has(g.id));
@@ -815,7 +854,7 @@ async function cobrosBuscar(){
   if (!lista.length) { cont.innerHTML = '<div class="empty-state"><div class="icon">∅</div><h3>Sin deuda pagable para esa búsqueda</h3></div>'; return; }
   cont.innerHTML = `<div class="liq-grid">${lista.map(g=>`<div class="liq-card">
     <div class="liq-header">
-      <div><div class="liq-prof">${g.nombre}</div><div class="liq-recibo">${g.tipo} · ${g.n} línea(s) pagable(s)</div></div>
+      <div><div class="liq-prof">${g.nombre}</div><div class="liq-recibo">${etiquetaRoles(g)} · ${g.n} línea(s) pagable(s) · ${etiquetaCarreras(g)}</div></div>
       <div style="display:flex;gap:16px;align-items:center;">
         <div class="monto-item"><div class="monto-lbl">Adeudado</div><div class="monto-val neto">${fmt(g.total)}</div></div>
         <button class="btn-sm btn-pagar" onclick="cobrosDetalle('${g.tipo}','${g.id}')">🧾 Pagar</button>
@@ -828,10 +867,10 @@ async function cobrosDetalle(tipo, id){
   // pagables = SOLO impago; retenidas aparte
   const [{ data: pag, error: ePag }, { data: ret }, { data: apos }] = await Promise.all([
     sb.from('liquidacion_detalle')
-      .select('id,concepto,monto_neto,posicion,reunion_id,inscripcion_id')
+      .select('id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id')
       .eq('beneficiario_tipo',tipo).eq('beneficiario_id',id).is('recibo_id',null).eq('estado_linea','impago'),
     sb.from('liquidacion_detalle')
-      .select('id,concepto,monto_neto,posicion,reunion_id,inscripcion_id,fecha_liberacion')
+      .select('id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id,fecha_liberacion')
       .eq('beneficiario_tipo',tipo).eq('beneficiario_id',id).is('recibo_id',null).eq('estado_linea','retenido'),
     // ISSUE-028 v1.1 — apoderados vigentes del beneficiario (read-only, solo display).
     sb.from('apoderados')
@@ -847,20 +886,27 @@ async function cobrosDetalle(tipo, id){
   const all = [...cobLineas, ...retLineas];
   const reunIds=[...new Set(all.map(l=>l.reunion_id).filter(Boolean))];
   const inscIds=[...new Set(all.map(l=>l.inscripcion_id).filter(Boolean))];
-  const [{data:reuns},{data:inscs}] = await Promise.all([
+  const carrIds=[...new Set(all.map(l=>l.carrera_id).filter(Boolean))];
+  const [{data:reuns},{data:inscs},{data:carrs}] = await Promise.all([
     reunIds.length? sb.from('reuniones').select('id,fecha,numero').in('id',reunIds):Promise.resolve({data:[]}),
     inscIds.length? sb.from('inscripciones').select('id,carrera_id,spcs(nombre),carreras(numero_turno,numero_carrera_programa)').in('id',inscIds):Promise.resolve({data:[]}),
+    carrIds.length? sb.from('carreras').select('id,numero_turno,numero_carrera_programa').in('id',carrIds):Promise.resolve({data:[]}),
   ]);
   const reunMap=Object.fromEntries((reuns||[]).map(r=>[r.id,r])); const inscMap=Object.fromEntries((inscs||[]).map(i=>[i.id,i]));
+  const carrMap=Object.fromEntries((carrs||[]).map(c=>[c.id,c]));
   const cellFecha=l=>{const r=reunMap[l.reunion_id];return r?new Date(r.fecha+'T12:00:00').toLocaleDateString('es-AR'):'—';};
-  const cellCarrera=l=>{const ins=inscMap[l.inscripcion_id];const n=ins?.carreras?.numero_carrera_programa ?? ins?.carreras?.numero_turno;return n?`C${n}`:'—';};
+  // numero_carrera_programa ?? numero_turno, primero por inscripción y de respaldo por carrera_id.
+  const cellCarrera=l=>{const ins=inscMap[l.inscripcion_id]; const d=carrMap[l.carrera_id];
+    const n = ins?.carreras?.numero_carrera_programa ?? ins?.carreras?.numero_turno
+           ?? d?.numero_carrera_programa ?? d?.numero_turno;
+    return n!=null?`C${n}`:'—';};
   const cellCaballo=l=>inscMap[l.inscripcion_id]?.spcs?.nombre||'—';
   const total = cobLineas.reduce((s,l)=>s+(parseFloat(l.monto_neto)||0),0);
   const rows = cobLineas.map(l=>`<tr><td><input type="checkbox" class="cob-chk" value="${l.id}" data-monto="${l.monto_neto}" checked onchange="cobrosRecalc()"></td>
-      <td>${cellFecha(l)}</td><td>${cellCarrera(l)}</td><td>${cellCaballo(l)}</td><td>${l.posicion?l.posicion+'°':'—'}</td><td>${l.concepto||''}</td>
+      <td>${cellFecha(l)}</td><td>${cellCarrera(l)}</td><td>${cellCaballo(l)}</td><td>${l.posicion?l.posicion+'°':'—'}</td><td>${rolDeLinea(l)||'—'}</td><td>${l.concepto||''}</td>
       <td style="text-align:right">${fmt(l.monto_neto)}</td></tr>`).join('');
   const retRows = retLineas.map(l=>`<tr>
-      <td>${cellFecha(l)}</td><td>${cellCarrera(l)}</td><td>${cellCaballo(l)}</td><td>${l.posicion?l.posicion+'°':'—'}</td><td>${l.concepto||''}</td>
+      <td>${cellFecha(l)}</td><td>${cellCarrera(l)}</td><td>${cellCaballo(l)}</td><td>${l.posicion?l.posicion+'°':'—'}</td><td>${rolDeLinea(l)||'—'}</td><td>${l.concepto||''}</td>
       <td style="text-align:right">${fmt(l.monto_neto)}</td>
       <td style="font-size:11px;color:var(--muted)">ref. ${l.fecha_liberacion||'—'}</td>
       <td><button class="btn-sm btn-aprobar" onclick="habilitarLinea('${l.id}','${tipo}','${id}')">✅ Habilitar</button></td></tr>`).join('');
@@ -875,12 +921,12 @@ async function cobrosDetalle(tipo, id){
     <div class="config-card" style="margin-top:16px;">
       <h2 style="font-size:18px;color:var(--accent);margin-bottom:6px;">Pago — ${cobBenef.nombre}</h2>
       ${apoBlock}
-      <table class="detalle-table"><thead><tr><th></th><th>Fecha</th><th>Carrera</th><th>Caballo</th><th>Puesto</th><th>Concepto</th><th style="text-align:right">Neto</th></tr></thead>
-        <tbody>${rows||'<tr><td colspan="7" style="text-align:center;padding:14px;color:var(--muted)">Sin líneas pagables</td></tr>'}</tbody>
-        <tfoot><tr><td colspan="6">TOTAL SELECCIONADO</td><td style="text-align:right;color:var(--success)" id="cob-total">${fmt(total)}</td></tr></tfoot>
+      <table class="detalle-table"><thead><tr><th></th><th>Fecha</th><th>Carrera</th><th>Caballo</th><th>Puesto</th><th>Rol</th><th>Concepto</th><th style="text-align:right">Neto</th></tr></thead>
+        <tbody>${rows||'<tr><td colspan="8" style="text-align:center;padding:14px;color:var(--muted)">Sin líneas pagables</td></tr>'}</tbody>
+        <tfoot><tr><td colspan="7">TOTAL SELECCIONADO</td><td style="text-align:right;color:var(--success)" id="cob-total">${fmt(total)}</td></tr></tfoot>
       </table>
       ${retLineas.length?`<h3 style="font-size:14px;color:var(--danger);margin:16px 0 6px;">🔒 Retenido por doping — habilitar para poder pagar</h3>
-      <table class="detalle-table"><thead><tr><th>Fecha</th><th>Carrera</th><th>Caballo</th><th>Puesto</th><th>Concepto</th><th style="text-align:right">Neto</th><th>Liberación</th><th></th></tr></thead>
+      <table class="detalle-table"><thead><tr><th>Fecha</th><th>Carrera</th><th>Caballo</th><th>Puesto</th><th>Rol</th><th>Concepto</th><th style="text-align:right">Neto</th><th>Liberación</th><th></th></tr></thead>
         <tbody>${retRows}</tbody></table>`:''}
       <div style="margin-top:12px;display:flex;gap:8px;">
         <button class="btn-primary" onclick="cobrosEmitir()">🧾 Emitir recibo</button>
@@ -938,19 +984,25 @@ function rolDeLinea(l){
 async function imprimirReciboCobro(recibo, lineaIds){
   // re-leer las líneas marcadas para el print
   const { data: lns, error: eLns } = await sb.from('liquidacion_detalle')
-    .select('concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id').eq('recibo_id',recibo.id);
+    .select('concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id').eq('recibo_id',recibo.id);
   if (eLns) console.error('[imprimirReciboCobro/lineas]', eLns);
   const reunIds=[...new Set((lns||[]).map(l=>l.reunion_id).filter(Boolean))];
   const inscIds=[...new Set((lns||[]).map(l=>l.inscripcion_id).filter(Boolean))];
-  const [{data:reuns},{data:inscs}] = await Promise.all([
+  const carrIds=[...new Set((lns||[]).map(l=>l.carrera_id).filter(Boolean))];
+  const [{data:reuns},{data:inscs},{data:carrs}] = await Promise.all([
     reunIds.length? sb.from('reuniones').select('id,fecha').in('id',reunIds):Promise.resolve({data:[]}),
     inscIds.length? sb.from('inscripciones').select('id,spcs(nombre),carreras(numero_turno,numero_carrera_programa)').in('id',inscIds):Promise.resolve({data:[]}),
+    carrIds.length? sb.from('carreras').select('id,numero_turno,numero_carrera_programa').in('id',carrIds):Promise.resolve({data:[]}),
   ]);
   const reunMap=Object.fromEntries((reuns||[]).map(r=>[r.id,r])); const inscMap=Object.fromEntries((inscs||[]).map(i=>[i.id,i]));
+  const carrMap=Object.fromEntries((carrs||[]).map(c=>[c.id,c]));
   const rolesLineas=[...new Set((lns||[]).map(rolDeLinea).filter(Boolean))];
   const rows=(lns||[]).map(l=>{const r=reunMap[l.reunion_id];const ins=inscMap[l.inscripcion_id];
     const fecha=r?new Date(r.fecha+'T12:00:00').toLocaleDateString('es-AR'):'—';
-    const nroCarr=ins?.carreras?.numero_carrera_programa ?? ins?.carreras?.numero_turno; const carrera=nroCarr?`C${nroCarr}`:'—'; const caballo=ins?.spcs?.nombre||'—';
+    const d=carrMap[l.carrera_id];
+    const nroCarr=ins?.carreras?.numero_carrera_programa ?? ins?.carreras?.numero_turno
+                ?? d?.numero_carrera_programa ?? d?.numero_turno;
+    const carrera=nroCarr!=null?`C${nroCarr}`:'—'; const caballo=ins?.spcs?.nombre||'—';
     const puesto=l.posicion?`${l.posicion}°`:'—';
     return `<tr><td>${fecha}</td><td>${carrera}</td><td>${caballo}</td><td>${puesto}</td><td>${rolDeLinea(l)||'—'}</td><td>${l.concepto||''}</td><td style="text-align:right">${fmt(l.monto_neto)}</td></tr>`;}).join('');
   // Fetch del club con logo_url (el global `club` puede no tenerlo en el flujo de Pagos).
```

---

# 4. Qué hace cada pedazo

## Cambio 1 — `rolDeLinea` en la pantalla

| punto | archivo:línea (en `main`) | qué se hizo |
|---|---|---|
| **1a** | `liquidaciones.html:830-834` | `descripcion`, `concepto_tipo` y `beneficiario_tipo` agregadas al SELECT de pagables **y** al de retenidas |
| **1b** | `:878` | columna `Rol` en la tabla del detalle, resuelta con `rolDeLinea(l)`; `colspan` 7→8 y 6→7 |
| **1b bis** | `:880` | misma columna en la tabla de retenidas — **ver §6, decisión que tomé** |
| **1c** | `:818` | `${g.tipo}` genérico reemplazado por `etiquetaRoles(g)` |
| **1d** | — | vocabulario intacto |

Nota sobre 1a: **también hubo que agregar `descripcion` y `concepto_tipo` al SELECT de `cobrosBuscar` (`:790`)**, no sólo al de `cobrosDetalle`. Vos señalaste `:830-833`, que es el detalle; pero el rol de la *tarjeta* se calcula sobre las líneas que trae `cobrosBuscar`, y esa query tampoco pedía esas columnas. Sin eso, `rolDeLinea` en el listado devolvería siempre el genérico.

## Cambio 2 — nº de carrera en la tarjeta

| punto | archivo:línea | qué se hizo |
|---|---|---|
| **2a** | `:790` | `carrera_id` agregado al SELECT de `cobrosBuscar` |
| **2b** | `:802-810` | resolución del nº por línea + acumulación por beneficiario; render en `:818` |
| **2c** | helpers nuevos | `numero_carrera_programa ?? numero_turno` en los dos lugares nuevos |
| **2d** | `etiquetaCarreras` | rótulo explícito para las líneas sin carrera |
| **2e** | `:856` y `:953` | respaldo `?? carrera_id` en el detalle y en el recibo |

Cómo se resuelve la carrera (`carreraDe`): **inscripción primero, `carrera_id` de respaldo.** Los dos caminos son complementarios y ninguno alcanza solo — los 108 `incentivo_entrenador` tienen inscripción y no `carrera_id`; las 3 líneas sueltas de premio/bono tienen `carrera_id` y no inscripción.

Dos consultas nuevas en `cobrosBuscar` (`inscripciones` y `carreras`, ambas por `.in(id)`), con `console.error` capturado en las dos — la regla de CLAUDE.md sobre `.catch` silencioso, y el mismo criterio de `2199974`: si fallan, la pantalla sigue andando sin números de carrera en vez de cortarle un cobro a Valeria.

### El orden es numérico, no textual

```javascript
const cs = [...g.carreras].sort((a,b)=>a-b).map(n=>`C${n}`).join(', ');
```

Las carreras de Dolores llegan a **12**, con 6 de dos dígitos:

```json
[{"min_nro":1,"max_nro":12,"carreras_dos_digitos":6,"sin_numero_programa":33,"carreras":49}]
```

Un `sort()` de strings daría `C1, C10, C12, C2, C3`. El probe tiene un assert dedicado y otro que verifica que el sort textual **daría distinto**, para que el test no pase por casualidad.

Dato colateral de esa query: **33 de 49 carreras no tienen `numero_carrera_programa`**, así que el `?? numero_turno` no es decorativo — carga con la mayoría de los casos.

### Texto propuesto para las líneas sin carrera (punto 2d)

Los 44 `incentivo_jockey` no tienen carrera porque son **por reunión**, no por carrera (`"Incentivo jockey por actuación en la reunión: $50.000,00"`). Propuesta:

| caso | beneficiarios | etiqueta |
|---|---|---|
| sólo carreras | 96 | `C3, C5` |
| mixto | 22 | `C3, C5 · + incentivo por reunión` |
| sólo sin carrera | 9 | `incentivo por reunión` |

Elegí `incentivo por reunión` y no `sin carrera` porque nombra **por qué** no hay carrera en vez de señalar una ausencia: un dato que falta y un dato que no corresponde no se leen igual. Usa además el vocabulario que ya escribe el motor. Si preferís otro texto, es una constante y se cambia en una línea.

Muestra real, salida del probe:

```
  Propietario           ·  3 línea(s) · C1, C5, C6
  Jockey                ·  8 línea(s) · C5, C6, C7, C8 · + incentivo por reunión
  Jockey                ·  6 línea(s) · C1, C7 · + incentivo por reunión
  Propietario           ·  2 línea(s) · C4, C6
  [multi-rol] Entrenador / Jockey · 2 línea(s) · C6 · + incentivo por reunión
```

### El respaldo `?? carrera_id` (punto 2e)

Aplicado en `:856` (detalle) y `:953` (recibo), con la consulta a `carreras` que hacía falta para alimentarlo. **Hoy no rescata ninguna línea pagable** — 0 impagas tienen `carrera_id` sin `inscripcion_id`; sobre el universo completo son 3 líneas. Va por corrección, como pediste.

Efecto colateral menor: en ambos lugares el `n ? ... : '—'` original pasó a `n != null ? ... : '—'`. Con los datos de hoy es equivalente (no hay carrera 0), pero un `0` legítimo dejaría de leerse como ausencia.

---

# 5. El probe — qué cubre

`tests/probe_pagos_rol_carrera.mjs`, real-code y read-only: extrae `rolDeLinea`, `etiquetaRoles` y `etiquetaCarreras` **del propio `liquidaciones.html`** por ancla y las corre contra producción. No es una copia de la lógica: si el archivo cambia, el probe corre lo nuevo.

**32/32, exit 0.**

| bloque | asserts | qué prueba |
|---|---|---|
| **Conexión del código** | 9 | Que las columnas del rol y `carrera_id` viajan en los tres SELECT; que la columna Rol está en las dos tablas; que los `colspan` acompañan; que la tarjeta usa los helpers y no `${g.tipo}`; que el respaldo `?? carrera_id` está en los dos lugares; y que **no aparecieron offsets artificiales** en el módulo |
| **Vocabulario (1d)** | 3 | Que ni `rolDeLinea` ni `etiquetaRoles` dicen "cuidador", y que los únicos roles sobre las 299 líneas reales son Propietario / Entrenador / Jockey |
| **Genérico (1e)** | 2 | Que ninguna línea cae a `Profesional`/`Club` y que ninguna tarjeta muestra el genérico |
| **Multi-rol (1c)** | 4 | Que existe al menos un beneficiario multi-rol —si no, el test no probaría nada—, que la etiqueta los muestra **todos**, que **derivar de la primera línea habría perdido un rol** (el contraejemplo, explícito), y que los mono-rol siguen mostrando exactamente su rol |
| **Orden (2b)** | 2 | `C1, C2, C3, C10, C12` y que un sort textual daría distinto |
| **Rótulo sin carrera (2c)** | 6 | Los tres formatos; que ninguna tarjeta real queda vacía o en `—`; que los 9 beneficiarios sólo-reunión quedan rotulados; y que **todas sus líneas son `incentivo_jockey`** — o sea que es ausencia legítima y no un dato que se perdió |
| **Resolución (2a/2d)** | 3 | Que las 256 líneas con carrera se resuelven como `numero_carrera_programa ?? numero_turno`; que el fallback **se ejerce de verdad**; y que el set de carreras de **las 127 tarjetas coincide con la base**, cotejado contra una segunda lectura cruda que no pasa por el código de pantalla |
| **Read-only** | 2 | `liquidacion_detalle` 493 y `spcs` 181 después de correr |

**Sensibilidad verificada.** Contra `main` el probe **ni arranca**:

```
Error: no encontré function etiquetaRoles( en liquidaciones.html
```

Mismo comportamiento que reportó `67f9371` para `probe_recibo_rol.mjs`. Los asserts de conexión del código, además, fallarían uno por uno si alguien revierte cualquiera de los pedazos por separado.

Correrlo:

```bash
set -a; . ./.env; set +a
node tests/probe_pagos_rol_carrera.mjs
```

---

# 6. Una decisión que tomé y podés revertir

Pediste la columna Rol en `:878`, que es la tabla de **pagables**. **La agregué también a la tabla de retenidas** (`:880`), que está en la misma pantalla y tiene la misma forma.

Motivo: sin eso, las líneas retenidas por doping del mismo beneficiario quedan exactamente tan indistinguibles como estaban —mismo caballo, mismo puesto, mismo `concepto`— y son 99 líneas sobre 398 pagables + retenidas. Un rótulo que aparece en la mitad de arriba de la pantalla y no en la de abajo se lee como un bug.

Es una línea de `<th>` y una de `<td>`. Si preferís dejar retenidas fuera de este cambio, se saca sin tocar nada más.

---

# 7. Lo que NO toqué

Respetado tal cual lo pediste:

- ❌ Búsqueda por profesional (`:753`) — ya funciona.
- ❌ Apellidos de entrenadores — 88/88 ya salen bien, no reproduce.
- ❌ Agrupación de las tarjetas — sigue por `beneficiario_tipo|beneficiario_id`. **Las 9 personas que cobran como propietario y entrenador siguen generando dos tarjetas y dos recibos.** El cambio 1c las hace distinguibles (una dirá `Propietario`, la otra `Entrenador`), pero no las unifica.
- ❌ Modelo de datos — ni una migración, ni un `ALTER`, ni una columna nueva.
- ❌ Búsqueda por caballeriza (`:796-802`) — intacta.
- ❌ Filtro por carrera — intacto, ver abajo.
- ❌ Vocabulario `cuidador` del Resumen (`:655`) — intacto.

## La colisión filtro-carrera / `incentivo_jockey` — **no la arreglé, y no empeora**

Pediste que avisara si el cambio 2 la empeoraba. **No la empeora; la hace visible.**

El filtro por carrera sigue descartando líneas por `inscripcion_id` (`:805`), así que los 44 `incentivo_jockey` siguen desapareciendo al elegir cualquier carrera — igual que antes, mismo código. El cambio 2 no toca esa rama: `lineas` se calcula con el mismo predicado que ya había.

Lo que sí cambia es que **ahora se nota**. Sin filtro, esos 9 beneficiarios muestran `incentivo por reunión` en la tarjeta, así que Valeria ve que tienen plata por reunión antes de filtrar. Si después filtra por carrera y desaparecen, la desaparición tiene una explicación que antes no estaba en pantalla.

Queda para otro trabajo, como dijiste.

---

# 8. Preguntas abiertas

1. **El texto `incentivo por reunión`** (§4, punto 2d) es propuesta mía. ¿Va, o preferís otro? Es una constante.
2. **La columna Rol en retenidas** (§6). ¿La dejo o la saco?
3. **`Entrenador` vs `cuidador`.** Sigue pendiente de Fede desde `67f9371`. Este cambio lo deja como está y ahora la inconsistencia se ve en dos lugares de la misma pantalla: la tarjeta dirá `Entrenador` y el Resumen `Incentivo cuidadores`.
4. **Las 9 personas con dos tarjetas.** Con el cambio 1c dejan de ser ambiguas, pero siguen siendo dos. Si Valeria espera un recibo único por persona, eso es la agrupación, que quedó fuera de alcance y es decisión de producto.
