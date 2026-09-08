#!/usr/bin/env node
/**
 * probe_condicion_sexo_r9.mjs — T8 y T10 de R9 son carreras de YEGUAS.
 *
 * Los dos turnos decían "Yeguas" en condicion_handicap y tenían condicion_sexo='ambos',
 * así que el gate de inscripción los dejaba entrar a cualquiera. Fix del 2026-09-08:
 * migrations/fix_condicion_sexo_r9_t8_t10.sql ('ambos' -> 'hembras').
 *
 * Qué asserta:
 *   1. La columna quedó en 'hembras' en T8 y T10, y en 'ambos' en los otros nueve turnos.
 *   2. El gate REAL de prod (RPC validar_inscripcion, no una reimplementación) rechaza
 *      macho y castrado en T8/T10 y acepta hembra.
 *   3. Control de aislamiento: los MISMOS tres ejemplares, contra T4 —mismo rango de edad,
 *      condicion_sexo='ambos'— pasan los tres. Sin esto, un "false" en T8/T10 podría venir
 *      de la edad, de una sanción o del cupo, no del sexo.
 *   4. Control negativo de edad: una hembra de 3 años sigue rechazada en T8.
 *
 * READ-ONLY: sólo SELECT y llamadas a validar_inscripcion (RETURNS TABLE, no escribe).
 * NO crea inscripciones, así que no hay snapshot/restore que hacer.
 *
 *   set -a; . ./.env; set +a; node tests/probe_condicion_sexo_r9.mjs
 *
 * NOTA sobre `motivo`: validar_inscripcion devuelve el motivo detallado sólo si
 * fn_is_staff() es true, y con la secret key auth.uid() es NULL -> siempre da el texto
 * genérico. Por eso los asserts van contra `puede_inscribirse`, nunca contra el texto.
 */
const { createClient } = (await import('/home/clio/dev/SGH/node_modules/@supabase/supabase-js/dist/index.cjs')).default;

const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY: set -a; . ./.env; set +a'); process.exit(2); }
const sb = createClient('https://unlhcuanfrtpatoipwve.supabase.co', KEY, { auth: { persistSession: false } });

const R9    = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9';
const T4    = 'fbf0de67-875f-4dbd-834c-60503d2d6f2f';  // ambos, 5..10  — control de aislamiento
const T8    = 'bae8008f-87fc-479e-a416-27502c7489b3';  // hembras, 5..NULL
const T10   = '099b050d-b7e5-412c-b789-55dae7d5cd13';  // hembras, 5..10

// SPCs reales del padrón, activos, sin sanción, con edad reglamentaria dentro del rango.
const MACHO    = { id: 'acd956c5-4464-4e49-8c58-9b42bab741e9', nombre: 'AFRICUM (macho, 6a)' };
const HEMBRA   = { id: 'cb050a3e-22d8-4d53-9ac6-821fb57fbbf2', nombre: 'AMOROUS (hembra, 5a)' };
const CASTRADO = { id: '72896c7d-6265-4dcd-82ca-bd37f7146b2b', nombre: 'Gaucho Bravo (castrado, 7a)' };
const HEMBRA_3A = { id: '3b58d125-5cf1-4372-ba6d-5965aed44593', nombre: 'CARRIGAN FITZ (hembra, 3a)' };

let pass = 0, fail = 0;
const ok  = m => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${m}`); };
const bad = m => { fail++; console.log(`  \x1b[31m✘\x1b[0m ${m}`); };
const asrt = (c, m) => (c ? ok(m) : bad(m));

async function gate(spcId, carreraId) {
  const { data, error } = await sb.rpc('validar_inscripcion', { p_spc_id: spcId, p_carrera_id: carreraId });
  if (error) { console.error('[validar_inscripcion]', error); throw error; }
  return data[0].puede_inscribirse;
}

console.log('\n── 1 · La columna en los once turnos de R9 ──');
{
  const { data, error } = await sb.from('carreras')
    .select('numero_turno,condicion_sexo,condicion_handicap')
    .eq('reunion_id', R9).order('numero_turno');
  if (error) { console.error('[carreras]', error); throw error; }

  asrt(data.length === 11, `R9 tiene 11 turnos (${data.length})`);
  for (const c of data) {
    const esperado = (c.numero_turno === 8 || c.numero_turno === 10) ? 'hembras' : 'ambos';
    asrt(c.condicion_sexo === esperado,
      `T${c.numero_turno}: condicion_sexo = '${c.condicion_sexo}' (esperado '${esperado}')`);
  }
  // El texto es la razón del fix: si alguien lo edita y deja de decir "Yeguas",
  // el probe tiene que avisar, porque la columna dejaría de estar justificada.
  for (const t of [8, 10]) {
    const c = data.find(x => x.numero_turno === t);
    asrt(/yegua/i.test(c.condicion_handicap || ''),
      `T${t}: el texto sigue diciendo "Yeguas" — "${c.condicion_handicap}"`);
  }
}

console.log('\n── 2 · El gate en T8 y T10 (condicion_sexo = hembras) ──');
for (const [turno, carrera] of [[8, T8], [10, T10]]) {
  asrt(await gate(MACHO.id, carrera)    === false, `T${turno}: RECHAZA ${MACHO.nombre}`);
  asrt(await gate(CASTRADO.id, carrera) === false, `T${turno}: RECHAZA ${CASTRADO.nombre}`);
  asrt(await gate(HEMBRA.id, carrera)   === true,  `T${turno}: ACEPTA  ${HEMBRA.nombre}`);
}

console.log('\n── 3 · Control de aislamiento: T4 sigue en "ambos", mismo rango de edad ──');
{
  const { data, error } = await sb.from('carreras')
    .select('numero_turno,condicion_sexo,edad_minima_anos,edad_maxima_anos').eq('id', T4).single();
  if (error) { console.error('[carrera T4]', error); throw error; }
  asrt(data.condicion_sexo === 'ambos', `T4 sigue en 'ambos' (${data.condicion_sexo})`);
  asrt(data.edad_minima_anos === 5, `T4 arranca en 5 años como T8/T10 (${data.edad_minima_anos})`);

  asrt(await gate(MACHO.id, T4)    === true, `T4: ACEPTA ${MACHO.nombre} — el rechazo en T8/T10 es por SEXO`);
  asrt(await gate(CASTRADO.id, T4) === true, `T4: ACEPTA ${CASTRADO.nombre} — idem`);
  asrt(await gate(HEMBRA.id, T4)   === true, `T4: ACEPTA ${HEMBRA.nombre}`);
}

console.log('\n── 4 · Control negativo: la edad sigue mandando ──');
asrt(await gate(HEMBRA_3A.id, T8) === false, `T8: RECHAZA ${HEMBRA_3A.nombre} — por edad, no por sexo`);

console.log(`\n${fail === 0 ? '\x1b[32mOK\x1b[0m' : '\x1b[31mFALLÓ\x1b[0m'} — ${pass} pass, ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
