#!/usr/bin/env node
/**
 * probe_recibo_una_hoja.mjs — recibo de Pagos: ORIGINAL y DUPLICADO en una hoja (21/09/2026)
 *
 * Valeria: "salen en dos páginas… ¿no lo querés hacer en una sola hoja? yo lo corto por la mitad".
 * Plan y medidas: docs/diagnosticos/2026-09-21_plan-recibo-una-hoja.md (reports).
 *
 * Parte 1 — SIN browser (código real extraído de liquidaciones.html):
 *   CSS de impresión: la copia ya no tiene break-after:page y sí break-inside:avoid; el pie sigue
 *   atómico; body margin:0; no vuelve el min-height:100vh / margin-top:auto del bug del 28/08;
 *   existe .recibo-corte. HTML real de imprimirReciboCobro (recibo real, Supabase con secret key):
 *   2 copias, 1 corte entre las dos, total + Retira + firma dentro del pie en las dos copias.
 * Parte 2 — CON Chromium (se saltea con aviso si no está ~/chromium-libs o el headless shell):
 *   23/09 — corte a la mitad (Valeria corta la hoja por la mitad): la 1ª copia lleva min-height en mm
 *   para que .recibo-corte caiga a ~133,5 mm (mitad de 267): 1h y 3a'/3d/3e.
 *   tests/render_recibo_pdf.mjs sobre un recibo real: 4 líneas → 1 página; 9 → 1; 10 y 12 → 2 páginas;
 *   40 líneas → ≥ 3 páginas. La verificación de que el duplicado sale ENTERO en la hoja 2 es
 *   visual: mirar <out>/recibo_<n>_x12_pdf_p2.png.
 *
 * MUTANTES (`--mutante=<nombre>` / `--mutantes`):
 *   M1 break_after_page   vuelve el break-after:page a la copia          → 1a (+ 2 páginas con 4 líneas si hay Chromium)
 *   M2 sin_avoid_copia    la copia pierde break-inside:avoid             → 1b
 *   M3 sin_corte          se quita el div .recibo-corte del HTML          → 2b
 *   M4 firma_fuera_pie    la firma sale del .recibo-pie                    → 2c
 *   M5 vuelve_100vh       min-height:100vh en la copia (bug 28/08)         → 1d
 *   M6 sin_mitad          se quita el min-height de la 1ª copia (23/09)    → 1h, 3a', 3d
 *   M7 mitad_en_ambas     el min-height también en el duplicado            → 1h (y 3d: 9 líneas pasan a 2 hojas)
 *   M8 mitad_en_vh        min-height:50vh en vez de mm                     → 1h
 *
 * Uso:
 *   set -a; . ./.env; set +a; export LD_LIBRARY_PATH=$HOME/chromium-libs/usr/lib/x86_64-linux-gnu
 *   node tests/probe_recibo_una_hoja.mjs [numero_recibo]      # default: el recibo con más líneas de Dolores
 *   node tests/probe_recibo_una_hoja.mjs --mutantes
 *   LIQUIDACIONES_HTML=https://sigh.com.ar/liquidaciones.html node tests/probe_recibo_una_hoja.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

const MUTANTES = {
  break_after_page: ["      .recibo-copia { width: 100%; box-sizing: border-box; break-inside: avoid; page-break-inside: avoid; }",
                     "      .recibo-copia { width: 100%; box-sizing: border-box; break-inside: avoid; page-break-inside: avoid; }\n      .recibo-copia:not(:last-child) { break-after: page; page-break-after: always; }"],
  sin_avoid_copia:  ["      .recibo-copia { width: 100%; box-sizing: border-box; break-inside: avoid; page-break-inside: avoid; }",
                     "      .recibo-copia { width: 100%; box-sizing: border-box; }"],
  sin_corte:        ["copia('ORIGINAL') + '<div class=\"recibo-corte\"></div>' + copia('DUPLICADO')", "copia('ORIGINAL') + copia('DUPLICADO')"],
  firma_fuera_pie:  ["      ${esTransfer?'':firma}\n    </div>\n  </div>`;", "    </div>\n      ${esTransfer?'':firma}\n  </div>`;"],
  vuelve_100vh:     ["      .recibo-copia { width: 100%; box-sizing: border-box; break-inside: avoid; page-break-inside: avoid; }",
                     "      .recibo-copia { width: 100%; box-sizing: border-box; break-inside: avoid; page-break-inside: avoid; min-height: 100vh; display: flex; flex-direction: column; }"],
  sin_mitad:        ["      .recibo-copia:first-child { min-height: 127.5mm; }\n", ""],
  mitad_en_ambas:   ["      .recibo-copia:first-child { min-height: 127.5mm; }", "      .recibo-copia + .recibo-corte + .recibo-copia, .recibo-copia:first-child { min-height: 127.5mm; }"],
  mitad_en_vh:      ["      .recibo-copia:first-child { min-height: 127.5mm; }", "      .recibo-copia:first-child { min-height: 50vh; }"],
};
const args = process.argv.slice(2);
const mutArg = args.find(a => a.startsWith('--mutante='))?.split('=')[1];
const reciboArg = args.find(a => /^\d+$/.test(a));
if (args.includes('--mutantes')) {
  let vivos = 0;
  for (const m of Object.keys(MUTANTES)) {
    const r = spawnSync(process.execPath, [SELF, `--mutante=${m}`, ...(reciboArg ? [reciboArg] : [])], { encoding: 'utf8', env: process.env });
    const murio = r.status !== 0; if (!murio) vivos++;
    const fallos = (r.stdout.match(/^❌ .*$/gm) || []);
    console.log(`${murio ? '💀' : '🧟'} mutante ${m.padEnd(17)} → ${murio ? `muerto (${fallos.length} assert(s))` : 'VIVO — el probe no lo detecta'}`);
    fallos.slice(0, 3).forEach(f => console.log('     ' + f));
    if (murio && !fallos.length) console.log('     ' + (r.stderr || r.stdout).trim().split('\n').slice(-2).join(' | '));
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
  if (!SRC.includes(de)) { console.error(`el mutante ${mutArg} no aplica: no está ${JSON.stringify(de).slice(0, 90)}`); process.exit(2); }
  SRC = SRC.replace(de, a);
  console.log(`⚠ MUTANTE ${mutArg} aplicado`);
}
const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
function extractFn(src, firma) {
  const i = src.indexOf(firma); if (i < 0) throw new Error('no encontré: ' + firma);
  let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  throw new Error('no pude cerrar: ' + firma);
}

// ═══ Parte 1a–1e: CSS de impresión ═══
const printCss = SRC.slice(SRC.indexOf('@media print {'), SRC.indexOf('@page { size: A4'));
const regla = sel => { const m = printCss.match(new RegExp(`\\n\\s*${sel.replace(/[.:()]/g, '\\$&')}\\s*\\{([^}]*)\\}`)); return m ? m[1] : null; };
const copia = regla('.recibo-copia') || '';
ok('1a) .recibo-copia NO tiene break-after:page (ni una regla :not(:last-child) que lo ponga)',
   !/break-after\s*:\s*page|page-break-after\s*:\s*always/.test(printCss.replace(/\/\*[\s\S]*?\*\//g, '')), copia.trim());
ok('1b) .recibo-copia tiene break-inside:avoid + page-break-inside:avoid (atómica)', /break-inside\s*:\s*avoid/.test(copia) && /page-break-inside\s*:\s*avoid/.test(copia));
const pie = regla('.recibo-pie') || '';
ok('1c) .recibo-pie sigue con break-inside:avoid (fix 28/08)', /break-inside\s*:\s*avoid/.test(pie) && /page-break-inside\s*:\s*avoid/.test(pie));
ok('1d) no vuelve el bug del 28/08: la copia no tiene min-height:100vh ni flex, la firma no tiene margin-top:auto',
   !/min-height\s*:\s*100vh/.test(copia) && !/display\s*:\s*flex/.test(copia) && !/margin-top\s*:\s*auto/.test(regla('.recibo-firma') || ''));
ok('1e) body en print sigue con margin:0 (fix 28/08)', /body\s*\{[^}]*margin\s*:\s*0/.test(printCss));
const corte = regla('.recibo-corte') || '';
ok('1f) existe .recibo-corte: punteada, fina y discreta (1px dashed, gris), con margen vertical', /1px\s+dashed\s+#[0-9a-f]{3,6}/i.test(corte) && /margin\s*:\s*\d+mm/.test(corte));
ok('1g) @page A4 con margen en mm', /@page\s*\{\s*size:\s*A4;\s*margin:\s*\d+mm/.test(SRC));
// 23/09 — corte a la mitad: min-height en mm SÓLO en la primera copia (el duplicado, alto natural)
const reglasCopia = [...printCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\n\s*([^{}\n]*\.recibo-copia[^{}\n]*)\{([^}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));
const conMin = reglasCopia.filter(r => /min-height/.test(r.body));
ok('1h) corte a la mitad: UNA regla con min-height, selector .recibo-copia:first-child solo, valor en mm (120–135); nada en vh ni en el duplicado',
   conMin.length === 1 && conMin[0].sel === '.recibo-copia:first-child' && (() => { const v = conMin[0].body.match(/min-height\s*:\s*([\d.]+)mm/); return !!v && +v[1] >= 120 && +v[1] <= 135; })()
   && !reglasCopia.some(r => /vh/.test(r.body)), conMin.map(r => `${r.sel} {${r.body.trim()}}`).join(' | ') || 'sin min-height');

// ═══ Parte 2: el HTML real de imprimirReciboCobro sobre un recibo real ═══
let reciboRow;
if (reciboArg) ({ data: reciboRow } = await sb.from('recibos').select('*').eq('club_id', CLUB_ID).eq('numero_recibo', +reciboArg).maybeSingle());
else {
  const { data: rs } = await sb.from('recibos').select('*').eq('club_id', CLUB_ID).eq('estado', 'emitido').order('emitido_at', { ascending: false }).limit(60);
  let best = null, bestN = -1;
  for (const r of rs || []) { const { count } = await sb.from('liquidacion_detalle').select('id', { count: 'exact', head: true }).eq('recibo_id', r.id); if ((count || 0) > bestN) { best = r; bestN = count || 0; } }
  reciboRow = best;
}
if (!reciboRow) throw new Error('no hay recibo para probar');
const benefId = reciboRow.propietario_id || reciboRow.profesional_id;
const benefTipo = reciboRow.propietario_id ? 'propietario' : 'profesional';
const { data: benef } = benefTipo === 'propietario' ? await sb.from('propietarios').select('nombre').eq('id', benefId).single() : await sb.from('profesionales').select('nombre,apellido').eq('id', benefId).single();
const cobBenef = { tipo: benefTipo, id: benefId, nombre: benefTipo === 'propietario' ? benef.nombre : `${benef.apellido}, ${benef.nombre}` };
const { data: lns } = await sb.from('liquidacion_detalle').select('id').eq('recibo_id', reciboRow.id);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const nodos = {}; const document = { getElementById: id => (nodos[id] ||= { innerHTML: '' }) };
const src = [SRC.slice(SRC.indexOf('const ROL_POR_BENEFICIARIO'), SRC.indexOf('\n', SRC.indexOf('const ROL_POR_BENEFICIARIO'))),
  extractFn(SRC, 'function rolDeLinea(l)'), extractFn(SRC, 'function escapeHtml(s)'), extractFn(SRC, 'async function imprimirReciboCobro(recibo, lineaIds, opts)')].join('\n\n');
let printed = 0;
await new AsyncFunction('sb', 'CLUB_ID', 'document', 'window', 'fmt', 'cobBenef', 'precargarLogo', 'recibo', 'lineaIds',
  `${src}\n await imprimirReciboCobro(recibo, lineaIds, {});`)(sb, CLUB_ID, document, { print: () => { printed++; } }, n => '$' + Number(n).toFixed(2), cobBenef, async () => {}, reciboRow, (lns || []).map(l => l.id));
const html = nodos['recibo-print'].innerHTML;
const copias = html.split('<div class="recibo-copia">').slice(1);
ok(`2a) recibo N° ${reciboRow.numero_recibo} (${cobBenef.nombre}, ${(lns || []).length} línea(s)): un solo window.print(), 2 copias ORIGINAL y DUPLICADO`,
   printed === 1 && copias.length === 2 && /ORIGINAL/.test(copias[0]) && /DUPLICADO/.test(copias[1]));
const iOrig = html.indexOf('ORIGINAL'), iCorte = html.indexOf('<div class="recibo-corte"></div>'), iDup = html.indexOf('DUPLICADO');
ok('2b) hay exactamente UN .recibo-corte, entre ORIGINAL y DUPLICADO', (html.match(/class="recibo-corte"/g) || []).length === 1 && iOrig < iCorte && iCorte < iDup);
const pieDe = c => { const i = c.indexOf('<div class="recibo-pie">'); if (i < 0) return ''; let d = 0; for (let k = i; k < c.length; k++) { if (c.startsWith('<div', k)) d++; else if (c.startsWith('</div>', k)) { d--; if (!d) return c.slice(i, k + 6); } } return c.slice(i); };
const pies = copias.map(pieDe);
ok('2c) en las 2 copias el pie contiene total (NETO A COBRAR), "Retira:" y la firma (Firma/Aclaración/DNI) — todo dentro de .recibo-pie',
   pies.every(p => /NETO A COBRAR/.test(p) && /Retira:/.test(p) && /Firma/.test(p) && /Aclaración/.test(p) && /DNI/.test(p)), pies[0] ? `${pies[0].length} chars` : 'sin pie');
ok('2d) "A nombre de:" en las 2 copias, mismas filas en las 2', copias.every(c => /A nombre de:/.test(c)) && (copias[0].match(/<tr><td>/g) || []).length === (copias[1].match(/<tr><td>/g) || []).length && (copias[0].match(/<tr><td>/g) || []).length === (lns || []).length);
ok('2e) el HTML del recibo no trae la clase .recibo-container (resto de otra época; no envuelve al recibo)', !html.includes('recibo-container'));

// ═══ Parte 3: Chromium (opcional) ═══
const shellDir = join(homedir(), '.cache', 'ms-playwright');
const libs = join(homedir(), 'chromium-libs', 'usr', 'lib', 'x86_64-linux-gnu');
const hayChromium = existsSync(shellDir) && existsSync(libs) && !process.env.SIN_CHROMIUM;
if (!hayChromium) console.log('⚠ Parte 3 salteada: sin Chromium headless (ver docs/SERVER.md). Las páginas del PDF hay que mirarlas a ojo.');
else {
  const out = mkdtempSync(join(tmpdir(), 'recibo-probe-'));
  const htmlPath = join(out, 'liquidaciones_bajo_prueba.html'); writeFileSync(htmlPath, SRC);   // mismo HTML (con mutante, si hay)
  const render = (n, extra = []) => {
    const r = spawnSync(process.execPath, [join(HERE, 'render_recibo_pdf.mjs'), String(reciboRow.numero_recibo), out, `--html=${htmlPath}`, ...extra], { encoding: 'utf8', env: { ...process.env, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH || libs } });
    if (r.status !== 0) { console.log('   render falló:', (r.stderr || r.stdout).trim().split('\n').slice(-2).join(' | ')); return null; }
    try { return JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch { return null; }
  };
  const real = render(0);
  ok(`3a) recibo real (${real?.filas_render} línea(s)) → PDF de 1 página; fin del duplicado ${real?.copias?.[1] ? (real.copias[1].top_mm + real.copias[1].alto_mm).toFixed(1) : '?'} mm ≤ ${real?.alto_util_mm} mm`,
     !!real && real.paginas_pdf === 1 && real.entran_en_una_hoja, real ? `pdf: ${real.pdf}` : '');
  const cerca = (v, obj) => Math.abs(v - obj) <= 0.5;
  const corteDe = r => r?.cortes?.[0]?.top_mm;
  ok(`3a') recibo real: la línea de corte cae a la mitad del área útil (${corteDe(real)} mm ≈ ${real ? real.alto_util_mm / 2 : '?'} mm)`, !!real && cerca(corteDe(real), real.alto_util_mm / 2));
  const x9 = render(9, ['--lineas=9']);
  ok(`3d) 9 líneas → 1 página, corte a la mitad (${corteDe(x9)} mm), fin del duplicado ${x9?.copias?.[1] ? (x9.copias[1].top_mm + x9.copias[1].alto_mm).toFixed(1) : '?'} mm ≤ ${x9?.alto_util_mm}`,
     !!x9 && x9.paginas_pdf === 1 && x9.entran_en_una_hoja && cerca(corteDe(x9), x9.alto_util_mm / 2));
  const x10 = render(10, ['--lineas=10']);
  ok(`3e) 10 líneas → 2 páginas; el original crece más allá de la mitad (corte ${corteDe(x10)} mm, alto natural) y el duplicado tiene alto natural`,
     !!x10 && x10.paginas_pdf === 2 && corteDe(x10) > x10.alto_util_mm / 2 + 1 && x10.copias[1].alto_mm === x10.copias[0].alto_mm);
  const x12 = render(12, ['--lineas=12']);
  ok('3b) 12 líneas → PDF de 2 páginas (el duplicado se va entero a la hoja 2 — VER a ojo _x12_pdf_p2.png)', !!x12 && x12.paginas_pdf === 2, x12 ? `${(x12.paginas_png || []).join(', ') || x12.pdf}` : '');
  const x40 = render(40, ['--lineas=40']);
  ok('3c) 40 líneas → PDF de ≥ 3 páginas (una copia no entra en una hoja: la tabla parte, el pie no)', !!x40 && x40.paginas_pdf >= 3 && x40.pie_break_inside === 'avoid', x40 ? `${x40.paginas_pdf} páginas` : '');
  console.log(`   salida de Chromium en ${out}`);
}

for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  → ' + r.n : ''}`);
const fail = results.filter(r => r.s === '❌').length;
console.log(`\n${results.length - fail}/${results.length} checks OK${mutArg ? ` (mutante ${mutArg})` : ''}`);
process.exit(fail ? 1 : 0);
