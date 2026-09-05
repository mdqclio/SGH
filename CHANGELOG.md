# Changelog

## [2026-09-05] — solicitar-acceso: el paso 3 pasa a ser un paso (merge `2fb85d4`)

> El primer usuario real confirmó el correo, volvió a la página, vio el formulario con sus datos y
> cerró la pestaña. La solicitud nunca se creó: cuenta viva en `auth.users`, `solicitudes_acceso`
> vacía, invisible para la secretaría.

### El agujero

No es un bug de código. El registro tiene **tres** pasos —llenar el form · confirmar el correo ·
**enviar la solicitud**— y el tercero no se leía como un paso:

- `sec-confirmar` decía *"Abrilo y volvés acá para terminar la solicitud"*. El que clickea el link
  del mail **ya está "acá"**: la frase no anticipa que falta apretar un botón.
- Al volver, el camino 2 re-mostraba **el mismo formulario** precargado. Campos llenos se leen como
  "ya está hecho".

Con el link publicado esto le pasa a la mayoría. Diagnóstico:
`docs/diagnosticos/2026-09-03_fede-registro-real-sin-solicitud.md`.

### Lo que se descartó

Llamar a `enviarSolicitud()` sola al detectar sesión + borrador. **No va**: manda sin que la persona
revise y arrastra el riesgo de un borrador viejo. Se hace el paso inconfundible, no se saltea.

### El fix (`solicitar-acceso.html`)

- **Pantalla nueva `#sec-falta` ("Ya casi")** — ficha de **sólo lectura** (nombre, DNI, rol, origen
  y lo que corresponda al rol; cero `<input>`), **un** botón grande `Enviar solicitud`, y un link
  secundario "corregir mis datos" que despliega el formulario precargado. Se muestra con sesión, sin
  fila en `usuarios`, sin solicitud **y** borrador que pasa `validar(b, false)`.
- **Sin borrador utilizable** (otro dispositivo, `localStorage` limpio) → el formulario, con
  subtítulo propio: *"Tu correo ya está confirmado, pero todavía falta la solicitud."*
- **`sec-confirmar` reescrito** — avisa que confirmar el mail **no** deja enviada la solicitud y
  nombra el botón que va a tener que apretar al volver.
- El resumen se pinta con `textContent` sobre filas que ya existen en el HTML: nada de `innerHTML`
  con datos (ISSUE-018), y los ids quedan verificables desde el probe.
- Sin cambios en `rpc_solicitar_acceso`. Las otras ramas del camino 2 quedan iguales: `usuarios` →
  `portal.html`, solicitud → `sec-listo`, sin sesión → `sec-confirmar`.

### Probe

`tests/probe_solicitar_falta_paso.mjs` — **27/27 asserts, 12/12 mutantes muertos**. Mismo patrón de
slab + mini-DOM que `probe_solicitar_cuenta_existente.mjs`, pero **sin red y sin credenciales**: no
manda mails, no planta cuentas, no escribe una fila. Se puede correr en cualquier rutina.

`probe_solicitar_cuenta_existente.mjs` se re-corrió sobre el archivo cambiado: **32/32 y 8/8
mutantes**. Se le tocaron dos anclas (el array de `seccion()` y el corte del assert B12, que ahora
termina en `<!-- ===== FALTA ENVIAR`); sigue siendo **a demanda**, 2 mails por corrida.

### Verificación en producción

Mergeado con `--no-ff` (`2fb85d4`) y desplegado: el MD5 de `solicitar-acceso.html` servido por
`sigh.com.ar` coincide con el local (`10c236bae998e357edf76f6ac9972ea0`). Los **dos** probes
re-corridos **contra el HTML servido**: el nuevo **27/27 + 12/12 mutantes**, el de ISSUE-069
**32/32**.

### Issues

- **ISSUE-070** cerrado (este fix).
- **ISSUE-071** abierto **con criterio de activación**: vista de cuentas confirmadas sin solicitud.
  No se construye hasta que, publicada la campaña, se acumulen. La query que lo mide está en el
  issue.

## [2026-09-02] — solicitar-acceso: el falso "revisá tu correo" (merge `6056acd`)

> Una persona real se registró, la página le dijo que revisara el correo, y el correo nunca se
> mandó. No era un problema de entrega: el mail no se generó nunca.

### El bug

- GoTrue, ante un alta **repetida** sobre una cuenta **ya confirmada**, responde **200 sin error**,
  con un `user` obfuscado (id nuevo, metadata vacía, `confirmation_sent_at` falso) y **no manda
  ningún mail**. Es anti-enumeración: la respuesta es indistinguible de un alta nueva para que nadie
  pueda averiguar qué correos existen.
- `solicitar-acceso.html` sólo miraba `authErr`. Como no hay error, caía en `sec-confirmar`
  ("revisá tu correo") por un mail que nunca se emitió. La rama de "ya hay una cuenta con ese
  correo" (`:471`) era **código muerto**: sólo se activa si GoTrue devuelve error, y no lo devuelve.
- Diagnóstico del caso real: `docs/diagnosticos/2026-09-02_fede-mail-verificacion-no-llega.md`.

### El fix

- **La señal es `user.identities` vacío**, verificada contra el GoTrue de producción en los tres
  casos, no deducida de la documentación:

  | Caso | `identities.length` | ¿manda mail? | Pantalla |
  |---|---|---|---|
  | Alta nueva | 1 | sí | "revisá tu correo" |
  | Repetida, cuenta **sin** confirmar | 1 | sí, reenvía | "revisá tu correo" |
  | Repetida, cuenta **confirmada** | **0** | **no** | "ese correo ya está registrado" |

  Por eso el corte es `=== 0` y no un chequeo "falsy": un `!identities.length` mandaría el reenvío a
  la pantalla equivocada.
- **Pantalla `#sec-existe`** con tres salidas: iniciar sesión, `login.html?recuperar=1` y "me
  equivoqué de correo" (vuelve al form sin recargar y sin perder lo tipeado). El texto no dice nada
  de la cuenta más allá de que el correo ya está registrado — no se filtra rol, club ni nada.
- **`login.html` gana `?recuperar=1`**, que abre el panel de "olvidé mi contraseña". El link no
  puede ir a `reset-password.html`: esa página es la *landing* del mail y sin token muestra "enlace
  inválido", o sea un callejón sin salida.
- **`solicitar-acceso.html` pinea `@supabase/supabase-js@2.114.0`** y es la única página del repo
  que lo hace. Ver GOTCHA #89: con `@2` flotante el fix se convierte en código muerto sin aviso.

### Verificación

- Probe `tests/probe_solicitar_cuenta_existente.mjs` — **32/32** en local y **32/32 contra el HTML
  servido por `sigh.com.ar`**. **8 mutantes, todos mueren.**
- **Se corre a demanda**, no en la rutina: cada corrida rebota dos mails en Resend y los rebotes
  duros degradan la reputación del dominio, que tiene que llegar sano al día que se publique el link
  de registro.
- El probe **lee del HTML la URL del bundle** y baja ese, en vez de usar el de `node_modules`:
  probar con otra versión de la librería daría verde con un fix muerto.

### Lecciones

- **GOTCHA #89** — dos cosas en una: GoTrue no avisa el alta repetida, y la señal que sí lo dice
  depende de la versión del SDK.
- **La instrucción que mandaba a `reset-password.html`** se verificó antes de aplicarla y resultó ser
  un callejón sin salida. El destino correcto era `login.html`, que es donde vive el formulario.

## [2026-08-30] — ISSUE-065 cerrado + ISSUE-067 opción 1 (merges `ceccda2` y `ea92795`)

> Dos agujeros del circuito de pagos, en el orden equivocado y corregido a mitad de camino: se fue a
> arreglar el privilegio que nunca se usó y apareció el botón que sí se puede apretar.

### `recibos`: el DELETE revocado (ISSUE-065 · merge `ceccda2`)

- Un usuario autenticado podía hacer `DELETE /rest/v1/recibos?id=eq.<uuid>` y **saltear
  `anular_recibo`**. Mientras estuvo abierto, todo el circuito de anulación era opcional: había un
  camino más corto que no dejaba el rastro que el circuito existe para dejar.
- **Dos capas**: `DROP POLICY recibos_delete` (la RLS rechaza, pero **en silencio** — 204 con 0
  filas) + `REVOKE DELETE … FROM authenticated, anon` (el rechazo pasa a ser **42501**). Se testean
  por separado: sin el segundo assert, media revocación se leería como revocación completa.
- **Ni siquiera para `super_admin`**: `anular_recibo` ya tiene esa excepción pasados los 5 días, y lo
  único que agrega el DELETE es destruir el rastro. Se revisó caso por caso: ninguno queda sin salida.
- **Nunca se había usado desde una sesión de usuario** — los 387 DELETE de `auditoria` tienen
  `usuario_id = NULL` (service_role). Pero el 2026-06-09 se borraron **6 recibos reales de Dolores
  por \$570.649,99** en una sola transacción, por consola. El precedente existía.
- Probe `tests/probe_recibos_delete_revocado.mjs` — **17/17**. Antes de aplicar daba 13/17, y esos 4
  rojos **eran** la demostración del agujero: el mutation test salió gratis, porque la base sin
  revocar es la revocación neutralizada.
- Matiz que corrigió la premisa: **`recibos` sí tiene trigger de auditoría**, así que borrar deja
  `datos_antes` con la fila entera. Lo que se pierde son **las líneas** — `liquidacion_detalle` no
  tiene trigger.

### `liquidaciones`: el botón que borraba plata cobrada (ISSUE-067 opción 1 · merge `ea92795`)

- El 🗑️ se escondía con `l.estado !== 'pagada'` — el estado de la **cabecera**. Pero las **177**
  liquidaciones con líneas comprometidas están **todas en `borrador`**, así que el botón estaba
  visible para las **346 líneas comprometidas** del sistema: **\$23.023.740,85, el 70% de las
  líneas**. Y `eliminarLiq` borra el detalle con su propia sentencia, así que se las llevaba puestas
  **sin dejar rastro**.
