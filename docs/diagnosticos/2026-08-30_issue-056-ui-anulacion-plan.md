# ISSUE-056 — plan de la UI de anulación (opción A). NADA APLICADO

- **Fecha**: 2026-08-30
- **Estado**: **plan solo**. No se tocó `liquidaciones.html`, no hay branch de código, no hay
  diff. El gate es tuyo.
- **`main`**: `80839ff` — RPC `anular_recibo` mergeado en `34f6e83`, vivo en prod
  (`20260830025830_anular_recibo_v1`).
- **Alcance**: opción A de §3.2 del plan anterior — anular desde el recibo recién emitido.
  **Fuera**: el RPC (no se toca), el buscador de recibos / vista de historial, la policy
  `recibos_delete`.
- **Antecedentes**: `docs/diagnosticos/2026-08-30_anular-recibo-plan.md` §3.2 ·
  `docs/diagnosticos/2026-08-30_issue-056-merge.md`

## Guards

```
$ pwd
/home/clio/dev/SGH
```

```sql
SELECT (SELECT count(*) FROM spcs) AS spcs_count, current_database() AS db;
```
```json
[{"spcs_count":181,"db":"postgres"}]
```

ref del proyecto: `unlhcuanfrtpatoipwve`. Los tres guards dan.

---

## 0 · Corrección al plan anterior: el lugar que indiqué no existe

El brief repite, correctamente, lo que yo mismo escribí en §3.2:

> **Dónde**: en el bloque que se muestra tras `cobEmitir` (`liquidaciones.html:1162`), al lado de
> "Imprimir".

**Eso es falso y lo escribí yo.** No hay bloque post-emisión y no hay botón "Imprimir". Verificado
en el archivo, no de memoria:

```
$ grep -n "recibo-print" liquidaciones.html
111:    .recibo-print { display: none; }
117:      .recibo-print { display: block; }
175:<div class="recibo-print" id="recibo-print"></div>
1258:  document.getElementById('recibo-print').innerHTML = copia('ORIGINAL') + copia('DUPLICADO');
```

`#recibo-print` es un contenedor **sólo para impresión**: `display:none` en pantalla, `display:block`
únicamente dentro de `@media print`. Y el final de `imprimirReciboCobro` es:

```js
document.getElementById('recibo-print').innerHTML = copia('ORIGINAL') + copia('DUPLICADO');
await precargarLogo(cl?.logo_url);
window.print();
```

O sea: se emite (`liquidaciones.html:1159-1163`), se arma el HTML del recibo en un div invisible, se
dispara `window.print()` y **el operador vuelve a la pantalla de Pagos sin ninguna superficie que
represente el recibo recién emitido**. No hay dónde colgar el botón. Tampoco hay forma de reimprimir
si el diálogo de impresión se cancela.

Esto no invalida la opción A —el `recibo` sigue estando en memoria, que es lo que A necesita— pero
**mueve trabajo del "agregar un botón" a "crear la superficie donde vive el botón"**. Va en §1, y
como cambia el tamaño de la entrega, es lo primero que necesitás decidir.

---

## 1 · Dónde va el botón — tres opciones, hay que elegir

| | Qué es | Costo | Efecto lateral |
|---|---|---|---|
| **A1** (recomendada) | Panel nuevo `#cob-recibo-emitido` dentro de `#cob-detalle`, renderizado tras emitir: nº, beneficiario, importe, hora, y dos botones — **Imprimir de nuevo** y **Anular recibo** | Medio | Tapa de paso el agujero de "cancelé el print y perdí el recibo" |
| **A2** | Modal `modal-recibo-emitido` que se abre después de imprimir | Medio | `window.print()` es bloqueante en la mayoría de los browsers: el modal aparece **después** de cerrar el diálogo. Secuencia confusa y difícil de probar sin browser |
| **A3** | Sin superficie: guardar el último recibo en un `let` de módulo y agregar el botón al pie de `#cob-detalle`, al lado de "Emitir recibo", visible sólo mientras haya un recibo emitido en la sesión | Chico | El botón queda lejos, visualmente, del recibo al que se refiere. Y "el último recibo" es un estado invisible: si el operador cambia de beneficiario el botón sigue ahí, apuntando a otra cosa |

**Recomiendo A1.** A3 es la más barata y la más peligrosa: un botón rojo que dice "Anular recibo"
sin decir **cuál** es exactamente el modo de falla que este RPC existe para arreglar. A2 pelea con
`window.print()`.

