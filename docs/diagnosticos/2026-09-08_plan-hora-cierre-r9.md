# PLAN — corregir la hora de cierre de inscripción de R9 (09:00 → 12:00 AR)

**Fecha:** 2026-09-08
**Estado:** **PLAN. NO EJECUTADO.** Todo lo de abajo es solo lectura salvo el §4, que espera OK.
**Pedido:** Yesi fijó el criterio el 26/08 — viernes 12:00. Los once turnos de R9 quedaron en
09:00. Yesi ya está avisada de que la corrección la hago yo.
**SHA de `main`:** `79821ae01a9b8e8768ae698b967462d00baa71a0`
**SHA de este informe:** ver §8.

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) FROM spcs;      -- por MCP, proyecto unlhcuanfrtpatoipwve
[{"spcs":181}]

ref del proyecto: unlhcuanfrtpatoipwve
```

## Resumen ejecutivo

| | |
|---|---|
| Filas a tocar | **11** (los once turnos de R9), una sola columna |
| Valor actual | `2026-09-11 12:00:00+00` = **09:00 AR** en los once |
| Valor a escribir | `2026-09-11 15:00:00+00` = **12:00 AR**, viernes |
| Corrimiento | **+3 h hacia adelante** |
| Inscripciones existentes | **3** (T1 ×2, T11 ×1), todas `inscripto`, todas por portal |
| ¿Las afecta? | **No.** Correr el cierre hacia adelante sólo ensancha la ventana |
| Jobs / cron | **No hay.** `pg_cron` y `pg_net` no están instalados |
| Triggers | 1, de auditoría — deja rastro, no valida nada |
| Rollback | un `UPDATE` simétrico, exacto (los once comparten valor) |

⚠️ **Hay un hallazgo que cambia el alcance: el UPDATE solo no alcanza.** La UI que carga esa
hora tiene un bug de zona que va a volver a romperla la próxima vez que alguien edite el turno.
Está en el §3.3 y hay que decidirlo antes de ejecutar.

---

## 1. Los once turnos — crudo y en hora argentina

```sql
SELECT c.numero_turno,
       c.apertura_inscripcion AS apertura_raw,
       c.apertura_inscripcion AT TIME ZONE 'America/Argentina/Buenos_Aires' AS apertura_ar,
       c.cierre_inscripcion AS cierre_raw,
       c.cierre_inscripcion AT TIME ZONE 'America/Argentina/Buenos_Aires' AS cierre_ar,
       to_char(c.cierre_inscripcion AT TIME ZONE 'America/Argentina/Buenos_Aires', 'TMDay HH24:MI') AS cierre_ar_legible,
       c.apertura_ratificacion, c.cierre_ratificacion,
       c.estado AS estado_carrera, c.id
