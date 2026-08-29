/**
 * Probe — camino de recuperación: corregir una monta DESPUÉS de oficializar (real-code).
 *
 * Escenario que hay que poder hacer el 20/09 (Fede/Leo, 2026-08-28):
 *   Martín oficializa la carrera 1 a las 12:50 → 13:20 llega un cambio de monta →
 *   el pago arranca después de la carrera 2. ~35 minutos de ventana antes de que el
 *   paid-safe del motor lo vuelva irreversible.
 * Como el modal de Montas NO está en la vista oficial, el camino es:
 *   des-oficializar → corregir la monta → volver a oficializar.
 *
 * Corre el CÓDIGO REAL de resultados.html (extraído + AsyncFunction + stubs de DOM) y el
 * motor real liquidaciones-engine.js. Sin browser.
 *
 * SANDBOX: reunión 9999 (PRUEBA RESUMEN), NO una reunión real. Tiene justo las dos
 * situaciones que hacen falta: turno 1 con 23 líneas y 0 pagadas, turno 2 con 3 pagadas.
 * Patrón snapshot → run → assert → restore, con restore íntegro en el finally.
 *
 * D1) des-oficializar con líneas SIN pagar funciona: resultado → provisional
 * D2) esas líneas impagas/retenidas se dropean, y las PAGADAS de otra carrera no se tocan
 * D3) des-oficializar una carrera CON pagos → guard duro, no revierte
 * M1) saveMontas() persiste el jockey nuevo en inscripciones
 * O1) volver a oficializar regenera la línea con el jockey CORREGIDO
 * O2) el gate nuevo no estorba el camino de recuperación
 * G1) y sí bloquea si la monta quedó vacía
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { snapshotLineas, diffLineas, restaurarLineas, describir } from './lib/estado_lineas.mjs';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) throw new Error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a).');
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC  = readFileSync(join(HERE, '..', 'resultados.html'), 'utf8');

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

function fnBody(sig) {
  const start = SRC.indexOf(sig);
  if (start < 0) throw new Error(`no encontré: ${sig}`);
  const open = SRC.indexOf('{', start);
  let d = 0, i = open;
  for (; i < SRC.length; i++) { if (SRC[i]==='{') d++; else if (SRC[i]==='}') { d--; if (d===0) break; } }
  return SRC.slice(open + 1, i);
}
function fnFull(nombre) {
  const i = SRC.indexOf(`function ${nombre}(`);
  if (i < 0) throw new Error(`no encontré function ${nombre}(`);
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k]==='{') d++; else if (SRC[k]==='}') { d--; if (d===0) return SRC.slice(i, k+1); }
  }
  throw new Error(`no cerré ${nombre}`);
}

// Motor real (IIFE → globalThis), igual que probe_oficializar_carrera.mjs
new Function(readFileSync(join(HERE, '..', 'liquidaciones-engine.js'), 'utf8'))();
const generarLiquidacionesReunion = globalThis.generarLiquidacionesReunion;
if (typeof generarLiquidacionesReunion !== 'function') throw new Error('motor no expuesto');
const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// ── Estado de módulo compartido por los cuerpos reales ──────────────────────
const mod = {
  inscripciones: [], carreras: [], resultados: {}, posicionesMap: {}, spcsMap: {}, profsMap: {},
  currentCarreraId: null, noLargoMandiles: new Set(), moOriginal: {},
};
const toasts = [];
const confirms = [];
const domValues = {};                       // id → value (los <select> del modal)
const document = {
  getElementById: (id) => {
    if (id === 'sel-reunion') return { value: R9999 };
    // Fiel al DOM real para las FILAS del modal: un `mo-<uuid>` que el render no creó
    // devuelve null, no un elemento vacío. Con un stub permisivo, saveMontas leía '' en cada
    // fila y "borraba" todos los jockeys de la carrera. Los ids estáticos (modal-montas,
    // mo-tbody, mo-title…) sí existen siempre, como en el HTML.
    if (/^mo-[0-9a-f]{8}-/.test(id) && !(id in domValues)) return null;
    if (!(id in domValues)) domValues[id] = '';
    return {
      get value() { return domValues[id]; },
      set value(v) { domValues[id] = v; },
      set textContent(v) { domValues[id + ':text'] = v; },
      set innerHTML(v) { domValues[id + ':html'] = v; },
      classList: { add(){}, remove(){}, toggle(){} },
    };
  },
};
const toast = (m, t) => toasts.push({ m, t });
const confirmStub = (m) => { confirms.push(m); return true; };

// renumerar-chapas.js se INLINEA en el cuerpo: new Function(src)() lo deja en el scope local
// de esa Function, no en globalThis, así que pasarlo como dependencia no alcanza.
const RENUM = readFileSync(join(HERE, '..', 'renumerar-chapas.js'), 'utf8');
const MONTAS_FNS = RENUM + '\n' + ['moInscripciones', 'moOpciones', 'montasFaltantes'].map(fnFull).join('\n');
const DEPS = ['sb','CLUB_ID','generarLiquidacionesReunion','document','toast','confirm','fmt',
              'inscripciones','carreras','resultados','posicionesMap','spcsMap','profsMap',
              'currentCarreraId','noLargoMandiles','moOriginal',
              'abrirResultado','openMontas','ActiveReunion','aplicar'];
function bind(sig, args) {
  const body = `${MONTAS_FNS}\n${fnBody(sig)}`;
  const fn = new AsyncFunction(...args, ...DEPS, body);
  return (...vals) => fn(...vals, sb, CLUB_ID, generarLiquidacionesReunion, document, toast,
    confirmStub, fmt, mod.inscripciones, mod.carreras, mod.resultados, mod.posicionesMap,
    mod.spcsMap, mod.profsMap, mod.currentCarreraId, mod.noLargoMandiles, mod.moOriginal,
    () => {}, () => { aperturasMontas++; }, { set(){}, resolve(){} }, aplicarStub);
}
let aperturasMontas = 0;

// aplicar() es el F10 completo (marcador + dividendos + RPC aplicar_resultado). Acá sólo
// interesa su EFECTO sobre el estado del resultado, que es lo que oficializar() consulta
// después (`if (res?.estado !== 'oficial') return;`). El resto del camino —el gate, las
// performances y el recálculo de la liquidación— corre con el código real.
async function aplicarStub(carreraId, estado) {
  const { error } = await sb.from('resultados').update({ estado }).eq('carrera_id', carreraId);
  if (error) throw new Error('aplicarStub: ' + error.message);
  mod.resultados[carreraId] = { ...mod.resultados[carreraId], estado };
}

const desoficializarReal = bind('async function desoficializar(resId, carreraId)', ['resId','carreraId']);
const oficializarReal    = bind('async function oficializar(carreraId)', ['carreraId']);
const saveMontasReal     = bind('async function saveMontas()', []);

/* ── Sandbox ────────────────────────────────────────────────────────────────── */
const { data: r9 } = await sb.from('reuniones').select('id,numero').eq('club_id', CLUB_ID).eq('numero', 9999).single();
const R9999 = r9.id;
const { data: cars } = await sb.from('carreras').select('*').eq('reunion_id', R9999).order('numero_turno');
const carIds = cars.map(c => c.id);
const { data: resAll } = await sb.from('resultados').select('*').in('carrera_id', carIds);
const { data: posAll } = await sb.from('resultado_posiciones').select('*').in('resultado_id', resAll.map(r=>r.id));
const { data: inscAll } = await sb.from('inscripciones').select('*').in('carrera_id', carIds);
const { data: profsAll } = await sb.from('profesionales').select('id,nombre,apellido,tipo').eq('club_id', CLUB_ID);
const { data: spcsAll } = await sb.from('spcs').select('id,nombre');

