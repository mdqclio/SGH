# Checklist de panel — corte a `sigh.com.ar`

**Fecha**: 2026-08-23 · **Para**: Leo (tareas de dashboard, no de código)
**Origen**: `https://mdqclio.github.io/SGH/` → **Destino**: `https://sigh.com.ar/` (apex, sin `www`)
**Plan completo**: [`PLAN_DOMINIO_SIGH_COM_AR.md`](PLAN_DOMINIO_SIGH_COM_AR.md) · **Pase de código**: [`PASE_DOMINIO_PASO6.md`](PASE_DOMINIO_PASO6.md)

Las tareas están **en orden de ejecución**. Las 1 a 3 son aditivas y reversibles: no tocan
el sitio que está andando hoy. La 4 (DNS) es el primer paso irreversible-en-la-práctica.

**Antes de tocar cada panel, copiá el valor viejo en la columna "anotar antes".**
Sin eso no hay rollback: los paneles no versionan y los secrets de Supabase no se pueden leer.

Leyenda de la columna **cuándo**:
- 🟢 **YA** — se puede hacer ahora mismo, sin esperar nada
- 🟡 **DNS** — requiere que `sigh.com.ar` ya resuelva
- 🔵 **CERT** — requiere el certificado emitido y el sitio sirviendo por HTTPS

---

## Resumen de una línea

| # | Tarea | Panel | Cuándo |
|---|---|---|---|
| 1 | Agregar dominio al widget de Turnstile | Cloudflare | 🟢 YA |
| 2 | Agregar Redirect URLs (NO tocar Site URL) | Supabase | 🟢 YA |
| 3 | Setear 2 secrets de `invite-user` | Supabase | 🟢 YA |
| 4 | Revisar plantillas de mail de Auth | Supabase | 🟢 YA |
| 5 | Delegar nameservers a Cloudflare | NIC.ar | 🟢 YA |
| 6 | Crear A + AAAA + CNAME de www | Cloudflare DNS | 🟢 YA |
| 7 | TXT de verificación de dominio (opcional) | GitHub + Cloudflare | 🟢 YA |
| 8 | Custom domain en Pages → emite el cert | GitHub | 🟡 DNS |
| 9 | Tildar Enforce HTTPS | GitHub | 🔵 CERT |
| 10 | Avisar para mergear la rama de código | — | 🔵 CERT |
| 11 | Cambiar Site URL a `sigh.com.ar` | Supabase | 🔵 CERT |
| 12 | (+2 semanas) Sacar el dominio viejo de las allowlists | Cloudflare + Supabase | después |

---

## 1. Turnstile — agregar `sigh.com.ar` al widget 🟢 YA

**Dónde**: dash.cloudflare.com → (cuenta) → **Turnstile** → widget con site key
`0x4AAAAAAEFtOBOaoVEG7A6C` → **Settings** → **Hostname Management** (o "Domains").

**Qué poner** — agregar, sin borrar lo que ya está:

```
sigh.com.ar
www.sigh.com.ar
```

**Anotar antes de cambiar**: la lista completa de hostnames que hay hoy (debería estar
`mdqclio.github.io`, y quizá `localhost` o `127.0.0.1`). Copiala tal cual.

**Por qué primero**: si esto falta, el token del captcha no valida y GoTrue devuelve
`captcha_failed`. **No se puede loguear nadie** — ni el login normal, ni "olvidé mi
contraseña", ni el alta de `solicitar-acceso.html`. Es la falla más silenciosa de toda la
migración: no aparece en ningún `grep` del repo.

**Rollback**: sacar los dos hostnames nuevos. Efecto inmediato, sin deploy.

- [ ] Hecho — hostnames que había antes: `________________________`

---

## 2. Supabase Auth — agregar Redirect URLs 🟢 YA

**Dónde**: supabase.com/dashboard → proyecto `unlhcuanfrtpatoipwve` → **Authentication** →
**URL Configuration** → sección **Redirect URLs**.

**Qué poner** — agregar estas dos entradas, **dejando las que ya están**:

