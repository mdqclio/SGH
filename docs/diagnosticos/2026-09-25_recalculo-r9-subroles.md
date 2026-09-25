# Recálculo de R9 con el reparto al 100 % — EJECUTADO y verificado (no hizo falta rollback)

- Fecha: 2026-09-25 · inicio del recálculo: 17:16:34 UTC (copia 17:17:16 UTC)
- `main` = sitio = **`d133c05db7c315ac2b62d7952f2553376c10619d`** (PR #18 mergeado; el motor servido en `sigh.com.ar` tiene md5
  `9f9ab8830e31ea51580383c5790a5c59`, igual al del repo)
- Guards: `pwd` = /home/clio/dev/SGH · `select count(*) from spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- Ventana: la confirmó Leo (Valeria no está pagando).
- Escrituras en prod: **sólo** el recálculo de R9 (`tests/recalculo_r9_subroles.mjs --ejecutar --ventana-confirmada`).
- Copia previa: `tests/local/out/r9_copia_2026-09-25T17-17-16-188Z.json` (147 líneas + 70 headers; md5 del archivo
  `82336822a532e4a46ff458fc90afe3d3`). **No commiteada**: `tests/local/out/` está en `.gitignore:26` y `git status` quedó limpio.

## Resumen

| Pedido | Resultado |
|---|---|
| 1. PR #18 | Mergeado: `main` = `d133c05db7c315ac2b62d7952f2553376c10619d` |
| Copia de las 147 líneas y los headers antes de escribir | ✅ 147 líneas, 70 headers (arriba) |
| md5 de R9 antes | líneas `c33f00d6900252c6fd33fed3ce061aaa` (147) · headers `d765b0a8f5319f0cdb4fd72194734f8d` (70) |
| Exactamente 69 nuevas, todas `actuacion`, 3 por cada uno de los 23 premiados | ✅ 69; Capataz + Peón + Sereno en los 23; 0 caballos con otra combinación (C1) |
| Total $564.096 | ✅ **$564.096,66**: $447.336,66 retenido + $116.760,00 impago (C2) |
| Pagadas y retenidas previas idénticas, ninguna desaparecida ni con otro monto | ✅ 67 comprometidas: fila entera idéntica por id. 80 retenidas/impagas: mismo contenido. 30 retenidas siguen retenidas con la misma fecha. 0 desaparecidas (V1, V2, V4, C3a–C3c) |
| 23 caballos al 100 % exacto; entrenador + personal = 18 % exacto | ✅ 0 desvíos (C4a); Σ nuevas = Σ (18 % − 10 %) al centavo (C4b) |
| R6 y R8 sin cambios | ✅ md5 de líneas **y** de headers iguales antes y después |
| Rollback | **No hizo falta.** Si se necesitara: `node tests/recalculo_r9_subroles.mjs --rollback tests/local/out/r9_copia_2026-09-25T17-17-16-188Z.json` |

Otros datos:
- **R9 ahora**: 216 líneas (147 + 69), md5 `6388f31320c1ae3b8cb88dbe6fa311e0`. Headers: los mismos 70, md5
  `5dc3b9a4bb12c07167e82e12496c8b6c`. El md5 cambia porque el motor recalcula `total_bruto` de los headers de los
  entrenadores que recibieron sub-líneas. No se creó ni se borró ningún header (`created: 0`, 70 → 70).
- **Recibos**: 44 antes y después, último N° 71. No se emitió ni se tocó ninguno.
- Las $116.760,00 impagas son $81.320,00 de 9 caballos cuyos entrenadores **ya cobraron** (27 líneas, **recibo
  complementario**) más $35.440,00 de 4 caballos cuyos entrenadores todavía no cobraron (12 líneas, van en su mismo
  recibo). Las $447.336,66 retenidas (1°/2°, 30 líneas) se liberan con el resto del premio el 2026-10-20.
- En el plan de la Fase 1 lo retenido figuraba $447.336,68 (2 centavos más). La diferencia es la regla de residuo
  aprobada: el sereno cierra el 18 % exacto.

---

## Q1 — Antes: guards, `main` = sitio, plan en seco

```
$ pwd; git status --short; git fetch origin; git checkout main; git pull --ff-only origin main; git rev-parse HEAD origin/main
/home/clio/dev/SGH
d133c05db7c315ac2b62d7952f2553376c10619d
d133c05db7c315ac2b62d7952f2553376c10619d
$ gh pr view 18 --json state,mergeCommit
MERGED d133c05db7c315ac2b62d7952f2553376c10619d
$ curl -s "https://sigh.com.ar/liquidaciones-engine.js?v=$RANDOM" | md5sum; md5sum liquidaciones-engine.js
9f9ab8830e31ea51580383c5790a5c59  -
9f9ab8830e31ea51580383c5790a5c59  liquidaciones-engine.js
$ grep -n "tests/local/out" .gitignore
26:tests/local/out/
$ node tests/recalculo_r9_subroles.mjs          # PLAN, sólo lectura
R9: 147 líneas hoy · 23 caballos premiados · nacerían 69 (esperado 69), $564096.66
   tipos de las nuevas: actuacion/Peón, actuacion/Capataz, actuacion/Sereno
   md5 fila entera (todas): d909b969541b07139c12a7a42d6f6603 · comprometidas: 5379bdeffc4de1a824f6d93cf06acd8c · contenido no comprometidas: daf081daae9e044c717c9260685fd6d7

