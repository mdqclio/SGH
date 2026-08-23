# Plan — dominio propio `sigh.com.ar` en GitHub Pages

**Fecha**: 2026-08-23 · **Estado**: PLAN. Nada ejecutado.
**Origen actual**: `https://mdqclio.github.io/SGH/` (repo `mdqclio/SGH`, rama `main`, Pages "deploy from branch")
**Destino**: `https://sigh.com.ar/` (apex, sin `www`)

> Guard de sesión al escribir este plan: `pwd = /home/clio/dev/SGH`, `spcs = 181`, ref `unlhcuanfrtpatoipwve`.

---

## 0. El cambio estructural que atraviesa todo

Hoy el sitio vive en un **subdirectorio**: `mdqclio.github.io/**SGH/**login.html`.
Con dominio propio pasa a vivir en la **raíz**: `sigh.com.ar/login.html`.

O sea: cambia el host **y** desaparece el prefijo `/SGH/` del path. Todo lo que
asuma `/SGH/` se rompe, aunque no mencione `mdqclio`. (Ver §5.5 — `manifest.json`.)

Los links relativos (`href="carta-llamados.html"`, `href="manifest.json"`) **no se tocan**:
funcionan igual en raíz. El repo usa relativos en todos lados salvo los casos listados en §5.

---

## 1. Registros DNS

`sigh.com.ar` se registra en **NIC.ar**, que no da zona DNS propia usable para esto:
hay que delegar los nameservers a un proveedor de DNS (Cloudflare gratis es lo habitual)
y crear los registros ahí.

### Opción A — recomendada: A + AAAA en el apex

**A (IPv4)** — cuatro registros, host `@`, TTL 3600:

```
@   A   185.199.108.153
@   A   185.199.109.153
@   A   185.199.110.153
@   A   185.199.111.153
```

**AAAA (IPv6)** — cuatro registros, host `@`, TTL 3600. No son opcionales en la
práctica: sin ellos los clientes IPv6-only no llegan.

```
@   AAAA   2606:50c0:8000::153
@   AAAA   2606:50c0:8001::153
@   AAAA   2606:50c0:8002::153
@   AAAA   2606:50c0:8003::153
```

### Opción B — ALIAS/ANAME si el proveedor lo soporta

```
@   ALIAS   mdqclio.github.io.
```

Mejor a largo plazo: si GitHub cambia las IPs, el ALIAS sigue resolviendo solo.
Cloudflare lo implementa como "CNAME flattening" (se carga un CNAME en `@` y él lo aplana).
**No mezclar A/AAAA con ALIAS en el mismo nombre.**

### `www` — sí, conviene

```
www   CNAME   mdqclio.github.io.
```

Con el apex configurado como dominio primario en Pages, GitHub redirige
`www.sigh.com.ar` → `sigh.com.ar` automáticamente. Cuesta un registro y evita que
alguien que tipea `www.` vea un error. Sin este registro, `www.sigh.com.ar` **no resuelve**.

### Si se usa Cloudflare — importante

- Poner los registros en **DNS only (nube gris)**, al menos hasta que GitHub emita el
  certificado. Con proxy activo (nube naranja) el challenge de Let's Encrypt no llega a
  GitHub y el certificado **nunca se emite**.
- Si después se quiere el proxy: SSL/TLS mode **Full (strict)**, nunca "Flexible"
  (Flexible + "Enforce HTTPS" de Pages = loop de redirects).
- Recomendación conservadora para el piloto: dejarlo en DNS only. No se necesita nada
  de Cloudflare para este sitio.

### Verificación de dominio (opcional pero recomendada)

GitHub ofrece *verified domains* (Settings de la cuenta → Pages) con un `TXT` en
`_github-pages-challenge-mdqclio.sigh.com.ar`. Evita el *domain takeover* si en el futuro
se saca el dominio de este repo y alguien lo reclama desde otra cuenta.

---

## 2. Archivo `CNAME` en la raíz del repo

Hoy **no existe** (`ls` de la raíz confirmado: no hay `CNAME`).

