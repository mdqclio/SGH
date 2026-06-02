/**
 * Probe: vacante manual (feat/vacante-manual)
 *
 * Verifica el flujo 100% manual de vacante vía checkbox por apuesta.
 * Ya NO hay auto-cálculo: el checkbox es la única vía.
 *
 *   T01  Panel de dividendos presente en modo edición
 *   T02  Estado base: checkbox de GAN existe y está destildado (vacante=false)
 *   T03  Tildar GAN → input GAN-1 queda disabled
 *   T04  F10 → reload → checkbox GAN tildado y DB GAN.vacante=true (persiste)
 *   T05  Destildar GAN → F10 → reload → DB GAN.vacante=false
 *   T06  F8 con fila preexistente tildada (sin guardar) → sigue tildada
 *        (vacante en memoria manda sobre el false de DB)
 *   T07  F8 con tipo SIN fila previa en DB (create-path de markVacante) →
 *        sigue tildado y con inputs disabled (filas memory-only sobreviven)
 *
 * Usa Turno 1 (f49bb3ff) — 9 ratificados, GAN/SEG/TER/EX/IM/TR/X2 habilitadas.
 * Setup deja en DB solo GAN/EX/X2 (vacante=false); SEG/TER/IM/TR quedan sin
 * fila → ejercita el create-path de markVacante en T07.
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

// Localiza el checkbox de vacante de un tipo (el onchange lleva el tipo embebido)
const isVacChecked = (page, tipo) => page.evaluate(t => {
  const cb = [...document.querySelectorAll('.dv-vac-chk input[type=checkbox]')]
    .find(c => (c.getAttribute('onchange') || '').includes(`'${t}'`));
  return cb ? cb.checked : null;
}, tipo);

// Tilda/destilda el checkbox de un tipo vía click real (dispara onchange)
const setVac = (page, tipo, want) => page.evaluate(({ t, want }) => {
  const cb = [...document.querySelectorAll('.dv-vac-chk input[type=checkbox]')]
    .find(c => (c.getAttribute('onchange') || '').includes(`'${t}'`));
  if (!cb) return false;
  if (cb.checked !== want) cb.click();
  return true;
}, { t: tipo, want });

const inputDisabled = (page, id) => page.$eval(id, el => el.disabled).catch(() => null);

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

  // Estado base: solo GAN/EX/X2, todas vacante=false.
  // SEG/TER/IM/TR quedan sin fila → create-path de markVacante en T07.
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
  console.log(`\n=== probe_vacante_manual.mjs (${USE_PROD ? 'PROD' : 'localhost:8080'}) ===\n`);

  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page    = await ctx.newPage();

  let resId = null;
  try {
    // ── Setup: snapshot + reset a estado base ────────────────────────────────
    resId = await setupT1();

    // ── Auth ─────────────────────────────────────────────────────────────────
    const session = await buildSession();
    await ctx.addInitScript(({ key, val }) => localStorage.setItem(key, val), {
      key: STORAGE_KEY, val: JSON.stringify(session),
    });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('#marc-grid-inner, .carreras-grid', { timeout: 12000 });

    // ── Navegar a Turno 1 ────────────────────────────────────────────────────
    await navigateToCarrera(page, CARRERA_T1);
    await page.waitForSelector('#marc-grid-inner', { timeout: 6000 });

    // ── T01: panel presente en modo edición ──────────────────────────────────
    const panelExists = await page.$('#div-view-container').then(el => !!el).catch(() => false);
    check('T01', panelExists, 'Panel #div-view-container presente');

    // ── T02: estado base — GAN destildado ─────────────────────────────────────
    const ganBase = await isVacChecked(page, 'GAN');
    check('T02', ganBase === false, `Checkbox GAN destildado en base (vacante=false) → ${ganBase}`);

    // ── T03: tildar GAN → input GAN-1 disabled ───────────────────────────────
    const ganSet = await setVac(page, 'GAN', true);
    await page.waitForTimeout(400);
    const ganDisabled = await inputDisabled(page, '#div-inp-GAN-1');
    check('T03', ganSet && ganDisabled === true, `Tildar GAN → input GAN-1 disabled → ${ganDisabled}`);

    await page.screenshot({ path: `${SS_DIR}/vacante_manual_gan_tilde.png` });

    // ── T04: F10 → reload → tilde persiste en DB ─────────────────────────────
    await page.keyboard.press('F10');
    const saved04 = await waitForToast(page);
    await page.waitForTimeout(600);
    await navigateToCarrera(page, CARRERA_T1);
    await page.waitForTimeout(800);

    const ganAfterReload = await isVacChecked(page, 'GAN');
    const ganDbTrue = (await dbApuestas(resId)).find(a => a.tipo === 'GAN');
    check('T04', saved04 && ganAfterReload === true && ganDbTrue?.vacante === true,
      `F10+reload: checkbox=${ganAfterReload}, DB GAN.vacante=${ganDbTrue?.vacante} (esperado true/true)`);

    // ── T05: destildar GAN → F10 → DB vacante=false ──────────────────────────
    await setVac(page, 'GAN', false);
    await page.waitForTimeout(300);
    await page.keyboard.press('F10');
    const saved05 = await waitForToast(page);
    await page.waitForTimeout(600);
    await navigateToCarrera(page, CARRERA_T1);
    await page.waitForTimeout(800);

    const ganDbFalse = (await dbApuestas(resId)).find(a => a.tipo === 'GAN');
    check('T05', saved05 && ganDbFalse?.vacante === false,
      `Destildar+F10: DB GAN.vacante=${ganDbFalse?.vacante} (esperado false)`);

    // ── T06: F8 con fila preexistente tildada (sin guardar) → sigue tildada ──
    // GAN existe en DB con vacante=false. La tildamos en memoria y NO guardamos.
    await setVac(page, 'GAN', true);
    await page.waitForTimeout(300);
    await page.keyboard.press('F8');
    await page.waitForTimeout(1200);

    const ganAfterF8 = await isVacChecked(page, 'GAN');
    const ganDisabledF8 = await inputDisabled(page, '#div-inp-GAN-1');
    check('T06', ganAfterF8 === true && ganDisabledF8 === true,
      `F8 no pisa fila preexistente tildada: checkbox=${ganAfterF8}, disabled=${ganDisabledF8} (esperado true/true)`);

    await page.screenshot({ path: `${SS_DIR}/vacante_manual_f8_preexistente.png` });

    // ── T07: F8 con tipo SIN fila en DB (create-path) → sigue tildado ────────
    // SEG no tiene fila en DB (setup la borró). markVacante crea filas memory-only.
    const segSet = await setVac(page, 'SEG', true);
    await page.waitForTimeout(400);
    const segDisabledBefore = await inputDisabled(page, '#div-inp-SEG-1');
    await page.keyboard.press('F8');
    await page.waitForTimeout(1200);

    const segAfterF8 = await isVacChecked(page, 'SEG');
    const segDisabledF8 = await inputDisabled(page, '#div-inp-SEG-1');
    check('T07', segSet && segDisabledBefore === true && segAfterF8 === true && segDisabledF8 === true,
      `F8 no pisa fila memory-only tildada: checkbox=${segAfterF8}, disabled=${segDisabledF8} (esperado true/true)`);

    await page.screenshot({ path: `${SS_DIR}/vacante_manual_f8_memonly.png` });

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
