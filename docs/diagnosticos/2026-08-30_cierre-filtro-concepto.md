# Cierre del filtro por concepto — M17 muere, mergeado y verificado contra prod

**Fecha:** 2026-08-30
**SHA de `main`:** `2821c7c223a00d6f9bb53c8ea389a145f0efb424` (merge `--no-ff`)
**Rama de trabajo:** `feat/filtro-concepto-pagos` — HEAD `e5a02bdf39486149aab5c745cb97edc8859a59d6`, mergeada
**Rama de este informe:** `reports`
**Continúa:** `docs/diagnosticos/2026-08-30_mutantes-filtro-concepto.md`

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
| **M17** | **muere** — con los symlinks al tmpdir, `F9` corre y lo mata |
| **M7** | declarado **EQUIVALENTE**, sobrevive por diseño, no cuenta como falla |
| Mutantes | **17/17 · 16 mueren + 1 equivalente · 0 sobrevivientes · 0 errores de arnés** |
| Probe contra el HTML local | **32/32** |
| Probe contra el **HTML servido por `sigh.com.ar`** | **32/32** |
| md5 local = commit = prod | `63d7fc970601b7b2ca5bc91f52bf44c8` |
| Merge | `--no-ff` → `main` `2821c7c`, pusheado |
| GOTCHAS | **#83** (timeout) y **#84** (arnés ≠ sobreviviente). Contador CLAUDE.md 82 → 84 |
| Latencia del CDN | ~65 s desde el push hasta servir la versión nueva |

---

# 1. M7 — declarado equivalente (opción a)

Se dejó la cláusula en el código, tal como decidiste. Lo que cambió es que ahora el runner **sabe**
que M7 es equivalente y por qué, en vez de reportarlo como sobreviviente:

```javascript
  // EQUIVALENTE DECLARADO (verificado el 2026-08-30 enumerando las 343 combinaciones de 3
  // operaciones de UI: cero estados con cobFiltro==='todo' Y filas ocultas). cobrosFiltrar('todo')
  // saca la clase de TODAS las filas, así que `cobFiltro === 'todo'` implica `!ocultas.length` y
  // las dos mitades del guard son redundantes entre sí. Se deja la cláusula: no cuesta nada y
  // cubre el caso —hoy inalcanzable— de que algo marque una fila oculta sin pasar por
  // cobrosFiltrar. Sacarla para que el mutante muera sería optimizar la métrica, no el código.
  { id:'M7', desc:'el aviso se renderiza también sin filtro', mata:['F5b'],
    equivalente: "cobFiltro==='todo' implica 0 filas ocultas en todo estado alcanzable, así que "
               + "`!ocultas.length` ya corta solo — ningún test puede distinguir las dos versiones",
    from:`  if (cobFiltro === 'todo' || !ocultas.length) { fila.innerHTML = ''; return; }`,
    to:  `  if (!ocultas.length) { fila.innerHTML = ''; return; }` },
```

El runner lo trata así:

```javascript
    // Mutante EQUIVALENTE declarado: no cambia el comportamiento en ningún estado alcanzable, así
    // que ningún test puede matarlo. Sobrevivir es el resultado correcto y no cuenta como falla.
    // Si algún día MUERE, es que el código cambió y la equivalencia dejó de valer: eso sí se
    // reporta como problema.
    if (m.equivalente) {
      equivalentes++;
      if (vivo) console.log(`✅ ${m.id} EQUIVALENTE (sobrevive por diseño) — ${m.desc}\n     ↳ ${m.equivalente}`);
      else { vivos++; console.log(`❌ ${m.id} declarado EQUIVALENTE pero MURIÓ (${muertos.join(',')}) — la equivalencia ya no vale, revisar. ${m.desc}`); }
      continue;
    }
```

El caso "declarado equivalente pero murió" también se reporta: si alguien toca `cobrosFiltrar` y la
equivalencia deja de valer, no pasa desapercibido.

---

# 2. M17 — (c) primero, después (b)

## (c) El tercer estado del runner — la prioridad

