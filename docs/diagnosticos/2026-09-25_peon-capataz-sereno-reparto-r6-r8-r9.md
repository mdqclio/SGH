# Peón / capataz / sereno en R6, R8 y R9 — reparto del premio y adónde va el 8 % (SOLO LECTURA)

- Fecha: 2026-09-25
- Código leído: `main` @ `a4ec2adf84c78dbaf4264f7ea561a5653d0dc35f` (`liquidaciones-engine.js`, el motor que usa `liquidaciones.html` → `generarLiquidaciones()` → `generarLiquidacionesReunion`)
- Guards: `pwd` = /home/clio/dev/SGH · `select count(*) from spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- **No se escribió nada en la base ni en el código.** Sólo `SELECT` por MCP (`execute_sql`).
- Anonimizado: nombres de personas reales (entrenadores) → `N###`; UUID de recibos → `<uuid>`. Los nombres
  de caballos son del Stud Book (públicos) y los de la 9999 son ficticios de prueba (`Pedro Peón`, etc.).
- Reuniones: R6 `b02ca761-6f44-4720-86aa-a3c3099019ea` (2026-06-20) · R8 `7b6e003e-22e2-4629-bf55-f18560b1260f`
  (2026-08-16) · R9 `cafa37d6-89f4-45cb-a0d9-835bc27407e9` (2026-09-20).

---

## Respuestas cortas

1. **Cero.** En R6, R8 y R9 ningún ratificado que largó tiene peón, capataz ni sereno cargado
   (R6 0/58, R8 0/57, R9 0/30). En **toda la base** hay 3 inscripciones con esos campos, y las 3 son de la
   reunión de prueba 9999.
2. **El reparto de cada caballo premiado suma 92 %, no 100 %** (ni 96, ni 97, ni 93): 70 propietario + 10
   entrenador + 10 jockey + 2 fondo solidario. Faltan exactamente 4 + 3 + 1 = **8 %**. Caso concreto abajo
   (R9, Carrera 2): 850.000 → se generan 782.000 (92 %); 68.000 no existen en ninguna línea.
3. **Quedó sin generar.** El motor arma las sub-líneas sólo si el texto está cargado
   (`.filter(s => s.nombre && s.nombre.trim())`, `liquidaciones-engine.js:184-188`); si no hay nombre, no se
   crea ninguna línea y el monto no se reasigna a nadie. Verificado en datos: la línea del entrenador es
   exactamente el 10 % en el 100 % de los casos (0 desvíos) y la del fondo solidario del club exactamente el
   2 % (0 desvíos). **No se sumó al entrenador, no se sumó al fondo/club.** No hay línea que lo contenga:
   en la práctica esa plata nunca sale de la bolsa (el club no la paga), pero **no está registrada como del club
   en ningún lado** — simplemente no aparece.
4. **Por reunión (8 % de los premios 1°–5° de las carreras oficiales):**

   | Reunión | Puestos premiados | Premio total | Peón 4 % | Capataz 3 % | Sereno 1 % | **Total 8 % sin generar** |
   |---|---|---|---|---|---|---|
   | R6 | 35 | 14.679.600,01 | 587.184,00 | 440.388,00 | 146.796,00 | **1.174.368,00** |
   | R8 | 40 | 14.258.100,00 | 570.324,00 | 427.743,00 | 142.581,00 | **1.140.648,00** |
   | R9 | 23 | 7.051.208,34 | 282.048,33 | 211.536,25 | 70.512,08 | **564.096,67** |
   | **Total** | 98 | 35.988.908,35 | 1.439.556,33 | 1.079.667,25 | 359.889,08 | **2.879.112,67** |

   (R6 tiene además 1 carrera en `provisional` — 5 puestos, premio 1.409.291,67 — que no está liquidada;
   su 8 % sería 112.743,33 y **no** está en el total de arriba.)

   Aparte, y **no** por peón/capataz/sereno: R6 y R8 tienen otros huecos por roles sin línea (propietario
   sin `propietario_id`, entrenador/jockey sin cargar) — R6 8.154.655,60 de propietario; R8 398.591,55
   propietario + 56.941,65 entrenador + 10.000,00 jockey. R9 no tiene esos huecos: ahí el único faltante es
   el 8 % exacto (generado 92,000 %).
5. **No hay ningún ejemplo real posible:** ningún caballo real tiene peón cargado, así que **no existe
   ninguna sub-línea `actuacion` fuera de la 9999**, y **ninguno** de los 44 recibos de la base (39 con líneas
   de R9) tiene una línea `actuacion`. Por diseño (ADR-025, `liquidaciones-engine.js:317-328`) la sub-línea se
   graba con `beneficiario_tipo='profesional'` y `beneficiario_id` = **el entrenador**, así que caería
   **dentro del recibo del entrenador**, no aparte. Las 9 sub-líneas que existen (9999) están así:
   beneficiario = el entrenador del caballo, `retenido`, **sin recibo**. Se muestra abajo un recibo real de
   entrenador de R9 (N° 37) con su detalle: sólo `premio` + `incentivo_entrenador`, cero `actuacion`.

---

## Código (main)

`liquidaciones-engine.js:182-203` — dónde se arman las subs y a quién se cuelgan:

```js
          if (premioEfectivo > 0) {
            const subs = [
              { nombre: insc.peon,    rol: 'Peón',    pct: PCTS.peon },
              { nombre: insc.capataz, rol: 'Capataz', pct: PCTS.capataz },
              { nombre: insc.sereno,  rol: 'Sereno',  pct: PCTS.sereno },
            ].filter(s => s.nombre && s.nombre.trim());
            addActor(insc.propietario_id, 'propietario', {
              premio: premioEfectivo, pct: PCTS.propietario, subs: [], conceptoTipo: 'premio',
              ...
            addActor(insc.entrenador_id, 'entrenador', {
              premio: premioEfectivo, pct: PCTS.entrenador, subs, conceptoTipo: 'premio',
              ...
```

`liquidaciones-engine.js:317-328` — cómo se persiste cada sub (bajo el entrenador):

```js
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
```

Lectura: sin nombre cargado, `subs = []` y el `for` no produce nada. No existe rama `else` que reasigne el
porcentaje. Además las subs viajan colgadas del ítem del **entrenador**: si el caballo no tiene
`entrenador_id`, `addActor` sale por `if (!id) return;` y las subs tampoco se generan aunque haya nombres.

`emitir_recibo` (prod) no filtra por `concepto_tipo`: `position('actuacion' …)` = 0 y
`position('concepto_tipo' …)` = 0 en `pg_get_functiondef` (query 11). Cobra lo que se le pasa del beneficiario;
como la sub-línea lleva el `beneficiario_id` del entrenador, entra en el recibo del entrenador.

