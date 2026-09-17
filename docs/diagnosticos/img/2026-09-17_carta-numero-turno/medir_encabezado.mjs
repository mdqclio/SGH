// Mide el encabezado de carrera del PDF de carta-llamados.html con y sin "TURNO N — " adelante.
// Usa el CSS de impresión REAL extraído del archivo (print.css = líneas 162-228 de carta-llamados.html,
// el bloque interno de @media print) sobre un contenedor de 186mm (A4 - 2×12mm de @page).
// Datos: condiciones reales de R9 (11 turnos) + los 3 casos más largos del club.
// Sólo lectura: no toca Supabase ni el repo; escribe PNG+JSON en el scratchpad.
import { chromium } from '/home/clio/dev/SGH/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const S = '/tmp/claude-1000/-home-clio-dev-SGH/9be9e852-7aae-40af-92ba-45234dfdbacc/scratchpad';
const css = readFileSync(join(S, 'print.css'), 'utf8');

function headlessShell() {
  const cache = join(homedir(), '.cache', 'ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-')).sort() : [];
  if (!dirs.length) throw new Error('No hay chromium_headless_shell en ' + cache);
  return join(cache, dirs.at(-1), 'chrome-headless-shell-linux64', 'chrome-headless-shell');
}

// [turno, numero_carrera_programa, categoría, codigo, cond_main, bono_ganador, distancia]
const CASOS = [
  ['R9 T1',  1, 1,    'Oficial No Computable','ONC','Todo caballo 3 años perdedor.', 250000, 800],
  ['R9 T2',  2, null, 'Oficial No Computable','ONC','Todo caballo 4 años perdedor.', 250000, 800],
  ['R9 T3',  3, 7,    'Oficial No Computable','ONC','Todo caballo 4 años perdedor.', 250000, 1200],
  ['R9 T4',  4, 2,    'Oficial No Computable','ONC','Todo caballo 5 años y + edad perdedor.', 250000, 800],
  ['R9 T5',  5, 4,    'Oficial No Computable','ONC','Todo caballo 3 y 4 años ganador de 1 o 2 carreras.', 250000, 1000],
  ['R9 T6',  6, 3,    'Oficial No Computable','ONC','Todo caballo de 5 años ganador de 1 o 2 carreras.', 250000, 1000],
  ['R9 T7',  7, 5,    'Oficial No Computable','ONC','Todo caballo 6 años y + edad ganadores de 1 o 2 carreras.', 250000, 1100],
  ['R9 T8',  8, null, 'Oficial No Computable','ONC','Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras.', 250000, 1200],
  ['R9 T9',  9, 6,    'Oficial No Computable','ONC','Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras.', 0, 1100],
  ['R9 T10',10, null, 'Oficial Computable','OC','Yeguas 5 años y + edad perdedoras.', 0, 1100],
  ['R9 T11',11, 8,    'Oficial Computable','OC','Todo caballo 5 años y + edad perdedor.', 0, 1200],
  // peores casos históricos del club (bono + condición larga)
  ['R7 T5 (61c+bono)',  5, null, 'Oficial No Computable','ONC','Todo caballo de 4 años y más edad ganadores de 1 o 2 carreras', 250000, 1000],
  ['R7 T8 (61c+bono)',  8, null, 'Oficial No Computable','ONC','Todo caballo de 6 años y más edad ganadores de 1 o 2 carreras', 250000, 1200],
  ['R10 T11 (68c)',    11, null, 'Oficial Computable','OC','Especial Todo caballo 4 años y + edad ganadores de 2 o más carreras.', 0, 1000],
  // sintético: el peor imaginable — 68 chars + bono + turno de 2 dígitos
  ['SINT T11 68c+bono', 11, null, 'Oficial No Computable','ONC','Especial Todo caballo 4 años y + edad ganadores de 2 o más carreras.', 250000, 1000],
];

const fmt = n => '$ ' + n.toLocaleString('es-AR');

