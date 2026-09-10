# Alta de entrenador y bandeja de solicitudes — por qué Yesi no ve el botón "Nuevo"

**Fecha:** 2026-09-10
**Rama del informe:** `reports`
**SHA de `main` sobre el que se relevó:** `eface80078b99a56c9ae3160053cd8fd0c425d31`
(`docs: ISSUE-075 reescrito (son dos plazos, no dos cálculos) e ISSUE-077 nuevo`, Tue Sep 8 11:01:00 2026 +0000)
**Modo:** SOLO LECTURA. No se aplicó ningún cambio en el repo ni en la base.

## Guards verificados

```
$ pwd
/home/clio/dev/SGH
```

```sql
select count(*) as spcs_count from spcs;
```
```json
[{"spcs_count":181}]
```

```
mcp__supabase__get_project_url →
{"url":"https://unlhcuanfrtpatoipwve.supabase.co"}
```

Los tres guards dan. Todo el relevamiento de código se hizo contra `main`
(`git show main:<archivo>` / `git grep … main`), no contra el árbol de `reports`.

---

## Respuestas cortas

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Existe la forma de crear un entrenador desde la UI? | Sí: `profesionales.html`, botón `+ Nuevo Entrenador` (línea 132). **Solo lo ve `super_admin`.** |
| 2 | ¿Por qué Yesi no lo ve? | Porque `profesionales.html:268-270` lo oculta por JS para todo rol que no sea `super_admin`. Yesi es **`operador`**. No es la solapa ni el scroll. |
| 3 | Jockey vs entrenador en el modelo | **La misma tabla** `profesionales`, discriminada por la columna `tipo` (ENUM `tipo_profesional`: `jockey` / `entrenador` / `ambos`). Dos pantallas distintas sobre la misma tabla. |
| 4 | ¿"Nuevo Jockey" sirve para crear un entrenador cambiando el tipo? | El tipo está **fijo** en el código (`tipo: 'jockey'`, `jockeys.html:386`). No hay selector. Igual la ficha resultante **sí es elegible en la bandeja** (la búsqueda de fichas no filtra por `tipo`), pero nace mal tipada y con campos faltantes. |
| 5 | ¿Se puede crear la ficha desde la bandeja? | **No.** `solicitudes.html:324-327` sólo muestra un **link** a `profesionales.html`, que es justamente la pantalla donde el botón está oculto para ella. Callejón sin salida. |

---

## 1. Dónde está el botón "Nuevo" en cada pantalla

Comando:

```bash
git grep -ln "Nuevo" main -- '*.html'
```

Salida cruda:

```
main:admin.html
main:carta-llamados.html
main:hipodromos.html
main:jockeys.html
main:profesionales.html
main:propietarios.html
main:spcs.html
main:usuarios.html
```

Comando:

```bash
for f in caballerizas.html jockeys.html profesionales.html; do
  echo "=== $f ==="
  git grep -n -iE "btn[^\"']*(nuev|agregar|alta|add)|>\s*[+＋]?\s*(Nuev|Agregar|Alta|Añadir|Crear)" main -- $f
done
```

Salida cruda (recortando sólo las reglas CSS `.btn-*`, que no son botones; se conservan
todas las líneas de marcado):

```
=== caballerizas.html ===
main:caballerizas.html:144:    <button class="btn-primary" onclick="openModal()">+ Nueva Caballeriza</button>
main:caballerizas.html:154:      <h2 id="modal-title">Nueva Caballeriza</h2>
main:caballerizas.html:228:            <button type="button" class="btn-add-resp" onclick="addCopropRow()">+ Agregar co-propietario</button>
=== jockeys.html ===
main:jockeys.html:140:    <button class="btn-primary" onclick="openModal()">+ Nuevo Jockey</button>
main:jockeys.html:150:      <h2 id="modal-title">Nuevo Jockey</h2>
=== profesionales.html ===
main:profesionales.html:132:    <button class="btn-primary" id="btn-nuevo" onclick="openModal()">+ Nuevo Entrenador</button>
main:profesionales.html:142:      <h2 id="modal-title">Nuevo Entrenador</h2>
main:profesionales.html:269:    document.getElementById('btn-nuevo').style.display = 'none';
```

Las tres pantallas tienen el botón en el mismo lugar del marcado (la `.toolbar`, arriba de
la lista) y con la misma clase `btn-primary`. El CSS de la toolbar es **idéntico** en
`profesionales.html` y `jockeys.html`:

```bash
git show main:profesionales.html | grep -n "\.toolbar"
git show main:jockeys.html      | grep -n "\.toolbar"
```

```
27:    .toolbar { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; align-items: center; }
27:    .toolbar { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; align-items: center; }
```

O sea: **no es un problema de layout, de scroll ni de pantalla chica.** La diferencia es
exclusivamente la línea 269 de `profesionales.html`.

### La línea que lo oculta

```bash
git show main:profesionales.html | sed -n '266,276p'
```

```javascript
async function load() {
  if (currentUser.rol !== 'super_admin') {
    document.getElementById('btn-nuevo').style.display = 'none';
  }
  document.getElementById('list-container').innerHTML = '<div class="loading-state"><div class="spinner"></div> Cargando entrenadores…</div>';
  const filtro = document.getElementById('filter-estado').value;
  let query = sb.from('profesionales').select('*').eq('club_id', CLUB_ID).in('tipo', ['entrenador', 'ambos']).order('apellido').order('nombre');
```

Detalle de UX que puede confundir: el botón **está en el HTML inicial y se oculta recién
dentro de `load()`**, o sea después de `initAuth()`. En una conexión lenta Yesi puede llegar
a verlo un instante y que después desaparezca. Si alguna vez dijo "estaba y ya no está", es
esto, no un error de ella.

### Y también le oculta Editar / Eliminar

```bash
git show main:profesionales.html | sed -n '336,346p'
```

```javascript
    <div class="card-actions">
      ${currentUser.rol === 'super_admin'
        ? `<button class="btn-sm btn-edit" onclick='openModal(${JSON.stringify(r)})'>✏️ Editar</button>
           <button class="btn-sm btn-delete" onclick="deleteRecord('${r.id}','${escapeHtml((r.apellido||'')+' '+(r.nombre||'')).replace(/'/g,'&#39;')}')">🗑️ Eliminar</button>`
        : ((r.estado || 'activo') === 'baja' ? '' :
           `<button class="btn-sm ${(r.estado || 'activo') === 'activo' ? 'btn-desactivar' : 'btn-activar'}"
               onclick="toggleEstado('${r.id}','${r.estado || 'activo'}','${escapeHtml((r.apellido||'')+' '+(r.nombre||'')).replace(/'/g,'&#39;')}')">
             ${(r.estado || 'activo') === 'activo' ? '🔴 Desactivar' : '🟢 Activar'}
           </button>`)
      }
    </div>
```

En `profesionales.html`, un no-`super_admin` puede **sólo activar/desactivar**. Nada de
crear, editar ni eliminar.

### Comparación de las tres pantallas

```bash
git show main:jockeys.html       | grep -n "super_admin\|btn-nuevo\|style.display"
git show main:caballerizas.html  | grep -n "super_admin\|btn-nuevo\|openModal()"
git show main:profesionales.html | grep -n "super_admin"
```

Salida cruda (la línea de `initAuth()` aparece en las tres porque menciona `super_admin`
para resolver `CLUB_ID`; se transcribe completa una sola vez para no repetir 3 veces la
misma minificada, y se anota que en los tres archivos es literalmente idéntica):

