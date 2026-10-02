# Probes de Pagos y del recibo a datos sintéticos — PR #51

- Fecha: 2026-10-02
- Rama: `fix/probes-pagos-recibo-sinteticos`, commit `cb33940c02308662609b76a129476c35da0e2ae2` (desde `origin/main` `d481e68f7195377408cdc9180a8864efe824e3e3`)
- PR: https://github.com/mdqclio/SGH/pull/51 (abierto, sin mergear)
- Guards: pwd del worktree propio (no el checkout principal); proyecto `unlhcuanfrtpatoipwve`. Nada escribe en prod: los 4 probes son de lectura y la parte nueva corre contra un cliente en memoria.

## Qué fallaba y por qué (las 4 corridas de `main`, en el informe del paso 1)

Los 4 son 4, no 3. Fallaban igual en `main`, #46 y #47: el código no cambió, el dato sí.

| probe | asserts rojos en main | dato que cambió |
|---|---|---|
| `probe_pagos_carrera_busqueda` | B11a, B11b, B13 (30/33) | universo pagable de R9: ≥ 10 tarjetas → 5 (31 recibos el 02/10) |
| `probe_pagos_vista_carrera` | 2c, 3, 4, 8 (21/25) | 0 incentivos de jockey impagos en C5; 2c y 4 leían el id del botón Pagar de beneficiarios ya pagados (que no tienen botón) |
| `probe_pagos_vista_incentivo_pagados` | 2c, 2d, 3 (23/26) | 0 incentivos de jockey impagos en R9; 3 seguía a un jockey real por nombre que cobró |
| `probe_recibo_una_hoja` | 2c, 3d (17/19) | el recibo de referencia ("el de más líneas de los últimos 60") pasó a ser una TRANSFERENCIA: no lleva firma (2c) y es más alto (3d: 9 líneas → 274,7 mm > 267) |

## Qué se cambió

- `tests/lib/sb_fixture.mjs` (nuevo): cliente de Supabase en memoria, sólo lectura (embeds de un nivel, eq/neq/is/in/not/or, order/limit/single, count head). Insert/update/delete/rpc tiran error.
- `tests/lib/pagos_sintetico.mjs` (nuevo): reunión sintética con los casos fijos (caballo con los tres roles, misma persona en dos roles, incentivos con importe / con nota / NL / pagado por transferencia, chips de efectivo / transferencia / regularizado, una retenida, ruido de otro club y de una reunión sandbox, ≥ 10 beneficiarios). Nombres inventados (SINT / FICTICIO), documentos `D-9xx`. `reciboSintetico(...)`: recibo de 4 líneas, efectivo o transferencia.
- Búsqueda: B11–B13 contra la sintética; nuevo B13b (la línea de otro club se descarta con el aviso de ISSUE-060). La Parte A (select de carreras) sigue contra R9/R6 reales: carreras y estados no cambian con los cobros.
- Vista por carrera e incentivos: la sección corre dos veces — `[S]` sintética, estricta; `[R9]` real, con "si hay, está bien" sólo en los asserts que necesitan algo impago (2b, 2c, 3, 3d, 4, 8, 10 / 2c, 2d, 3, 3b, 3c, 4). El 3 de incentivos dejó de nombrar a un jockey real: ahora es la regla para todos los de una monta con incentivo pagable.
- 2c y 4 de la vista miran sólo beneficiarios con botón Pagar (bug del probe que el cobro destapó).
- Recibo: Parte 2 y 3 sobre el recibo sintético (efectivo); 2c' nuevo para transferencia (sin firma, con leyenda y comprobante dentro del pie). `render_recibo_pdf.mjs --fixture=ruta.json` para medir con Chromium. Con `[numero_recibo]` se sigue pudiendo medir uno real.
- `CLAUDE.md` (líneas de estos 4 probes + render) y `CHANGELOG.md`.

## Resultados

| probe | antes (main) | después | mutantes |
|---|---|---|---|
| probe_pagos_carrera_busqueda | 30/33 | 43/43 | 8/8 |
| probe_pagos_vista_carrera | 21/25 | 47/47 | 7/7 (todos mueren en `[S]`) |
| probe_pagos_vista_incentivo_pagados | 23/26 | 36/36 | 17/17 (todos mueren en `[S]`/puras) |
| probe_recibo_una_hoja | 17/19 | 20/20 | 8/8 |

Los mutantes son los mismos de antes, aplicados sobre el `liquidaciones.html` de `main` (que este PR no toca): siguen muriendo.

`REPO=<worktree> tests/correr_todos.sh`: **31 verdes · 12 rojos conocidos · 0 rojos nuevos · 0 ausentes** (rc=0).

## Observación abierta (no se toca en este PR)

Un recibo de **transferencia** de 9 líneas no entra en una hoja (recibo real del 02/10: fin del duplicado 274,7 mm > 267 mm); el de efectivo de 9 líneas sí (sintético: 265,7 mm). El corte a la mitad (23/09) se calibró con efectivo. ¿Hace falta que la transferencia de 9 líneas también vaya en una hoja?

## Anexo — salida cruda

Anonimizada para el repo público: en las líneas `[R9]` se omitió el detalle después de `→` (trae nombres de beneficiarios reales); en las `[S]`/`[puras]` se omitieron los volcados JSON largos de la vista sintética; las rutas de /tmp van como `<tmp>`. Los nombres de las líneas `[S]` son inventados.

### probe_pagos_carrera_busqueda — main (antes), sólo los rojos

```
❌ B11a) hay universo pagable en R9 para armar los casos (≥ 10 tarjetas)  → 5
❌ B11b) se armaron casos de los 4 tipos (compuesto, Ñ, caballeriza, provisorio)  → 6 casos; compuesto=true Ñ=true caballerizas=0 provisorio=true
❌ B13) sin q: el universo de R9 se lista entero (≥ 10 tarjetas)  → 5
30/33 checks OK
```

### probe_pagos_carrera_busqueda — rama (después)

