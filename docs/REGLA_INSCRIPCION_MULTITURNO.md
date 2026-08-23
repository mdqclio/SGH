# Regla de Fede: un SPC en varios turnos de la misma reunión

**Fecha:** 2026-08-23 · **Alcance:** relevamiento, sin cambios de código ni de base.

> **REGLA (Fede):** un SPC se puede inscribir en VARIOS turnos de la misma reunión. Recién en la
> **ratificación** queda en uno solo — se declara forfait en los demás.

**Veredicto corto:** la regla ya es la práctica real y la base la permite. Lo que **no** existe es el
control del segundo tiempo: nada impide que un SPC quede **ratificado en dos turnos a la vez**. Nunca
pasó, pero por disciplina del operador, no porque el sistema lo evite.

---

## 1. ¿La base lo permite? Sí, y está bien así

### Constraints de `inscripciones`

| Tipo | Nombre | Definición |
|---|---|---|
| UNIQUE | `inscripciones_carrera_id_spc_id_key` | `UNIQUE (carrera_id, spc_id)` |
| CHECK | `inscripciones_peso_balanza_rango` | `peso_balanza` entre 300 y 600 |
| FK | 8 claves foráneas | `carrera_id` (ON DELETE CASCADE), `spc_id`, jockeys, etc. |

El único unique es **`(carrera_id, spc_id)`**: el mismo SPC no puede estar dos veces en la **misma
carrera**. No hay ningún unique, exclusion constraint ni índice que involucre `reunion_id`, así que
**el mismo SPC en dos turnos distintos de la misma reunión pasa sin problema**. Es exactamente lo que
pide la regla.

### Triggers

Tres, ninguno valida esto:

- `trg_audit_inscripciones` → `fn_auditoria_log()` (auditoría)
- `trg_insc_set_propietario` → `fn_inscripcion_set_propietario()` (deriva el propietario de la caballeriza)
- `trg_inscripciones_updated_at` → `set_updated_at()`

### `validar_inscripcion(p_spc_id, p_carrera_id)`

Se llama `validar_inscripcion`, no `rpc_validar_inscripcion`. `SECURITY DEFINER`, `search_path=public`,
devuelve `TABLE(puede_inscribirse boolean, motivo text)`. Chequea, en orden:

1. que exista el SPC
2. que exista la carrera
3. `spcs.estado = 'activo'`
4. edad mínima / edad máxima contra la fecha de la reunión
5. sexo (`machos` / `hembras` / `machos_castrados`)
6. sanción vigente sobre el SPC (`v_sanciones_vigentes`)
7. cupo máximo de la carrera

**No hay ningún chequeo de "ya está inscripto en otro turno de esta reunión"** — ni bloqueante ni
informativo. La función es *per-carrera*: recibe una carrera y no mira el resto de la reunión.

Consistente con la regla: no debe bloquear. Pero tampoco puede avisar, y hoy no hay dónde avisar.

### Dos detalles del borde

- **Duplicado en la MISMA carrera** (el caso que sí hay que impedir): no lo frena
  `validar_inscripcion`, lo frena el unique en el INSERT. En el portal el error sale crudo por
  `toast(error.message)` (`portal.html:699`), o sea que el entrenador lee
  *"duplicate key value violates unique constraint ..."*. Bloquea bien, comunica mal.
- **`cupo_maximo` cuenta las inscripciones multi-turno.** El chequeo es
  `COUNT(*) WHERE carrera_id = ... AND estado != 'forfait'`. Bajo esta regla un caballo anotado en
  tres turnos ocupa un lugar de cupo en los tres hasta la ratificación. Si Dolores usa cupos
  ajustados, la carrera se puede "llenar" con anotaciones que después se van a forfait. Hoy no
  muerde: ninguna carrera de R6 ni R8 llegó al cupo.

---

## 2. ¿Pasó alguna vez? Sí, es la norma

Sólo R6 (2026-06-20) y R8 (2026-08-16) tienen inscripciones cargadas. R5, R7 y R9 están en cero
(ojo: `CLAUDE.md` dice que la reunión de prueba es la 5 con ~81 inscripciones — quedó desactualizado,
hoy la 5 está vacía y los datos vivos son R6 con 125 y R8 con 106).

