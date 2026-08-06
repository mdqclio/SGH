# Gate 4 — Inscribir desde el portal · **PLAN** (sin código)

**Fecha**: 2026-08-06 · **Branch**: `sec/autoregistro-gate-4` (desde `main` @ `d8472c0`)
**Ref**: `unlhcuanfrtpatoipwve` · **Guard**: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **163** ✅
**Diseño base**: `AUTOREGISTRO_PLAN.md §Gate 4` + `PORTAL_V2_PLAN.md §C.2/§C.3` + `GOTCHAS #69`

> **Este documento es el gate 4.0.** No hay código todavía. Nada de lo de acá se aplica hasta que Fede apruebe el plan. **Nada se mergea a `main` bajo ninguna circunstancia**, ni con todo en verde — el merge lo decide Fede (hoy o el lunes 17).

---

## 0. Por qué este gate va plan-first y los otros no

Los gates 2 y 3 escriben en `solicitudes_acceso` y `usuarios`: tablas de la periferia, que si salen mal se limpian con un DELETE y no afectan a nadie que esté corriendo.

El gate 4 escribe en **`inscripciones`**, que es la tabla de la que sale el programa, la carta de llamados, el sorteo de gateras, los mandiles, la liquidación y el JSON del Stud Book. Un error acá no es un bug de UI: es un caballo que aparece en un programa donde no debía, o un entrenador que cree que se anotó y no está.

Además estrena tres cosas que **nunca corrieron en producción**: el vínculo usuario↔entidad (0 filas hoy), la tenencia de caballos (0 filas hoy) y la escritura desde una cuenta de portal (prohibida hoy por RLS).

---

## 1. Estado real medido hoy (06/08) — no supuestos

Todo lo de abajo salió de consultas contra prod, no de los docs.

### 1.1 Tenencia — el agujero

| dato | valor |
|---|---:|
| `spcs` totales | **163** |
| `spcs.entrenador_id` poblado | **0** |
| `spcs.caballeriza_id` poblado | **0** |
| `spc_propietarios` (filas) | **0** |
| `usuarios` con `entidad_tipo` + `entidad_id` | **0** |

`fn_mis_spc_ids()` — la función que ya está viva y decide qué caballos ve un usuario de portal — lee exactamente esos dos caminos:

```sql
SELECT s.id FROM spcs s WHERE s.entrenador_id IN (mis entidades tipo 'profesional')
UNION
SELECT sp.spc_id FROM spc_propietarios sp WHERE sp.activo AND sp.propietario_id IN (mis entidades tipo 'propietario');
```

Con las tablas como están hoy, **`fn_mis_spc_ids()` devuelve 0 filas para cualquier usuario**. El portal es una pantalla vacía y el gate 4 no tiene sobre qué operar.

### 1.2 Ventana de inscripción

| Reunión | fecha | estado | carreras | con `apertura` | con `cierre` | con `cupo` |
|---|---|---|---:|---:|---:|---:|
| R6 | 20/06 | `publicada` | 11 | 0 | 0 | 0 |
| R7 | 19/07 | `cancelada` | 12 | 0 | 0 | 0 |
| **R8** | **16/08** | **`publicada`** | **12** | **2** | **2** | 0 |
| R9 | 06/09 | `programada` | **0** | — | — | — |
| R10-R12 | 10/26 – 12/26 | `programada` | **0** | — | — | — |

Tres hallazgos que cambian el diseño:

1. **R9 no tiene carreras cargadas.** El piloto de inscripción online en R9 no puede empezar hasta que la secretaría cargue la carta de llamados. No es un problema del gate 4, pero es una dependencia dura de calendario.
2. **`carreras.estado = 'abierta'` NO significa "inscripción abierta".** `carta-llamados.html:945` escribe `estado: 'abierta'` en **toda** carrera que guarda, sin condición. Por eso hay 31 carreras `abierta` de 38, incluidas las de R6 (ya corrida) y R7 (cancelada). Usar ese campo como criterio de ventana abriría el portal a reuniones pasadas.
3. **La secretaría hoy no puede abrir la ventana en R8.** `carta-llamados.html:614/621` bloquea la edición cuando `reunion.estado` no es `borrador` ni `programada`. R8 está `publicada` → los campos `apertura_inscripcion` / `cierre_inscripcion` están congelados. Las 2 carreras que tienen ventana la tienen de antes de publicar.

