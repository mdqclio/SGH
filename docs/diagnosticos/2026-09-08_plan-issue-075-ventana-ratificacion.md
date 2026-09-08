# PLAN — ISSUE-075: las dos ventanas de ratificación

**Fecha:** 2026-09-08
**Estado:** **PLAN. NADA APLICADO.** Ni código, ni DDL, ni datos.
**Greps:** contra `main`. **SHA de `main`:** `972c0772aa6bbbfbcd92d684101f4ac4de289398`
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

## 0. 🛑 PARÁ — los datos dan vuelta la premisa

Pediste que verificara con datos si la secretaría necesita ratificar después del lunes 12:00, y
que te avisara **antes de cambiar nada** si resultaba que sí.

**Resulta que sí. Y por bastante.**

En R8 —la única reunión completa— **la secretaría ratificó el lunes entre las 15:23 y las 15:27**,
y trabajó la pantalla desde las 14:23 hasta las 17:58. El cierre pretendido era el **lunes 12:00**.

> **Unificar `isCerrada` contra `carreras.cierre_ratificacion` como bloqueo duro habría impedido
> por completo la sesión de ratificación de R8.** Los 67 ratificados, los 31 forfait y los 3 mal
> inscriptos se cargaron todos después del cierre.

Y de ahí sale un diagnóstico distinto del que tiene hoy ISSUE-075: **no son dos cálculos de la
misma fecha. Son dos fechas distintas que se llaman igual.**

| Concepto | Para quién | Fuente | R9 |
|---|---|---|---|
| Hasta cuándo el **entrenador** puede pedir forfait | portal | `carreras.cierre_ratificacion` | lunes 14/09 12:00 |
| Hasta cuándo la **secretaría** puede procesar | `ratificacion.html` | `reuniones.hora_cierre_ratificacion` + fecha | domingo 20/09 12:00 |

El orden natural es ése: **primero cierra la ventana del entrenador, después la secretaría procesa
lo que entró.** No pueden ser el mismo instante — si lo fueran, la secretaría no tendría un solo
minuto para cargar los forfait que le llegaron por teléfono.

**Mi recomendación cambió: no unificar contra `carreras.*_ratificacion`.** El detalle y las
alternativas, en §4. Decidís vos.

---

## 1. Relevamiento — cómo calcula la ventana `ratificacion.html`

### 1.1 El cálculo, línea por línea

`ratificacion.html:547-556`:

```javascript
function calcCierreStatus(reunion) {
  if (!reunion?.fecha) return false;                                    // sin fecha → ABIERTA
  const hoy = new Date();
  const [anio, mes, dia] = reunion.fecha.split('-').map(Number);        // ← fecha de la CARRERA
  const hoyY = hoy.getFullYear(), hoyM = hoy.getMonth()+1, hoyD = hoy.getDate();
  if (anio > hoyY || (anio===hoyY && mes > hoyM) || (anio===hoyY && mes===hoyM && dia > hoyD))
    return false;                                                       // reunión futura → ABIERTA
  if (anio < hoyY || (anio===hoyY && mes < hoyM) || (anio===hoyY && mes===hoyM && dia < hoyD))
    return true;                                                        // reunión pasada → CERRADA
  const [hh, mm] = (reunion.hora_cierre_ratificacion || '12:00:00').split(':').map(Number);
  return hoy.getHours() * 60 + hoy.getMinutes() >= hh * 60 + mm;        // el día: compara la hora
}
```

Traducido: **cierra el día de la carrera, a `hora_cierre_ratificacion`.** Para R9, domingo 20/09
12:00. Comparación en hora local del browser, con `getHours()`.

### 1.2 Qué hace con ella — bloquea Y pinta

**Las dos cosas.** `isCerrada` se usa en cinco lugares:

| Línea | Uso | Efecto |
|---|---|---|
| `:563` | `renderCierreStatus` | **rótulo**: `Cierre 12:00 hs — ABIERTA / CERRADA` |
| `:580` | asignación | se recalcula al cargar la reunión |
| `:590` | `if (isCerrada) await congelarPesos(inscData)` | **escribe**: copia `peso_declarado` → `peso_final` |
| `:617` | `carCerrada = isCerrada \|\| car.estado==='confirmada' \|\| car.estado==='anulada'` | ver abajo |
| `:678-679` | `disabled` en los inputs | **bloquea** `numero_carrera_programa` y `hora_estimada` |

