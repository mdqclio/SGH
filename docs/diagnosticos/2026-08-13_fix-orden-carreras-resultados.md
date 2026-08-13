# Fix — orden y número de carrera en `resultados.html`

**Fecha**: 2026-08-13
**Branch**: `fix/resultados-numero-carrera` (desde `main` @ `9dbc55a`)
**Archivos tocados**: `resultados.html` (+17 −6) · `tests/probe_orden_carreras.mjs` (nuevo)
**Gate**: `node tests/probe_orden_carreras.mjs` → **18/18 asserts OK**

**GUARD**: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` ✅ ·
`SELECT count(*) FROM spcs` = **183** (baseline) ✅ · cero DDL, cero DML.

---

## Modelo de dominio aplicado

`numero_turno` = orden de armado, provisorio, de cuando se carga la carta de llamados y
todavía no se sabe el orden. `numero_carrera_programa` = orden **definitivo**, asignado por
sorteo después de la ratificación; es el que sale impreso y con el que se corre. Las carreras
anuladas no entran al sorteo y quedan sin número. Una vez sorteado, el turno es interno y no
se le muestra al usuario.

Regla implementada en los 4 puntos: `numero_carrera_programa ?? numero_turno`.
Sin offsets `+10000` (verificado por el gate: `grep 10000` en `resultados.html` → 0 hits).

---

## Los 4 cambios

### 1 y 2 — línea 485: filtro de anuladas + orden por número de programa

```diff
-  const { data: cars } = await sb.from('carreras').select('*').eq('reunion_id', rid).order('numero_turno');
-  carreras = cars || [];
+  // Las carreras anuladas no entran al sorteo y no se corren: no deben aparecer en la carga
+  // de resultados ni contar para el badge de reunion oficial. NULL-safe porque carreras.estado
+  // es VARCHAR libre y admite NULL (patron de programa-oficial.html:186).
+  const { data: cars } = await sb.from('carreras').select('*').eq('reunion_id', rid)
+    .or('estado.is.null,estado.neq.anulada')
+    .order('numero_turno');
+  // El orden definitivo es numero_carrera_programa (sorteo post-ratificacion). Se ordena en JS
+  // porque PostgREST no acepta una expresion coalesce en .order(). El fallback a numero_turno
+  // cubre la reunion todavia sin sortear; el .order() de arriba lo deja determinista.
+  carreras = (cars || []).sort((a, b) =>
+    (a.numero_carrera_programa ?? a.numero_turno) - (b.numero_carrera_programa ?? b.numero_turno));
```

**Ordenado en JS, no en PostgREST.** PostgREST solo acepta nombres de columna en `order=`;
no hay forma de expresar `coalesce(numero_carrera_programa, numero_turno)` sin crear una
columna generada o una vista. La alternativa sin JS —
`.order('numero_carrera_programa', {nullsFirst:false}).order('numero_turno')` — **no es
equivalente**: agrupa primero todas las sorteadas y después todas las no sorteadas, en vez
de intercalarlas por el número resuelto. El `.order('numero_turno')` del servidor se mantiene
para que el input del `sort()` sea determinista (`Array.sort` es estable desde ES2019, así
que ante dos claves iguales el desempate queda por turno).

### 3 — líneas 775, 1598 y 1691: títulos de panel

```diff
-          <div class="res-panel-title">Carrera ${carrera.numero_turno}${carrera.nombre?' — '+carrera.nombre:''}</div>
+          <div class="res-panel-title">Carrera ${carrera.numero_carrera_programa ?? carrera.numero_turno}${carrera.nombre?' — '+carrera.nombre:''}</div>
```
(idéntico en `renderFormulario`, ahora línea 784, y en `renderOficial`, ahora línea 1609)

```diff
   document.getElementById('pb-title').textContent =
