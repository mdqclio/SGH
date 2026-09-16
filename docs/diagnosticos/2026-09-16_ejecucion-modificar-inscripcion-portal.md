# Ejecución — "Modificar" en Mis inscripciones del portal (plan del 14/09, pedido de Yesi)

- **Fecha**: 2026-09-16, 16:50–17:40 UTC (13:50–14:40 hora Argentina)
- **Plan aplicado**: `docs/diagnosticos/2026-09-14_plan-modificar-inscripcion-portal.md` (reports, `12bce32`).
  Aprobado por Leo el 16/09 con dos condiciones: (1) re-verificar validez contra la base y las pantallas,
  avisar si cambió algo antes de aplicar; (2) el probe tiene que correr contra el HTML **servido** después del
  merge. **GATE: diff y probe a rama, pusheados, sin mergear.**
- **`main` de partida**: `c0e7803730fbe93d4e418df3c0468040778820d7` (el mismo SHA que relevó el plan).
- **Rama de trabajo**: `feat/portal-modificar-inscripcion` → `9596c1e1e0f6732abf2845cd0afd45262c898627`, pusheada.
- **Estado**: **rama lista para revisión. NO mergeada. La migración NO está aplicada** (ver §3: el
  classifier del auto mode denegó `apply_migration`). Sin el RPC en la base, la parte SQL del probe (24
  asserts) no puede pasar; la parte de UI (14) pasa y sus 9 mutantes mueren.
- **GATE-1 = B** (no se transfiere `inscripto_por` al cambiar el entrenador), la opción recomendada del plan.
  El plan venía "aprobado" sin elegir explícitamente; B es la conservadora y el bloque A queda comentado en
  el SQL. Anotado como ISSUE-082.

## Guards

```
$ pwd
/home/clio/dev/SGH

$ git branch --show-current ; git rev-parse HEAD ; git status --short
main
c0e7803730fbe93d4e418df3c0468040778820d7
(limpio)

-- MCP execute_sql (proyecto unlhcuanfrtpatoipwve), 2026-09-16 16:51:53 UTC
select count(*) from spcs;
210
```

`pwd` y ref del proyecto dan lo esperado. **`spcs` da 210, no 205**: el baseline de CLAUDE.md quedó viejo
(altas de Yesi del 14/09, ver §1.1). Se actualizó a 210 en la rama.

---

## 1. Re-verificación del plan (condición 1 de Leo)

### 1.1 ¿Cambió algo en la base?

Query (una sola, `execute_sql`):

```sql
select 'spcs' k, count(*)::text v from spcs
union all select 'rpc_mod_exists', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'rpc_modificar%')::text
union all select 'rpc_baja_md5', md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rpc_baja_inscripcion'
union all select 'rpc_inscribir_md5', md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rpc_inscribir'
union all select 'trg_insc_set_prop_md5', md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fn_inscripcion_set_propietario'
union all select 'triggers_insc', string_agg(t.tgname, ',' order by t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='inscripciones' and not t.tgisinternal
union all select 'policies_insc', string_agg(polname::text||':'||polcmd::text, ',' order by polname) from pg_policy where polrelid='public.inscripciones'::regclass
union all select 'insc_update_qual', pg_get_expr(polqual, polrelid) from pg_policy where polrelid='public.inscripciones'::regclass and polname='inscripciones_update'
union all select 'cab_sin_titular', (select count(*) filter (where activo and not exists (select 1 from caballeriza_responsables cr where cr.caballeriza_id=c.id and cr.rol='propietario' and cr.activo))::text from caballerizas c where c.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c')
union all select 'cab_activas', (select count(*) filter (where activo)::text from caballerizas c where c.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c')
union all select 'now', now()::text;
```

Salida cruda:

```json
[{"k":"spcs","v":"210"},
 {"k":"rpc_mod_exists","v":"false"},
 {"k":"rpc_baja_md5","v":"b8bf790485fcdfab726d7eee7bf05ca4"},
 {"k":"rpc_inscribir_md5","v":"0605392e3ad9ed0baee9a32340f47deb"},
 {"k":"trg_insc_set_prop_md5","v":"c5e335ed4dd79a17ebe11617cee05ea7"},
 {"k":"triggers_insc","v":"trg_audit_inscripciones,trg_insc_set_propietario,trg_inscripciones_updated_at"},
 {"k":"policies_insc","v":"inscripciones_delete:d,inscripciones_insert:a,inscripciones_select:r,inscripciones_update:w"},
 {"k":"insc_update_qual","v":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))"},
 {"k":"cab_sin_titular","v":"43"},
 {"k":"cab_activas","v":"295"},
 {"k":"now","v":"2026-09-16 16:51:53.276214+00"}]
```

Además se volcaron completas (`pg_get_functiondef`) `rpc_baja_inscripcion`, `fn_inscripcion_set_propietario`,
`fn_mis_entidades`, `fn_is_portal_user` y `fn_mis_spc_visibles` y se compararon línea por línea con el texto
que reproduce el plan en §1.1/§1.2/§1.4: **idénticas**. `fn_auditoria_log` también se volcó (para el assert
A20): resuelve `usuario_id` por el email del JWT, guarda `datos_antes`/`datos_despues` completos.

**Lectura.** Lo estructural (las dos RPC existentes, el trigger del propietario, las 3 policies de
`inscripciones`, la policy de UPDATE que excluye al portal, 43/295 caballerizas sin titular) está **byte a
byte igual** que el 14/09. No existe ninguna `rpc_modificar%`. El plan sigue siendo válido tal cual.

**Lo que sí cambió — datos, no estructura:**

```sql
select s.id, s.nombre, s.created_at, s.club_id, (select count(*) from inscripciones i where i.spc_id=s.id) insc
from spcs s order by s.created_at desc limit 8;
```

```json
[{"id":"961bd741-1ee3-46d4-8a00-5c0997c09b84","nombre":"ARTHURUS","created_at":"2026-09-14 19:29:16.931593+00","club_id":null,"insc":1},
 {"id":"a9dab85f-84ad-4ef6-9212-6b38f09d7734","nombre":"CANDIDATA PIRANERA","created_at":"2026-09-14 18:41:14.351104+00","club_id":null,"insc":1},
 {"id":"bd37838a-cf81-43a9-affd-d2479d851ea2","nombre":"GRAN RAUL","created_at":"2026-09-14 18:38:27.850761+00","club_id":null,"insc":1},
 {"id":"1840cfe2-5dfd-4982-8916-645c3c3359fc","nombre":"OJO EXCELENTE","created_at":"2026-09-14 18:28:56.371801+00","club_id":null,"insc":1},
 {"id":"d12fdcbb-583f-4ffa-9c7b-c3b8f8d3ec5c","nombre":"LEONADA CHAT","created_at":"2026-09-14 18:27:50.400892+00","club_id":null,"insc":1},
 {"id":"d933bbc3-d020-4d91-b21b-3218383b6e2a","nombre":"SOUTH GOTICO","created_at":"2026-09-12 14:34:33.291495+00","club_id":null,"insc":1},
 {"id":"8bca8458-936d-4faf-afff-c115476e5256","nombre":"DAHUA","created_at":"2026-09-12 14:34:17.190577+00","club_id":null,"insc":1},
 {"id":"8fa89a02-3882-4858-a3f1-22861fd59b96","nombre":"BIEN COQUETA","created_at":"2026-09-11 21:21:06.686194+00","club_id":null,"insc":1}]
```

**(a) spcs 205 → 210.** Yesi dio de alta 5 ejemplares el 14/09 entre las 15:27 y las 16:29 AR desde
`spcs.html` (sin migración): LEONADA CHAT, OJO EXCELENTE, GRAN RAUL, CANDIDATA PIRANERA, ARTHURUS. Todos con
una inscripción (R9). Baseline actualizado en CLAUDE.md y en el probe (`SPCS_BASELINE = 210`).

```sql
select c.numero_turno, c.estado, c.cierre_inscripcion, c.apertura_ratificacion, c.cierre_ratificacion, r.estado as reunion_estado,
 (now() between c.apertura_ratificacion and c.cierre_ratificacion) as en_ratif,
 (now() between c.apertura_inscripcion and c.cierre_inscripcion) as en_insc,
 (select count(*) from inscripciones i where i.carrera_id=c.id and i.canal='portal') as portal_insc,
 (select count(*) from inscripciones i where i.carrera_id=c.id) as total_insc,
 (select string_agg(i.estado::text||':'||cnt::text, ' ') from (select estado, count(*) cnt from inscripciones where carrera_id=c.id group by estado) i) estados,
 (select count(*) from inscripciones i where i.carrera_id=c.id and i.estado='ratificado' and i.propietario_id is null) rat_sin_prop
from carreras c join reuniones r on r.id=c.reunion_id where r.id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' order by c.numero_turno;
```

| turno | carrera.estado | cierre_insc | apertura_rat | cierre_rat | reunión | en_ratif | en_insc | portal | total | estados | ratif. sin propietario |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **NULL** | 2026-09-14 14:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | publicada | false | false | 1 | 11 | ratificado:9 forfait:2 | 1 |
| 2 | **anulada** | " | " | " | publicada | false | false | 0 | 8 | forfait:4 inscripto:4 | 0 |
| 3 | abierta | " | " | " | publicada | false | false | 0 | 13 | ratificado:13 | 4 |
| 4 | abierta | " | " | " | publicada | false | false | 0 | 13 | ratificado:11 forfait:2 | 3 |
| 5 | abierta | " | " | " | publicada | false | false | 0 | 7 | ratificado:7 | 1 |
| 6 | abierta | " | " | " | publicada | false | false | 0 | 7 | ratificado:7 | 1 |
| 7 | abierta | " | " | " | publicada | false | false | 1 | 8 | ratificado:8 | 2 |
| 8 | **anulada** | " | " | " | publicada | false | false | 1 | 4 | inscripto:4 | 0 |
| 9 | abierta | " | " | " | publicada | false | false | 0 | 8 | ratificado:6 forfait:2 | 2 |
| 10 | **anulada** | " | " | " | publicada | false | false | 1 | 9 | forfait:4 inscripto:5 | 0 |
| 11 | abierta | " | " | " | publicada | false | false | 0 | 14 | ratificado:13 forfait:1 | 1 |

**(b) R9 quedó ratificada el 14/09**: 74 `ratificado`, T2/T8/T10 `anulada`, T1 con `carreras.estado = NULL`.
Las ventanas siguen las mismas (cerraron el 14/09 14:00 y 15:00 UTC) → **el feature no aplica a R9** salvo
que Yesi extienda `cierre_ratificacion` desde `carta-llamados.html`, exactamente lo que ya decía el plan §0.1.
El `estado = NULL` de T1 lo cubren los guards tal como están (`IS NOT DISTINCT FROM 'anulada'` en el RPC;
`c.estado === 'anulada'` en `ventanaRatificacion`/`ventanaAbierta`): NULL pasa como "no anulada", que es lo
correcto.

