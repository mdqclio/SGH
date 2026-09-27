# XSS — nombres del portal en pantallas del staff (ISSUE-018, H6): barrido + arreglo

- Fecha: 2026-09-27
- Barrido (Fase 1) leído en `main` @ `4d95511d4212bb30a7c18fb7a7045d7a2cfe458b`
- Arreglo (Fase 2): rama `fix/xss-usuarios-portal` @ `067722257009d464291a5e1392c41115dc724fb2`,
  **PR #20 abierto, sin merge** — https://github.com/mdqclio/SGH/pull/20
- Guards: `pwd` → `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` → **210** · ref → `unlhcuanfrtpatoipwve`
- Regla dura cumplida: **cero cambios en base, migraciones y RPC**. Las consultas a la base fueron SELECT
  (una de ellas dentro de `begin read only … rollback`). El probe escribe fixtures sintéticos en `usuarios` y en la
  reunión 9999 y los borra (verificado por estado, abajo).
- Anonimizado: no hay datos personales. Todo nombre/email de este informe es del fixture sintético del probe
  (`probe.xss.*@sgh.test`) o conteos.
- Informe previo: `docs/diagnosticos/2026-09-27_usuarios-roles-portal-escalada.md` (reports `703c96b`), H6.

---

## ⚠️ Hallazgo grave fuera de alcance (no se tocó: es base)

Barriendo "qué puede escribir un usuario del portal" apareció algo **peor que el XSS**: **14 tablas** tienen políticas
de escritura cuyo único filtro es `club_id = fn_get_user_club_id()` (o `fn_club_de_X(...) = fn_get_user_club_id()`),
**sin** `fn_is_staff()` ni `NOT fn_is_portal_user()`. `fn_get_user_club_id()` devuelve el club de **cualquier** usuario
activo, portal incluido, y los 18 usuarios del portal tienen `club_id` = Dolores. Resultado: un profesional o
propietario del portal puede, **por la API directa**, escribir en:

| Tabla | Políticas sin guard de staff/portal (ver barrido abajo) | Qué implica |
|---|---|---|
| `liquidacion_config` | `liquidacion_config_rls` (ALL) | cambiar los montos de incentivos / parámetros del motor de liquidación |
| `club_secuencias` | `club_secuencias_rls` (ALL) | tocar la numeración de recibos |
| `clubs` | `clubs_update_self_or_admin` (UPDATE) | cambiar nombre/sigla/datos del hipódromo — y `club-switcher.js:30` lo renderiza **sin escapar** en la pantalla del super_admin |
| `comision_config` | insert / update / delete | comisiones |
| `club_configuracion` | insert / update / delete | configuración del club |
| `carrera_apuestas` | insert / update / delete | apuestas habilitadas |
| `resultado_apuestas` | insert / update / delete | dividendos |
| `resultado_log` | insert / update / delete | log de resultados |
| `categorias_carrera` | insert / update / delete | categorías |
| `hipodromos` | insert / update / delete | hipódromos |
| `resoluciones` | insert / update / delete | resoluciones oficiales |
| `resolucion_entidades` | insert / update / delete | entidades de resoluciones |
| `novedades_reunion` | insert / update / delete | novedades de la reunión |
| `caballeriza_responsables` | insert / update / delete | titulares/copropietarios de caballerizas |

Evidencia (sólo lectura; se simula la sesión del usuario de portal más antiguo dentro de una transacción de solo
lectura que se revierte):

```sql
begin read only;
select set_config('request.jwt.claims', json_build_object('sub', (select auth_user_id::text from usuarios where rol='profesional' and activo and auth_user_id is not null order by created_at limit 1), 'role','authenticated')::text, true);
set local role authenticated;
select fn_is_staff() es_staff, fn_is_portal_user() es_portal, fn_get_user_club_id() is not null tiene_club,
 (select count(*) from liquidacion_config) liq_config_visibles,
 (select count(*) from clubs) clubs_visibles,
 (select count(*) from club_secuencias) secuencias_visibles,
 (select count(*) from comision_config) comision_visibles;
rollback;
```
```
es_staff | es_portal | tiene_club | liq_config_visibles | clubs_visibles | secuencias_visibles | comision_visibles
false    | true      | true       | 1                   | 1                  | 1                   | 0
```

`liquidacion_config_rls` y `club_secuencias_rls` son políticas `ALL` con la misma expresión para USING y WITH CHECK:
si la fila es visible, es escribible. **No se probó ninguna escritura** (regla dura). No está documentado en
`docs/ISSUES.md` (el patrón más cercano es ISSUE-090, que es otro: club NULL). Propuesta: ISSUE-093, migración con
`fn_is_staff()` en esas 14 tablas (mismo patrón que `sanciones_insert_update_staff.sql` del 25/09), con su probe
por perfil. **Merece prioridad sobre el resto del ISSUE-018.**

Barrido de políticas (salida completa). Además de INSERT/UPDATE, **11 de las 14 también dejan DELETE**:

