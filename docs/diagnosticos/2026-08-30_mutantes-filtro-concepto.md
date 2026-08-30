# Mutation testing del filtro por concepto — 2 sobrevivientes + 2 asserts flojos

**Fecha:** 2026-08-30
**Rama del código:** `feat/filtro-concepto-pagos` — HEAD `b6988749917bd3213db0f6454d54bf1c95dd7b30` (pusheada, sin mergear)
**Rama de este informe:** `reports`
**Estado:** los 17 mutantes corridos. **15 mueren, 2 sobreviven.** Nada se tocó después de detectarlos, como pediste.

---

## Guards verificados

```
$ pwd
/home/clio/dev/SGH
```

```sql
SELECT count(*) AS spcs_count FROM spcs;
```
```json
[{"spcs_count":181}]
```

```
ref del proyecto: unlhcuanfrtpatoipwve
```

---

# 0. TL;DR

| | |
|---|---|
| Mutantes corridos | 17/17, en 4 tandas |
| Mueren | 15 |
| **Sobreviven** | **M7** (mutante equivalente — cláusula redundante en el código) y **M17** (bug del arnés, no del assert) |
| Asserts que NO miden lo que dicen medir | **F2b** y **F6** — los descubrió el detalle de "murieron" de M3 y M8 |
| Probe base | **32/32** con el HTML sano |
| Causa del SIGKILL anterior | **NO era OOM** — era el timeout de 120 s del harness |
| Residuo encontrado y limpiado | 5 líneas + 5 liquidaciones de la corrida cortada |
| Cambios aplicados | Sólo al runner del probe (tandas + limpieza preflight). **Cero cambios a `liquidaciones.html` después del diagnóstico.** |

---

# 1. PASO 1 — COMMIT Y PUSH (hecho primero, antes de nada)

## Commit del trabajo que estaba untracked

```
$ git branch --show-current
feat/filtro-concepto-pagos

$ git status --short
 M liquidaciones.html
?? tests/probe_filtro_concepto_pagos.mjs

$ git add liquidaciones.html tests/probe_filtro_concepto_pagos.mjs
$ git status --short
M  liquidaciones.html
A  tests/probe_filtro_concepto_pagos.mjs

$ git commit -m "feat: filtro por tipo de concepto en el detalle de Pagos" …
$ git push -u origin feat/filtro-concepto-pagos
To github.com:mdqclio/SGH.git
 * [new branch]      feat/filtro-concepto-pagos -> feat/filtro-concepto-pagos
branch 'feat/filtro-concepto-pagos' set up to track 'origin/feat/filtro-concepto-pagos'.

$ git ls-remote origin feat/filtro-concepto-pagos
6249a6a606f65988bff2a9c9256c7747f574d91d	refs/heads/feat/filtro-concepto-pagos

$ git rev-parse HEAD
6249a6a606f65988bff2a9c9256c7747f574d91d

$ git status --short
(vacío = todo commiteado)
```

SHA remoto = SHA local. **El trabajo estaba a salvo antes de correr un solo mutante.**

## Segundo commit — cambios al runner (tandas + preflight)

```
$ git commit -m "test: mutantes por tanda + limpieza preflight en el probe del filtro" …
$ git push origin feat/filtro-concepto-pagos
To github.com:mdqclio/SGH.git
   6249a6a..b698874  feat/filtro-concepto-pagos -> feat/filtro-concepto-pagos

$ git ls-remote origin feat/filtro-concepto-pagos
b6988749917bd3213db0f6454d54bf1c95dd7b30	refs/heads/feat/filtro-concepto-pagos

$ git rev-parse HEAD
b6988749917bd3213db0f6454d54bf1c95dd7b30
```

Los dos commits de la rama:

| SHA | Qué |
|---|---|
| `6249a6a` | la feature + el probe (32 asserts) |
| `b698874` | runner por tandas + limpieza preflight del probe |

`liquidaciones.html` **sólo cambió en `6249a6a`**. El segundo commit toca únicamente `tests/probe_filtro_concepto_pagos.mjs`.

---

# 2. CORRECCIÓN AL DIAGNÓSTICO: no era OOM, era el timeout

Tu hipótesis era OOM con 17 subprocesos. Medí y no da:

```
$ set -a; . ./.env; set +a
$ /usr/bin/time -f "%e s · %M KB max RSS" node tests/probe_filtro_concepto_pagos.mjs
26/32 OK
Command exited with non-zero status 1
13.10 s · 101136 KB max RSS
```

