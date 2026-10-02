# ISSUE-104 · 2a — el motor de liquidación corta y devuelve el error (PR #38) + decisión anotada (PR #37)

- **Fecha**: 2026-10-02
- **`main`**: `054d70b945d0982a3dd57c659cf00efc472ed449`
- **PR #38** `fix/motor-liquidacion-chequeo-errores` en `e4d6228734511832899cb547bdad851656e7a9c1` — **sin mergear** (espera OK). https://github.com/mdqclio/SGH/pull/38
- **PR #37** `chore/issue-104-motor-liquidacion-duplicados` en `9be111b2056fb61d7d1abc76fd875a595e93a24c` — ahora con la decisión; **sin mergear** (sigue igual).
- **Guards**: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` ✅ · `SELECT nombre FROM clubs WHERE id = '0649e9c5-9e87-4aad-842f-101458e6b33c'` → `Hipódromo de Dolores` ✅.
  Nada se escribió en la base: el probe nuevo corre en memoria; `probe_reparto_100` sólo lee prod (escrituras capturadas, no enviadas).

## Qué se hizo

**PR #38 — sólo `liquidaciones-engine.js` + probe + una línea en CLAUDE.md.** Sin índices, sin RPC, sin base.

| Paso | Antes | Ahora |
|---|---|---|
| lectura de `liquidacion_config` (si la página no la pasa) | sin chequeo → "sin liquidacion_config" engañoso | corta: "no se pudo leer liquidacion_config (…): no se cambió nada" |
| lecturas de carreras, comisiones, resultados, inscripciones, posiciones, quién largó | sin chequeo → calculaba con vacío y **borraba** lo no pagado | cortan antes de escribir |
| lectura de liquidaciones existentes (paso 1) | sin chequeo → **regeneraba lo cobrado como impago** | corta antes de escribir |
| DELETE de líneas no pagadas (paso 2) | sin chequeo → el INSERT **duplicaba** lo no pagado | corta antes de insertar |
| INSERT de header (3a) | `console.error` + `continue` | corta: "… quedó INCOMPLETA — volvé a recalcular la reunión" |
| INSERT de líneas (3b) | `console.error`, devolvía éxito | corta: "INCOMPLETA" |
| conteo de líneas por header (paso 4) | sin chequeo → `count` vacío = "header vacío" → lo **borraba con sus líneas pagadas** (`ON DELETE CASCADE`) | corta: "INCOMPLETA" |
| DELETE de header vacío (paso 4) | sin chequeo | corta: "INCOMPLETA" |

**Hallazgo nuevo (fuera de los tres del pedido, entra en "lectura")**: el conteo del paso 4 + el `ON DELETE CASCADE` de
`liquidacion_detalle.liquidacion_id`. Medido con el probe sobre el motor de `main`: con ese conteo fallando, el header de la línea
pagada desapareció (16 → 15 headers). Con el fix, no se borra nada.

Lo que **no** se tocó: `recomputeHeaderTotals` (lee las líneas y hace `UPDATE` de los totales del header sin chequear): si falla,
el total mostrado del header queda viejo hasta el próximo recálculo; no mueve ni crea líneas. Queda anotado, no se arregló.

**Llamadores**: los cuatro ya mostraban `r.error` en un toast (Recalcular `liquidaciones.html:2463`; oficializar `resultados.html:1685`;
des-oficializar `:1720`; cambio de monta `:2153`). No se tocaron.

**PR #37 — ISSUE-104 con la decisión** (commit `9be111b2056fb61d7d1abc76fd875a595e93a24c`): 2a se hace (PR #38, sin apuro de
fecha); índices UNIQUE no por ahora; **2b no se hace** — el motor es paid-safe por diseño desde junio y no hubo duplicados (0/64,
0/709); los caminos de concurrencia y de recibo en medio de un recálculo quedan abiertos y aceptados; sin barrido antes de pagos.
La línea resumen de ALTOS también se actualizó.

## Verificación

| | Resultado |
|---|---|
| `probe_motor_chequeo_errores.mjs --mutantes` | **15/15**, mutantes **13/13** (uno por chequeo) |
| mismo probe con el motor de `main` | **2/15** (sólo pasan E0 —camino feliz— e I1b —el recálculo siguiente repone—) |
| `probe_reparto_100.mjs --mutantes` con el motor nuevo | 32/34 — **mismos 2 ❌ que con el motor de `main`** (P2/P5) |
| `probe_reparto_100.mjs` con el motor de `main` | 32/34 — P2/P5 ❌ |

P2/P5 esperan que el motor en seco sobre R9 haga nacer 69 sub-líneas, pero esas 69 ya nacieron el 25/09 (recálculo ejecutado):
es drift del probe, no de este cambio. No lo toqué (fuera de alcance); queda como pregunta. La parte D (sandbox) no se corrió.

## Preguntas abiertas

1. `probe_reparto_100` P2/P5: ¿se reescriben para R9 ya recalculada (esperar 0 nuevas) o se pasan a un escenario sintético?
2. `recomputeHeaderTotals` sin chequeo (sólo totales mostrados): ¿se suma a 2a o queda así?

## Salida cruda

### Probe nuevo

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

15/15 asserts OK  (/home/clio/dev/SGH/liquidaciones-engine.js)

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

mutantes: 13/13 muertos
exit=0

$ git show main:liquidaciones-engine.js > <scratchpad>/engine_main.js
$ ENGINE_JS=<scratchpad>/engine_main.js node tests/probe_motor_chequeo_errores.mjs
✅ E0 sin fallas: recalcular devuelve éxito, mismo contenido, ninguna clave duplicada
❌ L1 falla liquidacion_config → error "no se cambió nada", 0 escrituras, base idéntica  → {"disparo":1,"r":{"created":0,"headers":0,"preserved":0,"error":"sin liquidacion_config"},"escr":0,"igual":true}
❌ L2 falla carreras → error "no se cambió nada", 0 escrituras, base idéntica  → {"disparo":1,"r":{"created":0,"headers":0,"preserved":0,"error":"la reunión no tiene carreras"},"escr":0,"igual":true}
❌ L3 falla comision_config → error "no se cambió nada", 0 escrituras, base idéntica  → {"disparo":1,"r":{"created":0,"headers":16,"preserved":1},"escr":33,"igual":false}
❌ L4 falla resultados → error "no se cambió nada", 0 escrituras, base idéntica  → {"disparo":1,"r":{"created":0,"headers":1,"preserved":1},"escr":17,"igual":false}
❌ L5 falla inscripciones → error "no se cambió nada", 0 escrituras, base idéntica  → {"disparo":1,"r":{"created":0,"headers":1,"preserved":1},"escr":17,"igual":false}
❌ L6 falla posiciones → error "no se cambió nada", 0 escrituras, base idéntica  → {"disparo":1,"r":{"created":0,"headers":10,"preserved":1},"escr":27,"igual":false}
❌ L7 falla quién largó → error "no se cambió nada", 0 escrituras, base idéntica  → {"disparo":1,"r":{"created":0,"headers":16,"preserved":1},"escr":32,"igual":false}
❌ L8 falla liquidaciones existentes → error "no se cambió nada", 0 escrituras, base idéntica  → {"disparo":1,"r":{"created":16,"headers":16,"preserved":0},"escr":48,"igual":false}
❌ D1 falla DELETE de líneas no pagadas → error "no se cambió nada", 0 escrituras, base idéntica  → {"disparo":1,"r":{"created":0,"headers":16,"preserved":1},"escr":32,"igual":false}
❌ I1 falla INSERT de líneas → error "INCOMPLETA", sin claves duplicadas, la pagada sigue una sola vez  → {"r":{"created":0,"headers":15,"preserved":1},"dup":0,"pagadas":1}
✅ I1b el recálculo siguiente sin fallas deja exactamente el contenido de antes
❌ I2 falla INSERT de un header → error "INCOMPLETA" y no se insertó ninguna línea después  → {"r":{"created":15,"headers":15,"preserved":0},"lineas":44}
❌ C1 falla el conteo de líneas de un header → error y ningún header borrado (la pagada sigue)  → {"r":{"created":0,"headers":15,"preserved":1},"headers":[16,15]}
❌ C2 falla el DELETE de un header vacío → error devuelto  → {"created":0,"headers":1,"preserved":1}

2/15 asserts OK  (<scratchpad>/engine_main.js)
exit=1
```