---

## Queries y salidas crudas

### Q1 — Configuración de reparto vigente

```sql
select * from liquidacion_config where club_id='0649e9c5-9e87-4aad-842f-101458e6b33c';
```
```json
[{"id":"346c30f9-729e-468b-9abb-8e5c2f85cdea","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","pct_propietario":"70.000","pct_entrenador":"10.000","pct_jockey":"10.000","pct_peon":"4.000","pct_capataz":"3.000","pct_sereno":"1.000","pct_fondo_solidario":"2.000","incentivo_jockey_monto":"60000.00","incentivo_entrenador_monto":"10000.00","dias_antidoping":30,"retencion_dgi_pct":null,"vigente_desde":"2026-06-02","vigente_hasta":null,"activo":true,"created_at":"2026-06-02 04:19:52.542081+00"}]
```

```sql
select * from comision_config where club_id='0649e9c5-9e87-4aad-842f-101458e6b33c';
```
```json
[]
```
(Sin `comision_config` → `descPct = 0`, bruto = neto en todas las líneas.)

### Q2 — Reuniones

```sql
select r.numero, r.id, r.fecha, r.estado from reuniones r where r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' and r.numero in (6,8,9) order by 1;
```
```json
[{"numero":6,"id":"b02ca761-6f44-4720-86aa-a3c3099019ea","fecha":"2026-06-20","estado":"borrador"},{"numero":8,"id":"7b6e003e-22e2-4629-bf55-f18560b1260f","fecha":"2026-08-16","estado":"finalizada"},{"numero":9,"id":"cafa37d6-89f4-45cb-a0d9-835bc27407e9","fecha":"2026-09-20","estado":"publicada"}]
```

### Q3 — Pregunta 1: ratificados que largaron, con peón / capataz / sereno

```sql
with base as (
 select r.numero, i.id, i.peon, i.capataz, i.sereno, rp.posicion
 from reuniones r join carreras ca on ca.reunion_id=r.id
 join inscripciones i on i.carrera_id=ca.id
 join resultados res on res.carrera_id=ca.id
 join resultado_posiciones rp on rp.resultado_id=res.id and rp.inscripcion_id=i.id
 where r.id in ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f','cafa37d6-89f4-45cb-a0d9-835bc27407e9')
   and i.estado='ratificado' and rp.no_largo=false
)
select numero, count(*) largaron,
 count(*) filter (where nullif(trim(peon),'') is not null) con_peon,
 count(*) filter (where nullif(trim(capataz),'') is not null) con_capataz,
 count(*) filter (where nullif(trim(sereno),'') is not null) con_sereno,
 count(*) filter (where coalesce(trim(peon),'')='' and coalesce(trim(capataz),'')='' and coalesce(trim(sereno),'')='') sin_ninguno,
 count(*) filter (where posicion in (1,2,3,4,5)) en_premio_1a5
from base group by numero order by numero;
```
```json
[{"numero":6,"largaron":58,"con_peon":0,"con_capataz":0,"con_sereno":0,"sin_ninguno":58,"en_premio_1a5":40},{"numero":8,"largaron":57,"con_peon":0,"con_capataz":0,"con_sereno":0,"sin_ninguno":57,"en_premio_1a5":40},{"numero":9,"largaron":30,"con_peon":0,"con_capataz":0,"con_sereno":0,"sin_ninguno":30,"en_premio_1a5":23}]
```
(`en_premio_1a5` de R6 = 40 incluye los 5 de la carrera provisional; los liquidados son 35.)

### Q4 — Toda la base: quién tiene peón/capataz/sereno y cuántas líneas `actuacion` hay

```sql
select 'insc_total' k, count(*) n from inscripciones
union all select 'insc_con_peon', count(*) from inscripciones where coalesce(trim(peon),'')<>''
union all select 'insc_con_capataz', count(*) from inscripciones where coalesce(trim(capataz),'')<>''
union all select 'insc_con_sereno', count(*) from inscripciones where coalesce(trim(sereno),'')<>''
union all select 'insc_con_alguno_fuera_9999', count(*) from inscripciones i join carreras ca on ca.id=i.carrera_id where ca.reunion_id<>'a0000000-0000-0000-0000-000000009999' and (coalesce(trim(peon),'')<>'' or coalesce(trim(capataz),'')<>'' or coalesce(trim(sereno),'')<>'')
union all select 'lineas_actuacion_total', count(*) from liquidacion_detalle where concepto_tipo='actuacion'
union all select 'lineas_actuacion_R6R8R9', count(*) from liquidacion_detalle where concepto_tipo='actuacion' and reunion_id in ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f','cafa37d6-89f4-45cb-a0d9-835bc27407e9');
```
```json
[{"k":"insc_total","n":350},{"k":"insc_con_peon","n":3},{"k":"insc_con_capataz","n":3},{"k":"insc_con_sereno","n":3},{"k":"insc_con_alguno_fuera_9999","n":0},{"k":"lineas_actuacion_total","n":9},{"k":"lineas_actuacion_R6R8R9","n":0}]
```

### Q5 — Pregunta 2/4: lo generado vs el premio, por caballo premiado, agregado por reunión

```sql
with l as (
 select d.*, r.numero from liquidacion_detalle d join reuniones r on r.id=d.reunion_id
 where d.reunion_id in ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f','cafa37d6-89f4-45cb-a0d9-835bc27407e9')
   and d.concepto_tipo in ('premio','fondo_solidario','actuacion')
), roles as (
 select l.*, case when concepto_tipo='fondo_solidario' then 'fondo'
   when concepto_tipo='actuacion' then 'sub'
   when descripcion like '%— Propietario%' then 'prop'
   when descripcion like '%— Entrenador%' then 'entr'
   when descripcion like '%— Jockey%' then 'jock' else '?' end rol from l
), g as (
 select numero, inscripcion_id, posicion,
  sum(monto_bruto) filter (where rol='prop') prop, sum(monto_bruto) filter (where rol='entr') entr,
  sum(monto_bruto) filter (where rol='jock') jock, sum(monto_bruto) filter (where rol='fondo') fondo,
  sum(monto_bruto) filter (where rol='sub') sub, sum(monto_bruto) total,
  count(*) filter (where rol='?') desconocidos
 from roles group by 1,2,3
), b as (select g.*, coalesce(fondo/0.02, entr/0.10, jock/0.10, prop/0.70) premio from g)
select numero, count(*) caballos_premiados,
 count(*) filter (where prop is not null) con_prop, count(*) filter (where entr is not null) con_entr, count(*) filter (where jock is not null) con_jock,
 round(sum(premio),2) premio_total, round(sum(total),2) generado,
 round(sum(premio)*0.08,2) teorico_8pct_sin_generar,
 round(sum(premio)-sum(total),2) no_generado_total,
 round(sum(total)/sum(premio)*100,3) pct_generado,
 sum(desconocidos) desc
from b group by numero order by numero;
```
```json
[{"numero":6,"caballos_premiados":35,"con_prop":10,"con_entr":35,"con_jock":35,"premio_total":"14679599.50","generado":"5350576.18","teorico_8pct_sin_generar":"1174367.96","no_generado_total":"9329023.32","pct_generado":"36.449","desc":"0"},{"numero":8,"caballos_premiados":40,"con_prop":36,"con_entr":36,"con_jock":39,"premio_total":"14258100.00","generado":"12651918.66","teorico_8pct_sin_generar":"1140648.00","no_generado_total":"1606181.34","pct_generado":"88.735","desc":"0"},{"numero":9,"caballos_premiados":23,"con_prop":23,"con_entr":23,"con_jock":23,"premio_total":"7051208.00","generado":"6487111.68","teorico_8pct_sin_generar":"564096.64","no_generado_total":"564096.32","pct_generado":"92.000","desc":"0"}]
```

