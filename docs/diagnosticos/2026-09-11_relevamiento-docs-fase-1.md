# Relevamiento de documentación — FASE 1 (solo lectura, nada corregido)

**Fecha:** 2026-09-11 · **Relevado sobre `main` @ `ce5dd3c`** (merge R9 tanda 1) · **Branch del informe:** `reports`
**Regla aplicada:** cada afirmación de "esto quedó viejo" lleva al lado el `grep`, la query o el `ls` que la respalda, corrido hoy. Lo que no pude verificar está marcado **sin verificar**. Nada se corrigió.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `SELECT count(*) FROM spcs` | **199** | ✅ **199** |
| ref | `unlhcuanfrtpatoipwve` | ✅ (`current_database()='postgres'`, cliente MCP del proyecto) |
| branch de relevamiento | `main` | ✅ `ce5dd3c` — todos los `grep`/`ls` de este informe corrieron parado en `main`; `reports` sólo para escribir esto |

Conteos de referencia tomados hoy (una sola query, sirven para cotejar números viejos):

```sql
select (select count(*) from spcs) spcs, (select count(*) from reuniones where es_prueba) reun_prueba, (select count(*) from propietarios) propietarios, (select count(*) from propietarios where nombre ilike '%provisorio%' or notas ilike '%provisorio%') prov_aprox, (select count(*) from clubs) clubs, (select count(*) from caballerizas) caballerizas, (select count(*) from profesionales) profesionales, (select count(*) from usuarios) usuarios, (select count(*) from recibos) recibos, (select count(*) from reuniones) reuniones, (select count(*) from carreras) carreras, (select count(*) from inscripciones) inscripciones, (select string_agg(estado||':'||n, ', ') from (select coalesce(estado,'NULL') estado, count(*) n from carreras group by 1 order by 2 desc) x) carreras_estado
```
```json
[{"spcs":199,"reun_prueba":1,"propietarios":263,"prov_aprox":40,"clubs":3,"caballerizas":299,"profesionales":190,"usuarios":19,"recibos":5,"reuniones":14,"carreras":49,"inscripciones":253,"carreras_estado":"abierta:31, anulada:7, confirmada:7, programada:3, NULL:1"}]
```

Otros hechos de base usados abajo (queries en §9): roles en `usuarios` = `operador:3, super_admin:1, propietario:3, secretario_carreras:2, profesional:10`; `reuniones.estado` = `programada:3, publicada:1, cancelada:2, finalizada:6, borrador:2`; RLS activa en **34** tablas de 37 (sin RLS sólo las 3 `_bak_*`); `clubs.sigla` de Dolores = **`DOL`** (no `HDO`); `clubs.logo_url` Dolores = `https://sigh.com.ar/logo-dolores-verde.png`; `inscripciones.propietario_id` NULL en **147/253**; `spc_propietarios` = 0.

---

## 1. Inventario — 147 archivos `.md` fuera de `docs/diagnosticos/`

Comando: `git ls-files '*.md' | grep -v '^docs/diagnosticos/'` + `git log -1 --format=%ad --date=short -- <archivo>` + `wc -l`, en `main`.

Clasificación: **VIVO** = lo que una sesión nueva lee para orientarse (los que `CLAUDE.md` referencia + README/CHANGELOG) · **foto** = tiene fecha propia y guard propio, es bitácora/plan/resultado — no se toca · **PLACEHOLDER** = sin contenido propio.

**Resumen: 21 VIVOS · 125 fotos · 1 placeholder.** (Los `docs/diagnosticos/` son 7 en `main` y 80+ en `reports`; excluidos por pedido.)

