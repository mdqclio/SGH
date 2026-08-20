#!/usr/bin/env node
/**
 * probe_autoregistro_e2e.mjs — flujo completo del auto-registro (Gate 3).
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_autoregistro_e2e.mjs
 *
 * ---------------------------------------------------------------------------
 * QUÉ CUBRE Y QUÉ NO
 * ---------------------------------------------------------------------------
 * Cubre el flujo de DATOS extremo a extremo: solicitud → visible en la bandeja
 * con el matcheo por DNI → aprobación contra una ficha → la cuenta ve lo suyo
 * y sólo lo suyo → teardown.
 *
 * NO cubre el `signUp` del navegador, y es a propósito: con Attack Protection
 * activo, GoTrue exige un token de Turnstile que un probe headless no puede
 * resolver. Las cuentas se crean por Admin API, que es equivalente para todo
 * lo que sigue (la fila en auth.users es idéntica).
 *
 * El estado del gate de signup se REPORTA (sección 0) en vez de asertarse: hoy
 * el captcha se evalúa ANTES que el switch de "allow new users to sign up", así
 * que desde afuera no se puede distinguir "apagado" de "falta captcha".
 *
 * ⚠️ ESCRIBE EN PROD. Crea 1 propietario, 2 cuentas y 1 staff, todos con
 *    prefijo `probe-autoreg-` / dominio .invalid, y los borra al final.
 *    No manda ningún email.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB_DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c';

const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SECRET) { console.error('FALTA env SUPABASE_SECRET_KEY'); process.exit(2); }
const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RUN = Math.random().toString(36).slice(2, 8);
const mail = (q) => `probe-autoreg-${q}-${RUN}@sgh-probe.invalid`;
const DNI  = String(40000000 + Math.floor(Math.random() * 9000000));

const fx = { auth: [], usuarios: [], propietarios: [], solicitudes: [] };
let ok = 0, fail = 0;
const check = (n, cond, det) => {
  if (cond) { ok++; console.log(`  ✅ ${n}`); }
  else { fail++; console.log(`  ❌ ${n}${det ? ' — ' + det : ''}`); }
};

// Sesión sin password: Turnstile bloquea grant_type=password, pero
// /auth/v1/verify no está gateado.
async function sesion(email) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error(`generateLink(${email}): ${error.message}`);
  const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: e2 } = await sb.auth.verifyOtp({
    token_hash: link.properties.hashed_token, type: 'magiclink',
  });
  if (e2) throw new Error(`verifyOtp(${email}): ${e2.message}`);
  return sb;
}
async function cuenta(q) {
  const email = mail(q);
  const { data, error } = await admin.auth.admin.createUser({
    email, password: `Probe-${RUN}-x9!`, email_confirm: true,
  });
  if (error) throw new Error(`createUser(${q}): ${error.message}`);
  fx.auth.push(data.user.id);
  return { email, id: data.user.id };
}

async function teardown() {
  console.log('\n── teardown ──');
  if (fx.solicitudes.length) await admin.from('solicitudes_acceso').delete().in('id', fx.solicitudes);
  if (fx.usuarios.length) {
    const { data: us } = await admin.from('usuarios').select('id').in('email', fx.usuarios);
    const ids = (us || []).map(u => u.id);
    if (ids.length) await admin.from('auditoria').update({ usuario_id: null }).in('usuario_id', ids);
    await admin.from('usuarios').delete().in('email', fx.usuarios);
  }
  if (fx.propietarios.length) await admin.from('propietarios').delete().in('id', fx.propietarios);
  for (const id of fx.auth) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`  ⚠️  auth.users ${id}: ${error.message}`);
  }
  console.log(`  🗑  solicitudes ${fx.solicitudes.length} · usuarios ${fx.usuarios.length}`
            + ` · propietarios ${fx.propietarios.length} · auth ${fx.auth.length}`);
}

console.log(`\n=== probe_autoregistro_e2e (run ${RUN}) ===`);

try {
  // === 0 · Estado del gate de signup — se REPORTA, no se aserta ============
  console.log('\n── 0. Gate de signup (informativo) ──');
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `probe-sonda-${RUN}@sgh-probe.invalid`, password: 'Probe12345!' }),
  });
  const body = await r.json().catch(() => ({}));
  const code = body.error_code || body.code || r.status;
  console.log(`     signUp sin captcha → ${r.status} ${code}`);
  if (code === 'captcha_failed') {
    console.log('     ℹ️  el captcha corta ANTES del switch de signup: desde afuera');
    console.log('        no se puede saber si "allow new users to sign up" está on u off.');
    console.log('        Verificarlo en el dashboard, o con el formulario real.');
  } else if (/signup.*disabled|not allowed/i.test(String(code) + body.msg)) {
    console.log('     ℹ️  signup PÚBLICO APAGADO. El formulario real va a fallar hasta prenderlo.');
  }
  check('0. el signUp anónimo NO crea cuenta sin pasar los controles', r.status >= 400,
    `status=${r.status}`);

  // === 1 · Fixtures =======================================================
  console.log('\n── 1. Fixtures ──');
  const { data: prop, error: eProp } = await admin.from('propietarios').insert({
    club_id: CLUB_DOLORES, tipo: 'persona', nombre: `PROBE-AUTOREG-${RUN}`,
    email: mail('ficha'), activo: true,
  }).select('id').single();
  if (eProp) throw new Error(`propietario: ${eProp.message}`);
  fx.propietarios.push(prop.id);
  check('1. ficha de propietario creada SIN DNI (para probar el copiado)', !!prop.id);

  const staff = await cuenta('staff');
  const { error: eStaff } = await admin.from('usuarios').insert({
    email: staff.email, nombre_completo: `Probe staff ${RUN}`, club_id: CLUB_DOLORES,
    rol: 'secretario_carreras', activo: true, estado: 'activo',
    auth_user_id: staff.id, password_hash: '',
  });
  if (eStaff) throw new Error(`staff: ${eStaff.message}`);
  fx.usuarios.push(staff.email);

  const solicitante = await cuenta('solicitante');
  const sbSol = await sesion(solicitante.email);
  const sbStaff = await sesion(staff.email);

  // === 2 · La solicitud ===================================================
  console.log('\n── 2. El solicitante envía su solicitud ──');
  const { data: solId, error: eSol } = await sbSol.rpc('rpc_solicitar_acceso', {
    p_nombre: 'Juan', p_apellido: `Probe ${RUN}`, p_documento_nro: DNI,
    p_telefono: '5492245123456', p_rol_pedido: 'propietario', p_club_id: CLUB_DOLORES,
    p_origen_hipodromo: 'Tandil', p_origen_caballeriza: `Stud Probe ${RUN}`,
  });
  check('2. rpc_solicitar_acceso crea la solicitud', !eSol && !!solId, eSol?.message);
  if (solId) fx.solicitudes.push(solId);

  // El teléfono ahora es RECOMENDADO, no obligatorio (adenda del Gate 3).
  const sinTel = await cuenta('sintel');
  const sbSinTel = await sesion(sinTel.email);
  const { data: solSinTel, error: eSinTel } = await sbSinTel.rpc('rpc_solicitar_acceso', {
    p_nombre: 'Sin', p_apellido: `Telefono ${RUN}`, p_documento_nro: String(Number(DNI) + 1),
    p_telefono: '', p_rol_pedido: 'propietario', p_club_id: CLUB_DOLORES,
    p_origen_hipodromo: 'La Plata', p_origen_caballeriza: `Stud SinTel ${RUN}`,
  });
  check('3. la solicitud SIN teléfono ya no es rechazada', !eSinTel && !!solSinTel, eSinTel?.message);
  if (solSinTel) fx.solicitudes.push(solSinTel);
  const { data: filaSinTel } = await admin.from('solicitudes_acceso')
    .select('telefono').eq('id', solSinTel).maybeSingle();
  check('4. el teléfono vacío se guarda como NULL, no como cadena vacía',
    filaSinTel?.telefono === null, `telefono=${JSON.stringify(filaSinTel?.telefono)}`);

  // === 3 · La bandeja =====================================================
  console.log('\n── 3. La bandeja del staff ──');
  const { data: bandeja } = await sbStaff.from('solicitudes_acceso')
    .select('id, nombre, apellido, documento_nro, rol_pedido, telefono')
    .eq('club_id', CLUB_DOLORES).eq('estado', 'pendiente');
  check('5. el staff ve la solicitud en su bandeja',
    (bandeja || []).some(s => s.id === solId), `filas=${bandeja?.length}`);

  // Matcheo por DNI, tal como lo hace solicitudes.html: exacto primero.
  const { data: exacta } = await sbStaff.from('propietarios')
    .select('id').eq('club_id', CLUB_DOLORES).eq('documento_nro', DNI);
  check('6. sin DNI en la ficha, el matcheo exacto NO devuelve nada',
    (exacta || []).length === 0, `exactas=${exacta?.length}`);

  const { data: porApellido } = await sbStaff.from('propietarios')
    .select('id, nombre').eq('club_id', CLUB_DOLORES).ilike('nombre', `%PROBE-AUTOREG-${RUN}%`);
  check('7. la búsqueda manual por nombre SÍ la encuentra',
    (porApellido || []).some(p => p.id === prop.id), `filas=${porApellido?.length}`);

  // === 4 · La aprobación ==================================================
  console.log('\n── 4. Aprobación ──');
  const { data: usrId, error: eApr } = await sbStaff.rpc('rpc_aprobar_solicitud', {
    p_solicitud_id: solId, p_entidad_tipo: 'propietario', p_entidad_id: prop.id,
    p_copiar_documento: true,
  });
  check('8. el staff aprueba y se crea el usuario', !eApr && !!usrId, eApr?.message);
  if (usrId) fx.usuarios.push(solicitante.email);

  const { data: fichaPost } = await admin.from('propietarios')
    .select('documento_nro').eq('id', prop.id).single();
  check('9. el DNI declarado se copió a la ficha vacía', fichaPost?.documento_nro === DNI,
    `doc=${fichaPost?.documento_nro}`);

  // === 5 · La cuenta aprobada ve lo suyo ==================================
  console.log('\n── 5. La cuenta aprobada ──');
  const sbAprobado = await sesion(solicitante.email);
  const { data: miUsr } = await sbAprobado.from('usuarios')
    .select('rol, activo, entidad_tipo, entidad_id').eq('auth_user_id', solicitante.id).maybeSingle();
  check('10. ya tiene fila en usuarios, con rol y vínculo',
    miUsr?.rol === 'propietario' && miUsr?.activo === true
    && miUsr?.entidad_tipo === 'propietario' && miUsr?.entidad_id === prop.id,
    JSON.stringify(miUsr));

  const { data: misProps } = await sbAprobado.from('propietarios').select('id');
  check('11. ve su ficha, y SÓLO la suya',
    (misProps || []).length === 1 && misProps[0].id === prop.id, `filas=${misProps?.length}`);

  const { data: misSol } = await sbAprobado.from('solicitudes_acceso').select('id, estado');
  check('12. ve su solicitud como aprobada',
    (misSol || []).length === 1 && misSol[0].estado === 'aprobada', JSON.stringify(misSol));

  // === 6 · Descartar al curioso ===========================================
  console.log('\n── 6. El curioso ──');
  const { error: eDesc } = await sbStaff.rpc('rpc_descartar_solicitud', { p_solicitud_id: solSinTel });
  const { data: descPost } = await admin.from('solicitudes_acceso')
    .select('estado, motivo_rechazo').eq('id', solSinTel).single();
  check('13. se descarta sin motivo y sin avisar',
    !eDesc && descPost?.estado === 'descartada' && !descPost?.motivo_rechazo,
    eDesc?.message ?? JSON.stringify(descPost));

} catch (err) {
  console.error(`\n💥 ${err.message}`);
  fail++;
} finally {
  await teardown();
}

console.log(`\n${'═'.repeat(58)}\n RESULTADO: ${ok} OK · ${fail} FAIL\n${'═'.repeat(58)}\n`);
process.exit(fail ? 1 : 0);