```
✅ A0) ninguna carrera anulada tiene líneas de liquidación (por carrera_id ni por inscripción)  → 10 anuladas, 0 líneas
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
✅ B6) cobMatch: "P y P" encuentra PyP
✅ B6b) cobMatch: pegado encuentra separado (STUDCHICO → stud chico, pyp → "p y p")
✅ B7) cobMatch: apellido solo, DNI y pedazo de caballeriza
✅ B8) cobMatch: NO matchea lo que no está
✅ B9) cobMatch: q vacío matchea todo
✅ B10) cobrosBuscar usa cobMatch en el beneficiario y en la caballeriza
✅ B11a) hay universo pagable en la reunión sintética para armar los casos (≥ 10 tarjetas)  → 15
✅ B11b) se armaron casos de los 4 tipos (compuesto, Ñ, caballeriza, provisorio)  → 15 casos; compuesto=true Ñ=true caballerizas=2 provisorio=true
✅ B11) q="FICTICIO ENTRENADOR" → [detalle con nombres omitidos]
✅ B11) q="ENTRENADOR FICTICIO" → [detalle con nombres omitidos]
✅ B11) q="ficticio entrenador" → [detalle con nombres omitidos]
✅ B11) q="D-901" → [detalle con nombres omitidos]
✅ B11) q="MUNOZPRUEBA" → MUÑOZPRUEBA, JOCKEY  [apellido con Ñ/tilde, tipeado sin]  → [detalle con nombres omitidos]
✅ B11) q="LA CAÑADA FICTICIA" → [detalle con nombres omitidos]
✅ B11) q="LA CANADA FICTICIA" → [detalle con nombres omitidos]
✅ B11) q="LACAÑADAFICTICIA" → [detalle con nombres omitidos]
✅ B11) q="FICTICIA" → [detalle con nombres omitidos]
✅ B11) q="D-910" → [detalle con nombres omitidos]
✅ B11) q="PYPFICTICIA" → [detalle con nombres omitidos]
✅ B11) q="P Y P F I C T I C I A" → [detalle con nombres omitidos]
✅ B11) q="PYPFICTICIA" → [detalle con nombres omitidos]
✅ B11) q="D-912" → [detalle con nombres omitidos]
✅ B11) q="PROVISORIO" → [detalle con nombres omitidos]
✅ B12) q="FICTICIO" trae al pagable y no a los 1 homónimo(s) sin plata  → [detalle con nombres omitidos]
✅ B13b) la línea de OTRO club colgada de una carrera de la reunión se descarta con el aviso de ISSUE-060  → [cobrosBuscar] 1 línea(s) de otro club descartadas (ISSUE-060)
✅ B13) sin q: el universo de la reunión se lista entero (15 tarjetas = beneficiarios con deuda pagable, ≥ 10)  → 15
✅ B14) el matcheo no rompe la búsqueda por caballeriza previa (probe_cobros_caballeriza: benefSearch sigue en crudo)

43/43 checks OK
```

### probe_pagos_carrera_busqueda --mutantes

```
💀 mutante neq_solo       → muerto (5 assert(s))
     ❌ A3) R9: 8 carreras (11 turnos − 3 anulados)  → 7
     ❌ A4) R9: ordenado 1 a 8  → 2,3,4,5,6,7,8
     ❌ A7) R9: el turno 1 (estado NULL, con 27 líneas) SIGUE en el select — el filtro es NULL-safe  → estado=null
💀 mutante sin_filtro     → muerto (7 assert(s))
     ❌ A2) R9: sin rótulos repetidos  → Carrera 1, Carrera 2, Carrera 3, Carrera 4, Carrera 5, Carrera 6, Carrera 7, Carrera 8, Carrera 2, Carrera 8, Carrera 10
     ❌ A3) R9: 8 carreras (11 turnos − 3 anulados)  → 11
     ❌ A4) R9: ordenado 1 a 8  → 1,2,3,4,5,6,7,8,2,8,10
💀 mutante orden_turno    → muerto (2 assert(s))
     ❌ A4) R9: ordenado 1 a 8  → 1,7,2,4,3,5,6,8
     ❌ A9) R6: sin repetidos y ordenado  → 1,2,3,8,6,4,7,5
💀 mutante sin_nfd        → muerto (5 assert(s))
     ❌ B1) cobNorm quita Ñ y tildes, baja a minúsculas
     ❌ B3) cobNorm acepta la Ñ descompuesta (N + U+0303)
     ❌ B5) cobMatch: sin Ñ encuentra con Ñ
💀 mutante substring      → muerto (4 assert(s))
     ❌ B4) cobMatch: palabras sueltas sin orden
     ❌ B11) q="FICTICIO ENTRENADOR" → [detalle con nombres omitidos]
     ❌ B11) q="ENTRENADOR FICTICIO" → [detalle con nombres omitidos]
💀 mutante sin_compacto   → muerto (2 assert(s))
     ❌ B6b) cobMatch: pegado encuentra separado (STUDCHICO → stud chico, pyp → "p y p")
     ❌ B11) q="LACAÑADAFICTICIA" → [detalle con nombres omitidos]
💀 mutante benef_literal  → muerto (5 assert(s))
     ❌ B10) cobrosBuscar usa cobMatch en el beneficiario y en la caballeriza
     ❌ B11) q="FICTICIO ENTRENADOR" → [detalle con nombres omitidos]
     ❌ B11) q="ENTRENADOR FICTICIO" → [detalle con nombres omitidos]
💀 mutante cab_literal    → muerto (3 assert(s))
     ❌ B10) cobrosBuscar usa cobMatch en el beneficiario y en la caballeriza
     ❌ B11) q="LA CANADA FICTICIA" → [detalle con nombres omitidos]
     ❌ B11) q="LACAÑADAFICTICIA" → [detalle con nombres omitidos]

8/8 mutantes muertos
```

### probe_pagos_vista_carrera — main (antes), sólo los rojos

```
❌ 2c) C5: cada rol de ese bloque lleva el beneficiario correcto según la inscripción
❌ 3) C5: los 0 incentivo(s) de jockey pagable(s) de quienes largaron acá aparecen (sin inscripcion_id ni carrera_id) — con importe si C5 es su carrera dueña, como nota si no  → [detalle con nombres omitidos]
❌ 4) C5: una misma persona en dos roles tiene dos botones Pagar (propietario y profesional)  → [detalle con nombres omitidos]
❌ 8) sin carrera: modo tarjetas por persona intacto (≥ 10 tarjetas, sin cob-vista)  → 5 tarjetas
21/25 checks OK
```

