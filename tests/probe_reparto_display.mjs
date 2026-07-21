/**
 * Probe reparto display — BOLSA EFECTIVA (con piso) + suma exacta + bonos aparte.
 *
 * Corrección de la tanda anterior (regla real aclarada por Yesica): el display vuelve a la
 * BOLSA EFECTIVA (con piso ganancia_minima aplicado por puesto), NO la nominal. La BOLSA
 * impresa = round(Σ efectivos) y Σ puestos ≡ total EXACTO (el puesto mayor absorbe el resto).
 * Los BONOS siguen aparte: NO se suman al número BOLSA.
 *
 * CORRE EL CÓDIGO REAL de repartoDisplay() de premios-utils.js (working tree). NO usa
 * browser (chromium no corre en ubuntu26.04): carga el archivo real vía shim de `window`
 * y ejecuta la función sobre filas REALES leídas de Supabase.
 *
 * Reunión descartable 9998: se crea al inicio, se puebla con 2 turnos de prueba, se leen
 * de vuelta de la DB y se corre repartoDisplay sobre lo persistido. Teardown TOTAL en el
 * finally (borra carreras + reunión 9998). No toca ninguna reunión real.
 *
 * Asserts (caso real turno 10, bolsa 1.191.666, piso 100.000, dist 60/19/12/6/3):
 *  - BOLSA impresa === 1.284.416 (efectiva, con piso; NO la nominal 1.191.666)
 *  - Σ puestos === total EXACTO en ambos turnos (sin drift de $1)
 *  - piso APLICADO en display: 4° y 5° (nominal <100k) se muestran en 100.000
 *  - bonos NO sumados al total (turno con 550k de bonos → total sigue 1.284.416)
 *  - turno sin bonos → dist sin claves de bono
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

// --- Carga el código REAL de premios-utils.js vía shim de window ---
globalThis.window = {};
eval(readFileSync(join(ROOT, 'premios-utils.js'), 'utf8'));
const repartoDisplay = globalThis.window.repartoDisplay;
if (typeof repartoDisplay !== 'function') throw new Error('repartoDisplay no exportado por premios-utils.js');

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok  = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

const DIST_CON_BONOS = { '1': 60, '2': 19, '3': 12, '4': 6, '5': 3, ganancia_minima: 100000, bono_ganador: 250000, bono_posicion_desde: 6, bono_posicion_hasta: 8, bono_posicion_monto: 100000 };
const DIST_SIN_BONOS = { '1': 60, '2': 19, '3': 12, '4': 6, '5': 3, ganancia_minima: 100000 };

let reunionId = null;

async function cleanupExisting() {
  const { data } = await sb.from('reuniones').select('id').eq('club_id', CLUB_ID).eq('numero', REUNION_NUM);
  for (const r of (data || [])) {
    await sb.from('carreras').delete().eq('reunion_id', r.id);
    await sb.from('reuniones').delete().eq('id', r.id);
  }
}

async function main() {
  await cleanupExisting(); // por si quedó basura de una corrida anterior

  // hipodromo_id (NOT NULL) — tomado de una reunión real del club
  const { data: ref, error: eRef } = await sb.from('reuniones')
    .select('hipodromo_id').eq('club_id', CLUB_ID).limit(1).single();
  if (eRef) throw new Error('lookup hipodromo_id: ' + eRef.message);

  const { data: reu, error: eReu } = await sb.from('reuniones')
    .insert({ club_id: CLUB_ID, hipodromo_id: ref.hipodromo_id, numero: REUNION_NUM, fecha: '2099-12-31', estado: 'borrador' })
    .select('id').single();
  if (eReu) throw new Error('insert reunión 9998: ' + eReu.message);
  reunionId = reu.id;

  // categoria_id (NOT NULL) — una categoría real del club
  const { data: catRef, error: eCatRef } = await sb.from('categorias_carrera')
    .select('id').eq('club_id', CLUB_ID).limit(1).single();
  if (eCatRef) throw new Error('lookup categoria_id: ' + eCatRef.message);
  const CAT = catRef.id;

  const { error: eCar } = await sb.from('carreras').insert([
    { reunion_id: reunionId, categoria_id: CAT, numero_turno: 1, distancia_metros: 1000, bolsa_total: 1191666, distribucion_premios: DIST_CON_BONOS, estado: 'abierta' },
    { reunion_id: reunionId, categoria_id: CAT, numero_turno: 2, distancia_metros: 1000, bolsa_total: 1000000, distribucion_premios: DIST_SIN_BONOS, estado: 'abierta' },
  ]);
  if (eCar) throw new Error('insert carreras 9998: ' + eCar.message);

  // Leer de vuelta lo persistido y correr el código REAL sobre esas filas
  const { data: cars, error: eSel } = await sb.from('carreras')
    .select('numero_turno, bolsa_total, distribucion_premios')
    .eq('reunion_id', reunionId).order('numero_turno');
  if (eSel) throw new Error('select carreras 9998: ' + eSel.message);

  const t1 = cars.find(c => c.numero_turno === 1);
  const t2 = cars.find(c => c.numero_turno === 2);

  // --- Turno 1 (con bonos, bolsa 1.191.666, piso 100.000) ---
  const r1 = repartoDisplay(t1.bolsa_total, t1.distribucion_premios);
  const suma1 = Object.values(r1.puestos).reduce((s, v) => s + v, 0);
  ok('t1: BOLSA efectiva = 1.284.416 (piso aplicado, NO nominal 1.191.666)', r1.total === 1284416, `total=${r1.total}`);
  ok('t1: Σ puestos === total EXACTO (sin drift)', suma1 === r1.total, `suma=${suma1} total=${r1.total}`);
  ok('t1: piso APLICADO en display — 4° = 100.000', r1.puestos['4'] === 100000, `4°=${r1.puestos['4']}`);
  ok('t1: piso APLICADO en display — 5° = 100.000', r1.puestos['5'] === 100000, `5°=${r1.puestos['5']}`);
  const bonos1 = t1.distribucion_premios.bono_ganador + t1.distribucion_premios.bono_posicion_monto * 3;
  ok('t1: bonos NO sumados al total (total sigue 1.284.416)', r1.total === 1284416 && bonos1 === 550000, `total=${r1.total}, bonos=${bonos1}`);

  // --- Turno 2 (sin bonos, bolsa 1.000.000, piso 100.000) ---
  const r2 = repartoDisplay(t2.bolsa_total, t2.distribucion_premios);
  const suma2 = Object.values(r2.puestos).reduce((s, v) => s + v, 0);
  const tieneBono = ['bono_ganador', 'bono_posicion_monto'].some(k => k in t2.distribucion_premios);
  ok('t2: dist sin claves de bono', !tieneBono);
  ok('t2: BOLSA efectiva = 1.110.000 (600k+190k+120k+piso 100k+piso 100k)', r2.total === 1110000, `total=${r2.total}`);
  ok('t2: piso APLICADO en display — 4° y 5° = 100.000', r2.puestos['4'] === 100000 && r2.puestos['5'] === 100000, `4°=${r2.puestos['4']} 5°=${r2.puestos['5']}`);
  ok('t2: Σ puestos === total EXACTO', suma2 === r2.total, `suma=${suma2} total=${r2.total}`);
}

main()
  .catch(err => { fail++; console.error('❌ ERROR:', err.message); })
  .finally(async () => {
    // Teardown TOTAL de la reunión descartable 9998
    if (reunionId) {
      await sb.from('carreras').delete().eq('reunion_id', reunionId);
      await sb.from('reuniones').delete().eq('id', reunionId);
    }
    await cleanupExisting();
    console.log(`\n${fail === 0 ? '✅ TODO OK' : '❌ FALLOS'}: ${pass} pass, ${fail} fail — reunión 9998 limpiada`);
    process.exit(fail === 0 ? 0 : 1);
  });
