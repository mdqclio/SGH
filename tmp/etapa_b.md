# Etapa (b) — Migrar pantallas admin + landing de invitación

Rama `feat/alta-invitacion`. Plan: `docs/plan_alta_invitacion.md` (vive en `chore/rls-audit`)
§4, §4.1 y correcciones C1/C2.

**SIN deploy, SIN secrets, SIN tocar Auth ni la DB, nada a `main`.** Sólo código.
Las únicas consultas a Supabase fueron `SELECT` read-only para verificar el schema de
`usuarios` y la policy `usuarios_update` antes de escribir la activación.

---

## 1. `reset-password.html` — landing de la invitación (C1, §4.1)

La página ya existía y es la landing del mail. Tres cambios:

**Detección del flujo.** El hash se lee de forma **síncrona** al principio del script
(`INITIAL_HASH`), antes de cualquier `await`: supabase-js tiene `detectSessionInUrl` prendido
por defecto y **limpia el hash** apenas procesa el token. Leerlo después de un `await` habría
dado siempre vacío — y esto es justo el bug que hacía caer la invitación en "enlace inválido".

```js
const INITIAL_HASH = window.location.hash || '';
const FLOW = (() => {
  const t = new URLSearchParams(INITIAL_HASH.replace(/^#/, '')).get('type');
  return t === 'invite' ? 'invite' : 'recovery';
})();
```

`onAuthStateChange` ahora acepta `SIGNED_IN` con `type=invite` además de `type=recovery`
(el link de invitación **no** dispara `PASSWORD_RECOVERY`). El chequeo de `access_token` ya
era genérico y no se tocó.

**Copy por flujo.** Objeto `COPY` con las dos variantes; `aplicarCopy()` las inyecta al cargar.

| | invite | recovery |
|---|---|---|
| Loading | "Verificando tu invitación…" | "Verificando enlace de recuperación…" |
| Título | "Creá tu contraseña" | "Nueva contraseña" |
| Subtítulo | "Bienvenido a SGH. Elegí la contraseña con la que vas a entrar al sistema." | "Ingresá tu nueva contraseña para el sistema" |
| Botón | "Crear mi contraseña" | "Guardar nueva contraseña" |
| Éxito | "¡Cuenta activada!" | "¡Contraseña actualizada!" |
| Inválido | "…pedí una nueva invitación a la secretaría." | "…ya fue usado o expiró." |

Además, en invite el ícono pasa a 👋 y el `<title>` a "SGH — Creá tu contraseña".

**Activación.** `activarUsuario()` corre **sólo en el flujo invite**, después de un
`updateUser({password})` exitoso:

```js
await sb.from('usuarios')
  .update({ activo: true, estado: 'activo' })
  .eq('email', normEmail(session.user.email))
  .select('id');
```

- `normEmail` = `trim().toLowerCase()`, idéntica a la de la Edge Function (el vínculo
  `auth.users ↔ public.usuarios` es el email, no hay FK).
- `.eq()` y no `ilike`: verificado contra prod, la policy es
  `usuarios_update: (fn_is_super_admin() OR email = auth.jwt()->>'email')` — igualdad exacta.
  Un `ilike` no ayudaría, RLS bloquearía igual una fila con distinto casing.
- **No se tocan `rol` ni `club_id`**: los protege un trigger y además serían una escalada.
- El `.select('id')` es para distinguir "no matcheó ninguna fila" de "salió bien":
  bajo RLS un UPDATE que no matchea **no da error**, devuelve 0 filas.

**Manejo del fallo (lo pedido explícitamente).** Para cuando esto corre la contraseña **ya
quedó seteada**, así que un fallo acá no puede presentarse como error fatal:

```js
console.error('[SGH-INVITE-ACTIVACION] no se pudo activar la fila de public.usuarios',
  { motivo, error, code });
```

y en pantalla, sobre el cartel de éxito: *"Tu contraseña quedó guardada, pero no pudimos
terminar de activar la cuenta. Probá entrar igual; si el sistema no te deja operar, avisá a
la secretaría."* Código `SGH-INVITE-ACTIVACION` buscable en la consola.

**Regresión:** el flujo `recovery` queda idéntico — mismo copy, y `activarUsuario()` ni se
llama. Sin `type` en el hash también cae en `recovery` (comportamiento actual).

---

## 2. `usuarios.html` — `saveCreate()`

- `signUp` + `insert usuarios` → **una** `sb.functions.invoke('invite-user', {...})`.
- Body: `{ email, nombre_completo, telefono, rol }` — **sin `club_id`**, lo resuelve la
  función desde la fila del caller (§2.1 paso 4).
