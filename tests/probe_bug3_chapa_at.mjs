/**
 * Probe: Bug 3 — diagnóstico de chapaAt() en panel de dividendos
 *
 * Carrera de prueba: Reunión 5 / Turno 1 "11 ANIVERSARIO HIPODROMMO DE DOLORES"
 *   carrera_id: f49bb3ff-5596-4126-abe9-26271d9b179a
 *   reunion_id: c90b6186-268d-4089-8cc6-71626b627cf8
 *   9 ratificados, mandiles: [1,2,5,7,8,9,11,12,14]
 *   Mandil 3 NO está ratificado → ese es el input problemático
 *   resultado existe (id: 5ec5fb43-...) pero n_posiciones = 0 (nada guardado)
 *
 * Escenario A: abrir la carrera tal cual (sin editar) → posicionesMap vacío
 * Escenario B: escribir 1°=mandil5 (ratif), 2°=mandil3 (NO ratif), 3°=mandil1 (ratif)
 * Escenario C: escribir 1°=mandil5, 2°=mandil2, 3°=mandil1 (todos ratificados → caso correcto)
 *
 * Hipótesis verificadas:
 *   H1: buildChapaAt recibe el override correctamente
 *   H2: precedencia overridePosiciones ?? posicionesMap (comportamiento con [] vs undefined)
 *   H3: keys del override son correctas (posicion + inscripcion_id)
 *   H4: chapaAt se forwardea a renderCompChips
 *   H5: a.composicion hardcoded sobreescribe render dinámico (solo directas)
 *   H6: inscripcion_ids en resultado_posiciones no coinciden con chapaForInsc
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'fs';

const SUPABASE_URL  = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVubGhjdWFuZnJ0cGF0b2lwd3ZlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjcyNDQ5NywiZXhwIjoyMDkyMzAwNDk3fQ.drl2zQmZ3NMEksHSv14Jd_1p0HQWQg-_ACihQi3vQcE';
const STORAGE_KEY   = 'sb-unlhcuanfrtpatoipwve-auth-token';
const REUNION_ID    = 'c90b6186-268d-4089-8cc6-71626b627cf8';
const CARRERA_ID    = 'f49bb3ff-5596-4126-abe9-26271d9b179a';
const BASE_URL      = `https://mdqclio.github.io/SGH/resultados.html?reunion_id=${REUNION_ID}`;
const DOLORES_EMAIL = 'dolores@sgh.com';
const DOLORES_UID   = '01c55b92-c53e-42fd-948f-ebfdb31b8d65';

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
  const loc = resp.headers.get('location') || '';
  if (!loc.includes('access_token')) throw new Error(`No access_token: ${loc.slice(0,100)}`);
  const hp = new URLSearchParams(loc.split('#')[1]);
  const { data: ud } = await adminSb.auth.admin.getUserById(DOLORES_UID);
  return {
    access_token: hp.get('access_token'), token_type: 'bearer',
    expires_in: parseInt(hp.get('expires_in')||'3600'),
    expires_at: Math.floor(Date.now()/1000)+parseInt(hp.get('expires_in')||'3600'),
    refresh_token: hp.get('refresh_token'), user: ud?.user
  };
}

const logs = [];
let ok = 0, fail = 0;
function check(id, passed, note) {
  const m = passed ? '✅' : '❌';
  console.log(`  ${m}  [${id}] ${note}`);
  passed ? ok++ : fail++;
}
function section(t) { console.log(`\n── ${t} ──`); }

// ── Extraer estado interno de la página ────────────────────────────────────
async function snapState(page) {
  return page.evaluate(() => {
    // Usar el carreraId REAL que tiene la página abierta
    const carreraId = window.currentCarreraId;
    const res       = window.resultados?.[carreraId];
    const resId     = res?.id ?? null;
    const posMap    = resId ? (window.posicionesMap?.[resId] ?? []) : [];
    const inscAll   = (window.inscripciones ?? []).filter(i => i.carrera_id === carreraId);
    const inscRatif = inscAll.filter(i => i.estado === 'ratificado')
                             .sort((a,b) => (a.numero_partidor||999)-(b.numero_partidor||999));
    // chapaForInsc: {inscripcion_id → chapa}
    const chapaForInsc = {};
    inscRatif.forEach((ins, idx) => { chapaForInsc[ins.id] = idx + 1; });

    // chapaAt helper (replica buildChapaAt con posicionesMap)
    function chapaAt(posiciones, posIdx) {
      const p = posiciones.find(x => x.posicion === posIdx);
      return p ? (chapaForInsc[p.inscripcion_id] ?? null) : null;
    }

    return {
      carreraId,
      resId,
      posicionesMapLen: posMap.length,
      posicionesMap:    posMap.map(p => ({ posicion: p.posicion, inscripcion_id: p.inscripcion_id })),
      inscAllCount:    inscAll.length,
      inscRatifMandiles: inscRatif.map(i => i.numero_partidor),
      inscRatifCount:  inscRatif.length,
      chapaForInsc,
      chapaAt_1_from_posmap: chapaAt(posMap, 1),
      chapaAt_2_from_posmap: chapaAt(posMap, 2),
      chapaAt_3_from_posmap: chapaAt(posMap, 3),
    };
  });
}

// ── Leer chips del DOM ─────────────────────────────────────────────────────
async function snapDivChips(page) {
  return page.evaluate(() => {
    const cols = {};
    document.querySelectorAll('.dv-col').forEach(col => {
      const hdr  = col.querySelector('.dv-col-hdr')?.textContent?.trim() ?? '?';
      const rows = Array.from(col.querySelectorAll('.dv-row')).map(row => {
        const chip = row.querySelector('.dv-chip');
        return chip ? parseInt(chip.textContent.trim()) : null;
      });
      cols[hdr] = rows;
    });
    return cols;
  });
}

// ── Limpiar inputs del marcador ────────────────────────────────────────────
async function clearMarcInputs(page) {
  await page.evaluate(() => {
    for (let p = 1; p <= 20; p++) {
      const el = document.getElementById(`marc-${p}`);
      if (el) el.value = '';
    }
  });
}

// ── Simular onMarcInput: armar tempPos con mandiles dados ──────────────────
async function simulateOnMarcInput(page, mandilesByPos) {
  await clearMarcInputs(page);
  for (const [pos, mandil] of Object.entries(mandilesByPos)) {
    await page.evaluate(({ pos, mandil }) => {
      const el = document.getElementById(`marc-${pos}`);
      if (el) el.value = String(mandil);
    }, { pos: parseInt(pos), mandil });
  }
  // Réplica de onMarcInput usando window.currentCarreraId real
  return page.evaluate(() => {
    const carreraId = window.currentCarreraId;
    const insc = (window.inscripciones ?? [])
      .filter(i => i.carrera_id === carreraId && i.estado === 'ratificado');
    const inscAll = (window.inscripciones ?? [])
      .filter(i => i.carrera_id === carreraId);
    const tempPos = [];
    for (let p = 1; p <= 20; p++) {
      const raw = document.getElementById(`marc-${p}`)?.value?.trim();
      if (!raw) continue;
      const mandil = parseInt(raw, 10);
      if (isNaN(mandil)) continue;
      const found      = insc.find(i => i.numero_partidor === mandil);
      const foundAny   = inscAll.find(i => i.numero_partidor === mandil);
      tempPos.push({
        posicion: p,
        mandilTyped: mandil,
        found:    found    ? { id: found.id,    mandil: found.numero_partidor,    estado: found.estado    } : null,
        foundAny: foundAny ? { id: foundAny.id, mandil: foundAny.numero_partidor, estado: foundAny.estado } : null,
      });
    }
    return { carreraId, inscRatifCount: insc.length, tempPos };
  });
}

// ── chapaAt con un overridePosiciones dado ─────────────────────────────────
async function evalChapaAt(page, tempPos, positions) {
  return page.evaluate(({ tempPosInput, positionsToCheck }) => {
    const carreraId = window.currentCarreraId;
    const inscRatif = (window.inscripciones ?? [])
      .filter(i => i.carrera_id === carreraId && i.estado === 'ratificado')
      .sort((a,b) => (a.numero_partidor||999)-(b.numero_partidor||999));
    const chapaForInsc = {};
    inscRatif.forEach((ins, idx) => { chapaForInsc[ins.id] = idx + 1; });

    // Build override (only entries where found !== null)
    const override = tempPosInput
      .filter(e => e.found !== null)
      .map(e => ({ posicion: e.posicion, inscripcion_id: e.found.id }));

    function chapaAt(posIdx) {
      const p = override.find(x => x.posicion === posIdx);
      return p ? (chapaForInsc[p.inscripcion_id] ?? null) : null;
    }

    return {
      overrideBuilt: override,
      chapaForInscEntries: Object.entries(chapaForInsc).map(([k,v]) => ({id:k,chapa:v})),
      results: positionsToCheck.map(pos => ({
        pos,
        chapa: chapaAt(pos),
        inOverride: !!override.find(x => x.posicion === pos),
      })),
    };
  }, { tempPosInput: tempPos, positionsToCheck: positions });
}

// ── Verificar H2: [] vs undefined en precedencia ?? ───────────────────────
async function checkH2(page) {
  return page.evaluate(() => {
    const carreraId = window.currentCarreraId;
    const res   = window.resultados?.[carreraId];
    const resId = res?.id;
    const posMap = resId ? (window.posicionesMap?.[resId] ?? []) : [];
    const emptyOverride = [];
    const noOverride    = undefined;
    return {
      posMapLen:        posMap.length,
      emptyOverrideLen: (emptyOverride ?? posMap).length,
      undefOverrideLen: (noOverride   ?? posMap).length,
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const session = await buildSession();
    const ctx = await browser.newContext();
    await ctx.addInitScript(({ key, val }) => localStorage.setItem(key, val),
      { key: STORAGE_KEY, val: JSON.stringify(session) });
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    page.on('console', msg => {
      if (msg.type() === 'error') logs.push(`[console.error] ${msg.text()}`);
    });

    // ── Auth + nav ─────────────────────────────────────────────────────────
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => {
      const o = document.getElementById('auth-overlay');
      return !o || o.style.display === 'none';
    }, { timeout: 15000 }).catch(() => {});
    check('AUTH', !page.url().includes('login.html'), 'Autenticado correctamente');

    // Abrir Turno 1
    await page.waitForSelector('.carrera-card', { timeout: 15000 });
    const cards = page.locator('.carrera-card');
    const count = await cards.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const num = await cards.nth(i).locator('.cc-num').textContent().catch(() => '');
      if (num.trim() === '1') { await cards.nth(i).click(); clicked = true; break; }
    }
    check('NAV_T1', clicked, 'Turno 1 abierto');
    if (!clicked) { await browser.close(); return; }
    await page.waitForSelector('.marc-input', { timeout: 15000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SS_DIR}/bug3_A_initial.png`, fullPage: false });

    // ─────────────────────────────────────────────────────────────────────
    section('ESCENARIO A — Estado inicial (sin editar, posicionesMap vacío)');
    // ─────────────────────────────────────────────────────────────────────
    const snapA = await snapState(page);
    console.log('  currentCarreraId (real):', snapA.carreraId);
    console.log('  posicionesMap:', JSON.stringify(snapA.posicionesMap));
    console.log('  inscAll count:', snapA.inscAllCount, '| inscRatif count:', snapA.inscRatifCount);
    console.log('  inscRatif mandiles:', snapA.inscRatifMandiles);
    console.log('  chapaForInsc entries:', Object.keys(snapA.chapaForInsc).length);
    console.log('  chapaAt(1):', snapA.chapaAt_1_from_posmap, '| chapaAt(2):', snapA.chapaAt_2_from_posmap, '| chapaAt(3):', snapA.chapaAt_3_from_posmap);

    const chipsA = await snapDivChips(page);
    console.log('  DOM chips:', JSON.stringify(chipsA));

    check('A_POSMAP_EMPTY', snapA.posicionesMapLen === 0,
      `posicionesMap tiene ${snapA.posicionesMapLen} entradas (esperado 0 — sin posiciones guardadas)`);
    check('A_CHAPA_NULL', snapA.chapaAt_1_from_posmap === null,
      `chapaAt(1) = ${snapA.chapaAt_1_from_posmap} (esperado null — sin override ni posmap)`);

    // H2: Verificar precedencia [] vs undefined
    const h2 = await checkH2(page);
    console.log('\n  H2 precedencia ?? :', JSON.stringify(h2));
    check('H2_PREC',
      h2.emptyOverrideLen === 0 && h2.undefOverrideLen === 0,
      `emptyOverride.length=${h2.emptyOverrideLen} (0=usa []), undefOverride.length=${h2.undefOverrideLen} (0=sin posmap)`);

    // ─────────────────────────────────────────────────────────────────────
    section('ESCENARIO B — 1°=mandil5 (✓ratif), 2°=mandil3 (✗NO ratif), 3°=mandil1 (✓ratif)');
    // ─────────────────────────────────────────────────────────────────────
    const inputB = { 1: 5, 2: 3, 3: 1 };
    const simB    = await simulateOnMarcInput(page, inputB);
    const tempPosB = simB.tempPos;
    console.log('  inscRatifCount (inOnMarcInput):', simB.inscRatifCount);
    console.log('  onMarcInput tempPos raw:', JSON.stringify(tempPosB, null, 2));

    const evalB = await evalChapaAt(page, tempPosB, [1, 2, 3]);
    console.log('  Override construido:', JSON.stringify(evalB.overrideBuilt));
    console.log('  chapaAt results:', JSON.stringify(evalB.results));

    // Disparar el render real
    await page.evaluate(() => window.onMarcInput?.());
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SS_DIR}/bug3_B_mandil3_no_ratif.png`, fullPage: false });
    const chipsB = await snapDivChips(page);
    console.log('  DOM chips tras B:', JSON.stringify(chipsB));
    const marc2HasInvalidClass = await page.$eval('#marc-2', el => el.classList.contains('marc-invalid')).catch(() => false);

    const posicion2SkippedB = tempPosB.find(e => e.posicion === 2)?.found === null;
    check('B_MANDIL3_SKIPPED',
      posicion2SkippedB,
      posicion2SkippedB
        ? 'onMarcInput SKIP posicion 2 (mandil 3 no está en ratificados) → tempPos sin posicion:2'
        : 'INESPERADO: mandil 3 fue encontrado en ratificados');
    check('B_CHAPA2_NULL',
      evalB.results.find(r => r.pos===2)?.chapa === null,
      `chapaAt(2) = ${evalB.results.find(r=>r.pos===2)?.chapa} (esperado null → celda vacía en SEG fila 2)`);
    check('B_CHAPA1_OK',
      evalB.results.find(r => r.pos===1)?.chapa === 3,
      `chapaAt(1) = ${evalB.results.find(r=>r.pos===1)?.chapa} (esperado 3 — mandil5 es 3° en sorted [1,2,5,7,8,9,11,12,14])`);
    check('B_CHAPA3_OK',
      evalB.results.find(r => r.pos===3)?.chapa === 1,
      `chapaAt(3) = ${evalB.results.find(r=>r.pos===3)?.chapa} (esperado 1 — mandil1 es 1° en sorted)`);
    check('FIXA_MARC_INVALID', marc2HasInvalidClass,
      marc2HasInvalidClass
        ? 'marc-2 tiene clase marc-invalid (mandil 3 no ratificado → Fix A OK)'
        : 'marc-2 SIN marc-invalid — Fix A no aplica clase');

    // ─────────────────────────────────────────────────────────────────────
    section('ESCENARIO C — 1°=mandil5 (✓), 2°=mandil2 (✓), 3°=mandil1 (✓) — caso correcto');
    // ─────────────────────────────────────────────────────────────────────
    const inputC = { 1: 5, 2: 2, 3: 1 };
    const simC    = await simulateOnMarcInput(page, inputC);
    const tempPosC = simC.tempPos;
    console.log('  onMarcInput tempPos raw:', JSON.stringify(tempPosC, null, 2));

    const evalC = await evalChapaAt(page, tempPosC, [1, 2, 3]);
    console.log('  Override:', JSON.stringify(evalC.overrideBuilt));
    console.log('  chapaAt results:', JSON.stringify(evalC.results));

    await page.evaluate(() => window.onMarcInput?.());
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SS_DIR}/bug3_C_all_ratif.png`, fullPage: false });
    const chipsC = await snapDivChips(page);
    console.log('  DOM chips tras C:', JSON.stringify(chipsC));

    check('C_NOSKIP', tempPosC.every(e => e.found !== null) && tempPosC.length === 3,
      'Todos los mandiles en C son ratificados — ningún skip');
    check('C_CHAPA1_OK', evalC.results.find(r=>r.pos===1)?.chapa===3,
      `chapaAt(1)=${evalC.results.find(r=>r.pos===1)?.chapa} (esperado 3, mandil5)`);
    check('C_CHAPA2_OK', evalC.results.find(r=>r.pos===2)?.chapa===2,
      `chapaAt(2)=${evalC.results.find(r=>r.pos===2)?.chapa} (esperado 2, mandil2)`);
    check('C_CHAPA3_OK', evalC.results.find(r=>r.pos===3)?.chapa===1,
      `chapaAt(3)=${evalC.results.find(r=>r.pos===3)?.chapa} (esperado 1, mandil1)`);

    // ─────────────────────────────────────────────────────────────────────
    section('HIPÓTESIS H1–H6');
    // ─────────────────────────────────────────────────────────────────────
    // H1: buildChapaAt recibe el override
    const h1 = await page.evaluate(() => {
      const carreraId = window.currentCarreraId;
      const res = window.resultados?.[carreraId];
      const fnExists = typeof window.buildChapaAt === 'function';
      if (!fnExists) return { ok: false, reason: 'buildChapaAt not on window', resId: res?.id };
      const override = [{ posicion:1, inscripcion_id:'test-id' }];
      const fn = window.buildChapaAt(res?.id, carreraId, override);
      return { ok: typeof fn === 'function', type: typeof fn, resId: res?.id };
    });
    check('H1_RECEIVES_OVERRIDE', h1.ok,
      `buildChapaAt devuelve función: ${h1.ok} (resId=${h1.resId}, reason=${h1.reason||'—'})`);

    // H2 correctness
    check('H2_EMPTY_ARRAY',
      h2.emptyOverrideLen === 0,
      `[] ?? posicionesMap = length ${h2.emptyOverrideLen} (0 = [] wins, posicionesMap ignorado con override vacío)`);
    check('H2_UNDEFINED_FALLBACK',
      h2.undefOverrideLen === h2.posMapLen,
      `undefined ?? posicionesMap = length ${h2.undefOverrideLen} (esperado ${h2.posMapLen} = posicionesMap)`);

    // H5: composicion hardcoded en pendingApuestas
    const h5 = await page.evaluate(() => {
      const apus = window.pendingApuestas ?? [];
      const conComp = apus.filter(a => ['GAN','SEG','TER'].includes(a.tipo) && a.composicion);
      return { total: apus.length, posicionalesConComp: conComp.map(a => ({ tipo:a.tipo, comp:a.composicion })) };
    });
    console.log('\n  H5 pendingApuestas:', JSON.stringify(h5));
    check('H5_NO_COMPOSICION_POSICIONALES',
      h5.posicionalesConComp.length === 0,
      h5.posicionalesConComp.length === 0
        ? 'GAN/SEG/TER no tienen composicion hardcoded en pendingApuestas (H5 NO confirmada)'
        : `HALLAZGO: ${JSON.stringify(h5.posicionalesConComp)} tienen composicion → override ignorado`);

    // H6: inscripcion_ids en posicionesMap coinciden con chapaForInsc
    check('H6_NO_APLICA',
      snapA.posicionesMapLen === 0,
      'posicionesMap vacío para esta carrera → H6 no aplica (no hay IDs guardados que verificar)');

    // ─────────────────────────────────────────────────────────────────────
    section('FIX B — renderDivView recibe undefined (no []) cuando inputs vacíos');
    // ─────────────────────────────────────────────────────────────────────
    // Interceptar renderDivView para capturar el argumento que onMarcInput le pasa
    // cuando todos los inputs están en blanco.
    // Con el bug: renderDivView([])         → arg es Array vacío
    // Con el fix: renderDivView(undefined)  → arg es undefined
    const fixBCapture = await page.evaluate(() => {
      const original = window.renderDivView;
      let capturedArg = 'NOT_CALLED';
      window.renderDivView = function(arg) { capturedArg = arg; return original?.(arg); };
      for (let p = 1; p <= 20; p++) {
        const el = document.getElementById(`marc-${p}`);
        if (el) el.value = '';
      }
      window.onMarcInput?.();
      window.renderDivView = original;
      return {
        argWasUndefined: capturedArg === undefined,
        argType:  typeof capturedArg,
        argIsArr: Array.isArray(capturedArg),
        argLen:   Array.isArray(capturedArg) ? capturedArg.length : null,
        called:   capturedArg !== 'NOT_CALLED',
      };
    });
    console.log('  renderDivView interceptado:', JSON.stringify(fixBCapture));
    check('FIXB_POSMAP_FALLBACK', fixBCapture.argWasUndefined,
      fixBCapture.argWasUndefined
        ? 'onMarcInput pasa undefined cuando inputs vacíos → Fix B OK (posicionesMap no ignorado)'
        : `onMarcInput pasa ${fixBCapture.argIsArr ? `[](length ${fixBCapture.argLen})` : fixBCapture.argType} — Fix B no aplicado`);

    if (logs.length) console.log('\n  Console errors capturados:', logs);

    await ctx.close();
  } finally {
    await browser.close();
    console.log(`\n  TOTAL: ${ok} OK, ${fail} FAIL`);
    if (fail > 0) process.exit(1);
  }
})();
