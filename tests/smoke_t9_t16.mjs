/**
 * Targeted smoke test: T9 (empty-grid persist) + T16 (optimistic lock conflict)
 * Runs against production GitHub Pages (main branch, post-merge).
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'fs';

// ── Credenciales por entorno (no hardcodear) ─────────────────────────────────
// Las keys salen de variables de entorno. Ej:
//   SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... node tests/smoke_t9_t16.mjs
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Exportala antes de correr el test (NO hardcodear la key).`);
  return v;
}


const SUPABASE_URL  = 'https://unlhcuanfrtpatoipwve.supabase.co';
const ANON_KEY      = requireEnv('SUPABASE_ANON_KEY');
const SERVICE_KEY   = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const STORAGE_KEY   = 'sb-unlhcuanfrtpatoipwve-auth-token';
const REUNION_ID    = 'c90b6186-268d-4089-8cc6-71626b627cf8';
const CARRERA_ID    = 'ee373aea-bb8d-4866-9a11-1f34282dbb73';
const RESULTADO_ID  = '052b679b-f539-4c20-9038-a4f2fce48287';
const BASE_URL      = `https://mdqclio.github.io/SGH/resultados.html?reunion_id=${REUNION_ID}`;
const DOLORES_EMAIL = 'dolores@sgh.com';
const DOLORES_UID   = '01c55b92-c53e-42fd-948f-ebfdb31b8d65';

const SS_DIR = '/workspaces/SGH/docs/smoke_screenshots';
mkdirSync(SS_DIR, { recursive: true });

const ORIGINAL_APUESTAS = [
  { tipo:'GAN', val_apu:1,   composicion:null, pozo:null, vales:null, div_orig:4.85,     div_inc:4.85,    vacante:false, orden:1 },
  { tipo:'SEG', val_apu:1,   composicion:null, pozo:null, vales:null, div_orig:8.15,     div_inc:8.15,    vacante:false, orden:2 },
  { tipo:'TER', val_apu:1,   composicion:null, pozo:null, vales:null, div_orig:23.20,    div_inc:23.20,   vacante:false, orden:3 },
  { tipo:'SEG', val_apu:1,   composicion:null, pozo:null, vales:null, div_orig:1.20,     div_inc:null,    vacante:false, orden:4 },
  { tipo:'EX',  val_apu:200, composicion:null, pozo:null, vales:null, div_orig:1500.30,  div_inc:null,    vacante:false, orden:5 },
  { tipo:'IM',  val_apu:200, composicion:null, pozo:null, vales:null, div_orig:755.20,   div_inc:null,    vacante:false, orden:6 },
  { tipo:'X2',  val_apu:200, composicion:null, pozo:null, vales:null, div_orig:210.30,   div_inc:null,    vacante:false, orden:7 },
  { tipo:'X3',  val_apu:200, composicion:null, pozo:null, vales:null, div_orig:57420.90, div_inc:null,    vacante:false, orden:8 },
];

let ssCount = 0;
const report = [];

function log(id, status, note, ssPath = '') {
  report.push({ id, status, note, ssPath });
  const ssNote = ssPath ? ` → ${ssPath.split('/').pop()}` : '';
  console.log(`  ${status}  [${id}] ${note}${ssNote}`);
}

async function ss(page, name) {
  const p = `${SS_DIR}/t9t16_${String(++ssCount).padStart(2,'0')}_${name}.png`;
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  return p;
}

const adminSb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function buildSession() {
  const { data: linkData, error: linkErr } = await adminSb.auth.admin.generateLink({
    type: 'magiclink', email: DOLORES_EMAIL,
  });
  if (linkErr) throw new Error(`generateLink: ${linkErr.message}`);

  const actionLink = linkData.properties.action_link;
  const resp = await fetch(actionLink, { redirect: 'manual' });
  const location = resp.headers.get('location') || '';
  if (!location.includes('access_token')) throw new Error(`No access_token en redirect: ${location.slice(0,100)}`);

  const hashParams = new URLSearchParams(location.split('#')[1]);
  const accessToken  = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');
  const expiresIn    = parseInt(hashParams.get('expires_in') || '3600');
  const expiresAt    = Math.floor(Date.now() / 1000) + expiresIn;

  const { data: userData } = await adminSb.auth.admin.getUserById(DOLORES_UID);
  return { access_token: accessToken, token_type: 'bearer', expires_in: expiresIn, expires_at: expiresAt, refresh_token: refreshToken, user: userData?.user };
}

async function newAuthContext(browser, session) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(({ key, val }) => {
    localStorage.setItem(key, val);
  }, { key: STORAGE_KEY, val: JSON.stringify(session) });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  return { ctx, page };
}

async function waitForGrid(page) {
  try {
    await Promise.race([
      page.waitForSelector('#apu-tbody tr', { timeout: 20000 }),
      page.waitForSelector('#apu-tbody', { timeout: 20000 }),
    ]);
  } catch {}
  await page.waitForTimeout(600);
}

async function navigateAndAuth(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => {
    const overlay = document.getElementById('auth-overlay');
    return !overlay || overlay.style.display === 'none';
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  if (page.url().includes('login.html')) throw new Error('Redirigió a login — sesión inválida');
}

async function openTurno6(page) {
  await page.waitForSelector('.carrera-card', { timeout: 15000 });
  const cards = page.locator('.carrera-card');
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const num = await cards.nth(i).locator('.cc-num').textContent().catch(() => '');
    if (num.trim() === '6') {
      await cards.nth(i).click();
      await waitForGrid(page);
      return;
    }
  }
  throw new Error('No se encontró la card del turno 6');
}

async function reloadToTurno6(page) {
  await navigateAndAuth(page);
  await openTurno6(page);
}

async function getRowCount(page) {
  const rows = page.locator('#apu-tbody tr');
  const count = await rows.count();
  if (count === 0) return 0;
  const firstText = await rows.first().textContent().catch(() => '');
  if (firstText.toLowerCase().includes('sin apuestas')) return 0;
  return count;
}

async function waitForToast(page, timeout = 8000) {
  try {
    await page.waitForSelector('.toast', { timeout });
    await page.waitForTimeout(300);
    const txt = await page.locator('.toast').first().textContent().catch(() => '');
    return txt.trim();
  } catch { return null; }
}

async function restoreOriginalData() {
  const { data: inscs } = await adminSb
    .from('inscripciones').select('id, numero_partidor')
    .eq('carrera_id', CARRERA_ID).in('numero_partidor', [2, 4, 5, 7]);

  const byMandil = {};
  (inscs || []).forEach(i => { byMandil[i.numero_partidor] = i.id; });

  const posData = [
    { inscripcion_id: byMandil[2], posicion: 1, descalificado: false, empate: false },
    { inscripcion_id: byMandil[4], posicion: 2, descalificado: false, empate: false },
    { inscripcion_id: byMandil[5], posicion: 3, descalificado: false, empate: false },
    { inscripcion_id: byMandil[7], posicion: 4, descalificado: false, empate: false },
  ].filter(p => p.inscripcion_id);

  for (const useNull of [false, true]) {
    let expected_at = null;
    if (!useNull) {
      const { data: r } = await adminSb.from('resultados').select('updated_at').eq('id', RESULTADO_ID).single();
      expected_at = r?.updated_at || null;
    }
    const { data, error } = await adminSb.rpc('aplicar_resultado', {
      p_resultado_id:        RESULTADO_ID,
      p_expected_updated_at: expected_at,
      p_carrera_id:          CARRERA_ID,
      p_estado:              'provisional',
      p_estado_pista:        'seca',
      p_tiempo_ganador:      '05:02.11',
      p_incidentes:          'Sin novedad',
      p_favorito_mandil:     2,
      p_redistribucion_legs: { "1":"gde","2":"al3","3":"al4","4":"al5","5":"al6" },
      p_posiciones:          posData,
      p_apuestas:            ORIGINAL_APUESTAS,
    });
    if (!error) return data;
    if (!error.message?.includes('CONCURRENT')) throw new Error(error.message);
  }
}

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════
(async () => {
  console.log('\n══════════════════════════════════════════');
  console.log('  T9 + T16 — resultados.html / Turno 6');
  console.log('  (post-merge main — prod GitHub Pages)');
  console.log('══════════════════════════════════════════\n');

  console.log('[AUTH] Generando sesión...');
  const session = await buildSession();
  console.log(`[AUTH] OK — ${session.user?.email}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const { ctx, page } = await newAuthContext(browser, session);

  try {
    await navigateAndAuth(page);
    await openTurno6(page);
    const startRows = await getRowCount(page);
    console.log(`[INIT] Turno 6 abierto — ${startRows} filas\n`);

    // ── T9: Borrar TODAS las filas → F10 → recarga → verificar vacía ──────
    console.log('── T9: Bug 3b — borrar todo + reload ────');

    // Asegurar estado limpio inicial: restaurar si no hay 20
    if (startRows !== 8) {
      console.log(`  [PRE-T9] Hay ${startRows} filas, restaurando primero...`);
      await restoreOriginalData();
      await reloadToTurno6(page);
    }

    for (let iter = 0; iter < 25; iter++) {
      const cnt = await getRowCount(page);
      if (cnt === 0) break;
      await page.locator('#apu-tbody tr').first().click();
      await page.waitForTimeout(150);
      await page.locator('button', { hasText: 'Eliminar' }).click();
      await page.waitForTimeout(200);
    }

    const cntBeforeF10 = await page.locator('#apu-tbody tr').count();
    console.log(`  [T9] Filas en DOM antes de F10: ${cntBeforeF10}`);
    const ssT9pre = await ss(page, 'T9_before_F10');

    await page.keyboard.press('F10');
    const toastT9 = await waitForToast(page, 8000);
    console.log(`  [T9] Toast F10: "${toastT9}"`);

    await reloadToTurno6(page);
    const cntT9 = await getRowCount(page);
    const ssT9 = await ss(page, 'T9_after_reload');

    log('T9 — Bug 3b: borrar todo + F10 + recarga',
      cntT9 === 0 ? '✅' : '❌',
      `Filas DOM pre-F10: ${cntBeforeF10}. Filas tras recarga: ${cntT9} (esp. 0). Toast: "${toastT9}"`,
      ssT9);

    // ── T16: Concurrencia — Ctx B falla al guardar sin recargar ───────────
    console.log('\n── T16: Concurrencia — Ctx A guarda, Ctx B debe fallar ──');

    // Restaurar 20 filas antes de la prueba
    console.log('  [PRE-T16] Restaurando 20 filas...');
    await restoreOriginalData();

    // Ctx A: recargar → snapshot del updated_at
    await reloadToTurno6(page);
    const cntA = await getRowCount(page);
    console.log(`  [T16] Ctx A: ${cntA} filas cargadas`);

    // Ctx B: sesión fresca, misma página cargada ANTES que Ctx A guarde
    const sessionB = await buildSession();
    const { ctx: ctxB, page: pageB } = await newAuthContext(browser, sessionB);
    await navigateAndAuth(pageB);
    await openTurno6(pageB);
    const cntB = await getRowCount(pageB);
    console.log(`  [T16] Ctx B: ${cntB} filas cargadas (snapshot stale)`);

    // Ctx A guarda primero → updated_at del DB avanza
    await page.locator('#tg').fill('1:03.00');
    await page.keyboard.press('F10');
    const toastA = await waitForToast(page, 8000);
    console.log(`  [T16] Ctx A toast: "${toastA}"`);
    const ssT16a = await ss(page, 'T16_ctx_A_saved');
    const ctxASaved = toastA && !toastA.toLowerCase().includes('error');
    log('T15/pre — Ctx A guarda OK', ctxASaved ? '✅' : '❌',
      `Toast: "${toastA}"`, ssT16a);

    // Ctx B intenta guardar SIN recargar → debe recibir error de concurrencia
    const rpcCalls = [];
    await pageB.route('**supabase.co/rest/v1/**', async (route, request) => {
      if (request.method() === 'POST') {
        const url = request.url();
        const body = request.postData() || '';
        const endpoint = url.split('/rest/v1/')[1]?.split('?')[0]?.slice(0,50) || url;
        console.log(`  [DBG] Ctx B POST → ${endpoint}`);
        if (body.length < 600) console.log(`  [DBG]   body: ${body.slice(0,300)}`);
        rpcCalls.push({ url, body });
      }
      await route.continue();
    });

    await pageB.locator('#incidentes').fill('TEST_CONCURRENT_B');
    await pageB.keyboard.press('F10');
    const toastB = await waitForToast(pageB, 10000);
    await pageB.unroute('**supabase.co/rest/v1/**');

    const ssT16 = await ss(pageB, 'T16_ctx_B_error');
    console.log(`  [T16] Ctx B toast: "${toastB}"`);
    console.log(`  [T16] RPC calls interceptados: ${rpcCalls.length}`);

    const concurrOK = !!toastB && (
      toastB.toLowerCase().includes('otro') ||
      toastB.toLowerCase().includes('concurrent') ||
      toastB.toLowerCase().includes('modific') ||
      toastB.toLowerCase().includes('recarg')
    );
    log('T16 — Ctx B: conflicto de concurrencia detectado',
      concurrOK ? '✅' : '❌',
      `Toast B: "${toastB}"`, ssT16);

    await ctxB.close();

  } catch (err) {
    console.error('\n[FATAL]', err.message, err.stack?.split('\n')[1]);
    log('FATAL', '❌', err.message);
    try { await ss(page, 'fatal_error'); } catch {}
  }

  await browser.close();

  // ── Restore final ────────────────────────────────────────────────────────
  console.log('\n[RESTORE] Restaurando 20 filas originales...');
  try {
    await restoreOriginalData();
    const { data: v } = await adminSb
      .from('resultado_apuestas').select('id').eq('resultado_id', RESULTADO_ID);
    console.log(`[RESTORE] ✅ ${v?.length} filas en DB`);
  } catch (e) {
    console.error('[RESTORE] ❌', e.message);
  }

  // ── Reporte ──────────────────────────────────────────────────────────────
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  REPORTE — T9 + T16');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(pad('Test', 50) + pad('Estado', 4) + 'Nota');
  console.log('─'.repeat(110));
  for (const r of report) {
    console.log(pad(r.id, 50) + pad(r.status, 4) + r.note);
  }
  const pass = report.filter(r => r.status === '✅').length;
  const fail = report.filter(r => r.status === '❌').length;
  console.log('─'.repeat(110));
  console.log(`Total: ${report.length} | ✅ ${pass} | ❌ ${fail}`);
  console.log(`\nScreenshots → ${SS_DIR}/t9t16_*.png`);
  console.log('══════════════════════════════════════════════════════════════════════\n');
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
