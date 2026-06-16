/**
 * Probe título "Carrera N" — numero_carrera_programa con chequeo explícito (!= null).
 *
 * Bug: numCarrera = numero_carrera_programa || numero_turno → programa=0 cae (mal) al turno.
 * Fix: numero_carrera_programa != null ? numero_carrera_programa : numero_turno.
 *
 * Render REAL de renderBloqueCarrera (ratificacion.html). Si el archivo no tiene el fix, lo
 * aplica EN MEMORIA (idempotente). Sin browser. 9998 descartable (seed+teardown).
 *
 * Carreras sembradas (cada una 1 ratificado para que renderice título):
 *   A turno 1, programa null → "Carrera 1" (turno)
 *   B turno 2, programa 0    → "Carrera 0" (programa 0, NO cae al turno)
 *   C turno 3, programa 5    → "Carrera 5"
 * Negativo: con el código viejo (||), B mostraría "Carrera 2" (turno) → probe lo detecta.
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
const CARR_A    = 'c0000000-0000-0000-0000-0000000099e1';
const CARR_B    = 'c0000000-0000-0000-0000-0000000099e2';
const CARR_C    = 'c0000000-0000-0000-0000-0000000099e3';
const HIPODROMO = 'c33ade84-98a4-4072-b3f1-a7d980e11849';
const CATEGORIA = 'ce76d686-c07a-434c-a3b0-74be3bf0c906';
const SPC       = '00672983-e5e1-471f-8d54-59f924dce9a5';

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
const VIEJO = 'car.numero_carrera_programa || car.numero_turno';
const NUEVO = 'car.numero_carrera_programa != null ? car.numero_carrera_programa : car.numero_turno';

(async () => {
  let phase = 'init';
  try {
    // ════ SEED 9998 ═════════════════════════════════════════════════════════
    phase = 'seed';
    await sb.from('inscripciones').delete().in('carrera_id', [CARR_A, CARR_B, CARR_C]);
    await sb.from('carreras').delete().eq('reunion_id', REUNION);
    await sb.from('reuniones').delete().eq('id', REUNION);

    let e = (await sb.from('reuniones').insert({
      id: REUNION, club_id: CLUB_ID, hipodromo_id: HIPODROMO, numero: 9998,
      fecha: '2099-01-02', estado: 'borrador' })).error;
    if (e) throw new Error('seed reunión: ' + e.message);
    e = (await sb.from('carreras').insert([
      { id: CARR_A, reunion_id: REUNION, numero_turno: 1, numero_carrera_programa: null, categoria_id: CATEGORIA, distancia_metros: 1000, estado: 'programada' },
      { id: CARR_B, reunion_id: REUNION, numero_turno: 2, numero_carrera_programa: 0,    categoria_id: CATEGORIA, distancia_metros: 1000, estado: 'programada' },
      { id: CARR_C, reunion_id: REUNION, numero_turno: 3, numero_carrera_programa: 5,    categoria_id: CATEGORIA, distancia_metros: 1000, estado: 'programada' },
    ])).error;
    if (e) throw new Error('seed carreras: ' + e.message);
    e = (await sb.from('inscripciones').insert([
      { carrera_id: CARR_A, spc_id: SPC, estado: 'ratificado', numero_partidor: 1, certificado_correr: true },
      { carrera_id: CARR_B, spc_id: SPC, estado: 'ratificado', numero_partidor: 1, certificado_correr: true },
      { carrera_id: CARR_C, spc_id: SPC, estado: 'ratificado', numero_partidor: 1, certificado_correr: true },
    ])).error;
    if (e) throw new Error('seed insc: ' + e.message);
    console.log('[seed] 9998: carreras programa null/0/5 (turnos 1/2/3), 1 ratificado c/u');

    // ════ RENDER REAL + fix idempotente ════════════════════════════════════
    phase = 'load';
    const html = readFileSync(join(dir, '..', 'ratificacion.html'), 'utf8');
    const renumerarChapas = new Function(
      readFileSync(join(dir, '..', 'renumerar-chapas.js'), 'utf8') + '\n return renumerarChapas;')();

    const bodyOrig = extractFnBody(html, 'function renderBloqueCarrera(');
    const yaFix = !bodyOrig.includes(VIEJO);
    const bodyNuevo = yaFix ? bodyOrig : bodyOrig.replace(VIEJO, NUEVO);
    console.log(`[fix] ${yaFix ? 'YA aplicado en archivo' : 'aplicado en memoria'}`);

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const mkRender = (body) => new AsyncFunction(
      'car', 'items', 'isAnulada', 'forfaits',
      'calcPremiosConPiso', 'formatBolsa', 'buildCondAbr', 'renumerarChapas', 'parseFloat', body);
    const renderNuevo = mkRender(bodyNuevo);
    const renderViejo = mkRender(bodyOrig.includes(VIEJO) ? bodyOrig : bodyOrig.replace(NUEVO, VIEJO));

    const { data: cars } = await sb.from('carreras')
      .select('id, numero_turno, numero_carrera_programa, hora_estimada, bolsa_total, distribucion_premios, tipo_pista, condicion_sexo, edad_minima_anos, edad_maxima_anos, condicion_handicap, estado, categorias_carrera(nombre,es_oficial,es_computable)')
      .eq('reunion_id', REUNION);
    const { data: insc } = await sb.from('inscripciones')
      .select('id, carrera_id, spc_id, numero_partidor, estado, certificado_correr, peso_declarado, peso_final, spcs(nombre, sexo)')
      .in('carrera_id', [CARR_A, CARR_B, CARR_C]);
    const carById = Object.fromEntries(cars.map(c => [c.id, c]));

    const titulo = async (render, carId) => {
      const car = carById[carId];
      const items = insc.filter(i => i.carrera_id === carId && i.estado === 'ratificado');
      return render(car, items, false, [],
        () => ({ bolsaEfectiva: 0 }), () => '', () => '', renumerarChapas, parseFloat);
    };

    // ════ POSITIVO (fix) ════════════════════════════════════════════════════
    phase = 'positivo';
    const outA = await titulo(renderNuevo, CARR_A);
    const outB = await titulo(renderNuevo, CARR_B);
    const outC = await titulo(renderNuevo, CARR_C);
    ok('A programa=null → "Carrera 1" (turno)', outA.includes('>Carrera 1</span>'),
       (outA.match(/>Carrera ([^<]+)</) || [])[1]);
    ok('B programa=0 → "Carrera 0" (NO cae al turno 2)', outB.includes('>Carrera 0</span>'),
       (outB.match(/>Carrera ([^<]+)</) || [])[1]);
    ok('C programa=5 → "Carrera 5"', outC.includes('>Carrera 5</span>'),
       (outC.match(/>Carrera ([^<]+)</) || [])[1]);

    // ════ NEGATIVO (código viejo con ||) ════════════════════════════════════
    phase = 'negativo';
    const outBviejo = await titulo(renderViejo, CARR_B);
    const numBviejo = (outBviejo.match(/>Carrera ([^<]+)</) || [])[1];
    ok('N con || el caso programa=0 sale ROTO ("Carrera 2") — probe lo detecta',
       outBviejo.includes('>Carrera 2</span>'), `viejo=${numBviejo}`);

    console.log(`\n[títulos] A=${(outA.match(/>Carrera ([^<]+)</)||[])[1]} B=${(outB.match(/>Carrera ([^<]+)</)||[])[1]} C=${(outC.match(/>Carrera ([^<]+)</)||[])[1]} | B viejo=${numBviejo}`);

  } catch (ex) {
    ok(`EXCEPCIÓN en fase '${phase}'`, false, ex.message);
    console.error(ex);
  } finally {
    // ════ TEARDOWN ══════════════════════════════════════════════════════════
    try {
      await sb.from('inscripciones').delete().in('carrera_id', [CARR_A, CARR_B, CARR_C]);
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
