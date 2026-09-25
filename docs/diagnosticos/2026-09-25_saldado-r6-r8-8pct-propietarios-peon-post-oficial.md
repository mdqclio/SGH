# R6/R8: qué cubrió el saldado, el hueco de propietario de R6 y el peón cargado después de oficializar (SOLO LECTURA)

- Fecha: 2026-09-25
- Sigue a: `2026-09-25_peon-capataz-sereno-reparto-r6-r8-r9.md` (mismo tema, `reports` @ `5200736`)
- Código leído: `main` @ `a4ec2adf84c78dbaf4264f7ea561a5653d0dc35f` (`liquidaciones-engine.js`, `inscripciones.html`,
  `resultados.html`, `liquidaciones.html`, `ratificacion.html`, `migrations/`)
- Guards: `pwd` = /home/clio/dev/SGH · `select count(*) from spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
  (MCP `execute_sql` sobre ese proyecto; `current_database()` = `postgres`)
- **No se escribió nada en la base ni en el código.** Sólo `SELECT` por MCP y `git show`/`git grep` contra `main`.
- Anonimizado: los studs/caballerizas figuran como `C###` (sus nombres pueden ser nombres de personas); no hay
  nombres de propietarios, entrenadores, jockeys ni cobradores. Los caballos son del Stud Book (públicos).
- Reuniones: R6 `b02ca761-6f44-4720-86aa-a3c3099019ea` (2026-06-20) · R8 `7b6e003e-22e2-4629-bf55-f18560b1260f`
  (2026-08-16) · R9 `cafa37d6-89f4-45cb-a0d9-835bc27407e9`.

---

## Respuestas cortas

### 1. ¿Las 338 líneas saldadas cubren el 92 % o alguien cargó el 8 % a mano?

**Cubren lo que generó el motor, nada más. Nadie cargó líneas por el 8 %.**

- Las 338 son exactamente las líneas que el motor había generado: 332 del saldado del 28/08 más 6 del
  recibo N° 4 (una prueba de Valeria sobre R8), que se revirtió y se sumó al saldado ese mismo día. Todas
  tienen la marca `[REGULARIZACION 2026-08-28 …]`, y las 6 además `[REVERSION 2026-08-28 …]`. Todas
  tienen `pagado_at = 2026-08-28 15:00:00+00`.
- En R6+R8 hay **417 líneas hoy = 192 + 225 del día del saldado**: no se creó ni se borró ninguna
  desde entonces. **0** líneas `actuacion`. **0** líneas con peón/capataz/sereno o "A redistribuir" en el
  concepto o la descripción. Los únicos `concepto_tipo` son `premio`, `bono`, `incentivo_jockey`,
  `incentivo_entrenador` y `fondo_solidario`.
- Por caballo, el premio saldado se reparte 70/10/10 exacto, y el fondo del 2 % quedó `impago` (no es de
  una persona). O sea: **el sistema registra como pagado el 92 % como mucho, y sólo en los roles que
  tenían línea**. El 8 % no está en ninguna línea, ni pagada ni impaga.
- **Si por fuera se pagó el 100 % o el 92 %, la base no lo sabe.** El saldado no copió montos en papel:
  marcó como `pagado` las líneas que existían. Ni el plan ni la ejecución (28/08) mencionan montos reales
  pagados ni el 8 %. La premisa fue *"Fede y Valeria acordaron que todo R6 y R8 se pagó por fuera"*, sin
  verificar línea por línea. Para saberlo hay que preguntar o mirar los recibos en papel.
- Además, lo que el sistema tiene como "saldado" es **menos del 92 %** del premio en R6. Faltan las líneas de
  propietario de 25 caballos (punto 2), así que R6 registra como pagado sólo el **36,4 %** del premio
  teórico (medido en el informe anterior, Q5). R8 registra el 88,7 %.

### 2. El hueco de propietario de R6 ($8.154.655,60): ¿cuántos caballos y de qué tipo?

**25 caballos** (1°–5° de 7 carreras oficiales). Se abren en cuatro grupos que suman el hueco al centavo:

| Grupo | Caballos | 70 % sin línea | Qué pasa |
|---|---:|---:|---|
| **A** — la inscripción **hoy tiene** `propietario_id` | 4 | 430.290,00 | Al liquidar no tenían propietario. Se les asignó el **2026-09-11 21:07:26 UTC**, los 4 en la misma transacción (`service_role`, sin usuario), es decir **después** de liquidar y de saldar. |
| **B** — el stud **tiene titular en el padrón** (`caballeriza_responsables` activo, con `propietario_id`), pero la inscripción no | 8 | 3.004.761,55 | El propietario **existe en el sistema**. Falta derivarlo a la inscripción: la derivación (`trg_insc_set_propietario`) sólo corre en `INSERT` o en `UPDATE OF caballeriza_id`. |
| **C** — el stud **no** tiene titular, pero **el mismo caballo** tiene propietario en otra inscripción | 1 | 172.900,00 | KUCCINI (C005): el propietario está en el sistema por otro camino, no por el stud. |
| **D** — **sin propietario en el sistema** | 12 | 4.546.704,05 | Stud sin ningún responsable (ni inactivos), sin `spc_propietarios` (tabla vacía), ninguna otra inscripción del caballo ni del stud con propietario, y ningún propietario con el nombre del stud. 12 caballos de 11 studs (C002 tiene dos). |
| **Total** | **25** | **8.154.655,60** | = el hueco del informe anterior |

Resumen: **13 de los 25 tienen propietario en el sistema, sin asignar a la inscripción** (A + B + C =
$3.607.951,55), y **12 no tienen propietario en ningún lado** ($4.546.704,05).

⚠ **Hallazgo lateral, sin tocar.** El grupo A ya tiene `propietario_id`. Si alguien recalcula R6, el motor
genera 4 líneas de propietario **nuevas**, `impago` (son 3° a 5°, no se retienen), que aparecerían
**cobrables en Pagos** en una reunión que se dio por saldada. En R8 pasa lo mismo con 4 de propietario, 4 de
entrenador y 1 de jockey. En total R6+R8 son **13 líneas, $895.823,20, 11 impagas y 2 retenidas** (Q9). R6 tiene
además una carrera `provisional`: oficializarla desde `resultados.html` **recalcula la reunión entera**
(`resultados.html:1670`), así que dispara esto solo, sin que nadie apriete "Recalcular".

### 3. ¿Hay algún control que exija peón? ¿Y si se carga después de oficializar?

**No hay ningún control.** Ni al ratificar ni al oficializar, ni en el front ni en la base:

- `ratificacion.html`, `resultados.html`, `portal.html` y `carta-llamados.html` no mencionan `peon`,
  `capataz` ni `sereno`. El único lugar donde se carga es `inscripciones.html` (texto libre opcional,
  `:288-289`, `:836`: `peon: … .trim() || null`).
- En la base no hay `CHECK` que los toque (el único `CHECK` de `inscripciones` es el rango de
  `peso_balanza`) y **ninguna función** del esquema `public` menciona `peon`. Ningún trigger los mira: los
  cuatro de `inscripciones` son auditoría, `updated_at`, derivar propietario y el guard de monta.

**Cargarlo después de oficializar se puede, y no recalcula nada:**

- `inscripciones.html` muestra ✏️ en todas las inscripciones (`:690`), sin mirar si la carrera está oficial,
  y `saveRecord()` (`:821-856`) hace un `UPDATE` directo **sin llamar al motor**.
- El payload lleva el `jockey_titular_id`, así que dispara `trg_insc_monta_oficial`. Pero el guard sale
  por `IF NEW.jockey_titular_id IS NOT DISTINCT FROM OLD.jockey_titular_id THEN RETURN NEW` y, si el jockey
  no cambió, pasa.
- **La línea no aparece en el momento.** Aparece en el **próximo recálculo de la reunión**, que hoy sólo
  ocurre al: oficializar cualquier carrera de esa reunión (`resultados.html:1670`), des-oficializar una
  (`:1699`), cambiar una monta en carrera oficial (`:2132`) o apretar "🔄 Recalcular" en
  `liquidaciones.html` (`:262` → `:2377`).
- **Cuando aparece**, lo hace como línea **nueva**. La clave de dedup incluye el texto del concepto
  (`lineKey`, `liquidaciones-engine.js:37-41`), y `Peón — <nombre>` no está entre las pagadas. Se cuelga
  del **entrenador** (`beneficiario_id` = entrenador, `:317-328`), `retenido` si el caballo fue 1° o 2° y
  `impago` si no (`:307`).
  - Aunque el 10 % del entrenador ya esté pagado (R6/R8 saldadas, o cobrado con recibo en R9), la sub-línea
    se crea igual y queda **cobrable en Pagos** dentro de la deuda del entrenador.
  - Si después se **cambia el nombre** del peón y la sub-línea anterior ya estaba pagada, el recálculo crea
    **otra** (clave distinta) y preserva la pagada: doble pago del 4 %. Si no estaba pagada, se borra y se
    regenera con el nombre nuevo.
- Si el caballo **no tiene entrenador**, la sub-línea no nace aunque haya peón (informe anterior,
  `addActor` sale por `if (!id) return;`).

---

## Queries y salidas crudas

### Q1 — Guard

```sql
select (select count(*) from spcs) spcs, current_database() db;
```
```json
[{"spcs":210,"db":"postgres"}]
```

### Q2 — Líneas de R6/R8/R9 por tipo, estado, recibo y marca de regularización

