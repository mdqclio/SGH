# Incentivo de jockey en R9 — ¿duplicado? (versión anonimizada)

- **Original**: informe del 2026-09-24 que quedó **sólo en la rama local vieja** de `reports` (commit
  `cf8461cfab3cf703e4bf07bdad747bdfe3062be7`, 20:06 UTC), 35 minutos antes de que `origin/reports` se recreara sin historia
  con sólo informes anonimizados. Nunca se publicó. Hoy la rama local vieja está en un bundle fuera del repo (ver
  `docs/diagnosticos/2026-10-02_cierre-pendientes-pr36-bundle.md`).
- **Esta versión** (2026-10-02): el mismo texto, con los nombres reemplazados (ver § Anonimización). Las consultas, los ids
  y las salidas son los del 24/09: es una **foto de esa fecha**.
- Código leído entonces: `main` en `dac2da86a18c07566b85a9337964da2d4ac464be`. Guards de entonces: `pwd`, `count(*) FROM spcs` = 210,
  proyecto `unlhcuanfrtpatoipwve`. Hoy: `main` en `054d70b945d0982a3dd57c659cf00efc472ed449`.
- R9 = `cafa37d6-89f4-45cb-a0d9-835bc27407e9`. **SOLO LECTURA** (entonces y ahora).

## Por qué se publica

`2026-09-24_pagos-vista-incentivo-y-pagados.md` (PR #12, mergeado en `a4ec2ad`) cubre **el arreglo de pantalla** (§ 3
de este informe: el incentivo se cuenta una sola vez en la vista por carrera). **No** cubre:

- § 1–2: que **en la base no hay duplicado** (20 líneas = 20 jockeys en R9; **0 de 64** pares reunión-jockey repetidos
  en toda la base);
- § 4: que **Resumen no duplica**;
- § 5: **por dónde el motor SÍ podría generar un duplicado real**, con la pregunta abierta 2 (error del DELETE, recálculos
  concurrentes, sin UNIQUE) y la 3 (ISSUE-085: `concepto` exacto al crear incentivos a mano).

### Estado al 2026-10-02 de lo que quedó abierto (medido contra `main`)

| Punto de § 5 | Hoy |
|---|---|
| 1. DELETE del motor sin chequeo de error | **Sigue igual**: `liquidaciones-engine.js:338` (`await sb.from('liquidacion_detalle').delete()…` sin mirar `error`) |
| 2. Sin lock entre recálculos | Sigue igual (no hay advisory lock ni RPC del motor) |
| 3. Sin UNIQUE parcial para el incentivo por reunión | Sigue igual (ninguna migración en `main` lo crea) |
| 4. Incentivo a mano con otro `concepto` (ISSUE-085) | ISSUE-085 sigue en `docs/ISSUES.md:2332`; no hay nota sobre el `concepto` exacto |
| Ninguno de los cuatro tiene ISSUE propio | — |

Pregunta: ¿se abre un ISSUE para los puntos 1–3 del motor y se agrega la nota del `concepto` exacto a ISSUE-085?

## Anonimización

- Jockeys: `J01`…`J20` en el orden de la tabla del § 2 (por cantidad de líneas y montas); los dos del pedido son
  **`J07`** y **`J09`**; los dos con línea creada a mano son **`J19`** y **`J20`**; el de un saldado administrativo, **`J10`**.
  Homónimos del control del § 1: `J21` (otro jockey) y `E01`–`E03` (entrenadores); el apellido compartido va como `<J07>`.
- Caballos: `<caballo A>`…`<caballo E>`.
- La tabla de tokens a nombres **no** está en este informe. Se reconstruye con las consultas del § 1 y § 2 (devuelven los
  ids, que sí están).
- Control: búsqueda sin distinguir mayúsculas de los 20 apellidos, sus nombres y los 5 caballos sobre el texto final →
  0 coincidencias. Las palabras en mayúsculas que quedan son vocabulario (SELECT, DELETE, VISTA, CARRERA, REGULARIZACION…).
- Los montos de 7 dígitos de las salidas crudas se reescribieron con `$` y puntos de miles (el regex de datos personales los
  toma por DNI): el valor es el mismo.
- 7 uuid (6 distintos) tenían un grupo de sólo dígitos que el mismo regex toma por teléfono; van como `<uuid …últimos 12>`.
  El uuid completo sale de la consulta de la sección donde aparece.
- El nombre del paquete npm del script de § 3 y el separador entre `main` y su SHA se reescribieron por el mismo motivo (el arroba).

---

## Respuesta corta (para Valeria)

1. **En la base NO hay duplicado.** J07 tiene **1** línea de incentivo (60.000, impago, sin recibo). J09 tiene **1** línea (60.000, impago, sin recibo). Las dos con `inscripcion_id` y `carrera_id` NULL (por diseño: es por reunión).
2. **Nadie en R9 tiene más de una línea de incentivo.** 20 líneas = 20 jockeys distintos. De esos 20: 18 corrieron (largaron ≥1 vez en las 5 carreras oficiales) + 2 líneas creadas a mano el 20/09 (J19 y J20: montas que no se corrieron, criterio Fede "haya corrido o no", pagadas con recibo manual). En toda la base: 64 líneas de incentivo de jockey y **0** pares (reunión, jockey) repetidos.
3. **El duplicado es de PANTALLA, en Pagos → vista por carrera.** `cobLineasDeCarrera` mete la línea del incentivo en CADA carrera donde el jockey montó y largó, y `cobArmarVistaCarrera` la suma al "Pagable" del caballo. J07 aparece en la Carrera 1 (bajo <caballo A>) y en la Carrera 5 (bajo <caballo B>); J09 en la Carrera 3 (<caballo D>) y en la Carrera 5 (<caballo E>). Es la **misma** línea (mismo id). Si se suman los "Pagable" de las carreras 1 a 8, da **$1.028.700** contra **$908.700** reales: **$120.000 de más** (= 60.000 de J07 + 60.000 de J09). Al pagar desde cualquiera de las dos vistas se paga una vez sola (el botón Pagar abre el detalle por persona, que es por id de línea) y desaparece de las dos.
4. **Resumen NO duplica.** Suma por línea y agrupa por beneficiario (`beneficiario_tipo|beneficiario_id`); el incentivo entra una vez. R9 hoy: Pendiente de cobrar **$908.700** (27 líneas), Retenido **$5.032.537,52**. Es lo que Valeria puede usar para contar deuda. También sirve la vista de Pagos **sin carrera elegida** (tarjetas por persona): agrupa igual, una vez.
5. **El motor genera 1 sola línea por jockey por reunión** (Set de jockeys + clave paid-safe). Hay dos caminos teóricos a un duplicado real, ninguno ocurrido hoy (ver § 5): el DELETE sin chequeo de error y dos recálculos concurrentes, más la falta de UNIQUE en la tabla.

---

## 1. J07 y J09 — líneas de incentivo en R9

Query (tal como se corrió):

```sql
select p.id prof_id, p.apellido, p.nombre, p.tipo, d.id linea_id, d.monto_bruto, d.monto_neto, d.estado_linea, d.recibo_id, r.numero_recibo, r.estado recibo_estado, d.pagado_at, d.concepto, d.descripcion, d.inscripcion_id, d.carrera_id, d.liquidacion_id, d.orden_display
from liquidacion_detalle d join profesionales p on p.id=d.beneficiario_id
left join recibos r on r.id=d.recibo_id
where d.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and d.concepto_tipo='incentivo_jockey'
and (p.apellido ilike '%<apellido de J07>%' or p.apellido ilike '%<apellido de J09>%' or p.nombre ilike '%<apellido de J07>%' or p.nombre ilike '%<apellido de J09>%')
order by p.apellido, d.id;
```

Salida cruda:

```json
[{"prof_id":"70907ee8-7c1b-45d6-9821-d55f344c05a6","apellido":"<J07>","nombre":"<J07>","tipo":"jockey","linea_id":"5690c007-89c1-4aa0-88ed-01ec06443234","monto_bruto":"60000.00","monto_neto":"60000.00","estado_linea":"impago","recibo_id":null,"numero_recibo":null,"recibo_estado":null,"pagado_at":null,"concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","inscripcion_id":null,"carrera_id":null,"liquidacion_id":"4544f672-2161-47a9-b46b-7e79e14ca22e","orden_display":2},
 {"prof_id":"8f24be30-e951-4287-82bd-2db54d0e32dc","apellido":"<J09>","nombre":"<J09>","tipo":"jockey","linea_id":"17ccf4fe-5e07-4d3c-8b40-d24f9d19b5e7","monto_bruto":"60000.00","monto_neto":"60000.00","estado_linea":"impago","recibo_id":null,"numero_recibo":null,"recibo_estado":null,"pagado_at":null,"concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","inscripcion_id":null,"carrera_id":null,"liquidacion_id":"<uuid …7f7f8aaf94b8>","orden_display":3}]
```

Control de homónimos (no hay otro jockey homónimo de J07 con línea — J21 es otro jockey con el mismo apellido y no tiene incentivo en R9):

```sql
select p.apellido, p.nombre, p.id, p.tipo, p.activo from profesionales p where p.apellido ilike '%<apellido de J07>%' or p.apellido ilike '%<apellido de J09>%' or p.nombre ilike '%<apellido de J07>%' or p.nombre ilike '%<apellido de J09>%' order by 1;
```

```json
[{"apellido":"<J07>","nombre":"<E01>","id":"<uuid …6ed4bcbbed0c>","tipo":"entrenador","activo":true},{"apellido":"<J07>","nombre":"<E02>","id":"93c8d7d6-5977-4bef-88fc-939d3668d94b","tipo":"entrenador","activo":true},{"apellido":"<J07>","nombre":"<E03>","id":"7e2d0cf0-d94d-47a8-ad1b-0e88f15bd005","tipo":"entrenador","activo":true},{"apellido":"<J07>","nombre":"<J07>","id":"70907ee8-7c1b-45d6-9821-d55f344c05a6","tipo":"jockey","activo":true},{"apellido":"<J07>","nombre":"<J21>","id":"654dc3ea-5c90-46cd-a579-eb0efa3bd1c0","tipo":"jockey","activo":true},{"apellido":"<J09>","nombre":"<J09>","id":"8f24be30-e951-4287-82bd-2db54d0e32dc","tipo":"jockey","activo":true}]
```

Todo lo de R9 de esos dos (para que Valeria cuadre):

```sql
select p.apellido||', '||p.nombre benef, d.concepto_tipo, d.estado_linea, count(*) n, sum(d.monto_neto) total
from liquidacion_detalle d join profesionales p on p.id=d.beneficiario_id
where d.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and d.beneficiario_id in ('70907ee8-7c1b-45d6-9821-d55f344c05a6','8f24be30-e951-4287-82bd-2db54d0e32dc')
group by 1,2,3 order by 1,2,3;
```

```json
[{"benef":"J07","concepto_tipo":"premio","estado_linea":"retenido","n":1,"total":"96500.00"},{"benef":"J07","concepto_tipo":"incentivo_jockey","estado_linea":"impago","n":1,"total":"60000.00"},{"benef":"J09","concepto_tipo":"premio","estado_linea":"impago","n":1,"total":"14300.00"},{"benef":"J09","concepto_tipo":"premio","estado_linea":"retenido","n":1,"total":"20583.33"},{"benef":"J09","concepto_tipo":"incentivo_jockey","estado_linea":"impago","n":1,"total":"60000.00"}]
```

Lo pagable hoy (impago): J07 **$60.000** (sólo el incentivo; su premio está retenido por doping, $96.500). J09 **$74.300** ($60.000 incentivo + $14.300 premio); retenido $20.583,33.

**¿A qué carrera/inscripción quedan asociadas?** A ninguna en la base: `inscripcion_id` y `carrera_id` NULL. La pantalla las ubica por las montas que largaron: J07 largó en C1 y C5, J09 en C3 y C5 (§ 2).

## 2. Todos los jockeys de R9

Query:

```sql
with inc as (
 select d.beneficiario_id, count(*) n, sum(d.monto_neto) total,
  string_agg(d.estado_linea::text || case when d.recibo_id is not null then '+recibo' else '' end, ',') estados,
  count(*) filter (where d.recibo_id is not null or d.estado_linea='pagado') comprometidas
 from liquidacion_detalle d where d.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and d.concepto_tipo='incentivo_jockey' group by 1),
larg as (
 select i.jockey_titular_id jid,
  count(*) montas_largaron,
  string_agg(coalesce(ca.numero_carrera_programa,ca.numero_turno)::text || case when res.estado::text='oficial' then '' else '('||res.estado::text||')' end, ',' order by coalesce(ca.numero_carrera_programa,ca.numero_turno)) carreras
 from inscripciones i join carreras ca on ca.id=i.carrera_id
 join resultado_posiciones rp on rp.inscripcion_id=i.id
 join resultados res on res.id=rp.resultado_id
 where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.estado='ratificado' and rp.no_largo=false and i.jockey_titular_id is not null
 group by 1)
select p.apellido||', '||p.nombre jockey, coalesce(inc.beneficiario_id,larg.jid) id, coalesce(inc.n,0) lineas_inc, inc.total, inc.comprometidas, inc.estados, larg.montas_largaron, larg.carreras
from inc full join larg on larg.jid=inc.beneficiario_id
left join profesionales p on p.id=coalesce(inc.beneficiario_id,larg.jid)
order by lineas_inc desc, montas_largaron desc nulls last, 1;
```

Salida cruda (`carreras` = número de carrera de programa donde largó):

```json
[{"jockey":"J01","id":"7dcddbdb-52dc-4f56-8010-0fc8a5de9dcb","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado+recibo","montas_largaron":3,"carreras":"2,3,4"},
 {"jockey":"J02","id":"484361c0-abb5-41af-b20e-3090535cb075","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado+recibo","montas_largaron":3,"carreras":"1,3,4"},
 {"jockey":"J03","id":"b3072f82-9d29-4d61-8e0b-98a606cf2f02","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado+recibo","montas_largaron":3,"carreras":"1,2,5"},
 {"jockey":"J04","id":"005caa02-fc91-45b3-9ae6-6f55d989fa2e","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado+recibo","montas_largaron":2,"carreras":"4,5"},
 {"jockey":"J05","id":"b4727bd1-9808-40cf-8467-772c4a8b8539","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado+recibo","montas_largaron":2,"carreras":"3,5"},
 {"jockey":"J06","id":"0bbe6666-bdf5-446b-8ee2-5279eafdc844","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado+recibo","montas_largaron":2,"carreras":"1,2"},
 {"jockey":"J07","id":"70907ee8-7c1b-45d6-9821-d55f344c05a6","lineas_inc":1,"total":"60000.00","comprometidas":0,"estados":"impago","montas_largaron":2,"carreras":"1,5"},
 {"jockey":"J08","id":"7381c730-f95c-459f-8b24-41637300f117","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado+recibo","montas_largaron":2,"carreras":"2,4"},
 {"jockey":"J09","id":"8f24be30-e951-4287-82bd-2db54d0e32dc","lineas_inc":1,"total":"60000.00","comprometidas":0,"estados":"impago","montas_largaron":2,"carreras":"3,5"},
 {"jockey":"J10","id":"0b2c6b27-3343-4e7f-b4f7-c0674e225466","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado","montas_largaron":1,"carreras":"5"},
 {"jockey":"J11","id":"a66df20c-cd72-4125-a1d7-b32e48fcf037","lineas_inc":1,"total":"60000.00","comprometidas":0,"estados":"impago","montas_largaron":1,"carreras":"2"},
 {"jockey":"J12","id":"17ea2904-ce23-4ba1-94be-202b1f62eb50","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado+recibo","montas_largaron":1,"carreras":"1"},
 {"jockey":"J13","id":"cef0b9b0-8456-4bed-9751-db0457483d27","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado+recibo","montas_largaron":1,"carreras":"1"},
 {"jockey":"J14","id":"fa2bf88c-dad6-435a-a5fc-a45b70e0b8d0","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado+recibo","montas_largaron":1,"carreras":"2"},
 {"jockey":"J15","id":"3fc8f1fd-44be-417b-83ed-578d4f32be6a","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado+recibo","montas_largaron":1,"carreras":"2"},
 {"jockey":"J16","id":"f6637123-af74-42ae-81e1-d5b9fed88fc9","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado+recibo","montas_largaron":1,"carreras":"2"},
 {"jockey":"J17","id":"9a8af6b4-afeb-4dbb-b7a4-5399e0cd9de9","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado+recibo","montas_largaron":1,"carreras":"2"},
 {"jockey":"J18","id":"674157cf-9393-419e-bf50-0881802b785e","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado+recibo","montas_largaron":1,"carreras":"2"},
 {"jockey":"J19","id":"9ba2e954-fb72-41ac-bc28-b26e5348f28f","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado","montas_largaron":null,"carreras":null},
 {"jockey":"J20","id":"421a3eed-404a-43e7-9491-2a008bcfca8a","lineas_inc":1,"total":"60000.00","comprometidas":1,"estados":"pagado","montas_largaron":null,"carreras":null}]
```

