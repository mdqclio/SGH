# Diagnóstico — El logo no se ve (post-migración a sigh.com.ar)

- **Fecha**: 2026-08-30
- **SHA de trabajo**: `09ddb5b12d6ce586470eb4907c04aef2a711b580` (rama `fix/aislamiento-club-cobros`)
- **Modo**: SOLO LECTURA. No se modificó código ni base de datos.
- **Reportado por**: Fede — "no se ve el logo". Hipótesis del reporte: rutas rotas por la migración a dominio propio.

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ git rev-parse HEAD
09ddb5b12d6ce586470eb4907c04aef2a711b580
```

```sql
SELECT count(*) AS spcs_count FROM spcs;
```
```json
[{"spcs_count":181}]
```

Proyecto Supabase: `unlhcuanfrtpatoipwve` (verificado por el header `sb-project-ref` de las respuestas
del gateway, ver §6).

---

## 1. Conclusión en una línea

El logo **no** sale de un archivo referenciado en el HTML: sale del campo `clubs.logo_url` de la base,
que para Dolores vale `https://mdqclio.github.io/SGH/logo-dolores-verde.png`. Esa URL **sigue
funcionando** (301 → `sigh.com.ar`, imagen 200), pero **el navegador nunca la pide**: la
`Content-Security-Policy` que llevan todas las páginas tiene `img-src 'self' … ` y, desde que el sitio
se sirve en `sigh.com.ar`, `mdqclio.github.io` dejó de ser `'self'` y no está en la allowlist. La
imagen se bloquea **antes** del redirect.

Fede tiene razón en la causa (la migración de dominio), pero **el mecanismo no es un 404**: es CSP.
Eso importa porque cambia el arreglo: no hay ningún archivo que mover ni ninguna ruta `/SGH/` que
corregir en el HTML — hay **un valor en la base** que apunta al host viejo.

---

## 2. ¿De dónde sale el logo?

**De la tabla `clubs`, campo `logo_url`.** No es un archivo referenciado directamente por el HTML, no
es Supabase Storage, no es una URL de terceros.

```sql
SELECT id, nombre, sigla, logo_url FROM clubs ORDER BY nombre;
```

```json
[{"id":"0649e9c5-9e87-4aad-842f-101458e6b33c","nombre":"Hipódromo de Dolores","sigla":"DOL","logo_url":"https://mdqclio.github.io/SGH/logo-dolores-verde.png"},
 {"id":"710d43c1-364e-4431-99d9-c47e87242075","nombre":"Jockey Club San Francisco - Hipodromo Oscar C. Boero","sigla":"HSF","logo_url":null},
 {"id":"a6da7e40-1515-45dc-8933-4eef33ce937a","nombre":"Mi Club Hípico","sigla":"MCH","logo_url":null}]
```

Las 3 filas de `clubs`. **Solo Dolores tiene logo cargado**, y apunta al host viejo. Los otros dos
clubes tienen `logo_url = NULL` → caen por el fallback de cada página (texto o `logo192x192.png`
local), así que no muestran logo roto, muestran el fallback.

El archivo `logo-dolores-verde.png` **sí existe en el repo** (28.957 bytes, raíz) y **sí responde 200
en producción** bajo el dominio nuevo. El binario no se perdió en la migración.

### Sponsors — no afectados

`clubs.sponsors` (JSONB) también lleva `logo_url` por sponsor. El único cargado es de Dolores y apunta
a Supabase Storage, que **sí** está en la allowlist de CSP (`https://*.supabase.co`):

```json
[{"sigla":"DOL","sponsors":[{"nombre":"Agencia Hipica Dolores","logo_url":"https://unlhcuanfrtpatoipwve.supabase.co/storage/v1/object/public/public-assets/IMG_0084.JPG"}]},
 {"sigla":"HSF","sponsors":[]},{"sigla":"MCH","sponsors":[]}]
```

`curl` → `200 ct=image/jpeg sz=3793872`. **El logo del sponsor carga bien.** Solo falla el del club.

---

## 3. Por qué falla — la evidencia

### 3.1 La URL vieja no está caída

```
$ curl -s -o /dev/null -w '%{http_code} redir=%{redirect_url}' https://mdqclio.github.io/SGH/logo-dolores-verde.png
301 redir=https://sigh.com.ar/logo-dolores-verde.png

$ curl -s -o /dev/null -w '%{http_code} ct=%{content_type} sz=%{size_download}' https://sigh.com.ar/logo-dolores-verde.png
200 ct=image/png sz=28957
```