mod.carreras.push(...cars);
mod.inscripciones.push(...inscAll.map(i => ({ ...i })));
resAll.forEach(r => { mod.resultados[r.carrera_id] = { ...r }; });
posAll.forEach(p => { (mod.posicionesMap[p.resultado_id] ??= []).push(p); });
profsAll.forEach(p => { mod.profsMap[p.id] = p; });
spcsAll.forEach(s => { mod.spcsMap[s.id] = s; });

const dets = async () => {
  const { data: liqs } = await sb.from('liquidaciones').select('id').eq('reunion_id', R9999);
  const ids = (liqs||[]).map(l=>l.id);
  if (!ids.length) return [];
  const { data } = await sb.from('liquidacion_detalle').select('*').in('liquidacion_id', ids);
  return data || [];
};
const detsDe = (rows, carreraId, inscIdsDe) =>
  rows.filter(d => d.carrera_id === carreraId || (d.inscripcion_id && inscIdsDe.has(d.inscripcion_id)));

const snapDets = await dets();
const snapLiqs = (await sb.from('liquidaciones').select('*').eq('reunion_id', R9999)).data;
// Foto por ESTADO, además de la de filas enteras. snapDets alcanza para reinsertar, pero la
// verificación de abajo comparaba sólo IDS: los ids pueden coincidir y los estados no. Es la
// misma clase de error que dio verde el restore del recibo del 2026-08-28.
const snapEstados = await snapshotLineas(sb, R9999);
const snapRes  = resAll.map(r => ({ id: r.id, estado: r.estado }));
const snapInsc = inscAll.map(i => ({ id: i.id, jockey_titular_id: i.jockey_titular_id }));