FROM reuniones r JOIN carreras c ON c.reunion_id = r.id
WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9
ORDER BY c.numero_turno;
```

| T | apertura_raw (UTC) | apertura AR | **cierre_raw (UTC)** | **cierre AR** | legible | estado | id |
|---|---|---|---|---|---|---|---|
| 1 | `2026-08-24 00:00:00+00` | `2026-08-23 21:00` | `2026-09-11 12:00:00+00` | **`2026-09-11 09:00`** | Friday 09:00 | abierta | `c037b139-b8b5-46d7-900e-cbc7a01bd643` |
| 2 | `2026-08-28 00:00:00+00` | `2026-08-27 21:00` | `2026-09-11 12:00:00+00` | **`2026-09-11 09:00`** | Friday 09:00 | abierta | `2d4016ad-460a-44c9-9b2d-d710a510edee` |
| 3 | `2026-08-28 00:00:00+00` | `2026-08-27 21:00` | `2026-09-11 12:00:00+00` | **`2026-09-11 09:00`** | Friday 09:00 | abierta | `7250cda2-4b1b-40f5-80ed-54121745241b` |
| 4 | `2026-08-28 00:00:00+00` | `2026-08-27 21:00` | `2026-09-11 12:00:00+00` | **`2026-09-11 09:00`** | Friday 09:00 | abierta | `fbf0de67-875f-4dbd-834c-60503d2d6f2f` |
| 5 | `2026-08-28 00:00:00+00` | `2026-08-27 21:00` | `2026-09-11 12:00:00+00` | **`2026-09-11 09:00`** | Friday 09:00 | abierta | `9733113c-8c80-40eb-80b4-6f741abf125c` |
| 6 | `2026-08-28 00:00:00+00` | `2026-08-27 21:00` | `2026-09-11 12:00:00+00` | **`2026-09-11 09:00`** | Friday 09:00 | abierta | `7da3fa1c-a32a-42dc-ad2f-6b10e86cba22` |
| 7 | `2026-08-28 00:00:00+00` | `2026-08-27 21:00` | `2026-09-11 12:00:00+00` | **`2026-09-11 09:00`** | Friday 09:00 | abierta | `3b553ea4-1052-4411-933b-156e6676dfc0` |
| 8 | `2026-08-28 00:00:00+00` | `2026-08-27 21:00` | `2026-09-11 12:00:00+00` | **`2026-09-11 09:00`** | Friday 09:00 | abierta | `bae8008f-87fc-479e-a416-27502c7489b3` |
| 9 | `2026-08-28 00:00:00+00` | `2026-08-27 21:00` | `2026-09-11 12:00:00+00` | **`2026-09-11 09:00`** | Friday 09:00 | abierta | `5cd5d00e-c844-467d-925f-83b378863af5` |
| 10 | `2026-08-28 00:00:00+00` | `2026-08-27 21:00` | `2026-09-11 12:00:00+00` | **`2026-09-11 09:00`** | Friday 09:00 | abierta | `099b050d-b7e5-412c-b789-55dae7d5cd13` |
| 11 | `2026-08-28 00:00:00+00` | `2026-08-27 21:00` | `2026-09-11 12:00:00+00` | **`2026-09-11 09:00`** | Friday 09:00 | abierta | `0bf74c72-9300-4406-8949-d81705da0c23` |

Los cuatro campos de ratificación son idénticos en los once:
`apertura_ratificacion = 2026-09-14 00:00:00+00`, `cierre_ratificacion = 2026-09-14 12:00:00+00`.

**Confirmado: los once están en 09:00 AR.** Sin excepciones, sin nulos, todos `estado = 'abierta'`.

Y confirmado que el 11/09/2026 es viernes:

```sql
SELECT to_char(DATE '2026-09-11','TMDay') AS dia, extract(isodow FROM DATE '2026-09-11') AS isodow;
-- [{"dia":"Friday","isodow":"5"}]
```

### 1.1 Dos cosas más que salieron del mismo relevamiento (NO están en este cambio)

- **La apertura tiene el mismo defecto.** `2026-08-28 00:00:00+00` es **27/08 21:00 AR**, no el
  28 a las 00:00. Los once abrieron tres horas antes del día que dice la carta. Ya pasó, no
  cambia nada retroactivo, pero el criterio vale para la próxima reunión.
- **El cierre de ratificación también: `2026-09-14 12:00:00+00` = lunes 09:00 AR.** Si el
  criterio de Yesi para ratificación también es 12:00, hay que corregirlo igual. **No sé cuál es
  el criterio de ratificación y no lo voy a asumir** — está en §7.

Ninguno de los dos entra en el UPDATE del §4, que toca **sólo `cierre_inscripcion`**.

---

## 2. Tipo de la columna y el valor exacto a escribir

```sql
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='carreras'
  AND column_name IN ('apertura_inscripcion','cierre_inscripcion','apertura_ratificacion','cierre_ratificacion','hora_estimada');
```

```json
[{"column_name":"hora_estimada","data_type":"time without time zone","udt_name":"time","is_nullable":"YES","column_default":null},
 {"column_name":"apertura_inscripcion","data_type":"timestamp with time zone","udt_name":"timestamptz","is_nullable":"YES","column_default":null},
 {"column_name":"cierre_inscripcion","data_type":"timestamp with time zone","udt_name":"timestamptz","is_nullable":"YES","column_default":null},
 {"column_name":"apertura_ratificacion","data_type":"timestamp with time zone","udt_name":"timestamptz","is_nullable":"YES","column_default":null},
 {"column_name":"cierre_ratificacion","data_type":"timestamp with time zone","udt_name":"timestamptz","is_nullable":"YES","column_default":null}]
```

**`cierre_inscripcion` es `timestamptz`.** Guarda un instante absoluto; lo que se ve depende de
la zona con que se lo lea.

### 2.1 La trampa, y por qué NO se escribe un literal pelado

La sesión de la base está en **UTC**:

```sql
SELECT current_setting('TimeZone') AS tz_sesion, now() AS ahora_raw,
       now() AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ahora_ar;