```
https://sigh.com.ar/**
https://www.sigh.com.ar/**
```

**NO tocar el campo Site URL todavía.** Ese es el paso 11, después del corte. Si lo cambiás
ahora, todo mail emitido antes del corte manda a un dominio que no resuelve.

**Anotar antes de cambiar**:
- Site URL actual: `________________________` (solo anotarlo, no tocarlo)
- Lista completa de Redirect URLs actuales: `________________________`

**Por qué**: ante un `redirectTo` que no matchea la allowlist, GoTrue **lo ignora en silencio**
y manda al Site URL. El token de invitación se pierde y la cuenta nunca se activa — el mail
llega, el link "anda", y la persona no puede completar. Exactamente el escenario que planteaste.

**Rollback**: borrar las dos entradas nuevas. Tener las viejas y las nuevas al mismo tiempo
no rompe nada.

- [ ] Hecho — Site URL actual anotado, Redirect URLs viejas anotadas

---

## 3. Supabase Edge Functions — secrets de `invite-user` 🟢 YA

**Dónde**: Dashboard → **Edge Functions** → **Secrets** (o Project Settings → Edge Functions
→ Secrets, según la versión del panel). Son secrets de proyecto, no por función.

**Qué poner** — dos variables:

| Nombre | Valor exacto |
|---|---|
| `INVITE_ALLOWED_ORIGINS` | `https://sigh.com.ar,https://mdqclio.github.io` |
| `INVITE_REDIRECT_URL` | `https://sigh.com.ar/reset-password.html` |

Sin espacios alrededor de la coma. Sin barra final. Con `https://`.

**Anotar antes de cambiar**: si las variables **ya existen**, copiá su valor actual antes de
pisarlo. Los secrets **no se pueden volver a leer** una vez guardados — si no lo anotás, el
valor viejo se perdió. Si no existen, anotá "no existían".

- `INVITE_ALLOWED_ORIGINS` antes: `________________________`
- `INVITE_REDIRECT_URL` antes: `________________________`

**Por qué**: la función `invite-user` está viva (v3, `verify_jwt: true`) y la llama el
**browser** desde `usuarios.html` y `admin.html`. Sus defaults hardcodeados dicen
`mdqclio.github.io`; desde `sigh.com.ar` el preflight CORS devolvería el origen viejo y el
browser bloquea la respuesta. Síntoma: invitar usuarios falla con un error de red opaco
(supabase-js no distingue CORS de caída). Estas envs pisan los defaults **sin re-deploy**.

Dejar `mdqclio.github.io` en la lista de origins es a propósito: durante la transición
las dos ventanas funcionan.

**Rollback**: volver a poner el valor anotado, o borrar la variable para que corra el default.

- [ ] Hecho — valores anteriores anotados (o "no existían")

---

## 4. Supabase Auth — revisar plantillas de mail 🟢 YA

**Dónde**: Dashboard → **Authentication** → **Email Templates**. Mirar las cuatro:
*Confirm signup*, *Invite user*, *Magic Link*, *Reset password*.

**Qué buscar**: cualquier URL escrita a mano con `mdqclio.github.io`. Lo correcto es que el
link salga de la variable:

```
{{ .ConfirmationURL }}
```

Si alguna plantilla tiene el dominio hardcodeado, cambiarlo por la variable (mejor) o por
`https://sigh.com.ar/...` (mínimo).

**Anotar antes de cambiar**: copiá el HTML completo de cualquier plantilla que edites.

**Por qué**: esto no lo puedo ver desde acá y no está en el repo. Si hay una URL a mano, es
un punto de falla que ninguna de las otras tareas cubre.

- [ ] Revisado — plantillas con URL hardcodeada: `________________________`

---

## 5. NIC.ar — delegar nameservers 🟢 YA

**Dónde**: nic.ar → login → **Mis dominios** → `sigh.com.ar` → **Delegaciones** /
**Editar DNS**.

