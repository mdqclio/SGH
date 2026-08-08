#!/usr/bin/env node
/**
 * probe_pdf_inscriptos_layout.mjs — ¿entra R8 en UNA página A4 apaisada?
 *
 * No hay browser en este entorno (ver docs/SERVER.md), así que el probe modela
 * la altura del PDF leyendo los valores REALES del @media print de
 * inscripciones.html: column-count, column-gap, márgenes de @page y los
 * font-size / line-height / padding / border de cada pieza del bloque.
 *
 * El modelo es una aproximación, no un render. Es útil para comparar variantes
 * y para dar señal de "entra con margen" vs "está al filo"; el visto final es
 * imprimir de verdad. Los anchos de caracter son estimaciones de DM Sans y se
 * redondean para arriba, así que el resultado es pesimista a propósito.
 *
 * Uso:  node tests/probe_pdf_inscriptos_layout.mjs [--verbose]
 */
import { readFileSync } from 'node:fs';

const VERBOSE = process.argv.includes('--verbose');
const html = readFileSync(new URL('../inscripciones.html', import.meta.url), 'utf8');
const fx   = JSON.parse(readFileSync(new URL('./fixtures/r8_carreras.json', import.meta.url), 'utf8'));

const MM = 2.834646;           // 1mm en pt
const PX = 0.75;               // 1px en pt (CSS: 96px = 72pt)
const LH_NORMAL = 1.2;         // line-height: normal aproximado

// --- Leer los valores reales del CSS de impresión -------------------------
const printCss = html.slice(html.indexOf('@media print {'), html.indexOf('#auth-overlay {'));

