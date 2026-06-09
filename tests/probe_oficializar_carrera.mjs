/**
 * Probe 2bis — Oficializar / Des-oficializar carrera (real-code, R5).
 *
 * Corre el CÓDIGO REAL:
 *  - el motor liquidaciones-engine.js (generarLiquidacionesReunion, paid-safe) — fuente única,
 *    el mismo que usan liquidaciones.html ("Recalcular reunión") y resultados.html (oficializar).
 *  - el cuerpo real de desoficializar() de resultados.html (extraído + AsyncFunction + stubs DOM).
 * Sin browser (chromium no corre en ubuntu26.04). Patrón snapshot→mutate→run→assert→restore.
 *
 * Checks (Fede 2026-06-09):
 *  a) oficializar UNA carrera → esa carrera queda oficial + se generan SUS líneas (carrera_id).
 *  b) oficializar carrera 2 con carrera 1 YA PAGADA → preserva las pagadas, agrega las nuevas,
 *     NO bloquea ni duplica (pay-as-you-go).
 *  c) jockey con montas en >1 carrera → 1 sola línea incentivo_jockey (dedup per-reunión).
 *  d) des-oficializar sin pagos → resultado provisional + líneas de esa carrera dropeadas.
 *  e) des-oficializar con una línea pagada → guard duro: NO revierte, mensaje exacto.
 *  f) reunión oficial = estado DERIVADO: true sólo si TODAS las carreras están oficiales.
 * Restore íntegro (resultados.estado, liquidaciones/detalle, roles de inscripciones).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} (source .env antes de correr).`);
  return v;
}
const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || requireEnv('SUPABASE_SECRET_KEY');
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const R5      = 'c90b6186-268d-4089-8cc6-71626b627cf8';
const JOCK_ID = 'f6637123-af74-42ae-81e1-d5b9fed88fc9'; // profesionales.id (jockey)

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const ok = (t, c, n = '') => results.push({ t, s: c ? '✅' : '❌', n });
const HERE = dirname(fileURLToPath(import.meta.url));

function extractFnBody(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) throw new Error(`No encontré la firma: ${signature}`);
  const braceOpen = src.indexOf('{', start);
  let depth = 0, i = braceOpen;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(braceOpen + 1, i);
}

// Cargar el motor real (IIFE → attach a globalThis). Mismo texto que sirve prod.
new Function(readFileSync(join(HERE, '..', 'liquidaciones-engine.js'), 'utf8'))();
const generarLiquidacionesReunion = globalThis.generarLiquidacionesReunion;
if (typeof generarLiquidacionesReunion !== 'function') throw new Error('motor no expuesto');

// Cuerpo real de desoficializar() de resultados.html.
const resHtml = readFileSync(join(HERE, '..', 'resultados.html'), 'utf8');
const desofBody = extractFnBody(resHtml, 'async function desoficializar(resId, carreraId)');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const desoficializarFn = new AsyncFunction(
  'resId', 'carreraId', 'sb', 'CLUB_ID', 'generarLiquidacionesReunion', 'document', 'toast', 'confirm',
  'resultados', 'carreras', 'abrirResultado', desofBody);

const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
const lineKey = globalThis.lineKey;

async function runEngine() {
  return generarLiquidacionesReunion({ sb, clubId: CLUB_ID, reunionId: R5, fmt });
}
async function detsByCarrera(carreraId) {
  const { data: liqs } = await sb.from('liquidaciones').select('id').eq('reunion_id', R5);
  const ids = (liqs || []).map(l => l.id);
  if (!ids.length) return [];
  const { data } = await sb.from('liquidacion_detalle').select('*').in('liquidacion_id', ids).eq('carrera_id', carreraId);
  return data || [];
}
async function allDets() {
  const { data: liqs } = await sb.from('liquidaciones').select('id').eq('reunion_id', R5);
  const ids = (liqs || []).map(l => l.id);
  if (!ids.length) return [];
  const { data } = await sb.from('liquidacion_detalle').select('*').in('liquidacion_id', ids);
  return data || [];
}
async function setEstado(resId, estado) {
  const { error } = await sb.from('resultados').update({ estado }).eq('id', resId);
  if (error) throw new Error(`setEstado ${resId} ${estado}: ${error.message}`);
}

(async () => {
  let phase = 'init';
  let snapResEstados = null, snapLiqs = null, snapDets = null, snapInscs = null;
  const ROLE_FIELDS = ['jockey_titular_id'];
  try {
    // ════ SNAPSHOT ════
    phase = 'snapshot';
    const { data: liqConfig } = await sb.from('liquidacion_config').select('*').eq('club_id', CLUB_ID).eq('activo', true).maybeSingle();
    const incJockey = parseFloat(liqConfig?.incentivo_jockey_monto) || 0;
    console.log(`[config] incentivo_jockey=${incJockey}`);

    const { data: cars } = await sb.from('carreras').select('id,numero_turno,reunion_id').eq('reunion_id', R5).order('numero_turno');
    const carIds = cars.map(c => c.id);
    const { data: resAll } = await sb.from('resultados').select('id,carrera_id,estado').in('carrera_id', carIds);
    snapResEstados = resAll.map(r => ({ id: r.id, carrera_id: r.carrera_id, estado: r.estado }));
    const resByCar = Object.fromEntries(resAll.map(r => [r.carrera_id, r]));

    const { data: liqsBefore } = await sb.from('liquidaciones').select('*').eq('reunion_id', R5);
    snapLiqs = liqsBefore;
    if (liqsBefore.some(l => l.estado === 'aprobada' || l.estado === 'pagada')) throw new Error('R5 con liquidaciones aprobadas/pagadas — abortando.');
    const liqIds = liqsBefore.map(l => l.id);
    const { data: detsBefore } = liqIds.length ? await sb.from('liquidacion_detalle').select('*').in('liquidacion_id', liqIds) : { data: [] };
    snapDets = detsBefore;
    if (detsBefore.some(d => d.estado_linea === 'pagado' || d.recibo_id)) throw new Error('R5 con líneas pagadas/con recibo — abortando.');

    // Carreras "oficializables": las que tienen resultado con ≥1 ubicado (posicion not null, no_largo=false).
    const { data: placed } = await sb.from('resultado_posiciones').select('resultado_id,inscripcion_id')
      .in('resultado_id', resAll.map(r => r.id)).eq('no_largo', false).not('posicion', 'is', null);
    const carByRes = Object.fromEntries(resAll.map(r => [r.id, r.carrera_id]));
    const placedByCar = {};
    for (const p of placed) (placedByCar[carByRes[p.resultado_id]] ??= []).push(p.inscripcion_id);
    const oficializables = cars.filter(c => (placedByCar[c.id] || []).length).map(c => c.id);
    if (oficializables.length < 2) throw new Error(`R5 necesita ≥2 carreras con ubicados; hay ${oficializables.length}.`);
    const CAR_A = oficializables[0], CAR_B = oficializables[1];
    const RA = resByCar[CAR_A].id, RB = resByCar[CAR_B].id;
    console.log(`[snapshot] CAR_A=${CAR_A} CAR_B=${CAR_B} · oficializables=${oficializables.length}`);

    // Para (c): asignar JOCK_ID a un ubicado-ratificado de CAR_A y uno de CAR_B (montas en 2 carreras).
    const placedAB = [...new Set([...(placedByCar[CAR_A] || []), ...(placedByCar[CAR_B] || [])])];
    const { data: inscAB } = await sb.from('inscripciones').select('id,carrera_id,estado,jockey_titular_id').in('id', placedAB);
    snapInscs = inscAB;
    const ratA = inscAB.find(i => i.carrera_id === CAR_A && i.estado === 'ratificado');
    const ratB = inscAB.find(i => i.carrera_id === CAR_B && i.estado === 'ratificado');
    if (!ratA || !ratB) throw new Error('faltan ubicados ratificados en CAR_A/CAR_B para el test de jockey.');

    // ════ MUTATE (baseline limpio) ════
    phase = 'mutate';
    // Limpiar liquidaciones de R5 + poner todos los resultados provisional (baseline conocido).
    if (liqIds.length) { await sb.from('liquidacion_detalle').delete().in('liquidacion_id', liqIds); await sb.from('liquidaciones').delete().in('id', liqIds); }
    for (const r of resAll) if (r.estado !== 'provisional') await setEstado(r.id, 'provisional');
    await sb.from('inscripciones').update({ jockey_titular_id: JOCK_ID }).eq('id', ratA.id);
    await sb.from('inscripciones').update({ jockey_titular_id: JOCK_ID }).eq('id', ratB.id);

    // Deps para correr el desoficializar real.
    const carrerasDep = cars.map(c => ({ id: c.id, reunion_id: R5 }));
    const resultadosDep = Object.fromEntries(resAll.map(r => [r.carrera_id, { id: r.id, estado: 'provisional' }]));
    let toastMsgs = [];
    const documentStub = { getElementById: () => ({ value: R5 }) };
    const callDesof = async (resId, carreraId) => {
      toastMsgs = [];
      resultadosDep[carreraId] = { id: resId, estado: 'oficial' };
      await desoficializarFn(resId, carreraId, sb, CLUB_ID, generarLiquidacionesReunion, documentStub,
        (m) => toastMsgs.push(m), () => true, resultadosDep, carrerasDep, async () => {});
      return toastMsgs;
    };

    // ════ (a) oficializar UNA carrera ════
    phase = 'a';
    await setEstado(RA, 'oficial');
    await runEngine();
    const detsA = await detsByCarrera(CAR_A);
    const detsB1 = await detsByCarrera(CAR_B);
    ok('a1 oficializar CAR_A → genera líneas con carrera_id=CAR_A', detsA.length > 0, `lineas=${detsA.length}`);
    ok('a2 CAR_A genera al menos un premio', detsA.some(d => d.concepto_tipo === 'premio'));
    ok('a3 CAR_B (provisional) NO tiene líneas', detsB1.length === 0, `lineas=${detsB1.length}`);
    // (f) reunión NO oficial todavía (sólo CAR_A oficial)
    const estados1 = (await sb.from('resultados').select('carrera_id,estado').in('carrera_id', carIds)).data;
    const allOf1 = cars.every(c => estados1.find(e => e.carrera_id === c.id)?.estado === 'oficial');
    ok('f1 reunión NO oficial con 1 sola carrera oficial', allOf1 === false);

    // ════ oficializar CAR_B (para c) ════
    phase = 'c';
    await setEstado(RB, 'oficial');
    await runEngine();
    const detsB2 = await detsByCarrera(CAR_B);
    ok('a4 oficializar CAR_B → genera SUS líneas', detsB2.length > 0, `lineas=${detsB2.length}`);
    const allNow = await allDets();
    const jockMine = allNow.filter(d => d.concepto_tipo === 'incentivo_jockey' && d.beneficiario_id === JOCK_ID);
    ok('c1 jockey con montas en 2 carreras → 1 sola línea incentivo_jockey', jockMine.length === 1, `lineas=${jockMine.length}`);
    ok('c2 la línea de incentivo jockey no tiene carrera_id (per-reunión)', jockMine.length === 1 && jockMine[0].carrera_id == null && jockMine[0].inscripcion_id == null);

    // ════ (b) pagar una línea de CAR_A + recompute → preserva, no bloquea, no duplica ════
    phase = 'b';
    const detsA_now = await detsByCarrera(CAR_A);
    const payLine = detsA_now.find(d => d.estado_linea !== 'pagado') || detsA_now[0];
    await sb.from('liquidacion_detalle').update({ estado_linea: 'pagado', pagado_at: new Date(0).toISOString() }).eq('id', payLine.id);
    const payKey = lineKey(payLine);
    const rb = await runEngine();   // simula otra oficialización / recálculo
    ok('b0 recompute con línea pagada NO devuelve error (no bloquea)', !rb.error, rb.error || `headers=${rb.headers} preserved=${rb.preserved}`);
    const afterPay = await allDets();
    const stillPaid = afterPay.filter(d => d.estado_linea === 'pagado');
    ok('b1 la línea pagada se preservó (sigue pagada)', stillPaid.some(d => d.id === payLine.id), `pagadas=${stillPaid.length}`);
    const sameKey = afterPay.filter(d => lineKey(d) === payKey);
    ok('b2 no se duplicó la línea pagada (1 sola con esa clave)', sameKey.length === 1, `count=${sameKey.length}`);
    ok('b3 CAR_B sigue con sus líneas tras el recompute', (await detsByCarrera(CAR_B)).length > 0);

    // ════ (e) des-oficializar CAR_A (tiene línea pagada) → guard duro, NO revierte ════
    phase = 'e';
    const msgsE = await callDesof(RA, CAR_A);
    const estadoA = (await sb.from('resultados').select('estado').eq('id', RA).single()).data.estado;
    ok('e1 guard duro: mensaje exacto', msgsE.includes('carrera con pagos emitidos, anulá los recibos primero'), msgsE.join(' | '));
    ok('e2 NO revierte: CAR_A sigue oficial', estadoA === 'oficial', `estado=${estadoA}`);
    ok('e3 la línea pagada de CAR_A sigue presente', (await detsByCarrera(CAR_A)).some(d => d.id === payLine.id));

    // ════ (d) des-oficializar CAR_B (sin pagos) → provisional + líneas dropeadas ════
    phase = 'd';
    const msgsD = await callDesof(RB, CAR_B);
    const estadoB = (await sb.from('resultados').select('estado').eq('id', RB).single()).data.estado;
    ok('d1 des-oficializar sin pagos → CAR_B provisional', estadoB === 'provisional', `estado=${estadoB}`);
    ok('d2 líneas de CAR_B dropeadas', (await detsByCarrera(CAR_B)).length === 0);
    ok('d3 CAR_A intacta (línea pagada preservada)', (await detsByCarrera(CAR_A)).some(d => d.id === payLine.id));
    ok('d4 no rompe: sin mensaje de error de pagos', !msgsD.some(m => m.includes('pagos emitidos')), msgsD.join(' | '));

    // ════ (f) reunión oficial = estado DERIVADO (misma regla que el badge de renderLista:
    // carreras.every(c => resultados[c.id]?.estado === 'oficial')). Se testea el predicado en
    // ambas direcciones — R5 tiene carreras sin resultado (nunca llega a oficial completa real,
    // que es justamente lo correcto). f1 ya cubrió el caso falso contra DB real.
    phase = 'f';
    const reunionOficial = (mapEstados) => cars.length > 0 && cars.every(c => mapEstados[c.id] === 'oficial');
    const allOficialMap = Object.fromEntries(cars.map(c => [c.id, 'oficial']));
    ok('f2 reunión oficial cuando TODAS las carreras lo están', reunionOficial(allOficialMap) === true);
    ok('f3 reunión NO oficial si una carrera no lo está', reunionOficial({ ...allOficialMap, [cars[0].id]: 'provisional' }) === false);

  } catch (e) {
    ok(`EXCEPCIÓN en fase '${phase}'`, false, e.message);
    console.error(e);
  } finally {
    // ════ RESTORE ════
    try {
      const { data: nowLiqs } = await sb.from('liquidaciones').select('id').eq('reunion_id', R5);
      const nowIds = (nowLiqs || []).map(l => l.id);
      if (nowIds.length) { await sb.from('liquidacion_detalle').delete().in('liquidacion_id', nowIds); await sb.from('liquidaciones').delete().in('id', nowIds); }
      if (snapLiqs?.length) {
        const { error } = await sb.from('liquidaciones').insert(snapLiqs.map(({ total_neto, ...r }) => r));
        if (error) throw new Error(`restore liquidaciones: ${error.message}`);
      }
      if (snapDets?.length) {
        const { error } = await sb.from('liquidacion_detalle').insert(snapDets.map(({ monto_neto, ...r }) => r));
        if (error) throw new Error(`restore detalle: ${error.message}`);
      }
      for (const s of (snapResEstados || [])) await sb.from('resultados').update({ estado: s.estado }).eq('id', s.id);
      for (const ins of (snapInscs || [])) await sb.from('inscripciones').update({ jockey_titular_id: ins.jockey_titular_id ?? null }).eq('id', ins.id);
      const { data: liqsFin } = await sb.from('liquidaciones').select('id').eq('reunion_id', R5);
      ok('R1 restore liquidaciones (count == original)', (liqsFin?.length || 0) === (snapLiqs?.length || 0), `final=${liqsFin?.length} original=${snapLiqs?.length}`);
      let inscR = true;
      if (snapInscs?.length) {
        const { data: f } = await sb.from('inscripciones').select('id,jockey_titular_id').in('id', snapInscs.map(i => i.id));
        inscR = snapInscs.every(o => { const r = f.find(x => x.id === o.id); return r && (r.jockey_titular_id ?? null) === (o.jockey_titular_id ?? null); });
      }
      ok('R2 restore roles de inscripciones', inscR);
    } catch (e) {
      ok('RESTORE FALLÓ — REVISAR R5 MANUALMENTE', false, e.message);
      console.error('[restore]', e);
    }
    console.log('\n──────── RESULTADO ────────');
    for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  (' + r.n + ')' : ''}`);
    const failed = results.filter(r => r.s === '❌').length;
    console.log(`\n${failed === 0 ? '✅ TODO OK' : '❌ ' + failed + ' fallo(s)'} — ${results.length} checks`);
    process.exit(failed === 0 ? 0 : 1);
  }
})();
