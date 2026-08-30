# ISSUE-056 — merge de la UI a `main`, verificación en prod y cierre

- **Fecha**: 2026-08-30
- **SHA del merge de la UI**: **`0a3a2ac`** (`feat/ui-anular-recibo` → `main`, `--no-ff`)
- **SHA del merge del cierre documental**: **`cb5b77c`** (`chore/cierre-issue-056`, `--no-ff`) —
  también el HEAD de `main`
- **`main` antes**: `80839ff`
- **Proyecto**: `unlhcuanfrtpatoipwve` · **Prod**: `https://sigh.com.ar`
- **Antecedentes**: `2026-08-30_issue-056-ui-anulacion-plan.md` ·
  `2026-08-30_issue-056-ui-anulacion-entrega.md`

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

## 1 · Verificación contra producción

El deploy de GitHub Pages tardó **45 s** en que el CDN sirviera la versión nueva.

```
$ md5sum liquidaciones.html   (working tree, = merge 0a3a2ac)
0189ecbe749cde1bf4cfa0528162f329  liquidaciones.html

$ git show 0a3a2ac:liquidaciones.html | md5sum
0189ecbe749cde1bf4cfa0528162f329  -

$ curl -s "https://sigh.com.ar/liquidaciones.html?v=$RANDOM" -o prod.html && md5sum prod.html
HTTP 200  bytes=100801
0189ecbe749cde1bf4cfa0528162f329  /tmp/claude-1000/-home-clio-dev-SGH/d6a78be3-f0f2-4d38-868e-5ec42f33ad1b/scratchpad/prod.html
```

**Los tres md5 coinciden**: working tree, `git show 0a3a2ac:liquidaciones.html` y lo que sirve
`sigh.com.ar` → `0189ecbe749cde1bf4cfa0528162f329`. La UI está viva en producción.

### El probe, corrido contra el HTML que sirve sigh.com.ar

No contra el archivo local: contra el que se bajó del dominio. Es la diferencia entre "mi copia
pasa" y "lo que ve Valeria pasa".

```
$ LIQ_HTML=prod.html node tests/probe_anular_recibo_ui.mjs
```

```

── Probe ISSUE-056 · UI de anulación ──
   html=/tmp/claude-1000/-home-clio-dev-SGH/d6a78be3-f0f2-4d38-868e-5ec42f33ad1b/scratchpad/prod.html
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

Notar la primera línea de la salida: `html=…/prod.html`. El código que se ejecutó es el descargado
del dominio.

---

## 2 · GOTCHAS nuevos

Los dos salieron del mutation testing de esta entrega, y los dos son fallas del **test**, no del
código — que es justamente por qué merecen quedar escritos: un test que miente es peor que no
tenerlo.

### #81 — Un assert de UI que pasa igual sin la UI está midiendo el servidor

El assert de "el motivo vacío se rechaza del lado del cliente" verificaba que el recibo siguiera en
`emitido` y que hubiera un toast de error hablando del motivo. **Pasaba con la validación del
cliente borrada**: el RPC valida lo mismo, así que la llamada salía, el servidor la rechazaba, el
recibo seguía `emitido` y el `catch` mostraba un toast que decía "motivo". Los dos lados del assert
se cumplían — por el guard del servidor, no por el de la UI.

Lo que hay que observar no es el efecto, es **la ausencia de la llamada**:

```js
let rpcAnular = 0;
const sbSpy = new Proxy(sb, {
  get(t, prop){
    if (prop === 'rpc') return (name, args) => { if (name === 'anular_recibo') rpcAnular++; return t.rpc(name, args); };
    const v = t[prop];
    return typeof v === 'function' ? v.bind(t) : v;   // sb.from() sigue funcionando
  }
});
ok('U2) motivo vacío rechazado ANTES de llegar al RPC', malos.every(Boolean) && rpcAnular === 0);
```

Regla general: cuando cliente y servidor validan lo mismo —que es lo correcto, GOTCHA #80— el assert
de la capa de arriba **no puede** verificarse por el resultado final, porque la de abajo produce el
mismo resultado. Y la única forma de enterarse es **neutralizar el guard y ver si el test sigue
verde**.

### #82 — `\b` no separa `U4` de `U4b`

```js
const muertos = m.mata.filter(a => new RegExp(`❌ ${a}\\b`).test(out));   // ❌
```

`\b` es un borde entre `\w` y `\W`; `4` y `b` son los dos `\w`, así que `❌ U4\b` **no** matchea
`❌ U4b)`. El runner reportó **2 de 8 mutantes como sobrevivientes** cuando en realidad morían — y
convivían en la misma tabla con un falso positivo genuino (#81), así que no se distinguía a ojo cuál
era cuál. Se ancla en el separador real:

```js
const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));   // ✅
```

Vale para cualquier identificador con sufijo alfanumérico: rótulos de assert, `ISSUE-05` vs
`ISSUE-056`, números de gotcha, nombres de columna.

El contador de `CLAUDE.md` estaba en **77** y la lista ya iba por 80 — quedó en **82**, corregido.

---

## 3 · ISSUE-056 — CERRADO

`Estado: ✅ CERRADO (2026-08-30) — RPC (34f6e83) + UI (0a3a2ac), los dos vivos en producción y
verificados contra sigh.com.ar. Anular un recibo dejó de requerir SQL a mano.`

Los 5 requisitos que salieron del revert del recibo #4 están contestados en el doc, uno por uno, más
`lineas_anuladas` que no estaba en la lista original. Lo que queda **fuera a propósito** y está
escrito como tal, no como omisión:

- **Buscador de recibos / vista de historial** (opción B). Con la opción A el recibo se anula
  mientras está en pantalla, que es el caso real; **anular uno de la semana pasada todavía necesita
  consola**. Es la próxima pieza natural.
- Reimprimir el anulado con sello ANULADO — decidido para después.
- Policy `recibos_delete` — migración aparte, ISSUE-065.

---

## 4 · git — salida cruda

```
$ git log --oneline --graph -8
*   cb5b77c merge: ISSUE-056 cerrado + GOTCHAS #81 y #82
|\  
| * fd3004c docs: ISSUE-056 CERRADO + GOTCHAS #81 y #82
|/  
*   0a3a2ac merge: ISSUE-056 — UI de anulación del recibo recién emitido
|\  
| * 5a1319a feat: ISSUE-056 — UI de anulación del recibo recién emitido (opción A)
| * 10c16d4 docs: la reunión 9999 NO se borra — corrección de instrucciones viejas
|/  
*   80839ff merge: el protocolo de informes cubre toda salida y exige push a origin
|\  
| * d6e6eba docs: un informe no está entregado hasta que está en origin
| * d9e58cf docs: el protocolo de informes cubre toda salida, no sólo los diagnósticos

