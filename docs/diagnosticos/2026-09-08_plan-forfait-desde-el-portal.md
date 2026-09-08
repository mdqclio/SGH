# PLAN — forfait desde el portal (ventana de ratificación)

**Fecha:** 2026-09-08
**Estado:** **PLAN. NADA APLICADO.** Ni código, ni DDL, ni datos. Todo fue `SELECT`, `grep` y `sed`.
**Pedido:** Fede — *"forfait es retirar y tiene que ser el lunes antes de las 12 hs"*.
**Greps:** contra `main` (`git grep … main`, `git show main:…`).
**SHA de `main`:** `8dafe0943cc2d9072dbed814d71c9a49286797e3`
**SHA de este informe:** ver §8.

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) FROM spcs;      -- por MCP, proyecto unlhcuanfrtpatoipwve
[{"spcs":181}]

ref del proyecto: unlhcuanfrtpatoipwve
```

---

## 0. Las dos decisiones que pediste ver justificadas, primero

**§2 — NO es la misma acción con dos ventanas. Es la misma acción con DOS RESULTADOS.**
Durante la inscripción, retirar **borra la fila** (como hoy). Durante la ratificación, retirar
**tiene que dejar `estado='forfait'`**, porque el forfait **se imprime**: sale en el bloque
BORRADOS del PDF de ratificación y tachado en el programa. Un `DELETE` ahí borra el rastro de que
el caballo estuvo anotado, y el programa no puede tachar lo que no existe. Evidencia en §2.

**§3 — La fuente de verdad son `carreras.apertura_ratificacion` / `cierre_ratificacion`.**
Sí: **las mismas que ayer documenté como "no las lee nadie"** (ISSUE-074). Contraintuitivo, pero
es la única de las tres candidatas cuyo valor **coincide con la regla que dijo Fede**. La que
gobierna `ratificacion.html` pone el cierre el **domingo de la carrera**, seis días tarde.
Evidencia en §3.

**Y una corrección a la premisa del pedido, a favor tuyo:** `docs/MODELO_NUMERACION.md:129` dice
*"SORTEO (antes de ratificación)"*, lo contrario de lo que planteaste. **Los datos de R8 te dan la
razón** y el doc está desactualizado. Detalle en §5.

---

## 1. Relevamiento — qué valida hoy `rpc_baja_inscripcion`

Definición completa, traída de la base. Los guards, en orden:

| # | Guard | Qué exige | Confirmado |
|---|---|---|---|
| 1 | entidad del portal | `fn_mis_entidades()` con `entidad_tipo IN ('profesional','propietario')` | ✅ |
| 2 | usuario activo | `usuarios.auth_user_id = auth.uid() AND activo` | ✅ |
| 3 | la inscripción existe | `SELECT … WHERE id = p_inscripcion_id` | ✅ |
| 4 | **canal** | `v_insc.canal IS DISTINCT FROM 'portal'` → rechaza | ✅ **como dijiste** |
| 5 | **autor** | `v_insc.inscripto_por IS DISTINCT FROM v_usuario_id` → rechaza | ✅ **como dijiste** |
| 6 | estado | `v_insc.estado IS DISTINCT FROM 'inscripto'` → rechaza | ✅ |
| 7 | **ventana** | reunión `publicada` + `apertura_inscripcion`/`cierre_inscripcion` no nulas + `now()` entre las dos | ✅ **sólo la de inscripción** |

```sql
  IF v_insc.canal IS DISTINCT FROM 'portal'
     OR v_insc.inscripto_por IS DISTINCT FROM v_usuario_id
  THEN
    RAISE EXCEPTION 'Esa inscripción no la cargó usted desde el portal. Para darla de baja, hablá con la secretaría.';
  END IF;

  IF v_insc.estado IS DISTINCT FROM 'inscripto' THEN
    RAISE EXCEPTION 'Esa inscripción ya fue procesada por la secretaría y no se puede retirar desde el portal.';
  END IF;
  …
  IF v_carrera.reunion_estado IS DISTINCT FROM 'publicada'
     OR v_carrera.apertura_inscripcion IS NULL
     OR v_carrera.cierre_inscripcion  IS NULL
     OR now() < v_carrera.apertura_inscripcion
     OR now() > v_carrera.cierre_inscripcion
  THEN
    RAISE EXCEPTION 'La inscripción para ese turno ya cerró. Para retirar el caballo, hablá con la secretaría.';
  END IF;
