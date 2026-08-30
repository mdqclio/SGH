# Plan — Revocar el DELETE de `recibos` (ISSUE-065)

**Fecha:** 2026-08-30
**SHA de `main` al relevar:** `dc978c092848629831e59ed912430ee021e97c60`
**Rama del plan:** `chore/revocar-recibos-delete` — HEAD `c5bcdb96b65c73b68b3e2cb2b1550f5f5b6494f2`, pusheada
**Rama de este informe:** `reports`
**Estado:** PLAN. **Nada aplicado.** `recibos_delete` sigue viva en producción.

---

## Guards verificados

```
$ pwd
/home/clio/dev/SGH
```
```sql
SELECT count(*) AS spcs_count FROM spcs;
```
```json
[{"spcs_count":181}]
```
```
ref del proyecto: unlhcuanfrtpatoipwve
```

Y la verificación de que el gate se respetó, al cierre:

```sql
SELECT polname FROM pg_policy WHERE polrelid='recibos'::regclass AND polcmd='d';
```
```json
[{"polname":"recibos_delete"}]
```

---

# 0. LOS SEIS HALLAZGOS QUE CAMBIAN EL CUADRO

Tres corrigen o matizan la premisa del pedido, y el sexto es más grave que el issue original.

| # | Hallazgo | Consecuencia |
|---|---|---|
| 1 | **`recibos` SÍ tiene trigger de auditoría** | Borrar **no** deja "nada": queda `auditoria.datos_antes` con la fila entera. Lo que se pierde es **qué líneas tenía** |
| 2 | **La FK `recibo_id` es `NO ACTION`** | Un recibo *con* líneas no se borra de una — hace falta soltarlas primero. Es un badén de dos pasos, no un guard |
| 3 | **Un recibo ANULADO se borra en UN paso** | Anular suelta las líneas, así que la FK ni lo roza. **El registro que creamos para preservar el rastro es el más fácil de borrar** |
| 4 | **Nunca se borró desde una sesión de usuario** | Los 387 DELETE de `auditoria` tienen `usuario_id = NULL` → `service_role`. El caso del #4 fue por consola, no por la policy |
| 5 | **`anon` también tiene el GRANT de DELETE** | Hoy no tiene policy, así que la RLS lo tapa. Pero el privilegio está |
| 6 | **`eliminarLiq` puede destruir líneas ya cobradas, desde un botón** | FK **CASCADE** + sin trigger en `liquidacion_detalle` + el botón mira el estado de la liquidación, no el de sus líneas. **Más urgente que ISSUE-065** → ISSUE-067 |

---

# 1. RELEVAMIENTO

## 1.a — La policy exacta, y si hay más de una

```sql
SELECT c.relname AS tabla, c.relrowsecurity AS rls_on, c.relforcerowsecurity AS force_rls,
       p.polname, CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
         WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' WHEN '*' THEN 'ALL' END AS cmd,
       p.polpermissive AS permissive,
       ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles)) AS roles,
       pg_get_expr(p.polqual, p.polrelid) AS using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid=c.oid
WHERE c.relname IN ('recibos','liquidacion_detalle','liquidaciones')
ORDER BY c.relname, cmd, p.polname;
```

**Hay exactamente UNA policy de DELETE sobre `recibos`:**

| campo | valor |
|---|---|
| nombre | `recibos_delete` |
| comando | DELETE |
| permisiva | sí |
| roles | `{authenticated}` |
| `USING` | `(NOT fn_is_portal_user()) AND (fn_is_super_admin() OR club_id = fn_get_user_club_id())` |
| `WITH CHECK` | `null` |
| RLS en la tabla | `relrowsecurity = true`, `relforcerowsecurity = false` |

O sea: **cualquier usuario de staff del club puede borrar cualquier recibo de su club.** No
hace falta ser super_admin — el `OR club_id = fn_get_user_club_id()` alcanza. El único excluido
es el usuario de portal.

## 1.b — Los grants a nivel SQL (la otra capa, que no es la policy)

```sql
SELECT grantee, privilege_type FROM information_schema.role_table_grants
 WHERE table_name='recibos' AND table_schema='public' ORDER BY grantee, privilege_type;
```

Para DELETE, los grantees son: **`anon`, `authenticated`, `postgres`, `service_role`.**

Son los GRANT por defecto de Supabase, que dan todo a todos y delegan el control en la RLS. Por
eso hay **dos** gates y no uno, y por eso el cambio tiene que tocar los dos:

| gate | quién lo pasa hoy | si sólo se dropea la policy | si además se revoca el grant |
|---|---|---|---|
| GRANT | anon, authenticated, postgres, service_role | sin cambio | authenticated y anon quedan afuera |
| RLS policy | authenticated (staff del club) | nadie | nadie |
| **resultado para el usuario** | **borra** | **204 con 0 filas, en silencio** | **error 42501** |

`anon` tiene el privilegio pero **ninguna policy** sobre `recibos`, así que hoy la RLS lo tapa.
Se revoca igual: el día que alguien agregue una policy para anon, el privilegio ya no está.

## 1.c — ¿El mismo agujero en `liquidaciones` y `liquidacion_detalle`? Sí, y peor

Las dos tienen policy de DELETE para `{authenticated}` con la misma forma:

```
liquidaciones_delete       → (NOT fn_is_portal_user()) AND (fn_is_super_admin() OR club_id = fn_get_user_club_id())
liquidacion_detalle_delete → (NOT fn_is_portal_user()) AND (fn_is_super_admin() OR fn_club_de_liquidacion(liquidacion_id) = fn_get_user_club_id())
```

**Y ahí es peor por tres razones que se suman** — desarrollado en §5 y en ISSUE-067.

## 1.d — FKs: ¿algo arrastra recibos por CASCADE?

```sql
SELECT con.conname, src.relname AS origen, a.attname AS columna, tgt.relname AS destino,
       CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
         WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' END AS on_delete
FROM pg_constraint con … WHERE con.contype=\x27f\x27 AND (tgt.relname=\x27recibos\x27 OR src.relname=\x27recibos\x27);
```
```json
[{"conname":"liquidacion_detalle_recibo_id_fkey","origen":"liquidacion_detalle","columna":"recibo_id","destino":"recibos","on_delete":"NO ACTION"},
 {"conname":"recibos_anulado_por_fkey","origen":"recibos","columna":"anulado_por","destino":"usuarios","on_delete":"NO ACTION"},
 {"conname":"recibos_club_id_fkey","origen":"recibos","columna":"club_id","destino":"clubs","on_delete":"NO ACTION"},
 {"conname":"recibos_emitido_por_fkey","origen":"recibos","columna":"emitido_por","destino":"usuarios","on_delete":"NO ACTION"},
 {"conname":"recibos_profesional_id_fkey","origen":"recibos","columna":"profesional_id","destino":"profesionales","on_delete":"NO ACTION"},
 {"conname":"recibos_propietario_id_fkey","origen":"recibos","columna":"propietario_id","destino":"profesionales","on_delete":"NO ACTION"}]
```

**Ningún CASCADE toca `recibos`.** Nada arrastra recibos borrando otra cosa, y borrar un recibo
no arrastra sus líneas.

Pero la FK **no es un guard**, es un badén:

- `liquidacion_detalle_recibo_id_fkey` es `NO ACTION`, así que un recibo **con** líneas
  apuntándolo no se puede borrar de una.
- El camino es de dos pasos, los dos permitidos por sus policies:
  1. `UPDATE liquidacion_detalle SET recibo_id=NULL WHERE recibo_id=X`
  2. `DELETE FROM recibos WHERE id=X`
- **Es exactamente el revert manual del recibo #4 del 28/08.**

Y el caso que da vuelta el argumento: **un recibo ANULADO ya no tiene líneas apuntándolo**
—anular las suelta—, así que **se borra en un solo paso**. El registro que creamos justamente
para preservar el rastro es el que menos protección tiene.

---

# 2. QUIÉN BORRA HOY

## 2.a — ¿Se borró alguna vez? Sí, 387 veces. Ninguna desde una sesión de usuario.

**Corrección a la premisa: `recibos` SÍ tiene trigger de auditoría.**

```sql
SELECT c.relname AS tabla, t.tgname, p.proname AS funcion, pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
WHERE NOT t.tgisinternal AND c.relname IN ('recibos','liquidacion_detalle','liquidaciones');
```
```
liquidaciones  trg_audit_liquidaciones  fn_auditoria_log  AFTER INSERT OR DELETE OR UPDATE
recibos        trg_audit_recibos        fn_auditoria_log  AFTER INSERT OR DELETE OR UPDATE
```

**`liquidacion_detalle` NO aparece: no tiene trigger.** Eso es lo que hace que borrar líneas sea
irreversible mientras que borrar un recibo no lo sea del todo.

Volumen:

```sql
SELECT tabla, accion, count(*) AS n, min(created_at) AS primero, max(created_at) AS ultimo
FROM auditoria WHERE tabla IN ('recibos','liquidacion_detalle','liquidaciones')
GROUP BY 1,2 ORDER BY 1,2;
```
```json
[{"tabla":"liquidaciones","accion":"DELETE","n":1893,"primero":"2026-05-14 02:23:16.892332+00","ultimo":"2026-08-30 19:16:04.505808+00"},
 {"tabla":"liquidaciones","accion":"INSERT","n":2082,"primero":"2026-05-14 02:21:11.125742+00","ultimo":"2026-08-30 19:16:00.849828+00"},
 {"tabla":"liquidaciones","accion":"UPDATE","n":631,"primero":"2026-06-09 01:48:28.340506+00","ultimo":"2026-08-29 03:56:14.280783+00"},
 {"tabla":"recibos","accion":"DELETE","n":387,"primero":"2026-06-08 04:07:32.817874+00","ultimo":"2026-08-30 19:16:04.073153+00"},
 {"tabla":"recibos","accion":"INSERT","n":392,"primero":"2026-06-08 04:07:30.0303+00","ultimo":"2026-08-30 19:15:51.38982+00"},
 {"tabla":"recibos","accion":"UPDATE","n":552,"primero":"2026-06-08 04:07:30.0303+00","ultimo":"2026-08-30 19:15:51.607628+00"}]
```

**Quién los hizo:**

```sql
SELECT a.usuario_id::text, u.nombre_completo, u.rol, count(*) AS deletes,
       min(a.created_at) AS primero, max(a.created_at) AS ultimo
FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id
WHERE a.tabla='recibos' AND a.accion='DELETE' GROUP BY 1,2,3 ORDER BY deletes DESC;
```
```json
[{"usuario_id":null,"nombre_completo":null,"rol":null,"deletes":387,"primero":"2026-06-08 04:07:32.817874+00","ultimo":"2026-08-30 19:16:04.073153+00"}]
```

**Los 387 tienen `usuario_id = NULL`.** `fn_auditoria_log` resuelve el usuario desde
`auth.jwt() ->> 'email'`; sin JWT queda NULL. O sea: **service_role** — los probes y la consola.

> **Respuesta directa: nunca se borró un recibo desde una sesión de usuario autenticado.**
> El agujero está abierto y nadie lo usó por esa vía.

## 2.b — El recibo #4, y algo peor que apareció buscándolo

El caso que citaste está en la auditoría:

```sql
SELECT a.created_at, a.usuario_id::text, (a.datos_antes->>'numero_recibo')::int AS numero,
       a.datos_antes->>'neto_a_cobrar' AS neto
FROM auditoria a WHERE a.tabla='recibos' AND a.accion='DELETE'
  AND (a.datos_antes->>'numero_recibo')::int = 4 ORDER BY a.created_at;
```

La fila del 28/08 — el #4 de $62.700 — está, con `usuario_id = NULL`. Confirma que fue por
consola. El resto de las 47 filas con `numero=4` son fixtures de probes.

**Pero apareció otra cosa.** El 2026-06-09 a las 18:50:10, en **una sola transacción**
(timestamp idéntico), se borraron **6 recibos reales de Dolores**:

```
created_at                       numero  cobrador                  neto        estado
2026-06-09 18:50:10.212234+00    2       MENDIBURU, BRIAN ADRIAN   72649.99    emitido
2026-06-09 18:50:10.212234+00    5       (sin cobrador)            70000.00    emitido
2026-06-09 18:50:10.212234+00    6       (sin cobrador)            122000.00   emitido
2026-06-09 18:50:10.212234+00    1       Federico heredia          100000.00   emitido
2026-06-09 18:50:10.212234+00    4       gatica dario              84000.00    emitido
2026-06-09 18:50:10.212234+00    3       contreras juan cruz       122000.00   emitido
```

**$570.649,99 en recibos `emitido`, con cobradores reales, borrados de una.** `usuario_id = NULL`
→ consola. Fue en junio, desarrollo temprano, y casi seguro un reset deliberado. Pero es el
precedente concreto de que este camino se usa y de que borra plata real.

**Lo recuperable y lo no recuperable**: de esos 6 quedó `datos_antes` con la fila entera, así
que los recibos se pueden reconstruir. **Sus líneas no**: `liquidacion_detalle` no tiene trigger.

## 2.c — ¿El front borra recibos? No.

```
$ grep -rn "from('recibos')" --include=*.html --include=*.js .
liquidaciones.html:1662:    let qy = sb.from('recibos').select(REC_SELECT).eq('club_id', CLUB_ID);
```

**Una sola referencia en todo el front, y es un `.select()`.** El único botón rojo que actúa
sobre un recibo es este:

```
$ grep -n "btn-delete" liquidaciones.html | grep -i recib
liquidaciones.html:1478:  ? `<button class="btn-sm btn-delete" onclick="cobrosAnular()">Anular recibo</button>`
```

Dice **Anular recibo** y llama al RPC. **Revocar el DELETE no rompe ninguna pantalla.**

---

# 3. LOS PROBES — verificado, no supuesto

## 3.a — Cuáles borran recibos

```
$ grep -rn "recibos'" --include=*.mjs tests/ | grep -i delete
tests/probe_recibos_emision.mjs:117:      for (const rid of recIds) await sb.from('recibos').delete().eq('id',rid);
tests/probe_anular_recibo_ui.mjs:396:      await sb.from('recibos').delete().eq('id', id);
tests/probe_cobros_v11.mjs:116:      for (const rid of recIds) await sb.from('recibos').delete().eq('id',rid);
tests/probe_historial_recibos.mjs:285:      if (recSueltos?.length) await sb.from('recibos').delete().in('id', recSueltos.map(r=>r.id));
tests/probe_historial_recibos.mjs:699:      await sb.from('recibos').delete().in('id', creados.recibos);
tests/probe_aislamiento_club_cobros.mjs:370:      await sb.from('recibos').delete().eq('id', id);
tests/probe_recibo_pie_cobrador.mjs:349:      for (const rid of recIds) await sb.from('recibos').delete().eq('id', rid);
tests/probe_anular_recibo.mjs:435:      await sb.from('recibos').delete().eq('id', id);
```

**7 probes, 8 sitios de borrado.** Todos en bloques de cleanup.

## 3.b — Con qué credencial corren

Los 7 crean su cliente con la clave server-side:

```
probe_recibos_emision        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
probe_anular_recibo_ui       const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
probe_cobros_v11             const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
probe_historial_recibos      const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
probe_aislamiento_club_cobros const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
probe_recibo_pie_cobrador    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
probe_anular_recibo          const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
```

**El punto fino**: dos de ellos (`probe_aislamiento_club_cobros` y `probe_anular_recibo`)
**también** crean clientes autenticados con la publishable key, para probar la RLS desde una
sesión real. Si alguno de esos borrara recibos, la revocación lo rompería. Verificado:

```
$ grep -rn "cli\.from('recibos')" tests/
NINGUNO — todos los delete usan el cliente service_role
```

## 3.c — ¿`service_role` realmente saltea la RLS?

Estructuralmente:

```sql
SELECT rolname, rolbypassrls, rolsuper FROM pg_roles
 WHERE rolname IN ('service_role','authenticated','anon','authenticator','postgres');
```
```json
[{"rolname":"anon","rolbypassrls":false,"rolsuper":false},
 {"rolname":"authenticated","rolbypassrls":false,"rolsuper":false},
 {"rolname":"authenticator","rolbypassrls":false,"rolsuper":false},
 {"rolname":"postgres","rolbypassrls":true,"rolsuper":false},
 {"rolname":"service_role","rolbypassrls":true,"rolsuper":false}]
```

**`service_role` tiene `rolbypassrls = true`**, y conserva su GRANT porque el REVOKE es sólo
para `authenticated` y `anon`. Además `relforcerowsecurity = false` en `recibos`.

Pero eso es la teoría. **El probe lo verifica empíricamente** con un borrado real (assert `D2`),
y ya da verde hoy:

```
 ✅ D2) service_role SÍ puede borrar — los probes siguen pudiendo limpiar sus fixtures  → borrado OK
```

> **Respuesta directa: los probes no se rompen.** Los 8 borrados usan `service_role`, ninguno
> usa un cliente autenticado, y el bypass está verificado por estructura **y** por ejecución.

---

# 4. EL CAMBIO

## 4.a — Decisión: revocar del todo. Ni siquiera super_admin.

**Coincido con tu criterio, y lo revisé caso por caso para asegurarme de que nadie quede sin
salida:**

| Situación | Salida sin DELETE |
|---|---|
| Recibo mal emitido, mismo día | `anular_recibo` — el caso rutinario, ya resuelto |
| Recibo mal emitido, +5 días | `anular_recibo` como **super_admin** (la excepción ya existe ahí) |
| Recibo anulado por error | No se des-anula. **Borrarlo tampoco lo arreglaría**: se emite uno nuevo. El DELETE no aporta nada acá |
| Recibo duplicado por un bug | `anular_recibo` |
| Purgar recibos de prueba de prod | `service_role` por consola — que es lo que se usó **las 387 veces que pasó** |