Dos cosas:

1. **Pico de memoria: 101 MB.** No hay presión de memoria.
2. **No había 17 subprocesos simultáneos.** El runner usa `execFileSync`, que es sincrónico:
   corre **un** hijo por vez y espera a que termine. Nunca hubo más de dos procesos node vivos.

Lo que sí pasa: **13,1 s × 17 mutantes ≈ 223 s**, contra un timeout de 120 s del harness que
ejecuta el comando. Un timeout se cobra con `SIGKILL`, y `128 + 9 = 137`, que es el exit code que
viste. El síntoma se parece al OOM killer porque los dos matan con la misma señal.

Corolario práctico: el arreglo no es bajar el paralelismo (no había), es **acortar cada
invocación**. De ahí las tandas.

---

# 3. EFECTO COLATERAL DEL SIGKILL: 5 líneas de residuo en la base

Al medir la corrida base salió **26/32**, no 32/32. Nada se había roto: la corrida anterior murió
con `SIGKILL` y **un `SIGKILL` no ejecuta el bloque `finally`**, así que sus fixtures quedaron
plantadas y la corrida siguiente arrancó con 14 líneas donde esperaba 9.

## Asserts que cayeron por el residuo

```
❌ F1d) el <tr> renderizado trae class="cob-row" y el data-grupo correcto por línea  → 14 filas · grupos=["premio","premio","premio","premio","premio","premio","premio","premio","premio","premio","premio","incentivo","incentivo","incentivo"]
❌ F1e) los chips son los grupos PRESENTES con el conteo real, y ninguno viene vacío  → ·Todo (14)··Premios (11)··Incentivo entrenador (3)·
❌ F3) cobEmitirIds = lo TILDADO (incluye ocultas), no lo visible  → 12 emitidos vs 12 tildados vs 2 visibles-tildados
❌ F3b) el importe del resumen del modal es la suma de lo TILDADO  → ·Beneficiario de prueba· · 12 línea(s) · ·$ 850.000,00·
❌ F0) el fixture es el esperado: 6 premios + 3 incentivos pagables, 2 retenidas  → pagables=14 premios=210000 incentivos=600000 · retenidas: 87359191, ab999ef2
❌ R4) no quedaron líneas del probe en la base  → [{"id":"b3263d74-1247-4822-b7af-f94d5957b341"},{"id":"d6b458ca-99fd-4a74-a6f6-73fd19be18ab"},{"id":"8a49e211-dcda-42b4-a2dc-a1efd0326c51"},{"id":"fd28e917-899d-45b7-9ae1-97f3f0fa1294"},{"id":"53d666e7-e2f8-46b5-b9a4-1dcd5be9b213"}]
```

Vale la pena notar que **F3 y F3b siguieron siendo internamente coherentes** (12 emitidos = 12
tildados ≠ 2 visibles): la invariante del filtro no se rompió, lo que falló fue el conteo esperado
del fixture. Y que **F0 y R4 detectaron el residuo**, que es justamente para lo que están.

## Identificación del residuo, antes de borrar nada