-    `Pesos balanza — Carrera N° ${carrera?.numero_turno ?? '?'}`;
+    `Pesos balanza — Carrera N° ${carrera?.numero_carrera_programa ?? carrera?.numero_turno ?? '?'}`;
```
(`openPesoBalanza`, ahora línea 1702 — se conserva el `?? '?'` final)

### 4 — línea 1514: `performances.numero_carrera` al oficializar

```diff
-      numero_carrera:carrera?.numero_turno, distancia_metros:carrera?.distancia_metros,
+      // Numero definitivo del sorteo: es el que sale impreso y con el que se corre.
+      numero_carrera:carrera?.numero_carrera_programa ?? carrera?.numero_turno,
+      distancia_metros:carrera?.distancia_metros,
```

**No se tocó ningún dato ya grabado en `performances`.** Cero UPDATE.

---

## Verificaciones pedidas

Corridas con el harness de código real de `tests/README.md`: se extrae el cuerpo de
`loadReunion()` y `renderLista()` del `resultados.html` que sirve prod y se ejecuta vía
`AsyncFunction` con cliente Supabase real + stubs de DOM. Los números reportados se leen
del HTML renderizado (`<div class="cc-num">`), no se recalculan aparte. El "antes" sale de
`git show main:resultados.html`, así que el contraste es contra el código realmente vivo.

> Nota: `carreras` tiene RLS y la publishable key devuelve **0 filas sin error**. El probe usa
> `SUPABASE_SECRET_KEY` del `.env` (solo SELECT). Correr con
> `set -a; . ./.env; set +a; node tests/probe_orden_carreras.mjs`.

### ✅ Verificación 1 — R8: las 8 tarjetas dan 1..8, sin repetidos ni huecos

| tarjeta | N° que muestra | carrera |
|---:|:--:|:--|
| 1ª | **1** | PACHAMAMA |
| 2ª | **2** | GRAL JOSÉ DE SAN MARTIN |
| 3ª | **3** | DIA DEL VETERINARIO |
| 4ª | **4** | DIA DEL FOLKLORE |
| 5ª | **5** | DÍA DEL NIÑO |
| 6ª | **6** | ANIV- DOLORES PRIMER PUEBLO PATRIO |
| 7ª | **7** | FUERZA AÉREA ARGENTINA |
| 8ª | **8** | SANTA ROSA |

`1,2,3,4,5,6,7,8` — 8 tarjetas, sin repetidos, sin huecos, en orden. Ninguna anulada en la
lista y ninguna tarjeta cae al fallback de turno. Antes del fix salían 12 tarjetas con el
`1`, el `6` y el `7` duplicados.

### ✅ Verificación 2 — badge con denominador 8

```
Reunión provisional — 0/8 carreras oficiales
```

Denominador **8** (antes **12**, medido corriendo el código de `main`). Con 12 el
`carreras.every(c => resultados[c.id]?.estado === 'oficial')` de la línea 520 incluía las 4
anuladas, que nunca van a tener resultado oficial: el badge "🏆 Reunión oficial" era
**inalcanzable**. Ahora `8/8` es posible.

### ⚠️ Verificación 3 — la reunión de control: **R6 sí tiene anuladas**

El brief pide probar "una reunión vieja sin anuladas (R6)" y confirmar que no cambió.
**La premisa no se sostiene: R6 (20/06/2026) tiene 11 carreras, de las cuales 3 están
`anulada`.** No es un control limpio y **sí cambia** — correctamente:

```
R6 antes:   11 tarjetas → 1,2,3,4,8,6,7,4,7,10,5
R6 después:  8 tarjetas → 1,2,3,4,5,6,7,8
```

El "antes" de R6 tenía el **4 y el 7 repetidos** y el orden desarmado: el mismo bug que R8,
ya vivo en una reunión con resultados oficiales cargados. El fix la deja en 1..8 correlativo.

Como control real se usó **R9 (20/09/2026)**: 11 carreras, **0 anuladas**, ninguna sorteada
(las 11 con `numero_carrera_programa = NULL`). Es el caso que ejercita el fallback puro:

```
R9 antes:   11 tarjetas → 1,2,3,4,5,6,7,8,9,10,11
R9 después: 11 tarjetas → 1,2,3,4,5,6,7,8,9,10,11   ← idéntico
```

**Confirmado: una reunión sin anuladas y sin sortear no cambia en nada.** El fallback a
`numero_turno` preserva el comportamiento previo.

### Salida del gate

```
[0] Codigo bajo prueba                          4/4 ✔
[1] R8 — tarjetas visibles y su numero          6/6 ✔
[2] R8 — badge de reunion oficial               2/2 ✔
[3] Reuniones de control (R9, R6)               6/6 ✔
GATE OK — 18/18 asserts
```

---

## Diagnóstico read-only — `performances` a corregir el lunes

Consulta pedida: filas de `performances` con `numero_carrera` igual al `numero_turno` de su
carrera pero distinto del `numero_carrera_programa`, desglosado por reunión.

**Resultado: 0 filas. La tabla `performances` está completamente vacía (0 registros).**
No hay nada que corregir el lunes: el arreglo de datos es de tamaño cero.

```sql
SELECT r.numero, r.fecha, count(*) AS perf_total,
       count(*) FILTER (WHERE p.numero_carrera = c.numero_turno
                          AND c.numero_carrera_programa IS NOT NULL
                          AND p.numero_carrera IS DISTINCT FROM c.numero_carrera_programa) AS a_corregir
