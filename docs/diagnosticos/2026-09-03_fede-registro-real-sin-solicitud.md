# Registro real de Fede (fedeiguacel3@hotmail.com) — el mail llegó, la solicitud nunca se creó

- **Fecha**: 2026-09-03
- **SHA de `main` sobre el que se relevó el código**: `5d95372fd09efbd5c0cbbb0a76da026bb9bb6d80`
  (`5d95372 merge: documentación de ISSUE-069 y GOTCHA #89`)
- **Rama del informe**: `reports`
- **Modo**: SOLO LECTURA. No se ejecutó ningún INSERT/UPDATE/DELETE ni DDL.
- **Guards verificados**:

  ```
  $ pwd
  /home/clio/dev/SGH

  $ git rev-parse HEAD          # (parado en main al momento del relevamiento)
  5d95372fd09efbd5c0cbbb0a76da026bb9bb6d80

  sql> select count(*) as spcs from spcs;
  [{"spcs":181}]

  ref del proyecto Supabase: unlhcuanfrtpatoipwve
  ```

  Los tres guards dan lo esperado (181 = baseline al 2026-08-23).

---

## VEREDICTO

**La solicitud no se creó.** Fede quedó parado en el paso 3 de 3: creó la cuenta (14:15:24 UTC),
confirmó el correo (14:16:38 UTC) y ahí terminó. La `rpc_solicitar_acceso` nunca se llamó, así que
no hay fila en `solicitudes_acceso` y la bandeja de Yesi está correctamente vacía — el filtro de
`solicitudes.html` no tiene nada que ver.

La cuenta quedó viva y con sesión: si Fede vuelve a abrir `https://sigh.com.ar/solicitar-acceso.html`
**en el mismo navegador** (Edge en Windows), el formulario se le va a mostrar precargado con el
borrador y le alcanza con apretar "Enviar solicitud".

---

## 1. Auth — ¿hay usuario nuevo creado hoy?

Sí, uno solo.

### Query tal como se corrió

```sql
select id, email, created_at, confirmed_at, email_confirmed_at, last_sign_in_at,
       raw_user_meta_data, banned_until, deleted_at
from auth.users
order by created_at desc
limit 15;
```

### Salida cruda completa