Contenido: **una sola línea, el dominio pelado, sin esquema, sin barra final, sin `www`**,
con newline final:

```
sigh.com.ar
```

- Nombre de archivo exactamente `CNAME`, en mayúsculas, en la **raíz del repo** (la carpeta
  que Pages publica, que acá es `/`).
- Camino recomendado: crearlo desde **Settings → Pages → Custom domain**, escribir
  `sigh.com.ar` y Save. GitHub commitea el archivo solo. Así se evita el desfasaje entre
  el archivo y la config del repo.
- Si se commitea a mano, la config de Pages lo levanta igual en el próximo deploy.
- **No borrarlo nunca por accidente**: sin `CNAME`, Pages vuelve a servir en `github.io` y
  el dominio propio queda apuntando a la nada.

---

## 3. HTTPS

1. Configurar el DNS **primero** y esperar a que propague (`dig sigh.com.ar +short` debe
   devolver las cuatro IPs de GitHub).
2. Recién ahí poner el dominio en Settings → Pages. GitHub arranca el pedido de certificado
   a Let's Encrypt vía challenge HTTP-01.
3. Mientras se emite, Pages muestra *"Certificate is being provisioned"* y el checkbox
   **Enforce HTTPS** aparece grisado.
4. Cuando termina, se tilda **Enforce HTTPS**. Tildarlo es obligatorio para este sitio:
   Supabase Auth y Turnstile no deben viajar por HTTP.

**Tiempos reales**: normalmente 10–60 min desde que el DNS resuelve bien. GitHub declara
hasta 24 h. Si a las 24 h sigue sin emitir: sacar el dominio de Settings → Pages, Save,
volver a ponerlo (fuerza un nuevo intento). Causa #1 de que no emita: proxy de Cloudflare
prendido, o un `AAAA` viejo apuntando a otro lado.

Renovación: automática, sin intervención.

---

## 4. Transición — ¿sigue funcionando `mdqclio.github.io/SGH`?

**Sí: redirige, no rompe.** Con un `CNAME` configurado, GitHub Pages responde **301** en
`mdqclio.github.io/SGH/*` hacia `sigh.com.ar/*`, **preservando el path**:

```
https://mdqclio.github.io/SGH/login.html   → 301 →   https://sigh.com.ar/login.html
https://mdqclio.github.io/SGH/portal.html  → 301 →   https://sigh.com.ar/portal.html
```

El fragmento (`#access_token=...`) lo preserva el browser en un 301, así que los links de
mail viejos siguen funcionando. **Pero no hay que apoyarse en eso** (ver §5.2): la allowlist
de Supabase compara la URL **exacta** que se pide, y Turnstile valida el hostname **final**.

Conclusión para los links que circulan: no hay que salir a corregirlos con urgencia.
Igual conviene actualizar los que estén en documentos vivos.

Nota: `github.com/mdqclio/SGH` (el repo, clone, raw.githubusercontent) **no cambia nada**.
Es otro host y otro propósito.

---

## 5. QUÉ SE ROMPE — inventario completo

Barrido: `grep -rn "mdqclio"` sobre todo el repo (excluyendo `.git/` y `node_modules/`)
+ `grep -rn "/SGH/"` + revisión de la config de Supabase y de las dos Edge Functions.

### 5.1 🔴 CRÍTICO — Supabase Auth: Site URL y Redirect URLs

**Dónde**: Dashboard → Authentication → URL Configuration. **No está en el repo, no es
inspeccionable por MCP** — hay que abrir el Dashboard y mirarlo a mano.

Qué hay que dejar configurado:

| Campo | Valor a poner |
|---|---|
| **Site URL** | `https://sigh.com.ar` |
| **Redirect URLs** (allowlist) | `https://sigh.com.ar/**` — y **dejar** `https://mdqclio.github.io/SGH/**` durante la transición |

Impacto si queda la vieja y nada más: **exactamente el escenario que planteaste**. GoTrue,
ante un `redirectTo` que no matchea la allowlist, **ignora el pedido y manda al Site URL**.
El token de invitación / confirmación se pierde en el camino y la persona no puede completar
el alta. Falla silenciosa: el mail llega, el link "anda", y la cuenta nunca se activa.