-- [{"tz_sesion":"UTC","ahora_raw":"2026-09-08 01:37:58.179935+00","ahora_ar":"2026-09-07 22:37:58.179935"}]
```

Entonces un `'2026-09-11 12:00:00'` a secas se interpreta como **12:00 UTC = 09:00 AR** — que es
exactamente el bug que estamos arreglando. Escribir eso sería reescribir el mismo error.

**El valor va con la zona explícita:**

```sql
TIMESTAMP '2026-09-11 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires'
```

### 2.2 El valor exacto y su relectura

```sql
SELECT (TIMESTAMP '2026-09-11 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires') AS objetivo_utc,
       (TIMESTAMP '2026-09-11 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires')
         AT TIME ZONE 'America/Argentina/Buenos_Aires' AS objetivo_relectura_ar;
-- [{"objetivo_utc":"2026-09-11 15:00:00+00","objetivo_relectura_ar":"2026-09-11 12:00:00"}]
```

| | |
|---|---|
| **Lo que se escribe (crudo, como lo guarda Postgres)** | **`2026-09-11 15:00:00+00`** |
| **Cómo se relee en hora argentina** | **`2026-09-11 12:00:00`** ← viernes 12:00 AR ✅ |
| Lo que NO hay que escribir | `2026-09-11 12:00:00+00` (eso es 09:00 AR, el bug actual) |

Argentina es **UTC−3 todo el año** (no tiene horario de verano desde 2009), así que el offset no
depende de la fecha.

### 2.3 Simulación fila por fila — SELECT puro, no escribe nada

```sql
SELECT c.numero_turno,
       c.cierre_inscripcion AS actual_raw,
       c.cierre_inscripcion AT TIME ZONE 'America/Argentina/Buenos_Aires' AS actual_ar,
       (TIMESTAMP '2026-09-11 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires') AS nuevo_raw,
       (TIMESTAMP '2026-09-11 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires')
         AT TIME ZONE 'America/Argentina/Buenos_Aires' AS nuevo_ar,
       to_char((TIMESTAMP '2026-09-11 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires')
         AT TIME ZONE 'America/Argentina/Buenos_Aires', 'TMDay DD/MM HH24:MI') AS nuevo_ar_legible,
       (TIMESTAMP '2026-09-11 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires') - c.cierre_inscripcion AS delta,
       (TIMESTAMP '2026-09-11 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires') > now() AS queda_en_el_futuro,
       (TIMESTAMP '2026-09-11 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires') > c.apertura_inscripcion AS cierre_posterior_a_apertura,
       (TIMESTAMP '2026-09-11 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires') < c.apertura_ratificacion AS cierre_anterior_a_ratificacion
FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9
ORDER BY c.numero_turno;
```

Los once dan idéntico:

| T | actual_raw | actual_ar | **nuevo_raw** | **nuevo_ar** | legible | delta | futuro | > apertura | < ratificación |
|---|---|---|---|---|---|---|---|---|---|
| 1-11 | `2026-09-11 12:00:00+00` | `09:00` | **`2026-09-11 15:00:00+00`** | **`12:00`** | Friday 11/09 12:00 | `03:00:00` | ✅ | ✅ | ✅ |

Los tres invariantes se cumplen en los once: el cierre nuevo **queda en el futuro** (faltan
~3 días), sigue siendo **posterior a la apertura**, y sigue siendo **anterior a la apertura de
ratificación** (14/09). No se cruza ninguna ventana.

---

## 3. ¿Algo más depende de esa hora?

### 3.1 Jobs programados — no hay

```sql
SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') AS pg_cron_instalado,
       EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_net')  AS pg_net_instalado;
