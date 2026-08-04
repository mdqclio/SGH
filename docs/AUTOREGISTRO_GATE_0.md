# Gate 0 — Contención · auto-registro

**Fecha**: 2026-08-04 · **Rama**: `sec/autoregistro-gate-0` · **Base**: `main` @ `3c2abaf`
**Guard**: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** antes y después ✅
**Alcance**: sólo HTML estático. **Cero schema, cero policies, cero funciones, cero datos.**
**Rollback**: commiteado **antes** de aplicar → `docs/ROLLBACK_GATE_0.md` (`5f7298b`).

---

## 🔧 Corrección al plan: el link ya estaba sacado

`AUTOREGISTRO_PLAN.md` §C.4 y §D.1 afirman que `registro-profesional.html` estaba **linkeada desde `login.html`**. **Es incorrecto.** Mi `grep` matcheó un **comentario**, no un `href`:

```html
<!-- El link a registro-profesional.html se sacó al pasar a alta por invitación
     cerrada (etapa (b), adelanto de (d) del plan docs/plan_alta_invitacion.md). -->
```

El link se había removido en una pasada anterior. Verificado ahora: **cero `href` y cero redirects JS** hacia esas páginas en todo el repo.

**Pero el riesgo era real igual, y por otro motivo**: GitHub Pages sirve *todos* los archivos del repo. Las dos páginas respondían **HTTP 200 por URL directa**:

```
https://mdqclio.github.io/SGH/registro-profesional.html  → 200
https://mdqclio.github.io/SGH/registro.html             → 200
```

O sea: sacar el link **no alcanzaba**. Cualquiera con la URL —o un crawler, o alguien que la tenía en favoritos de cuando sí estaba linkeada— llegaba al formulario que hacía `signUp` y después intentaba crear la ficha solo. Por eso el Gate 0 neutraliza el **archivo**, no el link.

---

## Qué se hizo

### 0.1 · `registro-profesional.html` neutralizada

Reemplazada por una pantalla estática. De **306 líneas a 65**.

| antes | después |
|---|---|
| `sb.auth.signUp()` + 3 `insert` (`usuarios`, `propietarios`, `profesionales`) | sin JS |
| CSP con `script-src`, `connect-src https://*.supabase.co` | `default-src 'none'`, sin `script-src`, sin `connect-src` |
| creaba la ficha sola, sin validación | explica que el alta la habilita la secretaría |

Verificado: `<script>` = 0 · `supabase` = 0 · `signUp` = 0 · `.from(` = 0.

Mantiene el look de SGH, `noindex, nofollow`, y un botón a `login.html`.

### 0.2 · `registro.html` dada de baja *(respuesta 4)*

Mismo tratamiento. Era el **alta de hipódromo auto-servicio**: hacía `signUp` e insertaba en `clubs` + `usuarios` + `categorias_carrera`. De 274 líneas a 63, sin JS.

No estaba linkeada desde ningún lado, pero también respondía 200.

> El nombre `registro.html` queda **ocupado**. El formulario nuevo del Gate 3 se va a llamar **`solicitar-acceso.html`**.

### 0.3 · Comentario de `login.html` actualizado

`login.html` **no cambió de comportamiento** (sigue con sus 2 `<script>` intactos). Sólo se actualizó el comentario, que decía *"La página NO se borró: se decide en la etapa (d)"* — ya está decidido.

### 0.4 · Cuentas huérfanas de `auth.users` — **decisión: no se tocan**

5 cuentas en total, **2 sin fila en `usuarios`**:

| cuenta | creada | último login | email confirmado | ficha asociada |
|---|---|---|---|---|
| `s***@sgh.com` | 2026-04-22 | **nunca** | ❌ no | ninguna |
| `c***@mdq.com.ar` | 2026-04-22 | **nunca** | ❌ no | ✅ hay un `propietarios` con ese email |

**No se borran en este gate**, y es una decisión, no una omisión:

- Borrar cuentas de `auth.users` es **irreversible** y no estaba autorizado explícitamente.
- Son **inofensivas**: sin fila en `usuarios`, no ven nada (`AUTOREGISTRO_PLAN` §C.7). El único hueco que les queda —`performances` y `sanciones`— se cierra en el Gate 1.
- Ninguna inició sesión jamás ni confirmó el email.
- La segunda **tiene ficha de propietario con ese mismo email**: puede ser una persona real que intentó registrarse en abril. Borrarla destruye esa señal.

