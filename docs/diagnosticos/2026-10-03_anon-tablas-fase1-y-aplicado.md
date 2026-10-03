# Tablas y vistas con privilegios para anon: fase 1 (sólo lectura) + aplicación

- Fecha: 2026-10-03 (sábado). Sin actividad de staff desde el 02/10 a las 21:38:09 UTC (consultado a las 15:01:37 UTC).
- Código leído: `origin/main`, sin checkout. Base: prod (`unlhcuanfrtpatoipwve`).
- Guards: pwd `/home/clio/dev/SGH`; club Dolores = 1 fila.
- Migraciones: `revoke_anon_tablas_publicas` (`20261003150157`) y `revoke_anon_v_inscriptos_resto` (`20261003150235`). PR #55, rama
  `chore/revoke-anon-tablas` en `c5c90e5`, merge `6b7f84b`. Sin rollback.

> En las salidas crudas de los probes, los uuid de fixtures (borrados en el teardown) van recortados a sus primeros 8 caracteres: el chequeo de datos personales
> confunde sus segmentos numéricos con teléfonos.

## Conclusión

**Se revocan las 37 y no queda ninguna.** Además se cerró `v_inscriptos_carrera`, que no estaba en la lista porque ya no tenía SELECT,
pero conservaba el resto para anon. Evidencia:

1. **Ninguna política le da filas a anon.** Las 34 tablas tienen RLS, y ninguna de sus políticas tiene `anon` ni `public` en `roles`
   (`spc_entrenadores_hist` no tiene ninguna política). Las 3 vistas son `security_invoker`, así que heredan la RLS de sus tablas.
   Empíricamente, anon por la API dio **200 y 0 filas en las 37** (probe `--antes`).
2. **Quién las lee sin sesión.** Relevamiento del código en `main` (HTML, JS, Edge Functions, tools):
   - **Producción:** sólo `programa-oficial.html` y `programa-oficial-color.html`, si se abren por URL directa
     (`?reunion_id=`) **sin haber iniciado sesión**. No tienen `initAuth`. Leen `reuniones` (+`hipodromos`), `clubs`, `carreras`, `inscripciones`,
     `spcs`, `profesionales`, `propietarios`, `caballerizas`, `categorias_carrera` y `carrera_apuestas`. Abiertas desde `programa.html` (con login)
     usan la sesión guardada y siguen funcionando.
   - **Sin sesión hoy ya leían 0 filas.** Después del cambio reciben un error de permiso: no se pierde ningún dato que hoy se vea.
   - **Login, solicitar acceso, reset y portal:** todas las consultas son después de tener sesión. No hay ningún select de clubes ni
     hipódromos antes del login (el club está fijo en el código).
   - **Edge Functions:** `reunion-json` usa la secret key; `invite-user` y `studbook-buscar` usan el JWT del usuario o la secret key.
     Ninguna consulta como anon.
   - **Las 4 vistas** no aparecen en ningún código.
   - **Dudoso, local:** `tools/studbook_reunion_json.mjs` cae a la publishable key si no hay secret en el entorno. Ya hoy leería 0 filas;
     ahora fallaría con un error claro.
3. **`pg_stat_statements`** (rol anon, acumulado): 19 lecturas de cada vista (los probes de ISSUE-098) y 1 a 3 lecturas sueltas sobre algunas
   tablas: probes, auditorías y quizás una apertura del programa sin sesión. Ningún patrón de uso real.
4. **Riesgo extra que se cierra:** anon tenía **TRUNCATE**, REFERENCES y TRIGGER, además de las escrituras. TRUNCATE no pasa por RLS.
   PostgREST no lo expone, pero era un privilegio de más.

Defaults de supabase_admin: se dejan (decisión del 03/10). Storage: no se toca.

## Lista y ACL (prod, antes)

| objeto | tipo | anon antes | políticas (total / que alcanzan a anon o public) |
|---|---|---|---|
| `apoderados` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `auditoria` | tabla (RLS on) | arwdDxtm | 2 / 0 |
| `caballeriza_responsables` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `caballerizas` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `carrera_apuestas` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `carreras` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `categorias_carrera` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `club_configuracion` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `club_secuencias` | tabla (RLS on) | arwdDxtm | 1 / 0 |
| `clubs` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `comision_config` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `hipodromos` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `inscripciones` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `liquidacion_config` | tabla (RLS on) | arwdDxtm | 1 / 0 |
| `liquidacion_detalle` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `liquidaciones` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `novedades_reunion` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `performances` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `profesionales` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `propietarios` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `recibos` | tabla (RLS on) | arwDxtm (sin DELETE) | 3 / 0 |
| `resolucion_entidades` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `resoluciones` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `resultado_apuestas` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `resultado_log` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `resultado_posiciones` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `resultados` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `reuniones` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `sanciones` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `solicitudes_acceso` | tabla (RLS on) | arwdDxtm | 1 / 0 |
| `spc_entrenadores_hist` | tabla (RLS on) | arwdDxtm | 0 / 0 |
| `spc_propietarios` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `spcs` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `usuarios` | tabla (RLS on) | arwdDxtm | 4 / 0 |
| `v_programa_reunion` | vista invoker | arwdDxtm | 0 / 0 |
| `v_sanciones_vigentes` | vista invoker | arwdDxtm | 0 / 0 |
| `v_spcs_activos` | vista invoker | arwdDxtm | 0 / 0 |
| `v_inscriptos_carrera` (complemento) | vista invoker | awdDxtm (SELECT ya revocado el 02/10) | 0 / 0 |

