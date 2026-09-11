# R9 — verificación de "acomodé el llamado" (solo lectura)

**Fecha:** 2026-09-11 · **`main`:** `842aa43` · **Baseline comparado:** `2026-09-08_ejecucion-fix-condicion-sexo-t8-t10-r9.md` (foto post-fix del 08/09) + snapshot de esta mañana en `2026-09-11_r9-cruce-spcs-planilla.md` §4.
**Solo lectura.** Tres `select`. Nada escrito.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 181 | ✅ (sin cambios, esta sesión no insertó) |
| ref | `unlhcuanfrtpatoipwve` | ✅ |

---

## 1. Respuestas concretas

| # | pregunta | respuesta |
|---|---|---|
| 1 | ¿T5 quedó en 3-4 años? | **Sí.** `edad_minima_anos` 5 → **3**, `edad_maxima_anos` 10 → **4**. Consistente con "Todo caballo 3 y 4 años ganador de 1 o 2 carreras." |
| 2 | ¿T11 quedó con máximo abierto? | **Sí.** `edad_maxima_anos` 5 → **NULL**. Mínimo sigue en 5. Consistente con "5 años y + edad perdedor." |
| 3 | ¿T9 quedó en 4 y más? | **No.** `edad_minima_anos` sigue en **5**, máximo 10. El texto dice "4 años y + edad". **Sin tocar** — no hay fila de auditoría para T9. Sigue siendo el desacuerdo de esta mañana: THE BEAST PARTY (2022, 4 años) y cualquier otro 4 años lo rechaza el gate |
| 4 | ¿Tocó algo más? | **Sí, una cosa: T10** `edad_maxima_anos` 10 → **NULL**. No estaba en la lista pero es correcto: el texto dice "Yeguas 5 años y + edad perdedoras", y deja a T10 igual que T8 (que ya tenía NULL). Nada más: sexo, textos, distancias, pistas, bolsas, estado, todo idéntico al baseline en los 11 turnos |
| 5 | ¿Los cambios son consistentes con el texto? | **Los tres que hizo, sí** (T5, T10, T11). Queda **un** turno inconsistente: **T9**. Y **T6** tiene un texto ambiguo ("de 5 años" sin "y +") con columnas 5-10 — no cambió, no estaba en la lista, lo anoto por completitud |

**Fechas de ventana: ninguna se movió.** Los 11 turnos tienen exactamente los mismos cuatro timestamps que el 08/09 (§3). La auditoría de los 3 UPDATEs muestra en el diff **sólo** las columnas de edad (§4) — el modal de `carta-llamados.html` reescribió las fechas con el mismo valor (`inputLocalAISO(isoAInputLocal(x)) === x`), que es exactamente lo que el fix de hora local tenía que garantizar. Confirmado en producción con edición real de Yesi, no con probe.

---

## 2. Los once turnos — hoy vs baseline

```sql
select c.numero_turno as t, c.id, c.edad_minima_anos as emin, c.edad_maxima_anos as emax, c.condicion_sexo as sexo, c.condicion_handicap, c.condicion_adicional, c.distancia_metros as m, c.tipo_pista, c.bolsa_total, c.estado,
 c.apertura_inscripcion as ap_insc_raw, to_char(c.apertura_inscripcion at time zone 'America/Argentina/Buenos_Aires','DD/MM HH24:MI') ap_insc_ar,
 c.cierre_inscripcion as ci_insc_raw, to_char(c.cierre_inscripcion at time zone 'America/Argentina/Buenos_Aires','DD/MM HH24:MI') ci_insc_ar,
 c.apertura_ratificacion as ap_rat_raw, to_char(c.apertura_ratificacion at time zone 'America/Argentina/Buenos_Aires','DD/MM HH24:MI') ap_rat_ar,
 c.cierre_ratificacion as ci_rat_raw, to_char(c.cierre_ratificacion at time zone 'America/Argentina/Buenos_Aires','DD/MM HH24:MI') ci_rat_ar
from carreras c where c.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' order by c.numero_turno
```

Salida cruda:

```json
[{"t":1,"id":"c037b139-b8b5-46d7-900e-cbc7a01bd643","emin":3,"emax":3,"sexo":"ambos","condicion_handicap":"Todo caballo 3 años perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","m":800,"tipo_pista":"tierra","bolsa_total":"1054166.67","estado":"abierta","ap_insc_raw":"2026-08-24 00:00:00+00","ap_insc_ar":"23/08 21:00","ci_insc_raw":"2026-09-11 15:00:00+00","ci_insc_ar":"11/09 12:00","ap_rat_raw":"2026-09-14 03:00:00+00","ap_rat_ar":"14/09 00:00","ci_rat_raw":"2026-09-14 15:00:00+00","ci_rat_ar":"14/09 12:00"},
 {"t":2,"id":"2d4016ad-460a-44c9-9b2d-d710a510edee","emin":4,"emax":4,"sexo":"ambos","condicion_handicap":"Todo caballo 4 años perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","m":800,"tipo_pista":"tierra","bolsa_total":"1016666.67","estado":"abierta","ap_insc_raw":"2026-08-28 00:00:00+00","ap_insc_ar":"27/08 21:00","ci_insc_raw":"2026-09-11 15:00:00+00","ci_insc_ar":"11/09 12:00","ap_rat_raw":"2026-09-14 03:00:00+00","ap_rat_ar":"14/09 00:00","ci_rat_raw":"2026-09-14 15:00:00+00","ci_rat_ar":"14/09 12:00"},
 {"t":3,"id":"7250cda2-4b1b-40f5-80ed-54121745241b","emin":4,"emax":4,"sexo":"ambos","condicion_handicap":"Todo caballo 4 años perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","m":1200,"tipo_pista":"cesped","bolsa_total":"1118333.33","estado":"abierta","ap_insc_raw":"2026-08-28 00:00:00+00","ap_insc_ar":"27/08 21:00","ci_insc_raw":"2026-09-11 15:00:00+00","ci_insc_ar":"11/09 12:00","ap_rat_raw":"2026-09-14 03:00:00+00","ap_rat_ar":"14/09 00:00","ci_rat_raw":"2026-09-14 15:00:00+00","ci_rat_ar":"14/09 12:00"},
 {"t":4,"id":"fbf0de67-875f-4dbd-834c-60503d2d6f2f","emin":5,"emax":10,"sexo":"ambos","condicion_handicap":"Todo caballo 5 años y + edad perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","m":800,"tipo_pista":"cesped","bolsa_total":"1000000.00","estado":"abierta","ap_insc_raw":"2026-08-28 00:00:00+00","ap_insc_ar":"27/08 21:00","ci_insc_raw":"2026-09-11 15:00:00+00","ci_insc_ar":"11/09 12:00","ap_rat_raw":"2026-09-14 03:00:00+00","ap_rat_ar":"14/09 00:00","ci_rat_raw":"2026-09-14 15:00:00+00","ci_rat_ar":"14/09 12:00"},
 {"t":5,"id":"9733113c-8c80-40eb-80b4-6f741abf125c","emin":3,"emax":4,"sexo":"ambos","condicion_handicap":"Todo caballo 3 y 4 años ganador de 1 o 2 carreras.","condicion_adicional":"Peso 57 kilos. Recargo de 2 kilos al ganador de 2 carreras. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","m":1000,"tipo_pista":"tierra","bolsa_total":"1166666.67","estado":"abierta","ap_insc_raw":"2026-08-28 00:00:00+00","ap_insc_ar":"27/08 21:00","ci_insc_raw":"2026-09-11 15:00:00+00","ci_insc_ar":"11/09 12:00","ap_rat_raw":"2026-09-14 03:00:00+00","ap_rat_ar":"14/09 00:00","ci_rat_raw":"2026-09-14 15:00:00+00","ci_rat_ar":"14/09 12:00"},
 {"t":6,"id":"7da3fa1c-a32a-42dc-ad2f-6b10e86cba22","emin":5,"emax":10,"sexo":"ambos","condicion_handicap":"Todo caballo de 5 años ganador de 1 o 2 carreras.","condicion_adicional":"Peso 57 kilos. Recargo de 2 kilos al ganador de 2 carreras. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","m":1000,"tipo_pista":"tierra","bolsa_total":"1083333.33","estado":"abierta","ap_insc_raw":"2026-08-28 00:00:00+00","ap_insc_ar":"27/08 21:00","ci_insc_raw":"2026-09-11 15:00:00+00","ci_insc_ar":"11/09 12:00","ap_rat_raw":"2026-09-14 03:00:00+00","ap_rat_ar":"14/09 00:00","ci_rat_raw":"2026-09-14 15:00:00+00","ci_rat_ar":"14/09 12:00"},
 {"t":7,"id":"3b553ea4-1052-4411-933b-156e6676dfc0","emin":6,"emax":10,"sexo":"ambos","condicion_handicap":"Todo caballo 6 años y + edad ganadores de 1 o 2 carreras.","condicion_adicional":"Peso 57 kilos. Recargo de 2 kilos al ganador de 2 carreras. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","m":1100,"tipo_pista":"cesped","bolsa_total":"1191666.67","estado":"abierta","ap_insc_raw":"2026-08-28 00:00:00+00","ap_insc_ar":"27/08 21:00","ci_insc_raw":"2026-09-11 15:00:00+00","ci_insc_ar":"11/09 12:00","ap_rat_raw":"2026-09-14 03:00:00+00","ap_rat_ar":"14/09 00:00","ci_rat_raw":"2026-09-14 15:00:00+00","ci_rat_ar":"14/09 12:00"},
 {"t":8,"id":"bae8008f-87fc-479e-a416-27502c7489b3","emin":5,"emax":null,"sexo":"hembras","condicion_handicap":"Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras.","condicion_adicional":"Peso 55 kilos. Recargo de 2 kilos a las ganadora de 2 carreras. Jockey aprendices sin descargo.","m":1200,"tipo_pista":"tierra","bolsa_total":"1191666.67","estado":"abierta","ap_insc_raw":"2026-08-28 00:00:00+00","ap_insc_ar":"27/08 21:00","ci_insc_raw":"2026-09-11 15:00:00+00","ci_insc_ar":"11/09 12:00","ap_rat_raw":"2026-09-14 03:00:00+00","ap_rat_ar":"14/09 00:00","ci_rat_raw":"2026-09-14 15:00:00+00","ci_rat_ar":"14/09 12:00"},
 {"t":9,"id":"5cd5d00e-c844-467d-925f-83b378863af5","emin":5,"emax":10,"sexo":"ambos","condicion_handicap":"Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras.","condicion_adicional":"Peso 52 kilos al ganador de 2 carreras. Recargo de 2 kilos por carrera subsiguiente ganada. Jockey aprendices sin descargo.","m":1100,"tipo_pista":"tierra","bolsa_total":"3333333.33","estado":"abierta","ap_insc_raw":"2026-08-28 00:00:00+00","ap_insc_ar":"27/08 21:00","ci_insc_raw":"2026-09-11 15:00:00+00","ci_insc_ar":"11/09 12:00","ap_rat_raw":"2026-09-14 03:00:00+00","ap_rat_ar":"14/09 00:00","ci_rat_raw":"2026-09-14 15:00:00+00","ci_rat_ar":"14/09 12:00"},
 {"t":10,"id":"099b050d-b7e5-412c-b789-55dae7d5cd13","emin":5,"emax":null,"sexo":"hembras","condicion_handicap":"Yeguas 5 años y + edad perdedoras.","condicion_adicional":"Peso 55 kilos. Jockey aprendices con descargo.","m":1100,"tipo_pista":"cesped","bolsa_total":"1833333.33","estado":"abierta","ap_insc_raw":"2026-08-28 00:00:00+00","ap_insc_ar":"27/08 21:00","ci_insc_raw":"2026-09-11 15:00:00+00","ci_insc_ar":"11/09 12:00","ap_rat_raw":"2026-09-14 03:00:00+00","ap_rat_ar":"14/09 00:00","ci_rat_raw":"2026-09-14 15:00:00+00","ci_rat_ar":"14/09 12:00"},
 {"t":11,"id":"0bf74c72-9300-4406-8949-d81705da0c23","emin":5,"emax":null,"sexo":"ambos","condicion_handicap":"Todo caballo 5 años y + edad perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices con descargo.","m":1200,"tipo_pista":"tierra","bolsa_total":"1833333.33","estado":"abierta","ap_insc_raw":"2026-08-28 00:00:00+00","ap_insc_ar":"27/08 21:00","ci_insc_raw":"2026-09-11 15:00:00+00","ci_insc_ar":"11/09 12:00","ap_rat_raw":"2026-09-14 03:00:00+00","ap_rat_ar":"14/09 00:00","ci_rat_raw":"2026-09-14 15:00:00+00","ci_rat_ar":"14/09 12:00"}]
```

