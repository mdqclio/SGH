# ISSUE-099 (funciones ejecutables por `anon`) + ISSUE-098 (`v_inscriptos_carrera`): Fase 1, sólo lectura

- **Fecha**: 2026-10-02 (16:00 a 16:40 ART)
- **Código leído**: `main` = `c28d8bee35c4304109ac7e6b763129f1b0a2c574` (vía `git show main:` / `git grep … main`)
- **Base**: prod `unlhcuanfrtpatoipwve`, PostgreSQL 17.6. Sólo SELECT por MCP y GET por la API con la publishable key.
  **No se escribió nada en prod.** Las pruebas de semántica de Postgres se hicieron en el sandbox `tests/local/` (contenedor
  `sgh-local-pg`, PostgreSQL 16.15) con objetos temporales que se borraron en el mismo comando.
- **Guards**: pwd `/home/clio/dev/SGH`; ref `unlhcuanfrtpatoipwve`; `SELECT nombre FROM clubs WHERE id='0649e9c5-…'`
  → `Hipódromo de Dolores` (1 fila; verificado en esta sesión antes del relevamiento).

---

## 0. Lo urgente: `v_inscriptos_carrera` está ABIERTA para cualquiera sin login

**Hoy, cualquier persona con la publishable key, que es pública y está en todos los HTML del sitio, lee las 425
inscripciones de la base sin iniciar sesión.** Eso incluye las 48 carreras de todas las reuniones y de todos los clubs.
Las columnas expuestas son:

- caballo: nombre, nacimiento, edad, sexo y pelaje;
- nombre del propietario y sus colores;
- entrenador, jockey titular y jockey suplente (apellido y nombre);
- caballeriza;
- peso declarado y final;
- `info_adicional`, que es texto libre de la secretaría.

Medido con la API (GET, sin token de usuario):

```
v_inscriptos_carrera   HTTP/2 206  content-range: */425
inscripciones          HTTP/2 200  content-range: */0
...
filas 425 carreras distintas 48
GET ...?select=propietario_nombre,entrenador,jockey_titular&limit=1 → 200
```

La tabla `inscripciones` le devuelve 0 filas a anon (la RLS funciona). La vista no le devuelve 0 porque corre con los
permisos de su dueño (`postgres`) y saltea la RLS de las siete tablas que lee.

**Causa (verificada)**: la vista **sí** tuvo `security_invoker=true`, puesto por `security_hardening_fase2_reversible`
(`20260607195414`). El 27/08, la migración `v_inscriptos_carrera_edad_reglamentaria` (`20260827173321`, archivo
`migrations/fn_edad_reglamentaria.sql`) la recreó con `CREATE OR REPLACE VIEW … AS` **sin** `WITH (security_invoker = true)`.
En Postgres, `CREATE OR REPLACE VIEW` **reemplaza** las opciones de la vista por las que trae el comando, así que quedaron
vacías. Prueba en el sandbox:

```
$ docker exec sgh-local-pg psql -U postgres -tA -c "select version()" -c "drop view if exists zz2" \
    -c "create view zz2 with (security_invoker=true) as select 1 a" \
    -c "select 'antes', reloptions from pg_class where relname='zz2'" \
    -c "create or replace view zz2 as select 1 a" \
    -c "select 'despues', reloptions from pg_class where relname='zz2'" -c "drop view zz2"
PostgreSQL 16.15 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit
DROP VIEW
NOTICE:  view "zz2" does not exist, skipping
CREATE VIEW
antes|{security_invoker=true}
CREATE VIEW
despues|
DROP VIEW
```

Entonces la vista está abierta desde el **2026-08-27**, unas 5 semanas. El advisor la marca como ERROR
(`security_definer_view`). El bloque de ROLLBACK de ese mismo archivo, `fn_edad_reglamentaria.sql:313`, tiene el mismo
defecto: si alguien lo corre, la vuelve a abrir.

**Quién la lee**: nadie del sistema. `git grep v_inscriptos_carrera main` sólo aparece en docs y migraciones: 0 HTML, 0 JS,
0 Edge Functions, 0 probes. En `pg_stat_statements` (acumulado desde 2026-07-14) hay **una sola** lectura como `anon`,
`SELECT v_inscriptos_carrera.* … LIMIT/OFFSET`, de origen desconocido: no está en el repo. Ninguna vista ni función
depende de ella.

**¿`security_invoker=true` rompe algo?** No hay ningún lector que se pueda romper. Con invoker, cada rol ve lo que le dejan
ver las RLS de las siete tablas: anon ve 0 filas, staff ve las de su club y portal ve las suyas. Para `authenticated`, la
vista llama `fn_edad_reglamentaria`, que tiene que seguir con EXECUTE para `authenticated` (§2).

**Propuesta para la vista (no aplicada)**:

1. `ALTER VIEW public.v_inscriptos_carrera SET (security_invoker = true);`
2. Como no tiene lectores, se puede ir más lejos: `REVOKE SELECT ON public.v_inscriptos_carrera FROM anon;`, o directamente
   `DROP VIEW`. Lo más conservador es 1 + 2, sin DROP.
3. Corregir el rollback de `fn_edad_reglamentaria.sql` (agregarle `WITH (security_invoker = true)`).
4. Un GOTCHA nuevo: "`CREATE OR REPLACE VIEW` borra `security_invoker`: siempre con `WITH (…)`".
5. Probe: la vista vista como anon tiene que dar 0 filas, y `reloptions` tiene que contener `security_invoker=true`.

Las otras tres vistas (`v_programa_reunion`, `v_sanciones_vigentes`, `v_spcs_activos`) tienen `security_invoker=true` y le
dan 0 filas a anon.

**Decisión pendiente**: si la exposición hay que avisarla a alguien (Fede o el club). Los nombres de propietarios, jockeys y
entrenadores salen en el programa impreso, pero `info_adicional` y las inscripciones de reuniones futuras no.

---

## 1. Inventario: funciones de `public` que `anon` puede ejecutar

Son **31**:

- 26 SECURITY DEFINER, las mismas 26 que lista el advisor `anon_security_definer_function_executable`;
- 5 SECURITY INVOKER.

Todas tienen EXECUTE explícito para `anon`, y 23 además lo tienen por `PUBLIC` (`=X/postgres` en el ACL). Para cerrarlas
hay que revocar a **los dos**: `REVOKE … FROM PUBLIC, anon`. Las 24 restantes de `public` ya no son ejecutables por anon:
son las RPC de plata, resultados y montas que se cerraron el 22–25/09, más los triggers internos.

**Por qué cada función está así**: el `pg_default_acl` de `postgres` en `public` le da EXECUTE a `anon` en **toda función
nueva** (`{postgres=X,anon=X,authenticated=X,service_role=X}`). Es el default de Supabase. Por eso cada RPC nueva nace
abierta a anon salvo que su migración haga el REVOKE.

### 1.1 Tabla

Leyenda:

- **def**: SECURITY DEFINER.
- **escribe**: el cuerpo tiene INSERT, UPDATE o DELETE (para un trigger: modifica `NEW`).
- **guard**: qué hace la función si la llama anon (`auth.uid()` NULL).
- **anon hoy**: qué obtiene anon si la llama por `/rest/v1/rpc`.