- Campos `c-pass` / `c-pass2` **eliminados** del modal, de `openCreate()` y de las
  validaciones. Copy: "Nuevo Usuario" → **"Invitar Usuario"** (header y botón).
- Nota en el modal: "Le va a llegar un mail con un link para que elija su propia contraseña.
  La cuenta queda pendiente hasta que lo acepte."

**`parseFnError()` — el detalle que hace que los errores no sean mudos.** supabase-js **no
parsea el body** cuando la Edge Function responde ≠ 2xx: tira un `FunctionsHttpError` cuyo
`.message` es literalmente *"Edge Function returned a non-2xx status code"*, y deja el
`Response` crudo en `.context`. Sin leer `await error.context.json()` no hay forma de ver el
`code`. Por eso:

```js
async function parseFnError(error) {
  const status = error?.context?.status ?? null;
  let body = null;
  try { body = await error?.context?.json?.(); } catch (_) {}
  return { status, code: body?.code || null, mensaje: body?.error || error?.message || '…' };
}
```

**Mapa de errores** (`mensajeError()`):

| code / status | Qué hace la UI |
|---|---|
| `ya_existe` (409) | `confirm()` "¿Reenviar la invitación?" → reintenta con `reinvitar:true`. Se pregunta porque cada reenvío consume cuota de mail |
| `ya_activo` / `auth_ya_registrado` (409) | "Ya tiene una cuenta activa. Si perdió la contraseña, tiene que usar *¿Olvidaste tu contraseña?* en el login — no se reinvita" |
| `rate_limit_email` (429) | "Se alcanzó el límite de emails por hora. Reintentá en una hora." |
| `rol_no_invitable`, `club_ajeno`, `rol_caller_no_autorizado`, `caller_inactivo`, `caller_sin_fila` (403/422) | el mensaje que manda la función |
| `club_id_requerido` (422) | ver el punto abierto de abajo |
| resto | `mensaje (code) [HTTP status]` — nunca un error mudo |

---

## 3. `admin.html` — alta de hipódromo

- `insert clubs` y `insert categorias_carrera`: **sin cambios**.
- `signUp` + `insert usuarios` → `invite-user` con `club_id: newClubId` y
  `rol: 'secretario_carreras'`. El `club_id` acá **sí** va explícito porque el caller es
  super_admin y la función se lo exige.
- Inputs `c-admin-pass` / `c-admin-pass2` eliminados (del modal, de `openCreate()` y de las
  validaciones). El hint del email pasa a "Le llega una invitación por mail para que elija su
  propia contraseña."

**Cambio de orden, a propósito:** la invitación pasó a ser **el último paso**, después de las
categorías. Así el único estado parcial posible es "hipódromo completo, sin usuario", que es
exactamente el que el plan quiere poder reintentar. Antes, si fallaban las categorías, ya
había un usuario creado.

**Si la invitación falla: NO se borra el club.** Se cierra el modal, se recarga la lista (el
hipódromo aparece), y sale un toast de error:

> Hipódromo "X" quedó creado, pero la invitación falló: `<motivo>`. Reintentá la invitación
> desde Usuarios.

más un `console.error('[admin.saveCreate] invite-user falló', {club, email, code, status})`.
Es el estado San Francisco, contemplado en §4 del plan.

---

## 4. `login.html`

Sacado el link a `registro-profesional.html`. En su lugar: *"¿Necesitás una cuenta? Pedísela a
la secretaría del hipódromo."* Queda un comentario HTML explicando que es un adelanto de la
etapa (d) y que **la página no se borró**.

---

## 5. Chequeos

| Chequeo | Resultado |
|---|---|
| `grep "signUp(" usuarios.html admin.html` | ✅ **0 hits** |
| `signUp(` en el resto del repo | `registro.html:232`, `registro-profesional.html:243` — **quedan como están**, van en (d) |
| `git grep -nE 'sb_secret_\|service_role'` | ✅ sin valores reales. 22 archivos con hits, **todos** prosa de docs, comentarios o `GRANT ... TO service_role` en migraciones |
| Literales de key (`sb_secret_<valor>`, `eyJ<jwt>`) | Ver nota ⚠️ abajo |
| Sintaxis JS de los 4 HTML | ✅ los bloques inline parsean (`vm.Script`) |
| `node --check tests/probe_invite_user.mjs` | ✅ |
| `deno check supabase/functions/invite-user/index.ts` | ✅ |
| Cableado DOM (todo `getElementById` tiene su `id`) | ✅ en los 4 archivos |
| Parsing de `FLOW` (5 formas de hash) | ✅ invite / recovery / sin type |

