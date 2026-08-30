# ISSUE-056 — UI de anulación: entrega en rama, SIN MERGEAR

- **Fecha**: 2026-08-30
- **Rama**: `feat/ui-anular-recibo` = **`5a1319a`** — pusheada, **sin mergear**. `main` sigue en
  `80839ff`.
- **Proyecto**: `unlhcuanfrtpatoipwve`
- **Gate**: tuyo. Nada llegó a `main` ni a producción.
- **Plan aprobado**: `docs/diagnosticos/2026-08-30_issue-056-ui-anulacion-plan.md`

## Guards

```
$ pwd
/home/clio/dev/SGH
```

```sql
SELECT (SELECT count(*) FROM spcs) AS spcs, current_database() AS db;
```
```json
[{"spcs":181,"db":"postgres"}]
```

ref del proyecto: `unlhcuanfrtpatoipwve`. Los tres guards dan.

---

## 1 · Decisiones aplicadas

| # | Decisión | Cómo quedó |
|---|---|---|
| 1 | **A1 — el panel**, aprovechando que tapa el agujero del print cancelado | `#cob-recibo-emitido` con **Imprimir de nuevo** + **Anular recibo** |
| 2 | **P2** con la frase textual, sin bloquear esperando a Fede | *"Si ya imprimiste el recibo, ese impreso queda sin valor."* — última línea del `confirm()`, palabra por palabra. P3 descartado |
| 3 | El panel **sobrevive** a la anulación | Queda `Recibo N° X — ANULADO`, sin el botón. El sello en la reimpresión no se tocó |
| 4 | `confirm()` con el texto largo | Sí, y el probe assertea el string (asserts U3–U3e) |
| — | `toast()` con duración | Agregado. El aviso de retenidas dura **15 s** |
| — | La 9999 **no se borra** | Corregido en 9 lugares. Detalle en §6 |

---

## 2 · Lo que se construyó

### 2.1 El panel — y por qué hubo que crearlo

El plan ya lo había marcado y se confirma acá: **no existía ningún bloque post-emisión ni botón
"Imprimir"**. `imprimirReciboCobro` termina en:

```js
document.getElementById('recibo-print').innerHTML = copia('ORIGINAL') + copia('DUPLICADO');
await precargarLogo(cl?.logo_url);
window.print();
```

y `#recibo-print` es `display:none` fuera de `@media print`. Así que la entrega empezó por crear la
superficie, no por agregar un botón.

El panel va **fuera** de `#cob-detalle`, entre `#cob-beneficiarios` y el detalle. La razón es
concreta: `cobrosBuscar()` hace `document.getElementById('cob-detalle').innerHTML = ''` en cada
búsqueda, y justo después de emitir se llama a `cobrosBuscar()`. Adentro de `#cob-detalle` el panel
moriría al nacer.

Separación entre botones: `gap:28px` en el contenedor de acciones, no un `gap` chico. Pedido
explícito — que no se apriete de más.

### 2.2 "Imprimir de nuevo"

Es la parte que no estaba pedida como fix pero tapa un agujero real: hoy, si el operador cancela el
diálogo de impresión, **el recibo ya está emitido y no hay forma de volver a sacarlo por pantalla**.
Reusa `imprimirReciboCobro` tal cual, sin tocarla, y repone `cobBenef` desde el panel porque esa
función lo usa para el "A nombre de" del encabezado.

### 2.3 Motivo y confirmación

Motivo **primero**, confirmación **después**. Al revés, el operador confirma y recién ahí le piden
justificar, y el motivo termina siendo cualquier cosa para pasar el trámite.

El texto completo que ve el operador:

```
¿Anular el recibo #33 de $62.700,00 a LORENA SOLEDAD VARELA?

Las 6 línea(s) vuelven a quedar pendientes de cobro.
El número 33 no se reutiliza: queda como recibo anulado.

Si ya imprimiste el recibo, ese impreso queda sin valor.
```

