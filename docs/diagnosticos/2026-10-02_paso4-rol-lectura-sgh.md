# Paso 4 — rol de Postgres de solo lectura (`sgh_lectura`)

- **Fecha**: 2026-10-02 (17:31 UTC) · **`main`**: `e82a5484898c2868f3fe1b248985f3ba69d07b50`
- **Guards**: `pwd` ✅ · ref `unlhcuanfrtpatoipwve` ✅ · clubs Dolores por uuid ✅
- **Migración**: `migrations/rol_sgh_lectura.sql` + `rollback_rol_sgh_lectura.sql` — **PR #43** (`chore/rol-sgh-lectura`,
  `df2f97fbf496c08fa4c9cad63b719845e1b3e769`), sin mergear. **Aplicada en prod** por `apply_migration` con el texto exacto del archivo
  (md5 del archivo `5ca0cd4132a5e4e802945d939b17ae5a`).
- **La contraseña NO está en este informe ni en el repo**: se entregó por la terminal. En la base se puso con el **verificador SCRAM**
  calculado afuera (la base registra el DDL: `log_statement = ddl`), así que ningún log tiene la contraseña.
- Nombre genérico del rol (`sgh_lectura`): sin el nombre de la persona.

## Qué es

| Atributo | Valor |
|---|---|
| LOGIN | sí |
| BYPASSRLS | **sí** (decisión del 02/10: las 37 tablas tienen RLS y ninguna política aplica a un rol nuevo; sin esto veía 0 filas) |
| SUPERUSER / CREATEDB / CREATEROLE / REPLICATION | no |
| Herencia de roles | no |
| Conexiones | hasta 3 |
| `statement_timeout` | 30 s |
| `default_transaction_read_only` | on |
| `idle_in_transaction_session_timeout` | 60 s |
| USAGE en `public` | sí · CREATE en `public`: **no** |
| SELECT | **39 de 41** tablas y vistas de `public` |
| INSERT / UPDATE / DELETE / TRUNCATE | **en ninguna** |
| EXECUTE | ninguno otorgado (ver límites) |

## Tablas de `public` con tokens, claves o secretos — SIN SELECT

Barrido por nombre de columna (`token|secret|secreto|clave|password|passwd|hash|api_key|jwt|otp|refresh|credencial|private|cbu|alias…`)
sobre las 37 tablas, más las 4 vistas, más la auditoría:

| Tabla | Qué guarda | Medido | SELECT |
|---|---|---|---|
| **`usuarios`** | `password_hash` | 2 filas con valor | **no** |
| **`club_configuracion`** | `clave` / `valor` (configuración por club) | hoy 0 filas; es la tabla pensada para tokens y claves | **no** |
| `clubs` | `secretaria_carreras_nombre` | falso positivo (es un nombre, no un secreto) | sí |
| `auditoria` | copias de filas en `datos_antes`/`datos_despues` | de `usuarios` hay 1357 filas y **ninguna** trae `password_hash`; no audita `club_configuracion` | sí |
| 4 vistas (`v_inscriptos_carrera`, `v_programa_reunion`, `v_sanciones_vigentes`, `v_spcs_activos`) | — | ninguna toca `usuarios` ni `club_configuracion` | sí |

Las tablas `_bak_*` / `bak_*` / `_gate41_*` (copias de spcs y propietarios) no tienen secretos: SELECT sí.

**Ojo, no es secreto pero es sensible**: con BYPASSRLS el rol lee **datos personales** — DNI, teléfonos y emails de `profesionales`,
`propietarios`, `solicitudes_acceso`, `caballeriza_responsables`, `apoderados`, `clubs` y `recibos.cobrador_documento`. Si no tiene que verlos,
hay que sacarles el SELECT (o dar SELECT por columna).

## Pruebas, conectado como `sgh_lectura` a la base de prod (psql, `sslmode=require`)

| # | Prueba | Resultado |
|---|---|---|
| T1 | `select count(*)` en `reuniones` y `liquidacion_detalle` (tablas con RLS) | ✅ anda: 14 y 709 |
| T2 | sesión | `statement_timeout` 30s · `default_transaction_read_only` on · BYPASSRLS t |
| T3 | `UPDATE reuniones …` | ✅ falla: `cannot execute UPDATE in a read-only transaction` |
| T4 | `SET default_transaction_read_only = off` + `UPDATE reuniones …` | ✅ falla: `permission denied for table reuniones` |
| T5 | `DELETE recibos` / `INSERT club_secuencias` (sin modo solo lectura) | ✅ fallan: `permission denied` |
| T6 | `SELECT` en `usuarios` y `club_configuracion` | ✅ fallan: `permission denied` |
| T7 | `CREATE TABLE public.…` | ✅ falla: `permission denied for schema public` |
| T7b | `CREATE TEMP TABLE` sacando el modo solo lectura | ⚠ **anda** (ver límites) |
| T8 | `select pg_sleep(35)` | ✅ se corta: `canceling statement due to statement timeout` |
| T9 | `select emitir_recibo(…)` | ✅ falla: `permission denied for function emitir_recibo` |

## Límites que este rol no puede cambiar

1. **Tablas temporales**: el permiso `TEMPORARY` sobre la base viene de `PUBLIC`. Si la persona pone `default_transaction_read_only = off`
   en su sesión, puede crear tablas **temporales** (sólo de su sesión, se borran al desconectar; no tocan datos). Sacarlo exige revocar
   TEMPORARY a PUBLIC en toda la base, que afecta a los demás roles: no lo hice.
