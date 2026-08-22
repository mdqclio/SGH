# Re-medición de R6 — resolución de la observación abierta de B8

**Read-only.** 12 SELECT, cero escritura. Proyecto `unlhcuanfrtpatoipwve`.
Contexto: `docs/BITACORA_R8_PROVISORIOS_18AGO.md` §B8 dejó abierta una diferencia entre lo
que `docs/COTEJO_R6.md` (`ebada94`) reportó esta mañana y lo que R6 mide ahora.

**Resultado: las dos hipótesis quedaron distinguidas con evidencia. Ganó la primera, y con
un matiz peor de lo que pensaba: las cifras de esta mañana no son un recorte distinto, son
incorrectas. La base de R6 no cambió hoy — está igual desde el 15/08 01:51 UTC.**

---

## 1 · Re-medición, con la query

```sql
-- Q1 — R6 medido por reunion_id
WITH r6 AS (SELECT id FROM reuniones
            WHERE numero=6 AND club_id='0649e9c5-9e87-4aad-842f-101458e6b33c')
SELECT count(*) AS lineas, sum(monto_bruto) AS bruto, sum(monto_neto) AS neto,
       count(DISTINCT liquidacion_id) AS liq_con_lineas
FROM liquidacion_detalle WHERE reunion_id=(SELECT id FROM r6);
```

```
lineas = 192 · bruto = 7410576.18 · neto = 7410576.18 · liq_con_lineas = 74
```

```sql
-- Q2 — headers de R6, con y sin líneas
SELECT r.numero AS reunion, count(*) AS headers,
       count(*) FILTER (WHERE d.n > 0) AS con_lineas,
       count(*) FILTER (WHERE d.n = 0) AS vacios,
       sum(d.n) AS lineas
FROM liquidaciones l
JOIN reuniones r ON r.id = l.reunion_id
CROSS JOIN LATERAL (SELECT count(*) AS n FROM liquidacion_detalle ld
                    WHERE ld.liquidacion_id = l.id) d
GROUP BY r.numero ORDER BY r.numero;
```

| reunión | headers | con líneas | vacíos | líneas |
|---|---|---|---|---|
| 6 | 86 | 74 | **12** | 192 |
| 8 | 94 | 94 | 0 | 199 |
| 9999 | 10 | 10 | 0 | 76 |

### Comparación contra esta mañana

| | `COTEJO_R6.md` (hoy 18/08, más temprano) | ahora | diferencia |
|---|---|---|---|
| liquidaciones | 79 | 74 con líneas (86 headers) | −5 |
| líneas de detalle | 203 | **192** | **−11** |
| monto | $7.438.067,84 "bruto" | **$7.410.576,18** | **−$27.491,66** |

**Sí difieren.** Y no se reproducen: probé `reunion_id`, membresía por header
(`liquidacion_id IN headers de R6`), join por `carrera_id`, sólo `estado='borrador'`, y
`sum(total_bruto)`/`sum(total_neto)` de los headers. **Ninguna combinación da 203 ni
$7.438.067,84.** El único número cercano, $7.734.232,01, es la suma de los **headers**
(`liquidaciones.total_neto`), que está inflada por los 12 vacíos.

---

## 2 · Las dos hipótesis, distinguidas con evidencia

### 2.a · ¿Se pueden fechar las líneas? No por columna, sí por `xmin`

`liquidacion_detalle` **no tiene `created_at` ni `updated_at`** — sus columnas de tiempo son
`fecha_liberacion` y `pagado_at`, ninguna sirve. Verificado contra
`information_schema.columns`.

Pero cada fila de Postgres lleva `xmin`, el id de la transacción que la escribió.
`track_commit_timestamp` está en `off`, así que no hay fecha, pero **sí hay orden**:

```sql
-- Q3 — ventana de transacciones por reunión
SELECT r.numero AS reunion,
       min(ld.xmin::text::bigint) AS xmin_min,
       max(ld.xmin::text::bigint) AS xmin_max,
       count(DISTINCT ld.xmin::text) AS transacciones
FROM liquidacion_detalle ld JOIN reuniones r ON r.id = ld.reunion_id
GROUP BY r.numero ORDER BY r.numero;
```

| reunión | xmin_min | xmin_max | transacciones |
|---|---|---|---|
| 6 | 10869 | **10949** | 74 |
| 8 | 11198 | 12576 | 94 |
| 9999 | 5839 | 5852 | 10 |

Calibración con transacciones de esta operación, cuyo momento conocemos:

```sql
-- Q4 — puntos de referencia
SELECT (SELECT max(b.xmin::text::bigint) FROM bak_r8_propietario b)          AS b2_snapshot,
       (SELECT min(p.xmin::text::bigint) FROM propietarios p
          WHERE p.notas LIKE 'provisorio R8%')                               AS b3_provisorios,
       (SELECT max(i.xmin::text::bigint) FROM inscripciones i
          JOIN carreras c ON c.id=i.carrera_id
          WHERE c.reunion_id='7b6e003e-22e2-4629-bf55-f18560b1260f'
            AND i.estado='ratificado')                                       AS b6_inscripciones,
       (SELECT pg_snapshot_xmin(pg_current_snapshot()))::text::bigint        AS ahora;
```

```
B2 snapshot (16:01) = 12448
B3 provisorios      = 12450
B6 inscripciones    = 12454
ahora               = 12673
```

**La línea más nueva de R6 es la 10949, mil quinientas transacciones antes de que esta
operación empezara (12448).** Ninguna línea de R6 fue escrita hoy.

> **Límite honesto de esta prueba:** `xmin` sólo habla de las filas que **siguen vivas**. Un
> DELETE puro no deja rastro. Prueba que nada se **insertó ni actualizó** en R6 hoy; no
> alcanzaría, por sí sola, para descartar un borrado. Por eso hace falta lo que sigue.

### 2.b · Qué le pasó realmente a R6 — y cuándo

Mirando carrera por carrera aparece la anomalía:

```sql
-- Q5 — estado y líneas por carrera de R6
WITH r6 AS (SELECT id FROM reuniones
            WHERE numero=6 AND club_id='0649e9c5-9e87-4aad-842f-101458e6b33c')
SELECT c.numero_carrera_programa AS prog, c.numero_turno AS turno,
       res.estado AS estado_resultado, res.xmin::text::bigint AS xmin_resultado,
       (SELECT count(*) FROM liquidacion_detalle ld WHERE ld.carrera_id=c.id) AS lineas
FROM carreras c LEFT JOIN resultados res ON res.carrera_id=c.id
WHERE c.reunion_id=(SELECT id FROM r6) ORDER BY c.numero_turno;
```

| prog | turno | estado resultado | xmin | líneas |
|---|---|---|---|---|
| 1 | 1 | oficial | 7460 | 18 |
| 2 | 2 | oficial | 7493 | 16 |
| **3** | **3** | **provisional** | **10867** | **0** |
| — | 4 | *(anulada)* | — | 0 |
| 8 | 5 | oficial | 7613 | 17 |
| 6 | 6 | oficial | 7696 | 17 |
| — | 7 | *(anulada)* | — | 0 |
| 4 | 8 | oficial | 7815 | 17 |
| 7 | 9 | oficial | 8342 | 17 |
| — | 10 | *(anulada)* | — | 0 |
| 5 | 11 | oficial | 8035 | 18 |

**La carrera 3 de R6 no está oficial: está `provisional` y tiene 0 líneas.** Su `resultado`
tiene `xmin = 10867`, muy por encima de los otros siete (7460–8342) y **justo por debajo de
la ventana de las líneas de R6 (10869–10949)**: primero se des-oficializó, y en la misma
operación se regeneraron las líneas de las otras siete.

La fecha la da `auditoria`:

```sql
-- Q6 — historia del resultado de la carrera 3 de R6
WITH r6 AS (SELECT id FROM reuniones
            WHERE numero=6 AND club_id='0649e9c5-9e87-4aad-842f-101458e6b33c'),
c3 AS (SELECT c.id AS carrera_id, res.id AS resultado_id
       FROM carreras c JOIN resultados res ON res.carrera_id=c.id
       WHERE c.reunion_id=(SELECT id FROM r6) AND c.numero_carrera_programa=3)
SELECT a.created_at, a.tabla, a.accion, a.usuario_id,
       a.datos_antes->>'estado' AS antes, a.datos_despues->>'estado' AS despues
FROM auditoria a, c3 WHERE a.registro_id IN (c3.resultado_id, c3.carrera_id)
ORDER BY a.created_at DESC LIMIT 20;
```

| created_at | tabla | acción | antes | después |
|---|---|---|---|---|
| **2026-08-15 01:51:17+00** | resultados | UPDATE | **oficial** | **provisional** |
| 2026-07-22 19:21:43+00 | resultados | UPDATE | provisional | oficial |
| 2026-07-22 18:04:38+00 | resultados | INSERT | — | provisional |

Usuario `9ac2d140-faec-424c-9437-0cedeb8b8b82`. Y el header más nuevo de R6 se creó a las
**2026-08-15 01:51:26**, nueve segundos después: el recálculo que disparó la
des-oficialización.