```sql
select r.numero, d.concepto_tipo::text, d.estado_linea::text, (d.recibo_id is not null) con_recibo,
 (d.descripcion ilike '%REGULARIZACION%') con_nota_regul, count(*) n, round(sum(d.monto_bruto),2) bruto
from liquidacion_detalle d join reuniones r on r.id=d.reunion_id
where r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' and r.numero in (6,8,9)
group by 1,2,3,4,5 order by 1,2,3,4,5;
```
```json
[{"numero":6,"concepto_tipo":"bono","estado_linea":"pagado","con_recibo":false,"con_nota_regul":true,"n":5,"bruto":"500000.00"},{"numero":6,"concepto_tipo":"fondo_solidario","estado_linea":"impago","con_recibo":false,"con_nota_regul":false,"n":35,"bruto":"293591.99"},{"numero":6,"concepto_tipo":"incentivo_entrenador","estado_linea":"pagado","con_recibo":false,"con_nota_regul":true,"n":51,"bruto":"510000.00"},{"numero":6,"concepto_tipo":"incentivo_jockey","estado_linea":"pagado","con_recibo":false,"con_nota_regul":true,"n":21,"bruto":"1050000.00"},{"numero":6,"concepto_tipo":"premio","estado_linea":"pagado","con_recibo":false,"con_nota_regul":true,"n":80,"bruto":"5056984.19"},{"numero":8,"concepto_tipo":"bono","estado_linea":"pagado","con_recibo":false,"con_nota_regul":true,"n":12,"bruto":"1200000.00"},{"numero":8,"concepto_tipo":"bono","estado_linea":"pagado","con_recibo":true,"con_nota_regul":false,"n":1,"bruto":"100000.00"},{"numero":8,"concepto_tipo":"fondo_solidario","estado_linea":"impago","con_recibo":false,"con_nota_regul":false,"n":40,"bruto":"285162.00"},{"numero":8,"concepto_tipo":"incentivo_entrenador","estado_linea":"pagado","con_recibo":false,"con_nota_regul":true,"n":42,"bruto":"420000.00"},{"numero":8,"concepto_tipo":"incentivo_jockey","estado_linea":"pagado","con_recibo":false,"con_nota_regul":true,"n":18,"bruto":"900000.00"},{"numero":8,"concepto_tipo":"incentivo_jockey","estado_linea":"pagado","con_recibo":true,"con_nota_regul":false,"n":1,"bruto":"50000.00"},{"numero":8,"concepto_tipo":"premio","estado_linea":"pagado","con_recibo":false,"con_nota_regul":true,"n":109,"bruto":"12286756.66"},{"numero":8,"concepto_tipo":"premio","estado_linea":"pagado","con_recibo":true,"con_nota_regul":false,"n":2,"bruto":"80000.00"},{"numero":9,"concepto_tipo":"bono","estado_linea":"impago","con_recibo":false,"con_nota_regul":false,"n":1,"bruto":"100000.00"},{"numero":9,"concepto_tipo":"bono","estado_linea":"pagado","con_recibo":false,"con_nota_regul":true,"n":2,"bruto":"200000.00"},{"numero":9,"concepto_tipo":"bono","estado_linea":"pagado","con_recibo":true,"con_nota_regul":false,"n":2,"bruto":"200000.00"},{"numero":9,"concepto_tipo":"fondo_solidario","estado_linea":"impago","con_recibo":false,"con_nota_regul":false,"n":23,"bruto":"141024.16"},{"numero":9,"concepto_tipo":"incentivo_entrenador","estado_linea":"impago","con_recibo":false,"con_nota_regul":false,"n":11,"bruto":"110000.00"},{"numero":9,"concepto_tipo":"incentivo_entrenador","estado_linea":"pagado","con_recibo":true,"con_nota_regul":false,"n":19,"bruto":"190000.00"},{"numero":9,"concepto_tipo":"incentivo_jockey","estado_linea":"impago","con_recibo":false,"con_nota_regul":false,"n":3,"bruto":"180000.00"},{"numero":9,"concepto_tipo":"incentivo_jockey","estado_linea":"pagado","con_recibo":false,"con_nota_regul":true,"n":3,"bruto":"180000.00"},{"numero":9,"concepto_tipo":"incentivo_jockey","estado_linea":"pagado","con_recibo":true,"con_nota_regul":false,"n":14,"bruto":"840000.00"},{"numero":9,"concepto_tipo":"premio","estado_linea":"impago","con_recibo":false,"con_nota_regul":false,"n":12,"bruto":"518700.00"},{"numero":9,"concepto_tipo":"premio","estado_linea":"pagado","con_recibo":true,"con_nota_regul":false,"n":27,"bruto":"794850.00"},{"numero":9,"concepto_tipo":"premio","estado_linea":"retenido","con_recibo":false,"con_nota_regul":false,"n":30,"bruto":"5032537.52"}]
```

Pagadas sin recibo: R6 = 5 + 51 + 21 + 80 = **157**; R8 = 12 + 42 + 18 + 109 = **181**; total **338**.

### Q3 — Las 338: marca, estado previo y timestamp

(Primer intento pedía `d.created_at` y falló: `ERROR: 42703: column d.created_at does not exist` —
`liquidacion_detalle` no tiene `created_at`.)

```sql
select r.numero, substring(d.descripcion from '\[REGULARIZACION [0-9-]+: [a-z ]+') marca, substring(d.descripcion from 'estado previo=[a-z]+') previo,
 d.pagado_at, count(*) n, round(sum(d.monto_bruto),2) bruto
from liquidacion_detalle d join reuniones r on r.id=d.reunion_id
where r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' and r.numero in (6,8) and d.estado_linea='pagado' and d.recibo_id is null
group by 1,2,3,4 order by 1,2,3,4;
```
```json
[{"numero":6,"marca":"[REGULARIZACION 2026-08-28: saldado administrativo pre","previo":"estado previo=impago","pagado_at":"2026-08-28 15:00:00+00","n":125,"bruto":"3588730.00"},{"numero":6,"marca":"[REGULARIZACION 2026-08-28: saldado administrativo pre","previo":"estado previo=retenido","pagado_at":"2026-08-28 15:00:00+00","n":32,"bruto":"3528254.19"},{"numero":8,"marca":"[REGULARIZACION 2026-08-28: saldado administrativo pre","previo":"estado previo=impago","pagado_at":"2026-08-28 15:00:00+00","n":135,"bruto":"5039380.00"},{"numero":8,"marca":"[REGULARIZACION 2026-08-28: saldado administrativo pre","previo":"estado previo=retenido","pagado_at":"2026-08-28 15:00:00+00","n":46,"bruto":"9767376.66"}]
```

Contra el plan del saldado (`reports` local, `2026-08-28_plan-saldado-r6-r8.md` §1.4): R6 125/32 idéntico; R8
`impago` era **129 / 4.976.680,00** y hoy es **135 / 5.039.380,00** (+6, +62.700,00). Las líneas de R8 con
recibo real eran **10 / 292.700,00** y hoy son **4 / 230.000,00** (−6, −62.700,00). Es el recibo N° 4:

### Q4 — De dónde salen las 6 extra: el recibo N° 4

