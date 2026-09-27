# ISSUE-093 aplicado — escritura de 14 tablas sólo para staff (informe ANTES de mergear)

- Fecha: 2026-09-27
- Rama `fix/politicas-escritura-staff` @ `05f665fa347a24ffcb7719a8604d8ab8d0170a87` — **PR #21 abierto, sin merge**
  (https://github.com/mdqclio/SGH/pull/21). Base: `main` @ `4d95511`.
- **Migración APLICADA en prod**: `20260927202948 politicas_escritura_staff_14`.
- Guards antes de aplicar: `pwd` → `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` → **210** · ref →
  `unlhcuanfrtpatoipwve`. Después de todo: spcs **210**.
- Plan aplicado: el **base** del informe de relevamiento (staff en las 36, incluida `club_secuencias`), porque el OK
  fue "como está planificado". La opción B (`club_secuencias` sólo super_admin) quedó sin aplicar — sigue abierta.
- Anonimizado: los usuarios de prueba son sintéticos (`probe-093-…@example.invalid`); los reales van por rol.
- Relevamiento previo: `docs/diagnosticos/2026-09-27_issue093-politicas-escritura-portal.md` (reports `549859d`).

---

## Resumen

| Condición | Resultado |
|---|---|
| a) Migración única, 36 políticas, rollback generado desde `pg_policy`; 36 md5 después de aplicar | ✅ Una migración, 36 políticas. Rollback generado por script y verificado **36/36** contra prod (antes) y re-aplicado en el sandbox deja las 36 idénticas a prod-antes. Después de aplicar: **36/36 md5 en prod = esperado del sandbox**. |
| b) Probe: portal rechazado en las 14, staff de cada rol sigue pudiendo, mutante por tabla | ✅ 281 celdas con sesiones reales. Sandbox con las políticas de antes: **201/281** (80 rojos, **todos** de portal/propietario del portal). Después: **281/281**. **14/14 mutantes** muertos (cada uno sólo en portal). **Prod: 281/281**, limpieza por estado OK. |
| c) Antes de aplicar: oficializar en la 9999 sigue escribiendo `resultado_apuestas` y `resultado_log` | ✅ `resultado_apuestas`: con las políticas nuevas (en prod, transacción revertida) el secretario oficializa T1 y `aplicar_resultado` escribe las 4 filas. Repetido después de aplicar: igual. ⚠️ `resultado_log`: **0 antes y 0 después — no la escribe ninguna función ni pantalla, ni hoy ni antes** (no es algo que el cambio rompa: nunca se escribió). |
| d) Aplicar, verificar, informe antes de mergear | ✅ Este informe. PR #21 sin merge. |

Incidentes (detalle en §6):
- La **primera** corrida del probe en prod dio la matriz 281/281 pero **no pudo limpiar**: 5 usuarios de staff del probe
  quedaron trabados por la FK `auditoria_usuario_id_fkey`, y un club fixture no se pudo borrar. Limpié a mano (auditoría
  de esos usuarios → usuarios → club), corregí el probe y la segunda corrida limpió sola.
- Hallazgo nuevo **ISSUE-095**: en prod **no se puede borrar ningún club** (el trigger de auditoría viola su propia FK).
  El club fixture lo borré con `session_replication_role = replica` acotado a esa única fila, con 0 referencias.
- Pedido aparte registrado sin implementar: **ISSUE-094** (`club_secuencias` sin trigger de auditoría).

---

## 1. Migración y rollback (condición a)

Archivos (en la rama):

- `migrations/politicas_escritura_staff_14.sql` — generada por `tests/local/gen_politicas_escritura_staff.py`.
- `migrations/rollback_politicas_escritura_staff_14.sql` — las 36 de antes.
- `tests/local/gen_politicas_escritura_staff.py` — la especificación (tabla → predicado de club) y el md5 de prod de
  antes; **se niega a escribir** si lo que genera no reproduce 36/36 ese md5.
- `tests/local/politicas_escritura_sandbox.sql` — réplica de las 14 tablas para el sandbox.
- `tests/local/politicas_escritura_md5_esperado.txt` — md5 esperado post-migración (medido en el sandbox).

Forma única del cambio:

```
antes:   (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR <PRED_CLUB>)
después: (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND <PRED_CLUB>))
```

### 1.a Verificación del generador y del rollback

```
$ python3 tests/local/gen_politicas_escritura_staff.py
OK: 36 políticas; md5 de hoy 36/36 = prod; 3 archivos escritos
```

md5 por política (`md5(coalesce(USING,'')||'|'||coalesce(WITH CHECK,''))`), consulta usada en prod y en el sandbox:

```sql
select c.relname||'.'||p.polname||' '||md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'')||'|'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))
from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and p.polcmd in ('a','w','*','d')
 and c.relname in ('caballeriza_responsables','carrera_apuestas','categorias_carrera','club_configuracion','club_secuencias','clubs','comision_config','hipodromos','liquidacion_config','novedades_reunion','resolucion_entidades','resoluciones','resultado_apuestas','resultado_log')
 and coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')||coalesce(pg_get_expr(p.polqual,p.polrelid),'') ~ 'fn_get_user_club_id'
order by c.relname, p.polname;
```

```
$ diff md5_sbx_hoy.txt md5_prod.txt && echo "SANDBOX HOY = PROD HOY 36/36"          # réplica cargada = prod antes
SANDBOX HOY = PROD HOY 36/36
$ diff md5_gen_nuevo.txt md5_sbx_despues.txt && echo "texto generado = lo que guarda Postgres (36/36)"
texto generado = lo que guarda Postgres (36/36)
$ tests/local/up.sh sql < migrations/rollback_politicas_escritura_staff_14.sql     # rollback en el sandbox
      1 BEGIN
      1 COMMIT
     36 CREATE POLICY
     36 DROP POLICY
$ … | diff - md5_prod.txt && echo "sandbox = política de hoy (rollback exacto 36/36)"
sandbox = política de hoy (rollback exacto 36/36)
```

Versiones: prod PostgreSQL 17.6, sandbox 16.15. Las 36 de antes normalizan idéntico en las dos.

### 1.b Aplicación

- `apply_migration(name='politicas_escritura_staff_14', query=<texto completo del archivo>)` → `{"success":true}`.
  Versión registrada: `20260927202948`.
- Después de aplicar se agregó al encabezado del archivo un bloque `ESTADO EN PRODUCCIÓN` (sólo comentarios):

```
$ diff <(sed -n '/^BEGIN;/,$p' migrations/politicas_escritura_staff_14.sql) <(printf 'BEGIN;\n'; cat fwd_body.sql; printf 'COMMIT;\n') && echo "sentencias idénticas a lo aplicado"
sentencias idénticas a lo aplicado
```

### 1.c md5 después de aplicar (prod) vs esperado (sandbox)

Salida de la consulta en prod (`n = 36`, `migracion = 20260927202948`):

```
caballeriza_responsables.caballeriza_responsables_delete c6e65c7c74b56a79a6b59047f272b7a6
caballeriza_responsables.caballeriza_responsables_insert edd81949ff97dd61bfe36ada78b684fa
caballeriza_responsables.caballeriza_responsables_update ef00973eb756c0bc16d74c6cc01a6b57
carrera_apuestas.carrera_apuestas_delete 35f84de1e92484a47f39b109ab053c7f
carrera_apuestas.carrera_apuestas_insert 1f501a4cd6d89115909b2d82853e0351
carrera_apuestas.carrera_apuestas_update 5232e588f24bf123514396a183a531d9
categorias_carrera.categorias_carrera_delete 9d695686b22058200e7561b36d525ed9
categorias_carrera.categorias_carrera_insert 851412fcb330fce19eebb3de7055282c
categorias_carrera.categorias_carrera_update 037b23db86ad676cb86984cac876da25
club_configuracion.club_configuracion_delete 9d695686b22058200e7561b36d525ed9
club_configuracion.club_configuracion_insert 851412fcb330fce19eebb3de7055282c
club_configuracion.club_configuracion_update 037b23db86ad676cb86984cac876da25
club_secuencias.club_secuencias_rls 037b23db86ad676cb86984cac876da25
clubs.clubs_update_self_or_admin aa331cba499ed23e5dc56681d5306362
comision_config.comision_config_delete 9d695686b22058200e7561b36d525ed9
comision_config.comision_config_insert 851412fcb330fce19eebb3de7055282c
comision_config.comision_config_update 037b23db86ad676cb86984cac876da25
hipodromos.hipodromos_delete 9d695686b22058200e7561b36d525ed9
hipodromos.hipodromos_insert 851412fcb330fce19eebb3de7055282c
hipodromos.hipodromos_update 037b23db86ad676cb86984cac876da25
liquidacion_config.liquidacion_config_rls 037b23db86ad676cb86984cac876da25
novedades_reunion.novedades_reunion_delete 8f98124fdd12d4edc477a38bda2007c2
novedades_reunion.novedades_reunion_insert 39905350ed5225ce2536fafdb2450e49
novedades_reunion.novedades_reunion_update cf9b75e03e8192516d954a5eee279a52
resolucion_entidades.resolucion_entidades_delete c2cb0e12ae1cff5f383e7bc3c5efee60
resolucion_entidades.resolucion_entidades_insert 3f38ad29c81ad76f3a9d9aa364255c97
resolucion_entidades.resolucion_entidades_update c93e0192c669dd79e5ccc46ca56f92db
resoluciones.resoluciones_delete 9d695686b22058200e7561b36d525ed9
resoluciones.resoluciones_insert 851412fcb330fce19eebb3de7055282c
resoluciones.resoluciones_update 037b23db86ad676cb86984cac876da25
resultado_apuestas.resultado_apuestas_delete 2b3d2ca65c8cb318ae885f048d741524
resultado_apuestas.resultado_apuestas_insert 27f1751bb006ab2a8bbd95b1885275bf
resultado_apuestas.resultado_apuestas_update 206aaba652664e7bce1133d1ee145f58
resultado_log.resultado_log_delete 2b3d2ca65c8cb318ae885f048d741524
resultado_log.resultado_log_insert 27f1751bb006ab2a8bbd95b1885275bf
resultado_log.resultado_log_update 206aaba652664e7bce1133d1ee145f58
```
```
$ diff md5_prod_despues.txt <(grep -v '^#' tests/local/politicas_escritura_md5_esperado.txt) && echo "PROD DESPUÉS = ESPERADO SANDBOX 36/36"
PROD DESPUÉS = ESPERADO SANDBOX 36/36
```

---

## 2. Test (c) — oficializar en la 9999, ANTES de aplicar

En **prod**, en **una transacción que termina en `rollback`**: se ejecuta el cuerpo de la migración, se simula la sesión
del secretario de Dolores (`request.jwt.claims` con su `auth_user_id`, `role authenticated`, `set local role
authenticated` — no service_role), se llama a `aplicar_resultado` sobre T1 de la 9999 con sus posiciones actuales y 4
dividendos de prueba, se hace un INSERT en `carrera_apuestas` como staff, y después la sesión de un usuario del portal
intenta escribir. Se lee todo y se revierte. Función, datos y guards reales.

SQL tal como se corrió (md5 del archivo `d18241cb4905769cc6c02fdaa2244188`):

