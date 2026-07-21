/**
 * Probe piso warning — FIX 3 (validación de ganancia_minima desproporcionada).
 *
 * CORRE EL CÓDIGO REAL de pisoSospechoso() de premios-utils.js (working tree). NO usa
 * browser: carga el archivo vía shim de `window` y corre la función sobre filas REALES
 * leídas de Supabase. Reunión descartable 9998, teardown TOTAL en el finally.
 *
 * Reproduce el caso real del turno 12 (19/7): ganancia_minima cargada con la bolsa entera.
 *
 * Asserts:
 *  - carrera con piso = bolsa (1.191.666 vs 1.191.666) → pisoSospechoso = true (warning)
 *  - carrera con piso normal (100.000 vs 1.191.666) → pisoSospechoso = false (sin warning)
 *  - límites: piso == 20% exacto → false; piso > 20% → true; sin piso → false
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Source ./.env antes de correr.`);
  return v;
}

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const CLUB_ID      = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const REUNION_NUM  = 9998;

globalThis.window = {};
eval(readFileSync(join(ROOT, 'premios-utils.js'), 'utf8'));
const pisoSospechoso = globalThis.window.pisoSospechoso;
if (typeof pisoSospechoso !== 'function') throw new Error('pisoSospechoso no exportado por premios-utils.js');

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

const DIST_PISO_MALO = { '1': 60, '2': 19, '3': 12, '4': 6, '5': 3, ganancia_minima: 1191666, bono_ganador: 250000 };
const DIST_PISO_OK   = { '1': 60, '2': 19, '3': 12, '4': 6, '5': 3, ganancia_minima: 100000 };

let reunionId = null;

async function cleanupExisting() {
  const { data } = await sb.from('reuniones').select('id').eq('club_id', CLUB_ID).eq('numero', REUNION_NUM);
  for (const r of (data || [])) {
    await sb.from('carreras').delete().eq('reunion_id', r.id);
    await sb.from('reuniones').delete().eq('id', r.id);
  }
}

async function main() {
  await cleanupExisting();

  const { data: ref, error: eRef } = await sb.from('reuniones')
    .select('hipodromo_id').eq('club_id', CLUB_ID).limit(1).single();
  if (eRef) throw new Error('lookup hipodromo_id: ' + eRef.message);

  const { data: reu, error: eReu } = await sb.from('reuniones')
    .insert({ club_id: CLUB_ID, hipodromo_id: ref.hipodromo_id, numero: REUNION_NUM, fecha: '2099-12-31', estado: 'borrador' })
    .select('id').single();
  if (eReu) throw new Error('insert reunión 9998: ' + eReu.message);
  reunionId = reu.id;

  const { data: catRef, error: eCatRef } = await sb.from('categorias_carrera')
    .select('id').eq('club_id', CLUB_ID).limit(1).single();
  if (eCatRef) throw new Error('lookup categoria_id: ' + eCatRef.message);
  const CAT = catRef.id;

  const { error: eCar } = await sb.from('carreras').insert([
    { reunion_id: reunionId, categoria_id: CAT, numero_turno: 1, distancia_metros: 1000, bolsa_total: 1191666, distribucion_premios: DIST_PISO_MALO, estado: 'abierta' },
    { reunion_id: reunionId, categoria_id: CAT, numero_turno: 2, distancia_metros: 1000, bolsa_total: 1191666, distribucion_premios: DIST_PISO_OK, estado: 'abierta' },
  ]);
  if (eCar) throw new Error('insert carreras 9998: ' + eCar.message);

  const { data: cars, error: eSel } = await sb.from('carreras')
    .select('numero_turno, bolsa_total, distribucion_premios')
    .eq('reunion_id', reunionId).order('numero_turno');
  if (eSel) throw new Error('select carreras 9998: ' + eSel.message);

  const t1 = cars.find(c => c.numero_turno === 1);
  const t2 = cars.find(c => c.numero_turno === 2);

  ok('t1: piso = bolsa entera → warning (true)',
    pisoSospechoso(t1.distribucion_premios.ganancia_minima, t1.bolsa_total) === true,
    `piso=${t1.distribucion_premios.ganancia_minima} bolsa=${t1.bolsa_total}`);
  ok('t2: piso normal 100k → sin warning (false)',
    pisoSospechoso(t2.distribucion_premios.ganancia_minima, t2.bolsa_total) === false,
    `piso=${t2.distribucion_premios.ganancia_minima} bolsa=${t2.bolsa_total}`);

  // Límites de la regla (piso > bolsa*0.2)
  ok('límite: piso == 20% exacto → false', pisoSospechoso(200000, 1000000) === false);
  ok('límite: piso > 20% → true', pisoSospechoso(200001, 1000000) === true);
  ok('límite: sin piso (0) → false', pisoSospechoso(0, 1000000) === false);
}

main()
  .catch(err => { fail++; console.error('❌ ERROR:', err.message); })
  .finally(async () => {
    if (reunionId) {
      await sb.from('carreras').delete().eq('reunion_id', reunionId);
      await sb.from('reuniones').delete().eq('id', reunionId);
    }
    await cleanupExisting();
    console.log(`\n${fail === 0 ? '✅ TODO OK' : '❌ FALLOS'}: ${pass} pass, ${fail} fail — reunión 9998 limpiada`);
    process.exit(fail === 0 ? 0 : 1);
  });
