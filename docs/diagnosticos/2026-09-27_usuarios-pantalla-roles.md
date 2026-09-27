# usuarios.html — personal/portal separados, acciones según rol, nunca éxito sobre 0 filas, rol sólo si cambió

- Fecha: 2026-09-27
- Rama `fix/usuarios-pantalla-roles` @ `692635939b57c9c7a07ff9e7f1d4d9dfbe1ab0a9` — **PR #23 abierto, sin merge**
  (https://github.com/mdqclio/SGH/pull/23).
- **Apilado sobre el PR #20** (`fix/xss-usuarios-portal` @ `0677222`, el escape de nombres de la misma pantalla,
  todavía sin mergear). La base del PR #23 es esa rama, así el diff muestra sólo lo de esta tarea. Motivo: #20 y esta
  tarea tocan las mismas funciones (`renderTable`, `openEdit`); partir de `main` (78c5ca3) obligaba a pisar el escape
  o a un conflicto seguro. **Orden de merge: #20 → #23** (GitHub re-apunta #23 a `main` solo).
- Guards: `pwd` → `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` → **210** · ref → `unlhcuanfrtpatoipwve`.
- Alcance cumplido: código sólo en `usuarios.html`; además el probe y su réplica de sandbox
  (`tests/local/usuarios_sandbox.sql`). **Cero cambios** en base, migraciones, RPC, políticas y Edge Function. En prod
  sólo SELECT (para el hallazgo del CHECK). El probe corre **sólo en el sandbox** (GOTCHA #101) y se niega a prod.
- Anonimizado: los usuarios del probe son sintéticos (`probe-usr-…@example.invalid`), en el sandbox.
- No se tocaron `CHANGELOG.md` ni `CLAUDE.md` (la regla era sólo `usuarios.html` + probe): quedan para agregar en el
  merge, si querés.

---

## Resumen

| Pedido | Hecho | Probe |
|---|---|---|
| 1. Dos secciones con título y conteo, alfabético dentro de cada una | "Personal del hipódromo" (super_admin, secretario, operador) y "Usuarios del portal" (profesional, propietario); conteo en el título; el orden es el `order('nombre_completo')` de la consulta, que `filter` conserva | S1a–S1f |
| 2. Portal sin Editar; se ven nombre, contacto, rol, estado; baja/alta queda | Sí. La baja/alta aparece para quien la base deja ejecutarla (super_admin; ver D1) | S2a, S2b |
| 3. `saveEdit`/`toggleActivo` con `.select()`; 0 filas → error | Sí: "No tenés permiso para modificar este usuario"; nunca toast de éxito sobre 0 filas | S5a/b, S7a/b |
| 4. Rol sólo si cambió y si se puede; nunca `rol:''`; si el rol de la fila no es opción, no se ofrece el campo | Sí | S3a–S3f, S6a/b |
| 5. Ocultar acciones que no se pueden ejecutar según el rol de quien mira; filas sin acciones se muestran igual | Sí (espejo de `usuarios_update` y de los triggers de rol) | S2c/d, S4a/b/c |
| Extra — **Desactivar fallaba siempre en prod** | `estado: 'suspendido'` en vez de `'inactivo'`, **commit aparte** (`2fc5c9a`) | S8a/b |

Probe `tests/probe_usuarios_pantalla.mjs`: **27/27**, **8/8 mutantes** (uno por regla). Contra la versión anterior
de la pantalla: **7/27** — reproduce los tres problemas reportados y el del CHECK.

---

## 1. Qué muestra cada perfil

Espejo de lo que la base permite (la base es la que manda; la pantalla sólo deja de ofrecer lo imposible):
`usuarios_update` = super_admin cualquier fila, el resto sólo la propia (`auth_user_id = auth.uid()`); cambiar rol =
sólo super_admin (`trg_proteger_rol_club_id_usuario`, `trg_usuarios_guard_privilegios`).

| Quien mira → fila | Personal ajeno | Su propia fila | Portal |
|---|---|---|---|
| super_admin | Editar (con rol) + Activar/Desactivar | Editar (con rol), **sin** Desactivar | Activar/Desactivar, **sin** Editar |
| secretario / operador | sin botones | Editar (sin campo rol), **sin** Desactivar | sin botones |

## 2. Decisiones tomadas (productos, la opción conservadora; revisables)

- **D1 — Un secretario no ve "Desactivar" en usuarios del portal.** El pedido dice que la baja/alta del portal
  "queda porque es una acción administrativa legítima", pero la RLS de hoy (`usuarios_update`) no deja a un
  secretario tocar filas ajenas: el botón sería otro placebo (ahora con error). Con la regla 5 se oculta. Si la
  secretaría tiene que poder dar de baja a un usuario del portal, hace falta un cambio de base (RPC con guard) — no en
  esta tarea.
- **D2 — Nadie se ofrece darse de baja a sí mismo.** La base lo permite (fila propia), pero deja la cuenta afuera del
  sistema. Se oculta el botón en la fila propia. Editar la propia fila (nombre, teléfono) sí queda.
- **D3 — Editar una fila del portal por función.** El pedido del probe ("editar sólo el teléfono de una fila de portal
  como super_admin, no manda rol y no falla") no tiene botón en la UI después de la regla 2: el probe llama
  `openEdit(id)`/`saveEdit()` directo. `openEdit` quedó robusto igual (sin campo rol para roles fuera de las opciones).
- **D4 — Estado de la baja: `'suspendido'`** (§3). Commit aparte para poder sacarlo.

## 3. Hallazgo: "Desactivar" fallaba siempre en prod (commit aparte `2fc5c9a`)

`toggleActivo` escribía `estado: activo ? 'activo' : 'inactivo'` (desde `7535a1d`, 2026-08-23). El CHECK de prod no
admite `'inactivo'`:

```sql
select pg_get_constraintdef(oid) from pg_constraint where conname='usuarios_estado_check';
```
```
CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'activo'::character varying, 'rechazado'::character varying, 'suspendido'::character varying])::text[])))
```
```sql
select count(*) filter (where datos_despues->>'estado'='inactivo') a_inactivo, count(*) filter (where (datos_antes->>'activo')::boolean and not (datos_despues->>'activo')::boolean) bajas from auditoria where tabla='usuarios' and accion='UPDATE';
```
```
a_inactivo | bajas
0          | 2
```

Nunca se guardó un `'inactivo'` en `usuarios`. Con la versión anterior, el probe lo muestra textual:
`new row for relation "usuarios" violates check constraint "usuarios_estado_check"` (S8a en §5.b). Nada en el código
depende de `usuarios.estado = 'inactivo'`:

```bash
grep -n "'inactivo'\|\"inactivo\"\|'suspendido'\|\"suspendido\"" *.html *.js supabase/functions/*/index.ts | grep -v "^mockup\|^resultados_legacy"
```
Las coincidencias son de otras tablas (`caballerizas`, `profesionales`, `jockeys`, `propietarios`, `spcs`) o badges de
`activo`; en `usuarios.html` sólo el propio `toggleActivo`. `activacion-pendiente.js` (`esRescatable`) sólo rescata
`estado === 'pendiente'`, así que `'suspendido'` sigue siendo una baja que no se revierte sola (misma garantía que
buscaba el `'inactivo'`). El fixture `BAJA` de `tests/probe_activacion_pendiente.mjs` usa `'inactivo'` en una función
pura, sin base; no cambia.

## 4. Réplica del sandbox — `tests/local/usuarios_sandbox.sql`

CHECK, las dos funciones de trigger y los dos triggers, RLS y las 4 políticas de `usuarios`, copiados de prod. No
replica `trg_audit_usuarios` (no hay tabla `auditoria` en el sandbox) ni `trg_usuarios_set_auth_user_id` (no hay
`auth.users`). Verificación contra prod:

```sql
-- mismo query en prod y en el sandbox
select p.polname||' '||md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'')||'|'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')) from pg_policy p where p.polrelid='public.usuarios'::regclass order by 1;
select proname||' '||md5(pg_get_functiondef(oid)) from pg_proc where proname in ('fn_proteger_rol_club_id_usuario','fn_usuarios_guard_privilegios') order by 1;
```
```
prod                                           sandbox
usuarios_delete 06c736d81c93b99ecdc19b348c5804d5   usuarios_delete 06c736d81c93b99ecdc19b348c5804d5
usuarios_insert 0962ea4ce759ab0f952717716fc6126d   usuarios_insert 0962ea4ce759ab0f952717716fc6126d
usuarios_select 4571a0ea3cfe49e83d2e0b9ead96d36c   usuarios_select 4571a0ea3cfe49e83d2e0b9ead96d36c
usuarios_update 4027233e5dfe2051983bc819b072c8a7   usuarios_update 4027233e5dfe2051983bc819b072c8a7
fn_proteger_rol_club_id_usuario 98ea5df016bc03c304b9268869ca66d2   (sandbox) 98ea5df016bc03c304b9268869ca66d2
fn_usuarios_guard_privilegios   be16b76f45e8a9c56e037961722f01f1   (sandbox) be16b76f45e8a9c56e037961722f01f1
```

CHECK: mismos 4 valores; el md5 difiere sólo porque PG 16 (sandbox) y PG 17 (prod) imprimen distinto el cast:

```
prod:    CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'activo'::character varying, 'rechazado'::character varying, 'suspendido'::character varying])::text[])))
sandbox: CHECK (((estado)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('activo'::character varying)::text, ('rechazado'::character varying)::text, ('suspendido'::character varying)::text])))
```

`fn_is_super_admin`/`fn_is_staff`/`fn_get_user_club_id` del sandbox son las del clon (una línea): mismo cuerpo, otro
formato (md5 distinto por eso).

## 5. Probe — `tests/probe_usuarios_pantalla.mjs`

HTML **real** en jsdom con sus scripts; `<script src>` locales desde el disco; CDN de supabase-js cortado (initAuth
falla sola). A la página se le inyectan `sb` (cliente del sandbox con el **JWT del usuario que mira**: sesión real
contra la RLS y los triggers de la réplica), `currentUser` y `CLUB_ID`, y se llaman las funciones reales `load()`,
`openEdit()`, `saveEdit()`, `toggleActivo()`. Botones leídos del DOM; escrituras leídas de la base con service_role;
toasts del `#toast-container`; payload del UPDATE con un espía sobre `sb`. Fixtures: super_admin, 2 secretarios, 1
operador, 2 profesionales, 1 propietario en Dolores + 1 operador de otro club. Restauración entre mutantes con la
sesión del super_admin sintético (service_role no puede restaurar un `rol`: el trigger lo rechaza con `auth.uid()`
NULL — H4 del informe de usuarios).

Comando:

```bash
tests/local/up.sh sql < tests/local/usuarios_sandbox.sql
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=$(cat tests/local/out/jwt) \
  LOCAL_JWT_SECRET=$(cat tests/local/out/jwt_secret) node tests/probe_usuarios_pantalla.mjs --mutantes
```

### 5.a Versión nueva (esta rama), con mutantes

```
fixture: RUN=PROBE-USR-1790542566468 · sandbox · 8 usuarios sintéticos
✅ S1a) personal en "Personal del hipódromo"
✅ S1b) portal en "Usuarios del portal"
✅ S1c) otro club no aparece
✅ S1d) títulos
✅ S1e) conteos = base
✅ S1f) orden alfabético (el de la base) dentro de cada sección
✅ S2a) fila de portal sin Editar (super_admin)
✅ S2b) fila de portal con alta/baja (super_admin)
✅ S2c) personal ajeno: Editar + alta/baja (super_admin)
✅ S2d) nadie se ofrece darse de baja a sí mismo (super_admin)
✅ S3a) portal: el campo rol no se ofrece
✅ S3b) no manda rol
✅ S3c) no falla y guarda
✅ S3d) personal: el campo rol se ofrece con el rol de la fila
✅ S3e) rol sin cambio → no se manda
✅ S3f) rol cambiado por super_admin → se manda y queda
✅ S8a) baja: activo=false con estado válido (no rechaza el CHECK)
✅ S8b) alta: activo=true, estado activo
✅ S4a) secretario: filas ajenas se muestran, sin botones
✅ S4b) secretario: su fila con Editar y sin Desactivar
✅ S4c) secretario: mismas secciones
✅ S5a) otro secretario → error, no "actualizado"
✅ S5b) la fila no cambió
✅ S6a) su fila: el campo rol no se ofrece (no puede cambiarlo)
✅ S6b) guarda, sin rol en el payload, toast ok
✅ S7a) toggle ajeno → error, no "desactivado"
✅ S7b) la fila no cambió

SUITE: 27/27
💀 muere M1 secciones: esPortal() siempre false — 5/27 en rojo: S1b) portal en "Usuarios del portal" | S1e) conteos = base | S1f) orden alfabético (el de la base) dentro de cada sección | S2a) fila de portal sin Editar (super_admin) | S4c) secretario: mismas secciones
💀 muere M2 portal con Editar — 1/27 en rojo: S2a) fila de portal sin Editar (super_admin)
💀 muere M3 saveEdit sin chequeo de 0 filas — 1/27 en rojo: S5a) otro secretario → error, no "actualizado"
💀 muere M4 rol siempre en el payload — 4/27 en rojo: S3b) no manda rol | S3c) no falla y guarda | S3e) rol sin cambio → no se manda | S6b) guarda, sin rol en el payload, toast ok
💀 muere M5 acciones sin filtrar por rol — 1/27 en rojo: S4a) secretario: filas ajenas se muestran, sin botones
💀 muere M6 toggleActivo sin chequeo de 0 filas — 1/27 en rojo: S7a) toggle ajeno → error, no "desactivado"
💀 muere M7 baja con estado 'inactivo' — 1/27 en rojo: S8a) baja: activo=false con estado válido (no rechaza el CHECK)
💀 muere M8 se ofrece darse de baja a uno mismo — 2/27 en rojo: S2d) nadie se ofrece darse de baja a sí mismo (super_admin) | S4b) secretario: su fila con Editar y sin Desactivar
MUTANTES: 8/8 muertos
✅ Z) limpieza: usuarios del probe que quedan = 0
```

### 5.b Versión anterior (`0677222:usuarios.html`, la del PR #20)

```bash
git show 0677222:usuarios.html > usuarios_antes.html
SUPABASE_URL=… SUPABASE_SECRET_KEY=… LOCAL_JWT_SECRET=… USUARIOS_HTML=usuarios_antes.html node tests/probe_usuarios_pantalla.mjs
```
```
fixture: RUN=PROBE-USR-1790542564994 · sandbox · 8 usuarios sintéticos
❌ S1a) personal en "Personal del hipódromo"  ← ["sin-seccion","sin-seccion","sin-seccion","sin-seccion"]
❌ S1b) portal en "Usuarios del portal"  ← ["sin-seccion","sin-seccion","sin-seccion"]
✅ S1c) otro club no aparece
❌ S1d) títulos  ← ["",""]
❌ S1e) conteos = base  ← {"conteo":["",""],"base":[4,3]}
❌ S1f) orden alfabético (el de la base) dentro de cada sección  ← 
❌ S2a) fila de portal sin Editar (super_admin)  ← [["✏️ Editar","Desactivar"],["✏️ Editar","Desactivar"],["✏️ Editar","Desactivar"]]
✅ S2b) fila de portal con alta/baja (super_admin)
✅ S2c) personal ajeno: Editar + alta/baja (super_admin)
❌ S2d) nadie se ofrece darse de baja a sí mismo (super_admin)  ← ["✏️ Editar","Desactivar"]
❌ S3a) portal: el campo rol no se ofrece  ← 
❌ S3b) no manda rol  ← [{"nombre_completo":"PROBE-USR-1790542564994 prof1","telefono":"tel-nuevo-prof1","rol":""}]
❌ S3c) no falla y guarda  ← [{"tipo":"error","msg":"invalid input value for enum rol_usuario: \"\""}]
❌ S3d) personal: el campo rol se ofrece con el rol de la fila  ← 
❌ S3e) rol sin cambio → no se manda  ← [{"nombre_completo":"PROBE-USR-1790542564994 sec1","telefono":"tel-sec1","rol":"secretario_carreras"}]
✅ S3f) rol cambiado por super_admin → se manda y queda
❌ S8a) baja: activo=false con estado válido (no rechaza el CHECK)  ← {"activo":true,"estado":"activo","toasts":[{"tipo":"error","msg":"new row for relation \"usuarios\" violates check constraint \"usuarios_estado_check\""}]}
✅ S8b) alta: activo=true, estado activo
❌ S4a) secretario: filas ajenas se muestran, sin botones  ← {"sa":["✏️ Editar","Desactivar"],"sec2":["✏️ Editar","Desactivar"],"ope":["✏️ Editar","Desactivar"],"prof1":["✏️ Editar","Desactivar"],"prof2":["✏️ Editar","Desactivar"],"prop":["✏️ Editar","Desactivar"]}
❌ S4b) secretario: su fila con Editar y sin Desactivar  ← ["✏️ Editar","Desactivar"]
❌ S4c) secretario: mismas secciones  ← 
❌ S5a) otro secretario → error, no "actualizado"  ← [{"tipo":"ok","msg":"Usuario actualizado"}]
✅ S5b) la fila no cambió
❌ S6a) su fila: el campo rol no se ofrece (no puede cambiarlo)  ← 
❌ S6b) guarda, sin rol en el payload, toast ok  ← {"t6":[{"tipo":"ok","msg":"Usuario actualizado"}],"p":[{"nombre_completo":"PROBE-USR-1790542564994 sec1","telefono":"tel-propio-sec1","rol":"secretario_carreras"}]}
❌ S7a) toggle ajeno → error, no "desactivado"  ← [{"tipo":"ok","msg":"Usuario desactivado"}]
✅ S7b) la fila no cambió

SUITE: 7/27
✅ Z) limpieza: usuarios del probe que quedan = 0
```

Lectura: S2a (portal con Editar), S3b/S3c (`rol:""` → `invalid input value for enum rol_usuario: ""` con super_admin
cambiando sólo el teléfono), S5a y S7a (`Usuario actualizado` / `Usuario desactivado` sin cambio — los placebos),
S8a (Desactivar rechazado por el CHECK). S5b y S7b en verde en la versión vieja: la base ya protegía, la pantalla
mentía.

## 6. Diff

Commits sobre la base del PR:

```
6926359 test(usuarios): probe de la pantalla en el sandbox — 27/27, 8/8 mutantes; la versión anterior da 7/27
2fc5c9a fix(usuarios): Desactivar escribe estado 'suspendido' (no 'inactivo', que el CHECK rechaza)
846b7b6 fix(usuarios): personal y portal en secciones; acciones según lo que la base permite; nunca éxito sobre 0 filas; rol sólo si cambió y se puede
```

`git diff origin/fix/xss-usuarios-portal..HEAD -- usuarios.html`:

```diff
diff --git a/usuarios.html b/usuarios.html
index 87a843b..14b25ca 100644
--- a/usuarios.html
+++ b/usuarios.html
@@ -47,6 +47,10 @@
     .badge-inactivo { background: rgba(224,82,82,0.1); color: var(--danger); border: 1px solid rgba(224,82,82,0.3); }
     .badge-rol { background: rgba(201,168,76,0.08); color: var(--accent); border: 1px solid rgba(201,168,76,0.2); font-size: 10px; }
     .actions-cell { display: flex; gap: 6px; flex-wrap: wrap; }
+    .seccion { margin-bottom: 28px; }
+    .seccion-titulo { font-family: 'Playfair Display', serif; font-size: 16px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
+    .seccion-conteo { font-family: 'DM Sans', sans-serif; font-size: 12px; color: var(--muted); font-weight: 500; }
+    .seccion-vacia { color: var(--muted); font-size: 13px; padding: 14px 4px; }
     .btn-sm { padding: 5px 12px; border-radius: 7px; font-size: 12px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; border: none; transition: all 0.2s; white-space: nowrap; }
     .btn-edit       { background: rgba(116,176,247,0.1); color: #74b0f7; border: 1px solid rgba(116,176,247,0.3); }
     .btn-edit:hover { background: rgba(116,176,247,0.2); }
@@ -180,7 +184,7 @@
           <input type="text" id="e-telefono">
         </div>
       </div>
-      <div class="form-group">
+      <div class="form-group" id="e-rol-group">
         <label>Rol *</label>
         <select id="e-rol">
           <option value="secretario_carreras">Secretario de carreras</option>
@@ -239,20 +243,32 @@ async function load() {
   renderTable();
 }
 
-function renderTable() {
-  if (!allData.length) {
-    document.getElementById('list-container').innerHTML = '<div class="empty-state"><div class="icon">👥</div><h3>Sin usuarios registrados</h3></div>';
-    return;
-  }
-  const rows = allData.map(u => {
-    const activo = u.activo !== false;
-    const toggleBtn = activo
-      ? `<button class="btn-sm btn-toggle-on" onclick="toggleActivo('${u.id}',false)">Desactivar</button>`
-      : `<button class="btn-sm btn-toggle-off" onclick="toggleActivo('${u.id}',true)">Activar</button>`;
-    // nombre, teléfono y email los escribe el propio usuario del portal
-    // (solicitar-acceso, o su fila por la API): todo por escapeHtml. El onclick
-    // lleva sólo el id; openEdit busca el objeto en allData.
-    return `<tr>
+/* ---- PERMISOS (espejo de la base; la base es la que manda) ----
+ * usuarios_update (RLS): super_admin cualquier fila; el resto sólo la propia
+ * (auth_user_id = auth.uid()). Cambiar rol: sólo super_admin (trg_proteger_rol_club_id_usuario
+ * y trg_usuarios_guard_privilegios). La pantalla sólo ofrece lo que la base va a dejar hacer. */
+const ROLES_PERSONAL = ['super_admin', 'secretario_carreras', 'operador'];
+const ROLES_PORTAL   = ['profesional', 'propietario'];
+function esPortal(u)        { return ROLES_PORTAL.includes(u.rol); }
+function esSuperAdmin()     { return currentUser?.rol === 'super_admin'; }
+function esPropia(u)        { return !!currentUser?.id && u.auth_user_id === currentUser.id; }
+function puedeModificar(u)  { return esSuperAdmin() || esPropia(u); }
+function puedeEditar(u)     { return !esPortal(u) && puedeModificar(u); }
+// Darse de baja a uno mismo deja la cuenta afuera del sistema: no se ofrece.
+function puedeAltaBaja(u)   { return puedeModificar(u) && !esPropia(u); }
+function puedeCambiarRol(u) { return esSuperAdmin() && [...document.getElementById('e-rol').options].some(o => o.value === u.rol); }
+
+function filaHTML(u) {
+  const activo = u.activo !== false;
+  const acciones = [];
+  if (puedeEditar(u)) acciones.push(`<button class="btn-sm btn-edit" onclick="openEdit('${u.id}')">✏️ Editar</button>`);
+  if (puedeAltaBaja(u)) acciones.push(activo
+    ? `<button class="btn-sm btn-toggle-on" onclick="toggleActivo('${u.id}',false)">Desactivar</button>`
+    : `<button class="btn-sm btn-toggle-off" onclick="toggleActivo('${u.id}',true)">Activar</button>`);
+  // nombre, teléfono y email los escribe el propio usuario del portal
+  // (solicitar-acceso, o su fila por la API): todo por escapeHtml. El onclick
+  // lleva sólo el id; openEdit busca el objeto en allData.
+  return `<tr data-id="${u.id}">
       <td>
         <div class="cell-name">${escapeHtml(u.nombre_completo || '—')}</div>
         ${u.telefono ? `<div class="cell-sub">📞 ${escapeHtml(u.telefono)}</div>` : ''}
@@ -260,24 +276,35 @@ function renderTable() {
       <td><div class="cell-sub">${escapeHtml(u.email)}</div></td>
       <td><span class="badge badge-rol">${escapeHtml(ROL_LABELS[u.rol] || u.rol)}</span></td>
       <td><span class="badge badge-${activo ? 'activo' : 'inactivo'}">${activo ? 'Activo' : 'Inactivo'}</span></td>
-      <td>
-        <div class="actions-cell">
-          <button class="btn-sm btn-edit" onclick="openEdit('${u.id}')">✏️ Editar</button>
-          ${toggleBtn}
-        </div>
-      </td>
+      <td><div class="actions-cell">${acciones.join('')}</div></td>
     </tr>`;
-  }).join('');
-
-  document.getElementById('list-container').innerHTML = `
-    <div class="table-wrap">
-      <table>
-        <thead><tr>
-          <th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Acciones</th>
-        </tr></thead>
-        <tbody>${rows}</tbody>
-      </table>
-    </div>`;
+}
+
+function seccionHTML(clave, titulo, lista) {
+  const n = lista.length;
+  const cuerpo = n
+    ? `<div class="table-wrap"><table>
+        <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
+        <tbody>${lista.map(filaHTML).join('')}</tbody>
+      </table></div>`
+    : `<div class="seccion-vacia">Sin usuarios en esta sección.</div>`;
+  return `<section class="seccion" data-seccion="${clave}">
+      <div class="seccion-titulo">${titulo} <span class="seccion-conteo">${n} ${n === 1 ? 'usuario' : 'usuarios'}</span></div>
+      ${cuerpo}
+    </section>`;
+}
+
+function renderTable() {
+  if (!allData.length) {
+    document.getElementById('list-container').innerHTML = '<div class="empty-state"><div class="icon">👥</div><h3>Sin usuarios registrados</h3></div>';
+    return;
+  }
+  // allData ya viene ordenado por nombre_completo (load); filter conserva el orden.
+  const portal   = allData.filter(esPortal);
+  const personal = allData.filter(u => !esPortal(u));
+  document.getElementById('list-container').innerHTML =
+    seccionHTML('personal', 'Personal del hipódromo', personal) +
+    seccionHTML('portal', 'Usuarios del portal', portal);
 }
 
 /* ---- CREAR ---- */