```sql
select a.created_at, a.accion, a.datos_antes->>'numero_recibo' nro, a.datos_antes->>'estado' estado, a.datos_antes->>'emitido_at' emitido,
 a.datos_antes->>'total_premios' total, a.datos_antes->>'club_id' club, a.usuario_id is not null con_usuario
from auditoria a where a.tabla='recibos' and a.accion='DELETE'
 and (a.datos_antes->>'emitido_at')::timestamptz < '2026-08-29' order by a.created_at;
```
```json
[{"created_at":"2026-06-08 04:07:32.817874+00","accion":"DELETE","nro":"1","estado":"emitido","emitido":"2026-06-08T04:07:30.0303+00:00","total":"3000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-06-08 04:07:33.013212+00","accion":"DELETE","nro":"2","estado":"emitido","emitido":"2026-06-08T04:07:30.860851+00:00","total":"1500.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-06-08 06:02:51.969133+00","accion":"DELETE","nro":"2","estado":"emitido","emitido":"2026-06-08T06:02:49.337574+00:00","total":"5000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-06-09 18:50:10.212234+00","accion":"DELETE","nro":"1","estado":"emitido","emitido":"2026-06-08T04:16:22.005817+00:00","total":"100000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-06-09 18:50:10.212234+00","accion":"DELETE","nro":"2","estado":"emitido","emitido":"2026-06-09T02:47:37.504008+00:00","total":"72649.99","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-06-09 18:50:10.212234+00","accion":"DELETE","nro":"3","estado":"emitido","emitido":"2026-06-09T03:01:26.380438+00:00","total":"122000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-06-09 18:50:10.212234+00","accion":"DELETE","nro":"4","estado":"emitido","emitido":"2026-06-09T03:03:08.890441+00:00","total":"84000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-06-09 18:50:10.212234+00","accion":"DELETE","nro":"5","estado":"emitido","emitido":"2026-06-09T04:01:36.686954+00:00","total":"70000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-06-09 18:50:10.212234+00","accion":"DELETE","nro":"6","estado":"emitido","emitido":"2026-06-09T04:04:49.206478+00:00","total":"122000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-06-10 01:30:50.997288+00","accion":"DELETE","nro":"900001","estado":"emitido","emitido":"2026-06-10T01:30:14.409996+00:00","total":"0.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-06-10 01:30:50.997288+00","accion":"DELETE","nro":"900002","estado":"emitido","emitido":"2026-06-10T01:30:14.409996+00:00","total":"0.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-01 03:57:49.417282+00","accion":"DELETE","nro":"999676","estado":"emitido","emitido":"2026-08-01T03:57:42.29338+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-01 04:47:27.12962+00","accion":"DELETE","nro":"999531","estado":"emitido","emitido":"2026-08-01T04:47:18.909371+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-01 04:47:56.274319+00","accion":"DELETE","nro":"999504","estado":"emitido","emitido":"2026-08-01T04:47:48.414212+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-01 04:52:07.278438+00","accion":"DELETE","nro":"999126","estado":"emitido","emitido":"2026-08-01T04:52:00.004826+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-01 04:55:09.853752+00","accion":"DELETE","nro":"999095","estado":"emitido","emitido":"2026-08-01T04:55:02.80992+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-01 04:55:48.676779+00","accion":"DELETE","nro":"999307","estado":"emitido","emitido":"2026-08-01T04:55:40.819385+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-01 06:13:34.310282+00","accion":"DELETE","nro":"999137","estado":"emitido","emitido":"2026-08-01T06:13:24.909629+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-04 02:46:00.002979+00","accion":"DELETE","nro":"999865","estado":"emitido","emitido":"2026-08-04T02:45:51.323743+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-04 03:12:51.535556+00","accion":"DELETE","nro":"999709","estado":"emitido","emitido":"2026-08-04T03:12:32.013697+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-04 03:45:45.38473+00","accion":"DELETE","nro":"999588","estado":"emitido","emitido":"2026-08-04T03:45:25.458172+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-06 15:06:55.178655+00","accion":"DELETE","nro":"999571","estado":"emitido","emitido":"2026-08-06T15:06:34.274824+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-06 16:06:15.577536+00","accion":"DELETE","nro":"999794","estado":"emitido","emitido":"2026-08-06T16:05:52.14823+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-20 01:16:29.812468+00","accion":"DELETE","nro":"999649","estado":"emitido","emitido":"2026-08-20T01:16:07.412611+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-23 14:54:45.044559+00","accion":"DELETE","nro":"999769","estado":"emitido","emitido":"2026-08-23T14:54:23.411051+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-23 14:55:34.908644+00","accion":"DELETE","nro":"999567","estado":"emitido","emitido":"2026-08-23T14:55:14.653804+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-23 14:56:17.292717+00","accion":"DELETE","nro":"999746","estado":"emitido","emitido":"2026-08-23T14:55:57.090503+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-23 14:59:36.931883+00","accion":"DELETE","nro":"999891","estado":"emitido","emitido":"2026-08-23T14:59:16.175701+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-23 15:07:54.669801+00","accion":"DELETE","nro":"999600","estado":"emitido","emitido":"2026-08-23T15:07:33.905438+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-24 23:54:45.45063+00","accion":"DELETE","nro":"999224","estado":"emitido","emitido":"2026-08-24T23:54:26.038972+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-25 19:23:41.726996+00","accion":"DELETE","nro":"999089","estado":"emitido","emitido":"2026-08-25T19:23:19.829797+00:00","total":"2000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-28 20:31:22.980558+00","accion":"DELETE","nro":"4","estado":"emitido","emitido":"2026-08-28T18:13:59.248561+00:00","total":"62700.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-28 20:56:41.032798+00","accion":"DELETE","nro":"5","estado":"emitido","emitido":"2026-08-28T20:55:41.9481+00:00","total":"62700.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-28 20:56:41.032798+00","accion":"DELETE","nro":"6","estado":"emitido","emitido":"2026-08-28T20:55:45.647734+00:00","total":"10000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-28 20:57:40.030153+00","accion":"DELETE","nro":"7","estado":"emitido","emitido":"2026-08-28T20:57:32.106742+00:00","total":"62700.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-28 20:57:40.233127+00","accion":"DELETE","nro":"8","estado":"emitido","emitido":"2026-08-28T20:57:34.963455+00:00","total":"10000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-28 20:58:23.358283+00","accion":"DELETE","nro":"9","estado":"emitido","emitido":"2026-08-28T20:58:15.580756+00:00","total":"62700.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-28 20:58:23.566267+00","accion":"DELETE","nro":"10","estado":"emitido","emitido":"2026-08-28T20:58:19.291337+00:00","total":"10000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-28 20:59:43.819157+00","accion":"DELETE","nro":"11","estado":"emitido","emitido":"2026-08-28T20:59:37.844034+00:00","total":"62700.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-28 20:59:44.032611+00","accion":"DELETE","nro":"12","estado":"emitido","emitido":"2026-08-28T20:59:40.080356+00:00","total":"10000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-28 20:59:55.133623+00","accion":"DELETE","nro":"13","estado":"emitido","emitido":"2026-08-28T20:59:49.209854+00:00","total":"62700.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-28 20:59:55.339922+00","accion":"DELETE","nro":"14","estado":"emitido","emitido":"2026-08-28T20:59:51.753359+00:00","total":"10000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-28 21:00:30.457033+00","accion":"DELETE","nro":"15","estado":"emitido","emitido":"2026-08-28T21:00:21.167311+00:00","total":"62700.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-28 21:00:30.65218+00","accion":"DELETE","nro":"16","estado":"emitido","emitido":"2026-08-28T21:00:25.275768+00:00","total":"10000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-28 21:00:44.280505+00","accion":"DELETE","nro":"17","estado":"emitido","emitido":"2026-08-28T21:00:37.051791+00:00","total":"62700.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-28 21:00:44.517728+00","accion":"DELETE","nro":"18","estado":"emitido","emitido":"2026-08-28T21:00:39.985803+00:00","total":"10000.00","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","con_usuario":false},{"created_at":"2026-08-29 03:53:36.242364+00","accion":"DELETE","nro":"1","estado":"emitido","emitido":"2026-08-28T21:20:30.223228+00:00","total":"92000.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false},{"created_at":"2026-08-30 02:59:05.965913+00","accion":"DELETE","nro":"7","estado":"anulado","emitido":"2026-08-24T02:58:57.428+00:00","total":"344444.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false},{"created_at":"2026-08-30 03:00:17.12172+00","accion":"DELETE","nro":"7","estado":"anulado","emitido":"2026-08-24T03:00:05.593+00:00","total":"344444.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false},{"created_at":"2026-08-30 03:02:10.364639+00","accion":"DELETE","nro":"7","estado":"anulado","emitido":"2026-08-24T03:02:02.427+00:00","total":"344444.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false},{"created_at":"2026-08-30 03:02:43.454477+00","accion":"DELETE","nro":"7","estado":"anulado","emitido":"2026-08-24T03:02:34.743+00:00","total":"344444.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false},{"created_at":"2026-08-30 03:03:15.35735+00","accion":"DELETE","nro":"7","estado":"anulado","emitido":"2026-08-24T03:03:07.268+00:00","total":"344444.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false},{"created_at":"2026-08-30 03:03:45.89771+00","accion":"DELETE","nro":"7","estado":"anulado","emitido":"2026-08-24T03:03:38.817+00:00","total":"344444.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false},{"created_at":"2026-08-30 03:04:16.07459+00","accion":"DELETE","nro":"7","estado":"anulado","emitido":"2026-08-24T03:04:08.969+00:00","total":"344444.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false},{"created_at":"2026-08-30 03:05:12.10714+00","accion":"DELETE","nro":"7","estado":"anulado","emitido":"2026-08-24T03:05:04.168+00:00","total":"344444.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false},{"created_at":"2026-08-30 05:05:30.054303+00","accion":"DELETE","nro":"7","estado":"anulado","emitido":"2026-08-24T05:05:22.896+00:00","total":"344444.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false},{"created_at":"2026-08-30 05:08:11.79924+00","accion":"DELETE","nro":"7","estado":"anulado","emitido":"2026-08-24T05:08:04.87+00:00","total":"344444.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false},{"created_at":"2026-08-30 18:56:07.249243+00","accion":"DELETE","nro":"7","estado":"anulado","emitido":"2026-08-24T18:56:01.654+00:00","total":"344444.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false},{"created_at":"2026-08-30 18:57:33.202344+00","accion":"DELETE","nro":"7","estado":"anulado","emitido":"2026-08-24T18:57:25.991+00:00","total":"344444.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false},{"created_at":"2026-08-30 18:58:42.938484+00","accion":"DELETE","nro":"7","estado":"anulado","emitido":"2026-08-24T18:58:35.764+00:00","total":"344444.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false},{"created_at":"2026-08-30 18:59:21.664133+00","accion":"DELETE","nro":"7","estado":"anulado","emitido":"2026-08-24T18:59:14.304+00:00","total":"344444.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false},{"created_at":"2026-08-30 19:46:12.973764+00","accion":"DELETE","nro":"7","estado":"anulado","emitido":"2026-08-24T19:46:04.406+00:00","total":"344444.00","club":"a6da7e40-1515-45dc-8933-4eef33ce937a","con_usuario":false}]
```

La fila relevante es **nro 4, $62.700,00, emitido 2026-08-28 18:13:59 UTC, borrado 20:31:22 UTC**. Las demás
son de desarrollo y de probes: los números 999xxx y 5–18, y el club `a6da7e40-…` es "Mi Club Hípico". El
revert está documentado en `reports` local, `2026-08-28_ejecucion-revert-recibo-4.md`: *"6 líneas soltadas
+ 1 recibo borrado"*, marcadas con la misma regularización que el saldado más `[REVERSION 2026-08-28: recibo
N°4 (prueba) borrado; la linea habia quedado fuera del saldado por tener recibo_id]`. Por eso son 338 y no 332.

Recibos que sobreviven de antes del 01/09 y a qué reunión apuntan:

```sql
select rc.numero_recibo, rc.estado, rc.emitido_at, rc.anulado_at, rc.total_premios, rc.neto_a_cobrar,
 (select count(*) from liquidacion_detalle d where d.recibo_id=rc.id) lineas_hoy
