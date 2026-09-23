/**
 * SMOKE del camino de pago con SESIÓN STAFF REAL (no service_role), contra PRODUCCIÓN,
 * sobre la reunión de prueba 9999.
 *
 * Por qué existe: el probe de guards cubre los 8 perfiles, pero sus llamadas "que pasan" las
 * hace con service_role, que está exento de los guards de club y de la ventana de 5 días. Acá
 * el recibo se emite y se anula con un JWT de `authenticated` obtenido por magiclink de un
 * usuario real de `usuarios` con rol `secretario_carreras` — el mismo camino que hace Valeria
 * desde liquidaciones.html.
 *
 * Qué hace:
 *   1. snapshot por ESTADO de las líneas de la 9999 (GOTCHA #77) + foto de recibos.
 *   2. crea un usuario staff real (auth + fila en usuarios) y saca su JWT por magiclink.
 *   3. con ESE cliente: emitir_recibo sobre una línea impaga de la 9999.
 *   4. verifica: el recibo existe, estado 'emitido', emitido_por = el usuario, y las líneas
 *      quedaron 'pagado' con recibo_id apuntando al recibo.
 *   5. con ESE cliente: anular_recibo. Verifica que las líneas volvieron EXACTAMENTE a su
 *      estado previo y que el recibo quedó 'anulado' con las líneas en lineas_anuladas.
 *   6. teardown: borra el recibo, restaura líneas si hiciera falta, devuelve `club_secuencias`
 *      a su valor previo (emitir consume un número: sin esto el próximo recibo real sale con un
 *      salto), borra el usuario (auditoría primero — FK sin ON DELETE) y verifica por diff que
 *      la 9999 quedó igual.
 *
 * Correr:  set -a; . ./.env; set +a; node <este archivo>
 */
import { createClient } from '@supabase/supabase-js';
import { snapshotLineas, diffLineas, restaurarLineas, describir, recibosDesde } from './lib/estado_lineas.mjs';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!SECRET) { console.error('falta SUPABASE_SECRET_KEY'); process.exit(2); }
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const RID  = 'a0000000-0000-0000-0000-000000009999';
const RUN  = Date.now().toString(36);

const sb = createClient(SUPABASE_URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });

let fallos = 0;
const ok = (t, cond, det = '') => {
  console.log(`${cond ? '✅' : '❌'} ${t}${det ? `\n   → ${det}` : ''}`);
  if (!cond) fallos++;
};
const q = async (p, ctx) => { const { data, error } = await p; if (error) throw new Error(`${ctx}: ${error.message}`); return data; };

const desde = new Date(Date.now() - 60_000).toISOString();
let usuario = null, reciboId = null, antes = null, secAntes = null;

