# ISSUE-065 aplicado · y plan de ISSUE-067

**Fecha:** 2026-08-30
**SHA del merge de ISSUE-065:** `ceccda2d79c4a356179904260db15aaa5c026595`
**Rama de este informe:** `reports`
**Estado de ISSUE-067:** PLAN. **Nada aplicado.**

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

---

# PARTE A — ISSUE-065, aplicado y verificado

## A.1 — La migración

Aplicada por MCP `apply_migration`, nombre `revocar_recibos_delete`. Verificación posterior:

```sql
SELECT (SELECT count(*) FROM pg_policy
          WHERE polrelid='recibos'::regclass AND polcmd='d') AS policies_delete,
       (SELECT string_agg(grantee, ', ' ORDER BY grantee)
          FROM information_schema.role_table_grants
         WHERE table_name='recibos' AND table_schema='public'
           AND privilege_type='DELETE') AS grantees_delete;
```
```json
[{"policies_delete":0,"grantees_delete":"postgres, service_role"}]
```

**Cero policies de DELETE. `authenticated` y `anon` fuera de la lista de grantees.**

## A.2 — El probe contra la policy real: 17/17

Los cuatro asserts que ayer estaban en rojo demostrando el agujero, hoy en verde:

```

── Probe ISSUE-065 · el DELETE de recibos está revocado ──
 ✅ D1) un usuario authenticated NO puede borrar un recibo: la fila sigue existiendo  → el recibo sobrevivió
 ✅ D1b) y el borrado no reporta filas afectadas  → null
 ✅ D1c) y el rechazo es un ERROR de permisos (42501), no un silencioso 0 filas  → 42501 permission denied for table recibos
 ✅ D1d) tampoco se puede borrar un recibo ANULADO, que es el que la FK no protege  → 42501
 ✅ D2) service_role SÍ puede borrar — los probes siguen pudiendo limpiar sus fixtures  → borrado OK
 ✅ A1) anular_recibo sigue funcionando desde una sesión authenticated  → ok
 ✅ A1b) y el recibo queda ANULADO, no borrado — con motivo y fecha  → estado=anulado motivo=sí
 ✅ A1c) y la FOTO de las líneas (v2) se sigue guardando  → 1 línea(s) en la foto
 ✅ A1d) y la línea volvió a quedar pendiente de cobro  → estado=impago recibo_id=null
 ✅ A2) el número anulado NO se reutiliza: la secuencia no volvió atrás  → numero=5
 ✅ G1) el circuito completo queda sin atajo: borrar rechazado, anular vivo  → borrar=rechazado anular=ok
 ✅ R1) restore por ESTADO: las líneas quedaron como estaban  → sin diferencias
 ✅ R2) y no hubo que restaurar nada a mano  → 0 línea(s)
 ✅ R3) no quedó ningún recibo del probe, en NINGÚN club  → []
 ✅ R4) no quedaron líneas del probe en la base  → []
 ✅ R5) no quedó ningún usuario del probe  → []
 ✅ R6) club_secuencias de los dos clubes devuelto a donde estaba  → 0649e9c5: 32→32 · a6da7e40: 1→1

17/17 OK
```

El dato que más importa es `D1c`: **`42501 permission denied for table recibos`**. No es un
rechazo silencioso de 0 filas — es un error duro. Las dos capas están puestas y cada una tiene
su propio observable.

## A.3 — Nada se rompió

Los cuatro probes que borran recibos en su cleanup, corridos contra la policy revocada:

```
probe_anular_recibo           → exit=0 · 31/31 OK
probe_anular_recibo_ui        → exit=0 · 26/26 OK
probe_historial_recibos       → exit=0 · 39/39 OK
probe_aislamiento_club_cobros → exit=0 · 27/27 OK
```

`service_role` conserva su privilegio y su `rolbypassrls`, tal como decía el plan.

## A.4 — El usuario residual del probe: LIMPIO

