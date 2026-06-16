/**
 * Probe carrera anulada — anotados (inscripto) + forfaits en programa impreso.
 *
 * Diagnostica/valida el fix del caller block (~L396-405 de ratificacion.html) que hoy:
 *   (bug A) descarta toda carrera anulada sin ratificados NI forfaits  → turno 10 desaparece
 *   (bug B) pasa solo `ratificados` (=0) como items → anotados 'inscripto' nunca se listan
 *
 * NO usa browser. Dos verificaciones sobre reunión DESCARTABLE 9998 (seed + teardown misma
 * corrida, NO toca la 6 ni la 9999):
 *
 *  (1) GUARD del caller — lógica VIEJA vs NUEVA (espejo exacto del diff) sobre datos reales:
 *        caso X: 2 inscripto, 0 forfait  → vieja: DROP (bug) · nueva: se muestra, items=2
 *        caso Y: 3 inscripto, 2 forfait  → vieja: items=ratificados=0 (anotados no listados) ·
 *                                          nueva: items=anotados=3 + forfaits=2
 *  (2) renderBloqueCarrera REAL (extraído del HTML, helpers de formato stubbeados) recibe los
 *      anotados → su salida HTML contiene los nombres de los 2 inscriptos, los forfaits y el
 *      cartel "Anulada". Prueba que el render lista anotados cuando el caller se los pasa.
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
const CARR_X    = 'c0000000-0000-0000-0000-0000000099a1'; // 2 inscripto, 0 forfait (caso vanish)
const CARR_Y    = 'c0000000-0000-0000-0000-0000000099a2'; // 3 inscripto, 2 forfait
const HIPODROMO = 'c33ade84-98a4-4072-b3f1-a7d980e11849';
const CATEGORIA = 'ce76d686-c07a-434c-a3b0-74be3bf0c906';
// 5 spcs reales distintos (constraint único carrera_id+spc_id)
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

// Espejo EXACTO del caller del diff (lo que decide mostrar/descartar y qué items pasa).
function callerOld(inscsCar, esAnulada) {
  const ratificados = inscsCar.filter(i => i.estado === 'ratificado');
  const forfaits    = inscsCar.filter(i => i.estado === 'forfait');
  if (!ratificados.length && !forfaits.length) return { dropped: true };
  if (esAnulada) return { dropped: false, items: ratificados, forfaits };
  return { dropped: false, items: ratificados, forfaits };
}
function callerNew(inscsCar, esAnulada) {
  const ratificados = inscsCar.filter(i => i.estado === 'ratificado');
  const forfaits    = inscsCar.filter(i => i.estado === 'forfait');
  if (esAnulada) {
    const anotados = inscsCar.filter(i => i.estado === 'ratificado' || i.estado === 'inscripto');
    if (!anotados.length && !forfaits.length) return { dropped: true };
    return { dropped: false, items: anotados, forfaits };
  }
  if (!ratificados.length && !forfaits.length) return { dropped: true };
  return { dropped: false, items: ratificados, forfaits };
}

(async () => {
  let phase = 'init';
  try {
    // ════ SEED 9998 con 2 carreras anuladas ════════════════════════════════
    phase = 'seed';
    await sb.from('inscripciones').delete().in('carrera_id', [CARR_X, CARR_Y]);
    await sb.from('carreras').delete().eq('reunion_id', REUNION);
    await sb.from('reuniones').delete().eq('id', REUNION);

    let e = (await sb.from('reuniones').insert({
      id: REUNION, club_id: CLUB_ID, hipodromo_id: HIPODROMO, numero: 9998,
      fecha: '2099-01-02', estado: 'borrador' })).error;
    if (e) throw new Error('seed reunión: ' + e.message);
    e = (await sb.from('carreras').insert([
      { id: CARR_X, reunion_id: REUNION, numero_turno: 1, categoria_id: CATEGORIA, distancia_metros: 1000, estado: 'anulada' },
      { id: CARR_Y, reunion_id: REUNION, numero_turno: 2, categoria_id: CATEGORIA, distancia_metros: 1000, estado: 'anulada' },
    ])).error;
    if (e) throw new Error('seed carreras: ' + e.message);
    // caso X: 2 inscripto, 0 forfait
    e = (await sb.from('inscripciones').insert([
      { carrera_id: CARR_X, spc_id: SPCS[0], estado: 'inscripto' },
      { carrera_id: CARR_X, spc_id: SPCS[1], estado: 'inscripto' },
    ])).error;
    if (e) throw new Error('seed insc X: ' + e.message);
    // caso Y: 3 inscripto, 2 forfait
    e = (await sb.from('inscripciones').insert([
      { carrera_id: CARR_Y, spc_id: SPCS[0], estado: 'inscripto' },
      { carrera_id: CARR_Y, spc_id: SPCS[1], estado: 'inscripto' },
      { carrera_id: CARR_Y, spc_id: SPCS[2], estado: 'inscripto' },
      { carrera_id: CARR_Y, spc_id: SPCS[3], estado: 'forfait' },
      { carrera_id: CARR_Y, spc_id: SPCS[4], estado: 'forfait' },
    ])).error;
    if (e) throw new Error('seed insc Y: ' + e.message);
    console.log('[seed] 9998: carrera X (2 insc, 0 fft) + carrera Y (3 insc, 2 fft), ambas anuladas');

    // ════ LEER como lo haría la página (inscsByCarrera con spcs join) ═══════
    phase = 'read';
    const readCar = async (cid) => {
      const { data, error } = await sb.from('inscripciones')
        .select('estado, certificado_correr, spcs(nombre, sexo)').eq('carrera_id', cid);
      if (error) throw new Error('read ' + cid + ': ' + error.message);
      return data;
    };
    const inscsX = await readCar(CARR_X);
    const inscsY = await readCar(CARR_Y);

    // ════ (1) GUARD viejo vs nuevo ══════════════════════════════════════════
    phase = 'guard';
    const oldX = callerOld(inscsX, true), newX = callerNew(inscsX, true);
    ok('1a caso X (2 insc, 0 fft) — VIEJO descarta la carrera (reproduce el bug)', oldX.dropped === true);
    ok('1b caso X — NUEVO la muestra con 2 anotados',
       newX.dropped === false && newX.items.length === 2, `items=${newX.items?.length}`);

    const oldY = callerOld(inscsY, true), newY = callerNew(inscsY, true);
    ok('1c caso Y (3 insc, 2 fft) — VIEJO muestra pero items=0 (anotados NO listados)',
       oldY.dropped === false && oldY.items.length === 0, `itemsViejo=${oldY.items?.length}`);
    ok('1d caso Y — NUEVO items=3 anotados + 2 forfaits',
       newY.dropped === false && newY.items.length === 3 && newY.forfaits.length === 2,
       `items=${newY.items?.length} fft=${newY.forfaits?.length}`);

    // ════ (2) renderBloqueCarrera REAL con los anotados del NUEVO caller ════
    phase = 'render';
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'ratificacion.html'), 'utf8');
    const body = extractFnBody(html, 'function renderBloqueCarrera(');
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    // helpers de formato stubbeados (no afectan el listado de anotados ni el banner)
    const calcPremiosConPiso = () => ({ bolsaEfectiva: 0 });
    const formatBolsa = () => '';
    const buildCondAbr = () => '';
    const render = new AsyncFunction(
      'car', 'items', 'isAnulada', 'forfaits',
      'calcPremiosConPiso', 'formatBolsa', 'buildCondAbr', body);
    const carY = { id: CARR_Y, estado: 'anulada', numero_turno: 2, condicion_sexo: null,
      bolsa_total: 0, distribucion_premios: null, tipo_pista: null, categorias_carrera: null };
    const out = await render(carY, newY.items, true, newY.forfaits,
      calcPremiosConPiso, formatBolsa, buildCondAbr);

    const nombresAnotados = newY.items.map(i => (i.spcs?.nombre || '').toUpperCase());
    const nombresFft = newY.forfaits.map(i => (i.spcs?.nombre || '').toUpperCase());
    ok('2a render NO vacío para anulada con anotados', !!out && out.length > 0);
    ok('2b render lista los 3 anotados por nombre',
       nombresAnotados.every(n => out.includes(n)), `faltan=${nombresAnotados.filter(n=>!out.includes(n)).join(',')||'ninguno'}`);
    ok('2c render incluye sección FORFAITS con sus nombres',
       out.includes('FORFAITS') && nombresFft.every(n => out.includes(n)));
    ok('2d render muestra cartel "Anulada"', out.includes('pi-banda-anulada') && out.includes('Anulada'));

  } catch (ex) {
    ok(`EXCEPCIÓN en fase '${phase}'`, false, ex.message);
    console.error(ex);
  } finally {
    // ════ TEARDOWN 9998 ════════════════════════════════════════════════════
    try {
      await sb.from('inscripciones').delete().in('carrera_id', [CARR_X, CARR_Y]);
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
