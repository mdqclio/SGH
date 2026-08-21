# Relevamiento — capacidad de envío de mail en SGH

**Fecha**: 2026-08-19 · **Branch**: `diag/initauth-activo` · **SHA base**: `2bc4b7d`
**Alcance**: read-only. Inventario de lo que existe hoy. Sin propuesta de implementación.

---

## Resumen ejecutivo

| Pregunta | Respuesta corta |
|---|---|
| ¿Qué mails manda SGH? | **3 flujos, todos de Supabase Auth (GoTrue)**: invitación de usuario, recuperación de contraseña, confirmación de alta por auto-registro. |
| ¿Con qué mecanismo? | **SMTP propio: Resend**, activo desde el 24/07/2026. Reemplaza al mailer built-in de Supabase. Sender provisorio `sistema@hipodromodolores.com`. |
| ¿Se puede mandar contenido arbitrario a una dirección arbitraria? | **No.** Sólo las plantillas de GoTrue, a direcciones que existan en `auth.users` (o que se estén creando en ese acto). No hay ninguna vía en el sistema para componer un mail libre. |
| ¿Qué falta para tenerlo? | Una Edge Function nueva + una API key de Resend. **El dominio ya está verificado**: SPF/DKIM/DMARC están puestos y funcionando. No hace falta trabajo de DNS. |

---

## 1 · Inventario de mails que salen hoy

Los tres son **mails transaccionales de Supabase Auth**. Ninguno lo compone SGH: SGH dispara la
acción, GoTrue arma el cuerpo desde su plantilla y lo entrega por el SMTP configurado.

### 1.1 — Invitación de usuario (`invite`)

| | |
|---|---|
| **Disparador** | Alta de usuario en `usuarios.html` (secretaría) o alta de hipódromo en `admin.html` (super_admin, invita al secretario del club nuevo). |
| **Sale desde** | Edge Function `invite-user` (`supabase/functions/invite-user/index.ts:493`), llamada por `usuarios.html:359` y `admin.html:611` vía `sb.functions.invoke('invite-user', …)`. |
| **Mecanismo** | `admin.auth.admin.inviteUserByEmail(email, { data:{nombre_completo}, redirectTo: REDIRECT_URL })` — Admin API de GoTrue, con la secret key server-side. |
| **Contenido** | Plantilla *Invite user* del Dashboard de Auth. No parametrizable desde código salvo el `redirectTo` y el metadata `nombre_completo`. |
| **Landing** | `reset-password.html` con `type=invite` → la persona elige contraseña → `activo=true`. |
| **Reenvío** | `usuarios.html` expone reinvitación (`body.reinvitar = true`); avisa en UI que "un reenvío consume cuota". |
| **Nota** | `inviteUserByEmail` es Admin API: **no** pasa por el toggle de *Enable signups*. Sigue funcionando con el signup cerrado. |

### 1.2 — Recuperación de contraseña (`recovery`)

| | |
|---|---|
| **Disparador** | Formulario "Olvidé mi contraseña" en `login.html`. |
| **Sale desde** | `login.html:456` — `sb.auth.resetPasswordForEmail(email, { redirectTo:'https://mdqclio.github.io/SGH/reset-password.html', captchaToken })`. |
| **Mecanismo** | API pública de GoTrue desde el browser, con publishable key + token de captcha (Cloudflare Turnstile; GoTrue rechaza la llamada sin `captchaToken`). |
| **Contenido** | Plantilla *Reset password* del Dashboard. |
| **Nota** | La UI muestra éxito siempre, exista o no el email — no se filtra si la cuenta existe. |

### 1.3 — Confirmación de email en auto-registro (`signup / confirm`)

