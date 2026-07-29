# PERF_AUDIT — Auditoría de performance y escalabilidad a 10 hipódromos

**Fecha:** 2026-07-25
**Proyecto Supabase:** `unlhcuanfrtpatoipwve` (SGH prod)
**Alcance:** SOLO ANÁLISIS. No se creó ningún índice, no se modificó ninguna policy, no se tocó schema ni datos. Todo el SQL ejecutado fue `SELECT` / `EXPLAIN`. El DDL que aparece en este documento es **propuesta**, no está aplicado.

## Guard verificado

| Check | Esperado | Obtenido | OK |
|---|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | `/home/clio/dev/SGH` | ✅ |
| `SELECT count(*) FROM spcs` | ~144 | **144** | ✅ |
| Project ref | `unlhcuanfrtpatoipwve` | `https://unlhcuanfrtpatoipwve.supabase.co` | ✅ |
| Proyecto Cambios (`kshoecyroddvhqqrmosm`) | no tocar | no se abrió | ✅ |

---

## Escenario de proyección

| Dimensión | Hoy (1 club) | 10 clubes / año |
|---|---|---|
| Clubes | 1 | 10 |
| Reuniones | ~12 | 240 (10 × 2/mes) |
| Carreras | 38 | ~2.400 |
| Inscripciones | 142 | ~28.800 (R6 real: 11,4 insc/carrera) |
| `resultado_posiciones` | 98 | ~21.600 |
| `liquidaciones` (headers) | 89 | ~19.000 (R6 real: 79 headers/reunión) |
| `liquidacion_detalle` | 279 | **~36.000** |
| `performances` | 0 | 30.000–60.000 |
| `spcs` | 144 | 1.500–3.000 |
| `usuarios` staff | 3 | 50–80 |
| `usuarios` portal (futuro) | 0 | 500–1.500 |
| `auditoria` | 3.714 (5,2 MB) | ~45.000 (~60 MB) |

---

# FASE 1 — Relevamiento (crudo)

## 1.1 Instancia

```
max_connections       60
shared_buffers        28672 × 8 kB  =  224 MB
effective_cache_size  49152 × 8 kB  =  384 MB
work_mem              2184 kB
maintenance_work_mem  32 MB
max_worker_processes  6
jit                   off
statement_timeout     120000 ms
```

Compute chico (perfil Micro/Nano). `max_connections = 60` es el techo duro compartido entre PostgREST, GoTrue, Realtime, Storage, pooler y sesiones directas.

## 1.2 Tamaños y patrón de acceso (`pg_stat_user_tables`, top por `seq_scan`)

| relname | n_live_tup | seq_scan | seq_tup_read | idx_scan | total_size |
|---|---|---|---|---|---|
| `liquidaciones` | 89 | 2.730 | 73.048 | 5.505 | 120 kB |
| **`liquidacion_detalle`** | 279 | **1.861** | **375.851** | **8** | 240 kB |
| `resultados` | 8 | 1.575 | 12.937 | 30 | 96 kB |
| `profesionales` | 0* | 115 | 19.039 | 128 | 104 kB |
| `usuarios` | 0* | 111 | 450 | 64.753 | 48 kB |
| `carreras` | 38 | 95 | 3.513 | 9.014 | 120 kB |
| `spcs` | 0* | 66 | 9.379 | 139 | 136 kB |
| `inscripciones` | 142 | 64 | 7.812 | 3.442 | 160 kB |
| `resultado_posiciones` | 98 | 63 | 2.618 | 65 | 88 kB |
| `caballerizas` | 0* | 59 | 16.009 | 3 | 144 kB |
| `performances` | 0 | 29 | 0 | 8 | 64 kB |
| `reuniones` | 0* | 29 | 395 | 10.502 | 200 kB |
| `auditoria` | 3.714 | 17 | 62.919 | 1 | **5.168 kB** |

\* `n_live_tup = 0` con datos reales presentes → **estadísticas nunca calculadas** (ver 1.5).

`liquidacion_detalle`: **1.861 seq scans / 8 index scans**. Ratio 232:1. Es la tabla más castigada del sistema.

## 1.3 Índices existentes (`pg_indexes`, schema `public`)

Resumen por tabla (PK omitidas donde no aportan):

| Tabla | Índices |
|---|---|
| `apoderados` | `(club_id, autorizante_tipo, autorizante_id)`; UNIQUE `(club_id, autorizante_tipo, autorizante_id, autorizado_documento) WHERE vigente` |
| `auditoria` | `(tabla, registro_id)` |
| `caballeriza_responsables` | `(caballeriza_id)`, `(documento_nro)`, `(profesional_id)` |
| `caballerizas` | solo PK |
| `carrera_apuestas` | `(carrera_id)`; UNIQUE `(carrera_id, tipo)` |
| `carreras` | `(reunion_id)`; UNIQUE `(reunion_id, numero_turno)` |
| `categorias_carrera` | UNIQUE `(club_id, codigo)` |
| `clubs` | UNIQUE `(sigla)` |
| `hipodromos` | UNIQUE `(club_id, sigla)` |
| `inscripciones` | `(carrera_id)`, `(spc_id)`; UNIQUE `(carrera_id, spc_id)`; UNIQUE `(carrera_id, numero_partidor) WHERE numero_partidor IS NOT NULL` |
| **`liquidacion_detalle`** | `(beneficiario_tipo, beneficiario_id, estado_linea)`, `(recibo_id)` — **sin índice en `liquidacion_id`** |
| **`liquidaciones`** | **solo PK** |
| `performances` | `(fecha_carrera DESC)`, `(spc_id)` |
| `profesionales` | `(club_id)` |
| `propietarios` | `(club_id)`; UNIQUE `(club_id, documento_tipo, documento_nro) WHERE documento_nro IS NOT NULL` |
| `recibos` | UNIQUE `(club_id, numero_recibo)` |
| `resultado_apuestas` | `(resultado_id)`; UNIQUE `(resultado_id, tipo, orden)` |
| `resultado_posiciones` | UNIQUE `(resultado_id, posicion)` |
| `resultados` | `(id, updated_at)`; UNIQUE `(carrera_id)` |
| `reuniones` | `(club_id, fecha)`; UNIQUE `(club_id, hipodromo_id, numero, fecha)` |
| `sanciones` | `(entidad_tipo, entidad_id)`, `(estado, fecha_fin)` |
| `spcs` | `(club_id)`; UNIQUE `(studbook_id) WHERE studbook_id IS NOT NULL` |
| **`usuarios`** | UNIQUE `(club_id, email)` — **sin índice con `email` como columna líder** |

## 1.4 `pg_stat_statements`

Extensión **instalada** (`count = 1`). No hay gap.

**Top por `total_exec_time`** (recortado a lo relevante del app; se omiten queries de catálogo/backup de la plataforma):

| query (recortada) | calls | total_ms | mean_ms | rows |
|---|---|---|---|---|
| `INSERT INTO liquidacion_detalle(...)` | 464 | 504,1 | 1,086 | 464 |
| RPC `aplicar_resultado` | 28 | 420,1 | 15,003 | 28 |
| `UPDATE inscripciones SET peso_balanza` | 57 | 372,0 | 6,526 | 57 |
| **`SELECT id FROM liquidacion_detalle WHERE liquidacion_id = $1`** | **476** | 371,1 | 0,780 | 476 |
| `UPDATE liquidaciones SET total_bruto, total_descuentos` | 315 | 348,3 | 1,106 | 315 |
| `SELECT id FROM caballerizas WHERE club_id=$1 AND activo=$2` | 21 | 527,7 | 25,129 | 21 |
| `UPDATE carreras SET apertura_inscripcion, ...` | 13 | 227,0 | 17,460 | 13 |
| `DELETE FROM usuarios WHERE email ilike $1` | 13 | 720,6 | 55,434 | 13 |

**Top por `calls`** (app únicamente):