**Ningún caso legítimo pierde su salida.** Lo único que el DELETE agrega por encima de
`anular_recibo` es la capacidad de destruir el rastro, que es exactamente lo que no se quiere.

Y el argumento de simetría: `anular_recibo` **ya** tiene la excepción de super_admin (pasados
los 5 días, sólo él puede anular). Dejar además un DELETE para super_admin sería darle dos
caminos para lo mismo, uno de los cuales borra la evidencia.

## 4.b — Dos capas, y por qué las dos

```sql
-- capa 1: la policy
DROP POLICY IF EXISTS recibos_delete ON public.recibos;

-- capa 2: el privilegio
REVOKE DELETE ON public.recibos FROM authenticated;
REVOKE DELETE ON public.recibos FROM anon;
```

**Sólo con el DROP, el rechazo es silencioso.** La RLS filtra las filas, así que el DELETE no
matchea ninguna y PostgREST devuelve 204 con 0 filas afectadas — **sin error**. Una operación
prohibida que responde "listo" es peor que una que responde "no": el que la intenta se queda
creyendo que funcionó.

El REVOKE la convierte en un **42501 `permission denied`**. Fallar ruidoso.

Las dos capas se testean **por separado** — es GOTCHA #86 aplicado de entrada, para no repetir
lo de ayer con el post-filtro de club tapando la falta del `.eq`:

| assert | qué capa prueba | qué pasa si esa capa falta |
|---|---|---|
| `D1` el recibo sigue existiendo | la policy | rojo: el borrado funciona |
| `D1c` el rechazo es un error 42501 | el GRANT | rojo: rechazo silencioso |

Sin `D1c`, **media revocación se leería como revocación completa**.

## 4.c — Archivos

| Archivo | Qué |
|---|---|
| `migrations/revocar_recibos_delete.sql` | el cambio, **sin aplicar** |
| `migrations/rollback_revocar_recibos_delete.sql` | recrea policy y grants, con la `USING` capturada textual de `pg_policy` |
| `tests/probe_recibos_delete_revocado.mjs` | 17 asserts |

---

# 5. QUÉ PASA CUANDO ALGUIEN LO INTENTE — y el agujero que apareció mirando esto

## 5.a — Ningún botón queda roto

Ya está en §2.c: el front no borra recibos. El único botón rojo sobre un recibo dice **Anular
recibo** y llama al RPC. **Nadie va a recibir un error de RLS críptico, porque no hay ninguna
pantalla que intente borrar.**

Los otros `btn-delete` de `liquidaciones.html`, revisados uno por uno:

```
$ grep -n "btn-delete" liquidaciones.html
70:    .btn-delete { … }                                    ← CSS
507:   <button class="btn-delete" id="btn-anul-confirmar" …  ← confirmar ANULACIÓN
699:   …onclick="eliminarLiq(...)">🗑️</button>              ← borra LIQUIDACIONES ⚠️ ver 5.b
1194:  …onclick="cobrosTildarVisibles(false)">Destildar…     ← destilda checkboxes
1478:  …onclick="cobrosAnular()">Anular recibo</button>      ← anula, no borra
1982:  …onclick="deleteComision(...)">🗑️</button>           ← config de comisiones
```

Ninguno toca `recibos` con un DELETE.

## 5.b — ⚠️ ISSUE-067: `eliminarLiq` SÍ puede destruir plata cobrada, y es un botón

Mirando los `btn-delete` apareció esto, que **es más grave que ISSUE-065**:

```javascript
async function eliminarLiq(id) {
  if (!confirm('¿Eliminar esta liquidación?')) return;
  await sb.from('liquidacion_detalle').delete().eq('liquidacion_id', id);
  const { error } = await sb.from('liquidaciones').delete().eq('id', id);
  …
}
```

Tres cosas que se suman:

1. **`liquidacion_detalle_liquidacion_id_fkey` es `ON DELETE CASCADE`.**
2. **Hay camino desde la UI**: el 🗑️ del tab Liquidaciones. Un click y un `confirm()`.
3. **`liquidacion_detalle` no tiene trigger de auditoría** — las líneas se van sin rastro.

El botón se esconde con `l.estado !== 'pagada'`, pero **ese es el estado de la liquidación, no
el de sus líneas**. Una liquidación en `borrador` puede contener líneas `estado_linea='pagado'`
con `recibo_id` apuntando a un recibo emitido.

**Exposición medida hoy:**