Consulta:
```sql
select c.relname, c.relkind, c.relrowsecurity, array(select p from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p where has_table_privilege('anon', c.oid, p)),
 (select count(*) from pg_policies po where po.schemaname='public' and po.tablename=c.relname),
 (select string_agg(po.policyname, ' | ') from pg_policies po where po.schemaname='public' and po.tablename=c.relname and (po.roles && array['anon','public']::name[]))
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v','m') and has_table_privilege('anon', c.oid, 'SELECT');
```
Resultado: 37 filas; la columna de políticas que alcanzan a anon o public dio `null` en las 37. En el ACL de antes, todos tenían `anon=arwdDxtm/postgres`,
salvo `recibos` (`anon=arwDxtm`). Además, authenticated/service_role con todo, y `sgh_lectura=r` en todos menos `usuarios` y `club_configuracion`.

## Después (prod)

```
objetos de public con algún privilegio de anon (tablas, vistas, secuencias): 0
ACL de los 37: idéntico al de antes, sin la entrada de anon (3 variantes: con sgh_lectura / sin sgh_lectura [usuarios, club_configuracion] / recibos con authenticated sin DELETE)
authenticated con SELECT en las 37: 37
v_inscriptos_carrera: {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,sgh_lectura=r/postgres}
migraciones: 20261003150157 revoke_anon_tablas_publicas, 20261003150235 revoke_anon_v_inscriptos_resto
```

## Probes

### Sandbox (`probe_revoke_anon_tablas --mutantes`, base sgh_at_run)
```
✅ P0) fixture = prod: anon con privilegios en las 37
✅ apply) aplica sin error
✅ A1) anon sin ningún privilegio en las 37
✅ A2) ACL de los demás roles idéntico en las 37
✅ A3) authenticated sigue con SELECT en las 37
✅ rollback) aplica sin error
✅ R1) rollback: ACL de las 37 = antes (conjunto)

7/7 checks OK

── mutantes ──
💀 muere MS1 falta una tabla (usuarios)  (A1)
💀 muere MS2 sólo SELECT (TRUNCATE y escrituras siguen)  (A1)
💀 muere MS3 también le saca SELECT a authenticated  (A2,A3,R1)
💀 muere MS4 falta una vista  (A1)
💀 muere MR1 rollback le devuelve DELETE en recibos  (R1)
💀 muere MR2 rollback sólo SELECT  (R1)
mutantes: 6/6 muertos
```

### Prod ANTES (`--prod --antes`)
```
anon por objeto: [["apoderados",200,"0 filas"],["auditoria",200,"0 filas"],["caballeriza_responsables",200,"0 filas"],["caballerizas",200,"0 filas"],["carrera_apuestas",200,"0 filas"],["carreras",200,"0 filas"],["categorias_carrera",200,"0 filas"],["club_configuracion",200,"0 filas"],["club_secuencias",200,"0 filas"],["clubs",200,"0 filas"],["comision_config",200,"0 filas"],["hipodromos",200,"0 filas"],["inscripciones",200,"0 filas"],["liquidacion_config",200,"0 filas"],["liquidacion_detalle",200,"0 filas"],["liquidaciones",200,"0 filas"],["novedades_reunion",200,"0 filas"],["performances",200,"0 filas"],["profesionales",200,"0 filas"],["propietarios",200,"0 filas"],["recibos",200,"0 filas"],["resolucion_entidades",200,"0 filas"],["resoluciones",200,"0 filas"],["resultado_apuestas",200,"0 filas"],["resultado_log",200,"0 filas"],["resultado_posiciones",200,"0 filas"],["resultados",200,"0 filas"],["reuniones",200,"0 filas"],["sanciones",200,"0 filas"],["solicitudes_acceso",200,"0 filas"],["spc_entrenadores_hist",200,"0 filas"],["spc_propietarios",200,"0 filas"],["spcs",200,"0 filas"],["usuarios",200,"0 filas"],["v_programa_reunion",200,"0 filas"],["v_sanciones_vigentes",200,"0 filas"],["v_spcs_activos",200,"0 filas"]]
staff por objeto: [["apoderados","ok",0],["auditoria","ok",1],["caballeriza_responsables","ok",1],["caballerizas","ok",1],["carrera_apuestas","ok",1],["carreras","ok",1],["categorias_carrera","ok",1],["club_configuracion","ok",0],["club_secuencias","ok",1],["clubs","ok",1],["comision_config","ok",0],["hipodromos","ok",1],["inscripciones","ok",1],["liquidacion_config","ok",1],["liquidacion_detalle","ok",1],["liquidaciones","ok",1],["novedades_reunion","ok",0],["performances","ok",0],["profesionales","ok",1],["propietarios","ok",1],["recibos","ok",1],["resolucion_entidades","ok",0],["resoluciones","ok",1],["resultado_apuestas","ok",1],["resultado_log","ok",0],["resultado_posiciones","ok",1],["resultados","ok",1],["reuniones","ok",1],["sanciones","ok",1],["solicitudes_acceso","ok",1],["spc_entrenadores_hist","ok",0],["spc_propietarios","ok",0],["spcs","ok",1],["usuarios","ok",1],["v_programa_reunion","ok",1],["v_sanciones_vigentes","ok",1],["v_spcs_activos","ok",1]]
✅ PA) ANTES: anon → 200 y 0 filas en las 37 (la RLS no le da nada)
✅ PS) sesión staff real: SELECT sin error de permiso en las 37
✅ PS2) y con datos donde se espera (reuniones, carreras, inscripciones, spcs, clubs)
✅ PZ) limpieza: 0 usuarios del probe

4/4 checks OK
```

