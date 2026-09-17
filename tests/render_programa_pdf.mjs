/**
 * render_programa_pdf.mjs — imprime programa-oficial(-color).html a PDF + PNG por página,
 * con Chromium headless, para MIRAR el papel (alineación de columnas, envolturas, cortes de
 * página). Es la verificación visual que ningún assert cubre.
 *
 * Uso:
 *   set -a; . ./.env; set +a
 *   node tests/render_programa_pdf.mjs <reunion_id> [color|bn] [out_dir] [html_base_url]
 *
 *   html_base_url por defecto http://127.0.0.1:8765 (levantar antes: python3 -m http.server 8765
 *   en la raíz del repo). Con https://sigh.com.ar renderiza lo que está en prod.
 *
 * Chromium: Playwright del repo (node_modules) + el chrome-headless-shell que haya en
 * ~/.cache/ms-playwright. En este Ubuntu 26.04 faltan libs del sistema (libnss3, libatk...) y
 * no hay sudo: se bajan con `apt-get download` y se extraen con `dpkg -x` a un directorio de
 * usuario, y se pasa por LD_LIBRARY_PATH (ver docs/SERVER.md, "PDF sin sudo"). La variable
 * CHROME_HEADLESS_SHELL permite apuntar a otro binario.
 *
 * ESCRIBE: 1 usuario de prueba (auth + usuarios), rol secretario_carreras del club Dolores,
 * para que la página pase RLS; teardown en el finally, verificado por estado.
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const PUBLISHABLE = 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }

const [reunionId, modo = 'color', outDir = 'tests/out', base = 'http://127.0.0.1:8765'] = process.argv.slice(2);
if (!reunionId) { console.error('Uso: node tests/render_programa_pdf.mjs <reunion_id> [color|bn] [out_dir] [base_url]'); process.exit(2); }
const pagina = modo === 'bn' ? 'programa-oficial.html' : 'programa-oficial-color.html';

function headlessShell() {
  if (process.env.CHROME_HEADLESS_SHELL) return process.env.CHROME_HEADLESS_SHELL;
  const cache = join(process.env.HOME, '.cache/ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-')).sort() : [];
  if (!dirs.length) throw new Error('No hay chromium_headless_shell en ' + cache);
  return join(cache, dirs.at(-1), 'chrome-headless-shell-linux64/chrome-headless-shell');
}

const admin = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const RUN = Date.now().toString(36);
const email = `render.programa.${RUN}@sgh.test`;
const password = `Px-${RUN}-${Math.random().toString(36).slice(2)}`;
let authId = null;
try {
  const { data: au, error: eAu } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (eAu) throw new Error('createUser: ' + eAu.message);
  authId = au.user.id;
  const { error: eIns } = await admin.from('usuarios').insert({ email, nombre_completo: `Render programa ${RUN}`, club_id: CLUB, rol: 'secretario_carreras', activo: true, estado: 'activo', password_hash: '', auth_user_id: authId });
  if (eIns) throw new Error('insert usuarios: ' + eIns.message);

  // signInWithPassword server-side choca con el captcha del proyecto: magic link + verifyOtp,
  // como probe_studbook_buscar_e2e.mjs.
  const { data: link, error: eLink } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (eLink) throw new Error('generateLink: ' + eLink.message);
  const anon = createClient(SUPABASE_URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: otp, error: eOtp } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (eOtp) throw new Error('verifyOtp: ' + eOtp.message);
  const session = otp.session;

  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: headlessShell() });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } });
    // supabase-js persiste la sesión en localStorage bajo sb-<ref>-auth-token
    await ctx.addInitScript(s => { localStorage.setItem('sb-unlhcuanfrtpatoipwve-auth-token', JSON.stringify(s)); }, session);
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
    const url = `${base}/${pagina}?reunion_id=${reunionId}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    // EXTRA_CSS: CSS adicional para probar variantes (márgenes, anchos) sin tocar el archivo.
    if (process.env.EXTRA_CSS) await page.addStyleTag({ content: process.env.EXTRA_CSS });
    await page.waitForFunction(() => document.querySelectorAll('table tbody tr').length > 0, null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);

    const tablas = await page.evaluate(() => [...document.querySelectorAll('table')].map(t => {
      const th = [...t.querySelectorAll('thead th')];
      const firstRow = t.querySelector('tbody tr');
      const tds = firstRow ? [...firstRow.children] : [];
      return { filas: t.querySelectorAll('tbody tr').length, anchos_th: th.map(x => +x.getBoundingClientRect().width.toFixed(1)), x_td: tds.map(x => +x.getBoundingClientRect().left.toFixed(1)) };
    }));

    const stem = join(outDir, `${pagina.replace('.html', '')}_${reunionId.slice(0, 8)}`);
    await page.emulateMedia({ media: 'print' });
    // Ancho útil de A4 con los márgenes del @page (194mm = 733px con 8mm). VIEWPORT_W lo
    // cambia para probar otros márgenes (6mm → 198mm = 748px).
    const VW = +(process.env.VIEWPORT_W || 733);
    await page.setViewportSize({ width: VW, height: 1100 });
    await page.waitForTimeout(300);
    // Celdas que envuelven (más de una caja de línea) al ancho útil de A4, con el ancho real
    // del texto medido por canvas con la fuente que cargó el browser.
    const envueltas = await page.evaluate(() => {
      const cv = document.createElement('canvas').getContext('2d');
      const out = [];
      document.querySelectorAll('table tbody td').forEach(td => {
        const txt = td.textContent.trim(); if (!txt || td.querySelector('.partidor-chip')) return;
        const r = document.createRange(); r.selectNodeContents(td);
        const lineas = new Set([...r.getClientRects()].map(x => Math.round(x.top))).size;
        if (lineas > 1) {
          const cs = getComputedStyle(td); cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const th = td.closest('table').querySelectorAll('thead th')[td.cellIndex];
          out.push({ col: th?.textContent.trim(), txt, lineas, texto_px: +cv.measureText(txt).width.toFixed(1), celda_px: +(td.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)).toFixed(1), font: cv.font });
        }
      });
      return out;
    });
    // Máximo por columna medido por el browser (canvas.measureText con la fuente cargada):
    // es la referencia para calibrar el <colgroup>, no las métricas del TTF.
    const maximos = await page.evaluate(() => {
      const cv = document.createElement('canvas').getContext('2d');
      const out = {};
      document.querySelectorAll('table tbody td').forEach(td => {
        const txt = td.textContent.trim(); if (!txt || td.querySelector('.partidor-chip')) return;
        const cs = getComputedStyle(td); cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const col = td.closest('table').querySelectorAll('thead th')[td.cellIndex]?.textContent.trim();
        const px = +cv.measureText(txt).width.toFixed(1);
        const top = (out[col] ||= []); top.push({ txt, px }); top.sort((a, b) => b.px - a.px); if (top.length > 4) top.length = 4;
      });
      document.querySelectorAll('table thead th').forEach(th => {
        const cs = getComputedStyle(th); cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const t = th.textContent.trim(); (out.__headers ||= {})[t] = +(cv.measureText(t).width + 0.5 * t.length).toFixed(1);
      });
      return out;
    });
    const fuente = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family} ${f.weight}`));
    await page.pdf({ path: `${stem}.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true });
    // PNGs para mirar sin visor de PDF (no hay poppler en el server): media print, viewport del
    // ancho útil de A4 (194mm = 733px), en tiras de 1100px de alto. No reproducen los cortes de
    // página del PDF, sí la grilla de columnas y las envolturas.
    const alto = await page.evaluate(() => document.documentElement.scrollHeight);
    const pngs = [];
    for (let y = 0, i = 1; y < alto; y += 1100, i++) {
      const f = `${stem}_tira${i}.png`;
      await page.screenshot({ path: f, clip: { x: 0, y, width: VW, height: Math.min(1100, alto - y) }, fullPage: true });
      pngs.push(f);
    }
    console.log(JSON.stringify({ url, pdf: `${stem}.pdf`, pngs, alto_px: alto, errores, fuentes_cargadas: fuente, maximos_por_columna_px: maximos, tablas, celdas_envueltas_a4: envueltas }, null, 1));
  } finally { await browser.close(); }
} finally {
  if (authId) {
    await admin.from('usuarios').delete().eq('email', email);
    await admin.auth.admin.deleteUser(authId);
    const { data: rest } = await admin.from('usuarios').select('email').eq('email', email);
    const { data: lst } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const huerf = (lst?.users || []).filter(u => u.email === email);
    console.log(`teardown: usuarios=${(rest || []).length} auth=${huerf.length} (ambos deben ser 0)`);
  }
}