### `probe_reparto_100.mjs --mutantes` con el motor nuevo (rama del PR #38)

(Las dos bolsas de los casos S1/S2 van con `$` y puntos de miles: con los 7 dígitos pegados caen en el chequeo de datos personales.)

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
✅ U1) peón/capataz/sereno: Rol = el sub-rol (no "Profesional"), Concepto = rol — nombre o "(sin nombre)"; formato viejo también
✅ U2) el recibo imprime el concepto discriminado y escapado, el subtotal del personal y "(incluye personal de caballeriza)"
✅ U3) Pagos: pagables y retenidas con concepto discriminado; "Habilitar caballo" en las retenidas
✅ U4) Liquidaciones: Recalcular se deshabilita en reunión cerrada y el recálculo avisa si el motor dice cerrada
✅ U5) oficializar tiene el GATE ENTRENADORES después del de montas y ANTES de aplicar(…, 'oficial'), y corta con return
✅ U6) entrenadoresFaltantes: sólo los que largaron sin entrenador (el "no corrió" no cuenta)
✅ U7) des-oficializar se corta en reunión cerrada ANTES de la RPC
✅ P1) R9: el motor nuevo no da error y no toca líneas comprometidas (el DELETE filtra recibo NULL y ≠ pagado)
❌ P2) R9: nacen exactamente 69 líneas, todas peón/capataz/sereno (3 por caballo premiado)
   → nuevas=0 premiados=23 tipos=
