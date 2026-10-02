# ISSUE-104 — motor de liquidación que puede duplicar líneas: Fase 1 (relevamiento, solo lectura)

- **Fecha**: 2026-10-02
- **Código leído**: `main` en `054d70b945d0982a3dd57c659cf00efc472ed449` (`liquidaciones-engine.js`, sus 4 llamadores, `migrations/guard_staff_emitir_recibo.sql`)
- **Guards**: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` ✅ · `SELECT nombre FROM clubs WHERE id = '0649e9c5-9e87-4aad-842f-101458e6b33c'` → `Hipódromo de Dolores` ✅
- **Solo lectura**: sólo `SELECT` por MCP. No se tocó código ni base.
- **ISSUE**: PR #37 (`chore/issue-104-motor-liquidacion-duplicados`, `d8fba1a10d888da8b6cc5bfb10fc3f29e76d102c`) agrega ISSUE-104 y la nota de
  ISSUE-085 a `docs/ISSUES.md`. **Sin mergear** (espera OK).

## Conclusión corta

1. **Hoy no hay ningún duplicado**: 0 pares reunión-jockey en 64 incentivos, 0 claves del motor repetidas en las 709 líneas, 0 headers
   repetidos por actor, 0 incentivos con otro `concepto`. Es un riesgo, no un daño — pero todos los caminos terminan en **pagar dos veces**.
2. Hay **cuatro** caminos, no tres (el cuarto salió leyendo `emitir_recibo`):
   1. **Errores sin chequear** en la lectura inicial, el DELETE y los INSERT. El peor no es el DELETE: si falla la **lectura** de
      headers y líneas (`:311`), el motor cree que no hay nada pagado → no borra nada y **vuelve a generar lo ya cobrado como impago**.
   2. **Dos recálculos a la vez** (Recalcular + oficializar, dos pestañas, dos personas): leen, borran e insertan intercalados.
   3. **Un recibo emitido en medio de un recálculo**: si `emitir_recibo` paga una línea entre la lectura y el DELETE del motor, el DELETE
      ya no la borra (Postgres reevalúa el filtro sobre la fila nueva) pero el motor no la tiene como pagada → la reinserta **impaga**.
   4. **Ninguna UNIQUE** en `liquidacion_detalle` ni en `liquidaciones` que ataje lo anterior.
3. Los 4 llamadores **ya muestran `r.error`** en un toast: si el motor devuelve el error en vez de seguir, la pantalla lo dice sin tocar
   las pantallas.
4. **Propuesta en dos pasos**:
   - **2a — red de seguridad (chico, rápido)**: el motor corta y devuelve error en cada fallo de lectura/escritura; **tres índices UNIQUE**
     (línea por clave del motor, incentivo de jockey por reunión, header por actor). Con eso, cualquier carrera falla con `23505` en vez de
     duplicar. Lo que puede pasar es que **falten** líneas hasta el próximo "Recalcular" (recuperable), nunca que sobren (plata que sale).
   - **2b — atomicidad y lock**: la persistencia pasa a una RPC (`rpc_liquidacion_persistir`) que corre en **una transacción con
     `pg_advisory_xact_lock` por reunión**; el JS sigue calculando y le manda las líneas. `emitir_recibo` toma el mismo lock (cierra el
     camino 3). Es función de plata: sandbox, md5, probe con mutantes, ventana fuera del horario de Valeria.
5. **Antes de R10 (11/10)** conviene tener al menos **2a** en prod: R10 es la primera reunión que se va a liquidar y cobrar con el
   portal abierto y varias pantallas recalculando.

---

## 1. Cómo persiste el motor hoy

`generarLiquidacionesReunion` (`liquidaciones-engine.js:92-431`). Calcula en memoria (`actorMap`) y después persiste en **pedidos
sueltos por PostgREST, sin transacción**:

| Paso | Línea | Qué hace | ¿Mira `error`? |
|---|---|---|---|
| 0 | `:106` | lee la reunión (corte de liquidación cerrada) | ✅ devuelve error |
| — | `:117-140` | lee config, carreras, resultados, inscripciones, posiciones | parcial (sólo config/carreras por resultado vacío) |
| 1 | `:311` | lee headers + líneas de la reunión → `paidKeys` (líneas comprometidas) | ❌ |
| 2 | `:338` | `DELETE` de las líneas no comprometidas (`recibo_id IS NULL AND estado_linea <> 'pagado'`) | ❌ |
| 3a | `:400` | `INSERT` de header nuevo si el actor no tenía | sólo `console.error` + `continue` |
| 3b | `:411` | `INSERT` de las líneas del actor salvo las que están en `paidKeys` (`lineKey`) | sólo `console.error` |
| 4 | `:420-427` | cuenta líneas por header; borra los vacíos; recalcula totales | ❌ |
| — | `:430` | `return { created, headers, preserved }` — **éxito aunque 3a/3b hayan fallado** | — |

`lineKey` (`:40`) = `beneficiario_tipo | beneficiario_id | concepto_tipo | inscripcion_id | posicion | concepto` (dentro de la reunión).

Llamadores — los cuatro ya muestran `r.error`:

| Dónde | Cuándo | Qué hace con `r.error` |
|---|---|---|
| `liquidaciones.html:2463` | botón Recalcular reunión | `toast(r.error, 'error')` |
| `resultados.html:1685` | oficializar carrera | toast "Resultado oficial, pero la liquidación no se generó (…). Usá Recalcular" |
| `resultados.html:1720` | des-oficializar | toast "Des-oficializado, pero el recálculo falló (…)" |
| `resultados.html:2153` | después de `rpc_cambiar_monta` | toast "Monta guardada, pero la liquidación no se recalculó (…)" |

Otros que escriben `liquidacion_detalle`: `emitir_recibo` / `anular_recibo` / `liberar_linea` (RPC), `rpc_cambiar_monta` (borra lo
pagable del saliente), migraciones de regularización. La base ya tiene `trg_liq_detalle_cerrada` / `trg_liquidaciones_cerrada` (ISSUE-091:
nada se escribe en una reunión cerrada salvo migración o service_role).

## 2. Los cuatro caminos, con el mecanismo

### 2.1 Errores sin chequear

- **Lectura del paso 1 falla** (`existingLiqs` = `null`): `headerByActor` y `paidKeys` vacíos, `allHeaderIds` vacío → el DELETE no
  corre → por cada actor "no hay header" → crea un header **nuevo** e inserta **todas** sus líneas, incluidas las que ya están pagadas
  (no hay `paidKeys` que las saltee) → toda la reunión queda duplicada, **lo cobrado reaparece como impago**. Es el caso más caro.
- **DELETE del paso 2 falla**: las no comprometidas quedan y el paso 3 las inserta otra vez → duplicadas todas las impagas/retenidas.
- **INSERT 3a/3b falla**: lo borrado en el paso 2 no se repone y la pantalla dice "recalculada". Faltan líneas (no se paga lo que
  corresponde) hasta el próximo recálculo.
- Paso 4 (totales y headers vacíos) sin chequeo: sólo afecta totales mostrados; menor.

### 2.2 Dos recálculos a la vez

A y B leen el mismo estado → A borra → B borra (nada) → A inserta → B inserta → **todo lo no pagado, dos veces**; y si un actor no
tenía header, **dos headers**. Disparadores reales: Recalcular en Liquidaciones mientras alguien oficializa en Resultados; dos pestañas;
oficializar dos carreras seguidas sin esperar el toast. Un lock no se puede sostener desde el navegador a través de varios pedidos
PostgREST: necesita que la persistencia sea **una** llamada (RPC).

### 2.3 Recibo emitido en medio de un recálculo

`emitir_recibo` (`migrations/guard_staff_emitir_recibo.sql:119-127`) marca `estado_linea='pagado', recibo_id=…` sobre las líneas
`impago` sin recibo. Secuencia: motor lee (la línea está impaga, no entra en `paidKeys`) → Pagos emite el recibo → motor hace el DELETE:
Postgres espera el lock de la fila, reevalúa `recibo_id IS NULL AND estado_linea <> 'pagado'` sobre la versión nueva → **no la borra** →
motor inserta la línea "nueva" impaga con la misma clave → **la persona cobró y le vuelve a figurar para cobrar**. Al revés (motor borra
antes) `emitir_recibo` marca 0 de esas filas; si no marca ninguna, aborta ("ninguna línea pagable"); si marca algunas, emite el recibo por
menos de lo que mostró la pantalla (el total sale de las líneas marcadas, así que el recibo es coherente, pero no coincide con lo que se
contó en la ventanilla).

### 2.4 Sin UNIQUE

Índices hoy (§ Salida cruda): PK + tres no únicos en `liquidacion_detalle`; PK + `(reunion_id, club_id)` en `liquidaciones`. Ninguno
impide los resultados de 2.1–2.3.

### Y el caso a mano (ISSUE-085)

Un incentivo cargado a mano con `concepto` ≠ `Incentivo jockey` no matchea `lineKey` → si el jockey además largó, el recálculo genera
otro. Hoy los 64 tienen el `concepto` exacto. Además, una línea a mano **impaga** la borra el próximo recálculo (es no comprometida y el
motor no la regenera si el jockey no largó). Ambas cosas quedaron anotadas en ISSUE-085 (PR #37).

## 3. Propuesta

### 2a — red de seguridad (código del motor + migración de índices)

**Motor** (`liquidaciones-engine.js`, sin cambiar el cálculo):
- paso 1: si `error` → `return { …, error: 'no se pudieron leer las líneas existentes (…): no se recalculó nada' }` **antes** de borrar.
- paso 2: `const { error: delErr } = await …delete()…`; si `delErr` → return error **antes** de insertar.
- 3a/3b: si falla un INSERT → seguir no; cortar y devolver error con cuántos actores quedaron hechos ("Usá Recalcular reunión").
  Con un `23505` (índice nuevo) el mensaje dice "otro recálculo o un cobro en curso; volvé a recalcular".
- paso 4: chequear y devolver aviso (no error) si fallan totales.

**Base** (migración nueva, primero en el sandbox `tests/local/`; `CREATE UNIQUE INDEX` falla solo si hubiera duplicados, y hoy hay 0):
```sql
-- :uuid_nulo = el uuid de todos ceros (va como parámetro acá: escrito literal cae en el chequeo de datos personales)
-- una línea por clave del motor (la misma de lineKey, dentro de la reunión)
create unique index uq_liqdet_linekey on liquidacion_detalle
  (reunion_id, beneficiario_tipo, beneficiario_id, concepto_tipo,
   coalesce(inscripcion_id, :uuid_nulo), coalesce(posicion, -1), concepto);