try {
  // ── 1. snapshot ────────────────────────────────────────────────────────────
  antes = await snapshotLineas(sb, RID);
  secAntes = (await q(sb.from('club_secuencias').select('ultimo_numero').eq('club_id', CLUB).eq('tipo', 'recibo').single(), 'sec antes')).ultimo_numero;
  const recibosAntes = await recibosDesde(sb, desde);
  ok('S1) snapshot de la 9999 tomado', Object.keys(antes).length > 0 && recibosAntes.length === 0,
     `${Object.keys(antes).length} líneas · ${recibosAntes.length} recibos nuevos previos · club_secuencias=${secAntes}`);

  // ── 2. usuario staff real + JWT por magiclink ──────────────────────────────
  const email = `smoke.pago.staff.${RUN}@sgh.test`;
  const au = await q(sb.auth.admin.createUser({ email, password: `Px-${RUN}-${Math.random().toString(36).slice(2)}`, email_confirm: true }), 'createUser');
  usuario = { email, authId: au.user.id };
  await q(sb.from('usuarios').insert({
    email, nombre_completo: `Smoke pago staff ${RUN}`, club_id: CLUB,
    rol: 'secretario_carreras', activo: true, estado: 'activo', password_hash: '', auth_user_id: au.user.id,
  }), 'insert usuarios');
  const link = await q(sb.auth.admin.generateLink({ type: 'magiclink', email }), 'generateLink');
  const staff = createClient(SUPABASE_URL, PUBLISHABLE, { auth: { autoRefreshToken: false, persistSession: false } });
  await q(staff.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' }), 'verifyOtp');
  const ses = await staff.auth.getSession();
  const claims = JSON.parse(Buffer.from(ses.data.session.access_token.split('.')[1], 'base64url').toString());
  ok('S2) sesión staff real (NO service_role)', claims.role === 'authenticated' && claims.sub === au.user.id,
     `role=${claims.role} sub=${claims.sub.slice(0, 8)} email=${email}`);

  const filaUsuario = await q(sb.from('usuarios').select('id,rol,club_id').eq('email', email).single(), 'fila usuarios');

  // ── 3. línea impaga de la 9999 ─────────────────────────────────────────────
  const cands = await q(sb.from('liquidacion_detalle')
    .select('id,beneficiario_tipo,beneficiario_id,monto_bruto,monto_descuento,estado_linea,recibo_id')
    .eq('reunion_id', RID).eq('estado_linea', 'impago').is('recibo_id', null)
    .not('beneficiario_id', 'is', null).order('id').limit(50), 'candidatas');
  const elegida = cands[0];
  if (!elegida) throw new Error('la 9999 no tiene ninguna línea impaga para el smoke');
  const hermanas = cands.filter(c => c.beneficiario_id === elegida.beneficiario_id && c.beneficiario_tipo === elegida.beneficiario_tipo);
  const lineaIds = hermanas.map(c => c.id);
  ok('S3) línea(s) impaga(s) elegida(s) de la 9999', lineaIds.length > 0,
     `${lineaIds.length} línea(s) · ${elegida.beneficiario_tipo} ${elegida.beneficiario_id.slice(0, 8)} · ids ${lineaIds.map(i => i.slice(0, 8)).join(',')}`);

  // ── 4. EMITIR con la sesión staff ──────────────────────────────────────────
  const { data: rec, error: eEmi } = await staff.rpc('emitir_recibo', {
    p_club_id: CLUB, p_beneficiario_tipo: elegida.beneficiario_tipo, p_beneficiario_id: elegida.beneficiario_id,
    p_linea_ids: lineaIds, p_forma_pago: 'efectivo',
    p_cobrador_nombre: `SMOKE ${RUN}`, p_cobrador_documento: '00000000', p_comprobante_url: null,
  });
  ok('S4) emitir_recibo con sesión staff → sale el recibo', !eEmi && !!rec,
     eEmi ? `${eEmi.code} ${eEmi.message}` : `N° ${rec.numero_recibo} id=${rec.id.slice(0, 8)} estado=${rec.estado}`);
  if (eEmi || !rec) throw new Error('emitir_recibo falló: ' + (eEmi?.message || 'sin fila'));
  reciboId = rec.id;

  // ── 5. verificación del efecto ─────────────────────────────────────────────
  const recDb = await q(sb.from('recibos').select('*').eq('id', reciboId).single(), 'recibo en db');
  ok('S5) el recibo está en la base, emitido y con el club correcto',
     recDb.estado === 'emitido' && recDb.club_id === CLUB,
     `estado=${recDb.estado} club=${recDb.club_id.slice(0, 8)} n°=${recDb.numero_recibo}`);
  ok('S6) emitido_por = el usuario staff (no NULL, que es lo que deja service_role)',
     recDb.emitido_por === filaUsuario.id, `emitido_por=${recDb.emitido_por} esperado=${filaUsuario.id}`);

  const trasEmitir = await snapshotLineas(sb, RID);
  const pagadas = lineaIds.filter(id => trasEmitir[id].estado_linea === 'pagado' && trasEmitir[id].recibo_id === reciboId);
  ok('S7) las líneas quedaron pagado + recibo_id del recibo', pagadas.length === lineaIds.length,
     `${pagadas.length}/${lineaIds.length}`);
  const dEmi = diffLineas(antes, trasEmitir);
  ok('S8) emitir tocó SÓLO las líneas del recibo',
     dEmi.cambiadas.length === lineaIds.length && !dEmi.faltantes.length && !dEmi.nuevas.length,
     describir(dEmi));

  // ── 6. ANULAR con la misma sesión staff ────────────────────────────────────
  const { data: anu, error: eAnu } = await staff.rpc('anular_recibo', {
    p_recibo_id: reciboId, p_motivo: `smoke del camino de pago ${RUN}`,
  });
  ok('S9) anular_recibo con sesión staff → el recibo queda anulado', !eAnu && anu?.estado === 'anulado',
     eAnu ? `${eAnu.code} ${eAnu.message}` : `estado=${anu.estado} anulado_por=${anu.anulado_por} motivo="${anu.motivo_anulacion}"`);

  const trasAnular = await snapshotLineas(sb, RID);
  const dAnu = diffLineas(antes, trasAnular);
  ok('S10) las líneas volvieron EXACTAMENTE a su estado previo', dAnu.limpio, describir(dAnu));

  const recAnu = await q(sb.from('recibos').select('estado,anulado_por,motivo_anulacion,lineas_anuladas').eq('id', reciboId).single(), 'recibo anulado');
  ok('S11) anulado_por = el usuario staff y la foto lineas_anuladas tiene las líneas',
     recAnu.anulado_por === filaUsuario.id && Array.isArray(recAnu.lineas_anuladas) && recAnu.lineas_anuladas.length === lineaIds.length,
     `anulado_por=${recAnu.anulado_por} lineas_anuladas=${Array.isArray(recAnu.lineas_anuladas) ? recAnu.lineas_anuladas.length : 'no-array'}`);
} catch (e) {
  fallos++;
  console.log(`💥 el smoke no corrió entero: ${e.message}`);
} finally {
  // ── 7. teardown ────────────────────────────────────────────────────────────
  const errores = [];
  if (reciboId) {
    const { error } = await sb.from('recibos').delete().eq('id', reciboId);
    if (error) errores.push(`recibo: ${error.message}`);
  }
  if (antes) {
    const arregladas = await restaurarLineas(sb, antes, await snapshotLineas(sb, RID));
    ok('T1) no hubo que restaurar nada a mano (anular ya había dejado todo en su lugar)',
       arregladas === 0, `restauradas=${arregladas}`);
  }
  if (secAntes !== null) {
    const { error } = await sb.from('club_secuencias').update({ ultimo_numero: secAntes }).eq('club_id', CLUB).eq('tipo', 'recibo');
    if (error) errores.push(`club_secuencias: ${error.message}`);
  }
  if (usuario) {
    const fila = await sb.from('usuarios').select('id').eq('email', usuario.email).maybeSingle();
    if (fila.data?.id) {
      const { error } = await sb.from('auditoria').delete().eq('usuario_id', fila.data.id);
      if (error) errores.push(`auditoria: ${error.message}`);
    }
    const { error } = await sb.from('usuarios').delete().eq('email', usuario.email);
    if (error) errores.push(`usuarios: ${error.message}`);
    try { await sb.auth.admin.deleteUser(usuario.authId); } catch (e) { errores.push(`auth: ${e.message}`); }
  }
  if (errores.length) { fallos++; console.log(`⚠ teardown con errores: ${errores.join(' | ')}`); }

  if (antes) {
    const fin = diffLineas(antes, await snapshotLineas(sb, RID));
    ok('T2) restore por ESTADO: la 9999 quedó exactamente como al empezar', fin.limpio, describir(fin));
  }
  const recFin = await recibosDesde(sb, desde);
  const usFin = await sb.from('usuarios').select('email').like('email', 'smoke.pago.staff.%');
  ok('T3) no quedaron recibos ni usuarios del smoke',
     recFin.length === 0 && (usFin.data || []).length === 0,
     `recibos=${recFin.length} usuarios=${(usFin.data || []).length}`);
  if (secAntes !== null) {
    const secFin = (await sb.from('club_secuencias').select('ultimo_numero').eq('club_id', CLUB).eq('tipo', 'recibo').single()).data?.ultimo_numero;
    ok('T4) club_secuencias volvió a su valor previo (el próximo recibo real no salta de número)',
       secFin === secAntes, `antes=${secAntes} ahora=${secFin}`);
  }

  console.log(`\n${fallos === 0 ? '✅ SMOKE LIMPIO' : `❌ ${fallos} fallo(s)`}`);
  process.exit(fallos === 0 ? 0 : 1);
}