Orden seguro: **agregar las nuevas URLs ANTES de cambiar nada más**. La allowlist acepta
varias entradas; tener las dos no rompe nada y hace la transición reversible.

### 5.2 🔴 CRÍTICO — `redirectTo` hardcodeado en el código

| Archivo:línea | Valor | Qué es |
|---|---|---|
| `login.html:457` | `https://mdqclio.github.io/SGH/reset-password.html` | destino del mail de **reset de contraseña** |
| `supabase/functions/invite-user/index.ts:53` | `https://mdqclio.github.io/SGH/reset-password.html` | destino del mail de **invitación** (default de `INVITE_REDIRECT_URL`) |

La Edge Function `invite-user` está **desplegada y ACTIVA** (v3, `verify_jwt: true`) y su
código en prod es idéntico al del repo — verificado. El default se pisa con la env
`INVITE_REDIRECT_URL`, que **no se puede leer por MCP**: hay que confirmar en el Dashboard
(Edge Functions → invite-user → Secrets) si está seteada y con qué valor.

Arreglo recomendado (sin re-deploy urgente): setear las envs

```
INVITE_REDIRECT_URL     = https://sigh.com.ar/reset-password.html
INVITE_ALLOWED_ORIGINS  = https://sigh.com.ar,https://mdqclio.github.io
```

y en un segundo tiempo actualizar los defaults del repo para que el código no mienta.

`login.html:457` sí requiere edición de código + push.

### 5.3 🔴 CRÍTICO — CORS de la Edge Function `invite-user`

`supabase/functions/invite-user/index.ts:55`:

```ts
const ALLOWED_ORIGINS = (Deno.env.get('INVITE_ALLOWED_ORIGINS') ?? 'https://mdqclio.github.io')
```

y `:136-138` devuelve `Access-Control-Allow-Origin: <origin si está en la lista, si no ALLOWED_ORIGINS[0]>`.

Se la llama **desde el browser** en dos lugares:
- `usuarios.html:359` — `sb.functions.invoke('invite-user', …)`
- `admin.html:611` — idem (alta de admin de hipódromo)

Desde `https://sigh.com.ar` el preflight recibe `Allow-Origin: https://mdqclio.github.io`
→ **el browser bloquea la respuesta**. Síntoma: invitar usuarios deja de andar con un error
de red opaco (supabase-js no distingue CORS de caída).

Arreglo: la env `INVITE_ALLOWED_ORIGINS` de §5.2. Sin re-deploy.

`reunion-json` **no está afectada**: es server-to-server (token Bearer), no emite headers CORS
ni los necesita — no la llama ningún browser.

### 5.4 🔴 CRÍTICO — Cloudflare Turnstile: allowlist de hostnames

Esto no aparece en ningún `grep` de `mdqclio` y es el que más silenciosamente rompe todo.

| Archivo | Uso |
|---|---|
| `login.html:262,282` | site key `0x4AAAAAAEFtOBOaoVEG7A6C` — bloquea `signInWithPassword` **y** `resetPasswordForEmail` |
| `solicitar-acceso.html:265,270` | misma site key — bloquea el `signUp` de autoregistro |

Turnstile valida el **hostname** del widget contra la lista del site key en el dashboard de
Cloudflare. `sigh.com.ar` no está. Resultado: el token no valida y GoTrue devuelve
**`captcha_failed`** → **nadie puede loguearse ni pedir acceso**. Rompe el login entero,
no un flujo lateral.

Arreglo: Cloudflare → Turnstile → ese widget → Domains → agregar `sigh.com.ar`
(y `www.sigh.com.ar` si se habilita www). **Dejar también `mdqclio.github.io`** durante la
transición. Es cambio de dashboard, instantáneo, sin deploy.

### 5.5 🟠 ALTO — `manifest.json`: paths absolutos con `/SGH/`

```json
"start_url": "/SGH/login.html",
"scope":     "/SGH/",
```

