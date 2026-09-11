/**
 * Probe — studbook-buscar deployada, end-to-end con sesiones reales.
 *
 * Igual que probe_rpc_spcs_duplicados.mjs: crea un operador y un profesional de prueba (magiclink),
 * y llama la función viva con sb.functions.invoke() — el mismo camino que va a usar spcs.html.
 *   1) operador, term BIEN COQUETA   → 200, ok:true, 2 exactos, fuente presente
 *   2) operador, term MARIA CATU     → 200, 0 exactos, parcial MARIA CATULENGA
 *   3) operador, term "ab" (corto)   → 400 term_invalido
 *   4) profesional (portal)          → 403 solo_staff
 *   5) sin token (fetch pelado)      → 401 (del gateway: verify_jwt)
 *   6) preflight OPTIONS desde sigh.com.ar → 204 con Access-Control-Allow-Origin
 * ESCRIBE: 2 usuarios de prueba; teardown en el finally, verificado por estado.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_studbook_buscar_e2e.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const FN_URL = `${SUPABASE_URL}/functions/v1/studbook-buscar`;
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) throw new Error('Falta SUPABASE_SECRET_KEY (source .env antes de correr).');
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const RUN = Date.now().toString(36);
const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
const creados = [];

async function sesion(rol) {
  const email = `probe.sbb.${rol}.${RUN}@sgh.test`;
  const { data: au, error: eAu } = await sb.auth.admin.createUser({ email, password: `Px-${RUN}-${Math.random().toString(36).slice(2)}`, email_confirm: true });
  if (eAu) throw new Error('createUser: ' + eAu.message);
  creados.push({ email, authId: au.user.id });
  const { error: eIns } = await sb.from('usuarios').insert({ email, nombre_completo: `Probe sbb ${rol} ${RUN}`, club_id: CLUB, rol, activo: true, estado: 'activo', password_hash: '', auth_user_id: au.user.id });
  if (eIns) throw new Error('insert usuarios: ' + eIns.message);
  const { data: link, error: eLink } = await sb.auth.admin.generateLink({ type: 'magiclink', email });
  if (eLink) throw new Error('generateLink: ' + eLink.message);
  const cli = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eOtp } = await cli.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (eOtp) throw new Error('verifyOtp: ' + eOtp.message);
  return cli;
}
// supabase-js no parsea el body del error de invoke (ver admin.html:654); se lee a mano.
async function invocar(cli, term) {
  const { data, error } = await cli.functions.invoke('studbook-buscar', { body: { term } });
  if (!error) return { status: 200, body: data };
  const res = error.context;
  let body = null; try { body = await res.json(); } catch {}
  return { status: res?.status ?? -1, body };
}

try {
  const staff = await sesion('operador');
  let r = await invocar(staff, 'BIEN COQUETA');
  ok('1) operador · BIEN COQUETA → 200, ok, 2 exactos, fuente', r.status === 200 && r.body?.ok === true && r.body.exactos?.length === 2 && typeof r.body.fuente === 'string', `${r.status} ${JSON.stringify(r.body?.exactos?.map(c => [c.nombre, c.fecha_nacimiento, c.sexo]))} · ${r.body?.fuente}`);
  r = await invocar(staff, 'MARIA CATU');
  ok('2) operador · MARIA CATU → 0 exactos, parcial MARIA CATULENGA', r.status === 200 && r.body?.exactos?.length === 0 && r.body?.parciales?.some(c => c.nombre === 'MARIA CATULENGA'), `${r.status} ${JSON.stringify(r.body?.parciales?.map(c => c.nombre))}`);
  r = await invocar(staff, 'ab');
  ok('3) operador · "ab" → 400 term_invalido', r.status === 400 && r.body?.error === 'term_invalido', `${r.status} ${JSON.stringify(r.body)}`);

  const portal = await sesion('profesional');
  r = await invocar(portal, 'BIEN COQUETA');
  ok('4) profesional (portal) → 403 solo_staff', r.status === 403 && r.body?.error === 'solo_staff', `${r.status} ${JSON.stringify(r.body)}`);

  const r5 = await fetch(FN_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ term: 'BIEN COQUETA' }) });
  ok('5) sin token → 401', r5.status === 401, String(r5.status));

  const r6 = await fetch(FN_URL, { method: 'OPTIONS', headers: { Origin: 'https://sigh.com.ar', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } });
  ok('6) preflight desde sigh.com.ar → 2xx con ACAO', r6.status < 300 && /sigh\.com\.ar|\*/.test(r6.headers.get('access-control-allow-origin') || ''), `${r6.status} ACAO=${r6.headers.get('access-control-allow-origin')}`);
} finally {
  for (const c of creados) { await sb.from('usuarios').delete().eq('email', c.email); await sb.auth.admin.deleteUser(c.authId); }
  const { data: rest } = await sb.from('usuarios').select('email').like('email', `probe.sbb.%.${RUN}@sgh.test`);
  ok('T) teardown: 0 usuarios de prueba en `usuarios`', (rest || []).length === 0, JSON.stringify(rest));
  const { data: au } = await sb.auth.admin.listUsers({ perPage: 200 });
  const huerf = (au?.users || []).filter(u => u.email?.includes('probe.sbb.') && u.email?.includes(RUN));
  ok('T) teardown: 0 usuarios de prueba en auth', huerf.length === 0, huerf.map(u => u.email).join(','));
}
for (const x of results) console.log(`${x.s} ${x.t}${x.n ? '  → ' + x.n : ''}`);
const fails = results.filter(x => x.s === '❌').length;
console.log(`\n${results.length - fails}/${results.length} asserts OK`);
process.exit(fails ? 1 : 0);