El runner concluía "sobrevive" cuando no encontraba `❌ <assert>)` en la salida del hijo. Esa
ausencia tenía **dos causas que no se parecen en nada** y se reportaban igual. Ahora hay un tercer
estado:

```javascript
    // ── "murió por assert" vs "murió al arrancar" ────────────────────────────
    // El probe siempre cierra con una línea "NN/NN OK". Si no está, el hijo no llegó a correr los
    // asserts (import roto, fixture que no se pudo plantar, la base caída) y NO se sabe nada sobre
    // el mutante. Reportar eso como SOBREVIVE es mentir: se lee como agujero de cobertura cuando
    // es un fallo del arnés. Es la segunda vez que pasa —la primera fue el \b entre 4 y b, GOTCHA
    // #82—, así que ahora el runner tiene un tercer estado y puede decir "no sé".
    const corrio = /^\d+\/\d+ OK$/m.test(out);
    if (!corrio) {
      const causa = (out.split('\n').find(l => /Error|error:/.test(l)) || '(sin línea de error)').trim();
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el probe no llegó a correr los asserts. ${m.desc}`
        + `\n     ↳ ${causa.slice(0, 160)}`);
      arnes++; continue;
    }
```

Los dos estados de falla cuentan para el exit code:

```javascript
  process.exit(vivos === 0 && arnes === 0 ? 0 : 1);
```

El "ancla que no existe" también pasó de `❌ NO APLICABLE` (que se sumaba a `vivos`) a
`⚠ ERROR DE ARNÉS`, que es lo que realmente es.

### Verificación de (c): un canario, no una suposición

No alcanza con escribir el `if` y suponer que se dispara. Se construyó un **mutante canario** que
rompe el probe en tiempo de parseo —el hijo muere antes de la primera línea— y se corrió junto a
M17 para ver los dos caminos en la misma salida. El canario vivió en una copia temporal
(`tests/_canario_arnes.mjs`), se corrió y se borró; no quedó en el repo.

```javascript
  { id:'MX', desc:'CANARIO: rompe el probe al arrancar (no deberia leerse como SOBREVIVE)', mata:['F9'],
    from:`const results = [];`,
    to:  `const results = [] this is not valid javascript;`,
    archivo: 'probe' },
```

```
$ set -a && . ./.env && set +a && node tests/_canario_arnes.mjs --mutantes=MX,M17

═══ MUTATION TESTING · 2/18 mutantes (tanda: MX,M17) ═══
(copias en /tmp/mut-filtro-concepto-8waFev — el repo no se toca)

⚠ MX ERROR DE ARNÉS — el probe no llegó a correr los asserts. CANARIO: rompe el probe al arrancar (no deberia leerse como SOBREVIVE)
     ↳ SyntaxError: Unexpected token 'this'
✅ M17 muere — el mini-DOM devuelve [] ante selector desconocido en vez de tirar  [esperaba matar F9; murieron F9]

❌ TANDA CON HALLAZGOS — 2 probados · 1 muertos o equivalentes · 1 ERROR DE ARNÉS

exit=1
```

**Con el runner viejo, `MX` habría dicho `SOBREVIVE`** — exactamente el disfraz que veníamos
arrastrando. Ahora dice qué pasó y muestra la causa.

## (b) Que M17 pueda correr

Dos symlinks al crear el tmpdir, más `LIQ_HTML` explícito (el default
`join(HERE,'..','liquidaciones.html')` apunta a `/tmp/liquidaciones.html` desde una copia en `/tmp`):

```javascript
  // Un mutante del PROBE se ejecuta desde el tmpdir, y desde ahí node no resuelve
  // '@supabase/supabase-js' ni './lib/estado_lineas.mjs': el proceso moría en el import, antes de
  // la primera línea, y el runner lo leía como sobreviviente (era M17, 2026-08-30). Dos symlinks
  // lo arreglan sin copiar nada ni escribir dentro del repo.
  try {
    symlinkSync(join(HERE, '..', 'node_modules'), join(dir, 'node_modules'), 'dir');
    symlinkSync(join(HERE, 'lib'), join(dir, 'lib'), 'dir');
  } catch (e) { console.warn(`[runner] no pude symlinkear deps al tmpdir: ${e.message}`); }
