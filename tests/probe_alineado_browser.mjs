#!/usr/bin/env node
/**
 * probe_alineado_browser.mjs — conteo REAL de filas envueltas en el programa oficial.
 *
 * Este es el criterio de aceptación que pidieron Fede y Yesi: una línea por caballo.
 * Cuenta, con layout de browser de verdad, cuántas filas de la tabla de inscriptos
 * ocupan más de una línea. Tiene que dar 0.
 *
 * ⚠️  NO CORRE EN EL VPS. Chromium no está soportado en Ubuntu 26.04:
 *       $ npx playwright install chromium
 *       Error: ERROR: Playwright does not support chromium on ubuntu26.04-x64
 *     (docs/SERVER.md). El script queda escrito para correrlo desde una máquina con
 *     browser — la de Leo, o cualquier Linux/Mac donde Playwright instale chromium.
 *
 *     Mientras tanto, la cota sin browser está en probe_alineado_programa.mjs, que
 *     compara anchos de celda contra R6 (el programa de junio, el que dan por bueno).
 *
 * Uso:
 *     npx playwright install chromium          # una sola vez, donde esté soportado
 *     export SGH_EMAIL=dolores@sgh.com
 *     export SGH_PASSWORD=...                  # NUNCA commitear la password
 *     node tests/probe_alineado_browser.mjs [reunion_id] [--color|--bn] [--url <base>]
 *
 * Por defecto mide R8 en la versión color contra prod. Sólo lee: no escribe en la DB.
 * Sale 0 si no hay filas envueltas, 1 si hay alguna.
 */
const R8_DEFAULT = '7b6e003e-22e2-4629-bf55-f18560b1260f';   // 16/08/2026

const args     = process.argv.slice(2);
const flag     = n => args.includes(n);
const valorDe  = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const reunionId = args.find(a => /^[0-9a-f-]{36}$/i.test(a)) || R8_DEFAULT;
const base      = valorDe('--url') || 'https://mdqclio.github.io/SGH';
const pagina    = flag('--bn') ? 'programa-oficial.html' : 'programa-oficial-color.html';
const tablaSel  = flag('--bn') ? 'table.inscriptos' : 'table.inscriptos-color';

const EMAIL = process.env.SGH_EMAIL, PASSWORD = process.env.SGH_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Faltan SGH_EMAIL / SGH_PASSWORD.\n' +
    'Las páginas del programa leen por RLS: sin sesión, Supabase devuelve 0 carreras\n' +
    'y el conteo daría 0 filas envueltas por vacío, no por estar bien.');
  process.exit(2);
}

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('Falta playwright: npm install'); process.exit(2); }

let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  console.error('No se pudo lanzar chromium:', err.message.split('\n')[0]);
  console.error('Si es Ubuntu 26.04, es la limitación de docs/SERVER.md: correlo en otra máquina.');
  process.exit(2);
}

const ctx  = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.error('  [browser]', m.text()); });

try {
  // 1) login: la sesión de Supabase queda en localStorage y la comparte todo el origin
  await page.goto(`${base}/login.html`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await Promise.all([
    page.waitForURL(u => !u.pathname.endsWith('login.html'), { timeout: 30000 }),
    page.click('button[type="submit"], #btn-login'),
  ]);

  // 2) el programa
  await page.goto(`${base}/${pagina}?reunion_id=${reunionId}`, { waitUntil: 'networkidle' });
  await page.waitForSelector(`${tablaSel} tbody tr`, { timeout: 30000 });

  // 3) medir. Una fila "envuelve" si es más alta que la fila de una sola línea.
  //    La altura de referencia se toma como la MODA de las alturas: en una tabla sana
  //    la enorme mayoría de las filas mide lo mismo, y esa es la altura de una línea.
  const medicion = await page.evaluate((sel) => {
    const filas = [...document.querySelectorAll(`${sel} tbody tr`)];
    const alturas = filas.map(tr => Math.round(tr.getBoundingClientRect().height));
    const conteo = new Map();
    alturas.forEach(h => conteo.set(h, (conteo.get(h) || 0) + 1));
    const unaLinea = [...conteo.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];

    const envueltas = [];
    filas.forEach((tr, i) => {
      const h = Math.round(tr.getBoundingClientRect().height);
      if (h > unaLinea * 1.4) {
        const celdas = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        envueltas.push({ fila: i + 1, altura: h, lineas: +(h / unaLinea).toFixed(1), celdas });
      }
    });

    // además: celdas cuyo contenido excede el ancho asignado (desborde sin envolver)
    const desbordadas = [];
    document.querySelectorAll(`${sel} tbody td`).forEach(td => {
      if (td.scrollWidth > td.clientWidth + 1) {
        desbordadas.push({ texto: td.textContent.trim(), scroll: td.scrollWidth, client: td.clientWidth });
      }
    });

    return { total: filas.length, unaLinea, envueltas, desbordadas, tablas: document.querySelectorAll(sel).length };
  }, tablaSel);

  console.log(`\n=== probe_alineado_browser — ${pagina} — reunión ${reunionId.slice(0, 8)} ===\n`);
  console.log(`${medicion.tablas} tablas, ${medicion.total} filas`);
  console.log(`altura de una línea: ${medicion.unaLinea}px\n`);

  if (medicion.envueltas.length) {
    console.log(`❌ ${medicion.envueltas.length} filas ocupan más de una línea:\n`);
    medicion.envueltas.forEach(f => {
      console.log(`  fila ${f.fila} — ${f.altura}px (~${f.lineas} líneas)`);
      console.log(`    ${f.celdas.join(' | ').slice(0, 160)}`);
    });
  } else {
    console.log('✅ 0 filas envueltas — una línea por caballo');
  }

  if (medicion.desbordadas.length) {
    console.log(`\n⚠️  ${medicion.desbordadas.length} celdas desbordan su ancho sin envolver:`);
    medicion.desbordadas.slice(0, 10).forEach(c =>
      console.log(`  "${c.texto.slice(0, 50)}" ${c.scroll}px en ${c.client}px`));
  }

  console.log('');
  process.exit(medicion.envueltas.length === 0 ? 0 : 1);
} catch (err) {
  console.error('\n[probe_alineado_browser]', err.message);
  process.exit(2);
} finally {
  await browser.close();
}
