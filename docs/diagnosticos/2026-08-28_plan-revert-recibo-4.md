# PLAN — revertir el recibo #4 (prueba de Valeria sobre R8)

| | |
|---|---|
| **Fecha** | 2026-08-28 |
| **Estado** | 🟡 **PLAN. NO EJECUTADO.** Ni una fila tocada. |
| **Branch de trabajo** | `reports` (este doc). El código del recibo vive aparte en `fix/recibo-pie-cobrador`. |
| **Autorización** | pendiente — hay **una pregunta de producto abierta** en §3 que conviene cerrar antes |

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

SELECT count(*) AS spcs FROM spcs;
[{"spcs":181}]

get_project_url → https://unlhcuanfrtpatoipwve.supabase.co
```

Coinciden con el baseline de `CLAUDE.md`. Se procede con el relevamiento (sólo lectura).

---

## 1. Identificación

### 1.1 El recibo

```sql
SELECT id, numero_recibo, club_id, beneficiario_tipo, profesional_id, propietario_id,
       forma_pago, total_premios, total_descuentos, retencion_dgi, neto_a_cobrar,
       cobrador_nombre, cobrador_documento, comprobante_url, estado, emitido_por,
       emitido_at, anulado_at, notas, created_at
FROM recibos WHERE numero_recibo = 4 AND club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c';
```

```json
[{"id":"b670cfc5-ec4f-4c8f-8452-8c892c597f41","numero_recibo":4,
  "club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","beneficiario_tipo":"profesional",
  "profesional_id":"efda8456-9edc-4dbb-aa51-26eb2c0b07d6","propietario_id":null,
  "forma_pago":"efectivo","total_premios":"62700.00","total_descuentos":"0.00",
  "retencion_dgi":null,"neto_a_cobrar":"62700.00","cobrador_nombre":null,
  "cobrador_documento":null,"comprobante_url":null,"estado":"emitido","emitido_por":null,
  "emitido_at":"2026-08-28 18:13:59.248561+00","anulado_at":null,"notas":null,
  "created_at":"2026-08-28 18:13:59.248561+00"}]
```

| campo | valor |
|---|---|
| `id` | `b670cfc5-ec4f-4c8f-8452-8c892c597f41` |
| `numero_recibo` | **4** |
| beneficiario | `profesional` `efda8456-9edc-4dbb-aa51-26eb2c0b07d6` = **LORENA SOLEDAD VARELA** (entrenadora) |
| `forma_pago` | `efectivo` |
| importe | `total_premios` $62.700 · `total_descuentos` $0 · **`neto_a_cobrar` $62.700** |
| `emitido_por` | **NULL** — el RPC no lo setea. No hay traza de qué usuario lo emitió |
| `emitido_at` / `created_at` | `2026-08-28 18:13:59.248561+00` (= 15:13 ART) |
| `estado` | `emitido` (nunca hubo anulación) |

### 1.2 Las 6 líneas

```sql
SELECT id, concepto, descripcion, concepto_tipo, posicion, monto_bruto, monto_neto,
       estado_linea, fecha_liberacion, pagado_at, recibo_id, orden_display