```

```javascript
    const env = { ...process.env, LIQ_HTML: esProbe ? HTML_PATH : path };
```

No se escribe nada dentro del repo: los symlinks viven en el tmpdir, que es descartable.

---

# 3. LOS 17 MUTANTES, RE-CORRIDOS — SALIDA CRUDA COMPLETA

## Tanda 1/4 — M1 a M5

```
$ set -a && . ./.env && set +a && node tests/probe_filtro_concepto_pagos.mjs --mutantes=M1,M2,M3,M4,M5
exit=0

═══ MUTATION TESTING · 5/17 mutantes (tanda: M1,M2,M3,M4,M5) ═══
(copias en /tmp/mut-filtro-concepto-DXWDJ3 — el repo no se toca)

✅ M1 muere — cobrosFiltrar nunca aplica la clase de ocultar  [esperaba matar F1; murieron F1]
✅ M2 muere — el filtro invierte el match (oculta lo que debería mostrar)  [esperaba matar F1,F1b; murieron F1,F1b]
✅ M3 muere — FILTRAR ES SELECCIONAR: cobrosFiltrar pisa checked con la visibilidad  [esperaba matar F2,F2b; murieron F2]
✅ M4 muere — cobrosEmitir manda lo VISIBLE en vez de lo TILDADO  [esperaba matar F3,F3b; murieron F3,F3b]
✅ M5 muere — el total suma sólo las visibles  [esperaba matar F4,F4b; murieron F4,F4b]

✅ TANDA LIMPIA — 5 probados · 5 muertos o equivalentes
```

## Tanda 2/4 — M6 a M10 (la de M7)

```
$ set -a && . ./.env && set +a && node tests/probe_filtro_concepto_pagos.mjs --mutantes=M6,M7,M8,M9,M10
exit=0

═══ MUTATION TESTING · 5/17 mutantes (tanda: M6,M7,M8,M9,M10) ═══
(copias en /tmp/mut-filtro-concepto-xeEzXh — el repo no se toca)

✅ M6 muere — el aviso de tildadas fuera del filtro nunca se renderiza  [esperaba matar F5; murieron F5]
✅ M7 EQUIVALENTE (sobrevive por diseño) — el aviso se renderiza también sin filtro
     ↳ cobFiltro==='todo' implica 0 filas ocultas en todo estado alcanzable, así que `!ocultas.length` ya corta solo — ningún test puede distinguir las dos versiones
✅ M8 muere — tildar/destildar visibles pierde el :not(.cob-row-oculta) y pisa las ocultas  [esperaba matar F6,F6b; murieron F6b]
✅ M9 muere — "tildar sólo estas" no destilda las ocultas primero  [esperaba matar F7; murieron F7]
✅ M10 muere — el rótulo se queda en "Tildar todo" con filtro puesto  [esperaba matar F8; murieron F8]

✅ TANDA LIMPIA — 5 probados · 5 muertos o equivalentes · 1 equivalente(s) declarado(s)
```

La tanda ahora sale **exit=0**: M7 dejó de contar como falla, porque no lo es.

## Tanda 3/4 — M11 a M15

```
$ set -a && . ./.env && set +a && node tests/probe_filtro_concepto_pagos.mjs --mutantes=M11,M12,M13,M14,M15
exit=0

═══ MUTATION TESTING · 5/17 mutantes (tanda: M11,M12,M13,M14,M15) ═══
(copias en /tmp/mut-filtro-concepto-WSdf6E — el repo no se toca)

✅ M11 muere — el <tr> se renderiza sin data-grupo  [esperaba matar F1d; murieron F1d]
✅ M12 muere — los chips se arman desde el ENUM y no desde cobLineas (chip vacío)  [esperaba matar F1e; murieron F1e]
✅ M13 muere — habilitarLinea NO preserva: vuelve a resetear todo a tildado  [esperaba matar H1,H2; murieron H1,H2]
✅ M14 muere — la línea recién liberada entra TILDADA aunque quede fuera del filtro  [esperaba matar H3; murieron H3]
✅ M15 muere — habilitarLinea no avisa que la línea quedó fuera del filtro  [esperaba matar H4; murieron H4]