- **`comprometidasDe(l)` cuenta las dos formas de comprometida** (`recibo_id` **o**
  `estado_linea='pagado'`), sobre el detalle que `loadLiquidaciones` ya trae embebido — sin consulta
  extra. Contar sólo la primera daba 8 líneas en vez de 346 (**GOTCHA #88**).
- **Badge `🔒 N cobrada(s)` en lugar del botón**, con el motivo en el `title`: un botón ausente deja
  al operador buscándolo; el candado dice qué pasa y adónde ir.
- **Re-chequeo contra la base** antes de borrar: entre el render y el click pudo emitirse un recibo
  desde el tab Pagos, que ahora es una solapa aparte y por diseño no refresca ésta.
- **El error del primer `delete` ya no se ignora.** Antes sólo se miraba el de la cabecera, así que
  un rechazo en el borrado del detalle se perdía y el usuario veía *"Liquidación eliminada"* sobre un
  borrado que no ocurrió. **Sin esto, el trigger de la opción 3 rechazaría el borrado y la UI mentiría
  igual** — por eso fue primero.
- Probe `tests/probe_no_borrar_liq_cobrada.mjs` — **19/19**, y 19/19 contra el HTML servido por
  `sigh.com.ar`. **8 mutantes, todos mueren.**
- **ISSUE-067 sigue abierto**: esto es UI y un `curl` lo saltea (GOTCHA #80). Falta el trigger
  `BEFORE DELETE` con `WHEN` y la auditoría acotada.

### Lecciones

- **GOTCHA #88** — "plata comprometida" no es `recibo_id IS NOT NULL`. El mismo error apareció dos
  veces en dos días: primero en la medición (\$1.100.000 en vez de \$23.023.740,85) y después en los
  asserts del probe, donde el mutante que rompía el guard **sobrevivió**.
- **GOTCHA #86, otra vez.** Dos capas que hacen lo mismo hacen que cada mutante individual sobreviva.
  Pasó el 29 con el post-filtro de club tapando la falta del `.eq`, y volvió a pasar acá con el
  re-chequeo del servidor tapando el guard del render. Se arregló igual: **un observable por capa**.
- **ISSUE-068** nuevo: las policies de DELETE de `liquidaciones` / `liquidacion_detalle`. A
  diferencia de `recibos`, ahí **sí hay borrado legítimo desde la app** (el motor, en cada
  recálculo), así que no se puede revocar sin más.

## [2026-08-30] — Historial de recibos + `anular_recibo` v2 (merge `82484e5`)

> La opción B de ISSUE-056, pedida tres veces: Fede el 27/08 (*"si vas al histórico de esa persona…
> podés buscar el recibo y mostrar el recibo de quién lo firmó"*), Valeria el 30/08 (*"¿aparece que
> ya fue pagado? así me queda diferenciado"*) y Fede otra vez el 30/08 (*"que haya una manera de que
> sea más fácil buscarlos"*). El número ya existía y es correlativo: lo que faltaba no era numerar,
> era **buscar**. Plan y resultados en `reports`:
> `docs/diagnosticos/2026-08-30_plan-historial-recibos.md` y `…_historial-recibos-implementado.md`.

- **Solapa propia 📄 Recibos**, entre Pagos y Resumen — no una segunda vista dentro de Pagos. Los
  paneles son `display:none`, así que **el cobro en curso sobrevive intacto** a la consulta:
  selección tildada, filtro por concepto y panel del recibo emitido quedan como estaban. El caso
  real es Valeria pagándole a alguien cuando llega otro y pregunta *"¿yo ya cobré?"*.
- **Una sola caja de búsqueda, con el modo inferido.** Numérico corto → N° de recibo exacto (pega
  `uq_recibo_por_club`, así que el aislamiento por club viaja **dentro de la clave de búsqueda**).
  Cualquier otra cosa → persona. Un numérico de 6+ dígitos busca **las dos cosas**, recibo y
  documento. El corte en 6 apareció probando: buscar `3` traía el recibo #3 **más todos los recibos
  de cualquiera cuyo DNI contuviera un 3**.
- **Búsqueda por quien retiró.** `cobrador_nombre` y `cobrador_documento` son columnas de la propia
  tabla: dos términos más en el mismo `.or()`, cero joins. Es lo que pedía Fede. **Sólo encuentra
  recibos emitidos desde el 28/08** — antes no se registraba, y eso está escrito en la solapa.
- **Los anulados aparecen**, en orden cronológico, atenuados pero **no escondidos**: un anulado que
  hay que ir a buscar a otra pestaña es un anulado que no se encuentra cuando hace falta. Con
  motivo, quién anuló y cuándo (`usuarios.nombre_completo`, GOTCHA #79 + #3).
- **`anular_recibo` v2** — `migrations/anular_recibo_v2_snapshot.sql`. `lineas_anuladas` pasa de
  `jsonb_agg(d.id)` a `jsonb_agg(to_jsonb(d))`: de los ids sueltos a **la foto de las filas**.
  Guardar sólo ids convertía el detalle de un anulado en una *reconstrucción*, y un recálculo
  posterior le cambiaba el importe a la línea — el detalle dejaba de coincidir con el papel.
  **Se hizo ahora porque había cero recibos anulados en la base**: la ventana se cerraba con la
  primera anulación, porque `liquidacion_detalle` no tiene trigger de auditoría y ese monto no se
  recupera de ningún lado. El lector entiende los dos formatos.
- **Bug latente cerrado: `imprimirReciboCobro` ignoraba `lineaIds`.** El parámetro estaba en la
  firma desde el principio; la función releía por `.eq('recibo_id')`, que para un anulado es `NULL`.
  **Reimprimir un anulado salía con el cuerpo vacío.** No se notaba porque hasta ahora sólo se
  imprimía desde el panel post-emisión.
- **Aislamiento por club en las dos capas** (ISSUE-060): `.eq('club_id')` en toda consulta a
  `recibos` —la RLS empieza con `fn_is_super_admin() OR …`, o sea que **no acota al rol que usa el
  club-switcher**— más `cobDelClub` en las líneas del detalle. Ojo: `cobDelClub` **no** aplica a
  `recibos`, que tiene columna `club_id` propia.
- **Seeds 9001/9002 corregidos** — `migrations/fix_seeds_recibos_9001_9002.sql`. Tenían los totales
  en 0 con líneas que sumaban 870.000. `neto_a_cobrar` es GENERATED (**GOTCHA #87**): se corrigen
  los insumos y la calculada se acomoda sola. **No se borraron**: son el bucket pagado del que
  depende el Resumen.
- **Probe** `tests/probe_historial_recibos.mjs` — **39/39**, y **39/39 contra el HTML servido por
  `sigh.com.ar`** (md5 `fa8cf1cdd8bc6e0af92ff3f64eed400d` idéntico en working tree, commit y prod).
  El anulado se fabrica con los **RPC reales**: si el probe armara el jsonb, probaría la vista
  contra su propia suposición sobre el formato. El "otro club" del listado son los **5 recibos
  reales de Dolores**, sin escribir una fila allá.
- **Mutantes 17/17** en 4 tandas: 15 mueren, 2 equivalentes declarados. Cuatro sobrevivieron en el
  camino y **dos eran agujeros reales**: el probe stubbeaba la función que contenía el bug
  (**GOTCHA #85**) y no había fixture con beneficiario propietario. Otro destapó que el post-filtro
  de cliente tapaba la falta del guard del servidor (**GOTCHA #86**).
- **Corrige una afirmación del plan**: PostgREST **no** rompe con un `in.()` vacío — devuelve 0
  filas y **no anula los demás términos del `.or()`**. Medido, no razonado.
- **Regresión preexistente arreglada**: el merge del filtro (`2821c7c`) cambió la firma de
  `cobrosDetalle` y dejó **cuatro probes rotos** sin detectarse (`probe_anular_recibo`, `_ui`,
  `aislamiento_club_cobros`, `reunion_es_prueba`). Los cuatro vuelven a verde: 31/31, 26/26, 27/27
  y 17/17.
- **ISSUE-066** anotado: `switchTab` mapea botón→panel **por posición** en un array literal. Se
  agregó la solapa al array (cambio mínimo) y el refactor a `data-tab` queda pendiente — tocar las
  cuatro solapas que ya andan a 20 días de la reunión es la mejora que rompe algo.

## [2026-08-30] — ISSUE-056 CERRADO: la UI de anulación (merge `0a3a2ac`)

> El RPC ya estaba vivo (`34f6e83`); lo que faltaba era el botón. Con este merge **ISSUE-056 queda
> cerrado**: anular un recibo dejó de requerir SQL a mano sobre producción. Plan y decisiones en la
> branch `reports`: `docs/diagnosticos/2026-08-30_issue-056-ui-anulacion-plan.md`.

- **El punto de anclaje que el plan daba por existente no existía.** No hay bloque post-emisión ni
  botón "Imprimir": `imprimirReciboCobro` escribe en `#recibo-print` (`display:none` fuera de
  `@media print`) y dispara `window.print()` directo. Hubo que **crear la superficie** antes de poder
  colgarle un botón.
- **Panel `#cob-recibo-emitido`** con **Imprimir de nuevo** y **Anular recibo**. Va fuera de
  `#cob-detalle` porque `cobrosBuscar()` lo vacía en cada búsqueda. De paso, "Imprimir de nuevo"
  tapa un agujero que hoy no tiene ninguna solución: cancelar el diálogo de impresión dejaba el
  recibo emitido y sin forma de volver a sacarlo.
- **Motivo obligatorio primero, confirmación después.** Al revés, el operador confirma y recién ahí
  le piden justificar, y el motivo termina siendo cualquier cosa para pasar el trámite. La
  validación del cliente **no es un guard**: el RPC rechaza el motivo vacío igual (GOTCHA #80).
- **La confirmación dice qué se pierde**: número, importe, beneficiario, las N líneas que vuelven a
  pendientes, el número que no se reutiliza, y *"Si ya imprimiste el recibo, ese impreso queda sin
  valor."* — frase de Fede, textual. Enuncia un hecho del sistema; qué se hace con ese papel no lo
  define el software.
- **`toast()` ahora acepta duración.** El aviso de líneas que vuelven a `retenido` por doping dura
  15 s: es una **instrucción de trabajo**, no un acuse. Que una línea con `fecha_liberacion` futura
  vuelva a retenida es consecuencia del `CASE` del RPC y nadie tiene por qué deducirlo desde la
  pantalla.
- **El panel sobrevive a la anulación** (`Recibo N° X — ANULADO`, sin el botón): si desapareciera, la
  pantalla no dejaría rastro de que alguien acaba de anular un recibo.
- **Ventana de 5 días con `currentUser.rol`**, el mecanismo que `initAuth` ya usa. `puedeAnularUI` es
  pura y está aparte para que el probe pueda llamarla con un `emitido_at` fabricado, sin browser.
- **Probe nuevo `tests/probe_anular_recibo_ui.mjs` — 26/26 — y 8/8 mutantes muertos** (`--mutantes`,
  sobre copias del HTML en tmpdir; el repo no se toca). **Dos mutantes destaparon asserts débiles**:
  el del motivo vacío pasaba con el guard neutralizado porque el RPC rechazaba igual — se arregló
  espiando `sb.rpc` para verificar que la llamada no sale. El otro era un falso positivo del arnés
  (`❌ U4\b` no matchea `❌ U4b)`).
- **4 probes existentes ajustados**: `cobrosDetalle` ahora llama a `cobLimpiarPanelRecibo` y
  `cobrosConfirmarEmision` a `cobrosRenderRecibo`, así que los harness que las extraen tienen que
  llevarse también los helpers. Sin eso reventaban con `is not defined` — que es exactamente lo que
  el patrón "el probe corre el archivo cambiado" tiene que hacer notar.
- **Verificado en producción**: `md5sum` de `liquidaciones.html` coincide entre el working tree,
  `git show 0a3a2ac:` y lo que sirve `https://sigh.com.ar`
  (`0189ecbe749cde1bf4cfa0528162f329`), y el probe corrido **contra el HTML servido** da 26/26.
- **GOTCHAS #81 y #82**, los dos salidos del mutation testing de esta entrega. **#81 — un assert de
  UI que pasa igual sin la UI está midiendo el servidor**: cuando cliente y servidor validan lo
  mismo (que es lo correcto, GOTCHA #80), el assert de la capa de arriba no puede verificarse por el
  resultado final, porque la de abajo produce el mismo resultado; hay que asserter sobre la
  frontera, la llamada que no sale. **#82 — `\b` no separa `U4` de `U4b`**: `4` y `b` son los dos
  `\w`, así que no hay borde, y el runner reportó 2 mutantes vivos que en realidad morían. Vale para
  cualquier identificador con sufijo alfanumérico: rótulos de assert, `ISSUE-05` vs `ISSUE-056`.
- **Corrección de instrucciones viejas: la reunión 9999 NO se borra.** La decisión se revirtió el
  2026-08-29 —es el único sandbox seguro, y en vez de borrarla se la marcó con `reuniones.es_prueba`
  y se la filtró del buscador de Pagos— pero quedaban **9 lugares** diciendo lo contrario, `CLAUDE.md`
  incluido. ISSUE-035 pasa a CERRADO: no hay nada que ejecutar.

## [2026-08-30] — ISSUE-056: `anular_recibo` (RPC vivo, UI pendiente)

> El 28/08 Valeria emitió el recibo **#4** probando (R8, 6 líneas, $62.700) y revertirlo costó un
> plan, una ejecución y una verificación en tres documentos, con SQL a mano contra producción. Con
> gente en la ventanilla el 20/09 eso no es viable. Regla de Valeria que lo hace urgente: **recibo
> impreso = pago hecho** — el papel existe apenas se imprime, así que anular tiene que ser una
> operación normal del sistema. Plan y resultados en la branch `reports`:
> `docs/diagnosticos/2026-08-30_anular-recibo-plan.md`.

- **`anular_recibo(p_recibo_id, p_motivo)`** — migración `20260830025830_anular_recibo_v1`, aplicada
  en prod antes del merge. `SECURITY DEFINER`, `plpgsql`. Rollback versionado en
  `migrations/rollback_anular_recibo_v1.sql` (dropea la función y **deja las columnas**: son
  aditivas y nullable, y borrarlas perdería el único registro de qué contenía un recibo anulado).
- **El estado al que vuelve cada línea se deriva de la línea, no se asume `impago`.** Si
  `fecha_liberacion` es futura, la línea vuelve a **`retenido`**. La retención por anti-doping es una
  restricción reglamentaria, no una comodidad del flujo: devolver a `impago` una línea que el
  reglamento retiene haría que el sistema declare **pagable plata que no lo es**. Un click de más
  (volver a apretar Habilitar) es barato; eso no.
- **`recibos.lineas_anuladas jsonb`** — fotografía los `liquidacion_detalle.id` **antes** de
  soltarlos. Sin eso el vínculo se pierde para siempre: al poner `recibo_id = NULL` el recibo ya no
  las nombra y `liquidacion_detalle` **no tiene trigger de auditoría** (a diferencia de `recibos`).
  Se agregaron también `anulado_por` (FK → **`usuarios(id)`**, no `auth.users` — GOTCHA #79) y
  `motivo_anulacion`. Las tres nullable a propósito: con `NOT NULL` las 5 filas históricas quedarían
  inválidas y habría que backfillear con un motivo inventado.
- **El recibo se marca `anulado`, no se borra**, así el hueco de numeración se documenta solo. El
  correlativo **no vuelve**: `fn_siguiente_recibo` es un contador monótono en `club_secuencias`, no
  un `MAX+1`, así que alcanza con no tocarlo — y el probe lo assertea igual, porque "se cumple solo"
  es justo lo que deja de cumplirse en silencio.
- **Permisos**: mismo club y dentro de 5 días corridos → puede anular; pasados los 5 días, sólo
  `super_admin`. La ventana separa el caso rutinario (el error se ve el mismo día, como el #4) del
  excepcional. Los guards van **escritos en la función**, no delegados a la RLS: es `SECURITY
  DEFINER` y las policies de las tablas no se evalúan adentro (GOTCHA #80).
- **Probe nuevo `tests/probe_anular_recibo.mjs`** — candado de club, la ventana de 5 días por sus
  dos lados, motivo obligatorio (NULL, vacío y sólo-espacios), idempotencia, el jsonb y el
  correlativo que no vuelve.
- **`tests/probe_recibo_pie_cobrador.mjs` ahora restaura `club_secuencias`** (assert R6). Era el
  único probe del set que no lo devolvía, por una decisión explícita —"los números de recibo son
  ilimitados"— que resultó cara: el correlativo de Dolores se fue de **28 a 32 en una sola noche**,
  +2 por corrida. Borrar los recibos no alcanza, porque el contador es monótono. El número en sí no
  importa (queda en 32 por decisión del usuario, y Valeria nunca vio los recibos 4 a 32: para ella
  la numeración arranca en 33), pero el drift crecía hasta el 20/09. Reconstrucción del salto, por
  auditoría, en `docs/diagnosticos/2026-08-30_anular-recibo-estado-post-corte.md` §5.
- **Comentario corregido en `probe_anular_recibo.mjs`**: decía que el probe emite sólo contra Mi
  Club Hípico "para no correr el correlativo de Dolores". Es falso — el fixture `detClubA` emite un
  recibo **contra Dolores** porque el candado de club necesita un recibo ajeno de verdad para
  verificar que un usuario del otro club no lo puede anular. El código estaba bien; el comentario
  decía lo contrario de lo que hace, que es peor que no tener comentario.
- **Falta la UI.** El tab Pagos no tiene botón de anular ni formulario de motivo: hoy el RPC sólo se
  invoca desde la consola. Queda para la entrega siguiente. ISSUE-056 pasa a **🟡 PARCIAL**, no a
  cerrado.
- **Protocolo de informes ampliado** (`CLAUDE.md`): cubre toda salida que el usuario tenga que leer
  —verificaciones sueltas, resultados de probes, salidas de queries, `git status`/`git log`—, no sólo
  los diagnósticos. "Pegame la salida cruda" significa escribirla en el archivo y pasar la ruta: la
  pantalla trunca. Y **un informe no está entregado hasta que está pusheado a `origin`**, verificado
  con `git ls-remote` antes de pasar la ruta — un commit local da 404 y, para el que lo tiene que
  leer, no existe.

## [2026-08-30] — ISSUE-059/060/057: aislamiento entre clubes en el circuito de cobro

> El 28/08 un super_admin parado en Mi Club Hípico con el club-switcher emitió un recibo con
> `club_id` de MCH sobre 9 líneas de la reunión 9999 de **Dolores**, por $92.000. El recibo se
> revirtió al día siguiente, pero **no era un caso borde: era el comportamiento normal del RPC**, que
> no tenía una sola comparación de club adentro. Plan y validación en la branch `reports`:
> `docs/diagnosticos/2026-08-29_aislamiento-club-cobros-plan.md`.

- **`emitir_recibo` v1.2** — migración `20260830014105_emitir_recibo_v1_2_aislamiento_club`, aplicada
  antes del merge para cerrar el agujero server-side primero. Dos guards con criterios distintos:
  **guard 1 (permiso)**, que depende de la sesión y deja pasar a `service_role` y `super_admin`; y
  **guard 2 (invariante del dato)**, que **no** depende de la sesión y exige que toda línea cuelgue
  de una liquidación del mismo club que el recibo. Hacen falta los dos: el guard 1 solo es inerte
  bajo `service_role`, y el guard 2 es el que ataja el recibo fantasma.
- **El guard 2 va dos veces**: pre-chequeo que cuenta las ajenas y aborta (todo o nada, con el
  conteo en el mensaje) y `AND EXISTS` dentro del `UPDATE` como red ante una carrera. Sólo el
  `EXISTS` habría dejado las ajenas afuera **en silencio**, emitiendo el recibo con menos líneas —
  el peor modo de falla cuando hay plata de por medio.
- **Las validaciones corren antes de `fn_siguiente_recibo()`**: el número correlativo se consume
  recién cuando la emisión ya es válida. De paso se agregó `AND d.beneficiario_tipo =
  p_beneficiario_tipo` al `UPDATE` (v1.1 comparaba sólo el id); verificado sobre las 493 líneas de la
  base: 0 recibos con tipo distinto al de sus líneas.
- **ISSUE-060 — el otro extremo del mismo agujero.** `cobrosBuscar` y `cobrosDetalle` no filtraban
  por club: con el club-switcher la pantalla de Pagos mostraba plata ajena. `liquidacion_detalle` no
  tiene `club_id` propio, así que el club llega **por embed** `liquidaciones(club_id)` **sin
  `!inner`** (un `!inner` habría descartado filas en silencio — GOTCHA #5), y se aplica con un helper
  único, `cobDelClub()`, **en el listado y en el detalle**. Filtrar sólo el listado movía el agujero
  un click más adentro: un beneficiario que entra por plata propia abría el detalle con las líneas
  del otro club mezcladas y **tildadas**.
- **ISSUE-057 — `emitido_por` funciona por primera vez.** Los 5 recibos de la base lo tenían en NULL.
  El arreglo obvio (`emitido_por = auth.uid()`) **viola la FK**: apunta a `usuarios(id)`, no a
  `auth.users`. Se resuelve el usuario de la app por `auth_user_id`. Bajo `service_role` queda NULL a
  propósito — no se inventa un autor. Los 5 históricos no se tocan.
- **Probe nuevo `tests/probe_aislamiento_club_cobros.mjs` — 27/27** contra el RPC real (no contra la
  sombra de mutation testing, que ya no existe en la base). Incluye los **casos inversos** (7, 8, 11,
  12, 13, 16), que son los que impiden que un filtro pase por ser demasiado restrictivo, y cuatro
  asserts de restore por estado. Cada fix fue validado por mutation testing: neutralizado de a uno,
  cada uno mata sus propios asserts.
- **Regresión sin novedades**: `probe_recibos_emision` 3 fallos previos (liberación manual del
  doping, v1.1), `probe_cobros_v11` 1 previo (precondición de datos de R5),
  `probe_recibo_pie_cobrador` 56/56, `probe_reunion_es_prueba` 17/17.
- **`probe_reunion_es_prueba` se adaptó al cambio** (`380ea72`): quedaba en 5/7 por dos roturas de
  harness, ninguna de producto — el sandbox no extraía el helper `cobDelClub` nuevo, y el assert 4b
  comparaba un literal exacto de una línea que ISSUE-060 modificó. Ahora pide los dos guardas por
  separado y suma el **4c**, que verifica el filtro de club dentro de `cobrosDetalle`: cobertura que
  antes no existía.
- **Verificado que `club_id` está cargado en los 7 usuarios de la base** — incluida Valeria. Si
  estuviera NULL, el guard 1 quedaría inerte para ese usuario (el guard 2 igual lo ataja).
- **GOTCHA #79** — `recibos.emitido_por` es FK a `usuarios(id)`, no a `auth.users`. **GOTCHA #80** —
  la RLS **no** protege una función `SECURITY DEFINER`: las policies no se evalúan adentro, así que
  los guards van escritos en la función. El recibo fantasma pasó con RLS activa y bien configurada.
- **Rollback**: `migrations/rollback_emitir_recibo_v1_2.sql` (vuelve a v1.1 exacta).
- **Sin cambios en los datos**: 5 recibos, 493 líneas, **0 líneas con club distinto al de su
  recibo**, antes y después.


## [2026-08-30] — ISSUE-064: el logo del club volvió a verse (roto desde el pase a sigh.com.ar)

> Fede reportó "no se ve el logo" y sospechó de la migración a dominio propio. Tenía razón en la
> causa y no en el mecanismo: no era un 404, era CSP. Diagnóstico completo en la branch `reports`:
> `docs/diagnosticos/2026-08-30_logo-roto-dominio.md` y `…_logo-fix-aplicado.md`.

- **La URL vieja no estaba caída.** `clubs.logo_url` de Dolores apuntaba a
  `https://mdqclio.github.io/SGH/logo-dolores-verde.png`, que respondía `301 → sigh.com.ar` y la
  imagen `200`. Por `curl` todo daba verde mientras el logo estaba roto.
- **Lo que fallaba es que el navegador nunca emitía el pedido.** Las 30 páginas llevan `img-src
  'self' data: blob: https://*.supabase.co https://raw.githubusercontent.com`. Con el sitio en
  `mdqclio.github.io/SGH/`, ese host **era** `'self'`; desde el pase a `sigh.com.ar` dejó de serlo y
  no está en la allowlist, así que la CSP cancela el pedido **antes** de seguir el 301.
- **Fix: un `UPDATE` de una fila** — `clubs.logo_url` de DOL a
  `https://sigh.com.ar/logo-dolores-verde.png`. **0 archivos servidos modificados**, así que no
  dependió del deploy: quedó activo al instante. Los otros dos clubes seguían en NULL y quedaron así.
- **Destrabó 9 pantallas/documentos** de una: sidebar del dashboard, carta de llamados, programa,
  programa oficial B&N y color, recibo de Pagos, PDF de inscriptos, PDF de ratificación y el preview
  de Admin. El del recibo era el más silencioso — `precargarLogo()` tiene timeout de 1000 ms y
  `onerror` disparaba al instante, así que salía sin logo, sin error y sin demora.
- **No se tocó la CSP.** Agregar el host viejo a `img-src` habría sido resolverlo al revés.
- **Se verificó que `logo_url` no se consume fuera del navegador** antes de decidir el formato de la
  URL: `reunion-json` no lee `clubs` (sólo `hipodromos(id, nombre)`), y la columna no aparece en
  ninguna vista, función ni Edge Function. Se mantuvo la URL absoluta por decisión explícita.
- **Limpieza del mismo defecto en el repo**: defaults de `invite-user/index.ts` (`REDIRECT_URL` y
  `ALLOWED_ORIGINS`) — hoy los tapa el env, verificado por preflight CORS, pero un redeploy sin esas
  variables mandaba los mails de invitación al host viejo; **la función no se redeployó**, es cambio
  de fuente. Más el hint del campo de logo en `admin.html`, que ahora nombra los hosts que la CSP
  acepta, y `README.md:13`.
- **GOTCHA #78 — la lección de método, que vale más que el bug**: nuestra verificación de deploy es
  `curl` + `md5sum`, o sea **ciega a toda esta clase de fallo**. Un md5 que coincide confirma que el
  archivo llegó al CDN, no que el navegador lo pueda usar. Cuando el síntoma es "no se ve" y no "da
  404", `curl` no es evidencia.
- **Confirmado por Fede en navegador.**


## [2026-08-28] — Saldado administrativo de R6 y R8: el histórico deja de ser cobrable

> R6 (20/06) y R8 (16/08) se pagaron **por fuera del sistema**, antes de que el circuito de Pagos
> estuviera en uso, y el sistema las seguía viendo como impagas. El 20/09 Valeria habría visto ese
> histórico mezclado con lo nuevo, con riesgo de pagar dos veces. Fede y Valeria acordaron darlo
> por saldado y arrancar limpio en R9. Plan y ejecución documentados en la branch `reports`:
> `docs/diagnosticos/2026-08-28_plan-saldado-r6-r8.md` y `…_ejecucion-saldado-r6-r8.md`.

- **332 líneas marcadas como pagadas · $21.861.040,85** — R6: 157 líneas / $7.116.984,19 · R8: 175
  líneas / $14.744.056,66. Sólo `UPDATE` sobre `liquidacion_detalle`: **0 filas creadas, 0
  borradas**.
- **Incluye las retenidas por anti-doping** (78 de las 332). Decisión explícita de Fede: *"los
  retenidos los damos por pagado, es de antes del sistema"*. Sin esto seguían siendo un vector de
  doble pago por el botón "✅ Habilitar" del detalle de Pagos.
- **Sin recibos.** Ninguna fila nueva en `recibos`, **ningún número de `club_secuencias`
  consumido**, `recibo_id` queda NULL. La numeración correlativa arranca limpia en R9.
- **Tres columnas escritas**: `estado_linea='pagado'`, `pagado_at='2026-08-28 12:00:00-03:00'`
  (fijo, no `now()`: determinista y compartido por las 332) y un sufijo en `descripcion`.
- **La marca de regularización** distingue esto de un pago real por tres señales convergentes: (1)
  `estado_linea='pagado'` con `recibo_id IS NULL`, combinación que el sistema **nunca** produce
  —`emitir_recibo` siempre asigna recibo—; (2) el timestamp idéntico en las 332; (3) el sufijo
  `[REGULARIZACION 2026-08-28: saldado administrativo pre-sistema, sin recibo; estado
  previo=impago|retenido]`, que además **preserva el estado previo** y hace el rollback exacto.
  Hizo falta porque **`liquidacion_detalle` no tiene trigger de auditoría** (verificado): el
  `UPDATE` no dejó rastro en `auditoria`, y la línea no tiene columna `notas` — `descripcion` es el
  único texto libre disponible.
- **Quedó afuera, a propósito**: el fondo solidario (75 líneas, $578.753,99 — va al club, no a una
  persona, no se le pagó a nadie por fuera del sistema), las 10 líneas de R8 ya pagadas con recibo
  real, R9 (no tiene ninguna línea de liquidación) y la reunión de prueba 9999.
- **El recálculo no lo revierte** — verificado en código, no supuesto: `liquidaciones-engine.js:274`
  preserva con la condición `estado_linea==='pagado' || recibo_id != null` (un **OR**, así que
  alcanza con la primera mitad), `:286-289` borra sólo `recibo_id IS NULL AND estado != 'pagado'`, y
  `:333` no regenera lo que ya está en `paidKeys`. `lineKey()` (`:37`) no lee `descripcion`, así que
  la marca no rompe el dedup. Efecto lateral buscado: recalcular R6/R8 ahora **congela** esa plata
  en vez de regenerarla.
- **Reversible**: SQL de rollback por la marca, verificado con dry-run (254 + 78 = 332 exactas), con
  la lista completa de los 332 ids en el informe.
- **ISSUE-054 (nuevo, anotado sin arreglar)**: el guard de `desoficializar_carrera` dispara con
  `estado_linea='pagado'` aunque no haya recibo, pero el mensaje dice *"anulá los recibos primero"*.
  Tras el saldado, 7 de 11 carreras de R6 y 8 de 12 de R8 quedan trabadas sin tener un solo recibo.
  Que queden trabadas **se acepta** (están cerradas, la plata salió por fuera); lo engañoso es el
  mensaje.
- **ISSUE-055 (nuevo)**: la 9999 **no se borra** (es el único sandbox seguro y ya probó su valor en
  `probe_recuperacion_monta.mjs`), pero sus 36 líneas pagables por $488.000,00 siguen apareciendo en
  Pagos cuando no se filtra por reunión — el mismo riesgo de doble pago, por otra puerta. Decisión
  de producto pendiente.

## [2026-08-25] — La monta se declara al anotar, y el entrenador también

> **Corrección de Yesi** al modelo de inscripción del portal: el entrenador declara la monta
> cuando anota, no cuando ratifica. Y **quien anota no es necesariamente quien entrena** — el
> entrenador pasa a ser un dato declarado. SQL en `migrations/portal_monta_al_anotar.sql`.

- **Sin DDL de tablas**: `inscripciones` ya tenía las cuatro columnas — `caballeriza_id`,
  `entrenador_id`, `jockey_titular_id` y `jockey_suplente_id`. No hubo que agregar nada.
- **`entrenador_id` deja de ser derivado**. Hasta ahora el RPC lo copiaba de `fn_mis_entidades()`,
  o sea *el que llamaba*. Ahora se declara en el formulario: un propietario puede anotar diciendo
  qué entrenador presenta el caballo, y un entrenador puede anotar uno que presenta otro. Queda
  separado **quién ANOTA** (`inscripto_por` + `canal='portal'`, intactos) de **quién ENTRENA**
  (`entrenador_id`, declarado).
- **El jockey es OPCIONAL al anotar** (Fede): se anota de lunes a viernes y los compromisos de
  monta van hasta el martes. Obligatorio recién en la ratificación. El suplente sigue siendo
  opcional, pero no se puede declarar sin titular.
- **El PROPIETARIO puede anotar** (Yesi, confirmado por Fede), declarando qué entrenador presenta
  el caballo. El gate de `rpc_inscribir` pasa de `entidad_tipo = 'profesional'` a
  `IN ('profesional','propietario')`. `rpc_baja_inscripcion` se abre igual —si puede anotar tiene
  que poder retirar lo suyo—: la fila sigue protegida por `canal='portal' AND inscripto_por = el
  que llama`, que es más fuerte que el tipo de entidad. Del portal se sacó el aviso "anotar
  caballos lo hace el entrenador" y el botón **Anotar** ahora se muestra a todos.
- **`rpc_inscribir`** pasa de 2 a 6 parámetros: `p_caballeriza_id` y `p_entrenador_id`
  (**obligatorios**), `p_jockey_titular_id` y `p_jockey_suplente_id` (opcionales, `DEFAULT NULL`).
  Va por `DROP` + `CREATE`: agregar parámetros crea un overload y PostgREST no lo resuelve. Lo
  declarado se valida contra el padrón del **club de la reunión** — activos, el entrenador con
  `tipo IN ('entrenador','ambos')` y los jockeys con `tipo IN ('jockey','ambos')`. El suplente no
  puede ser el mismo que el titular.
- **Cambia de dónde sale `caballeriza_id`**: antes se copiaba de `spcs.caballeriza_id` y podía
  quedar NULL; ahora es la que **declara** quien anota, y es obligatoria.
- **`rpc_padron_profesionales()`** (nuevo, SECURITY DEFINER): el portal no puede leer
  `profesionales` —`profesionales_select` sólo deja ver la ficha propia—, así que los activos del
  club llegan por RPC (46 jockeys en Dolores) y el front los parte por tipo; `'ambos'` cae en las
  dos listas. Las 292 caballerizas sí se leen directo: `caballerizas_select` ya es por club y el
  usuario del portal tiene `club_id`.
- **`portal.html`**: bloque "Datos de la monta" en el modal de anotar, con los cuatro selects
  (caballeriza / entrenador que presenta / jockey / suplente). El padrón se carga una vez, al
  abrir el primer modal. La caballeriza arranca precargada con la de la ficha del entrenador y el
  entrenador con uno mismo — son valores iniciales, se cambian. Sin caballeriza o sin entrenador no
  se llama al RPC; un suplente sin titular tampoco.
- **Probes**: `probe_portal_validacion` suma G, H, I y J (obligatorio faltante ⇒ no viaja al
  servidor; sin jockey ⇒ anota igual; suplente sin titular ⇒ frenado) y verifica que los cuatro
  campos lleguen en los args; `probe_gate4_inscribir` pasa de 21 a **34 asserts** (G3b, G16–G21
  monta; G22–G24 entrenador declarado; G25–G26 el propietario anota y retira lo suyo).
  **34/34 · 14/14 · 39/39 contra prod** (`probe_gate4_inscribir`, `probe_gate4_portal_ui`,
  `probe_rls_portal`).
- **Lo que NO cambió**: el staff sigue afuera de `rpc_inscribir` (assert G15) — la secretaría
  inscribe por su propio camino.

## [2026-08-24] — Inscripción libre: cualquier entrenador puede anotar cualquier SPC

> Cambio de **regla de negocio**, confirmado por Fede y Yesi: no hay vínculo caballo↔entrenador.
> El control pasa a ser disciplinario, no técnico — queda registrado quién inscribió, y una
> inscripción falsa va a sanción de la comisión de carreras. Relevamiento, decisiones y
> verificación en `docs/PORTAL_INSCRIPCION_LIBRE_PROPUESTA.md` (§4).

- **Por qué**: el filtro por tenencia dejaba **34 de 181 SPC invisibles** para todo el portal —
  los que no tienen `entrenador_id` cargado. Nadie los podía anotar. El filtro no protegía nada
  que la comisión no pueda resolver, y bloqueaba el 19% del padrón.
- **`rpc_buscar_spc(p_q)`** (nuevo): buscador sobre **todo** el padrón, por nombre, con columnas
  whitelisteadas — nada de `entrenador_id`, `caballeriza_id` ni propietario. Mínimo 2 caracteres,
  `LIMIT 30`, comodines de LIKE escapados. `spcs_select` **no** se abre al padrón completo: el
  buscador es la única puerta y devuelve sólo lo que hace falta para anotar.
- **`fn_mis_spc_visibles()`** (nuevo) = tenencia ∪ lo que yo inscribí. Sin esto, un entrenador que
  anotaba un caballo ajeno **no veía la fila que él mismo había creado** ni podía retirarla.
  `spcs_select` e `inscripciones_select` pasan a usarla. `fn_mis_spc_ids()` queda intacta: sigue
  siendo la respuesta a "¿qué caballos figuran a mi nombre?", que es lo que muestra Mis caballos.
- **`rpc_inscribir`**: fuera la validación de tenencia. `entrenador_id` pasa a ser **el que
  inscribe**, no `spcs.entrenador_id` — con la regla nueva, anotar un caballo es declararse su
  entrenador para esa carrera, y es el dato que la comisión necesita. `caballeriza_id` sale del SPC
  y **puede quedar NULL** (29 de 181 no la tienen): la completa la secretaría en ratificación, igual
  que hoy. No se hereda la caballeriza del que inscribe — le atribuiría el propietario equivocado a
  un caballo ajeno.
- **`rpc_baja_inscripcion`**: fuera la revalidación de tenencia. La fila ya está protegida por
  `canal='portal' AND inscripto_por = el que llama`, que es más fuerte: **B no puede retirar lo que
  cargó A, aunque el caballo sea de B** (assert G6e).
- **Privacidad, por pedido de Yesi**: el portal **no** muestra inscripciones ajenas. Cada uno ve su
  tenencia y lo que cargó. La lista pública de inscriptos ("largar los inscriptos") no existe
  todavía y queda fuera de esta pasada. Residual inevitable: al duplicar, el mensaje dice que el
  caballo ya está anotado — nunca por quién.
- **`portal.html`**: modal de anotar con buscador; sin búsqueda activa sigue mostrando la lista
  corta de caballos propios. El nombre en Mis inscripciones sale de un JOIN y no de `misCaballos`,
  que con un caballo ajeno mostraba "—". SPC no activos se listan marcados y no clickeables
  (hoy hay 0).
- **`inscripciones.html`**: columna **"Cargada por"** — Portal + nombre, o Secretaría. El registro
  ya existía (`inscripto_por` + `canal` + trigger de auditoría); lo que faltaba era mostrarlo. Es
  el control que reemplaza al filtro.
- **Probes**: `probe_gate4_inscribir` 15 → **21 asserts** (G6 invertido + G6b–G6g). Canarios de RLS
  en verde: secretaría 18/18, portal 39/39, portal_ui 14/14, e2e 18/18.

## [2026-08-23] — Los invitados dejan de nacer en un sistema vacío (activación automática)

> Fede entró y no vio datos. Valeria, lo mismo el 16/08. No era RLS rota ni un `auth_user_id`
> desalineado: la fila de `usuarios` quedaba con `activo=false`. Diagnóstico completo en
> `docs/DIAGNOSTICO_CUENTAS_2026-08-23.md` y `docs/FIX_ACTIVACION_INVITADOS.md`.

- **Causa**: `invite-user` inserta `activo=false, estado='pendiente'` y la activación la hacía el
  propio invitado en `reset-password.html`… pero colgada de un `if (ES_INVITE)`, que sólo es cierto
  si la URL trae `type=invite`. Los links de invitación de GoTrue vencen a las 24 h. Fede fue
  invitado el 07/08 y entró el 23/08 — 16 días — así que llegó por "olvidé mi contraseña"
  (`type=recovery`) y **la activación se salteó por diseño**. La auditoría lo confirma: su fila
  tiene un solo evento, el INSERT. Cero UPDATEs.
- **Efecto**: con `activo=false`, `fn_get_user_club_id()` devuelve NULL y las **72 de 124** policies
  que dependen de ella no devuelven una sola fila. Sesión válida, UI que carga, sistema vacío y
  ni un mensaje.
- **`activacion-pendiente.js`** (nuevo): red de contención compartida. Si la fila propia es una
  invitación de staff sin completar, el usuario la activa él mismo — la policy `usuarios_update` ya
  lo permite por la rama `auth_user_id = auth.uid()`, así que no se agrega ninguna capacidad nueva
  al cliente.
- ⚠️ **El gate es estrecho a propósito.** `estado='pendiente'` lo usan DOS colas distintas:
  la invitación de staff sin aceptar (esa sí se auto-rescata: sólo un super_admin puede invitar, y
  `usuarios_insert WITH CHECK fn_is_super_admin()` ya es la barrera) y el **autorregistro de portal
  esperando aprobación**, que `admin.html` lista con botones Aprobar/Rechazar. Rescatar la segunda
  sería auto-aprobar la cola del administrador. Por eso los roles de portal quedan afuera y se exige
  `estado==='pendiente'` (una baja escribe `'inactivo'`, no se puede auto-revertir).
- **`login.html`**: chequea `activo` para **todos** los roles y **antes** de ramificar por rol.
  Si no se puede rescatar, cierra sesión y muestra el motivo real — "pendiente de activación",
  "desactivada" o "rechazado" — en vez de dejar entrar a una pantalla vacía. También atiende
  `?motivo=` para explicar los rebotes que llegan desde `initAuth`.
- **`reset-password.html`**: se sacó el gate `ES_INVITE` — la activación corre en los dos flujos.
  Quién califica lo decide `esRescatable()`, no el `type` de la URL, así que una cuenta dada de baja
  que resetea su contraseña **no** puede reactivarse sola. De paso se corrigió un comentario que
  documentaba una rama de policy (`email = auth.jwt()->>'email'`) que no existe desde el hardening
  `sec_rls_fase2b_escritura` del 01/08.
- **`index.html` / `portal.html`**: mismo guard en `initAuth`, para las sesiones ya abiertas que no
  vuelven a pasar por el login. Rebotan al login con `?motivo=`.
- **`usuarios.html`**: `toggleActivo` escribe `activo` **y** `estado` juntos. Antes tocaba sólo
  `activo` y dejaba filas incoherentes; ahora Desactivar escribe `estado='inactivo'`, que es
  justamente el valor que `esRescatable()` rechaza.
- **Datos**: se normalizó `vale_0735@hotmail.com` (`activo=true, estado='pendiente'` →
  `estado='activo'`), residuo de la reparación manual del 18/08. 1 fila. **Fede sigue inactivo a
  propósito**: se activa desde `usuarios.html` para que la auditoría registre quién lo hizo.
- **Probe**: `tests/probe_activacion_pendiente.mjs` **17 OK · 0 FALLA**. Corre el código REAL de
  `login.html` y `usuarios.html` (patrón AsyncFunction de `tests/README.md`). El caso central es
  L2: usuario inactivo que no se puede rescatar → **ve el aviso y NO entra**.

## [2026-08-23] — El JSON del Stud Book deja de mandar las No Computables (reunion-json v19)

> Punto 1 de los ocho que reportó Diego. Fede confirmó que las No Computables no van y que el dato
> está cargado por ellos y coincide con el programa impreso.

- **Filtro**: `carrerasVisibles` en `_shared/studbook_format.mjs` ahora exige
  `es_oficial && es_computable`. Está en el origen del pipeline
  (`carreras → carrerasVisibles → carrerasJson → data.carreras`), así que todo lo derivado —
  `competidores_cantidad`, `premios`, `competidores` — sale coherente con lo emitido sin recálculo.
  No hay totales de reunión que puedan quedar desfasados: el formato no tiene ninguno.
- **Impacto en Dolores**: la ONC es la categoría mayoritaria. R8 (2026-08-16) pasa de 8 carreras
  emitidas a **2** — 51,2 KB → 11,7 KB. Quedan `#6 ANIV- DOLORES PRIMER PUEBLO PATRIO` (1100 m) y
  `#2 GRAL JOSÉ DE SAN MARTIN` (800 m), las dos OC, las dos con resultado oficial.
- ⚠️ **El filtro asume la semántica de Dolores.** `es_computable` significa acá "cuenta para el
  Stud Book". Otros clubes ya cargados usan los MISMOS códigos de tres letras con otro sentido: en
  Jockey Club San Francisco (`710d43c1`) `ONC` es "Oficial No Clásico" y **sí** es computable. Hoy
  no molesta porque el endpoint está clavado a `CLUB_ID_DOLORES`, pero **hay que revisarlo antes de
  servirle este endpoint a otro hipódromo**. El eje son los flags, nunca el `codigo`.
- **Probe**: `tests/probe_studbook_v2.mjs` **51 OK · 0 FALLA** (+11 casos: filtro por flag y no por
  código, ONC de dos clubes con flags opuestos, reunión enteramente no computable → `carreras: []`
  con el resto de la estructura intacta, coherencia de `competidores_cantidad`). De paso se
  actualizó la aserción de `parseTiempo`, que había quedado vieja desde el fix de la R8.
- **`tests/dryrun_reunion_json.mjs`** (nuevo): arma el JSON con datos reales de prod y compara
  antes/después sin desplegar. Sólo lee.
- **Deploy v18 → v19**, `verify_jwt: false` preservado. El deploy por MCP manda el fuente inline y
  la llamada topea en ~32 KB; el bundle comentado pesa 32.459 B ya escapado y no entra. Se agregó
  `_build/slim.mjs`, que genera `_build/index.slim.ts` sacando **sólo** las líneas que son 100 %
  comentario (seguro: el bundle no tiene ningún template literal multilínea, y el generador aborta
  si aparece uno). El slim lleva en el header el sha256 del bundle del que salió. El canónico para
  leer y revisar sigue siendo `_build/index.ts`.

## [2026-08-23] — JSON del Stud Book: tiempos, centésimas y jockey (reunion-json v18)

> Cuatro de los ocho puntos que reportó Diego sobre el JSON de R8. Fuera de alcance a propósito:
> carreras No Computables y campos de condición — los define Fede.

- **`parseTiempo`**: campo **`centesimas`** nuevo, con el nombre correcto. **`decimas` se mantiene**
  emitiendo el mismo número — contrato aditivo, igual que `numero_publico`: Diego hoy lo lee como
  centésimas, así que "corregirlo" a décimas reales le habría roto la lectura en silencio. Un dígito
  después del punto se normaliza (`1:15.5` → 50 centésimas). Guarda de plausibilidad
  `TIEMPO_MAX_SEGUNDOS = 600`: por encima de 10 min salen los cuatro campos en `null`.
- **Bloque `jockey`**: estaba hardcodeado a tres `null` con un `// v1`. Ahora sale de
  `jockey_suplente_id ?? jockey_titular_id` — la única fuente que existe: no hay columna del jockey
  que corrió, ni en `inscripciones` ni en `resultado_posiciones`. `jockey_suplente_id` se agregó al
  lookup de `profesionales` en los dos consumidores.
- **Datos — 2 tiempos de R8 corregidos contra el ticket del tote**: prog 1 (800 m) `43:13.00` →
  `00:47.13`, prog 2 (800 m) `49:00.00` → `00:49.00`. Las otras 6 coincidían dígito por dígito. Las
  8 salen ahora con tiempo válido, banda 15,89–16,97 m/s. Rollback en
  `docs/FIX_JSON_STUDBOOK_R8.md`.
- **`resultados.html`**: la máscara del tiempo validaba forma, no magnitud. Ahora se cruza contra
  `carreras.distancia_metros` (banda 8–20 m/s), se acepta la forma en segundos pelados
  (`47.13` → `00:47.13`) y el rechazo sugiere la reinterpretación. Era la causa del error: para una
  carrera sub-minuto la forma natural de tipear no estaba permitida.
- **Deploy**: `reunion-json` **v17 → v18**, `verify_jwt: false` preservado. Smoke test en frío:
  401 limpio sin token y con token inválido.
- **Sin tocar, con diagnóstico**: `studbook_id` 44/67 competidores de R8 (23 en NULL, 2 de ellos
  ganadores; `Wave Rimout` duplicado en `spcs`). DNI: jockeys 23/26, cuidadores 26/43. CUIT no tiene
  columna en `profesionales`.

## [2026-08-23] — `peso_balanza`: saneamiento de R6/R8 + barrera de rango

> Fede confirmó que en Dolores **sí** se pesan los caballos y que lo cargado en R6 y R8 fue un
> error; el dato correcto se empieza a cargar desde la reunión del 20/09. La definición de la
> columna no cambia — lo que se agrega es que no se pueda volver a cargar mal.

- **`resultados.html` — guard en `savePesoBalanza()`**: antes hacía `parseFloat(raw)` y persistía
  cualquier valor. Ahora rechaza fuera de 300–600 kg y no-finitos, **bloquea el guardado entero**
  (no guarda las buenas y descarta las malas), marca los inputs con `.pb-invalid` y nombra los
  ejemplares en el toast. Vacío sigue siendo válido → `NULL`.
- **Saneamiento de datos**: 104 filas de R6 (57) y R8 (47) tenían el handicap del jockey (54–64 kg)
  en la columna del peso del caballo. **103 de las 104 eran copia exacta de `peso_final`** — la
  excepción, `73cd96b9`, tenía 55 contra 57. Pasaron a `NULL`: no se perdió información, porque
  `peso_final` conserva los mismos números con el nombre correcto, y `peso_balanza` no entra en
  ningún cálculo de liquidación (no lo lee `liquidaciones-engine.js`; ningún premio ni recibo
  cambia). Rollback explícito en `migrations/ROLLBACK_peso_balanza_null_r6_r8.sql`.
- **Constraint `inscripciones_peso_balanza_rango`** (`migrations/peso_balanza_check_rango.sql`):
  CHECK 300–600 con `NULL` permitido, aplicado **validado** (`convalidated = true`). Se descartó
  `NOT VALID` a propósito — ver GOTCHAS #72: no exime a las filas viejas de los UPDATE futuros, así
  que con los datos sucios en su lugar habría roto `ratificacion.html` y compañía con una violación
  de una columna que esos módulos ni tocan.
- **Efecto en la integración con el Stud Book**: `studbook_format.mjs` manda
  `kilos_ejemplar: str(i.peso_balanza)`. Para R6/R8 el JSON de Diego pasa de afirmar un peso de
  ejemplar falso (57 kg) a mandar `null` = "no tengo el dato".
- **Docs**: GOTCHAS #72 y #73, `SCHEMA.md`, `docs/PREGUNTAS_ABIERTAS.md` #21 (rango cerrado;
  obligatoriedad y descalificados siguen abiertos), nuevo **ISSUE-052** (R6 en `borrador` con fecha
  pasada y las 8 carreras oficiales — anotado, deliberadamente sin tocar).

## [2026-07-25] — Alta por invitación: error reintentable (precondición 2 de la etapa (c))

> Branch `feat/invitacion-reintento`. **Sin deploy todavía**: la Edge Function nueva no está en
> producción, así que la etapa (c) de `docs/plan_alta_invitacion.md` sigue cerrada. La otra
> precondición (reportar el bug `kid <nil>` a Supabase) sigue pendiente.

- **`invite-user`**: el bug de plataforma `invalid JWT: unrecognized JWT kid <nil> for algorithm
  ES256` (~1 de cada 3 llamadas a los endpoints admin de GoTrue) ya no se ve como error
  definitivo. Nuevo `503 error_transitorio` en los dos puntos donde pega: el `listUsers` de
  `findAuthUserByEmail()` y el `inviteUserByEmail()`. Dos predicados y no uno:
  `esKidNilAdminApi()` es sólo texto y se usa sobre el `/invite` (un 502/504 de gateway ahí sí
  puede haber mandado el mail); `esTransitorioPreMail()` agrega 502/503/504 y se usa sólo antes
  del mail. La función **no** reintenta sola.
- **`usuarios.html` / `admin.html`**: botón **↻ Reintentar** dentro del cuadro de error, sin
  perder lo cargado en el formulario. Se ofrece con un allowlist explícito (`esReintentable()`) y
  el criterio es único — sólo si se puede afirmar que ningún mail salió. `invite_failed` queda
  afuera y su copy pide verificar el mail antes de reenviar.
- **`admin.html`**: el alta de hipódromo son 3 escrituras (club → categorías → invitación). Nuevo
  estado `altaEnCurso = {clubId, catsOk}`: el reintento **retoma** desde el paso que falló en vez
  de volver a empezar, que crearía un hipódromo duplicado. Ante un fallo transitorio de la
  invitación el modal ya no se cierra.
- **`tests/probe_invite_user.mjs`**: `error_transitorio` sumado a `REINTENTABLES_PRE_MAIL` y el
  reintento acepta 503 además de 500.

## [2026-07-24] — Alta de usuarios por invitación cerrada (etapas a+b VIVAS) + reunión 6 oficializada

> Merge `f8f5b0a` (branch `feat/alta-invitacion`). Cierra las etapas 0, (a) y (b) de
> `docs/plan_alta_invitacion.md`. Etapas (c) y (d) siguen pendientes.

### Alta por invitación — sistema completo en prod
- **Edge Function `invite-user`** (`supabase/functions/invite-user/index.ts`, commits `4f0a45f` /
  `7842ec6`): único lugar del sistema con la key secreta server-side. Autorización por **mapa de
  datos** (`REGLAS_POR_ROL_CALLER`), no por cadena de `if` — `super_admin` invita cualquier rol a
  cualquier club, `secretario_carreras` sólo `secretario_carreras`/`operador` **en su propio
  club** (el `club_id` del body se descarta). Compensación anti-huérfanos: si el `INSERT` en
  `usuarios` falla, se borra la cuenta de Auth **sólo si la creamos en ese request**.
  Probe `tests/probe_invite_user.mjs` verde (37 assertions / 7 casos, incluye escalada de
  privilegios) contra prod.
- **Landing `reset-password.html`**: entiende `type=invite` además de `type=recovery`, con copy
  diferenciado, y hace el `UPDATE activo=true` / `estado='activo'` al fijar la contraseña. Sin
  esto la invitación llegaba al mail y moría en la landing.
- **Pantallas migradas** (`usuarios.html`, `admin.html`, commit `abe6e35`): `signUp()` + insert
  reemplazados por la llamada a `invite-user`. `login.html` perdió el link de auto-registro; el
  alta pasa por secretaría. `signUp()` queda aislado en `registro.html` /
  `registro-profesional.html` (legacy, sin enlaces entrantes, se deciden en la etapa (d)).
- **SMTP propio**: **Resend** activo, dominio `hipodromodolores.com` verificado (SPF/DKIM).
  Sender `sistema@` provisorio, el definitivo lo define Fede. Reemplaza al built-in de Supabase
  y su cuota de 2 mails/hora.
- **Verificación end-to-end** contra producción (24/07): invitación → mail entregado → link →
  contraseña fijada → fila `activo=true`/`estado='activo'` → login con `club_id`/`rol` correctos.
  Usuario de prueba borrado después de verificar.

### Reunión 6 (20/06/2026) — primera oficialización real
- **8 carreras corridas, 8 resultados en `oficial`** (turnos 4, 7 y 10 anuladas, de 11 turnos).
- **Liquidaciones generadas**: **79 headers / 203 líneas** en `estado='borrador'`. Desglose por
  concepto: premio 79, incentivo entrenador 57, fondo solidario 40, incentivo jockey 21, bono 6.
- **Retención anti-doping activa**: 31 líneas de premio en `estado_linea='retenido'` (1° y 2°),
  con liberación manual vía RPC `liberar_linea`.

### Programa oficial — filtro de estado NULL-safe
- Merge `82f87d8` (`ce52658`). `carreras.estado` es VARCHAR libre y admite NULL (gotcha #5): el
  `.neq('estado','anulada')` se traduce a `estado <> 'anulada'`, que para NULL da NULL y
  **descartaba la fila en silencio**. El turno 2 de la R6 desaparecía del programa con todos sus
  ratificados. Corregido con `.or('estado.is.null,estado.neq.anulada')`.
- Mismo commit: el banner de próxima reunión **nunca renderizó**. El filtro usaba
  `.neq('estado','anulada')` sobre `reuniones.estado`, que es el ENUM `estado_reunion` y **no
  tiene** la etiqueta `anulada` (usa `cancelada`) → reventaba con `22P02` y dejaba
  `proximaReunion` en null. Corregido a `.or('estado.is.null,estado.neq.cancelada')`.
- Los dos fixes en `programa-oficial.html` y `programa-oficial-color.html`. Probe
  `tests/probe_programa_null_estado.mjs`.

### Chapas — falta el margen "4½ cpos"
- Commit `f9f8807`: se agrega `4½ cuerpos` (id 20) al catálogo de `chapas.js`. El margen existía
  en el uso real y no estaba en la paleta, así que no se podía cargar.

### Programa color — tapa nueva + sponsor
- Merge de `feat/programa-tapa-sponsor` (`144daf7`, `feccf83`): foto de tapa `tapa-02.jpg`
  (elección de Leo entre las subidas) y **flyer de Revista Palermo** al pie de
  `programa-oficial-color.html`. Imágenes movidas de la raíz a `assets/`.

## [2026-07-22] — Pedigree en el programa: backfill SB + columna PADRE-MADRE sin placeholders

> Branch `feat/pedigree-programa`. El programa sale por sistema con el padre y la madre de cada caballo, como el programa de papel.

- **Hallazgo que corrigió el plan**: el pedigree **no estaba en `spcs.notas`**. Ya vivía en `spcs.padrillo_nombre` / `spcs.madre_nombre` (118/144). `notas` sólo guarda el rastro del scrape (SB id, URL, microchip, criador, abuelo materno). Por eso **no se agregaron columnas `padre`/`madre`** (habrían duplicado el dato y los 3 renderers ya leen las viejas) y **no hubo backfill notas→columnas** (sin insumo).
- **Backfill desde el Stud Book** (`tools/sb_pedigree_26.py`, read-only): de los 26 SPCs sin pedigree, 23 encontrados. **21 UPDATE aplicados** (aprobados por review), sólo `padrillo_nombre`/`madre_nombre`, con guard `AND ... IS NULL` idempotente. **118 → 139 / 144**.
- **Excluidos a propósito (5)**: `GREAT ORPEN` (68 días de discrepancia de fecha + inscripción viva → verificación aparte con Fede; sentencia comentada en la migración), `First Queen` (2 homónimos en SB, ninguno cierra en fecha), `Fist Queen` y `Malenuchi` (duplicados de DB, no existen en SB), `Esplendido Craf` (sólo existe `ESPLENDIDA CRAF`, no cierra ni sexo ni año). Ninguno tiene inscripciones vivas salvo GREAT ORPEN.
- **Render sin placeholders**: `programa.html` ya no imprime `'?'` cuando falta padre o madre — el dato ausente queda **vacío**. El separador ` - ` no queda colgado si falta un lado, y si faltan los dos no se imprime el `Por`. Mismo fix en `programa-oficial.html` y `programa-oficial-color.html`, donde sin padrillo pero con madre salía `" — MADRE"` con el separador colgado. **Los separadores existentes no se cambiaron** (` - ` en programa, ` — ` en los oficiales) para no tocar la salida impresa que Fede ya valida.
- **Reportado sin corregir**: 13 discrepancias de `sexo` SB vs DB (el alta manual deja `macho` por default) y `color` NULL en los 26 — afectan el sexo/pelaje impreso en el programa oficial. Tanda propia.
- Probe: `tests/probe_pedigree_programa.mjs` (**20/20**) — real-code, extrae los snippets reales de los 3 HTML y los corre sobre filas `spcs` reales con las 4 combinaciones de pedigree. Reunión descartable 9998, teardown en la misma corrida.

## [2026-07-21b] — Premios: corrección display → BOLSA EFECTIVA (con piso), bonos aparte

> Branch `fix/bolsa-efectiva-display`. **Corrige la tanda anterior** (regla real aclarada por Yesica): la BOLSA del display NO es la nominal, es la **efectiva con piso**.

- **Display por puesto = EFECTIVO con piso** (`repartoDisplay` ahora envuelve `calcPremiosConPiso`): 4°/5° por debajo del piso se muestran **en el piso** (ej. 100.000). Antes se mostraba el nominal — era un misread.
- **BOLSA impresa = round(bolsaEfectiva) = Σ de los puestos efectivos.** Ej: bolsa cargada 1.191.666 + piso 100.000 → impresa **1.284.416**. `repartoDisplay` redondea cada puesto y el puesto de **mayor monto** absorbe el resto → **Σ puestos ≡ total EXACTO** (espíritu del FIX 2, ahora sobre la efectiva), sin desclavar los pisos.
- **Bonos siguen APARTE** — NO se suman a la BOLSA (`calcPremiosConPiso` los excluye). Esto **no cambia** (decisión de Fede).
- **Sin tocar** `calcPremiosConPiso` ni la liquidación. Cambio centralizado en `repartoDisplay` → los **6 sitios de display** heredan automático (carta-llamados card + PDF, programa, programa-oficial, programa-oficial-color, inscripciones, ratificacion).
- Se mantienen: línea informativa "Ganancia mínima por puesto" y warning `pisoSospechoso()`.
- Probes: `tests/probe_reparto_display.mjs` (9/9, asserta BOLSA=Σ efectivos exacta, 1.191.666+piso→1.284.416, bonos NO sumados) + `tests/probe_piso_warning.mjs` (5/5). Real-code, reunión descartable 9998, teardown en la misma corrida.

## [2026-07-21] — Premios: display nominal + suma exacta + warning piso; restore post-pausa

> ⚠️ **SUPERSEDED por [2026-07-21b]**: la regla "BOLSA nominal" de abajo fue un misread; la real es BOLSA **efectiva con piso**.

> En main/prod. Merge `d626049` (branch `feat/premios-display-v2`, commits `94c8bbd` / `4c01720` / `1ac48e8` / `0fac812`). Revisado por raw antes de mergear.

### Display de premios — decisión de Fede: BOLSA impresa = NOMINAL
- **BOLSA impresa = `bolsa_total` nominal** (reparto 1°-5° tal cual se carga). Ni el piso `ganancia_minima` ni los bonos inflan ese número. Nuevo helper `repartoDisplay()` en `premios-utils.js` reemplaza a `calcPremiosConPiso` en los **6 sitios de display** (carta-llamados card + PDF, programa, programa-oficial, programa-oficial-color, inscripciones, ratificacion).
- **Bonos como líneas aparte condicionales** (solo si monto > 0). En carta-llamados el número BOLSA dejó de sumarlos.
- **Línea informativa "Ganancia mínima por puesto"** (condicional a `ganancia_minima > 0`, mismo estilo que las líneas de bono): comunica el piso sin inflar la bolsa.
- **Reparto con suma exacta**: puestos 1°..(n-1) redondean, el último absorbe el resto → Σ puestos ≡ `round(bolsa_total)` siempre (antes desfasaba $1 por redondeo independiente).
- **`calcPremiosConPiso` intacto**: el piso sigue vivo solo en **liquidación** (pago), no en el display.
- **Warning de piso desproporcionado**: `pisoSospechoso()` (piso > 20% de la bolsa) dispara un `confirm` al guardar en carta-llamados. Warning, **no bloqueo**.
- Probes (real-code, reunión descartable 9998, teardown en la misma corrida): `tests/probe_reparto_display.mjs` (7/7), `tests/probe_piso_warning.mjs` (5/5).

### Fix de data
- **Turno 12, reunión 2026-07-19**: `ganancia_minima` corregida **1191666 → 100000** (error de tipeo: se había cargado la bolsa entera en el campo del piso). El resto de la distribución intacto. `UPDATE` puntual con `jsonb_set` sobre una fila.

## [2026-06-12] — Stud Book: Edge Function `reunion-json` deployada + pasada de formato + seed 9999

> Todo en branches, NO en main. Edge Function + seed: `feat/edge-reunion-json`. Pasada de formato del generador: `feat/json-generator` (`08f8bcb`).

### 1. Edge Function `reunion-json` (Supabase, v7) — VIVA
- `supabase/functions/reunion-json/index.ts`: expone el JSON de reunión por `?fecha=YYMMDD`, **scope Dolores**. URL `…/functions/v1/reunion-json`.
- **Auth** `Authorization: Bearer <STUDBOOK_API_TOKEN>` (o `?token=`), **`verify_jwt` OFF** → el cliente (Diego) llama con **solo el token, sin anon/publishable key**. Sin token / token incorrecto → 401 (no fail-open).
- **DB server-side** con `STUDBOOK_DB_KEY` (`sb_secret_…` en el env de la función; NO la service_role legacy `eyJ`, muerta el 7/6).
- Reusa `supabase/functions/_shared/studbook_format.mjs` → **mismo output byte-a-byte** que el CLI `tools/studbook_reunion_json.mjs`.
- **Validada contra 9999**: `990101` → 200 + diff idéntico a `tools/samples/9999_sample.json`; 401 sin/mal token; `010101` → 404.

### 2. Generador JSON — pasada de formato calcado de La Punta (`08f8bcb`, `feat/json-generator`)
- Wrapper `{status:200, data}`; numéricos a **string** (`numero`/`distancia`/`premios`/`orden`/`kilos`/`jockey_kilos`/`pagaria`); `premios` y `competidores` **doble-anidados** `[[…]]`. Sample completo `tools/samples/9999_sample.json` (datos fake, sin PII).

### 3. Seed de resultados 9999 + teardown extendido (`feat/edge-reunion-json`)
- `tools/seed_9999_resultados.sql`: caballerizas + profesionales ficticios (`PRUEBA 9999 — BORRAR`) + re-apunta FKs de inscripciones para resultados completos.
- `teardown_prueba_resumen_9999.sql`: borra los fakes en orden FK (profesionales → caballerizas).
- `.gitignore`: `tools/_out/` (salida regenerable con datos reales) + `supabase/.temp/` (estado local del CLI).

### Pendientes (ISSUE-030)
- ⚠️ Rotar `STUDBOOK_API_TOKEN` antes del 20/6 (expuesto en setup; hoy solo cubre la 9999 fake).
- Correr teardown de 9999 antes del 20/6.
- Confirmar con Diego el doble-anidado `[[…]]` (a propósito o se aplana).
- Diego prueba el endpoint con `fecha=990101`.

## [2026-06-11] — Stud Book: scrape fase 1 + carga 25 SPCs + columna studbook_id + workstream API

> Solo `studbook_id` está VIVO en main/prod (merge squash PR #2, `db0b2fc`). El scrape (fase 1) y la carga (fase 2) viven en la branch `feat/studbook-extract` — **no mergeada a main** (artefactos persistidos en esa branch).

### 1. Stud Book scrape — fase 1 (branch `feat/studbook-extract`, NO en main)
- `tools/sb_extract.py` — extractor read-only de www.studbook.org.ar (autocomplete `?tipo=1&muerto=1&term=` + perfil). No toca Supabase.
- `data/studbook_26.json` — 25/26 ejemplares encontrados con sexo + `fecha_nacimiento` + pedigree (padre/madre/abuelo materno) + criador + microchip. **0 ambiguos**.
- `LADY BLICK` quedó NO_ENCONTRADO por match exacto. Búsqueda parcial 11/06 ("LADY BL") → candidato único probable **LADY BLIK** (id `436014`, Hembra, 2022-08-25, Zaino Colorado, padre Lencelot, madre Blik, abuelo materno Missionary (USA), criador Los Bayitos). Pendiente confirmación de Fede antes de linkear.

### 2. Carga de 25 SPCs — fase 2 (branch `feat/studbook-extract`, NO en main)
- 25 ejemplares insertados en `spcs` con `club_id=NULL` (globales), `sexo` + `fecha_nacimiento` del Stud Book; enriquecimiento (SB id, url, microchip, criador, damsire) en `notas`. spcs 40 → 65.
- Reporte completo (mapeo + UUIDs + rollback) en `data/studbook_26_insert_report.md`.
- **SALVADOR EVER**: discrepancia de sexo en la planilla resuelta = **macho** (corre carrera de exclusión de yeguas → no puede ser hembra). Cargado macho.
- BACHUNA: microchip null (anotado en notas).

### 3. Columna `studbook_id` en `spcs` — VIVO en main/prod (`db0b2fc`)
- `migrations/add_studbook_id.sql`: `ADD COLUMN studbook_id text` + índice único parcial `spcs_studbook_id_uniq` (`WHERE studbook_id IS NOT NULL`).
- El "Idcaballo" del Stud Book (identificador externo para su API). **Distinto de `registro_stud_book`** (sigue NULL). Tipo text a propósito (id externo, sin aritmética, la API lo manda como string).
- Backfill idempotente de los 25 desde `data/studbook_26.json` (no toca notas). Verificado contra prod: `count(studbook_id NOT NULL) = 25`, ALIADO SCAT=414038, SALVADOR EVER=432357, índice presente.
- Doc: línea de `studbook_id` agregada a la def de `spcs` en `docs/SCHEMA.md`.

### 4. Integración Stud Book API — workstream abierto (ISSUE-030)
- Diego (Stud Book) ofreció acceso a su API y mandó el formato JSON de La Punta como referencia. Se armó un borrador de mapeo para responderle.
- **PENDIENTE**: 7 preguntas a Diego (endpoints, auth, pull vs push, leyenda de estados, mapeo caballeriza→propietario, etc.). Tracking en ISSUE-030.

### Pendientes anotados (ver ISSUES.md)
- LADY BLICK / LADY BLIK → confirmación de Fede → linkear `studbook_id=436014`.
- Caballerizas + entrenadores + propietarios de los 25 SPCs: bloqueado en data de dueños de Fede (FKs en NULL).
- Semántica `abuela_materna`: el "por X" del SB es abuelo materno (damsire), no abuela real → hoy en notas, columna `abuela_materna` queda NULL hasta aclarar.

## [2026-06-10] — des-oficializar carrera vía RPC atómica — VIVO en main/prod

> Merge no-ff `feat/desoficializar-rpc` (`61bd81d`). Solo `resultados.html` + `migrations/desoficializar_carrera.sql`.

### desoficializar_carrera (RPC)
- `resultados.html`: el UPDATE directo a `resultados` se reemplaza por `sb.rpc('desoficializar_carrera', { p_carrera_id })`. La RPC (SECURITY DEFINER) hace el guard duro de pagos (RAISE si hay recibos emitidos) + `estado→provisional` + limpieza `oficializado_*`. El recálculo del motor lo sigue orquestando el cliente; el RAISE del guard cae en toast y no recalcula.
- Grants verificados: `authenticated` EXECUTE; `anon`/`public` SIN EXECUTE (igual que `emitir_recibo` y `liberar_linea`).

## [2026-06-10] — Apoderados en Pagos (v1.1) + Resumen ampliado — VIVO en main/prod

> Merges no-ff `feat/apoderados-v1.1-pagos` (`e7a5fb1`) + `feat/resumen-desglose` (`f5a56c4`). Solo `liquidaciones.html`, todo read-only.

### ISSUE-028 v1.1 — display de apoderados en Pagos (read-only)
- `cobrosDetalle`: query `apoderados` (vigente=true + club + autorizante) sumada al `Promise.all`. Bloque "🪪 Autorizados a cobrar" (nombre · DNI, nombre por `escapeHtml` nuevo) o línea "Sin autorizados registrados — cobra el titular.". 0 escrituras; emisión/RPC sin tocar.

### Resumen ampliado — desglose por concepto + montas perdidas (read-only)
- `loadResumen`: **desglose por concepto** (suma `monto_neto` por `concepto_tipo`: Premios / Actuaciones / Incentivo jockeys / Incentivo cuidadores / Bonos / Fondo solidario) con badge de reconciliación (suma = Total liquidado).
- **Montas perdidas** (informativo, sin plata): conteo `resultado_posiciones.no_largo=true` por jockey (path motor: carreras→resultados oficiales→posiciones→inscripciones). Solo `.select()`.
- Probes throwaway sin residuo (Dolores en 0): apoderados query devuelve solo vigente; conceptos suman al total; montas perdidas por jockey coinciden con filas no_largo (jockey null saltado).

## [2026-06-10] — ISSUE-028 Apoderados v1 (autorizados a cobrar) — VIVO en main/prod

> Merge no-ff `feat/apoderados-v1` → main. Tabla nueva, no toca plata existente.

### Apoderados — tabla + gestión
- **Migración `migrations/apoderados.sql`** (aplicada por MCP): tabla plana `apoderados`. Autorizante polimórfico (`autorizante_tipo` propietario/profesional + `autorizante_id` SIN FK, patrón beneficiario). `autorizado_nombre`/`autorizado_documento` NOT NULL, `vigente` default true, `creado_at`/`creado_por`. Unique parcial `(club_id,tipo,id,documento) WHERE vigente` (anti-dup, permite re-autorizar tras revoke).
- **RLS** club-scoped: 4 policies `TO authenticated`, `fn_is_super_admin() OR club_id=fn_get_user_club_id()` (idéntico a `caballerizas`). Tabla plana con RLS — NO SECURITY DEFINER. Grants estándar.
- **UI** en `propietarios.html` + `profesionales.html`: sección "Autorizados a cobrar" en el modal de edición (solo sobre autorizante existente) — listar (nombre+DNI+vigente/revocado), agregar (insert con club_id+tipo+id), revocar (`vigente=false`, conserva registro).
- Probe DB (restaurado sin residuo): insert→list→duplicado vigente bloqueado→revoke (conserva)→re-autorizar OK→cleanup. **Decisión abierta:** `autorizado_documento` quedó NOT NULL (cambiar a opcional = `ALTER COLUMN DROP NOT NULL`, sin riesgo). Pendiente **v1.1: display en Pagos**.

## [2026-06-10] — Fase 5 Resumen de reunión (v1, read-only) — VIVO en main/prod

> Merge no-ff `feat/fase5-resumen` → main. Solo `liquidaciones.html` (+95/-1). No toca plata: solo lectura.

### Fase 5 — pestaña "📊 Resumen" (read-only)
- Nueva pestaña junto a Pagos, selector de reunión propio. Agrega `liquidacion_detalle` por `estado_linea` para la reunión elegida; **no escribe**.
- Buckets: **Total liquidado** / **Pagado** (+ N recibos distintos) / **Pendiente** (impago) / **Retenido** (anti-doping, bucket propio) / **Fondo solidario club** (2%, bucket propio, excluido de personas).
- **Reconciliación**: `pagado + impago + retenido + fondo = total` con badge cuadra/dif.
- **Pendientes por beneficiario** (persona, non-club, adeudado>0): columnas Impago | Retenido | Total, orden desc. Agrupa por `beneficiario_tipo|beneficiario_id` igual que Pagos → sub-roles peón/capataz/sereno ruedan bajo el entrenador (ADR-025); nombres vía `nombreBenef` (GOTCHA #50).
- Probe throwaway (reunión fake, restaurada sin residuo): buckets reconcilian (total 33600, diff 0.00), peón rolled-up bajo entrenador, pagado-only excluido de pendientes. Dolores quedó en 0 liquidaciones.

## [2026-06-08] — Incentivos montas + Fase 4 Pagos/recibos (v1, v1.1) + recibo logo/firma — VIVO en main/prod

> SHAs verificados contra git.

### Incentivos Bloque C — montos Fede + granularidad (merge `47362ef`)
- Jockey **50.000 fijo por reunión** (1 línea por jockey que corrió, aunque tenga N montas — dedup).
- Entrenador **10.000 por caballo corrido** (1 línea por inscripción corrida, sin dedup, `inscripcion_id` seteado).
- Montos en `liquidacion_config` (DML prod 50000/10000). Probe `tests/probe_incentivos_montas.mjs` (11/11). No tocó bonos ni retención.

### Fase 4 v1 — tab Pagos + buscador + emisión de recibo (merge `1a50359`)
- RPC `emitir_recibo` SECURITY DEFINER: número correlativo (`fn_siguiente_recibo`) + insert `recibos` + marcado atómico de líneas pagables → pagado/recibo_id/pagado_at. Idempotente, blindaje por beneficiario, RAISE si 0 marcadas. `migrations/emitir_recibo_fase4.sql`.
- Tab "🧾 Pagos": buscador por persona/caballeriza (excluye club), detalle pagable cruzando reuniones, emisión vía RPC, print con firma(efectivo)/comprobante(transferencia). Probe `tests/probe_recibos_emision.mjs` (14/14).
- Hallazgo: peón/capataz/sereno NO buscables por su persona — cobran dentro del recibo del entrenador (ADR-025).

### Fase 4 v1.1 — liberación MANUAL del doping + búsqueda + filtro carrera (merge `4851129`)
- `emitir_recibo` v1.1: pagable = **SOLO impago** (sacado el `OR (retenido AND fecha_liberacion<=hoy)`). `migrations/emitir_recibo_v1_1.sql`.
- RPC `liberar_linea(uuid)` SECURITY DEFINER: flip `retenido→impago` (liberación manual al llegar el doping); club scoping vía `fn_club_de_liquidacion`/`fn_get_user_club_id` (backend service_role pasa); sin tocar grants. `migrations/liberar_linea.sql`.
- Frontend: sección "🔒 Retenido por doping" con botón Habilitar→`liberar_linea`; filtro por carrera (`numero_carrera_programa ?? numero_turno`); búsqueda por nombre/apellido/DNI (`benefSearch`). Probe `tests/probe_cobros_v11.mjs` (11/11). La retención automática 1°/2° (Fase C) NO se tocó.

### Recibo — logo + firma (`6d1ed11`, `154c83e`) · Fix modal (`a1565cd`)
- Recibo (ambos templates): logo del club (`clubs.logo_url`) en membrete a la izquierda (~100px) + firma sin recuadro (línea + leyenda "Firma y sello").
- `.modal` `margin: auto` → `margin: 0 auto` (top-align respetando `align-items:flex-start` del overlay; afecta detalle/reparto/comisión).

## [2026-06-07 / 2026-06-08] — Liquidaciones C+D (Fase 0-2) + Fix D · Fase C — VIVO en main/prod

### Liquidaciones C+D — VIVO en main/prod

> **Estado de deploy (SHAs verificados contra git):** Fase 0 (schema), Fase 1 (config por club) y Fase 2 (fondo solidario 2% + bono 6-8 100% propietario + incentivos) **VIVAS en main/prod** vía merge **`ccef143`** (`fix/security-hardening`, 2026-06-07). **Fase C** (estado_linea + retención anti-doping 1°/2°, incl. NOTA-A subs actuacion) **VIVA en main** vía **`7e638c7`** (2026-06-08). **Fix D** (captura de caballeriza en `spcs.html`, `f-caballeriza-form`/`f-sexo-form`) **vivo en main** (`20fdbc7`, mergeado en `ccef143`). **E1** (caballeriza obligatoria al ratificar, hard block) **NEUTRALIZADA en main** (**`7af005c`**) — motivo: que Fede pueda ratificar sin caballeriza obligatoria mientras falta el backfill SPC→caballeriza; reactivación = backfill + `git revert 7af005c` con Fede avisado.

#### Schema — Fase 0 (vigente en DB)
- Migración `migrations/liquidaciones_cd_fase0.sql` (idempotente). 5 ENUMs (`estado_linea_liq`, `concepto_liq`, `beneficiario_tipo`, `forma_pago_recibo`, `estado_recibo`); 3 tablas (`liquidacion_config` con CHECK suma=100, `club_secuencias`, `recibos` con `neto_a_cobrar` GENERATED + CHECK beneficiario + UNIQUE club+numero); 10 columnas nuevas en `liquidacion_detalle` (la LÍNEA como unidad de deuda); `fn_siguiente_recibo` SECURITY DEFINER; RLS + auditoría en las 3 tablas; seed de Dolores. Ver SCHEMA.md y ADR-042..047.

#### Fase 1 — config por club (en main)
- `generarLiquidaciones` lee % de reparto e incentivos desde `liquidacion_config` (antes hardcodeados). Pestaña "Reparto de premios" en liquidaciones.html.

#### Fase 2 — fondo solidario + bono 6-8 + incentivos (en main)
- **Fondo solidario 2%:** una línea por ubicado 1-5 (`concepto_tipo='fondo_solidario'`, `beneficiario_tipo='club'`, `beneficiario_id=CLUB_ID`), 2% de `premioEfectivo` (incluye bono al ganador y piso; NO el bono 6-8). Agrupadas en una liquidación `club` por reunión (sin persona). 98% roles + 2% fondo = 100%.
- **Bono 6°-8°:** sacado de `calcPremio` (era código muerto, ver GOTCHA #45) → helper `calcBono68`. Paga 100% al propietario, neto, `concepto_tipo='bono'`.
- **Bono al ganador:** sin cambios — sigue fundido en el premio del 1° y repartido por roles (`concepto_tipo='premio'`).
- **Incentivos (Bloque C):** líneas `incentivo_jockey`/`incentivo_entrenador` desde `liquidacion_config`, una por profesional que largó (`no_largo=false`) estando ratificado, neto, independiente del premio. Guard: monto 0/null → no genera (hoy ambos en 0 → no se generan).
- **Cosmético:** `renderLiquidaciones` muestra "Fondo solidario (club)" para la liquidación club.
- **Descuentos:** `descPct` (comision_config) aplica solo a `premio`; bono/incentivo/fondo van netos.

#### Tests
- `tests/probe_fase2_liquidaciones.mjs` — 14 checks de FORMA de líneas sobre R5 (extrae el cuerpo real de `generarLiquidaciones` y lo corre sin browser). Snapshot+restore de resultados/liquidaciones/roles. Solo valida forma; no aprueba/paga.

#### Sin cambios de schema en Fase 1 y 2
- Todo se apoya en ENUMs/columnas de Fase 0.

#### Derivación de propietario (02/06/2026 — APLICADA en prod)
- Migración `migrations/liquidaciones_cd_propietario_derivacion.sql` (aplicada por MCP). Construye el puente `caballeriza_responsables (titular) → propietarios` y deriva `inscripciones.propietario_id` desde la caballeriza:
  - **A1/A2:** columna `caballeriza_responsables.propietario_id` (FK) + índice único parcial `ux_propietarios_club_doc (club_id, documento_tipo, documento_nro) WHERE documento_nro IS NOT NULL`.
  - **B1/B2:** import de **213 propietarios** de Dolores desde responsables titulares con DNI (`propietarios` 7 → 220; `prop_dolores` 0 → 213; sin duplicados) + backfill del puente por documento. 5 titulares sin DNI quedan como excepción (no se importan).
  - **C/C2:** trigger `trg_insc_set_propietario` (BEFORE INSERT/UPDATE OF caballeriza_id) que deriva `propietario_id` desde el titular activo de la caballeriza; backfill de existentes.
  - **C3:** trigger gemelo `trg_cab_resp_set_propietario` (BEFORE INSERT/UPDATE) que al alta/edición de un titular resuelve `v_club` desde la caballeriza (guard `RAISE` si NULL) y crea/enlaza el propietario (idempotente por documento).
- **Cobertura histórica: 3/87 inscripciones** quedaron con `propietario_id` (las únicas de R5 con `caballeriza_id` + titular resuelto). El resto sigue sin propietario porque **no tiene `caballeriza_id`** (76/87) — causa raíz: el alta de SPC pierde la caballeriza (ISSUE-026). Los triggers C/C3 cubren la captura **hacia adelante**.
- Probe `tests/probe_propietario_derivacion.mjs` — 11 checks (cadena estática BAUTY MI→OLGUIN + triggers C y C3 en vivo con revert/cleanup). Todo OK.

#### Captura de caballeriza hacia adelante (02/06/2026 — branch, alimenta la derivación)
- **Fix D — `spcs.html` (ISSUE-026, id duplicado):** los selects del modal (`f-sexo`, `f-caballeriza`) colisionaban con los filtros del toolbar → `getElementById` agarraba el toolbar y `caballeriza_id` se guardaba **siempre null** (causa raíz de los 76/87 sin caballeriza). Renombrados a `f-sexo-form` / `f-caballeriza-form`; populate/openModal/saveRecord apuntan al modal. Probe `tests/probe_spcs_caballeriza.mjs` (11/11, jsdom + roundtrip real a DB).
- **Fix E — caballeriza obligatoria al ratificar:**
  - **E1 (`ratificacion.html`, HARD):** no se ratifica sin caballeriza (botón disabled + guard en `ratificar()` + `data-caballeriza` en el row).
  - **E2 (`inscripciones.html`, SOFT):** `confirm()` de advertencia al inscribir sin caballeriza (deja continuar).
  - **E1 NEUTRALIZADA en main** (`7af005c`): el hard block se removió para que Fede pueda ratificar sin caballeriza obligatoria mientras falta el backfill. Reactivación = backfill `caballeriza_id` en SPC activos + Fede al tanto del cambio de workflow + `git revert 7af005c`. Ver ISSUE-027.

#### Pendiente / bloqueante conocido
- ~~`inscripciones.propietario_id` está NULL (0/87)~~ **Mitigado:** derivación aplicada (ver arriba) + Fix D vivo en main. Estado actual **10/95** con propietario; el resto sin `caballeriza_id` histórico (85 inscripciones); `spc_propietarios` sigue vacía. Captura hacia adelante cubierta por triggers + Fix D (`spcs.html`). Backfill de las históricas = Fase A (bloqueada por dato/Fede). Ver GOTCHA #47 / ISSUE-001 / ISSUE-026.

---

## 2026-05/06 — Vacante (VAC inline) → main

> **En main (SHAs verificados):** `feat/vacante-vac-inline` mergeado en **`7ee49c5`** (la versión vigente: VAC se escribe en el input). Reemplazó a `feat/vacante-manual` (checkbox), mergeado antes en **`ed069d0`**. Ambos quedaron en la historia de main; vigente = el inline.

### `feat/vacante-vac-inline` — vacante escribiendo "VAC" en el input (pedido de Fede)

Reemplaza el checkbox de `feat/vacante-manual` por un único campo "monto-o-VAC". El dato de vacante es **solo informativo** (lo consumen el Stud Book y la página); **no entra en liquidación** (eso va por bolsa de premios + bonos), así que un campo único alcanza.

#### Cambiado

- **Vacante se marca escribiendo `VAC`** (case-insensitive, se normaliza a mayúsculas) en el mismo input del monto/dividendo. `VAC` → `vacante=true`, `div_orig=null`; número → `vacante=false` + `div_orig`; vacío → `false`/`null`. Toda la lógica vive en `syncDivInputsToPending` (embudo único input→pending), **por slot**.
- **Genérico para todos los tipos con input editable**: posicionales (GAN/SEG/TER), directas (EX/IM/TR/CUAT) y **combinadas** (X2/X2P/X3/X4/X5/CAD). Como no liquida, incluir combinadas no tiene riesgo y queda uniforme.
- **Se eliminó el checkbox** y `onVacanteChk`/`markVacante`/`toggleVacante`/`VACANTE_MULTISLOT`. El input es la única vía.
- **Display alineado**: edición y read-only muestran `VAC`. El input vacante queda editable y estilado (color, no `disabled`).
- **F8 (opción A) sigue sin pisar vacante**: ahora `f8Dividendos` llama `syncDivInputsToPending()` al entrar para capturar el `VAC` tipeado (que ya no tiene onChange) antes de mergear; una fila vacante fuerza `div_orig=null`.
- **F10 purga filas sin info**: una fila creada por `VAC` y luego vaciada (`vacante=false`, `div_orig=null`, sin pozo/vales/div_inc/composicion) no se persiste.

#### Tests / docs

- `tests/probe_vacante_vac.mjs` (reemplaza `probe_vacante_manual.mjs`, borrado): 6 checks — `VAC`→true/null, número→false+div, `VAC` en combinada X2, y F8 no pisa el `VAC` tipeado (fila preexistente + create-path). Snapshot+restore idempotente.
- GOTCHAS #41/#42, `tests/README.md` actualizados.

#### Sin cambios de schema

- `vacante` y `div_orig` ya existían. No hay migración.

---

### `feat/vacante-manual` — vacante 100% manual por checkbox (reemplazado por VAC inline)

#### Cambiado

- **Vacante ahora es 100% manual** en el panel de dividendos de `resultados.html`. Se eliminó el auto-cálculo (`applyAutoVacante()` y el mapa de umbrales de finishers `VACANTE_REQUIRED`). Marcar no corrió ya **no** auto-marca vacante.
- **Checkbox por apuesta**: cada tipo posicional (GAN/SEG/TER, en el header de columna) y directo (EX/IM/TR/CUAT, por fila) tiene un checkbox de vacante. Tildado → `vacante=true` e input(s) read-only; destildado → `vacante=false` y editable. Es la única vía (reusa `markVacante`/`toggleVacante` vía `onVacanteChk`).
- **F8 ya no pisa vacante** (opción A): `f8Dividendos` mergea ambos lados — trae dividendos/pozos desde DB pero conserva el `vacante` en memoria, incluidas las filas memory-only tildadas y todavía sin guardar.

#### Pendiente

- **Combinadas** (X2/X2P/X3/X4/X5/CAD) siguen sin UI de vacante — cambio aparte cuando Fede confirme el flujo con el tote.

#### Tests / docs

- `tests/probe_vacante_manual.mjs` (reemplaza `probe_vacante_hibrido.mjs`, borrado): 7 checks — tilde persiste tras F10, destilde, y F8 no pisa el tilde (fila preexistente + create-path memory-only). Snapshot+restore idempotente.
- GOTCHAS #41/#42, `tests/README.md` actualizados.

#### Sin cambios de schema

- `resultado_apuestas.vacante` ya existía. No hay migración.

---

## 2026-05-28 — `feat/no-corrio-v3` → main

### Agregado

- **"No corrió" en `resultados.html`** (UI v3 — botón + deducción automática): botón "NC" por cada caballo ratificado en el marcador. Los caballos marcados se excluyen del orden de llegada y se persisten con `{posicion: null, no_largo: true}` en `resultado_posiciones`. El mandil queda conservado (hueco visible en el marcador).
- **Validación de exclusividad**: un caballo no puede tener posición en el marcador Y estar marcado como "no corrió" al mismo tiempo. La UI bloquea el guardado con toast de error.
- **Deducción automática**: si al guardar (F10) hay caballos ratificados sin resultado ni marca "no corrió", la UI ofrece marcarlos automáticamente antes de proceder (confirm dialog).
- **Restauración al recargar**: los `no_largo=true` existentes en DB se restauran en la UI al cargar resultados de una carrera ya guardada.
- **Probe de regresión** `tests/probe_no_largo.mjs`: verifica el flujo end-to-end contra prod.

### Schema (ejecutado en prod — 28/05/2026)

- `ALTER TABLE resultado_posiciones ALTER COLUMN posicion DROP NOT NULL` — `posicion` ahora nullable (necesario para `posicion=NULL` en no corrió).
- `ALTER TABLE resultado_posiciones ADD COLUMN IF NOT EXISTS no_largo BOOLEAN NOT NULL DEFAULT false` — flag de no corrió.
- **RPC `aplicar_resultado`** (`fix_aplicar_resultado_no_largo`): INSERT de `resultado_posiciones` extendido para incluir la columna `no_largo` con `COALESCE((x->>'no_largo')::boolean, false)`.

### Decisiones de diseño confirmadas con Fede

- **Modelo**: flag booleano sin motivo. `estado = 'ratificado'` queda intacto. Mandil conservado (hueco). Prerequisito desbloqueado para Bloque C (montas perdidas) en `liquidaciones.html`.
- **UI elegida**: v3 — botón por caballo en el marcador + deducción automática al guardar.

### Archivos nuevos

- `migrations/add_no_largo_column.sql`, `migrations/update_aplicar_resultado_no_largo.sql`, `migrations/aplicar_resultado_rollback.sql`
- `mockup-no-corrio-v1-checkbox-por-caballo.html`, `mockup-no-corrio-v2-marcador-por-caballo.html`, `mockup-no-corrio-v2.html`, `mockup-no-corrio-v3-boton-deduccion.html`
- `mockups/no-corrio/v1.png`, `mockups/no-corrio/v2.png`, `mockups/no-corrio/v3.png`
- `tests/probe_no_largo.mjs`

### Archivos modificados

- `resultados.html` — UI "no corrió", botón NC por caballo, deducción automática, payload `p_posiciones` con `no_largo`

---

## 2026-05-27 — `feature/apuestas-tabla-relacional` → main

### Agregado
- **Tabla `carrera_apuestas`** (relacional): reemplaza `carreras.apuestas_habilitadas JSONB`. Columnas: `id`, `carrera_id`, `tipo` VARCHAR(10), `precio` NUMERIC(10,2), `nombre` TEXT, `aseg` NUMERIC, `incr` NUMERIC, `orden` SMALLINT. Tipos válidos: `GAN`, `SEG`, `TER`, `EX`, `IM`, `TR`, `CUAT`, `X2`, `X2P`, `X3`, `X4`, `X5`, `CAD`. `TE` removido.
- **Columna `carreras.apuestas_notas`** TEXT NULL — texto libre para notas de apuestas en el programa oficial.
- **UNIQUE `(resultado_id, tipo, orden)`** en `resultado_apuestas` — permite multi-slot para SEG (2) y TER (3).
- **Columna `inscripciones.peso_balanza`** NUMERIC(5,2) NULL — peso registrado en balanza el día de la carrera (300–600 kg, peso del caballo no del jockey).
- **Modal "Apuestas" en `programa.html`**: checkbox + precio + nombre + asegurado/incremento por carrera. Guardado bulk con `Promise.all`. Grupos: Posicionales / Apuestas directas / Apuestas combinadas.
- **Modal "Div. habilitadas" en `resultados.html`**: carga de dividendos por tipo habilitado. Posicionales en 3 columnas con chapa SBARG + input de dinero. Directas y combinadas en lista vertical.
- **Vista Reducida** en `resultados.html`: posicionales GAN/SEG/TER en 3 columnas, estilo papel, read-only. Chapa SBARG con color + monto en cápsula.
- **Vista Detallada** en `resultados.html`: posicionales + separador + Apuestas directas (con composición auto-computada via chips SBARG) + Apuestas combinadas.
- **`renumerar-chapas.js`**: helper `renumerarChapas(inscripciones)` — filtra `estado === 'ratificado'`, ordena por `numero_partidor` ASC, devuelve `{ id → 1..N }`.
- **`formatARS` / `parseARS` / `bindARSInput`** en `resultados.html`: formato argentino (punto miles, coma decimal, 2 decimales) para todos los inputs y displays de dinero.
- **`formatApuestasText()`** en `programa-oficial.html` y `programa-oficial-color.html`: agrupación inteligente de apuestas por precio para el texto del programa impreso.
- **Botón "Pesos balanza"** en `resultados.html`: modal que muestra inscripciones ratificadas, permite cargar `peso_balanza` (min 300, max 600 kg).

### Cambiado
- **Terminología visible al usuario**: "Combinatoriales" → "Apuestas directas", "Multi-carrera" → "Apuestas combinadas". Códigos internos (`EX`, `X2`, etc.) sin cambio.
- **Vista de dividendos** (`resultados.html`): eliminada grilla tabla editable (columnas APUESTA/VAL.APU/COMPOSICIÓN/DIV.ORIG/DIV.INC, nav bar, modal Agregar/Cambiar/Eliminar). Reemplazada por `renderDivHTML()` — mismo código sirve para provisional y oficial.
- **`renderOficial()`**: ahora usa `renderDivHTML()` con detalle completo en lugar de la tabla antigua.
- **Cosméticos `resultados.html`**: "Turno N" → "Carrera N", subtítulo solo distancia, labels M.(F) y (MANDIL) removidos, "Sport" → "Div a GAN".
- **Renumeración chapas**: filtro corregido de `!includes(['forfait','mal_inscrito'])` (negativo, perdía 'anulada') a `=== 'ratificado'` (positivo estricto). Afectaba 7 call sites en `resultados.html`, `programa-oficial.html`, `programa-oficial-color.html`.
- **`programa-oficial.html`** y **`programa-oficial-color.html`**: `renderCarrera()` ahora filtra `ins.filter(i => i.estado === 'ratificado')` antes de mapear chapas.

### Eliminado
- **`carreras.apuestas_habilitadas`** JSONB — dropeada, reemplazada por tabla relacional.
- **`modal-apuesta`** (Agregar/Cambiar apuesta en resultados.html) — eliminado junto con `openModal()`, `closeModal()`, `confirmApuesta()`, `deleteApuesta()`.
- **Nav bar** (« ‹ N/M › ») y `selectRow()`, `navFirst/Last/Prev/Next()`.
- **Tipo `TE` (Tómbola Exacta)** — removido del set válido de tipos de apuesta.

### Corregido
- **7 bugs de renumeración de chapas** en 3 archivos: `autoComp()`, `openDivModal()`, `activeInsc` main render, `openPesoBalanza()`, `savePesoBalanza()`, `renderCarrera()` en programa-oficial (x2).

### Archivos nuevos
- `renumerar-chapas.js` — helper centralizado de renumeración.

### Archivos modificados
- `resultados.html`, `programa.html`, `programa-oficial.html`, `programa-oficial-color.html`

---

## 2026-05-23 — `cleanup-fede` (feedback del secretario de carreras)

### Revertido / Eliminado
- **`estado_pista = 'normal'`** revertido del CHECK y del `<select>` de la UI. El hipódromo tiene precedente legal que establece que los únicos valores válidos son `seca`, `humeda`, `fangosa` y `pesada`. El selector arranca ahora con opción vacía `—` para forzar elección consciente.
- **`resultados.tiempo_clima`** eliminado: columna dropeada de la tabla, campo removido de la UI y del payload del RPC. El clima no va en la pantalla de resultados.
- **Display de jockey 1° y 2°** eliminado del panel central de resultados. El dato sigue viviendo en inscripciones y performances; se removió solo de esta pantalla porque ya está disponible en el programa.

---

## 2026-05-23 — `carga-resultados-v2`

### Agregado
- **Rediseño carga de resultados** (`resultados.html`): layout legacy SGH con marcador de posiciones 1°–20° (colores de fotofinish internacionales), grilla densa de dividendos, selector de condiciones de carrera (clima, estado pista, tiempo ganador, incidentes), Vista Reducida / Vista Detallada. [Ver SCHEMA.md](SCHEMA.md)
- **RPC atómico `aplicar_resultado`**: reemplaza posiciones y dividendos en una sola transacción con optimistic locking (`FOR UPDATE` sobre `updated_at`). Elimina las escrituras directas a las tablas desde el cliente.
- **Optimistic locking concurrente**: el servidor detecta escrituras en conflicto y devuelve `CONCURRENT_MODIFICATION`; la UI muestra el toast "Otro operador modificó este resultado. Recargá antes de guardar."
- **Schema changes** (ver [SCHEMA.md](SCHEMA.md)):
  - `resultado_apuestas` (tabla nueva): columnas `tipo`, `val_apu`, `composicion`, `pozo`, `vales`, `div_orig`, `div_inc`, `vacante`, `orden`, FK a `resultados`. Detalle en SCHEMA.md.
  - `resultados.redistribucion_legs` (`jsonb`, default `'{}'`)
  - `resultados.updated_at` (`timestamptz`) con trigger `BEFORE UPDATE` (`set_updated_at`)
  - Índice `idx_resultados_updated_at (id, updated_at)`
  - ~~`resultados.tiempo_clima`~~ — revertido, ver arriba
  - ~~CHECK `estado_pista` ampliado con `'normal'`~~ — revertido, ver arriba

### Corregido
- **Bug 3b**: borrar todas las filas de dividendos, aplicar (F10) y recargar mostraba las 20 filas originales en vez de una grilla vacía. La RPC ahora ejecuta el DELETE incondicionalmente aunque `p_apuestas` sea un array vacío.

### Cambiado
- Escritura de dividendos centralizada en la RPC `aplicar_resultado` en lugar de inserts directos desde el cliente.
- Tecla F10 llama `aplicar_resultado('carrera_id', 'provisional')`; F8 recarga desde DB; F9 descarta cambios.

### Pendiente de validación
- Interpretación de `resultados.redistribucion_legs` (selectores "Gde / al 3° / al 4° / al 5° / al 6°" como umbral de redistribución por pata en apuestas combinadas X2/X3/X4/X5) sujeta a confirmación del secretario de carreras. Columna modelada como `jsonb` para permitir cambio de semántica sin migración de schema.
