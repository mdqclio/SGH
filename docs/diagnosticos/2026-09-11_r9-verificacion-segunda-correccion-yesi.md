# R9 — verificación de la segunda corrección de Yesi (solo lectura)

**Fecha:** 2026-09-11 (noche) · **`main`:** `ce5dd3c` · **Baseline comparado:** `2026-09-11_r9-verificacion-llamado-acomodado.md` (foto de la tarde, post 15:22 AR) y `…_r9-tanda-1-ejecucion.md` (los 18 SPC, 15:50 AR).
**Solo lectura.** Cinco `select`. Nada escrito.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 199 | ✅ **199** |
| ref | `unlhcuanfrtpatoipwve` | ✅ |
| greps | contra `main` | ✅ (no hubo greps de código en este informe: todo es base) |

---

## 1. Respuestas

| # | pregunta | respuesta |
|---|---|---|
| 1 | ¿Qué cambió en los 11 turnos vs la tarde? | **Dos turnos**: **T9** `edad_minima_anos` 5 → **4**, `edad_maxima_anos` 10 → **NULL**. **T6** `edad_maxima_anos` 10 → **5** (mínimo sigue 5). Los otros 9: idénticos byte a byte (edad, sexo, textos, distancia, pista, bolsa, estado). |
| 2 | ¿Tocó T9 y T6? | **Sí, los dos.** T9 (16:12:06 AR) queda **4 y +** → consistente con "Especial Todo caballo 4 años y + edad ganador de 3 o mas". T6 lo tocó **dos veces**: 16:12:55 puso máximo NULL (5 y +), 16:13:19 lo volvió a **5** → queda **5-5 = sólo 5 años**, consistente con la lectura literal de "Todo caballo **de 5 años** ganador de 1 o 2". Es la decisión que estaba abierta (ítem 2 de la tarde) y la tomó ella. Los 4 anotados en T6 que ya están en el padrón (REINA EDITION 2021, FREE CRY 2021, FALAYS 2021, IDALIA MARO 2021 → 5 años; SEMBRADOR CHUCK 2020 → **6**, HALLOTOP 2021 → 5): **SEMBRADOR CHUCK queda afuera de T6 con el máximo en 5.** No es un error de la columna — es lo que dice el texto — pero es el único que cambia de situación por esta edición. |
| 3 | ¿Tocó algún SPC? ¿Conesera? | **No.** `spcs` no tiene trigger de auditoría (§3), pero sí `trg_spcs_updated_at`, así que cualquier UPDATE bumpea `updated_at`. Filas con `updated_at` de hoy: **exactamente las 18 del alta, todas 15:50:25 AR**. Ninguna otra. `count(*)` sigue 199 (sin altas ni bajas). **Conesera**: `nombre='Conesera'`, `sexo='macho'`, `studbook_id NULL`, `color NULL`, `updated_at` 06/08 11:58 — **intacta**, sigue esperando su UPDATE. |
| 4 | ¿Inscripciones nuevas o modificadas en R9? | **No.** 5 filas, las mismas de la tarde (Conesera T1, SI TIN T1, LATIN PRESUMIDA T7 y T8, LATIN RAIN T10), `max(created_at)` 11/09 00:02, `max(updated_at)` 11/09 00:02. `inscripciones` sí tiene trigger de auditoría (`trg_audit_inscripciones` INSERT/UPDATE/DELETE) y no hay ninguna fila de auditoría de `inscripciones` desde las 15:00 AR. |
| 5 | ¿Se movieron las cuatro fechas de T9 y T6? | **No.** Las 44 ventanas (11 turnos × 4) siguen en los valores del baseline: `ap_insc` 24/08 (T1) / 28/08 00:00+00, `ci_insc` 2026-09-11 15:00+00 (12:00 AR), `ap_rat` 2026-09-14 03:00+00 (00:00 AR), `ci_rat` 2026-09-14 15:00+00 (12:00 AR). El diff de auditoría de los 3 UPDATE de carreras trae **sólo** columnas de edad — las fechas viajaron con el mismo valor. |