```json
[{"id":"4ccc4063-9092-4796-98f5-7e1a2385012c","email":"fedeiguacel3@hotmail.com","created_at":"2026-09-03 14:15:24.237902+00","confirmed_at":"2026-09-03 14:16:38.572529+00","email_confirmed_at":"2026-09-03 14:16:38.572529+00","last_sign_in_at":"2026-09-03 14:16:38.584893+00","raw_user_meta_data":{"sub":"4ccc4063-9092-4796-98f5-7e1a2385012c","email":"fedeiguacel3@hotmail.com","email_verified":true,"phone_verified":false},"banned_until":null,"deleted_at":null},
{"id":"194f7e35-1647-4997-a7ad-c4b000068672","email":"hipodromodolores@gmail.com","created_at":"2026-08-19 16:14:52.624981+00","confirmed_at":"2026-08-19 16:15:19.052193+00","email_confirmed_at":"2026-08-19 16:15:19.052193+00","last_sign_in_at":"2026-08-28 20:52:47.204628+00","raw_user_meta_data":{"sub":"194f7e35-1647-4997-a7ad-c4b000068672","email":"hipodromodolores@gmail.com","email_verified":true,"phone_verified":false},"banned_until":null,"deleted_at":null},
{"id":"5b7e9492-05ab-4af8-8053-40a827686c5d","email":"kiritatds@gmail.com","created_at":"2026-08-16 20:33:32.186347+00","confirmed_at":"2026-08-16 21:14:07.832054+00","email_confirmed_at":"2026-08-16 21:14:07.832054+00","last_sign_in_at":"2026-08-16 21:14:07.839894+00","raw_user_meta_data":{"email_verified":true,"nombre_completo":"Martin Juarez"},"banned_until":null,"deleted_at":null},
{"id":"df8a5983-97cc-416d-8942-028ca0bb1664","email":"vale_0735@hotmail.com","created_at":"2026-08-16 13:06:47.139277+00","confirmed_at":"2026-08-16 17:50:48.733977+00","email_confirmed_at":"2026-08-16 17:50:48.733977+00","last_sign_in_at":"2026-08-26 18:46:23.720432+00","raw_user_meta_data":{"email_verified":true,"nombre_completo":"Valeria Radeland"},"banned_until":null,"deleted_at":null},
{"id":"8b2f4c83-04a7-4bb0-a23a-6ae4201f3870","email":"fedeiguacel@gmail.com","created_at":"2026-08-07 04:50:23.223386+00","confirmed_at":"2026-08-23 21:50:48.621623+00","email_confirmed_at":"2026-08-23 21:50:48.621623+00","last_sign_in_at":"2026-09-03 03:57:00.946366+00","raw_user_meta_data":{"email_verified":true,"nombre_completo":"Federico Iguacel"},"banned_until":null,"deleted_at":null},
{"id":"2b526e1f-6785-445d-bbe9-02a2126ad646","email":"mdqclio@hotmail.com","created_at":"2026-08-04 04:26:41.739585+00","confirmed_at":"2026-08-04 04:28:34.335237+00","email_confirmed_at":"2026-08-04 04:28:34.335237+00","last_sign_in_at":"2026-08-23 21:55:32.784784+00","raw_user_meta_data":{"sub":"2b526e1f-6785-445d-bbe9-02a2126ad646","email":"mdqclio@hotmail.com","email_verified":true,"phone_verified":false},"banned_until":null,"deleted_at":null},
{"id":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","email":"yesica@sgh.com","created_at":"2026-05-11 02:40:13.034218+00","confirmed_at":"2026-05-11 02:40:13.050873+00","email_confirmed_at":"2026-05-11 02:40:13.050873+00","last_sign_in_at":"2026-09-03 16:48:27.302051+00","raw_user_meta_data":{"email_verified":true},"banned_until":null,"deleted_at":null},
{"id":"da8fc17b-569d-4449-a50d-ea01460e50fe","email":"clio@mdq.com.ar","created_at":"2026-04-22 14:32:53.864698+00","confirmed_at":null,"email_confirmed_at":null,"last_sign_in_at":null,"raw_user_meta_data":{"sub":"da8fc17b-569d-4449-a50d-ea01460e50fe","email":"clio@mdq.com.ar","email_verified":false,"phone_verified":false,"nombre_completo":"Leonardo fernandez"},"banned_until":null,"deleted_at":null},
{"id":"332175cb-a3af-46df-b54b-d6252d17619d","email":"sanfrancisco@sgh.com","created_at":"2026-04-22 03:13:31.60625+00","confirmed_at":null,"email_confirmed_at":null,"last_sign_in_at":null,"raw_user_meta_data":{"sub":"332175cb-a3af-46df-b54b-d6252d17619d","email":"sanfrancisco@sgh.com","nombre":"Andres Balkenende","email_verified":false,"phone_verified":false},"banned_until":null,"deleted_at":null},
{"id":"01c55b92-c53e-42fd-948f-ebfdb31b8d65","email":"dolores@sgh.com","created_at":"2026-04-22 02:07:18.20667+00","confirmed_at":"2026-04-22 02:07:18.223629+00","email_confirmed_at":"2026-04-22 02:07:18.223629+00","last_sign_in_at":"2026-09-03 16:58:24.135359+00","raw_user_meta_data":{"email_verified":true},"banned_until":null,"deleted_at":null},
{"id":"6b32e0a1-fb26-4d73-a32e-358665a01e51","email":"admin@sgh.com","created_at":"2026-04-22 00:44:42.449717+00","confirmed_at":"2026-04-22 00:44:42.455762+00","email_confirmed_at":"2026-04-22 00:44:42.455762+00","last_sign_in_at":"2026-08-31 20:56:15.818035+00","raw_user_meta_data":{"email_verified":true},"banned_until":null,"deleted_at":null}]
```

### Lectura

| Dato | Valor |
|---|---|
| Mail | `fedeiguacel3@hotmail.com` |
| `auth.users.id` | `4ccc4063-9092-4796-98f5-7e1a2385012c` |
| Alta (`created_at`) | 2026-09-03 **14:15:24** UTC |
| Confirmado (`email_confirmed_at`) | 2026-09-03 **14:16:38** UTC → **SÍ, confirmado** |
| Último login | 2026-09-03 14:16:38 UTC (el propio canje del link, no un login con contraseña) |
| Baneado / borrado | no / no |
| `raw_user_meta_data` | **sin `nombre_completo`** — coherente con el `signUp` de `solicitar-acceso.html`, que no manda `options.data` |

Tardó **74 segundos** entre el alta y la confirmación: abrió el mail casi al instante.

### ¿Tiene sesión?

Sí, y **sigue abierta**.

```sql
select id, user_id, created_at, updated_at, not_after, refreshed_at, user_agent, ip
from auth.sessions
where user_id='4ccc4063-9092-4796-98f5-7e1a2385012c'
order by created_at desc;
```

