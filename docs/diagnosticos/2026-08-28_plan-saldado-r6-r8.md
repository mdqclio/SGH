# PLAN — Saldado administrativo de R6 y R8 (regularización pre-sistema)

- **Fecha**: 2026-08-28
- **SHA de `main`**: `f928fe056c3d1fadfcd2f175b09f7e5042cd1cf2`
- **Branch de este informe**: `reports` (no se mergea)
- **Estado**: **PLAN. NO EJECUTADO.** Todo lo que sigue es medición (`SELECT`) + SQL propuesto.
  No se corrió ningún `UPDATE`. No se tocó código.

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

SELECT count(*) AS spcs_count FROM spcs;
[{"spcs_count":181}]

get_project_url → https://unlhcuanfrtpatoipwve.supabase.co
```

Los tres coinciden con el baseline de `CLAUDE.md`.

## UUIDs de trabajo

| Reunión | UUID | Fecha | Estado |
|---|---|---|---|
| **R6** (objetivo) | `b02ca761-6f44-4720-86aa-a3c3099019ea` | 2026-06-20 | borrador |
| **R8** (objetivo) | `7b6e003e-22e2-4629-bf55-f18560b1260f` | 2026-08-16 | publicada |
| R9 (NO se toca) | `cafa37d6-89f4-45cb-a0d9-835bc27407e9` | 2026-09-20 | publicada |
| 9999 sandbox (NO se toca) | `a0000000-0000-0000-0000-000000009999` | 2099-01-01 | cancelada |

---

## 1. MEDICIÓN — antes

### 1.1 Universo completo de `liquidacion_detalle`, por reunión y estado

```sql
SELECT r.numero AS reunion, r.fecha, d.estado_linea, count(*) AS lineas, sum(d.monto_neto) AS monto
FROM liquidacion_detalle d JOIN reuniones r ON r.id=d.reunion_id
GROUP BY 1,2,3 ORDER BY 1,3;
```

```json
[{"reunion":6,"fecha":"2026-06-20","estado_linea":"impago","lineas":160,"monto":"3882321.99"},
 {"reunion":6,"fecha":"2026-06-20","estado_linea":"retenido","lineas":32,"monto":"3528254.19"},
 {"reunion":8,"fecha":"2026-08-16","estado_linea":"impago","lineas":169,"monto":"5261842.00"},
 {"reunion":8,"fecha":"2026-08-16","estado_linea":"pagado","lineas":10,"monto":"292700.00"},
 {"reunion":8,"fecha":"2026-08-16","estado_linea":"retenido","lineas":46,"monto":"9767376.66"},
 {"reunion":9999,"fecha":"2099-01-01","estado_linea":"impago","lineas":51,"monto":"553040.00"},
 {"reunion":9999,"fecha":"2099-01-01","estado_linea":"pagado","lineas":4,"monto":"870000.00"},
 {"reunion":9999,"fecha":"2099-01-01","estado_linea":"retenido","lineas":21,"monto":"604800.00"}]
```

**Dato relevante: `R9` no aparece — tiene CERO líneas de liquidación.** Todo el universo de
`liquidacion_detalle` son 493 filas, repartidas sólo entre R6, R8 y la 9999. R9 se protege sola:
no hay nada suyo que un `WHERE` pudiera alcanzar.

### 1.2 Desagregado por reunión × estado × concepto × beneficiario

```sql
SELECT r.numero AS reunion, d.estado_linea, d.concepto_tipo, d.beneficiario_tipo,
       count(*) AS lineas, sum(d.monto_neto) AS monto_neto,
       count(*) FILTER (WHERE d.recibo_id IS NOT NULL) AS con_recibo,
       count(*) FILTER (WHERE d.pagado_at IS NOT NULL) AS con_pagado_at
FROM liquidacion_detalle d JOIN reuniones r ON r.id = d.reunion_id
WHERE r.id IN ('b02ca761-…','7b6e003e-…')
GROUP BY 1,2,3,4 ORDER BY 1,2,3,4;
```

**R6 — 2026-06-20**

| estado | concepto_tipo | beneficiario | líneas | monto neto | ¿objetivo? |
|---|---|---|---:|---:|---|
| impago | premio | profesional | 42 | 638.470,00 | ✅ |
| impago | premio | propietario | 6 | 890.260,00 | ✅ |
| impago | bono | propietario | 5 | 500.000,00 | ✅ |
| impago | incentivo_jockey | profesional | 21 | 1.050.000,00 | ✅ |
| impago | incentivo_entrenador | profesional | 51 | 510.000,00 | ✅ |
| impago | **fondo_solidario** | **club** | 35 | 293.591,99 | ❌ **excluida** |
| retenido | premio | profesional | 28 | 2.297.450,02 | ✅ |
| retenido | premio | propietario | 4 | 1.230.804,17 | ✅ |

**R8 — 2026-08-16**

| estado | concepto_tipo | beneficiario | líneas | monto neto | ¿objetivo? |
|---|---|---|---:|---:|---|
| impago | premio | profesional | 40 | 553.840,00 | ✅ |
| impago | premio | propietario | 20 | 1.932.840,00 | ✅ |
| impago | bono | propietario | 12 | 1.200.000,00 | ✅ |
| impago | incentivo_jockey | profesional | 18 | 900.000,00 | ✅ |
| impago | incentivo_entrenador | profesional | 39 | 390.000,00 | ✅ |
| impago | **fondo_solidario** | **club** | 40 | 285.162,00 | ❌ **excluida** |
| **pagado** | premio | profesional | 4 | 42.700,00 | ❌ ya pagada (4 recibos) |
| **pagado** | premio | propietario | 1 | 70.000,00 | ❌ ya pagada |
| **pagado** | bono | propietario | 1 | 100.000,00 | ❌ ya pagada |
| **pagado** | incentivo_jockey | profesional | 1 | 50.000,00 | ❌ ya pagada |
| **pagado** | incentivo_entrenador | profesional | 3 | 30.000,00 | ❌ ya pagada |
| retenido | premio | profesional | 31 | 2.188.138,33 | ✅ |
| retenido | premio | propietario | 15 | 7.579.238,33 | ✅ |

### 1.3 Ya pagadas hoy (el "antes" del que hay que partir)

```sql
SELECT r.numero, count(*) AS pagadas, sum(d.monto_neto) AS monto,
       count(DISTINCT d.recibo_id) AS recibos
FROM liquidacion_detalle d JOIN reuniones r ON r.id=d.reunion_id
WHERE d.estado_linea='pagado' GROUP BY 1;
```

- **R6: 0 líneas pagadas.** Cero recibos.
- **R8: 10 líneas pagadas, $292.700,00**, las 10 con `recibo_id` NO NULL y `pagado_at` NO NULL.
  Son pagos reales hechos por el sistema — **quedan intactas**.
- 9999: 4 líneas pagadas (sandbox, fuera de alcance).

### 1.4 Conjunto objetivo — el "después"

```sql
SELECT r.numero AS reunion, d.estado_linea, count(*) AS lineas, sum(d.monto_neto) AS monto_neto
FROM liquidacion_detalle d JOIN reuniones r ON r.id=d.reunion_id
WHERE d.reunion_id IN ('b02ca761-…','7b6e003e-…')
  AND d.estado_linea <> 'pagado' AND d.recibo_id IS NULL
  AND d.concepto_tipo IS DISTINCT FROM 'fondo_solidario'
  AND d.beneficiario_tipo IS DISTINCT FROM 'club'