**Hallazgo lateral — cómo edita Yesi**: para cada tanda **bajó la reunión a `borrador`, editó, y la volvió a `publicada`** (auditoría de `reuniones`: 15:18:51 publicada→borrador · [edita T5/T11/T10] · 15:23:25 borrador→publicada · 16:06:07 publicada→borrador · [edita T9/T6] · 16:18:46 borrador→publicada). O sea: `carta-llamados.html` **sí** bloquea la edición con la reunión publicada, y ella conoce el destrabe. Esto **corrige un hallazgo mío de esta tarde**: en `2026-09-11_relevamiento-docs-fase-1.md` §3.8 y §7 ítem 1.9 dije que la regla de `MODULOS.md:67-68` ("publicada no se puede modificar") "no rige" porque Yesi había editado con la reunión publicada. Estaba mal: no miré la auditoría de `reuniones`, sólo la de `carreras`. La regla rige; el ítem 1.9 baja de grupo 1 a "correcto, sólo falta decir que el destrabe se hace desde la UI, no por SQL" (**sin verificar** si el toggle publicada↔borrador está en `reuniones.html` o en `carta-llamados.html` — no grepeé el código; la auditoría no dice desde qué pantalla). R9 quedó **`publicada`** al final (16:18:46).

Estado de los 11 turnos ahora, contra el texto:

| T | emin | emax | sexo | texto | ✓ |
|---|---|---|---|---|---|
| 1 | 3 | 3 | ambos | 3 años perdedor | ✅ |
| 2 | 4 | 4 | ambos | 4 años perdedor | ✅ |
| 3 | 4 | 4 | ambos | 4 años perdedor | ✅ |
| 4 | 5 | 10 | ambos | 5 y + perdedor | ✅ |
| 5 | 3 | 4 | ambos | 3 y 4 ganador de 1 o 2 | ✅ (tarde) |
| **6** | 5 | **5** | ambos | **de 5 años** ganador de 1 o 2 | ✅ **hoy 16:13** — lectura literal |
| 7 | 6 | 10 | ambos | 6 y + ganadores de 1 o 2 | ✅ |
| 8 | 5 | NULL | hembras | yeguas 5 y + ganadoras de 1 o 2 | ✅ |
| **9** | **4** | **NULL** | ambos | especial 4 y + ganador de 3 o más | ✅ **hoy 16:12** |
| 10 | 5 | NULL | hembras | yeguas 5 y + perdedoras | ✅ (tarde) |
| 11 | 5 | NULL | ambos | 5 y + perdedor | ✅ (tarde) |

**11 de 11 consistentes con el texto.** No queda ningún turno con desacuerdo columna/texto. THE BEAST PARTY (2022, 4 años, ya en el padrón) ahora pasa el gate de T9.

---

## 2. Los once turnos — query y salida cruda

```sql
select c.numero_turno as t, c.edad_minima_anos as emin, c.edad_maxima_anos as emax, c.condicion_sexo as sexo, c.condicion_handicap, c.condicion_adicional, c.distancia_metros m, c.tipo_pista, c.bolsa_total, c.estado,
 c.apertura_inscripcion ap_insc, c.cierre_inscripcion ci_insc, c.apertura_ratificacion ap_rat, c.cierre_ratificacion ci_rat,
 (select string_agg(s.nombre||' ('||i.estado||')', ', ' order by s.nombre) from inscripciones i join spcs s on s.id=i.spc_id where i.carrera_id=c.id) inscriptos
from carreras c where c.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' order by c.numero_turno
```