```sql
begin;
create temp table _c (paso text, valor text) on commit drop;
grant all on _c to authenticated;
insert into _c select 'antes: resultado_apuestas T1', count(*)::text from resultado_apuestas where resultado_id='d0000000-0000-0000-0000-000000000001';
insert into _c select 'antes: resultado_log T1', count(*)::text from resultado_log where resultado_id='d0000000-0000-0000-0000-000000000001';
insert into _c select 'antes: md5 resultado_posiciones T1', md5(coalesce(string_agg(inscripcion_id::text||':'||coalesce(posicion::text,'-')||':'||no_largo::text, ',' order by inscripcion_id),'')) from resultado_posiciones where resultado_id='d0000000-0000-0000-0000-000000000001';
-- ── migración (texto del archivo) ──

DROP POLICY caballeriza_responsables_delete ON public.caballeriza_responsables;
CREATE POLICY caballeriza_responsables_delete ON public.caballeriza_responsables AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY caballeriza_responsables_insert ON public.caballeriza_responsables;
CREATE POLICY caballeriza_responsables_insert ON public.caballeriza_responsables AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY caballeriza_responsables_update ON public.caballeriza_responsables;
CREATE POLICY caballeriza_responsables_update ON public.caballeriza_responsables AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY carrera_apuestas_delete ON public.carrera_apuestas;
CREATE POLICY carrera_apuestas_delete ON public.carrera_apuestas AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY carrera_apuestas_insert ON public.carrera_apuestas;
CREATE POLICY carrera_apuestas_insert ON public.carrera_apuestas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY carrera_apuestas_update ON public.carrera_apuestas;
CREATE POLICY carrera_apuestas_update ON public.carrera_apuestas AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY categorias_carrera_delete ON public.categorias_carrera;
CREATE POLICY categorias_carrera_delete ON public.categorias_carrera AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY categorias_carrera_insert ON public.categorias_carrera;
CREATE POLICY categorias_carrera_insert ON public.categorias_carrera AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY categorias_carrera_update ON public.categorias_carrera;
CREATE POLICY categorias_carrera_update ON public.categorias_carrera AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY club_configuracion_delete ON public.club_configuracion;
CREATE POLICY club_configuracion_delete ON public.club_configuracion AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY club_configuracion_insert ON public.club_configuracion;
CREATE POLICY club_configuracion_insert ON public.club_configuracion AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY club_configuracion_update ON public.club_configuracion;
CREATE POLICY club_configuracion_update ON public.club_configuracion AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY club_secuencias_rls ON public.club_secuencias;
CREATE POLICY club_secuencias_rls ON public.club_secuencias AS PERMISSIVE FOR ALL TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY clubs_update_self_or_admin ON public.clubs;
CREATE POLICY clubs_update_self_or_admin ON public.clubs AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY comision_config_delete ON public.comision_config;
CREATE POLICY comision_config_delete ON public.comision_config AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY comision_config_insert ON public.comision_config;
CREATE POLICY comision_config_insert ON public.comision_config AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY comision_config_update ON public.comision_config;
CREATE POLICY comision_config_update ON public.comision_config AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY hipodromos_delete ON public.hipodromos;
CREATE POLICY hipodromos_delete ON public.hipodromos AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY hipodromos_insert ON public.hipodromos;
CREATE POLICY hipodromos_insert ON public.hipodromos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY hipodromos_update ON public.hipodromos;
CREATE POLICY hipodromos_update ON public.hipodromos AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY liquidacion_config_rls ON public.liquidacion_config;
CREATE POLICY liquidacion_config_rls ON public.liquidacion_config AS PERMISSIVE FOR ALL TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY novedades_reunion_delete ON public.novedades_reunion;
CREATE POLICY novedades_reunion_delete ON public.novedades_reunion AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY novedades_reunion_insert ON public.novedades_reunion;
CREATE POLICY novedades_reunion_insert ON public.novedades_reunion AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY novedades_reunion_update ON public.novedades_reunion;
CREATE POLICY novedades_reunion_update ON public.novedades_reunion AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resolucion_entidades_delete ON public.resolucion_entidades;
CREATE POLICY resolucion_entidades_delete ON public.resolucion_entidades AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resolucion_entidades_insert ON public.resolucion_entidades;
CREATE POLICY resolucion_entidades_insert ON public.resolucion_entidades AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resolucion_entidades_update ON public.resolucion_entidades;
CREATE POLICY resolucion_entidades_update ON public.resolucion_entidades AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resoluciones_delete ON public.resoluciones;
CREATE POLICY resoluciones_delete ON public.resoluciones AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resoluciones_insert ON public.resoluciones;
CREATE POLICY resoluciones_insert ON public.resoluciones AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resoluciones_update ON public.resoluciones;
CREATE POLICY resoluciones_update ON public.resoluciones AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_apuestas_delete ON public.resultado_apuestas;
CREATE POLICY resultado_apuestas_delete ON public.resultado_apuestas AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_apuestas_insert ON public.resultado_apuestas;
CREATE POLICY resultado_apuestas_insert ON public.resultado_apuestas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_apuestas_update ON public.resultado_apuestas;
CREATE POLICY resultado_apuestas_update ON public.resultado_apuestas AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_log_delete ON public.resultado_log;
CREATE POLICY resultado_log_delete ON public.resultado_log AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_log_insert ON public.resultado_log;
CREATE POLICY resultado_log_insert ON public.resultado_log AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

DROP POLICY resultado_log_update ON public.resultado_log;
CREATE POLICY resultado_log_update ON public.resultado_log AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

-- ── control: las 36 quedaron con fn_is_staff ──
insert into _c select 'politicas con fn_is_staff', count(*)::text from pg_policy p join pg_class c on c.oid=p.polrelid
 where c.relnamespace='public'::regnamespace and p.polcmd in ('a','w','*','d') and coalesce(pg_get_expr(p.polqual,p.polrelid),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') ~ 'fn_get_user_club_id' and coalesce(pg_get_expr(p.polqual,p.polrelid),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') ~ 'fn_is_staff'
 and c.relname in ('caballeriza_responsables','carrera_apuestas','categorias_carrera','club_configuracion','club_secuencias','clubs','comision_config','hipodromos','liquidacion_config','novedades_reunion','resolucion_entidades','resoluciones','resultado_apuestas','resultado_log');
-- ── oficializar T1 de la 9999 como el secretario de Dolores (sesión authenticated real, no service_role) ──
select set_config('request.jwt.claims', json_build_object('sub',(select auth_user_id from usuarios where email='dolores@sgh.com'),'role','authenticated')::text, true);
set local role authenticated;
insert into _c select 'fn_is_staff() del secretario', fn_is_staff()::text;
insert into _c select 'aplicar_resultado', aplicar_resultado(
  r.id, r.updated_at, r.carrera_id, 'oficial', r.estado_pista, r.tiempo_ganador, r.incidentes, r.favorito_mandil, coalesce(r.redistribucion_legs,'{}'::jsonb),
  (select coalesce(jsonb_agg(jsonb_build_object('inscripcion_id',p.inscripcion_id,'posicion',p.posicion,'no_largo',p.no_largo,'descalificado',p.descalificado,'tiempo',p.tiempo,'diferencia',p.diferencia,'motivo_desc',p.motivo_desc,'empate',p.empate,'dividendo',p.dividendo)),'[]'::jsonb) from resultado_posiciones p where p.resultado_id=r.id),
  '[{"tipo":"GAN","div_orig":3.5,"orden":0},{"tipo":"SEG","div_orig":1.8,"orden":0},{"tipo":"SEG","div_orig":2.1,"orden":1},{"tipo":"EX","div_orig":12.4,"composicion":"1-2","orden":0}]'::jsonb
)::text from resultados r where r.id='d0000000-0000-0000-0000-000000000001';
-- ── la misma sesión staff escribe carrera_apuestas por la política (lo que hace programa.html) ──
insert into carrera_apuestas (carrera_id, tipo, precio, nombre) values ('c0000000-0000-0000-0000-000000000001','GAN',100,'PROBE-093-c');
insert into _c select 'staff: carrera_apuestas por la política', count(*)::text from carrera_apuestas where nombre='PROBE-093-c';
-- ── un usuario del PORTAL intenta lo mismo ──
select set_config('request.jwt.claims', json_build_object('sub',(select auth_user_id from usuarios where rol='profesional' and activo and auth_user_id is not null order by created_at limit 1),'role','authenticated')::text, true);
insert into _c select 'fn_is_portal_user() del portal', fn_is_portal_user()::text;
do $$ begin
  begin insert into resultado_apuestas (resultado_id,tipo,orden) values ('d0000000-0000-0000-0000-000000000001','CAD',77);
        insert into _c values ('portal: INSERT resultado_apuestas','PASÓ (MAL)');
  exception when insufficient_privilege then insert into _c values ('portal: INSERT resultado_apuestas','rechazado 42501'); end;
  begin insert into carrera_apuestas (carrera_id,tipo,precio,nombre) values ('c0000000-0000-0000-0000-000000000002','GAN',1,'PROBE-093-p');
        insert into _c values ('portal: INSERT carrera_apuestas','PASÓ (MAL)');
  exception when insufficient_privilege then insert into _c values ('portal: INSERT carrera_apuestas','rechazado 42501'); end;
end $$;
with u as (update liquidacion_config set incentivo_jockey_monto = incentivo_jockey_monto where activo returning 1) insert into _c select 'portal: UPDATE liquidacion_config (filas)', count(*)::text from u;
with u as (update clubs set sigla = sigla where id='0649e9c5-9e87-4aad-842f-101458e6b33c' returning 1) insert into _c select 'portal: UPDATE clubs Dolores (filas)', count(*)::text from u;
with u as (update club_secuencias set ultimo_numero = ultimo_numero returning 1) insert into _c select 'portal: UPDATE club_secuencias (filas)', count(*)::text from u;
reset role;
insert into _c select 'después: resultado_apuestas T1', count(*)::text||' → '||string_agg(tipo||'/'||orden||'='||div_orig, ', ' order by tipo, orden) from resultado_apuestas where resultado_id='d0000000-0000-0000-0000-000000000001';
insert into _c select 'después: resultado_log T1', count(*)::text from resultado_log where resultado_id='d0000000-0000-0000-0000-000000000001';
insert into _c select 'después: md5 resultado_posiciones T1', md5(coalesce(string_agg(inscripcion_id::text||':'||coalesce(posicion::text,'-')||':'||no_largo::text, ',' order by inscripcion_id),'')) from resultado_posiciones where resultado_id='d0000000-0000-0000-0000-000000000001';
select string_agg(paso||' = '||valor, E'\n' order by ctid) resultado from _c;
rollback;
```

Resultado:

```
antes: resultado_apuestas T1 = 0
antes: resultado_log T1 = 0
antes: md5 resultado_posiciones T1 = f251da7b08f01b77db475a9c0f8c2039
politicas con fn_is_staff = 36
fn_is_staff() del secretario = true
aplicar_resultado = {"updated_at": "2026-09-27T20:28:10.272698+00:00", "resultado_id": "d0000000-0000-0000-0000-000000000001"}
staff: carrera_apuestas por la política = 1
fn_is_portal_user() del portal = true
portal: INSERT resultado_apuestas = rechazado 42501
portal: INSERT carrera_apuestas = rechazado 42501
portal: UPDATE liquidacion_config (filas) = 0
portal: UPDATE clubs Dolores (filas) = 0
portal: UPDATE club_secuencias (filas) = 0
después: resultado_apuestas T1 = 4 → EX/0=12.40, GAN/0=3.50, SEG/0=1.80, SEG/1=2.10
después: resultado_log T1 = 0
después: md5 resultado_posiciones T1 = f251da7b08f01b77db475a9c0f8c2039
```

Control de que el rollback no dejó nada:

```sql
select (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace and c.relname in ('caballeriza_responsables','carrera_apuestas','categorias_carrera','club_configuracion','club_secuencias','clubs','comision_config','hipodromos','liquidacion_config','novedades_reunion','resolucion_entidades','resoluciones','resultado_apuestas','resultado_log') and coalesce(pg_get_expr(p.polqual,p.polrelid),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') ~ 'fn_is_staff') politicas_con_staff,
 (select count(*) from resultado_apuestas where resultado_id='d0000000-0000-0000-0000-000000000001') apu_t1,
 (select updated_at from resultados where id='d0000000-0000-0000-0000-000000000001')::text upd_t1,
 (select count(*) from carrera_apuestas where nombre like 'PROBE-093%') ca_probe;
```
```
politicas_con_staff | apu_t1 | upd_t1                        | ca_probe
0                   | 0      | 2026-09-23 01:35:51.806929+00 | 0
```

**Sobre `resultado_log`**: queda en 0 porque **nadie la escribe**. `aplicar_resultado` hace `DELETE/INSERT` sobre
`resultado_posiciones` y `resultado_apuestas` y `UPDATE` sobre `resultados`; no nombra `resultado_log` (md5 de
`pg_get_functiondef(aplicar_resultado)` = `94d46dc0ed70e78329169bb3926f64c2`, sin cambios en esta tarea). Ninguna otra
función ni pantalla la escribe (relevamiento §1 del informe anterior) y la tabla tiene 0 filas. El cambio de política
no puede romper una escritura que no existe; si se espera que oficializar deje un log, es un faltante previo
(pregunta abierta Q2).

### 2.b Mismo test DESPUÉS de aplicar (sin el bloque DDL)

```sql
begin;
create temp table _c (paso text, valor text) on commit drop;
grant all on _c to authenticated;
insert into _c select 'antes: resultado_apuestas T1', count(*)::text from resultado_apuestas where resultado_id='d0000000-0000-0000-0000-000000000001';
insert into _c select 'antes: resultado_log T1', count(*)::text from resultado_log where resultado_id='d0000000-0000-0000-0000-000000000001';
insert into _c select 'políticas con fn_is_staff (aplicadas)', count(*)::text from pg_policy p join pg_class c on c.oid=p.polrelid
 where c.relnamespace='public'::regnamespace and p.polcmd in ('a','w','*','d') and coalesce(pg_get_expr(p.polqual,p.polrelid),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') ~ 'fn_get_user_club_id' and coalesce(pg_get_expr(p.polqual,p.polrelid),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') ~ 'fn_is_staff'
 and c.relname in ('caballeriza_responsables','carrera_apuestas','categorias_carrera','club_configuracion','club_secuencias','clubs','comision_config','hipodromos','liquidacion_config','novedades_reunion','resolucion_entidades','resoluciones','resultado_apuestas','resultado_log');
select set_config('request.jwt.claims', json_build_object('sub',(select auth_user_id from usuarios where email='dolores@sgh.com'),'role','authenticated')::text, true);
set local role authenticated;
insert into _c select 'aplicar_resultado (secretario)', aplicar_resultado(
  r.id, r.updated_at, r.carrera_id, 'oficial', r.estado_pista, r.tiempo_ganador, r.incidentes, r.favorito_mandil, coalesce(r.redistribucion_legs,'{}'::jsonb),
  (select coalesce(jsonb_agg(jsonb_build_object('inscripcion_id',p.inscripcion_id,'posicion',p.posicion,'no_largo',p.no_largo,'descalificado',p.descalificado,'tiempo',p.tiempo,'diferencia',p.diferencia,'motivo_desc',p.motivo_desc,'empate',p.empate,'dividendo',p.dividendo)),'[]'::jsonb) from resultado_posiciones p where p.resultado_id=r.id),
  '[{"tipo":"GAN","div_orig":3.5,"orden":0},{"tipo":"SEG","div_orig":1.8,"orden":0},{"tipo":"SEG","div_orig":2.1,"orden":1},{"tipo":"EX","div_orig":12.4,"composicion":"1-2","orden":0}]'::jsonb
)::text from resultados r where r.id='d0000000-0000-0000-0000-000000000001';
reset role;
insert into _c select 'después: resultado_apuestas T1', count(*)::text||' → '||string_agg(tipo||'/'||orden||'='||div_orig, ', ' order by tipo, orden) from resultado_apuestas where resultado_id='d0000000-0000-0000-0000-000000000001';
insert into _c select 'después: resultado_log T1', count(*)::text from resultado_log where resultado_id='d0000000-0000-0000-0000-000000000001';
select string_agg(paso||' = '||valor, E'\n' order by ctid) resultado from _c;
rollback;
```
```
antes: resultado_apuestas T1 = 0
antes: resultado_log T1 = 0
políticas con fn_is_staff (aplicadas) = 36
aplicar_resultado (secretario) = {"updated_at": "2026-09-27T20:39:56.520627+00:00", "resultado_id": "d0000000-0000-0000-0000-000000000001"}
después: resultado_apuestas T1 = 4 → EX/0=12.40, GAN/0=3.50, SEG/0=1.80, SEG/1=2.10
después: resultado_log T1 = 0
```