### Prod DESPUÉS (`--prod`)
```
anon por objeto: [["apoderados",401,"42501"],["auditoria",401,"42501"],["caballeriza_responsables",401,"42501"],["caballerizas",401,"42501"],["carrera_apuestas",401,"42501"],["carreras",401,"42501"],["categorias_carrera",401,"42501"],["club_configuracion",401,"42501"],["club_secuencias",401,"42501"],["clubs",401,"42501"],["comision_config",401,"42501"],["hipodromos",401,"42501"],["inscripciones",401,"42501"],["liquidacion_config",401,"42501"],["liquidacion_detalle",401,"42501"],["liquidaciones",401,"42501"],["novedades_reunion",401,"42501"],["performances",401,"42501"],["profesionales",401,"42501"],["propietarios",401,"42501"],["recibos",401,"42501"],["resolucion_entidades",401,"42501"],["resoluciones",401,"42501"],["resultado_apuestas",401,"42501"],["resultado_log",401,"42501"],["resultado_posiciones",401,"42501"],["resultados",401,"42501"],["reuniones",401,"42501"],["sanciones",401,"42501"],["solicitudes_acceso",401,"42501"],["spc_entrenadores_hist",401,"42501"],["spc_propietarios",401,"42501"],["spcs",401,"42501"],["usuarios",401,"42501"],["v_programa_reunion",401,"42501"],["v_sanciones_vigentes",401,"42501"],["v_spcs_activos",401,"42501"]]
staff por objeto: [["apoderados","ok",0],["auditoria","ok",1],["caballeriza_responsables","ok",1],["caballerizas","ok",1],["carrera_apuestas","ok",1],["carreras","ok",1],["categorias_carrera","ok",1],["club_configuracion","ok",0],["club_secuencias","ok",1],["clubs","ok",1],["comision_config","ok",0],["hipodromos","ok",1],["inscripciones","ok",1],["liquidacion_config","ok",1],["liquidacion_detalle","ok",1],["liquidaciones","ok",1],["novedades_reunion","ok",0],["performances","ok",0],["profesionales","ok",1],["propietarios","ok",1],["recibos","ok",1],["resolucion_entidades","ok",0],["resoluciones","ok",1],["resultado_apuestas","ok",1],["resultado_log","ok",0],["resultado_posiciones","ok",1],["resultados","ok",1],["reuniones","ok",1],["sanciones","ok",1],["solicitudes_acceso","ok",1],["spc_entrenadores_hist","ok",0],["spc_propietarios","ok",0],["spcs","ok",1],["usuarios","ok",1],["v_programa_reunion","ok",1],["v_sanciones_vigentes","ok",1],["v_spcs_activos","ok",1]]
✅ PD) DESPUÉS: anon → 401 / 42501 en las 37
✅ PS) sesión staff real: SELECT sin error de permiso en las 37
✅ PS2) y con datos donde se espera (reuniones, carreras, inscripciones, spcs, clubs)
✅ PZ) limpieza: 0 usuarios del probe

4/4 checks OK
```

