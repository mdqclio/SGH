/**
 * Probe: tiempo_ganador round-trip y variantes de formato.
 *
 * Incluye unit tests de normalizeTiempoGanador (leading-zero, sin browser).
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

/* ── Unit tests: normalizeTiempoGanador ── */
function normalizeTiempoGanador(raw) {
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?$/);
  if (!m) return false;
  const mm = String(parseInt(m[1], 10));
  const cc = m[3] ? m[3].padEnd(2, '0') : '00';
  return `${mm}:${m[2]}.${cc}`;
}

{
  const col = (s,n) => String(s??'').padEnd(n);
  const cases = [
    { input: '01:02.40', expected: '1:02.40',  desc: 'leading zero en minuto eliminado' },
    { input: '00:58.23', expected: '0:58.23',  desc: 'cero minuto preservado (no elimina si es 0)' },
    { input: '1:02.40',  expected: '1:02.40',  desc: 'sin cambio (canónico)' },
  ];
  console.log('\n' + '─'.repeat(75));
  console.log('  UNIT: normalizeTiempoGanador — leading-zero');
  console.log('─'.repeat(75));
  console.log(col('Input',12) + col('Esperado',12) + col('Obtenido',12) + 'Estado');
  let unitFail = 0;
  for (const c of cases) {
    const got = normalizeTiempoGanador(c.input);
    const ok  = got === c.expected;
    if (!ok) unitFail++;
    console.log(col(c.input,12) + col(c.expected,12) + col(String(got),12) + (ok ? '✅' : '❌') + '  ' + c.desc);
  }
  console.log('─'.repeat(75) + '\n');
  if (unitFail > 0) { console.error(`UNIT FAIL: ${unitFail} caso(s) fallaron`); process.exit(1); }
}

const SUPABASE_URL  = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVubGhjdWFuZnJ0cGF0b2lwd3ZlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjcyNDQ5NywiZXhwIjoyMDkyMzAwNDk3fQ.drl2zQmZ3NMEksHSv14Jd_1p0HQWQg-_ACihQi3vQcE';
const STORAGE_KEY   = 'sb-unlhcuanfrtpatoipwve-auth-token';
const REUNION_ID    = 'c90b6186-268d-4089-8cc6-71626b627cf8';
const RESULTADO_ID  = '052b679b-f539-4c20-9038-a4f2fce48287';
const BASE_URL      = `https://mdqclio.github.io/SGH/resultados.html?reunion_id=${REUNION_ID}`;
const DOLORES_EMAIL = 'dolores@sgh.com';
const DOLORES_UID   = '01c55b92-c53e-42fd-948f-ebfdb31b8d65';

const adminSb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function buildSession() {
  const { data: linkData, error } = await adminSb.auth.admin.generateLink({
    type: 'magiclink', email: DOLORES_EMAIL,
  });
  if (error) throw new Error(error.message);
  const resp = await fetch(linkData.properties.action_link, { redirect: 'manual' });
  const loc  = resp.headers.get('location') || '';
  const hp   = new URLSearchParams(loc.split('#')[1]);
  const expiresIn = parseInt(hp.get('expires_in') || '3600');
  const { data: ud } = await adminSb.auth.admin.getUserById(DOLORES_UID);
  return {
    access_token:  hp.get('access_token'),
    refresh_token: hp.get('refresh_token'),
    token_type:    'bearer',
    expires_in:    expiresIn,
    expires_at:    Math.floor(Date.now()/1000) + expiresIn,
    user:          ud?.user,
  };
}

async function dbValue() {
  const { data } = await adminSb.from('resultados')
    .select('tiempo_ganador').eq('id', RESULTADO_ID).single();
  return data?.tiempo_ganador ?? null;
}