Tras ese rollback: `resultado_apuestas` de T1 = 0 (medido en la consulta de §6.c).

---

## 3. Probe (condición b) — `tests/probe_politicas_escritura_staff.mjs`

Perfiles con **sesión real** (sandbox: JWT firmado con el secreto del sandbox; prod: magiclink + `verifyOtp`),
creados y borrados por el probe:

| Perfil | Rol / estado | Esperado |
|---|---|---|
| `portal` | profesional del portal, Dolores, activo | rechazado (el agujero) |
| `portal_prop` | propietario del portal, Dolores, activo | rechazado (el agujero) |
| `inactivo` | operador de Dolores, `activo=false` | rechazado (control) |
| `otroclub` | operador de Mi Club Hípico, sobre filas de Dolores | rechazado (control del club) |
| `secretario` | secretario_carreras, Dolores | puede |
| `operador` | operador, Dolores | puede |
| `superadmin` | super_admin | puede |

Por tabla (13) × perfil: INSERT (negativo = 42501, positivo = 1 fila), UPDATE y DELETE sobre un fixture **propio de
cada celda** (negativo = 0 filas y fixture intacto por md5/presencia; positivo = 1 fila). `clubs`: sólo UPDATE (es la
única política de `clubs` en el cambio), no-op sobre la fila real de Dolores. Fixtures fuera de circuito: config de
liquidación y comisión con `activo=false` y vigencia 2099, hipódromo y categoría inactivos, apuestas/log/novedades sobre
la 9999, caballeriza de prueba (responsable sin documento: el trigger de propietario no corre). Estado final: 0 filas
marcadas en las 14 tablas, 0 usuarios, y las filas reales de Dolores en `clubs` (sin `updated_at`),
`liquidacion_config` activa y `club_secuencias` idénticas a la foto del arranque.

Mutantes (sólo sandbox, `PSQL_CMD`): uno por tabla — se le vuelve a poner a **esa** tabla su política de antes (bloques
del rollback), se corre sólo esa tabla, se restaura con los bloques de la migración.

### 3.a Sandbox, con las políticas de ANTES (reproduce el agujero)