### probe_pagos_vista_carrera — rama (después)

```
✅ [S] 1) con carrera elegida se rinde la vista por caballo (no tarjetas liq-prof de persona)
✅ [S] 1b) C5: un bloque por inscripción ratificada (4)  → 4 bloques
✅ [S] 1c) C5: bloques por posición ASC, los que no largaron al final  → [detalle con nombres omitidos]
✅ [S] 1d) C5: el título de cada bloque lleva el puesto (N°) o NL
✅ [S] 2) C5: en todos los bloques los roles van Propietario → Entrenador → Jockey  → [detalle con nombres omitidos]
✅ [S] 2b) C5: hay al menos un bloque con los tres roles  → [detalle con nombres omitidos]
✅ [S] 2c) C5: cada rol de ese bloque lleva el beneficiario correcto según la inscripción
✅ [S] 3) C5: los 2 incentivo(s) de jockey pagable(s) de quienes largaron acá aparecen (sin inscripcion_id ni carrera_id) — con importe si C5 es su carrera dueña, como nota si no  → SINTETICO, DOSMONTAS, SINTETICO, UNAMONTA → [detalle con nombres omitidos]
✅ [S] 3b) C5: cada incentivo está bajo el rol Jockey del caballo que ese jockey montó
✅ [S] 3c) C5: ningún incentivo bajo un jockey que no largó acá
✅ [S] 3d) C5: el incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"; la nota, "figura en la carrera N" (N = dueña)  → Incentivo jockey · Incentivo por reunión — se paga una sola vez | Incentivo por reunión: figura en la carrera 1 | Incentivo por reunión: figura en la carrera 2
✅ [S] 3e) sintético: la nota de la carrera 5 ("figura en la carrera 1") apunta a una carrera donde el incentivo SÍ está, con importe y "se paga una sola vez"  → [JSON de la vista sintética omitido]
✅ [S] 4) C5: una misma persona en dos roles tiene dos botones Pagar (propietario y profesional)  → [detalle con nombres omitidos]
✅ [S] 5) C5: los caballos sin deuda pagable se muestran (apagados, "sin deuda pagable") en vez de desaparecer  → 2 vacíos
✅ [S] 6) C5 q="sint iota" → sólo ese bloque  → [detalle con nombres omitidos]
✅ [S] 6b) C5 q="PROPIETARIO FICTICIO UNO" → sólo los bloques donde está ese beneficiario  → [detalle con nombres omitidos]
✅ [S] 6c) C5 q sin match → 0 bloques
✅ [S] 7) C7 (sin resultado): 2 bloques con "—", todos sin deuda, 0 incentivos (J vacío)  → 2 bloques, J=0
✅ [S] 8) sin carrera: modo tarjetas por persona intacto (≥ 10 tarjetas, sin cob-vista)  → 15 tarjetas
✅ [S] 9) C5: líneas en la vista = líneas por inscripción (9) + incentivos cuya carrera dueña es la 5 (1)  → 10
✅ [S] 9b) C5: la suma de montos de la vista coincide  → $296.500,00 vs $296.500,00
✅ [S] 10) C4: 1 caballo(s) NL cuyo jockey tiene incentivo pagable → el incentivo NO aparece bajo el NL  → [detalle con nombres omitidos]
✅ [S] 10b) C4: los bloques van por posición ASC  → [detalle con nombres omitidos]
✅ [R9] 1) con carrera elegida se rinde la vista por caballo (no tarjetas liq-prof de persona)
✅ [R9] 1b) C5: un bloque por inscripción ratificada (8)  → [detalle de R9 omitido: nombres reales]
✅ [R9] 1c) C5: bloques por posición ASC, los que no largaron al final  → [detalle de R9 omitido: nombres reales]
✅ [R9] 1d) C5: el título de cada bloque lleva el puesto (N°) o NL
✅ [R9] 2) C5: en todos los bloques los roles van Propietario → Entrenador → Jockey  → [detalle con nombres omitidos]
✅ [R9] 2b) C5: hay al menos un bloque con los tres roles  → [detalle de R9 omitido: nombres reales]
✅ [R9] 2c) C5: cada rol de ese bloque lleva el beneficiario correcto según la inscripción
✅ [R9] 3) C5: los 0 incentivo(s) de jockey pagable(s) de quienes largaron acá aparecen (sin inscripcion_id ni carrera_id) — con importe si C5 es su carrera dueña, como nota si no  → [detalle de R9 omitido: nombres reales]
✅ [R9] 3b) C5: cada incentivo está bajo el rol Jockey del caballo que ese jockey montó
✅ [R9] 3c) C5: ningún incentivo bajo un jockey que no largó acá
✅ [R9] 3d) C5: el incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"; la nota, "figura en la carrera N" (N = dueña)  → [detalle de R9 omitido: nombres reales]
✅ [R9] 4) C5: una misma persona en dos roles tiene dos botones Pagar (propietario y profesional)  → [detalle de R9 omitido: nombres reales]
✅ [R9] 5) C5: los caballos sin deuda pagable se muestran (apagados, "sin deuda pagable") en vez de desaparecer  → [detalle de R9 omitido: nombres reales]
✅ [R9] 6) C5 q="[omitido]" → sólo ese bloque  → [detalle de R9 omitido: nombres reales]
✅ [R9] 6b) C5 q="[omitido]" → sólo los bloques donde está ese beneficiario  → [detalle de R9 omitido: nombres reales]
✅ [R9] 6c) C5 q sin match → 0 bloques
✅ [R9] 7) C7 (sin resultado): 13 bloques con "—", todos sin deuda, 0 incentivos (J vacío)  → [detalle de R9 omitido: nombres reales]
✅ [R9] 8) sin carrera: modo tarjetas por persona intacto (tarjetas, sin cob-vista)  → [detalle de R9 omitido: nombres reales]
✅ [R9] 9) C5: líneas en la vista = líneas por inscripción (2) + incentivos cuya carrera dueña es la 5 (0)  → [detalle de R9 omitido: nombres reales]
✅ [R9] 9b) C5: la suma de montos de la vista coincide  → [detalle de R9 omitido: nombres reales]
✅ [R9] 10) C4: 0 caballo(s) NL cuyo jockey tiene incentivo pagable → el incentivo NO aparece bajo el NL  → [detalle de R9 omitido: nombres reales]
✅ [R9] 10b) C4: los bloques van por posición ASC  → [detalle de R9 omitido: nombres reales]
✅ [texto] 11) cobLineasDeCarrera tiene las tres puertas (inscripción / carrera_id / incentivo por J)
✅ [texto] 11b) cobrosBuscar ya no acota por inscFiltro (el filtro viejo que descartaba los incentivos)

47/47 checks OK
```