$ git show --stat --oneline 0a3a2ac
0a3a2ac merge: ISSUE-056 — UI de anulación del recibo recién emitido

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

$ git show --stat --oneline cb5b77c
cb5b77c merge: ISSUE-056 cerrado + GOTCHAS #81 y #82

 CHANGELOG.md    | 18 +++++++++---
 CLAUDE.md       |  2 +-
 docs/GOTCHAS.md | 86 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 docs/ISSUES.md  | 19 ++++++++-----
 4 files changed, 113 insertions(+), 12 deletions(-)

$ git ls-remote origin main
cb5b77cc52cfa5138c7bdb98ba330c92833a46f8	refs/heads/main

$ git status
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
```

---

## 5 · Números de resumen

| | |
|---|---|
| **SHA del merge de la UI** | **`0a3a2ac`** |
| SHA del merge del cierre documental | `cb5b77c` (= HEAD de `main`) |
| `main` en origin | `cb5b77c` ✔ verificado con `git ls-remote` |
| md5 `liquidaciones.html` | `0189ecbe749cde1bf4cfa0528162f329` — igual en tree, commit y `sigh.com.ar` |
| Deploy | 45 s hasta que el CDN sirvió la versión nueva |
| Probe contra el HTML servido | **26/26** |
| Mutantes | 8/8 muertos (corrida previa al merge) |
| GOTCHAS nuevos | #81, #82 — contador de `CLAUDE.md` corregido 77 → 82 |
| ISSUE-056 | ✅ **CERRADO** |
| ISSUE-035 (teardown 9999) | ✅ CERRADO — no hay nada que ejecutar |

---

## 6 · Queda abierto

1. **`probe_pagos_rol_carrera` está en 43/46 y los docs dicen 44/46** (ISSUE-063). Se cayó un assert
   más en algún momento y **no fue esta rama** — verificado con `git stash` antes del merge. Vale
   mirarlo antes del 20/09.
2. **Anular un recibo viejo sigue requiriendo consola.** La opción A cubre el caso real (el error se
   ve el mismo día), pero no hay superficie para un recibo que ya no está en pantalla. Es la opción
   B.
3. **Sin verificación en browser.** Chromium no corre en este Ubuntu: el layout del panel está
   razonado sobre el CSS que ya existía, no visto. Los asserts cubren lógica y texto, no el pixel.
   La primera vez que alguien abra Pagos en el navegador conviene mirar cómo cae el panel.
4. **`club_secuencias` de Dolores sigue en 32**, por decisión. El próximo recibo real será el **33**.
