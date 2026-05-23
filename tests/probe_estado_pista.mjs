/**
 * Smoke: estado_pista — 4 valores válidos persisten, 'normal' ausente del select,
 *        body del RPC sin p_tiempo_clima.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVubGhjdWFuZnJ0cGF0b2lwd3ZlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjcyNDQ5NywiZXhwIjoyMDkyMzAwNDk3fQ.drl2zQmZ3NMEksHSv14Jd_1p0HQWQg-_ACihQi3vQcE';
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

async function dbEstadoPista() {
  const { data } = await adminSb.from('resultados').select('estado_pista').eq('id', RESULTADO_ID).single();
  return data?.estado_pista ?? null;
}

async function openTurno6(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => { const o = document.getElementById('auth-overlay'); return !o || o.style.display==='none'; }, { timeout: 15000 }).catch(()=>{});
  await page.waitForSelector('.carrera-card', { timeout: 15000 });
  const cards = page.locator('.carrera-card');
  for (let i = 0; i < await cards.count(); i++) {
    if ((await cards.nth(i).locator('.cc-num').textContent()).trim() === '6') {
      await cards.nth(i).click(); break;
    }
  }
  await page.waitForSelector('#estado-pista', { timeout: 10000 });
  await page.waitForTimeout(600);
}

(async () => {
  const session = await buildSession();
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const ctx = await browser.newContext();
  await ctx.addInitScript(({k,v}) => localStorage.setItem(k,v), { k: STORAGE_KEY, v: JSON.stringify(session) });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());

  await openTurno6(page);

  const results = [];
  const col = (s,n) => String(s??'').padEnd(n);

  // T0: 'normal' ausente del select
  const opts = await page.locator('#estado-pista option').allTextContents();
  const hasNormal = opts.some(o => o.toLowerCase() === 'normal');
  results.push({ test: 'T0 — "normal" ausente del select', status: hasNormal ? '❌' : '✅',
    note: `Opciones: [${opts.join(', ')}]` });

  // T0b: DOM sin #tiempo-clima ni #jockey1
  const hasClima  = await page.locator('#tiempo-clima').count() > 0;
  const hasJockey = await page.locator('#jockey1').count() > 0;
  results.push({ test: 'T0b — DOM sin clima ni jockey', status: (!hasClima && !hasJockey) ? '✅' : '❌',
    note: `#tiempo-clima: ${hasClima}, #jockey1: ${hasJockey}` });

  // T0c: body del fetch al RPC sin p_tiempo_clima
  let rpcBody = null;
  await page.route('**supabase.co/rest/v1/rpc/aplicar_resultado**', async (route, req) => {
    if (req.method() === 'POST') {
      try { rpcBody = JSON.parse(req.postData() || '{}'); } catch {}
    }
    await route.continue();
  });
  await page.locator('#estado-pista').selectOption('seca');
  await page.keyboard.press('F10');
  await page.waitForSelector('.toast', { timeout: 8000 }).catch(()=>{});
  await page.waitForTimeout(300);
  await page.unroute('**supabase.co/rest/v1/rpc/aplicar_resultado**');
  const hasClimaProp = rpcBody ? Object.prototype.hasOwnProperty.call(rpcBody, 'p_tiempo_clima') : null;
  results.push({ test: 'T0c — RPC sin p_tiempo_clima', status: hasClimaProp === false ? '✅' : '❌',
    note: `p_tiempo_clima en body: ${hasClimaProp} | keys: [${rpcBody ? Object.keys(rpcBody).join(', ') : 'no body'}]` });

  // T1-T4: cada valor válido persiste
  for (const pista of ['seca', 'humeda', 'fangosa', 'pesada']) {
    await page.locator('#estado-pista').selectOption(pista);
    await page.keyboard.press('F10');
    const toast = await page.waitForSelector('.toast', { timeout: 8000 }).catch(()=>null);
    const toastTxt = toast ? (await toast.textContent()).trim() : '(no toast)';
    await page.waitForTimeout(400);
    const db = await dbEstadoPista();
    await openTurno6(page);
    const inputAfter = await page.locator('#estado-pista').inputValue();
    const ok = db === pista && inputAfter === pista && !toastTxt.toLowerCase().includes('error');
    results.push({ test: `T${results.length-1} — "${pista}" persiste`, status: ok ? '✅' : '❌',
      note: `DB: "${db}" | input reload: "${inputAfter}" | toast: "${toastTxt}"` });
  }

  await browser.close();

  // Restaurar estado original (estado_pista = NULL, tiempo_ganador = '1:02.40')
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
  console.log('[RESTORE] estado_pista → NULL, tiempo_ganador → 1:02.40');

  // Reporte
  console.log('\n' + '═'.repeat(95));
  console.log('  SMOKE: estado_pista + cleanup-fede');
  console.log('═'.repeat(95));
  console.log(col('Test',40) + col('Estado',8) + 'Nota');
  console.log('─'.repeat(95));
  for (const r of results) console.log(col(r.test,40) + col(r.status,8) + r.note);
  const pass = results.filter(r=>r.status==='✅').length;
  const fail = results.filter(r=>r.status==='❌').length;
  console.log('─'.repeat(95));
  console.log(`Total: ${results.length} | ✅ ${pass} | ❌ ${fail}`);
  console.log('═'.repeat(95) + '\n');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
