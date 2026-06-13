/**
 * Probe edad display — tope abierto "X y más a." + rango real "X - Y a".
 *
 * CORRE EL CÓDIGO REAL del builder de condición de edad de inscripciones.html
 * (working tree). NO usa browser (Playwright no soporta chromium en ubuntu26.04, ver
 * tests/README.md). EXTRAE el bloque de edad por anchors y lo ejecuta vía AsyncFunction
 * inyectando `car` (filas reales de la DB) + `parts`/`usaEspacios`. Es el código REAL,
 * no una reimplementación.
 *
 * Reunión objetivo: b02ca761-6f44-4720-86aa-a3c3099019ea (Dolores, 2026-06-20).
 *
 * Verifica, contra la data ya corregida (T8-11 emax=NULL, T4/T5 = 3-4):
 *   - T8/T9/T10 → "5 y más a"   (tope abierto)
 *   - T11       → "4 y más a"   (tope abierto, caso reportado por Fede)
 *   - T4/T5     → "3 - 4 a"     (rango real, inversión corregida)
 *   - T1        → "2 a"         (edad única, no se rompe)
 *   - T7        → "3 - 4 a"     (rango real preexistente)
 *   - NINGÚN turno renderiza "- 10 a" ni el viejo "a +".
 *
 * READ-ONLY: no escribe. Solo lee carreras y evalúa el builder.
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
const REUNION = 'b02ca761-6f44-4720-86aa-a3c3099019ea';

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const ok = (t, c, n='') => results.push({ t, s: c ? '✅' : '❌', n });

const __dir = dirname(fileURLToPath(import.meta.url));

// Extrae el bloque de edad (anchor inicio → anchor fin) tal cual se sirve en prod.
function extractEdadBlock(html) {
  const startAnchor = 'const emin = car.edad_minima_anos, emax = car.edad_maxima_anos;';
  const endAnchor   = "let hc = (car.condicion_handicap || '').trim();";
  const s = html.indexOf(startAnchor);
  if (s < 0) throw new Error('No encontré el anchor de inicio del bloque de edad.');
  const e = html.indexOf(endAnchor, s);
  if (e < 0) throw new Error('No encontré el anchor de fin del bloque de edad.');
  return html.slice(s, e);
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

// Esperados por turno (variante espaciada — las 6 son condicion_sexo='ambos').
const EXPECTED = {
  1: '2 a',
  4: '3 - 4 a',
  5: '3 - 4 a',
  7: '3 - 4 a',
  8: '5 y más a',
  9: '5 y más a',
  10: '5 y más a',
  11: '4 y más a',
};

(async () => {
  try {
    const html = readFileSync(join(__dir, '..', 'inscripciones.html'), 'utf8');
    const body = extractEdadBlock(html) + '\nreturn parts;';
    const runEdad = new AsyncFunction('car', 'usaEspacios', 'parts', body);

    const { data: carreras, error } = await sb.from('carreras')
      .select('numero_turno, edad_minima_anos, edad_maxima_anos, condicion_sexo')
      .eq('reunion_id', REUNION)
      .order('numero_turno');
    if (error) throw error;
    ok('lectura carreras', carreras.length === 11, `turnos=${carreras.length}`);

    for (const car of carreras) {
      const usaEspacios = car.condicion_sexo === 'ambos'; // "Todo caballo" → espacios
      const parts = await runEdad({ edad_minima_anos: car.edad_minima_anos, edad_maxima_anos: car.edad_maxima_anos }, usaEspacios, []);
      const token = parts.join(' ');

      // ningún turno con tope artificial 10 ni viejo "a +"
      ok(`T${car.numero_turno} sin "- 10 a"`, !token.includes('- 10 a'), token);
      ok(`T${car.numero_turno} sin "a +"`, !/\ba \+/.test(token) && !/a\+/.test(token), token);

      if (EXPECTED[car.numero_turno] != null) {
        ok(`T${car.numero_turno} = "${EXPECTED[car.numero_turno]}"`, token === EXPECTED[car.numero_turno], `got="${token}"`);
      }
    }
  } catch (e) {
    ok('excepción', false, e.message);
  } finally {
    console.log('\n── Probe edad display ──');
    for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  · ' + r.n : ''}`);
    const fail = results.filter(r => r.s === '❌').length;
    console.log(`\n${fail === 0 ? '✅ TODO OK' : `❌ ${fail} fallo(s)`}`);
    process.exit(fail === 0 ? 0 : 1);
  }
})();