### Veredicto

**R6 está en su estado actual desde el 15/08 01:51 UTC — tres días antes de esta operación.**

- **Hipótesis "alguien recalculó R6 hoy": descartada.** El único evento es del 15/08, con
  fecha, usuario y acción en `auditoria`, y coherente con las tres evidencias
  independientes: el `xmin` de las líneas, el `xmin` del resultado y el `created_at` del
  header.
- **Hipótesis "recorte distinto": confirmada en parte y peor de lo previsto.** No es que
  midiera otra cosa: **las cifras de esta mañana no se reproducen con ninguna query** contra
  una base que no cambió desde el 15/08. Son incorrectas, no distintas.

Los 12 headers vacíos son la firma del mismo evento: `desoficializar_carrera` borra las
líneas de esa carrera pero no limpia los headers que quedan sin ninguna — el motor sí los
borra (`liquidaciones-engine.js:367`), y por eso R8 quedó con 0 vacíos y R6 sigue con 12.

### ⚠️ Corrección a `docs/COTEJO_R6.md`

Dos afirmaciones de ese doc son incorrectas, y la primera importa más que los totales:

1. *"Los 8 resultados están en estado `oficial`"* (PASO 0) — **falso desde el 15/08**. Son
   **7 oficiales + 1 provisional** (la carrera 3, RADIO MAX DOLORES). El cotejo de resultados
   contra la planilla **no se invalida** —comparaba `resultado_posiciones`, que existe igual
   en una carrera provisional— pero la afirmación de oficialidad está mal.
2. *"R6 tiene 79 liquidaciones · 203 líneas · $7.438.067,84"* (PASO 4) — los números reales
   al momento de escribirlo eran **74 con líneas · 192 · $7.410.576,18**. Las conclusiones de
   plata sobre WISLA KEN ($113.000) y TIRSO ($10.000) **no dependen de esos totales**, pero
   el denominador del "1,65 %" está mal.

`docs/COTEJO_R6.md` vive en el branch `diag/cotejo-resultados-r6` (`ebada94`), no en éste;
la corrección hay que aplicarla allá.

---

## 3 · ¿El recálculo de B10 pudo alcanzar R6? No — acotado por `reunion_id`

**No. Y no es por descarte: está en el código.**

El motor lee sus headers acotando por reunión **y** por club
(`liquidaciones-engine.js:259-263`):

```js
const { data: existingLiqs } = await sb.from('liquidaciones')
  .select('id, profesional_id, propietario_id, estado, ' +
          'liquidacion_detalle(id,estado_linea,recibo_id,beneficiario_tipo,beneficiario_id,' +
          'concepto,concepto_tipo,inscripcion_id,posicion)')
  .eq('reunion_id', rid).eq('club_id', clubId);
```

Y **todo lo que borra o actualiza pasa por esa lista**:

```js
// líneas 283-290 — el DELETE de detalle
const allHeaderIds = (existingLiqs || []).map(h => h.id);
if (allHeaderIds.length) {
  await sb.from('liquidacion_detalle').delete()
    .in('liquidacion_id', allHeaderIds)      // ← sólo headers de ESTA reunión
    .is('recibo_id', null)
    .neq('estado_linea', 'pagado');
}

// línea 367 — el DELETE de headers vacíos, sobre survivingHeaderIds ⊆ existingLiqs
await sb.from('liquidaciones').delete().eq('id', hid);
```

`rid` es el `reunionId` que recibe la función; en B10 fue R8
(`7b6e003e-22e2-4629-bf55-f18560b1260f`). **No hay ninguna sentencia de escritura en el motor
que no esté acotada por `liquidacion_id ∈ headers de la reunión` o por `id` de un header de
esa lista.** Los `carreras`, `resultados`, `inscripciones` y `resultado_posiciones` que lee
también se acotan por `carrera_id IN (carreras de rid)`.

Confirmación empírica, independiente del código:

```sql
-- Q7 — liquidaciones creadas durante la ventana de la operación, por reunión
SELECT r.numero AS reunion, count(*) AS liquidaciones,
       count(*) FILTER (WHERE l.created_at >= '2026-08-18 16:00:00+00') AS creadas_en_la_operacion
FROM liquidaciones l JOIN reuniones r ON r.id = l.reunion_id
GROUP BY r.numero ORDER BY r.numero;
```

| reunión | liquidaciones | creadas en la operación |
|---|---|---|
| 6 | 86 | **0** |
| 8 | 94 | 25 |
| 9999 | 10 | **0** |