Y `carCerrada` (`:617`) es el que más pega — deshabilita, por fila:

- el **select de jockey** (`buildJockeySelect(i, carCerrada)`)
- el **input de peso** (`:635`)
- el botón **✅ Ratificar** (`:641`)
- el botón **↩ Volver** (`:643`)
- el botón **❌ Forfait** (`:644`)
- el botón **⚠ Mal inscripto** (`:645`)

O sea: **con `isCerrada = true` la pantalla queda de sólo lectura.**

### 1.3 ⚠️ No hay ningún guard en la base — el control es SÓLO de pantalla

Esto **cambia el alcance**, como anticipaste.

`ratificar()` (`:898-902`) escribe **directo por PostgREST**, sin RPC:

```javascript
const { error } = await sb.from('inscripciones')
  .update({ estado:'ratificado', peso_final: peso }).eq('id', inscId);
```

Igual `volverInscripto()` (`:925`) y el forfait/mal-inscripto de la secretaría (`:967`).

Barrido en la base:

```sql
SELECT 'policy', policyname, cmd, qual, with_check FROM pg_policies
 WHERE tablename='inscripciones' AND cmd IN ('UPDATE','ALL')
UNION ALL SELECT 'funcion', … WHERE pg_get_functiondef(p.oid) ILIKE '%ratificado%' …;
```

Una sola policy, `inscripciones_update`, y **es sólo de club**:

```
(NOT fn_is_portal_user()) AND (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id())
```

**Cero condición de tiempo. Cero funciones.** Contraste con el portal, donde **toda** la escritura
pasa por `rpc_inscribir` / `rpc_baja_inscripcion` y los guards viven en la base.

Consecuencia: **cualquier cambio de ventana en `ratificacion.html` es cosmético desde el punto de
vista de seguridad.** Un `secretario_carreras` con la consola abierta ratifica cuando quiera. Eso
está bien —la secretaría es la autoridad y tiene que poder forzar— pero hay que decirlo: acá no
estamos ajustando un guard, estamos ajustando **una ayuda de pantalla**.

---

## 2. Los datos de R8 — cuándo ratificó realmente la secretaría

### 2.1 El acto de ratificar

```sql
WITH r8 AS (…), rat AS (
  SELECT a.registro_id, min(a.created_at) AS primera_ratificacion
  FROM auditoria a JOIN r8 ON r8.id = a.registro_id
  WHERE a.tabla='inscripciones' AND a.accion='UPDATE'
    AND (a.datos_despues->>'estado') = 'ratificado'
    AND coalesce(a.datos_antes->>'estado','') <> 'ratificado'
  GROUP BY a.registro_id)
SELECT (primera_ratificacion AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS dia_ar,
       to_char(…,'TMDay') AS dia_semana, count(*), min(…)::time, max(…)::time
FROM rat GROUP BY 1,2;
```

```json
[{"dia_ar":"2026-08-10","dia_semana":"Monday","inscripciones_ratificadas":67,
  "primera_hora":"15:23:23","ultima_hora":"15:27:26"}]
```

**Los 67 ratificados, el lunes, en cuatro minutos, entre las 15:23 y las 15:27.**

### 2.2 Todos los cambios de estado de R8

| Estado nuevo | Día | Cantidad | Desde | Hasta |
|---|---|---|---|---|
| `mal_inscrito` | **lunes 10/08** | 3 | 14:43 | 15:16 |
| `forfait` | **lunes 10/08** | 31 | 14:44 | 15:21 |
| `inscripto` (correcciones) | **lunes 10/08** | 2 | 15:00 | 15:00 |
| **`ratificado`** | **lunes 10/08** | **67** | **15:23** | **15:27** |

**Todo el día correcto (lunes) y todo después de las 14:23.** Un solo usuario:
**Administrador Dolores** (`secretario_carreras`), 271 eventos ese día entre las 14:23 y las 17:58.

### 2.3 El cotejo que decide

| | |
|---|---|
| `carreras.cierre_ratificacion` de R8 | lunes 10/08 **09:00 AR** (valor guardado, con el −3 h sin corregir) |
| Intención de ese valor | lunes 10/08 **12:00 AR** |
| Cuándo ratificó la secretaría | lunes 10/08 **15:23 – 15:27** |
| **Diferencia contra la intención** | **+3 h 23 min** |
| **Diferencia contra el valor guardado** | **+6 h 23 min** |