### 1.3 Trazabilidad — diseñada y nunca poblada

| columna | estado |
|---|---|
| `inscripciones.canal` | `NOT NULL DEFAULT 'manual'` · **186/186 en `manual`** |
| `inscripciones.inscripto_por` | nullable · **0/186 poblado** |
| ENUM `canal_inscripcion` | `manual`, `web`, `app` — **`portal` NO existe** |

### 1.4 RLS de `inscripciones` — hoy el portal no puede escribir (bien) y ve de más (mal)

| policy | qual / with_check |
|---|---|
| `inscripciones_insert` | `NOT fn_is_portal_user() AND (super_admin OR club de la carrera = club del usuario)` |
| `inscripciones_update` | ídem |
| `inscripciones_delete` | ídem |
| `inscripciones_select` | `super_admin OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id()` |

- **INSERT/UPDATE/DELETE**: el portal está excluido explícitamente. Correcto, y es la base del diseño por RPC.
- ⚠️ **SELECT**: es **club-wide y no excluye al portal**. Un usuario de portal tiene `usuarios.club_id = Dolores`, así que **ve las 186 inscripciones del club, no sólo las suyas**. `probe_rls_portal` no lo detecta: su assert 10 sólo verifica que A **sí** ve la propia, nunca que **no** ve la ajena.
  Es un hueco **preexistente**, no lo introduce el gate 4 — pero "Mis inscripciones" (§E.3) lo pone en pantalla, así que se cierra acá. Ver §C.6.

### 1.5 `validar_inscripcion` — existe y sirve

`validar_inscripcion(p_spc_id, p_carrera_id) RETURNS TABLE(puede_inscribirse boolean, motivo text)`. Valida: SPC activo, edad mín/máx, condición de sexo, sanción vigente (`v_sanciones_vigentes`) y cupo (sólo si `cupo_maximo IS NOT NULL`, hoy 0/38). **No** es `SECURITY DEFINER` — corre con los permisos del que llama, así que desde un RPC `SECURITY DEFINER` hereda los del owner. Bien.

---

## A. TENENCIA — qué caballos puede inscribir un entrenador

### A.1 La decisión: **backfill, no derivación en runtime**

**Derivación en runtime = NO.** El plan del portal proponía resolver la tenencia calculándola sobre `inscripciones` históricas en cada llamada. Se descarta, por tres razones:

1. **Es control de acceso.** Lo que decide si puedo escribir sobre el caballo de otro no puede ser una inferencia recalculada en cada request. Tiene que ser un campo explícito, legible, auditable y corregible por la secretaría desde el ABM.
2. **La tenencia cambiaría sola.** Si se deriva de "la última inscripción", entonces cada vez que la secretaría carga una inscripción a mano, la tenencia de ese caballo se mueve — sin que nadie haya decidido moverla. Un error de tipeo en el back office le daría acceso de escritura a otra persona.
3. **No se puede corregir.** Si la derivación se equivoca, Yesi no tiene dónde arreglarlo: tendría que editar inscripciones históricas, que son registro de reuniones ya corridas.

**Backfill = SÍ**, por única vez, con la derivación como **fuente del dato inicial** y no como mecanismo permanente. Después de eso, la fuente de verdad es `spcs.entrenador_id`, que ya es lo que `fn_mis_spc_ids()` lee. **No se toca `fn_mis_spc_ids()`.**

### A.2 Por qué esto no contradice la decisión de las 57 caballerizas

Son casos distintos y conviene decirlo explícito, porque a primera vista parecen el mismo:

| | procedencia de caballerizas (05/08) | tenencia de SPCs (este gate) |
|---|---|---|
| qué se proponía poner | `DOL` **por defecto** | el entrenador que **efectivamente lo inscribió** |
| de dónde salía | de nada — de asumir | de una fila real de `inscripciones`, cargada por la secretaría |
| si está mal | nadie se entera: `DOL` es plausible para todos | Yesi lo ve en el ABM y lo corrige |
| qué pasa si falta | `null`, honesto | `null`, el caballo no aparece en el portal |

El criterio es el mismo — **no inventar** —, y por eso también acá lo que no tiene evidencia queda en `NULL`.

### A.3 Regla de derivación