```sql
SELECT ld.id AS detalle_id, ld.liquidacion_id, ld.concepto, ld.concepto_tipo::text,
       ld.estado_linea::text, ld.recibo_id, ld.monto_neto, lq.club_id::text, lq.reunion_id::text
FROM liquidacion_detalle ld JOIN liquidaciones lq ON lq.id = ld.liquidacion_id
WHERE ld.concepto ILIKE 'TEST FILTRO CONCEPTO%' ORDER BY ld.concepto;
```
```json
[{"detalle_id":"b3263d74-1247-4822-b7af-f94d5957b341","liquidacion_id":"c2162504-4191-4c2a-9007-4d71d7a52abd","concepto":"TEST FILTRO CONCEPTO premio 1 mtg1uwvz","concepto_tipo":"premio","estado_linea":"impago","recibo_id":null,"monto_neto":"10000.00","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","reunion_id":"1d6ee50e-0a9d-4681-8e96-7bdec3a7816f"},
 {"detalle_id":"d6b458ca-99fd-4a74-a6f6-73fd19be18ab","liquidacion_id":"eb816120-19f1-44b9-9a1c-891125e6b32b","concepto":"TEST FILTRO CONCEPTO premio 2 mtg1uwvz","concepto_tipo":"premio","estado_linea":"impago","recibo_id":null,"monto_neto":"20000.00","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","reunion_id":"1d6ee50e-0a9d-4681-8e96-7bdec3a7816f"},
 {"detalle_id":"8a49e211-dcda-42b4-a2dc-a1efd0326c51","liquidacion_id":"4c7d19f4-59da-43f0-90f7-e7f665abb05e","concepto":"TEST FILTRO CONCEPTO premio 3 mtg1uwvz","concepto_tipo":"premio","estado_linea":"impago","recibo_id":null,"monto_neto":"30000.00","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","reunion_id":"1d6ee50e-0a9d-4681-8e96-7bdec3a7816f"},
 {"detalle_id":"fd28e917-899d-45b7-9ae1-97f3f0fa1294","liquidacion_id":"ef486401-8d67-441d-8d56-0ce0ad5b794b","concepto":"TEST FILTRO CONCEPTO premio 4 mtg1uwvz","concepto_tipo":"premio","estado_linea":"impago","recibo_id":null,"monto_neto":"40000.00","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","reunion_id":"1d6ee50e-0a9d-4681-8e96-7bdec3a7816f"},
 {"detalle_id":"53d666e7-e2f8-46b5-b9a4-1dcd5be9b213","liquidacion_id":"618cfc8a-1206-4170-926a-567cf0c0c036","concepto":"TEST FILTRO CONCEPTO premio 5 mtg1uwvz","concepto_tipo":"premio","estado_linea":"impago","recibo_id":null,"monto_neto":"50000.00","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","reunion_id":"1d6ee50e-0a9d-4681-8e96-7bdec3a7816f"}]
```

Las 5 son del club **`a6da7e40` = Mi Club Hípico** (sandbox, no Dolores), de un solo `RUN`
(`mtg1uwvz`), todas `impago` y con `recibo_id = null`. Es exactamente el estado de una corrida que
murió después de plantar `premio 1..5` y antes de `premio 6`.

Verificación de que las liquidaciones que las sostienen no tienen nada más colgando:

```sql
SELECT lq.id::text AS liquidacion_id, lq.club_id::text, lq.estado,
       count(ld.id) AS detalles_totales,
       count(ld.id) FILTER (WHERE ld.concepto ILIKE 'TEST FILTRO CONCEPTO%') AS detalles_del_probe
FROM liquidaciones lq LEFT JOIN liquidacion_detalle ld ON ld.liquidacion_id = lq.id
WHERE lq.id IN ('c2162504-4191-4c2a-9007-4d71d7a52abd','eb816120-19f1-44b9-9a1c-891125e6b32b',
                '4c7d19f4-59da-43f0-90f7-e7f665abb05e','ef486401-8d67-441d-8d56-0ce0ad5b794b',
                '618cfc8a-1206-4170-926a-567cf0c0c036')
GROUP BY 1,2,3;
```
```json
[{"liquidacion_id":"4c7d19f4-59da-43f0-90f7-e7f665abb05e","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","estado":"borrador","detalles_totales":1,"detalles_del_probe":1},
 {"liquidacion_id":"618cfc8a-1206-4170-926a-567cf0c0c036","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","estado":"borrador","detalles_totales":1,"detalles_del_probe":1},
 {"liquidacion_id":"c2162504-4191-4c2a-9007-4d71d7a52abd","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","estado":"borrador","detalles_totales":1,"detalles_del_probe":1},
 {"liquidacion_id":"eb816120-19f1-44b9-9a1c-891125e6b32b","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","estado":"borrador","detalles_totales":1,"detalles_del_probe":1},
 {"liquidacion_id":"ef486401-8d67-441d-8d56-0ce0ad5b794b","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","estado":"borrador","detalles_totales":1,"detalles_del_probe":1}]
```

`detalles_totales = detalles_del_probe = 1` en las cinco: no arrastran nada ajeno.

## Borrado

```sql
WITH d AS (DELETE FROM liquidacion_detalle WHERE concepto ILIKE 'TEST FILTRO CONCEPTO%'
           RETURNING id, liquidacion_id),
     l AS (DELETE FROM liquidaciones WHERE id IN (SELECT liquidacion_id FROM d) RETURNING id)
SELECT (SELECT count(*) FROM d) AS detalles_borrados,
       (SELECT count(*) FROM l) AS liquidaciones_borradas;
```
```json
[{"detalles_borrados":5,"liquidaciones_borradas":5}]
```