**Con un bloqueo duro contra el lunes 12:00, la sesión de R8 no habría podido existir.** Ni la
ratificación, ni los 31 forfait, ni los 3 mal inscriptos.

### 2.4 Qué se tocó después del lunes

```sql
-- campos que cambiaron entre el lunes 18:00 y el domingo de la carrera
SELECT dia, dia_semana, campo, count(*) …;
```

| Día | Campo | Cambios |
|---|---|---|
| martes 11/08 | `jockey_titular_id` | 1 |
| **miércoles 12/08** | **`performance`** | **88** |
| miércoles 12/08 | `jockey_titular_id` | 1 |
| jueves 13/08 | `jockey_titular_id` | 1 |

**Ningún cambio de estado después del lunes.** El grueso —los 88 de `performance`— se edita en
`inscripciones.html`, no en la pantalla de ratificación, y ese archivo **no tiene ningún gate de
cierre**. Los tres cambios de jockey sí pasan por `ratificacion.html`.

O sea: **el acto de ratificar se concentra en el lunes; después sólo hay retoques.**

---

## 3. Tu escenario, revisado

Planteaste: *"un caballo puede quedar ratificado el miércoles sin que su entrenador tenga forma de
retirarlo"*.

**Es cierto que puede pasar, pero los datos dicen que en la práctica no pasa** —en R8 no hubo
ni un cambio de estado después del lunes— **y, sobre todo, no es un bug que se arregle
unificando.** Es la consecuencia inevitable de que el plazo del entrenador cierre antes que el
procesamiento de la secretaría, que es el orden correcto.

La pregunta de fondo no es *"¿por qué las dos ventanas no coinciden?"* sino **"¿qué pasa si un
entrenador quiere retirar después del lunes 12:00?"**. Y eso ya tiene respuesta en el sistema: el
mensaje del RPC dice *"Hablá con la secretaría"*, y la secretaría **puede** cargarle el forfait —
la pantalla se lo permite hasta el domingo. **El circuito está completo.** Lo que falta no es un
guard: es que el entrenador sepa a quién llamar, que ya está en el mensaje.

---

## 4. La decisión — tres opciones, y por qué cambié de recomendación

Tu criterio era unificar contra `carreras.apertura/cierre_ratificacion`. **Con los datos en la
mano, no lo recomiendo**, porque convertiría en bloqueo un instante que la secretaría cruza todas
las reuniones.

### Opción A — **Renombrar, no unificar** ← mi recomendación

Aceptar que son **dos plazos distintos** y hacer que la pantalla lo diga.

- `carreras.apertura/cierre_ratificacion` → **"plazo del entrenador"**. Ya lo usa el forfait. No se
  toca.
- `reuniones.hora_cierre_ratificacion` + fecha de la reunión → **"cierre de la carga"**, el plazo
  de la secretaría. Se queda como está funcionalmente.
- **Lo que cambia es el rótulo.** Hoy `renderCierreStatus` muestra `Cierre 12:00 hs — ABIERTA`, que
  la secretaría lee como *el* cierre. Pasaría a mostrar **los dos**:

  ```
  Forfait del entrenador: cerró el lunes 14/09 12:00
  Carga de secretaría: abierta hasta el domingo 20/09 12:00
  ```

- Y en `ratificacion.html`, un **chip** sobre los forfait con
  `motivo_estado = 'Forfait desde el portal'`, que es lo que ya propone ISSUE-076.

**Costo:** bajo. **Riesgo:** ninguno — no cambia ningún comportamiento.
**Qué resuelve:** la confusión, que es el problema real. **Qué no resuelve:** nada se bloquea que
hoy no se bloquee, pero es que **hoy no hace falta bloquear nada**.

### Opción B — Unificar con margen

`isCerrada` pasa a `carreras.cierre_ratificacion` **más un margen operativo** (p. ej. hasta las
23:59 del mismo día). Mantiene la fuente única y no corta la operación del lunes a la tarde.

**Costo:** medio. **Riesgo:** el margen es un número inventado. En R8 trabajaron hasta las 17:58,
pero una reunión con más turnos podría pasarse. Y `isCerrada` es booleano por reunión mientras
`cierre_ratificacion` es por turno — hay que decidir cuál manda (¿el máximo? ¿el mínimo?).

### Opción C — Unificar duro, como estaba planteado

`isCerrada` = `now() > max(carreras.cierre_ratificacion)`.

