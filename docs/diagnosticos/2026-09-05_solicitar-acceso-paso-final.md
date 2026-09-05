# solicitar-acceso: el paso 3 pasa a ser un paso — fix, diff y probe

**Fecha**: 2026-09-05
**Rama**: `fix/solicitar-acceso-paso-final` — **pusheada, SIN mergear a `main`**
**SHA del fix**: `29fec91677cecccaaa3bc60b8aa2ef68199bfdef`
**Base**: `main` en `5d95372` (merge: documentación de ISSUE-069 y GOTCHA #89)
**Diagnóstico que lo motiva**: `docs/diagnosticos/2026-09-03_fede-registro-real-sin-solicitud.md` (`b1666fc`)

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) FROM spcs;
[{"count":181}]

ref del proyecto: unlhcuanfrtpatoipwve
```

Los tres coinciden con el baseline de `CLAUDE.md` (181 al 2026-08-23).

---

## 0. Advertencia de rama, antes que nada

Al arrancar la sesión el árbol estaba parado en `reports`, y **`reports` tiene una copia vieja de
`solicitar-acceso.html`**: le falta entero el fix de ISSUE-069 (la pantalla `#sec-existe`, el pin de
`supabase-js@2.114.0` y el botón "me equivoqué de correo"). Comprobado así:

```
$ git diff main -- solicitar-acceso.html | head -5
diff --git a/solicitar-acceso.html b/solicitar-acceso.html
index f8c4d6c..f946d4a 100644
--- a/solicitar-acceso.html
+++ b/solicitar-acceso.html
@@ -233,33 +233,6 @@
```

El trabajo se hizo sobre una rama sacada de **`main`**, no de `reports`:

```
$ git checkout -b fix/solicitar-acceso-paso-final main
Switched to a new branch 'fix/solicitar-acceso-paso-final'
$ git log --oneline -1
5d95372 merge: documentación de ISSUE-069 y GOTCHA #89
```

Es exactamente el caso que el protocolo de `CLAUDE.md` marca como trampa: si el fix se hubiera
escrito sobre la copia de `reports`, el merge habría revertido ISSUE-069 en silencio.

---

## 1. El problema

El circuito de registro tiene **tres** pasos:

| # | Paso | Dónde |
|---|---|---|
| 1 | Llenar el formulario y crear la cuenta | `sec-form` → `sb.auth.signUp` |
| 2 | Confirmar el correo | link del mail de GoTrue |
| 3 | **Enviar la solicitud** | volver a la página → `rpc_solicitar_acceso` |

El paso 3 no se leía como un paso. Dos causas, las dos de lectura y no de código:

- **`sec-confirmar` decía**: *"Abrilo y volvés acá para terminar la solicitud."* El que clickea el
  link del mail **ya está "acá"**. La frase no le anticipa que va a tener que apretar un botón.
- **Al volver**, el camino 2 re-mostraba **el mismo formulario** con los datos precargados. Ver los
  campos llenos se lee como "ya está cargado" → cerrar la pestaña.

Resultado en el primer usuario real (03/09/2026): cuenta viva y confirmada en `auth.users`,
`solicitudes_acceso` **vacía**. La bandeja de la secretaría sólo lee `solicitudes_acceso`, así que
esa persona quedó invisible: nadie sabe que existe y nadie tiene a quién llamar.

Con el link de registro publicado, esto le pasa a la mayoría — no es un usuario distraído.

## 2. Lo que se descartó, y por qué

Llamar a `enviarSolicitud()` sola al detectar sesión + borrador. **No va**: manda sin que la persona
revise lo que se envía, y arrastra el riesgo de un borrador viejo guardado en `localStorage` de otra
sesión. La solución es hacer el paso **inconfundible**, no saltearlo. Queda asentado en ISSUE-070
para que no se re-discuta.

## 3. Lo que se hizo

### 3.1 Pantalla nueva `#sec-falta` — "Ya casi"

Se muestra en la rama del camino 2 donde hay **sesión**, **no hay fila en `usuarios`**, **no hay
solicitud** y el borrador **pasa `validar(b, false)`**. En vez del formulario:

- Título **"Ya casi"** (distinto de "Falta un paso", que ya lo usa `#sec-reintento` para el error de
  RPC — son dos pantallas y no tienen que confundirse).
- Bajada: *"Tu correo quedó confirmado. **La solicitud todavía no está enviada**: revisá los datos y
  tocá el botón para mandarla a la secretaría."*
- **Ficha de sólo lectura** con nombre y apellido, DNI, rol, caballeriza (propietario), hipódromo de
  origen con la etiqueta del rol, patente (entrenador, si la cargó) y teléfono (si lo cargó).
  **Cero `<input>`** — eso es lo que la hace imposible de leer como formulario.
- **Un** botón grande: `Enviar solicitud`.
- Un link secundario, `corregir mis datos`, que despliega el formulario precargado — el
  comportamiento anterior, intacto, detrás de un click.

La ficha se pinta con `textContent` sobre filas que **ya existen en el HTML** con id propio: nada de
`innerHTML` con datos de la DB (ISSUE-018), y los ids quedan verificables desde el probe (el
mini-DOM revienta si el código pide un id que el archivo no tiene).

### 3.2 Sin borrador utilizable

Sesión, sin usuario, sin solicitud y borrador **vacío o incompleto** (confirmó en otro dispositivo,
o se limpió el `localStorage`): va el formulario, con el bloque de cuenta escondido, y con
**subtítulo propio**:

> Tu correo ya está confirmado, pero todavía falta la solicitud. Completá los datos y enviala.