from recibos rc where rc.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' and rc.emitido_at < '2026-09-01' order by rc.numero_recibo;
```
```json
[{"numero_recibo":1,"estado":"emitido","emitido_at":"2026-08-16 18:46:44.652601+00","anulado_at":null,"total_premios":"70000.00","neto_a_cobrar":"70000.00","lineas_hoy":1},{"numero_recibo":2,"estado":"emitido","emitido_at":"2026-08-28 12:58:16.28662+00","anulado_at":null,"total_premios":"100000.00","neto_a_cobrar":"100000.00","lineas_hoy":1},{"numero_recibo":3,"estado":"emitido","emitido_at":"2026-08-28 14:10:26.492625+00","anulado_at":null,"total_premios":"60000.00","neto_a_cobrar":"60000.00","lineas_hoy":2},{"numero_recibo":9001,"estado":"emitido","emitido_at":"2026-06-10 02:33:53.506047+00","anulado_at":null,"total_premios":"170000.00","neto_a_cobrar":"170000.00","lineas_hoy":2},{"numero_recibo":9002,"estado":"emitido","emitido_at":"2026-06-10 02:33:53.506047+00","anulado_at":null,"total_premios":"700000.00","neto_a_cobrar":"700000.00","lineas_hoy":2}]
```

```sql
select rc.numero_recibo, r.numero reunion, d.concepto_tipo::text, d.estado_linea::text, d.monto_bruto, d.pagado_at
from liquidacion_detalle d join recibos rc on rc.id=d.recibo_id join reuniones r on r.id=d.reunion_id
where rc.numero_recibo in (1,2,3,9001,9002) order by 1;
```
```json
[{"numero_recibo":1,"reunion":8,"concepto_tipo":"premio","estado_linea":"pagado","monto_bruto":"70000.00","pagado_at":"2026-08-16 18:46:44.652601+00"},{"numero_recibo":2,"reunion":8,"concepto_tipo":"bono","estado_linea":"pagado","monto_bruto":"100000.00","pagado_at":"2026-08-28 12:58:16.28662+00"},{"numero_recibo":3,"reunion":8,"concepto_tipo":"premio","estado_linea":"pagado","monto_bruto":"10000.00","pagado_at":"2026-08-28 14:10:26.492625+00"},{"numero_recibo":3,"reunion":8,"concepto_tipo":"incentivo_jockey","estado_linea":"pagado","monto_bruto":"50000.00","pagado_at":"2026-08-28 14:10:26.492625+00"},{"numero_recibo":9001,"reunion":9999,"concepto_tipo":"premio","estado_linea":"pagado","monto_bruto":"120000.00","pagado_at":null},{"numero_recibo":9001,"reunion":9999,"concepto_tipo":"incentivo_jockey","estado_linea":"pagado","monto_bruto":"50000.00","pagado_at":null},{"numero_recibo":9002,"reunion":9999,"concepto_tipo":"premio","estado_linea":"pagado","monto_bruto":"600000.00","pagado_at":null},{"numero_recibo":9002,"reunion":9999,"concepto_tipo":"bono","estado_linea":"pagado","monto_bruto":"100000.00","pagado_at":null}]
```

Las 4 líneas de R8 con recibo real que quedan son las de los recibos 1, 2 y 3 ($230.000,00). 9001 y 9002
son de la 9999.

### Q5 — Las líneas de R6/R8 por rol: ¿hay algo que no haya generado el motor?

```sql
with l as (
 select r.numero, d.*, case when d.concepto_tipo='premio' and d.descripcion like '%— Propietario%' then 'premio_prop'
  when d.concepto_tipo='premio' and d.descripcion like '%— Entrenador%' then 'premio_entr'
  when d.concepto_tipo='premio' and d.descripcion like '%— Jockey%' then 'premio_jock'
  when d.concepto_tipo='premio' then 'premio_OTRO' else d.concepto_tipo::text end rol
 from liquidacion_detalle d join reuniones r on r.id=d.reunion_id
 where d.reunion_id in ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f')
)
select numero, rol, estado_linea::text, (recibo_id is not null) con_recibo,
 count(*) n, round(sum(monto_bruto),2) bruto,
 count(*) filter (where descripcion like '%[REGULARIZACION 2026-08-28%') marca_saldado,
 count(*) filter (where descripcion like '%[REVERSION 2026-08-28%') marca_reversion_rec4
from l group by 1,2,3,4 order by 1,2,3,4;
```
```json
[{"numero":6,"rol":"bono","estado_linea":"pagado","con_recibo":false,"n":5,"bruto":"500000.00","marca_saldado":5,"marca_reversion_rec4":0},{"numero":6,"rol":"fondo_solidario","estado_linea":"impago","con_recibo":false,"n":35,"bruto":"293591.99","marca_saldado":0,"marca_reversion_rec4":0},{"numero":6,"rol":"incentivo_entrenador","estado_linea":"pagado","con_recibo":false,"n":51,"bruto":"510000.00","marca_saldado":51,"marca_reversion_rec4":0},{"numero":6,"rol":"incentivo_jockey","estado_linea":"pagado","con_recibo":false,"n":21,"bruto":"1050000.00","marca_saldado":21,"marca_reversion_rec4":0},{"numero":6,"rol":"premio_entr","estado_linea":"pagado","con_recibo":false,"n":35,"bruto":"1467960.01","marca_saldado":35,"marca_reversion_rec4":0},{"numero":6,"rol":"premio_jock","estado_linea":"pagado","con_recibo":false,"n":35,"bruto":"1467960.01","marca_saldado":35,"marca_reversion_rec4":0},{"numero":6,"rol":"premio_prop","estado_linea":"pagado","con_recibo":false,"n":10,"bruto":"2121064.17","marca_saldado":10,"marca_reversion_rec4":0},{"numero":8,"rol":"bono","estado_linea":"pagado","con_recibo":false,"n":12,"bruto":"1200000.00","marca_saldado":12,"marca_reversion_rec4":0},{"numero":8,"rol":"bono","estado_linea":"pagado","con_recibo":true,"n":1,"bruto":"100000.00","marca_saldado":0,"marca_reversion_rec4":0},{"numero":8,"rol":"fondo_solidario","estado_linea":"impago","con_recibo":false,"n":40,"bruto":"285162.00","marca_saldado":0,"marca_reversion_rec4":0},{"numero":8,"rol":"incentivo_entrenador","estado_linea":"pagado","con_recibo":false,"n":42,"bruto":"420000.00","marca_saldado":42,"marca_reversion_rec4":3},{"numero":8,"rol":"incentivo_jockey","estado_linea":"pagado","con_recibo":false,"n":18,"bruto":"900000.00","marca_saldado":18,"marca_reversion_rec4":0},{"numero":8,"rol":"incentivo_jockey","estado_linea":"pagado","con_recibo":true,"n":1,"bruto":"50000.00","marca_saldado":0,"marca_reversion_rec4":0},{"numero":8,"rol":"premio_entr","estado_linea":"pagado","con_recibo":false,"n":36,"bruto":"1368868.33","marca_saldado":36,"marca_reversion_rec4":3},{"numero":8,"rol":"premio_jock","estado_linea":"pagado","con_recibo":false,"n":38,"bruto":"1405810.00","marca_saldado":38,"marca_reversion_rec4":0},{"numero":8,"rol":"premio_jock","estado_linea":"pagado","con_recibo":true,"n":1,"bruto":"10000.00","marca_saldado":0,"marca_reversion_rec4":0},{"numero":8,"rol":"premio_prop","estado_linea":"pagado","con_recibo":false,"n":35,"bruto":"9512078.33","marca_saldado":35,"marca_reversion_rec4":0},{"numero":8,"rol":"premio_prop","estado_linea":"pagado","con_recibo":true,"n":1,"bruto":"70000.00","marca_saldado":0,"marca_reversion_rec4":0}]
```

`premio_OTRO` = 0 filas: todo `premio` es de propietario, entrenador o jockey. En R6 el entrenador y el
jockey suman lo mismo (1.467.960,01 = 10 % de 14.679.600,1), y el propietario tiene sólo 10 líneas de 35.

```sql
select 'pagado_sin_recibo_toda_base' k, count(*) n from liquidacion_detalle where estado_linea='pagado' and recibo_id is null
union all select 'marca_saldado_0828', count(*) from liquidacion_detalle where descripcion like '%[REGULARIZACION 2026-08-28%'
union all select 'marca_reversion_rec4', count(*) from liquidacion_detalle where descripcion like '%[REVERSION 2026-08-28%'
union all select 'marca_regul_0920_r9', count(*) from liquidacion_detalle where descripcion like '%[REGULARIZACION 2026-09-20%'
union all select 'r6r8_lineas_total', count(*) from liquidacion_detalle where reunion_id in ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f')
union all select 'r6r8_actuacion', count(*) from liquidacion_detalle where concepto_tipo='actuacion' and reunion_id in ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f')
union all select 'r6r8_concepto_con_peon_capataz_sereno', count(*) from liquidacion_detalle where reunion_id in ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f') and (concepto ilike '%pe_n%' or concepto ilike '%capataz%' or concepto ilike '%sereno%' or descripcion ilike '%redistribu%');
```
```json
[{"k":"pagado_sin_recibo_toda_base","n":343},{"k":"marca_saldado_0828","n":338},{"k":"marca_reversion_rec4","n":6},{"k":"marca_regul_0920_r9","n":5},{"k":"r6r8_lineas_total","n":417},{"k":"r6r8_actuacion","n":0},{"k":"r6r8_concepto_con_peon_capataz_sereno","n":0}]
```

343 = 338 (R6/R8, 28/08) + 5 (recibos manuales de R9, 20/09): en toda la base no hay otra línea `pagado` sin
recibo. 417 = 192 + 225, lo mismo que el plan del saldado (§1.5, "total líneas").

Búsqueda de montos reales pagados por fuera en los documentos del saldado (`reports` local):

```bash
for f in 2026-08-28_plan-saldado-r6-r8.md 2026-08-28_ejecucion-saldado-r6-r8.md 2026-08-28_plan-revert-recibo-4.md; do
  git show reports:docs/diagnosticos/$f | grep -n -i -E 'pe[oó]n|capataz|sereno|92|100 ?%|8 ?%|planilla|papel|monto real|lo que se pag|cu[aá]nto se pag|propietario_id'