```json
[{"t":1,"emin":3,"emax":3,"sexo":"ambos","condicion_handicap":"Todo caballo 3 años perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","m":800,"tipo_pista":"tierra","bolsa_total":"1054166.67","estado":"abierta","ap_insc":"2026-08-24 00:00:00+00","ci_insc":"2026-09-11 15:00:00+00","ap_rat":"2026-09-14 03:00:00+00","ci_rat":"2026-09-14 15:00:00+00","inscriptos":"Conesera (inscripto), SI TIN (inscripto)"},
 {"t":2,"emin":4,"emax":4,"sexo":"ambos","condicion_handicap":"Todo caballo 4 años perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","m":800,"tipo_pista":"tierra","bolsa_total":"1016666.67","estado":"abierta","ap_insc":"2026-08-28 00:00:00+00","ci_insc":"2026-09-11 15:00:00+00","ap_rat":"2026-09-14 03:00:00+00","ci_rat":"2026-09-14 15:00:00+00","inscriptos":null},
 {"t":3,"emin":4,"emax":4,"sexo":"ambos","condicion_handicap":"Todo caballo 4 años perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","m":1200,"tipo_pista":"cesped","bolsa_total":"1118333.33","estado":"abierta","ap_insc":"2026-08-28 00:00:00+00","ci_insc":"2026-09-11 15:00:00+00","ap_rat":"2026-09-14 03:00:00+00","ci_rat":"2026-09-14 15:00:00+00","inscriptos":null},
 {"t":4,"emin":5,"emax":10,"sexo":"ambos","condicion_handicap":"Todo caballo 5 años y + edad perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","m":800,"tipo_pista":"cesped","bolsa_total":"1000000.00","estado":"abierta","ap_insc":"2026-08-28 00:00:00+00","ci_insc":"2026-09-11 15:00:00+00","ap_rat":"2026-09-14 03:00:00+00","ci_rat":"2026-09-14 15:00:00+00","inscriptos":null},
 {"t":5,"emin":3,"emax":4,"sexo":"ambos","condicion_handicap":"Todo caballo 3 y 4 años ganador de 1 o 2 carreras.","condicion_adicional":"Peso 57 kilos. Recargo de 2 kilos al ganador de 2 carreras. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","m":1000,"tipo_pista":"tierra","bolsa_total":"1166666.67","estado":"abierta","ap_insc":"2026-08-28 00:00:00+00","ci_insc":"2026-09-11 15:00:00+00","ap_rat":"2026-09-14 03:00:00+00","ci_rat":"2026-09-14 15:00:00+00","inscriptos":null},
 {"t":6,"emin":5,"emax":5,"sexo":"ambos","condicion_handicap":"Todo caballo de 5 años ganador de 1 o 2 carreras.","condicion_adicional":"Peso 57 kilos. Recargo de 2 kilos al ganador de 2 carreras. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","m":1000,"tipo_pista":"tierra","bolsa_total":"1083333.33","estado":"abierta","ap_insc":"2026-08-28 00:00:00+00","ci_insc":"2026-09-11 15:00:00+00","ap_rat":"2026-09-14 03:00:00+00","ci_rat":"2026-09-14 15:00:00+00","inscriptos":null},
 {"t":7,"emin":6,"emax":10,"sexo":"ambos","condicion_handicap":"Todo caballo 6 años y + edad ganadores de 1 o 2 carreras.","condicion_adicional":"Peso 57 kilos. Recargo de 2 kilos al ganador de 2 carreras. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","m":1100,"tipo_pista":"cesped","bolsa_total":"1191666.67","estado":"abierta","ap_insc":"2026-08-28 00:00:00+00","ci_insc":"2026-09-11 15:00:00+00","ap_rat":"2026-09-14 03:00:00+00","ci_rat":"2026-09-14 15:00:00+00","inscriptos":"LATIN PRESUMIDA (inscripto)"},
 {"t":8,"emin":5,"emax":null,"sexo":"hembras","condicion_handicap":"Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras.","condicion_adicional":"Peso 55 kilos. Recargo de 2 kilos a las ganadora de 2 carreras. Jockey aprendices sin descargo.","m":1200,"tipo_pista":"tierra","bolsa_total":"1191666.67","estado":"abierta","ap_insc":"2026-08-28 00:00:00+00","ci_insc":"2026-09-11 15:00:00+00","ap_rat":"2026-09-14 03:00:00+00","ci_rat":"2026-09-14 15:00:00+00","inscriptos":"LATIN PRESUMIDA (inscripto)"},
 {"t":9,"emin":4,"emax":null,"sexo":"ambos","condicion_handicap":"Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras.","condicion_adicional":"Peso 52 kilos al ganador de 2 carreras. Recargo de 2 kilos por carrera subsiguiente ganada. Jockey aprendices sin descargo.","m":1100,"tipo_pista":"tierra","bolsa_total":"3333333.33","estado":"abierta","ap_insc":"2026-08-28 00:00:00+00","ci_insc":"2026-09-11 15:00:00+00","ap_rat":"2026-09-14 03:00:00+00","ci_rat":"2026-09-14 15:00:00+00","inscriptos":null},
 {"t":10,"emin":5,"emax":null,"sexo":"hembras","condicion_handicap":"Yeguas 5 años y + edad perdedoras.","condicion_adicional":"Peso 55 kilos. Jockey aprendices con descargo.","m":1100,"tipo_pista":"cesped","bolsa_total":"1833333.33","estado":"abierta","ap_insc":"2026-08-28 00:00:00+00","ci_insc":"2026-09-11 15:00:00+00","ap_rat":"2026-09-14 03:00:00+00","ci_rat":"2026-09-14 15:00:00+00","inscriptos":"LATIN RAIN (inscripto)"},
 {"t":11,"emin":5,"emax":null,"sexo":"ambos","condicion_handicap":"Todo caballo 5 años y + edad perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices con descargo.","m":1200,"tipo_pista":"tierra","bolsa_total":"1833333.33","estado":"abierta","ap_insc":"2026-08-28 00:00:00+00","ci_insc":"2026-09-11 15:00:00+00","ap_rat":"2026-09-14 03:00:00+00","ci_rat":"2026-09-14 15:00:00+00","inscriptos":null}]
```

