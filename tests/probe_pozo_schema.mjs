/**
 * Probe — Pozo de ratificación, Fase 1 pieza 1: SCHEMA (migrations/pozo_fase1_cobro.sql).
 *
 * Corre DESPUÉS de aplicar la migración (antes falla en el primer assert, a propósito).
 * Verifica las dos capas de protección por separado (GOTCHA #86) y la separación de series:
 *   A) columnas nuevas + vista v_pozo_carrera sobre R9 (11 carreras, sin pozo, retención NULL)
 *   B) sesión STAFF (operador Dolores): SELECT pozo_cobros ok · INSERT/UPDATE/DELETE → 42501 (capa REVOKE, ruidosa)
 *      · rpc fn_siguiente_numero → 42501 (sin grant)
 *   C) sesión PORTAL (rol propietario): SELECT pozo_cobros → 0 filas sin error (capa policy)
 *      · v_pozo_carrera responde (security_invoker hereda la RLS de carreras: ve esperado/n_ratificados,
 *        NUNCA cobros — GOTCHA #98) · rpc fn_siguiente_numero → 42501
 *   D) series separadas, sobre Mi Club Hípico (no Dolores, para no quemar el C-0001 real):
 *      fn_siguiente_numero(mch,'recibo_cobro') → 1, 2; (mch,'recibo') no se mueve
 *   E) constraints + auditoría con service role sobre la sandbox 9999: monto 0 → 23514; devuelto sin sello → 23514;
 *      segundo cobro vivo → 23505; INSERT válido deja fila en auditoria (tabla=pozo_cobros, club Dolores)
 * ESCRIBE: 2 usuarios de prueba, 1 fila en club_secuencias (mch,'recibo_cobro'), 1 fila en pozo_cobros (9999);
 * teardown en el finally verificado por ESTADO. Deja las filas de auditoria (log append-only).
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_pozo_schema.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) throw new Error('Falta SUPABASE_SECRET_KEY (source .env antes de correr).');
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';   // Dolores
const MCH  = 'a6da7e40-1515-45dc-8933-4eef33ce937a';   // Mi Club Hípico (club de prueba)
const R9   = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9';
const RUN  = Date.now().toString(36);
const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
const creados = [];
const esPermiso = e => !!e && (e.code === '42501' || /permission denied/i.test(e.message || ''));

async function sesion(rol) {
  const email = `probe.pozo.${rol}.${RUN}@sgh.test`;
  const { data: au, error: eAu } = await sb.auth.admin.createUser({ email, password: `Px-${RUN}-${Math.random().toString(36).slice(2)}`, email_confirm: true });
  if (eAu) throw new Error('createUser: ' + eAu.message);
  creados.push({ email, authId: au.user.id });
  const { error: eIns } = await sb.from('usuarios').insert({ email, nombre_completo: `Probe pozo ${rol} ${RUN}`, club_id: CLUB, rol, activo: true, estado: 'activo', password_hash: '', auth_user_id: au.user.id });
  if (eIns) throw new Error('insert usuarios: ' + eIns.message);
  const { data: link, error: eLink } = await sb.auth.admin.generateLink({ type: 'magiclink', email });
  if (eLink) throw new Error('generateLink: ' + eLink.message);
  const cli = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eOtp } = await cli.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (eOtp) throw new Error('verifyOtp: ' + eOtp.message);
  return cli;
}

let cobroId = null;
let secAntes = null;

try {
  // ── A) schema + vista ──
  let r = await sb.from('carreras').select('id,pozo_monto_caballo').limit(1);
  ok('A1 carreras.pozo_monto_caballo existe', !r.error, r.error?.message);
  r = await sb.from('reuniones').select('id,pozo_retencion_pct').limit(1);
  ok('A2 reuniones.pozo_retencion_pct existe', !r.error, r.error?.message);
  r = await sb.from('v_pozo_carrera').select('*').eq('reunion_id', R9).order('numero_turno');
  const v = r.data || [];
  ok('A3 v_pozo_carrera R9 → 11 carreras', !r.error && v.length === 11, r.error?.message || `${v.length} filas`);
  ok('A4 R9 sin pozo: tiene_pozo=false, esperado=0, cobrado_bruto=0 en todas', v.length && v.every(x => x.tiene_pozo === false && Number(x.esperado) === 0 && Number(x.cobrado_bruto) === 0), JSON.stringify(v.map(x => [x.numero_turno, x.tiene_pozo, x.esperado])));
  ok('A5 R9 pct NULL → retencion y al_ganador NULL (no 0)', v.length && v.every(x => x.retencion === null && x.al_ganador === null), JSON.stringify(v.map(x => [x.retencion, x.al_ganador])));
  const t3 = v.find(x => x.numero_turno === 3);
  ok('A6 n_ratificados de T3 = 13 (foto 19/09)', t3 && Number(t3.n_ratificados) === 13, `n_ratificados=${t3?.n_ratificados}`);

  // ── B) staff ──
  const staff = await sesion('operador');
  r = await staff.from('pozo_cobros').select('id').limit(1);
  ok('B1 staff SELECT pozo_cobros sin error', !r.error, r.error?.message);
  r = await staff.from('pozo_cobros').insert({ club_id: CLUB, reunion_id: R9, carrera_id: t3?.carrera_id, inscripcion_id: '00000000-0000-0000-0000-000000000000', numero_recibo: 999999, monto: 1, forma_pago: 'efectivo' });
  ok('B2 staff INSERT directo → 42501 (capa REVOKE, ruidosa)', esPermiso(r.error), r.error ? `${r.error.code} ${r.error.message}` : '¡INSERTÓ!');
  r = await staff.from('pozo_cobros').update({ notas: 'x' }).eq('id', '00000000-0000-0000-0000-000000000000');
  ok('B3 staff UPDATE directo → 42501', esPermiso(r.error), r.error ? `${r.error.code}` : 'sin error (silencioso = MAL)');
  r = await staff.from('pozo_cobros').delete().eq('id', '00000000-0000-0000-0000-000000000000');
  ok('B4 staff DELETE directo → 42501', esPermiso(r.error), r.error ? `${r.error.code}` : 'sin error (silencioso = MAL)');
  r = await staff.rpc('fn_siguiente_numero', { p_club_id: CLUB, p_tipo: 'probe' });
  ok('B5 staff rpc fn_siguiente_numero → 42501 (sin grant a authenticated)', esPermiso(r.error), r.error ? `${r.error.code} ${r.error.message}` : `¡RESPONDIÓ ${r.data}!`);
  r = await staff.from('v_pozo_carrera').select('carrera_id').eq('reunion_id', R9);
  ok('B6 staff SELECT v_pozo_carrera → 11', !r.error && r.data.length === 11, r.error?.message || `${r.data?.length}`);

  // ── C) portal ──
  const portal = await sesion('propietario');
  r = await portal.from('pozo_cobros').select('id');
  ok('C1 portal SELECT pozo_cobros → 0 filas sin error (capa policy)', !r.error && r.data.length === 0, r.error?.message || `${r.data?.length} filas`);
  r = await portal.from('v_pozo_carrera').select('carrera_id,n_ratificados,n_cobrados,cobrado_bruto').eq('reunion_id', R9);
  ok('C2 portal SELECT v_pozo_carrera responde sin error (security_invoker: hereda RLS de carreras — GOTCHA #98)', !r.error, r.error?.message || `${r.data?.length} filas visibles`);
  ok('C3 portal: n_cobrados=0 y cobrado_bruto=0 en todo lo que ve (nunca ve cobros)', !r.error && (r.data || []).every(x => Number(x.n_cobrados) === 0 && Number(x.cobrado_bruto) === 0), `${r.data?.length} filas`);
  r = await portal.rpc('fn_siguiente_numero', { p_club_id: CLUB, p_tipo: 'probe' });
  ok('C4 portal rpc fn_siguiente_numero → 42501', esPermiso(r.error), r.error ? `${r.error.code}` : `¡RESPONDIÓ ${r.data}!`);

  // ── D) series separadas (MCH) ──
  r = await sb.from('club_secuencias').select('tipo,ultimo_numero').eq('club_id', MCH);
  secAntes = Object.fromEntries((r.data || []).map(x => [x.tipo, x.ultimo_numero]));
  ok('D0 MCH sin serie recibo_cobro antes', secAntes.recibo_cobro === undefined, JSON.stringify(secAntes));
  const n1 = await sb.rpc('fn_siguiente_numero', { p_club_id: MCH, p_tipo: 'recibo_cobro' });
  const n2 = await sb.rpc('fn_siguiente_numero', { p_club_id: MCH, p_tipo: 'recibo_cobro' });
  ok('D1 fn_siguiente_numero(mch, recibo_cobro) → 1, 2', !n1.error && !n2.error && n1.data === 1 && n2.data === 2, `${n1.error?.message || n1.data}, ${n2.error?.message || n2.data}`);
  r = await sb.from('club_secuencias').select('tipo,ultimo_numero').eq('club_id', MCH);
  const secDesp = Object.fromEntries((r.data || []).map(x => [x.tipo, x.ultimo_numero]));
  ok('D2 la serie recibo de MCH NO se movió', secDesp.recibo === secAntes.recibo, `recibo antes=${secAntes.recibo} después=${secDesp.recibo}`);
  ok('D3 serie recibo_cobro de MCH = 2', secDesp.recibo_cobro === 2, `recibo_cobro=${secDesp.recibo_cobro}`);

  // ── E) constraints + auditoría (service role, sandbox 9999) ──
  const { data: r9999 } = await sb.from('reuniones').select('id').eq('club_id', CLUB).eq('numero', 9999).maybeSingle();
  const { data: insc } = r9999 ? await sb.from('inscripciones').select('id,carrera_id').in('carrera_id', (await sb.from('carreras').select('id').eq('reunion_id', r9999.id)).data.map(c => c.id)).eq('estado', 'ratificado').limit(1).maybeSingle() : { data: null };
  ok('E0 sandbox 9999 con un ratificado', !!insc, JSON.stringify(insc));
  if (insc) {
    const base = { club_id: CLUB, reunion_id: r9999.id, carrera_id: insc.carrera_id, inscripcion_id: insc.id, forma_pago: 'efectivo', pagador_nombre: `PROBE ${RUN}` };
    r = await sb.from('pozo_cobros').insert({ ...base, numero_recibo: 900001, monto: 0 });
    ok('E1 monto 0 → 23514 (chk_pozo_cobro_monto)', r.error?.code === '23514', r.error ? `${r.error.code} ${r.error.message}` : '¡INSERTÓ!');
    r = await sb.from('pozo_cobros').insert({ ...base, numero_recibo: 900002, monto: 100, estado: 'devuelto' });
    ok('E2 devuelto sin devuelto_at/motivo → 23514 (chk_pozo_cobro_estado)', r.error?.code === '23514', r.error ? `${r.error.code}` : '¡INSERTÓ!');
    r = await sb.from('pozo_cobros').insert({ ...base, numero_recibo: 900003, monto: 100 }).select().single();
    cobroId = r.data?.id || null;
    ok('E3 INSERT válido (service role) → fila cobrado', !r.error && r.data?.estado === 'cobrado' && Number(r.data.monto) === 100, r.error?.message);
    r = await sb.from('pozo_cobros').insert({ ...base, numero_recibo: 900004, monto: 100 });
    ok('E4 segundo cobro VIVO para la misma inscripción → 23505 (uq_pozo_cobro_vivo)', r.error?.code === '23505', r.error ? `${r.error.code}` : '¡INSERTÓ!');
    r = await sb.from('v_pozo_carrera').select('n_cobrados,cobrado_bruto').eq('carrera_id', insc.carrera_id).single();
    ok('E5 la vista lo cuenta: n_cobrados=1, cobrado_bruto=100', !r.error && Number(r.data.n_cobrados) === 1 && Number(r.data.cobrado_bruto) === 100, r.error?.message || JSON.stringify(r.data));
    r = await sb.from('auditoria').select('accion,club_id').eq('tabla', 'pozo_cobros').eq('registro_id', cobroId);
    ok('E6 auditoria: INSERT registrado con club Dolores', !r.error && r.data.some(a => a.accion === 'INSERT' && a.club_id === CLUB), r.error?.message || JSON.stringify(r.data));
  }
} finally {
  // teardown por ESTADO
  if (cobroId) await sb.from('pozo_cobros').delete().eq('id', cobroId);
  const { data: rest } = await sb.from('pozo_cobros').select('id').like('pagador_nombre', `PROBE ${RUN}%`);
  ok('T1 teardown: 0 filas de prueba en pozo_cobros', (rest || []).length === 0, `${rest?.length}`);
  await sb.from('club_secuencias').delete().eq('club_id', MCH).eq('tipo', 'recibo_cobro');
  const { data: secFin } = await sb.from('club_secuencias').select('tipo,ultimo_numero').eq('club_id', MCH);
  const fin = Object.fromEntries((secFin || []).map(x => [x.tipo, x.ultimo_numero]));
  ok('T2 teardown: club_secuencias de MCH igual que antes', JSON.stringify(fin) === JSON.stringify(secAntes || {}), `antes=${JSON.stringify(secAntes)} después=${JSON.stringify(fin)}`);
  for (const c of creados) {
    await sb.from('usuarios').delete().eq('email', c.email);
    await sb.auth.admin.deleteUser(c.authId);
  }
  const { data: us } = await sb.from('usuarios').select('email').like('email', `probe.pozo.%.${RUN}@sgh.test`);
  ok('T3 teardown: 0 usuarios de prueba en `usuarios`', (us || []).length === 0, JSON.stringify(us));
  const { data: au } = await sb.auth.admin.listUsers({ perPage: 200 });
  const huerf = (au?.users || []).filter(u => u.email?.includes('probe.pozo.') && u.email?.includes(RUN));
  ok('T4 teardown: 0 usuarios de prueba en auth', huerf.length === 0, huerf.map(u => u.email).join(','));
  const { count } = await sb.from('spcs').select('id', { count: 'exact', head: true });
  ok('T5 guard spcs = 210', count === 210, `count=${count}`);
}
for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  → ' + r.n : ''}`);
const fails = results.filter(r => r.s === '❌').length;
console.log(`\n${results.length - fails}/${results.length} asserts OK`);
process.exit(fails ? 1 : 0);