### Q6 — Premio teórico recalculado desde la bolsa (independiente de las líneas), y el 8 %

Misma fórmula que `calcPremio` del motor: `bolsa × dist[pos] / 100` (+ `bono_ganador` en el 1°), piso
`ganancia_minima`. No hay empates en ninguna de las 3 reuniones.

```sql
with p as (
 select r.numero, ca.id carrera_id, rp.inscripcion_id, rp.posicion, rp.empate, res.estado res_estado,
  ca.bolsa_total::numeric bolsa, ca.distribucion_premios dist
 from reuniones r join carreras ca on ca.reunion_id=r.id join resultados res on res.carrera_id=ca.id
 join resultado_posiciones rp on rp.resultado_id=res.id
 where r.id in ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f','cafa37d6-89f4-45cb-a0d9-835bc27407e9')
  and rp.posicion is not null and coalesce(rp.descalificado,false)=false and (ca.distribucion_premios ? rp.posicion::text)
), t as (
 select *, greatest(bolsa*(dist->>posicion::text)::numeric/100 + case when posicion=1 then coalesce((dist->>'bono_ganador')::numeric,0) else 0 end,
   coalesce((dist->>'ganancia_minima')::numeric,0)) premio from p
)
select numero, res_estado, count(*) puestos_premiados, count(*) filter (where empate) con_empate,
 round(sum(premio),2) premio_teorico, round(sum(premio)*0.04,2) peon_4, round(sum(premio)*0.03,2) capataz_3, round(sum(premio)*0.01,2) sereno_1, round(sum(premio)*0.08,2) total_8
from t group by 1,2 order by 1,2;
```
```json
[{"numero":6,"res_estado":"provisional","puestos_premiados":5,"con_empate":0,"premio_teorico":"1409291.67","peon_4":"56371.67","capataz_3":"42278.75","sereno_1":"14092.92","total_8":"112743.33"},{"numero":6,"res_estado":"oficial","puestos_premiados":35,"con_empate":0,"premio_teorico":"14679600.01","peon_4":"587184.00","capataz_3":"440388.00","sereno_1":"146796.00","total_8":"1174368.00"},{"numero":8,"res_estado":"oficial","puestos_premiados":40,"con_empate":0,"premio_teorico":"14258100.00","peon_4":"570324.00","capataz_3":"427743.00","sereno_1":"142581.00","total_8":"1140648.00"},{"numero":9,"res_estado":"oficial","puestos_premiados":23,"con_empate":0,"premio_teorico":"7051208.34","peon_4":"282048.33","capataz_3":"211536.25","sereno_1":"70512.08","total_8":"564096.67"}]
```
Cuadra con Q5 (diferencias de centavos por redondeo de las líneas: R6 14.679.599,50 vs 14.679.600,01;
R9 7.051.208,00 vs 7.051.208,34).

### Q7 — Pregunta 3: ¿el 8 % se sumó al entrenador o al fondo? Desvíos de cada rol contra su %

```sql
with l as (
 select d.*, r.numero, case when concepto_tipo='fondo_solidario' then 'fondo'
   when descripcion like '%— Propietario%' then 'prop' when descripcion like '%— Entrenador%' then 'entr'
   when descripcion like '%— Jockey%' then 'jock' end rol
 from liquidacion_detalle d join reuniones r on r.id=d.reunion_id
 where d.reunion_id in ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f','cafa37d6-89f4-45cb-a0d9-835bc27407e9')
   and d.concepto_tipo in ('premio','fondo_solidario')
), g as (select numero, inscripcion_id, posicion,
  sum(monto_bruto) filter (where rol='prop') prop, sum(monto_bruto) filter (where rol='entr') entr,
  sum(monto_bruto) filter (where rol='jock') jock, sum(monto_bruto) filter (where rol='fondo') fondo
 from l group by 1,2,3)
select numero, count(*) grupos, count(*) filter (where fondo is null) sin_fondo,
 count(*) filter (where entr is not null and abs(entr - fondo*5) > 0.02) entr_distinto_10pct,
 count(*) filter (where jock is not null and abs(jock - fondo*5) > 0.02) jock_distinto_10pct,
 count(*) filter (where prop is not null and abs(prop - fondo*35) > 0.05) prop_distinto_70pct,
 count(*) filter (where prop is null) sin_linea_prop, round(sum(fondo*35) filter (where prop is null),2) prop_no_generado,
 count(*) filter (where entr is null) sin_linea_entr, round(sum(fondo*5) filter (where entr is null),2) entr_no_generado,
 count(*) filter (where jock is null) sin_linea_jock, round(sum(fondo*5) filter (where jock is null),2) jock_no_generado
from g group by numero order by numero;
```
```json
[{"numero":6,"grupos":35,"sin_fondo":0,"entr_distinto_10pct":0,"jock_distinto_10pct":0,"prop_distinto_70pct":1,"sin_linea_prop":25,"prop_no_generado":"8154655.60","sin_linea_entr":0,"entr_no_generado":null,"sin_linea_jock":0,"jock_no_generado":null},{"numero":8,"grupos":40,"sin_fondo":0,"entr_distinto_10pct":0,"jock_distinto_10pct":0,"prop_distinto_70pct":5,"sin_linea_prop":4,"prop_no_generado":"398591.55","sin_linea_entr":4,"entr_no_generado":"56941.65","sin_linea_jock":1,"jock_no_generado":"10000.00"},{"numero":9,"grupos":23,"sin_fondo":0,"entr_distinto_10pct":0,"jock_distinto_10pct":0,"prop_distinto_70pct":4,"sin_linea_prop":0,"prop_no_generado":null,"sin_linea_entr":0,"entr_no_generado":null,"sin_linea_jock":0,"jock_no_generado":null}]
```

