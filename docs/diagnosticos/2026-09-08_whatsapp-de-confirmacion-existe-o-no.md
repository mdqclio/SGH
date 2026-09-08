# ¿De qué contacto sale el WhatsApp de confirmación? ¿Es un bot?

**Fecha:** 2026-09-08, ~16:10 AR
**Pregunta de Yesi:** desde qué contacto sale el WhatsApp de confirmación que menciona el sistema,
o si es un bot.
**Tipo:** SOLO LECTURA — `git grep`/`git show` contra `main`, `SELECT` contra prod, `curl` a
`sigh.com.ar`. Ninguna escritura.
**SHA de `main`:** `eface80078b99a56c9ae3160053cd8fd0c425d31`
**SHA de `origin/reports` al empezar:** `6d391f5fe4d85290ed8647b81f907bde85b1579e`

## Guards

```
$ pwd
/home/clio/dev/SGH

$ git rev-parse main origin/main
eface80078b99a56c9ae3160053cd8fd0c425d31
eface80078b99a56c9ae3160053cd8fd0c425d31

SELECT count(*) FROM spcs;   →  181     ✔
ref del proyecto             →  unlhcuanfrtpatoipwve   ✔
```
```sql
SELECT (SELECT count(*) FROM spcs) AS spcs_count, current_database() AS db;
```
```json
[{"spcs_count":181,"db":"postgres"}]
```

Todo el relevamiento se hizo **contra `main`** (`git grep <patrón> main`, `git show main:archivo`),
no contra el árbol de `reports`, que está atrás.

---

# RESPUESTA CORTA PARA YESI

**No es un bot. No hay ninguna integración de WhatsApp. El WhatsApp sale del teléfono de quien
aprueba — o sea, del suyo.**

Lo que hace el sistema cuando ella aprueba una solicitud es abrirle **una pestaña de WhatsApp con
el mensaje ya escrito y el número del solicitante puesto**. Ella lo lee, y **manda ella**. Si no
aprieta "Enviar" en WhatsApp, no se manda nada. Si cierra la pestaña, no se manda nada. El sistema
no reintenta, no registra si salió, y no tiene forma de saberlo.

Es el mismo efecto que si ella buscara el contacto y escribiera el mensaje a mano: lo único que el
sistema aporta es ahorrarle tipear.

**Aparte del WhatsApp, la aprobación no notifica nada.** Ni mail, ni SMS, ni push. La única forma
de que el solicitante se entere solo es que vuelva a entrar al portal y vea el cartel "Tu acceso
está habilitado".

---

## 1 · Grep del repo entero — dónde aparece "WhatsApp" / "wa.me"

Comando, tal cual se corrió:

```
$ git grep -inE "whatsapp|wa\.me|whats app|whattsapp|wsp|w\.app|api\.whatsapp" main
```

Salida cruda, completa:

```
main:admin.html:337:          <input type="text" id="e-sd-contacto" placeholder="Ej: Juga xWhatsApp 116361-0222">
Binary file main:assets/programa-oficial-color/tapa-04.jpg matches
main:caballerizas.html:396:  row.append(header, grid);
main:docs/AUTOREGISTRO_GATE_0.md:85:| 2 | Rechazo: **teléfono/WhatsApp de Yesi**, sin mail automático | No se toca el sistema de mails. El motivo igual se guarda en `solicitudes_acceso.motivo_rechazo` y se muestra en pantalla |
main:docs/AUTOREGISTRO_GATE_3.md:7:Implementación de `AUTOREGISTRO_PLAN.md` §A, con la **adenda del aviso por WhatsApp**.
main:docs/AUTOREGISTRO_GATE_3.md:77:### 4 · Aviso por WhatsApp *(adenda)*
main:docs/AUTOREGISTRO_GATE_3.md:81:- **Al aprobar**: si hay teléfono, ofrece abrir `wa.me` con el mensaje armado — *"Hola {nombre}! Tu acceso al sistema del Hipódromo de Dolores ya está aprobado. Podés entrar en …/login.html con tu email y la contraseña que elegiste."*
main:docs/AUTOREGISTRO_GATE_3.md:170:5. Aprobala contra una ficha y **probá el botón de WhatsApp**.
main:docs/CARTA_LLAMADOS_ORDEN.md:185:- Una carta publicada ya salió: se imprimió, se mandó por WhatsApp, la leyó gente. Cambiar los turnos ahí no es un cambio de dato, es **emitir un documento distinto con el mismo nombre**. Si se habilita, hace falta además versionar o marcar la carta como reeditada y volver a distribuirla — trabajo que excede este pedido.
main:docs/CONTEXTO.md:66:| `programa-oficial.html` | Programa estilo manual de Dolores: newsprint B&N, 8 columnas por carrera, sponsors, pie institucional | No (pública) |
main:docs/DECISIONES.md:116:Justificación: Las apuestas simples son específicas de cada carrera; no todas habilitan los mismos mercados. Confirmado por Fede vía WhatsApp. Las apuestas combinadas (doblete, triple, etc.) se descartaron del modelo — si aplican se mencionan en el texto libre de la carrera.
main:docs/ESTADO.md:248:- **Programa Oficial Fases 4.1–4.3** (20/05/2026): nueva página `programa-oficial.html` standalone para impresión. Estilo newsprint B&N, tipografía EB Garamond/Inter. Header comisión/comisariato/logo. Bloque por carrera con tabla 8 columnas (CABALLERIZA, 4 ULT.PERF., N°, SPC, JOCKEY, KESP, PADRE-MADRE, ENTRENADOR). Sponsors grid B&W, banner próxima reunión, sponsor destacado a media página (foto + datos). Secretaría y teléfono de inscripciones en el pie. Paginación @page Chrome/Edge. Accesible desde botón 📘 en programa.html.
main:docs/ESTADO.md:397:**Validación de Fede**: pendiente en producción. Sesión cerrada con feature-complete según interpretación de las directivas iterativas (WhatsApp + audios).
main:docs/PASE_DOMINIO_PASO6.md:43:- **`solicitudes.html`** — sólo texto: el link que va dentro del WhatsApp que la secretaría
main:docs/PLAN_DOMINIO_SIGH_COM_AR.md:264:### 5.6 🟠 ALTO — mensaje de WhatsApp de aprobación
main:docs/PLAN_DOMINIO_SIGH_COM_AR.md:272:Se usa en `msgAprobado()` (`:144`) — el texto de WhatsApp que la secretaría le manda a la
main:docs/RELEVAMIENTO_EMAIL_2026-08-19.md:59:  Edge Function. El aviso es **manual, por WhatsApp/teléfono de Yesi** — decisión explícita del
main:docs/RELEVAMIENTO_EMAIL_2026-08-19.md:145:manual (WhatsApp / teléfono / impresión).
main:docs/SCHEMA.md:11:NOTA sponsor_destacado: `{"nombre":"AGENCIA HIPICA DOLORES","subtitulo":"PALERMO – SAN ISIDRO – LA PLATA","foto_url":"https://...","direccion":"Sarmiento 274, Dolores","contacto":"Juga xWhatsApp 116361-0222"}` — sponsor heroico en el programa oficial (bloque B&N a media página). Separado de sponsors[] que son los logos pequeños.
Binary file main:logo-dolores-512x512.png matches
Binary file main:logo192x192.png matches
Binary file main:logo192x1921.png matches
main:migrations/sec_autoregistro_gate3_telefono.sql:6:-- por WhatsApp cuando el acceso se aprueba. Si no está, el botón no aparece.
main:programa-oficial.html:11:  /* Reset al estilo newsprint B&N */
main:solicitar-acceso.html:168:        <p class="hint">Lo usamos para avisarte por WhatsApp cuando tu acceso esté aprobado.</p>
main:solicitar-acceso.html:487:// Normalización del teléfono para que el link de wa.me funcione.
main:solicitudes.html:126:// --- Aviso por WhatsApp ----------------------------------------------------
main:solicitudes.html:140:  return d ? `https://wa.me/${d}?text=${encodeURIComponent(texto)}` : '';
main:solicitudes.html:311:      ? `<div class="acciones"><button class="btn btn-sec" data-wa="${s.id}">💬 Avisar por WhatsApp</button></div>`
main:solicitudes.html:387:    // Aviso por WhatsApp: se ofrece en el momento, antes de recargar la lista,
main:solicitudes.html:390:      if (confirm(`Listo. ¿Le avisás por WhatsApp a ${s.nombre}?`)) {
main:solicitudes.html:408:    if (s.telefono && confirm(`¿Le avisás por WhatsApp a ${s.nombre}? El mensaje es neutro, sin el motivo.`)) {
```

### Falsos positivos, descartados

Cuatro líneas de arriba **no** hablan de WhatsApp; las agarró la regex:

| línea | por qué matcheó | qué es realmente |
|---|---|---|
| `caballerizas.html:396` | `w\.app` matchea **"ro`w.app`end"** | `row.append(header, grid)` |
| `programa-oficial.html:11` | `wsp` matchea **"ne`wsp`rint"** | comentario de CSS |
| `docs/CONTEXTO.md:66`, `docs/ESTADO.md:248` | idem "newsprint" | descripción del programa oficial |
| los 3 PNG y el JPG | binarios | logos y tapa del programa |

Y dos son de **otro tema** —el sponsor del programa oficial, no el aviso de acceso:

- `admin.html:337` — placeholder del campo "contacto" del sponsor destacado
  (`Ej: Juga xWhatsApp 116361-0222`, que es la Agencia Hípica Dolores).
- `docs/SCHEMA.md:11` — el JSON de ejemplo de ese mismo campo.

### Lo que queda: **tres archivos de código**

`solicitudes.html` (la bandeja de la secretaría), `solicitar-acceso.html` (el formulario público) y
la migración `sec_autoregistro_gate3_telefono.sql` (sólo un comentario). Nada más. **Ni un solo
llamado de red a WhatsApp en todo el repo.**

### Historia del string — un solo commit lo introdujo

```
$ git log -S"wa.me" --oneline --all
b1b79a8 feat(autoregistro): Gate 3 — UI de solicitud, bandeja de aprobación y aviso

$ git log -S"WhatsApp" --oneline --all -- '*.html' '*.js'
b1b79a8 feat(autoregistro): Gate 3 — UI de solicitud, bandeja de aprobación y aviso
29e26e3 feat(programa-oficial): Fase 4.3 — secretaría, teléfono de inscripciones, sponsor destacado con foto
```

`b1b79a8` es el Gate 3 del autorregistro (el aviso). `29e26e3` es el sponsor del programa. No hay
ningún otro commit, en ninguna rama, que haya metido o sacado código de WhatsApp.

### Verificado en producción

Los tres archivos servidos por `sigh.com.ar` son **byte a byte** los de `main`:

```
$ curl -s "https://sigh.com.ar/<archivo>?v=$RANDOM" -o prod_<archivo>
$ git show main:<archivo> > main_<archivo>
$ md5sum ...

solicitudes.html       main=9b5c0b090ab28fd2386e1043f52610be  prod=9b5c0b090ab28fd2386e1043f52610be
solicitar-acceso.html  main=10c236bae998e357edf76f6ac9972ea0  prod=10c236bae998e357edf76f6ac9972ea0
portal.html            main=0620c28ceed094a4dafb4486ac5bc36d  prod=0620c28ceed094a4dafb4486ac5bc36d
```

Y el grep contra el HTML bajado de prod da exactamente las mismas líneas que `main`:

```
=== prod solicitudes.html ===
126:// --- Aviso por WhatsApp ----------------------------------------------------
140:  return d ? `https://wa.me/${d}?text=${encodeURIComponent(texto)}` : '';
311:      ? `<div class="acciones"><button class="btn btn-sec" data-wa="${s.id}">💬 Avisar por WhatsApp</button></div>`
387:    // Aviso por WhatsApp: se ofrece en el momento, antes de recargar la lista,
390:      if (confirm(`Listo. ¿Le avisás por WhatsApp a ${s.nombre}?`)) {
408:    if (s.telefono && confirm(`¿Le avisás por WhatsApp a ${s.nombre}? El mensaje es neutro, sin el motivo.`)) {
=== prod solicitar-acceso.html ===
168:        <p class="hint">Lo usamos para avisarte por WhatsApp cuando tu acceso esté aprobado.</p>
487:// Normalización del teléfono para que el link de wa.me funcione.
=== prod portal.html ===
(sin coincidencias)
```

---

## 2 · ¿Hay integración de WhatsApp? **No.**

### 2.1 — El código: es un link `wa.me`, no una API

`solicitudes.html:126-155`, completo:

```javascript
// --- Aviso por WhatsApp ----------------------------------------------------
// Es la vía de aviso del piloto: sin mail automático y sin Edge Function.
// Se normaliza de nuevo acá, defensivo: puede haber solicitudes viejas
// guardadas antes de que el formulario normalizara.
function telWa(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('54')) return d;
  if (d.startsWith('0')) d = d.slice(1);
  return '549' + d;
}
const LOGIN_URL = 'https://sigh.com.ar/login.html';
function waLink(tel, texto) {
  const d = telWa(tel);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(texto)}` : '';
}
function msgAprobado(nombre) {
  return `Hola ${nombre}! Tu acceso al sistema del Hipódromo de Dolores ya está aprobado. `
       + `Podés entrar en ${LOGIN_URL} con tu email y la contraseña que elegiste.`;
}
function msgRechazado(nombre) {
  return `Hola ${nombre}! Sobre tu pedido de acceso al sistema del Hipódromo de Dolores: `
       + `necesitamos verificar algunos datos. Comunicate con la secretaría cuando puedas.`;
}
// Se abre en pestaña nueva y se avisa si no hay teléfono, en vez de no hacer nada.
function abrirWa(tel, texto) {
  const url = waLink(tel, texto);
  if (!url) { toast('Esta solicitud no tiene teléfono cargado.', 'error'); return; }
  window.open(url, '_blank', 'noopener');
}
```

**`window.open('https://wa.me/…')` es abrir una pestaña.** `wa.me` es el "click to chat" público de
WhatsApp: no requiere cuenta de desarrollador, ni token, ni número de empresa, ni alta en Meta. Abre
WhatsApp Web (o la app, si es un celular) en la conversación con ese número, **con el texto ya
tipeado en la caja**. El envío lo hace la persona apretando el botón verde.

Traducido: **el remitente es la cuenta de WhatsApp que esté abierta en la máquina o el celular de
quien aprobó.** Si Yesi aprueba desde su compu con su WhatsApp Web, sale de su número personal. No
hay ningún número del sistema, ni una línea del hipódromo configurada en ningún lado.

### 2.2 — No hay Edge Function de WhatsApp

```
$ git ls-tree -r --name-only main | grep -iE "supabase/functions|edge|deno"
deno.lock
supabase/functions/_shared/chapas_map.mjs
supabase/functions/_shared/mandil.mjs
supabase/functions/_shared/studbook_format.mjs
supabase/functions/invite-user/index.ts
supabase/functions/reunion-json/_build/…  (7 archivos de build)
supabase/functions/reunion-json/index.ts
```

Y las que están **desplegadas en el proyecto** (consulta a la API de Supabase, no al repo):

```json
{"functions":[
  {"slug":"reunion-json","status":"ACTIVE","version":21,"verify_jwt":false},
  {"slug":"invite-user","status":"ACTIVE","version":5,"verify_jwt":true}]}
```

**Dos funciones, ninguna de mensajería.** `reunion-json` expone el JSON de una reunión para el Stud
Book. `invite-user` da de alta usuarios por invitación cerrada llamando a la Admin API de GoTrue
(manda un **mail**, no un WhatsApp) — y **no participa del flujo de solicitudes**: sólo la invocan
`admin.html:611` y `usuarios.html:359`, que son las pantallas de alta por invitación, otro camino.

```
$ git grep -in "invite-user\|functions.invoke" main -- '*.html' '*.js'
main:activacion-pendiente.js:6: * `invite-user` inserta la fila con `activo=false, estado='pendiente'` y la
main:admin.html:611:  const {error:invErr}=await sb.functions.invoke('invite-user',{
main:admin.html:622:    console.error('[admin.invitarAdminHipodromo] invite-user falló',
main:reset-password.html:168:// Mismo criterio de normalización que la Edge Function invite-user: el vínculo
main:reset-password.html:274: * La Edge Function invite-user deja la fila en activo=false / estado='pendiente'.
main:usuarios.html:337: * Desarma el error de sb.functions.invoke().
main:usuarios.html:352: * Invita a un usuario vía la Edge Function invite-user.
main:usuarios.html:359:  return await sb.functions.invoke('invite-user', { body });
```

`solicitudes.html` **no aparece** en esa lista: la bandeja de aprobación no invoca ninguna función.

### 2.3 — La base de datos no puede salir a Internet

Extensiones realmente instaladas:

```sql
SELECT e.extname, n.nspname AS schema, e.extversion
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY e.extname;
```
```json
[{"extname":"pg_stat_statements","schema":"extensions","extversion":"1.11"},
 {"extname":"pgcrypto","schema":"extensions","extversion":"1.3"},
 {"extname":"plpgsql","schema":"pg_catalog","extversion":"1.0"},
 {"extname":"supabase_vault","schema":"vault","extversion":"0.3.1"},
 {"extname":"uuid-ossp","schema":"extensions","extversion":"1.1"}]
```

**Sin `pg_net`, sin `http`, sin `pg_cron`.** Sin esas extensiones no existen los Database Webhooks
ni los jobs programados: la base no tiene forma de hacer una llamada HTTP, así que no puede
disparar ni un WhatsApp ni un mail por su cuenta. (Coincide con lo que ya había verificado
`docs/RELEVAMIENTO_EMAIL_2026-08-19.md` §1.4 el 19/08.)

Triggers sobre las tablas del flujo:

```sql
SELECT c.relname AS tabla, t.tgname, pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal
  AND (c.relname IN ('solicitudes_acceso','usuarios')
       OR pg_get_triggerdef(t.oid) ILIKE '%http%' OR pg_get_triggerdef(t.oid) ILIKE '%net%'
       OR pg_get_triggerdef(t.oid) ILIKE '%hook%')
ORDER BY c.relname, t.tgname;
```
```json
[{"tabla":"usuarios","tgname":"trg_audit_usuarios","def":"CREATE TRIGGER trg_audit_usuarios AFTER INSERT OR DELETE OR UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()"},
 {"tabla":"usuarios","tgname":"trg_proteger_rol_club_id_usuario","def":"CREATE TRIGGER trg_proteger_rol_club_id_usuario BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_proteger_rol_club_id_usuario()"},
 {"tabla":"usuarios","tgname":"trg_usuarios_guard_privilegios","def":"CREATE TRIGGER trg_usuarios_guard_privilegios BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_usuarios_guard_privilegios()"},
 {"tabla":"usuarios","tgname":"trg_usuarios_set_auth_user_id","def":"CREATE TRIGGER trg_usuarios_set_auth_user_id BEFORE INSERT OR UPDATE OF email ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_usuarios_set_auth_user_id()"}]
```

**`solicitudes_acceso` no tiene ni un trigger.** Los cuatro de `usuarios` son auditoría y guardas de
privilegios: ninguno sale a la red.

### 2.4 — Ningún proveedor de mensajería en el repo

```
$ git grep -inE "twilio|sendgrid|resend|postmark|mailgun|nodemailer|smtp|graph\.facebook|whatsapp_business|360dialog|ultramsg|baileys|\bchatbot\b" main -- '*.html' '*.js' '*.mjs' '*.sql' '*.json'
main:tests/probe_invite_user.mjs:52: *                             proyecto. Desde el 24/07/2026 el proyecto usa SMTP
main:tests/probe_invite_user.mjs:53: *                             propio (Resend, etapa 0 del plan): el techo de
main:tests/probe_invite_user.mjs:55: *                             con SMTP custom el default de GoTrue es 30/hora,
main:tests/probe_invite_user.mjs:576:  // reinvitación del plan se cae y hay que usar generateLink / resend.
main:tests/probe_invite_user.mjs:643:      console.log('      evaluar admin.generateLink({type:"invite"}) o auth.resend() para el reenvío.');
main:tests/probe_solicitar_cuenta_existente.mjs:34: * corrida rebota dos mails en Resend (ver abajo) y los rebotes duros degradan la reputación del
main:tests/probe_solicitar_falta_paso.mjs:45: * de verdad de GoTrue. Van a un dominio .invalid, así que rebotan en Resend. Es el precio de
```

Las siete coincidencias son **comentarios en probes** sobre **Resend**, que es el **SMTP de los
mails de Supabase Auth** (confirmación de cuenta, recuperación de contraseña). Nada que ver con
WhatsApp, y ninguna es código de aplicación. **Cero SDK de Twilio, cero API de WhatsApp Business,
cero librería no oficial.**

---

## 3 · ¿Algún texto le promete al usuario un aviso por WhatsApp? **Sí, uno.**

### `solicitar-acceso.html:168` — el único

```html
<div class="form-group">
  <label for="f-tel">Teléfono <span style="…">(recomendado)</span></label>
  <input type="tel" id="f-tel" placeholder="2245 123456" autocomplete="tel">
  <p class="hint">Lo usamos para avisarte por WhatsApp cuando tu acceso esté aprobado.</p>
</div>
```

Es el único lugar de todo el sistema donde **al usuario final** se le nombra WhatsApp. Está debajo
del campo teléfono, en el formulario público.

### Los otros textos del flujo dicen "te avisamos", sin decir por dónde

```
$ git grep -inE "te avisamos|te avisa|avisarte|te contactamos|te vamos a avisar|cuando .*aprob|una vez aprobad|revisá tu (correo|mail)|te llega" main -- '*.html' '*.js'
main:portal.html:328:      La secretaría valida los datos y te avisa cuando tu acceso esté habilitado.
main:solicitar-acceso.html:133:        Te avisamos cuando esté habilitada.
main:solicitar-acceso.html:168:        <p class="hint">Lo usamos para avisarte por WhatsApp cuando tu acceso esté aprobado.</p>
main:solicitar-acceso.html:248:      <h2 class="card-title" style="text-align:center;">Revisá tu correo</h2>
main:solicitar-acceso.html:272:         pantalla la página mostraba "revisá tu correo" por un mail que nunca se
main:solicitar-acceso.html:346:        Te avisamos cuando esté lista.
main:solicitar-acceso.html:383:     muerto y la página volvería a decir "revisá tu correo" por un mail que no se emitió, sin
main:solicitar-acceso.html:602:  // confirmar tiene que seguir cayendo en "revisá tu correo".
```

Los tres textos visibles, completos:

- **`solicitar-acceso.html:131-133`** (cabecera del formulario):
  > *"Completá tus datos y la secretaría del hipódromo va a revisar la solicitud. **Te avisamos
  > cuando esté habilitada.**"*
- **`solicitar-acceso.html:344-346`** (pantalla ✅ "Solicitud enviada"):
  > *"La secretaría del hipódromo va a revisar tus datos y habilitar tu acceso. **Te avisamos
  > cuando esté lista.** / Cualquier consulta, en la secretaría del hipódromo."*
- **`portal.html:328`** (cartel del solicitante pendiente que vuelve a entrar):
  > *"La secretaría valida los datos y **te avisa cuando tu acceso esté habilitado.** / Cualquier
  > consulta, en la secretaría del hipódromo."*

Nótese que `portal.html` dice "**la secretaría** te avisa" — atribuye el aviso a la persona, no al
sistema. Es el texto más honesto de los tres.

**Ojo con "Revisá tu correo" (`:248`): ése NO es el aviso de aprobación.** Es la confirmación de la
dirección de mail, mucho antes, cuando se crea la cuenta. Ahí sí hay un mail automático (§4).

### El otro texto que menciona WhatsApp está en la pantalla de la secretaría, no del usuario

`solicitudes.html:311` (botón en la lista de resueltas) y los dos `confirm()` de `:390` y `:408` —
esos los ve Yesi, no el solicitante.

---

## 4 · Cuando la secretaría aprueba, ¿el sistema notifica? **No. Nada automático.**

### 4.1 — Lo que hace el botón "Vincular y aprobar" (`solicitudes.html:375-397`)

```javascript
  div.querySelector(`[data-aprobar="${s.id}"]`).onclick = async (ev) => {
    const sel = elegido[s.id];
    if (!sel) return;
    if (!confirm(`Vincular a ${s.nombre} ${s.apellido} con la ficha "${sel.nombre}" y darle acceso?`)) return;
    ev.target.disabled = true;
    const copiar = div.querySelector(`[data-copiar="${s.id}"]`).checked;
    const { error } = await sb.rpc('rpc_aprobar_solicitud', {
      p_solicitud_id: s.id, p_entidad_tipo: sel.tipo, p_entidad_id: sel.id,
      p_copiar_documento: copiar,
    });
    if (error) { toast(error.message, 'error'); ev.target.disabled = false; return; }
    toast(`${s.nombre} ${s.apellido} quedó habilitado.`);
    // Aviso por WhatsApp: se ofrece en el momento, antes de recargar la lista,
    // porque después la solicitud se va a la pestaña de resueltas.
    if (s.telefono) {
      if (confirm(`Listo. ¿Le avisás por WhatsApp a ${s.nombre}?`)) {
        abrirWa(s.telefono, msgAprobado(s.nombre));
      }
    } else {
      toast('No cargó teléfono: avisale por la vía que tengas.', 'error');
    }
    load();
  };
```

Dos cosas, en este orden:

1. **`rpc_aprobar_solicitud`** — la parte que sí es automática. Sólo escribe en la base.
2. **Un `confirm()`** preguntándole a Yesi si le avisa. Si dice que sí, se le abre la pestaña. Si
   dice que no, o si la solicitud no tiene teléfono, **no pasa nada más**.

### 4.2 — El RPC de aprobación no manda nada

`rpc_aprobar_solicitud`, traído de prod con `pg_get_functiondef` (resumido a lo que hace, el texto
completo está abajo):

- valida que quien llama sea staff del club (`fn_solicitudes_guard_staff`),
- valida estado `pendiente`, tipo de entidad y que la ficha sea del mismo club,
- **`INSERT INTO usuarios`** con `activo=true, estado='activo'` y el vínculo a la ficha,
- opcionalmente copia el DNI a la ficha,
- **`UPDATE solicitudes_acceso SET estado='aprobada', resuelta_por=…, resuelta_at=now()`**,
- `RETURN v_usuario_id`.

Texto completo, tal cual está en prod:

```sql
CREATE OR REPLACE FUNCTION public.rpc_aprobar_solicitud(p_solicitud_id uuid, p_entidad_tipo text, p_entidad_id uuid, p_copiar_documento boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff_id uuid := fn_solicitudes_guard_staff(p_solicitud_id);
        v_sol solicitudes_acceso%ROWTYPE; v_usuario_id uuid; v_ent_club uuid; v_ent_doc text;
BEGIN
  SELECT * INTO v_sol FROM solicitudes_acceso WHERE id = p_solicitud_id FOR UPDATE;
  IF v_sol.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La solicitud ya fue resuelta (estado: %)', v_sol.estado USING ERRCODE='22023'; END IF;
  IF p_entidad_tipo NOT IN ('profesional','propietario') THEN
    RAISE EXCEPTION 'entidad_tipo inválido' USING ERRCODE='22023'; END IF;
  IF p_entidad_tipo <> v_sol.rol_pedido THEN
    RAISE EXCEPTION 'La ficha es de tipo % y la solicitud pide %', p_entidad_tipo, v_sol.rol_pedido USING ERRCODE='22023'; END IF;
  IF p_entidad_tipo='profesional' THEN
    SELECT club_id, documento_nro INTO v_ent_club, v_ent_doc FROM profesionales WHERE id=p_entidad_id;
  ELSE
    SELECT club_id, documento_nro INTO v_ent_club, v_ent_doc FROM propietarios WHERE id=p_entidad_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'La ficha % no existe', p_entidad_id USING ERRCODE='P0002'; END IF;
  IF v_ent_club IS DISTINCT FROM v_sol.club_id THEN
    RAISE EXCEPTION 'La ficha pertenece a otro hipódromo' USING ERRCODE='42501'; END IF;
  BEGIN
    INSERT INTO usuarios (email,nombre_completo,telefono,club_id,rol,activo,estado,auth_user_id,entidad_tipo,entidad_id,password_hash)
    VALUES (v_sol.email, btrim(v_sol.nombre||' '||v_sol.apellido), v_sol.telefono, v_sol.club_id,
            v_sol.rol_pedido::rol_usuario, true, 'activo', v_sol.auth_user_id, p_entidad_tipo, p_entidad_id, '')
    RETURNING id INTO v_usuario_id;
  EXCEPTION WHEN unique_violation THEN
    IF sqlerrm ILIKE '%ux_entidad_una_cuenta%' THEN
      RAISE EXCEPTION 'Esa ficha ya está vinculada a otra cuenta. Desvinculá la anterior antes de aprobar.' USING ERRCODE='23505'; END IF;
    IF sqlerrm ILIKE '%ux_usuarios_auth_user_id%' THEN
      RAISE EXCEPTION 'La cuenta ya tiene usuario en el sistema' USING ERRCODE='23505'; END IF;
    RAISE;
  END;
  IF p_copiar_documento AND (v_ent_doc IS NULL OR btrim(v_ent_doc)='') THEN
    IF p_entidad_tipo='profesional' THEN
      UPDATE profesionales SET documento_nro=v_sol.documento_nro, documento_tipo=v_sol.documento_tipo WHERE id=p_entidad_id;
    ELSE
      UPDATE propietarios SET documento_nro=v_sol.documento_nro, documento_tipo=v_sol.documento_tipo WHERE id=p_entidad_id;
    END IF;
  END IF;
  UPDATE solicitudes_acceso SET estado='aprobada', resuelta_por=v_staff_id, resuelta_at=now() WHERE id=p_solicitud_id;
  RETURN v_usuario_id;
END; $function$
```

**Ni una línea que mande nada.** Puro `INSERT`/`UPDATE`. Lo mismo `rpc_rechazar_solicitud`, que
sólo escribe `estado='rechazada'` y el motivo.

### 4.3 — Entonces, ¿cómo se entera el usuario?

Tres vías, y ninguna es un push del sistema:

| vía | ¿automática? | detalle |
|---|---|---|
| **WhatsApp** | **No** | Yesi aprieta el botón y manda ella, desde su cuenta. Si no lo aprieta, no sale nada. |
| **Volver a entrar al portal** | No (es *pull*) | `portal.html:333` le muestra *"Tu acceso está habilitado — Cerrá sesión y volvé a entrar para verlo."* Sólo lo ve si entra por su cuenta. |
| **Teléfono / en persona** | No | Lo que la secretaría haga por fuera del sistema. |

### 4.4 — El único mail automático del flujo llega **antes**, no al aprobar

Cuando la persona crea la cuenta, `solicitar-acceso.html` llama a `sb.auth.signUp(...)` y **GoTrue
manda el mail de confirmación de dirección** (por SMTP de Resend). Eso es al **registrarse**, no al
aprobarse, y su texto en pantalla es *"Revisá tu correo"*.

`docs/RELEVAMIENTO_EMAIL_2026-08-19.md:57-60`, verificado el 19/08 y todavía cierto:

> **`solicitudes.html`** (aprobación/rechazo de solicitudes de acceso): sin mail automático y sin
> Edge Function. El aviso es **manual, por WhatsApp/teléfono de Yesi** — decisión explícita del
> Gate 0 (`docs/AUTOREGISTRO_GATE_0.md` §85).

y su corolario, `:144-146`:

> **Corolario operativo**: hoy no hay manera de mandar, por ejemplo, un recibo de pago, un aviso de
> liquidación, la carta de llamados, o una notificación de aprobación de solicitud. Todo eso es
> manual (WhatsApp / teléfono / impresión).

---

## 5 · Era una decisión tomada, no un olvido

`docs/AUTOREGISTRO_GATE_0.md:85`, tabla de decisiones del gate:

> | 2 | Rechazo: **teléfono/WhatsApp de Yesi**, sin mail automático | No se toca el sistema de mails.
> El motivo igual se guarda en `solicitudes_acceso.motivo_rechazo` y se muestra en pantalla |

`docs/AUTOREGISTRO_GATE_3.md:77-87`, la adenda que lo implementó:

> ### 4 · Aviso por WhatsApp *(adenda)*
>
> Vía de aviso del piloto: sin mail automático, sin Edge Function.
>
> - **Al aprobar**: si hay teléfono, ofrece abrir `wa.me` con el mensaje armado — *"Hola {nombre}!
>   Tu acceso al sistema del Hipódromo de Dolores ya está aprobado. Podés entrar en …/login.html con
>   tu email y la contraseña que elegiste."*
> - **Al rechazar**: opcional y con **texto neutro**, sin repetir el motivo interno — *"…necesitamos
>   verificar algunos datos. Comunicate con la secretaría cuando puedas."*
> - **Botón persistente** en la pestaña de resueltas, para reenviar si el primero no salió. **No
>   aparece en las descartadas**: a los curiosos no se les avisa nada.
> - **Sin teléfono → el botón no aparece**, y al aprobar avisa *"No cargó teléfono: avisale por la
>   vía que tengas."*
>
> ⚠️ **Limitación de la normalización**: el `15` intermedio de algunos números viejos no se detecta.
> Si el link no abre, el teléfono queda igual visible en la bandeja para copiarlo a mano.

O sea: la frase del formulario ("te avisamos por WhatsApp") describe **exactamente** lo que el
sistema fue diseñado para hacer. Lo que no dice —y no tiene por qué decirlo el usuario final— es
que del otro lado hay una persona apretando el botón.

---

# VEREDICTO

**1. Bot: NO EXISTE.** Ni bot, ni número del sistema, ni cuenta de WhatsApp Business, ni API de
Meta, ni Twilio, ni librería no oficial. Cero. El repo entero tiene **una** línea que toca
WhatsApp y es `window.open('https://wa.me/…')`.

**2. Contacto del que sale: el de quien aprueba.** El link `wa.me` abre WhatsApp Web o la app en la
máquina de la secretaría, con la sesión de WhatsApp que esté abierta ahí. **Si aprueba Yesi, sale
del número de Yesi.** El sistema no tiene línea propia.

**3. El texto que lo promete: existe, y es uno solo** — `solicitar-acceso.html:168`, *"Lo usamos
para avisarte por WhatsApp cuando tu acceso esté aprobado."*

**¿Promete algo que no existe? No exactamente — pero promete más certeza de la que hay.** El
mecanismo existe (el botón está, el mensaje está escrito, el número se normaliza), y en el uso
normal el aviso sale. Pero el verbo está en plural institucional —"lo usamos", "te avisamos"— y eso
se lee como *el sistema te va a avisar*. La realidad es que el aviso depende de que alguien apriete
un botón y después mande el mensaje: **no es automático, no se reintenta, no queda registrado si
salió, y no hay nada en la base que diga "a esta persona se le avisó".** Si Yesi cierra la pestaña o
la solicitud no trae teléfono, el usuario no se entera por ningún otro canal salvo que vuelva a
entrar al portal.

**Riesgo concreto**, para dimensionar: alguien aprobado un viernes a la tarde, sin teléfono cargado
o con el WhatsApp que no salió, **no recibe absolutamente nada** y su única señal es entrar al
portal a probar. El sistema le dijo "te avisamos".

**4. Al aprobar, notificación automática: NINGUNA.** Ni mail, ni SMS, ni push, ni webhook.
Verificado en tres capas independientes: el RPC sólo escribe filas; la base no tiene `pg_net`/`http`
(no puede salir a la red aunque quisiera); y de las dos Edge Functions desplegadas ninguna es de
mensajería y ninguna se invoca desde la bandeja de solicitudes.

---

## Preguntas abiertas / posibles ajustes *(no se tocó nada)*

1. **Suavizar el texto de `solicitar-acceso.html:168`** para que no prometa automatismo. Algo del
   tipo *"Si lo dejás, la secretaría te avisa por WhatsApp cuando esté aprobado."* — nombra a la
   persona, igual que ya hace `portal.html:328`. Es un cambio de una línea de HTML.
2. **Dejar rastro de si se avisó**: hoy no hay ninguna columna que lo registre. Una marca en
   `solicitudes_acceso` (fecha del aviso, o simplemente "avisado sí/no") le permitiría a la
   secretaría saber a quién le quedó pendiente. Requiere DDL — fuera de este relevamiento.
3. Si en algún momento se quiere aviso **de verdad** automático, hoy la vía más barata es un mail
   por la Edge Function (ya hay SMTP propio con Resend y la infraestructura de `invite-user`).
   WhatsApp automático implica cuenta de WhatsApp Business API y un proveedor: es otro orden de
   trabajo y de costo.

---

## Verificación de push

```
$ git push origin reports
To github.com:mdqclio/SGH.git
   6d391f5..be7fe31  reports -> reports

$ git ls-remote origin reports
be7fe319acb0f5a126b8d88500c40000b9e9ef1c	refs/heads/reports

$ git rev-parse HEAD
be7fe319acb0f5a126b8d88500c40000b9e9ef1c
```

Coinciden. ✔ (`be7fe31` es el commit que trae el informe; este bloque lo agrega el commit
siguiente, cuyo SHA no puede estar escrito adentro de sí mismo — se verifica con los mismos dos
comandos inmediatamente después del push y ambos devuelven el mismo valor.)
