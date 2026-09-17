/**
 * Probe — número de turno en el encabezado del PDF de la carta de llamado
 * (carta-llamados.html, renderPrint). Código real. SOLO LECTURA sobre la base.
 *
 * EL PEDIDO (Fede, 17/09/2026)
 * ---------------------------------------------------------------------------
 * La pantalla decía "TURNO 1 — Condición: …" y el PDF arrancaba directo con la
 * condición. El número había estado un día en el PDF (86ec3cd, 19/05) y se
 * perdió en el rediseño del 20/05 (5951c1a): `turnoLabel`/`headText` quedaron
 * calculados y sin usar. Relevamiento y medición de ancho:
 * docs/diagnosticos/2026-09-17_carta-llamados-pdf-numero-turno.md (rama reports).
 *
 * QUÉ VERIFICA
 * ---------------------------------------------------------------------------
 *   A) Texto: el título lleva `TURNO ${c.numero_turno} &mdash;`; renderPrint ya
 *      no menciona numero_carrera_programa ni el código muerto (headText…).
 *   B) renderPrint() REAL corrida contra R9 (11 turnos, reunión ya ratificada):
 *      cada `.p-head-titulo` empieza con "TURNO N — " con el numero_turno de la
 *      DB, en orden. Caso discriminante: R9 T3 tiene numero_carrera_programa=7
 *      → el PDF tiene que decir TURNO 3, no 7 ni "CARRERA 7 (TURNO 3)".
 *   C) Ancho, con Chromium headless y el CSS de impresión REAL del archivo
 *      (bloque @media print extraído por balance de llaves) sobre el HTML que
 *      produjo B, a 186mm (A4 − 2×12mm de @page), con métricas de Arial
 *      (Liberation Sans por fontconfig; hay un canario que lo comprueba):
 *        - ningún título desborda (scrollWidth ≤ clientWidth);
 *        - exactamente 4 títulos de R9 pasan a 2 líneas (T5–T8: 49–57 chars +
 *          bono al ganador) y ninguno a 3. El diagnóstico decía 2 porque su mock
 *          escribía el bono como "$ 250.000"; formatMonto real da "$250.000,00";
 *        - en ESOS cuatro, y en todos, el chip de distancia NO se empuja: conserva
 *          su ancho natural (mismo chip con título de una letra), queda en una
 *          línea, dentro de la caja, y el título termina antes del chip.
 *      Deja un PNG del bloque impreso para mirarlo.
 *
 * PATRÓN (tests/README.md § "Browser NO disponible" + docs/SERVER.md "Chromium
 * headless SÍ corre"): la lógica se extrae del HTML y se corre tal cual; el
 * browser es sólo para la geometría. Nada se reimplementa acá.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_carta_numero_turno.mjs [dir_salida_png]
 *
 * Env opcionales: CARTA_HTML (ruta o URL del HTML a probar; default el del repo),
 * CHROMIUM_LIBS (default ~/chromium-libs/usr/lib/x86_64-linux-gnu),
 * CHROME_HEADLESS_SHELL (binario; default el de ~/.cache/ms-playwright).
 */

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }

const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const R9_ID   = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9';   // Reunión 9 — Dolores 20/09/2026 (ratificada el 14/09)

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT  = process.argv[2] || join(tmpdir(), 'probe_carta_numero_turno');
mkdirSync(OUT, { recursive: true });

async function leerHtml() {
  const src = process.env.CARTA_HTML || join(HERE, '..', 'carta-llamados.html');
  if (/^https?:\/\//.test(src)) {
    const r = await fetch(`${src}${src.includes('?') ? '&' : '?'}v=${Date.now()}`);
    if (!r.ok) throw new Error(`GET ${src} → ${r.status}`);
    return r.text();
  }
  return readFileSync(src, 'utf8');
}
const CARTA = await leerHtml();

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

// ── extracción por ancla (balance de llaves desde la llave final de la firma) ──
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
// El bloque INTERNO de `@media print {` (el que tiene .p-carrera-*), sin la
// envoltura, para aplicarlo como CSS normal en el mock.
function extractPrintCss(src) {
  // Hay tres `@media print {` en el archivo; el del PDF es el que abre con `html, body, #print-only`.
  const i = src.indexOf('@media print {\n      html, body, #print-only');
  if (i < 0) throw new Error('no encontré el @media print del PDF');
  const bloque = extractFn(src.slice(i), '@media print {');
  return bloque.replace(/^@media print \{/, '').replace(/\}\s*$/, '');
}

