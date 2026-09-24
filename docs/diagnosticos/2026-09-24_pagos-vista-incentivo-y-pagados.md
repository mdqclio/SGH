# Pagos, vista por carrera: incentivo de jockey una sola vez + lo pagado a la vista

- Fecha: 2026-09-24
- Rama: `feat/pagos-vista-incentivo-y-pagados` @ `5de0edba307d2db597bf0100eba3dd2937d93111` — **PR #12** (https://github.com/mdqclio/SGH/pull/12), **sin merge**
- Base: `main` @ `dac2da86a18c07566b85a9337964da2d4ac464be`
- Guards: `pwd` = /home/clio/dev/SGH · `select count(*) from spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- **Sin desplegar.** Prod sigue sirviendo `main` (md5 abajo). Merge = deploy: esperar a que Valeria termine.
- **Anonimizado** (ver § Anonimización).

## Resultado

| | |
|---|---|
| Probe nuevo `probe_pagos_vista_incentivo_pagados.mjs` | **26/26**, **15/15 mutantes** |
| Probe `probe_pagos_vista_carrera.mjs` (ajustado) | **25/25**, **7/7 mutantes** |
| `probe_pagos_carrera_busqueda.mjs` | 40/40 (sin cambios) |
| `probe_pagos_rol_carrera.mjs` | 42/46 — los **mismos 4 ❌ que en `main`** (verificado corriéndolo sobre el `liquidaciones.html` de `main`): baselines fijos viejos (493 líneas / 181 spcs) y dos casos que dependen del estado de los datos. No tiene que ver con este cambio |
| Suma del "Pagable" de las 8 carreras de R9 | **$908.700** = lo pendiente en la base (lo que muestra Resumen). Antes: $1.028.700 |
| Escrituras en la base | **ninguna**: el diff de `liquidaciones.html` no tiene insert/update/delete/upsert/rpc; los probes son solo lectura |

## Qué cambió (sólo `liquidaciones.html`, bloque VISTA POR CARRERA + 2 reglas de CSS)

**A — incentivo de jockey.** La línea es UNA por reunión y no tiene `inscripcion_id`. La vista la mostraba con importe
en cada carrera donde el jockey largó. Ahora:
- `cobDuenosIncentivo(carreras, inscs)` (pura) arma jockey → carrera **dueña** = la de número más bajo
  (`numero_carrera_programa ?? numero_turno`; a igual número, turno más bajo) donde **largó**. "Largó" = misma regla
  que ya usaba la vista (resultado con `no_largo = false`). Las carreras anuladas no cuentan.
- `cobDuenosReunion(reunionId)`: las dos consultas (carreras no anuladas + inscripciones ratificadas con resultado), con
  caché de 60 s como el resto de la vista.
- En `cobArmarVistaCarrera`: en la carrera dueña, la línea va con importe y el rótulo "Incentivo por reunión — se paga
  una sola vez". En las otras carreras donde largó queda sólo una nota gris sin importe ni botón: "Incentivo por
  reunión: figura en la carrera N". No suma en ningún total.

**B — lo pagado.**
- `cobLineasPagadasReunion` trae de la reunión las líneas comprometidas (`recibo_id` no nulo **o** `pagado` —
  GOTCHA #74/#88), con el recibo embebido (número, forma de pago, estado).
- `cobPagoDeLinea`: con recibo → transferencia/efectivo + número; **recibo anulado → no cuenta**; sin recibo y
  `pagado` → regularizado.
- `cobChipsPago`: un chip **por recibo** (no por línea): "✓ Transferido · Rec. #N" / "✓ Efectivo · Rec. #N", y un solo
  "✓ Pagado (regularizado)".
- El chip va en lugar del botón Pagar, o **junto** a él si al beneficiario le queda algo pendiente. El importe del
  beneficiario se muestra sólo si tiene algo pendiente.
- `cobRotuloSinDeuda`: caballo sin nada pagable → "Sin deuda pagable · todo pagado (N transferencia, M efectivo)"
  si hubo pagos, "Sin deuda pagable" a secas si no.
- Lo pagado no entra en ningún total ni en el contador de líneas pagables.
- `cobHtmlVistaCarrera(bloques, retenidas)`: el HTML salió de `cobRenderVistaCarrera` a una función pura (el probe la
  corre con datos sintéticos).

## Decisiones propias (conservadoras, para confirmar)

1. **", K regularizado"** en el rótulo del caballo cuando hay saldados sin recibo. El pedido decía sólo
   "(N transferencia, M efectivo)"; sin esto, un caballo pagado todo por saldado administrativo diría "todo pagado
   (0 transferencia, 0 efectivo)". N y M cuentan **recibos**; K cuenta **personas**.
2. **Caballo con retenidas (doping):** dice "pagado (…)" en vez de "todo pagado (…)", porque queda plata por habilitar.
   El contador "🔒 N retenida(s)" sigue como estaba.
3. **Si falla la carga de dueños o de pagadas**, la vista no se muestra (toast de error), en vez de mostrarse sin esos
   datos: sin dueños volvería a duplicar el incentivo, y sin pagadas diría "nunca hubo pagos" cuando no es así.
4. **Jockey sin carrera dueña conocida** (no debería pasar: la selección exige que haya largado): el incentivo se
   muestra **con** importe. Es preferible verlo dos veces a no verlo.
5. Las notas y los chips del incentivo siguen la misma regla de la carrera dueña **esté pagado o no**.
6. Hoy **no hay** recibos por transferencia ni anulados en la base (44 recibos, todos en efectivo y emitidos). Esos dos
   casos se prueban con líneas sintéticas en las mismas funciones del archivo (casos 5b y 5g).

## Anonimización

- Cada palabra de nombre de persona, caballo, caballeriza o propietario (sacadas de `profesionales`,
  `propietarios`, `caballerizas`, `spcs` y `usuarios`) se reemplazó por un token estable `N###`. Los nombres
  completos de caballo, caballeriza y propietario se reemplazaron como frase por `F###`.
- Además: DNI → `<dni>`, UUID → `<uuid>`, texto buscado → `q="<q>"`.
- Los dos jockeys del pedido son **`N002 N003`** y **`N004 N005`** (casos 2/2b). El jockey de una sola monta es
  **`N007 N008`** (caso 3). La tabla de tokens a nombres **no** está en este informe.
- Las palabras de vocabulario del código no se tapan (salen de `liquidaciones.html`, los probes y `CHANGELOG.md`).
  Por eso algún token cae sobre palabras comunes que también forman parte de un nombre (p. ej. "N027 roles"). Al revés,
  quedaron sin tapar palabras sueltas que coinciden con ese vocabulario y que por sí solas no identifican a nadie:
  `"CABALLERIZA","JOCKEY","LARGO","OTRA","PRIMER","PRUEBA","VIEJO"`.
- Control después de anonimizar: `grep -il` de 15 nombres conocidos del padrón sobre las salidas → **0 archivos**
  (exit 1).
- Script: § Anexo B.

## Salidas crudas (anonimizadas)

Todas corridas en la rama @ `5de0edba307d2db597bf0100eba3dd2937d93111`, con `set -a; . ./.env; set +a`.