✅ TANDA LIMPIA — 5 probados · 5 muertos o equivalentes
```

## Tanda 4/4 — M16 y M17 (la que importaba)

```
$ set -a && . ./.env && set +a && node tests/probe_filtro_concepto_pagos.mjs --mutantes=M16,M17
exit=0

═══ MUTATION TESTING · 2/17 mutantes (tanda: M16,M17) ═══
(copias en /tmp/mut-filtro-concepto-G7dKNf — el repo no se toca)

✅ M16 muere — un filtro que ya no existe se conserva y deja la tabla vacía  [esperaba matar H5; murieron H5]
✅ M17 muere — el mini-DOM devuelve [] ante selector desconocido en vez de tirar  [esperaba matar F9; murieron F9]

✅ TANDA LIMPIA — 2 probados · 2 muertos o equivalentes
```

**M17 muere.** `F9` lo mata, que es lo que decía el diagnóstico: el assert siempre estuvo bien, lo
que no corría era el proceso.

## Tablero final

| Mutante | Antes | Ahora |
|---|---|---|
| M1 – M6 | ✅ muere | ✅ muere |
| **M7** | ❌ SOBREVIVE | ✅ **EQUIVALENTE (por diseño)** |
| M8 – M16 | ✅ muere | ✅ muere |
| **M17** | ❌ SOBREVIVE | ✅ **muere** |

**17/17 · 16 mueren + 1 equivalente declarado · 0 sobrevivientes · 0 errores de arnés.**

---

# 4. MERGE `--no-ff` A MAIN

```
$ git checkout main && git pull origin main
$ git log --oneline -1
cb5b77c merge: ISSUE-056 cerrado + GOTCHAS #81 y #82

$ git merge --no-ff feat/filtro-concepto-pagos -m "merge: filtro por tipo de concepto en el detalle de Pagos" …
 docs/GOTCHAS.md                       | 136 +++++++
 liquidaciones.html                    | 186 +++++++++-
 tests/probe_filtro_concepto_pagos.mjs | 680 ++++++++++++++++++++++++++++++++++
 4 files changed, 997 insertions(+), 7 deletions(-)
 create mode 100644 tests/probe_filtro_concepto_pagos.mjs

$ git push origin main
To github.com:mdqclio/SGH.git
   cb5b77c..2821c7c  main -> main

$ git ls-remote origin main
2821c7c223a00d6f9bb53c8ea389a145f0efb424	refs/heads/main

$ git rev-parse HEAD
2821c7c223a00d6f9bb53c8ea389a145f0efb424

$ git log --oneline -4
2821c7c merge: filtro por tipo de concepto en el detalle de Pagos
e5a02bd test: el runner distingue ERROR DE ARNES de SOBREVIVE + GOTCHAS 83 y 84
b698874 test: mutantes por tanda + limpieza preflight en el probe del filtro
6249a6a feat: filtro por tipo de concepto en el detalle de Pagos
```

Los cuatro commits de la rama quedan visibles en la historia gracias al `--no-ff`.

---

# 5. VERIFICACIÓN CONTRA PROD — md5

```bash
$ git show 2821c7c:liquidaciones.html > $SP/local.html
$ md5sum $SP/local.html
63d7fc970601b7b2ca5bc91f52bf44c8  …/local.html

$ for i in $(seq 1 20); do
    curl -s "https://sigh.com.ar/liquidaciones.html?v=$RANDOM$i" -o $SP/prod.html
    …comparar md5, cortar si coincide, si no dormir 20 s…
  done
