# EJECUCIÓN — Saldado administrativo de R6 y R8

- **Fecha**: 2026-08-28
- **SHA de `main`**: `f928fe056c3d1fadfcd2f175b09f7e5042cd1cf2`
- **Plan que ejecuta**: [`2026-08-28_plan-saldado-r6-r8.md`](2026-08-28_plan-saldado-r6-r8.md)
- **Estado**: ✅ **EJECUTADO Y VERIFICADO.** 332 líneas marcadas. Reversible.
- **Autorización**: OK explícito del usuario, con las tres decisiones de §8 del plan resueltas.

## Guards verificados (antes de escribir)

```
$ pwd
/home/clio/dev/SGH

SELECT count(*) AS spcs_count FROM spcs;
[{"spcs_count":181}]

get_project_url → https://unlhcuanfrtpatoipwve.supabase.co
git branch → main @ f928fe0
```

---

## 1. Pre-chequeo (§4.3 del plan)

```sql
SELECT count(*) AS objetivo_332,
       count(*) FILTER (WHERE reunion_id NOT IN ('b02ca761-…','7b6e003e-…')) AS fuera_de_r6_r8,
       count(*) FILTER (WHERE estado_linea='pagado' OR recibo_id IS NOT NULL) AS ya_pagadas,
       count(*) FILTER (WHERE concepto_tipo='fondo_solidario' OR beneficiario_tipo='club') AS fondo_solidario
FROM liquidacion_detalle d
WHERE d.reunion_id IN ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f')
  AND d.estado_linea <> 'pagado' AND d.recibo_id IS NULL
  AND d.concepto_tipo IS DISTINCT FROM 'fondo_solidario'
  AND d.beneficiario_tipo IS DISTINCT FROM 'club'
  AND d.beneficiario_id IS NOT NULL;
```
```json
[{"objetivo_332":332,"fuera_de_r6_r8":0,"ya_pagadas":0,"fondo_solidario":0}]
```

**332 / 0 / 0 / 0.** Exacto al plan. Se procede.

## 2. Snapshot previo

```sql
SELECT count(*) AS filas_r6_r8,
  count(*) FILTER (WHERE descripcion LIKE '%[REGULARIZACION%') AS ya_marcadas_previo,
  md5(string_agg(id::text||'|'||estado_linea::text||'|'||coalesce(pagado_at::text,'-')||'|'||coalesce(recibo_id::text,'-'),
                 E'\n' ORDER BY id)) AS fingerprint_previo,
  sum(monto_neto) AS monto_total_r6_r8
FROM liquidacion_detalle
WHERE reunion_id IN ('b02ca761-…','7b6e003e-…');
```
```json
[{"filas_r6_r8":417,"ya_marcadas_previo":0,
  "fingerprint_previo":"16ecd7463070ef1ed253397b7584a3e7",
  "monto_total_r6_r8":"22732494.84"}]
```

Cuadre del total previo: `21.861.040,85` (objetivo) + `578.753,99` (fondo solidario)
+ `292.700,00` (ya pagadas con recibo) = **`22.732.494,84`** ✅

`ya_marcadas_previo = 0` confirma que la operación no se había corrido antes (idempotencia).

- **`fingerprint_previo` = `16ecd7463070ef1ed253397b7584a3e7`**

## 3. El UPDATE ejecutado

Se corrieron las dos sentencias del plan **en una sola llamada**, como CTEs modificantes, para
garantizar atomicidad real (el MCP no asegura sesión persistente entre llamadas, así que
`BEGIN`/`COMMIT` en llamadas separadas no habría envuelto nada). Las dos CTEs ven el mismo snapshot
y sus `WHERE` son disjuntos (`estado_linea='impago'` vs `'retenido'`), así que no interfieren.

