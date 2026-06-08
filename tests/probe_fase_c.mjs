/**
 * Probe Fase C — estado_linea + retención anti-doping (NOTA-A: subs acompañan).
 *
 * CORRE EL CÓDIGO REAL de generarLiquidaciones() de liquidaciones.html (working tree,
 * rama feat/liquidaciones-fase-c). NO usa browser: Playwright NO soporta chromium en
 * ubuntu26.04 ("Playwright does not support chromium on ubuntu26.04-x64"), igual que
 * documenta probe_fase2_liquidaciones.mjs. En su lugar EXTRAE el cuerpo de la función y
 * lo ejecuta vía AsyncFunction con un cliente Supabase real + stubs de DOM. Es el código
 * REAL, no una reimplementación ni un UPDATE.
 *
 * Reunión objetivo: b02ca761-6f44-4720-86aa-a3c3099019ea (Dolores, fecha 2026-06-20).
 * Elegida porque dispara NOTA-A: carrera turno 1 con resultado OFICIAL y los caballos de
 * 1° y 2° tienen propietario_id + peon/capataz/sereno cargados → se generan líneas de
 * premio (1°/2°) Y sus sub-líneas concepto_tipo='actuacion'. Sin líneas pagadas/recibo.
 *
 * Verifica:
 *  - premio 1°/2° → estado_linea='retenido' + fecha_liberacion = fecha_reunion + dias_antidoping
 *  - sub-líneas actuacion de esos 1°/2° → TAMBIÉN retenido + MISMA fecha (NOTA-A real)
 *  - todo lo demás (premios 3°-5°, bono, fondo, incentivos) → impago, fecha null
 *  - invariantes (b) retenido-válido y (c) ningún premio/actuacion 1°/2° impago = 0
 *  - fecha_liberacion = fecha_reunion + 30 exacto (sin corrimiento N-1 de timezone)
 *
 * SEGURIDAD: escribe (genera/borra liquidaciones de prueba). Snapshot + restore total al
 * final. El resultado YA está oficial y los roles YA están cargados → no muta nada de eso.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Exportala (o source .env) antes de correr.`);
  return v;
}

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const REUNION = 'b02ca761-6f44-4720-86aa-a3c3099019ea';

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const ok = (t, c, n='') => results.push({ t, s: c ? '✅' : '❌', n });

function extractFnBody(html, signature) {
  const start = html.indexOf(signature);
  if (start < 0) throw new Error(`No encontré la firma: ${signature}`);
  const braceOpen = html.indexOf('{', start);
  let depth = 0, i = braceOpen;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) break; }
  }
  return html.slice(braceOpen + 1, i);
}

// fecha_liberacion esperada calculada con aritmética de fechas independiente (oráculo).
function addDaysISO(fechaISO, days) {
  const d = new Date(fechaISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

(async () => {
  let snapLiqs = null, snapDets = null, phase = 'init';
  let reunionFecha = null, diasAntidoping = null, fechaEsperada = null;
  try {
    // ════ SNAPSHOT ════════════════════════════════════════════════════════
    phase = 'snapshot';
    const { data: reunionRow } = await sb.from('reuniones').select('fecha').eq('id', REUNION).single();
    reunionFecha = reunionRow.fecha;
    const { data: liqConfig } = await sb.from('liquidacion_config')
      .select('*').eq('club_id', CLUB_ID).eq('activo', true).maybeSingle();
    diasAntidoping = parseInt(liqConfig.dias_antidoping) || 30;
    fechaEsperada = addDaysISO(reunionFecha, diasAntidoping);
    console.log(`[setup] reunion=${REUNION} fecha=${reunionFecha} dias_antidoping=${diasAntidoping} → fecha_liberacion esperada=${fechaEsperada}`);

    const { data: liqsBefore } = await sb.from('liquidaciones').select('*').eq('reunion_id', REUNION);
    snapLiqs = liqsBefore;
    if (liqsBefore.some(l => l.estado === 'aprobada' || l.estado === 'pagada'))
      throw new Error('La reunión tiene liquidaciones aprobadas/pagadas — abortando.');
    const liqIdsBefore = liqsBefore.map(l => l.id);
    const { data: detsBefore } = liqIdsBefore.length
      ? await sb.from('liquidacion_detalle').select('*').in('liquidacion_id', liqIdsBefore)
      : { data: [] };
    snapDets = detsBefore;
    // Guard del propio código (Fase C): abortar si hay líneas comprometidas.
    if (detsBefore.some(d => d.estado_linea === 'pagado' || d.recibo_id))
      throw new Error('Hay líneas pagadas/con recibo — el guard de regeneración abortaría.');
    console.log(`[snapshot] liquidaciones=${liqsBefore.length} detalle=${snapDets.length}`);

    // ════ EJECUTAR el código REAL de generarLiquidaciones() ═══════════════
    phase = 'run';
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'liquidaciones.html'), 'utf8');
    const body = extractFnBody(html, 'async function generarLiquidaciones()');
    const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
    const documentStub = { getElementById: (id) => ({ value: id === 'sel-reunion' ? REUNION : '' }) };
    const toast = (m) => console.log('  [toast]', m);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const gen = new AsyncFunction(
      'sb', 'CLUB_ID', 'liqConfig', 'fmt', 'toast', 'confirm', 'document', 'loadLiquidaciones', body);
    await gen(sb, CLUB_ID, liqConfig, fmt, toast, () => true, documentStub, async () => {});

    // ════ LEER lo generado ════════════════════════════════════════════════
    phase = 'assert';
    const { data: liqsAfter } = await sb.from('liquidaciones').select('id').eq('reunion_id', REUNION);
    const newLiqIds = liqsAfter.map(l => l.id);
    const { data: dets } = await sb.from('liquidacion_detalle').select('*').in('liquidacion_id', newLiqIds);
    console.log(`[generado] liquidaciones=${liqsAfter.length} detalle=${dets.length}\n`);

    const is12 = d => d.posicion === 1 || d.posicion === 2;

    // (1) premio 1°/2° → retenido + fecha esperada
    const premio12 = dets.filter(d => d.concepto_tipo === 'premio' && is12(d));
    ok('1 premio 1°/2° generados (>0)', premio12.length > 0, `n=${premio12.length}`);
    ok('1a premio 1°/2° → estado_linea=retenido',
       premio12.length > 0 && premio12.every(d => d.estado_linea === 'retenido'),
       `retenidas=${premio12.filter(d=>d.estado_linea==='retenido').length}/${premio12.length}`);
    ok('1b premio 1°/2° → fecha_liberacion = fecha_reunion + dias_antidoping',
       premio12.length > 0 && premio12.every(d => d.fecha_liberacion === fechaEsperada),
       `esperada=${fechaEsperada} · vistas=${[...new Set(premio12.map(d=>d.fecha_liberacion))].join(',')}`);

    // (2) NOTA-A: sub-líneas actuacion de 1°/2° → retenido + MISMA fecha
    const actuacion12 = dets.filter(d => d.concepto_tipo === 'actuacion' && is12(d));
    ok('2 sub-líneas actuacion 1°/2° generadas (NOTA-A gatillada por datos)', actuacion12.length > 0,
       `n=${actuacion12.length}`);
    ok('2a actuacion 1°/2° → estado_linea=retenido (acompañan al premio)',
       actuacion12.length > 0 && actuacion12.every(d => d.estado_linea === 'retenido'),
       `retenidas=${actuacion12.filter(d=>d.estado_linea==='retenido').length}/${actuacion12.length}`);
    ok('2b actuacion 1°/2° → misma fecha_liberacion que el premio',
       actuacion12.length > 0 && actuacion12.every(d => d.fecha_liberacion === fechaEsperada),
       `vistas=${[...new Set(actuacion12.map(d=>d.fecha_liberacion))].join(',')}`);

    // (3) resto → impago, fecha null  (premio 3-5, bono, fondo, incentivos, actuacion 3-5)
    const resto = dets.filter(d => !((d.concepto_tipo === 'premio' || d.concepto_tipo === 'actuacion') && is12(d)));
    ok('3 resto (no premio/actuacion 1°/2°) → impago + fecha null',
       resto.every(d => d.estado_linea === 'impago' && d.fecha_liberacion === null),
       `malas=${resto.filter(d=>!(d.estado_linea==='impago'&&d.fecha_liberacion===null)).length}/${resto.length}`);

    // (b) invariante retenido: solo premio/actuacion 1°/2°, fecha futura no-null
    const hoy = new Date().toISOString().slice(0, 10);
    const retenidoInvalido = dets.filter(d => d.estado_linea === 'retenido' &&
      !((d.concepto_tipo === 'premio' || d.concepto_tipo === 'actuacion') && is12(d) &&
        d.fecha_liberacion && d.fecha_liberacion > hoy));
    ok('(b) invariante retenido — filas inválidas = 0', retenidoInvalido.length === 0, `inválidas=${retenidoInvalido.length}`);

    // (c) ningún premio NI actuacion 1°/2° quedó impago
    const c12Impago = dets.filter(d => (d.concepto_tipo === 'premio' || d.concepto_tipo === 'actuacion') &&
      is12(d) && d.estado_linea !== 'retenido');
    ok('(c) premio/actuacion 1°/2° impago = 0', c12Impago.length === 0, `impagas=${c12Impago.length}`);

    // (fecha manual) fecha_liberacion = fecha_reunion + 30, chequeo de no-corrimiento
    ok(`(fecha) ${reunionFecha} + ${diasAntidoping}d = ${fechaEsperada} (sin N-1)`,
       fechaEsperada === addDaysISO(reunionFecha, diasAntidoping) && premio12.every(d => d.fecha_liberacion === fechaEsperada));

    // Distribución para el reporte
    const dist = {};
    for (const d of dets) {
      const k = `${d.concepto_tipo}/${d.posicion}/${d.estado_linea}`;
      dist[k] = dist[k] || { n: 0, libera: d.fecha_liberacion };
      dist[k].n++;
    }
    console.log('\n[distribución concepto_tipo/posicion/estado_linea]');
    for (const k of Object.keys(dist).sort())
      console.log(`  ${k}: ${dist[k].n} filas${dist[k].libera ? ' (libera ' + dist[k].libera + ')' : ''}`);

  } catch (e) {
    ok(`EXCEPCIÓN en fase '${phase}'`, false, e.message);
    console.error(e);
  } finally {
    // ════ CLEANUP + RESTORE ════════════════════════════════════════════════
    try {
      const { data: nowLiqs } = await sb.from('liquidaciones').select('id').eq('reunion_id', REUNION);
      const nowIds = (nowLiqs || []).map(l => l.id);
      if (nowIds.length) {
        await sb.from('liquidacion_detalle').delete().in('liquidacion_id', nowIds);
        await sb.from('liquidaciones').delete().in('id', nowIds);
      }
      if (snapLiqs?.length) {
        const liqRows = snapLiqs.map(({ total_neto, ...r }) => r);
        const { error: e1 } = await sb.from('liquidaciones').insert(liqRows);
        if (e1) throw new Error(`restore liquidaciones: ${e1.message}`);
      }
      if (snapDets?.length) {
        const detRows = snapDets.map(({ monto_neto, ...r }) => r);
        const { error: e2 } = await sb.from('liquidacion_detalle').insert(detRows);
        if (e2) throw new Error(`restore detalle: ${e2.message}`);
      }
      const { data: liqsFin } = await sb.from('liquidaciones').select('id').eq('reunion_id', REUNION);
      ok('R1 restore liquidaciones (count == original)',
         (liqsFin?.length || 0) === (snapLiqs?.length || 0), `final=${liqsFin?.length} original=${snapLiqs?.length}`);
    } catch (e) {
      ok('RESTORE FALLÓ — REVISAR LA REUNIÓN MANUALMENTE', false, e.message);
      console.error('[restore]', e);
    }
    console.log('\n──────── RESULTADO ────────');
    for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  ('+r.n+')' : ''}`);
    const failed = results.filter(r => r.s === '❌').length;
    console.log(`\n${failed === 0 ? '✅ TODO OK' : '❌ ' + failed + ' fallo(s)'} — ${results.length} checks`);
    process.exit(failed === 0 ? 0 : 1);
  }
})();
