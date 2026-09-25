# REVOKE EXECUTE de `fn_reunion_liq_cerrada` a PUBLIC y anon — aplicado; PR #18 sin merge

- Fecha: 2026-09-25
- Rama `fix/revoke-fn-reunion-liq-cerrada` @ `46c2afc1bdfa9d721c747a7dcb41291e34237966` (base `main` @ `afc6af5`) — PR https://github.com/mdqclio/SGH/pull/18, **sin merge**
- Guards: `pwd` = /home/clio/dev/SGH · `select count(*) from spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- Escrituras en prod: (1) `apply_migration` `revoke_fn_reunion_liq_cerrada` (`20260925165014`); (2) la re-prueba del
  INSERT en R6, que rebotó, con un usuario de auth temporal creado y borrado. **El recálculo de R9 NO se corrió.**

## Resumen

| | Antes | Después |
|---|---|---|
| `has_function_privilege('anon', …, 'EXECUTE')` | true | **false** |
| `has_function_privilege('authenticated', …)` | true | true (se conserva: el alcance del OK es PUBLIC y anon) |
| `service_role` / `postgres` | true / true | true / true |
| ACL | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` (salieron PUBLIC y anon) |
| `POST /rest/v1/rpc/fn_reunion_liq_cerrada` como anon | HTTP 200 `true` | HTTP 401 `42501 permission denied` |
| md5 de la función | `11730b64066014745a40500ab5f97fb0` | igual: la función no cambió |
| Trigger: INSERT en R6 como authenticated | P0091 (informe anterior) | **P0091**: sigue rebotando |
| Advisor 0028 (anon) sobre la función | presente | **resuelto** (26 → 25 lints de anon) |
| Advisor 0029 (authenticated) | presente | presente, a sabiendas |

El encabezado del `.sql` se actualizó **después** de aplicarlo, con el estado APLICADA, y lo dice. La sentencia es
idéntica: `REVOKE EXECUTE ON FUNCTION public.fn_reunion_liq_cerrada(uuid) FROM PUBLIC, anon;`.

## Q1 — Antes (MCP)

```sql
select (select count(*) from spcs) spcs, r.rolname,
 has_function_privilege(r.rolname, 'public.fn_reunion_liq_cerrada(uuid)', 'EXECUTE') puede_ejecutar
from pg_roles r where r.rolname in ('anon','authenticated','service_role','postgres') order by 2;
```
```json
[{"spcs":210,"rolname":"anon","puede_ejecutar":true},{"spcs":210,"rolname":"authenticated","puede_ejecutar":true},{"spcs":210,"rolname":"postgres","puede_ejecutar":true},{"spcs":210,"rolname":"service_role","puede_ejecutar":true}]
```
```sql
select p.proname, p.proacl::text acl, md5(pg_get_functiondef(p.oid)) md5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('fn_reunion_liq_cerrada','fn_liq_cerrada_guard','fn_reunion_cierre_guard') order by 1;
```
```json
[{"proname":"fn_liq_cerrada_guard","acl":"{postgres=X/postgres,service_role=X/postgres}","md5":"e17f0c81a60afa0356fcda83819f5d4a"},{"proname":"fn_reunion_cierre_guard","acl":"{postgres=X/postgres,service_role=X/postgres}","md5":"e531d5094c6ca559d3e0898b38c8839c"},{"proname":"fn_reunion_liq_cerrada","acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}","md5":"11730b64066014745a40500ab5f97fb0"}]
```

API como anon, antes:
```bash
#!/usr/bin/env bash
# Llama a /rest/v1/rpc/fn_reunion_liq_cerrada como anon (publishable key, sin sesión) sobre R6.
curl -s -w '\nHTTP %{http_code}\n' -X POST 'https://unlhcuanfrtpatoipwve.supabase.co/rest/v1/rpc/fn_reunion_liq_cerrada' \
  -H 'apikey: sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK' -H 'Content-Type: application/json' \
  -d '{"p_reunion_id":"b02ca761-6f44-4720-86aa-a3c3099019ea"}'
```
```
true
HTTP 200
```

## Q2 — Sandbox (tests/local) antes de prod