### Tabla comparada — edad y sexo

Baseline = foto del 08/09 post-fix (`2026-09-08_ejecucion-fix-condicion-sexo-t8-t10-r9.md` línea 178-188), idéntica al snapshot de esta mañana.

| T | texto `condicion_handicap` | sexo | emin 08/09 → hoy | emax 08/09 → hoy | ¿cambió? | ¿consistente con el texto? |
|---|---|---|---|---|---|---|
| 1 | Todo caballo 3 años perdedor. | ambos | 3 → 3 | 3 → 3 | — | ✅ |
| 2 | Todo caballo 4 años perdedor. | ambos | 4 → 4 | 4 → 4 | — | ✅ |
| 3 | Todo caballo 4 años perdedor. | ambos | 4 → 4 | 4 → 4 | — | ✅ |
| 4 | Todo caballo 5 años y + edad perdedor. | ambos | 5 → 5 | 10 → 10 | — | ✅ (max 10 = tope práctico, no restringe) |
| **5** | Todo caballo 3 y 4 años ganador de 1 o 2 carreras. | ambos | **5 → 3** | **10 → 4** | ✅ Yesi 15:19 | ✅ **arreglado** |
| 6 | Todo caballo de 5 años ganador de 1 o 2 carreras. | ambos | 5 → 5 | 10 → 10 | — | ⚠ texto dice "de 5 años" (¿solo 5?), columnas dicen 5-10. Ambiguo, no estaba en la lista, no lo tocó |
| 7 | Todo caballo 6 años y + edad ganadores de 1 o 2 carreras. | ambos | 6 → 6 | 10 → 10 | — | ✅ |
| 8 | Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras. | hembras | 5 → 5 | NULL → NULL | — | ✅ |
| **9** | Especial Todo caballo **4 años y +** edad ganador de 3 o mas carreras. | ambos | **5 → 5** | 10 → 10 | ❌ **sin tocar** | ❌ **sigue mal**: texto 4+, columna 5 |
| **10** | Yeguas 5 años y + edad perdedoras. | hembras | 5 → 5 | **10 → NULL** | ✅ Yesi 15:22 | ✅ (fuera de lista, pero correcto y ahora igual a T8) |
| **11** | Todo caballo 5 años y + edad perdedor. | ambos | 5 → 5 | **5 → NULL** | ✅ Yesi 15:20 | ✅ **arreglado** |

