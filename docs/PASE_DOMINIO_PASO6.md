# Pase — paso 6: el código apunta a `sigh.com.ar`

**Rama**: `chore/dominio-sigh-com-ar` · **Base**: `main @ 544579e` · **Fecha**: 2026-08-23
**Estado**: preparado, **sin pushear**. Espera el corte de DNS.

> Este doc es el inventario del pase. Sirve para mergear sin volver a revisar el diff entero.

---

## Precondición dura

**No mergear hasta que `https://sigh.com.ar/login.html` devuelva 200 con certificado válido.**

Motivo: el pase cambia el `redirectTo` del reset de contraseña a un dominio que, antes del
corte, no resuelve. Mergeado antes de tiempo, el mail de recuperación llega con un link
muerto — y es un flujo que la secretaría usa.

Chequeo de una línea antes de mergear:

```bash
curl -sI https://sigh.com.ar/login.html | head -1    # tiene que decir 200
```

---

## Alcance: 14 archivos, 16 líneas, 0 lógica

Todos los cambios son **reemplazo de string literal**. No se tocó ninguna función, ninguna
condición, ningún flujo. `node --check` pasa en los 11 probes; `manifest.json` parsea.

### Funcional — 3 archivos

| Archivo:línea | Antes | Después |
|---|---|---|
| `login.html:457` | `redirectTo: 'https://mdqclio.github.io/SGH/reset-password.html'` | `redirectTo: 'https://sigh.com.ar/reset-password.html'` |
| `solicitudes.html:137` | `LOGIN_URL = 'https://mdqclio.github.io/SGH/login.html'` | `LOGIN_URL = 'https://sigh.com.ar/login.html'` |
| `manifest.json:5` | `"start_url": "/SGH/login.html"` | `"start_url": "/login.html"` |
| `manifest.json:9` | `"scope": "/SGH/"` | `"scope": "/"` |

- **`login.html`** — destino del mail de "olvidé mi contraseña". Requiere que
  `https://sigh.com.ar/**` esté en las Redirect URLs de Supabase Auth (paso 2 de tu
  checklist). Si no está, GoTrue ignora el `redirectTo` y manda al Site URL.
- **`solicitudes.html`** — sólo texto: el link que va dentro del WhatsApp que la secretaría
  le manda a quien aprueba. No afecta ninguna llamada a la API.
- **`manifest.json`** — los dos paths absolutos con `/SGH/`. Es el cambio que **no** viene de
  buscar `mdqclio`: con dominio propio el sitio sirve en la raíz, así que `/SGH/` deja de
  existir. Con esto la PWA vuelve a instalar. No hay service worker en el repo, así que no
  queda caché vieja que purgar.

### Probes — 11 archivos, 12 líneas

Mismo reemplazo en todos: `https://mdqclio.github.io/SGH` → `https://sigh.com.ar`.

`tests/smoke_full.mjs:30` · `tests/smoke_t9_t16.mjs:26` · `tests/probe_estado_pista.mjs:24` ·
`tests/probe_tiempo_ganador.mjs:56` · `tests/probe_modelo_chapa.mjs:41` ·
`tests/probe_nav_dirty.mjs:31` · `tests/probe_dividendos_inline.mjs:47` ·
`tests/probe_no_largo.mjs:36` · `tests/probe_vacante_vac.mjs:16 (comentario), 41` ·
`tests/probe_alineado_browser.mjs:33` · `tests/probe_badge_overlap_browser.mjs:32`

Los que tienen `--url` o `--prod` conservan el flag: sólo cambia el default.

---

## Qué NO entra en este pase — y por qué

| Queda afuera | Motivo |
|---|---|
| `supabase/functions/invite-user/index.ts:53,55` (defaults `INVITE_REDIRECT_URL` / `INVITE_ALLOWED_ORIGINS`) | En runtime mandan **las envs**, no estos defaults. Cambiar el archivo no tiene efecto sin re-deploy de la función, y el re-deploy es una acción aparte con su propio riesgo. Los defaults quedan como red por si alguna vez faltan las envs. **Follow-up**: alinearlos en un pase propio, junto con el re-deploy. |
| Site URL de Supabase Auth | Paso 7, panel, después del corte. |
| Docs (~35 menciones en 24 archivos) | Paso 8. Cosmético, no rompe nada, y meterlo acá enterraría el diff funcional en ruido. |
| Sacar `mdqclio.github.io` de Turnstile y de la allowlist de Auth | Paso 9, a las ~2 semanas del corte. |
| Centralizar la URL de los probes en una constante compartida | Refactor, no migración. Se anotó como oportunidad en el plan; no se hace acá para que el pase siga siendo un reemplazo mecánico auditable de un vistazo. |
| `package.json`, `docs/SERVER.md` | Apuntan a `github.com/mdqclio/SGH` y `raw.githubusercontent.com` — el **repo**, no el sitio. Correctos como están. |

---

## Merge

```bash
git checkout main
git merge --no-ff chore/dominio-sigh-com-ar
git push origin main
```

## Verificación post-merge

- [ ] `curl -s https://sigh.com.ar/manifest.json | grep start_url` → `/login.html`
- [ ] `curl -s https://sigh.com.ar/login.html | grep redirectTo` → `sigh.com.ar/reset-password.html`
- [ ] Reset de contraseña real: el mail llega con link a `sigh.com.ar` y **completa**
- [ ] Instalar la PWA desde `sigh.com.ar` → abre en `/login.html`
- [ ] `node tests/smoke_full.mjs`

## Rollback

```bash
git revert -m 1 <sha-del-merge>
```

Sin estado en DB, sin migraciones, sin deploy de funciones: el revert alcanza y deja todo
como estaba. Y aun revertido el sitio sigue andando en `sigh.com.ar` — el 301 de
`mdqclio.github.io/SGH` cubre las URLs viejas en las dos direcciones.