### probe_pagos_vista_carrera --mutantes

```
💀 mutante j_sin_largo       → muerto (4 assert(s))
     ❌ [S] 3b) C5: cada incentivo está bajo el rol Jockey del caballo que ese jockey montó
     ❌ [S] 3c) C5: ningún incentivo bajo un jockey que no largó acá
     ❌ [R9] 3b) C5: cada incentivo está bajo el rol Jockey del caballo que ese jockey montó
💀 mutante solo_inscripcion  → muerto (5 assert(s))
     ❌ [S] 3) C5: los 2 incentivo(s) de jockey pagable(s) de quienes largaron acá aparecen (sin inscripcion_id ni carrera_id) — con importe si C5 es su carrera dueña, como nota si no  → SINTETICO, DOSMONTAS, SINTETICO, UNAMONTA → 
     ❌ [S] 3d) C5: el incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"; la nota, "figura en la carrera N" (N = dueña)
     ❌ [S] 9) C5: líneas en la vista = líneas por inscripción (9) + incentivos cuya carrera dueña es la 5 (1)  → 9
💀 mutante roles_alfabetico  → muerto (2 assert(s))
     ❌ [S] 2) C5: en todos los bloques los roles van Propietario → Entrenador → Jockey  → [detalle con nombres omitidos]
     ❌ [R9] 2) C5: en todos los bloques los roles van Propietario → Entrenador → Jockey  → [detalle con nombres omitidos]
💀 mutante orden_gatera      → muerto (4 assert(s))
     ❌ [S] 1c) C5: bloques por posición ASC, los que no largaron al final  → [detalle con nombres omitidos]
     ❌ [S] 10b) C4: los bloques van por posición ASC  → [detalle con nombres omitidos]
     ❌ [R9] 1c) C5: bloques por posición ASC, los que no largaron al final  → [detalle con nombres omitidos]
💀 mutante sin_rotulo        → muerto (2 assert(s))
     ❌ [S] 3d) C5: el incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"; la nota, "figura en la carrera N" (N = dueña)  → Incentivo jockey  | Incentivo por reunión: figura en la carrera 1 | Incentivo por reunión: figura en la carrera 2
     ❌ [S] 3e) sintético: la nota de la carrera 5 ("figura en la carrera 1") apunta a una carrera donde el incentivo SÍ está, con importe y "se paga una sola vez"  → {"nota":"Incentivo por reunión: figura en la carrera 1","en1":[{"nombre":"SINT, JOCKEY","pagar":["profesional","jsint"],"lineas":[{"texto":"Incentivo jockey ","monto":"$60000.00"}],"notas":[]}]}
💀 mutante ocultar_vacios    → muerto (10 assert(s))
     ❌ [S] 1b) C5: un bloque por inscripción ratificada (4)  → 2 bloques
     ❌ [S] 1c) C5: bloques por posición ASC, los que no largaron al final  → [detalle con nombres omitidos]
     ❌ [S] 5) C5: los caballos sin deuda pagable se muestran (apagados, "sin deuda pagable") en vez de desaparecer  → 0 vacíos
💀 mutante q_ignorado        → muerto (6 assert(s))
     ❌ [S] 6) C5 q="sint iota" → sólo ese bloque  → [detalle con nombres omitidos]
     ❌ [S] 6b) C5 q="PROPIETARIO FICTICIO UNO" → sólo los bloques donde está ese beneficiario  → [detalle con nombres omitidos]
     ❌ [S] 6c) C5 q sin match → 0 bloques

7/7 mutantes muertos
```

### probe_pagos_vista_incentivo_pagados — main (antes), sólo los rojos

```
❌ 2c) R9: los 0 incentivos pagables aparecen con importe una sola vez, en la carrera de número más bajo
❌ 2d) cada incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"
❌ 3) [jockey] (una monta, incentivo pagable): con importe en su carrera y sin nota  → {"lin":[],"notas":[]}
23/26 checks OK
```

### probe_pagos_vista_incentivo_pagados — rama (después)