**Propuesta para cuando esté el Gate 2**: convertirlas en filas de `solicitudes_acceso` para que Yesi las resuelva por el circuito normal, o borrarlas ahí. Cualquiera de las dos, con gate propio.

---

## Decisiones registradas *(tus cuatro respuestas + contexto nuevo)*

| # | decisión | impacto en el plan |
|---|---|---|
| 1 | Pantalla del pendiente: **sólo estado**, sin programa público | Se cae `fn_programa_publico()` del Gate 2. Menos superficie, menos código |
| 2 | Rechazo: **teléfono/WhatsApp de Yesi**, sin mail automático | No se toca el sistema de mails. El motivo igual se guarda en `solicitudes_acceso.motivo_rechazo` y se muestra en pantalla |
| 3 | **Propietarios entran desde el día uno**, junto con entrenadores | Ver abajo |
| 4 | `registro.html` de baja | ✅ hecho en este gate |

### Sobre la respuesta 3 — el contexto cambia el diseño de la bandeja

Los pilotos reales son **familiares de Fede con stud y caballos propios**: son **propietarios**, no entrenadores. Arrancar sólo con entrenadores dejaba afuera justo a los pilotos.

Consecuencias concretas:

- **El matcheo por DNI arranca con trabajo real.** Probablemente ya existan como `propietarios`/`caballerizas` de la carga de junio. Y `propietarios` tiene **220/220 con DNI, todos distintos** → el caso "EXACTO" va a ser el habitual. Buen estrés-test de la bandeja desde el día uno.
- **El control de la plata no es el rol**: es que cada aprobación pasa por Yesi a mano. El diseño ya lo garantiza por construcción (`AUTOREGISTRO_PLAN` §C.8).

### Regla nueva — los curiosos

Entre los invitados de Fede puede haber gente sin caballos. **Regla**: se registran, quedan **pendientes**, **no se aprueban**, y se barren después.

Requisito de diseño que esto agrega al Gate 2/3, y que no estaba:

- La bandeja tiene que **bancar solicitudes que nunca se van a aprobar sin molestar**. O sea: los pendientes **no** son una cola que hay que vaciar.
- Se agrega un tercer estado de resolución, **`descartada`** (distinto de `rechazada`): "no corresponde, no hace falta avisar a nadie". Con acción masiva (seleccionar varias → descartar).
- El contador de `index.html` debe distinguir **"pendientes"** de **"pendientes sin revisar"**, para que 20 curiosos sin revisar no parezcan 20 tareas atrasadas.
- El `CHECK` de `solicitudes_acceso.estado` pasa a `('pendiente','aprobada','rechazada','descartada')`.

---

## Verificación del gate

| chequeo | resultado |
|---|---|
| `grep -c '<script' registro-profesional.html` | **0** |
| `grep -ci 'supabase' registro-profesional.html` | **0** |
| `grep -c 'signUp' registro-profesional.html` | **0** |
| ídem sobre `registro.html` | **0 / 0 / 0** |
| `href="registro…"` en todo el repo | **0** |
| `login.html` conserva sus `<script>` | **2**, sin cambios |
| `SELECT count(*) FROM spcs` antes / después | **144 / 144** |
| policies, funciones, triggers tocados | **ninguno** |

No corresponde canario 0a: este gate **no toca policies ni funciones**. El canario vuelve en el Gate 1, que sí las toca.

---

# 📋 LO QUE TE TOCA A VOS — checklist de dashboard

No pude leer la config de Auth: requiere la Management API y el PAT ya lo borraste del VPS (correcto). Va con detalle de dónde mirar.

**Dónde**: dashboard de Supabase → proyecto **`unlhcuanfrtpatoipwve`** ("Sistema de gestión hípica"). ⚠️ Verificá el ref en la URL: **no es el proyecto Cambios**.

### 1 · Authentication → Sign In / Providers → **Email**

| qué mirar | valor deseado **HOY** | por qué |
|---|---|---|
| **Allow new users to sign up** | 🔴 **APAGAR** | Ver abajo — es la recomendación fuerte de este gate |
| **Confirm email** | ✅ **encendido** | Si está apagado (*autoconfirm*), cualquier email inventado da una cuenta usable al instante. Con esto, la cuenta no sirve hasta que abran el correo |
| **Minimum password length** | ≥ 8 | Default razonable, sólo confirmá que no bajó |

