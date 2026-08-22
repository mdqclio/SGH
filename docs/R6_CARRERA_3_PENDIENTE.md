# R6 · carrera 3 (RADIO MAX DOLORES) — qué pasó y qué generaría re-oficializarla

**Read-only. Nada se re-oficializó.** Proyecto `unlhcuanfrtpatoipwve` · R6 = reunión 6 del
20/06/2026 · carrera `numero_carrera_programa` = 3, `numero_turno` = 3.

Cada número de este doc lleva al lado la query que lo produjo.

> ## Cuál de las dos cifras vale
>
> Te di dos y **ninguna era correcta**:
>
> | dónde | qué dije | estado |
> |---|---|---|
> | mensaje 1 | 11 líneas · $27.491,66 | **mal** — salía de restar 203−192, y el 203 era un dato erróneo mío |
> | mensaje 2 | ~16 líneas · ~$400.000 | **aproximación**, sacada de comparar con la carrera 2 |
>
> **El número correcto, calculado y validado, es: 23 líneas · $520.044,17.**
> El detalle está en §1. La aproximación del segundo mensaje se quedó corta porque
> ignoraba los incentivos, que son per-reunión y no cuelgan de la carrera.

---

## 1 · Qué genera exactamente re-oficializar la carrera 3

### 1.1 · Método — y por qué se puede confiar

No es una estimación por analogía: se reprodujo el cálculo del motor
(`liquidaciones-engine.js`) con los datos reales de la carrera, y **se validó contra la
carrera 2, que tiene la misma bolsa exacta** ($1.054.166,67) y la misma
`distribucion_premios`. Los premios calculados coinciden peso por peso con las líneas que la
carrera 2 tiene hoy en la base.

```sql
-- Q1 — config de reparto vigente
SELECT pct_propietario, pct_entrenador, pct_jockey, pct_fondo_solidario,
       incentivo_jockey_monto, incentivo_entrenador_monto, dias_antidoping
FROM liquidacion_config
WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND activo=true;
```

```
propietario 70% · entrenador 10% · jockey 10% · fondo solidario 2%
incentivo jockey $50.000 (por reunión) · incentivo entrenador $10.000 (por caballo)
días antidoping 30
```

```sql
-- Q2 — bolsa y distribución de las carreras 2 y 3
SELECT c.numero_carrera_programa AS prog, c.bolsa_total, c.distribucion_premios
FROM carreras c WHERE c.reunion_id=<R6> AND c.numero_carrera_programa IN (2,3);
```

Las dos idénticas:

```
bolsa_total = 1054166.67
distribucion = {1:60, 2:19, 3:12, 4:6, 5:3,
                bono_ganador: 250000, ganancia_minima: 100000,
                bono_posicion_desde: 6, bono_posicion_hasta: 8, bono_posicion_monto: 100000}
```

Premio por puesto (`calcPremio`, `liquidaciones-engine.js:119-127`): bolsa × pct, más
`bono_ganador` en el 1°, con piso `ganancia_minima`:

| puesto | cálculo | premio |
|---|---|---|
| 1° | 1.054.166,67 × 60% + 250.000 | **$882.500,00** |
| 2° | × 19% | **$200.291,67** |
| 3° | × 12% | **$126.500,00** |
| 4° | × 6% = 63.250 → **piso** | **$100.000,00** |
| 5° | × 3% = 31.625 → **piso** | **$100.000,00** |
| 6°–8° | sin pct; aplica `bono_posicion_monto` | **$100.000,00** de bono |

```sql
-- Q3 — validación: líneas reales de la carrera 2 (misma bolsa)
SELECT ld.posicion, ld.beneficiario_tipo, ld.concepto_tipo, ld.monto_neto, ld.descripcion
FROM liquidacion_detalle ld JOIN carreras c ON c.id=ld.carrera_id
WHERE c.reunion_id=<R6> AND c.numero_carrera_programa=2
ORDER BY ld.posicion NULLS LAST;
```

La carrera 2 muestra `bolsa: $882.500,00` en el 1°, `$200.291,67` en el 2°, `$126.500,00` en
el 3° y `$100.000,00` en 4° y 5°. **El cálculo de arriba reproduce exactamente esos valores.**

### 1.2 · Los datos de la carrera 3