```sql
select c.relname tabla, string_agg(p.polname||'('||p.polcmd::text||')', ', ' order by p.polname) politicas_sin_guard_staff_ni_portal
from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and p.polcmd in ('a','w','*','d')
 and coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')||coalesce(pg_get_expr(p.polqual,p.polrelid),'') ~ 'fn_get_user_club_id'
 and coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')||coalesce(pg_get_expr(p.polqual,p.polrelid),'') !~ 'fn_is_staff|fn_is_portal_user'
group by 1 order by 1;
```
```
tabla                    | politicas_sin_guard_staff_ni_portal
caballeriza_responsables | caballeriza_responsables_delete(d), caballeriza_responsables_insert(a), caballeriza_responsables_update(w)
carrera_apuestas         | carrera_apuestas_delete(d), carrera_apuestas_insert(a), carrera_apuestas_update(w)
categorias_carrera       | categorias_carrera_delete(d), categorias_carrera_insert(a), categorias_carrera_update(w)
club_configuracion       | club_configuracion_delete(d), club_configuracion_insert(a), club_configuracion_update(w)
club_secuencias          | club_secuencias_rls(*)
clubs                    | clubs_update_self_or_admin(w)
comision_config          | comision_config_delete(d), comision_config_insert(a), comision_config_update(w)
hipodromos               | hipodromos_delete(d), hipodromos_insert(a), hipodromos_update(w)
liquidacion_config       | liquidacion_config_rls(*)
novedades_reunion        | novedades_reunion_delete(d), novedades_reunion_insert(a), novedades_reunion_update(w)
resolucion_entidades     | resolucion_entidades_delete(d), resolucion_entidades_insert(a), resolucion_entidades_update(w)
resoluciones             | resoluciones_delete(d), resoluciones_insert(a), resoluciones_update(w)
resultado_apuestas       | resultado_apuestas_delete(d), resultado_apuestas_insert(a), resultado_apuestas_update(w)
resultado_log            | resultado_log_delete(d), resultado_log_insert(a), resultado_log_update(w)
```

Contraste: `inscripciones`, `reuniones`, `carreras`, `resultados`, `resultado_posiciones`, `liquidaciones`,
`liquidacion_detalle`, `recibos`, `caballerizas`, `apoderados` sí tienen `NOT fn_is_portal_user()`; `usuarios` y
`sanciones` están cubiertas por otro camino (fila propia / `fn_is_staff`, 25/09).

---

## FASE 1 — barrido

### 1. Qué campos escribe un usuario del portal o un tercero sin privilegios

**A. Por diseño (texto libre):**

| Origen | Tabla.campo | Validación en la base |
|---|---|---|
| `solicitar-acceso.html` → `rpc_solicitar_acceso` (anon/authenticated) | `solicitudes_acceso.nombre`, `.apellido` | sólo no vacío (`btrim`) |
| ídem | `.telefono` | ninguna (NULL si vacío) |
| ídem | `.documento_nro` | `^[0-9]{7,8}$` → inofensivo |
| ídem | `.documento_tipo` | **ninguna** (parámetro `p_documento_tipo`, el front no lo manda pero la API sí) |
| ídem | `.origen_hipodromo`, `.origen_patente_nro`, `.origen_caballeriza` | sólo no vacío |
| ídem (sale de `auth.users`) | `.email` | formato de GoTrue |
| `rpc_aprobar_solicitud` (staff aprueba) | `usuarios.nombre_completo` = `nombre || ' ' || apellido`, `usuarios.telefono`, `usuarios.email` | copia tal cual |
| **API directa**, fila propia (`usuarios_update`: `auth_user_id = auth.uid()`) | `usuarios.nombre_completo`, `.telefono`, `.email`, `.estado` (CHECK: pendiente/activo/rechazado/suspendido), `.activo` | los triggers sólo protegen rol, club, entidad y auth_user_id |

Consecuencia de la última fila: aunque la secretaría valide el nombre al aprobar, **el usuario lo puede cambiar
después**, y puede ponerse `estado='pendiente'` para aparecer en la lista de aprobaciones de `admin.html`.

**Portal (`portal.html`)**: `rpc_inscribir`, `rpc_baja_inscripcion`, `rpc_modificar_inscripcion` sólo reciben **ids**
(spc, carrera, caballeriza, entrenador, jockeys) → no hay texto libre por ese camino.

**Otros formularios públicos**: `registro.html` y `registro-profesional.html` están neutralizados (estáticos, sin JS
de escritura); `login.html` y `reset-password.html` no escriben texto en tablas.

**B. Por el agujero de políticas de arriba**: todos los campos de texto de las 14 tablas. No entran en el arreglo de
esta rama (el remedio correcto es en la base); se listan como fuente para cuando se cierre.

### 2. Dónde se renderiza eso en pantallas del staff (sobre `main` @ 4d95511)

```bash
git grep -n -e 'u.nombre_completo' -e 'u.telefono' -e '${u.email}' -e 'JSON.stringify(u)' -e "error.message}</p>" -e 'cargador?.nombre_completo' main -- usuarios.html admin.html inscripciones.html
```
```
main:admin.html:872:  if (error) { cont.innerHTML = `<p style="color:var(--danger);font-size:13px;">Error al cargar pendientes: ${error.message}</p>`; return; }
main:admin.html:882:      <td><div style="font-weight:600;color:var(--text);">${u.nombre_completo||'—'}</div><div style="font-size:11px;color:var(--muted);">${u.email}</div></td>
main:admin.html:887:          <button class="btn-sm btn-toggle-off" onclick="aprobarUsuario('${u.id}','${(u.nombre_completo||u.email).replace(/'/g,"\\'")}')">✅ Aprobar</button>
main:admin.html:888:          <button class="btn-sm btn-toggle-on" onclick="rechazarUsuario('${u.id}','${(u.nombre_completo||u.email).replace(/'/g,"\\'")}')">❌ Rechazar</button>
main:inscripciones.html:673:      ? `<div style="font-size:12px;line-height:1.4;"><span style="color:var(--oro,#c9a84c);">Portal</span><br><span style="color:var(--muted);">${i.cargador?.nombre_completo || '—'}</span></div>`
main:usuarios.html:253:        <div class="cell-name">${u.nombre_completo || '—'}</div>
main:usuarios.html:254:        ${u.telefono ? `<div class="cell-sub">📞 ${u.telefono}</div>` : ''}
main:usuarios.html:256:      <td><div class="cell-sub">${u.email}</div></td>
main:usuarios.html:261:          <button class="btn-sm btn-edit" onclick='openEdit(${JSON.stringify(u)})'>✏️ Editar</button>
main:usuarios.html:461:  document.getElementById('e-nombre').value  = u.nombre_completo || '';
main:usuarios.html:463:  document.getElementById('e-telefono').value= u.telefono || '';
```