done
```
Resultado: sólo aparecen coincidencias de `92` dentro de UUIDs y montos (`292.700,00`), una de
`propietario_id` en el SELECT del recibo 4 y *"criterio al 100% (R8, beneficiario profesional…)"*, que habla
de otra cosa. **No hay ninguna mención de peón/capataz/sereno, del 8 %, ni de montos pagados en papel.**

### Q6 — Pregunta 2: los 25 caballos de R6 sin línea de propietario, uno por uno

```sql
with prem as (
 select distinct d.inscripcion_id, d.posicion, d.monto_bruto/0.02 as premio_aprox from liquidacion_detalle d
 where d.reunion_id='b02ca761-6f44-4720-86aa-a3c3099019ea' and d.concepto_tipo='fondo_solidario'
), sinprop as (
 select p.* from prem p where not exists (select 1 from liquidacion_detalle d where d.inscripcion_id=p.inscripcion_id and d.concepto_tipo='premio' and d.descripcion like '%— Propietario%')
), x as (
 select s.inscripcion_id, s.posicion, round(s.premio_aprox*0.70,2) prop_70, sp.nombre caballo, ca.numero_carrera_programa carr,
  i.propietario_id is not null insc_tiene_prop_hoy, i.caballeriza_id is not null insc_tiene_caballeriza, cb.id cab_id,
  (select count(*) from caballeriza_responsables cr where cr.caballeriza_id=cb.id and cr.activo) resp_activos,
  (select count(*) from caballeriza_responsables cr where cr.caballeriza_id=cb.id and cr.activo and cr.propietario_id is not null) resp_con_propietario,
  (select count(*) from caballeriza_responsables cr where cr.caballeriza_id=cb.id and cr.activo and cr.rol ilike 'propiet%') resp_rol_propietario,
  (select count(*) from propietarios pr where pr.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' and (upper(trim(pr.nombre))=upper(trim(cb.nombre)) or upper(trim(pr.nombre_stud))=upper(trim(cb.nombre)))) propietario_mismo_nombre_que_stud,
  (select count(*) from spc_propietarios x where x.spc_id=i.spc_id) spc_prop,
  (select count(*) from inscripciones i2 where i2.spc_id=i.spc_id and i2.propietario_id is not null) otras_insc_mismo_caballo_con_prop,
  nullif(trim(cb.responsable),'') is not null cab_texto_responsable
 from sinprop s join inscripciones i on i.id=s.inscripcion_id join spcs sp on sp.id=i.spc_id join carreras ca on ca.id=i.carrera_id
 left join caballerizas cb on cb.id=i.caballeriza_id
)
select 'C'||lpad(dense_rank() over (order by cab_id)::text,3,'0') stud_anon, * from x order by carr, posicion;
```
```json
[{"stud_anon":"C022","inscripcion_id":"35aaf81f-ce6e-4a84-b371-cf2e1502cc76","posicion":1,"prop_70":"1015000.00","caballo":"MONADESEDA","carr":1,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"fa04eea1-aacb-4ac9-9c6f-ad2e0e490b2d","resp_activos":0,"resp_con_propietario":0,"resp_rol_propietario":0,"propietario_mismo_nombre_que_stud":0,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":0,"cab_texto_responsable":false},{"stud_anon":"C007","inscripcion_id":"e7d7e085-286a-4f7a-8623-2b5237b2be4f","posicion":3,"prop_70":"168000.00","caballo":"GREAT ORPEN","carr":1,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"1eb1297a-f12f-4235-81ec-37728b21690b","resp_activos":0,"resp_con_propietario":0,"resp_rol_propietario":0,"propietario_mismo_nombre_que_stud":0,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":0,"cab_texto_responsable":false},{"stud_anon":"C011","inscripcion_id":"803a4268-69ef-4c71-a6c2-981abe494d39","posicion":4,"prop_70":"84000.00","caballo":"CONESERA","carr":1,"insc_tiene_prop_hoy":true,"insc_tiene_caballeriza":true,"cab_id":"7f7cee40-beed-42fb-807a-70c900259be5","resp_activos":1,"resp_con_propietario":1,"resp_rol_propietario":1,"propietario_mismo_nombre_que_stud":1,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":2,"cab_texto_responsable":false},{"stud_anon":"C002","inscripcion_id":"addc3bd4-67c9-4935-8afe-f402bf1d4afd","posicion":1,"prop_70":"617750.00","caballo":"CALAVERIANDO","carr":2,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"0ee13029-fc1c-4af0-a217-0d00e2a45c69","resp_activos":0,"resp_con_propietario":0,"resp_rol_propietario":0,"propietario_mismo_nombre_que_stud":0,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":0,"cab_texto_responsable":false},{"stud_anon":"C004","inscripcion_id":"bfabef7d-2fb2-4213-bc6b-07f807fc7452","posicion":2,"prop_70":"140204.05","caballo":"BAM BAM HITS","carr":2,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"1474737a-3b22-4f30-80ec-cb999a5958fa","resp_activos":0,"resp_con_propietario":0,"resp_rol_propietario":0,"propietario_mismo_nombre_que_stud":0,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":0,"cab_texto_responsable":false},{"stud_anon":"C021","inscripcion_id":"316fb581-3e10-442b-ac85-2e47c8850a99","posicion":3,"prop_70":"88550.00","caballo":"BENDITO PRESAGIO","carr":2,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"f25e7474-cc1b-4f1c-8ba2-6209a7e055aa","resp_activos":1,"resp_con_propietario":1,"resp_rol_propietario":1,"propietario_mismo_nombre_que_stud":1,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":1,"cab_texto_responsable":false},{"stud_anon":"C018","inscripcion_id":"785d802d-7e5c-4bd0-8bf6-455da36370b3","posicion":4,"prop_70":"70000.00","caballo":"EL MEJOR DUQUE","carr":2,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"d93188cf-6aa9-48e7-bacf-3f84ef955f68","resp_activos":0,"resp_con_propietario":0,"resp_rol_propietario":0,"propietario_mismo_nombre_que_stud":0,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":0,"cab_texto_responsable":false},{"stud_anon":"C001","inscripcion_id":"23ce0134-3db7-4549-a39f-a710e473acb4","posicion":5,"prop_70":"70000.00","caballo":"ASTUTO NOTES","carr":2,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"07d88cea-8985-41d7-b0a0-430bd8475288","resp_activos":1,"resp_con_propietario":1,"resp_rol_propietario":1,"propietario_mismo_nombre_que_stud":1,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":3,"cab_texto_responsable":false},{"stud_anon":"C023","inscripcion_id":"20b80f1f-2f28-4a9f-8ea2-a0a1850063d3","posicion":1,"prop_70":"700000.00","caballo":"ZETA FOOT","carr":4,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"faa15712-a879-4f29-9543-fa96f77967f6","resp_activos":0,"resp_con_propietario":0,"resp_rol_propietario":0,"propietario_mismo_nombre_que_stud":0,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":0,"cab_texto_responsable":false},{"stud_anon":"C010","inscripcion_id":"7fbbd8b1-24e8-4fe9-beee-09df6e51a4a5","posicion":2,"prop_70":"221666.55","caballo":"DESTINADO JOHAN","carr":4,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"59b16f30-8b79-48c6-86c8-0d97c7eb0084","resp_activos":1,"resp_con_propietario":1,"resp_rol_propietario":1,"propietario_mismo_nombre_que_stud":1,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":2,"cab_texto_responsable":false},{"stud_anon":"C012","inscripcion_id":"d7b909c5-2b92-4985-b3f3-1610a715223d","posicion":4,"prop_70":"70000.00","caballo":"LOCO FUN","carr":4,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"82ee1f41-3587-4faa-a493-411857f81ffb","resp_activos":0,"resp_con_propietario":0,"resp_rol_propietario":0,"propietario_mismo_nombre_que_stud":0,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":0,"cab_texto_responsable":false},{"stud_anon":"C003","inscripcion_id":"1cdac0b9-e71f-4f45-b4c9-81ae155bd3be","posicion":5,"prop_70":"70000.00","caballo":"FLORENTINA IN YOU","carr":4,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"13948689-ddfe-4127-904e-57edd56dd285","resp_activos":1,"resp_con_propietario":1,"resp_rol_propietario":1,"propietario_mismo_nombre_que_stud":1,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":1,"cab_texto_responsable":false},{"stud_anon":"C020","inscripcion_id":"53cddf30-0123-457b-b698-387b646cfa4f","posicion":1,"prop_70":"1680000.00","caballo":"CHINITA SALTEÑA","carr":5,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"e9907e8b-1bcc-484b-9920-c16cd9268669","resp_activos":1,"resp_con_propietario":1,"resp_rol_propietario":1,"propietario_mismo_nombre_que_stud":1,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":2,"cab_texto_responsable":false},{"stud_anon":"C017","inscripcion_id":"dd0a126e-12d4-4d5c-988e-c1ac79b36d59","posicion":5,"prop_70":"84000.00","caballo":"SIGO VIAJE","carr":5,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"d5b05372-e324-4f13-9e67-b86cc2557239","resp_activos":0,"resp_con_propietario":0,"resp_rol_propietario":0,"propietario_mismo_nombre_que_stud":0,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":0,"cab_texto_responsable":false},{"stud_anon":"C009","inscripcion_id":"a3672b92-081a-4c7c-948b-9b1983204673","posicion":1,"prop_70":"721000.00","caballo":"WISLA KEN","carr":6,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"23cf2ee5-ddf3-4e36-977f-238003588cde","resp_activos":1,"resp_con_propietario":1,"resp_rol_propietario":1,"propietario_mismo_nombre_que_stud":1,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":2,"cab_texto_responsable":false},{"stud_anon":"C005","inscripcion_id":"a370bfc3-329f-4c4d-b6af-bddb0760d881","posicion":2,"prop_70":"172900.00","caballo":"KUCCINI","carr":6,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"14c24aca-942a-4635-99a9-6de8a2f4865c","resp_activos":0,"resp_con_propietario":0,"resp_rol_propietario":0,"propietario_mismo_nombre_que_stud":0,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":1,"cab_texto_responsable":false},{"stud_anon":"C015","inscripcion_id":"f82f4462-c9d3-4ee7-ab1b-6b8b6f059df1","posicion":3,"prop_70":"109200.00","caballo":"CHAMPION GOLDEN","carr":6,"insc_tiene_prop_hoy":true,"insc_tiene_caballeriza":true,"cab_id":"b562b75e-f1f8-4e6a-8d68-cbfcb2c61d5e","resp_activos":1,"resp_con_propietario":1,"resp_rol_propietario":1,"propietario_mismo_nombre_que_stud":1,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":3,"cab_texto_responsable":false},{"stud_anon":"C016","inscripcion_id":"f325ae40-9fbf-4b53-802a-76b4b78227ed","posicion":5,"prop_70":"70000.00","caballo":"LADY BLIK","carr":6,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"d1b5c128-dad7-447f-a09d-d026ca72c649","resp_activos":0,"resp_con_propietario":0,"resp_rol_propietario":0,"propietario_mismo_nombre_que_stud":0,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":0,"cab_texto_responsable":false},{"stud_anon":"C002","inscripcion_id":"6632e8d1-20da-41a6-b745-7a6ee6066c93","posicion":1,"prop_70":"835450.00","caballo":"AFRICUM","carr":7,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"0ee13029-fc1c-4af0-a217-0d00e2a45c69","resp_activos":0,"resp_con_propietario":0,"resp_rol_propietario":0,"propietario_mismo_nombre_que_stud":0,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":0,"cab_texto_responsable":false},{"stud_anon":"C014","inscripcion_id":"24cae834-69c6-4b1d-9c6d-d1f5cad50af8","posicion":3,"prop_70":"167090.00","caballo":"SEMBRADOR CHUCK","carr":7,"insc_tiene_prop_hoy":true,"insc_tiene_caballeriza":true,"cab_id":"a9da0600-320f-4aa9-baac-1eba3e981d7e","resp_activos":1,"resp_con_propietario":1,"resp_rol_propietario":1,"propietario_mismo_nombre_que_stud":1,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":2,"cab_texto_responsable":false},{"stud_anon":"C008","inscripcion_id":"9c4fa3c2-12d3-4131-aab8-4fac28f0f7cb","posicion":4,"prop_70":"83545.00","caballo":"SEÑOR MONCHI","carr":7,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"1f011076-06d0-4e5f-b1cd-5dbad1602d16","resp_activos":1,"resp_con_propietario":1,"resp_rol_propietario":1,"propietario_mismo_nombre_que_stud":1,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":2,"cab_texto_responsable":false},{"stud_anon":"C019","inscripcion_id":"d4b7577d-e5c8-4fda-9cdb-fdd91ec3606e","posicion":5,"prop_70":"70000.00","caballo":"DOLAR JOHAN","carr":7,"insc_tiene_prop_hoy":true,"insc_tiene_caballeriza":true,"cab_id":"e664ce7c-78dd-4d1d-904b-c25cf0f92b96","resp_activos":1,"resp_con_propietario":1,"resp_rol_propietario":1,"propietario_mismo_nombre_que_stud":1,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":1,"cab_texto_responsable":false},{"stud_anon":"C013","inscripcion_id":"0e147226-6f40-468b-ac02-508961681be4","posicion":1,"prop_70":"706300.00","caballo":"EL BORJA","carr":8,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"9c0c95a0-479d-4a89-9ae0-41ec5f309428","resp_activos":0,"resp_con_propietario":0,"resp_rol_propietario":0,"propietario_mismo_nombre_que_stud":0,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":0,"cab_texto_responsable":false},{"stud_anon":"C001","inscripcion_id":"766f1538-0ca2-4f64-8b68-8dfd77f04e7d","posicion":4,"prop_70":"70000.00","caballo":"HEART OF GOLD","carr":8,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"07d88cea-8985-41d7-b0a0-430bd8475288","resp_activos":1,"resp_con_propietario":1,"resp_rol_propietario":1,"propietario_mismo_nombre_que_stud":1,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":2,"cab_texto_responsable":false},{"stud_anon":"C006","inscripcion_id":"6d1b78bb-c549-4d10-b8b9-70f4edb5b71c","posicion":5,"prop_70":"70000.00","caballo":"MAESTRO DE ARMAS","carr":8,"insc_tiene_prop_hoy":false,"insc_tiene_caballeriza":true,"cab_id":"1559d760-0966-445a-afaa-8d63db0e9e87","resp_activos":0,"resp_con_propietario":0,"resp_rol_propietario":0,"propietario_mismo_nombre_que_stud":0,"spc_prop":0,"otras_insc_mismo_caballo_con_prop":0,"cab_texto_responsable":false}]
```

Los 25 tienen caballeriza asignada. Ninguno tiene `spc_propietarios` (tabla vacía) ni texto en
`caballerizas.responsable`.

Esquema consultado para armar la query (columnas relevantes; salida cruda):

```sql
select table_name, column_name, data_type from information_schema.columns where table_schema='public' and table_name in ('inscripciones','caballeriza_responsables','caballerizas','propietarios','spc_propietarios') and (table_name<>'inscripciones' or column_name ~ 'propiet|caballer|spc|entrenador|estado|id$') order by table_name, ordinal_position;
```
```json
[{"table_name":"caballeriza_responsables","column_name":"id","data_type":"uuid"},{"table_name":"caballeriza_responsables","column_name":"caballeriza_id","data_type":"uuid"},{"table_name":"caballeriza_responsables","column_name":"profesional_id","data_type":"uuid"},{"table_name":"caballeriza_responsables","column_name":"apellido","data_type":"character varying"},{"table_name":"caballeriza_responsables","column_name":"nombre","data_type":"character varying"},{"table_name":"caballeriza_responsables","column_name":"documento_tipo","data_type":"character varying"},{"table_name":"caballeriza_responsables","column_name":"documento_nro","data_type":"character varying"},{"table_name":"caballeriza_responsables","column_name":"fecha_nacimiento","data_type":"date"},{"table_name":"caballeriza_responsables","column_name":"localidad","data_type":"character varying"},{"table_name":"caballeriza_responsables","column_name":"rol","data_type":"character varying"},{"table_name":"caballeriza_responsables","column_name":"porcentaje","data_type":"numeric"},{"table_name":"caballeriza_responsables","column_name":"activo","data_type":"boolean"},{"table_name":"caballeriza_responsables","column_name":"created_at","data_type":"timestamp without time zone"},{"table_name":"caballeriza_responsables","column_name":"propietario_id","data_type":"uuid"},{"table_name":"caballerizas","column_name":"id","data_type":"uuid"},{"table_name":"caballerizas","column_name":"club_id","data_type":"uuid"},{"table_name":"caballerizas","column_name":"nombre","data_type":"character varying"},{"table_name":"caballerizas","column_name":"responsable","data_type":"character varying"},{"table_name":"caballerizas","column_name":"domicilio","data_type":"character varying"},{"table_name":"caballerizas","column_name":"telefono","data_type":"character varying"},{"table_name":"caballerizas","column_name":"activo","data_type":"boolean"},{"table_name":"caballerizas","column_name":"notas","data_type":"text"},{"table_name":"caballerizas","column_name":"estado","data_type":"character varying"},{"table_name":"caballerizas","column_name":"chaquetilla_descripcion","data_type":"character varying"},{"table_name":"caballerizas","column_name":"chaquetilla_url","data_type":"character varying"},{"table_name":"caballerizas","column_name":"hipodromo_patente","data_type":"character varying"},{"table_name":"inscripciones","column_name":"id","data_type":"uuid"},{"table_name":"inscripciones","column_name":"carrera_id","data_type":"uuid"},{"table_name":"inscripciones","column_name":"spc_id","data_type":"uuid"},{"table_name":"inscripciones","column_name":"propietario_id","data_type":"uuid"},{"table_name":"inscripciones","column_name":"entrenador_id","data_type":"uuid"},{"table_name":"inscripciones","column_name":"jockey_titular_id","data_type":"uuid"},{"table_name":"inscripciones","column_name":"jockey_suplente_id","data_type":"uuid"},{"table_name":"inscripciones","column_name":"estado","data_type":"USER-DEFINED"},{"table_name":"inscripciones","column_name":"motivo_estado","data_type":"character varying"},{"table_name":"inscripciones","column_name":"caballeriza_id","data_type":"uuid"},{"table_name":"propietarios","column_name":"id","data_type":"uuid"},{"table_name":"propietarios","column_name":"club_id","data_type":"uuid"},{"table_name":"propietarios","column_name":"tipo","data_type":"character varying"},{"table_name":"propietarios","column_name":"nombre","data_type":"character varying"},{"table_name":"propietarios","column_name":"documento_tipo","data_type":"character varying"},{"table_name":"propietarios","column_name":"documento_nro","data_type":"character varying"},{"table_name":"propietarios","column_name":"domicilio","data_type":"character varying"},{"table_name":"propietarios","column_name":"localidad","data_type":"character varying"},{"table_name":"propietarios","column_name":"provincia","data_type":"character varying"},{"table_name":"propietarios","column_name":"telefono","data_type":"character varying"},{"table_name":"propietarios","column_name":"email","data_type":"character varying"},{"table_name":"propietarios","column_name":"colores_desc","data_type":"text"},{"table_name":"propietarios","column_name":"colores_img_url","data_type":"text"},{"table_name":"propietarios","column_name":"activo","data_type":"boolean"},{"table_name":"propietarios","column_name":"notas","data_type":"text"},{"table_name":"propietarios","column_name":"created_at","data_type":"timestamp with time zone"},{"table_name":"propietarios","column_name":"updated_at","data_type":"timestamp with time zone"},{"table_name":"propietarios","column_name":"nombre_stud","data_type":"character varying"},{"table_name":"propietarios","column_name":"estado","data_type":"character varying"},{"table_name":"propietarios","column_name":"chaquetilla_descripcion","data_type":"character varying"},{"table_name":"propietarios","column_name":"chaquetilla_url","data_type":"character varying"},{"table_name":"spc_propietarios","column_name":"id","data_type":"uuid"},{"table_name":"spc_propietarios","column_name":"spc_id","data_type":"uuid"},{"table_name":"spc_propietarios","column_name":"propietario_id","data_type":"uuid"},{"table_name":"spc_propietarios","column_name":"porcentaje","data_type":"numeric"},{"table_name":"spc_propietarios","column_name":"fecha_desde","data_type":"date"},{"table_name":"spc_propietarios","column_name":"fecha_hasta","data_type":"date"},{"table_name":"spc_propietarios","column_name":"activo","data_type":"boolean"}]
```

### Q7 — Pregunta 2, agrupado (suma el hueco al centavo)

```sql
with prem as (
 select distinct d.inscripcion_id, d.monto_bruto/0.02 as premio from liquidacion_detalle d
 where d.reunion_id='b02ca761-6f44-4720-86aa-a3c3099019ea' and d.concepto_tipo='fondo_solidario'
), s as (
 select p.*, i.propietario_id, i.caballeriza_id, i.spc_id from prem p join inscripciones i on i.id=p.inscripcion_id
 where not exists (select 1 from liquidacion_detalle d where d.inscripcion_id=p.inscripcion_id and d.concepto_tipo='premio' and d.descripcion like '%— Propietario%')
), c as (
 select s.*, case
  when s.propietario_id is not null then 'A_insc_con_propietario_hoy'
  when exists (select 1 from caballeriza_responsables cr where cr.caballeriza_id=s.caballeriza_id and cr.activo and cr.propietario_id is not null) then 'B_stud_con_titular_en_padron_insc_sin_asignar'
  when exists (select 1 from inscripciones i2 where i2.spc_id=s.spc_id and i2.propietario_id is not null) then 'C_stud_sin_titular_pero_caballo_con_propietario_en_otra_insc'
  else 'D_sin_propietario_en_el_sistema' end grupo,
  (select count(*) from caballeriza_responsables cr where cr.caballeriza_id=s.caballeriza_id) resp_total_incl_inactivos,
  (select count(*) from inscripciones i3 where i3.caballeriza_id=s.caballeriza_id and i3.propietario_id is not null) otras_insc_del_stud_con_prop
 from s
)
select grupo, count(*) caballos, round(sum(premio*0.70),2) prop_70_no_generado, sum(resp_total_incl_inactivos) resp_incl_inactivos, sum(otras_insc_del_stud_con_prop) insc_stud_con_prop
from c group by 1 order by 1;
```
```json
[{"grupo":"A_insc_con_propietario_hoy","caballos":4,"prop_70_no_generado":"430290.00","resp_incl_inactivos":"4","insc_stud_con_prop":"17"},{"grupo":"B_stud_con_titular_en_padron_insc_sin_asignar","caballos":8,"prop_70_no_generado":"3004761.55","resp_incl_inactivos":"8","insc_stud_con_prop":"27"},{"grupo":"C_stud_sin_titular_pero_caballo_con_propietario_en_otra_insc","caballos":1,"prop_70_no_generado":"172900.00","resp_incl_inactivos":"0","insc_stud_con_prop":"0"},{"grupo":"D_sin_propietario_en_el_sistema","caballos":12,"prop_70_no_generado":"4546704.05","resp_incl_inactivos":"0","insc_stud_con_prop":"0"}]
```

430.290,00 + 3.004.761,55 + 172.900,00 + 4.546.704,05 = **8.154.655,60** = `prop_no_generado` de R6 en el
informe anterior (Q7). En el grupo D, los studs no tienen **ningún** responsable, ni siquiera inactivo
(`resp_incl_inactivos` = 0), ni **ninguna** inscripción con propietario (`insc_stud_con_prop` = 0).

Grupo A: **cuándo** recibieron el propietario:

```sql
select a.registro_id, a.created_at, a.usuario_id is not null con_usuario, a.datos_antes->>'propietario_id' is not null antes_tenia, a.datos_despues->>'propietario_id' is not null despues_tiene
from auditoria a where a.tabla='inscripciones' and a.accion='UPDATE'
 and a.registro_id::text in ('803a4268-69ef-4c71-a6c2-981abe494d39','f82f4462-c9d3-4ee7-ab1b-6b8b6f059df1','24cae834-69c6-4b1d-9c6d-d1f5cad50af8','d4b7577d-e5c8-4fda-9cdb-fdd91ec3606e')
 and (a.datos_antes->>'propietario_id') is distinct from (a.datos_despues->>'propietario_id')
order by a.registro_id, a.created_at;
```
```json
[{"registro_id":"24cae834-69c6-4b1d-9c6d-d1f5cad50af8","created_at":"2026-09-11 21:07:26.930683+00","con_usuario":false,"antes_tenia":false,"despues_tiene":true},{"registro_id":"803a4268-69ef-4c71-a6c2-981abe494d39","created_at":"2026-09-11 21:07:26.930683+00","con_usuario":false,"antes_tenia":false,"despues_tiene":true},{"registro_id":"d4b7577d-e5c8-4fda-9cdb-fdd91ec3606e","created_at":"2026-09-11 21:07:26.930683+00","con_usuario":false,"antes_tenia":false,"despues_tiene":true},{"registro_id":"f82f4462-c9d3-4ee7-ab1b-6b8b6f059df1","created_at":"2026-09-11 21:07:26.930683+00","con_usuario":false,"antes_tenia":false,"despues_tiene":true}]
```

Los cuatro en la misma transacción del **2026-09-11 21:07:26 UTC**, bajo `service_role`. Coincide con la
noche de las operaciones de R9 del 11/09 (provisorios, `migrations/propietarios_provisorios_r9.sql`, con su
re-derivación), pero **eso no se verificó**: sólo la hora coincide. R6 se liquidó antes, así que sus líneas
no existen.

### Q8 — Pregunta 3: controles en la base

```sql
select t.tgname, pg_get_triggerdef(t.oid) def from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='inscripciones' and not t.tgisinternal order by 1;
```
```json
[{"tgname":"trg_audit_inscripciones","def":"CREATE TRIGGER trg_audit_inscripciones AFTER INSERT OR DELETE OR UPDATE ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()"},{"tgname":"trg_insc_monta_oficial","def":"CREATE TRIGGER trg_insc_monta_oficial BEFORE UPDATE OF jockey_titular_id ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION fn_insc_monta_oficial_guard()"},{"tgname":"trg_insc_set_propietario","def":"CREATE TRIGGER trg_insc_set_propietario BEFORE INSERT OR UPDATE OF caballeriza_id ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION fn_inscripcion_set_propietario()"},{"tgname":"trg_inscripciones_updated_at","def":"CREATE TRIGGER trg_inscripciones_updated_at BEFORE UPDATE ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION set_updated_at()"}]
```

```sql
select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.inscripciones'::regclass and contype='c'
union all
select p.proname, 'fn menciona peon: '||(position('peon' in lower(pg_get_functiondef(p.oid)))>0)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and lower(pg_get_functiondef(p.oid)) like '%peon%';
```
```json
[{"conname":"inscripciones_peso_balanza_rango","def":"CHECK (((peso_balanza IS NULL) OR ((peso_balanza >= (300)::numeric) AND (peso_balanza <= (600)::numeric))))"}]
```
Un solo `CHECK` (peso de balanza) y **cero** funciones de `public` que mencionen `peon`.

```sql
select pg_get_functiondef('public.fn_insc_monta_oficial_guard'::regproc) def;
```
```
CREATE OR REPLACE FUNCTION public.fn_insc_monta_oficial_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nro text;
BEGIN
  -- Sólo si la monta CAMBIA. Un UPDATE con payload entero y el mismo jockey pasa.
  IF NEW.jockey_titular_id IS NOT DISTINCT FROM OLD.jockey_titular_id THEN
    RETURN NEW;
  END IF;
  -- Vía autorizada: la RPC, y sólo dentro de su transacción.
  IF current_setting('sgh.cambiar_monta', true) = '1' THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(c.numero_carrera_programa, c.numero_turno)::text INTO v_nro
    FROM resultados r
    JOIN carreras c ON c.id = r.carrera_id
   WHERE r.carrera_id = NEW.carrera_id AND r.estado = 'oficial'
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'La carrera % ya está oficializada: la monta se cambia desde Montas (resultados.html), que recalcula la liquidación. ISSUE-084', v_nro
      USING ERRCODE = 'P0084';
  END IF;
  RETURN NEW;
END $function$
```

### Q9 — Hallazgo lateral: líneas que **nacerían** hoy si alguien recalcula R6 o R8

```sql
with prem as (
 select distinct r.numero, d.inscripcion_id, d.posicion, d.monto_bruto/0.02 premio from liquidacion_detalle d join reuniones r on r.id=d.reunion_id
 where d.reunion_id in ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f') and d.concepto_tipo='fondo_solidario'
), roles as (
 select p.*, i.propietario_id, i.entrenador_id, i.jockey_titular_id,
  exists (select 1 from liquidacion_detalle d where d.inscripcion_id=p.inscripcion_id and d.concepto_tipo='premio' and d.descripcion like '%— Propietario%') l_prop,
  exists (select 1 from liquidacion_detalle d where d.inscripcion_id=p.inscripcion_id and d.concepto_tipo='premio' and d.descripcion like '%— Entrenador%') l_entr,
  exists (select 1 from liquidacion_detalle d where d.inscripcion_id=p.inscripcion_id and d.concepto_tipo='premio' and d.descripcion like '%— Jockey%') l_jock
 from prem p join inscripciones i on i.id=p.inscripcion_id
)
select numero, 'propietario' rol, count(*) filter (where not l_prop and propietario_id is not null) nacerian_al_recalcular,
 count(*) filter (where not l_prop and propietario_id is not null and posicion in (1,2)) de_ellas_retenidas,
 round(sum(premio*0.70) filter (where not l_prop and propietario_id is not null),2) monto
from roles group by 1
union all
select numero, 'entrenador', count(*) filter (where not l_entr and entrenador_id is not null), count(*) filter (where not l_entr and entrenador_id is not null and posicion in (1,2)), round(sum(premio*0.10) filter (where not l_entr and entrenador_id is not null),2) from roles group by 1
union all
select numero, 'jockey', count(*) filter (where not l_jock and jockey_titular_id is not null), count(*) filter (where not l_jock and jockey_titular_id is not null and posicion in (1,2)), round(sum(premio*0.10) filter (where not l_jock and jockey_titular_id is not null),2) from roles group by 1
order by 1,2;
```
```json
[{"numero":6,"rol":"entrenador","nacerian_al_recalcular":0,"de_ellas_retenidas":0,"monto":null},{"numero":6,"rol":"jockey","nacerian_al_recalcular":0,"de_ellas_retenidas":0,"monto":null},{"numero":6,"rol":"propietario","nacerian_al_recalcular":4,"de_ellas_retenidas":0,"monto":"430290.00"},{"numero":8,"rol":"entrenador","nacerian_al_recalcular":4,"de_ellas_retenidas":1,"monto":"56941.65"},{"numero":8,"rol":"jockey","nacerian_al_recalcular":1,"de_ellas_retenidas":0,"monto":"10000.00"},{"numero":8,"rol":"propietario","nacerian_al_recalcular":4,"de_ellas_retenidas":1,"monto":"398591.55"}]
```

Total: **13 líneas, $895.823,20**, de las cuales 11 nacerían `impago` (cobrables en el acto) y 2 `retenido`.
En R8, **todos** los huecos de entrenador/jockey/propietario del informe anterior ya tienen su persona
asignada en la inscripción. Lectura del motor que lo sostiene: `liquidaciones-engine.js:274-289` preserva
sólo lo `pagado`/con recibo y borra el resto; `:333` saltea sólo las claves ya pagadas, así que una línea que
nunca existió no está en `paidKeys` y se crea. (Monto aproximado: premio = fondo / 0,02, como en el informe
anterior; los redondeos son de centavos.)

---

## Código (main)

`inscripciones.html:690` — botón de edición en toda fila, sin condición de resultado:
```js
        <button class="btn-sm btn-edit" onclick='openModal(${JSON.stringify({ ...i, cargador: undefined, spcs: undefined })})'>✏️</button>
```

`inscripciones.html:821-856` — `saveRecord()` (extracto): `UPDATE` directo con peón/capataz/sereno y jockey,
sin recálculo:
```js
  const payload = {
    carrera_id: currentCarreraId,
    spc_id: spcId,
    caballeriza_id: cabId,
    entrenador_id: document.getElementById('f-entrenador').value || null,
    jockey_titular_id: document.getElementById('f-jockey-titular').value || null,
    jockey_suplente_id: document.getElementById('f-jockey-suplente').value || null,
    peon: document.getElementById('f-peon').value.trim() || null,
    capataz: document.getElementById('f-capataz').value.trim() || null,
    sereno: document.getElementById('f-sereno').value.trim() || null,
    ...
  };
  const { error } = id
    ? await sb.from('inscripciones').update(payload).eq('id',id)
    : await sb.from('inscripciones').insert(payload);
  ...
  toast(id ? 'Inscripción actualizada' : 'SPC inscripto');
  closeModal();
  await loadInscripciones();
  avisarJockeyRepetido(payload.jockey_titular_id);
```

Quién llama al motor (`git grep -n -E 'generarLiquidacionesReunion|generarLiquidaciones\(' main -- '*.html' '*.js'`):
```
main:liquidaciones-engine.js:18:   Reusa la lógica de cálculo de generarLiquidaciones() tal cual estaba (premios, bono
main:liquidaciones-engine.js:61:  async function generarLiquidacionesReunion(opts) {
main:liquidaciones-engine.js:377:  global.generarLiquidacionesReunion = generarLiquidacionesReunion;
main:liquidaciones.html:262:    <button class="btn-primary" onclick="generarLiquidaciones()" title="Recalcula la reunión desde los resultados oficiales. Paid-safe: preserva lo ya pagado.">🔄 Recalc
main:liquidaciones.html:2370:async function generarLiquidaciones() {
main:liquidaciones.html:2377:  const r = await generarLiquidacionesReunion({ sb, clubId: CLUB_ID, reunionId: rid, liqConfig, fmt });
main:resultados.html:1670:  const r = await generarLiquidacionesReunion({ sb, clubId: CLUB_ID, reunionId: rid });
main:resultados.html:1699:  const r = await generarLiquidacionesReunion({ sb, clubId: CLUB_ID, reunionId: rid });
main:resultados.html:2132:    const r = await generarLiquidacionesReunion({ sb, clubId: CLUB_ID, reunionId: rid });
```
`inscripciones.html` y `ratificacion.html` no aparecen: guardar una inscripción nunca recalcula.

Dónde se menciona peón/capataz/sereno en el código servido
(`git grep -n -i -E '\bpeon\b|peón' main -- '*.html' '*.js'`, sin `docs/` ni `tests/`):
```
main:inscripciones.html:16:    ADD COLUMN IF NOT EXISTS peon VARCHAR(200),
main:inscripciones.html:288:          <label>Peón</label>
main:inscripciones.html:289:          <input type="text" id="f-peon" placeholder="Nombre del peón">
main:inscripciones.html:686:      <td>${(() => { const l=[]; if(i.peon) l.push(`Peón: ${i.peon}`); if(i.capataz) l.push(`Cap: ${i.capataz}`); if(i.sereno) l.push(`Sereno: ${i.sereno}`); return l.length?`<div style="font
main:inscripciones.html:788:    document.getElementById('f-peon').value = rec.peon||'';
main:inscripciones.html:805:    document.getElementById('f-peon').value='';
main:inscripciones.html:836:    peon: document.getElementById('f-peon').value.trim() || null,
main:liquidaciones-engine.js:20:   reparto por roles + subs peón/capataz/sereno, descuentos comision_config, retención
main:liquidaciones-engine.js:36:  // (el concepto desambigua subs "Peón — X" y premio vs bono del mismo puesto).
main:liquidaciones-engine.js:111:      peon:        parseFloat(liqConfig.pct_peon)        / 100,
main:liquidaciones-engine.js:185:              { nombre: insc.peon,    rol: 'Peón',    pct: PCTS.peon },
main:liquidaciones.html:288:      Peón/capataz/sereno se pagan dentro del recibo del entrenador. La retención por doping se
main:liquidaciones.html:339:      Sub-roles peón/capataz/sereno se acumulan bajo el entrenador (igual que en Pagos).</p>
main:liquidaciones.html:390:        <div class="form-group"><label>Peón (%)</label><input type="number" id="rp-peon" min="0" max="100" step="0.001"></div>
main:liquidaciones.html:618:    <div class="config-row">Peón <span>${c.pct_peon}%</span></div>
main:liquidaciones.html:633:  document.getElementById('rp-peon').value         = c.pct_peon          ?? 4;
main:liquidaciones.html:646:               get('rp-peon') + get('rp-capataz') + get('rp-sereno') + get('rp-fondo');
main:liquidaciones.html:653:    pct_jockey: get('rp-jockey'), pct_peon: get('rp-peon'),
main:liquidaciones.html:849:// por lo que los sub-roles peón/capataz/sereno (que llevan el beneficiario_id del entrenador,
main:liquidaciones.html:899:    premio:'Premios', actuacion:'Actuaciones (peón/capataz/sereno)',
main:liquidaciones.html:1163:// el texto; lo que no resuelve (p.ej. 'actuacion' de peón/capataz/sereno) se cruza con la
main:liquidaciones.html:1761:  // deuda pagable tienen además líneas retenidas (1° y 2° puesto, más peón/capataz/sereno).
(+ 4 mockups con "CAMPEÓN BRAVÍO", falsos positivos)
```
Y `git grep -n -i -E 'peon|pe[oó]n|capataz|sereno' main -- ratificacion.html resultados.html portal.html carta-llamados.html 'migrations/*.sql' 'supabase/functions/*'`
sólo devuelve `migrations/liquidaciones_cd_fase0.sql:40-54` (las columnas `pct_*` de `liquidacion_config`
y su `CHECK` de suma = 100) y falsos positivos ("DEL CAMPEON" en `spcs_r9_tanda_1.sql`).

`liquidaciones-engine.js:37-41` — clave de dedup (incluye el concepto, o sea el nombre del peón):
```js
  function lineKey(d) {
    return [d.beneficiario_tipo, d.beneficiario_id, d.concepto_tipo,
            d.inscripcion_id || '', d.posicion == null ? '' : d.posicion,
            d.concepto || ''].join('|');
  }
```

`liquidaciones-engine.js:307` — retención:
```js
        const retenido = item.conceptoTipo === 'premio' && (item.posicion === 1 || item.posicion === 2);
```

`liquidaciones-engine.js:274-289` — lo que el recálculo preserva y lo que borra:
```js
        if (d.estado_linea === 'pagado' || d.recibo_id != null) {
          paidKeys.add(lineKey(d));
          ...
    // 2. Borrar SOLO las líneas no comprometidas (recibo_id null AND estado != 'pagado').
      await sb.from('liquidacion_detalle').delete()
        .in('liquidacion_id', allHeaderIds)
        .is('recibo_id', null)
        .neq('estado_linea', 'pagado');
```
y `:333`: `const freshRows = detalleRows.filter(d => !paidKeys.has(lineKey(d)));`

---

## Resumen de números

- Saldadas R6+R8: **338** = 332 (28/08) + 6 (recibo N° 4 revertido). R6 157 / $7.116.984,19 · R8 181 /
  $14.806.756,66. Todas generadas por el motor; **0** cargadas a mano; **0** `actuacion`.
- Líneas R6+R8: **417** hoy = 417 el 28/08. Nada creado ni borrado desde el saldado.
- Hueco de propietario de R6: **25 caballos, $8.154.655,60** → A 4 ($430.290,00) · B 8 ($3.004.761,55) ·
  C 1 ($172.900,00) · D 12 ($4.546.704,05). **13 con propietario en el sistema, 12 sin propietario.**
- Controles sobre peón: **0** (front, `CHECK`, triggers, funciones).
- Peón cargado después de oficializar: se guarda; **no recalcula**; la sub-línea nace en el **próximo
  recálculo**, nueva y cobrable, bajo el entrenador.
- Si hoy se recalculan R6/R8: **13 líneas nuevas, $895.823,20** (11 impagas, 2 retenidas).

## Preguntas abiertas

1. **¿Qué se pagó en papel en R6/R8: 100 % o 92 % por caballo?** La base no lo sabe. Hay que preguntarle a
   Valeria/Fede o mirar los recibos manuales. Si fue el 100 %, el 8 % existe en papel y no en el sistema.
2. **Grupo D (12 caballos, $4.546.704,05 de R6):** ¿a quién se le pagó? El sistema no tiene propietario para
   esos 11 studs, ni siquiera provisorio.
3. **R6/R8 se pueden recalcular** (botón, oficializar la carrera provisional de R6, cambiar una monta o
   des-oficializar). Si pasa, aparecen $895.823,20 cobrables en reuniones saldadas. ¿Se congela el recálculo
   de reuniones saldadas o se regularizan antes esas 13 líneas? Es de producto y no se tocó.
4. **Peón después de oficializar:** ¿se permite editar peón/capataz/sereno en una carrera oficial? Hoy sí, sin
   aviso y sin recálculo. Si se permite, ¿debería recalcular como las montas (ISSUE-084)?
5. El cambio de nombre del peón con la sub-línea ya pagada genera una segunda sub-línea (doble pago del 4 %).
   No ocurrió nunca (no hay ninguna sub-línea real), pero es el mismo patrón que ISSUE-084 resolvió para las
   montas.

## Nota de proceso

- Todo contra `main` (`git show main:…`, `git grep … main`). Los documentos del saldado y del recibo N° 4 se
  leyeron de la rama `reports` **local**: no están en `origin/reports`, que se reescribió en la auditoría de PII.
- Informe commiteado en el worktree sobre `origin/reports` (5200736) y pusheado como fast-forward. La rama
  `reports` local no se tocó.

## Verificación del push (commit del informe)

```
$ git push origin HEAD:refs/heads/reports
   5200736..f2fa6be  HEAD -> reports
$ git rev-parse HEAD
f2fa6be324a43d0cccaceb62c057fbd9b3a5c837
$ git ls-remote origin reports
f2fa6be324a43d0cccaceb62c057fbd9b3a5c837	refs/heads/reports
$ curl -s -o /dev/null -w '%{http_code}' https://raw.githubusercontent.com/mdqclio/SGH/reports/docs/diagnosticos/2026-09-25_saldado-r6-r8-8pct-propietarios-peon-post-oficial.md
200
```
Este bloque se agregó en un commit posterior ("verificación de push"), así que el SHA final de `reports` es
el de ese commit, no `f2fa6be`.
