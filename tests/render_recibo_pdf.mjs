#!/usr/bin/env node
/**
 * render_recibo_pdf.mjs — imprime un recibo REAL a PDF + PNG con Chromium headless y MIDE el layout.
 *
 *   node tests/render_recibo_pdf.mjs <numero_recibo|recibo_id> <out_dir> [--lineas=N] [--css="…"] [--html=ruta|URL]
 *
 * Sin browser con sesión: el HTML del recibo se genera con la función REAL `imprimirReciboCobro`
 * extraída de liquidaciones.html (main por defecto; --html= otra ruta o URL), corrida con el
 * cliente de Supabase (SUPABASE_SECRET_KEY) y un `document` stub que captura #recibo-print.
 * Ese HTML se envuelve con el <style> del mismo archivo y se abre en chrome-headless-shell
 * (LD_LIBRARY_PATH con ~/chromium-libs, ver docs/SERVER.md) en media print, A4, @page del archivo.
 *
 * Mide (en mm, con el ancho útil de A4 = 210 − 2×margen): alto de cada .recibo-copia, de la tabla,
 * del pie, y el alto total de las 2 copias; genera el PDF (page.pdf, preferCSSPageSize) y cuenta
 * las páginas; saca un PNG del DOM en media print (tira completa, sin paginar) y, si está el
 * Chromium completo (visor PDFium), un PNG por PÁGINA REAL del PDF (`_pdf_pN.png`) — ésa es la
 * verificación visual de la paginación.
 *
 *   --lineas=N   repite las filas de la tabla hasta N (caso sintético largo, p.ej. 20)
 *   --css="…"    CSS extra inyectado en media print para probar variantes sin tocar el archivo
 *
 * SOLO LECTURA. No escribe en la base ni crea usuarios.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { chromium } from 'playwright';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }
const [ref, outDir, ...flags] = process.argv.slice(2);
if (!ref || !outDir) { console.error('uso: render_recibo_pdf.mjs <numero_recibo|recibo_id> <out_dir> [--lineas=N] [--css=…] [--html=…]'); process.exit(2); }
const flag = n => flags.find(f => f.startsWith(`--${n}=`))?.slice(n.length + 3);
const LINEAS = +(flag('lineas') || 0), EXTRA_CSS = flag('css') || '', HTML_SRC = flag('html') || '';
const HERE = dirname(fileURLToPath(import.meta.url));
const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

let SRC;
if (/^https?:/.test(HTML_SRC)) SRC = await (await fetch(`${HTML_SRC}?v=${Date.now()}`)).text();
else SRC = readFileSync(HTML_SRC || join(HERE, '..', 'liquidaciones.html'), 'utf8');
function extractFn(src, firma) {
  const i = src.indexOf(firma); if (i < 0) throw new Error('no encontré: ' + firma);
  let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  throw new Error('no pude cerrar: ' + firma);
}
function fullChromium() {
  const cache = join(homedir(), '.cache', 'ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort() : [];
  if (!dirs.length) return null;
  const bin = join(cache, dirs[dirs.length - 1], 'chrome-linux64', 'chrome');
  return existsSync(bin) ? bin : null;
}
function headlessShell() {
  const cache = join(homedir(), '.cache', 'ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-')).sort() : [];
  if (!dirs.length) throw new Error('No hay chromium_headless_shell en ' + cache);
  return join(cache, dirs[dirs.length - 1], 'chrome-headless-shell-linux64', 'chrome-headless-shell');
}

// ── 1) recibo real ─────────────────────────────────────────────────────────────
const esUuid = /^[0-9a-f-]{36}$/i.test(ref);
const { data: recibo, error: eR } = await sb.from('recibos').select('*').eq(esUuid ? 'id' : 'numero_recibo', esUuid ? ref : +ref).eq('club_id', CLUB_ID).maybeSingle();
if (eR || !recibo) throw new Error('recibo no encontrado: ' + (eR?.message || ref));
const benefId = recibo.propietario_id || recibo.profesional_id;
const benefTipo = recibo.propietario_id ? 'propietario' : 'profesional';
const { data: benef } = benefTipo === 'propietario'
  ? await sb.from('propietarios').select('nombre').eq('id', benefId).single()
  : await sb.from('profesionales').select('nombre,apellido').eq('id', benefId).single();
const cobBenef = { tipo: benefTipo, id: benefId, nombre: benefTipo === 'propietario' ? benef.nombre : `${benef.apellido}, ${benef.nombre}` };
const { data: lineas } = await sb.from('liquidacion_detalle').select('id').eq('recibo_id', recibo.id);
const lineaIds = (lineas || []).map(l => l.id);

// ── 2) HTML con la función REAL ─────────────────────────────────────────────────
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const nodos = {};
const document = { getElementById: id => (nodos[id] ||= { innerHTML: '' }) };
const src = [
  SRC.slice(SRC.indexOf('const ROL_POR_BENEFICIARIO'), SRC.indexOf('\n', SRC.indexOf('const ROL_POR_BENEFICIARIO'))),
  extractFn(SRC, 'function rolDeLinea(l)'), extractFn(SRC, 'function escapeHtml(s)'),
  extractFn(SRC, 'async function imprimirReciboCobro(recibo, lineaIds, opts)'),
].join('\n\n');
const fmt = n => '$' + (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let printed = 0;
await new AsyncFunction('sb', 'CLUB_ID', 'document', 'window', 'fmt', 'cobBenef', 'precargarLogo', 'recibo', 'lineaIds',
  `${src}\n await imprimirReciboCobro(recibo, lineaIds, {});`)(sb, CLUB_ID, document, { print: () => { printed++; } }, fmt, cobBenef, async () => {}, recibo, lineaIds);
let inner = nodos['recibo-print'].innerHTML;
if (!printed || !inner) throw new Error('imprimirReciboCobro no generó el recibo');
const filasReales = (inner.match(/<tr><td>/g) || []).length / 2;
if (LINEAS > filasReales) {
  // caso sintético: se repiten las filas reales hasta N (el pie y el total quedan como están)
  inner = inner.replace(/<tbody>([\s\S]*?)<\/tbody>/g, (m, rows) => {
    const trs = rows.match(/<tr>[\s\S]*?<\/tr>/g) || [];
    const out = []; while (out.length < LINEAS) out.push(trs[out.length % trs.length]);
    return `<tbody>${out.join('')}</tbody>`;
  });
}
const style = SRC.slice(SRC.indexOf('<style>'), SRC.indexOf('</style>') + 8);
const head = SRC.slice(SRC.indexOf('<head>'), SRC.indexOf('<style>'));   // fonts, meta
const html = `<!DOCTYPE html><html lang="es">${head}${style}${EXTRA_CSS ? `<style>@media print{${EXTRA_CSS}}</style>` : ''}</head><body><div class="recibo-print" id="recibo-print">${inner}</div></body></html>`;

// ── 3) Chromium: medir + PDF + PNG ──────────────────────────────────────────────
mkdirSync(outDir, { recursive: true });
const stem = join(outDir, `recibo_${recibo.numero_recibo}${LINEAS ? `_x${LINEAS}` : ''}${EXTRA_CSS ? '_css' : ''}`);
writeFileSync(`${stem}.html`, html);
const browser = await chromium.launch({ headless: true, executablePath: headlessShell() });
try {
  const page = await browser.newPage();
  // Se sirve el HTML bajo el origen de prod para que el logo (logo_url relativa) y las fuentes
  // resuelvan como en la pantalla real.
  const ORIGEN = process.env.SIGH_ORIGEN || 'https://sigh.com.ar';
  await page.route(`${ORIGEN}/_recibo_render.html`, route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(`${ORIGEN}/_recibo_render.html`, { waitUntil: 'networkidle' });
  const logo = await page.evaluate(() => { const i = document.querySelector('.recibo-logo'); return i ? { src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth, h: i.naturalHeight } : null; });
  await page.emulateMedia({ media: 'print' });
  const margenMm = await page.evaluate(() => {
    for (const ss of document.styleSheets) { let rules; try { rules = [...ss.cssRules]; } catch { continue; }
      for (const r of rules) { if (r instanceof CSSMediaRule) for (const rr of r.cssRules) if (rr instanceof CSSPageRule) { const m = (rr.style.margin || rr.style.marginTop || '').match(/([\d.]+)mm/); if (m) return +m[1]; } } }
    return 15;
  });
  const utilW = 210 - 2 * margenMm, utilH = 297 - 2 * margenMm;
  const VW = Math.round(utilW / 25.4 * 96);
  await page.setViewportSize({ width: VW, height: 1200 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const mm = px => +(px / 96 * 25.4).toFixed(1);
  const med = await page.evaluate(() => {
    const h = el => el ? el.getBoundingClientRect().height : 0;
    const copias = [...document.querySelectorAll('.recibo-copia')];
    return {
      font: getComputedStyle(document.body).fontFamily,
      total_px: document.documentElement.scrollHeight,
      copias: copias.map(c => ({
        rotulo: c.querySelector('.recibo-rotulo')?.textContent, alto_px: h(c),
        header_px: h(c.querySelector('.recibo-header')), benef_px: h(c.querySelector('.recibo-benef')),
        tabla_px: h(c.querySelector('.recibo-table')), filas: c.querySelectorAll('tbody tr').length,
        fila_px: h(c.querySelector('tbody tr')), pie_px: h(c.querySelector('.recibo-pie')),
        firma_px: h(c.querySelector('.recibo-firma')), cobrador_px: h(c.querySelector('.recibo-cobrador')),
        top_px: c.getBoundingClientRect().top + window.scrollY,
      })),
      break_after: copias.map(c => getComputedStyle(c).breakAfter),
      cortes: [...document.querySelectorAll('.recibo-corte')].map(e => ({ top_px: e.getBoundingClientRect().top + window.scrollY, alto_px: h(e) })),
      pie_break_inside: getComputedStyle(document.querySelector('.recibo-pie')).breakInside,
      texto_retira: document.querySelector('.recibo-cobrador')?.textContent.trim(),
      texto_benef: document.querySelector('.recibo-benef')?.textContent.trim(),
    };
  });
  const pdf = await page.pdf({ path: `${stem}.pdf`, preferCSSPageSize: true, printBackground: false });
  const paginas = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  await page.screenshot({ path: `${stem}_tira.png`, fullPage: true });
  const utilHpx = Math.round(utilH / 25.4 * 96);
  // Páginas REALES del PDF: el Chromium completo (chromium-1243, no el headless shell) trae el visor
  // PDFium y en headless nuevo lo renderiza; se abre el PDF con #page=N y se saca screenshot.
  // Necesita libcups2t64 + libavahi-client3/common3 además de las 8 libs del shell (docs/SERVER.md).
  const paginasPng = [];
  const full = fullChromium();
  if (full) {
    const b2 = await chromium.launch({ headless: true, executablePath: full, args: ['--no-sandbox'] });
    try {
      for (let n = 1; n <= paginas; n++) {
        const pg = await b2.newPage({ viewport: { width: 900, height: 1300 } });
        await pg.goto(`file://${stem}.pdf#page=${n}&zoom=100&toolbar=0`);
        await pg.waitForTimeout(2500);
        const out = `${stem}_pdf_p${n}.png`;
        await pg.screenshot({ path: out });
        paginasPng.push(out); await pg.close();
      }
    } finally { await b2.close(); }
  }
  const resumen = {
    recibo: recibo.numero_recibo, beneficiario: cobBenef.nombre, forma_pago: recibo.forma_pago, filas_reales: filasReales, filas_render: med.copias[0]?.filas,
    fuente: med.font, logo, margen_mm: margenMm, ancho_util_mm: utilW, alto_util_mm: utilH, viewport_px: VW,
    copias: med.copias.map(c => ({ rotulo: c.rotulo, alto_mm: mm(c.alto_px), header_mm: mm(c.header_px), benef_mm: mm(c.benef_px), tabla_mm: mm(c.tabla_px), filas: c.filas, fila_mm: mm(c.fila_px), pie_mm: mm(c.pie_px), cobrador_mm: mm(c.cobrador_px), firma_mm: mm(c.firma_px), top_mm: mm(c.top_px) })),
    dos_copias_mm: mm(med.copias.reduce((s, c) => s + c.alto_px, 0)),
    total_documento_mm: mm(med.total_px),
    break_after: med.break_after, pie_break_inside: med.pie_break_inside, cortes: med.cortes.map(c => ({ top_mm: mm(c.top_px), alto_mm: mm(c.alto_px) })),
    // el body tiene min-height:100vh (CSS de pantalla) → scrollHeight no mide el recibo; se usa la suma de copias
    entran_en_una_hoja: Math.max(...med.copias.map(c => c.top_px + c.alto_px)) <= utilHpx,   // fin del duplicado (incluye el corte)
    paginas_pdf: paginas, pdf: `${stem}.pdf`, paginas_png: paginasPng, tira: `${stem}_tira.png`,
    texto_benef: med.texto_benef, texto_retira: med.texto_retira,
  };
  writeFileSync(`${stem}_medidas.json`, JSON.stringify(resumen, null, 2));
  console.log(JSON.stringify(resumen, null, 2));
} finally { await browser.close(); }