Todo lo demás (sexo, texto handicap, texto adicional, distancia, pista, bolsa, estado): **byte a byte igual** al baseline en los 11 turnos.

---

## 3. Las cuatro fechas de ventana — los 11 turnos

Valores esperados (post `2026-09-08_ejecucion-ventanas-r9.md`, y sin corregir `apertura_inscripcion`, como se acordó ese día):

| columna | raw esperado | AR |
|---|---|---|
| `apertura_inscripcion` | `2026-08-24 00:00:00+00` (T1) / `2026-08-28 00:00:00+00` (T2-11) | 23/08 21:00 / 27/08 21:00 |
| `cierre_inscripcion` | `2026-09-11 15:00:00+00` | 11/09 12:00 |
| `apertura_ratificacion` | `2026-09-14 03:00:00+00` | 14/09 00:00 |
| `cierre_ratificacion` | `2026-09-14 15:00:00+00` | 14/09 12:00 |

| T | ap_insc raw | ci_insc raw | ap_rat raw | ci_rat raw | ¿igual al baseline? |
|---|---|---|---|---|---|
| 1 | 2026-08-24 00:00+00 | 2026-09-11 15:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | ✅ |
| 2 | 2026-08-28 00:00+00 | 2026-09-11 15:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | ✅ |
| 3 | 2026-08-28 00:00+00 | 2026-09-11 15:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | ✅ |
| 4 | 2026-08-28 00:00+00 | 2026-09-11 15:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | ✅ |
| **5** (editado) | 2026-08-28 00:00+00 | 2026-09-11 15:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | ✅ **0 h de corrimiento** |
| 6 | 2026-08-28 00:00+00 | 2026-09-11 15:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | ✅ |
| 7 | 2026-08-28 00:00+00 | 2026-09-11 15:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | ✅ |
| 8 | 2026-08-28 00:00+00 | 2026-09-11 15:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | ✅ |
| 9 | 2026-08-28 00:00+00 | 2026-09-11 15:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | ✅ |
| **10** (editado) | 2026-08-28 00:00+00 | 2026-09-11 15:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | ✅ **0 h** |
| **11** (editado) | 2026-08-28 00:00+00 | 2026-09-11 15:00+00 | 2026-09-14 03:00+00 | 2026-09-14 15:00+00 | ✅ **0 h** |