GitHub Pages mantiene el 301 desde el origen viejo preservando el path. Con `curl` la imagen llega.
**Con el navegador, no** — y esa es toda la diferencia.

### 3.2 La CSP bloquea el host viejo

Las 30 páginas HTML llevan un `<meta http-equiv="Content-Security-Policy">` con la misma directiva
(introducida en `b890f57 fix(security): quitar service_role del working tree, escapeHtml en sinks de
usuario y CSP`):

```
img-src 'self' data: blob: https://*.supabase.co https://raw.githubusercontent.com
```

Verificado **contra producción**, no solo contra el repo:

```
$ curl -s "https://sigh.com.ar/liquidaciones.html?v=$RANDOM" | grep -o 'img-src[^;]*'
img-src 'self' data: blob: https://*.supabase.co https://raw.githubusercontent.com

$ curl -s "https://sigh.com.ar/index.html?v=$RANDOM" | grep -o 'img-src[^;]*'
img-src 'self' data: blob: https://*.supabase.co https://raw.githubusercontent.com
```

El razonamiento completo:

| Momento | Origen de la página | `'self'` resuelve a | ¿`mdqclio.github.io/SGH/logo…png` pasa CSP? |
|---|---|---|---|
| Antes de la migración | `https://mdqclio.github.io/SGH/` | `https://mdqclio.github.io` | **SÍ** — mismo origen |
| Hoy | `https://sigh.com.ar/` | `https://sigh.com.ar` | **NO** — host distinto, no allowlisted |

CSP evalúa la **URL inicial** del pedido, no el destino final del redirect. Como
`https://mdqclio.github.io` no coincide con `'self'` ni con ninguna de las otras tres fuentes, el
navegador **cancela el pedido**; el 301 nunca llega a seguirse. En la consola aparece como
`Refused to load the image … because it violates the following Content Security Policy directive:
"img-src 'self' …"`.

Ninguna de las páginas tiene `onerror` en el `<img>` del logo del club, así que el resultado visible
es el ícono de imagen rota / hueco vacío, no un fallback.

### 3.3 Confirmación de que `/SGH/` ya no existe en el dominio nuevo

```
$ curl -s -o /dev/null -w '%{http_code}' https://sigh.com.ar/SGH/logo-dolores-verde.png
404
```

Es decir: **aunque la CSP dejara pasar el host viejo**, cualquier ruta hardcodeada a
`sigh.com.ar/SGH/...` daría 404. Hoy no hay ninguna así (§5), pero conviene tenerlo escrito.

---

## 4. Dónde aparece el logo del club — pantalla por pantalla

Los 8 consumidores de `clubs.logo_url`. **Todos rotos hoy**, por la misma causa única (CSP), no por
rutas distintas.

| # | Pantalla / documento | Archivo:línea (query) | Archivo:línea (`<img>`) | ¿Carga hoy? |
|---|---|---|---|---|
| 1 | **Encabezado de la app** (sidebar del dashboard) | `index.html:217` | `index.html:229` | ❌ NO |
| 2 | **Carta de llamados** (imprimible) | `carta-llamados.html:693` | `carta-llamados.html:894-896` | ❌ NO |
| 3 | **Programa** (modal / impresión) | `programa.html:201` | `programa.html:316-317` | ❌ NO |
| 4 | **Programa oficial B&N** (PDF) | `programa-oficial.html` (fetch de `club`) | `programa-oficial.html:306` | ❌ NO |
| 5 | **Programa oficial color** (PDF) | `programa-oficial-color.html` (fetch de `club`) | `programa-oficial-color.html:460-461` | ❌ NO |
| 6 | **Recibo impreso** (Pagos, Fase 4) | `liquidaciones.html:1205` | `liquidaciones.html:1233` + `precargarLogo` en `:1259` | ❌ NO |
| 7 | **PDF de inscriptos** (pie) | `inscripciones.html:749` | `inscripciones.html:918-919` | ❌ NO |
| 8 | **PDF de ratificación** (pie) | `ratificacion.html:282` | `ratificacion.html:441-442` | ❌ NO |
| 9 | **Admin → Mi Hipódromo** (preview del logo) | `admin.html:758` | `admin.html:766` | ❌ NO |

Detalle del caso 6 (recibo): `precargarLogo()` en `liquidaciones.html:666-672` crea un `new Image()`
y espera `onload`/`onerror` con timeout de 1000 ms antes de `window.print()`. Con la CSP bloqueando,
dispara `onerror` inmediatamente y el recibo se imprime **sin logo, sin error visible y sin demora**.
Por eso el síntoma es silencioso.