## Corrida base después de limpiar

```
$ set -a; . ./.env; set +a
$ node tests/probe_filtro_concepto_pagos.mjs
exit=0
 ✅ H5) un filtro cuyo grupo dejó de existir vuelve a "todo" en vez de dejar la tabla vacía  → cobFiltro=todo · lineas=9
 ✅ F0) el fixture es el esperado: 6 premios + 3 incentivos pagables, 2 retenidas  → pagables=9 premios=210000 incentivos=600000 · retenidas: 26685ab5, b57b0a95
 ✅ R1) restore por ESTADO: las líneas quedaron como estaban  → sin diferencias
 ✅ R2) y no hubo que restaurar nada a mano  → 0 línea(s)
 ✅ R3) no quedó ningún recibo del probe, en NINGÚN club  → []
 ✅ R4) no quedaron líneas del probe en la base  → []

32/32 OK
```

## Cambio que evita que se repita

Se agregó una **limpieza preflight** al arranque del probe, acotada al `TAG`. El `finally` cubre
la salida ordenada; esto cubre la brusca:

```javascript
    phase = 'preflight';
    // Un SIGKILL (timeout del harness, Ctrl-C) NO corre el `finally`, así que una corrida cortada
    // deja sus fixtures plantadas y la siguiente arranca con 14 líneas donde esperaba 9. Pasó el
    // 2026-08-30 y bajó el probe a 26/32 sin que nada estuviera roto. La limpieza va acá, al
    // arranque, y no sólo al final: el `finally` cubre la salida ordenada, esto cubre la brusca.
    // Acotado al TAG, que es exclusivo de este probe.
    const { data: restos } = await sb.from('liquidacion_detalle')
      .select('id,liquidacion_id').ilike('concepto', `${TAG}%`);
    if (restos?.length){
      console.log(`[preflight] ${restos.length} línea(s) de una corrida anterior cortada — se limpian`);
      await sb.from('liquidacion_detalle').delete().in('id', restos.map(r => r.id));
      await sb.from('liquidaciones').delete().in('id', [...new Set(restos.map(r => r.liquidacion_id))]);
    }
```

---

# 4. LOS 17 MUTANTES, EN 4 TANDAS — SALIDA CRUDA COMPLETA

Se agregó `--mutantes=M1,M2,…` al runner para poder correr una tanda en vez de los 17.

## Tanda 1/4 — M1 a M5

```
$ set -a && . ./.env && set +a && node tests/probe_filtro_concepto_pagos.mjs --mutantes=M1,M2,M3,M4,M5
exit=0

═══ MUTATION TESTING · 5/17 mutantes (tanda: M1,M2,M3,M4,M5) ═══
(copias en /tmp/mut-filtro-concepto-GYFZVK — el repo no se toca)

✅ M1 muere — cobrosFiltrar nunca aplica la clase de ocultar  [esperaba matar F1; murieron F1]
✅ M2 muere — el filtro invierte el match (oculta lo que debería mostrar)  [esperaba matar F1,F1b; murieron F1,F1b]
✅ M3 muere — FILTRAR ES SELECCIONAR: cobrosFiltrar pisa checked con la visibilidad  [esperaba matar F2,F2b; murieron F2]
✅ M4 muere — cobrosEmitir manda lo VISIBLE en vez de lo TILDADO  [esperaba matar F3,F3b; murieron F3,F3b]
✅ M5 muere — el total suma sólo las visibles  [esperaba matar F4,F4b; murieron F4,F4b]

✅ TODOS LOS MUTANTES DE LA TANDA MUEREN — 5 probados
```

## Tanda 2/4 — M6 a M10

```
$ set -a && . ./.env && set +a && node tests/probe_filtro_concepto_pagos.mjs --mutantes=M6,M7,M8,M9,M10
exit=1

═══ MUTATION TESTING · 5/17 mutantes (tanda: M6,M7,M8,M9,M10) ═══
(copias en /tmp/mut-filtro-concepto-f5uBXX — el repo no se toca)

✅ M6 muere — el aviso de tildadas fuera del filtro nunca se renderiza  [esperaba matar F5; murieron F5]
❌ M7 SOBREVIVE — el aviso se renderiza también sin filtro  [esperaba matar F5b]
✅ M8 muere — tildar/destildar visibles pierde el :not(.cob-row-oculta) y pisa las ocultas  [esperaba matar F6,F6b; murieron F6b]
✅ M9 muere — "tildar sólo estas" no destilda las ocultas primero  [esperaba matar F7; murieron F7]
✅ M10 muere — el rótulo se queda en "Tildar todo" con filtro puesto  [esperaba matar F8; murieron F8]

❌ 1 mutante(s) sobreviven — 5 probados
```

