/**
 * Probe orden PDF — número de anotados (pi-car-foot) ARRIBA de los forfaits.
 *
 * Valida el reorden de renderBloqueCarrera: hoy lista→forfaits→número, se quiere
 * lista→número→forfaits. Usa el render REAL (ratificacion.html). Si el archivo aún no tiene
 * el reorden, lo aplica EN MEMORIA (idempotente). Sin browser. 9998 descartable (seed+teardown).
 *
 * Escenario: 3 ratificados + 2 forfaits.
 * Asserts:
 *  (1) pi-car-foot aparece ANTES de pi-forfaits (número entre lista y forfaits)
 *  (2) el número = cantidad de anotados (3), no incluye forfaits
 *  (3) pi-car-foot está DESPUÉS de la lista de anotados (no antes)
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
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || requireEnv('SUPABASE_SECRET_KEY');
const CLUB_ID      = '0649e9c5-9e87-4aad-842f-101458e6b33c';

const REUNION   = 'a0000000-0000-0000-0000-000000009998';
const CARRERA   = 'c0000000-0000-0000-0000-0000000099d1';
const HIPODROMO = 'c33ade84-98a4-4072-b3f1-a7d980e11849';
const CATEGORIA = 'ce76d686-c07a-434c-a3b0-74be3bf0c906';
const SPCS = [
  '00672983-e5e1-471f-8d54-59f924dce9a5',
  '019d9b9f-7b81-490e-b219-aff383fae166',
  '028ed453-bafe-491b-afe1-8aa93e56f675',
  '045409b7-bbd1-4b59-8335-c268d733b448',
  '058dff5d-28e6-427b-860e-2f8a09d22691',
];

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

const dir = dirname(fileURLToPath(import.meta.url));

(async () => {
  let phase = 'init';
  try {
    // ════ SEED 9998 ═════════════════════════════════════════════════════════
    phase = 'seed';
    await sb.from('inscripciones').delete().eq('carrera_id', CARRERA);
    await sb.from('carreras').delete().eq('reunion_id', REUNION);
    await sb.from('reuniones').delete().eq('id', REUNION);

    let e = (await sb.from('reuniones').insert({
      id: REUNION, club_id: CLUB_ID, hipodromo_id: HIPODROMO, numero: 9998,
      fecha: '2099-01-02', estado: 'borrador' })).error;
    if (e) throw new Error('seed reunión: ' + e.message);
    e = (await sb.from('carreras').insert({
      id: CARRERA, reunion_id: REUNION, numero_turno: 1, categoria_id: CATEGORIA,
      distancia_metros: 1000, estado: 'programada' })).error;
    if (e) throw new Error('seed carrera: ' + e.message);
    e = (await sb.from('inscripciones').insert([
      { carrera_id: CARRERA, spc_id: SPCS[0], estado: 'ratificado', numero_partidor: 1, peso_declarado: 55, certificado_correr: true },
      { carrera_id: CARRERA, spc_id: SPCS[1], estado: 'ratificado', numero_partidor: 2, peso_declarado: 56, certificado_correr: true },
      { carrera_id: CARRERA, spc_id: SPCS[2], estado: 'ratificado', numero_partidor: 3, peso_declarado: 57, certificado_correr: true },
      { carrera_id: CARRERA, spc_id: SPCS[3], estado: 'forfait',    numero_partidor: null, peso_declarado: null, certificado_correr: true },
      { carrera_id: CARRERA, spc_id: SPCS[4], estado: 'forfait',    numero_partidor: null, peso_declarado: null, certificado_correr: true },
    ])).error;
    if (e) throw new Error('seed insc: ' + e.message);
    console.log('[seed] 9998: 3 ratificados + 2 forfaits');

    // ════ RENDER REAL + reorden idempotente ════════════════════════════════
    phase = 'load';
    const html = readFileSync(join(dir, '..', 'ratificacion.html'), 'utf8');
    const renumerarChapas = new Function(
      readFileSync(join(dir, '..', 'renumerar-chapas.js'), 'utf8') + '\n return renumerarChapas;')();
    let body = extractFnBody(html, 'function renderBloqueCarrera(');

    // detectar orden actual de footHtml vs forfaitsHtml en el return
    const idxFoot = body.indexOf('${footHtml}');
    const idxForf = body.indexOf('${forfaitsHtml}');
    const yaReordenado = idxFoot >= 0 && idxForf >= 0 && idxFoot < idxForf;
    if (!yaReordenado) {
      // aplicar el reorden EN MEMORIA: pasar footHtml antes de forfaitsHtml
      body = body.replace('${forfaitsHtml}\n        ${footHtml}', '${footHtml}\n        ${forfaitsHtml}');
    }
    console.log(`[render] reorden ${yaReordenado ? 'YA aplicado en archivo' : 'aplicado en memoria'}`);

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const render = new AsyncFunction(
      'car', 'items', 'isAnulada', 'forfaits',
      'calcPremiosConPiso', 'formatBolsa', 'buildCondAbr', 'renumerarChapas', 'parseFloat', body);

    const { data: rows } = await sb.from('inscripciones')
      .select('id, spc_id, numero_partidor, estado, certificado_correr, peso_declarado, peso_final, spcs(nombre, sexo)')
      .eq('carrera_id', CARRERA);
    const sorted = (rows || []).slice().sort((a, b) =>
      (a.numero_partidor ?? 9999) - (b.numero_partidor ?? 9999));
    const items = sorted.filter(i => i.estado === 'ratificado');
    const forfaits = sorted.filter(i => i.estado === 'forfait');

    const car = { id: CARRERA, estado: 'programada', numero_turno: 1, numero_carrera_programa: null,
      condicion_sexo: null, bolsa_total: 0, distribucion_premios: null, tipo_pista: null,
      hora_estimada: null, categorias_carrera: null };
    const out = await render(car, items, false, forfaits,
      () => ({ bolsaEfectiva: 0 }), () => '', () => '', renumerarChapas, parseFloat);

    // ════ ASSERTS ═══════════════════════════════════════════════════════════
    phase = 'assert';
    const iLista = out.indexOf('pi-lista');
    const iFoot  = out.indexOf('pi-car-foot');
    const iForf  = out.indexOf('pi-forfaits');
    ok('1 número (pi-car-foot) ANTES de los forfaits', iFoot >= 0 && iForf >= 0 && iFoot < iForf,
       `foot=${iFoot} forfaits=${iForf}`);
    ok('2 número = anotados (3), forfaits no cuentan',
       out.includes('<div class="pi-car-foot">3</div>'),
       (out.match(/pi-car-foot">(\d+)</) || [])[1]);
    ok('3 número DESPUÉS de la lista de anotados', iLista >= 0 && iLista < iFoot);
    ok('4 orden final: lista < número < forfaits', iLista < iFoot && iFoot < iForf);

    console.log('\n[fragmento orden]');
    console.log(out.replace(/></g, '>\n<').split('\n')
      .filter(l => l.includes('pi-lista') || l.includes('pi-car-foot') || l.includes('pi-forfaits-h') || l.includes('pi-forfait-row')).join('\n'));

  } catch (ex) {
    ok(`EXCEPCIÓN en fase '${phase}'`, false, ex.message);
    console.error(ex);
  } finally {
    // ════ TEARDOWN ══════════════════════════════════════════════════════════
    try {
      await sb.from('inscripciones').delete().eq('carrera_id', CARRERA);
      await sb.from('carreras').delete().eq('reunion_id', REUNION);
      await sb.from('reuniones').delete().eq('id', REUNION);
      const { data: gone } = await sb.from('reuniones').select('id').eq('id', REUNION);
      ok('R1 teardown 9998 (reunión borrada)', (gone?.length || 0) === 0);
    } catch (ex) {
      ok('TEARDOWN FALLÓ — BORRAR 9998 A MANO', false, ex.message);
      console.error('[teardown]', ex);
    }
    console.log('\n──────── RESULTADO ────────');
    for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  ('+r.n+')' : ''}`);
    const failed = results.filter(r => r.s === '❌').length;
    console.log(`\n${failed === 0 ? '✅ TODO OK' : '❌ ' + failed + ' fallo(s)'} — ${results.length} checks`);
    process.exit(failed === 0 ? 0 : 1);
  }
})();