-- [{"pg_cron_instalado":false,"pg_net_instalado":false}]
```

**Ninguna de las dos extensiones está instalada.** No hay cron, no hay webhook saliente, no hay
nada que se dispare a las 09:00 ni a las 12:00. El cierre es **pasivo**: se evalúa cuando alguien
intenta inscribirse, no hay un proceso que "cierre" la carrera.

### 3.2 Triggers, funciones, policies, constraints, vistas

```sql
SELECT t.tgname, p.proname AS funcion, pg_get_triggerdef(t.oid) AS definicion
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
WHERE c.relname='carreras' AND NOT t.tgisinternal;
-- [{"tgname":"trg_audit_carreras","funcion":"fn_auditoria_log",
--   "definicion":"CREATE TRIGGER trg_audit_carreras AFTER INSERT OR DELETE OR UPDATE ON public.carreras FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()"}]
```

Un solo trigger, **de auditoría**. `AFTER ... FOR EACH ROW`: no valida ni bloquea nada, sólo
registra. El UPDATE de 11 filas va a dejar **11 entradas en `auditoria`**, que es lo que
queremos — queda el rastro de quién y cuándo.

```sql
SELECT n.nspname||'.'||p.proname AS funcion, p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind='f'
  AND pg_get_functiondef(p.oid) ILIKE '%cierre_inscripcion%';
-- [{"funcion":"public.rpc_baja_inscripcion","security_definer":true},
--  {"funcion":"public.rpc_inscribir","security_definer":true}]
```

```sql
SELECT 'policy' AS clase, schemaname||'.'||tablename||' :: '||policyname AS objeto
FROM pg_policies WHERE coalesce(qual,'')||coalesce(with_check,'') ILIKE '%cierre_inscripcion%'
UNION ALL SELECT 'constraint', conrelid::regclass::text||' :: '||conname
FROM pg_constraint WHERE pg_get_constraintdef(oid) ILIKE '%cierre_inscripcion%'
UNION ALL SELECT 'vista', schemaname||'.'||viewname
FROM pg_views WHERE schemaname='public' AND definition ILIKE '%cierre_inscripcion%';
-- []
```

**Cero policies, cero constraints, cero vistas.** Sólo las dos RPC.

Cómo la usan las dos, línea por línea:

```
rpc_inscribir        50:      OR v_carrera.apertura_inscripcion IS NULL
rpc_inscribir        51:      OR v_carrera.cierre_inscripcion  IS NULL
rpc_inscribir        52:      OR now() < v_carrera.apertura_inscripcion
rpc_inscribir        53:      OR now() > v_carrera.cierre_inscripcion
rpc_baja_inscripcion 49:      OR v_carrera.apertura_inscripcion IS NULL
rpc_baja_inscripcion 50:      OR v_carrera.cierre_inscripcion  IS NULL
rpc_baja_inscripcion 51:      OR now() < v_carrera.apertura_inscripcion
rpc_baja_inscripcion 52:      OR now() > v_carrera.cierre_inscripcion
```

Comparan `now()` (timestamptz) contra la columna (timestamptz): **comparación de instantes, sin
suponer ninguna zona**. Correr el cierre tres horas hacia adelante sólo **ensancha la ventana**;
no puede romper nada. Es la misma lógica que `ventanaAbierta()` en `portal.html`, que usa
`Date.parse()` sobre el ISO con offset — también correcto.

### 3.3 ⚠️ Lo que sí importa: la UI que carga la hora tiene el bug de zona

Esto es lo que hace que **el UPDATE solo no alcance**. En `carta-llamados.html` (`main`):

```javascript
// leer (línea 1112)
document.getElementById('f-ci-insc').value = rec?.cierre_inscripcion ? rec.cierre_inscripcion.slice(0,16) : '';
// escribir (línea 1165)
cierre_inscripcion: document.getElementById('f-ci-insc').value || null,
```

El input es `<input type="datetime-local" id="f-ci-insc">` (línea 424), o sea **hora local sin
zona**. Y `rec.cierre_inscripcion` llega de PostgREST como `"2026-09-11T12:00:00+00:00"`.

`.slice(0,16)` corta en `"2026-09-11T12:00"` — **se queda con la hora UTC y le arranca el
offset**. El input muestra **12:00** y la secretaría lee "mediodía". Al guardar manda
`"2026-09-11T12:00"` sin zona, la sesión está en UTC, y queda `12:00+00` = **09:00 AR**.

**Ése es el origen del bug.** No fue un error de tipeo de Yesi: cargó 12:00, la pantalla le
mostró 12:00, y la base guardó las 09:00.

Consecuencia directa sobre este plan: después del UPDATE, si alguien abre ese turno en
`carta-llamados.html`, el input va a mostrar **15:00**. Si lo guarda tal cual, queda bien de
casualidad. **Si lo "corrige" a 12:00 porque 15:00 le parece mal, vuelve a 09:00 AR.** El parche
de datos dura hasta la próxima edición.

**Esto hay que decidirlo antes de ejecutar (§7, pregunta 1).** El arreglo de la UI es el
`.slice(0,16)` sobre la hora local en vez de la UTC, en las cuatro fechas (`f-ap-insc`,
`f-ci-insc`, `f-ap-rat`, `f-ci-rat`) y en las cuatro escrituras. Es un cambio de código con su
probe, no parte de este UPDATE.

---

## 4. El UPDATE — acotado a R9 y sólo a la hora de cierre

**NO EJECUTADO.** Espera OK.

### 4.0 Snapshot previo (obligatorio, se guarda la salida)

```sql
SELECT c.id, c.numero_turno, c.cierre_inscripcion
FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9
ORDER BY c.numero_turno;
```

Los once ids están en la tabla del §1, y los once tienen el mismo valor
`2026-09-11 12:00:00+00`, así que el rollback es exacto.

### 4.1 El UPDATE

```sql
UPDATE carreras c
SET cierre_inscripcion = TIMESTAMP '2026-09-11 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires'
FROM reuniones r
WHERE c.reunion_id = r.id
  AND r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'   -- Dolores
  AND r.numero  = 9                                        -- SOLO R9
  AND c.cierre_inscripcion = TIMESTAMPTZ '2026-09-11 12:00:00+00'  -- SOLO las que están mal
