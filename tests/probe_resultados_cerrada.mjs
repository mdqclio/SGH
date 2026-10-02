/**
 * Probe — resultados en reunión con liquidación cerrada (ISSUE-102) + oficializado_* (ISSUE-101) +
 * oficial → provisional por aplicar_resultado (ISSUE-089). SÓLO SANDBOX.
 *
 * Arma en el contenedor sgh-local-pg una base TEMPLATE con tests/local/resultados_cerrada_sandbox.sql y la v1
 * exacta de aplicar_resultado / desoficializar_carrera (los rollbacks de las v2), y por corrida una base nueva a
 * la que le aplica, en orden, el TEXTO de las 4 migraciones (o un mutante):
 *   resultados_backfill_oficializado → resultados_guard_cerrada → aplicar_resultado_v2 → desoficializar_carrera_v2
 * Las sesiones de la API se simulan como en Supabase: SET SESSION AUTHORIZATION authenticator + SET ROLE
 * (authenticated | service_role) + request.jwt.claims. La sesión "migración" es postgres directo.
 *
 *   node tests/probe_resultados_cerrada.mjs [--mutantes]
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = (f) => readFileSync(join(HERE, '..', 'migrations', f), 'utf8');
const ORDEN = ['resultados_backfill_oficializado.sql', 'resultados_guard_cerrada.sql', 'aplicar_resultado_v2.sql', 'desoficializar_carrera_v2.sql'];
const FIXTURE = readFileSync(join(HERE, 'local', 'resultados_cerrada_sandbox.sql'), 'utf8');
const V1 = MIG('rollback_aplicar_resultado_v2.sql') + '\n' + MIG('rollback_desoficializar_carrera_v2.sql');
const PSQL = (process.env.PSQL_BASE || 'docker exec -i sgh-local-pg psql -v ON_ERROR_STOP=1 -U postgres -q -tA').split(' ');
const TPL = 'sgh_rc_tpl', RUN = 'sgh_rc_run';
const MUTANTES = process.argv.includes('--mutantes');

const psql = (db, sql) => { const r = spawnSync(PSQL[0], [...PSQL.slice(1), '-d', db], { input: sql, encoding: 'utf8' }); return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }; };
const json = (r) => { try { return JSON.parse(r.out.split('\n').filter(Boolean).pop()); } catch { return null; } };

// ── ids del fixture ──
const SECRE = { sub: 'a0000000-0000-0000-0000-000000000001', email: 'secre@probe', id: 'e0000000-0000-0000-0000-000000000001' };
const OPER = { sub: 'a0000000-0000-0000-0000-000000000002', email: 'operador@probe', id: 'e0000000-0000-0000-0000-000000000002' };
const PORTAL = { sub: 'a0000000-0000-0000-0000-000000000004', email: 'portal@probe' };
const PUBLICO = { sub: 'a0000000-0000-0000-0000-000000000005', email: 'publico@probe' };
const R8C3 = 'c8000000-0000-0000-0000-000000000001', R8C5 = 'c8000000-0000-0000-0000-000000000002', R8T9 = 'c8000000-0000-0000-0000-000000000003';
const R9C4 = 'c9000000-0000-0000-0000-000000000001', R9C6 = 'c9000000-0000-0000-0000-000000000002', R9C8 = 'c9000000-0000-0000-0000-000000000003';
const RES = { r8c3: 'f8000000-0000-0000-0000-000000000001', r8c5: 'f8000000-0000-0000-0000-000000000002', r9c4: 'f9000000-0000-0000-0000-000000000001', r9c6: 'f9000000-0000-0000-0000-000000000002' };

const claims = (o) => `select set_config('request.jwt.claims', '${JSON.stringify(o)}', true) is null as x_ \\gset\n`;
const API = (rol, u) => `set local session authorization authenticator;\nset local role ${rol};\n${claims(rol === 'service_role' ? { role: 'service_role' } : { role: 'authenticated', sub: u.sub, email: u.email })}`;
const STAFF = (u = SECRE) => API('authenticated', u);
const SR = API('service_role');
// payload de aplicar_resultado con las posiciones actuales de la carrera (leídas por postgres antes de cambiar de sesión)
const APLICAR = (carrera) => `select coalesce(json_agg(json_build_object('inscripcion_id', x.id, 'posicion', x.rn, 'no_largo', false)), '[]')::text as pos from (select i.id, row_number() over (order by i.id) rn from inscripciones i where i.carrera_id = '${carrera}') x \\gset\n`;
const CALL = (carrera, resId, estado) => `select aplicar_resultado(${resId ? `'${resId}'` : 'NULL'}::uuid, NULL, '${carrera}'::uuid, '${estado}', 'seca', NULL, NULL, NULL, '{}'::jsonb, :'pos'::jsonb, '[{"tipo":"GAN","div_orig":4.1,"orden":1}]'::jsonb) as r_ \\gset\n`;
const AP = (sesion, carrera, resId, estado) => APLICAR(carrera) + sesion + CALL(carrera, resId, estado);

async function casos(db, pre) {
  const res = [];
  const ok = (t, c, n = '') => { res.push({ t, s: c ? '✅' : '❌', n }); return c; };
  const tx = (body) => psql(db, `begin;\n${body}\nrollback;\n`);
  const err = (r, re) => !r.ok && re.test(r.err);
  const MSG_TRIGGER = /ERROR:  La liquidación de esta reunión está cerrada \(saldada\): el resultado de la carrera/;

  // B — backfill (ya aplicado por la corrida)
  let r = psql(db, `select json_object_agg(id, json_build_object('at', oficializado_at, 'por', oficializado_por)) from resultados;`);
  let j = json(r);
  ok('B1 backfill: R8 C3 = la ÚLTIMA transición (operador 23/08 11:06:06)', j?.[RES.r8c3]?.at?.startsWith('2026-08-23T11:06:06') && j?.[RES.r8c3]?.por === OPER.id, JSON.stringify(j?.[RES.r8c3]));
  ok('B1 backfill: R8 C5 sin usuario en la auditoría → fecha y por NULL', j?.[RES.r8c5]?.at?.startsWith('2026-08-16T18:30:00') && j?.[RES.r8c5]?.por === null, JSON.stringify(j?.[RES.r8c5]));
  ok('B1 backfill: R9 C4 (18:17:24, secretario); provisional sin tocar', j?.[RES.r9c4]?.at?.startsWith('2026-09-20T18:17:24') && j?.[RES.r9c4]?.por === SECRE.id && j?.[RES.r9c6]?.at === null, JSON.stringify([j?.[RES.r9c4], j?.[RES.r9c6]]));
  r = tx(`${MIG('rollback_resultados_backfill_oficializado.sql').replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '')}\nselect count(*) filter (where oficializado_at is not null) from resultados;`);
  ok('B2 rollback del backfill → vuelve todo a NULL', r.ok && r.out.split('\n').pop() === '0', r.err || r.out);

  // G — reunión cerrada (R8)
  r = tx(AP(STAFF(), R8C3, RES.r8c3, 'oficial'));
  ok('G1 staff aplicar_resultado en R8 C3 → P0092 de la RPC ("aplicar_resultado: … carrera 3")', err(r, /aplicar_resultado: la liquidación de esta reunión está cerrada \(saldada\): el resultado de la carrera 3 no se puede modificar/), r.err);
  r = tx(AP(SR, R8C5, RES.r8c5, 'oficial'));
  ok('G2 service_role aplicar_resultado en R8 C5 → P0092 (service_role sujeto)', err(r, /aplicar_resultado: la liquidación .* carrera 5 /), r.err);
  r = tx(AP(STAFF(), R8T9, null, 'provisional'));
  ok('G2b staff aplicar_resultado nuevo en R8 turno 9 (sin nº de programa) → P0092 "carrera del turno 9"', err(r, /carrera del turno 9 no se puede modificar/), r.err);
  r = tx(`${STAFF()}update resultados set incidentes = 'x' where id = '${RES.r8c3}';`);
  ok('G3 staff UPDATE directo de resultados en R8 → P0092 del trigger', err(r, MSG_TRIGGER), r.err);
  r = tx(`${SR}update resultados set incidentes = 'x' where id = '${RES.r8c3}';`);
  ok('G4 service_role UPDATE directo de resultados en R8 → P0092 del trigger', err(r, MSG_TRIGGER), r.err);
  r = tx(`${STAFF()}delete from resultado_posiciones where resultado_id = '${RES.r8c3}';`);
  ok('G5 staff DELETE de posiciones de R8 → P0092', err(r, MSG_TRIGGER), r.err);
  r = tx(`select id as ins from inscripciones where carrera_id = '${R8C5}' limit 1 \\gset\n${STAFF()}insert into resultado_posiciones (resultado_id, inscripcion_id, posicion, no_largo) values ('${RES.r8c5}', :'ins', 99, false);`);
  ok('G5 staff INSERT de posiciones en R8 → P0092', err(r, MSG_TRIGGER), r.err);
  r = tx(`${STAFF()}update resultado_apuestas set div_orig = 9 where resultado_id = '${RES.r8c3}';`);
  ok('G5 staff UPDATE de apuestas de R8 → P0092', err(r, MSG_TRIGGER), r.err);
  r = tx(`${SR}delete from resultado_apuestas where resultado_id = '${RES.r8c3}';`);
  ok('G6 service_role DELETE de apuestas de R8 → P0092', err(r, MSG_TRIGGER), r.err);
  r = tx(`${STAFF()}select desoficializar_carrera('${R8C5}');`);
  ok('G7 staff desoficializar R8 C5 (sin plata comprometida) → P0092 de la RPC', err(r, /desoficializar_carrera: la liquidación de esta reunión está cerrada \(saldada\): la carrera 5 no se puede des-oficializar/), r.err);
  r = tx(`${STAFF()}select desoficializar_carrera('${R8C3}');`);
  ok('G8 staff desoficializar R8 C3 (con plata) → P0092 antes que "pagos emitidos"', err(r, /desoficializar_carrera: la liquidación .* carrera 3 /), r.err);
  r = tx(`update resultados set incidentes = 'migración' where id = '${RES.r8c3}' returning incidentes;`);
  ok('G9 sesión directa (migración) puede escribir R8', r.ok && r.out.includes('migración'), r.err || r.out);
  r = tx(`${SR}select set_config('sgh.correccion_resultado', '1', true) is null as y_ \\gset\nupdate resultados set incidentes = 'corrección' where id = '${RES.r8c3}' returning incidentes;`);
  ok('G10 con la marca sgh.correccion_resultado (paso 4) pasa', r.ok && r.out.includes('corrección'), r.err || r.out);

  // O — reunión abierta (R9)
  r = tx(`${AP(STAFF(), R9C6, RES.r9c6, 'oficial')}reset role;\nreset session authorization;\nselect json_build_object('at', oficializado_at > now() - interval '1 minute', 'por', oficializado_por, 'estado', estado) from resultados where id = '${RES.r9c6}';`);
  j = json(r);
  ok('O1 staff oficializa R9 C6 → oficializado_at = now(), oficializado_por = el secretario', r.ok && j?.at === true && j?.por === SECRE.id && j?.estado === 'oficial', r.err || JSON.stringify(j));
  r = tx(`${AP(STAFF(), R9C6, RES.r9c6, 'oficial')}reset role;\nreset session authorization;\nselect oficializado_at as at1 from resultados where id = '${RES.r9c6}' \\gset\n${AP(STAFF(OPER), R9C6, RES.r9c6, 'oficial')}reset role;\nreset session authorization;\nselect json_build_object('igual', oficializado_at = :'at1'::timestamptz, 'por', oficializado_por) from resultados where id = '${RES.r9c6}';`);
  j = json(r);
  ok('O2 re-aplicar oficial (otro usuario) conserva quién y cuándo', r.ok && j?.igual === true && j?.por === SECRE.id, r.err || JSON.stringify(j));
  r = tx(`${AP(STAFF(), R9C6, RES.r9c6, 'oficial')}${AP(STAFF(), R9C6, RES.r9c6, 'provisional')}`);
  ok('O3 oficial → provisional por aplicar_resultado → P0089 "des-oficializala primero" (ISSUE-089)', err(r, /aplicar_resultado: la carrera 6 está oficial; para corregirla, des-oficializala primero/), r.err);
  r = tx(`${AP(STAFF(), R9C6, RES.r9c6, 'oficial')}select desoficializar_carrera('${R9C6}') is not null as d_ \\gset\nreset role;\nreset session authorization;\nselect json_build_object('estado', estado, 'at', oficializado_at, 'por', oficializado_por) from resultados where id = '${RES.r9c6}';`);
  j = json(r);
  ok('O4 desoficializar en R9 → provisional con oficializado_* NULL', r.ok && j?.estado === 'provisional' && j?.at === null && j?.por === null, r.err || JSON.stringify(j));
  r = tx(`${AP(STAFF(), R9C6, RES.r9c6, 'provisional')}reset role;\nreset session authorization;\nselect json_build_object('at', oficializado_at) from resultados where id = '${RES.r9c6}';`);
  j = json(r);
  ok('O5 provisional → provisional: oficializado_at NULL', r.ok && j?.at === null, r.err || JSON.stringify(j));
  r = tx(`${AP(STAFF(), R9C8, null, 'oficial')}reset role;\nreset session authorization;\nselect json_build_object('at', oficializado_at is not null, 'por', oficializado_por) from resultados where carrera_id = '${R9C8}';`);
  j = json(r);
  ok('O6 resultado NUEVO directo en oficial → fecha y usuario', r.ok && j?.at === true && j?.por === SECRE.id, r.err || JSON.stringify(j));
  r = tx(`${AP(SR, R9C6, RES.r9c6, 'oficial')}reset role;\nreset session authorization;\nselect json_build_object('at', oficializado_at is not null, 'por', oficializado_por) from resultados where id = '${RES.r9c6}';`);
  j = json(r);
  ok('O7 service_role oficializa → fecha, usuario NULL', r.ok && j?.at === true && j?.por === null, r.err || JSON.stringify(j));

  // A — auditoría nueva
  r = tx(`delete from auditoria;\n${AP(STAFF(), R9C6, RES.r9c6, 'provisional')}reset role;\nreset session authorization;\nselect json_object_agg(tabla || ':' || accion, n) from (select tabla, accion, count(*) n from auditoria where usuario_id = '${SECRE.id}' group by 1,2) x;`);
  j = json(r);
  ok('A1 aplicar en R9 deja auditoría de resultado_posiciones y resultado_apuestas con el usuario', r.ok && j?.['resultado_posiciones:DELETE'] === 3 && j?.['resultado_posiciones:INSERT'] === 3 && j?.['resultado_apuestas:DELETE'] === 1 && j?.['resultado_apuestas:INSERT'] === 1, r.err || JSON.stringify(j));

  // P — políticas
  r = tx(`select id as ins from inscripciones where carrera_id = '${R9C8}' limit 1 \\gset\n${API('authenticated', PUBLICO)}insert into resultados (carrera_id) values ('${R9C8}');`);
  ok('P1 usuario activo con club que NO es staff (rol publico) → RLS en resultados', err(r, /row-level security/), r.err);
  r = tx(`select id as ins from inscripciones where carrera_id = '${R9C4}' limit 1 \\gset\n${API('authenticated', PUBLICO)}insert into resultado_posiciones (resultado_id, inscripcion_id, posicion) values ('${RES.r9c4}', :'ins', 77);`);
  ok('P1 rol publico → RLS en resultado_posiciones', err(r, /row-level security/), r.err);
  r = tx(`${API('authenticated', PORTAL)}insert into resultados (carrera_id) values ('${R9C8}');`);
  ok('P1 portal → RLS en resultados', err(r, /row-level security/), r.err);
  r = tx(`${STAFF()}with u as (update resultados set incidentes = 'staff ok' where id = '${RES.r9c6}' returning 1) select count(*) from u;`);
  ok('P2 staff sigue pudiendo escribir resultados de R9 por la API', r.ok && r.out.split('\n').pop() === '1', r.err || r.out);
  const post = psql(db, `select md5(string_agg(tablename||'|'||policyname||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), '#' order by tablename, policyname)) from pg_policies where not (tablename in ('resultados','resultado_posiciones') and cmd in ('INSERT','UPDATE','DELETE'));`).out;
  ok('P3 el resto de las políticas no cambió (md5)', post === pre, `${pre} → ${post}`);
  return res;
}

function prepararTemplate() {
  let r = psql('postgres', `drop database if exists ${RUN};\ndrop database if exists ${TPL};\ncreate database ${TPL};\n`);
  if (!r.ok) throw new Error(r.err);
  r = psql(TPL, FIXTURE + '\n' + V1);
  if (!r.ok) throw new Error('fixture: ' + r.err);
  return psql(TPL, `select json_object_agg(proname, md5(pg_get_functiondef(oid))) from pg_proc where proname in ('aplicar_resultado','desoficializar_carrera');`).out;
}
async function corrida(textos) {
  let r = psql('postgres', `drop database if exists ${RUN};\ncreate database ${RUN} template ${TPL};\n`);
  if (!r.ok) throw new Error(r.err);
  const pre = psql(RUN, `select md5(string_agg(tablename||'|'||policyname||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), '#' order by tablename, policyname)) from pg_policies where not (tablename in ('resultados','resultado_posiciones') and cmd in ('INSERT','UPDATE','DELETE'));`).out;
  for (const [i, t] of textos.entries()) {
    r = psql(RUN, t);
    if (!r.ok) return { aplica: false, err: `${ORDEN[i]}: ${r.err}`, res: [] };
  }
  const md5 = json(psql(RUN, `select json_build_object(
    'funciones', (select json_object_agg(proname, md5(pg_get_functiondef(oid))) from pg_proc where proname in ('aplicar_resultado','desoficializar_carrera','fn_resultado_cerrado_guard')),
    'politicas', (select json_object_agg(policyname, md5(coalesce(qual,'') || '|' || coalesce(with_check,''))) from pg_policies where tablename in ('resultados','resultado_posiciones') and cmd in ('INSERT','UPDATE','DELETE')));`));
  return { aplica: true, md5, res: await casos(RUN, pre) };
}

const textos = ORDEN.map(MIG);
const MUT = [
  ['M1 trigger exime a service_role', 1, `  IF session_user::text <> 'authenticator'\n     OR coalesce(current_setting('sgh.correccion_resultado', true), '') = '1' THEN`, `  IF session_user::text <> 'authenticator' OR auth.role() = 'service_role'\n     OR coalesce(current_setting('sgh.correccion_resultado', true), '') = '1' THEN`],
  ['M2 sin trigger en resultado_posiciones', 1, `CREATE TRIGGER trg_resultado_cerrado BEFORE INSERT OR UPDATE OR DELETE ON public.resultado_posiciones\n  FOR EACH ROW EXECUTE FUNCTION public.fn_resultado_cerrado_guard();`, ``],
  ['M3 sin auditoría de posiciones', 1, `CREATE TRIGGER trg_audit_resultado_posiciones AFTER INSERT OR DELETE OR UPDATE ON public.resultado_posiciones\n  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_log();`, ``],
  ['M4 aplicar_resultado sin corte de reunión cerrada', 2, `  IF fn_reunion_liq_cerrada(v_reunion_id)\n     AND coalesce(current_setting('sgh.correccion_resultado', true), '') <> '1' THEN\n    RAISE EXCEPTION 'aplicar_resultado: la liquidación`, `  IF false THEN\n    RAISE EXCEPTION 'aplicar_resultado: la liquidación`],
  ['M5 aplicar_resultado deja oficial → provisional', 2, `  IF v_prev_estado = 'oficial' AND p_estado IS DISTINCT FROM 'oficial' THEN`, `  IF false THEN`],
  ['M6 oficial → oficial pisa quién y cuándo', 2, `      v_ofi_at := v_prev_at;           -- re-aplicar una oficial no cambia quién ni cuándo\n      v_ofi_por := v_prev_por;`, `      v_ofi_at := now();\n      v_ofi_por := (SELECT u.id FROM usuarios u WHERE u.auth_user_id = auth.uid() LIMIT 1);`],
  ['M7 desoficializar sin corte de reunión cerrada', 3, `  IF fn_reunion_liq_cerrada(v_reunion_id)\n     AND coalesce(current_setting('sgh.correccion_resultado', true), '') <> '1' THEN\n    RAISE EXCEPTION 'desoficializar_carrera:`, `  IF false THEN\n    RAISE EXCEPTION 'desoficializar_carrera:`],
  ['M8 trigger sin la excepción de migración', 1, `  IF session_user::text <> 'authenticator'\n     OR coalesce(`, `  IF false\n     OR coalesce(`],
  ['M9 trigger sin la marca de corrección', 1, `     OR coalesce(current_setting('sgh.correccion_resultado', true), '') = '1' THEN\n    RETURN COALESCE(NEW, OLD);\n  END IF;\n\n  IF TG_TABLE_NAME`, `     THEN\n    RETURN COALESCE(NEW, OLD);\n  END IF;\n\n  IF TG_TABLE_NAME`],
  ['M10 política de posiciones sin fn_is_staff', 1, `CREATE POLICY resultado_posiciones_insert ON public.resultado_posiciones AS PERMISSIVE FOR INSERT TO authenticated\n  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_inscripcion`, `CREATE POLICY resultado_posiciones_insert ON public.resultado_posiciones AS PERMISSIVE FOR INSERT TO authenticated\n  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( true) AND (fn_club_de_inscripcion`],
  ['M11 backfill toma la PRIMERA transición', 0, `   ORDER BY a.registro_id, a.created_at DESC\n)\nUPDATE resultados r\n   SET oficializado_at  = u.created_at,`, `   ORDER BY a.registro_id, a.created_at ASC\n)\nUPDATE resultados r\n   SET oficializado_at  = u.created_at,`],
];

const v1 = prepararTemplate();
console.log(`v1 en el template (tiene que ser la de prod 94d46dc0… / c3247d72…): ${v1}`);
const base = await corrida(textos);
if (!base.aplica) { console.error('NO APLICA: ' + base.err); process.exit(1); }
for (const x of base.res) console.log(`${x.s} ${x.t}${x.s === '❌' && x.n ? '  → ' + x.n : ''}`);
const fails = base.res.filter((x) => x.s === '❌').length;
console.log(`\n${base.res.length - fails}/${base.res.length} asserts OK`);
console.log(`md5 en el sandbox: ${JSON.stringify(base.md5)}`);
let vivos = 0;
if (MUTANTES) {
  console.log('\n── mutantes ──');
  for (const [nombre, idx, de, a] of MUT) {
    if (textos[idx].split(de).length !== 2) { console.log(`⚠️  ${nombre}: ancla no única/ausente — mutante roto`); vivos++; continue; }
    const t = [...textos]; t[idx] = t[idx].replace(de, a);
    const m = await corrida(t);
    const muertos = m.aplica ? [...new Set(m.res.filter((x) => x.s === '❌').map((x) => x.t.split(' ')[0]))] : ['(no aplica: ' + m.err.slice(0, 80) + ')'];
    const vive = m.aplica && muertos.length === 0;
    if (vive) vivos++;
    console.log(`${vive ? '❌ VIVE ' : '✅ muere'} ${nombre}${vive ? '' : '  ← ' + muertos.join(', ')}`);
  }
  console.log(`\nmutantes: ${MUT.length - vivos}/${MUT.length} muertos`);
}
psql('postgres', `drop database if exists ${RUN};\ndrop database if exists ${TPL};\n`);
process.exit(fails || vivos ? 1 : 0);