```sql
-- Q4 — orden de llegada y roles cargados
SELECT rp.posicion, rp.no_largo, s.nombre AS ejemplar,
       i.propietario_id IS NOT NULL AS tiene_prop,
       i.entrenador_id  IS NOT NULL AS tiene_entr,
       i.jockey_titular_id IS NOT NULL AS tiene_jockey
FROM carreras c JOIN resultados res ON res.carrera_id=c.id
JOIN resultado_posiciones rp ON rp.resultado_id=res.id
JOIN inscripciones i ON i.id=rp.inscripcion_id
JOIN spcs s ON s.id=i.spc_id
WHERE c.reunion_id=<R6> AND c.numero_carrera_programa=3
ORDER BY rp.posicion NULLS LAST;
```

| pos | ejemplar | propietario | entrenador | jockey |
|---|---|---|---|---|
| 1 | SIEMPREHAYESPERANZA | **no** | sí | sí |
| 2 | SANTA LISA | **no** | sí | sí |
| 3 | DOCTORA MIA | **no** | sí | sí |
| 4 | LOCA DUBAI | **no** | sí | sí |
| 5 | MARUKA PLUS | **no** | sí | sí |
| 6 | LA SENTADA | **sí** | sí | sí |
| — | TALENTOSA CATCH | no largó | sí | sí |

Ningún caballo tiene peón, capataz ni sereno cargados, así que no hay sub-líneas.

### 1.3 · Resultado — 23 líneas · $520.044,17

**Líneas de carrera (llevan `carrera_id`): 16 · $410.044,17**

| pos | premio | entrenador 10% | jockey 10% | fondo 2% | propietario 70% | líneas |
|---|---|---|---|---|---|---|
| 1° | $882.500,00 | $88.250,00 | $88.250,00 | $17.650,00 | — *(sin dueño)* | 3 |
| 2° | $200.291,67 | $20.029,17 | $20.029,17 | $4.005,83 | — *(sin dueño)* | 3 |
| 3° | $126.500,00 | $12.650,00 | $12.650,00 | $2.530,00 | — *(sin dueño)* | 3 |
| 4° | $100.000,00 | $10.000,00 | $10.000,00 | $2.000,00 | — *(sin dueño)* | 3 |
| 5° | $100.000,00 | $10.000,00 | $10.000,00 | $2.000,00 | — *(sin dueño)* | 3 |
| 6° | bono | — | — | — | **$100.000,00** | 1 |
| | | **$140.929,17** | **$140.929,17** | **$28.185,83** | **$100.000,00** | **16** |

**Líneas de incentivo (per-reunión, sin `carrera_id`): 7 · $110.000,00**

```sql
-- Q5 — incentivos que agregaría la carrera 3
WITH c3 AS (SELECT i.id, i.jockey_titular_id, i.entrenador_id, rp.no_largo ...)
SELECT count(*) FILTER (WHERE NOT no_largo)                       AS corrieron,
       count(*) FILTER (WHERE NOT no_largo AND entrenador_id IS NOT NULL) AS con_entrenador,
       count(DISTINCT jockey_titular_id) FILTER (WHERE NOT no_largo)      AS jockeys,
       count(DISTINCT jockey_titular_id) FILTER (WHERE NOT no_largo AND jockey_titular_id
         NOT IN (SELECT ld.beneficiario_id FROM liquidacion_detalle ld
                 WHERE ld.reunion_id=<R6> AND ld.concepto_tipo='incentivo_jockey')) AS jockeys_nuevos
FROM c3;
```

```
corrieron = 6 · con_entrenador = 6 · jockeys = 6 · jockeys_nuevos = 1
```

| concepto | líneas | monto |
|---|---|---|
| incentivo entrenador ($10.000 × caballo corrido) | 6 | $60.000,00 |
| incentivo jockey ($50.000, dedup por reunión — 5 de los 6 ya cobran por otra carrera) | **1** | $50.000,00 |
| | **7** | **$110.000,00** |

**TOTAL: 23 líneas · $520.044,17**

| por rol | líneas | monto |
|---|---|---|
| entrenador (premio) | 5 | $140.929,17 |
| jockey (premio) | 5 | $140.929,17 |
| club (fondo solidario) | 5 | $28.185,83 |
| propietario (bono 6°) | 1 | $100.000,00 |
| entrenador (incentivo) | 6 | $60.000,00 |
| jockey (incentivo) | 1 | $50.000,00 |
| **total** | **23** | **$520.044,17** |