Los `prop_distinto_70pct` son redondeo (el fondo viene redondeado a centavos y ×35 amplifica): la
diferencia máxima es de 12 centavos contra 35×fondo y de 2 centavos contra 7×entrenador:

```sql
with l as (
 select d.reunion_id, d.inscripcion_id, d.posicion, d.monto_bruto, d.concepto_tipo, d.descripcion from liquidacion_detalle d
 where d.reunion_id in ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f','cafa37d6-89f4-45cb-a0d9-835bc27407e9') and d.concepto_tipo in ('premio','fondo_solidario')
), g as (select reunion_id, inscripcion_id, posicion,
 sum(monto_bruto) filter (where descripcion like '%— Propietario%') prop, sum(monto_bruto) filter (where descripcion like '%— Entrenador%') entr,
 sum(monto_bruto) filter (where concepto_tipo='fondo_solidario') fondo from l group by 1,2,3)
select max(abs(prop - entr*7)) max_dif_prop_vs_7x_entr, max(abs(prop - fondo*35)) max_dif_prop_vs_35x_fondo from g;
```
```json
[{"max_dif_prop_vs_7x_entr":"0.02","max_dif_prop_vs_35x_fondo":"0.12"}]
```

Conclusión de Q7: entrenador = 10 % exacto, jockey = 10 % exacto, fondo = 2 % exacto en todos los grupos.
Nadie absorbió el 8 %.

Reconciliación del faltante total de Q5 por causa:

| Reunión | No generado (Q5) | = 8 % peón/capataz/sereno | + propietario sin línea | + entrenador sin línea | + jockey sin línea |
|---|---|---|---|---|---|
| R6 | 9.329.023,32 | 1.174.367,96 | 8.154.655,60 | 0 | 0 |
| R8 | 1.606.181,34 | 1.140.648,00 | 398.591,55 | 56.941,65 | 10.000,00 |
| R9 | 564.096,32 | 564.096,64 | 0 | 0 | 0 |

(R6 cierra al centavo; R8 cierra en 0,14; R9 en 0,32 — redondeo.)

### Q8 — Carreras de R9 (para elegir el caso)

```sql
select ca.numero_turno, ca.numero_carrera_programa, ca.id, ca.bolsa_total, ca.distribucion_premios, res.estado,
 (select count(*) from liquidacion_detalle d where d.carrera_id=ca.id) lineas
from carreras ca left join resultados res on res.carrera_id=ca.id
where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' order by ca.numero_carrera_programa nulls last, ca.numero_turno;
```
```json
[{"numero_turno":1,"numero_carrera_programa":1,"id":"c037b139-b8b5-46d7-900e-cbc7a01bd643","bolsa_total":"1054166.67","distribucion_premios":{"1":60,"2":19,"3":12,"4":6,"5":3,"bono_ganador":250000,"ganancia_minima":100000,"bono_posicion_desde":6,"bono_posicion_hasta":8,"bono_posicion_monto":100000},"estado":"oficial","lineas":21},{"numero_turno":4,"numero_carrera_programa":2,"id":"fbf0de67-875f-4dbd-834c-60503d2d6f2f","bolsa_total":"1000000.00","distribucion_premios":{"1":60,"2":19,"3":12,"4":6,"5":3,"bono_ganador":250000,"ganancia_minima":100000,"bono_posicion_desde":6,"bono_posicion_hasta":8,"bono_posicion_monto":100000},"estado":"oficial","lineas":23},{"numero_turno":6,"numero_carrera_programa":3,"id":"7da3fa1c-a32a-42dc-ad2f-6b10e86cba22","bolsa_total":"1083333.33","distribucion_premios":{"1":60,"2":19,"3":12,"4":6,"5":3,"bono_ganador":250000,"ganancia_minima":100000,"bono_posicion_desde":6,"bono_posicion_hasta":8,"bono_posicion_monto":100000},"estado":"oficial","lineas":16},{"numero_turno":5,"numero_carrera_programa":4,"id":"9733113c-8c80-40eb-80b4-6f741abf125c","bolsa_total":"1166666.67","distribucion_premios":{"1":60,"2":19,"3":12,"4":6,"5":3,"bono_ganador":250000,"ganancia_minima":100000,"bono_posicion_desde":6,"bono_posicion_hasta":8,"bono_posicion_monto":100000},"estado":"oficial","lineas":16},{"numero_turno":7,"numero_carrera_programa":5,"id":"3b553ea4-1052-4411-933b-156e6676dfc0","bolsa_total":"1191666.67","distribucion_premios":{"1":60,"2":19,"3":12,"4":6,"5":3,"bono_ganador":250000,"ganancia_minima":100000,"bono_posicion_desde":6,"bono_posicion_hasta":8,"bono_posicion_monto":100000},"estado":"oficial","lineas":21},{"numero_turno":9,"numero_carrera_programa":6,"id":"5cd5d00e-c844-467d-925f-83b378863af5","bolsa_total":"3333333.33","distribucion_premios":{"1":60,"2":19,"3":12,"4":6,"5":3,"ganancia_minima":100000,"bono_posicion_desde":6,"bono_posicion_hasta":8,"bono_posicion_monto":100000},"estado":null,"lineas":0},{"numero_turno":3,"numero_carrera_programa":7,"id":"7250cda2-4b1b-40f5-80ed-54121745241b","bolsa_total":"1118333.33","distribucion_premios":{"1":60,"2":19,"3":12,"4":6,"5":3,"bono_ganador":250000,"ganancia_minima":100000,"bono_posicion_desde":6,"bono_posicion_hasta":8,"bono_posicion_monto":100000},"estado":null,"lineas":0},{"numero_turno":11,"numero_carrera_programa":8,"id":"0bf74c72-9300-4406-8949-d81705da0c23","bolsa_total":"1833333.33","distribucion_premios":{"1":60,"2":19,"3":12,"4":6,"5":3,"ganancia_minima":100000,"bono_posicion_desde":6,"bono_posicion_hasta":8,"bono_posicion_monto":100000},"estado":null,"lineas":0},{"numero_turno":2,"numero_carrera_programa":null,"id":"2d4016ad-460a-44c9-9b2d-d710a510edee","bolsa_total":"1016666.67","distribucion_premios":{"1":60,"2":19,"3":12,"4":6,"5":3,"bono_ganador":250000,"ganancia_minima":100000,"bono_posicion_desde":6,"bono_posicion_hasta":8,"bono_posicion_monto":100000},"estado":null,"lineas":0},{"numero_turno":8,"numero_carrera_programa":null,"id":"bae8008f-87fc-479e-a416-27502c7489b3","bolsa_total":"1191666.67","distribucion_premios":{"1":60,"2":19,"3":12,"4":6,"5":3,"bono_ganador":250000,"ganancia_minima":100000,"bono_posicion_desde":6,"bono_posicion_hasta":8,"bono_posicion_monto":100000},"estado":null,"lineas":0},{"numero_turno":10,"numero_carrera_programa":null,"id":"099b050d-b7e5-412c-b789-55dae7d5cd13","bolsa_total":"1833333.33","distribucion_premios":{"1":60,"2":19,"3":12,"4":6,"5":3,"ganancia_minima":100000,"bono_posicion_desde":6,"bono_posicion_hasta":8,"bono_posicion_monto":100000},"estado":null,"lineas":0}]
```

