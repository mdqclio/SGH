# ISSUE-093 — 14 tablas con políticas de escritura sin guard de staff: relevamiento y plan (GATE, SOLO LECTURA)

- Fecha: 2026-09-27
- Código leído en `main` @ `4d95511d4212bb30a7c18fb7a7045d7a2cfe458b` (PR #20 sin mergear, no cambia nada de esto)
- Base: `unlhcuanfrtpatoipwve`, sólo SELECT por MCP. **No se aplicó nada.** No hay rama ni migración
  commiteada: el SQL de abajo es borrador, incluido en el informe.
- Guards: `pwd` → `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` → **210** · ref → `unlhcuanfrtpatoipwve`
- Anonimizado: los actores de la auditoría van por rol, no por nombre ni email.
- Antecedente: `docs/diagnosticos/2026-09-27_xss-nombres-portal.md` (reports `fd0f85b`), sección "Hallazgo grave".

---

## Resumen

| # | Respuesta corta |
|---|---|
| 1 | Toda escritura legítima de las 14 tablas viene de **pantallas del staff** (secretario/operador/super_admin), de **3 RPC SECURITY DEFINER** (dueño `postgres`, RLS no forzada → la política del invocador **no aplica**), de **probes con service_role** (bypass de RLS) o de migraciones. **Ninguna Edge Function escribe en ellas.** 5 tablas no tienen ningún escritor en el código (`club_configuracion`, `novedades_reunion`, `resolucion_entidades`, `resultado_log`; y `club_secuencias` sólo por RPC/probe). |
| 2 | **No se rompe ninguna escritura legítima** si se exige `fn_is_staff()`. `resultado_apuestas` se escribe al oficializar **dentro de `aplicar_resultado` (DEFINER)** → no pasa por la política. `carrera_apuestas` la escribe `programa.html` (staff). `resultado_log` no la escribe nadie (0 filas). Un staff con `activo=false` ya hoy no puede escribir (`fn_get_user_club_id()` exige `activo`), así que tampoco cambia eso. |
| 3 | **Ninguna** la debe escribir un usuario del portal. El portal escribe `inscripciones` sólo por RPC DEFINER (`rpc_inscribir`, `rpc_baja_inscripcion`, `rpc_modificar_inscripcion`), que no están entre estas 14 y no dependen de estas políticas. |
| 4 | **No hay evidencia de explotación.** Auditoría de `liquidacion_config`, `clubs`, `categorias_carrera`: 18 eventos, todos de super_admin, secretario, operador o sin usuario (migración/MCP). Ninguno de un usuario del portal. `liquidacion_config` hoy = **60.000 jockey / 10.000 entrenador**, igual a lo definido por Fede (60.000 desde el 19/09). **Pero** 11 de las 14 tablas **no tienen trigger de auditoría** (incluida `club_secuencias`) y los logs de API no están disponibles → para esas no se puede probar que no pasó; sólo que los datos no muestran anomalías (la secuencia de recibos de Dolores es consistente). |
| 5 | Plan: una migración con las 36 políticas reescritas a `fn_is_super_admin() OR (fn_is_staff() AND <club>)`, rollback exacto generado desde `pg_policy` y verificado **36/36 md5**, y probe con usuario de portal sintético que intenta INSERT/UPDATE/DELETE en las 14 + controles positivos de staff. Detalle abajo. |

---

## 1. Quién escribe hoy cada tabla

### 1.a Front (pantallas)

Búsqueda de `.from('<tabla>')` seguido de `.insert/.update/.upsert/.delete` en `*.html`, `*.js`,
`supabase/functions/*/index.ts` (excluidos `mockup-*` y `resultados_legacy.html`):

```bash
for t in <14 tablas>; do grep -n "['\"\`]$t['\"\`]" *.html *.js supabase/functions/*/index.ts | grep -v "^mockup\|^resultados_legacy"; done
```

Escrituras encontradas (las lecturas se omiten de esta tabla; la salida completa del grep está en el Anexo A):

| Tabla | Archivo:línea | Operación | Quién llega a esa pantalla |
|---|---|---|---|
| `caballeriza_responsables` | `caballerizas.html:578` | insert | staff (menú Registros) |
| | `caballerizas.html:748` | delete | staff |
| `carrera_apuestas` | `programa.html:603` | delete (por carrera) | staff (Operaciones → Programa) |
| | `programa.html:617` | insert | staff |
| `categorias_carrera` | `categorias.html:251` | insert / update | staff |
| | `categorias.html:259` | delete | staff |
| | `admin.html:596` | insert (4 categorías al dar de alta un club) | super_admin (alta de hipódromo) |
| `clubs` | `admin.html:559` | insert | super_admin (política `clubs_insert` ya es sólo super_admin) |
| | `admin.html:803` | update ("Mi Hipódromo" / edición) | super_admin y secretario/operador en "Mi Hipódromo" |
| | `admin.html:849` | update `activo` | super_admin |
| | `admin.html:858` | delete | super_admin (política `clubs_delete` ya es sólo super_admin) |
| `comision_config` | `liquidaciones.html:2530/2531` | update / insert | staff (Liquidaciones → config) |
| | `liquidaciones.html:2541` | delete | staff |
| `hipodromos` | `hipodromos.html:197` | insert / update | staff |
| | `hipodromos.html:204` | delete | staff |
| `liquidacion_config` | `liquidaciones.html:665/666` | update / insert | staff (Liquidaciones → config) |
| `resoluciones` | `resoluciones.html:273, 316/317` | update / insert | staff |
| | `resoluciones.html:327` | delete | staff |
| `club_configuracion` | — | ninguna | — |
| `club_secuencias` | — | ninguna directa | — |
| `novedades_reunion` | — | ninguna | — |
| `resolucion_entidades` | — | ninguna | — |
| `resultado_apuestas` | — | ninguna directa (sólo lecturas en `resultados.html:557, 1346`) | — |
| `resultado_log` | — | ninguna | — |

`portal.html:1268` **lee** `caballeriza_responsables` (no escribe). `liquidaciones-engine.js:117/127` **lee**
`liquidacion_config` y `comision_config`. `reunion-json` (Edge Function) **lee** `categorias_carrera` e `hipodromos`.
`invite-user` y `studbook-buscar` no tocan ninguna de las 14.

Qué roles llegan a esas pantallas: `index.html` muestra el mismo menú de Operaciones/Registros/Administración a
`secretario_carreras`, `operador` y cualquier rol con club que no sea portal (rama `else`, línea 361); el portal
(`propietario`/`profesional`) va a `portal.html` (línea 301). Ninguna de esas pantallas chequea rol en su
`initAuth`, pero eso es navegación: la barrera real es la política.

### 1.b Funciones en la base

```sql
with t(tabla) as (values ('caballeriza_responsables'),('carrera_apuestas'),('categorias_carrera'),('club_configuracion'),('club_secuencias'),('clubs'),('comision_config'),('hipodromos'),('liquidacion_config'),('novedades_reunion'),('resolucion_entidades'),('resoluciones'),('resultado_apuestas'),('resultado_log'))
select t.tabla, p.proname, p.prosecdef secdef,
 array(select rolname from pg_roles r where has_function_privilege(r.oid,p.oid,'EXECUTE') and rolname in ('anon','authenticated','service_role')) exec,
 (p.prosrc ~* ('(insert\s+into|update|delete\s+from)\s+(public\.)?'||t.tabla||'\M')) escribe
from t join pg_proc p on p.prosrc ~* ('\m'||t.tabla||'\M') join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
order by 1,2;
```
```
tabla                    | proname                        | secdef | exec                                 | escribe
caballeriza_responsables | fn_inscripcion_set_propietario | true   | {service_role}                       | false
caballeriza_responsables | rpc_caballeriza_provisorio     | true   | {authenticated,service_role}         | true
caballeriza_responsables | rpc_modificar_inscripcion      | true   | {authenticated,service_role}         | false
club_secuencias          | fn_siguiente_recibo            | true   | {authenticated,service_role}         | true
clubs                    | fn_auditoria_log               | true   | {service_role}                       | false
clubs                    | fn_purgar_auditoria            | true   | {service_role}                       | false
clubs                    | rpc_solicitar_acceso           | true   | {authenticated,anon,service_role}    | false
resoluciones             | fn_club_de_resolucion          | true   | {authenticated,anon,service_role}    | false
resultado_apuestas       | aplicar_resultado              | true   | {authenticated,service_role}         | true
```

Las tres que escriben son SECURITY DEFINER con dueño `postgres`, y ninguna de las tablas tiene RLS forzada:

```sql
select p.proname, pg_get_userbyid(p.proowner) owner, p.prosecdef,
 (select string_agg(distinct c.relname||':'||pg_get_userbyid(c.relowner)||':force='||c.relforcerowsecurity, ', ') from pg_class c where c.relname in ('resultado_apuestas','club_secuencias','caballeriza_responsables')) tablas
from pg_proc p where p.proname in ('aplicar_resultado','fn_siguiente_recibo','rpc_caballeriza_provisorio');
```
```
proname                    | owner    | prosecdef | tablas
aplicar_resultado          | postgres | true      | caballeriza_responsables:postgres:force=false, club_secuencias:postgres:force=false, resultado_apuestas:postgres:force=false
fn_siguiente_recibo        | postgres | true      | caballeriza_responsables:postgres:force=false, club_secuencias:postgres:force=false, resultado_apuestas:postgres:force=false
rpc_caballeriza_provisorio | postgres | true      | caballeriza_responsables:postgres:force=false, club_secuencias:postgres:force=false, resultado_apuestas:postgres:force=false
```

→ dueño de tabla sin FORCE = bypass de RLS. Estas tres **no se enteran** del cambio de políticas. Además cada una ya
tiene su propio guard de staff (Guard 0 del 22–23/09 en `aplicar_resultado` y `fn_siguiente_recibo`;
`rpc_caballeriza_provisorio` referencia `fn_is_staff`/`fn_is_super_admin` en su cuerpo — verificado por
`position('fn_is_staff' in prosrc)>0` → `true`).

Triggers (ninguno escribe en otra de las 14):

```sql
select c.relname tabla, t.tgname, pg_get_triggerdef(t.oid) def, c.relrowsecurity rls, c.relforcerowsecurity force
from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
left join pg_trigger t on t.tgrelid=c.oid and not t.tgisinternal
where c.relname in (<14>) order by 1,2;
```
```
tabla                    | tgname                       | def                                                                                                                                                                                | rls  | force
caballeriza_responsables | trg_cab_resp_set_propietario | CREATE TRIGGER trg_cab_resp_set_propietario BEFORE INSERT OR UPDATE OF rol, documento_tipo, documento_nro, caballeriza_id ON public.caballeriza_responsables FOR EACH ROW EXECUTE FUNCTION fn_caballeriza_resp_set_propietario() | true | false
carrera_apuestas         | null                         | null                                                                                                                                                                               | true | false
categorias_carrera       | trg_audit_categorias_carrera | CREATE TRIGGER trg_audit_categorias_carrera AFTER INSERT OR DELETE OR UPDATE ON public.categorias_carrera FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()                         | true | false
club_configuracion       | null                         | null                                                                                                                                                                               | true | false
club_secuencias          | null                         | null                                                                                                                                                                               | true | false
clubs                    | trg_audit_clubs              | CREATE TRIGGER trg_audit_clubs AFTER INSERT OR DELETE OR UPDATE ON public.clubs FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()                                                   | true | false
clubs                    | trg_clubs_updated_at         | CREATE TRIGGER trg_clubs_updated_at BEFORE UPDATE ON public.clubs FOR EACH ROW EXECUTE FUNCTION set_updated_at()                                                                   | true | false
comision_config          | null                         | null                                                                                                                                                                               | true | false
hipodromos               | null                         | null                                                                                                                                                                               | true | false
liquidacion_config       | trg_audit_liquidacion_config | CREATE TRIGGER trg_audit_liquidacion_config AFTER INSERT OR DELETE OR UPDATE ON public.liquidacion_config FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()                         | true | false
novedades_reunion        | null                         | null                                                                                                                                                                               | true | false
resolucion_entidades     | null                         | null                                                                                                                                                                               | true | false
resoluciones             | null                         | null                                                                                                                                                                               | true | false
resultado_apuestas       | null                         | null                                                                                                                                                                               | true | false
resultado_log            | null                         | null                                                                                                                                                                               | true | false
```

### 1.c Probes y procesos con service_role

Probes que escriben en alguna de las 14 (todos con `SUPABASE_SECRET_KEY` = service_role → **bypass de RLS**, no
les afecta):

```
caballeriza_responsables: tests/probe_caballeriza_provisorio.mjs tests/probe_propietario_derivacion.mjs tests/probe_modificar_inscripcion_portal.mjs
club_secuencias: tests/probe_aislamiento_club_cobros.mjs tests/probe_anular_recibo_ui.mjs tests/probe_anular_recibo.mjs tests/probe_guard_staff_rpcs.mjs tests/probe_cobros_v11.mjs tests/probe_historial_recibos.mjs tests/probe_pagos_rol_carrera.mjs tests/probe_recibos_emision.mjs tests/probe_recibo_pie_cobrador.mjs tests/probe_recibos_delete_revocado.mjs tests/smoke_pago_staff_9999.mjs
resultado_apuestas: tests/probe_vacante_vac.mjs
(resto: ninguno)
```

Otros procesos con service_role: las Edge Functions (`reunion-json` sólo lee; `invite-user` escribe `usuarios`;
`studbook-buscar` no toca la base) y las migraciones por MCP (usuario `postgres`). No hay cron ni worker.

### 1.d Volumen de cada tabla hoy

```sql
select 'caballeriza_responsables' t, count(*) n, max(created_at)::text ultimo from caballeriza_responsables
union all select 'carrera_apuestas', count(*), null from carrera_apuestas
union all select 'categorias_carrera', count(*), null from categorias_carrera
union all select 'club_configuracion', count(*), null from club_configuracion
union all select 'club_secuencias', count(*), null from club_secuencias
union all select 'clubs', count(*), max(updated_at)::text from clubs
union all select 'comision_config', count(*), null from comision_config
union all select 'hipodromos', count(*), null from hipodromos
union all select 'liquidacion_config', count(*), null from liquidacion_config
union all select 'novedades_reunion', count(*), null from novedades_reunion
union all select 'resolucion_entidades', count(*), null from resolucion_entidades
union all select 'resoluciones', count(*), null from resoluciones
union all select 'resultado_apuestas', count(*), null from resultado_apuestas
union all select 'resultado_log', count(*), null from resultado_log;
```
```
t                        | n   | ultimo
caballeriza_responsables | 278 | 2026-09-22 00:53:51.712453
carrera_apuestas         | 161 | null
categorias_carrera       | 12  | null
club_configuracion       | 0   | null
club_secuencias          | 2   | null
clubs                    | 3   | 2026-08-30 01:22:17.637296+00
comision_config          | 0   | null
hipodromos               | 7   | null
liquidacion_config       | 1   | null
novedades_reunion        | 0   | null
resolucion_entidades     | 0   | null
resoluciones             | 0   | null
resultado_apuestas       | 170 | null
resultado_log            | 0   | null
```

(`ultimo` = `max(created_at)` / `max(updated_at)` sólo donde la columna existe y se pidió.)

---

## 2. Qué se rompería con `fn_is_staff()`

`fn_is_staff()` = fila en `usuarios` con `auth_user_id = auth.uid()`, `activo` y `rol in ('super_admin',
'secretario_carreras','operador')`. La forma propuesta es
`fn_is_super_admin() OR (fn_is_staff() AND <predicado de club de hoy>)`.

| Escritor legítimo | Pasa por la política | ¿Sigue funcionando? |
|---|---|---|
| Pantallas del staff (secretario, operador) | sí | **sí** — son staff y el predicado de club no cambia |
| super_admin | sí | **sí** — la rama `fn_is_super_admin()` no cambia |
| `aplicar_resultado` (oficializar → `resultado_apuestas`) | **no** (DEFINER, dueño postgres) | **sí** |
| `fn_siguiente_recibo` (`club_secuencias`) | no | **sí** |
| `rpc_caballeriza_provisorio` (`caballeriza_responsables`) | no | **sí** |
| Probes / Edge Functions / migraciones (service_role, postgres) | no (bypass) | **sí** |
| Usuario del portal por la API | sí | **no — que es el objetivo** |

**Casos pedidos:**
- `carrera_apuestas`: **no** se escribe al oficializar. La escribe `programa.html` (modal de apuestas), staff. Sigue.
- `resultado_apuestas`: se escribe al oficializar, pero **dentro de `aplicar_resultado`** (DEFINER). La política no
  interviene. Sigue.
- `resultado_log`: **nadie la escribe** — ni el front, ni ninguna función (`prosrc` sin referencias), 0 filas. Sigue
  vacía.

**Diferencia fina con `activo`:** hoy la rama de club usa `fn_get_user_club_id()`, que **ya exige `activo`**; así que un
staff desactivado hoy tampoco puede escribir. `fn_is_staff()` también exige `activo` → sin cambio. (El único que
ignora `activo` es `fn_is_super_admin()` — H3 del informe de usuarios —, y esa rama no se toca.)

**Conclusión 2: ninguna escritura legítima se rompe.**

---

## 3. ¿Alguna la debe escribir el portal?

**No.** Lo que el portal escribe hoy:

| Acción del portal | Cómo | Toca alguna de las 14 |
|---|---|---|
| Anotar un caballo | `rpc_inscribir` (DEFINER) → `inscripciones` | no |
| Dar de baja | `rpc_baja_inscripcion` (DEFINER) | no |
| Modificar caballeriza/entrenador/jockeys | `rpc_modificar_inscripcion` (DEFINER) — **lee** `caballeriza_responsables` | no escribe |
| Pedir acceso | `rpc_solicitar_acceso` (DEFINER) — **lee** `clubs` | no escribe |
| Su propio nombre/teléfono | `usuarios` (fila propia) | no es de las 14 |

`inscripciones` (el ejemplo del pedido) ya tiene `NOT fn_is_portal_user()` en sus políticas y el portal entra por RPC;
no está entre las 14 y **queda afuera** por eso. **Ninguna de las 14 queda afuera del cambio.**

Lectura (SELECT) del portal: hoy el portal también **lee** `liquidacion_config`, `club_secuencias`, `comision_config`,
`clubs`, etc. (mismo predicado de club). `portal.html` sólo usa `caballeriza_responsables` y (vía RPC) `clubs`. Cerrar
las lecturas es un segundo paso (Q3); el plan de acá cubre **escrituras**, que es lo pedido.

---

## 4. ¿Ya pasó?

### 4.a Auditoría de `liquidacion_config`, `clubs`, `club_secuencias` (y `categorias_carrera`)

```sql
select a.created_at, a.tabla, a.accion, a.usuario_id, u.rol actor_rol, (u.id is null and a.usuario_id is not null) actor_borrado,
 (select string_agg(k, ',' order by k) from jsonb_object_keys(coalesce(a.datos_despues,a.datos_antes)) k where a.accion<>'UPDATE' or a.datos_despues->k is distinct from a.datos_antes->k) campos
from auditoria a left join usuarios u on u.id=a.usuario_id
where a.tabla in ('liquidacion_config','clubs','club_secuencias','categorias_carrera') order by a.created_at;
```

`usuario_id` reemplazado por el rol del actor (anonimizado; los ids están en la base):

```
created_at                    | tabla              | accion | actor_rol           | actor_borrado | campos
2026-05-20 00:14:41.155193+00 | clubs              | UPDATE | super_admin         | false         | comision_carreras,sponsors,updated_at
2026-05-20 00:15:00.735336+00 | clubs              | UPDATE | super_admin         | false         | comision_carreras,sponsors,updated_at
2026-05-20 02:35:14.23677+00  | clubs              | UPDATE | super_admin         | false         | comision_carreras,updated_at
2026-05-21 00:33:56.537028+00 | categorias_carrera | INSERT | (sin usuario)       | false         | activo,club_id,codigo,color_hex,descripcion,es_computable,es_oficial,id,nombre,orden_display,simbolo
2026-05-21 00:33:56.537028+00 | categorias_carrera | INSERT | (sin usuario)       | false         | activo,club_id,codigo,color_hex,descripcion,es_computable,es_oficial,id,nombre,orden_display,simbolo
2026-05-21 00:33:56.537028+00 | categorias_carrera | INSERT | (sin usuario)       | false         | activo,club_id,codigo,color_hex,descripcion,es_computable,es_oficial,id,nombre,orden_display,simbolo
2026-05-21 00:33:56.537028+00 | categorias_carrera | INSERT | (sin usuario)       | false         | activo,club_id,codigo,color_hex,descripcion,es_computable,es_oficial,id,nombre,orden_display,simbolo
2026-05-21 01:54:03.925137+00 | clubs              | UPDATE | (sin usuario)       | false         | comisariato,updated_at
2026-05-21 02:18:43.127433+00 | clubs              | UPDATE | super_admin         | false         | sponsors,updated_at
2026-05-22 01:46:27.613941+00 | clubs              | UPDATE | secretario_carreras | false         | disclaimer_nota,updated_at
2026-05-22 01:54:41.056432+00 | clubs              | UPDATE | secretario_carreras | false         | telefono,updated_at
2026-05-22 01:54:50.055961+00 | clubs              | UPDATE | secretario_carreras | false         | inscripciones_telefono,secretaria_carreras_nombre,telefono,updated_at
2026-05-22 03:06:47.803802+00 | clubs              | UPDATE | super_admin         | false         | sigla,updated_at
2026-05-22 03:11:46.793579+00 | clubs              | UPDATE | secretario_carreras | false         | telefono,updated_at
2026-06-08 03:15:43.730248+00 | liquidacion_config | UPDATE | (sin usuario)       | false         | incentivo_entrenador_monto,incentivo_jockey_monto
2026-08-14 14:37:24.095185+00 | clubs              | UPDATE | secretario_carreras | false         | comision_carreras,updated_at
2026-08-30 01:22:17.637296+00 | clubs              | UPDATE | (sin usuario)       | false         | logo_url,updated_at
2026-09-19 18:22:00.725558+00 | liquidacion_config | UPDATE | operador            | false         | incentivo_jockey_monto
```

- **Cero eventos de un usuario del portal.** El primer usuario del portal es del 2026-08-19; desde entonces hay dos
  eventos: 30/08 `logo_url` sin usuario (service_role/MCP) y 19/09 el cambio a 60.000 por un operador.
- "(sin usuario)" = sin `auth.uid()`: migración por MCP o service_role. Un usuario del portal por la API **siempre**
  deja su `usuario_id` (el trigger lo resuelve por `auth.uid()`).
- `club_secuencias` **no tiene trigger de auditoría** → no aparece.

Detalle de `liquidacion_config`:

```sql
select a.created_at, a.datos_antes->>'incentivo_jockey_monto' jockey_antes, a.datos_despues->>'incentivo_jockey_monto' jockey_despues, a.datos_antes->>'incentivo_entrenador_monto' entr_antes, a.datos_despues->>'incentivo_entrenador_monto' entr_despues, u.rol actor_rol
from auditoria a left join usuarios u on u.id=a.usuario_id where a.tabla='liquidacion_config' order by 1;
```
```
created_at                    | jockey_antes | jockey_despues | entr_antes | entr_despues | actor_rol
2026-06-08 03:15:43.730248+00 | 0.00         | 50000.00       | 0.00       | 10000.00     | null
2026-09-19 18:22:00.725558+00 | 50000.00     | 60000.00       | 10000.00   | 10000.00     | operador
```

### 4.b Valor actual vs. Fede

```sql
select * from liquidacion_config;
```
```
id                                   | 346c30f9-729e-468b-9abb-8e5c2f85cdea
club_id                              | 0649e9c5-9e87-4aad-842f-101458e6b33c
pct_propietario                      | 70.000
pct_entrenador                       | 10.000
pct_jockey                           | 10.000
pct_peon                             | 4.000
pct_capataz                          | 3.000
pct_sereno                           | 1.000
pct_fondo_solidario                  | 2.000
incentivo_jockey_monto               | 60000.00
incentivo_entrenador_monto           | 10000.00
dias_antidoping                      | 30
retencion_dgi_pct                    | null
vigente_desde                        | 2026-06-02
vigente_hasta                        | null
activo                               | true
created_at                           | 2026-06-02 04:19:52.542081+00
```

**Jockey 60.000 / entrenador 10.000 = lo definido por Fede.** Porcentajes 70/10/10/4/3/1/2 = 100 %.

### 4.c `club_secuencias` (sin auditoría): consistencia contra `recibos`

```sql
select cs.*, (select max(numero_recibo) from recibos r where r.club_id=cs.club_id) max_recibo_emitido, (select count(*) from recibos r where r.club_id=cs.club_id) recibos from club_secuencias cs;
```
```
club_id                              | tipo   | ultimo_numero | max_recibo_emitido | recibos
a6da7e40-1515-45dc-8933-4eef33ce937a | recibo | 19            | null               | 0
0649e9c5-9e87-4aad-842f-101458e6b33c | recibo | 71            | 9002               | 44
```
```sql
select case when numero_recibo<=71 then '<=71 (secuencia)' else '>71' end rango, count(*), min(numero_recibo), max(numero_recibo), string_agg(distinct coalesce(estado::text,'?'),',') estados, min(emitido_at)::date desde, max(emitido_at)::date hasta
from recibos where club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' group by 1;
```
```
rango            | count | min  | max  | estados | desde      | hasta
<=71 (secuencia) | 42    | 1    | 71   | emitido | 2026-08-16 | 2026-09-23
>71              | 2     | 9001 | 9002 | emitido | 2026-06-10 | 2026-06-10
```

Dolores: `ultimo_numero = 71` = número más alto emitido por la secuencia. Los 9001/9002 son del 10/06, anteriores al
portal (numeración manual de prueba). 42 recibos para 71 números: los huecos son recibos de probes que se borran y
números consumidos sin emitir; no hay salto hacia atrás (un reseteo haría chocar números) ni hacia adelante. El otro
club es "Mi Club Hípico" (probes): 19, sin recibos. **Nada anómalo.**

### 4.d Lo que no se puede probar

- 11 de las 14 tablas no tienen trigger de auditoría: `caballeriza_responsables`, `carrera_apuestas`,
  `club_configuracion`, `club_secuencias`, `comision_config`, `hipodromos`, `novedades_reunion`,
  `resolucion_entidades`, `resoluciones`, `resultado_apuestas`, `resultado_log`. Ninguna tiene columna de autor
  poblada por trigger (`resoluciones.creado_por`, `novedades_reunion.creado_por` y `resultado_log.usuario_id` las
  carga el cliente; las tres tablas están en 0 filas).
- Logs de API: `get_logs(service='api')` respondió
  `The logs.all endpoint has been removed. Use GET /v1/projects/{ref}/analytics/endpoints/logs instead.` — no hay
  forma de mirar requests del portal desde esta sesión (y la retención sería de 24 h).
- Tablas vacías (`club_configuracion`, `comision_config`, `novedades_reunion`, `resolucion_entidades`,
  `resoluciones`, `resultado_log`): no hay nada que pudiera estar alterado. `hipodromos` (7), `categorias_carrera`
  (12, auditada) y `carrera_apuestas`/`resultado_apuestas` (datos de reuniones reales, ya usados en liquidaciones
  y programas impresos) no muestran nada raro, pero sin autor no se puede certificar.

**Conclusión 4: sin evidencia de explotación donde hay registro; donde no hay registro, sin anomalías visibles.**

---

## 5. Plan

### 5.a Forma del cambio (las 36 políticas, un solo patrón)

Hoy, todas:

```
(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR <PRED_CLUB>)
```

Propuesta:

```
(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND <PRED_CLUB>))
```

En USING y en WITH CHECK, según corresponda al comando. `<PRED_CLUB>` no cambia. Mismo patrón que
`sanciones_insert_update_staff.sql` (25/09). SELECT **no** se toca.

| Tabla | Políticas | `<PRED_CLUB>` |
|---|---|---|
| `caballeriza_responsables` | delete, insert, update | `(fn_club_de_caballeriza(caballeriza_id) = …club del usuario…)` |
| `carrera_apuestas` | delete, insert, update | `(fn_club_de_carrera(carrera_id) = …)` |
| `categorias_carrera` | delete, insert, update | `(club_id = …)` |
| `club_configuracion` | delete, insert, update | `(club_id = …)` |
| `club_secuencias` | `_rls` (ALL) | `(club_id = …)` — ver opción B |
| `clubs` | `clubs_update_self_or_admin` | `(id = …)` |
| `comision_config` | delete, insert, update | `(club_id = …)` |
| `hipodromos` | delete, insert, update | `(club_id = …)` |
| `liquidacion_config` | `_rls` (ALL) | `(club_id = …)` |
| `novedades_reunion` | delete, insert, update | `(fn_club_de_reunion(reunion_id) = …)` |
| `resolucion_entidades` | delete, insert, update | `(fn_club_de_resolucion(resolucion_id) = …)` |
| `resoluciones` | delete, insert, update | `(club_id = …)` |
| `resultado_apuestas` | delete, insert, update | `(fn_club_de_resultado(resultado_id) = …)` |
| `resultado_log` | delete, insert, update | `(fn_club_de_resultado(resultado_id) = …)` |

**Detalle de `_rls` (ALL):** `liquidacion_config_rls` y `club_secuencias_rls` son `FOR ALL`: cubren también SELECT.
Reescribirlas tal cual le **quita al portal la lectura** de esas dos tablas. El portal no las lee (`portal.html` no
las nombra; el motor de liquidación corre sólo en `liquidaciones.html`), así que no rompe nada — y es deseable.
Queda dicho porque es la única excepción a "SELECT no se toca".

**Opción B para `club_secuencias` (recomendada, decisión de producto conservadora):** nadie la escribe desde el front;
la única escritura legítima es `fn_siguiente_recibo` (DEFINER) y los probes (service_role). Se puede cerrar la
escritura del cliente del todo: `FOR ALL … USING/WITH CHECK (fn_is_super_admin())` + `FOR SELECT` con staff. Lo dejo
como opción: el plan base (staff) ya cierra el portal; B además impide que un operador reescriba la numeración de
recibos a mano por la API.

**Pregunta de producto abierta (no bloquea):** con el plan base, `operador` puede seguir cambiando
`liquidacion_config` y `comision_config` (lo hizo legítimamente el 19/09). Si se quiere restringir a secretario +
super_admin, es otro cambio (Q2).

### 5.b Migración (BORRADOR — no está en el repo, no se aplicó)

Archivos propuestos: `migrations/politicas_escritura_staff_14.sql` y
`migrations/rollback_politicas_escritura_staff_14.sql`. Generados por script desde una especificación compacta
(tabla → predicado), no transcriptos a mano (GOTCHA #99). Verificación del generador: el md5 de
`coalesce(USING,'')||'|'||coalesce(WITH CHECK,'')` de cada política **de hoy**, calculado en prod, contra el mismo md5
de lo que genera el script para el rollback:

```sql
-- md5 medido en prod (misma consulta que generó el rollback de referencia)
with p as (
 select c.relname t, p.polname, pg_get_expr(p.polqual,p.polrelid) q, pg_get_expr(p.polwithcheck,p.polrelid) wc
 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and p.polcmd in ('a','w','*','d')
  and c.relname in (<14 tablas>)
  and coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')||coalesce(pg_get_expr(p.polqual,p.polrelid),'') ~ 'fn_get_user_club_id')
select count(*) n, string_agg(t||'.'||polname||' '||md5(coalesce(q,'')||'|'||coalesce(wc,'')), chr(10) order by t, polname) from p;
-- n = 36
```
```
$ diff md5_gen.txt md5_prod.txt && echo "36/36 md5 IGUALES"
36/36 md5 IGUALES
```
```
caballeriza_responsables.caballeriza_responsables_delete bbaf90f4f051fac5487616aed3f68c39
caballeriza_responsables.caballeriza_responsables_insert 826e737cf3837de0a8a8c85da5fa7c9b
caballeriza_responsables.caballeriza_responsables_update 203cb19e6282631546cc68c2feaae46c
carrera_apuestas.carrera_apuestas_delete bba38ee97efe7872df748faff36f6a53
carrera_apuestas.carrera_apuestas_insert d25f70117c7826fd5ca07c3f2b80b128
carrera_apuestas.carrera_apuestas_update 6e7800ce42733a89a14b004d6cb7c3e4
categorias_carrera.categorias_carrera_delete bd6203cb2a293196a30603f45ccf2556
categorias_carrera.categorias_carrera_insert ee075422773f3bdc4c1f562ef17c72ef
categorias_carrera.categorias_carrera_update d61391593f16b3c8c5855054f6e496b6
club_configuracion.club_configuracion_delete bd6203cb2a293196a30603f45ccf2556
club_configuracion.club_configuracion_insert ee075422773f3bdc4c1f562ef17c72ef
club_configuracion.club_configuracion_update d61391593f16b3c8c5855054f6e496b6
club_secuencias.club_secuencias_rls d61391593f16b3c8c5855054f6e496b6
clubs.clubs_update_self_or_admin 69603469b1724394789d8b395b5ab282
comision_config.comision_config_delete bd6203cb2a293196a30603f45ccf2556
comision_config.comision_config_insert ee075422773f3bdc4c1f562ef17c72ef
comision_config.comision_config_update d61391593f16b3c8c5855054f6e496b6
hipodromos.hipodromos_delete bd6203cb2a293196a30603f45ccf2556
hipodromos.hipodromos_insert ee075422773f3bdc4c1f562ef17c72ef
hipodromos.hipodromos_update d61391593f16b3c8c5855054f6e496b6
liquidacion_config.liquidacion_config_rls d61391593f16b3c8c5855054f6e496b6
novedades_reunion.novedades_reunion_delete 33e6746da67b32a954a81cda799742d2
novedades_reunion.novedades_reunion_insert 09b8d009e85900b82c2ad10fd5cda689
novedades_reunion.novedades_reunion_update c475109d35c86c71de624a5500edaf36
resolucion_entidades.resolucion_entidades_delete 7a26cdc2729437155a2514805fb17748
resolucion_entidades.resolucion_entidades_insert fd9b2e285b8eff20aeb424f9e5915bce
resolucion_entidades.resolucion_entidades_update 59647cea359f5f03e51bc7b498d5cb34
resoluciones.resoluciones_delete bd6203cb2a293196a30603f45ccf2556
resoluciones.resoluciones_insert ee075422773f3bdc4c1f562ef17c72ef
resoluciones.resoluciones_update d61391593f16b3c8c5855054f6e496b6
resultado_apuestas.resultado_apuestas_delete 8b4f3f4d2c526e37982ccbd25a7657f2
resultado_apuestas.resultado_apuestas_insert 405649d46a6a8446dd16a786841fe4f3
resultado_apuestas.resultado_apuestas_update 318d5c57650d2c4d64f86014e70d3229
resultado_log.resultado_log_delete 8b4f3f4d2c526e37982ccbd25a7657f2
resultado_log.resultado_log_insert 405649d46a6a8446dd16a786841fe4f3
resultado_log.resultado_log_update 318d5c57650d2c4d64f86014e70d3229
```

→ el rollback reproduce **byte a byte** las expresiones de hoy. El md5 esperado **después** de aplicar la
migración no se puede calcular acá (Postgres normaliza el texto al guardarlo): se mide aplicando el archivo en el
sandbox `tests/local/` y se escribe en el encabezado, como en las migraciones del 22–25/09.

Migración (texto completo):

```sql
-- ISSUE-093 — exigir fn_is_staff() en la rama de club (BORRADOR, NO APLICADO)
-- 36 políticas de escritura de 14 tablas. Generado desde pg_policy (2026-09-27); ver informe.
BEGIN;

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

COMMIT;
```

Rollback (texto completo, = políticas de hoy):

```sql
-- ROLLBACK ISSUE-093 — restaura las políticas EXACTAS de hoy
-- 36 políticas de escritura de 14 tablas. Generado desde pg_policy (2026-09-27); ver informe.
BEGIN;

DROP POLICY caballeriza_responsables_delete ON public.caballeriza_responsables;
CREATE POLICY caballeriza_responsables_delete ON public.caballeriza_responsables AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY caballeriza_responsables_insert ON public.caballeriza_responsables;
CREATE POLICY caballeriza_responsables_insert ON public.caballeriza_responsables AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY caballeriza_responsables_update ON public.caballeriza_responsables;
CREATE POLICY caballeriza_responsables_update ON public.caballeriza_responsables AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY carrera_apuestas_delete ON public.carrera_apuestas;
CREATE POLICY carrera_apuestas_delete ON public.carrera_apuestas AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY carrera_apuestas_insert ON public.carrera_apuestas;
CREATE POLICY carrera_apuestas_insert ON public.carrera_apuestas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY carrera_apuestas_update ON public.carrera_apuestas;
CREATE POLICY carrera_apuestas_update ON public.carrera_apuestas AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY categorias_carrera_delete ON public.categorias_carrera;
CREATE POLICY categorias_carrera_delete ON public.categorias_carrera AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY categorias_carrera_insert ON public.categorias_carrera;
CREATE POLICY categorias_carrera_insert ON public.categorias_carrera AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY categorias_carrera_update ON public.categorias_carrera;
CREATE POLICY categorias_carrera_update ON public.categorias_carrera AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY club_configuracion_delete ON public.club_configuracion;
CREATE POLICY club_configuracion_delete ON public.club_configuracion AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY club_configuracion_insert ON public.club_configuracion;
CREATE POLICY club_configuracion_insert ON public.club_configuracion AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY club_configuracion_update ON public.club_configuracion;
CREATE POLICY club_configuracion_update ON public.club_configuracion AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY club_secuencias_rls ON public.club_secuencias;
CREATE POLICY club_secuencias_rls ON public.club_secuencias AS PERMISSIVE FOR ALL TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY clubs_update_self_or_admin ON public.clubs;
CREATE POLICY clubs_update_self_or_admin ON public.clubs AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY comision_config_delete ON public.comision_config;
CREATE POLICY comision_config_delete ON public.comision_config AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY comision_config_insert ON public.comision_config;
CREATE POLICY comision_config_insert ON public.comision_config AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY comision_config_update ON public.comision_config;
CREATE POLICY comision_config_update ON public.comision_config AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY hipodromos_delete ON public.hipodromos;
CREATE POLICY hipodromos_delete ON public.hipodromos AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY hipodromos_insert ON public.hipodromos;
CREATE POLICY hipodromos_insert ON public.hipodromos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY hipodromos_update ON public.hipodromos;
CREATE POLICY hipodromos_update ON public.hipodromos AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY liquidacion_config_rls ON public.liquidacion_config;
CREATE POLICY liquidacion_config_rls ON public.liquidacion_config AS PERMISSIVE FOR ALL TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY novedades_reunion_delete ON public.novedades_reunion;
CREATE POLICY novedades_reunion_delete ON public.novedades_reunion AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY novedades_reunion_insert ON public.novedades_reunion;
CREATE POLICY novedades_reunion_insert ON public.novedades_reunion AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY novedades_reunion_update ON public.novedades_reunion;
CREATE POLICY novedades_reunion_update ON public.novedades_reunion AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY resolucion_entidades_delete ON public.resolucion_entidades;
CREATE POLICY resolucion_entidades_delete ON public.resolucion_entidades AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY resolucion_entidades_insert ON public.resolucion_entidades;
CREATE POLICY resolucion_entidades_insert ON public.resolucion_entidades AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY resolucion_entidades_update ON public.resolucion_entidades;
CREATE POLICY resolucion_entidades_update ON public.resolucion_entidades AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY resoluciones_delete ON public.resoluciones;
CREATE POLICY resoluciones_delete ON public.resoluciones AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY resoluciones_insert ON public.resoluciones;
CREATE POLICY resoluciones_insert ON public.resoluciones AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY resoluciones_update ON public.resoluciones;
CREATE POLICY resoluciones_update ON public.resoluciones AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY resultado_apuestas_delete ON public.resultado_apuestas;
CREATE POLICY resultado_apuestas_delete ON public.resultado_apuestas AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY resultado_apuestas_insert ON public.resultado_apuestas;
CREATE POLICY resultado_apuestas_insert ON public.resultado_apuestas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY resultado_apuestas_update ON public.resultado_apuestas;
CREATE POLICY resultado_apuestas_update ON public.resultado_apuestas AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY resultado_log_delete ON public.resultado_log;
CREATE POLICY resultado_log_delete ON public.resultado_log AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY resultado_log_insert ON public.resultado_log;
CREATE POLICY resultado_log_insert ON public.resultado_log AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY resultado_log_update ON public.resultado_log;
CREATE POLICY resultado_log_update ON public.resultado_log AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

COMMIT;
```

### 5.c Probe propuesto — `tests/probe_politicas_escritura_staff.mjs`

Perfiles con **sesión real** (magiclink, no service_role), creados por el probe y borrados en el `finally`:

| Perfil | Fila en `usuarios` |
|---|---|
| `portal` | `profesional`, Dolores, `activo`, con `entidad` de prueba |
| `portal_prop` | `propietario`, Dolores, `activo` |
| `secretario` | `secretario_carreras`, Dolores (control positivo) |
| `operador` | `operador`, Dolores (control positivo) |
| `staff_otro_club` | `operador` de Mi Club Hípico (control de club) |
| `super_admin` | `super_admin` (control positivo) |
| `staff_inactivo` | `operador`, Dolores, `activo=false` |

Matriz: 14 tablas × {INSERT, UPDATE, DELETE} (donde exista la política) × 7 perfiles. Filas objetivo:

- Fixtures propios en la 9999 (`carrera_apuestas`/`resultado_apuestas`/`resultado_log` sobre sus carreras y
  resultados; `novedades_reunion` sobre la reunión 9999) y filas de prueba marcadas en `categorias_carrera`,
  `hipodromos`, `resoluciones`, `resolucion_entidades`, `comision_config`, `club_configuracion`,
  `caballeriza_responsables` (sobre una caballeriza de prueba).
- Tablas de fila única real (`clubs`, `liquidacion_config`, `club_secuencias`): **UPDATE no-op** (mismo valor que ya
  tiene: `set incentivo_jockey_monto = incentivo_jockey_monto`) + `select()` para contar filas afectadas → 0 esperado
  para portal; nada que restaurar aunque pase. **Nunca** INSERT/DELETE sobre filas reales.

Asserts:
- `portal`, `portal_prop`, `staff_inactivo`: INSERT → `42501`; UPDATE/DELETE → **0 filas** (RLS filtra sin error);
  y por estado, la fila objetivo **idéntica** al snapshot (md5 de la fila).
- `staff_otro_club`: igual que portal sobre filas de Dolores.
- `secretario`, `operador`, `super_admin`: INSERT/UPDATE/DELETE sobre fixtures → OK (el cambio no rompe al staff).
- `aplicar_resultado` sobre la 9999 con sesión de secretario → sigue escribiendo `resultado_apuestas`
  (control de que el DEFINER no depende de la política).
- Estado final: snapshot antes/después de las 14 tablas (conteo **y** md5 por fila de las filas reales); 0 usuarios
  de prueba; 0 fixtures.

Corridas:
1. **Sandbox antes** de la migración (réplica de las 36 políticas de hoy en `tests/local/`): el probe tiene que dar
   **rojo** en todas las filas `portal` (reproduce el agujero).
2. **Sandbox después**: verde.
3. **Mutantes** (sandbox, `PSQL_CMD`): quitar `fn_is_staff()` de una política por tabla (14) → cada uno tiene que
   morir en su tabla; cambiar `fn_is_staff()` por `true` en una ALL → muere.
4. **Prod** sólo después de aplicar, con `--prod` (escribe fixtures y usuarios de prueba y los borra).

Orden de deploy: sandbox (1→2→3) → `apply_migration` con el archivo textual → md5 de las 36 expresiones contra el
esperado del sandbox → probe `--prod` → CHANGELOG/ISSUES. Sin cambio de front: ninguna pantalla cambia.

Rollback: `migrations/rollback_politicas_escritura_staff_14.sql` en una transacción; verificación = el mismo md5 de
36/36 de arriba.

---

## Preguntas abiertas

- **Q1** — ¿Plan base (staff en las 36) u opción B para `club_secuencias` (sólo super_admin escribe por la API)?
  Recomiendo **B**: no rompe nada y saca la numeración de recibos del alcance de cualquier cliente.
- **Q2** — ¿`operador` debe poder cambiar `liquidacion_config` y `comision_config`? Hoy puede y lo hizo (19/09, el
  60.000). El plan base lo mantiene.
- **Q3** — Lecturas: el portal hoy puede **leer** `comision_config`, `hipodromos`, `categorias_carrera`,
  `resoluciones`, `clubs` (entera, con teléfonos y disclaimers), etc. ¿Se cierra en un segundo paso con el mismo
  patrón? (`liquidacion_config` y `club_secuencias` ya quedan cerradas por ser `FOR ALL`.)
- **Q4** — Auditoría: ¿se agregan triggers `fn_auditoria_log` a `club_secuencias`, `comision_config`,
  `carrera_apuestas` y `resultado_apuestas`? Hoy no hay forma de saber quién tocó esas tablas.
- **Q5** — `fn_is_super_admin()` sigue sin mirar `activo` (H3). No entra en este cambio; ¿va aparte?

---

## Anexo A — grep completo de referencias (lecturas y escrituras)

```
=== caballeriza_responsables
caballerizas.html:312:  const { data, error } = await sb.from('caballeriza_responsables')
caballerizas.html:578:    const { error } = await sb.from('caballeriza_responsables').insert(toInsert);
caballerizas.html:626:      .from('caballeriza_responsables')
caballerizas.html:748:    const { error: delErr } = await sb.from('caballeriza_responsables').delete().eq('caballeriza_id', cabId);
liquidaciones.html:1473:    const { data: cab, error: eCab } = await sb.from('caballeriza_responsables')
portal.html:1268:  const { data, error } = await sb.from('caballeriza_responsables')
=== carrera_apuestas
programa-oficial.html:251:    carIds.length ? sb.from('carrera_apuestas').select('*').in('carrera_id', carIds).order('orden') : Promise.resolve({ data: [] }),
programa.html:474:    const { data: apuRows } = await sb.from('carrera_apuestas')
programa.html:603:    const { error: delErr } = await sb.from('carrera_apuestas').delete().eq('carrera_id', cid);
programa.html:617:      const { error: insErr } = await sb.from('carrera_apuestas').insert(rows);
programa.html:641:  const { data } = await sb.from('carrera_apuestas')
programa-oficial-color.html:371:    carIds.length ? sb.from('carrera_apuestas').select('*').in('carrera_id', carIds).order('orden') : Promise.resolve({ data: [] }),
resultados.html:546:    carIds.length ? sb.from('carrera_apuestas').select('*').in('carrera_id', carIds).order('orden') : Promise.resolve({ data: [] }),
=== categorias_carrera
admin.html:596:  const {error:catErr}=await sb.from('categorias_carrera').insert(cats);
auditoria.html:126:      <option value="categorias_carrera">categorias_carrera</option>
auditoria.html:306:    else if (tabla === 'categorias_carrera') q = sb.from('categorias_carrera').select('id, nombre, codigo').in('id', idsToFetch);
auditoria.html:324:      else if (tabla === 'categorias_carrera') label = r.nombre || r.codigo || '—';
auditoria.html:337:  if (e.tabla === 'categorias_carrera') return datos.nombre || datos.codigo || null;
carta-llamados.html:822:    sb.from('categorias_carrera').select('id,nombre,codigo,simbolo,color_hex').eq('club_id', CLUB_ID).eq('activo', true).order('orden_display'),
programa-oficial-color.html:370:    sb.from('categorias_carrera').select('id,nombre,codigo').eq('club_id', clubId),
categorias.html:190:  const {data,error}=await sb.from('categorias_carrera').select('*').eq('club_id',CLUB_ID).order('orden_display').order('nombre');
categorias.html:251:  const {error}=id?await sb.from('categorias_carrera').update(payload).eq('id',id):await sb.from('categorias_carrera').insert(payload);
categorias.html:259:  const {error}=await sb.from('categorias_carrera').delete().eq('id',id);
ratificacion.html:517:    sb.from('categorias_carrera').select('id,nombre,codigo,es_oficial,es_computable').eq('club_id', CLUB_ID).eq('activo', true).order('orden_display'),
programa.html:199:    sb.from('categorias_carrera').select('id,nombre,codigo,simbolo').eq('club_id', CLUB_ID),
programa-oficial.html:250:    sb.from('categorias_carrera').select('id,nombre,codigo').eq('club_id', clubId),
supabase/functions/reunion-json/index.ts:145:    const catMap = await fetchByIds('categorias_carrera', (carreras ?? []).map((c: any) => c.categoria_id),
=== club_configuracion
=== club_secuencias
=== clubs
admin.html:388:  const {data:clubs,error}=await sb.from('clubs').select('*').order('nombre');
admin.html:559:    const {data:clubData,error:clubErr}=await sb.from('clubs').insert({
admin.html:803:  const {error}=await sb.from('clubs').update({
admin.html:849:  const {error}=await sb.from('clubs').update({activo}).eq('id',id);
admin.html:858:  const {error}=await sb.from('clubs').delete().eq('id',id);
auditoria.html:127:      <option value="clubs">clubs</option>
auditoria.html:304:    else if (tabla === 'clubs') q = sb.from('clubs').select('id, nombre').in('id', idsToFetch);
auditoria.html:322:      else if (tabla === 'clubs') label = r.nombre || '—';
auditoria.html:336:  if (e.tabla === 'clubs') return datos.nombre || null;
carta-llamados.html:824:    sb.from('clubs').select('logo_url, nombre, website, instagram, facebook, tiktok, twitter_x, youtube, disclaimer_importante, disclaimer_nota, sponsors').eq('id', CLUB_ID).single(),
index.html:192:  const { data: clubs } = await sb.from('clubs').select('id,nombre,sigla').order('nombre');
index.html:217:    const { data: clubData } = await sb.from('clubs').select('nombre,sigla,logo_url').eq('id', CLUB_ID).single();
inscripciones.html:895:    sb.from('clubs').select('logo_url, localidad').eq('id', CLUB_ID).single(),
jockeys.html:310:    sb.from('clubs').select('nombre,sigla').eq('id', CLUB_ID).single(),
programa-oficial-color.html:345:  const { data: club } = await sb.from('clubs').select('*').eq('id', clubId).single();
programa-oficial.html:223:  const { data: club } = await sb.from('clubs').select('*').eq('id', clubId).single();
liquidaciones.html:679:    sb.from('clubs').select('*').eq('id', CLUB_ID).single(),
liquidaciones.html:2394:  const { data: cl } = await sb.from('clubs').select('nombre,domicilio,localidad,provincia,logo_url').eq('id', CLUB_ID).single();
ratificacion.html:283:    sb.from('clubs').select('logo_url, localidad').eq('id', CLUB_ID).single(),
programa.html:201:    sb.from('clubs').select('logo_url, nombre, comision_carreras, comisariato').eq('id', CLUB_ID).single(),
solicitudes.html:229:  const { data: club } = await sb.from('clubs').select('nombre,sigla').eq('id', CLUB_ID).single();
usuarios.html:226:    const { data: club } = await sb.from('clubs').select('nombre,sigla').eq('id', CLUB_ID).single();
club-switcher.js:22:    const { data: clubs, error } = await sb.from('clubs').select('id,nombre,sigla').order('nombre');
=== comision_config
liquidaciones.html:2473:  const { data, error } = await sb.from('comision_config').select('*').eq('club_id', CLUB_ID).order('tipo_profesional');
liquidaciones.html:2530:    ? await sb.from('comision_config').update(payload).eq('id',id)
liquidaciones.html:2531:    : await sb.from('comision_config').insert(payload);
liquidaciones.html:2541:  const { error } = await sb.from('comision_config').delete().eq('id',id);
liquidaciones-engine.js:127:                  : sb.from('comision_config').select('*').eq('club_id', clubId).eq('activo', true),
=== hipodromos
hipodromos.html:157:  const { data, error } = await sb.from('hipodromos').select('*').eq('club_id', CLUB_ID).order('nombre');
hipodromos.html:197:  const {error}=id?await sb.from('hipodromos').update(payload).eq('id',id):await sb.from('hipodromos').insert(payload);
hipodromos.html:204:  const {error}=await sb.from('hipodromos').delete().eq('id',id);
carta-llamados.html:823:    sb.from('hipodromos').select('id,nombre,sigla').eq('club_id', CLUB_ID),
reuniones.html:277:    sb.from('hipodromos').select('id,nombre,sigla').eq('club_id', CLUB_ID).eq('activo', true).order('nombre'),
supabase/functions/reunion-json/index.ts:106:        .from('hipodromos').select('id, nombre').eq('id', reunion.hipodromo_id).single();
=== liquidacion_config
liquidaciones.html:665:    ? await sb.from('liquidacion_config').update(payload).eq('id', liqConfig.id).select().single()
liquidaciones.html:666:    : await sb.from('liquidacion_config').insert(payload).select().single();
liquidaciones.html:681:    sb.from('liquidacion_config').select('*').eq('club_id', CLUB_ID).eq('activo', true).maybeSingle(),
liquidaciones-engine.js:117:      const { data } = await sb.from('liquidacion_config')
=== novedades_reunion
=== resolucion_entidades
=== resoluciones
resoluciones.html:208:    sb.from('resoluciones').select('*').eq('club_id', CLUB_ID).order('fecha', {ascending:false}).order('numero'),
resoluciones.html:273:  const { error } = await sb.from('resoluciones').update({ estado }).eq('id',id);
resoluciones.html:316:    ? await sb.from('resoluciones').update(payload).eq('id',id)
resoluciones.html:317:    : await sb.from('resoluciones').insert(payload);
resoluciones.html:327:  const { error } = await sb.from('resoluciones').delete().eq('id',id);
=== resultado_apuestas
resultados.html:557:    resIds.length ? sb.from('resultado_apuestas').select('*').in('resultado_id', resIds).order('orden') : { data: [] },
resultados.html:1346:  const { data } = await sb.from('resultado_apuestas').select('*').eq('resultado_id', res.id).order('orden');
=== resultado_log
```

---

## Verificación de push

```
$ git push -q origin HEAD:reports && git ls-remote origin reports && git rev-parse HEAD
468b66b7e58e55aef445ea5784b589bffba8a9a6	refs/heads/reports
468b66b7e58e55aef445ea5784b589bffba8a9a6
```

Este apéndice va en un commit posterior de `reports`; su SHA se informa en el chat.
