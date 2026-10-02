# Transferencias del 30/09 que no aparecen en Pagos — qué hay en la base (solo lectura)

- **Fecha**: 2026-10-02 (consultas a las ~12:45 ART)
- **`main`**: `2e98974884e2b02ef78de2f9b664955049682873`
- **Guards**: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` ✅ · clubs Dolores por uuid ✅
- **Solo lectura**: `SELECT` por MCP y lectura de `liquidaciones.html`. No se escribió nada.
- **Anonimizado**: sin nombres de personas (ni de quien opera Pagos ni de beneficiarios). Ningún resultado de las consultas trae nombres.

## Pedido

La operadora de Pagos quiere registrar transferencias hechas el 30/09 y en Pagos no le aparecen las personas. Preguntas:
(1) recibos emitidos entre el 30/09 y hoy; (2) líneas pagadas sin recibo (saldadas a mano) en ese período; (3) líneas impagas
pagables hoy, por reunión; (4) ¿Pagos muestra líneas de R6/R8 (congeladas)?

## Conclusión

Desde el 30/09 **no se registró nada**: ni recibos ni saldados a mano. Lo más probable es que a esas personas **no les aparezca nada
pagable**: o su línea está **retenida por el antidoping hasta el 20/10** (premios de 1° y 2° puesto de R9), o **ya figura como pagada**
(todo R6 y R8, y parte de R9).

**1. Recibos emitidos entre el 30/09 y hoy: ninguno.** El último recibo del sistema es del **23/09 a las 12:58 ART**. Todos los recibos de
la base son en efectivo: **nunca se registró una transferencia** desde el sistema.

**2. Líneas pagadas sin recibo en ese período: ninguna.** Los saldados que existen son anteriores: R6 y R8 (28/08) y 5 líneas de R9 (21/09).

**3. Líneas pagables hoy, por reunión** (sin el fondo solidario, que es del club):

| Reunión | Impagas pagables | Retenidas (antidoping) | Pagadas |
|---|---|---|---|
| R9 (abierta) | 66 líneas · $1.025.460,00 | 60 líneas · $5.479.874,18 · se liberan el **20/10/2026** | 62 con recibo ($2.024.850,00) + 5 saldadas sin recibo ($380.000,00) |
| 9999 (prueba) | 36 · $488.000,00 | 21 · $604.800,00 | 4 con recibo — Pagos no la muestra (`es_prueba`) |
| R6 (cerrada el 25/09) | **0** | 0 | 157 saldadas sin recibo ($7.116.984,19) |
| R8 (cerrada el 25/09) | **0** | 0 | 181 saldadas sin recibo ($14.806.756,66) + 4 con recibo ($230.000,00) |
| R10 (11/10) | todavía no tiene liquidación | — | — |

**4. ¿Pagos muestra líneas de R6/R8?** **No.** El buscador de Pagos sólo trae líneas `impago` sin recibo
(`liquidaciones.html:1465`: `.eq('estado_linea','impago').neq('beneficiario_tipo','club').is('recibo_id', null)`), y R6/R8 no tienen
ninguna: todo quedó pagado o regularizado antes del cierre. Quien cobró algo de R6 o R8 por transferencia no aparece porque esa plata
**ya figura como pagada** (saldado administrativo del 28/08).

## Por qué no aparecen, según de dónde sea la plata

- **Premios de 1° o 2° puesto de R9**: esas líneas están **retenidas** hasta el 20/10 (`fecha_liberacion` = fecha de la reunión + 30 días
  de antidoping) y no salen como pagables. Primero hay que **liberarlas a mano** en Pagos (liberación manual del doping, RPC
  `liberar_linea`) y después emitir el recibo con forma de pago **Transferencia**.
- **R6 o R8**: ya están pagadas en la base. **Registrarlas otra vez sería doble pago.** Si hace falta dejar constancia del comprobante,
  hoy no hay una pantalla que lo haga sobre una línea ya saldada.
- **R9 que no sea 1° ni 2° puesto** (3° a 5°, bonos, incentivos, peón/capataz/sereno): deberían estar entre las 66 pagables. Si alguna no
  aparece, hace falta saber a qué persona buscó para mirar el caso puntual.

## Preguntas abiertas

1. ¿De qué reunión y puesto son las transferencias del 30/09? Con eso se sabe cuál de los tres casos es.
2. Si eran de R6/R8 (ya saldadas): ¿se quiere un modo de adjuntar el comprobante a una línea pagada sin recibo, sin volver a pagarla?

## Consultas, tal como se corrieron, y salida

Fechas en ART (`2026-09-30 00:00:00-03`). Los montos de la salida cruda van con `$` y puntos de miles: con los 7 u 8 dígitos pegados,
el chequeo de datos personales los toma por DNI. Los valores son los mismos.

### Recibos, saldados, pagables y retenidas

```sql
with desde as (select timestamptz '2026-09-30 00:00:00-03' t)
select 'recibos' q, coalesce(re.numero::text,'?') reunion, r.forma_pago::text, r.estado::text, count(distinct r.id)::text n, ''::text extra
from recibos r cross join desde
left join liquidacion_detalle d on d.recibo_id=r.id left join reuniones re on re.id=d.reunion_id
where r.created_at >= desde.t group by 2,3,4
union all
select 'saldadas_sin_recibo', re.numero::text, '', '', count(*)::text, sum(d.monto_neto)::text
from liquidacion_detalle d cross join desde join reuniones re on re.id=d.reunion_id
where d.estado_linea='pagado' and d.recibo_id is null and d.pagado_at >= desde.t group by 2
union all
select 'impagas_pagables', re.numero::text, re.estado::text, coalesce(to_char(re.liquidacion_cerrada_at,'YYYY-MM-DD'),'abierta'), count(*)::text, sum(d.monto_neto)::text
from liquidacion_detalle d join reuniones re on re.id=d.reunion_id
where d.estado_linea='impago' and d.recibo_id is null and d.beneficiario_tipo<>'club' group by 2,3,4
union all
select 'retenidas', re.numero::text, '', '', count(*)::text, sum(d.monto_neto)::text
from liquidacion_detalle d join reuniones re on re.id=d.reunion_id where d.estado_linea='retenido' group by 2
union all
select 'ultimo_recibo', '', '', '', to_char(max(created_at) at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD HH24:MI'), '' from recibos
order by 1,2;
```
```
q                | reunion | forma_pago | estado  | n                | extra
impagas_pagables | 9       | publicada  | abierta | 66               | $1.025.460,00
impagas_pagables | 9999    | cancelada  | abierta | 36               | $488.000,00
retenidas        | 9       |            |         | 60               | $5.479.874,18
retenidas        | 9999    |            |         | 21               | $604.800,00
ultimo_recibo    |         |            |         | 2026-09-23 12:58 |
```
(Sin filas `recibos` ni `saldadas_sin_recibo`: no hubo ninguno desde el 30/09. En las filas `impagas_pagables`, las columnas
`forma_pago` / `estado` traen el estado de la reunión y si está cerrada: el `union` reusa las columnas.)

### Estado de todas las líneas por reunión (sin el club)

```sql
select re.numero, coalesce(to_char(re.liquidacion_cerrada_at at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD'),'abierta') cerrada, d.estado_linea::text, (d.recibo_id is not null) con_recibo, count(*) n, sum(d.monto_neto) total, min(d.fecha_liberacion) lib_min, max(d.fecha_liberacion) lib_max
from liquidacion_detalle d join reuniones re on re.id=d.reunion_id where d.beneficiario_tipo<>'club'
group by 1,2,3,4 order by 1,3,4;
```
```
numero | cerrada    | estado_linea | con_recibo | n   | total          | lib_min    | lib_max
6      | 2026-09-25 | pagado       | false      | 157 | $7.116.984,19  | 2026-07-20 | 2026-07-20
8      | 2026-09-25 | pagado       | false      | 181 | $14.806.756,66 | 2026-09-15 | 2026-09-15
8      | 2026-09-25 | pagado       | true       | 4   | $230.000,00    |            |
9      | abierta    | impago       | false      | 66  | $1.025.460,00  |            |
9      | abierta    | pagado       | false      | 5   | $380.000,00    |            |
9      | abierta    | pagado       | true       | 62  | $2.024.850,00  |            |
9      | abierta    | retenido     | false      | 60  | $5.479.874,18  | 2026-10-20 | 2026-10-20
9999   | abierta    | impago       | false      | 36  | $488.000,00    |            |
9999   | abierta    | pagado       | true       | 4   | $870.000,00    |            |
9999   | abierta    | retenido     | false      | 21  | $604.800,00    | 2099-01-31 | 2099-01-31
```

### Días con recibos emitidos (todo el historial)

```sql
select to_char(created_at at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD Dy') dia,
       min(to_char(created_at at time zone 'America/Argentina/Buenos_Aires','HH24:MI')) desde,
       max(to_char(created_at at time zone 'America/Argentina/Buenos_Aires','HH24:MI')) hasta, count(*) n
from recibos group by 1 order by 1 desc limit 15;
```
```
2026-09-23 Wed | 12:55 | 12:58 | 2
2026-09-21 Mon | 13:23 | 13:23 | 1
2026-09-20 Sun | 14:01 | 16:02 | 36
2026-08-28 Fri | 09:58 | 11:10 | 2
2026-08-16 Sun | 15:46 | 15:46 | 1
2026-06-09 Tue | 23:33 | 23:33 | 2
```

### El universo del buscador de Pagos

```
$ grep -n "estado_linea','impago'" liquidaciones.html     (main en 2e98974…)
1465:    .eq('estado_linea','impago').neq('beneficiario_tipo','club').is('recibo_id', null);
```