De esas, **4 nacerían `retenido`** por anti-doping —los premios de 1° y 2°, entrenador y
jockey, $216.558,34— con `fecha_liberacion` = fecha de R6 + 30 días. El fondo solidario de
1° y 2° **no** se retiene: la regla mira `concepto_tipo='premio'`
(`liquidaciones-engine.js:307`).

> ### ⚠️ Lo que re-oficializar NO recupera: el 70% del propietario
>
> **Cinco de los seis puestos premiados no tienen propietario cargado.** El motor no puede
> inventar el beneficiario, así que esas líneas no se generan — ni ahora ni al
> re-oficializar.
>
> Si esos cinco tuvieran dueño, agregarían **$986.504,17** más
> (70% de 882.500 + 200.291,67 + 126.500 + 100.000 + 100.000).
>
> Es el mismo agujero que en R8 tapamos hoy con los provisorios: en R6 sigue abierto (41 de
> los 58 que corrieron no tienen propietario). **No es un problema de la carrera 3 ni lo
> arregla re-oficializarla.**

---

## 2 · ¿Se des-oficializó el 15/08 para corregir montas? — **REFUTADO**

### 2.1 · ¿Las inscripciones de esa carrera tienen `updated_at` de esas fechas? No

```sql
-- Q6 — inscripciones de R6 por día de última modificación
SELECT date_trunc('day', i.updated_at) AS dia, count(*) AS inscripciones
FROM inscripciones i JOIN carreras c ON c.id=i.carrera_id
WHERE c.reunion_id=<R6> GROUP BY 1 ORDER BY 1 DESC;
```

| día | inscripciones |
|---|---|
| **2026-08-07** | **32** |
| 2026-07-22 | 26 |
| 2026-06-20 | 39 |
| 2026-06-16 | 2 |
| 2026-06-15 | 25 |
| 2026-06-13 | 1 |

**Entre el 12/08 y el 16/08: cero.** Ninguna inscripción de R6 —ni de la carrera 3 ni de
ninguna otra— se tocó en la ventana de la des-oficialización.

El lote de 32 existe y es real, pero es del **07/08 03:43:44**, ocho días antes.

```sql
-- Q7 — qué campos cambió ese lote, según el diff de auditoria
SELECT k AS campo, count(*) AS veces
FROM (SELECT a.datos_antes, a.datos_despues FROM auditoria a
      JOIN <inscripciones de R6> ON ... 
      WHERE a.tabla='inscripciones'
        AND a.created_at='2026-08-07 03:43:44.234751+00') ev,
     LATERAL jsonb_each_text(ev.datos_despues) AS d(k,v)
WHERE (ev.datos_antes ->> d.k) IS DISTINCT FROM d.v
GROUP BY k ORDER BY 2 DESC;
```

```
jockey_titular_id = 32
updated_at        = 32
```

**Son exactamente tus 32 montas, y lo único que cambió fue el jockey.** Un solo timestamp
para las 32 → una sola sentencia. `usuario_id = NULL` → corrió por script, no por pantalla.
Repartidas: carrera 1 → 5, carrera 2 → 4, **carrera 3 → 3**, carrera 8 → 2, carrera 6 → 6,
carrera 4 → 4, carrera 7 → 5, carrera 5 → 3.

**Y no se des-oficializó ninguna carrera para hacerlo** (ver §3). Corregir el
`jockey_titular_id` es un UPDATE sobre `inscripciones`: no requiere tocar el resultado.

### 2.2 · Qué pasó realmente el 15/08

```sql
-- Q8 — resultado y posiciones de las 8 carreras de R6
SELECT c.numero_carrera_programa AS prog, res.estado,
       res.oficializado_por, res.oficializado_at, res.updated_at,
       (SELECT max(rp.xmin::text::bigint) FROM resultado_posiciones rp
         WHERE rp.resultado_id=res.id) AS xmin_max_posiciones
FROM carreras c JOIN resultados res ON res.carrera_id=c.id
WHERE c.reunion_id=<R6> ORDER BY c.numero_turno;
```