### Q9 — Pregunta 2, caso concreto: R9 Carrera 2 (turno 4), bolsa 1.000.000, puesto por puesto

```sql
select rp.posicion, s.nombre caballo, i.peon, i.capataz, i.sereno, d.concepto_tipo, d.descripcion, d.beneficiario_tipo, d.monto_bruto, d.monto_descuento, d.monto_neto, d.estado_linea, d.recibo_id is not null tiene_recibo
from liquidacion_detalle d join inscripciones i on i.id=d.inscripcion_id join spcs s on s.id=i.spc_id
join resultado_posiciones rp on rp.inscripcion_id=i.id
where d.carrera_id='fbf0de67-875f-4dbd-834c-60503d2d6f2f'
order by rp.posicion, d.concepto_tipo, d.descripcion;
```
```json
[{"posicion":1,"caballo":"TOY BOY","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"premio","descripcion":"Carrera 2 — 1° puesto — Entrenador (bolsa: $850.000,00)","beneficiario_tipo":"profesional","monto_bruto":"85000.00","monto_descuento":"0.00","monto_neto":"85000.00","estado_linea":"retenido","tiene_recibo":false},{"posicion":1,"caballo":"TOY BOY","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"premio","descripcion":"Carrera 2 — 1° puesto — Jockey (bolsa: $850.000,00)","beneficiario_tipo":"profesional","monto_bruto":"85000.00","monto_descuento":"0.00","monto_neto":"85000.00","estado_linea":"retenido","tiene_recibo":false},{"posicion":1,"caballo":"TOY BOY","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"premio","descripcion":"Carrera 2 — 1° puesto — Propietario (bolsa: $850.000,00)","beneficiario_tipo":"propietario","monto_bruto":"595000.00","monto_descuento":"0.00","monto_neto":"595000.00","estado_linea":"retenido","tiene_recibo":false},{"posicion":1,"caballo":"TOY BOY","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"fondo_solidario","descripcion":"Fondo solidario 2% (premio: $850.000,00)","beneficiario_tipo":"club","monto_bruto":"17000.00","monto_descuento":"0.00","monto_neto":"17000.00","estado_linea":"impago","tiene_recibo":false},{"posicion":2,"caballo":"SOUTH GOTICO","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"premio","descripcion":"Carrera 2 — 2° puesto — Entrenador (bolsa: $190.000,00)","beneficiario_tipo":"profesional","monto_bruto":"19000.00","monto_descuento":"0.00","monto_neto":"19000.00","estado_linea":"retenido","tiene_recibo":false},{"posicion":2,"caballo":"SOUTH GOTICO","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"premio","descripcion":"Carrera 2 — 2° puesto — Jockey (bolsa: $190.000,00)","beneficiario_tipo":"profesional","monto_bruto":"19000.00","monto_descuento":"0.00","monto_neto":"19000.00","estado_linea":"retenido","tiene_recibo":false},{"posicion":2,"caballo":"SOUTH GOTICO","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"premio","descripcion":"Carrera 2 — 2° puesto — Propietario (bolsa: $190.000,00)","beneficiario_tipo":"propietario","monto_bruto":"133000.00","monto_descuento":"0.00","monto_neto":"133000.00","estado_linea":"retenido","tiene_recibo":false},{"posicion":2,"caballo":"SOUTH GOTICO","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"fondo_solidario","descripcion":"Fondo solidario 2% (premio: $190.000,00)","beneficiario_tipo":"club","monto_bruto":"3800.00","monto_descuento":"0.00","monto_neto":"3800.00","estado_linea":"impago","tiene_recibo":false},{"posicion":3,"caballo":"BACON","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"premio","descripcion":"Carrera 2 — 3° puesto — Entrenador (bolsa: $120.000,00)","beneficiario_tipo":"profesional","monto_bruto":"12000.00","monto_descuento":"0.00","monto_neto":"12000.00","estado_linea":"pagado","tiene_recibo":true},{"posicion":3,"caballo":"BACON","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"premio","descripcion":"Carrera 2 — 3° puesto — Jockey (bolsa: $120.000,00)","beneficiario_tipo":"profesional","monto_bruto":"12000.00","monto_descuento":"0.00","monto_neto":"12000.00","estado_linea":"pagado","tiene_recibo":true},{"posicion":3,"caballo":"BACON","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"premio","descripcion":"Carrera 2 — 3° puesto — Propietario (bolsa: $120.000,00)","beneficiario_tipo":"propietario","monto_bruto":"84000.00","monto_descuento":"0.00","monto_neto":"84000.00","estado_linea":"pagado","tiene_recibo":true},{"posicion":3,"caballo":"BACON","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"fondo_solidario","descripcion":"Fondo solidario 2% (premio: $120.000,00)","beneficiario_tipo":"club","monto_bruto":"2400.00","monto_descuento":"0.00","monto_neto":"2400.00","estado_linea":"impago","tiene_recibo":false},{"posicion":4,"caballo":"LOGUACIOUS","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"premio","descripcion":"Carrera 2 — 4° puesto — Entrenador (bolsa: $100.000,00)","beneficiario_tipo":"profesional","monto_bruto":"10000.00","monto_descuento":"0.00","monto_neto":"10000.00","estado_linea":"pagado","tiene_recibo":true},{"posicion":4,"caballo":"LOGUACIOUS","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"premio","descripcion":"Carrera 2 — 4° puesto — Jockey (bolsa: $100.000,00)","beneficiario_tipo":"profesional","monto_bruto":"10000.00","monto_descuento":"0.00","monto_neto":"10000.00","estado_linea":"pagado","tiene_recibo":true},{"posicion":4,"caballo":"LOGUACIOUS","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"premio","descripcion":"Carrera 2 — 4° puesto — Propietario (bolsa: $100.000,00)","beneficiario_tipo":"propietario","monto_bruto":"70000.00","monto_descuento":"0.00","monto_neto":"70000.00","estado_linea":"pagado","tiene_recibo":true},{"posicion":4,"caballo":"LOGUACIOUS","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"fondo_solidario","descripcion":"Fondo solidario 2% (premio: $100.000,00)","beneficiario_tipo":"club","monto_bruto":"2000.00","monto_descuento":"0.00","monto_neto":"2000.00","estado_linea":"impago","tiene_recibo":false},{"posicion":5,"caballo":"LIVIA DRUSA","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"premio","descripcion":"Carrera 2 — 5° puesto — Entrenador (bolsa: $100.000,00)","beneficiario_tipo":"profesional","monto_bruto":"10000.00","monto_descuento":"0.00","monto_neto":"10000.00","estado_linea":"pagado","tiene_recibo":true},{"posicion":5,"caballo":"LIVIA DRUSA","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"premio","descripcion":"Carrera 2 — 5° puesto — Jockey (bolsa: $100.000,00)","beneficiario_tipo":"profesional","monto_bruto":"10000.00","monto_descuento":"0.00","monto_neto":"10000.00","estado_linea":"pagado","tiene_recibo":true},{"posicion":5,"caballo":"LIVIA DRUSA","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"premio","descripcion":"Carrera 2 — 5° puesto — Propietario (bolsa: $100.000,00)","beneficiario_tipo":"propietario","monto_bruto":"70000.00","monto_descuento":"0.00","monto_neto":"70000.00","estado_linea":"impago","tiene_recibo":false},{"posicion":5,"caballo":"LIVIA DRUSA","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"fondo_solidario","descripcion":"Fondo solidario 2% (premio: $100.000,00)","beneficiario_tipo":"club","monto_bruto":"2000.00","monto_descuento":"0.00","monto_neto":"2000.00","estado_linea":"impago","tiene_recibo":false},{"posicion":6,"caballo":"REY DE PILA","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"bono","descripcion":"Bono 6° puesto (100% propietario): $100.000,00","beneficiario_tipo":"propietario","monto_bruto":"100000.00","monto_descuento":"0.00","monto_neto":"100000.00","estado_linea":"pagado","tiene_recibo":true},{"posicion":7,"caballo":"NISTEL WIN","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"bono","descripcion":"Bono 7° puesto (100% propietario): $100.000,00 [REGULARIZACION 2026-09-20: pagado con recibo manual N° 0480 durante R9 (reunión suspendida tras la 5ª carrera); sin recibo del sistema; estado previo=impago]","beneficiario_tipo":"propietario","monto_bruto":"100000.00","monto_descuento":"0.00","monto_neto":"100000.00","estado_linea":"pagado","tiene_recibo":false},{"posicion":8,"caballo":"GRILLADA RYE","peon":null,"capataz":null,"sereno":null,"concepto_tipo":"bono","descripcion":"Bono 8° puesto (100% propietario): $100.000,00","beneficiario_tipo":"propietario","monto_bruto":"100000.00","monto_descuento":"0.00","monto_neto":"100000.00","estado_linea":"pagado","tiene_recibo":true}]
```

