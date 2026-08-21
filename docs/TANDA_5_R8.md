# TANDA 5 de R8 — data de la reunión (sábado 16/08)

**Fecha:** 10/08/2026 · **Branch:** `fix/spcs-r8-tanda-5` (desde `main` `e1d7859`) · **Pedido:** Yesi.

> **Estado: PROPUESTA — NADA EJECUTADO.** `spcs` sigue en **179**, `caballerizas` en **292**,
> `profesionales` en **184**.
>
> - **Ítems 1-3 (caballerizas)**: migración escrita, esperando gate. ✅ listos.
> - **Ítem 4 (ALDECOA)**: 🛑 **bloqueado**. La corrección de Yesi del 10/08 no aplica tal como
>   vino — **los dos hermanos ya están en la base** desde el seed, cada uno con su DNI, y la
>   tanda 2 **no tocó a Matías**. Ver §4: dos preguntas concretas para Yesi antes de escribir nada.
> - **Ítem 5 (planilla nueva)**: no llegó. Ver §5.

---

## 0. Guards de arranque

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| working tree | limpio, desde `main` `e1d7859` | ✅ |
| `SELECT count(*) FROM spcs` | 179 (cierre tanda 4b) | ✅ **179** |
| branch | `fix/spcs-r8-tanda-5` | ✅ |

Contexto de tablas al arrancar: `caballerizas` 292 (DOL 217 · NULL 74 · SR 1) ·
`profesionales` 184 (entrenador 133 · jockey 50 · **ambos 1**).

---

## 1. EL POE → EL POBRE (rename, reversa de lo decidido antes)

Yesi aclaró: la caballeriza correcta es **EL POBRE**; `EL POE` es el error de carga.
Se hace **rename**, no borrar+crear — conserva id, responsables y cualquier FK.

**La fila:**

| campo | valor |
|---|---|
| id | `a5a0e7a2-4c60-4cbe-bbcc-5271e6a8d40f` |
| nombre | `EL POE` → **`EL POBRE`** |
| hipodromo_patente | **ya es `DOL`** — no cambia nada |
| responsable | `MEDINA OSCAR ROBERTO (propietario)` · domicilio `PILA` |
| estado / activo | `activo` / `true` |

No existe ninguna caballeriza `EL POBRE` en la base (scan normalizado sobre las 292): sin colisión.

### Conteo de referencias — pedido explícito

| tabla | columna | filas que apuntan a EL POE |
|---|---|---|
| `caballeriza_responsables` | `caballeriza_id` | **1** |
| `spcs` | `caballeriza_id` | **0** |
| `inscripciones` | `caballeriza_id` | **0** |
| `profesionales` | `caballeriza_id` | **0** |

La única referencia dura es la fila de responsables: **MEDINA OSCAR ROBERTO**, DNI [REDACTADO],
nac. 01/05/1964, PILA, rol `propietario`, `propietario_id` `399d2029-…`. Se conserva tal cual.

> ⚠ **Corrección al supuesto del pedido**: **LA LAGUNERA J no apunta a EL POE por FK.**
> `spcs.caballeriza_id` del ejemplar (`3e90190a-…`) es **NULL**, y su inscripción en R8
> (reunión 8, 16/08, turno 6, id `97ac015a-…`, estado `inscripto`) también tiene
> `caballeriza_id` **NULL**.
> El vínculo real es indirecto: `spcs.entrenador_id` = `baa43a75-…` = **MEDINA OSCAR ROBERTO**,
> que es justamente el responsable de EL POE. O sea: la asociación existe en la cabeza de Yesi
> y en los datos de persona, pero el campo caballeriza de la inscripción **todavía está vacío**.
>
> El rename sigue siendo lo correcto (preserva id y responsables, y cualquier caballeriza que
> se cargue de acá al sábado cae bien), pero **nadie tiene que asumir que la inscripción de
> LA LAGUNERA J ya quedó etiquetada**: si Yesi quiere ver "EL POBRE" en el programa, hay que
> setear `inscripciones.caballeriza_id` — decime y va como ítem aparte.

---

## 2. LUNA ROJA — NO existe, es alta (patente AZ)

Cruce hecho primero, como se pidió. Scan sobre las **292** caballerizas de **todos los clubs**
(sin filtro de `club_id`), con regex plano — recordar que `unaccent()` no está instalada
(GOTCHA de la tanda 4b):

