/**
 * Probe: vacante híbrido (feat/vacante-hibrido)
 *
 * Verifica el flujo completo del auto-mark unidireccional de vacante:
 *
 *   T01  Panel de dividendos presente en modo edición
 *   T02  Con 9 finishers, ninguna apuesta single-race muestra badge vacante
 *   T03  Marcar 8 horses como no_largo → finishers = 1
 *        SEG/TER/EX/IM/TR deben mostrar badge VACANTE auto
 *        GAN NO debe mostrarse como vacante (1 finisher ≥ 1)
 *   T04  Input de SEG slot 1 está disabled cuando vacante=true
 *   T05  Input de GAN está habilitado (no vacante)
 *   T06  Click × en TR → input TR se habilita (vacante=false en memoria)
 *   T07  Escribir monto en TR → F10 → toast éxito
 *   T08  Recargar carrera → TR tiene vacante=false y div_orig guardado
 *   T09  F8 recarga desde DB → TR refleja el estado guardado (no resetea a vacante)
 *
 * Usa Turno 1 (f49bb3ff) — 9 ratificados, GAN/SEG/TER/EX/IM/TR/X2 habilitadas.
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

// Resetea resultado_apuestas de T1 a estado base conocido: GAN/EX/X2 con vacante=false
async function resetApuestasT1() {
  const { data: resRow } = await adminSb.from('resultados').select('id').eq('carrera_id', CARRERA_T1).single();
  if (!resRow) return;
  const resId = resRow.id;
  // Eliminar tipos que no son el estado base
  await adminSb.from('resultado_apuestas')
    .delete().eq('resultado_id', resId).not('tipo', 'in', '(GAN,EX,X2)');
  // Resetear vacante=false en los que quedan
  await adminSb.from('resultado_apuestas')
    .update({ vacante: false }).eq('resultado_id', resId);
}

(async () => {
  console.log(`\n=== probe_vacante_hibrido.mjs (${USE_PROD ? 'PROD' : 'localhost:8080'}) ===\n`);

  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page    = await ctx.newPage();

  try {
    // ── Cleanup: estado base conocido ─────────────────────────────────────────
    await resetApuestasT1();

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

    // ── Limpiar marcador ─────────────────────────────────────────────────────
    await page.evaluate(() => {
      for (let p = 1; p <= 9; p++) {
        const el = document.getElementById(`marc-${p}`);
        if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
      }
    });
    await page.waitForTimeout(300);

    // ── T01: Panel de dividendos existe y está en modo edición ───────────────
    const panelExists = await page.$('#div-view-container').then(el => !!el).catch(() => false);
    check('T01', panelExists, 'Panel #div-view-container presente');

    // ── T02: Sin no_largo → ninguna apuesta muestra badge vacante ────────────
    // Entrar una posición para activar el panel
    await page.evaluate(() => {
      const el = document.getElementById('marc-1');
      if (el) { el.value = '1'; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.waitForTimeout(400);

    // Deshacer cualquier NC previo: si el botón dice "Deshacer", hacer click
    const ncBtnText0 = await page.$eval('#nc-btn', el => el.textContent).catch(() => '');
    if (ncBtnText0.includes('Deshacer')) {
      await page.click('#nc-btn');
      await page.waitForTimeout(400);
    }

    const vacantesBefore = await page.$$eval('.dv-vacante-x', els => els.length).catch(() => 0);
    check('T02', vacantesBefore === 0, `Sin no_largo: 0 badges vacante (encontrado: ${vacantesBefore})`);

    // ── T03: Entrar 1 posición, marcar 8 como no_largo → finishers = 1 ──────
    // solo marc-1 = 1 queda; los demás están vacíos
    await page.evaluate(() => {
      for (let p = 2; p <= 9; p++) {
        const el = document.getElementById(`marc-${p}`);
        if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
      }
    });
    await page.waitForTimeout(200);

    await page.click('#nc-btn');  // deduce mandiles 2-9 como no_largo
    await page.waitForTimeout(600);

    await page.screenshot({ path: `${SS_DIR}/vacante_auto_marked.png` });

    // Con 1 finisher: SEG(≥2), TER(≥3), EX(≥2), IM(≥2), TR(≥3) → vacante
    // GAN(≥1) → no vacante
    const vacanteBadges = await page.$$eval('.dv-vacante', els => {
      return els.map(el => el.closest('[id]')?.id || el.textContent.trim().slice(0, 10));
    }).catch(() => []);

    // Contar badges × (los de single-race en editable)
    const vacantXCount = await page.$$eval('.dv-vacante-x', els => els.length).catch(() => 0);

    // Los tipos habilitados en T1 son GAN,SEG,TER,EX,IM,TR,X2
    // vacante esperados: SEG(2 slots), TER(3 slots), EX, IM, TR → 8 slots total
    // GAN: no vacante. X2: combinada, sin badge.
    check('T03', vacantXCount >= 5,
      `Con 1 finisher: ${vacantXCount} badges [×] (esperado ≥5 para SEG×2+TER×3+EX+IM+TR)`);

    // GAN no debe tener badge vacante
    const ganHasVacante = await page.$eval('#div-inp-GAN-1',
      el => el.closest('.dv-wrap-vacante') !== null).catch(() => false);
    check('T03b', !ganHasVacante, `GAN no tiene clase dv-wrap-vacante (1 finisher ≥ REQUIRED[GAN]=1)`);

    // ── T04: Input SEG-1 deshabilitado cuando vacante ─────────────────────────
    const seg1Disabled = await page.$eval('#div-inp-SEG-1', el => el.disabled).catch(() => false);
    check('T04', seg1Disabled, 'Input #div-inp-SEG-1 disabled cuando SEG es vacante');

    // ── T05: Input GAN-1 habilitado ───────────────────────────────────────────
    const gan1Enabled = await page.$eval('#div-inp-GAN-1', el => !el.disabled).catch(() => false);
    check('T05', gan1Enabled, 'Input #div-inp-GAN-1 habilitado (GAN no vacante)');

    // ── T06: Click × en TR → input TR se habilita ────────────────────────────
    // Buscar el × del badge de TR
    const trXSelector = '#div-inp-TR-1 + .dv-vacante .dv-vacante-x, .dv-wrap-vacante:has(#div-inp-TR-1) .dv-vacante-x';
    // Alternativa robusta: buscar por texto del contenedor
    const trXClicked = await page.evaluate(() => {
      const inp = document.getElementById('div-inp-TR-1');
      if (!inp) return false;
      const wrap = inp.closest('.dv-wrap-vacante');
      if (!wrap) return false;
      const xBtn = wrap.querySelector('.dv-vacante-x');
      if (!xBtn) return false;
      xBtn.click();
      return true;
    });
    await page.waitForTimeout(400);

    check('T06', trXClicked, 'Click × en badge TR ejecutado');

    const trEnabled = await page.$eval('#div-inp-TR-1', el => !el.disabled).catch(() => false);
    check('T06b', trEnabled, 'Input #div-inp-TR-1 habilitado tras click ×');

    await page.screenshot({ path: `${SS_DIR}/vacante_tr_toggled.png` });

    // ── T07: Escribir monto TR → F10 → toast éxito ───────────────────────────
    await page.evaluate(() => {
      const el = document.getElementById('div-inp-TR-1');
      if (el) { el.value = '1234'; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.waitForTimeout(200);

    await page.keyboard.press('F10');
    const saved = await waitForToast(page);
    check('T07', saved, 'F10 → toast éxito tras guardar con TR destildado');

    // ── T08: Recargar carrera → TR tiene vacante=false, div_orig guardado ─────
    await page.waitForTimeout(600);
    await navigateToCarrera(page, CARRERA_T1);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: `${SS_DIR}/vacante_after_reload.png` });

    // TR no debe estar en dv-wrap-vacante tras recargar (se guardó vacante=false)
    const trVacanteAfterReload = await page.evaluate(() => {
      const inp = document.getElementById('div-inp-TR-1');
      if (!inp) return 'no-input';
      return inp.closest('.dv-wrap-vacante') !== null ? 'vacante' : 'ok';
    });
    check('T08', trVacanteAfterReload === 'ok',
      `TR tras recarga: ${trVacanteAfterReload} (esperado: ok, vacante=false)`);

    // Verificar div_orig en DB
    const { data: resRow } = await adminSb
      .from('resultados').select('id').eq('carrera_id', CARRERA_T1).single();
    const resId = resRow?.id;
    if (resId) {
      const { data: apuRows } = await adminSb
        .from('resultado_apuestas').select('tipo,div_orig,vacante').eq('resultado_id', resId);
      const trDb = (apuRows || []).find(a => a.tipo === 'TR');
      check('T08b', trDb && trDb.vacante === false,
        `DB: TR.vacante=${trDb?.vacante} (esperado: false)`);
      check('T08c', trDb && trDb.div_orig != null,
        `DB: TR.div_orig=${trDb?.div_orig} (esperado: non-null)`);
    } else {
      check('T08b', false, 'No se encontró resultado en DB');
      check('T08c', false, 'Skipped');
    }

    // ── T09: F8 recarga desde DB → refleja estado guardado ───────────────────
    await page.keyboard.press('F8');
    await page.waitForTimeout(1000);

    const trAfterF8 = await page.evaluate(() => {
      const inp = document.getElementById('div-inp-TR-1');
      if (!inp) return 'no-input';
      return inp.closest('.dv-wrap-vacante') !== null ? 'vacante' : 'ok';
    });
    check('T09', trAfterF8 === 'ok',
      `F8: TR sigue ok (vacante=false en DB) → ${trAfterF8}`);

    await page.screenshot({ path: `${SS_DIR}/vacante_after_f8.png` });

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
