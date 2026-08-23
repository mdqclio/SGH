# SPC sin entrenador — qué hacer con cada uno

**Fecha:** 2026-08-23 · **Backfill v1.1 APLICADO.** Cobertura **147 de 183 (80,3 %)**.

Un SPC sin `entrenador_id` **no existe para el portal**: `fn_mis_spc_ids()` resuelve la tenencia por
ese campo, así que el caballo no aparece en "Mis caballos" y `rpc_inscribir` lo rechaza. Se sigue
inscribiendo por secretaría, como siempre.

Eran **69 de 183**. El backfill v1.1 vinculó 33; quedan **36**, que se reparten así:

| | Caballos | Quién lo resuelve |
|---|---|---|
| ✅ Los levantó el backfill v1.1 | **33** | hecho, ver §1 |
| **Para que asigne o descarte Yesi** | **19** | §2 — **ésta es la lista** |
| Caballos de prueba, hay que borrarlos | **17** | teardown de ISSUE-035, no es trabajo de Yesi |
| | **69** | |

> La lista real para Yesi son **19 caballos, no 36**: 17 de los que parecían pendientes son datos
> sintéticos de la reunión de prueba 9999 y lo que corresponde es borrarlos, no asignarlos.

---

## 1. Lo automático — 33 caballos

**Criterio de vinculación** (idéntico al de la primera pasada, no se cambió nada):

> Para cada caballo se toma el `entrenador_id` de **su inscripción más reciente que lo tenga
> cargado**, ordenando por `reuniones.fecha` DESC y desempatando por `inscripciones.created_at`
> DESC. Se **excluye la reunión 9999** (sintética). Las reuniones **canceladas sí cuentan**: una
> inscripción que cargó la secretaría es evidencia real de quién entrenaba al caballo, aunque
> después se haya suspendido la fecha. Sólo escribe donde el campo está en **NULL** — no pisa
> ninguna corrección manual.

**Resultado real de la aplicación (2026-08-23): +33 entrenadores, +0 caballerizas.** Cobertura
**114/183 (62,3 %) → 147/183 (80,3 %)**, exactamente lo que anticipaba el dry run.

Control de que no se pisó nada: se tomó la huella md5 de los **114 valores de `entrenador_id` que ya
existían** antes de la pasada, y de los 152 de `caballeriza_id`. Después de aplicar, las dos huellas
son **idénticas** (`42661ed6…` y `35544d35…`). Además, 0 SPC quedaron apuntando a un entrenador
inexistente. El backfill sólo agregó filas nuevas; no tocó una sola que ya tuviera valor.

⚠️ **No alcanzaba con re-correr el archivo original.** La v1 es idempotente para el UPDATE, pero el
INSERT de auditoría usa `ON CONFLICT (spc_id) DO NOTHING` y el UPDATE se apoya en esa tabla: un
caballo que ya tiene fila de auditoría no se vuelve a tocar nunca, aunque haya aparecido evidencia
nueva. Hoy eso deja afuera a **TIRSO** —el 06/08 sólo tenía evidencia de caballeriza; R8 le dio
entrenador (MALENA, GUSTAVO) después— y escribiría 32 en vez de 33, en silencio.

Por eso se escribió `migrations/backfill_tenencia_spcs_v1_1.sql`: **cambia sólo el `ON CONFLICT`**,
de `DO NOTHING` a un `DO UPDATE` que rellena únicamente los `_nuevo` en NULL y no toca los
`_previo`, que son la base del rollback. Mismo criterio de derivación, palabra por palabra.
**Aplicada el 2026-08-23** — y TIRSO quedó con MALENA, GUSTAVO, que era el caso que la v1 perdía.

Rollback disponible sin cambios: `migrations/rollback_tenencia_spcs.sql`, que lee la misma tabla de
auditoría.

---

## 2. La lista para Yesi — 19 caballos

Ninguno tiene una sola inscripción con entrenador cargado, así que no hay de dónde deducirlo. Hay
que asignar el entrenador a mano en **`spcs.html`** (ficha del ejemplar → desplegable **Entrenador**
→ Guardar), o descartar el caballo si ya no corre.

### 2a. Nunca se inscribieron — 17