```json
[{"id":"29b3a4c3-72b1-4d1c-84eb-e0e7ac68840d","user_id":"4ccc4063-9092-4796-98f5-7e1a2385012c","created_at":"2026-09-03 14:16:38.586045+00","updated_at":"2026-09-03 14:16:38.586045+00","not_after":null,"refreshed_at":null,"user_agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0","ip":"181.21.217.217"}]
```

```sql
select id, token is not null as has_token, user_id, revoked, created_at, updated_at, parent, session_id
from auth.refresh_tokens
where user_id='fedeiguacel3@hotmail.com' or session_id='29b3a4c3-72b1-4d1c-84eb-e0e7ac68840d'
order by created_at;
```

```json
[{"id":1176,"has_token":true,"user_id":"4ccc4063-9092-4796-98f5-7e1a2385012c","revoked":false,"created_at":"2026-09-03 14:16:38.60207+00","updated_at":"2026-09-03 14:16:38.60207+00","parent":null,"session_id":"29b3a4c3-72b1-4d1c-84eb-e0e7ac68840d"}]
```

Dos cosas que salen de acá:

1. **Navegador**: Edge 152 sobre Windows, IP `181.21.217.217`. Es la misma IP desde la que salió el
   `POST /signup` (ver §4), así que confirmó el mail **en la misma máquina** donde llenó el
   formulario. El `localStorage` con el borrador está en esa máquina.
2. **El refresh token nunca rotó** (`parent: null`, `updated_at == created_at`, `revoked: false`).
   El cliente de supabase-js refresca solo antes del vencimiento del access token (1 h por defecto).
   Que no haya ni una rotación quiere decir que **la pestaña se cerró dentro de la primera hora**
   posterior a las 14:16 — Fede no dejó la página abierta.

---

## 2. `solicitudes_acceso` — ¿hay fila para ese mail?

**No.** La tabla tiene exactamente 2 filas y ninguna es de él.

```sql
select * from solicitudes_acceso order by created_at desc limit 20;
```

```json
[{"id":"790f5be6-1cf4-4e22-ad98-c986eb4151f2","auth_user_id":"194f7e35-1647-4997-a7ad-c4b000068672","email":"hipodromodolores@gmail.com","nombre":"FABIO JOSE","apellido":"CASTRO","documento_tipo":"DNI","documento_nro":"14979152","telefono":null,"rol_pedido":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"aprobada","motivo_rechazo":null,"resuelta_por":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","resuelta_at":"2026-08-19 16:20:49.852203+00","created_at":"2026-08-19 16:15:28.085357+00","origen_hipodromo":null,"origen_patente_nro":null,"origen_caballeriza":null},
{"id":"4572eccc-8821-494e-8709-8d3ccf0b67d6","auth_user_id":"2b526e1f-6785-445d-bbe9-02a2126ad646","email":"mdqclio@hotmail.com","nombre":"Leonardo","apellido":"Fernandez","documento_tipo":"DNI","documento_nro":"99999999","telefono":"54992234548459","rol_pedido":"propietario","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"descartada","motivo_rechazo":null,"resuelta_por":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","resuelta_at":"2026-08-04 04:34:08.517253+00","created_at":"2026-08-04 04:28:40.590592+00","origen_hipodromo":null,"origen_patente_nro":null,"origen_caballeriza":null}]
```

Ninguna con `email = 'fedeiguacel3@hotmail.com'` ni con
`auth_user_id = '4ccc4063-9092-4796-98f5-7e1a2385012c'`. Tampoco hay fila en `usuarios`:

```sql
select id, email, nombre_completo, rol, club_id, activo
from usuarios
where id='4ccc4063-9092-4796-98f5-7e1a2385012c' or email ilike '%fedeiguacel%';
```

```json
[{"id":"ae243acf-1295-4e2e-a08a-7d48c142550e","email":"fedeiguacel@gmail.com","nombre_completo":"Federico Iguacel","rol":"secretario_carreras","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true}]
```

La única fila que trae es la de **su otra cuenta** (`fedeiguacel@gmail.com`, secretario de carreras).
La cuenta nueva no tiene usuario en el sistema.

### El filtro de `solicitudes.html` NO es el problema

Aun así se revisó, porque era parte del pedido. Extracto de `main:solicitudes.html`:

```javascript
231:  let q = sb.from('solicitudes_acceso').select('*').eq('club_id', CLUB_ID).order('created_at',{ascending:false});
232:  q = (tab === 'pendiente') ? q.eq('estado','pendiente') : q.neq('estado','pendiente');
...
237:  const { count } = await sb.from('solicitudes_acceso')
238:    .select('id',{count:'exact',head:true}).eq('club_id',CLUB_ID).eq('estado','pendiente');
```