| | |
|---|---|
| **Disparador** | `solicitar-acceso.html` — el portal de solicitud de acceso (Gate 3). |
| **Sale desde** | `solicitar-acceso.html:370` — `sb.auth.signUp({ email, password, options:{ captchaToken, emailRedirectTo } })`. |
| **Mecanismo** | API pública de GoTrue desde el browser + captcha. |
| **Contenido** | Plantilla *Confirm signup* del Dashboard. |
| **Nota** | Con *Confirm email* encendido, `signUp` **no** devuelve sesión: la solicitud (`rpc_solicitar_acceso`) recién puede correr cuando la persona abre el mail y vuelve al `emailRedirectTo`. Es el único punto donde el mail es parte del camino crítico funcional, no sólo del alta. |

### 1.4 — Lo que NO manda mail (verificado)

- **`solicitudes.html`** (aprobación/rechazo de solicitudes de acceso): sin mail automático y sin
  Edge Function. El aviso es **manual, por WhatsApp/teléfono de Yesi** — decisión explícita del
  Gate 0 (`docs/AUTOREGISTRO_GATE_0.md` §85). El motivo de rechazo se guarda en
  `solicitudes_acceso.motivo_rechazo` y se muestra en pantalla, nada más.
- **Edge Function `reunion-json`**: expone el JSON de reunión del Stud Book por token Bearer.
  Sin ninguna capacidad de mail.
- **La base de datos**: no puede mandar mail ni hacer HTTP. Verificado —
  `pg_net` **no instalado**, `http` **no instalado**, `pg_cron` **no instalado**;
  no existen los schemas `net`, `supabase_functions`, `cron` ni `pgmq`.
  Es decir: **no hay Database Webhooks, ni jobs programados, ni triggers que salgan a la red.**
  Extensiones realmente instaladas: `pgcrypto`, `uuid-ossp`, `pg_stat_statements`,
  `supabase_vault`, `plpgsql`.
- **Ninguna dependencia de proveedor de mail en el repo**: cero referencias a Resend SDK,
  SendGrid, Nodemailer, Mailgun, Postmark o SES en el código. La integración con Resend es
  **pura configuración de Dashboard** (SMTP Settings de Auth), no código.

---

## 2 · Transporte y estado del dominio

### 2.1 — SMTP

**Resend**, activo desde el **24/07/2026** (etapa 0 de `docs/plan_alta_invitacion.md`).
Configurado en Dashboard → Authentication → Emails → SMTP Settings. Reemplazó al mailer built-in
de Supabase (que tenía techo de 2 mails/hora y entrega poco confiable a destinatarios externos a
la organización).

- **Sender**: `sistema@hipodromodolores.com` — **provisorio**. La dirección definitiva la define
  Fede. Cambiarla es config de Resend + `SMTP_SENDER` en el Dashboard, sin tocar código.
- **Cuota**: con SMTP propio el default de GoTrue pasa a **30 mails/hora** (ajustable en
  Authentication → Rate Limits). El valor efectivo **no se puede leer por MCP ni por SQL** — sólo
  desde el Dashboard.
- **Plan de Resend** (según el plan original): free tier ~3.000 mails/mes, 100/día. **Confirmar el
  plan real en el panel de Resend** — no es legible desde acá.
- **Verificado end-to-end** contra prod por Leo el 24/07: invitación → mail entregado a Gmail
  externo → contraseña → `activo=true` → login.

### 2.2 — DNS de `hipodromodolores.com` (consultado en vivo, 2026-08-19)