El importe sale de `fmt()` (= `formatMonto`), nunca de `toLocaleString` — convención de dinero del
proyecto. La última línea es tuya, textual, y está comentada en el código como tal para que nadie la
"mejore" después.

### 2.4 Después de anular

```js
await cobrosBuscar();                       // cambia el total adeudado — y vacía #cob-detalle
await cobrosDetalle(benef.tipo, benef.id);  // acá reaparecen las líneas
cobUltimoRecibo = panel; cobrosRenderRecibo();
```

El orden importa y está comentado: `cobrosBuscar()` va primero **porque vacía `#cob-detalle`**.

El aviso de retenidas sale de `lineas_anuladas` (el jsonb que el RPC llena antes de soltar las
líneas) cruzado contra `estado_linea='retenido'`:

> Recibo #2 anulado — 3 línea(s) vuelven a pendientes, 1 de ellas quedó RETENIDA por doping y hay
> que habilitarla de nuevo para poder pagarla.

Con singular y plural resueltos, y **15 s** de duración.

### 2.5 La ventana de 5 días

`currentUser.rol`, que `initAuth` ya guarda (`liquidaciones.html:437-438`). Sin mecanismo nuevo.
`puedeAnularUI` es pura y está aparte para que el probe pueda llamarla con un `emitido_at`
fabricado. **No es un guard**: el RPC valida igual (GOTCHA #80). Usa el reloj del cliente contra el
`now()` del servidor; si discrepan, gana el RPC y el error se muestra como toast.

---

## 3 · Probe — 26/26

```
$ set -a; . ./.env; set +a
$ node tests/probe_anular_recibo_ui.mjs
```

```

── Probe ISSUE-056 · UI de anulación ──
   html=/home/clio/dev/SGH/liquidaciones.html
 ✅ U1) el panel ofrece el botón "Anular recibo" y el handler llama a anular_recibo  → panel_boton=true handler_rpc=true
 ✅ U1b) el panel también ofrece reimprimir (el print cancelado hoy no tiene solución)
 ✅ U3) la confirmación incluye el número de recibo  → ¿Anular el recibo #33 de $62.700,00 a LORENA SOLEDAD VARELA?
 ✅ U3b) la confirmación incluye el importe formateado con fmt (no toLocaleString)  → ¿Anular el recibo #33 de $62.700,00 a LORENA SOLEDAD VARELA?
 ✅ U3c) la confirmación nombra al beneficiario
 ✅ U3d) la confirmación dice qué se pierde: líneas pendientes + número no reutilizable
 ✅ U3e) y avisa por el papel: "Si ya imprimiste el recibo, ese impreso queda sin valor."
 ✅ U4) recibo de hace 6 días + NO super_admin → el botón no se ofrece
 ✅ U4b) el mismo recibo viejo, siendo super_admin → sí se ofrece
 ✅ U4c) recibo de ayer + NO super_admin → se ofrece (dentro de la ventana)
 ✅ U4d) el panel de un recibo viejo NO pinta el botón y explica por qué
 ✅ U2) motivo vacío, sólo espacios y sólo saltos: rechazados ANTES de llegar al RPC  → toasts=[true,true,true] llamadas_al_rpc=0
 ✅ U2b) cancelar la confirmación no anula nada  → estado=emitido
 ✅ A1) el recibo quedó anulado con su motivo  → "anulado"
 ✅ U5) tras anular, las líneas impagas reaparecen en el detalle sin recargar la página  → 2 línea(s) pagables en el detalle
 ✅ U5b) la de fecha_liberacion futura volvió a RETENIDO y por eso NO está entre las pagables  → estado=retenido
 ✅ U5c) y aparece en la tabla de retenidas del detalle, con su botón Habilitar
 ✅ U6) el operador recibe el aviso de que hay líneas retenidas de nuevo  → Recibo #2 anulado — 3 línea(s) vuelven a pendientes, 1 de ellas quedó RETENIDA por doping y hay que habilitarla de nuevo para poder pagarla.
 ✅ U6b) y con duración larga: es una instrucción de trabajo, no un acuse  → ms=15000
 ✅ U7) el panel sobrevive y queda como constancia: "Recibo N° X — ANULADO"
 ✅ U7b) pero ya no ofrece el botón de anular
 ✅ R1) restore por ESTADO: las líneas quedaron como estaban  → sin diferencias
 ✅ R2) y no hubo que restaurar nada a mano  → 0 línea(s)
 ✅ R3) no quedó ningún recibo del probe, en NINGÚN club  → []
 ✅ R4) no quedaron líneas del probe en la base  → []
 ✅ R5) club_secuencias de los dos clubes devuelto a donde estaba  → 0649e9c5: 32→32 · a6da7e40: 1→1

26/26 OK
```

## 4 · Mutation testing — 8/8 mutantes muertos

Cada mutante neutraliza **un** guard de UI sobre una **copia** del HTML en un tmpdir (el archivo del
repo no se toca nunca) y re-corre el probe con `LIQ_HTML` apuntando a la copia.

```
$ node tests/probe_anular_recibo_ui.mjs --mutantes
```

```

═══ MUTATION TESTING · 8 mutantes ═══
(copias en /tmp/mut-anular-ui-U1ZKrj — el repo no se toca)

✅ M1 muere — sacar la validación de motivo vacío del handler  [esperaba matar U2; murieron U2]
✅ M2 muere — puedeAnularUI devuelve true siempre  [esperaba matar U4,U4d; murieron U4,U4d]
✅ M3 muere — puedeAnularUI ignora super_admin  [esperaba matar U4b; murieron U4b]
✅ M4 muere — el texto de confirmación pierde el número de recibo  [esperaba matar U3; murieron U3]
✅ M5 muere — el texto de confirmación pierde el importe  [esperaba matar U3b; murieron U3b]
✅ M6 muere — el handler no refresca el detalle después de anular  [esperaba matar U5; murieron U5]
✅ M7 muere — no se cuentan ni se avisan las líneas que vuelven a retenidas  [esperaba matar U6; murieron U6]
✅ M8 muere — el panel no sobrevive a la anulación  [esperaba matar U7; murieron U7]

✅ TODOS LOS MUTANTES MUEREN — 8 probados

```

### Los dos mutantes que sobrevivieron primero

No los escondo porque son el valor del ejercicio:

- **M1 (motivo vacío) sobrevivía.** El assert U2 verificaba "el recibo sigue emitido + hay un toast
  que dice motivo". Con la validación del cliente neutralizada, **el RPC rechazaba igual**, el
  recibo seguía emitido y el toast también decía "motivo" — o sea, el assert pasaba con el guard
  muerto. Arreglado espiando `sb.rpc` con un `Proxy` y asserteando que la llamada **no sale**
  (`llamadas_al_rpc=0`). Lo que había que observar no era el efecto, era la ausencia de la llamada.
- **M3 y M5 se reportaban vivos por un bug del arnés, no del código.** El matcher usaba
  `❌ ${assert}\b`, y `\b` entre `4` y `b` no existe (ambos son `\w`), así que `❌ U4\b` no matcheaba
  `❌ U4b)`. Los mutantes sí morían; el runner no lo veía. Anclado en el `)` del rótulo.

---

## 5 · Regresión — los otros probes del circuito

`cobrosDetalle` ahora llama a `cobLimpiarPanelRecibo`, y `cobrosConfirmarEmision` a
`cobrosRenderRecibo`. Los harness que extraen esas funciones del HTML tienen que llevarse también
los helpers: **4 probes reventaron con `is not defined`**, que es exactamente lo que el patrón "el
probe corre el archivo cambiado" tiene que hacer notar. Ajustadas las listas de extracción.

| Probe | Antes de la rama | Después |
|---|---|---|
| `probe_anular_recibo` | 29/29 | **29/29** ✅ |
| `probe_aislamiento_club_cobros` | 27/27 | **27/27** ✅ |
| `probe_recibo_pie_cobrador` | 57/57 | **57/57** ✅ |
| `probe_reunion_es_prueba` | 17/17 | **17/17** ✅ |
| `probe_cobros_caballeriza` | OK | **OK** ✅ |
| `probe_pagos_rol_carrera` | **43/46** | **43/46** — igual |

**`probe_pagos_rol_carrera` ya venía en 43/46, no lo rompió esta rama.** Verificado, no razonado:

```
$ git stash && node tests/probe_pagos_rol_carrera.mjs | grep -E "❌|OK$"
  ❌ 1a) cobrosDetalle trae las 3 columnas del rol + carrera_id
  ❌ 1c) hay al menos un beneficiario con más de un rol (si no, el test no prueba nada)
  ❌ 2c) los beneficiarios sin ninguna carrera son incentivo de jockey y quedan rotulados
  43/46 OK
$ git stash pop
```

Ojo: `CLAUDE.md` y `docs/ISSUES.md` lo documentan como **44/46** (ISSUE-063). Está en 43/46, así que
en algún momento se cayó un assert más. **No lo toqué** — está fuera del alcance de esta entrega,
pero conviene saberlo antes del 20/09.

### Un recibo huérfano que dejó la corrida rota, y que se limpió

La primera corrida de `probe_recibo_pie_cobrador` con el HTML ya modificado explotó en fase `f`
(`cobrosRenderRecibo is not defined`) **después** de emitir y **antes** de registrar el id para el
cleanup. Su propio assert R5 lo detectó:

```
❌ R5 no quedó ningún recibo creado durante la corrida, en NINGÚN club  (#33 club=0649e9c5)
✅ R6 club_secuencias de Dolores devuelto a donde estaba  (antes=32 después=32)
```

Recibo `1f1e05c1-…`, N° 33, cobrador `SERENO SIN APODERADO`, **0 líneas asociadas**. Se borró con un
`DELETE` guardado por `NOT EXISTS (SELECT 1 FROM liquidacion_detalle WHERE recibo_id = …)`. R6 sí
había corrido, así que el correlativo no se movió. Que R5 lo haya cazado es el fix de la semana
pasada trabajando.

### Estado de la base al terminar

```sql
SELECT (SELECT count(*) FROM recibos) AS recibos,
       (SELECT count(*) FROM recibos WHERE estado='anulado') AS anulados,
       (SELECT count(*) FROM liquidacion_detalle WHERE recibo_id IS NOT NULL) AS lineas_con_recibo,
       (SELECT count(*) FROM liquidacion_detalle WHERE concepto ILIKE 'TEST ISSUE-056%') AS lineas_probe,
       (SELECT ultimo_numero FROM club_secuencias WHERE club_id='0649e9c5-…' AND tipo='recibo') AS seq_dolores,
       (SELECT ultimo_numero FROM club_secuencias WHERE club_id='a6da7e40-…' AND tipo='recibo') AS seq_club_b,
       (SELECT count(*) FROM spcs) AS spcs;
```
```json
[{"recibos":5,"anulados":0,"lineas_con_recibo":8,"lineas_probe":0,
  "seq_dolores":32,"seq_club_b":1,"spcs":181}]
```

Baseline intacto. `seq_dolores` sigue en **32**, como decidiste.

---

## 6 · Corrección: la reunión 9999 NO se borra

Tenías razón y era peor de lo que parecía: quedaban **9 lugares** con la instrucción vieja,
`CLAUDE.md` incluido —el archivo que se lee en cada sesión—. Corregidos en `10c16d4`:

| Archivo | Qué decía |
|---|---|
| `CLAUDE.md` | *"⚠️ Reunión 9999 VIVA — borrar con `teardown_prueba_resumen_9999.sql` antes del 20/6"* |
| `docs/ESTADO.md` ×4 | encabezado "⚠️ borrar antes del 20/6", "Correr el teardown", "Correr antes de la reunión real" |
| `docs/ISSUES.md` ×2 | pendiente "Correr el teardown"; **ISSUE-035** entera |
| `docs/ESTADO_R8.md` | *"Sigue pendiente, 39 días después"* |
| `docs/INTEGRACION_STUDBOOK_ESTADO.md` | *"la que hay que borrar con…"* |

En todos quedó la nota de que la decisión se revirtió el 2026-08-29 —se la marcó con
`reuniones.es_prueba` y se la filtró del buscador de Pagos— con el link a
`docs/diagnosticos/2026-08-29_issue-055-merge.md`. **ISSUE-035 pasa a CERRADO**, con una línea
explícita: *"Si alguien vuelve a leer esta issue buscando qué ejecutar: no hay nada que ejecutar."*

**Esto también corrige mi propio §9 del plan anterior**, que repetía la instrucción vieja.

---

## 7 · git — salida cruda

```
$ git log --oneline main..feat/ui-anular-recibo
5a1319a feat: ISSUE-056 — UI de anulación del recibo recién emitido (opción A)
10c16d4 docs: la reunión 9999 NO se borra — corrección de instrucciones viejas

$ git diff --stat main..feat/ui-anular-recibo
 CHANGELOG.md                            |  43 ++++
 CLAUDE.md                               |   2 +-
 docs/ESTADO.md                          |   8 +-
 docs/ESTADO_R8.md                       |   2 +-
 docs/INTEGRACION_STUDBOOK_ESTADO.md     |   2 +-
 docs/ISSUES.md                          |  63 ++++-
 liquidaciones.html                      | 186 +++++++++++++-
 tests/probe_aislamiento_club_cobros.mjs |   3 +
 tests/probe_anular_recibo.mjs           |   3 +
 tests/probe_anular_recibo_ui.mjs        | 413 ++++++++++++++++++++++++++++++++
 tests/probe_recibo_pie_cobrador.mjs     |   6 +
 tests/probe_reunion_es_prueba.mjs       |   3 +
 12 files changed, 714 insertions(+), 20 deletions(-)

$ git ls-remote origin feat/ui-anular-recibo main
5a1319a204e29e2aac27db3b935bd1882d694972	refs/heads/feat/ui-anular-recibo
80839ff65a804b2b1843411ea93284891c85e74a	refs/heads/main

$ git status
On branch feat/ui-anular-recibo
Your branch is up to date with 'origin/feat/ui-anular-recibo'.

nothing to commit, working tree clean
```

`main` sigue en `80839ff`. La rama está en origin y **sin mergear**, como pediste.

---

## 8 · Números de resumen

| | |
|---|---|
| Rama | `feat/ui-anular-recibo` = `5a1319a` (en origin) |
| `main` | `80839ff` — **sin tocar** |
| Commits | 2 (`10c16d4` corrección 9999, `5a1319a` la UI) |
| Archivos | 12 · +714 / −20 |
| `liquidaciones.html` | +186 líneas |
| Probe nuevo | `tests/probe_anular_recibo_ui.mjs` — **26/26** |
| Mutantes | **8/8 muertos** |
| Probes de regresión | 5 en verde; `probe_pagos_rol_carrera` 43/46, igual que antes |
| Aplicado en prod | **nada** |

---

## 9 · Queda pendiente

1. **El merge**, cuando lo revises.
2. **`probe_pagos_rol_carrera` está en 43/46 y los docs dicen 44/46** (ISSUE-063). Se cayó un assert
   más en algún momento y no fue esta rama. Vale mirarlo antes del 20/09.
3. **Buscador de recibos / vista de historial** (opción B) — fuera de alcance, como quedó.
4. **Sello ANULADO en la reimpresión** — decidido para después.
5. **Policy `recibos_delete`** — migración aparte, ISSUE-065.
6. **Sin verificación en browser.** Chromium no corre en este Ubuntu, así que el layout del panel
   —los `gap`, el `margin-left:auto`, cómo se ve el badge ANULADO— está razonado sobre el CSS que ya
   existe en el archivo, no visto. Los asserts cubren la lógica y el texto, no el pixel.
