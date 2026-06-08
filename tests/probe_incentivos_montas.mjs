/**
 * Probe Incentivos Bloque C — granularidad por rol (confirmado Fede 2026-06-08).
 *
 * CORRE EL CÓDIGO REAL de generarLiquidaciones() de liquidaciones.html (extrae el cuerpo +
 * AsyncFunction + cliente Supabase real + stubs DOM). Sin browser (chromium no corre en
 * ubuntu26.04). Patrón snapshot→mutate→run→assert→restore, igual que probe_fase2/probe_fase_c.
 *
 * Regla a verificar:
 *  - Jockey: 50.000 fijo POR REUNIÓN → UNA línea por jockey que corrió, aunque tenga N montas.
 *    incentivo_jockey, beneficiario=jockey, inscripcion_id=null.
 *  - Entrenador: 10.000 POR CABALLO corrido → UNA línea por inscripción corrida (sin dedup).
 *    incentivo_entrenador, beneficiario=entrenador, inscripcion_id=la inscripción.
 *  - Quien no corrió → no genera.
 *
 * Setup determinístico sobre R5: asigna UN jockey (JOCK_ID) y UN entrenador (ENTR_ID) a las
 * 22 inscripciones ubicadas (no_largo=false, ratificado). Así el jockey tiene 22 montas (→1
 * línea) y el entrenador 22 caballos (→22 líneas). Snapshot+restore de los 2 campos.
 *
 * Montos: los lee de liquidacion_config (Tarea A ya seteó 50000/10000). El probe valida contra
 * esos valores de config, no contra constantes hardcodeadas.
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

// IDs reales (FKs válidas, reusados de probe_fase2_liquidaciones.mjs).
const JOCK_ID = 'f6637123-af74-42ae-81e1-d5b9fed88fc9'; // profesionales.id (jockey)
const ENTR_ID = 'c34e5c0b-7bcf-45ad-8891-1bd22cda3f0d'; // profesionales.id (entrenador)
const ROLE_FIELDS = ['jockey_titular_id', 'entrenador_id'];

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

(async () => {
  let snapResEstados = null, snapLiqs = null, snapDets = null, snapInscs = null, mutatedRes = [];
  let phase = 'init', incJockeyCfg = null, incEntrCfg = null, placedIds = [];
  try {
    // ════ SNAPSHOT ════
    phase = 'snapshot';
    const { data: liqConfig } = await sb.from('liquidacion_config')
      .select('*').eq('club_id', CLUB_ID).eq('activo', true).maybeSingle();
    incJockeyCfg = parseFloat(liqConfig.incentivo_jockey_monto) || 0;
    incEntrCfg   = parseFloat(liqConfig.incentivo_entrenador_monto) || 0;
    console.log(`[config] incentivo_jockey=${incJockeyCfg} incentivo_entrenador=${incEntrCfg}`);
    if (incJockeyCfg <= 0 || incEntrCfg <= 0) throw new Error('liquidacion_config sin montos de incentivo (Tarea A no aplicada).');

    const { data: cars } = await sb.from('carreras').select('id').eq('reunion_id', R5);
    const carIds = cars.map(c => c.id);
    const { data: resAll } = await sb.from('resultados').select('id,carrera_id,estado').in('carrera_id', carIds);
    snapResEstados = resAll.map(r => ({ id: r.id, estado: r.estado }));

    const { data: posPlaced } = await sb.from('resultado_posiciones')
      .select('inscripcion_id').in('resultado_id', resAll.map(r => r.id)).eq('no_largo', false).not('posicion', 'is', null);
    placedIds = [...new Set(posPlaced.map(p => p.inscripcion_id))];
    const { data: inscSnap } = await sb.from('inscripciones')
      .select(['id', 'estado', ...ROLE_FIELDS].join(',')).in('id', placedIds);
    snapInscs = inscSnap;
    // Solo ratificados cuentan para incentivo (igual que el generador).
    const ratificadosPlaced = inscSnap.filter(i => i.estado === 'ratificado').map(i => i.id);
    const M = ratificadosPlaced.length;  // caballos corridos+ratificados → líneas de entrenador esperadas
    console.log(`[snapshot] ubicados no_largo=${placedIds.length} ratificados=${M}`);

    const { data: liqsBefore } = await sb.from('liquidaciones').select('*').eq('reunion_id', R5);
    snapLiqs = liqsBefore;
    if (liqsBefore.some(l => l.estado === 'aprobada' || l.estado === 'pagada'))
      throw new Error('R5 con liquidaciones aprobadas/pagadas — abortando.');
    const liqIds = liqsBefore.map(l => l.id);
    const { data: detsBefore } = liqIds.length
      ? await sb.from('liquidacion_detalle').select('*').in('liquidacion_id', liqIds) : { data: [] };
    snapDets = detsBefore;
    if (detsBefore.some(d => d.estado_linea === 'pagado' || d.recibo_id))
      throw new Error('R5 con líneas pagadas/con recibo — el guard de regeneración abortaría.');

    // ════ MUTATE ════
    phase = 'mutate';
    for (const r of resAll) if (r.estado !== 'oficial') {
      const { error } = await sb.from('resultados').update({ estado: 'oficial' }).eq('id', r.id);
      if (error) throw new Error(`set oficial ${r.id}: ${error.message}`);
      mutatedRes.push(r.id);
    }
    // Asignar el MISMO jockey y entrenador a todos los ubicados ratificados.
    for (const id of ratificadosPlaced) {
      const { error } = await sb.from('inscripciones')
        .update({ jockey_titular_id: JOCK_ID, entrenador_id: ENTR_ID }).eq('id', id);
      if (error) throw new Error(`setup roles ${id}: ${error.message}`);
    }
    console.log(`[mutate] resultados→oficial=${mutatedRes.length} · roles asignados a ${M} inscripciones`);

    // ════ RUN real ════
    phase = 'run';
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'liquidaciones.html'), 'utf8');
    const body = extractFnBody(html, 'async function generarLiquidaciones()');
    const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
    const documentStub = { getElementById: (id) => ({ value: id === 'sel-reunion' ? R5 : '' }) };
    const toast = (m) => console.log('  [toast]', m);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const gen = new AsyncFunction('sb', 'CLUB_ID', 'liqConfig', 'fmt', 'toast', 'confirm', 'document', 'loadLiquidaciones', body);
    await gen(sb, CLUB_ID, liqConfig, fmt, toast, () => true, documentStub, async () => {});

    // ════ ASSERT ════
    phase = 'assert';
    const { data: liqsAfter } = await sb.from('liquidaciones').select('id,profesional_id').eq('reunion_id', R5);
    const { data: dets } = await sb.from('liquidacion_detalle').select('*').in('liquidacion_id', liqsAfter.map(l => l.id));

    // (a) Jockey con N montas → UNA sola línea incentivo_jockey, monto config, inscripcion_id null.
    const jockLines = dets.filter(d => d.concepto_tipo === 'incentivo_jockey');
    const jockMine  = jockLines.filter(d => d.beneficiario_id === JOCK_ID);
    ok('a1 jockey con N montas → exactamente 1 línea incentivo_jockey', jockMine.length === 1, `lineas=${jockMine.length}`);
    ok('a2 incentivo_jockey = monto de config + neto + inscripcion_id null',
       jockMine.length === 1 && Number(jockMine[0].monto_bruto) === incJockeyCfg &&
       Number(jockMine[0].monto_descuento) === 0 && jockMine[0].inscripcion_id === null &&
       jockMine[0].beneficiario_tipo === 'profesional',
       `monto=${jockMine[0]?.monto_bruto} insc=${jockMine[0]?.inscripcion_id}`);
    ok('a3 ningún otro jockey cobró incentivo (todos los corridos = JOCK_ID)',
       jockLines.length === 1, `total_incentivo_jockey=${jockLines.length}`);

    // (b) Entrenador con M caballos → M líneas incentivo_entrenador, monto config, inscripcion_id seteado.
    const entrLines = dets.filter(d => d.concepto_tipo === 'incentivo_entrenador');
    const entrMine  = entrLines.filter(d => d.beneficiario_id === ENTR_ID);
    ok('b1 entrenador con M caballos → M líneas incentivo_entrenador', entrMine.length === M, `lineas=${entrMine.length} esperado=${M}`);
    ok('b2 cada incentivo_entrenador = monto config + neto + beneficiario profesional',
       entrMine.length === M && entrMine.every(d => Number(d.monto_bruto) === incEntrCfg &&
         Number(d.monto_descuento) === 0 && d.beneficiario_tipo === 'profesional'),
       `montos=${[...new Set(entrMine.map(d=>Number(d.monto_bruto)))].join(',')}`);
    const inscSet = new Set(entrMine.map(d => d.inscripcion_id));
    ok('b3 cada línea entrenador apunta a una inscripción corrida distinta (sin dedup)',
       entrMine.every(d => d.inscripcion_id && placedIds.includes(d.inscripcion_id)) && inscSet.size === M,
       `distintas=${inscSet.size}/${M} nulls=${entrMine.filter(d=>!d.inscripcion_id).length}`);
    ok('b4 ningún otro entrenador cobró (todos los corridos = ENTR_ID)', entrLines.length === M, `total=${entrLines.length}`);

    // (c) Quien no corrió → no genera. Un profesional cualquiera distinto de JOCK/ENTR: 0 incentivos.
    const NADIE = '00000000-0000-0000-0000-000000000000';
    const ningunoNadie = dets.filter(d => (d.concepto_tipo === 'incentivo_jockey' || d.concepto_tipo === 'incentivo_entrenador') && d.beneficiario_id === NADIE);
    ok('c1 quien no corrió → 0 líneas de incentivo', ningunoNadie.length === 0, `lineas=${ningunoNadie.length}`);
    // reunion_id seteado en todas las líneas de incentivo
    ok('c2 reunion_id seteado en todas las líneas de incentivo',
       [...jockLines, ...entrLines].every(d => d.reunion_id === R5));

  } catch (e) {
    ok(`EXCEPCIÓN en fase '${phase}'`, false, e.message);
    console.error(e);
  } finally {
    // ════ CLEANUP + RESTORE ════
    try {
      const { data: nowLiqs } = await sb.from('liquidaciones').select('id').eq('reunion_id', R5);
      const nowIds = (nowLiqs || []).map(l => l.id);
      if (nowIds.length) {
        await sb.from('liquidacion_detalle').delete().in('liquidacion_id', nowIds);
        await sb.from('liquidaciones').delete().in('id', nowIds);
      }
      if (snapLiqs?.length) {
        const { error } = await sb.from('liquidaciones').insert(snapLiqs.map(({ total_neto, ...r }) => r));
        if (error) throw new Error(`restore liquidaciones: ${error.message}`);
      }
      if (snapDets?.length) {
        const { error } = await sb.from('liquidacion_detalle').insert(snapDets.map(({ monto_neto, ...r }) => r));
        if (error) throw new Error(`restore detalle: ${error.message}`);
      }
      for (const s of (snapResEstados || [])) if (mutatedRes.includes(s.id))
        await sb.from('resultados').update({ estado: s.estado }).eq('id', s.id);
      for (const ins of (snapInscs || [])) {
        const orig = {}; for (const f of ROLE_FIELDS) orig[f] = ins[f];
        await sb.from('inscripciones').update(orig).eq('id', ins.id);
      }
      // verify restore
      const { data: liqsFin } = await sb.from('liquidaciones').select('id').eq('reunion_id', R5);
      ok('R1 restore liquidaciones (count == original)', (liqsFin?.length || 0) === (snapLiqs?.length || 0),
         `final=${liqsFin?.length} original=${snapLiqs?.length}`);
      let inscR = true;
      if (snapInscs?.length) {
        const { data: f } = await sb.from('inscripciones').select(['id', ...ROLE_FIELDS].join(',')).in('id', snapInscs.map(i => i.id));
        inscR = snapInscs.every(o => { const r = f.find(x => x.id === o.id); return r && ROLE_FIELDS.every(k => (r[k] ?? null) === (o[k] ?? null)); });
      }
      ok('R2 restore roles de inscripciones', inscR);
    } catch (e) {
      ok('RESTORE FALLÓ — REVISAR R5 MANUALMENTE', false, e.message);
      console.error('[restore]', e);
    }
    console.log('\n──────── RESULTADO ────────');
    for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  ('+r.n+')' : ''}`);
    const failed = results.filter(r => r.s === '❌').length;
    console.log(`\n${failed === 0 ? '✅ TODO OK' : '❌ ' + failed + ' fallo(s)'} — ${results.length} checks`);
    process.exit(failed === 0 ? 0 : 1);
  }
})();