### Lo que NO está roto

| Elemento | Ruta | ¿Carga? |
|---|---|---|
| Favicon de todas las páginas | `logo32x32.png` (relativa) | ✅ 200 |
| Apple touch icon | `logo180x180.png` (relativa) | ✅ 200 |
| Íconos PWA del manifest | `logo192x192.png`, `logo512x512.png` (relativas) | ✅ 200 |
| Fallback del dashboard sin `logo_url` | `logo192x192.png` (relativa) | ✅ 200 |
| Tapas del programa oficial color | `assets/programa-oficial-color/tapa-01.jpg` (relativa) | ✅ 200 |
| Logo del sponsor de Dolores | Supabase Storage | ✅ 200 |

Todos son **rutas relativas** o hosts allowlisted. La migración no los tocó: con dominio propio el
sitio vive en la raíz y las relativas siguen resolviendo igual.

`manifest.json` ya está corregido (`"start_url": "/login.html"`, `"scope": "/"`) y responde 200 en
producción — ese `/SGH/` ya se arregló en el pase de dominio.

---

## 5. Otras rutas rotas por el mismo motivo

Barrido completo: `grep -rn "/SGH/"` y `grep -rn "mdqclio"` sobre `*.html`, `*.js`, `*.json`, `*.ts`.
Además, `grep -rnoE '(src|href)="/[^"]*"' --include="*.html"` → **cero resultados**: no queda ninguna
ruta absoluta con `/` inicial en el HTML. Todo el HTML usa rutas relativas.

Lo único que queda apuntando al origen viejo:

| Archivo:línea | Valor actual | Estado real | Riesgo |
|---|---|---|---|
| **base de datos** `clubs.logo_url` (fila DOL) | `https://mdqclio.github.io/SGH/logo-dolores-verde.png` | **ROTO en el navegador** (CSP) | 🔴 **Es el bug reportado** |
| `supabase/functions/invite-user/index.ts:53` | default de `REDIRECT_URL` = `https://mdqclio.github.io/SGH/reset-password.html` | Default obsoleto en el fuente; la función desplegada usa el env `INVITE_REDIRECT_URL` | 🟠 Bomba de tiempo: un redeploy sin ese env manda los mails de invitación al host viejo |
| `supabase/functions/invite-user/index.ts:55` | default de `ALLOWED_ORIGINS` = `https://mdqclio.github.io` | Default obsoleto; el desplegado **sí** acepta `sigh.com.ar` (verificado, §6) | 🟠 Mismo riesgo: redeploy sin env → CORS bloquea invitar usuarios desde sigh.com.ar |
| `README.md:13` | `**App en vivo**: https://mdqclio.github.io/SGH/` | Documentación desactualizada | 🟢 Cosmético |
| `package.json:14, 21, 23` | `https://github.com/mdqclio/SGH…` | **Correctos** — son URLs del repo en GitHub, no del sitio | 🟢 No tocar |
| `docs/SERVER.md:17` | `raw.githubusercontent.com/mdqclio/SGH/...` | **Correcto** — es cómo el asesor lee los `.md` | 🟢 No tocar |
| `docs/*.md` (≈20 archivos) | menciones históricas a `mdqclio.github.io/SGH/` | Bitácoras: fotos de su fecha | 🟢 Por convención de CLAUDE.md no se reescriben |

Ya arreglado en el pase de dominio (verificado, sin hallazgos): `login.html` (redirect de reset de
contraseña), `solicitudes.html` (`LOGIN_URL`), `manifest.json` (`start_url` + `scope`). No queda
ningún `mdqclio` en el HTML servido.

---

## 6. Verificación del Edge Function (por qué el riesgo es 🟠 y no 🔴)

Preflight CORS real contra la función desplegada:

```
$ curl -s -i -X OPTIONS https://unlhcuanfrtpatoipwve.supabase.co/functions/v1/invite-user \
    -H "Origin: https://sigh.com.ar" -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: authorization,content-type"
HTTP/2 204
access-control-allow-origin: https://sigh.com.ar
sb-project-ref: unlhcuanfrtpatoipwve
```

Control con el origen viejo:

```
$ curl … -H "Origin: https://mdqclio.github.io"
HTTP/2 204
access-control-allow-origin: https://mdqclio.github.io
```

**Los dos orígenes están permitidos** → el env `INVITE_ALLOWED_ORIGINS` está seteado en producción con
ambos. El fuente miente, el deploy está bien. Por eso invitar usuarios funciona hoy.

