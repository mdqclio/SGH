# Stud Book — ejecución paso a paso: (1) sexo ✓ · (2) DDL ✓ · (2.a) vista previa de las 46 — ESPERA TU OK PARA EL UPDATE

**Fecha:** 2026-09-11 (noche) · **`main`:** `4144a91` · **Branch:** `feat/studbook-condicion-5-campos` @ `6bcbc87` · **Plan:** `2026-09-11_plan-studbook-condicion-5-campos.md`
**Escrituras:** `apply_migration fix_condicion_sexo_r6_r7_r8` (5 UPDATE) y `apply_migration carreras_ganadas_desde_hasta_ddl` (2 columnas + CHECK, sin datos). **El backfill (2.b) NO corrió.** UI, formatter y deploy tampoco — siguen después de tu OK sobre la tabla de §3.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 203 | ✅ |
| ref | `unlhcuanfrtpatoipwve` | ✅ |

---

## 1. Paso 1 — las 5 de `condicion_sexo` — HECHO, foto byte a byte idéntica

Dentro del `DO`, **antes** del primer UPDATE, se tomó `f0` = `jsonb_build_object` de **todas las filas** (`to_jsonb`, ordenadas por id) de `liquidaciones`, `liquidacion_detalle`, `resultados`, `resultado_posiciones` **e `inscripciones`** de R6 T2 y R8 T12 (las dos oficiales con líneas); después de los dos UPDATE se tomó `f1` igual; `IF f1 IS DISTINCT FROM f0 THEN RAISE` — mismo criterio que la línea de $100.000 en LOS URONES, ampliado a las cinco tablas. Guardas: 5 en `ambos` antes; 2 + 3 filas; 0 desacuerdos texto/columna en toda la base después.

`{"success":true}`.

```json
las5: [{"r":6,"t":2,"sexo":"machos"},{"r":6,"t":4,"sexo":"machos"},{"r":6,"t":10,"sexo":"hembras"},{"r":7,"t":7,"sexo":"hembras"},{"r":8,"t":12,"sexo":"hembras"}]
sexo_dist: {"ambos":38,"machos":3,"hembras":8}          (antes: ambos 43, machos 1, hembras 5)
audit: [{"t":"2","ar":"18:45:45","antes":"ambos","despues":"machos"},{"t":"4","ar":"18:45:45","antes":"ambos","despues":"machos"},{"t":"12","ar":"18:45:45","antes":"ambos","despues":"hembras"},{"t":"7","ar":"18:45:45","antes":"ambos","despues":"hembras"},{"t":"10","ar":"18:45:45","antes":"ambos","despues":"hembras"}]
plata_r6t2_r8t12: {"lineas":36,"neto":2063744.17}        (igual que antes: 16 + 20 líneas)
```

Cinco filas de auditoría con el antes/después, como el fix de R9. La plata y los resultados de R6 T2 y R8 T12: **idénticos** (la comparación es la del `DO`; el conteo de arriba es sólo lectura de control).

Supuesto que quedó asentado en el SQL: "con exclusión de yeguas" = `machos` (no `machos_castrados`). Si Fede dice otra cosa, 2 literales.

---

## 2. Paso 3 (DDL) — HECHO, sin datos

```sql
ALTER TABLE carreras ADD COLUMN IF NOT EXISTS ganadas_desde integer, ADD COLUMN IF NOT EXISTS ganadas_hasta integer;
ALTER TABLE carreras ADD CONSTRAINT carreras_ganadas_rango CHECK (
  (ganadas_desde IS NULL AND ganadas_hasta IS NULL)
  OR (ganadas_desde >= 0 AND (ganadas_hasta IS NULL OR ganadas_hasta >= ganadas_desde)));
COMMENT ON COLUMN … (las dos, con la convención)
```
`{"success":true}`. Las 49 filas quedan `(NULL, NULL)` = no cargado. Convención confirmada por vos: **`hasta` NULL con `desde` cargado = "o más"**; si Diego quiere tope, se traduce en el formatter.