```
$ tests/local/up.sh sql < migrations/rollback_politicas_escritura_staff_14.sql
$ SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=$(cat tests/local/out/jwt) LOCAL_JWT_SECRET=$(cat tests/local/out/jwt_secret) node tests/probe_politicas_escritura_staff.mjs
```
```
contexto: RUN=PROBE-093-1790541399178 · sandbox · 7 perfiles con sesión real · pool apuestas=39
❌ caballeriza_responsables.INSERT.portal) rechazado  ← {"n":1}
❌ caballeriza_responsables.UPDATE.portal) 0 filas y fixture igual  ← {"n":1}
❌ caballeriza_responsables.DELETE.portal) 0 filas y fixture sigue  ← {"n":1}
❌ caballeriza_responsables.INSERT.portal_prop) rechazado  ← {"n":1}
❌ caballeriza_responsables.UPDATE.portal_prop) 0 filas y fixture igual  ← {"n":1}
❌ caballeriza_responsables.DELETE.portal_prop) 0 filas y fixture sigue  ← {"n":1}
✅ caballeriza_responsables.INSERT.inactivo) rechazado
✅ caballeriza_responsables.UPDATE.inactivo) 0 filas y fixture igual
✅ caballeriza_responsables.DELETE.inactivo) 0 filas y fixture sigue
✅ caballeriza_responsables.INSERT.otroclub) rechazado
✅ caballeriza_responsables.UPDATE.otroclub) 0 filas y fixture igual
✅ caballeriza_responsables.DELETE.otroclub) 0 filas y fixture sigue
✅ caballeriza_responsables.INSERT.secretario) OK
✅ caballeriza_responsables.UPDATE.secretario) 1 fila
✅ caballeriza_responsables.DELETE.secretario) 1 fila
✅ caballeriza_responsables.INSERT.operador) OK
✅ caballeriza_responsables.UPDATE.operador) 1 fila
✅ caballeriza_responsables.DELETE.operador) 1 fila
✅ caballeriza_responsables.INSERT.superadmin) OK
✅ caballeriza_responsables.UPDATE.superadmin) 1 fila
✅ caballeriza_responsables.DELETE.superadmin) 1 fila
❌ carrera_apuestas.INSERT.portal) rechazado  ← {"n":1}
❌ carrera_apuestas.UPDATE.portal) 0 filas y fixture igual  ← {"n":1}
❌ carrera_apuestas.DELETE.portal) 0 filas y fixture sigue  ← {"n":1}
❌ carrera_apuestas.INSERT.portal_prop) rechazado  ← {"n":1}
❌ carrera_apuestas.UPDATE.portal_prop) 0 filas y fixture igual  ← {"n":1}
❌ carrera_apuestas.DELETE.portal_prop) 0 filas y fixture sigue  ← {"n":1}
✅ carrera_apuestas.INSERT.inactivo) rechazado
✅ carrera_apuestas.UPDATE.inactivo) 0 filas y fixture igual
✅ carrera_apuestas.DELETE.inactivo) 0 filas y fixture sigue
✅ carrera_apuestas.INSERT.otroclub) rechazado
✅ carrera_apuestas.UPDATE.otroclub) 0 filas y fixture igual
✅ carrera_apuestas.DELETE.otroclub) 0 filas y fixture sigue
✅ carrera_apuestas.INSERT.secretario) OK
✅ carrera_apuestas.UPDATE.secretario) 1 fila
✅ carrera_apuestas.DELETE.secretario) 1 fila
✅ carrera_apuestas.INSERT.operador) OK
✅ carrera_apuestas.UPDATE.operador) 1 fila
✅ carrera_apuestas.DELETE.operador) 1 fila
✅ carrera_apuestas.INSERT.superadmin) OK
✅ carrera_apuestas.UPDATE.superadmin) 1 fila
✅ carrera_apuestas.DELETE.superadmin) 1 fila
❌ categorias_carrera.INSERT.portal) rechazado  ← {"n":1}
❌ categorias_carrera.UPDATE.portal) 0 filas y fixture igual  ← {"n":1}
❌ categorias_carrera.DELETE.portal) 0 filas y fixture sigue  ← {"n":1}
❌ categorias_carrera.INSERT.portal_prop) rechazado  ← {"n":1}
❌ categorias_carrera.UPDATE.portal_prop) 0 filas y fixture igual  ← {"n":1}
❌ categorias_carrera.DELETE.portal_prop) 0 filas y fixture sigue  ← {"n":1}
✅ categorias_carrera.INSERT.inactivo) rechazado
✅ categorias_carrera.UPDATE.inactivo) 0 filas y fixture igual
✅ categorias_carrera.DELETE.inactivo) 0 filas y fixture sigue
✅ categorias_carrera.INSERT.otroclub) rechazado
✅ categorias_carrera.UPDATE.otroclub) 0 filas y fixture igual
✅ categorias_carrera.DELETE.otroclub) 0 filas y fixture sigue
✅ categorias_carrera.INSERT.secretario) OK
✅ categorias_carrera.UPDATE.secretario) 1 fila
✅ categorias_carrera.DELETE.secretario) 1 fila
✅ categorias_carrera.INSERT.operador) OK
✅ categorias_carrera.UPDATE.operador) 1 fila
✅ categorias_carrera.DELETE.operador) 1 fila
✅ categorias_carrera.INSERT.superadmin) OK
✅ categorias_carrera.UPDATE.superadmin) 1 fila
✅ categorias_carrera.DELETE.superadmin) 1 fila
❌ club_configuracion.INSERT.portal) rechazado  ← {"n":1}
❌ club_configuracion.UPDATE.portal) 0 filas y fixture igual  ← {"n":1}
❌ club_configuracion.DELETE.portal) 0 filas y fixture sigue  ← {"n":1}
❌ club_configuracion.INSERT.portal_prop) rechazado  ← {"n":1}
❌ club_configuracion.UPDATE.portal_prop) 0 filas y fixture igual  ← {"n":1}
❌ club_configuracion.DELETE.portal_prop) 0 filas y fixture sigue  ← {"n":1}
✅ club_configuracion.INSERT.inactivo) rechazado
✅ club_configuracion.UPDATE.inactivo) 0 filas y fixture igual
✅ club_configuracion.DELETE.inactivo) 0 filas y fixture sigue
✅ club_configuracion.INSERT.otroclub) rechazado
✅ club_configuracion.UPDATE.otroclub) 0 filas y fixture igual
✅ club_configuracion.DELETE.otroclub) 0 filas y fixture sigue
✅ club_configuracion.INSERT.secretario) OK
✅ club_configuracion.UPDATE.secretario) 1 fila
✅ club_configuracion.DELETE.secretario) 1 fila
✅ club_configuracion.INSERT.operador) OK
✅ club_configuracion.UPDATE.operador) 1 fila
✅ club_configuracion.DELETE.operador) 1 fila
✅ club_configuracion.INSERT.superadmin) OK
✅ club_configuracion.UPDATE.superadmin) 1 fila
✅ club_configuracion.DELETE.superadmin) 1 fila
❌ club_secuencias.INSERT.portal) rechazado  ← {"n":1}
❌ club_secuencias.UPDATE.portal) 0 filas y fixture igual  ← {"n":1}
❌ club_secuencias.DELETE.portal) 0 filas y fixture sigue  ← {"n":1}
❌ club_secuencias.INSERT.portal_prop) rechazado  ← {"n":1}
❌ club_secuencias.UPDATE.portal_prop) 0 filas y fixture igual  ← {"n":1}
❌ club_secuencias.DELETE.portal_prop) 0 filas y fixture sigue  ← {"n":1}
✅ club_secuencias.INSERT.inactivo) rechazado
✅ club_secuencias.UPDATE.inactivo) 0 filas y fixture igual
✅ club_secuencias.DELETE.inactivo) 0 filas y fixture sigue
✅ club_secuencias.INSERT.otroclub) rechazado
✅ club_secuencias.UPDATE.otroclub) 0 filas y fixture igual
✅ club_secuencias.DELETE.otroclub) 0 filas y fixture sigue
✅ club_secuencias.INSERT.secretario) OK
✅ club_secuencias.UPDATE.secretario) 1 fila
✅ club_secuencias.DELETE.secretario) 1 fila
✅ club_secuencias.INSERT.operador) OK
✅ club_secuencias.UPDATE.operador) 1 fila
✅ club_secuencias.DELETE.operador) 1 fila
✅ club_secuencias.INSERT.superadmin) OK
✅ club_secuencias.UPDATE.superadmin) 1 fila
✅ club_secuencias.DELETE.superadmin) 1 fila
❌ clubs.UPDATE.portal) Dolores (no-op): 0 filas  ← {"n":1}
❌ clubs.UPDATE.portal_prop) Dolores (no-op): 0 filas  ← {"n":1}
✅ clubs.UPDATE.inactivo) Dolores (no-op): 0 filas
✅ clubs.UPDATE.otroclub) Dolores (no-op): 0 filas
✅ clubs.UPDATE.secretario) Dolores (no-op): 1 fila
✅ clubs.UPDATE.operador) Dolores (no-op): 1 fila
✅ clubs.UPDATE.superadmin) Dolores (no-op): 1 fila
✅ clubs) Dolores sin cambios de contenido (sólo updated_at)
❌ comision_config.INSERT.portal) rechazado  ← {"n":1}
❌ comision_config.UPDATE.portal) 0 filas y fixture igual  ← {"n":1}
❌ comision_config.DELETE.portal) 0 filas y fixture sigue  ← {"n":1}
❌ comision_config.INSERT.portal_prop) rechazado  ← {"n":1}
❌ comision_config.UPDATE.portal_prop) 0 filas y fixture igual  ← {"n":1}
❌ comision_config.DELETE.portal_prop) 0 filas y fixture sigue  ← {"n":1}
✅ comision_config.INSERT.inactivo) rechazado
✅ comision_config.UPDATE.inactivo) 0 filas y fixture igual
✅ comision_config.DELETE.inactivo) 0 filas y fixture sigue
✅ comision_config.INSERT.otroclub) rechazado
✅ comision_config.UPDATE.otroclub) 0 filas y fixture igual
✅ comision_config.DELETE.otroclub) 0 filas y fixture sigue
✅ comision_config.INSERT.secretario) OK
✅ comision_config.UPDATE.secretario) 1 fila
✅ comision_config.DELETE.secretario) 1 fila
✅ comision_config.INSERT.operador) OK
✅ comision_config.UPDATE.operador) 1 fila
✅ comision_config.DELETE.operador) 1 fila
✅ comision_config.INSERT.superadmin) OK
✅ comision_config.UPDATE.superadmin) 1 fila
✅ comision_config.DELETE.superadmin) 1 fila
❌ hipodromos.INSERT.portal) rechazado  ← {"n":1}
❌ hipodromos.UPDATE.portal) 0 filas y fixture igual  ← {"n":1}
❌ hipodromos.DELETE.portal) 0 filas y fixture sigue  ← {"n":1}
❌ hipodromos.INSERT.portal_prop) rechazado  ← {"n":1}
❌ hipodromos.UPDATE.portal_prop) 0 filas y fixture igual  ← {"n":1}
❌ hipodromos.DELETE.portal_prop) 0 filas y fixture sigue  ← {"n":1}
✅ hipodromos.INSERT.inactivo) rechazado
✅ hipodromos.UPDATE.inactivo) 0 filas y fixture igual
✅ hipodromos.DELETE.inactivo) 0 filas y fixture sigue
✅ hipodromos.INSERT.otroclub) rechazado
✅ hipodromos.UPDATE.otroclub) 0 filas y fixture igual
✅ hipodromos.DELETE.otroclub) 0 filas y fixture sigue
✅ hipodromos.INSERT.secretario) OK
✅ hipodromos.UPDATE.secretario) 1 fila
✅ hipodromos.DELETE.secretario) 1 fila
✅ hipodromos.INSERT.operador) OK
✅ hipodromos.UPDATE.operador) 1 fila
✅ hipodromos.DELETE.operador) 1 fila
✅ hipodromos.INSERT.superadmin) OK
✅ hipodromos.UPDATE.superadmin) 1 fila
✅ hipodromos.DELETE.superadmin) 1 fila
❌ liquidacion_config.INSERT.portal) rechazado  ← {"n":1}
❌ liquidacion_config.UPDATE.portal) 0 filas y fixture igual  ← {"n":1}
❌ liquidacion_config.DELETE.portal) 0 filas y fixture sigue  ← {"n":1}
❌ liquidacion_config.INSERT.portal_prop) rechazado  ← {"n":1}
❌ liquidacion_config.UPDATE.portal_prop) 0 filas y fixture igual  ← {"n":1}
❌ liquidacion_config.DELETE.portal_prop) 0 filas y fixture sigue  ← {"n":1}
✅ liquidacion_config.INSERT.inactivo) rechazado
✅ liquidacion_config.UPDATE.inactivo) 0 filas y fixture igual
✅ liquidacion_config.DELETE.inactivo) 0 filas y fixture sigue
✅ liquidacion_config.INSERT.otroclub) rechazado
✅ liquidacion_config.UPDATE.otroclub) 0 filas y fixture igual
✅ liquidacion_config.DELETE.otroclub) 0 filas y fixture sigue
✅ liquidacion_config.INSERT.secretario) OK
✅ liquidacion_config.UPDATE.secretario) 1 fila
✅ liquidacion_config.DELETE.secretario) 1 fila
✅ liquidacion_config.INSERT.operador) OK
✅ liquidacion_config.UPDATE.operador) 1 fila
✅ liquidacion_config.DELETE.operador) 1 fila
✅ liquidacion_config.INSERT.superadmin) OK
✅ liquidacion_config.UPDATE.superadmin) 1 fila
✅ liquidacion_config.DELETE.superadmin) 1 fila
❌ novedades_reunion.INSERT.portal) rechazado  ← {"n":1}
❌ novedades_reunion.UPDATE.portal) 0 filas y fixture igual  ← {"n":1}
❌ novedades_reunion.DELETE.portal) 0 filas y fixture sigue  ← {"n":1}
❌ novedades_reunion.INSERT.portal_prop) rechazado  ← {"n":1}
❌ novedades_reunion.UPDATE.portal_prop) 0 filas y fixture igual  ← {"n":1}
❌ novedades_reunion.DELETE.portal_prop) 0 filas y fixture sigue  ← {"n":1}
✅ novedades_reunion.INSERT.inactivo) rechazado
✅ novedades_reunion.UPDATE.inactivo) 0 filas y fixture igual
✅ novedades_reunion.DELETE.inactivo) 0 filas y fixture sigue
✅ novedades_reunion.INSERT.otroclub) rechazado
✅ novedades_reunion.UPDATE.otroclub) 0 filas y fixture igual
✅ novedades_reunion.DELETE.otroclub) 0 filas y fixture sigue
✅ novedades_reunion.INSERT.secretario) OK
✅ novedades_reunion.UPDATE.secretario) 1 fila
✅ novedades_reunion.DELETE.secretario) 1 fila
✅ novedades_reunion.INSERT.operador) OK
✅ novedades_reunion.UPDATE.operador) 1 fila
✅ novedades_reunion.DELETE.operador) 1 fila
✅ novedades_reunion.INSERT.superadmin) OK
✅ novedades_reunion.UPDATE.superadmin) 1 fila
✅ novedades_reunion.DELETE.superadmin) 1 fila
❌ resolucion_entidades.INSERT.portal) rechazado  ← {"n":1}
❌ resolucion_entidades.UPDATE.portal) 0 filas y fixture igual  ← {"n":1}
❌ resolucion_entidades.DELETE.portal) 0 filas y fixture sigue  ← {"n":1}
❌ resolucion_entidades.INSERT.portal_prop) rechazado  ← {"n":1}
❌ resolucion_entidades.UPDATE.portal_prop) 0 filas y fixture igual  ← {"n":1}
❌ resolucion_entidades.DELETE.portal_prop) 0 filas y fixture sigue  ← {"n":1}
✅ resolucion_entidades.INSERT.inactivo) rechazado
✅ resolucion_entidades.UPDATE.inactivo) 0 filas y fixture igual
✅ resolucion_entidades.DELETE.inactivo) 0 filas y fixture sigue
✅ resolucion_entidades.INSERT.otroclub) rechazado
✅ resolucion_entidades.UPDATE.otroclub) 0 filas y fixture igual
✅ resolucion_entidades.DELETE.otroclub) 0 filas y fixture sigue
✅ resolucion_entidades.INSERT.secretario) OK
✅ resolucion_entidades.UPDATE.secretario) 1 fila
✅ resolucion_entidades.DELETE.secretario) 1 fila
✅ resolucion_entidades.INSERT.operador) OK
✅ resolucion_entidades.UPDATE.operador) 1 fila
✅ resolucion_entidades.DELETE.operador) 1 fila
✅ resolucion_entidades.INSERT.superadmin) OK
✅ resolucion_entidades.UPDATE.superadmin) 1 fila
✅ resolucion_entidades.DELETE.superadmin) 1 fila
❌ resoluciones.INSERT.portal) rechazado  ← {"n":1}
❌ resoluciones.UPDATE.portal) 0 filas y fixture igual  ← {"n":1}
❌ resoluciones.DELETE.portal) 0 filas y fixture sigue  ← {"n":1}
❌ resoluciones.INSERT.portal_prop) rechazado  ← {"n":1}
❌ resoluciones.UPDATE.portal_prop) 0 filas y fixture igual  ← {"n":1}
❌ resoluciones.DELETE.portal_prop) 0 filas y fixture sigue  ← {"n":1}
✅ resoluciones.INSERT.inactivo) rechazado
✅ resoluciones.UPDATE.inactivo) 0 filas y fixture igual
✅ resoluciones.DELETE.inactivo) 0 filas y fixture sigue
✅ resoluciones.INSERT.otroclub) rechazado
✅ resoluciones.UPDATE.otroclub) 0 filas y fixture igual
✅ resoluciones.DELETE.otroclub) 0 filas y fixture sigue
✅ resoluciones.INSERT.secretario) OK
✅ resoluciones.UPDATE.secretario) 1 fila
✅ resoluciones.DELETE.secretario) 1 fila
✅ resoluciones.INSERT.operador) OK
✅ resoluciones.UPDATE.operador) 1 fila
✅ resoluciones.DELETE.operador) 1 fila
✅ resoluciones.INSERT.superadmin) OK
✅ resoluciones.UPDATE.superadmin) 1 fila
✅ resoluciones.DELETE.superadmin) 1 fila
❌ resultado_apuestas.INSERT.portal) rechazado  ← {"n":1}
❌ resultado_apuestas.UPDATE.portal) 0 filas y fixture igual  ← {"n":1}
❌ resultado_apuestas.DELETE.portal) 0 filas y fixture sigue  ← {"n":1}
❌ resultado_apuestas.INSERT.portal_prop) rechazado  ← {"n":1}
❌ resultado_apuestas.UPDATE.portal_prop) 0 filas y fixture igual  ← {"n":1}
❌ resultado_apuestas.DELETE.portal_prop) 0 filas y fixture sigue  ← {"n":1}
✅ resultado_apuestas.INSERT.inactivo) rechazado
✅ resultado_apuestas.UPDATE.inactivo) 0 filas y fixture igual
✅ resultado_apuestas.DELETE.inactivo) 0 filas y fixture sigue
✅ resultado_apuestas.INSERT.otroclub) rechazado
✅ resultado_apuestas.UPDATE.otroclub) 0 filas y fixture igual
✅ resultado_apuestas.DELETE.otroclub) 0 filas y fixture sigue
✅ resultado_apuestas.INSERT.secretario) OK
✅ resultado_apuestas.UPDATE.secretario) 1 fila
✅ resultado_apuestas.DELETE.secretario) 1 fila
✅ resultado_apuestas.INSERT.operador) OK
✅ resultado_apuestas.UPDATE.operador) 1 fila
✅ resultado_apuestas.DELETE.operador) 1 fila
✅ resultado_apuestas.INSERT.superadmin) OK
✅ resultado_apuestas.UPDATE.superadmin) 1 fila
✅ resultado_apuestas.DELETE.superadmin) 1 fila
❌ resultado_log.INSERT.portal) rechazado  ← {"n":1}
❌ resultado_log.UPDATE.portal) 0 filas y fixture igual  ← {"n":1}
❌ resultado_log.DELETE.portal) 0 filas y fixture sigue  ← {"n":1}
❌ resultado_log.INSERT.portal_prop) rechazado  ← {"n":1}
❌ resultado_log.UPDATE.portal_prop) 0 filas y fixture igual  ← {"n":1}
❌ resultado_log.DELETE.portal_prop) 0 filas y fixture sigue  ← {"n":1}
✅ resultado_log.INSERT.inactivo) rechazado
✅ resultado_log.UPDATE.inactivo) 0 filas y fixture igual
✅ resultado_log.DELETE.inactivo) 0 filas y fixture sigue
✅ resultado_log.INSERT.otroclub) rechazado
✅ resultado_log.UPDATE.otroclub) 0 filas y fixture igual
✅ resultado_log.DELETE.otroclub) 0 filas y fixture sigue
✅ resultado_log.INSERT.secretario) OK
✅ resultado_log.UPDATE.secretario) 1 fila
✅ resultado_log.DELETE.secretario) 1 fila
✅ resultado_log.INSERT.operador) OK
✅ resultado_log.UPDATE.operador) 1 fila
✅ resultado_log.DELETE.operador) 1 fila
✅ resultado_log.INSERT.superadmin) OK
✅ resultado_log.UPDATE.superadmin) 1 fila
✅ resultado_log.DELETE.superadmin) 1 fila

MATRIZ: 201/281
✅ Z) limpieza por estado: {"resolucion_entidades":0,"resoluciones":0,"caballeriza_responsables":0,"carrera_apuestas":0,"categorias_carrera":0,"club_configuracion":0,"club_secuencias":0,"comision_config":0,"hipodromos":0,"liquidacion_config":0,"novedades_reunion":0,"resultado_apuestas":0,"resultado_log":0,"caballerizas":0,"usuarios":0} · filas reales (clubs Dolores, liquidacion_config activa, club_secuencias) idénticas a la foto: true
```

### 3.b Sandbox, con la migración + mutantes

