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

// ── Credenciales por entorno (no hardcodear) ─────────────────────────────────
// Las keys salen de variables de entorno. Ej:
//   SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... node tests/probe_nav_dirty.mjs
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Exportala antes de correr el test (NO hardcodear la key).`);
  return v;
}


const SUPABASE_URL  = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY   = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const STORAGE_KEY   = 'sb-unlhcuanfrtpatoipwve-auth-token';
const REUNION_ID    = 'c90b6186-268d-4089-8cc6-71626b627cf8';
const RESULTADO_ID  = '052b679b-f539-4c20-9038-a4f2fce48287';
const CARRERA_ID    = 'ee373aea-bb8d-4866-9a11-1f34282dbb73';
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

/** Página fresca con handler de diálogo mutable (evita conflicto on + once). */
async function newPage(ctx) {
  const page = await ctx.newPage();
  let handler = d => d.dismiss();
  page.on('dialog', d => handler(d));
  return { page, setDialog: fn => { handler = fn; } };
}

async function loadLista(ctx) {
  const { page, setDialog } = await newPage(ctx);
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => {
    const o = document.getElementById('auth-overlay');
    return !o || o.style.display === 'none';
  }, { timeout: 15000 }).catch(()=>{});
  await page.waitForSelector('.carrera-card', { timeout: 15000 });
  return { page, setDialog };
}

/** Abre el turno cuyo .cc-num coincide con `numero` desde la lista. */
async function openTurno(page, numero) {
  // Si no estamos en la lista, volver a ella (sin dirty guard)
  if (await page.locator('.carrera-card').count() === 0) {
    await page.evaluate(() => renderLista());
    await page.waitForSelector('.carrera-card', { timeout: 10000 });
  }
  const cards = page.locator('.carrera-card');
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    if ((await cards.nth(i).locator('.cc-num').textContent()).trim() === String(numero)) {
      await cards.nth(i).click();
      break;
    }
  }
  await page.waitForSelector('.res-panel', { timeout: 10000 });
  await page.waitForTimeout(600);
}

async function turnoLabel(page) {
  const el = page.locator('span').filter({ hasText: /Turno \d+ \/ \d+/ }).first();
  return (await el.textContent({ timeout: 8000 })).trim();
}

async function waitForTurnoLabel(page, expected) {
  await page.waitForFunction(
    exp => {
      const el = [...document.querySelectorAll('span')].find(s => /Turno \d+ \/ \d+/.test(s.textContent));
      return el && el.textContent.trim() === exp;
    },
    expected, { timeout: 15000 }
  );
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
    const { page, setDialog } = await loadLista(ctx);
    await openTurno(page, 6);
    await page.locator('#incidentes').fill('SUCIA');
    let dialogFired = false;
    setDialog(d => { dialogFired = true; d.dismiss(); });
    await page.locator('button:has-text("← Carreras")').click();
    await page.waitForTimeout(400);
    const stillOnForm = await page.locator('#tiempo-ganador').count() > 0;
    push('T1 — dirty bloquea ← Carreras', dialogFired && stillOnForm,
      `dialog: ${dialogFired} | form presente: ${stillOnForm}`);
    await page.close();
  }

  /* ── T2: confirm OK descarta y vuelve a la lista ── */
  {
    const { page, setDialog } = await loadLista(ctx);
    await openTurno(page, 6);
    await page.locator('#incidentes').fill('SUCIA');
    setDialog(d => d.accept());
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
    const { page, setDialog } = await loadLista(ctx);
    await openTurno(page, 6);
    await page.locator('#incidentes').fill('TEST_F10');
    await page.keyboard.press('F10');
    await page.waitForSelector('.toast', { timeout: 8000 }).catch(()=>{});
    await page.waitForTimeout(500);
    let dialogFired = false;
    setDialog(d => { dialogFired = true; d.accept(); });
    await page.locator('button:has-text("← Carreras")').click();
    await page.waitForTimeout(400);
    const onList = await page.locator('.carrera-card').count() > 0;
    push('T3 — F10 limpia dirty', !dialogFired && onList,
      `dialog inesperado: ${dialogFired} | lista: ${onList}`);
    await page.close();
  }

  /* ── T4: Siguiente → navega un paso; disabled en última carrera ── */
  {
    const { page } = await loadLista(ctx);

    // 4a: navega un paso hacia adelante desde turno 6
    await openTurno(page, 6);
    const labelBefore = await turnoLabel(page);
    const numBefore   = parseInt(labelBefore.match(/Turno\s+(\d+)/)?.[1]||'0');
    const total       = parseInt(labelBefore.match(/\/\s*(\d+)/)?.[1]||'0');
    await page.locator('button:has-text("Siguiente →")').click();
    await waitForTurnoLabel(page, `Turno ${numBefore + 1} / ${total}`).catch(()=>{});
    const labelAfter = await turnoLabel(page);
    const navigated  = labelAfter === `Turno ${numBefore + 1} / ${total}`;

    // 4b: navegar hacia adelante paso a paso hasta que Siguiente quede disabled
    let disabledAtLast = false;
    for (let guard = 0; guard < total; guard++) {
      const btn = page.locator('button:has-text("Siguiente →")');
      if (await btn.isDisabled({ timeout: 5000 }).catch(()=>false)) { disabledAtLast = true; break; }
      const curLabel = await turnoLabel(page);
      await btn.click();
      await waitForTurnoLabel(page,
        curLabel.replace(/Turno\s+(\d+)/, (_, n) => `Turno ${parseInt(n)+1}`)
      ).catch(()=>{});
      await page.waitForTimeout(300);
    }

    push('T4 — Siguiente navega; disabled en última', navigated && disabledAtLast,
      `${labelBefore} → ${labelAfter} | navigated: ${navigated} | disabled en última: ${disabledAtLast}`);
    await page.close();
  }

  /* ── T5: ← Anterior navega un paso; disabled en primera carrera ── */
  {
    const { page } = await loadLista(ctx);

    // 5a: navega un paso hacia atrás desde turno 6
    await openTurno(page, 6);
    const labelBefore = await turnoLabel(page);
    const numBefore   = parseInt(labelBefore.match(/Turno\s+(\d+)/)?.[1]||'0');
    const total       = parseInt(labelBefore.match(/\/\s*(\d+)/)?.[1]||'0');
    await page.locator('button:has-text("← Anterior")').click();
    await waitForTurnoLabel(page, `Turno ${numBefore - 1} / ${total}`).catch(()=>{});
    const labelAfter = await turnoLabel(page);
    const navigated  = labelAfter === `Turno ${numBefore - 1} / ${total}`;

    // 5b: navegar hacia atrás paso a paso hasta que Anterior quede disabled
    let disabledAtFirst = false;
    for (let guard = 0; guard < total; guard++) {
      const btn = page.locator('button:has-text("← Anterior")');
      if (await btn.isDisabled({ timeout: 5000 }).catch(()=>false)) { disabledAtFirst = true; break; }
      const curLabel = await turnoLabel(page);
      await btn.click();
      await waitForTurnoLabel(page,
        curLabel.replace(/Turno\s+(\d+)/, (_, n) => `Turno ${parseInt(n)-1}`)
      ).catch(()=>{});
      await page.waitForTimeout(300);
    }

    push('T5 — Anterior navega; disabled en primera', navigated && disabledAtFirst,
      `${labelBefore} → ${labelAfter} | navigated: ${navigated} | disabled en primera: ${disabledAtFirst}`);
    await page.close();
  }

  /* ── T6: etiqueta "Turno X / N" correcta ── */
  {
    const { page } = await loadLista(ctx);
    const totalCards = await page.locator('.carrera-card').count();
    await openTurno(page, 1);
    const labelTxt = await turnoLabel(page);
    const m = labelTxt.match(/Turno\s+(\d+)\s*\/\s*(\d+)/);
    const correctIdx   = m ? parseInt(m[1]) === 1 : false;
    const correctTotal = m ? parseInt(m[2]) === totalCards : false;
    push('T6 — etiqueta Turno X / N correcta', correctIdx && correctTotal,
      `label: "${labelTxt}" | cards en lista: ${totalCards}`);
    await page.close();
  }

  /* ── T7: dirty + Siguiente → confirm; Cancel preserva form ── */
  {
    const { page, setDialog } = await loadLista(ctx);
    await openTurno(page, 6);
    await page.locator('#incidentes').fill('DIRTY_TEST');
    const labelBefore = await turnoLabel(page);
    let dialogFired = false;
    setDialog(d => { dialogFired = true; d.dismiss(); });
    await page.locator('button:has-text("Siguiente →")').click();
    await page.waitForTimeout(500);
    const labelAfter  = await turnoLabel(page);
    const stayedSame  = labelBefore === labelAfter;
    const incValue    = await page.locator('#incidentes').inputValue();
    const preserved   = incValue === 'DIRTY_TEST';
    push('T7 — dirty + Siguiente + Cancel preserva form', dialogFired && stayedSame && preserved,
      `dialog: ${dialogFired} | ${labelBefore}→${labelAfter} | incidentes: "${incValue}"`);
    await page.close();
  }

  /* ── T8: cambio de reunión con dirty=true ── */
  {
    const { page, setDialog } = await loadLista(ctx);
    await openTurno(page, 6);
    await page.locator('#incidentes').fill('T8_DIRTY');

    // Capturar valor actual del select y buscar otra opción disponible
    const selVal = await page.locator('#sel-reunion').inputValue();
    const otherOpt = await page.locator('#sel-reunion option').filter({ hasNot: page.locator('[value=""]') }).evaluateAll(
      (opts, cur) => { const o = opts.find(o => o.value && o.value !== cur); return o ? o.value : null; },
      selVal
    );

    if (!otherOpt) {
      push('T8 — cambio de reunión con dirty: Cancel revierte select', false, 'SKIP: solo hay una reunión disponible en el select');
      push('T8b — cambio de reunión con dirty: Accept carga nueva reunión', false, 'SKIP: solo hay una reunión disponible');
      await page.close();
    } else {
      // --- T8a: Cancel → select revierte al valor original ---
      let dialog8aFired = false;
      setDialog(d => { dialog8aFired = true; d.dismiss(); });
      await page.locator('#sel-reunion').selectOption(otherOpt);
      await page.waitForTimeout(400);
      const selAfterCancel = await page.locator('#sel-reunion').inputValue();
      const incAfterCancel = await page.locator('#incidentes').inputValue();
      const selectReverted = selAfterCancel === selVal;
      const formIntact     = incAfterCancel === 'T8_DIRTY';
      push('T8a — Cancel: select revierte, form intacto', dialog8aFired && selectReverted && formIntact,
        `dialog: ${dialog8aFired} | sel: ${selVal}→${selAfterCancel} (esperado ${selVal}) | incidentes: "${incAfterCancel}"`);

      // --- T8b: segundo intento, Accept → carga nueva reunión ---
      let dialog8bFired = false;
      setDialog(d => { dialog8bFired = true; d.accept(); });
      await page.locator('#sel-reunion').selectOption(otherOpt);
      await page.waitForTimeout(1500);
      // Tras accept, debe cargar la nueva reunión → lista de carreras o form nuevo
      const selAfterAccept = await page.locator('#sel-reunion').inputValue();
      const loadedNew = selAfterAccept === otherOpt;
      push('T8b — Accept: carga nueva reunión', dialog8bFired && loadedNew,
        `dialog: ${dialog8bFired} | sel ahora: "${selAfterAccept}" (esperado "${otherOpt}")`);

      await page.close();
    }
  }

  await browser.close();

  /* ── Restaurar estado de la carrera de prueba ── */
  const { data: rr } = await adminSb.from('resultados').select('updated_at').eq('id', RESULTADO_ID).single();
  await adminSb.rpc('aplicar_resultado', {
    p_resultado_id:        RESULTADO_ID,
    p_expected_updated_at: rr?.updated_at,
    p_carrera_id:          CARRERA_ID,
    p_estado:              'provisional',
    p_estado_pista:        null,
    p_tiempo_ganador:      '1:02.40',
    p_incidentes:          'Sin novedad',
    p_favorito_mandil:     2,
    p_redistribucion_legs: {"1":"gde","2":"al3","3":"al4","4":"al5","5":"al6"},
    p_posiciones:          [],
    p_apuestas:            null,
  });

  /* ── Reporte ── */
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
  console.log('═'.repeat(100));
  console.log('[RESTORE] estado_pista → NULL, tiempo_ganador → 1:02.40, incidentes → "Sin novedad"\n');
  if (fail > 0) process.exit(1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