Para cada `spc_id`: el **`entrenador_id` de su inscripción más reciente que tenga `entrenador_id` no nulo**, ordenando por `reuniones.fecha DESC`, desempate `inscripciones.created_at DESC`.

Exclusiones:
- **Reunión 9999** (`PRUEBA RESUMEN`, sintética). Sin esta exclusión el backfill toma datos de prueba: la consulta sin filtrar da `fecha_max = 2099-01-01` y suma 17 SPCs que sólo existen ahí.
- Nada más se excluye. **Las reuniones canceladas sí cuentan**: R7 se canceló, pero las inscripciones que la secretaría cargó son evidencia real de quién entrenaba a ese caballo. (Medido: incluir o excluir R7 da el mismo resultado, porque esas filas no traen `entrenador_id`.)

Mismo criterio, en paralelo, para **`spcs.caballeriza_id`** desde `inscripciones.caballeriza_id`. No es opcional: sin caballeriza, el trigger `fn_inscripcion_set_propietario` deja `propietario_id` en NULL y la inscripción nace rota para liquidaciones (GOTCHA #47).

### A.4 Resultado medido del backfill propuesto

| | SPCs |
|---|---:|
| con `entrenador_id` derivable | **113** |
| con `caballeriza_id` derivable | **114** |
| con **ambos** | **112** |
| con entrenador **ambiguo** (2 entrenadores distintos en su historia) | **1** |
| **quedan en `NULL`** | **50** |

Entrenadores distintos involucrados: **63**. Toda la evidencia es de R6 (20/06) en adelante.

**Los 50 sin dato quedan en `NULL` y no se inventan.** Consecuencia concreta y aceptada: esos caballos **no aparecen** en "Mis caballos" y **no se pueden inscribir desde el portal**. La secretaría los inscribe como siempre. Se drenan solos cuando Yesi complete la ficha o cuando el caballo corra una vez más.

**El 1 ambiguo no se resuelve automáticamente.** Gana el más reciente por la regla, pero sale listado en el reporte del gate para que Yesi lo confirme. Un solo caso: no justifica maquinaria.

### A.5 Propietarios: **fuera del alcance de inscribir**

`spc_propietarios` tiene 0 filas y no hay de dónde derivarla con confianza: `inscripciones.propietario_id` está poblado en 35/186 (19 %) y ya es un bloqueante conocido (GOTCHA #47). Derivar propiedad de ahí sería exactamente el error que descartamos en §A.2.

Entonces, en el gate 4: **sólo el entrenador inscribe**. El propietario, cuando su vínculo exista, entra al portal y **ve** (sus caballos, sus inscripciones, lo que se le debe) pero no anota. Argumento adicional: inscribir es operativamente un acto del entrenador — es quien decide en qué carrera corre el caballo. No estamos sacando una función que alguien esté esperando.

### A.6 Gate propio: **4.1**

El backfill es un gate aparte, con su propio informe y su propio rollback:

- SQL versionado en `migrations/backfill_tenencia_spcs.sql`, idempotente (`WHERE entrenador_id IS NULL`), aplicado por MCP.
- **Snapshot previo** de `(id, entrenador_id, caballeriza_id)` de las 163 filas → `migrations/rollback_tenencia_spcs.sql` con los `UPDATE` de vuelta. Como hoy todo es NULL, el rollback es un `UPDATE ... SET entrenador_id = NULL, caballeriza_id = NULL WHERE id IN (...)` acotado a los ids tocados.
- Reporte: `docs/GATE_4_1_BACKFILL_TENENCIA.md` con conteos antes/después, la lista de los 50 sin dato y el 1 ambiguo.
- **Verificación**: `count(*) FILTER (WHERE entrenador_id IS NOT NULL)` = 113, y una muestra de 10 SPCs cruzada a mano contra su última inscripción.

---

## B. VENTANA — cuándo se puede inscribir

### B.1 El criterio

```
reuniones.estado = 'publicada'
  AND carreras.estado IS DISTINCT FROM 'anulada'
  AND carreras.apertura_inscripcion IS NOT NULL
  AND carreras.cierre_inscripcion  IS NOT NULL
  AND now() BETWEEN carreras.apertura_inscripcion AND carreras.cierre_inscripcion
```

**Fail-closed**: si falta cualquiera de las dos fechas, la carrera **no está abierta**. Sin fallback, sin "si es NULL asumimos abierta", sin heredar fechas de la reunión.

### B.2 Por qué así y no de otra forma

- **`carreras.estado` no sirve como señal.** Es VARCHAR libre y `carta-llamados.html:945` lo pisa con `'abierta'` en todo guardado. 31 de 38 carreras están `'abierta'`, incluidas las de una reunión ya corrida y una cancelada. Se usa **sólo** para excluir `'anulada'`.
- **`reuniones.estado` solo tampoco alcanza.** R6 (20/06, ya corrida) sigue `publicada`. Si el criterio fuera el estado de la reunión, el portal ofrecería anotarse a una carrera de junio.
- **`reuniones.fechas_inscripciones` es texto libre y está en NULL en las 12 reuniones.** Sirve como cartel informativo, nunca como habilitación.
- **No se inventa proceso.** Los campos `apertura_inscripcion` / `cierre_inscripcion` **ya existen** y **ya están en la pantalla que Yesi usa** (`carta-llamados.html`, campos `f-ap-insc` / `f-ci-insc`, líneas 396/400). No hay tabla nueva, ni flag nuevo, ni pantalla nueva: hay un campo que existe y no se está llenando.

### B.3 El bloqueante real, y el gate 4.2

Hoy Yesi **no puede** cargar la ventana en R8: la carta de llamados congela la edición cuando la reunión pasa a `publicada` (líneas 614/621), y la inscripción abre justamente cuando la reunión ya está publicada. El proceso, tal como está el código, es contradictorio consigo mismo.

**Gate 4.2 (UI mínima)**: permitir editar **sólo** `apertura_inscripcion` y `cierre_inscripcion` cuando `reunion.estado = 'publicada'`. Todo el resto de la carta sigue bloqueado igual que hoy.

Es el cambio más chico que hace el criterio operable, y no toca el circuito del día de carrera. **Requiere OK de Fede/Yesi**: cambia qué puede editarse después de publicar. Si Fede prefiere otra vía (abrir la ventana antes de publicar, como disciplina de proceso), el gate 4.2 se cae y el resto del plan queda igual — el criterio de §B.1 no cambia.

### B.4 Cupo

`cupo_maximo` está en 0/38 carreras. `validar_inscripcion` ya lo contempla y sin dato simplemente no aplica tope. **No se toca.** Queda como pregunta para Fede: ¿Dolores usa cupo por carrera? Si la respuesta es sí, es dato, no código.

---

## C. RPC `rpc_inscribir`

### C.1 Forma

```sql
CREATE OR REPLACE FUNCTION public.rpc_inscribir(p_spc_id uuid, p_carrera_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
```

- `SECURITY DEFINER` + `SET search_path` (GOTCHA #10 y la regla de RLS del proyecto).
- `REVOKE EXECUTE ON FUNCTION rpc_inscribir FROM PUBLIC, anon;` + `GRANT EXECUTE TO authenticated;`
- Devuelve el `id` de la inscripción creada.
- Las policies de `inscripciones` **no se tocan**: el portal sigue sin poder hacer INSERT directo. Toda la escritura entra por acá. Es la diferencia entre "el cliente puede insertar y confiamos en el JS" y "el cliente no puede insertar, punto".

> **Nombre**: Leo pidió `rpc_inscribir`. `PORTAL_V2_PLAN §C.2` y los asserts 11/12 de `probe_rls_portal` lo llaman `portal_inscribir`. Se usa **`rpc_inscribir`** y se actualizan las dos referencias del probe. Un solo nombre, sin alias.

### C.2 Validaciones, en orden

| # | validación | falla → |
|---|---|---|
| 1 | el que llama es usuario de portal **con entidad `profesional`** (`fn_mis_entidades()`) | `EXCEPTION 'no autorizado'` |
| 2 | `p_spc_id ∈ fn_mis_spc_ids()` — **tenencia** | `EXCEPTION 'ese caballo no está a su nombre'` |
| 3 | la carrera existe y su **ventana está abierta** (§B.1) | `EXCEPTION 'la inscripción para esa carrera no está abierta'` |
| 4 | `validar_inscripcion(p_spc_id, p_carrera_id).puede_inscribirse` | `EXCEPTION` con el `motivo` que devuelve la función |
| 5 | no existe ya una inscripción de ese SPC **en esa carrera** | `EXCEPTION 'ese caballo ya está anotado en ese turno'` |

⚠️ **Validación 4 — la trampa que ya se comió el portal.** `validar_inscripcion` devuelve `TABLE(puede_inscribirse, motivo)`. `portal.html:560` evalúa `valResult.valido === false`, un campo que no existe: `undefined === false` es `false`, así que **la validación nunca bloqueó nada** — edad, sexo, sanción y cupo pasaban todos. En el RPC va con `SELECT ... INTO v_ok, v_motivo FROM validar_inscripcion(...)` y se chequea `v_ok IS NOT TRUE` (no `= false`: si la función no devuelve fila, NULL tiene que bloquear).

### C.3 Multi-categoría: **PERMITIDO** — GOTCHAS #69

**No hay validación de unicidad por reunión, y no se agrega ningún constraint.** El mismo `spc_id` en dos carreras distintas de la misma reunión es el **estado esperado** del proceso entre el cierre de anotaciones y el lunes previo, cuando la secretaría decide en cuál queda. En prod ya pasa: R6 tiene 13 ejemplares anotados en 2 turnos cada uno.

La validación 5 es **por carrera** (`UNIQUE (carrera_id, spc_id)`, el constraint que ya existe), nunca por reunión.

La UI puede mostrar un **aviso informativo** ("este caballo ya está anotado en el turno 3 de esta misma reunión"), nunca un rechazo.

**Assert obligatorio del probe**: inscribir el mismo SPC en dos carreras de la misma reunión → **las dos aceptadas**, 2 filas en `inscripciones`.

### C.4 Qué escribe

```
carrera_id      = p_carrera_id
spc_id          = p_spc_id
estado          = 'inscripto'          -- no el default 'pre_inscripto'
canal           = 'portal'             -- ver C.5
inscripto_por   = auth.uid()
entrenador_id   = spcs.entrenador_id   -- la tenencia que autorizó la operación
caballeriza_id  = spcs.caballeriza_id  -- imprescindible: sin ella el trigger
                                       -- fn_inscripcion_set_propietario deja
                                       -- propietario_id en NULL (GOTCHA #47)
```

`estado = 'inscripto'` porque es el valor que usa el circuito real (52 de 186 filas; `pre_inscripto` no se usa en ninguna). El portal no ratifica: eso sigue siendo acto de secretaría.

`propietario_id` **no se setea a mano** — lo pone el trigger a partir de la caballeriza.

Esto estrena `canal` + `inscripto_por`, que están diseñados desde el principio y hoy tienen 0 filas pobladas. A partir del gate 4 se puede responder "¿quién anotó a este caballo?" sin preguntar por teléfono.

### C.5 El ENUM no tiene `portal` — gate 4.1

`canal_inscripcion` es `('manual','web','app')`. Leo pidió `canal='portal'`, que es el valor correcto (`web` es ambiguo: el back office también es web).

```sql
ALTER TYPE canal_inscripcion ADD VALUE IF NOT EXISTS 'portal';
```

- Es aditivo y seguro (GOTCHA #11: sólo `ADD VALUE`, nunca quitar).
- ⚠️ **Va en su propia migración, antes que la del RPC.** Postgres no deja usar un valor de ENUM en la misma transacción en la que se lo agregó.
- Ningún consumidor rompe: nadie filtra por `canal` hoy (186/186 en `manual`).

### C.6 El hueco de SELECT (§1.4) se cierra acá

`inscripciones_select` es club-wide y no excluye al portal → hoy un entrenador vería las inscripciones de todos. Se corrige en el mismo gate:

```sql
-- inscripciones_select pasa a:
   fn_is_super_admin()
   OR (NOT fn_is_portal_user() AND fn_club_de_carrera(carrera_id) = fn_get_user_club_id())
   OR (fn_is_portal_user() AND spc_id IN (SELECT spc_id FROM fn_mis_spc_ids()))
```

La secretaría sigue viendo todo su club, igual que hoy. El portal pasa a ver **sólo las inscripciones de sus propios caballos**. Es la fuente de §E.3 y de paso tapa un hueco preexistente.

**Assert nuevo en el probe**: A **no** ve la inscripción de B (hoy la ve). Es el complemento negativo del assert 10, que sólo mira el lado positivo.

---

## D. BAJA — ¿puede el entrenador retirar lo suyo?

### D.1 Propuesta: **sí, acotada** — `rpc_baja_inscripcion(p_inscripcion_id)`

Se permite **sólo** si se cumplen las cuatro condiciones, todas verificadas dentro del RPC:

1. `canal = 'portal'` **y** `inscripto_por = auth.uid()` — es una fila que creó él, desde el portal
2. la ventana de esa carrera **sigue abierta** (§B.1)
3. `estado = 'inscripto'` — no ratificada, no forfait
4. el SPC sigue en `fn_mis_spc_ids()`

Efecto: **DELETE** de la fila.

### D.2 El argumento

**A favor de permitirlo:**

- Mientras la ventana está abierta, esa fila **todavía no produjo nada**: no hay programa, ni sorteo de gateras, ni carta impresa, ni mandiles. Borrarla no deja huella en ningún documento.
- El caso real es el error de tipeo: anotó el caballo equivocado y se da cuenta a los diez segundos. Si eso obliga a un llamado telefónico a la secretaría, el portal **le agregó trabajo a Yesi** en vez de sacárselo — que es exactamente lo contrario de para qué existe.
- Es simétrico: si el portal te deja crear la fila, dejarte deshacer **esa misma fila** dentro de la misma ventana no amplía la superficie de escritura. No puede tocar nada que no haya creado él.

**Los límites, y por qué están donde están:**

- **`canal='portal'` + `inscripto_por = self`** es la línea dura. El portal **nunca** puede borrar una inscripción cargada por la secretaría, aunque sea del mismo caballo. Si Yesi la cargó a mano, hubo una decisión de secretaría atrás y el portal no la revierte.
- **Ventana cerrada → no.** Desde el cierre la inscripción alimenta el programa. Sacarse de ahí es un **forfait**, que es un acto de ratificación y está explícitamente fuera de v1 (`PORTAL_V2_PLAN §C.5`, decisión 2 pendiente de Fede). Retirarse tarde se sigue haciendo por teléfono.
- **`estado='inscripto'` únicamente.** Si ya está `ratificado`, hay un acto de secretaría encima y no se toca.
- **DELETE y no un estado nuevo.** La fila nunca tuvo efecto; dejarla como "cancelada" agregaría un valor al ENUM `estado_inscripcion` (que es rígido, GOTCHA #4) para representar algo que operativamente no existe. La trazabilidad de quién la creó y la borró queda en la auditoría, no en la tabla de trabajo.

### D.3 Lo que esto NO es

No es la baja del lunes. La **resolución multi-categoría** — elegir en qué carrera queda el caballo y dar de baja las otras — la sigue haciendo la secretaría desde el back office, como dice `AUTOREGISTRO_PLAN §Gate 4`. El portal no la expone ni la insinúa.

### D.4 Si Fede prefiere que no

Si la respuesta es "sólo secretaría", se cae `rpc_baja_inscripcion` y el botón de la UI; el resto del gate no cambia. Lo dejo planteado como recomendación, no como hecho consumado.

---

## E. UI — `portal.html`

`portal.html` existe (701 líneas) pero **nunca funcionó contra datos reales**. Tiene tres secciones armadas (`Mis SPC`, `Carta de llamados`, `Mis inscripciones`) y un modal de inscripción, todo cableado contra un modelo que no es el vivo.

### E.0 Bugs vivos que hay que arreglar antes de agregar nada

| línea | bug | efecto |
|---|---|---|
| 472 | `.in('estado', ['publicada','abierta'])` sobre `reuniones` | **`'abierta'` no existe** en el ENUM `estado_reunion` → `22P02 invalid input value for enum`. La carta de llamados **nunca carga**, ni con datos ni sin ellos. |
| 560 | `valResult.valido === false` | `validar_inscripcion` devuelve `puede_inscribirse`, no `valido`. **La validación nunca bloqueó nada** (§C.2). |
| 449 | `sb.from('spcs').insert(...)` | alta de SPC desde el portal. Los SPCs son **globales**: un entrenador daría de alta registros del Stud Book para todo el sistema. **Se elimina** (`PORTAL_V2_PLAN §C.1`). Hoy además ya lo frena `spcs_insert` (`fn_is_staff()`), así que es UI muerta que sólo produce un error feo. |
| 621/630 | botón **Forfait** | fuera de v1 (§C.5 del plan del portal). **Se elimina.** |
| 336 | `formatMonto()` propio | contra la convención del repo. Se reemplaza por `formatARS()`. |

### E.1 El llamado abierto

Lista de carreras que cumplen §B.1, agrupadas por reunión, con fecha, **turno** (etiquetado turno, no "carrera" — ISSUE-029), categoría, condición, distancia y **hasta cuándo** se puede anotar.

> **Vacío**: «No hay inscripciones abiertas en este momento. Cuando la secretaría abra el llamado para la próxima reunión, va a aparecer acá.» — nunca una tabla vacía sin explicación.

### E.2 Mis caballos

`fn_mis_spc_ids()`, sólo lectura, como ya está diseñado.

> **Vacío**: «Todavía no tenemos caballos asociados a tu ficha. Si tenés caballos a tu cargo, avisale a la secretaría para que los vincule.» — es el estado que van a ver los entrenadores de los **50 SPCs sin tenencia** (§A.4). Tiene que explicar qué hacer, no dejarlos mirando la nada.

### E.3 Anotar

Desde una carrera del llamado → elegir entre **mis caballos** (no un buscador libre sobre los 163) → `rpc_inscribir`.

- Si el caballo ya está anotado en **otro turno de la misma reunión**: **aviso informativo**, y el botón sigue habilitado (§C.3).
- Si el caballo ya está anotado en **ese mismo turno**: el botón se deshabilita con el motivo.
- Los `EXCEPTION` del RPC se muestran tal cual: son mensajes escritos para que los lea una persona.

### E.4 Mis inscripciones

Ejemplar, reunión + fecha, **turno**, categoría, estado, y de dónde vino (`canal`). Botón **Retirar** sólo en las filas que cumplen §D.1 — si no, no se muestra el botón (no se muestra deshabilitado: no hay que ofrecer lo que no se puede).

> **Vacío**: «No tenés inscripciones registradas. Las que cargue la secretaría por vos también aparecen acá.»

---

## F. PROBES

Todo probe corre contra **prod** con fixtures propios y teardown, siguiendo el patrón de `probe_rls_portal.mjs` (cliente admin + clientes de portal reales, y **toda escritura verificada por relectura con el cliente admin**, nunca por el status de la respuesta — un UPDATE bloqueado por RLS devuelve éxito con 0 filas).

### F.1 `probe_rls_portal.mjs` — destrabar 11 y 12

| # | assert | hoy |
|---|---|---|
| 11 | `rpc_inscribir` rechaza un SPC ajeno | PENDIENTE (el RPC no existe) |
| 12 | `rpc_inscribir` rechaza fuera de ventana | PENDIENTE |
| **14 (nuevo)** | **A NO ve la inscripción de B** | **hoy falla** — hueco de §1.4 / §C.6 |

### F.2 `probe_gate4_inscribir.mjs` — nuevo

| # | assert | esperado |
|---|---|---|
| G1 | entrenador con tenencia inscribe su caballo en carrera con ventana abierta | ✅ 1 fila nueva |
| G2 | la fila nace con `canal='portal'`, `inscripto_por = auth.uid()`, `estado='inscripto'` | ✅ los tres |
| G3 | `entrenador_id` y `caballeriza_id` copiados del SPC, y `propietario_id` **no** queda NULL | ✅ (verifica que el trigger corrió) |
| **G4** | **multi-categoría: el mismo SPC en 2 carreras de la misma reunión** | ✅ **las 2 aceptadas** (GOTCHA #69) |
| G5 | el mismo SPC **dos veces en la misma carrera** | ❌ rechazado |
| **G6** | **tenencia negativa: inscribir un caballo AJENO** | ❌ rechazado — y **0 filas** al releer con admin |
| **G7** | **ventana cerrada** (`cierre` en el pasado) | ❌ rechazado |
| G8 | ventana sin cargar (`apertura`/`cierre` NULL) | ❌ rechazado — fail-closed |
| G9 | reunión en `borrador` con ventana abierta | ❌ rechazado |
| G10 | carrera `anulada` con ventana abierta | ❌ rechazado |
| G11 | SPC que no pasa `validar_inscripcion` (sexo/edad) | ❌ rechazado, con el motivo de la función |
| G12 | baja de la propia inscripción con ventana abierta | ✅ borrada |
| G13 | baja de una inscripción **cargada por secretaría** (`canal='manual'`) | ❌ rechazada — y la fila **sigue ahí** |
| G14 | baja con la ventana **cerrada** | ❌ rechazada |
| G15 | un usuario **staff** llamando `rpc_inscribir` | ❌ rechazado (§C.2 validación 1) — el back office tiene su propio camino |

G6, G7, G13 y G14 son los que el gate no puede dar por buenos sin ver fallar: son los que impiden anotar un caballo ajeno, anotarse tarde y borrar el trabajo de la secretaría.

### F.3 Fixtures — cuidado

Hoy hay **0 usuarios vinculados** en prod, así que el probe crea sus propias cuentas de portal con `entidad_tipo/entidad_id` y sus propios SPCs, carreras y reunión de fixture (`numero = 9995+`, fecha 2099). **No se toca R8 ni ninguna reunión real.** Teardown en `tests/teardown_probe_rls.sql`, extendido.

⚠️ Orden de borrado: `resultado_posiciones` → `inscripciones` → `carreras` → `reuniones` (GOTCHA #12).

---

## G. Gates, en orden

| gate | qué | entregable | se aplica |
|---|---|---|---|
| **4.0** | **este plan** | `docs/AUTOREGISTRO_GATE_4.md` | — |
| 4.1 | ENUM `canal='portal'` + backfill de tenencia | `migrations/canal_portal.sql`, `migrations/backfill_tenencia_spcs.sql`, `migrations/rollback_tenencia_spcs.sql`, `docs/GATE_4_1_BACKFILL_TENENCIA.md` | DDL/DML por MCP |
| 4.2 | ventana editable con reunión `publicada` | `carta-llamados.html` | sólo branch |
| 4.3 | `rpc_inscribir` + `rpc_baja_inscripcion` + policy de SELECT + probes | `migrations/rpc_inscribir.sql`, `migrations/rpc_baja_inscripcion.sql`, `migrations/inscripciones_select_portal.sql`, `tests/probe_gate4_inscribir.mjs`, `probe_rls_portal` extendido | DDL por MCP |
| 4.4 | UI | `portal.html` | sólo branch |

Cada gate cierra con su verificación antes de pasar al siguiente. **Ninguno se mergea.**

⚠️ Los gates 4.1 y 4.3 **escriben en la base de producción** (backfill de 113 filas de `spcs`, funciones nuevas, una policy modificada). El código vive en la branch, pero el efecto en la DB es global — no hay "branch" de datos. Por eso cada uno lleva rollback pre-staged y no arranca sin el OK explícito de Fede sobre este plan.

---

## H. Preguntas para Fede — bloquean el arranque de 4.1

1. **Backfill de tenencia** (§A): ¿se aplica la derivación de los 113? ¿O prefiere que Yesi cargue la tenencia a mano en el ABM de SPCs, aunque tarde más?
2. **Ventana editable con la reunión publicada** (§B.3): ¿se destraban los dos campos, o la disciplina pasa a ser "la ventana se carga antes de publicar"?
3. **Baja propia del entrenador** (§D): ¿va como está propuesta (sólo su propia fila, sólo con ventana abierta), o sólo secretaría?
4. **Cupo por carrera** (§B.4): ¿Dolores lo usa? Hoy está en 0/38.
5. **Piloto**: R9 (06/09) **no tiene carreras cargadas**. Para probar el circuito completo hace falta la carta de llamados de R9. ¿Cuándo se carga?

---

## I. Lo que este gate NO hace

| queda afuera | por qué |
|---|---|
| que el propietario inscriba | sin fuente confiable de tenencia (§A.5) |
| forfait / ratificar desde el portal | acto de secretaría, decisión 2 pendiente (`PORTAL_V2_PLAN §C.5`) |
| alta de SPC desde el portal | Stud Book global; se **elimina** el código que hoy lo intenta (§E.0) |
| resolución multi-categoría del lunes | back office (§D.3) |
| liberar retención de doping | control de secretaría |
| tocar R8 | el gate no escribe en ninguna reunión real |
| mergear a `main` | lo decide Fede |