| Reunión | Fecha | Inscripciones | Ratificados | SPC en 2+ turnos |
|---|---|---|---|---|
| 6 | 2026-06-20 | 125 | 81 | **13 ejemplares** |
| 8 | 2026-08-16 | 106 | 67 | **24 ejemplares** (2 de ellos en 3 turnos) |

En R8 son 24 sobre 80 SPC distintos: **el 30 % de los caballos se anotó en más de un turno.** No es
un caso raro ni un error de carga, es cómo se opera.

Ejemplos de R8 (turno:estado):

```
ACAPULCO           5:forfait,  6:forfait,  7:forfait      ← 3 turnos, no corrió en ninguno
WISLA KEN          5:mal_inscrito, 7:mal_inscrito, 10:ratificado
DE BELLOSO        11:forfait, 12:ratificado
LINDA MAIPUENSE    2:ratificado, 12:forfait
```

Y de R6:

```
BELLO PRESAGIO     7:forfait,  11:ratificado
LE BIRD            7:forfait,  11:forfait               ← no corrió en ninguno
```

El patrón dominante es exactamente el que describe Fede: se anota en N, queda ratificado en 1 y
forfait en los demás.

### Lo que nunca pasó

**Cero casos de un SPC ratificado en dos turnos de la misma reunión.** Verificado sobre todas las
reuniones de todos los clubes:

```sql
select ... from inscripciones i join carreras c ... join reuniones r ...
where i.estado = 'ratificado'
group by r.id, i.spc_id having count(*) > 1;   -- → 0 filas
```

### Lo que sí pasó: 3 anotaciones que quedaron sin resolver

Casos donde el SPC quedó ratificado en un turno y la otra anotación **quedó en `inscripto`**, ni
forfait ni mal_inscrito:

| Reunión | Ejemplar | Ratificado en turno | Quedó `inscripto` en turno |
|---|---|---|---|
| 6 | LATIN PRESUMIDA | 9 | 10 |
| 8 | FALAYS | 5 | 7 |
| 8 | TATA FOOT | 11 | 9 |

Los tres son inofensivos hoy — `renumerarChapas` filtra por `estado === 'ratificado'`, así que un
`inscripto` colgado no entra al programa, ni al mandil, ni al JSON del Stud Book. Pero son la prueba
de que **el paso "declarar forfait en los demás" es manual y se olvida**. En R8 esas dos anotaciones
sobrevivieron la reunión entera, con resultados ya oficializados.

---

## 3. Ratificación: no hay ningún control

`ratificar(inscId)` en `ratificacion.html:897` es un UPDATE pelado:

```javascript
const { error } = await sb.from('inscripciones')
  .update({ estado:'ratificado', peso_final: peso }).eq('id', inscId);
```

Sin lectura previa, sin chequeo del resto de la reunión, sin confirmación. La única guarda que tiene
el botón es **que haya jockey asignado** (`ratificacion.html:876-892`): sin jockey queda deshabilitado
con el title *"Sin jockey asignado — asignarlo primero en Inscripciones"*.

Tampoco hay nada del lado de la base: no hay trigger `BEFORE UPDATE` que mire el estado, y la RLS no
valida reglas de negocio.

**Conclusión: hoy se puede ratificar el mismo SPC en los 11 turnos de una reunión y el sistema no
dice una palabra.**

### Qué pasaría en el programa impreso

Si un SPC quedara ratificado en dos turnos, `renumerarChapas` lo cuenta como ratificado en **las dos**
carreras, así que recibiría **un mandil en cada una** (números distintos, porque el mandil es 1..N
por carrera). El caballo saldría impreso dos veces en el programa, en dos turnos, como si fuera a
correr las dos. Se propaga a todo lo que deriva de ratificados:

- `programa-oficial.html` y `programa-oficial-color.html` — dos entradas
- `carta-llamados.html` — dos llamados
- el JSON del Stud Book — dos veces en la reunión, cada una con su `orden`
- `resultados.html` — dos marcadores esperando su llegada

Nada revienta: no hay error, no hay warning. Sale un programa con un caballo duplicado, y se detecta
en la mesa cuando alguien lo lee. El costo real es un programa oficial mal impreso.

### El precedente que ya existe en la página