```
✅ [S] 1) suma del "Pagable" de las 7 carreras (6 con resultado) = pendiente en la base (Resumen)  → $1.109.500,00 vs $1.109.500,00
✅ [S] 1b) suma de los importes de todas las líneas mostradas = pendiente en la base  → $1.109.500,00
✅ [S] 1c) cantidad de líneas pagables mostradas = líneas impagas de la base (ninguna dos veces, ninguna afuera)  → 32 vs 32
✅ [S] 2c) los 4 incentivos pagables aparecen con importe una sola vez, en la carrera de número más bajo
✅ [S] 2d) cada incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"  → Incentivo jockey · Incentivo por reunión — se paga una sola vez
✅ [S] 3) los 2 jockeys de una monta con incentivo pagable: con importe en su carrera y sin nota
✅ [S] 3b) ninguno de los 2 jockeys de una sola monta lleva nota
✅ [S] 3c) los 3 jockeys con varias montas llevan nota en todas menos la dueña
✅ [S] 4) en cada carrera con resultado, los chips de recibo = recibos de la base y los "regularizado" = saldados sin recibo (6 chips)
✅ [S] 4b) ningún importe pagado entra al "Pagable" (ver 1) y ningún beneficiario sólo-pagado tiene botón Pagar
✅ [R9] 1) suma del "Pagable" de las 8 carreras (5 con resultado) = pendiente en la base (Resumen)  → [detalle de R9 omitido: nombres reales]
✅ [R9] 1b) suma de los importes de todas las líneas mostradas = pendiente en la base  → [detalle de R9 omitido: nombres reales]
✅ [R9] 1c) cantidad de líneas pagables mostradas = líneas impagas de la base (ninguna dos veces, ninguna afuera)  → [detalle de R9 omitido: nombres reales]
✅ [R9] 2c) los 0 incentivos pagables aparecen con importe una sola vez, en la carrera de número más bajo
✅ [R9] 2d) cada incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"
✅ [R9] 3) los 0 jockeys de una monta con incentivo pagable: con importe en su carrera y sin nota
✅ [R9] 3b) ninguno de los 9 jockeys de una sola monta lleva nota
✅ [R9] 3c) los 9 jockeys con varias montas llevan nota en todas menos la dueña
✅ [R9] 4) en cada carrera con resultado, los chips de recibo = recibos de la base y los "regularizado" = saldados sin recibo (80 chips)
✅ [R9] 4b) ningún importe pagado entra al "Pagable" (ver 1) y ningún beneficiario sólo-pagado tiene botón Pagar
✅ [puras] 5) cobMarcarPagadas: recibo anulado y línea de otro club quedan afuera  → a1,a1b,a2,a3,e1,b1
✅ [puras] 5b) transferencia: "✓ Transferido · Rec. #901", UN chip aunque el recibo tenga 2 líneas, sin botón  → [JSON de la vista sintética omitido]
✅ [puras] 5c) efectivo: "✓ Efectivo · Rec. #902", sin botón
✅ [puras] 5d) saldado sin recibo: "✓ Pagado (regularizado)", sin botón
✅ [puras] 5e) caballo todo pagado: "Sin deuda pagable · todo pagado (1 transferencia, 1 efectivo, 1 regularizados)"  → Sin deuda pagable · todo pagado (1 transferencia, 1 efectivo, 1 regularizados)
✅ [puras] 5e2) caballo pagado sólo por saldado sin recibo: "Sin deuda pagable · todo pagado (1 regularizados)"  → Sin deuda pagable · todo pagado (1 regularizados)
✅ [puras] 5f) parte pagada y parte pendiente: chip "✓ Efectivo · Rec. #903" JUNTO al botón Pagar, total sólo lo pendiente  → [JSON de la vista sintética omitido]
✅ [puras] 5g) recibo anulado: no hay chip #904 ni beneficiario pagado; el caballo dice "Sin deuda pagable" a secas  → [JSON de la vista sintética omitido]
✅ [puras] 5h) caballo que nunca tuvo líneas: "Sin deuda pagable" a secas
✅ [puras] 5i) todo pagado pero con retenida: "Sin deuda pagable · Pagado · resta lo retenido por antidoping", no "todo pagado"  → Sin deuda pagable · Pagado · resta lo retenido por antidoping · 🔒 1 retenida(s) — habilitar desde Pagar
✅ [puras] 5j) lo pagado no entra en ningún total
✅ [puras] 6) cobDuenosIncentivo: la carrera de número más bajo donde LARGÓ (NL no cuenta; sin nº de programa usa el turno)  → [["jx",{"carrera_id":"k2","nro":2,"turno":2}],["jy",{"carrera_id":"k3","nro":3,"turno":6}]]
✅ [puras] 6b) en la dueña: importe; en la otra: nota sin importe y sin botón  → [JSON de la vista sintética omitido]
✅ [puras] 2) sintético: jockey que largó en las carreras 1 y 5, incentivo impago → con importe ("se paga una sola vez") SÓLO en la 1  → [JSON de la vista sintética omitido]
✅ [puras] 2b) sintético: en la 5, nota "figura en la carrera 1" sin importe ni botón; en la 1, sin nota  → [JSON de la vista sintética omitido]
✅ [puras] 2p) sintético: el mismo incentivo PAGADO por transferencia → con importe en ninguna; chip "✓ Transferido · Rec. #974" en la 1, sin botón; la nota sigue en la 5  → [JSON de la vista sintética omitido]

36/36 checks OK
```

### probe_pagos_vista_incentivo_pagados --mutantes