## Tanda 3/4 — M11 a M15

```
$ set -a && . ./.env && set +a && node tests/probe_filtro_concepto_pagos.mjs --mutantes=M11,M12,M13,M14,M15
exit=0

═══ MUTATION TESTING · 5/17 mutantes (tanda: M11,M12,M13,M14,M15) ═══
(copias en /tmp/mut-filtro-concepto-3jbuqt — el repo no se toca)

✅ M11 muere — el <tr> se renderiza sin data-grupo  [esperaba matar F1d; murieron F1d]
✅ M12 muere — los chips se arman desde el ENUM y no desde cobLineas (chip vacío)  [esperaba matar F1e; murieron F1e]
✅ M13 muere — habilitarLinea NO preserva: vuelve a resetear todo a tildado  [esperaba matar H1,H2; murieron H1,H2]
✅ M14 muere — la línea recién liberada entra TILDADA aunque quede fuera del filtro  [esperaba matar H3; murieron H3]
✅ M15 muere — habilitarLinea no avisa que la línea quedó fuera del filtro  [esperaba matar H4; murieron H4]

✅ TODOS LOS MUTANTES DE LA TANDA MUEREN — 5 probados
```

## Tanda 4/4 — M16 y M17

```
$ set -a && . ./.env && set +a && node tests/probe_filtro_concepto_pagos.mjs --mutantes=M16,M17
exit=1

═══ MUTATION TESTING · 2/17 mutantes (tanda: M16,M17) ═══
(copias en /tmp/mut-filtro-concepto-iCoGxw — el repo no se toca)

✅ M16 muere — un filtro que ya no existe se conserva y deja la tabla vacía  [esperaba matar H5; murieron H5]
❌ M17 SOBREVIVE — el mini-DOM devuelve [] ante selector desconocido en vez de tirar  [esperaba matar F9]

❌ 1 mutante(s) sobreviven — 2 probados
```

## Tablero

| Mutante | Qué neutraliza | Esperaba matar | Murieron | Veredicto |
|---|---|---|---|---|
| M1 | `cobrosFiltrar` nunca aplica la clase | F1 | F1 | ✅ muere |
| M2 | el filtro invierte el match | F1, F1b | F1, F1b | ✅ muere |
| M3 | **filtrar pisa `checked`** | F2, F2b | **F2** | ✅ muere · F2b no discrimina |
| M4 | **emitir manda lo VISIBLE** | F3, F3b | F3, F3b | ✅ muere |
| M5 | el total suma sólo visibles | F4, F4b | F4, F4b | ✅ muere |
| M6 | el aviso nunca se renderiza | F5 | F5 | ✅ muere |
| **M7** | el aviso se renderiza sin filtro | F5b | — | ❌ **SOBREVIVE** |
| M8 | tildar-visibles pisa las ocultas | F6, F6b | **F6b** | ✅ muere · F6 no discrimina |
| M9 | "tildar sólo estas" no destilda | F7 | F7 | ✅ muere |
| M10 | el rótulo no dice "visibles" | F8 | F8 | ✅ muere |
| M11 | el `<tr>` pierde `data-grupo` | F1d | F1d | ✅ muere |
| M12 | chips desde el ENUM | F1e | F1e | ✅ muere |
| M13 | `habilitarLinea` no preserva | H1, H2 | H1, H2 | ✅ muere |
| M14 | liberada entra tildada fuera del filtro | H3 | H3 | ✅ muere |
| M15 | no avisa que quedó fuera | H4 | H4 | ✅ muere |
| M16 | filtro inexistente se conserva | H5 | H5 | ✅ muere |
| **M17** | el mini-DOM no tira | F9 | — | ❌ **SOBREVIVE** |

**Los tres que más importaban mueren:** M3 (filtrar es seleccionar), M4 (emitir lo visible),
M5 (total sobre lo visible). Es el punto 3 de tu pedido escrito como mutante.

---