El filtro es `club_id = CLUB_ID` + (`estado = 'pendiente'` en la pestaña Pendientes, `estado <> 'pendiente'`
en la otra). La RPC inserta siempre con `estado` en su DEFAULT (`pendiente`) y con el `p_club_id` que
manda el formulario (`CLUB_DOLORES`), así que **una fila creada por el flujo real cae sí o sí en la
pestaña Pendientes de Yesi**. No hay filtro que la pueda esconder.

La policy de SELECT tampoco la escondería:

```sql
select policyname, cmd, roles::text, qual, with_check from pg_policies where tablename='solicitudes_acceso';
```

```json
[{"policyname":"solicitudes_acceso_select","cmd":"SELECT","roles":"{authenticated}","qual":"((auth_user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))","with_check":null}]
```

Yesi es staff de Dolores → ve todas las filas con `club_id = Dolores`. Y de hecho su bandeja corrió
hoy y devolvió 200 con lista vacía (ver los `GET /rest/v1/solicitudes_acceso?...estado=eq.pendiente`
en §4b, a las 16:48 UTC).

**Nota**: no existe policy de INSERT sobre `solicitudes_acceso`. No es un bug: la única vía de alta
es `rpc_solicitar_acceso`, que es `SECURITY DEFINER` y por lo tanto no pasa por RLS.

---

## 3. Reconstrucción del flujo — ¿por qué no hay fila?

### 3a. Dónde vive el `INSERT`

`rpc_solicitar_acceso` es la **única** manera de crear una solicitud. Fuente cruda:

```sql
select prosrc from pg_proc where proname='rpc_solicitar_acceso';
```

```
DECLARE v_uid uuid := auth.uid(); v_email text; v_doc text := btrim(coalesce(p_documento_nro,'')); v_id uuid;
        v_hip text := nullif(btrim(coalesce(p_origen_hipodromo,'')),'');
        v_pat text := nullif(btrim(coalesce(p_origen_patente_nro,'')),'');
        v_cab text := nullif(btrim(coalesce(p_origen_caballeriza,'')),'');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado' USING ERRCODE='28000'; END IF;
  SELECT lower(btrim(a.email)) INTO v_email FROM auth.users a WHERE a.id = v_uid;
  IF v_email IS NULL OR v_email='' THEN RAISE EXCEPTION 'La cuenta no tiene email' USING ERRCODE='22023'; END IF;
  IF p_email IS NOT NULL AND lower(btrim(p_email)) <> v_email THEN
    RAISE EXCEPTION 'El email no coincide con el de la cuenta' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = v_uid) THEN
    RAISE EXCEPTION 'La cuenta ya tiene acceso al sistema' USING ERRCODE='23505'; END IF;
  IF btrim(coalesce(p_nombre,''))='' OR btrim(coalesce(p_apellido,''))='' THEN
    RAISE EXCEPTION 'Nombre y apellido son obligatorios' USING ERRCODE='22023'; END IF;
  IF v_doc !~ '^[0-9]{7,8}$' THEN
    RAISE EXCEPTION 'El DNI debe tener 7 u 8 dígitos, sin puntos ni espacios' USING ERRCODE='22023'; END IF;
  -- Teléfono RECOMENDADO, no obligatorio (adenda del Gate 3). Se guarda NULL si
  -- viene vacío, para que la bandeja sepa que no hay a dónde avisar.
  IF p_rol_pedido NOT IN ('profesional','propietario') THEN
    RAISE EXCEPTION 'rol_pedido inválido: se espera profesional o propietario' USING ERRCODE='22023'; END IF;
  -- Origen: obligatorio en los dos roles, con un campo extra para el propietario.
  -- Es el dato con el que la secretaría llama al hipódromo a validar; sin eso la
  -- solicitud no se puede resolver.
  IF v_hip IS NULL THEN
    RAISE EXCEPTION 'El hipódromo de origen es obligatorio' USING ERRCODE='22023'; END IF;
  IF p_rol_pedido = 'propietario' AND v_cab IS NULL THEN
    RAISE EXCEPTION 'La caballeriza es obligatoria para propietarios' USING ERRCODE='22023'; END IF;
  -- El nro de patente sólo aplica al entrenador. Si viene cargado en una
  -- solicitud de propietario se descarta, para que la bandeja no muestre un dato
  -- que no corresponde al rol.
  IF p_rol_pedido <> 'profesional' THEN v_pat := NULL; END IF;
  IF p_rol_pedido <> 'propietario' THEN v_cab := NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Hipódromo inexistente' USING ERRCODE='P0002'; END IF;
  BEGIN
    INSERT INTO solicitudes_acceso (auth_user_id,email,nombre,apellido,documento_tipo,documento_nro,telefono,
                                    rol_pedido,club_id,origen_hipodromo,origen_patente_nro,origen_caballeriza)
    VALUES (v_uid,v_email,btrim(p_nombre),btrim(p_apellido),
            coalesce(nullif(btrim(p_documento_tipo),''),'DNI'),v_doc,nullif(btrim(coalesce(p_telefono,'')),''),
            p_rol_pedido,p_club_id,v_hip,v_pat,v_cab)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    IF sqlerrm ILIKE '%ux_solicitud_pendiente_doc%' THEN
      RAISE EXCEPTION 'Ya hay una solicitud pendiente con ese documento' USING ERRCODE='23505'; END IF;
    RAISE EXCEPTION 'Esta cuenta ya envió una solicitud' USING ERRCODE='23505';
  END;
  RETURN v_id;
END;
```