```
💀 mutante incentivo_en_todas         → muerto (12 assert(s))
     ❌ [S] 1) suma del "Pagable" de las 7 carreras (6 con resultado) = pendiente en la base (Resumen)  → $1.349.500,00 vs $1.109.500,00
     ❌ [S] 1b) suma de los importes de todas las líneas mostradas = pendiente en la base  → $1.349.500,00
     ❌ [S] 1c) cantidad de líneas pagables mostradas = líneas impagas de la base (ninguna dos veces, ninguna afuera)  → 36 vs 32
💀 mutante dueno_mas_alto             → muerto (10 assert(s))
     ❌ [S] 2c) los 4 incentivos pagables aparecen con importe una sola vez, en la carrera de número más bajo  → SINTETICO, DOSMONTAS, MUÑOZPRUEBA, JOCKEY
     ❌ [S] 3c) los 3 jockeys con varias montas llevan nota en todas menos la dueña  → SINTETICO, DOSMONTAS, MUÑOZPRUEBA, JOCKEY, SINTETICO, PAGADO
     ❌ [S] 4) en cada carrera con resultado, los chips de recibo = recibos de la base y los "regularizado" = saldados sin recibo (6 chips)  → C2: rec 1/2, reg 0/0; C5: rec 3/2, reg 1/1
💀 mutante sin_nota                   → muerto (5 assert(s))
     ❌ [S] 3c) los 3 jockeys con varias montas llevan nota en todas menos la dueña  → SINTETICO, DOSMONTAS, MUÑOZPRUEBA, JOCKEY, SINTETICO, PAGADO
     ❌ [R9] 3c) los 9 jockeys con varias montas llevan nota en todas menos la dueña  → [detalle con nombres omitidos]
     ❌ [puras] 6b) en la dueña: importe; en la otra: nota sin importe y sin botón  → [{"rol":"Jockey","beneficiarios":[{"tipo":"profesional","id":"jx","nombre":"(profesional)","lineas":[],"pagos":[],"notas":[],"total":0}]}]
💀 mutante nota_tambien_en_duena      → muerto (6 assert(s))
     ❌ [S] 3) los 2 jockeys de una monta con incentivo pagable: con importe en su carrera y sin nota  → {"lin":[3],"notas":[{"nro":3,"n":"Incentivo por reunión: figura en la carrera 3"}]}; {"lin":[5],"notas":[{"nro":5,"n":"Incentivo por reunión: figura en la carrera 5"}]}
     ❌ [S] 3b) ninguno de los 2 jockeys de una sola monta lleva nota  → SINTETICO, NOLARGO, SINTETICO, UNAMONTA
     ❌ [S] 3c) los 3 jockeys con varias montas llevan nota en todas menos la dueña  → SINTETICO, DOSMONTAS, MUÑOZPRUEBA, JOCKEY, SINTETICO, PAGADO
💀 mutante sin_rotulo_una_vez         → muerto (4 assert(s))
     ❌ [S] 2c) los 4 incentivos pagables aparecen con importe una sola vez, en la carrera de número más bajo  → SINTETICO, DOSMONTAS, SINTETICO, UNAMONTA, SINTETICO, NOLARGO, MUÑOZPRUEBA, JOCKEY
     ❌ [S] 2d) cada incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"  → Incentivo jockey · por reunión
     ❌ [S] 3) los 2 jockeys de una monta con incentivo pagable: con importe en su carrera y sin nota  → {"lin":[],"notas":[]}; {"lin":[],"notas":[]}
💀 mutante anulado_cuenta             → muerto (2 assert(s))
     ❌ [puras] 5) cobMarcarPagadas: recibo anulado y línea de otro club quedan afuera  → a1,a1b,a2,a3,e1,b1,c1
     ❌ [puras] 5g) recibo anulado: no hay chip #904 ni beneficiario pagado; el caballo dice "Sin deuda pagable" a secas  → {"titulo":"3° · CAB C","info":"Sin deuda pagable · todo pagado (1 transferencia, 0 efectivo)","pagable":0,"benefs":[{"rol":"Propietario","nombre":"SINT P3","pagar":null,"lineas":[],"notas":[],"chips":["✓ Transferido · Rec. #904"]}]}
💀 mutante regularizado_ignorado      → muerto (6 assert(s))
     ❌ [S] 4) en cada carrera con resultado, los chips de recibo = recibos de la base y los "regularizado" = saldados sin recibo (4 chips)  → C1: rec 0/0, reg 0/1; C5: rec 2/2, reg 0/1
     ❌ [R9] 4) en cada carrera con resultado, los chips de recibo = recibos de la base y los "regularizado" = saldados sin recibo (77 chips)  → C1: rec 15/15, reg 0/1; C2: rec 25/25, reg 0/1; C5: rec 14/14, reg 0/1
     ❌ [puras] 5) cobMarcarPagadas: recibo anulado y línea de otro club quedan afuera  → a1,a1b,a2,b1
💀 mutante todo_efectivo              → muerto (5 assert(s))
     ❌ [S] 4) en cada carrera con resultado, los chips de recibo = recibos de la base y los "regularizado" = saldados sin recibo (6 chips)  → C2: rec 2/2, reg 0/0; C5: rec 2/2, reg 1/1
     ❌ [R9] 4) en cada carrera con resultado, los chips de recibo = recibos de la base y los "regularizado" = saldados sin recibo (80 chips)  → C1: rec 15/15, reg 1/1; C2: rec 25/25, reg 1/1; C3: rec 11/11, reg 0/0; C4: rec 10/10, reg 0/0; C5: rec 14/14, reg 1/1
     ❌ [puras] 5b) transferencia: "✓ Transferido · Rec. #901", UN chip aunque el recibo tenga 2 líneas, sin botón  → {"rol":"Propietario","nombre":"SINT P1","pagar":null,"lineas":[],"notas":[],"chips":["✓ Efectivo · Rec. #901"]}
💀 mutante boton_solo_sin_pagos       → muerto (1 assert(s))
     ❌ [puras] 5f) parte pagada y parte pendiente: chip "✓ Efectivo · Rec. #903" JUNTO al botón Pagar, total sólo lo pendiente  → {"titulo":"2° · CAB B","info":"1 línea(s) pagable(s)","pagable":500,"benefs":[{"rol":"Propietario","nombre":"SINT P2","pagar":null,"lineas":[{"texto":"Carrera 1 — premio","monto":500}],"notas":[],"chips":["✓ Efectivo · Rec. #903"]}]}
💀 mutante chips_solo_sin_pendiente   → muerto (3 assert(s))
     ❌ [S] 4) en cada carrera con resultado, los chips de recibo = recibos de la base y los "regularizado" = saldados sin recibo (5 chips)  → C2: rec 1/2, reg 0/0
     ❌ [R9] 4) en cada carrera con resultado, los chips de recibo = recibos de la base y los "regularizado" = saldados sin recibo (78 chips)  → C1: rec 14/15, reg 1/1; C2: rec 24/25, reg 1/1
     ❌ [puras] 5f) parte pagada y parte pendiente: chip "✓ Efectivo · Rec. #903" JUNTO al botón Pagar, total sólo lo pendiente  → {"titulo":"2° · CAB B","info":"1 línea(s) pagable(s)","pagable":500,"benefs":[{"rol":"Propietario","nombre":"SINT P2","pagar":["propietario","p2"],"lineas":[{"texto":"Carrera 1 — premio","monto":500}],"notas":[],"chips":[]}]}
💀 mutante rotulo_ignora_pagos        → muerto (3 assert(s))
     ❌ [puras] 5e) caballo todo pagado: "Sin deuda pagable · todo pagado (1 transferencia, 1 efectivo, 1 regularizados)"  → Sin deuda pagable
     ❌ [puras] 5e2) caballo pagado sólo por saldado sin recibo: "Sin deuda pagable · todo pagado (1 regularizados)"  → Sin deuda pagable
     ❌ [puras] 5i) todo pagado pero con retenida: "Sin deuda pagable · Pagado · resta lo retenido por antidoping", no "todo pagado"  → Sin deuda pagable · 🔒 1 retenida(s) — habilitar desde Pagar
💀 mutante pagado_suma_total          → muerto (15 assert(s))
     ❌ [S] 1) suma del "Pagable" de las 7 carreras (6 con resultado) = pendiente en la base (Resumen)  → $1.320.000,00 vs $1.109.500,00
     ❌ [S] 1b) suma de los importes de todas las líneas mostradas = pendiente en la base  → $1.320.000,00
     ❌ [S] 1c) cantidad de líneas pagables mostradas = líneas impagas de la base (ninguna dos veces, ninguna afuera)  → 38 vs 32
💀 mutante chip_por_linea             → muerto (1 assert(s))
     ❌ [puras] 5b) transferencia: "✓ Transferido · Rec. #901", UN chip aunque el recibo tenga 2 líneas, sin botón  → {"rol":"Propietario","nombre":"SINT P1","pagar":null,"lineas":[],"notas":[],"chips":["✓ Transferido · Rec. #901","✓ Transferido · Rec. #901"]}
💀 mutante todo_pagado_con_retenidas  → muerto (1 assert(s))
     ❌ [puras] 5i) todo pagado pero con retenida: "Sin deuda pagable · Pagado · resta lo retenido por antidoping", no "todo pagado"  → Sin deuda pagable · todo pagado (1 transferencia, 1 efectivo, 1 regularizados) · 🔒 1 retenida(s) — habilitar desde Pagar
💀 mutante regularizados_con_ceros    → muerto (1 assert(s))
     ❌ [puras] 5e2) caballo pagado sólo por saldado sin recibo: "Sin deuda pagable · todo pagado (1 regularizados)"  → Sin deuda pagable · todo pagado (0 transferencia, 0 efectivo, 1 regularizados)
💀 mutante regularizado_singular      → muerto (1 assert(s))
     ❌ [puras] 5e) caballo todo pagado: "Sin deuda pagable · todo pagado (1 transferencia, 1 efectivo, 1 regularizados)"  → Sin deuda pagable · todo pagado (1 transferencia, 1 efectivo, 1 regularizado)
💀 mutante pagadas_no_se_cargan       → muerto (4 assert(s))
     ❌ [S] 3c) los 3 jockeys con varias montas llevan nota en todas menos la dueña  → SINTETICO, PAGADO
     ❌ [S] 4) en cada carrera con resultado, los chips de recibo = recibos de la base y los "regularizado" = saldados sin recibo (0 chips)  → C1: rec 0/0, reg 0/1; C2: rec 0/2, reg 0/0; C5: rec 0/2, reg 0/1
     ❌ [R9] 3c) los 9 jockeys con varias montas llevan nota en todas menos la dueña  → [detalle con nombres omitidos]

17/17 mutantes muertos
```

