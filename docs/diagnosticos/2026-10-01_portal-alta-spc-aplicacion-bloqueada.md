# Portal — alta de SPC: aplicación en prod BLOQUEADA en el paso 1 (nada aplicado, nada deployado, nada mergeado)

- **Fecha:** 2026-10-01, 23:56–00:05 UTC
- **Pedido:** "aplicá ahora" — 0) actividad, 1) migración, 2) deploy de studbook-buscar, 3) merge del PR #29; si falla 1 o 2,
  rollback y no mergear.
- **Resultado:** **falló el paso 1.** Postgres rechazó la migración entera (una sola transacción): **prod quedó exactamente
  como estaba** (verificado contra la foto previa, §3). Pasos 2 y 3 **no se ejecutaron**. PR #29 **sin mergear**.

## SHA de cada paso

| Paso | Estado | Referencia |
|---|---|---|
| — | `main` | `cf99bf45abdb990cda55d8f66314081ceb3f85b0` (sin cambios) |
| — | rama `feat/portal-alta-spc-studbook` | `a1414ef043eb7609cfad9d6f304deaffe92bbb7d` (PR #29, abierto) |
| 0 | actividad | sin actividad (§1) |
| 1 | migración | **ERROR**; no se creó versión en `supabase_migrations` (sigue `20260927223704`) |
| 2 | deploy studbook-buscar | **no ejecutado** (sigue v1, `ezbr_sha256 eb5ca612…`) |
| 3 | merge PR #29 | **no ejecutado** |

## 1. Paso 0 — actividad (MCP, prod)

```sql
select now() as ahora,
 (select json_agg(json_build_object('t',i.created_at,'canal',i.canal,'reunion',r.numero,'turno',c.numero_turno) order by i.created_at desc) from inscripciones i join carreras c on c.id=i.carrera_id join reuniones r on r.id=c.reunion_id where i.created_at > now() - interval '2 hours') as altas_2h,
 (select json_agg(json_build_object('t',i.updated_at,'canal',i.canal,'estado',i.estado) order by i.updated_at desc) from inscripciones i where i.updated_at > now() - interval '2 hours' and i.updated_at <> i.created_at) as ediciones_2h,
 (select count(*) from inscripciones where greatest(created_at,updated_at) > now() - interval '15 minutes') as actividad_15min,
 (select json_agg(json_build_object('t',created_at,'tabla',tabla,'accion',accion) order by created_at desc) from auditoria where created_at > now() - interval '15 minutes') as auditoria_15min,
 (select count(*) from spcs) as spcs;
```

```json
[{"ahora":"2026-10-01 23:56:15.932712+00","altas_2h":null,"ediciones_2h":null,"actividad_15min":0,"auditoria_15min":null,"spcs":238}]
```

Ninguna inscripción creada ni editada en 2 h (ni portal ni staff), nada en auditoría en 15 min → se siguió.

## 2. Fotos previas

### 2.1 Catálogo (MCP, prod) — recuento de spcs = 238

```sql
select json_build_object(
 'pol', (select md5(string_agg(tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), '#' order by tablename, policyname)) from pg_policies where schemaname='public'),
 'gr', (select md5(string_agg(table_name||'|'||grantee||'|'||privilege_type, '#' order by table_name, grantee, privilege_type)) from information_schema.role_table_grants where table_schema='public'),
 'n_pol', (select count(*) from pg_policies where schemaname='public'),
 'spcs_cols', (select count(*) from information_schema.columns where table_schema='public' and table_name='spcs'),
 'spcs', (select count(*) from spcs),
 'last_mig', (select max(version) from supabase_migrations.schema_migrations)
) r;
```

```json
[{"r":{"pol":"b277600da61ecda6e6b1e2250e508fa6","gr":"3df22f64b340ea4a816c4b3c3c3f95f6","n_pol":120,"spcs_cols":24,"spcs":238,"last_mig":"20260927223704"}}]
```

### 2.2 Búsqueda de STAFF con la v1 desplegada (para comparar después del deploy)

Script de un solo uso (en el scratchpad, no en el repo): crea un operador de prueba por magiclink, invoca
`studbook-buscar` con 7 términos y guarda la respuesta sin `fuente`; borra el usuario en el `finally`
(`teardown_usuarios_restantes: 0`). Salida completa:

```json
{
  "email": "probe.sbfoto.operador.muq70z6d@sgh.test",
  "resultados": {
    "BIEN COQUETA": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "BIEN COQUETA",
        "exactos": [
          {
            "sb_id": "429819",
            "nombre": "BIEN COQUETA",
            "fecha_nacimiento": "2021-10-15",
            "sexo": "hembra",
            "sexo_sb": "Hembra",
            "color": "Zaino Colorado",
            "padrillo_nombre": "Bien Terminado",
            "madre_nombre": "Gritty",
            "abuelo_materno": "Luhuk (USA)",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/429819/bien-coqueta",
            "leyenda": "(2021 H SP)",
            "tomo": 1241,
            "folio": 202,
            "raza": 4,
            "alertas": []
          },
          {
            "sb_id": "216248",
            "nombre": "BIEN COQUETA",
            "fecha_nacimiento": "1998-07-29",
            "sexo": "hembra",
            "sexo_sb": "Hembra",
            "color": "Alazan",
            "padrillo_nombre": "Yale Twentyniner (USA)",
            "madre_nombre": "Coquetisima",
            "abuelo_materno": "Friul",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/216248/bien-coqueta",
            "leyenda": "(1998 H SP)",
            "tomo": 1057,
            "folio": 260,
            "raza": 4,
            "alertas": []
          }
        ],
        "parciales": []
      }
    },
    "MARIA CATU": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "MARIA CATU",
        "exactos": [],
        "parciales": [
          {
            "sb_id": "440678",
            "nombre": "MARIA CATULENGA",
            "fecha_nacimiento": "2022-10-15",
            "sexo": "hembra",
            "sexo_sb": "Hembra",
            "color": "Zaino",
            "padrillo_nombre": "Fiskardo",
            "madre_nombre": "Ever Propulsora",
            "abuelo_materno": "Ever Peace",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/440678/maria-catulenga",
            "leyenda": "(2022 H SP)",
            "tomo": 1251,
            "folio": 889,
            "raza": 4,
            "alertas": []
          }
        ]
      }
    },
    "bella doña": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "bella doña",
        "exactos": [
          {
            "sb_id": "403664",
            "nombre": "BELLA DOÑA",
            "fecha_nacimiento": "2017-11-13",
            "sexo": "macho",
            "sexo_sb": "Macho",
            "color": "Alazan",
            "padrillo_nombre": "Bella Shambrock (USA)",
            "madre_nombre": "La Mejorcita",
            "abuelo_materno": "Missionary (USA)",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/403664/bella-dona",
            "leyenda": "(2017 M SP)",
            "tomo": 1215,
            "folio": 427,
            "raza": 4,
            "alertas": []
          }
        ],
        "parciales": []
      }
    },
    "WAVE RIMOUT": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "WAVE RIMOUT",
        "exactos": [
          {
            "sb_id": "397805",
            "nombre": "WAVE RIMOUT",
            "fecha_nacimiento": "2017-08-08",
            "sexo": "macho",
            "sexo_sb": "Macho",
            "color": "Zaino",
            "padrillo_nombre": "Remote (GB)",
            "madre_nombre": "Holiday Wave",
            "abuelo_materno": "Harlan's Holiday (USA)",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/397805/wave-rimout",
            "leyenda": "(2017 M SP)",
            "tomo": 1209,
            "folio": 804,
            "raza": 4,
            "alertas": []
          }
        ],
        "parciales": []
      }
    },
    "EL MAS SABIO": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "EL MAS SABIO",
        "exactos": [
          {
            "sb_id": "431662",
            "nombre": "EL MAS SABIO",
            "fecha_nacimiento": "2021-10-26",
            "sexo": "macho",
            "sexo_sb": "Macho",
            "color": "Alazan",
            "padrillo_nombre": "Il Campione (CHI)",
            "madre_nombre": "Indigirka",
            "abuelo_materno": "Interprete",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/431662/el-mas-sabio",
            "leyenda": "(2021 M SP)",
            "tomo": 1242,
            "folio": 998,
            "raza": 4,
            "alertas": []
          }
        ],
        "parciales": []
      }
    },
    "ZZZZQ": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "ZZZZQ",
        "exactos": [],
        "parciales": []
      }
    },
    "ab": {
      "status": 400,
      "body": {
        "ok": false,
        "error": "term_invalido",
        "detalle": "term: entre 3 y 60 caracteres, sin caracteres de control."
      }
    }
  },
  "teardown_usuarios_restantes": 0
}
```

Queda como referencia para cuando se haga el deploy.

## 3. Paso 1 — la migración

`apply_migration` (`name: portal_alta_spc_studbook`) con el texto de `migrations/portal_alta_spc_studbook.sql` de `BEGIN;` a
`COMMIT;` (líneas 73–350, leídas del archivo; el encabezado son comentarios). Respuesta:

```
{"error":{"name":"Error","message":"Failed to apply database migration: ERROR:  0A000: cannot alter table \"spcs\" because column \"_bak_merge_duplicados_spc.fila\" uses its row type\n"}}
```

### 3.1 Verificación de que no quedó nada (MCP, prod)

```sql
select json_build_object(
 'pol', (… mismo md5 de 2.1 …), 'gr', (… mismo md5 de 2.1 …),
 'n_pol', (select count(*) from pg_policies where schemaname='public'),
 'spcs_cols', (select count(*) from information_schema.columns where table_schema='public' and table_name='spcs'),
 'spcs', (select count(*) from spcs),
 'last_mig', (select max(version) from supabase_migrations.schema_migrations),
 'fns_nuevas', (select count(*) from pg_proc where proname in ('rpc_spc_alta_studbook_portal','fn_spcs_alta_revision')),
 'trg_spcs', (select json_agg(tgname) from pg_trigger where tgrelid='public.spcs'::regclass and not tgisinternal),
 'bak_tablas', (select json_agg(json_build_object('schema',n.nspname,'tabla',c.relname,'filas_est',c.reltuples,'rls',c.relrowsecurity,'cols',(select json_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and c.relname ilike '\_bak%'),
 'usan_rowtype_spcs', (select json_agg(a.attrelid::regclass::text||'.'||a.attname) from pg_attribute a where a.atttypid='public.spcs'::regtype and a.attnum>0 and not a.attisdropped)
) r;
```

```json
[{"r":{"pol":"b277600da61ecda6e6b1e2250e508fa6","gr":"3df22f64b340ea4a816c4b3c3c3f95f6","n_pol":120,"spcs_cols":24,"spcs":238,"last_mig":"20260927223704","fns_nuevas":0,"trg_spcs":["trg_spcs_updated_at"],"bak_tablas":[{"schema":"public","tabla":"_bak_merge_duplicados_spc","filas_est":-1,"rls":false,"cols":["fila:spcs","sobreviviente:uuid","borrado_at:timestamp with time zone"]}],"usan_rowtype_spcs":["_bak_merge_duplicados_spc.fila"]}}]
```

**Idéntico a la foto previa** (políticas, grants, 24 columnas, 238 filas, última migración, 0 funciones nuevas, sólo el
trigger de `updated_at`). No hubo nada que revertir: el rollback fue el propio ROLLBACK de la transacción fallida.

## 4. Causa

`migrations/merge_duplicados_spc.sql` (23/08, unificación de Fist Queen / Malenuchi) creó en `public`:

```sql
CREATE TABLE IF NOT EXISTS _bak_merge_duplicados_spc (fila spcs, sobreviviente uuid, borrado_at timestamptz …)
```

La columna `fila` es del **tipo fila** de `spcs`. Postgres no deja agregar columnas a una tabla cuyo tipo fila está
guardado en otra tabla (0A000). El sandbox no tenía esa tabla: el probe no lo podía ver. Contenido actual:

```sql
select json_build_object('filas', (select count(*) from _bak_merge_duplicados_spc),
 'contenido', (select json_agg(json_build_object('nombre',(fila).nombre,'id',(fila).id,'sobreviviente',sobreviviente,'borrado_at',borrado_at)) from _bak_merge_duplicados_spc),
 'grants', (select json_agg(grantee||':'||privilege_type order by grantee, privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='_bak_merge_duplicados_spc'),
 'comment', obj_description('public._bak_merge_duplicados_spc'::regclass)) r;
```

```json
[{"r":{"filas":2,"contenido":[{"nombre":"Fist Queen","id":"0dc2f58f-0e2f-4915-be79-a7515fdd6ee4","sobreviviente":"214e5a7a-f773-4c44-95e9-41f0b25ef55a","borrado_at":"2026-08-23T15:54:50.991997+00:00"},{"nombre":"Malenuchi","id":"da839b11-00a3-4eb8-b09f-03790d425ed9","sobreviviente":"9c9c742c-86a1-4c7b-a060-6ab47900b451","borrado_at":"2026-08-23T15:54:50.991997+00:00"}],"grants":["anon:DELETE","anon:INSERT","anon:REFERENCES","anon:SELECT","anon:TRIGGER","anon:TRUNCATE","anon:UPDATE","authenticated:DELETE","authenticated:INSERT","authenticated:REFERENCES","authenticated:SELECT","authenticated:TRIGGER","authenticated:TRUNCATE","authenticated:UPDATE","postgres:DELETE","postgres:INSERT","postgres:REFERENCES","postgres:SELECT","postgres:TRIGGER","postgres:TRUNCATE","postgres:UPDATE","service_role:DELETE","service_role:INSERT","service_role:REFERENCES","service_role:SELECT","service_role:TRIGGER","service_role:TRUNCATE","service_role:UPDATE"],"comment":"Fichas de SPC borradas al unificar duplicados. Base del rollback. No la lee ninguna función de la app."}}]
```

## 5. ⚠ Hallazgo de seguridad (aparte del bloqueo)

`_bak_merge_duplicados_spc` está en `public`, **sin RLS**, y `anon` tiene SELECT/INSERT/UPDATE/DELETE/TRUNCATE: con la key
publishable (pública, está en los HTML) cualquiera puede leerla, alterarla o vaciarla por la API REST — y es la base del
rollback de la unificación del 23/08. `get_advisors security` marca lo mismo en **otras dos tablas**. Leí el resultado
completo (75 hallazgos: 41 + 26 WARN de SECURITY DEFINER ejecutables por authenticated/anon, 3 INFO, 4 ERROR, 1 WARN de
Auth); éstos son los ERROR y los INFO/WARN no repetitivos:

```
INFO rls_enabled_no_policy | Table \`archive.backup_inscripciones_20260515\` has RLS enabled, but no policies exist | https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
INFO rls_enabled_no_policy | Table \`archive.backup_spcs_20260515\` has RLS enabled, but no policies exist | https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
INFO rls_enabled_no_policy | Table \`public.spc_entrenadores_hist\` has RLS enabled, but no policies exist | https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
ERROR security_definer_view | View \`public.v_inscriptos_carrera\` is defined with the SECURITY DEFINER property | https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view
ERROR rls_disabled_in_public | Table \`public.bak_r8_propietario\` is public, but RLS has not been enabled. | https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public
ERROR rls_disabled_in_public | Table \`public._gate41_backfill_tenencia\` is public, but RLS has not been enabled. | https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public
ERROR rls_disabled_in_public | Table \`public._bak_merge_duplicados_spc\` is public, but RLS has not been enabled. | https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public
WARN auth_leaked_password_protection | Supabase Auth prevents the use of compromised passwords by checking against HaveIBeenPwned.org. Enable this feature to enhance security. | https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
```

`bak_r8_propietario` probablemente tiene datos de propietarios (por el nombre; **no lo abrí**). No toqué ninguna de las tres.

## 6. Qué hace falta decidir (no hice nada de esto)

**Para destrabar la migración**, una de dos (recomiendo A):

- **A. Pasar el respaldo a `jsonb` y cerrarlo.** Migración previa, chica:
  ```sql
  ALTER TABLE public._bak_merge_duplicados_spc ALTER COLUMN fila TYPE jsonb USING to_jsonb(fila);
  ALTER TABLE public._bak_merge_duplicados_spc ENABLE ROW LEVEL SECURITY;          -- sin políticas: sólo service_role/postgres
  REVOKE ALL ON public._bak_merge_duplicados_spc FROM anon, authenticated;
  ```
  Conserva las 2 fichas completas. Hay que actualizar `migrations/rollback_merge_duplicados_spc.sql` (hoy hace
  `INSERT INTO spcs SELECT (fila).* …`) a `SELECT (jsonb_populate_record(NULL::spcs, fila)).*` — que además sigue
  funcionando cuando `spcs` tenga columnas nuevas (quedan NULL/default). Se prueba en el sandbox con una réplica de la tabla
  antes de aplicarla, y el probe de la feature suma esa tabla al fixture para que esto no vuelva a pasar.
- **B. Borrar el respaldo** (5+ semanas después de la unificación). Irreversible; pierde la base del rollback de 23/08.

**Las otras dos tablas sin RLS** (`bak_r8_propietario`, `_gate41_backfill_tenencia`): propongo el mismo
`ENABLE RLS` + `REVOKE` de anon/authenticated como tarea aparte, con relevamiento previo de qué contienen y si algo las lee.
Por la exposición, antes de abrir el portal a esto.

Con el OK de A: aplico A (sandbox → prod, verificando), reintento el paso 1 con la misma migración (el md5 esperado no
cambia: `fn_spcs_alta_revision cd33a768…`, `rpc_spc_alta_studbook_portal 704f4762…`) y sigo con 2 y 3 como se pidió.

**Paso 3, para cuando se llegue:** "probar la nueva" en sigh.com.ar **crea un ejemplar real en prod** (GOTCHA #101, regla
del 01/10), y la única ventana de inscripción abierta es la de **R10** (cierra el 02/10 15:00 UTC; la 9999 está cancelada),
así que también la "inscripción normal" de prueba quedaría en un turno real, a la vista de Yesi. Propuesta: en prod, la
inscripción normal con un usuario de prueba en R10 y retirarla en el mismo minuto (o abrir una ventana temporal en un turno
de la 9999), y la nueva sólo hasta el rechazo/reuso sin escritura (`probe_studbook_buscar_e2e` 7a–7e) más un caballo que
ya esté en el padrón (D1, reusa). Si querés un alta real, que sea un caballo que Yesi igual tenga que cargar.

---

## Verificación de push

```
$ git push -q origin HEAD:reports
$ git ls-remote origin reports
ac6b39d4f5a92e86a9216d44e3366a1cfc23e1cd	refs/heads/reports
$ git rev-parse HEAD
ac6b39d4f5a92e86a9216d44e3366a1cfc23e1cd
```

Coinciden (commit `ac6b39d`). Este bloque va en un commit posterior.
