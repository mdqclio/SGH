# Gate 3 — La UI del auto-registro

**Fecha**: 2026-08-04 · **Rama**: `sec/autoregistro-gate-3` · **Base**: `main` @ `f5e4051` (Gate 2 mergeado)
**Guard**: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** antes y después ✅
**⚠️ NO mergeado — esto es UI visible y el gate es de Leo.**

Implementación de `AUTOREGISTRO_PLAN.md` §A, con la **adenda del aviso por WhatsApp**.

---

## Resultado

🟢 `probe_autoregistro_e2e` **14 OK · 0 FAIL** · canario 0a **18/18** · `probe_rls_portal` **34 PASS · 0 FAIL** · **0 policies permisivas** · residuo cero.

---

## 🔧 Dos cosas que chocaron con lo construido

### 1 · Con "Confirm email" encendido, `signUp` no devuelve sesión

El plan §A.1 dice: *"Con la sesión recién creada, `sb.functions.invoke(...)`"*. **Esa sesión no existe**: con confirmación de email activa, `signUp` devuelve `data.session === null` hasta que la persona abre el mail. Y sin sesión, `auth.uid()` es NULL y `rpc_solicitar_acceso` corta con "No autenticado".

**No cambia ninguna decisión de producto.** `solicitar-acceso.html` maneja **dos puntos de entrada**:

| entrada | qué muestra |
|---|---|
| sin sesión | formulario completo (datos + email + contraseña + captcha) |
| con sesión, sin fila en `usuarios` y sin solicitud | sólo los datos — el email y la contraseña ya están |

El `signUp` va con `emailRedirectTo` a la misma página, así que al confirmar el correo la persona vuelve ahí, ya logueada, y termina la solicitud. Los datos se guardan en `localStorage` **antes** del `signUp` y se repueblan solos, para no hacérselos escribir de nuevo.

### 2 · La adenda contradice al Gate 2 en el teléfono

`rpc_solicitar_acceso` **exigía** teléfono (lo hice obligatorio siguiendo §A.1 del plan). La adenda lo baja a **recomendado**. Hizo falta una migración chica:

- `migrations/sec_autoregistro_gate3_telefono.sql` — saca la validación y guarda **`NULL`** si viene vacío, para que la bandeja sepa que no hay a dónde avisar.
- `migrations/sec_autoregistro_gate3_telefono_rollback.sql` — commiteado **antes**, restaura la obligatoriedad.

El diff entre ambos archivos es **sólo** esa validación.

---

## Las piezas

### 1 · `solicitar-acceso.html` (nueva)

Campos: **Soy…** (Entrenador / Propietario, en el lenguaje de la gente), nombre, apellido, **DNI**, teléfono *(recomendado)*, email, contraseña.

- **El DNI se valida en el CLIENTE antes del `signUp`** — es la mitigación 1 de huérfanas (ISSUE-047). Sólo acepta dígitos mientras se tipea, y `^\d{7,8}$` antes de mandar. La causa más probable de que la RPC falle después de crear la cuenta desaparece.
- **Turnstile**, mismo patrón que `login.html`: render explícito, reset del token tras cada fallo (es de un solo uso), CSP con `challenges.cloudflare.com` en `script-src`, `connect-src` y `frame-src`.
- **Si la RPC falla después del `signUp`**: mensaje claro + pantalla de reintento que llama **sólo a la RPC**. No repite el `signUp`, que daría "usuario ya registrado" y confundiría.
- Los errores de la RPC se traducen a castellano de persona: *"Ya hay una solicitud pendiente con ese DNI. Si fuiste vos, esperá la respuesta de la secretaría."*
- Teléfono normalizado al guardar: sólo dígitos, `54` si ya lo trae, si no `549` + número sin el 0 inicial.

### 2 · Link en `login.html`

Debajo del pie, discreto: *"¿Sos entrenador o propietario? Solicitá tu acceso"*. **Nada más cambia** en esa página.

### 3 · `solicitudes.html` (nueva) — la bandeja

