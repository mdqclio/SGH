# Etapa (a) — deploy de `invite-user` + probe real

**Fecha:** 23/07/2026 · **Rama:** `feat/alta-invitacion` · **Proyecto:** `unlhcuanfrtpatoipwve`

**Resultado: ✅ deploy hecho y probe verde — 37 OK · 0 FAIL, los 7 casos.**

Con una salvedad grande que no es de nuestro código y que hay que mirar antes de
la etapa (c): **la Admin API de Auth de este proyecto está fallando ~1 de cada 3
llamadas.** Detalle en la sección "Hallazgo de plataforma".

Guard previo: `pwd` = `/home/clio/dev/SGH` ✔ · `SELECT count(*) FROM spcs` = **144** ✔

---

## 1. Secret — no hizo falta setear ninguno

La consigna era: ver si el runtime ya inyecta una key admin válida y, si era la
legacy muerta, setear un secret propio.

**Verificado: el runtime SÍ inyecta una key admin usable, y NO es una legacy `eyJ...`.**
Por lo tanto **no se seteó ningún secret nuevo** y **no se tocó el `.env` del VPS**.

Cómo se comprobó, sin mandar mails ni escribir nada: la función resuelve la key
*antes* de validar el token del caller, así que una llamada con un bearer que no
es de usuario distingue los dos mundos —

| Respuesta | Significado |
|---|---|
| `500 server_misconfigured` | no hay key admin usable |
| `401 token_invalido` | **la key se resolvió bien**, y falló después, en la validación del token |

Se obtuvo `401 token_invalido`. Después el probe confirmó funcionalmente que esa
key tiene permisos reales de admin: crea usuarios en Auth y escribe en
`public.usuarios` bypasseando RLS.

**Lo que no se pudo determinar:** *cuál* de las env var la aportó. La función
loguea el nombre (nunca el valor) con `console.log`, pero el MCP de Supabase sólo
devuelve las líneas de request de los logs de Edge Functions, no la salida de
consola. Queda entre `SB_SECRET_KEY` y `SUPABASE_SERVICE_ROLE_KEY` — se ve en el
Dashboard → Edge Functions → Logs si interesa cerrarlo.

### Cambio en la función (commiteado)

`Deno.env.get('INVITE_DB_KEY')` pasó a ser una cadena de candidatas:

```
INVITE_DB_KEY → SGH_SECRET_KEY → SB_SECRET_KEY → SUPABASE_SERVICE_ROLE_KEY
```

con dos reglas:

1. **Las `eyJ...` se descartan explícitamente.** Están desactivadas en el proyecto
   desde 2026-06-07. Si la plataforma sigue inyectando una, usarla daría un 401
   tardío y confuso dentro de la Admin API en vez de un `server_misconfigured`
   claro al principio.
2. Se loguea **el nombre** de la env que ganó, nunca el valor, y sólo cuando no es
   `INVITE_DB_KEY` — para que quede rastro de que se está usando un fallback.

Si mañana hace falta el secret propio, `INVITE_DB_KEY` sigue teniendo prioridad
sobre todo lo demás: setearlo alcanza, sin tocar código.

---

## 2. Deploy

Hecho con el **MCP de Supabase**, no con la CLI: `supabase` (v2.106.0, vía npx)
no tiene sesión iniciada en esta máquina y `supabase login` es interactivo.
Tampoco hay `SUPABASE_ACCESS_TOKEN` ni `supabase/config.toml`.

```
slug        invite-user
version     1
status      ACTIVE
verify_jwt  true
```

El código subido se verificó contra el archivo de disco con `get_edge_function`.

> **Para la etapa (c):** setear secrets (`supabase secrets set`) **no se puede
> hacer desde acá** — el MCP no expone esa operación y la CLI no está autenticada.
> Si en algún momento hace falta un secret propio, va a requerir que corras
> `supabase login` (o un PAT en `SUPABASE_ACCESS_TOKEN`). Hoy no bloquea nada.

---

## 3. Probe — salida completa

`tests/probe_invite_user.mjs`, contra prod, con `INVITE_TEST_EMAIL=mdqclio@gmail.com`.