⚠️ **Nota, preexistente y no introducida en esta etapa:** hay 4 docs
(`docs/ARQUITECTURA.md`, `docs/SNIPPETS.md` ×2, `docs/SPEC.md`, `REMEDIACION_RESULTADO.md`)
con la **anon legacy** `eyJ…` completa. Decodificada dice `"role":"anon"` — es pública por
diseño y además está **desactivada desde 2026-06-07** (401 "Legacy API keys are disabled").
No es una `service_role` y no es explotable. La dejo señalada, no la toqué: está fuera del
alcance de esta etapa.

---

## 6. Probe — caso 7 agregado

`tests/probe_invite_user.mjs` pasa de 6 casos a 7. **Queda escrito, corre post-deploy.**

**[7] reinvitación doble.** Invita dos veces con `reinvitar:true` sobre un usuario que existe
**sin confirmar**.

Lo que está averiguando: la §2.4 del plan **asume** que GoTrue reenvía la invitación en ese
caso, pero eso no está verificado contra la implementación real — hay versiones de GoTrue que
responden *"User already registered"* aunque el usuario no haya confirmado, y si es así el
camino de reinvitación del plan no funciona y hay que ir por `admin.generateLink({type:'invite'})`
o `auth.resend()`.

Por eso el caso **no afirma un happy path**. Afirma los invariantes que tienen que valer sí o
sí, y **reporta** lo que respondió GoTrue:

1. Si falla, falla con un `code` identificable (nunca un 500 mudo).
2. Sigue habiendo **exactamente 1** fila en `public.usuarios` (no se duplicó).
3. Sigue `activo=false` / `estado='pendiente'` — reinvitar **no** activa a nadie; eso es
   trabajo de `reset-password.html`.
4. Es la **misma** fila (mismo `id`: no se borró y recreó).
5. La cuenta de Auth sigue existiendo y sigue sin confirmar.

Y al final imprime el veredicto:
- `200`+`200` → "§2.4 confirmada".
- cualquier otra cosa → "§2.4 necesita revisión: evaluar `generateLink` / `resend`".

Helper nuevo `filasUsuario()` (devuelve el array completo) para poder afirmar "hay exactamente
una", que es distinto de "encontré una". `filaUsuario()` ahora es un wrapper.

⚠️ Consume 1-2 emails más de la cuota horaria.

---

## 7. Puntos abiertos para Leo

**(a) `usuarios.html` usado por un super_admin → 422.** La consigna fue explícita: mandar el
body **sin `club_id`**. Pero `usuarios.html` es accesible para super_admin (`initAuth()`
resuelve `CLUB_ID` desde `?club=UUID` o `localStorage` cuando `rol === 'super_admin'`), y la
función **exige** `club_id` explícito cuando el caller es super_admin (`fail(422,
'club_id_requerido')`, index.ts:332) — justamente para que no cree usuarios en su propio club
por accidente.

Implementado como se pidió, y el 422 sale con un mensaje accionable en vez de mudo:

> "Sos super_admin: la función pide un club_id explícito y esta pantalla no lo manda.
> Dá de alta al usuario desde el hipódromo correspondiente."

Si querés que un super_admin pueda invitar desde esta pantalla, el fix es un renglón:
mandar `club_id: CLUB_ID` sólo cuando `currentUser.rol === 'super_admin'`. **No lo hice porque
la consigna decía SIN club_id.** Decidilo vos.

**(b) Redirect URLs del Dashboard.** §4.1 tiene como precondición que la URL exacta de
`reset-password.html` en GitHub Pages esté en la allowlist de **Redirect URLs** de Auth. Es
config de Dashboard, no SQL: **no la verifiqué** (la consigna dice no tocar Auth). Si no está,
Supabase redirige al Site URL y el token se pierde — la invitación muere en la landing. Hay
que chequearlo antes del probe end-to-end. El `redirectTo` que manda la función es
`https://mdqclio.github.io/SGH/reset-password.html` (`INVITE_REDIRECT_URL`, index.ts:47).

**(c) Sin probe end-to-end todavía.** El circuito completo (invitar → mail → link → contraseña
→ `activo=true` → login) necesita la función deployada y SMTP andando (etapa 0 + (a)). El
caso 7 y los otros 6 están escritos y esperan.

---

## Archivos tocados

```
 admin.html                  |  90 +++++++++-------
 login.html                  |   7 +-
 reset-password.html         | 158 +++++++++++++++++++++++++-----
 tests/probe_invite_user.mjs |  97 +++++++++++++++++--
 usuarios.html               | 132 +++++++++++++++++--------
 5 files changed, 399 insertions(+), 85 deletions(-)
```

Sin cambios en `supabase/functions/invite-user/index.ts` (la etapa (a) queda como estaba).