| query | calls | total_ms | mean_ms |
|---|---|---|---|
| `SELECT id FROM liquidacion_detalle WHERE liquidacion_id=$1` | 476 | 371,1 | 0,780 |
| `INSERT INTO liquidacion_detalle(...)` | 464 | 504,1 | 1,086 |
| `SELECT monto_bruto,monto_descuento FROM liquidacion_detalle WHERE liquidacion_id=$1` | 316 | 190,5 | 0,603 |
| `UPDATE liquidaciones SET total_bruto,total_descuentos WHERE id=$1` | 315 | 348,3 | 1,106 |
| `DELETE FROM liquidaciones WHERE id=$1` | 160 | 69,3 | 0,433 |
| `INSERT INTO liquidaciones(...)` | 128 | 187,7 | 1,467 |

**Lectura:** el top-6 de la app es *íntegramente* `generarLiquidaciones`. Ninguna otra pantalla aparece. La huella de escritura/lectura del sistema hoy está dominada por un único proceso que corre en el browser del operador.

## 1.5 Estadísticas del planner — **muertas**

| relname | n_live_tup | count real | last_autoanalyze |
|---|---|---|---|
| `spcs` | 0 | 144 | **null** |
| `reuniones` | 0 | 12 | **null** |
| `usuarios` | 0 | 3 | **null** |
| `propietarios` | 0 | >0 | **null** |
| `profesionales` | 0 | >0 | **null** |
| `caballerizas` | 0 | >0 | **null** |
| `inscripciones` | 142 | 142 | 2026-07-22 |
| `liquidacion_detalle` | 279 | 279 | 2026-07-22 |

Seis tablas nunca fueron analizadas. El planner las cree vacías. Ya se ve el efecto en Fase 2: query (a) estima `rows=4` y devuelve 11; la variante EXISTS elige `Seq Scan on carreras`.

## 1.6 Policies RLS — dump y clasificación

**Total: 108 policies, todas sobre el rol `{authenticated}`. `anon` no tiene ninguna policy en ninguna tabla.**

Verificado empíricamente:

```sql
SET LOCAL ROLE anon;
SELECT count(*) FROM carreras;  -- 0
-- inscripciones 0 | spcs 0 | reuniones 0 | performances 0
```

Las funciones helper (todas `STABLE SECURITY DEFINER`, `SET search_path = public`):

```sql
fn_is_super_admin()            -- SELECT EXISTS(SELECT 1 FROM usuarios WHERE email=(auth.jwt()->>'email') AND rol='super_admin')
fn_get_user_club_id()          -- SELECT club_id FROM usuarios WHERE email=(auth.jwt()->>'email') LIMIT 1
fn_club_de_reunion(uuid)       -- SELECT club_id FROM reuniones WHERE id=$1
fn_club_de_carrera(uuid)       -- reuniones JOIN carreras WHERE c.id=$1
fn_club_de_inscripcion(uuid)   -- reuniones JOIN carreras JOIN inscripciones WHERE i.id=$1
fn_club_de_liquidacion(uuid)   -- SELECT club_id FROM liquidaciones WHERE id=$1
fn_club_de_resultado(uuid)     -- fn_club_de_carrera(carrera_id) FROM resultados WHERE id=$1   ← anidada
fn_club_de_caballeriza(uuid)   -- SELECT club_id FROM caballerizas WHERE id=$1
fn_club_de_resolucion(uuid)    -- SELECT club_id FROM resoluciones WHERE id=$1
```

### Policies que llaman `fn_*()` SIN el wrap `(SELECT fn_*())`

**Todas. Las 108. No hay una sola policy en el schema `public` que use el wrap.**

Hay que separar dos problemas distintos, porque tienen arreglos distintos:

**Grupo A — no correlacionadas (`fn_is_super_admin()`, `fn_get_user_club_id()`): se arreglan con el wrap.**
No dependen de la fila. Envueltas en `(SELECT …)` el planner las promueve a InitPlan y las evalúa **una vez por query** en vez de una vez por fila.

Tablas afectadas (todos los `cmd`): `apoderados`, `auditoria`, `caballeriza_responsables`, `caballerizas`, `carrera_apuestas`, `carreras`, `categorias_carrera`, `club_configuracion`, `club_secuencias`, `clubs`, `comision_config`, `hipodromos`, `inscripciones`, `liquidacion_config`, `liquidacion_detalle`, `liquidaciones`, `novedades_reunion`, `performances`, `profesionales`, `propietarios`, `recibos`, `resolucion_entidades`, `resoluciones`, `resultado_apuestas`, `resultado_log`, `resultado_posiciones`, `resultados`, `reuniones`, `sanciones`, `spc_propietarios`, `spcs`, `usuarios`.

`usuarios_select` y `usuarios_update` además llaman `auth.jwt()` directo, sin wrap.

**Grupo B — correlacionadas (`fn_club_de_X(columna)`): el wrap NO las arregla.**
Reciben una columna de la fila como argumento, así que son inherentemente per-fila. El wrap `(SELECT fn_club_de_carrera(carrera_id))` sigue siendo un SubPlan correlacionado.

| Tabla | Predicado correlacionado |
|---|---|
| `carreras` | `fn_club_de_reunion(reunion_id)` |
| `inscripciones` | `fn_club_de_carrera(carrera_id)` |
| `carrera_apuestas` | `fn_club_de_carrera(carrera_id)` |
| `resultados` | `fn_club_de_carrera(carrera_id)` |
| `resultado_posiciones` | `fn_club_de_inscripcion(inscripcion_id)` ← 3 JOINs por fila |
| `resultado_apuestas` | `fn_club_de_resultado(resultado_id)` ← función anidada |
| `resultado_log` | `fn_club_de_resultado(resultado_id)` |
| `liquidacion_detalle` | `fn_club_de_liquidacion(liquidacion_id)` |
| `novedades_reunion` | `fn_club_de_reunion(reunion_id)` |
| `caballeriza_responsables` | `fn_club_de_caballeriza(caballeriza_id)` |
| `resolucion_entidades` | `fn_club_de_resolucion(resolucion_id)` |

**Grupo C — policies abiertas (`qual = true`), sin costo de RLS pero con consecuencia de seguridad multi-tenant.**
`spcs` (SELECT/INSERT/UPDATE), `propietarios` (SELECT/INSERT/UPDATE), `profesionales` (SELECT/INSERT/UPDATE), `spc_propietarios` (SELECT/INSERT/UPDATE), `sanciones` (SELECT), `performances` (SELECT).

Para `spcs` y `sanciones` es intencional (SPCs globales, sanciones compartidas entre hipódromos). Para `propietarios` y `profesionales` **no**: son per-hipódromo y hoy cualquier usuario autenticado de cualquier club los lee y los escribe. A 1 club es invisible; a 10 clubes es una fuga cruzada. Fuera del alcance de esta auditoría de performance, pero queda registrado — y es relevante acá porque **cerrar esas policies va a agregar costo RLS donde hoy no hay**: conviene cerrarlas ya con la forma correcta (Grupo A wrappeado + `club_id` directo), no con `fn_club_de_X()`.

### El linter de Supabase sub-reporta este problema

`get_advisors(performance)` levanta `auth_rls_initplan` **solo para `usuarios_select` y `usuarios_update`** — las dos únicas policies que llaman `auth.<fn>()` textualmente. El lint hace pattern-matching sobre `auth.*` y `current_setting()`; no sigue la indirección a través de `fn_get_user_club_id()`, que internamente hace exactamente lo mismo.

**Consecuencia: 106 policies con el mismo defecto son invisibles para el linter.** No usar el advisor como medida de cobertura acá.

## 1.7 Advisors — otros hallazgos

- `unindexed_foreign_keys`: **50 FKs sin índice de cobertura** (lista completa en la sección de índices propuestos).
- `unused_index`: `idx_performances_fecha`, `idx_sanciones_entidad`, `idx_spcs_club`, `idx_profesionales_club`, `idx_propietarios_club`, `idx_cab_resp_caballeriza`, `idx_cab_resp_profesional`, `idx_cab_resp_documento`, `apoderados_autorizante_idx`. **No borrar todavía**: `idx_spcs_club`/`idx_profesionales_club`/`idx_propietarios_club` están sin uso porque las policies de esas tablas son `true` y no hay multi-tenant real aún; a 10 clubes van a ser necesarios.
- `no_primary_key`: `archive.backup_spcs_20260515`, `archive.backup_inscripciones_20260515` (tablas de backup, irrelevante).

