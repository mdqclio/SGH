# Probe de invitación — validación del template en español

**Fecha**: 2026-08-04 · **Proyecto**: `unlhcuanfrtpatoipwve`
**Guard**: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** antes y después ✅
**Corridas del probe**: 2. La primera murió por captcha sin mandar nada; la segunda es la buena.

---

## Resultado

🟢 **36 OK · 0 FAIL** · **1 email disparado** · **residuo cero**.

Falta lo que sólo podés ver vos: **idioma, remitente y bandeja-vs-spam en `clio+probe@mdq.com.ar`**.

---

## 🔴 Antes: el captcha había dejado el login de producción caído

Activar Attack Protection sin widget en el cliente tiró abajo el acceso. GoTrue rechaza **antes de mirar credenciales**:

```
POST /auth/v1/token?grant_type=password
{"code":400,"error_code":"captcha_failed",
 "msg":"captcha protection: request disallowed (no captcha_token found)"}
```

Alcance medido: `login.html` (`signInWithPassword`), `/auth/v1/recover` (reset de contraseña) y los **tres probes** que se autenticaban por password — incluidos los dos canarios de RLS. `invite-user` no se vio afectada: va por Admin API.

**Mi error**: el checklist del Gate 0 avisaba del impacto sobre `signUp` y omitió que el captcha cubre **todos** los endpoints de auth. Lo correcto era captcha recién en el Gate 3, junto con el widget.

### Arreglado sin apagar la protección

En vez de revertir, se embebió el widget. Ya está en producción (`main` @ `2cbf165`).

| pieza | detalle |
|---|---|
| **Site key** | `0x4AAAAAAEFtOBOaoVEG7A6C` — público por diseño, va en el HTML. El secret vive sólo en Supabase |
| **Render** | explícito, no por clase: hay **dos** widgets (login y recuperación) y el segundo arranca oculto |
| **Carga async** | `api.js` es `async defer`; el render reintenta hasta 10 s |
| **Token de un solo uso** | se resetea el widget en el camino de error de `doLogin` y después de `doReset`. Sin esto, un segundo intento moría por token gastado aunque la contraseña fuera correcta |
| **Click prematuro** | si el widget no resolvió, se pide esperar en vez de mandar una llamada que GoTrue va a rechazar |
| **CSP** | `challenges.cloudflare.com` agregado a `script-src`, `connect-src` y **`frame-src`** (el widget es un iframe). Sin los tres no carga |
| bonus | el botón de recuperación tenía **dos** atributos `id`; se sacó el sobrante |

Verificado en prod tras la publicación de Pages (~50 s): el HTML servido trae el site key, el script de Turnstile, `frame-src` y los 8 usos de `captchaToken`.

### Y los probes, sin apagar nada tampoco

Medición del 04/08 sobre los endpoints de auth con captcha activo:

| endpoint | gateado |
|---|---|
| `/auth/v1/token?grant_type=password` | 🔴 sí |
| `/auth/v1/otp` (magic link) | 🔴 sí |
| `/auth/v1/recover` | 🔴 sí |
| **`/auth/v1/verify`** | 🟢 **no** — con token bogus devuelve `otp_expired`, no `captcha_failed` |

Eso abre el camino: **`admin.generateLink({type:'magiclink'})` no manda mail**, sólo devuelve el `hashed_token`; canjearlo contra `verifyOtp` da sesión **sin pasar por captcha y sin gastar cuota de emails**.

Aplicado a los tres probes:

| probe | estado |
|---|---|
| `tests/probe_invite_user.mjs` | ✅ **36 OK · 0 FAIL** |
| `tests/probe_rls_secretaria.mjs` — **canario 0a** | ✅ **18 OK · 0 FAIL — CANARIO VERDE** |
| `tests/probe_rls_portal.mjs` | ✅ misma corrección aplicada |

Es además un diseño mejor: los probes ya no dependen de contraseñas.

---

## La corrida

```
INVITE_TEST_EMAIL=clio+probe@mdq.com.ar
INVITE_REINVITACIONES=0
INVITE_KEEP_TEST_USER sin setear
ref destino: unlhcuanfrtpatoipwve
```

### Envíos disparados: **1**

| | |
|---|---|
| caso 1 (camino feliz) | **1 email** → `clio+probe@mdq.com.ar` |
| caso 7 (reinvitación) | **0** — salteado por `INVITE_REINVITACIONES=0` |
| **total** | **1** |

Cuota horaria de envíos: 30/hora. Consumo: 1.

La primera corrida (la que murió por captcha) disparó **0**: se cayó en el `signIn` del fixture, antes de la primera llamada a `invite-user`.

### Residuo post-teardown: **cero**

Cleanup: *"limpiados: 4 filas usuarios, 4 auth users"*.

| chequeo | antes | después |
|---|---|---|
| `auth.users` | 5 | **5** ✅ |
| `usuarios` | 3 | **3** ✅ |
| `auth.users` `probe-invite-%` | 0 | **0** ✅ |
| `auth.users` `%.invalid` | 0 | **0** ✅ |
| `usuarios` `probe-invite-%` | 0 | **0** ✅ |
| `usuarios` `%.invalid` | 0 | **0** ✅ |
| `clio+probe@mdq.com.ar` (auth) | 0 | **0** ✅ |
| `clio+probe@mdq.com.ar` (usuarios) | 0 | **0** ✅ |
| `spcs` | 144 | **144** ✅ |

No hizo falta `tests/teardown_probe_invite_residuo.sql`.

### Lo que verificó el probe del caso 1

Status 200 · `ok=true` · `estado='invitado'` · email normalizado a lowercase · `ya_existia=false` · fila creada en `public.usuarios` con `estado='pendiente'`, `activo=false`, `rol='operador'` y **`club_id` el del caller, no el del body** · cuenta creada en Auth y **sin confirmar** hasta que acepte.

Más los negativos, que son los que importan: 401 sin token · 403 rol operador · 403 club ajeno · 403 intento de crear un super_admin · 422 rol inválido · 409 email repetido. En los 403 se verifica además que **no se creó nada**, ni fila ni cuenta.

### Reintentos por el bug "kid \<nil\>": 0

Ninguna llamada necesitó repetirse, ni las de la Admin API. La corrida fue corta; no alcanza para afirmar que el bug se haya ido.

---

## 📬 Lo que te toca a vos

En **`clio+probe@mdq.com.ar`** hay **un** mail de invitación. Confirmá:

1. **Idioma** — ¿está en español? Es el punto de toda la corrida
2. **Remitente visible** — nombre y dirección
3. **¿Bandeja o spam?**
4. Que el link de la invitación apunte a `mdqclio.github.io/SGH`

⚠️ El invitado **ya fue borrado** por el teardown (`INVITE_KEEP_TEST_USER` sin setear), así que **el link no va a funcionar**. Es esperado: esta corrida validaba el mail, no el flujo de aceptación. Si querés probar el link end-to-end, hay que repetir con `INVITE_KEEP_TEST_USER=1`.

---

## Estado

| | |
|---|---|
| Login de producción | 🟢 restaurado, con captcha activo |
| Reset de contraseña | 🟢 con widget |
| Canario 0a | 🟢 **18/18** |
| Probe del portal | 🟢 auth arreglada |
| Probe de invitación | 🟢 36/36, 1 mail |
| **Gate 1** | 🟢 **desbloqueado** — el canario vuelve a correr, así que ya se pueden tocar policies |

Pendiente menor: el probe podría detectar `captcha_failed` y salir con un mensaje explícito en vez de un `💥` genérico. No es bloqueante — la vía por magiclink ya lo evita.