```
=== jockeys.html ===
236:async function initAuth(){…usr.rol==='super_admin'… resolución de CLUB_ID …}
     (ninguna otra aparición de super_admin, btn-nuevo ni style.display)

=== caballerizas.html ===
144:    <button class="btn-primary" onclick="openModal()">+ Nueva Caballeriza</button>
243:async function initAuth(){…usr.rol==='super_admin'… resolución de CLUB_ID …}
     (ninguna otra aparición de super_admin ni btn-nuevo)

=== profesionales.html ===
234:async function initAuth(){…usr.rol==='super_admin'… resolución de CLUB_ID …}
268:  if (currentUser.rol !== 'super_admin') {
338:      ${currentUser.rol === 'super_admin'
```

Texto completo de esa línea de `initAuth()` (idéntica en los tres archivos):

```javascript
async function initAuth(){const{createClient}=supabase;sb=createClient('https://unlhcuanfrtpatoipwve.supabase.co','sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK');const{data:{session}}=await sb.auth.getSession();if(!session){window.location.replace('login.html');return false;}const{data:usr}=await sb.from('usuarios').select('club_id,nombre_completo,rol').eq('email',session.user.email).single();if(usr.rol==='super_admin'){const urlClub=new URLSearchParams(window.location.search).get('club');CLUB_ID=urlClub||localStorage.getItem('sgh_selected_club_id')||usr.club_id||null;}else{if(!usr.club_id){await sb.auth.signOut();window.location.replace('login.html');return false;}CLUB_ID=usr.club_id;}currentUser={...session.user,nombre_completo:usr.nombre_completo,rol:usr.rol};const uEl=document.getElementById('user-name');if(uEl)uEl.textContent=usr.nombre_completo||session.user.email;document.getElementById('auth-overlay').style.display='none';return true;}
```

**Conclusión de la comparación:** `jockeys.html` y `caballerizas.html` no tienen ningún gate
por rol sobre el botón "Nuevo". `profesionales.html` es la única de las tres que lo tiene.
Por eso Yesi ve dos de tres botones y busca el tercero donde debería estar y no está.

### De dónde salió el gate

```bash
git log --oneline -3 -S"btn-nuevo').style.display = 'none'" main -- profesionales.html
git show -s --format='%H%n%ad%n%s%n%b' 302e684
git show --stat --format= 302e684
```

```
302e684 Formato de montos con puntos y permisos por rol

302e6849ad6350a2075166b8782119fdecb1cbb3
Fri May 8 23:21:57 2026 +0000
Formato de montos con puntos y permisos por rol
- Formateo automático de montos al tipear (formatMonto/parseMonto/fmtInput)
  en carta-llamados, liquidaciones y programa
- Dashboard de secretario_carreras: quita SPCs y Propietarios, muestra
  reuniones del año actual con filtro de fecha
- profesionales.html: secretario_carreras solo puede activar/desactivar,
  super_admin mantiene crear/editar/eliminar

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

 carta-llamados.html | 51 ++++++++++++++++++++++--------------
 index.html          | 75 ++++++++++++++++++++++++++++++++---------------------
 liquidaciones.html  | 22 +++++++++++-----
 profesionales.html  | 26 +++++++++++++++++--
 programa.html       |  8 ++++--
 5 files changed, 123 insertions(+), 59 deletions(-)
```

```bash
git log --oneline -S"style.display = 'none'" main -- jockeys.html caballerizas.html
```

```
d5b441a Adaptar UI de caballerizas al modelo relacional de responsables
```

(ese commit es sobre el modal de co-propietarios, no sobre un gate de rol).

**Es una decisión deliberada del 08/05/2026**, tomada sólo para entrenadores y **cuatro
meses antes** de que existiera el circuito de autorregistro (`solicitudes.html` se creó en
`b1b79a8 feat(autoregistro): Gate 3 — UI de solicitud, bandeja de aprobación y aviso`).
Nunca se revisó a la luz del nuevo flujo, que **depende** de que la secretaría pueda crear
fichas.

---

## 2. ¿Es el rol, la solapa, o está fuera de la vista?

Es el rol, y hay un agravante: **Yesi no es `secretario_carreras`, es `operador`.**

```sql
select id, email, nombre_completo, rol, club_id, activo from usuarios order by rol, nombre_completo;
```

```json
[{"id":"3a685a1a-3ff7-45dc-8af3-88f5c5f29377","email":"admin@sgh.com","nombre_completo":"Administrador SGH","rol":"super_admin","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","activo":true},
 {"id":"9ac2d140-faec-424c-9437-0cedeb8b8b82","email":"dolores@sgh.com","nombre_completo":"Administrador Dolores","rol":"secretario_carreras","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},
 {"id":"ae243acf-1295-4e2e-a08a-7d48c142550e","email":"fedeiguacel@gmail.com","nombre_completo":"Federico Iguacel","rol":"secretario_carreras","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},
 {"id":"2ed1427f-ef06-4f56-9a9d-75bae08047f8","email":"kiritatds@gmail.com","nombre_completo":"Martin Juarez","rol":"operador","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},
 {"id":"b269e008-5d5a-444b-9f80-5f0caf0a7695","email":"vale_0735@hotmail.com","nombre_completo":"Valeria Radeland","rol":"operador","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},
 {"id":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","email":"yesica@sgh.com","nombre_completo":"Yesica Elias","rol":"operador","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},
 {"id":"de88e4f2-fc7d-40d0-8010-5742a27f204b","email":"hipodromodolores@gmail.com","nombre_completo":"FABIO JOSE CASTRO","rol":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},
 {"id":"a631f42a-6dd1-4da0-9575-931904114318","email":"leopalmieri76@gmail.com","nombre_completo":"Leonardo oscar Palmieri","rol":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},
 {"id":"f4ec6823-d421-4013-80ee-2fa5d7c2fed2","email":"maximilianoalza11@gmail.com","nombre_completo":"Maximiliano Alza","rol":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},
 {"id":"8115e7e5-8c0f-4697-bcf7-b1cbb189ab4c","email":"maximongay@gmail.com","nombre_completo":"Maximiliano Mongay","rol":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},
 {"id":"315921a5-3e8f-413a-b1b9-f3952b1f2396","email":"fedeiguacel3@hotmail.com","nombre_completo":"Federico Iguacel loeda","rol":"propietario","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true},
 {"id":"8401c518-3ad7-40c5-bc51-4bc94de06d5a","email":"martinfarias30@yahoo.com.ar","nombre_completo":"Martin Farias","rol":"propietario","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true}]
```

`yesica@sgh.com` → **`operador`**, club Dolores. El commit `302e684` habla de
"secretario_carreras solo puede activar/desactivar", pero la condición escrita es
`!== 'super_admin'`, así que `operador` cae del mismo lado.

Nota de contexto: esto coincide con el hallazgo #7 de
`docs/PORTAL_CARTA_Y_SOLICITUDES_DIAGNOSTICO.md` ("Yesi es `operador`").

### La base SÍ la deja crear entrenadores