> **🔴 Recomendación fuerte: apagá el signup público ahora, y lo prendemos en el Gate 3.**
>
> Hoy el signup está abierto pero **ya no lo usa nada**: las dos páginas que lo llamaban quedaron neutralizadas en este gate. Y el alta por invitación **no se ve afectada**: `invite-user` usa la Admin API (`inviteUserByEmail`), que **no** pasa por ese toggle.
>
> O sea: apagarlo ahora no rompe nada y deja la superficie de creación de cuentas públicas en **cero** hasta que exista el circuito de solicitud + aprobación. Cuando el Gate 3 esté listo, se vuelve a prender junto con el captcha.
>
> Si preferís dejarlo prendido, es defendible —una cuenta sin fila en `usuarios` no ve nada una vez cerrado el Gate 1— pero mientras tanto puede acumular huérfanas como las 2 que ya hay.

### 2 · Authentication → **Attack Protection**

| qué mirar | valor deseado | por qué |
|---|---|---|
| **Enable Captcha protection** | ✅ encender (hCaptcha o Cloudflare Turnstile) | Es el control que más rinde contra registro automatizado en masa. **Necesario antes del Gate 3**, cuando el signup vuelva a abrirse |
| provider + secret | anotá cuál elegís | El formulario del Gate 3 tiene que embeber el widget correspondiente — decime cuál para codearlo |

> Si activás captcha **ahora**, avisame: `invite-user` no se ve afectado, pero cualquier prueba manual de `signUp` va a necesitar el token del widget.

### 3 · Authentication → **Rate Limits**

Anotá los valores actuales de estos cuatro (no hace falta cambiarlos todavía, es para saber de dónde partimos):

| límite | qué controla | comentario |
|---|---|---|
| **Rate limit for sending emails** | mails de confirmación e invitación | El más importante: si es alto, el proyecto sirve de relay de spam. Ojo que también limita a `invite-user` |
| **Rate limit for sign ups and sign ins** | intentos por hora por IP | Mitiga, no resuelve: las IPs rotan |
| **Rate limit for token refresh** | — | informativo |
| **Rate limit for OTP** | — | informativo |

### 4 · Authentication → **URL Configuration**

| qué mirar | por qué |
|---|---|
| **Site URL** | Tiene que ser `https://mdqclio.github.io/SGH/`. Es a donde vuelve el link de confirmación de email |
| **Redirect URLs** | Que incluya el dominio de Pages. Si el Gate 3 agrega `solicitar-acceso.html`, puede necesitar entrada propia |

### 5 · Comprobación rápida al final

Con el signup apagado, abrí `https://mdqclio.github.io/SGH/registro-profesional.html` → tiene que verse la pantalla **"Registro no disponible"**, sin formulario.

### Lo que necesito que me pases

1. ¿Apagaste el signup público? (sí/no)
2. **Confirm email**: ¿estaba encendido o apagado?
3. **Captcha**: ¿lo activaste? ¿qué provider?
4. Los 4 valores de rate limits.

Con eso cierro el Gate 0 y arranco el Gate 1.

---

## Estado y qué sigue

| gate | estado |
|---|---|
| **0 · contención** | 🟡 **hecho de mi lado**, esperando tu checklist de dashboard |
| **1 · cerrar huecos** (`performances`/`sanciones` `USING(true)`, índice único de entidad, + C.1 `AND activo` y C.2 default de rol como defensa en profundidad) | ⬜ listo para arrancar — **no depende del dashboard**, puedo empezarlo ya |
| **2 · solicitudes** (tabla + RPCs + Edge Function) | ⬜ incorpora el estado `descartada` y la regla de los curiosos |
| **3 · UI** (`solicitar-acceso.html`, bandeja, pantalla de pendiente) | ⬜ requiere captcha decidido |
| **4 · inscribir desde el portal** | ⬜ **R9 (06/09)**, no esta semana |

**Recordatorio del alcance acordado**: esta semana va la variante reducida — registro y aprobación reales, y las inscripciones de R8 las carga la secretaría. R8 no se arriesga.