Diff contra la foto de la tarde (`…_llamado-acomodado.md` §2):

| T | columna | tarde | ahora |
|---|---|---|---|
| 6 | `edad_maxima_anos` | 10 | **5** |
| 9 | `edad_minima_anos` | 5 | **4** |
| 9 | `edad_maxima_anos` | 10 | **NULL** |

Todo lo demás: igual. Las 44 fechas: iguales.

---

## 3. Auditoría — qué pasó, en orden

Desde las 15:00 AR (dos queries, ventanas `17:30–18:23` y `> 18:23` UTC), tablas con trigger `fn_auditoria_log`: `carreras, categorias_carrera, clubs, inscripciones, liquidacion_config, liquidaciones, recibos, resultados, reuniones, usuarios` (**no `spcs`**, ver §4).

```sql
select to_char(a.created_at at time zone 'America/Argentina/Buenos_Aires','DD/MM HH24:MI:SS') ar, a.tabla, a.accion, a.registro_id, u.nombre_completo, u.rol,
 coalesce(a.datos_despues->>'nombre', a.datos_despues->>'numero_turno', a.datos_antes->>'nombre') ref,
 (select jsonb_object_agg(k, jsonb_build_object('antes', a.datos_antes->k, 'despues', a.datos_despues->k)) from jsonb_object_keys(coalesce(a.datos_despues, a.datos_antes, '{}'::jsonb)) k where a.datos_antes->k is distinct from a.datos_despues->k and k not in ('updated_at')) as diff
from auditoria a left join usuarios u on u.id=a.usuario_id
where a.created_at > '2026-09-11 18:23:00+00' order by a.created_at
```