El bloqueo es **puramente de frontend**. La RLS de `profesionales` permite el INSERT a
`operador`:

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where tablename in ('profesionales','caballerizas','solicitudes_acceso','propietarios')
order by tablename, cmd, policyname;
```

```json
[{"tablename":"caballerizas","policyname":"caballerizas_delete","cmd":"DELETE","roles":"{authenticated}","qual":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))","with_check":null},
 {"tablename":"caballerizas","policyname":"caballerizas_insert","cmd":"INSERT","roles":"{authenticated}","qual":null,"with_check":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))"},
 {"tablename":"caballerizas","policyname":"caballerizas_select","cmd":"SELECT","roles":"{authenticated}","qual":"(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))","with_check":null},
 {"tablename":"caballerizas","policyname":"caballerizas_update","cmd":"UPDATE","roles":"{authenticated}","qual":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))","with_check":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))"},
 {"tablename":"profesionales","policyname":"profesionales_delete","cmd":"DELETE","roles":"{authenticated}","qual":"( SELECT fn_is_super_admin() AS fn_is_super_admin)","with_check":null},
 {"tablename":"profesionales","policyname":"profesionales_insert","cmd":"INSERT","roles":"{authenticated}","qual":null,"with_check":"( SELECT fn_is_staff() AS fn_is_staff)"},
 {"tablename":"profesionales","policyname":"profesionales_select","cmd":"SELECT","roles":"{authenticated}","qual":"(( SELECT fn_is_staff() AS fn_is_staff) OR (id IN ( SELECT e.entidad_id\n   FROM fn_mis_entidades() e(entidad_tipo, entidad_id)\n  WHERE (e.entidad_tipo = 'profesional'::text))))","with_check":null},
 {"tablename":"profesionales","policyname":"profesionales_update","cmd":"UPDATE","roles":"{authenticated}","qual":"( SELECT fn_is_staff() AS fn_is_staff)","with_check":"( SELECT fn_is_staff() AS fn_is_staff)"},
 {"tablename":"propietarios","policyname":"propietarios_delete","cmd":"DELETE","roles":"{authenticated}","qual":"( SELECT fn_is_super_admin() AS fn_is_super_admin)","with_check":null},
 {"tablename":"propietarios","policyname":"propietarios_insert","cmd":"INSERT","roles":"{authenticated}","qual":null,"with_check":"( SELECT fn_is_staff() AS fn_is_staff)"},
 {"tablename":"propietarios","policyname":"propietarios_select","cmd":"SELECT","roles":"{authenticated}","qual":"(( SELECT fn_is_staff() AS fn_is_staff) OR (id IN ( SELECT e.entidad_id\n   FROM fn_mis_entidades() e(entidad_tipo, entidad_id)\n  WHERE (e.entidad_tipo = 'propietario'::text))))","with_check":null},
 {"tablename":"propietarios","policyname":"propietarios_update","cmd":"UPDATE","roles":"{authenticated}","qual":"( SELECT fn_is_staff() AS fn_is_staff)","with_check":"( SELECT fn_is_staff() AS fn_is_staff)"},
 {"tablename":"solicitudes_acceso","policyname":"solicitudes_acceso_select","cmd":"SELECT","roles":"{authenticated}","qual":"((auth_user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))","with_check":null}]
```

```sql
select p.proname, pg_get_functiondef(p.oid) as def
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('fn_is_staff','fn_is_super_admin','fn_is_portal_user','fn_get_user_club_id','rpc_aprobar_solicitud')
  and n.nspname = 'public';
```

```sql
CREATE OR REPLACE FUNCTION public.fn_is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE auth_user_id = auth.uid()
      AND activo
      AND rol IN ('super_admin', 'secretario_carreras', 'operador')
  );
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.fn_is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE auth_user_id = auth.uid()
      AND rol = 'super_admin'
  );
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.fn_is_portal_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE auth_user_id = auth.uid()
      AND activo
      AND rol IN ('propietario', 'profesional')
  );
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.fn_get_user_club_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid() AND activo;
$function$
```

`fn_is_staff()` incluye `operador` ⇒ **`profesionales_insert` la autoriza.** Yesi tiene
permiso en la base para crear un entrenador; lo único que la frena es que la pantalla no le
muestra el botón.

### ¿Llega a la pantalla?

Sí. El menú de `index.html` para `secretario_carreras` / `operador` incluye los tres módulos:

```bash
git show main:index.html | grep -n -iE "entrenador|jockey|caballeriza|solicitud"
```

```
375:        ['caballerizas.html',             '🏠', 'Caballerizas'],
376:        ['jockeys.html',                  '🎽', 'Jockeys'],
377:        ['profesionales.html',            '🧢', 'Entrenadores'],
383:        ['solicitudes.html',              '📥', 'Solicitudes<span id="nav-pend"></span>'],
400:        moduleCard('caballerizas.html',             '🏠', 'Caballerizas',             'Studs y caballerizas'),
401:        moduleCard('jockeys.html',                  '🎽', 'Jockeys',               'Jockeys del hipódromo'),
402:        moduleCard('profesionales.html',            '🧢', 'Entrenadores',          'Entrenadores del sistema'),
408:        moduleCard('solicitudes.html',              '📥', 'Solicitudes de acceso', 'Pedidos de entrenadores y propietarios para entrar al portal'),
```

(el bloque de línea 361 en adelante está comentado en el código como
`// secretario_carreras, operador y cualquier otro rol con club`).

Y `solicitudes.html` la deja entrar explícitamente:

```bash
git show main:solicitudes.html | sed -n '100,118p'
```

```javascript
async function initAuth(){
  const{createClient}=supabase; sb=createClient(SUPABASE_URL,SUPABASE_KEY);
  const{data:{session}}=await sb.auth.getSession();
  if(!session){window.location.replace('login.html');return false;}
  const{data:usr}=await sb.from('usuarios').select('club_id,nombre_completo,rol')
    .eq('auth_user_id',session.user.id).maybeSingle();
  if(!usr){await sb.auth.signOut();window.location.replace('login.html');return false;}
  if(!['super_admin','secretario_carreras','operador'].includes(usr.rol)){
    window.location.replace('index.html');return false;
  }
  if(usr.rol==='super_admin'){
    const urlClub=new URLSearchParams(window.location.search).get('club');
    CLUB_ID=urlClub||localStorage.getItem('sgh_selected_club_id')||usr.club_id||null;
  }else{CLUB_ID=usr.club_id;}
  currentUser={...session.user,nombre_completo:usr.nombre_completo,rol:usr.rol};
  document.getElementById('user-name').textContent=usr.nombre_completo||session.user.email;
  document.getElementById('auth-overlay').style.display='none';
  return true;
}
```

---

## 3. Jockey vs entrenador en el modelo

**Es la misma tabla.** `profesionales`, con una columna `tipo` de tipo ENUM:

```sql
select t.typname, e.enumlabel
from pg_type t join pg_enum e on e.enumtypid = t.oid
where t.typname in ('tipo_profesional','rol_usuario')
order by t.typname, e.enumsortorder;
```

```json
[{"typname":"rol_usuario","enumlabel":"super_admin"},
 {"typname":"rol_usuario","enumlabel":"secretario_carreras"},
 {"typname":"rol_usuario","enumlabel":"operador"},
 {"typname":"rol_usuario","enumlabel":"profesional"},
 {"typname":"rol_usuario","enumlabel":"propietario"},
 {"typname":"rol_usuario","enumlabel":"publico"},
 {"typname":"tipo_profesional","enumlabel":"jockey"},
 {"typname":"tipo_profesional","enumlabel":"entrenador"},
 {"typname":"tipo_profesional","enumlabel":"ambos"}]
```

`jockeys.html` y `profesionales.html` son **dos vistas de la misma tabla**, cada una
filtrando por `tipo`:

```bash
git grep -n "in('tipo'" main -- '*.html' '*.js'
```