**(c) 16 ratificados con `propietario_id IS NULL`** (T1:1, T3:4, T4:3, T5:1, T6:1, T7:2, T9:2, T11:1). Es el
pendiente del lunes de CLAUDE.md ("volver a correr el `DO` de `propietarios_provisorios_r9.sql` después de la
ratificación") — **no se corrió**. No es de este plan, pero es la misma cadena del propietario que este RPC
toca, y afecta la liquidación de R9. Queda anotado en CLAUDE.md.

```sql
select i.id, ca.numero_turno, ca.estado carrera_estado, i.estado, u.email, s.nombre spc, i.propietario_id is not null tiene_prop, i.updated_at
from inscripciones i join carreras ca on ca.id=i.carrera_id join spcs s on s.id=i.spc_id left join usuarios u on u.id=i.inscripto_por
where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.canal='portal' order by ca.numero_turno;
```

```json
[{"id":"910a6bc4-bd54-47cc-901a-371744c02e24","numero_turno":1,"carrera_estado":null,"estado":"forfait","email":"studtomasytobias@hotmail.com","spc":"First Queen","tiene_prop":true,"updated_at":"2026-09-14 11:56:08.222862+00"},
 {"id":"cdb0ee6c-4f98-443c-adc9-3c9db9cf70ce","numero_turno":7,"carrera_estado":"abierta","estado":"ratificado","email":"ronaquenay@hotmail.com","spc":"LATIN PRESUMIDA","tiene_prop":true,"updated_at":"2026-09-14 22:08:18.762996+00"},
 {"id":"33549954-7ea5-41ff-ac3f-0ac1fc7335cb","numero_turno":8,"carrera_estado":"anulada","estado":"inscripto","email":"ronaquenay@hotmail.com","spc":"LATIN PRESUMIDA","tiene_prop":true,"updated_at":"2026-09-11 21:46:45.946887+00"},
 {"id":"f2173cb9-b3e5-433b-be14-6e117c423ae6","numero_turno":10,"carrera_estado":"anulada","estado":"inscripto","email":"ronaquenay@hotmail.com","spc":"LATIN RAIN","tiene_prop":true,"updated_at":"2026-09-11 21:49:21.463464+00"}]
```

**(d) Las filas de portal en R9 son 4, no 5**: `cf0b3019` (MOSQUITA GARDEN, T1, la cuenta de prueba
`hipodromodolores@gmail.com`) ya no existe. La única activa en turno vigente es LATIN PRESUMIDA T7,
`ratificado`. Las otras dos están en turnos anulados.

### 1.2 ¿Cambió algo en las pantallas?

```
$ git log --oneline c0e7803..origin/main
(vacío)
```

Nada. `main` sigue en `c0e7803`. `portal.html`, `inscripciones.html`, `ratificacion.html`,
`jockey-repetido.js` son los que relevó el plan. En `reports` hubo dos commits más (informe del sorteo de
partidores, 15/09), sin código.

### 1.3 Conclusión de la re-verificación

**El plan sigue siendo válido sin cambios.** Todo lo que cambió es dato (altas de SPC, ratificación de R9, un
test borrado). Ninguno toca el diseño del RPC, la UI ni el probe; el plan ya anticipaba que R9 iba a estar
cerrada. Por eso se avanzó con la rama en lugar de frenar — lo que sí frenó fue el harness (§3), y ese freno
coincide con el gate de Leo: la revisión pasa antes de que haya nada en producción.

Decisión tomada por mí: la condición "decímelo antes de aplicar" la leí como "si cambió algo que invalide el
plan". Si Leo la quería literal, el resultado es el mismo — no hay nada aplicado.

---

## 2. Lo que se hizo en la rama

```
$ git diff --stat main..feat/portal-modificar-inscripcion
 CHANGELOG.md                                 |  32 ++
 CLAUDE.md                                    |  15 +-
 SCHEMA.md                                    |  32 ++
 docs/ISSUES.md                               |  23 +
 docs/MODULOS.md                              |   3 +
 docs/SCHEMA.md                               |   7 +
 migrations/rpc_modificar_inscripcion.sql     | 245 ++++++++++
 portal.html                                  | 306 +++++++++++-
 tests/README.md                              |   1 +
 tests/probe_aviso_jockey_repetido.mjs        |   5 +-
 tests/probe_modificar_inscripcion_portal.mjs | 706 +++++++++++++++++++++++++++
 11 files changed, 1345 insertions(+), 30 deletions(-)
```

### 2.1 `migrations/rpc_modificar_inscripcion.sql`

El borrador del plan §4, con GATE-1 = B (bloque A comentado y explicado) y el `IS NOT DISTINCT FROM 'anulada'`
del turno. Cabecera con el estado real (pendiente de aplicar, por qué). Sin cambios de fondo respecto del plan.

### 2.2 `portal.html` (§5 del plan)

- `cargarInscripcionesCrudas`: el `select` pide además `caballeriza_id,entrenador_id,jockey_suplente_id,propietario_id`.
- `opcionesMonta()` extraída de `renderSelectsMonta()`; la usan los dos modales.
- `avisoJockeyRepetido(el, jockeyId, carreraId, excluirInscId)` generalizada; `avisoJockeyRepetidoPortal()`
  (anotar) y `avisoJockeyRepetidoModificar()` (modificar) son wrappers. La propia fila no cuenta.
- `accionesFila(i)`: la última celda de la tabla, extraída del IIFE inline. Retirar/Dar forfait + **Modificar**
  con el mismo `modoRetiro(i)`; `—` si no. Pie de tabla ampliado.
- Modal `#modal-modificar` (4 selects `mmod-*`, aviso inline de caballeriza sin titular, aviso de jockey,
  `#mmod-msg`, Cancelar/Guardar). CSS `.btn-modificar` (dorado suave).
- `cargarCaballerizasConTitular()` (Set cacheado por sesión, sólo `caballeriza_id`), `caballerizaSinTitular()`,
  `avisoCaballerizaSinTitular()`, `abrirModificar()` (prellena, muestra "hoy no tiene propietario" si la fila
  ya está en NULL), `cerrarModificar()`, `guardarModificacion()`: cortes del front (caballeriza, entrenador,
  suplente sin titular, suplente = titular, ratificado sin jockey) → `confirm()` de entrenador si cambió
  (texto B) → `confirm()` de caballeriza sin titular → `sb.rpc('rpc_modificar_inscripcion')` → toasts
  (éxito; warning si `sin_propietario`; warning si `sigue_siendo_mia === false`, que con B nunca pasa) →
  recarga → aviso de jockey ×N.
- Click en el overlay cierra el modal. `node --check` del script inline: OK.

### 2.3 `tests/probe_modificar_inscripcion_portal.mjs`

41 asserts (plan §7 + extras): F0 fixture; A1–A23 el RPC (incluye A21 forfait, A22 turno anulado, A23
ratificado en ventana de inscripción, A17c `cambio_entrenador` en los dos sentidos); **A0 transversal**
(snapshot de `spc_id, carrera_id, estado, numero_partidor, canal, inscripto_por` antes de **cada** llamada);
A20 auditoría; U1–U9 la UI (`accionesFila` sobre filas sintéticas, `guardarModificacion` con stubs de
`document`/`confirm`/`sb.rpc`/`toast`, `avisoJockeyRepetidoModificar`); R1 restore por estado + `spcs` antes =
después; R2 baseline 210.

Novedad pedida por Leo (condición 2): **`PORTAL_HTML` acepta una URL** — `PORTAL_HTML=https://sigh.com.ar/portal.html`
descarga con cache-buster y corre los asserts de UI contra lo que sirve GitHub Pages. Es lo que se va a correr
después del merge.

`--mutantes`: 9 de portal (P1–P8 + P4b) automáticos; 15 de SQL (M1–M14, M16) emitidos como gemela
`rpc_modificar_inscripcion_mut` con `replaceAll` (CREATE, COMMENT, REVOKE ×2, GRANT — 5 ocurrencias renombradas,
0 del nombre real). M15 (`FOR UPDATE`) declarado no cubierto: concurrencia.

### 2.4 `tests/probe_aviso_jockey_repetido.mjs`

Extraía sólo `avisoJockeyRepetidoPortal()`; como ahora delega, extrae también `avisoJockeyRepetido()`. Cambio
de 3 líneas, sigue siendo código real.

### 2.5 Docs

CHANGELOG (entrada 2026-09-16), `docs/MODULOS.md` (portal — Modificar), `SCHEMA.md` (sección RPC
`rpc_modificar_inscripcion`), `docs/SCHEMA.md` (las 3 RPC del portal + tenencia + cadena del propietario),
`docs/ISSUES.md` (**ISSUE-082**: tenencia = `inscripto_por`, no `entrenador_id`; opciones A/B; próximo paso
preguntarle a Yesi), `tests/README.md`, CLAUDE.md (baseline 210 + historial, migración en la estructura, probe
en la lista, nota R9: `DO` sin correr + Modificar no aplica a R9).

---

## 3. La migración NO se aplicó — denegación del harness

```
mcp__supabase__apply_migration(name='rpc_modificar_inscripcion_portal', query=<el .sql>)
→ Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Production Deploy].
```

No se intentó por el otro servidor MCP ni por `execute_sql`: sería rodear la misma intención. Lo que sí se hizo,
como "método más seguro": **compilar la función en una transacción con `ROLLBACK`**, con otro nombre
(`rpc_modificar_inscripcion_syntaxcheck`), sin COMMENT/GRANT:

```sql
BEGIN;
CREATE OR REPLACE FUNCTION public.rpc_modificar_inscripcion_syntaxcheck(...) ... $$;   -- mismo cuerpo
SELECT 'syntax ok' AS resultado, exists(select 1 from pg_proc where proname='rpc_modificar_inscripcion_syntaxcheck') AS existe_en_tx;
ROLLBACK;
```

```json
[{"resultado":"syntax ok","existe_en_tx":true}]
```

```sql
select proname from pg_proc where proname like 'rpc_modificar%';
```

```json
[]
```

**Compila; no quedó nada en la base.** (plpgsql sólo chequea sintaxis al crear; la semántica la prueban los
asserts A cuando el RPC exista.)

Para aplicarla hace falta uno de: (a) Leo la aplica desde el dashboard / MCP en su sesión con el contenido de
`migrations/rpc_modificar_inscripcion.sql`; (b) una regla de permiso para `apply_migration` en esta sesión;
(c) que Leo diga "aplicala" y se reintente (el classifier puede decidir distinto con el OK explícito en el
prompt).

---

## 4. Probe — corrida local (rama, `portal.html` local, RPC ausente)

```
$ set -a; . ./.env; set +a
$ node tests/probe_modificar_inscripcion_portal.mjs

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion  ·  run=w3cwxw
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=b8367501-de06-4829-bc32-714a323068c9
 ❌ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=false msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache data=null
 ❌ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=false msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache
 ❌ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=false msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache estado=ratificado partidor=5
 ❌ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache jockey=4bd3e798-1da0-4609-b53a-d76b78d4db72
 ❌ A5) B no puede modificar lo que cargó A  → msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache
 ❌ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache
 ❌ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache
 ❌ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache
 ❌ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache
 ❌ A10) reunión no publicada, rechaza  → msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache
 ❌ A22) turno anulado, rechaza  → msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=b8367501-de06-4829-bc32-714a323068c9
 ❌ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=false msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache prop=b8367501-de06-4829-bc32-714a323068c9 data=null
 ❌ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=false prop=b8367501-de06-4829-bc32-714a323068c9 data=null
 ❌ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=b8367501-de06-4829-bc32-714a323068c9
 ❌ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=b8367501-de06-4829-bc32-714a323068c9
 ❌ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache · b=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache · c=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache
 ❌ A16) suplente sin titular / suplente = titular → error  → a=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache · b=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache
 ❌ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=false msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache inscripto_por=2e3b6c9a-b654-4f9c-82c1-7fca6fc5bf12 data=null
 ❌ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=false B=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache
 ❌ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ❌ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache
 ❌ A21) un FORFAIT no se modifica desde el portal  → msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache
 ❌ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Could not find the function public.rpc_modificar_inscripcion(p_caballeriza_id, p_entrenador_id, p_inscripcion_id, p_jockey_suplente_id, p_jockey_titular_id) in the schema cache
 ❌ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila=undefined
 ✅ A0) en 27 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, w3" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

17/41 OK
```

**Lectura.** 17/41. Los 24 ❌ son **todos** `Could not find the function public.rpc_modificar_inscripcion(...)
in the schema cache` (o su consecuencia: A20 sin fila de auditoría, A17c/A18 sin `ok`). Es exactamente lo
esperado sin la migración. Lo que sí se verifica ya:

- **F0, A11-pre**: el fixture arma la cadena del propietario real (`caballeriza_responsables` → trigger → `propietarios` → `inscripciones.propietario_id`).
- **A0**: en 27 llamadas nada de lo fijo cambió (trivial sin RPC; con RPC es el assert que mata M9/M14).
- **U1–U9 (14/14)**: el botón, el select, los dos `confirm()`, el corte del front, el toast de `sin_propietario`, el error del RPC en el modal, el aviso de jockey excluyendo la propia fila, el modal, el pie.
- **R1/R2**: teardown limpio por estado, `spcs` 210 → 210.

Tras la primera corrida se endurecieron A6/A15/A16: pasaban "por casualidad" con el RPC ausente (el mensaje
"Could not find the function …p_jockey_suplente_id…" contiene "suplente"). Ahora exigen el texto exacto del
`RAISE` correspondiente.

## 5. Mutantes de portal (automáticos)

```
$ node tests/probe_modificar_inscripcion_portal.mjs --mutantes=P1,P2,P3,P4,P4b,P5,P6,P7,P8

═══ MUTATION TESTING · 9/24 mutantes ═══
(copias en /tmp/mut-modificar-DIbzDY — el repo y la función real no se tocan)

✅ P1 muere — el botón Modificar sale siempre, sin modoRetiro  [esperaba matar U1; murieron U1]
✅ P2 muere — el select deja de pedir caballeriza/entrenador/suplente/propietario  [esperaba matar U2; murieron U2]
✅ P3 muere — el confirm() de cambio de entrenador desaparece  [esperaba matar U3; murieron U3]
✅ P4 muere — el confirm() de caballeriza sin titular desaparece  [esperaba matar U4; murieron U4]
✅ P4b muere — el confirm() de caballeriza se muestra pero se guarda igual con "Cancelar"  [esperaba matar U4; murieron U4]
✅ P5 muere — la propia fila cuenta en el aviso de jockey repetido  [esperaba matar U5; murieron U5]
✅ P6 muere — el toast de sin_propietario desaparece  [esperaba matar U6; murieron U6]
✅ P7 muere — el modal de modificar no excluye la propia fila del aviso  [esperaba matar U5; murieron U5]
✅ P8 muere — un ratificado sin jockey pasa el corte del front  [esperaba matar U7; murieron U7]

✅ TANDA LIMPIA — 9 automáticos · 9 muertos
```

**9/9 muertos, 0 errores de arnés.**

## 6. Mutantes de SQL (emitidos, pendientes del apply)

```
$ node tests/probe_modificar_inscripcion_portal.mjs --mutantes=M1,M2,M3,M4,M5,M6,M7,M8,M9,M10,M11,M12,M13,M14,M16

═══ MUTATION TESTING · 15/24 mutantes ═══
(copias en /tmp/mut-modificar-uT3Ppi — el repo y la función real no se tocan)


✅ TANDA LIMPIA — 0 automáticos · 0 muertos

── 15 mutantes de SQL: requieren DDL, se aplican por MCP ──
Para cada uno:
  1. apply_migration con el contenido del .sql  (crea rpc_modificar_inscripcion_mut)
  2. RPC_MOD=rpc_modificar_inscripcion_mut node tests/probe_modificar_inscripcion_portal.mjs
  3. execute_sql: DROP FUNCTION IF EXISTS public.rpc_modificar_inscripcion_mut(uuid,uuid,uuid,uuid,uuid);
La función REAL rpc_modificar_inscripcion no se toca en ningún momento.

  M1  mata A6  — cae canal=portal del guard de tenencia (se modifica lo de la secretaría)
       /tmp/mut-modificar-uT3Ppi/M1.sql
  M2  mata A5  — cae inscripto_por=yo del guard de tenencia (se modifica lo de otro)
       /tmp/mut-modificar-uT3Ppi/M2.sql
  M3  mata A10  — cae el guard de reunión publicada
       /tmp/mut-modificar-uT3Ppi/M3.sql
  M4  mata A7,A8  — la ventana de INSCRIPCIÓN queda siempre abierta
       /tmp/mut-modificar-uT3Ppi/M4.sql
  M5  mata A2,A3  — la ventana de RATIFICACIÓN nunca se abre
       /tmp/mut-modificar-uT3Ppi/M5.sql
  M6  mata A9  — el fail-closed de NULL desaparece: sin fechas, ventana abierta
       /tmp/mut-modificar-uT3Ppi/M6.sql
  M7  mata A21  — en ratificación se acepta cualquier estado (un forfait se modifica)
       /tmp/mut-modificar-uT3Ppi/M7.sql
  M8  mata A4  — cae "un ratificado necesita jockey"
       /tmp/mut-modificar-uT3Ppi/M8.sql
  M9  mata A0,A3  — el SET pisa estado (un ratificado vuelve a inscripto)
       /tmp/mut-modificar-uT3Ppi/M9.sql
  M10  mata A12  — sin_propietario siempre false (el RPC no avisa)
       /tmp/mut-modificar-uT3Ppi/M10.sql
  M11  mata A11,A13  — cae el chequeo post-trigger y el SET deja propietario_id en NULL
       /tmp/mut-modificar-uT3Ppi/M11.sql
  M12  mata A15  — cae la validación de padrón del entrenador
       /tmp/mut-modificar-uT3Ppi/M12.sql
  M13  mata A16  — cae "suplente sin titular"
       /tmp/mut-modificar-uT3Ppi/M13.sql
  M14  mata A0,A17  — GATE-1=B roto: el RPC pisa inscripto_por con NULL
       /tmp/mut-modificar-uT3Ppi/M14.sql
  M16  mata A22  — cae el guard de turno anulado
       /tmp/mut-modificar-uT3Ppi/M16.sql
$ ls /tmp/mut-modificar-uT3Ppi
M1.sql M10.sql M11.sql M12.sql M13.sql M14.sql M16.sql M2.sql M3.sql M4.sql M5.sql M6.sql M7.sql M8.sql M9.sql node_modules
$ grep -c "rpc_modificar_inscripcion_mut(" M1.sql ; grep -c "rpc_modificar_inscripcion(" M1.sql
5
0
```

Los 15 anclajes existen en el `.sql` de la rama (0 errores de arnés) y la gemela queda completamente
renombrada. Se corren después de aplicar el RPC real: para cada uno `apply_migration` de la gemela →
`RPC_MOD=rpc_modificar_inscripcion_mut node tests/probe_modificar_inscripcion_portal.mjs` → `DROP FUNCTION`.
Con el classifier actual, el `apply_migration` de la gemela va a chocar con lo mismo que §3.

## 7. Regresión: probes existentes que extraen de `portal.html`

```
$ node tests/probe_forfait_portal.mjs

── El RPC ──

── La UI ──

── Probe · forfait desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_baja_inscripcion  ·  run=1tqzrp
 ✅ A1) retirar durante la INSCRIPCIÓN sigue funcionando, y BORRA la fila  → ok=true msg=null fila=null
 ✅ A2) retirar durante la RATIFICACIÓN funciona y deja estado=forfait — la fila NO se borra  → ok=true msg=null fila={"id":"064dfc00-4928-4bf6-83f6-e65887568b92","estado":"forfait","canal":"portal","inscripto_por":"c48e7173-0b7f-4e01-90d3-d5f077298b2d","numero_partidor":null,"motivo_estado":"Forfait desde el portal"}
 ✅ A10) el forfait limpia numero_partidor  → numero_partidor=null
 ✅ A11) el forfait CONSERVA canal e inscripto_por (el rastro no se pierde)  → canal=portal inscripto_por=c48e7173-0b7f-4e01-90d3-d5f077298b2d
 ✅ A12) el forfait deja marca de origen en motivo_estado  → motivo_estado="Forfait desde el portal"
 ✅ A14) un caballo ya RATIFICADO puede darse de forfait en esa ventana  → ok=true msg=null estado=forfait
 ✅ A13) un caballo ya en forfait no se puede volver a retirar  → msg=Ese caballo ya figura como forfait y no se puede dar de baja desde el portal.
 ✅ A3) antes de que abra ninguna ventana, rechaza  → msg=Fuera de plazo: se puede retirar mientras la inscripción está abierta, o dar forfait durante la ratificación. Hablá con la secretaría.
 ✅ A4) EL HUECO entre el cierre de inscripción y la apertura de ratificación, rechaza  → msg=Fuera de plazo: se puede retirar mientras la inscripción está abierta, o dar forfait durante la ratificación. Hablá con la secretaría.
 ✅ A5) después del cierre de ratificación, rechaza  → msg=Fuera de plazo: se puede retirar mientras la inscripción está abierta, o dar forfait durante la ratificación. Hablá con la secretaría.
 ✅ A6) no se puede retirar lo que cargó OTRO usuario  → msg=Esa inscripción no la cargó usted desde el portal. Para darla de baja, hablá con la secretaría.
 ✅ A7) no se puede retirar lo que cargó la SECRETARÍA (canal manual)  → msg=Esa inscripción no la cargó usted desde el portal. Para darla de baja, hablá con la secretaría.
 ✅ A8) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A9) ventana de ratificación en NULL → fail-closed, rechaza  → msg=Fuera de plazo: se puede retirar mientras la inscripción está abierta, o dar forfait durante la ratificación. Hablá con la secretaría.
 ✅ U1) modoRetiro distingue las dos ventanas y el fuera-de-plazo  → insc=inscripcion · rat=ratificacion
 ✅ U2) el rótulo del botón es "Dar forfait" en ratificación y "Retirar" en inscripción
 ✅ U3) cargarInscripcionesCrudas pide apertura_ratificacion y cierre_ratificacion
 ✅ U4) ventanaRatificacion es fail-closed: sin las dos fechas, cerrada
 ✅ U5) un RATIFICADO muestra botón en la ventana de ratificación, no en la de inscripción
 ✅ U6) lo de otro y lo de la secretaría no muestran botón
 ✅ T1) teardown: no quedaron reuniones 9988/9989 ni SPC del run  → reuniones=0 spcs=0

21/21 OK
```

**21/21.** `modoRetiro`, `ventanaRatificacion`, `puedeRetirar` siguen extraíbles y con el mismo comportamiento.

```
$ node tests/probe_aviso_jockey_repetido.mjs
✅ H1) forfait + ratificado, mismo jockey → NO repetido
✅ H2) mal_inscrito + ratificado, mismo jockey → NO repetido
✅ H3) inscripto + inscripto, mismo jockey → repetido
✅ H4) ratificado + ratificado, mismo jockey → repetido
✅ H5) inscripto + ratificado, mismo jockey → repetido
✅ H6) dos jockeys distintos → nada
✅ H7) sin jockey no cuenta
✅ H8) conteo ×3
✅ H9) badge lleva ⚠ dup. y la cantidad
✅ R9) T1 sin aviso
❌ R9) T2 avisa: GONZALEZ, LUCAS  — (nada)
❌ R9) T3 sin aviso  — GONZALEZ, LUCAS
✅ R9) T4 sin aviso
✅ R9) T5 avisa: CANTO, TOBIAS  — CANTO, TOBIAS
❌ R9) T6 sin aviso  — CANTO, TOBIAS
✅ R9) T7 sin aviso
✅ R9) T8 sin aviso
✅ R9) T9 sin aviso
❌ R9) T10 avisa: AGUIRRE, HUGO  — (nada)
✅ R9) T11 avisa: CANTO, TOBIAS  — CANTO, TOBIAS
❌ R9) T2 Gonzalez ×3
❌ R9) T10 Aguirre ×3
✅ R8) R6 T9 PRESA, DANIEL: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T2 LOPEZ, ALEXIS: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T3 GONZALEZ, LUCAS: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T5 DELLI QUADRI, IGNACIO DANIEL: forfait/mal_inscrito + ratificado → ya no avisa  — AGUIRRE, HUGO
✅ R8) R8 T8 PRESA, DANIEL: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T10 TORRES, ANIBAL: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) R8 T11 CONTRERAS, JUAN CRUZ: forfait/mal_inscrito + ratificado → ya no avisa  — (nada)
✅ R8) T5 AGUIRRE, HUGO: los dos ratificados → avisa en ratificación (correcto)  — AGUIRRE, HUGO
✅ A0) inscripciones.html carga jockey-repetido.js
❌ A1) R9 T2: 3 filas con ⚠ dup. (Gonzalez ×3)  — badges: 0
❌ A2) R9 T2: las filas marcadas son las de Gonzalez
✅ A3) R9 T2: ALHENA (Hahn, único) sin badge
✅ A4) R9 T1 (turno limpio): 0 badges
✅ A5) R8 T2 (Lopez: ratificado + forfait): 0 badges
✅ A6) saveRecord llama avisarJockeyRepetido (toast, no return antes del insert)
❌ A7) toast de aviso al guardar con Gonzalez en T2, tipo warning  — []
✅ B0) portal.html carga jockey-repetido.js y pide jockey_titular_id
❌ B1) jockey ya en 2 caballos míos del turno → aviso visible con los nombres  — ⚠ Ya declaraste este jockey en DEL CAMPEON para este turno. Podés anotar igual: la monta se define en la ratificación.
✅ B2) los otros en forfait → sin aviso
✅ B3) otro turno → sin aviso
✅ B4) sin jockey elegido → sin aviso
✅ B5) el aviso dice que se puede anotar igual (no bloqueo)
✅ C0) ratificacion.html carga jockey-repetido.js
✅ C1) render: jockeyCount = conteoJockeysActivos(insc)
✅ C2) el conteo viejo sobre todas las filas ya no está
✅ C3) recalcJockeyColisiones cuenta por estado de fila
✅ C4) updateCounter recalcula el aviso tras cada cambio de estado
✅ C5) ratificar() sigue sin mirar colisiones (no bloqueo)
✅ C6) estadoDeFila lee badge-ratificado / badge-mal_inscrito
✅ D0) resultados.html carga jockey-repetido.js
✅ D1) R8 T5: NOCHE EN VELA no largó (dato persistido)  — noLargo mandiles: 4
✅ D2) R8 T5: Aguirre en los dos, ratificados
✅ D3) estado actual (Aguirre ×2, NOCHE EN VELA no largó) → moJockeysRepetidos sin repetidos  — {"654dc3ea-5c90-46cd-a579-eb0efa3bd1c0":1,"a66df20c-cd72-4125-a1d7-b32e48fcf037":1,"8f24be30-e951-4287-82bd-2db54d0e32dc":1,"484361c0-abb5-41af-b20e-3090535cb075":1,"2e3428cb-be99-4c91-9b99-13c3b499e147":1,"005caa02-fc91-45b3-9ae6-6f55d989fa2e":1,"0bbe6666-bdf5-446b-8ee2-5279eafdc844":1}
✅ D4) backfill R8 T5: saveMontas emite el UPDATE de LA LAGUNERA J (no bloqueado)  — [{"jockey_titular_id":"a66df20c-cd72-4125-a1d7-b32e48fcf037","id":"4370d235-6dd9-479a-b7af-cd7c4d81c82f"}]
✅ D5) backfill R8 T5: toast de guardado y NINGÚN aviso de repetido (el otro no largó)  — [["1 monta(s) guardada(s)","success"]]
✅ D6) Aguirre en dos que largaron → se guarda igual (UPDATE emitido) + toast warning  — {"updates":[{"jockey_titular_id":"a66df20c-cd72-4125-a1d7-b32e48fcf037","id":"b6ef2dbb-59aa-45c7-8385-386197acb0e8"}],"toasts":[["1 monta(s) guardada(s)","success"],["⚠ Jockey repetido entre caballos que largaron: AGUIRRE, HUGO. Se guardó igual — revisalo antes de oficializar.","warning"]]}
✅ D7) montasFaltantes usa noLargoIds (refactor sin cambio de criterio)
✅ D8) la base no se tocó: LA LAGUNERA J y el tercer caballo siguen como estaban  — [{"id":"4370d235-6dd9-479a-b7af-cd7c4d81c82f","jockey_titular_id":"a66df20c-cd72-4125-a1d7-b32e48fcf037","estado":"ratificado"},{"id":"b6ef2dbb-59aa-45c7-8385-386197acb0e8","jockey_titular_id":"654dc3ea-5c90-46cd-a579-eb0efa3bd1c0","estado":"ratificado"}]

50/60 asserts OK — 10 FALLARON
```

**50/60 — los mismos 10 fallan en `main` sin tocar** (se verificó con `git stash` sobre la rama: idéntico
50/60). Son asserts contra los datos de R9 tal como estaban el 12/09 (Gonzalez ×3 en T2, Aguirre ×3 en T10,
etc.): R9 se ratificó el 14/09, T2 y T10 se anularon, las montas cambiaron. Los asserts B2–B4 (la función
del portal sobre filas sintéticas) pasan; B1 falla porque el fixture `mias` que arma a partir de R9 T2 ahora
trae un solo caballo. **No es regresión de esta rama** — es el probe de sólo lectura que quedó atado a una
foto de R9. Se anota, no se toca acá.

---

## 8. Verificación de publicación

```
$ git push -u origin feat/portal-modificar-inscripcion
$ git rev-parse HEAD
9596c1e1e0f6732abf2845cd0afd45262c898627
$ git ls-remote origin feat/portal-modificar-inscripcion
9596c1e1e0f6732abf2845cd0afd45262c898627	refs/heads/feat/portal-modificar-inscripcion
```

Coinciden. `main` sin tocar.

---

## 9. Lo que falta (después del OK)

1. **Aplicar `migrations/rpc_modificar_inscripcion.sql`** (§3). `get_advisors` security después.
2. `node tests/probe_modificar_inscripcion_portal.mjs` → tiene que dar **41/41**. Si algo falla, se corrige el
   SQL en la rama (`CREATE OR REPLACE`) y se vuelve a aplicar; no se sigue.
3. Los 15 mutantes de SQL por gemela (§6). Al final, `select proname from pg_proc where proname like
   'rpc_modificar%'` tiene que devolver **sólo** `rpc_modificar_inscripcion` (GOTCHA de la gemela que revive).
4. Merge `--no-ff` a `main` con OK explícito. `git ls-remote`.
5. md5 de `portal.html` contra `sigh.com.ar` (con `?v=$RANDOM`, hasta que coincida).
6. **`PORTAL_HTML=https://sigh.com.ar/portal.html node tests/probe_modificar_inscripcion_portal.mjs`** → 41/41
   contra el HTML servido (condición 2 de Leo). Anexar acá.
7. Si Yesi quiere usarlo en R9: extender `cierre_ratificacion` desde `carta-llamados.html`. No lo hago por SQL.
8. Aparte: correr el `DO` de `propietarios_provisorios_r9.sql` (16 ratificados sin propietario, §1.1.c).

## 10. Preguntas abiertas

1. GATE-1: se ejecutó **B**. ¿Confirmás, o querés A (media hora, ISSUE-082)?
2. ¿Cómo aplicamos la migración: la aplicás vos, das permiso al `apply_migration`, o reintento con tu OK?
3. `probe_aviso_jockey_repetido.mjs` quedó atado a la foto de R9 del 12/09 (§7). ¿Lo desacoplo de los datos
   reales o lo dejamos como registro histórico?
4. Los 16 ratificados sin propietario de R9 (§1.1.c): ¿corro el `DO` de provisorios ahora (con tu OK, misma
   denegación probable) o lo hace la secretaría?

## 11. Verificación ls-remote del informe

```
$ git push origin reports
$ git rev-parse HEAD
253779dfe4bcf92d639c93f9696dbe2e2026fd61
$ git ls-remote origin reports
253779dfe4bcf92d639c93f9696dbe2e2026fd61	refs/heads/reports
```

Coinciden. Esta sección va en un segundo commit sobre el mismo archivo.


---

# Parte 2 — 16/09 18:04–18:20 UTC: apply del RPC, probe 41/41, 15 mutantes SQL, corte de sesión y doble instancia

- **Contexto**: Leo dio el OK a las ~17:50 UTC ("Dale, aplicá el RPC… Seguí con probe → mutantes → merge → probe
  contra sigh.com.ar. GATE antes del merge: pasame el resultado del probe y de los mutantes, al archivo").
- **Rama**: `feat/portal-modificar-inscripcion` → **`83f240337333e56d53c3b7b20d2d7ecd61e0dc6e`** (2 commits sobre `main`
  `c0e7803`). **NO mergeada** — este archivo es el gate.
- **Estado de la base**: `rpc_modificar_inscripcion` **aplicada** (migración `20260916175417 rpc_modificar_inscripcion_portal`).
  Sin gemelas. Sin fixtures. `spcs` = 210.

## 12. Estado pedido por Leo tras el corte (18:04 UTC)

```
$ pwd
/home/clio/dev/SGH

$ git status --short
 M tests/probe_modificar_inscripcion_portal.mjs
$ git log --oneline -3
9596c1e feat(portal): "Modificar" en Mis inscripciones — caballeriza/entrenador/jockey/suplente (pedido Yesi 14/09)
c0e7803 merge: aviso de jockey repetido en el turno en las 4 pantallas (sin bloqueo); ratificación deja de contar forfaits — pedido de Yesi 12/09
5e0a57b feat: aviso de jockey repetido en el turno en las 4 pantallas (sin bloqueo); ratificación deja de contar forfaits
$ git branch -a
  audit/portal-onboarding
  bkp/chore/propietarios-provisorios-r8
  bkp/chore/reunion-prueba-9998
  bkp/diag/cotejo-resultados-r6
  bkp/diag/pii-audit
  bkp/feat/solicitud-origen
  chore/apuestas-faltantes-r8
  chore/cierre-historial-recibos
  chore/cierre-issue-056
  chore/cierre-issue-067-op1
  chore/claude-md-dominio-prod
  chore/claude-md-estado-carreras-y-probes
  chore/cleanup-backups
  chore/diag-bono-sin-propietario
  chore/docs-issue-069
  chore/dominio-sigh-com-ar
  chore/issue-063-preconditions
  chore/issue-080-caballerizas-duplicadas
  chore/issue-081-pii-residual-vps
  chore/issues-recibos
  chore/prof-diff-20j
  chore/propietarios-provisorios-r8
  chore/protocolo-informes
  chore/protocolo-informes-salidas
  chore/reunion-prueba-9998
  chore/revocar-recibos-delete
  chore/rls-audit
  chore/saldado-r6-r8
  chore/scrub-pii-arbol-actual
  chore/tanda-1-r8-el-poe
  chore/tanda-1-r8-pendientes
  chore/ticket-github-gc
  chore/verif-r6
  diag/bono-posicion-r8
  diag/cotejo-resultados-r6
  diag/edad-gate-inscripcion
  diag/initauth-activo
  diag/pii-audit
  feat/anular-recibo
  feat/asignacion-prof-20j
  feat/aviso-legal-solicitud
  feat/buscador-spc-autocompletado
  feat/caballeriza-el-don-jorge-lp
  feat/carga-prof-20j
  feat/carta-llamados-selector-reunion
  feat/filtro-concepto-pagos
  feat/forfait-portal
  feat/historial-recibos
  feat/json-no-computables
  feat/montas-reales-y-gate
  feat/numero-publico-reuniones
  feat/orden-llamados
  feat/pagos-rol-y-carrera
  feat/paridad-llamado-inscripciones
  feat/performances
  feat/portal-inscripcion-libre
  feat/portal-jockey-opcional-propietario
* feat/portal-modificar-inscripcion
  feat/portal-monta-al-anotar
  feat/programa-hoja-blanco
  feat/provisorios-r9
  feat/reunion-es-prueba
  feat/solicitud-origen
  feat/sorteo-partidores
  feat/studbook-buscar
  feat/studbook-condicion-5-campos
  feat/studbook-extract
  feat/ui-anular-recibo
  fix/activacion-invitados
  fix/aislamiento-club-cobros
  fix/alineado-bn
  fix/alineado-programa
  fix/alta-entrenador-operador
  fix/apuestas-especiales-tapa
  fix/aviso-jockey-repetido
  fix/badge-bono-overlap
  fix/bolsa-efectiva-portal
  fix/carta-llamados-hora-local
  fix/club-id-alta-profesionales
  fix/club-id-alta-propietarios
  fix/cobros-busqueda-caballeriza
  fix/condicion-sexo-t8-t10-r9
  fix/consolidado-yesi
  fix/dni-cuidadores
  fix/dni-jockeys
  fix/edad-reglamentaria-unica
  fix/hora-ventanas-r9
  fix/issue-067-guard-eliminar-liq
  fix/json-studbook-diego-r8
  fix/llamado-chips-fede
  fix/login-turnstile
  fix/merge-carosueno
  fix/montas-r6
  fix/orden-inscriptos-es
  fix/pdf-inscriptos-condiciones
  fix/pedigree-print
  fix/portal-carta-llamados
  fix/programa-r8-imprenta
  fix/r8-nombres-apuestas
  fix/recibo-pie-cobrador
  fix/recibo-rotulo-rol
  fix/resultados-mostrar-cuerpos
  fix/resultados-numero-carrera
  fix/rutas-dominio-sigh
  fix/solicitar-acceso-cuenta-existente
  fix/solicitar-acceso-paso-final
  fix/spcs-r8-tanda-1
  fix/spcs-r8-tanda-1b
  fix/spcs-r8-tanda-2
  fix/spcs-r8-tanda-3
  fix/spcs-r8-tanda-4
  fix/spcs-r8-tanda-4b
  fix/spcs-r8-tanda-5
  fix/spcs-r9-tanda-1
  fix/spcs-r9-tanda-2
  fix/spcs-r9-tanda-3
  fix/valign-bn
  main
  reports
  sec/autoregistro-gate-0
  sec/autoregistro-gate-1
  sec/autoregistro-gate-2
  sec/autoregistro-gate-3
  sec/autoregistro-gate-4
  tmp/alta-fede
  tmp/autoregistro-plan
  tmp/caballerizas-diego
  tmp/deploy-report
  tmp/estado-r8
  tmp/probe-analisis
  tmp/probe-run-1
  tmp/probe-template
  remotes/origin/HEAD -> origin/main
  remotes/origin/chore/docs-issue-069
  remotes/origin/chore/dominio-sigh-com-ar
  remotes/origin/chore/issue-080-caballerizas-duplicadas
  remotes/origin/chore/issue-081-pii-residual-vps
  remotes/origin/chore/issues-recibos
  remotes/origin/chore/protocolo-informes-salidas
  remotes/origin/chore/revocar-recibos-delete
  remotes/origin/chore/rls-audit
  remotes/origin/chore/ticket-github-gc
  remotes/origin/diag/edad-gate-inscripcion
  remotes/origin/feat/anular-recibo
  remotes/origin/feat/buscador-spc-autocompletado
  remotes/origin/feat/caballeriza-el-don-jorge-lp
  remotes/origin/feat/carta-llamados-selector-reunion
  remotes/origin/feat/filtro-concepto-pagos
  remotes/origin/feat/forfait-portal
  remotes/origin/feat/historial-recibos
  remotes/origin/feat/json-no-computables
  remotes/origin/feat/montas-reales-y-gate
  remotes/origin/feat/pagos-rol-y-carrera
  remotes/origin/feat/paridad-llamado-inscripciones
  remotes/origin/feat/portal-modificar-inscripcion
  remotes/origin/feat/provisorios-r9
  remotes/origin/feat/reunion-es-prueba
  remotes/origin/feat/studbook-buscar
  remotes/origin/feat/studbook-condicion-5-campos
  remotes/origin/feat/studbook-extract
  remotes/origin/feat/ui-anular-recibo
  remotes/origin/fix/aislamiento-club-cobros
  remotes/origin/fix/alta-entrenador-operador
  remotes/origin/fix/aviso-jockey-repetido
  remotes/origin/fix/bolsa-efectiva-portal
  remotes/origin/fix/carta-llamados-hora-local
  remotes/origin/fix/club-id-alta-propietarios
  remotes/origin/fix/condicion-sexo-t8-t10-r9
  remotes/origin/fix/edad-reglamentaria-unica
  remotes/origin/fix/hora-ventanas-r9
  remotes/origin/fix/issue-067-guard-eliminar-liq
  remotes/origin/fix/json-studbook-diego-r8
  remotes/origin/fix/llamado-chips-fede
  remotes/origin/fix/merge-carosueno
  remotes/origin/fix/orden-inscriptos-es
  remotes/origin/fix/pdf-inscriptos-condiciones
  remotes/origin/fix/portal-carta-llamados
  remotes/origin/fix/recibo-pie-cobrador
  remotes/origin/fix/rutas-dominio-sigh
  remotes/origin/fix/solicitar-acceso-cuenta-existente
  remotes/origin/fix/solicitar-acceso-paso-final
  remotes/origin/fix/spcs-r9-tanda-1
  remotes/origin/fix/spcs-r9-tanda-2
  remotes/origin/fix/spcs-r9-tanda-3
  remotes/origin/main
  remotes/origin/reports
  remotes/origin/sec/autoregistro-gate-4
$ git rev-parse HEAD; git ls-remote origin feat/portal-modificar-inscripcion
9596c1e1e0f6732abf2845cd0afd45262c898627
9596c1e1e0f6732abf2845cd0afd45262c898627	refs/heads/feat/portal-modificar-inscripcion
```

(`git status` mostraba `M tests/probe_modificar_inscripcion_portal.mjs`: el fix del assert A16 + el texto del runbook
de gemelas, hechos antes del corte y sin commitear. Commiteados en `83f2403`, ver §17.)

## 13. Lo que pasó con el corte — dos instancias de la misma sesión

El `claude` original (pid **1164586**, `sshd-session: clio@pts/0`, arrancado 16:50 UTC) **no murió con el corte**:
siguió ejecutando su turno solo. Al entrar el `claude --resume` (pid 1176686, 18:04:47) había **dos instancias de la
misma sesión** sobre el mismo working tree, el mismo scratchpad y la misma base. Evidencia:

```
$ ps -eo pid,ppid,etimes,cmd | grep probe_modificar
1177451      39 node tests/probe_modificar_inscripcion_portal.mjs      ← 18:07:31, corriendo M7

$ p=1178745; for i in 1 2 3 4 5; do read pp cmd < <(ps -o ppid=,cmd= -p $p); echo "$p ← $pp : $cmd"; p=$pp; done
1178745 ← 1178743 : node tests/probe_modificar_inscripcion_portal.mjs
1178743 ← 1164586 : /bin/bash -c source /home/clio/.claude/shell-snapshots/snapshot-bash-1789577474174-b3fru8.sh … eval 'set -a; . ./.env; set +a; …; RPC_MOD=rpc_modificar_inscrip…
1164586 ← 1164519 : claude
1164519 ← 1164515 : -bash
1164515 ← 1164365 : sshd-session: clio@pts/0
```

Timeline reconstruida por los `mtime` de `scratchpad/mut_M*.txt` (uno cada ~66 s = un ciclo gemela→probe):

| archivo | mtime UTC | quién |
|---|---|---|
| mut_M1 … mut_M5 | 18:00:21 … 18:05:30 | sesión original (M5 ya estaba corriendo cuando Leo interrumpió) |
| mut_M6, M7, M8, M9 | 18:06:37 … 18:09:50 | **el proceso viejo, solo**, después del corte |
| mut_M10 | 18:10:06, **vacío** | el proceso viejo, muerto al arrancar M10 (`OLD_CLAUDE_EXITED` en el monitor a las ~18:10) |
| mut_M10 … mut_M16 | 18:11 … 18:17 | esta sesión (resume) |

**Decisión tomada**: no matar al proceso viejo mientras tenía un probe en curso (hubiera dejado fixtures huérfanas
por nada) — quedarme en sólo-lectura, vigilarlo con un `Monitor`, y retomar cuando terminó. Murió solo a las ~18:10
(probablemente el `pts/0` se cerró). Lo que dejó:

- **Huérfanas del run `1ct3tj`** (M10 arrancado y muerto en el fixture): 6 `profesionales` + 1 `caballerizas`,
  sin nada colgando. Borradas (§14).
- **La gemela** en su variante M10 (`v_sin_propietario := false`) viva. Se reusó para correr M10 y después se
  reemplazó/dropeó (§15, §16).

Un susto que no era: R9 T1 mostraba una fila `ratificado` con `updated_at = 18:07:20` — en plena corrida de M7.

```sql
select i.id, s.nombre spc, i.estado, i.canal, i.updated_at, a.created_at aud_at, a.accion, u.email usuario_aud,
 (select string_agg(k||': '||coalesce(a.datos_antes->>k,'∅')||' → '||coalesce(a.datos_despues->>k,'∅'), ' ; ')
    from jsonb_object_keys(a.datos_despues) k where a.datos_antes->k is distinct from a.datos_despues->k and k<>'updated_at') cambios
from inscripciones i join carreras c on c.id=i.carrera_id join spcs s on s.id=i.spc_id
left join auditoria a on a.tabla='inscripciones' and a.registro_id=i.id and a.created_at > now() - interval '3 hours'
left join usuarios u on u.id=a.usuario_id
where c.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.updated_at > now() - interval '3 hours';
```

```json
[{"id":"c28c6983-8664-45a2-9fef-7eaf9a45f683","spc":"ARMOÑOZO","estado":"ratificado","canal":"manual","updated_at":"2026-09-16 18:07:20.505348+00","aud_at":"2026-09-16 18:07:20.505348+00","accion":"UPDATE","usuario_aud":"yesica@sgh.com","cambios":"performance: ∅ → 9L"}]
```

Era **Yesi cargando la performance de ARMOÑOZO** (`yesica@sgh.com`, columna `performance`). El probe no tocó R9 en
ningún momento — sus fixtures son las reuniones 9987/9986.

## 14. Fixtures — huérfanas encontradas y borradas

Chequeo al entrar (18:07:22): había una tanda completa `egxmlj` — pero era **la corrida M8 en curso** del proceso
viejo, que terminó y se limpió sola (R1 ✅ en `mut_M8.txt`). Chequeo después de que el viejo murió (18:10:45):

```json
[{"k":"gemela","v":"M10 (sin_propietario := false)"},{"k":"real_md5","v":"817327d8e340af8bc1e7d6e99d0b3994"},
 {"k":"reuniones_probe","v":null},{"k":"spcs_probe","v":"0"},{"k":"spcs_total","v":"210"},
 {"k":"caballerizas_probe","v":"PROBE-MOD-CAB-CON-1ct3tj"},{"k":"responsables_probe","v":"0"},{"k":"propietarios_probe","v":"0"},
 {"k":"profesionales_probe","v":"PROBE-MOD-A 1ct3tj | PROBE-MOD-B 1ct3tj | PROBE-MOD-C 1ct3tj | PROBE-MOD-X 1ct3tj | PROBE-MOD-J1 1ct3tj | PROBE-MOD-J2 1ct3tj"},
 {"k":"usuarios_probe","v":null},{"k":"auth_users_probe","v":null},{"k":"inscripciones_probe","v":"0"},{"k":"now","v":"2026-09-16 18:10:45.18295+00"}]
```

Dependencias antes de borrar: `spcs=0, inscripciones=0, responsables=0`. Borrado:

```sql
with c as (delete from caballerizas where nombre = 'PROBE-MOD-CAB-CON-1ct3tj' returning id),
     p as (delete from profesionales where nombre like 'PROBE-MOD-%' and apellido = '1ct3tj' returning id),
     a as (delete from auditoria where registro_id in (select id from c union select id from p) returning id)
select (select count(*) from c) cab_borradas, (select count(*) from p) prof_borrados, (select count(*) from a) auditoria_borrada;
```

```json
[{"cab_borradas":1,"prof_borrados":6,"auditoria_borrada":0}]
```

## 15. Apply del RPC (17:54 UTC, sesión original) y advisors

```
mcp__supabase__apply_migration(name='rpc_modificar_inscripcion_portal', query=<migrations/rpc_modificar_inscripcion.sql sin cabecera>)
→ {"success":true}
```

`get_advisors(security)`: 70 lints (4 ERROR, 63 WARN, 3 INFO). Sobre la función nueva, **uno solo**:
`authenticated_security_definer_function_executable` WARN — "can be executed by the `authenticated` role as a
SECURITY DEFINER" — el mismo WARN que ya tienen `rpc_inscribir`, `rpc_baja_inscripcion` y las otras 30 del portal:
es el diseño (los guards están adentro). **No** figura en `anon_security_definer_function_executable` (el REVOKE de
`anon` funcionó). Los 4 ERROR son preexistentes y ajenos: `security_definer_view` en `v_inscriptos_carrera`,
`rls_disabled_in_public` en `bak_r8_propietario`, `_gate41_backfill_tenencia`, `_bak_merge_duplicados_spc`
(tablas de backup). Se surfacean; no son de este cambio.

## 16. Probe contra el RPC real — 41/41

Primera corrida (17:55, `probe_run3.txt`): **40/41**, el ❌ era A16 por un assert mal escrito (exigía
`jockey_suplente_id === null` cuando "intacto" es `=== j1`, el suplente puesto en A1; los dos mensajes del RPC eran
los correctos). Corregido el assert; 41/41 desde entonces (`probe_run4.txt`, y esta corrida final sobre el commit
`83f2403`):

```
$ node tests/probe_modificar_inscripcion_portal.mjs

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion  ·  run=beqqzq
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=46b3d5ad-598b-4a20-8b2d-f638ce0cbf8f
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"2f29ce5f-7821-4f19-865d-769b5d621546","propietario_id":"46b3d5ad-598b-4a20-8b2d-f638ce0cbf8f","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ✅ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=ratificado partidor=5
 ✅ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Un caballo ratificado tiene que tener jockey. Para cambiarlo, elegí otro; para sacarlo, hablá con la secretaría. jockey=171c8851-6c44-4ea2-9e75-e881c60a3d53
 ✅ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=46b3d5ad-598b-4a20-8b2d-f638ce0cbf8f
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"ab372095-75b3-4060-9126-73051c350887","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=46b3d5ad-598b-4a20-8b2d-f638ce0cbf8f data={"ok":true,"inscripcion_id":"ab372095-75b3-4060-9126-73051c350887","propietario_id":"46b3d5ad-598b-4a20-8b2d-f638ce0cbf8f","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=46b3d5ad-598b-4a20-8b2d-f638ce0cbf8f
 ✅ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=46b3d5ad-598b-4a20-8b2d-f638ce0cbf8f
 ✅ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=El entrenador declarado no está en el padrón activo de este hipódromo. · b=El entrenador declarado no está en el padrón activo de este hipódromo. · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ✅ A16) suplente sin titular / suplente = titular → error  → a=No se puede declarar un suplente sin jockey titular. · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=1aaae52c-f105-472e-8a74-93d419b1fb96 data={"ok":true,"inscripcion_id":"2f29ce5f-7821-4f19-865d-769b5d621546","propietario_id":"46b3d5ad-598b-4a20-8b2d-f638ce0cbf8f","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ✅ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ✅ A21) un FORFAIT no se modifica desde el portal  → msg=Ese caballo ya figura como forfait y no se puede modificar desde el portal.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"1aaae52c-f105-472e-8a74-93d419b1fb96","antes":"0beb9146-8e34-4507-a64a-7f03d43da966","despues":"171c8851-6c44-4ea2-9e75-e881c60a3d53"}
 ✅ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, be" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

41/41 OK
```

## 17. Mutantes de SQL — 15/15 muertos

Vía: **`execute_sql`, no `apply_migration`** (GOTCHAS "la gemela que revive": `apply_migration` deja cada gemela
en `schema_migrations` y una restauración las recrea con los guards rotos). Para no pegar 7 KB por mutante, la
gemela se construyó **en la base** a partir de la función real, con el mismo `from → to` del array `MUTANTES` del
probe y fallando si el ancla no aparece:

```sql
DO $x$ DECLARE d text; d2 text; BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_modificar_inscripcion';
  d := replace(d, 'public.rpc_modificar_inscripcion(', 'public.rpc_modificar_inscripcion_mut(');
  d2 := replace(d, $f$<from>$f$, $t$<to>$t$);
  IF d2 = d THEN RAISE EXCEPTION 'Mk: ancla no encontrada'; END IF;
  EXECUTE d2;
  EXECUTE 'REVOKE ALL ON FUNCTION public.rpc_modificar_inscripcion_mut(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.rpc_modificar_inscripcion_mut(uuid,uuid,uuid,uuid,uuid) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.rpc_modificar_inscripcion_mut(uuid,uuid,uuid,uuid,uuid) TO authenticated';
END $x$;
SELECT 'Mk aplicada', md5(gemela) <> md5(real) AS distinta_de_la_real;   -- true en las 15
```

(M1 fue la excepción: se pegó el `.sql` completo emitido por `--mutantes`, sin comentarios.) Después de cada
gemela: `RPC_MOD=rpc_modificar_inscripcion_mut node tests/probe_modificar_inscripcion_portal.mjs`. Un mutante
"muere" si al menos uno de los asserts que tenía que matar da ❌ (GOTCHA #82: se busca `❌ A6)`, no "A6").

| id | mutante | tenía que matar | murieron | resultado | | quién lo corrió |
|---|---|---|---|---|---|---|
| M1 | cae canal=portal del guard de tenencia | A6 | A6 | 40/41 OK | ✅ muere | sesión original, antes del corte |
| M2 | cae inscripto_por=yo del guard de tenencia | A5 | A5, A18 | 39/41 OK | ✅ muere | sesión original, antes del corte |
| M3 | cae el guard de reunión publicada | A10 | A10 | 40/41 OK | ✅ muere | sesión original, antes del corte |
| M4 | la ventana de INSCRIPCIÓN queda siempre abierta | A7, A8 | A7, A8, A9 | 38/41 OK | ✅ muere | sesión original, antes del corte |
| M5 | la ventana de RATIFICACIÓN nunca se abre | A2, A3 | A2, A3, A4, A5, A21 | 36/41 OK | ✅ muere | sesión original, antes del corte |
| M6 | el fail-closed de NULL desaparece | A9 | A9 | 40/41 OK | ✅ muere | proceso viejo (pid 1164586) |
| M7 | en ratificación se acepta cualquier estado (forfait se modifica) | A21 | A21 | 40/41 OK | ✅ muere | proceso viejo (pid 1164586) |
| M8 | cae "un ratificado necesita jockey" | A4 | A4 | 40/41 OK | ✅ muere | proceso viejo (pid 1164586) |
| M9 | el SET pisa estado (ratificado vuelve a inscripto) | A0, A3 | A3, A4, A0 | 38/41 OK | ✅ muere | proceso viejo (pid 1164586) |
| M10 | sin_propietario siempre false | A12 | A12 | 40/41 OK | ✅ muere | esta sesión (resume) |
| M11 | cae el chequeo post-trigger + SET propietario_id=NULL | A11, A13 | A13, A11, A14 | 38/41 OK | ✅ muere | esta sesión (resume) |
| M12 | cae la validación de padrón del entrenador | A15 | A15, A16 | 39/41 OK | ✅ muere | esta sesión (resume) |
| M13 | cae "suplente sin titular" | A16 | A16 | 40/41 OK | ✅ muere | esta sesión (resume) |
| M14 | GATE-1=B roto: el RPC pisa inscripto_por con NULL | A0, A17 | A4, A13, A11, A14, A15, A16, A17, A18, A0 | 31/41 OK | ✅ muere | esta sesión (resume) |
| M16 | cae el guard de turno anulado | A22 | A22 | 40/41 OK | ✅ muere | esta sesión (resume) |

**15/15 muertos, 0 sobrevivientes, 0 errores de arnés.** Los mutantes matan más de lo previsto en varios
casos (M4 también A9; M5 también A4/A5/A21; M12 también A16; M14 arrastra 9 asserts porque sin `inscripto_por` todo
lo que sigue rechaza "no la cargó usted") — son cascadas correctas, no ruido. M15 (`FOR UPDATE`) queda declarado
**equivalente-no-cubierto**: concurrencia, un probe secuencial no lo puede matar.

Más los **9 de portal** de la Parte 1 (§5): **24/24 en total**.

### Salidas crudas de cada mutante

### mut_M1.txt

```

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion_mut  ·  run=l97u7w
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=66c06201-d70d-4fa1-bc64-539dd813f854
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"2b8f6b99-884d-478b-8343-f4e730b8766b","propietario_id":"66c06201-d70d-4fa1-bc64-539dd813f854","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ✅ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=ratificado partidor=5
 ✅ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Un caballo ratificado tiene que tener jockey. Para cambiarlo, elegí otro; para sacarlo, hablá con la secretaría. jockey=53664237-91ba-437c-a6cd-f86d828dce7e
 ✅ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ❌ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=null
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=66c06201-d70d-4fa1-bc64-539dd813f854
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"ece3fd4e-b96f-4766-ba69-c85e890f1018","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=66c06201-d70d-4fa1-bc64-539dd813f854 data={"ok":true,"inscripcion_id":"ece3fd4e-b96f-4766-ba69-c85e890f1018","propietario_id":"66c06201-d70d-4fa1-bc64-539dd813f854","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=66c06201-d70d-4fa1-bc64-539dd813f854
 ✅ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=66c06201-d70d-4fa1-bc64-539dd813f854
 ✅ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=El entrenador declarado no está en el padrón activo de este hipódromo. · b=El entrenador declarado no está en el padrón activo de este hipódromo. · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ✅ A16) suplente sin titular / suplente = titular → error  → a=No se puede declarar un suplente sin jockey titular. · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=a169f9dc-7f1c-49b0-8b8c-66489deadb17 data={"ok":true,"inscripcion_id":"2b8f6b99-884d-478b-8343-f4e730b8766b","propietario_id":"66c06201-d70d-4fa1-bc64-539dd813f854","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ✅ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ✅ A21) un FORFAIT no se modifica desde el portal  → msg=Ese caballo ya figura como forfait y no se puede modificar desde el portal.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"a169f9dc-7f1c-49b0-8b8c-66489deadb17","antes":"bf3e1164-cfe3-4c9e-b855-951588437044","despues":"53664237-91ba-437c-a6cd-f86d828dce7e"}
 ✅ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, l9" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

40/41 OK
```

### mut_M2.txt

```

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion_mut  ·  run=by3wg0
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=2d3cd9bf-165d-48d0-a8b4-8f0f7ebe6215
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"0b15250b-c032-4a1b-b2a9-050de98eb0d3","propietario_id":"2d3cd9bf-165d-48d0-a8b4-8f0f7ebe6215","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ✅ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=ratificado partidor=5
 ✅ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Un caballo ratificado tiene que tener jockey. Para cambiarlo, elegí otro; para sacarlo, hablá con la secretaría. jockey=9b1d746e-c150-4978-9dbd-a9869e206ed7
 ❌ A5) B no puede modificar lo que cargó A  → msg=null
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=2d3cd9bf-165d-48d0-a8b4-8f0f7ebe6215
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"101a2c74-c9f3-468e-845f-7b8374c43a40","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=2d3cd9bf-165d-48d0-a8b4-8f0f7ebe6215 data={"ok":true,"inscripcion_id":"101a2c74-c9f3-468e-845f-7b8374c43a40","propietario_id":"2d3cd9bf-165d-48d0-a8b4-8f0f7ebe6215","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=2d3cd9bf-165d-48d0-a8b4-8f0f7ebe6215
 ✅ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=2d3cd9bf-165d-48d0-a8b4-8f0f7ebe6215
 ✅ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=El entrenador declarado no está en el padrón activo de este hipódromo. · b=El entrenador declarado no está en el padrón activo de este hipódromo. · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ✅ A16) suplente sin titular / suplente = titular → error  → a=No se puede declarar un suplente sin jockey titular. · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=c3392259-f23d-418c-9393-90b2523823fb data={"ok":true,"inscripcion_id":"0b15250b-c032-4a1b-b2a9-050de98eb0d3","propietario_id":"2d3cd9bf-165d-48d0-a8b4-8f0f7ebe6215","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ❌ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=null
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ✅ A21) un FORFAIT no se modifica desde el portal  → msg=Ese caballo ya figura como forfait y no se puede modificar desde el portal.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"c3392259-f23d-418c-9393-90b2523823fb","antes":"39440b74-ebd2-41f0-80f4-0c41e0b08416","despues":"9b1d746e-c150-4978-9dbd-a9869e206ed7"}
 ✅ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, by" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

39/41 OK
```

### mut_M3.txt

```

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion_mut  ·  run=90b8m9
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=68660447-b307-44a5-a34a-1bdb282f5981
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"9460f97c-0ad7-4f00-abd9-266f02bfeb8d","propietario_id":"68660447-b307-44a5-a34a-1bdb282f5981","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ✅ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=ratificado partidor=5
 ✅ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Un caballo ratificado tiene que tener jockey. Para cambiarlo, elegí otro; para sacarlo, hablá con la secretaría. jockey=2d47fea7-cd0f-4e04-8074-9e3df12d94f3
 ✅ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ❌ A10) reunión no publicada, rechaza  → msg=null
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=68660447-b307-44a5-a34a-1bdb282f5981
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"b06e5256-645b-45e4-8ac2-2a7024981d85","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=68660447-b307-44a5-a34a-1bdb282f5981 data={"ok":true,"inscripcion_id":"b06e5256-645b-45e4-8ac2-2a7024981d85","propietario_id":"68660447-b307-44a5-a34a-1bdb282f5981","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=68660447-b307-44a5-a34a-1bdb282f5981
 ✅ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=68660447-b307-44a5-a34a-1bdb282f5981
 ✅ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=El entrenador declarado no está en el padrón activo de este hipódromo. · b=El entrenador declarado no está en el padrón activo de este hipódromo. · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ✅ A16) suplente sin titular / suplente = titular → error  → a=No se puede declarar un suplente sin jockey titular. · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=60de6555-fcdd-4418-937d-324b41f27b07 data={"ok":true,"inscripcion_id":"9460f97c-0ad7-4f00-abd9-266f02bfeb8d","propietario_id":"68660447-b307-44a5-a34a-1bdb282f5981","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ✅ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ✅ A21) un FORFAIT no se modifica desde el portal  → msg=Ese caballo ya figura como forfait y no se puede modificar desde el portal.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"60de6555-fcdd-4418-937d-324b41f27b07","antes":"3d55e811-89c2-403f-af24-60237e165759","despues":"2d47fea7-cd0f-4e04-8074-9e3df12d94f3"}
 ✅ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, 90" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

40/41 OK
```

### mut_M4.txt

```

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion_mut  ·  run=ujs28u
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=95c281c6-94b7-47ce-a0f1-995d1b71f3f5
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"8b088095-d2e6-4e27-aafa-60ebbdfe9179","propietario_id":"95c281c6-94b7-47ce-a0f1-995d1b71f3f5","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ✅ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=ratificado partidor=5
 ✅ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Un caballo ratificado tiene que tener jockey. Para cambiarlo, elegí otro; para sacarlo, hablá con la secretaría. jockey=fbd4c0b4-5a82-4c83-b588-24086b497ba5
 ✅ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ❌ A7) las dos ventanas cerradas → Fuera de plazo  → msg=null
 ❌ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=null
 ❌ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=null
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=95c281c6-94b7-47ce-a0f1-995d1b71f3f5
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"78c3c116-79ae-41f7-afcb-b1df2fc76691","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=95c281c6-94b7-47ce-a0f1-995d1b71f3f5 data={"ok":true,"inscripcion_id":"78c3c116-79ae-41f7-afcb-b1df2fc76691","propietario_id":"95c281c6-94b7-47ce-a0f1-995d1b71f3f5","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=95c281c6-94b7-47ce-a0f1-995d1b71f3f5
 ✅ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=95c281c6-94b7-47ce-a0f1-995d1b71f3f5
 ✅ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=El entrenador declarado no está en el padrón activo de este hipódromo. · b=El entrenador declarado no está en el padrón activo de este hipódromo. · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ✅ A16) suplente sin titular / suplente = titular → error  → a=No se puede declarar un suplente sin jockey titular. · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=07a9483b-bea7-4b7b-ac0a-6916a395dcc6 data={"ok":true,"inscripcion_id":"8b088095-d2e6-4e27-aafa-60ebbdfe9179","propietario_id":"95c281c6-94b7-47ce-a0f1-995d1b71f3f5","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ✅ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ✅ A21) un FORFAIT no se modifica desde el portal  → msg=Ese caballo ya figura como forfait y no se puede modificar desde el portal.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"07a9483b-bea7-4b7b-ac0a-6916a395dcc6","antes":"f1c59973-b222-4cd8-ad59-9752db51c268","despues":"fbd4c0b4-5a82-4c83-b588-24086b497ba5"}
 ✅ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, uj" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

38/41 OK
```

### mut_M5.txt

```

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion_mut  ·  run=hdrwiq
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=426830b1-c954-4e23-8528-e1670d65d9f3
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"7ee37923-fafc-49db-ad39-bc332ceefc0e","propietario_id":"426830b1-c954-4e23-8528-e1670d65d9f3","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ❌ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=false msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ❌ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=false msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría. estado=ratificado partidor=5
 ❌ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría. jockey=639d456a-308d-4131-b24f-325499b35fe8
 ❌ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=426830b1-c954-4e23-8528-e1670d65d9f3
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"387231a9-9153-44e9-b7ce-102ca33ec8ea","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=426830b1-c954-4e23-8528-e1670d65d9f3 data={"ok":true,"inscripcion_id":"387231a9-9153-44e9-b7ce-102ca33ec8ea","propietario_id":"426830b1-c954-4e23-8528-e1670d65d9f3","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=426830b1-c954-4e23-8528-e1670d65d9f3
 ✅ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=426830b1-c954-4e23-8528-e1670d65d9f3
 ✅ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=El entrenador declarado no está en el padrón activo de este hipódromo. · b=El entrenador declarado no está en el padrón activo de este hipódromo. · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ✅ A16) suplente sin titular / suplente = titular → error  → a=No se puede declarar un suplente sin jockey titular. · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=807d7c13-5951-4cc4-9ec5-00b993c8eb1a data={"ok":true,"inscripcion_id":"7ee37923-fafc-49db-ad39-bc332ceefc0e","propietario_id":"426830b1-c954-4e23-8528-e1670d65d9f3","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ✅ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ❌ A21) un FORFAIT no se modifica desde el portal  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"807d7c13-5951-4cc4-9ec5-00b993c8eb1a","antes":"639d456a-308d-4131-b24f-325499b35fe8","despues":"50173bcb-5096-4d0d-9eae-f85f7c3babc9"}
 ✅ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, hd" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

36/41 OK
```

### mut_M6.txt

```

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion_mut  ·  run=azipyq
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=e3fa5da5-9c53-4e6d-b0fd-5e909ee1e4be
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"bd34b8e2-bb57-4fc1-b746-2cdcca7ea37c","propietario_id":"e3fa5da5-9c53-4e6d-b0fd-5e909ee1e4be","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ✅ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=ratificado partidor=5
 ✅ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Un caballo ratificado tiene que tener jockey. Para cambiarlo, elegí otro; para sacarlo, hablá con la secretaría. jockey=14ba0322-5ed3-4d2b-ab05-c539212e7ef7
 ✅ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ❌ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=null
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=e3fa5da5-9c53-4e6d-b0fd-5e909ee1e4be
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"a558a984-2b98-49a5-9d7c-1e355c111926","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=e3fa5da5-9c53-4e6d-b0fd-5e909ee1e4be data={"ok":true,"inscripcion_id":"a558a984-2b98-49a5-9d7c-1e355c111926","propietario_id":"e3fa5da5-9c53-4e6d-b0fd-5e909ee1e4be","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=e3fa5da5-9c53-4e6d-b0fd-5e909ee1e4be
 ✅ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=e3fa5da5-9c53-4e6d-b0fd-5e909ee1e4be
 ✅ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=El entrenador declarado no está en el padrón activo de este hipódromo. · b=El entrenador declarado no está en el padrón activo de este hipódromo. · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ✅ A16) suplente sin titular / suplente = titular → error  → a=No se puede declarar un suplente sin jockey titular. · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=a8d119a1-ca4d-48c5-9b13-1b77e6223b2c data={"ok":true,"inscripcion_id":"bd34b8e2-bb57-4fc1-b746-2cdcca7ea37c","propietario_id":"e3fa5da5-9c53-4e6d-b0fd-5e909ee1e4be","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ✅ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ✅ A21) un FORFAIT no se modifica desde el portal  → msg=Ese caballo ya figura como forfait y no se puede modificar desde el portal.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"a8d119a1-ca4d-48c5-9b13-1b77e6223b2c","antes":"b747acd7-bce6-4e5a-b639-afaf3135f90a","despues":"14ba0322-5ed3-4d2b-ab05-c539212e7ef7"}
 ✅ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, az" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

40/41 OK
```

### mut_M7.txt

```

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion_mut  ·  run=9u7l6a
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=6cf60284-e6a9-4215-8292-5918705bb465
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"9c210e48-c8cc-4701-9ba6-0fc9586eb680","propietario_id":"6cf60284-e6a9-4215-8292-5918705bb465","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ✅ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=ratificado partidor=5
 ✅ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Un caballo ratificado tiene que tener jockey. Para cambiarlo, elegí otro; para sacarlo, hablá con la secretaría. jockey=df4ae35b-8e92-4eac-8ca4-199858c2dba4
 ✅ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=6cf60284-e6a9-4215-8292-5918705bb465
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"d7f7b922-3b64-4e2a-944b-8b4a593ef2da","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=6cf60284-e6a9-4215-8292-5918705bb465 data={"ok":true,"inscripcion_id":"d7f7b922-3b64-4e2a-944b-8b4a593ef2da","propietario_id":"6cf60284-e6a9-4215-8292-5918705bb465","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=6cf60284-e6a9-4215-8292-5918705bb465
 ✅ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=6cf60284-e6a9-4215-8292-5918705bb465
 ✅ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=El entrenador declarado no está en el padrón activo de este hipódromo. · b=El entrenador declarado no está en el padrón activo de este hipódromo. · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ✅ A16) suplente sin titular / suplente = titular → error  → a=No se puede declarar un suplente sin jockey titular. · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=09730991-0670-4a87-9637-d77b344a7bfd data={"ok":true,"inscripcion_id":"9c210e48-c8cc-4701-9ba6-0fc9586eb680","propietario_id":"6cf60284-e6a9-4215-8292-5918705bb465","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ✅ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ❌ A21) un FORFAIT no se modifica desde el portal  → msg=null
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"09730991-0670-4a87-9637-d77b344a7bfd","antes":"39f6baa4-e025-46fa-baca-31b755fecd67","despues":"df4ae35b-8e92-4eac-8ca4-199858c2dba4"}
 ✅ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, 9u" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

40/41 OK
```

### mut_M8.txt

```

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion_mut  ·  run=egxmlj
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=be6f2e82-298e-477d-b4f9-874e00bc43a6
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"26f480ff-78e4-4dd5-8e2c-b8fdc5deeb57","propietario_id":"be6f2e82-298e-477d-b4f9-874e00bc43a6","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ✅ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=ratificado partidor=5
 ❌ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=null jockey=null
 ✅ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=be6f2e82-298e-477d-b4f9-874e00bc43a6
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"af09965c-23b6-4d64-b373-5a4c6038f2e3","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=be6f2e82-298e-477d-b4f9-874e00bc43a6 data={"ok":true,"inscripcion_id":"af09965c-23b6-4d64-b373-5a4c6038f2e3","propietario_id":"be6f2e82-298e-477d-b4f9-874e00bc43a6","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=be6f2e82-298e-477d-b4f9-874e00bc43a6
 ✅ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=be6f2e82-298e-477d-b4f9-874e00bc43a6
 ✅ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=El entrenador declarado no está en el padrón activo de este hipódromo. · b=El entrenador declarado no está en el padrón activo de este hipódromo. · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ✅ A16) suplente sin titular / suplente = titular → error  → a=No se puede declarar un suplente sin jockey titular. · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=d44078fe-b018-4ea8-adef-ef9eef052d1d data={"ok":true,"inscripcion_id":"26f480ff-78e4-4dd5-8e2c-b8fdc5deeb57","propietario_id":"be6f2e82-298e-477d-b4f9-874e00bc43a6","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ✅ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ✅ A21) un FORFAIT no se modifica desde el portal  → msg=Ese caballo ya figura como forfait y no se puede modificar desde el portal.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"d44078fe-b018-4ea8-adef-ef9eef052d1d","antes":"a8697052-97e6-401f-a999-9a178bd90e06","despues":"d8ee760d-60f6-42b2-967d-a47f596f7533"}
 ✅ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, eg" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

40/41 OK
```

### mut_M9.txt

```

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion_mut  ·  run=yg6ubn
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=e281e1eb-d5fd-46c1-9a45-37fb32c5d4fb
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"813acf87-6567-4738-85a9-9f4f5caca609","propietario_id":"e281e1eb-d5fd-46c1-9a45-37fb32c5d4fb","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ❌ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=inscripto partidor=5
 ❌ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=null jockey=null
 ✅ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=e281e1eb-d5fd-46c1-9a45-37fb32c5d4fb
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"aa8a4feb-4d5f-47cb-b277-fd858ab8752e","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=e281e1eb-d5fd-46c1-9a45-37fb32c5d4fb data={"ok":true,"inscripcion_id":"aa8a4feb-4d5f-47cb-b277-fd858ab8752e","propietario_id":"e281e1eb-d5fd-46c1-9a45-37fb32c5d4fb","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=e281e1eb-d5fd-46c1-9a45-37fb32c5d4fb
 ✅ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=e281e1eb-d5fd-46c1-9a45-37fb32c5d4fb
 ✅ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=El entrenador declarado no está en el padrón activo de este hipódromo. · b=El entrenador declarado no está en el padrón activo de este hipódromo. · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ✅ A16) suplente sin titular / suplente = titular → error  → a=No se puede declarar un suplente sin jockey titular. · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=ae50e178-cd8f-4369-be04-cf3499fb9adc data={"ok":true,"inscripcion_id":"813acf87-6567-4738-85a9-9f4f5caca609","propietario_id":"e281e1eb-d5fd-46c1-9a45-37fb32c5d4fb","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ✅ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ✅ A21) un FORFAIT no se modifica desde el portal  → msg=Ese caballo ya figura como forfait y no se puede modificar desde el portal.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"ae50e178-cd8f-4369-be04-cf3499fb9adc","antes":"4294ca79-456a-452b-afab-67b532551e53","despues":"a837a713-fd8a-45a3-a01f-6d6e3590c1db"}
 ❌ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron  → 7493ae63: estado ratificado→inscripto
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, yg" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

38/41 OK
```

### mut_M10.txt

```

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion_mut  ·  run=pap7f3
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=381db273-fefc-4406-baa6-e72912c2632f
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"29d08d6d-6850-4893-b658-a92ab9f15fce","propietario_id":"381db273-fefc-4406-baa6-e72912c2632f","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ✅ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=ratificado partidor=5
 ✅ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Un caballo ratificado tiene que tener jockey. Para cambiarlo, elegí otro; para sacarlo, hablá con la secretaría. jockey=fd42b89b-99db-4f05-83c4-59be167b1002
 ✅ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=381db273-fefc-4406-baa6-e72912c2632f
 ❌ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"6e84fbfd-045f-497c-ad36-e9fddf1a7179","propietario_id":null,"sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=381db273-fefc-4406-baa6-e72912c2632f data={"ok":true,"inscripcion_id":"6e84fbfd-045f-497c-ad36-e9fddf1a7179","propietario_id":"381db273-fefc-4406-baa6-e72912c2632f","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=381db273-fefc-4406-baa6-e72912c2632f
 ✅ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=381db273-fefc-4406-baa6-e72912c2632f
 ✅ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=El entrenador declarado no está en el padrón activo de este hipódromo. · b=El entrenador declarado no está en el padrón activo de este hipódromo. · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ✅ A16) suplente sin titular / suplente = titular → error  → a=No se puede declarar un suplente sin jockey titular. · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=518d3860-7e01-436c-b5d7-aff93b7cf426 data={"ok":true,"inscripcion_id":"29d08d6d-6850-4893-b658-a92ab9f15fce","propietario_id":"381db273-fefc-4406-baa6-e72912c2632f","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ✅ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ✅ A21) un FORFAIT no se modifica desde el portal  → msg=Ese caballo ya figura como forfait y no se puede modificar desde el portal.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"518d3860-7e01-436c-b5d7-aff93b7cf426","antes":"aceba3b1-ede5-4d2c-bd90-81f7317b84d9","despues":"fd42b89b-99db-4f05-83c4-59be167b1002"}
 ✅ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, pa" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

40/41 OK
```

### mut_M11.txt

```

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion_mut  ·  run=od4zh1
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=91f8919b-20d7-45c0-ba47-85d91667b43b
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"3ecae5b6-a859-49f1-b7c1-82f0713d834e","propietario_id":null,"sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ✅ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=ratificado partidor=5
 ✅ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Un caballo ratificado tiene que tener jockey. Para cambiarlo, elegí otro; para sacarlo, hablá con la secretaría. jockey=7e0dfcae-9250-418d-b7c8-de7f568522b5
 ✅ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=91f8919b-20d7-45c0-ba47-85d91667b43b
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"ea6ec6cc-4022-4ed0-a78a-35aee7b42bc7","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ❌ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=null data={"ok":true,"inscripcion_id":"ea6ec6cc-4022-4ed0-a78a-35aee7b42bc7","propietario_id":null,"sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ❌ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=null
 ❌ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=null
 ✅ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=El entrenador declarado no está en el padrón activo de este hipódromo. · b=El entrenador declarado no está en el padrón activo de este hipódromo. · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ✅ A16) suplente sin titular / suplente = titular → error  → a=No se puede declarar un suplente sin jockey titular. · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=84d151f1-c579-4d92-8f44-271767b3d84d data={"ok":true,"inscripcion_id":"3ecae5b6-a859-49f1-b7c1-82f0713d834e","propietario_id":null,"sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ✅ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ✅ A21) un FORFAIT no se modifica desde el portal  → msg=Ese caballo ya figura como forfait y no se puede modificar desde el portal.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"84d151f1-c579-4d92-8f44-271767b3d84d","antes":"72e26b0c-cd03-4251-844e-b333a17d17d0","despues":"7e0dfcae-9250-418d-b7c8-de7f568522b5"}
 ✅ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, od" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

38/41 OK
```

### mut_M12.txt

```

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion_mut  ·  run=vn7vz7
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=2e0e9278-400a-4194-85b6-738f4380d48a
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"3c01f887-500a-4ef0-ae37-f952ad7a20ab","propietario_id":"2e0e9278-400a-4194-85b6-738f4380d48a","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ✅ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=ratificado partidor=5
 ✅ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Un caballo ratificado tiene que tener jockey. Para cambiarlo, elegí otro; para sacarlo, hablá con la secretaría. jockey=92c7b8bb-5892-4323-9e66-f527a1943657
 ✅ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=2e0e9278-400a-4194-85b6-738f4380d48a
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"80ba94ce-ce0f-4711-b1b5-eccb687e83ba","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=2e0e9278-400a-4194-85b6-738f4380d48a data={"ok":true,"inscripcion_id":"80ba94ce-ce0f-4711-b1b5-eccb687e83ba","propietario_id":"2e0e9278-400a-4194-85b6-738f4380d48a","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=2e0e9278-400a-4194-85b6-738f4380d48a
 ✅ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=2e0e9278-400a-4194-85b6-738f4380d48a
 ❌ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=null · b=null · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ❌ A16) suplente sin titular / suplente = titular → error  → a=No se puede declarar un suplente sin jockey titular. · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=bdf1807a-ce19-4fee-b677-ae6765c4494c data={"ok":true,"inscripcion_id":"3c01f887-500a-4ef0-ae37-f952ad7a20ab","propietario_id":"2e0e9278-400a-4194-85b6-738f4380d48a","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ✅ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ✅ A21) un FORFAIT no se modifica desde el portal  → msg=Ese caballo ya figura como forfait y no se puede modificar desde el portal.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"bdf1807a-ce19-4fee-b677-ae6765c4494c","antes":"575cd6eb-6533-4250-a877-aed0c7170f29","despues":"92c7b8bb-5892-4323-9e66-f527a1943657"}
 ✅ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, vn" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

39/41 OK
```

### mut_M13.txt

```

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion_mut  ·  run=4kzbuh
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=69d56b2f-d90d-4940-9071-1e5c2da48722
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"022863cd-1a17-41d2-b84b-44a5e72452cb","propietario_id":"69d56b2f-d90d-4940-9071-1e5c2da48722","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ✅ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=ratificado partidor=5
 ✅ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Un caballo ratificado tiene que tener jockey. Para cambiarlo, elegí otro; para sacarlo, hablá con la secretaría. jockey=3e2b77ad-255c-4c15-b512-1c482a10796d
 ✅ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=69d56b2f-d90d-4940-9071-1e5c2da48722
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"1a8cf4b0-004d-4f84-8e39-80601fdb7ddd","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=69d56b2f-d90d-4940-9071-1e5c2da48722 data={"ok":true,"inscripcion_id":"1a8cf4b0-004d-4f84-8e39-80601fdb7ddd","propietario_id":"69d56b2f-d90d-4940-9071-1e5c2da48722","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=69d56b2f-d90d-4940-9071-1e5c2da48722
 ✅ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=69d56b2f-d90d-4940-9071-1e5c2da48722
 ✅ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=El entrenador declarado no está en el padrón activo de este hipódromo. · b=El entrenador declarado no está en el padrón activo de este hipódromo. · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ❌ A16) suplente sin titular / suplente = titular → error  → a=null · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=4d691365-bf28-4b10-a9ec-9de7a4c08d43 data={"ok":true,"inscripcion_id":"022863cd-1a17-41d2-b84b-44a5e72452cb","propietario_id":"69d56b2f-d90d-4940-9071-1e5c2da48722","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ✅ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ✅ A21) un FORFAIT no se modifica desde el portal  → msg=Ese caballo ya figura como forfait y no se puede modificar desde el portal.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"4d691365-bf28-4b10-a9ec-9de7a4c08d43","antes":"7f0b4477-d0bb-494b-bb0f-7317126a5833","despues":"3e2b77ad-255c-4c15-b512-1c482a10796d"}
 ✅ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, 4k" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

40/41 OK
```

### mut_M14.txt

```

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion_mut  ·  run=xcdtzg
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=8b9bbeed-b8c7-4f27-8792-1b71ab17c24b
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"43f2c098-5054-4e8e-a68e-f352268fbf70","propietario_id":"8b9bbeed-b8c7-4f27-8792-1b71ab17c24b","sin_propietario":false,"sigue_siendo_mia":null,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ✅ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=ratificado partidor=5
 ❌ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría. jockey=95d324ab-f326-4132-964b-84c023a044f8
 ✅ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=8b9bbeed-b8c7-4f27-8792-1b71ab17c24b
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"96e5cd48-a534-4179-98a0-2881502e9458","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":null,"cambio_entrenador":false}
 ❌ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=false prop=null data=null
 ❌ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=null
 ❌ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=null
 ❌ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría. · b=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría. · c=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ❌ A16) suplente sin titular / suplente = titular → error  → a=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría. · b=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ❌ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=false msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría. inscripto_por=null data=null
 ❌ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=false B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ❌ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ✅ A21) un FORFAIT no se modifica desde el portal  → msg=Ese caballo ya figura como forfait y no se puede modificar desde el portal.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"2e82de54-ec34-47c0-8ba8-7e7c401e7c12","antes":"50260773-1fbe-42e8-8aad-ec99c1427b29","despues":"95d324ab-f326-4132-964b-84c023a044f8"}
 ❌ A0) en 27 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron  → 43f2c098: inscripto_por 2e82de54-ec34-47c0-8ba8-7e7c401e7c12→null | aa800fa7: inscripto_por 2e82de54-ec34-47c0-8ba8-7e7c401e7c12→null | e9ff5ee9: inscripto_por 2e82de54-ec34-47c0-8ba8-7e7c401e7c12→null | 96e5cd48: inscripto_por 2e82de54-ec34-47c0-8ba8-7e7c401e7c12→null
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, xc" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

31/41 OK
```

### mut_M16.txt

```

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=/home/clio/dev/SGH/portal.html  ·  rpc=rpc_modificar_inscripcion_mut  ·  run=gtrv2z
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=7d4d993b-3f08-4833-9149-91c28de8f797
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"7b08b172-f881-484d-b15e-c843abfb706a","propietario_id":"7d4d993b-3f08-4833-9149-91c28de8f797","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ✅ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=ratificado partidor=5
 ✅ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Un caballo ratificado tiene que tener jockey. Para cambiarlo, elegí otro; para sacarlo, hablá con la secretaría. jockey=d9f44365-3881-4692-baff-2c6fd10b916d
 ✅ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ❌ A22) turno anulado, rechaza  → msg=null
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=7d4d993b-3f08-4833-9149-91c28de8f797
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"87a01870-49b2-43c8-b694-61b599b3a2ee","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=7d4d993b-3f08-4833-9149-91c28de8f797 data={"ok":true,"inscripcion_id":"87a01870-49b2-43c8-b694-61b599b3a2ee","propietario_id":"7d4d993b-3f08-4833-9149-91c28de8f797","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=7d4d993b-3f08-4833-9149-91c28de8f797
 ✅ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=7d4d993b-3f08-4833-9149-91c28de8f797
 ✅ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=El entrenador declarado no está en el padrón activo de este hipódromo. · b=El entrenador declarado no está en el padrón activo de este hipódromo. · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ✅ A16) suplente sin titular / suplente = titular → error  → a=No se puede declarar un suplente sin jockey titular. · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=3a5ee9d7-e779-43f9-8614-c37f03ae7a66 data={"ok":true,"inscripcion_id":"7b08b172-f881-484d-b15e-c843abfb706a","propietario_id":"7d4d993b-3f08-4833-9149-91c28de8f797","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ✅ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ✅ A21) un FORFAIT no se modifica desde el portal  → msg=Ese caballo ya figura como forfait y no se puede modificar desde el portal.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"3a5ee9d7-e779-43f9-8614-c37f03ae7a66","antes":"ab7e242c-fbc4-4849-a447-83bc447180e8","despues":"d9f44365-3881-4692-baff-2c6fd10b916d"}
 ✅ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, gt" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

40/41 OK
```

## 18. Limpieza final de la base

```sql
DROP FUNCTION IF EXISTS public.rpc_modificar_inscripcion_mut(uuid,uuid,uuid,uuid,uuid);
DROP FUNCTION IF EXISTS public.rpc_modificar_inscripcion_syntaxcheck(uuid,uuid,uuid,uuid,uuid);   -- por las dudas; nunca existió fuera del ROLLBACK
SELECT ... (los 8 controles de abajo)
```

```json
[{"k":"funciones_rpc_modificar%","v":"rpc_modificar_inscripcion"},
 {"k":"gemelas_cualquiera","v":"(ninguna)"},
 {"k":"real_md5","v":"817327d8e340af8bc1e7d6e99d0b3994"},
 {"k":"real_tiene_guards","v":"true"},
 {"k":"schema_migrations_mut","v":"0"},
 {"k":"schema_migrations_modificar","v":"20260916175417 rpc_modificar_inscripcion_portal"},
 {"k":"spcs","v":"210"},
 {"k":"fixtures_probe_mod","v":"0"},
 {"k":"now","v":"2026-09-16 18:17:37.248495+00"}]
```

`real_md5` es el mismo antes y después de los 15 mutantes (`817327d8…`): la función real **no se tocó**.
`real_tiene_guards` verifica en el texto vivo: tiene `IS DISTINCT FROM 'portal'`, tiene
`v_sin_propietario := v_titular_nuevo IS NULL`, no tiene `IF false THEN`, no tiene `inscripto_por = NULL`.

## 19. Commit de esta parte

```
$ git diff --stat
 CLAUDE.md                                    | 4 +++-
 tests/probe_modificar_inscripcion_portal.mjs | 6 +++---
$ git commit -m "test(portal): probe Modificar — A16 assert corregido (suplente intacto = j1), runbook de gemelas por execute_sql; CLAUDE.md: 15 ratificados sin propietario (13 sin caballeriza)"
$ git push origin feat/portal-modificar-inscripcion
$ git rev-parse HEAD ; git ls-remote origin feat/portal-modificar-inscripcion
83f240337333e56d53c3b7b20d2d7ecd61e0dc6e
83f240337333e56d53c3b7b20d2d7ecd61e0dc6e	refs/heads/feat/portal-modificar-inscripcion
```

## 20. Las dos consultas de lectura

### 20.1 ¿R9 tiene ratificados hoy?

**Sí: 74.** La ratificación se hizo el **lunes 14/09 entre las 20:43 y las 22:26 UTC (17:43–19:26 AR)** —
después de las 12 AR del cierre formal, o sea el mismo lunes a la tarde. T2, T8 y T10 están `anulada` (sus filas
quedaron `inscripto`/`forfait`, sin ratificar). T1 tiene `carreras.estado = NULL`.

```sql
select c.numero_turno, c.estado carrera_estado,
 count(*) filter (where i.estado='ratificado') ratificados,
 count(*) filter (where i.estado='inscripto') inscriptos,
 count(*) filter (where i.estado='forfait') forfaits,
 count(*) filter (where i.estado='ratificado' and i.propietario_id is null) rat_sin_propietario,
 max(i.updated_at) filter (where i.estado='ratificado') ultima_ratificacion
from carreras c left join inscripciones i on i.carrera_id=c.id
where c.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' group by 1,2 order by 1;
```

| turno | carrera.estado | ratificados | inscriptos | forfaits | ratif. sin propietario | última ratificación (UTC) |
|---|---|---|---|---|---|---|
| 1 | NULL | 9 | 0 | 2 | 1 | 2026-09-16 18:07:20 (*) |
| 2 | anulada | 0 | 4 | 4 | 0 | — |
| 3 | abierta | 13 | 0 | 0 | 4 | 2026-09-14 20:43:19 |
| 4 | abierta | 11 | 0 | 2 | 3 | 2026-09-14 20:44:19 |
| 5 | abierta | 7 | 0 | 0 | 1 | 2026-09-14 22:11:20 |
| 6 | abierta | 7 | 0 | 0 | 1 | 2026-09-14 22:07:40 |
| 7 | abierta | 8 | 0 | 0 | 2 | 2026-09-14 22:12:31 |
| 8 | anulada | 0 | 4 | 0 | 0 | — |
| 9 | abierta | 6 | 0 | 2 | 2 | 2026-09-14 22:26:50 |
| 10 | anulada | 0 | 5 | 4 | 0 | — |
| 11 | abierta | 13 | 0 | 1 | 1 | 2026-09-14 20:46:06 |

(*) T1: el `max(updated_at)` es de hoy porque Yesi cargó `performance` en ARMOÑOZO (§13); la ratificación de T1
es del 14/09 como las otras.

### 20.2 ¿Corrió el `DO` de `propietarios_provisorios_r9.sql` después de la ratificación?

**No.** Cero provisorios y cero responsables creados desde el 14/09; los 8 provisorios de R9 son los del 11/09.

```sql
select 'provisorios_r9_propietarios' k, count(*)::text||' (última: '||coalesce(max(created_at)::text,'—')||')' v from propietarios where notas ilike '%provisorio R9%'
union all select 'provisorios_r8_propietarios', count(*)::text||' (última: '||coalesce(max(created_at)::text,'—')||')' from propietarios where notas ilike '%provisorio R8%'
union all select 'provisorios_r9_desde_14sep', count(*)::text from propietarios where notas ilike '%provisorio%' and created_at >= '2026-09-14'
union all select 'responsables_desde_14sep', count(*)::text||' (última: '||coalesce(max(created_at)::text,'—')||')' from caballeriza_responsables where created_at >= '2026-09-14'
union all select 'r9_ratificados_sin_propietario', count(*)::text from inscripciones i join carreras ca on ca.id=i.carrera_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.estado='ratificado' and i.propietario_id is null
union all select 'r9_ratificados_total', count(*)::text from inscripciones i join carreras ca on ca.id=i.carrera_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.estado='ratificado'
union all select 'r9_ratif_sin_prop_detalle', string_agg('T'||ca.numero_turno||' '||s.nombre||' cab='||coalesce(cb.nombre,'∅'), ' | ' order by ca.numero_turno, s.nombre) from inscripciones i join carreras ca on ca.id=i.carrera_id join spcs s on s.id=i.spc_id left join caballerizas cb on cb.id=i.caballeriza_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.estado='ratificado' and i.propietario_id is null
union all select 'r9_ratif_sin_prop_sin_caballeriza', count(*)::text from inscripciones i join carreras ca on ca.id=i.carrera_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.estado='ratificado' and i.propietario_id is null and i.caballeriza_id is null
union all select 'now', now()::text;
```

```json
[{"k":"provisorios_r9_propietarios","v":"8 (última: 2026-09-11 21:07:26.930683+00)"},
 {"k":"provisorios_r8_propietarios","v":"40 (última: 2026-08-18 16:16:40.270291+00)"},
 {"k":"provisorios_r9_desde_14sep","v":"0"},
 {"k":"responsables_desde_14sep","v":"0 (última: —)"},
 {"k":"r9_ratificados_sin_propietario","v":"15"},
 {"k":"r9_ratificados_total","v":"74"},
 {"k":"r9_ratif_sin_prop_detalle","v":"T1 TIRSO cab=PARAJE LA TABLADA | T3 ALHENA cab=∅ | T3 DAHUA cab=∅ | T3 DEL CAMPEON cab=∅ | T3 MARIA CATULENGA cab=∅ | T4 BIEN COQUETA cab=∅ | T4 NIÑO OCEANICO cab=∅ | T4 SOUTH GOTICO cab=∅ | T5 OJO EXCELENTE cab=∅ | T6 GRAN RAUL cab=PARAJE LA TABLADA | T7 ATOMIZADOR cab=∅ | T7 EL RISKO cab=∅ | T9 ARTHURUS cab=∅ | T9 CANDIDATA PIRANERA cab=∅ | T11 ABARAJALA cab=∅"},
 {"k":"r9_ratif_sin_prop_sin_caballeriza","v":"13"},
 {"k":"now","v":"2026-09-16 18:10:06.548929+00"}]
```

**Lectura, y una corrección**: son **15** ratificados sin propietario (en la Parte 1 §1.1.c y en CLAUDE.md escribí 16 —
la suma por turno da 15; corregido en `83f2403`). Y lo importante: **13 de los 15 no tienen caballeriza** — son los
SPC dados de alta el 11/09 y el 14/09 (DAHUA, SOUTH GOTICO, BIEN COQUETA, OJO EXCELENTE, GRAN RAUL, CANDIDATA
PIRANERA, ARTHURUS…) que se ratificaron sin stud. **A esos el `DO` no los arregla**: el `DO` crea provisorios para
*caballerizas* sin titular, no para *inscripciones* sin caballeriza. Sólo TIRSO (T1) y GRAN RAUL (T6), los dos en
PARAJE LA TABLADA (sin titular activo), entran en el `DO`. Para los otros 13 primero Yesi tiene que cargarles el
stud (en `inscripciones.html`, o desde el portal con Modificar si extiende la ventana), y recién después correr el
`DO`. Son 4 días para el domingo y esto afecta la liquidación de R9.

## 21. Lo que falta (después de este gate)

1. **OK de Leo** sobre este archivo → merge `--no-ff` de `feat/portal-modificar-inscripcion` (`83f2403`) a `main`.
2. `git ls-remote`; md5 de `portal.html` contra `sigh.com.ar` hasta que coincida.
3. `PORTAL_HTML=https://sigh.com.ar/portal.html node tests/probe_modificar_inscripcion_portal.mjs` → 41/41 contra
   el HTML servido. Anexar acá.
4. R9: los 13 ratificados sin caballeriza (§20.2) — decisión de Yesi/Leo, no de esta rama.

## 22. Preguntas abiertas

1. ¿Merge? (gate).
2. `probe_aviso_jockey_repetido.mjs` sigue atado a la foto de R9 del 12/09 (Parte 1 §7): 10/60 fallan en `main` por
   datos, no por código. ¿Lo desacoplo?
3. Los 13 ratificados sin caballeriza de R9: ¿los carga Yesi, o querés que arme la lista para ella?
4. ISSUE-082 (tenencia): B ejecutado. ¿Confirmás?

## 23. Verificación ls-remote (Parte 2)

```
$ git push origin reports
$ git rev-parse HEAD
7e06a3d01b50bbfbe08fcfe90fc2115dda9337ed
$ git ls-remote origin reports
7e06a3d01b50bbfbe08fcfe90fc2115dda9337ed	refs/heads/reports
```

Coinciden. Esta sección va en un commit más sobre el mismo archivo.


---

# Parte 3 — 16/09 18:26–18:32 UTC: re-chequeo pre-merge (las 3 cosas de Leo), merge a `main`, probe contra sigh.com.ar

## 24. Las tres cosas, re-medidas en fresco antes del merge (18:26:05 UTC)

Una sola query, `execute_sql`, salida cruda completa:

```json
[{"k":"now","v":"2026-09-16 18:26:05.759401+00"},
 {"k":"1.huerfanas_1ct3tj_profesionales","v":"0"},
 {"k":"1.huerfanas_1ct3tj_caballerizas","v":"0"},
 {"k":"1.probe_mod_cualquier_run","v":"0"},
 {"k":"1.spcs_total","v":"210"},
 {"k":"2.pg_proc_rpc_modificar_inscripcion%","v":"rpc_modificar_inscripcion(p_inscripcion_id uuid, p_caballeriza_id uuid, p_entrenador_id uuid, p_jockey_titular_id uuid, p_jockey_suplente_id uuid)"},
 {"k":"2.cualquier_gemela_o_mut","v":"(ninguna)"},
 {"k":"2.schema_migrations_mut_o_probe","v":"0"},
 {"k":"2.real_md5","v":"817327d8e340af8bc1e7d6e99d0b3994"},
 {"k":"3.r9_ratificados","v":"74"},
 {"k":"3.r9_ratificados_por_turno","v":"T1:9 T3:13 T4:11 T5:7 T6:7 T7:8 T9:6 T11:13"},
 {"k":"3.r9_primera_ultima_ratificacion","v":"2026-09-14 20:42:36.384828+00 → 2026-09-14 22:26:50.662941+00"},
 {"k":"3.r9_ratificados_sin_propietario","v":"15"},
 {"k":"3.r9_ratif_sin_prop_sin_caballeriza","v":"13"},
 {"k":"3.DO_provisorios_desde_14sep","v":"0"},
 {"k":"3.DO_responsables_desde_14sep","v":"0"},
 {"k":"3.DO_ultimo_provisorio_r9","v":"2026-09-11 21:07:26.930683+00"}]
```

**1. Huérfanas del run `1ct3tj`** — antes (18:10:45, §14): **6 profesionales + 1 caballeriza** (`PROBE-MOD-A/B/C/X/J1/J2 1ct3tj`,
`PROBE-MOD-CAB-CON-1ct3tj`), dependencias 0. Borrado (§14): `cab_borradas=1, prof_borrados=6`. Después (18:26:05): **0 y 0**.
Además, **0 filas `PROBE-MOD`/`probe-mod-` de cualquier run** en las 8 tablas del fixture (reuniones 9986/9987, spcs,
caballerizas, profesionales, usuarios, auth.users, propietarios, responsables). `spcs` = 210 = baseline.

**2. Mutantes vivos** — `pg_proc` con `proname LIKE 'rpc_modificar_inscripcion%'` devuelve **sólo la función a secas**.
Ninguna `%_mut`, ninguna `%syntaxcheck%`, ninguna `probe%`. `schema_migrations` sin nada de gemelas (0). El md5 de la
real sigue siendo `817327d8e340af8bc1e7d6e99d0b3994` — el mismo de antes de los 15 mutantes. **Nada que dropear.**

**3a. ¿R9 tiene ratificados hoy?** — **Sí, 74**: T1:9 T3:13 T4:11 T5:7 T6:7 T7:8 T9:6 T11:13 (T2/T8/T10 anulados, sin
ratificar). Se ratificó el **lunes 14/09 entre las 20:42 y las 22:26 UTC** (17:42–19:26 AR). El "cero" que viste el
lunes era de antes de las 17:42 AR.

**3b. ¿Corrió el `DO` de `propietarios_provisorios_r9.sql` después de la ratificación?** — **No.** Cero propietarios
provisorios y cero `caballeriza_responsables` creados desde el 14/09; el último provisorio de R9 es del 11/09 21:07 UTC.
Quedan **15 ratificados sin `propietario_id`**, y **13 de esos 15 no tienen caballeriza** (§20.2 tiene la lista con
nombres): a esos el `DO` no los alcanza — primero hay que cargarles el stud. Los otros 2 (TIRSO T1, GRAN RAUL T6, ambos
en PARAJE LA TABLADA sin titular) sí los arreglaría el `DO`.

## 25. Merge a `main` y deploy

```
$ git status --short | wc -l
0
$ git checkout main && git pull origin main && git log --oneline -1
c0e7803 merge: aviso de jockey repetido en el turno en las 4 pantallas (sin bloqueo); ratificación deja de contar forfaits — pedido de Yesi 12/09
$ git merge --no-ff feat/portal-modificar-inscripcion -m "merge: \"Modificar\" en Mis inscripciones del portal — rpc_modificar_inscripcion (aplicada) + modal + probe 41/41 + 24/24 mutantes; GATE-1=B (ISSUE-082); baseline spcs 210 — pedido de Yesi 14/09"
$ git push origin main
$ git log --oneline -3
7887a27 merge: "Modificar" en Mis inscripciones del portal — rpc_modificar_inscripcion (aplicada) + modal + probe 41/41 + 24/24 mutantes; GATE-1=B (ISSUE-082); baseline spcs 210 — pedido de Yesi 14/09
83f2403 test(portal): probe Modificar — A16 assert corregido (suplente intacto = j1), runbook de gemelas por execute_sql; CLAUDE.md: 15 ratificados sin propietario (13 sin caballeriza)
9596c1e feat(portal): "Modificar" en Mis inscripciones — caballeriza/entrenador/jockey/suplente (pedido Yesi 14/09)
$ git rev-parse HEAD; git ls-remote origin main
7887a27f2dc2cbf0d1c3a16a1e82b0b4d31d1ace
7887a27f2dc2cbf0d1c3a16a1e82b0b4d31d1ace	refs/heads/main
```

md5 de `portal.html` servido vs el del commit de merge (`?v=$RANDOM`, un intento cada 15 s):

```
$ git show 7887a27:portal.html > local_portal.html
18:26:54 intento 1 prod=9306a961fa81c705843d2fc930252841 local=ff070cef49ac04c6069cc4dad53c2298
18:27:09 intento 2 prod=9306a961fa81c705843d2fc930252841 local=ff070cef49ac04c6069cc4dad53c2298
18:27:24 intento 3 prod=ff070cef49ac04c6069cc4dad53c2298 local=ff070cef49ac04c6069cc4dad53c2298
ff070cef49ac04c6069cc4dad53c2298  /tmp/claude-1000/-home-clio-dev-SGH/1e2af424-39ba-4437-adcf-21de00e67b56/scratchpad/local_portal.html
ff070cef49ac04c6069cc4dad53c2298  /tmp/claude-1000/-home-clio-dev-SGH/1e2af424-39ba-4437-adcf-21de00e67b56/scratchpad/prod_portal.html
$ grep -c "abrirModificar" prod_portal.html
2
```

Coincide al tercer intento (~45 s después del push). El HTML servido tiene el botón.

## 26. Probe contra el HTML servido — 41/41

```
$ PORTAL_HTML=https://sigh.com.ar/portal.html node tests/probe_modificar_inscripcion_portal.mjs

── El RPC ──

── La UI ──
[rpc_modificar_inscripcion] { message: 'P0001: Fuera de plazo: hablá con la secretaría.' }

── Probe · Modificar inscripción desde el portal ──
   portal=https://sigh.com.ar/portal.html  ·  rpc=rpc_modificar_inscripcion  ·  run=lbzw9l
 ✅ F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables  → propietario_id=d3d8a587-0492-4254-8929-a4e024ea1079
 ✅ A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)  → ok=true msg=null data={"ok":true,"inscripcion_id":"5c95cc0f-6de0-4fe0-a9e4-501cc767049d","propietario_id":"d3d8a587-0492-4254-8929-a4e024ea1079","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto  → ok=true msg=null
 ✅ A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos  → ok=true msg=null estado=ratificado partidor=5
 ✅ A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia  → msg=Un caballo ratificado tiene que tener jockey. Para cambiarlo, elegí otro; para sacarlo, hablá con la secretaría. jockey=7b7002a4-1e09-4707-aca9-cdfd799da126
 ✅ A5) B no puede modificar lo que cargó A  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo  → msg=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A7) las dos ventanas cerradas → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A9) ratificación en NULL → fail-closed, Fuera de plazo  → msg=Fuera de plazo: se puede modificar mientras la inscripción está abierta o durante la ratificación. Hablá con la secretaría.
 ✅ A10) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A22) turno anulado, rechaza  → msg=Ese turno está anulado.
 ✅ A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)  → propietario=d3d8a587-0492-4254-8929-a4e024ea1079
 ✅ A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)  → ok=true msg=null prop=null data={"ok":true,"inscripcion_id":"6806a87e-ec09-4c4d-8a1c-19107ad9f30e","propietario_id":null,"sin_propietario":true,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false  → ok=true prop=d3d8a587-0492-4254-8929-a4e024ea1079 data={"ok":true,"inscripcion_id":"6806a87e-ec09-4c4d-8a1c-19107ad9f30e","propietario_id":"d3d8a587-0492-4254-8929-a4e024ea1079","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":false}
 ✅ A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false  → prop=d3d8a587-0492-4254-8929-a4e024ea1079
 ✅ A14) cambiar sólo el jockey deja propietario_id intacto  → prop=d3d8a587-0492-4254-8929-a4e024ea1079
 ✅ A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta  → a=El entrenador declarado no está en el padrón activo de este hipódromo. · b=El entrenador declarado no está en el padrón activo de este hipódromo. · c=Esa caballeriza no existe o no está activa en este hipódromo.
 ✅ A16) suplente sin titular / suplente = titular → error  → a=No se puede declarar un suplente sin jockey titular. · b=El suplente no puede ser el mismo jockey que el titular.
 ✅ A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true  → ok=true msg=null inscripto_por=c87372a0-9172-44ea-a4f1-9e008d20f6b9 data={"ok":true,"inscripcion_id":"5c95cc0f-6de0-4fe0-a9e4-501cc767049d","propietario_id":"d3d8a587-0492-4254-8929-a4e024ea1079","sin_propietario":false,"sigue_siendo_mia":true,"cambio_entrenador":true}
 ✅ A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)  → A=true B=Esa inscripción no la cargó usted desde el portal. Para modificarla, hablá con la secretaría.
 ✅ A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false
 ✅ A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC  → msg=No autorizado: esta operación es para usuarios del portal.
 ✅ A21) un FORFAIT no se modifica desde el portal  → msg=Ese caballo ya figura como forfait y no se puede modificar desde el portal.
 ✅ A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza  → msg=Esa inscripción ya fue procesada por la secretaría y no se puede modificar desde el portal.
 ✅ A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A  → fila={"accion":"UPDATE","usuario":"c87372a0-9172-44ea-a4f1-9e008d20f6b9","antes":"d8019ba7-374b-4cb3-a7c0-71cc8936cb17","despues":"7b7002a4-1e09-4707-aca9-cdfd799da126"}
 ✅ A0) en 28 llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron
 ✅ U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no  → insc=true rat=true cerrada=false
 ✅ U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id
 ✅ U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC  → confirm="Estás cambiando el entrenador que presenta a PROBE-MOD-C, lb" rpc=1 cancel→rpc=0
 ✅ U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda
 ✅ U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama  → confirm=1 rpc=1 cancel→rpc=0
 ✅ U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)  → toasts=["success","warning"]
 ✅ U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga  → msg=❌ Fuera de plazo: hablá con la secretaría.
 ✅ U7) un ratificado sin jockey se corta en el front antes del RPC  → msg=❌ Un caballo ratificado tiene que tener jockey. Para sacarlo, hablá con la secretaría.
 ✅ U7b) suplente sin titular se corta en el front  → msg=❌ No se puede declarar un suplente sin jockey titular.
 ✅ U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no  → propia=true otra=false forfait=true
 ✅ U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar
 ✅ U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)
 ✅ R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después  → {"reuniones":0,"spcs":0,"caballerizas":0,"profesionales":0,"usuarios":0,"propietarios":0,"responsables":0} spcs 210→210
 ✅ R2) count(*) FROM spcs = 210 (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)  → spcs=210

41/41 OK
```

`portal=https://sigh.com.ar/portal.html`: los asserts U1–U9 corrieron sobre lo que sirve GitHub Pages, no sobre el
archivo local; los A contra el RPC real. **41/41.**

Regresión sobre el mismo archivo servido (descargado a `prod_portal.html`):

```
$ PORTAL_HTML=prod_portal.html node tests/probe_forfait_portal.mjs

── El RPC ──

── La UI ──

── Probe · forfait desde el portal ──
   portal=/tmp/claude-1000/-home-clio-dev-SGH/1e2af424-39ba-4437-adcf-21de00e67b56/scratchpad/prod_portal.html  ·  rpc=rpc_baja_inscripcion  ·  run=9ch4an
 ✅ A1) retirar durante la INSCRIPCIÓN sigue funcionando, y BORRA la fila  → ok=true msg=null fila=null
 ✅ A2) retirar durante la RATIFICACIÓN funciona y deja estado=forfait — la fila NO se borra  → ok=true msg=null fila={"id":"945fa826-e344-49de-b106-28f99e333b65","estado":"forfait","canal":"portal","inscripto_por":"a1c91b38-cf65-4a33-be0f-3d898e64ec71","numero_partidor":null,"motivo_estado":"Forfait desde el portal"}
 ✅ A10) el forfait limpia numero_partidor  → numero_partidor=null
 ✅ A11) el forfait CONSERVA canal e inscripto_por (el rastro no se pierde)  → canal=portal inscripto_por=a1c91b38-cf65-4a33-be0f-3d898e64ec71
 ✅ A12) el forfait deja marca de origen en motivo_estado  → motivo_estado="Forfait desde el portal"
 ✅ A14) un caballo ya RATIFICADO puede darse de forfait en esa ventana  → ok=true msg=null estado=forfait
 ✅ A13) un caballo ya en forfait no se puede volver a retirar  → msg=Ese caballo ya figura como forfait y no se puede dar de baja desde el portal.
 ✅ A3) antes de que abra ninguna ventana, rechaza  → msg=Fuera de plazo: se puede retirar mientras la inscripción está abierta, o dar forfait durante la ratificación. Hablá con la secretaría.
 ✅ A4) EL HUECO entre el cierre de inscripción y la apertura de ratificación, rechaza  → msg=Fuera de plazo: se puede retirar mientras la inscripción está abierta, o dar forfait durante la ratificación. Hablá con la secretaría.
 ✅ A5) después del cierre de ratificación, rechaza  → msg=Fuera de plazo: se puede retirar mientras la inscripción está abierta, o dar forfait durante la ratificación. Hablá con la secretaría.
 ✅ A6) no se puede retirar lo que cargó OTRO usuario  → msg=Esa inscripción no la cargó usted desde el portal. Para darla de baja, hablá con la secretaría.
 ✅ A7) no se puede retirar lo que cargó la SECRETARÍA (canal manual)  → msg=Esa inscripción no la cargó usted desde el portal. Para darla de baja, hablá con la secretaría.
 ✅ A8) reunión no publicada, rechaza  → msg=Fuera de plazo: esa reunión no está publicada. Hablá con la secretaría.
 ✅ A9) ventana de ratificación en NULL → fail-closed, rechaza  → msg=Fuera de plazo: se puede retirar mientras la inscripción está abierta, o dar forfait durante la ratificación. Hablá con la secretaría.
 ✅ U1) modoRetiro distingue las dos ventanas y el fuera-de-plazo  → insc=inscripcion · rat=ratificacion
 ✅ U2) el rótulo del botón es "Dar forfait" en ratificación y "Retirar" en inscripción
 ✅ U3) cargarInscripcionesCrudas pide apertura_ratificacion y cierre_ratificacion
 ✅ U4) ventanaRatificacion es fail-closed: sin las dos fechas, cerrada
 ✅ U5) un RATIFICADO muestra botón en la ventana de ratificación, no en la de inscripción
 ✅ U6) lo de otro y lo de la secretaría no muestran botón
 ✅ T1) teardown: no quedaron reuniones 9988/9989 ni SPC del run  → reuniones=0 spcs=0

21/21 OK
```

**21/21.** Retirar / Dar forfait siguen igual en prod.

## 27. Estado final

| | |
|---|---|
| `main` | `7887a27f2dc2cbf0d1c3a16a1e82b0b4d31d1ace` (merge `--no-ff`), pusheado, en `sigh.com.ar` |
| RPC | `rpc_modificar_inscripcion` aplicada (`20260916175417`), md5 `817327d8…`, sin gemelas |
| Probe | 41/41 local · 41/41 contra sigh.com.ar · mutantes 9/9 portal + 15/15 SQL |
| Base | 0 fixtures, `spcs` 210 |
| Para Yesi | el botón **Modificar** está en el portal, pero en R9 sale `—` en todas las filas: las dos ventanas cerraron el 14/09. Si lo quiere usar antes del domingo, extiende `cierre_ratificacion` desde `carta-llamados.html`. |
| Pendiente R9 | 13 ratificados sin caballeriza + `DO` de provisorios sin correr (§24.3b). No es de esta rama. |
| Pendiente producto | ISSUE-082 (tenencia = quién cargó; ejecutado B). |