RETURNING c.numero_turno,
          c.cierre_inscripcion AS nuevo_raw,
          c.cierre_inscripcion AT TIME ZONE 'America/Argentina/Buenos_Aires' AS nuevo_ar;
```

Los cuatro acotes, y para qué está cada uno:

| Predicado | Para qué |
|---|---|
| `c.reunion_id = r.id` + `r.numero = 9` | sólo los turnos de R9 |
| `r.club_id = '0649e9c5-…'` | sólo Dolores — `numero=9` no es único entre clubes |
| `c.cierre_inscripcion = TIMESTAMPTZ '…12:00:00+00'` | **idempotencia**: si ya se corrió, toca 0 filas en vez de correr el cierre otras 3 h. Y si alguien tocó una fila entremedio, esa queda afuera en vez de pisarse |
| `SET` de una sola columna | no toca apertura, ni ratificación, ni estado, ni nada más |

**Resultado esperado: exactamente 11 filas**, todas con `nuevo_raw = 2026-09-11 15:00:00+00` y
`nuevo_ar = 2026-09-11 12:00:00`.

Si devuelve un número distinto de 11 → **parar y no seguir**, algo cambió desde este
relevamiento.

### 4.2 Verificación post-UPDATE

```sql
SELECT c.numero_turno,
       c.cierre_inscripcion AS raw,
       c.cierre_inscripcion AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ar,
       to_char(c.cierre_inscripcion AT TIME ZONE 'America/Argentina/Buenos_Aires','TMDay DD/MM HH24:MI') AS legible,
       c.apertura_inscripcion < c.cierre_inscripcion AS ventana_coherente,
       c.cierre_inscripcion < c.apertura_ratificacion AS antes_de_ratificacion,
       c.cierre_inscripcion > now() AS todavia_abierta
FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9
ORDER BY c.numero_turno;
```

Criterio de aceptación: **11 filas**, las once con `ar = 2026-09-11 12:00:00`, `legible` =
`Friday 11/09 12:00`, y los tres booleanos en `true`.

Más el control de que no se tocó nada de otro club ni de otra reunión:

```sql
SELECT count(*) AS filas_cambiadas_fuera_de_r9
FROM carreras c JOIN reuniones r ON r.id=c.reunion_id
WHERE c.cierre_inscripcion = TIMESTAMPTZ '2026-09-11 15:00:00+00'
  AND NOT (r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9);
-- esperado: 0
```

Y la auditoría, que tiene que mostrar las once:

```sql
SELECT count(*) AS entradas, min(created_at) AS desde, max(created_at) AS hasta
FROM auditoria
WHERE tabla='carreras' AND accion='UPDATE' AND created_at > now() - interval '5 minutes';
-- esperado: 11
```

### 4.3 Rollback

Exacto, porque los once compartían el mismo valor:

```sql
UPDATE carreras c
SET cierre_inscripcion = TIMESTAMPTZ '2026-09-11 12:00:00+00'
FROM reuniones r
WHERE c.reunion_id = r.id
  AND r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND r.numero  = 9
  AND c.cierre_inscripcion = TIMESTAMPTZ '2026-09-11 15:00:00+00'