| # | función | def | escribe | guard propio | anon hoy | quién la llama (main) | propuesta |
|---|---|---|---|---|---|---|---|
| 1 | `rpc_inscribir` | sí | **sí** (inscripciones) | `fn_mis_entidades()` + usuario activo → excepción | excepción "No autorizado" | portal.html (sesión) | **authenticated** |
| 2 | `rpc_solicitar_acceso` | sí | **sí** (solicitudes_acceso) | `auth.uid() IS NULL` → 28000 | excepción "No autenticado" | solicitar-acceso.html: **sólo con sesión** (`:615`: sin sesión no la llama, muestra "Ya casi") | **authenticated** |
| 3 | `rpc_aprobar_solicitud` | sí | **sí** (usuarios, solicitudes) | `fn_solicitudes_guard_staff` → 28000/42501 | excepción | solicitudes.html (staff) | **authenticated** |
| 4 | `rpc_rechazar_solicitud` | sí | **sí** | ídem | excepción | solicitudes.html (staff) | **authenticated** |
| 5 | `rpc_descartar_solicitud` | sí | **sí** | ídem | excepción | solicitudes.html (staff) | **authenticated** |
| 6 | `fn_solicitudes_guard_staff` | sí | no | ella misma es el guard (28000/42501) | excepción | sólo dentro de 3–5 (que corren como dueño) | **service_role** (nadie la llama directo) |
| 7 | `rpc_padron_spcs` | sí | no | `fn_is_staff() OR fn_is_portal_user()` → excepción | excepción "No autorizado." | portal.html (sesión) | **authenticated** |
| 8 | `rpc_padron_profesionales` | sí | no | **sin guard explícito**: filtra por `fn_get_user_club_id()` | 0 filas | portal.html (sesión) | **authenticated** |
| 9 | `validar_inscripcion` | sí | no | detalle sólo si `fn_is_staff()`; si no, texto genérico | `(false, texto genérico)` | portal (a través de `rpc_inscribir`) y probes | **authenticated** |
| 10 | `fn_get_user_club_id` | sí | no | `auth.uid()` → NULL | NULL | 92 políticas (roles `authenticated`) | **authenticated** |
| 11 | `fn_is_staff` | sí | no | `auth.uid()` → false | false | 62 políticas; `studbook-buscar` con el JWT del caller | **authenticated** (ISSUE-099: obligatorio) |
| 12 | `fn_is_portal_user` | sí | no | → false | false | 24 políticas; `studbook-buscar` | **authenticated** (obligatorio) |
| 13 | `fn_is_super_admin` | sí | no | → false | false | 107 políticas | **authenticated** |
| 14 | `fn_mis_entidades` | sí | no | → 0 filas | 0 filas | 6 políticas; portal.html `:457` | **authenticated** |
| 15 | `fn_mis_spc_ids` | sí | no | (vía `fn_mis_entidades`) → 0 filas | 0 filas | 3 políticas; portal.html `:514` | **authenticated** |
| 16 | `fn_mis_spc_visibles` | sí | no | → 0 filas | 0 filas | 2 políticas (inscripciones, spcs) | **authenticated** |
| 17–23 | `fn_club_de_caballeriza / _carrera / _inscripcion / _liquidacion / _resolucion / _resultado / _reunion` | sí | no | **ninguno** | **devuelve el `club_id` de cualquier uuid** (sirve para saber si un id existe y de qué club es) | 4–12 políticas cada una (roles `authenticated`) | **authenticated** |
| 24 | `fn_autor_fila` | sí | (trigger) | — | PostgREST no expone funciones `RETURNS trigger` | trigger de resoluciones, sanciones | **service_role** (§2.2) |
| 25 | `fn_usuarios_guard_privilegios` | sí | (trigger) | — | ídem | trigger de usuarios | **service_role** |
| 26 | `fn_usuarios_set_auth_user_id` | sí | (trigger) | — | ídem | trigger de usuarios | **service_role** |
| 27 | `fn_proteger_rol_club_id_usuario` | no | (trigger) | — | ídem | trigger de usuarios | **service_role** |
| 28 | `set_updated_at` | no | (trigger) | — | ídem | trigger de 7 tablas | **service_role** |
| 29 | `fn_edad_reglamentaria` | no | no | pura (IMMUTABLE) | calcula | `validar_inscripcion`, `v_inscriptos_carrera`, `rpc_spc_alta_studbook_portal` | **authenticated** (la vista invoker la necesita) |
| 30 | `calcular_premio` | no | no | pura | calcula | **nadie** (0 hits en HTML/JS/EF/probes) | **authenticated** (o DROP en otra tarea) |
| 31 | `siguiente_numero_publico` | no | no | invoker: lee `reuniones` con la RLS del caller | anon ve 0 reuniones → devuelve 1 | reuniones.html (staff) | **authenticated** |

"Escribe" sale de un regex sobre el cuerpo. Se confirmó leyendo el cuerpo de cada una (consulta 3.3): las 5 que escriben
son 1–5 y las 5 de trigger tocan `NEW`. Ninguna otra escribe.

### 1.2 ¿Hay alguna llamada legítima como anon?

**No.** Ninguna página sin sesión (`login.html`, `reset-password.html`, `solicitar-acceso.html` antes del alta) llama una RPC:

- El inventario de `.rpc(` en `main` (consulta 3.5) da 24 pares archivo→función. Todas esas llamadas salen de pantallas
  con sesión.
- `solicitar-acceso.html` llama `rpc_solicitar_acceso` sólo si `authData.session` existe (`:615`).
- Las Edge Functions:
  - `studbook-buscar` llama `fn_is_staff` / `fn_is_portal_user` con el JWT del usuario (rol `authenticated`) y
    `rpc_spc_alta_studbook_portal` con la secret key;
  - `reunion-json` usa su token propio y la secret key;
  - `invite-user` no llama ninguna de estas.
- Las políticas que usan estas funciones (consulta 3.4): **ninguna** se aplica a `anon` ni a `PUBLIC`. Todas son
  `TO authenticated`. Una consulta de anon a esas tablas no evalúa esas políticas, así que el REVOKE no puede convertir un
  "0 filas" en "permission denied for function".
- `pg_stat_statements` (desde 2026-07-14, consulta 3.6): como `anon` aparecen 1 llamada a `fn_is_super_admin`, 1 a
  `fn_get_user_club_id`, 1 a `fn_club_de_reunion` y 1 a `fn_reunion_liq_cerrada`, que ya está revocada para anon y dio
  error. Son 4 llamadas sueltas en 2,5 meses. El patrón es de probes y verificaciones de guard, no de pantallas. Todo lo
  demás es `authenticated`.

**Los logs de la API no se pudieron leer**: `get_logs` respondió "The logs.all endpoint has been removed" y `query_logs`
respondió "You do not have permission to perform this action". El relevamiento de quién llama se apoya en el código, en las
políticas y en `pg_stat_statements`. Si se quiere la confirmación por logs, mirar en el dashboard API → Logs, filtrando
`/rest/v1/rpc/` sin `authorization` de usuario.

### 1.3 Hallazgos de paso (no son de anon, quedan anotados)

- **`fn_club_de_*` (7)** devuelven el club de cualquier uuid **también a `authenticated`**, portal incluido. Filtran poco
  (el `club_id` no es un secreto), pero son un oráculo de existencia. Se puede resolver en otra tarea, porque las
  políticas las necesitan con EXECUTE para authenticated.
- **`rpc_padron_profesionales`** no tiene guard de rol: cualquier authenticated con club (staff o portal) recibe el padrón
  de profesionales activos de su club. Es lo que espera el portal; se anota para la revisión de ISSUE-099.
- El advisor también lista 41 `authenticated_security_definer_function_executable`. Ese es el modelo actual (las RPC son
  para authenticated con guard propio) y no es parte de esta tarea.

---

## 2. Propuesta (no aplicada)

### 2.1 Migración única `revoke_anon_funciones_publicas.sql` (+ rollback)

```sql
-- A) 25 → authenticated (las del cuadro con propuesta "authenticated")
REVOKE EXECUTE ON FUNCTION public.rpc_inscribir(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
-- … una línea por firma (las firmas exactas salen de pg_get_function_identity_arguments, consulta 3.1)
GRANT  EXECUTE ON FUNCTION … TO authenticated, service_role;   -- explícito, para no depender de PUBLIC

-- B) 6 → sólo service_role (+ dueño): fn_solicitudes_guard_staff y los 5 triggers
REVOKE EXECUTE ON FUNCTION public.fn_solicitudes_guard_staff(uuid) FROM PUBLIC, anon, authenticated;
-- …

-- C) para que no se repita: default privileges de postgres en public
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;
```

El grupo A son 25 (filas 1–5, 7–23 y 29–31 del cuadro). Incluye las puras `fn_edad_reglamentaria` y `calcular_premio`: no hay
razón para que anon las llame. El grupo B son 6 (fila 6 y filas 24–28). 25 + 6 = 31.

Sobre (C): las funciones nuevas nacerían sin anon, y cada migración que quiera algo público lo tiene que pedir con un GRANT
explícito. **No toca** el default de `supabase_admin`, que lo administra la plataforma.

### 2.2 Por qué los triggers pueden quedar sin EXECUTE para nadie

Postgres verifica EXECUTE sobre la función de trigger **al crear el trigger**, no cada vez que se dispara. Se probó en el
sandbox con un rol sin EXECUTE: el INSERT disparó el trigger y lo aplicó. La llamada directa sí dio error.

```
$ docker exec sgh-local-pg psql -U postgres -tA -v ON_ERROR_STOP=0 -c "create schema zzt" -c "create table zzt.t(a int, b timestamptz)" \
   -c "create function zzt.f() returns trigger language plpgsql as \$\$begin new.b:=now(); return new; end\$\$" \
   -c "create trigger tr before insert on zzt.t for each row execute function zzt.f()" -c "revoke execute on function zzt.f() from public" \
   -c "create role zzr" -c "grant usage on schema zzt to zzr" -c "grant insert, select on zzt.t to zzr" -c "set role zzr" \
   -c "insert into zzt.t(a) values(1)" -c "select a, b is not null from zzt.t" -c "select zzt.f()" -c "reset role" \
   -c "drop schema zzt cascade" -c "drop role zzr"
CREATE SCHEMA
CREATE TABLE
CREATE FUNCTION
CREATE TRIGGER
REVOKE
CREATE ROLE
GRANT
GRANT
SET
INSERT 0 1
1|t
RESET
ERROR:  permission denied for function f
NOTICE:  drop cascades to 2 other objects
DETAIL:  drop cascades to table zzt.t
drop cascades to function zzt.f()
DROP SCHEMA
DROP ROLE
```