GROUP BY 1,2;
```

| Reunión | estado previo | líneas | monto neto |
|---|---|---:|---:|
| R6 | impago | 125 | 3.588.730,00 |
| R6 | retenido | 32 | 3.528.254,19 |
| **R6 total** | | **157** | **7.116.984,19** |
| R8 | impago | 129 | 4.976.680,00 |
| R8 | retenido | 46 | 9.767.376,66 |
| **R8 total** | | **175** | **14.744.056,66** |
| **TOTAL A SALDAR** | | **332** | **$21.861.040,85** |

### 1.5 Antes / después, en una tabla

| | R6 antes | R6 después | R8 antes | R8 después |
|---|---:|---:|---:|---:|
| impago (persona) | 125 | **0** | 129 | **0** |
| retenido (persona) | 32 | **0** | 46 | **0** |
| pagado — recibo real | 0 | 0 | 10 | 10 |
| pagado — regularización | 0 | **157** | 0 | **175** |
| fondo solidario (club, impago) | 35 | 35 | 40 | 40 |
| **total líneas** | 192 | 192 | 225 | 225 |

Ninguna fila se crea ni se borra. Sólo cambian de estado 332 filas existentes.

### 1.6 NULL-safety del alcance

```sql
SELECT count(*) AS lineas_scope,
  count(*) FILTER (WHERE concepto_tipo IS NULL) AS concepto_tipo_null,
  count(*) FILTER (WHERE beneficiario_tipo IS NULL) AS beneficiario_tipo_null,
  count(*) FILTER (WHERE beneficiario_id IS NULL) AS beneficiario_id_null
FROM liquidacion_detalle WHERE reunion_id IN ('b02ca761-…','7b6e003e-…');
```
```json
[{"lineas_scope":417,"concepto_tipo_null":0,"beneficiario_tipo_null":0,"beneficiario_id_null":0}]
```

No hay NULLs en las columnas del filtro. Igual el `WHERE` usa `IS DISTINCT FROM` en lugar de `<>`
para las exclusiones, por la trampa de GOTCHA #5 (`<>` sobre NULL da NULL y descarta la fila en
silencio). Acá el efecto sería el inverso al de ISSUE-038 —descartaría filas del objetivo, no las
incluiría de más— pero se escribe NULL-safe igual.

### 1.7 Cobertura de `reunion_id`

```sql
SELECT count(*) AS total_detalle,
  count(*) FILTER (WHERE d.reunion_id IS NULL) AS detalle_reunion_id_null,
  count(*) FILTER (WHERE d.reunion_id IS DISTINCT FROM l.reunion_id) AS discrepancia
FROM liquidacion_detalle d JOIN liquidaciones l ON l.id = d.liquidacion_id;
```
```json
[{"total_detalle":493,"detalle_reunion_id_null":0,"discrepancia_con_liquidacion":0}]
```

`liquidacion_detalle.reunion_id` está poblado en las 493 filas y coincide 1:1 con el `reunion_id`
del header. Filtrar por `d.reunion_id` es seguro y completo: no hay línea que se escape.

---

## 2. CÓMO SE MARCA — columnas y valores exactos

### 2.1 ¿Existe columna de fecha de pago en `liquidacion_detalle`?

**SÍ: `pagado_at timestamptz NULL`.** No hay que inventar nada ni agregar columnas.

Columnas relevantes de la tabla (20 en total):

| Columna | Tipo | Null | Nota |
|---|---|---|---|
| `estado_linea` | `estado_linea_liq` NOT NULL | — | ENUM: `impago` / `pagado` / `retenido`. Default `'impago'` |
| `pagado_at` | `timestamptz` | SÍ | **la fecha de pago** |
| `recibo_id` | `uuid` | SÍ | FK al recibo. **Se deja NULL** (decisión 3) |
| `descripcion` | `text` | SÍ | texto libre — único lugar de marca a nivel línea |
| `monto_neto` | `numeric` | SÍ | **GENERATED ALWAYS** `(monto_bruto - monto_descuento)` — no se puede escribir (GOTCHA #9) |
| `concepto` | `varchar` NOT NULL | — | **NO TOCAR** — entra en la clave de dedup del motor (ver §5.1) |
| `fecha_liberacion` | `date` | SÍ | liberación del doping. Se deja como está |

### 2.2 Lo que se escribe

Exactamente **tres** columnas:

| Columna | Valor | Por qué |
|---|---|---|
| `estado_linea` | `'pagado'` | lo que saca la línea del circuito de cobro |
| `pagado_at` | `'2026-08-28 12:00:00-03:00'::timestamptz` | HOY, no la fecha de la reunión (decisión 2) |
| `descripcion` | `descripcion \|\| ' [REGULARIZACION …]'` | la marca (§3) |

### 2.3 Lo que NO se escribe — y por qué

| Columna | Se deja | Motivo |
|---|---|---|
| `recibo_id` | **NULL** | decisión 3: no se emiten recibos |
| `fecha_liberacion` | como está | es el dato del doping, no del pago |
| `concepto` | como está | entra en `lineKey()` del motor; tocarlo duplicaría líneas al recalcular (§5.1) |
| `monto_bruto`, `monto_descuento` | como están | los totales de header se derivan de ellas; si no cambian, los headers siguen cuadrando sin tocarlos |
| `monto_neto` | — | GENERATED, no se puede escribir |
| tabla `recibos` | sin filas nuevas | decisión 3 |
| `club_secuencias` | sin consumir | decisión 3 — la numeración correlativa arranca limpia en R9 |
| tabla `liquidaciones` (headers) | sin tocar | los 179 headers de R6+R8 quedan en `'borrador'`. La UI de Pagos y el Resumen leen `liquidacion_detalle.estado_linea`, no el estado del header (`liquidaciones.html:813` y `:624`), así que el header no participa del riesgo de doble pago |

Sobre el timestamp: se usa un valor **fijo** (`2026-08-28 12:00:00-03:00`), no `now()`. Es
determinista, reproducible si hay que re-correr, y las 332 filas comparten exactamente el mismo
instante — lo que por sí solo ya las distingue de cualquier pago real, que tiene timestamps
dispersos.

---

## 3. LA MARCA DE REGULARIZACIÓN

### 3.1 El problema: `liquidacion_detalle` no tiene auditoría ni columna de notas

```sql
SELECT c.relname, count(t.tgname) AS triggers_no_internos
FROM pg_class c … LEFT JOIN pg_trigger t ON t.tgrelid=c.oid AND NOT t.tgisinternal
WHERE c.relname IN ('liquidacion_detalle','liquidaciones') GROUP BY 1;
```
```json
[{"tabla":"liquidacion_detalle","triggers_no_internos":0},
 {"tabla":"liquidaciones","triggers_no_internos":1}]
```

**`liquidacion_detalle` no tiene trigger de auditoría.** El `UPDATE` **no** va a dejar rastro en la
tabla `auditoria` (que sí cubre `liquidaciones`, `recibos`, `inscripciones` y 7 tablas más). Sin una
marca explícita, dentro de seis meses estas 332 líneas serían indistinguibles de un pago real.

Y `liquidacion_detalle` **no tiene columna `notas`** — `liquidaciones` (el header) sí, la línea no.
El único texto libre a nivel línea es **`descripcion`**.

### 3.2 Propuesta: tres señales convergentes, ninguna columna nueva

**Señal 1 — `recibo_id IS NULL` con `estado_linea='pagado'`.** Es una combinación que el sistema
**nunca** produce: `emitir_recibo` siempre asigna `recibo_id` al marcar pagado. Hoy las 10 líneas
pagadas de R8 tienen las 10 su `recibo_id`. Un `pagado` sin recibo sólo puede venir de esta
operación. Es la señal más fuerte y es *estructural*, no textual.

**Señal 2 — `pagado_at` idéntico en las 332 filas** (`2026-08-28 12:00:00-03:00`), y posterior a
la reunión que liquida (R6 es de junio, R8 de agosto).

**Señal 3 — sufijo en `descripcion`**, legible por una persona sin consultar nada más:

```
 [REGULARIZACION 2026-08-28: saldado administrativo pre-sistema, sin recibo; estado previo=impago]