FROM performances p
JOIN carreras c  ON c.id = p.carrera_id
JOIN reuniones r ON r.id = c.reunion_id
GROUP BY r.id, r.numero, r.fecha ORDER BY r.fecha;
-- → [] (0 filas)

SELECT count(*) FROM performances;   -- → 0
```

### Por qué está vacía — hallazgo colateral (fuera del alcance de este branch)

Que esté vacía **no** es porque nunca se oficializó nada. Hay **11 resultados en estado
`oficial`** con 98 posiciones cargadas:

| reunión | fecha | oficializadas | turnos donde turno ≠ programa |
|---|---|---:|---|
| R6 | 2026-06-20 | 8 (22/07/2026) | turno 5→prog 8, turno 8→prog 4, turno 9→prog 7, turno 11→prog 5 |
| 9999 (prueba) | 2099-01-01 | 3 (11/06/2026) | ninguno (sin sortear) |

El bloque que inserta en `performances` existe en `resultados.html` desde el commit `3fee9bc`
(21/04/2026), o sea **anterior** a las 11 oficializaciones. Debería haber escrito ~55 filas y
escribió 0. Causa: la policy de RLS

```
performances_insert | INSERT | {authenticated} | WITH CHECK: fn_is_super_admin()
```

exige **super_admin**, y quien oficializa es `secretario_carreras`. El INSERT se rechaza —
y el código no lo detecta, porque no chequea el error:

```js
  if (perfInserts.length) {
    await sb.from('performances').delete().eq('carrera_id', carreraId);
    await sb.from('performances').insert(perfInserts);   // ← sin { error }, falla en silencio
  }
```

Contradice la convención de `CLAUDE.md` ("nunca `.catch(()=>{})` silencioso"). **No se tocó
en este branch** — es un bug aparte, con su propia decisión de producto (¿ampliar la policy a
staff, o mover el insert a una RPC `SECURITY DEFINER`?). Se deja anotado para issue propio.

**Consecuencia práctica para el cambio 4**: la corrección del número es correcta y necesaria,
pero hoy no tiene efecto observable, porque no se está escribiendo ninguna fila. Cuando se
destrabe el INSERT, ya va a escribir el número del programa y no el del turno.

---

## Fuera de alcance (anotado, no tocado)

- **`resultados.html:539`** — el `.cc-num` de la tarjeta usa
  `numero_carrera_programa != null ? … : numero_turno`, que es semánticamente idéntico al
  `??` pedido. Se dejó como estaba: no estaba en la lista de los 4 cambios y no altera el
  comportamiento (el gate lee su salida y da 1..8).
- **`resultados.html:540`** — `${c.nombre || \`Turno ${c.numero_turno}\`}` muestra el turno
  como *nombre* de la tarjeta cuando la carrera no tiene nombre. En R8 no se ve (las 8 tienen
  nombre), pero en una reunión sin nombres cargados le expone el turno al usuario, contra el
  modelo de dominio. Cambio aparte.
- **Backfill de `performances`** — cero filas, nada que hacer.
- **INSERT de `performances` bloqueado por RLS + error no chequeado** — issue propio.

---

## Verificación de alcance

```
$ git diff main --stat
 docs/diagnosticos/2026-08-13_fix-orden-carreras-resultados.md | (este archivo)
 resultados.html                                               | 23 +++++++++------
 tests/probe_orden_carreras.mjs                                | (nuevo)
```

Cero `INSERT` / `UPDATE` / `DELETE` / DDL contra prod. `main` intacto — sin merge.