# 5. SOBREVIVIENTE 1 — M7: mutante equivalente

## Qué hace el mutante

Saca la primera mitad del guard de `cobrosRenderAvisoOculto`:

```javascript
// original
if (cobFiltro === 'todo' || !ocultas.length) { fila.innerHTML = ''; return; }
// M7
if (!ocultas.length) { fila.innerHTML = ''; return; }
```

## Por qué sobrevive

Porque **no cambia el comportamiento en ningún estado alcanzable.** `cobrosFiltrar('todo')`
saca la clase `cob-row-oculta` de **todas** las filas:

```javascript
document.querySelectorAll('#cob-detalle tr.cob-row').forEach(tr => {
  tr.classList.toggle('cob-row-oculta', !(grupo === 'todo' || tr.dataset.grupo === grupo));
});
```

Con `grupo === 'todo'` la expresión es `toggle(..., false)` para toda fila. Así que
`cobFiltro === 'todo'` **implica** cero filas ocultas, y entonces `!ocultas.length` ya corta sola.
Las dos cláusulas son redundantes entre sí.

Y `cobFiltro` nunca queda en `'todo'` sin que `cobrosFiltrar` corra: en `cobrosDetalle` la
asignación (`cobFiltro = … ? filtroPrevio : 'todo'`) va seguida siempre de `cobrosFiltrar(cobFiltro)`.

## Verificación — no es razonamiento, se enumeró el espacio de estados

Se extrajeron las funciones reales del HTML y se corrieron **las 343 combinaciones de 3
operaciones de UI** (`filtrar todo` / `filtrar premio` / `filtrar incentivo` / `tildar visibles` /
`destildar visibles` / `tildar sólo visibles` / `togglear un checkbox`), buscando un estado con
`cobFiltro === 'todo'` **y** filas ocultas — que es el único estado en que M7 sería observable:

```
secuencias probadas: 343 (todas las combinaciones de 3 operaciones de UI)
estados con cobFiltro==='todo' Y filas ocultas: 0

⇒ M7 ES UN MUTANTE EQUIVALENTE: `cobFiltro === 'todo'` implica 0 ocultas en todo estado
  alcanzable, así que `!ocultas.length` ya corta solo. La cláusula es redundancia defensiva.
```

(El script de verificación fue temporal, en la raíz del repo para que node resolviera
`node_modules`, y se borró al terminar. No quedó en el repo.)

## Qué significa

**No es un agujero del probe: F5b está bien.** Es que el código tiene una cláusula muerta. Un
mutante equivalente es, por definición, imposible de matar con un test — sólo se puede eliminar
sacando la redundancia del código.

## Opciones, sin tocar nada todavía

| Opción | Qué implica |
|---|---|
| **(a) Dejarlo y documentarlo** | Se anota M7 como equivalente conocido en el probe. La cláusula queda como guarda defensiva: si algún día algo pusiera `cob-row-oculta` sin pasar por `cobrosFiltrar`, sigue cubriendo. Cero riesgo. |
| **(b) Sacar `cobFiltro === 'todo' \|\|` del código** | El mutante deja de ser aplicable y el conteo queda 16/16 limpio. Pero se pierde la guarda defensiva y el aviso pasa a depender sólo de la invariante de `cobrosFiltrar`. |
| **(c) Escribir un assert que fuerce el estado imposible** | Habría que ensuciar el DOM a mano salteando `cobrosFiltrar`. Sería testear un estado que la UI no puede producir: ruido, no cobertura. |

**Recomendación: (a).** La cláusula cuesta nada y el modo de falla que cubriría —una fila oculta
con el filtro en "Todo"— es de los que no dan síntoma visible. Un mutante equivalente identificado
y documentado es un resultado válido del mutation testing, no una deuda.

---

# 6. SOBREVIVIENTE 2 — M17: bug del arnés, no del assert

## Qué hace el mutante

Es el único mutante que muta **el probe** y no el HTML: reemplaza el `throw` del mini-DOM ante un
selector desconocido por un `return []`. Debería matar a `F9`, que es el que verifica que el
mini-DOM tira.

## Por qué sobrevive

**F9 nunca llega a correr.** El runner escribe la copia mutada en un tmpdir
(`/tmp/mut-filtro-concepto-*/M17.mjs`) y la ejecuta desde ahí. Esa copia importa
`@supabase/supabase-js` y `./lib/estado_lineas.mjs`, y **desde `/tmp` no hay `node_modules` ni
`lib/` que resolver**: el proceso muere en el import, antes de la primera línea de código.