Bosquejo de A1 (no es código a aplicar, es la forma):

```
┌ Recibo N° 33 emitido ─────────────────────────────────────────┐
│ LORENA SOLEDAD VARELA · 6 líneas · $62.700 · 03:41            │
│                                                               │
│ [ 🖨 Imprimir de nuevo ]              [ Anular recibo ]        │
└───────────────────────────────────────────────────────────────┘
```

- Va **arriba** de la tabla de líneas dentro de `#cob-detalle`, no abajo: es lo último que pasó.
- "Anular recibo" con la paleta de `--danger`, que ya existe (`liquidaciones.html:17`), reusando
  `.btn-delete` (`liquidaciones.html:70`) que ya es exactamente ese rojo.
- Separado de "Imprimir de nuevo" por `margin-left:auto` (extremos opuestos de la fila), no por un
  `gap`. Pedido explícito tuyo: que no se apriete de más.
- El panel **no ensucia la impresión**: `@media print` ya hace `.content { display: none }`
  (`liquidaciones.html:118`) y el panel vive adentro de `.content`.
- Se limpia al abrir otro beneficiario (`cobrosDetalle` reescribe `#cob-detalle` entero, así que
  esto sale gratis).

---

## 2 · Qué pide antes de anular

Dos pasos, en este orden: **motivo primero, confirmación después**. Al revés, el operador confirma
un texto y recién ahí le piden justificar — y el motivo termina siendo "asdf" para pasar el trámite.

### 2.1 Motivo — modal, no `prompt()`

Modal `modal-anular` calcado del de cobrador (`liquidaciones.html:397`), con un `<textarea>` y el
resumen del recibo arriba. `prompt()` no sirve: no se puede estilar, no entra texto largo cómodo, y
—lo que importa acá— **no se puede probar sin browser**; el harness de probes stubea `document`, no
`window.prompt`.

Validación cliente: `if (!motivo.trim()) { toast('El motivo es obligatorio','error'); return; }`
antes de llamar al RPC. **Es cortesía, no un guard**: el RPC valida igual
(`RAISE EXCEPTION 'anular_recibo: el motivo de anulación es obligatorio'`). GOTCHA #80 — si no está
escrito en la función, no existe.

### 2.2 Confirmación — tiene que decir qué se pierde

Texto propuesto, armado con el `recibo` en memoria:

```
¿Anular el recibo #33 de $62.700 a LORENA SOLEDAD VARELA?

Las 6 líneas vuelven a quedar pendientes de cobro.
El número 33 no se reutiliza: queda como recibo anulado.
```

- `#33` ← `recibo.numero_recibo`
- `$62.700` ← `fmt(recibo.neto_a_cobrar)` — **`fmt`, nunca `toLocaleString`** (convención de dinero
  del proyecto: el locale por defecto del browser da formato en-US).
- `LORENA SOLEDAD VARELA` ← `cobBenef.nombre`
- `6` ← `cobEmitirIds.length`

Va en un `confirm()`, pero **`confirm()` con este texto**, no pelado. Si preferís el segundo paso
también como modal, es media hora más y lo hago; con `confirm()` el probe puede stubearlo y
assertear el string, que es lo que pediste verificar.

---

## 3 · Después de anular

```js
const { data, error } = await sb.rpc('anular_recibo', { p_recibo_id: recibo.id, p_motivo: motivo });
if (error) { toast(error.message,'error'); return; }
```

Tres cosas, en orden:

1. **Contar las que volvieron a retenido.** El RPC devuelve la fila completa de `recibos`, con
   `lineas_anuladas` (jsonb con los `liquidacion_detalle.id`). Con eso:

   ```js
   const ids = data.lineas_anuladas || [];
   const { data: ret } = await sb.from('liquidacion_detalle')
     .select('id').in('id', ids).eq('estado_linea','retenido');
   ```

2. **Decirle al operador qué pasó**, incluida la consecuencia del `CASE` que Valeria no tiene por
   qué deducir:

   - sin retenidas: `Recibo #33 anulado — 6 línea(s) vuelven a quedar pendientes.`
   - con retenidas: `Recibo #33 anulado — 6 línea(s) vuelven a pendientes, 2 de ellas quedaron
     RETENIDAS por doping y hay que habilitarlas de nuevo para poder pagarlas.`

   El segundo mensaje va como toast **persistente o de duración larga**, no como el toast de 3
   segundos: es una instrucción de trabajo, no un acuse. (Hay que mirar `toast()` en
   `liquidaciones.html:444` para ver si admite duración; si no, se agrega el parámetro — cambio de
   una línea.)

