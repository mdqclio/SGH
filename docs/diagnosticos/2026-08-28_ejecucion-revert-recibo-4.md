# EJECUCIÓN — reversión del recibo #4 (prueba de Valeria sobre R8)

| | |
|---|---|
| **Fecha** | 2026-08-28 |
| **Plan que ejecuta** | [`2026-08-28_plan-revert-recibo-4.md`](2026-08-28_plan-revert-recibo-4.md) — variante **§4.3** (saldadas) |
| **Estado** | ✅ **EJECUTADO Y VERIFICADO.** 6 líneas soltadas + 1 recibo borrado. Reversible. |
| **Autorización** | OK explícito del usuario, con la pregunta de §3 del plan resuelta (ver §0) |
| **SHA de `main`** | `73428dd` |

## Guards verificados (antes de escribir)

```
$ pwd
/home/clio/dev/SGH

SELECT count(*) AS spcs FROM spcs;
[{"spcs":181}]

get_project_url → https://unlhcuanfrtpatoipwve.supabase.co
```

---

## 0. La pregunta bloqueante del §3, resuelta

El plan pedía confirmar que VARELA estaba dentro del universo "ya cobró fuera del sistema" antes de
marcar sus 6 líneas como saldadas. **La objeción se cayó, y con razón:**

> No hay que consultar nada. La respuesta ya está en la premisa del saldado: Fede y Valeria
> acordaron que todo R6 y R8 se pagó por fuera del sistema. Ninguna de las otras 331 líneas se
> verificó individualmente. Pedir confirmación específica para VARELA sería aplicarle un criterio
> distinto al de sus 331 hermanas, por un motivo —el `recibo_id` de una prueba— que tu propio §2.4
> demuestra que fue un accidente de timing.

Correcto. El chequeo que pedía el plan era una verificación individual que el saldado nunca hizo
para nadie: pedirla sólo para estas 6 habría sido aplicarles un estándar más estricto por un
artefacto de la prueba de Valeria. Se ejecuta **§4.3**.

---

## 1. Pre-chequeo (§4.2 del plan)

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

**Salida cruda:**
```json
[{"recibo_existe_1":1,"lineas_6":6,"ya_marcadas_0":0,"no_pagadas_0":0,"secuencia_4":4,"con_recibo_14":14}]
```

**`1, 6, 0, 0, 4, 14`.** Exacto al plan. Se procede.

---

## 2. La operación (§4.3, una sola llamada)

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

**Salida cruda:**
```json
[{"lineas_soltadas":6,"recibos_borrados":1}]
```

**6 y 1.** Coincide con lo planificado.

**El FK no rechazó nada — no hizo falta el fallback.** `liquidacion_detalle_recibo_id_fkey` es
`ON DELETE NO ACTION`, que se evalúa al final de la sentencia: para cuando se chequea, el `UPDATE`
de la CTE `lineas` ya había puesto `recibo_id = NULL` en las 6. El `UPDATE` y el `DELETE`
convivieron en una sola sentencia sin problema, como preveía §4.1 del plan.

`club_secuencias` no aparece en la sentencia. El correlativo quedó quemado.

---

## 3. Verificaciones

### 3.1 (§5.4) — el total de R8 no se movió · **la verificación crítica**

```sql
SELECT estado_linea, count(*) n,
       count(*) FILTER (WHERE descripcion LIKE '%[REGULARIZACION%') marcadas,
       count(*) FILTER (WHERE recibo_id IS NOT NULL) con_recibo,
       sum(monto_neto) monto
FROM liquidacion_detalle WHERE reunion_id='7b6e003e-22e2-4629-bf55-f18560b1260f'
GROUP BY 1 ORDER BY 1;
```

**Salida cruda:**
```json
[{"estado_linea":"impago","n":40,"marcadas":0,"con_recibo":0,"monto":"285162.00"},
 {"estado_linea":"pagado","n":185,"marcadas":181,"con_recibo":4,"monto":"15036756.66"}]
```

