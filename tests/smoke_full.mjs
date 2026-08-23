/**
 * Smoke Test — resultados.html / Turno 6: DIA DE LA ESCARAPELA
 * Reunion: c90b6186-268d-4089-8cc6-71626b627cf8
 *
 * Auth: extrae access_token del redirect de magic link (sin browser),
 *       lo inyecta en localStorage vía addInitScript.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'fs';

// ── Credenciales por entorno (no hardcodear) ─────────────────────────────────
// Las keys salen de variables de entorno. Ej:
//   SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... node tests/smoke_full.mjs
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Exportala antes de correr el test (NO hardcodear la key).`);
  return v;
}


// ── Constantes ──────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://unlhcuanfrtpatoipwve.supabase.co';
const ANON_KEY      = requireEnv('SUPABASE_ANON_KEY');
const SERVICE_KEY   = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const STORAGE_KEY   = 'sb-unlhcuanfrtpatoipwve-auth-token';
const REUNION_ID    = 'c90b6186-268d-4089-8cc6-71626b627cf8';
const CARRERA_ID    = 'ee373aea-bb8d-4866-9a11-1f34282dbb73';
const RESULTADO_ID  = '052b679b-f539-4c20-9038-a4f2fce48287';
const BASE_URL      = `https://sigh.com.ar/resultados.html?reunion_id=${REUNION_ID}`;
const DOLORES_EMAIL = 'dolores@sgh.com';
const DOLORES_UID   = '01c55b92-c53e-42fd-948f-ebfdb31b8d65';

const SS_DIR = '/workspaces/SGH/docs/smoke_screenshots';
mkdirSync(SS_DIR, { recursive: true });

// ── Dataset original (20 filas) ──────────────────────────────────────────────
const ORIGINAL_APUESTAS = [
  { tipo:'TE',  val_apu:1,   composicion:'5',     pozo:3833.33,  vales:5500, div_orig:1.80,   div_inc:1.80,   vacante:false, orden:1  },
  { tipo:'EX',  val_apu:100, composicion:'2/4',   pozo:80208,    vales:55,   div_orig:1458.30, div_inc:1458.30,vacante:false, orden:2  },
  { tipo:'IM',  val_apu:100, composicion:'2/4',   pozo:33696,    vales:18,   div_orig:1872,    div_inc:1872,   vacante:false, orden:3  },
  { tipo:'TR',  val_apu:100, composicion:'2/4/5', pozo:105408,   vales:11,   div_orig:9582.60, div_inc:9582.60,vacante:false, orden:4  },
  { tipo:'X2',  val_apu:100, composicion:'4/1',   pozo:23760,    vales:null, div_orig:660,     div_inc:660,    vacante:true,  orden:5  },
  { tipo:'X2',  val_apu:100, composicion:'4/2',   pozo:23760,    vales:null, div_orig:660,     div_inc:660,    vacante:true,  orden:6  },
  { tipo:'X2',  val_apu:100, composicion:'4/3',   pozo:23760,    vales:null, div_orig:660,     div_inc:660,    vacante:true,  orden:7  },
  { tipo:'X2',  val_apu:100, composicion:'4/6',   pozo:23760,    vales:null, div_orig:660,     div_inc:660,    vacante:true,  orden:8  },
  { tipo:'X2',  val_apu:100, composicion:'5/1',   pozo:23760,    vales:null, div_orig:660,     div_inc:660,    vacante:true,  orden:9  },
  { tipo:'X2',  val_apu:100, composicion:'5/2',   pozo:23760,    vales:36,   div_orig:660,     div_inc:660,    vacante:false, orden:10 },
  { tipo:'X2',  val_apu:100, composicion:'5/3',   pozo:23760,    vales:null, div_orig:660,     div_inc:660,    vacante:true,  orden:11 },
  { tipo:'X2',  val_apu:100, composicion:'5/6',   pozo:23760,    vales:null, div_orig:660,     div_inc:660,    vacante:true,  orden:12 },
  { tipo:'X3',  val_apu:100, composicion:'8/4/1', pozo:38880,    vales:null, div_orig:5554.30, div_inc:5554.30,vacante:true,  orden:13 },
  { tipo:'X3',  val_apu:100, composicion:'8/4/2', pozo:38880,    vales:null, div_orig:5554.30, div_inc:5554.30,vacante:true,  orden:14 },
  { tipo:'X3',  val_apu:100, composicion:'8/4/3', pozo:38880,    vales:null, div_orig:5554.30, div_inc:5554.30,vacante:true,  orden:15 },
  { tipo:'X3',  val_apu:100, composicion:'8/4/6', pozo:38880,    vales:null, div_orig:5554.30, div_inc:5554.30,vacante:true,  orden:16 },
  { tipo:'X3',  val_apu:100, composicion:'8/5/1', pozo:38880,    vales:null, div_orig:5554.30, div_inc:5554.30,vacante:true,  orden:17 },
  { tipo:'X3',  val_apu:100, composicion:'8/5/2', pozo:38880,    vales:7,    div_orig:5554.30, div_inc:5554.30,vacante:false, orden:18 },
  { tipo:'X3',  val_apu:100, composicion:'8/5/3', pozo:38880,    vales:null, div_orig:5554.30, div_inc:5554.30,vacante:true,  orden:19 },
  { tipo:'X3',  val_apu:100, composicion:'8/5/6', pozo:38880,    vales:null, div_orig:5554.30, div_inc:5554.30,vacante:true,  orden:20 },
];

// ── Reporte ──────────────────────────────────────────────────────────────────
let ssCount = 0;
const report = [];
function log(id, status, note, ssPath = '') {
  report.push({ id, status, note, ssPath });
  const ssNote = ssPath ? ` → ${ssPath.split('/').pop()}` : '';
  console.log(`  ${status}  [${id}] ${note}${ssNote}`);
}
async function ss(page, name) {
  const p = `${SS_DIR}/${String(++ssCount).padStart(2,'0')}_${name}.png`;
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  return p;
}

// ── Supabase admin client ─────────────────────────────────────────────────────
const adminSb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ── Obtener session via magic link → fetch redirect ──────────────────────────
async function buildSession() {
  const { data: linkData, error: linkErr } = await adminSb.auth.admin.generateLink({
    type: 'magiclink',
    email: DOLORES_EMAIL,
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
  const user = userData?.user;

  return { access_token: accessToken, token_type: 'bearer', expires_in: expiresIn, expires_at: expiresAt, refresh_token: refreshToken, user };
}

// ── Crear contexto Playwright con sesión inyectada ───────────────────────────
async function newAuthContext(browser, session) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(({ key, val }) => {
    localStorage.setItem(key, val);
  }, { key: STORAGE_KEY, val: JSON.stringify(session) });

  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  return { ctx, page };
}

// ── Helpers de navegación ─────────────────────────────────────────────────────
async function waitForGrid(page) {
  // Esperar hasta que la tabla tenga filas O aparezca el mensaje vacío
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
  // Esperar que desaparezca el auth overlay
  await page.waitForFunction(() => {
    const overlay = document.getElementById('auth-overlay');
    return !overlay || overlay.style.display === 'none';
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Verificar que no nos redirigió a login
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
  // Verificar si es el mensaje "sin apuestas"
  const firstText = await rows.first().textContent().catch(() => '');
  if (firstText.toLowerCase().includes('sin apuestas')) return 0;
  return count;
}

async function findRowByComp(page, comp) {
  const rows = page.locator('#apu-tbody tr');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const t = await rows.nth(i).textContent().catch(() => '');
    if (t.includes(comp)) return i;
  }
  return -1;
}

async function selectRow(page, idx) {
  await page.locator('#apu-tbody tr').nth(idx).click();
  await page.waitForTimeout(150);
}

async function waitForToast(page, timeout = 7000) {
  try {
    await page.waitForSelector('.toast', { timeout });
    await page.waitForTimeout(300);
    const txt = await page.locator('.toast').first().textContent().catch(() => '');
    return txt.trim();
  } catch { return null; }
}

async function pressF10AndWaitToast(page) {
  await page.keyboard.press('F10');
  return waitForToast(page);
}

// ── Restaurar dataset original ────────────────────────────────────────────────
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

  // 2 intentos: primero con updated_at actual, luego con null si hay conflicto
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
      p_tiempo_clima:        'BUENO',
      p_estado_pista:        'normal',
      p_tiempo_ganador:      '1:02.40',
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

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('\n══════════════════════════════════════════');
  console.log('  SMOKE TEST — resultados.html / Turno 6');
  console.log('══════════════════════════════════════════\n');

  // ── Auth: obtener sesión ──────────────────────────────────────────────────
  console.log('[AUTH] Generando sesión...');
  const session = await buildSession();
  console.log(`[AUTH] OK — ${session.user?.email} · token: ${session.access_token.slice(0,20)}...\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const { ctx, page } = await newAuthContext(browser, session);

  try {
    // ── Cargar página ────────────────────────────────────────────────────
    console.log('[NAV] Cargando resultados.html...');
    await navigateAndAuth(page);
    console.log('[NAV] URL:', page.url());
    await openTurno6(page);
    console.log('[TURNO 6] Abierto\n');

    // ══════════════════════════════════════════════════════════════════
    // LECTURA
    // ══════════════════════════════════════════════════════════════════
    console.log('── LECTURA ──────────────────────────────');

    // T1: 20 filas
    const rowCount = await getRowCount(page);
    log('T1 — 20 filas', rowCount === 20 ? '✅' : '❌',
      `Tabla tiene ${rowCount} filas (esperaba 20)`);

    // T2: M.(F) cajas 2,4,5,7
    const mf = [];
    for (let p = 1; p <= 7; p++) {
      mf.push((await page.locator(`#mf-${p}`).textContent().catch(() => '')).trim());
    }
    const mfOK = mf[0]==='2' && mf[1]==='4' && mf[2]==='5' && mf[3]==='7';
    log('T2 — M.(F) 2,4,5,7', mfOK ? '✅' : '❌',
      `Celdas mf-1..7: [${mf.join(',')}]`);

    // T3: Borrados "1-3-6 (12)"
    const bodyText = await page.locator('body').textContent();
    const borradosMatch = bodyText.match(/Borrados:\s*([\d\-]+\s*\(\d+\))/);
    const borradosTxt = borradosMatch?.[1]?.trim() || 'no encontrado';
    const borradosOK = borradosTxt.includes('1') && borradosTxt.includes('3') && borradosTxt.includes('6') && borradosTxt.includes('12');
    log('T3 — Borrados "1-3-6 (12)"', borradosOK ? '✅' : '❌',
      `Texto: "${borradosTxt}"`);

    // T4: Screenshot estado inicial
    const ssT4 = await ss(page, 'T4_estado_inicial');
    log('T4 — Screenshot estado inicial', '✅', 'Capturado', ssT4);

    // ══════════════════════════════════════════════════════════════════
    // ESCRITURA
    // ══════════════════════════════════════════════════════════════════
    console.log('\n── ESCRITURA ────────────────────────────');

    // T5: Agregar fila TE val_apu=1 comp=9 pozo=1000 vales=100 d_orig=1.50 d_inc=1.50 → F10
    console.log('[T5] Agregar TE...');
    await page.locator('button', { hasText: 'Agregar' }).click();
    await page.waitForSelector('#modal-apuesta.open', { timeout: 5000 });
    await page.locator('#m-tipo').selectOption('TE');
    await page.locator('#m-val-apu').fill('1');
    await page.locator('#m-comp').fill('9');
    await page.locator('#m-pozo').fill('1000');
    await page.locator('#m-vales').fill('100');
    await page.locator('#m-dorig').fill('1.50');
    await page.locator('#m-dinc').fill('1.50');
    await page.locator('button', { hasText: 'Confirmar' }).click();
    await page.waitForFunction(() => !document.getElementById('modal-apuesta').classList.contains('open'), { timeout: 3000 });
    const toastT5 = await pressF10AndWaitToast(page);
    const ssT5 = await ss(page, 'T5_TE_added');
    log('T5 — Agregar TE + F10', toastT5 && !toastT5.toLowerCase().includes('error') ? '✅' : '❌',
      `Toast: "${toastT5}"`, ssT5);

    // T6: Recargar y verificar que aparece
    await reloadToTurno6(page);
    const cntT6    = await getRowCount(page);
    const tableT6  = await page.locator('#apu-tbody').textContent().catch(() => '');
    const ssT6 = await ss(page, 'T6_reload_verify');
    // TE comp=9: buscar en tabla
    const teIdxT6 = await findRowByComp(page, '9');
    const tePresent = teIdxT6 >= 0;
    log('T6 — Recarga: TE comp=9 aparece', cntT6 === 21 && tePresent ? '✅' : '❌',
      `Filas: ${cntT6} (esp. 21). TE comp=9 en idx ${teIdxT6}`, ssT6);

    // T7: Cambiar vales de X2 5/2 (36→99) → F10. Recargar y verificar.
    console.log('[T7] Cambiar X2 5/2 vales→99...');
    const x2Idx = await findRowByComp(page, '5/2');
    if (x2Idx < 0) {
      log('T7 — X2 5/2 vales→99', '❌', 'No se encontró la fila X2 5/2');
    } else {
      await selectRow(page, x2Idx);
      await page.locator('button', { hasText: 'Cambiar' }).click();
      await page.waitForSelector('#modal-apuesta.open', { timeout: 5000 });
      // Verificar que el tipo es X2 y comp=5/2
      const tipoVal = await page.locator('#m-tipo').inputValue();
      const compVal = await page.locator('#m-comp').inputValue();
      await page.locator('#m-vales').triple_click?.() ?? await page.locator('#m-vales').fill('99');
      await page.locator('button', { hasText: 'Confirmar' }).click();
      await page.waitForFunction(() => !document.getElementById('modal-apuesta').classList.contains('open'), { timeout: 3000 });
      const toastT7 = await pressF10AndWaitToast(page);
      await reloadToTurno6(page);
      const x2IdxAfter = await findRowByComp(page, '5/2');
      let valesAfter = '';
      if (x2IdxAfter >= 0) {
        const rowText = await page.locator('#apu-tbody tr').nth(x2IdxAfter).textContent().catch(() => '');
        valesAfter = rowText;
      }
      const ssT7 = await ss(page, 'T7_X2_5_2_vales_99');
      const has99 = valesAfter.includes('99');
      log('T7 — X2 5/2 vales→99 + recarga', has99 ? '✅' : '❌',
        `Toast: "${toastT7}". Fila X2 5/2 tras recarga: "${valesAfter.trim().slice(0,60)}"`, ssT7);
    }

    // T8: Eliminar la fila TE del paso 5 → F10. Recargar y verificar.
    console.log('[T8] Eliminar TE comp=9...');
    const teIdx8 = await findRowByComp(page, '9');
    if (teIdx8 < 0) {
      log('T8 — Eliminar TE', '❌', 'TE comp=9 no encontrada');
    } else {
      // Verificar que la fila encontrada es efectivamente TE (no X3 8/...)
      const rowT8Text = await page.locator('#apu-tbody tr').nth(teIdx8).textContent().catch(() => '');
      // Buscar la fila TE específicamente: debe tener 'TE' en la primera celda
      let teActualIdx = -1;
      const rows8 = page.locator('#apu-tbody tr');
      const cnt8 = await rows8.count();
      for (let i = 0; i < cnt8; i++) {
        const cells = rows8.nth(i).locator('td');
        const tipoCel = await cells.first().textContent().catch(() => '');
        const compCel = await cells.nth(2).textContent().catch(() => '');
        if (tipoCel.trim() === 'TE' && compCel.trim() === '9') {
          teActualIdx = i; break;
        }
      }
      if (teActualIdx < 0) {
        log('T8 — Eliminar TE', '❌', 'No se encontró TE con comp exactamente "9"');
      } else {
        await selectRow(page, teActualIdx);
        await page.locator('button', { hasText: 'Eliminar' }).click();
        await page.waitForTimeout(500);
        const toastT8 = await pressF10AndWaitToast(page);
        await reloadToTurno6(page);
        const cntT8 = await getRowCount(page);
        // Verificar que ya no está TE comp=9
        let teGone = true;
        const rows8b = page.locator('#apu-tbody tr');
        const cnt8b = await rows8b.count();
        for (let i = 0; i < cnt8b; i++) {
          const cells = rows8b.nth(i).locator('td');
          const tipoCel = await cells.first().textContent().catch(() => '');
          const compCel = await cells.nth(2).textContent().catch(() => '');
          if (tipoCel.trim() === 'TE' && compCel.trim() === '9') { teGone = false; break; }
        }
        const ssT8 = await ss(page, 'T8_after_delete_TE');
        log('T8 — Eliminar TE + recarga', cntT8 === 20 && teGone ? '✅' : '❌',
          `Filas: ${cntT8} (esp. 20). TE comp=9 gone: ${teGone}. Toast: "${toastT8}"`, ssT8);
      }
    }

    // T9: Borrar TODAS las filas → F10. Recargar y verificar grilla vacía.
    console.log('[T9] Eliminando TODAS las filas...');
    for (let iter = 0; iter < 25; iter++) {
      const cnt = await getRowCount(page);
      if (cnt === 0) break;
      await selectRow(page, 0);
      await page.locator('button', { hasText: 'Eliminar' }).click();
      await page.waitForTimeout(250);
    }
    const cntBeforeT9F10 = await page.locator('#apu-tbody tr').count();
    const ssT9before = await ss(page, 'T9_before_F10');
    const toastT9 = await pressF10AndWaitToast(page);
    await reloadToTurno6(page);
    const cntT9 = await getRowCount(page);
    const ssT9 = await ss(page, 'T9_grilla_vacia');
    log('T9 — Bug 3b: borrar todo + recarga', cntT9 === 0 ? '✅' : '❌',
      `Filas en DOM antes F10: ${cntBeforeT9F10}. Filas tras recarga: ${cntT9}. Toast: "${toastT9}"`, ssT9);

    // T10: Restaurar 20 filas originales via RPC (service role)
    console.log('[T10] Restaurando dataset...');
    await restoreOriginalData();
    const { data: checkRows } = await adminSb
      .from('resultado_apuestas').select('id', { count: 'exact' }).eq('resultado_id', RESULTADO_ID);
    const restoredCnt = checkRows?.length ?? 0;
    log('T10 — Restaurar 20 filas', restoredCnt === 20 ? '✅' : '❌',
      `Filas en DB tras restore: ${restoredCnt}`);

    // ══════════════════════════════════════════════════════════════════
    // ATAJOS DE TECLADO
    // ══════════════════════════════════════════════════════════════════
    console.log('\n── ATAJOS ───────────────────────────────');
    await reloadToTurno6(page);

    // T11: F8 recarga desde DB
    // Agregar fila sin guardar, luego F8 debe descartarla
    await page.locator('button', { hasText: 'Agregar' }).click();
    await page.waitForSelector('#modal-apuesta.open', { timeout: 5000 });
    await page.locator('#m-tipo').selectOption('EX');
    await page.locator('#m-comp').fill('F8TEST');
    await page.locator('button', { hasText: 'Confirmar' }).click();
    await page.waitForFunction(() => !document.getElementById('modal-apuesta').classList.contains('open'), { timeout: 3000 });
    const cntBeforeF8 = await getRowCount(page);
    await page.keyboard.press('F8');
    const toastF8 = await waitForToast(page, 5000);
    await page.waitForTimeout(500);
    const cntAfterF8 = await getRowCount(page);
    const ssT11 = await ss(page, 'T11_F8');
    log('T11 — F8 recarga desde DB', cntAfterF8 === 20 ? '✅' : '❌',
      `Antes F8: ${cntBeforeF8} filas. Después: ${cntAfterF8}. Toast: "${toastF8}"`, ssT11);

    // T12: Cambio + F10 (keyboard) — debe persistir
    await page.locator('#tiempo-clima').fill('LLUVIOSO');
    const toastT12 = await pressF10AndWaitToast(page);
    await reloadToTurno6(page);
    const climaT12 = await page.locator('#tiempo-clima').inputValue().catch(() => '');
    const ssT12 = await ss(page, 'T12_F10_persiste');
    log('T12 — F10 keyboard persiste', climaT12 === 'LLUVIOSO' ? '✅' : '❌',
      `tiempo_clima tras recarga: "${climaT12}". Toast: "${toastT12}"`, ssT12);

    // Restaurar tiempo_clima a BUENO
    await page.locator('#tiempo-clima').fill('BUENO');
    await pressF10AndWaitToast(page);

    // T13: Cambio + F9 — debe descartar
    await reloadToTurno6(page);
    await page.locator('#tiempo-clima').fill('CAMBIANTE');
    await page.keyboard.press('F9');
    await page.waitForTimeout(2000);
    // F9 llama cancelar() que recarga y puede volver a lista de carreras
    try { await openTurno6(page); } catch {}
    const climaT13 = await page.locator('#tiempo-clima').inputValue().catch(() => '');
    const ssT13 = await ss(page, 'T13_F9_descarta');
    log('T13 — F9 keyboard descarta', climaT13 !== 'CAMBIANTE' ? '✅' : '❌',
      `tiempo_clima tras F9: "${climaT13}" (esperaba BUENO, no CAMBIANTE)`, ssT13);

    // ══════════════════════════════════════════════════════════════════
    // CONCURRENCIA
    // ══════════════════════════════════════════════════════════════════
    console.log('\n── CONCURRENCIA ─────────────────────────');

    // Obtener sesión fresca para contexto B
    const sessionB = await buildSession();

    // Contexto A: recargar y abrir turno 6
    await reloadToTurno6(page);

    // Contexto B: nueva sesión, misma página
    const { ctx: ctxB, page: pageB } = await newAuthContext(browser, sessionB);
    await navigateAndAuth(pageB);
    await openTurno6(pageB);

    // T14: Ambos contextos ven el turno 6
    const cntA = await getRowCount(page);
    const cntB = await getRowCount(pageB);
    log('T14 — Dos contextos abiertos', cntA === 20 && cntB === 20 ? '✅' : '❌',
      `Ctx A: ${cntA} filas. Ctx B: ${cntB} filas`);
    const ssT14a = await ss(page,  'T14_ctx_A');
    const ssT14b = await ss(pageB, 'T14_ctx_B');

    // T15: Contexto A hace cambio + F10 → guarda OK
    const loadedAtA_before = await page.evaluate(() => window.loadedUpdatedAt).catch(() => 'ERR');
    console.log(`  [DBG] loadedUpdatedAt ctx A antes T15: "${loadedAtA_before}"`);
    await page.locator('#tiempo-ganador').fill('1:03.00');
    const toastA = await pressF10AndWaitToast(page);
    const loadedAtA_after = await page.evaluate(() => window.loadedUpdatedAt).catch(() => 'ERR');
    console.log(`  [DBG] loadedUpdatedAt ctx A después T15: "${loadedAtA_after}"`);
    const ssT15 = await ss(page, 'T15_ctx_A_saved');
    log('T15 — Ctx A: F10 guarda OK',
      toastA && !toastA.toLowerCase().includes('error') ? '✅' : '❌',
      `Toast ctx A: "${toastA}"`, ssT15);

    // T16: Contexto B (sin recargar, updated_at stale) intenta F10 → debe fallar
    // Interceptar TODOS los requests de contexto B para detectar la RPC
    const rpcCalls = [];
    await pageB.route('**supabase.co/rest/v1/**', async (route, request) => {
      if (request.method() === 'POST') {
        const url = request.url();
        const body = request.postData();
        console.log(`  [DBG] POST from pageB: ${url.split('/rest/v1/')[1]?.split('?')[0]?.slice(0,40)}`);
        if (body && body.length < 500) console.log(`  [DBG] body: ${body.slice(0,200)}`);
        rpcCalls.push({ url, body });
      }
      await route.continue();
    });
    await pageB.locator('#incidentes').fill('CONCURRENCIA_TEST_B');
    const toastBPromise = waitForToast(pageB, 10000);
    await pageB.keyboard.press('F10');
    const toastB = await toastBPromise;
    await pageB.unroute('**supabase.co/rest/v1/**');
    const ssT16 = await ss(pageB, 'T16_ctx_B_error_toast');
    const concurrOK = toastB?.toLowerCase().includes('otro') || toastB?.toLowerCase().includes('concurrent') || toastB?.toLowerCase().includes('modific');
    log('T16 — Ctx B: conflicto detectado',
      concurrOK ? '✅' : '❌',
      `Toast ctx B: "${toastB}"`, ssT16);

    // T17: Screenshot del toast
    log('T17 — Screenshot toast de error', ssT16 ? '✅' : '❌',
      'Ver screenshot T16_ctx_B_error_toast.png', ssT16);

    await ctxB.close();

  } catch (err) {
    console.error('\n[FATAL]', err.message);
    log('FATAL', '❌', err.message);
    try { await ss(page, 'fatal_error'); } catch {}
  }

  await browser.close();

  // ── Restore final garantizado ────────────────────────────────────────────
  console.log('\n[RESTORE FINAL] Restaurando estado original...');
  try {
    await restoreOriginalData();
    const { data: v } = await adminSb
      .from('resultado_apuestas').select('id', { count: 'exact' }).eq('resultado_id', RESULTADO_ID);
    console.log(`[RESTORE] ✅ ${v?.length} filas en DB`);
  } catch (e) {
    console.error('[RESTORE] ❌', e.message);
  }

  printReport();
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});

function printReport() {
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  REPORTE FINAL — SMOKE TEST resultados.html / Turno 6');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(pad('Test', 45) + pad('Estado', 4) + 'Nota');
  console.log('─'.repeat(105));
  for (const r of report) {
    console.log(pad(r.id, 45) + pad(r.status, 4) + r.note);
  }
  const pass = report.filter(r => r.status === '✅').length;
  const fail = report.filter(r => r.status === '❌').length;
  const warn = report.filter(r => r.status === '⚠️').length;
  console.log('─'.repeat(105));
  console.log(`Total: ${report.length} | ✅ ${pass} | ❌ ${fail} | ⚠️ ${warn}`);
  console.log(`\nScreenshots → ${SS_DIR}/`);
  console.log('══════════════════════════════════════════════════════════════════════\n');
}