```

**Confirmado: hoy sólo mira `apertura_inscripcion` / `cierre_inscripcion`, y exige
`canal='portal'` + `inscripto_por = el usuario`.** Ni una mención a las columnas de ratificación.

**Y el dato que cambia el diseño:** la acción es un **`DELETE`**, no un `UPDATE`.

```sql
  DELETE FROM resultado_posiciones WHERE inscripcion_id = p_inscripcion_id;
  DELETE FROM inscripciones        WHERE id = p_inscripcion_id;
```

El front (`portal.html:929`) espeja los guards para decidir si muestra el botón:

```javascript
function puedeRetirar(i) {
  return i.canal === 'portal'
    && i.inscripto_por === miUsuarioId
    && i.estado === 'inscripto'
    && ventanaAbierta(i.carreras || {}, i.carreras?.reuniones?.estado);
}
```

---

## 2. El cambio — misma acción, dos resultados distintos

### 2.1 Por qué el `DELETE` es correcto HOY y deja de serlo después del cierre

`docs/AUTOREGISTRO_GATE_4.md:300` justifica el borrado, y su justificación **tiene fecha de
vencimiento explícita**:

> *"Mientras la ventana está abierta, esa fila **todavía no produjo nada**: no hay programa, ni
> sorteo de gateras, ni carta impresa, ni mandiles. **Borrarla no deja huella en ningún
> documento**."*

Cerrada la inscripción, esa premisa deja de valer: la fila **ya produjo documentos**. Y el forfait
no es una ausencia — **es una entrada impresa**:

| Dónde | Qué imprime |
|---|---|
| `ratificacion.html:397-405` | bloque **BORRADOS** con el tag `FORFAIT` por cada uno |
| `programa.html:67-68` | `.forfait-row { opacity: 0.4 }` + `text-decoration: line-through` — el caballo aparece **tachado** |
| `CLAUDE.md:168` | *"**Borrados**: caballos que no corren: `forfait` (retirado) o `mal_inscrito`"* |
| `docs/MODULOS.md:55` | *"Ratificación: inscripto → ratificado (o forfait)"* |

**Un `DELETE` en la ventana de ratificación borra el rastro de que el caballo estuvo anotado.** El
programa no puede tachar una fila que no existe, y el bloque BORRADOS queda incompleto. Eso no es
una preferencia de diseño: es que el documento oficial saldría mal.

### 2.2 La decisión

| Ventana | Acción del usuario | Resultado en la base | Por qué |
|---|---|---|---|
| **Inscripción** (`apertura_inscripcion` → `cierre_inscripcion`) | "Retirar" | **`DELETE`** — como hoy | la fila no produjo ningún documento |
| **Ratificación** (`apertura_ratificacion` → `cierre_ratificacion`) | "Dar forfait" | **`UPDATE estado='forfait'`** | el forfait se imprime; borrar rompe el programa |

**Es la misma acción para el usuario y el mismo RPC**, con una rama según la ventana. No hace
falta un RPC nuevo: es `rpc_baja_inscripcion` mirando una ventana más, como planteaste.

Tres detalles del `UPDATE`, cada uno con su motivo:

1. **`numero_partidor = NULL`.** En R8 los **29 forfait tienen la gatera en NULL** y los 67
   ratificados la tienen cargada (§5). Poner forfait sin limpiar la gatera dejaría un cajón
   huérfano, inconsistente con las 29 filas que ya existen.
2. **`motivo_estado`** con marca de origen — p. ej. `'Forfait desde el portal'`. Es el campo que
   la secretaría ya usa para el motivo (`inscripciones.html:318`, `:821`), y así el forfait del
   portal se distingue del que carga la secretaría sin agregar columnas.
3. **`canal` e `inscripto_por` NO se tocan.** Son el rastro de quién lo retiró — el control por
   auditoría que reemplaza al filtro por tenencia. Un `DELETE` lo perdía; el `UPDATE` lo conserva,
   y encima el trigger `trg_audit_inscripciones` registra el `UPDATE`.

### 2.3 El guard de `estado`: hay que ampliarlo, y es una pregunta

Hoy exige `estado = 'inscripto'`. Pero **la ventana de ratificación es justo cuando la secretaría
ratifica**: si el caballo ya pasó a `ratificado`, el guard actual lo rechaza — y ése es
precisamente el caso que Fede quiere habilitar ("el lunes antes de las 12").

Propuesta: en la ventana de ratificación aceptar **`inscripto` o `ratificado`**; en la de
inscripción, sólo `inscripto` (como hoy). `forfait`, `mal_inscrito`, `no_presentado` y los demás
siguen rechazados en las dos.

**Va como pregunta abierta (§7.1)**: no lo doy por decidido.

---

## 3. La fuente de verdad del guard — la decisión que pediste justificada

Hay **tres** candidatos, y no dicen lo mismo.

### 3.1 Los tres, con los valores reales

```sql
SELECT r.numero, r.fecha, to_char(r.fecha,'TMDay') AS dia_reunion,
       r.hora_cierre_ratificacion,
       (r.fecha + r.hora_cierre_ratificacion) AS cierre_segun_ratificacion_html,
       min(c.apertura_ratificacion AT TIME ZONE 'America/Argentina/Buenos_Aires') AS ap_rat_carreras_ar,
       min(c.cierre_ratificacion   AT TIME ZONE 'America/Argentina/Buenos_Aires') AS ci_rat_carreras_ar,
       to_char(min(c.cierre_ratificacion AT TIME ZONE 'America/Argentina/Buenos_Aires'),'TMDay') AS dia_ci_rat
FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero IN (8,9)
GROUP BY r.numero, r.fecha, r.hora_cierre_ratificacion ORDER BY r.numero;
```

| Reunión | fecha (día) | `hora_cierre_ratificacion` | **`ratificacion.html` deriva** | **`carreras.*_ratificacion`** |
|---|---|---|---|---|
| R8 | 2026-08-16 (**Sunday**) | `12:00:00` | **2026-08-16 12:00** (domingo) | 2026-08-10 05:30 → **09:00** (**Monday**) |
| R9 | 2026-09-20 (**Sunday**) | `12:00:00` | **2026-09-20 12:00** (domingo) | **2026-09-14 00:00 → 12:00** (**Monday**) |

**El patrón se repite en las dos reuniones que tienen ventanas cargadas: el cierre de ratificación
cae en LUNES, seis días antes del domingo de la carrera.** (R8 está en 09:00 porque nunca se
corrigió el −3 h; la intención era 12:00, igual que R9.)

```sql
-- días entre el cierre de ratificación y la fecha de la reunión
R8: 2026-08-16 − 2026-08-10 = 6 días   (Monday → Sunday)
R9: 2026-09-20 − 2026-09-14 = 6 días   (Monday → Sunday)
```

### 3.2 Qué dice cada candidato, y por qué gana el tercero

| Candidato | Tipo | Valor para R9 | ¿Es "el lunes antes de las 12"? |
|---|---|---|---|
| `reuniones.hora_cierre_ratificacion` | `time` | `12:00:00` | **No tiene fecha.** Sola no define ninguna ventana |
| Lo que deriva `ratificacion.html` (`reunion.fecha` + esa hora) | — | **domingo 20/09 12:00** | 🔴 **NO.** Seis días tarde: es el día de la carrera |
| **`carreras.apertura_ratificacion` / `cierre_ratificacion`** | `timestamptz` | **lunes 14/09 00:00 → 12:00** | ✅ **Exactamente** |

**Decisión: `carreras.apertura_ratificacion` y `carreras.cierre_ratificacion`.** Los motivos, en
orden de peso:

1. **Es la única que codifica la regla de Fede.** Las otras dos ponen el cierre el domingo de la
   carrera. Usar `ratificacion.html` como fuente daría una ventana seis días más larga que la que
   pidió, y el "lunes antes de las 12" no existiría como límite.
2. **Es la única con fecha.** `hora_cierre_ratificacion` es un `time`: para volverla instante hay
   que emparejarla con **alguna** fecha, y la única fecha que la app tiene a mano es la de la
   reunión — que es justamente la que da el resultado equivocado.
3. **Es `timestamptz`, o sea un instante.** Un guard SQL la compara con `now()` sin ambigüedad de
   zona, igual que ya hace con `cierre_inscripcion`. La comparación de `ratificacion.html` se hace
   en el browser con `getHours()` local: sirve para pintar un rótulo, no para un guard
   server-side.
4. **Es por turno**, y el forfait es por turno.

### 3.3 Tu advertencia es correcta — y la mitigación no es cambiar de columna

Planteaste: *"si usás la que nadie lee, el guard va a decidir con un dato que la secretaría no
controla desde donde cree"*. Vale precisar las dos mitades:

- **"Nadie las lee"** — cierto hoy, y es ISSUE-074. **Este cambio las convierte en leídas**, que
  es exactamente la opción (1) de ese issue ("unificar hacia `carreras`"). Lo cierra parcialmente.
- **"La secretaría no las controla"** — **falso.** Sí las controla: son los inputs `f-ap-rat` y
  `f-ci-rat` del modal de turno de `carta-llamados.html` (`:428`, `:432`), que se guardan en
  `:1166-1167`. Y **desde ayer ese formulario guarda bien la zona horaria** (merge `5d108ab`,
  GOTCHA #92). Antes de ese fix, editarlas las corría −3 h; ahora no.

O sea: el orden en que se hicieron las cosas importa. **Este cambio sólo es seguro porque el fix
de zona ya está mergeado.** Si se hubiera hecho antes, cada edición del turno habría corrido la
ventana del guard tres horas.

Lo que sí hay que hacer, y va en el §6:

- **Avisarle a la secretaría** que esos dos campos del modal dejan de ser decorativos.
- **Fail-closed si están en NULL**, igual que ya hace `ventanaAbierta` con la inscripción: sin
  ventana cargada, no se puede retirar. Hoy sólo R8 y R9 las tienen; R10/R11/R12 **no tienen
  carreras todavía**, así que no hay reuniones con las columnas en NULL esperando. Pero la próxima
  carta que se cargue sin esos campos deja el botón apagado, y eso hay que decirlo.

---

## 4. La UI

`portal.html`, sección **Mis inscripciones** (`:929` y `:972`).

### 4.1 Los dos estados del botón

| Ventana | ¿Botón? | Rótulo | Confirmación |
|---|---|---|---|
| Inscripción abierta | sí | **"Retirar"** (como hoy) | *"¿Retirar a X del turno N?"* |
| Ratificación abierta | sí | **"Dar forfait"** | *"¿Dar forfait a X en el turno N? **Queda registrado como borrado en el programa de la reunión.**"* |
| Fuera de las dos | no | — | — |

El rótulo tiene que cambiar porque **la consecuencia es distinta y no es reversible del mismo
modo**: en la primera el caballo desaparece; en la segunda queda listado como borrado en un
documento que se imprime. El usuario tiene que poder distinguirlas antes de apretar.

### 4.2 `puedeRetirar` pasa a devolver cuál de las dos

```javascript
// devuelve null | 'inscripcion' | 'ratificacion'
function modoRetiro(i) { … }
```

y el render elige rótulo y texto de confirmación con eso. La lógica de ventana se apoya en el
mismo criterio fail-closed que `ventanaAbierta`: reunión `publicada`, las dos fechas no nulas,
`now()` entre ellas.

**El front sigue sin ser el guard**: es el RPC el que decide. La UI sólo evita el viaje de ida y
vuelta, igual que hoy.

### 4.3 Falta traer las columnas

`cargarInscripcionesCrudas()` (`portal.html:659`) hoy pide:

```
carreras(numero_turno,nombre,estado,apertura_inscripcion,cierre_inscripcion, reuniones(...))
```

Hay que agregar `apertura_ratificacion,cierre_ratificacion`. Sin eso el front no puede decidir
el modo — mismo tipo de omisión que el `distribucion_premios` que faltaba ayer en el llamado.

---

## 5. La premisa del sorteo — los datos te dan la razón, el doc está desactualizado

Dijiste que el sorteo va **después** de la ratificación (regla de Fede, 22/07), así que en esa
ventana no hay mandiles y `renumerarChapas` no entra en juego.

**`docs/MODELO_NUMERACION.md:129` dice lo contrario:**

```
SORTEO (antes de ratificación)
  ↓
  numero_partidor = gatera asignada (ej: 7)
