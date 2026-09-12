/**
 * Probe — orden alfabético castellano de los inscriptos en inscripciones.html
 * (pantalla y PDF), el mismo comparador que ratificacion.html. Código real,
 * sin browser. SOLO LECTURA.
 *
 * EL PEDIDO (Yesi, 12/09/2026)
 * ---------------------------------------------------------------------------
 * Para el sorteo de gateras Yesi lee el papel (PDF de inscriptos, alfabético)
 * y carga el número de partidor en la pantalla, que estaba en orden de carga
 * (`created_at`). Ahora la pantalla ordena por nombre del SPC con
 * `localeCompare(..., 'es')`, y el PDF —que ordenaba con `localeCompare` sin
 * locale, o sea con el idioma del navegador que imprime— lleva el 'es'
 * explícito. Relevamiento: docs/diagnosticos/2026-09-12_orden-inscriptos-pantalla-vs-pdf.md
 * (rama reports).
 *
 * QUÉ VERIFICA
 * ---------------------------------------------------------------------------
 *   A) loadInscripciones() REAL, corrida contra los 11 turnos de R9: el orden en
 *      que deja el array `inscripciones` es el alfabético 'es' y coincide, id
 *      por id, con el que produce el comparador del PDF sobre las mismas filas.
 *   B) Caso real R9 T4: NIÑO OCEANICO antes que NISTEL WIN — y se comprueba que
 *      el orden por codepoint (`.sort()` a pelo / ORDER BY en colación C) los
 *      daría al revés, así el assert discrimina de verdad.
 *   C) Casos sintéticos por los DOS comparadores extraídos (pantalla y PDF):
 *      Ñ después de toda la N (ANZUELO < AÑO NUEVO; NUBE < ÑANDU < OSO) y la
 *      tilde no separa (MARIA CATULENGA ≈ MARÍA CATULENGA, ambas antes que
 *      MARIA CATULENGB). Con `localeCompare` sin locale y node en en-US, el
 *      caso AÑO/ANZUELO falla: eso es lo que atrapa una regresión del 'es'.
 *   D) Texto: el PDF y ratificacion.html usan `'es'` en sus sorts por nombre.
 *
 * PATRÓN (tests/README.md § "Browser NO disponible")
 * ---------------------------------------------------------------------------
 * Se extrae `loadInscripciones` del HTML por ancla con balance de llaves y se
 * corre con new AsyncFunction inyectando el cliente Supabase real y un mini-DOM.
 * Los comparadores se extraen por regex del texto de las dos funciones y se
 * evalúan tal cual están escritos. Nada se reimplementa acá.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_orden_inscriptos.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }

const R9_ID = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9';   // Reunión 9 — Dolores 20/09/2026

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const INSC = readFileSync(process.env.INSC_HTML || join(HERE, '..', 'inscripciones.html'), 'utf8');
const RATI = readFileSync(join(HERE, '..', 'ratificacion.html'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

// ── extracción por ancla (probe_paridad_llamado_inscripciones.mjs) ──────────
function extractFn(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  let d = 0;
  for (let k = i + firma.length - 1; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error(`no pude cerrar: ${firma}`);
}

// El comparador por nombre de SPC, tal como está escrito en el archivo. Se
// permite con o sin locale para que un 'es' ausente se vea como assert rojo y
// no como "no encontré".
const CMP_RE = /\(a, b\) =>\s*\(a\.spcs\?\.nombre \|\| ''\)\.localeCompare\(b\.spcs\?\.nombre \|\| ''(?:, '([a-zA-Z-]+)')?\)/;
function extractCmp(fnSrc, etiqueta) {
  const m = fnSrc.match(CMP_RE);
  // Sin comparador (p.ej. la versión anterior, que ordenaba por created_at) no se
  // corta: queda como assert rojo y los casos sintéticos se saltan para esa pantalla.
  if (!m) return { cmp: null, locale: null, texto: `(sin comparador por nombre en ${etiqueta})` };
  return { cmp: new Function(`return ${m[0]}`)(), locale: m[1] || null, texto: m[0] };
}

function mkDom() {
  const nodos = {};
  return {
    getElementById: (id) => (nodos[id] ||= { id, innerHTML: '', textContent: '', style: {} }),
  };
}

const LOAD_SRC  = extractFn(INSC, 'async function loadInscripciones() {');
const PRINT_SRC = extractFn(INSC, 'async function printInscriptos() {');
const pantalla  = extractCmp(LOAD_SRC, 'loadInscripciones');
const pdf       = extractCmp(PRINT_SRC, 'printInscriptos');

// loadInscripciones REAL: asigna a la `let inscripciones` de módulo; acá la
// declaramos en el mismo scope y la devolvemos.
async function correrPantalla(carreraId) {
  const run = new AsyncFunction('sb', 'document', 'toast', 'renderInscripciones', 'currentCarreraId', `
    let inscripciones = [];
    ${LOAD_SRC}
    await loadInscripciones();
    return inscripciones;
  `);
  const toast = (msg, tipo) => { if (tipo === 'error') throw new Error(`toast error: ${msg}`); };
  return run(sb, mkDom(), toast, () => {}, carreraId);
}

const nom = (i) => i.spcs?.nombre || '';

// ═══════════════════════════════ D — texto ══════════════════════════════════
ok("D1) pantalla: comparador con locale 'es'", pantalla.locale === 'es', pantalla.texto);
ok("D2) PDF: comparador con locale 'es'", pdf.locale === 'es', pdf.texto);
ok('D3) pantalla ya no ordena por created_at', !/\.order\('created_at'\)/.test(LOAD_SRC));
// Cada llamada a localeCompare del archivo, con sus argumentos completos (balance
// de paréntesis: el de la pantalla es `localeCompare(getSpc(b.spc_id)?.nombre||'', 'es')`).
function llamadasLocaleCompare(src) {
  const out = [];
  let i = 0;
  while ((i = src.indexOf('localeCompare(', i)) >= 0) {
    let d = 0, k = i + 'localeCompare'.length;
    for (; k < src.length; k++) {
      if (src[k] === '(') d++;
      else if (src[k] === ')') { d--; if (d === 0) break; }
    }
    out.push(src.slice(i, k + 1)); i = k + 1;
  }
  return out;
}
const ratiCalls = llamadasLocaleCompare(RATI);
const ratiSin = ratiCalls.filter(s => !/, 'es'\)$/.test(s));
ok("D4) ratificacion.html: todos sus sorts por nombre llevan 'es'", ratiCalls.length >= 3 && ratiSin.length === 0, `total: ${ratiCalls.length}, sin 'es': ${ratiSin.length}${ratiSin.length ? ' → ' + ratiSin.join(' ; ') : ''}`);
const inscSin = llamadasLocaleCompare(INSC).filter(s => !/, 'es'\)$/.test(s));
ok("D5) inscripciones.html: ningún localeCompare sin 'es'", inscSin.length === 0, inscSin.join(' ; '));

// ═══════════════════════════════ C — sintéticos ═════════════════════════════
const filas = (...ns) => ns.map(n => ({ spcs: { nombre: n } }));
const casos = [
  { t: 'Ñ después de toda la N (ANZUELO < AÑO NUEVO)', in: ['AÑO NUEVO', 'ANZUELO', 'ANA', 'AOTO'], esp: ['ANA', 'ANZUELO', 'AÑO NUEVO', 'AOTO'] },
  { t: 'Ñ entre N y O (NUBE < ÑANDU < OSO)',          in: ['OSO', 'ÑANDU', 'NUBE'],               esp: ['NUBE', 'ÑANDU', 'OSO'] },
  { t: 'tilde no separa (MARIA ≈ MARÍA, antes que ...GB)', in: ['MARIA CATULENGB', 'MARÍA CATULENGA', 'MARIA CATULENGA'], esp: ['MARIA CATULENGA', 'MARÍA CATULENGA', 'MARIA CATULENGB'] },
  { t: 'caso real: CHINITA SALTEÑA entre SALTENA y SALTEO', in: ['CHINITA SALTEO', 'CHINITA SALTEÑA', 'CHINITA SALTENA'], esp: ['CHINITA SALTENA', 'CHINITA SALTEÑA', 'CHINITA SALTEO'] },
  { t: 'mayúsculas/minúsculas no separan (La Porteña / LA PORTEÑO)', in: ['LA PORTEÑO', 'La Porteña', 'LA CITY'], esp: ['LA CITY', 'La Porteña', 'LA PORTEÑO'] },
];
for (const c of casos) {
  for (const [q, { cmp }] of [['pantalla', pantalla], ['PDF', pdf]]) {
    if (!cmp) { ok(`C) ${q}: ${c.t}`, false, 'sin comparador'); continue; }
    const got = filas(...c.in).sort(cmp).map(nom);
    ok(`C) ${q}: ${c.t}`, JSON.stringify(got) === JSON.stringify(c.esp), got.join(' < '));
  }
}

// ═══════════════════════════ A + B — R9 real ════════════════════════════════
const { data: cars, error: eC } = await sb.from('carreras').select('id, numero_turno').eq('reunion_id', R9_ID).order('numero_turno');
if (eC) throw eC;
ok('A0) R9 tiene turnos', (cars || []).length > 0, `${(cars || []).length} turnos`);

let t4 = null;
for (const car of cars || []) {
  const pant = await correrPantalla(car.id);
  if (!pant.length) { ok(`A) T${car.numero_turno}: sin inscriptos, nada que ordenar`, true); continue; }

  // (1) el orden que dejó la función real es el alfabético 'es'
  const esperado = [...pant].sort((a, b) => nom(a).localeCompare(nom(b), 'es')).map(i => i.id);
  ok(`A) T${car.numero_turno}: pantalla en alfabético 'es' (${pant.length})`,
    JSON.stringify(pant.map(i => i.id)) === JSON.stringify(esperado), pant.map(nom).join(' | '));

  // (2) el PDF, con su propio comparador sobre las mismas filas, da la misma secuencia
  const pdfOrden = pdf.cmp ? [...pant].sort(pdf.cmp).map(i => i.id) : null;
  ok(`A) T${car.numero_turno}: PDF == pantalla, id por id`, !!pdfOrden && JSON.stringify(pdfOrden) === JSON.stringify(pant.map(i => i.id)));

  // (3) el nombre que pinta la fila viene del JOIN (no del cache de activos)
  ok(`A) T${car.numero_turno}: todas las filas traen spcs.nombre por JOIN`, pant.every(i => nom(i).length > 0));

  if (car.numero_turno === 4) t4 = pant;
}

// B — caso real R9 T4
if (t4) {
  const nombres = t4.map(nom);
  const iNino = nombres.indexOf('NIÑO OCEANICO'), iNistel = nombres.indexOf('NISTEL WIN');
  ok('B1) T4 contiene NIÑO OCEANICO y NISTEL WIN', iNino >= 0 && iNistel >= 0, `${iNino}/${iNistel}`);
  ok('B2) T4: NIÑO OCEANICO antes que NISTEL WIN', iNino >= 0 && iNistel >= 0 && iNino < iNistel, nombres.join(' | '));
  const cp = [...nombres].sort();
  ok('B3) discriminante: por codepoint saldrían al revés (NISTEL < NIÑO)', cp.indexOf('NISTEL WIN') < cp.indexOf('NIÑO OCEANICO'), cp.join(' | '));
} else {
  ok('B) T4 de R9 disponible', false, 'no se encontró el turno 4');
}

// ═══════════════════════════════ reporte ════════════════════════════════════
for (const r of results) console.log(`${r.s} ${r.t}${r.n ? `  — ${r.n}` : ''}`);
const fails = results.filter(r => r.s === '❌').length;
console.log(`\n${results.length - fails}/${results.length} asserts OK${fails ? ` — ${fails} FALLARON` : ''}`);
process.exit(fails ? 1 : 0);