Preguntaste explícitamente. Verificado contra la API de Auth de producción y contra la tabla:

```
$ node -e "… sb.auth.admin.listUsers({perPage:1000}) …"
auth.users TOTAL en produccion: 10
residuales probe.065.*      : 0 (ninguno)
cualquier probe.* o @sgh.test: 0 (ninguno)
```

```sql
SELECT count(*) FILTER (WHERE email ILIKE 'probe.065.%') AS probe065,
       count(*) FILTER (WHERE email ILIKE 'probe.%' OR email ILIKE '%@sgh.test') AS cualquier_probe,
       count(*) AS usuarios_total FROM usuarios;
```
```json
[{"probe065":0,"cualquier_probe":0,"usuarios_total":7}]
```

**Cero residuales**, ni en `auth.users` (10 usuarios, todos legítimos) ni en `usuarios` (7).
El bug de cleanup que lo dejó vivo ayer —`auditoria_usuario_id_fkey` es `NO ACTION` y el
`DELETE` fallaba sin que nadie mirara el error— quedó arreglado en el probe, y `R5` lo verifica
en cada corrida.

## A.5 — Merge

```
$ git merge --no-ff chore/revocar-recibos-delete -m "merge: revocar el DELETE de recibos (ISSUE-065)"
 4 files changed, 557 insertions(+)
 create mode 100644 migrations/revocar_recibos_delete.sql
 create mode 100644 migrations/rollback_revocar_recibos_delete.sql
 create mode 100644 tests/probe_recibos_delete_revocado.mjs

$ git push origin main
   dc978c0..ceccda2  main -> main

$ git rev-parse HEAD
ceccda2d79c4a356179904260db15aaa5c026595

$ git ls-remote origin main
ceccda2d79c4a356179904260db15aaa5c026595	refs/heads/main
```

---

# PARTE B — PLAN DE ISSUE-067

## B.0 — Dos correcciones a lo que yo mismo escribí ayer

### 1. La exposición es 20 veces mayor de lo que reporté

Ayer dije **$1.100.000**. Contaba sólo las líneas con `recibo_id IS NOT NULL`, y me olvidé de
las que tienen `estado_linea='pagado'` **sin** recibo — el saldado administrativo de GOTCHA #74,
que también es plata comprometida y también desaparece con el botón.

```sql
SELECT lq.estado AS estado_liq,
       count(DISTINCT lq.id) AS liquidaciones_con_boton,
       count(ld.id) AS lineas_totales,
       count(ld.id) FILTER (WHERE ld.recibo_id IS NOT NULL) AS con_recibo,
       count(ld.id) FILTER (WHERE ld.estado_linea='pagado') AS pagadas,
       count(ld.id) FILTER (WHERE ld.recibo_id IS NOT NULL OR ld.estado_linea='pagado') AS comprometidas,
       sum(ld.monto_neto) FILTER (WHERE ld.recibo_id IS NOT NULL OR ld.estado_linea='pagado') AS plata_comprometida_borrable
FROM liquidaciones lq JOIN liquidacion_detalle ld ON ld.liquidacion_id=lq.id
WHERE lq.estado <> 'pagada' GROUP BY 1;
```
```json
[{"estado_liq":"borrador","liquidaciones_con_boton":177,"lineas_totales":493,"con_recibo":8,"pagadas":346,"comprometidas":346,"plata_comprometida_borrable":"23023740.85"}]
```

> **$23.023.740,85 en 346 líneas comprometidas, repartidas en 177 liquidaciones que muestran el
> botón 🗑️.** Sobre 493 líneas totales del sistema: **el 70% de las líneas es borrable con un**
> **click.**

### 2. El CASCADE **no es** el mecanismo del bug

Esto cambia la comparación de las tres opciones, así que va antes que ellas.