3. **Refrescar**: `cobrosDetalle(cobBenef.tipo, cobBenef.id)` y no `cobrosBuscar()` a secas. El
   detalle es el que vuelve a listar las líneas —pagables arriba, retenidas en su propia tabla con
   el botón Habilitar— y es donde el operador está parado. `cobrosBuscar()` refresca el listado de
   beneficiarios, que también hay que actualizar porque cambia el total adeudado: van los dos, en
   ese orden.
4. **Ocultar el panel del recibo anulado**, para que no quede un botón "Anular" apuntando a un
   recibo ya anulado. El RPC es idempotente (`ya fue anulado ... no se anula dos veces`), así que el
   peor caso es un error prolijo, pero mostrarlo es feo.

---

## 4 · La ventana de 5 días — cómo sé si es super_admin

**No hace falta inventar nada: el dato ya está en el archivo.** `initAuth`
(`liquidaciones.html:437-438`) guarda el rol en el global `currentUser`:

```js
let sb, CLUB_ID, currentUser;
...
const { data: usr } = await sb.from('usuarios').select('club_id,nombre_completo,rol')...
currentUser = { ...session.user, nombre_completo: usr.nombre_completo, rol: usr.rol };
```

Así que `currentUser.rol === 'super_admin'`. Es el mismo mecanismo que ya usa el archivo para
decidir el `CLUB_ID` con el club-switcher. Nada nuevo.

La regla de visibilidad, como **función pura y aparte** —para que el probe pueda llamarla con un
`emitido_at` fabricado sin tener que emitir un recibo viejo de verdad—:

```js
// Espejo en el front del guard 2 de anular_recibo. NO es un guard: el RPC valida igual (GOTCHA #80).
// Sólo evita ofrecer un botón que va a fallar.
function puedeAnularUI(recibo, rol){
  if (rol === 'super_admin') return true;
  if (!recibo?.emitido_at) return false;
  return (Date.now() - Date.parse(recibo.emitido_at)) < 5 * 24 * 60 * 60 * 1000;
}
```

Dos cosas que quiero dejar dichas:

- **En la opción A este guard casi nunca se dispara**: el recibo tiene segundos de vida. Existe por
  simetría con el RPC y para el día que exista el buscador de recibos (opción B), donde sí va a
  discriminar. Lo pediste explícito en el probe y por eso va como función extraíble: si no, sería
  imposible de testear sin browser.
- **El guard del RPC usa `now()` del servidor; el de la UI usa el reloj del cliente.** Pueden
  discrepar. Si la máquina de la ventanilla tiene la hora corrida, la UI puede mostrar el botón y el
  RPC rechazar (queda un `toast` con el mensaje del RPC, que es explícito y nombra la fecha de
  emisión) o esconderlo de más. Es aceptable —la UI no es la autoridad—, pero conviene saberlo.

---

## 5 · El papel ya impreso — DECISIÓN DE PRODUCTO, no la resuelvo

El problema es real y no lo arregla ningún guard: Valeria imprime, el papel sale, **el recibo
existe físicamente**; después anula y ahora hay un papel circulando que el sistema declara sin
valor. Su propia regla —"recibo impreso = pago hecho"— dice que ese papel es el pago. Y con el
diseño de A el orden es siempre ese: **se imprime antes de que exista la posibilidad de anular**,
porque la emisión dispara `window.print()` sola.

Tres posturas, de menos a más intervención:

| | Qué hace la UI | A favor | En contra |
|---|---|---|---|
| **P1. No se mete** | Anula y listo. El papel es problema del circuito administrativo, no del software | No inventa procedimiento; el sistema no puede saber si realmente se imprimió (el operador pudo cancelar el diálogo) ni si el papel se entregó | Deja sola a Valeria justo en el momento delicado. Un papel válido a la vista y un sistema que dice que no, sin ninguna señal |
| **P2. Lo menciona en la confirmación** | Se agrega una línea al texto de §2.2: *"Si ya imprimiste el recibo, rompé el impreso: queda anulado."* | Barato, es sólo texto. Aparece exactamente cuando corresponde. No obliga a nada, informa | Puede leerse como instrucción del software sobre un procedimiento que no es suyo. Si Dolores tiene otra regla (archivar el anulado en vez de romperlo), el texto la contradice |
| **P3. Lo convierte en paso** | Checkbox obligatorio *"Confirmo que el impreso fue destruido"* antes de habilitar el botón | Deja rastro de la intención | Es una promesa no verificable con cara de control. Y agrega fricción justo cuando hay cola en la ventanilla |

