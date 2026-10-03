# Paso 3 (03/10) — seguridad tanda 2: trigger de montas sólo service_role + tablas/secuencias nuevas sin anon

- Fecha: 2026-10-03
- Migración `seguridad_tanda_2`, versión `20261003140631`, aplicada a las 14:06 UTC. Fuera de horario: sábado, sin actividad de staff desde el 02/10 a las 21:38:09 UTC
  (consultado a las 14:06:23 UTC).
- PR #54, rama `chore/seguridad-tanda-2` en `6a2974c`, merge `9a0a00a`.
- Guards: pwd `/home/clio/dev/SGH`; proyecto `unlhcuanfrtpatoipwve`; club Dolores = 1 fila.
- Alcance acordado: storage no se toca.

> En las salidas crudas de los probes, los uuid de fixtures (borrados en el teardown) van recortados a sus primeros 8 caracteres: el chequeo de datos personales
> confunde sus segmentos numéricos con teléfonos.

## Conclusión

Aplicado sin rollback.

| | antes | después |
|---|---|---|
| `fn_insc_monta_oficial_guard()` ACL | `{postgres=X,authenticated=X,service_role=X}` | `{postgres=X,service_role=X}` (anon/authenticated/service_role = false/false/true) |
| md5 `pg_get_functiondef` | `935d8dfad71878efef3b7b75efad2b75` | igual |
| trigger `trg_insc_monta_oficial` (BEFORE UPDATE OF jockey_titular_id ON inscripciones) | habilitado | habilitado y disparando: `probe_montas_post_oficial` 24/24 en prod, con A11 "UPDATE directo sigue rechazado" |
| default de postgres en `public`, **tablas** nuevas | anon, authenticated, service_role (`arwdDxtm`) | authenticated, service_role |
| default de postgres en `public`, **secuencias** nuevas | anon, authenticated, service_role (`rwU`) | authenticated, service_role |
| ACL de las 41 tablas/vistas/secuencias existentes de `public` (md5) | `48b4c8f117f86271c60a22c605a5e9cb` | idéntico |
| funciones de `public` ejecutables por anon | 0 | 0 |
| advisor `authenticated_security_definer_function_executable` | 37 | 36 (sale la función) |

Dato: PostgREST ya devolvía 404 (`PGRST202`) para `/rpc/fn_insc_monta_oficial_guard`, porque no expone funciones `RETURNS trigger`. El advisor la marcaba igual, y el REVOKE la saca.

## Preguntas abiertas

1. **37 tablas existentes de `public` tienen SELECT para anon** (y el resto de los privilegios que daba el default). Hoy las protege la RLS: ninguna política se aplica a anon.
   ¿Revocamos a anon en las existentes? Es la misma tanda aplicada hacia atrás. Habría que probar antes las vistas que lee anon a propósito
   (`v_programa_reunion`, `v_sanciones_vigentes`, `v_spcs_activos` tienen SELECT para anon).
2. Los defaults de **supabase_admin** en `public` (tablas y secuencias) siguen con anon. Los administra la plataforma y nuestras migraciones corren como postgres.

## Sandbox (`tests/probe_seguridad_tanda_2.mjs --mutantes`, base `sgh_t2_run`)

```
✅ P0) fixture = prod: función con authenticated; defaults r/S con anon
✅ apply) la migración aplica sin error
✅ F1) función: anon/authenticated/PUBLIC sin EXECUTE; service_role con EXECUTE
✅ F2) md5(pg_get_functiondef) idéntico
✅ T1) carrera OFICIAL, authenticated cambia la monta → P0084 del guard (el trigger disparó), no permission denied
✅ T2) carrera NO oficial → el cambio pasa
✅ T3) llamarla directo como authenticated → permission denied
✅ D1) default de TABLAS de postgres en public: sin anon, con authenticated y service_role
✅ D2) default de SECUENCIAS: sin anon, con authenticated y service_role
✅ D3) tabla nueva (con serial): anon 0 privilegios en tabla y secuencia; authenticated y service_role todos
✅ D4) ACL de las tablas y secuencias EXISTENTES de public: idénticos
✅ rollback) aplica sin error
✅ R1) rollback: ACL de la función = antes
✅ R2) rollback: defaults r/S = antes

14/14 checks OK

── mutantes ──
💀 muere MS1 la función conserva authenticated  (F1,T3)
💀 muere MS2 sin el default de tablas  (D1,D3)
💀 muere MS3 sin el default de secuencias  (D2,D3)
💀 muere MS4 revoca también authenticated de las tablas nuevas  (D1,D3,R2)
💀 muere MS5 además toca las tablas existentes  (D4)
💀 muere MS6 función sin GRANT a service_role  (F1,R1)
💀 muere MR1 rollback sin devolver authenticated  (R1)
💀 muere MR2 rollback sin el default de tablas  (R2)
mutantes: 8/8 muertos
```