Detalle línea por línea (id, recibo, concepto):

```sql
select p.apellido||', '||p.nombre jockey, d.id, d.concepto, d.descripcion, d.monto_neto, d.estado_linea, d.recibo_id, r.numero_recibo, r.estado rec_estado, d.pagado_at, d.inscripcion_id, d.carrera_id, d.posicion, d.liquidacion_id, l.profesional_id = d.beneficiario_id header_ok, d.orden_display
from liquidacion_detalle d join profesionales p on p.id=d.beneficiario_id
left join recibos r on r.id=d.recibo_id left join liquidaciones l on l.id=d.liquidacion_id
where d.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and d.concepto_tipo='incentivo_jockey' order by 1;
```

```json
[{"jockey":"J10","id":"c8b0fe0a-e9c0-48bc-b4af-4ef4483e85bc","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00 [REGULARIZACION 2026-09-20: pagado con recibo manual N° 0488 durante R9 (reunión suspendida tras la 5ª carrera); sin recibo del sistema; estado previo=impago]","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":null,"numero_recibo":null,"rec_estado":null,"pagado_at":"2026-09-20 21:00:00+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"5771a3ed-ff0e-4b2b-8614-be4914a6b1d4","header_ok":true,"orden_display":1},
 {"jockey":"J11","id":"8e4f9cb3-92ca-4b73-b2c8-6bcece1b279a","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"impago","recibo_id":null,"numero_recibo":null,"rec_estado":null,"pagado_at":null,"inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"4d154123-4c28-4468-bf56-0eeadbf7f002","header_ok":true,"orden_display":1},
 {"jockey":"J12","id":"009414d7-9fec-46ba-ba55-0d7efe96efa1","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":"66e28a37-f80e-44cd-b3dd-fd881e6a6908","numero_recibo":33,"rec_estado":"emitido","pagado_at":"2026-09-20 17:01:15.179447+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"0b6026ae-2ff6-4d73-8c29-84f6890c2bf7","header_ok":true,"orden_display":2},
 {"jockey":"J01","id":"<uuid …b23922288e9b>","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":"82edda6f-584e-4308-9f82-f928996b8c67","numero_recibo":57,"rec_estado":"emitido","pagado_at":"2026-09-20 18:31:13.321756+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"cb9fa21a-b3ab-435f-90f5-e9314f863d3f","header_ok":true,"orden_display":3},
 {"jockey":"J04","id":"efa5e4ef-3838-4bd6-8430-12641148668e","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":"e183f308-e86e-4884-9df1-94d9e65792fd","numero_recibo":60,"rec_estado":"emitido","pagado_at":"2026-09-20 18:46:41.821048+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"d743052f-d5aa-4815-82aa-f699cab81a66","header_ok":true,"orden_display":2},
 {"jockey":"J19","id":"<uuid …c4dc566262b5>","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00 [REGULARIZACION 2026-09-20: línea creada a mano — pagado con recibo manual N° 0487 durante R9 (reunión suspendida tras la 5ª carrera); su monta no se corrió y el motor no la genera; criterio Fede 21/09: corresponde haya corrido o no; sin recibo del sistema; estado previo=(inexistente)]","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":null,"numero_recibo":null,"rec_estado":null,"pagado_at":"2026-09-20 21:00:00+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"0134897c-1598-4bf2-b5b1-3e5fe3acf4d4","header_ok":true,"orden_display":1},
 {"jockey":"J05","id":"893919df-5bfc-4166-9ec5-ed72d40d1955","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":"c03df6e6-692f-4a5a-9264-5e33f12089d0","numero_recibo":63,"rec_estado":"emitido","pagado_at":"2026-09-20 18:51:48.490846+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"d5c53d93-a1d6-400a-a0e0-c1c9aa49f7f7","header_ok":true,"orden_display":2},
 {"jockey":"J13","id":"9c3c8011-663d-479f-87b3-8a8390a7d764","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":"d3286577-d72a-43fe-8c39-7400720ee812","numero_recibo":65,"rec_estado":"emitido","pagado_at":"2026-09-20 18:54:58.421377+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"439c82f9-7a12-4ca2-9dcc-f78d448c1544","header_ok":true,"orden_display":2},
 {"jockey":"J06","id":"36da53cb-a408-44f9-bd12-65f408174c55","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":"<uuid …2492dd598557>","numero_recibo":59,"rec_estado":"emitido","pagado_at":"2026-09-20 18:34:45.753071+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"d8aeb8d4-2ac3-4ef5-bf67-8c120a663232","header_ok":true,"orden_display":3},
 {"jockey":"J07","id":"5690c007-89c1-4aa0-88ed-01ec06443234","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"impago","recibo_id":null,"numero_recibo":null,"rec_estado":null,"pagado_at":null,"inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"4544f672-2161-47a9-b46b-7e79e14ca22e","header_ok":true,"orden_display":2},
 {"jockey":"J14","id":"e92d05f7-6696-44ea-b74a-bdf943af4dce","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":"<uuid …839b76c3aa48>","numero_recibo":66,"rec_estado":"emitido","pagado_at":"2026-09-20 18:56:23.273753+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"61756f23-96c8-457c-b82c-b6a7de55c84b","header_ok":true,"orden_display":2},
 {"jockey":"J08","id":"050ba25f-5cf2-467a-8576-bcdf38dc2950","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":"f14bf1e4-bffb-4b99-a841-2857b5d690e1","numero_recibo":64,"rec_estado":"emitido","pagado_at":"2026-09-20 18:53:57.725013+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"2529e973-353b-41a4-91f7-bc38abe74f73","header_ok":true,"orden_display":2},
 {"jockey":"J20","id":"c31d73ce-f012-466c-925c-2c1a719ff7ad","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00 [REGULARIZACION 2026-09-20: línea creada a mano — pagado con recibo manual N° 0486 durante R9 (reunión suspendida tras la 5ª carrera); su monta no se corrió y el motor no la genera; criterio Fede 21/09: corresponde haya corrido o no; sin recibo del sistema; estado previo=(inexistente)]","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":null,"numero_recibo":null,"rec_estado":null,"pagado_at":"2026-09-20 21:00:00+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"079a07ad-faef-4284-a2d7-250f696b1104","header_ok":true,"orden_display":1},
 {"jockey":"J15","id":"7171fad5-3d8b-40dc-b7eb-f8575e96a864","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":"c23d69ce-871b-4343-85e6-4da99073a41e","numero_recibo":44,"rec_estado":"emitido","pagado_at":"2026-09-20 17:54:27.009334+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"72031f7c-724b-4ff7-919d-1103e45d2a1e","header_ok":true,"orden_display":1},
 {"jockey":"J09","id":"17ccf4fe-5e07-4d3c-8b40-d24f9d19b5e7","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"impago","recibo_id":null,"numero_recibo":null,"rec_estado":null,"pagado_at":null,"inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"<uuid …7f7f8aaf94b8>","header_ok":true,"orden_display":3},
 {"jockey":"J16","id":"34ef4676-564b-477c-9db7-395eb5811d86","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":"92704b6d-5a3d-4fe6-acb3-16c5477ed799","numero_recibo":49,"rec_estado":"emitido","pagado_at":"2026-09-20 18:06:27.144994+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"f83c72a8-a7cd-43b9-9ba4-8a7831316878","header_ok":true,"orden_display":2},
 {"jockey":"J02","id":"c33816aa-65d2-4eff-8c99-29d52439620b","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":"c05b1bb2-f94a-4f6b-b72c-89b27268d7c0","numero_recibo":55,"rec_estado":"emitido","pagado_at":"2026-09-20 18:25:47.162224+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"ba332df5-8052-46d2-ad0b-bf2ffa74c2b6","header_ok":true,"orden_display":4},
 {"jockey":"J17","id":"89a74c8d-2528-441f-a8c0-a14d227df859","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":"09fd029f-e9fd-48af-9417-e954a790d634","numero_recibo":39,"rec_estado":"emitido","pagado_at":"2026-09-20 17:37:22.350174+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"9154cebb-8eae-4fbc-9ac1-8e35e367e97b","header_ok":true,"orden_display":1},
 {"jockey":"J03","id":"a27b61b0-3a23-409b-a03f-07e37e6e635f","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":"5f062f1d-a2f5-43cd-8c95-23376aa66d87","numero_recibo":68,"rec_estado":"emitido","pagado_at":"2026-09-20 19:02:48.712518+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"5abe9357-9fcb-4b54-9bd7-a7e56522dd2d","header_ok":true,"orden_display":2},
 {"jockey":"J18","id":"c9c1cdce-c685-4c0e-914c-296d56fb8b71","concepto":"Incentivo jockey","descripcion":"Incentivo jockey por actuación en la reunión: $60.000,00","monto_neto":"60000.00","estado_linea":"pagado","recibo_id":"d9aa22a4-e728-498f-bd2e-5d0a7bd47427","numero_recibo":51,"rec_estado":"emitido","pagado_at":"2026-09-20 18:15:51.087774+00","inscripcion_id":null,"carrera_id":null,"posicion":null,"liquidacion_id":"0cacb4b7-014f-468c-a9e3-86123b7191c6","header_ok":true,"orden_display":2}]
```