(El `RESET` aparece antes que el ERROR por cómo psql intercala stdout y stderr. El `select zzt.f()` corrió como `zzr` y
fue el que falló.) Igual, en la fase 2 conviene repetirlo con los triggers reales en el sandbox (`fn_autor_fila` sobre
sanciones, `set_updated_at`).

### 2.3 Cómo se verificaría (fase 2)

1. **Sandbox primero**: aplicar la migración sobre la copia de la 9999 y correr los probes que ya cubren estos caminos:
   - portal: `probe_rls_portal`, `probe_gate4_inscribir`, `probe_portal_alta_spc_studbook`;
   - autoregistro y solicitudes: `probe_solicitar_falta_paso`, más `probe_autoregistro_e2e` a demanda, que manda mails;
   - staff: `probe_guard_staff_rpcs`, `probe_politicas_escritura_staff`, `probe_resoluciones_sanciones_autor`, que cubre
     el trigger `fn_autor_fila`.
2. **Probe nuevo `probe_anon_sin_execute`**: para cada una de las 31 funciones, `has_function_privilege('anon', …)` tiene
   que dar false, y por la API como anon tiene que dar 401/42501. Para las del grupo A, `authenticated` tiene que conservar
   EXECUTE. Agregar `v_inscriptos_carrera` como anon con 0 filas.
3. Después del apply en prod: `get_advisors security` tiene que dar 0 `anon_security_definer_function_executable` y 0
   `security_definer_view`.

---

## 3. Consultas y salidas crudas