function carreraHtml(caso, variante) {
  const [id, turno, prog, catNombre, cod, cond, bono, dist] = caso;
  const bonoTag = bono > 0 ? ` <span class="p-head-bono">| BONO de ${fmt(bono)} al ganador</span>` : '';
  let prefijo = '';
  if (variante === 'B') prefijo = `TURNO ${turno} &mdash; `;
  if (variante === 'C') prefijo = `${turno}. `;
  if (variante === 'D') prefijo = `TURNO ${turno} &mdash; Condición: `;
  const titulo = `${prefijo}${cond}${bonoTag}`;
  return `<div class="p-carrera-wrap" data-cat="${cod}" data-id="${id}" data-var="${variante}">
    <div class="p-carrera-caption">CARRERA ${catNombre.toUpperCase()}</div>
    <div class="p-carrera-box">
      <div class="p-carrera-head">
        <div class="p-head-titulo">${titulo}</div>
        <div class="p-head-dist">${dist} m</div>
      </div>
      <div class="p-carrera-body"><div class="p-linea-bolsa">BOLSA: $ 1.000.000 &mdash; 1ª $ 600.000 &mdash; 2ª $ 200.000</div></div>
    </div>
  </div>`;
}

const VARIANTES = { A: 'actual (sin número)', B: 'TURNO N — cond', C: 'N. cond', D: 'TURNO N — Condición: cond (igual pantalla)' };

const FD = join(S,'fonts/usr/share/fonts/truetype/liberation');
const b64 = f => 'data:font/ttf;base64,' + readFileSync(join(FD, f)).toString('base64');
const FR = b64('LiberationSans-Regular.ttf'), FB = b64('LiberationSans-Bold.ttf');
const html = (vars) => `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:Arial;font-weight:400;src:url(${FR})}
  @font-face{font-family:Arial;font-weight:700 900;src:url(${FB})}
  ${css}
  html,body{margin:0;background:#fff}
  #print-only{ width:186mm; padding:6mm; box-sizing:content-box; }
  .p-carrera-wrap{ page-break-inside:auto }
  h3{font:700 9pt Arial;margin:8pt 0 2pt;color:#666}
</style></head><body><div id="print-only">
${vars.map(v => `<h3>Variante ${v}: ${VARIANTES[v]}</h3>` + CASOS.map(c => carreraHtml(c, v)).join('')).join('')}
</div></body></html>`;

const browser = await chromium.launch({ headless: true, executablePath: headlessShell() });
const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 2 });
await page.setContent(html(['A', 'B', 'C', 'D']), { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
console.log('font check:', await page.evaluate(() => document.fonts.check('bold 10pt Arial')));
await page.emulateMedia({ media: 'print' });

const datos = await page.evaluate(() => {
  const out = [];
  for (const w of document.querySelectorAll('.p-carrera-wrap')) {
    const t = w.querySelector('.p-head-titulo');
    const d = w.querySelector('.p-head-dist');
    const lh = parseFloat(getComputedStyle(t).lineHeight);
    const r = t.getBoundingClientRect();
    // ancho real del texto: range sobre el contenido
    const range = document.createRange(); range.selectNodeContents(t);
    const rects = [...range.getClientRects()];
    const textW = rects.length ? Math.max(...rects.map(x => x.right)) - Math.min(...rects.map(x => x.left)) : 0;
    out.push({
      id: w.dataset.id, var: w.dataset.var,
      texto: t.textContent.trim(),
      chars: t.textContent.trim().length,
      lineas: Math.round(r.height / lh),
      anchoTituloPx: +r.width.toFixed(1),
      anchoTextoPx: +textW.toFixed(1),
      anchoDistPx: +d.getBoundingClientRect().width.toFixed(1),
      overflow: t.scrollWidth > t.clientWidth + 1,
    });
  }
  return out;
});
writeFileSync(join(S, 'medicion.json'), JSON.stringify(datos, null, 2));

// Resumen por variante
const porVar = {};
for (const d of datos) { (porVar[d.var] ??= []).push(d); }
const lines = [];
for (const v of Object.keys(porVar)) {
  const ds = porVar[v];
  lines.push(`Variante ${v} — ${VARIANTES[v]}: ${ds.filter(d => d.lineas >= 2).length}/${ds.length} títulos a 2 líneas, ${ds.filter(d => d.overflow).length} overflow`);
  for (const d of ds) lines.push(`  ${d.id.padEnd(20)} ${String(d.chars).padStart(3)}c  ${d.lineas} línea(s)  texto=${d.anchoTextoPx}px / caja=${d.anchoTituloPx}px  ${d.overflow ? 'OVERFLOW' : ''}  | ${d.texto}`);
}
writeFileSync(join(S, 'medicion.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));

// PNG por variante para mirar
for (const v of ['A', 'B', 'C', 'D']) {
  await page.setContent(html([v]), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: 'print' });
  await page.screenshot({ path: join(S, `variante_${v}.png`), fullPage: true });
}
await browser.close();