```
=== probe_invite_user  (run azblri) ===
fn: https://unlhcuanfrtpatoipwve.supabase.co/functions/v1/invite-user
club propio: Mi Club Hípico
club ajeno:  Hipódromo de Dolores

[2] 401 — sin token
  ✅ status 401

[3] 403 — caller rol operador
  ✅ status 403
  ✅ code = rol_caller_no_autorizado
  ✅ no se creó fila en usuarios
  ✅ no se creó cuenta en Auth

[4] 403 — secretario_carreras invitando a un club ajeno
  ✅ status 403
  ✅ code = club_ajeno
  ✅ no se creó fila en usuarios
  ✅ no se creó cuenta en Auth

[4b] 403 — secretario_carreras intentando crear un super_admin
  ✅ status 403
  ✅ code = rol_no_invitable
  ✅ no se creó fila en usuarios

[6] 422 — rol inválido
  ✅ status 422
  ✅ code = rol_invalido
  ✅ no se creó fila en usuarios

[1] 200 — invitación feliz
  ✅ status 200
  ✅ ok = true
  ✅ estado = invitado
  ✅ email normalizado en la respuesta
  ✅ ya_existia = false
  ✅ fila creada en public.usuarios
  ✅ estado = 'pendiente'
  ✅ activo = false
  ✅ rol = 'operador'
  ✅ club_id = el del caller (no el del body)
  ✅ email guardado en lowercase
  ✅ cuenta creada en Auth
  ✅ la cuenta de Auth queda SIN confirmar hasta que acepte
  ℹ️  verificar A MANO que llegó el mail a mdqclio@gmail.com
     (la API responde 200 aunque la entrega falle — §3.2 del plan)

[5] 409 — mismo email, sin reinvitar
  ✅ status 409
  ✅ code = ya_existe

[7] reinvitación — comportamiento real de GoTrue (x1)
  ℹ️  reinvitación #1 → HTTP 200 {"ok":true,"estado":"invitado","email":"mdqclio@gmail.com","ya_existia":true,"reparado":false}
  ✅ reinvitación #1: si falla, falla con un code identificable
  ✅ sigue habiendo EXACTAMENTE 1 fila en usuarios
  ✅ sigue activo=false
  ✅ sigue estado='pendiente'
  ✅ es la MISMA fila (no se borró y recreó)
  ✅ la cuenta de Auth sigue existiendo
  ✅ sigue SIN confirmar
  ✅ GoTrue reenvía la invitación de un usuario sin confirmar (§2.4 confirmada).
     La casilla recibió MÁS DE UNA invitación: vale la ÚLTIMA (el token rota).

— Cleanup —
  limpiados: 3 filas usuarios, 3 auth users
  ⏸️  CONSERVADO a propósito: mdqclio@gmail.com (fila usuarios + cuenta Auth).
     Teardown pendiente cuando termine la prueba manual del flujo.

=== 37 OK · 0 FAIL ===
```

Por caso:

| # | Caso | Resultado |
|---|---|---|
| 1 | 200 feliz | ✅ PASS (13 asserts) |
| 2 | 401 sin token | ✅ PASS |
| 3 | 403 rol operador | ✅ PASS |
| 4 | 403 club ajeno (escalada horizontal) | ✅ PASS — **no se escribió nada** |
| 4b | 403 rol no invitable (escalada vertical) | ✅ PASS |
| 5 | 409 repetido | ✅ PASS |
| 6 | 422 rol inválido | ✅ PASS |
| 7 | Reinvitación | ✅ PASS (7 asserts) |

El caso 4 es el que más importaba y salió limpio: un `secretario_carreras`
apuntando a otro club recibe `403 club_ajeno` y **no queda ni fila en `usuarios`
ni cuenta en Auth**. Lo mismo el 4b para el rol.

**Emails gastados: 2 de los 2/hora** — el caso 1 y la reinvitación del caso 7.

---

## 4. Veredicto del caso 7 — qué hizo GoTrue de verdad

**GoTrue SÍ reenvía la invitación a un usuario que existe pero no confirmó.
La §2.4 del plan queda confirmada — no hay que cambiar nada.**

La respuesta real fue `HTTP 200 {"ok":true,"estado":"invitado","ya_existia":true,"reparado":false}`.
O sea: reconoció que la fila de `public.usuarios` ya existía, **no la re-insertó**,
y volvió a mandar el mail. Era exactamente lo que la §2.4 asumía sin verificar.