**Vulnerables (arreglados en la rama):**

| Archivo:línea (main) | Qué | Quién lo ve |
|---|---|---|
| `usuarios.html:253` | `nombre_completo` crudo en `innerHTML` | secretario, operador, super_admin |
| `usuarios.html:254` | `telefono` crudo | ídem |
| `usuarios.html:256` | `email` crudo | ídem |
| `usuarios.html:257` | `ROL_LABELS[u.rol] \|\| u.rol` (enum, se escapa igual) | ídem |
| `usuarios.html:261` | `onclick='openEdit(${JSON.stringify(u)})'` — objeto entero en atributo con comilla simple | ídem |
| `admin.html:872` | `error.message` crudo | super_admin |
| `admin.html:882` | `nombre_completo` y `email` crudos (aprobaciones pendientes) | super_admin |
| `admin.html:887-888` | `onclick="aprobarUsuario('id','${nombre.replace(/'/g,"\\'")}')"` — el replace no cubre `"` ni `&#39;` | super_admin |
| `inscripciones.html:673` | "Cargada por": `cargador.nombre_completo` (usuario del portal que anotó) crudo | staff |

Las líneas `usuarios.html:461/463` del grep son asignaciones a `.value` → seguras.

**Ya estaban bien (verificado, no se tocaron):**

- `solicitudes.html` — bandeja de solicitudes: todo campo de la solicitud pasa por `esc()` (líneas 207–344);
  confirm/toast son texto plano (`toast` usa `textContent`).
- `auditoria.html` — nombre del usuario, etiqueta del registro y diff de `datos_antes/despues` por `escapeHtml`
  (281, 382, 385, 436, 482–492).
- `liquidaciones.html:2304` — "anulado por" escapado (y son nombres de staff).
- Todos los `initAuth`: `user-name` por `textContent`.
- `portal.html`: el usuario ve sus propios datos, con `esc()`.

**Fuera del tramo "terceros" (anotados, no tocados):**

- `club-switcher.js:30`: `clubs.nombre` / `sigla` crudos en `innerHTML` del super_admin. Hoy lo escribe el staff
  … **y el portal**, por el agujero de `clubs_update_self_or_admin`. Se arregla junto con ISSUE-093 o en el
  próximo tramo del ISSUE-018.
- `inscripciones.html:681–690`: SPC, caballeriza, entrenador, jockeys, peón/capataz/sereno crudos y
  `openModal(${JSON.stringify(i)})`. Datos que carga el staff (el portal sólo manda ids) → resto del ISSUE-018.

### 3. ¿Hay función de escape reutilizable?

No había un archivo compartido. Hay **11 copias inline** equivalentes (mismos 5 caracteres):

```
auditoria.html:250      escapeHtml   (null → '')
caballerizas.html:268   escapeHtml   (null → '')
categorias.html:178     escapeHtml   (null → '')
jockeys.html:276        escapeHtml   (null → '')
profesionales.html:274  escapeHtml   (null → '')
propietarios.html:275   escapeHtml   (null → '')
spcs.html:341           escapeHtml   (null → '')
hipodromos.html:153     escapeHtml   (null → '')
liquidaciones.html:588  escapeHtml   (String(s ?? ''))
inscripciones.html:377  esc          (String(s ?? ''))
solicitudes.html:123    esc          (String(s ?? ''))
portal.html:363         esc          (null → '')
programa-oficial-color.html:418  esc local — NO escapa ' (4 caracteres)
```

Elegida: la `escapeHtml` de auditoria/jockeys/spcs (la más repetida, nombre explícito, null → ''), movida a
**`escape-html.js`** (script clásico, función global, como `jockey-repetido.js`). Las copias inline existentes no se
unificaron en esta rama (sería tocar ~12 archivos sin relación con el hallazgo); `inscripciones.html` queda con su
`esc` local y además carga `escape-html.js` — deuda anotada.

### 4. Valores reales de hoy

```sql
select u.rol, count(*) total,
 count(*) filter (where u.nombre_completo ~ '[''"<>&`\\]') nombre_con_especiales,
 count(*) filter (where coalesce(u.telefono,'') ~ '[''"<>&`\\]') tel_con_especiales,
 count(*) filter (where u.email ~ '[''"<>&`\\]') email_con_especiales,
 count(*) filter (where u.nombre_completo ~ '[^[:alnum:][:space:].,-]') nombre_con_no_alfanum
from usuarios u where u.rol in ('profesional','propietario') group by 1;
```
```
rol         | total | nombre_con_especiales | tel_con_especiales | email_con_especiales | nombre_con_no_alfanum
propietario | 4     | 0                     | 0                  | 0                    | 0
profesional | 14    | 0                     | 0                  | 0                    | 0
```

```sql
select 'solicitudes_acceso' t, count(*) total,
 count(*) filter (where concat_ws('|',nombre,apellido,telefono,email,documento_tipo,origen_hipodromo,origen_patente_nro,origen_caballeriza) ~ '[''"<>&`\\]') con_especiales