| prog | estado | updated_at | xmin posiciones |
|---|---|---|---|
| 1 | oficial | 2026-07-22 19:21:32 | 7460 |
| 2 | oficial | 2026-07-22 19:21:38 | 7493 |
| **3** | **provisional** | **2026-08-15 01:51:17** | **7537** |
| 8 | oficial | 2026-07-22 19:22:18 | 7613 |
| 6 | oficial | 2026-07-22 19:22:31 | 7696 |
| 4 | oficial | 2026-07-22 19:22:48 | 7815 |
| 7 | oficial | 2026-07-22 20:04:19 | 8342 |
| 5 | oficial | 2026-07-22 19:23:08 | 8035 |

**Las posiciones de la carrera 3 tienen `xmin` 7537 — del 22/07, igual que las demás.** O
sea: se des-oficializó y **no se editó ni una posición después**. Si el objetivo hubiera sido
corregir el resultado, habría posiciones reescritas. No las hay.

### 2.3 · Quién

`oficializado_por` y `oficializado_at` están en **NULL en los 8**, incluidos los 7 oficiales:
**ese par de columnas no lo llena nadie en todo el flujo**, así que no sirven como evidencia
ni a favor ni en contra.

`auditoria` sí tiene el registro (Q9, §3):

```
2026-08-15 01:51:17+00 · resultados · UPDATE · oficial → provisional
usuario_id 9ac2d140-faec-424c-9437-0cedeb8b8b82
  → 'Administrador Dolores' · dolores@sgh.com · secretario_carreras
```

Con `usuario_id` **no nulo**, al revés que el lote de montas: **se hizo desde una sesión de
pantalla.**

### Veredicto de la hipótesis

| cuándo | qué | quién | ¿des-oficializó? |
|---|---|---|---|
| **07/08 03:43** | 32 montas (`jockey_titular_id`) en las 8 carreras | script (`usuario_id` NULL) | **no** |
| **15/08 01:51** | carrera 3: oficial → provisional | dolores@sgh.com, por pantalla | **sí** |

**Ocho días de distancia, distinto actor, distinto mecanismo, y las montas se corrigieron sin
des-oficializar nada. La hipótesis queda refutada.**

Lo que sí cae en esa ventana es la sesión de esa madrugada sobre R6: el fix de
`renderOficial()` para mostrar los cuerpos se mergeó (`08c37bb`) y se desplegó a GitHub Pages
**~01:38**, trece minutos antes. Des-oficializar y volver a oficializar es la forma de forzar
el recálculo para ver el cambio en pantalla. **Coherente con la evidencia, pero no probado**:
`auditoria` registra la acción y el usuario, no la intención.

---

## 3 · ¿Otras carreras des-oficializadas y re-oficializadas? — solo la 3, y nunca volvió

```sql
-- Q9 — todo cambio de estado de resultados de R6 en agosto
SELECT a.created_at, res6.prog, a.accion, a.usuario_id,
       a.datos_antes->>'estado' AS antes, a.datos_despues->>'estado' AS despues
FROM auditoria a JOIN <resultados de R6> res6 ON res6.id = a.registro_id
WHERE a.tabla='resultados' AND a.created_at >= '2026-08-01'
ORDER BY a.created_at;
```

| created_at | prog | antes | después |
|---|---|---|---|
| 2026-08-15 01:51:17+00 | **3** | oficial | provisional |

**Una sola fila en todo agosto.** No hubo otras des-oficializaciones y **no hubo ninguna
re-oficialización**.

Entonces no es "se re-oficializó el resto y se olvidó la 3": **la 3 es la única que se
des-oficializó alguna vez**, y quedó así. Las otras siete nunca salieron de `oficial` desde
el 22/07.

---

## 4 · Los 12 headers vacíos

### Qué son

```sql
-- Q10 — headers de R6 sin ninguna línea
SELECT CASE WHEN l.propietario_id IS NOT NULL THEN 'propietario'
            WHEN l.profesional_id IS NOT NULL THEN 'profesional' ELSE 'club/otro' END AS tipo,
       COALESCE(p.nombre, pr.apellido || ', ' || pr.nombre, '(club)') AS beneficiario,
       l.total_neto, l.estado, l.created_at
FROM liquidaciones l
LEFT JOIN propietarios p ON p.id=l.propietario_id
LEFT JOIN profesionales pr ON pr.id=l.profesional_id
WHERE l.reunion_id=<R6>
  AND NOT EXISTS (SELECT 1 FROM liquidacion_detalle ld WHERE ld.liquidacion_id=l.id)
ORDER BY 1,2;
```