Mismo caso, armado:

| Puesto | Caballo | Premio (bolsa×%) | Propietario 70 % | Entrenador 10 % | Jockey 10 % | Fondo 2 % (club) | **Suma generada** | **% generado** | Peón 4 % | Capataz 3 % | Sereno 1 % | **Sin generar (8 %)** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1° | TOY BOY | 850.000 (600.000 + bono ganador 250.000) | 595.000 | 85.000 | 85.000 | 17.000 | 782.000 | 92 % | 34.000 | 25.500 | 8.500 | **68.000** |
| 2° | SOUTH GOTICO | 190.000 | 133.000 | 19.000 | 19.000 | 3.800 | 174.800 | 92 % | 7.600 | 5.700 | 1.900 | **15.200** |
| 3° | BACON | 120.000 | 84.000 | 12.000 | 12.000 | 2.400 | 110.400 | 92 % | 4.800 | 3.600 | 1.200 | **9.600** |
| 4° | LOGUACIOUS | 100.000 (piso; 6 % = 60.000) | 70.000 | 10.000 | 10.000 | 2.000 | 92.000 | 92 % | 4.000 | 3.000 | 1.000 | **8.000** |
| 5° | LIVIA DRUSA | 100.000 (piso; 3 % = 30.000) | 70.000 | 10.000 | 10.000 | 2.000 | 92.000 | 92 % | 4.000 | 3.000 | 1.000 | **8.000** |
| **Carrera 2** | | **1.360.000** | 952.000 | 136.000 | 136.000 | 27.200 | **1.251.200** | **92 %** | 54.400 | 40.800 | 13.600 | **108.800** |

Los bonos 6°–8° (100.000 c/u, 100 % propietario) no llevan reparto por roles, así que no participan del 8 %.

### Q10 — Pregunta 5: las únicas sub-líneas `actuacion` que existen (todas en la 9999)

