/**
 * recalculo_r9_subroles.mjs — recálculo de R9 con el motor del reparto al 100 % (peón/capataz/
 * sereno). Es el PASO 3 del deploy: después de la migración (reunion_liquidacion_cerrada.sql) y
 * del deploy del motor y la UI. Condiciones del OK del 25/09:
 *   (a) si algo falla en el medio, se para;
 *   (b) antes: copia de las líneas actuales y rollback escrito; después: pagadas y retenidas
 *       IDÉNTICAS (md5 antes/después) y nuevas EXACTAMENTE 3 × caballos premiados (hoy 69);
 *   (c) NO se corre mientras Valeria esté trabajando: la ventana la confirma Leo.
 *
 * Modos:
 *   node tests/recalculo_r9_subroles.mjs                          PLAN (default). Sólo lectura: motor en seco,
 *                                                                 cuenta las nuevas y muestra los md5.
 *   node tests/recalculo_r9_subroles.mjs --ejecutar --ventana-confirmada
 *                                                                 ESCRIBE. Guards → copia a tests/local/out/ →
 *                                                                 plan en seco otra vez → motor real → verificación.
 *   node tests/recalculo_r9_subroles.mjs --rollback <copia.json>  ESCRIBE. Vuelve R9 al estado de la copia (ver abajo).
 *
 * Qué verifica después de ejecutar (si algo no da, lo dice y NO sigue; el rollback se corre a mano):
 *   V1 pagadas/con recibo: md5 de la fila ENTERA, por id — idénticas.
 *   V2 retenidas e impagas que ya existían: el motor las borra y las vuelve a insertar (ids nuevos), así
 *      que se comparan por CONTENIDO (todas las columnas menos id y orden_display), por clave de línea.
 *   V3 nuevas = exactamente 3 por caballo premiado, todas concepto_tipo 'actuacion'.
 *   V4 ninguna línea de la copia desapareció.
 *
 * Rollback (--rollback): se niega si alguna línea que NO estaba en la copia ya tiene recibo o está
 * pagada (habría plata de por medio: se resuelve a mano). Si no: borra las líneas no comprometidas
 * actuales de R9, repone los headers de la copia que el motor haya borrado, reinserta las no comprometidas
 * de la copia con sus ids originales, borra los headers que no estaban (vacíos) y repone total_bruto/total_descuentos de los headers de la copia. Al final
 * compara el md5 de la fila entera de todas las líneas contra la copia.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { cargarMotor, sbDryRun, montoPg, md5Filas } from './lib/motor_dryrun.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const URL_PROD = 'https://unlhcuanfrtpatoipwve.supabase.co';
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
// SANDBOX=1 (sólo con SUPABASE_URL ≠ prod): prueba de punta a punta en tests/local sobre la reunión
// REUNION (default la 9999); saltea los dos guards que sólo tienen sentido en prod (R6/R8 cerradas,
// motor servido en sigh.com.ar).
const SANDBOX = process.env.SANDBOX === '1';
const URL_USO = SANDBOX ? process.env.SUPABASE_URL : URL_PROD;
if (SANDBOX && (!URL_USO || URL_USO.includes('unlhcuanfrtpatoipwve'))) { console.error('SANDBOX=1 exige un SUPABASE_URL que no sea prod'); process.exit(2); }
const R9 = SANDBOX ? (process.env.REUNION || 'a0000000-0000-0000-0000-000000009999') : 'cafa37d6-89f4-45cb-a0d9-835bc27407e9', R6 = 'b02ca761-6f44-4720-86aa-a3c3099019ea', R8 = '7b6e003e-22e2-4629-bf55-f18560b1260f';
const ENGINE_JS = process.env.ENGINE_JS || ROOT + 'liquidaciones-engine.js';
const ENGINE_URL = 'https://sigh.com.ar/liquidaciones-engine.js';
const args = process.argv.slice(2);
const modo = args.includes('--ejecutar') ? 'ejecutar' : args.includes('--rollback') ? 'rollback' : 'plan';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY'); process.exit(2); }
const sb = createClient(URL_USO, KEY, { auth: { persistSession: false } });
const para = msg => { console.error(`\n⛔ PARAR: ${msg}`); process.exit(1); };

const SIN_ID = ['liquidacion_id', 'carrera_id', 'concepto', 'descripcion', 'monto_bruto', 'porcentaje_desc', 'monto_descuento', 'monto_neto',
  'estado_linea', 'concepto_tipo', 'posicion', 'inscripcion_id', 'fecha_liberacion', 'pagado_at', 'recibo_id', 'beneficiario_tipo', 'beneficiario_id', 'reunion_id'];
const comprometida = d => d.recibo_id != null || d.estado_linea === 'pagado';
const norm = d => ({ ...d, monto_bruto: montoPg(d.monto_bruto), monto_descuento: montoPg(d.monto_descuento), monto_neto: montoPg(d.monto_neto) });
async function lineas() { const { data, error } = await sb.from('liquidacion_detalle').select('*').eq('reunion_id', R9); if (error) para(error.message); return data.map(norm); }
async function headers() { const { data, error } = await sb.from('liquidaciones').select('*').eq('reunion_id', R9); if (error) para(error.message); return data; }
const md5 = s => createHash('md5').update(s).digest('hex');
const contenido = (motor, ls) => md5(ls.map(d => motor.lineKey(d) + '|' + SIN_ID.map(c => d[c] ?? '').join('|')).sort().join('\n'));

async function plan(motor) {
  const prev = await lineas();
  const { sb: sbSeco, captured } = sbDryRun(sb);
  const r = await motor.generarLiquidacionesReunion({ sb: sbSeco, clubId: CLUB, reunionId: R9 });
  if (r.error) para(`el motor en seco dio error: ${r.error}`);
  const ins = captured.filter(c => c.table === 'liquidacion_detalle' && c.op === 'insert').flatMap(c => c.payload);
  const K = new Set(prev.map(motor.lineKey));
  const nuevas = ins.filter(d => !K.has(motor.lineKey(d)));
  const premiados = new Set(prev.filter(d => d.concepto_tipo === 'fondo_solidario').map(d => d.inscripcion_id)).size;
  return { prev, nuevas, premiados, total: nuevas.reduce((a, d) => a + montoPg(d.monto_bruto), 0) };
}

const motor = cargarMotor(readFileSync(ENGINE_JS, 'utf8'));

if (modo === 'plan' || modo === 'ejecutar') {
  const p = await plan(motor);
  console.log(`R9: ${p.prev.length} líneas hoy · ${p.premiados} caballos premiados · nacerían ${p.nuevas.length} (esperado ${p.premiados * 3}), $${p.total.toFixed(2)}`);
  console.log(`   tipos de las nuevas: ${[...new Set(p.nuevas.map(d => d.concepto_tipo + '/' + d.concepto))].join(', ')}`);
  console.log(`   md5 fila entera (todas): ${md5Filas(p.prev)} · comprometidas: ${md5Filas(p.prev.filter(comprometida))} · contenido no comprometidas: ${contenido(motor, p.prev.filter(d => !comprometida(d)))}`);
  if (modo === 'plan') { console.log('\nPLAN: no se escribió nada.'); process.exit(0); }

  // ── EJECUTAR ────────────────────────────────────────────────────────────────────────────
  if (!args.includes('--ventana-confirmada')) para('falta --ventana-confirmada (condición c: la ventana la confirma Leo, con Valeria fuera de Pagos)');
  // Guard de orden (condición a): migración aplicada con R6/R8 cerradas y R9 abierta.
  const { data: reus, error: eR } = await sb.from('reuniones').select('id,liquidacion_cerrada_at').in('id', [R6, R8, R9]);
  if (eR) para(`la migración no está aplicada (${eR.message})`);
  const cerr = Object.fromEntries(reus.map(r => [r.id, r.liquidacion_cerrada_at]));
  if (!SANDBOX && (!cerr[R6] || !cerr[R8])) para('R6/R8 no están cerradas: primero la migración');
  if (cerr[R9]) para('la reunión está cerrada: no se recalcula');
  // Guard de orden: el motor servido en prod es este mismo archivo.
  if (!SANDBOX) {
    const servido = await (await fetch(`${ENGINE_URL}?v=${Date.now()}`)).text();
    if (md5(servido) !== md5(readFileSync(ENGINE_JS, 'utf8'))) para(`el motor servido en ${ENGINE_URL} no es el de ${ENGINE_JS}: primero el deploy`);
  }
  if (!SANDBOX && (p.nuevas.length !== p.premiados * 3 || !p.nuevas.every(d => d.concepto_tipo === 'actuacion'))) para('el plan en seco no da exactamente 3 sub-líneas por caballo premiado');
  // Copia (condición b).
  const hdrs = await headers();
  mkdirSync(ROOT + 'tests/local/out', { recursive: true });
  const archivo = `${ROOT}tests/local/out/r9_copia_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(archivo, JSON.stringify({ reunion: R9, tomado: new Date().toISOString(), lineas: p.prev, headers: hdrs }, null, 1));
  console.log(`\nCOPIA: ${archivo} — ${p.prev.length} líneas, ${hdrs.length} headers`);
  // Recalcular con el motor real.
  const r = await motor.generarLiquidacionesReunion({ sb, clubId: CLUB, reunionId: R9 });
  console.log('motor:', JSON.stringify(r));
  if (r.error) para(`el motor dio error: ${r.error} — ver --rollback ${archivo}`);
  // Verificación.
  const post = await lineas();
  const byId = new Map(post.map(d => [d.id, d]));
  const antesComp = p.prev.filter(comprometida);
  const v1 = md5Filas(antesComp) === md5Filas(antesComp.map(d => byId.get(d.id) || { id: d.id, FALTA: true }));
  const K = new Set(p.prev.map(motor.lineKey));
  const postViejas = post.filter(d => K.has(motor.lineKey(d)) && !comprometida(d));
  const v2 = contenido(motor, p.prev.filter(d => !comprometida(d))) === contenido(motor, postViejas);
  const nuevas = post.filter(d => !K.has(motor.lineKey(d)));
  const v3 = nuevas.length === p.premiados * 3 && nuevas.every(d => d.concepto_tipo === 'actuacion');
  const postK = new Set(post.map(motor.lineKey));
  const v4 = p.prev.every(d => postK.has(motor.lineKey(d)));
  console.log(`V1 pagadas/con recibo idénticas (fila entera): ${v1 ? '✅' : '❌'}  ${md5Filas(antesComp)}`);
  console.log(`V2 retenidas/impagas previas idénticas (contenido): ${v2 ? '✅' : '❌'}`);
  console.log(`V3 nuevas = ${nuevas.length} (esperado ${p.premiados * 3}), todas actuacion: ${v3 ? '✅' : '❌'}  $${nuevas.reduce((a, d) => a + d.monto_bruto, 0).toFixed(2)}`);
  console.log(`V4 ninguna línea desapareció: ${v4 ? '✅' : '❌'}`);
  console.log(`R9 ahora: ${post.length} líneas (antes ${p.prev.length})`);
  if (!(v1 && v2 && v3 && v4)) para(`la verificación no dio — correr: node tests/recalculo_r9_subroles.mjs --rollback ${archivo}`);
  console.log('\n✅ Recálculo verificado.');
}

if (modo === 'rollback') {
  const archivo = args[args.indexOf('--rollback') + 1];
  if (!archivo) para('falta la ruta de la copia');
  const copia = JSON.parse(readFileSync(archivo, 'utf8'));
  if (copia.reunion !== R9) para('la copia no es de R9');
  const idsCopia = new Set(copia.lineas.map(d => d.id));
  const K = new Set(copia.lineas.map(motor.lineKey));
  const post = await lineas();
  const conPlata = post.filter(d => !K.has(motor.lineKey(d)) && comprometida(d));
  if (conPlata.length) para(`${conPlata.length} línea(s) nuevas ya tienen recibo o están pagadas: no se revierte automáticamente (${conPlata.map(d => d.id).join(', ')})`);
  const cambiadas = copia.lineas.filter(comprometida).filter(d => { const x = post.find(y => y.id === d.id); return !x || md5Filas([x]) !== md5Filas([d]); });
  if (cambiadas.length) para(`${cambiadas.length} línea(s) comprometidas de la copia cambiaron desde entonces: revisar a mano`);
  // 0. reponer los headers de la copia que ya no existen (el motor borra los que quedan vacíos;
  //    sin ellos, reinsertar las líneas viola la FK liquidacion_id). Sin la columna generada.
  const hdrHoy = new Set((await headers()).map(h => h.id));
  const faltan = copia.headers.filter(h => !hdrHoy.has(h.id)).map(({ total_neto, ...h }) => h);
  if (faltan.length) { const { error } = await sb.from('liquidaciones').insert(faltan); if (error) para(`reponiendo headers: ${error.message}`); }
  // 1. borrar lo no comprometido actual
  const borrar = post.filter(d => !comprometida(d)).map(d => d.id);
  for (let i = 0; i < borrar.length; i += 200) {
    const { error } = await sb.from('liquidacion_detalle').delete().in('id', borrar.slice(i, i + 200));
    if (error) para(`borrando: ${error.message}`);
  }
  // 2. reinsertar lo no comprometido de la copia, con sus ids (sin la columna generada)
  const reins = copia.lineas.filter(d => !comprometida(d)).map(({ monto_neto, ...d }) => d);
  if (reins.length) { const { error } = await sb.from('liquidacion_detalle').insert(reins); if (error) para(`reinsertando: ${error.message}`); }
  // 3. headers: borrar los que no estaban (si quedaron vacíos) y reponer totales
  const hdrCopia = new Set(copia.headers.map(h => h.id));
  for (const h of await headers()) {
    if (hdrCopia.has(h.id)) continue;
    const { count } = await sb.from('liquidacion_detalle').select('id', { count: 'exact', head: true }).eq('liquidacion_id', h.id);
    if (!count) await sb.from('liquidaciones').delete().eq('id', h.id);
    else console.warn(`⚠ header ${h.id} no estaba en la copia y tiene ${count} línea(s): se deja`);
  }
  for (const h of copia.headers) {
    const { error } = await sb.from('liquidaciones').update({ total_bruto: h.total_bruto, total_descuentos: h.total_descuentos }).eq('id', h.id);
    if (error) para(`reponiendo header ${h.id}: ${error.message}`);
  }
  const fin = await lineas();
  const ok = md5Filas(fin) === md5Filas(copia.lineas) && fin.length === copia.lineas.length && fin.every(d => idsCopia.has(d.id));
  console.log(`ROLLBACK: ${fin.length} líneas (copia ${copia.lineas.length}) · md5 fila entera ${ok ? '✅ idéntico a la copia' : '❌ DISTINTO'}`);
  if (!ok) process.exitCode = 1;
}
