/**
 * Probe — ISSUE-099: las 31 funciones de `public` que anon podía ejecutar + ALTER DEFAULT PRIVILEGES.
 * Migración: migrations/revoke_anon_funciones_publicas.sql (GENERADA por tests/local/gen_revoke_anon_funciones.py).
 *
 *   node tests/probe_revoke_anon_funciones.mjs              # SANDBOX (contenedor sgh-local-pg; base sgh_anon_run, copia de `sgh`)
 *   node tests/probe_revoke_anon_funciones.mjs --mutantes   # + mutantes de la migración y del rollback (cada uno TIENE que morir)
 *   node tests/probe_revoke_anon_funciones.mjs --prod       # PROD, sólo lectura: las 26 llamables por /rest/v1/rpc como anon
 *                                                           # (publishable key, sin sesión) → 401 / 42501 "permission denied"
 *
 * Sandbox (no toca `sgh` ni prod):
 *   P0  fixture fiel: el proacl de las 31 = el de prod (mismo conjunto de entradas) y anon las ejecuta
 *   A1  después del apply, anon no ejecuta NINGUNA de las 31
 *   A2  ninguna de las 31 queda con EXECUTE para PUBLIC
 *   A3  grupo A (25): authenticated y service_role conservan EXECUTE
 *   A4  grupo B (6): authenticated sin EXECUTE; service_role con EXECUTE
 *   A5  md5(pg_get_functiondef) de las 31 idéntico antes/después
 *   C1  función NUEVA de postgres en public: sin anon ni PUBLIC; con authenticated y service_role
 *   C2  función NUEVA de postgres en OTRO esquema: sin PUBLIC (efecto del default global, documentado)
 *   T1  set_updated_at sigue disparando para authenticated sin EXECUTE (UPDATE de inscripciones mueve updated_at)
 *   T2  los triggers de usuarios siguen disparando para authenticated (UPDATE de nombre_completo pasa)
 *   T3  llamar una función de trigger directo como authenticated → permission denied (el REVOKE es real)
 *   G1  authenticated ejecuta fn_is_staff(); anon → permission denied
 *   R1  rollback: proacl de las 31 = el de antes, texto exacto
 *   R2  rollback: pg_default_acl de postgres = el de antes
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const MUTANTES = process.argv.includes('--mutantes');
const PROD = process.argv.includes('--prod');
const MIG = readFileSync(ROOT + 'migrations/revoke_anon_funciones_publicas.sql', 'utf8');
const RB = readFileSync(ROOT + 'migrations/rollback_revoke_anon_funciones_publicas.sql', 'utf8');
const FIX = readFileSync(ROOT + 'tests/local/revoke_anon_sandbox.sql', 'utf8');

// La lista sale del generador (fuente única): nombre, args, acl, grupo.
const GEN = readFileSync(ROOT + 'tests/local/gen_revoke_anon_funciones.py', 'utf8');
const CON = '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}';
const SIN = '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}';
const F = [...GEN.matchAll(/^\s+\('([a-z_]+)', '([^']*)', '([^']*)', (CON_PUBLIC|SIN_PUBLIC), '([AB])'\),$/gm)]
  .map(([, n, a, r, acl, g]) => ({ n, a, r, acl: acl === 'CON_PUBLIC' ? CON : SIN, g, tipos: a ? a.split(',').map((x) => x.trim().split(' ').slice(1).join(' ')).join(', ') : '' }));
if (F.length !== 31) { console.error(`la lista del generador tiene ${F.length} funciones, no 31`); process.exit(2); }

const res = [];
const ok = (t, c, n = '') => { res.push({ t, s: c ? '✅' : '❌', n }); return c; };

// ════════════════════════════ PROD (sólo lectura, como anon) ════════════════════════════
if (PROD) {
  const URL_ = 'https://unlhcuanfrtpatoipwve.supabase.co';
  const PUB = 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
  const ejemplo = { uuid: '00000000-0000-0000-0000-0000000000ff', text: 'probe', date: '2000-01-01', numeric: 1, jsonb: {}, integer: 1, boolean: false };
  const llamables = F.filter((f) => f.r !== 'trigger');
  for (const f of llamables) {
    const body = {};
    for (const p of (f.a ? f.a.split(',') : [])) { const [nom, ...t] = p.trim().split(' '); body[nom] = ejemplo[t.join(' ')] ?? null; }
    const r = await fetch(`${URL_}/rest/v1/rpc/${f.n}`, { method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    ok(`P-${f.n}: anon → 401 / 42501 permission denied`, r.status === 401 && j.code === '42501' && /permission denied for function/.test(j.message || ''), `${r.status} ${JSON.stringify(j).slice(0, 160)}`);
  }
  for (const x of res) console.log(`${x.s} ${x.t}${x.s === '❌' && x.n ? '  → ' + x.n : ''}`);
  const fails = res.filter((x) => x.s === '❌').length;
  console.log(`\n${res.length - fails}/${res.length} checks OK (${llamables.length} llamables por la API; las 5 de trigger no las expone PostgREST)`);
  process.exit(fails ? 1 : 0);
}

// ════════════════════════════ SANDBOX ════════════════════════════
const DB = 'sgh_anon_run';
const psql = (sql, { db = DB, error = false } = {}) => {
  try {
    const out = execFileSync('docker', ['exec', '-i', 'sgh-local-pg', 'psql', '-v', 'ON_ERROR_STOP=1', '-qtAX', '-U', 'postgres', '-d', db], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return error ? { ok: true, out: out.trim() } : out.trim();
  } catch (e) {
    if (error) return { ok: false, out: String(e.stdout || '').trim(), err: String(e.stderr || '').trim() };
    throw new Error(`psql: ${String(e.stderr || e.message).trim()}`);
  }
};
const lista = F.map((f) => `'public.${f.n}(${f.tipos})'::regprocedure`).join(',');
const acls = () => JSON.parse(psql(`select json_object_agg(p.oid::regprocedure::text, p.proacl::text) from pg_proc p where p.oid in (${lista});`));
const md5s = () => psql(`select md5(string_agg(md5(pg_get_functiondef(p.oid)), ',' order by p.oid::regprocedure::text)) from pg_proc p where p.oid in (${lista});`);
const defacl = () => psql(`select coalesce(string_agg(coalesce(defaclnamespace::regnamespace::text,'(global)')||'|'||defaclobjtype::text||'|'||defaclacl::text, '#' order by 1), '') from pg_default_acl where defaclrole='postgres'::regrole and defaclobjtype='f';`);
const priv = (rol) => JSON.parse(psql(`select json_object_agg(p.proname, has_function_privilege('${rol}', p.oid, 'EXECUTE')) from pg_proc p where p.oid in (${lista});`));

function prepararBase() {
  psql(`drop database if exists ${DB} with (force);`, { db: 'postgres' });
  psql(`create database ${DB};`, { db: 'postgres' });
  execFileSync('docker', ['exec', 'sgh-local-pg', 'sh', '-c', `pg_dump -U postgres sgh | psql -q -U postgres -d ${DB} >/dev/null 2>&1`]);
  psql(FIX);
  // tablas de los triggers sin RLS en esta base descartable (T1/T2 miden el EXECUTE, no las políticas)
  psql(`alter table inscripciones disable row level security; alter table usuarios disable row level security;
        grant select, update on inscripciones, usuarios to authenticated;
        insert into usuarios (id, email, nombre_completo, rol, activo, estado, password_hash, club_id)
          values ('99000000-0000-0000-0000-000000000099', 'probe-099', 'Probe 099', 'operador', true, 'activo', '', (select id from clubs limit 1))
          on conflict (id) do nothing;`);
}

async function correr(mig, rb) {
  const r = [];
  const ok2 = (t, c, n = '') => { r.push({ t, s: c ? '✅' : '❌', n }); return c; };
  prepararBase();
  const pre = acls(); const preMd5 = md5s(); const preDef = defacl();
  const clave = (f) => `${f.n}(${f.tipos.replace(/ /g, '')})`.replace(/,/g, ',');
  const preN = Object.fromEntries(Object.entries(pre).map(([k, v]) => [k.replace(/ /g, ''), v]));
  const conj = (a) => (a || '').replace(/[{}]/g, '').split(',').sort().join(',');   // mismo conjunto de entradas (el orden puede variar)
  const fiel = F.every((f) => conj(preN[clave(f).replace(/ /g, '')]) === conj(f.acl));
  ok2('P0) fixture fiel: proacl de las 31 = prod, y anon las ejecuta', fiel && Object.values(priv('anon')).every(Boolean),
    F.filter((f) => conj(preN[clave(f).replace(/ /g, '')]) !== conj(f.acl)).map((f) => `${f.n}=${preN[clave(f).replace(/ /g, '')]}`).join(' '));

  const ap = psql(mig, { error: true });
  ok2('apply) la migración aplica sin error', ap.ok, ap.err);
  const pa = priv('anon'), pu = priv('authenticated'), ps = priv('service_role'), post = acls();
  ok2('A1) anon no ejecuta ninguna de las 31', Object.values(pa).every((v) => !v), Object.keys(pa).filter((k) => pa[k]).join(','));
  ok2('A2) ninguna queda con EXECUTE para PUBLIC', Object.values(post).every((a) => !/[{,]=X/.test(a)), JSON.stringify(Object.entries(post).filter(([, a]) => /[{,]=X/.test(a))));
  const A = F.filter((f) => f.g === 'A'), B = F.filter((f) => f.g === 'B');
  ok2('A3) grupo A (25): authenticated y service_role conservan EXECUTE', A.length === 25 && A.every((f) => pu[f.n] && ps[f.n]), A.filter((f) => !(pu[f.n] && ps[f.n])).map((f) => f.n).join(','));
  ok2('A4) grupo B (6): authenticated sin EXECUTE, service_role con EXECUTE', B.length === 6 && B.every((f) => !pu[f.n] && ps[f.n]), B.filter((f) => pu[f.n] || !ps[f.n]).map((f) => f.n).join(','));
  ok2('A5) md5(pg_get_functiondef) de las 31 idéntico', md5s() === preMd5);

  psql(`create function public.zz_probe_nueva() returns int language sql as 'select 1'; create schema if not exists zz_otro; create function zz_otro.zz_f() returns int language sql as 'select 1';`);
  const nueva = JSON.parse(psql(`select json_build_object('anon', has_function_privilege('anon','public.zz_probe_nueva()','EXECUTE'), 'auth', has_function_privilege('authenticated','public.zz_probe_nueva()','EXECUTE'), 'srv', has_function_privilege('service_role','public.zz_probe_nueva()','EXECUTE'), 'acl', (select proacl::text from pg_proc where oid='public.zz_probe_nueva()'::regprocedure));`));
  ok2('C1) función nueva en public: sin anon ni PUBLIC; con authenticated y service_role', !nueva.anon && nueva.auth && nueva.srv && !/[{,]=X/.test(nueva.acl || '{=X}'), JSON.stringify(nueva));
  const otra = psql(`select coalesce(proacl::text, 'NULL (default: PUBLIC)') from pg_proc where oid='zz_otro.zz_f()'::regprocedure;`);
  ok2('C2) función nueva de postgres en otro esquema: sin PUBLIC', !/NULL|[{,]=X/.test(otra), otra);
  psql(`drop function public.zz_probe_nueva(); drop schema zz_otro cascade;`);

  const t1 = psql(`update inscripciones set updated_at = '2000-01-01' where id = (select id from inscripciones limit 1);
    set role authenticated;
    update inscripciones set performance = coalesce(performance,'') where id = (select id from inscripciones limit 1);
    reset role;
    select (select updated_at from inscripciones where id = (select id from inscripciones limit 1)) > '2001-01-01';`, { error: true });
  ok2('T1) set_updated_at dispara para authenticated sin EXECUTE (updated_at se mueve)', t1.ok && /t$/.test(t1.out), t1.err || t1.out);
  const t2 = psql(`set role authenticated; update usuarios set nombre_completo = 'Probe 099 bis' where id = '99000000-0000-0000-0000-000000000099'; reset role;
    select nombre_completo from usuarios where id = '99000000-0000-0000-0000-000000000099';`, { error: true });
  ok2('T2) los triggers de usuarios disparan para authenticated (el UPDATE pasa)', t2.ok && /Probe 099 bis$/.test(t2.out), t2.err || t2.out);
  const t3 = psql(`set role authenticated; select public.fn_is_staff(); select public.set_updated_at();`, { error: true });
  ok2('T3) set_updated_at() directo como authenticated → permission denied', !t3.ok && /permission denied for function set_updated_at/.test(t3.err), t3.err || t3.out);
  const g1a = psql(`set role authenticated; select public.fn_is_staff() is not null or true;`, { error: true });
  const g1b = psql(`set role anon; select public.fn_is_staff();`, { error: true });
  ok2('G1) authenticated ejecuta fn_is_staff(); anon → permission denied', g1a.ok && !g1b.ok && /permission denied for function fn_is_staff/.test(g1b.err), `${g1a.err || g1a.out} | ${g1b.err || g1b.out}`);

  const rr = psql(rb, { error: true });
  ok2('rollback) aplica sin error', rr.ok, rr.err);
  const postRb = acls();
  ok2('R1) rollback: proacl de las 31 = antes (texto exacto)', JSON.stringify(postRb) === JSON.stringify(pre), JSON.stringify(Object.keys(pre).filter((k) => pre[k] !== postRb[k])));
  ok2('R2) rollback: default privileges de postgres = antes', defacl() === preDef, `${preDef} → ${defacl()}`);
  return r;
}

const base = await correr(MIG, RB);
res.push(...base);
for (const x of res) console.log(`${x.s} ${x.t}${x.s === '❌' && x.n ? '  → ' + x.n : ''}`);
const fails = res.filter((x) => x.s === '❌').length;
console.log(`\n${res.length - fails}/${res.length} checks OK`);

let vivos = 0;
if (MUTANTES) {
  const M = [
    ['MS1 sin el default global (C2)', MIG.replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;.*$/m, ''), RB],
    ['MS2 sin el default de esquema (C1)', MIG.replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;.*$/m, ''), RB],
    ['MS3 una función del grupo A sin REVOKE', MIG.replace(/^REVOKE EXECUTE ON FUNCTION public\.fn_club_de_reunion\(uuid\) FROM PUBLIC, anon;$/m, ''), RB],
    ['MS4 REVOKE sólo de anon (PUBLIC sigue)', MIG.replace(/^REVOKE EXECUTE ON FUNCTION public\.fn_is_staff\(\) FROM PUBLIC, anon;$/m, 'REVOKE EXECUTE ON FUNCTION public.fn_is_staff() FROM anon;'), RB],
    ['MS5 grupo B conserva authenticated', MIG.replace(/^REVOKE EXECUTE ON FUNCTION public\.set_updated_at\(\) FROM PUBLIC, anon, authenticated;$/m, 'REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon;'), RB],
    ['MS6 grupo A pierde authenticated', MIG.replace(/^GRANT  EXECUTE ON FUNCTION public\.fn_is_staff\(\) TO authenticated, service_role;$/m, 'REVOKE EXECUTE ON FUNCTION public.fn_is_staff() FROM authenticated;'), RB],
    ['MR1 rollback sin devolver PUBLIC', MIG, RB.replace(/(GRANT EXECUTE ON FUNCTION public\.fn_is_staff\(\) TO )PUBLIC, /, '$1')],
    ['MR2 rollback sin el default global', MIG, RB.replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;.*$/m, '')],
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