```sql
select d.reunion_id, d.concepto, d.descripcion, d.beneficiario_tipo, pr.apellido||', '||pr.nombre benef, pr.tipo, d.monto_bruto, d.estado_linea, d.recibo_id
from liquidacion_detalle d left join profesionales pr on pr.id=d.beneficiario_id where d.concepto_tipo='actuacion' order by d.concepto;
```
(Primer intento con `pr.nombre_completo` falló: `ERROR: 42703: column pr.nombre_completo does not exist` —
`profesionales` usa `nombre`/`apellido`.)
```json
[{"reunion_id":"a0000000-0000-0000-0000-000000009999","concepto":"Capataz — Carlos Capataz","descripcion":"Carrera 2 — 1° puesto — A redistribuir (3%)","beneficiario_tipo":"profesional","benef":"N001","tipo":"entrenador","monto_bruto":"21000.00","estado_linea":"retenido","recibo_id":null},{"reunion_id":"a0000000-0000-0000-0000-000000009999","concepto":"Capataz — Carlos Capataz","descripcion":"Carrera 3 — 1° puesto — A redistribuir (3%)","beneficiario_tipo":"profesional","benef":"N001","tipo":"entrenador","monto_bruto":"14400.00","estado_linea":"retenido","recibo_id":null},{"reunion_id":"a0000000-0000-0000-0000-000000009999","concepto":"Capataz — Carlos Capataz","descripcion":"Carrera 1 — 1° puesto — A redistribuir (3%)","beneficiario_tipo":"profesional","benef":"N001","tipo":"entrenador","monto_bruto":"18000.00","estado_linea":"retenido","recibo_id":null},{"reunion_id":"a0000000-0000-0000-0000-000000009999","concepto":"Peón — Pedro Peón","descripcion":"Carrera 3 — 1° puesto — A redistribuir (4%)","beneficiario_tipo":"profesional","benef":"N001","tipo":"entrenador","monto_bruto":"19200.00","estado_linea":"retenido","recibo_id":null},{"reunion_id":"a0000000-0000-0000-0000-000000009999","concepto":"Peón — Pedro Peón","descripcion":"Carrera 2 — 1° puesto — A redistribuir (4%)","beneficiario_tipo":"profesional","benef":"N001","tipo":"entrenador","monto_bruto":"28000.00","estado_linea":"retenido","recibo_id":null},{"reunion_id":"a0000000-0000-0000-0000-000000009999","concepto":"Peón — Pedro Peón","descripcion":"Carrera 1 — 1° puesto — A redistribuir (4%)","beneficiario_tipo":"profesional","benef":"N001","tipo":"entrenador","monto_bruto":"24000.00","estado_linea":"retenido","recibo_id":null},{"reunion_id":"a0000000-0000-0000-0000-000000009999","concepto":"Sereno — Sergio Sereno","descripcion":"Carrera 2 — 1° puesto — A redistribuir (1%)","beneficiario_tipo":"profesional","benef":"N001","tipo":"entrenador","monto_bruto":"7000.00","estado_linea":"retenido","recibo_id":null},{"reunion_id":"a0000000-0000-0000-0000-000000009999","concepto":"Sereno — Sergio Sereno","descripcion":"Carrera 3 — 1° puesto — A redistribuir (1%)","beneficiario_tipo":"profesional","benef":"N001","tipo":"entrenador","monto_bruto":"4800.00","estado_linea":"retenido","recibo_id":null},{"reunion_id":"a0000000-0000-0000-0000-000000009999","concepto":"Sereno — Sergio Sereno","descripcion":"Carrera 1 — 1° puesto — A redistribuir (1%)","beneficiario_tipo":"profesional","benef":"N001","tipo":"entrenador","monto_bruto":"6000.00","estado_linea":"retenido","recibo_id":null}]
```

(Consistente: Peón C1 = 24.000 = 4 % de 600.000 → Sereno 1 % = 6.000.)

Lectura: las 9 están con `beneficiario_id` = el entrenador (N001) del caballo → en Pagos aparecen dentro de
su deuda y se cobrarían en **su** recibo. Las 9 están `retenido` (1° puesto) y **ninguna tiene recibo**.

### Q11 — Pregunta 5: recibos de entrenador emitidos con líneas de R9 — ¿alguno con `actuacion`?

```sql
select rc.numero_recibo, rc.id, rc.estado, rc.emitido_at, pr.apellido||', '||pr.nombre benef, pr.tipo, rc.total_premios, rc.neto_a_cobrar,
 (select count(*) from liquidacion_detalle d where d.recibo_id=rc.id) lineas,
 (select count(*) from liquidacion_detalle d where d.recibo_id=rc.id and d.concepto_tipo='actuacion') lineas_actuacion,
 (select string_agg(distinct d.concepto_tipo::text, ',') from liquidacion_detalle d where d.recibo_id=rc.id) tipos
from recibos rc join profesionales pr on pr.id=rc.profesional_id
where exists (select 1 from liquidacion_detalle d where d.recibo_id=rc.id and d.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9')
 and pr.tipo::text ilike '%entren%' order by rc.numero_recibo;
```
(Primer intento sin `::text` falló: `ERROR: 42883: function string_agg(concepto_liq, unknown) does not exist`.)
```json
[{"numero_recibo":35,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-20 17:11:54.562504+00","benef":"N002","tipo":"entrenador","total_premios":"20000.00","neto_a_cobrar":"20000.00","lineas":2,"lineas_actuacion":0,"tipos":"incentivo_entrenador,premio"},{"numero_recibo":36,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-20 17:18:52.369352+00","benef":"N003","tipo":"entrenador","total_premios":"10000.00","neto_a_cobrar":"10000.00","lineas":1,"lineas_actuacion":0,"tipos":"incentivo_entrenador"},{"numero_recibo":37,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-20 17:22:05.018368+00","benef":"N004","tipo":"entrenador","total_premios":"42650.00","neto_a_cobrar":"42650.00","lineas":4,"lineas_actuacion":0,"tipos":"incentivo_entrenador,premio"},{"numero_recibo":40,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-20 17:39:49.405454+00","benef":"N005","tipo":"entrenador","total_premios":"22000.00","neto_a_cobrar":"22000.00","lineas":2,"lineas_actuacion":0,"tipos":"incentivo_entrenador,premio"},{"numero_recibo":42,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-20 17:44:46.160782+00","benef":"N006","tipo":"entrenador","total_premios":"10000.00","neto_a_cobrar":"10000.00","lineas":1,"lineas_actuacion":0,"tipos":"incentivo_entrenador"},{"numero_recibo":43,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-20 17:50:14.972095+00","benef":"N007","tipo":"entrenador","total_premios":"20000.00","neto_a_cobrar":"20000.00","lineas":2,"lineas_actuacion":0,"tipos":"incentivo_entrenador"},{"numero_recibo":45,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-20 17:56:58.057187+00","benef":"N008","tipo":"entrenador","total_premios":"20000.00","neto_a_cobrar":"20000.00","lineas":2,"lineas_actuacion":0,"tipos":"incentivo_entrenador,premio"},{"numero_recibo":46,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-20 17:59:52.96578+00","benef":"N009","tipo":"entrenador","total_premios":"23000.00","neto_a_cobrar":"23000.00","lineas":2,"lineas_actuacion":0,"tipos":"incentivo_entrenador,premio"},{"numero_recibo":48,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-20 18:05:01.795167+00","benef":"N010","tipo":"entrenador","total_premios":"30000.00","neto_a_cobrar":"30000.00","lineas":3,"lineas_actuacion":0,"tipos":"incentivo_entrenador,premio"},{"numero_recibo":52,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-20 18:21:02.221353+00","benef":"N011","tipo":"entrenador","total_premios":"10000.00","neto_a_cobrar":"10000.00","lineas":1,"lineas_actuacion":0,"tipos":"incentivo_entrenador"},{"numero_recibo":53,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-20 18:22:54.610251+00","benef":"N012","tipo":"entrenador","total_premios":"10000.00","neto_a_cobrar":"10000.00","lineas":1,"lineas_actuacion":0,"tipos":"incentivo_entrenador"},{"numero_recibo":56,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-20 18:29:32.075292+00","benef":"N013","tipo":"entrenador","total_premios":"20000.00","neto_a_cobrar":"20000.00","lineas":2,"lineas_actuacion":0,"tipos":"incentivo_entrenador,premio"},{"numero_recibo":58,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-20 18:33:36.833876+00","benef":"N014","tipo":"entrenador","total_premios":"10000.00","neto_a_cobrar":"10000.00","lineas":1,"lineas_actuacion":0,"tipos":"incentivo_entrenador"},{"numero_recibo":61,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-20 18:48:26.826166+00","benef":"N015","tipo":"entrenador","total_premios":"24000.00","neto_a_cobrar":"24000.00","lineas":2,"lineas_actuacion":0,"tipos":"incentivo_entrenador,premio"},{"numero_recibo":67,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-20 19:01:19.521541+00","benef":"N016","tipo":"entrenador","total_premios":"10000.00","neto_a_cobrar":"10000.00","lineas":1,"lineas_actuacion":0,"tipos":"incentivo_entrenador"},{"numero_recibo":71,"id":"<uuid>","estado":"emitido","emitido_at":"2026-09-23 15:58:12.945514+00","benef":"N017","tipo":"entrenador","total_premios":"10000.00","neto_a_cobrar":"10000.00","lineas":1,"lineas_actuacion":0,"tipos":"incentivo_entrenador"}]
```