Más el `xmin` de Q3: las líneas de R6 son todas anteriores (≤ 10949) a la primera escritura
de la operación (12448). **Dos evidencias independientes, más el código: B10 no tocó R6.**

---

## Estado

**Nada que corregir en la base.** R6 está como quedó el 15/08; lo que estaba mal era el
reporte de esta mañana. Lo que sí queda por hacer:

1. Corregir `docs/COTEJO_R6.md` en `diag/cotejo-resultados-r6` (oficialidad y totales).
2. Decidir qué pasa con la **carrera 3 de R6**: está `provisional` desde el 15/08 y **sin
   ninguna línea de liquidación**. Si esa des-oficialización fue deliberada, falta re-oficializar
   o dejar constancia; si no, alguien la des-oficializó sin querer y hay 11 líneas de plata
   que nadie está viendo.
3. Los 12 headers vacíos de R6 se limpian solos la próxima vez que se recalcule esa reunión.

---

# Anexo — verificación de la hipótesis "fue por la corrección de montas"

**Read-only.** 8 SELECT más. **La hipótesis NO se confirma.** Las montas se corrigieron el
**07/08 sin des-oficializar nada**; la des-oficialización del 15/08 es un evento separado,
ocho días después.

## 1 · ¿Hay montas modificadas en la carrera 3 alrededor del 15/08? No — son del 07/08

```sql
-- Q8 — inscripciones de R6 por día de última modificación
WITH r6 AS (SELECT id FROM reuniones
            WHERE numero=6 AND club_id='0649e9c5-9e87-4aad-842f-101458e6b33c')
SELECT date_trunc('day', i.updated_at) AS dia, count(*) AS inscripciones
FROM inscripciones i JOIN carreras c ON c.id=i.carrera_id
WHERE c.reunion_id=(SELECT id FROM r6) GROUP BY 1 ORDER BY 1 DESC;
```

| día | inscripciones |
|---|---|
| **2026-08-07** | **32** |
| 2026-07-22 | 26 |
| 2026-06-20 | 39 |
| 2026-06-16 | 2 |
| 2026-06-15 | 25 |
| 2026-06-13 | 1 |

**Entre el 12/08 y el 16/08 no se tocó ninguna inscripción de R6: cero.** El 32 existe, pero
es del **07/08**, cinco días antes de la fecha que recordabas y ocho antes de la
des-oficialización.

Qué cambió exactamente, sacado del diff de `auditoria`:

```sql
-- Q9 — campos realmente modificados en ese lote
WITH ... ev AS (SELECT a.datos_antes, a.datos_despues FROM auditoria a JOIN ins6 ...
                WHERE a.tabla='inscripciones' AND a.created_at='2026-08-07 03:43:44.234751+00')
SELECT k AS campo, count(*) AS veces_cambiado
FROM ev, LATERAL jsonb_each_text(ev.datos_despues) AS d(k,v)
WHERE (ev.datos_antes ->> d.k) IS DISTINCT FROM d.v GROUP BY k ORDER BY 2 DESC;
```

```
jockey_titular_id = 32
updated_at        = 32
```

**Son exactamente las 32 montas, y lo único que cambió fue el jockey.** Un solo timestamp
(`2026-08-07 03:43:44.234751+00`) para las 32 → una sola sentencia. `usuario_id = NULL` →
corrió por script/service key, no por pantalla.

Repartidas sobre las 8 carreras activas — la carrera 3 recibió **3** de las 32:

| prog | 1 | 2 | **3** | 8 | 6 | 4 | 7 | 5 |
|---|---|---|---|---|---|---|---|---|
| montas corregidas | 5 | 4 | **3** | 2 | 6 | 4 | 5 | 3 |

**Ninguna de esas 8 carreras se des-oficializó para hacerlo** (ver Q10). O sea: corregir las
montas **no requirió** des-oficializar, y de hecho no se des-oficializó.

## 2 · ¿Otras carreras des-oficializadas y re-oficializadas? Ninguna

```sql
-- Q10 — todo cambio de estado de resultados de R6 en agosto
WITH r6 AS (...), res6 AS (SELECT res.id, c.numero_carrera_programa AS prog ...)
SELECT a.created_at, res6.prog, a.accion, a.usuario_id,
       a.datos_antes->>'estado' AS antes, a.datos_despues->>'estado' AS despues
FROM auditoria a JOIN res6 ON res6.id = a.registro_id
WHERE a.tabla='resultados' AND a.created_at >= '2026-08-01' ORDER BY a.created_at;
```

| created_at | prog | antes | después |
|---|---|---|---|
| 2026-08-15 01:51:17+00 | **3** | oficial | provisional |

