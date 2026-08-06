# Gate 4.1 — Backfill de tenencia · **PROPUESTA** (no aplicado)

**Fecha**: 2026-08-06 · **Branch**: `sec/autoregistro-gate-4` · **Ref**: `unlhcuanfrtpatoipwve`
**Guard**: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **163** ✅
**Autorizado por Leo** (06/08): backfill SÍ, como §A del plan — derivación como semilla por única vez, `spcs.entrenador_id` como fuente de verdad, `NULL` donde no hay evidencia.

> 🔴 **NADA APLICADO.** Este documento es la propuesta con los números reales medidos en un dry-run de sólo lectura. El `UPDATE` se corre después de tu OK.

---

## 1. Corrección de números respecto del plan

El plan (§A.4) decía **113 / 114 / 112 / 50**. Los números correctos, verificados con tres consultas independientes, son:

| | SPCs |
|---|---:|
| se les setea `entrenador_id` | **114** |
| se les setea `caballeriza_id` | **115** |
| **filas de `spcs` tocadas** (unión de ambos) | **116** |
| entrenador **ambiguo** (2 entrenadores en su historia) | **1** |
| **quedan sin `entrenador_id`** | **49** |

La diferencia venía de una consulta del relevamiento que perdía una fila por un `JOIN` de más. Nada cambia del criterio ni del alcance — un caballo más entra al backfill y uno menos queda sin dato. Corrijo también §A.4 del plan.

Verificado de paso: **0 `entrenador_id` derivados apuntan a un `profesionales.id` inexistente.** No hay FK colgada.

---

## 2. Estado de partida

| | valor |
|---|---:|
| `spcs` totales | 163 |
| `spcs.entrenador_id` poblado | **0** |
| `spcs.caballeriza_id` poblado | **0** |
| SPCs con alguna inscripción (sin contar la reunión 9999) | 131 |
| …de esos, con `entrenador_id` en su historia | 114 |
| …con `caballeriza_id` en su historia | 115 |

---

## 3. Regla aplicada

Por cada `spc_id`, el `entrenador_id` (y en paralelo el `caballeriza_id`) de su **inscripción más reciente que traiga ese campo no nulo**:

```
ORDER BY reuniones.fecha DESC, inscripciones.created_at DESC
```

**Exclusión: reunión 9999** (`PRUEBA RESUMEN`, sintética, fecha 2099-01-01). Sin ese filtro la derivación toma datos de prueba — la consulta sin filtrar devuelve `fecha_max = 2099-01-01` y agrega 17 SPCs que sólo existen ahí.

**Las reuniones canceladas sí cuentan.** R7 se canceló, pero una inscripción que la secretaría cargó es evidencia real de quién entrenaba a ese caballo aunque la fecha después se caiga. (Medido: incluirlas o no da el mismo resultado — esas filas no traen `entrenador_id`.)

**Sólo se escriben campos en `NULL`.** El `UPDATE` es idempotente y nunca pisa un valor existente: correrlo dos veces no cambia nada, y no revierte ninguna corrección que Yesi haga después.

---

## 4. De dónde sale la evidencia

| reunión | fecha | SPCs cuya tenencia sale de acá |
|---|---|---:|
| R8 | 16/08/2026 | 17 |
| R6 | 20/06/2026 | 97 |

Toda la evidencia es de junio en adelante. **63 entrenadores distintos** quedan involucrados.

---

## 5. El caso ambiguo — 1, y no se resuelve solo

**WISLA KEN** tiene dos entrenadores en su historia:

| entrenador | reunión | fecha |
|---|---|---|
| **SERGIO SEBASTIAN SAN MARTIN** | R8 | 16/08/2026 ← **gana por la regla** |
| ERNESTO HUGO SAN MARTIN | R6 | 20/06/2026 |

Mismo apellido: puede ser un traspaso real dentro de la misma familia, o un error de carga entre dos fichas parecidas. **No lo decido yo.** Queda asignado al más reciente por la regla, y va marcado en la lista para Yesi. Un solo caso: no justifica maquinaria.

---

## 6. Los 49 que quedan en `NULL` — y qué significa

No se les inventa entrenador. Consecuencia concreta y aceptada: **esos caballos no aparecen en el portal y no se pueden inscribir desde ahí.** Los inscribe la secretaría, como siempre.

| grupo | SPCs | por qué no hay evidencia |
|---|---:|---|
| con 2 inscripciones históricas | 4 | inscriptos sin `entrenador_id` cargado |
| con 1 inscripción histórica | 30 | ídem |
| sin ninguna inscripción | 15 | altas de Stud Book que nunca corrieron en Dolores |

Los 4 con 2 inscripciones: `IDALIA MARO`, `LA GRAN TEMPESTAD`, `MAC VITAL`, `TOUCH OF BLUE`.

Se drenan solos: cuando Yesi complete la ficha en el ABM, o cuando el caballo corra una vez más con el entrenador cargado.

> Nota de padrón, no bloqueante: en esa lista hay pares que parecen el mismo caballo cargado dos veces — `First Queen` / `Fist Queen`, `Malenuchi` / `Malenuchi Jack`, y `Wave Rimout` duplicado (dos filas, una con 1 inscripción y otra con 0). No lo toco acá; queda anotado para la limpieza de padrón.

---

## 7. Qué se aplica

| archivo | qué |
|---|---|
| `migrations/backfill_tenencia_spcs.sql` | crea `_gate41_backfill_tenencia` (auditoría), snapshotea los valores previos, y hace el `UPDATE` |
| `migrations/rollback_tenencia_spcs.sql` | revierte usando esa tabla |

**El rollback revierte al valor previo, no a NULL a ciegas**, y sólo toca las filas cuyo valor actual sigue siendo el que puso el backfill. Si Yesi corrigió algo en el medio, ese caballo queda como lo dejó ella.

---

## 8. Verificación post-aplicación

| chequeo | esperado |
|---|---|
| `spcs` con `entrenador_id` | **114** |
| `spcs` con `caballeriza_id` | **115** |
| filas en `_gate41_backfill_tenencia` | **116** |
| `entrenador_id` que no existan en `profesionales` | **0** |
| muestra de 10 SPCs cruzada a mano contra su última inscripción | coincide |
| `fn_mis_spc_ids()` deja de devolver 0 para un entrenador con caballos | ✅ |

---

## 9. Después del backfill

Se genera **`docs/GATE_4_1_LISTA_YESI.md`**: los 114 caballos con el entrenador asignado, la reunión de la que salió la evidencia, y el ambiguo marcado. Es para que Yesi lo revise en el ABM a su ritmo — **no bloquea nada**, el gate sigue.

---

## 10. Riesgo, dicho derecho

El backfill escribe **116 filas de `spcs` en producción**. `spcs` es global y la leen el programa, la carta de llamados, resultados y el JSON del Stud Book.

Lo que mitiga:
- Se escriben **sólo campos que hoy están en NULL** (`entrenador_id`, `caballeriza_id`, ambos 0/163). Ningún consumidor puede estar leyéndolos hoy con un valor distinto.
- Ninguna pantalla vive del `spcs.entrenador_id`: los módulos usan `inscripciones.entrenador_id`, que **no se toca**.
- El único consumidor real es `fn_mis_spc_ids()`, que hoy devuelve 0 filas para todos.
- Rollback pre-staged y exacto.

**Esperando tu OK para aplicar.**