-- un incentivo de jockey por reunión, aunque cambie el texto del concepto (ISSUE-085)
create unique index uq_liqdet_incentivo_jockey on liquidacion_detalle (reunion_id, beneficiario_id)
  where concepto_tipo = 'incentivo_jockey';
-- un header por actor y reunión (el del club tiene los dos actores en NULL: 4 hoy)
create unique index uq_liquidaciones_actor on liquidaciones
  (reunion_id, club_id, coalesce(profesional_id, propietario_id, :uuid_nulo));
```
Columnas medidas: `reunion_id`, `beneficiario_*`, `concepto_tipo` sin NULL en las 709 líneas (un NULL dejaría pasar duplicados por
la semántica de UNIQUE); `concepto` es `NOT NULL`; `inscripcion_id`/`posicion` nulos legítimos → `coalesce`.

Antes de aplicar, verificar en el sandbox que **ninguna corrida del motor produce dos filas con la misma clave dentro de sí misma**
(dry-run de R6/R8/R9 con `tests/lib/motor_dryrun.mjs`): si alguna regla legítima la produce (empates, sub-roles), el índice la haría
fallar y hay que verlo antes, no en prod.

**Qué cambia para el usuario**: si pasa algo raro, "Recalcular" falla con un mensaje en vez de duplicar. Lo peor posible pasa a ser
"faltan líneas hasta que se vuelva a recalcular", que no saca plata.

**Probe** (`tests/probe_motor_errores_unique.mjs`, sin red para el motor: `sb` stub que falla en el paso elegido; sandbox para los índices):
lectura falla → 0 escrituras; DELETE falla → 0 INSERT; INSERT con `23505` → error devuelto; índices: segunda línea igual / segundo
incentivo con otro `concepto` / segundo header → `23505`. Mutantes: sacar cada chequeo y cada índice.

### 2b — una sola transacción con lock (RPC de plata)

- `rpc_liquidacion_persistir(p_reunion_id uuid, p_club_id uuid, p_actores jsonb)`: `SECURITY DEFINER`, guard 0 de staff + guard de club
  (patrón de `guard_staff_*`), corte de reunión cerrada, `perform pg_advisory_xact_lock(hashtextextended('liq:' || p_reunion_id, 0))`,
  y adentro los pasos 1–4 de hoy (leer comprometidas `FOR UPDATE`, borrar no comprometidas, insertar salteando por clave, headers,
  totales). Todo o nada. El JS calcula `actorMap` igual que hoy y llama a la RPC.
- `emitir_recibo` (y `anular_recibo`, `liberar_linea`, `rpc_cambiar_monta`) toman **el mismo** advisory lock de la reunión al empezar →
  un cobro y un recálculo de la misma reunión no se intercalan (cierra 2.3).
- Proceso: archivo en `migrations/`, sandbox con la función real, md5 de `pg_get_functiondef` en el encabezado, probe con concurrencia
  real (dos conexiones, como `probe_portal_alta_spc_studbook`), mutantes, ventana fuera del horario de Valeria, rollback escrito.

### Orden sugerido

1. **2a** (motor + índices) — antes de R10.
2. **2b** — después, sin apuro de fecha pero antes de que haya más de una persona cobrando a la vez.

## Preguntas abiertas

1. ¿Va 2a antes de R10 (11/10)? Es chico; el apply de los índices es en segundos y no cambia ningún dato.
2. ¿2b incluye que `emitir_recibo` y las otras RPC de plata tomen el lock? (recomendado: sí, es lo que cierra 2.3).
3. Cuando el motor corte por error a mitad (2a, antes de 2b), ¿alcanza con el toast "Usá Recalcular reunión"? (las líneas que falten
   reaparecen al recalcular; no hay pérdida, sólo demora).
4. ¿Se corre ahora un barrido de las reuniones abiertas (R9, R10) con la query de control antes de cada jornada de pagos? Es la misma de ISSUE-104.

## Salida cruda (queries de esta fase)

```sql
select 'inc_jockey_dup' k, count(*)::text v from (select reunion_id, beneficiario_id from liquidacion_detalle where concepto_tipo='incentivo_jockey' group by 1,2 having count(*)>1) x
union all select 'inc_jockey_total', count(*)::text from liquidacion_detalle where concepto_tipo='incentivo_jockey'
union all select 'linekey_dup_todas', count(*)::text from (select reunion_id, beneficiario_tipo, beneficiario_id, concepto_tipo, coalesce(inscripcion_id::text,''), coalesce(posicion::text,''), coalesce(concepto,'') from liquidacion_detalle group by 1,2,3,4,5,6,7 having count(*)>1) y
union all select 'linekey_dup_no_comprometidas', count(*)::text from (select reunion_id, beneficiario_tipo, beneficiario_id, concepto_tipo, coalesce(inscripcion_id::text,''), coalesce(posicion::text,''), coalesce(concepto,'') from liquidacion_detalle where recibo_id is null and estado_linea<>'pagado' group by 1,2,3,4,5,6,7 having count(*)>1) z
union all select 'headers_dup_actor', count(*)::text from (select reunion_id, club_id, coalesce(profesional_id,propietario_id) a from liquidaciones group by 1,2,3 having count(*)>1) w
union all select 'detalle_total', count(*)::text from liquidacion_detalle
union all select 'inc_jockey_concepto_distinto', count(*)::text from liquidacion_detalle where concepto_tipo='incentivo_jockey' and concepto is distinct from 'Incentivo jockey'
union all select 'idx:'||indexname, indexdef from pg_indexes where tablename in ('liquidacion_detalle','liquidaciones');
```
```
inc_jockey_dup                  | 0
inc_jockey_total                | 64
linekey_dup_todas               | 0
linekey_dup_no_comprometidas    | 0
headers_dup_actor               | 0
detalle_total                   | 709
inc_jockey_concepto_distinto    | 0
idx:liquidacion_detalle_pkey    | CREATE UNIQUE INDEX liquidacion_detalle_pkey ON public.liquidacion_detalle USING btree (id)
idx:idx_liqdet_beneficiario     | CREATE INDEX idx_liqdet_beneficiario ON public.liquidacion_detalle USING btree (beneficiario_tipo, beneficiario_id, estado_linea)
idx:idx_liqdet_recibo           | CREATE INDEX idx_liqdet_recibo ON public.liquidacion_detalle USING btree (recibo_id)
idx:idx_liqdet_liquidacion      | CREATE INDEX idx_liqdet_liquidacion ON public.liquidacion_detalle USING btree (liquidacion_id)
idx:liquidaciones_pkey          | CREATE UNIQUE INDEX liquidaciones_pkey ON public.liquidaciones USING btree (id)
idx:idx_liquidaciones_reunion_club | CREATE INDEX idx_liquidaciones_reunion_club ON public.liquidaciones USING btree (reunion_id, club_id)
```

```sql
select count(*) filter (where reunion_id is null) det_reunion_null, count(*) filter (where beneficiario_id is null) det_benef_null, count(*) filter (where beneficiario_tipo is null) det_btipo_null, count(*) filter (where concepto_tipo is null) det_ctipo_null, count(*) total,
 (select count(*) from liquidaciones where profesional_id is null and propietario_id is null) headers_sin_actor,
 (select count(*) from liquidaciones where profesional_id is not null and propietario_id is not null) headers_dos_actores
