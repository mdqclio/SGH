#!/usr/bin/env node
/**
 * probe_apuestas_especiales.mjs — Gate de render de la caja "APUESTAS ESPECIALES"
 * de la tapa de programa-oficial-color.html.
 *
 * Contexto: la caja estaba hardcodeada (Triplo 2·3·4 $50.000 / Cuaterna 6·7·8·9 /
 * Doble 8·9) con datos de una reunión de 9 carreras. R8 (16/08/2026) tiene 8
 * carreras y 4 turnos anulados, así que los números impresos no coincidían ni con
 * lo que cargó Fede ni con las carreras del cuerpo del programa.
 *
 * Este probe corre la función REAL extraída del HTML (patrón tests/README.md),
 * alimentada con los datos REALES de prod, y verifica:
 *   T1 — R8 produce exactamente las 3 especiales que cargó Fede, con la
 *        numeración pública (renumerada 1..8), rangos por cantidad de patas
 *        y montos de la DB.
 *   T2 — los números de la tapa coinciden con la numeración del cuerpo
 *        (idx+1 sobre las carreras ordenadas por numero_carrera_programa).
 *   T3 — el Doble simple ($200, sin nombre ni pozo) que está cargado en casi
 *        todas las carreras NO genera tarjetas.
 *   T4 — una reunión sin combinadas especiales devuelve '' (la caja no se dibuja).
 *
 * Solo lee (SELECT). No escribe nada.
 *
 *   node tests/probe_apuestas_especiales.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY
  || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB_DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const R8_ID = '7b6e003e-22e2-4629-bf55-f18560b1260f';   // reunión 8 — 16/08/2026

/* ---------- extracción del código real (balance de llaves) ---------- */
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`no se encontró function ${name}( en el HTML`);
  let i = src.indexOf('{', start), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error(`llaves desbalanceadas en ${name}`);
}

const html = readFileSync(join(ROOT, 'programa-oficial-color.html'), 'utf8');
const buildApuestasEspeciales = new Function(
  `${extractFn(html, 'buildApuestasEspeciales')}; return buildApuestasEspeciales;`
)();

/* ---------- mismo orden que render() ---------- */
function ordenarComoPrograma(carreras) {
  return [...carreras].sort((a, b) => {
    const aN = a.numero_carrera_programa ?? a.numero_turno ?? 999;
    const bN = b.numero_carrera_programa ?? b.numero_turno ?? 999;
    return aN - bN;
  });
}

/* ---------- carga igual que loadData() ---------- */
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function carrerasDeReunion(reunionId) {
  // mismo filtro que loadData(): las anuladas no entran al programa. NO filtrar
  // por numero_carrera_programa — hay reuniones viejas donde es NULL y render()
  // igual las imprime, ordenadas por numero_turno.
  const { data: carreras, error: e1 } = await sb.from('carreras')
    .select('id,numero_turno,numero_carrera_programa,estado,nombre')
    .eq('reunion_id', reunionId)
    .or('estado.is.null,estado.neq.anulada');
  if (e1) { console.error('[carreras]', e1); throw e1; }

  const ids = (carreras || []).map(c => c.id);
  const { data: apus, error: e2 } = ids.length
    ? await sb.from('carrera_apuestas').select('*').in('carrera_id', ids).order('orden')
    : { data: [], error: null };
  if (e2) { console.error('[carrera_apuestas]', e2); throw e2; }

  const byCarrera = {};
  (apus || []).forEach(r => { (byCarrera[r.carrera_id] ??= []).push(r); });
  (carreras || []).forEach(c => { c._apuestas = byCarrera[c.id] || []; });

  return ordenarComoPrograma(carreras || []);
}

/* ---------- parseo del HTML producido ---------- */
function parseCards(html) {
  // split por marcador: un regex no-greedy corta en el primer `</div></div>`,
  // que cae ANTES del cierre de ac-base
  return html.split('<div class="apuesta-card">').slice(1).map(b => {
    const pick = re => (b.match(re)?.[1] ?? '').trim();
    return {
      num:   pick(/<div class="ac-num">([\s\S]*?)<\/div>/),
      tipo:  pick(/<div class="ac-tipo">([\s\S]*?)<\/div>/),
      desde: pick(/<div class="ac-desde">([\s\S]*?)<\/div>/),
      pozo:  pick(/<div class="ac-pozo">([\s\S]*?)<\/div>/),
      base:  pick(/<div class="ac-base">([\s\S]*?)<\/div>/),
    };
  });
}

/* ---------- asserts ---------- */
let fallos = 0;
const ok  = (t, m) => { console.log(`  ${t ? '✅' : '❌'} ${m}`); if (!t) fallos++; };
const eq  = (a, b, m) => ok(a === b, `${m}${a === b ? '' : `\n       esperado: ${JSON.stringify(b)}\n       obtenido: ${JSON.stringify(a)}`}`);