| Registro | Valor | Lectura |
|---|---|---|
| `TXT hipodromodolores.com` | `v=spf1 include:comp.hostmar.com -all` | SPF del raíz: **sólo el hosting de correo incumbente (Hostmar)**. No incluye a Resend/SES. |
| `TXT resend._domainkey.hipodromodolores.com` | `p=MIGfMA0GCSqGSIb3…` (RSA 1024) | ✅ **DKIM de Resend presente en el dominio raíz.** Es el selector que firma con `d=hipodromodolores.com`. |
| `TXT mail._domainkey.hipodromodolores.com` | `v=DKIM1; g=*; k=rsa; p=MIIBIjAN…` (RSA 2048) | DKIM del correo incumbente (Hostmar). Ajeno a SGH. |
| `TXT send.hipodromodolores.com` | `v=spf1 include:amazonses.com include:comp.hostmar.com ~all` | ✅ **SPF del subdominio de Return-Path de Resend** (Resend corre sobre SES). |
| `MX send.hipodromodolores.com` | `10 feedback-smtp.sa-east-1.amazonses.com` | ✅ Bounces/feedback de Resend, región **sa-east-1** (São Paulo). |
| `TXT _dmarc.hipodromodolores.com` | `v=DMARC1; p=quarantine;` | ⚠️ DMARC en **quarantine**, **sin `rua=`/`ruf=`** → no hay reporting agregado. |
| `MX hipodromodolores.com` | `0 mail.hipodromodolores.com`, `20 mx1.hipodromodolores.com` | El correo entrante lo maneja Hostmar. Las respuestas a `sistema@` caen ahí. |
| `A hipodromodolores.com` | `172.67.194.74`, `104.21.52.19` | Cloudflare (el DNS está detrás de Cloudflare). |

**Conclusión DNS: el dominio ya está listo para enviar por Resend.**
Es el setup estándar de "dominio verificado" de Resend: `From:` en el raíz, DKIM `d=` alineado con
el raíz vía el selector `resend`, y Return-Path/envelope en `send.` con su propio SPF. Con eso
DMARC pasa por alineación DKIM. No hace falta tocar DNS para agregar un nuevo tipo de mail.

**Dos observaciones (no bloqueantes):**
1. El SPF del **raíz** tiene `-all` y **no** incluye a Resend/SES. Está bien mientras el envelope
   sea `send.hipodromodolores.com` (lo que hace Resend). Pero cualquier otro emisor que use el
   raíz como envelope-from va a fallar SPF duro. Es un dato a tener presente si algún día se
   suma un segundo proveedor.
2. DMARC sin `rua=` significa **cero visibilidad**: si algo empieza a caer en quarantine, no hay
   forma de enterarse salvo que alguien reporte "no me llegó".

---

## 3 · ¿Se puede mandar un mail arbitrario a una dirección arbitraria?

**No. Hoy sólo existen los flujos de Auth.**

Los tres límites, en orden de dureza:

1. **Contenido cerrado.** Todo lo que sale es una plantilla de GoTrue (*Invite user*,
   *Reset password*, *Confirm signup*). Lo único variable es el link, el `redirectTo` y el
   metadata que se pasa (`nombre_completo`). No hay forma de inyectar un asunto ni un cuerpo.
2. **Destinatario acotado.** El mail va a una dirección que **es o pasa a ser** un usuario de
   `auth.users`. No se le puede mandar nada a alguien que no vaya a tener cuenta:
   - `resetPasswordForEmail` sólo entrega si la cuenta existe.
   - `inviteUserByEmail` **crea** el usuario de Auth como efecto — o sea, "usarlo para avisar
     algo" ensucia `auth.users` y `public.usuarios` con filas `estado='pendiente'`.
   - `signUp` idem, y además crea credencial.
3. **Sin backdoor por DB ni por función.** No hay Edge Function con capacidad de mail
   (`reunion-json` no la tiene, `invite-user` sólo llama a la Admin API), no hay `pg_net`/`http`,
   no hay webhooks ni cron. La credencial SMTP de Resend vive **sólo** dentro de la config de
   GoTrue, no está expuesta a la aplicación.

**Corolario operativo**: hoy no hay manera de mandar, por ejemplo, un recibo de pago, un aviso de
liquidación, la carta de llamados, o una notificación de aprobación de solicitud. Todo eso es
manual (WhatsApp / teléfono / impresión).

---

## 4 · Qué haría falta

No es una propuesta de implementación — es la lista de piezas que faltan.

### Lo que YA está (no hay que hacerlo de nuevo)

- ✅ Dominio `hipodromodolores.com` **verificado en Resend**, con SPF/DKIM/DMARC en DNS y
  reputación arrancada por el uso de Auth desde julio.