```
main:index.html:253:        sb.from('profesionales').select('id', { count: 'exact', head: true }).in('tipo', ['entrenador', 'ambos']).eq('activo', true),
main:index.html:254:        sb.from('profesionales').select('id', { count: 'exact', head: true }).in('tipo', ['jockey', 'ambos']).eq('activo', true),
main:inscripciones.html:405:    sb.from('profesionales').select('id,nombre,apellido,tipo').eq('club_id', CLUB_ID).in('tipo', ['jockey', 'ambos']).eq('activo', true).order('apellido'),
main:inscripciones.html:406:    sb.from('profesionales').select('id,nombre,apellido,tipo').in('tipo', ['entrenador', 'ambos']).eq('activo', true).order('apellido'),
main:jockeys.html:271:  let jockeyQuery = sb.from('profesionales').select('*').eq('club_id', CLUB_ID).in('tipo', ['jockey', 'ambos']).order('apellido').order('nombre');
main:profesionales.html:273:  let query = sb.from('profesionales').select('*').eq('club_id', CLUB_ID).in('tipo', ['entrenador', 'ambos']).order('apellido').order('nombre');
main:sanciones.html:256:    sb.from('profesionales').select('id,nombre,apellido').eq('club_id', CLUB_ID).in('tipo', ['jockey', 'ambos']).order('apellido'),
main:sanciones.html:259:    sb.from('profesionales').select('id,nombre,apellido').eq('club_id', CLUB_ID).in('tipo', ['entrenador', 'ambos']).order('apellido'),
main:spcs.html:315:    sb.from('profesionales').select('id,nombre,apellido,tipo').eq('club_id', CLUB_ID).in('tipo', ['jockey', 'ambos']).eq('activo', true).order('apellido'),
main:spcs.html:317:    sb.from('profesionales').select('id,nombre,apellido,tipo').in('tipo', ['entrenador', 'ambos']).eq('activo', true).order('apellido'),
```

Son **9 lugares** de la app que filtran por `tipo`. Una ficha con el `tipo` equivocado
desaparece de la mitad de ellos.

(Recordatorio de GOTCHA #13: entrenadores y jockeys son **per-hipódromo** — tienen
`club_id` y `hipodromo_patente`. Los SPC, en cambio, son globales.)

---

## 4. ¿"Nuevo Jockey" sirve para crear un entrenador?

**El tipo está fijo en el código; no hay selector en el formulario.**

```bash
git show main:jockeys.html | sed -n '381,404p'
```

```javascript
  // Un 'ambos' ahora aparece en esta lista: al editarlo NO hay que degradarlo
  // a 'jockey' — perdería la mitad de entrenador.
  const prev = id ? (allData || []).find(r => r.id === id) : null;
  const payload = {
    club_id: CLUB_ID,
    tipo: prev?.tipo === 'ambos' ? 'ambos' : 'jockey',
    nombre: document.getElementById('f-nombre').value.trim(),
    apellido: document.getElementById('f-apellido').value.trim(),
    documento_tipo: document.getElementById('f-doc-tipo').value,
    documento_nro: parseDNI(document.getElementById('f-doc-nro').value) || null,
    fecha_nacimiento: document.getElementById('f-nacimiento').value || null,
    telefono: document.getElementById('f-telefono').value.trim() || null,
    email: document.getElementById('f-email').value.trim() || null,
    estado: nuevoEstado,
    activo: nuevoEstado === 'activo',
    matricula_nro: document.getElementById('f-matricula').value.trim() || null,
    categoria_jockey: document.getElementById('f-categoria').value || null,
    hipodromo_patente: document.getElementById('f-hipodromo-patente').value.trim() || null,
    notas: document.getElementById('f-notas').value.trim() || null,
  };
  const { error } = id
    ? await sb.from('profesionales').update(payload).eq('id', id)
    : await sb.from('profesionales').insert(payload);
```

En un alta (`id` vacío ⇒ `prev = null`) el `tipo` es **siempre** `'jockey'`.

Campos del formulario de jockeys:

```bash
git show main:jockeys.html | grep -on 'id="f-[a-z-]*"'
```

```
155:id="f-id"
156:id="f-estado-original"
160:id="f-nombre"
164:id="f-apellido"
168:id="f-doc-tipo"
176:id="f-doc-nro"
180:id="f-nacimiento"
184:id="f-telefono"
188:id="f-email"
192:id="f-estado"
202:id="f-matricula"
206:id="f-categoria"
216:id="f-hipodromo-patente"
221:id="f-notas"
```

No hay `f-tipo`. Y **no hay `f-patente`** (la patente de entrenador), que sí existe en
`profesionales.html` (`f-patente` + `f-hipodromo-patente`). El formulario de jockeys tiene en
cambio `f-matricula` y `f-categoria`, que son campos de jockey.

### Pero la ficha así creada SÍ se puede vincular en la bandeja

La búsqueda de fichas en `solicitudes.html` **no filtra por `tipo`**:

```bash
git show main:solicitudes.html | sed -n '169,203p'
```

```javascript
// El sistema SÓLO sugiere. El vínculo se crea con la ficha que Yesi elige y
// que viaja como parámetro explícito de rpc_aprobar_solicitud. No hay ninguna
// ruta que vincule por coincidencia. Ver AUTOREGISTRO_PLAN.md §C.8.
async function buscarFichas(sol, textoManual) {
  const tabla = sol.rol_pedido === 'profesional' ? 'profesionales' : 'propietarios';
  const cols  = sol.rol_pedido === 'profesional'
    ? 'id,nombre,apellido,documento_nro,tipo,hipodromo_patente'
    : 'id,nombre,nombre_stud,documento_nro,tipo';

  if (textoManual) {
    const q = `%${textoManual}%`;
    const filtro = sol.rol_pedido === 'profesional'
      ? `nombre.ilike.${q},apellido.ilike.${q},documento_nro.ilike.${q}`
      : `nombre.ilike.${q},nombre_stud.ilike.${q},documento_nro.ilike.${q}`;
    const { data } = await sb.from(tabla).select(cols).eq('club_id', CLUB_ID).or(filtro).limit(12);
    return { exactas: [], sugeridas: data || [], manual: true, tabla };
  }

  // 1) EXACTO por documento_nro.
  const { data: ex } = await sb.from(tabla).select(cols)
    .eq('club_id', CLUB_ID).eq('documento_nro', sol.documento_nro).limit(5);

  // 2) Sin exacto: sugerencias por apellido. Muchos entrenadores no tienen DNI
  //    cargado (103/167), así que este camino es el habitual, no la excepción.
  let sug = [];
  if (!ex || ex.length === 0) {
    const ape = `%${sol.apellido}%`;
    const filtro = sol.rol_pedido === 'profesional'
      ? `apellido.ilike.${ape},nombre.ilike.${ape}`
      : `nombre.ilike.${ape},nombre_stud.ilike.${ape}`;
    const { data } = await sb.from(tabla).select(cols).eq('club_id', CLUB_ID).or(filtro).limit(8);
    sug = data || [];
  }
  return { exactas: ex || [], sugeridas: sug, manual: false, tabla };
}
```

Filtra por `club_id` y por DNI/apellido. **`tipo` sólo se lee para mostrarlo en la tarjeta**
(`fichaHTML`: `if (f.tipo) sub.push(esc(f.tipo));`). Nunca se usa como filtro.

Y la RPC tampoco valida `profesionales.tipo`:

```sql
CREATE OR REPLACE FUNCTION public.rpc_aprobar_solicitud(p_solicitud_id uuid, p_entidad_tipo text, p_entidad_id uuid, p_copiar_documento boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff_id uuid := fn_solicitudes_guard_staff(p_solicitud_id);
        v_sol solicitudes_acceso%ROWTYPE; v_usuario_id uuid; v_ent_club uuid; v_ent_doc text;
BEGIN
  SELECT * INTO v_sol FROM solicitudes_acceso WHERE id = p_solicitud_id FOR UPDATE;
  IF v_sol.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La solicitud ya fue resuelta (estado: %)', v_sol.estado USING ERRCODE='22023'; END IF;
  IF p_entidad_tipo NOT IN ('profesional','propietario') THEN
    RAISE EXCEPTION 'entidad_tipo inválido' USING ERRCODE='22023'; END IF;
  IF p_entidad_tipo <> v_sol.rol_pedido THEN
    RAISE EXCEPTION 'La ficha es de tipo % y la solicitud pide %', p_entidad_tipo, v_sol.rol_pedido USING ERRCODE='22023'; END IF;
  IF p_entidad_tipo='profesional' THEN
    SELECT club_id, documento_nro INTO v_ent_club, v_ent_doc FROM profesionales WHERE id=p_entidad_id;
  ELSE
    SELECT club_id, documento_nro INTO v_ent_club, v_ent_doc FROM propietarios WHERE id=p_entidad_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'La ficha % no existe', p_entidad_id USING ERRCODE='P0002'; END IF;
  IF v_ent_club IS DISTINCT FROM v_sol.club_id THEN
    RAISE EXCEPTION 'La ficha pertenece a otro hipódromo' USING ERRCODE='42501'; END IF;
  BEGIN
    INSERT INTO usuarios (email,nombre_completo,telefono,club_id,rol,activo,estado,auth_user_id,entidad_tipo,entidad_id,password_hash)
    VALUES (v_sol.email, btrim(v_sol.nombre||' '||v_sol.apellido), v_sol.telefono, v_sol.club_id,
            v_sol.rol_pedido::rol_usuario, true, 'activo', v_sol.auth_user_id, p_entidad_tipo, p_entidad_id, '')
    RETURNING id INTO v_usuario_id;
  EXCEPTION WHEN unique_violation THEN
    IF sqlerrm ILIKE '%ux_entidad_una_cuenta%' THEN
      RAISE EXCEPTION 'Esa ficha ya está vinculada a otra cuenta. Desvinculá la anterior antes de aprobar.' USING ERRCODE='23505'; END IF;
    IF sqlerrm ILIKE '%ux_usuarios_auth_user_id%' THEN
      RAISE EXCEPTION 'La cuenta ya tiene usuario en el sistema' USING ERRCODE='23505'; END IF;
    RAISE;
  END;
  IF p_copiar_documento AND (v_ent_doc IS NULL OR btrim(v_ent_doc)='') THEN
    IF p_entidad_tipo='profesional' THEN
      UPDATE profesionales SET documento_nro=v_sol.documento_nro, documento_tipo=v_sol.documento_tipo WHERE id=p_entidad_id;
    ELSE
      UPDATE propietarios SET documento_nro=v_sol.documento_nro, documento_tipo=v_sol.documento_tipo WHERE id=p_entidad_id;
    END IF;
  END IF;
  UPDATE solicitudes_acceso SET estado='aprobada', resuelta_por=v_staff_id, resuelta_at=now() WHERE id=p_solicitud_id;
  RETURN v_usuario_id;
END; $function$
```

El `p_entidad_tipo` que valida es `'profesional'` vs `'propietario'` (el `rol_pedido`), **no**
`profesionales.tipo`. La UI lo confirma: `elegido[s.id] = { tipo: s.rol_pedido, … }`.

Y la guarda de rol también acepta `operador`:

```sql
CREATE OR REPLACE FUNCTION public.fn_solicitudes_guard_staff(p_solicitud_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_usuario usuarios%ROWTYPE; v_club_sol uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado' USING ERRCODE='28000'; END IF;
  SELECT * INTO v_usuario FROM usuarios WHERE auth_user_id = v_uid AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'No autorizado: la cuenta no tiene usuario activo' USING ERRCODE='42501'; END IF;
  IF v_usuario.rol NOT IN ('super_admin','secretario_carreras','operador') THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de secretaría' USING ERRCODE='42501'; END IF;
  SELECT club_id INTO v_club_sol FROM solicitudes_acceso WHERE id = p_solicitud_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud inexistente' USING ERRCODE='P0002'; END IF;
  IF v_usuario.rol <> 'super_admin' AND v_usuario.club_id IS DISTINCT FROM v_club_sol THEN
    RAISE EXCEPTION 'No autorizado: la solicitud es de otro club' USING ERRCODE='42501'; END IF;
  RETURN v_usuario.id;
END; $function$
```

### Costo de usar ese atajo

Una ficha creada desde `jockeys.html` para un entrenador queda con:

| problema | consecuencia |
|---|---|
| `tipo = 'jockey'` | **no aparece** en `profesionales.html` (filtra `entrenador`/`ambos`), ni en el selector de entrenador de `inscripciones.html:406`, `spcs.html:317`, `sanciones.html:259`, ni en el contador de entrenadores de `index.html:253` |
| aparece como jockey | **sí** aparece en los selectores de jockey — se la puede elegir por error como conductor |
| sin `patente` | el formulario de jockeys no tiene ese campo |
| Yesi no lo puede arreglar | para pasarlo a `entrenador`/`ambos` hay que editar la ficha, y la edición en `profesionales.html` también es `super_admin` — además la ficha ni siquiera se lista ahí. Desde `jockeys.html` sí se edita, pero el `update` vuelve a forzar `tipo:'jockey'` |

O sea: **funciona para aprobar la solicitud, y deja una ficha rota que sólo un `super_admin`
puede enderezar (o un UPDATE directo en DB).**

---

## 5. ¿Se puede crear la ficha desde la bandeja?

**No.** Cuando no hay match, `solicitudes.html` ofrece un link de salida, no un alta:

```bash
git show main:solicitudes.html | sed -n '317,346p'
```

```javascript
    cuerpo += exactas.map(f => fichaHTML(s, f, 'exacto')).join('');
  } else if (sugeridas.length) {
    cuerpo += `<div class="vacio">No hay ficha con ese DNI. Estas se parecen por apellido — <strong>ninguna está preseleccionada</strong>:</div>`;
    cuerpo += sugeridas.map(f => fichaHTML(s, f, 'sug')).join('');
  } else {
    cuerpo += `<div class="vacio">No hay ficha con ese DNI ni con ese apellido. Buscá a mano o creá la ficha desde
      ${s.rol_pedido === 'profesional' ? '<a href="profesionales.html" style="color:var(--accent-soft)">Entrenadores</a>'
                                       : '<a href="propietarios.html" style="color:var(--accent-soft)">Propietarios</a>'}
      y volvé.</div>`;
  }
```

(las líneas exactas del bloque, tal como salen del `grep -n` del archivo: 319, 321-322,
324-327, 331, 337, 340, 344).

**El link manda exactamente a la pantalla donde el botón está oculto para ella.** El circuito
se cierra sobre sí mismo: la bandeja dice "creá la ficha en Entrenadores", y Entrenadores no
le muestra cómo crearla.

Vale la pena marcar que esto **no** es un olvido de implementación silencioso: el
`AUTOREGISTRO_PLAN.md` sí preveía el alta desde la bandeja…

```
main:docs/AUTOREGISTRO_PLAN.md:347:| **Sin ficha** — nada razonable | *"No hay ficha con ese DNI."* + buscador manual + **"Crear ficha nueva"** | crear ficha `profesionales`/`propietarios` con los datos declarados, y vincular |
```

