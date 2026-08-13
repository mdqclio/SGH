#!/usr/bin/env node
/**
 * probe_orden_carreras.mjs — Gate del fix fix/resultados-numero-carrera
 *
 * Verifica que resultados.html:
 *   1. filtra las carreras anuladas (NULL-safe),
 *   2. ordena por numero_carrera_programa con fallback a numero_turno (nullish coalescing),
 *   3. muestra en cada tarjeta el numero definitivo del programa.
 *
 * Patron de harness de codigo real (tests/README.md): se extrae el cuerpo de loadReunion() y
 * renderLista() del HTML que sirve prod y se ejecuta via AsyncFunction con cliente Supabase
 * real + stubs de DOM. No hay reimplementacion: corre el mismo texto que el browser.
 *
 * Compara HEAD contra `git show main:resultados.html` para probar el antes/despues.
 * READ-ONLY: solo SELECTs. No escribe nada.
 *
 *   node tests/probe_orden_carreras.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
// carreras tiene RLS: la publishable key devuelve 0 filas sin error. Se usa la secret
// server-side (tests/README.md → `set -a; . ./.env; set +a`). Solo se hacen SELECTs.
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_KEY) {
  console.error('Falta SUPABASE_SECRET_KEY. Correr:  set -a; . ./.env; set +a; node tests/probe_orden_carreras.mjs');
  process.exit(2);
}

const R8 = '7b6e003e-22e2-4629-bf55-f18560b1260f'; // 16/08/2026 — 12 turnos, 4 anuladas
const R6 = 'b02ca761-6f44-4720-86aa-a3c3099019ea'; // 20/06/2026 — 11 turnos, 3 anuladas
const R9 = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'; // 20/09/2026 — 11 turnos, 0 anuladas, sin sortear

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${m}`); };
const bad = (m) => { fail++; console.log(`  \x1b[31m✘\x1b[0m ${m}`); };
const asrt = (c, m) => (c ? ok(m) : bad(m));

/** Extrae el cuerpo de una funcion del HTML balanceando llaves. */
function extractFn(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) throw new Error(`No se encontro: ${signature}`);
  const open = src.indexOf('{', start + signature.length - 1);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  return src.slice(open + 1, i);
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/**
 * Corre loadReunion()+renderLista() reales sobre una reunion y devuelve
 * el array `carreras` resultante y el HTML que renderiza la grilla.
 */
async function runReal(html, reunionId) {
  const bodyLoad   = extractFn(html, 'async function loadReunion()');
  const bodyRender = extractFn(html, 'function renderLista()');

  const dom = { 'main-container': { innerHTML: '' }, 'sel-reunion': { value: reunionId } };
  const document = { getElementById: (id) => dom[id] ?? { innerHTML: '', value: '' } };
  const ActiveReunion = { set: () => {} };

  const src = `
    let carreras = [], inscripciones = [], resultados = {}, posicionesMap = {},
        apuestasMap = {}, carreraApuestasMap = {}, currentCarreraId = null;
    function renderLista() {${bodyRender}}
    async function loadReunion() {${bodyLoad}}
    await loadReunion();
    return { carreras, html: document.getElementById('main-container').innerHTML };
  `;
  const fn = new AsyncFunction('sb', 'document', 'ActiveReunion', src);
  return fn(sb, document, ActiveReunion);
}

/** Numeros que muestran las tarjetas, leidos del HTML renderizado (no recalculados). */
const ccNums  = (html) => [...html.matchAll(/<div class="cc-num">(.*?)<\/div>/g)].map(m => m[1].trim());
const ccNames = (html) => [...html.matchAll(/<div class="cc-name">(.*?)<\/div>/g)].map(m => m[1].trim());
/** Denominador del badge de reunion oficial. */
function badgeDenom(html) {
  const m = html.match(/(\d+)\/(\d+) carreras oficiales/) || html.match(/\((\d+)\/(\d+)\) oficializadas/);
  return m ? Number(m[2]) : null;
}

const headHtml = readFileSync(new URL('../resultados.html', import.meta.url), 'utf8');
const mainHtml = execSync('git show main:resultados.html', { encoding: 'utf8', maxBuffer: 32e6 });

console.log('\n=== probe_orden_carreras — fix/resultados-numero-carrera ===');
console.log('Ref: unlhcuanfrtpatoipwve · READ-ONLY (solo SELECT)\n');

// ── Sanity: el codigo bajo prueba es el nuevo ────────────────────────────────
console.log('[0] Codigo bajo prueba');
asrt(headHtml.includes("estado.is.null,estado.neq.anulada"), 'HEAD tiene el filtro NULL-safe de anuladas');
asrt(/a\.numero_carrera_programa \?\? a\.numero_turno/.test(headHtml), 'HEAD ordena con nullish coalescing');
asrt(!/\+\s*10000/.test(headHtml), 'HEAD no usa offset +10000');
asrt(!mainHtml.includes("estado.neq.anulada"), 'main (antes) no tenia el filtro');