```
$ tests/local/up.sh sql < migrations/politicas_escritura_staff_14.sql
$ SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=$(cat tests/local/out/jwt) LOCAL_JWT_SECRET=$(cat tests/local/out/jwt_secret) PSQL_CMD="tests/local/up.sh sql" node tests/probe_politicas_escritura_staff.mjs --mutantes
```
```
contexto: RUN=PROBE-093-1790541378906 · sandbox · 7 perfiles con sesión real · pool apuestas=39
✅ caballeriza_responsables.INSERT.portal) rechazado
✅ caballeriza_responsables.UPDATE.portal) 0 filas y fixture igual
✅ caballeriza_responsables.DELETE.portal) 0 filas y fixture sigue
✅ caballeriza_responsables.INSERT.portal_prop) rechazado
✅ caballeriza_responsables.UPDATE.portal_prop) 0 filas y fixture igual
✅ caballeriza_responsables.DELETE.portal_prop) 0 filas y fixture sigue
✅ caballeriza_responsables.INSERT.inactivo) rechazado
✅ caballeriza_responsables.UPDATE.inactivo) 0 filas y fixture igual
✅ caballeriza_responsables.DELETE.inactivo) 0 filas y fixture sigue
✅ caballeriza_responsables.INSERT.otroclub) rechazado
✅ caballeriza_responsables.UPDATE.otroclub) 0 filas y fixture igual
✅ caballeriza_responsables.DELETE.otroclub) 0 filas y fixture sigue
✅ caballeriza_responsables.INSERT.secretario) OK
✅ caballeriza_responsables.UPDATE.secretario) 1 fila
✅ caballeriza_responsables.DELETE.secretario) 1 fila
✅ caballeriza_responsables.INSERT.operador) OK
✅ caballeriza_responsables.UPDATE.operador) 1 fila
✅ caballeriza_responsables.DELETE.operador) 1 fila
✅ caballeriza_responsables.INSERT.superadmin) OK
✅ caballeriza_responsables.UPDATE.superadmin) 1 fila
✅ caballeriza_responsables.DELETE.superadmin) 1 fila
✅ carrera_apuestas.INSERT.portal) rechazado
✅ carrera_apuestas.UPDATE.portal) 0 filas y fixture igual
✅ carrera_apuestas.DELETE.portal) 0 filas y fixture sigue
✅ carrera_apuestas.INSERT.portal_prop) rechazado
✅ carrera_apuestas.UPDATE.portal_prop) 0 filas y fixture igual
✅ carrera_apuestas.DELETE.portal_prop) 0 filas y fixture sigue
✅ carrera_apuestas.INSERT.inactivo) rechazado
✅ carrera_apuestas.UPDATE.inactivo) 0 filas y fixture igual
✅ carrera_apuestas.DELETE.inactivo) 0 filas y fixture sigue
✅ carrera_apuestas.INSERT.otroclub) rechazado
✅ carrera_apuestas.UPDATE.otroclub) 0 filas y fixture igual
✅ carrera_apuestas.DELETE.otroclub) 0 filas y fixture sigue
✅ carrera_apuestas.INSERT.secretario) OK
✅ carrera_apuestas.UPDATE.secretario) 1 fila
✅ carrera_apuestas.DELETE.secretario) 1 fila
✅ carrera_apuestas.INSERT.operador) OK
✅ carrera_apuestas.UPDATE.operador) 1 fila
✅ carrera_apuestas.DELETE.operador) 1 fila
✅ carrera_apuestas.INSERT.superadmin) OK
✅ carrera_apuestas.UPDATE.superadmin) 1 fila
✅ carrera_apuestas.DELETE.superadmin) 1 fila
✅ categorias_carrera.INSERT.portal) rechazado
✅ categorias_carrera.UPDATE.portal) 0 filas y fixture igual
✅ categorias_carrera.DELETE.portal) 0 filas y fixture sigue
✅ categorias_carrera.INSERT.portal_prop) rechazado
✅ categorias_carrera.UPDATE.portal_prop) 0 filas y fixture igual
✅ categorias_carrera.DELETE.portal_prop) 0 filas y fixture sigue
✅ categorias_carrera.INSERT.inactivo) rechazado
✅ categorias_carrera.UPDATE.inactivo) 0 filas y fixture igual
✅ categorias_carrera.DELETE.inactivo) 0 filas y fixture sigue
✅ categorias_carrera.INSERT.otroclub) rechazado
✅ categorias_carrera.UPDATE.otroclub) 0 filas y fixture igual
✅ categorias_carrera.DELETE.otroclub) 0 filas y fixture sigue
✅ categorias_carrera.INSERT.secretario) OK
✅ categorias_carrera.UPDATE.secretario) 1 fila
✅ categorias_carrera.DELETE.secretario) 1 fila
✅ categorias_carrera.INSERT.operador) OK
✅ categorias_carrera.UPDATE.operador) 1 fila
✅ categorias_carrera.DELETE.operador) 1 fila
✅ categorias_carrera.INSERT.superadmin) OK
✅ categorias_carrera.UPDATE.superadmin) 1 fila
✅ categorias_carrera.DELETE.superadmin) 1 fila
✅ club_configuracion.INSERT.portal) rechazado
✅ club_configuracion.UPDATE.portal) 0 filas y fixture igual
✅ club_configuracion.DELETE.portal) 0 filas y fixture sigue
✅ club_configuracion.INSERT.portal_prop) rechazado
✅ club_configuracion.UPDATE.portal_prop) 0 filas y fixture igual
✅ club_configuracion.DELETE.portal_prop) 0 filas y fixture sigue
✅ club_configuracion.INSERT.inactivo) rechazado
✅ club_configuracion.UPDATE.inactivo) 0 filas y fixture igual
✅ club_configuracion.DELETE.inactivo) 0 filas y fixture sigue
✅ club_configuracion.INSERT.otroclub) rechazado
✅ club_configuracion.UPDATE.otroclub) 0 filas y fixture igual
✅ club_configuracion.DELETE.otroclub) 0 filas y fixture sigue
✅ club_configuracion.INSERT.secretario) OK
✅ club_configuracion.UPDATE.secretario) 1 fila
✅ club_configuracion.DELETE.secretario) 1 fila
✅ club_configuracion.INSERT.operador) OK
✅ club_configuracion.UPDATE.operador) 1 fila
✅ club_configuracion.DELETE.operador) 1 fila
✅ club_configuracion.INSERT.superadmin) OK
✅ club_configuracion.UPDATE.superadmin) 1 fila
✅ club_configuracion.DELETE.superadmin) 1 fila
✅ club_secuencias.INSERT.portal) rechazado
✅ club_secuencias.UPDATE.portal) 0 filas y fixture igual
✅ club_secuencias.DELETE.portal) 0 filas y fixture sigue
✅ club_secuencias.INSERT.portal_prop) rechazado
✅ club_secuencias.UPDATE.portal_prop) 0 filas y fixture igual
✅ club_secuencias.DELETE.portal_prop) 0 filas y fixture sigue
✅ club_secuencias.INSERT.inactivo) rechazado
✅ club_secuencias.UPDATE.inactivo) 0 filas y fixture igual
✅ club_secuencias.DELETE.inactivo) 0 filas y fixture sigue
✅ club_secuencias.INSERT.otroclub) rechazado
✅ club_secuencias.UPDATE.otroclub) 0 filas y fixture igual
✅ club_secuencias.DELETE.otroclub) 0 filas y fixture sigue
✅ club_secuencias.INSERT.secretario) OK
✅ club_secuencias.UPDATE.secretario) 1 fila
✅ club_secuencias.DELETE.secretario) 1 fila
✅ club_secuencias.INSERT.operador) OK
✅ club_secuencias.UPDATE.operador) 1 fila
✅ club_secuencias.DELETE.operador) 1 fila
✅ club_secuencias.INSERT.superadmin) OK
✅ club_secuencias.UPDATE.superadmin) 1 fila
✅ club_secuencias.DELETE.superadmin) 1 fila
✅ clubs.UPDATE.portal) Dolores (no-op): 0 filas
✅ clubs.UPDATE.portal_prop) Dolores (no-op): 0 filas
✅ clubs.UPDATE.inactivo) Dolores (no-op): 0 filas
✅ clubs.UPDATE.otroclub) Dolores (no-op): 0 filas
✅ clubs.UPDATE.secretario) Dolores (no-op): 1 fila
✅ clubs.UPDATE.operador) Dolores (no-op): 1 fila
✅ clubs.UPDATE.superadmin) Dolores (no-op): 1 fila
✅ clubs) Dolores sin cambios de contenido (sólo updated_at)
✅ comision_config.INSERT.portal) rechazado
✅ comision_config.UPDATE.portal) 0 filas y fixture igual
✅ comision_config.DELETE.portal) 0 filas y fixture sigue
✅ comision_config.INSERT.portal_prop) rechazado
✅ comision_config.UPDATE.portal_prop) 0 filas y fixture igual
✅ comision_config.DELETE.portal_prop) 0 filas y fixture sigue
✅ comision_config.INSERT.inactivo) rechazado
✅ comision_config.UPDATE.inactivo) 0 filas y fixture igual
✅ comision_config.DELETE.inactivo) 0 filas y fixture sigue
✅ comision_config.INSERT.otroclub) rechazado
✅ comision_config.UPDATE.otroclub) 0 filas y fixture igual
✅ comision_config.DELETE.otroclub) 0 filas y fixture sigue
✅ comision_config.INSERT.secretario) OK
✅ comision_config.UPDATE.secretario) 1 fila
✅ comision_config.DELETE.secretario) 1 fila
✅ comision_config.INSERT.operador) OK
✅ comision_config.UPDATE.operador) 1 fila
✅ comision_config.DELETE.operador) 1 fila
✅ comision_config.INSERT.superadmin) OK
✅ comision_config.UPDATE.superadmin) 1 fila
✅ comision_config.DELETE.superadmin) 1 fila
✅ hipodromos.INSERT.portal) rechazado
✅ hipodromos.UPDATE.portal) 0 filas y fixture igual
✅ hipodromos.DELETE.portal) 0 filas y fixture sigue
✅ hipodromos.INSERT.portal_prop) rechazado
✅ hipodromos.UPDATE.portal_prop) 0 filas y fixture igual
✅ hipodromos.DELETE.portal_prop) 0 filas y fixture sigue
✅ hipodromos.INSERT.inactivo) rechazado
✅ hipodromos.UPDATE.inactivo) 0 filas y fixture igual
✅ hipodromos.DELETE.inactivo) 0 filas y fixture sigue
✅ hipodromos.INSERT.otroclub) rechazado
✅ hipodromos.UPDATE.otroclub) 0 filas y fixture igual
✅ hipodromos.DELETE.otroclub) 0 filas y fixture sigue
✅ hipodromos.INSERT.secretario) OK
✅ hipodromos.UPDATE.secretario) 1 fila
✅ hipodromos.DELETE.secretario) 1 fila
✅ hipodromos.INSERT.operador) OK
✅ hipodromos.UPDATE.operador) 1 fila
✅ hipodromos.DELETE.operador) 1 fila
✅ hipodromos.INSERT.superadmin) OK
✅ hipodromos.UPDATE.superadmin) 1 fila
✅ hipodromos.DELETE.superadmin) 1 fila
✅ liquidacion_config.INSERT.portal) rechazado
✅ liquidacion_config.UPDATE.portal) 0 filas y fixture igual
✅ liquidacion_config.DELETE.portal) 0 filas y fixture sigue
✅ liquidacion_config.INSERT.portal_prop) rechazado
✅ liquidacion_config.UPDATE.portal_prop) 0 filas y fixture igual
✅ liquidacion_config.DELETE.portal_prop) 0 filas y fixture sigue
✅ liquidacion_config.INSERT.inactivo) rechazado
✅ liquidacion_config.UPDATE.inactivo) 0 filas y fixture igual
✅ liquidacion_config.DELETE.inactivo) 0 filas y fixture sigue
✅ liquidacion_config.INSERT.otroclub) rechazado
✅ liquidacion_config.UPDATE.otroclub) 0 filas y fixture igual
✅ liquidacion_config.DELETE.otroclub) 0 filas y fixture sigue
✅ liquidacion_config.INSERT.secretario) OK
✅ liquidacion_config.UPDATE.secretario) 1 fila
✅ liquidacion_config.DELETE.secretario) 1 fila
✅ liquidacion_config.INSERT.operador) OK
✅ liquidacion_config.UPDATE.operador) 1 fila
✅ liquidacion_config.DELETE.operador) 1 fila
✅ liquidacion_config.INSERT.superadmin) OK
✅ liquidacion_config.UPDATE.superadmin) 1 fila
✅ liquidacion_config.DELETE.superadmin) 1 fila
✅ novedades_reunion.INSERT.portal) rechazado
✅ novedades_reunion.UPDATE.portal) 0 filas y fixture igual
✅ novedades_reunion.DELETE.portal) 0 filas y fixture sigue
✅ novedades_reunion.INSERT.portal_prop) rechazado
✅ novedades_reunion.UPDATE.portal_prop) 0 filas y fixture igual
✅ novedades_reunion.DELETE.portal_prop) 0 filas y fixture sigue
✅ novedades_reunion.INSERT.inactivo) rechazado
✅ novedades_reunion.UPDATE.inactivo) 0 filas y fixture igual
✅ novedades_reunion.DELETE.inactivo) 0 filas y fixture sigue
✅ novedades_reunion.INSERT.otroclub) rechazado
✅ novedades_reunion.UPDATE.otroclub) 0 filas y fixture igual
✅ novedades_reunion.DELETE.otroclub) 0 filas y fixture sigue
✅ novedades_reunion.INSERT.secretario) OK
✅ novedades_reunion.UPDATE.secretario) 1 fila
✅ novedades_reunion.DELETE.secretario) 1 fila
✅ novedades_reunion.INSERT.operador) OK
✅ novedades_reunion.UPDATE.operador) 1 fila
✅ novedades_reunion.DELETE.operador) 1 fila
✅ novedades_reunion.INSERT.superadmin) OK
✅ novedades_reunion.UPDATE.superadmin) 1 fila
✅ novedades_reunion.DELETE.superadmin) 1 fila
✅ resolucion_entidades.INSERT.portal) rechazado
✅ resolucion_entidades.UPDATE.portal) 0 filas y fixture igual
✅ resolucion_entidades.DELETE.portal) 0 filas y fixture sigue
✅ resolucion_entidades.INSERT.portal_prop) rechazado
✅ resolucion_entidades.UPDATE.portal_prop) 0 filas y fixture igual
✅ resolucion_entidades.DELETE.portal_prop) 0 filas y fixture sigue
✅ resolucion_entidades.INSERT.inactivo) rechazado
✅ resolucion_entidades.UPDATE.inactivo) 0 filas y fixture igual
✅ resolucion_entidades.DELETE.inactivo) 0 filas y fixture sigue
✅ resolucion_entidades.INSERT.otroclub) rechazado
✅ resolucion_entidades.UPDATE.otroclub) 0 filas y fixture igual
✅ resolucion_entidades.DELETE.otroclub) 0 filas y fixture sigue
✅ resolucion_entidades.INSERT.secretario) OK
✅ resolucion_entidades.UPDATE.secretario) 1 fila
✅ resolucion_entidades.DELETE.secretario) 1 fila
✅ resolucion_entidades.INSERT.operador) OK
✅ resolucion_entidades.UPDATE.operador) 1 fila
✅ resolucion_entidades.DELETE.operador) 1 fila
✅ resolucion_entidades.INSERT.superadmin) OK
✅ resolucion_entidades.UPDATE.superadmin) 1 fila
✅ resolucion_entidades.DELETE.superadmin) 1 fila
✅ resoluciones.INSERT.portal) rechazado
✅ resoluciones.UPDATE.portal) 0 filas y fixture igual
✅ resoluciones.DELETE.portal) 0 filas y fixture sigue
✅ resoluciones.INSERT.portal_prop) rechazado
✅ resoluciones.UPDATE.portal_prop) 0 filas y fixture igual
✅ resoluciones.DELETE.portal_prop) 0 filas y fixture sigue
✅ resoluciones.INSERT.inactivo) rechazado
✅ resoluciones.UPDATE.inactivo) 0 filas y fixture igual
✅ resoluciones.DELETE.inactivo) 0 filas y fixture sigue
✅ resoluciones.INSERT.otroclub) rechazado
✅ resoluciones.UPDATE.otroclub) 0 filas y fixture igual
✅ resoluciones.DELETE.otroclub) 0 filas y fixture sigue
✅ resoluciones.INSERT.secretario) OK
✅ resoluciones.UPDATE.secretario) 1 fila
✅ resoluciones.DELETE.secretario) 1 fila
✅ resoluciones.INSERT.operador) OK
✅ resoluciones.UPDATE.operador) 1 fila
✅ resoluciones.DELETE.operador) 1 fila
✅ resoluciones.INSERT.superadmin) OK
✅ resoluciones.UPDATE.superadmin) 1 fila
✅ resoluciones.DELETE.superadmin) 1 fila
✅ resultado_apuestas.INSERT.portal) rechazado
✅ resultado_apuestas.UPDATE.portal) 0 filas y fixture igual
✅ resultado_apuestas.DELETE.portal) 0 filas y fixture sigue
✅ resultado_apuestas.INSERT.portal_prop) rechazado
✅ resultado_apuestas.UPDATE.portal_prop) 0 filas y fixture igual
✅ resultado_apuestas.DELETE.portal_prop) 0 filas y fixture sigue
✅ resultado_apuestas.INSERT.inactivo) rechazado
✅ resultado_apuestas.UPDATE.inactivo) 0 filas y fixture igual
✅ resultado_apuestas.DELETE.inactivo) 0 filas y fixture sigue
✅ resultado_apuestas.INSERT.otroclub) rechazado
✅ resultado_apuestas.UPDATE.otroclub) 0 filas y fixture igual
✅ resultado_apuestas.DELETE.otroclub) 0 filas y fixture sigue
✅ resultado_apuestas.INSERT.secretario) OK
✅ resultado_apuestas.UPDATE.secretario) 1 fila
✅ resultado_apuestas.DELETE.secretario) 1 fila
✅ resultado_apuestas.INSERT.operador) OK
✅ resultado_apuestas.UPDATE.operador) 1 fila
✅ resultado_apuestas.DELETE.operador) 1 fila
✅ resultado_apuestas.INSERT.superadmin) OK
✅ resultado_apuestas.UPDATE.superadmin) 1 fila
✅ resultado_apuestas.DELETE.superadmin) 1 fila
✅ resultado_log.INSERT.portal) rechazado
✅ resultado_log.UPDATE.portal) 0 filas y fixture igual
✅ resultado_log.DELETE.portal) 0 filas y fixture sigue
✅ resultado_log.INSERT.portal_prop) rechazado
✅ resultado_log.UPDATE.portal_prop) 0 filas y fixture igual
✅ resultado_log.DELETE.portal_prop) 0 filas y fixture sigue
✅ resultado_log.INSERT.inactivo) rechazado
✅ resultado_log.UPDATE.inactivo) 0 filas y fixture igual
✅ resultado_log.DELETE.inactivo) 0 filas y fixture sigue
✅ resultado_log.INSERT.otroclub) rechazado
✅ resultado_log.UPDATE.otroclub) 0 filas y fixture igual
✅ resultado_log.DELETE.otroclub) 0 filas y fixture sigue
✅ resultado_log.INSERT.secretario) OK
✅ resultado_log.UPDATE.secretario) 1 fila
✅ resultado_log.DELETE.secretario) 1 fila
✅ resultado_log.INSERT.operador) OK
✅ resultado_log.UPDATE.operador) 1 fila
✅ resultado_log.DELETE.operador) 1 fila
✅ resultado_log.INSERT.superadmin) OK
✅ resultado_log.UPDATE.superadmin) 1 fila
✅ resultado_log.DELETE.superadmin) 1 fila

MATRIZ: 281/281
💀 muere M-caballeriza_responsables (política de hoy sólo en esa tabla) — 6/21 en rojo, todos de perfiles de portal: caballeriza_responsables.INSERT.portal) rechazado | caballeriza_responsables.UPDATE.portal) 0 filas y fixture igual | caballeriza_responsables.DELETE.portal) 0 filas y fixture sigue | caballeriza_responsables.INSERT.portal_prop) rechazado | caballeriza_responsables.UPDATE.portal_prop) 0 filas y fixture igual | caballeriza_responsables.DELETE.portal_prop) 0 filas y fixture sigue
💀 muere M-carrera_apuestas (política de hoy sólo en esa tabla) — 6/21 en rojo, todos de perfiles de portal: carrera_apuestas.INSERT.portal) rechazado | carrera_apuestas.UPDATE.portal) 0 filas y fixture igual | carrera_apuestas.DELETE.portal) 0 filas y fixture sigue | carrera_apuestas.INSERT.portal_prop) rechazado | carrera_apuestas.UPDATE.portal_prop) 0 filas y fixture igual | carrera_apuestas.DELETE.portal_prop) 0 filas y fixture sigue
💀 muere M-categorias_carrera (política de hoy sólo en esa tabla) — 6/21 en rojo, todos de perfiles de portal: categorias_carrera.INSERT.portal) rechazado | categorias_carrera.UPDATE.portal) 0 filas y fixture igual | categorias_carrera.DELETE.portal) 0 filas y fixture sigue | categorias_carrera.INSERT.portal_prop) rechazado | categorias_carrera.UPDATE.portal_prop) 0 filas y fixture igual | categorias_carrera.DELETE.portal_prop) 0 filas y fixture sigue
💀 muere M-club_configuracion (política de hoy sólo en esa tabla) — 6/21 en rojo, todos de perfiles de portal: club_configuracion.INSERT.portal) rechazado | club_configuracion.UPDATE.portal) 0 filas y fixture igual | club_configuracion.DELETE.portal) 0 filas y fixture sigue | club_configuracion.INSERT.portal_prop) rechazado | club_configuracion.UPDATE.portal_prop) 0 filas y fixture igual | club_configuracion.DELETE.portal_prop) 0 filas y fixture sigue
💀 muere M-club_secuencias (política de hoy sólo en esa tabla) — 6/21 en rojo, todos de perfiles de portal: club_secuencias.INSERT.portal) rechazado | club_secuencias.UPDATE.portal) 0 filas y fixture igual | club_secuencias.DELETE.portal) 0 filas y fixture sigue | club_secuencias.INSERT.portal_prop) rechazado | club_secuencias.UPDATE.portal_prop) 0 filas y fixture igual | club_secuencias.DELETE.portal_prop) 0 filas y fixture sigue
💀 muere M-clubs (política de hoy sólo en esa tabla) — 2/8 en rojo, todos de perfiles de portal: clubs.UPDATE.portal) Dolores (no-op): 0 filas | clubs.UPDATE.portal_prop) Dolores (no-op): 0 filas
💀 muere M-comision_config (política de hoy sólo en esa tabla) — 6/21 en rojo, todos de perfiles de portal: comision_config.INSERT.portal) rechazado | comision_config.UPDATE.portal) 0 filas y fixture igual | comision_config.DELETE.portal) 0 filas y fixture sigue | comision_config.INSERT.portal_prop) rechazado | comision_config.UPDATE.portal_prop) 0 filas y fixture igual | comision_config.DELETE.portal_prop) 0 filas y fixture sigue
💀 muere M-hipodromos (política de hoy sólo en esa tabla) — 6/21 en rojo, todos de perfiles de portal: hipodromos.INSERT.portal) rechazado | hipodromos.UPDATE.portal) 0 filas y fixture igual | hipodromos.DELETE.portal) 0 filas y fixture sigue | hipodromos.INSERT.portal_prop) rechazado | hipodromos.UPDATE.portal_prop) 0 filas y fixture igual | hipodromos.DELETE.portal_prop) 0 filas y fixture sigue
💀 muere M-liquidacion_config (política de hoy sólo en esa tabla) — 6/21 en rojo, todos de perfiles de portal: liquidacion_config.INSERT.portal) rechazado | liquidacion_config.UPDATE.portal) 0 filas y fixture igual | liquidacion_config.DELETE.portal) 0 filas y fixture sigue | liquidacion_config.INSERT.portal_prop) rechazado | liquidacion_config.UPDATE.portal_prop) 0 filas y fixture igual | liquidacion_config.DELETE.portal_prop) 0 filas y fixture sigue
💀 muere M-novedades_reunion (política de hoy sólo en esa tabla) — 6/21 en rojo, todos de perfiles de portal: novedades_reunion.INSERT.portal) rechazado | novedades_reunion.UPDATE.portal) 0 filas y fixture igual | novedades_reunion.DELETE.portal) 0 filas y fixture sigue | novedades_reunion.INSERT.portal_prop) rechazado | novedades_reunion.UPDATE.portal_prop) 0 filas y fixture igual | novedades_reunion.DELETE.portal_prop) 0 filas y fixture sigue
💀 muere M-resolucion_entidades (política de hoy sólo en esa tabla) — 6/21 en rojo, todos de perfiles de portal: resolucion_entidades.INSERT.portal) rechazado | resolucion_entidades.UPDATE.portal) 0 filas y fixture igual | resolucion_entidades.DELETE.portal) 0 filas y fixture sigue | resolucion_entidades.INSERT.portal_prop) rechazado | resolucion_entidades.UPDATE.portal_prop) 0 filas y fixture igual | resolucion_entidades.DELETE.portal_prop) 0 filas y fixture sigue
💀 muere M-resoluciones (política de hoy sólo en esa tabla) — 6/21 en rojo, todos de perfiles de portal: resoluciones.INSERT.portal) rechazado | resoluciones.UPDATE.portal) 0 filas y fixture igual | resoluciones.DELETE.portal) 0 filas y fixture sigue | resoluciones.INSERT.portal_prop) rechazado | resoluciones.UPDATE.portal_prop) 0 filas y fixture igual | resoluciones.DELETE.portal_prop) 0 filas y fixture sigue
💀 muere M-resultado_apuestas (política de hoy sólo en esa tabla) — 6/21 en rojo, todos de perfiles de portal: resultado_apuestas.INSERT.portal) rechazado | resultado_apuestas.UPDATE.portal) 0 filas y fixture igual | resultado_apuestas.DELETE.portal) 0 filas y fixture sigue | resultado_apuestas.INSERT.portal_prop) rechazado | resultado_apuestas.UPDATE.portal_prop) 0 filas y fixture igual | resultado_apuestas.DELETE.portal_prop) 0 filas y fixture sigue
💀 muere M-resultado_log (política de hoy sólo en esa tabla) — 6/21 en rojo, todos de perfiles de portal: resultado_log.INSERT.portal) rechazado | resultado_log.UPDATE.portal) 0 filas y fixture igual | resultado_log.DELETE.portal) 0 filas y fixture sigue | resultado_log.INSERT.portal_prop) rechazado | resultado_log.UPDATE.portal_prop) 0 filas y fixture igual | resultado_log.DELETE.portal_prop) 0 filas y fixture sigue
MUTANTES: 14/14 muertos
✅ Z) limpieza por estado: {"resolucion_entidades":0,"resoluciones":0,"caballeriza_responsables":0,"carrera_apuestas":0,"categorias_carrera":0,"club_configuracion":0,"club_secuencias":0,"comision_config":0,"hipodromos":0,"liquidacion_config":0,"novedades_reunion":0,"resultado_apuestas":0,"resultado_log":0,"caballerizas":0,"usuarios":0} · filas reales (clubs Dolores, liquidacion_config activa, club_secuencias) idénticas a la foto: true
```