### `node tests/probe_pagos_vista_incentivo_pagados.mjs`
```
✅ 1) R9: suma del "Pagable" de las 8 carreras (5 con resultado) = pendiente en la base (Resumen)  → 908700.00 vs 908700.00
✅ 1b) R9: suma de los importes de todas las líneas mostradas = pendiente en la base  → 908700.00
✅ 1c) R9: cantidad de líneas pagables mostradas = líneas impagas de la base (ninguna N001 veces, ninguna afuera)  → 27 vs 27
✅ 2) N002 N003: corrió en 1 y 5; incentivo pagable en UNA sola carrera, la 1  → con importe en: 1
✅ 2b) N002 N003: nota "figura en la carrera 1" en 5 y en ninguna otra  → [{"nro":5,"n":"Incentivo por reunión: figura en la carrera 1"}]
✅ 2) N004 N005: corrió en 3 y 5; incentivo pagable en UNA sola carrera, la 3  → con importe en: 3
✅ 2b) N004 N005: nota "figura en la carrera 3" en 5 y en ninguna otra  → [{"nro":5,"n":"Incentivo por reunión: figura en la carrera 3"}]
✅ 2c) R9: los 3 incentivos pagables aparecen con importe una sola vez, en la carrera de número más N006
✅ 2d) cada incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"  → Incentivo jockey · Incentivo por reunión — se paga una sola vez
✅ 3) N007 N008 (una monta, incentivo pagable): con importe en su carrera y sin nota  → {"lin":[2],"notas":[]}
✅ 3b) R9: ninguno de los 9 jockeys de una sola monta lleva nota
✅ 3c) R9: los 9 jockeys con varias montas llevan nota en todas menos la dueña
✅ 4) R9: en cada carrera con resultado, los chips de recibo = recibos de la base y los "regularizado" = saldados sin recibo (49 chips)
✅ 4b) R9: ningún importe pagado entra al "Pagable" (ver 1) y ningún beneficiario sólo-pagado N009 botón Pagar
✅ 5) cobMarcarPagadas: recibo anulado y línea de otro club quedan afuera  → a1,a1b,a2,a3,b1
✅ 5b) transferencia: "✓ Transferido · Rec. #901", UN chip aunque el recibo tenga 2 líneas, sin botón  → {"rol":"Propietario","nombre":"SINT P1","pagar":null,"lineas":[],"notas":[],"chips":["✓ Transferido · Rec. #901"]}
✅ 5c) efectivo: "✓ Efectivo · Rec. #902", sin botón
✅ 5d) saldado sin recibo: "✓ Pagado (regularizado)", sin botón
✅ 5e) caballo todo pagado: "Sin deuda pagable · todo pagado (1 transferencia, 1 efectivo, 1 regularizado)"  → Sin deuda pagable · todo pagado (1 transferencia, 1 efectivo, 1 regularizado)
✅ 5f) parte pagada y parte pendiente: chip "✓ Efectivo · Rec. #903" JUNTO al botón Pagar, total sólo lo pendiente  → {"titulo":"2° · CAB B","info":"1 línea(s) pagable(s)","pagable":500,"benefs":[{"rol":"Propietario","nombre":"SINT P2","pagar":["propietario","p2"],"lineas":[{"texto":"Carrera 1 — premio","monto":500}],"notas":[],"chips":["✓ Efectivo · Rec. #903"]}]}
✅ 5g) recibo anulado: no hay chip #904 ni beneficiario pagado; el caballo dice "Sin deuda pagable" a secas  → {"titulo":"3° · CAB C","info":"Sin deuda pagable","pagable":0,"benefs":[]}
✅ 5h) caballo que nunca tuvo líneas: "Sin deuda pagable" a secas
✅ 5i) todo pagado pero con retenida: dice "pagado (…)", no "todo pagado"  → Sin deuda pagable · pagado (1 transferencia, 1 efectivo, 1 regularizado) · 🔒 1 retenida(s) — habilitar desde Pagar
✅ 5j) lo pagado no entra en ningún total
✅ 6) cobDuenosIncentivo: la carrera de número más N006 donde LARGÓ (NL no cuenta; sin nº de programa usa el turno)  → [["jx",{"carrera_id":"k2","nro":2,"turno":2}],["jy",{"carrera_id":"k3","nro":3,"turno":6}]]
✅ 6b) en la dueña: importe; en la otra: nota sin importe y sin botón  → [{"rol":"Jockey","beneficiarios":[{"tipo":"profesional","id":"jx","nombre":"(profesional)","lineas":[],"pagos":[],"notas":["Incentivo por reunión: figura en la carrera 2"],"total":0}]}]

26/26 checks OK
exit 0
```

### `node tests/probe_pagos_vista_incentivo_pagados.mjs --mutantes`
```
💀 mutante incentivo_en_todas         → muerto (11 assert(s))
     ❌ 1) R9: suma del "Pagable" de las 8 carreras (5 con resultado) = pendiente en la base (Resumen)  → 1028700.00 vs 908700.00
     ❌ 1b) R9: suma de los importes de todas las líneas mostradas = pendiente en la base  → 1028700.00
     ❌ 1c) R9: cantidad de líneas pagables mostradas = líneas impagas de la base (ninguna N001 veces, ninguna afuera)  → 29 vs 27
💀 mutante dueno_mas_alto             → muerto (9 assert(s))
     ❌ 2) N002 N003: corrió en 1 y 5; incentivo pagable en UNA sola carrera, la 1  → con importe en: 5
     ❌ 2b) N002 N003: nota "figura en la carrera 1" en 5 y en ninguna otra  → [{"nro":1,"n":"Incentivo por reunión: figura en la carrera 5"}]
     ❌ 2) N004 N005: corrió en 3 y 5; incentivo pagable en UNA sola carrera, la 3  → con importe en: 5
💀 mutante sin_nota                   → muerto (4 assert(s))
     ❌ 2b) N002 N003: nota "figura en la carrera 1" en 5 y en ninguna otra  → []
     ❌ 2b) N004 N005: nota "figura en la carrera 3" en 5 y en ninguna otra  → []
     ❌ 3c) R9: los 9 jockeys con varias montas llevan nota en todas menos la dueña  → N010, N011, N004, N005 N012, N013, N014, N002, N003, N015, N016, N017, N018, N019, N020 N021, N022, N023, N024 N025, N021 N026
💀 mutante nota_tambien_en_duena      → muerto (5 assert(s))
     ❌ 2b) N002 N003: nota "figura en la carrera 1" en 5 y en ninguna otra  → [{"nro":1,"n":"Incentivo por reunión: figura en la carrera 1"},{"nro":5,"n":"Incentivo por reunión: figura en la carrera 1"}]
     ❌ 2b) N004 N005: nota "figura en la carrera 3" en 5 y en ninguna otra  → [{"nro":3,"n":"Incentivo por reunión: figura en la carrera 3"},{"nro":5,"n":"Incentivo por reunión: figura en la carrera 3"}]
     ❌ 3) N007 N008 (una monta, incentivo pagable): con importe en su carrera y sin nota  → {"lin":[2],"notas":[{"nro":2,"n":"Incentivo por reunión: figura en la carrera 2"}]}
💀 mutante sin_rotulo_una_vez         → muerto (5 assert(s))
     ❌ 2) N002 N003: corrió en 1 y 5; incentivo pagable en UNA sola carrera, la 1  → con importe en: —
     ❌ 2) N004 N005: corrió en 3 y 5; incentivo pagable en UNA sola carrera, la 3  → con importe en: —
     ❌ 2c) R9: los 3 incentivos pagables aparecen con importe una sola vez, en la carrera de número más N006  → N004, N005 N012, N007, N008, N002, N003
💀 mutante anulado_cuenta             → muerto (2 assert(s))
     ❌ 5) cobMarcarPagadas: recibo anulado y línea de otro club quedan afuera  → a1,a1b,a2,a3,b1,c1
     ❌ 5g) recibo anulado: no hay chip #904 ni beneficiario pagado; el caballo dice "Sin deuda pagable" a secas  → {"titulo":"3° · CAB C","info":"Sin deuda pagable · todo pagado (1 transferencia, 0 efectivo)","pagable":0,"benefs":[{"rol":"Propietario","nombre":"SINT P3","pagar":null,"lineas":[],"notas":[],"chips":["✓ Transferido · Rec. #904"]}]}
💀 mutante regularizado_ignorado      → muerto (5 assert(s))
     ❌ 4) R9: en cada carrera con resultado, los chips de recibo = recibos de la base y los "regularizado" = saldados sin recibo (46 chips)  → C1: rec 12/12, reg 0/1; C2: rec 19/19, reg 0/1; C5: rec 1/1, reg 0/1
     ❌ 5) cobMarcarPagadas: recibo anulado y línea de otro club quedan afuera  → a1,a1b,a2,b1
     ❌ 5d) saldado sin recibo: "✓ Pagado (regularizado)", sin botón
💀 mutante todo_efectivo              → muerto (3 assert(s))
     ❌ 5b) transferencia: "✓ Transferido · Rec. #901", UN chip aunque el recibo tenga 2 líneas, sin botón  → {"rol":"Propietario","nombre":"SINT P1","pagar":null,"lineas":[],"notas":[],"chips":["✓ Efectivo · Rec. #901"]}
     ❌ 5e) caballo todo pagado: "Sin deuda pagable · todo pagado (1 transferencia, 1 efectivo, 1 regularizado)"  → Sin deuda pagable · todo pagado (0 transferencia, 2 efectivo, 1 regularizado)
     ❌ 5i) todo pagado pero con retenida: dice "pagado (…)", no "todo pagado"  → Sin deuda pagable · pagado (0 transferencia, 2 efectivo, 1 regularizado) · 🔒 1 retenida(s) — habilitar desde Pagar
💀 mutante boton_solo_sin_pagos       → muerto (1 assert(s))
     ❌ 5f) parte pagada y parte pendiente: chip "✓ Efectivo · Rec. #903" JUNTO al botón Pagar, total sólo lo pendiente  → {"titulo":"2° · CAB B","info":"1 línea(s) pagable(s)","pagable":500,"benefs":[{"rol":"Propietario","nombre":"SINT P2","pagar":null,"lineas":[{"texto":"Carrera 1 — premio","monto":500}],"notas":[],"chips":["✓ Efectivo · Rec. #903"]}]}
💀 mutante chips_solo_sin_pendiente   → muerto (1 assert(s))
     ❌ 5f) parte pagada y parte pendiente: chip "✓ Efectivo · Rec. #903" JUNTO al botón Pagar, total sólo lo pendiente  → {"titulo":"2° · CAB B","info":"1 línea(s) pagable(s)","pagable":500,"benefs":[{"rol":"Propietario","nombre":"SINT P2","pagar":["propietario","p2"],"lineas":[{"texto":"Carrera 1 — premio","monto":500}],"notas":[],"chips":[]}]}
💀 mutante rotulo_ignora_pagos        → muerto (2 assert(s))
     ❌ 5e) caballo todo pagado: "Sin deuda pagable · todo pagado (1 transferencia, 1 efectivo, 1 regularizado)"  → Sin deuda pagable
     ❌ 5i) todo pagado pero con retenida: dice "pagado (…)", no "todo pagado"  → Sin deuda pagable · 🔒 1 retenida(s) — habilitar desde Pagar
💀 mutante pagado_suma_total          → muerto (10 assert(s))
     ❌ 1) R9: suma del "Pagable" de las 8 carreras (5 con resultado) = pendiente en la base (Resumen)  → 3193550.00 vs 908700.00
     ❌ 1b) R9: suma de los importes de todas las líneas mostradas = pendiente en la base  → 3193550.00
     ❌ 1c) R9: cantidad de líneas pagables mostradas = líneas impagas de la base (ninguna N001 veces, ninguna afuera)  → 92 vs 27
💀 mutante chip_por_linea             → muerto (1 assert(s))
     ❌ 5b) transferencia: "✓ Transferido · Rec. #901", UN chip aunque el recibo tenga 2 líneas, sin botón  → {"rol":"Propietario","nombre":"SINT P1","pagar":null,"lineas":[],"notas":[],"chips":["✓ Transferido · Rec. #901","✓ Transferido · Rec. #901"]}
💀 mutante todo_pagado_con_retenidas  → muerto (1 assert(s))
     ❌ 5i) todo pagado pero con retenida: dice "pagado (…)", no "todo pagado"  → Sin deuda pagable · todo pagado (1 transferencia, 1 efectivo, 1 regularizado) · 🔒 1 retenida(s) — habilitar desde Pagar
💀 mutante pagadas_no_se_cargan       → muerto (2 assert(s))
     ❌ 3c) R9: los 9 jockeys con varias montas llevan nota en todas menos la dueña  → N010, N011, N013, N014, N015, N016, N017, N018, N019, N020 N021, N022, N023, N024 N025, N021 N026
     ❌ 4) R9: en cada carrera con resultado, los chips de recibo = recibos de la base y los "regularizado" = saldados sin recibo (0 chips)  → C1: rec 0/12, reg 0/1; C2: rec 0/19, reg 0/1; C3: rec 0/7, reg 0/0; C4: rec 0/5, reg 0/0; C5: rec 0/1, reg 0/1

15/15 mutantes muertos
exit 0
```