16 recibos de entrenador de R9, **0** líneas `actuacion`.

Detalle del recibo N° 37 (entrenador N004, 4 líneas, 42.650):

```sql
select d.concepto, d.descripcion, d.concepto_tipo, d.monto_bruto, d.monto_neto, d.estado_linea, s.nombre caballo, i.peon, i.capataz, i.sereno
from liquidacion_detalle d left join inscripciones i on i.id=d.inscripcion_id left join spcs s on s.id=i.spc_id
where d.recibo_id='<uuid del recibo 37>' order by d.concepto_tipo, d.descripcion;
```
```json
[{"concepto":"Carrera 1 — 3° puesto","descripcion":"Carrera 1 — 3° puesto — Entrenador (bolsa: $126.500,00)","concepto_tipo":"premio","monto_bruto":"12650.00","monto_neto":"12650.00","estado_linea":"pagado","caballo":"ETERNA DOCTORA","peon":null,"capataz":null,"sereno":null},{"concepto":"Carrera 1 — 5° puesto","descripcion":"Carrera 1 — 5° puesto — Entrenador (bolsa: $100.000,00)","concepto_tipo":"premio","monto_bruto":"10000.00","monto_neto":"10000.00","estado_linea":"pagado","caballo":"DOCTORA APASIONADA","peon":null,"capataz":null,"sereno":null},{"concepto":"Incentivo entrenador","descripcion":"Incentivo entrenador por caballo corrido: $10.000,00","concepto_tipo":"incentivo_entrenador","monto_bruto":"10000.00","monto_neto":"10000.00","estado_linea":"pagado","caballo":"ETERNA DOCTORA","peon":null,"capataz":null,"sereno":null},{"concepto":"Incentivo entrenador","descripcion":"Incentivo entrenador por caballo corrido: $10.000,00","concepto_tipo":"incentivo_entrenador","monto_bruto":"10000.00","monto_neto":"10000.00","estado_linea":"pagado","caballo":"DOCTORA APASIONADA","peon":null,"capataz":null,"sereno":null}]
```

Los dos caballos premiados de este entrenador (ETERNA DOCTORA 3°, DOCTORA APASIONADA 5°) no tienen
peón/capataz/sereno → el recibo lleva sólo el 10 % del entrenador. Si los hubieran tenido, los 4 % / 3 % / 1 %
de cada uno (5.060 / 3.795 / 1.265 y 4.000 / 3.000 / 1.000) habrían ido **dentro de este mismo recibo**, como
líneas `Peón — <nombre>` etc.

Totales de recibos:

```sql
select (select count(*) from recibos) recibos_total,
 (select count(distinct recibo_id) from liquidacion_detalle where concepto_tipo='actuacion' and recibo_id is not null) recibos_con_actuacion,
 (select count(distinct recibo_id) from liquidacion_detalle where reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and recibo_id is not null) recibos_r9;
```
```json
[{"recibos_total":44,"recibos_con_actuacion":0,"recibos_r9":39}]
```

### Q12 — `emitir_recibo` en prod: ¿distingue `concepto_tipo`?

```sql
select position('actuacion' in pg_get_functiondef('public.emitir_recibo'::regproc)) pos_actuacion, position('concepto_tipo' in pg_get_functiondef('public.emitir_recibo'::regproc)) pos_concepto_tipo, position('beneficiario_id' in pg_get_functiondef('public.emitir_recibo'::regproc)) pos_benef;
```
```json
[{"pos_actuacion":0,"pos_concepto_tipo":0,"pos_benef":106}]
```

---

## Resumen de números

- Ratificados que largaron: R6 58, R8 57, R9 30 → con peón **0**, con capataz **0**, con sereno **0** en las tres.
- Reparto por caballo premiado: **92 %** generado (70/10/10/2); **8 %** sin generar.
- 8 % sin generar: R6 **1.174.368,00** · R8 **1.140.648,00** · R9 **564.096,67** · total **2.879.112,67**
  (+112.743,33 de la carrera provisional de R6 si se oficializa).
- Destino: **ninguna línea**. No va al entrenador (10 % exacto), no va al fondo del club (2 % exacto).
- Sub-líneas `actuacion` reales: **0**. Recibos con `actuacion`: **0 de 44**. Las 9 que existen (9999) cuelgan
  del `beneficiario_id` del entrenador → irían dentro de su recibo.

## Preguntas abiertas (de producto, no técnicas)

1. Si el caballo no tiene peón/capataz/sereno cargado, ¿ese 8 % es del propietario, del entrenador (que paga a
   su personal), del club, o no se paga? Hoy el sistema **no lo paga a nadie y no lo registra**.
2. En la práctica, ¿Dolores carga el personal de caballeriza en algún lado? En SGH el campo existe en
   `inscripciones.html` (texto libre) y nadie lo usó en ninguna reunión real.
3. Los montos de R6/R8/R9 ya cobrados (saldados administrativos incluidos) se liquidaron con el 92 %: si la
   respuesta a (1) es "va a alguien", hay un retroactivo de hasta 2.879.112,67.
4. Si el caballo tiene personal cargado pero **no** entrenador, las subs tampoco se generan (van colgadas del
   ítem del entrenador) — no ocurrió en datos, pero es el mismo agujero.

## Nota de proceso

- La rama `reports` local estaba divergida de `origin/reports` (1154 adelante / 6 atrás: `origin` fue reescrito
  en la auditoría de PII). **No se tocó la rama local.** Este informe se commiteó en un worktree sobre
  `origin/reports` y se pusheó como fast-forward de `origin/reports`.