### 3.c Prod, después de aplicar (corrida final)

```
$ set -a; . ./.env; set +a
$ node tests/probe_politicas_escritura_staff.mjs --prod
```
```
contexto: RUN=PROBE-093-1790541409174 · PROD · 7 perfiles con sesión real · pool apuestas=39
✅ caballeriza_responsables.INSERT.portal) rechazado
✅ caballeriza_responsables.UPDATE.portal) 0 filas y fixture igual
✅ caballeriza_responsables.DELETE.portal) 0 filas y fixture sigue
✅ caballeriza_responsables.INSERT.portal_prop) rechazado
✅ caballeriza_responsables.UPDATE.portal_prop) 0 filas y fixture igual
✅ caballeriza_responsables.DELETE.portal_prop) 0 filas y fixture sigue
✅ caballeriza_responsables.INSERT.inactivo) rechazado
✅ caballeriza_responsables.UPDATE.inactivo) 0 filas y fixture igual
✅ caballeriza_responsables.DELETE.inactivo) 0 filas y fixture sigue
✅ caballeriza_responsables.INSERT.otroclub) rechazado
✅ caballeriza_responsables.UPDATE.otroclub) 0 filas y fixture igual
✅ caballeriza_responsables.DELETE.otroclub) 0 filas y fixture sigue
✅ caballeriza_responsables.INSERT.secretario) OK
✅ caballeriza_responsables.UPDATE.secretario) 1 fila
✅ caballeriza_responsables.DELETE.secretario) 1 fila
✅ caballeriza_responsables.INSERT.operador) OK
✅ caballeriza_responsables.UPDATE.operador) 1 fila
✅ caballeriza_responsables.DELETE.operador) 1 fila
✅ caballeriza_responsables.INSERT.superadmin) OK
✅ caballeriza_responsables.UPDATE.superadmin) 1 fila
✅ caballeriza_responsables.DELETE.superadmin) 1 fila
✅ carrera_apuestas.INSERT.portal) rechazado
✅ carrera_apuestas.UPDATE.portal) 0 filas y fixture igual
✅ carrera_apuestas.DELETE.portal) 0 filas y fixture sigue
✅ carrera_apuestas.INSERT.portal_prop) rechazado
✅ carrera_apuestas.UPDATE.portal_prop) 0 filas y fixture igual
✅ carrera_apuestas.DELETE.portal_prop) 0 filas y fixture sigue
✅ carrera_apuestas.INSERT.inactivo) rechazado
✅ carrera_apuestas.UPDATE.inactivo) 0 filas y fixture igual
✅ carrera_apuestas.DELETE.inactivo) 0 filas y fixture sigue
✅ carrera_apuestas.INSERT.otroclub) rechazado
✅ carrera_apuestas.UPDATE.otroclub) 0 filas y fixture igual
✅ carrera_apuestas.DELETE.otroclub) 0 filas y fixture sigue
✅ carrera_apuestas.INSERT.secretario) OK
✅ carrera_apuestas.UPDATE.secretario) 1 fila
✅ carrera_apuestas.DELETE.secretario) 1 fila
✅ carrera_apuestas.INSERT.operador) OK
✅ carrera_apuestas.UPDATE.operador) 1 fila
✅ carrera_apuestas.DELETE.operador) 1 fila
✅ carrera_apuestas.INSERT.superadmin) OK
✅ carrera_apuestas.UPDATE.superadmin) 1 fila
✅ carrera_apuestas.DELETE.superadmin) 1 fila
✅ categorias_carrera.INSERT.portal) rechazado
✅ categorias_carrera.UPDATE.portal) 0 filas y fixture igual
✅ categorias_carrera.DELETE.portal) 0 filas y fixture sigue
✅ categorias_carrera.INSERT.portal_prop) rechazado
✅ categorias_carrera.UPDATE.portal_prop) 0 filas y fixture igual
✅ categorias_carrera.DELETE.portal_prop) 0 filas y fixture sigue
✅ categorias_carrera.INSERT.inactivo) rechazado
✅ categorias_carrera.UPDATE.inactivo) 0 filas y fixture igual
✅ categorias_carrera.DELETE.inactivo) 0 filas y fixture sigue
✅ categorias_carrera.INSERT.otroclub) rechazado
✅ categorias_carrera.UPDATE.otroclub) 0 filas y fixture igual
✅ categorias_carrera.DELETE.otroclub) 0 filas y fixture sigue
✅ categorias_carrera.INSERT.secretario) OK
✅ categorias_carrera.UPDATE.secretario) 1 fila
✅ categorias_carrera.DELETE.secretario) 1 fila
✅ categorias_carrera.INSERT.operador) OK
✅ categorias_carrera.UPDATE.operador) 1 fila
✅ categorias_carrera.DELETE.operador) 1 fila
✅ categorias_carrera.INSERT.superadmin) OK
✅ categorias_carrera.UPDATE.superadmin) 1 fila
✅ categorias_carrera.DELETE.superadmin) 1 fila
✅ club_configuracion.INSERT.portal) rechazado
✅ club_configuracion.UPDATE.portal) 0 filas y fixture igual
✅ club_configuracion.DELETE.portal) 0 filas y fixture sigue
✅ club_configuracion.INSERT.portal_prop) rechazado
✅ club_configuracion.UPDATE.portal_prop) 0 filas y fixture igual
✅ club_configuracion.DELETE.portal_prop) 0 filas y fixture sigue
✅ club_configuracion.INSERT.inactivo) rechazado
✅ club_configuracion.UPDATE.inactivo) 0 filas y fixture igual
✅ club_configuracion.DELETE.inactivo) 0 filas y fixture sigue
✅ club_configuracion.INSERT.otroclub) rechazado
✅ club_configuracion.UPDATE.otroclub) 0 filas y fixture igual
✅ club_configuracion.DELETE.otroclub) 0 filas y fixture sigue
✅ club_configuracion.INSERT.secretario) OK
✅ club_configuracion.UPDATE.secretario) 1 fila
✅ club_configuracion.DELETE.secretario) 1 fila
✅ club_configuracion.INSERT.operador) OK
✅ club_configuracion.UPDATE.operador) 1 fila
✅ club_configuracion.DELETE.operador) 1 fila
✅ club_configuracion.INSERT.superadmin) OK
✅ club_configuracion.UPDATE.superadmin) 1 fila
✅ club_configuracion.DELETE.superadmin) 1 fila
✅ club_secuencias.INSERT.portal) rechazado
✅ club_secuencias.UPDATE.portal) 0 filas y fixture igual
✅ club_secuencias.DELETE.portal) 0 filas y fixture sigue
✅ club_secuencias.INSERT.portal_prop) rechazado
✅ club_secuencias.UPDATE.portal_prop) 0 filas y fixture igual
✅ club_secuencias.DELETE.portal_prop) 0 filas y fixture sigue
✅ club_secuencias.INSERT.inactivo) rechazado
✅ club_secuencias.UPDATE.inactivo) 0 filas y fixture igual
✅ club_secuencias.DELETE.inactivo) 0 filas y fixture sigue
✅ club_secuencias.INSERT.otroclub) rechazado
✅ club_secuencias.UPDATE.otroclub) 0 filas y fixture igual
✅ club_secuencias.DELETE.otroclub) 0 filas y fixture sigue
✅ club_secuencias.INSERT.secretario) OK
✅ club_secuencias.UPDATE.secretario) 1 fila
✅ club_secuencias.DELETE.secretario) 1 fila
✅ club_secuencias.INSERT.operador) OK
✅ club_secuencias.UPDATE.operador) 1 fila
✅ club_secuencias.DELETE.operador) 1 fila
✅ club_secuencias.INSERT.superadmin) OK
✅ club_secuencias.UPDATE.superadmin) 1 fila
✅ club_secuencias.DELETE.superadmin) 1 fila
✅ clubs.UPDATE.portal) Dolores (no-op): 0 filas
✅ clubs.UPDATE.portal_prop) Dolores (no-op): 0 filas
✅ clubs.UPDATE.inactivo) Dolores (no-op): 0 filas
✅ clubs.UPDATE.otroclub) Dolores (no-op): 0 filas
✅ clubs.UPDATE.secretario) Dolores (no-op): 1 fila
✅ clubs.UPDATE.operador) Dolores (no-op): 1 fila
✅ clubs.UPDATE.superadmin) Dolores (no-op): 1 fila
✅ clubs) Dolores sin cambios de contenido (sólo updated_at)
✅ comision_config.INSERT.portal) rechazado
✅ comision_config.UPDATE.portal) 0 filas y fixture igual
✅ comision_config.DELETE.portal) 0 filas y fixture sigue
✅ comision_config.INSERT.portal_prop) rechazado
✅ comision_config.UPDATE.portal_prop) 0 filas y fixture igual
✅ comision_config.DELETE.portal_prop) 0 filas y fixture sigue
✅ comision_config.INSERT.inactivo) rechazado
✅ comision_config.UPDATE.inactivo) 0 filas y fixture igual
✅ comision_config.DELETE.inactivo) 0 filas y fixture sigue
✅ comision_config.INSERT.otroclub) rechazado
✅ comision_config.UPDATE.otroclub) 0 filas y fixture igual
✅ comision_config.DELETE.otroclub) 0 filas y fixture sigue
✅ comision_config.INSERT.secretario) OK
✅ comision_config.UPDATE.secretario) 1 fila
✅ comision_config.DELETE.secretario) 1 fila
✅ comision_config.INSERT.operador) OK
✅ comision_config.UPDATE.operador) 1 fila
✅ comision_config.DELETE.operador) 1 fila
✅ comision_config.INSERT.superadmin) OK
✅ comision_config.UPDATE.superadmin) 1 fila
✅ comision_config.DELETE.superadmin) 1 fila
✅ hipodromos.INSERT.portal) rechazado
✅ hipodromos.UPDATE.portal) 0 filas y fixture igual
✅ hipodromos.DELETE.portal) 0 filas y fixture sigue
✅ hipodromos.INSERT.portal_prop) rechazado
✅ hipodromos.UPDATE.portal_prop) 0 filas y fixture igual
✅ hipodromos.DELETE.portal_prop) 0 filas y fixture sigue
✅ hipodromos.INSERT.inactivo) rechazado
✅ hipodromos.UPDATE.inactivo) 0 filas y fixture igual
✅ hipodromos.DELETE.inactivo) 0 filas y fixture sigue
✅ hipodromos.INSERT.otroclub) rechazado
✅ hipodromos.UPDATE.otroclub) 0 filas y fixture igual
✅ hipodromos.DELETE.otroclub) 0 filas y fixture sigue
✅ hipodromos.INSERT.secretario) OK
✅ hipodromos.UPDATE.secretario) 1 fila
✅ hipodromos.DELETE.secretario) 1 fila
✅ hipodromos.INSERT.operador) OK
✅ hipodromos.UPDATE.operador) 1 fila
✅ hipodromos.DELETE.operador) 1 fila
✅ hipodromos.INSERT.superadmin) OK
✅ hipodromos.UPDATE.superadmin) 1 fila
✅ hipodromos.DELETE.superadmin) 1 fila
✅ liquidacion_config.INSERT.portal) rechazado
✅ liquidacion_config.UPDATE.portal) 0 filas y fixture igual
✅ liquidacion_config.DELETE.portal) 0 filas y fixture sigue
✅ liquidacion_config.INSERT.portal_prop) rechazado
✅ liquidacion_config.UPDATE.portal_prop) 0 filas y fixture igual
✅ liquidacion_config.DELETE.portal_prop) 0 filas y fixture sigue
✅ liquidacion_config.INSERT.inactivo) rechazado
✅ liquidacion_config.UPDATE.inactivo) 0 filas y fixture igual
✅ liquidacion_config.DELETE.inactivo) 0 filas y fixture sigue
✅ liquidacion_config.INSERT.otroclub) rechazado
✅ liquidacion_config.UPDATE.otroclub) 0 filas y fixture igual
✅ liquidacion_config.DELETE.otroclub) 0 filas y fixture sigue
✅ liquidacion_config.INSERT.secretario) OK
✅ liquidacion_config.UPDATE.secretario) 1 fila
✅ liquidacion_config.DELETE.secretario) 1 fila
✅ liquidacion_config.INSERT.operador) OK
✅ liquidacion_config.UPDATE.operador) 1 fila
✅ liquidacion_config.DELETE.operador) 1 fila
✅ liquidacion_config.INSERT.superadmin) OK
✅ liquidacion_config.UPDATE.superadmin) 1 fila
✅ liquidacion_config.DELETE.superadmin) 1 fila
✅ novedades_reunion.INSERT.portal) rechazado
✅ novedades_reunion.UPDATE.portal) 0 filas y fixture igual
✅ novedades_reunion.DELETE.portal) 0 filas y fixture sigue
✅ novedades_reunion.INSERT.portal_prop) rechazado
✅ novedades_reunion.UPDATE.portal_prop) 0 filas y fixture igual
✅ novedades_reunion.DELETE.portal_prop) 0 filas y fixture sigue
✅ novedades_reunion.INSERT.inactivo) rechazado
✅ novedades_reunion.UPDATE.inactivo) 0 filas y fixture igual
✅ novedades_reunion.DELETE.inactivo) 0 filas y fixture sigue
✅ novedades_reunion.INSERT.otroclub) rechazado
✅ novedades_reunion.UPDATE.otroclub) 0 filas y fixture igual
✅ novedades_reunion.DELETE.otroclub) 0 filas y fixture sigue
✅ novedades_reunion.INSERT.secretario) OK
✅ novedades_reunion.UPDATE.secretario) 1 fila
✅ novedades_reunion.DELETE.secretario) 1 fila
✅ novedades_reunion.INSERT.operador) OK
✅ novedades_reunion.UPDATE.operador) 1 fila
✅ novedades_reunion.DELETE.operador) 1 fila
✅ novedades_reunion.INSERT.superadmin) OK
✅ novedades_reunion.UPDATE.superadmin) 1 fila
✅ novedades_reunion.DELETE.superadmin) 1 fila
✅ resolucion_entidades.INSERT.portal) rechazado
✅ resolucion_entidades.UPDATE.portal) 0 filas y fixture igual
✅ resolucion_entidades.DELETE.portal) 0 filas y fixture sigue
✅ resolucion_entidades.INSERT.portal_prop) rechazado
✅ resolucion_entidades.UPDATE.portal_prop) 0 filas y fixture igual
✅ resolucion_entidades.DELETE.portal_prop) 0 filas y fixture sigue
✅ resolucion_entidades.INSERT.inactivo) rechazado
✅ resolucion_entidades.UPDATE.inactivo) 0 filas y fixture igual
✅ resolucion_entidades.DELETE.inactivo) 0 filas y fixture sigue
✅ resolucion_entidades.INSERT.otroclub) rechazado
✅ resolucion_entidades.UPDATE.otroclub) 0 filas y fixture igual
✅ resolucion_entidades.DELETE.otroclub) 0 filas y fixture sigue
✅ resolucion_entidades.INSERT.secretario) OK
✅ resolucion_entidades.UPDATE.secretario) 1 fila
✅ resolucion_entidades.DELETE.secretario) 1 fila
✅ resolucion_entidades.INSERT.operador) OK
✅ resolucion_entidades.UPDATE.operador) 1 fila
✅ resolucion_entidades.DELETE.operador) 1 fila
✅ resolucion_entidades.INSERT.superadmin) OK
✅ resolucion_entidades.UPDATE.superadmin) 1 fila
✅ resolucion_entidades.DELETE.superadmin) 1 fila
✅ resoluciones.INSERT.portal) rechazado
✅ resoluciones.UPDATE.portal) 0 filas y fixture igual
✅ resoluciones.DELETE.portal) 0 filas y fixture sigue
✅ resoluciones.INSERT.portal_prop) rechazado
✅ resoluciones.UPDATE.portal_prop) 0 filas y fixture igual
✅ resoluciones.DELETE.portal_prop) 0 filas y fixture sigue
✅ resoluciones.INSERT.inactivo) rechazado
✅ resoluciones.UPDATE.inactivo) 0 filas y fixture igual
✅ resoluciones.DELETE.inactivo) 0 filas y fixture sigue
✅ resoluciones.INSERT.otroclub) rechazado
✅ resoluciones.UPDATE.otroclub) 0 filas y fixture igual
✅ resoluciones.DELETE.otroclub) 0 filas y fixture sigue
✅ resoluciones.INSERT.secretario) OK
✅ resoluciones.UPDATE.secretario) 1 fila
✅ resoluciones.DELETE.secretario) 1 fila
✅ resoluciones.INSERT.operador) OK
✅ resoluciones.UPDATE.operador) 1 fila
✅ resoluciones.DELETE.operador) 1 fila
✅ resoluciones.INSERT.superadmin) OK
✅ resoluciones.UPDATE.superadmin) 1 fila
✅ resoluciones.DELETE.superadmin) 1 fila
✅ resultado_apuestas.INSERT.portal) rechazado
✅ resultado_apuestas.UPDATE.portal) 0 filas y fixture igual
✅ resultado_apuestas.DELETE.portal) 0 filas y fixture sigue
✅ resultado_apuestas.INSERT.portal_prop) rechazado
✅ resultado_apuestas.UPDATE.portal_prop) 0 filas y fixture igual
✅ resultado_apuestas.DELETE.portal_prop) 0 filas y fixture sigue
✅ resultado_apuestas.INSERT.inactivo) rechazado
✅ resultado_apuestas.UPDATE.inactivo) 0 filas y fixture igual
✅ resultado_apuestas.DELETE.inactivo) 0 filas y fixture sigue
✅ resultado_apuestas.INSERT.otroclub) rechazado
✅ resultado_apuestas.UPDATE.otroclub) 0 filas y fixture igual
✅ resultado_apuestas.DELETE.otroclub) 0 filas y fixture sigue
✅ resultado_apuestas.INSERT.secretario) OK
✅ resultado_apuestas.UPDATE.secretario) 1 fila
✅ resultado_apuestas.DELETE.secretario) 1 fila
✅ resultado_apuestas.INSERT.operador) OK
✅ resultado_apuestas.UPDATE.operador) 1 fila
✅ resultado_apuestas.DELETE.operador) 1 fila
✅ resultado_apuestas.INSERT.superadmin) OK
✅ resultado_apuestas.UPDATE.superadmin) 1 fila
✅ resultado_apuestas.DELETE.superadmin) 1 fila
✅ resultado_log.INSERT.portal) rechazado
✅ resultado_log.UPDATE.portal) 0 filas y fixture igual
✅ resultado_log.DELETE.portal) 0 filas y fixture sigue
✅ resultado_log.INSERT.portal_prop) rechazado
✅ resultado_log.UPDATE.portal_prop) 0 filas y fixture igual
✅ resultado_log.DELETE.portal_prop) 0 filas y fixture sigue
✅ resultado_log.INSERT.inactivo) rechazado
✅ resultado_log.UPDATE.inactivo) 0 filas y fixture igual
✅ resultado_log.DELETE.inactivo) 0 filas y fixture sigue
✅ resultado_log.INSERT.otroclub) rechazado
✅ resultado_log.UPDATE.otroclub) 0 filas y fixture igual
✅ resultado_log.DELETE.otroclub) 0 filas y fixture sigue
✅ resultado_log.INSERT.secretario) OK
✅ resultado_log.UPDATE.secretario) 1 fila
✅ resultado_log.DELETE.secretario) 1 fila
✅ resultado_log.INSERT.operador) OK
✅ resultado_log.UPDATE.operador) 1 fila
✅ resultado_log.DELETE.operador) 1 fila
✅ resultado_log.INSERT.superadmin) OK
✅ resultado_log.UPDATE.superadmin) 1 fila
✅ resultado_log.DELETE.superadmin) 1 fila

MATRIZ: 281/281
✅ Z) limpieza por estado: {"resolucion_entidades":0,"resoluciones":0,"caballeriza_responsables":0,"carrera_apuestas":0,"categorias_carrera":0,"club_configuracion":0,"club_secuencias":0,"comision_config":0,"hipodromos":0,"liquidacion_config":0,"novedades_reunion":0,"resultado_apuestas":0,"resultado_log":0,"caballerizas":0,"usuarios":0} · filas reales (clubs Dolores, liquidacion_config activa, club_secuencias) idénticas a la foto: true
```

