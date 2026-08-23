# Tarea 3 — Secrets de `invite-user`

Extracto de la [checklist completa](CHECKLIST_DOMINIO_SIGH.md) (tarea 3 de 12).
Migración `mdqclio.github.io/SGH` → `sigh.com.ar`.

---

## ¿Se puede hacer ahora?

**SÍ. 🟢 No espera al DNS.**

Es aditivo y reversible: no toca el sitio que está andando hoy. Hacerlo antes del corte
es lo correcto — así, en el momento en que `sigh.com.ar` empiece a servir, la función
ya está lista.

Dejar `mdqclio.github.io` en la lista de origins hace que **las dos ventanas funcionen
al mismo tiempo** durante la transición.

---

## Dónde se hace

Dashboard de Supabase → proyecto **`unlhcuanfrtpatoipwve`** → **Edge Functions** →
pestaña **Secrets**.

(Según la versión del panel puede estar en **Project Settings → Edge Functions → Secrets**.
Es el mismo lugar: son secrets **de proyecto**, compartidos por todas las funciones,
no por función.)

---

## ⚠️ Antes de guardar: anotar los valores viejos

**Los secrets de Supabase no se pueden volver a leer una vez guardados.** El panel muestra
el nombre, no el valor. Si pisás una variable sin anotar lo que tenía, ese valor se perdió
y no hay rollback.

Si las variables ya existen, copiá el valor actual acá antes de tocar nada:

- `INVITE_ALLOWED_ORIGINS` antes: `________________________`
- `INVITE_REDIRECT_URL` antes: `________________________`

Si no existen, escribí "no existían" — también es información: significa que la función
está corriendo con los defaults del código.

---

## Qué poner

Dos variables:

| Nombre | Valor exacto |
|---|---|
| `INVITE_ALLOWED_ORIGINS` | `https://sigh.com.ar,https://mdqclio.github.io` |
| `INVITE_REDIRECT_URL` | `https://sigh.com.ar/reset-password.html` |

Para copiar y pegar:

```
INVITE_ALLOWED_ORIGINS
https://sigh.com.ar,https://mdqclio.github.io
```

```
INVITE_REDIRECT_URL
https://sigh.com.ar/reset-password.html
```

**Formato — los tres errores que rompen esto en silencio:**

- Sin espacios alrededor de la coma. `a.com, b.com` **no matchea**: el segundo origen
  queda con un espacio adelante y la comparación es exacta.
- Sin barra final. `https://sigh.com.ar/` **no es** `https://sigh.com.ar`.
- Con `https://` adelante. El origin de un preflight CORS siempre incluye el esquema.

---

## Por qué

La Edge Function `invite-user` está **viva** (v3, `verify_jwt: true`) y la llama el
**browser**, no un server:

- `usuarios.html:359` — `sb.functions.invoke('invite-user', …)`
- `admin.html:611` — idem, alta de admin de hipódromo

Sus defaults están hardcodeados en `supabase/functions/invite-user/index.ts`:

```ts
// :53
const REDIRECT_URL = Deno.env.get('INVITE_REDIRECT_URL')
  ?? 'https://mdqclio.github.io/SGH/reset-password.html';

// :55
const ALLOWED_ORIGINS = (Deno.env.get('INVITE_ALLOWED_ORIGINS')
  ?? 'https://mdqclio.github.io').split(',').map(s => s.trim()).filter(Boolean);
```

Sin las envs, desde `https://sigh.com.ar` pasan dos cosas:

1. **CORS**: el preflight recibe `Access-Control-Allow-Origin: https://mdqclio.github.io`
   y el browser bloquea la respuesta. Síntoma: invitar usuarios deja de andar con un error
   de red opaco — supabase-js no distingue un bloqueo de CORS de una caída del servidor.
2. **Redirect**: el mail de invitación llega con un link al dominio viejo.

Las envs **pisan los defaults sin necesidad de re-deploy** de la función. Por eso esta
tarea es de panel y no de código.

---

## Relación con las otras tareas

- **Depende de la tarea 2** (Supabase Auth → Redirect URLs). El `INVITE_REDIRECT_URL` que
  ponés acá tiene que estar en la allowlist de Auth, si no GoTrue lo ignora en silencio y
  manda al Site URL. Hacé la 2 primero, o las dos en la misma sesión.
- **No tiene nada que ver con el DNS.** Se puede hacer semanas antes del corte.
- **El código NO se toca en esta tarea.** Los defaults de `index.ts:53,55` siguen diciendo
  `mdqclio.github.io` a propósito: alinearlos requiere re-deploy de la función, que es un
  pase aparte con su propio riesgo. Quedan como red por si algún día faltan las envs.

---

## Rollback

Volver a poner el valor anotado arriba. Si las variables no existían, borrarlas — la función
vuelve a correr con los defaults del código.

Efecto inmediato, sin re-deploy.

---

## Verificación

No se puede verificar desde el panel (los secrets no se leen). Se verifica **en uso**, y
recién después del corte:

- [ ] Invitar un usuario de prueba desde `usuarios.html` estando en `https://sigh.com.ar`
- [ ] Consola del browser: **sin** error de CORS
- [ ] El mail llega con link a `sigh.com.ar/reset-password.html`
- [ ] La invitación se completa de punta a punta y la cuenta queda activa

---

- [ ] **Tarea 3 hecha** — valores anteriores anotados (o "no existían")