| bucket | antes | después | ¿se movió el monto? |
|---|---|---|---|
| `impago` | 40 · marcadas 0 · recibo 0 · **$285.162,00** | 40 · marcadas 0 · recibo 0 · **$285.162,00** | **no** |
| `pagado` | 185 · marcadas 175 · recibo **10** · **$15.036.756,66** | 185 · marcadas **181** · recibo **4** · **$15.036.756,66** | **no** |

```sql
SELECT sum(monto_neto) AS total_r8, count(*) AS lineas_r8
FROM liquidacion_detalle WHERE reunion_id='7b6e003e-22e2-4629-bf55-f18560b1260f';
```
```json
[{"total_r8":"15321918.66","lineas_r8":225}]
```

**R8 sigue en `$15.321.918,66` sobre 225 líneas.** Ni un peso se movió de bucket. Lo único que
cambió es la **naturaleza** de 6 líneas: de "pagadas con recibo" a "pagadas por regularización"
(`marcadas` 175 → **181**, `con_recibo` 10 → **4**). 175 + 6 = 181 ✅ · 10 − 6 = 4 ✅

### 3.2 (§5.1) — el correlativo siguiente es 5, no 4

```json
{"secuencia":4}
```

`club_secuencias.ultimo_numero = 4`, sin cambios. Como `fn_siguiente_recibo` hace
`ultimo_numero + 1`, **el próximo recibo será el #5**. El #4 queda como hueco permanente, según lo
decidido.

### 3.3 (§5.2) — no quedan líneas apuntando a un recibo inexistente

```sql
SELECT count(*) AS huerfanas
FROM liquidacion_detalle d LEFT JOIN recibos r ON r.id = d.recibo_id
WHERE d.recibo_id IS NOT NULL AND r.id IS NULL;
```
```json
{"huerfanas":0}
```

**Cero huérfanas.**

### 3.4 (§5.3) — las líneas con recibo pasaron de 14 a 8

```json
{"con_recibo_global":8,"con_recibo_r8":4}
```

| | antes | después |
|---|---|---|
| global | 14 | **8** |
| R8 | 10 | **4** |