```json
[{"ar":"11/09 15:23:25","tabla":"reuniones","accion":"UPDATE","registro_id":"cafa37d6-89f4-45cb-a0d9-835bc27407e9","nombre_completo":"Yesica Elias","rol":"operador","ref":null,"diff":{"estado":{"antes":"borrador","despues":"publicada"}}},
 {"ar":"11/09 16:06:07","tabla":"reuniones","accion":"UPDATE","registro_id":"cafa37d6-89f4-45cb-a0d9-835bc27407e9","nombre_completo":"Yesica Elias","rol":"operador","ref":null,"diff":{"estado":{"antes":"publicada","despues":"borrador"}}},
 {"ar":"11/09 16:12:06","tabla":"carreras","accion":"UPDATE","registro_id":"5cd5d00e-c844-467d-925f-83b378863af5","nombre_completo":"Yesica Elias","rol":"operador","ref":"9","diff":{"edad_maxima_anos":{"antes":10,"despues":null},"edad_minima_anos":{"antes":5,"despues":4}}},
 {"ar":"11/09 16:12:55","tabla":"carreras","accion":"UPDATE","registro_id":"7da3fa1c-a32a-42dc-ad2f-6b10e86cba22","nombre_completo":"Yesica Elias","rol":"operador","ref":"6","diff":{"edad_maxima_anos":{"antes":10,"despues":null}}},
 {"ar":"11/09 16:13:19","tabla":"carreras","accion":"UPDATE","registro_id":"7da3fa1c-a32a-42dc-ad2f-6b10e86cba22","nombre_completo":"Yesica Elias","rol":"operador","ref":"6","diff":{"edad_maxima_anos":{"antes":null,"despues":5}}},
 {"ar":"11/09 16:18:46","tabla":"reuniones","accion":"UPDATE","registro_id":"cafa37d6-89f4-45cb-a0d9-835bc27407e9","nombre_completo":"Yesica Elias","rol":"operador","ref":null,"diff":{"estado":{"antes":"borrador","despues":"publicada"}}}]
```

Ventana anterior (`17:30–18:23` UTC = 14:30–15:23 AR), misma forma, compactada:

```json
[{"ar":"15:18:51","tabla":"reuniones","diff":{"estado":{"a":"publicada","d":"borrador"}}},
 {"ar":"15:19:34","tabla":"carreras","diff":{"edad_maxima_anos":{"a":10,"d":4},"edad_minima_anos":{"a":5,"d":3}}},
 {"ar":"15:20:20","tabla":"carreras","diff":{"edad_maxima_anos":{"a":5,"d":null}}},
 {"ar":"15:22:22","tabla":"carreras","diff":{"edad_maxima_anos":{"a":10,"d":null}}}]
```

Secuencia completa del día, Yesi (`operador`):

| hora AR | tabla | qué |
|---|---|---|
| 15:18:51 | reuniones | R9 publicada → **borrador** |
| 15:19:34 | carreras T5 | edad 5-10 → 3-4 |
| 15:20:20 | carreras T11 | max 5 → NULL |
| 15:22:22 | carreras T10 | max 10 → NULL |
| 15:23:25 | reuniones | R9 borrador → **publicada** |
| 16:06:07 | reuniones | R9 publicada → **borrador** |
| 16:12:06 | carreras T9 | 5-10 → **4-NULL** |
| 16:12:55 | carreras T6 | max 10 → NULL |
| 16:13:19 | carreras T6 | max NULL → **5** (se arrepintió: sólo 5) |
| 16:18:46 | reuniones | R9 borrador → **publicada** ← estado final |

Cero filas de `inscripciones`, `recibos`, `liquidaciones`, `usuarios` en todo el día. El diff de cada UPDATE de `carreras` contiene únicamente columnas de edad → las cuatro fechas no se movieron (respuesta 5).

---

## 4. `spcs` — sin auditoría, verificado por `updated_at`

`spcs` **no** está en la lista de tablas con `fn_auditoria_log`. Pero tiene `trg_spcs_updated_at` (BEFORE UPDATE), verificado:

```sql
select event_object_table, trigger_name, action_timing, event_manipulation from information_schema.triggers where trigger_schema='public' and event_object_table in ('spcs','inscripciones') order by 1,2
```
```json
[{"event_object_table":"inscripciones","trigger_name":"trg_audit_inscripciones","action_timing":"AFTER","event_manipulation":"INSERT"},
 {"event_object_table":"inscripciones","trigger_name":"trg_audit_inscripciones","action_timing":"AFTER","event_manipulation":"DELETE"},
 {"event_object_table":"inscripciones","trigger_name":"trg_audit_inscripciones","action_timing":"AFTER","event_manipulation":"UPDATE"},
 {"event_object_table":"inscripciones","trigger_name":"trg_insc_set_propietario","action_timing":"BEFORE","event_manipulation":"INSERT"},
 {"event_object_table":"inscripciones","trigger_name":"trg_insc_set_propietario","action_timing":"BEFORE","event_manipulation":"UPDATE"},
 {"event_object_table":"inscripciones","trigger_name":"trg_inscripciones_updated_at","action_timing":"BEFORE","event_manipulation":"UPDATE"},
 {"event_object_table":"spcs","trigger_name":"trg_spcs_updated_at","action_timing":"BEFORE","event_manipulation":"UPDATE"}]
```