Controles globales:

```sql
select 'headers_por_actor_dup' chk, count(*) from (select coalesce(profesional_id,propietario_id) a, count(*) from liquidaciones where reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' group by 1 having count(*)>1) x
union all select 'inc_jockey_dup_todas_reuniones', count(*) from (select reunion_id, beneficiario_id from liquidacion_detalle where concepto_tipo='incentivo_jockey' group by 1,2 having count(*)>1) y
union all select 'inc_jockey_total_todas', count(*) from liquidacion_detalle where concepto_tipo='incentivo_jockey'
union all select 'r9_jockeys_distintos_largaron', count(distinct i.jockey_titular_id) from inscripciones i join carreras ca on ca.id=i.carrera_id join resultado_posiciones rp on rp.inscripcion_id=i.id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.estado='ratificado' and rp.no_largo=false
union all select 'r9_resultados_oficiales', count(*) from resultados res join carreras ca on ca.id=res.carrera_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and res.estado='oficial'
union all select 'r9_jockeys_con_monta_ratificada', count(distinct i.jockey_titular_id) from inscripciones i join carreras ca on ca.id=i.carrera_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.estado='ratificado';
```

```json
[{"chk":"headers_por_actor_dup","count":0},{"chk":"inc_jockey_dup_todas_reuniones","count":0},{"chk":"inc_jockey_total_todas","count":64},{"chk":"r9_jockeys_distintos_largaron","count":18},{"chk":"r9_resultados_oficiales","count":5},{"chk":"r9_jockeys_con_monta_ratificada","count":24}]
```

```sql
-- ¿alguna línea de incentivo de R9 colgada de un header de otra reunión/club? (el motor no la vería → podría duplicar)
select d.id, l.reunion_id = d.reunion_id same_reunion, l.club_id, l.estado from liquidacion_detalle d join liquidaciones l on l.id=d.liquidacion_id where d.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and d.concepto_tipo='incentivo_jockey' and (l.reunion_id is distinct from d.reunion_id or l.club_id <> '0649e9c5-9e87-4aad-842f-101458e6b33c');
```

```json
[]
```

**Números de resumen § 2**

| | |
|---|---|
| Líneas de incentivo de jockey en R9 | **20** (20 × $60.000 = $1.200.000) |
| Jockeys distintos con línea | **20** — nadie con más de una |
| Jockeys distintos que largaron (5 carreras oficiales) | **18** |
| Líneas sin monta largada (creadas a mano, ISSUE-085) | 2: J19, J20 (pagado, recibo manual 0487/0486) |
| Jockeys con monta ratificada en R9 (incluye carreras suspendidas) | 24 → 4 sin línea (no largaron: sus carreras no se corrieron) + los 2 manuales ya cubiertos |
| Pendientes (impago) | 3: J07, J09, J11 = $180.000 |
| Comprometidas | 17 (14 con recibo del sistema, 3 saldado administrativo sin recibo: J10, J19, J20) |
| Duplicados (reunión, jockey) en toda la base | **0** de 64 líneas |

## 3. El duplicado de pantalla: `cobLineasDeCarrera` / `cobArmarVistaCarrera`

Sí: el incentivo no tiene `inscripcion_id`, así que la vista por carrera lo engancha en **cada** carrera donde el jockey montó y largó. Está así **por diseño** (lo dice el comentario: "si corrió en la 2 y en la 5 aparece en las dos vistas y desaparece de las dos al pagarse"), y el probe `tests/probe_pagos_vista_carrera.mjs` lo cubre para C5. El problema es que el importe entra en el **"Pagable" del caballo** en las dos carreras, así que quien sume carrera por carrera lo cuenta dos veces.

Código (`main:liquidaciones.html:1186 a 1241`):

