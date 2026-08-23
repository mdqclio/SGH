/**
 * Probe: dividendos inline (refactor/dividendos-inline)
 *
 * Verifica el nuevo flujo sin modal:
 *   1. Inputs de dividendos inline presentes (#div-inp-GAN-1, etc.)
 *   2. Botón "openDivModal" eliminado; "Recargar dividendos" presente
 *   3. Foco: tipear en GAN → trigger onMarcInput (re-render) → valor GAN sobrevive
 *   4. Guardado E2E: nuevos montos → F10 → reload → valores persistidos
 *   5. Flujo 2 pasos:
 *        a. F10 con posiciones + dividendos actuales (paso 1)
 *        b. Renavegar a la carrera
 *        c. Verificar posiciones en marcador intactas
 *        d. Cambiar GAN inline → F10 (paso 2)
 *        e. Reload → posiciones SIGUEN intactas + GAN actualizado
 *
 * Usa Turno 1 de Reunión 5 (f49bb3ff):
 *   9 ratificados, GAN/SEG/TER/EX/IM/TR/X2 habilitadas, resultado provisional.
 *   Mandiles actuales en marcador: pos1→2, pos2→3, pos3→9, etc.
 *
 * Por defecto corre contra localhost:8080 (código local antes de mergear a main).
 * Para correr contra prod: node probe_dividendos_inline.mjs --prod
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'fs';

// ── Credenciales por entorno (no hardcodear) ─────────────────────────────────
// Las keys salen de variables de entorno. Ej:
//   SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... node tests/probe_dividendos_inline.mjs
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Exportala antes de correr el test (NO hardcodear la key).`);
  return v;
}


const USE_PROD   = process.argv.includes('--prod');
const SUPABASE_URL  = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY   = (process.env.SUPABASE_SECRET_KEY || requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
const STORAGE_KEY   = 'sb-unlhcuanfrtpatoipwve-auth-token';
const REUNION_ID    = 'c90b6186-268d-4089-8cc6-71626b627cf8';
const DOLORES_EMAIL = 'dolores@sgh.com';
const DOLORES_UID   = '01c55b92-c53e-42fd-948f-ebfdb31b8d65';
const CARRERA_T1_ID = 'f49bb3ff-5596-4126-abe9-26271d9b179a';
const CARRERA_T2_ID = '1a5ea343-1108-46c9-8e0e-a5f3b4188854';

const BASE_HOST  = USE_PROD ? 'https://sigh.com.ar' : 'http://localhost:8080';
const BASE_URL   = `${BASE_HOST}/resultados.html?reunion_id=${REUNION_ID}`;

const SS_DIR = '/workspaces/SGH/docs/smoke_screenshots';
mkdirSync(SS_DIR, { recursive: true });

const adminSb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function buildSession() {
  const { data: linkData, error: linkErr } = await adminSb.auth.admin.generateLink({
    type: 'magiclink', email: DOLORES_EMAIL,
  });
  if (linkErr) throw new Error(`generateLink: ${linkErr.message}`);
  const resp = await fetch(linkData.properties.action_link, { redirect: 'manual' });
  const loc  = resp.headers.get('location') || '';
  if (!loc.includes('access_token')) throw new Error(`No access_token in redirect: ${loc.slice(0, 100)}`);
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

let passed = 0, failed = 0;
function check(id, ok, note) {
  const mark = ok ? '✅' : '❌';
  console.log(`  ${mark}  [${id}] ${note}`);
  ok ? passed++ : failed++;
}

async function navigateToCarrera(page, carreraId) {
  await page.evaluate(id => {
    if (typeof abrirResultado === 'function') abrirResultado(id);
  }, carreraId);
  await page.waitForTimeout(1500);
}

/* Setea el valor de un input sin pasar por bindARSInput (evita concatenación
   causada por la interacción de page.fill con el focus handler de bindARSInput). */
async function setInput(page, selector, value) {
  await page.evaluate(([sel, val]) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [selector, value]);
}

async function waitForToast(page, timeoutMs = 5000) {
  try {
    await page.waitForSelector('.toast-success', { timeout: timeoutMs });
    return true;
  } catch { return false; }
}

async function pressF10(page) {
  await page.keyboard.press('F10');
  await page.waitForTimeout(2000);
}