Lo importante de la primera línea: **`IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'`**. La
RPC exige sesión. Y con "Confirm email" prendido, `signUp` **no** devuelve sesión.

### 3b. La secuencia real de `solicitar-acceso.html` (`main:solicitar-acceso.html`)

```javascript
// línea 498-501 — el alta
const { data: authData, error: authErr } = await sb.auth.signUp({
  email: d.email, password: d.pass,
  options: { captchaToken, emailRedirectTo: window.location.href.split('?')[0] },
});
```

```javascript
// líneas 536-542 — sin sesión no se puede seguir
// Con "Confirm email" activo, signUp NO devuelve sesión: hay que esperar a
// que el usuario abra el mail. Sin sesión, la RPC no puede correr todavía.
if (!authData.session) {
  loading('btn-enviar', 'btn-txt', false, 'Enviar solicitud');
  document.getElementById('conf-email').textContent = d.email;
  seccion('sec-confirmar');
  return;
}
```

Es decir: **el `return` corta antes de `enviarSolicitud(d)`**. Fede vio esta pantalla
(`sec-confirmar`, líneas 224-234):

```html
<div id="sec-confirmar" style="display:none;">
  <div class="ok-icon">📬</div>
  <h2 class="card-title" style="text-align:center;">Revisá tu correo</h2>
  <p class="card-sub" style="text-align:center;">
    Te mandamos un mail a <strong id="conf-email"></strong> para confirmar la dirección.
    Abrilo y volvés acá para terminar la solicitud.
  </p>
  <p class="card-sub" style="text-align:center;">
    Si no lo ves, mirá en correo no deseado.
  </p>
</div>
```

Antes del `signUp`, la página guarda el borrador (líneas 493-496):

```javascript
// El borrador se guarda ANTES del signUp: si el usuario tiene que confirmar
// el email, al volver la página recupera los datos sin hacérselos escribir
// de nuevo.
localStorage.setItem(BORRADOR, JSON.stringify(d));   // BORRADOR = 'sgh_solicitud_borrador'
```

### 3c. ¿Adónde aterriza después de confirmar?

`emailRedirectTo = window.location.href.split('?')[0]` = `https://sigh.com.ar/solicitar-acceso.html`.

Los logs de auth registran el `GET /verify` con `"referer":"https://sigh.com.ar/solicitar-acceso.html"`
(§4). Ese campo lo llena GoTrue con el `redirect_to` ya validado contra la allowlist (si el destino no
estuviera permitido, ahí figuraría el `SITE_URL`). **Inferencia, no medición directa**: los logs de
auth no exponen el `Location` del 303. Lo que sí descarta la lectura alternativa (que fuera el header
`Referer` del browser) es que el click salió de un cliente de correo — Hotmail/Outlook — y ese header
nunca sería `solicitar-acceso.html`.

Conclusión: **aterrizó de vuelta en `solicitar-acceso.html`, con la sesión ya creada** (flujo
implícito: tokens en el hash de la URL, `detectSessionInUrl` por defecto en `true` — el cliente se
crea sin opciones, línea 322: `const sb = createClient(SUPABASE_URL, SUPABASE_KEY);`).

### 3d. Camino 2 — qué pasa al volver (líneas 583-613)