const RENDER_SRC = extractFn(CARTA, 'function renderPrint() {');
const FORMAT_SRC = extractFn(CARTA, 'function formatMonto(num) {');
const PRINT_CSS  = extractPrintCss(CARTA);

// repartoDisplay REAL, de premios-utils.js (igual que en la página).
const oraculo = {};
new Function('window', readFileSync(join(HERE, '..', 'premios-utils.js'), 'utf8'))(oraculo);
const { repartoDisplay } = oraculo;

const decode = s => s.replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// ═══════════════════════════════ A — texto ══════════════════════════════════
ok('A1) tituloHtml lleva `TURNO ${c.numero_turno} &mdash;` adelante',
  /const tituloHtml = `TURNO \$\{c\.numero_turno\} &mdash; /.test(RENDER_SRC));
const RENDER_CODE = RENDER_SRC.replace(/^\s*\/\/.*$/gm, '');   // sin comentarios
ok('A2) renderPrint no usa numero_carrera_programa (código, no comentarios)', !RENDER_CODE.includes('numero_carrera_programa'));
ok('A3) sin código muerto (turnoLabel / headText / headParts / catLabel)',
  !/turnoLabel|headText|headParts|catLabel/.test(RENDER_CODE));

// ═══════════════════════════════ B — renderPrint real vs DB ═════════════════
const [{ data: r, error: er }, { data: cars, error: ec }, { data: cats, error: ek }, { data: club, error: eu }] = await Promise.all([
  sb.from('reuniones').select('*, hipodromos(nombre,sigla,localidad)').eq('id', R9_ID).single(),
  sb.from('carreras').select('*').eq('reunion_id', R9_ID).order('numero_turno'),
  sb.from('categorias_carrera').select('id,nombre,codigo,simbolo,color_hex').eq('club_id', CLUB_ID).eq('activo', true).order('orden_display'),
  sb.from('clubs').select('logo_url, nombre').eq('id', CLUB_ID).single(),
]);
for (const [q, e] of [['reuniones', er], ['carreras', ec], ['categorias', ek], ['clubs', eu]]) {
  if (e) { console.error(`[${q}]`, e); throw e; }
}
ok('B0) R9 tiene 11 turnos en la DB', cars.length === 11, `${cars.length}`);
const conPrograma = cars.filter(c => c.numero_carrera_programa != null && c.numero_carrera_programa !== c.numero_turno);
ok('B1) hay turnos con numero_carrera_programa ≠ numero_turno (caso discriminante)',
  conPrograma.length > 0, conPrograma.map(c => `T${c.numero_turno}→C${c.numero_carrera_programa}`).join(' '));

function correrRenderPrint() {
  const nodos = {};
  const document = { getElementById: id => (nodos[id] ||= { id, innerHTML: '' }) };
  const run = new Function('document', 'reunion', 'carreras', 'categorias', 'clubData', 'condPista', 'repartoDisplay', `
    ${FORMAT_SRC}
    ${RENDER_SRC}
    renderPrint();
  `);
  run(document, r, cars, cats, club, null, repartoDisplay);
  return nodos['print-only'].innerHTML;
}
const PRINT_HTML = correrRenderPrint();
// Sin logo externo: el mock no tiene red y el <img> roto no cambia la geometría de las cajas.
const PRINT_HTML_SIN_LOGO = PRINT_HTML.replace(/<img [^>]*class="p-doc-logo"[^>]*>/, '<div class="p-doc-logo-fallback">HDO</div>');

const titulos = [...PRINT_HTML.matchAll(/<div class="p-head-titulo">([\s\S]*?)<\/div>/g)].map(m => decode(m[1]));
ok('B2) un título por carrera', titulos.length === cars.length, `${titulos.length} títulos / ${cars.length} carreras`);
const malos = cars.map((c, i) => ({ c, t: titulos[i] })).filter(({ c, t }) => !t?.startsWith(`TURNO ${c.numero_turno} — `));
ok('B3) cada título empieza con "TURNO <numero_turno> — " en orden de DB', malos.length === 0,
  malos.map(({ c, t }) => `T${c.numero_turno}: "${t}"`).join(' | '));
const t3 = cars.find(c => c.numero_turno === 3);
const tit3 = titulos[cars.indexOf(t3)];
ok('B4) R9 T3 (numero_carrera_programa=7) dice TURNO 3, no 7',
  t3?.numero_carrera_programa === 7 && tit3?.startsWith('TURNO 3 — ') && !/CARRERA 7|TURNO 7/.test(tit3), `"${tit3}"`);
const cond3 = t3?.condicion_handicap || t3?.nombre || '';
ok('B5) después del número viene la condición tal cual', tit3?.startsWith(`TURNO 3 — ${cond3}`), `"${cond3}"`);
ok('B6) el caption sigue siendo la categoría, no el número', /<div class="p-carrera-caption">CARRERA OFICIAL/.test(PRINT_HTML));

// ═══════════════════════════════ C — ancho, Chromium ════════════════════════
function headlessShell() {
  if (process.env.CHROME_HEADLESS_SHELL) return process.env.CHROME_HEADLESS_SHELL;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-')).sort() : [];
  if (!dirs.length) throw new Error('No hay chromium_headless_shell en ' + cache);
  return join(cache, dirs.at(-1), 'chrome-headless-shell-linux64', 'chrome-headless-shell');
}
const LIBS = process.env.CHROMIUM_LIBS || join(homedir(), 'chromium-libs', 'usr', 'lib', 'x86_64-linux-gnu');

// Mock: el CSS de impresión real + el HTML real, a 186mm. El control es el mismo
// chip con un título de una letra: ése es su ancho "natural".
const mock = `<!doctype html><html><head><meta charset="utf-8"><style>
  ${PRINT_CSS}
  html,body{margin:0;background:#fff}
  /* El CSS real oculta todo lo que no sea #print-only: el control y el canario van adentro. */
  #print-only{ display:block; width:186mm; padding:6mm; box-sizing:content-box; font-family:Arial,Helvetica,sans-serif; color:#000; font-size:11px; }
  #control{ margin-top:12mm; border-top:2px dashed #999; padding-top:4mm; }
  #canario{ position:absolute; left:-9999px; top:0; font:800 10pt Arial; white-space:nowrap; }
</style></head><body>
<div id="print-only">
  <div id="real">${PRINT_HTML_SIN_LOGO}</div>
  <div id="control">${PRINT_HTML_SIN_LOGO.replace(/<div class="p-head-titulo">[\s\S]*?<\/div>/g, '<div class="p-head-titulo">X</div>')}</div>
  <span id="canario">TURNO 1 — Todo caballo 3 años perdedor. | BONO de $ 250.000 al ganador</span>
</div>
</body></html>`;

let geo = null, canarioPx = null;
try {
  const browser = await chromium.launch({
    headless: true, executablePath: headlessShell(),
    env: { ...process.env, LD_LIBRARY_PATH: [LIBS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 2 });
  await page.setContent(mock, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.fonts.ready);
  canarioPx = await page.evaluate(() => document.getElementById('canario').getBoundingClientRect().width);
  geo = await page.evaluate(() => {
    const medir = root => [...root.querySelectorAll('.p-carrera-wrap')].map(w => {
      const t = w.querySelector('.p-head-titulo'), d = w.querySelector('.p-head-dist'), box = w.querySelector('.p-carrera-box');
      const tr = t.getBoundingClientRect(), dr = d.getBoundingClientRect(), br = box.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(t).lineHeight);
      const range = document.createRange(); range.selectNodeContents(t);
      const rects = [...range.getClientRects()];
      return {
        texto: t.textContent.trim(),
        lineas: Math.round(tr.height / lh),
        overflow: t.scrollWidth > t.clientWidth + 1,
        textoRight: rects.length ? Math.max(...rects.map(x => x.right)) : tr.left,
        dist: d.textContent.trim(), distW: dr.width, distH: dr.height, distLeft: dr.left, distRight: dr.right,
        distFont: parseFloat(getComputedStyle(d).fontSize),
        boxRight: br.right,
      };
    });
    return { real: medir(document.getElementById('real')), control: medir(document.getElementById('control')) };
  });
  await page.locator('#real').screenshot({ path: join(OUT, 'carta_r9_print.png') });
  await browser.close();
} catch (e) {
  console.error('[chromium]', e.message.split('\n')[0]);
}

ok('C0) Chromium headless corrió (libs en CHROMIUM_LIBS / ~/chromium-libs)', !!geo);
if (geo) {
  // Canario de métrica: Liberation Sans/Arial a 10pt 800 da 465px por @font-face
  // (diagnóstico) y 475px vía fontconfig (Chromium engrosa el 800 sobre la Bold);
  // DejaVu Sans —el fallback si fonts-liberation no está— da ~559px y cambia
  // cuántos títulos envuelven. Sin Arial el conteo de C3 no significa nada.
  ok('C1) métricas de Arial (Liberation Sans instalada): canario 470±8px', Math.abs(canarioPx - 470) <= 8, `${canarioPx.toFixed(1)}px`);

  const { real, control } = geo;
  ok('C2) ninguna caja desborda', real.every(g => !g.overflow), real.filter(g => g.overflow).map(g => g.texto).join(' | '));
  const dosLineas = real.map((g, i) => ({ g, c: cars[i] })).filter(({ g }) => g.lineas >= 2);
  // El diagnóstico (mock con "$ 250.000") daba 2; con el formatMonto real ("$250.000,00",
  // 2 chars más) son 4: T5–T8, los cuatro de ≥49 chars con bono. Ninguno a 3 líneas.
  ok('C3) exactamente 4 títulos de R9 pasan a 2 líneas: T5, T6, T7 y T8; ninguno a 3',
    dosLineas.length === 4 && dosLineas.every(({ c }) => [5, 6, 7, 8].includes(c.numero_turno)) && real.every(g => g.lineas <= 2),
    real.map((g, i) => `T${cars[i].numero_turno}:${g.lineas}`).join(' '));

  const empujados = real.map((g, i) => {
    const nat = control[i].distW;
    const problemas = [];
    if (Math.abs(g.distW - nat) > 0.5)               problemas.push(`ancho ${g.distW.toFixed(1)} vs natural ${nat.toFixed(1)}`);
    if (g.distH > g.distFont * 2)                    problemas.push(`chip a más de una línea (${g.distH.toFixed(1)}px)`);
    if (g.distRight > g.boxRight - 8 * 96 / 72 + 1)   problemas.push(`chip fuera del padding (right ${g.distRight.toFixed(1)} > ${(g.boxRight - 8 * 96 / 72).toFixed(1)})`);
    if (g.textoRight > g.distLeft - 10 * 96 / 72 + 1) problemas.push(`título pisa el gap del chip (${g.textoRight.toFixed(1)} > ${(g.distLeft - 10 * 96 / 72).toFixed(1)})`);
    return { t: cars[i].numero_turno, lineas: g.lineas, problemas };
  }).filter(x => x.problemas.length);
  ok('C4) el chip de distancia no se empuja en ninguna carrera (ancho natural, 1 línea, dentro de la caja, título termina antes del gap)',
    empujados.length === 0, empujados.map(x => `T${x.t}: ${x.problemas.join('; ')}`).join(' | '));
  const dos = real.map((g, i) => ({ g, t: cars[i].numero_turno })).filter(({ g }) => g.lineas === 2);
  ok('C5) en los títulos a 2 líneas el chip conserva el ancho natural',
    dos.length === 4 && dos.every(({ g, t }) => Math.abs(g.distW - control[cars.findIndex(c => c.numero_turno === t)].distW) <= 0.5),
    dos.map(({ g, t }) => `T${t}: chip ${g.distW.toFixed(1)}px`).join(' | '));
  console.log(`\nPNG del bloque impreso: ${join(OUT, 'carta_r9_print.png')}`);
}

// ═══════════════════════════════ resumen ════════════════════════════════════
console.log('\n' + results.map(x => `${x.s} ${x.t}${x.n ? `  (${x.n})` : ''}`).join('\n'));
const fallos = results.filter(x => x.s === '❌').length;
console.log(`\n${results.length - fallos}/${results.length} OK${fallos ? ` — ${fallos} FALLARON` : ''}`);
process.exit(fallos ? 1 : 0);