intento 1 · 17:35:07 · prod=0189ecbe749cde1bf4cfa0528162f329 (viejo)
intento 2 · 17:35:27 · prod=0189ecbe749cde1bf4cfa0528162f329 (viejo)
intento 3 · 17:35:48 · prod=0189ecbe749cde1bf4cfa0528162f329 (viejo)
intento 4 · 17:36:08 · prod=63d7fc970601b7b2ca5bc91f52bf44c8 ← COINCIDE
```

Las tres copias, iguales:

```
$ md5sum $SP/local.html $SP/prod.html liquidaciones.html
63d7fc970601b7b2ca5bc91f52bf44c8  …/local.html          ← el commit 2821c7c
63d7fc970601b7b2ca5bc91f52bf44c8  …/prod.html           ← lo que sirve sigh.com.ar
63d7fc970601b7b2ca5bc91f52bf44c8  liquidaciones.html    ← el working tree
```

El md5 viejo (`0189ecbe…`) es el de la versión de ISSUE-056, que era lo que estaba en prod hasta
este merge. **Latencia del CDN: ~65 s** entre el push y la versión nueva servida (el push fue a las
17:35:00 aprox., el md5 coincidió a las 17:36:08).

---

# 6. PROBE CONTRA EL HTML SERVIDO POR PROD

No contra el archivo local: contra el `.html` que bajó `curl` de `sigh.com.ar`.

```
$ set -a && . ./.env && set +a && LIQ_HTML=$SP/prod.html node tests/probe_filtro_concepto_pagos.mjs
exit=0

── Probe · filtro por tipo de concepto en el detalle de Pagos ──
   html=/tmp/claude-1000/-home-clio-dev-SGH/4e92703c-295b-415c-81af-7c6ec9d3cd7a/scratchpad/prod.html
 ✅ F1d) el <tr> renderizado trae class="cob-row" y el data-grupo correcto por línea  → 9 filas · grupos=["premio","premio","premio","premio","premio","premio","incentivo","incentivo","incentivo"]
 ✅ F1e) los chips son los grupos PRESENTES con el conteo real, y ninguno viene vacío  → ·Todo (9)··Premios (6)··Incentivo entrenador (3)·
 ✅ F1) filtrar por un grupo oculta TODAS las filas de los otros grupos  → [true,true,true,true,true,true,false,false,false]
 ✅ F1b) y no oculta ninguna del grupo elegido  → [true,true,true,true,true,true,false,false,false]
 ✅ F1c) volver a "Todo" no deja ninguna fila oculta  → [false,false,false,false,false,false,false,false,false]
 ✅ F2b) filtrar y desfiltrar sin tocar nada deja el vector de checked idéntico  → antes=[true,true,true,true,true,true,true,true,true] después=[true,true,true,true,true,true,true,true,true]
 ✅ F2) tildar con filtro → sacar el filtro → el vector de checked es EXACTAMENTE el esperado  → esperado=[false,true,true,true,true,true,false,true,true] real=[false,true,true,true,true,true,false,true,true]
 ✅ F3) cobEmitirIds = lo TILDADO (incluye ocultas), no lo visible  → 7 emitidos vs 7 tildados vs 2 visibles-tildados
 ✅ F3b) el importe del resumen del modal es la suma de lo TILDADO  → ·Beneficiario de prueba· · 7 línea(s) · ·$ 700.000,00·
 ✅ F4) con filtro puesto el total = suma de lo TILDADO, visible u oculto  → $ 700.000,00 (esperado 700000)
 ✅ F4b) destildar una fila OCULTA cambia el total  → $ 700.000,00 → $ 680.000,00
 ✅ F5) el aviso aparece y nombra el conteo y el importe de lo tildado-oculto  → ·⚠ 5 línea(s) tildada(s) fuera del filtro · $ 200.000,00 — el recibo LAS INCLUYE. ·Ver todo··
 ✅ F5b) con filtro en "Todo" el aviso no está, aunque haya destildadas  → aviso=""
 ✅ F5c) con filtro puesto y CERO tildadas ocultas, el aviso no está  → aviso=""
 ✅ F6) "Tildar visibles" tilda sólo las visibles y deja las ocultas como estaban  → [true,true,true,true,true,true,true,true,true]
 ✅ F6b) "Destildar visibles" no toca las ocultas: la oculta tildada sigue tildada  → [true,true,true,false,false,false,false,false,false]
 ✅ F6c) sin filtro, tildar opera sobre las 9  → [true,true,true,true,true,true,true,true,true]
 ✅ F7) "Tildar sólo estas" deja tildadas exactamente las visibles y ninguna otra  → [false,false,false,false,false,false,true,true,true]
 ✅ F8) el rótulo lleva la cantidad de visibles cuando hay filtro  → ·Tildar los 3 visibles··Destildar los 3 visibles··Tildar sólo estos 3·
 ✅ F8b) y no dice "visibles" con el filtro en "Todo"  → ·Tildar todo··Destildar todo·
 ✅ F9) el mini-DOM TIRA ante un selector desconocido (si devolviera [] el probe daría falso verde)  → selDesconocido=.cob-chk[value="x"]
 ✅ H1) el filtro sobrevive a habilitar una retenida  → cobFiltro=incentivo
 ✅ H2) y la selección previa se conserva EXACTA (los 3 incentivos tildados, los 6 premios no)  → antes=3 después=3
 ✅ H3) la línea recién liberada aparece en la tabla, y entra SIN tildar por estar fuera del filtro  → grupo=actuacion checked=false oculta=true
 ✅ H4) y el operador recibe el aviso de que quedó fuera del filtro  → {"m":"Línea habilitada — quedó FUERA del filtro actual y sin tildar. Cambiá el filtro para verla.","t":"error","ms":9000}
 ✅ H4b) el grupo nuevo (Actuación) aparece en los chips después de habilitar  → ·Todo (10)··Premios (6)··Incentivo entrenador (3)··Actuación (1)·
 ✅ H5) un filtro cuyo grupo dejó de existir vuelve a "todo" en vez de dejar la tabla vacía  → cobFiltro=todo · lineas=9
 ✅ F0) el fixture es el esperado: 6 premios + 3 incentivos pagables, 2 retenidas  → pagables=9 premios=210000 incentivos=600000 · retenidas: 6bf665e7, 76328484
 ✅ R1) restore por ESTADO: las líneas quedaron como estaban  → sin diferencias
 ✅ R2) y no hubo que restaurar nada a mano  → 0 línea(s)
 ✅ R3) no quedó ningún recibo del probe, en NINGÚN club  → []
 ✅ R4) no quedaron líneas del probe en la base  → []