const conPagos = cars.find(c => detsDe(snapDets, c.id, new Set(inscAll.filter(i=>i.carrera_id===c.id).map(i=>i.id)))
  .some(d => d.estado_linea === 'pagado' || d.recibo_id));
const sinPagos = cars.find(c => c.id !== conPagos?.id &&
  detsDe(snapDets, c.id, new Set(inscAll.filter(i=>i.carrera_id===c.id).map(i=>i.id))).length > 0 &&
  !detsDe(snapDets, c.id, new Set(inscAll.filter(i=>i.carrera_id===c.id).map(i=>i.id)))
    .some(d => d.estado_linea === 'pagado' || d.recibo_id));
if (!conPagos || !sinPagos) throw new Error('R9999 no tiene las dos situaciones (con y sin pagos)');
const INSC_SIN = new Set(inscAll.filter(i => i.carrera_id === sinPagos.id).map(i => i.id));

console.log(`[sandbox] R9999 · sin pagos = turno ${sinPagos.numero_turno} · con pagos = turno ${conPagos.numero_turno}`);

let restaurar = true;
try {
  /* ── D1/D2 — des-oficializar con líneas SIN pagar ───────────────────────── */
  const antes = await dets();
  const pagadasAntes = antes.filter(d => d.estado_linea === 'pagado' || d.recibo_id).map(d => d.id).sort();
  toasts.length = 0;
  await desoficializarReal(mod.resultados[sinPagos.id].id, sinPagos.id);

  const { data: resD } = await sb.from('resultados').select('estado').eq('carrera_id', sinPagos.id).single();
  ok('D1 · des-oficializar con líneas sin pagar → provisional', resD.estado === 'provisional', resD.estado);
  ok('D1b · no tiró el error del guard',
     !toasts.some(t => (t.m||'').includes('pagos emitidos')),
     toasts.map(t=>t.m).join(' | ') || '(sin toasts de error)');

  const despues = await dets();
  const quedanDeEsa = detsDe(despues, sinPagos.id, INSC_SIN);
  ok('D2 · las líneas de esa carrera se dropearon', quedanDeEsa.length === 0,
     `${detsDe(antes, sinPagos.id, INSC_SIN).length} → ${quedanDeEsa.length}`);
  const pagadasDespues = despues.filter(d => d.estado_linea === 'pagado' || d.recibo_id).map(d => d.id).sort();
  ok('D2b · las PAGADAS de la otra carrera quedaron intactas',
     JSON.stringify(pagadasAntes) === JSON.stringify(pagadasDespues),
     `${pagadasAntes.length} pagadas antes y después`);

  /* ── D3 — guard duro sobre la carrera con pagos ─────────────────────────── */
  toasts.length = 0;
  await desoficializarReal(mod.resultados[conPagos.id].id, conPagos.id);
  const { data: resP } = await sb.from('resultados').select('estado').eq('carrera_id', conPagos.id).single();
  ok('D3 · carrera con pagos → NO se des-oficializa', resP.estado === 'oficial', resP.estado);
  ok('D3b · avisa con el mensaje del guard',
     toasts.some(t => (t.m||'').includes('pagos emitidos')),
     toasts.map(t=>t.m).join(' | '));

  /* ── M1 — corregir la monta con el saveMontas() real ────────────────────── */
  const ubicado = posAll.find(p => p.resultado_id === mod.resultados[sinPagos.id].id && !p.no_largo && p.posicion === 1);
  const inscCambia = mod.inscripciones.find(i => i.id === ubicado.inscripcion_id);
  const jockViejo = inscCambia.jockey_titular_id;
  const jockNuevo = profsAll.find(p => (p.tipo === 'jockey' || p.tipo === 'ambos') && p.id !== jockViejo).id;

  // Simular lo que deja openMontas(): moOriginal + un <select> por cada ratificado, con su
  // jockey actual seleccionado. Después se cambia UNO solo, que es el gesto del operador.
  mod.currentCarreraId = sinPagos.id;
  for (const i of mod.inscripciones.filter(x => x.carrera_id === sinPagos.id && x.estado === 'ratificado')) {
    mod.moOriginal[i.id] = i.jockey_titular_id || null;
    domValues[`mo-${i.id}`] = i.jockey_titular_id || '';
  }
  domValues[`mo-${inscCambia.id}`] = jockNuevo;
  await saveMontasReal();

  const { data: intactos } = await sb.from('inscripciones')
    .select('id,jockey_titular_id').eq('carrera_id', sinPagos.id).eq('estado', 'ratificado');
  ok('M1b · no tocó las montas que el operador no cambió',
     intactos.filter(i => i.id !== inscCambia.id)
       .every(i => i.jockey_titular_id === snapInsc.find(s => s.id === i.id).jockey_titular_id),
     `${intactos.length - 1} filas sin cambios`);

  const { data: inscDb } = await sb.from('inscripciones').select('jockey_titular_id').eq('id', inscCambia.id).single();
  ok('M1 · saveMontas persiste el jockey nuevo', inscDb.jockey_titular_id === jockNuevo,
     `${profsAll.find(p=>p.id===jockViejo)?.apellido||'(null)'} → ${profsAll.find(p=>p.id===jockNuevo)?.apellido}`);
  inscCambia.jockey_titular_id = jockNuevo;

  /* ── O1/O2 — volver a oficializar y verificar que la línea salió corregida ─ */
  toasts.length = 0; confirms.length = 0;
  await oficializarReal(sinPagos.id);
  const { data: resO } = await sb.from('resultados').select('estado').eq('carrera_id', sinPagos.id).single();
  ok('O2 · el gate nuevo no estorba: vuelve a oficializar', resO.estado === 'oficial', resO.estado);
  ok('O2b · el gate no disparó su diálogo',
     !confirms.some(m => m.includes('No se puede oficializar')));

  const final = await dets();
  const lineaJockey = detsDe(final, sinPagos.id, INSC_SIN).find(d =>
    d.inscripcion_id === inscCambia.id && (d.descripcion||'').includes('Jockey'));
  ok('O1 · la línea de premio del jockey se regeneró', !!lineaJockey,
     lineaJockey ? lineaJockey.descripcion : 'no la encontré');
  ok('O1b · el beneficiario es el jockey CORREGIDO, no el viejo',
     lineaJockey?.beneficiario_id === jockNuevo,
     `esperaba ${jockNuevo}, vino ${lineaJockey?.beneficiario_id}`);

  /* ── G1 — con la monta vacía el gate bloquea ────────────────────────────── */
  await sb.from('inscripciones').update({ jockey_titular_id: null }).eq('id', inscCambia.id);
  inscCambia.jockey_titular_id = null;
  await desoficializarReal(mod.resultados[sinPagos.id].id, sinPagos.id);
  await sb.from('resultados').update({ estado: 'provisional' }).eq('carrera_id', sinPagos.id);
  mod.resultados[sinPagos.id].estado = 'provisional';
  confirms.length = 0; aperturasMontas = 0;
  await oficializarReal(sinPagos.id);
  const { data: resG } = await sb.from('resultados').select('estado').eq('carrera_id', sinPagos.id).single();
  ok('G1 · monta vacía → el gate bloquea la re-oficialización', resG.estado !== 'oficial', resG.estado);
  ok('G1b · nombra el caballo y ofrece Montas',
     confirms.some(m => m.includes('No se puede oficializar')) && aperturasMontas === 1,
     confirms[0] ? confirms[0].split('\n')[0] : '(sin diálogo)');

} catch (e) {
  ok('EXCEPCIÓN', false, e.message);
  console.error(e);
} finally {
  /* ── RESTORE íntegro ────────────────────────────────────────────────────── */
  try {
    for (const i of snapInsc) await sb.from('inscripciones').update({ jockey_titular_id: i.jockey_titular_id }).eq('id', i.id);
    const { data: liqsNow } = await sb.from('liquidaciones').select('id').eq('reunion_id', R9999);
    const idsNow = (liqsNow||[]).map(l=>l.id);
    if (idsNow.length) await sb.from('liquidacion_detalle').delete().in('liquidacion_id', idsNow);
    await sb.from('liquidaciones').delete().eq('reunion_id', R9999);
    const GEN = ['total_neto','monto_neto'];                      // columnas GENERATED: no van en el INSERT
    if (snapLiqs.length) await sb.from('liquidaciones').insert(snapLiqs.map(l => { const o={...l}; GEN.forEach(k=>delete o[k]); return o; }));
    if (snapDets.length) await sb.from('liquidacion_detalle').insert(snapDets.map(d => { const o={...d}; GEN.forEach(k=>delete o[k]); return o; }));
    for (const r of snapRes) await sb.from('resultados').update({ estado: r.estado }).eq('id', r.id);

    const finalDets = await dets();
    const finalInsc = (await sb.from('inscripciones').select('id,jockey_titular_id').in('carrera_id', carIds)).data;
    const finalRes  = (await sb.from('resultados').select('id,estado').in('carrera_id', carIds)).data;
    ok('R1 · restore liquidacion_detalle (mismos ids)',
       JSON.stringify(finalDets.map(d=>d.id).sort()) === JSON.stringify(snapDets.map(d=>d.id).sort()),
       `${finalDets.length} vs ${snapDets.length}`);
    // R1 sola no alcanza: compara IDS. Que las filas estén no dice nada de su estado_linea ni de
    // su recibo_id, que es exactamente lo que se movió sin que nadie lo viera el 2026-08-28.
    const arregladas = await restaurarLineas(sb, snapEstados, await snapshotLineas(sb, R9999));
    const verif = diffLineas(snapEstados, await snapshotLineas(sb, R9999));
    ok('R1b · restore por ESTADO (estado_linea, recibo_id, montos), no sólo por ids',
       verif.limpio, describir(verif));
    ok('R1c · no hubo que restaurar nada de emergencia', arregladas === 0,
       `${arregladas} línea(s) devueltas a su estado`);
    ok('R2 · restore jockeys de inscripciones',
       snapInsc.every(s => finalInsc.find(f=>f.id===s.id)?.jockey_titular_id === s.jockey_titular_id));
    ok('R3 · restore estados de resultados',
       snapRes.every(s => finalRes.find(f=>f.id===s.id)?.estado === s.estado));
  } catch (e) {
    ok('RESTORE FALLÓ', false, e.message);
    console.error('⚠️ RESTORE FALLÓ — revisar R9999 a mano:', e);
  }
}

console.log('\n── Probe recuperación de monta post-oficialización (sandbox R9999) ──');
for (const r of results) console.log(`${r.s}  ${r.t}${r.n ? ' — ' + r.n : ''}`);
const fail = results.filter(r => r.s === '❌').length;
console.log(`\n${results.length - fail}/${results.length} OK${fail ? ` · ${fail} FALLAN` : ''}`);
process.exit(fail ? 1 : 0);