FROM liquidacion_detalle
WHERE recibo_id = 'b670cfc5-ec4f-4c8f-8452-8c892c597f41'
ORDER BY orden_display;
```

| # | id | concepto | tipo | pos | neto | `estado_linea` | `fecha_liberacion` | `pagado_at` |
|---|---|---|---|---|---|---|---|---|
| 1 | `50d3d2d7-8a1b-4aa4-98be-52764bac8fbb` | Carrera 1 — 3° puesto | premio | 3 | $12.200 | `pagado` | **NULL** | 18:13:59Z |
| 2 | `b7178725-e3ea-46d1-9d8c-2267efd55c30` | Carrera 2 — 4° puesto | premio | 4 | $10.500 | `pagado` | **NULL** | 18:13:59Z |
| 3 | `72e44baa-0608-49f9-9ce9-8cdaa0255032` | Carrera 7 — 5° puesto | premio | 5 | $10.000 | `pagado` | **NULL** | 18:13:59Z |
| 4 | `9f19e541-c082-49c2-9720-287e254f490c` | Incentivo entrenador | incentivo_entrenador | — | $10.000 | `pagado` | **NULL** | 18:13:59Z |
| 5 | `6a778bc2-8491-404c-8fbb-056a02db430a` | Incentivo entrenador | incentivo_entrenador | — | $10.000 | `pagado` | **NULL** | 18:13:59Z |
| 6 | `1ed2a2cc-1adb-4e44-bd7f-69e33b037b84` | Incentivo entrenador | incentivo_entrenador | — | $10.000 | `pagado` | **NULL** | 18:13:59Z |

Todas: `reunion_id = 7b6e003e-…` (**R8**), `monto_descuento = 0`, `recibo_id` → el recibo #4.
**Suma: $62.700.** Cuadra con el `neto_a_cobrar` del recibo.

`descripcion` completa (importa para el rollback — hay que restaurarla textual):

```
1  Carrera 1 — 3° puesto — Entrenador (bolsa: $122.000,00)
2  Carrera 2 — 4° puesto — Entrenador (bolsa: $105.000,00)
3  Carrera 7 — 5° puesto — Entrenador (bolsa: $100.000,00)
4  Incentivo entrenador por caballo corrido: $10.000,00
5  Incentivo entrenador por caballo corrido: $10.000,00
6  Incentivo entrenador por caballo corrido: $10.000,00
```

**Fingerprint del estado actual de las 6** (para verificar el rollback):

```sql
SELECT md5(string_agg(id::text||'|'||estado_linea::text||'|'||coalesce(pagado_at::text,'-')
       ||'|'||coalesce(recibo_id::text,'-')||'|'||coalesce(descripcion,'-'), E'\n' ORDER BY id))
FROM liquidacion_detalle WHERE recibo_id = 'b670cfc5-ec4f-4c8f-8452-8c892c597f41';
-- 733b63465ac1ccb104e955a218e8b7cc   (n=6, monto=62700.00)
```

---

## 2. Estado previo de cada línea — determinado con certeza

**Las 6 estaban en `impago`.** Sin ambigüedad, por tres evidencias independientes:

### 2.1 El RPC sólo puede haber tomado líneas `impago`

`migrations/emitir_recibo_v1_1.sql` — el `UPDATE` que marca las líneas:

```sql
UPDATE liquidacion_detalle d
   SET estado_linea = 'pagado', recibo_id = v_recibo.id, pagado_at = now()
 WHERE d.id = ANY(p_linea_ids)
   AND d.beneficiario_id = p_beneficiario_id
   AND d.recibo_id IS NULL
   AND d.estado_linea = 'impago';        -- ← pagable = SOLO impago (v1.1)