No hace falta `admin.generateLink({type:"invite"})` ni `auth.resend()` — eran los
planes B por si GoTrue respondía "User already registered" incluso sin confirmar.
No pasó.

Invariantes verificados después de reinvitar:

- Exactamente **1** fila en `public.usuarios` (no se duplicó).
- Sigue `activo = false` y `estado = 'pendiente'` — reinvitar **no** activa a nadie.
  La activación sigue siendo responsabilidad de `reset-password.html` (§4.1).
- Es la **misma** fila (mismo `id`): no se borró y recreó.
- La cuenta de Auth es la misma y sigue sin confirmar.

⚠️ **Para abrir el mail:** la casilla recibió **dos** invitaciones (la del caso 1 y
la de la reinvitación). **Vale la última** — GoTrue rota el token en cada
invitación, así que el link del primer mail probablemente ya esté muerto.

### Nota de método sobre el caso 7

El probe original hacía **dos** reinvitaciones, o sea 3 mails contando el caso 1,
por encima del límite de 2/hora: la tercera hubiera chocado contra el rate limit y
el caso habría medido la cuota en vez del comportamiento de GoTrue. Se pasó a
**una** reinvitación (configurable con `INVITE_REINVITACIONES`, default 1), que es
suficiente para responder la pregunta y encaja justo en la cuota.

---

## 5. Estado en que quedó el usuario de prueba

**NO se borró** — queda listo para que abras el mail y completes el flujo por
`reset-password.html` (el end-to-end de la etapa (b)).

`public.usuarios`:

| campo | valor |
|---|---|
| `email` | `mdqclio@gmail.com` |
| `nombre_completo` | `Invitado De Prueba` |
| `rol` | `operador` |
| `activo` | `false` |
| `estado` | `pendiente` |
| `telefono` | `+5492245000000` |
| `club_id` | `a6da7e40-…` → **Mi Club Hípico** |

`auth.users`: cuenta creada, `invited_at` seteado, **sin confirmar**, nunca
inició sesión. (Sin tokens en este informe.)

⚠️ **El club es "Mi Club Hípico", no Dolores.** El probe toma el club más viejo de
la tabla como "club propio" del caller. Para el flujo no cambia nada, pero si
querías ver el alta parada en Dolores, hay que correrlo forzando ese club.

Al completar el flujo, `reset-password.html` debería dejarlo en `activo = true` /
`estado = 'activo'` — ese es justamente el assert de la etapa (b).

### Conteos post-corrida

| | |
|---|---|
| `auth.users` total | 6 |
| `public.usuarios` total | 4 |
| fixtures `@sgh-probe.invalid` restantes (Auth) | **0** |
| fixtures `@sgh-probe.invalid` restantes (usuarios) | **0** |

Los fixtures se limpiaron por completo. Ninguna corrida dejó basura.

**Dos huérfanos de Auth PREEXISTENTES** (no son de esta tanda — son anteriores):
`sanfrancisco@sgh.com` y `clio@mdq.com.ar` tienen cuenta en Auth, sin confirmar,
que nunca inició sesión, y **sin fila en `public.usuarios`**. No se tocaron. Son
justo el tipo de huérfano que la función sabe reparar (invitar ese email crea la
fila faltante en vez de fallar), por si algún día se quieren recuperar.

---

## 6. Hallazgo de plataforma — Auth admin falla ~1 de cada 3 llamadas

Esto apareció solo, corriendo el probe, y **conviene resolverlo antes de la etapa (c)**.

La primera corrida del probe murió armando los fixtures:

```
invalid JWT: unable to parse or verify signature, token is unverifiable:
error while executing keyfunc: unrecognized JWT kid <nil> for algorithm ES256
```

No es determinístico: la misma llamada, con la misma key, falla o no según el
intento. Medido contra prod:

| Camino | Resultado |
|---|---|
| `admin.listUsers` con la secret key (GoTrue admin) | **14/20 OK, 6/20 fallan** |
| Ídem, segunda muestra | **10/12 OK, 2/12 fallan** |
| PostgREST con **la misma** secret key | **20/20 OK** |
| `GET /auth/v1/settings` con la publishable | **12/12 OK** |
| `signInWithPassword` con la publishable | **12/12 OK** |

**Lo que esto acota:**