from solicitudes_acceso
union all select 'usuarios_todos', count(*), count(*) filter (where concat_ws('|',nombre_completo,telefono,email) ~ '[''"<>&`\\]') from usuarios;
```
```
t                  | total | con_especiales
solicitudes_acceso | 21    | 0
usuarios_todos     | 24    | 0
```

**Ninguno** de los 18 del portal (ni las 21 solicitudes, ni los 24 usuarios) tiene comillas, `<`, `>`, `&`, backtick
o barra invertida. Nadie lo explotó ni lo rompió todavía. Ojo: un apellido real con apóstrofe (D'Elía, O'Connor)
**ya rompía** el botón Editar de `usuarios.html` sin malicia de por medio (ver M2 abajo).

---

## FASE 2 — arreglo

### 5. Cambios (sólo front)

- `escape-html.js` (nuevo): `escapeHtml()` única.
- `usuarios.html`: carga `escape-html.js`; nombre/teléfono/email/rol por `escapeHtml`; Editar →
  `onclick="openEdit('${u.id}')"` y `openEdit(id)` busca el objeto en `allData`.
- `admin.html`: carga `escape-html.js`; nombre/email/rol/error por `escapeHtml`; Aprobar/Rechazar →
  `aprobarUsuario('${u.id}')` / `rechazarUsuario('${u.id}')`; el nombre para el confirm/toast sale de
  `pendientesData` (se llena en `loadPendientes`). El UPDATE que hacen no cambió.
- `inscripciones.html`: carga `escape-html.js`; "Cargada por" por `escapeHtml`.
- Los ids que quedan en los onclick son `uuid` de la base (PK tipada): no pueden contener comillas.
- Docs: `CHANGELOG.md`, `CLAUDE.md` (árbol + lista de probes), `docs/ISSUES.md` (avance del ISSUE-018).

Diff de código (`git diff main..fix/xss-usuarios-portal -- escape-html.js usuarios.html admin.html inscripciones.html`):

```diff
diff --git a/admin.html b/admin.html
index 5b6e8c8..c9d7ebd 100644
--- a/admin.html
+++ b/admin.html
@@ -374,6 +374,7 @@
 </div>
 
 <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
+<script src="escape-html.js"></script>
 <script>
 let sb, CLUB_ID, currentUser, CURRENT_ROLE = 'super_admin';
 async function initAuth(){const{createClient}=supabase;sb=createClient('https://unlhcuanfrtpatoipwve.supabase.co','sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK');const{data:{session}}=await sb.auth.getSession();if(!session){window.location.replace('login.html');return false;}const{data:usr}=await sb.from('usuarios').select('club_id,nombre_completo,rol').eq('email',session.user.email).single();if(!usr){await sb.auth.signOut();window.location.replace('login.html');return false;}if(usr.rol!=='super_admin'&&!usr.club_id){window.location.replace('index.html');return false;}CLUB_ID=usr.club_id||null;CURRENT_ROLE=usr.rol;currentUser={...session.user,nombre_completo:usr.nombre_completo,rol:usr.rol};const uEl=document.getElementById('user-name');if(uEl)uEl.textContent=usr.nombre_completo||session.user.email;document.getElementById('auth-overlay').style.display='none';return true;}
@@ -862,6 +863,9 @@ async function deleteClub(id){
 }
 
 /* ---- APROBACIONES PENDIENTES ---- */