```

Si una de las 6 hubiera estado en `retenido`, el `UPDATE` no la habría tocado y no tendría
`recibo_id`. Las 6 lo tienen ⇒ **las 6 eran `impago` a las 18:13:59Z**.

### 2.2 Nunca estuvieron retenidas — verificado, no asumido

Regla de retención de Fase C, `liquidaciones-engine.js:307`:

```javascript
const retenido = item.conceptoTipo === 'premio' && (item.posicion === 1 || item.posicion === 2);
```
```javascript
fecha_liberacion: retenido ? fechaLiberacion : null,   // línea 315 y 328
```

- 3 líneas son `premio` de **3°, 4° y 5°** → fuera de la regla (sólo 1° y 2°).
- 3 líneas son `incentivo_entrenador` → ni siquiera son `premio`.
- **Las 6 tienen `fecha_liberacion = NULL`**, que es el marcador que el motor pone a lo NO retenido.

Y `liberar_linea` (`migrations/liberar_linea.sql`) hace `SET estado_linea = 'impago'` **sin tocar
`fecha_liberacion`**: si alguna hubiera sido retenida y liberada a mano, habría quedado con
`fecha_liberacion` NO nula. Está nula en las 6 ⇒ **nunca fueron retenidas ni liberadas**.

### 2.3 Ninguna tiene la marca del saldado

```sql
SELECT count(*) FROM liquidacion_detalle
WHERE recibo_id='b670cfc5-…' AND descripcion LIKE '%[REGULARIZACION%';
-- 0
```

**Cero.** No hay contaminación entre el saldado y el recibo. Nada que investigar por ese lado.

### 2.4 Por qué quedaron afuera del saldado — la cronología

El recibo se emitió **antes** de que corriéramos el saldado, no después. El pre-chequeo del
saldado (`2026-08-28_ejecucion-saldado-r6-r8.md` §1) ya contaba **$292.700 "ya pagadas con
recibo"** = 70.000 + 100.000 + 60.000 + **62.700**. Los $62.700 del recibo #4 ya estaban ahí.

El `pagado_at` del saldado (`2026-08-28 12:00:00-03:00` = 15:00Z) es un timestamp **fijado a
propósito**, no la hora real de ejecución. De ahí la confusión inicial: parece anterior al recibo
(18:13Z) pero se ejecutó después.

**Conclusión operativa:** las 6 líneas quedaron fuera de las 332 por un **accidente de timing**
—tenían `recibo_id` en el momento del `UPDATE`—, no por una regla de negocio. Si Valeria no
hubiera emitido el recibo de prueba una hora antes, hoy estarían entre las 332 saldadas.

---

## 3. ¿`impago` o saldadas? — coincido: **saldadas**

**Coincido con tu lectura.** Las 6 tienen que quedar `pagado` con la marca de regularización, como
el resto de R8. Razones:

1. **Restaura la intención original, no inventa una decisión nueva.** El criterio del saldado fue
   "todo R6 y R8 de beneficiarios reales queda saldado administrativamente". Estas 6 cumplen ese
   criterio al 100% (R8, beneficiario profesional, no fondo solidario). Sólo las excluyó un
   `recibo_id` que existía por error. Dejarlas `impago` sería aplicarles un criterio distinto al
   de sus 331 hermanas por un motivo que ya no existe.
2. **Es exactamente lo que el saldado quiso evitar.** En `impago` le reaparecen a Valeria el 20/09
   mezcladas con lo nuevo de la reunión — $62.700 de una reunión de agosto en medio de la
   liquidación de septiembre.
3. **Evita una deuda fantasma.** Hoy R8 tiene **0 líneas pagables** de beneficiarios reales (las
   40 `impago` que quedan son todas `fondo_solidario`/`club`, excluidas a propósito). Dejar 6 en
   `impago` crea el único saldo pendiente de R8, a nombre de una sola entrenadora.

**Lo único que daría vuelta la respuesta**, y por eso lo planteo antes de ejecutar: si a VARELA
**efectivamente no le pagaron** esos $62.700 y los está esperando, marcarlas saldadas le borra el
cobro del sistema. Pero eso no es específico de estas 6 — es la premisa de las 332. Si esa premisa
vale para R8, vale para estas también. **Necesito que Valeria o Fede confirmen que VARELA está
dentro del universo "ya cobró fuera del sistema"**, igual que el resto de R8. Si la respuesta es
"no cobró", entonces van a `impago` y el SQL cambia (§4.4).

### Marca a usar

La misma marca del saldado, **para que entren en el mismo conjunto** (cualquier query que filtre
`descripcion LIKE '%[REGULARIZACION%'` las encuentra), **más** una segunda marca que deja la
trazabilidad del revert:

```
 [REGULARIZACION 2026-08-28: saldado administrativo pre-sistema, sin recibo; estado previo=impago]
 [REVERSION 2026-08-28: recibo N°4 (prueba) borrado; la linea habia quedado fuera del saldado por tener recibo_id]