Nada lee las columnas todavía (el formatter sigue con `null` hardcodeado; `select('*')` de `index.ts` las trae pero no las usa).

---

## 3. Paso 2.a — VISTA PREVIA del backfill (46 filas, `alerta` vacía en todas) — **esperando tu OK**

Query (la misma regla que el UPDATE 2.b del SQL):

```sql
SELECT r.numero AS reunion, c.numero_turno AS t, c.condicion_handicap,
  CASE WHEN lower(c.condicion_handicap) ~ 'perdedor' THEN 0 WHEN … ~ 'ganador(a|es|as)? de 1 carrera' THEN 1 WHEN … 'de 1 o 2' THEN 1 WHEN … 'de 2 o 3' THEN 2 WHEN … 'de 2 o \+' THEN 2 WHEN … 'de 3 o m' THEN 3 END AS desde,
  CASE WHEN … 'perdedor' THEN 0 WHEN … 'de 1 carrera' THEN 1 WHEN … 'de 1 o 2' THEN 2 WHEN … 'de 2 o 3' THEN 3 WHEN … 'de 2 o \+' THEN NULL WHEN … 'de 3 o m' THEN NULL END AS hasta,
  CASE WHEN lower(c.condicion_handicap) !~ 'perdedor|ganador(a|es|as)? de (1 carrera|1 o 2|2 o 3|2 o \+|3 o m)' THEN 'NO_PARSEA' END AS alerta
FROM carreras c JOIN reuniones r ON r.id = c.reunion_id WHERE c.condicion_handicap IS NOT NULL ORDER BY r.numero, c.numero_turno
```