Entonces cualquier UPDATE sobre `spcs` deja `updated_at` de hoy. Filas de `spcs` tocadas hoy:

```sql
select to_char(updated_at at time zone 'America/Argentina/Buenos_Aires','DD/MM HH24:MI:SS') upd, count(*) n, string_agg(nombre, ', ' order by nombre) nombres from spcs where updated_at > '2026-09-11 00:00:00+00' group by 1 order by 1
```
```json
[{"upd":"11/09 15:50:25","n":18,"nombres":"ABARAJALA, ALHENA, ATOMIZADOR, BACON, DEL CAMPEON, DESERT OF DUBAI, EL RISKO, ETERNA DOCTORA, GOIADORA, HALLOTOP, HERMANOSDEMIPATRIA, MARIA CATULENGA, NIÑO OCEANICO, NISTEL WIN, OLA DOCTOR, QUERELLANTE, THE BEAST PARTY, TORO MAÑERO"}]
```

Exactamente las 18 del alta, en el segundo del `apply_migration`. **Nada más.** `count(*)` = 199 → tampoco hubo INSERT ni DELETE (un DELETE no deja rastro en `updated_at`, pero sí en el conteo).

Conesera:

```
Conesera | macho | NULL | NULL | upd 06/08 11:58
```
(`nombre | sexo | studbook_id | color | updated_at`). Intacta. `migrations/spcs_conesera_sexo.sql` sigue PROPUESTO.

Límite del método: un UPDATE que no cambie ningún valor igual bumpea `updated_at` (el trigger no compara), así que si hubiera "0 cambios reales" lo veríamos como toque; no es el caso — no hay ninguno.

---

## 5. Inscripciones de R9

```json
{"inscr_r9":"5 filas, max created 11/09 00:02, max updated 11/09 00:02",
 "inscr_r9_detalle":"T1 Conesera inscripto created 10/09 20:29; T1 SI TIN inscripto created 10/09 20:23; T7 LATIN PRESUMIDA inscripto created 10/09 23:59; T8 LATIN PRESUMIDA inscripto created 11/09 00:00; T10 LATIN RAIN inscripto created 11/09 00:02"}
```

Las mismas 5 de la mañana. Ninguna nueva, ninguna modificada (trigger de auditoría en `inscripciones` + `max(updated_at)` 00:02). La planilla de Yesi sigue **sin cargar** en `inscripciones`: los 18 que dimos de alta están en el padrón pero no anotados. Eso es la carga del lunes, no de hoy.

---

## 6. Qué queda

1. **T6 = sólo 5 años** es decisión de Yesi (16:13:19). Si Fede lee "de 5 años" como "5 y +", SEMBRADOR CHUCK (2020, 6) vuelve a entrar; hoy el gate lo rechaza en T6. Anotado, no es error.
2. Los 11 turnos consistentes con el texto → **no queda ningún fix de columnas pendiente en R9**.
3. Conesera: sigue esperando confirmación de Yesi (sexo).
4. Los 4 que vuelven a Yesi (BELLA DOÑA, BIEN COQUETA, EL MAS SABIO, INDIA MARO): sin novedad — no cargó ninguno a mano.
5. **Corrección a mi informe de la tarde** (`…_relevamiento-docs-fase-1.md` §3.8, §7 ítem 1.9): `MODULOS.md:67-68` **no está mal** — Yesi destraba bajando a borrador y vuelve a publicar. Lo que sí sigue viejo de ese ítem es la instrucción "`UPDATE reuniones SET estado='borrador'`" por SQL cuando hoy se hace desde la UI. Baja de grupo 1 a grupo 3. Lo dejo asentado acá; el informe de la tarde no se reescribe (es foto).