```

`estado previo=impago` es literalmente cierto (§2), así que la marca no miente.

---

## 4. El SQL — **NO EJECUTADO**

### 4.1 Por qué entra en una sola llamada

El único FK que apunta a `recibos` es `liquidacion_detalle.recibo_id`, con
**`ON DELETE NO ACTION`**:

```sql
SELECT tc.table_name, kcu.column_name, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name='recibos';
-- [{"table_name":"liquidacion_detalle","column_name":"recibo_id",
--   "constraint_name":"liquidacion_detalle_recibo_id_fkey","delete_rule":"NO ACTION"}]
```

`NO ACTION` (a diferencia de `RESTRICT`) se chequea **al final de la sentencia**, no fila por fila.
Como el `UPDATE` que suelta las líneas y el `DELETE` del recibo van en la **misma sentencia**, para
cuando se evalúa el FK ya no queda ninguna fila apuntando al recibo. Mismo patrón de CTEs
modificantes que usó el saldado, y por el mismo motivo: el MCP no garantiza sesión persistente,
así que `BEGIN`/`COMMIT` en llamadas separadas no envolverían nada.

### 4.2 Pre-chequeo (correr primero, solo lectura)

```sql
SELECT
  (SELECT count(*) FROM recibos
    WHERE id='b670cfc5-ec4f-4c8f-8452-8c892c597f41' AND numero_recibo=4
      AND club_id='0649e9c5-9e87-4aad-842f-101458e6b33c')                    AS recibo_existe_1,
  (SELECT count(*) FROM liquidacion_detalle
    WHERE recibo_id='b670cfc5-ec4f-4c8f-8452-8c892c597f41')                  AS lineas_6,
  (SELECT count(*) FROM liquidacion_detalle
    WHERE recibo_id='b670cfc5-ec4f-4c8f-8452-8c892c597f41'
      AND descripcion LIKE '%[REGULARIZACION%')                              AS ya_marcadas_0,
  (SELECT count(*) FROM liquidacion_detalle
    WHERE recibo_id='b670cfc5-ec4f-4c8f-8452-8c892c597f41'
      AND estado_linea <> 'pagado')                                          AS no_pagadas_0,
  (SELECT ultimo_numero FROM club_secuencias
    WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND tipo='recibo')  AS secuencia_4,
  (SELECT count(*) FROM liquidacion_detalle WHERE recibo_id IS NOT NULL)     AS con_recibo_14;
```

**Esperado: `1, 6, 0, 0, 4, 14`.** Si alguno no da, **frenar**.

### 4.3 La operación (una sola llamada)

```sql
WITH lineas AS (
  UPDATE liquidacion_detalle d
     SET recibo_id    = NULL,
         estado_linea = 'pagado',
         pagado_at    = '2026-08-28 12:00:00-03:00'::timestamptz,
         descripcion  = coalesce(d.descripcion,'')
                      || ' [REGULARIZACION 2026-08-28: saldado administrativo pre-sistema,'
                      || ' sin recibo; estado previo=impago]'
                      || ' [REVERSION 2026-08-28: recibo N°4 (prueba) borrado; la linea habia'
                      || ' quedado fuera del saldado por tener recibo_id]'
   WHERE d.recibo_id = 'b670cfc5-ec4f-4c8f-8452-8c892c597f41'
  RETURNING d.id
), rec AS (
  DELETE FROM recibos
   WHERE id = 'b670cfc5-ec4f-4c8f-8452-8c892c597f41'
     AND numero_recibo = 4
     AND club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  RETURNING id
)
SELECT (SELECT count(*) FROM lineas) AS lineas_soltadas,
       (SELECT count(*) FROM rec)    AS recibos_borrados;
```

**Esperado: `{"lineas_soltadas":6,"recibos_borrados":1}`.**

`club_secuencias` **no aparece en la sentencia**. El correlativo queda quemado, como se decidió.

> **Fallback** si Postgres rechazara el FK dentro de la CTE: correr el `UPDATE` solo, verificar 6
> filas, y recién después el `DELETE`. Deja una ventana microscópica en la que el recibo existe sin
> líneas — inocua, porque nadie más está operando.

### 4.4 Variante si la respuesta de §3 fuera "dejarlas impago"

**No ejecutar salvo que Valeria/Fede digan que VARELA no cobró.** Cambia sólo la CTE `lineas`:

```sql
  UPDATE liquidacion_detalle d
     SET recibo_id    = NULL,
         estado_linea = 'impago',
         pagado_at    = NULL,
         descripcion  = coalesce(d.descripcion,'')
                      || ' [REVERSION 2026-08-28: recibo N°4 (prueba) borrado;'
                      || ' vuelve a impago, estado previo a la emision]'
   WHERE d.recibo_id = 'b670cfc5-ec4f-4c8f-8452-8c892c597f41'
  RETURNING d.id