32/32 OK
```

**32/32 contra el HTML que están usando en la ventanilla.** El restore quedó limpio y no hubo que
arreglar nada a mano (`R1`/`R2`), así que la base quedó como estaba.

---

# 7. GOTCHAS AGREGADOS

## #83 — El timeout del harness es POR INVOCACIÓN, no por mutante — y el SIGKILL se disfraza de OOM

Es el que pediste. Cubre las tres cosas:

- **Por invocación, no por mutante:** 13,1 s × 17 ≈ 223 s contra un límite de 120 s.
- **El SIGKILL se parece al del OOM killer:** los dos dan exit 137. Distinguirlos requiere medir —
  RSS chico + tiempo cerca del límite = timeout. Se incluye la salida de `/usr/bin/time` como
  evidencia.
- **Las tandas son la solución**, con el ejemplo de invocación.
- **Una corrida matada deja fixtures:** `SIGKILL` no ejecuta el `finally`; la corrida siguiente
  arranca con 14 líneas donde esperaba 9 y da 26/32 **sin que nada esté roto**. Se incluye la
  salida real de esos asserts y el fix estructural (limpieza preflight acotada al `TAG`), con la
  nota de que `F0` y `R4` son los que lo delatan.

## #84 — Un mutante que muere al ARRANCAR no es un sobreviviente

Este no lo pediste explícitamente, pero es la codificación de lo que decidiste en (c) y de la
observación que hiciste vos —*"es la segunda vez esta semana"*—, así que quedó escrito para que la
tercera no pase. Cubre:

- La tabla de las dos causas de "no encontré `❌ assert`" y qué hacer con cada una.
- El error real (`ERR_MODULE_NOT_FOUND` desde `/tmp`) como ejemplo concreto.
- Los dos arreglos, con el segundo marcado como el que importa.
- La sección de **mutantes equivalentes**: cómo se declaran, por qué no se "arreglan" sacando
  código, y cómo se prueba la equivalencia enumerando el espacio de estados.

Contador de `CLAUDE.md` actualizado: **82 → 84**.

```
$ grep -c "^## " docs/GOTCHAS.md
84
```

---

# 8. NÚMEROS DE RESUMEN

| Métrica | Antes | Ahora |
|---|---|---|
| Mutantes que mueren | 15 | **16** |
| Mutantes equivalentes declarados | 0 | **1** (M7) |
| **Sobrevivientes** | **2** | **0** |
| Errores de arnés detectados como tales | 0 (se leían como sobrevivientes) | **0 reales, y el camino verificado con canario** |
| Probe contra HTML local | 32/32 | 32/32 |
| Probe contra HTML servido | — | **32/32** |
| GOTCHAS | 82 | **84** |
| Estado en prod | ISSUE-056 (`0189ecbe…`) | **filtro vivo (`63d7fc97…`)** |

---

# 9. LO QUE QUEDA ABIERTO

1. **F2b y F6 siguen sin discriminar** a M3 y M8. Los mutantes mueren igual (por F2 y F6b), así que
   no hay riesgo abierto — pero la cobertura que el plan les atribuye es más angosta de lo que
   dice. Son dos cambios de fixture de dos líneas cada uno:
   - `F2b`: arrancar de un vector **no uniforme** (destildar una fila antes de filtrar y
     desfiltrar). Con eso M3 lo mataría también.
   - `F6`: dejar las ocultas **destildadas** antes de `tildarVisibles(true)`, para que "no toca las
     ocultas" sea observable.

   No los toqué porque no me lo pediste y porque el cierre de esta tanda era M17 + merge.

2. **Verificación en browser real** — el filtro no se vio renderizado nunca: chromium no corre en
   este Ubuntu (`docs/SERVER.md`). Los chips, el aviso en `--danger` y el `display:none` de
   `.cob-row-oculta` están verificados por estructura y por comportamiento, no por layout. Queda
   para una máquina con browser, o para que Valeria lo mire en la ventanilla.

3. **Valeria todavía no lo usó.** El flujo que motivó todo esto —filtrar incentivos, "Tildar sólo
   estos N", emitir— está en prod y probado, pero sin uso real.

---

# 10. VERIFICACIÓN DE PUBLICACIÓN

## `main` (el código, mergeado)

```
$ git push origin main
To github.com:mdqclio/SGH.git
   cb5b77c..2821c7c  main -> main