(async () => {
  const session = await buildSession();
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const ctx     = await browser.newContext();
  await ctx.addInitScript(({k,v}) => localStorage.setItem(k,v),
    { k: STORAGE_KEY, v: JSON.stringify(session) });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());

  // ── Navigate + open turno 6 ───────────────────────────────────────────────
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => {
    const o = document.getElementById('auth-overlay');
    return !o || o.style.display === 'none';
  }, { timeout: 15000 }).catch(() => {});

  await page.waitForSelector('.carrera-card', { timeout: 15000 });
  const cards = page.locator('.carrera-card');
  for (let i = 0; i < await cards.count(); i++) {
    if ((await cards.nth(i).locator('.cc-num').textContent()).trim() === '6') {
      await cards.nth(i).click();
      break;
    }
  }
  await page.waitForSelector('#tiempo-ganador', { timeout: 10000 });
  await page.waitForTimeout(600);

  const VARIANTS = [
    '1:02.40',
    '0:58.23',
    '1:02.4',
    '1:02',
    ':58.23',
    '58.23',
    '01:02.40',   // leading zero → debe normalizar a 1:02.40
    '00:58.23',   // 00 minutos → debe normalizar a 0:58.23
  ];

  const results = [];

  for (const variant of VARIANTS) {
    // Intercept to capture what was sent in p_tiempo_ganador
    let sentValue = '(no POST interceptado)';
    const routeHandler = async (route, request) => {
      if (request.method() === 'POST' && request.url().includes('aplicar_resultado')) {
        try {
          const body = JSON.parse(request.postData() || '{}');
          sentValue = String(body.p_tiempo_ganador ?? '(null)');
        } catch { sentValue = request.postData()?.slice(0,100) || '(parse error)'; }
      }
      await route.continue();
    };
    await page.route('**supabase.co/rest/v1/rpc/aplicar_resultado**', routeHandler);

    // Fill and save
    await page.locator('#tiempo-ganador').fill(variant);
    await page.keyboard.press('F10');

    // Wait for toast
    const toast = await page.waitForSelector('.toast', { timeout: 8000 }).catch(() => null);
    const toastTxt = toast ? (await toast.textContent()).trim() : '(no toast)';

    await page.unroute('**supabase.co/rest/v1/rpc/aplicar_resultado**');

    // DB value
    await page.waitForTimeout(400);
    const db = await dbValue();

    // Reload and read input value back
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => {
      const o = document.getElementById('auth-overlay');
      return !o || o.style.display === 'none';
    }, { timeout: 15000 }).catch(() => {});
    await page.waitForSelector('.carrera-card', { timeout: 15000 });
    const cards2 = page.locator('.carrera-card');
    for (let i = 0; i < await cards2.count(); i++) {
      if ((await cards2.nth(i).locator('.cc-num').textContent()).trim() === '6') {
        await cards2.nth(i).click();
        break;
      }
    }
    await page.waitForSelector('#tiempo-ganador', { timeout: 10000 });
    await page.waitForTimeout(500);
    const inputAfter = await page.locator('#tiempo-ganador').inputValue();

    const deformed = inputAfter !== variant;
    results.push({ variant, sentValue, db, inputAfter, toastTxt, deformed });
  }

  await browser.close();

  // ── Restore canonical value ───────────────────────────────────────────────
  const { data: rr } = await adminSb.from('resultados').select('updated_at').eq('id', RESULTADO_ID).single();
  await adminSb.rpc('aplicar_resultado', {
    p_resultado_id:        RESULTADO_ID,
    p_expected_updated_at: rr?.updated_at,
    p_carrera_id:          'ee373aea-bb8d-4866-9a11-1f34282dbb73',
    p_estado:              'provisional',
    p_tiempo_clima:        'BUENO',
    p_estado_pista:        'normal',
    p_tiempo_ganador:      '1:02.40',
    p_incidentes:          'Sin novedad',
    p_favorito_mandil:     2,
    p_redistribucion_legs: { "1":"gde","2":"al3","3":"al4","4":"al5","5":"al6" },
    p_posiciones:          [],
    p_apuestas:            null,
  });

  // ── Report ────────────────────────────────────────────────────────────────
  const col = (s, n) => String(s ?? '').padEnd(n);
  console.log('\n' + '═'.repeat(95));
  console.log('  PROBE: tiempo_ganador round-trip');
  console.log('═'.repeat(95));
  console.log(col('Input',12) + col('→ RPC sent',15) + col('→ DB',15) + col('→ Input reload',18) + col('Deformado?',12) + 'Toast');
  console.log('─'.repeat(95));
  for (const r of results) {
    console.log(
      col(r.variant,12) +
      col(r.sentValue,15) +
      col(r.db,15) +
      col(r.inputAfter,18) +
      col(r.deformed ? '❌ SÍ' : '✅ no', 12) +
      r.toastTxt
    );
  }
  console.log('═'.repeat(95));
  console.log('\nResultado restaurado a "1:02.40"\n');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