```

(o `estado previo=retenido` según corresponda). Se **agrega al final**, no reemplaza: la
`descripcion` original —`"Carrera 4 — 3° puesto — Jockey (bolsa: $140.000,00)"`— se conserva entera.

### 3.3 Por qué tocar `descripcion` es seguro

Dos consumidores leen `descripcion`, y ninguno se rompe:

1. **`rolDeLinea()`** (`liquidaciones.html:998`) extrae el rol con
   `/—\s*(Propietario|Entrenador|Jockey)\b/.exec(l.descripcion)`. Usa `exec`, o sea **la primera
   coincidencia**. El sufijo va después y no contiene ninguna de esas tres palabras → el rol se
   sigue detectando igual.
2. **`lineKey()`** (`liquidaciones-engine.js:37`), la clave de dedup del motor:
   ```javascript
   function lineKey(d) {
     return [d.beneficiario_tipo, d.beneficiario_id, d.concepto_tipo,
             d.inscripcion_id || '', d.posicion == null ? '' : d.posicion,
             d.concepto || ''].join('|');
   }
   ```
   **No incluye `descripcion`.** Sí incluye `concepto` — que por eso queda en la lista de "no
   tocar" (§2.3).

Además el sufijo hace el **rollback autoidentificable**: no hace falta la lista de ids para revertir
(aunque va igual en §6), y encima **preserva el estado previo** de cada línea, que es lo que un
`UPDATE` masivo a `'pagado'` destruiría (`impago` y `retenido` colapsan al mismo valor).

### 3.4 Reserva honesta

`descripcion` es texto libre y **el motor la reescribe** al recalcular una línea. Pero como estas
líneas quedan `pagado`, el motor las preserva y nunca las regenera (§5.1) — así que la marca
sobrevive. Si alguien alguna vez fuerza un borrado manual de líneas pagadas y recalcula, la marca
se pierde junto con la línea; ese escenario ya sería una pérdida de datos mayor que la marca.

---

## 4. LO QUE NO SE TOCA — el `WHERE` acotado

### 4.1 El predicado completo, cláusula por cláusula

```sql
WHERE d.reunion_id IN (
        'b02ca761-6f44-4720-86aa-a3c3099019ea',   -- R6, 2026-06-20
        '7b6e003e-22e2-4629-bf55-f18560b1260f'    -- R8, 2026-08-16
      )
  AND d.estado_linea <> 'pagado'                       -- no re-tocar lo ya pagado
  AND d.recibo_id IS NULL                              -- doble candado sobre lo ya pagado
  AND d.concepto_tipo IS DISTINCT FROM 'fondo_solidario'  -- fondo solidario fuera
  AND d.beneficiario_tipo IS DISTINCT FROM 'club'         -- doble candado: no va a persona
  AND d.beneficiario_id IS NOT NULL                       -- sin beneficiario, no hay a quién pagarle
```

| Cláusula | Qué protege | Verificado |
|---|---|---|
| `reunion_id IN (R6, R8)` | **R9**: 0 líneas en total, imposible alcanzarla. **9999**: `reunion_id` distinto, excluida por lista blanca positiva (no por `NOT IN`) | §1.1 |
| `estado_linea <> 'pagado'` | las 10 líneas ya pagadas de R8 | §1.3 |
| `recibo_id IS NULL` | redundante con la anterior, a propósito: si alguna línea tuviera recibo sin estar en `'pagado'`, tampoco se toca | §1.2 (`con_recibo=0` en todo lo no-pagado) |
| `concepto_tipo IS DISTINCT FROM 'fondo_solidario'` | las 75 líneas del fondo solidario (35 R6 + 40 R8) | §4.2 |
| `beneficiario_tipo IS DISTINCT FROM 'club'` | idem, por el otro lado de la equivalencia | §4.2 |
| `beneficiario_id IS NOT NULL` | cinturón: una línea sin beneficiario no representa deuda con nadie | §1.6 (0 casos) |

**Se usa lista blanca (`IN` con los dos UUID), no lista negra.** Una reunión nueva que aparezca
mañana no entra por accidente.

### 4.2 Fondo solidario: por qué se excluye

```sql
SELECT concepto_tipo, beneficiario_tipo, count(*) AS lineas
FROM liquidacion_detalle
WHERE concepto_tipo='fondo_solidario' OR beneficiario_tipo='club' GROUP BY 1,2;
```
```json
[{"concepto_tipo":"fondo_solidario","beneficiario_tipo":"club","lineas":90}]
```

**Equivalencia perfecta en toda la base**: `concepto_tipo='fondo_solidario'` ⟺
`beneficiario_tipo='club'`. No hay fondo solidario que vaya a una persona, ni línea a `club` que no
sea fondo solidario. Las dos cláusulas dicen lo mismo; van las dos como doble candado.

Es plata que el club se retiene a sí mismo: **no se le pagó a nadie por fuera del sistema**, porque
no hay nadie a quien pagarle. El propio código lo trata como bucket aparte
(`liquidaciones.html:606`: *"va a su propio bucket y se excluye de la lista de personas (se acumula,
no genera recibo)"*) y ya está fuera del buscador de Pagos por `.neq('beneficiario_tipo','club')`
(`liquidaciones.html:813`). Marcarlo `pagado` sería afirmar un pago que no ocurrió.

Esto responde literalmente al punto 4 del pedido ("ni ninguna línea del fondo solidario si esas no
van a persona"): **no van a persona, quedan afuera.**

### 4.3 Query de verificación previa (correr ANTES del UPDATE)

Tiene que devolver exactamente `332`, y `0` en las tres columnas de control:

```sql
SELECT count(*) AS objetivo_332,
       count(*) FILTER (WHERE reunion_id NOT IN ('b02ca761-6f44-4720-86aa-a3c3099019ea',
                                                 '7b6e003e-22e2-4629-bf55-f18560b1260f')) AS fuera_de_r6_r8,
       count(*) FILTER (WHERE estado_linea='pagado' OR recibo_id IS NOT NULL)              AS ya_pagadas,
       count(*) FILTER (WHERE concepto_tipo='fondo_solidario' OR beneficiario_tipo='club') AS fondo_solidario
FROM liquidacion_detalle d
WHERE d.reunion_id IN ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f')
  AND d.estado_linea <> 'pagado' AND d.recibo_id IS NULL
  AND d.concepto_tipo IS DISTINCT FROM 'fondo_solidario'
  AND d.beneficiario_tipo IS DISTINCT FROM 'club'
  AND d.beneficiario_id IS NOT NULL;
```

Si `objetivo_332 <> 332`, **frenar**: los datos cambiaron desde este relevamiento.

---

## 5. EFECTOS COLATERALES

### 5.1 "Recalcular reunión" — VERIFICADO EN CÓDIGO, no supuesto

El motor vive en **`liquidaciones-engine.js`**, no en el HTML. Es la fuente única que usan
`liquidaciones.html` (botón 🔄), `resultados.html` (oficializar/des-oficializar) y el probe.

**Paso 1 — marca lo comprometido** (`liquidaciones-engine.js:268-280`):
```javascript
const paidKeys = new Set(); // claves de líneas comprometidas (no regenerar)
let preserved = 0;
for (const h of (existingLiqs || [])) {
  …
  for (const d of (h.liquidacion_detalle || [])) {
    if (d.estado_linea === 'pagado' || d.recibo_id != null) {
      paidKeys.add(lineKey(d));
      paidCountByHeader[h.id]++;
      preserved++;
    }
  }
}
```

**Paso 2 — borra sólo lo NO comprometido** (`liquidaciones-engine.js:282-290`):
```javascript
// 2. Borrar SOLO las líneas no comprometidas (recibo_id null AND estado != 'pagado').
//    Lo pagado se preserva; retenido sin recibo se recalcula.
await sb.from('liquidacion_detalle').delete()
  .in('liquidacion_id', allHeaderIds)
  .is('recibo_id', null)
  .neq('estado_linea', 'pagado');
