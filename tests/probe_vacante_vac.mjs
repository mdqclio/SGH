/**
 * Probe: vacante por "VAC" inline (feat/vacante-vac-inline)
 *
 * Vacante se marca escribiendo "VAC" en el MISMO input donde va el monto.
 * Dato solo informativo (Stud Book + página); NO entra en liquidación.
 *
 *   T01  Panel de dividendos presente en modo edición
 *   T02  Escribir "VAC" en GAN → F10 → DB GAN.vacante=true, div_orig=null
 *   T03  Escribir número en GAN → F10 → DB GAN.vacante=false, div_orig=número
 *   T04  Escribir "VAC" en una combinada (X2) → F10 → DB X2.vacante=true, div_orig=null
 *   T05  F8 con fila preexistente: "VAC" tipeado sin guardar → F8 → sigue "VAC"
 *   T06  F8 con tipo SIN fila en DB (SEG, create-path) → "VAC" → F8 → sigue "VAC"
 *
 * Usa Turno 1 (f49bb3ff) — 9 ratificados, GAN/SEG/TER/EX/IM/TR/X2 habilitadas.
 * Setup deja en DB solo GAN/EX/X2 (vacante=false); SEG queda sin fila → T06.
 * Por defecto: localhost:8080. Con --prod: https://mdqclio.github.io/SGH
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'fs';

const USE_PROD      = process.argv.includes('--prod');
const SUPABASE_URL  = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVubGhjdWFuZnJ0cGF0b2lwd3ZlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjcyNDQ5NywiZXhwIjoyMDkyMzAwNDk3fQ.drl2zQmZ3NMEksHSv14Jd_1p0HQWQg-_ACihQi3vQcE';
const STORAGE_KEY   = 'sb-unlhcuanfrtpatoipwve-auth-token';
const REUNION_ID    = 'c90b6186-268d-4089-8cc6-71626b627cf8';
const CARRERA_T1    = 'f49bb3ff-5596-4126-abe9-26271d9b179a';
const DOLORES_EMAIL = 'dolores@sgh.com';
const DOLORES_UID   = '01c55b92-c53e-42fd-948f-ebfdb31b8d65';

const BASE_HOST = USE_PROD ? 'https://mdqclio.github.io/SGH' : 'http://localhost:8080';
const BASE_URL  = `${BASE_HOST}/resultados.html?reunion_id=${REUNION_ID}`;

const SS_DIR = '/workspaces/SGH/docs/smoke_screenshots';
mkdirSync(SS_DIR, { recursive: true });

const adminSb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0, failed = 0;
function check(id, ok, note) {
  console.log(`  ${ok ? '✅' : '❌'}  [${id}] ${note}`);
  ok ? passed++ : failed++;
}

async function buildSession() {
  const { data: linkData, error: linkErr } = await adminSb.auth.admin.generateLink({
    type: 'magiclink', email: DOLORES_EMAIL,
  });
  if (linkErr) throw new Error(`generateLink: ${linkErr.message}`);
  const resp = await fetch(linkData.properties.action_link, { redirect: 'manual' });
  const loc  = resp.headers.get('location') || '';
  if (!loc.includes('access_token')) throw new Error(`No access_token: ${loc.slice(0, 100)}`);
  const hp = new URLSearchParams(loc.split('#')[1]);
  const { data: ud } = await adminSb.auth.admin.getUserById(DOLORES_UID);
  return {
    access_token:  hp.get('access_token'),
    token_type:    'bearer',
    expires_in:    parseInt(hp.get('expires_in') || '3600'),
    expires_at:    Math.floor(Date.now() / 1000) + parseInt(hp.get('expires_in') || '3600'),
    refresh_token: hp.get('refresh_token'),
    user:          ud?.user,
  };
}

async function navigateToCarrera(page, carreraId) {
  await page.evaluate(id => { if (typeof abrirResultado === 'function') abrirResultado(id); }, carreraId);
  await page.waitForTimeout(1500);
}

async function waitForToast(page, timeoutMs = 6000) {
  try { await page.waitForSelector('.toast-success', { timeout: timeoutMs }); return true; }
  catch { return false; }
}

// Escribe en un input de dividendo y dispara input+blur (el blur normaliza VAC)
const setInput = (page, id, value) => page.evaluate(({ id, value }) => {
  const el = document.getElementById(id);
  if (!el) return false;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('blur',  { bubbles: true }));
  return true;
}, { id, value });

const inputVal = (page, id) => page.$eval(id, el => el.value).catch(() => null);

const dbApuestas = async (resId) => {
  const { data } = await adminSb
    .from('resultado_apuestas').select('tipo,div_orig,vacante,orden').eq('resultado_id', resId);
  return data || [];
};

// Snapshot del estado actual de T1 + reset a estado base para el test
let snapshot = null;

async function setupT1() {
  const { data: resRow } = await adminSb.from('resultados').select('id').eq('carrera_id', CARRERA_T1).single();
  if (!resRow) throw new Error('No resultado para T1');
  const resId = resRow.id;

  const [{ data: pos }, { data: apu }] = await Promise.all([
    adminSb.from('resultado_posiciones').select('*').eq('resultado_id', resId),
    adminSb.from('resultado_apuestas').select('*').eq('resultado_id', resId),
  ]);
  snapshot = { resId, pos: pos || [], apu: apu || [] };

  // Estado base: solo GAN/EX/X2, todas vacante=false. SEG queda sin fila → T06 (create-path).
  await adminSb.from('resultado_apuestas').delete().eq('resultado_id', resId).not('tipo', 'in', '(GAN,EX,X2)');
  await adminSb.from('resultado_apuestas').update({ vacante: false }).eq('resultado_id', resId);
  return resId;
}

// Restaura T1 exactamente al estado previo al test (idempotente)
async function teardownT1() {
  if (!snapshot) return;
  const { resId, pos, apu } = snapshot;

  await adminSb.from('resultado_apuestas').delete().eq('resultado_id', resId);
  if (apu.length) {
    const rows = apu.map(({ id: _id, created_at: _ca, ...rest }) => rest);
    await adminSb.from('resultado_apuestas').insert(rows);
  }

  await adminSb.from('resultado_posiciones').delete().eq('resultado_id', resId);
  if (pos.length) {
    const rows = pos.map(({ id: _id, created_at: _ca, ...rest }) => rest);
    await adminSb.from('resultado_posiciones').insert(rows);
  }
}

(async () => {
  console.log(`\n=== probe_vacante_vac.mjs (${USE_PROD ? 'PROD' : 'localhost:8080'}) ===\n`);

  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page    = await ctx.newPage();

  let resId = null;
  try {
    resId = await setupT1();

    const session = await buildSession();
    await ctx.addInitScript(({ key, val }) => localStorage.setItem(key, val), {
      key: STORAGE_KEY, val: JSON.stringify(session),
    });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('#marc-grid-inner, .carreras-grid', { timeout: 12000 });

    await navigateToCarrera(page, CARRERA_T1);
    await page.waitForSelector('#marc-grid-inner', { timeout: 6000 });
    // Vista Detallada para que rendericen directas/combinadas
    await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('det'); });
    await page.waitForTimeout(300);

    // ── T01: panel presente ──────────────────────────────────────────────────
    const panelExists = await page.$('#div-view-container').then(el => !!el).catch(() => false);
    check('T01', panelExists, 'Panel #div-view-container presente');

    // ── T02: "VAC" en GAN → F10 → DB vacante=true, div_orig=null ─────────────
    await setInput(page, 'div-inp-GAN-1', 'vac');  // lowercase → normaliza a VAC
    await page.waitForTimeout(200);
    await page.keyboard.press('F10');
    const saved02 = await waitForToast(page);
    await page.waitForTimeout(500);
    const ganVac = (await dbApuestas(resId)).find(a => a.tipo === 'GAN');
    check('T02', saved02 && ganVac?.vacante === true && ganVac?.div_orig == null,
      `VAC en GAN → DB vacante=${ganVac?.vacante}, div_orig=${ganVac?.div_orig} (esperado true/null)`);

    await page.screenshot({ path: `${SS_DIR}/vacante_vac_gan.png` });

    // ── T03: número en GAN → F10 → DB vacante=false, div_orig=1500 ───────────
    await setInput(page, 'div-inp-GAN-1', '1500');
    await page.waitForTimeout(200);
    await page.keyboard.press('F10');
    const saved03 = await waitForToast(page);
    await page.waitForTimeout(500);
    const ganNum = (await dbApuestas(resId)).find(a => a.tipo === 'GAN');
    check('T03', saved03 && ganNum?.vacante === false && Number(ganNum?.div_orig) === 1500,
      `Número en GAN → DB vacante=${ganNum?.vacante}, div_orig=${ganNum?.div_orig} (esperado false/1500)`);

    // ── T04: "VAC" en combinada X2 → F10 → DB vacante=true, div_orig=null ────
    const x2Set = await setInput(page, 'div-inp-X2-1', 'VAC');
    await page.waitForTimeout(200);
    await page.keyboard.press('F10');
    const saved04 = await waitForToast(page);
    await page.waitForTimeout(500);
    const x2Vac = (await dbApuestas(resId)).find(a => a.tipo === 'X2');
    check('T04', x2Set && saved04 && x2Vac?.vacante === true && x2Vac?.div_orig == null,
      `VAC en X2 (combinada) → DB vacante=${x2Vac?.vacante}, div_orig=${x2Vac?.div_orig} (esperado true/null)`);

    await page.screenshot({ path: `${SS_DIR}/vacante_vac_x2.png` });

    // ── T05: F8 no pisa VAC tipeado sin guardar (fila preexistente) ──────────
    // GAN está en DB con vacante=false (T03). Tipeamos VAC y NO guardamos.
    await setInput(page, 'div-inp-GAN-1', 'VAC');
    await page.waitForTimeout(200);
    await page.keyboard.press('F8');
    await page.waitForTimeout(1200);
    const ganAfterF8 = await inputVal(page, 'div-inp-GAN-1');
    check('T05', ganAfterF8 === 'VAC',
      `F8 no pisa VAC preexistente: input GAN-1="${ganAfterF8}" (esperado "VAC")`);

    // ── T06: F8 no pisa VAC en tipo sin fila en DB (SEG, create-path) ────────
    const segSet = await setInput(page, 'div-inp-SEG-1', 'VAC');
    await page.waitForTimeout(200);
    await page.keyboard.press('F8');
    await page.waitForTimeout(1200);
    const segAfterF8 = await inputVal(page, 'div-inp-SEG-1');
    check('T06', segSet && segAfterF8 === 'VAC',
      `F8 no pisa VAC memory-only: input SEG-1="${segAfterF8}" (esperado "VAC")`);

    await page.screenshot({ path: `${SS_DIR}/vacante_vac_f8.png` });

  } finally {
    await browser.close();
    await teardownT1();
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  passed: ${passed}   failed: ${failed}   total: ${passed + failed}`);
  if (failed > 0) {
    console.log(`\n  ❌ PROBE FAILED (${failed} check${failed !== 1 ? 's' : ''})`);
    process.exit(1);
  } else {
    console.log(`\n  ✅ PROBE OK — ${passed}/${passed + failed} verde`);
  }
})();
