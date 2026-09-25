/**
 * probe_sanciones_alta.mjs — alta y edición de sanciones (sanciones.html + políticas RLS).
 *
 * Lo que prueba (datos SINTÉTICOS: una sanción sobre un SPC de la reunión 9999, fechas en 2099 para que
 * nunca sea "vigente", marca en `notas`, y usuarios temporales por rol que se borran al final):
 *   A1 operador de Dolores (como Yesi): alta con el saveRecord REAL de sanciones.html → OK, con club_id =
 *      Dolores, creado_por = su usuarios.id y alcance 'club', mandados EXPLÍCITOS en el payload.
 *   A2 el mismo operador edita esa sanción (saveRecord con id) → OK; club_id y creado_por no cambian.
 *   B1 usuario de PORTAL (profesional) con club Dolores: INSERT directo → rechazado (42501).
 *   B2 el mismo portal: UPDATE de una sanción SOBRE SÍ MISMO (que sí ve) → no la cambia.
 *   C1 operador de OTRO club: INSERT con club_id Dolores → rechazado (42501).
 *   C2 operador de otro club: UPDATE de una sanción compartida de Dolores (que sí ve) → no la cambia.
 *   D1 super_admin: INSERT con club_id Dolores → OK.
 *
 * Mutantes (--mutantes), uno por regla:
 *   M1 el alta sin club_id · M2 sin creado_por · M3 sin alcance explícito        (texto de sanciones.html)
 *   M4 INSERT sin fn_is_staff · M5 UPDATE sin fn_is_staff                          (SQL, sólo sandbox)
 *   M6 INSERT sin el chequeo de club · M7 UPDATE sin el chequeo de club            (SQL, sólo sandbox)
 *
 * Dónde corre:
 *   Sandbox (default): tests/local/up.sh; tests/local/up.sh sql < tests/local/sanciones_sandbox.sql;
 *     tests/local/up.sh sql < migrations/sanciones_insert_update_staff.sql
 *     SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=$(cat tests/local/out/jwt) \
 *     LOCAL_JWT_SECRET=$(cat tests/local/out/jwt_secret) PSQL_CMD="tests/local/up.sh sql" node tests/probe_sanciones_alta.mjs --mutantes
 *   Prod (sólo DESPUÉS de aplicar la migración): node tests/probe_sanciones_alta.mjs --prod
 *     ESCRIBE en prod: usuarios de auth + filas de `usuarios` temporales y sanciones de prueba; borra todo en
 *     el finally y lo verifica. Los mutantes de SQL no corren en prod.
 * Env: SANCIONES_HTML (ruta; default el del repo).
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const ROOT = new URL('..', import.meta.url).pathname;
const PROD_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const BASE_URL = process.env.SUPABASE_URL || PROD_URL;
const EN_PROD = BASE_URL.includes('unlhcuanfrtpatoipwve');
const KEY = process.env.SUPABASE_SECRET_KEY;
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const JWT_SECRET = process.env.LOCAL_JWT_SECRET;
const PSQL = process.env.PSQL_CMD;
const MUTANTES = process.argv.includes('--mutantes');
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY'); process.exit(2); }
if (EN_PROD && !process.argv.includes('--prod')) { console.error('SUPABASE_URL es prod: el probe escribe; pasá --prod (sólo después de aplicar la migración)'); process.exit(2); }
if (!EN_PROD && !JWT_SECRET) { console.error('Sandbox: falta LOCAL_JWT_SECRET'); process.exit(2); }

const DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c', OTRO = 'a6da7e40-1515-45dc-8933-4eef33ce937a';
const R9999 = 'a0000000-0000-0000-0000-000000009999';
const RUN = `PROBE-SANCIONES-${Date.now()}`;
const admin = createClient(BASE_URL, KEY, { auth: { persistSession: false } });
const HTML_SRC = readFileSync(process.env.SANCIONES_HTML || ROOT + 'sanciones.html', 'utf8');

function extractFn(src, firma) {
  const i = src.indexOf(firma); if (i < 0) throw new Error('no encontré: ' + firma);
  let d = 0; for (let k = src.indexOf('{', i + firma.length); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  throw new Error('no pude cerrar: ' + firma);
}
const jwt = (sub) => { const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b({ alg: 'HS256', typ: 'JWT' }), p = b({ role: 'authenticated', sub, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`; };

// ── Usuarios temporales ─────────────────────────────────────────────────────────────────────
const creados = [];   // { usuarioId, authId }
async function sesion(rol, club, extra = {}) {
  const email = `${RUN.toLowerCase()}-${rol}-${club.slice(0, 4)}@example.invalid`;
  let authId, cli;
  if (EN_PROD) {
    const { data: au, error } = await admin.auth.admin.createUser({ email, password: 'Px-' + randomUUID(), email_confirm: true });
    if (error) throw error; authId = au.user.id;
  } else authId = randomUUID();
  const { data: u, error: eU } = await admin.from('usuarios').insert({ email, password_hash: '', nombre_completo: `${RUN} ${rol}`, rol, club_id: club, activo: true, auth_user_id: authId, ...extra }).select('id').single();
  if (eU) throw eU;
  creados.push({ usuarioId: u.id, authId });
  if (EN_PROD) {
    const { data: link, error: eL } = await admin.auth.admin.generateLink({ type: 'magiclink', email }); if (eL) throw eL;
    cli = createClient(BASE_URL, PUB, { auth: { persistSession: false } });
    const { error: eV } = await cli.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' }); if (eV) throw eV;
  } else cli = createClient(BASE_URL, KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt(authId)}` } } });
  return { cli, usuarioId: u.id, authId, ...extra };
}

// ── saveRecord REAL de sanciones.html con DOM stub ───────────────────────────────────────────
async function saveRecordReal(src, { cli, campos, CLUB_ID, currentUser }) {
  const cuerpo = extractFn(src, 'async function saveRecord()');
  const els = {}; const el = id => (els[id] ??= { value: campos[id] ?? '', textContent: '', disabled: false });
  const toasts = [], enviados = [];
  const sbEspia = { from: t => { const q = cli.from(t);
    return new Proxy(q, { get: (o, m) => (m === 'insert' || m === 'update') ? (p => { enviados.push({ op: m, payload: p }); return o[m](p); }) : (typeof o[m] === 'function' ? o[m].bind(o) : o[m]) }); } };
  const fn = new (Object.getPrototypeOf(async function () {}).constructor)('sb', 'document', 'toast', 'closeModal', 'load', 'CLUB_ID', 'currentUser',
    cuerpo + '\nreturn saveRecord();');
  await fn(sbEspia, { getElementById: el }, (m, t) => toasts.push({ m, t }), () => {}, () => {}, CLUB_ID, currentUser);
  return { toasts, enviados };
}

async function correr(htmlSrc) {
  const res = []; const ok = (t, c, n = '') => { res.push({ t, c: !!c, n }); return c; };
  const { data: cars } = await admin.from('carreras').select('id').eq('reunion_id', R9999);
  const { data: ins } = await admin.from('inscripciones').select('spc_id').in('carrera_id', (cars || []).map(c => c.id)).limit(1);
  const spc = ins?.[0]?.spc_id; if (!spc) throw new Error('no hay SPC en la 9999');
  const base = { entidad_tipo: 'spc', entidad_id: spc, tipo_sancion: 'Suspensión (prueba)', motivo: 'probe', fecha_inicio: '2099-01-01', fecha_fin: '2099-01-02', estado: 'activa', notas: RUN };
  const campos = { 'f-id': '', 'f-categoria-tipo': 'spc', 'f-entidad-id': spc, 'f-tipo-sancion': 'Suspensión (prueba)', 'f-motivo': 'probe A1',
    'f-fecha-inicio': '2099-01-01', 'f-fecha-fin': '2099-01-02', 'f-estado-s': 'activa', 'f-notas': RUN, 'btn-save': '' };
  const leer = async id => (await admin.from('sanciones').select('*').eq('id', id).single()).data;

  const ope = await sesion('operador', DOLORES), portal = await sesion('profesional', DOLORES, { entidad_tipo: 'profesional', entidad_id: randomUUID() }),
        otro = await sesion('operador', OTRO), sa = await sesion('super_admin', DOLORES);

  // A1 alta por la pantalla
  const a1 = await saveRecordReal(htmlSrc, { cli: ope.cli, campos, CLUB_ID: DOLORES, currentUser: { usuario_id: ope.usuarioId } });
  const { data: filasA1 } = await admin.from('sanciones').select('*').eq('notas', RUN).eq('motivo', 'probe A1');
  const s1 = filasA1?.[0], env = a1.enviados.find(e => e.op === 'insert')?.payload || {};
  ok('A1a) operador (como Yesi): el alta por saveRecord no da error y crea la fila', !a1.toasts.some(t => t.t === 'error') && filasA1?.length === 1, JSON.stringify(a1.toasts));
  ok('A1b) club_id = Dolores', s1?.club_id === DOLORES, s1?.club_id);
  ok('A1c) creado_por = usuarios.id del operador', s1?.creado_por === ope.usuarioId, `${s1?.creado_por} vs ${ope.usuarioId}`);
  ok('A1d) alcance = \'club\' y mandado EXPLÍCITO en el payload (no por default)', s1?.alcance === 'club' && env.alcance === 'club', JSON.stringify(env));
  // A2 edición por la pantalla
  if (s1) {
    const a2 = await saveRecordReal(htmlSrc, { cli: ope.cli, campos: { ...campos, 'f-id': s1.id, 'f-motivo': 'probe A2 editado' }, CLUB_ID: DOLORES, currentUser: { usuario_id: ope.usuarioId } });
    const s1b = await leer(s1.id);
    ok('A2) edición por saveRecord: OK, cambia el motivo; club_id y creado_por no se tocan',
      !a2.toasts.some(t => t.t === 'error') && s1b.motivo === 'probe A2 editado' && s1b.club_id === DOLORES && s1b.creado_por === ope.usuarioId, JSON.stringify({ toasts: a2.toasts, motivo: s1b.motivo }));
  }
  // B portal
  const b1 = await portal.cli.from('sanciones').insert({ ...base, club_id: DOLORES });
  ok('B1) portal (profesional) con club Dolores: INSERT → rechazado 42501', b1.error?.code === '42501', JSON.stringify(b1.error));
  // B2: una sanción SOBRE EL PROPIO profesional del portal (la política de SELECT se la deja ver, así que la
  // de UPDATE es la única que decide). Hoy en prod la puede editar: se levantaría su propia sanción.
  const { data: propia, error: eP } = await admin.from('sanciones').insert({ ...base, entidad_tipo: 'profesional', entidad_id: portal.entidad_id, club_id: DOLORES, motivo: 'probe B2' }).select('id').single();
  if (eP) throw eP;
  const { data: laVe } = await portal.cli.from('sanciones').select('id').eq('id', propia.id);
  ok('B2a) (control) el portal VE la sanción sobre sí mismo (si no, B2b no probaría nada)', laVe?.length === 1);
  await portal.cli.from('sanciones').update({ motivo: 'HACKEADO portal', estado: 'revocada' }).eq('id', propia.id);
  const b2 = await leer(propia.id);
  ok('B2b) portal: UPDATE de una sanción sobre sí mismo → no la cambia', b2.motivo === 'probe B2' && b2.estado === 'activa', JSON.stringify({ motivo: b2.motivo, estado: b2.estado }));
  // C otro club
  const c1 = await otro.cli.from('sanciones').insert({ ...base, club_id: DOLORES });
  ok('C1) operador de otro club: INSERT con club_id Dolores → rechazado 42501', c1.error?.code === '42501', JSON.stringify(c1.error));
  // C2: una sanción de Dolores con alcance ≠ 'club' (compartida): el staff de otro club la VE por SELECT, así
  // que la de UPDATE es la única que decide.
  const { data: comp, error: eC } = await admin.from('sanciones').insert({ ...base, club_id: DOLORES, alcance: 'todos', motivo: 'probe C2' }).select('id').single();
  if (eC) throw eC;
  const { data: laVeOtro } = await otro.cli.from('sanciones').select('id').eq('id', comp.id);
  ok('C2a) (control) el operador de otro club VE la sanción compartida de Dolores', laVeOtro?.length === 1);
  await otro.cli.from('sanciones').update({ motivo: 'HACKEADO otro club' }).eq('id', comp.id);
  ok('C2b) operador de otro club: UPDATE de una sanción de Dolores → no la cambia', (await leer(comp.id)).motivo === 'probe C2');
  // D super_admin
  const d1 = await sa.cli.from('sanciones').insert({ ...base, club_id: DOLORES, motivo: 'probe D1', creado_por: sa.usuarioId });
  const { data: filasD1 } = await admin.from('sanciones').select('id').eq('notas', RUN).eq('motivo', 'probe D1');
  ok('D1) super_admin: INSERT con club_id Dolores → OK', !d1.error && filasD1?.length === 1, JSON.stringify(d1.error));
  return res;
}

async function limpiar() {
  const errores = [];
  const { error: e1 } = await admin.from('sanciones').delete().eq('notas', RUN); if (e1) errores.push('sanciones: ' + e1.message);
  for (const c of creados) {
    const { error } = await admin.from('usuarios').delete().eq('id', c.usuarioId); if (error) errores.push('usuarios: ' + error.message);
    if (EN_PROD) { const { error: eA } = await admin.auth.admin.deleteUser(c.authId); if (eA) errores.push('auth: ' + eA.message); }
  }
  creados.length = 0;
  const { count: quedanS } = await admin.from('sanciones').select('id', { count: 'exact', head: true }).eq('notas', RUN);
  const { count: quedanU } = await admin.from('usuarios').select('id', { count: 'exact', head: true }).like('nombre_completo', `${RUN}%`);
  return { errores, quedanS, quedanU };
}

async function tanda(htmlSrc) {
  let res;
  try { res = await correr(htmlSrc); }
  catch (e) { res = [{ t: `excepción) ${e.message}`, c: false }]; }
  finally { const l = await limpiar(); res.push({ t: `Z) limpieza: 0 sanciones y 0 usuarios de prueba quedaron${l.errores.length ? ' · errores: ' + l.errores.join('; ') : ''}`, c: !l.errores.length && l.quedanS === 0 && l.quedanU === 0, n: JSON.stringify(l) }); }
  return res;
}

const res = await tanda(HTML_SRC);
for (const r of res) console.log(`${r.c ? '✅' : '❌'} ${r.t}${!r.c && r.n ? `\n   → ${r.n}` : ''}`);
const malos = res.filter(r => !r.c);
console.log(`\n${res.length - malos.length}/${res.length} checks OK · ${EN_PROD ? 'PROD' : 'sandbox'}`);

if (MUTANTES) {
  console.log('\n── Mutantes ──');
  const ANCLA = s => { const a = s.indexOf('// ═══ ALTA SANCION — INICIO'), b = s.indexOf('// ═══ ALTA SANCION — FIN'); if (a < 0 || b < a) throw new Error('anclas ALTA SANCION'); return [a, b]; };
  const mutHtml = (de, a) => { const [i, j] = ANCLA(HTML_SRC); const blk = HTML_SRC.slice(i, j); if (!blk.includes(de)) throw new Error('mutante no aplica: ' + de); return HTML_SRC.slice(0, i) + blk.replace(de, a) + HTML_SRC.slice(j); };
  const pol = (insertCheck, updateUsing) => `BEGIN;
DROP POLICY IF EXISTS sanciones_insert ON public.sanciones;
CREATE POLICY sanciones_insert ON public.sanciones FOR INSERT TO authenticated WITH CHECK (${insertCheck});
DROP POLICY IF EXISTS sanciones_update ON public.sanciones;
CREATE POLICY sanciones_update ON public.sanciones FOR UPDATE TO authenticated USING (${updateUsing}) WITH CHECK (${updateUsing});
COMMIT; NOTIFY pgrst, 'reload schema';`;
  const BUENA = `(SELECT fn_is_super_admin()) OR ((SELECT fn_is_staff()) AND club_id = (SELECT fn_get_user_club_id()))`;
  const SIN_STAFF = `(SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id()))`;
  const SIN_CLUB = `(SELECT fn_is_super_admin()) OR (SELECT fn_is_staff())`;
  const MUT = [
    ['M1', 'el alta sin club_id', { html: mutHtml(' club_id: CLUB_ID,', '') }],
    ['M2', 'el alta sin creado_por', { html: mutHtml(' creado_por: currentUser?.usuario_id || null,', '') }],
    ['M3', 'el alta sin alcance explícito', { html: mutHtml(", alcance: 'club'", '') }],
    ['M4', 'INSERT sin fn_is_staff', { sql: pol(SIN_STAFF, BUENA) }],
    ['M5', 'UPDATE sin fn_is_staff', { sql: pol(BUENA, SIN_STAFF) }],
    ['M6', 'INSERT sin el chequeo de club', { sql: pol(SIN_CLUB, BUENA) }],
    ['M7', 'UPDATE sin el chequeo de club', { sql: pol(BUENA, SIN_CLUB) }],
  ];
  let muertos = 0, corridos = 0;
  for (const [id, desc, m] of MUT) {
    if (m.sql && (EN_PROD || !PSQL)) { console.log(`⏸ ${id} no corre (${EN_PROD ? 'en prod' : 'sin PSQL_CMD'}) — ${desc}`); continue; }
    corridos++;
    let r;
    if (m.sql) {
      execSync(PSQL, { input: m.sql, encoding: 'utf8' }); await new Promise(z => setTimeout(z, 1500));
      try { r = await tanda(HTML_SRC); }
      finally { execSync(PSQL, { input: readFileSync(ROOT + 'migrations/sanciones_insert_update_staff.sql', 'utf8') + "\nNOTIFY pgrst, 'reload schema';", encoding: 'utf8' }); await new Promise(z => setTimeout(z, 1500)); }
    } else r = await tanda(m.html);
    const murio = r.some(x => !x.c && !x.t.startsWith('Z)'));
    muertos += murio;
    console.log(`${murio ? '💀' : '🧟'} ${id} ${murio ? 'muerto' : 'VIVO'} — ${desc}${murio ? ` (${r.filter(x => !x.c).map(x => x.t.split(')')[0]).join(', ')})` : ''}`);
  }
  console.log(`\n${muertos}/${corridos} mutantes muertos`);
  if (muertos !== corridos) process.exitCode = 1;
}
if (malos.length) process.exitCode = 1;