```

---

## 5. Verificaciones posteriores

### 5.1 El correlativo siguiente es 5, no 4

```sql
SELECT ultimo_numero FROM club_secuencias
WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND tipo='recibo';
-- esperado: 4  (sin cambios)
```

`fn_siguiente_recibo` hace `ultimo_numero + 1`:

```sql
INSERT INTO club_secuencias (club_id, tipo, ultimo_numero) VALUES (p_club_id,'recibo',1)
ON CONFLICT (club_id, tipo) DO UPDATE SET ultimo_numero = club_secuencias.ultimo_numero + 1
RETURNING ultimo_numero INTO v_num;
```

⇒ con `ultimo_numero = 4`, **el próximo recibo será el 5**. El 4 queda como hueco, por decisión.

### 5.2 Ninguna línea apunta a un recibo inexistente

```sql
SELECT count(*) AS huerfanas
FROM liquidacion_detalle d LEFT JOIN recibos r ON r.id = d.recibo_id
WHERE d.recibo_id IS NOT NULL AND r.id IS NULL;
-- esperado: 0
```

### 5.3 Las líneas con recibo pasan de 14 a 8

```sql
SELECT count(*) FILTER (WHERE recibo_id IS NOT NULL) AS con_recibo_global,
       count(*) FILTER (WHERE recibo_id IS NOT NULL
                        AND reunion_id='7b6e003e-22e2-4629-bf55-f18560b1260f') AS con_recibo_r8
FROM liquidacion_detalle;
-- antes:    {"con_recibo_global":14,"con_recibo_r8":10}
-- esperado: {"con_recibo_global":8, "con_recibo_r8":4}
```

8 = 4 de R8 (recibos #1, #2, #3) + 4 de la reunión de prueba 9999 (recibos #9001/#9002).

### 5.4 El total de R8 no cambia

```sql
SELECT estado_linea, count(*) n,
       count(*) FILTER (WHERE descripcion LIKE '%[REGULARIZACION%') marcadas,
       count(*) FILTER (WHERE recibo_id IS NOT NULL) con_recibo,
       sum(monto_neto) monto
FROM liquidacion_detalle WHERE reunion_id='7b6e003e-22e2-4629-bf55-f18560b1260f'
GROUP BY 1 ORDER BY 1;
```

| | antes | después (esperado) |
|---|---|---|
| `impago` | 40 · marcadas 0 · recibo 0 · **$285.162,00** | **idéntico** (son todas `fondo_solidario`/`club`) |
| `pagado` | 185 · marcadas 175 · recibo 10 · **$15.036.756,66** | 185 · marcadas **181** · recibo **4** · **$15.036.756,66** |
| **total R8** | 225 líneas · **$15.321.918,66** | 225 líneas · **$15.321.918,66** |

**El monto no se mueve en ningún bucket** — las 6 líneas siguen siendo `pagado`, sólo cambian de
"pagadas con recibo" a "pagadas por regularización". Es la comprobación más importante: si algún
total se mueve, algo salió mal.

### 5.5 Las 6 quedaron bien

```sql
SELECT id, estado_linea, pagado_at, recibo_id,
       (descripcion LIKE '%[REGULARIZACION%') AS tiene_marca_saldado,
       (descripcion LIKE '%[REVERSION%')      AS tiene_marca_reversion
FROM liquidacion_detalle
WHERE id IN ('50d3d2d7-8a1b-4aa4-98be-52764bac8fbb','b7178725-e3ea-46d1-9d8c-2267efd55c30',
             '72e44baa-0608-49f9-9ce9-8cdaa0255032','9f19e541-c082-49c2-9720-287e254f490c',
             '6a778bc2-8491-404c-8fbb-056a02db430a','1ed2a2cc-1adb-4e44-bd7f-69e33b037b84')
ORDER BY id;
-- esperado en las 6: pagado · 2026-08-28 15:00:00+00 · recibo_id NULL · true · true
```

### 5.6 El recibo #4 ya no existe

```sql
SELECT count(*) FROM recibos WHERE numero_recibo=4
  AND club_id='0649e9c5-9e87-4aad-842f-101458e6b33c';
-- esperado: 0
SELECT numero_recibo FROM recibos WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c'
ORDER BY numero_recibo;
-- esperado: 1, 2, 3, 9001, 9002   ← el 4 es el hueco
```

---

## 6. Rollback

Deshace el revert por completo: recrea el recibo con **el mismo `id` y el mismo número**, vuelve a
apuntar las 6 líneas y restaura `descripcion` textual (sin las marcas agregadas).

`neto_a_cobrar` **se omite del INSERT**: es `GENERATED ALWAYS`
(`(total_premios - total_descuentos) - COALESCE(retencion_dgi, 0)`), Postgres la calcula sola
(GOTCHA #9). Con 62700 − 0 − 0 vuelve a dar 62700.

```sql
BEGIN;