```
$ tests/local/up.sh sql < migrations/revoke_fn_reunion_liq_cerrada.sql
REVOKE
    rolname    | has_function_privilege
---------------+------------------------
 anon          | f
 authenticated | f
 service_role  | f
$ SOLO=D node tests/probe_reparto_100.mjs
✅ D1) reunión cerrada: un INSERT como authenticated en liquidacion_detalle → P0091
✅ D2) reunión cerrada: un UPDATE como authenticated → P0091
✅ D3) reunión cerrada: un DELETE como authenticated → P0091
✅ D4) reunión cerrada: borrar el header como authenticated → P0091
✅ D5) service_role (regularización) sí puede escribir en la reunión cerrada
✅ D6) reabrir como authenticated (no super_admin) → 42501
✅ D7) limpieza: 0 filas de prueba y la 9999 vuelve a quedar abierta

7/7 checks OK
```
(En el sandbox `authenticated`/`service_role` también dan `f`: el clon no trae los GRANT explícitos de Supabase. Los
triggers funcionan igual, porque la llamada sale de una función SECURITY DEFINER.)

## Q3 — Aplicación y después (MCP)

`apply_migration(name='revoke_fn_reunion_liq_cerrada', query=<el archivo, textual>)` → `{"success":true}`.
```sql
select r.rolname, has_function_privilege(r.rolname, 'public.fn_reunion_liq_cerrada(uuid)', 'EXECUTE') puede_ejecutar,
 (select p.proacl::text from pg_proc p where p.proname='fn_reunion_liq_cerrada') acl,
 (select md5(pg_get_functiondef(p.oid)) from pg_proc p where p.proname='fn_reunion_liq_cerrada') md5,
 (select version||' '||name from supabase_migrations.schema_migrations order by version desc limit 1) ultima_migracion
from pg_roles r where r.rolname in ('anon','authenticated','service_role','postgres') order by 1;
```
```json
[{"rolname":"anon","puede_ejecutar":false,"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","md5":"11730b64066014745a40500ab5f97fb0","ultima_migracion":"20260925165014 revoke_fn_reunion_liq_cerrada"},{"rolname":"authenticated","puede_ejecutar":true,"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","md5":"11730b64066014745a40500ab5f97fb0","ultima_migracion":"20260925165014 revoke_fn_reunion_liq_cerrada"},{"rolname":"postgres","puede_ejecutar":true,"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","md5":"11730b64066014745a40500ab5f97fb0","ultima_migracion":"20260925165014 revoke_fn_reunion_liq_cerrada"},{"rolname":"service_role","puede_ejecutar":true,"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","md5":"11730b64066014745a40500ab5f97fb0","ultima_migracion":"20260925165014 revoke_fn_reunion_liq_cerrada"}]
```

API como anon, después (mismo script):
```
{"code":"42501","details":null,"hint":null,"message":"permission denied for function fn_reunion_liq_cerrada"}
HTTP 401
```

Trigger intacto (INSERT en R6 como authenticated, mismo script que en el informe anterior):
```
sesión: {"role":"authenticated","aud":"authenticated","fila_en_usuarios":false}
INSERT R6 como authenticated → {"status":500,"error":{"code":"P0091","details":null,"hint":null,"message":"La liquidación de esta reunión está cerrada (saldada): no se puede modificar liquidacion_detalle. ISSUE-091"},"data":null}
✅ rebotó con P0091
filas de prueba que quedaron en la base: 0
usuario temporal borrado: true 
filas en usuarios del usuario temporal: 0
```

## Q4 — Advisors de seguridad después (`get_advisors security`; salida entera, 79.454 caracteres, procesada con Python)

```
caracteres leídos: 79454 de 79454 (100 %) · lints: 73
25 ('anon_security_definer_function_executable', 'WARN')
1 ('auth_leaked_password_protection', 'WARN')
40 ('authenticated_security_definer_function_executable', 'WARN')
3 ('rls_disabled_in_public', 'ERROR')
3 ('rls_enabled_no_policy', 'INFO')
1 ('security_definer_view', 'ERROR')

fn_reunion_liq_cerrada:
- WARN authenticated_security_definer_function_executable | Function `public.fn_reunion_liq_cerrada(p_reunion_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/fn_reunion_liq_cerrada`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
```

## Pendiente

- **Merge del PR #18** con tu OK. Trae a `main` la migración, el rollback, CLAUDE.md y CHANGELOG. En prod ya está aplicada.
- **Recálculo de R9**: sigue esperando la ventana de Valeria.

## Verificación del push (commit del informe)

```
$ git rev-parse HEAD
20ea785b746c2e2ad73253cc394295765d449ae8
$ git ls-remote origin reports
20ea785b746c2e2ad73253cc394295765d449ae8	refs/heads/reports
```
Este bloque va en un commit posterior ("verificación de push"): el SHA final de `reports` es el de ese commit.