```javascript
// liquidaciones.html:705
async function eliminarLiq(id) {
  if (!confirm('¿Eliminar esta liquidación?')) return;
  await sb.from('liquidacion_detalle').delete().eq('liquidacion_id', id);   // ← ACÁ mueren las líneas
  const { error } = await sb.from('liquidaciones').delete().eq('id', id);
  …
}
```

**La función borra las líneas EXPLÍCITAMENTE, en su propia sentencia.** Para cuando llega al
`DELETE` de la cabecera ya no queda nada que cascadear. El `ON DELETE CASCADE` **nunca se
ejercita por este camino**.

Consecuencia directa: **cambiar la FK no arregla el botón.** Es un arreglo real, pero de *otro*
camino. Desarrollado en B.2.

Y un detalle que importa para el diseño: **el error del primer `delete` no se mira**. Sólo se
chequea el de la cabecera. Cualquier defensa que rechace el borrado de las líneas va a fallar en
esa primera sentencia y el usuario no se va a enterar — la función va a seguir de largo.

---

## B.1 — RELEVAMIENTO: qué depende hoy del CASCADE

### Los dos únicos lugares del código que borran liquidaciones

```
$ grep -rn "from('liquidaciones').delete\|from('liquidacion_detalle').delete" --include=*.html --include=*.js .
liquidaciones-engine.js:286:      await sb.from('liquidacion_detalle').delete()
liquidaciones-engine.js:367:        await sb.from('liquidaciones').delete().eq('id', hid);
liquidaciones.html:707:  await sb.from('liquidacion_detalle').delete().eq('liquidacion_id', id);
liquidaciones.html:708:  const { error } = await sb.from('liquidaciones').delete().eq('id', id);
```

**El motor (recálculo paid-safe)** — `liquidaciones-engine.js:283`:

```javascript
// 2. Borrar SOLO las líneas no comprometidas (recibo_id null AND estado != 'pagado').
//    Lo pagado se preserva; retenido sin recibo se recalcula.
await sb.from('liquidacion_detalle').delete()
  .in('liquidacion_id', allHeaderIds)
  .is('recibo_id', null)
  .neq('estado_linea', 'pagado');
```

y más abajo, `liquidaciones-engine.js:363`:

```javascript
// 4. Recomputar totales de todos los headers tocados/sobrevivientes; borrar los vacíos.
const { count } = await sb.from('liquidacion_detalle')
  .select('id', { count: 'exact', head: true }).eq('liquidacion_id', hid);
if (!count) {
  await sb.from('liquidaciones').delete().eq('id', hid);   // ← sólo si tiene CERO líneas
}
```

**El motor jamás toca una línea comprometida y jamás borra una cabecera con líneas.** No depende
del CASCADE ni por accidente.

### Los probes

16 probes borran liquidaciones o su detalle. **Todos borran el detalle antes que la cabecera:**

```
probe_recibos_emision:        detalle=1 liquidaciones=1
probe_fase_c:                 detalle=1 liquidaciones=1
probe_aislamiento_club_cobros:detalle=2 liquidaciones=1
probe_recuperacion_monta:     detalle=1 liquidaciones=1
probe_rls_secretaria:         detalle=1 liquidaciones=1
probe_reunion_es_prueba:      detalle=2 liquidaciones=1
probe_recibos_delete_revocado:detalle=2 liquidaciones=2
probe_recibo_pie_cobrador:    detalle=1 liquidaciones=1
probe_filtro_concepto_pagos:  detalle=2 liquidaciones=2
probe_incentivos_montas:      detalle=1 liquidaciones=1
probe_anular_recibo:          detalle=2 liquidaciones=1
probe_oficializar_carrera:    detalle=2 liquidaciones=2
probe_historial_recibos:      detalle=3 liquidaciones=2
probe_fase2_liquidaciones:    detalle=1 liquidaciones=1
probe_anular_recibo_ui:       detalle=2 liquidaciones=1
probe_cobros_v11:             detalle=1 liquidaciones=1
```

