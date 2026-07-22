/**
 * Probe — tapa nueva + flyer de Revista Palermo en el pie del programa color.
 *
 * CORRE EL CÓDIGO REAL: extrae el `<script>` inline de programa-oficial-color.html del
 * working tree, le inyecta un cliente Supabase real y stubs de DOM, y ejecuta `load()`
 * contra la reunión 6 (20/06/2026) REAL. El HTML que se verifica es el que produce el
 * mismo texto que sirve prod — no hay reimplementación.
 *
 * Sin browser: Playwright/chromium NO corre en Ubuntu 26.04
 * (`npx playwright install chromium` → "Playwright does not support chromium on
 * ubuntu26.04-x64"; ídem firefox). Ver tests/README.md y docs/SERVER.md.
 * Como sustituto del screenshot, el probe escribe un PREVIEW OFFLINE autocontenido en
 * `tmp/preview_programa_color_r6.html` con el <style> real de la página y las imágenes
 * embebidas como data: URI — se abre con doble click, sin servidor ni login.
 *
 * Verifica:
 *  A. Assets — las 5 imágenes viven en assets/programa-oficial-color/, ninguna en la raíz.
 *  B. Tapa   — `.tapa-foto` apunta a tapa-01.jpg (provisoria) y tapa-caballos.jpg sigue en disco.
 *  C. Flyer  — `.flyer-pie` existe en CSS, respeta aspect ratio (width:100%/height:auto),
 *              es print-safe (print-color-adjust exact + break-inside avoid) y no fuerza
 *              página nueva (sin page-break-before:always).
 *  D. Render — el HTML renderizado de la R6 real termina con el flyer, DESPUÉS de
 *              .pagina-final, con el src correcto y una sola aparición.
 *  E. CSP    — img-src admite 'self'; no hizo falta tocar la CSP.
 *  F. B&N    — programa-oficial.html NO contiene flyer-pie ni el banner.
 *
 * SEGURIDAD: read-only. No escribe una sola fila en la DB (sólo SELECT vía el código real).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = 'assets/programa-oficial-color';
const REUNION_6 = 'b02ca761-6f44-4720-86aa-a3c3099019ea'; // 20/06/2026, Dolores

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK'; // publishable alcanza: todo es SELECT

let pass = 0, fail = 0;
const ok  = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}${extra ? `\n       ${extra}` : ''}`); }
};

const html = readFileSync(join(ROOT, 'programa-oficial-color.html'), 'utf8');
const bn   = readFileSync(join(ROOT, 'programa-oficial.html'), 'utf8');

// ─────────────────────────────────────────────────────────────── A. ASSETS
console.log('\nA. Assets movidos de la raíz a assets/programa-oficial-color/');
const ESPERADOS = ['banner-revista-palermo.jpg', 'tapa-01.jpg', 'tapa-02.jpg', 'tapa-03.jpg', 'tapa-04.jpg'];
for (const f of ESPERADOS) {
  ok(`${ASSETS}/${f} existe`, existsSync(join(ROOT, ASSETS, f)));
}
for (const n of ['4109', '4110', '4111', '4112', '4113']) {
  ok(`IMG_${n}.jpeg ya no está en la raíz`, !existsSync(join(ROOT, `IMG_${n}.jpeg`)));
}
ok('tapa-caballos.jpg NO fue borrada', existsSync(join(ROOT, ASSETS, 'tapa-caballos.jpg')));

// Dimensiones reales leídas del header JPEG (SOFn): si alguien reemplaza el banner por una
// imagen que no es una tira, el `width:100%` la haría gigante y rompería el pie.
function jpegDims(p) {
  const b = readFileSync(p);
  let o = 2;
  while (o < b.length) {
    if (b[o] !== 0xFF) { o++; continue; }
    const m = b[o + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { w: b.readUInt16BE(o + 7), h: b.readUInt16BE(o + 5) };
    }
    o += 2 + b.readUInt16BE(o + 2);
  }
  return null;
}
const banner = jpegDims(join(ROOT, ASSETS, 'banner-revista-palermo.jpg'));
ok('el banner es una tira apaisada (1600x222, AR≈7.2)',
   banner && banner.w === 1600 && banner.h === 222,
   `dims: ${banner ? `${banner.w}x${banner.h}` : 'ilegible'}`);
const t01 = jpegDims(join(ROOT, ASSETS, 'tapa-01.jpg'));
ok('tapa-01 mantiene el 3:2 de la foto anterior (mismo recorte con center/cover)',
   t01 && Math.abs(t01.w / t01.h - 1.5) < 0.02, `dims: ${t01 ? `${t01.w}x${t01.h}` : 'ilegible'}`);

// ─────────────────────────────────────────────────────────────── B. TAPA
console.log('\nB. Tapa apunta a la foto provisoria');
const tapaCss = html.match(/\.tapa-foto\s*\{[^}]*\}/);
ok('regla .tapa-foto presente', !!tapaCss);
ok('.tapa-foto usa tapa-01.jpg', /url\('assets\/programa-oficial-color\/tapa-01\.jpg'\)/.test(tapaCss?.[0] || ''),
   `encontrado: ${(tapaCss?.[0] || '').replace(/\s+/g, ' ').slice(0, 160)}`);
ok('ya no referencia tapa-caballos.jpg', !html.includes('tapa-caballos.jpg'));

// ─────────────────────────────────────────────────────────────── C. FLYER CSS
console.log('\nC. Flyer del pie — CSS, aspect ratio y print-safety');
const flyerCss    = html.match(/\.flyer-pie\s*\{[^}]*\}/)?.[0] || '';
const flyerImgCss = html.match(/\.flyer-pie img\s*\{[^}]*\}/)?.[0] || '';
const printBlock  = html.match(/@media print\s*\{[\s\S]*?\n  \}/)?.[0] || '';

ok('regla .flyer-pie presente', !!flyerCss);
ok('ancho completo (width:100%)', /width:\s*100%/.test(flyerImgCss), flyerImgCss);
ok('aspect ratio respetado (height:auto, sin height fija ni cover)',
   /height:\s*auto/.test(flyerImgCss) && !/background-size:\s*cover/.test(flyerImgCss), flyerImgCss);
ok('no genera página vacía extra (sin page-break-before:always)',
   !/page-break-before:\s*always/.test(flyerCss) && !/page-break-before:\s*always/.test(printBlock));
ok('no se parte entre páginas (break-inside/page-break-inside: avoid)',
   /page-break-inside:\s*avoid/.test(flyerCss) || /break-inside:\s*avoid/.test(printBlock));
ok('print-color-adjust: exact en @media print',
   /\.flyer-pie img[^{]*\{[^}]*print-color-adjust:\s*exact/.test(printBlock), printBlock.slice(0, 300));
ok('estilo consistente con el bloque sponsors (borde verde-oscuro + margin-top)',
   /border-top:\s*2px solid var\(--verde-oscuro\)/.test(flyerCss) && /margin-top/.test(flyerCss), flyerCss);

// ─────────────────────────────────────────────────────────────── E. CSP
console.log('\nE. CSP');
const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)?.[1] || '';
const imgSrc = csp.match(/img-src([^;]*)/)?.[1] || '';
ok("img-src incluye 'self' — no hizo falta tocar la CSP", /'self'/.test(imgSrc), `img-src:${imgSrc}`);

// ─────────────────────────────────────────────────────────────── F. B&N INTACTO
console.log('\nF. programa-oficial.html (B&N) sin tocar');
ok('B&N no tiene .flyer-pie', !bn.includes('flyer-pie'));
ok('B&N no referencia el banner', !bn.includes('banner-revista-palermo'));

// ─────────────────────────────────────────── D. RENDER REAL DE LA REUNIÓN 6
console.log('\nD. Render del código REAL contra la reunión 6 (20/06/2026)');

// Extraer el <script> inline (el último del archivo) y sacarle el bootstrap del browser:
// createClient, URLSearchParams y la llamada final a load(), que inyectamos nosotros.
const inline = html.slice(html.lastIndexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
const body = inline
  .replace(/^\s*const sb = supabase\.createClient\([^\n]*\n/m, '')
  .replace(/^\s*const params = new URLSearchParams\([^\n]*\n/m, '')
  .replace(/^\s*const reunionId = params\.get\([^\n]*\n/m, '')
  .replace(/\n\s*load\(\);\s*$/, '\n');

// Los dos <script src> hermanos que la página carga antes del inline. Se concatenan al
// mismo scope: premios-utils.js es un IIFE que cuelga de `window`, partidor-colors.js
// declara consts/funciones top-level (globales en el browser, locales acá — da igual).
const deps = ['premios-utils.js', 'partidor-colors.js']
  .map(f => readFileSync(join(ROOT, f), 'utf8')).join('\n');

let captured = null;
const documentStub = {
  getElementById: (id) => ({
    set innerHTML(v) { if (id === 'programa-page') captured = v; },
    get innerHTML() { return captured; },
  }),
  title: '',
};

const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
// `window` = globalThis: premios-utils.js hace `global.repartoDisplay = ...` y el inline
// lo invoca como identificador suelto, que resuelve contra globalThis — no contra un stub.
const run = new AsyncFunction('sb', 'reunionId', 'document', 'window',
  `${deps}\n${body}\nawait load();`);
await run(sb, REUNION_6, documentStub, globalThis);

ok('el render produjo HTML', typeof captured === 'string' && captured.length > 1000,
   `largo: ${captured?.length ?? 0}`);

const flyerHits = (captured.match(/class="flyer-pie"/g) || []).length;
ok('el flyer aparece exactamente una vez', flyerHits === 1, `apariciones: ${flyerHits}`);
ok('apunta al banner correcto',
   captured.includes(`src="${ASSETS}/banner-revista-palermo.jpg"`));
ok('tiene alt text', /class="flyer-pie"[\s\S]{0,220}alt="[^"]+"/.test(captured));

const idxFinal = captured.indexOf('class="pagina-final"');
const idxFlyer = captured.indexOf('class="flyer-pie"');
ok('el flyer va DESPUÉS de la página final (es lo último del programa)',
   idxFinal > -1 && idxFlyer > idxFinal, `pagina-final@${idxFinal} flyer@${idxFlyer}`);
ok('nada renderizado después del flyer salvo el cierre de <section>',
   /class="flyer-pie"[\s\S]*<\/section>\s*$/.test(captured)
   && !captured.slice(idxFlyer).includes('class="pagina-final"'));
ok('la tapa se renderizó', captured.includes('class="tapa-foto"'));
ok('la R6 trajo carreras reales', (captured.match(/class="carrera-color"/g) || []).length > 0,
   `carreras: ${(captured.match(/class="carrera-color"/g) || []).length}`);

// ─────────────────────────────── PREVIEW OFFLINE (sustituto del screenshot)
const styleBlock = html.match(/<style>[\s\S]*?<\/style>/)?.[0] || '';
const dataUri = (rel) =>
  `data:image/jpeg;base64,${readFileSync(join(ROOT, rel)).toString('base64')}`;

// Inline de las imágenes: el preview tiene que abrirse por file:// sin rutas relativas rotas.
const previewBody = captured
  .replace(new RegExp(`${ASSETS}/banner-revista-palermo\\.jpg`, 'g'),
           dataUri(`${ASSETS}/banner-revista-palermo.jpg`));
const previewStyle = styleBlock
  .replace(`url('${ASSETS}/tapa-01.jpg')`, `url('${dataUri(`${ASSETS}/tapa-01.jpg`)}')`);

const outDir = join(ROOT, 'tmp');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'preview_programa_color_r6.html'), `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<title>PREVIEW — Programa Oficial Color · Reunión 6 · 20/06/2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700;900&family=Roboto:wght@400;700;900&display=swap" rel="stylesheet">
${previewStyle}
</head><body>
<div id="programa-page">${previewBody}</div>
</body></html>
`, 'utf8');
console.log(`\n  📄 preview offline → tmp/preview_programa_color_r6.html (imágenes embebidas)`);

// ─────────────────────────────────────────────────────────────── RESUMEN
console.log(`\n${'─'.repeat(60)}\n  ${pass} pass · ${fail} fail\n${'─'.repeat(60)}`);
process.exit(fail ? 1 : 0);