Distinto del genérico del alta (*"Completá tus datos y la secretaría del hipódromo va a revisar la
solicitud"*) y distinto del de corrección. El corte es literalmente `validar(b, false)`: si el
borrador no pasa la misma validación que usa el envío, va por acá.

Lo que sí tenía el borrador roto queda precargado igual — no se le hace escribir de nuevo lo que ya
estaba.

### 3.3 Texto de `sec-confirmar`

Se sacó *"Abrilo y volvés acá para terminar la solicitud"* y se puso, en párrafo aparte y destacado:

> **Ojo: con eso todavía no queda enviada.** Al volver a esta página vas a ver tus datos y un botón
> **Enviar solicitud**: recién cuando lo apretás le llega a la secretaría.

El usuario sale de esa pantalla sabiendo que le falta un paso y con el nombre del botón que va a
tener que apretar.

### 3.4 Lo que NO se tocó

- `rpc_solicitar_acceso` — sin cambios (fuera de alcance).
- La vista de cuentas huérfanas — **no se construyó**; va como ISSUE-071 con criterio de activación
  (§7).
- La cuenta de `fedeiguacel3@hotmail.com` — **no se tocó**. La termina él por el camino real, que es
  la prueba de campo que falta.
- Las otras ramas del camino 2: con fila en `usuarios` → `portal.html`; con solicitud →
  `sec-listo`; sin sesión, el alta sigue yendo a `sec-confirmar`.

---

## 4. Diff completo

```
 CHANGELOG.md                               |  56 ++++
 CLAUDE.md                                  |   1 +
 docs/ISSUES.md                             |  90 +++++
 solicitar-acceso.html                      | 188 ++++++++++-
 tests/README.md                            |  12 +
 tests/probe_solicitar_cuenta_existente.mjs |  11 +-
 tests/probe_solicitar_falta_paso.mjs       | 517 +++++++++++++++++++++++++++++
 7 files changed, 854 insertions(+), 21 deletions(-)
```

### 4.1 `solicitar-acceso.html`

```diff
diff --git a/solicitar-acceso.html b/solicitar-acceso.html
index f8c4d6c..41bfbf7 100644
--- a/solicitar-acceso.html
+++ b/solicitar-acceso.html
@@ -90,6 +90,28 @@
     }
     @keyframes sp { to { transform: rotate(360deg); } }
     .ok-icon { font-size: 40px; text-align: center; margin-bottom: 10px; }
+    /* Resumen de "Ya casi": tiene que leerse como una ficha ya cargada, no como
+       un formulario. Sin inputs, sin bordes de campo, sin nada clickeable. */
+    .resumen {
+      background: rgba(0,0,0,0.22); border: 1px solid var(--verde-borde);
+      border-radius: 10px; padding: 4px 14px; margin-bottom: 18px;
+    }
+    /* Borde ARRIBA y no abajo: las filas opcionales (patente, teléfono) están al final y
+       se esconden según el rol y lo que haya cargado. Con border-bottom, esconder la última
+       dejaba una línea colgando; con border-top el corte siempre cae entre dos visibles. */
+    .res-row {
+      display: flex; gap: 12px; justify-content: space-between; align-items: baseline;
+      padding: 9px 0; border-top: 1px solid rgba(36,80,51,0.55);
+    }
+    .res-row:first-child { border-top: none; }
+    .res-k { color: var(--gris); font-size: 12.5px; flex: 0 0 auto; }
+    .res-v { color: var(--crema); font-size: 14px; font-weight: 500; text-align: right; word-break: break-word; }
+    .lnk-sec {
+      display: block; width: 100%; margin-top: 12px; padding: 4px;
+      background: none; border: none; font-family: inherit; font-size: 13px;
+      color: var(--gris); text-decoration: underline; cursor: pointer; text-align: center;
+    }
+    .lnk-sec:hover { color: var(--oro-suave); }
   </style>
 </head>
 <body>
@@ -226,10 +248,20 @@
       <h2 class="card-title" style="text-align:center;">Revisá tu correo</h2>
       <p class="card-sub" style="text-align:center;">
         Te mandamos un mail a <strong id="conf-email"></strong> para confirmar la dirección.
-        Abrilo y volvés acá para terminar la solicitud.
+      </p>
+      <!-- El texto anterior decía "abrilo y volvés acá para terminar la solicitud". El que
+           clickea el link del mail YA está "acá", así que lo leía como que había terminado:
+           veía el formulario precargado, lo tomaba por confirmación y cerraba. Le pasó al
+           primer usuario real (03/09/2026) y la solicitud nunca se creó. Ahora la pantalla
+           dice el número de pasos y nombra el botón que va a tener que apretar. -->
+      <p class="card-sub" style="text-align:center;">
+        <strong style="color:var(--oro-suave);">Ojo: con eso todavía no queda enviada.</strong>
+        Al volver a esta página vas a ver tus datos y un botón
+        <strong style="color:var(--oro-suave);">Enviar solicitud</strong>:
+        recién cuando lo apretás le llega a la secretaría.
       </p>
       <p class="card-sub" style="text-align:center;">
-        Si no lo ves, mirá en correo no deseado.
+        Si no ves el mail, mirá en correo no deseado.
       </p>
     </div>
 
@@ -260,6 +292,51 @@
       </button>
     </div>
 
+    <!-- ===== FALTA ENVIAR (volvió de confirmar el mail) ===== -->
+    <!-- Esta pantalla existe porque re-mostrar el formulario NO se lee como un paso: el que
+         vuelve de confirmar el correo ve campos con sus datos y entiende "ya está cargado".
+         Es exactamente lo que pasó el 03/09/2026 — cuenta confirmada, cero solicitud, invisible
+         para la secretaría. Se descartó a propósito mandar la RPC sola al detectar sesión +
+         borrador: eso envía sin que la persona revise, y arrastra el riesgo de un borrador
+         viejo. La solución es hacer el paso inconfundible, no saltearlo: ficha de sólo lectura
+         (sin un input a la vista) y un único botón grande. -->
+    <div id="sec-falta" style="display:none;">
+      <div class="ok-icon">📝</div>
+      <h2 class="card-title" style="text-align:center;">Ya casi</h2>
+      <p class="card-sub" style="text-align:center;">
+        Tu correo quedó confirmado. <strong style="color:var(--oro-suave);">La solicitud
+        todavía no está enviada</strong>: revisá los datos y tocá el botón para mandarla
+        a la secretaría.
+      </p>
+      <div class="resumen" id="falta-resumen">
+        <div class="res-row" id="res-row-nombre">
+          <span class="res-k">Nombre</span><span class="res-v" id="res-nombre"></span>
+        </div>
+        <div class="res-row" id="res-row-dni">
+          <span class="res-k">DNI</span><span class="res-v" id="res-dni"></span>
+        </div>
+        <div class="res-row" id="res-row-rol">
+          <span class="res-k">Soy</span><span class="res-v" id="res-rol"></span>
+        </div>
+        <div class="res-row" id="res-row-caballeriza">
+          <span class="res-k">Caballeriza</span><span class="res-v" id="res-caballeriza"></span>
+        </div>
+        <div class="res-row" id="res-row-hipodromo">
+          <span class="res-k" id="res-k-hipodromo">Hipódromo</span><span class="res-v" id="res-hipodromo"></span>
+        </div>
+        <div class="res-row" id="res-row-patente">
+          <span class="res-k">Patente</span><span class="res-v" id="res-patente"></span>
+        </div>
+        <div class="res-row" id="res-row-tel">
+          <span class="res-k">Teléfono</span><span class="res-v" id="res-tel"></span>
+        </div>
+      </div>
+      <button class="btn" id="btn-falta-enviar">
+        <span id="btn-falta-txt">Enviar solicitud</span>
+      </button>
+      <button class="lnk-sec" id="btn-falta-corregir">Corregir mis datos</button>
+    </div>
+
     <!-- ===== SOLICITUD ENVIADA ===== -->
     <div id="sec-listo" style="display:none;">
       <div class="ok-icon">✅</div>
@@ -347,7 +424,7 @@ function showErr(m) { const e = document.getElementById('err'); e.textContent =
 function hideMsgs() { document.getElementById('err').classList.remove('show');
                       document.getElementById('ok').classList.remove('show'); }
 function seccion(id) {
-  ['sec-form','sec-confirmar','sec-existe','sec-listo','sec-reintento'].forEach(s => {
+  ['sec-form','sec-confirmar','sec-existe','sec-falta','sec-listo','sec-reintento'].forEach(s => {
     document.getElementById(s).style.display = (s === id) ? '' : 'none';
   });
 }
@@ -577,6 +654,79 @@ document.getElementById('btn-volver-form').onclick = () => {
   document.getElementById('f-email').focus();
 };
 
+// --- Pantalla "Ya casi": ficha del borrador + un solo botón ----------------
+// Se pinta con textContent sobre filas que ya existen en el HTML: nada de innerHTML con
+// datos (ISSUE-018), y los ids quedan verificables desde el probe.
+function pintarResumen(d) {
+  const esProp = d.rol === 'propietario';
+  const set = (id, v) => { document.getElementById(id).textContent = v || '—'; };
+  const fila = (id, on) => { document.getElementById(id).style.display = on ? '' : 'none'; };
+
+  set('res-nombre', `${d.nombre || ''} ${d.apellido || ''}`.trim());
+  set('res-dni', d.dni);
+  set('res-rol', esProp ? 'Propietario' : 'Entrenador');
+  set('res-caballeriza', d.origenCaballeriza);
+  set('res-hipodromo', d.origenHipodromo);
+  set('res-patente', d.origenPatente);
+  set('res-tel', d.telefono);
+
+  // La etiqueta del hipódromo cambia con el rol: es el dato que la secretaría usa para
+  // llamar a validar, y de un propietario se valida la caballeriza, no una patente.
+  document.getElementById('res-k-hipodromo').textContent =
+    esProp ? 'Hipódromo de la caballeriza' : 'Hipódromo de la patente';
+
+  fila('res-row-caballeriza', esProp);
+  fila('res-row-patente', !esProp && !!d.origenPatente);
+  fila('res-row-tel', !!d.telefono);
+}
+
+// Precarga del formulario con el borrador. La usan los dos caminos de "ya confirmó el mail":
+// el que corrige desde la ficha y el que llega sin borrador utilizable.
+function precargarForm(b) {
+  if (b.nombre)   document.getElementById('f-nombre').value = b.nombre;
+  if (b.apellido) document.getElementById('f-apellido').value = b.apellido;
+  if (b.dni)      document.getElementById('f-dni').value = b.dni;
+  if (b.telefono) document.getElementById('f-tel').value = b.telefono;
+  // setRol ANTES de pintar el origen: es lo que decide qué bloque queda visible.
+  if (b.rol)      setRol(b.rol);
+  if (b.origenHipodromo) {
+    const id = (b.rol === 'propietario') ? 'f-hip-prop' : 'f-hip-prof';
+    document.getElementById(id).value = b.origenHipodromo;
+  }
+  if (b.origenPatente)     document.getElementById('f-patente').value = b.origenPatente;
+  if (b.origenCaballeriza) document.getElementById('f-caballeriza').value = b.origenCaballeriza;
+}
+
+// El formulario precargado, detrás del link "corregir mis datos". El bloque de cuenta queda
+// escondido: la cuenta ya existe y el correo ya está confirmado.
+function abrirFormCorreccion() {
+  document.getElementById('grp-cuenta').style.display = 'none';
+  document.getElementById('sub-form').textContent =
+    'Corregí lo que haga falta y tocá Enviar solicitud. Tu correo ya está confirmado.';
+  seccion('sec-form');
+  document.getElementById('f-nombre').focus();
+}
+
+// El botón grande de "Ya casi". Manda la RPC con el borrador tal como se mostró en la ficha:
+// lo que se ve es lo que se envía.
+document.getElementById('btn-falta-enviar').onclick = async () => {
+  hideMsgs();
+  const d = JSON.parse(localStorage.getItem(BORRADOR) || '{}');
+  const err = validar(d, false);
+  // Defensivo: a la ficha sólo se llega con un borrador que ya pasó validar(). Si algo lo
+  // dejó incompleto entremedio (otra pestaña, storage tocado a mano), abrir el formulario
+  // en vez de mandar una solicitud coja.
+  if (err) { showErr(err); abrirFormCorreccion(); return; }
+  loading('btn-falta-enviar', 'btn-falta-txt', true);
+  const e = await enviarSolicitud(d);
+  loading('btn-falta-enviar', 'btn-falta-txt', false, 'Enviar solicitud');
+  if (e) { showErr(mensajeRpc(e)); return; }
+  localStorage.removeItem(BORRADOR);
+  seccion('sec-listo');
+};
+
+document.getElementById('btn-falta-corregir').onclick = () => { hideMsgs(); abrirFormCorreccion(); };
+
 // --- Camino 2: ya logueado (volvió de confirmar el email) -------------------
 (async () => {
   const { data: { session } } = await sb.auth.getSession();
@@ -592,23 +742,27 @@ document.getElementById('btn-volver-form').onclick = () => {
     .select('id').eq('auth_user_id', session.user.id).maybeSingle();
   if (sol) { seccion('sec-listo'); return; }
 
-  // Logueado, sin usuario y sin solicitud: sólo faltan los datos.
+  // Logueado, sin usuario y sin solicitud: la cuenta está, la solicitud NO.
   document.getElementById('grp-cuenta').style.display = 'none';
-  document.getElementById('sub-form').textContent =
-    'Ya confirmaste tu correo. Revisá los datos y enviá la solicitud.';
   const b = JSON.parse(localStorage.getItem(BORRADOR) || '{}');
-  if (b.nombre)   document.getElementById('f-nombre').value = b.nombre;
-  if (b.apellido) document.getElementById('f-apellido').value = b.apellido;
-  if (b.dni)      document.getElementById('f-dni').value = b.dni;
-  if (b.telefono) document.getElementById('f-tel').value = b.telefono;
-  // setRol ANTES de pintar el origen: es lo que decide qué bloque queda visible.
-  if (b.rol)      setRol(b.rol);
-  if (b.origenHipodromo) {
-    const id = (b.rol === 'propietario') ? 'f-hip-prop' : 'f-hip-prof';
-    document.getElementById(id).value = b.origenHipodromo;
+  precargarForm(b);
+
+  if (!validar(b, false)) {
+    // Con borrador completo NO se re-muestra el formulario. El que llega acá ya lo llenó
+    // una vez: ver los mismos campos con sus datos se lee como "ya está hecho", cierra la
+    // pestaña y la solicitud nunca se crea (pasó el 03/09/2026, primer usuario real).
+    // Tampoco se manda sola la RPC: eso enviaría sin que la persona revise, y el borrador
+    // puede ser viejo. Ficha + un botón.
+    pintarResumen(b);
+    seccion('sec-falta');
+  } else {
+    // Sin borrador utilizable: confirmó el mail en otro dispositivo, o el localStorage se
+    // limpió. Hay que pedir los datos de nuevo — pero con un texto que deje claro que la
+    // solicitud sigue sin enviarse, no el "completá tus datos" genérico del alta.
+    document.getElementById('sub-form').textContent =
+      'Tu correo ya está confirmado, pero todavía falta la solicitud. Completá los datos y enviala.';
+    seccion('sec-form');
   }
-  if (b.origenPatente)     document.getElementById('f-patente').value = b.origenPatente;
-  if (b.origenCaballeriza) document.getElementById('f-caballeriza').value = b.origenCaballeriza;
 })();
 </script>
 </body>
```

### 4.2 `tests/probe_solicitar_cuenta_existente.mjs` — dos anclas, nada más

El probe de ISSUE-069 lee el **mismo archivo**, así que había que reacomodarle dos anclas o se
volvía verde-mentiroso (un mutante con ancla rota se reporta como `ERROR DE ARNÉS`, no como muerto).
Se mantuvo intacta la nota de **"A DEMANDA, no en la rutina"** y no se lo sumó a ninguna rutina.

```diff
diff --git a/tests/probe_solicitar_cuenta_existente.mjs b/tests/probe_solicitar_cuenta_existente.mjs
index 3732fc4..dcd5ff1 100644
--- a/tests/probe_solicitar_cuenta_existente.mjs
+++ b/tests/probe_solicitar_cuenta_existente.mjs
@@ -197,8 +197,8 @@ const MUTANTES = [
     to:  `authData.user.identities.length >= 0) {` },
 
   { id:'M4', desc:'seccion() no conoce sec-existe: la pantalla nunca se muestra', mata:['B4'],
-    from:`  ['sec-form','sec-confirmar','sec-existe','sec-listo','sec-reintento'].forEach(s => {`,
-    to:  `  ['sec-form','sec-confirmar','sec-listo','sec-reintento'].forEach(s => {` },
+    from:`  ['sec-form','sec-confirmar','sec-existe','sec-falta','sec-listo','sec-reintento'].forEach(s => {`,
+    to:  `  ['sec-form','sec-confirmar','sec-falta','sec-listo','sec-reintento'].forEach(s => {` },
 
   { id:'M5', desc:'el link de recuperación apunta a reset-password.html (callejón sin salida)',
     mata:['B9'],
@@ -412,7 +412,7 @@ const CACHE = process.env.RESP_CACHE ? JSON.parse(readFileSync(process.env.RESP_
        `disabled=${b2.dom._n['btn-enviar'].disabled} · cfReset=${b2.p.cf.reset}`);
     ok('B12) el texto de la pantalla no nombra rol, club ni nada de la cuenta',
        !/secretari|propietario habilitado|club|hipódromo de/i.test(
-         HTML.slice(HTML.indexOf('<div id="sec-existe"'), HTML.indexOf('<!-- ===== SOLICITUD ENVIADA'))));
+         HTML.slice(HTML.indexOf('<div id="sec-existe"'), HTML.indexOf('<!-- ===== FALTA ENVIAR'))));
 
     // ── C) EL CAMINO 2 (YA LOGUEADO) SIGUE INTACTO ──────────────────────────
     const SES = { user:{ id:'uid-probe' } };
@@ -430,7 +430,10 @@ const CACHE = process.env.RESP_CACHE ? JSON.parse(readFileSync(process.env.RESP_
 
     const domC3 = mkDom(FORM('x@y.com'));
     const c3 = await mkPagina({ dom: domC3, session: SES, tablas: { usuarios:null, solicitudes_acceso:null } });
-    ok('C3) con sesión, sin usuario y sin solicitud → el form sin el bloque de cuenta',
+    // Sin borrador en localStorage. Con borrador válido esta misma rama muestra la ficha
+    // "Ya casi" en vez del formulario — eso lo cubre entero tests/probe_solicitar_falta_paso.mjs,
+    // que no toca la red. Acá sólo se verifica que el fix de "cuenta existente" no la rompió.
+    ok('C3) con sesión, sin usuario, sin solicitud y sin borrador → el form sin el bloque de cuenta',
        domC3._n['grp-cuenta'].style.display === 'none' && c3.loc.reemplazo === undefined,
        `grp-cuenta=${domC3._n['grp-cuenta'].style.display} · replace=${c3.loc.reemplazo}`);
 
```

El archivo nuevo `tests/probe_solicitar_falta_paso.mjs` no se pega acá como diff porque es un alta
completa: está en la rama, y su cabecera explica el patrón. Lo que hace se resume en §5.

---

## 5. Probe nuevo — `tests/probe_solicitar_falta_paso.mjs`

Mismo patrón que el de ISSUE-069 (`tests/README.md` § *Browser NO disponible*): se extrae del propio
`solicitar-acceso.html`, por ancla y balance de llaves, el bloque real que va de `function showErr`
al final del camino 2 —`pintarResumen`, `precargarForm`, `abrirFormCorreccion` y los dos handlers
nuevos caen adentro solos— y se lo corre con `new AsyncFunction` sobre un mini-DOM que **parsea los
ids del archivo**. Nada se reimplementa: si el HTML cambia, el probe corre el HTML cambiado.

**Diferencia clave con `probe_solicitar_cuenta_existente.mjs`: no toca la red y no pide
credenciales.** Lo que se prueba son ramas de UI —qué pantalla sale según sesión / fila en
`usuarios` / solicitud / borrador— y las respuestas de esas dos tablas son el *input* de la
decisión, no algo que haya que descubrir en prod. Entonces van como stub. Consecuencia práctica:
**no manda mails, no planta cuentas, no escribe una fila**, y se puede correr las veces que haga
falta y meter en cualquier rutina.

Los dos probes tocan el mismo archivo y se confunden fácil, así que la cabecera de cada uno lo dice
en letra grande.

### 5.1 Corrida — salida cruda completa

```
$ node tests/probe_solicitar_falta_paso.mjs

── Probe · pantalla "Ya casi" (paso final) en solicitar-acceso.html ──
   solicitar=/home/clio/dev/SGH/solicitar-acceso.html
 ✅ P1) sesión + sin usuario + sin solicitud + borrador válido → pantalla "Ya casi", y el formulario NO se muestra  → sec-falta="" · sec-form="none" · replace=undefined
 ✅ P2) la ficha muestra los datos del borrador, legibles  → nombre=Federico Iguacel · dni=23456789 · rol=Propietario · caballeriza=Stud La Yaya · hip=Tandil · tel=5492245123456
 ✅ P2b) propietario: se ve la caballeriza y no la patente, y la etiqueta del hipódromo es la de la caballeriza  → caballeriza=true · patente=false · etiqueta=Hipódromo de la caballeriza
 ✅ P3) entrenador: patente visible, caballeriza escondida, etiqueta de hipódromo la de la patente  → rol=Entrenador · patente=true/AZ-4412 · caballeriza=false · etiqueta=Hipódromo de la patente
 ✅ P3b) el teléfono vacío no deja una fila en blanco  → res-row-tel="none"
 ✅ P3c) la patente es opcional: sin ella, la fila tampoco aparece  → patente="none"
 ✅ P4) "Enviar solicitud" llama a rpc_solicitar_acceso con los datos de la ficha  → [{"fn":"rpc_solicitar_acceso","args":{"p_nombre":"Federico","p_apellido":"Iguacel","p_documento_nro":"23456789","p_telefono":"5492245123456","p_rol_pedido":"propietario","p_club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","p_origen_hipodromo":"Tandil","p_origen_patente_nro":null,"p_origen_caballeriza":"Stud La Yaya"}}]
 ✅ P4b) y después muestra "solicitud enviada" y limpia el borrador  → sec-listo="" · borrador=null
 ✅ P4c) si la RPC falla, no dice "enviada" y el borrador sobrevive para reintentar  → sec-listo="none" · err=Esta cuenta ya envió una solicitud. La secretaría la va a revisar.
 ✅ P5) "corregir mis datos" despliega el formulario y esconde la ficha  → sec-form="" · sec-falta="none"
 ✅ P5b) y viene precargado con el borrador, sin pedir la cuenta de nuevo  → nombre=Federico · dni=23456789 · hip=Tandil · grp-cuenta="none"
 ✅ P5c) con el rol del borrador ya elegido y el bloque de origen correcto  → origen-prop="" · origen-prof="none"
 ✅ P5d) el subtítulo del formulario dice que todavía hay que enviar  → sub=Corregí lo que haga falta y tocá Enviar solicitud. Tu correo ya está confirmado. · focus=1
 ✅ P5e) desde el formulario corregido, "Enviar solicitud" manda la RPC y no re-crea la cuenta  → [{"fn":"rpc_solicitar_acceso","args":{"p_nombre":"Federico","p_apellido":"Iguacel","p_documento_nro":"23456789","p_telefono":"5492245123456","p_rol_pedido":"propietario","p_club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","p_origen_hipodromo":"Tandil","p_origen_patente_nro":null,"p_origen_caballeriza":"Stud La Yaya"}}]
 ✅ P6) sin borrador (otro dispositivo, localStorage limpio) → el formulario, no la ficha  → sec-form="" · sec-falta="none"
 ✅ P6b) con un texto propio: dice que el correo quedó confirmado y que la solicitud FALTA  → sub=Tu correo ya está confirmado, pero todavía falta la solicitud. Completá los datos y enviala.
 ✅ P7) borrador que no pasa validar() → mismo camino que sin borrador, nunca la ficha  → sec-falta="none" · sub=Tu correo ya está confirmado, pero todavía falta la solicitud. Completá los datos y enviala.
 ✅ P7b) y lo que sí tenía el borrador roto queda precargado, no se pierde  → nombre=Federico · hip=""
 ✅ P8) con fila en usuarios → sigue redirigiendo a portal.html, sin mostrar la ficha  → replace=portal.html · sec-falta=undefined
 ✅ P9) con solicitud ya enviada → sigue mostrando "solicitud enviada", sin ficha ni redirect  → sec-listo="" · replace=undefined
 ✅ P10) alta nueva sin sesión → "revisá tu correo", y NO la ficha  → sec-confirmar="" · conf-email=probe@sgh-probe.invalid
 ✅ P10b) y el borrador queda guardado para cuando vuelva de confirmar  → {"nombre":"Juan","apellido":"Probe","dni":"12345678","telefono":"5492245123456","rol":"propietario","origenHipodromo":"Tandil","origenPatente":"","origenCaballeriza":"Stud Probe","email":"probe@sgh-probe.invalid","pass":"Probe12345!"}
 ✅ P11) "revisá tu correo" avisa que la solicitud NO queda enviada y nombra el botón  → <div id="sec-confirmar" style="display:none;"> <div class="ok-icon">📬</div> <h2 class="card-title" style="text-align:center;">Revisá tu correo</h2> <p class="card-sub" style="text-align:center;"> Te mandamos un mail a <strong id="conf-email"></strong> para confirmar la dirección. </p> <p class="card-sub" style="text-a
 ✅ P12) la ficha no tiene un solo <input>: no se lee como formulario
 ✅ P12b) tiene un único botón de envío, y el de corregir es un link secundario  → <button class="btn" id="btn-falta-enviar"> | <button class="lnk-sec" id="btn-falta-corregir">
 ✅ P12c) y su título es distinto del de sec-reintento — son dos pantallas, no una  → falta=Ya casi
 ✅ P13) si el borrador se rompió entremedio, el botón NO manda la RPC y abre el formulario  → rpc=[] · sec-form=""

27/27 OK
exit=0
```

Cobertura assert por assert, contra lo pedido:

| Pedido | Assert |
|---|---|
| sesión + sin usuario + sin solicitud + borrador válido → "Falta un paso", NO el formulario | P1 |
| …con el resumen legible de los datos | P2, P2b, P3, P3b, P3c |
| …y el botón grande manda la solicitud | P4, P4b, P4c |
| el link de corregir despliega el formulario precargado | P5, P5b, P5c, P5d, P5e |
| borrador vacío → formulario con texto propio | P6, P6b |
| borrador inválido (no pasa `validar`) → mismo camino | P7, P7b |
| con fila en `usuarios` → sigue redirigiendo a `portal.html` | P8 |
| con solicitud existente → sigue mostrando `sec-listo` | P9 |
| alta nueva sin sesión → sigue mostrando `sec-confirmar` | P10, P10b |
| el texto de `sec-confirmar` anticipa el paso que falta | P11 |
| la ficha no se puede confundir con el formulario | P12, P12b, P12c |
| (defensa) borrador roto entremedio no manda una solicitud coja | P13 |

### 5.2 Mutation testing — uno por rama, salida cruda completa

```
$ node tests/probe_solicitar_falta_paso.mjs --mutantes

═══ MUTATION TESTING · 12/12 mutantes ═══
(copias en /tmp/mut-solicitar-falta-5lZIaH — el repo no se toca)

✅ N1 muere — el camino 2 vuelve a re-mostrar el formulario (el bug original vuelve)  [esperaba matar P1,P2; murieron P1,P2]
✅ N2 muere — la condición se invierte: ficha con borrador roto, formulario con borrador bueno  [esperaba matar P1,P6; murieron P1,P6]
✅ N3 muere — seccion() no conoce sec-falta: la pantalla nunca se muestra  [esperaba matar P1; murieron P1]
✅ N4 muere — "corregir mis datos" no despliega el formulario  [esperaba matar P5; murieron P5]
✅ N5 muere — el botón de la ficha da "enviada" sin llamar a la RPC  [esperaba matar P4; murieron P4]
✅ N6 muere — sin borrador, el form usa el texto genérico del alta (no dice que falta la solicitud)  [esperaba matar P6b; murieron P6b]
✅ N7 muere — sec-confirmar vuelve al texto viejo: no anticipa el paso que falta  [esperaba matar P11; murieron P11]
✅ N8 muere — la etiqueta del hipódromo no cambia con el rol  [esperaba matar P3; murieron P3]
✅ N9 muere — la ficha se muestra vacía: el resumen no se pinta  [esperaba matar P2; murieron P2]
✅ N10 muere — la fila de caballeriza se muestra siempre, también para el entrenador  [esperaba matar P3; murieron P3]
✅ N11 muere — con usuario en el sistema ya no redirige a portal.html  [esperaba matar P8; murieron P8]
✅ N12 muere — la ficha manda la RPC aunque el borrador esté incompleto  [esperaba matar P13; murieron P13]

✅ TANDA LIMPIA — 12 probados · 12 muertos

exit=0
```

Los 12 mutantes, y qué rama tapa cada uno:

| Mutante | Rama que rompe |
|---|---|
| N1 | el camino 2 vuelve a re-mostrar el formulario — **el bug original** |
| N2 | la condición del borrador se invierte |
| N3 | `seccion()` no conoce `sec-falta` |
| N4 | el link de corregir no despliega el formulario |
| N5 | el botón de la ficha dice "enviada" sin llamar a la RPC |
| N6 | el camino "sin borrador" usa el texto genérico del alta |
| N7 | `sec-confirmar` vuelve al texto viejo |
| N8 | la etiqueta del hipódromo no cambia con el rol |
| N9 | la ficha se muestra vacía (no se pinta el resumen) |
| N10 | la fila de caballeriza se muestra también al entrenador |
| N11 | con usuario en el sistema ya no redirige a `portal.html` |
| N12 | la ficha manda la RPC con un borrador incompleto |

Dos hallazgos del propio arnés, corregidos durante la corrida y que vale la pena dejar asentados:

- **N6 sobrevivía** porque el mutante declaraba matar `P6` cuando el assert del texto es `P6b`. El
  mutante estaba bien; la declaración estaba mal. Un `mata:` mal apuntado convierte un mutante en
  decoración.
- **N11 sobrevivía** por un crash, no por falta de cobertura: la **nota** del assert leía
  `d8._n['sec-falta'].style.display`, y con ese mutante ese nodo nunca se crea en el mini-DOM. El
  probe moría antes de imprimir `❌ P8)` y el runner lo contaba como SOBREVIVE. Se agregó
  `dsp(id)` / `est(id)` al mini-DOM para que las notas no puedan reventar. **Una nota que rompe
  convierte una muerte en un falso "sobrevive"** — es el mismo agujero que el `ERROR DE ARNÉS` que
  el runner ya detectaba, pero por adentro del probe.

---

## 6. El probe de ISSUE-069, re-corrido sobre el archivo cambiado

Toca el mismo archivo, así que se lo corrió entero **después** del cambio. Sigue siendo **a
demanda**: cada corrida hace dos altas reales contra GoTrue, o sea **dos mails que rebotan** en
Resend. No se lo sumó a ninguna rutina y la nota de su cabecera quedó tal cual.

```
$ set -a; . ./.env; set +a
$ node tests/probe_solicitar_cuenta_existente.mjs

── Probe · "ese correo ya está registrado" en solicitar-acceso.html ──
   solicitar=/home/clio/dev/SGH/solicitar-acceso.html
   login=/home/clio/dev/SGH/login.html
   run=fssagx
 ✅ A0) la página pinea una versión EXACTA de supabase-js, y el probe corre ESA  → https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.114.0 → bundle probado = 2.114.0
 ✅ A1) alta NUEVA: GoTrue no da error y devuelve identities con 1 entrada  → identities=1
 ✅ A2) y no devuelve sesión: falta confirmar el mail  → null
 ✅ A3) alta repetida sobre cuenta SIN confirmar: identities sigue en 1 (reenvía el mail)  → identities=1
 ✅ A3b) y es el usuario REAL, no uno obfuscado  → 124b8f0d-38c1-4feb-b123-e29cca04dc45 vs 124b8f0d-38c1-4feb-b123-e29cca04dc45
 ✅ A4) alta repetida sobre cuenta CONFIRMADA: 200, sin error, identities VACÍO — el caso de Fede  → identities=[]
 ✅ A4b) el user que devuelve es obfuscado: id distinto del real  → 14838c24-bd5e-4465-af9c-7b1980d93f1d vs cfac3f5d-6b70-48d8-8ce3-136943e15fc3
 ✅ A4c) y trae un confirmation_sent_at igual — por eso no sirve como señal  → 2026-09-05T05:18:20.687971978Z
 ✅ A4d) la cuenta real quedó intacta: sigue confirmada y sin mail nuevo  → 2026-09-05T05:18:20.45314Z
 ✅ A5) CANARIO — la versión pineada SIGUE exponiendo user.identities; en rojo, el corte quedó en código muerto y hay que revisar el pin antes de tocar nada más  → supabase-js 2.114.0
 ✅ B1) alta nueva → "revisá tu correo"
 ✅ B2) con el correo escrito en la pantalla  → probe-nuevo-fssagx@sgh-probe.invalid
 ✅ B3) y sin mostrar la pantalla de cuenta existente
 ✅ B4) alta repetida sobre confirmada → pantalla de cuenta existente
 ✅ B5) y NO "revisá tu correo" — el mail nunca se emitió
 ✅ B6) con el correo escrito, y sin decir nada más de la cuenta  → probe-confirmada-fssagx@sgh-probe.invalid
 ✅ B13) "me equivoqué de correo" vuelve al form sin recargar y sin perder lo tipeado  → sec-form= · sec-existe=none · email=probe-confirmada-fssagx@sgh-probe.invalid · focus=1
 ✅ B7) reenvío a cuenta sin confirmar → sigue siendo "revisá tu correo" (no hay falso positivo)
 ✅ B8) el link a login.html está en el HTML real  → login.html
 ✅ B9) y el de contraseña abre el panel de recuperación de login.html  → login.html?recuperar=1
 ✅ B10) el caso de cuenta existente no llama a la RPC  → []
 ✅ B11) el botón queda usable y el captcha reseteado para reintentar  → disabled=false · cfReset=1
 ✅ B12) el texto de la pantalla no nombra rol, club ni nada de la cuenta
 ✅ C1) con sesión y usuario del sistema → portal.html  → portal.html
 ✅ C2) con sesión y solicitud ya enviada → "solicitud enviada", sin redirigir  → sec-listo= · replace=undefined
 ✅ C3) con sesión, sin usuario, sin solicitud y sin borrador → el form sin el bloque de cuenta  → grp-cuenta=none · replace=undefined
 ✅ D1) ?recuperar=1 abre el panel de "olvidé mi contraseña"
 ✅ D2) sin el parámetro no toca nada
 ✅ D3) showForgot existe en login.html
 ✅ D4) reset-password.html sigue sin formulario para pedir el link — por eso no se linkea ahí
 ✅ Z1) teardown: no quedó ninguna cuenta de esta corrida
 ✅ Z2) y auth.users volvió al conteo de antes  → antes=11 · después=11

32/32 OK
exit=0
```

```
$ node tests/probe_solicitar_cuenta_existente.mjs --mutantes

═══ MUTATION TESTING · 8/8 mutantes ═══
(copias en /tmp/mut-solicitar-existe-jqhsA5 — el repo no se toca)

(captura de GoTrue en /tmp/mut-solicitar-existe-jqhsA5/respuestas.json — los mutantes la reusan)

✅ M1 muere — se neutraliza el check de identities (el bug original vuelve)  [esperaba matar B4,B5; murieron B4,B5]
✅ M2 muere — la pantalla filtra datos de la cuenta ajena (enumeración por copy)  [esperaba matar B12; murieron B12]
✅ M3 muere — el corte se invierte: el alta NUEVA se toma por cuenta existente  [esperaba matar B1; murieron B1]
✅ M4 muere — seccion() no conoce sec-existe: la pantalla nunca se muestra  [esperaba matar B4; murieron B4]
✅ M5 muere — el link de recuperación apunta a reset-password.html (callejón sin salida)  [esperaba matar B9; murieron B9]
✅ M7 muere — "me equivoqué de correo" no vuelve al formulario  [esperaba matar B13; murieron B13]
✅ M8 muere — la página vuelve a cargar supabase-js por major (@2, sin pin)  [esperaba matar A0; murieron A0]
✅ M6 muere — el deep link ?recuperar=1 de login.html no abre nada  [esperaba matar D1; murieron D1]

✅ TANDA LIMPIA — 8 probados · 8 muertos

exit=0
```

Las dos anclas que se le tocaron (§4.2) están cubiertas: **M4 muere**, o sea que el array de
`seccion()` sigue siendo el ancla real, y **B12 pasa** con el corte nuevo. Sin ese ajuste, B12
fallaba por un motivo espurio: el comentario que documenta `#sec-falta` nombra a la secretaría, y el
corte viejo (`hasta '<!-- ===== SOLICITUD ENVIADA'`) se lo comía adentro del bloque de `#sec-existe`.

Los 4 mails de esta sesión (2 por corrida × 2 corridas: la normal y la captura de la tanda de
mutantes) fueron a `probe-<caso>-<run>@sgh-probe.invalid`. El teardown quedó verde: `Z1` sin cuentas
sobrantes y `Z2` con `auth.users` en el mismo conteo que antes (11 → 11).

---

## 7. ISSUE-071 — cuentas huérfanas, abierta con criterio de activación

**No se construyó la vista**, por pedido explícito. Queda como ISSUE-071 en `docs/ISSUES.md`, con el
criterio escrito adentro: **después de publicar la campaña, si se acumulan cuentas confirmadas sin
solicitud, se construye**. La query que lo mide, para correr a mano cada tanto durante la campaña:

```sql
SELECT u.id, u.email, u.created_at, u.email_confirmed_at
  FROM auth.users u
  LEFT JOIN usuarios            usr ON usr.auth_user_id = u.id
  LEFT JOIN solicitudes_acceso  sol ON sol.auth_user_id = u.id
 WHERE u.email_confirmed_at IS NOT NULL
   AND usr.id IS NULL
   AND sol.id IS NULL
 ORDER BY u.created_at DESC;
```

Mientras esté vacía o con una fila suelta, el issue se queda abierto sin trabajo. La única huérfana
conocida hoy es la de Fede, y **no se toca**.

---

## 8. Verificación de estado — greps contra `main`

`main` no tiene nada de esto: el fix está en la rama y **sin mergear**, como se pidió.

```
$ git grep -c "sec-falta" main -- solicitar-acceso.html
main: sec-falta NO existe (0 hits)

$ git grep -n "volvés acá para terminar la solicitud" main -- solicitar-acceso.html
main:solicitar-acceso.html:229:        Abrilo y volvés acá para terminar la solicitud.

$ git ls-tree main tests/ --name-only | grep falta_paso
main: probe_solicitar_falta_paso.mjs NO existe

$ git grep -n "ISSUE-070\|ISSUE-071" main -- docs/ISSUES.md
main: ISSUE-070/071 NO existen
```

O sea: en producción sigue vivo el texto viejo de `sec-confirmar` y sigue sin existir la pantalla
"Ya casi". **Hasta que se mergee, el agujero sigue abierto en prod.**

## 9. Verificación de push de la rama de trabajo

```
$ git push -u origin fix/solicitar-acceso-paso-final
 * [new branch]      fix/solicitar-acceso-paso-final -> fix/solicitar-acceso-paso-final
branch 'fix/solicitar-acceso-paso-final' set up to track 'origin/fix/solicitar-acceso-paso-final'.

$ git ls-remote origin fix/solicitar-acceso-paso-final
29fec91677cecccaaa3bc60b8aa2ef68199bfdef	refs/heads/fix/solicitar-acceso-paso-final

$ git rev-parse HEAD
29fec91677cecccaaa3bc60b8aa2ef68199bfdef
```

Coinciden: la rama está en `origin` y se puede leer.

---

## 10. Números de resumen

| | |
|---|---|
| Archivos tocados | 7 (`solicitar-acceso.html`, probe nuevo, probe viejo, `CHANGELOG.md`, `CLAUDE.md`, `docs/ISSUES.md`, `tests/README.md`) |
| Diff | +854 / −21 (7 archivos, el probe nuevo son 517 líneas) |
| Pantallas nuevas | 1 (`#sec-falta`) |
| Ramas del camino 2 | 5 (usuario · solicitud · borrador válido · borrador roto/ausente · sin sesión) |
| Probe nuevo | 27/27 asserts · 12/12 mutantes muertos · **0 mails, 0 escrituras** |
| Probe de ISSUE-069 | 32/32 asserts · 8/8 mutantes muertos · 4 mails rebotados |
| RPC tocadas | 0 |
| Mergeado a `main` | **no** |

---

## 11. Preguntas abiertas

1. **El copy.** "Ya casi" / "La solicitud todavía no está enviada" / "Ojo: con eso todavía no queda
   enviada" son decisiones de producto tomadas por el lado conservador (decir de más antes que de
   menos). Si Fede o la secretaría prefieren otro tono, es un cambio de una línea por pantalla.
2. **El teléfono en la ficha.** Se muestra normalizado (`5492245123456`), que es como quedó en el
   borrador, no como lo tipeó la persona (`2245 123456`). Es lo que se va a guardar, así que
   mostrarlo así es honesto, pero se lee raro. ¿Se formatea para mostrar?
3. **Prueba de campo.** Falta la corrida real: Fede terminando su registro por el camino nuevo. Es
   la única verificación que ningún probe puede dar, y por eso su cuenta quedó sin tocar.
4. **Merge.** La rama espera OK explícito. Mientras tanto prod sigue con el texto viejo.

---

## 12. Diff completo de la rama, por archivo

El `git diff --stat` de §4 se sacó antes de la última edición de `CLAUDE.md`. El estado final de la
rama contra `main` es éste:

```
$ git diff --stat main...fix/solicitar-acceso-paso-final
 CHANGELOG.md                               |  56 ++++
 CLAUDE.md                                  |   1 +
 docs/ISSUES.md                             |  90 +++++
 solicitar-acceso.html                      | 188 ++++++++++-
 tests/README.md                            |  12 +
 tests/probe_solicitar_cuenta_existente.mjs |  11 +-
 tests/probe_solicitar_falta_paso.mjs       | 517 +++++++++++++++++++++++++++++
 7 files changed, 854 insertions(+), 21 deletions(-)
```

## 13. Verificación de push de este informe

```
$ git push -u origin reports
   b1666fc..a81e489  reports -> reports
branch 'reports' set up to track 'origin/reports'.

$ git ls-remote origin reports
a81e48945d75b79e14f4a58e5be9cf79bfe50580	refs/heads/reports

$ git rev-parse HEAD
a81e48945d75b79e14f4a58e5be9cf79bfe50580
```

Coinciden. Este commit (§12–13 + el número de diff corregido) es el siguiente y su SHA queda
verificado abajo, en el mismo formato.