…y después un diagnóstico posterior argumentó **en contra** de ese botón:

```bash
git show main:docs/PORTAL_CARTA_Y_SOLICITUDES_DIAGNOSTICO.md | sed -n '195,220p'
```

```
   `ficha.club_id = solicitud.club_id`. Un alta desde solicitudes tiene que nacer con `club_id` = Dolores. Eso
   significa que "entrenador de otro hipódromo" se modela como **ficha local en Dolores con patente de origen ajena**
   (`hipodromo_patente`), no como ficha compartida entre clubes. Es coherente con el gotcha #13 (entrenadores y
   jockeys son per-hipódromo) y con cómo funciona el turf, pero es una definición que conviene que la firme Fede.
2. **`solicitudes_acceso` no captura nada del hipódromo de origen.** Sus columnas son `nombre`, `apellido`,
   `documento_tipo/nro`, `telefono`, `email`, `rol_pedido`, `club_id`, `estado`. No hay campo para hipódromo de
   procedencia, patente ni matrícula. Si el alta tiene que registrar de dónde viene el entrenador, el dato **hoy no
   se pide en el formulario** — habría que sumarlo ahí, no en la pantalla de aprobación.
3. **`profesionales.tipo` es ENUM** (valores en uso: `entrenador`, `jockey`, `ambos`). El alta tiene que elegir uno;
   como `rol_pedido` sólo distingue `profesional` vs `propietario`, el tipo lo tendría que decidir la secretaría en
   el momento de aprobar.
4. **`ux_solicitud_pendiente_doc (club_id, documento_nro) WHERE estado='pendiente'`**: un mismo DNI no puede tener
   dos solicitudes pendientes en el mismo club. No afecta al alta, sí a reintentos.

Riesgos que trae el alta directa, para tener en cuenta cuando se diseñe:

- **Duplicados.** No hay unique por documento. La pantalla busca por DNI y por apellido justamente para evitar esto;
  un botón "crear ficha nueva" al lado de las sugerencias invierte el incentivo — el camino rápido pasa a ser el que
  duplica. Los 103/167 entrenadores sin DNI cargado (comentario en `solicitudes.html:189`) hacen que el matcheo
  automático no alcance para detectarlo.
- **La ficha nueva nace sin historial.** Sin patente, sin matrícula, sin caballeriza. Habilita a inscribir, pero
  liquidaciones y recibos van a arrastrar una ficha incompleta.
- **El vínculo es 1 a 1 e irreversible desde la UI.** `ux_entidad_una_cuenta` impide reapuntar la cuenta a otra
  ficha sin desvincular la anterior, y hoy no hay pantalla para desvincular. Una ficha creada por error y ya
  vinculada requiere intervención manual en DB.
```

Nota: el dato de "103/167 entrenadores sin DNI" viene del comentario en
`solicitudes.html:191-192` (`git show main:solicitudes.html`); en el diagnóstico citado la
referencia dice `:189` — es el mismo comentario, corrido dos líneas en la versión actual del
archivo.

---

## Verificación contra producción

Los cuatro archivos relevados son **byte a byte los que están sirviendo en prod**:

```bash
for f in profesionales.html jockeys.html solicitudes.html caballerizas.html; do
  curl -s "https://sigh.com.ar/$f?v=$RANDOM" -o /tmp/prod_$f
  git show main:$f > /tmp/main_$f
  echo "--- $f"; md5sum /tmp/main_$f /tmp/prod_$f
done
```

```
--- profesionales.html
0a975d0c3ded53c26330117b7cfcfa33  /tmp/main_profesionales.html
0a975d0c3ded53c26330117b7cfcfa33  /tmp/prod_profesionales.html
--- jockeys.html
6b8c3fa1d9c74a0cb189b2fa1239ef79  /tmp/main_jockeys.html
6b8c3fa1d9c74a0cb189b2fa1239ef79  /tmp/prod_jockeys.html
--- solicitudes.html
9b5c0b090ab28fd2386e1043f52610be  /tmp/main_solicitudes.html
9b5c0b090ab28fd2386e1043f52610be  /tmp/prod_solicitudes.html
--- caballerizas.html
c3420560416d3f0d5e9eafb704f73461  /tmp/main_caballerizas.html
c3420560416d3f0d5e9eafb704f73461  /tmp/prod_caballerizas.html
```

---

## El caso concreto: Luciana Lo Gioia

```sql
select * from solicitudes_acceso order by created_at desc limit 20;
```

Fila relevante (salida cruda completa de las 11 filas más abajo):

```json
{"id":"fee3566e-5406-4288-b190-458edabdf671","auth_user_id":"1f60c789-27a9-46ba-8783-f3ece41ef223","email":"llogioia@abc.gob.ar","nombre":"Luciana","apellido":"Lo Gioia","documento_tipo":"DNI","documento_nro":"29785194","telefono":"5492241557027","rol_pedido":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"pendiente","motivo_rechazo":null,"resuelta_por":null,"resuelta_at":null,"created_at":"2026-09-08 16:56:20.086714+00","origen_hipodromo":"Tandil","origen_patente_nro":".","origen_caballeriza":null}
```

Salida cruda completa:

```json
[{"id":"a1f70c25-0000-4912-b3ea-560d80206e66","auth_user_id":"3d61cbbf-3600-45c0-ad15-0cac097f7251","email":"maximongay@gmail.com","nombre":"Maximiliano","apellido":"Mongay","documento_tipo":"DNI","documento_nro":"30230167","telefono":"5492241548186","rol_pedido":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"aprobada","motivo_rechazo":null,"resuelta_por":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","resuelta_at":"2026-09-10 17:14:39.570792+00","created_at":"2026-09-10 13:49:55.424709+00","origen_hipodromo":"Dolores","origen_patente_nro":null,"origen_caballeriza":null},
 {"id":"6d576db6-2ed3-45a1-88d8-2a96675182cb","auth_user_id":"904c5485-b22b-4459-83dd-7d4c5f1525f0","email":"oscarzapico1975@gmail.com","nombre":"Oscar","apellido":"Zapico","documento_tipo":"DNI","documento_nro":"24539461","telefono":"5492236841825","rol_pedido":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"pendiente","motivo_rechazo":null,"resuelta_por":null,"resuelta_at":null,"created_at":"2026-09-10 13:07:50.833938+00","origen_hipodromo":"Palermo","origen_patente_nro":null,"origen_caballeriza":null},
 {"id":"b590b9b9-5a7e-45f6-8f97-6807129d2a1b","auth_user_id":"e9a6dd38-3c18-4821-ab03-c2481c70587f","email":"franciscocaporale15@gmail.com","nombre":"Francisco","apellido":"Caporale","documento_tipo":"DNI","documento_nro":"32101619","telefono":"542352409736","rol_pedido":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"pendiente","motivo_rechazo":null,"resuelta_por":null,"resuelta_at":null,"created_at":"2026-09-08 18:05:39.453679+00","origen_hipodromo":"Concepcion del uruguay","origen_patente_nro":null,"origen_caballeriza":null},
 {"id":"2b06f229-bf06-40f2-9c2d-9a663a1a3026","auth_user_id":"8d67184c-42e4-481c-93e4-befa921ee5db","email":"martinfarias30@yahoo.com.ar","nombre":"Martin","apellido":"Farias","documento_tipo":"DNI","documento_nro":"24854291","telefono":"5492257407879","rol_pedido":"propietario","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"aprobada","motivo_rechazo":null,"resuelta_por":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","resuelta_at":"2026-09-08 17:48:47.849571+00","created_at":"2026-09-08 17:43:48.635172+00","origen_hipodromo":"Dolores","origen_patente_nro":null,"origen_caballeriza":"La tapera"},
 {"id":"e8fdbe20-bfc0-4f62-9bb3-633dd7e122aa","auth_user_id":"f552baa6-d215-431a-860d-9d6eca260405","email":"leopalmieri76@gmail.com","nombre":"Leonardo oscar","apellido":"Palmieri","documento_tipo":"DNI","documento_nro":"24239763","telefono":"5492235267909","rol_pedido":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"aprobada","motivo_rechazo":null,"resuelta_por":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","resuelta_at":"2026-09-08 17:48:23.081555+00","created_at":"2026-09-08 17:40:07.182232+00","origen_hipodromo":"Tandil","origen_patente_nro":null,"origen_caballeriza":null},
 {"id":"7f4128a5-cd2f-4e77-8955-afbbecf758da","auth_user_id":"259d21ac-9ad5-4cf1-97e9-b38594c4e82a","email":"maximilianoalza11@gmail.com","nombre":"Maximiliano","apellido":"Alza","documento_tipo":"DNI","documento_nro":"31024211","telefono":"5492245509752","rol_pedido":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"aprobada","motivo_rechazo":null,"resuelta_por":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","resuelta_at":"2026-09-08 17:48:56.225471+00","created_at":"2026-09-08 17:14:55.452857+00","origen_hipodromo":"Azul","origen_patente_nro":null,"origen_caballeriza":null},
 {"id":"9f448764-d2d9-4366-a45e-a0e978202dd4","auth_user_id":"28d9af87-3001-489e-b22d-216cc4136505","email":"studtomasytobias@hotmail.com","nombre":"abel","apellido":"canto","documento_tipo":"DNI","documento_nro":"27508460","telefono":"542236006491","rol_pedido":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"pendiente","motivo_rechazo":null,"resuelta_por":null,"resuelta_at":null,"created_at":"2026-09-08 16:59:17.408483+00","origen_hipodromo":"Tandil","origen_patente_nro":null,"origen_caballeriza":null},
 {"id":"fee3566e-5406-4288-b190-458edabdf671","auth_user_id":"1f60c789-27a9-46ba-8783-f3ece41ef223","email":"llogioia@abc.gob.ar","nombre":"Luciana","apellido":"Lo Gioia","documento_tipo":"DNI","documento_nro":"29785194","telefono":"5492241557027","rol_pedido":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"pendiente","motivo_rechazo":null,"resuelta_por":null,"resuelta_at":null,"created_at":"2026-09-08 16:56:20.086714+00","origen_hipodromo":"Tandil","origen_patente_nro":".","origen_caballeriza":null},
 {"id":"aa1ae749-9fbb-42d4-8f38-fc988d3ee59c","auth_user_id":"4ccc4063-9092-4796-98f5-7e1a2385012c","email":"fedeiguacel3@hotmail.com","nombre":"Federico","apellido":"Iguacel loeda","documento_tipo":"DNI","documento_nro":"27826202","telefono":"541158911520","rol_pedido":"propietario","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"aprobada","motivo_rechazo":null,"resuelta_por":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","resuelta_at":"2026-09-07 21:08:09.352305+00","created_at":"2026-09-06 19:20:57.664274+00","origen_hipodromo":"Palermo","origen_patente_nro":null,"origen_caballeriza":"Kazan"},
 {"id":"790f5be6-1cf4-4e22-ad98-c986eb4151f2","auth_user_id":"194f7e35-1647-4997-a7ad-c4b000068672","email":"hipodromodolores@gmail.com","nombre":"FABIO JOSE","apellido":"CASTRO","documento_tipo":"DNI","documento_nro":"14979152","telefono":null,"rol_pedido":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"aprobada","motivo_rechazo":null,"resuelta_por":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","resuelta_at":"2026-08-19 16:20:49.852203+00","created_at":"2026-08-19 16:15:28.085357+00","origen_hipodromo":null,"origen_patente_nro":null,"origen_caballeriza":null},
 {"id":"4572eccc-8821-494e-8709-8d3ccf0b67d6","auth_user_id":"2b526e1f-6785-445d-bbe9-02a2126ad646","email":"mdqclio@hotmail.com","nombre":"Leonardo","apellido":"Fernandez","documento_tipo":"DNI","documento_nro":"99999999","telefono":"54992234548459","rol_pedido":"propietario","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"descartada","motivo_rechazo":null,"resuelta_por":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","resuelta_at":"2026-08-04 04:34:08.517253+00","created_at":"2026-08-04 04:28:40.590592+00","origen_hipodromo":"Tandil","origen_patente_nro":null,"origen_caballeriza":null}]
```

### ¿Existe alguna ficha para ella?

```sql
select id,nombre,apellido,tipo,documento_nro,hipodromo_patente,patente,estado,activo,club_id
from profesionales
where documento_nro='29785194'
   or apellido ilike '%gioia%' or nombre ilike '%gioia%'
   or apellido ilike '%luciana%' or nombre ilike '%luciana%';
```

```json
[]
```

**Cero.** Ni por DNI ni por apellido ni por nombre. Y como `buscarFichas` sugiere por
`apellido ilike '%Lo Gioia%'`, la bandeja le va a mostrar el mensaje del caso "sin ficha":
*"No hay ficha con ese DNI ni con ese apellido. Buscá a mano o creá la ficha desde
**Entrenadores** y volvé."*

Contexto adicional de la solicitud: declara `origen_hipodromo = "Tandil"` y
`origen_patente_nro = "."` (un punto — no cargó patente real). O sea, es entrenadora de
otro hipódromo: según la definición de `PORTAL_CARTA_Y_SOLICITUDES_DIAGNOSTICO.md` §1, la
ficha tendría que nacer **local en Dolores** con `hipodromo_patente` = Tandil.

### ¿A las otras pendientes les pasa lo mismo?

```sql
select s.apellido, s.nombre, s.documento_nro,
       (select count(*) from profesionales p where p.club_id=s.club_id and p.documento_nro=s.documento_nro) as fichas_por_dni,
       (select count(*) from profesionales p where p.club_id=s.club_id and (p.apellido ilike '%'||s.apellido||'%' or p.nombre ilike '%'||s.apellido||'%')) as fichas_por_apellido
from solicitudes_acceso s
where s.estado='pendiente' and s.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c'
order by s.created_at desc;
```

```json
[{"apellido":"Zapico","nombre":"Oscar","documento_nro":"24539461","fichas_por_dni":0,"fichas_por_apellido":1},
 {"apellido":"Caporale","nombre":"Francisco","documento_nro":"32101619","fichas_por_dni":0,"fichas_por_apellido":0},
 {"apellido":"canto","nombre":"abel","documento_nro":"27508460","fichas_por_dni":0,"fichas_por_apellido":3},
 {"apellido":"Lo Gioia","nombre":"Luciana","documento_nro":"29785194","fichas_por_dni":0,"fichas_por_apellido":0}]
```

Las 4 pendientes son `rol_pedido='profesional'` y **ninguna tiene match exacto por DNI**.
Dos de ellas (**Caporale** y **Lo Gioia**) tampoco tienen ninguna ficha parecida por
apellido: caen en el mismo callejón sin salida, y para ambas hace falta crear la ficha.
Zapico tiene 1 candidata por apellido y canto tiene 3 — para esas dos, Yesi **sí** puede
resolver sola (elegir la sugerencia, tildar "copiarle el DNI declarado" y aprobar),
siempre que al verificar por teléfono confirme que la ficha es la persona.