```

**Paso 3 — no regenera lo preservado** (`liquidaciones-engine.js:333`):
```javascript
const freshRows = detalleRows.filter(d => !paidKeys.has(lineKey(d)));
```

**Conclusión: el recálculo NO revierte la regularización.** La condición de preservación es
`estado_linea === 'pagado' || recibo_id != null` — un **OR**. Nuestras líneas cumplen la primera
mitad (`'pagado'`) aunque `recibo_id` quede NULL. Quedan preservadas, no se borran, y no se
regenera un duplicado porque su `lineKey` ya está en `paidKeys`.

Efecto de *hoy* vs *después*: hoy, recalcular R6 o R8 **borra y regenera las 332 líneas**
(están impago/retenido sin recibo). Después de la regularización, recalcular **no las toca**.
La operación no sólo sobrevive al recálculo: además **congela** esa plata, que es justamente lo
que se busca.

Salvedad: el sufijo en `descripcion` sobrevive porque la fila entera sobrevive. Y como
`lineKey()` no lee `descripcion` (§3.3), la marca no interfiere con el dedup.

**Header totals**: `recomputeHeaderTotals` (`liquidaciones-engine.js:44`) suma
`monto_bruto`/`monto_descuento` de las líneas. Nuestro `UPDATE` no toca esas dos columnas → los
totales de los 179 headers de R6+R8 quedan idénticos. No hay que tocar `liquidaciones`.

### 5.2 `desoficializar_carrera` — SÍ SE TRABA. **Aviso previo, como pediste.**

Definición real del guard (`SECURITY DEFINER`, leída de la base):

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

El guard es un **OR**: alcanza con `estado_linea='pagado'`, no hace falta `recibo_id`. Nuestras
líneas van a cumplirlo.

Medición del impacto, con la misma condición de vínculo que usa el RPC:

| Reunión | carreras totales | bloqueadas HOY | bloqueadas DESPUÉS |
|---|---:|---:|---:|
| R6 | 11 | **0** | **7** |
| R8 | 12 | **3** | **8** |

**Consecuencia concreta**: después de esto, 7 de las 11 carreras de R6 y 8 de las 12 de R8 quedan
**trabadas para des-oficializar**. El mensaje que va a ver el operador es
`"carrera con pagos emitidos, anulá los recibos primero"` — y va a ser **engañoso**, porque no hay
recibos que anular: no existen filas en `recibos` para esas líneas. La salida sería revertir la
regularización de esa carrera (§6) antes de des-oficializar.

Las carreras que quedan libres (4 en R6, 4 en R8) son las que no tienen líneas de liquidación a
persona — típicamente las anuladas o sin resultado oficial.

**Esto no es un bug de la operación: es el precio de congelar el histórico**, y es simétrico con lo
que ya pasa con cualquier pago real. Se avisa ahora, no cuando haga falta. Si Fede quiere conservar
la posibilidad de des-oficializar R6/R8 —por ejemplo para corregir montas viejas— hay que decidirlo
**antes** de correr esto.

### 5.3 Efecto en el tab Pagos (el objetivo de la operación)

`cobrosBuscar` (`liquidaciones.html:810-814`):
```javascript
let qy = sb.from('liquidacion_detalle')
  .select('…')
  .eq('estado_linea','impago').neq('beneficiario_tipo','club').is('recibo_id', null);
if (rid) qy = qy.eq('reunion_id', rid);
```

El filtro por reunión es **opcional**. Sin reunión seleccionada, Valeria ve **todas** las líneas
`impago` de todas las reuniones — que es exactamente el riesgo de doble pago descripto. Después de
la regularización, las 254 líneas `impago` de R6+R8 dejan de aparecer.

Las 78 líneas `retenido` no salen en ese buscador, pero **sí** aparecen en el detalle de cada
beneficiario (`cobrosDetalle`, `liquidaciones.html:891-893`) con un botón "✅ Habilitar" que las
pasa a `impago` vía `liberar_linea`. O sea: también eran un vector de doble pago. Marcarlas cierra
ese camino. Coherente con la decisión explícita de Fede sobre los retenidos.

### 5.4 Efecto en el tab Resumen (Fase 5)

`loadResumen` (`liquidaciones.html:634-640`) mueve la plata de bucket:

- R6: `impago 3.588.730,00` + `retenido 3.528.254,19` → `pagado 7.116.984,19`; fondo solidario
  `293.591,99` sin cambios.
- R8: `impago 4.976.680,00` + `retenido 9.767.376,66` → `pagado 14.744.056,66` (+ los `292.700,00`
  ya pagados = `15.036.756,66`).
- La **reconciliación** (`pagado+impago+retenido+fondo = total`) sigue cuadrando: es una suma sobre
  los mismos `monto_neto`, sólo cambia el bucket.
- El contador de recibos (`recibos.add(l.recibo_id)` sólo `if (l.recibo_id)`) **no sube**: sigue
  mostrando 5 recibos en R8 y 0 en R6, con millones en el bucket "pagado". **Esa discrepancia es
  deliberada y es en sí misma una señal visible** de que hubo saldado sin recibo.
- La lista de "pendientes por beneficiario" de R6 y R8 queda **vacía**.

### 5.5 Lo que NO se ve afectado

- `recibos`: 0 filas nuevas. Los 5 recibos existentes intactos.
- `club_secuencias`: sin consumir. La numeración de recibos arranca limpia en R9.
- `resultados`, `resultado_posiciones`, `inscripciones`: sin tocar.
- `auditoria`: **no registra nada** (§3.1) — por eso importa la marca.
- La reunión 9999 y R9: sin tocar.

---

## 6. SQL EXACTO A EJECUTAR (todavía NO ejecutado)

### 6.0 Pre-chequeo obligatorio

Correr §4.3. Tiene que dar `objetivo_332 = 332`, `fuera_de_r6_r8 = 0`, `ya_pagadas = 0`,
`fondo_solidario = 0`. Si no, **frenar**.

### 6.1 Snapshot del estado previo (correr y guardar la salida)

```sql
SELECT id, reunion_id, estado_linea, pagado_at, recibo_id, concepto_tipo, beneficiario_tipo,
       beneficiario_id, monto_neto, descripcion
FROM liquidacion_detalle
WHERE reunion_id IN ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f')
ORDER BY reunion_id, id;
```

### 6.2 El UPDATE — dos sentencias, una por estado previo

Se parten en dos para que la marca conserve el estado original de cada línea (es lo que hace
posible el rollback exacto).

```sql
BEGIN;

-- ── (A) líneas que estaban en 'impago' → 254 filas (125 de R6 + 129 de R8) ──
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
   AND d.beneficiario_id IS NOT NULL;
-- esperado: UPDATE 254

-- ── (B) líneas que estaban en 'retenido' (doping) → 78 filas (32 de R6 + 46 de R8) ──
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
   AND d.beneficiario_id IS NOT NULL;
-- esperado: UPDATE 78

-- ── verificación DENTRO de la transacción, antes de confirmar ──
SELECT r.numero AS reunion, d.estado_linea, count(*) AS lineas, sum(d.monto_neto) AS monto
FROM liquidacion_detalle d JOIN reuniones r ON r.id=d.reunion_id
WHERE d.reunion_id IN ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f')
GROUP BY 1,2 ORDER BY 1,2;
-- esperado:
--   R6 impago  35  293591.99   (solo fondo solidario)
--   R6 pagado 157 7116984.19
--   R8 impago  40  285162.00   (solo fondo solidario)
--   R8 pagado 185 15036756.66  (175 regularizadas + 10 con recibo real)

