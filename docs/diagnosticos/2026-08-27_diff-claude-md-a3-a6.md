# Diff propuesto para `CLAUDE.md` — A3 (`carreras.estado`) y A6 (párrafo de probes)

- **Fecha:** 2026-08-27
- **SHA de `main`:** `298e627`
- **Estado:** **SIN APLICAR.** El diff está acá; `CLAUDE.md` no se tocó, no se commiteó, no se mergeó.
- **Working tree:** limpio (`git status --short` sin salida). La propuesta vive en el scratchpad,
  no en el repo.
- **Origen:** hallazgos A3 y A6 de `docs/diagnosticos/2026-08-27_auditoria-claude-md.md`.
  Los otros 17 hallazgos quedan sin tocar.

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) AS spcs_count FROM spcs;
[{"spcs_count":181}]

ref del proyecto: unlhcuanfrtpatoipwve
main: 298e627
```

Read-only: sólo `SELECT`. Ninguna escritura, ningún DDL.

---

## 1. La medición que respalda A3

```sql
SELECT coalesce(estado::text,'(NULL)') AS estado, count(*) AS n
FROM carreras GROUP BY estado::text ORDER BY n DESC, estado::text;
```

```json
[{"estado":"abierta","n":31},
 {"estado":"anulada","n":7},
 {"estado":"confirmada","n":7},
 {"estado":"programada","n":3},
 {"estado":"(NULL)","n":1}]
```

**49 filas.** `'abierta'` es 31 de 49 — el valor más común, y el que faltaba en el gotcha.

El patrón NULL-safe existe en el repo y se cita con archivo y línea:

```
$ grep -rn "estado.is.null,estado.neq" --include=*.html .
resultados.html:493:    .or('estado.is.null,estado.neq.anulada')
programa-oficial.html:229:  ... .or('estado.is.null,estado.neq.anulada');
programa-oficial-color.html:337:  ... .or('estado.is.null,estado.neq.anulada');
programa-oficial.html:274:  ... .or('estado.is.null,estado.neq.cancelada')
programa-oficial-color.html:379:  ... .or('estado.is.null,estado.neq.cancelada')
```

Las dos referencias que cita el diff (`programa-oficial.html:229`, `resultados.html:493`) están
verificadas contra el working tree de `main` en `298e627`.

---

## 2. El listado viejo en otros lugares — **encontrado, NO tocado**

Buscado en `docs/`, `SCHEMA.md`, `CHANGELOG.md` y comentarios de código.

### 2.1 Sí lo repiten (y también les falta `'abierta'`)

| Archivo | Línea | Dice | Comentario |
|---|---|---|---|
| `docs/ESTADO.md` | 394 | "`carreras.estado`: nullable, default 'programada'. Valores en uso: NULL/'programada' (ABIERTA), 'confirmada' (CERRADA), 'anulada' (ANULADA), **'reabierta'** (legacy, tratado como anulada en algunos lugares)." | **Es la misma lista vieja**, con el mismo faltante. Agrega `'reabierta'`, que hoy **no tiene ninguna fila** en la base. Es el caso más parecido al de `CLAUDE.md`. |
| `docs/SCHEMA.md` | 77 | "NOTA estado: campo VARCHAR libre (sin ENUM). Valores especiales usados en UI: 'reabierta' …, 'anulada' …. NULL = sin marca especial." | No pretende ser la lista completa, pero **omite `'abierta'`**, que es el 63% de las filas. Menos grave que `ESTADO.md`, igual induce a error. |

### 2.2 Tienen números, pero de otra fecha

| Archivo | Línea | Dice | Comentario |
|---|---|---|---|
| `docs/INTEGRACION_STUDBOOK_ESTADO.md` | 119 | "valores reales en toda la base → `abierta` 31, `anulada` **3**, `programada` 3, `(null)` 1" | Foto de su fecha: hoy `anulada` es **7** y falta `confirmada` 7. Es una bitácora fechada, probablemente deba quedarse como está. |
| `docs/AUTOREGISTRO_GATE_4.md` | 58, 174 | "hay 31 carreras `abierta` de **38**" | Hoy son 49 filas. Mismo caso: bitácora. Lo importante de ese doc —que `'abierta'` la escribe `carta-llamados.html` en todo guardado— **sigue siendo cierto** y es lo que cita el diff. |

### 2.3 Correctos, no tocar

- `docs/GOTCHAS.md:79` — sólo dice "carreras.estado es VARCHAR libre (sin ENUM ni restricciones)".
  **No enumera valores**, así que no está viejo. (La numeración de GOTCHAS.md es propia: el tema
  aparece como contraste dentro de su entrada 19, no como una entrada #5.)
- `docs/ISSUES.md:260` — describe ISSUE-038 con la explicación correcta del `.neq()` no NULL-safe.
- Comentarios en código: `resultados.html:490-491`, `programa-oficial.html:226`,
  `programa-oficial-color.html:334`, `tests/probe_programa_null_estado.mjs:6`, `CHANGELOG.md:286`.
  Todos dicen "VARCHAR libre y admite NULL (gotcha #5)" **sin listar valores**. Correctos.
- `portal.html:488` — "carreras.estado NO sirve como señal: carta-llamados.html escribe 'abierta'".
  Correcto y coherente con lo que el diff agrega.

**Conclusión:** el listado viejo se repite en **2 lugares** fuera de `CLAUDE.md`
(`docs/ESTADO.md:394` y, parcialmente, `docs/SCHEMA.md:77`). **No los toqué.** Si querés, van en
el mismo turno que este diff o en otro.

---

## 3. El diff propuesto

Contra `CLAUDE.md` en `298e627`. Dos hunks, +18/−5.

```diff
@@ -273,14 +273,20 @@
 - Push frecuente — la sesión SSH al VPS Hetzner se puede cortar. Relevo por `.md` (el asesor lee de raw.githubusercontent.com); ver `docs/SERVER.md`
 
 ### Probes de regresión
