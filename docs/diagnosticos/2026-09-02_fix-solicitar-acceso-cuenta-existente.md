# Fix — "revisá tu correo" falso en solicitar-acceso.html cuando el correo ya tiene cuenta

**Fecha**: 2026-09-02 · **Branch del fix**: `fix/solicitar-acceso-cuenta-existente` · **SHA**: `58f3529`
**Base**: `main` en `d67726b` · **Estado**: pusheado, **SIN mergear** (gate del pedido).
**Diagnóstico que lo motiva**: `docs/diagnosticos/2026-09-02_fede-mail-verificacion-no-llega.md` §6.

**Guards verificados**

| Guard | Esperado | Obtenido |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | `/home/clio/dev/SGH` ✅ |
| `SELECT count(*) FROM spcs` | 181 | **181** ✅ |
| ref del proyecto | `unlhcuanfrtpatoipwve` | `unlhcuanfrtpatoipwve` ✅ |

Todo el relevamiento de código se hizo **contra `main`** (la rama de trabajo sale de `origin/main`,
no de `reports`). `solicitar-acceso.html` es idéntico en `reports` y en `main` — verificado con
`git diff --stat HEAD origin/main -- solicitar-acceso.html`, salida vacía.

---

## 1 · Qué se cambió

Tres archivos:

```
login.html                                 |   8 +
 solicitar-acceso.html                      |  43 ++-
 tests/probe_solicitar_cuenta_existente.mjs | 454 +++++++++++++++++++++++++++++
 3 files changed, 504 insertions(+), 1 deletion(-)
```

- **`solicitar-acceso.html`** — pantalla nueva `#sec-existe` y el corte que la dispara.
- **`login.html`** — `?recuperar=1` abre el panel de "olvidé mi contraseña".
- **`tests/probe_solicitar_cuenta_existente.mjs`** — probe nuevo, 31 asserts + 6 mutantes.

### Diff del fix (los dos HTML, completo)