```sql
SELECT lq.estado AS estado_liquidacion, count(DISTINCT lq.id) AS liquidaciones,
       count(ld.id) FILTER (WHERE ld.recibo_id IS NOT NULL) AS lineas_con_recibo,
       count(ld.id) FILTER (WHERE ld.estado_linea='pagado') AS lineas_pagadas,
       sum(ld.monto_neto) FILTER (WHERE ld.recibo_id IS NOT NULL) AS plata_borrable
FROM liquidaciones lq LEFT JOIN liquidacion_detalle ld ON ld.liquidacion_id=lq.id
GROUP BY 1 ORDER BY 1;
```
```json
[{"estado_liquidacion":"borrador","liquidaciones":189,"lineas_con_recibo":8,"lineas_pagadas":346,"plata_borrable":"1100000.00"}]
```

Y el detalle de cuáles:

```json
[{"liquidacion_id":"b0000000-…-0001","estado":"borrador","lineas":2,"con_recibo":2,"recibos_afectados":"9002","plata":"700000.00"},
 {"liquidacion_id":"b0000000-…-0007","estado":"borrador","lineas":2,"con_recibo":2,"recibos_afectados":"9001","plata":"170000.00"},
 {"liquidacion_id":"591e0e6b-…","estado":"borrador","lineas":1,"con_recibo":1,"recibos_afectados":"2","plata":"100000.00"},
 {"liquidacion_id":"30f70863-…","estado":"borrador","lineas":1,"con_recibo":1,"recibos_afectados":"1","plata":"70000.00"},
 {"liquidacion_id":"0a4d36d4-…","estado":"borrador","lineas":2,"con_recibo":2,"recibos_afectados":"3","plata":"60000.00"}]
```

> **Los 5 recibos de Dolores cuelgan de liquidaciones en `borrador`.** El 🗑️ está visible para
> todos. Un click deja el recibo con `neto_a_cobrar` de $X y un detalle **vacío** — y a
> diferencia del recibo, esas líneas no se pueden reconstruir de ningún lado.

**Es el escenario que la vista de historial que mergeamos hoy no sobrevive.**

Queda **fuera de alcance** como pediste (esta migración no toca otras tablas) y anotado como
**ISSUE-067**, marcado como más urgente que ISSUE-065: éste no tiene camino desde la UI, aquél sí.

---

# 6. EL PROBE

`tests/probe_recibos_delete_revocado.mjs` — 17 asserts, con **sesión `authenticated` real**
(magiclink, porque `signInWithPassword` está gateado por Turnstile desde el 04/08).

| ID | Assert |
|---|---|
| `D1` | un usuario authenticated NO puede borrar: la fila sigue existiendo |
| `D1b` | y el borrado no reporta filas afectadas |
| `D1c` | y el rechazo es un ERROR 42501, no un silencioso 0 filas *(capa del GRANT)* |
| `D1d` | tampoco se puede borrar un recibo **ANULADO**, que es el que la FK no protege |
| `D2` | **service_role SÍ puede borrar** — los probes siguen limpiando sus fixtures |
| `A1` | `anular_recibo` sigue funcionando desde una sesión authenticated |
| `A1b` | y el recibo queda ANULADO, no borrado — con motivo y fecha |
| `A1c` | y la FOTO de las líneas (v2) se sigue guardando |
| `A1d` | y la línea volvió a quedar pendiente de cobro |
| `A2` | el número anulado NO se reutiliza |
| `G1` | el circuito queda sin atajo: borrar rechazado, anular vivo |
| `R1`–`R6` | restore por ESTADO, sin recibos ni líneas ni usuarios residuales, secuencias intactas |

## 6.a — Detalle de diseño que vale la pena señalar

Para probar el **permiso** hay que soltar las líneas primero, porque si no la FK rechaza el
borrado por otro motivo y el assert daría verde sin probar nada. El probe las suelta con
`service_role`, para que lo único bajo prueba sea el DELETE:

```javascript
// Un recibo CON líneas no se borra ni con permisos, porque la FK es NO ACTION. Para probar el
// permiso hay que soltar las líneas primero — que es exactamente el revert manual del #4, y la
// razón por la que la FK es un badén y no un guard.
await sb.from('liquidacion_detalle').update({ recibo_id:null, … }).eq('id', dA.id);
const del = await cli.from('recibos').delete().eq('id', recA.id);
```

---

# 7. MUTATION TEST — ya corrido, y sin escribir nada

Pediste neutralizar la revocación y verificar que el assert lo detecta. **La base sin revocar
ES la revocación neutralizada**, así que el mutante ya está aplicado: es el estado actual de
producción. Correr el probe hoy es, literalmente, correr el mutante.

Salida cruda, contra la base **sin** aplicar la migración:

