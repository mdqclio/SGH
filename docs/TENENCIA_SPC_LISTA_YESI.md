# SPC sin entrenador — qué hacer con cada uno

**Fecha:** 2026-08-23 · **Backfill v1.1 APLICADO** y **duplicados unificados**.
Padrón: **181 SPC**. Cobertura: **147 con entrenador (81,2 %)**, 34 sin.

Un SPC sin `entrenador_id` **no existe para el portal**: `fn_mis_spc_ids()` resuelve la tenencia por
ese campo, así que el caballo no aparece en "Mis caballos" y `rpc_inscribir` lo rechaza. Se sigue
inscribiendo por secretaría, como siempre.

Eran **69 de 183**. Después del backfill v1.1 (+33) y de unificar los dos pares de duplicados
(−2 fichas), quedan **34 sin entrenador sobre un padrón de 181**:

| | Caballos | Quién lo resuelve |
|---|---|---|
| ✅ Los levantó el backfill v1.1 | **33** | hecho, ver §1 |
| ✅ Fichas duplicadas, borradas | **2** | hecho — `Fist Queen` y `Malenuchi` |
| **Para que asigne o descarte Yesi** | **17** | §2 — **ésta es la lista** |
| Caballos de prueba, hay que borrarlos | **17** | teardown de ISSUE-035, no es trabajo de Yesi |
| | **69** | |

> La lista real para Yesi son **17 caballos**: de los 34 que quedan sin entrenador, la mitad son
> datos sintéticos de la reunión de prueba 9999 y lo que corresponde es borrarlos, no asignarlos.

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

## 2. La lista para Yesi — 17 caballos

Ninguno tiene una sola inscripción con entrenador cargado, así que no hay de dónde deducirlo. Hay
que asignar el entrenador a mano en **`spcs.html`** (ficha del ejemplar → desplegable **Entrenador**
→ Guardar), o descartar el caballo si ya no corre.

### 2a. Los 5 fáciles — tienen caballeriza

El responsable de la caballeriza sabe quién los entrena. Por acá conviene empezar.

| Caballo | Sexo | Edad | Caballeriza | Situación |
|---|---|---|---|---|
| CURIOSA GO ON | hembra | 4 | 5 ESTRELLAS | nunca se inscribió |
| EL JOROBA | macho | 4 | LA CALIFORNIA | nunca se inscribió |
| GRAND FITO | macho | 4 | 5 ESTRELLAS | nunca se inscribió |
| LA DE ETIQUETA | hembra | 5 | 5 ESTRELLAS | nunca se inscribió |
| Wave Rimout | macho | 9 | LOS MELOS | corrió en R6 (20/06) pero la inscripción se cargó sin entrenador |

### 2b. Los 12 sin caballeriza

| Caballo | Sexo | Edad | Situación |
|---|---|---|---|
| Amiguito Peligroso | macho | 3 | nunca se inscribió |
| Come on Baby | macho | 6 | nunca se inscribió |
| Cursi Nik | macho | 2 | nunca se inscribió · hijo de Nicodemus (USA) |
| Dourada | hembra | 3 | nunca se inscribió |
| Fiestera Nik | macho | 2 | nunca se inscribió · hijo de Nicodemus (USA) |
| First Queen | macho | 2 | nunca se inscribió · ✅ ficha ya unificada |
| Folke Dancer | macho | 6 | nunca se inscribió |
| La City Porteña | macho | 3 | nunca se inscribió |
| La Motocicleta | macho | 3 | nunca se inscribió |
| Malenuchi Jack | macho | 2 | nunca se inscribió · ✅ ficha ya unificada |
| PUNAB | macho | 2 | nunca se inscribió |
| Vito lo capo | macho | 4 | corrió en R6 (20/06) pero la inscripción se cargó sin entrenador |

**Los duplicados ya están resueltos.** Yesi los confirmó el 2026-08-23 y se borraron `Fist Queen` y
`Malenuchi`; quedaron `First Queen` y `Malenuchi Jack`, que siguen en la lista porque todavía les
falta el entrenador. Los cuatro estaban sin ninguna fila colgando, así que el borrado no tocó
ninguna inscripción, resultado ni liquidación. Ver `PLAN_DUPLICADOS_SPC.md`.

**Los dos de R6** (Wave Rimout y Vito lo capo) son los únicos que corrieron: el dato de quién los
entrenaba está en la planilla de esa reunión, no en el sistema.

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
