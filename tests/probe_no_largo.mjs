/**
 * Probe: "no corrió" — feat/no-corrio-v3
 *
 * Verifica el flujo completo del botón "Marcar no corrió" (variante V3).
 *
 * Usa Turno 1 — f49bb3ff — 9 ratificados (mandiles 1..9).
 * El probe entra 7 posiciones (mandiles 1-7), deja los mandiles 8 y 9 sin posición,
 * activa el botón y verifica todo el ciclo: DOM → F10 → recarga → DB → marc-invalid → undo.
 *
 * Por defecto corre contra localhost:8080.
 * Para correr contra prod (main branch):  node tests/probe_no_largo.mjs --prod
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'fs';

// ── Credenciales por entorno (no hardcodear) ─────────────────────────────────
// Las keys salen de variables de entorno. Ej:
//   SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... node tests/probe_no_largo.mjs
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Exportala antes de correr el test (NO hardcodear la key).`);
  return v;
}


const USE_PROD     = process.argv.includes('--prod');
const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY  = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const STORAGE_KEY  = 'sb-unlhcuanfrtpatoipwve-auth-token';
const REUNION_ID   = 'c90b6186-268d-4089-8cc6-71626b627cf8';
const CARRERA_T1   = 'f49bb3ff-5596-4126-abe9-26271d9b179a';
const DOLORES_EMAIL = 'dolores@sgh.com';
const DOLORES_UID  = '01c55b92-c53e-42fd-948f-ebfdb31b8d65';

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

async function pressF10(page) {
  await page.keyboard.press('F10');
}

(async () => {
  console.log(`\n=== probe_no_largo.mjs (${USE_PROD ? 'PROD' : 'localhost:8080'}) ===\n`);

  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page    = await ctx.newPage();

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const session = await buildSession();
    await ctx.addInitScript(({ key, val }) => localStorage.setItem(key, val), {
      key: STORAGE_KEY, val: JSON.stringify(session),
    });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('#marc-grid-inner, .carreras-grid', { timeout: 12000 });

    // ── Navegar a Turno 1 ─────────────────────────────────────────────────
    await navigateToCarrera(page, CARRERA_T1);
    await page.waitForSelector('#marc-grid-inner', { timeout: 6000 });

    // ── T01: Botón "Marcar no corrió" existe ──────────────────────────────
    const ncBtnVisible = await page.$eval('#nc-btn', el => el.textContent.includes('no corrió')).catch(() => false);
    check('T01', ncBtnVisible, 'Botón "Marcar no corrió" presente en el marcador');

    // ── Preparar marcador: entrar mandiles 1-7 en posiciones 1-7 ──────────
    // Primero limpiar inputs existentes
    await page.evaluate(() => {
      for (let p = 1; p <= 9; p++) {
        const el = document.getElementById(`marc-${p}`);
        if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
      }
    });
    await page.waitForTimeout(300);

    // Entrar 7 posiciones
    for (let p = 1; p <= 7; p++) {
      await page.evaluate(([pos, mandil]) => {
        const el = document.getElementById(`marc-${pos}`);
        if (el) { el.value = String(mandil); el.dispatchEvent(new Event('input', { bubbles: true })); }
      }, [p, p]);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(400);

    // ── T02: Click en "Marcar no corrió" ─────────────────────────────────
    await page.click('#nc-btn');
    await page.waitForTimeout(500);

    // ── T03: Panel de confirmación muestra 2 chips deducidos ──────────────
    const panelVisible = await page.$eval('#nc-confirm-panel', el => el.style.display !== 'none').catch(() => false);
    check('T02', panelVisible, 'Panel nc-confirm-panel visible tras click');

    const ncChips = await page.$$eval('#nc-confirm-panel .nc-confirm-chip', els => els.map(e => parseInt(e.textContent)));
    check('T03', ncChips.length === 2 && ncChips.includes(8) && ncChips.includes(9),
      `Panel muestra 2 chips NC: ${JSON.stringify(ncChips)} (esperado: [8,9])`);

    // ── T04: Filas 8 y 9 del marcador muestran chip + "NO CORRIÓ" ────────
    const row8HasNcTag = await page.$eval('#marc-grid-inner', el => {
      const tags = el.querySelectorAll('.nc-tag');
      return tags.length >= 2;
    }).catch(() => false);
    check('T04', row8HasNcTag, 'Marcador tiene ≥2 filas con .nc-tag "no corrió"');

    const ncTagTexts = await page.$$eval('.nc-tag', els => els.map(e => e.textContent.trim().toLowerCase()));
    check('T05', ncTagTexts.every(t => t.includes('corrió') || t.includes('corrio')),
      `Texto de .nc-tag correcto: ${JSON.stringify(ncTagTexts)}`);

    // ── T06: Inputs marc-8 y marc-9 NO existen (reemplazados por chip) ───
    const marc8Gone = await page.$('#marc-8').then(el => !el).catch(() => true);
    const marc9Gone = await page.$('#marc-9').then(el => !el).catch(() => true);
    check('T06', marc8Gone && marc9Gone, 'Inputs marc-8 y marc-9 reemplazados (no hay input de diferencia)');

    // ── T07: Botón cambia a "Deshacer (2 marcados)" ────────────────────────
    const btnText = await page.$eval('#nc-btn', el => el.textContent.trim()).catch(() => '');
    check('T07', btnText.includes('Deshacer') && btnText.includes('2'), `Botón dice: "${btnText}"`);

    // ── T08: M.(F) — celdas 8 y 9 tienen clase nc-out ─────────────────────
    const mf8nc = await page.$eval('#mf-8', el => el.classList.contains('nc-out')).catch(() => false);
    const mf9nc = await page.$eval('#mf-9', el => el.classList.contains('nc-out')).catch(() => false);
    check('T08', mf8nc && mf9nc, `mf-8.nc-out=${mf8nc}, mf-9.nc-out=${mf9nc}`);

    // ── T09: sport inputs 8 y 9 están disabled ────────────────────────────
    const sp8dis = await page.$eval('#sport-8', el => el.disabled).catch(() => false);
    const sp9dis = await page.$eval('#sport-9', el => el.disabled).catch(() => false);
    check('T09', sp8dis && sp9dis, `sport-8.disabled=${sp8dis}, sport-9.disabled=${sp9dis}`);

    // ── T10: Guardar con F10 ───────────────────────────────────────────────
    await page.screenshot({ path: `${SS_DIR}/no_largo_pre_f10.png` });
    await pressF10(page);
    const saved = await waitForToast(page);
    check('T10', saved, 'F10 → toast de éxito tras guardar');

    // ── T11: Recargar y verificar persistencia en DOM ─────────────────────
    await page.waitForTimeout(600);
    await navigateToCarrera(page, CARRERA_T1);
    await page.waitForTimeout(1000);

    const marcAfterReload = await page.evaluate(() => {
      const result = { positions: {}, ncTags: 0 };
      for (let p = 1; p <= 9; p++) {
        const inp = document.getElementById(`marc-${p}`);
        if (inp) result.positions[p] = inp.value;
      }
      result.ncTags = document.querySelectorAll('.nc-tag').length;
      return result;
    });
    check('T11', marcAfterReload.ncTags === 2, `Tras recarga: ${marcAfterReload.ncTags} filas nc-tag (esperado: 2)`);

    const finishersOk = [1,2,3,4,5,6,7].every(p => marcAfterReload.positions[p] === String(p));
    check('T12', finishersOk, `Posiciones 1-7 persistidas: ${JSON.stringify(marcAfterReload.positions)}`);

    await page.screenshot({ path: `${SS_DIR}/no_largo_after_reload.png` });

    // ── T13: DB — verificar resultado_posiciones vía Supabase ─────────────
    const { data: resRows } = await adminSb
      .from('resultados').select('id').eq('carrera_id', CARRERA_T1).single();
    const resId = resRows?.id;

    if (resId) {
      const { data: posRows } = await adminSb
        .from('resultado_posiciones').select('posicion,no_largo').eq('resultado_id', resId);
      const ncRows      = (posRows || []).filter(r => r.no_largo === true);
      const finishRows  = (posRows || []).filter(r => r.no_largo === false || r.no_largo === null);
      check('T13', ncRows.length === 2 && ncRows.every(r => r.posicion === null),
        `DB: ${ncRows.length} filas no_largo=true, posicion=null (esperado: 2)`);
      check('T14', finishRows.length === 7 && finishRows.every(r => r.posicion != null),
        `DB: ${finishRows.length} finishers con posicion (esperado: 7)`);
    } else {
      check('T13', false, 'No se encontró resultado para T1 en DB');
      check('T14', false, 'Skipped (sin resultado_id)');
    }

    // ── T15: Tipear mandil NC en posición → marc-invalid ─────────────────
    // Entrar mandil 8 (NC) en la posición 1
    await page.evaluate(() => {
      const el = document.getElementById('marc-1');
      if (el) { el.value = '8'; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.waitForTimeout(300);
    const marc1Invalid = await page.$eval('#marc-1', el => el.classList.contains('marc-invalid')).catch(() => false);
    check('T15', marc1Invalid, 'Tipear mandil NC en marc-1 → clase marc-invalid');

    // Restaurar marc-1 = 1
    await page.evaluate(() => {
      const el = document.getElementById('marc-1');
      if (el) { el.value = '1'; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.waitForTimeout(200);

    // ── T16: Deshacer — botón revierte estado ─────────────────────────────
    const ncBtnAfterReload = await page.$eval('#nc-btn', el => el.textContent).catch(() => '');
    if (ncBtnAfterReload.includes('Deshacer')) {
      await page.click('#nc-btn');
      await page.waitForTimeout(400);
      const panelGone   = await page.$eval('#nc-confirm-panel', el => el.style.display === 'none').catch(() => false);
      const ncTagsGone  = await page.$$eval('.nc-tag', els => els.length);
      const marc8Back   = await page.$('#marc-8').then(el => !!el).catch(() => false);
      const btnReverted = await page.$eval('#nc-btn', el => el.textContent.includes('Marcar')).catch(() => false);
      check('T16', panelGone && ncTagsGone === 0 && marc8Back && btnReverted,
        `Deshacer: panel oculto=${panelGone}, nc-tags=${ncTagsGone}, marc-8 input=${marc8Back}, btn="${await page.$eval('#nc-btn', el=>el.textContent).catch(()=>'')}"` );
    } else {
      check('T16', false, `Botón no dice "Deshacer" tras recarga — dice: "${ncBtnAfterReload}"`);
    }

    await page.screenshot({ path: `${SS_DIR}/no_largo_undo.png` });

  } finally {
    await browser.close();
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
