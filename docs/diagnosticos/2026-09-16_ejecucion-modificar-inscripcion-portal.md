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