```diff
diff --git a/login.html b/login.html
index 95bad2a..c068ac4 100644
--- a/login.html
+++ b/login.html
@@ -324,6 +324,14 @@ function cfReset(cual) {
   if (textos[motivo]) showError(textos[motivo]);
 })();
 
+// Deep link desde solicitar-acceso.html: ?recuperar=1 abre directo el panel de
+// "olvidé mi contraseña". Sin esto el link tendría que caer en reset-password.html,
+// que sin token de mail muestra "enlace inválido" y es un callejón sin salida.
+(function abrirRecuperar() {
+  if (new URLSearchParams(window.location.search).get('recuperar') !== '1') return;
+  showForgot();
+})();
+
 // Si ya hay sesión activa, redirigir según rol
 (async () => {
   const { data: { session } } = await sb.auth.getSession();
diff --git a/solicitar-acceso.html b/solicitar-acceso.html
index f946d4a..42266ec 100644
--- a/solicitar-acceso.html
+++ b/solicitar-acceso.html
@@ -233,6 +233,28 @@
       </p>
     </div>
 
+    <!-- ===== EL CORREO YA TIENE CUENTA ===== -->
+    <!-- GoTrue no devuelve error cuando el alta se repite sobre una cuenta ya
+         confirmada: responde 200 con un user obfuscado y NO manda ningún mail
+         (anti-enumeración, para no filtrar qué correos existen). Sin esta
+         pantalla la página mostraba "revisá tu correo" por un mail que nunca se
+         emitió — le pasó a un usuario real el 02/09/2026. El texto no dice nada
+         de la cuenta más allá de que el correo ya está registrado. -->
+    <div id="sec-existe" style="display:none;">
+      <div class="ok-icon">🔑</div>
+      <h2 class="card-title" style="text-align:center;">Ese correo ya está registrado</h2>
+      <p class="card-sub" style="text-align:center;">
+        Ya hay una cuenta con <strong id="existe-email"></strong>. No te mandamos
+        ningún mail: iniciá sesión con tu contraseña para continuar.
+      </p>
+      <a class="btn" id="lnk-login" href="login.html" style="display:block;text-align:center;text-decoration:none;padding:13px;">
+        Iniciar sesión
+      </a>
+      <a class="btn btn-sec" id="lnk-recuperar" href="login.html?recuperar=1" style="display:block;text-align:center;text-decoration:none;padding:13px;margin-top:10px;">
+        ¿Olvidaste tu contraseña?
+      </a>
+    </div>
+
     <!-- ===== SOLICITUD ENVIADA ===== -->
     <div id="sec-listo" style="display:none;">
       <div class="ok-icon">✅</div>
@@ -311,7 +333,7 @@ function showErr(m) { const e = document.getElementById('err'); e.textContent =
 function hideMsgs() { document.getElementById('err').classList.remove('show');
                       document.getElementById('ok').classList.remove('show'); }
 function seccion(id) {
-  ['sec-form','sec-confirmar','sec-listo','sec-reintento'].forEach(s => {
+  ['sec-form','sec-confirmar','sec-existe','sec-listo','sec-reintento'].forEach(s => {
     document.getElementById(s).style.display = (s === id) ? '' : 'none';
   });
 }
@@ -478,6 +500,25 @@ document.getElementById('btn-enviar').onclick = async () => {
     return;
   }
 
+  // Alta repetida: GoTrue NO tira error acá. Ante un correo que ya tiene cuenta
+  // confirmada responde 200 con un user obfuscado —id nuevo, metadata vacía y
+  // un confirmation_sent_at falso— y no emite ningún mail. La única marca es
+  // identities vacío. Verificado contra GoTrue de producción el 02/09/2026:
+  //   alta nueva               → identities.length === 1  (y manda el mail)
+  //   repetida, cuenta SIN confirmar → identities.length === 1  (reenvía el mail)
+  //   repetida, cuenta confirmada    → identities.length === 0  (no manda nada)
+  // Por eso el corte es === 0 y no "falsy": el reenvío a una cuenta sin
+  // confirmar tiene que seguir cayendo en "revisá tu correo".
+  // La rama de authErr de arriba queda igual: cubre el caso de que GoTrue
+  // devuelva "already registered" con la obfuscación apagada.
+  if (Array.isArray(authData.user?.identities) && authData.user.identities.length === 0) {
+    loading('btn-enviar', 'btn-txt', false, 'Enviar solicitud');
+    cfReset();
+    document.getElementById('existe-email').textContent = d.email;
+    seccion('sec-existe');
+    return;
+  }
+
   // Con "Confirm email" activo, signUp NO devuelve sesión: hay que esperar a
   // que el usuario abra el mail. Sin sesión, la RPC no puede correr todavía.
   if (!authData.session) {
```

El probe no se pega acá porque es un archivo del repo, no salida de un comando: está en
`tests/probe_solicitar_cuenta_existente.mjs` de la rama `fix/solicitar-acceso-cuenta-existente`.
Sus dos corridas crudas sí van completas, más abajo.

---

## 2 · Verificación de la señal contra GoTrue real — y un hallazgo

El pedido era confirmar que `identities` vacío **no** aparece en un alta genuina antes de dar la
señal por buena. Se verificó contra el GoTrue de producción, con cuentas `@sgh-probe.invalid`
creadas y borradas en la misma corrida. Los tres casos:

| Caso | `identities.length` | ¿manda mail? | Qué muestra la página |
|---|---|---|---|
| Alta **nueva** | **1** | sí | "revisá tu correo" ✅ |
| Repetida sobre cuenta **sin confirmar** | **1** | sí, reenvía | "revisá tu correo" ✅ |
| Repetida sobre cuenta **confirmada** (el caso de Fede) | **0** | **no** | "ese correo ya está registrado" ✅ |

**No hay falso positivo**: el camino feliz y el reenvío traen `identities.length === 1`. Por eso el
corte del código es `=== 0` y no un chequeo "falsy" — un `!identities.length` mandaría el reenvío a
la pantalla equivocada.

### El hallazgo: la señal depende de la VERSIÓN de supabase-js

GoTrue devuelve el user **sin envoltorio** (`{id, email, identities, …}` en la raíz del body).
Cómo lo mapea la librería cambió entre versiones:

- **`@supabase/supabase-js` 2.106.1** — la que está en `node_modules` del repo — hace
  `data.user ?? null` en `_sessionResponse` (`node_modules/@supabase/auth-js/dist/main/lib/fetch.js:148`).
  Como el body no tiene clave `user`, **devuelve `user: null` en todo signUp sin sesión**. Con esa
  versión la señal no existe y el fix sería código muerto.