(async () => {
  console.log(`\n── Probe: dividendos inline (${USE_PROD ? 'PROD' : 'localhost:8080'}) ──\n`);

  const session = await buildSession();
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext();

  await ctx.addInitScript(({ key, val }) => {
    localStorage.setItem(key, JSON.stringify(val));
  }, { key: STORAGE_KEY, val: session });

  const page = await ctx.newPage();

  console.log('Abriendo resultados.html…');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // ── Turno 1 ─────────────────────────────────────────────────────────────
  console.log('\nNavegando a Turno 1…');
  await navigateToCarrera(page, CARRERA_T1_ID);
  await page.screenshot({ path: `${SS_DIR}/div_inline_01_t1_abierto.png` });

  // ── CHECK 1: Estructura — inputs inline presentes ─────────────────────
  console.log('\n[1] Estructura del panel de dividendos…');

  const ganInputExists = await page.$('#div-inp-GAN-1') !== null;
  check('S01', ganInputExists, '#div-inp-GAN-1 existe en el panel');

  const exInputExists  = await page.$('#div-inp-EX-1')  !== null;
  check('S02', exInputExists,  '#div-inp-EX-1 existe en el panel (directa)');

  const x2InputExists  = await page.$('#div-inp-X2-1')  !== null;
  check('S03', x2InputExists,  '#div-inp-X2-1 existe en el panel (combinada)');

  // Modal eliminado: no debe haber botón con openDivModal
  const hasModalBtn = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(b => b.getAttribute('onclick')?.includes('openDivModal'))
  );
  check('S04', !hasModalBtn, 'Botón openDivModal eliminado del DOM');

  // Botón relabeleado: "Recargar dividendos" presente
  const hasRecargarBtn = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(b => b.textContent.includes('Recargar dividendos'))
  );
  check('S05', hasRecargarBtn, 'Botón "Recargar dividendos" presente');

  // Panel de dividendos tiene inputs con data-tipo y data-slot
  const inputCount = await page.$$eval('input[data-tipo][data-slot]', els => els.length);
  check('S06', inputCount >= 3, `Panel tiene ${inputCount} inputs data-tipo/slot (esperado ≥3)`);

  // ── CHECK 2: Foco — valor GAN sobrevive onMarcInput (re-render) ────────
  console.log('\n[2] Test de foco — valor GAN sobrevive re-render por onMarcInput…');

  // Tipear en GAN input
  await page.click('#div-inp-GAN-1');
  await page.fill('#div-inp-GAN-1', '');
  await page.type('#div-inp-GAN-1', '777');

  const ganBefore = await page.inputValue('#div-inp-GAN-1');
  check('F01', ganBefore.includes('777'), `Valor en #div-inp-GAN-1 antes del re-render: "${ganBefore}"`);

  // Trigger onMarcInput: click + type en el marcador (posición 1)
  await page.click('#marc-1');
  await page.fill('#marc-1', '');
  await page.type('#marc-1', '2');  // mandil 2 = válido en T1
  await page.waitForTimeout(400);   // tiempo para que onMarcInput dispare renderDivView

  const ganAfter = await page.inputValue('#div-inp-GAN-1');
  check('F02', ganAfter.includes('777'), `Valor en #div-inp-GAN-1 después del re-render: "${ganAfter}" (debe contener "777")`);

  await page.screenshot({ path: `${SS_DIR}/div_inline_02_focus_test.png` });

  // ── CHECK 3: Guardado E2E — nuevos valores → F10 → reload → persistidos ─
  console.log('\n[3] Guardado E2E — F10 + reload + verificación…');

  // Valores de prueba únicos para distinguirlos de lo que ya estaba
  const TEST_GAN  = '5.55';
  const TEST_EX   = '333.33';
  const TEST_X2   = '777.00';

  // Usar setInput (page.evaluate) para evitar concatenación con bindARSInput focus handler
  await setInput(page, '#div-inp-GAN-1', TEST_GAN);
  await setInput(page, '#div-inp-EX-1',  TEST_EX);
  await setInput(page, '#div-inp-X2-1',  TEST_X2);

  // Restaurar marc-1 a "2" (mandil correcto para pos1 de T1)
  await setInput(page, '#marc-1', '2');

  await page.screenshot({ path: `${SS_DIR}/div_inline_03_antes_f10.png` });

  await pressF10(page);

  const toastOk = await waitForToast(page);
  check('G01', toastOk, 'Toast de éxito apareció tras F10');

  await page.screenshot({ path: `${SS_DIR}/div_inline_04_post_f10.png` });

  // Reload completo de la página
  console.log('  Recargando página…');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await navigateToCarrera(page, CARRERA_T1_ID);
  await page.waitForTimeout(1000);

  await page.screenshot({ path: `${SS_DIR}/div_inline_05_post_reload.png` });

  // Verificar dividendos persistidos
  const ganPostReload  = await page.inputValue('#div-inp-GAN-1').catch(() => '');
  const exPostReload   = await page.inputValue('#div-inp-EX-1').catch(() => '');
  const x2PostReload   = await page.inputValue('#div-inp-X2-1').catch(() => '');

  const ganNum  = parseFloat(ganPostReload.replace(/\./g, '').replace(',', '.'));
  const exNum   = parseFloat(exPostReload.replace(/\./g, '').replace(',', '.'));
  const x2Num   = parseFloat(x2PostReload.replace(/\./g, '').replace(',', '.'));

  check('G02', Math.abs(ganNum  - 5.55)   < 0.01, `GAN persistido: "${ganPostReload}" (esperado ~5,55)`);
  check('G03', Math.abs(exNum   - 333.33) < 0.01, `EX  persistido: "${exPostReload}" (esperado ~333,33)`);
  check('G04', Math.abs(x2Num   - 777.00) < 0.01, `X2  persistido: "${x2PostReload}" (esperado ~777,00)`);

  // Verificar posiciones del marcador intactas (pos1 = mandil 2)
  const marc1Val = await page.inputValue('#marc-1').catch(() => '');
  check('G05', marc1Val === '2', `Posición 1 del marcador intacta tras reload: marc-1="${marc1Val}" (esperado "2")`);

  const marc2Val = await page.inputValue('#marc-2').catch(() => '');
  check('G06', marc2Val === '3', `Posición 2 del marcador intacta: marc-2="${marc2Val}" (esperado "3")`);

  // ── CHECK 4: FLUJO 2 PASOS ────────────────────────────────────────────
  console.log('\n[4] Flujo 2 pasos — posiciones + dividendos en F10 separados…');

  // Paso A: navegar a T2 y volver a T1 (simula "volver a cargar la carrera")
  console.log('  Paso A: navegar a T2 → volver a T1…');
  await navigateToCarrera(page, CARRERA_T2_ID);
  await page.waitForTimeout(800);
  await navigateToCarrera(page, CARRERA_T1_ID);
  await page.waitForTimeout(1000);

  // Verificar posiciones siguen en el marcador (cargadas desde DB)
  const marc1Step2 = await page.inputValue('#marc-1').catch(() => '');
  const marc2Step2 = await page.inputValue('#marc-2').catch(() => '');
  check('P01', marc1Step2 === '2', `Pos 1 correcta tras renavegación: marc-1="${marc1Step2}"`);
  check('P02', marc2Step2 === '3', `Pos 2 correcta tras renavegación: marc-2="${marc2Step2}"`);

  // Verificar dividendos del guardado anterior siguen en los inputs
  const ganStep2 = await page.inputValue('#div-inp-GAN-1').catch(() => '');
  const ganStep2Num = parseFloat(ganStep2.replace(/\./g, '').replace(',', '.'));
  check('P03', Math.abs(ganStep2Num - 5.55) < 0.01, `GAN sigue correcto tras renavegación: "${ganStep2}"`);

  // Paso B: cambiar solo GAN, sin tocar el marcador → F10
  console.log('  Paso B: cambiar GAN a 9.99, F10…');
  const TEST_GAN_B = '9.99';
  await setInput(page, '#div-inp-GAN-1', TEST_GAN_B);
  await page.screenshot({ path: `${SS_DIR}/div_inline_06_paso_b_antes_f10.png` });

  await pressF10(page);
  const toastOkB = await waitForToast(page);
  check('P04', toastOkB, 'Toast de éxito en F10 del Paso B');

  // Reload completo
  console.log('  Recargando para verificación final…');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await navigateToCarrera(page, CARRERA_T1_ID);
  await page.waitForTimeout(1000);

  await page.screenshot({ path: `${SS_DIR}/div_inline_07_verificacion_final.png` });

  // Posiciones siguen intactas
  const marc1Final = await page.inputValue('#marc-1').catch(() => '');
  const marc2Final = await page.inputValue('#marc-2').catch(() => '');
  check('P05', marc1Final === '2', `Pos 1 intacta tras Paso B + reload: marc-1="${marc1Final}"`);
  check('P06', marc2Final === '3', `Pos 2 intacta tras Paso B + reload: marc-2="${marc2Final}"`);

  // GAN actualizado a 9.99
  const ganFinal = await page.inputValue('#div-inp-GAN-1').catch(() => '');
  const ganFinalNum = parseFloat(ganFinal.replace(/\./g, '').replace(',', '.'));
  check('P07', Math.abs(ganFinalNum - 9.99) < 0.01, `GAN actualizado a 9.99: "${ganFinal}"`);

  // EX del paso anterior sigue ahí (no fue pisado por el paso B)
  const exFinal = await page.inputValue('#div-inp-EX-1').catch(() => '');
  const exFinalNum = parseFloat(exFinal.replace(/\./g, '').replace(',', '.'));
  check('P08', Math.abs(exFinalNum - 333.33) < 0.01, `EX del Paso A sigue intacto: "${exFinal}"`);

  // ── CIERRE ───────────────────────────────────────────────────────────
  await browser.close();

  console.log(`\n── Resultado: ${passed} ✅  ${failed} ❌  (${passed + failed} checks) ──\n`);
  if (failed > 0) process.exit(1);
})();