Salida del proceso mutado, corrido a mano:

```
$ set -a && . ./.env && set +a && node /tmp/mut-filtro-concepto-iCoGxw/M17.mjs
exit=1
node:internal/modules/package_json_reader:314
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null);
        ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@supabase/supabase-js' imported from /tmp/mut-filtro-concepto-iCoGxw/M17.mjs
    at Object.getPackageJSONURL (node:internal/modules/package_json_reader:314:9)
    at packageResolve (node:internal/modules/esm/resolve:768:81)
    at moduleResolve (node:internal/modules/esm/resolve:855:18)
    at defaultResolve (node:internal/modules/esm/resolve:985:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:731:20)
    at ModuleLoader.resolve (node:internal/modules/esm/loader:708:38)
    at ModuleLoader.getModuleJobForImport (node:internal/modules/esm/loader:310:38)
```

Sin `❌ F9)` en la salida, el runner concluye "no murió ningún assert" y lo reporta como
sobreviviente. **Es un falso positivo del arnés, de la misma familia que GOTCHA #82** (el `\b` que
no separaba `U4` de `U4b`): el runner mintiendo sobre el código, no el código fallando.

Prueba de que `F9` sí funciona con el probe sano — está en verde en la corrida base:

```
✅ F9) el mini-DOM TIRA ante un selector desconocido (si devolviera [] el probe daría falso verde)  → selDesconocido=.cob-chk[value="x"]
```

## Opciones, sin tocar nada todavía

| Opción | Qué implica |
|---|---|
| **(a) Escribir la copia mutada del probe al lado del original** (`tests/M17.mjs`, borrada al terminar) en vez de en `/tmp` | Resuelve los imports y M17 pasa a correr de verdad. Riesgo: escribe dentro del repo, aunque sea efímero — habría que asegurar el borrado incluso ante SIGKILL, que es justamente lo que no está garantizado (ver §3). |
| **(b) Mutar el probe en un tmpdir con symlinks a `node_modules` y `lib/`** | No toca el repo. Dos symlinks al crear el tmpdir. |
| **(c) Hacer que el runner distinga "murió por assert" de "murió por error de arranque"** | Si la salida no tiene el bloque de resultados, reportar `ERROR DE ARNÉS` en vez de `SOBREVIVE`. No arregla M17, pero **evita que un fallo de arnés se disfrace de sobreviviente** — que es el problema real y el que puede volver a morder en cualquier mutante futuro. |
| **(d) Sacar M17** | Se pierde la única verificación de que el guard del mini-DOM sirve. |

**Recomendación: (b) + (c).** (b) hace correr M17; (c) es la lección general — el arnés tiene que
poder decir "no sé" en vez de decir "sobrevive". Sin (c), el próximo mutante que falle al arrancar
va a volver a leerse como agujero de cobertura.

---

# 7. HALLAZGO EXTRA — dos asserts que no miden lo que dicen medir

No los pediste, pero salieron del detalle de "murieron" y son exactamente la clase de cosa que
buscabas. **Los dos mutantes correspondientes murieron igual**, por otro assert; el problema es que
el assert que el plan nombraba como responsable no es el que hizo el trabajo.

## F2b no discrimina M3

```
✅ M3 muere — FILTRAR ES SELECCIONAR: cobrosFiltrar pisa checked con la visibilidad  [esperaba matar F2,F2b; murieron F2]
```

`F2b` filtra a `incentivo`, vuelve a `todo` y compara el vector contra el inicial (todo tildado).
Bajo M3: filtrar a `incentivo` pone los premios en `false`; volver a `todo` pone **todo** en `true`,
porque con `'todo'` todas las filas son visibles. El vector vuelve a ser el inicial y `F2b` pasa.

El plan decía que F2b *"cubre el caso de que el filtro por sí solo pise la selección"*. **No lo
cubre**: sólo lo cubre cuando el estado inicial no es uniforme. `F2` —que arranca de un vector con
destildados— es el que realmente mata a M3.

Arreglo posible: que `F2b` arranque de un vector no uniforme (destildar una fila antes de filtrar
y desfiltrar). Con eso M3 lo mataría también.

## F6 no discrimina M8