INSERT INTO recibos (
  id, club_id, numero_recibo, beneficiario_tipo, profesional_id, propietario_id,
  forma_pago, total_premios, total_descuentos, retencion_dgi,
  cobrador_nombre, cobrador_documento, comprobante_url, estado, emitido_por,
  emitido_at, anulado_at, notas, created_at
) VALUES (
  'b670cfc5-ec4f-4c8f-8452-8c892c597f41',
  '0649e9c5-9e87-4aad-842f-101458e6b33c',
  4, 'profesional', 'efda8456-9edc-4dbb-aa51-26eb2c0b07d6', NULL,
  'efectivo', 62700.00, 0.00, NULL,
  NULL, NULL, NULL, 'emitido', NULL,
  '2026-08-28 18:13:59.248561+00'::timestamptz, NULL, NULL,
  '2026-08-28 18:13:59.248561+00'::timestamptz
);

UPDATE liquidacion_detalle SET
  recibo_id    = 'b670cfc5-ec4f-4c8f-8452-8c892c597f41',
  estado_linea = 'pagado',
  pagado_at    = '2026-08-28 18:13:59.248561+00'::timestamptz,
  descripcion  = 'Carrera 1 — 3° puesto — Entrenador (bolsa: $122.000,00)'
WHERE id = '50d3d2d7-8a1b-4aa4-98be-52764bac8fbb';

UPDATE liquidacion_detalle SET
  recibo_id    = 'b670cfc5-ec4f-4c8f-8452-8c892c597f41',
  estado_linea = 'pagado',
  pagado_at    = '2026-08-28 18:13:59.248561+00'::timestamptz,
  descripcion  = 'Carrera 2 — 4° puesto — Entrenador (bolsa: $105.000,00)'
WHERE id = 'b7178725-e3ea-46d1-9d8c-2267efd55c30';

UPDATE liquidacion_detalle SET
  recibo_id    = 'b670cfc5-ec4f-4c8f-8452-8c892c597f41',
  estado_linea = 'pagado',
  pagado_at    = '2026-08-28 18:13:59.248561+00'::timestamptz,
  descripcion  = 'Carrera 7 — 5° puesto — Entrenador (bolsa: $100.000,00)'
WHERE id = '72e44baa-0608-49f9-9ce9-8cdaa0255032';

UPDATE liquidacion_detalle SET
  recibo_id    = 'b670cfc5-ec4f-4c8f-8452-8c892c597f41',
  estado_linea = 'pagado',
  pagado_at    = '2026-08-28 18:13:59.248561+00'::timestamptz,
  descripcion  = 'Incentivo entrenador por caballo corrido: $10.000,00'
WHERE id IN ('9f19e541-c082-49c2-9720-287e254f490c',
             '6a778bc2-8491-404c-8fbb-056a02db430a',
             '1ed2a2cc-1adb-4e44-bd7f-69e33b037b84');

COMMIT;
```

Verificación del rollback — el fingerprint tiene que volver al valor de §1.2:

```sql
SELECT md5(string_agg(id::text||'|'||estado_linea::text||'|'||coalesce(pagado_at::text,'-')
       ||'|'||coalesce(recibo_id::text,'-')||'|'||coalesce(descripcion,'-'), E'\n' ORDER BY id))