- ✅ Cuenta de Resend operativa con al menos un dominio verificado.
- ✅ Infra de Edge Functions andando y con patrón establecido: dos funciones desplegadas,
  código versionado en `supabase/functions/`, secretos por env (`STUDBOOK_DB_KEY`,
  `STUDBOOK_API_TOKEN`), CORS y manejo de errores con `code` estructurado ya resueltos en
  `invite-user`.
- ✅ Patrón de autorización server-side ya resuelto (`invite-user` valida el rol del caller
  contra `public.usuarios`, no confía en el frontend).

### Lo que falta

| Pieza | Detalle |
|---|---|
| **Edge Function nueva** | El único lugar posible: el frontend no puede tener la API key, y la DB no puede salir a la red. |
| **API key de Resend** | Generarla en el panel de Resend y setearla como secret de la función (`RESEND_API_KEY`). **La clave SMTP de Auth no sirve/no se reutiliza** — la HTTP API de Resend usa key propia. |
| **Decisión: HTTP API vs SMTP** | Resend expone `POST https://api.resend.com/emails`. Desde Deno, un `fetch` es trivial; SMTP desde Deno es bastante más trabajo. La HTTP API es el camino natural. |
| **Sender definitivo** | `sistema@` es provisorio. Sigue pendiente de Fede. Si el mail va a ser cara visible del hipódromo, conviene resolverlo antes de mandar volumen. |
| **Plantillas** | Hoy no existe ninguna plantilla propia. Todo lo que hay son las de GoTrue en el Dashboard. |
| **Autorización y auditoría** | Una función que manda contenido arbitrario a direcciones arbitrarias es, literalmente, un relay. Necesita gate de rol + rate limiting propio + registro de qué se mandó a quién. Nada de eso existe hoy. |
| **Cuota real** | Confirmar el plan de Resend. El free tier (~100/día) alcanza para invitaciones, pero no necesariamente para una tanda de recibos de una reunión. |
| **DMARC `rua=`** | Recomendable antes de subir volumen, para tener visibilidad de entregabilidad. |

**Lo más simple dado lo montado**: Edge Function + `fetch` a la HTTP API de Resend. Cero trabajo
de DNS, cero proveedor nuevo, cero dependencia nueva en el repo, y reusa el patrón de
`invite-user` para autorización y manejo de errores.

---

## 5 · Gotcha de diagnóstico ya documentado

Con SMTP custom, **GoTrue dejó de emitir el evento `mail.send`** en el log de Auth
(`docs/GOTCHAS.md:299`). Antes cada envío dejaba una línea
`mail.send / mail_from=… / mail_type=invite`; ahora no hay ninguna **aunque el mail se entregue**.

**La ausencia de `mail.send` no prueba que el mail no salió.** Para diagnosticar:
`/invite 200` + `auth_event action=user_invited` + `confirmation_sent_at` estampado, y confirmar
la entrega **en el panel de Resend**, no en el log de Auth.

---

## 6 · Fuentes

**Código**: `supabase/functions/invite-user/index.ts:493` · `usuarios.html:356-359` ·
`admin.html:611` · `login.html:456` · `solicitar-acceso.html:370` · `solicitudes.html:127`
**Docs**: `docs/plan_alta_invitacion.md` §3.2–3.4, Etapa 0 · `docs/ESTADO.md:24` ·
`docs/GOTCHAS.md:298-299` · `docs/AUTOREGISTRO_GATE_0.md` §0.1, §85, §144 ·
`docs/AUTOREGISTRO_GATE_3.md` §1 · `CHANGELOG.md:48-49`
**Prod (lectura en vivo)**: `list_edge_functions`, `list_extensions`, `pg_namespace`, `pg_proc`
**DNS (dig, 2026-08-19)**: TXT/MX de `hipodromodolores.com`, `send.hipodromodolores.com`,
`_dmarc.`, `resend._domainkey.`, `mail._domainkey.`

**No legible desde acá** (requiere Dashboard): rate limit efectivo de email, plantillas de Auth,
credenciales SMTP, plan y log de entregas de Resend.