`ratificacion.html` **ya hace exactamente este tipo de control, pero para jockeys y sólo dentro de una
carrera**: `recalcJockeyColisiones(carreraId)` (línea 813) cuenta los selects de jockey de la sección
y pinta la fila con la clase `jockey-duplicado` más un badge `⚠ dup.`. Es un aviso visual, no bloquea.

Esa es la forma exacta que le calzaría a este chequeo, pero a nivel reunión en vez de carrera. Y el
dato ya está cargado: `ratificacion.html:586` trae **todas las inscripciones de la reunión**
(`.in('carrera_id', ids)` sobre todas las carreras), así que detectar un SPC ratificado dos veces es
un `reduce` sobre un array que ya está en memoria — cero queries nuevas.

---

## 4. Carta de llamados del portal: ordena por `numero_turno` ✅

Ya es lo que Fede quiere, sin cambios.

- **Orden**: `portal.html:582` — `(r.carreras || []).sort((a, b) => a.numero_turno - b.numero_turno)`
- **Número visible**: `portal.html:585` — `<div class="carrera-num">${c.numero_turno}</div>`
- **Lo que se le pasa al modal**: `portal.html:597` — `abrirInscripcion(..., ${c.numero_turno}, ...)`
- **Fetch**: `portal.html:549` trae `carreras(id, numero_turno, nombre, ...)`

`numero_carrera_programa` **no se usa en ningún lado del portal**, que es lo correcto: se asigna
después de la ratificación y en el momento de la inscripción todavía no existe. Y como no hay sorteo
todavía, no hay ninguna gatera ni mandil que se pueda estar filtrando por error — el turno es el
único número que hay, y mostrarlo es lo que corresponde.

### Un detalle de vocabulario

La UI dice **"Carrera N"**, no "Turno N":

- `portal.html:587` — nombre por defecto: `` `Carrera ${c.numero_turno}` ``
- `portal.html` (`abrirInscripcion`) — título del modal: `` `Inscribir en Carrera ${num}` ``
- `portal.html:739` — Mis inscripciones: `Carrera ${car?.numero_turno || '—'}`

El número es el correcto; la palabra no es la que usa Fede. Si quiere que el entrenador lea
literalmente "turno 1" / "turno 7", son tres strings. Es cambio de texto, no de lógica.

---

## Resumen

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿La base permite el mismo SPC en dos turnos de una reunión? | **Sí.** El único unique es `(carrera_id, spc_id)`. Ningún trigger ni `validar_inscripcion` lo tocan. |
| 2 | ¿Pasó? | **Constantemente.** 13 ejemplares en R6, 24 en R8 (30 % de los SPC). Cero casos de doble ratificación. |
| 3 | ¿Hay control en la ratificación? | **No, ninguno.** UPDATE pelado. Un doble ratificado imprimiría el caballo dos veces en el programa. |
| 4 | ¿La carta del portal ordena por turno? | **Sí**, `numero_turno` ASC, y lo muestra. Sólo el rótulo dice "Carrera" en vez de "Turno". |

## Lo que queda para decidir (no implementado)

1. **El control de doble ratificación.** Si va, la pregunta de producto es si **bloquea** o
   **avisa**. Precedente en la casa: la colisión de jockeys avisa y deja seguir. El dato para
   hacerlo ya está cargado en la página.
2. **Las 3 anotaciones colgadas en `inscripto`** (LATIN PRESUMIDA, FALAYS, TATA FOOT). Hoy no
   molestan. La pregunta es si al cerrar la reunión el sistema tiene que forzar que toda anotación
   quede resuelta, o si el estado `inscripto` residual es aceptable.
3. **Cupo vs. multi-turno.** Bajo esta regla las anotaciones provisorias consumen cupo hasta la
   ratificación. Hay que confirmar con Fede si es lo que quiere.
4. **"Turno" en vez de "Carrera"** en los tres textos del portal.

## Cómo se verificó

Todo read-only: `pg_constraint` / `pg_trigger` / `pg_get_functiondef` por MCP, agregaciones sobre
`inscripciones × carreras × reuniones` para los puntos 2 y 3, y lectura de `ratificacion.html` y
`portal.html` para el código. No se escribió nada en la base ni se cambió una línea de código.
