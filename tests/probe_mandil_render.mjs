/**
 * Probe mandil 1..N en pantalla + PDF — número adelante del nombre (renumerarChapas).
 *
 * Valida el fix ANTES de aplicarlo: usa el helper REAL renumerarChapas (renumerar-chapas.js)
 * y el render REAL de renderBloqueCarrera (ratificacion.html) con el diff aplicado EN MEMORIA.
 * Sin browser. Datos sembrados en reunión DESCARTABLE 9998 (seed + teardown misma corrida).
 *
 * Escenario crítico — hueco por forfait en el medio:
 *   ratificados con gateras 1, 2, 4, 5 (falta la 3)  +  1 forfait con gatera 3
 *   → mandil esperado: 1, 2, 3, 4 CORRIDO (sin hueco). forfait SIN mandil.
 *   pesos 55/56/57/58 para verificar layout chapa(izq)·nombre(medio)·peso(der).
 *
 * Asserts:
 *   (1) renumerarChapas(ratificados) → gatera1→1, 2→2, 4→3, 5→4 (hueco corrido)
 *   (2) forfait fuera del map (sin mandil)
 *   (3) PDF: pi-chapa antes de pi-spc-name; valores 1..4; orden chapa<nombre<peso
 *   (4) forfait en sección FORFAITS sin chapa
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
const CARRERA   = 'c0000000-0000-0000-0000-0000000099c1';
const HIPODROMO = 'c33ade84-98a4-4072-b3f1-a7d980e11849';
const CATEGORIA = 'ce76d686-c07a-434c-a3b0-74be3bf0c906';
const SPCS = [
  '00672983-e5e1-471f-8d54-59f924dce9a5', // gatera 1
  '019d9b9f-7b81-490e-b219-aff383fae166', // gatera 2
  '028ed453-bafe-491b-afe1-8aa93e56f675', // gatera 4
  '045409b7-bbd1-4b59-8335-c268d733b448', // gatera 5
  '058dff5d-28e6-427b-860e-2f8a09d22691', // forfait gatera 3
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
const nameOf = {}, idOf = {};

(async () => {
  let phase = 'init';
  try {
    // ════ SEED 9998 (gateras con hueco + forfait) ═══════════════════════════
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
      { carrera_id: CARRERA, spc_id: SPCS[2], estado: 'ratificado', numero_partidor: 4, peso_declarado: 57, certificado_correr: true },
      { carrera_id: CARRERA, spc_id: SPCS[3], estado: 'ratificado', numero_partidor: 5, peso_declarado: 58, certificado_correr: true },
      { carrera_id: CARRERA, spc_id: SPCS[4], estado: 'forfait',    numero_partidor: 3, peso_declarado: null, certificado_correr: true },
    ])).error;
    if (e) throw new Error('seed insc: ' + e.message);
    console.log('[seed] 9998: ratif gateras 1,2,4,5 (hueco en 3) + forfait gatera 3');

    // ════ LEER como la página (ordenado por numero_partidor nulls last) ═════
    phase = 'read';
    const { data: raw, error: er } = await sb.from('inscripciones')
      .select('id, estado, certificado_correr, peso_declarado, peso_final, numero_partidor, spc_id, spcs(nombre, sexo)')
      .eq('carrera_id', CARRERA);
    if (er) throw new Error('read: ' + er.message);
    const inscs = raw.sort((a, b) => {
      const pa = a.numero_partidor, pb = b.numero_partidor;
      if (pa != null && pb != null) return pa - pb;
      if (pa != null) return -1;
      if (pb != null) return 1;
      return 0;
    });
    inscs.forEach(i => { nameOf[i.spc_id] = (i.spcs?.nombre || '').toUpperCase(); idOf[i.spc_id] = i.id; });
    const ratificados = inscs.filter(i => i.estado === 'ratificado');
    const forfaits    = inscs.filter(i => i.estado === 'forfait');

    // ════ HELPER REAL renumerarChapas ══════════════════════════════════════
    phase = 'helper';
    const rcSrc = readFileSync(join(dir, '..', 'renumerar-chapas.js'), 'utf8');
    const renumerarChapas = new Function(rcSrc + '\n return renumerarChapas;')();

    // (1)+(2) mandil corrido + forfait afuera
    const chapaMap = renumerarChapas(inscs);
    ok('1 mandil corrido: gatera1→1, gatera2→2, gatera4→3, gatera5→4 (hueco corrido)',
       chapaMap[idOf[SPCS[0]]] === 1 && chapaMap[idOf[SPCS[1]]] === 2 &&
       chapaMap[idOf[SPCS[2]]] === 3 && chapaMap[idOf[SPCS[3]]] === 4,
       `vals=${[SPCS[0],SPCS[1],SPCS[2],SPCS[3]].map(s=>chapaMap[idOf[s]]).join(',')}`);
    ok('2 forfait SIN mandil (fuera del map)', chapaMap[idOf[SPCS[4]]] === undefined);

    // ════ RENDER REAL renderBloqueCarrera + diff EN MEMORIA ═════════════════
    phase = 'patch';
    const html = readFileSync(join(dir, '..', 'ratificacion.html'), 'utf8');
    let body = extractFnBody(html, 'function renderBloqueCarrera(');

    // Idempotente: si el fix YA está aplicado en el archivo, corre tal cual.
    // Si no (working tree sin el fix), aplica el diff EN MEMORIA.
    const yaAplicado = body.includes('renumerarChapas(items)') && body.includes('pi-chapa');
    if (!yaAplicado) {
      // diff parte A: const chapaMap = renumerarChapas(items); al inicio del body
      const guard = "if (!items.length && !forfaits.length) return '';";
      if (!body.includes(guard)) throw new Error('no encontré el guard inicial — el fix cambió');
      body = body.replace(guard, guard + "\n    const chapaMap = renumerarChapas(items);");
      // diff parte B: chapa span antes del nombre, en el return del renglón
      const rowOpen = '`<div class="pi-row"><span class="pi-spc-name">';
      if (!body.includes(rowOpen)) throw new Error('no encontré el inicio del renglón — el fix cambió');
      body = body.replace(rowOpen,
        '`<div class="pi-row">${chapaMap[i.id] ? `<span class="pi-chapa">${chapaMap[i.id]}</span>` : \'\'}<span class="pi-spc-name">');
    }
    console.log(`[patch] fix ${yaAplicado ? 'YA aplicado en archivo (corre tal cual)' : 'aplicado en memoria'}`);

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const calcPremiosConPiso = () => ({ bolsaEfectiva: 0 });
    const formatBolsa = () => '';
    const buildCondAbr = () => '';
    const render = new AsyncFunction(
      'car', 'items', 'isAnulada', 'forfaits',
      'calcPremiosConPiso', 'formatBolsa', 'buildCondAbr', 'renumerarChapas', 'parseFloat', body);

    const car = { id: CARRERA, estado: 'programada', numero_turno: 1, numero_carrera_programa: null,
      condicion_sexo: null, bolsa_total: 0, distribucion_premios: null, tipo_pista: null,
      hora_estimada: null, categorias_carrera: null };
    const out = await render(car, ratificados, false, forfaits,
      calcPremiosConPiso, formatBolsa, buildCondAbr, renumerarChapas, parseFloat);

    // ════ ASSERTS PDF ═══════════════════════════════════════════════════════
    phase = 'assert';
    // (3) chapa antes del nombre + valores 1..4
    ok('3a pi-chapa "1".."4" presentes en el render',
       ['1','2','3','4'].every(v => out.includes(`<span class="pi-chapa">${v}</span>`)));
    ok('3b orden por renglón: pi-chapa antes de pi-spc-name',
       out.indexOf('class="pi-chapa"') < out.indexOf('class="pi-spc-name"'));
    ok('3c layout chapa(izq) < nombre(medio) < peso(der)',
       out.indexOf('class="pi-chapa"') < out.indexOf('class="pi-spc-name"') &&
       out.indexOf('class="pi-spc-name"') < out.indexOf('class="pi-peso"'));
    // mandil pegado al nombre correcto: "1" justo antes de gatera1 (BAM...) etc.
    const seg = out.slice(0, out.indexOf('pi-forfaits') >= 0 ? out.indexOf('pi-forfaits') : out.length);
    const orderOK = ['1','2','3','4'].every((v, idx) => {
      const sp = `<span class="pi-chapa">${v}</span>`;
      const nm = nameOf[SPCS[idx]];
      return seg.indexOf(sp) >= 0 && seg.indexOf(sp) < seg.indexOf(nm) &&
             (idx === 0 || seg.indexOf(sp) > seg.indexOf(`<span class="pi-chapa">${v-1}</span>`));
    });
    ok('3d cada mandil va delante de SU caballo, en orden 1→4', orderOK);
    // (4) forfait sin chapa
    ok('4 forfait en FORFAITS sin chapa',
       out.includes('FORFAITS') && out.includes(nameOf[SPCS[4]]) &&
       (out.match(/class="pi-chapa"/g) || []).length === 4,
       `chapas=${(out.match(/class="pi-chapa"/g) || []).length}`);

    console.log('\n[fragmento render]');
    console.log(out.replace(/></g, '>\n<').split('\n')
      .filter(l => l.includes('pi-chapa') || l.includes('pi-spc-name') || l.includes('pi-peso') || l.includes('forfait')).join('\n'));

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