```
$ set -a; . ./.env; set +a
$ node tests/probe_recibos_delete_revocado.mjs

── Probe ISSUE-065 · el DELETE de recibos está revocado ──
 ❌ D1) un usuario authenticated NO puede borrar un recibo: la fila sigue existiendo  → ¡BORRADO! el DELETE está abierto — la migración no está aplicada
 ✅ D1b) y el borrado no reporta filas afectadas  → null
 ❌ D1c) y el rechazo es un ERROR de permisos (42501), no un silencioso 0 filas  → sin error — el GRANT sigue vivo
 ❌ D1d) tampoco se puede borrar un recibo ANULADO, que es el que la FK no protege  → ¡BORRADO!
 ✅ D2) service_role SÍ puede borrar — los probes siguen pudiendo limpiar sus fixtures  → borrado OK
 ✅ A1) anular_recibo sigue funcionando desde una sesión authenticated  → ok
 ✅ A1b) y el recibo queda ANULADO, no borrado — con motivo y fecha  → estado=anulado motivo=sí
 ✅ A1c) y la FOTO de las líneas (v2) se sigue guardando  → 1 línea(s) en la foto
 ✅ A1d) y la línea volvió a quedar pendiente de cobro  → estado=impago recibo_id=null
 ✅ A2) el número anulado NO se reutiliza: la secuencia no volvió atrás  → numero=5
 ❌ G1) el circuito completo queda sin atajo: borrar rechazado, anular vivo  → borrar=PERMITIDO anular=ok
 ✅ R1) restore por ESTADO: las líneas quedaron como estaban  → sin diferencias
 ✅ R2) y no hubo que restaurar nada a mano  → 0 línea(s)
 ✅ R3) no quedó ningún recibo del probe, en NINGÚN club  → []
 ✅ R4) no quedaron líneas del probe en la base  → []
 ✅ R5) no quedó ningún usuario del probe  → []
 ✅ R6) club_secuencias de los dos clubes devuelto a donde estaba  → 0649e9c5: 32→32 · a6da7e40: 1→1

13/17 OK
```

**Cuatro asserts lo detectan**, y cada uno dice algo distinto:

| assert | qué detectó |
|---|---|
| `D1` | *¡BORRADO! el DELETE está abierto* — un secretario_carreras borró un recibo emitido |
| `D1c` | *sin error — el GRANT sigue vivo* — la capa del privilegio tampoco está |
| `D1d` | *¡BORRADO!* — el recibo **anulado** también, y ése ni siquiera necesita los dos pasos |
| `G1` | *borrar=PERMITIDO anular=ok* — el atajo existe |

Y los que **tienen que** dar verde ya dan verde, que es la otra mitad del mutation test —
prueban que el probe no está simplemente rojo por todos lados:

- `D2` service_role borra bien → la revocación no va a romper los probes.
- `A1`–`A2` `anular_recibo` intacto, con foto, motivo, fecha, línea liberada y número no reutilizado.
- `R1`–`R6` el restore quedó limpio: **el probe no dejó nada en producción**.

## 7.a — Las dos capas se pueden mutar por separado

Documentado en el propio probe, para cuando la migración esté aplicada:

```
· sólo `GRANT DELETE ... TO authenticated` (sin recrear la policy) → D1 verde, D1c ROJO.
  La RLS sigue tapando, pero el rechazo vuelve a ser silencioso.
· sólo `CREATE POLICY recibos_delete ...` (sin el GRANT)          → D1 ROJO. El borrado funciona.
```

Si `D1c` no existiera, el primer caso pasaría desapercibido.

## 7.b — Un bug del propio probe, encontrado y arreglado en el camino

La primera corrida dejó un usuario de prueba vivo en producción:

```
 ❌ R5) no quedó ningún usuario del probe  → [{"id":"b3316377-59c9-45e7-bda7-c57900e7484c"}]
```

`auditoria_usuario_id_fkey`, `recibos_emitido_por_fkey` y `recibos_anulado_por_fkey` son
`NO ACTION`, así que el `DELETE FROM usuarios` fallaba — y el código **no miraba el error**. Se
arregló soltando las referencias primero y reportando el error si lo hay (mismo patrón que
`probe_anular_recibo.mjs`), y el residuo se limpió a mano. La segunda corrida da `R5` en verde
y **cero usuarios `probe.065.*` en `usuarios` y en `auth.users`**.

---

# 8. RESUMEN