En raíz, `/SGH/` **no existe**. El manifest queda con scope inválido → la PWA no instala,
y a quien ya la tenga instalada le abre un 404.

Arreglo:

```json
"start_url": "/login.html",
"scope":     "/",
```

Referenciado por `<link rel="manifest">` en al menos 10 páginas (`index`, `login`,
`reset-password`, `admin`, `usuarios`, `reuniones`, `jockeys`, `categorias`,
`inscripciones`, `solicitar-acceso`, …). No hay service worker en el repo, así que no hay
caché vieja que purgar.

### 5.6 🟠 ALTO — mensaje de WhatsApp de aprobación

`solicitudes.html:137`:

```js
const LOGIN_URL = 'https://mdqclio.github.io/SGH/login.html';
```

Se usa en `msgAprobado()` (`:144`) — el texto de WhatsApp que la secretaría le manda a la
persona aprobada. Sigue funcionando por el 301, pero es el link que ve un usuario final:
conviene que diga el dominio nuevo desde el día 1.

### 5.7 🟡 MEDIO — probes de `tests/` (10 archivos)

Todos apuntan a prod por default:

| Archivo:línea |
|---|
| `tests/smoke_full.mjs:30` |
| `tests/smoke_t9_t16.mjs:26` |
| `tests/probe_estado_pista.mjs:24` |
| `tests/probe_tiempo_ganador.mjs:56` |
| `tests/probe_modelo_chapa.mjs:41` |
| `tests/probe_nav_dirty.mjs:31` |
| `tests/probe_dividendos_inline.mjs:47` |
| `tests/probe_no_largo.mjs:36` |
| `tests/probe_vacante_vac.mjs:16,41` |
| `tests/probe_alineado_browser.mjs:33` (default de `--url`) |
| `tests/probe_badge_overlap_browser.mjs:32` (default de `--url`) |

No rompen (301 los sigue), pero pagan un hop y dejan de reflejar la realidad. Cambio
mecánico. Oportunidad: centralizar en una constante `BASE_HOST` compartida en vez de repetir
la URL en once archivos.

### 5.8 🟢 BAJO — no se tocan

- `package.json:14,21,23` → apuntan a `github.com/mdqclio/SGH` (repo, no sitio). **Correcto como está.**
- `docs/SERVER.md:17` → `raw.githubusercontent.com/mdqclio/SGH/...` (el asesor lee los `.md`). **No cambia.**
- Todos los `href` relativos entre páginas. **Funcionan igual en raíz.**
- `supabase/functions/reunion-json/` — server-to-server, sin CORS ni redirects.
- No hay `<base href>`, ni `og:url`, ni `canonical`, ni sitemap, ni robots.txt: nada que actualizar ahí.

### 5.9 📄 Documentación — 24 archivos, ~35 menciones

Ninguna rompe nada; son referencias en texto. Actualizar por prolijidad, no por urgencia:

`CLAUDE.md:293` · `README.md:13` · `docs/SPEC.md:13` · `docs/ESTADO.md:202` ·
`docs/CONTEXTO.md:35` · `docs/PREGUNTAS_ABIERTAS.md:43` · `docs/SEC_RLS_FASE1.md:170` ·
`docs/MERGE_CLEANUP_2026-08-04.md:57` · `docs/SNIPPETS.md:175` ·
`docs/AUTOREGISTRO_GATE_0.md:24,25,174,179` · `docs/AUTOREGISTRO_GATE_3.md:166` ·
`docs/ALTA_FEDE.md:141` · `docs/RELEVAMIENTO_EMAIL_2026-08-19.md:41` ·
`docs/PROBE_RUN_1.md:231,341` · `docs/PROBE_TEMPLATE_ES.md:130` ·
`docs/SCRUB_PII_APLICADO.md:86` · `docs/SCRUB_PII_PROPUESTA.md:34` ·
`docs/AUDITORIA_PII_2026-08-20.md:4,109,305` · `docs/auditoria/SGH.md:5` ·
`docs/auditoria/SGH-REMEDIACION.md:5,121,137,146` · `SECURITY_AUDIT.md:5` ·
`REMEDIACION_RESULTADO.md:280,284`