---

# FASE 2 — EXPLAIN con RLS activo

## Metodología

`usuarios` **no tiene columna `auth_id`** (se verificó: `ERROR 42703 column "auth_id" does not exist`). El vínculo con Auth es por **email**: `fn_get_user_club_id()` y `fn_is_super_admin()` resuelven `WHERE email = (auth.jwt()->>'email')`. Por eso el claim que importa es `email`, no `sub`; se seteó `sub` igual al `usuarios.id` como proxy y se documenta la desviación respecto de la consigna.

Cada EXPLAIN corrió como una sentencia múltiple en una única transacción implícita, con `SET LOCAL` (scope transaccional, se descarta al terminar). Ninguna sentencia escribió.

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"9ac2d140-faec-424c-9437-0cedeb8b8b82","email":"dolores@sgh.com","role":"authenticated"}';
EXPLAIN (ANALYZE, BUFFERS) <query>;
```

Usuario: `dolores@sgh.com` / `secretario_carreras` / club Dolores. Reunión de prueba: **R6** = `b02ca761-6f44-4720-86aa-a3c3099019ea` (11 carreras, 125 inscripciones, 79 liquidaciones, 8 resultados).

## Resumen

| # | Query | RLS | Filter con `fn_*()` por fila | Seq scan | Buffers | Exec ms | Filas |
|---|---|---|---|---|---|---|---|
| a | `carreras WHERE reunion_id=R6` | on | **sí** | no | 233 | 9,36 | 11 |
| b | `inscripciones WHERE carrera_id IN(11) AND estado='ratificado'` | on | **sí** | no | **1.338** | 8,59 | 81 |
| b′ | idem, **sin RLS** (rol `postgres`) | off | — | sí (barato) | **5** | **0,19** | 81 |
| c | `performances WHERE spc_id IN(10)` | on (`true`) | no | no | 1 | 1,19 | 0 |
| d | `liquidacion_detalle WHERE liquidacion_id IN(79)` | on | **sí** | **SÍ** | **1.345** | **19,36** | 203 |
| e | `resultado_posiciones WHERE resultado_id IN(8)` | on | **sí** | no | **1.253** | 8,63 | 81 |
| f | `usuarios WHERE email='dolores@sgh.com'` | on | **sí** | no | 62 | 0,43 | 1 |

## Planes (recortados)

### (a) `carreras` por reunión — RLS presente, índice OK

```
Bitmap Heap Scan on carreras  (cost=1.32..13.74 rows=4) (actual rows=11)
  Recheck Cond: (reunion_id = 'b02ca761-…'::uuid)
  Filter: (fn_is_super_admin() OR (fn_club_de_reunion(reunion_id) = fn_get_user_club_id()))
  Buffers: shared hit=233
  ->  Bitmap Index Scan on idx_carreras_reunion  (actual rows=11)
        Buffers: shared hit=1
Execution Time: 9.360 ms
```

El acceso cuesta **1 buffer**. La RLS cuesta **232**. Nótese `rows=4` estimado vs 11 real: estadísticas viejas.

### (b) `inscripciones` ratificadas de la reunión — el caso de referencia

Con RLS:
```
Index Scan using idx_inscripciones_carrera on inscripciones  (cost=0.14..104.41 rows=14) (actual rows=81)
  Filter: ((fn_is_super_admin() OR (fn_club_de_carrera(carrera_id) = fn_get_user_club_id()))
           AND (estado = 'ratificado'::estado_inscripcion))
  Rows Removed by Filter: 44
  Buffers: shared hit=1338
Execution Time: 8.592 ms
```

Sin RLS (mismo SQL, rol `postgres`):
```
Seq Scan on inscripciones  (actual rows=81)
  Filter: ((estado = 'ratificado') AND (carrera_id = ANY (…)))
  Buffers: shared hit=5
Execution Time: 0.192 ms
```

**La RLS multiplica los buffers por 268× y el tiempo por 45×**, sobre 125 filas escaneadas. Costo marginal ≈ **10,7 buffers/fila**.

### (c) `performances` por SPC — sano

```
Bitmap Heap Scan on performances  (actual rows=0)
  ->  Bitmap Index Scan on idx_performances_spc  (actual rows=0)
        Buffers: shared hit=1
Execution Time: 1.193 ms
```

Sin `Filter` de RLS: la policy es `qual = true` y el planner la elimina. `idx_performances_spc` se usa. **Este plan es el que hay que replicar en las otras tablas.** Ojo: el orden `fecha_carrera DESC` que pide `programa.html` no está cubierto por este índice.

### (d) `liquidacion_detalle` por liquidación — el peor plan del sistema

```
Seq Scan on liquidacion_detalle  (cost=0.20..226.33 rows=68) (actual rows=203)
  Filter: ((liquidacion_id = ANY ('{…79 uuids…}'::uuid[]))
           AND (fn_is_super_admin() OR (fn_club_de_liquidacion(liquidacion_id) = fn_get_user_club_id())))
  Rows Removed by Filter: 76
  Buffers: shared hit=1345
Execution Time: 19.359 ms
```

Dos defectos superpuestos: **seq scan** (no hay índice en `liquidacion_id`) **+ RLS correlacionada**. Es también la query que `generarLiquidaciones` dispara 476 veces por corrida.

### (e) `resultado_posiciones` por resultado — RLS con 3 JOINs por fila

```
Index Scan using resultado_posiciones_resultado_id_posicion_key on resultado_posiciones  (actual rows=81)
  Filter: (fn_is_super_admin() OR (fn_club_de_inscripcion(inscripcion_id) = fn_get_user_club_id()))
  Buffers: shared hit=1253
Execution Time: 8.626 ms
```

`fn_club_de_inscripcion` hace `reuniones ⋈ carreras ⋈ inscripciones` **por cada una de las 81 filas**. 15,5 buffers/fila.

### (f) `usuarios` por email

```
Index Scan using usuarios_club_id_email_key on usuarios  (actual rows=1)
  Index Cond: ((email)::text = 'dolores@sgh.com'::text)
  Filter: (fn_is_super_admin()
           OR ((email)::text = ((COALESCE(NULLIF(current_setting('request.jwt.claim',true),''),
                                          NULLIF(current_setting('request.jwt.claims',true),'')))::jsonb ->> 'email'))
           OR (club_id = fn_get_user_club_id()))
  Buffers: shared hit=62
Execution Time: 0.425 ms
```

**El `Index Cond` usa `usuarios_club_id_email_key`, cuya columna líder es `club_id`, no `email`.** Con `email` sola el btree degenera a un recorrido completo del índice. Con 3 usuarios no se nota. Es crítico porque **`fn_get_user_club_id()` y `fn_is_super_admin()` hacen exactamente este lookup, y se ejecutan una vez por fila de cada query del sistema.**

## Experimento A/B/C — cuánto vale el wrap

Mismo SELECT sobre `inscripciones` (125 filas escaneadas), con el predicado de RLS escrito a mano, rol `postgres` (RLS off, así lo único medido es el predicado):

| Variante | Predicado | Buffers | Exec ms |
|---|---|---|---|
| **A** — actual | `fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id()` | 986 | 5,105 |
| **B** — wrap Grupo A | `(SELECT fn_is_super_admin()) OR fn_club_de_carrera(carrera_id) = (SELECT fn_get_user_club_id())` | 907 | 3,410 |
| **C** — wrap + de-correlación | `(SELECT fn_is_super_admin()) OR EXISTS (SELECT 1 FROM carreras c JOIN reuniones r ON r.id=c.reunion_id WHERE c.id=i.carrera_id AND r.club_id=(SELECT fn_get_user_club_id()))` | **329** | **2,444** |

Plan de B — el wrap funciona, se ven los InitPlan:
```
Filter: ((estado = 'ratificado') AND ((InitPlan 1).col1 OR (fn_club_de_carrera(carrera_id) = (InitPlan 2).col1)))
  InitPlan 1 -> Result (actual time=1.055..1.056 rows=1)   Buffers: shared hit=286
  InitPlan 2 -> Result (actual time=0.211..0.211 rows=1)   Buffers: shared hit=2
