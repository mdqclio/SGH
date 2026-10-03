/**
 * Probe — anon sin privilegios en las 37 tablas/vistas de public (03/10). Migración GENERADA por
 * tests/local/gen_revoke_anon_tablas.py: migrations/revoke_anon_tablas_publicas.sql (+ rollback_).
 *
 *   node tests/probe_revoke_anon_tablas.mjs                     # SANDBOX (sgh-local-pg; base sgh_at_run, copia de `sgh`)
 *   node tests/probe_revoke_anon_tablas.mjs --mutantes          # + mutantes de la migración y del rollback
 *   node tests/probe_revoke_anon_tablas.mjs --prod --antes      # PROD antes del apply: anon → 200 y 0 filas en las 37
 *   node tests/probe_revoke_anon_tablas.mjs --prod              # PROD después: anon → 401/42501 en las 37
 *     (en los dos modos de prod: una sesión STAFF real lee las 37 sin error de permiso; ESCRIBE 1 usuario de prueba
 *      y lo borra — auditoría antes que el usuario —; necesita SUPABASE_SECRET_KEY)
 *
 * Sandbox:
 *   P0  fixture = prod: anon con privilegios en las 37
 *   A1  después: anon sin NINGÚN privilegio (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) en las 37
 *   A2  el ACL de los demás roles (authenticated, service_role, sgh_lectura…) idéntico en las 37
 *   A3  authenticated sigue con SELECT en las 37
 *   R1  rollback: ACL de las 37 = antes (como conjunto de entradas; recibos sin DELETE para anon)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const MUTANTES = process.argv.includes('--mutantes');
const PROD = process.argv.includes('--prod');
const ANTES = process.argv.includes('--antes');
const MIG = readFileSync(ROOT + 'migrations/revoke_anon_tablas_publicas.sql', 'utf8');
const RB = readFileSync(ROOT + 'migrations/rollback_revoke_anon_tablas_publicas.sql', 'utf8');
const FIX = readFileSync(ROOT + 'tests/local/revoke_anon_tablas_sandbox.sql', 'utf8');
const OBJ = [...MIG.matchAll(/^REVOKE ALL ON TABLE public\.([a-z_]+) FROM anon;$/gm)].map((m) => m[1]);
if (OBJ.length !== 37) { console.error(`la migración tiene ${OBJ.length} objetos, no 37`); process.exit(2); }

const res = [];
const ok = (t, c, n = '') => { res.push({ t, s: c ? '✅' : '❌', n }); return c; };

if (PROD) {
  const { createClient } = await import('@supabase/supabase-js');
  const URL_ = 'https://unlhcuanfrtpatoipwve.supabase.co', PUB = 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
  const KEY = process.env.SUPABASE_SECRET_KEY;
  if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY'); process.exit(2); }
  const admin = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  // anon por la API
  const anonRes = [];
  for (const o of OBJ) {
    const r = await fetch(`${URL_}/rest/v1/${o}?select=*&limit=1`, { headers: { apikey: PUB } });
    const j = await r.json().catch(() => null);
    anonRes.push([o, r.status, Array.isArray(j) ? `${j.length} filas` : j?.code]);
  }
  if (ANTES) ok('PA) ANTES: anon → 200 y 0 filas en las 37 (la RLS no le da nada)', anonRes.every(([, s, x]) => s === 200 && x === '0 filas'), JSON.stringify(anonRes.filter(([, s, x]) => !(s === 200 && x === '0 filas'))));
  else ok('PD) DESPUÉS: anon → 401 / 42501 en las 37', anonRes.every(([, s, x]) => s === 401 && x === '42501'), JSON.stringify(anonRes.filter(([, s, x]) => !(s === 401 && x === '42501'))));
  // sesión staff real (operador de Dolores) lee las 37
  const RUN = Date.now().toString(36);
  const email = `probe-anon-tablas-${RUN}` + String.fromCharCode(64) + 'sgh-probe.invalid';
  let authId = null, uid = null;
  try {
    const { data: au, error: eA } = await admin.auth.admin.createUser({ email, password: `Px-${RUN}-${Math.random()}`, email_confirm: true });
    if (eA) throw eA; authId = au.user.id;
    const { data: u, error: eU } = await admin.from('usuarios').insert({ email, nombre_completo: `Probe ANON ${RUN}`, club_id: '0649e9c5-9e87-4aad-842f-101458e6b33c', rol: 'operador', activo: true, estado: 'activo', password_hash: '', auth_user_id: authId }).select('id').single();
    if (eU) throw eU; uid = u.id;
    const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const sb = createClient(URL_, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: eO } = await sb.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
    if (eO) throw eO;
    const staff = [];
    for (const o of OBJ) { const { data, error } = await sb.from(o).select('*').limit(1); staff.push([o, error?.code || 'ok', (data || []).length]); }
    ok('PS) sesión staff real: SELECT sin error de permiso en las 37', staff.every(([, c]) => c === 'ok'), JSON.stringify(staff.filter(([, c]) => c !== 'ok')));
    ok('PS2) y con datos donde se espera (reuniones, carreras, inscripciones, spcs, clubs)', ['reuniones', 'carreras', 'inscripciones', 'spcs', 'clubs'].every((t) => staff.find(([o]) => o === t)?.[2] === 1), JSON.stringify(staff.filter(([o]) => ['reuniones', 'carreras', 'inscripciones', 'spcs', 'clubs'].includes(o))));
    console.log('anon por objeto:', JSON.stringify(anonRes));
    console.log('staff por objeto:', JSON.stringify(staff));
  } finally {
    if (uid) { await admin.from('auditoria').delete().eq('usuario_id', uid); await admin.from('auditoria').delete().eq('registro_id', uid); await admin.from('usuarios').delete().eq('id', uid); }
    if (authId) await admin.auth.admin.deleteUser(authId).catch(() => {});
    const { count } = await admin.from('usuarios').select('id', { count: 'exact', head: true }).eq('email', email);
    ok('PZ) limpieza: 0 usuarios del probe', count === 0, String(count));
  }
  for (const x of res) console.log(`${x.s} ${x.t}${x.s === '❌' && x.n ? '  → ' + x.n : ''}`);
  const f = res.filter((x) => x.s === '❌').length;
  console.log(`\n${res.length - f}/${res.length} checks OK`);
  process.exit(f ? 1 : 0);
}

// ════════════════════════════ SANDBOX ════════════════════════════
const DB = 'sgh_at_run';
const psql = (sql, { db = DB, error = false } = {}) => {
  try {
    const out = execFileSync('docker', ['exec', '-i', 'sgh-local-pg', 'psql', '-v', 'ON_ERROR_STOP=1', '-qtAX', '-U', 'postgres', '-d', db], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return error ? { ok: true, out: out.trim() } : out.trim();
  } catch (e) {
    if (error) return { ok: false, out: String(e.stdout || '').trim(), err: String(e.stderr || '').trim() };
    throw new Error(`psql: ${String(e.stderr || e.message).trim()}`);
  }
};
const lista = OBJ.map((o) => `'public.${o}'::regclass`).join(',');
const acls = () => JSON.parse(psql(`select json_object_agg(c.relname, c.relacl::text) from pg_class c where c.oid in (${lista});`));
const conj = (a, sinAnon = false) => (a || '').replace(/[{}]/g, '').split(',').filter((e) => e && !(sinAnon && e.startsWith('anon='))).sort().join(',');
const PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
const privAnon = () => JSON.parse(psql(`select json_object_agg(o, (select count(*) from unnest(array[${PRIVS.map((p) => `'${p}'`).join(',')}]) p where has_table_privilege('anon', ('public.'||o)::regclass, p))) from unnest(array[${OBJ.map((o) => `'${o}'`).join(',')}]) o;`));

function prepararBase() {
  psql(`drop database if exists ${DB} with (force);`, { db: 'postgres' });
  psql(`create database ${DB};`, { db: 'postgres' });
  execFileSync('docker', ['exec', 'sgh-local-pg', 'sh', '-c', `pg_dump -U postgres sgh | psql -q -U postgres -d ${DB} >/dev/null 2>&1`]);
  psql(FIX);
}

async function correr(mig, rb) {
  const r = [];
  const ok2 = (t, c, n = '') => { r.push({ t, s: c ? '✅' : '❌', n }); return c; };
  prepararBase();
  const pre = acls(), pa = privAnon();
  ok2('P0) fixture = prod: anon con privilegios en las 37', Object.values(pa).every((n) => n > 0), JSON.stringify(Object.entries(pa).filter(([, n]) => !n)));
  const ap = psql(mig, { error: true });
  ok2('apply) aplica sin error', ap.ok, ap.err);
  const post = acls(), pd = privAnon();
  ok2('A1) anon sin ningún privilegio en las 37', Object.values(pd).every((n) => n === 0), JSON.stringify(Object.entries(pd).filter(([, n]) => n)));
  ok2('A2) ACL de los demás roles idéntico en las 37', OBJ.every((o) => conj(pre[o], true) === conj(post[o], true)), OBJ.filter((o) => conj(pre[o], true) !== conj(post[o], true)).join(','));
  const auth = JSON.parse(psql(`select json_object_agg(o, has_table_privilege('authenticated', ('public.'||o)::regclass, 'SELECT')) from unnest(array[${OBJ.map((o) => `'${o}'`).join(',')}]) o;`));
  ok2('A3) authenticated sigue con SELECT en las 37', Object.values(auth).every(Boolean), JSON.stringify(Object.entries(auth).filter(([, v]) => !v)));
  const rr = psql(rb, { error: true });
  ok2('rollback) aplica sin error', rr.ok, rr.err);
  const back = acls();
  ok2('R1) rollback: ACL de las 37 = antes (conjunto)', OBJ.every((o) => conj(pre[o]) === conj(back[o])), OBJ.filter((o) => conj(pre[o]) !== conj(back[o])).map((o) => `${o}: ${pre[o]} → ${back[o]}`).join(' | '));
  return r;
}

res.push(...await correr(MIG, RB));
for (const x of res) console.log(`${x.s} ${x.t}${x.s === '❌' && x.n ? '  → ' + x.n : ''}`);
const fails = res.filter((x) => x.s === '❌').length;
console.log(`\n${res.length - fails}/${res.length} checks OK`);
let vivos = 0;
if (MUTANTES) {
  const M = [
    ['MS1 falta una tabla (usuarios)', MIG.replace('REVOKE ALL ON TABLE public.usuarios FROM anon;\n', ''), RB],
    ['MS2 sólo SELECT (TRUNCATE y escrituras siguen)', MIG.replaceAll('REVOKE ALL ON TABLE', 'REVOKE SELECT ON TABLE'), RB],
    ['MS3 también le saca SELECT a authenticated', MIG.replace('REVOKE ALL ON TABLE public.spcs FROM anon;', 'REVOKE ALL ON TABLE public.spcs FROM anon, authenticated;'), RB],
    ['MS4 falta una vista', MIG.replace('REVOKE ALL ON TABLE public.v_spcs_activos FROM anon;\n', ''), RB],
    ['MR1 rollback le devuelve DELETE en recibos', MIG, RB.replace('REVOKE DELETE ON TABLE public.recibos FROM anon;\n', '')],
    ['MR2 rollback sólo SELECT', MIG, RB.replaceAll('GRANT ALL ON TABLE', 'GRANT SELECT ON TABLE')],
  ];
  console.log('\n── mutantes ──');
  for (const [n, m, rb] of M) {
    if (m === MIG && rb === RB) { console.log(`⚠ ${n}: el reemplazo no aplicó`); vivos++; continue; }
    const r = await correr(m, rb);
    const muere = r.some((x) => x.s === '❌');
    if (!muere) vivos++;
    console.log(`${muere ? '💀 muere' : '🟢 VIVO '} ${n}  (${r.filter((x) => x.s === '❌').map((x) => x.t.split(')')[0]).join(',')})`);
  }
  console.log(`mutantes: ${M.length - vivos}/${M.length} muertos`);
}
psql(`drop database if exists ${DB} with (force);`, { db: 'postgres' });
process.exit(fails || vivos ? 1 : 0);