```sql
WITH a AS (
  UPDATE liquidacion_detalle d
     SET estado_linea = 'pagado',
         pagado_at    = '2026-08-28 12:00:00-03:00'::timestamptz,
         descripcion  = coalesce(d.descripcion,'')
                        || ' [REGULARIZACION 2026-08-28: saldado administrativo pre-sistema,'
                        || ' sin recibo; estado previo=impago]'
   WHERE d.reunion_id IN ('b02ca761-6f44-4720-86aa-a3c3099019ea',
                          '7b6e003e-22e2-4629-bf55-f18560b1260f')
     AND d.estado_linea = 'impago'
     AND d.recibo_id IS NULL
     AND d.concepto_tipo IS DISTINCT FROM 'fondo_solidario'
     AND d.beneficiario_tipo IS DISTINCT FROM 'club'
     AND d.beneficiario_id IS NOT NULL
  RETURNING 1
), b AS (
  UPDATE liquidacion_detalle d
     SET estado_linea = 'pagado',
         pagado_at    = '2026-08-28 12:00:00-03:00'::timestamptz,
         descripcion  = coalesce(d.descripcion,'')
                        || ' [REGULARIZACION 2026-08-28: saldado administrativo pre-sistema,'
                        || ' sin recibo; estado previo=retenido]'
   WHERE d.reunion_id IN ('b02ca761-6f44-4720-86aa-a3c3099019ea',
                          '7b6e003e-22e2-4629-bf55-f18560b1260f')
     AND d.estado_linea = 'retenido'
     AND d.recibo_id IS NULL
     AND d.concepto_tipo IS DISTINCT FROM 'fondo_solidario'
     AND d.beneficiario_tipo IS DISTINCT FROM 'club'
     AND d.beneficiario_id IS NOT NULL
  RETURNING 1
)
SELECT (SELECT count(*) FROM a) AS impago_actualizadas,
       (SELECT count(*) FROM b) AS retenido_actualizadas;
```

**Salida cruda:**
```json
[{"impago_actualizadas":254,"retenido_actualizadas":78}]
```

254 + 78 = **332**. Coincide exactamente con lo planificado.

---

## 4. Verificación posterior

### 4.1 Estado por reunión — los cuatro renglones esperados

```sql
SELECT r.numero AS reunion, d.estado_linea, count(*) AS lineas, sum(d.monto_neto) AS monto,
       count(*) FILTER (WHERE d.recibo_id IS NOT NULL) AS con_recibo_real,
       count(*) FILTER (WHERE d.descripcion LIKE '%[REGULARIZACION 2026-08-28:%') AS regularizadas
FROM liquidacion_detalle d JOIN reuniones r ON r.id=d.reunion_id
WHERE d.reunion_id IN ('b02ca761-…','7b6e003e-…') GROUP BY 1,2 ORDER BY 1,2;
```
```json
[{"reunion":6,"estado_linea":"impago","lineas":35,"monto":"293591.99","con_recibo_real":0,"regularizadas":0},
 {"reunion":6,"estado_linea":"pagado","lineas":157,"monto":"7116984.19","con_recibo_real":0,"regularizadas":157},
 {"reunion":8,"estado_linea":"impago","lineas":40,"monto":"285162.00","con_recibo_real":0,"regularizadas":0},
 {"reunion":8,"estado_linea":"pagado","lineas":185,"monto":"15036756.66","con_recibo_real":10,"regularizadas":175}]
```

| Esperado en el plan | Obtenido | ✓ |
|---|---|---|
| R6 impago 35 · 293591.99 (solo fondo) | idéntico | ✅ |
| R6 pagado 157 · 7116984.19 | idéntico | ✅ |
| R8 impago 40 · 285162.00 (solo fondo) | idéntico | ✅ |
| R8 pagado 185 · 15036756.66 (175 reg. + 10 recibo real) | idéntico | ✅ |

**`retenido` desapareció de las dos reuniones** — las 78 líneas retenidas por doping quedaron
saldadas, como decidió Fede.

### 4.2 Marcas y aislamiento

```json
[{"marcadas_total":332,"marca_impago":254,"marca_retenido":78,
  "pagado_sin_recibo":332,"filas_9999_intactas":76,"filas_9999_tocadas":0,
  "recibos_total":6,"filas_r9":0}]
```

- **332** líneas marcadas (254 + 78) — ni una de más.
- **`pagado_sin_recibo = 332`** en TODA la base: la señal estructural es única y limpia. No existe
  ninguna otra línea `pagado` sin recibo fuera de esta operación.
- **9999 intacta**: 76 filas, **0 tocadas**.
- **R9**: 0 filas (no tiene liquidaciones), imposible de alcanzar.
- **`recibos` = 6**, sin filas nuevas por esta operación (ver §5).

### 4.3 Ninguna línea con recibo real fue alterada