✅ P3) R9: ninguna línea existente cambia de monto, estado o fecha (retenidas incluidas) y ninguna desaparece
✅ P4) R9: los 23 premiados reparten el 100 % exacto y el entrenador + personal = 18 % exacto
❌ P5) R9: la suma de las nuevas = Σ (18 % − 10 % del entrenador) por caballo, al centavo
   → nuevas 0 · esperado 564096.66
✅ P6) R6 (cerrada en la base): el motor corta con 0 escrituras
✅ P6) R8 (cerrada en la base): el motor corta con 0 escrituras
✅ P7) md5 de las líneas de R6, R8 y R9: idéntico antes y después (el probe no escribió nada)
⏸ D) sin sandbox (PSQL_CMD + LOCAL_JWT_SECRET): no se prueban los triggers

32/34 checks OK (sin la parte D: sandbox no disponible)

── Mutantes ──
💀 M1 muerto — las subs vuelven a nacer sólo con nombre (.filter) (S1a, S1b, S1c, S2a, S2b, S2c, S3, S60)
💀 M2 muerto — sin regla de residuo (sereno y fondo redondeados por separado) (S2a, S2b, S3)
💀 M3 muerto — el concepto de la sub vuelve a llevar el nombre (clave inestable) (S1b, S1c, S2b, S2c, S4, S5, S6)
💀 M4 muerto — el motor no corta en reunión cerrada (S7)
⏸ M5 MANUAL (sin sandbox) — la base sin el trigger de reunión cerrada en liquidacion_detalle

4/5 mutantes muertos
```

### `probe_reparto_100.mjs` con el motor de `main` (`ENGINE_JS=<scratchpad>/engine_main.js`)

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
✅ U1) peón/capataz/sereno: Rol = el sub-rol (no "Profesional"), Concepto = rol — nombre o "(sin nombre)"; formato viejo también
✅ U2) el recibo imprime el concepto discriminado y escapado, el subtotal del personal y "(incluye personal de caballeriza)"
✅ U3) Pagos: pagables y retenidas con concepto discriminado; "Habilitar caballo" en las retenidas
✅ U4) Liquidaciones: Recalcular se deshabilita en reunión cerrada y el recálculo avisa si el motor dice cerrada
✅ U5) oficializar tiene el GATE ENTRENADORES después del de montas y ANTES de aplicar(…, 'oficial'), y corta con return
✅ U6) entrenadoresFaltantes: sólo los que largaron sin entrenador (el "no corrió" no cuenta)
✅ U7) des-oficializar se corta en reunión cerrada ANTES de la RPC
✅ P1) R9: el motor nuevo no da error y no toca líneas comprometidas (el DELETE filtra recibo NULL y ≠ pagado)
❌ P2) R9: nacen exactamente 69 líneas, todas peón/capataz/sereno (3 por caballo premiado)
   → nuevas=0 premiados=23 tipos=
✅ P3) R9: ninguna línea existente cambia de monto, estado o fecha (retenidas incluidas) y ninguna desaparece
✅ P4) R9: los 23 premiados reparten el 100 % exacto y el entrenador + personal = 18 % exacto
❌ P5) R9: la suma de las nuevas = Σ (18 % − 10 % del entrenador) por caballo, al centavo
   → nuevas 0 · esperado 564096.66
✅ P6) R6 (cerrada en la base): el motor corta con 0 escrituras
✅ P6) R8 (cerrada en la base): el motor corta con 0 escrituras
✅ P7) md5 de las líneas de R6, R8 y R9: idéntico antes y después (el probe no escribió nada)
⏸ D) sin sandbox (PSQL_CMD + LOCAL_JWT_SECRET): no se prueban los triggers

32/34 checks OK (sin la parte D: sandbox no disponible)
```