- **2.112.4 / 2.114.0** — lo que sirve hoy `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`,
  que es el `<script>` que carga la página — **sí devuelve el user con `identities`**.

Salida cruda de la comprobación (bundle del CDN cargado en Node, mismo endpoint, secret key para
saltear Turnstile):

```
bundle cargado: function
NUEVA   → err= undefined · user= {"id":"56d99d30-bf6f-4f01-8708-9898358a428e","ident":1} · session= null
REPETIDA→ err= undefined · user= {"id":"3fcb506d-cfc0-4d47-b763-944d78a1a3f8","ident":0} · session= null
borrado dbg212c-9nhb@sgh-probe.invalid
borrado dbg212-9nhb@sgh-probe.invalid
total 10
```

Y la misma llamada con la librería de `node_modules` (2.106.1):

```
error= null
data keys= [ 'user', 'session' ]
data= {"user":null,"session":null}
```

**Consecuencia práctica**: la página pinea el major (`@2`), así que la versión que sirve el CDN es
un blanco móvil. Si el CDN volviera a la variante que nulea el `user`, el fix dejaría de actuar en
silencio. Por eso:

1. El probe corre el signUp con **el bundle que baja del CDN**, no con el de `node_modules` — si
   probara con la librería local, daría verde con un fix muerto.
2. El assert **A5** existe sólo para eso: se pone en rojo si el bundle deja de exponer
   `user.identities`, y ahí la respuesta es pinear la versión en el `<script>`.

Queda como pregunta abierta si conviene pinear la versión ya (§6).

---

## 3 · Desvío del pedido: el link de "¿olvidaste tu clave?"

El pedido decía apuntar el segundo link a `reset-password.html`. **No se hizo así**: esa página es
la *landing* del link que llega por mail, no un formulario para pedirlo. Abierta sin token muestra
"Enlace inválido o expirado" — sería mandar a la persona a un callejón sin salida. El formulario de
recuperación está en `login.html` (`showForgot()`, `login.html:207` y `:481`); `reset-password.html`
no tiene ninguna llamada a `resetPasswordForEmail` (verificado por grep, y asertado en D4).

Entonces el link va a **`login.html?recuperar=1`**, y `login.html` gana ocho líneas que abren el
panel de recuperación con ese parámetro. Es el mismo destino funcional que pedía el pedido, con un
click en vez de dos y sin pantalla de error en el medio.

---

## 4 · Probe

`tests/probe_solicitar_cuenta_existente.mjs` — código real, sin browser, patrón de `tests/README.md`.
Se extrae del propio `solicitar-acceso.html` el bloque contiguo que va de los helpers de UI hasta el
final del "camino 2" (por ancla + balance de llaves), se lo corre con `new AsyncFunction` sobre un
mini-DOM que **parsea los ids del HTML real** (pedir un id que el archivo no tiene revienta el
probe: es el guard que hace que renombrar `#sec-existe` rompa el test), y se lo alimenta con las
**respuestas reales** que devolvió GoTrue en la sección A.

Cubre lo que pedía el gate: alta nueva → `sec-confirmar` (B1-B3); alta repetida → pantalla de cuenta
existente con los dos links (B4-B6, B8, B9); camino con sesión → `portal.html` (C1). Más: que el
caso repetido no llame a la RPC (B10), que el botón quede reusable (B11), que el copy no filtre
datos de la cuenta ajena (B12), y que el reenvío a una cuenta sin confirmar NO caiga en la pantalla
nueva (B7, el falso positivo).

**Escribe en prod (auth)**: crea 3 cuentas `probe-<caso>-<run>@sgh-probe.invalid` y las borra en el
`finally`. El teardown se verifica **por estado**: se lista `auth.users`, se borra lo propio y se
aserta que no quedó ninguna (Z1) y que el total volvió al de antes (Z2) — no se confía en la lista
de ids, porque en el caso obfuscado GoTrue devuelve un id que no existe.

**Manda 2 mails por corrida** (el alta nueva y el reenvío). Van a un dominio `.invalid`, así que
rebotan en Resend. Es el precio de verificar la señal contra el servidor real; está anotado en la
cabecera del probe con la advertencia de no correrlo en loop. Los mutantes **no** los mandan: la
tanda hace **una** captura de GoTrue y los 6 hijos la reusan (`RESP_CACHE`).