**44 de 44 timestamps iguales al baseline.** El bug pre-fix corría 3 h por vuelta (`2026-09-08_fix-carta-llamados-hora-local.md`); si el fix no hubiera estado vivo, T5/T10/T11 tendrían `cierre_inscripcion` en 12:00+00 (09:00 AR) o peor. No pasó.

---

## 4. Auditoría — qué tocó Yesi, exactamente

```sql
select a.created_at, to_char(a.created_at at time zone 'America/Argentina/Buenos_Aires','DD/MM HH24:MI:SS') ar, a.accion, c.numero_turno as t, u.nombre_completo, u.rol,
 (select jsonb_object_agg(k, jsonb_build_object('antes', a.datos_antes->k, 'despues', a.datos_despues->k)) from jsonb_object_keys(coalesce(a.datos_despues,'{}'::jsonb)) k where a.datos_antes->k is distinct from a.datos_despues->k) as diff
from auditoria a join carreras c on c.id=a.registro_id left join usuarios u on u.id=a.usuario_id
where a.tabla='carreras' and c.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and a.created_at > '2026-09-11 00:00:00+00' order by a.created_at
```

```json
[{"created_at":"2026-09-11 18:19:34.019227+00","ar":"11/09 15:19:34","accion":"UPDATE","t":5,"nombre_completo":"Yesica Elias","rol":"operador","diff":{"edad_maxima_anos":{"antes":10,"despues":4},"edad_minima_anos":{"antes":5,"despues":3}}},
 {"created_at":"2026-09-11 18:20:20.236025+00","ar":"11/09 15:20:20","accion":"UPDATE","t":11,"nombre_completo":"Yesica Elias","rol":"operador","diff":{"edad_maxima_anos":{"antes":5,"despues":null}}},
 {"created_at":"2026-09-11 18:22:22.445538+00","ar":"11/09 15:22:22","accion":"UPDATE","t":10,"nombre_completo":"Yesica Elias","rol":"operador","diff":{"edad_maxima_anos":{"antes":10,"despues":null}}}]
```

Tres UPDATEs, tres minutos, rol `operador`. El `diff` (claves donde `datos_antes` ≠ `datos_despues`) contiene **únicamente** columnas de edad — las cuatro fechas viajaron en el payload del modal (el modal manda el registro completo) y quedaron con el mismo valor, por eso no aparecen. Es la prueba más directa de que `inputLocalAISO(isoAInputLocal(x)) === x` en el browser real de Yesi. T9 no tiene fila: no lo abrió o no lo guardó.

Nota: la edición fue a las 15:19 AR, **después** del `cierre_inscripcion` (12:00 AR). El modal de carta-llamados no tiene gate de ventana, así que no bloqueó — consistente con lo que se anotó esta mañana (informe base §4, último párrafo).

---

## 5. Qué queda

1. **T9 `edad_minima_anos` 5 → 4** — sigue pendiente. Es el único turno que el gate rechaza mal. Yesi lo puede hacer desde el mismo modal (le faltó ese) o va en SQL con `auditoria`, como prefieras.
2. **T6 "de 5 años"** — ambiguo. Si es "5 y +", las columnas están bien y sobra un "y +" en el texto; si es "solo 5", `edad_maxima_anos` tendría que ser 5. Pregunta para Yesi, no urgente (los anotados en T6 son todos de 2021 = 5 años, entra cualquiera de las dos lecturas).
3. Con T5 y T11 arreglados, del informe del scrape cambia una cosa: **EL MAS SABIO (2021, 5 años) ahora NO entra en T5** por columna ni por texto. Sigue en el grupo B (vuelve a Yesi). THE BEAST PARTY (4 años) sigue chocando con T9 hasta el ítem 1.