Buffers: shared hit=907
```

Plan de C — la correlacionada se convierte en `hashed SubPlan`, evaluado una vez:
```
Filter: ((estado = 'ratificado') AND ((InitPlan 1).col1 OR (ANY (carrera_id = (hashed SubPlan 5).col1))))
  SubPlan 5 -> Nested Loop (actual rows=38)
      -> Seq Scan on carreras c (actual rows=38)
      -> Memoize (Hits: 34  Misses: 4)
            -> Index Scan using reuniones_pkey on reuniones r
Buffers: shared hit=329
```

**Conclusiones cuantitativas:**

- Costo por fila de `fn_club_de_carrera(carrera_id)`: `(907 − 288 de InitPlans) / 125` ≈ **4,95 buffers/fila**.
- Solo el wrap (B): **−8% buffers, −33% tiempo**. Barato, mecánico, sin riesgo semántico.
- Wrap + de-correlación (C): **−67% buffers, −52% tiempo**. Y en C aparece `Seq Scan on carreras` porque `carreras` sí tiene estadísticas pero `reuniones` no — con `ANALYZE` mejora todavía más.
- El wrap **por sí solo no alcanza** en las 11 tablas del Grupo B. Ahí el costo dominante es la función correlacionada, no las dos globales.

---

# FASE 3 — Análisis

## 3.1 RLS — impacto proyectado

### Modelo de costo

Costo RLS de una query ≈ `filas_escaneadas × (costo_fn_globales + costo_fn_correlacionada)`, donde hoy:

- `fn_is_super_admin()` + `fn_get_user_club_id()`: ~2,9 buffers/fila **hoy con 3 usuarios**. Escala con `|usuarios|` porque el lookup por `email` no tiene índice líder. A 1.580 usuarios (80 staff + 1.500 portal) el índice `(club_id,email)` ocupa ~10 páginas y hay que recorrerlo entero: **~10–20 buffers/fila**, ×2 funciones.
- `fn_club_de_X(col)`: 4,95 buffers/fila (`fn_club_de_carrera`) a 15,5 (`fn_club_de_inscripcion`, 3 JOINs).

### Dos regímenes distintos

**Régimen 1 — queries acotadas por reunión (a, b, e, y todo `programa.html` / `resultados.html` / `ratificacion.html`).**
El tamaño del resultado *no crece* con la cantidad de clubes: una reunión sigue teniendo 11 carreras y ~125 inscripciones. Lo que crece es la **concurrencia**. El costo por request se mantiene en el orden de hoy (~8–9 ms) *salvo* por el crecimiento de `usuarios`, que sí multiplica la parte del Grupo A.

Proyección `programa.html` (1 reunión, 12 carreras):
- Hoy: `carreras` 233 buf + `inscripciones` 1.338 buf + `spcs` (catálogo entero) + `performances` ≈ **~1.600 buffers**.
- A 10 clubes con 1.580 usuarios y 3.000 SPCs: el término del Grupo A pasa de 2,9 a ~25 buffers/fila sobre ~136 filas ⇒ **~5.000 buffers** solo de RLS, más el catálogo completo de `spcs` (ver 3.3). Estimado **~8.000–10.000 buffers / ~50–70 ms por carga de página**.
- Con wrap (Grupo A → 2 evaluaciones por query en vez de 272): ese término colapsa a **~50 buffers totales**. **Reducción de ~5.000 a ~50.**

**Régimen 2 — queries cuyo scan crece con el tamaño total de la tabla (d, `auditoria`).**
Acá el crecimiento es lineal y no hay techo.

`liquidacion_detalle`, proyección a 36.000 filas/año:
- Ancho de fila observado: 240 B ⇒ 36.000 filas ≈ **1.055 páginas heap**.
- Hoy el seq scan lee 34 páginas; a 36.000 filas lee **1.055 páginas por query**.
- `generarLiquidaciones` dispara **476** de esas queries por corrida (medido en `pg_stat_statements`) ⇒ `476 × 1.055` ≈ **502.000 lecturas de buffer ≈ 3,9 GB de tráfico** por recálculo de una reunión, contra un `shared_buffers` de **224 MB**. Thrashing garantizado y desalojo del working set del resto del sistema.
- Con índice en `liquidacion_id`: ~4 buffers por query ⇒ `476 × 4` ≈ **1.900**. **Factor 260×.**

`auditoria`: 5,2 MB / 3.714 filas hoy → ~60 MB / 45.000 filas a 10 clubes. `auditoria.html` hace `.eq('club_id')` + `.order('created_at' DESC)` + `range()` — sin índice que sirva, es seq scan + sort de la tabla entera por página de resultados.

### Impacto del wrap, tabla por tabla

| Tabla | Filas proyectadas escaneadas por request típico | Grupo A hoy (buffers) | Grupo A con wrap | Ahorro |
|---|---|---|---|---|
| `inscripciones` | 125–150 | ~3.700 | ~25 | **99%** |
| `resultado_posiciones` | 81–110 | ~2.700 | ~25 | **99%** |
| `carreras` | 11–12 | ~300 | ~25 | 92% |
| `liquidacion_detalle` | 200–400 | ~10.000 | ~25 | **99%** |
| `spcs` (catálogo completo) | 3.000 | policy `true`, 0 | 0 | — |
| `usuarios` (login) | 1 | ~25 | ~25 | — |

*(Buffers del Grupo A estimados a 1.580 usuarios: ~25 buffers por par de llamadas × filas.)*

El Grupo B queda intacto con el wrap: sigue costando 4,95–15,5 buffers/fila. Para eliminarlo hacen falta las dos opciones de 3.2/R2b.

## 3.2 Índices faltantes — propuesta (NO aplicada)

### Prioridad 1 — bloquea la operación a escala

```sql
-- (1) EL índice. liquidacion_detalle: 1.861 seq scans vs 8 index scans.
--     Cubre el FK liquidacion_detalle_liquidacion_id_fkey y las 476 queries/corrida del engine.
CREATE INDEX CONCURRENTLY idx_liqdet_liquidacion
  ON public.liquidacion_detalle (liquidacion_id);

-- (2) usuarios por email: lo consultan fn_get_user_club_id() y fn_is_super_admin(),
--     que hoy corren UNA VEZ POR FILA de cada query del sistema.
--     El UNIQUE (club_id,email) existente no sirve: email no es columna líder.
CREATE UNIQUE INDEX CONCURRENTLY ux_usuarios_email
  ON public.usuarios (email);

-- (3) liquidaciones por reunión+club: el engine hace .eq('reunion_id').eq('club_id')
--     y liquidaciones.html filtra por reunión. Hoy la tabla solo tiene PK. 2.730 seq scans.
CREATE INDEX CONCURRENTLY idx_liquidaciones_reunion_club
  ON public.liquidaciones (reunion_id, club_id);
```

### Prioridad 2 — filtros reales del frontend

```sql
-- inscripciones: programa.html, programa-oficial*.html, carta-llamados.html y el engine
-- filtran carrera_id + estado. Hoy solo (carrera_id) => 44 filas descartadas por Filter en R6.
CREATE INDEX CONCURRENTLY idx_inscripciones_carrera_estado
  ON public.inscripciones (carrera_id, estado);

-- performances: programa.html hace .in('spc_id', …).order('fecha_carrera', desc)
-- y se queda con las 5 más recientes por SPC. Compuesto pedido explícitamente.
-- A 30–60k filas/año el índice simple (spc_id) obliga a sort.
CREATE INDEX CONCURRENTLY idx_performances_spc_fecha
  ON public.performances (spc_id, fecha_carrera DESC);

-- auditoria: auditoria.html hace .eq('club_id') + order created_at DESC + range().
CREATE INDEX CONCURRENTLY idx_auditoria_club_fecha
  ON public.auditoria (club_id, created_at DESC);