from liquidacion_detalle;
```
```
det_reunion_null=0 det_benef_null=0 det_btipo_null=0 det_ctipo_null=0 total=709 headers_sin_actor=4 headers_dos_actores=0
```

Columnas y triggers (`information_schema.columns`, `pg_trigger`):
```
liquidacion_detalle.beneficiario_id   uuid null=YES
liquidacion_detalle.beneficiario_tipo USER-DEFINED null=YES
liquidacion_detalle.concepto          character varying null=NO
liquidacion_detalle.concepto_tipo     USER-DEFINED null=YES
liquidacion_detalle.estado_linea      USER-DEFINED null=NO
liquidacion_detalle.inscripcion_id    uuid null=YES
liquidacion_detalle.liquidacion_id    uuid null=NO
liquidacion_detalle.posicion          integer null=YES
liquidacion_detalle.recibo_id         uuid null=YES
liquidacion_detalle.reunion_id        uuid null=YES
liquidaciones.club_id                 uuid null=NO
liquidaciones.profesional_id          uuid null=YES
liquidaciones.propietario_id          uuid null=YES
liquidaciones.reunion_id              uuid null=NO
trg liquidacion_detalle.trg_liq_detalle_cerrada  CREATE TRIGGER trg_liq_detalle_cerrada BEFORE INSERT OR DELETE OR UPDATE ON public.liquidacion_detalle FOR EACH ROW EXECUTE FUNCTION fn_liq_cerrada_guard()
trg liquidaciones.trg_audit_liquidaciones         CREATE TRIGGER trg_audit_liquidaciones AFTER INSERT OR DELETE OR UPDATE ON public.liquidaciones FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()
trg liquidaciones.trg_liquidaciones_cerrada       CREATE TRIGGER trg_liquidaciones_cerrada BEFORE INSERT OR DELETE OR UPDATE ON public.liquidaciones FOR EACH ROW EXECUTE FUNCTION fn_liq_cerrada_guard()
```
(`liquidacion_detalle` sigue sin trigger de auditoría: un duplicado que se borre a mano no deja rastro de qué había.)

Código citado (`git show main:…`):
```
$ grep -nE "function |await sb\.|\.from\(|error|return " liquidaciones-engine.js   (extracto de las líneas citadas)
40:  function lineKey(d) {
92:  async function generarLiquidacionesReunion(opts) {
106:    const { data: reunionRow, error: reunionErr } = await sb.from('reuniones').select('*').eq('id', rid).single();
107:    if (reunionErr) return { created: 0, headers: 0, preserved: 0, error: `no se pudo leer la reunión (${reunionErr.message})` };
311:    const { data: existingLiqs } = await sb.from('liquidaciones')
338:      await sb.from('liquidacion_detalle').delete()
400:        const { data: liqData, error } = await sb.from('liquidaciones').insert(liqPayload).select().single();
401:        if (error) { console.error('[engine] crear liquidación:', error); continue; }
411:        const { error: detErr } = await sb.from('liquidacion_detalle').insert(dRows);
412:        if (detErr) console.error('[engine] insertar detalle:', detErr);
420:      const { count } = await sb.from('liquidacion_detalle')
423:        await sb.from('liquidaciones').delete().eq('id', hid);
430:    return { created, headers, preserved };

$ sed -n 119,127p migrations/guard_staff_emitir_recibo.sql
  UPDATE liquidacion_detalle d
     SET estado_linea = 'pagado', recibo_id = v_recibo.id, pagado_at = now()
   WHERE d.id = ANY(p_linea_ids)
     AND d.beneficiario_id   = p_beneficiario_id
     AND d.beneficiario_tipo = p_beneficiario_tipo
     AND d.recibo_id IS NULL
     AND d.estado_linea = 'impago'
```