console.log('\n=== probe_apuestas_especiales — caja de tapa derivada de carrera_apuestas ===\n');

const carreras = await carrerasDeReunion(R8_ID);
const cards = parseCards(buildApuestasEspeciales(carreras));

console.log(`R8 — ${carreras.length} carreras en el programa, ${cards.length} apuestas especiales\n`);

console.log('T1 — las 3 especiales que cargó Fede, con numeración pública');
const esperado = [
  // Fede las cargó en los turnos 12 / 10 / 3, que renumerados son 2 / 5 / 7.
  // Los nombres se corrigieron en migrations/r8_apuestas_nombres.sql: el typo del Triplo
  // y la Cuaterna, que estaba sin nombre e imprimía sólo "Cuaterna".
  { num: '2', tipo: 'Triplo Inicial', desde: 'Carreras 2 · 3 · 4',     pozo: 'POZO ASEGURADO $45.000', base: 'Base $200' },
  { num: '5', tipo: 'Cuaterna Final', desde: 'Carreras 5 · 6 · 7 · 8', pozo: 'POZO ASEGURADO $75.000', base: 'Base $200' },
  { num: '7', tipo: 'Doble final',    desde: 'Carreras 7 · 8',         pozo: 'POZO ASEGURADO $25.000', base: 'Base $200' },
];
eq(cards.length, 3, 'cantidad de tarjetas');
esperado.forEach((e, i) => {
  const c = cards[i] || {};
  eq(c.num,   e.num,   `card ${i + 1} — número`);
  eq(c.tipo,  e.tipo,  `card ${i + 1} — nombre`);
  eq(c.desde, e.desde, `card ${i + 1} — rango`);
  eq(c.pozo,  e.pozo,  `card ${i + 1} — pozo`);
  eq(c.base,  e.base,  `card ${i + 1} — base`);
});

console.log('\nT2 — el número de la tapa apunta a la carrera correcta del cuerpo');
const porNumeroPublico = new Map(carreras.map((c, i) => [String(i + 1), c]));
[['2', 12, 'GRAL JOSÉ DE SAN MARTIN'], ['5', 10, 'DÍA DEL NIÑO'], ['7', 3, 'FUERZA AÉREA ARGENTINA']]
  .forEach(([num, turno, nombre]) => {
    const c = porNumeroPublico.get(num);
    ok(c && c.numero_turno === turno && c.nombre === nombre,
       `carrera ${num} del programa = turno ${turno} (${nombre})`);
  });
// ninguna tarjeta puede exceder la cantidad de carreras impresas
const maxNum = Math.max(...cards.map(c => Math.max(...c.desde.match(/\d+/g).map(Number))));
ok(maxNum <= carreras.length, `ningún rango cita carreras inexistentes (máx ${maxNum} ≤ ${carreras.length})`);

console.log('\nT3 — el Doble simple no genera tarjetas');
const doblesSimples = carreras.flatMap(c => (c._apuestas || [])
  .filter(a => a.tipo === 'X2' && !a.nombre && !(a.asegurado > 0) && !(a.incremento > 0)));
ok(doblesSimples.length > 0, `hay ${doblesSimples.length} X2 simples cargados en R8 (caso real)`);
eq(cards.filter(c => c.tipo === 'Doble').length, 0, 'ninguna tarjeta "Doble" genérica');

console.log('\nT4 — reunión sin especiales → caja no se dibuja');
const { data: otras } = await sb.from('reuniones').select('id,numero,fecha')
  .eq('club_id', CLUB_DOLORES).neq('id', R8_ID).order('fecha');
let probadaVacia = null;
for (const r of otras || []) {
  const cs = await carrerasDeReunion(r.id);
  if (!cs.length) continue;
  if (buildApuestasEspeciales(cs) === '') { probadaVacia = r; break; }
}
if (probadaVacia) {
  ok(true, `reunión ${probadaVacia.numero} (${probadaVacia.fecha}) → '' (sin caja)`);
} else {
  // ninguna reunión real sin especiales: fabricar el caso con carreras sin apuestas
  eq(buildApuestasEspeciales(carreras.map(c => ({ ...c, _apuestas: [] }))), '',
     'carreras sin apuestas → \'\'');
}
eq(buildApuestasEspeciales([]), '', 'reunión vacía → \'\'');

console.log(`\n=== ${fallos === 0 ? 'OK — todos los asserts pasaron' : `${fallos} ASSERT(S) FALLARON`} ===\n`);
process.exit(fallos === 0 ? 0 : 1);