-Después de fixear un bug en `resultados.html`, agregar o extender un probe en `tests/` que verifique el fix contra prod:
+Después de fixear un bug, agregar o extender un probe en `tests/` que verifique el fix contra prod:
+
 ```bash
-node tests/probe_no_largo.mjs            # "No corrió" persiste {posicion:null,no_largo:true}
-node tests/probe_fase_c.mjs              # Fase C — estado_linea + retención anti-doping (real-code)
+set -a; . ./.env; set +a                  # exporta SUPABASE_SECRET_KEY
+node tests/probe_pagos_rol_carrera.mjs    # rol y nº de carrera en el tab Pagos (48 asserts)
+node tests/probe_edad_reglamentaria.mjs   # la regla del 1° de julio en el gate de inscripción
+node tests/probe_no_largo.mjs             # "No corrió" persiste {posicion:null,no_largo:true}
 ```
-El patrón está en `tests/probe_bug2_*.mjs`: auth con magic link → nav → DOM assertions vía Playwright.
 
-**Limitación crítica**: las variables internas de `resultados.html` (`currentCarreraId`, `inscripciones`, `posicionesMap`, etc.) son `let` de módulo y no están expuestas en `window.*`. Los probes deben basarse en evidencia DOM observable, no en estado interno JS.
+**El patrón es código real sin browser.** Chromium no corre en este Ubuntu (`"Playwright does not support chromium on ubuntu26.04-x64"` — ver `docs/SERVER.md`), así que el probe **extrae del propio HTML** la función o el bloque a probar —por ancla, con balance de llaves—, lo corre con `new AsyncFunction(...)` inyectando dependencias reales (cliente Supabase con `SUPABASE_SECRET_KEY`, más stubs de DOM si hacen falta) y assertea contra la base. Nunca reimplementar la lógica dentro del test: si el archivo cambia, el probe corre el archivo cambiado. Para lo que escribe: **snapshot → run → assert → restore** en el `finally`.
+
+Los pasos completos y los ejemplos de referencia están en **`tests/README.md`** (sección *Browser NO disponible — patrón de harness de código real*). No duplicar eso acá.
+
+**Por qué así**: las variables internas de los módulos (`currentCarreraId`, `inscripciones`, `posicionesMap`, etc.) son `let` de módulo y no están expuestas en `window.*` — no hay estado interno que inspeccionar desde afuera. Los asserts van contra lo que el código **persiste en la DB** o contra el **texto del archivo**, no contra variables.
 
 ### Reunión activa para testing
 Reunión 5 — 17/05/2026 — Hipódromo de Dolores (11 turnos, ~81 inscripciones).
@@ -306,9 +312,20 @@
 
 ## Deploy
 
-- **URL prod**: `https://mdqclio.github.io/SGH/`
+- **URL prod**: `https://sigh.com.ar/` — dominio propio desde la migración (`CNAME` en la raíz del
+  repo). `www.sigh.com.ar` redirige al apex. **Verificar siempre contra `sigh.com.ar`**, no contra
+  `mdqclio.github.io/SGH/`: ese origen quedó del período anterior y puede servir contenido viejo.
+  Ojo con la ruta: con dominio propio el sitio vive en la **raíz** (`sigh.com.ar/login.html`), no
+  en el subdirectorio `/SGH/`. Ver `docs/PLAN_DOMINIO_SIGH_COM_AR.md`.
 - **Método**: GitHub Pages "Deploy from branch" desde `main`. Sin workflow, sin build.