(Los de `auditoria/`, `SECURITY_AUDIT.md` y `REMEDIACION_RESULTADO.md` son `github.com/mdqclio/SGH`
= repo → no se tocan. `CLAUDE.md:293` es el bloque **Deploy**: ese sí conviene actualizarlo.)

---

## 6. Orden de ejecución sugerido

Los pasos 1–3 son **aditivos y reversibles**: no rompen el sitio actual. Recién el 4 cambia
el host servido.

1. **Cloudflare Turnstile** → agregar `sigh.com.ar` al widget (dejar `mdqclio.github.io`).
2. **Supabase Auth → URL Configuration** → agregar `https://sigh.com.ar/**` a Redirect URLs
   (todavía **sin** cambiar el Site URL).
3. **Edge Function `invite-user`** → setear envs
   `INVITE_ALLOWED_ORIGINS = https://sigh.com.ar,https://mdqclio.github.io` y
   `INVITE_REDIRECT_URL = https://sigh.com.ar/reset-password.html`.
   (El redirect nuevo ya está en la allowlist por el paso 2.)
4. **DNS** → A + AAAA en el apex, CNAME de `www`. Esperar propagación (`dig`).
5. **GitHub Pages** → Settings → Pages → Custom domain `sigh.com.ar` → Save
   (esto crea el archivo `CNAME`). Esperar el certificado. Tildar **Enforce HTTPS**.
6. **Código** → `login.html:457`, `solicitudes.html:137`, `manifest.json` (`start_url` + `scope`),
   los 11 probes de `tests/`. Un commit, push, verificar en prod.
7. **Supabase Auth** → cambiar **Site URL** a `https://sigh.com.ar`.
8. **Docs** → `CLAUDE.md:293`, `README.md:13`, `docs/SPEC.md:13`, resto de §5.9.
9. Después de ~2 semanas sin incidentes: sacar `mdqclio.github.io` de la allowlist de
   Turnstile y de las Redirect URLs de Supabase.

## 7. Checklist de verificación post-corte

- [ ] `dig sigh.com.ar +short` → las 4 IPs de GitHub
- [ ] `curl -sI https://sigh.com.ar/login.html` → `200`, certificado válido
- [ ] `curl -sI https://mdqclio.github.io/SGH/login.html` → `301` a `https://sigh.com.ar/login.html`
- [ ] Login real en `sigh.com.ar` (valida Turnstile en el dominio nuevo)
- [ ] "Olvidé mi contraseña" → el mail llega con link a `sigh.com.ar/reset-password.html`
- [ ] Invitar un usuario de prueba desde `usuarios.html` → sin error de CORS en la consola,
      y el link del mail apunta a `sigh.com.ar`
- [ ] Completar esa invitación de punta a punta (el escenario "se registra y no puede completar")
- [ ] `solicitar-acceso.html` → alta con captcha OK
- [ ] Instalar la PWA desde `sigh.com.ar` → abre en `/login.html`
- [ ] `node tests/smoke_full.mjs` contra la URL nueva

---

## 8. Riesgo residual / lo que no pude verificar desde acá

- **Site URL y Redirect URLs actuales de Supabase Auth**: no son legibles por MCP ni por SQL
  (viven en la config de GoTrue, no en la DB). Hay que abrir el Dashboard.
- **Valores reales de las envs de `invite-user`** (`INVITE_REDIRECT_URL`,
  `INVITE_ALLOWED_ORIGINS`): los secrets de Edge Functions no se pueden leer, sólo escribir.
  El plan asume el peor caso (que estén sin setear y corra el default `mdqclio.github.io`).
- **Plantillas de mail de Auth** (Dashboard → Authentication → Email Templates): si alguna
  tiene una URL escrita a mano en vez de `{{ .ConfirmationURL }}`, hay que corregirla. No es
  inspeccionable desde el repo.
- **Lista de dominios del widget de Turnstile**: sólo visible en el dashboard de Cloudflare.
