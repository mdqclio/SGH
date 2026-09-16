# Estado tras el corte de las 19:04 UTC (16/09) — nada perdido, nada escrito

- **Fecha**: 2026-09-16, 19:05–19:08 UTC (16:05 AR)
- **Rama al medir**: `main` = `7887a27f2dc2cbf0d1c3a16a1e82b0b4d31d1ace` (working tree limpio). Este archivo en `reports`.
- **Guards**: `pwd=/home/clio/dev/SGH`, `spcs=210`, ref `unlhcuanfrtpatoipwve`.

## 0. Respuesta corta

| # | pregunta | respuesta |
|---|---|---|
| 1 | git | `main` limpio en `7887a27` (= `origin/main`). `reports` en `417716e` (= `origin/reports`), último commit: el plan de caballeriza titular opcional. Sin cambios sin commitear, sin untracked. Un `stash@{0}` viejo (`fix/spcs-r8-tanda-4b`, R8) que no es de hoy. |
| 2 | cruce de la planilla | **No se empezó.** En esta sesión no hubo ningún pedido ni trabajo de "cruce de planilla": lo último que hice fue el diagnóstico de `caballerizas.html` (`a56d388`) y el plan A/B (`417716e`), los dos publicados y verificados por `ls-remote`. No hay resultados parciales que commitear — no hay archivos nuevos ni modificados en el repo ni en el scratchpad después de las 18:58 (`sec52.md`). Si el cruce lo pediste en otra terminal, no llegó a esta sesión (§3: hay otras dos instancias vivas, **ociosas**). |
| 3 | ¿algo escrito en la base? | **No.** Las dos tareas fueron sólo lectura. Únicas escrituras desde las 18:30 UTC según `auditoria`: **20 `UPDATE` sobre `inscripciones` por `yesica@sgh.com`** (Yesi cargando performances de R9). Conteos idénticos a los del informe anterior: `caballerizas` 295/43 sin titular, `propietarios` 271/47 provisorios, `responsables` 270, `spcs` 210, R9 74 ratificados / 15 sin propietario. |
| 4 | fixtures / funciones de prueba | **Ninguna.** `pg_proc`: sólo `rpc_modificar_inscripcion` (ninguna `_mut`, `syntaxcheck`, `probe%`, ni `rpc_caballeriza_provisorio%` — el RPC del plan **no está aplicado**, como corresponde a un plan). 0 filas `PROBE-%`/`probe-%` en las 8 tablas del fixture (incluida la reunión 9985 que el plan propone). `schema_migrations`: última = `20260916175417 rpc_modificar_inscripcion_portal`. |

## 1. Salida cruda — git y procesos

