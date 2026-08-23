#!/usr/bin/env node
/**
 * probe_badge_overlap_browser.mjs — chequeo GEOMÉTRICO del badge del bono.
 *
 * Verifica que el rect del badge "BONO $X AL GANADOR" no intersecte el rect de ningún
 * nodo de texto del bloque de información de la carrera. Es el criterio que pidió Leo, y
 * sirve para cualquier visor: no depende del motor de render, sólo de la geometría que
 * ese motor produce.
 *
 * Mide a varios anchos, porque el bug aparecía en el visor de iOS y no en desktop: un
 * bloque más angosto empuja el texto hasta debajo del badge. Un badge fuera de flujo pasa
 * el chequeo a 1280px y falla a 390px — por eso medir a un solo ancho no alcanza.
 *
 * ⚠️  NO CORRE EN EL VPS: chromium no está soportado en Ubuntu 26.04 (docs/SERVER.md).
 *     Correr desde una máquina con browser. La verificación estructural que sí corre en
 *     el VPS está en probe_badge_overlap.mjs.
 *
 * Uso:
 *     npx playwright install chromium
 *     export SGH_EMAIL=dolores@sgh.com
 *     export SGH_PASSWORD=...
 *     node tests/probe_badge_overlap_browser.mjs [reunion_id] [--url <base>] [--pdf]
 *
 * Con --pdf además emite el PDF a /tmp y mide sobre el render de impresión.
 * Sale 0 si no hay intersecciones, 1 si hay alguna, 2 si no pudo medir.
 */
const R8_DEFAULT = '7b6e003e-22e2-4629-bf55-f18560b1260f';

const args      = process.argv.slice(2);
const valorDe   = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const reunionId = args.find(a => /^[0-9a-f-]{36}$/i.test(a)) || R8_DEFAULT;
const base      = valorDe('--url') || 'https://sigh.com.ar';
const conPdf    = args.includes('--pdf');

// iPhone 12/13/14 en vertical, iPhone SE, tablet, y desktop
const ANCHOS = [390, 375, 768, 1280];

const EMAIL = process.env.SGH_EMAIL, PASSWORD = process.env.SGH_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Faltan SGH_EMAIL / SGH_PASSWORD. Sin sesión, RLS devuelve 0 carreras y el\n' +
    'chequeo daría 0 solapamientos sobre una página vacía.');
  process.exit(2);
}

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('Falta playwright: npm install'); process.exit(2); }

let browser;
try { browser = await chromium.launch(); }
catch (err) {
  console.error('No se pudo lanzar chromium:', err.message.split('\n')[0]);
  console.error('Si es Ubuntu 26.04, es la limitación de docs/SERVER.md: correlo en otra máquina.');
  process.exit(2);
}

/** Se ejecuta DENTRO de la página. Devuelve las intersecciones badge × texto. */
const medirEnPagina = () => {
  const solapan = (a, b) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const area = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return Math.round(Math.max(0, w) * Math.max(0, h));
  };

  const choques = [];
  document.querySelectorAll('.carrera-color-info').forEach((info, idx) => {
    const badge = info.querySelector('.bono-lateral');
    if (!badge) return;
    const rb = badge.getBoundingClientRect();

    // rects de TEXTO, no de elemento: un <div> de bloque ocupa todo el ancho aunque su
    // texto sea corto, así que comparar contra el div daría falsos positivos. Los rects
    // de los nodos de texto son las cajas reales de las líneas.
    const walker = document.createTreeWalker(info, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (badge.contains(n)) continue;              // el texto del propio badge no cuenta
      if (!n.textContent.trim()) continue;
      const rango = document.createRange();
      rango.selectNodeContents(n);
      for (const rt of rango.getClientRects()) {
        if (rt.width === 0 || rt.height === 0) continue;
        if (solapan(rb, rt)) {
          choques.push({
            carrera: idx + 1,
            texto: n.textContent.trim().slice(0, 70),
            areaPx: area(rb, rt),
            badge: { t: Math.round(rb.top), l: Math.round(rb.left), w: Math.round(rb.width), h: Math.round(rb.height) },
            rect:  { t: Math.round(rt.top), l: Math.round(rt.left), w: Math.round(rt.width), h: Math.round(rt.height) },
          });
        }
      }
    }
  });
  return { badges: document.querySelectorAll('.bono-lateral').length, choques };
};

let totalChoques = 0;
try {
  const ctx  = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
  const page = await ctx.newPage();

  await page.goto(`${base}/login.html`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await Promise.all([
    page.waitForURL(u => !u.pathname.endsWith('login.html'), { timeout: 30000 }),
    page.click('button[type="submit"], #btn-login'),
  ]);

  await page.goto(`${base}/programa-oficial-color.html?reunion_id=${reunionId}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.carrera-color-info', { timeout: 30000 });

  console.log(`\n=== probe_badge_overlap_browser — reunión ${reunionId.slice(0, 8)} ===\n`);

  for (const ancho of ANCHOS) {
    await page.setViewportSize({ width: ancho, height: 1600 });
    await page.waitForTimeout(150);   // reflow
    const { badges, choques } = await page.evaluate(medirEnPagina);
    totalChoques += choques.length;
    console.log(`${String(ancho).padStart(5)}px — ${badges} badges — ${choques.length ? `❌ ${choques.length} intersecciones` : '✅ sin intersecciones'}`);
    choques.slice(0, 5).forEach(c =>
      console.log(`          carrera ${c.carrera}: "${c.texto}" (${c.areaPx}px² solapados)`));
  }

  // Además, en el render de impresión, que es el que termina en el PDF de WhatsApp
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: 794, height: 1123 });   // A4 a 96dpi
  await page.waitForTimeout(150);
  const impresion = await page.evaluate(medirEnPagina);
  totalChoques += impresion.choques.length;
  console.log(`  print — ${impresion.badges} badges — ${impresion.choques.length ? `❌ ${impresion.choques.length} intersecciones` : '✅ sin intersecciones'}`);
  impresion.choques.slice(0, 5).forEach(c =>
    console.log(`          carrera ${c.carrera}: "${c.texto}" (${c.areaPx}px² solapados)`));

  if (conPdf) {
    const salida = `/tmp/programa-color-${reunionId.slice(0, 8)}.pdf`;
    await page.pdf({ path: salida, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } });
    console.log(`\nPDF emitido en ${salida}`);
  }

  console.log(`\n=== ${totalChoques === 0 ? 'OK — ningún texto queda debajo del badge' : `${totalChoques} INTERSECCIONES`} ===\n`);
  process.exit(totalChoques === 0 ? 0 : 1);
} catch (err) {
  console.error('\n[probe_badge_overlap_browser]', err.message);
  process.exit(2);
} finally {
  await browser.close();
}