```sql
SELECT count(*) AS lineas_con_recibo,
       count(*) FILTER (WHERE descripcion LIKE '%REGULARIZACION%') AS con_recibo_y_marcadas,
       count(*) FILTER (WHERE pagado_at = '2026-08-28 12:00:00-03:00'::timestamptz) AS con_recibo_y_ts_regularizacion,
       min(pagado_at), max(pagado_at)
FROM liquidacion_detalle WHERE recibo_id IS NOT NULL;
```
```json
[{"lineas_con_recibo":14,"con_recibo_y_marcadas":0,"con_recibo_y_ts_regularizacion":0,
  "pagado_at_min":"2026-08-16 18:46:44.652601+00","pagado_at_max":"2026-08-28 18:13:59.248561+00"}]
```

14 líneas con recibo en toda la base (10 de R8 + 4 del sandbox 9999). **0 marcadas, 0 con el
timestamp de la regularización.** Los pagos reales quedaron intactos.

### 4.4 Reconciliación de importes

```json
[{"reunion":6,"total":"7410576.18","pagado_recibo_real":null,"pagado_regularizacion":"7116984.19",
  "impago_resta":"293591.99","retenido_resta":null,"fondo_intacto":35},
 {"reunion":8,"total":"15321918.66","pagado_recibo_real":"292700.00","pagado_regularizacion":"14744056.66",
  "impago_resta":"285162.00","retenido_resta":null,"fondo_intacto":40}]
```

- **R6**: `7.116.984,19` + `293.591,99` = **`7.410.576,18`** = total ✅
- **R8**: `292.700,00` + `14.744.056,66` + `285.162,00` = **`15.321.918,66`** = total ✅
- `retenido_resta = null` (cero) en ambas ✅
- Fondo solidario intacto: 35 líneas en R6, 40 en R8, las 75 siguen en `impago` ✅

Los totales por reunión son idénticos a los de antes de la operación (`7.410.576,18` y
`15.321.918,66` son los `total_neto` de los headers medidos en el plan). **No se movió un peso**;
sólo cambió el bucket de estado.

- **`fingerprint_post` = `e0cf4a780c72c087d99f81b60aad4d26`** (previo: `16ecd7463070ef1ed253397b7584a3e7`)

### 4.5 Efecto real en el buscador de Pagos

Réplica exacta del filtro de `cobrosBuscar` (`liquidaciones.html:813`), sin filtro de reunión —
que es como lo va a abrir Valeria:

```sql
SELECT coalesce(r.numero::text,'(sin reunion)') AS reunion, count(*) AS lineas_pagables, sum(d.monto_neto) AS monto
FROM liquidacion_detalle d LEFT JOIN reuniones r ON r.id=d.reunion_id
WHERE d.estado_linea='impago' AND d.beneficiario_tipo <> 'club' AND d.recibo_id IS NULL
GROUP BY 1 ORDER BY 1;
```
```json
[{"reunion":"9999","lineas_pagables":36,"monto":"488000.00"}]
```

**R6 y R8 desaparecieron del circuito de cobro.** Objetivo cumplido: el 20/09 el histórico de junio
y agosto ya no se le mezcla a Valeria con lo nuevo.

Lo que **sí** le va a seguir apareciendo: las **36 líneas de la reunión 9999** por **$488.000,00**
(ver §6, punto abierto).

### 4.6 Rollback verificado (dry-run, sin ejecutar)

```sql
SELECT
 (SELECT count(*) FROM liquidacion_detalle
   WHERE descripcion LIKE '%[REGULARIZACION 2026-08-28:%estado previo=impago]'
     AND estado_linea='pagado' AND recibo_id IS NULL) AS revertiria_a_impago,
 (SELECT count(*) FROM liquidacion_detalle
   WHERE descripcion LIKE '%[REGULARIZACION 2026-08-28:%estado previo=retenido]'
     AND estado_linea='pagado' AND recibo_id IS NULL) AS revertiria_a_retenido;
```
```json
[{"revertiria_a_impago":254,"revertiria_a_retenido":78}]
```

**254 + 78 = 332.** El SQL de reversión de §6.3 del plan alcanza exactamente al conjunto correcto,
ni una fila de más ni de menos, y restaura a cada línea su estado previo real. Sigue vigente y
listo para usar.

---