---

## 4. Qué cambió y qué no

- Cambian sólo las 36 políticas de escritura. SELECT intacto, salvo `liquidacion_config_rls` y `club_secuencias_rls`
  (FOR ALL): el portal ya no **lee** esas dos tablas (no las usa).
- No cambia: ninguna pantalla, ninguna función, ningún dato. `aplicar_resultado`, `fn_siguiente_recibo`,
  `rpc_caballeriza_provisorio` (DEFINER) y service_role no pasan por estas políticas.
- `operador` sigue pudiendo escribir `liquidacion_config`/`comision_config` (lo hizo legítimamente el 19/09). Pendiente
  de decisión (Q3).

---

## 5. Pedido aparte: ISSUE-094 (registrado, NO implementado)

`club_secuencias` sin trigger de auditoría. Quedó en `docs/ISSUES.md` como ISSUE-094 con la propuesta y la trampa:
la tabla no tiene `id` (PK `club_id, tipo`) y `fn_auditoria_log` usa `NEW.id`/`OLD.id`, así que el trigger no se puede
enganchar tal cual.

---

## 6. Incidentes de limpieza y residuos

### 6.a Primera corrida en prod: la matriz pasó, la limpieza no

Salida (la corrida se sobrescribió con la segunda; acá van la línea de contexto, el total y todas las líneas que no
fueron ✅ — las 281 celdas fueron ✅):