| último commit | líneas | archivo | categoría | nota |
|---|---|---|---|---|
| 2026-05-14 | 152 | `docs/SESION_HARDENING_RLS_2026-05-14.md` | foto | bitácora de sesión (may-2026) |
| 2026-05-15 | 157 | `docs/SESION_2026-05-15.md` | foto | bitácora de sesión (may-2026) |
| 2026-05-17 | 469 | `docs/SESION_2026-05-16.md` | foto | bitácora de sesión (may-2026) |
| 2026-05-20 | 137 | `docs/SECURITY.md` | **VIVO** | modelo RLS |
| 2026-05-20 | 142 | `docs/AUDITORIA_2026-05-19.md` | foto | auditoría/remediación fechada |
| 2026-05-20 | 219 | `docs/SESION_2026-05-19.md` | foto | bitácora de sesión (may-2026) |
| 2026-05-21 | 111 | `docs/SESION_2026-05-20.md` | foto | bitácora de sesión (may-2026) |
| 2026-05-21 | 130 | `docs/SESION_2026-05-14.md` | foto | bitácora de sesión (may-2026) |
| 2026-05-21 | 138 | `docs/PLAN_LIQUIDACIONES.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-05-21 | 67 | `docs/CONTEXTO.md` | **VIVO** | negocio |
| 2026-05-27 | 107 | `docs/MODULOS.md` | **VIVO** | estado por módulo |
| 2026-06-02 | 212 | `docs/DECISIONES.md` | **VIVO** | ADRs |
| 2026-06-06 | 126 | `docs/auditoria/SGH.md` | foto | auditoría/remediación fechada |
| 2026-06-07 | 126 | `SECURITY_AUDIT.md` | foto | auditoría/remediación fechada |
| 2026-06-07 | 188 | `docs/auditoria/SGH-REMEDIACION.md` | foto | auditoría/remediación fechada |
| 2026-06-08 | 143 | `docs/RESULTADO_INCENTIVOS_MONTAS.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-06-08 | 211 | `docs/RESULTADO_FASE_C.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-06-08 | 225 | `docs/LIQUIDACIONES_GAP_ANALYSIS.md` | **VIVO** | CLAUDE.md lo llama "gap vivo" |
| 2026-06-08 | 268 | `docs/PLAN_FASE_C.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-06-09 | 148 | `docs/RESULTADO_OFICIALIZAR_CARRERA.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-06-12 | 163 | `data/studbook_faltantes_20j_insert_report.md` | foto | reporte de carga (data/) |
| 2026-06-12 | 79 | `data/caballerizas_20j_insert_report.md` | foto | reporte de carga (data/) |
| 2026-07-22 | 117 | `data/pedigree_paso1_faltantes.md` | foto | reporte de carga (data/) |
| 2026-07-22 | 150 | `data/pedigree_paso4_scrape.md` | foto | reporte de carga (data/) |
| 2026-07-22 | 28 | `assets/programa-oficial-color/README.md` | **VIVO** | readme de assets |
| 2026-07-22 | 66 | `data/pedigree_paso4_review_22.md` | foto | reporte de carga (data/) |
| 2026-07-25 | 596 | `docs/plan_alta_invitacion.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-07-25 | 838 | `docs/PERF_AUDIT.md` | foto | auditoría/remediación fechada |
| 2026-08-01 | 115 | `docs/PERF_R1_R3_RESULTADO.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-01 | 169 | `docs/SEC_RLS_FASE0.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-01 | 178 | `docs/SEC_RLS_FASE1.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-01 | 178 | `docs/SEC_RLS_FASE2.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-01 | 188 | `docs/SEC_RLS_FASE3.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-01 | 719 | `docs/PORTAL_V2_PLAN.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-03 | 176 | `docs/ROTACION_STUDBOOK_FASE0.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-03 | 184 | `docs/YUNTA_MANDIL_ESTADO.md` | foto | relevamiento "estado" con fecha y guard propios — foto, no doc vivo |
| 2026-08-03 | 193 | `docs/CIRCUITO_ALTA_SPCS_R8.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-03 | 212 | `docs/JSON_V2_CIERRE.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-04 | 140 | `data/spcs_r8_tanda_1_reporte.md` | foto | reporte de carga (data/) |
| 2026-08-04 | 147 | `docs/PROBE_TEMPLATE_ES.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-04 | 155 | `docs/AUTOREGISTRO_GATE_1.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-04 | 160 | `docs/ROTACION_STUDBOOK_FASE1.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-04 | 162 | `docs/TANDA_1B_R8.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-04 | 16 | `data/spcs_r8_tanda_1b_reporte.md` | foto | reporte de carga (data/) |
| 2026-08-04 | 170 | `docs/MERGE_CLEANUP_2026-08-04.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-04 | 172 | `docs/AUTOREGISTRO_GATE_2.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-04 | 183 | `docs/TANDA_1_R8.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-04 | 186 | `docs/AUTOREGISTRO_GATE_3.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-04 | 199 | `docs/DEPLOY_JSON_V2.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-04 | 202 | `docs/AUTOREGISTRO_GATE_0.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-04 | 552 | `docs/AUTOREGISTRO_PLAN.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-04 | 61 | `docs/ROLLBACK_GATE_0.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-05 | 69 | `data/spcs_r8_tanda_2_reporte.md` | foto | reporte de carga (data/) |
| 2026-08-06 | 162 | `docs/GATE_4_1_BACKFILL_TENENCIA.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-06 | 168 | `docs/GATE_4_4_UI_PORTAL.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-06 | 182 | `docs/GATE_4_3_RPC_PROBES.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-06 | 441 | `docs/AUTOREGISTRO_GATE_4.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-06 | 542 | `docs/GATE_4_1_LISTA_YESI.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-06 | 62 | `data/spcs_r8_tanda_3_reporte.md` | foto | reporte de carga (data/) |
| 2026-08-07 | 175 | `docs/TANDA_4B_R8.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-10 | 127 | `docs/TANDA_5_PUNTO_5_R8.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-12 | 100 | `docs/PERFORMANCES_R8.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-12 | 230 | `docs/NUMERO_PUBLICO_REUNIONES.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-12 | 266 | `docs/CARTA_LLAMADOS_ORDEN.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-12 | 86 | `docs/SORTEO_PARTIDORES.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-18 | 111 | `docs/RESULTADO_BUSCADOR_LIQUIDACIONES.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-18 | 147 | `docs/FIX_RECIBO_ROTULO_ROL.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-21 | 133 | `docs/FIX_COBROS_BUSQUEDA_CABALLERIZA.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-21 | 14 | `docs/SPEC.md` | PLACEHOLDER | 14 líneas, duplica CONTEXTO/ARQUITECTURA con URL vieja |
| 2026-08-21 | 154 | `docs/SCRUB_PII_APLICADO.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-21 | 208 | `docs/RELEVAMIENTO_EMAIL_2026-08-19.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-21 | 218 | `docs/SCRUB_PII_PROPUESTA.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-21 | 242 | `docs/MONTAS_R6_CORRECCION.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-21 | 281 | `docs/TANDA_5_R8.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-21 | 305 | `docs/CABALLERIZAS_JSON_DIEGO.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-21 | 311 | `docs/SNIPPETS.md` | **VIVO** | snippets |
| 2026-08-21 | 313 | `REMEDIACION_RESULTADO.md` | foto | auditoría/remediación fechada |
| 2026-08-21 | 328 | `docs/TANDA_3_R8.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-21 | 338 | `docs/TANDA_2_R8.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-21 | 344 | `docs/TANDA_4_R8.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-21 | 420 | `docs/ANALISIS_R6_PORTAL.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-21 | 534 | `docs/RELEVAMIENTO_SOLICITUD_ORIGEN_2026-08-19.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-21 | 72 | `docs/ARQUITECTURA.md` | **VIVO** | convenciones |
| 2026-08-21 | 99 | `docs/RESULTADO_COBROS_V1_1.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 1012 | `docs/PLAN_REUNION_PRUEBA_9998.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 113 | `docs/AUDIT_PORTAL_ONBOARDING.md` | foto | auditoría/remediación fechada |
| 2026-08-22 | 113 | `docs/B1_SALIDA_18AGO.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 129 | `docs/R6_CARRERA_3_CHEQUEO_PREVIO.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 134 | `docs/SERVER.md` | **VIVO** | entorno |
| 2026-08-22 | 154 | `data/prof_diff_20j.md` | foto | reporte de carga (data/) |
| 2026-08-22 | 160 | `docs/JWT_SERVICE_ROLE_ESTADO.md` | foto | relevamiento "estado" con fecha y guard propios — foto, no doc vivo |
| 2026-08-22 | 165 | `docs/B8_CONTROLES_FUERA_DE_R8.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 167 | `docs/DEPLOY_INVITE_USER_2026-07-28.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 185 | `docs/RECIBO_ROTULO_ROL_DIAGNOSTICO.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 193 | `docs/ALTA_FEDE.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 200 | `docs/R8_APUESTAS_FALTANTES_C4_C8.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 205 | `docs/ES_TITULAR_ROL_DIAGNOSTICO.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 213 | `docs/R8_ESTADO_LIQUIDACIONES_20260819.md` | foto | relevamiento "estado" con fecha y guard propios — foto, no doc vivo |
| 2026-08-22 | 228 | `docs/COTEJO_R6.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 238 | `docs/PORTAL_CARTA_Y_SOLICITUDES_DIAGNOSTICO.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 267 | `docs/PROBE_INVITE_USER_ANALISIS.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 271 | `docs/R8_CABALLERIZAS_HOMONIMAS.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 315 | `docs/AUDITORIA_PII_2026-08-20.md` | foto | auditoría/remediación fechada |
| 2026-08-22 | 325 | `data/asignacion_prof_20j_PREVIEW.md` | foto | reporte de carga (data/) |
| 2026-08-22 | 341 | `data/asignacion_prof_20j_report.md` | foto | reporte de carga (data/) |
| 2026-08-22 | 356 | `docs/INITAUTH_ACTIVO_DIAGNOSTICO.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 383 | `docs/PROBE_RUN_1.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 408 | `docs/R6_CARRERA_3_PENDIENTE.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 442 | `docs/COTEJO_R6_REMEDICION.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 592 | `docs/PLAN_REDERIVACION_PROPIETARIO_R8.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 631 | `docs/PLAN_PROPIETARIOS_PROVISORIOS_R8.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 73 | `docs/PENDIENTE_ROL_EN_CAMPO_PROPIO.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 846 | `docs/BITACORA_R8_PROVISORIOS_18AGO.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 96 | `data/prof_carga_20j_report.md` | foto | reporte de carga (data/) |
| 2026-08-22 | 96 | `RESULTADO.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-22 | 998 | `docs/RUNBOOK_R8_PROVISORIOS.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-23 | 101 | `docs/PASE_DOMINIO_PASO6.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-23 | 112 | `docs/TENENCIA_SPC_ESTADO.md` | foto | relevamiento "estado" con fecha y guard propios — foto, no doc vivo |
| 2026-08-23 | 130 | `docs/TENENCIA_SPC_LISTA_YESI.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-23 | 133 | `docs/PREGUNTAS_ABIERTAS.md` | **VIVO** | pendientes de producto |
| 2026-08-23 | 143 | `docs/TAREA3_SECRETS_INVITE_USER.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-23 | 154 | `docs/MERGE_GATE_4_PREVIO.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-23 | 168 | `docs/VERIFICACION_GATE_4_PROD.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-23 | 180 | `docs/DIAGNOSTICO_CUENTAS_2026-08-23.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-23 | 213 | `docs/PLAN_DUPLICADOS_SPC.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-23 | 217 | `docs/PORTAL_VALIDACION_INSCRIPCION.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-23 | 230 | `docs/REGLA_INSCRIPCION_MULTITURNO.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-23 | 236 | `docs/FIX_PORTAL_CARTA_LLAMADOS.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-23 | 291 | `docs/FIX_ACTIVACION_INVITADOS.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-23 | 308 | `SCHEMA.md` | **VIVO** | schema (parcial: módulo resultados) |
| 2026-08-23 | 364 | `docs/FIX_JSON_STUDBOOK_R8.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-23 | 374 | `docs/PLAN_DOMINIO_SIGH_COM_AR.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-23 | 449 | `docs/CHECKLIST_DOMINIO_SIGH.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-24 | 378 | `docs/PORTAL_INSCRIPCION_LIBRE_PROPUESTA.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-27 | 230 | `docs/DIAG_BONO_SIN_PROPIETARIO.md` | foto | bitácora / plan / resultado con fecha propia |
| 2026-08-30 | 167 | `docs/ESTADO_R8.md` | foto | relevamiento "estado" con fecha y guard propios — foto, no doc vivo |
| 2026-08-30 | 332 | `docs/INTEGRACION_STUDBOOK_ESTADO.md` | foto | relevamiento "estado" con fecha y guard propios — foto, no doc vivo |
| 2026-08-30 | 58 | `README.md` | **VIVO** | público |
| 2026-09-08 | 1622 | `docs/GOTCHAS.md` | **VIVO** | trampas |
| 2026-09-08 | 167 | `docs/MODELO_NUMERACION.md` | **VIVO** | regla de dominio |
| 2026-09-08 | 171 | `docs/LIQUIDACIONES_MODELO.md` | **VIVO** | modelo cerrado |
| 2026-09-08 | 411 | `docs/ESTADO.md` | **VIVO** | estado + snapshots |
| 2026-09-08 | 464 | `docs/SCHEMA.md` | **VIVO** | schema extendido |
| 2026-09-10 | 2102 | `docs/ISSUES.md` | **VIVO** | bugs/deudas |
| 2026-09-10 | 355 | `tests/README.md` | **VIVO** | harness de probes |
| 2026-09-11 | 1356 | `CHANGELOG.md` | **VIVO** | historial vivo |
| 2026-09-11 | 495 | `CLAUDE.md` | **VIVO** | operativo |

Notas sobre la clasificación:
- Los `docs/*_ESTADO.md` (`INTEGRACION_STUDBOOK_ESTADO`, `TENENCIA_SPC_ESTADO`, `YUNTA_MANDIL_ESTADO`, `JWT_SERVICE_ROLE_ESTADO`, `ESTADO_R8`) se llaman "estado" pero cada uno tiene **fecha y guard propios** en el encabezado (`sed -n 1,6p`: 03/08 con spcs=144, 23/08, 03/08 con 144, 20/08, 29/07 con 144). Son fotos. Los pongo así para que nadie los lea como vigentes.
- `docs/LIQUIDACIONES_GAP_ANALYSIS.md` es una foto del **2026-06-08** (línea 3) pero `CLAUDE.md:485` la presenta como "gap vivo". Va en la lista de vivos porque así se la lee — y por eso es de las que más daño hacen (§3).
- `docs/PROBE_TEMPLATE_ES.md` es foto (fecha 04/08, guard 144), no un template.

---

## 2. Verificaciones por tema (lo hecho del 27/08 al 11/09) — qué dice la base/el código hoy, qué dicen los docs vivos

Matriz de cobertura, `grep -c -i` por archivo (0 = el doc vivo no lo nombra):

```
tema                                  SCHEMA.md  docs/SCHEMA.md  CLAUDE  ESTADO  MODELO  GOTCHAS  ISSUES  CHANGELOG
emitir_recibo                              0          0            4       6       0       9        19       6
anular_recibo                              0          0            0       0       0       4        11      11
es_prueba                                  0          0            3       2       0       0        10       4
fn_edad_reglamentaria                      0          0            0       0       0       0         0       0
recibos_delete                             0          0            0       0       0       0         6       2
emitido_por                                0          1            0       0       0       8        10       3
liberar_linea                              0          0            3       5       1       1         4       4
apoderados                                 0          8            1       4       0       4         4       9
solicitudes(_acceso)                       0          0            0       0       0       1        17       9
rpc_padron_spcs                            0          0            0       0       0       0         0       0
montas reales / GATE MONTAS                –          –            0       0       –       0         0       0
revert recibo 4                            –          –            0       0       –       0         0       0
ventanas de R9                             –          –            0       0       –       0         0       0
condicion_sexo (fix T8/T10)                –          –            0       1       –       0         0       0
provisorio (los 40)                        –          –            0       0*      –       0         0       1*
```
`*` los únicos hits de "provisorio" en ESTADO/CHANGELOG son el *sender provisorio* de Resend, no los 40 propietarios.

| # | tema | verdad de hoy (cómo la verifiqué) | qué dice la doc viva | veredicto |
|---|---|---|---|---|
| 1 | `fn_edad_reglamentaria` + regla del 1/7 | Existe: `pg_proc` → `fn_edad_reglamentaria(p_fecha_ref date, p_fecha_nac date)`. Cliente: `edad-spc.js` (existe en raíz, `ls`). Probe `tests/probe_edad_reglamentaria.mjs` existe. Migración `migrations/fn_edad_reglamentaria.sql` existe. | **Ningún** doc vivo la nombra (matriz: 0 en los 8). `CLAUDE.md` la menciona sólo como comentario del probe ("la regla del 1° de julio"). `docs/SCHEMA.md` §Funciones (líneas 423-441) lista 12 funciones; la base tiene **47**. `edad-spc.js` no está en el árbol de `CLAUDE.md` (§6). | **falta en SCHEMA, GOTCHAS, CHANGELOG, CLAUDE** |
| 2 | `emitir_recibo` v1.2 (aislamiento por club + `emitido_por`) | `pg_proc`: firma `emitir_recibo(p_club_id, p_beneficiario_tipo, p_beneficiario_id, p_linea_ids uuid[], p_forma_pago, p_cobrador_nombre, p_cobrador_documento, p_comprobante_url)`. Migraciones: `emitir_recibo_fase4.sql`, `_v1_1.sql`, `_v1_2_aislamiento_club.sql` (`ls migrations`). `recibos.emitido_por` existe. | `CLAUDE.md:485` dice "RPC `emitir_recibo` (`1a50359`), v1.1 ... (`4851129`)" — **no menciona v1.2**. `docs/SCHEMA.md` no documenta la RPC (0 hits); `LIQUIDACIONES_MODELO.md` 0 hits. GOTCHAS #76 y #79 sí lo cubren. CHANGELOG `[2026-08-30] ISSUE-059/060/057` sí. `ESTADO.md` último snapshot dice "RPCs vivas: `emitir_recibo` (v1.1)". | **CLAUDE.md y ESTADO.md en v1.1; SCHEMA sin la RPC** |
| 3 | `anular_recibo` v1 y v2 con snapshot | `pg_proc`: `anular_recibo(p_recibo_id uuid, p_motivo text)`. Columnas `recibos.anulado_por`, `motivo_anulacion`, **`lineas_anuladas`** existen (`information_schema`). Migraciones `anular_recibo_v1.sql`, `anular_recibo_v2_snapshot.sql`. UI: `grep -c anular_recibo liquidaciones.html` = 4. | `CLAUDE.md` **0** hits. `docs/SCHEMA.md` §recibos (línea 172) lista `emitido_por, emitido_at, anulado_at, notas` — **faltan `anulado_por`, `motivo_anulacion`, `lineas_anuladas`** y la RPC. `ESTADO.md` 0. `LIQUIDACIONES_MODELO.md` 0 (§7 Recibo no sabe que se puede anular). CHANGELOG sí (3 entradas 30/08). | **falta en CLAUDE, SCHEMA, ESTADO, MODELO** |
| 4 | `reuniones.es_prueba` + la 9999 como sandbox que NO se borra | Columna existe; `count(*) where es_prueba` = **1**. `migrations/reuniones_es_prueba.sql` existe. Probe `probe_reunion_es_prueba.mjs` existe. | `CLAUDE.md:485` ✅ correcto ("NO se borra, decisión revertida 2026-08-29"). `ESTADO.md:20` dice "**sigue viva** ... Teardown gateado a Fede (ISSUE-035)" (snapshot 24/07, sin la reversión) — pero `ESTADO.md:68,72,116` sí tienen la nota de reversión. `docs/SCHEMA.md` §reuniones (línea 65-67): **no lista `es_prueba`, ni `numero_publico`, ni `sorteo_partidores`**; lista `condicion_pista`, que **no existe** en la base (`information_schema` de `reuniones`: `id, club_id, hipodromo_id, numero, fecha, tipo, estado, tiempo_clima, observaciones, creado_por, created_at, updated_at, hora_cierre_ratificacion, fechas_inscripciones, fechas_forfaits, fechas_compromiso_montas, sorteo_partidores, numero_publico, es_prueba`). | **SCHEMA desactualizado; ESTADO contradictorio entre snapshots** |
| 5 | Pagos: rol y carrera en tarjetas, filtro por concepto, panel post-emisión, solapa Recibos | `liquidaciones.html:203-205` tabs `Pagos / Recibos / Resumen` (`grep switchTab`). Filtro por concepto: comentarios en `:77`, `:948` ("pedido Valeria 30/08"). Panel post-emisión: `:953` ("ISSUE-056 — el último recibo emitido..."). Probe `probe_pagos_rol_carrera.mjs` existe. | `CLAUDE.md:485` describe Pagos hasta "recibo con logo + firma (`154c83e`)" y **Fase 5 Resumen**; nada de solapa Recibos, filtro por concepto ni panel post-emisión. `ESTADO.md` último snapshot: nada. `LIQUIDACIONES_MODELO.md` §7-9: nada. `MODULOS.md:19` dice Liquidaciones **❌ No funciona**. CHANGELOG: `[2026-08-30] Historial de recibos` ✅, filtro concepto 1 hit ✅; rol/carrera en tarjetas **0**. | **MODULOS ❌ es falso; CLAUDE/ESTADO/MODELO atrás; CHANGELOG sin rol-y-carrera (27/08)** |
| 6 | Saldado administrativo R6/R8 (GOTCHA #74) | GOTCHA #74 existe (línea 361) y #88 (línea 971). CHANGELOG `[2026-08-28] Saldado administrativo` ✅. `ISSUES.md:432,452` lo referencia. | `ESTADO.md:13-14` (snapshot 24/07): "79 headers / 203 líneas, todas en `estado='borrador'`... 31 líneas en `retenido`" — foto previa al saldado; sin nota. `LIQUIDACIONES_MODELO.md` §8 no conoce el estado "pagado sin recibo". `CLAUDE.md` 0. | **ESTADO y MODELO no lo saben** |
| 7 | Guard de `eliminarLiq` + revocación de `recibos_delete` | `liquidaciones.html:728` `eliminarLiq` consulta `recibo_id.not.is.null,estado_linea.eq.pagado` y bloquea. `pg_policies` sobre `recibos`: sólo `recibos_insert / recibos_select / recibos_update` — **no hay DELETE** ✅. Migración `revocar_recibos_delete.sql` existe. Policies DELETE de `liquidaciones` y `liquidacion_detalle` **siguen** (`liquidaciones_delete`, `liquidacion_detalle_delete`) — coincide con ISSUE-068 abierto. | CHANGELOG `[2026-08-30] ISSUE-065 cerrado + 067` ✅. `docs/SCHEMA.md` §RLS (456-464) no lo refleja; `SECURITY.md` 0 hits de `recibos`. `CLAUDE.md` 0. | **SCHEMA/SECURITY atrás** |
| 8 | Modal de Montas + gate al oficializar | `resultados.html:363` `#modal-montas`; `:1620-1638` bloque `GATE MONTAS` ("No se puede oficializar: N caballo(s) que largaron no tienen jockey cargado"). Migraciones `montas_r6_correccion.sql`, `personas_montas_r6.sql`. | **0 hits** en CLAUDE, ESTADO, ISSUES, GOTCHAS, CHANGELOG (`grep -i "montas reales\|GATE MONTAS\|gate de montas"`). `MODULOS.md` §resultados (36-45) no lo menciona. Sólo está en `reports` (`2026-08-28_aplicacion-montas-reales-y-gate.md`). | **no existe en ningún doc vivo** |
| 9 | Los 40 propietarios provisorios como decisión de Fede | 40 filas matchean `nombre/notas ilike '%provisorio%'` (query §0). La decisión está escrita en `reports`: `2026-08-27_relevamiento-pagos.md:340` ("los 40 provisorios sin completar, decisión de producto de Fede"). **Sin verificar**: el texto literal de lo que dijo Fede (no está en ningún doc de `main`; las bitácoras `BITACORA_R8_PROVISORIOS_18AGO.md` / `PLAN_PROPIETARIOS_PROVISORIOS_R8.md` son previas a la decisión). | `DECISIONES.md`: último ADR es **ADR-047 del 02/06** — no hay ADR. `ISSUES.md` 0 hits de "provisorio". `CLAUDE.md:485` sigue diciendo "Bloqueante de datos: `inscripciones.propietario_id` 10/95 (GOTCHA #47)" — hoy es **NULL en 147/253** (query §0), o sea el número está viejo y además la naturaleza cambió (ya no es "backfill pendiente", es "decisión de Fede: quedan provisorios"). | **falta ADR; número 10/95 viejo** |
| 10 | Logo por CSP + hora en 24 h | `clubs.logo_url` Dolores = `https://sigh.com.ar/logo-dolores-verde.png` (query). GOTCHA #78 (CSP) y #91 (hora) existen. `hour12:false` en `auditoria.html:265`, `liquidaciones.html:1521,1788`; hora "armada a mano" en `portal.html:416`, `inscripciones.html:378`. | CHANGELOG `[2026-08-30] ISSUE-064` ✅. **`docs/SNIPPETS.md:175`**: `UPDATE clubs SET logo_url = 'https://mdqclio.github.io/SGH/logo-dolores-192x192.png' WHERE sigla = 'HDO';` — apunta al host viejo **que la CSP bloquea** (ISSUE-064) **y** filtra por `sigla='HDO'` que **no matchea ninguna fila** (la sigla real es `DOL`). `docs/SNIPPETS.md:249`: `toLocaleString('es-AR', ...)` como snippet de moneda — `CLAUDE.md:236` dice "NUNCA `.toLocaleString()`". `CLAUDE.md` no tiene el formato 24 h. | **SNIPPETS con dos snippets que hacen daño** |
| 11 | Fix de hora local en carta-llamados + ventanas de R9 | `grep -c "isoAInputLocal\|inputLocalAISO" carta-llamados.html` = **13** → el fix de código **está en `main`** ✅. GOTCHA #92 existe. Las ventanas de R9 en la base: 11 turnos con `cierre_inscripcion` 11/09 12:00 AR, `apertura_ratificacion` 14/09 00:00, `cierre_ratificacion` 14/09 12:00 (verificado hoy, `2026-09-11_r9-verificacion-llamado-acomodado.md`). **Pero** el SQL que las corrigió vive en la rama **`fix/hora-ventanas-r9`** (`git log main..origin/fix/hora-ventanas-r9` = 1 commit: `migrations/fix_ventanas_r9_hora_argentina.sql`), **sin mergear** → `migrations/` en `main` no tiene el DDL/DML aplicado. | CHANGELOG: **ninguna entrada con fecha 2026-09-08** (`grep "^## \["`: salta de 09-07 a 09-10). "hora local" 1 hit (en otra entrada). `CLAUDE.md` 0. | **CHANGELOG sin el 08/09; migración fuera de `main`** |
| 12 | Forfait desde el portal + dos ventanas de ratificación | `rpc_baja_inscripcion(p_inscripcion_id)` en `pg_proc`; `grep -c rpc_baja_inscripcion portal.html` = 3; merge `c4684fc` en `main`. Migración `rpc_baja_inscripcion_forfait.sql`. ISSUE-074/075/076/077 escritos. | CHANGELOG 2 hits ("forfait desde el portal") pero **sin entrada propia del 08/09**. `docs/SCHEMA.md` no documenta `rpc_baja_inscripcion` ni `validar_inscripcion` ni `rpc_inscribir`. `CLAUDE.md` 0. `MODULOS.md:31` dice Portal **📋 Pendiente**. | **SCHEMA/CLAUDE/MODULOS atrás** |
| 13 | Circuito de registro: `identities`, "Ya casi", `club_id` en propietarios y profesionales | Tabla `solicitudes_acceso` existe (18 columnas, `information_schema`). RPCs `rpc_solicitar_acceso`, `rpc_aprobar_solicitud`, `rpc_rechazar_solicitud`, `rpc_descartar_solicitud`, `fn_solicitudes_guard_staff` en `pg_proc`. `propietarios.club_id` NULL en **0** filas (query). Páginas `solicitar-acceso.html`, `solicitudes.html` existen (`ls`). GOTCHAS #89, CLAUDE gotchas 16-17 ✅. CHANGELOG 09-02, 09-05, 09-07, 09-10 ✅. | `docs/SCHEMA.md`: **`solicitudes_acceso` 0 hits** — tabla entera sin documentar; §propietarios dice "GLOBALES — club_id nullable" (la columna sigue nullable, pero desde ISSUE-072 el alta la setea y el listado filtra por club: el rótulo "GLOBALES" ya no describe el comportamiento). `MODULOS.md:73-74` "Propietarios son globales". `CLAUDE.md` árbol: `solicitudes.html` **no listado**; `usuarios.auth_user_id` no está en SCHEMA. `CONTEXTO.md:24-30` roles: falta el circuito. | **SCHEMA sin la tabla; MODULOS/CONTEXTO con el modelo viejo** |
| 14 | Selector de reunión en carta-llamados | `carta-llamados.html:271` `<select id="sel-reunion" ... onchange="irAReunion(this.value)">`. | CHANGELOG 1 hit ✅. `CONTEXTO.md:39-49` describe la reunión activa sin el selector (menor). | ok / menor |
| 15 | Buscador con autocompletado (SPC en el portal) | **NO está en `main`.** `grep -l rpc_padron_spcs *.html *.js` → nada (portal.html usa `rpc_buscar_spc`). `git log main..origin/feat/buscador-spc-autocompletado` = 1 commit (`5ab8320`, 08/09: `portal.html`, `migrations/rpc_padron_spcs.sql`, `tests/probe_buscador_spc.mjs`). La RPC `rpc_padron_spcs()` **sí existe en la base** (`pg_proc`) → base adelantada al código de `main`. | `CLAUDE.md` 0, CHANGELOG 0 (correcto: no se mergeó). Pero la memoria de sesión del 08/09 (obs. 9832) dice "committed to main branch" — **falso**, verificado con `git log`. | **feature sin mergear; sin doc, correcto** |
| 16 | Bolsa efectiva vs nominal (GOTCHA #63) + probes de paridad (#93, #94) | GOTCHAS #63 (281), #93 (1412), #94 (1494) existen. `ESTADO.md:35-43` y `LIQUIDACIONES_MODELO.md:12-14` **corregidos el 08/09** ✅. | `MODULOS.md:98-101` "Sistema de bonos: Bono posición: monto por puesto del 6° en adelante (**hasta el 10°**)" — el modelo (§3) y los datos (`distribucion_premios.bono_posicion_hasta = 8` en los 11 turnos de R9) dicen **6°-8°**. `PREGUNTAS_ABIERTAS.md:8-16` "Liquidaciones — Pendiente construir" (todo hecho). CHANGELOG: **sin entrada** del fix del chip del portal (08/09). | **MODULOS contradice al modelo; CHANGELOG sin 08/09** |
| 17 | Las 18 altas de SPC y 181 → 199 | `count(*)`=199 ✓. `CLAUDE.md:255` = 199 ✓. CHANGELOG `[2026-09-11]` ✓. | **`CLAUDE.md:259`** "⚠️ El **181** incluye caballos de prueba" — viejo (§6). `CLAUDE.md:265` historial ok. **GOTCHA #75** título: "El guard de `spcs` = **181** incluye caballos de prueba" y **ISSUE-061** título "el guard de **181** no es el padrón real" — los dos con el número viejo. | **3 lugares con 181** |
| 18 | Protocolo de informes / salidas a archivo | `CLAUDE.md` §Protocolo de informes ✅ (incluye "pegame X = al archivo", `reports` atrás de `main`, `ls-remote`). | `CONTEXTO.md:36`: "Documentar el SQL ejecutado en la sesión correspondiente (**docs/SESION_YYYY-MM-DD.md**)" — patrón muerto (último `SESION_*` es del 21/05); hoy es `migrations/` + `docs/diagnosticos/` en `reports`. `CONTEXTO.md:34`: "Cada cambio se commitea y pushea **directo a main**" — contradice `CLAUDE.md` (ramas `feat/fix/chore`, no mergear sin OK). `SERVER.md:16-17` ✅. | **CONTEXTO describe el flujo de mayo** |

---

## 3. Afirmaciones viejas por archivo VIVO

### 3.1 `CLAUDE.md` (495 líneas, 2026-09-11)

| línea | dice | verdad hoy (cómo) |
|---|---|---|
| 34 | `reuniones.html — CRUD de reuniones (7 estados)` | `reuniones.estado` en uso: 5 valores (`programada, publicada, cancelada, finalizada, borrador`). El ENUM del SCHEMA lista 7; en la base hay 5. (A2) |
| 48, 486 | `portal.html (pendiente)` / `portal.html / registro-profesional.html: no construidos` | `wc -l portal.html` = existe y es la pantalla del circuito de inscripción libre + forfait (merge `c4684fc`). (D3) |
| 51 | `club-switcher.js ... (16 páginas)` | `grep -l club-switcher.js *.html \| wc -l` = **17**. (D2) |
| 24-56 (árbol) | 25 HTML, 8 JS listados | Reales **35 HTML, 11 JS**. Sin listar: `solicitudes.html`, `registro.html`, `reset-password.html`, `resultados_legacy.html`, 4 `mockup-no-corrio-*.html`, y los JS **`liquidaciones-engine.js`**, **`edad-spc.js`**, `activacion-pendiente.js`. (B1) |
| 60-75 (árbol docs) | 13 docs listados | `ls docs/*.md \| wc -l` = **123**. (B2) |
| 76-85 (árbol tests) | 8 probes listados | `ls tests/*.mjs \| wc -l` = **81**. (B3) |
| 86-90 (árbol migrations) | 5 SQL listados | `ls migrations/*.sql \| wc -l` = **92**. (B4) |
| 123 | `reuniones ... Estados: borrador/publicada/confirmada/anulada` | Reales: `programada, publicada, cancelada, finalizada, borrador`. `confirmada`/`anulada` **no existen** en reuniones. (A2) |
| 229 | `Roles: super_admin → admin.html \| secretario_carreras → index.html` | `usuarios.rol` hoy: **5 roles** (`operador:3, super_admin:1, propietario:3, secretario_carreras:2, profesional:10`), 19 usuarios. `operador` es el rol de Yesi; `profesional`/`propietario` van al portal. (A4, agravado: en agosto eran 4 roles / 7 usuarios) |
| 233 | `Verificado el 02/06/2026` (MCP con escritura) | Sigue siendo cierto — se usó hoy (`apply_migration spcs_r9_tanda_1`). Fecha de 3 meses. (D5) |
| **259** | `⚠️ El **181** incluye caballos de prueba` | Baseline es 199 (línea 255). El párrafo quedó con el número viejo. (§6) |
| 359 | `Reunión 5 — 17/05/2026 — Hipódromo de Dolores (11 turnos, ~81 inscripciones)` | Query hoy: R5 Dolores `c90b6186…` tiene **0 turnos, 0 inscripciones**, `finalizada`; homónima en Mi Club Hípico también 0/0. Fijarla no da nada que testear. (A1) |
| 485 | `Bloqueante de datos: inscripciones.propietario_id 10/95 (GOTCHA #47)` | Hoy **147 NULL de 253**. Y ya no es "bloqueante pendiente de backfill": es decisión de Fede (40 provisorios). |
| 485 | `Fase 4 ... v1 (1a50359), v1.1 (4851129)` — sin v1.2, sin `anular_recibo`, sin historial, sin filtro por concepto, sin saldado | Ver §2 filas 2, 3, 5, 6. Este párrafo es la foto del 10/06 con la nota de la 9999 pegada al final. |
| 480-490 | "Bugs conocidos" corta en ISSUE-029 | `ISSUES.md` llega a **ISSUE-079** (79 entradas, `grep -c`). No declara el corte. (D6) |
| 3 | `(HDO)` como sigla de Dolores | `clubs.sigla` = **`DOL`**. Misma trampa en `ESTADO.md:269` y en el snippet de `SNIPPETS.md:175`. |
| — | No dice que existe la tabla **`hipodromos`** (7 filas, `cantidad_gateras`), ni `reuniones.numero_publico`, ni `caballeriza_responsables.rol` | (C1-C4, sin cambios desde el 28/08) |

### 3.2 `docs/ESTADO.md` (411 líneas; snapshot más nuevo **2026-07-24**) — ver §5, lista aparte

### 3.3 `docs/SCHEMA.md` (464 líneas, último ALTER registrado 2026-06-10)

| dónde | dice | verdad hoy |
|---|---|---|
| §usuarios (25-27) | 14 columnas, sin `auth_user_id` | La base tiene `auth_user_id` (`information_schema`). `club_id FK clubs NOT NULL` — **sin verificar** si sigue NOT NULL (hay 13 usuarios de portal; no chequeé la constraint). |
| §propietarios (33) | "GLOBALES — club_id nullable" | Columna nullable sí, pero **0 filas con NULL** y el alta/listado van por club desde ISSUE-072 (07/09). El rótulo describe el modelo de mayo. |
| §reuniones (65-67) | lista `condicion_pista`; no lista `es_prueba`, `numero_publico`, `sorteo_partidores` | `condicion_pista` **no existe**; las otras tres **sí**. |
| §recibos (172-176) | `emitido_por, emitido_at, anulado_at, notas, created_at` | Faltan **`anulado_por`, `motivo_anulacion`, `lineas_anuladas`** (v2 snapshot). |
| §notificaciones (215-216) | tabla `notificaciones` | **No existe** en `information_schema.tables` (37 tablas; no está). |
| — | no existe sección | **`solicitudes_acceso`** (18 columnas) y **`apoderados`** (sólo aparece en la lista de RLS, sin columnas). |
| §Funciones de seguridad (423-441) | 12 funciones | `pg_proc` en `public`: **47**. Faltan, entre otras, `fn_is_staff`, `fn_is_portal_user`, `fn_mis_spc_ids/visibles`, `fn_mis_entidades`, `fn_edad_reglamentaria`, `validar_inscripcion`, `rpc_inscribir`, `rpc_baja_inscripcion`, `rpc_buscar_spc`, `rpc_padron_spcs`, `rpc_padron_profesionales`, `rpc_solicitar_acceso`, `rpc_aprobar/rechazar/descartar_solicitud`, `fn_solicitudes_guard_staff`, `emitir_recibo`, `anular_recibo`, `liberar_linea`, `desoficializar_carrera`, `reordenar_turnos`, `siguiente_numero_publico`, `calcular_premio`, `fn_usuarios_guard_privilegios`, `fn_usuarios_set_auth_user_id`, `fn_inscripcion_set_propietario`, `fn_caballeriza_resp_set_propietario`, `fn_audit_policies_permisivas`, `set_updated_at`. |
| §RLS (456-464) | "26 tablas ... Sin tablas con policy permisiva residual" | RLS activa en **34** tablas. No refleja `recibos` sin DELETE ni ISSUE-068. |
| §ALTER TABLE ejecutados (238-393) | último con fecha 2026-06-10 | Todo lo de julio-septiembre (`es_prueba`, `numero_publico`, `auth_user_id`, `lineas_anuladas`, `solicitudes_acceso`, `peso_balanza` constraint, ...) no está. |

### 3.4 `SCHEMA.md` (raíz, 308 líneas, "as of 2026-05-28")

`CLAUDE.md:58` lo llama "Schema de DB documentado (**fuente de verdad**)". `grep -n "^## "`: cubre **sólo** `resultados`, `resultado_apuestas`, `carrera_apuestas`, RPC `aplicar_resultado`, `inscripciones` (columnas de resultados). Cero de `reuniones, clubs, spcs, profesionales, recibos, liquidaciones…` (tabla de cobertura en §9). Es el schema del módulo resultados, no de la base. El rótulo es el problema, no el archivo.

### 3.5 `docs/ARQUITECTURA.md` (72 líneas, 2026-08-21)

| línea | dice | verdad |
|---|---|---|
| **34** | `CRÍTICO: Usar siempre la key eyJ... NO la sb_publishable_...` | **Al revés.** Las `eyJ` están desactivadas desde 2026-06-07 (401). `CLAUDE.md:101`, GOTCHAS #1. Quien copie esto escribe código que no conecta. |
| 45 | `propietario/profesional → portal.html (pendiente)` | Portal vivo (13 usuarios de portal). |
| 33 | `CLUB_ID prueba: a6da7e40-…` | Existe (`Mi Club Hípico`, sigla MCH). ✅ |

### 3.6 `docs/DECISIONES.md` (212 líneas, 2026-06-02)

| dónde | dice | verdad |
|---|---|---|
| **29** | `Decisión: Usar key eyJ... NO sb_publishable_...` | Invertida (ver 3.5). Un ADR vigente que dice lo contrario del gotcha #1. |
| ADR-027 (110) | "Distribución interna fija 70/10/10/4/3/1/2 **hardcodeada**" | Superada por Fase 1: los % salen de `liquidacion_config` (`LIQUIDACIONES_GAP_ANALYSIS.md:39`, código `liquidaciones.html:613-620`). Sin nota de superación. |
| ADR-047 (210) | "Retención anti-doping ... **pendiente Fase 3**" | Fase C viva desde 06/2026. |
| último ADR | ADR-047, 02/06/2026 | Sin ADR para: 9999 como sandbox (29/08), 40 provisorios (Fede), saldado administrativo (28/08), liberación **manual** del doping, `anular_recibo` con snapshot, aislamiento por club en cobros, edad reglamentaria 1/7, `es_prueba`. |

### 3.7 `docs/CONTEXTO.md` (67 líneas, 2026-05-21)

| línea | dice | verdad |
|---|---|---|
| 34 | "Cada cambio se commitea y pushea directo a main" | `CLAUDE.md` §Workflow: ramas `feat/fix/chore`, merge con OK. |
| 35 | "La validación se hace siempre en producción: **mdqclio.github.io/SGH/**" | `sigh.com.ar`; el host viejo "puede servir contenido viejo" (`CLAUDE.md:419`). |
| 36 | "Cambios de schema ... vía **SQL Editor** ... documentar en `docs/SESION_YYYY-MM-DD.md`" | MCP con escritura + `migrations/` + `reports`. Último `SESION_*`: 21/05. |
| 24-30 | roles: 6 listados, "publico: solo lectura" | En la base hay 5 en uso; no existe usuario `publico`. Sin el circuito `solicitar-acceso → solicitudes → aprobación`. |
| 60 | `club-switcher.js ... 16 páginas` | 17. |

### 3.8 `docs/MODULOS.md` (107 líneas, 2026-05-27)

| línea | dice | verdad |
|---|---|---|
| 19 | `Liquidaciones \| ❌ No funciona` | Fases 0-5 + Pagos + recibos + anulación + historial vivos; 5 recibos emitidos en prod. |
| 31-32 | Portal 📋, Registro profesional 📋 | Portal vivo; `registro-profesional.html` (65 líneas) reemplazado en la práctica por `solicitar-acceso.html` (**sin verificar** si `registro-profesional.html` sigue linkeado desde algún lado). |
| 14 | Carta de llamados 🔧 | Hoy es la pantalla con la que Yesi editó R9 (auditoría de hoy). |
| 67-68 | "Carta de llamados: una vez publicada **no se puede modificar**. Para desbloquear: `UPDATE reuniones SET estado='borrador'`" | R9 está `publicada` y Yesi editó T5/T10/T11 hoy desde `carta-llamados.html` (3 UPDATE en `auditoria`, rol `operador`). La regla no rige. |
| 73-74 | "Propietarios son globales" | Ver 3.3. |
| 100 | "Bono posición: ... del 6° en adelante (**hasta el 10°**)" | Modelo §3: 6°-8°. Datos: `bono_posicion_hasta = 8` en los 11 turnos de R9. |
| 36-45 | §resultados: sin gate de montas, sin des-oficializar por RPC | `resultados.html:1620` GATE MONTAS; `desoficializar_carrera` en `pg_proc`. |
| — | no menciona `solicitudes.html`, `solicitar-acceso.html`, `auditoria.html` | existen. |

### 3.9 `docs/LIQUIDACIONES_MODELO.md` (171 líneas, 2026-09-08)

| línea | dice | verdad |
|---|---|---|
| 5-9 | "Estado de implementación (branch `feat/liquidaciones-cd`, **NO en prod salvo schema**) ... ⏳ Fase 2bis, ⏳ Fase 3, ⏳ Fase 4, ⏳ Fase 5, ⏳ Fase 6" | Todo salvo Fase 6 está vivo desde junio (`CLAUDE.md:485`, ESTADO snapshots 06/08-06/10). El encabezado es de antes del merge `ccef143`. |
| 121-125 | "§8ter Autorizaciones — **pendiente v1.2** ... Hoy v1.1 captura cobrador libre" | Apoderados v1+v1.1 vivos desde 10/06 (tabla `apoderados` en la base). |
| §7-8 | Recibo: no dice que se puede **anular** (`anular_recibo`, snapshot en `lineas_anuladas`), ni que `emitido_por` se registra, ni que hay aislamiento por club, ni el estado "pagado sin recibo" (saldado administrativo, GOTCHA #74/#88) | Ver §2 filas 2, 3, 6. |
| 155-171 | "Gaps técnicos ... Actualización 02/06" con `propietario_id` "0/87" | Rótulo de histórico ok; el 0/87 y el 10/95 de arriba son fotos. |

### 3.10 `docs/LIQUIDACIONES_GAP_ANALYSIS.md` (225 líneas, foto del 2026-06-08)

| línea | dice | verdad |
|---|---|---|
| 21-27 | `recibos` 0 filas / `club_secuencias` 0 / `estado_linea` "NO se setea" / `fecha_liberacion` "NO se setea" | `recibos` = 5 filas; todo eso está en uso. |
| 74 | "**NO existen** `oficializar_reunion`, `emitir_recibo`, ni función de secuencia" | `emitir_recibo`, `fn_siguiente_recibo`, `desoficializar_carrera` en `pg_proc`. |
| 82-91, 125-140 | Fases 2bis/3/4/5 ⏳; §7, §8, §9 ❌ FALTANTE | Vivas. |

No es que el archivo esté mal: es del 08/06 y lo dice en la línea 3. Lo que está mal es `CLAUDE.md:485` llamándolo "gap vivo" y `ISSUES.md:7` "Gap vivo". Va como foto o se reescribe — decisión tuya.

### 3.11 `docs/SNIPPETS.md` (311 líneas, 2026-08-21)

| línea | dice | verdad |
|---|---|---|
| **175** | `UPDATE clubs SET logo_url = 'https://mdqclio.github.io/SGH/logo-dolores-192x192.png' WHERE sigla = 'HDO';` | Host bloqueado por CSP (ISSUE-064) **y** `sigla='HDO'` no matchea (es `DOL`): el snippet no hace nada, y si se "arregla" la sigla rompe el logo. |
| **243-249** | "Formato de moneda — variante resultados.html": `toLocaleString('es-AR', ...)` | `CLAUDE.md:236` y GOTCHA #16/#62: nunca `toLocaleString`. `resultados.html` hoy usa `formatARS` (**sin verificar** línea exacta; `grep -c toLocaleString resultados.html` no lo corrí). |
| 3-11 | "Conexión Supabase (patrón)" | **sin verificar** que el snippet use `sb_publishable` — no lo abrí; `grep eyJ docs/SNIPPETS.md` = 0, o sea al menos no tiene la key muerta. |
| — | Nada de `fn_edad_reglamentaria`, `emitir_recibo`, `es_prueba`, `translate()` en vez de `unaccent()` (GOTCHA #71) | los patrones que sí se usan hoy. |

### 3.12 `docs/PREGUNTAS_ABIERTAS.md` (133 líneas, 2026-08-23)

| línea | dice | verdad |
|---|---|---|
| 8-16 | "Liquidaciones — Pendiente construir: ..." (7 ítems) | Todos hechos salvo "montas perdidas tipo 2 (por carrera)" (Fede dijo que no existe, MODELO §4). |
| 18-26 | Portal: "registro-profesional.html: auto-registro ... Super admin aprueba desde admin.html" | El circuito real es `solicitar-acceso.html` → `solicitudes_acceso` → `solicitudes.html` (RPCs `rpc_aprobar_solicitud`...). |
| 28-30 | "RLS por club — Cuando implementar: cuando haya 2+ clientes" | Implementada 14/05 (34 tablas). |
| 32-35 | "Email service — Opciones: Resend o SendGrid ... Pendiente" | Resend activo desde 07/2026 (`ESTADO.md:24`). |
| 42-45 | "Dominio propio — Actualmente: mdqclio.github.io/SGH/" | `sigh.com.ar` (CNAME). |
| 87-88 | "12. Selector de hipódromo para super_admin" pendiente | `club-switcher.js` desde 20/05. |
| 124-128 | Forfait sin motivo, cierre automático a las 12, sorteo automático de gateras, reorden post-ratificación | **sin verificar** uno por uno; `reordenar_turnos` y `reuniones.sorteo_partidores` existen en la base, así que al menos dos de estos cuatro tienen algo hecho. |

### 3.13 `docs/GOTCHAS.md` (1622 líneas, 95 entradas)

| entrada | dice | verdad |
|---|---|---|
| **#22** (87-88) | "Supabase MCP es **read-only** — INSERT/UPDATE/DELETE van al SQL Editor" | Falso desde 02/06 (`CLAUDE.md:233`); hoy se aplicó una migración por MCP. Sin marca de obsoleto — el único gotcha que contradice a `CLAUDE.md` de frente. |
| **#75** (393) | "El guard de `spcs` = **181** incluye caballos de prueba" | 199. |
| #1 (8) | tiene la nota "OBSOLETO el consejo anterior" ✅ | patrón a copiar en #22. |
| — | falta un gotcha para: la regla del 1/7 (`edad-spc.js` parsea a mano por el corrimiento UTC-3 — está en el comentario del código, no en GOTCHAS); `sigla='DOL'` no `HDO` | |

### 3.14 `docs/ISSUES.md` (2102 líneas, 79 issues)

| dónde | dice | verdad |
|---|---|---|
| ISSUE-001 (5-8) | "Estado: 🔄 En progreso — Fase 0/1/2 + Fase C VIVAS ... **(2026-06-08)**"; "Gap vivo: `LIQUIDACIONES_GAP_ANALYSIS.md`" | El issue paraguas quedó con el estado de junio; Fase 4/5, recibos, anulación, saldado, aislamiento no están en su encabezado (**sin verificar** el cuerpo completo del issue — leí sólo las primeras 12 líneas). |
| ISSUE-061 (904) | título "el guard de **181** no es el padrón real" | 199. |
| — | no hay issue para el desacuerdo `edad_minima_anos` vs texto en T9 de R9 (hallazgo de hoy) ni para `notificaciones` documentada sin existir | |

### 3.15 `docs/SECURITY.md` (137 líneas, 2026-05-20)

"Tablas endurecidas (26)" → **34** con RLS. Funciones helper: sin `fn_is_staff`, `fn_is_portal_user`, `fn_mis_*`, `fn_solicitudes_guard_staff` (`grep` = 0). Sin `recibos` (revocación de DELETE), sin GOTCHA #80 (SECURITY DEFINER no protegido por RLS). Es el modelo de mayo.

### 3.16 `docs/SERVER.md` (134 líneas, 2026-08-22)

Sustancialmente correcto (sin browser, `.env`, keys). Cosmético: línea 21 "modelo Opus 4.x"; línea 30 kernel `7.0.0-22` (hoy `7.0.0-27-generic`, `uname`). Línea 70 referencia `tests/probe_fase_c.mjs` — existe ✅.

### 3.17 `README.md` (58 líneas, 2026-08-30)

URL `sigh.com.ar` ✅ (hallazgo E del 28/08 **resuelto**). `portal.html — "Portal principal"`: es el portal de profesionales/propietarios, no el principal. Faltan `solicitar-acceso.html`, `solicitudes.html`, `index.html`.

### 3.18 `tests/README.md` (355 líneas, 2026-09-10) — **al día** en lo que miré (`grep "^## "`): tiene el patrón sin browser, los probes de ISSUE-072/078, el restore por estado. No lo leí entero (**sin verificar** el cuerpo de "Probes de regresión vigentes", líneas 69-129, contra los 81 archivos).

### 3.19 `docs/MODELO_NUMERACION.md`, `assets/programa-oficial-color/README.md` — sin hallazgos (no los verifiqué contra código más allá del encabezado; **sin verificar**).

### 3.20 `docs/SPEC.md` — placeholder: 14 líneas, `mdqclio.github.io/SGH/` en la 13, todo lo demás duplica CONTEXTO/ARQUITECTURA.

---

## 4. Los 17 hallazgos del 28/08 (`2026-08-27_auditoria-claude-md.md`, estado post `2026-08-28_aplicacion-claude-md-a3-a6.md`)

Cerrados entonces: A3, A6. Quedaban 17. Verificados hoy contra `CLAUDE.md` @ `ce5dd3c` y la base:

| # | hallazgo | hoy | evidencia |
|---|---|---|---|
| A1 | R5 "11 turnos, ~81 inscripciones" como reunión de testing | **sigue** (`CLAUDE.md:359`) | query: R5 Dolores 0 turnos / 0 inscr, `finalizada` |
| A2 | `reuniones` "borrador/publicada/confirmada/anulada" + "7 estados" | **sigue** (`:123`, `:34`) | 5 valores reales, sin `confirmada`/`anulada` |
| A4 | Auth: 2 roles documentados | **sigue y empeoró** (`:229`) | 5 roles, 19 usuarios (eran 4 roles / 7) |
| A5 | 9999 "borrar antes del 20/6" | **resuelto — al revés de lo que pedía el hallazgo** | `CLAUDE.md:485`: "NO se borra (decisión revertida 2026-08-29)"; `es_prueba=true`; ISSUE-055 cerrado. El hallazgo decía "borrarla, la fecha pasó"; la decisión fue conservarla como sandbox y sacarla del circuito de cobro. `ESTADO.md:20` todavía tiene el texto viejo ("Teardown gateado a Fede, ISSUE-035") en el snapshot 24/07, aunque los snapshots de junio (68, 72, 116) tienen la reversión. |
| B1 | HTML/JS sin listar | **sigue y creció**: 35 HTML / 11 JS reales vs 25 / 8 listados | `ls`; sin listar `solicitudes.html`, `liquidaciones-engine.js`, `edad-spc.js`, ... |
| B2 | `docs/` con 13 listados | **sigue**: 123 reales | `ls docs/*.md` |
| B3 | `tests/` con 8 listados | **sigue**: 81 reales | `ls tests/*.mjs` |
| B4 | `migrations/` con 5 listados | **sigue**: 92 reales | `ls migrations/*.sql` |
| B5 | `CNAME` no aparece | **resuelto** | `CLAUDE.md:417` lo nombra |
| C1 | tabla `hipodromos` no documentada en CLAUDE | **sigue** | `grep hipodromos CLAUDE.md` = sólo `hipodromos.html` |
| C2 | `cantidad_gateras` "en el alta de hipódromo" sin decir que está en `hipodromos` | **sigue** (`:494`) | idem |
| C3 | `caballeriza_responsables.rol` | **sigue** (`:139`) | tabla descrita como "Propietario + copropietarios" sin `rol`/`activo` |
| C4 | `reuniones.numero_publico` | **sigue** | `grep numero_publico CLAUDE.md` = 0 |
| D1 | "40 entradas" de GOTCHAS | **resuelto**: dice 95 (`:468`) y son 95 (`grep -c "^## [0-9]"`) | |
| D2 | club-switcher "16 páginas" | **sigue** (`:51`): 17 | `grep -l` |
| D3 | portal "pendiente / no construidos" | **sigue** (`:48`, `:486`) | |
| D4 | 13 tipos de apuesta vs 9 en uso | **sigue**, informativo | **sin verificar** hoy el conteo de tipos en uso |
| D5 | "Verificado el 02/06" | **sigue**, sigue siendo cierto | apply_migration hoy |
| D6 | Bugs conocidos hasta ISSUE-029 | **sigue**: ISSUES llega a 079 | `grep -c` |
| E | `README.md:13` con mdqclio | **resuelto** (`sigh.com.ar`) | |

**Balance: 3 resueltos (A5 con decisión inversa, B5, D1) + E fuera de lista; 14 siguen; 2 de los que siguen se agravaron (A4, B1).**

---

## 5. `docs/ESTADO.md` — todo lo que le falta

Snapshot más nuevo: **2026-07-24** (línea 7). Es el vivo más viejo en contenido (el commit del 08/09 sólo pegó la corrección del GOTCHA #63 en el snapshot del 21/07). Entre el 24/07 y hoy pasó, y no está:

**Reuniones / operación**
1. **R8 (16/08)** corrió y se oficializó — el snapshot dice "Próxima reunión: R8, `publicada`, 12 carreras" (línea 19). Hoy: **sin verificar** el estado exacto de R8 en la base (no lo consulté); el saldado del 28/08 la nombra como cobrada.
2. **R9 (20/09)** publicada, 11 turnos, inscripciones abiertas hasta hoy 12:00, `condicion_sexo` T8/T10 corregido (08/09), edad de T5/T10/T11 corregida por Yesi (11/09), T9 pendiente.
3. Calendario: la base tiene 14 reuniones (`programada:3, publicada:1, cancelada:2, finalizada:6, borrador:2`), R10-R12 programadas (11/10, 22/11, 27/12 — query de hoy en `2026-09-11_r9-cruce-spcs-planilla.md` §4).

**Liquidaciones / Pagos**
4. Saldado administrativo de R6 y R8 (28/08, GOTCHA #74/#88) — el snapshot dice "todas en borrador, 31 retenidas" (13-14).
5. `emitir_recibo` v1.2 (aislamiento por club + `emitido_por`) — dice v1.1 (141, 156).
6. `anular_recibo` v1 → v2 con snapshot (`lineas_anuladas`), UI de anulación (ISSUE-056), solapa Recibos / historial.
7. Filtro por concepto en Pagos (30/08), panel post-emisión, rol y nº de carrera en las tarjetas (27/08).
8. Revocación de `recibos_delete` (ISSUE-065) y guard de `eliminarLiq` (ISSUE-067). ISSUE-068 abierto (DELETE de liquidaciones).
9. Reversión del recibo 4 (28/08) — **sin verificar** detalle; sólo el nombre del diagnóstico (`2026-08-28_ejecucion-revert-recibo-4.md`).
10. Modal de Montas en resultados + gate al oficializar (28/08).
11. Los 40 propietarios provisorios como decisión de Fede — "Backfill propietarios (10/95)" (128, 142, 157, 191) ya no es un pendiente de backfill.

**Datos**
12. `reuniones.es_prueba` y la 9999 conservada (ISSUE-055) — la línea 20 dice lo contrario.
13. `spcs`: 144 (julio) → 179 → 183 → 181 → **199** (R9 tanda 1, hoy). Duplicados unificados 23/08. Wave Rimout sigue duplicado.
14. Regla de edad reglamentaria (1/7): `fn_edad_reglamentaria` + `edad-spc.js` + gate de inscripción (27/08).
15. `peso_balanza` constraint 300-600 (23/08, GOTCHA #73).

**Portal / registro**
16. Autorregistro Gates 0-4, `solicitudes_acceso`, `solicitar-acceso.html`/`solicitudes.html`, activación automática de invitados (23/08), fix identities (02/09), "Ya casi" (05/09), `club_id` en propietarios (07/09) y alta de entrenador por operador (10/09) — el snapshot dice "Auto-registro fuera de v1 ... Etapas (c) y (d) pendientes" (23-26).
17. Inscripción libre (24/08), monta declarada al anotar (25/08), forfait desde el portal + dos ventanas de ratificación (08/09, ISSUE-074/075/077).
18. Portal: buscador de SPC con autocompletado — **sin mergear** (rama `feat/buscador-spc-autocompletado`).

**Infra / doc**
19. Dominio `sigh.com.ar` — la línea 208 dice "Producción: https://mdqclio.github.io/SGH/". Logo por CSP (ISSUE-064).
20. Fix de hora local en `carta-llamados.html` + ventanas de R9 en hora Argentina (08/09, GOTCHA #92); hora en 24 h (GOTCHA #91).
21. Selector de reunión en carta-llamados (02/09).
22. Bolsa efectiva en el chip del portal (08/09) + probes de paridad (#93, #94).
23. Protocolo de informes (`reports`, salidas a archivo) y la regla "relevar en `main`".
24. Swap / `chroma-mcp` (22/08, SERVER.md).
25. Sección "Producción / Funcionando / Pendiente de construir" (208-264): "Reuniones: CRUD con 7 estados", "Pendiente de construir: Portal, Auto-registro, Emails automáticos (pendiente Resend)" — todo eso está construido. "Clientes activos: sigla **HDO**" → `DOL`.
26. "Datos cargados en Dolores (may-2026)": 77 entrenadores / 201 caballerizas / 7 jockeys — hoy `profesionales` 190, `caballerizas` 299. Está rotulado como foto de mayo, así que no es error, pero es lo primero que se lee.

---

## 6. Números que quedaron con el valor viejo (además de `CLAUDE.md:259`)

| archivo:línea | número viejo | valor hoy | cómo |
|---|---|---|---|
| `CLAUDE.md:259` | "El **181** incluye caballos de prueba" | 199 | `count(*)` |
| `docs/GOTCHAS.md:393` (#75 título) | "guard de `spcs` = **181**" | 199 | idem |
| `docs/ISSUES.md:904` (ISSUE-061 título) | "guard de **181**" | 199 | idem |
| `CLAUDE.md:51`, `docs/CONTEXTO.md:60`, `docs/ESTADO.md:245,356,364` | club-switcher "**16** páginas" | 17 | `grep -l club-switcher.js *.html \| wc -l` |
| `CLAUDE.md:485`, `docs/ESTADO.md:128,142,157,191`, `docs/LIQUIDACIONES_GAP_ANALYSIS.md:29,155` | `propietario_id` "**10/95**" | 147 NULL de 253 (o sea 106/253 cargados) | query §0 |
| `docs/LIQUIDACIONES_MODELO.md:157` | "**0/87**" | idem | |
| `docs/SECURITY.md:35`, `docs/SCHEMA.md:458` | RLS en "**26** tablas" | 34 | `pg_tables.rowsecurity` |
| `docs/SCHEMA.md:423-441` | "**12** funciones" (implícito) | 47 en `public` | `pg_proc` |
| `CLAUDE.md:34`, `docs/ESTADO.md:215` | reuniones "**7** estados" | 5 en uso | query |
| `CLAUDE.md:229`, `docs/CONTEXTO.md:24-30` | 2 / 6 roles | 5 en uso, 19 usuarios | query |
| `docs/ESTADO.md:47` | "profesionales **167**" (post-restore 14/07) | 190 | query — rotulado como foto, no error |
| `docs/ESTADO.md:13-14` | "79 headers / 203 líneas / 31 retenidas" | **sin verificar** hoy (no recontamos liquidaciones); seguro cambió con el saldado del 28/08 | |
| `docs/LIQUIDACIONES_GAP_ANALYSIS.md:21-22` | `recibos` **0** filas, `club_secuencias` **0** | `recibos` = 5 | query §0 |
| `docs/INTEGRACION_STUDBOOK_ESTADO.md`, `YUNTA_MANDIL_ESTADO.md`, `ESTADO_R8.md`, `PROBE_TEMPLATE_ES.md` | guard "spcs → **144**" | 199 — son fotos, **no se reescriben** (regla de `CLAUDE.md:261`), pero explica por qué un lector los toma por viejos | |
| `CLAUDE.md:3`, `docs/ESTADO.md:269`, `docs/SNIPPETS.md:175` | sigla "**HDO**" | `DOL` | `select sigla from clubs` |

---

## 7. Propuesta de orden para corregir — por riesgo

### Grupo 1 — hace escribir código o SQL mal (corregir primero)

| # | archivo:línea | problema | por qué es grupo 1 |
|---|---|---|---|
| 1.1 | `docs/ARQUITECTURA.md:34` | "usar siempre la key `eyJ`" | Copiarlo = 401 en todo. Es el mismo tipo de trampa del 08/09 (doc v1 contra gotcha vigente). |
| 1.2 | `docs/DECISIONES.md:29` | ADR: "usar `eyJ`, NO `sb_publishable`" | Un ADR se lee como decisión vigente. |
| 1.3 | `docs/GOTCHAS.md:87` (#22) | "MCP read-only, DML al SQL Editor" | Manda a una sesión nueva a pegar SQL a mano en el dashboard en vez de `apply_migration` trackeado. Marcar OBSOLETO como el #1. |
| 1.4 | `docs/SNIPPETS.md:175` | `UPDATE clubs ... logo_url = mdqclio... WHERE sigla='HDO'` | Host bloqueado por CSP + sigla inexistente. |
| 1.5 | `docs/SNIPPETS.md:243-249` | snippet de moneda con `toLocaleString` | Contra `CLAUDE.md:236`, GOTCHA #16/#62. |
| 1.6 | `docs/SCHEMA.md` §reuniones, §recibos, §usuarios, §notificaciones, §Funciones, + `solicitudes_acceso`/`apoderados` ausentes | columnas que no existen (`condicion_pista`, tabla `notificaciones`) y columnas/RPCs que sí existen y no están | Un `.select()` escrito desde este doc trae `condicion_pista` y explota, o no sabe que `emitir_recibo` pide `p_club_id`. `CLAUDE.md:58` lo llama "fuente de verdad". |
| 1.7 | `SCHEMA.md` (raíz) — rótulo en `CLAUDE.md:58` | "fuente de verdad" para un doc que cubre 5 objetos | Re-rotular ("schema del módulo resultados") o fusionar. |
| 1.8 | `docs/LIQUIDACIONES_GAP_ANALYSIS.md` — rótulo en `CLAUDE.md:485` e `ISSUES.md:7` | "gap vivo" para una foto del 08/06 que dice "`emitir_recibo` NO existe" | Reclasificar como foto (una línea arriba del archivo) o reescribir. Es exactamente el mecanismo del bug del 08/09. |
| 1.9 | `docs/MODULOS.md:67-68` | "publicada no se puede modificar; `UPDATE reuniones SET estado='borrador'`" | Induce a bajar una reunión publicada a borrador para editar algo que hoy se edita directo. |
| 1.10 | `docs/MODULOS.md:100` | bono posición "hasta el 10°" | Contradice modelo §3 y datos (6-8). |
| 1.11 | `CLAUDE.md:359` (A1) | reunión de testing R5 con 11 turnos | Manda a fijar una reunión vacía. Reemplazar por la 9999 (`es_prueba`) que es el sandbox real. |
| 1.12 | `CLAUDE.md:123,34` (A2) + `:229` (A4) | estados de reunión y roles falsos | Un filtro por `'confirmada'` o un `if rol === ...` con 2 roles deja afuera a Yesi (`operador`) y al portal. |
| 1.13 | `CLAUDE.md:259`, `GOTCHAS #75`, `ISSUE-061` | "181" | El guard es lo primero que corre una sesión; el párrafo de al lado tiene otro número. |
| 1.14 | `docs/CONTEXTO.md:34-36` | "push directo a main", "SQL Editor", "`docs/SESION_*.md`" | Describe un flujo que contradice `CLAUDE.md` §Workflow y §Protocolo. |
| 1.15 | `CLAUDE.md` árbol (B1): `liquidaciones-engine.js`, `edad-spc.js` no listados | El motor de premios y la regla de edad son invisibles para quien lee el árbol | Ya pasó: se buscó la regla de edad en tres implementaciones (obs. 9811). |

### Grupo 2 — confunde (estado falso o incompleto, sin generar código malo directo)

| # | archivo | problema |
|---|---|---|
| 2.1 | `docs/ESTADO.md` | snapshot 24/07 como "el más nuevo"; línea 20 (9999 a borrar), 208 (URL vieja), 253-264 ("pendiente de construir" lo construido). Necesita un snapshot 2026-09-11 arriba con los 26 puntos de §5 — o cambiar el modelo de doc (ver pregunta abierta 2). |
| 2.2 | `docs/LIQUIDACIONES_MODELO.md:5-9, 121-125` | encabezado "NO en prod salvo schema", "pendiente v1.2" |
| 2.3 | `docs/MODULOS.md:14,19,31-32` | Liquidaciones ❌, Portal 📋, Carta 🔧 |
| 2.4 | `CLAUDE.md:485` | párrafo de liquidaciones parado en junio + "10/95" |
| 2.5 | `CLAUDE.md:48,486` (D3) | portal "no construido" |
| 2.6 | `docs/PREGUNTAS_ABIERTAS.md` §2-§7, §12 | pendientes ya hechos (liquidaciones, RLS, email, dominio, selector) |
| 2.7 | `docs/DECISIONES.md` | sin ADR desde 02/06; ADR-027 y ADR-047 superados sin nota. Faltan: 9999 sandbox, 40 provisorios, saldado administrativo, liberación manual, anulación con snapshot, aislamiento por club, edad 1/7. |
| 2.8 | `docs/ISSUES.md` ISSUE-001 | encabezado de junio |
| 2.9 | `CHANGELOG.md` | huecos: 27/08 (fix edad + pagos rol/carrera), 28/08 (montas + gate; revert recibo 4), 29/08 (es_prueba/ISSUE-055 — 1 hit, **sin verificar** si tiene entrada propia), **08/09 completo** (bolsa portal, hora local, ventanas R9, condicion_sexo, forfait portal, chips, autocompletado-sin-mergear). Cero entradas entre `[2026-09-07]` y `[2026-09-10]`. |
| 2.10 | `docs/SECURITY.md` | 26 tablas / 12 funciones; sin `recibos`, sin GOTCHA #80 |
| 2.11 | `docs/CONTEXTO.md:24-30` | roles sin el circuito de solicitudes |
| 2.12 | `docs/SCHEMA.md` §propietarios, `MODULOS.md:73` | "GLOBALES" para propietarios post ISSUE-072 |
| 2.13 | `CLAUDE.md` (C1-C4) | `hipodromos`, `numero_publico`, `caballeriza_responsables.rol` |
| 2.14 | `CLAUDE.md` (D6) | corte de "Bugs conocidos" en ISSUE-029 sin declararlo |
| 2.15 | `README.md` | `portal.html` "Portal principal"; faltan solicitar-acceso/solicitudes |
| 2.16 | ramas sin mergear con SQL ya aplicado en la base: `fix/condicion-sexo-t8-t10-r9` (migración + probe), `fix/hora-ventanas-r9` (SQL ejecutado el 08/09), `feat/buscador-spc-autocompletado` (RPC ya en la base, código no). No es doc, pero es la misma deuda: `migrations/` en `main` no cuenta lo que la base tiene. |

### Grupo 3 — cosmético / conteos

| # | archivo | problema |
|---|---|---|
| 3.1 | `CLAUDE.md:51`, `CONTEXTO.md:60`, `ESTADO.md` | "16 páginas" → 17 |
| 3.2 | `CLAUDE.md` árbol | 25/35 HTML, 13/123 docs, 8/81 tests, 5/92 migrations — decidir si el árbol lista todo o sólo "lo que hay que conocer" con esa aclaración |
| 3.3 | `CLAUDE.md:233` | "Verificado el 02/06" → fecha de hoy |
| 3.4 | `CLAUDE.md:3`, `ESTADO.md:269` | sigla HDO → DOL (cosmético acá; en SNIPPETS es grupo 1) |
| 3.5 | `docs/SERVER.md:21,30` | "Opus 4.x", kernel -22 |
| 3.6 | `docs/SPEC.md` | borrar o dejar una línea "ver CONTEXTO.md" |
| 3.7 | `docs/SCHEMA.md` §ALTER ejecutados | log detenido en junio — si `migrations/` es la fuente, declararlo y cerrar la sección |
| 3.8 | `docs/*_ESTADO.md`, `PROBE_TEMPLATE_ES.md` | nombre "estado"/"template" para fotos — una línea de encabezado "FOTO del DD/MM, no vigente" alcanza (sin reescribir el contenido) |

---

## 8. Preguntas abiertas (para decidir los grupos)

1. **`LIQUIDACIONES_GAP_ANALYSIS.md`**: ¿foto (una línea de rótulo + sacar "gap vivo" de CLAUDE/ISSUES) o reescritura? Propongo foto: el gap real hoy es chico (Fase 6, backfill que ya no es backfill, T9) y cabe en ISSUE-001.
2. **`ESTADO.md`**: ¿un snapshot nuevo arriba (el modelo actual, 411 líneas y creciendo) o pasar a "estado vivo corto + link a CHANGELOG"? Los snapshots de mayo-junio ya son fotos dentro de un doc vivo — es el mismo problema que el §3.10 pero adentro de un archivo.
3. **`SCHEMA.md` raíz vs `docs/SCHEMA.md`**: dos archivos con el mismo nombre, uno parcial rotulado "fuente de verdad". ¿Fusionar en `docs/SCHEMA.md` y dejar el de raíz como puntero?
4. **Árbol de `CLAUDE.md`**: ¿listado completo (35+11+92+81, se desactualiza en una semana) o listado curado con la frase "hay más; `ls`"?
5. **Ramas con SQL aplicado sin mergear** (2.16): ¿se mergean como `chore:` para que `migrations/` cuente la verdad, aunque el código del autocompletado siga esperando a Fede?

---

## 9. Queries y comandos de respaldo (los que no están inline arriba)

```sql
-- funciones, tablas, vistas, columnas clave, roles, estados, policies
select 'fn' k, string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', E'\n' order by p.proname) v
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
union all select 'tablas', string_agg(table_name, ', ' order by table_name) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'
union all select 'vistas', string_agg(table_name, ', ' order by table_name) from information_schema.views where table_schema='public'
union all select 'cols_clave', string_agg(table_name||'.'||column_name, ', ' order by table_name, column_name) from information_schema.columns where table_schema='public' and ((table_name='reuniones' and column_name in ('es_prueba','numero_publico','hora_cierre_ratificacion')) or (table_name='recibos' and column_name in ('emitido_por','anulado_at','anulado_por','motivo_anulacion','lineas_snapshot','estado')) or (table_name='propietarios' and column_name='club_id') or (table_name='carreras' and column_name in ('apertura_ratificacion','cierre_ratificacion','cierre_inscripcion','apertura_inscripcion')) or (table_name='usuarios' and column_name='rol'))
union all select 'roles_usuarios', string_agg(rol||':'||n, ', ') from (select rol, count(*) n from usuarios group by 1) x
union all select 'reuniones_estado', string_agg(estado||':'||n, ', ') from (select estado, count(*) n from reuniones group by 1) x
union all select 'policies_recibos', string_agg(policyname||'/'||cmd, ', ') from pg_policies where tablename='recibos'
union all select 'policies_liq_delete', string_agg(tablename||':'||policyname, ', ') from pg_policies where tablename in ('liquidaciones','liquidacion_detalle') and cmd='DELETE'
```
```json
[{"k":"fn","v":"anular_recibo(p_recibo_id uuid, p_motivo text)\naplicar_resultado(p_resultado_id uuid, p_expected_updated_at timestamp with time zone, p_carrera_id uuid, p_estado text, p_estado_pista text, p_tiempo_ganador text, p_incidentes text, p_favorito_mandil integer, p_redistribucion_legs jsonb, p_posiciones jsonb, p_apuestas jsonb)\ncalcular_premio(p_bolsa_total numeric, p_distribucion jsonb, p_puesto integer)\ndesoficializar_carrera(p_carrera_id uuid)\nemitir_recibo(p_club_id uuid, p_beneficiario_tipo beneficiario_tipo, p_beneficiario_id uuid, p_linea_ids uuid[], p_forma_pago forma_pago_recibo, p_cobrador_nombre text, p_cobrador_documento text, p_comprobante_url text)\nfn_audit_policies_permisivas()\nfn_auditoria_log()\nfn_caballeriza_resp_set_propietario()\nfn_club_de_caballeriza(p_caballeriza_id uuid)\nfn_club_de_carrera(p_carrera_id uuid)\nfn_club_de_inscripcion(p_inscripcion_id uuid)\nfn_club_de_liquidacion(p_liquidacion_id uuid)\nfn_club_de_resolucion(p_resolucion_id uuid)\nfn_club_de_resultado(p_resultado_id uuid)\nfn_club_de_reunion(p_reunion_id uuid)\nfn_edad_reglamentaria(p_fecha_ref date, p_fecha_nac date)\nfn_get_user_club_id()\nfn_inscripcion_set_propietario()\nfn_is_portal_user()\nfn_is_staff()\nfn_is_super_admin()\nfn_mis_entidades()\nfn_mis_spc_ids()\nfn_mis_spc_visibles()\nfn_proteger_rol_club_id_usuario()\nfn_purgar_auditoria()\nfn_siguiente_recibo(p_club_id uuid)\nfn_solicitudes_guard_staff(p_solicitud_id uuid)\nfn_usuarios_guard_privilegios()\nfn_usuarios_set_auth_user_id()\nliberar_linea(p_linea_id uuid)\nreordenar_turnos(p_reunion_id uuid, p_orden jsonb, p_dry_run boolean)\nrpc_aprobar_solicitud(p_solicitud_id uuid, p_entidad_tipo text, p_entidad_id uuid, p_copiar_documento boolean)\nrpc_baja_inscripcion(p_inscripcion_id uuid)\nrpc_buscar_spc(p_q text)\nrpc_descartar_solicitud(p_solicitud_id uuid)\nrpc_inscribir(p_spc_id uuid, p_carrera_id uuid, p_caballeriza_id uuid, p_entrenador_id uuid, p_jockey_titular_id uuid, p_jockey_suplente_id uuid)\nrpc_padron_profesionales()\nrpc_padron_spcs()\nrpc_rechazar_solicitud(p_solicitud_id uuid, p_motivo text)\nrpc_solicitar_acceso(p_nombre text, p_apellido text, p_documento_nro text, p_telefono text, p_rol_pedido text, p_club_id uuid, p_documento_tipo text, p_email text, p_origen_hipodromo text, p_origen_patente_nro text, p_origen_caballeriza text)\nset_updated_at()\nsiguiente_numero_publico(p_club_id uuid, p_fecha date)\nvalidar_inscripcion(p_spc_id uuid, p_carrera_id uuid)"},
 {"k":"tablas","v":"_bak_merge_duplicados_spc, _gate41_backfill_tenencia, apoderados, auditoria, bak_r8_propietario, caballeriza_responsables, caballerizas, carrera_apuestas, carreras, categorias_carrera, club_configuracion, club_secuencias, clubs, comision_config, hipodromos, inscripciones, liquidacion_config, liquidacion_detalle, liquidaciones, novedades_reunion, performances, profesionales, propietarios, recibos, resolucion_entidades, resoluciones, resultado_apuestas, resultado_log, resultado_posiciones, resultados, reuniones, sanciones, solicitudes_acceso, spc_entrenadores_hist, spc_propietarios, spcs, usuarios"},
 {"k":"vistas","v":"v_inscriptos_carrera, v_programa_reunion, v_sanciones_vigentes, v_spcs_activos"},
 {"k":"cols_clave","v":"carreras.apertura_inscripcion, carreras.apertura_ratificacion, carreras.cierre_inscripcion, carreras.cierre_ratificacion, propietarios.club_id, recibos.anulado_at, recibos.anulado_por, recibos.emitido_por, recibos.estado, recibos.motivo_anulacion, reuniones.es_prueba, reuniones.hora_cierre_ratificacion, reuniones.numero_publico, usuarios.rol"},
 {"k":"roles_usuarios","v":"operador:3, super_admin:1, propietario:3, secretario_carreras:2, profesional:10"},
 {"k":"reuniones_estado","v":"programada:3, publicada:1, cancelada:2, finalizada:6, borrador:2"},
 {"k":"policies_recibos","v":"recibos_insert/INSERT, recibos_select/SELECT, recibos_update/UPDATE"},
 {"k":"policies_liq_delete","v":"liquidacion_detalle:liquidacion_detalle_delete, liquidaciones:liquidaciones_delete"}]
```

```sql
select table_name, string_agg(column_name, ', ' order by ordinal_position) cols from information_schema.columns where table_schema='public' and table_name in ('usuarios','reuniones','recibos','propietarios','profesionales','carreras','solicitudes_acceso','liquidacion_detalle') group by 1 order by 1
```
```json
[{"table_name":"carreras","cols":"id, reunion_id, numero_turno, nombre, categoria_id, tipo_pista, distancia_metros, edad_minima_anos, edad_maxima_anos, condicion_sexo, condicion_handicap, condicion_adicional, bolsa_total, distribucion_premios, cupo_maximo, hora_estimada, apertura_inscripcion, cierre_inscripcion, apertura_ratificacion, cierre_ratificacion, estado, bolsa_bonos, numero_carrera_programa, apuestas, apuestas_notas"},
 {"table_name":"liquidacion_detalle","cols":"id, liquidacion_id, carrera_id, concepto, descripcion, monto_bruto, porcentaje_desc, monto_descuento, monto_neto, orden_display, estado_linea, concepto_tipo, posicion, inscripcion_id, fecha_liberacion, pagado_at, recibo_id, beneficiario_tipo, beneficiario_id, reunion_id"},
 {"table_name":"profesionales","cols":"id, club_id, tipo, nombre, apellido, documento_tipo, documento_nro, fecha_nacimiento, matricula_nro, categoria_jockey, peso_minimo, peso_maximo, caballeriza_id, telefono, email, foto_url, activo, notas, created_at, updated_at, patente, hipodromo_patente, localidad, estado"},
 {"table_name":"propietarios","cols":"id, club_id, tipo, nombre, documento_tipo, documento_nro, domicilio, localidad, provincia, telefono, email, colores_desc, colores_img_url, activo, notas, created_at, updated_at, nombre_stud, estado, chaquetilla_descripcion, chaquetilla_url"},
 {"table_name":"recibos","cols":"id, club_id, numero_recibo, beneficiario_tipo, profesional_id, propietario_id, forma_pago, total_premios, total_descuentos, retencion_dgi, neto_a_cobrar, cobrador_nombre, cobrador_documento, comprobante_url, estado, emitido_por, emitido_at, anulado_at, notas, created_at, anulado_por, motivo_anulacion, lineas_anuladas"},
 {"table_name":"reuniones","cols":"id, club_id, hipodromo_id, numero, fecha, tipo, estado, tiempo_clima, observaciones, creado_por, created_at, updated_at, hora_cierre_ratificacion, fechas_inscripciones, fechas_forfaits, fechas_compromiso_montas, sorteo_partidores, numero_publico, es_prueba"},
 {"table_name":"solicitudes_acceso","cols":"id, auth_user_id, email, nombre, apellido, documento_tipo, documento_nro, telefono, rol_pedido, club_id, estado, motivo_rechazo, resuelta_por, resuelta_at, created_at, origen_hipodromo, origen_patente_nro, origen_caballeriza"},
 {"table_name":"usuarios","cols":"id, club_id, email, password_hash, nombre_completo, rol, entidad_tipo, entidad_id, activo, ultimo_login, created_at, telefono, estado, auth_user_id"}]
```

```sql
select (select count(*) from pg_tables where schemaname='public' and rowsecurity) rls_on, (select count(*) from pg_tables where schemaname='public' and not rowsecurity) rls_off, (select string_agg(tablename, ', ') from pg_tables where schemaname='public' and not rowsecurity) sin_rls, (select logo_url from clubs where sigla='HDO') logo_hdo, (select count(*) from propietarios where club_id is null) prop_sin_club, (select count(*) from inscripciones where propietario_id is null) inscr_sin_prop, (select count(*) from inscripciones) inscr_total, (select count(*) from spc_propietarios) spc_prop
```
```json
[{"rls_on":34,"rls_off":3,"sin_rls":"bak_r8_propietario, _gate41_backfill_tenencia, _bak_merge_duplicados_spc","logo_hdo":null,"prop_sin_club":0,"inscr_sin_prop":147,"inscr_total":253,"spc_prop":0}]
```
(`logo_hdo` NULL porque `sigla='HDO'` no existe — de ahí salió el hallazgo de la sigla.)

```sql
select id, nombre, sigla, logo_url from clubs order by nombre
```
```json
[{"id":"0649e9c5-9e87-4aad-842f-101458e6b33c","nombre":"Hipódromo de Dolores","sigla":"DOL","logo_url":"https://sigh.com.ar/logo-dolores-verde.png"},
 {"id":"710d43c1-364e-4431-99d9-c47e87242075","nombre":"Jockey Club San Francisco - Hipodromo Oscar C. Boero","sigla":"HSF","logo_url":null},
 {"id":"a6da7e40-1515-45dc-8933-4eef33ce937a","nombre":"Mi Club Hípico","sigla":"MCH","logo_url":null}]
```

```sql
select r.id, r.numero, r.fecha, r.estado, c.nombre club, (select count(*) from carreras x where x.reunion_id=r.id) turnos, (select count(*) from inscripciones i join carreras x on x.id=i.carrera_id where x.reunion_id=r.id) inscr from reuniones r join clubs c on c.id=r.club_id where r.numero=5 order by r.fecha
```
```json
[{"id":"c90b6186-268d-4089-8cc6-71626b627cf8","numero":5,"fecha":"2026-05-17","estado":"finalizada","club":"Hipódromo de Dolores","turnos":0,"inscr":0},
 {"id":"1d6ee50e-0a9d-4681-8e96-7bdec3a7816f","numero":5,"fecha":"2026-05-17","estado":"borrador","club":"Mi Club Hípico","turnos":0,"inscr":0}]
```

Comandos de repo (todos en `main` @ `ce5dd3c`):

```
$ ls *.html | wc -l → 35     $ ls *.js | wc -l → 11     $ ls docs/*.md | wc -l → 123
$ ls tests/*.mjs | wc -l → 81   $ ls migrations/*.sql | wc -l → 92   $ ls docs/diagnosticos/*.md | wc -l → 7
$ grep -l "club-switcher.js" *.html | wc -l → 17
$ grep -c "^## [0-9]" docs/GOTCHAS.md → 95      $ grep -c "^## ISSUE\|^### ISSUE" docs/ISSUES.md → 79
$ grep -c '├── [a-z0-9-]*\.html' CLAUDE.md → 25   $ grep -c '├── [a-z0-9-]*\.js ' CLAUDE.md → 8
$ for f in $(ls *.html *.js); do grep -q "$f" CLAUDE.md || echo "no listado: $f"; done
no listado: activacion-pendiente.js / edad-spc.js / liquidaciones-engine.js / mockup-no-corrio-v1-checkbox-por-caballo.html / mockup-no-corrio-v2-marcador-por-caballo.html / mockup-no-corrio-v2.html / mockup-no-corrio-v3-boton-deduccion.html / registro.html / reset-password.html / resultados_legacy.html / solicitudes.html
$ grep -c "isoAInputLocal\|inputLocalAISO" carta-llamados.html → 13
$ grep -l "rpc_padron_spcs\|rpc_buscar_spc" *.html *.js → portal.html   (por rpc_buscar_spc; rpc_padron_spcs → 0)
$ git log --oneline main..origin/feat/buscador-spc-autocompletado → 5ab8320 feat: autocompletado del buscador de SPC en el portal
$ for b in ...; git log --oneline main..origin/$b | wc -l →
chore/rls-audit: 5 · chore/ticket-github-gc: 1 · feat/buscador-spc-autocompletado: 1 · feat/studbook-extract: 3 · fix/condicion-sexo-t8-t10-r9: 1 · fix/hora-ventanas-r9: 1 · fix/llamado-chips-fede: 1 · fix/pdf-inscriptos-condiciones: 4
$ grep -n "^## \[" CHANGELOG.md | head -5 → [2026-09-11], [2026-09-10], [2026-09-07], [2026-09-05], [2026-09-02]   (no hay [2026-09-08] ni [2026-08-27/29])
$ grep -n "eyJ\|toLocaleString\|mdqclio\|SQL Editor" docs/*.md README.md CLAUDE.md | grep -v diagnosticos   → (salida en §2 fila 10 y §3.5/3.6/3.7/3.11)
```