```
$ date -u
Wed Sep 16 07:05:47 PM UTC 2026

$ pwd
/home/clio/dev/SGH

$ git status --short (incl. untracked)
(fin git status)

$ git log --oneline -3
7887a27 merge: "Modificar" en Mis inscripciones del portal — rpc_modificar_inscripcion (aplicada) + modal + probe 41/41 + 24/24 mutantes; GATE-1=B (ISSUE-082); baseline spcs 210 — pedido de Yesi 14/09
83f2403 test(portal): probe Modificar — A16 assert corregido (suplente intacto = j1), runbook de gemelas por execute_sql; CLAUDE.md: 15 ratificados sin propietario (13 sin caballeriza)
9596c1e feat(portal): "Modificar" en Mis inscripciones — caballeriza/entrenador/jockey/suplente (pedido Yesi 14/09)

$ git branch -a | grep -v "^  [a-z]*/" (locales sin prefijo + remotas relevantes)
main
  feat/caballeriza-el-don-jorge-lp
  feat/portal-modificar-inscripcion
  reports
  remotes/origin/feat/caballeriza-el-don-jorge-lp
  remotes/origin/feat/portal-modificar-inscripcion
  remotes/origin/reports

$ git log --oneline -4 reports
417716e docs: verificación ls-remote del plan de caballeriza titular opcional
9fd1498 docs: plan — alta de caballeriza sin titular → propietario provisorio automático (RPC rpc_caballeriza_provisorio = DO por caballeriza; form titular opcional; edición no borra lo no tocado; badge + botón Crear provisorio); A vs B, recomendación A; §5.2 del riesgo de edición tal cual — sin ejecutar
a56d388 docs: verificación ls-remote del informe de alta de caballerizas
72f62f4 docs: alta de caballerizas exige titular con DNI (front, d5b441a 11/05) — sólo titular, no procedencia; contradice el backfill del 15/08 que nunca tocó el form; las 43 sin responsable son de SQL (34 carga R6 12/06); 95/295 no editables; veredicto: titular opcional + no borrar en edición — SOLO LECTURA

$ git ls-remote origin main reports
7887a27f2dc2cbf0d1c3a16a1e82b0b4d31d1ace	refs/heads/main
417716e12015c5364a90057f3f422fc5450d320a	refs/heads/reports

$ git stash list
stash@{0}: WIP on fix/spcs-r8-tanda-4b: ad61c51 fix(spcs): R8 tanda 4b — propuesta de alta de LE CHAT MIMOUS (sin ejecutar)
(fin stash)

$ ls -la --time-style=+%H:%M scratchpad (últimos)
-rw-rw-r-- 1 clio clio   679 18:26 merge.txt
-rw-rw-r-- 1 clio clio   559 18:27 md5_poll.txt
-rw-rw-r-- 1 clio clio 80058 18:27 prod_portal.html
-rw-rw-r-- 1 clio clio  3211 18:28 probe_forfait_prod.txt
-rw-rw-r-- 1 clio clio  7691 18:28 probe_prod.txt
-rw-rw-r-- 1 clio clio  2819 18:58 sec52.md
drwx------ 2 clio clio   820 19:05 .
-rw-rw-r-- 1 clio clio  2137 19:05 estado_1905.txt

$ find repo -newer plan (archivos tocados después de las 19:00 UTC, fuera de .git)
./jockeys.html
./inscripciones.html
./profesionales-duplicados.js
./spcs.html
./SCHEMA.md
./jockey-repetido.js
./carta-llamados.html
./admin.html
./solicitar-acceso.html
./resultados.html
./login.html
./CLAUDE.md
./auditoria.html
./portal.html
./README.md
./ratificacion.html
./profesionales.html
./CHANGELOG.md
./liquidaciones.html
./solicitudes.html
./propietarios.html
./migrations/revocar_recibos_delete.sql
./migrations/fix_seeds_recibos_9001_9002.sql
./migrations/anular_recibo_v1.sql
./migrations/spcs_conesera_sexo.sql
./migrations/rollback_emitir_recibo_v1_2.sql
./migrations/propietarios_provisorios_r9.sql
./migrations/fix_recibo_fantasma_mch.sql
./migrations/spcs_r9_tanda_3.sql
./migrations/fix_condicion_sexo_r9_t8_t10.sql
./migrations/merge_carosueno_duplicada.sql
./migrations/rollback_condicion_sexo_r9_t8_t10.sql
./migrations/rpc_baja_inscripcion_forfait.sql
./migrations/rollback_reuniones_es_prueba.sql
./migrations/rpc_spcs_duplicados.sql
./migrations/fn_edad_reglamentaria.sql
./migrations/reuniones_es_prueba.sql
./migrations/rpc_modificar_inscripcion.sql
./migrations/spcs_r9_tanda_1.sql
./migrations/fix_ventanas_r9_hora_argentina.sql
./migrations/spcs_r9_tanda_2.sql
./migrations/anular_recibo_v2_snapshot.sql
./migrations/rollback_revocar_recibos_delete.sql
./migrations/fix_condicion_sexo_r6_r7_r8.sql
./migrations/rpc_padron_spcs.sql
./migrations/rollback_anular_recibo_v1.sql
./migrations/emitir_recibo_v1_2_aislamiento_club.sql
./migrations/caballeriza_el_don_jorge_lp.sql
./migrations/merge_los_urones_duplicada.sql
./migrations/carreras_ganadas_desde_hasta.sql
./docs/ISSUES.md
./docs/GOTCHAS.md
./docs/ESTADO_R8.md
./docs/MODELO_NUMERACION.md
./docs/MODULOS.md
./docs/SCHEMA.md
./docs/ESTADO.md
./docs/LIQUIDACIONES_MODELO.md
./docs/INTEGRACION_STUDBOOK_ESTADO.md
./data/spcs_r9_tanda_2_scrape.json
./data/spcs_r9_tanda_1_nombres.txt
./data/spcs_r9_tanda_1_scrape.json
./data/spcs_r9_tanda_2_nombres.txt
./data/spcs_r9_tanda_3_probe.json
./tests/probe_no_borrar_liq_cobrada.mjs
./tests/probe_spcs_r9_tanda_1.mjs
./tests/probe_solicitar_cuenta_existente.mjs
./tests/probe_carta_selector_reunion.mjs
./tests/probe_ganadas_carta_llamados.mjs
./tests/probe_alta_entrenador_operador.mjs
./tests/probe_forfait_portal.mjs
./tests/probe_rpc_spcs_duplicados.mjs
./tests/probe_studbook_buscar_fn.mjs
./tests/probe_aislamiento_club_cobros.mjs
./tests/probe_recuperacion_monta.mjs
./tests/probe_historial_recibos.mjs
./tests/probe_buscador_spc.mjs
./tests/probe_recibos_delete_revocado.mjs
./tests/probe_studbook_buscar_e2e.mjs
./tests/probe_reunion_es_prueba.mjs
./tests/probe_modificar_inscripcion_portal.mjs
./tests/probe_recibo_pie_cobrador.mjs
./tests/probe_filtro_concepto_pagos.mjs
./tests/README.md
./tests/probe_montas_reales.mjs
./tests/probe_paridad_llamado_inscripciones.mjs
./tests/probe_condicion_sexo_r9.mjs
./tests/probe_pagos_rol_carrera.mjs
./tests/probe_anular_recibo_ui.mjs
./tests/probe_carta_hora_local.mjs
./tests/probe_bolsa_efectiva.mjs
./tests/probe_orden_inscriptos.mjs
./tests/probe_anular_recibo.mjs
./tests/probe_solicitar_falta_paso.mjs
./tests/probe_spcs_studbook_alta.mjs
./tests/probe_aviso_jockey_repetido.mjs
./tests/probe_club_id_alta_propietarios.mjs
./tests/probe_edad_reglamentaria.mjs
./tests/lib/estado_lineas.mjs
./supabase/functions/_shared/studbook_format.mjs
./supabase/functions/invite-user/index.ts
./supabase/functions/studbook-buscar/index.ts
./supabase/functions/reunion-json/_build/index.slim.ts
./supabase/functions/reunion-json/_build/index.ts
./supabase/functions/reunion-json/_build/rollback_v21.ts
(fin find)

$ grep -ril planilla docs/diagnosticos/*2026-09-16* tests/ 2>/dev/null
(fin grep)

$ procesos claude / node probes vivos
 758396 4424733 claude
 830632 4329624 claude
1176686    3660 claude --resume
1184704    1169 claude --resume
1188226      65 claude --resume
1799784 3205048 claude
(fin ps)
```