FROM liquidacion_detalle WHERE recibo_id = 'b670cfc5-ec4f-4c8f-8452-8c892c597f41';
-- esperado: 733b63465ac1ccb104e955a218e8b7cc
```

### Los 6 ids, sueltos para copiar

```
50d3d2d7-8a1b-4aa4-98be-52764bac8fbb
b7178725-e3ea-46d1-9d8c-2267efd55c30
72e44baa-0608-49f9-9ce9-8cdaa0255032
9f19e541-c082-49c2-9720-287e254f490c
6a778bc2-8491-404c-8fbb-056a02db430a
1ed2a2cc-1adb-4e44-bd7f-69e33b037b84
```

Recibo: `b670cfc5-ec4f-4c8f-8452-8c892c597f41`

**Limitación del rollback:** recrea la fila con su `id` original, así que cualquier `recibo_id`
vuelve a resolver. Lo que **no** vuelve es el número si en el medio se emitió otro recibo — pero
como el correlativo queda en 4 y el próximo será 5, el número 4 sigue libre y no hay colisión con
el índice único `(club_id, numero_recibo)`.

---

## 7. Para el backlog — `anular_recibo` no existe

**No se construye ahora.** Entrada lista para pegar en `docs/ISSUES.md` cuando se mergee:

> ### ISSUE-056 — No existe `anular_recibo`: revertir un recibo requiere SQL a mano
>
> **Severidad:** alta (bloqueante operativo el día de reunión) · **Estado:** abierto ·
> **Detectado:** 2026-08-28, primer caso real
>
> `emitir_recibo` es atómico y correcto, pero **no hay contraparte**. Cuando el 2026-08-28 Valeria
> emitió el recibo #4 sobre R8 como prueba, revertirlo exigió un plan escrito, relevamiento de
> estado previo y SQL manual sobre producción
> (`docs/diagnosticos/2026-08-28_plan-revert-recibo-4.md`).
>
> **Por qué urge:** el 20/09 hay reunión con gente esperando el cobro. Un recibo emitido por error
> —beneficiario equivocado, líneas de más, importe mal— hoy no tiene forma limpia de arreglarse:
> hay que abrir la consola de Supabase mientras la cola espera.
>
> **Lo que aprendimos hoy y tiene que entrar en el RPC:**
> 1. **Soltar las líneas**: `recibo_id = NULL` en todas las del recibo.
> 2. **Restaurar el estado previo** de cada línea. Hoy es reconstruible sólo porque
>    `emitir_recibo` v1.1 exige `impago` (⇒ el previo siempre fue `impago`) y porque
>    `fecha_liberacion` distingue lo que estuvo retenido. Es una inferencia, no un dato: conviene
>    **persistir el estado previo** (columna en `liquidacion_detalle`, o una tabla
>    `recibo_lineas_snapshot`) en vez de deducirlo.
> 3. **Marcar el recibo como anulado, NO borrarlo.** `recibos` ya tiene `estado` (enum
>    `estado_recibo`) y `anulado_at`, hoy sin uso: `estado='anulado'`, `anulado_at=now()`, más un
>    motivo en `notas`. El caso de hoy se borra porque es dato de prueba, no un recibo real — la
>    anulación de verdad tiene que dejar rastro.
> 4. **No devolver el correlativo.** `club_secuencias` no se toca: un número emitido no se recicla,
>    aunque quede hueco. (Decisión tomada hoy.)
> 5. **Registrar quién anula.** Ver ISSUE relacionado: `emitido_por` es NULL en los 6 recibos
>    existentes porque `emitir_recibo` nunca lo setea — la anulación no puede repetir ese error.
>
> **Fuera de alcance de la reversión manual de hoy** (se decidió explícitamente no construirlo
> junto con el fix del recibo, `fix/recibo-pie-cobrador`).

---

## 8. Resumen y qué falta para ejecutar

| | |
|---|---|
| recibo a borrar | #4 · `b670cfc5-…` · $62.700 · VARELA · R8 |
| líneas a soltar | **6** · $62.700 |
| estado previo determinado | **`impago`, con certeza** (§2) — ninguna retenida, ninguna marcada |
| destino recomendado | `pagado` + marca de regularización (§3) |
| `club_secuencias` | **no se toca** — queda en 4, próximo recibo = 5 |
| filas escritas por la operación | 6 UPDATE + 1 DELETE |
| totales que se mueven | **ninguno** — R8 sigue en $15.321.918,66 |
| ejecutado | **NO** |

**Bloqueante para ejecutar:** la confirmación de §3 — que VARELA está dentro del universo "ya
cobró fuera del sistema", igual que el resto de R8. Con ese OK, se corre §4.2, §4.3 y §5 en ese
orden.

## 9. Preguntas abiertas

1. **§3 — ¿VARELA cobró fuera del sistema?** Si sí → saldadas (§4.3). Si no → `impago` (§4.4).
2. **¿Quién emitió el recibo #4?** `emitido_por` es NULL y el RPC nunca lo setea. Sabemos que fue
   una prueba porque Valeria lo dijo, no porque la base lo registre. Vale para los 6 recibos.
3. **Los recibos #1, #2 y #3** también tienen `cobrador_nombre` NULL y son cobros reales de R8.
   No se tocan acá, pero quedan sin registro de quién retiró.
4. **La reunión de prueba 9999** sigue viva con los recibos #9001/#9002. Fuera de alcance de este
   plan (se borra con `teardown_prueba_resumen_9999.sql`), pero conviene no olvidarla.