### probe_recibo_una_hoja — main (antes), sólo los rojos

```
❌ 2c) en las 2 copias el pie contiene total (NETO A COBRAR), "Retira:" y la firma (Firma/Aclaración/DNI) — todo dentro de .recibo-pie  → 652 chars
❌ 3d) 9 líneas → 1 página, corte a la mitad (137.2 mm), fin del duplicado 274.7 mm ≤ 267
17/19 checks OK
```

### probe_recibo_una_hoja — rama (después)

```
   salida de Chromium en <tmp>
✅ 1a) .recibo-copia NO tiene break-after:page (ni una regla :not(:last-child) que lo ponga)  → width: 100%; box-sizing: border-box; break-inside: avoid; page-break-inside: avoid;
✅ 1b) .recibo-copia tiene break-inside:avoid + page-break-inside:avoid (atómica)
✅ 1c) .recibo-pie sigue con break-inside:avoid (fix 28/08)
✅ 1d) no vuelve el bug del 28/08: la copia no tiene min-height:100vh ni flex, la firma no tiene margin-top:auto
✅ 1e) body en print sigue con margin:0 (fix 28/08)
✅ 1f) existe .recibo-corte: punteada, fina y discreta (1px dashed, gris), con margen vertical
✅ 1g)  (arroba) page A4 con margen en mm
✅ 1h) corte a la mitad: UNA regla con min-height, selector .recibo-copia:first-child solo, valor en mm (120–135); nada en vh ni en el duplicado  → .recibo-copia:first-child {min-height: 127.5mm;}
✅ 2a) recibo N° 1234 (sintético, efectivo, 4 línea(s)): un solo window.print(), 2 copias ORIGINAL y DUPLICADO
✅ 2b) hay exactamente UN .recibo-corte, entre ORIGINAL y DUPLICADO
✅ 2c) en las 2 copias el pie contiene total (NETO A COBRAR), "Retira:" y la firma (Firma/Aclaración/DNI) — todo dentro de .recibo-pie  → 494 chars
✅ 2c') transferencia (sintético): en las 2 copias el pie lleva NETO A COBRAR, "Retira:", la leyenda "TRANSFERENCIA — no requiere firma" y el comprobante; NO lleva Firma/Aclaración  → 503 chars
✅ 2d) "A nombre de:" en las 2 copias, mismas filas en las 2
✅ 2e) el HTML del recibo no trae la clase .recibo-container (resto de otra época; no envuelve al recibo)
✅ 3a) recibo sintético (4 línea(s)) → PDF de 1 página; fin del duplicado 240.6 mm ≤ 267 mm  → pdf: <tmp>
✅ 3a') recibo sintético: la línea de corte cae a la mitad del área útil (133.5 mm ≈ 133.5 mm)
✅ 3d) 9 líneas → 1 página, corte a la mitad (133.5 mm), fin del duplicado 265.7 mm ≤ 267
✅ 3e) 10 líneas → 2 páginas; el original crece más allá de la mitad (corte 137 mm, alto natural) y el duplicado tiene alto natural
✅ 3b) 12 líneas → PDF de 2 páginas (el duplicado se va entero a la hoja 2 — VER a ojo _x12_pdf_p2.png)  → <tmp>, <tmp>
✅ 3c) 40 líneas → PDF de ≥ 3 páginas (una copia no entra en una hoja: la tabla parte, el pie no)  → 4 páginas

20/20 checks OK
```

### probe_recibo_una_hoja --mutantes