RETURNING c.numero_turno, c.cierre_inscripcion;
-- esperado: 11 filas, todas 2026-09-11 12:00:00+00
```

Mismo acote, mismos cuatro predicados, simétrico. Deja el estado exactamente como está hoy.

**El rollback devuelve la base al bug**, no a un estado neutro: sólo tiene sentido si el UPDATE
sale mal, no como "deshacer" después de avisarle a la gente.

### 4.4 Dónde queda el SQL

Convención del repo (`CLAUDE.md` § Supabase MCP): el `.sql` versionado en `migrations/` es la
fuente de verdad. Propongo `migrations/fix_cierre_r9_hora_argentina.sql` con el snapshot, el
UPDATE, las verificaciones y el rollback, aunque sea DML y no DDL — así queda el rastro de qué
se corrió. Se commitea en una rama `fix/`, no directo a `main`.

---

## 5. Inscripciones ya cargadas — ¿las afecta?

```sql
SELECT c.numero_turno, count(i.id) AS inscripciones,
       count(*) FILTER (WHERE i.estado='inscripto')    AS inscripto,
       count(*) FILTER (WHERE i.estado='ratificado')   AS ratificado,
       count(*) FILTER (WHERE i.estado='forfait')      AS forfait,
       count(*) FILTER (WHERE i.estado='mal_inscrito') AS mal_inscrito,
       count(*) FILTER (WHERE i.canal='portal')        AS via_portal,
       min(i.created_at) AS primera, max(i.created_at) AS ultima
FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
LEFT JOIN inscripciones i ON i.carrera_id=c.id
WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9
GROUP BY c.numero_turno ORDER BY c.numero_turno;
```

| T | inscripciones | inscripto | ratificado | forfait | mal_inscrito | via_portal |
|---|---|---|---|---|---|---|
| **1** | **2** | 2 | 0 | 0 | 0 | 2 |
| 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| 7 | 0 | 0 | 0 | 0 | 0 | 0 |
| 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| 9 | 0 | 0 | 0 | 0 | 0 | 0 |
| 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| **11** | **1** | 1 | 0 | 0 | 0 | 1 |

**Sí, hay tres.** El detalle:

| T | ejemplar | estado | canal | cargador | created_at (UTC) | created (AR) |
|---|---|---|---|---|---|---|
| 1 | Amiguito Peligroso | inscripto | portal | FABIO JOSE CASTRO | `2026-08-25 18:26:02+00` | `2026-08-25 15:26` |
| 1 | MOSQUITA GARDEN | inscripto | portal | FABIO JOSE CASTRO | `2026-08-28 20:34:12+00` | `2026-08-28 17:34` |
| 11 | CHINITA SALTEÑA | inscripto | portal | Federico Iguacel loeda | `2026-09-07 22:02:30+00` | `2026-09-07 19:02` |

### Por qué correr el cierre hacia adelante NO las afecta

1. **El UPDATE no toca la tabla `inscripciones`.** El `SET` es de una columna de `carreras`. Las
   tres filas no se leen, no se escriben, no se validan.
2. **No hay FK, constraint ni trigger que ate una inscripción a la ventana.** El §3.2 lo
   confirma: cero constraints y cero policies mencionan `cierre_inscripcion`, y el único trigger
   de `carreras` es de auditoría.
3. **La ventana se evalúa al momento de inscribir, no de forma continua.** `rpc_inscribir`
   compara `now() > cierre_inscripcion` en el instante de la llamada. Las tres ya entraron con la
   ventana abierta; nada las revalida después.
4. **El movimiento es hacia adelante (+3 h), o sea que la ventana se agranda.** Aun si algo
   revalidara, tres inscripciones que eran válidas con cierre 09:00 siguen siendo válidas con
   cierre 12:00. El riesgo estaría en correr el cierre **hacia atrás** — no es el caso.
5. **Las tres son `estado='inscripto'`**, ninguna ratificada. La ventana de ratificación
   (14/09) no se toca y sigue siendo posterior al cierre nuevo.

**Efecto real y único del cambio: tres horas más para anotarse el viernes.** Nadie pierde nada;
a lo sumo entran inscripciones nuevas entre las 09:00 y las 12:00, que es justamente lo que Yesi
quiere.

### 5.1 Ninguna otra reunión comparte esa hora

```sql
SELECT r.numero, r.numero_publico, r.fecha, r.estado, count(c.id) AS turnos,
       count(*) FILTER (WHERE c.cierre_inscripcion = '2026-09-11 12:00:00+00') AS con_ese_cierre