PLAN: no se escribió nada.
```

```sql
select (select count(*) from spcs) spcs, r.numero, r.liquidacion_cerrada_at is not null cerrada,
 (select count(*) from liquidacion_detalle d where d.reunion_id=r.id) lineas,
 (select md5(string_agg(d::text,'|' order by d.id)) from liquidacion_detalle d where d.reunion_id=r.id) md5_lineas,
 (select count(*) from liquidaciones l where l.reunion_id=r.id) headers,
 (select md5(string_agg(l::text,'|' order by l.id)) from liquidaciones l where l.reunion_id=r.id) md5_headers,
 (select count(*) from recibos) recibos_total, (select max(numero_recibo) from recibos where club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' and numero_recibo<9000) ultimo_recibo
from reuniones r where r.id in ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f','cafa37d6-89f4-45cb-a0d9-835bc27407e9') order by 2;
```
```json
[{"spcs":210,"numero":6,"cerrada":true,"lineas":192,"md5_lineas":"85051a817b77f6cda3337bee07741697","headers":86,"md5_headers":"37d13ace847db6b8a19d15f65b5d53ce","recibos_total":44,"ultimo_recibo":71},{"spcs":210,"numero":8,"cerrada":true,"lineas":225,"md5_lineas":"fc82ef1b2a81d85eb4af7e7d369f5c44","headers":93,"md5_headers":"f4c60a74062900c97a669b2adf7f7e4a","recibos_total":44,"ultimo_recibo":71},{"spcs":210,"numero":9,"cerrada":false,"lineas":147,"md5_lineas":"c33f00d6900252c6fd33fed3ce061aaa","headers":70,"md5_headers":"d765b0a8f5319f0cdb4fd72194734f8d","recibos_total":44,"ultimo_recibo":71}]
```

## Q2 — Ejecución

```
$ date -u; node tests/recalculo_r9_subroles.mjs --ejecutar --ventana-confirmada
Fri Sep 25 05:16:34 PM UTC 2026
R9: 147 líneas hoy · 23 caballos premiados · nacerían 69 (esperado 69), $564096.66
   tipos de las nuevas: actuacion/Peón, actuacion/Capataz, actuacion/Sereno
   md5 fila entera (todas): d909b969541b07139c12a7a42d6f6603 · comprometidas: 5379bdeffc4de1a824f6d93cf06acd8c · contenido no comprometidas: daf081daae9e044c717c9260685fd6d7

COPIA: /home/clio/dev/SGH/tests/local/out/r9_copia_2026-09-25T17-17-16-188Z.json — 147 líneas, 70 headers
motor: {"created":0,"headers":70,"preserved":67}
V1 pagadas/con recibo idénticas (fila entera): ✅  5379bdeffc4de1a824f6d93cf06acd8c
V2 retenidas/impagas previas idénticas (contenido): ✅
V3 nuevas = 69 (esperado 69), todas actuacion: ✅  $564096.66
V4 ninguna línea desapareció: ✅
R9 ahora: 216 líneas (antes 147)

✅ Recálculo verificado.
exit=0
$ md5sum tests/local/out/r9_copia_2026-09-25T17-17-16-188Z.json
82336822a532e4a46ff458fc90afe3d3  tests/local/out/r9_copia_2026-09-25T17-17-16-188Z.json
$ node -e '…'   # contenido de la copia
copia: tomado 2026-09-25T17:17:16.188Z · lineas 147 · headers 70
$ git check-ignore -v tests/local/out/r9_copia_2026-09-25T17-17-16-188Z.json
.gitignore:26:tests/local/out/	tests/local/out/r9_copia_2026-09-25T17-17-16-188Z.json
```
Antes de escribir, el script también verificó: R6/R8 cerradas, R9 abierta, el motor servido igual al del repo y el
plan en seco en 69.

## Q3 — Chequeo posterior (sólo lectura) contra la copia

Script (scratchpad de la sesión; no está en el repo):
```js
// Chequeo posterior al recálculo de R9 (sólo lectura). Uso: node postcheck_r9.mjs <copia.json>
// Contra la copia (tomada por recalculo_r9_subroles.mjs antes de escribir):
//  C1 nuevas = 69, todas actuacion, exactamente Peón+Capataz+Sereno por cada uno de los 23 premiados
//  C2 total de las nuevas (y = Σ r2(18 %P) − entrenador por caballo)
//  C3 pagadas/con recibo previas: fila entera idéntica por id; retenidas/impagas previas: mismo contenido por clave
//     (mismo monto, estado, fecha de liberación, recibo, beneficiario); ninguna desaparecida
//  C4 cada premiado: Σ premio+fondo+actuacion = r2(P) exacto; entrenador + personal = r2(18 % P) exacto
//     (P con el oráculo del reglamento: bolsa × %, + bono ganador, piso ganancia_minima)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/clio/dev/SGH/package.json');
const { createClient } = require('@supabase/supabase-js');
const { cargarMotor, montoPg, md5Filas } = await import('/home/clio/dev/SGH/tests/lib/motor_dryrun.mjs');
const R9 = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9';
const sb = createClient('https://unlhcuanfrtpatoipwve.supabase.co', process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const motor = cargarMotor(readFileSync('/home/clio/dev/SGH/liquidaciones-engine.js', 'utf8'));
const K = motor.lineKey, c2 = x => Math.round(Number(x) * 100);
const copia = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const norm = d => ({ ...d, monto_bruto: montoPg(d.monto_bruto), monto_descuento: montoPg(d.monto_descuento), monto_neto: montoPg(d.monto_neto) });
const { data: ahoraRaw, error } = await sb.from('liquidacion_detalle').select('*').eq('reunion_id', R9); if (error) throw error;
const ahora = ahoraRaw.map(norm), antes = copia.lineas;
const comp = d => d.recibo_id != null || d.estado_linea === 'pagado';
const out = [], ok = (t, c, n = '') => { out.push(`${c ? '✅' : '❌'} ${t}${n ? `  → ${n}` : ''}`); return c; };
const kAntes = new Set(antes.map(K)), nuevas = ahora.filter(d => !kAntes.has(K(d)));
const premiados = [...new Set(antes.filter(d => d.concepto_tipo === 'fondo_solidario').map(d => d.inscripcion_id))];
const porCaballo = premiados.map(i => nuevas.filter(d => d.inscripcion_id === i).map(d => d.concepto).sort().join('+'));
ok(`C1 nuevas = ${nuevas.length} (esperado ${premiados.length * 3}), todas actuacion; Capataz+Peón+Sereno en cada uno de los ${premiados.length} premiados`,
  nuevas.length === premiados.length * 3 && nuevas.every(d => d.concepto_tipo === 'actuacion') && porCaballo.every(x => x === 'Capataz+Peón+Sereno') && nuevas.every(d => premiados.includes(d.inscripcion_id)),
  `caballos con otra combinación: ${porCaballo.filter(x => x !== 'Capataz+Peón+Sereno').length}`);
const totalNuevas = nuevas.reduce((a, d) => a + c2(d.monto_bruto), 0);
const porEstado = {}; nuevas.forEach(d => { porEstado[d.estado_linea] = (porEstado[d.estado_linea] || 0) + c2(d.monto_bruto); });
ok(`C2 total de las nuevas = $${(totalNuevas / 100).toFixed(2)}`, true, JSON.stringify(Object.fromEntries(Object.entries(porEstado).map(([k, v]) => [k, (v / 100).toFixed(2)]))));
const byId = new Map(ahora.map(d => [d.id, d]));
const compAntes = antes.filter(comp);
ok(`C3a ${compAntes.length} pagadas/con recibo previas: fila entera idéntica por id`, md5Filas(compAntes) === md5Filas(compAntes.map(d => byId.get(d.id) || { id: d.id, FALTA: 1 })));
const byK = new Map(ahora.map(d => [K(d), d]));
const cols = ['monto_bruto', 'monto_descuento', 'estado_linea', 'fecha_liberacion', 'recibo_id', 'beneficiario_tipo', 'beneficiario_id', 'descripcion', 'liquidacion_id', 'carrera_id', 'pagado_at'];
const noComp = antes.filter(d => !comp(d));
const distintas = noComp.filter(d => { const x = byK.get(K(d)); return !x || cols.some(c => String(x[c] ?? '') !== String(d[c] ?? '')); });
ok(`C3b ${noComp.length} retenidas/impagas previas: mismo contenido (monto, estado, liberación, recibo, beneficiario…) y ninguna desaparecida`, !distintas.length, distintas.map(d => d.id).join(','));
ok(`C3c retenidas previas: ${noComp.filter(d => d.estado_linea === 'retenido').length} siguen retenidas con la misma fecha`,
  noComp.filter(d => d.estado_linea === 'retenido').every(d => byK.get(K(d))?.estado_linea === 'retenido' && byK.get(K(d))?.fecha_liberacion === d.fecha_liberacion));
// C4
const { data: ins } = await sb.from('inscripciones').select('id,carrera_id').in('id', premiados);
const { data: cars } = await sb.from('carreras').select('id,bolsa_total,distribucion_premios').in('id', [...new Set(ins.map(i => i.carrera_id))]);
const { data: res } = await sb.from('resultados').select('id,carrera_id').in('carrera_id', cars.map(c => c.id)).eq('estado', 'oficial');
const { data: pos } = await sb.from('resultado_posiciones').select('inscripcion_id,posicion,empate').in('resultado_id', res.map(r => r.id)).in('inscripcion_id', premiados);
const oraculo = (car, p) => { const d = car.distribucion_premios, pct = d[String(p)]; if (!pct) return 0; let v = Number(car.bolsa_total) * pct / 100; if (p === 1 && d.bono_ganador) v += Number(d.bono_ganador); const m = Number(d.ganancia_minima) || 0; return m > 0 && v < m ? m : v; };
const rol = d => d.concepto_tipo === 'fondo_solidario' ? 'fondo' : d.concepto_tipo === 'actuacion' ? 'sub' : (/— (Propietario|Entrenador|Jockey) \(/.exec(d.descripcion) || [])[1];
const malos = []; let sumaEsperadaNuevas = 0;
for (const iid of premiados) {
  const p = pos.find(x => x.inscripcion_id === iid), car = cars.find(c => c.id === ins.find(i => i.id === iid).carrera_id);
  if (p.empate) { malos.push({ iid, motivo: 'empate' }); continue; }
  const P0 = oraculo(car, p.posicion);
  const ls = ahora.filter(d => d.inscripcion_id === iid && ['premio', 'fondo_solidario', 'actuacion'].includes(d.concepto_tipo));
  const suma = ls.reduce((a, d) => a + c2(d.monto_bruto), 0);
  const e18 = ls.filter(d => ['Entrenador', 'sub'].includes(rol(d))).reduce((a, d) => a + c2(d.monto_bruto), 0);
  if (suma !== c2(montoPg(P0)) || e18 !== c2(montoPg(P0 * .18))) malos.push({ iid, pos: p.posicion, P: montoPg(P0), suma: suma / 100, e18: e18 / 100, e18esp: montoPg(P0 * .18) });
  sumaEsperadaNuevas += c2(montoPg(P0 * .18)) - c2(ls.find(d => rol(d) === 'Entrenador').monto_bruto);
}
ok(`C4a los ${premiados.length} premiados reparten el 100 % exacto y entrenador + personal = 18 % exacto`, !malos.length, JSON.stringify(malos));
ok(`C4b total de las nuevas = Σ (18 % − 10 % del entrenador) por caballo, al centavo`, sumaEsperadaNuevas === totalNuevas, `esperado ${(sumaEsperadaNuevas / 100).toFixed(2)}`);
console.log(out.join('\n'));
console.log(`\nR9: ${ahora.length} líneas (antes ${antes.length}) · md5 fila entera ahora ${md5Filas(ahora)}`);
if (out.some(l => l.startsWith('❌'))) process.exitCode = 1;
```
Salida (`node postcheck_r9.mjs tests/local/out/r9_copia_2026-09-25T17-17-16-188Z.json`):
```
✅ C1 nuevas = 69 (esperado 69), todas actuacion; Capataz+Peón+Sereno en cada uno de los 23 premiados  → caballos con otra combinación: 0
✅ C2 total de las nuevas = $564096.66  → {"impago":"116760.00","retenido":"447336.66"}
✅ C3a 67 pagadas/con recibo previas: fila entera idéntica por id
✅ C3b 80 retenidas/impagas previas: mismo contenido (monto, estado, liberación, recibo, beneficiario…) y ninguna desaparecida
✅ C3c retenidas previas: 30 siguen retenidas con la misma fecha
✅ C4a los 23 premiados reparten el 100 % exacto y entrenador + personal = 18 % exacto  → []
✅ C4b total de las nuevas = Σ (18 % − 10 % del entrenador) por caballo, al centavo  → esperado 564096.66

R9: 216 líneas (antes 147) · md5 fila entera ahora d549950b3e402d83e3804142eb8b86b6
exit=0
```

## Q4 — Después: R6, R8, R9 y recibos

```sql
select r.numero,
 (select count(*) from liquidacion_detalle d where d.reunion_id=r.id) lineas,
 (select md5(string_agg(d::text,'|' order by d.id)) from liquidacion_detalle d where d.reunion_id=r.id) md5_lineas,
 (select count(*) from liquidaciones l where l.reunion_id=r.id) headers,
 (select md5(string_agg(l::text,'|' order by l.id)) from liquidaciones l where l.reunion_id=r.id) md5_headers,
 (select count(*) from liquidacion_detalle d where d.reunion_id=r.id and d.concepto_tipo='actuacion') actuacion,
 (select round(sum(monto_bruto),2) from liquidacion_detalle d where d.reunion_id=r.id and d.concepto_tipo='actuacion') actuacion_total,
 (select count(*) from recibos) recibos_total, (select max(numero_recibo) from recibos where club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' and numero_recibo<9000) ultimo_recibo
from reuniones r where r.id in ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f','cafa37d6-89f4-45cb-a0d9-835bc27407e9') order by 1;
```
```json
[{"numero":6,"lineas":192,"md5_lineas":"85051a817b77f6cda3337bee07741697","headers":86,"md5_headers":"37d13ace847db6b8a19d15f65b5d53ce","actuacion":0,"actuacion_total":null,"recibos_total":44,"ultimo_recibo":71},{"numero":8,"lineas":225,"md5_lineas":"fc82ef1b2a81d85eb4af7e7d369f5c44","headers":93,"md5_headers":"f4c60a74062900c97a669b2adf7f7e4a","actuacion":0,"actuacion_total":null,"recibos_total":44,"ultimo_recibo":71},{"numero":9,"lineas":216,"md5_lineas":"6388f31320c1ae3b8cb88dbe6fa311e0","headers":70,"md5_headers":"5dc3b9a4bb12c07167e82e12496c8b6c","actuacion":69,"actuacion_total":"564096.66","recibos_total":44,"ultimo_recibo":71}]
```

| | R6 antes → después | R8 antes → después | R9 antes → después |
|---|---|---|---|
| md5 líneas | `85051a81…` → `85051a81…` ✅ | `fc82ef1b…` → `fc82ef1b…` ✅ | `c33f00d6…` → `6388f313…` (+69) |
| md5 headers | `37d13ace…` → `37d13ace…` ✅ | `f4c60a74…` → `f4c60a74…` ✅ | `d765b0a8…` → `5dc3b9a4…` (totales; 70 → 70) |
| líneas | 192 → 192 | 225 → 225 | 147 → 216 |

(El md5 de R9 que da el script, `d549950b…`, es otro número por construcción: lo calcula en JS sobre las filas normalizadas.
El de la base es `6388f313…`.)

---

## Lo que sigue (operativo, no lo hice)

- **Recibo complementario** para los 9 caballos cuyos entrenadores ya cobraron (27 líneas, $81.320,00; recibos originales
  35, 37, 40, 45, 46, 48, 56, 61). Sale del flujo normal de Pagos: las líneas están `impago` y aparecen tildadas en el
  detalle de cada entrenador. En el recibo se ven como "Peón — (sin nombre)" etc., con el subtotal "Personal de caballeriza".
- Los 4 entrenadores que no cobraron: su 10 % y sus subs salen juntos en el mismo recibo.
- 1°/2° (30 sub-líneas retenidas): se liberan junto con el 10 % del entrenador el 2026-10-20. En Pagos hay un botón
  "✅ Habilitar caballo" que libera las 4 retenidas del caballo de una vez.
- Si se cargan los nombres de peón, capataz o sereno en Inscripciones, se ven en el recibo del próximo recálculo. Ya no
  hay riesgo de duplicado: el `concepto` es el rol.