2. **EXECUTE**: las funciones con EXECUTE para `PUBLIC` las puede ejecutar cualquier rol. Medido hoy: de las 19 `SECURITY DEFINER` que
   PUBLIC puede ejecutar, 3 son de trigger (no se pueden llamar directo) y las otras 16 **sólo leen** (helpers `fn_club_de_*`, `fn_is_*`,
   `fn_mis_*`, `rpc_padron_spcs`, `validar_inscripcion`). Las RPC que escriben (como `emitir_recibo`) no tienen EXECUTE para PUBLIC (T9).
3. **Tablas nuevas**: el SELECT es sobre lo que existe hoy; una tabla nueva no queda legible hasta que se le otorgue (a propósito).

## Salida cruda

### Estado del rol después de aplicar

```sql
select r.rolname, r.rolcanlogin, r.rolbypassrls, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolinherit, r.rolconnlimit,
 (select string_agg(cfg, ' | ') from pg_db_role_setting s, unnest(s.setconfig) cfg where s.setrole=r.oid) settings,
 has_schema_privilege('sgh_lectura','public','USAGE') usage_public, has_schema_privilege('sgh_lectura','public','CREATE') create_public,
 (… count de relaciones de public con SELECT …) tablas_select, (… total …) tablas_total, (… las que no …) sin_select, (… con INSERT/UPDATE/DELETE/TRUNCATE …) tablas_con_escritura
from pg_roles r where r.rolname='sgh_lectura';
```
```
rolname=sgh_lectura rolcanlogin=true rolbypassrls=true rolsuper=false rolcreatedb=false rolcreaterole=false rolreplication=false rolinherit=false rolconnlimit=3
settings=statement_timeout=30s | default_transaction_read_only=on | idle_in_transaction_session_timeout=60s
usage_public=true create_public=false tablas_select=39 tablas_total=41 sin_select=club_configuracion,usuarios tablas_con_escritura=0
```

### Barrido de secretos

```sql
select c.table_name, c.column_name, c.data_type from information_schema.columns c join information_schema.tables t on … where c.table_schema='public' and t.table_type='BASE TABLE'
  and c.column_name ~* '(token|secret|secreto|clave|password|passwd|pass_|_pass|hash|api_?key|apikey|jwt|otp|refresh|credencial|private|privada|firma_digital|cbu|alias)';
```
```
club_configuracion | clave                      | character varying
clubs              | secretaria_carreras_nombre | text
usuarios           | password_hash              | text
```
```sql
select 'cfg_clave', clave, length(valor) from club_configuracion;                                  -- 0 filas
select count(*) from usuarios where coalesce(password_hash,'')<>'';                                  -- 2
select count(*) filter (where coalesce(datos_antes->>'password_hash','')<>'' or coalesce(datos_despues->>'password_hash','')<>''),
       count(*) from auditoria where tabla='usuarios';                                               -- 0 de 1357
select relname, pg_get_viewdef(oid) ~* 'usuarios|club_configuracion|password' from pg_class … relkind in ('v','m');   -- las 4: false
```

### Funciones SECURITY DEFINER ejecutables por PUBLIC (no trigger): ¿escriben?

```sql
select p.proname, (p.prosrc ~* '\m(insert\s+into|update\s+\w+\s+set|delete\s+from|truncate|alter\s|create\s|drop\s|grant\s)') escribe
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee=0 and a.privilege_type='EXECUTE')) and p.prorettype <> 'trigger'::regtype;
```
```
fn_club_de_caballeriza f · fn_club_de_carrera f · fn_club_de_inscripcion f · fn_club_de_liquidacion f · fn_club_de_resolucion f ·
fn_club_de_resultado f · fn_club_de_reunion f · fn_get_user_club_id f · fn_is_portal_user f · fn_is_staff f · fn_is_super_admin f ·
fn_mis_entidades f · fn_mis_spc_ids f · fn_mis_spc_visibles f · rpc_padron_spcs f · validar_inscripcion f
```

### Pruebas como `sgh_lectura` (salida tal cual)

```
-- T1 SELECT (con RLS en la tabla; BYPASSRLS)
14
709
-- T2 configuración de la sesión
30s
on
t
-- T3 UPDATE (transacción solo lectura)
ERROR:  cannot execute UPDATE in a read-only transaction
-- T4 UPDATE sacando el modo solo lectura en la sesión
SET
ERROR:  permission denied for table reuniones
-- T5 DELETE / INSERT
SET
ERROR:  permission denied for table recibos
ERROR:  permission denied for table club_secuencias
-- T6 SELECT en tablas excluidas
ERROR:  permission denied for table usuarios
ERROR:  permission denied for table club_configuracion
-- T7 CREATE
SET
ERROR:  permission denied for schema public
LINE 1: create table public.prueba_rol(a int)
                     ^
SET
CREATE TABLE
-- T8 statement_timeout (pg_sleep 35 s)
ERROR:  canceling statement due to statement timeout
-- T9 RPC que escribe (sin EXECUTE)
ERROR:  permission denied for function emitir_recibo
```

(Contraseña: entregada por la terminal; en la base, sólo el verificador SCRAM. El sandbox se usó antes para probar la migración y se dejó
como estaba con el rollback.)

## Verificación de push

Chequeo de datos personales sobre lo agregado (los cinco informes de los pasos 1 a 5): 1 coincidencia en la primera pasada (un rango de
números de línea del paso 5 escrito con guion, reescrito con "a"); segunda pasada **0**. Nombres de personas en lo agregado: **0**. La
contraseña del rol en lo agregado: **0**.

```
$ git push -q origin HEAD:reports && git ls-remote origin reports && git rev-parse HEAD
64b6fee87cdaa025b7b7fe965e75df3b0a20abc4	refs/heads/reports
64b6fee87cdaa025b7b7fe965e75df3b0a20abc4
```

Este anexo va en un commit posterior; su SHA es el tip de `origin/reports`.