- ✅ **El login de prod NO está afectado.** El camino anon de GoTrue está limpio en
  todas las muestras. Los usuarios reales no ven nada raro. No es un incidente.
- ✅ No es la secret key: por PostgREST anda 20/20.
- ✅ No es nuestro código: falla igual en llamadas directas a la Admin API desde
  Node, sin pasar por la función.
- ❌ Falla **sólo** secret key → endpoints **admin** de GoTrue.

La pinta es que la traducción `sb_secret_…` → JWT de service_role que hace el
gateway a veces emite un token que GoTrue no sabe verificar (`kid <nil>` contra
llaves ES256), probablemente por instancias con juegos de llaves desparejos tras
la rotación. Es para reportar a Supabase.

**Impacto medido sobre la función**, sin gastar mails (se usó el camino
`409 ya_activo`, que llega hasta el escaneo de Auth y corta antes de invitar):

```
invite-user, camino sin mail, x12:
  8x  409 ya_activo          ← correcto
  4x  500 auth_lookup_failed ← el fallo de plataforma
```

O sea: **~1 de cada 3 invitaciones desde la UI va a fallar** mientras dure esto.
Falla de forma segura —`500` con código identificable, sin mandar mail y sin
escribir nada— pero el usuario ve un error y tiene que reintentar.

**Lo bueno:** todos los modos de falla caen **antes** de mandar el mail. Por eso un
reintento no gasta cuota ni deja huérfanos.

### Qué se cambió en el probe por esto

Se le agregaron reintentos acotados, y **sólo** para esta firma de error —
cualquier otro error se propaga tal cual, para no tapar un bug real:

- Las llamadas a `admin.auth.admin.*` (crear/borrar/listar fixtures) reintentan
  ante `unrecognized JWT kid`. Sin esto el probe no mide nada: se cae armando los
  fixtures, que es lo que pasó en la primera corrida.
- Las llamadas a la función reintentan **sólo** en los códigos que devuelve
  *antes* de invitar: `caller_lookup_failed`, `dest_lookup_failed`,
  `auth_lookup_failed`, `auth_scan_truncado`.
- **`invite_failed` NO se reintenta**, a propósito: ahí GoTrue ya fue llamado y no
  se puede afirmar que el mail no salió. Reintentarlo podría mandar dos mails y
  quemar la cuota. Si aparece, el probe lo reporta y sigue.

Los 37 asserts que dieron verde son asserts reales — los reintentos sólo absorben
el ruido de plataforma, no relajan ninguna verificación.

### Sugerencia para la UI (etapa (b)/(c), no hecho acá)

Mientras el fallo siga, conviene que las pantallas de alta traten el `500` con
código `auth_lookup_failed` como *reintentable*, con un mensaje del tipo "Falló la
conexión con el servicio de cuentas, probá de nuevo", en vez de un error duro. Es
seguro: ese código garantiza que no se mandó mail ni se escribió nada.

---

## 7. Restricciones respetadas

- ❌ No se tocó el toggle "Allow new users to sign up" — sigue **prendido** (etapa (c)).
- ❌ No se mergeó `feat/alta-invitacion` a `main`.
- ❌ No se borró ningún usuario real. Los dos huérfanos preexistentes quedaron intactos.
- ❌ No se imprimió ninguna key en ningún lado — ni en logs, ni acá.
- ✅ Sólo se borraron fixtures `@sgh-probe.invalid` creados por las corridas.

---

## 8. Pendientes

1. **Vos:** abrir el **último** mail de invitación en `mdqclio@gmail.com` y completar
   el flujo por `reset-password.html` → end-to-end de la etapa (b).
2. **Después de eso:** teardown del usuario de prueba (fila en `usuarios` + cuenta
   en Auth). Sigue pendiente a propósito.
3. **Antes de la etapa (c):** decidir qué hacer con el fallo `kid <nil> ES256`
   (§6) — reportarlo a Supabase y/o hacer la UI tolerante al reintento. Con ~1 de
   cada 3 invitaciones fallando, cerrar el auto-registro sin esto va a doler.
4. Confirmar en el Dashboard cuál env var está aportando la key admin (§1), si se
   quiere dejar cerrado.
5. Opcional: correr el probe forzando Dolores como club propio, si querés ver el
   alta parada en el hipódromo real.