| R | T | texto | desde | hasta | alerta |
|---|---|---|---|---|---|
| 6 | 1 | Productos 2 años perdedores. | 0 | 0 | |
| 6 | 2 | Caballos 3 años perdedores (con exclusión de yeguas) | 0 | 0 | |
| 6 | 3 | Yeguas de 3 y 4 años perdedoras. | 0 | 0 | |
| 6 | 4 | Caballos 4 años perdedores (con exclusión de yeguas) | 0 | 0 | |
| 6 | 5 | Todo caballo 3 y 4 años perdedores. | 0 | 0 | |
| 6 | 6 | Todo caballo 3 y 4 años ganadores de 1 carrera. | 1 | 1 | |
| 6 | 7 | Todo caballo 3 y 4 años ganadores de 2 o 3 carreras. | 2 | 3 | |
| 6 | 8 | Todo caballo 5 años y + edad perdedores. | 0 | 0 | |
| 6 | 9 | Todo caballo 5 años y + edad ganadores de 1 o 2 carreras. | 1 | 2 | |
| 6 | 10 | Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras. | 1 | 2 | |
| 6 | 11 | Especial todo caballo 4 años y + edad ganador de 2 o + carreras. | 2 | **NULL** | |
| 7 | 1 | Caballos 3 años perdedores. | 0 | 0 | |
| 7 | 2 | Yeguas 3 años perdedoras. | 0 | 0 | |
| 7 | 3 | Caballos 4 años perdedores. | 0 | 0 | |
| 7 | 4 | Yeguas 4 años perdedoras. | 0 | 0 | |
| 7 | 5 | Todo caballo 4 años perdedores. | 0 | 0 | |
| 7 | 6 | Todo caballo de 3 y 4 años ganadores de 1 o 2 carreras. | 1 | 2 | |
| 7 | 7 | Yeguas 4 y 5 años perdedoras. | 0 | 0 | |
| 7 | 8 | Todo caballo 3, 4 y 5 años ganadores de 1 o 2 carreras. | 1 | 2 | |
| 7 | 9 | Todo caballo 5 años y + edad perdedores. | 0 | 0 | |
| 7 | 10 | Todo caballo 6 años y + edad ganadores de 1 o 2 carreras. | 1 | 2 | |
| 7 | 11 | Especial todo caballo de 4 años y + edad ganador de 2 o + carreras. | 2 | **NULL** | |
| 7 | 12 | Todo caballo de 5 años ganadora de 1 carrera. | 1 | 1 | |
| 8 | 1 | Todo Caballos de 3 años perdedores | 0 | 0 | |
| 8 | 2 | Todo caballo de 4 años perdedores | 0 | 0 | |
| 8 | 3 | Todo caballo de 4 años perdedores | 0 | 0 | |
| 8 | 4 | Todo caballo de 6 años y más edad perdedores | 0 | 0 | |
| 8 | 5 | Todo caballo de 4 años y más edad ganadores de 1 o 2 carreras | 1 | 2 | |
| 8 | 6 | Todo caballo de 3 y 4 años ganadores de 1 o 2 carreras | 1 | 2 | |
| 8 | 7 | Todo caballo de 3,4 y 5 años ganadores de 1 o 2 carreras | 1 | 2 | |
| 8 | 8 | Todo caballo de 6 años y más edad ganadores de 1 o 2 carreras | 1 | 2 | |
| 8 | 9 | Todo caballo de 5 años y más edad ganadores de 1 carrera | 1 | 1 | |
| 8 | 10 | Especial todo caballo de 4 años y + edad ganador de 2 o + carreras. | 2 | **NULL** | |
| 8 | 11 | Todo caballo de 5 años y más edad perdedores | 0 | 0 | |
| 8 | 12 | Yeguas de 4 y 5 años perdedoras | 0 | 0 | |
| 9 | 1 | Todo caballo 3 años perdedor. | 0 | 0 | |
| 9 | 2 | Todo caballo 4 años perdedor. | 0 | 0 | |
| 9 | 3 | Todo caballo 4 años perdedor. | 0 | 0 | |
| 9 | 4 | Todo caballo 5 años y + edad perdedor. | 0 | 0 | |
| 9 | 5 | Todo caballo 3 y 4 años ganador de 1 o 2 carreras. | 1 | 2 | |
| 9 | 6 | Todo caballo de 5 años ganador de 1 o 2 carreras. | 1 | 2 | |
| 9 | 7 | Todo caballo 6 años y + edad ganadores de 1 o 2 carreras. | 1 | 2 | |
| 9 | 8 | Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras. | 1 | 2 | |
| 9 | 9 | Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras. | 3 | **NULL** | |
| 9 | 10 | Yeguas 5 años y + edad perdedoras. | 0 | 0 | |
| 9 | 11 | Todo caballo 5 años y + edad perdedor. | 0 | 0 | |

**46 filas · `alerta` NULL en las 46.** Distribución: 0-0 ×25 · 1-1 ×3 · 1-2 ×13 · 2-3 ×1 · 2-NULL ×3 · 3-NULL ×1. Las 3 de la 9999 (sin texto) no aparecen y no se tocan.

Un detalle para tu lectura: R7 T12 "Todo caballo de 5 años **ganadora** de 1 carrera" → 1-1 (el regex acepta `ganadora`). R6 T1 "Productos 2 años perdedores" → 0-0 (los "productos" son 2 años; `edad_minima` de esa fila es asunto aparte).

Salida cruda de la query, tal cual:

```json
[{"reunion":6,"t":1,"condicion_handicap":"Productos 2 años perdedores.","desde":0,"hasta":0,"alerta":null},{"reunion":6,"t":2,"condicion_handicap":"Caballos 3 años perdedores (con exclusión de yeguas)","desde":0,"hasta":0,"alerta":null},{"reunion":6,"t":3,"condicion_handicap":"Yeguas de 3 y 4 años perdedoras.","desde":0,"hasta":0,"alerta":null},{"reunion":6,"t":4,"condicion_handicap":"Caballos 4 años perdedores (con exclusión de yeguas)","desde":0,"hasta":0,"alerta":null},{"reunion":6,"t":5,"condicion_handicap":"Todo caballo 3 y 4 años perdedores.","desde":0,"hasta":0,"alerta":null},{"reunion":6,"t":6,"condicion_handicap":"Todo caballo 3 y 4 años ganadores de 1 carrera.","desde":1,"hasta":1,"alerta":null},{"reunion":6,"t":7,"condicion_handicap":"Todo caballo 3 y 4 años ganadores de 2 o 3 carreras.","desde":2,"hasta":3,"alerta":null},{"reunion":6,"t":8,"condicion_handicap":"Todo caballo 5 años y + edad perdedores.","desde":0,"hasta":0,"alerta":null},{"reunion":6,"t":9,"condicion_handicap":"Todo caballo 5 años y + edad ganadores de 1 o 2 carreras.","desde":1,"hasta":2,"alerta":null},{"reunion":6,"t":10,"condicion_handicap":"Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras.","desde":1,"hasta":2,"alerta":null},{"reunion":6,"t":11,"condicion_handicap":"Especial todo caballo 4 años y + edad ganador de 2 o + carreras.","desde":2,"hasta":null,"alerta":null},{"reunion":7,"t":1,"condicion_handicap":"Caballos 3 años perdedores.","desde":0,"hasta":0,"alerta":null},{"reunion":7,"t":2,"condicion_handicap":"Yeguas 3 años perdedoras.","desde":0,"hasta":0,"alerta":null},{"reunion":7,"t":3,"condicion_handicap":"Caballos 4 años perdedores.","desde":0,"hasta":0,"alerta":null},{"reunion":7,"t":4,"condicion_handicap":"Yeguas 4 años perdedoras.","desde":0,"hasta":0,"alerta":null},{"reunion":7,"t":5,"condicion_handicap":"Todo caballo 4 años perdedores.","desde":0,"hasta":0,"alerta":null},{"reunion":7,"t":6,"condicion_handicap":"Todo caballo de 3 y 4 años ganadores de 1 o 2 carreras.","desde":1,"hasta":2,"alerta":null},{"reunion":7,"t":7,"condicion_handicap":"Yeguas 4 y 5 años perdedoras.","desde":0,"hasta":0,"alerta":null},{"reunion":7,"t":8,"condicion_handicap":"Todo caballo 3, 4 y 5 años ganadores de 1 o 2 carreras.","desde":1,"hasta":2,"alerta":null},{"reunion":7,"t":9,"condicion_handicap":"Todo caballo 5 años y + edad perdedores.","desde":0,"hasta":0,"alerta":null},{"reunion":7,"t":10,"condicion_handicap":"Todo caballo 6 años y + edad ganadores de 1 o 2 carreras.","desde":1,"hasta":2,"alerta":null},{"reunion":7,"t":11,"condicion_handicap":"Especial todo caballo de 4 años y + edad ganador de 2 o + carreras.","desde":2,"hasta":null,"alerta":null},{"reunion":7,"t":12,"condicion_handicap":"Todo caballo de 5 años ganadora de 1 carrera.","desde":1,"hasta":1,"alerta":null},{"reunion":8,"t":1,"condicion_handicap":"Todo Caballos de 3 años perdedores","desde":0,"hasta":0,"alerta":null},{"reunion":8,"t":2,"condicion_handicap":"Todo caballo de 4 años perdedores","desde":0,"hasta":0,"alerta":null},{"reunion":8,"t":3,"condicion_handicap":"Todo caballo de 4 años perdedores","desde":0,"hasta":0,"alerta":null},{"reunion":8,"t":4,"condicion_handicap":"Todo caballo de 6 años y más edad perdedores","desde":0,"hasta":0,"alerta":null},{"reunion":8,"t":5,"condicion_handicap":"Todo caballo de 4 años y más edad ganadores de 1 o 2 carreras","desde":1,"hasta":2,"alerta":null},{"reunion":8,"t":6,"condicion_handicap":"Todo caballo de 3 y 4 años ganadores de 1 o 2 carreras","desde":1,"hasta":2,"alerta":null},{"reunion":8,"t":7,"condicion_handicap":"Todo caballo de 3,4 y 5 años ganadores de 1 o 2 carreras","desde":1,"hasta":2,"alerta":null},{"reunion":8,"t":8,"condicion_handicap":"Todo caballo de 6 años y más edad ganadores de 1 o 2 carreras","desde":1,"hasta":2,"alerta":null},{"reunion":8,"t":9,"condicion_handicap":"Todo caballo de 5 años y más edad ganadores de 1 carrera","desde":1,"hasta":1,"alerta":null},{"reunion":8,"t":10,"condicion_handicap":"Especial todo caballo de 4 años y + edad ganador de 2 o + carreras.","desde":2,"hasta":null,"alerta":null},{"reunion":8,"t":11,"condicion_handicap":"Todo caballo de 5 años y más edad perdedores","desde":0,"hasta":0,"alerta":null},{"reunion":8,"t":12,"condicion_handicap":"Yeguas de 4 y 5 años perdedoras","desde":0,"hasta":0,"alerta":null},{"reunion":9,"t":1,"condicion_handicap":"Todo caballo 3 años perdedor.","desde":0,"hasta":0,"alerta":null},{"reunion":9,"t":2,"condicion_handicap":"Todo caballo 4 años perdedor.","desde":0,"hasta":0,"alerta":null},{"reunion":9,"t":3,"condicion_handicap":"Todo caballo 4 años perdedor.","desde":0,"hasta":0,"alerta":null},{"reunion":9,"t":4,"condicion_handicap":"Todo caballo 5 años y + edad perdedor.","desde":0,"hasta":0,"alerta":null},{"reunion":9,"t":5,"condicion_handicap":"Todo caballo 3 y 4 años ganador de 1 o 2 carreras.","desde":1,"hasta":2,"alerta":null},{"reunion":9,"t":6,"condicion_handicap":"Todo caballo de 5 años ganador de 1 o 2 carreras.","desde":1,"hasta":2,"alerta":null},{"reunion":9,"t":7,"condicion_handicap":"Todo caballo 6 años y + edad ganadores de 1 o 2 carreras.","desde":1,"hasta":2,"alerta":null},{"reunion":9,"t":8,"condicion_handicap":"Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras.","desde":1,"hasta":2,"alerta":null},{"reunion":9,"t":9,"condicion_handicap":"Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras.","desde":3,"hasta":null,"alerta":null},{"reunion":9,"t":10,"condicion_handicap":"Yeguas 5 años y + edad perdedoras.","desde":0,"hasta":0,"alerta":null},{"reunion":9,"t":11,"condicion_handicap":"Todo caballo 5 años y + edad perdedor.","desde":0,"hasta":0,"alerta":null}]
```

---

## 4. Lo que sigue, con tu OK sobre §3

| # | paso | estado |
|---|---|---|
| 2.b | UPDATE de las 46 (idempotente, verificación 25/3/13/1/3/1 + 3 NULL) | **esperando OK** |
| 4 | UI en `carta-llamados.html` (2 inputs, carga con `?? ''`, payload con `!== ''`) + probe | pendiente |
| 5 | `studbook_format.mjs:322-323` → `c.ganadas_desde ?? null` / `c.ganadas_hasta ?? null`, redeploy `reunion-json` v22, diff contra el CLI | pendiente |
| 6 | Yesi: lista de 10 DNI (plan §4) — independiente, se manda ya | en tus manos |
| 7 | Diego: valores de pista (plan §5) + convención NULL + doc del endpoint | en tus manos |
| — | SQLs en la rama marcados EJECUTADA / CHANGELOG / merge | al final, con todo |