```sql
SELECT id, nombre, hipodromo_patente FROM caballerizas
WHERE nombre ~* '(LUNA|ROJ|TIAN|ROMA)';   -- 0 filas de LUNA/ROJA
```

- 0 caballerizas con `LUNA` o `ROJA` en el nombre — **no quedó nada de junio**.
- Único hit de la familia en toda la base: el **propietario** `LUNA, AUGUSTO LEONEL`.
  Es persona, no caballeriza — no aplica.

→ **Alta** con `hipodromo_patente = 'AZ'`.

---

## 3. TIAN Y ROMA — NO existe, es alta (patente LP)

Mismo scan: 0 filas. (El único match del radical `TIA` es `PEPE Y CINTIA` — ruido del substring.)

→ **Alta** con `hipodromo_patente = 'LP'`.

> **Nota sobre las patentes nuevas**: hoy `caballerizas.hipodromo_patente` sólo tiene `DOL` (217),
> `NULL` (74) y `SR` (1, DON BENICIO de la tanda 4). `AZ` y `LP` son valores nuevos. La columna es
> `varchar` libre, sin FK contra `hipodromos` ni CHECK — no hay nada que migrar, entran directo.
> La UI ya los muestra bien: `caballerizas.html:324` e `inscripciones.html:508` renderizan
> `${nombre}${patente ? ' ('+patente+')' : ''}` → "LUNA ROJA (AZ)", "TIAN Y ROMA (LP)".
>
> Deuda vieja que **no** se toca acá: `N.R.A (AZ)`, `TRES AMIGOS (AZ)` y `GARIN CITY (LP)` tienen
> la procedencia pegada al nombre y `hipodromo_patente` NULL. Mismo hipódromo, otro modelado.

---

## 4. ALDECOA — 🛑 BLOQUEADO: los dos hermanos YA están en la base

