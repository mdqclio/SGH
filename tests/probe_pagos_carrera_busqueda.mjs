#!/usr/bin/env node
/**
 * probe_pagos_carrera_busqueda.mjs — tab Pagos de liquidaciones.html, Partes A y B (21/09/2026)
 *
 *   A) cobLoadCarreras: sin anuladas (NULL-safe) y ordenado por nº de programa.
 *      R9 tenía dos "Carrera 2", dos "Carrera 8" y una "Carrera 10" fantasma
 *      (diagnóstico 2026-09-20_pagos-filtro-carrera-r9.md).
 *   B) cobNorm / cobMatch: acentos y Ñ, palabras sueltas sin orden, espacios.
 *      "CAROSUENO" → CAROSUEÑO, "ACUÑA MATIAS" → MATIAS EZEQUIEL ACUÑA, "P y P" → PyP
 *      (diagnósticos …_pagos-acuna-matias-r9.md y …_pagos-busqueda-caballeriza-r9.md).
 *
 * Código REAL: los bloques se extraen de liquidaciones.html por ancla y se corren con el cliente
 * de Supabase real (SUPABASE_SECRET_KEY). SOLO LECTURA — no escribe nada.
 *
 * MUTANTES: `--mutante=<nombre>` reemplaza una pieza del código extraído por la versión rota y el
 * probe tiene que FALLAR. `--mutantes` los corre todos en subprocesos y reporta cuáles matan.
 *   A1  neq_solo        .or('estado.is.null,estado.neq.anulada') → .neq('estado','anulada')  (no NULL-safe)
 *   A2  sin_filtro      se quita el filtro de anuladas                                        (rótulos repetidos)
 *   A3  orden_turno     order por numero_turno en vez de numero_carrera_programa               (orden 1,7,2,4,3,5,6,8)
 *   B1  sin_nfd         cobNorm no quita diacríticos                                          (CAROSUENO no encuentra)
 *   B2  substring       cobMatch usa includes(q) literal, sin palabras sueltas                 (ACUÑA MATIAS no encuentra)
 *   B3  sin_compacto    cobMatch sin la regla "sin espacios"                                  (P y P no encuentra)
 *   B4  benef_literal   cobrosBuscar vuelve a benefSearch(...).includes(q)                   (nada normalizado)
 *   B5  cab_literal     propIdsPorCaballeriza vuelve a c.nombre.includes(q)                   (caballeriza literal)
 *
 * Uso:
 *   set -a; . ./.env; set +a
 *   node tests/probe_pagos_carrera_busqueda.mjs                 # ~40 asserts (los casos B11 se arman del universo pagable actual)
 *   node tests/probe_pagos_carrera_busqueda.mjs --mutantes      # 8 mutantes, todos tienen que morir
 *   LIQUIDACIONES_HTML=https://sigh.com.ar/liquidaciones.html node tests/…   # contra el HTML servido
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const R9 = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9';
const R6 = 'b02ca761-6f44-4720-86aa-a3c3099019ea';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

const MUTANTES = {
  neq_solo:      [".or('estado.is.null,estado.neq.anulada')", ".neq('estado','anulada')"],
  sin_filtro:    [".or('estado.is.null,estado.neq.anulada')", ""],
  orden_turno:   [".order('numero_carrera_programa', { nullsFirst:false }).order('numero_turno')", ".order('numero_turno')"],
  sin_nfd:       [".normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')", ""],
  substring:     ["if (nq.split(' ').every(w => nt.includes(w))) return true;", "if (nt.includes(nq)) return true;"],
  sin_compacto:  ["return nt.replace(/ /g, '').includes(nq.replace(/ /g, ''));", "return false;"],
  benef_literal: ["cobMatch(q, benefSearch(g.tipo,g.id))", "benefSearch(g.tipo,g.id).includes(q)"],
  cab_literal:   ["cobMatch(q, c.nombre)", "c.nombre.includes(q)"],
};
const args = process.argv.slice(2);
const mutArg = args.find(a => a.startsWith('--mutante='))?.split('=')[1];

if (args.includes('--mutantes')) {
  let vivos = 0;
  for (const m of Object.keys(MUTANTES)) {
    const r = spawnSync(process.execPath, [SELF, `--mutante=${m}`], { encoding: 'utf8', env: process.env });
    const murio = r.status !== 0;
    if (!murio) vivos++;
    const fallos = (r.stdout.match(/^❌ .*$/gm) || []);
    console.log(`${murio ? '💀' : '🧟'} mutante ${m.padEnd(14)} → ${murio ? `muerto (${fallos.length} assert(s))` : 'VIVO — el probe no lo detecta'}`);
    fallos.slice(0, 3).forEach(f => console.log('     ' + f));
  }
  console.log(`\n${Object.keys(MUTANTES).length - vivos}/${Object.keys(MUTANTES).length} mutantes muertos`);
  process.exit(vivos ? 1 : 0);
}

let SRC;
const fuente = process.env.LIQUIDACIONES_HTML;
if (fuente && /^https?:/.test(fuente)) SRC = await (await fetch(`${fuente}?v=${Date.now()}`)).text();
else SRC = readFileSync(fuente || join(HERE, '..', 'liquidaciones.html'), 'utf8');
if (mutArg) {
  const [de, a] = MUTANTES[mutArg] || [];
  if (!de) { console.error(`mutante desconocido: ${mutArg}`); process.exit(2); }
  if (!SRC.includes(de)) { console.error(`el mutante ${mutArg} no aplica: no está "${de}"`); process.exit(2); }
  SRC = SRC.replace(de, a);
  console.log(`⚠ MUTANTE ${mutArg} aplicado`);
}

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
const bloque = (ini, fin) => {
  const i = SRC.indexOf(ini), j = SRC.indexOf(fin, i);
  if (i < 0 || j < 0) throw new Error(`no encontré el bloque ${ini}`);
  return SRC.slice(SRC.indexOf('\n', i) + 1, j);   // desde la línea siguiente al ancla
};
function extractFn(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error(`no pude cerrar: ${firma}`);
}

// ═══════════════ PARTE A — el select de carreras ═══════════════
// 0) pre-condición del pedido: ninguna carrera anulada tiene líneas de liquidación
const { data: anuladas } = await sb.from('carreras').select('id,reunion_id,numero_turno').eq('estado', 'anulada');
let lineasAnuladas = 0;
for (const c of anuladas || []) {
  const [{ count: porCarrera }, { data: ins }] = await Promise.all([
    sb.from('liquidacion_detalle').select('id', { count: 'exact', head: true }).eq('carrera_id', c.id),
    sb.from('inscripciones').select('id').eq('carrera_id', c.id),
  ]);
  const ids = (ins || []).map(i => i.id);
  const { count: porInsc } = ids.length
    ? await sb.from('liquidacion_detalle').select('id', { count: 'exact', head: true }).in('inscripcion_id', ids)
    : { count: 0 };
  lineasAnuladas += (porCarrera || 0) + (porInsc || 0);
}
ok('A0) ninguna carrera anulada tiene líneas de liquidación (por carrera_id ni por inscripción)',
   lineasAnuladas === 0, `${(anuladas || []).length} anuladas, ${lineasAnuladas} líneas`);

// 1) el bloque real, corrido contra la base
const srcSelect = bloque('// ═══ SELECT CARRERAS — ANCLAS DEL PROBE', '// ═══ SELECT CARRERAS — FIN ═══');
async function cargarSelect(rid) {
  const sel = { innerHTML: '<option value="">— Toda carrera —</option>' };
  const errores = [];
  const consoleReal = console.error; console.error = (...a) => errores.push(a);
  try {
    await new (Object.getPrototypeOf(async function () {}).constructor)('sb', 'rid', 'sel', srcSelect)(sb, rid, sel);
  } finally { console.error = consoleReal; }
  const opts = [...sel.innerHTML.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(m => ({ value: m[1], label: m[2] })).filter(o => o.value);
  return { opts, errores };
}
const { data: carrsR9 } = await sb.from('carreras').select('id,numero_turno,numero_carrera_programa,estado').eq('reunion_id', R9);
const turno = n => carrsR9.find(c => c.numero_turno === n);
const { opts: o9, errores: e9 } = await cargarSelect(R9);
const labels9 = o9.map(o => o.label);
ok('A1) R9: la query no emitió error', e9.length === 0, e9.length ? JSON.stringify(e9[0]).slice(0, 200) : '');
ok('A2) R9: sin rótulos repetidos', new Set(labels9).size === labels9.length, labels9.join(', '));
ok('A3) R9: 8 carreras (11 turnos − 3 anulados)', o9.length === 8, `${o9.length}`);
const nums9 = labels9.map(l => parseInt(l.replace('Carrera ', ''), 10));
ok('A4) R9: ordenado 1 a 8', nums9.join(',') === '1,2,3,4,5,6,7,8', nums9.join(','));
ok('A5) R9: "Carrera 2" es el turno 4 (el corrido), no el turno 2 anulado',
   o9.find(o => o.label === 'Carrera 2')?.value === turno(4).id && !o9.some(o => o.value === turno(2).id));
ok('A6) R9: ningún turno anulado (2, 8, 10) está en el select',
   ![2, 8, 10].some(n => o9.some(o => o.value === turno(n).id)));
ok('A7) R9: el turno 1 (estado NULL, con 27 líneas) SIGUE en el select — el filtro es NULL-safe',
   o9.some(o => o.value === turno(1).id && o.label === 'Carrera 1'), `estado=${JSON.stringify(turno(1).estado)}`);
const { opts: o6 } = await cargarSelect(R6);
const { data: carrsR6 } = await sb.from('carreras').select('id,numero_turno,numero_carrera_programa,estado').eq('reunion_id', R6);
const r6t2 = carrsR6.find(c => c.numero_turno === 2);
ok('A8) R6: el turno 2 (estado NULL, programa 2, 39 líneas) sigue en el select',
   o6.some(o => o.value === r6t2.id), `estado=${JSON.stringify(r6t2.estado)}`);
const nums6 = o6.map(o => parseInt(o.label.replace('Carrera ', ''), 10));
ok('A9) R6: sin repetidos y ordenado', new Set(nums6).size === nums6.length && nums6.every((n, i) => i === 0 || n >= nums6[i - 1]), nums6.join(','));
ok('A10) el texto usa el patrón NULL-safe del repo', srcSelect.includes(".or('estado.is.null,estado.neq.anulada')"));

// ═══════════════ PARTE B — cobNorm / cobMatch / cobrosBuscar ═══════════════
const srcMatch = bloque('// ═══ MATCHEO DEL BUSCADOR — ANCLAS DEL PROBE', '// ═══ MATCHEO DEL BUSCADOR — FIN ═══');
const { cobNorm, cobMatch } = new Function(`${srcMatch}; return { cobNorm, cobMatch };`)();

ok('B1) cobNorm quita Ñ y tildes, baja a minúsculas', cobNorm('CAROSUEÑO') === 'carosueno' && cobNorm('MATÍAS') === 'matias');
ok('B2) cobNorm colapsa puntuación y espacios', cobNorm('EL DON JORGE (LP)') === 'el don jorge lp' && cobNorm('  P  y   P ') === 'p y p');
ok('B3) cobNorm acepta la Ñ descompuesta (N + U+0303)', cobNorm('ACUÑA') === 'acuna');
ok('B4) cobMatch: palabras sueltas sin orden', cobMatch('ACUÑA MATIAS', 'matias ezequiel acuña 38284072') && cobMatch('MATIAS ACUÑA', 'matias ezequiel acuña 38284072'));
ok('B5) cobMatch: sin Ñ encuentra con Ñ', cobMatch('CAROSUENO', 'carosueño') && cobMatch('acuna', 'matias ezequiel acuña'));
ok('B6) cobMatch: "P y P" encuentra PyP', cobMatch('P y P', 'pyp') && cobMatch('p y p', 'PyP'));
// La regla "sin espacios" hace falta en el sentido inverso: lo tipeado pegado contra el dato con
// espacios ("STUDCHICO" → STUD CHICO). "P y P" → PyP ya pasa por palabras sueltas (p, y, p).
ok('B6b) cobMatch: pegado encuentra separado (STUDCHICO → stud chico, pyp → "p y p")',
   cobMatch('STUDCHICO', 'stud chico') && cobMatch('pyp', 'p y p') && cobMatch('DONJORGE', 'el don jorge (lp)'));
ok('B7) cobMatch: apellido solo, DNI y pedazo de caballeriza', cobMatch('ACUÑA', 'matias ezequiel acuña 38284072') && cobMatch('38284072', 'matias ezequiel acuña 38284072') && cobMatch('GALPON', 'el galpon'));
ok('B8) cobMatch: NO matchea lo que no está', !cobMatch('ACUÑA LUIS', 'matias ezequiel acuña 38284072') && !cobMatch('romay', 'matias ezequiel acuña'));
ok('B9) cobMatch: q vacío matchea todo', cobMatch('', 'x') && cobMatch('   ', 'x'));
ok('B10) cobrosBuscar usa cobMatch en el beneficiario y en la caballeriza',
   SRC.includes('cobMatch(q, benefSearch(g.tipo,g.id))') && SRC.includes('cobMatch(q, c.nombre)'));

// 11) cobrosBuscar REAL contra R9 — las tarjetas que salen para cada q
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const [{ data: profs }, { data: props }] = await Promise.all([
  sb.from('profesionales').select('id,nombre,apellido,tipo,documento_nro').eq('club_id', CLUB_ID),
  sb.from('propietarios').select('id,nombre,nombre_stud,documento_nro').eq('activo', true),
]);
const profesionales = {}, propietariosMap = {};
profs.forEach(p => { profesionales[p.id] = p; }); props.forEach(p => { propietariosMap[p.id] = p; });
function mkDocument(campos) {
  const nodos = {};
  const get = id => (nodos[id] ||= { value: campos[id] ?? '', innerHTML: '', textContent: '', style: {}, classList: { add(){}, remove(){}, toggle(){} }, scrollIntoView(){} });
  Object.keys(campos).forEach(get); ['cob-detalle', 'cob-beneficiarios'].forEach(get);
  return { getElementById: id => get(id), _n: nodos, querySelectorAll: () => [] };
}
const srcBuscar = [
  SRC.slice(SRC.indexOf('const ROL_POR_BENEFICIARIO'), SRC.indexOf('\n', SRC.indexOf('const ROL_POR_BENEFICIARIO'))),
  extractFn(SRC, 'function rolDeLinea(l)'), extractFn(SRC, 'function nombreBenef(tipo, id)'),
  srcMatch, extractFn(SRC, 'function benefSearch(tipo, id)'),
  extractFn(SRC, 'function etiquetaRoles(g)'), extractFn(SRC, 'function etiquetaCarreras(g)'),
  extractFn(SRC, 'async function cobCargarReunPrueba()'), extractFn(SRC, 'function cobVisible(l, rid)'),
  extractFn(SRC, 'function cobDelClub(l)'), extractFn(SRC, 'async function cobrosBuscar()'),
].join('\n\n');
async function buscar(q, carreraId = '') {
  const document = mkDocument({ 'cob-q': q, 'cob-reunion': R9, 'cob-carrera': carreraId });
  const api = await new AsyncFunction('sb', 'CLUB_ID', 'document', 'toast', 'fmt', 'propietariosMap', 'profesionales',
    `let cobCaballerizas = [], cobInscCarrera = {}, cobNroCarrera = {}, cobMapsScope = null, cobReunPrueba = null;
     ${srcBuscar}
     return { cobrosBuscar };`)(sb, CLUB_ID, document, () => {}, n => String(n), propietariosMap, profesionales);
  await api.cobrosBuscar();
  const html = document._n['cob-beneficiarios'].innerHTML;
  return [...html.matchAll(/class="liq-prof">([^<]*)</g)].map(m => m[1]);
}
// Los casos se ARMAN desde lo que hoy es pagable en R9: el universo cambia con cada cobro (el
// 21/09 se saldaron ACUÑA y SILQUITI y los casos fijos con ellos dejaron de valer). Cada caso
// toma un beneficiario real y le tipea lo que Valeria tipearía: apellido + primer nombre en los
// dos órdenes, sin tildes/Ñ, el DNI, la caballeriza con y sin espacios/acentos.
const sinDiacriticos = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const universo = await buscar('');
ok('B11a) hay universo pagable en R9 para armar los casos (≥ 10 tarjetas)', universo.length >= 10, `${universo.length}`);
const cardName = (tipo, id) => tipo === 'propietario' ? propietariosMap[id]?.nombre : `${profesionales[id].apellido}, ${profesionales[id].nombre}`;
// beneficiarios pagables reales (mismo criterio que cobrosBuscar) para elegir los casos
const { data: pagR9 } = await sb.from('liquidacion_detalle').select('beneficiario_tipo,beneficiario_id')
  .eq('reunion_id', R9).eq('estado_linea', 'impago').is('recibo_id', null).neq('beneficiario_tipo', 'club');
const idsPag = new Set((pagR9 || []).map(l => `${l.beneficiario_tipo}|${l.beneficiario_id}`));
const profPag = Object.values(profesionales).filter(p => idsPag.has(`profesional|${p.id}`));
const propPag = Object.values(propietariosMap).filter(p => idsPag.has(`propietario|${p.id}`));
const casos = [];
// (1) profesional con nombre compuesto: "APELLIDO PRIMER_NOMBRE", al revés, y sin diacríticos
const prof2 = profPag.find(p => (p.nombre || '').trim().includes(' ') && p.apellido) || profPag.find(p => p.apellido && p.nombre);
if (prof2) {
  const primer = prof2.nombre.trim().split(/\s+/)[0];
  casos.push([`${prof2.apellido} ${primer}`, cardName('profesional', prof2.id), 'apellido + primer nombre (orden del programa)']);
  casos.push([`${primer} ${prof2.apellido}`, cardName('profesional', prof2.id), 'primer nombre + apellido']);
  casos.push([sinDiacriticos(`${prof2.apellido} ${primer}`).toLowerCase(), cardName('profesional', prof2.id), 'sin tildes/Ñ, minúsculas']);
  if (prof2.documento_nro) casos.push([prof2.documento_nro, cardName('profesional', prof2.id), 'DNI']);
}
// (2) profesional con Ñ o tilde en apellido/nombre, tipeado sin ella
const profN = profPag.find(p => /[ÁÉÍÓÚÑáéíóúñ]/.test(`${p.apellido} ${p.nombre}`));
if (profN) casos.push([sinDiacriticos(profN.apellido), cardName('profesional', profN.id), 'apellido con Ñ/tilde, tipeado sin']);
// (3) propietarios con caballeriza vinculada: nombre exacto, sin acentos, sin espacios, un pedazo
const { data: vinc } = await sb.from('caballeriza_responsables').select('propietario_id, caballerizas(nombre)')
  .eq('rol', 'propietario').eq('activo', true).not('propietario_id', 'is', null);
const cabDe = id => (vinc || []).filter(v => v.propietario_id === id).map(v => v.caballerizas?.nombre).filter(Boolean);
let conCab = 0;
for (const p of propPag) {
  const cabs = cabDe(p.id).filter(n => n.toLowerCase() !== (p.nombre || '').toLowerCase());   // caballeriza ≠ nombre del provisorio
  if (!cabs.length) continue;
  const n = cabs[0];
  casos.push([n, p.nombre, 'caballeriza exacta']);
  if (/[ÁÉÍÓÚÑáéíóúñ]/.test(n)) casos.push([sinDiacriticos(n), p.nombre, 'caballeriza sin Ñ/tilde']);
  if (/\s/.test(n)) casos.push([n.replace(/\s+/g, ''), p.nombre, 'caballeriza sin espacios']);
  else if (n.length > 3) casos.push([n.split('').join(' '), p.nombre, 'caballeriza con espacios metidos ("P y P")']);
  casos.push([n.split(/\s+/).pop(), p.nombre, 'un pedazo de la caballeriza']);
  if (p.documento_nro) casos.push([p.documento_nro, p.nombre, 'DNI del propietario']);
  if (++conCab >= 3) break;
}
// (4) provisorio con nombre de caballeriza: un pedazo del nombre
const prov = propPag.find(p => !p.documento_nro && (p.nombre || '').split(/\s+/).some(w => w.length >= 4));
if (prov) casos.push([prov.nombre.split(/\s+/).filter(w => w.length >= 4).sort((a, b) => b.length - a.length)[0], prov.nombre, 'provisorio, su palabra más larga']);
ok('B11b) se armaron casos de los 4 tipos (compuesto, Ñ, caballeriza, provisorio)',
   casos.length >= 8 && !!prof2 && conCab >= 1, `${casos.length} casos; compuesto=${!!prof2} Ñ=${!!profN} caballerizas=${conCab} provisorio=${!!prov}`);
for (const [q, esperado, porque] of casos) {
  const got = await buscar(q);
  ok(`B11) q=${JSON.stringify(q)} → ${esperado}  [${porque}]`, got.includes(esperado), `→ ${got.join(' | ') || '∅'}`);
}
// B12) un apellido solo trae al que tiene plata y no a homónimos sin plata
if (prof2) {
  const got = await buscar(prof2.apellido);
  const homonimos = Object.values(profesionales).filter(p => p.apellido === prof2.apellido && !idsPag.has(`profesional|${p.id}`));
  ok(`B12) q=${JSON.stringify(prof2.apellido)} trae al pagable y no a los ${homonimos.length} homónimo(s) sin plata`,
     got.includes(cardName('profesional', prof2.id)) && homonimos.every(h => !got.includes(cardName('profesional', h.id))), got.join(' | '));
}
const gotSinCarrera = await buscar('');
ok('B13) sin q: el universo de R9 se lista entero (≥ 10 tarjetas)', gotSinCarrera.length >= 10, `${gotSinCarrera.length}`);
ok('B14) el matcheo no rompe la búsqueda por caballeriza previa (probe_cobros_caballeriza: benefSearch sigue en crudo)',
   extractFn(SRC, 'function benefSearch(tipo, id)').includes(".join(' ').toLowerCase()"));

for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  → ' + r.n : ''}`);
const fail = results.filter(r => r.s === '❌').length;
console.log(`\n${results.length - fail}/${results.length} checks OK${mutArg ? ` (mutante ${mutArg})` : ''}`);
process.exit(fail ? 1 : 0);