| | |
|---|---|
| Policies de DELETE sobre `recibos` | **una**: `recibos_delete`, `{authenticated}`, permisiva |
| Alcance real | cualquier staff del club, no sólo super_admin |
| GRANT de DELETE | anon, authenticated, postgres, service_role |
| CASCADE hacia `recibos` | **ninguno** |
| La FK protege | **no**: es un badén de dos pasos, y para un anulado ni eso |
| ¿Se borró desde una sesión de usuario? | **nunca** — los 387 son `usuario_id = NULL` (service_role) |
| Precedente real | 2026-06-09: **6 recibos de Dolores, $570.649,99**, una transacción, por consola |
| ¿El front borra recibos? | **no** — una sola referencia, y es `.select()` |
| Probes que borran | 7 probes, 8 sitios, **todos service_role**; ninguno con cliente autenticado |
| ¿Se rompen? | **no** — `rolbypassrls=true` + conserva el GRANT, verificado por ejecución (`D2`) |
| Cambio | `DROP POLICY` + `REVOKE ... FROM authenticated, anon`, sólo sobre `recibos` |
| ¿super_admin conserva el DELETE? | **no** — `anular_recibo` ya tiene su excepción de 5 días |
| Probe | 17 asserts · hoy **13/17**, con los 4 rojos siendo la demostración del agujero |
| Agujero adyacente | **ISSUE-067**, más urgente: $1.100.000 borrables desde un botón |
| Aplicado | **nada** |

---

# 9. PREGUNTAS ABIERTAS

1. **ISSUE-067 primero?** `eliminarLiq` tiene camino desde la UI y destruye líneas sin rastro;
   ISSUE-065 no tiene camino desde la UI y su daño es parcialmente recuperable por auditoría.
   Si hay que elegir uno antes del 20/09, yo haría ISSUE-067.
2. **¿Los 6 recibos del 09/06 se restauran?** Están completos en `auditoria.datos_antes`. Sus
   líneas no. Restaurarlos sin líneas dejaría 6 recibos con detalle vacío — probablemente peor
   que el estado actual. Mi recomendación es **no tocarlos** y dejarlos documentados acá.
3. **¿Conviene un trigger de auditoría en `liquidacion_detalle`?** Es lo que convertiría
   ISSUE-067 de "pérdida silenciosa" en "pérdida recuperable". Tiene costo de escritura en una
   tabla que se reescribe entera en cada recálculo — habría que medirlo.
4. **¿Y las policies de DELETE de `liquidaciones` / `liquidacion_detalle`?** No las toqué, como
   pediste. Pero el arreglo de ISSUE-067 probablemente pase por ahí y no sólo por la UI
   (GOTCHA #80: un guard de UI no es un guard).

---

# 10. GATE

**Nada aplicado.** Verificado al cierre: `recibos_delete` sigue existiendo en producción.
El SQL y el probe están en `chore/revocar-recibos-delete`, pusheada, **sin mergear**.

Lo único que se escribió en la base fueron las fixtures del probe, que su propio `finally`
restauró (`R1`–`R6` en verde), más la limpieza a mano del usuario residual de la primera
corrida.

---

# 11. VERIFICACIÓN DE PUBLICACIÓN

## `chore/revocar-recibos-delete` (el SQL y el probe, sin aplicar ni mergear)

```
$ git push -u origin chore/revocar-recibos-delete
 * [new branch]      chore/revocar-recibos-delete -> chore/revocar-recibos-delete
branch 'chore/revocar-recibos-delete' set up to track 'origin/chore/revocar-recibos-delete'.

$ git ls-remote origin chore/revocar-recibos-delete
c5bcdb96b65c73b68b3e2cb2b1550f5f5b6494f2	refs/heads/chore/revocar-recibos-delete

$ git rev-parse HEAD          # estando en chore/revocar-recibos-delete
c5bcdb96b65c73b68b3e2cb2b1550f5f5b6494f2
```

## `reports` (este informe)

```
$ git push origin reports
   7fcca2a..0363409  reports -> reports

$ git ls-remote origin reports
036340932af5fb6aad50872276fd805b8881d0b4	refs/heads/reports

$ git rev-parse HEAD          # estando en reports
036340932af5fb6aad50872276fd805b8881d0b4
```

Los SHA de `ls-remote` coinciden con los de `rev-parse HEAD` en las dos ramas.

## Estado de producción al cierre — el gate

```sql
SELECT polname FROM pg_policy WHERE polrelid='recibos'::regclass AND polcmd='d';
```
```json
[{"polname":"recibos_delete"}]
```

**La policy sigue viva. No se aplicó nada.** `main` sigue en `dc978c0`, sin la migración.

*(Esta sección se agregó en un commit posterior — su propio SHA queda en el `git log` de la rama.)*