**Una sola fila en todo agosto.** No hubo otras des-oficializaciones, y **tampoco hubo
ninguna re-oficialización**. No es que se re-oficializó el resto y se olvidó la 3: **la 3 es
la única que se des-oficializó alguna vez**.

## 3 · ¿Quién? — `oficializado_por` no sirve, pero `auditoria` sí

```sql
-- Q11 — estado y campos de oficialización de los 8 resultados de R6
SELECT c.numero_carrera_programa AS prog, res.estado,
       res.oficializado_por, res.oficializado_at, res.updated_at,
       (SELECT max(rp.xmin::text::bigint) FROM resultado_posiciones rp
         WHERE rp.resultado_id=res.id) AS xmin_max_posiciones
FROM carreras c JOIN resultados res ON res.carrera_id=c.id
WHERE c.reunion_id=(SELECT id FROM r6) ORDER BY c.numero_turno;
```

**`oficializado_por` y `oficializado_at` están en NULL en los 8, incluidos los 7 oficiales.**
No es que se hayan borrado al des-oficializar: **ese par de columnas no lo llena nadie en
todo el flujo**. Como evidencia, no aporta.

`auditoria` sí tiene el registro:

```
2026-08-15 01:51:17+00 · resultados · UPDATE · oficial → provisional
usuario_id 9ac2d140-faec-424c-9437-0cedeb8b8b82
  → usuarios.nombre_completo = 'Administrador Dolores'
  → email = dolores@sgh.com · rol = secretario_carreras
```

Con `usuario_id` **no nulo**, a diferencia del lote de montas del 07/08: **esto se hizo desde
una sesión de pantalla, no por script.**

Y un dato que cierra el cuadro:

```
resultado_posiciones de la carrera 3 → xmin máximo = 7537
(las otras siete: 7460–8342, todas del 22/07)
```

**Las posiciones de la carrera 3 no se tocaron después de des-oficializarla.** Se
des-oficializó, no se editó nada, y no se volvió a oficializar. Si el objetivo hubiera sido
corregir el resultado, habría posiciones reescritas — no las hay.

## Veredicto

**La hipótesis de las montas no explica el 15/08.** Los hechos:

| cuándo | qué | quién | ¿des-oficializó? |
|---|---|---|---|
| **07/08 03:43** | 32 montas (`jockey_titular_id`) en las 8 carreras | script (`usuario_id` NULL) | **no** |
| **15/08 01:51** | carrera 3: oficial → provisional | dolores@sgh.com, por pantalla | **sí** |

Ocho días de distancia, distinto actor, distinto mecanismo. Y las montas se corrigieron
**sin** des-oficializar, así que la des-oficialización no fue un requisito de esa tarea.

**Lo que sí encaja con el 15/08 01:51** es la sesión de esa madrugada sobre R6: el fix de
`renderOficial()` para mostrar los cuerpos se mergeó a `main` (`08c37bb`) y se desplegó a
GitHub Pages **~01:38**, trece minutos antes. Des-oficializar y volver a oficializar es la
forma de forzar el recálculo para ver el cambio en pantalla. **Eso es coherente con la
evidencia pero no está probado**: `auditoria` registra la acción y el usuario, no la
intención. Lo único demostrado es que fue desde la pantalla, con la sesión de Dolores, y que
nadie completó el paso de vuelta.

## Corrección a lo que te reporté antes

Dije *"hay 11 líneas de plata que nadie está viendo"*. **Ese número salía del 203 que ya
sabemos que estaba mal — no lo uses.** La estimación correcta sale de comparar con la carrera
gemela:

| | bolsa_total | posiciones | líneas | neto |
|---|---|---|---|---|
| carrera 2 | $1.054.166,67 | 7 | 16 | $410.044,17 |
| **carrera 3** | **$1.054.166,67** | **6** | **0** | **$0** |

Misma bolsa exacta. **Re-oficializar la carrera 3 generaría del orden de 16 líneas y unos
$400.000**, no 11 líneas ni $27.491,66.

## Pendiente

**Re-oficializar la carrera 3 de R6** (RADIO MAX DOLORES, prog 3 / turno 3) desde
`resultados.html`. Eso regenera sus líneas y de paso limpia los 12 headers vacíos de R6.
**No se hizo — read-only.**

Antes de hacerlo conviene decidir si la des-oficialización del 15/08 fue deliberada. La
evidencia dice que no se editó nada mientras estuvo provisional, así que re-oficializar
debería devolver la carrera al estado del 22/07 más las montas corregidas del 07/08.