@@ -467,7 +494,11 @@ function openEdit(id) {
   document.getElementById('e-nombre').value  = u.nombre_completo || '';
   document.getElementById('e-email').value   = u.email || '';
   document.getElementById('e-telefono').value= u.telefono || '';
-  document.getElementById('e-rol').value     = u.rol || 'operador';
+  // El campo rol sólo aparece si quien edita puede cambiarlo y el rol de la fila
+  // es una de las opciones (un rol del portal no lo es: el select quedaría en '').
+  const conRol = puedeCambiarRol(u);
+  document.getElementById('e-rol-group').hidden = !conRol;
+  document.getElementById('e-rol').value = conRol ? u.rol : '';
   document.getElementById('modal-edit').classList.add('open');
 }
 function closeEdit() { document.getElementById('modal-edit').classList.remove('open'); }
@@ -476,15 +507,21 @@ async function saveEdit() {
   const id     = document.getElementById('e-id').value;
   const nombre = document.getElementById('e-nombre').value.trim();
   if (!nombre) { toast('El nombre es requerido', 'error'); return; }
-  const btn = document.getElementById('btn-edit-save');
-  btn.disabled = true; btn.textContent = 'Guardando…';
-  const { error } = await sb.from('usuarios').update({
+  const u = allData.find(x => x.id === id);
+  const cambios = {
     nombre_completo: nombre,
     telefono: document.getElementById('e-telefono').value.trim() || null,
-    rol:      document.getElementById('e-rol').value,
-  }).eq('id', id);
+  };
+  // rol: sólo si quien edita puede cambiarlo y efectivamente cambió. Nunca ''.
+  const rolNuevo = document.getElementById('e-rol').value;
+  if (u && puedeCambiarRol(u) && rolNuevo && rolNuevo !== u.rol) cambios.rol = rolNuevo;
+  const btn = document.getElementById('btn-edit-save');
+  btn.disabled = true; btn.textContent = 'Guardando…';
+  // .select(): si la RLS filtra la fila, PostgREST devuelve 0 filas SIN error.
+  const { data, error } = await sb.from('usuarios').update(cambios).eq('id', id).select('id');
   btn.disabled = false; btn.textContent = 'Guardar cambios';
   if (error) { toast(error.message, 'error'); return; }
+  if (!data || !data.length) { toast('No tenés permiso para modificar este usuario', 'error'); return; }
   toast('Usuario actualizado');
   closeEdit();
   load();
@@ -500,16 +537,21 @@ async function saveEdit() {
  * `estado='pendiente'`, la red de contención de activacion-pendiente.js
  * reactivaría al usuario en su próximo login y la baja sería un placebo.
  *
- * De ahí el 'inactivo' al desactivar: es un valor que `esRescatable()` NO
- * acepta. Está cubierto por tests/probe_activacion_pendiente.mjs.
+ * De ahí el 'suspendido' al desactivar: es un valor que `esRescatable()` NO
+ * acepta (sólo rescata 'pendiente'). Está cubierto por tests/probe_activacion_pendiente.mjs.
+ * Hasta el 27/09 escribía 'inactivo', que el CHECK usuarios_estado_check no admite
+ * (pendiente/activo/rechazado/suspendido): Desactivar fallaba siempre en prod desde 7535a1d.
  */
 async function toggleActivo(id, activo) {
   const u = allData.find(x => x.id === id);
   if (!confirm(`¿Deseas ${activo ? 'activar' : 'desactivar'} al usuario "${u?.nombre_completo}"?`)) return;
-  const { error } = await sb.from('usuarios')
-    .update({ activo, estado: activo ? 'activo' : 'inactivo' })
-    .eq('id', id);
+  const { data, error } = await sb.from('usuarios')
+    .update({ activo, estado: activo ? 'activo' : 'suspendido' })
+    .eq('id', id)
+    .select('id');
   if (error) { toast(error.message, 'error'); return; }
+  // 0 filas sin error = la RLS filtró la fila: no hubo cambio.
+  if (!data || !data.length) { toast('No tenés permiso para modificar este usuario', 'error'); return; }
   toast(`Usuario ${activo ? 'activado' : 'desactivado'}`);
   load();
 }
```

---

## Preguntas abiertas

- **Q1** — Orden de merge: #20 (escape) y después #23. ¿OK?
- **Q2** — D1: ¿la secretaría tiene que poder dar de baja a un usuario del portal? Hoy la base no la deja; sería una
  RPC con guard.
- **Q3** — D4: ¿`'suspendido'` para la baja, o preferís otro valor del CHECK (`'rechazado'`)? Está en un commit aparte.
- **Q4** — ¿Agrego CHANGELOG y la línea del probe en `CLAUDE.md` en el mismo PR antes del merge?

---

## Verificación de push

```
$ git push -q origin HEAD:reports && git ls-remote origin reports && git rev-parse HEAD
7c0d09caffd74afdea7fd6a785b6ee9f5afd6bac	refs/heads/reports
7c0d09caffd74afdea7fd6a785b6ee9f5afd6bac

$ git ls-remote origin fix/usuarios-pantalla-roles
692635939b57c9c7a07ff9e7f1d4d9dfbe1ab0a9	refs/heads/fix/usuarios-pantalla-roles
```

Este apéndice va en un commit posterior de `reports`; su SHA se informa en el chat.