SELECT count(*) AS marcadas FROM liquidacion_detalle
WHERE descripcion LIKE '%[REGULARIZACION 2026-08-28:%';
-- esperado: 332

COMMIT;   -- si algo no da, ROLLBACK;
```

**Nota sobre el MCP**: `execute_sql` no garantiza una sesión persistente entre llamadas, así que el
`BEGIN`/`COMMIT` puede no envolver realmente a las dos sentencias si se mandan por separado. Correr
el bloque **en una sola llamada**, o aceptar que (A) y (B) son atómicas por separado — cada una es
un `UPDATE` único, y el rollback de §6.3 revierte cualquiera de las dos por su cuenta.

### 6.3 ROLLBACK — SQL de reversión

**Opción 1 (recomendada): por la marca.** Autocontenida, no depende de listas de ids, y restaura a
cada línea su estado previo correcto.

```sql
BEGIN;

-- revertir las que estaban en 'impago'
UPDATE liquidacion_detalle
   SET estado_linea = 'impago',
       pagado_at    = NULL,
       descripcion  = regexp_replace(descripcion,
                        ' \[REGULARIZACION 2026-08-28: saldado administrativo pre-sistema, sin recibo; estado previo=impago\]$',
                        '')
 WHERE descripcion LIKE '%[REGULARIZACION 2026-08-28:%estado previo=impago]'
   AND estado_linea = 'pagado' AND recibo_id IS NULL;
-- esperado: UPDATE 254

-- revertir las que estaban en 'retenido'
UPDATE liquidacion_detalle
   SET estado_linea = 'retenido',
       pagado_at    = NULL,
       descripcion  = regexp_replace(descripcion,
                        ' \[REGULARIZACION 2026-08-28: saldado administrativo pre-sistema, sin recibo; estado previo=retenido\]$',
                        '')
 WHERE descripcion LIKE '%[REGULARIZACION 2026-08-28:%estado previo=retenido]'
   AND estado_linea = 'pagado' AND recibo_id IS NULL;
-- esperado: UPDATE 78

SELECT count(*) AS quedan_marcadas FROM liquidacion_detalle
WHERE descripcion LIKE '%[REGULARIZACION 2026-08-28:%';
-- esperado: 0

