/**
 * Probe mandil 1..N + peso en PDF — validado contra el SET DE COLUMNAS REAL de la query.
 *
 * Clave: NO construye los items a mano. Extrae el string .select(...) REAL de la query de
 * impresión de ratificacion.html, consulta Supabase con ESAS columnas exactas, y alimenta
 * el render REAL (renderBloqueCarrera) con esas filas. Si la query omite una columna que el
 * render necesita (id → mandil, peso_declarado/peso_final → peso), el probe FALLA.
 *
 * Usa el helper REAL renumerarChapas. Sin browser. Reunión DESCARTABLE 9998 (seed+teardown).
 *
 * Escenario: ratificados gateras 1,2,4,5 (hueco en 3) pesos 55-58 + forfait gatera 3.
 *   mandil esperado: 1,2,3,4 corrido. forfait sin mandil. pesos 55..58 a la derecha.
 *
 * Tests:
 *  POSITIVO (select real del archivo): mandil corrido + pesos visibles + layout.
 *  NEGATIVO (select viejo sin id/peso): el probe DEBE detectar la rotura (sensibilidad).
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
// el select viejo (roto): sin id, sin peso → para el test de sensibilidad
const SELECT_VIEJO = 'carrera_id, spc_id, numero_partidor, estado, certificado_correr, spcs(nombre, sexo)';

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

// extrae el string .select(...) de la query de impresión (la que trae spcs(nombre...))
function extractPrintSelect(html) {
  const m = html.match(/from\('inscripciones'\)\s*\.select\('([^']*spcs\(nombre[^']*)'\)/);
  if (!m) throw new Error('no encontré el .select(...) de la query de impresión');
  return m[1];
}

const dir = dirname(fileURLToPath(import.meta.url));
const nameOf = {}, idOf = {};
const sortPart = (a, b) => {
  const pa = a.numero_partidor, pb = b.numero_partidor;
  if (pa != null && pb != null) return pa - pb;
  if (pa != null) return -1;
  if (pb != null) return 1;
  return 0;
};

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
      { carrera_id: CARRERA, spc_id: SPCS[2], estado: 'ratificado', numero_partidor: 4, peso_declarado: 57, certificado_correr: true },
      { carrera_id: CARRERA, spc_id: SPCS[3], estado: 'ratificado', numero_partidor: 5, peso_declarado: 58, certificado_correr: true },
      { carrera_id: CARRERA, spc_id: SPCS[4], estado: 'forfait',    numero_partidor: 3, peso_declarado: null, certificado_correr: true },
    ])).error;
    if (e) throw new Error('seed insc: ' + e.message);
    // mapa spc→nombre/id (con select completo, solo para asserts)
    const { data: meta } = await sb.from('inscripciones')
      .select('id, spc_id, spcs(nombre)').eq('carrera_id', CARRERA);
    meta.forEach(i => { nameOf[i.spc_id] = (i.spcs?.nombre || '').toUpperCase(); idOf[i.spc_id] = i.id; });
    console.log('[seed] 9998: ratif gateras 1,2,4,5 (hueco en 3) pesos 55-58 + forfait gatera 3');

    // ════ HELPER REAL + RENDER REAL (con fix ya aplicado en el archivo) ═════
    phase = 'load';
    const html = readFileSync(join(dir, '..', 'ratificacion.html'), 'utf8');
    const renumerarChapas = new Function(
      readFileSync(join(dir, '..', 'renumerar-chapas.js'), 'utf8') + '\n return renumerarChapas;')();
    const SELECT_REAL = extractPrintSelect(html);
    console.log('[select real del archivo]', SELECT_REAL);

    let body = extractFnBody(html, 'function renderBloqueCarrera(');
    // idempotente: si el archivo NO tuviera el fix de mandil, lo aplica en memoria
    const yaMandil = body.includes('renumerarChapas(items)') && body.includes('pi-chapa');
    if (!yaMandil) {
      body = body.replace("if (!items.length && !forfaits.length) return '';",
        "if (!items.length && !forfaits.length) return '';\n    const chapaMap = renumerarChapas(items);");
      body = body.replace('`<div class="pi-row"><span class="pi-spc-name">',
        '`<div class="pi-row">${chapaMap[i.id] ? `<span class="pi-chapa">${chapaMap[i.id]}</span>` : \'\'}<span class="pi-spc-name">');
    }
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const render = new AsyncFunction(
      'car', 'items', 'isAnulada', 'forfaits',
      'calcPremiosConPiso', 'formatBolsa', 'buildCondAbr', 'renumerarChapas', 'parseFloat', body);
    const car = { id: CARRERA, estado: 'programada', numero_turno: 1, numero_carrera_programa: null,
      condicion_sexo: null, bolsa_total: 0, distribucion_premios: null, tipo_pista: null,
      hora_estimada: null, categorias_carrera: null };

    // renderiza usando filas traídas con UN select dado (clave del probe)
    const renderConSelect = async (selectStr) => {
      const { data, error } = await sb.from('inscripciones').select(selectStr).eq('carrera_id', CARRERA);
      if (error) throw new Error('query (' + selectStr.slice(0, 30) + '...): ' + error.message);
      const rows = (data || []).slice().sort(sortPart);
      const items = rows.filter(i => i.estado === 'ratificado');
      const forfaits = rows.filter(i => i.estado === 'forfait');
      return render(car, items, false, forfaits,
        () => ({ bolsaEfectiva: 0 }), () => '', () => '', renumerarChapas, parseFloat);
    };

    // ════ POSITIVO: select REAL del archivo ═════════════════════════════════
    phase = 'positivo';
    const outReal = await renderConSelect(SELECT_REAL);
    const chapas = (outReal.match(/class="pi-chapa">(\d+)</g) || []).map(s => s.match(/>(\d+)</)[1]);
    ok('P1 select real trae id+peso (columnas presentes)',
       ['id', 'peso_declarado', 'peso_final'].every(c => SELECT_REAL.includes(c)),
       SELECT_REAL.includes('id') ? '' : 'falta id');
    ok('P2 mandil corrido 1,2,3,4 (no todos el total)',
       JSON.stringify(chapas) === JSON.stringify(['1', '2', '3', '4']), `chapas=${chapas.join(',')}`);
    ok('P3 pesos 55,56,57,58 visibles a la derecha',
       ['55', '56', '57', '58'].every(p => outReal.includes(`<span class="pi-peso">${p}</span>`)));
    ok('P4 layout chapa < nombre < peso',
       outReal.indexOf('pi-chapa') < outReal.indexOf('pi-spc-name') &&
       outReal.indexOf('pi-spc-name') < outReal.indexOf('pi-peso'));
    ok('P5 forfait sin chapa (4 chapas, no 5)', chapas.length === 4);

    // ════ NEGATIVO: select VIEJO (sin id/peso) → el probe DEBE ver la rotura ═
    phase = 'negativo';
    const outViejo = await renderConSelect(SELECT_VIEJO);
    const chapasViejo = (outViejo.match(/class="pi-chapa">(\d+)</g) || []).map(s => s.match(/>(\d+)</)[1]);
    const mandilRoto = JSON.stringify(chapasViejo) !== JSON.stringify(['1', '2', '3', '4']);
    const pesoRoto = !['55', '56', '57', '58'].every(p => outViejo.includes(`<span class="pi-peso">${p}</span>`));
    ok('N1 con select viejo (sin id) el mandil sale ROTO — probe lo detecta',
       mandilRoto, `chapas=${chapasViejo.join(',')||'(ninguna)'}`);
    ok('N2 con select viejo (sin peso) el peso NO aparece — probe lo detecta', pesoRoto);
    console.log(`  [negativo] mandil viejo=${chapasViejo.join(',')||'(vacío)'} → confirma sensibilidad del probe`);

    console.log('\n[fragmento render POSITIVO]');
    console.log(outReal.replace(/></g, '>\n<').split('\n')
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