```js
//   1. inscripcion_id de la carrera            → premio, bono, incentivo_entrenador, actuacion
//   2. sin inscripción pero con carrera_id     → las líneas históricas de premio/bono sin inscripción
//   3. incentivo_jockey de esta reunión cuyo beneficiario está en J (los que largaron acá)
// Sin Set.has(null) en ningún lado: la 1 es falsa para null y la 3 no lo usa.
function cobLineasDeCarrera(lineas, carreraId, reunionId, inscs){
  const inscIds = new Set(inscs.map(i => i.id));
  const J = new Set(inscs.filter(i => i.largo && i.jockey_titular_id).map(i => i.jockey_titular_id));
  return lineas.filter(l =>
       inscIds.has(l.inscripcion_id)
    || (!l.inscripcion_id && l.carrera_id === carreraId)
    || (l.concepto_tipo === 'incentivo_jockey' && l.reunion_id === reunionId && J.has(l.beneficiario_id)));
}

// Armado: bloques por caballo (posición ASC, los sin posición al final por gatera), dentro de
// cada uno los roles en ORDEN_ROLES_VISTA, dentro del rol un sub-bloque por beneficiario, dentro
// del beneficiario las líneas por ORDEN_CONCEPTO_VISTA. Devuelve datos, no HTML (lo prueba el probe).
function cobArmarVistaCarrera(lineasCarrera, inscs, carreraId){
  const porInsc = {};
  for (const i of inscs) porInsc[i.id] = { insc:i, roles:{}, total:0, n:0 };
  const sueltas = { insc:null, roles:{}, total:0, n:0 };   // líneas sin inscripción (puerta 2)
  const meter = (bloque, l, rol) => {
    const r = (bloque.roles[rol] ||= {});
    const k = `${l.beneficiario_tipo}|${l.beneficiario_id}`;
    const b = (r[k] ||= { tipo:l.beneficiario_tipo, id:l.beneficiario_id, nombre:nombreBenef(l.beneficiario_tipo, l.beneficiario_id), lineas:[], total:0 });
    b.lineas.push(l); b.total += parseFloat(l.monto_neto)||0;
    bloque.total += parseFloat(l.monto_neto)||0; bloque.n++;
  };
  for (const l of lineasCarrera) {
    if (l.concepto_tipo === 'incentivo_jockey') {
      // bajo CADA caballo que ese jockey montó y largó en esta carrera
      for (const i of inscs) if (i.largo && i.jockey_titular_id === l.beneficiario_id) meter(porInsc[i.id], l, 'Jockey');
      continue;
    }
    const bloque = porInsc[l.inscripcion_id] || sueltas;
    meter(bloque, l, rolVista(l, bloque.insc));
  }
  const ordenar = bloque => ORDEN_ROLES_VISTA.filter(r => bloque.roles[r]).map(r => ({
    rol: r,
    beneficiarios: Object.values(bloque.roles[r]).map(b => ({
      ...b, lineas: [...b.lineas].sort((a, c) => (ORDEN_CONCEPTO_VISTA[a.concepto_tipo] ?? 9) - (ORDEN_CONCEPTO_VISTA[c.concepto_tipo] ?? 9)),
    })),
  }));
  const bloques = Object.values(porInsc)
    .sort((a, b) => (a.insc.posicion ?? 999) - (b.insc.posicion ?? 999) || (a.insc.numero_partidor ?? 999) - (b.insc.numero_partidor ?? 999))
    .map(b => ({ insc:b.insc, total:b.total, n:b.n, roles: ordenar(b) }));
  if (sueltas.n) bloques.push({ insc:null, total:sueltas.total, n:sueltas.n, roles: ordenar(sueltas) });
  return bloques;
}

// q en la vista filtra BLOQUES: pasa el caballo si su nombre matchea o si algún beneficiario del
// bloque matchea (nombre/DNI o caballeriza, igual que en tarjetas).
function cobBloqueMatch(bloque, q, propIdsPorCaballeriza){
  if (!q) return true;
  if (bloque.insc && cobMatch(q, bloque.insc.caballo)) return true;
  return bloque.roles.some(r => r.beneficiarios.some(b => cobMatch(q, benefSearch(b.tipo, b.id)) || propIdsPorCaballeriza.has(b.id)));
}
```

- Puerta 3 de `cobLineasDeCarrera` (línea 1196): `l.concepto_tipo === 'incentivo_jockey' && l.reunion_id === reunionId && J.has(l.beneficiario_id)` — J = jockeys que largaron **en esta carrera**. No mira si la línea ya se mostró en otra carrera (no puede: cada carrera se arma por separado).
- `cobArmarVistaCarrera` (líneas 1214 a 1217): mete la línea bajo cada caballo de esta carrera que ese jockey montó y largó, y `meter()` suma `monto_neto` a `bloque.total` → ese es el "Pagable" del encabezado del caballo.
- Rótulo en pantalla (`cobRenderVistaCarrera`, línea 1267): "· por reunión — se paga una vez". Avisa, pero el número ya está sumado en el total del caballo.
- Dentro de UNA misma carrera no se duplica (un jockey monta un caballo por carrera).

### Prueba con el código real sobre R9 (solo lectura)

Script `scratchpad/sim_vista.mjs` (copiado temporalmente a `tests/` para resolver el paquete npm de supabase-js y borrado después): extrae de `liquidaciones.html` el bloque entre `// ═══ VISTA POR CARRERA — INICIO` y `— FIN`, lo corre con `AsyncFunction` y la secret key (sólo SELECT), con el mismo universo que `cobrosBuscar` (impago, no club, sin recibo, reunión R9). Stubs: `rolDeLinea` simplificado y `nombreBenef` por tabla — no afectan la selección ni los totales.

```js
// SOLO LECTURA. Corre el código REAL de liquidaciones.html (bloque VISTA POR CARRERA) sobre R9.
import { createClient } from '<paquete npm supabase-js>';   // (nombre del paquete reescrito: el arroba cae en el chequeo de datos personales)
import { readFileSync } from 'node:fs';
const sb = createClient('https://unlhcuanfrtpatoipwve.supabase.co', process.env.SUPABASE_SECRET_KEY, { auth:{persistSession:false} });
const R9 = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9';
const SRC = readFileSync('liquidaciones.html','utf8');
const a = SRC.indexOf('// ═══ VISTA POR CARRERA — INICIO'), b = SRC.indexOf('// ═══ VISTA POR CARRERA — FIN');
const bloque = SRC.slice(a, b);
const nombres = {};
const { data: profs } = await sb.from('profesionales').select('id,apellido,nombre'); for (const p of profs) nombres[p.id] = `${p.apellido}, ${p.nombre}`;
const { data: props } = await sb.from('propietarios').select('id,nombre'); for (const p of props) nombres[p.id] = p.nombre;
const AF = Object.getPrototypeOf(async function(){}).constructor;
const mod = await new AF('sb','rolDeLinea','nombreBenef', bloque + '\nreturn { cobInscripcionesCarrera, cobLineasDeCarrera, cobArmarVistaCarrera };')(
  sb,
  l => l.concepto_tipo === 'incentivo_jockey' ? 'Jockey' : l.concepto_tipo === 'incentivo_entrenador' ? 'Entrenador' : (/Propietario/.test(l.descripcion||'') || l.concepto_tipo==='bono') ? 'Propietario' : /Entrenador/.test(l.descripcion||'') ? 'Entrenador' : /Jockey/.test(l.descripcion||'') ? 'Jockey' : null,
  (t,id) => nombres[id] || id);
// mismo universo que cobrosBuscar: impago, no club, sin recibo, reunión R9
const { data: lineas, error } = await sb.from('liquidacion_detalle')
  .select('id,beneficiario_tipo,beneficiario_id,monto_neto,reunion_id,inscripcion_id,carrera_id,descripcion,concepto,concepto_tipo,liquidaciones(club_id)')
  .eq('estado_linea','impago').neq('beneficiario_tipo','club').is('recibo_id', null).eq('reunion_id', R9);
if (error) throw error;
console.log(`Universo pagable R9 (impago, sin recibo, no club): ${lineas.length} líneas, total ${lineas.reduce((s,l)=>s+ +l.monto_neto,0).toFixed(2)}`);
console.log(`  de ellas incentivo_jockey: ${lineas.filter(l=>l.concepto_tipo==='incentivo_jockey').map(l=>nombres[l.beneficiario_id]+' '+l.id).join(' | ')}`);
const { data: cars } = await sb.from('carreras').select('id,numero_turno,numero_carrera_programa,estado').eq('reunion_id',R9).or('estado.is.null,estado.neq.anulada').order('numero_carrera_programa',{nullsFirst:false}).order('numero_turno');
let sumaVistas = 0; const apariciones = {};
for (const c of cars) {
  const inscs = await mod.cobInscripcionesCarrera(c.id);
  const sel = mod.cobLineasDeCarrera(lineas, c.id, R9, inscs);
  const bloques = mod.cobArmarVistaCarrera(sel, inscs, c.id);
  const totalVista = bloques.reduce((s,bq)=>s+bq.total,0); sumaVistas += totalVista;
  const incs = [];
  for (const bq of bloques) for (const r of bq.roles) for (const be of r.beneficiarios) for (const l of be.lineas)
    if (l.concepto_tipo==='incentivo_jockey') { incs.push(`${be.nombre} [linea ${l.id.slice(0,8)}] bajo ${bq.insc?.caballo}`); (apariciones[l.id] ||= []).push(`C${c.numero_carrera_programa ?? c.numero_turno}`); }
  console.log(`\nCarrera ${c.numero_carrera_programa ?? c.numero_turno} (turno ${c.numero_turno}): ${sel.length} líneas seleccionadas, suma de "Pagable" de los bloques = ${totalVista.toFixed(2)}`);
  for (const x of incs) console.log(`   incentivo_jockey: ${x}`);
}
const totalReal = lineas.reduce((s,l)=>s+ +l.monto_neto,0);
console.log(`\nApariciones de cada línea de incentivo en la vista por carrera:`);
for (const [id, cs] of Object.entries(apariciones)) { const l = lineas.find(x=>x.id===id); console.log(`  ${nombres[l.beneficiario_id]} (${id}): ${cs.length} vista(s) → ${cs.join(', ')}`); }
console.log(`\nSuma de las vistas por carrera (todas): ${sumaVistas.toFixed(2)}`);
console.log(`Total pagable real (líneas únicas):     ${totalReal.toFixed(2)}`);
console.log(`Diferencia (sobreconteo si se suman las vistas): ${(sumaVistas-totalReal).toFixed(2)}`);
```