COMMIT;
```

El `AND recibo_id IS NULL` es el candado que impide que un rollback toque, por error, una línea que
después se hubiera pagado de verdad.

**Opción 2: por lista explícita de ids** (§6.4), si la marca en `descripcion` se perdiera:

```sql
UPDATE liquidacion_detalle SET estado_linea='impago',   pagado_at=NULL WHERE id IN ( <lista impago>   );
UPDATE liquidacion_detalle SET estado_linea='retenido', pagado_at=NULL WHERE id IN ( <lista retenido> );
```
(no limpia el sufijo de `descripcion`; combinar con el `regexp_replace` de la Opción 1.)

### 6.4 Lista completa de ids afectados (332)

Capturada el 2026-08-28 con el `WHERE` de §4.1. Es el respaldo del rollback.

#### R6 — estado previo `impago` — 125 ids

```sql
'01a6a476-69e3-4490-8a78-655a7d52a94c', '094e2b2b-99a3-4a54-bcbf-ecb87f26b312', 
'0ab056aa-8fc0-4360-9a6b-0bcb21846177', '11f79a36-c114-42c9-a1f6-c3c2ad48535c', 
'16560443-474c-4e4a-bbc3-05f8f6fa9a0d', '1ae728eb-2f4a-4233-b936-a12678165933', 
'1c006b88-9f78-4983-941d-d929dc07baf6', '1d017036-7496-46d3-8239-6e2e8e42f2fe', 
'20d97fb2-ad7d-4bd3-971e-961d6254841a', '246b00e7-cbe0-4ef6-816d-b4d664fd219c', 
'270f639e-68c5-4049-addb-f66bd5d02a24', '2796cbfc-d623-4b37-9c51-25e4afbad4b1', 
'288bc5a9-ec19-45fc-92ed-f0c520f8280c', '289d09b6-7edc-473f-b8aa-6beeff22f734', 
'28fa22cb-f2af-4ca4-acdd-68b7a82e9744', '2a883938-9241-41b0-b75e-8c9d998c0162', 
'2c548f8b-bfb4-4bb5-9608-fb85a0bbf7a9', '2e329583-e90b-4243-a55f-e066f7396994', 
'2e7e8460-7a62-4fc8-aa78-f9ce7c2bc230', '2fac754b-ef7e-4032-99ae-f9c0a327a329', 
'3034de41-130e-4319-8fb8-cb567e1b4cd9', '31f0abe2-8ec2-4a8a-88fc-d5bd342c8932', 
'334859a4-3bf8-415e-bbf6-87a37af74c20', '3578c3e6-b1f3-4fcc-811c-37c74103a041', 
'3613b3b8-be05-4f61-b479-3e718f39f759', '3c709a68-3b6d-4fad-9680-df0dcdf54316', 
'3dbf8848-cfc3-42c0-89f9-c37e8e058ac7', '3dd5d1a8-19c3-457a-9558-b50d2128d1a1', 
'3fdb5f50-2f1f-4995-962f-263a2e508255', '41b95f53-5199-4a2b-b071-6812a9a78473', 
'44818ad8-623d-4d5f-af2f-f84c03c72a4e', '47163081-ef9b-4f4c-a2e6-8be6cb309af7', 
'474926f2-93ba-46a4-8134-9205794b132b', '4a923fc3-da56-414f-a6da-e1e72920974a', 
'51fe086d-893b-4bfc-9c5d-355eb4ab69e0', '5353e161-ed44-4768-af46-b156ba62d346', 
'56abaeb2-cf24-4dea-821d-3a2a3335df0b', '576c7061-2d79-4aee-b7ff-6ad6ef55dab8', 
'5802a31a-1f24-4093-9c5f-5c2f0121f76e', '5a2704c3-f1ba-4ae3-94c1-716507e4d453', 
'5a2b69b5-94a7-4c0f-a20d-711396ff9c15', '5ace4706-e77a-4544-be28-d93f4e5f98d8', 
'5ae94b6a-4add-4d3c-85b9-6c84b29bcaca', '5cbcef7f-e923-4c53-b225-8cbc96c1083e', 
'5cbe4e9c-8d84-4b77-953b-4e5ac0bc0364', '5cf99697-cfcf-4f0a-a99d-fa19e51b9e70', 
'5d17c84a-ae43-4a71-9dc1-1171ebab25bd', '5e7d39c4-c2a6-4657-a1f8-1b099b52d248', 
'62de69a3-fd9a-4aee-bf4f-0fb0fd59c5ba', '65296d6f-e988-4b11-9825-0cdcbe057bea', 
'6de4daca-1d43-434c-b318-eaa14d52e1f0', '6f909e19-4d93-4732-9b62-e6f4296aac09', 
'708e62a8-d2ef-414e-a2ce-272326f95be0', '70c57cb4-554b-4342-8d97-797fe073d47e', 
'71e7a42c-d435-44f5-934b-8a3a8e292857', '7d82d590-41af-4d3c-934a-30a34237b00e', 
'7dabdf62-f364-4984-8085-c03165637193', '7e682ca6-fd42-4052-94eb-af2e4511057f', 
'81086976-f2d5-4c09-94fc-f9a0ff3e20c0', '8657bb67-6778-4765-9741-686a9aed52d9', 
'8815e9c9-f9b9-4e04-8936-9d2414736274', '887aea2d-4d47-4c55-9290-855d80e581e3', 
'889c202c-5bc8-4aa3-b517-957507311e6f', '897116e7-6f99-4f24-b8f2-9b62e80127f5', 
'8ac25fb4-658a-42c3-bc4f-bcbb138750cb', '8cd9a4ed-ee48-4a60-984f-676476c975cc', 
'91a6cf90-a563-420f-9ec0-c15d9a7ab820', '9262ecb2-2746-4033-bae6-bafc2e1d52ad', 
'94f45b6d-d64f-41d4-93e2-47e75d063bfb', '951716da-7763-48c9-bbbb-d1525e25b737', 
'95dc148a-a56e-43e6-9cd5-077de7ea8936', '96b2fd6a-d6ff-4501-aabe-d8a0e9c6edb3', 
'9715242b-6258-4a13-8473-318283d38073', '983ea673-dfcf-45c4-a459-5cd0a060e762', 
'990d66be-8438-4ba9-b8cd-b9dcb694b898', '99d83a4e-a1c4-4bad-8e44-d95cf6b98f9c', 
'9cb276dd-3784-4889-aa57-7d1f83dd3628', 'a6e931b8-739b-4f5b-a780-8c86b8195596', 
'a85ace22-a468-4e39-be0b-93dfdfa02394', 'aa3facc3-1456-4fb7-afd7-76cd31d23a6b', 
'ac5601c5-a330-4829-abc5-ba3bd899adb7', 'b045f55f-7520-414d-89b7-4710907c8c81', 
'b2552aab-a8e5-42cb-a394-1af253037ec2', 'b2e2c342-a3b2-499d-a887-4e1eb2156de7', 
'b3f29bf1-7160-4329-ba84-d10ca79ba281', 'bae235c1-24d8-47df-bd9a-e01878cdabd7', 
'bd4c159b-813d-40bb-9bdc-e1c7c0587b1e', 'bd8a9488-8b7a-4162-9cab-f373831566db', 
'c0c67169-5c6c-4925-8de0-4a70433d2185', 'c17a1a53-18fb-4e44-8d08-6619df585e70', 
'c1b0cf7b-22a9-4ac5-9462-9ecd9519d671', 'c55b72fc-1a64-48bb-8481-7ccfe45e482a', 
'caa502b0-567c-4708-b3dd-7c87f0c93397', 'cd5d105c-cc53-4303-9f18-4088db2534da', 
'cd7b1928-5810-44f4-b797-2983bd8e63cf', 'cdf04ddf-8937-489e-a7bb-36a4e83b9b67', 
'd06fa610-a12a-4426-8864-52a204795ed7', 'd0b6d59f-f132-4733-902d-a416967f3933', 
'd586cd0b-31ec-4cfb-ad02-843e6d6c69bc', 'd5b8cbd0-730c-4b5d-a3f1-e592ad99fa1c', 
'd65df1f2-2eaa-450a-8fa2-e6c81f203553', 'd767afdf-62ce-44ea-a537-b7e021c0f574', 
'd78a1894-71d1-4843-8ffd-326b9f7a422c', 'd85b4e5b-bdbe-41d4-ab73-7314cba4f7e3', 
'da3adb78-5f49-4f71-97d7-dcd12df618b5', 'dd6daacc-d09d-4982-9cac-f32b5f4e5083', 
'ddac22ec-9861-44ad-9e4e-6fb6fe7672b9', 'e01f4919-c3c0-4828-aa32-9d2873467156', 
'e778a573-d60e-45ab-901c-cce61c89cd41', 'e7b90247-f3d8-444b-b15b-14f0ec3c92d1', 
'e98f3c78-9793-428f-8e7a-d867f549187d', 'eb5dbfd1-7ab2-40dc-9969-0e418cefb0cb', 
'ed317e36-8bde-4116-901c-43101c069205', 'f0508442-0f1b-4a5e-befd-0dfe6402ad55', 
'f0fb6674-c168-4f13-8cd1-9d4a53b1c825', 'f4461b73-1331-47ce-9f4d-017affac4e48', 
'f561afce-edb4-42da-9cb6-b00461c8c2ac', 'f990b716-b76f-4ba8-8193-15774d318291', 
'fa605977-e3bd-49cc-a25c-a9a44fe7beed', 'fbc378ff-e528-43d0-8e74-5c4bf79248e6', 
'fbf387ce-60bd-40df-924a-76b3331d5084', 'fc3069cf-7da4-43e8-8704-68fb43632f96', 
'fdef7611-efa0-4edd-9de4-bde0707c8dcf', 'fe67c64a-03a2-4766-98eb-648bb7f99592', 
'ff277ac7-7eda-4d08-a1c1-608b02bbcd95'
```

#### R6 — estado previo `retenido` — 32 ids

```sql
'1bca1926-0393-47ab-b003-b329a56624ca', '1ff48353-ce92-4cdb-b6a1-6e08c9f2793e', 
'28b791ab-c95f-4b90-82f0-750857742757', '2c749f7c-bcdf-4a40-9c7e-dfe16907cb56', 
'2f36ef61-dfbd-46e2-a058-f4cdbbe5db07', '30227e77-3439-46f4-a943-e634dc7e02f9', 
'4192bc7f-240d-4a3c-b5a2-772edd1b3449', '4f696e05-6883-4736-b4e3-aab185c21175', 
'55ca72c1-ece5-4c07-9778-49ac6e2ca985', '63176a98-8676-4cf8-86bf-0a5a90a92047', 
'6d054872-8f24-44ae-bb62-a364d29527e3', '77869466-361c-4dcf-ab78-9929e7fb509e', 
'783c55b0-7703-4ca0-9d8a-cb36484149de', '7e6462eb-aaa5-46fe-810c-19b43ef13771', 
'9026ddeb-820c-48df-b189-e38fc565a6f8', '91ad6c1c-1862-4d86-934b-96e8179c6832', 
'9b9c88ed-4536-48b3-8210-6354d38d8a33', '9daeeef9-9b20-408c-a9ef-363759259dcc', 
'aa0e42e9-8f2e-4a5e-973e-79fcb7a9d8a3', 'ab40d45e-4306-4cd3-a984-d70f6210dd5a', 
'b199d40d-4e56-4bbe-a13c-978dbb4b254b', 'b950e389-891a-4913-bef9-d254fa90be93', 
'c67db3ec-bcf1-4fef-ae74-272a701c9835', 'c75d6735-8280-4158-b3cd-bb59c061576a', 
'ca9309c4-85ea-4a52-80d6-47bbed552e0c', 'cf2bcb83-87dc-47e3-8971-284e352592cd', 
'd4d6f3f6-7c52-4799-a631-a376ff602e42', 'd769247b-0533-410f-9ead-bec31eba0ff8', 
'd80451ec-a948-4d9f-8ac3-cc277b7a9f9a', 'e1b62e87-cef0-4ad6-8447-058da63d5851', 
'f8399844-7348-412f-b507-ad2e6b26340f', 'f94d757a-b442-413d-960e-6de25b96b6af'
```

#### R8 — estado previo `impago` — 129 ids

```sql
'00bc3fb8-64d6-489a-8282-fdba0bf120e6', '032276f4-6f11-4ac1-a95f-032c015072c2', 
'06df4dc1-ed0f-4965-9fc1-15b3e38b098e', '08484d11-4e3d-4b0b-ad34-8cbb629cae45', 
'0d101606-61d7-40a9-afb6-b15dd8136952', '0d4e41dc-8b90-4b4b-8cb4-645b6190d577', 
'0d83d1ec-a85c-4252-8f06-ca3cd799628d', '0e9425be-e286-41b3-85a7-763c6b1fe2cc', 
'101dc358-08bb-4ae0-a587-a31fa366e2fd', '11890a9f-7bc4-4a5e-9b01-8edc2b93129f', 
'1434fd4c-4215-461d-9678-81672046dc04', '150cdc62-4d70-4ec9-92d0-a6e8279d1aec', 
'15a2c847-7a5a-4172-85a2-17cc9e95a2a7', '175d1d44-85cf-4307-ac44-7f40c4c01de0', 
'18db0059-96db-4564-8b80-0bf3fcbf6931', '1a3ff231-2b70-4362-bf81-06c19aacd7f1', 
'1acbc2ee-d37d-4daf-80f3-587fb23bfe33', '1bf0f84b-f3ea-44ae-ac7e-2f31f50af44d', 
'1bfa4f26-c680-45dd-a8c0-0c7595ddc95f', '1c4568f5-bf27-43cd-a43a-86094c7e8dbb', 
'1c93b9ef-83dd-414f-b591-baf20fce350a', '1cc19ea3-b787-415b-b6e7-74097ee6143d', 
'1d0b1e8c-fb16-44d7-96a2-a25b4d00f274', '1d56055e-eb41-4ee8-952b-7786d1c9e75c', 
'1f48d8f6-c58b-4454-966f-79da767e66b4', '1ff8d141-c65d-4eeb-8aca-29a3348f936f', 
'24c374f0-7627-4501-952d-4091f985c404', '290928cd-229c-4f60-9a40-93760856f6df', 
'2a848ea9-f07e-42f3-b071-65a194680946', '2c16f691-0dbf-4c6b-9547-eb0e88dcbb19', 
'2f0baae9-a423-46d3-8acb-fc0fbad9f5b7', '2f0d6d03-4500-401b-abac-f752748221bf', 
'30388a9a-bf5f-41ff-9b64-3224bd7401ad', '31d4d597-e379-44c0-9a41-4177fa8416a2', 
'33df8dfe-b0f3-4b7a-ad81-90bab7a30f01', '34888a85-c8df-4acb-9e33-14d78bab1459', 
'36827bdc-6b73-4f7e-acd4-a0a127a624d7', '368ede03-073b-4add-adb5-7a18524e3cd2', 
'36fca1a4-e87f-4fc8-bdc9-c1b59046b1b8', '38199c1e-2bd7-4279-bdfc-cfe50987c653', 
'3acbdd6c-4b2d-4123-9d88-a8e0efe7f35e', '3e081e7a-f801-446c-ab61-a06868112700', 
'3e839417-c260-4b20-8cb1-e13fb76600ba', '3eff214a-05fd-46f4-a996-715f03e449d0', 
'3fd8aaed-5da2-450b-a43b-061f75bb0b60', '49017ecd-5c24-4757-af6b-18bc7f785f76', 
'49e9534d-df9b-4645-9aa7-8842c3201830', '4d481cb6-5595-4c86-b5b2-7e41fad5dd5b', 
'4db3877d-cf7d-45b9-ad32-f1ed51a612ca', '4f988070-d4e8-48d6-a262-f479f56107f1', 
'555522fe-9084-4461-9fcb-a4ba95f2765b', '556cf777-cd17-48e4-8a98-b017d70c55b5', 
'5975ba1a-d493-407c-b2ef-4c5c37bf1ae3', '5cf2000f-f19d-42b5-a54c-a94bc4592611', 
'5e8a76cf-96f5-4730-ad0e-6e730b39c2dd', '61b5f3f2-c48e-4313-bc5d-21094a983ee9', 
'6357e8eb-aabd-45a2-bde1-dbb8d46a45c3', '643d57cd-6bba-4d07-8999-5e239bbaddea', 
'647e9b9c-bbba-4245-b3ad-403ca7a82f74', '6997d5ef-96cb-4b8b-8e4f-4c3a205e6e41', 
'6c9c764d-2356-46b8-a24a-d0ab65ec91dc', '6d677944-1a60-4a70-930b-2e4123461f21', 
'729d8583-feae-43fb-b95f-7938883b94ba', '741a0790-1a9b-485b-92a4-2c47011a37ac', 
'7a628ba1-ab2b-4f96-93fc-eedb4604940a', '7b4395fb-2cb8-4784-b2ec-a08922f96a8b', 
'7c01bee4-60de-4dd1-89a5-82d7ccb26783', '822c8eb6-88b0-42ac-beb1-fc2b2f2ff1f9', 
'83833ac2-bf0a-4cb6-9176-7fa7d1095a83', '83afa157-3d6a-43ba-beb0-4bdef3aac48b', 
'83d35b05-7f14-4690-8fbe-591bf52166e4', '854750f6-732d-45f9-a7bf-256cc7773816', 
'881b56d1-56d5-451a-b6fd-2d7c15e9bf4c', '8e67d828-c04d-460a-a3e4-8a0fdfa637e5', 
'8f0be173-881f-470a-9f80-7f98c25fffe8', '965f8598-6104-4a16-85e6-76c39cd210d8', 
'9a97d475-4978-44a5-87b9-3025f92c63f8', '9b7b4792-38ba-4f08-9cba-00c087566902', 
'9bcf5ab6-f1f3-44fa-b6dc-ff4f210ee42b', 'a2248922-0335-4e39-941c-948c06bdba18', 
'a27ac643-deee-404e-b5d2-ec3b01faf0d9', 'a4a30049-b6ef-4491-9b72-5d986832dcf6', 
'a4ef5af8-35d0-4241-8426-1150ab0dc0f8', 'a5c155f4-5ec5-4cfd-88e6-d77ae90846de', 
'a8627a37-1ae7-4a5d-8b05-edfdfaa23b31', 'ab4383e8-b85b-467d-8387-5144c9272904', 
'abad01a6-1206-4d09-9c25-b31512b0aa65', 'ace4e838-0911-4750-848d-75c8902a2c85', 
'afa142e7-8009-4a15-912b-8f88b7023a7e', 'b65b3303-f09c-411b-87d4-201237cf1ca0', 
'b69d3e15-be27-4922-ba00-d12ea10ce4b8', 'b75ef8f7-0b80-40aa-b29b-0c110d5ee434', 
'b7682399-3877-40ad-84cd-8b8fea53b34f', 'b870d7db-52ab-48b8-a4bb-b08c92f8946e', 
'be6de4f3-6ddb-4d40-9342-2566f9c54388', 'c07b524b-8f04-40d3-979f-fa4751ad59a3', 
'c1e6d7c5-3a9a-4d89-b004-1c62538bfe1d', 'c5848487-87f1-46c4-9e79-c179ab5c70e5', 
'c6369025-8f71-41fa-9776-67d24ab9dc1f', 'cab56e5b-73b1-42a4-b8f5-f16f34a937f7', 
'cbab5b94-8a58-464b-b740-6fadb9098fa7', 'cc2ae2c6-e099-487e-bd5a-d3b7b7f1e32f', 
'cd503cad-0308-4cb9-8e5d-8c35e60698f8', 'cee5eadd-5045-4fbb-97d3-cb4aaf1b7810', 
'd1d0b8a1-470b-4ead-b163-2241e82691ff', 'd1f00a32-8de5-4e27-9298-a9c28d019b58', 
'd3b02964-9bdb-4aec-ac32-7dd2b28523e4', 'd5e9c1c8-d334-4650-bf92-766191bb6ad3', 
'd839e752-63cc-4565-af8f-6d5a75f3c3bf', 'db1da7e3-7f6b-4fa7-ab5b-08f20d05f0e0', 
'dbf9cf35-c750-4e3b-928d-2f92607adba6', 'dc5b002c-4969-40e1-a421-00052f67cd39', 
'dd44fd22-ee7b-4a96-81fc-37c15e36b866', 'dd62134f-48c0-4f8c-b381-d024d96a8432', 
'ddd2e561-a679-437c-91cb-2bba68c8338e', 'e234bcde-36b2-4392-8c9e-e0fd894ed066', 
'e2fe0901-22f1-4ec0-913f-6b0e169d103a', 'e3c41531-15bd-4fcd-85c0-2849a187c2b1', 
'e57113bb-e0d2-4cbd-b7ea-2afcd7718c2e', 'e5abfea6-5a23-43ad-bc01-9e94842bbbb7', 
'e7d023e3-44cf-4cd8-967d-4d9cf779a5b3', 'e8c48c50-d27a-4773-b1e1-0ccedc833a2a', 
'eb58833d-b07e-4540-8dee-025b70898f7e', 'f5366256-6579-4132-ae1e-9c199ed1a7dc', 
'f5382e02-4e10-4d6a-9b37-f88b9034c34f', 'f8af837f-3d6b-4347-835a-0c9cd6251ab9', 
'fa49c720-d026-4140-a988-cfff6ee831a6', 'fe06e182-bee9-437b-8a47-5087c3cb1f00', 
'ff3438d4-39fd-4ba6-933c-38ced84634ca'
```

#### R8 — estado previo `retenido` — 46 ids

```sql
'0803dbb6-7c3f-4cc3-a9ef-1bb9b1fef2ad', '0ad90580-dea8-4cec-876a-134ff781247b', 
'1247c497-25d9-4511-a302-86b52e97a7c1', '17b91aa0-d512-4cb7-99e2-93f5295b6d8c', 
'245a1ec7-c883-4c1c-b48a-34af4c870bdd', '26642ab8-6777-4c98-959e-039ac57fe42f', 
'323be506-879e-46a1-8515-6bd500350c6e', '328d49c3-fd45-4999-bdb6-ff5e07c6b4c4', 
'33fbace2-97d6-4647-8c7c-a1af2e8a535e', '35387df9-fb22-4d26-913c-f6c6d8153e06', 
'3681f747-d7c0-4e74-b383-f0bcdf3cc8bd', '37609c3b-c964-403f-abfc-6accfc096596', 
'38887812-e629-47f5-aec4-dd7becce9f97', '3a7ab1b9-09a0-4363-ac2c-298ef45425b1', 
'3da8b5e2-f93b-47a5-b857-d9ef9744ffe7', '4d30ca21-10ed-409f-a3ca-9b4b59991bf7', 
'4fc37730-53c7-42c6-b8c6-01a27820d64f', '56991aa3-f66f-458e-857e-2ff5966fa8b7', 
'5b1344da-aec6-41c2-90e6-03537e68cbc2', '5df7b054-a92a-4c95-a9a4-d791c80e9ecd', 
'6dd2de77-0906-436c-8d0a-32d74e025099', '6eb0dc1e-bccc-4315-a4b9-e1a9fb427c81', 
'7b9da1f5-b80b-4904-a924-c689f2ffbe95', '7d87e073-5490-45ae-bfd9-cc83323fd846', 
'874d0e88-99d9-4543-99e1-6e7ff8dba1af', '8a4545a4-ef52-4708-9b33-012499ee4894', 
'986ec3b5-0142-468b-a6bb-8e788407601c', '9d2dfc26-acee-4ea4-acc0-2af512d4e98a', 
'9e942980-157e-4327-aff0-0c675dd2e6d5', 'a8e4cdd0-e9df-4a87-ac41-58583f2444f3', 
'b1b89d72-1362-4e17-9574-f6347360cf43', 'b86a7329-3ea8-484a-bf27-01959b7ed178', 
'b9f8ac9d-cfb3-4305-bf81-4487b18877a8', 'bb98884d-6463-472d-85d7-3eeea8f66c49', 
'c406ce99-b54e-4742-9d6a-8336d01826a1', 'ce8724c0-acda-43a3-8261-5f27644f7271', 
'd038c65c-67a0-4c22-b98b-fe5164e7ffda', 'db22865e-6392-4af8-8335-01cb97946825', 
'dc436b9b-a4f8-4ddc-84c4-4c8d4d6a1088', 'df8768ce-0a54-4a00-a4c6-3fe7d40c9305', 
'e0227f82-b93e-4f3a-b9d7-b4a231d12e6c', 'e1832976-1cf5-4b46-9081-2e633105f220', 
'e307b2ba-0b42-4b8d-8485-cc3c009eaa50', 'f037ec2f-2fba-4782-bcc8-d6b21eadb1c4', 
'f4e18bc2-d085-49e3-8361-5f50f45efaf7', 'fad008a8-573b-4337-be3e-b75fea9d883f'
```

---

## 7. CHECKLIST DE EJECUCIÓN

Orden sugerido, para cuando haya OK:

1. [ ] Re-correr los guards (`pwd`, `spcs=181`, ref del proyecto).
2. [ ] Re-correr el pre-chequeo §4.3 → tiene que dar `332 / 0 / 0 / 0`. Si no, **frenar**.
3. [ ] Correr y guardar el snapshot §6.1 (las 417 filas de R6+R8, estado previo completo).
4. [ ] Correr §6.2 (A) → confirmar `UPDATE 254`.
5. [ ] Correr §6.2 (B) → confirmar `UPDATE 78`.
6. [ ] Correr las dos verificaciones de §6.2 → los cuatro renglones esperados + `marcadas = 332`.
7. [ ] Verificar en la UI de Pagos (sin filtro de reunión) que ya no aparecen beneficiarios de
       R6 ni R8, y que sí siguen apareciendo los de la 9999.
8. [ ] Anotar el resultado en `CHANGELOG.md` y `docs/ESTADO.md`.

---

## 8. DECISIONES QUE HAY QUE TOMAR ANTES DE EJECUTAR

1. **Des-oficializar R6/R8 queda trabado** (§5.2): 7 de 11 carreras de R6 y 8 de 12 de R8. El
   mensaje de error va a hablar de "recibos" que no existen. ¿Se acepta?
2. **La reunión 9999 (sandbox) sigue con 51 líneas `impago` por $553.040,00 y 21 `retenido` por
   $604.800,00.** El pedido dice explícitamente no tocarla, y este plan no la toca. Pero como el
   buscador de Pagos **no filtra por reunión por defecto** (§5.3), esas líneas **van a seguir
   apareciéndole a Valeria el 20/09**, mezcladas con R9. `CLAUDE.md` ya marca la 9999 como
   pendiente de borrar con `teardown_prueba_resumen_9999.sql` antes del 20/6 — **está vencido**.
   Es una operación aparte de ésta, pero sin ella el objetivo de "empezar limpio en R9" queda a
   medias.
3. **Los headers de `liquidaciones` quedan en `'borrador'`** (179 de R6+R8). No afecta Pagos ni el
   Resumen, que leen la línea. Si se quiere coherencia visual del header, es un `UPDATE` aparte
   sobre `liquidaciones.estado` — no está en este plan.

---

## 9. RESUMEN EN NÚMEROS

- **332** líneas a marcar · **$21.861.040,85**
- R6: **157** líneas · **$7.116.984,19** (125 impago + 32 retenido)
- R8: **175** líneas · **$14.744.056,66** (129 impago + 46 retenido)
- **Excluidas**: 75 líneas de fondo solidario ($578.753,99) + 10 líneas ya pagadas de R8
  ($292.700,00) + todo R9 (0 líneas) + toda la 9999 (76 líneas)
- **3** columnas escritas: `estado_linea`, `pagado_at`, `descripcion`
- **0** recibos emitidos · **0** filas nuevas · **0** filas borradas · **0** números de secuencia
  consumidos
- **Reversible**: sí, con el SQL de §6.3, por marca o por lista de ids

## Notas de método

- Todo lo relevado fue `SELECT`. **No se ejecutó ningún `UPDATE`.** El SQL de §6 está escrito y
  sin correr.
- No se modificó código. `main` intacto en `f928fe0`; este documento vive sólo en `reports`.
- Los conteos son una foto del 2026-08-28. El pre-chequeo de §4.3 los vuelve a validar en el
  momento de ejecutar.