**Qué poner**: los dos nameservers que te da Cloudflare al agregar el sitio
(dash.cloudflare.com → Add a site → `sigh.com.ar` → plan Free). Tienen esta pinta:

```
xxxx.ns.cloudflare.com
yyyy.ns.cloudflare.com
```

Son **específicos de tu cuenta** — usar los que muestre el panel, no estos de ejemplo.

**Anotar antes de cambiar**: los nameservers actuales de NIC.ar (probablemente
`a.nic.ar` / `b.nic.ar` o los de otro proveedor). Anotalos: es el único camino de vuelta.

**Por qué**: NIC.ar no da una zona DNS propia usable para registros A/AAAA arbitrarios.
Cloudflare gratis es lo habitual.

**Tiempo**: la delegación de NIC.ar puede tardar **hasta 24-48 h**. Es la espera más larga
de toda la migración — arrancala temprano.

**Rollback**: volver a poner los nameservers anotados. Tarda lo mismo en propagar.

- [ ] Hecho — NS anteriores: `________________________`
- [ ] Verificado: `dig NS sigh.com.ar +short` devuelve los de Cloudflare

---

## 6. Cloudflare DNS — crear los registros 🟢 YA

**Dónde**: dash.cloudflare.com → `sigh.com.ar` → **DNS** → **Records** → Add record.

### 6a. Cuatro registros A (IPv4)

Type `A`, Name `@`, TTL `Auto`, **Proxy status: DNS only (nube GRIS)**.

```
@   A   185.199.108.153
@   A   185.199.109.153
@   A   185.199.110.153
@   A   185.199.111.153
```

### 6b. Cuatro registros AAAA (IPv6)

Type `AAAA`, Name `@`, TTL `Auto`, **DNS only (nube GRIS)**.

```
@   AAAA   2606:50c0:8000::153
@   AAAA   2606:50c0:8001::153
@   AAAA   2606:50c0:8002::153
@   AAAA   2606:50c0:8003::153
```

No son opcionales en la práctica: sin ellos, los clientes IPv6-only no llegan.

### 6c. CNAME de www

Type `CNAME`, Name `www`, **DNS only (nube GRIS)**:

```
www   CNAME   mdqclio.github.io
```

(Cloudflare le agrega el punto final solo.) Con el apex como dominio primario en Pages,
GitHub redirige `www.sigh.com.ar` → `sigh.com.ar`. Sin este registro, `www.` **no resuelve**.

### 🔴 La nube tiene que estar GRIS

Con el proxy naranja prendido, el challenge HTTP-01 de Let's Encrypt no llega a GitHub y
**el certificado nunca se emite**. Es la causa #1 de que Pages quede colgado en
"Certificate is being provisioned". Dejalo en DNS only: este sitio no necesita nada de
Cloudflare más allá del DNS.

**Anotar antes de cambiar**: si la zona ya tenía registros (mail, otro sitio), sacá una
captura de la lista completa antes de agregar nada.

**Rollback**: borrar los 9 registros. Mientras GitHub Pages no tenga el custom domain
configurado, el sitio viejo sigue sirviendo normal.

- [ ] 4 registros A creados, nube gris
- [ ] 4 registros AAAA creados, nube gris
- [ ] CNAME de www creado, nube gris
- [ ] Verificado: `dig sigh.com.ar +short` devuelve las 4 IPs de GitHub
- [ ] Verificado: `dig AAAA sigh.com.ar +short` devuelve las 4 IPv6

---

## 7. Verificación de dominio en GitHub (opcional, recomendada) 🟢 YA

**Dónde (paso 1)**: github.com → foto de perfil → **Settings** (de la cuenta, NO del repo) →
**Pages** → **Add a domain** → escribir `sigh.com.ar` → **Add domain**.

GitHub te muestra un registro TXT para crear. El formato es:

| Campo | Valor |
|---|---|
| Type | `TXT` |
| Name / Host | `_github-pages-challenge-mdqclio` |
| Value | un token que te da GitHub, tipo `a1b2c3d4e5f6...` |
| TTL | Auto |