```javascript
// --- Camino 2: ya logueado (volvió de confirmar el email) -------------------
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;

  // Si ya tiene usuario en el sistema, no tiene nada que solicitar.
  const { data: usr } = await sb.from('usuarios')
    .select('id').eq('auth_user_id', session.user.id).maybeSingle();
  if (usr) { window.location.replace('portal.html'); return; }

  // Si ya mandó la solicitud, mostrar el estado y no el formulario.
  const { data: sol } = await sb.from('solicitudes_acceso')
    .select('id').eq('auth_user_id', session.user.id).maybeSingle();
  if (sol) { seccion('sec-listo'); return; }

  // Logueado, sin usuario y sin solicitud: sólo faltan los datos.
  document.getElementById('grp-cuenta').style.display = 'none';
  document.getElementById('sub-form').textContent =
    'Ya confirmaste tu correo. Revisá los datos y enviá la solicitud.';
  const b = JSON.parse(localStorage.getItem(BORRADOR) || '{}');
  ...
})();
```

**Sobre el "ojo con el camino 2" del diagnóstico del 02/09**: la redirección a `portal.html` sólo
dispara si hay fila en `usuarios` para ese `auth_user_id`. Para `4ccc4063-…` **no la hay** (§2), así
que Fede **no** fue rebotado a `portal.html`. Lo que le tiene que haber salido es la tercera rama:
el formulario otra vez, con el bloque de correo/contraseña oculto, el subtítulo *"Ya confirmaste tu
correo. Revisá los datos y enviá la solicitud."* y los campos precargados desde el borrador.

Y ahí se quedó: **nunca apretó "Enviar solicitud"**, que es lo único que llama a la RPC
(`document.getElementById('btn-enviar').onclick`, líneas 470-484 para la rama `yaLogueado`).

### 3e. Respuesta directa: ¿puede confirmar y quedar con sesión sin que la solicitud exista?

**Sí, y no es un caso raro: es el comportamiento normal del diseño actual.** La creación de la
solicitud está estructuralmente separada del alta de la cuenta:

| Paso | Quién lo dispara | Qué queda en la base |
|---|---|---|
| 1. Completar el form y apretar Enviar | usuario | `auth.users` (sin confirmar) + borrador en `localStorage` |
| 2. Abrir el mail y clickear | usuario | `email_confirmed_at`, `auth.sessions`, `auth.refresh_tokens` |
| 3. **Volver a apretar "Enviar solicitud"** | **usuario, otra vez** | **`solicitudes_acceso`** |

Entre el paso 2 y el 3 no hay nada automático. Ningún `onAuthStateChange` que reenvíe la RPC al
detectar la sesión, ningún trigger en `auth.users`, ningún reintento. Si el usuario cierra la
pestaña después de confirmar —que es exactamente lo que muestra el refresh token sin rotar— la
cuenta queda **huérfana**: confirmada, con sesión, sin solicitud y sin usuario. Invisible para la
secretaría.

Agravantes del paso 3 que conviene tener anotados:

- **El borrador es por-origen y por-navegador.** Si el mail se abre en el teléfono (o en otro
  navegador, o con el `localStorage` limpio), el paso 3 muestra el formulario **vacío** y hay que
  retipear todo. En este caso no aplica —confirmó desde la misma IP y el mismo Windows— pero es el
  siguiente que va a morder.
- **El texto de `sec-confirmar` dice "Abrilo y volvés acá para terminar la solicitud"**, pero el
  usuario que clickea el link ya *está* "acá": vuelve a la misma URL y ve un formulario parecido al
  que ya llenó. Es fácil leerlo como "ya está hecho" y cerrar.
- No hay ningún aviso posterior (ni mail, ni pantalla) que le diga al usuario que la solicitud
  quedó a medias.

---

## 4. Logs de auth de hoy — secuencia completa de `fedeiguacel3@hotmail.com`

### 4a. Servicio `auth`

Comando: MCP Supabase `get_logs(service='auth')`. Ventana devuelta por la API:
**2026-09-02T23:58:10Z → 2026-09-03T16:58:24Z**, 100 eventos (el tope de la herramienta).
Filtrado por `4ccc4063` / `fedeiguacel3` → **3 eventos, ninguno más**. Salida cruda de los tres,
en orden cronológico:

```json
{
 "error": null,
 "event_message": "{\"auth_event\":{\"action\":\"user_confirmation_requested\",\"actor_id\":\"4ccc4063-9092-4796-98f5-7e1a2385012c\",\"actor_username\":\"fedeiguacel3@hotmail.com\",\"actor_via_sso\":false,\"log_type\":\"user\",\"traits\":{\"provider\":\"email\"}},\"component\":\"api\",\"duration\":2634913030,\"level\":\"info\",\"method\":\"POST\",\"msg\":\"request completed\",\"path\":\"/signup\",\"referer\":\"https://sigh.com.ar/solicitar-acceso.html\",\"remote_addr\":\"181.21.217.217\",\"request_id\":\"01a0679f-d56b-73e0-b040-cf7c2c3fe28c\",\"status\":200,\"time\":\"2026-09-03T14:15:26Z\"}",
 "id": "989dbef6-ecbc-472c-8898-16b7561f4369",
 "level": "info",
 "msg": "request completed",
 "path": "/signup",
 "status": "200",
 "timestamp": 1788444926000000
}
---
{
 "error": null,
 "event_message": "{\"action\":\"login\",\"instance_id\":\"00000000-0000-0000-0000-000000000000\",\"level\":\"info\",\"login_method\":\"implicit\",\"metering\":true,\"msg\":\"Login\",\"time\":\"2026-09-03T14:16:38Z\",\"user_id\":\"4ccc4063-9092-4796-98f5-7e1a2385012c\"}",
 "id": "2db8f23b-80f6-407b-be4f-0bcdaff50afd",
 "level": "info",
 "msg": "Login",
 "path": null,
 "status": null,
 "timestamp": 1788444998000000
}
---
{
 "error": null,
 "event_message": "{\"auth_event\":{\"action\":\"user_signedup\",\"actor_id\":\"4ccc4063-9092-4796-98f5-7e1a2385012c\",\"actor_username\":\"fedeiguacel3@hotmail.com\",\"actor_via_sso\":false,\"log_type\":\"team\",\"traits\":{\"provider\":\"email\"}},\"component\":\"api\",\"duration\":188432375,\"level\":\"info\",\"method\":\"GET\",\"msg\":\"request completed\",\"path\":\"/verify\",\"referer\":\"https://sigh.com.ar/solicitar-acceso.html\",\"remote_addr\":\"181.21.217.217\",\"request_id\":\"01a067a0-faff-70d2-8a24-d39094e1815d\",\"status\":303,\"time\":\"2026-09-03T14:16:38Z\"}",
 "id": "df8603ab-67e8-4342-9aeb-1e49708cbece",
 "level": "info",
 "msg": "request completed",
 "path": "/verify",
 "status": "303",
 "timestamp": 1788444998000000
}
```

Traducido:

| Hora UTC | Evento | Detalle |
|---|---|---|
| 14:15:26 | `POST /signup` → **200**, `user_confirmation_requested` | alta creada y **mail de confirmación emitido**. Duración 2,63 s. Referer `solicitar-acceso.html`, IP `181.21.217.217`. **No** hay marca de alta repetida (esa sería `identities` vacío, cliente-side, y además no habría mail — GOTCHA #89) |
| 14:16:38 | `GET /verify` → **303**, `user_signedup` | canje del link del mail. Redirige a `solicitar-acceso.html` |
| 14:16:38 | `Login`, `login_method: "implicit"` | la sesión que sale del `/verify`. **No** es un login con contraseña |

**Y nada más. Cero logins posteriores, cero reintentos de `/signup`, cero `/token`, cero `/recover`.**
La secuencia del mail termina a las 14:16:38 UTC.

### 4b. Servicio `api` (PostgREST / Kong) — por qué no aporta

Comando: MCP Supabase `get_logs(service='api')`. La API devuelve como mucho 100 filas y en este
proyecto eso cubrió solamente **16:48:34 → 16:59:26 UTC de hoy** — o sea, **no llega a las 14:16** y
no puede confirmar ni desmentir las dos consultas que el "camino 2" habría hecho al cargar
(`usuarios?auth_user_id=eq.4ccc4063…` y `solicitudes_acceso?auth_user_id=eq.4ccc4063…`).
Se intentó acotar la ventana con `query_logs` sobre `edge_logs`:

```
query_logs(project_id='unlhcuanfrtpatoipwve',
  sql="select timestamp, source, log_attributes['request.method'] as m, log_attributes['request.path'] as path, ... where source='edge_logs' and log_attributes['request.headers.x_real_ip']='181.21.217.217' ...",
  iso_timestamp_start='2026-09-03T14:10:00Z', iso_timestamp_end='2026-09-03T15:30:00Z')
```

y devolvió:

```
MCP error -32600: You do not have permission to perform this action
```

**Limitación honesta**: no hay evidencia directa de que la página se haya cargado después del
`/verify`. La cadena que la sostiene es indirecta pero consistente: `/verify` 303 con destino
`solicitar-acceso.html` + sesión creada + `auth.sessions` con el UA de Edge/Windows (no un UA de
servidor de correo) + refresh token sin rotar.

De la ventana que sí devolvió el log de `api`, lo pertinente:

- **16:48:35 UTC** — la bandeja de Yesi corriendo, y vacía:
  ```
  GET | 200 | .../rest/v1/usuarios?select=club_id%2Cnombre_completo%2Crol&auth_user_id=eq.a1c490f5-81ee-4d9f-acb7-d2123e99e7d3
  GET | 200 | .../rest/v1/solicitudes_acceso?select=*&club_id=eq.0649e9c5-9e87-4aad-842f-101458e6b33c&order=created_at.desc&estado=eq.pendiente
  HEAD| 200 | .../rest/v1/solicitudes_acceso?select=id&club_id=eq.0649e9c5-9e87-4aad-842f-101458e6b33c&estado=eq.pendiente
  ```
- **16:48:41 UTC** — `POST | 204 | /auth/v1/logout?scope=global` (Chrome/151, Windows): Yesi cerró sesión.
- **16:49:20 → 16:56:25 UTC** — **17 × `POST | 400 | /auth/v1/token?grant_type=password`** desde
  Chrome/151 sobre Windows. Diecisiete intentos fallidos de login seguidos, en 7 minutos.
- **16:57:38 UTC** — `POST | 200 | /auth/v1/token?grant_type=password` desde **iPhone / CriOS 152**,
  seguido de las consultas de `dolores@sgh.com` (login OK en el teléfono).
- **16:58:23 UTC** — `POST | 200 | /auth/v1/token?grant_type=password` desde Chrome/151 Windows,
  seguido de las consultas de `dolores@sgh.com` (login OK en la compu).

Esa ráfaga de 17 respuestas 400 es de **otra** cuenta y otro navegador (Chrome 151; el registro de Fede fue Edge
152) — no toca esta investigación, pero queda anotada acá porque estaba en la misma ventana de log y
alguien la va a ver: entre las 16:49 y las 16:56 alguien no pudo entrar y terminó entrando como
`dolores@sgh.com`, primero desde el iPhone y un minuto después desde la compu.

---

## Resumen numérico

| Métrica | Valor |
|---|---|
| Usuarios nuevos en `auth.users` hoy | **1** (`fedeiguacel3@hotmail.com`) |
| Confirmado | **sí**, 2026-09-03 14:16:38 UTC |
| Sesiones activas de esa cuenta | **1**, abierta, nunca refrescada |
| Filas en `solicitudes_acceso` para ese mail | **0** |
| Filas totales en `solicitudes_acceso` | **2** (2026-08-04 descartada, 2026-08-19 aprobada) |
| Filas en `usuarios` para ese `auth_user_id` | **0** |
| Eventos de auth de ese mail hoy | **3** (signup 200, verify 303, login implicit) |
| Segundos entre alta y confirmación | **74** |
| Acciones del usuario que faltaron | **1** — apretar "Enviar solicitud" al volver |

---

## Preguntas abiertas

1. **¿Se cierra el hueco automatizando el paso 3?** Con el borrador en `localStorage` y la sesión ya
   creada, `solicitar-acceso.html` podría llamar a `enviarSolicitud(b)` sola al detectar
   "sesión + sin usuario + sin solicitud + borrador completo", y mostrar `sec-listo` en vez del
   formulario. Riesgo: si el borrador está incompleto o es de otro trámite, se manda una solicitud
   con datos viejos. Habría que validar con `validar(b, false)` antes y sólo auto-enviar si pasa.
2. **¿Y si el mail se abre en otro dispositivo?** Ahí no hay borrador y el auto-envío no aplica. Hoy
   el usuario ve un formulario vacío con un subtítulo que dice "revisá los datos". ¿Conviene un
   texto distinto para ese caso ("completá los datos otra vez, el registro quedó a medias")?
3. **¿Se avisa a la secretaría de las cuentas huérfanas?** Hoy `fedeiguacel3@hotmail.com` existe en
   `auth.users` y no aparece en ninguna pantalla del sistema. ¿Vale una vista o un tab de
   "cuentas confirmadas sin solicitud" para que Yesi las pueda rescatar?
4. **¿Qué hacemos con la cuenta de Fede ahora?** Está viva y confirmada. Las opciones son: (a) que
   entre de nuevo a `sigh.com.ar/solicitar-acceso.html` **desde el mismo Edge** y apriete Enviar —
   el formulario le va a salir precargado; (b) crear la solicitud a mano por SQL; (c) borrar la
   cuenta y que rehaga el alta. Este informe no ejecutó ninguna: es solo lectura.
5. **La ráfaga de 17 logins fallidos de las 16:49:20-16:56:25** — ¿quién era y con qué cuenta? Terminó
   entrando como `dolores@sgh.com`. Si era Fede o Yesi tratando de entrar con otro mail, puede ser
   una segunda fricción a mirar, aparte de esta.

---

## Verificación de push
