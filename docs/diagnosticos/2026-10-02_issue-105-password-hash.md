# ISSUE-105 — `usuarios.password_hash`: de dónde viene y si se usa (solo lectura)

- **Fecha**: 2026-10-02 · **`main`**: `0227588f3710477cd82453bba38f38b4caae75ca`
- **Guards**: los del informe del #44 ✅ · **Solo lectura**: no se borró ni se cambió nada en la base.
- **ISSUE**: PR #45 (`chore/issue-105-password-hash`, `58cf6b148ad285d94faa1ba393e13297ff3cee16`), sin mergear.
- **Anonimizado**: las filas van por id; sin emails ni nombres. El valor de la columna **no** se muestra.

## Conclusión

**No es una contraseña ni un hash.** Es un vestigio de antes de Supabase Auth.

- **2 filas con valor**: los dos usuarios originales de producción, creados el **2026-04-22**
  (`3a685a1a-3ff7-45dc-8af3-88f5c5f29377`, super_admin; `9ac2d140-faec-424c-9437-0cedeb8b8b82`, secretario_carreras). El valor es
  **exactamente** `managed_by_supabase_auth` (24 caracteres; verificado por igualdad, sin traer el valor): un placeholder puesto en el alta
  inicial. Ya lo había señalado `docs/PORTAL_V2_PLAN.md` (D-H8).
- **31 filas vacías** (`''`); total 33.
- La columna es `text NOT NULL` **sin default**: por eso todas las altas mandan `password_hash: ''` (ISSUE-039, 24/07).
- **Nadie la lee**: ninguna pantalla, función ni vista la usa. La autenticación es Supabase Auth. Viaja de yapa en el `select('*')` de
  `usuarios.html:237`, sin exponer nada (no hay secreto).
- **La escriben** con `''`: la Edge Function `invite-user` (`index.ts:485`), la RPC `rpc_aprobar_solicitud` y los probes que crean usuarios.
- **`fn_auditoria_log` la saca** antes de auditar: 0 de las 1357 filas de auditoría de `usuarios` la traen.
- `sgh_lectura` no tiene SELECT en `usuarios` (excluida por esta columna en el paso 4). Con la columna fuera, la tabla sigue teniendo emails y
  teléfonos (datos personales): es una decisión aparte.

**Propuesta** (no hecha): (1) `SET DEFAULT ''` y dejar de mandarla; (2) `DROP COLUMN` ajustando `invite-user`, `rpc_aprobar_solicitud`,
`fn_auditoria_log`, los probes y el DDL de los sandbox de `tests/local/`.

## Salida cruda

### Base

```sql
select 'fila' k, u.id, u.rol, to_char(u.created_at,'YYYY-MM-DD'), length(u.password_hash),
  case when u.password_hash ~ '^\$2[aby]\$' then 'bcrypt' when u.password_hash ~ '^[0-9a-f]{64}$' then 'sha256 hex'
       when u.password_hash ~* '^mana' then 'texto que empieza con mana (placeholder)' else 'otro' end, (u.auth_user_id is not null)
from usuarios u where coalesce(u.password_hash,'')<>''
union all select 'col', column_default, is_nullable, data_type, … from information_schema.columns where … column_name='password_hash'
union all select 'fn_que_la_nombra', p.proname, n.nspname, … from pg_proc p … where p.prosrc ilike '%password_hash%' …
union all select 'vista_que_la_nombra', c.relname, … where … pg_get_viewdef(c.oid) ilike '%password_hash%'
union all select 'grant_columna', grantee, privilege_type, … from information_schema.column_privileges where … column_name='password_hash' and grantee in ('anon','authenticated','sgh_lectura');
```
```
fila | 3a685a1a-3ff7-45dc-8af3-88f5c5f29377 | super_admin         | 2026-04-22 | 24 | texto que empieza con mana (placeholder) | auth_user_id: sí
fila | 9ac2d140-faec-424c-9437-0cedeb8b8b82 | secretario_carreras | 2026-04-22 | 24 | texto que empieza con mana (placeholder) | auth_user_id: sí
col  | default: (ninguno) | nullable: NO | text
fn_que_la_nombra    | fn_auditoria_log      | public
fn_que_la_nombra    | rpc_aprobar_solicitud | public
(ninguna vista)
grant_columna | anon          | INSERT, REFERENCES, SELECT, UPDATE
grant_columna | authenticated | INSERT, REFERENCES, SELECT, UPDATE
(sgh_lectura: ninguno)
```
```sql
select id, password_hash = 'managed_by_supabase_auth' es_placeholder, (select count(*) from usuarios where password_hash = '') vacias, (select count(*) from usuarios) total
from usuarios where coalesce(password_hash,'')<>'';
```
```
3a685a1a-3ff7-45dc-8af3-88f5c5f29377 | true | 31 | 33
9ac2d140-faec-424c-9437-0cedeb8b8b82 | true | 31 | 33
```
```sql
select p.proname, regexp_matches(p.prosrc, '[^\n]*password_hash[^\n]*', 'g') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosrc ilike '%password_hash%';
```
```
fn_auditoria_log      |       v_datos_antes := v_datos_antes - 'password_hash';
fn_auditoria_log      |       v_datos_despues := v_datos_despues - 'password_hash';
rpc_aprobar_solicitud |     INSERT INTO usuarios (email,nombre_completo,telefono,club_id,rol,activo,estado,auth_user_id,entidad_tipo,entidad_id,password_hash)
```
```sql
select count(*) filter (where coalesce(datos_antes->>'password_hash','')<>'' or coalesce(datos_despues->>'password_hash','')<>''),
       count(*) filter (where (datos_antes ? 'password_hash') or (datos_despues ? 'password_hash')), count(*)
from auditoria where tabla='usuarios';
```
```
0 | 0 | 1357
```

### Código (`main`)

```
$ git grep -n "password_hash" main -- . ':!*.md'      (las que escriben o la mencionan; el resto son probes que mandan '')
migrations/sec_autoregistro_gate2.sql:278:  -- password_hash es NOT NULL y vestigio pre-Supabase-Auth: la contraseña real
migrations/sec_autoregistro_gate2.sql:283:      activo, estado, auth_user_id, entidad_tipo, entidad_id, password_hash
supabase/functions/invite-user/index.ts:474:    // La fila que va a public.usuarios. `password_hash: ''` porque la columna
supabase/functions/invite-user/index.ts:485:      password_hash: '',
tests/local/auditoria_sandbox.sql:77:      v_datos_antes := v_datos_antes - 'password_hash';
tests/local/auditoria_sandbox.sql:80:      v_datos_despues := v_datos_despues - 'password_hash';
$ git grep -n "password_hash" main -- '*.html'
(sin salida: ninguna pantalla la nombra)
$ git grep -nE "from\('usuarios'\)\.select\('\*'" main -- '*.html' '*.js' '*.ts'
usuarios.html:237:  let query = sb.from('usuarios').select('*').order('nombre_completo');
$ git log --all --reverse --format='%H %ad %s' --date=short -S"password_hash" | head -2
3f9b6ba6d562fa954d309a70720bbe96e2fa33d8 2026-05-10 docs: project handoff documentation [2026-05-10]
32feb54f0ae6f9c864c4d299af401be9300d3a86 2026-07-22 docs(security): flujo real de alta de usuarios (read-only)
```
