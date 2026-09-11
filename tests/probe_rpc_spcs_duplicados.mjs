/**
 * Probe — rpc_spcs_duplicados: los 3 chequeos de duplicado de SPC en la base (plan studbook-buscar, pieza A).
 *
 * Crea un usuario de prueba (operador, Dolores) con sesión real por magiclink — igual que
 * probe_aislamiento_club_cobros.mjs — y llama la RPC como lo va a hacer spcs.html. Casos:
 *   1) studbook_id de LOGUACIOUS (431567)                       → 1 fila, motivo 'studbook_id'
 *   2) nombre 'loguácious' (minúscula + acento inventado)      → 1 fila, motivo 'nombre'
 *   3) fecha + padres de CONESERA con otro nombre               → 1 fila, motivo 'fecha_padre_madre'
 *   4) las tres a la vez (LOGUARCIUS + sb + fecha/padres)      → 2 filas (sb + fecha/padres), no 'nombre'
 *   5) caballo inexistente                                       → 0 filas
 *   6) sin nada útil (todo NULL / vacío)                         → 0 filas (no barre la tabla)
 *   7) un usuario de portal (rol profesional) → la RPC RAISE 42501
 *   8) con el service role sin JWT de usuario → RAISE (fn_is_staff() con auth.uid() NULL)
 * ESCRIBE: 2 usuarios de prueba en auth + usuarios; teardown en el finally y verificado por estado.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_rpc_spcs_duplicados.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) throw new Error('Falta SUPABASE_SECRET_KEY (source .env antes de correr).');
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const RUN = Date.now().toString(36);
const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
const creados = [];

async function sesion(rol) {
  const email = `probe.dup.${rol}.${RUN}@sgh.test`;
  const { data: au, error: eAu } = await sb.auth.admin.createUser({ email, password: `Px-${RUN}-${Math.random().toString(36).slice(2)}`, email_confirm: true });
  if (eAu) throw new Error('createUser: ' + eAu.message);
  creados.push({ email, authId: au.user.id });
  const { error: eIns } = await sb.from('usuarios').insert({ email, nombre_completo: `Probe dup ${rol} ${RUN}`, club_id: CLUB, rol, activo: true, estado: 'activo', password_hash: '', auth_user_id: au.user.id });
  if (eIns) throw new Error('insert usuarios: ' + eIns.message);
  const { data: link, error: eLink } = await sb.auth.admin.generateLink({ type: 'magiclink', email });
  if (eLink) throw new Error('generateLink: ' + eLink.message);
  const cli = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eOtp } = await cli.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (eOtp) throw new Error('verifyOtp: ' + eOtp.message);
  return cli;
}
const rpc = (cli, args) => cli.rpc('rpc_spcs_duplicados', { p_studbook_id: null, p_nombre: null, p_fecha_nacimiento: null, p_padrillo: null, p_madre: null, ...args });

try {
  const staff = await sesion('operador');

  let r = await rpc(staff, { p_studbook_id: '431567' });
  ok('1) por studbook_id 431567 → LOGUACIOUS', !r.error && r.data.length === 1 && r.data[0].motivo === 'studbook_id' && r.data[0].nombre === 'LOGUACIOUS', r.error?.message || JSON.stringify(r.data));

  r = await rpc(staff, { p_nombre: 'loguácious' });
  ok('2) por nombre normalizado (minúscula + acento) → LOGUACIOUS', !r.error && r.data.length === 1 && r.data[0].motivo === 'nombre', r.error?.message || JSON.stringify(r.data));

  r = await rpc(staff, { p_nombre: 'OTRO NOMBRE CUALQUIERA', p_fecha_nacimiento: '2023-09-20', p_padrillo: 'emmanuel', p_madre: 'Milonga Burrera' });
  ok('3) por fecha + padres → CONESERA aunque el nombre sea otro', !r.error && r.data.length === 1 && r.data[0].motivo === 'fecha_padre_madre' && r.data[0].nombre === 'CONESERA', r.error?.message || JSON.stringify(r.data));

  r = await rpc(staff, { p_studbook_id: '431567', p_nombre: 'LOGUARCIUS', p_fecha_nacimiento: '2021-10-23', p_padrillo: 'Le Blues', p_madre: 'Effervesence' });
  const motivos = (r.data || []).map(x => x.motivo).sort();
  ok('4) LOGUARCIUS (typo) + sb + fecha/padres → 2 motivos: fecha_padre_madre + studbook_id, sin "nombre"', !r.error && JSON.stringify(motivos) === JSON.stringify(['fecha_padre_madre', 'studbook_id']), r.error?.message || JSON.stringify(motivos));

  r = await rpc(staff, { p_studbook_id: '999999999', p_nombre: 'ZZZZ CABALLO INEXISTENTE', p_fecha_nacimiento: '1900-01-01', p_padrillo: 'X', p_madre: 'Y' });
  ok('5) inexistente → 0 filas', !r.error && r.data.length === 0, r.error?.message || JSON.stringify(r.data));

  r = await rpc(staff, { p_nombre: '   ', p_padrillo: '', p_madre: '' });
  ok('6) todo vacío → 0 filas (no barre la tabla)', !r.error && r.data.length === 0, r.error?.message || `${r.data?.length} filas`);

  const portal = await sesion('profesional');
  r = await rpc(portal, { p_studbook_id: '431567' });
  ok('7) usuario de portal → rechazado (42501)', !!r.error && /solo staff|42501|permission/i.test(r.error.message + r.error.code), r.error?.message || '¡RESPONDIÓ!');

  r = await rpc(sb, { p_studbook_id: '431567' });
  ok('8) service role sin usuario → rechazado (auth.uid() NULL)', !!r.error, r.error?.message || '¡RESPONDIÓ!');
} finally {
  for (const c of creados) {
    await sb.from('usuarios').delete().eq('email', c.email);
    await sb.auth.admin.deleteUser(c.authId);
  }
  const { data: rest } = await sb.from('usuarios').select('email').like('email', `probe.dup.%.${RUN}@sgh.test`);
  ok('T) teardown: 0 usuarios de prueba en `usuarios`', (rest || []).length === 0, JSON.stringify(rest));
  const { data: au } = await sb.auth.admin.listUsers({ perPage: 200 });
  const huerf = (au?.users || []).filter(u => u.email?.includes(`probe.dup.`) && u.email?.includes(RUN));
  ok('T) teardown: 0 usuarios de prueba en auth', huerf.length === 0, huerf.map(u => u.email).join(','));
}
for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  → ' + r.n : ''}`);
const fails = results.filter(r => r.s === '❌').length;
console.log(`\n${results.length - fails}/${results.length} asserts OK`);
process.exit(fails ? 1 : 0);