```
✅ M8 muere — tildar/destildar visibles pierde el :not(.cob-row-oculta) y pisa las ocultas  [esperaba matar F6,F6b; murieron F6b]
```

`F6` deja los 6 premios ya tildados, filtra a `incentivo`, hace `tildarVisibles(true)` y espera
las 9 en `true`. Bajo M8 —que tilda **todas**— el resultado es igualmente las 9 en `true`. El
estado esperado y el estado con bug coinciden: **`F6` no puede distinguirlos.** `F6b` es el que
mata a M8.

Arreglo posible: en `F6`, dejar las ocultas **destildadas** antes de `tildarVisibles(true)`, así
"no toca las ocultas" se vuelve observable.

---

# 8. NÚMEROS DE RESUMEN

| Métrica | Valor |
|---|---|
| Asserts del probe | 32 (F0–F9, H1–H5, R1–R4) |
| Corrida base con el HTML sano | **32/32** |
| Mutantes definidos | 17 |
| Mutantes que mueren | **15** |
| Mutantes que sobreviven | **2** — M7 (equivalente), M17 (falso positivo del arnés) |
| Sobrevivientes que son agujero real de cobertura | **0** |
| Asserts con cobertura más angosta de lo que dice el plan | **2** — F2b, F6 (los dos mutantes murieron igual, por F2 y F6b) |
| Tiempo por corrida del probe | 13,1 s |
| Pico de memoria | 101 MB |
| Duración de las 4 tandas | ~3,7 min en total |

---

# 9. QUÉ SE TOCÓ Y QUÉ NO

**Se tocó** (commiteado y pusheado en `b698874`, sólo el archivo del probe):
- `--mutantes=M1,M2,…` para correr por tandas.
- Limpieza preflight de residuo por `TAG`.
- El docstring, con la nota del timeout.

**No se tocó** (respetando "decime cuál y por qué antes de tocar nada"):
- `liquidaciones.html` — sin un solo cambio después del diagnóstico. Sigue en el estado de `6249a6a`.
- La cláusula `cobFiltro === 'todo' ||` de M7.
- El runner de mutantes en lo que hace a M17.
- `F2b` y `F6`.

---

# 10. PREGUNTAS ABIERTAS

1. **M7** — ¿(a) dejarlo y documentarlo como equivalente conocido, o (b) sacar la cláusula
   redundante del código? Recomiendo (a).
2. **M17** — ¿(b) symlinks en el tmpdir para que corra + (c) que el runner distinga "error de
   arranque" de "sobrevive"? Recomiendo las dos; (c) importa más que (b) porque es general.
3. **F2b y F6** — ¿los ajusto para que discriminen? Son dos cambios de fixture de dos líneas cada
   uno. Los mutantes ya mueren por otro assert, así que no hay riesgo abierto: es cerrar la brecha
   entre lo que el plan dice que cubre cada assert y lo que cubre de verdad.
4. **¿Se mergea `feat/filtro-concepto-pagos`?** Está pusheada, sin mergear, esperando tu OK.
   No hay verificación contra prod todavía porque no está en `main`.

---

# 11. VERIFICACIÓN DE PUBLICACIÓN

## Rama de trabajo `feat/filtro-concepto-pagos` (el código)

```
$ git push origin feat/filtro-concepto-pagos
To github.com:mdqclio/SGH.git
   6249a6a..b698874  feat/filtro-concepto-pagos -> feat/filtro-concepto-pagos

$ git ls-remote origin feat/filtro-concepto-pagos
b6988749917bd3213db0f6454d54bf1c95dd7b30	refs/heads/feat/filtro-concepto-pagos

$ git rev-parse HEAD          # estando en feat/filtro-concepto-pagos
b6988749917bd3213db0f6454d54bf1c95dd7b30
```

## Rama `reports` (este informe)

```
$ git push origin reports
To github.com:mdqclio/SGH.git
   0cb9d05..35905f6  reports -> reports

$ git ls-remote origin reports
35905f6be571c4e49469a2a94a8cdeabcdd8c75c	refs/heads/reports

$ git rev-parse HEAD          # estando en reports
35905f6be571c4e49469a2a94a8cdeabcdd8c75c
```

Los SHA de `ls-remote` coinciden con los de `rev-parse HEAD` en las dos ramas: las dos están en
`origin`. Ninguna se mergeó a `main`.

*(Esta sección se agregó en un commit posterior — su propio SHA queda en el `git log` de la rama.)*