### 3.1 Inventario de funciones de `public` (las 55, con EXECUTE de anon/authenticated)

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef definer, p.provolatile vol, l.lanname lang,
 has_function_privilege('anon', p.oid, 'EXECUTE') anon_x, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x,
 (select string_agg(distinct t.tgrelid::regclass::text, ',') from pg_trigger t where t.tgfoid=p.oid) trigger_de,
 pg_get_function_result(p.oid) ret,
 md5(pg_get_functiondef(p.oid)) md5
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
where n.nspname='public' and p.prokind='f'
order by anon_x desc, definer desc, proname;
```

```
proname|args|definer|vol|lang|anon_x|auth_x|trigger_de|ret|md5
fn_autor_fila||t|v|plpgsql|t|t|resoluciones,sanciones|trigger|b9f80c456cd3578ab5fbd11c51df7a24
fn_club_de_caballeriza|p_caballeriza_id uuid|t|s|sql|t|t||uuid|a69d56624ecdd036e7e2291c735607aa
fn_club_de_carrera|p_carrera_id uuid|t|s|sql|t|t||uuid|b3ccb9116adea04733a35706c56fbfb8
fn_club_de_inscripcion|p_inscripcion_id uuid|t|s|sql|t|t||uuid|5d6597a0b3e24c3dcd180f1d85f7e589
fn_club_de_liquidacion|p_liquidacion_id uuid|t|s|sql|t|t||uuid|264202fd702cf0aa1e6369d30ee49e7d
fn_club_de_resolucion|p_resolucion_id uuid|t|s|sql|t|t||uuid|21ff366cf1cffe0e2e90b2a46121f0d6
fn_club_de_resultado|p_resultado_id uuid|t|s|sql|t|t||uuid|8c5de2f22e29483677a236da6bad10f5
fn_club_de_reunion|p_reunion_id uuid|t|s|sql|t|t||uuid|d685bbb8e9b73c2055c4de2d7d02031a
fn_get_user_club_id||t|s|sql|t|t||uuid|008c2ef948e422dfaae9e71646448fef
fn_is_portal_user||t|s|sql|t|t||boolean|e1ec41d4ffe351e9a422f7f7452ef64f
fn_is_staff||t|s|sql|t|t||boolean|3accbc759c7e8181632acbe72a0b993c
fn_is_super_admin||t|s|sql|t|t||boolean|8883124340bc670ef2a894ea47d55cce
fn_mis_entidades||t|s|sql|t|t||TABLE(entidad_tipo text, entidad_id uuid)|562e9bb717f0f65fef1c792743e30c87
fn_mis_spc_ids||t|s|sql|t|t||TABLE(spc_id uuid)|91fbadbe11a8c327438e650028bf3cd9
fn_mis_spc_visibles||t|s|sql|t|t||TABLE(spc_id uuid)|05be1b0e005f9d1d370ed27bff473568
fn_solicitudes_guard_staff|p_solicitud_id uuid|t|s|plpgsql|t|t||uuid|3d835871adde769ac95389b79faee882
fn_usuarios_guard_privilegios||t|v|plpgsql|t|t|usuarios|trigger|be16b76f45e8a9c56e037961722f01f1
fn_usuarios_set_auth_user_id||t|v|plpgsql|t|t|usuarios|trigger|8917e9ece0108f3ce1d91347ca829398
rpc_aprobar_solicitud|p_solicitud_id uuid, p_entidad_tipo text, p_entidad_id uuid, p_copiar_documento boolean|t|v|plpgsql|t|t||uuid|02ddc8c22659405626c96e326ecb0dc1
rpc_descartar_solicitud|p_solicitud_id uuid|t|v|plpgsql|t|t||void|471734db57169da8c743863e6f75a0b9
rpc_inscribir|p_spc_id uuid, p_carrera_id uuid, p_caballeriza_id uuid, p_entrenador_id uuid, p_jockey_titular_id uuid, p_jockey_suplente_id uuid|t|v|plpgsql|t|t||uuid|0605392e3ad9ed0baee9a32340f47deb
rpc_padron_profesionales||t|s|sql|t|t||TABLE(id uuid, nombre text, apellido text, matricula_nro text, tipo text)|3dacdbcb58e7daaacdb1a957e45cc44e
rpc_padron_spcs||t|s|plpgsql|t|t||TABLE(id uuid, nombre text, sexo text, fecha_nacimiento date, color text, studbook_id text, padrillo_nombre text, madre_nombre text, estado text, habilitado boolean)|c9c1473ab69c2d832bc477bc5ef2c987
rpc_rechazar_solicitud|p_solicitud_id uuid, p_motivo text|t|v|plpgsql|t|t||void|7d72e0ca5347a785722902b0d7b73215
rpc_solicitar_acceso|p_nombre text, p_apellido text, p_documento_nro text, p_telefono text, p_rol_pedido text, p_club_id uuid, p_documento_tipo text, p_email text, p_origen_hipodromo text, p_origen_patente_nro text, p_origen_caballeriza text|t|v|plpgsql|t|t||uuid|85e8044090b697c9d5c1bf4543489fc7
validar_inscripcion|p_spc_id uuid, p_carrera_id uuid|t|v|plpgsql|t|t||TABLE(puede_inscribirse boolean, motivo text)|62e6e9da5abf6d3d21d00ec99d34c007
calcular_premio|p_bolsa_total numeric, p_distribucion jsonb, p_puesto integer|f|i|plpgsql|t|t||numeric|8e1b941432b94673d957b5ddf4d5830c
fn_edad_reglamentaria|p_fecha_ref date, p_fecha_nac date|f|i|sql|t|t||integer|a1e260933b72afbd272afa60708bffcc
fn_proteger_rol_club_id_usuario||f|v|plpgsql|t|t|usuarios|trigger|98ea5df016bc03c304b9268869ca66d2
set_updated_at||f|v|plpgsql|t|t|clubs,inscripciones,profesionales,propietarios,resultados,reuniones,spcs|trigger|f5a34c214a5bcc378219ccf746b9004f
siguiente_numero_publico|p_club_id uuid, p_fecha date|f|s|sql|t|t||integer|de1c135e6a976d26b9e8d66b32161b63
anular_recibo|p_recibo_id uuid, p_motivo text|t|v|plpgsql|f|t||recibos|844e9e1ff62f4dbba30df71b8a88e309
aplicar_resultado|p_resultado_id uuid, p_expected_updated_at timestamp with time zone, p_carrera_id uuid, p_estado text, p_estado_pista text, p_tiempo_ganador text, p_incidentes text, p_favorito_mandil integer, p_redistribucion_legs jsonb, p_posiciones jsonb, p_apuestas jsonb|t|v|plpgsql|f|t||jsonb|6594e5070ce82d1c90e9fed60ddd0566
desoficializar_carrera|p_carrera_id uuid|t|v|plpgsql|f|t||resultados|fc77286021e6ec54102f7463fd66b9bf
emitir_recibo|p_club_id uuid, p_beneficiario_tipo beneficiario_tipo, p_beneficiario_id uuid, p_linea_ids uuid[], p_forma_pago forma_pago_recibo, p_cobrador_nombre text, p_cobrador_documento text, p_comprobante_url text|t|v|plpgsql|f|t||recibos|14951f502c0816de2d52923b45435c12
fn_audit_policies_permisivas||t|s|sql|f|f||TABLE(schemaname text, tablename text, policyname text, cmd text, roles text, qual text, with_check text)|0f32a1b46530dfb8d2d3636df463571f
fn_auditoria_log||t|v|plpgsql|f|f|carreras,categorias_carrera,clubs,inscripciones,liquidacion_config,liquidaciones,recibos,resolucion_entidades,resoluciones,resultado_apuestas,resultado_posiciones,resultados,reuniones,sanciones,spcs,usuarios|trigger|2121e10d09babc9900fe9d22ef0b12b4
fn_caballeriza_resp_set_propietario||t|v|plpgsql|f|f|caballeriza_responsables|trigger|4b42ccbdfb336d6b12308dd7ed84df1d
fn_insc_monta_oficial_guard||t|v|plpgsql|f|t|inscripciones|trigger|935d8dfad71878efef3b7b75efad2b75
fn_inscripcion_set_propietario||t|v|plpgsql|f|f|inscripciones|trigger|c5e335ed4dd79a17ebe11617cee05ea7
fn_liq_cerrada_guard||t|v|plpgsql|f|f|liquidacion_detalle,liquidaciones|trigger|e17f0c81a60afa0356fcda83819f5d4a
fn_purgar_auditoria||t|v|plpgsql|f|f||TABLE(club_id uuid, retencion_meses integer, eventos_borrados bigint)|91a5681569a87b303c2f0af84be6a0e6
fn_resultado_cerrado_guard||t|v|plpgsql|f|f|resultado_apuestas,resultado_posiciones,resultados|trigger|24b68443d9e200e26739fb0be6806721
fn_reunion_cierre_guard||t|v|plpgsql|f|f|reuniones|trigger|e531d5094c6ca559d3e0898b38c8839c
fn_reunion_liq_cerrada|p_reunion_id uuid|t|s|sql|f|t||boolean|11730b64066014745a40500ab5f97fb0
fn_siguiente_recibo|p_club_id uuid|t|v|plpgsql|f|t||integer|95d2bdc2fef65622e3997fbff45285f4
fn_spcs_alta_revision||t|v|plpgsql|f|f|spcs|trigger|cd33a7683698ccf0704683e678bdc623
liberar_linea|p_linea_id uuid|t|v|plpgsql|f|t||liquidacion_detalle|127d7199a4c22aaf20b6dd057758fc32
reordenar_turnos|p_reunion_id uuid, p_orden jsonb, p_dry_run boolean|t|v|plpgsql|f|t||jsonb|354916ee74d5d3e8893a4ed718955d33
rpc_baja_inscripcion|p_inscripcion_id uuid|t|v|plpgsql|f|t||boolean|b8bf790485fcdfab726d7eee7bf05ca4
rpc_buscar_spc|p_q text|t|s|plpgsql|f|t||TABLE(id uuid, nombre text, sexo text, fecha_nacimiento date, color text, padrillo_nombre text, madre_nombre text, studbook_id text, estado text, habilitado boolean)|95b30588bd2886017837ac225ece27ba
rpc_caballeriza_provisorio|p_caballeriza_id uuid|t|v|plpgsql|f|t||jsonb|40de86921ac5625d8b05b71ea1bff492
rpc_cambiar_monta|p_inscripcion_id uuid, p_jockey_id uuid|t|v|plpgsql|f|t||jsonb|d49299c2a1b409e598db9353f90a5095
rpc_modificar_inscripcion|p_inscripcion_id uuid, p_caballeriza_id uuid, p_entrenador_id uuid, p_jockey_titular_id uuid, p_jockey_suplente_id uuid|t|v|plpgsql|f|t||jsonb|817327d8e340af8bc1e7d6e99d0b3994
rpc_spc_alta_studbook_portal|p_auth_user_id uuid, p_carrera_id uuid, p_sb_id text, p_nombre text, p_fecha_nacimiento date, p_sexo text, p_color text, p_padre text, p_madre text, p_abuelo_materno text, p_pais text, p_url_perfil text, p_leyenda text, p_raza integer, p_alertas text[]|t|v|plpgsql|f|f||TABLE(spc_id uuid, ya_existia boolean, revision_motivos text[])|704f4762eb9ce373aecd4be9abdd0a78
rpc_spcs_duplicados|p_studbook_id text, p_nombre text, p_fecha_nacimiento date, p_padrillo text, p_madre text|t|s|plpgsql|f|t||TABLE(motivo text, id uuid, nombre character varying, fecha_nacimiento date, sexo sexo_spc, color character varying, padrillo_nombre character varying, madre_nombre character varying, studbook_id text, estado estado_spc)|1d4a2ab956845fb567610f9b3487be9d
```

### 3.2 ACL de las 31 y default privileges

```sql
select p.proname, p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and has_function_privilege('anon',p.oid,'EXECUTE') order by 1;
```

```
calcular_premio|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_autor_fila|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_club_de_caballeriza|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_club_de_carrera|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_club_de_inscripcion|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_club_de_liquidacion|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_club_de_resolucion|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_club_de_resultado|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_club_de_reunion|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_edad_reglamentaria|{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_get_user_club_id|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_is_portal_user|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_is_staff|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_is_super_admin|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_mis_entidades|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_mis_spc_ids|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_mis_spc_visibles|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_proteger_rol_club_id_usuario|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_solicitudes_guard_staff|{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_usuarios_guard_privilegios|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
fn_usuarios_set_auth_user_id|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
rpc_aprobar_solicitud|{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
rpc_descartar_solicitud|{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
rpc_inscribir|{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
rpc_padron_profesionales|{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
rpc_padron_spcs|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
rpc_rechazar_solicitud|{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
rpc_solicitar_acceso|{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
set_updated_at|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
siguiente_numero_publico|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
validar_inscripcion|{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
```

```sql
select d.defaclrole::regrole, d.defaclnamespace::regnamespace, d.defaclobjtype, d.defaclacl::text from pg_default_acl d where d.defaclobjtype='f';
```

```
postgres|public|f|{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
supabase_admin|public|f|{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}
postgres|storage|f|{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
supabase_auth_admin|auth|f|{postgres=X/supabase_auth_admin,dashboard_user=X/supabase_auth_admin}
supabase_admin|realtime|f|{postgres=X/supabase_admin,dashboard_user=X/supabase_admin}
supabase_admin|graphql_public|f|{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}
supabase_admin|extensions|f|{postgres=X*/supabase_admin}
supabase_admin|graphql|f|{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}
```

### 3.3 Rasgos del cuerpo de cada una de las 31 (escribe / auth.uid / guard / primeros 900 caracteres)

```sql
select p.proname,
 p.prosrc ~* '\m(insert\s+into|update\s+\w|delete\s+from)' escribe,
 p.prosrc ~* 'auth\.uid\(\)' usa_uid, p.prosrc ~* 'auth\.role\(\)' usa_role,
 p.prosrc ~* 'fn_is_staff|fn_is_super_admin' guard_staff, p.prosrc ~* 'fn_is_portal_user' guard_portal,
 p.prosrc ~* '42501|raise\s+exception' raises,
 length(p.prosrc) len,
 regexp_replace(left(p.prosrc, 900), '\s+', ' ', 'g') inicio
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and has_function_privilege('anon', p.oid, 'EXECUTE')
order by p.proname;
```

```
calcular_premio|escribe=f|uid=f|role=f|staff=f|portal=f|raises=f|190| DECLARE v_pct DECIMAL; BEGIN v_pct := (p_distribucion ->> p_puesto::TEXT)::DECIMAL; IF v_pct IS NULL THEN RETURN 0; END IF; RETURN ROUND((p_bolsa_total * v_pct / 100), 2); END;
fn_autor_fila|f|t|f|f|f|f|375| DECLARE v_usuario uuid := (SELECT u.id FROM usuarios u WHERE u.auth_user_id = auth.uid()); BEGIN IF TG_OP = 'INSERT' THEN NEW.creado_por := v_usuario; NEW.modificado_por := NULL; NEW.modificado_at := NULL; ELSE NEW.creado_por := OLD.creado_por; NEW.modificado_por := v_usuario; NEW.modificado_at := now(); END IF; RETURN NEW; END
fn_club_de_caballeriza|f|f|f|f|f|f|73| SELECT club_id FROM caballerizas WHERE id = p_caballeriza_id LIMIT 1;
fn_club_de_carrera|f|f|f|f|f|f|121| SELECT r.club_id FROM reuniones r JOIN carreras c ON c.reunion_id = r.id WHERE c.id = p_carrera_id LIMIT 1;
fn_club_de_inscripcion|f|f|f|f|f|f|169| SELECT r.club_id FROM reuniones r JOIN carreras c ON c.reunion_id = r.id JOIN inscripciones i ON i.carrera_id = c.id WHERE i.id = p_inscripcion_id LIMIT 1;
fn_club_de_liquidacion|f|f|f|f|f|f|74| SELECT club_id FROM liquidaciones WHERE id = p_liquidacion_id LIMIT 1;
fn_club_de_resolucion|f|f|f|f|f|f|72| SELECT club_id FROM resoluciones WHERE id = p_resolucion_id LIMIT 1;
fn_club_de_resultado|f|f|f|f|f|f|92| SELECT fn_club_de_carrera(carrera_id) FROM resultados WHERE id = p_resultado_id LIMIT 1;
fn_club_de_reunion|f|f|f|f|f|f|66| SELECT club_id FROM reuniones WHERE id = p_reunion_id LIMIT 1;
fn_edad_reglamentaria|f|f|f|f|f|f|343| SELECT CASE WHEN p_fecha_ref IS NULL OR p_fecha_nac IS NULL THEN NULL ELSE GREATEST( EXTRACT(YEAR FROM p_fecha_ref)::int - EXTRACT(YEAR FROM p_fecha_nac)::int - CASE WHEN EXTRACT(MONTH FROM p_fecha_ref)::int < 7 THEN 1 ELSE 0 END, 0) END;
fn_get_user_club_id|f|t|f|f|f|f|76| SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid() AND activo;
fn_is_portal_user|f|t|f|f|f|f|152| SELECT EXISTS ( SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND activo AND rol IN ('propietario', 'profesional') );
fn_is_staff|f|t|f|f|f|f|172| SELECT EXISTS ( SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND activo AND rol IN ('super_admin', 'secretario_carreras', 'operador') );
fn_is_super_admin|f|t|f|f|f|f|117| SELECT EXISTS ( SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND rol = 'super_admin' );
fn_mis_entidades|f|t|f|f|f|f|185| SELECT u.entidad_tipo::text, u.entidad_id FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo AND u.entidad_tipo IS NOT NULL AND u.entidad_id IS NOT NULL;
fn_mis_spc_ids|f|f|f|f|f|f|341| SELECT s.id FROM spcs s WHERE s.entrenador_id IN ( SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'profesional') UNION SELECT sp.spc_id FROM spc_propietarios sp WHERE sp.activo AND sp.propietario_id IN ( SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'propietario');
fn_mis_spc_visibles|f|t|f|f|f|f|191| SELECT m.spc_id FROM fn_mis_spc_ids() m UNION SELECT i.spc_id FROM inscripciones i JOIN usuarios u ON u.id = i.inscripto_por WHERE u.auth_user_id = auth.uid() AND u.activo;
fn_proteger_rol_club_id_usuario|f|f|f|t|f|t|347| BEGIN IF NOT fn_is_super_admin() THEN IF NEW.rol IS DISTINCT FROM OLD.rol THEN RAISE EXCEPTION 'Solo super_admin puede cambiar el rol de un usuario'; END IF; IF NEW.club_id IS DISTINCT FROM OLD.club_id THEN RAISE EXCEPTION 'Solo super_admin puede cambiar el club de un usuario'; END IF; END IF; RETURN NEW; END;
fn_solicitudes_guard_staff|f|t|f|f|f|t|940| DECLARE v_uid uuid := auth.uid(); v_usuario usuarios%ROWTYPE; v_club_sol uuid; BEGIN IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado' USING ERRCODE='28000'; END IF; SELECT * INTO v_usuario FROM usuarios WHERE auth_user_id = v_uid AND activo; IF NOT FOUND THEN RAISE EXCEPTION 'No autorizado: la cuenta no tiene usuario activo' USING ERRCODE='42501'; END IF; IF v_usuario.rol NOT IN ('super_admin','secretario_carreras','operador') THEN RAISE EXCEPTION 'No autorizado: se requiere rol de secretaría' USING ERRCODE='42501'; END IF; SELECT club_id INTO v_club_sol FROM solicitudes_acceso WHERE id = p_solicitud_id; IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud inexistente' USING ERRCODE='P0002'; END IF; IF v_usuario.rol <> 'super_admin' AND v_usuario.club_id IS DISTINCT FROM v_club_sol THEN RAISE EXCEPTION 'No autorizado: la solicitud es de otro club' USING ERRCODE='4250
fn_usuarios_guard_privilegios|f|t|f|t|f|t|521| BEGIN IF auth.uid() IS NULL THEN RETURN NEW; END IF; IF fn_is_super_admin() THEN RETURN NEW; END IF; IF NEW.rol IS DISTINCT FROM OLD.rol OR NEW.club_id IS DISTINCT FROM OLD.club_id OR NEW.entidad_tipo IS DISTINCT FROM OLD.entidad_tipo OR NEW.entidad_id IS DISTINCT FROM OLD.entidad_id OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN RAISE EXCEPTION 'No autorizado: solo un super_admin puede cambiar rol, club, entidad o vinculo de Auth'; END IF; RETURN NEW; END;
fn_usuarios_set_auth_user_id|f|f|f|f|f|f|228| BEGIN IF NEW.auth_user_id IS NULL AND NEW.email IS NOT NULL THEN SELECT a.id INTO NEW.auth_user_id FROM auth.users a WHERE lower(btrim(a.email)) = lower(btrim(NEW.email)) LIMIT 1; END IF; RETURN NEW; END;
rpc_aprobar_solicitud|t|f|f|f|f|t|2554| DECLARE v_staff_id uuid := fn_solicitudes_guard_staff(p_solicitud_id); v_sol solicitudes_acceso%ROWTYPE; … (primeros 900: SELECT … FOR UPDATE; validaciones 22023 de estado y entidad_tipo; SELECT club_id, documento_nro de la ficha)
rpc_descartar_solicitud|t|f|f|f|f|t|447| DECLARE v_staff_id uuid := fn_solicitudes_guard_staff(p_solicitud_id); v_estado text; BEGIN SELECT estado INTO v_estado FROM solicitudes_acceso WHERE id=p_solicitud_id FOR UPDATE; IF v_estado <> 'pendiente' THEN RAISE EXCEPTION 'La solicitud ya fue resuelta (estado: %)', v_estado USING ERRCODE='22023'; END IF; UPDATE solicitudes_acceso SET estado='descartada', resuelta_por=v_staff_id, resuelta_at=now() WHERE id=p_solicitud_id; END;
rpc_inscribir|t|t|f|f|f|t|4319| DECLARE … BEGIN IF NOT EXISTS ( SELECT 1 FROM fn_mis_entidades() e WHERE e.entidad_tipo IN ('profesional', 'propietario') ) THEN RAISE EXCEPTION 'No autorizado: esta operación es para usuarios del portal.'; END IF; SELECT u.id INTO v_usuario_id FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo; IF v_usuario_id IS NULL THEN RAISE EXCEPTION 'No autorizado: la cuenta no tiene usuario activo.'; END IF; SELECT * INTO v_spc FROM spcs WHERE id = p_spc_id; …
rpc_padron_profesionales|f|f|f|f|f|f|206| SELECT p.id, p.nombre::text, p.apellido::text, p.matricula_nro::text, p.tipo::text FROM profesionales p WHERE p.activo AND p.club_id = fn_get_user_club_id() ORDER BY p.apellido, p.nombre;
rpc_padron_spcs|f|f|f|t|t|t|506| BEGIN IF NOT ((SELECT fn_is_staff()) OR (SELECT fn_is_portal_user())) THEN RAISE EXCEPTION 'No autorizado.'; END IF; RETURN QUERY SELECT s.id, s.nombre::text, … FROM spcs s ORDER BY s.nombre; END;
rpc_rechazar_solicitud|t|f|f|f|f|t|619| DECLARE v_staff_id uuid := fn_solicitudes_guard_staff(p_solicitud_id); … UPDATE solicitudes_acceso SET estado='rechazada', motivo_rechazo=btrim(p_motivo), resuelta_por=v_staff_id, resuelta_at=now() WHERE id=p_solicitud_id; END;
rpc_solicitar_acceso|t|t|f|f|f|t|3294| DECLARE v_uid uuid := auth.uid(); … BEGIN IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado' USING ERRCODE='28000'; END IF; SELECT lower(btrim(a.email)) INTO v_email FROM auth.users a WHERE a.id = v_uid; … IF EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = v_uid) THEN RAISE EXCEPTION 'La cuenta ya tiene acceso …
set_updated_at|f|f|f|f|f|f|52| BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
siguiente_numero_publico|f|f|f|f|f|f|261| SELECT COALESCE(MAX(numero_publico), 0) + 1 FROM reuniones WHERE club_id = p_club_id AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM p_fecha) AND estado NOT IN ('cancelada','suspendida') AND numero_publico IS NOT NULL AND fecha < p_fecha;
validar_inscripcion|f|f|f|t|f|f|3528| DECLARE v_spc RECORD; v_carrera RECORD; v_edad_carrera INTEGER; v_sancion RECORD; v_generico CONSTANT TEXT := 'Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.'; v_detalle BOOLEAN := fn_is_staff(); BEGIN SELECT * INTO v_spc FROM spcs WHERE id = p_spc_id; IF v_spc IS NULL THEN RETURN QUERY SELECT FALSE, CASE WHEN v_detalle THEN 'No se encontró el ejemplar.' ELSE v_generico END; RETURN; END IF; …
```

En tres filas (`rpc_aprobar_solicitud`, `rpc_inscribir`, `rpc_solicitar_acceso`) el texto de 900 caracteres se acortó en
este documento con `…`. Los valores de las columnas booleanas y `len` son exactos. Los cuerpos completos se leen con
`select pg_get_functiondef('public.<nombre>'::regproc);`.

### 3.4 Políticas que llaman a cada helper, y cuáles se aplican a anon

```sql
select f.fn, count(*) n_politicas,
 string_agg(distinct pol.tablename,',' order by pol.tablename) tablas,
 count(*) filter (where 'public'=any(pol.roles) or 'anon'=any(pol.roles)) aplican_a_anon,
 string_agg(distinct pol.tablename,',' order by pol.tablename) filter (where 'public'=any(pol.roles) or 'anon'=any(pol.roles)) tablas_anon
from (select unnest(array['fn_club_de_caballeriza','fn_club_de_carrera','fn_club_de_inscripcion','fn_club_de_liquidacion','fn_club_de_resolucion','fn_club_de_resultado','fn_club_de_reunion','fn_get_user_club_id','fn_is_portal_user','fn_is_staff','fn_is_super_admin','fn_mis_entidades','fn_mis_spc_ids','fn_mis_spc_visibles','fn_edad_reglamentaria','calcular_premio','siguiente_numero_publico']) fn) f
left join pg_policies pol on pol.schemaname in ('public','storage') and (coalesce(pol.qual,'') ~ ('\m'||f.fn||'\M') or coalesce(pol.with_check,'') ~ ('\m'||f.fn||'\M'))
group by f.fn order by f.fn;
```

```
calcular_premio|1|(null)|0|(null)            ← "1" es la fila vacía del LEFT JOIN: 0 políticas
fn_club_de_caballeriza|4|caballeriza_responsables|0|
fn_club_de_carrera|12|carrera_apuestas,inscripciones,resultados|0|
fn_club_de_inscripcion|4|resultado_posiciones|0|
fn_club_de_liquidacion|4|liquidacion_detalle|0|
fn_club_de_resolucion|4|resolucion_entidades|0|
fn_club_de_resultado|8|resultado_apuestas,resultado_log|0|
fn_club_de_reunion|8|carreras,novedades_reunion|0|
fn_edad_reglamentaria|1|(null)|0|(null)       ← 0 políticas
fn_get_user_club_id|92|apoderados,auditoria,caballeriza_responsables,caballerizas,carrera_apuestas,carreras,categorias_carrera,club_configuracion,club_secuencias,clubs,comision_config,hipodromos,inscripciones,liquidacion_config,liquidacion_detalle,liquidaciones,novedades_reunion,recibos,resolucion_entidades,resoluciones,resultado_apuestas,resultado_log,resultado_posiciones,resultados,reuniones,sanciones,solicitudes_acceso,usuarios|0|
fn_is_portal_user|24|apoderados,caballerizas,carreras,inscripciones,liquidacion_detalle,liquidaciones,recibos,reuniones|0|
fn_is_staff|62|caballeriza_responsables,carrera_apuestas,categorias_carrera,club_configuracion,club_secuencias,clubs,comision_config,hipodromos,liquidacion_config,liquidacion_detalle,liquidaciones,novedades_reunion,performances,profesionales,propietarios,recibos,resolucion_entidades,resoluciones,resultado_apuestas,resultado_log,resultado_posiciones,resultados,sanciones,solicitudes_acceso,spc_propietarios,spcs,usuarios|0|
fn_is_super_admin|107|apoderados,auditoria,caballeriza_responsables,caballerizas,carrera_apuestas,carreras,categorias_carrera,club_configuracion,club_secuencias,clubs,comision_config,hipodromos,inscripciones,liquidacion_config,liquidacion_detalle,liquidaciones,novedades_reunion,performances,profesionales,propietarios,recibos,resolucion_entidades,resoluciones,resultado_apuestas,resultado_log,resultado_posiciones,resultados,reuniones,sanciones,solicitudes_acceso,spc_propietarios,spcs,usuarios|0|
fn_mis_entidades|6|liquidacion_detalle,liquidaciones,profesionales,propietarios,recibos,sanciones|0|
fn_mis_spc_ids|3|performances,sanciones,spc_propietarios|0|
fn_mis_spc_visibles|2|inscripciones,spcs|0|
siguiente_numero_publico|1|(null)|0|(null)    ← 0 políticas
```

### 3.5 Quién llama cada RPC desde el código (main)

```bash
git grep -n "\.rpc(" main -- '*.html' '*.js' 'supabase/functions/*' | sed 's/^main://' \
  | sed -E "s/^([^:]+):([0-9]+):.*rpc\(\s*'([a-z_]+)'.*/\1 \3/" | sort | uniq
```

```
auditoria.html fn_purgar_auditoria
caballerizas.html rpc_caballeriza_provisorio
carta-llamados.html reordenar_turnos
liquidaciones.html anular_recibo
liquidaciones.html emitir_recibo
liquidaciones.html liberar_linea
portal.html fn_mis_entidades
portal.html fn_mis_spc_ids
portal.html rpc_baja_inscripcion
portal.html rpc_inscribir
portal.html rpc_modificar_inscripcion
portal.html rpc_padron_profesionales
portal.html rpc_padron_spcs
resultados.html aplicar_resultado
resultados.html desoficializar_carrera
resultados.html rpc_cambiar_monta
reuniones.html siguiente_numero_publico
solicitar-acceso.html rpc_solicitar_acceso
solicitudes.html rpc_aprobar_solicitud
solicitudes.html rpc_descartar_solicitud
solicitudes.html rpc_rechazar_solicitud
spcs.html rpc_spcs_duplicados
supabase/functions/studbook-buscar/index.ts fn_is_portal_user
supabase/functions/studbook-buscar/index.ts rpc_spc_alta_studbook_portal
```

(`studbook-buscar` también llama `fn_is_staff` en la misma línea, `index.ts:280`, con el JWT del caller:
`Promise.all([asCaller.rpc('fn_is_staff'), asCaller.rpc('fn_is_portal_user')])`. El `sed` se queda con la última.)

Por función, en HTML/JS/EF y probes (`git grep -n <fn> main -- '*.html' '*.js' 'supabase/functions/*'` y `git grep -l <fn> main -- 'tests/*.mjs'`):

```
calcular_premio            código: —                                   probes: —
fn_autor_fila              código: —                                   probes: probe_resoluciones_sanciones_autor
fn_club_de_*               código: —                                   probes: local/clonar_9999, probe_resultados_cerrada
fn_edad_reglamentaria      código: portal.html:344 (comentario)        probes: probe_buscador_spc, probe_edad_reglamentaria
fn_get_user_club_id        código: comentarios (activacion-pendiente.js, index.html, login.html)   probes: 7
fn_is_portal_user          código: studbook-buscar/index.ts:280        probes: 4
fn_is_staff                código: studbook-buscar/index.ts:280 + comentarios   probes: 11
fn_is_super_admin          código: comentarios                         probes: 7
fn_mis_entidades           código: portal.html:457                     probes: probe_rls_portal
fn_mis_spc_ids             código: portal.html:514                     probes: 3
fn_mis_spc_visibles        código: —                                   probes: probe_gate4_inscribir
fn_proteger_rol…, fn_solicitudes_guard_staff, fn_usuarios_guard…, fn_usuarios_set_auth…   código: —   probes: —
rpc_aprobar/descartar/rechazar_solicitud   código: solicitudes.html    probes: autoregistro_e2e, rls_portal (+ club_id_alta)
rpc_inscribir              código: portal.html:1102                    probes: 8
rpc_padron_profesionales   código: portal.html:842                     probes: probe_gate4_inscribir
rpc_padron_spcs            código: portal.html:739                     probes: probe_buscador_spc, probe_portal_alta_spc_ui
rpc_solicitar_acceso       código: solicitar-acceso.html:525           probes: autoregistro_e2e, rls_portal, solicitar_falta_paso
set_updated_at             código: —                                   probes: local/clonar_9999, probe_guard_staff_rpcs
siguiente_numero_publico   código: reuniones.html:409                  probes: —
validar_inscripcion        código: portal.html:1015 (comentario)       probes: 5
```

Una precisión sobre los probes: corren con la secret key (service_role) o con sesiones reales (authenticated). Ninguno
necesita anon para estas funciones. Los que prueban guards (`probe_guard_staff_rpcs`, `probe_montas_post_oficial`) tienen
un perfil "anon" que **espera** el rechazo.

`solicitar-acceso.html` sólo llama `rpc_solicitar_acceso` con sesión:

```
549:  const yaLogueado = !!(await sb.auth.getSession()).data.session;
615:  if (!authData.session) {        ← sin sesión: pantalla "Ya casi", no llama la RPC
622:  const e = await enviarSolicitud(d);
```

### 3.6 `pg_stat_statements`: llamadas por rol (acumulado desde 2026-07-14 16:32 UTC)

```sql
select r.rolname, sum(s.calls) calls, regexp_replace(left(s.query,160),'\s+',' ','g') q
from pg_stat_statements s join pg_roles r on r.oid=s.userid
where r.rolname in ('anon','authenticated') and s.query ~* '(rpc_|fn_|validar_inscripcion|calcular_premio|siguiente_numero_publico|v_inscriptos_carrera)'
  and s.query !~* 'pg_catalog|pg_proc'
group by 1,3 order by 1, 2 desc limit 80;
```

```
anon|2|WITH pgrst_source AS (SELECT pgrst_call.pgrst_scalar FROM (SELECT $1 AS json_data) pgrst_payload, LATERAL (SELECT "p_reunion_id" FROM json_to_record(pgrst_paylo
anon|1|… "public"."fn_is_super_admin"() …
anon|1|… "public"."fn_get_user_club_id"() …
authenticated|215|… LATERAL (SELECT "p_inscripcion_id", "p_caballeriza_id", "p_ent …          (rpc_modificar_inscripcion)
authenticated|120|… "public"."fn_is_staff"() …
authenticated|85|… LATERAL (SELECT "p_inscripcion_id" FROM json_to_record(pgrst_p …           (rpc_baja_inscripcion)
authenticated|73|… LATERAL (SELECT "p_nombre", "p_apellido", "p_documento_nro", " …          (rpc_solicitar_acceso)
authenticated|60|… LATERAL (SELECT "p_caballeriza_id" FROM json_to_record(pgrst_p …          (rpc_caballeriza_provisorio)
authenticated|57|… "public"."fn_is_portal_user"() …
authenticated|44|… LATERAL (SELECT "p_solicitud_id", "p_entidad_tipo", "p_entidad …          (rpc_aprobar_solicitud)
authenticated|42|… LATERAL (SELECT "p_spc_id", "p_carrera_id" FROM json_to_record …          (validar_inscripcion)
authenticated|38|… LATERAL (SELECT "p_spc_id", "p_carrera_id", "p_caballeriza_id" …          (rpc_inscribir)
authenticated|18|… LATERAL (SELECT "p_club_id" FROM json_to_record(pgrst_payload. …          (siguiente_numero_publico / fn_siguiente_recibo)
authenticated|18|… LATERAL (SELECT "p_solicitud_id" FROM json_to_record(pgrst_pay …          (rpc_descartar_solicitud)
authenticated|12|… LATERAL (SELECT "p_inscripcion_id", "p_jockey_id" FROM json_to …          (rpc_cambiar_monta)
authenticated|3|SELECT $1 AS caso, * FROM validar_inscripcion($2,$3) UNION ALL …
authenticated|2|SELECT fn_get_user_club_id() AS club, fn_is_staff() AS staff, fn_is_portal_user() AS portal, (SELECT count(*) FROM fn_mis_spc_ids()) AS mis_spcs,
authenticated|2|… LATERAL (SELECT "p_solicitud_id", "p_motivo" FROM json_to_reco …          (rpc_rechazar_solicitud)
authenticated|1|SELECT (SELECT count(*) FROM inscripciones) AS inscripciones_visibles, (SELECT count(*) FROM fn_mis_entidades()) AS entidades_vinculadas
authenticated|1|insert into _c select $1, fn_is_staff()::text
authenticated|1|SELECT fn_is_staff() AS staff
authenticated|1|insert into _c select $1, fn_is_portal_user()::text
authenticated|1|select fn_is_staff() es_staff, fn_is_portal_user() es_portal, fn_get_user_club_id() is not null tiene_club, (select count(*) from liquidacion_config) liq_confi
authenticated|1|SELECT (v).puede_inscribirse AS puede, (v).motivo FROM ( SELECT validar_inscripcion($1,$2) AS v ) t
authenticated|1|SELECT $1 AS caso, * FROM validar_inscripcion($2,$3) UNION ALL SELECT $4, * FROM validar_inscripcion($5,$6)
authenticated|1|SELECT * FROM fn_mis_entidades()
```

(La salida de PostgREST se recortó a 160 caracteres en la consulta misma. La función entre paréntesis es la que
corresponde a esa firma de parámetros, inferida y no impresa por la consulta.) Detalle de las dos de anon con `p_reunion_id`:

```sql
select (select stats_reset from pg_stat_statements_info) desde, r.rolname, s.calls, regexp_replace(s.query,'\s+',' ','g') q
from pg_stat_statements s join pg_roles r on r.oid=s.userid
where r.rolname='anon' and (s.query ~* 'p_reunion_id' or s.query ~* 'v_inscriptos');
```

```
2026-07-14 16:32:35.284911+00|anon|1|WITH pgrst_source AS ( SELECT "public"."v_inscriptos_carrera".* FROM "public"."v_inscriptos_carrera" LIMIT $1 OFFSET $2 ) SELECT $3::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), $4) AS body, … FROM ( SELECT * FROM pgrst_source ) _postgrest_t
2026-07-14 16:32:35.284911+00|anon|1|WITH pgrst_source AS (… LATERAL (SELECT "public"."fn_reunion_liq_cerrada"("p_reunion_id" := pgrst_body."p_reunion_id") pgrst_scalar) pgrst_call) …
2026-07-14 16:32:35.284911+00|anon|1|WITH pgrst_source AS (… LATERAL (SELECT "public"."fn_club_de_reunion"("p_reunion_id" := pgrst_body."p_reunion_id") pgrst_scalar) pgrst_call) …
```

(Los cuerpos de PostgREST se acortaron con `…` en la parte de armado del JSON de respuesta, que es igual en todas.
`pg_stat_statements` normaliza las constantes y no guarda ni la IP ni el header.) Ojo: las lecturas de la API que hice
para este informe (§3.8) son posteriores a esta consulta y van a aparecer como una segunda lectura anon de la vista.

### 3.7 Vistas de `public`: opciones, permisos, tablas y definición

```sql
select c.relname, c.reloptions, c.relowner::regrole owner,
 has_table_privilege('anon', c.oid, 'SELECT') anon_sel, has_table_privilege('authenticated', c.oid, 'SELECT') auth_sel,
 (select string_agg(distinct d.refobjid::regclass::text, ',') from pg_depend d join pg_rewrite r on r.oid=d.objid where r.ev_class=c.oid and d.refobjid<>c.oid and d.classid='pg_rewrite'::regclass and d.refclassid='pg_class'::regclass) tablas,
 (select string_agg(distinct dv.ev_class::regclass::text, ',') from pg_depend d2 join pg_rewrite dv on dv.oid=d2.objid where d2.refobjid=c.oid and dv.ev_class<>c.oid) dependientes,
 pg_get_viewdef(c.oid) def
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' order by 1;
```

```
v_inscriptos_carrera|reloptions=NULL|postgres|anon_sel=t|auth_sel=t|caballerizas,carreras,inscripciones,profesionales,propietarios,reuniones,spcs|dependientes=NULL
 SELECT i.id AS inscripcion_id, i.carrera_id, i.numero_partidor, i.estado AS estado_inscripcion, i.peso_declarado, i.peso_final, i.info_adicional,
    s.nombre AS spc_nombre, s.fecha_nacimiento AS spc_nacimiento, (fn_edad_reglamentaria(rn.fecha, s.fecha_nacimiento))::double precision AS spc_edad,
    s.sexo AS spc_sexo, s.color AS spc_color, p.nombre AS propietario_nombre, p.colores_desc AS colores_propietario,
    (((e.apellido)::text || ', '::text) || (e.nombre)::text) AS entrenador,
    (((jt.apellido)::text || ', '::text) || (jt.nombre)::text) AS jockey_titular,
    (((js.apellido)::text || ', '::text) || (js.nombre)::text) AS jockey_suplente,
    c.nombre AS caballeriza
   FROM ((((((((inscripciones i JOIN spcs s ON ((s.id = i.spc_id))) LEFT JOIN carreras cr ON ((cr.id = i.carrera_id)))
     LEFT JOIN reuniones rn ON ((rn.id = cr.reunion_id))) LEFT JOIN propietarios p ON ((p.id = i.propietario_id)))
     LEFT JOIN profesionales e ON ((e.id = i.entrenador_id))) LEFT JOIN profesionales jt ON ((jt.id = i.jockey_titular_id)))
     LEFT JOIN profesionales js ON ((js.id = i.jockey_suplente_id))) LEFT JOIN caballerizas c ON ((c.id = s.caballeriza_id)));
v_programa_reunion|{security_invoker=true}|postgres|t|t|carreras,categorias_carrera,hipodromos,inscripciones,reuniones|NULL
v_sanciones_vigentes|{security_invoker=true}|postgres|t|t|sanciones|NULL
v_spcs_activos|{security_invoker=true}|postgres|t|t|caballerizas,profesionales,propietarios,spc_propietarios,spcs|NULL
```

(Las definiciones de las otras tres vistas no importan para esta tarea. Se leen con `pg_get_viewdef`.)

Migraciones aplicadas que tocan la vista:

```sql
select version, name, (select string_agg(regexp_replace(left(s,200),'\s+',' ','g'),' || ') from unnest(statements) s where s ~* 'v_inscriptos_carrera') stmts
from supabase_migrations.schema_migrations where array_to_string(statements,' ') ~* 'v_inscriptos_carrera' order by version;
```

```
20260607195414|security_hardening_fase2_reversible|-- FASE 2: hardening reversible ALTER VIEW public.v_spcs_activos SET (security_invoker = true); ALTER VIEW public.v_programa_reunion SET (security_invoker = true); ALTER VIEW public.v_inscri
20260827173244|fn_edad_reglamentaria_1_julio|CREATE OR REPLACE FUNCTION public.fn_edad_reglamentaria( p_fecha_ref date, p_fecha_nac date ) RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_temp AS $$ SELECT
20260827173321|v_inscriptos_carrera_edad_reglamentaria|CREATE OR REPLACE VIEW public.v_inscriptos_carrera AS SELECT i.id AS inscripcion_id, i.carrera_id, i.numero_partidor, i.estado AS estado_inscripcion, i.peso_declarado, i.peso_fina
```

### 3.8 Qué ve anon por la API (GET con la publishable key, sin token de usuario)

```bash
K=$(git show main:supabase.js | grep -o "sb_publishable_[A-Za-z0-9_-]*" | head -1); U=https://unlhcuanfrtpatoipwve.supabase.co/rest/v1
for t in v_inscriptos_carrera inscripciones spcs carreras reuniones propietarios profesionales caballerizas v_programa_reunion v_spcs_activos v_sanciones_vigentes; do
  printf '%-22s ' $t; curl -s -o /dev/null -D - "$U/$t?select=*&limit=0" -H "apikey: $K" -H "Prefer: count=exact" | grep -i -E '^(content-range|HTTP)' | tr -d '\r' | tr '\n' ' '; echo; done
curl -s "$U/v_inscriptos_carrera?select=carrera_id&limit=1000" -H "apikey: $K" | node -e '…filas y carreras distintas…'
curl -s -o /dev/null -w '%{http_code}\n' "$U/v_inscriptos_carrera?select=propietario_nombre,entrenador,jockey_titular&limit=1" -H "apikey: $K"
```

```
v_inscriptos_carrera   HTTP/2 206  content-range: */425
inscripciones          HTTP/2 200  content-range: */0
spcs                   HTTP/2 200  content-range: */0
carreras               HTTP/2 200  content-range: */0
reuniones              HTTP/2 200  content-range: */0
propietarios           HTTP/2 200  content-range: */0
profesionales          HTTP/2 200  content-range: */0
caballerizas           HTTP/2 200  content-range: */0
v_programa_reunion     HTTP/2 200  content-range: */0
v_spcs_activos         HTTP/2 200  content-range: */0
v_sanciones_vigentes   HTTP/2 200  content-range: */0

filas 425 carreras distintas 48
200
```

Del contenido de la vista sólo se leyó `carrera_id` para contar. Los nombres no se bajaron ni se imprimieron: el último
GET sólo mira el código HTTP.

### 3.9 Advisor de seguridad (`get_advisors security`, conteo por lint)

```
26 ('anon_security_definer_function_executable', 'WARN')
1 ('auth_leaked_password_protection', 'WARN')
41 ('authenticated_security_definer_function_executable', 'WARN')
6 ('rls_enabled_no_policy', 'INFO')
1 ('security_definer_view', 'ERROR')        → v_inscriptos_carrera
```

Las 26 del lint de anon son exactamente las 26 filas con "def = sí" del cuadro §1.1. La lista por nombre:

```
fn_autor_fila fn_club_de_caballeriza fn_club_de_carrera fn_club_de_inscripcion fn_club_de_liquidacion fn_club_de_resolucion
fn_club_de_resultado fn_club_de_reunion fn_get_user_club_id fn_is_portal_user fn_is_staff fn_is_super_admin fn_mis_entidades
fn_mis_spc_ids fn_mis_spc_visibles fn_solicitudes_guard_staff fn_usuarios_guard_privilegios fn_usuarios_set_auth_user_id
rpc_aprobar_solicitud rpc_descartar_solicitud rpc_inscribir rpc_padron_profesionales rpc_padron_spcs rpc_rechazar_solicitud
rpc_solicitar_acceso validar_inscripcion
```

El advisor no cuenta las 5 invoker (`calcular_premio`, `fn_edad_reglamentaria`, `fn_proteger_rol_club_id_usuario`,
`set_updated_at`, `siguiente_numero_publico`). Este informe sí las incluye en la propuesta.

---

## 4. Números

- Funciones de `public`: 55. Ejecutables por anon: **31** (26 definer + 5 invoker).
- De las 31: 5 escriben (todas con guard que corta a anon); 5 son de trigger; 7 son `fn_club_de_*` sin guard; 14 son
  helpers o padrones que a anon le devuelven NULL, false, 0 filas o un texto genérico.
- Llamadas legítimas como anon: **0**.
- Propuesta: **25 → authenticated** (+ service_role) y **6 → sólo service_role** (`fn_solicitudes_guard_staff` y los 5
  triggers). 25 + 6 = 31.
- `v_inscriptos_carrera`: **425 filas legibles por anon desde el 2026-08-27**; 0 lectores en el código.

## 5. Preguntas abiertas

1. **¿Cerramos la vista ya, aparte del resto?** Es un `ALTER VIEW … SET (security_invoker = true)` más un REVOKE de SELECT a
   anon, sin lectores que se rompan. Va a una migración propia con rollback y probe. No hay que esperar al paquete de
   las 31.
2. ¿La exposición del 27/08 al 02/10 se le avisa a Fede o al club? No hay forma de saber quién leyó: `pg_stat_statements`
   registra una sola lectura anon antes de este relevamiento, sin IP.
3. ¿`ALTER DEFAULT PRIVILEGES` (§2.1 C) entra en el mismo paquete? Lo recomiendo: es la causa de que el problema se repita.
4. `calcular_premio` no tiene usos. ¿Revocar sólo, o DROP en otra tarea?
5. `fn_club_de_*` para authenticated (oráculo de existencia): ¿se deja como está?

---

## Verificación de push

Grep de datos personales (CLAUDE.md) sobre lo agregado respecto de `origin/reports`: **vacío** (rc=1).

```
$ git push -q origin reports && git ls-remote origin reports && git rev-parse HEAD
9e608132cb7c7323569b3cddf430696e68b171c9	refs/heads/reports
9e608132cb7c7323569b3cddf430696e68b171c9
```

Ese es el commit del informe. Esta sección va en un commit posterior: su SHA es el HEAD de `origin/reports` al leerla.
