/**
 * Probe: modelo mandil 1..N (refactor/resultados-modelo-chapa-1aN)
 *
 * Verifica que mfCells muestren mandil 1..N consecutivo (no gateras con huecos).
 *
 * Turno 4 — 60508614 — 8 ratificados, 0 borrados
 *   Gateras: 1,3,7,8,9,10,11,13  →  mandiles esperados: 1,2,3,4,5,6,7,8
 *
 * Turno 1 — f49bb3ff — 9 ratificados, 2 forfait (gateras 13 y 15)
 *   Gateras ratificados: 1,2,5,7,8,9,11,12,14  →  mandiles esperados: 1,2,3,4,5,6,7,8,9
 *
 * Cruce mandil→caballo (Turno 1, confirmado contra DB):
 *   mandil 1 = Malenuchi Jack    (gatera 1)
 *   mandil 2 = La Motocicleta    (gatera 2)
 *   mandil 3 = La City Porteña   (gatera 5)
 *   mandil 4 = Dourada           (gatera 7)
 *   mandil 5 = Cursi Nik         (gatera 8)
 *   mandil 6 = Conesera          (gatera 9)
 *   mandil 7 = Es Mistres        (gatera 11)
 *   mandil 8 = Berry Nik         (gatera 12)
 *   mandil 9 = De Moda           (gatera 14)
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'fs';

// ── Credenciales por entorno (no hardcodear) ─────────────────────────────────
// Las keys salen de variables de entorno. Ej:
//   SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... node tests/probe_modelo_chapa.mjs
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Exportala antes de correr el test (NO hardcodear la key).`);
  return v;
}


const SUPABASE_URL  = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY   = (process.env.SUPABASE_SECRET_KEY || requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
const STORAGE_KEY   = 'sb-unlhcuanfrtpatoipwve-auth-token';
const REUNION_ID    = 'c90b6186-268d-4089-8cc6-71626b627cf8';   // Reunión 5
const BASE_URL      = `https://sigh.com.ar/resultados.html?reunion_id=${REUNION_ID}`;
const DOLORES_EMAIL = 'dolores@sgh.com';
const DOLORES_UID   = '01c55b92-c53e-42fd-948f-ebfdb31b8d65';

const CARRERA_T4_ID = '60508614-5620-4298-839c-fad77592922b';
const CARRERA_T1_ID = 'f49bb3ff-5596-4126-abe9-26271d9b179a';
const CARRERA_T2_ID = '1a5ea343-1108-46c9-8e0e-a5f3b4188854';

const SS_DIR = '/workspaces/SGH/docs/smoke_screenshots';
mkdirSync(SS_DIR, { recursive: true });

const adminSb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
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

async function getMfMandiles(page) {
  return page.$$eval('.mf-cell', cells =>
    cells.map(c => parseInt(c.getAttribute('data-mandil'), 10)).filter(n => !isNaN(n))
  );
}

async function navigateToCarrera(page, carreraId) {
  await page.evaluate(id => {
    window.__testTargetCarreraId = id;
  }, carreraId);
  // click the row in the list
  const selector = `[data-carrera-id="${carreraId}"], tr[onclick*="${carreraId}"], .carrera-row[data-id="${carreraId}"]`;
  // fallback: use abrirResultado from console if direct click fails
  await page.evaluate(id => {
    if (typeof abrirResultado === 'function') abrirResultado(id);
  }, carreraId);
  await page.waitForTimeout(1500);
}

(async () => {
  console.log('\n── Probe: modelo mandil 1..N ──\n');

  const session = await buildSession();
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext();

  await ctx.addInitScript(({ key, val }) => {
    localStorage.setItem(key, JSON.stringify(val));
  }, { key: STORAGE_KEY, val: session });

  const page = await ctx.newPage();

  // ── Cargar la página ──────────────────────────────────────────
  console.log('Abriendo resultados.html…');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SS_DIR}/modelo_chapa_01_lista.png` });

  // ── TURNO 4 — 0 borrados, 8 starters ─────────────────────────
  console.log('\nTurno 4 (0 borrados, 8 starters)…');
  await navigateToCarrera(page, CARRERA_T4_ID);
  await page.screenshot({ path: `${SS_DIR}/modelo_chapa_02_t4.png` });

  const t4Mandiles = await getMfMandiles(page);
  console.log(`  data-mandil en mfCells: [${t4Mandiles.join(',')}]`);

  const t4Esperados = [1, 2, 3, 4, 5, 6, 7, 8];
  check('T4-COUNT',  t4Mandiles.length === 8,
    `Cantidad mfCells = ${t4Mandiles.length} (esperado 8)`);
  check('T4-CONSEC', JSON.stringify(t4Mandiles) === JSON.stringify(t4Esperados),
    `Mandiles = [${t4Mandiles.join(',')}] (esperado [${t4Esperados.join(',')}])`);
  check('T4-NO-GAPS', !t4Mandiles.some((m, i) => m !== i + 1),
    'Ningún hueco en la secuencia 1..N');

  // Verificar que los mandiles NO son la secuencia de gateras (el bug hubiera dado [1,3,7,8,9,10,11,13])
  const gaterasT4Raw = [1, 3, 7, 8, 9, 10, 11, 13];
  const esGateraRaw = JSON.stringify(t4Mandiles) === JSON.stringify(gaterasT4Raw);
  check('T4-NO-GATERA', !esGateraRaw,
    `Mandiles NO son la secuencia raw de gateras [${gaterasT4Raw.join(',')}]`);

  // Verificar sport-cells: IDs deben ser sport-1..sport-8
  const sportIds = await page.$$eval('.sport-cell', els => els.map(e => e.id));
  console.log(`  sport-cell IDs: [${sportIds.join(',')}]`);
  const sportEsperados = [1,2,3,4,5,6,7,8].map(n => `sport-${n}`);
  check('T4-SPORT-IDS', JSON.stringify(sportIds) === JSON.stringify(sportEsperados),
    `IDs sport-cells = [${sportIds.join(',')}]`);

  // ── TURNO 1 — 2 borrados, 9 starters ─────────────────────────
  console.log('\nTurno 1 (2 forfait, 9 starters)…');
  await navigateToCarrera(page, CARRERA_T1_ID);
  await page.screenshot({ path: `${SS_DIR}/modelo_chapa_03_t1.png` });

  const t1Mandiles = await getMfMandiles(page);
  console.log(`  data-mandil en mfCells: [${t1Mandiles.join(',')}]`);

  const t1Esperados = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  check('T1-COUNT',  t1Mandiles.length === 9,
    `Cantidad mfCells = ${t1Mandiles.length} (esperado 9)`);
  check('T1-CONSEC', JSON.stringify(t1Mandiles) === JSON.stringify(t1Esperados),
    `Mandiles = [${t1Mandiles.join(',')}] (esperado [${t1Esperados.join(',')}])`);
  check('T1-NO-GAPS', !t1Mandiles.some((m, i) => m !== i + 1),
    'Ningún hueco en la secuencia 1..N');

  // Verificar que los mandiles NO son la secuencia de gateras (el bug hubiera dado [1,2,5,7,8,9,11,12,14])
  const gaterasT1Raw = [1, 2, 5, 7, 8, 9, 11, 12, 14];
  const esGateraRawT1 = JSON.stringify(t1Mandiles) === JSON.stringify(gaterasT1Raw);
  check('T1-NO-GATERA', !esGateraRawT1,
    `Mandiles NO son la secuencia raw de gateras [${gaterasT1Raw.join(',')}]`);

  // Verificar max del input del marcador = rowCount
  const marcMax = await page.$eval('#marc-1', el => el.getAttribute('max'));
  check('T1-MAX-INPUT', marcMax === '9',
    `max del marcador = ${marcMax} (esperado 9 = rowCount)`);

  // ── marc-invalid con número fuera de rango ─────────────────────
  console.log('\nValidación marc-invalid (número fuera de rango 1..N)…');
  // Cargar T1 si no estamos ahí
  await page.fill('#marc-1', '10');   // 10 > 9 = fuera de rango, no existe como mandil
  await page.dispatchEvent('#marc-1', 'input');
  await page.waitForTimeout(300);
  const esInvalido = await page.$eval('#marc-1', el => el.classList.contains('marc-invalid'));
  check('MARC-INVALID-10', esInvalido,
    'marc-1 con valor 10 tiene clase marc-invalid (10 > 9 starters)');

  // Número válido no debe ser inválido
  await page.fill('#marc-1', '1');
  await page.dispatchEvent('#marc-1', 'input');
  await page.waitForTimeout(300);
  const esValido = await page.$eval('#marc-1', el => !el.classList.contains('marc-invalid'));
  check('MARC-VALID-1', esValido,
    'marc-1 con valor 1 NO tiene marc-invalid');

  await page.fill('#marc-1', '');  // limpiar
  await page.dispatchEvent('#marc-1', 'input');

  await page.screenshot({ path: `${SS_DIR}/modelo_chapa_04_final.png` });

  // ── TURNO 2 — Mapeo mandil→caballo y round-trip guardado ─────────────
  // Pre-verificado contra DB (inscripciones Turno 2, renumerarChapas):
  //   gatera  1 → mandil 1 → El Pampeano      (inscripcion d39ac185)
  //   gatera  5 → mandil 2 → Malenuchi Jack   (inscripcion a451b4d5)
  //   gatera 11 → mandil 3 → Gaucho Bravo     (inscripcion 7d36da3f)
  //   gatera 14 → mandil 4 → Estrella Federal (inscripcion 206eb855)
  //   gatera 16 → mandil 5 → Pampero Real     (inscripcion 5e1d9fc8)
  //   gatera 12 → forfait  → Don Dolores (excluido de renumerarChapas)
  // Posiciones guardadas en DB → marcador esperado:
  //   pos 1 → Malenuchi Jack (gatera 5 → mandil 2) → marc-1 = "2"
  //   pos 2 → El Pampeano    (gatera 1 → mandil 1) → marc-2 = "1"
  //   pos 3 → Gaucho Bravo   (gatera 11 → mandil 3) → marc-3 = "3"
  //   pos 4 → Don Dolores    (forfait → no mandil)  → marc-4 = ""
  //   pos 5 → Estrella Federal (gatera 14 → mandil 4) → marc-5 = "4"
  console.log('\nTurno 2 — mapeo mandil→caballo…');
  await navigateToCarrera(page, CARRERA_T2_ID);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SS_DIR}/modelo_chapa_05_t2_load.png` });

  // mf-cells deben ser [1,2,3,4,5]
  const t2Mandiles = await getMfMandiles(page);
  console.log(`  mf-cells T2: [${t2Mandiles.join(',')}]`);
  check('T2-MF-COUNT', t2Mandiles.length === 5,
    `Cantidad mfCells = ${t2Mandiles.length} (esperado 5)`);
  check('T2-MF-CONSEC', JSON.stringify(t2Mandiles) === JSON.stringify([1,2,3,4,5]),
    `Mandiles mfCells = [${t2Mandiles.join(',')}] (esperado [1,2,3,4,5])`);

  // MAPEO: marcador cargado desde posiciones guardadas
  const t2Marc = {};
  for (let p = 1; p <= 5; p++) {
    t2Marc[p] = await page.$eval(`#marc-${p}`, el => el.value).catch(() => '');
  }
  console.log(`  Marcador T2: ${JSON.stringify(t2Marc)}`);

  check('T2-MARC-1', t2Marc[1] === '2',
    `marc-1="${t2Marc[1]}" (esperado "2" = mandil de Malenuchi Jack, gatera 5)`);
  check('T2-MARC-2', t2Marc[2] === '1',
    `marc-2="${t2Marc[2]}" (esperado "1" = mandil de El Pampeano, gatera 1)`);
  check('T2-MARC-3', t2Marc[3] === '3',
    `marc-3="${t2Marc[3]}" (esperado "3" = mandil de Gaucho Bravo, gatera 11)`);
  check('T2-MARC-4-VACIO', t2Marc[4] === '',
    `marc-4="${t2Marc[4]}" (esperado "" — Don Dolores es forfait, excluido de renumerarChapas)`);
  check('T2-MARC-5', t2Marc[5] === '4',
    `marc-5="${t2Marc[5]}" (esperado "4" = mandil de Estrella Federal, gatera 14)`);

  // CRÍTICO: el ganador (Malenuchi Jack) tiene gatera 5 en T2, pero mandil 2.
  // Si el refactor falló y usa gatera directo, marc-1 sería "5", no "2".
  check('T2-NO-GATERA-DIRECTO', t2Marc[1] !== '5',
    `marc-1 ≠ "5" — confirma que NO se usa gatera directo (gatera de Malenuchi Jack en T2 = 5)`);

  // ── GAN/SEG chips en vista de dividendos ─────────────────────────────
  await page.waitForTimeout(500);
  const ganChip = await page.evaluate(() => {
    for (const col of document.querySelectorAll('.dv-col')) {
      if (col.querySelector('.dv-col-hdr')?.textContent?.trim() === 'GANADOR')
        return col.querySelector('.dv-chip')?.textContent?.trim() ?? null;
    }
    return null;
  });
  const segChips = await page.evaluate(() => {
    for (const col of document.querySelectorAll('.dv-col')) {
      if (col.querySelector('.dv-col-hdr')?.textContent?.trim() === 'SEGUNDO')
        return Array.from(col.querySelectorAll('.dv-chip')).map(e => e.textContent?.trim());
    }
    return [];
  });
  console.log(`  GAN chip: "${ganChip}" | SEG chips: [${segChips.join(',')}]`);
  check('T2-GAN-CHIP', ganChip === '2',
    `Chip GAN = "${ganChip}" (esperado "2" = mandil de Malenuchi Jack)`);
  check('T2-SEG-CHIPS', segChips[0] === '2' && segChips[1] === '1',
    `Chips SEG = [${segChips.join(',')}] (esperado ["2","1"])`);

  // ── Guardado + round-trip ─────────────────────────────────────────────
  console.log('\nGuardando T2 (Aplicar)…');
  const guardarBtn = page.locator('button.btn-primary').filter({ hasText: 'Aplicar' }).first();
  await guardarBtn.click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SS_DIR}/modelo_chapa_06_t2_post_save.png` });

  const statusTxt = await page.$eval('#status-txt', el => el.textContent?.trim()).catch(() => '');
  const saveOk = statusTxt.includes('guardado') || statusTxt.includes('✓');
  console.log(`  #status-txt: "${statusTxt}"`);
  check('T2-SAVE-OK', saveOk,
    `Guardar exitoso — status: "${statusTxt}"`);

  // Recarga completa para limpiar caché JS
  console.log('Recargando página…');
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => {
    const o = document.getElementById('auth-overlay');
    return !o || o.style.display === 'none';
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForSelector('.carrera-card', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Navegar a T2 con datos frescos de DB
  await navigateToCarrera(page, CARRERA_T2_ID);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SS_DIR}/modelo_chapa_07_t2_post_reload.png` });

  const t2MarcPost = {};
  for (let p = 1; p <= 5; p++) {
    t2MarcPost[p] = await page.$eval(`#marc-${p}`, el => el.value).catch(() => '');
  }
  console.log(`  Marcador T2 post-reload: ${JSON.stringify(t2MarcPost)}`);

  check('T2-RT-MARC-1', t2MarcPost[1] === '2',
    `Post-reload marc-1="${t2MarcPost[1]}" (esperado "2")`);
  check('T2-RT-MARC-2', t2MarcPost[2] === '1',
    `Post-reload marc-2="${t2MarcPost[2]}" (esperado "1")`);
  check('T2-RT-MARC-3', t2MarcPost[3] === '3',
    `Post-reload marc-3="${t2MarcPost[3]}" (esperado "3")`);
  check('T2-RT-MARC-5', t2MarcPost[5] === '4',
    `Post-reload marc-5="${t2MarcPost[5]}" (esperado "4")`);
  check('T2-RT-NO-GATERA', t2MarcPost[1] !== '5',
    `Post-reload marc-1 ≠ "5" — mapeo estable tras guardado/recarga`);

  await page.screenshot({ path: `${SS_DIR}/modelo_chapa_08_final.png` });

  await browser.close();

  console.log(`\n── Resultado: ${passed} ✅  ${failed} ❌ ──`);
  if (failed > 0) {
    console.error('\nALGÚN CHECK FALLÓ — ver screenshots en docs/smoke_screenshots/');
    process.exit(1);
  } else {
    console.log('Todos los checks pasaron.');
  }
})();
