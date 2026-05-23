/**
 * Smoke: navegación entre carreras + dirty-check guard.
 *
 * T1 — dirty bloquea "← Carreras" (confirm aparece)
 * T2 — confirm OK descarta cambios y vuelve a la lista
 * T3 — F10 limpia isDirty (no confirm al salir tras save)
 * T4 — "Siguiente →" navega al turno siguiente; disabled en la última carrera
 * T5 — "← Anterior" navega al turno anterior; disabled en la primera carrera
 * T6 — etiqueta "Turno X / N" correcta
 * T7 — dirty + Siguiente → confirm; Cancel preserva el formulario
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVubGhjdWFuZnJ0cGF0b2lwd3ZlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjcyNDQ5NywiZXhwIjoyMDkyMzAwNDk3fQ.drl2zQmZ3NMEksHSv14Jd_1p0HQWQg-_ACihQi3vQcE';
const STORAGE_KEY   = 'sb-unlhcuanfrtpatoipwve-auth-token';
const REUNION_ID    = 'c90b6186-268d-4089-8cc6-71626b627cf8';
const BASE_URL      = `https://mdqclio.github.io/SGH/resultados.html?reunion_id=${REUNION_ID}`;
const DOLORES_EMAIL = 'dolores@sgh.com';
const DOLORES_UID   = '01c55b92-c53e-42fd-948f-ebfdb31b8d65';

const adminSb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function buildSession() {
  const { data, error } = await adminSb.auth.admin.generateLink({ type: 'magiclink', email: DOLORES_EMAIL });
  if (error) throw new Error(error.message);
  const resp = await fetch(data.properties.action_link, { redirect: 'manual' });
  const loc  = resp.headers.get('location') || '';
  const hp   = new URLSearchParams(loc.split('#')[1]);
  const { data: ud } = await adminSb.auth.admin.getUserById(DOLORES_UID);
  const ei = parseInt(hp.get('expires_in') || '3600');
  return { access_token: hp.get('access_token'), refresh_token: hp.get('refresh_token'),
    token_type: 'bearer', expires_in: ei, expires_at: Math.floor(Date.now()/1000)+ei, user: ud?.user };
}

async function loadPage(ctx) {
  const page = await ctx.newPage();
  // Dismiss all native confirm dialogs by default (tests override per-dialog as needed)
  page.on('dialog', d => d.dismiss());
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => {
    const o = document.getElementById('auth-overlay');
    return !o || o.style.display === 'none';
  }, { timeout: 15000 }).catch(()=>{});
  await page.waitForSelector('.carrera-card', { timeout: 15000 });
  return page;
}

async function openTurno(page, numero) {
  const cards = page.locator('.carrera-card');
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const txt = (await cards.nth(i).locator('.cc-num').textContent()).trim();
    if (txt === String(numero)) { await cards.nth(i).click(); break; }
  }
  await page.waitForSelector('#tiempo-ganador', { timeout: 10000 });
  await page.waitForTimeout(500);
}

(async () => {
  const session = await buildSession();
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const ctx = await browser.newContext();
  await ctx.addInitScript(({k,v}) => localStorage.setItem(k,v), { k: STORAGE_KEY, v: JSON.stringify(session) });

  const results = [];
  const col = (s,n) => String(s??'').padEnd(n);
  const push = (test, ok, note='') => results.push({ test, status: ok ? '✅' : '❌', note });

  /* ── T1: dirty bloquea "← Carreras" ── */
  {
    const page = await loadPage(ctx);
    await openTurno(page, 6);
    // Dirty the form
    await page.locator('#incidentes').fill('SUCIA');
    // Intercept the dialog to verify it fires; dismiss (cancel)
    let dialogFired = false;
    page.once('dialog', async d => { dialogFired = true; await d.dismiss(); });
    await page.locator('button:has-text("← Carreras")').click();
    await page.waitForTimeout(300);
    // Should still be on the form (dialog was dismissed)
    const stillOnForm = await page.locator('#tiempo-ganador').count() > 0;
    push('T1 — dirty bloquea ← Carreras', dialogFired && stillOnForm,
      `dialog: ${dialogFired} | form presente: ${stillOnForm}`);
    await page.close();
  }

  /* ── T2: confirm OK descarta cambios y vuelve a la lista ── */
  {
    const page = await loadPage(ctx);
    await openTurno(page, 6);
    await page.locator('#incidentes').fill('SUCIA');
    // Accept the confirm dialog this time
    page.once('dialog', d => d.accept());
    await page.locator('button:has-text("← Carreras")').click();
    await page.waitForTimeout(500);
    const onList = await page.locator('.carrera-card').count() > 0;
    const noForm = await page.locator('#tiempo-ganador').count() === 0;
    push('T2 — OK descarta y vuelve a lista', onList && noForm,
      `lista visible: ${onList} | form ausente: ${noForm}`);
    await page.close();
  }

  /* ── T3: F10 limpia dirty (sin confirm al salir tras save) ── */
  {
    const page = await loadPage(ctx);
    await openTurno(page, 6);
    await page.locator('#incidentes').fill('SUCIA');
    // Save
    await page.keyboard.press('F10');
    await page.waitForSelector('.toast', { timeout: 8000 }).catch(()=>{});
    await page.waitForTimeout(400);
    // Now navigate back — should NOT trigger confirm
    let dialogFired = false;
    page.once('dialog', async d => { dialogFired = true; await d.dismiss(); });
    await page.locator('button:has-text("← Carreras")').click();
    await page.waitForTimeout(400);
    const onList = await page.locator('.carrera-card').count() > 0;
    push('T3 — F10 limpia dirty', !dialogFired && onList,
      `dialog: ${dialogFired} | lista: ${onList}`);
    await page.close();
  }

  /* ── T4: Siguiente → navega; disabled en última carrera ── */
  {
    const page = await loadPage(ctx);
    await openTurno(page, 6);
    // Get current turno label
    const labelBefore = (await page.locator('span:has-text("Turno")').filter({ hasText: '/' }).textContent()).trim();
    // Click Siguiente
    await page.locator('button:has-text("Siguiente →")').click();
    await page.waitForSelector('#tiempo-ganador', { timeout: 10000 });
    await page.waitForTimeout(400);
    const labelAfter = (await page.locator('span:has-text("Turno")').filter({ hasText: '/' }).textContent()).trim();
    // Extract index from "Turno X / N"
    const numBefore = parseInt(labelBefore.match(/Turno\s+(\d+)/)?.[1]||'0');
    const numAfter  = parseInt(labelAfter.match(/Turno\s+(\d+)/)?.[1]||'0');
    const navigated = numAfter === numBefore + 1;

    // Navigate to last carrera and check disabled
    const totalMatch = labelBefore.match(/\/\s*(\d+)/);
    const total = totalMatch ? parseInt(totalMatch[1]) : null;
    // Navigate to last using Siguiente repeatedly
    let btnDisabled = false;
    for (let i = numAfter; i < (total||0); i++) {
      const btn = page.locator('button:has-text("Siguiente →")');
      if (await btn.isDisabled()) { btnDisabled = true; break; }
      await btn.click();
      await page.waitForTimeout(300);
    }
    btnDisabled = btnDisabled || await page.locator('button:has-text("Siguiente →")').isDisabled();

    push('T4 — Siguiente navega; disabled en última', navigated && btnDisabled,
      `${labelBefore} → ${labelAfter} | navigated: ${navigated} | disabled en última: ${btnDisabled}`);
    await page.close();
  }

  /* ── T5: ← Anterior navega; disabled en primera carrera ── */
  {
    const page = await loadPage(ctx);
    await openTurno(page, 6);
    const labelBefore = (await page.locator('span:has-text("Turno")').filter({ hasText: '/' }).textContent()).trim();
    await page.locator('button:has-text("← Anterior")').click();
    await page.waitForSelector('#tiempo-ganador', { timeout: 10000 });
    await page.waitForTimeout(400);
    const labelAfter = (await page.locator('span:has-text("Turno")').filter({ hasText: '/' }).textContent()).trim();
    const numBefore = parseInt(labelBefore.match(/Turno\s+(\d+)/)?.[1]||'0');
    const numAfter  = parseInt(labelAfter.match(/Turno\s+(\d+)/)?.[1]||'0');
    const navigated = numAfter === numBefore - 1;

    // Go to turno 1 and check disabled
    await openTurno(page, 1);
    await page.waitForTimeout(300);
    const btnDisabled = await page.locator('button:has-text("← Anterior")').isDisabled();

    push('T5 — Anterior navega; disabled en primera', navigated && btnDisabled,
      `${labelBefore} → ${labelAfter} | navigated: ${navigated} | disabled en primera: ${btnDisabled}`);
    await page.close();
  }

  /* ── T6: etiqueta "Turno X / N" correcta ── */
  {
    const page = await loadPage(ctx);
    const totalCards = await page.locator('.carrera-card').count();
    await openTurno(page, 1);
    const labelTxt = (await page.locator('span:has-text("Turno")').filter({ hasText: '/' }).textContent()).trim();
    const m = labelTxt.match(/Turno\s+(\d+)\s*\/\s*(\d+)/);
    const correctIdx   = m ? parseInt(m[1]) === 1 : false;
    const correctTotal = m ? parseInt(m[2]) === totalCards : false;
    push('T6 — etiqueta Turno X / N correcta', correctIdx && correctTotal,
      `label: "${labelTxt}" | cards: ${totalCards}`);
    await page.close();
  }

  /* ── T7: dirty + Siguiente → confirm; Cancel preserva form ── */
  {
    const page = await loadPage(ctx);
    await openTurno(page, 6);
    const incOriginal = await page.locator('#incidentes').inputValue();
    await page.locator('#incidentes').fill('DIRTY_TEST');
    const labelBefore = (await page.locator('span:has-text("Turno")').filter({ hasText: '/' }).textContent()).trim();

    // Dismiss (Cancel)
    let dialogFired = false;
    page.once('dialog', async d => { dialogFired = true; await d.dismiss(); });
    await page.locator('button:has-text("Siguiente →")').click();
    await page.waitForTimeout(400);

    const labelAfter = (await page.locator('span:has-text("Turno")').filter({ hasText: '/' }).textContent()).trim();
    const stayedSame = labelBefore === labelAfter;
    const incValue   = await page.locator('#incidentes').inputValue();
    const preserved  = incValue === 'DIRTY_TEST';

    push('T7 — dirty + Siguiente + Cancel preserva form', dialogFired && stayedSame && preserved,
      `dialog: ${dialogFired} | label ${labelBefore}→${labelAfter} | incidentes: "${incValue}"`);

    // Restore incidentes original value (don't leave dirty state)
    page.once('dialog', d => d.accept());
    await page.locator('button:has-text("← Carreras")').click();
    await page.waitForTimeout(300);
    await page.close();
  }

  await browser.close();

  // ── Reporte ──────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(100));
  console.log('  SMOKE: nav entre carreras + dirty-check guard');
  console.log('═'.repeat(100));
  console.log(col('Test',45) + col('Estado',8) + 'Nota');
  console.log('─'.repeat(100));
  for (const r of results) console.log(col(r.test,45) + col(r.status,8) + r.note);
  const pass = results.filter(r=>r.status==='✅').length;
  const fail = results.filter(r=>r.status==='❌').length;
  console.log('─'.repeat(100));
  console.log(`Total: ${results.length} | ✅ ${pass} | ❌ ${fail}`);
  console.log('═'.repeat(100) + '\n');
  if (fail > 0) process.exit(1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