### Diff de `liquidaciones-engine.js` (`git diff main -- liquidaciones-engine.js` en la rama del PR #38)

(Los encabezados de hunk de git van como `[hunk …]`: sus dos arrobas caen en el chequeo de datos personales.)

```diff
diff --git a/liquidaciones-engine.js b/liquidaciones-engine.js
index 283c936..20ae568 100644
--- a/liquidaciones-engine.js
+++ b/liquidaciones-engine.js
[hunk -111,35 +111,52]
     }
     // ═══ CIERRE — FIN ═══
 
+    // ISSUE-104: toda lectura y escritura se chequea y, si falla, el motor CORTA y devuelve el
+    // error (los llamadores lo muestran en un toast). Seguir con datos a medias es lo que
+    // duplica plata: una lectura de líneas fallida deja paidKeys vacío y regenera lo ya cobrado
+    // como impago; un DELETE fallido deja las líneas viejas y el INSERT las duplica. Antes de
+    // borrar nada → "no se cambió nada"; después → "quedó incompleta, volvé a recalcular"
+    // (lo que falte reaparece al recalcular: faltan líneas, nunca sobran).
+    const corte = (paso, err) => ({ created: 0, headers: 0, preserved: 0,
+      error: `${paso} (${err?.message || err}): no se cambió nada` });
+    const cortePersistiendo = (paso, err) => ({ created: 0, headers: 0, preserved: 0,
+      error: `${paso} (${err?.message || err}): la liquidación quedó INCOMPLETA — volvé a recalcular la reunión` });
+
     // Config de reparto (la pasa la página; si no, la carga el motor).
     let liqConfig = opts.liqConfig;
     if (!liqConfig) {
-      const { data } = await sb.from('liquidacion_config')
+      const { data, error: cfgErr } = await sb.from('liquidacion_config')
         .select('*').eq('club_id', clubId).eq('activo', true).maybeSingle();
+      if (cfgErr) return corte('no se pudo leer liquidacion_config', cfgErr);
       liqConfig = data;
     }
     if (!liqConfig) return { created: 0, headers: 0, preserved: 0, error: 'sin liquidacion_config' };
 
     // ── Cargar datos de la reunión ───────────────────────────────────────
-    const [{ data: cars }, comCfgRes] = await Promise.all([
+    const [{ data: cars, error: carsErr }, comCfgRes] = await Promise.all([
       sb.from('carreras').select('id,numero_turno,numero_carrera_programa,bolsa_total,distribucion_premios').eq('reunion_id', rid),
       opts.comCfg ? Promise.resolve({ data: opts.comCfg })
                   : sb.from('comision_config').select('*').eq('club_id', clubId).eq('activo', true),
     ]);
+    if (carsErr) return corte('no se pudieron leer las carreras', carsErr);
+    if (comCfgRes.error) return corte('no se pudo leer comision_config', comCfgRes.error);
     const comCfg = comCfgRes.data || [];
     const carIds = (cars || []).map(c => c.id);
     if (!carIds.length) return { created: 0, headers: 0, preserved: 0, error: 'la reunión no tiene carreras' };
 
-    const [{ data: results }, { data: inscs }] = await Promise.all([
+    const [{ data: results, error: resErr }, { data: inscs, error: inscErr }] = await Promise.all([
       sb.from('resultados').select('id,carrera_id').in('carrera_id', carIds).eq('estado', 'oficial'),
       sb.from('inscripciones').select('*').in('carrera_id', carIds).neq('estado', 'forfait'),
     ]);
+    if (resErr) return corte('no se pudieron leer los resultados', resErr);
+    if (inscErr) return corte('no se pudieron leer las inscripciones', inscErr);
     const resIds = (results || []).map(r => r.id);
 
-    const { data: poss } = resIds.length
+    const { data: poss, error: possErr } = resIds.length
       ? await sb.from('resultado_posiciones').select('*')
           .in('resultado_id', resIds).not('posicion', 'is', null).eq('descalificado', false)
       : { data: [] };
+    if (possErr) return corte('no se pudieron leer las posiciones', possErr);
 
     // ── Fechas / pcts / incentivos (idéntico a generarLiquidaciones) ─────
     const diasAntidoping = parseInt(liqConfig.dias_antidoping) || 30;
[hunk -278,10 +295,11]
     // INCENTIVOS (Bloque C) — idéntico a generarLiquidaciones (jockey per-reunión dedup,
     // entrenador per-caballo). Las líneas de incentivo no llevan carrera_id (per-reunión).
     if (incJockey > 0 || incEntr > 0) {
-      const { data: largaron } = resIds.length
+      const { data: largaron, error: largErr } = resIds.length
         ? await sb.from('resultado_posiciones').select('inscripcion_id')
             .in('resultado_id', resIds).eq('no_largo', false)
         : { data: [] };
+      if (largErr) return corte('no se pudo leer quién largó', largErr);
       const jockeysSet = new Set();
       for (const lp of (largaron || [])) {
         const insc = (inscs || []).find(i => i.id === lp.inscripcion_id);
[hunk -308,11 +326,13]
 
     // ── PERSISTENCIA PAID-SAFE ───────────────────────────────────────────
     // 1. Cargar headers + líneas existentes de la reunión (preservar pagado, reusar headers).
-    const { data: existingLiqs } = await sb.from('liquidaciones')
+    const { data: existingLiqs, error: existErr } = await sb.from('liquidaciones')
       .select('id, profesional_id, propietario_id, estado, ' +
               'liquidacion_detalle(id,estado_linea,recibo_id,beneficiario_tipo,beneficiario_id,' +
               'concepto,concepto_tipo,inscripcion_id,posicion)')
       .eq('reunion_id', rid).eq('club_id', clubId);
+    // Sin esta lectura el motor cree que no hay nada pagado y vuelve a generar lo cobrado.
+    if (existErr) return corte('no se pudieron leer las liquidaciones existentes', existErr);
 
     const headerByActor = {};   // actorId -> header row
     const paidKeys = new Set(); // claves de líneas comprometidas (no regenerar)
[hunk -335,10 +355,12]
     //    Lo pagado se preserva; retenido sin recibo se recalcula.
     const allHeaderIds = (existingLiqs || []).map(h => h.id);
     if (allHeaderIds.length) {
-      await sb.from('liquidacion_detalle').delete()
+      const { error: delErr } = await sb.from('liquidacion_detalle').delete()
         .in('liquidacion_id', allHeaderIds)
         .is('recibo_id', null)
         .neq('estado_linea', 'pagado');
+      // Si el borrado falla, insertar duplicaría todo lo no pagado: se corta acá.
+      if (delErr) return corte('no se pudieron borrar las líneas no pagadas', delErr);
     }
 
     // 3. Construir líneas nuevas por actor (idéntico cálculo de detalleRows), saltear las
[hunk -398,7 +420,7]
         if (actorData.tipo === 'propietario') liqPayload.propietario_id = actorId;
         else if (actorData.tipo !== 'club')   liqPayload.profesional_id = actorId;
         const { data: liqData, error } = await sb.from('liquidaciones').insert(liqPayload).select().single();
-        if (error) { console.error('[engine] crear liquidación:', error); continue; }
+        if (error) { console.error('[engine] crear liquidación:', error); return cortePersistiendo('no se pudo crear una liquidación', error); }
         header = liqData;
         headerByActor[actorId] = liqData;
         paidCountByHeader[header.id] = 0;
[hunk -409,7 +431,7]
         const offset = paidCountByHeader[header.id] || 0;
         const dRows = freshRows.map((d, i) => ({ ...d, liquidacion_id: header.id, orden_display: offset + i + 1 }));
         const { error: detErr } = await sb.from('liquidacion_detalle').insert(dRows);
-        if (detErr) console.error('[engine] insertar detalle:', detErr);
+        if (detErr) { console.error('[engine] insertar detalle:', detErr); return cortePersistiendo('no se pudieron insertar las líneas', detErr); }
       }
     }
 
[hunk -417,10 +439,14]
     let headers = 0;
     for (const h of (existingLiqs || [])) survivingHeaderIds.add(h.id); // recompute todos los existentes
     for (const hid of survivingHeaderIds) {
-      const { count } = await sb.from('liquidacion_detalle')
+      const { count, error: cntErr } = await sb.from('liquidacion_detalle')
         .select('id', { count: 'exact', head: true }).eq('liquidacion_id', hid);
+      // Un conteo fallido NO es "header vacío": borrarlo arrastraría sus líneas (ON DELETE
+      // CASCADE), las pagadas incluidas.
+      if (cntErr) return cortePersistiendo('no se pudieron contar las líneas de una liquidación', cntErr);
       if (!count) {
-        await sb.from('liquidaciones').delete().eq('id', hid);
+        const { error: hdelErr } = await sb.from('liquidaciones').delete().eq('id', hid);
+        if (hdelErr) return cortePersistiendo('no se pudo borrar una liquidación vacía', hdelErr);
       } else {
         await recomputeHeaderTotals(sb, hid);
         headers++;
```