> **Respuesta directa a tu pregunta: NO hay ningún borrado legítimo que dependa del CASCADE.**
> Ni el motor, ni la UI, ni un solo probe. El CASCADE está ahí por herencia del schema, no
> porque alguien lo use.

### La única consecuencia real de sacarlo

```sql
liquidaciones_club_id_fkey  liquidaciones.club_id → clubs   ON DELETE CASCADE
```

Hay una **cadena**: borrar un club cascadea a `liquidaciones`, y de ahí a `liquidacion_detalle`.
Con `RESTRICT`/`NO ACTION` en la FK del detalle, borrar un club con liquidaciones fallaría.
Los clubes no se borran nunca (hay 3, todos activos), pero es el único efecto colateral que
encontré y corresponde nombrarlo.

---

## B.2 — LAS TRES OPCIONES, COMPARADAS

### Cuadro de decisión

| | 1 · Guard en `eliminarLiq` | 2 · FK sin CASCADE | 3 · Trigger en `liquidacion_detalle` |
|---|---|---|---|
| **¿Tapa el botón de la UI?** | ✅ sí | ❌ **NO** | ✅ sí |
| **¿Tapa `curl` / consola / API?** | ❌ no | parcial¹ | ✅ sí |
| **¿Tapa el CASCADE?** | n/a | ✅ sí | ✅ sí |
| **¿Tapa a `service_role`?** | ❌ no | ✅ sí | ✅ sí |
| **¿Es un guard de verdad?** | ❌ no (GOTCHA #80) | ✅ sí | ✅ sí |
| **Riesgo de aplicar** | nulo | bajo | medio² |
| **Rompe probes** | no | no | **sí, ~4** |
| **Mensaje al usuario** | ✅ claro | críptico | críptico³ |

¹ Sólo el camino `DELETE FROM liquidaciones` pelado. Un `DELETE FROM liquidacion_detalle` sigue
  pasando. ² Bloquea a service_role, o sea a los probes. ³ Un error de trigger sin manejo en el
  front sale como toast crudo — de ahí que 1 y 3 sean complementarias, no alternativas.

### Opción 1 — El guard en `eliminarLiq`, mirando las LÍNEAS

Hoy el botón se esconde con `l.estado !== 'pagada'` — el estado de la **cabecera**. La
liquidación puede estar en `borrador` y tener 40 líneas cobradas. Ese es literalmente el bug:
**177 de 177 liquidaciones con líneas comprometidas están en `borrador`.**

El arreglo es mirar las líneas. `loadLiquidaciones` ya trae el detalle embebido, así que el
conteo sale sin consulta extra:

```javascript
// PLAN — no aplicado
const comprometidas = (l.liquidacion_detalle || [])
  .filter(d => d.recibo_id != null || d.estado_linea === 'pagado').length;
${comprometidas
  ? `<span class="badge badge-pagada" title="No se puede eliminar: tiene líneas cobradas">🔒 ${comprometidas} cobrada(s)</span>`
  : `<button class="btn-sm btn-delete" onclick="eliminarLiq(\x27${l.id}\x27)">🗑️</button>`}
```

más el chequeo dentro de `eliminarLiq` —para el caso de que la pantalla esté vieja— y, sobre
todo, **mirar el error del primer `delete`, que hoy se ignora**.

**A favor**: se aplica hoy, riesgo cero, y ataca el escenario real —alguien apura un click con
gente esperando—. Es lo único que da un **mensaje entendible**.

**En contra**: no es un guard. Un `curl` lo saltea. GOTCHA #80 en una línea: *si no está escrito
del lado del servidor, no existe*.

### Opción 2 — La FK de CASCADE a NO ACTION

**Lo primero, porque cambia todo: esta opción NO arregla el bug reportado.** `eliminarLiq` borra
las líneas en su propia sentencia (B.0.2); el CASCADE nunca entra en juego. Con la FK cambiada,
**el botón sigue haciendo exactamente lo mismo**.

Lo que sí arregla es el camino que hoy nadie usa pero está abierto: un `DELETE FROM liquidaciones`
pelado —consola, o un futuro pedazo de código— que hoy se lleva las líneas en silencio.

**Qué se rompe: nada.** Es la respuesta a tu pregunta, medida en B.1. El motor borra hijos
primero y sólo elimina cabeceras vacías; la UI borra hijos primero; los 16 probes borran hijos
primero. El único efecto es la cadena `clubs → liquidaciones → detalle`, y los clubes no se
borran.

**`NO ACTION` o `RESTRICT`**: para este caso son equivalentes (la diferencia es la
postergabilidad dentro de una transacción). Propongo **`NO ACTION`**, que es lo que usan las
otras 5 FK de estas tablas — no introducir un estilo nuevo por una sola constraint.

**Veredicto**: barata, correcta, y **no alcanza sola**. Es higiene estructural, no el arreglo.

### Opción 3 — Trigger `BEFORE DELETE` en `liquidacion_detalle`

**Es el arreglo real**, porque ataca el mecanismo: la línea comprometida no se borra, la borre
quien la borre y por el camino que sea.

#### Trigger, NO policy — y esto es decisivo

Una policy RLS restrictiva sería lo natural, pero **no sirve acá por tres motivos**:

1. **No aplica a `service_role`** (`rolbypassrls = true`). El agujero seguiría abierto por API.
2. **No se evalúa dentro de funciones `SECURITY DEFINER`** — GOTCHA #80, la lección de
   `anular_recibo`.
3. **No se evalúa en un borrado por CASCADE.** El cascade lo ejecuta el sistema, no el rol.

Un `BEFORE DELETE` trigger cubre los tres. Es estrictamente más fuerte.

```sql
-- PLAN — no aplicado
CREATE OR REPLACE FUNCTION fn_no_borrar_linea_comprometida()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'liquidacion_detalle: la línea % está comprometida (estado=%, recibo=%) — 
                   no se borra. Para revertir un cobro se usa anular_recibo().',
    OLD.id, OLD.estado_linea, OLD.recibo_id USING ERRCODE = \x2742501\x27;
END $$;

CREATE TRIGGER trg_no_borrar_linea_comprometida
  BEFORE DELETE ON liquidacion_detalle
  FOR EACH ROW
  WHEN (OLD.recibo_id IS NOT NULL OR OLD.estado_linea = 'pagado')
  EXECUTE FUNCTION fn_no_borrar_linea_comprometida();
```

El `WHEN` es lo que lo hace viable: **el trigger sólo se evalúa sobre líneas comprometidas.** El
recálculo del motor, que borra únicamente `recibo_id IS NULL AND estado_linea <> 'pagado'`,
**nunca lo dispara**. Costo en operación normal: cero.

#### El costo real: ~4 probes

Los probes emiten recibos y después borran sus fixtures. Los que ya limpian bien el estado antes
de borrar no se rompen:

```
probe_anular_recibo:434           .update({ estado_linea: 'impago', recibo_id: null, pagado_at: null })  ✅
probe_anular_recibo_ui:395        .update({ estado_linea:'impago', recibo_id:null, pagado_at:null })    ✅
probe_aislamiento_club_cobros:369 .update({ estado_linea: 'impago', recibo_id: null, pagado_at: null }) ✅
probe_historial_recibos:284       .update({ recibo_id:null })                       ← falta estado_linea
probe_recibos_delete_revocado:61  .update({ recibo_id:null, pagado_at:null })       ← falta estado_linea
```

**El arreglo es una palabra por probe**: agregar `estado_linea:'impago'` al `update` que ya
hacen. Y es más correcto igual — un fixture que se borra dejando `estado_linea='pagado'` está
mintiendo sobre su propio estado.

No propongo eximir a `service_role` en el trigger: sería reabrir el agujero por el único rol que
tiene el privilegio, y la vía de escape legítima es `ALTER TABLE … DISABLE TRIGGER` por consola
para una recuperación puntual — explícita y ruidosa, que es como tiene que ser.

---

## B.3 — ¿`liquidacion_detalle` debería tener trigger de auditoría?

**Sí, pero no el que está pensando la pregunta.** Un `fn_auditoria_log` completo
(INSERT+UPDATE+DELETE) como el de `recibos` sería caro y ruidoso; uno **acotado** es
prácticamente gratis y captura exactamente lo que falta.

### Por qué el completo es caro — medido

```sql
SELECT (SELECT count(*) FROM auditoria) AS auditoria_filas,
       (SELECT pg_size_pretty(pg_total_relation_size('auditoria'))) AS auditoria_tamano,
       (SELECT count(*) FROM liquidacion_detalle) AS detalle_filas,
       (SELECT pg_size_pretty(pg_total_relation_size('liquidacion_detalle'))) AS detalle_tamano;
```
```json
[{"auditoria_filas":11339,"auditoria_tamano":"13 MB","detalle_filas":493,"detalle_tamano":"448 kB"}]
```

**`auditoria` ya pesa 13 MB con 11.339 filas — 29 veces la tabla que audita.** Cada fila guarda
`datos_antes` y `datos_despues` completos: ~1,2 kB por evento.

Y `liquidacion_detalle` se reescribe entera en cada recálculo:

```sql
SELECT ld.reunion_id::text, count(*) AS lineas,
       count(*) FILTER (WHERE ld.recibo_id IS NOT NULL OR ld.estado_linea='pagado') AS comprometidas,
       count(*) FILTER (WHERE ld.recibo_id IS NULL AND ld.estado_linea<>'pagado') AS recalculables
FROM liquidacion_detalle ld GROUP BY 1 ORDER BY lineas DESC;
```
```json
[{"reunion_id":"7b6e003e-…","lineas":225,"comprometidas":185,"recalculables":40},
 {"reunion_id":"b02ca761-…","lineas":192,"comprometidas":157,"recalculables":35},
 {"reunion_id":"a0000000-…-9999","lineas":76,"comprometidas":4,"recalculables":72}]
```

Un recálculo de R8 borra e inserta ~40 líneas → **80 filas de auditoría, ~96 kB, por click en
"Recalcular reunión"**. En un día de reunión eso se aprieta muchas veces.

### La versión que sí conviene: DELETE, y sólo de lo comprometido

```sql
-- PLAN — no aplicado
CREATE TRIGGER trg_audit_detalle_borrado
  AFTER DELETE ON liquidacion_detalle
  FOR EACH ROW
  WHEN (OLD.recibo_id IS NOT NULL OR OLD.estado_linea = 'pagado')
  EXECUTE FUNCTION fn_auditoria_log();
```

Tres propiedades:

1. **Sólo DELETE.** Los INSERT/UPDATE del recálculo son la mitad ruidosa y no aportan nada al
   problema: lo que se pierde sin rastro son borrados.
2. **Sólo líneas comprometidas.** El motor nunca borra esas → **en operación normal el trigger
   se dispara CERO veces**. El costo no es "bajo": es cero.
3. **Reusa `fn_auditoria_log`**, que ya sabe armar `datos_antes` con `to_jsonb(OLD)` y resolver
   el usuario desde el JWT. No hay función nueva que mantener.

Sería, además, **el primer trigger con `WHEN` del schema** (hoy no hay ninguno) — vale decirlo
por si se prefiere no estrenar el patrón acá.

### Cómo se combina con la opción 3

Son **complementarios y en este orden**: el `BEFORE DELETE` impide el borrado; el `AFTER DELETE`
auditoría sólo llega a ejecutarse en los casos que el primero permita — es decir, cuando alguien
deshabilitó el trigger a propósito para una recuperación. **Justo el caso que hay que dejar
registrado.** No se pisan: se cubren.

---

## B.4 — RECOMENDACIÓN

**No es elegir una: es 1 + 3 + auditoría acotada, en ese orden, y 2 aparte.**

| Orden | Qué | Por qué en ese lugar |
|---|---|---|
| **1º** | **Opción 1** — guard de UI + mirar el error del primer `delete` | Se aplica hoy, riesgo cero, saca el botón de la vista. Es lo único que da un mensaje entendible, y sin esto el error del trigger sale como toast críptico |
| **2º** | **Opción 3** — `BEFORE DELETE` con `WHEN` | El arreglo de verdad. Requiere tocar ~4 probes primero (una palabra cada uno) |
| **3º** | **Auditoría acotada** (B.3) | Cierra la otra mitad: que lo que igual se borre, deje rastro |
| aparte | **Opción 2** — FK a `NO ACTION` | No arregla el bug reportado. Es higiene: cierra el camino `DELETE FROM liquidaciones` pelado. Barata y sin efectos, puede ir en cualquier momento |

**Por qué 1 antes que 3**, aunque 1 no sea un guard: el riesgo es un click apurado con gente
esperando, no un atacante. La opción 1 elimina ese riesgo **hoy**, y la 3 necesita antes tocar
los probes. Aplicar 3 sin 1 deja al operador con un error de Postgres crudo en la cara.

**Y una nota sobre el orden respecto de ISSUE-065**: coincido con tu lectura. Este issue tiene
botón visible, `confirm()` de una línea, $23 millones al alcance y ningún rastro; aquél era un
privilegio que nunca se usó y sin camino desde la UI. Se atendió el equivocado primero — que
igual había que cerrar, y está cerrado.

---

## B.5 — PROBE PROPUESTO

`tests/probe_no_borrar_lineas_cobradas.mjs`, con el patrón vigente:

| ID | Assert |
|---|---|
| `U1` | con una línea comprometida, `loadLiquidaciones` NO renderiza el botón 🗑️ |
| `U1b` | y sí lo renderiza cuando ninguna línea está comprometida |
| `U2` | `eliminarLiq` sobre una liquidación con líneas cobradas no borra nada |
| `U2b` | y avisa con un mensaje que nombra el problema, no un error crudo |
| `T1` | **el trigger rechaza el DELETE de una línea con `recibo_id`, incluso con service_role** |
| `T1b` | y de una con `estado_linea='pagado'` sin recibo (el saldado administrativo) |
| `T2` | pero **deja borrar** una línea impaga sin recibo |
| `T3` | **el recálculo del motor sigue funcionando** — es el assert que protege el flujo real |
| `T4` | borrar la cabecera no arrastra las líneas comprometidas (opción 2, si se aplica) |
| `A1` | el borrado de una comprometida, si se fuerza, queda en `auditoria` con `datos_antes` |
| `A2` | y un recálculo normal **no** genera ni una fila de auditoría (el `WHEN` funciona) |
| `R*` | restore por ESTADO |

`T3` y `A2` son los que importan tanto como los de bloqueo: **la defensa no puede romper el
recálculo ni inundar la auditoría**. Un trigger que protege y rompe el flujo de todos los días
se termina deshabilitando, y ahí no queda nada.

Mutación: neutralizar el `WHEN` (que dispare siempre) tiene que matar `A2` y probablemente
`T3`; sacar el `OR OLD.estado_linea = 'pagado'` tiene que matar `T1b` — es la mitad de los $23
millones.

---

## B.6 — NÚMEROS

| Métrica | Valor |
|---|---|
| Liquidaciones que muestran el 🗑️ | **177** (todas en `borrador`) |
| Líneas comprometidas alcanzables | **346** de 493 — **el 70%** |
| Plata borrable con un click | **$23.023.740,85** |
| Corrección sobre lo reportado ayer | $1.100.000 → **$23.023.740,85** (faltaban las `estado_linea='pagado'`) |
| Rastro que deja hoy | **ninguno** — `liquidacion_detalle` no tiene trigger |
| Código que depende del CASCADE | **ninguno** — motor, UI y 16 probes borran hijos primero |
| ¿La opción 2 arregla el botón? | **NO** — `eliminarLiq` borra las líneas explícitamente |
| Probes a tocar por la opción 3 | **~4**, una palabra cada uno |
| Costo del trigger de auditoría acotado | **cero disparos** en operación normal |
| `auditoria` hoy | 11.339 filas · 13 MB (29× la tabla que audita) |

---

## B.7 — PREGUNTAS ABIERTAS

1. **¿Se aplica el paquete completo o sólo la opción 1 antes del 20/09?** La 1 es riesgo cero y
   se puede aplicar hoy. La 3 toca la base y ~4 probes; es más segura hacerla con tiempo. Mi
   recomendación: **1 ya, 3 + auditoría esta semana, 2 cuando toque.**
2. **¿Qué hace el botón cuando hay líneas comprometidas: desaparece o queda deshabilitado con
   explicación?** Propuse un badge `🔒 N cobrada(s)` en vez del botón — dice por qué no se puede,
   que es mejor que un botón que no está. Es decisión de producto.
3. **¿Hace falta una salida para borrar una liquidación con líneas comprometidas?** No encontré
   ninguna legítima: si hay que revertir un cobro es `anular_recibo`, y si hay que recalcular es
   el motor, que ya preserva lo pagado. Si vos ves un caso, cambia el diseño del trigger.
4. **El trigger con `WHEN` sería el primero del schema.** ¿Se estrena acá o se prefiere un
   trigger común con el `IF` adentro? El `WHEN` es más barato (Postgres ni llama a la función),
   pero es un patrón nuevo en este repo.
5. **Las policies de DELETE de `liquidaciones` y `liquidacion_detalle` siguen abiertas para
   `authenticated`.** No las toqué. Con el trigger puesto dejan de importar para las líneas
   comprometidas, pero una liquidación entera de líneas impagas se sigue pudiendo borrar por
   API. ¿Entra en el alcance o queda como issue aparte?

---

## B.8 — GATE

**ISSUE-067: nada aplicado, nada escrito.** No hay SQL ni probe en ninguna rama todavía — es un
plan, y las tres opciones son excluyentes en su orden, así que escribir el SQL antes de que
elijas sería adivinar.

**ISSUE-065: aplicado y mergeado**, como pediste, con el detalle en la Parte A.

---

# VERIFICACIÓN DE PUBLICACIÓN

## `main` — ISSUE-065 mergeado

```
$ git push origin main
   dc978c0..ceccda2  main -> main

$ git ls-remote origin main
ceccda2d79c4a356179904260db15aaa5c026595	refs/heads/main

$ git rev-parse HEAD          # estando en main
ceccda2d79c4a356179904260db15aaa5c026595
```

## `reports` — este informe

```
$ git push origin reports
   7576974..2994845  reports -> reports

$ git ls-remote origin reports
299484540c6eaad39e28499585358ea056148568	refs/heads/reports

$ git rev-parse HEAD          # estando en reports
299484540c6eaad39e28499585358ea056148568
```

## Estado de producción al cierre

```sql
SELECT (SELECT count(*) FROM pg_policy
          WHERE polrelid='recibos'::regclass AND polcmd='d') AS policies_delete_recibos,
       (SELECT string_agg(grantee, ', ' ORDER BY grantee)
          FROM information_schema.role_table_grants
         WHERE table_name='recibos' AND privilege_type='DELETE') AS grantees;
```
```json
[{"policies_delete_recibos":0,"grantees":"postgres, service_role"}]
```

ISSUE-065 cerrado en la base y en el repo. **ISSUE-067 sin tocar**: la FK
`liquidacion_detalle_liquidacion_id_fkey` sigue en `CASCADE`, no hay trigger nuevo, y
`eliminarLiq` está como estaba.

*(Esta sección se agregó en un commit posterior — su propio SHA queda en el `git log` de la rama.)*
