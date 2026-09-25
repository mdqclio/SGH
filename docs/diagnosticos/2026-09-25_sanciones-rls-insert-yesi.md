# Sanciones: "new row violates row-level security policy for table sanciones" (Yesi) — SOLO LECTURA

- Fecha: 2026-09-25
- Código leído: `main` @ `d133c05db7c315ac2b62d7952f2553376c10619d` (`sanciones.html`)
- Guards: `pwd` = /home/clio/dev/SGH · `select count(*) from spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- **No se escribió nada.** Sólo `SELECT` por MCP y `git show`/`git log` contra `main`. La simulación de la sesión de
  Yesi (Q5) usa `set_config('request.jwt.claims', …, true)`, que es local a la transacción de lectura y no escribe.

## Respuesta corta

**Causa: la pantalla no manda `club_id`.** El INSERT llega con `club_id` NULL:
- la política `sanciones_insert` exige `fn_is_super_admin() OR club_id = fn_get_user_club_id()`;
- para Yesi eso da `false OR (NULL = 'Dolores')` = `NULL`, que la WITH CHECK trata como falso;
- resultado: "new row violates row-level security policy". Aunque la política dejara pasar, la columna es
  **NOT NULL sin default** y el INSERT fallaría igual.

- **Desde cuándo**: `club_id: CLUB_ID` se sacó del payload el **2026-05-07** en el commit `5eb0e38` ("cambios del día",
  diff `-    club_id: CLUB_ID,`). Desde entonces **ningún INSERT de `sanciones.html` puede funcionar**, para ningún usuario
  salvo super_admin. Y aun para super_admin, `club_id` NULL choca con el NOT NULL. La única sanción de prod es del
  **2026-05-05**, dos días antes.
- **Yesi está bien configurada**: `operador`, activa, club Dolores. `fn_is_staff()` = true,
  `fn_get_user_club_id()` = Dolores. Con `club_id` en el payload, la política da **true** (Q5).
- **No tiene nada que ver con lo de ayer y hoy** (guard de staff, cierre de reuniones, REVOKE): ninguna de las 12
  migraciones desde el 22/09 menciona `sanciones`, redefine `fn_get_user_club_id`/`fn_is_staff`/`fn_is_super_admin` ni
  crea o cambia políticas. `sanciones` no tiene triggers. Las helpers están como en `sec_rls_fase2a_catalogos` (01/08).
- **Editar sí funciona**: el UPDATE no cambia `club_id` y la política de UPDATE mira el `club_id` de la fila existente.
  El que está roto es el **alta**.
- Fix, que **no apliqué**: volver a poner `club_id: CLUB_ID` en el payload del INSERT, `sanciones.html:365`. Opcional:
  `creado_por` = `usuarios.id` de la sesión (hoy nunca se llena) y `alcance` explícito (hoy toma el default `'club'`).

| Campo | Esquema | ¿La pantalla lo manda? | Consecuencia |
|---|---|---|---|
| `club_id` | **NOT NULL, sin default** | **No** | la política de INSERT da NULL → rechazo RLS (y si no, violación de NOT NULL) |
| `alcance` | NOT NULL, default `'club'` | No | toma `'club'` (sanción visible sólo en su club, salvo super_admin) |
| `creado_por` | nullable, FK → `usuarios.id` | No | queda NULL (sin autor) |
| `entidad_tipo`, `entidad_id`, `tipo_sancion`, `fecha_inicio` | NOT NULL | Sí | ok |
| `estado` | NOT NULL, default `'activa'` | Sí | ok |
| `motivo`, `fecha_fin`, `notas` | nullable | Sí | ok |
| `codigo_resolucion`, `resolucion_url` | nullable | No | NULL, no bloquea |

---

## 1 — Políticas de `sanciones` en prod

```sql
select (select count(*) from spcs) spcs, policyname, cmd, permissive, roles::text, qual, with_check
from pg_policies where schemaname='public' and tablename='sanciones' order by cmd, policyname;
```
```json
[{"spcs":210,"policyname":"sanciones_delete","cmd":"DELETE","permissive":"PERMISSIVE","roles":"{authenticated}","qual":"( SELECT fn_is_super_admin() AS fn_is_super_admin)","with_check":null},{"spcs":210,"policyname":"sanciones_insert","cmd":"INSERT","permissive":"PERMISSIVE","roles":"{authenticated}","qual":null,"with_check":"(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))"},{"spcs":210,"policyname":"sanciones_select","cmd":"SELECT","permissive":"PERMISSIVE","roles":"{authenticated}","qual":"(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND ((club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)) OR ((alcance)::text <> 'club'::text))) OR ((entidad_tipo = 'profesional'::entidad_sancionada) AND (entidad_id IN ( SELECT e.entidad_id\n   FROM fn_mis_entidades() e(entidad_tipo, entidad_id)\n  WHERE (e.entidad_tipo = 'profesional'::text)))) OR ((entidad_tipo = 'propietario'::entidad_sancionada) AND (entidad_id IN ( SELECT e.entidad_id\n   FROM fn_mis_entidades() e(entidad_tipo, entidad_id)\n  WHERE (e.entidad_tipo = 'propietario'::text)))) OR ((entidad_tipo = 'spc'::entidad_sancionada) AND (entidad_id IN ( SELECT s.spc_id\n   FROM fn_mis_spc_ids() s(spc_id)))))","with_check":null},{"spcs":210,"policyname":"sanciones_update","cmd":"UPDATE","permissive":"PERMISSIVE","roles":"{authenticated}","qual":"(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))","with_check":"(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))"}]
```

La de INSERT (`sanciones_insert`, sólo `authenticated`): `WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id())`.
Con `club_id` NULL, la segunda mitad es NULL y la fila se rechaza. **No exige `fn_is_staff()`** (ver Observación).

RLS y el resto de la tabla:
```sql
select c.relrowsecurity rls, c.relforcerowsecurity force_rls,
 (select string_agg(tgname||': '||pg_get_triggerdef(t.oid), ' || ') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) triggers,
 (select string_agg(conname||': '||pg_get_constraintdef(oid), ' || ') from pg_constraint where conrelid=c.oid) constraints,
 (select string_agg(grantee||':'||privilege_type, ', ' order by grantee, privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='sanciones' and grantee in ('anon','authenticated','service_role')) grants
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='sanciones';
```
```json
[{"rls":true,"force_rls":false,"triggers":null,"constraints":"sanciones_club_id_fkey: FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE || sanciones_creado_por_fkey: FOREIGN KEY (creado_por) REFERENCES usuarios(id) || sanciones_pkey: PRIMARY KEY (id)","grants":"anon:DELETE, anon:INSERT, anon:REFERENCES, anon:SELECT, anon:TRIGGER, anon:TRUNCATE, anon:UPDATE, authenticated:DELETE, authenticated:INSERT, authenticated:REFERENCES, authenticated:SELECT, authenticated:TRIGGER, authenticated:TRUNCATE, authenticated:UPDATE, service_role:DELETE, service_role:INSERT, service_role:REFERENCES, service_role:SELECT, service_role:TRIGGER, service_role:TRUNCATE, service_role:UPDATE"}]
```
**Sin triggers.** `anon` tiene GRANT pero ninguna política con `anon`: con RLS activa no ve ni escribe nada.

## 2 — Columnas

```sql
select c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default, c.is_generated
from information_schema.columns c where c.table_schema='public' and c.table_name='sanciones' order by c.ordinal_position;
```
```json
[{"column_name":"id","data_type":"uuid","udt_name":"uuid","is_nullable":"NO","column_default":"uuid_generate_v4()","is_generated":"NEVER"},{"column_name":"club_id","data_type":"uuid","udt_name":"uuid","is_nullable":"NO","column_default":null,"is_generated":"NEVER"},{"column_name":"entidad_tipo","data_type":"USER-DEFINED","udt_name":"entidad_sancionada","is_nullable":"NO","column_default":null,"is_generated":"NEVER"},{"column_name":"entidad_id","data_type":"uuid","udt_name":"uuid","is_nullable":"NO","column_default":null,"is_generated":"NEVER"},{"column_name":"tipo_sancion","data_type":"character varying","udt_name":"varchar","is_nullable":"NO","column_default":null,"is_generated":"NEVER"},{"column_name":"motivo","data_type":"text","udt_name":"text","is_nullable":"YES","column_default":null,"is_generated":"NEVER"},{"column_name":"codigo_resolucion","data_type":"character varying","udt_name":"varchar","is_nullable":"YES","column_default":null,"is_generated":"NEVER"},{"column_name":"fecha_inicio","data_type":"date","udt_name":"date","is_nullable":"NO","column_default":null,"is_generated":"NEVER"},{"column_name":"fecha_fin","data_type":"date","udt_name":"date","is_nullable":"YES","column_default":null,"is_generated":"NEVER"},{"column_name":"alcance","data_type":"character varying","udt_name":"varchar","is_nullable":"NO","column_default":"'club'::character varying","is_generated":"NEVER"},{"column_name":"estado","data_type":"USER-DEFINED","udt_name":"estado_sancion","is_nullable":"NO","column_default":"'activa'::estado_sancion","is_generated":"NEVER"},{"column_name":"resolucion_url","data_type":"text","udt_name":"text","is_nullable":"YES","column_default":null,"is_generated":"NEVER"},{"column_name":"notas","data_type":"text","udt_name":"text","is_nullable":"YES","column_default":null,"is_generated":"NEVER"},{"column_name":"creado_por","data_type":"uuid","udt_name":"uuid","is_nullable":"YES","column_default":null,"is_generated":"NEVER"},{"column_name":"created_at","data_type":"timestamp with time zone","udt_name":"timestamptz","is_nullable":"NO","column_default":"now()","is_generated":"NEVER"}]
```
- `club_id`: **NOT NULL, sin default**.
- `alcance`: NOT NULL, default `'club'`.
- `creado_por`: **nullable**, sin default, FK a `usuarios(id)`. No es `auth.users`: cuando se llene, va el
  `usuarios.id`, no el `auth.uid()` (mismo caso que `recibos.emitido_por`, ISSUE-057).

## 3 — El payload de `saveRecord` (`main:sanciones.html:356-383`)

```js
async function saveRecord() {
  const id = document.getElementById('f-id').value;
  const tipo = document.getElementById('f-categoria-tipo').value;
  const entidadId = document.getElementById('f-entidad-id').value;
  const tipoSancion = document.getElementById('f-tipo-sancion').value.trim();
  const motivo = document.getElementById('f-motivo').value.trim();
  const fechaInicio = document.getElementById('f-fecha-inicio').value;
  if (!tipo || !entidadId || !tipoSancion || !motivo || !fechaInicio) { toast('Complete los campos requeridos','error'); return; }
  const btn = document.getElementById('btn-save');
  btn.disabled=true; btn.textContent='Guardando…';
  const payload = {
    entidad_tipo: tipo,
    entidad_id: entidadId,
    tipo_sancion: tipoSancion,
    motivo,
    fecha_inicio: fechaInicio,
    fecha_fin: document.getElementById('f-fecha-fin').value||null,
    estado: document.getElementById('f-estado-s').value,
    notas: document.getElementById('f-notas').value.trim()||null,
  };
  const { error } = id
    ? await sb.from('sanciones').update(payload).eq('id',id)
    : await sb.from('sanciones').insert(payload);
  ...
```
Falta **`club_id`**, que es lo que exigen la política y el esquema. `CLUB_ID` existe en la página: lo setea `initAuth()`
(`sanciones.html:218`) y se usa para filtrar profesionales y caballerizas (`:256-259`), pero no llega al payload.
Tampoco se mandan `creado_por` ni `alcance` (no bloquean).

### Desde cuándo

```
$ git log origin/main --format='%h %ad %s' --date=short -- sanciones.html
daa7375 2026-08-10 fix(profesionales): tipo 'ambos' visible en todos los selectores
53516e6 2026-06-07 security: swap a publishable key + hardening RLS/grants/views (FASE 0-2) + doc scrub
b890f57 2026-06-06 fix(security): quitar service_role del working tree, escapeHtml en sinks de usuario y CSP
86ec3cd 2026-05-19 feat: forfait sin motivo + forfaits en PDF + carrera/turno en carta + selector de club super_admin
85308e6 2026-05-15 feat(spcs): globalizar SPCs — eliminar club_id, deduplicar, fix frontend
5eb0e38 2026-05-07 cambios del dia
bdc2e9c 2026-04-22 Add files via upload
ed4cf62 2026-04-22 Add files via upload
22a7d29 2026-04-22 Add files via upload
f346ee6 2026-04-21 Add files via upload
09e58ed 2026-04-21 Add files via upload
3fee9bc 2026-04-21 Add files via upload

$ git show 3fee9bc:sanciones.html | grep -n -A12 "const payload"   (2026-04-21)
335:  const payload = {
336:    club_id: CLUB_ID,
...
$ git log -1 --format='%H %an %ad %s' --date=iso 5eb0e38
5eb0e38779712cb8afc6620d98b51299c6109893 mdqclio 2026-05-07 00:47:46 +0000 cambios del dia
$ git diff 5eb0e38~1 5eb0e38 -- sanciones.html | grep -n -E "^[-+].*(club_id|CLUB_ID)"
132:-    sb.from('sanciones').select('*').eq('club_id', CLUB_ID).order('fecha_inicio', {ascending: false}),
133:-    sb.from('profesionales').select('id,nombre,apellido').eq('club_id', CLUB_ID).order('apellido'),
136:+    sb.from('profesionales').select('id,nombre,apellido').eq('club_id', CLUB_ID).eq('tipo','jockey').order('apellido'),
138:-    sb.from('propietarios').select('id,nombre').eq('club_id', CLUB_ID).order('nombre'),
140:+    sb.from('profesionales').select('id,nombre,apellido').eq('club_id', CLUB_ID).eq('tipo','entrenador').order('apellido'),
261:-    club_id: CLUB_ID,
```
En `5eb0e38` se sacaron a la vez el `club_id` del payload y el filtro por club del listado. Esto último sí es
coherente con "sanciones compartidas entre hipódromos", pero el payload tenía que seguir mandando el club **dueño**. Lo
del payload parece un efecto colateral.

## 4 — Yesi

```sql
select u.id, u.auth_user_id, u.email, u.rol, u.club_id, u.activo, c.nombre club, u.nombre_completo is not null tiene_nombre
from usuarios u left join clubs c on c.id=u.club_id where u.email ilike 'yesi%' or u.email ilike '%yesica%' or u.nombre_completo ilike 'yes%';
```
```json
[{"id":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","auth_user_id":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","email":"yesica@sgh.com","rol":"operador","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true,"club":"Hipódromo de Dolores","tiene_nombre":true}]
```

Definición de las helpers (prod):
```sql
select p.proname, p.prosecdef security_definer, pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('fn_is_staff','fn_get_user_club_id','fn_is_super_admin') order by 1;
```
```
fn_get_user_club_id (SECURITY DEFINER):
  SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid() AND activo;
fn_is_staff (SECURITY DEFINER):
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND activo
                 AND rol IN ('super_admin', 'secretario_carreras', 'operador'));
fn_is_super_admin (SECURITY DEFINER):
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND rol = 'super_admin');
```

## 5 — Lo que les da la sesión de Yesi, simulada con sus claims y sólo lectura

```sql
with c as materialized (
  select set_config('request.jwt.claims', '{"sub":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","role":"authenticated"}', true) claims
)
select c.claims is not null claims_seteados, auth.uid() uid_simulado, auth.role() role_simulado,
 fn_is_staff() fn_is_staff, fn_get_user_club_id() fn_get_user_club_id, fn_is_super_admin() fn_is_super_admin,
 (fn_is_super_admin() OR (NULL::uuid = fn_get_user_club_id())) with_check_payload_actual,
 coalesce((fn_is_super_admin() OR (NULL::uuid = fn_get_user_club_id())), false) with_check_efectivo,
 (fn_is_super_admin() OR ('0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid = fn_get_user_club_id())) with_check_si_mandara_club_id
from c;
```
```json
[{"claims_seteados":true,"uid_simulado":"a1c490f5-81ee-4d9f-acb7-d2123e99e7d3","role_simulado":"authenticated","fn_is_staff":true,"fn_get_user_club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","fn_is_super_admin":false,"with_check_payload_actual":null,"with_check_efectivo":false,"with_check_si_mandara_club_id":true}]
```
- **Con el payload de hoy la política da NULL, o sea rechazo.**
- **Con `club_id` = Dolores da `true`.**

## 6 — Sanciones cargadas en prod

```sql
select count(*) total,
 count(*) filter (where s.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c') dolores,
 json_agg(json_build_object('id',s.id,'club',c.nombre,'club_id',s.club_id,'alcance',s.alcance,'entidad_tipo',s.entidad_tipo,'estado',s.estado,'creado_por_rol',u.rol,'creado_por_es_null',s.creado_por is null,'created_at',s.created_at) order by s.created_at) filas
from sanciones s left join clubs c on c.id=s.club_id left join usuarios u on u.id=s.creado_por;
```
(Primer intento sin alias en `club_id`: `ERROR: 42702: column reference "club_id" is ambiguous`.)
```json
[{"total":1,"dolores":1,"filas":[{"id":"ade49423-d7cc-400e-a5f0-9d99343f15d6","club":"Hipódromo de Dolores","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","alcance":"club","entidad_tipo":"spc","estado":"activa","creado_por_rol":null,"creado_por_es_null":true,"created_at":"2026-05-05T02:55:54.366485+00:00"}]}]
```
**Una sola**: Dolores, `alcance` `'club'`, sobre un SPC, activa, `creado_por` **NULL** (sin autor), creada el
**2026-05-05**, dos días antes de que el payload perdiera `club_id`.

Auditoría de la tabla:
```sql
select a.accion, a.created_at, a.usuario_id is not null con_usuario, a.registro_id
from auditoria a where a.tabla='sanciones' order by a.created_at desc limit 20;
```
```json
[]
```
Sin filas: `sanciones` no tiene trigger de auditoría, así que los intentos fallidos de Yesi no dejan rastro en la base.

## 7 — Nada de lo de ayer y hoy toca esta tabla

```sql
select version, name,
 array_to_string(statements,' ') ilike '%sanciones%' toca_sanciones,
 array_to_string(statements,' ') ~* 'function\s+public\.(fn_get_user_club_id|fn_is_staff|fn_is_super_admin)\s*\(' redefine_helpers,
 array_to_string(statements,' ') ~* 'policy' toca_policies
from supabase_migrations.schema_migrations where version >= '20260922000000' order by version;
```
```json
[{"version":"20260922161038","name":"revoke_anon_anular_recibo","toca_sanciones":false,"redefine_helpers":false,"toca_policies":false},{"version":"20260922161415","name":"rpc_cambiar_monta_issue_084","toca_sanciones":false,"redefine_helpers":false,"toca_policies":false},{"version":"20260922170638","name":"guard_staff_liberar_linea","toca_sanciones":false,"redefine_helpers":false,"toca_policies":false},{"version":"20260922170817","name":"guard_staff_desoficializar_carrera","toca_sanciones":false,"redefine_helpers":false,"toca_policies":false},{"version":"20260922171044","name":"guard_staff_aplicar_resultado","toca_sanciones":false,"redefine_helpers":false,"toca_policies":false},{"version":"20260922204131","name":"rpc_cambiar_monta_guard0","toca_sanciones":false,"redefine_helpers":false,"toca_policies":false},{"version":"20260922204709","name":"rpc_cambiar_monta_guard0_texto_del_repo","toca_sanciones":false,"redefine_helpers":false,"toca_policies":false},{"version":"20260923012258","name":"guard_staff_fn_siguiente_recibo","toca_sanciones":false,"redefine_helpers":false,"toca_policies":false},{"version":"20260923012417","name":"guard_staff_emitir_recibo","toca_sanciones":false,"redefine_helpers":false,"toca_policies":false},{"version":"20260923012529","name":"guard_staff_anular_recibo","toca_sanciones":false,"redefine_helpers":false,"toca_policies":false},{"version":"20260925163044","name":"reunion_liquidacion_cerrada_issue_091","toca_sanciones":false,"redefine_helpers":false,"toca_policies":false},{"version":"20260925165014","name":"revoke_fn_reunion_liq_cerrada","toca_sanciones":false,"redefine_helpers":false,"toca_policies":false}]
```
- Ninguna de las 12 toca `sanciones`, redefine las tres helpers o toca políticas.
- `sanciones.html` no cambia desde el **2026-08-10** (`daa7375`), y ese cambio fue en los selectores, no en el payload.
- Los triggers nuevos del 25/09 están en `liquidacion_detalle`, `liquidaciones` y `reuniones`, no en `sanciones` (§1:
  `triggers: null`).

Dónde aparece `sanciones` en las migraciones trackeadas (para ubicar el origen de las políticas):
```sql
select version, name, left(regexp_replace(s, '\s+', ' ', 'g'), 400) fragmento
from supabase_migrations.schema_migrations m, unnest(m.statements) s
where s ilike '%sanciones%' order by version;
```
Resultado: 5 filas. `security_hardening_fase2_reversible` (07/06, vista `v_sanciones_vigentes`),
`sec_autoregistro_gate1` (04/08, **sólo** `sanciones_select`), `validar_inscripcion_*` (23/08 y 27/08, leen la vista) y
`merge_duplicados_spc` (23/08, UPDATE de `entidad_id`). **Ninguna crea `sanciones_insert`.** No sale de una migración
trackeada con ese nombre. La última que reescribió todas las políticas es `r2a_wrap_policies_initplan` (01/08), que
envolvió las funciones en `(SELECT …)` en forma genérica, sin cambiar la lógica. Da igual para el diagnóstico: con
`club_id` NULL, ninguna política razonable deja pasar la fila y el NOT NULL la rechaza igual.

---

## Observación de seguridad (no pedida; no se tocó)

`sanciones_insert` y `sanciones_update` **no exigen `fn_is_staff()`**: alcanza con `club_id = fn_get_user_club_id()`.
Hay **16 usuarios de portal activos con `club_id`**: 12 `profesional` y 4 `propietario`. Por la API podrían **crear o
editar sanciones de su club** mandando el `club_id`. `sanciones.html` no se lo ofrece, pero la base no lo impide. La
de SELECT sí distingue staff.
```sql
select rol, activo, count(*) usuarios, count(*) filter (where club_id is not null) con_club_id from usuarios group by 1,2 order by 1,2;
```
```json
[{"rol":"super_admin","activo":true,"usuarios":1,"con_club_id":1},{"rol":"secretario_carreras","activo":true,"usuarios":2,"con_club_id":2},{"rol":"operador","activo":true,"usuarios":3,"con_club_id":3},{"rol":"profesional","activo":true,"usuarios":12,"con_club_id":12},{"rol":"propietario","activo":true,"usuarios":4,"con_club_id":4}]
```

## Preguntas abiertas / propuesta (para decidir; nada aplicado)

1. **Fix mínimo, desbloquea a Yesi**: en `sanciones.html`, agregar `club_id: CLUB_ID` sólo en el INSERT (en el UPDATE no
   hace falta, y conviene no cambiar el club de una sanción existente). Se deploya como cualquier HTML, sin migración.
2. `creado_por`: ¿se llena? Hace falta el `usuarios.id` de la sesión: `initAuth` hoy no lo pide. Es el mismo patrón que
   `recibos.emitido_por`.
3. `alcance`: hoy siempre `'club'` por default, y el propósito declarado de la tabla es compartir entre hipódromos. ¿La
   pantalla tiene que ofrecer "todos los hipódromos"? Es de producto (Fede).
4. Endurecer `sanciones_insert`/`_update` con `fn_is_staff()` (Observación). Es una migración, con su probe.
5. Trigger de auditoría en `sanciones` (hoy no hay).