### probe_v_inscriptos_cerrada --mutantes (después; C3 ahora espera rechazo)
```
💀 MU1 vista abierta (200 con filas, como antes del 02/10) — status=206 code=- filas=1
💀 MU2 anon con 0 filas pero sin rechazo (invoker sin REVOKE) — status=200 code=- filas=0
💀 MU3 vista muerta para service_role — status=404 total=null
💀 MU4 otra vista abierta a anon — status=200 code=- filas=1
💀 MU5 migración nueva con CREATE OR REPLACE VIEW sin la opción — sin security_invoker: migrations/zz_mutante.sql:1
💀 MU6 se quita el marcador del bloque histórico — sin security_invoker: migrations/fn_edad_reglamentaria.sql:178
💀 MU7 rollback de fn_edad sin WITH — sin security_invoker: migrations/fn_edad_reglamentaria.sql:322

Mutantes: 7/7 muertos
```

### e2e con sesiones reales (después)
```
/tmp/claude-1000/-home-clio-dev-SGH/3d6d2352…/scratchpad/tab_e2e_portal.txt:14/14 asserts OK
/tmp/claude-1000/-home-clio-dev-SGH/3d6d2352…/scratchpad/tab_e2e_staff.txt:13/13 asserts OK
```

### correr_todos.sh (HEAD separado en la rama)
```
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       3s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       5s
probe_aviso_jockey_repetido                🟢 verde                                                      2s
probe_aviso_revision_modal_y_progreso      🟢 verde                                                     13s
probe_badge_overlap                        🟢 verde                                                      1s
probe_bolsa_efectiva                       🟢 verde                                                      1s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      1s
probe_chapa_4medio                         🟢 verde                                                      0s
probe_cobros_caballeriza                   🟢 verde                                                      2s
probe_condicion_sexo_r9                    🟢 verde                                                      5s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=2)                                       1s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      13s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      2s
probe_inscripciones_alta_studbook          🟢 verde                                                      5s
probe_inscripciones_listado                🟢 verde                                                      2s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      4s
probe_motor_chequeo_errores                🟢 verde                                                      0s
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       6s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      1s
probe_pagos_carrera_busqueda               🟢 verde                                                      6s
probe_pagos_vista_carrera                  🟢 verde                                                     14s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     16s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      0s
probe_programa_null_estado                 🟢 verde                                                      2s
probe_programa_r8_imprenta                 🟢 verde                                                      3s
probe_ratificacion_aviso_revision          🟢 verde                                                      1s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🟢 verde                                                     39s
probe_regex_datos_personales               🟢 verde                                                      1s
probe_resultados_front_cerrada             🟢 verde                                                      1s
probe_reparto_100                          🟢 verde                                                     42s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       1s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                      11s
probe_studbook_v2                          🟢 verde                                                      0s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       3s
probe_v_inscriptos_cerrada                 🟢 verde                                                      1s

Resumen: 35 verdes · 12 rojos conocidos · 0 rojos NUEVOS · 0 ausentes
Rojos conocidos (no bloquean):
  - probe_activacion_pendiente          drift del probe: su stub de sb no tiene .select() después de update().eq() (TypeError)
  - probe_alineado_programa             drift: el check de márgenes de página (10mm 8mm) del programa color no coincide — el CSS de impresión cambió desde que se escribió
  - probe_apuestas_especiales           drift: 9 checks de tarjetas (cantidad, número, nombre, rango) no coinciden con la pantalla actual
  - probe_cuerpos_oficial               drift de datos: espera 8 carreras oficiales en R6 y hay 7 (C3 está provisional desde el 14/08)
  - probe_edad_display                  drift: no encuentra el ancla de fin del bloque de edad en el HTML
  - probe_edad_reglamentaria            2/32: el Stud Book no devuelve dato para los ejemplares de R9 (fuente externa; ver studbook_buscar_fn)
  - probe_forfait_anulada               drift de extracción: ReferenceError renumerarChapas
  - probe_orden_carreras                drift de datos: 2/18 asumen R9 con 0 anuladas y sin sortear (R9 ya tiene anuladas y sorteo)
  - probe_portal_carta                  drift: no encuentra loadCarta en portal.html (hoy se llama loadLlamado)
  - probe_spcs_r9_tanda_1               evidencia histórica: asserta count(spcs) = 205 (hoy 239)
  - probe_studbook_buscar_fn            fuente externa: el Stud Book responde HTTP 403 a las búsquedas desde este servidor
  - probe_tapa_flyer                    drift de extracción: ReferenceError edadSPC
Salida completa de cada probe: <tmpdir>/<probe>.txt
```

## Pendiente / preguntas

- **Programa oficial abierto sin sesión:** hoy da error de permiso. Antes mostraba la página vacía. Si se quisiera un programa público sin login,
  haría falta una vista o RPC de lectura acotada y explícita, no permisos de tabla. No lo propongo sin un pedido.
- `tools/studbook_reunion_json.mjs`: conviene sacarle el fallback a la publishable key. Ya hoy no servía, porque leía 0 filas.