**Mi recomendación es P2**, con una condición: que la frase la escriba Fede o Valeria, no yo. El
software puede recordar que el papel quedó sin valor; **cuál es el procedimiento con ese papel
—romperlo, archivarlo, adjuntarlo al anulado— es de ellos**, y si lo invento queda escrito en la
pantalla como si fuera política del hipódromo.

Descarto P3 por mi cuenta salvo que insistas: un checkbox que afirma un hecho físico que el sistema
no puede verificar es teatro de control, y en la ventanilla con gente esperando se tilda sin leer.

**Sub-pregunta que sale de lo mismo y también es tuya**: ¿el recibo anulado debería poder
reimprimirse con un sello **ANULADO** cruzado? Serviría para reemplazar el papel que circula por uno
que se explica solo. No entra en esta entrega (necesita tocar `imprimirReciboCobro`, que está fuera
de alcance), pero si la respuesta es sí conviene saberlo ahora, porque cambia si el panel de §1
sobrevive a la anulación o desaparece.

---

## 6 · Probe — `tests/probe_anular_recibo_ui.mjs`

Patrón vigente: código real extraído del HTML, sin browser, contra la base de prod. Archivo nuevo,
no se toca `probe_anular_recibo.mjs` (que prueba el RPC y ya está en 29/29).

**Qué se extrae** (con `extractFn`, por ancla y balance de llaves — mismo helper que usan
`probe_anular_recibo.mjs:56` y el resto del set):

```
function puedeAnularUI(recibo, rol)
function textoConfirmAnular(recibo, benef, nLineas)
async function cobrosAnularConfirmar()
async function cobrosDetalle(tipo, id)     // para verificar que las líneas reaparecen
```

Que las dos primeras sean funciones **puras y con nombre** no es un detalle de estilo: es lo que
hace testeable sin browser lo que pediste probar. Si el texto de confirmación se arma inline dentro
del handler, el probe no puede verlo.

**Stubs**: `document` con `mkDocument` (ya existe en el probe del RPC), `confirm` devolviendo
`true`/`false` según el caso, `toast` capturando los mensajes en un array, y el cliente Supabase
real con `SUPABASE_SECRET_KEY`.

**Fixtures**: liquidación + líneas propias sobre un beneficiario real, una de ellas con
`fecha_liberacion` futura para el caso retenido. Emisión con `emitir_recibo` real. **Contra el club
B (Mi Club Hípico)**, salvo el caso que necesite Dolores. `snapshotLineas` / `restaurarLineas` /
`diffLineas` en el `finally`, más el snapshot y restore de `club_secuencias` de los **dos** clubes —
la lección de la semana (`2026-08-30_anular-recibo-estado-post-corte.md` §5).

**Asserts pedidos**:

| # | Assert | Cómo |
|---|---|---|
| U1 | El botón existe y llama a `anular_recibo` | El HTML del panel de §1 contiene `cobrosAnular` y el handler contiene `rpc('anular_recibo'` |
| U2 | Motivo vacío se rechaza **antes** del RPC | `cobrosAnularConfirmar()` con el textarea en `''`, `'   '` y sólo saltos de línea → no hay recibo anulado en la base y el toast dice que el motivo es obligatorio |
| U3 | La confirmación incluye número e importe | `textoConfirmAnular(...)` contiene `#33`, el importe formateado con `fmt` y el nombre del beneficiario |
| U4 | Fuera de los 5 días y sin ser super_admin, el botón no se muestra | `puedeAnularUI({emitido_at: hace 6 días}, 'secretario_carreras')` → `false`; `(..., 'super_admin')` → `true`; `({emitido_at: ahora}, 'secretario_carreras')` → `true` |
| U5 | Tras anular, el buscador vuelve a listar las líneas | Correr `cobrosDetalle` después de anular y verificar que los ids de `lineas_anuladas` aparecen otra vez — las impagas en `cobLineas`, la de `fecha_liberacion` futura en la tabla de retenidas |
| U6 | El mensaje avisa de las retenidas | El toast tras anular menciona la cantidad retenida cuando la hay, y no la menciona cuando no |
| R1-R3 | Restore por ESTADO | `diffLineas` limpio + 0 restauraciones de emergencia + `club_secuencias` de los dos clubes donde estaba |