### Corrida — `node tests/probe_solicitar_cuenta_existente.mjs`

```
── Probe · "ese correo ya está registrado" en solicitar-acceso.html ──
   solicitar=/home/clio/dev/SGH/solicitar-acceso.html
   login=/home/clio/dev/SGH/login.html
   run=3h814o
 ✅ A0) la página carga supabase-js del CDN por major, sin pin de versión  → bundle probado = 2.112.4
 ✅ A1) alta NUEVA: GoTrue no da error y devuelve identities con 1 entrada  → identities=1
 ✅ A2) y no devuelve sesión: falta confirmar el mail  → null
 ✅ A3) alta repetida sobre cuenta SIN confirmar: identities sigue en 1 (reenvía el mail)  → identities=1
 ✅ A3b) y es el usuario REAL, no uno obfuscado  → 8c527f24-f0ea-4819-9db2-0bf3580f316b vs 8c527f24-f0ea-4819-9db2-0bf3580f316b
 ✅ A4) alta repetida sobre cuenta CONFIRMADA: 200, sin error, identities VACÍO — el caso de Fede  → identities=[]
 ✅ A4b) el user que devuelve es obfuscado: id distinto del real  → a77571b2-c069-4852-9d13-9c070cc37e23 vs 478fea6a-6e6f-41f8-a97c-8ce09fc153a1
 ✅ A4c) y trae un confirmation_sent_at igual — por eso no sirve como señal  → 2026-09-02T23:58:06.279807386Z
 ✅ A4d) la cuenta real quedó intacta: sigue confirmada y sin mail nuevo  → 2026-09-02T23:58:06.053434Z
 ✅ A5) el bundle que carga la página SIGUE exponiendo user.identities — si esto se pone en rojo, el fix quedó en código muerto y hay que pinear la versión  → supabase-js 2.112.4
 ✅ B1) alta nueva → "revisá tu correo"
 ✅ B2) con el correo escrito en la pantalla  → probe-nuevo-3h814o@sgh-probe.invalid
 ✅ B3) y sin mostrar la pantalla de cuenta existente
 ✅ B4) alta repetida sobre confirmada → pantalla de cuenta existente
 ✅ B5) y NO "revisá tu correo" — el mail nunca se emitió
 ✅ B6) con el correo escrito, y sin decir nada más de la cuenta  → probe-confirmada-3h814o@sgh-probe.invalid
 ✅ B7) reenvío a cuenta sin confirmar → sigue siendo "revisá tu correo" (no hay falso positivo)
 ✅ B8) el link a login.html está en el HTML real  → login.html
 ✅ B9) y el de contraseña abre el panel de recuperación de login.html  → login.html?recuperar=1
 ✅ B10) el caso de cuenta existente no llama a la RPC  → []
 ✅ B11) el botón queda usable y el captcha reseteado para reintentar  → disabled=false · cfReset=1
 ✅ B12) el texto de la pantalla no nombra rol, club ni nada de la cuenta
 ✅ C1) con sesión y usuario del sistema → portal.html  → portal.html
 ✅ C2) con sesión y solicitud ya enviada → "solicitud enviada", sin redirigir  → sec-listo= · replace=undefined
 ✅ C3) con sesión, sin usuario y sin solicitud → el form sin el bloque de cuenta  → grp-cuenta=none · replace=undefined
 ✅ D1) ?recuperar=1 abre el panel de "olvidé mi contraseña"
 ✅ D2) sin el parámetro no toca nada
 ✅ D3) showForgot existe en login.html
 ✅ D4) reset-password.html sigue sin formulario para pedir el link — por eso no se linkea ahí
 ✅ Z1) teardown: no quedó ninguna cuenta de esta corrida
 ✅ Z2) y auth.users volvió al conteo de antes  → antes=10 · después=10

31/31 OK
```

### Mutantes — `node tests/probe_solicitar_cuenta_existente.mjs --mutantes`