## 5. HALLAZGO NO PREVISTO — actividad concurrente en R8 durante la planificación

El conteo de `recibos` dio **6**, y el plan (§5.5) decía **5**. Se investigó antes de continuar.

```sql
SELECT id, numero_recibo, emitido_at, neto_a_cobrar,
       (SELECT count(*) FROM liquidacion_detalle d WHERE d.recibo_id = r.id) AS lineas
FROM recibos r ORDER BY created_at;
```

| N° | emitido_at (UTC) | neto | líneas | reunión |
|---|---|---:|---:|---|
| 9001 | 2026-06-10 02:33 | 0,00 | 2 | 9999 (seed) |
| 9002 | 2026-06-10 02:33 | 0,00 | 2 | 9999 (seed) |
| 1 | 2026-08-16 18:46 | 70.000,00 | 1 | R8 |
| 2 | **2026-08-28 12:58** | 100.000,00 | 1 | R8 |
| 3 | **2026-08-28 14:10** | 60.000,00 | 2 | R8 |
| 4 | **2026-08-28 18:13** | 62.700,00 | 6 | R8 |

**Tres recibos de R8 se emitieron HOY**, 2026-08-28, el último a las 18:13 UTC — es decir,
**mientras se estaba escribiendo el plan**. El "5" del plan venía arrastrado del relevamiento de
apoderados de esta misma jornada (~16:50 UTC), anterior al recibo N° 4.

**Esto no afectó la operación.** Las 10 líneas pagadas de R8 (1+1+2+6 = 10) ya estaban contadas
correctamente en la medición del conjunto objetivo (§1.3 del plan midió 10 pagadas con
`con_recibo=10`), y el `WHERE` guardaba por `estado_linea <> 'pagado' AND recibo_id IS NULL`:
cualquier línea pagada en el ínterin quedaba excluida **por construcción**, no por suerte. La
verificación §4.3 lo confirma: 0 líneas con recibo fueron alteradas. El único dato incorrecto fue
la cifra "5 recibos" en un párrafo descriptivo del plan, sin efecto sobre el SQL.

**Pero es información operativa relevante**: alguien está usando el circuito de Pagos sobre R8
en producción, hoy mismo. Vale confirmarlo con Fede/Valeria — la premisa de trabajo era que R8 "se
pagó por fuera del sistema", y hay al menos 4 recibos de R8 emitidos **dentro** del sistema, 3 de
ellos hoy. Las líneas correspondientes quedaron correctamente excluidas del saldado, así que no hay
doble marca; pero conviene saber quién los emitió y si respondían a pagos reales.

---

## 6. HALLAZGOS Y PUNTOS ABIERTOS

### 6.1 HALLAZGO — mensaje engañoso del guard de `desoficializar_carrera`

**Registrado por decisión explícita del usuario: se anota, NO se arregla ahora.**

`desoficializar_carrera` (SECURITY DEFINER) bloquea así:

```sql
SELECT count(*) INTO v_pagas
  FROM liquidacion_detalle d
 WHERE (d.recibo_id IS NOT NULL OR d.estado_linea = 'pagado')
   AND ( d.carrera_id = p_carrera_id
      OR d.inscripcion_id IN (SELECT i.id FROM inscripciones i WHERE i.carrera_id = p_carrera_id) );

IF v_pagas > 0 THEN
  RAISE EXCEPTION 'carrera con pagos emitidos, anulá los recibos primero';
END IF;
```

El guard es un **OR**: dispara con `estado_linea='pagado'` aunque `recibo_id` sea NULL. El mensaje,
en cambio, afirma que hay recibos y ordena anularlos.

Tras esta regularización, **7 de las 11 carreras de R6 y 8 de las 12 de R8** disparan el guard
**sin tener un solo recibo asociado**. Quien intente des-oficializar una de ellas va a leer
*"anulá los recibos primero"*, va a ir a buscar recibos que no existen, y va a perder tiempo hasta
que alguien le explique que la traba viene de un saldado administrativo.

- **Impacto**: pérdida de tiempo y diagnóstico errado. Sin riesgo de datos.
- **Arreglo sugerido (no aplicado)**: distinguir los dos casos en el mensaje, p.ej.
  *"carrera con líneas pagadas (N con recibo, M por saldado administrativo); revertí el saldado o
  anulá los recibos primero"*.
