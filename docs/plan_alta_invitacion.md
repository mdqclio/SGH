# Plan — Alta de usuarios por invitación cerrada (v1)

**Fecha**: 2026-07-22 · **Estado**: PLAN. Cero código, cero cambios en DB/Auth/secrets.
**Decisión de producto (Leo, 22/07/2026)**: el alta de usuarios v1 es **por invitación cerrada**.
La secretaría invita por email vía `inviteUserByEmail()` desde el servidor. El **auto-registro
queda descartado para v1**.

> ⚠️ Repo público. Este documento describe **estado y diseño**, nunca credenciales.
> No contiene keys, secrets, tokens ni emails personales. Las cuentas se referencian por rol.

Documentos relacionados (capa de evidencia): [`../data/rls_audit.md`](../data/rls_audit.md),
[`../data/auth_flow_audit.md`](../data/auth_flow_audit.md).

**Recordatorio operativo confirmado**: apagar *"Allow new users to sign up"* **hoy** rompería el
alta, porque las pantallas de admin usan `signUp()` internamente. Por eso el orden es
**Edge Function primero, apagar el toggle al final**.

---

## 1. Inventario del flujo actual de alta

### 1.1 Call sites de `signUp(`

| # | Archivo:línea | Pantalla / quién dispara | Rol del caller | Qué escribe en `public.usuarios` |
|---|---|---|---|---|
| 1 | `usuarios.html:317` | Gestión de usuarios del club → modal "Crear Usuario" (`saveCreate()`) | `super_admin` (RLS `usuarios_insert` exige `fn_is_super_admin()`) | `email`, `nombre_completo`, `telefono`, `club_id` (del contexto/`?club=`), `rol` (select), `activo:true` |
| 2 | `admin.html:521` | Panel super_admin → alta de hipódromo (`insert clubs` → `signUp` → `insert usuarios` → `insert categorias_carrera`) | `super_admin` | `email`, `nombre_completo`, `club_id` (el club recién creado), `rol:'secretario_carreras'`, `activo:true` |
| 3 | `registro.html:232` | Auto-registro de hipódromo. **Página huérfana**: sin enlaces entrantes en el repo | anónimo | `email`, `nombre_completo`, `club_id` (club recién creado), `rol:'secretario_carreras'`, `activo:true` |
| 4 | `registro-profesional.html:243` | Auto-registro público de propietario/entrenador. **Enlazada desde `login.html`** | anónimo | `email`, `nombre_completo`, `club_id: null`, `rol:'propietario'\|'profesional'`, `estado:'pendiente'`, `activo:false`, `telefono`. Además inserta en `propietarios` o `profesionales` |

Metadata que cada uno pasa en `options.data` (sirve para atribuir cuentas huérfanas):
`usuarios.html` y `admin.html` → `nombre_completo`; `registro.html` → `nombre`;
`registro-profesional.html` → sin metadata.

### 1.2 Estado real: **ninguno de los 4 completa el alta hoy**

Bloqueo estructural de schema, verificado el 22/07 contra prod:

```
public.usuarios.password_hash  →  NOT NULL, sin DEFAULT
public.usuarios.club_id        →  NOT NULL, sin DEFAULT
```

Ninguna de las 4 páginas incluye `password_hash` en su `INSERT` → `23502 null value in column
"password_hash"`. Y `registro-profesional.html` manda `club_id: null` → falla también por eso.
Ningún trigger rellena `password_hash` (sólo existen `trg_audit_usuarios` y el guard de UPDATE
`trg_proteger_rol_club_id_usuario`). La columna es un vestigio pre-Supabase-Auth: la
autenticación real vive en `auth.users`.