## Prod antes del apply (`--prod`, sólo lectura)

```
✅ P1) anon: /rpc/fn_insc_monta_oficial_guard no se ejecuta  → 404 {"code":"PGRST202",…}
1/1 checks OK
```

## Prod: foto antes y después (SQL)

```sql
select 'fn', p.oid::regprocedure::text, p.proacl::text, md5(pg_get_functiondef(p.oid)) from pg_proc p where p.oid='public.fn_insc_monta_oficial_guard()'::regprocedure
union all select 'trg', … pg_get_triggerdef …
union all select 'defacl', defaclrole||' '||defaclnamespace||' '||defaclobjtype, defaclacl … where defaclobjtype in ('r','S') and defaclnamespace = public
union all select 'tablas public con anon SELECT', count(*) …
union all select 'md5 acl tablas+secuencias public', md5(string_agg(relname||'|'||relacl, '#' order by relname)), count(*) …;
```
ANTES (14:0x UTC):
```
fn     | fn_insc_monta_oficial_guard() | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | 935d8dfad71878efef3b7b75efad2b75
trg    | trg_insc_monta_oficial on inscripciones | CREATE TRIGGER trg_insc_monta_oficial BEFORE UPDATE OF jockey_titular_id ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION fn_insc_monta_oficial_guard()
defacl | postgres public r       | {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
defacl | postgres public S       | {postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}
defacl | supabase_admin public S | {postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}
defacl | supabase_admin public r | {postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}
tablas public con anon SELECT    | 37
secuencias public con anon USAGE | 0
md5 acl tablas+secuencias public | 48b4c8f117f86271c60a22c605a5e9cb | 41
```
DESPUÉS:
```
fn     | {postgres=X/postgres,service_role=X/postgres} | 935d8dfad71878efef3b7b75efad2b75 | false/false/true
defacl supabase_admin S | (sin cambios)
defacl supabase_admin r | (sin cambios)
defacl postgres r       | {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
defacl postgres S       | {postgres=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}
md5 acl tablas+secuencias public | 48b4c8f117f86271c60a22c605a5e9cb | 41
trg    | CREATE TRIGGER trg_insc_monta_oficial BEFORE UPDATE OF jockey_titular_id ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION fn_insc_monta_oficial_guard() | O (habilitado)
migración | 20261003140631 | seguridad_tanda_2
anon ejecutables en public | 0
```

## probe_montas_post_oficial en prod, después del apply (escribe en la 9999 y la restaura entera)