Comando: `cp $S/sim_vista.mjs tests/.sim_vista_tmp.mjs && set -a && . ./.env && set +a && node tests/.sim_vista_tmp.mjs; rm -f tests/.sim_vista_tmp.mjs` (corrido parado en `main` en dac2da8).

Salida cruda:

```
Universo pagable R9 (impago, sin recibo, no club): 27 líneas, total 908700.00
  de ellas incentivo_jockey: J09 17ccf4fe-5e07-4d3c-8b40-d24f9d19b5e7 | J11 8e4f9cb3-92ca-4b73-b2c8-6bcece1b279a | J07 5690c007-89c1-4aa0-88ed-01ec06443234

Carrera 1 (turno 1): 1 líneas seleccionadas, suma de "Pagable" de los bloques = 60000.00
   incentivo_jockey: J07 [linea 5690c007] bajo <caballo A>

Carrera 2 (turno 4): 5 líneas seleccionadas, suma de "Pagable" de los bloques = 160000.00
   incentivo_jockey: J11 [linea 8e4f9cb3] bajo <caballo C>

Carrera 3 (turno 6): 2 líneas seleccionadas, suma de "Pagable" de los bloques = 130000.00
   incentivo_jockey: J09 [linea 17ccf4fe] bajo <caballo D>

Carrera 4 (turno 5): 4 líneas seleccionadas, suma de "Pagable" de los bloques = 100000.00

Carrera 5 (turno 7): 17 líneas seleccionadas, suma de "Pagable" de los bloques = 578700.00
   incentivo_jockey: J07 [linea 5690c007] bajo <caballo B>
   incentivo_jockey: J09 [linea 17ccf4fe] bajo <caballo E>

Carrera 6 (turno 9): 0 líneas seleccionadas, suma de "Pagable" de los bloques = 0.00

Carrera 7 (turno 3): 0 líneas seleccionadas, suma de "Pagable" de los bloques = 0.00

Carrera 8 (turno 11): 0 líneas seleccionadas, suma de "Pagable" de los bloques = 0.00

Apariciones de cada línea de incentivo en la vista por carrera:
  J07 (5690c007-89c1-4aa0-88ed-01ec06443234): 2 vista(s) → C1, C5
  J11 (8e4f9cb3-92ca-4b73-b2c8-6bcece1b279a): 1 vista(s) → C2
  J09 (17ccf4fe-5e07-4d3c-8b40-d24f9d19b5e7): 2 vista(s) → C3, C5

Suma de las vistas por carrera (todas): $1.028.700,00
Total pagable real (líneas únicas):     908700.00
Diferencia (sobreconteo si se suman las vistas): 120000.00
```

Conclusión § 3: la **línea** es una (mismo id en las dos carreras); lo duplicado es el **importe sumado** en la vista. Sumar los "Pagable" de todas las carreras da **$120.000 de más** hoy (J07 en C1+C5, J09 en C3+C5). J11 corrió una sola vez → no se duplica. Los 17 ya pagados no aparecen (la vista sólo muestra impago). Pagar desde la vista no duplica: el botón abre `cobrosDetalle` por persona y la emisión es por id de línea.

## 4. Resumen: ¿duplica?

**No.** `loadResumen` (`main:liquidaciones.html:861-897`) trae las líneas de la reunión y las suma **una vez cada una**; agrupa por `beneficiario_tipo|beneficiario_id`. No usa carrera para nada.

```js
async function loadResumen(){
  const rid = document.getElementById('res-reunion').value;
  const cont = document.getElementById('res-container');
  if (!rid){ cont.innerHTML = '<div class="empty-state"><div class="icon">📊</div><h3>Elegí una reunión para ver el resumen de cierre</h3></div>'; return; }
  cont.innerHTML = '<div class="loading-state"><div class="spinner"></div> Cargando…</div>';
  const { data, error } = await sb.from('liquidacion_detalle')
    .select('beneficiario_tipo,beneficiario_id,estado_linea,monto_neto,recibo_id,concepto_tipo')
    .eq('reunion_id', rid);
  if (error){ toast(error.message,'error'); cont.innerHTML=''; return; }
  const lineas = data||[];
  const num = v => parseFloat(v)||0;
  let total=0, fondo=0, pagado=0, impago=0, retenido=0;
  const recibos = new Set();
  const pend = {};                     // beneficiario (persona) → {tipo,id,impago,retenido}
  const porConcepto = {};              // concepto_tipo → suma monto_neto (desglose por concepto)
  for (const l of lineas){
    const m = num(l.monto_neto); total += m;
    const ct = l.concepto_tipo || 'otros';
    porConcepto[ct] = (porConcepto[ct]||0) + m;
    if (l.beneficiario_tipo==='club'){ fondo += m; continue; }   // fondo solidario: bucket propio
    if (l.estado_linea==='pagado'){ pagado += m; if (l.recibo_id) recibos.add(l.recibo_id); continue; }
    const k = `${l.beneficiario_tipo}|${l.beneficiario_id}`;
    if (!pend[k]) pend[k] = {tipo:l.beneficiario_tipo, id:l.beneficiario_id, impago:0, retenido:0};
    if (l.estado_linea==='retenido'){ retenido += m; pend[k].retenido += m; }
    else { impago += m; pend[k].impago += m; }                   // 'impago' (default)
  }
  // reconciliación: pagado + impago + retenido + fondo = total liquidado
  const suma = pagado+impago+retenido+fondo;
  const diff = Math.round((total-suma)*100)/100;
  const ok = Math.abs(diff) < 0.01;
  const pendList = Object.values(pend)
    .map(p=>({...p, nombre:nombreBenef(p.tipo,p.id), debe:p.impago+p.retenido}))
    .filter(p=>p.debe > 0.0001)
    .sort((a,b)=>b.debe-a.debe);
  // ── Desglose por concepto (read-only): la suma de conceptos debe dar el Total liquidado.
  const CONCEPTO_LABELS = {
    premio:'Premios', actuacion:'Actuaciones (peón/capataz/sereno)',
```

Lo que muestra Resumen para R9 hoy (mismo cálculo en SQL):

```sql
select
 sum(monto_neto) filter (where beneficiario_tipo<>'club' and estado_linea='impago') resumen_pendiente_impago,
 count(*) filter (where beneficiario_tipo<>'club' and estado_linea='impago') n_impago,
 count(*) filter (where beneficiario_tipo<>'club' and estado_linea='impago' and recibo_id is not null) impago_con_recibo,
 sum(monto_neto) filter (where beneficiario_tipo<>'club' and estado_linea='retenido') resumen_retenido,
 sum(monto_neto) filter (where concepto_tipo='incentivo_jockey') desglose_incentivo_jockey,
 count(*) filter (where concepto_tipo='incentivo_jockey') n_inc_jockey,
 sum(monto_neto) filter (where concepto_tipo='incentivo_jockey' and estado_linea='impago') inc_jockey_impago
from liquidacion_detalle where reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9';
```