| tipo | beneficiario | total_neto |
|---|---|---|
| profesional | ARREGUY, FRANCISCO | $61.935,00 |
| profesional | AVENDAÑO, MIGUEL A | $50.000,00 |
| profesional | BLANCO, MARCELO | $20.000,00 |
| profesional | CONSTANCIO, ALEXIS | $98.250,00 |
| profesional | DA SILVA, RUBEN ALEJANDRO | $60.000,00 |
| profesional | DIESTRA, PEDRO EMANUEL | $389.850,00 |
| profesional | GIMENEZ, MARCOS EZEQUIEL | $20.000,00 |
| profesional | OSUNA, JOSE ALBERTO | $60.000,00 |
| profesional | PADRON, WALTER | $10.000,00 |
| profesional | ROMAY, ABEL IGNACIO | $50.000,00 |
| profesional | ZUBIRIA, SANTIAGO | $73.870,00 |
| propietario | CIMA, JUAN CARLOS | $100.000,00 |
| **12** | | **$993.905,00** |

Son la **cabecera** de la liquidación de cada beneficiario en la reunión: el "recibo" que
agrupa sus líneas. Los 12 se crearon el 22/07 y hoy **no tienen ninguna línea**, porque todas
las que tenían eran de la carrera 3 y se borraron al des-oficializarla.

⚠️ **Pero conservan el `total_neto` viejo**, que suma **$993.905,00**. Son cabeceras que
muestran un monto sin ninguna línea que lo respalde. En la pantalla de liquidaciones eso se
ve como deuda que no existe.

### Por qué se limpian solos al re-oficializar

Re-oficializar la carrera 3 dispara el motor sobre **toda R6**. Su paso 4
(`liquidaciones-engine.js:361-371`) recorre **todos** los headers existentes de la reunión, no
solo los que tocó:

```js
for (const h of (existingLiqs || [])) survivingHeaderIds.add(h.id); // todos los existentes
for (const hid of survivingHeaderIds) {
  const { count } = await sb.from('liquidacion_detalle')
    .select('id', { count: 'exact', head: true }).eq('liquidacion_id', hid);
  if (!count) {
    await sb.from('liquidaciones').delete().eq('id', hid);   // ← header sin líneas: se borra
  } else {
    await recomputeHeaderTotals(sb, hid);                    // ← con líneas: totales al día
    headers++;
  }
}
```

Cada uno de los 12 termina en una de dos ramas:

- **recupera líneas** — la mayoría son entrenadores y jockeys de la carrera 3, así que al
  volver a existir sus premios e incentivos el header se repuebla y `recomputeHeaderTotals`
  le recalcula el total;
- **no recupera ninguna** — se **borra**.

En los dos casos deja de haber un header con monto y sin líneas. Es exactamente lo que se vio
en R8 hoy: después del recálculo quedó con **0 headers vacíos**, mientras R6 sigue con 12
(Q11 de `docs/COTEJO_R6_REMEDICION.md`).

`desoficializar_carrera` no hace esa limpieza: borra las líneas de su carrera y no toca los
headers. Por eso los 12 quedaron colgados desde el 15/08.

---

## Resumen

| | |
|---|---|
| **Qué generaría re-oficializar** | **23 líneas · $520.044,17** (16 de carrera $410.044,17 + 7 de incentivo $110.000) |
| de eso, retenido por anti-doping | 4 líneas · $216.558,34 (premios de 1° y 2°) |
| **NO** recupera | el 70% del propietario: 5 de los 6 puestos premiados no tienen dueño cargado (serían $986.504,17 más) |
| Hipótesis de las montas | **refutada** — montas el 07/08 por script sin des-oficializar; des-oficialización el 15/08 por pantalla |
| Otras carreras | ninguna; la 3 es la única des-oficializada de R6, y nunca se re-oficializó |
| 12 headers vacíos | $993.905,00 en totales sin líneas; el motor los repuebla o los borra al recalcular |

**Pendiente:** re-oficializar la carrera 3 desde `resultados.html`. **No se hizo.**