### `node tests/probe_pagos_vista_carrera.mjs`
```
✅ 1) con carrera elegida se rinde la vista por caballo (no tarjetas liq-prof de persona)
✅ 1b) C5: un bloque por inscripción ratificada (8)  → 8 bloques
✅ 1c) C5: bloques por posición ASC, los que no largaron al final  → 1° · F542 | 2° · F279 | 3° · F721 | 4° · F412 | 5° · F276 | 6° · F273 | NL · F652 | NL · F615
✅ 1d) C5: el título de cada bloque lleva el puesto (N°) o NL
✅ 2) C5: en todos los bloques los roles van Propietario → Entrenador → Jockey  → EJ EJ PEJ PEJ PEJ PEJ  
✅ 2b) C5: hay al menos un bloque con los N027 roles  → 3° · F721: Propietario=F679 → Entrenador=N028, N029 → Jockey=N004, N005 N012
✅ 2c) C5: cada rol de ese bloque lleva el beneficiario correcto según la inscripción
✅ 3) C5: los 2 incentivo(s) de jockey pagable(s) de quienes largaron acá aparecen (sin inscripcion_id ni carrera_id) — con importe si C5 es su carrera dueña, como nota si no  → N004, N005 N012, N002, N003 → N002, N003@F542, N013, N014@F279, N004, N005 N012@F721, N010, N011@F412, N015, N016@F276
✅ 3b) C5: cada incentivo está N006 el rol Jockey del caballo que ese jockey montó
✅ 3c) C5: ningún incentivo N006 un jockey que no largó acá
✅ 3d) C5: el incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"; la nota, "figura en la carrera N" (N = dueña)  → Incentivo por reunión: figura en la carrera 1 | Incentivo por reunión: figura en la carrera 4 | Incentivo por reunión: figura en la carrera 3 | Incentivo por reunión: figura en la carrera 1 | Incentivo por reunión: figura en la carrera 3
✅ 3e) N002, N003: en la carrera 1 (dueña) el incentivo está con importe y "se paga una sola vez"  → Incentivo jockey · Incentivo por reunión — se paga una sola vez $60000.00
✅ 4) C5: una misma persona en N001 roles N009 N001 botones Pagar (propietario y profesional)  → F130@5° · F276: propietario/profesional
✅ 5) C5: los caballos sin deuda pagable se muestran (apagados, "sin deuda pagable") en vez de desaparecer  → 2 vacíos
✅ 6) C5 q="<q>" → sólo ese bloque  → 1° · F542
✅ 6b) C5 q="<q>" → sólo los bloques donde está ese beneficiario  → 1° · F542
✅ 6c) C5 q sin match → 0 bloques
✅ 7) C7 (sin resultado): 13 bloques con "—", todos sin deuda, 0 incentivos (J vacío)  → 13 bloques, J=0
✅ 8) sin carrera: modo tarjetas por persona intacto (≥ 10 tarjetas, sin cob-vista)  → 20 tarjetas
✅ 9) C5: líneas en la vista = líneas por inscripción (15) + incentivos cuya carrera dueña es la 5 (0)  → 15
✅ 9b) C5: la suma de montos de la vista coincide  → 458700.00 vs 458700.00
✅ 10) C4: 1 caballo(s) NL cuyo jockey N009 incentivo pagable → el incentivo NO aparece N006 el NL  → F358 (N007, N008)
✅ 10b) C4: los bloques van por posición ASC  → 1° · F346 | 2° · F567 | 3° · F691 | 4° · F420 | NL · F358 | NL · F322 | NL · F319
✅ 11) cobLineasDeCarrera N009 las N027 puertas (inscripción / carrera_id / incentivo por J)
✅ 11b) cobrosBuscar ya no acota por inscFiltro (el filtro viejo que descartaba los incentivos)

25/25 checks OK
exit 0
```

### `node tests/probe_pagos_vista_carrera.mjs --mutantes`
```
💀 mutante j_sin_largo       → muerto (2 assert(s))
     ❌ 3b) C5: cada incentivo está N006 el rol Jockey del caballo que ese jockey montó
     ❌ 3c) C5: ningún incentivo N006 un jockey que no largó acá
💀 mutante solo_inscripcion  → muerto (3 assert(s))
     ❌ 3) C5: los 2 incentivo(s) de jockey pagable(s) de quienes largaron acá aparecen (sin inscripcion_id ni carrera_id) — con importe si C5 es su carrera dueña, como nota si no  → N004, N005 N012, N002, N003 → 
     ❌ 3d) C5: el incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"; la nota, "figura en la carrera N" (N = dueña)
     ❌ 11) cobLineasDeCarrera N009 las N027 puertas (inscripción / carrera_id / incentivo por J)
💀 mutante roles_alfabetico  → muerto (1 assert(s))
     ❌ 2) C5: en todos los bloques los roles van Propietario → Entrenador → Jockey  → EJ EJ EJP EJP EJP EJP  
💀 mutante orden_gatera      → muerto (3 assert(s))
     ❌ 1c) C5: bloques por posición ASC, los que no largaron al final  → 4° · F412 | 6° · F273 | 3° · F721 | NL · F652 | 2° · F279 | NL · F615 | 5° · F276 | 1° · F542
     ❌ 3e) N010, N011: en la carrera 1 (dueña) el incentivo está con importe y "se paga una sola vez"
     ❌ 10b) C4: los bloques van por posición ASC  → NL · F358 | NL · F322 | 1° · F346 | NL · F319 | 2° · F567 | 4° · F420 | 3° · F691
💀 mutante sin_rotulo        → muerto (1 assert(s))
     ❌ 3e) N002, N003: en la carrera 1 (dueña) el incentivo está con importe y "se paga una sola vez"  → Incentivo jockey  $60000.00
💀 mutante ocultar_vacios    → muerto (5 assert(s))
     ❌ 1b) C5: un bloque por inscripción ratificada (8)  → 6 bloques
     ❌ 1c) C5: bloques por posición ASC, los que no largaron al final  → 1° · F542 | 2° · F279 | 3° · F721 | 4° · F412 | 5° · F276 | 6° · F273
     ❌ 5) C5: los caballos sin deuda pagable se muestran (apagados, "sin deuda pagable") en vez de desaparecer  → 0 vacíos
💀 mutante q_ignorado        → muerto (3 assert(s))
     ❌ 6) C5 q="<q>" → sólo ese bloque  → 1° · F542 | 2° · F279 | 3° · F721 | 4° · F412 | 5° · F276 | 6° · F273 | NL · F652 | NL · F615
     ❌ 6b) C5 q="<q>" → sólo los bloques donde está ese beneficiario  → 1° · F542 | 2° · F279 | 3° · F721 | 4° · F412 | 5° · F276 | 6° · F273 | NL · F652 | NL · F615
     ❌ 6c) C5 q sin match → 0 bloques

7/7 mutantes muertos
exit 0
```