> **Corrección de Yesi del 10/08 recibida a mitad de trabajo** ("son dos hermanos; el existente
> es MATIAS IGNACIO; revertí lo de la tanda 2 y dale de alta a IVAN LUCIANO").
> **Nada se ejecutó** — ni la versión vieja ni la corrección. Y la corrección, tal como vino,
> **tampoco aplica**: la base ya tiene a los dos hermanos, cada uno con su fila y su DNI.

### 4.1 Las dos filas, desde el seed del 11/05/2026

| | fila A | fila B |
|---|---|---|
| id | `17ea2904-ce23-4ba1-94be-202b1f62eb50` | `f6cdb63a-30b8-4221-812f-0527b5b9c433` |
| apellido, nombre | ALDECOA, **`IVAN`** | ALDECOA, **`MATIAS IGNACIO`** |
| DNI | **[REDACTADO]** | **[REDACTADO]** |
| nacimiento | 1996-07-15 | 1999-02-03 |
| localidad | CASTELLI | CASTELLI |
| tipo | **`ambos`** (único de la tabla) | `entrenador` |
| patente / estado | DOL / activo | DOL / activo |
| `created_at` | 2026-05-11 01:29 | 2026-05-11 01:29 |
| `updated_at` | **2026-08-05 20:59** (tanda 2) | **2026-05-11 04:27** (nunca más) |

Son dos personas distintas, con DNI y fecha de nacimiento propios, hermanos de Castelli.
Coincide con lo que dijo Yesi — sólo que **ya estaban las dos**.

### 4.2 (a) ¿Qué le cambió la tanda 2 a Matías? → **NADA**

El UPDATE de `personas_r8_tanda_2.sql` (bloque 3, líneas 87-91) filtraba **por nombre**:

```sql
UPDATE profesionales SET tipo='ambos'
WHERE upper(btrim(apellido))='ALDECOA'
  AND upper(btrim(nombre))='IVAN'        -- ← no matchea 'MATIAS IGNACIO'
  AND tipo='entrenador';
```

`'MATIAS IGNACIO' ≠ 'IVAN'` → la fila de Matías nunca entró en el WHERE. Prueba dura:
su `updated_at` sigue siendo **2026-05-11 04:27:54**, el del seed. La que pasó de `entrenador`
a `ambos` fue la fila de **Iván** (`updated_at` 2026-08-05).

**No hay nada que revertirle a Matías.** Su fila está intacta y no tiene ni una referencia
apuntándole (0 inscripciones, 0 SPCs).

*(La tabla `auditoria` no tiene registro de esto: las migraciones por MCP no disparan el trigger.
La evidencia es el `updated_at` + el SQL versionado.)*

### 4.3 (b) Alta de IVAN LUCIANO → **duplicaría**

Ya existe `ALDECOA, IVAN` con DNI **[REDACTADO]** — distinto del de Matías, misma localidad,
nacido 1996. Todo indica que es el mismo Iván, cargado con el nombre corto.

Un alta nueva crearía un **tercer** ALDECOA y partiría en dos las referencias existentes.
Lo correcto, si Yesi confirma que **[REDACTADO] es el DNI de Iván Luciano**, es un UPDATE de
un campo (`nombre` → `IVAN LUCIANO`), no un INSERT.

❓ **Pregunta para Yesi:** ¿el DNI [REDACTADO] (nac. 15/07/1996, Castelli) es de Iván Luciano?
Si dice que sí → UPDATE de nombre y listo. Si dice que no → ahí sí hay alta, pero primero hay
que definir de quién es esa fila, porque tiene 7 referencias colgando.

### 4.4 (c) La monta de PAULINA KEY → **ya apunta a Iván, no hay nada que reapuntar**

R6 20/06, turno 6, `inscripciones.id` `ac5a8b2d-9de0-4076-bcbb-9b7287d09579`, estado `ratificado`:
`jockey_titular_id` = `17ea2904` = **IVAN**. Coincide con el oficial ("ALDECOA IVAN"). ✅

Matías (`f6cdb63a`) **no aparece en ninguna inscripción ni SPC** — cero referencias.

### 4.5 Reporte de referencias del "Aldecoa viejo" (decide Yesi, no se toca)

Las 7 referencias cuelgan **todas de Iván** (`17ea2904`):

| tabla | rol | filas | detalle |
|---|---|---|---|
| `spcs.entrenador_id` | entrenador | 3 | ALIADO SCAT (sb 414038) · PAULINA KEY · QUE TAL OREJA |
| `inscripciones.jockey_titular_id` | jockey | 1 | R6 20/06 t6 PAULINA KEY (ratificado) |
| `inscripciones.entrenador_id` | entrenador | 4 | R6 t6 PAULINA KEY · R6 t8 ALIADO SCAT · R6 t8 QUE TAL OREJA · **R8 16/08 t4 ALIADO SCAT (`inscripto` — la única viva)** |

❓ **Segunda pregunta, la de fondo:** si Iván es **sólo jockey** y el cuidador de esos caballos es
**Matías**, entonces el error de la tanda 2 no fue de identidad sino **de rol**, y las 3+4
referencias de *entrenador* están en el hermano equivocado. En ese caso corresponde:

```sql
UPDATE spcs          SET entrenador_id = '<Matías>' WHERE entrenador_id = '<Iván>';
UPDATE inscripciones SET entrenador_id = '<Matías>' WHERE entrenador_id = '<Iván>';
UPDATE profesionales SET tipo = 'jockey' WHERE id = '<Iván>';   -- revierte el 'ambos'
```

⚠ **Ojo con R6**: está corrida y oficializada. Reapuntar sus 3 inscripciones toca resultados y
liquidaciones ya cerradas. Por eso queda como reporte y **no se mueve un dedo sin que Yesi lo pida
explícitamente**. Lo urgente para el sábado es sólo la de R8 t4 (ALIADO SCAT, todavía `inscripto`);
esa se puede corregir sola, sin tocar R6, si Yesi prefiere.

El SQL candidato de las tres variantes quedó escrito y **comentado, sin sentencias activas**, en
`migrations/personas_r8_tanda_5.sql`.

### 4.6 Por qué NO aparece en los selectores — investigado antes de duplicar

**No es un problema de datos. Es un bug de código: `tipo = 'ambos'` está filtrado afuera en
todos los módulos.** Es el único registro `ambos` de la base, así que el bug nunca se notó.

| archivo:línea | qué hace | efecto sobre `ambos` |
|---|---|---|
| `inscripciones.html:343` | `.eq('tipo','jockey')` en la query | ❌ nunca llega a la UI |
| `inscripciones.html:344` | `.eq('tipo','entrenador')` en la query | ❌ ídem |
| `inscripciones.html:357-358` | `filter(p=>p.tipo==='jockey'\|\|p.tipo==='ambos')` | **código muerto** — el `\|\|'ambos'` nunca matchea porque la query de arriba ya lo excluyó |
| `ratificacion.html:481` | trae **todos** los tipos | ✅ sí llega |
| `ratificacion.html:807` | `filter(p => p.tipo === 'jockey')` | ❌ lo descarta acá |
| `spcs.html:315 / 317` | `.eq('tipo','jockey')` / `.eq('tipo','entrenador')` | ❌ ni jockey habitual ni entrenador |
| `jockeys.html:271` | ABM lista sólo `tipo='jockey'` | ❌ no se puede editar como jockey |
| `profesionales.html:273` | ABM lista sólo `tipo='entrenador'` | ❌ no se puede editar como entrenador |
| `sanciones.html:256 / 259` | `.eq('tipo',…)` estricto | ❌ no sancionable por UI |
| `index.html:235-236` | contadores por tipo estricto | ❌ no lo cuenta en ningún lado |

O sea: **la fila de Iván (`ambos`) es invisible y no editable desde la app**, en las dos puntas.
Sus 7 referencias entraron por migración (seed + corrección de montas de R6), no por UI.
Matías (`entrenador`) sí aparece normal en los selectores de entrenador.

**Para avisarle a Yesi:** Iván ya figura como jockey **y** entrenador (`tipo = 'ambos'`) desde la
tanda 2; lo que falla es que los desplegables no muestran el tipo `ambos`. Si al final se decide
dejarlo como `jockey` a secas (§4.5), el bug deja de afectarlo — pero sigue siendo un bug.

**Fix propuesto (código, gate aparte — NO incluido en esta tanda):**

```diff
- .eq('tipo', 'jockey')        →  .in('tipo', ['jockey','ambos'])
- .eq('tipo', 'entrenador')    →  .in('tipo', ['entrenador','ambos'])
- p.tipo === 'jockey'          →  (p.tipo === 'jockey' || p.tipo === 'ambos')
```

Toca 6 archivos (`inscripciones`, `ratificacion`, `spcs`, `jockeys`, `profesionales`, `sanciones`)
+ los contadores de `index.html`. Es chico y mecánico, pero es **cambio de código a 6 días de la
reunión** → decidí no meterlo junto con los datos. Decime y lo hago en un branch aparte con su
propio gate. Mientras tanto, la alternativa cero-riesgo si Yesi lo necesita YA en un desplegable:
cambiarle `tipo` a `'jockey'` o a `'entrenador'` (pierde la otra mitad) — **no recomendado**.

Queda anotado como ISSUE nuevo (`tipo='ambos'` invisible app-wide).

---

## 5. Planilla nueva — PENDIENTE, no llegó

El pedido dice "cuando pases, cruzá los SPCs de las hojas contra la base (179)". **No recibí la
versión nueva de la planilla en este turno** — no hay archivo nuevo en el repo ni pegado en el chat.

Cuando la pases (archivo o pegada), corro el cruce de siempre contra las 179 filas de `spcs`
(match por nombre normalizado + por `studbook_id` donde haya) y devuelvo **sólo el reporte**:
colados, faltantes, homónimos sospechosos. **Cero altas sin gate**, como pediste.

---

## 6. Migraciones escritas (a la espera del gate)

| archivo | qué hace | efecto | estado |
|---|---|---|---|
| `migrations/caballerizas_r8_tanda_5.sql` | rename EL POE→EL POBRE · alta LUNA ROJA (AZ) · alta TIAN Y ROMA (LP) | `caballerizas` 292 → **294** | ⏳ espera gate |
| `migrations/personas_r8_tanda_5.sql` | **sin sentencias activas** — sólo el análisis de ALDECOA y las tres variantes candidatas, comentadas | ninguno | 🛑 bloqueado por §4 |

La de caballerizas es idempotente (`WHERE NOT EXISTS` normalizado en las altas, filtro por el
nombre viejo en el UPDATE) y trae bloque de verificación pre-`COMMIT`.

`spcs` **no se toca en esta tanda** — sigue en 179.

---

## 7. Checklist de aplicación (cuando haya gate)

1. `SELECT count(*) FROM spcs` → 179 · `FROM caballerizas` → 292 · `FROM profesionales` → 184.
2. `apply_migration` `caballerizas_r8_tanda_5` → verificar 294, las 3 filas, `EL POE` = 0,
   responsable de MEDINA intacto, duplicados normalizados = sólo los 2 preexistentes
   (`El linye y Rami` / `La Narcisa`).
3. ALDECOA: **no correr nada** hasta las dos respuestas de Yesi (§4.3 y §4.5). Con la respuesta,
   se escribe el SQL definitivo y se pasa por gate aparte.
4. Marcar el `.sql` aplicado con el resultado real, actualizar este doc y el CHANGELOG.
5. Commit + merge a `main`.
