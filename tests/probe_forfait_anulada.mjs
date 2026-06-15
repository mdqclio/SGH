// Probe: FORFAITS se renderiza en carreras ANULADAS en el programa impreso (ratificacion.html).
// Extrae renderBloqueCarrera + el loop bloquesHtml DEL ARCHIVO EN DISCO (post-fix, sin drift),
// los corre contra filas reales seedeadas en reunión 9998, y asserta el comportamiento.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../ratificacion.html', import.meta.url), 'utf8');

// --- brace-match extractor ---
function extractFn(text, startMarker) {
  const i = text.indexOf(startMarker);
  if (i < 0) throw new Error(`no encontrado: ${startMarker}`);
  const open = text.indexOf('{', i);
  let depth = 0, j = open;
  for (; j < text.length; j++) {
    if (text[j] === '{') depth++;
    else if (text[j] === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return text.slice(i, j);
}
function extractLoop(text) {
  const i = text.indexOf('const bloquesHtml = allCars.map');
  if (i < 0) throw new Error('loop bloquesHtml no encontrado');
  const end = text.indexOf("}).join('');", i);
  if (end < 0) throw new Error('cierre del loop no encontrado');
  return text.slice(i, end + "}).join('');".length);
}

const renderFnSrc = extractFn(src, 'function renderBloqueCarrera');
const loopSrc = extractLoop(src);

// --- datos reales seedeados en 9998 (carrera anulada) ---
const CAR_ID = '1221739e-2a4c-4ae0-a3d6-205bd2fc161a';
const rows = [
  { carrera_id: CAR_ID, estado: 'ratificado',   certificado_correr: true, spcs: { nombre: 'AFRICUM',       sexo: 'macho' } },
  { carrera_id: CAR_ID, estado: 'forfait',       certificado_correr: true, spcs: { nombre: 'ALIADO SCAT',   sexo: 'macho' } },
  { carrera_id: CAR_ID, estado: 'mal_inscrito',  certificado_correr: true, spcs: { nombre: 'AMIGUITO JESUS', sexo: 'macho' } },
];
const allCars = [{ id: CAR_ID, estado: 'anulada', condicion_sexo: 'machos', tipo_pista: 'arena',
  bolsa_total: 0, distribucion_premios: null, numero_turno: 1, hora_estimada: null, categorias_carrera: null }];
const inscsByCarrera = new Map([[CAR_ID, rows]]);

// --- harness: stubs de helpers que renderBloqueCarrera no necesita para el assert ---
const harness = `
  const calcPremiosConPiso = () => ({ bolsaEfectiva: 0 });
  const formatBolsa = () => '';
  const buildCondAbr = () => '';
  ${renderFnSrc}
  let totalRatificados = 0;
  ${loopSrc}
  return bloquesHtml;
`;
const run = new Function('allCars', 'inscsByCarrera', harness);
const html = run(allCars, inscsByCarrera);

// --- asserts ---
const checks = [
  ['banda Anulada presente',        /pi-banda-anulada/.test(html)],
  ['seccion FORFAITS presente',     /pi-forfaits-h[^>]*>FORFAITS/.test(html)],
  ['forfait ALIADO SCAT en FORFAITS', /pi-forfait-row[^>]*>ALIADO SCAT/.test(html)],
  ['ratificado AFRICUM en lista',   /pi-spc-name[^>]*>(?:&bull;|•)?\s*AFRICUM/.test(html) || /AFRICUM/.test(html.split('pi-forfaits')[0])],
  ['mal_inscrito AMIGUITO JESUS ausente', !/AMIGUITO JESUS/.test(html)],
  ['forfait NO duplicado en lista principal', (html.split('pi-forfaits')[0].match(/ALIADO SCAT/g) || []).length === 0],
];

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${name}`);
  if (!pass) ok = false;
}
console.log(ok ? '\nPROBE VERDE — todos los asserts pasan' : '\nPROBE ROJO');
process.exit(ok ? 0 : 1);