+// Nombre y email de un pendiente los escribió el propio usuario: van por
+// escapeHtml y el onclick lleva sólo el id (aprobar/rechazar buscan acá).
+let pendientesData = [];
 async function loadPendientes() {
   const { data, error } = await sb.from('usuarios')
     .select('id,email,nombre_completo,rol,created_at')
@@ -869,8 +873,9 @@ async function loadPendientes() {
     .order('created_at', { ascending: true });
   const cont = document.getElementById('pendientes-container');
   const badge = document.getElementById('pendientes-badge');
-  if (error) { cont.innerHTML = `<p style="color:var(--danger);font-size:13px;">Error al cargar pendientes: ${error.message}</p>`; return; }
+  if (error) { cont.innerHTML = `<p style="color:var(--danger);font-size:13px;">Error al cargar pendientes: ${escapeHtml(error.message)}</p>`; return; }
   const lista = data || [];
+  pendientesData = lista;
   if (badge) { badge.textContent = lista.length; badge.style.display = lista.length ? '' : 'none'; }
   if (!lista.length) {
     cont.innerHTML = `<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;text-align:center;color:var(--muted);font-size:14px;">✅ Sin registros pendientes de aprobación</div>`;
@@ -879,13 +884,13 @@ async function loadPendientes() {
   const rolLabel = { propietario: '👔 Propietario', profesional: '🧢 Entrenador' };
   const rows = lista.map(u => `
     <tr>
-      <td><div style="font-weight:600;color:var(--text);">${u.nombre_completo||'—'}</div><div style="font-size:11px;color:var(--muted);">${u.email}</div></td>
-      <td><span class="badge badge-activo" style="background:rgba(116,176,247,0.1);color:#74b0f7;border-color:rgba(116,176,247,0.3);">${rolLabel[u.rol]||u.rol}</span></td>
+      <td><div style="font-weight:600;color:var(--text);">${escapeHtml(u.nombre_completo||'—')}</div><div style="font-size:11px;color:var(--muted);">${escapeHtml(u.email)}</div></td>
+      <td><span class="badge badge-activo" style="background:rgba(116,176,247,0.1);color:#74b0f7;border-color:rgba(116,176,247,0.3);">${escapeHtml(rolLabel[u.rol]||u.rol)}</span></td>
       <td style="font-size:12px;color:var(--muted);">${new Date(u.created_at).toLocaleDateString('es-AR')}</td>
       <td>
         <div class="actions-cell">
-          <button class="btn-sm btn-toggle-off" onclick="aprobarUsuario('${u.id}','${(u.nombre_completo||u.email).replace(/'/g,"\\'")}')">✅ Aprobar</button>
-          <button class="btn-sm btn-toggle-on" onclick="rechazarUsuario('${u.id}','${(u.nombre_completo||u.email).replace(/'/g,"\\'")}')">❌ Rechazar</button>
+          <button class="btn-sm btn-toggle-off" onclick="aprobarUsuario('${u.id}')">✅ Aprobar</button>
+          <button class="btn-sm btn-toggle-on" onclick="rechazarUsuario('${u.id}')">❌ Rechazar</button>
         </div>
       </td>
     </tr>`).join('');
@@ -895,7 +900,13 @@ async function loadPendientes() {
   </table></div>`;
 }
 
-async function aprobarUsuario(id, nombre) {
+function nombrePendiente(id) {
+  const u = pendientesData.find(x => x.id === id);
+  return u ? (u.nombre_completo || u.email) : id;
+}
+
+async function aprobarUsuario(id) {
+  const nombre = nombrePendiente(id);
   if (!confirm(`¿Aprobar el registro de "${nombre}"?`)) return;
   const { error } = await sb.from('usuarios').update({ estado: 'activo', activo: true }).eq('id', id);
   if (error) { toast(error.message, 'error'); return; }
@@ -903,7 +914,8 @@ async function aprobarUsuario(id, nombre) {
   loadPendientes();
 }
 
-async function rechazarUsuario(id, nombre) {
+async function rechazarUsuario(id) {
+  const nombre = nombrePendiente(id);
   if (!confirm(`¿Rechazar el registro de "${nombre}"? Esta acción lo marcará como rechazado.`)) return;
   const { error } = await sb.from('usuarios').update({ estado: 'rechazado', activo: false }).eq('id', id);
   if (error) { toast(error.message, 'error'); return; }
diff --git a/escape-html.js b/escape-html.js
new file mode 100644
index 0000000..8867725
--- /dev/null
+++ b/escape-html.js
@@ -0,0 +1,27 @@
+/**
+ * escapeHtml — la función de escape única para texto que va a innerHTML.
+ *
+ * ISSUE-018 / H6 del informe 2026-09-27_usuarios-roles-portal-escalada.md
+ * (reports): los usuarios del portal se registran solos (solicitar-acceso) y
+ * eligen su propio nombre y teléfono; además pueden reescribir su propia fila
+ * de `usuarios` por la API (la RLS lo permite para nombre, teléfono, email y
+ * estado). Ese texto lo escribe un tercero sin privilegios y se renderiza en
+ * pantallas del personal del hipódromo. Todo lo que venga de ahí pasa por acá.
+ *
+ * Escapa los cinco caracteres que importan en contenido Y en atributos entre
+ * comillas (simples o dobles). No alcanza para meter texto dentro de código JS
+ * (un onclick="f('…')"): el navegador decodifica las entidades del atributo
+ * ANTES de ejecutar el JS, así que `&#39;` vuelve a ser una comilla. Para los
+ * onclick se pasa sólo el id y el objeto se busca en memoria.
+ *
+ * Misma implementación que el `escapeHtml` que ya tenían inline auditoria,
+ * caballerizas, jockeys, profesionales, propietarios, spcs, etc. (null →
+ * cadena vacía). Es una función global (script clásico, sin módulos).
+ *
+ * @param {*} s  Cualquier valor; null/undefined → ''.
+ * @returns {string}
+ */
+function escapeHtml(s) {
+  if (s === null || s === undefined) return '';
+  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
+}
diff --git a/inscripciones.html b/inscripciones.html
index cd0826e..010f804 100644
--- a/inscripciones.html
+++ b/inscripciones.html
@@ -202,6 +202,7 @@
   <script src="active-reunion.js"></script>
   <script src="edad-spc.js"></script>
   <script src="jockey-repetido.js"></script>
+  <script src="escape-html.js"></script>
 </head>
 <body>
 <div id="auth-overlay"><div class="spinner" style="width:32px;height:32px;border-width:3px;"></div></div>
@@ -669,8 +670,9 @@ function renderInscripciones() {
     // Quién cargó la inscripción. Con inscripción libre (24/08/2026) cualquier
     // entrenador puede anotar cualquier SPC, y este dato ES el control que
     // reemplaza al filtro por tenencia: la comisión de carreras sanciona con él.
+    // El nombre lo eligió el propio usuario del portal → escapeHtml.
     const cargadaCell = i.canal === 'portal'
-      ? `<div style="font-size:12px;line-height:1.4;"><span style="color:var(--oro,#c9a84c);">Portal</span><br><span style="color:var(--muted);">${i.cargador?.nombre_completo || '—'}</span></div>`
+      ? `<div style="font-size:12px;line-height:1.4;"><span style="color:var(--oro,#c9a84c);">Portal</span><br><span style="color:var(--muted);">${escapeHtml(i.cargador?.nombre_completo || '—')}</span></div>`
       : `<span style="font-size:12px;color:var(--muted);">Secretaría</span>`;
     const gateraCell = (i.estado==='forfait'||i.estado==='mal_inscrito')
       ? `<span style="color:var(--muted)">—</span>`
diff --git a/usuarios.html b/usuarios.html
index 6720248..87a843b 100644
--- a/usuarios.html
+++ b/usuarios.html
@@ -197,6 +197,7 @@
 </div>
 
 <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
+<script src="escape-html.js"></script>
 <script>
 const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
 const SUPABASE_KEY = 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
@@ -248,17 +249,20 @@ function renderTable() {
     const toggleBtn = activo
       ? `<button class="btn-sm btn-toggle-on" onclick="toggleActivo('${u.id}',false)">Desactivar</button>`
       : `<button class="btn-sm btn-toggle-off" onclick="toggleActivo('${u.id}',true)">Activar</button>`;
+    // nombre, teléfono y email los escribe el propio usuario del portal
+    // (solicitar-acceso, o su fila por la API): todo por escapeHtml. El onclick
+    // lleva sólo el id; openEdit busca el objeto en allData.
     return `<tr>
       <td>
-        <div class="cell-name">${u.nombre_completo || '—'}</div>
-        ${u.telefono ? `<div class="cell-sub">📞 ${u.telefono}</div>` : ''}
+        <div class="cell-name">${escapeHtml(u.nombre_completo || '—')}</div>
+        ${u.telefono ? `<div class="cell-sub">📞 ${escapeHtml(u.telefono)}</div>` : ''}
       </td>
-      <td><div class="cell-sub">${u.email}</div></td>
-      <td><span class="badge badge-rol">${ROL_LABELS[u.rol] || u.rol}</span></td>
+      <td><div class="cell-sub">${escapeHtml(u.email)}</div></td>
+      <td><span class="badge badge-rol">${escapeHtml(ROL_LABELS[u.rol] || u.rol)}</span></td>
       <td><span class="badge badge-${activo ? 'activo' : 'inactivo'}">${activo ? 'Activo' : 'Inactivo'}</span></td>
       <td>
         <div class="actions-cell">
-          <button class="btn-sm btn-edit" onclick='openEdit(${JSON.stringify(u)})'>✏️ Editar</button>
+          <button class="btn-sm btn-edit" onclick="openEdit('${u.id}')">✏️ Editar</button>
           ${toggleBtn}
         </div>
       </td>
@@ -456,7 +460,9 @@ function mensajeError(e) {
 }
 
 /* ---- EDITAR ---- */
-function openEdit(u) {
+function openEdit(id) {
+  const u = allData.find(x => x.id === id);
+  if (!u) return;
   document.getElementById('e-id').value      = u.id;
   document.getElementById('e-nombre').value  = u.nombre_completo || '';
   document.getElementById('e-email').value   = u.email || '';
```

### 6. Probe — `tests/probe_xss_portal_nombres.mjs`

Cómo prueba (sin reimplementar): monta el HTML **real** de cada pantalla en jsdom con sus scripts
(`runScripts: 'dangerously'`); los `<script src>` locales salen del disco (o del mutante), el CDN de supabase-js se
corta a propósito (initAuth falla sola); se inyecta en el `sb` de la página un cliente Supabase real (service_role) y
se llaman las funciones **reales** `load()`, `loadPendientes()`, `loadInscripciones()` contra prod. Los botones se
clickean de verdad: jsdom ejecuta el onclick inline como un navegador (decodifica entidades antes de correr el JS,
que es justamente el vector del `&`).

Fixture (sintético): 5 filas en `usuarios` (Dolores, `profesional`, `pendiente`, `activo=false`,
`probe.xss.*@sgh.test`, sin cuenta de Auth) + 5 inscripciones `canal='portal'` en la 9999 T3 con
`inscripto_por` = esos usuarios. Nombres:

| caso | nombre_completo | teléfono |
|---|---|---|
| simple | `x' onmouseover='window.__pwn=4` | `11 5555-0001` |
| doble | `Juan "El Rayo" Pérez` | — |
| script | `<script>window.__pwn=1</script><img id="xss-img" src="x">` (email también con `<i id="xss-mail">`) | `<b id="xss-tel">11</b>` |
| amp | `Tom & Jerry &quot;});window.__pwn=2;//&#39;);window.__pwn=3;//` | `&amp; 11` |
| delia | `José D'Elía` | `2245 44-1234` |

Por caso: fila renderizada · texto idéntico al de la base (`textContent ===`) · 0 elementos inyectados
(`script, img, [id^=xss]`) · Editar abre el modal con **esa** fila (`e-id`, `e-nombre`) · Aprobar/Rechazar
preguntan por **ese** nombre (confirm stub devuelve `false`: no se escribe nada) · `window.__pwn` sin setear.
Más estáticos: cada página carga `escape-html.js`; Editar no serializa el objeto; Aprobar/Rechazar pasan sólo el id.

Mutantes: **M1** `escapeHtml` = identidad · **M2** las tres páginas de `main` (pre-fix) · **M3** `usuarios.html` sin
el `<script src="escape-html.js">`.

Comando, tal como se corrió (salida completa, sin recortar):

```bash
set -a; . ./.env; set +a
node tests/probe_xss_portal_nombres.mjs --mutantes
```
```
fixture: tag=e5b75d9f · barridos de corridas anteriores=0
fixture: 5 usuarios + 5 inscripciones portal en 9999 T3
✅ U0) usuarios.html load() corre
✅ U1) usuarios.html: 0 elementos inyectados en la lista
✅ U2.simple) fila renderizada
✅ U3.simple) nombre tal cual
✅ U4.simple) email tal cual
✅ U5.simple) teléfono tal cual
✅ U6.simple) Editar abre el modal de ESA fila
✅ U7.simple) nada se ejecutó
✅ U2.doble) fila renderizada
✅ U3.doble) nombre tal cual
✅ U4.doble) email tal cual
✅ U6.doble) Editar abre el modal de ESA fila
✅ U7.doble) nada se ejecutó
✅ U2.script) fila renderizada
✅ U3.script) nombre tal cual
✅ U4.script) email tal cual
✅ U5.script) teléfono tal cual
✅ U6.script) Editar abre el modal de ESA fila
✅ U7.script) nada se ejecutó
✅ U2.amp) fila renderizada
✅ U3.amp) nombre tal cual
✅ U4.amp) email tal cual
✅ U5.amp) teléfono tal cual
✅ U6.amp) Editar abre el modal de ESA fila
✅ U7.amp) nada se ejecutó
✅ U2.delia) fila renderizada
✅ U3.delia) nombre tal cual
✅ U4.delia) email tal cual
✅ U5.delia) teléfono tal cual
✅ U6.delia) Editar abre el modal de ESA fila
✅ U7.delia) nada se ejecutó
✅ A0) admin.html loadPendientes() corre
✅ A1) admin.html: 0 elementos inyectados en pendientes
✅ A2.simple) fila renderizada
✅ A3.simple) nombre y email tal cual
✅ A4.simple.Aprobar) pregunta por ESE nombre
✅ A5.simple.Aprobar) nada se ejecutó
✅ A4.simple.Rechazar) pregunta por ESE nombre
✅ A5.simple.Rechazar) nada se ejecutó
✅ A2.doble) fila renderizada
✅ A3.doble) nombre y email tal cual
✅ A4.doble.Aprobar) pregunta por ESE nombre
✅ A5.doble.Aprobar) nada se ejecutó
✅ A4.doble.Rechazar) pregunta por ESE nombre
✅ A5.doble.Rechazar) nada se ejecutó
✅ A2.script) fila renderizada
✅ A3.script) nombre y email tal cual
✅ A4.script.Aprobar) pregunta por ESE nombre
✅ A5.script.Aprobar) nada se ejecutó
✅ A4.script.Rechazar) pregunta por ESE nombre
✅ A5.script.Rechazar) nada se ejecutó
✅ A2.amp) fila renderizada
✅ A3.amp) nombre y email tal cual
✅ A4.amp.Aprobar) pregunta por ESE nombre
✅ A5.amp.Aprobar) nada se ejecutó
✅ A4.amp.Rechazar) pregunta por ESE nombre
✅ A5.amp.Rechazar) nada se ejecutó
✅ A2.delia) fila renderizada
✅ A3.delia) nombre y email tal cual
✅ A4.delia.Aprobar) pregunta por ESE nombre
✅ A5.delia.Aprobar) nada se ejecutó
✅ A4.delia.Rechazar) pregunta por ESE nombre
✅ A5.delia.Rechazar) nada se ejecutó
✅ I0) inscripciones.html loadInscripciones() corre
✅ I1) inscripciones.html: 0 elementos inyectados en la lista
✅ I2) se renderizan todas las filas de T3
✅ I3.simple) fila renderizada
✅ I4.simple) "Cargada por" = Portal + nombre tal cual
✅ I3.doble) fila renderizada
✅ I4.doble) "Cargada por" = Portal + nombre tal cual
✅ I3.script) fila renderizada
✅ I4.script) "Cargada por" = Portal + nombre tal cual
✅ I3.amp) fila renderizada
✅ I4.amp) "Cargada por" = Portal + nombre tal cual
✅ I3.delia) fila renderizada
✅ I4.delia) "Cargada por" = Portal + nombre tal cual
✅ I5) nada se ejecutó
✅ S1.usuarios.html) carga escape-html.js
✅ S1.admin.html) carga escape-html.js
✅ S1.inscripciones.html) carga escape-html.js
✅ S2) usuarios.html: Editar no serializa el objeto al atributo
✅ S3) admin.html: Aprobar/Rechazar pasan sólo el id

SUITE: 82/82
💀 muere M1 escape-html.js = identidad — 12/82 asserts en rojo:
     ❌ U1) usuarios.html: 0 elementos inyectados en la lista  ← inyectados=4
     ❌ U3.script) nombre tal cual  ← "window.__pwn=1"
     ❌ U4.script) email tal cual  ← ["📞 11","probe.xss.m.e5b75d9f@sgh.test"]
     ❌ U5.script) teléfono tal cual  ← ["📞 11","probe.xss.m.e5b75d9f@sgh.test"]
     ❌ U3.amp) nombre tal cual  ← "Tom & Jerry \"});window.__pwn=2;//');window.__pwn=3;//"
     ❌ U5.amp) teléfono tal cual  ← ["📞 & 11","probe.xss.amp.e5b75d9f@sgh.test"]
     ❌ A1) admin.html: 0 elementos inyectados en pendientes  ← inyectados=3
     ❌ A3.script) nombre y email tal cual  ← ["window.__pwn=1","probe.xss.m.e5b75d9f@sgh.test"]
     ❌ A3.amp) nombre y email tal cual  ← ["Tom & Jerry \"});window.__pwn=2;//');window.__pwn=3;//","probe.xss.amp.e5b75d9f@sgh.test"]
     ❌ I1) inscripciones.html: 0 elementos inyectados en la lista  ← inyectados=2
     ❌ I4.script) "Cargada por" = Portal + nombre tal cual  ← "window.__pwn=1"
     ❌ I4.amp) "Cargada por" = Portal + nombre tal cual  ← "Tom & Jerry \"});window.__pwn=2;//');window.__pwn=3;//"
💀 muere M2 usuarios/admin/inscripciones de main (pre-fix) — 29/82 asserts en rojo:
     ❌ U1) usuarios.html: 0 elementos inyectados en la lista  ← inyectados=4
     ❌ U6.simple) Editar abre el modal de ESA fila  ← open=false e-id=false e-nombre=""
     ❌ U3.script) nombre tal cual  ← "window.__pwn=1"
     ❌ U4.script) email tal cual  ← ["📞 11","probe.xss.m.e5b75d9f@sgh.test"]
     ❌ U5.script) teléfono tal cual  ← ["📞 11","probe.xss.m.e5b75d9f@sgh.test"]
     ❌ U3.amp) nombre tal cual  ← "Tom & Jerry \"});window.__pwn=2;//');window.__pwn=3;//"
     ❌ U5.amp) teléfono tal cual  ← ["📞 & 11","probe.xss.amp.e5b75d9f@sgh.test"]
     ❌ U6.amp) Editar abre el modal de ESA fila  ← open=true e-id=true e-nombre="Tom & Jerry "
     ❌ U7.amp) nada se ejecutó  ← __pwn=2
     ❌ U6.delia) Editar abre el modal de ESA fila  ← open=false e-id=false e-nombre=""
     ❌ A1) admin.html: 0 elementos inyectados en pendientes  ← inyectados=3
     ❌ A4.doble.Aprobar) pregunta por ESE nombre  ← []
     ❌ A4.doble.Rechazar) pregunta por ESE nombre  ← []
     ❌ A3.script) nombre y email tal cual  ← ["window.__pwn=1","probe.xss.m.e5b75d9f@sgh.test"]
     ❌ A4.script.Aprobar) pregunta por ESE nombre  ← []
     ❌ A4.script.Rechazar) pregunta por ESE nombre  ← []
     ❌ A3.amp) nombre y email tal cual  ← ["Tom & Jerry \"});window.__pwn=2;//');window.__pwn=3;//","probe.xss.amp.e5b75d9f@sgh.test"]
     ❌ A4.amp.Aprobar) pregunta por ESE nombre  ← ["¿Aprobar el registro de \"Tom & Jerry \"});window.__pwn=2;//\"?"]
     ❌ A5.amp.Aprobar) nada se ejecutó  ← __pwn=3
     ❌ A4.amp.Rechazar) pregunta por ESE nombre  ← ["¿Rechazar el registro de \"Tom & Jerry \"});window.__pwn=2;//\"? Esta acción lo marcará como rechazado."]
     ❌ A5.amp.Rechazar) nada se ejecutó  ← __pwn=3
     ❌ I1) inscripciones.html: 0 elementos inyectados en la lista  ← inyectados=2
     ❌ I4.script) "Cargada por" = Portal + nombre tal cual  ← "window.__pwn=1"
     ❌ I4.amp) "Cargada por" = Portal + nombre tal cual  ← "Tom & Jerry \"});window.__pwn=2;//');window.__pwn=3;//"
     ❌ S1.usuarios.html) carga escape-html.js  ← 
     ❌ S1.admin.html) carga escape-html.js  ← 
     ❌ S1.inscripciones.html) carga escape-html.js  ← 
     ❌ S2) usuarios.html: Editar no serializa el objeto al atributo  ← 
     ❌ S3) admin.html: Aprobar/Rechazar pasan sólo el id  ← 
💀 muere M3 usuarios.html sin <script src="escape-html.js"> — 7/58 asserts en rojo:
     ❌ U0) usuarios.html load() corre  ← escapeHtml is not defined
     ❌ U2.simple) fila renderizada  ← 
     ❌ U2.doble) fila renderizada  ← 
     ❌ U2.script) fila renderizada  ← 
     ❌ U2.amp) fila renderizada  ← 
     ❌ U2.delia) fila renderizada  ← 
     ❌ S1.usuarios.html) carga escape-html.js  ← 
MUTANTES: 3/3 muertos
✅ Z) limpieza por estado: usuarios probe.xss=0 · inscripciones del probe=0 · 9999 mismas inscripciones (ids)=true (17)
```

Lectura de M2 (el código de hoy en prod):

- `U6.amp … e-nombre="Tom & Jerry "` + `U7.amp __pwn=2`: tocar **Editar** en `usuarios.html` **ejecutó JS** del nombre.
- `A5.amp.Aprobar __pwn=3`: tocar **Aprobar** en `admin.html` **ejecutó JS** — el `&#39;` pasa el `.replace(/'/g…)`
  y el navegador lo convierte en comilla antes de correr el onclick.
- `A4.doble … []`: con `"` en el nombre, Aprobar/Rechazar no hacen nada (atributo cortado).
- `U6.delia` y `U6.simple`: con un apóstrofe, **Editar no abre** (onclick roto) — le pasa a un apellido normal.
- `U1/A1/I1 inyectados=4/3/2`: el `<img>`, `<b>` e `<i>` del fixture entran al DOM en las tres pantallas.
  El `<script>` insertado por innerHTML no corre (regla del navegador), pero un `<img onerror>` sí correría.

Limpieza: el `finally` borra inscripciones antes que usuarios (FK `inscripto_por`) y verifica **por estado**:
0 usuarios `probe.xss`, 0 inscripciones del probe, y la 9999 con **las mismas 17 inscripciones (ids)** que antes. Al
arrancar barre lo que pudiera haber dejado un kill -9 (`barridos de corridas anteriores=0`). Quedan filas en
`auditoria` por los INSERT/DELETE del fixture, como en el resto de los probes.

---

## Preguntas abiertas

- **Q1 — ISSUE-093 (políticas sin guard de staff en 14 tablas).** ¿Se abre ya y se prioriza por encima del resto del
  ISSUE-018? Es cambio de base: necesita migración + rollback + probe por perfil, como sanciones el 25/09.
- **Q2** — `club-switcher.js` renderiza `clubs.nombre` sin escapar para el super_admin; hoy el portal puede escribir
  `clubs`. ¿Entra en esta rama o va con ISSUE-093? (quedó afuera por la regla "sólo campos de terceros por diseño").
- **Q3** — ¿Unificar las 11 copias inline de `escapeHtml`/`esc` al nuevo `escape-html.js` en un PR aparte?
- **Q4** — `rpc_solicitar_acceso` acepta `p_documento_tipo` libre. Inofensivo con el escape, pero ¿se restringe a
  DNI/LC/LE/CI/PAS en la base?
