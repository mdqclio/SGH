# R1/R3 — Índices + ANALYZE: resultado antes/después

**Fecha:** 2026-07-28
**Migración:** `migrations/r1_r3_indices_liqdet_usuarios_liquidaciones.sql`
**Origen:** `docs/PERF_AUDIT.md` (vive en la rama `docs/perf-audit`), hallazgo **H1**
**Alcance:** SOLO Prioridad 1. No se tocaron policies (R2a queda para otra tanda), ni Prioridad 2/3/4.

---

## Qué se aplicó

| Índice | Tabla | Columnas | Estado |
|---|---|---|---|
| `idx_liqdet_liquidacion` | `liquidacion_detalle` | `(liquidacion_id)` | válido, ready |
| `idx_usuarios_email` | `usuarios` | `(email)` — **no único** | válido, ready |
| `idx_liquidaciones_reunion_club` | `liquidaciones` | `(reunion_id, club_id)` | válido, ready |

Más `ANALYZE` sobre 8 tablas: `liquidacion_detalle`, `liquidaciones`, `spcs`, `reuniones`,
`usuarios`, `propietarios`, `profesionales`, `caballerizas`.

Ninguno de los 3 índices existía previamente (verificado contra `pg_indexes`). Sin solapamiento
con `idx_liqdet_beneficiario` ni `idx_liqdet_recibo`.

### Dos desviaciones respecto del informe

1. **`usuarios.email` quedó NO ÚNICO.** El informe proponía `CREATE UNIQUE INDEX`. Rechazado: el
   `UNIQUE (club_id, email)` existente permite a propósito el mismo email en dos clubes distintos,
   que es exactamente el escenario de 10 hipódromos (una persona que trabaja en más de un club).
   Un unique global lo prohibiría para siempre. El índice no-único da el mismo beneficio de lookup
   para `fn_get_user_club_id()`. La unicidad global es una decisión de diseño multi-tenant aparte.
   Dato para esa decisión futura: hoy **no hay emails duplicados** (`GROUP BY email HAVING count(*)>1`
   → 0 filas, sobre 3 usuarios).

2. **Sin `CONCURRENTLY`.** No corre dentro de transacción y `apply_migration` envuelve el DDL. Con
   `liquidacion_detalle` en 279 filas el lock del `CREATE INDEX` normal es trivial, y así se evita
   el riesgo de dejar un índice INVALID a medio construir.

### Por qué el ANALYZE incluye `liquidacion_detalle` y `liquidaciones`

`CREATE INDEX` actualiza `pg_class.reltuples`/`relpages` pero **no** puebla `pg_statistic`
(`n_distinct`, MCV, histogramas) — que es lo que el planner usa para estimar la selectividad del
IN-list de 79 UUIDs. Sin eso podía ignorar el índice recién creado y el re-EXPLAIN habría medido mal.
Verificado post-ANALYZE: `liquidacion_detalle.liquidacion_id` → `n_distinct = -0.319`.

---

## Antes / después — query (d)

Misma metodología que Fase 2 de `PERF_AUDIT.md`: transacción implícita con `SET LOCAL ROLE
authenticated` + `SET LOCAL request.jwt.claims` del usuario `dolores@sgh.com`
(`secretario_carreras`, club Dolores), RLS activa, mismo IN-list literal de los 79
`liquidacion_id` de la reunión R6 (`b02ca761-6f44-4720-86aa-a3c3099019ea`).

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM liquidacion_detalle WHERE liquidacion_id IN (<79 uuids de R6>);
```

| Métrica | Antes (baseline PERF_AUDIT) | Después | Δ |
|---|---|---|---|
| Nodo de acceso | `Seq Scan` | **`Index Scan using idx_liqdet_liquidacion`** | — |
| **Buffers (exec)** | **1.345** | **1.026** | **−319 (−23,7 %)** |
| **Execution Time** | **19,36 ms** | **8,50 ms** | **−10,86 ms (−56,1 %)** |
| Filas devueltas | 203 | 203 | igual ✅ |
| `Rows Removed by Filter` | 76 | 0 | el IN-list pasó a ser `Index Cond` |
| Planning Time | (no registrado) | 1,99 ms | — |

Dos corridas: la primera 1.026 buffers (1.025 hit + 1 read) / 10,78 ms con planning frío de 6,27 ms;
la segunda 1.026 buffers (todo hit) / 8,50 ms. Se reporta la segunda como número estable.

### Plan después (recortado)

```
Index Scan using idx_liqdet_liquidacion on liquidacion_detalle
    (cost=0.15..171.81 rows=68) (actual time=0.999..8.432 rows=203 loops=1)
  Index Cond: (liquidacion_id = ANY ('{…79 uuids…}'::uuid[]))
  Filter: (fn_is_super_admin() OR (fn_club_de_liquidacion(liquidacion_id) = fn_get_user_club_id()))
  Buffers: shared hit=1026
Planning Time: 1.988 ms
Execution Time: 8.498 ms
```

---

## Lectura del resultado

El seq scan desapareció y el IN-list se resolvió por índice: el acceso a la tabla dejó de ser el
problema. **Pero los 1.026 buffers restantes son casi todos RLS**, no acceso — el `Filter` con
`fn_club_de_liquidacion()` sigue evaluándose por fila (≈5 buffers/fila × 203 filas). El costo de
acceso propiamente dicho es de unos pocos buffers.

Es decir: R1/R3 se llevó lo que podía llevarse con un índice. **El grueso que queda es R2a** (wrap
de las 108 policies para que las funciones se evalúen una vez por query como `InitPlan` en lugar de
una vez por fila). Esta medición es la nueva línea de base contra la cual comparar esa tanda.

Extrapolando al hallazgo H1 del informe: `generarLiquidaciones` dispara esta query 476 veces por
corrida. A 1.345 buffers eran ~3,9 GB de tráfico de buffer; a 1.026 bajan a ~3,0 GB. Mejora real
pero no estructural — la estructural es R2a.

---

## Pendiente

- **R2a** — wrap de las 108 policies. Verificable con `EXPLAIN` buscando `InitPlan`.
- Re-medir el resto de los planes de Fase 2 (a, b, e, f) después de R2a.
- Recién con R2a aplicada tiene sentido decidir sobre ISSUE-032 (Pro vs Free).