```
contexto: RUN=PROBE-093-1790541016077 · PROD · 10 perfiles con sesión real · pool apuestas=39

MATRIZ: 281/281
❌ Z) limpieza por estado: {"resolucion_entidades":0,"resoluciones":0,"caballeriza_responsables":0,"carrera_apuestas":0,"categorias_carrera":0,"club_configuracion":0,"club_secuencias":0,"comision_config":0,"hipodromos":0,"liquidacion_config":0,"novedades_reunion":0,"resultado_apuestas":0,"resultado_log":0,"caballerizas":0,"clubs":1,"usuarios":5} · errores: usuarios: update or delete on table "usuarios" violates foreign key constraint "auditoria_usuario_id_fkey" on table "auditoria"; usuarios: update or delete on table "usuarios" violates foreign key constraint "auditoria_usuario_id_fkey" on table "auditoria"; usuarios: update or delete on table "usuarios" violates foreign key constraint "auditoria_usuario_id_fkey" on table "auditoria"; usuarios: update or delete on table "usuarios" violates foreign key constraint "auditoria_usuario_id_fkey" on table "auditoria"; usuarios: update or delete on table "usuarios" violates foreign key constraint "auditoria_usuario_id_fkey" on table "auditoria" · filas reales (clubs Dolores, liquidacion_config activa, club_secuencias) idénticas a la foto: true
```

Esa versión del probe tenía 10 perfiles (3 en un club fixture para probar `clubs`). Los 5 de staff escribieron en tablas
auditadas → sus filas de `auditoria` bloquearon el DELETE. Las cuentas de Auth sí se borraron.

Limpieza manual (service_role):

```
usuarios restantes: secretario_carreras (auth borrado), operador (auth borrado), super_admin (auth borrado), secretario_carreras (auth borrado), operador (auth borrado)
auditoria de esos usuarios: 21 {"categorias_carrera.INSERT":3,"categorias_carrera.UPDATE":3,"categorias_carrera.DELETE":3,"clubs.UPDATE":3,"liquidacion_config.INSERT":3,"liquidacion_config.UPDATE":3,"liquidacion_config.DELETE":3}
→ borradas esas 21 filas de auditoría y los 5 usuarios
→ DELETE del club fixture: ERROR 23503 'update or delete on table "clubs" violates foreign key constraint "auditoria_club_id_fkey" on table "auditoria"'
auditoria con club_id del club fixture: 9 {"clubs.INSERT":1,"usuarios.INSERT":3,"usuarios.DELETE":3,"usuarios.UPDATE":2}
→ borradas esas 9; DELETE del club otra vez: ERROR 23503 'insert or update on table "auditoria" violates foreign key constraint "auditoria_club_id_fkey"'
   (Key (club_id)=(1ebd974e-2d34-4d45-8a68-bf74559bdab0) is not present in table "clubs".)
```

El segundo error es **ISSUE-095**: `fn_auditoria_log` registra la baja de un club con `club_id = OLD.id` y la FK exige
que ese club exista. Consecuencia en prod: **no se puede borrar ningún club** (0 bajas de club en toda la auditoría;
el botón de `admin.html:858` falla siempre).

Referencias al club fixture antes de borrarlo (las 19 FKs que apuntan a `clubs`):

```
club | referencias
1    | 0
```

Borrado acotado:

```sql
begin;
set local session_replication_role = replica;
delete from clubs where id='1ebd974e-2d34-4d45-8a68-bf74559bdab0' and nombre like 'PROBE-093-%';
commit;
select (select count(*) from clubs where nombre like 'PROBE-093-%') clubs_probe, (select count(*) from clubs) clubs_total, current_setting('session_replication_role') srr;
```
```
clubs_probe | clubs_total | srr
0           | 3           | origin
```

Cambios en el probe después de esto: sin club fixture (los positivos de `clubs` pasan a UPDATE no-op sobre Dolores);
la auditoría de los usuarios del probe se borra **antes** que los usuarios (en sandbox, donde no hay tabla
`auditoria`, ese paso se tolera). Segunda corrida: §3.c, limpia.

### 6.b Efectos en prod que quedan (todos esperados)

- `clubs.updated_at` de Dolores = `2026-09-27 20:37:59.205186+00` (los 3 UPDATE no-op de staff del probe; el contenido
  no cambió, la auditoría no registra UPDATE que sólo mueven `updated_at`).
- `auditoria`: filas de los fixtures creados/borrados por service_role (sin usuario), como en el resto de los probes.

### 6.c Consulta de residuos

```sql
select (select count(*) from resultado_apuestas where resultado_id='d0000000-0000-0000-0000-000000000001') apu_t1_tras_rollback,
 (select count(*) from auditoria where (datos_despues::text like '%PROBE-093%' or datos_antes::text like '%PROBE-093%')) auditoria_con_marca,
 (select string_agg(tabla||'.'||accion||'='||n, ', ') from (select tabla, accion, count(*) n from auditoria where (datos_despues::text like '%PROBE-093%' or datos_antes::text like '%PROBE-093%') group by 1,2 order by 1,2) x) detalle,
 (select count(*) from auth.users where email like 'probe-093-%') auth_probe,
 (select count(*) from propietarios where nombre like 'PROBE-093%') propietarios_probe,
 (select updated_at::text from clubs where id='0649e9c5-9e87-4aad-842f-101458e6b33c') dolores_updated_at,
 (select count(*) from spcs) spcs;
```
```
apu_t1_tras_rollback | auditoria_con_marca | detalle                                                                                                   | auth_probe | propietarios_probe | dolores_updated_at            | spcs
0                    | 89                  | categorias_carrera.DELETE=28, categorias_carrera.INSERT=28, usuarios.DELETE=14, usuarios.INSERT=14, usuarios.UPDATE=5 | 0          | 0                  | 2026-09-27 20:37:59.205186+00 | 210
```
```sql
select accion, count(*) from auditoria where tabla='liquidacion_config' and (datos_despues->>'retencion_dgi_pct'='0.093' or datos_antes->>'retencion_dgi_pct'='0.093') group by 1 order by 1;
```
```
accion | count
DELETE | 28
INSERT | 28
```

(Las filas de `liquidacion_config` de prueba se marcan con `retencion_dgi_pct = 0.093`, no con texto.)

---

## Preguntas abiertas

- **Q1** — ¿Merge de PR #21? La migración ya está en prod; el merge sólo versiona los archivos.
- **Q2** — `resultado_log` no se escribe nunca (0 filas, ninguna función la toca). ¿Oficializar debería dejar un log?
  Si sí, es un faltante previo, no algo que este cambio rompió.
- **Q3** — ¿`operador` debe poder cambiar `liquidacion_config`/`comision_config`? Hoy puede (plan base).
- **Q4** — Opción B para `club_secuencias` (sólo super_admin escribe por la API): quedó sin aplicar.
- **Q5** — ISSUE-095 (no se puede borrar un club): ¿se arregla en `fn_auditoria_log` (club_id NULL en la baja de
  clubs) o con `ON DELETE SET NULL` en la FK?
- **Q6** — ISSUE-094: la tabla no tiene `id`; hay que decidir cómo la registra `fn_auditoria_log`.

---

## Verificación de push

```
$ git push -q origin HEAD:reports && git ls-remote origin reports && git rev-parse HEAD
6ad917f7d9165ba3de833feb7625b9f7e70ccce2	refs/heads/reports
6ad917f7d9165ba3de833feb7625b9f7e70ccce2

$ git ls-remote origin fix/politicas-escritura-staff
05f665fa347a24ffcb7719a8604d8ab8d0170a87	refs/heads/fix/politicas-escritura-staff
```

Este apéndice va en un commit posterior de `reports`; su SHA se informa en el chat.
