# ISSUE-104 2a: aviso de totales (PR #38) · P2/P5 sintéticos (PR #39) · merge de #37/#38 programado

- **Fecha**: 2026-10-02, 12:15 ART
- **`main`**: `054d70b945d0982a3dd57c659cf00efc472ed449` (sin cambios todavía)
- **Guards**: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` ✅ · clubs Dolores por uuid ✅. Nada escribió en la base.

## Estado

| # | Pedido | Estado |
|---|---|---|
| 1 | Chequeo de `recomputeHeaderTotals` en PR #38, como aviso | ✅ commit `8f2d504fc2c586f2edbcd5a07d6201359d06368a` en `fix/motor-liquidacion-chequeo-errores` |
| 2 | Mergear #37 y #38 fuera del horario de Valeria + md5 servido | ⏳ **programado para hoy 20:07 ART** (23:07 UTC), tarea de esta sesión `2ddcf2e7` |
| 3 | P2/P5 de `probe_reparto_100` a sintético, PR aparte | ✅ **PR #39** (`fix/probe-reparto-p2-p5-sintetico`, `517aba5e172adc2e81811ca6d65b5f35a025f8ac`), sin mergear |

### 1. Aviso de totales

- `recomputeHeaderTotals` ahora devuelve el error de su lectura o de su `UPDATE`. El motor **no corta** (las líneas están bien) y
  devuelve `aviso`: *"Liquidación recalculada, pero los totales mostrados de N liquidación(es) pueden estar desactualizados: volvé a
  recalcular la reunión."*
- Los 4 llamadores lo muestran como warning, después del toast de éxito: Recalcular (`liquidaciones.html`, 9 s; se agregó
  `.toast-warning`, que esa pantalla no tenía), oficializar, des-oficializar y cambio de monta (`resultados.html`).
- Probe: **T1** (falla la lectura de totales), **T2** (falla el `UPDATE`), **U1** (los 4 llamadores) → **18/18**, mutantes **19/19**
  (MU14 lectura ignorada, MU15 `UPDATE` ignorado, MU16 sin aviso, MU17 aviso convertido en error, MU18/MU19 llamadores sin aviso).

### 2. Merge programado — por qué no ahora

A las 11:52 ART del viernes no es seguro que Valeria no esté usando Pagos: los recibos del sistema se emitieron entre las 09:58 y las
16:02 ART (domingos de reunión y días hábiles). No hay un horario escrito en el repo; tomé **20:07 ART** como ventana conservadora.
La tarea, antes de mergear, verifica: que no haya recibos en la última hora (si hay, **no mergea**), que los heads de #37/#38 sigan
siendo los de arriba, y que el probe dé 18/18 · 19/19. Después compara md5 servido de `liquidaciones-engine.js`, `liquidaciones.html`
y `resultados.html` y deja `docs/diagnosticos/2026-10-02_deploy-motor-2a.md`.
**Ojo**: la tarea vive en esta sesión de Claude Code (no se guarda en disco). Si la sesión se cierra antes de las 20:07, no corre y
hay que pedirlo de nuevo.

Consulta de la que salió la ventana:
```sql
select to_char(created_at at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD Dy') dia,
       min(to_char(created_at at time zone 'America/Argentina/Buenos_Aires','HH24:MI')) desde,
       max(to_char(created_at at time zone 'America/Argentina/Buenos_Aires','HH24:MI')) hasta, count(*) n
from recibos group by 1 order by 1 desc limit 15;
```
```
2026-09-23 Wed | 12:55 | 12:58 | 2
2026-09-21 Mon | 13:23 | 13:23 | 1
2026-09-20 Sun | 14:01 | 16:02 | 36
2026-08-28 Fri | 09:58 | 11:10 | 2
2026-08-16 Sun | 15:46 | 15:46 | 1
2026-06-09 Tue | 23:33 | 23:33 | 2
```

### 3. P2/P5 → S10/S11 (PR #39)

R9 se recalculó el 25/09: las 69 sub-líneas ya existen, así que P2/P5 daban rojo con cualquier motor. Ahora, en memoria: corrida
completa, se sacan las sub-líneas (como las dejaba el motor viejo), dos entrenadores ya cobrados → recalcular → **S10** nacen exactamente
3 por premiado (peón/capataz/sereno), **S11** su suma = Σ(18 % − 10 % del entrenador) al centavo. P1/P3/P4/P6/P7 siguen contra prod.
Resultado: **34/34** (sin sandbox), mutantes de motor **4/4**; M5 es de sandbox (sigue ⏸ sin `PSQL_CMD`, por eso `exit=1`, igual que antes).

## Hallazgo lateral (no tocado)

`probe_pagos_vista_carrera.mjs` y `probe_pagos_vista_incentivo_pagados.mjs` **revientan antes de assertear** con
`ReferenceError: subRolDeLinea is not defined`, **también contra el `liquidaciones.html` de `main`**: el probe extrae `rolDeLinea` pero
no `subRolDeLinea` (que se sumó con el reparto al 100 % del 25/09). Es drift del probe, no de estos cambios. ¿Lo arreglo en otro PR?

## Salida cruda

### `probe_motor_chequeo_errores.mjs --mutantes` (rama del PR #38)

```
$ node tests/probe_motor_chequeo_errores.mjs --mutantes
✅ E0 sin fallas: recalcular devuelve éxito, mismo contenido, ninguna clave duplicada
✅ L1 falla liquidacion_config → error "no se cambió nada", 0 escrituras, base idéntica
✅ L2 falla carreras → error "no se cambió nada", 0 escrituras, base idéntica
✅ L3 falla comision_config → error "no se cambió nada", 0 escrituras, base idéntica
✅ L4 falla resultados → error "no se cambió nada", 0 escrituras, base idéntica
✅ L5 falla inscripciones → error "no se cambió nada", 0 escrituras, base idéntica
✅ L6 falla posiciones → error "no se cambió nada", 0 escrituras, base idéntica
✅ L7 falla quién largó → error "no se cambió nada", 0 escrituras, base idéntica
✅ L8 falla liquidaciones existentes → error "no se cambió nada", 0 escrituras, base idéntica
✅ D1 falla DELETE de líneas no pagadas → error "no se cambió nada", 0 escrituras, base idéntica
✅ I1 falla INSERT de líneas → error "INCOMPLETA", sin claves duplicadas, la pagada sigue una sola vez
✅ I1b el recálculo siguiente sin fallas deja exactamente el contenido de antes
✅ I2 falla INSERT de un header → error "INCOMPLETA" y no se insertó ninguna línea después
✅ C1 falla el conteo de líneas de un header → error y ningún header borrado (la pagada sigue)
✅ C2 falla el DELETE de un header vacío → error devuelto
✅ T1 falla la lectura de los totales → sin error, con aviso "pueden estar desactualizados", líneas intactas
✅ T2 falla el UPDATE de los totales → sin error, con aviso "pueden estar desactualizados", líneas intactas
✅ U1 los 4 llamadores muestran r.aviso como warning (1 en liquidaciones.html, 3 en resultados.html) y existe .toast-warning en liquidaciones.html

18/18 asserts OK  (/home/clio/dev/SGH/liquidaciones-engine.js)

── mutantes ──
✅ muere MU1 sin chequeo de liquidacion_config  ← L1
✅ muere MU2 sin chequeo de carreras  ← L2
✅ muere MU3 sin chequeo de comision_config  ← L3
✅ muere MU4 sin chequeo de resultados  ← L4
✅ muere MU5 sin chequeo de inscripciones  ← L5
✅ muere MU6 sin chequeo de posiciones  ← L6
✅ muere MU7 sin chequeo de quién largó  ← L7
✅ muere MU8 sin chequeo de liquidaciones existentes  ← L8
✅ muere MU9 sin chequeo del DELETE de líneas  ← D1
✅ muere MU10 INSERT de header vuelve a continue  ← I2
✅ muere MU11 INSERT de líneas sólo loguea  ← I1
✅ muere MU12 sin chequeo del conteo  ← C1
✅ muere MU13 sin chequeo del DELETE de header  ← C2
✅ muere MU14 totales: la lectura fallida se ignora  ← T1
✅ muere MU15 totales: el UPDATE fallido se ignora  ← T2
✅ muere MU16 sin aviso de totales  ← T1, T2
✅ muere MU17 totales fallidos cortan como error  ← T1, T2
✅ muere MU18 Recalcular no muestra el aviso  ← U1
✅ muere MU19 oficializar no muestra el aviso  ← U1

mutantes: 19/19 muertos
exit=0
```

### `probe_reparto_100.mjs --mutantes` (rama del PR #39)

(Las bolsas de S1/S2 van con `$` y puntos de miles: con los 7 dígitos pegados caen en el chequeo de datos personales.)

```
✅ S1a) bolsa $1.000.000: los 5 premiados reparten el 100 % exacto (centavo a centavo)
✅ S1b) entrenador + peón + capataz + sereno = r2(18 % del premio) exacto
✅ S1c) las 3 sub-líneas nacen siempre, concepto = rol, "(sin nombre cargado)"
✅ S1d) cada línea queda a ≤ 1 centavo de su % teórico
✅ S1e) las subs heredan retención y fecha de liberación del 10 % del entrenador (1°/2° retenido)
✅ S2a) bolsa $1.083.333,33: los 5 premiados reparten el 100 % exacto (centavo a centavo)
✅ S2b) entrenador + peón + capataz + sereno = r2(18 % del premio) exacto
✅ S2c) las 3 sub-líneas nacen siempre, concepto = rol, "(sin nombre cargado)"
✅ S2d) cada línea queda a ≤ 1 centavo de su % teórico
✅ S2e) las subs heredan retención y fecha de liberación del 10 % del entrenador (1°/2° retenido)
✅ S3) empate 2°–3°: cada uno reparte el 100 % del premio promediado
✅ S4) con nombre: concepto "Peón", descripción "… — Peón: JUAN PEREZ — A redistribuir (4%)"
✅ S50) hay una sub-línea de peón para marcar como pagada
✅ S5) peón renombrado después de pagada: sigue habiendo UNA sub-línea de peón (la pagada), no dos
✅ S60) hay una sub-línea de peón para marcar como pagada
✅ S6) peón cargado después de pagada: sigue habiendo UNA sub-línea de peón (la pagada), no dos
✅ S7) reunión con liquidacion_cerrada_at: devuelve cerrada y 0 escrituras
✅ S8) recalcular dos veces da exactamente las mismas líneas
✅ S9) caballo sin entrenador: ni 10 % ni subs (lo cubre el GATE ENTRENADORES de oficializar)
✅ S10) reunión liquidada sin sub-líneas: al recalcular nacen exactamente 15 líneas, todas peón/capataz/sereno (3 por caballo premiado)
✅ S11) la suma de las nuevas = Σ (18 % − 10 % del entrenador) por caballo, al centavo (con entrenadores ya cobrados)
✅ U1) peón/capataz/sereno: Rol = el sub-rol (no "Profesional"), Concepto = rol — nombre o "(sin nombre)"; formato viejo también
✅ U2) el recibo imprime el concepto discriminado y escapado, el subtotal del personal y "(incluye personal de caballeriza)"
✅ U3) Pagos: pagables y retenidas con concepto discriminado; "Habilitar caballo" en las retenidas
✅ U4) Liquidaciones: Recalcular se deshabilita en reunión cerrada y el recálculo avisa si el motor dice cerrada
✅ U5) oficializar tiene el GATE ENTRENADORES después del de montas y ANTES de aplicar(…, 'oficial'), y corta con return
✅ U6) entrenadoresFaltantes: sólo los que largaron sin entrenador (el "no corrió" no cuenta)
✅ U7) des-oficializar se corta en reunión cerrada ANTES de la RPC
✅ P1) R9: el motor nuevo no da error y no toca líneas comprometidas (el DELETE filtra recibo NULL y ≠ pagado)
✅ P3) R9: ninguna línea existente cambia de monto, estado o fecha (retenidas incluidas) y ninguna desaparece
✅ P4) R9: los 23 premiados reparten el 100 % exacto y el entrenador + personal = 18 % exacto
✅ P6) R6 (cerrada en la base): el motor corta con 0 escrituras
✅ P6) R8 (cerrada en la base): el motor corta con 0 escrituras
✅ P7) md5 de las líneas de R6, R8 y R9: idéntico antes y después (el probe no escribió nada)
⏸ D) sin sandbox (PSQL_CMD + LOCAL_JWT_SECRET): no se prueban los triggers