**Costo:** bajo. **Riesgo: alto y demostrado.** Habría bloqueado la sesión completa de R8.
**No la recomiendo.**

### Y lo que haría falta en cualquier caso

Si alguna vez el plazo tiene que ser **exigible** y no una ayuda de pantalla, hay que mover el
control a la base: un `rpc_ratificar` con el guard adentro, como hicimos con el forfait. Hoy
`ratificacion.html` escribe directo (§1.3) y **cualquier cambio de UI es esquivable**. Eso es
trabajo aparte y **no lo propongo ahora**.

---

## 5. `reuniones.hora_cierre_ratificacion` — se queda

Preguntaste si sacarla. **Con la opción A, no: pasa a tener un rol claro y propio** —la hora de
cierre de la carga de la secretaría— en vez de ser un campo ambiguo.

Lo que sí conviene es **desambiguar el nombre en la UI** (`reuniones.html:389` la edita como
"Hora cierre ratificación"), porque hoy la secretaría la carga creyendo que fija el plazo del
entrenador, y no.

Con la opción C sí quedaría muerta — que es exactamente el patrón que produjo este problema
(ISSUE-074) y el que conviene no repetir.

---

## 6. El probe

**Depende de qué opción elijas**, así que lo dejo esbozado y no escrito.

Con la **opción A** (`tests/probe_ventanas_ratificacion.mjs`):

| # | Assert |
|---|---|
| V1 | las dos ventanas se calculan de fuentes distintas y **el probe verifica que NO coincidan** cuando la carta las carga según el patrón (lunes vs. domingo) |
| V2 | el rótulo muestra **las dos** fechas, con la del entrenador identificada como tal |
| V3 | dentro de la ventana del entrenador, el portal ofrece "Dar forfait" **y** la secretaría puede ratificar |
| V4 | **después** del cierre del entrenador y **antes** del de la secretaría: el portal rechaza, la secretaría sigue pudiendo — el caso de R8, fijado como assert |
| V5 | después del cierre de la secretaría, la pantalla queda de sólo lectura (los seis controles de `carCerrada`) |
| V6 | el chip de "Forfait desde el portal" aparece sobre las filas con esa marca |
| V7 | **el escenario de R8 replicado**: con las fechas reales de R8, ratificar el lunes a las 15:23 tiene que estar permitido |

**V7 y V4 son los que importan** — son la regresión de lo que este plan descubrió. Un probe que
sólo verificara "las dos pantallas coinciden" **fijaría el bug**, que es la lección del GOTCHA #93.

Mutantes: uno por cada uso de `isCerrada` (§1.2), uno que unifique duro contra
`carreras.cierre_ratificacion` (**tiene que matar V4 y V7**), y uno que borre el rótulo doble.

---

## 7. Preguntas abiertas — para vos

1. **¿Confirmás el cambio de recomendación?** Los datos dicen que la secretaría ratifica después
   del cierre del entrenador, siempre. Mi propuesta es **A: renombrar, no unificar**. Si preferís
   B o C, se hace — pero C está desaconsejada con evidencia.
2. **¿Se lo preguntamos a Fede antes?** Él dijo *"forfait es retirar y tiene que ser el lunes antes
   de las 12"*. Eso es el plazo **del entrenador**, y está bien implementado. Nadie preguntó nunca
   **hasta cuándo puede cargar la secretaría** — y es la pregunta que abre este informe. Con una
   sola reunión de evidencia (R8), preferiría su confirmación antes de fijar un criterio.
3. **ISSUE-075 hay que reescribirlo.** Hoy dice que la pantalla calcula mal. Con estos datos, el
   diagnóstico es otro: **dos plazos distintos con el mismo nombre**. ¿Lo reescribo?
4. **El control es sólo de pantalla (§1.3).** ¿Querés que abra un issue aparte por eso —mover el
   guard de ratificación a la base como el del forfait— o lo dejamos anotado acá?
5. **Nada de esto es urgente para el lunes 14.** El forfait del portal ya está bien: cierra el
   lunes 12:00, que es lo que pidió Fede. Lo que sigue abierto es la confusión de nombres, y no
   afecta a R9 operativamente.

---

## 8. Verificación en `origin`

```
$ git ls-remote origin main
972c0772aa6bbbfbcd92d684101f4ac4de289398	refs/heads/main
```

**Nada aplicado.** `main` queda en `972c077` y el único cambio del repo es este informe.