$ git ls-remote origin main
2821c7c223a00d6f9bb53c8ea389a145f0efb424	refs/heads/main

$ git rev-parse HEAD          # estando en main
2821c7c223a00d6f9bb53c8ea389a145f0efb424
```

## `feat/filtro-concepto-pagos` (la rama de trabajo, ya mergeada, no borrada)

```
$ git push origin feat/filtro-concepto-pagos
To github.com:mdqclio/SGH.git
   b698874..e5a02bd  feat/filtro-concepto-pagos -> feat/filtro-concepto-pagos

$ git ls-remote origin feat/filtro-concepto-pagos
e5a02bdf39486149aab5c745cb97edc8859a59d6	refs/heads/feat/filtro-concepto-pagos
```

## `reports` (este informe)

```
$ git push origin reports
To github.com:mdqclio/SGH.git
   ab19d06..461089d  reports -> reports

$ git ls-remote origin reports
461089d0007cfaf70a16040b53caa193462610d9	refs/heads/reports

$ git rev-parse HEAD          # estando en reports
461089d0007cfaf70a16040b53caa193462610d9
```

Los SHA de `ls-remote` coinciden con los de `rev-parse HEAD` en las tres ramas. Y prod sirve el
`liquidaciones.html` de `2821c7c` (§5), que es la verificación que de verdad importa: el commit
está en `origin` **y** llegó al navegador.

*(Esta sección se agregó en un commit posterior — su propio SHA queda en el `git log` de la rama.)*