```
✅ S0) resultados.html tiene las anclas SAVE MONTAS y llama a rpc_cambiar_monta
   → RESULTADOS_HTML=/home/clio/dev/SGH/resultados.html
✅ S0b) la RPC existe en la base y valida el parámetro
   → rpc_cambiar_monta: falta la inscripción
✅ P0) fixture — línea de jockey del 3° del turno 2 impago; 1° del turno 1 retenido; 4° del turno 3; incentivo pagado con recibo; header de propietario
   → LA=2948caa3 impago · LB=65582b50 retenido · INC=c4016cb6 benef 7381c730 · hdrProp=b0000000
✅ A1) impago → saveMontas real: UNA línea de jockey en (insc, 3°), al entrante, impago, mismo monto que la del saliente
   → líneas=1 9a7c0668:impago:$12000 · toasts=success,success
✅ A1b) la inscripción quedó con el entrante y el modal se cerró
✅ A1c) performances.jockey_id de esa inscripción pasó al entrante
   → jockey_id=9a7c0668
✅ A1d) el saliente no tiene ninguna línea de jockey por esa inscripción
✅ A2) retenido (1°) → la línea del saliente se borra y la del entrante nace RETENIDA
   → líneas=1 9a7c0668:retenido · toasts=success,success
✅ A3) pagado con recibo → RAISE que nombra el recibo; nada cambia
   → La monta de Río Salado (carrera 2) ya tiene un pago emitido al jockey anterior: recibo N° 99084. Anulá el recibo primero. ISSUE-084
✅ A4) pagado sin recibo (saldado administrativo) → RAISE "saldado administrativo"; nada cambia
   → La monta de Río Salado (carrera 2) ya tiene plata saldada al jockey anterior sin recibo (saldado administrativo): no se puede cambiar desde acá — hablá con la secretaría. ISSUE-084
✅ A5) incentivo del saliente pagado y sin otra monta en la reunión → RAISE con recibo; jockey e incentivo intactos
   → La monta de Río Salado (carrera 2) ya tiene un pago emitido al jockey anterior: recibo N° 9001. Anulá el recibo primero. ISSUE-084
✅ A6) carrera provisional → cambio:true, oficial:false, recalcular:false, 0 borradas; las líneas no se tocan
   → {"cambio":true,"oficial":false,"recalcular":false,"performances":0,"jockey_anterior":"f9000000…","lineas_borradas":0}
✅ A7) RPC ok + recálculo fallido → el saliente no tiene línea pagable (la borró la RPC); toast rojo que manda a Recalcular
   → líneas=0 · toasts=success:1 monta(s) guardada(s) | error:Monta guardada, pero la liquidación no s
✅ A8) UPDATE directo de jockey_titular_id en carrera oficial → rechazado por el trigger; la columna no cambia
   → La carrera 2 ya está oficializada: la monta se cambia desde Montas (resultados.html), que recalcula la liquidación. ISSUE-084
✅ A9) propietario pagado + jockey impago → la RPC pasa (mira sólo al jockey saliente); la línea del propietario queda
   → {"cambio":true,"oficial":true,"recalcular":true,"performances":0,"jockey_anterior":"fa2bf88c…","lineas_borradas":2}
✅ A10) UPDATE con el payload entero y el mismo jockey en carrera oficial → pasa (NEW IS NOT DISTINCT FROM OLD)
   → ok
✅ A11) tras una RPC exitosa, un UPDATE directo sigue rechazado (set_config fue local a la transacción de la RPC)
   → rpc=ok · update=La carrera 2 ya está oficializada: la monta se cambia desde Montas (resultados.html), que recalcula la liquidación. ISSUE-084
✅ A12) incentivo pagado del saliente + otra monta en carrera PROVISIONAL → la RPC pasa y el incentivo no se toca
   → {"cambio":true,"oficial":true,"recalcular":true,"performances":0,"jockey_anterior":"7381c730…","lineas_borradas":0} · incentivo pagado+recibo
✅ P1) anon → rechazado antes de entrar a la función (no tiene EXECUTE)
   → code=42501 permission denied for function rpc_cambiar_monta
✅ P2) authenticated con club de otro hipódromo → 42501, la monta no cambia
   → code=42501 rpc_cambiar_monta: la inscripción es de otro hipódromo
✅ P3) authenticated SIN fila en usuarios (club NULL) → 42501 de un guard propio; NO se lo confunde con service_role
   → code=42501 rpc_cambiar_monta: sin permiso
✅ P4) portal + inscripción INEXISTENTE → 42501 del guard (no "la inscripción no existe"): el guard corre antes del lookup
   → code=42501 rpc_cambiar_monta: el portal no cambia montas
✅ R1) restore por estado: la 9999 quedó exactamente como al empezar (headers, líneas con sus ids, jockeys, resultados)
   → sin diferencias
✅ R2) nada fuera de la 9999 cambió: total de líneas, total de recibos (sin filtro de club) y 0 performances del probe
   → líneas 709→709 · recibos 75→75 · perfs=0 · antes del restore diferían 1 fila(s), como corresponde a un probe que recalcula

24/24 OK
```

## correr_todos.sh (HEAD separado en la rama)

```
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       1s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       3s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      2s
probe_aviso_revision_modal_y_progreso      🟢 verde                                                     14s
probe_badge_overlap                        🟢 verde                                                      0s
probe_bolsa_efectiva                       🟢 verde                                                      1s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      1s
probe_chapa_4medio                         🟢 verde                                                      0s
probe_cobros_caballeriza                   🟢 verde                                                      2s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=2)                                       1s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       1s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      43s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      1s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_inscripciones_alta_studbook          🟢 verde                                                      6s
probe_inscripciones_listado                🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      3s
probe_motor_chequeo_errores                🟢 verde                                                      1s
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       6s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      1s
probe_pagos_carrera_busqueda               🟢 verde                                                      7s
probe_pagos_vista_carrera                  🟢 verde                                                     12s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     14s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      0s
probe_programa_null_estado                 🟢 verde                                                      2s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_ratificacion_aviso_revision          🟢 verde                                                      1s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🟢 verde                                                     39s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_resultados_front_cerrada             🟢 verde                                                      2s
probe_reparto_100                          🟢 verde                                                     39s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                      10s
probe_studbook_v2                          🟢 verde                                                      1s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       2s
probe_v_inscriptos_cerrada                 🟢 verde                                                      2s

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

## Rollback (no usado)

`migrations/rollback_seguridad_tanda_2.sql`: probado en el sandbox (R1, R2).