Pantalla propia, como manda §D.3 (no dentro de `usuarios.html`: otro objeto, otro ciclo de vida, otra audiencia). Recicla el `initAuth`, el topbar y el guard de rol.

Pestañas **Pendientes** (con contador) / **Resueltas**. Por solicitud: datos declarados + matcheo:

| caso | qué muestra |
|---|---|
| **EXACTO** | ficha con ese `documento_nro`, etiquetada en verde |
| **SUGERENCIA** | sin match exacto → candidatas por apellido, **ninguna preseleccionada** y dicho explícitamente en pantalla |
| **sin ficha** | aviso + link a `profesionales.html` / `propietarios.html` para crearla |

Más un **buscador manual** siempre disponible (por nombre, apellido o DNI). El botón de aprobar arranca **deshabilitado** hasta elegir ficha, y abajo dice a quién se va a vincular.

Acciones: **Vincular y aprobar** (con checkbox "copiarle el DNI declarado si la ficha no lo tiene", marcado por defecto) · **Rechazar…** (pide motivo, obligatorio) · **Descartar** (sin motivo, para los curiosos).

`initAuth` identifica por **`auth_user_id`**, no por email — a diferencia de las pantallas viejas.

### 4 · Aviso por WhatsApp *(adenda)*

Vía de aviso del piloto: sin mail automático, sin Edge Function.

- **Al aprobar**: si hay teléfono, ofrece abrir `wa.me` con el mensaje armado — *"Hola {nombre}! Tu acceso al sistema del Hipódromo de Dolores ya está aprobado. Podés entrar en …/login.html con tu email y la contraseña que elegiste."*
- **Al rechazar**: opcional y con **texto neutro**, sin repetir el motivo interno — *"…necesitamos verificar algunos datos. Comunicate con la secretaría cuando puedas."*
- **Botón persistente** en la pestaña de resueltas, para reenviar si el primero no salió. **No aparece en las descartadas**: a los curiosos no se les avisa nada.
- **Sin teléfono → el botón no aparece**, y al aprobar avisa *"No cargó teléfono: avisale por la vía que tengas."*

⚠️ **Limitación de la normalización**: el `15` intermedio de algunos números viejos no se detecta. Si el link no abre, el teléfono queda igual visible en la bandeja para copiarlo a mano.

### 5 · Pantalla del pendiente en `portal.html`

Un logueado **sin fila en `usuarios`** ya no rebota al login: ve su estado. **Sólo estado, cero datos del club** — decisión 1.

| situación | mensaje |
|---|---|
| sin solicitud | *"Falta completar tu solicitud"* + link a completarla |
| pendiente | *"Tu solicitud está en revisión"* + fecha y DNI + a quién consultar |
| aprobada | *"Tu acceso está habilitado"* — cerrá sesión y volvé a entrar |
| rechazada / descartada | *"Tu solicitud no fue aprobada"* + motivo si lo hay + secretaría |

Rechazada y descartada muestran **lo mismo**: el sistema las distingue, la persona no tiene por qué.

### 6 · Navegación del staff

`solicitudes.html` en el sidebar junto a Usuarios, en **las dos ramas de rol**, con badge de pendientes. Más la tarjeta en la grilla de módulos. El contador falla en silencio si algo sale mal: es un adorno, no puede tumbar el dashboard.

---

## Verificación

### `tests/probe_autoregistro_e2e.mjs` — 14 OK · 0 FAIL

Flujo completo de datos con teardown: solicitud → bandeja con matcheo → aprobación → la cuenta ve lo suyo → curioso descartado.

| # | assert |
|---|---|
| 0 | el `signUp` anónimo no crea cuenta sin pasar los controles |
| 1 | ficha creada **sin DNI**, para probar el copiado |
| 2 | `rpc_solicitar_acceso` crea la solicitud |
| 3 | la solicitud **sin teléfono** ya no es rechazada |
| 4 | el teléfono vacío se guarda como **NULL**, no como cadena vacía |
| 5 | el staff ve la solicitud en su bandeja |
| 6 | sin DNI en la ficha, el matcheo exacto **no** devuelve nada |
| 7 | la búsqueda manual por nombre **sí** la encuentra |
| 8 | el staff aprueba y se crea el usuario |
| 9 | el DNI declarado se copió a la ficha vacía |
| 10 | la cuenta ya tiene fila en `usuarios`, con rol y vínculo |
| 11 | ve su ficha, y **sólo** la suya |
| 12 | ve su solicitud como aprobada |
| 13 | el curioso se descarta sin motivo y sin avisar |