-- resultado_posiciones por inscripción: la usa la RLS (fn_club_de_inscripcion) y el borrado
-- previo a borrar inscripciones (GOTCHA #12). FK sin cobertura.
CREATE INDEX CONCURRENTLY idx_respos_inscripcion
  ON public.resultado_posiciones (inscripcion_id);

-- liquidacion_detalle por reunión y por carrera: Fase 5 (Resumen) y el filtro por carrera de Pagos.
CREATE INDEX CONCURRENTLY idx_liqdet_reunion
  ON public.liquidacion_detalle (reunion_id);
CREATE INDEX CONCURRENTLY idx_liqdet_carrera
  ON public.liquidacion_detalle (carrera_id);
```

### Prioridad 3 — compuestos multi-tenant `(club_id, estado)`

Estos índices **hoy no rinden** (1 club, policies `true` en varias de estas tablas — por eso el advisor marca `idx_spcs_club`/`idx_profesionales_club`/`idx_propietarios_club` como no usados). A 10 clubes con las policies cerradas pasan a ser el camino de acceso principal. Aplicar **junto con** el cierre de policies, no antes.

```sql
CREATE INDEX CONCURRENTLY idx_spcs_club_estado          ON public.spcs (club_id, estado);
CREATE INDEX CONCURRENTLY idx_profesionales_club_activo ON public.profesionales (club_id, activo);
CREATE INDEX CONCURRENTLY idx_propietarios_club_estado  ON public.propietarios (club_id, estado);
CREATE INDEX CONCURRENTLY idx_caballerizas_club_activo  ON public.caballerizas (club_id, activo);
CREATE INDEX CONCURRENTLY idx_sanciones_club_estado     ON public.sanciones (club_id, estado);
CREATE INDEX CONCURRENTLY idx_reuniones_club_estado     ON public.reuniones (club_id, estado);
```

Nota: verificar que las columnas `estado`/`activo` existan con esos nombres en cada tabla antes de aplicar; en esta auditoría se cruzaron los filtros del frontend, no los tipos exactos de cada columna.

### Prioridad 4 — FKs sin cobertura, bajo impacto hoy

50 FKs sin índice según el advisor. Solo importan cuando se borra la fila padre (Postgres hace seq scan del hijo para chequear la FK). Las relevantes por volumen proyectado:

```sql
CREATE INDEX CONCURRENTLY idx_auditoria_usuario     ON public.auditoria (usuario_id);
CREATE INDEX CONCURRENTLY idx_liqdet_inscripcion    ON public.liquidacion_detalle (inscripcion_id);
CREATE INDEX CONCURRENTLY idx_perf_carrera          ON public.performances (carrera_id);
CREATE INDEX CONCURRENTLY idx_perf_jockey           ON public.performances (jockey_id);
CREATE INDEX CONCURRENTLY idx_insc_jockey_titular   ON public.inscripciones (jockey_titular_id);
CREATE INDEX CONCURRENTLY idx_insc_entrenador       ON public.inscripciones (entrenador_id);
CREATE INDEX CONCURRENTLY idx_insc_propietario      ON public.inscripciones (propietario_id);
CREATE INDEX CONCURRENTLY idx_insc_caballeriza      ON public.inscripciones (caballeriza_id);
CREATE INDEX CONCURRENTLY idx_carreras_categoria    ON public.carreras (categoria_id);
CREATE INDEX CONCURRENTLY idx_recibos_propietario   ON public.recibos (propietario_id);
CREATE INDEX CONCURRENTLY idx_recibos_profesional   ON public.recibos (profesional_id);
```

El resto (`*_creado_por`, `*_aprobado_por`, `*_oficializado_por`, `*_emitido_por`, `sso_*`, config) son de volumen bajo y no justifican el costo de escritura.

### Higiene de estadísticas — no es índice pero rinde igual

```sql
ANALYZE public.spcs;
ANALYZE public.reuniones;
ANALYZE public.usuarios;
ANALYZE public.propietarios;
ANALYZE public.profesionales;
ANALYZE public.caballerizas;
```

Seis tablas con `last_autoanalyze = NULL` y `n_live_tup = 0` teniendo datos. El planner elige planes a ciegas — ya se ve en (a) (`rows=4` vs 11) y en el `Seq Scan on carreras` de la variante C. A 10 clubes conviene además bajar `autovacuum_analyze_scale_factor` en las tablas calientes:

```sql
ALTER TABLE public.inscripciones       SET (autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.liquidacion_detalle SET (autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.auditoria           SET (autovacuum_analyze_scale_factor = 0.02);
```

## 3.3 Caché — candidatos evaluados

### (a) Programa oficial de reunión oficializada → **SÍ, es el mejor candidato**

**Por qué sí:** una vez `resultados.estado = 'oficial'` en todas las carreras y la reunión pasa a `confirmada`, el contenido es inmutable por definición del negocio. Hoy `programa-oficial.html` dispara **11 queries** (`reuniones`, `clubs`, `carreras`, `inscripciones`, `spcs`, `profesionales`, `propietarios`, `caballerizas`, `categorias_carrera`, `carrera_apuestas`, + una segunda a `reuniones`), varias de ellas con RLS correlacionada, para renderizar un documento que no va a cambiar nunca más.

**Hallazgo que cambia el diseño:** `programa-oficial.html` **no tiene `initAuth()`** — no hay ninguna llamada a `getSession`/`signIn`/`getUser` en el archivo. Funciona sólo porque supabase-js persiste la sesión en `localStorage` del mismo origen (GitHub Pages), así que el usuario logueado en `programa.html` la arrastra. **Para un visitante anónimo la página devuelve cero filas en todas las tablas** — verificado: `SET LOCAL ROLE anon` da 0 en `carreras`, `inscripciones`, `spcs`, `reuniones`, `performances`, porque las 108 policies son `{authenticated}` y `anon` no tiene ninguna.

Es decir: **el "pico de lecturas anónimas simultáneas el día de carrera" hoy no puede ocurrir — la página pública no es pública.** Eso es a la vez un bug de producto y una oportunidad: el camino correcto no es abrir policies para `anon` (agregaría carga RLS sobre el pico), sino **pre-renderizar**.

**Recomendación:** al oficializar la última carrera de una reunión, generar un artefacto estático (JSON o HTML) y servirlo con `Cache-Control: public, max-age=31536000, immutable`. Dos variantes:
- **Barata:** Edge Function `programa-oficial-json` con `Cache-Control` largo, que lee con service key (bypass RLS) y cachea en el CDN de Supabase. Cero cambios de policy.
- **Más barata todavía:** volcar el JSON a un archivo en el repo/Storage al oficializar. Cero cómputo en el pico. Encaja con el stack sin build.

Con cualquiera de las dos, el pico de lecturas anónimas cuesta **0 queries a Postgres**.

### (b) Catálogos (`spcs`, `profesionales`, `categorias_carrera`) en el cliente → **SÍ, con matices**

**Por qué sí:** `programa.html:197` hace `sb.from('spcs').select('id,nombre,sexo,color,fecha_nacimiento,padrillo_nombre,madre_nombre').order('nombre')` **sin ningún filtro** — trae el catálogo completo. Hoy son 144 filas; a 3.000 SPCs son ~3.000 filas × ~7 columnas en cada carga de página, y `spcs` aparece en 58 sitios del frontend entre las tres tablas.

`inscripciones.html:329` hace lo mismo filtrando sólo `estado='activo'`.

**Matiz importante:** `spcs` tiene policy `qual = true`, así que **no** paga RLS. El costo es de transferencia y de parseo en el cliente, no de CPU en Postgres. Por eso es un candidato bueno pero no urgente.

**Recomendación:** `localStorage` con TTL corto (5–15 min) + invalidación por `updated_at` máximo. Patrón: guardar `{data, fetchedAt, maxUpdatedAt}`, y en cada carga pedir sólo `SELECT max(updated_at) FROM spcs` (1 fila) para decidir si revalidar. `categorias_carrera` (4 filas por club, prácticamente estáticas) se puede cachear agresivo.

**Contraindicación:** no cachear `inscripciones`, `carreras`, `resultados` ni `liquidacion_detalle` — mutan durante la operación y un cache stale en ratificación o en el marcador es un error de negocio, no de performance.

### (c) Respuesta de `reunion-json` para Diego → **SÍ, condicional al estado de la reunión**

`supabase/functions/reunion-json/index.ts` hace 5 queries (`reuniones`, `hipodromos`, `carreras`, `resultados`, `inscripciones`, `resultado_posiciones`) y devuelve `content-type: application/json` **sin ningún header de cache**.

**Recomendación:** cachear condicionado al estado:
- reunión `confirmada` / carreras `oficial` → `Cache-Control: public, max-age=86400, immutable` + `ETag`.
- reunión `borrador` / `publicada` → `Cache-Control: no-store` (el programa todavía se mueve).

Un consumidor externo que poletea es exactamente el caso donde un `ETag` + `304` elimina el 100% del costo de DB sin cambiar el contrato. Se cruza con ISSUE-033 (redeploy pendiente + acordar `tipo_carrera` con Diego): conviene meter el cache en ese mismo redeploy.

### (d) Resultado de `fn_get_user_club_id()` / `fn_is_super_admin()` → **NO cachear, wrappear**

Tentación natural, pero el wrap `(SELECT fn())` ya da caching por-query gratis, sin invalidación que mantener. Cachear el `club_id` en el cliente o en un claim de JWT introduce un riesgo de seguridad (un `club_id` stale tras un cambio de club por super_admin ⇒ acceso cruzado). Descartado.

## 3.4 Procesos asincrónicos — candidatos evaluados

### (a) `generarLiquidaciones` → **NO a "async", SÍ a "RPC server-side"**

**Lo que hace hoy** (`liquidaciones-engine.js`, `generarLiquidacionesReunion`):
1. 7 lecturas iniciales (`liquidacion_config`, `carreras`, `comision_config`, `reuniones`, `resultados`, `inscripciones`, `resultado_posiciones`).
2. 1 lectura de headers existentes + 1 `DELETE` masivo de líneas no comprometidas.
3. Bucle por actor: `INSERT liquidaciones` (1 round trip) + `INSERT liquidacion_detalle` (1 round trip).
4. **Bucle por header superviviente: `count` + `SELECT monto_bruto,monto_descuento` + `UPDATE liquidaciones` = 3 round trips por header.**

Con R6 (79 headers): paso 4 son **237 round trips**. Total ≈ **330 round trips por recálculo de una reunión**, todos desde el browser, cada uno pagando RLS. Confirma exactamente el perfil de `pg_stat_statements` (476 selects, 464 inserts, 315 updates, 160 deletes, 128 inserts de header).

**Diagnóstico:** el problema **no es que sea síncrono** — nadie más está esperando, es un botón que aprieta el secretario. El problema es que son **330 viajes de red con RLS** en lugar de 1. A ~60–90 ms de RTT desde Argentina, son **20–30 segundos de latencia dominada por red**, y a 36.000 filas en `liquidacion_detalle` cada uno de esos viajes cuesta un seq scan de 1.055 páginas.

**Recomendación: convertirlo en un RPC `SECURITY DEFINER`**, como ya se hizo con `aplicar_resultado`, `emitir_recibo`, `liberar_linea` y `desoficializar_carrera`. Beneficios acumulados:
- 330 round trips → **1**.
- Los pasos 3 y 4 se vuelven `INSERT … SELECT` y un solo `UPDATE … FROM (SELECT … GROUP BY liquidacion_id)`: se elimina el bucle entero.
- RLS se evalúa una vez en la frontera del RPC, no 330 veces.
- **Atomicidad**: hoy si el browser se cierra en el medio del bucle, la reunión queda con headers sin líneas y totales inconsistentes. Eso es un riesgo de corrección, no de performance.

**Volumen:** 240 reuniones/año a 10 clubes = **menos de 1 recálculo por día en promedio**, y nunca concurrentes entre clubes (cada uno corre después de su reunión). **No justifica cola ni cron.** Un RPC sincrónico de <1 s resuelve el caso completo. Meter Edge Function + cola sería sobre-ingeniería.

### (b) Cálculo de `ult_performances` → **SÍ, job asincrónico — pero recién cuando `performances` tenga datos**

`spcs.ult_performances` ya existe como columna (la leen `programa-oficial.html:166` y `programa-oficial-color.html:326`). Es la denormalización correcta: evita el `IN (spc_id)` + `ORDER BY fecha_carrera DESC` + top-5-por-SPC que hoy `programa.html:268` hace **en JavaScript** después de traerse *todas* las performances de todos los SPCs de la reunión.

A 60.000 filas/año esa query trae miles de filas para descartar el 90% en el cliente.

**Recomendación:** recalcular `ult_performances` para los SPCs afectados **al oficializar una carrera**, dentro del mismo RPC que ya escribe `performances` (`resultados.html:1520-1521`). Es un `UPDATE spcs SET ult_performances = (…lateral top 5…) WHERE id = ANY(spcs_de_la_carrera)`. Toca ~12 SPCs por carrera.

**Por qué "job" y no inline:** si se prefiere no alargar el RPC de oficialización, alcanza con un `pg_cron` cada 15 min que procese una cola de SPCs sucios. Pero dado el volumen (12 SPCs × 2.400 carreras/año), **inline en el RPC es más simple y suficiente**. Cron sólo si aparece un backfill masivo.

### (c) Purga de `auditoria` → **SÍ, cron**

`fn_purgar_auditoria()` ya existe y respeta `clubs.auditoria_retencion_meses`. **No hay evidencia de que esté agendada.** A 45.000 filas/año × 10 clubes, sin purga la tabla crece sin techo (ya es la más grande: 5,2 MB con 3.714 filas). Agendar con `pg_cron` mensual.

### (d) Pre-render del programa oficial → **SÍ, disparado por evento, no por cron**

Ver 3.3(a). El disparador natural es la oficialización de la última carrera, no un reloj.

## 3.5 Cuellos de botella del plan Free a 10 clubes

### Conexiones

`max_connections = 60`, repartidas entre PostgREST, GoTrue, Realtime, Storage, `pg_cron`, el pooler y cualquier sesión directa (MCP incluido). El pool efectivo de PostgREST en Free es una fracción de eso.

Proyección del pico del día de reunión con el portal de propietarios vivo (500–1.500 usuarios):
- Cada carga de `programa.html` son **~6 requests HTTP** a PostgREST, cada uno tomando una conexión del pool por la duración de la query.
- Con las queries actuales a ~8–20 ms cada una, una conexión sostiene ~50–125 req/s.
- 1.000 propietarios refrescando cada 30 s ≈ 33 req/s × 6 = **~200 req/s**. Está al filo, y eso asumiendo las queries de hoy — no las de 3.000 SPCs y 1.580 usuarios sin wrap.
- **Sin el wrap de RLS, ese mismo pico multiplica el tiempo por query y satura el pool.**

### Compute

`shared_buffers = 224 MB` con el dataset proyectado (`liquidacion_detalle` ~8,6 MB + `auditoria` ~60 MB + `performances` ~30 MB + índices) todavía entra en RAM. **Lo que no entra es el tráfico de buffers**: los 3,9 GB por recálculo de liquidaciones calculados en 3.1 desalojan el working set entero y dejan el resto del sistema leyendo de disco durante minutos. El índice de P1 elimina ese problema sin cambiar de plan.

`max_worker_processes = 6` y `jit = off`: no hay paralelismo real disponible. Todo plan que hoy dependa de un seq scan grande no va a escalar por hardware.

### Relación con ISSUE-032 (anti-pausa Free: Pro vs cron)

La auditoría le da datos concretos a esa decisión pendiente:

- **El cron anti-pausa NO resuelve nada de lo que este informe encontró.** Evita la pausa por inactividad (que ya pasó el 2026-07-07) y nada más. Sigue dejando 60 conexiones, 224 MB de `shared_buffers`, sin réplicas, sin PITR y sin métricas.
- **Pro tampoco resuelve nada de lo que este informe encontró**, si no se aplican el índice y el wrap. Un compute más grande absorbe el desperdicio; no lo elimina.
- **El orden correcto es: primero R1 y R2a (costo casi cero, ganancia de 1–2 órdenes de magnitud), después medir, y recién ahí decidir Pro.** Es perfectamente posible que con R1+R2a+R3 la carga proyectada de 10 clubes entre cómoda en Free — salvo por la pausa por inactividad, que a 10 clubes activos deja de ser un problema por sí sola (siempre va a haber tráfico).
- **Lo que sí justifica Pro con independencia de performance:** PITR y backups diarios. A 10 clubes con dinero real en `liquidaciones`/`recibos`, perder datos no es una opción. Ese es el argumento fuerte para Pro, no el CPU.

**Recomendación para ISSUE-032:** cerrarlo como "Pro, por PITR y backups — no por performance", y ejecutar R1/R2a antes de dimensionar el compute.

---

# Tabla de hallazgos

| # | Hallazgo | Severidad | Evidencia | Proyección a 10 clubes |
|---|---|---|---|---|
| H1 | `liquidacion_detalle` sin índice en `liquidacion_id`; 1.861 seq scans vs 8 index scans | 🔴 Crítica | Fase 1.2/1.3; plan (d): `Seq Scan`, 1.345 buffers, 19,4 ms | 476 queries × 1.055 páginas = **3,9 GB de tráfico de buffer por recálculo**, con `shared_buffers` de 224 MB |
| H2 | Las **108** policies llaman `fn_*()` sin el wrap `(SELECT fn_*())` | 🔴 Crítica | Fase 1.6 (dump completo); A/B: 986→907 buffers, 5,1→3,4 ms | Con 1.580 usuarios el término del Grupo A pasa de ~2,9 a ~25 buffers/fila; en `inscripciones` eso es **~3.700 buffers/request → ~25 con wrap** |
| H3 | 11 tablas con RLS **correlacionada** (`fn_club_de_X(columna)`) — el wrap no la arregla | 🔴 Crítica | Fase 1.6 Grupo B; plan (e): 15,5 buffers/fila | Costo lineal en filas, imposible de indexar. Variante C del A/B: 986→329 buffers (−67%) |
| H4 | `usuarios` sin índice con `email` como columna líder; lo consultan las 2 funciones que corren **por fila** | 🔴 Crítica | Plan (f): `Index Cond` sobre `usuarios_club_id_email_key` (líder `club_id`) | A 1.580 usuarios: recorrido completo del índice **por fila de cada query del sistema** |
| H5 | `generarLiquidaciones`: ~330 round trips desde el browser, no atómico | 🟠 Alta | `liquidaciones-engine.js` pasos 3–4; `pg_stat_statements` top-6 completo | 20–30 s de latencia; corte a mitad ⇒ headers sin líneas y totales inconsistentes |
| H6 | 6 tablas con estadísticas nunca calculadas (`n_live_tup=0` con datos) | 🟠 Alta | Fase 1.5; plan (a) estima `rows=4`, real 11 | Planes cada vez peores a medida que crecen los datos |
| H7 | `liquidaciones` sin ningún índice salvo PK; 2.730 seq scans | 🟠 Alta | Fase 1.2/1.3 | ~19.000 headers/año, seq scan en cada filtro por reunión |
| H8 | `programa-oficial.html` no autentica y `anon` no tiene ninguna policy ⇒ la página "pública" devuelve 0 filas a un visitante | 🟠 Alta | `grep` sin `initAuth`; `SET LOCAL ROLE anon` ⇒ 0 en todas las tablas | El escenario de "pico anónimo" hoy no existe; abrir policies para `anon` sería la solución equivocada (ver R6) |
| H9 | `programa.html` trae el catálogo **completo** de `spcs` sin filtro | 🟡 Media | `programa.html:197` | 144 → 3.000 filas en cada carga de página |
| H10 | `performances` sin índice compuesto `(spc_id, fecha_carrera DESC)`; el top-5-por-SPC se hace en JS | 🟡 Media | `programa.html:268`; `idx_performances_fecha` marcado sin uso | 30–60k filas/año; se traen miles para descartar el 90% en el cliente |
| H11 | `auditoria` sin índice `(club_id, created_at)`; sin purga agendada | 🟡 Media | `auditoria.html:349-355`; `fn_purgar_auditoria()` existe pero sin evidencia de schedule | 5,2 MB → ~60 MB/año; seq scan + sort por página de resultados |
| H12 | `reunion-json` sin `Cache-Control` ni `ETag` | 🟡 Media | `supabase/functions/reunion-json/index.ts:33` | Cada polleo de Diego = 5 queries con RLS |
| H13 | `propietarios` y `profesionales` con policies `qual = true` siendo per-hipódromo | 🟡 Media (seguridad) | Fase 1.6 Grupo C | Lectura y escritura cruzada entre clubes. Cerrarlas agrega costo RLS ⇒ hacerlo con la forma de R2, no con `fn_club_de_X()` |
| H14 | El linter de Supabase detecta el problema de initPlan sólo en 2 de 108 policies | 🟡 Media (proceso) | `get_advisors(performance)` vs Fase 1.6 | No usar el advisor como métrica de cobertura de RLS |
| H15 | 50 FKs sin índice de cobertura | 🟢 Baja | `get_advisors` + query de `pg_constraint` | Sólo pesa al borrar filas padre |

---

# Recomendaciones rankeadas por impacto/esfuerzo

Ninguna está aplicada. Cada una incluye el cambio propuesto.

### R1 — Índice en `liquidacion_detalle(liquidacion_id)` · impacto 🔴 · esfuerzo trivial

Un solo `CREATE INDEX`. Ataca H1. Factor **260×** en el proceso más pesado del sistema.

```sql
CREATE INDEX CONCURRENTLY idx_liqdet_liquidacion
  ON public.liquidacion_detalle (liquidacion_id);
```

### R2a — Wrap `(SELECT fn())` en las 108 policies · impacto 🔴 · esfuerzo bajo (mecánico)

Ataca H2. Medido: −33% de tiempo hoy; ~99% del término del Grupo A a escala. Es una transformación puramente sintáctica, **no cambia la semántica de autorización**: la función es `STABLE`, el resultado por transacción es idéntico.

Patrón de la migración (una por policy; ejemplo en `inscripciones`):

```sql
ALTER POLICY inscripciones_select ON public.inscripciones
  USING (
    (SELECT fn_is_super_admin())
    OR fn_club_de_carrera(carrera_id) = (SELECT fn_get_user_club_id())
  );
```

Y para `usuarios`, que además llama `auth.jwt()` directo:

```sql
ALTER POLICY usuarios_select ON public.usuarios
  USING (
    (SELECT fn_is_super_admin())
    OR email::text = (SELECT auth.jwt() ->> 'email')
    OR club_id = (SELECT fn_get_user_club_id())
  );
```

Conviene generar las 108 sentencias con un script sobre `pg_policies` y revisarlas antes de aplicar. **Verificar con `EXPLAIN` que aparezcan los `InitPlan`** — es la única confirmación de que el wrap tomó efecto.

### R3 — Índices de Prioridad 1 restantes + `ANALYZE` · impacto 🔴 · esfuerzo trivial

Ataca H4, H6, H7.

```sql
CREATE UNIQUE INDEX CONCURRENTLY ux_usuarios_email ON public.usuarios (email);
CREATE INDEX CONCURRENTLY idx_liquidaciones_reunion_club ON public.liquidaciones (reunion_id, club_id);
ANALYZE public.spcs; ANALYZE public.reuniones; ANALYZE public.usuarios;
ANALYZE public.propietarios; ANALYZE public.profesionales; ANALYZE public.caballerizas;
```

Precondición de `ux_usuarios_email`: verificar que no haya emails duplicados entre clubes. Hoy el UNIQUE es `(club_id, email)`, así que el mismo email en dos clubes es legal. Si existe ese caso hay que decidir si es válido (probablemente no lo sea) antes de aplicar; alternativa no-unique: `CREATE INDEX CONCURRENTLY idx_usuarios_email ON public.usuarios (email);`.

### R4 — De-correlacionar la RLS del Grupo B · impacto 🔴 · esfuerzo alto

Ataca H3, el hallazgo con más techo (−67% de buffers medido) y el único que no se resuelve con un índice ni con el wrap. Dos caminos:

**Opción A — reescribir el predicado como `EXISTS` (variante C del A/B).** Sin cambios de schema. Medido: 986 → 329 buffers, 5,1 → 2,4 ms.

```sql
ALTER POLICY inscripciones_select ON public.inscripciones
  USING (
    (SELECT fn_is_super_admin())
    OR EXISTS (
      SELECT 1 FROM carreras c
      JOIN reuniones r ON r.id = c.reunion_id
      WHERE c.id = inscripciones.carrera_id
        AND r.club_id = (SELECT fn_get_user_club_id())
    )
  );
```

**Opción B — denormalizar `club_id` en las 11 tablas del Grupo B.** Más invasiva, mucho más rápida: convierte la RLS en una comparación de columna, indexable y evaluable sin ningún acceso adicional.

```sql
ALTER TABLE public.inscripciones ADD COLUMN club_id uuid REFERENCES public.clubs(id);
-- backfill + trigger BEFORE INSERT/UPDATE que lo derive de carrera_id
CREATE INDEX CONCURRENTLY idx_inscripciones_club_carrera
  ON public.inscripciones (club_id, carrera_id);

ALTER POLICY inscripciones_select ON public.inscripciones
  USING ((SELECT fn_is_super_admin()) OR club_id = (SELECT fn_get_user_club_id()));
```

**Recomendación:** empezar por la Opción A (reversible, sin migración de datos) en las 3 tablas más calientes (`inscripciones`, `resultado_posiciones`, `liquidacion_detalle`), medir, y sólo pasar a la Opción B si el número no alcanza. **No hacer R4 antes que R1/R2a/R3** — esos tres son mucho más baratos y hay que medir sobre la base ya corregida.

### R5 — `generarLiquidaciones` como RPC · impacto 🟠 · esfuerzo medio-alto

Ataca H5. 330 round trips → 1, más atomicidad. Sigue el patrón ya establecido en el repo (`aplicar_resultado`, `emitir_recibo`, `liberar_linea`, `desoficializar_carrera`), con su archivo en `migrations/`.

Forma propuesta:

```sql
CREATE OR REPLACE FUNCTION public.generar_liquidaciones_reunion(
  p_club_id uuid, p_reunion_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ … $$;
```

Los pasos 3 y 4 del engine se colapsan en:

```sql
-- paso 4 completo, sin bucle:
UPDATE liquidaciones l
   SET total_bruto = t.tb, total_descuentos = t.td
  FROM (SELECT liquidacion_id, sum(monto_bruto) tb, sum(monto_descuento) td
          FROM liquidacion_detalle GROUP BY liquidacion_id) t
 WHERE l.id = t.liquidacion_id AND l.reunion_id = p_reunion_id;
```

**Mantener `liquidaciones-engine.js`** como implementación de referencia hasta validar que el RPC produce líneas idénticas sobre R6 y R7 (comparación fila a fila), y agregar un probe en `tests/` siguiendo el patrón de `probe_recibos_emision.mjs`.

### R6 — Pre-render del programa oficial + `Cache-Control` en `reunion-json` · impacto 🟠 · esfuerzo medio

Ataca H8 y H12, y es lo único que resuelve de verdad el escenario de pico de lecturas del día de carrera.

- Al oficializar la última carrera, materializar el programa (JSON o HTML) y servirlo con `Cache-Control: public, max-age=31536000, immutable`.
- En `reunion-json`, agregar `ETag` + `Cache-Control` condicionado al estado (`immutable` si la reunión está confirmada, `no-store` si no). Aprovechar el redeploy ya pendiente de ISSUE-033.
- **No abrir policies para `anon`**: agregaría carga de RLS justo en el pico y ampliaría la superficie de exposición. El pre-render es estrictamente mejor.

### R7 — Índices de Prioridad 2 · impacto 🟡 · esfuerzo trivial

Ataca H10, H11 y parte de H9. Ver DDL completo en 3.2.

### R8 — Caché de catálogos en el cliente · impacto 🟡 · esfuerzo bajo

Ataca H9. `localStorage` + TTL 5–15 min + revalidación por `max(updated_at)`. Aplicar a `spcs`, `profesionales`, `categorias_carrera`. **No** aplicar a datos operativos (`inscripciones`, `carreras`, `resultados`, `liquidacion_detalle`).

### R9 — Job de `ult_performances` + cron de purga de `auditoria` · impacto 🟡 · esfuerzo bajo

Ataca H10 y H11. Recalcular `spcs.ult_performances` inline dentro del RPC de oficialización (~12 SPCs por carrera; no justifica cola). Agendar `fn_purgar_auditoria()` mensual con `pg_cron`.

### R10 — Cerrar policies de `propietarios` y `profesionales` · impacto 🟡 (seguridad) · esfuerzo bajo

Ataca H13. Ambas tienen `club_id` propio, así que se cierran con la forma barata directamente, sin pasar por `fn_club_de_X()`:

```sql
ALTER POLICY propietarios_select ON public.propietarios
  USING ((SELECT fn_is_super_admin()) OR club_id = (SELECT fn_get_user_club_id()));
```

Hacerlo **junto con** los índices de Prioridad 3, que hoy figuran como no usados precisamente porque estas policies están abiertas.

### R11 — Índices de FK de Prioridad 4 · impacto 🟢 · esfuerzo trivial

Ataca H15. Baja prioridad: sólo pesan al borrar filas padre.

---

## Orden de ejecución sugerido

1. **R1 + R3** — un solo `CREATE INDEX` + dos más + `ANALYZE`. Minutos de trabajo, 1–2 órdenes de magnitud de ganancia. Medir después.
2. **R2a** — wrap de las 108 policies. Mecánico, verificable con `EXPLAIN` (buscar `InitPlan`).
3. **R7 + R11** — el resto de los índices.
4. **Medir de nuevo.** Repetir los EXPLAIN de Fase 2 y comparar contra esta línea de base. Recién acá decidir sobre ISSUE-032 (Pro vs Free).
5. **R5** — RPC de liquidaciones, con probe de equivalencia.
6. **R6** — pre-render + cache de `reunion-json` (aprovechar ISSUE-033).
7. **R4** — de-correlación de RLS, Opción A sobre las 3 tablas calientes, medir, evaluar Opción B.
8. **R8, R9, R10** — en paralelo, sin dependencias.

---

## Notas metodológicas y límites de esta auditoría

- **Todo el análisis fue read-only.** Sólo `SELECT` y `EXPLAIN`. Los `SET LOCAL` usados para simular el rol `authenticated` tienen alcance transaccional y se descartan al terminar la sentencia. No se aplicó ninguna migración, no se creó ningún índice, no se modificó ninguna policy.
- **Desviación respecto de la consigna:** `usuarios` no tiene columna `auth_id`, así que el claim `sub` no participa de la autorización. Las policies resuelven por `email`. Se seteó `sub` = `usuarios.id` como proxy y el claim que efectivamente gobierna los planes es `email`.
- Los `EXPLAIN` corrieron con `ROLLBACK` implícito (transacción implícita de sentencia múltiple) en lugar de `BEGIN … ROLLBACK` explícito, porque el transporte MCP devuelve sólo el resultado de la última sentencia. El efecto sobre el aislamiento es equivalente: nada se persistió.
- Los **buffers están todos calientes** (`shared hit`, cero `read`). En producción fría los números son peores, no mejores.
- Las proyecciones de tamaño usan el ancho de fila observado en los planes (`width=`) y el volumen del escenario dado. Son estimaciones de orden de magnitud, no predicciones exactas.
- El costo del Grupo A a 1.580 usuarios está **extrapolado**, no medido: hoy hay 3 usuarios y no es posible medirlo sin cargar datos (prohibido en esta auditoría). El razonamiento es estructural: sin índice líder por `email`, el lookup recorre el índice completo, y ese recorrido crece con el número de usuarios.
- No se auditó: Realtime, Storage, tamaño de payload de PostgREST, ni el costo de los triggers de auditoría (`fn_auditoria_log` corre en cada INSERT/UPDATE/DELETE y escribe una fila con dos `to_jsonb` de la fila completa — candidato a una auditoría propia).