O sea: **el problema no es puntual de Luciana — bloquea 2 de las 4 pendientes.**

---

## Veredicto: qué puede hacer Yesi hoy con la solicitud de Luciana Lo Gioia

Con su cuenta (`yesica@sgh.com`, rol `operador`), **hoy, sin tocar código y sin ayuda de un
`super_admin`, no puede aprobarla por el camino correcto.** Los caminos reales son tres:

### Opción A — la correcta, pero necesita a otra persona (RECOMENDADA)

1. Yesi entra a **Solicitudes** (`solicitudes.html`) y confirma el caso: Luciana Lo Gioia,
   DNI 29785194, sin ficha ni por DNI ni por apellido.
2. Verifica por teléfono (`5492241557027`) como manda el circuito del piloto.
3. **Le pide a un `super_admin`** (hoy `admin@sgh.com`) que entre a
   **Entrenadores** (`profesionales.html`) → `+ Nuevo Entrenador` y cree la ficha con:
   - Nombre: `Luciana` / Apellido: `Lo Gioia`
   - DNI: `29785194`
   - Teléfono: `5492241557027` / Email: `llogioia@abc.gob.ar`
   - `hipodromo_patente`: `Tandil` (es de otro hipódromo; la ficha nace local en Dolores)
   - Patente: **dejarla vacía** — lo que declaró es `"."`, no un número
4. Yesi vuelve a **Solicitudes**, refresca, y la ficha aparece como **EXACTO** por DNI.
5. La selecciona → **Vincular y aprobar**. (El checkbox de "copiarle el DNI declarado" no
   hace falta: la ficha ya nace con DNI.)
6. Acepta el ofrecimiento de avisar por WhatsApp.

### Opción B — el atajo que ella puede hacer sola, con costo

1. Entra a **Jockeys** (`jockeys.html`) → `+ Nuevo Jockey` (ese botón **sí** lo ve) y carga
   los datos de Luciana.
2. Vuelve a Solicitudes: la ficha aparece como **EXACTO** por DNI (la búsqueda no filtra por
   `tipo`) y **la RPC la acepta**.
3. Queda aprobada y con acceso al portal.

**Costo:** la ficha queda con `tipo='jockey'`. Luciana **no** va a figurar en el listado de
Entrenadores, ni en los selectores de entrenador de inscripciones, SPCs y sanciones, y **sí**
va a figurar como jockey elegible. Y Yesi **no lo puede corregir después** — hace falta un
`super_admin` o un UPDATE en DB. **No conviene** salvo urgencia real.

### Opción C — no hacer nada todavía

Dejar la solicitud `pendiente` hasta que se decida el arreglo de fondo. No caduca ni se
pierde: `estado='pendiente'`, y el único límite es el índice
`ux_solicitud_pendiente_doc (club_id, documento_nro) WHERE estado='pendiente'`, que sólo
impide que Luciana mande una **segunda** solicitud mientras esta siga abierta. El costo es que
Luciana sigue sin acceso al portal.

### Lo que Yesi NO puede hacer hoy, por más que lo intente

- Ver el botón `+ Nuevo Entrenador` en `profesionales.html` (oculto por rol).
- Editar una ficha de entrenador existente (también `super_admin`).
- Crear la ficha desde la bandeja de Solicitudes (no existe el botón; sólo hay un link).
- Aprobar la solicitud sin ficha: la RPC exige `p_entidad_id`, y la UI mantiene el botón
  deshabilitado hasta que se selecciona una (`Elegí una ficha para poder aprobar.`).

---

## Números de resumen

| dato | valor |
|---|---|
| Rol real de Yesi | `operador` (no `secretario_carreras`) |
| Pantallas con botón "Nuevo" gateado por rol, de las 3 comparadas | **1** (`profesionales.html`) |
| Línea que oculta el botón | `profesionales.html:269` |
| Commit que lo introdujo | `302e684`, 08/05/2026 |
| ¿La RLS bloquea a Yesi? | **No** — `profesionales_insert` usa `fn_is_staff()`, que incluye `operador` |
| Tabla de jockeys y entrenadores | la misma: `profesionales`, columna `tipo` |
| Valores del ENUM `tipo_profesional` | `jockey`, `entrenador`, `ambos` |
| Lugares de la app que filtran por `tipo` | 9 |
| Fichas existentes para Luciana Lo Gioia | **0** |
| Solicitudes `pendiente` de Dolores | **4** (Zapico, Caporale, canto, Lo Gioia) — todas `profesional` |
| Pendientes con match exacto por DNI | **0 de 4** |
| Pendientes bloqueadas por falta de ficha (ni DNI ni apellido) | **2 de 4** (Caporale, Lo Gioia) |
| Pendientes que Yesi puede resolver sola hoy | **2 de 4** (Zapico 1 sugerencia, canto 3) |
| Archivos verificados idénticos entre `main` y prod | 4/4 |

---

## Preguntas abiertas

1. **¿Se revierte el gate de `302e684`?** Ese commit restringió crear/editar entrenadores a
   `super_admin` en mayo, cuatro meses antes de que existiera el circuito de autorregistro
   que **depende** de que la secretaría cree fichas. ¿Sigue vigente la razón original? El
   mensaje del commit no la explicita, y el gate quedó inconsistente con `jockeys.html` y
   `caballerizas.html`, que nunca lo tuvieron. Además la RLS ya autoriza a `operador`, así
   que hoy el gate es sólo cosmético.
2. **Si se revierte, ¿hasta dónde?** ¿Sólo el botón "Nuevo", o también "Editar"? "Eliminar"
   probablemente convenga que siga siendo `super_admin` (la RLS ya lo fuerza:
   `profesionales_delete` es `fn_is_super_admin()`).
3. **¿Yesi debería ser `operador` o `secretario_carreras`?** Hoy la distinción casi no opera
   —`fn_is_staff()` los trata igual y `302e684` los trata igual— pero si el rol se pensó como
   más limitado, conviene decidirlo explícitamente antes de aflojar permisos.
4. **¿Se hace el botón "Crear ficha nueva" en la bandeja?** El `AUTOREGISTRO_PLAN.md` §A.3 lo
   preveía; el diagnóstico de `PORTAL_CARTA_Y_SOLICITUDES_DIAGNOSTICO.md` argumentó en contra
   por el riesgo de duplicados. La alternativa mínima es sólo destrabar el botón en
   `profesionales.html` y dejar el link como está — menos código, mismo riesgo de duplicados
   que hoy.
5. **Si se hace el alta desde la bandeja, ¿quién elige el `tipo`?** `rol_pedido` sólo dice
   `profesional`; hay que elegir entre `entrenador`/`jockey`/`ambos` a mano.
6. **Confirmar con Fede** la definición de "entrenador de otro hipódromo = ficha local en
   Dolores con `hipodromo_patente` ajena" (pendiente desde
   `PORTAL_CARTA_Y_SOLICITUDES_DIAGNOSTICO.md` §1).
7. **Francisco Caporale está en la misma situación exacta que Luciana** (0 fichas por DNI y
   0 por apellido). Con el arreglo de fondo se destraban las dos juntas; sin él, las dos
   necesitan a un `super_admin`. ¿Se resuelven ahora a mano o se espera el fix?

---

## Verificación de push a `origin`

(se completa abajo, después del primer push)