```json
[{"resumen_pendiente_impago":"908700.00","n_impago":27,"impago_con_recibo":0,"resumen_retenido":"$5.032.537,52","desglose_incentivo_jockey":"$1.200.000,00","n_inc_jockey":20,"inc_jockey_impago":"180000.00"}]
```

- "Pendiente de cobrar" = **$908.700** = exactamente el total pagable real que da la simulación de § 3 (sin el sobreconteo de $120.000).
- En "Pendientes por beneficiario": J07 impago $60.000 / retenido $96.500; J09 impago $74.300 / retenido $20.583,33 — cada incentivo una vez.
- "Desglose por concepto → Incentivo jockeys" = $1.200.000 = 20 líneas × 60.000 (incluye lo pagado).
- Ojo con un detalle de Resumen que no es duplicado pero sí puede confundir: "Pagado" suma también los saldados administrativos (sin recibo), y el contador "N recibo(s)" sólo cuenta los del sistema.

**Para Valeria mientras tanto:** usar **Resumen**, o Pagos **sin carrera elegida** (tarjetas por persona). No sumar la vista por carrera.

## 5. ¿Puede el motor generar dos líneas de incentivo para el mismo jockey en una reunión?

Motor: `main:liquidaciones-engine.js`. Lo llaman "Recalcular reunión" (liquidaciones.html), oficializar/desoficializar y el cambio de monta (resultados.html).

### Qué lo impide hoy

**(a) Dentro de una corrida — el Set** (`liquidaciones-engine.js:225-253`): una sola línea por jockey aunque haya largado en N carreras.

```js

    // INCENTIVOS (Bloque C) — idéntico a generarLiquidaciones (jockey per-reunión dedup,
    // entrenador per-caballo). Las líneas de incentivo no llevan carrera_id (per-reunión).
    if (incJockey > 0 || incEntr > 0) {
      const { data: largaron } = resIds.length
        ? await sb.from('resultado_posiciones').select('inscripcion_id')
            .in('resultado_id', resIds).eq('no_largo', false)
        : { data: [] };
      const jockeysSet = new Set();
      for (const lp of (largaron || [])) {
        const insc = (inscs || []).find(i => i.id === lp.inscripcion_id);
        if (!insc || insc.estado !== 'ratificado') continue;
        if (incJockey > 0 && insc.jockey_titular_id) jockeysSet.add(insc.jockey_titular_id);
        if (incEntr > 0 && insc.entrenador_id) {
          addActor(insc.entrenador_id, 'entrenador', {
            premio: incEntr, pct: 1, subs: [], conceptoTipo: 'incentivo_entrenador',
            concepto: 'Incentivo entrenador',
            descripcion: `Incentivo entrenador por caballo corrido: ${fmt(incEntr)}`,
            posicion: null, inscripcion_id: insc.id, carrera_id: null,
          });
        }
      }
      if (incJockey > 0) for (const jid of jockeysSet) {
        addActor(jid, 'jockey', {
          premio: incJockey, pct: 1, subs: [], conceptoTipo: 'incentivo_jockey',
          concepto: 'Incentivo jockey',
          descripcion: `Incentivo jockey por actuación en la reunión: ${fmt(incJockey)}`,
          posicion: null, inscripcion_id: null, carrera_id: null,
        });
```

**(b) Entre corridas — borrar lo no comprometido + clave paid-safe** (`:35-41` y `:263-357`): antes de insertar borra todo lo no pagado de la reunión, y no regenera lo que ya está pagado/con recibo si coincide la clave `beneficiario_tipo|beneficiario_id|concepto_tipo|inscripcion_id|posicion|concepto`. Para el incentivo la clave es `profesional|<jockey>|incentivo_jockey|||Incentivo jockey`. Las 3 líneas regularizadas a mano (J10, J19, J20) tienen `concepto = 'Incentivo jockey'` exacto (lo distinto está en `descripcion`, que no entra en la clave) → coinciden y no se duplican.

```js
  // entre dos recálculos: beneficiario + concepto_tipo + caballo/puesto + texto del concepto
  // (el concepto desambigua subs "Peón — X" y premio vs bono del mismo puesto).
  function lineKey(d) {
    return [d.beneficiario_tipo, d.beneficiario_id, d.concepto_tipo,
            d.inscripcion_id || '', d.posicion == null ? '' : d.posicion,
            d.concepto || ''].join('|');
  }
```

```js
      .eq('reunion_id', rid).eq('club_id', clubId);

    const headerByActor = {};   // actorId -> header row
    const paidKeys = new Set(); // claves de líneas comprometidas (no regenerar)
    const paidCountByHeader = {};
    let preserved = 0;
    for (const h of (existingLiqs || [])) {
      const aid = h.propietario_id || h.profesional_id || clubId;
      headerByActor[aid] = h;
      paidCountByHeader[h.id] = 0;
      for (const d of (h.liquidacion_detalle || [])) {
        if (d.estado_linea === 'pagado' || d.recibo_id != null) {
          paidKeys.add(lineKey(d));
          paidCountByHeader[h.id]++;
          preserved++;
        }
      }
    }

    // 2. Borrar SOLO las líneas no comprometidas (recibo_id null AND estado != 'pagado').
    //    Lo pagado se preserva; retenido sin recibo se recalcula.
    const allHeaderIds = (existingLiqs || []).map(h => h.id);
    if (allHeaderIds.length) {
      await sb.from('liquidacion_detalle').delete()
        .in('liquidacion_id', allHeaderIds)
        .is('recibo_id', null)
        .neq('estado_linea', 'pagado');
    }

    // 3. Construir líneas nuevas por actor (idéntico cálculo de detalleRows), saltear las
    //    que coincidan con una línea ya pagada, y adjuntarlas al header (reusado o nuevo).
    let created = 0;
    const survivingHeaderIds = new Set();
    for (const [actorId, actorData] of Object.entries(actorMap)) {
      const cfg = (comCfg || []).find(c => c.tipo_profesional === actorData.tipo || c.tipo_profesional === 'ambos');
      const descPct = ((cfg?.descuento_fondo_solidario_pct || 0) + (cfg?.descuento_incentivo_pct || 0));
      const bTipo = actorData.tipo === 'propietario' ? 'propietario'
                  : actorData.tipo === 'club'        ? 'club'
                  : 'profesional';
      const detalleRows = [];
      for (const item of actorData.items) {
        const bruto = item.premio * item.pct;
        const aplicaDesc = item.conceptoTipo === 'premio';
        const desc = aplicaDesc ? bruto * descPct / 100 : 0;
        const retenido = item.conceptoTipo === 'premio' && (item.posicion === 1 || item.posicion === 2);
        detalleRows.push({
          concepto: item.concepto, descripcion: item.descripcion,
          monto_bruto: bruto, porcentaje_desc: aplicaDesc ? (descPct || null) : null, monto_descuento: desc,
          concepto_tipo: item.conceptoTipo, posicion: item.posicion,
          inscripcion_id: item.inscripcion_id, carrera_id: item.carrera_id ?? null,
          beneficiario_tipo: bTipo, beneficiario_id: actorId, reunion_id: rid,
          estado_linea: retenido ? 'retenido' : 'impago',
          fecha_liberacion: retenido ? fechaLiberacion : null,
        });
        for (const sub of (item.subs || [])) {
          const sb2 = item.premio * sub.pct;
          const sd2 = sb2 * descPct / 100;
          detalleRows.push({
            concepto: `${sub.rol} — ${sub.nombre}`,
            descripcion: `${item.concepto} — A redistribuir (${Math.round(sub.pct * 100)}%)`,
            monto_bruto: sb2, porcentaje_desc: descPct || null, monto_descuento: sd2,
            concepto_tipo: 'actuacion', posicion: item.posicion,
            inscripcion_id: item.inscripcion_id, carrera_id: item.carrera_id ?? null,
            beneficiario_tipo: 'profesional', beneficiario_id: actorId, reunion_id: rid,
            estado_linea: retenido ? 'retenido' : 'impago',
            fecha_liberacion: retenido ? fechaLiberacion : null,
          });
        }
      }
      // Saltear las líneas que ya existen pagadas (no duplicar lo comprometido).
      const freshRows = detalleRows.filter(d => !paidKeys.has(lineKey(d)));

      let header = headerByActor[actorId];
      if (!header) {
        if (!freshRows.length) continue;
        const liqPayload = {
          club_id: clubId, reunion_id: rid, estado: 'borrador',
          total_bruto: 0, total_descuentos: 0,
        };
        if (actorData.tipo === 'propietario') liqPayload.propietario_id = actorId;
        else if (actorData.tipo !== 'club')   liqPayload.profesional_id = actorId;
        const { data: liqData, error } = await sb.from('liquidaciones').insert(liqPayload).select().single();
        if (error) { console.error('[engine] crear liquidación:', error); continue; }
        header = liqData;
        headerByActor[actorId] = liqData;
        paidCountByHeader[header.id] = 0;
        created++;
      }
      survivingHeaderIds.add(header.id);
      if (freshRows.length) {
        const offset = paidCountByHeader[header.id] || 0;
        const dRows = freshRows.map((d, i) => ({ ...d, liquidacion_id: header.id, orden_display: offset + i + 1 }));
        const { error: detErr } = await sb.from('liquidacion_detalle').insert(dRows);
        if (detErr) console.error('[engine] insertar detalle:', detErr);
      }
```