```
💀 mutante break_after_page  → muerto (3 assert(s))
     ❌ 1a) .recibo-copia NO tiene break-after:page (ni una regla :not(:last-child) que lo ponga)  → width: 100%; box-sizing: border-box; break-inside: avoid; page-break-inside: avoid;
     ❌ 3a) recibo sintético (4 línea(s)) → PDF de 1 página; fin del duplicado 240.6 mm ≤ 267 mm  → pdf: <tmp>
     ❌ 3d) 9 líneas → 1 página, corte a la mitad (133.5 mm), fin del duplicado 265.7 mm ≤ 267
💀 mutante sin_avoid_copia   → muerto (1 assert(s))
     ❌ 1b) .recibo-copia tiene break-inside:avoid + page-break-inside:avoid (atómica)
💀 mutante sin_corte         → muerto (4 assert(s))
     ❌ 2b) hay exactamente UN .recibo-corte, entre ORIGINAL y DUPLICADO
     ❌ 3a') recibo sintético: la línea de corte cae a la mitad del área útil (undefined mm ≈ 133.5 mm)
     ❌ 3d) 9 líneas → 1 página, corte a la mitad (undefined mm), fin del duplicado 253.4 mm ≤ 267
💀 mutante firma_fuera_pie   → muerto (1 assert(s))
     ❌ 2c) en las 2 copias el pie contiene total (NETO A COBRAR), "Retira:" y la firma (Firma/Aclaración/DNI) — todo dentro de .recibo-pie  → 341 chars
💀 mutante vuelve_100vh      → muerto (5 assert(s))
     ❌ 1d) no vuelve el bug del 28/08: la copia no tiene min-height:100vh ni flex, la firma no tiene margin-top:auto
     ❌ 1h) corte a la mitad: UNA regla con min-height, selector .recibo-copia:first-child solo, valor en mm (120–135); nada en vh ni en el duplicado  → .recibo-copia {width: 100%; box-sizing: border-box; break-inside: avoid; page-break-inside: avoid; min-height: 100vh; display: flex; flex-direction: column;} | .recibo-copia:first-child {min-height: 127.5mm;}
     ❌ 3a) recibo sintético (4 línea(s)) → PDF de 1 página; fin del duplicado 457.3 mm ≤ 267 mm  → pdf: <tmp>
💀 mutante sin_mitad         → muerto (3 assert(s))
     ❌ 1h) corte a la mitad: UNA regla con min-height, selector .recibo-copia:first-child solo, valor en mm (120–135); nada en vh ni en el duplicado  → sin min-height
     ❌ 3a') recibo sintético: la línea de corte cae a la mitad del área útil (106.8 mm ≈ 133.5 mm)
     ❌ 3d) 9 líneas → 1 página, corte a la mitad (131.9 mm), fin del duplicado 264.1 mm ≤ 267
💀 mutante mitad_en_ambas    → muerto (3 assert(s))
     ❌ 1h) corte a la mitad: UNA regla con min-height, selector .recibo-copia:first-child solo, valor en mm (120–135); nada en vh ni en el duplicado  → .recibo-copia + .recibo-corte + .recibo-copia, .recibo-copia:first-child {min-height: 127.5mm;}
     ❌ 3a) recibo sintético (4 línea(s)) → PDF de 1 página; fin del duplicado 267.3 mm ≤ 267 mm  → pdf: <tmp>
     ❌ 3d) 9 líneas → 1 página, corte a la mitad (133.5 mm), fin del duplicado 267.3 mm ≤ 267
💀 mutante mitad_en_vh       → muerto (5 assert(s))
     ❌ 1h) corte a la mitad: UNA regla con min-height, selector .recibo-copia:first-child solo, valor en mm (120–135); nada en vh ni en el duplicado  → .recibo-copia:first-child {min-height: 50vh;}
     ❌ 3a) recibo sintético (4 línea(s)) → PDF de 1 página; fin del duplicado 271.8 mm ≤ 267 mm  → pdf: <tmp>
     ❌ 3a') recibo sintético: la línea de corte cae a la mitad del área útil (164.7 mm ≈ 133.5 mm)

8/8 mutantes muertos
```

### correr_todos.sh sobre el worktree

```
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       3s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      2s
probe_badge_overlap                        🟢 verde                                                      0s
probe_bolsa_efectiva                       🟢 verde                                                      2s
probe_carta_numero_turno                   🟢 verde                                                      1s
probe_carta_selector_reunion               🟢 verde                                                      1s
probe_chapa_4medio                         🟢 verde                                                      0s
probe_cobros_caballeriza                   🟢 verde                                                      2s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=2)                                       1s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      12s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      1s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      2s
probe_motor_chequeo_errores                🟢 verde                                                      1s
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       5s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde                                                      7s
probe_pagos_vista_carrera                  🟢 verde                                                     12s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     13s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      1s
probe_programa_null_estado                 🟢 verde                                                      1s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🟢 verde                                                     39s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_resultados_front_cerrada             🟢 verde                                                      1s
probe_reparto_100                          🟢 verde                                                     39s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       1s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                      11s
probe_studbook_v2                          🟢 verde                                                      1s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       2s
probe_v_inscriptos_cerrada                 🟢 verde                                                      1s

Resumen: 31 verdes · 12 rojos conocidos · 0 rojos NUEVOS · 0 ausentes
Rojos conocidos (no bloquean):
  - probe_activacion_pendiente          drift del probe: su stub de sb no tiene .select() después de update().eq() (TypeError)
  - probe_alineado_programa             drift: el check de márgenes de página (10mm 8mm) del programa color no coincide — el CSS de impresión cambió desde que se escribió
  - probe_apuestas_especiales           drift: 9 checks de tarjetas (cantidad, número, nombre, rango) no coinciden con la pantalla actual
  - probe_cuerpos_oficial               drift de datos: espera 8 carreras oficiales en R6 y hay 7 (C3 está provisional desde el 14/08)
  - probe_edad_display                  drift: no encuentra el ancla de fin del bloque de edad en el HTML
  - probe_edad_reglamentaria            2/32: el Stud Book no devuelve dato para los ejemplares de R9 (fuente externa; ver studbook_buscar_fn)
  - probe_forfait_anulada               drift de extracción: ReferenceError renumerarChapas
  - probe_orden_carreras                drift de datos: 2/18 asumen R9 con 0 anuladas y sin sortear (R9 ya tiene anuladas y sorteo)
  - probe_portal_carta                  drift: no encuentra loadCarta en portal.html (hoy se llama loadLlamado)
  - probe_spcs_r9_tanda_1               evidencia histórica: asserta count(spcs) = 205 (hoy 239)
  - probe_studbook_buscar_fn            fuente externa: el Stud Book responde HTTP 403 a las búsquedas desde este servidor
  - probe_tapa_flyer                    drift de extracción: ReferenceError edadSPC
Salida completa de cada probe: <tmp><probe>.txt
```