⚠️ El **Name** va sin el dominio: Cloudflare completa solo y queda
`_github-pages-challenge-mdqclio.sigh.com.ar`. Si escribís el nombre completo, Cloudflare lo
duplica (`..._mdqclio.sigh.com.ar.sigh.com.ar`) y la verificación falla.

⚠️ El **Value** es único y de un solo uso — copialo del panel de GitHub, no de acá.

**Dónde (paso 2)**: crear ese TXT en Cloudflare DNS, volver a GitHub y darle **Verify**.

**Por qué**: sin verificar, si algún día se saca el dominio de este repo, cualquiera puede
reclamarlo desde otra cuenta de GitHub y quedarse con el sitio (*domain takeover*). El TXT
se puede dejar puesto para siempre.

- [ ] TXT creado y dominio verificado en GitHub (o decidido saltarlo)

---

## 8. GitHub Pages — custom domain 🟡 esperar DNS

**Precondición**: `dig sigh.com.ar +short` ya devuelve las 4 IPs de GitHub. **No hacer este
paso antes** — si el DNS no resuelve, GitHub falla la validación y hay que reintentar.

**Dónde**: github.com/mdqclio/SGH → **Settings** → **Pages** → **Custom domain**.

**Qué poner** — exactamente esto, sin `https://`, sin barra final, sin `www`:

```
sigh.com.ar
```

→ **Save**.

**Qué pasa**: GitHub commitea solo un archivo `CNAME` en la raíz de `main` con esa línea
adentro, y arranca el pedido de certificado a Let's Encrypt.

⚠️ **Ese commit automático es real**: la próxima vez que hagas `git pull` va a bajar.
No borres el archivo `CNAME` nunca — sin él, Pages vuelve a servir en `github.io` y el
dominio propio queda apuntando a la nada.

**Anotar antes de cambiar**: el campo está vacío hoy (no existe `CNAME` en el repo —
verificado). Nada que anotar.

**Tiempo del certificado**: normalmente 10–60 min desde que el DNS resuelve bien; GitHub
declara hasta 24 h. Mientras tanto Pages muestra *"Certificate is being provisioned"* y el
checkbox de Enforce HTTPS está grisado.

**Si a las 24 h no emitió**: borrar el custom domain → Save → volver a ponerlo → Save
(fuerza un intento nuevo). Antes de eso, revisar que la nube de Cloudflare esté **gris**
y que no haya un AAAA viejo apuntando a otro lado.

**Rollback**: borrar el custom domain y Save. El sitio vuelve a `mdqclio.github.io/SGH/`
en minutos. Borrar también el archivo `CNAME` del repo si quedó.

- [ ] Custom domain guardado
- [ ] Archivo `CNAME` apareció en el repo (`git pull` para bajarlo)
- [ ] Certificado emitido (el aviso de "provisioning" desapareció)

---

## 9. GitHub Pages — Enforce HTTPS 🔵 esperar certificado

**Dónde**: mismo panel — Settings → Pages → checkbox **Enforce HTTPS**.

**Qué hacer**: tildarlo. Está grisado hasta que el certificado esté emitido.

**Obligatorio para este sitio**: Supabase Auth y Turnstile no pueden viajar por HTTP.

⚠️ Si en algún momento prendés el proxy de Cloudflare, el modo SSL/TLS tiene que ser
**Full (strict)**. "Flexible" + Enforce HTTPS = loop infinito de redirects.

- [ ] Enforce HTTPS tildado
- [ ] `curl -sI https://sigh.com.ar/login.html` → `200`

---

## 10. Avisame para mergear el código 🔵 esperar certificado

**No es tarea de panel** — es el handoff.

**Cuándo avisar**: cuando `curl -sI https://sigh.com.ar/login.html` devuelva `200` con
certificado válido.

**Qué se mergea**: la rama `chore/dominio-sigh-com-ar` (14 archivos, 16 líneas, cero lógica).
El detalle exacto está en [`PASE_DOMINIO_PASO6.md`](PASE_DOMINIO_PASO6.md).

