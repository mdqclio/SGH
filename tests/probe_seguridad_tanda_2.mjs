/**
 * Probe — seguridad tanda 2 (03/10): fn_insc_monta_oficial_guard sólo service_role + default privileges de postgres
 * en public para TABLAS y SECUENCIAS nuevas sin anon. Migración: migrations/seguridad_tanda_2.sql.
 *
 *   node tests/probe_seguridad_tanda_2.mjs              # SANDBOX (contenedor sgh-local-pg; base sgh_t2_run, copia de `sgh`)
 *   node tests/probe_seguridad_tanda_2.mjs --mutantes   # + mutantes de la migración y del rollback
 *   node tests/probe_seguridad_tanda_2.mjs --prod       # PROD, sólo lectura: anon y authenticated por la API no
 *                                                       # pueden llamar /rpc/fn_insc_monta_oficial_guard
 *
 * Sandbox (no toca `sgh` ni prod):
 *   P0  fixture = prod: ACL de la función {postgres,authenticated,service_role}; default r/S de postgres en public con anon
 *   F1  función: anon, authenticated y PUBLIC sin EXECUTE; service_role con EXECUTE
 *   F2  md5(pg_get_functiondef) idéntico antes/después
 *   T1  el trigger SIGUE disparando para authenticated: cambiar la monta en una carrera OFICIAL → P0084 del guard
 *       (no "permission denied for function")
 *   T2  en una carrera NO oficial el cambio de monta pasa
 *   T3  llamar la función directo como authenticated → permission denied
 *   D1  default de tablas de postgres en public: sin anon, con authenticated y service_role
 *   D2  default de secuencias: ídem
 *   D3  tabla NUEVA (con serial) creada por postgres en public: anon sin ningún privilegio en la tabla ni en su
 *       secuencia; authenticated y service_role con todos
 *   D4  ACL de las tablas y secuencias EXISTENTES de public: idénticos antes/después
 *   R1  rollback: ACL de la función = antes
 *   R2  rollback: default r/S de postgres en public = antes
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const MUTANTES = process.argv.includes('--mutantes');
const PROD = process.argv.includes('--prod');
const MIG = readFileSync(ROOT + 'migrations/seguridad_tanda_2.sql', 'utf8');
const RB = readFileSync(ROOT + 'migrations/rollback_seguridad_tanda_2.sql', 'utf8');
const FN = "'public.fn_insc_monta_oficial_guard()'::regprocedure";

if (PROD) {
  const res = [];
  const ok = (t, c, n = '') => { res.push({ t, s: c ? '✅' : '❌', n }); return c; };
  const URL_ = 'https://unlhcuanfrtpatoipwve.supabase.co', PUB = 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
  const r = await fetch(`${URL_}/rest/v1/rpc/fn_insc_monta_oficial_guard`, { method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' }, body: '{}' });
  const j = await r.json().catch(() => ({}));
  // PostgREST no expone funciones RETURNS trigger: lo esperable es 404 (no existe para la API) o 401/42501; nunca 200.
  ok('P1) anon: /rpc/fn_insc_monta_oficial_guard no se ejecuta', r.status !== 200, `${r.status} ${JSON.stringify(j).slice(0, 160)}`);
  for (const x of res) console.log(`${x.s} ${x.t}  → ${x.n}`);
  const f = res.filter((x) => x.s === '❌').length;
  console.log(`\n${res.length - f}/${res.length} checks OK (la verificación de ACL y defaults en prod va por SQL, en el informe)`);
  process.exit(f ? 1 : 0);
}

const DB = 'sgh_t2_run';
const psql = (sql, { db = DB, error = false } = {}) => {
  try {
    const out = execFileSync('docker', ['exec', '-i', 'sgh-local-pg', 'psql', '-v', 'ON_ERROR_STOP=1', '-qtAX', '-U', 'postgres', '-d', db], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return error ? { ok: true, out: out.trim() } : out.trim();
  } catch (e) {
    if (error) return { ok: false, out: String(e.stdout || '').trim(), err: String(e.stderr || '').trim() };
    throw new Error(`psql: ${String(e.stderr || e.message).trim()}`);
  }
};
const aclFn = () => psql(`select proacl::text from pg_proc where oid=${FN};`);
const md5Fn = () => psql(`select md5(pg_get_functiondef(${FN}));`);
const defacl = (t) => psql(`select coalesce((select defaclacl::text from pg_default_acl where defaclrole='postgres'::regrole and defaclnamespace='public'::regnamespace and defaclobjtype='${t}'), '')`);
const aclExistentes = () => psql(`select md5(string_agg(c.relname||'|'||coalesce(c.relacl::text,''), '#' order by c.relname)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','S');`);
const conj = (a) => (a || '').replace(/[{}]/g, '').split(',').filter(Boolean).sort().join(',');

function prepararBase() {
  psql(`drop database if exists ${DB} with (force);`, { db: 'postgres' });
  psql(`create database ${DB};`, { db: 'postgres' });
  execFileSync('docker', ['exec', 'sgh-local-pg', 'sh', '-c', `pg_dump -U postgres sgh | psql -q -U postgres -d ${DB} >/dev/null 2>&1`]);
  // fixture = prod (03/10): ACL de la función y defaults de postgres en public para tablas/secuencias
  psql(`revoke all on function public.fn_insc_monta_oficial_guard() from public, anon, authenticated, service_role;
        grant execute on function public.fn_insc_monta_oficial_guard() to authenticated, service_role;
        alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
        alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
        alter table inscripciones disable row level security;
        grant select, update on inscripciones, carreras, resultados to authenticated;
        -- las 3 carreras de la copia son oficiales: una pasa a provisional para tener el caso "no oficial" (T2)
        update resultados set estado = 'provisional' where id = (select r.id from resultados r where r.estado = 'oficial'
          and exists (select 1 from inscripciones i where i.carrera_id = r.carrera_id) order by r.id limit 1);`);
}

async function correr(mig, rb) {
  const r = [];
  const ok = (t, c, n = '') => { r.push({ t, s: c ? '✅' : '❌', n }); return c; };
  prepararBase();
  const preFn = aclFn(), preMd5 = md5Fn(), preR = defacl('r'), preS = defacl('S'), preEx = aclExistentes();
  ok('P0) fixture = prod: función con authenticated; defaults r/S con anon',
    conj(preFn) === conj('{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}') && /anon=/.test(preR) && /anon=/.test(preS), `${preFn} | ${preR} | ${preS}`);

  const ap = psql(mig, { error: true });
  ok('apply) la migración aplica sin error', ap.ok, ap.err);
  const pr = JSON.parse(psql(`select json_build_object('anon', has_function_privilege('anon',${FN},'EXECUTE'), 'auth', has_function_privilege('authenticated',${FN},'EXECUTE'), 'srv', has_function_privilege('service_role',${FN},'EXECUTE'), 'acl', (select proacl::text from pg_proc where oid=${FN}));`));
  ok('F1) función: anon/authenticated/PUBLIC sin EXECUTE; service_role con EXECUTE', !pr.anon && !pr.auth && pr.srv && !/[{,]=X/.test(pr.acl), JSON.stringify(pr));
  ok('F2) md5(pg_get_functiondef) idéntico', md5Fn() === preMd5);

  // inscripciones de una carrera oficial y de una no oficial, con un jockey distinto al titular
  const casos = JSON.parse(psql(`select json_build_object(
      'of', (select i.id from inscripciones i join resultados r on r.carrera_id=i.carrera_id and r.estado='oficial' limit 1),
      'no', (select i.id from inscripciones i where not exists (select 1 from resultados r where r.carrera_id=i.carrera_id and r.estado='oficial') limit 1),
      'jk', (select id from profesionales limit 1));`));
  const cambiar = (id) => psql(`begin; set local role authenticated;
      update inscripciones set jockey_titular_id = case when jockey_titular_id is distinct from '${casos.jk}'::uuid then '${casos.jk}'::uuid else null end where id='${id}';
      rollback;`, { error: true });
  const t1 = cambiar(casos.of);
  ok('T1) carrera OFICIAL, authenticated cambia la monta → P0084 del guard (el trigger disparó), no permission denied',
    !t1.ok && /ya está oficializada/.test(t1.err) && !/permission denied/.test(t1.err), t1.err || t1.out);
  const t2 = cambiar(casos.no);
  ok('T2) carrera NO oficial → el cambio pasa', t2.ok, t2.err);
  const t3 = psql(`set role authenticated; select public.fn_insc_monta_oficial_guard();`, { error: true });
  ok('T3) llamarla directo como authenticated → permission denied', !t3.ok && /permission denied for function fn_insc_monta_oficial_guard/.test(t3.err), t3.err || t3.out);

  const dR = defacl('r'), dS = defacl('S');
  ok('D1) default de TABLAS de postgres en public: sin anon, con authenticated y service_role', !/anon=/.test(dR) && /authenticated=/.test(dR) && /service_role=/.test(dR), dR);
  ok('D2) default de SECUENCIAS: sin anon, con authenticated y service_role', !/anon=/.test(dS) && /authenticated=/.test(dS) && /service_role=/.test(dS), dS);
  const nt = JSON.parse(psql(`create table public.zz_t2 (id serial primary key, x int);
    select json_build_object(
      'anon_t', (select count(*) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p where has_table_privilege('anon','public.zz_t2',p)),
      'auth_t', (select count(*) from unnest(array['SELECT','INSERT','UPDATE','DELETE']) p where has_table_privilege('authenticated','public.zz_t2',p)),
      'srv_t',  (select count(*) from unnest(array['SELECT','INSERT','UPDATE','DELETE']) p where has_table_privilege('service_role','public.zz_t2',p)),
      'anon_s', (select count(*) from unnest(array['USAGE','SELECT','UPDATE']) p where has_sequence_privilege('anon','public.zz_t2_id_seq',p)),
      'auth_s', (select count(*) from unnest(array['USAGE','SELECT','UPDATE']) p where has_sequence_privilege('authenticated','public.zz_t2_id_seq',p)));`).split('\n').pop());
  ok('D3) tabla nueva (con serial): anon 0 privilegios en tabla y secuencia; authenticated y service_role todos',
    nt.anon_t === 0 && nt.anon_s === 0 && nt.auth_t === 4 && nt.srv_t === 4 && nt.auth_s === 3, JSON.stringify(nt));
  psql('drop table public.zz_t2;');
  ok('D4) ACL de las tablas y secuencias EXISTENTES de public: idénticos', aclExistentes() === preEx);

  const rr = psql(rb, { error: true });
  ok('rollback) aplica sin error', rr.ok, rr.err);
  ok('R1) rollback: ACL de la función = antes', conj(aclFn()) === conj(preFn), `${preFn} → ${aclFn()}`);
  ok('R2) rollback: defaults r/S = antes', conj(defacl('r')) === conj(preR) && conj(defacl('S')) === conj(preS), `${defacl('r')} | ${defacl('S')}`);
  return r;
}

const res = await correr(MIG, RB);
for (const x of res) console.log(`${x.s} ${x.t}${x.s === '❌' && x.n ? '  → ' + x.n : ''}`);
const fails = res.filter((x) => x.s === '❌').length;
console.log(`\n${res.length - fails}/${res.length} checks OK`);

let vivos = 0;
if (MUTANTES) {
  const M = [
    ['MS1 la función conserva authenticated', MIG.replace('FROM PUBLIC, anon, authenticated;', 'FROM PUBLIC, anon;'), RB],
    ['MS2 sin el default de tablas', MIG.replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES {4}FROM anon;$/m, ''), RB],
    ['MS3 sin el default de secuencias', MIG.replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;$/m, ''), RB],
    ['MS4 revoca también authenticated de las tablas nuevas', MIG.replace('REVOKE ALL ON TABLES    FROM anon;', 'REVOKE ALL ON TABLES    FROM anon, authenticated;'), RB],
    ['MS5 además toca las tablas existentes', MIG.replace('COMMIT;', 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;\nCOMMIT;'), RB],
    ['MS6 función sin GRANT a service_role', MIG.replace('GRANT  EXECUTE ON FUNCTION public.fn_insc_monta_oficial_guard() TO service_role;', 'REVOKE EXECUTE ON FUNCTION public.fn_insc_monta_oficial_guard() FROM service_role;'), RB],
    ['MR1 rollback sin devolver authenticated', MIG, RB.replace('GRANT EXECUTE ON FUNCTION public.fn_insc_monta_oficial_guard() TO authenticated;', '')],
    ['MR2 rollback sin el default de tablas', MIG, RB.replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES {4}TO anon;$/m, '')],
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