```

Lo verifiqué contra los datos de R8, que es la única reunión completa:

```sql
SELECT r.numero, i.estado, count(*) AS filas,
       count(*) FILTER (WHERE i.numero_partidor IS NOT NULL) AS con_gatera,
       count(*) FILTER (WHERE i.numero_partidor IS NULL)     AS sin_gatera
FROM reuniones r JOIN carreras c ON c.reunion_id=r.id JOIN inscripciones i ON i.carrera_id=c.id
WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero IN (8,9)
GROUP BY r.numero, i.estado ORDER BY r.numero, i.estado;
```

| Reunión | estado | filas | **con gatera** | sin gatera |
|---|---|---|---|---|
| R8 | **ratificado** | 67 | **67** | 0 |
| R8 | **forfait** | 29 | **0** | 29 |
| R8 | inscripto | 7 | **0** | 7 |
| R8 | mal_inscrito | 3 | **0** | 3 |
| R9 | inscripto | 3 | **0** | 3 |

**Si el sorteo fuera antes de ratificar, los 29 forfait tendrían gatera** — se les habría asignado
y después se habrían dado de baja. **Tienen cero.** La gatera existe **sólo** en los ratificados.

Corroboran:
- `docs/REGLA_INSCRIPCION_MULTITURNO.md:188` — *"después de la ratificación y en el momento de la
  inscripción todavía no existe"*
- `docs/diagnosticos/2026-08-13_fix-orden-carreras-resultados.md:17` — *"sorteo después de la
  ratificación"*
- `docs/PREGUNTAS_ABIERTAS.md:127` — *"se genera al pedir el PDF de ratificación"*

**Conclusión: tenés razón, y `MODELO_NUMERACION.md:129` es texto desactualizado** — el tercer doc
del mismo tipo esta semana, después de `ESTADO.md` y `LIQUIDACIONES_MODELO.md`. No lo corrijo
porque el gate es plan-primero y no me lo pediste; queda anotado en §7.

**Consecuencia para el diseño:** confirmada. En la ventana de ratificación **todavía no hay
gateras**, así que no hay nada que renumerar. Con un matiz: el sorteo *se genera al pedir el PDF
de ratificación*, que la secretaría puede pedir **dentro** de esa misma ventana. Por eso el
`UPDATE` limpia `numero_partidor` (§2.2 punto 1): si el sorteo ya corrió, el forfait no deja un
cajón asignado a un caballo que no corre.

---

## 6. El probe

**`tests/probe_forfait_portal.mjs`** (nuevo). Real-code, sin browser, fixture propio con teardown.
Corre el `rpc_baja_inscripcion` **real** y el `modoRetiro`/`puedeRetirar` extraídos de
`portal.html`.

### 6.1 Los seis casos pedidos, más los que salen del diseño

| # | Caso | Esperado |
|---|---|---|
| **A1** | retirar durante la **inscripción** | ✅ funciona · la fila **desaparece** (`DELETE`) |
| **A2** | retirar durante la **ratificación** | ✅ funciona · la fila **queda** con `estado='forfait'` |
| **A3** | fuera de las dos ventanas (antes de abrir) | ❌ rechaza |
| **A4** | fuera de las dos ventanas (entre el cierre de inscripción y la apertura de ratificación) | ❌ rechaza — **el hueco entre ventanas** |
| **A5** | fuera de las dos ventanas (después del cierre de ratificación) | ❌ rechaza |
| **A6** | retirar **lo de otro** (`inscripto_por` ajeno) | ❌ rechaza |
| **A7** | retirar lo que cargó la **secretaría** (`canal='manual'`) | ❌ rechaza |
| **A8** | reunión no `publicada` | ❌ rechaza |
| **A9** | ventana de ratificación con las columnas en **NULL** | ❌ rechaza (**fail-closed**) |
| **A10** | el forfait deja `numero_partidor = NULL` | ✅ |
| **A11** | el forfait **conserva** `canal='portal'` e `inscripto_por` | ✅ el rastro no se pierde |
| **A12** | el forfait queda registrado en `auditoria` como `UPDATE` | ✅ |
| **A13** | estado ya `forfait` → no se puede volver a retirar | ❌ rechaza |
| **U1** | `modoRetiro` devuelve `'inscripcion'` / `'ratificacion'` / `null` según corresponda | ✅ |
| **U2** | el rótulo del botón es "Retirar" vs "Dar forfait" | ✅ |
| **U3** | `cargarInscripcionesCrudas` pide `apertura_ratificacion` y `cierre_ratificacion` | ✅ |

**A4 es el que más me importa** y no estaba en tu lista: entre el cierre de inscripción (viernes
12:00) y la apertura de ratificación (lunes 00:00) hay **2 días y medio** en los que no se puede
retirar por ninguna de las dos vías. Es el comportamiento correcto —esa es la ventana en la que la
secretaría arma la carta— pero conviene que esté fijado por un assert y no por casualidad.

### 6.2 Los mutantes, uno por guard

| Mutante | Neutraliza | Mata |
|---|---|---|
| M1 | el guard de `canal='portal'` | A7 |
| M2 | el guard de `inscripto_por` | A6 |
| M3 | el guard de estado | A13 |
| M4 | el guard de la ventana de **inscripción** | A3, A4 |
| M5 | el guard de la ventana de **ratificación** | A4, A5 |
| M6 | el fail-closed de NULL en las columnas de ratificación | A9 |
| M7 | la rama de ratificación hace `DELETE` en vez de `UPDATE` | **A2** — el caso que motiva todo |
| M8 | el forfait no limpia `numero_partidor` | A10 |
| M9 | el forfait pisa `canal`/`inscripto_por` | A11 |
| M10 | el guard de reunión `publicada` | A8 |
| M11 | `modoRetiro` devuelve siempre `'inscripcion'` | U1, U2 |
| M12 | el select del portal deja de pedir las columnas de ratificación | U1, U3 |

Aplicando lo aprendido ayer (GOTCHA #93/#94): **A2 no puede asertarse comparando contra la otra
pantalla ni contra "que no dé error"** — tiene que leer la fila de la base y verificar
`estado='forfait'` **y que la fila siga existiendo**. Y el fixture tiene que incluir el caso
borde: **A4, el hueco entre ventanas**, que con las fechas reales de R9 existe y dura 60 horas.

---

## 7. Preguntas abiertas — decidir antes de aplicar

1. **¿El forfait desde el portal se permite sobre un caballo ya `ratificado`?** (§2.3). Hoy el
   guard exige `inscripto`. La ventana de ratificación es justo cuando la secretaría ratifica, así
   que si no se amplía, el trainer que llegue después de que lo ratificaron **no va a poder dar
   forfait** — que es exactamente el caso de Fede. Mi propuesta es aceptar `inscripto` **o**
   `ratificado`, pero es decisión de negocio.
2. **¿El rótulo va "Dar forfait" o "Retirar (forfait)"?** Fede dijo *"forfait es retirar"*, o sea
   que para él son la misma palabra. Pero la consecuencia es distinta y conviene que el botón lo
   diga. Es cosmético y es de él.
3. **¿Hay que avisar a la secretaría por pantalla?** Un forfait cargado por el entrenador el lunes
   a las 11:55 cambia el programa. Hoy no hay ninguna notificación: la secretaría se entera si
   mira. Fuera de alcance de este plan, pero es la consecuencia operativa del cambio.
4. **`docs/MODELO_NUMERACION.md:129` está desactualizado** (§5). ¿Lo corrijo en el mismo cambio o
   va aparte? Es el tercer doc con texto viejo esta semana.
5. **ISSUE-074 queda parcialmente cerrado**: `carreras.*_ratificacion` pasan de "no las lee nadie"
   a ser el guard de una operación de escritura. ¿Actualizo el issue en el mismo cambio?
6. **R8 tiene su cierre de ratificación en 09:00** (el −3 h sin corregir). Ya pasó y no afecta,
   pero si alguna vez se reabre esa reunión el guard usaría la hora equivocada.

---

## 8. Verificación en `origin`

```
$ git ls-remote origin main
8dafe0943cc2d9072dbed814d71c9a49286797e3	refs/heads/main
```

**Nada aplicado.** Ni código, ni DDL, ni datos. `main` queda en `8dafe09` y el único cambio del
repo es este informe. El plan espera tu OK sobre §2, §3 y las preguntas del §7.

### 8.1 SHA final

```
$ git ls-remote origin reports
73fd9cb3048ffb79e83a939808e72131d13e3a2c	refs/heads/reports
$ git rev-parse HEAD
73fd9cb3048ffb79e83a939808e72131d13e3a2c
$ git ls-remote origin main
8dafe0943cc2d9072dbed814d71c9a49286797e3	refs/heads/main
```

`main` sin tocar. Los dos refs verificados en `origin`.