// ── VERIFICACION 1: R8 muestra 1..8 sin repetidos ni huecos ──────────────────
console.log('\n[1] R8 (16/08/2026) — tarjetas visibles y su numero');
const r8 = await runReal(headHtml, R8);
const n8 = ccNums(r8.html), name8 = ccNames(r8.html);
n8.forEach((n, i) => console.log(`      tarjeta ${i + 1}: N° ${n.padStart(2)} — ${name8[i]}`));
asrt(r8.carreras.length === 8, `quedan 8 carreras visibles (obtenido: ${r8.carreras.length})`);
asrt(n8.length === 8, `se renderizan 8 tarjetas (obtenido: ${n8.length})`);
asrt(JSON.stringify(n8) === JSON.stringify(['1','2','3','4','5','6','7','8']),
     `los numeros son 1..8 en orden (obtenido: ${n8.join(',')})`);
// nonEmpty evita el pase vacuo: [].every(...) y ![].some(...) dan true con 0 filas.
const nonEmpty = (arr, pred) => arr.length > 0 && pred(arr);
asrt(nonEmpty(n8, a => new Set(a).size === a.length), 'sin numeros repetidos');
asrt(nonEmpty(r8.carreras, a => !a.some(c => c.estado === 'anulada')), 'ninguna anulada en la lista');
asrt(nonEmpty(r8.carreras, a => !a.some(c => c.numero_carrera_programa == null)), 'ninguna tarjeta cae al fallback de turno');

// ── VERIFICACION 2: denominador del badge ────────────────────────────────────
console.log('\n[2] R8 — badge de reunion oficial');
const d8 = badgeDenom(r8.html);
console.log(`      badge: "${(r8.html.match(/Reuni[oó]n (?:oficial|provisional)[^<]*/) || ['—'])[0]}"`);
asrt(d8 === 8, `denominador = 8 (obtenido: ${d8})`);
const d8old = badgeDenom((await runReal(mainHtml, R8)).html);
asrt(d8old === 12, `antes del fix era 12 (obtenido: ${d8old}) — el badge era inalcanzable`);

// ── VERIFICACION 3: reuniones de control ─────────────────────────────────────
async function control(nombre, rid) {
  const before = await runReal(mainHtml, rid);
  const after  = await runReal(headHtml, rid);
  const bn = ccNums(before.html), an = ccNums(after.html);
  console.log(`\n      ${nombre}`);
  console.log(`        antes:   ${bn.length} tarjetas → ${bn.join(',')}`);
  console.log(`        despues: ${an.length} tarjetas → ${an.join(',')}`);
  return { before, after, bn, an, igual: JSON.stringify(bn) === JSON.stringify(an) };
}

console.log('\n[3] Reuniones de control');
const c9 = await control('R9 (20/09/2026) — 11 carreras, 0 anuladas, ninguna sorteada', R9);
asrt(c9.bn.length === 11 && c9.igual,
     `R9 NO cambia — 0 anuladas y todas sin sortear: el fallback preserva el orden de turno (${c9.bn.length} tarjetas)`);
asrt(c9.after.carreras.length === 11 && c9.after.carreras.every(c => c.numero_carrera_programa == null),
     'R9 ejercita el fallback (las 11 sin numero de programa)');

const c6 = await control('R6 (20/06/2026) — 11 carreras, 3 anuladas', R6);
asrt(c6.before.carreras.length === 11, `R6 antes listaba 11 (obtenido: ${c6.before.carreras.length})`);
asrt(c6.after.carreras.length === 8,  `R6 ahora lista 8 (obtenido: ${c6.after.carreras.length})`);
asrt(nonEmpty(c6.after.carreras, a => !a.some(c => c.estado === 'anulada')), 'R6: se fueron las 3 anuladas');
asrt(JSON.stringify(c6.an) === JSON.stringify(['1','2','3','4','5','6','7','8']),
     `R6 tambien queda 1..8 en orden (obtenido: ${c6.an.join(',')})`);
console.log('      ⚠ R6 SI cambia: tiene 3 anuladas. El brief la daba como control sin anuladas.');

// ── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(fail === 0 ? `\x1b[32mGATE OK\x1b[0m — ${pass}/${pass + fail} asserts`
                       : `\x1b[31mGATE FAIL\x1b[0m — ${fail} de ${pass + fail} fallaron`);
process.exit(fail === 0 ? 0 : 1);