```
═══ MUTATION TESTING · 6/6 mutantes ═══
(copias en /tmp/mut-solicitar-existe-BS6hsu — el repo no se toca)

(captura de GoTrue en /tmp/mut-solicitar-existe-BS6hsu/respuestas.json — los mutantes la reusan)

✅ M1 muere — se neutraliza el check de identities (el bug original vuelve)  [esperaba matar B4,B5; murieron B4,B5]
✅ M2 muere — la pantalla filtra datos de la cuenta ajena (enumeración por copy)  [esperaba matar B12; murieron B12]
✅ M3 muere — el corte se invierte: el alta NUEVA se toma por cuenta existente  [esperaba matar B1; murieron B1]
✅ M4 muere — seccion() no conoce sec-existe: la pantalla nunca se muestra  [esperaba matar B4; murieron B4]
✅ M5 muere — el link de recuperación apunta a reset-password.html (callejón sin salida)  [esperaba matar B9; murieron B9]
✅ M6 muere — el deep link ?recuperar=1 de login.html no abre nada  [esperaba matar D1; murieron D1]

✅ TANDA LIMPIA — 6 probados · 6 muertos
```

El mutante que pedía el gate es **M1**: neutraliza el check de `identities` (`if (false)`), o sea
devuelve el bug original. Mata B4 y B5 — las dos caras del assert del caso repetido.

Un mutante intermedio se descartó por inútil: `!identities.length === false` parecía el mutante
"falsy" pero es equivalente al original en los tres casos reales, y sobrevivía por eso, no por falta
de cobertura. Se reemplazó por M2, que ataca el copy (enumeración por texto).

---

## 5 · Lo que NO se tocó

- `rpc_solicitar_acceso`: intacta. El fix es 100% de frontend; la RPC ni se llama en el camino
  nuevo (asertado en B10).
- Flujo de aprobación (`solicitudes.html`, `rpc_aprobar_solicitud`, `rpc_rechazar_solicitud`): sin
  cambios.
- Campo de teléfono: sin cambios, queda para cuando Fede confirme.
- El "camino 2" (`solicitar-acceso.html:521-524` antes del fix): sin cambios. Verificado por C1, C2
  y C3, que corren la IIFE real: con usuario del sistema redirige a `portal.html`; con solicitud ya
  enviada muestra "solicitud enviada"; sin ninguno de los dos muestra el form sin el bloque de
  cuenta. El fix está en el handler de `#btn-enviar`, que es otro bloque.
- Nada mergeado a `main`.

---

## 6 · Preguntas abiertas

1. **¿Se pinea la versión de supabase-js en `solicitar-acceso.html`?** Hoy el `<script>` dice `@2` y
   la señal vive de que el CDN siga sirviendo ≥2.112. El assert A5 avisa, pero avisa cuando alguien
   corre el probe. Pinear `@2.114.0` en esta página la blinda; el costo es que queda distinta de las
   otras 20 páginas del repo, que usan `@2`. Decisión de producto/infra, no la tomé.
2. **¿Qué pasa con Fede?** Su cuenta es `secretario_carreras` con el mismo correo. Con el fix ahora
   ve "ese correo ya está registrado" en vez de esperar un mail, que es lo correcto — pero si de
   verdad quiere además una ficha de propietario, ese camino sigue sin existir (la RPC corta con
   "La cuenta ya tiene acceso al sistema"). Sigue abierta desde el diagnóstico anterior.
3. **¿El probe queda en la rutina?** Manda 2 mails a `.invalid` por corrida. Si molesta el ruido de
   rebotes en Resend, se puede dejar la parte A detrás de un flag y correr por defecto sólo con
   captura cacheada — pero entonces deja de verificar la señal contra el servidor.
4. **¿Se agrega la vuelta atrás?** Hoy `sec-existe` no tiene botón para volver al formulario: si la
   persona se equivocó de correo, tiene que recargar. Es un click, no lo agregué para no ensanchar
   el diff.

---

## 7 · Verificación de push

```bash
git push -u origin fix/solicitar-acceso-cuenta-existente
git ls-remote origin fix/solicitar-acceso-cuenta-existente main
git rev-parse HEAD
```

```
58f3529d11ede641368d859bb60842fa20ab1eee	refs/heads/fix/solicitar-acceso-cuenta-existente
d67726be41d17b140b8f14151558b4569b88ffb5	refs/heads/main
```

`git rev-parse HEAD` en la rama del fix: `58f3529d11ede641368d859bb60842fa20ab1eee` — coincide con
el `refs/heads/fix/solicitar-acceso-cuenta-existente` del remoto. `main` sigue en `d67726b`: **no se
mergeó nada**.