8 = 4 de R8 (recibos #1, #2, #3) + 4 de la reunión de prueba 9999 (#9001, #9002). Exacto.

### 3.5 (§5.5) — las 6 líneas quedaron bien

```json
[{"id":"1ed2a2cc-1adb-4e44-bd7f-69e33b037b84","estado_linea":"pagado","pagado_at":"2026-08-28 15:00:00+00","recibo_id":null,"marca_saldado":true,"marca_reversion":true,"monto_neto":"10000.00"},
 {"id":"50d3d2d7-8a1b-4aa4-98be-52764bac8fbb","estado_linea":"pagado","pagado_at":"2026-08-28 15:00:00+00","recibo_id":null,"marca_saldado":true,"marca_reversion":true,"monto_neto":"12200.00"},
 {"id":"6a778bc2-8491-404c-8fbb-056a02db430a","estado_linea":"pagado","pagado_at":"2026-08-28 15:00:00+00","recibo_id":null,"marca_saldado":true,"marca_reversion":true,"monto_neto":"10000.00"},
 {"id":"72e44baa-0608-49f9-9ce9-8cdaa0255032","estado_linea":"pagado","pagado_at":"2026-08-28 15:00:00+00","recibo_id":null,"marca_saldado":true,"marca_reversion":true,"monto_neto":"10000.00"},
 {"id":"9f19e541-c082-49c2-9720-287e254f490c","estado_linea":"pagado","pagado_at":"2026-08-28 15:00:00+00","recibo_id":null,"marca_saldado":true,"marca_reversion":true,"monto_neto":"10000.00"},
 {"id":"b7178725-e3ea-46d1-9d8c-2267efd55c30","estado_linea":"pagado","pagado_at":"2026-08-28 15:00:00+00","recibo_id":null,"marca_saldado":true,"marca_reversion":true,"monto_neto":"10500.00"}]
```

Las 6: `pagado` · `pagado_at = 2026-08-28 15:00:00+00` (= 12:00 ART, el timestamp del saldado) ·
`recibo_id NULL` · las dos marcas presentes. Suma $62.700.

`descripcion` resultante (línea 1, verbatim):

```
Carrera 1 — 3° puesto — Entrenador (bolsa: $122.000,00) [REGULARIZACION 2026-08-28: saldado
administrativo pre-sistema, sin recibo; estado previo=impago] [REVERSION 2026-08-28: recibo N°4
(prueba) borrado; la linea habia quedado fuera del saldado por tener recibo_id]
```

### 3.6 (§5.6) — el recibo #4 ya no existe

```json
{"recibo_4_existe":0,"recibos_vivos":"1, 2, 3, 9001, 9002"}
```

**El #4 es el hueco.** Los recibos vivos son 1, 2, 3, 9001 y 9002.

### 3.7 — extra: las 6 se integraron al conjunto del saldado

```sql
SELECT pagado_at, count(*) AS lineas, count(recibo_id) AS con_recibo
FROM liquidacion_detalle WHERE pagado_at IS NOT NULL GROUP BY 1 ORDER BY 1;
```
```json
[{"pagado_at":"2026-08-16 18:46:44.652601+00","lineas":1,"con_recibo":1},
 {"pagado_at":"2026-08-28 12:58:16.28662+00","lineas":1,"con_recibo":1},
 {"pagado_at":"2026-08-28 14:10:26.492625+00","lineas":2,"con_recibo":2},
 {"pagado_at":"2026-08-28 15:00:00+00","lineas":338,"con_recibo":0}]
```

El bloque del saldado pasó de **332** a **338** líneas, todas con `recibo_id NULL`. Las 6 quedaron
indistinguibles de sus 332 hermanas para cualquier query que agrupe por `pagado_at` o filtre por la
marca `[REGULARIZACION`. **Que es exactamente el objetivo**: el 20/09 no le reaparecen a Valeria.

Y desapareció la fila de `2026-08-28 18:13:59` — no queda rastro del recibo de prueba en los
timestamps de pago.

---

## 4. Resultado

| | |
|---|---|
| recibo borrado | #4 · `b670cfc5-ec4f-4c8f-8452-8c892c597f41` · $62.700 · VARELA · R8 |
| líneas soltadas y saldadas | **6** · $62.700 |
| filas escritas | 6 UPDATE + 1 DELETE |
| `club_secuencias` | **intacta** en 4 → próximo recibo **#5** |
| totales que se movieron | **ninguno** — R8 en $15.321.918,66 antes y después |
| huérfanas | 0 |
| líneas con recibo | 14 → **8** |
| bloque del saldado | 332 → **338** líneas |
| verificaciones del plan | **§5.1 a §5.6, las 6, todas OK** |

Todas las escrituras fueron sobre `liquidacion_detalle` (6 filas) y `recibos` (1 fila borrada).
Ninguna otra tabla se tocó. Sin DDL.

---

## 5. Rollback

Sigue vigente **tal cual está en §6 del plan** — recrea el recibo con su `id` y número originales,
vuelve a apuntar las 6 líneas y restaura `descripcion` textual. El número 4 sigue libre (el
correlativo quedó en 4), así que no hay colisión con el índice único `(club_id, numero_recibo)`.

Verificación del rollback: el fingerprint tiene que volver a
**`733b63465ac1ccb104e955a218e8b7cc`**.

Los 6 ids:

```
50d3d2d7-8a1b-4aa4-98be-52764bac8fbb   Carrera 1 — 3° puesto      $12.200
b7178725-e3ea-46d1-9d8c-2267efd55c30   Carrera 2 — 4° puesto      $10.500
72e44baa-0608-49f9-9ce9-8cdaa0255032   Carrera 7 — 5° puesto      $10.000
9f19e541-c082-49c2-9720-287e254f490c   Incentivo entrenador       $10.000
6a778bc2-8491-404c-8fbb-056a02db430a   Incentivo entrenador       $10.000
1ed2a2cc-1adb-4e44-bd7f-69e33b037b84   Incentivo entrenador       $10.000
```

Recibo: `b670cfc5-ec4f-4c8f-8452-8c892c597f41`

**Advertencia**: el rollback de §6 del plan restaura la `descripcion` original **sin las marcas**.
Si se hace rollback, las 6 vuelven a quedar fuera del conjunto del saldado — que es lo correcto,
porque el recibo vuelve a existir.

---

## 6. Backlog anotado (no construido)

Las dos entradas están escritas en `docs/ISSUES.md` en la branch **`chore/issues-recibos`**
(commit `a657a94`), **sin mergear a `main`** — esperan OK.

| | |
|---|---|
| **ISSUE-056** | No existe `anular_recibo`. Revertir exige plan + SQL manual sobre prod. Deja anotado lo aprendido hoy: soltar líneas, restaurar estado previo (hoy sólo **inferible**, conviene persistirlo), marcar el recibo anulado **sin borrarlo** usando `estado`/`anulado_at` que ya existen, no devolver el correlativo, y registrar quién anula. Incluye el detalle del FK `NO ACTION` que permite hacerlo en una sola sentencia. Prioridad **Alta antes del 20/09**. |
| **ISSUE-057** | `emitir_recibo` nunca setea `emitido_por` — **NULL en los 6 recibos**. Sabemos que el #4 lo emitió Valeria porque lo dijo ella, no porque la base lo registre. El 20/09 operan varias personas: un recibo sin autor es un agujero de auditoría sobre dinero. Arreglo: `auth.uid()` en el `INSERT`. Entrada propia, no un punto adentro de ISSUE-056. Prioridad **Alta antes del 20/09**. |

Dentro de ISSUE-057 queda anotado además que **los recibos #1, #2 y #3 son cobros reales de R8 sin
`cobrador_nombre`** — se emitieron cuando la UI mandaba `null` a propósito. **No se tocan**: son
históricos y la plata ya se pagó, pero quedan sin registro de quién retiró.

---

## 7. Estado de las otras branches

Nada de esto se mergeó a `main`.

| branch | contenido | estado |
|---|---|---|
| `fix/recibo-pie-cobrador` | el fix del pie + captura del cobrador (`a23c0cc`, `8a19800`) + el probe (`70116e2`) | pusheada · **el probe todavía no se corrió** |
| `chore/issues-recibos` | ISSUE-056 + ISSUE-057 en `docs/ISSUES.md` (`a657a94`) | pusheada · sin mergear |
| `reports` | este informe + el plan + el informe del fix | pusheada |

**Pendiente inmediato**: correr `tests/probe_recibo_pie_cobrador.mjs`. Escribe fixtures en prod
(una liquidación + 8 líneas sobre R5 + 2 recibos, con snapshot/restore en el `finally`), así que no
se corrió en la misma tanda que esta reversión para no mezclar escrituras sobre `recibos` y
`club_secuencias` mientras se verificaba el correlativo.

## 8. Preguntas abiertas

1. **El hueco del #4 es permanente y no está documentado en ningún lado del sistema.** Si alguien
   audita la numeración va a ver 1, 2, 3, 5… sin explicación. ¿Alcanza con que viva en este
   informe, o merece una fila en alguna tabla de notas?
2. **La reunión de prueba 9999** sigue viva con los recibos #9001/#9002 y 36 líneas pagables por
   $488.000 (ISSUE-055). Fuera del alcance de esta reversión, pero sigue pendiente antes del 20/09.
3. **Correr el probe** del fix del recibo, y después la verificación visual del corte de página
   (los 6 puntos de `2026-08-28_recibo-pie-cobrador.md` §2), antes de mergear
   `fix/recibo-pie-cobrador`.