**(c) Cambio de monta — `rpc_cambiar_monta`** (`migrations/rpc_cambiar_monta.sql:236-290`): bloquea `FOR UPDATE` las líneas del saliente, y si era su única monta borra su incentivo no comprometido en la misma transacción; el entrante lo recibe en el recálculo (Set → uno). No inserta incentivos por su cuenta.

### Por dónde SÍ podría aparecer un duplicado real (ninguno ocurrió: 0 de 64)

1. **El DELETE del paso 2 no chequea error** (`liquidaciones-engine.js:286`: `await sb.from('liquidacion_detalle').delete()...` sin mirar `error`). Si el borrado falla (red, timeout, RLS) el motor sigue e inserta igual → todas las líneas no pagadas de la reunión quedan dobles, incentivo incluido. El INSERT sí loguea error; el DELETE ni eso.
2. **Sin transacción ni lock entre corridas.** Dos recálculos de la misma reunión al mismo tiempo (Recalcular en liquidaciones.html en una pestaña + oficializar en resultados.html en otra, o dos usuarios) → ambos leen, ambos borran, ambos insertan → líneas dobles (y hasta dos headers por actor, porque los dos ven "no hay header" y crean uno cada uno).
3. **No hay UNIQUE en la base que lo ataje.** Índices de `liquidacion_detalle`:

```sql
select indexname, indexdef from pg_indexes where tablename='liquidacion_detalle';
```

```json
[{"indexname":"liquidacion_detalle_pkey","indexdef":"CREATE UNIQUE INDEX liquidacion_detalle_pkey ON public.liquidacion_detalle USING btree (id)"},{"indexname":"idx_liqdet_beneficiario","indexdef":"CREATE INDEX idx_liqdet_beneficiario ON public.liquidacion_detalle USING btree (beneficiario_tipo, beneficiario_id, estado_linea)"},{"indexname":"idx_liqdet_recibo","indexdef":"CREATE INDEX idx_liqdet_recibo ON public.liquidacion_detalle USING btree (recibo_id)"},{"indexname":"idx_liqdet_liquidacion","indexdef":"CREATE INDEX idx_liqdet_liquidacion ON public.liquidacion_detalle USING btree (liquidacion_id)"}]
```

   Un índice único parcial `(reunion_id, beneficiario_id) WHERE concepto_tipo='incentivo_jockey'` lo haría imposible. No se aplicó nada (pedido: no corregir).
4. **Línea a mano con otro `concepto`.** Si alguien carga a mano un incentivo pagado con `concepto` distinto de `'Incentivo jockey'` (p.ej. "Incentivo Jockey" o con texto extra) para un jockey que SÍ largó, la clave no coincide y el próximo recálculo crea otra línea impaga → doble cobro posible. Las 3 de hoy están bien. ISSUE-085 ("los que falten se crean a mano") es exactamente ese camino.
5. **Header de otra reunión/club.** El motor sólo ve líneas bajo headers de `reunion_id = R9 AND club_id = Dolores`; una línea R9 colgada de otro header no se vería y se regeneraría. Medido: 0 casos.

RLS (para el punto 1: un usuario que puede INSERT pero no DELETE). Hoy las policies de INSERT y DELETE de `liquidacion_detalle` tienen la **misma** condición, así que un rechazo por RLS afecta a las dos; lo que queda es el fallo de red/timeout.

```sql
select policyname, cmd, roles::text, qual, with_check from pg_policies where tablename in ('liquidacion_detalle','liquidaciones') order by tablename, cmd;
```

```json
[{"policyname":"liquidacion_detalle_delete","cmd":"DELETE","roles":"{authenticated}","qual":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_liquidacion(liquidacion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))","with_check":null},{"policyname":"liquidacion_detalle_insert","cmd":"INSERT","roles":"{authenticated}","qual":null,"with_check":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_liquidacion(liquidacion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))"},{"policyname":"liquidacion_detalle_select","cmd":"SELECT","roles":"{authenticated}","qual":"(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_liquidacion(liquidacion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))) OR (((beneficiario_tipo)::text, beneficiario_id) IN ( SELECT e.entidad_tipo,\n    e.entidad_id\n   FROM fn_mis_entidades() e(entidad_tipo, entidad_id))))","with_check":null},{"policyname":"liquidacion_detalle_update","cmd":"UPDATE","roles":"{authenticated}","qual":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_liquidacion(liquidacion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))","with_check":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_liquidacion(liquidacion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))"},{"policyname":"liquidaciones_delete","cmd":"DELETE","roles":"{authenticated}","qual":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))","with_check":null},{"policyname":"liquidaciones_insert","cmd":"INSERT","roles":"{authenticated}","qual":null,"with_check":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))"},{"policyname":"liquidaciones_select","cmd":"SELECT","roles":"{authenticated}","qual":"(( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))) OR (propietario_id IN ( SELECT e.entidad_id\n   FROM fn_mis_entidades() e(entidad_tipo, entidad_id)\n  WHERE (e.entidad_tipo = 'propietario'::text))) OR (profesional_id IN ( SELECT e.entidad_id\n   FROM fn_mis_entidades() e(entidad_tipo, entidad_id)\n  WHERE (e.entidad_tipo = 'profesional'::text))))","with_check":null},{"policyname":"liquidaciones_update","cmd":"UPDATE","roles":"{authenticated}","qual":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))","with_check":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))"}]
```

## Preguntas abiertas / para decidir (no se tocó nada)

1. **Vista por carrera:** ¿el incentivo de jockey debería contarse en el "Pagable" del caballo de una sola carrera (p.ej. la primera que largó) y en las demás mostrarse sin importe ("ya contado en la C1")? ¿O sacarlo del total del caballo y mostrarlo aparte? Es decisión de producto (Valeria/Fede).
2. **Motor:** ¿chequear el error del DELETE y abortar antes de insertar? ¿Índice único parcial para el incentivo de jockey por reunión? ¿Lock por reunión (advisory lock / RPC) para dos recálculos simultáneos?
3. **ISSUE-085:** al crear a mano los incentivos que faltan, usar `concepto = 'Incentivo jockey'` exacto, o el recálculo puede duplicar.
4. Si Valeria vio un número duplicado en otra pantalla que no sea la vista por carrera (recibo, tarjetas, Resumen), hace falta saber cuál: con los datos de hoy ninguna otra muestra dos veces la misma línea.