**Pregunta abierta**: no pude verificar el valor real de `INVITE_REDIRECT_URL` sin disparar una
invitación (sería una escritura). El CORS estando bien seteado es evidencia indirecta de que el
redirect también lo está, pero **no es prueba**. Ver §8.

---

## 7. Tabla de cierre

| Archivo | Línea | Ruta actual | ¿Carga? | Ruta que debería tener |
|---|---|---|---|---|
| **`clubs.logo_url` (DB, fila DOL)** | — | `https://mdqclio.github.io/SGH/logo-dolores-verde.png` | ❌ **NO** (CSP) | `https://sigh.com.ar/logo-dolores-verde.png` |
| `index.html` | 229 | consume `logo_url` | ❌ NO | sin cambio — se arregla solo al corregir la DB |
| `carta-llamados.html` | 894-896 | consume `logo_url` | ❌ NO | sin cambio |
| `programa.html` | 316-317 | consume `logo_url` | ❌ NO | sin cambio |
| `programa-oficial.html` | 306 | consume `logo_url` | ❌ NO | sin cambio |
| `programa-oficial-color.html` | 460-461 | consume `logo_url` | ❌ NO | sin cambio |
| `liquidaciones.html` | 1233 (+ 1259) | consume `logo_url` | ❌ NO | sin cambio |
| `inscripciones.html` | 918-919 | consume `logo_url` | ❌ NO | sin cambio |
| `ratificacion.html` | 441-442 | consume `logo_url` | ❌ NO | sin cambio |
| `admin.html` | 766 | consume `logo_url` (preview) | ❌ NO | sin cambio |
| `supabase/functions/invite-user/index.ts` | 53 | `'https://mdqclio.github.io/SGH/reset-password.html'` | ⚠️ default obsoleto (env lo tapa) | `'https://sigh.com.ar/reset-password.html'` |
| `supabase/functions/invite-user/index.ts` | 55 | `'https://mdqclio.github.io'` | ⚠️ default obsoleto (env lo tapa) | `'https://sigh.com.ar'` |
| `README.md` | 13 | `https://mdqclio.github.io/SGH/` | 🟢 doc | `https://sigh.com.ar/` |
| `package.json` | 14, 21, 23 | `github.com/mdqclio/SGH` | ✅ correcto | **no tocar** |
| `manifest.json` | 5, 9 | `/login.html`, `/` | ✅ correcto | ya arreglado |
| `logo32x32/180/192/512.png`, `assets/**` | varias | relativas | ✅ 200 | ya correctas |

**Una sola fila de la tabla explica el síntoma que reportó Fede.** Las 9 pantallas rotas son
consecuencia de ese único valor.

---

## 8. Preguntas abiertas

1. **`https://sigh.com.ar/…` vs ruta relativa.** `logo_url` se inyecta en `src` de un `<img>` y todas
   las páginas viven en la raíz, así que `logo-dolores-verde.png` a secas también funcionaría y sería
   inmune a un futuro cambio de dominio. Contra: `admin.html:174/253` ofrece el campo como
   `<input type="url">` con placeholder `https://raw.githubusercontent.com/...`, o sea el diseño
   asume URL absoluta, y un `type="url"` **rechaza** un valor relativo en la validación del form.
   Decidir cuál de las dos. La conservadora es la absoluta a `sigh.com.ar`.
2. **¿Se corrige también el `logo_url` de los otros dos clubes?** Hoy son `NULL`, no hay nada que
   corregir, pero cuando San Francisco cargue el suyo va a chocar con la misma CSP si usa un host no
   allowlisted. ¿Conviene documentar los hosts válidos (`sigh.com.ar`, `*.supabase.co`,
   `raw.githubusercontent.com`) en el label del campo en `admin.html`?
3. **`INVITE_REDIRECT_URL`** — verificar el valor real del env en el dashboard de Supabase. Si quedó
   con el host viejo, los mails de invitación llevan a `mdqclio.github.io/SGH/reset-password.html`,
   que hoy 301-ea a `sigh.com.ar` — funcionaría, pero depende de que GitHub mantenga el redirect
   indefinidamente.
4. **¿Cuánto hace que está roto?** El logo se rompió el día del pase de dominio, no antes. Vale
   preguntarle a Fede desde cuándo lo nota, para descartar que haya un segundo síntoma anterior
   mezclado en el mismo reporte.
5. **Nada de esto se aplicó.** El fix es un `UPDATE` de una fila de `clubs` — escritura en producción,
   fuera del alcance de este diagnóstico (regla dura: solo lectura). Requiere OK explícito.
