/**
 * Probe — colores de mandil 1..16 (partidor-colors.js) contra el nomenclador
 * oficial que mandó Fede el 18/09/2026. Sin Supabase, sin browser. SOLO LECTURA.
 *
 * EL PEDIDO
 * ---------------------------------------------------------------------------
 * "Algunos salen mal en el programa a color". La paleta del 26/05 (234a833,
 * rotulada "SBARG") tenía 8 fondos y 7 números distintos del nomenclador:
 * 12 marrón (debe verde claro), 13 turquesa (bordó oscuro), 14 beige (bordó),
 * 15 verde limón (gris oscuro), 16 bordó (celeste claro), 11 gris medio/blanco
 * (gris claro/rojo), 6 negro/blanco (negro/amarillo), 7 naranja/blanco (negro).
 *
 * QUÉ VERIFICA
 * ---------------------------------------------------------------------------
 *   A) El archivo REAL (cargado con new Function, como lo carga la página):
 *      16 entradas, cada una con bg y fg hex de 6 dígitos; >16 cae al gris.
 *   B) NÚMERO (fg): exacto por clase — blanco #FFFFFF, negro #000000,
 *      amarillo (matiz 50–60°, L>45), rojo (matiz ±12°, S>70).
 *   C) FONDO (bg): por matiz/saturación/luminosidad en HSL, no por hex fijo,
 *      así un retoque de tono pasa y un color equivocado (marrón por verde,
 *      turquesa por bordó) no. "Claro/oscuro" se controla con L.
 *   D) Consumidores: programa-oficial-color.html y resultados.html cargan
 *      partidor-colors.js y ninguna pantalla trae otra tabla de 16 colores.
 *   E) Mutante documentado: la paleta de 234a833 tiene que dar rojo.
 *
 *   node tests/probe_mandil_colores.mjs
 *
 * Env: PARTIDOR_JS (ruta o URL del .js a probar; default el del repo).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

async function leer(src) {
  if (/^https?:\/\//.test(src)) {
    const r = await fetch(`${src}?v=${Date.now()}`);
    if (!r.ok) throw new Error(`GET ${src} → ${r.status}`);
    return r.text();
  }
  return readFileSync(src, 'utf8');
}
const SRC = await leer(process.env.PARTIDOR_JS || join(ROOT, 'partidor-colors.js'));

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

// El archivo tal cual, evaluado como en la página (script clásico → globals).
function cargar(src) {
  const w = {};
  new Function('window', src + '\nwindow.PARTIDOR_COLORS = PARTIDOR_COLORS; window.partidorColor = partidorColor; window.partidorChipHTML = partidorChipHTML;')(w);
  return w;
}
const { PARTIDOR_COLORS, partidorColor, partidorChipHTML } = cargar(SRC);

// ── color → HSL ─────────────────────────────────────────────────────────────
function hsl(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const v = parseInt(m[1], 16), r = (v >> 16 & 255) / 255, g = (v >> 8 & 255) / 255, b = (v & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: s * 100, l: l * 100 };
}
const hueIn = (h, a, b) => a <= b ? h >= a && h <= b : h >= a || h <= b;   // rango circular

// ── nomenclador (Fede, 18/09/2026) ──────────────────────────────────────────
// fondo: predicado HSL; numero: clase exacta.
const FONDO = {
  rojo:          c => hueIn(c.h, 350, 12) && c.s > 70 && c.l > 30 && c.l < 60,
  blanco:        c => c.l > 97 && c.s < 5,
  'azul marino': c => hueIn(c.h, 215, 250) && c.s > 45 && c.l < 40,
  amarillo:      c => hueIn(c.h, 48, 60) && c.s > 85 && c.l > 45,
  'verde oscuro':c => hueIn(c.h, 120, 165) && c.s > 45 && c.l < 30,
  negro:         c => c.l < 5,
  naranja:       c => hueIn(c.h, 15, 35) && c.s > 70 && c.l > 40,
  rosa:          c => hueIn(c.h, 320, 345) && c.s > 60 && c.l > 40,
  celeste:       c => hueIn(c.h, 185, 205) && c.s > 60 && c.l > 40 && c.l <= 60,
  violeta:       c => hueIn(c.h, 270, 300) && c.s > 40 && c.l < 45,
  'gris claro':  c => c.s < 5 && c.l > 65 && c.l < 85,
  'verde claro': c => hueIn(c.h, 110, 150) && c.s > 40 && c.l > 40 && c.l < 60,
  'bordó oscuro':c => hueIn(c.h, 350, 10) && c.s > 45 && c.l < 25,
  bordó:         c => hueIn(c.h, 350, 10) && c.s > 45 && c.l >= 25 && c.l < 40,
  'gris oscuro': c => c.s < 5 && c.l > 30 && c.l < 55,
  'celeste claro':c => hueIn(c.h, 180, 200) && c.s > 40 && c.l > 60,
};
const NUMERO = {
  blanco:   fg => fg.toUpperCase() === '#FFFFFF',
  negro:    fg => fg.toUpperCase() === '#000000',
  amarillo: fg => { const c = hsl(fg); return c && hueIn(c.h, 48, 60) && c.s > 85 && c.l > 45; },
  rojo:     fg => { const c = hsl(fg); return c && hueIn(c.h, 350, 12) && c.s > 70; },
};
const NOMENCLADOR = {
  1: ['rojo', 'blanco'],          2: ['blanco', 'negro'],        3: ['azul marino', 'blanco'],
  4: ['amarillo', 'negro'],       5: ['verde oscuro', 'blanco'], 6: ['negro', 'amarillo'],
  7: ['naranja', 'negro'],        8: ['rosa', 'negro'],          9: ['celeste', 'negro'],
 10: ['violeta', 'blanco'],      11: ['gris claro', 'rojo'],    12: ['verde claro', 'negro'],
 13: ['bordó oscuro', 'blanco'], 14: ['bordó', 'amarillo'],     15: ['gris oscuro', 'negro'],
 16: ['celeste claro', 'rojo'],
};

function evaluar(paleta) {
  const malFondo = [], malNumero = [];
  for (const [n, [fondo, numero]] of Object.entries(NOMENCLADOR)) {
    const c = paleta[n] || {};
    const hb = hsl(c.bg);
    if (!hb || !FONDO[fondo](hb)) malFondo.push(`${n}: ${c.bg} no es "${fondo}"${hb ? ` (h${hb.h.toFixed(0)} s${hb.s.toFixed(0)} l${hb.l.toFixed(0)})` : ''}`);
    if (!c.fg || !NUMERO[numero](c.fg)) malNumero.push(`${n}: ${c.fg} no es "${numero}"`);
  }
  return { malFondo, malNumero };
}

// ═══════════════════════════════ A — estructura ═════════════════════════════
const keys = Object.keys(PARTIDOR_COLORS).map(Number).sort((a, b) => a - b);
ok('A1) 16 entradas, 1..16', keys.length === 16 && keys.every((k, i) => k === i + 1), keys.join(','));
ok('A2) cada entrada tiene bg y fg hex de 6 dígitos',
  keys.every(k => /^#[0-9A-F]{6}$/i.test(PARTIDOR_COLORS[k].bg) && /^#[0-9A-F]{6}$/i.test(PARTIDOR_COLORS[k].fg)));
const f17 = partidorColor(17), f0 = partidorColor('x');
ok('A3) >16 y no-número caen al gris #CCCCCC / negro (sin error)',
  f17.bg === '#CCCCCC' && f17.fg === '#000000' && f0.bg === '#CCCCCC', JSON.stringify(f17));
ok('A4) partidorChipHTML: el blanco (2) lleva borde negro; los demás no',
  /border:1px solid #000/.test(partidorChipHTML(2)) && /border:none/.test(partidorChipHTML(1)));

// ═══════════════════════════════ B/C — nomenclador ══════════════════════════
const { malFondo, malNumero } = evaluar(PARTIDOR_COLORS);
ok('B) NÚMERO: los 16 coinciden con el nomenclador', malNumero.length === 0, malNumero.join(' | '));
ok('C) FONDO: los 16 coinciden con el nomenclador (matiz/sat/luz)', malFondo.length === 0, malFondo.join(' | '));
// Los que Fede vio mal, uno por uno (para que el rojo diga cuál):
for (const n of [6, 7, 11, 12, 13, 14, 15, 16]) {
  const [fondo, numero] = NOMENCLADOR[n];
  const c = PARTIDOR_COLORS[n] || {}, hb = hsl(c.bg);
  ok(`C${n}) mandil ${n} = ${fondo} / ${numero}`, !!hb && FONDO[fondo](hb) && NUMERO[numero](c.fg), `${c.bg} / ${c.fg}`);
}

// ═══════════════════════════════ D — consumidores ═══════════════════════════
const COLOR = readFileSync(join(ROOT, 'programa-oficial-color.html'), 'utf8');
const RES   = readFileSync(join(ROOT, 'resultados.html'), 'utf8');
ok('D1) programa-oficial-color.html carga partidor-colors.js y pinta el chip con partidorChipHTML',
  /<script src="partidor-colors\.js">/.test(COLOR) && /partidorChipHTML\(/.test(COLOR));
ok('D2) resultados.html carga partidor-colors.js y usa partidorColor',
  /<script src="partidor-colors\.js">/.test(RES) && /partidorColor\(/.test(RES));
// Ninguna otra tabla de 16 mandiles con hex propios en las pantallas de producción.
const otras = ['programa-oficial-color.html', 'resultados.html', 'programa-oficial.html', 'inscripciones.html', 'ratificacion.html', 'programa.html']
  .filter(f => /PARTIDOR_COLORS\s*=|16:\s*\{\s*bg:/.test(readFileSync(join(ROOT, f), 'utf8')));
ok('D3) ninguna pantalla define su propia tabla de colores de mandil', otras.length === 0, otras.join(', '));

// ═══════════════════════════════ E — mutante documentado ════════════════════
// La paleta del 26/05 (234a833), la que salía mal en el programa. Si el probe no
// la rechaza, no sirve.
const PALETA_234a833 = {
   1: { bg: '#D50000', fg: '#FFFFFF' },  2: { bg: '#FFFFFF', fg: '#000000' },  3: { bg: '#0047AB', fg: '#FFFFFF' },
   4: { bg: '#FFD400', fg: '#000000' },  5: { bg: '#009B3A', fg: '#FFFFFF' },  6: { bg: '#000000', fg: '#FFFFFF' },
   7: { bg: '#FF6A00', fg: '#FFFFFF' },  8: { bg: '#FF69B4', fg: '#000000' },  9: { bg: '#4FC3F7', fg: '#000000' },
  10: { bg: '#7B1FA2', fg: '#FFFFFF' }, 11: { bg: '#808080', fg: '#FFFFFF' }, 12: { bg: '#6D4C41', fg: '#FFFFFF' },
  13: { bg: '#00B8B8', fg: '#000000' }, 14: { bg: '#D8C3A5', fg: '#000000' }, 15: { bg: '#A4C400', fg: '#000000' },
  16: { bg: '#800020', fg: '#FFFFFF' },
};
const mut = evaluar(PALETA_234a833);
ok('E) la paleta del 26/05 (234a833) da rojo: 8 fondos y 7 números mal',
  mut.malFondo.length === 8 && mut.malNumero.length === 7,
  `fondos: ${mut.malFondo.map(s => s.split(':')[0]).join(',')} · números: ${mut.malNumero.map(s => s.split(':')[0]).join(',')}`);

// ═══════════════════════════════ resumen ════════════════════════════════════
console.log(results.map(x => `${x.s} ${x.t}${x.n ? `  (${x.n})` : ''}`).join('\n'));
const fallos = results.filter(x => x.s === '❌').length;
console.log(`\n${results.length - fallos}/${results.length} OK${fallos ? ` — ${fallos} FALLARON` : ''}`);
process.exit(fallos ? 1 : 0);