**Por qué no antes**: esa rama apunta el `redirectTo` del reset de contraseña a
`sigh.com.ar`. Mergeada antes de que el dominio sirva, el mail de recuperación llega con un
link muerto — se rompe un flujo que hoy anda.

- [ ] Avisado, rama mergeada, cambios verificados en prod

---

## 11. Supabase Auth — cambiar el Site URL 🔵 después del merge

**Dónde**: Dashboard → **Authentication** → **URL Configuration** → campo **Site URL**.

**Qué poner**:

```
https://sigh.com.ar
```

Sin barra final.

**Anotar antes de cambiar**: ya lo anotaste en el paso 2. Verificá que lo tenés.

**Por qué recién ahora**: el Site URL es el destino de fallback de GoTrue. Cambiarlo antes
de que el dominio sirva convierte cada fallback en un link muerto.

**Rollback**: volver al valor anotado en el paso 2.

- [ ] Site URL cambiado

---

## 12. Limpieza — a las ~2 semanas sin incidentes

Recién cuando el dominio nuevo esté andando sin quejas. Estas dos tareas cortan el puente
con el dominio viejo, así que no hay apuro.

**12a. Turnstile**: sacar `mdqclio.github.io` de la lista de hostnames del widget.

**12b. Supabase Auth**: sacar `https://mdqclio.github.io/SGH/**` de las Redirect URLs.

**12c. Secret**: dejar `INVITE_ALLOWED_ORIGINS = https://sigh.com.ar` (sin el viejo).

⚠️ Después de esto, cualquier link viejo que alguien tenga guardado sigue redirigiendo por
el 301 de GitHub, pero **el login desde el dominio viejo deja de funcionar**. Es lo buscado
— solo hay que hacerlo a conciencia.

- [ ] 12a Turnstile limpio
- [ ] 12b Redirect URLs limpias
- [ ] 12c Secret limpio

---

## Verificación final (después del paso 11)

- [ ] `dig sigh.com.ar +short` → las 4 IPs de GitHub
- [ ] `curl -sI https://sigh.com.ar/login.html` → `200`, cert válido
- [ ] `curl -sI https://mdqclio.github.io/SGH/login.html` → `301` a `https://sigh.com.ar/login.html`
- [ ] Login real en `sigh.com.ar` (valida Turnstile en el dominio nuevo)
- [ ] "Olvidé mi contraseña" → mail con link a `sigh.com.ar/reset-password.html`, y funciona
- [ ] Invitar un usuario de prueba desde `usuarios.html` → sin error de CORS en la consola
- [ ] Completar esa invitación de punta a punta
- [ ] `solicitar-acceso.html` → alta con captcha OK
- [ ] Instalar la PWA desde `sigh.com.ar` → abre en `/login.html`
- [ ] `node tests/smoke_full.mjs`

---

## Valores de referencia — para copiar y pegar

```
# GitHub Pages — A (IPv4)
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153

# GitHub Pages — AAAA (IPv6)
2606:50c0:8000::153
2606:50c0:8001::153
2606:50c0:8002::153
2606:50c0:8003::153

# CNAME de www
www  ->  mdqclio.github.io

# TXT de verificación de dominio (el valor lo da GitHub)
_github-pages-challenge-mdqclio  ->  <token de GitHub>

# Archivo CNAME en la raíz del repo (lo crea GitHub solo)
sigh.com.ar

# Supabase Auth — Redirect URLs (agregar, no reemplazar)
https://sigh.com.ar/**
https://www.sigh.com.ar/**

# Supabase Auth — Site URL (recién en el paso 11)
https://sigh.com.ar

# Supabase Edge Functions — Secrets
INVITE_ALLOWED_ORIGINS = https://sigh.com.ar,https://mdqclio.github.io
INVITE_REDIRECT_URL    = https://sigh.com.ar/reset-password.html

# Turnstile — hostnames a agregar (site key 0x4AAAAAAEFtOBOaoVEG7A6C)
sigh.com.ar
www.sigh.com.ar
```