**Lectura de la salida.** La lista larga del `find -newermt 19:00` es **ruido del `git checkout main`** de las 19:02
(volver de `reports` a `main` reescribe los archivos rastreados y les pone mtime nuevo); `git status --short` vacío
lo confirma: ninguno difiere del commit. `grep -ril cruce|planilla` en los diagnósticos de hoy y en `tests/`: nada.

## 2. Salida cruda — base (19:06:27 UTC)

```json
[{"k":"now","v":"2026-09-16 19:06:27.328597+00"},
 {"k":"spcs","v":"210"},
 {"k":"funciones_rpc_%mut_o_prueba","v":"(ninguna)"},
 {"k":"funciones_rpc_modificar%","v":"rpc_modificar_inscripcion"},
 {"k":"schema_migrations_ultimas_3","v":"20260916175417 rpc_modificar_inscripcion_portal | 20260911232604 rpc_spcs_duplicados | 20260911214948 carreras_ganadas_backfill"},
 {"k":"fixtures_probe_mod (8 tablas)","v":"0"},
 {"k":"escrituras_desde_1830_por_tabla (auditoria)","v":"inscripciones:UPDATE=20 (yesica@sgh.com)"},
 {"k":"caballerizas_activas / sin_titular","v":"295 / 43"},
 {"k":"propietarios_total / provisorios","v":"271 / 47"},
 {"k":"responsables_total","v":"270"},
 {"k":"r9_ratificados / sin_prop","v":"74 / 15"}]
```

(`auditoria` sólo cubre tablas con trigger — `inscripciones`, `usuarios`, etc.; `caballerizas`, `propietarios` y
`caballeriza_responsables` no lo tienen. Para esas, la prueba de "nada escrito" son los conteos, iguales a los de
`2026-09-16_alta-caballeriza-exige-titular.md` §3 medidos a las 18:50.)

## 3. Las tres instancias de `claude --resume`

```
== 1176686  18:04:47  pts/3  — hijos: sólo MCP servers (n8n, firebase, claude-mem, supabase). Sin bash, sin node.
== 1184704  18:46:19  pts/0  — idem. Ociosa.
== 1188226  19:04:42  pts/4  — ésta (la que escribe este archivo).
```

Las dos anteriores están vivas pero **no ejecutan nada** (a diferencia del episodio de las 18:07, cuando el proceso
viejo seguía corriendo mutantes solo — Parte 2 §13 del informe de Modificar). No las mato: no rompen nada y pueden
ser terminales tuyas. Si el "cruce de la planilla" se lo pediste a una de ellas, esa sesión no lo procesó (no hay
rastro en repo, scratchpad ni base).

## 4. Pendientes reales al cierre

1. **Decisión A/B** del plan `2026-09-16_plan-caballeriza-titular-opcional-provisorio.md` (recomendado A; B en ~1 h
   como corte de emergencia).
2. R9: 15 ratificados sin propietario (13 sin caballeriza) — operativo de Yesi + el botón/`DO` según lo que se decida.
3. El "cruce de la planilla": **decime cuál** (¿una planilla nueva de Yesi? ¿la de anotaciones de R9 contra los
   inscriptos?) y dónde está — no la tengo.

## 5. Verificación de publicación

(se completa en el commit siguiente)