**No cubre el `signUp` del navegador, a propósito**: con Turnstile activo un probe headless no puede resolver el captcha. Las cuentas se crean por Admin API, que produce una fila en `auth.users` idéntica.

### 🔎 Hallazgo sobre el gate de signup

```
POST /auth/v1/signup  (sin captcha)  →  400 captcha_failed
```

**El captcha se evalúa ANTES que el switch de "allow new users to sign up".** Desde afuera **no se puede distinguir** "signup apagado" de "falta captcha" — dio `captcha_failed` tanto antes como después de que lo prendieras. Por eso el probe lo **reporta** en vez de asertarlo. La única verificación real es el dashboard, o el formulario con un navegador.

### Canarios

| probe | resultado |
|---|---|
| `probe_rls_secretaria` (0a) | ✅ **18 OK · 0 FAIL** |
| `probe_rls_portal` | ✅ **34 PASS · 0 FAIL · 2 PENDIENTE** |
| `probe_rls_no_permissive` | ✅ **0 permisivas** |

### Estado de la base

`spcs` 144 · `auth.users` 5 · `usuarios` 3 · `solicitudes_acceso` 0 · residuo de fixtures **0** · policies permisivas **0**.

### Sintaxis

JS inline validado con `node --check` en las cinco páginas tocadas. Sin ids duplicados en las dos nuevas.

---

## Punto 5 — el switch del signup

Ya lo prendiste mientras trabajaba, así que queda como registro del orden correcto:

**El orden correcto es prenderlo DESPUÉS del merge.** Con el signup prendido y `solicitar-acceso.html` todavía sin publicar, la única forma de registrarse es por API — nadie lo va a hacer, pero tampoco sirve de nada. Y si lo prendés antes y el merge se demora, la ventana queda abierta sin la pantalla que la justifica.

Como ya está prendido y el merge es inminente, no hay que tocar nada. **Después de mergear, verificá en este orden:**

1. `https://mdqclio.github.io/SGH/solicitar-acceso.html` carga y **se ve el widget de Turnstile**. Si no aparece, la CSP está bloqueando y el registro no va a funcionar.
2. Registrate con un correo tuyo de prueba y llegá hasta *"Revisá tu correo"*.
3. Confirmá el mail → volvés a la página, ya logueada, con los datos precargados → enviás.
4. Entrá como secretaría a `solicitudes.html`: la solicitud aparece con su matcheo.
5. Aprobala contra una ficha y **probá el botón de WhatsApp**.
6. Cerrá sesión, entrá con la cuenta nueva → tiene que ver el portal con lo suyo.
7. Borrá esa cuenta de prueba antes del piloto real.

Si algo falla en el paso 1 o 2, **apagá el signup** hasta resolverlo: es un toggle, no un deploy.

---

## Lo que quedó anotado y no hecho

- **ISSUE-047** — barrido de huérfanas de `auth.users`. Queda **para después del piloto**, por decisión explícita. La mitigación 1 (validar el DNI en el cliente) **sí está implementada**.
- **`docs/AUTOREGISTRO_PLAN.md` nunca se había mergeado a `main`**: vivía sólo en `tmp/autoregistro-plan`. Los tres reportes de gate lo referencian y la ruta no resolvía. Va en esta rama.
- El programa público de la pantalla del pendiente sigue fuera, por decisión 1.

## Siguiente

**Gate 4** — inscribir desde el portal (`PORTAL_V2_PLAN` §C.2), apuntado a **R9 (06/09)**. Los asserts 11 y 12 de `probe_rls_portal` siguen PENDIENTE esperando ese RPC.