function rule(sel) {
  const m = printCss.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`No se encontró la regla ${sel} en el @media print`);
  return m[1];
}
function prop(sel, name, fallback) {
  const m = rule(sel).match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`));
  if (!m) { if (fallback !== undefined) return fallback; throw new Error(`Falta ${name} en ${sel}`); }
  return m[1].trim();
}
const ptOf = (v) => {
  const m = String(v).match(/^([\d.]+)\s*(pt|px|mm)?$/);
  if (!m) throw new Error(`No se pudo parsear la medida "${v}"`);
  const n = parseFloat(m[1]);
  return m[2] === 'px' ? n * PX : m[2] === 'mm' ? n * MM : n;
};
const numOf = (v) => parseFloat(v);

// @page
const pageRule = printCss.match(/@page\s*\{([^}]*)\}/)[1];
const pageMm = (side) => parseFloat(pageRule.match(new RegExp(`margin-${side}\\s*:\\s*([\\d.]+)mm`))[1]);
const PAGE_W = 297 * MM, PAGE_H = 210 * MM;   // A4 apaisada
const contentW = PAGE_W - (pageMm('left') + pageMm('right')) * MM;
const contentH = PAGE_H - (pageMm('top') + pageMm('bottom')) * MM;

const COLS = parseInt(prop('.pi-cols', 'column-count'), 10);
const GAP  = ptOf(prop('.pi-cols', 'column-gap'));
const colW = (contentW - GAP * (COLS - 1)) / COLS;

// Piezas del bloque
const F_TITULO = ptOf(prop('.pi-titulo', 'font-size'));
const LH_TITULO = numOf(prop('.pi-titulo', 'line-height', String(LH_NORMAL)));
const F_COND = ptOf(prop('.pi-condiciones', 'font-size'));
const LH_COND = numOf(prop('.pi-condiciones', 'line-height', String(LH_NORMAL)));
const MT_COND = ptOf(prop('.pi-condiciones', 'margin-top', '0'));
let F_OFICIAL = 0, MT_OFICIAL = 0, hayOficial = false;
try { F_OFICIAL = ptOf(prop('.pi-oficial', 'font-size')); MT_OFICIAL = ptOf(prop('.pi-oficial', 'margin-top', '0')); hayOficial = true; } catch { /* sin etiqueta de categoría */ }
const F_NAME = ptOf(prop('.pi-spc-name', 'font-size'));
const LH_ROW = numOf(prop('.pi-row', 'line-height', String(LH_NORMAL)));
const F_FOOT = ptOf(prop('.pi-car-foot', 'font-size'));
const F_BANDA = ptOf(prop('.pi-banda-reabierta', 'font-size'));

// padding/border, en el orden en que aparecen en el shorthand
const padY = (sel, def = 0) => {
  const p = prop(sel, 'padding', null);
  if (!p) return def;
  const parts = p.split(/\s+/).map(ptOf);
  return parts[0] * 2;                        // top+bottom (shorthand de 1 o 2 valores)
};
const padX = (sel, def = 0) => {
  const p = prop(sel, 'padding', null);
  if (!p) return def;
  const parts = p.split(/\s+/).map(ptOf);
  return (parts.length > 1 ? parts[1] : parts[0]) * 2;
};
const HEAD_PAD_Y = padY('.pi-car-head'), HEAD_PAD_X = padX('.pi-car-head');
const HEAD_BORDER = 1 * PX * 2;
const BANDA_PAD_Y = padY('.pi-banda-reabierta');
const ROW_PAD_Y = padY('.pi-row');
const ROW_BORDER = 1 * PX;
const FOOT_PAD_Y = padY('.pi-car-foot'), FOOT_BORDER = 1 * PX;
const WRAP_MB = ptOf(prop('.pi-wrapper', 'margin-bottom'));

// Header y footer del documento
const DOC_HEAD = 14 * LH_NORMAL + 9 * LH_NORMAL + 2 * PX + 4 * PX + 2 * PX + 8 * PX;
const DOC_FOOT = 8 * PX + 2 * PX + 4 * PX + Math.max(3 * 7 * LH_NORMAL + 2 * 2 * PX, 35 * PX + 7 * LH_NORMAL + 2 * PX);

// --- Ancho de texto (estimación DM Sans, redondeada para arriba) ----------
const AVG_MIXED = 0.53;   // texto normal con espacios
const AVG_UPPER = 0.62;   // mayúsculas en bold
const linesFor = (text, fontSize, boxW, avg) => {
  if (!text) return 0;
  const charW = fontSize * avg;
  const maxChars = Math.max(1, Math.floor(boxW / charW));
  // wrap por palabra
  let lines = 1, len = 0;
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const add = len === 0 ? w.length : w.length + 1;
    if (len + add > maxChars) { lines++; len = w.length; } else { len += add; }
  }
  return lines;
};

// --- Reconstruir el texto de condición con el código real del template ----
const start = html.indexOf('  const SEXO_TXT =');
const end   = html.indexOf('  function formatBolsa(');
const tpl = new Function(`${html.slice(start, end)}\n return { buildCond, clampCond, COND_MAX_LINEAS };`)();
const { buildCond, clampCond, COND_MAX_LINEAS } = tpl;

// --- Altura de cada bloque ------------------------------------------------
const textW = colW - HEAD_PAD_X;
const bloques = fx.carreras.map(car => {
  const n = fx.inscriptos_por_turno[String(car.numero_turno)] || 0;
  if (!n) return null;
  const { cond, distancia, especial } = buildCond(car);
  const condTexto = (especial ? 'ESPECIAL ' : '')
    + clampCond(cond, distancia, especial ? 'ESPECIAL '.length : 0);

  const lTitulo = linesFor(`$150.000.- · TURNO ${car.numero_turno}`, F_TITULO, textW, AVG_UPPER);
  const lCond   = linesFor(condTexto, F_COND, textW, AVG_MIXED);
  const lOfic   = hayOficial ? linesFor('OFICIAL NO COMPUTABLE', F_OFICIAL, textW, AVG_UPPER) : 0;

  const head = HEAD_PAD_Y + HEAD_BORDER
    + lTitulo * F_TITULO * LH_TITULO
    + (lCond ? MT_COND + lCond * F_COND * LH_COND : 0)
    + (lOfic ? MT_OFICIAL + lOfic * F_OFICIAL * LH_NORMAL : 0);
  const banda = car.estado === 'reabierta' || car.estado === 'anulada'
    ? BANDA_PAD_Y + F_BANDA * LH_NORMAL : 0;
  const lista = n * (F_NAME * LH_ROW + ROW_PAD_Y + ROW_BORDER) - ROW_BORDER;
  const foot  = FOOT_PAD_Y + FOOT_BORDER + F_FOOT * LH_NORMAL;

  return { turno: car.numero_turno, n, lCond, condTexto, alto: head + banda + lista + foot + WRAP_MB };
}).filter(Boolean);

// --- Empaquetado: el browser fija una altura objetivo y llena en orden -----
// Los bloques son atómicos (break-inside: avoid), así que se busca la menor
// altura con la que el llenado secuencial entra en COLS columnas.
function alturaMinima(items, cols) {
  const alturas = items.map(b => b.alto);
  let lo = Math.max(...alturas), hi = alturas.reduce((a, b) => a + b, 0);
  const cabe = (H) => {
    let usadas = 1, actual = 0;
    for (const a of alturas) {
      if (actual + a > H + 1e-6) { usadas++; actual = a; } else { actual += a; }
      if (usadas > cols) return false;
    }
    return true;
  };
  while (hi - lo > 0.01) { const mid = (lo + hi) / 2; if (cabe(mid)) hi = mid; else lo = mid; }
  return hi;
}

const disponible = contentH - DOC_HEAD - DOC_FOOT;
const necesario  = alturaMinima(bloques, COLS);
const holgura    = disponible - necesario;

// --- Reporte --------------------------------------------------------------
console.log(`\nModelo de altura — R8, ${bloques.length} turnos, ${bloques.reduce((a, b) => a + b.n, 0)} caballos`);
console.log(`Layout: ${COLS} columnas de ${colW.toFixed(1)}pt · condición ${F_COND}pt · caballos ${F_NAME}pt${hayOficial ? ` · categoría ${F_OFICIAL}pt` : ''}\n`);
if (VERBOSE) {
  for (const b of bloques) {
    console.log(`  T${String(b.turno).padStart(2)}  ${String(b.n).padStart(2)} cab · cond ${b.lCond}L · ${b.alto.toFixed(1)}pt`);
    console.log(`        "${b.condTexto}"`);
  }
  console.log('');
}
console.log(`  alto de página util : ${disponible.toFixed(1)}pt`);
console.log(`  alto necesario      : ${necesario.toFixed(1)}pt  (columna más alta)`);
console.log(`  holgura             : ${holgura.toFixed(1)}pt  (${(holgura / disponible * 100).toFixed(1)}%)\n`);

// Se exige holgura real, no empate: el modelo es aproximado y el print móvil
// aplica sus propios márgenes.
const MIN_HOLGURA = 0.08;
if (holgura < 0) {
  console.error(`✗ DESBORDA a 2 páginas por ${(-holgura).toFixed(1)}pt\n`);
  process.exit(1);
}
if (holgura / disponible < MIN_HOLGURA) {
  console.error(`✗ Entra pero al filo (holgura < ${MIN_HOLGURA * 100}%) — sin margen para el print móvil\n`);
  process.exit(1);
}
const maxCond = Math.max(...bloques.map(b => b.lCond));
if (maxCond > COND_MAX_LINEAS) {
  console.error(`✗ Hay condiciones de ${maxCond} líneas (máx ${COND_MAX_LINEAS})\n`);
  process.exit(1);
}
// El corte tiene que caer en límite de palabra: nunca elipsis pegada a un fragmento
for (const b of bloques) {
  if (/[a-záéíóúñ]…/i.test(b.condTexto) && !/\s\S*…$/.test(b.condTexto)) {
    console.error(`✗ T${b.turno}: elipsis a mitad de palabra — "${b.condTexto}"\n`);
    process.exit(1);
  }
}
console.log(`✓ Entra en 1 página con ${(holgura / disponible * 100).toFixed(1)}% de holgura · condición máx ${maxCond} líneas\n`);