- **Decisión tomada**: que R6 y R8 queden trabadas para des-oficializar **se acepta**. Están
  cerradas y la plata salió por fuera del sistema; corregir una monta vieja no cambia nada
  financiero. El costo es teórico, el beneficio (congelar el histórico) es el objetivo.

### 6.2 PUNTO ABIERTO — la 9999 sigue apareciendo en Pagos

**La 9999 NO se borra** (decisión del usuario: es el único banco de pruebas seguro y ya demostró su
valor en el probe de recuperación de montas). Este informe no la toca.

Consecuencia medida (§4.5): el 20/09, con el buscador de Pagos sin filtro de reunión, Valeria va a
ver **36 líneas pagables por $488.000,00 de la reunión 9999**, junto a las de R9. Es plata falsa de
sandbox en la misma lista que la real.

No se resolvió porque ninguna salida es obviamente correcta y la decisión es de producto:

| Opción | Costo |
|---|---|
| Disciplina de proceso: Valeria siempre elige reunión antes de pagar | gratis, pero depende de que nadie se olvide |
| Marcar las 36 líneas de 9999 como pagadas (misma técnica) | rompe el sandbox: el probe de recuperación necesita líneas impagas |
| Excluir la 9999 en `cobrosBuscar` por código | cambio de código; hay que elegir el criterio (por `numero=9999`, por fecha futura, por un flag `es_prueba` en `reuniones`) |

La tercera parece la buena a mediano plazo —un flag `reuniones.es_prueba` excluido del circuito de
cobro resolvería esto para cualquier sandbox futuro, no sólo la 9999— pero es una decisión de Fede
y un cambio de código, fuera del alcance de esta operación.

### 6.3 Sin resolver — headers de `liquidaciones` (era el punto 3 de §8 del plan)

El mensaje de autorización decía "tres decisiones resueltas" pero enumeró dos. La tercera —qué
hacer con los 179 headers de `liquidaciones` de R6+R8, que siguen en estado `'borrador'`— quedó
sin respuesta explícita.

**Se aplicó el criterio conservador del plan: no se tocaron.** No afecta nada operativo: tanto el
buscador de Pagos (`liquidaciones.html:813`) como el Resumen (`:624`) leen
`liquidacion_detalle.estado_linea`, no el estado del header. Si se quisiera coherencia visual, es un
`UPDATE` aparte sobre `liquidaciones.estado`, no incluido acá.

---

## 7. RESUMEN

| | Valor |
|---|---|
| Líneas marcadas | **332** (254 desde `impago` + 78 desde `retenido`) |
| Monto saldado | **$21.861.040,85** (R6 $7.116.984,19 · R8 $14.744.056,66) |
| Recibos emitidos | **0** |
| Números de secuencia consumidos | **0** |
| Filas creadas / borradas | **0 / 0** |
| Columnas escritas | `estado_linea`, `pagado_at`, `descripcion` |
| Líneas con recibo real alteradas | **0** (de 14) |
| Fondo solidario tocado | **0** (75 líneas siguen en `impago`) |
| R9 / 9999 tocadas | **0 / 0** |
| Reversible | **Sí** — dry-run confirma 332 exactas |
| Fingerprint previo → posterior | `16ecd746…` → `e0cf4a78…` |

**Estado final**: R6 y R8 fuera del circuito de cobro. R9 arranca limpia. La 9999 sigue viva como
sandbox y sigue apareciendo en Pagos (§6.2).

## Notas de método

- El `UPDATE` se corrió como una única sentencia con CTEs modificantes → atomicidad real.
- La marca en `descripcion` es el único rastro persistente: `liquidacion_detalle` no tiene trigger
  de auditoría (verificado), así que la tabla `auditoria` no registró nada de esto.
- Verificado en código (no supuesto) que el recálculo paid-safe preserva estas líneas:
  `liquidaciones-engine.js:274` (condición `estado_linea==='pagado' || recibo_id != null`, un OR),
  `:286-289` (borra sólo `recibo_id IS NULL AND estado != 'pagado'`) y `:333` (no regenera lo que
  ya está en `paidKeys`). `lineKey()` (`:37`) no lee `descripcion`, así que la marca no altera el
  dedup.
- No se modificó código en esta operación. `main` sigue en `f928fe0`.