### Mutation testing — un mutante por guard de UI

Cada mutante se aplica sobre una **copia** del HTML en el scratchpad (`LIQ_HTML` ya es una env var
del harness), nunca sobre el archivo del repo:

| Mutante | Qué se neutraliza | Assert que tiene que morir |
|---|---|---|
| M1 | Sacar el `if (!motivo.trim())` del handler | U2 |
| M2 | `puedeAnularUI` → `return true` siempre | U4 |
| M3 | Sacar `rol === 'super_admin'` de `puedeAnularUI` | U4 (el caso super_admin) |
| M4 | Sacar `recibo.numero_recibo` del texto de confirmación | U3 |
| M5 | Sacar el importe del texto de confirmación | U3 |
| M6 | Sacar el refresco (`cobrosDetalle`) del final del handler | U5 |
| M7 | Sacar el conteo de retenidas / el aviso | U6 |

Un mutante que no mata ningún assert significa que el assert correspondiente no prueba lo que dice
probar. Se reporta, no se tapa.

---

## 7 · Fuera de alcance (confirmado, no se toca)

- **El RPC `anular_recibo`.** Ni una línea.
- **Buscador de recibos / vista de historial** (opción B).
- **La policy `recibos_delete`** — va en migración aparte, ISSUE-065.
- **Reimpresión del anulado con sello** — depende de la respuesta a §5.
- `imprimirReciboCobro`, salvo el mínimo necesario para que "Imprimir de nuevo" del panel A1 la
  reuse tal cual está (llamarla otra vez con el mismo `recibo`, sin modificarla).

---

## 8 · Lo que necesito que decidas antes de escribir código

1. **§1 — dónde vive el botón**: A1 (panel nuevo, recomendada), A2 (modal) o A3 (mínima). Cambia el
   tamaño de la entrega. Esto es consecuencia de mi error de §0: el lugar que había indicado no
   existe.
2. **§5 — el papel impreso**: P1 (no meterse), P2 (mencionarlo en la confirmación, recomendada) o
   P3 (checkbox). Y si va P2, **quién escribe la frase** — mi recomendación es que salga de Fede o
   Valeria, no de mí.
3. **§5 sub-pregunta**: ¿reimprimir el anulado con sello ANULADO, más adelante? Cambia si el panel
   sobrevive a la anulación.
4. **§2.2 — ¿`confirm()` con texto largo, o segundo modal?** Con `confirm()` el probe puede
   assertear el string; con modal queda más prolijo y cuesta un poco más.

Con eso contestado sale el diff a branch, pusheado y sin mergear, como pediste.

---

## 9 · Riesgos anotados

- **El reloj del cliente** puede discrepar del `now()` del servidor en el guard de 5 días (§4). La
  UI no es la autoridad, pero el síntoma —botón visible que falla— existe.
- **`toast()` de 3 segundos** puede no alcanzar para el aviso de líneas retenidas (§3). Si no admite
  duración, hay que agregársela.
- **El probe emite recibos reales** y mueve correlativos. Va con snapshot/restore de
  `club_secuencias` de los dos clubes desde la primera versión, no agregado después.
- ~~**La reunión de prueba 9999 sigue viva en Dolores** y hay que borrarla antes del 20/09
  (`teardown_prueba_resumen_9999.sql`).~~ **CORREGIDO el 2026-08-30: la 9999 NO se borra.** Esa
  decisión se revirtió el 2026-08-29 — es el único sandbox seguro que hay, ya sirvió para verificar
  el camino de recuperación de montas, y en vez de borrarla se la marcó con `reuniones.es_prueba` y
  se la filtró del buscador de Pagos (`docs/diagnosticos/2026-08-29_issue-055-merge.md`). Yo repetí
  acá la instrucción vieja; quedaban 9 lugares más diciendo lo mismo, `CLAUDE.md` incluido, y se
  corrigieron en `10c16d4`.