### `node tests/probe_pagos_carrera_busqueda.mjs`
```
✅ A0) ninguna carrera anulada N009 líneas de liquidación (por carrera_id ni por inscripción)  → 10 anuladas, 0 líneas
✅ A1) R9: la query no emitió error
✅ A2) R9: sin rótulos repetidos  → Carrera 1, Carrera 2, Carrera 3, Carrera 4, Carrera 5, Carrera 6, Carrera 7, Carrera 8
✅ A3) R9: 8 carreras (11 turnos − 3 anulados)  → 8
✅ A4) R9: ordenado 1 a 8  → 1,2,3,4,5,6,7,8
✅ A5) R9: "Carrera 2" es el turno 4 (el corrido), no el turno 2 anulado
✅ A6) R9: ningún turno anulado (2, 8, 10) está en el select
✅ A7) R9: el turno 1 (estado NULL, con 27 líneas) SIGUE en el select — el filtro es NULL-safe  → estado=null
✅ A8) R6: el turno 2 (estado NULL, programa 2, 39 líneas) sigue en el select  → estado=null
✅ A9) R6: sin repetidos y ordenado  → 1,2,3,4,5,6,7,8
✅ A10) el texto usa el patrón NULL-safe del repo
✅ B1) cobNorm quita Ñ y tildes, baja a minúsculas
✅ B2) cobNorm colapsa puntuación y espacios
✅ B3) cobNorm acepta la Ñ descompuesta (N + U+0303)
✅ B4) cobMatch: palabras sueltas sin orden
✅ B5) cobMatch: sin Ñ encuentra con Ñ
✅ B6) cobMatch: "P y P" encuentra F738
✅ B6b) cobMatch: pegado encuentra separado (STUDCHICO → F573, F738 → "p y p")
✅ B7) cobMatch: apellido solo, DNI y pedazo de caballeriza
✅ B8) cobMatch: NO matchea lo que no está
✅ B9) cobMatch: q vacío matchea todo
✅ B10) cobrosBuscar usa cobMatch en el beneficiario y en la caballeriza
✅ B11a) hay universo pagable en R9 para armar los casos (≥ 10 tarjetas)  → 20
✅ B11b) se armaron casos de los 4 tipos (compuesto, Ñ, caballeriza, provisorio)  → 13 casos; compuesto=true Ñ=false caballerizas=2 provisorio=true
✅ B11) q="<q>" → N030, N031 N032  [apellido + primer nombre (orden del programa)]  → → N030, N031 N032
✅ B11) q="<q>" → N030, N031 N032  [primer nombre + apellido]  → → N030, N031 N032
✅ B11) q="<q>" → N030, N031 N032  [sin tildes/Ñ, minúsculas]  → → N030, N031 N032
✅ B11) q="<q>" → F130  [caballeriza exacta]  → → F130
✅ B11) q="<q>" → F130  [caballeriza sin Ñ/tilde]  → → F130
✅ B11) q="<q>" → F130  [caballeriza con espacios metidos ("P y P")]  → → F130
✅ B11) q="<q>" → F130  [un pedazo de la caballeriza]  → → F130
✅ B11) q="<q>" → F130  [DNI del propietario]  → → F130 | F130
✅ B11) q="<q>" → F389  [caballeriza exacta]  → → F389
✅ B11) q="<q>" → F389  [caballeriza sin espacios]  → → F389
✅ B11) q="<q>" → F389  [un pedazo de la caballeriza]  → → F389
✅ B11) q="<q>" → F389  [DNI del propietario]  → → F389
✅ B11) q="<q>" → F679  [provisorio, su palabra más larga]  → → F679
✅ B12) q="<q>" trae al pagable y no a los 4 homónimo(s) sin plata  → N030, N031 N032
✅ B13) sin q: el universo de R9 se lista entero (≥ 10 tarjetas)  → 20
✅ B14) el matcheo no rompe la búsqueda por caballeriza previa (probe_cobros_caballeriza: benefSearch sigue en crudo)

40/40 checks OK
exit 0
```

### `node tests/probe_pagos_rol_carrera.mjs` — rama
```

=== probe_pagos_rol_carrera — rol y nº de carrera en el tab Pagos ===

  ✅ 1a) cobrosBuscar trae descripcion y concepto_tipo (rol) y carrera_id
       id,beneficiario_tipo,beneficiario_id,monto_neto,reunion_id,inscripcion_id,carrera_id,descripcion,concepto,concepto_tipo,liquidaciones(club_id)
  ❌ 1a) cobrosDetalle trae las 3 columnas del rol + carrera_id
  ✅ 1b) la tabla de pagables N009 columna Rol
  ✅ 1b) los colspan acompañan la columna nueva (8 y 7)
  ✅ 1b) la tabla de retenidas también rotula el rol
  ✅ 1c) la tarjeta usa etiquetaRoles y etiquetaCarreras, no ${g.tipo} pelado
  ✅ 2e) el detalle N009 el respaldo ?? carrera_id
  ✅ 2e) el recibo N009 el respaldo ?? carrera_id
  ✅ 2a) sigue sin haber offsets artificiales en el módulo
  ✅ 1d) rolDeLinea no dice "N033"
  ✅ 1d) etiquetaRoles no reescribe el vocabulario
  ✅ hay líneas pagables para probar
       63 líneas
  ✅ 1d) todo rol derivado está en {Propietario, Entrenador, Jockey}
       Entrenador / Propietario / Jockey
  ✅ 1e) ninguna línea cae al genérico "Profesional"
  ✅ 1e) ninguna tarjeta muestra el genérico "profesional"
  ❌ 1c) hay al menos un beneficiario con más de un rol (si no, el test no prueba nada)
       0 de 27 beneficiarios
  ✅ 1c) los mono-rol siguen mostrando exactamente su rol
  ✅ 2b) ordena numérico: C1, C2, C3, C10, C12
       C1, C2, C3, C10, C12
  ✅ 2b) un sort textual habría dado otra cosa (el test es sensible)
  ✅ 2c) sólo-sin-carrera → "incentivo por reunión"
  ✅ 2c) mixto → carreras + el rótulo
  ✅ 2c) sólo-carreras → sin rótulo de más
  ✅ 2c) ninguna tarjeta N034 queda con la N035 vacía o en "—"
  ✅ 2c) los beneficiarios sin ninguna carrera son incentivo de jockey y quedan rotulados
       2 beneficiarios
  ✅ 2c) y todas sus líneas son incentivo_jockey (no es que se perdió el dato)
  ✅ 2a) toda línea con carrera se resuelve como numero_carrera_programa ?? numero_turno
       57 líneas con carrera, 0 mal
  ✅ 2a) el fallback a numero_turno se ejerce de verdad (hay carreras sin numero_carrera_programa)
       3 de 7 carreras usan el fallback
  ✅ 2d) el set de carreras de cada tarjeta coincide con la base
       27 beneficiarios, 0 con diferencia
  ✅ C0) las vars del cache son de módulo, al lado de cobCaballerizas
  ✅ C0) el bloque invalida cuando cambia la reunión
  ✅ C0) el bloque pide sólo lo que falta (no el universo entero)
  ✅ C1) primera búsqueda de la reunión: consulta inscripciones y carreras
       inscripciones + carreras
  ✅ C1) y resuelve igual que el camino sin cache
  ✅ C2) tecleando lo mismo en la misma reunión: CERO viajes al servidor
       0 consultas
  ✅ C2) y el resultado no cambió
  ✅ C3) al ampliar el conjunto pide sólo los ids nuevos, no los ya cacheados
       17 ids pedidos en 2 consultas
  ✅ C3) y el mapa ampliado sigue coincidiendo con la base
  ✅ C4) repetir la búsqueda completa: CERO viajes
       0 consultas
  ✅ C4) y sigue resolviendo N036
  ✅ C5) el id que no existe se pide una vez y queda cacheado en negativo
       0 consultas en la segunda vuelta
  ✅ C6) cambiar de reunión invalida el cache y vuelve a consultar
       2 consultas, scope = R2
  ✅ C6) el scope guardado es la reunión nueva
  ✅ C6) los mapas rearmados vuelven a coincidir con la base
  ✅ C6) y la reunión nueva también cachea (segunda tecla: cero viajes)
       0 consultas
  ❌ read-only: liquidacion_detalle intacta (493)
       640 filas
  ❌ read-only: spcs intacta (181)
       210 filas

  42/46 OK

  Muestra de tarjetas (rol · líneas · carreras):
    Jockey                ·  4 línea(s) · C1, C5 · + incentivo por reunión
    Propietario           ·  1 línea(s) · C5
    Propietario           ·  1 línea(s) · C5
    Entrenador            ·  9 línea(s) · C1, C2, C3
    Jockey                ·  4 línea(s) · C1, C2, C3 · + incentivo por reunión
    Jockey                ·  4 línea(s) · C1, C2, C3 · + incentivo por reunión
    Propietario           ·  1 línea(s) · C4
    Propietario           ·  1 línea(s) · C3
    Propietario           ·  1 línea(s) · C5
    Propietario           ·  1 línea(s) · C2
    Propietario           ·  1 línea(s) · C5
    Jockey                ·  1 línea(s) · incentivo por reunión

exit 1
```