Los anónimos (#3, #4) además chocan con RLS antes de eso (`usuarios_insert WITH CHECK
fn_is_super_admin()`, y `clubs` exige super_admin para insertar).

### 1.3 Hecho de diseño clave: **no hay FK `auth.users ↔ public.usuarios`**

Columnas de `public.usuarios` (prod, 22/07): `id` (uuid_generate_v4, **propio**, NO el de auth),
`club_id` NOT NULL, `email` NOT NULL, `password_hash` NOT NULL, `nombre_completo`,
`rol` NOT NULL DEFAULT `'operador'`, `entidad_tipo`, `entidad_id`, `activo` NOT NULL DEFAULT true,
`ultimo_login`, `created_at`, `telefono`, `estado` DEFAULT `'activo'`.

**El vínculo entre las dos tablas es el `email`**, no un UUID. Lo confirman las policies:

```
usuarios_select : fn_is_super_admin() OR email = auth.jwt()->>'email' OR club_id = fn_get_user_club_id()
usuarios_insert : WITH CHECK fn_is_super_admin()
usuarios_update : fn_is_super_admin() OR email = auth.jwt()->>'email'
usuarios_delete : fn_is_super_admin()
```

Consecuencia para el diseño: el Edge Function debe mantener el email **idéntico y normalizado**
en ambos lados, o el usuario invitado entra a Auth pero la app no lo reconoce.
(Deuda a evaluar aparte: agregar `auth_user_id UUID` a `usuarios`. **No** es requisito de v1.)

### 1.4 Estado de las cuentas (prod, 22/07)

- `auth.users`: **5** filas · **2** sin email confirmado · **2** sin fila correspondiente en `public.usuarios` (huérfanas).
- `public.usuarios`: 3 filas. Reparto por club:

| Club | Activo | Usuarios |
|---|---|---|
| Jockey Club San Francisco – Hipódromo Oscar C. Boero | sí | **0** |
| Mi Club Hípico | no | 1 |
| Hipódromo de Dolores | sí | 2 |

Las 3 cuentas que funcionan se crearon a mano (Dashboard → Add user → Auto Confirm + `INSERT`
directo por SQL, único camino que pudo suministrar el `password_hash` obligatorio).

---

## 2. Diseño de la Edge Function `invite-user`

Función Deno desplegada en Supabase Edge Functions. Es el **único** lugar del sistema donde
existe la secret key.

### 2.1 Autorización del caller — chequeo exacto

El caller es una pantalla de admin ya logueada. Manda su **access token de usuario** en el header.
La función hace, en este orden, y corta en el primer fallo:

1. **Extraer el JWT**: header `Authorization: Bearer <access_token>`. Si falta → `401`.
2. **Validar el token contra Auth** (no confiar en el payload sin verificar): cliente Supabase
   con la **anon/publishable key** + `global.headers.Authorization` del caller →
   `auth.getUser()`. Si `error` o `!user` → `401`. Esto verifica firma y expiración server-side.
3. **Resolver el rol en la app**: con el cliente **service_role**, `SELECT rol, club_id, activo
   FROM public.usuarios WHERE lower(email) = lower(user.email)`. Si no hay fila o `activo=false`
   → `403`. (Se usa email porque no existe FK a `auth.users` — ver §1.3.)
4. **Regla de autorización**:
   - `rol = 'super_admin'` → puede invitar a **cualquier** `club_id` y cualquier rol.
   - `rol = 'secretario_carreras'` → sólo puede invitar con `club_id = <su propio club_id>`
     (tomado de la fila del caller, **nunca** del body) y con rol ∈ `{secretario_carreras,
     operador}`. Cualquier otra combinación → `403`.
   - Cualquier otro rol → `403`.
5. **Nunca** aceptar `club_id` ni `rol` del body sin pasarlos por el paso 4. Escalada de
   privilegios = el riesgo principal de este endpoint.
6. Rechazar métodos ≠ `POST`; responder `OPTIONS` con CORS restringido al origen de GitHub Pages.

### 2.2 Input / Output

**Request** `POST /functions/v1/invite-user`
```jsonc
{
  "email": "destinatario@ejemplo.com",   // requerido, se normaliza a lowercase + trim
  "nombre_completo": "Nombre Apellido",  // requerido
  "rol": "operador",                     // requerido; validado contra el enum rol_usuario
  "club_id": "<uuid>",                   // opcional; ignorado si el caller no es super_admin
  "telefono": "+54...",                  // opcional
  "reinvitar": false                     // opcional; ver §2.4
}
```

**Response 200**
```jsonc
{ "ok": true, "estado": "invitado", "email": "...", "ya_existia": false }
```

**Errores**: `401` sin token / token inválido · `403` caller no autorizado o combinación
rol+club prohibida · `409` el email ya tiene fila en `usuarios` y `reinvitar` no vino en true ·
`422` payload inválido (email mal formado, rol fuera del enum) · `429` rate limit de email
alcanzado (ver §3) · `500` fallo inesperado. **Los mensajes de error no exponen si un email
existe en Auth** salvo al caller ya autenticado como admin.

### 2.3 Qué escribe, y en qué orden

1. `supabaseAdmin.auth.admin.inviteUserByEmail(email, { data: { nombre_completo }, redirectTo:
   "<URL de la pantalla de set-password en GitHub Pages>" })`.
2. `INSERT INTO public.usuarios` con service_role (salta RLS, por eso el paso 4 de §2.1 es la
   única defensa):
   - `email` normalizado (mismo string que se mandó a Auth),
   - `nombre_completo`, `telefono`,
   - `club_id` = el resuelto en §2.1 paso 4,
   - `rol` = el validado,
   - `activo` = `false` hasta que acepte la invitación; `estado` = `'pendiente'`,
   - `password_hash` = **string vacío**, porque la columna es NOT NULL sin default y es un
     vestigio muerto (§1.2). No es una contraseña ni se usa para autenticar.
3. **Compensación**: si el paso 2 falla, borrar el usuario recién creado en Auth
   (`auth.admin.deleteUser`) para no repetir el patrón de las 2 cuentas huérfanas actuales.
   Si el borrado de compensación también falla, devolver `500` con un código que permita
   identificar el caso en los logs.

**Alternativa preferible a `password_hash: ''`** (decisión de Leo, fuera de v1): migración
`ALTER TABLE usuarios ALTER COLUMN password_hash DROP NOT NULL` o `SET DEFAULT ''`, y a mediano
plazo dropear la columna. Mientras no se haga, el string vacío es lo mismo que ya tiene una de
las 3 cuentas en producción.

**Activación**: cuando el invitado fija su contraseña, la app pone `activo=true` /
`estado='activo'`. En v1 alcanza con que lo haga la pantalla de set-password contra
`usuarios_update` (la policy permite `email = auth.jwt()->>'email'`, es decir, el propio usuario).

### 2.4 Reinvitación

Casos y respuesta:

| Caso | Detección | Acción |
|---|---|---|
| No existe en Auth ni en `usuarios` | ambas consultas vacías | alta normal (§2.3) |
| Existe en Auth **sin confirmar**, con fila `usuarios` en `estado='pendiente'` | `email_confirmed_at IS NULL` | reenviar invitación (`inviteUserByEmail` de nuevo) y **no** re-insertar. Devuelve `ya_existia:true` |
| Existe en Auth **confirmado** y con fila `usuarios` activa | `email_confirmed_at` no nulo | `409`. No se reinvita a alguien que ya opera; si perdió la contraseña, es un flujo de reset, no de invitación |
| Existe en Auth pero **sin** fila en `usuarios` (los 2 huérfanos de hoy) | join por email vacío | sólo `INSERT` en `usuarios` + reinvitación. Repara el huérfano en vez de duplicarlo |
| Invitación vencida | el link de invitación expira según `MAILER_OTP_EXP` del proyecto | mismo camino que "existe sin confirmar": reinvitar genera un link nuevo |

`reinvitar: true` en el body es lo que habilita los caminos de reenvío; sin él, cualquier
colisión responde `409` para que la UI pregunte antes de mandar otro mail (y consumir cuota).

### 2.5 Manejo del secret — **PROHIBIDO en el repo**

- La secret key se carga **exclusivamente** como secret de Supabase Edge Functions
  (`supabase secrets set`), y se lee dentro de la función vía `Deno.env.get(...)`.
- **Nunca** en el repo, ni en `.env` versionado, ni en este plan, ni en un archivo de config
  del frontend, ni en logs. El repo es público.
- El cliente admin se construye **dentro** del handler, no en scope de módulo exportado.
- La función **nunca** devuelve al cliente nada derivado del secret.
- Chequeo previo al deploy: `git grep -nE 'sb_secret_|service_role'` sobre el working tree.
  Precedente: ya hubo un `service_role` en el working tree (limpiado en `feat/liquidaciones-cd`).

---

## 3. Limitación de email — investigación

### 3.1 Qué dice la documentación de Supabase (leída 22/07/2026)

- El mailer **built-in** existe "para probar", con disponibilidad *best-effort* y un rate limit
  bajo por hora. La doc sirve ese número dinámicamente
  (`auth.rate_limits.email.inbuilt_smtp_per_hour`); **desde el 3-sep-2024 el valor por defecto
  publicado es 2 emails/hora**, y textualmente: *"You can only change this with your own custom
  SMTP setup"*.
- El límite aplica a la **suma** de todos los endpoints que mandan mail
  (`/auth/v1/signup`, `/auth/v1/recover`, `/auth/v1/user`, y las invitaciones).
- Con **SMTP propio**, el default pasa a **30 mensajes/hora**, ajustable desde
  Dashboard → Authentication → Rate Limits.
- Free plan: los proyectos con baja actividad en 7 días se pueden pausar (ya nos pasó una vez).

### 3.2 Cuál es el límite exacto de **nuestro** proyecto

**No lo pude leer desde acá.** La configuración de Auth (rate limits, SMTP) no está expuesta por
el MCP de Supabase ni por SQL — vive en la config de GoTrue, no en la base. Verificar por una de
estas dos vías, sin cambiar nada:

- Dashboard → **Authentication → Rate Limits** (muestra el valor efectivo del proyecto), y
  Dashboard → **Authentication → Emails → SMTP Settings** (dice si hay SMTP propio o built-in).
- Management API `GET /v1/projects/{ref}/config/auth` con un PAT (no disponible en esta sesión).

Además, verificar si el proyecto cae bajo la restricción de que el servicio built-in **sólo
entrega a direcciones de miembros de la organización**. Si aplica, las invitaciones a los mails
de la secretaría de Dolores **no llegarían nunca** y el síntoma sería "invitación enviada, mail
nunca recibido" — indistinguible de spam. **Es el riesgo de entrega #1 de este plan y hay que
comprobarlo en la etapa (a), no después.**

### 3.3 Respuesta operativa

**No alcanza el built-in.** Con 2 mails/hora, invitar a decenas de usuarios en tandas es
inviable: 20 invitaciones = 10 horas de reloj, y cualquier reset de contraseña que ocurra en el
medio consume de la misma cuota. Sumado a la posible restricción de destinatarios y a que la
entrega es *best-effort*, **v1 necesita SMTP propio**.

### 3.4 Opciones de SMTP (nada de esto se ejecuta ahora)

| Opción | Free tier aprox. | Notas |
|---|---|---|
| **Resend** | ~3.000 mails/mes, 100/día | La más simple; buena integración con Supabase. Requiere verificar dominio |
| **Brevo (ex-Sendinblue)** | ~300 mails/día | Free tier generoso, sin tarjeta |
| **AWS SES** | ~3.000 mensajes/mes con crédito | Más barato a escala, más setup; arranca en sandbox (sólo destinatarios verificados) |
| **SendGrid** | plan free reducido | Verificación de identidad más estricta últimamente |

Para el volumen de SGH (decenas de usuarios, más resets ocasionales) cualquiera sobra.
**Recomendación: Resend**, por fricción mínima y por ser el camino documentado por Supabase.

Configuración necesaria (documentada, **no aplicada**):
1. Cuenta en el proveedor + verificación del dominio remitente (registros SPF/DKIM en DNS).
   Sin dominio propio verificado, el remitente cae en spam.
2. Dashboard → Authentication → Emails → SMTP Settings: host, puerto (587 STARTTLS), usuario,
   contraseña (secret del proveedor — **no va al repo**), `sender email`, `sender name`.
3. Dashboard → Authentication → Rate Limits: subir el límite de email por hora a lo que se
   necesite para las tandas (el default con SMTP propio es 30/hora).
4. Personalizar la plantilla de **Invite user** (español, remitente reconocible por la
   secretaría) y verificar que el link apunte al `redirectTo` de §2.3.

**Decisión pendiente de Leo**: qué dominio se usa como remitente. Si todavía no hay dominio
propio, el proveedor sirve para probar pero la entrega va a ser peor.

---

## 4. Migración de las pantallas admin

Sin escribir código todavía — sólo el delta por call site.

| # | Archivo | Cambio |
|---|---|---|
| 1 | `usuarios.html:317` (`saveCreate`) | Reemplazar `signUp` + `insert usuarios` por **una** llamada a `supabase.functions.invoke('invite-user', { body: {...} })`. **Quitar los campos de contraseña del modal** (`c-pass`, `c-pass2`) y sus validaciones: el usuario fija su propia contraseña desde el mail. El copy pasa de "Crear Usuario" a "Invitar Usuario". Manejar `409` (ya existe → ofrecer reinvitar) y `429` (cuota de mail → mensaje explícito, no un error genérico) |
| 2 | `admin.html:521` (alta de hipódromo) | El `insert clubs` y el `insert categorias_carrera` quedan como están (los hace el super_admin con su propia sesión y RLS los permite). Sólo el bloque `signUp` + `insert usuarios` se reemplaza por `invite-user` con `club_id` = el club recién creado y `rol:'secretario_carreras'`. Quitar los inputs de contraseña. **Ojo con la compensación**: si la invitación falla, hoy queda un club sin usuario — decidir si se borra el club o se deja para reintentar (recomendado: dejarlo y ofrecer "reintentar invitación", que es justo el estado del club de San Francisco) |
| 3 | `registro.html:232` | **No se migra.** Página huérfana de auto-registro; el auto-registro está descartado en v1. Ver etapa (d) |
| 4 | `registro-profesional.html:243` | **No se migra en v1.** Es auto-registro público de propietarios/entrenadores, que es el portal (`portal.html`, no construido). Ver etapa (d): sacar el link desde `login.html` antes de apagar el toggle, o el formulario va a fallar con un error críptico de Auth en vez del `42501` actual |

Contrato común para 1 y 2: el frontend **no manda contraseñas nunca más**, y `club_id`/`rol` que
manda son sugerencias — la función los revalida (§2.1 paso 4).

---

## 5. Secuencia de corte

Cada etapa se aprueba por separado. **Nada de esto está ejecutado.**

### Etapa 0 — Prerrequisito: SMTP propio

Sin esto, la etapa (a) no se puede probar de verdad (§3).
**Criterio de avance**: mail de prueba recibido en una casilla externa a la organización.
**Rollback**: volver a built-in en el Dashboard. No afecta a los usuarios existentes.

### Etapa (a) — Deploy de la Edge Function + probe de invitación real

1. `supabase secrets set` de la secret key (fuera del repo).
2. Deploy de `invite-user`.
3. **Probe** `tests/probe_invite_user.mjs`:
   - invitación a un mail de prueba controlado → `200`, mail recibido, fila en `usuarios` con
     `estado='pendiente'`, `activo=false`, `club_id` correcto;
   - caller sin token → `401`;
   - caller con rol `operador` → `403`;
   - caller `secretario_carreras` mandando un `club_id` ajeno → `403` **y** verificar que no se
     creó nada (el test de escalada de privilegios es el más importante);
   - email repetido sin `reinvitar` → `409`;
   - payload con rol fuera del enum → `422`.
4. `git grep -nE 'sb_secret_|service_role'` limpio antes de mergear.

**Criterio de avance**: probe verde + mail efectivamente recibido.
**Rollback**: borrar la función (`supabase functions delete invite-user`). Las pantallas siguen
usando `signUp` porque todavía no se migraron. Impacto cero.

### Etapa (b) — Migrar pantallas admin + probe end-to-end

Migrar `usuarios.html` y `admin.html` (§4) en una rama `feat/alta-invitacion`.

**Probe end-to-end**: invitar desde `usuarios.html` → recibir el mail → fijar contraseña →
`signInWithPassword` → la app resuelve `club_id` y `rol` correctos → `activo` pasa a `true`.
Repetir el alta de hipódromo desde `admin.html`.

**Criterio de avance**: un usuario nuevo, creado íntegramente por invitación, entra y opera.
**Rollback**: `git revert` del merge. El toggle de signup **sigue prendido** en esta etapa, así
que revertir devuelve las pantallas a su comportamiento anterior (que igual está roto por
`password_hash`, pero no se pierde nada que hoy funcione).

### Etapa (c) — Apagar *"Allow new users to sign up"*

Sólo con (a) y (b) verdes en producción.

**Probe posterior, en este orden**:
1. Alta por invitación desde `usuarios.html` → sigue funcionando (la Admin API **no** depende
   del toggle).
2. `signUp` directo desde la consola del browser con la key pública → **error explícito**
   (`signups not allowed`). Es el criterio de éxito, no un fallo.
3. `signInWithPassword` de las cuentas existentes → sigue funcionando (el login es independiente
   del toggle).

**Criterio de avance**: 1 y 3 OK, 2 falla como se espera.
**Rollback**: volver a prender el toggle desde el Dashboard. Es un switch, reversible en
segundos, sin migración de datos.

### Etapa (d) — Limpieza (**listar, no borrar todavía**)

Inventario a resolver, con la decisión de Leo pendiente en cada línea:

| Ítem | Estado hoy | Propuesta |
|---|---|---|
| `registro.html` | Huérfana: cero enlaces entrantes desde `.html`/`.js`. Sólo aparece en documentación | Borrar del repo, o dejarla con un cartel "no operativa" |
| `registro-profesional.html` | **Enlazada desde `login.html`** ("¿Sos propietario o entrenador? Registrate acá"). No funciona (RLS + `club_id` NOT NULL + `password_hash`) | **Sacar el link de `login.html` ANTES de la etapa (c)**, si no el error que ve el usuario empeora. La página queda para cuando exista el portal |
| 2 auth users huérfanos | En `auth.users`, sin confirmar, sin fila en `public.usuarios` | Borrarlos por Dashboard, o repararlos con la ruta de reinvitación de §2.4. **No se toca en esta sesión** |
| Club "Jockey Club San Francisco" | `activo=true`, **0 usuarios**. Residuo del intento fallido de abril | Invitar a su administrador (una vez que (a)+(b) estén vivas) o desactivar el club. Decisión de negocio, no técnica |
| Club "Mi Club Hípico" | `activo=false`, 1 usuario | Confirmar si es de prueba. Sin acción |
| Documentación desactualizada | `CLAUDE.md` y `docs/ISSUES.md` dicen que `registro-profesional.html` "no existe" / "no construida". **Sí existe** y está en producción | Corregir en el mismo PR que la etapa (d) |
| `usuarios.password_hash` | NOT NULL sin default, vestigio muerto | Migración a nullable / drop, posterior a (b) |

**Rollback**: es la etapa más benigna — borrados de archivos revertibles por git; los borrados
en Auth **no** son revertibles, por eso van al final y de a uno.

---

## 6. Riesgos

| Etapa | Qué se rompe | Cómo se detecta |
|---|---|---|
| 0 (SMTP) | Remitente sin SPF/DKIM → todo a spam. La secretaría reporta "no me llegó" | Mandar a Gmail + a otro proveedor y mirar el encabezado de autenticación. Revisar el log de entregas del proveedor |
| 0 | Si el built-in sólo entrega a miembros de la organización, las invitaciones a mails externos se pierden en silencio | La API responde `200` igual. Sólo se detecta comprobando recepción en una casilla **externa**. Verificar en (a), no después |
| (a) | **Escalada de privilegios**: si el chequeo de §2.1 paso 4 está mal, cualquier usuario logueado puede crear un `super_admin` o invitar a otro club. Es el riesgo más grave del plan | El probe de escalada (caller `operador` → `403`, `club_id` ajeno → `403`). Además: revisar `usuarios` por filas con `rol='super_admin'` que nadie creó |
| (a) | Filtración de la secret key al repo público | `git grep` pre-deploy + revisión del diff. Si pasa: rotar la key en el Dashboard **inmediatamente**, no alcanza con borrar el commit |
| (a) | Alta parcial: usuario creado en Auth y `INSERT usuarios` fallido → nuevo huérfano | La compensación de §2.3 paso 3. Monitoreo: query de `auth.users` sin fila en `usuarios` (hoy da 2) |
| (a) | Cuota de mail agotada a mitad de una tanda → `429` | La UI tiene que mostrar el `429` como "límite de emails alcanzado, reintentá en una hora", no como error genérico |
| (b) | Desalineación de email entre `auth.users` y `usuarios` (mayúsculas/espacios) → el usuario entra a Auth pero la app no lo reconoce y queda sin `club_id` | Normalizar a lowercase+trim en un solo lugar. Probe: login del invitado resuelve `club_id` y `rol`. Query de control: join por `lower(email)` sin match |
| (b) | Falla la invitación después de crear el club en `admin.html` → otro club con 0 usuarios | Query de clubs con 0 usuarios (hoy da 1: San Francisco) |
| (b) | El invitado no llega a fijar la contraseña antes de que expire el link | Reinvitación (§2.4). La fila queda en `estado='pendiente'` — listar pendientes con más de N días |
| (c) | Se apaga el toggle **antes** de migrar → el alta de usuarios muere del todo | Es exactamente lo que evita el orden (a)→(b)→(c). Detección: `usuarios.html` responde `signups not allowed` |
| (c) | `registro-profesional.html` sigue enlazada y ahora falla peor | Sacar el link en (d), antes de (c). Verificar con `grep -n 'registro-profesional' login.html` |
| (c) | Suposición a verificar: el *reset de contraseña* **no** depende del toggle de signup. Si dependiera, los usuarios existentes perderían el reset | Probar un `resetPasswordForEmail` justo después de apagar el toggle |
| (d) | Borrar un auth user que sí estaba en uso | Sólo borrar los que no tienen fila en `usuarios` **y** nunca hicieron login (`last_sign_in_at IS NULL`). De a uno |

---

## Apéndice — evidencia recogida el 22/07/2026 (todo read-only)

- `grep -rn "signUp(" --include=*.html --include=*.js` → 4 call sites (tabla §1.1).
- `information_schema.columns` sobre `public.usuarios` → §1.3 (`password_hash` NOT NULL sin
  default, `club_id` NOT NULL, sin columna de vínculo a `auth.users`).
- `pg_policies` sobre `public.usuarios` → las 4 policies de §1.3.
- `auth.users LEFT JOIN public.usuarios` por email → 5 auth users, 2 sin confirmar, 2 huérfanos.
- `clubs LEFT JOIN usuarios` → San Francisco con 0 usuarios.
- Documentación de Supabase vía MCP `search_docs` → §3.1.

**Ningún cambio aplicado**: ni DDL, ni DML, ni configuración de Auth, ni secrets, ni deploy.