-- **Tiempo**: ~15–60 s después del push. Si no se ven los cambios: `Ctrl+Shift+R` o `?v=N` en la URL.
+- **Tiempo**: ~15–60 s de build, pero el CDN puede tardar varios minutos más en servir la versión
+  nueva. Si no se ven los cambios: `Ctrl+Shift+R` o `?v=N` en la URL. Para verificar de verdad,
+  comparar el md5 contra el archivo del commit:
+  ```bash
+  curl -s "https://sigh.com.ar/<archivo>.html?v=$RANDOM" -o /tmp/prod.html
+  git show <sha>:<archivo>.html > /tmp/local.html
+  md5sum /tmp/local.html /tmp/prod.html   # tienen que coincidir
+  ```
 - **Flujo**:
   ```bash
   git add <archivos>
@@ -324,7 +341,12 @@
 2. **Supabase key**: usar la **publishable** `sb_publishable_...`. Las legacy `eyJ...` (anon/service_role) están DESACTIVADAS desde 2026-06-07 (401 "Legacy API keys are disabled"). Secret server-side = `sb_secret_...` por env, nunca en el repo.
 3. **`usuarios.nombre_completo`** — NO `nombre`. Afecta todos los archivos con auth.
 4. **`inscripciones.estado` es ENUM rígido** — para nuevos valores: `ALTER TYPE estado_inscripcion ADD VALUE`. No migrar a VARCHAR (hay una vista que depende del ENUM).
-5. **`carreras.estado` es VARCHAR libre** — sin ENUM. Valores en uso: `NULL/'programada'`, `'confirmada'`, `'anulada'`.
+5. **`carreras.estado` es VARCHAR libre** — sin ENUM ni CHECK. Valores reales, medidos el **2026-08-27** sobre las 49 carreras de la base: `'abierta'` 31, `'anulada'` 7, `'confirmada'` 7, `'programada'` 3, `NULL` 1. Los conteos son una foto: si no dan, el listado quedó viejo — volver a medir con `SELECT estado, count(*) FROM carreras GROUP BY estado`.
+   - El valor más común es **`'abierta'`**, que faltaba en la lista anterior de este gotcha. No significa "inscripción abierta": `carta-llamados.html` lo escribe en **toda** carrera que guarda, sin condición (ver `docs/AUTOREGISTRO_GATE_4.md`).
+   - **Filtrar siempre NULL-safe.** `.neq()` solo **no** lo es: PostgREST lo traduce a `estado <> 'anulada'`, que para `NULL` da `NULL` y descarta la fila en silencio. Fue ISSUE-038 — se comía el turno 2 de R6 del programa. Patrón vigente en el repo:
+     ```javascript
+     .or('estado.is.null,estado.neq.anulada')   // programa-oficial.html:229, resultados.html:493
+     ```
 6. **`carrera_apuestas`** reemplaza `carreras.apuestas_habilitadas JSONB` (dropeada 27/05/2026). No usar `.select('apuestas_habilitadas')`.
 7. **`renumerarChapas` usa filtro positivo**: `estado === 'ratificado'`, NO lista de exclusión negativa.
 8. **`bindARSInput` requiere guard `_arsBound`** para no acumular listeners.
```

---

## 4. Qué cambia cada hunk

### 4.1 Hunk A3 — gotcha crítico #5

| Antes | Después |
|---|---|
| "Valores en uso: `NULL/'programada'`, `'confirmada'`, `'anulada'`" | Los 5 valores reales **con conteo y fecha de medición** (2026-08-27, 49 filas) |
| — | La query para volver a medir, y la advertencia de que los conteos son una foto |
| — | Que `'abierta'` es el más común y **no** significa "inscripción abierta" (`carta-llamados.html` lo escribe en todo guardado) |
| — | El patrón NULL-safe `.or('estado.is.null,estado.neq.anulada')` con archivo y línea, y por qué `.neq()` solo no alcanza (traduce a `estado <> 'anulada'`, que para NULL da NULL) |
| — | La referencia a ISSUE-038 como el caso real en que esto ya mordió |

La fecha y los conteos son deliberados: sin ellos no hay forma de saber que el listado quedó
viejo, que es exactamente lo que pasó con la versión anterior.

### 4.2 Hunk A6 — párrafo de probes

Queda **un solo párrafo coherente**. Se fue:

- `tests/probe_bug2_*.mjs` — **no existe ningún archivo con ese nombre** (verificado: `ls` falla).
- "auth con magic link → nav → **DOM assertions vía Playwright**" — contradecía al párrafo de
  real-code de tres líneas más arriba, y chromium no corre en este Ubuntu.

Quedó:

- La receta de corrida completa, empezando por `set -a; . ./.env; set +a`, que faltaba y sin la
  cual ningún probe arranca (`throw new Error('Falta SUPABASE_SECRET_KEY')`).
- Tres probes **que existen**: `probe_pagos_rol_carrera.mjs` (48 asserts, el de hoy),
  `probe_edad_reglamentaria.mjs` (la regla del 1° de julio) y `probe_no_largo.mjs`.
- El patrón vigente descrito en sus términos: extraer del propio HTML por ancla con balance de
  llaves, correr con `new AsyncFunction(...)` y dependencias reales, assertear contra la base,
  y `snapshot → run → assert → restore` para lo que escribe.
- **Referencia a `tests/README.md`** (sección *Browser NO disponible — patrón de harness de código
  real*) en vez de duplicar los pasos, como pediste. Ese README ya documenta el patrón en detalle
  (líneas 16–36) con `probe_fase_c.mjs` y `probe_fase2_liquidaciones.mjs` de ejemplo.

---

## 5. Un desvío, para que lo veas antes de decidir

Señalaste la línea 281 (la de Playwright). **También reescribí el párrafo siguiente**, el de
"**Limitación crítica**", porque estaba en el mismo bloque y arrastraba la misma contradicción:

> "Los probes deben basarse en **evidencia DOM observable**, no en estado interno JS."

Eso es de la época de Playwright. El patrón vigente no mira el DOM: extrae funciones del archivo y
mira lo que persisten en la base. Dejarlo habría dejado justamente los dos párrafos que se
contradicen, que es lo que pediste evitar.

Lo que conservé es el **hecho**, que sigue siendo cierto y es la *razón* del patrón: las variables
internas son `let` de módulo y no están en `window.*`. Cambié sólo la conclusión: los asserts van
contra lo que el código persiste en la DB o contra el texto del archivo.

Si preferís tocar únicamente la línea 281 y dejar la "Limitación crítica" como está, decímelo y
recorto el hunk.

---

## 6. Verificaciones hechas sobre el texto propuesto

| Qué | Resultado |
|---|---|
| `tests/probe_pagos_rol_carrera.mjs` existe y da 48 asserts | ✅ (corrido hoy, 48/48, exit 0) |
| `tests/probe_edad_reglamentaria.mjs` existe | ✅ |
| `tests/probe_no_largo.mjs` existe | ✅ |
| `tests/probe_bug2_*.mjs` | ❌ no existe — por eso sale |
| `programa-oficial.html:229` tiene el `.or(...)` citado | ✅ |
| `resultados.html:493` tiene el `.or(...)` citado | ✅ |
| `tests/README.md` documenta el patrón (sección citada) | ✅ líneas 16–36 |
| Conteos de `carreras.estado` | ✅ medidos hoy contra prod (§1) |
| `'reabierta'` sigue en uso | ❌ **0 filas** hoy — por eso el diff no lo agrega |
| `CLAUDE.md` en el working tree | ✅ **sin modificar** |

---

## 7. Números de resumen

| Métrica | Valor |
|---|---|
| Hunks propuestos | 2 |
| Líneas | +18 / −5 |
| Hallazgos de la auditoría cubiertos | 2 de 19 (A3, A6) |
| Otros lugares con el listado viejo | 2 (`docs/ESTADO.md:394`, `docs/SCHEMA.md:77`) — **sin tocar** |
| Bitácoras con números de otra fecha | 2 (`INTEGRACION_STUDBOOK_ESTADO.md`, `AUTOREGISTRO_GATE_4.md`) — probablemente deban quedarse |
| Archivos modificados en el repo | **0** |

---

## 8. Preguntas abiertas

1. **¿OK al diff?** Con tu OK: commit en branch `chore/` + `merge --no-ff` a `main`, o lo que
   prefieras.
2. **El desvío de §5** — ¿reescribo también la "Limitación crítica" (como está en el diff) o
   recorto el hunk a la línea 281 sola?
3. **`docs/ESTADO.md:394` y `docs/SCHEMA.md:77`** repiten el listado viejo. ¿Los corrijo en el
   mismo turno, en otro, o los dejo?
4. **Las bitácoras fechadas** (`INTEGRACION_STUDBOOK_ESTADO.md:119`,
   `AUTOREGISTRO_GATE_4.md:58/174`) tienen conteos de su fecha. Mi lectura: son fotos y se
   quedan, igual que los guards de los planes. ¿Coincidís?