### `node tests/probe_pagos_rol_carrera.mjs` — con el `liquidaciones.html` de `main` (`git show main:liquidaciones.html > liquidaciones.html`, corrida, `git checkout liquidaciones.html`)
```

=== probe_pagos_rol_carrera — rol y nº de carrera en el tab Pagos ===

  ✅ 1a) cobrosBuscar trae descripcion y concepto_tipo (rol) y carrera_id
       id,beneficiario_tipo,beneficiario_id,monto_neto,reunion_id,inscripcion_id,carrera_id,descripcion,concepto,concepto_tipo,liquidaciones(club_id)
  ❌ 1a) cobrosDetalle trae las 3 columnas del rol + carrera_id
  ✅ 1b) la tabla de pagables N009 columna Rol
  ✅ 1b) los colspan acompañan la columna nueva (8 y 7)
  ✅ 1b) la tabla de retenidas también rotula el rol
  ✅ 1c) la tarjeta usa etiquetaRoles y etiquetaCarreras, no ${g.tipo} pelado
  ✅ 2e) el detalle N009 el respaldo ?? carrera_id
  ✅ 2e) el recibo N009 el respaldo ?? carrera_id
  ✅ 2a) sigue sin haber offsets artificiales en el módulo
  ✅ 1d) rolDeLinea no dice "N033"
  ✅ 1d) etiquetaRoles no reescribe el vocabulario
  ✅ hay líneas pagables para probar
       63 líneas
  ✅ 1d) todo rol derivado está en {Propietario, Entrenador, Jockey}
       Entrenador / Propietario / Jockey
  ✅ 1e) ninguna línea cae al genérico "Profesional"
  ✅ 1e) ninguna tarjeta muestra el genérico "profesional"
  ❌ 1c) hay al menos un beneficiario con más de un rol (si no, el test no prueba nada)
       0 de 27 beneficiarios
  ✅ 1c) los mono-rol siguen mostrando exactamente su rol
  ✅ 2b) ordena numérico: C1, C2, C3, C10, C12
       C1, C2, C3, C10, C12
  ✅ 2b) un sort textual habría dado otra cosa (el test es sensible)
  ✅ 2c) sólo-sin-carrera → "incentivo por reunión"
  ✅ 2c) mixto → carreras + el rótulo
  ✅ 2c) sólo-carreras → sin rótulo de más
  ✅ 2c) ninguna tarjeta N034 queda con la N035 vacía o en "—"
  ✅ 2c) los beneficiarios sin ninguna carrera son incentivo de jockey y quedan rotulados
       2 beneficiarios
  ✅ 2c) y todas sus líneas son incentivo_jockey (no es que se perdió el dato)
  ✅ 2a) toda línea con carrera se resuelve como numero_carrera_programa ?? numero_turno
       57 líneas con carrera, 0 mal
  ✅ 2a) el fallback a numero_turno se ejerce de verdad (hay carreras sin numero_carrera_programa)
       3 de 7 carreras usan el fallback
  ✅ 2d) el set de carreras de cada tarjeta coincide con la base
       27 beneficiarios, 0 con diferencia
  ✅ C0) las vars del cache son de módulo, al lado de cobCaballerizas
  ✅ C0) el bloque invalida cuando cambia la reunión
  ✅ C0) el bloque pide sólo lo que falta (no el universo entero)
  ✅ C1) primera búsqueda de la reunión: consulta inscripciones y carreras
       inscripciones + carreras
  ✅ C1) y resuelve igual que el camino sin cache
  ✅ C2) tecleando lo mismo en la misma reunión: CERO viajes al servidor
       0 consultas
  ✅ C2) y el resultado no cambió
  ✅ C3) al ampliar el conjunto pide sólo los ids nuevos, no los ya cacheados
       17 ids pedidos en 2 consultas
  ✅ C3) y el mapa ampliado sigue coincidiendo con la base
  ✅ C4) repetir la búsqueda completa: CERO viajes
       0 consultas
  ✅ C4) y sigue resolviendo N036
  ✅ C5) el id que no existe se pide una vez y queda cacheado en negativo
       0 consultas en la segunda vuelta
  ✅ C6) cambiar de reunión invalida el cache y vuelve a consultar
       2 consultas, scope = R2
  ✅ C6) el scope guardado es la reunión nueva
  ✅ C6) los mapas rearmados vuelven a coincidir con la base
  ✅ C6) y la reunión nueva también cachea (segunda tecla: cero viajes)
       0 consultas
  ❌ read-only: liquidacion_detalle intacta (493)
       640 filas
  ❌ read-only: spcs intacta (181)
       210 filas

  42/46 OK

  Muestra de tarjetas (rol · líneas · carreras):
    Jockey                ·  4 línea(s) · C1, C5 · + incentivo por reunión
    Propietario           ·  1 línea(s) · C5
    Propietario           ·  1 línea(s) · C5
    Entrenador            ·  9 línea(s) · C1, C2, C3
    Jockey                ·  4 línea(s) · C1, C2, C3 · + incentivo por reunión
    Jockey                ·  4 línea(s) · C1, C2, C3 · + incentivo por reunión
    Propietario           ·  1 línea(s) · C4
    Propietario           ·  1 línea(s) · C3
    Propietario           ·  1 línea(s) · C5
    Propietario           ·  1 línea(s) · C2
    Propietario           ·  1 línea(s) · C5
    Jockey                ·  1 línea(s) · incentivo por reunión

exit 1
```

### Regla dura: el diff no escribe
```
$ git diff main...HEAD -- liquidaciones.html | grep -nE "^\+.*\.(insert|update|delete|upsert|rpc)\("
grep writes exit 1 (1 = ninguna)
```

### Nada desplegado: prod = `main`
```
$ curl -s "https://sigh.com.ar/liquidaciones.html?v=$RANDOM" -o prod.html; git show main:liquidaciones.html > main.html; git show HEAD:liquidaciones.html > rama.html; md5sum ...
b5e3f4e38684d7bf4761fc1f8910a7d6  prod.html
b5e3f4e38684d7bf4761fc1f8910a7d6  main.html
99dfdc0f81524fe4da9c5d51a873fee0  rama.html
```

### `git diff --stat main...HEAD`
```
 CHANGELOG.md                                  |  20 ++
 CLAUDE.md                                     |   1 +
 liquidaciones.html                            | 207 +++++++++++++---
 tests/probe_pagos_vista_carrera.mjs           |  48 +++-
 tests/probe_pagos_vista_incentivo_pagados.mjs | 335 ++++++++++++++++++++++++++
 5 files changed, 562 insertions(+), 49 deletions(-)
```

## Preguntas abiertas

1. ¿Van bien ", K regularizado" y "pagado" en vez de "todo pagado" cuando hay retenidas? (decisiones 1 y 2)
2. **Cuándo mergear:** el merge a `main` despliega. Queda para cuando Valeria no esté usando Pagos.
3. `probe_pagos_rol_carrera.mjs` tiene 4 ❌ preexistentes (baselines fijos). Conviene actualizarlo aparte.