| Caballo | Sexo | Edad | Caballeriza | Nota |
|---|---|---|---|---|
| Amiguito Peligroso | macho | 3 | — | |
| Come on Baby | macho | 6 | — | |
| CURIOSA GO ON | hembra | 4 | 5 ESTRELLAS | la caballeriza es una pista de a quién preguntarle |
| Cursi Nik | macho | 2 | — | hijo de Nicodemus (USA) |
| Dourada | hembra | 3 | — | |
| EL JOROBA | macho | 4 | LA CALIFORNIA | la caballeriza es una pista |
| Fiestera Nik | macho | 2 | — | hijo de Nicodemus (USA) |
| **First Queen** | macho | 2 | — | ⚠️ **probable duplicado** de "Fist Queen" |
| **Fist Queen** | macho | 2 | — | ⚠️ misma fecha de nacimiento (04/10/2023), misma alta (27/04), sin registro. Parece el mismo caballo cargado dos veces con un error de tipeo |
| Folke Dancer | macho | 6 | — | |
| GRAND FITO | macho | 4 | 5 ESTRELLAS | la caballeriza es una pista |
| La City Porteña | macho | 3 | — | |
| LA DE ETIQUETA | hembra | 5 | 5 ESTRELLAS | la caballeriza es una pista |
| La Motocicleta | macho | 3 | — | |
| **Malenuchi** | macho | 2 | — | ⚠️ **probable duplicado** de "Malenuchi Jack" |
| **Malenuchi Jack** | macho | 2 | — | ⚠️ misma fecha de nacimiento (15/10/2023), misma alta (09/05). El "Jack" tiene padrillo y madre cargados; el otro no. Probablemente hay que quedarse con el completo |
| PUNAB | macho | 2 | — | |

**4 de esos 17 son dos pares de probables duplicados.** Si se confirman, la lista baja a 15 caballos
y quedan dos fichas para unificar o borrar.

Los 5 que tienen caballeriza (CURIOSA GO ON, EL JOROBA, GRAND FITO, LA DE ETIQUETA y los de
5 ESTRELLAS) son los más fáciles: el responsable de la caballeriza sabe quién los entrena.

### 2b. Se inscribieron, pero sin entrenador cargado — 2

| Caballo | Sexo | Edad | Caballeriza | Última inscripción |
|---|---|---|---|---|
| Vito lo capo | macho | 4 | — | R6, 20/06/2026 |
| Wave Rimout | macho | 9 | LOS MELOS | R6, 20/06/2026 |

Estos dos corrieron en R6 pero la inscripción se cargó sin entrenador. El dato está en la planilla
de esa reunión, no en el sistema.

---

## 3. Los 17 de prueba — borrar, no asignar

No van a la lista de Yesi. Son los caballos sintéticos que se crearon para la reunión **9999
(PRUEBA RESUMEN)**: alta del 21 y 22 de abril, registros inventados en serie (`SB-10001` a
`SB-10010`, `SB-D001` a `SB-D006`) y **cero inscripciones en reuniones reales**.

```
Don Dolores · Don Facundo · El Caudillo · El Pampeano · Estrella Federal · Flor de Ceibo
Gaucha Linda · Gaucho Bravo · La Bonaerense · La Criolla · La Porteña · MR. PATO
Pampa Libre · Pampero Real · Río Salado · Tormenta Sur · Viento del Sur
```

Se van con el teardown de la reunión 9999 que ya está anotado como **ISSUE-035**
(`teardown_prueba_resumen_9999.sql`). Asignarles entrenador sería ensuciar el padrón con datos que
hay que borrar. MR. PATO no tiene registro sintético pero es del mismo lote del 22/04 y tampoco
tiene actividad real.

---

## Lo que NO resuelve nada de esto

Aunque la tenencia llegue al 100 %, **hoy hay 0 SPC alcanzables desde el portal**: hay 64
entrenadores con caballos y **una sola cuenta de portal**, que además pertenece a un profesional sin
caballos. El código del autoregistro funciona y Yesi puede aprobar solicitudes; lo que falta es que
los entrenadores se registren, y eso depende de que circule el link. Ver `TENENCIA_SPC_ESTADO.md`.

Vincular caballos es condición necesaria pero no suficiente: sin cuentas, el portal sigue en cero.