FROM reuniones r LEFT JOIN carreras c ON c.reunion_id=r.id
WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c'
GROUP BY r.id, r.numero, r.numero_publico, r.fecha, r.estado
HAVING count(*) FILTER (WHERE c.cierre_inscripcion='2026-09-11 12:00:00+00') > 0 OR r.numero=9;
-- [{"numero":9,"numero_publico":8,"fecha":"2026-09-20","estado":"publicada","turnos":11,"con_ese_cierre":11}]
```

**Una sola reunión, la 9, con sus 11 turnos.** El acote por `reunion_id` ya alcanzaba; el
predicado del valor es cinturón y tiradores.

---

## 6. Secuencia de ejecución propuesta

1. Re-correr el snapshot del §4.0 y **guardar la salida cruda** (el estado puede haber cambiado
   entre este plan y el OK).
2. Correr el UPDATE del §4.1. **Verificar que devuelve exactamente 11 filas.** Si no, parar.
3. Correr las tres verificaciones del §4.2. Criterio de aceptación arriba.
4. Verificar en producción por el lado del usuario: abrir el llamado abierto del portal y
   confirmar que el chip dice **`⏳ cierra 11/9 12:00 hs`**. Es la prueba de punta a punta —
   usa el `fechaHora()` en 24 h que se mergeó hoy.
5. Dejar el `.sql` en `migrations/` (§4.4), en rama `fix/`, con la salida cruda.
6. Informe con todo lo anterior en `reports`.

Tiempo total estimado: minutos. La ventana no corre riesgo — el cierre viejo (11/09 09:00 AR) es
dentro de ~3 días.

---

## 7. Preguntas abiertas — decidir ANTES de ejecutar

1. **¿Arreglo también la UI de `carta-llamados.html` (§3.3)?** Es lo que causó el bug y lo va a
   volver a causar: el input `datetime-local` muestra la hora **UTC** y la guarda como si fuera
   local. Sin ese arreglo, el UPDATE dura hasta la próxima vez que alguien edite el turno — y
   peor, la pantalla le va a mostrar **15:00** a la secretaría, que es lo que la invita a
   "corregirlo" de vuelta a 09:00. **Mi recomendación: sí, y antes de tocar los datos**, porque
   si se arregla primero la UI, el UPDATE se puede hacer desde la pantalla en vez de por SQL. Es
   un cambio con probe, rama `fix/`, no entra en este UPDATE.
2. **El cierre de ratificación está en lunes 09:00 AR** (`2026-09-14 12:00:00+00`), mismo
   defecto. ¿El criterio de Yesi para ratificación también es 12:00? No lo asumo. Si sí, entra
   en el mismo UPDATE con una columna más.
3. **La apertura de inscripción quedó a las 21:00 del día anterior** (`00:00:00+00`). Ya pasó y
   no tiene efecto retroactivo, pero conviene fijar el criterio para la próxima carta.
4. **¿Aviso a los tres que ya se anotaron?** No los perjudica en nada — sólo tienen tres horas
   más. Pero Fabio Castro y Fede Iguacel cargaron con el cierre viejo a la vista. Si la carta
   impresa dice 09:00, alguien puede aparecer a las 09:05 pensando que llegó tarde.
5. **¿La carta de llamados ya impresa dice 09:00?** Si se repartió en papel con esa hora, el
   cambio en la base y el papel no coinciden. No lo puedo verificar desde acá.

---

## 8. Verificación en `origin`

```
$ git ls-remote origin main
79821ae01a9b8e8768ae698b967462d00baa71a0	refs/heads/main
$ git ls-remote origin reports
d04951695291c5592ec5ab1050a7295c3142e39d	refs/heads/reports
```

**Nada de esto se ejecutó.** La base sigue con los once turnos en `2026-09-11 12:00:00+00`
(09:00 AR). El plan espera OK.

### 8.1 SHA final

```
$ git ls-remote origin reports
293e15659f5a27bc506846d0dfe440b0136412c2	refs/heads/reports
$ git rev-parse HEAD
293e15659f5a27bc506846d0dfe440b0136412c2
```