34/34 checks OK (sin la parte D: sandbox no disponible)

── Mutantes ──
💀 M1 muerto — las subs vuelven a nacer sólo con nombre (.filter) (S1a, S1b, S1c, S2a, S2b, S2c, S3, S60, S10, S11)
💀 M2 muerto — sin regla de residuo (sereno y fondo redondeados por separado) (S2a, S2b, S3, S11)
💀 M3 muerto — el concepto de la sub vuelve a llevar el nombre (clave inestable) (S1b, S1c, S2b, S2c, S4, S5, S6, S10)
💀 M4 muerto — el motor no corta en reunión cerrada (S7)
⏸ M5 MANUAL (sin sandbox) — la base sin el trigger de reunión cerrada en liquidacion_detalle

4/5 mutantes muertos
```

### Probes de Pagos contra el `liquidaciones.html` de `main`

```
$ git show main:liquidaciones.html > <scratchpad>/liq_main.html
$ LIQUIDACIONES_HTML=<scratchpad>/liq_main.html node tests/probe_pagos_vista_carrera.mjs
ReferenceError: subRolDeLinea is not defined
$ LIQUIDACIONES_HTML=<scratchpad>/liq_main.html node tests/probe_pagos_vista_incentivo_pagados.mjs
ReferenceError: subRolDeLinea is not defined
```

Otros de regresión con la rama del PR #38: `probe_fmtinput_onblur` 20 pass / 0 fail · `probe_recibo_una_hoja` 19/19.