## Anexo A — diff completo de `liquidaciones.html`
```diff
diff --git a/liquidaciones.html b/liquidaciones.html
index 7d3c8a7..96b636c 100644
--- a/liquidaciones.html
+++ b/liquidaciones.html
@@ -78,6 +78,8 @@
     .cob-lineas { list-style: none; margin: 4px 0 0; padding: 0; font-size: 12px; color: var(--muted); }
     .cob-lineas li { display: flex; justify-content: space-between; gap: 12px; padding: 1px 0; }
     .cob-por-reunion { color: var(--accent); font-size: 11px; }
+    .cob-lineas li.cob-nota { color: var(--muted); font-style: italic; opacity: 0.8; }
+    .cob-pagado { font-size: 11px; color: var(--success); border: 1px solid var(--success); border-radius: 10px; padding: 1px 8px; white-space: nowrap; }
     .btn-impr { background: rgba(180,180,180,0.1); color: var(--muted); border: 1px solid rgba(180,180,180,0.3); }
     .btn-delete { background: rgba(224,82,82,0.1); color: var(--danger); border: 1px solid rgba(224,82,82,0.3); }
     /* DETALLE */
@@ -1140,15 +1142,23 @@ function etiquetaCarreras(g){
 // liquidaciones-engine.js:246-251), así que ningún filtro por carrera la ve. Se la ubica con la
 // MISMA regla que la generó (engine :229-237): J = jockeys titulares de las inscripciones
 // ratificadas de la carrera que largaron (resultado con no_largo=false); la línea entra si es de
-// esta reunión y su beneficiario está en J, y se muestra bajo el caballo que ese jockey montó acá,
-// rotulada "por reunión — se paga una vez" (si corrió en la 2 y en la 5 aparece en las dos vistas
-// y desaparece de las dos al pagarse). Es el inverso exacto de la generación: no puede aparecer
-// bajo un jockey que no corrió acá, y en una carrera sin resultado J es vacío.
+// esta reunión y su beneficiario está en J. Es el inverso exacto de la generación: no puede
+// aparecer bajo un jockey que no corrió acá, y en una carrera sin resultado J es vacío.
+// UNA SOLA CARRERA (24/09): hasta acá la línea se mostraba, con importe, en CADA carrera donde el
+// jockey corrió — la misma línea, sumada al "Pagable" de dos caballos (R9: $1.028.700 sumando
+// carreras contra $908.700 reales). Ahora el importe va sólo en la carrera DUEÑA — la de número
+// más bajo en que ese jockey largó (cobDuenosIncentivo) — y en las otras queda una nota gris sin
+// importe ni botón: "Incentivo por reunión: figura en la carrera N". Sumar las carreras da lo real.
+//
+// PAGADO (24/09): lo ya cobrado se muestra donde estaba el botón. Por beneficiario, un chip por
+// recibo ("✓ Transferido · Rec. #N" / "✓ Efectivo · Rec. #N") o "✓ Pagado (regularizado)" si está
+// saldado sin recibo (GOTCHA #74: plata comprometida = recibo_id OR 'pagado'). Recibo anulado no
+// cuenta. Lo pagado NO entra en ningún total: los totales siguen siendo sólo lo pagable.
 const ORDEN_ROLES_VISTA = ['Propietario', 'Entrenador', 'Jockey', 'Otros'];
 const ORDEN_CONCEPTO_VISTA = { premio:0, bono:1, incentivo_entrenador:2, incentivo_jockey:2, actuacion:3 };
 let cobVistaCache = {};   // carrera_id → { ts, inscs } (60 s: una consulta por carrera, no por tecla)
+let cobDuenoCache = {};   // reunion_id → { ts, duenos } (mismo TTL)
 const COB_VISTA_TTL_MS = 60000;
-
 // Rol de la línea DENTRO del bloque del caballo. rolDeLinea resuelve bono/incentivos/premio por
 // el texto; lo que no resuelve (p.ej. 'actuacion' de peón/capataz/sereno) se cruza con la
 // inscripción: cobra el entrenador → va bajo Entrenador, que es donde se paga. Lo que no cae en
@@ -1182,11 +1192,78 @@ async function cobInscripcionesCarrera(carreraId){
   return inscs;
 }
 
+// Carrera DUEÑA del incentivo de cada jockey: la de número más bajo (programa ?? turno; a igual
+// número, turno más bajo) en que largó. Pura: recibe las carreras no anuladas de la reunión y sus
+// inscripciones ratificadas con `largo` ya resuelto con la misma regla que cobInscripcionesCarrera.
+// → Map jockey_id → { carrera_id, nro }
+function cobDuenosIncentivo(carreras, inscs){
+  const car = {};
+  for (const c of carreras) car[c.id] = { nro: c.numero_carrera_programa ?? c.numero_turno ?? Infinity, turno: c.numero_turno ?? Infinity };
+  const duenos = new Map();
+  for (const i of inscs) {
+    const c = car[i.carrera_id];
+    if (!c || !i.largo || !i.jockey_titular_id) continue;
+    const prev = duenos.get(i.jockey_titular_id);
+    if (!prev || c.nro < prev.nro || (c.nro === prev.nro && c.turno < prev.turno))
+      duenos.set(i.jockey_titular_id, { carrera_id: i.carrera_id, nro: c.nro, turno: c.turno });
+  }
+  return duenos;
+}
+
+async function cobDuenosReunion(reunionId){
+  const c = cobDuenoCache[reunionId];
+  if (c && Date.now() - c.ts < COB_VISTA_TTL_MS) return c.duenos;
+  const { data: cars, error } = await sb.from('carreras').select('id,numero_turno,numero_carrera_programa')
+    .eq('reunion_id', reunionId).or('estado.is.null,estado.neq.anulada');
+  if (error) { console.error('[cobVistaCarrera/carreras]', error); throw error; }
+  const ids = (cars||[]).map(x => x.id);
+  let inscs = [];
+  if (ids.length) {
+    const { data, error: eI } = await sb.from('inscripciones')
+      .select('carrera_id,jockey_titular_id,resultado_posiciones(no_largo)')
+      .in('carrera_id', ids).eq('estado', 'ratificado');
+    if (eI) { console.error('[cobVistaCarrera/montas]', eI); throw eI; }
+    inscs = (data||[]).map(i => {
+      const rp = Array.isArray(i.resultado_posiciones) ? i.resultado_posiciones[0] : i.resultado_posiciones;
+      return { carrera_id: i.carrera_id, jockey_titular_id: i.jockey_titular_id, largo: !!rp && rp.no_largo === false };
+    });
+  }
+  const duenos = cobDuenosIncentivo(cars||[], inscs);
+  cobDuenoCache[reunionId] = { ts: Date.now(), duenos };
+  return duenos;
+}
+
+// Cómo se pagó una línea comprometida, o null si no cuenta como pagada. Con recibo: el recibo
+// manda (forma de pago y número); si está anulado, no cuenta. Sin recibo y 'pagado': saldado
+// administrativo (regularizado). recibos viene embebido 0..1 por recibo_id.
+function cobPagoDeLinea(l){
+  if (l.recibo_id) {
+    const r = Array.isArray(l.recibos) ? l.recibos[0] : l.recibos;
+    if (!r || r.estado === 'anulado') return null;
+    return { tipo: r.forma_pago === 'transferencia' ? 'transferencia' : 'efectivo', recibo_id: l.recibo_id, nro: r.numero_recibo };
+  }
+  return l.estado_linea === 'pagado' ? { tipo: 'regularizado' } : null;
+}
+// Filas crudas → líneas pagadas del club, marcadas con _pago. Pura (la prueba el probe).
+function cobMarcarPagadas(filas){
+  return (filas||[]).filter(cobDelClub).map(l => ({ ...l, _pago: cobPagoDeLinea(l) })).filter(l => l._pago);
+}
+async function cobLineasPagadasReunion(reunionId){
+  const { data, error } = await sb.from('liquidacion_detalle')
+    .select('id,beneficiario_tipo,beneficiario_id,monto_neto,reunion_id,inscripcion_id,carrera_id,descripcion,concepto,concepto_tipo,estado_linea,recibo_id,recibos(numero_recibo,forma_pago,estado),liquidaciones(club_id)')
+    .eq('reunion_id', reunionId).neq('beneficiario_tipo', 'club')
+    .or('recibo_id.not.is.null,estado_linea.eq.pagado');
+  if (error) { console.error('[cobVistaCarrera/pagadas]', error); throw error; }
+  return cobMarcarPagadas(data);
+}
+
 // Selección de las líneas de la carrera. Las tres puertas, en este orden:
 //   1. inscripcion_id de la carrera            → premio, bono, incentivo_entrenador, actuacion
 //   2. sin inscripción pero con carrera_id     → las líneas históricas de premio/bono sin inscripción
 //   3. incentivo_jockey de esta reunión cuyo beneficiario está en J (los que largaron acá)
-// Sin Set.has(null) en ningún lado: la 1 es falsa para null y la 3 no lo usa.
+// Sin Set.has(null) en ningún lado: la 1 es falsa para null y la 3 no lo usa. Recibe pagables y
+// pagadas juntas (las pagadas traen _pago); si el incentivo va con importe o como nota lo decide
+// el armado, con la carrera dueña.
 function cobLineasDeCarrera(lineas, carreraId, reunionId, inscs){
   const inscIds = new Set(inscs.map(i => i.id));
   const J = new Set(inscs.filter(i => i.largo && i.jockey_titular_id).map(i => i.jockey_titular_id));
@@ -1198,22 +1275,36 @@ function cobLineasDeCarrera(lineas, carreraId, reunionId, inscs){
 
 // Armado: bloques por caballo (posición ASC, los sin posición al final por gatera), dentro de
 // cada uno los roles en ORDEN_ROLES_VISTA, dentro del rol un sub-bloque por beneficiario, dentro
-// del beneficiario las líneas por ORDEN_CONCEPTO_VISTA. Devuelve datos, no HTML (lo prueba el probe).
-function cobArmarVistaCarrera(lineasCarrera, inscs, carreraId){
+// del beneficiario las líneas pagables por ORDEN_CONCEPTO_VISTA, sus pagos (chips) y sus notas.
+// Devuelve datos, no HTML (lo prueba el probe). `duenos` = cobDuenosIncentivo; sin dueño conocido
+// el incentivo va con importe (plata que no se ve es plata que no se paga).
+function cobArmarVistaCarrera(lineasCarrera, inscs, carreraId, duenos){
+  const nuevo = insc => ({ insc, roles:{}, total:0, n:0, pagos:[] });
   const porInsc = {};
-  for (const i of inscs) porInsc[i.id] = { insc:i, roles:{}, total:0, n:0 };
-  const sueltas = { insc:null, roles:{}, total:0, n:0 };   // líneas sin inscripción (puerta 2)
-  const meter = (bloque, l, rol) => {
+  for (const i of inscs) porInsc[i.id] = nuevo(i);
+  const sueltas = nuevo(null);   // líneas sin inscripción (puerta 2)
+  const k = l => `${l.beneficiario_tipo}|${l.beneficiario_id}`;
+  const benef = (bloque, l, rol) => {
     const r = (bloque.roles[rol] ||= {});
-    const k = `${l.beneficiario_tipo}|${l.beneficiario_id}`;
-    const b = (r[k] ||= { tipo:l.beneficiario_tipo, id:l.beneficiario_id, nombre:nombreBenef(l.beneficiario_tipo, l.beneficiario_id), lineas:[], total:0 });
+    return (r[k(l)] ||= { tipo:l.beneficiario_tipo, id:l.beneficiario_id, nombre:nombreBenef(l.beneficiario_tipo, l.beneficiario_id), lineas:[], pagos:[], notas:[], total:0 });
+  };
+  const meter = (bloque, l, rol) => {
+    const b = benef(bloque, l, rol);
+    if (l._pago) { b.pagos.push(l._pago); bloque.pagos.push({ ...l._pago, benef: k(l) }); return; }
     b.lineas.push(l); b.total += parseFloat(l.monto_neto)||0;
     bloque.total += parseFloat(l.monto_neto)||0; bloque.n++;
   };
   for (const l of lineasCarrera) {
     if (l.concepto_tipo === 'incentivo_jockey') {
-      // bajo CADA caballo que ese jockey montó y largó en esta carrera
-      for (const i of inscs) if (i.largo && i.jockey_titular_id === l.beneficiario_id) meter(porInsc[i.id], l, 'Jockey');
+      // bajo el caballo que ese jockey montó y largó acá: con importe sólo en la carrera dueña
+      const d = duenos?.get(l.beneficiario_id);
+      const esDuena = !d || d.carrera_id === carreraId;
+      for (const i of inscs) if (i.largo && i.jockey_titular_id === l.beneficiario_id) {
+        if (esDuena) { meter(porInsc[i.id], l, 'Jockey'); continue; }
+        const nota = `Incentivo por reunión: figura en la carrera ${d.nro}`;
+        const b = benef(porInsc[i.id], l, 'Jockey');
+        if (!b.notas.includes(nota)) b.notas.push(nota);
+      }
       continue;
     }
     const bloque = porInsc[l.inscripcion_id] || sueltas;
@@ -1227,11 +1318,37 @@ function cobArmarVistaCarrera(lineasCarrera, inscs, carreraId){
   }));
   const bloques = Object.values(porInsc)
     .sort((a, b) => (a.insc.posicion ?? 999) - (b.insc.posicion ?? 999) || (a.insc.numero_partidor ?? 999) - (b.insc.numero_partidor ?? 999))
-    .map(b => ({ insc:b.insc, total:b.total, n:b.n, roles: ordenar(b) }));
-  if (sueltas.n) bloques.push({ insc:null, total:sueltas.total, n:sueltas.n, roles: ordenar(sueltas) });
+    .map(b => ({ insc:b.insc, total:b.total, n:b.n, pagos:b.pagos, roles: ordenar(b) }));
+  if (sueltas.n || sueltas.pagos.length) bloques.push({ insc:null, total:sueltas.total, n:sueltas.n, pagos:sueltas.pagos, roles: ordenar(sueltas) });
   return bloques;
 }
 
+// Chips de lo pagado de UN beneficiario: uno por recibo (no por línea) y uno solo de regularizado.
+function cobChipsPago(pagos){
+  const chips = [], vistos = new Set();
+  for (const p of pagos) {
+    if (p.tipo === 'regularizado') { if (!vistos.has('reg')) { vistos.add('reg'); chips.push('✓ Pagado (regularizado)'); } continue; }
+    if (vistos.has(p.recibo_id)) continue;
+    vistos.add(p.recibo_id);
+    chips.push(`✓ ${p.tipo === 'transferencia' ? 'Transferido' : 'Efectivo'} · Rec. #${p.nro}`);
+  }
+  return chips;
+}
+
+// Rótulo del caballo sin nada pagable: "todo pagado (N transferencia, M efectivo)" si hubo pagos
+// (N y M cuentan RECIBOS; los saldados sin recibo se agregan como "K regularizado", K = personas),
+// "Sin deuda pagable" a secas si nunca hubo líneas. Con retenidas del caballo no es "todo": queda
+// plata por habilitar (doping), así que dice "pagado (…)".
+function cobRotuloSinDeuda(bloque, retenidas){
+  if (!bloque.pagos.length) return 'Sin deuda pagable';
+  const rec = { transferencia: new Set(), efectivo: new Set() }, reg = new Set();
+  for (const p of bloque.pagos) {
+    if (p.tipo === 'regularizado') reg.add(p.benef); else rec[p.tipo].add(p.recibo_id);
+  }
+  const partes = `${rec.transferencia.size} transferencia, ${rec.efectivo.size} efectivo${reg.size ? `, ${reg.size} regularizado` : ''}`;
+  return `Sin deuda pagable · ${retenidas ? 'pagado' : 'todo pagado'} (${partes})`;
+}
+
 // q en la vista filtra BLOQUES: pasa el caballo si su nombre matchea o si algún beneficiario del
 // bloque matchea (nombre/DNI o caballeriza, igual que en tarjetas).
 function cobBloqueMatch(bloque, q, propIdsPorCaballeriza){
@@ -1240,6 +1357,31 @@ function cobBloqueMatch(bloque, q, propIdsPorCaballeriza){
   return bloque.roles.some(r => r.beneficiarios.some(b => cobMatch(q, benefSearch(b.tipo, b.id)) || propIdsPorCaballeriza.has(b.id)));
 }
 
+// HTML de la vista. Pura (datos → string): el probe la corre con bloques sintéticos para los chips.
+function cobHtmlVistaCarrera(bloques, retenidas){
+  const puesto = i => !i ? 'Sin inscripción' : i.posicion != null ? `${i.posicion}°` : (i.no_largo ? 'NL' : '—');
+  const rotuloLinea = l => l.concepto_tipo === 'incentivo_jockey'
+    ? `${escapeHtml(l.concepto || 'Incentivo jockey')} <span class="cob-por-reunion">· Incentivo por reunión — se paga una sola vez</span>`
+    : escapeHtml(l.concepto || l.descripcion || l.concepto_tipo || '');
+  const ret = b => (b.insc && retenidas[b.insc.id]) || 0;
+  return `<div class="liq-grid cob-vista">${bloques.map(b => `<div class="liq-card cob-caballo${b.n ? '' : ' cob-caballo-vacio'}">
+    <div class="liq-header">
+      <div><div class="liq-prof">${escapeHtml(puesto(b.insc))} · ${escapeHtml(b.insc?.caballo || 'líneas sin inscripción')}</div>
+        <div class="liq-recibo">${b.n ? `${b.n} línea(s) pagable(s)` : escapeHtml(cobRotuloSinDeuda(b, ret(b)))}${ret(b) ? ` · 🔒 ${ret(b)} retenida(s) — habilitar desde Pagar` : ''}</div></div>
+      ${b.n ? `<div class="monto-item"><div class="monto-lbl">Pagable</div><div class="monto-val neto">${fmt(b.total)}</div></div>` : ''}
+    </div>
+    ${b.roles.map(r => `<div class="cob-rol"><div class="cob-rol-titulo">${escapeHtml(r.rol)}</div>
+      ${r.beneficiarios.map(be => `<div class="cob-benef">
+        <div class="cob-benef-cab"><span class="cob-benef-nombre">${escapeHtml(be.nombre)}</span>
+          ${be.lineas.length ? `<span class="cob-benef-total">${fmt(be.total)}</span>` : ''}
+          ${cobChipsPago(be.pagos).map(c => `<span class="cob-pagado">${escapeHtml(c)}</span>`).join('')}
+          ${be.lineas.length ? `<button class="btn-sm btn-pagar" onclick="cobrosDetalle('${be.tipo}','${be.id}')">🧾 Pagar</button>` : ''}</div>
+        <ul class="cob-lineas">${be.lineas.map(l => `<li><span>${rotuloLinea(l)}</span><span>${fmt(l.monto_neto)}</span></li>`).join('')}${be.notas.map(n => `<li class="cob-nota"><span>${escapeHtml(n)}</span></li>`).join('')}</ul>
+      </div>`).join('')}
+    </div>`).join('')}
+  </div>`).join('')}</div>`;
+}
+
 async function cobRenderVistaCarrera(lineas, carreraId, rid, q, propIdsPorCaballeriza){
   const cont = document.getElementById('cob-beneficiarios');
   let inscs;
@@ -1248,7 +1390,14 @@ async function cobRenderVistaCarrera(lineas, carreraId, rid, q, propIdsPorCaball
   // reunión de la carrera: la del selector (el select de carreras sólo se llena con reunión elegida);
   // de respaldo, la de las propias líneas.
   const reunionId = rid || lineas.find(l => l.inscripcion_id && inscs.some(i => i.id === l.inscripcion_id))?.reunion_id || null;
-  const lineasCarrera = cobLineasDeCarrera(lineas, carreraId, reunionId, inscs);
+  // Dueña del incentivo + lo ya pagado. Si falla, no se rinde nada: sin dueños el incentivo
+  // volvería a sumarse en cada carrera, y sin pagadas los chips mentirían "nunca hubo pagos".
+  let duenos = new Map(), pagadas = [];
+  if (reunionId) {
+    try { [duenos, pagadas] = await Promise.all([cobDuenosReunion(reunionId), cobLineasPagadasReunion(reunionId)]); }
+    catch (e) { toast(e.message, 'error'); cont.innerHTML = ''; return; }
+  }
+  const lineasCarrera = cobLineasDeCarrera([...lineas, ...pagadas], carreraId, reunionId, inscs);
   // Retenidas (1° y 2°, doping) por caballo: sólo el contador — se habilitan desde Pagar, como hoy.
   const retenidas = {};
   if (inscs.length) {
@@ -1258,30 +1407,12 @@ async function cobRenderVistaCarrera(lineas, carreraId, rid, q, propIdsPorCaball
     if (eRet) console.error('[cobVistaCarrera/retenidas]', eRet);
     for (const l of (ret||[])) if (cobDelClub(l)) retenidas[l.inscripcion_id] = (retenidas[l.inscripcion_id]||0) + 1;
   }
-  const bloques = cobArmarVistaCarrera(lineasCarrera, inscs, carreraId).filter(b => cobBloqueMatch(b, q, propIdsPorCaballeriza));
+  const bloques = cobArmarVistaCarrera(lineasCarrera, inscs, carreraId, duenos).filter(b => cobBloqueMatch(b, q, propIdsPorCaballeriza));
   if (!bloques.length) {
     cont.innerHTML = `<div class="empty-state"><div class="icon">∅</div><h3>${inscs.length ? 'Ningún caballo de esta carrera para esa búsqueda' : 'Esta carrera no tiene inscripciones ratificadas'}</h3></div>`;
     return;
   }
-  const puesto = i => !i ? 'Sin inscripción' : i.posicion != null ? `${i.posicion}°` : (i.no_largo ? 'NL' : '—');
-  const rotuloLinea = l => l.concepto_tipo === 'incentivo_jockey'
-    ? `${escapeHtml(l.concepto || 'Incentivo jockey')} <span class="cob-por-reunion">· por reunión — se paga una vez</span>`
-    : escapeHtml(l.concepto || l.descripcion || l.concepto_tipo || '');
-  cont.innerHTML = `<div class="liq-grid cob-vista">${bloques.map(b => `<div class="liq-card cob-caballo${b.n ? '' : ' cob-caballo-vacio'}">
-    <div class="liq-header">
-      <div><div class="liq-prof">${escapeHtml(puesto(b.insc))} · ${escapeHtml(b.insc?.caballo || 'líneas sin inscripción')}</div>
-        <div class="liq-recibo">${b.n ? `${b.n} línea(s) pagable(s)` : 'sin deuda pagable'}${b.insc && retenidas[b.insc.id] ? ` · 🔒 ${retenidas[b.insc.id]} retenida(s) — habilitar desde Pagar` : ''}</div></div>
-      ${b.n ? `<div class="monto-item"><div class="monto-lbl">Pagable</div><div class="monto-val neto">${fmt(b.total)}</div></div>` : ''}
-    </div>
-    ${b.roles.map(r => `<div class="cob-rol"><div class="cob-rol-titulo">${escapeHtml(r.rol)}</div>
-      ${r.beneficiarios.map(be => `<div class="cob-benef">
-        <div class="cob-benef-cab"><span class="cob-benef-nombre">${escapeHtml(be.nombre)}</span>
-          <span class="cob-benef-total">${fmt(be.total)}</span>
-          <button class="btn-sm btn-pagar" onclick="cobrosDetalle('${be.tipo}','${be.id}')">🧾 Pagar</button></div>
-        <ul class="cob-lineas">${be.lineas.map(l => `<li><span>${rotuloLinea(l)}</span><span>${fmt(l.monto_neto)}</span></li>`).join('')}</ul>
-      </div>`).join('')}
-    </div>`).join('')}
-  </div>`).join('')}</div>`;
+  cont.innerHTML = cobHtmlVistaCarrera(bloques, retenidas);
 }
 // ═══ VISTA POR CARRERA — FIN ═══
 
```

## Anexo B — script de anonimización (`anon.mjs`, se corrió copiado a `tests/` y se borró)
```js
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const sb = createClient('https://unlhcuanfrtpatoipwve.supabase.co', process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const OUT = process.argv[2];
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const all = async (t, cols) => { let r = [], from = 0; for (;;) { const { data, error } = await sb.from(t).select(cols).range(from, from + 999); if (error) throw error; r = r.concat(data); if (data.length < 1000) return r; from += 1000; } };
const [pr, pp, cb, sp, us] = await Promise.all([all('profesionales', 'apellido,nombre'), all('propietarios', 'nombre,nombre_stud'), all('caballerizas', 'nombre'), all('spcs', 'nombre'), all('usuarios', 'nombre_completo')]);
const textos = [...pr.flatMap(p => [p.apellido, p.nombre]), ...pp.flatMap(p => [p.nombre, p.nombre_stud]), ...cb.map(c => c.nombre), ...sp.map(s => s.nombre), ...us.map(u => u.nombre_completo)].filter(Boolean);
const fuentes = ['tests/probe_pagos_vista_incentivo_pagados.mjs', 'tests/probe_pagos_vista_carrera.mjs', 'tests/probe_pagos_carrera_busqueda.mjs', 'tests/probe_pagos_rol_carrera.mjs', 'liquidaciones.html', 'CHANGELOG.md'].map(f => readFileSync(f, 'utf8')).join(' ');
const STOP = new Set(norm(fuentes).match(/[A-ZÑ]{2,}/g));
['DEL', 'DE', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'SA', 'SRL', 'STUD', 'HARAS'].forEach(w => STOP.add(w));
// un apellido o un nombre de caballo de una sola palabra NUNCA es "de oficio", aunque lo nombre un probe
for (const w of [...pr.map(p => p.apellido), ...sp.map(s => s.nombre).filter(n => !/\s/.test(n.trim()))].filter(Boolean).flatMap(t => norm(t).match(/[A-ZÑ]{3,}/g) || []))
  if (!['JOCKEY', 'PRUEBA', 'STUD', 'CABALLERIZA'].includes(w)) STOP.delete(w);
// nombres de pila y palabras largas de nombres de caballo: fuera del stoplist salvo que sean vocabulario del módulo
for (const w of [...pr.map(p => p.nombre), ...sp.map(s => s.nombre)].filter(Boolean).flatMap(t => norm(t).match(/[A-ZÑ]{4,}/g) || []))
  if (!/^(CARRERA|JOCKEY|PREMIO|PUESTO|NUEVO|NUEVA|PRUEBA|ESTADO|LINEAS|LINEA|TOTAL|RECIBO|NUMERO|TURNO|PAGADO|OFICIAL)$/.test(w)) STOP.delete(w);
const palabras = new Set();
for (const t of textos) for (const w of norm(t).match(/[A-Z0-9Ñ']{3,}/g) || []) if (!STOP.has(w) && !/^\d+$/.test(w)) palabras.add(w);
const tok = new Map(); let n = 0;
const token = w => { if (!tok.has(w)) tok.set(w, `N${String(++n).padStart(3, '0')}`); return tok.get(w); };
const residuales = new Set();
let nf = 0;
const frases = [...new Set([...sp.map(x => x.nombre), ...cb.map(x => x.nombre), ...pp.map(x => x.nombre), ...pp.map(x => x.nombre_stud)].filter(Boolean).map(x => x.trim()).filter(x => x.length >= 3))]
  .sort((a, b) => b.length - a.length).map(f => [f, `F${String(++nf).padStart(3, '0')}`]);
for (const f of process.argv.slice(3)) {
  let s = readFileSync(f, 'utf8');
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>');
  s = s.replace(/q="[^"]*"/g, 'q="<q>"');
  s = s.replace(/(?<![\d.$])\b\d{7,8}\b(?![.\d])/g, '<dni>');
  // frases completas primero (nombre de caballo, caballeriza, propietario), la más larga antes
  for (const [frase, t] of frases) s = s.replace(new RegExp(`(?<![A-Za-zÑñ])${frase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}(?![A-Za-zÑñ])`, 'gi'), t);
  s = s.replace(/[A-Za-zÀ-ÿÑñ'’]+/g, w => { const k = norm(w); return palabras.has(k) ? token(k) : w; });
  for (const t of textos) for (const w of norm(t).match(/[A-ZÑ]{4,}/g) || []) if (STOP.has(w) && new RegExp(`\\b${w}\\b`).test(norm(s))) residuales.add(w);
  writeFileSync(f.replace(/\.txt$/, '.anon.txt'), s);
}
writeFileSync(OUT, JSON.stringify({ tokens: tok.size, palabras_de_nombres: palabras.size, residuales_en_stoplist: [...residuales].sort() }, null, 1));
```
