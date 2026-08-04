/**
 * probe_rls_portal.mjs — Los 12 asserts de PORTAL_V2_PLAN §D.4.
 *
 * Verifica que una cuenta de PORTAL no puede alcanzar datos ajenos. La mayoría
 * de los asserts son NEGATIVOS: afirman que algo NO se puede hacer.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_rls_portal.mjs
 *
 * ---------------------------------------------------------------------------
 * ESTADO ESPERADO SEGÚN LA FASE
 * ---------------------------------------------------------------------------
 *   PRE-FASE 2 (hoy):   asserts 1-9 en ROJO. Los huecos están abiertos y esto
 *                       documenta el estado previo. Es el resultado correcto.
 *   POST-FASE 2:        asserts 1-10 en VERDE.
 *   POST-FASE 4 (RPC):  asserts 11-12 dejan de estar PENDIENTES.
 *
 * ---------------------------------------------------------------------------
 * LA TRAMPA DEL UPDATE — leer esto antes de tocar el archivo
 * ---------------------------------------------------------------------------
 * Un UPDATE/DELETE bloqueado por RLS **no devuelve error**: devuelve ÉXITO con
 * 0 filas afectadas. Un probe que mire `error === null` da verde con las
 * policies abiertas Y cerradas — o sea, no prueba nada.
 *
 * Acá cada assert de escritura hace:
 *   1. snapshot del valor con el cliente ADMIN
 *   2. intento de escritura con el cliente PORTAL
 *   3. re-lectura del valor con el cliente ADMIN
 *   4. assert sobre el VALOR, nunca sobre el status de la respuesta
 *
 * ---------------------------------------------------------------------------
 * SEGURIDAD DE LOS DATOS
 * ---------------------------------------------------------------------------
 * · Ningún dato de persona real: todos los fixtures son .invalid / PROBE-*.
 * · Los asserts DESTRUCTIVOS (6, 7, 8) apuntan EXCLUSIVAMENTE a filas fixture.
 *   Si el hueco está abierto, el probe borra su propia basura, nunca datos de
 *   Dolores. Esto es deliberado y no debe cambiarse.
 * · Teardown en `finally`; residuo manual en tests/teardown_probe_rls.sql.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB_DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c';

function requireSecret() {
  const v = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!v) {
    console.error('FALTA env: exportá SUPABASE_SECRET_KEY.  set -a; . ./.env; set +a');
    process.exit(2);
  }
  return v;
}

const admin = createClient(SUPABASE_URL, requireSecret(), {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------
const resultados = [];   // {id, label, estado: 'PASS'|'FAIL'|'PEND', detalle}
function check(id, cond, label, detalle) {
  const estado = cond ? 'PASS' : 'FAIL';
  resultados.push({ id, label, estado, detalle });
  console.log(`  ${cond ? '✅' : '❌'} ${id}. ${label}${!cond && detalle ? `  → ${detalle}` : ''}`);
}
function pending(id, label, motivo) {
  resultados.push({ id, label, estado: 'PEND', detalle: motivo });
  console.log(`  ⏳ ${id}. ${label}  → PENDIENTE: ${motivo}`);
}
function info(msg) { console.log(`     ${msg}`); }

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const RUN  = Math.random().toString(36).slice(2, 8);
const PASS = `Probe-${RUN}-${Math.random().toString(36).slice(2, 10)}!`;
const emailPortal = (q) => `probe-rls-portal-${q}-${RUN}@sgh-probe.invalid`;

const fx = {
  authIds: [], usuarios: [], propietarios: [], spcs: [],
  reuniones: [], carreras: [], inscripciones: [],
  liquidaciones: [], recibos: [], resultados: [],
};

async function columnaExiste(tabla, columna) {
  const { error } = await admin.from(tabla).select(columna).limit(1);
  return !error;
}

async function crearUsuarioPortal(q, propietarioId) {
  const email = emailPortal(q);
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASS, email_confirm: true,
  });
  if (error) throw new Error(`createUser(${q}): ${error.message}`);
  fx.authIds.push(data.user.id);

  const fila = {
    email,
    nombre_completo: `Probe portal ${q} ${RUN}`,
    club_id: CLUB_DOLORES,
    rol: 'propietario',
    activo: true,
    estado: 'activo',
    password_hash: '',
  };
  if (await columnaExiste('usuarios', 'auth_user_id')) fila.auth_user_id = data.user.id;
  if (await columnaExiste('usuarios', 'entidad_id')) {
    fila.entidad_tipo = 'propietario';
    fila.entidad_id = propietarioId;
  }
  const { error: e2 } = await admin.from('usuarios').insert(fila);
  if (e2) throw new Error(`insert usuarios(${q}): ${e2.message}`);
  fx.usuarios.push(email);
  return { email, authId: data.user.id };
}

// Auth del probe — NO por signInWithPassword.
// Desde el 04/08/2026 hay Attack Protection (Turnstile) activo y GoTrue
// rechaza grant_type=password con captcha_failed antes de mirar credenciales.
// /auth/v1/verify NO está gateado, así que se canjea un magiclink generado por
// Admin API (no manda mail, no gasta cuota).
async function clientePortal(email) {
  const { data: link, error: eLink } =
    await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (eLink) throw new Error(`generateLink(${email}): ${eLink.message}`);
  const hashed = link?.properties?.hashed_token;
  if (!hashed) throw new Error(`generateLink(${email}): sin hashed_token`);

  const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await sb.auth.verifyOtp({ token_hash: hashed, type: 'magiclink' });
  if (error) throw new Error(`verifyOtp(${email}): ${error.message}`);
  return sb;
}

async function ins(tabla, fila, bucket) {
  const { data, error } = await admin.from(tabla).insert(fila).select('id').single();
  if (error) throw new Error(`insert ${tabla}: ${error.message}`);
  if (bucket) fx[bucket].push(data.id);
  return data.id;
}

async function teardown() {
  console.log('\n── teardown ──');
  const borrar = async (tabla, ids, extra) => {
    if (!ids.length) return;
    if (extra) await extra();
    const { error } = await admin.from(tabla).delete().in('id', ids);
    console.log(error ? `  ⚠️  ${tabla}: ${error.message}` : `  🗑  ${tabla}: ${ids.length}`);
  };
  // Orden inverso al de creación, respetando FKs.
  await borrar('recibos', fx.recibos);
  if (fx.liquidaciones.length) {
    await admin.from('liquidacion_detalle').delete().in('liquidacion_id', fx.liquidaciones);
  }
  await borrar('liquidaciones', fx.liquidaciones);
  if (fx.resultados.length) {
    await admin.from('resultado_posiciones').delete().in('resultado_id', fx.resultados);
  }
  await borrar('resultados', fx.resultados);
  await borrar('inscripciones', fx.inscripciones);
  await borrar('carreras', fx.carreras);
  await borrar('reuniones', fx.reuniones);
  await borrar('spcs', fx.spcs, async () => {
    await admin.from('spc_propietarios').delete().in('spc_id', fx.spcs);
  });
  await borrar('propietarios', fx.propietarios);
  if (fx.usuarios.length) {
    // auditoria_usuario_id_fkey bloquea el DELETE (los triggers de auditoría
    // dejan filas apuntando al fixture). Se anula usuario_id — nullable — para
    // no destruir entradas de auditoría sobre filas reales.
    const { data: us } = await admin.from('usuarios').select('id').in('email', fx.usuarios);
    const ids = (us || []).map((u) => u.id);
    if (ids.length) {
      const { error: eAud } = await admin.from('auditoria').update({ usuario_id: null }).in('usuario_id', ids);
      if (eAud) console.error(`  ⚠️  auditoria: ${eAud.message}`);
    }
    const { error } = await admin.from('usuarios').delete().in('email', fx.usuarios);
    console.log(error ? `  ⚠️  usuarios: ${error.message}` : `  🗑  usuarios: ${fx.usuarios.length}`);
  }
  for (const id of fx.authIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`  ⚠️  auth.users ${id}: ${error.message} → tests/teardown_probe_rls.sql`);
  }
  if (fx.authIds.length) console.log(`  🗑  auth.users: ${fx.authIds.length}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log('\n════════════════════════════════════════════════════════════');
console.log(' probe_rls_portal — 12 asserts de PORTAL_V2_PLAN §D.4');
console.log(`  run=${RUN}`);
console.log('  Pre-FASE 2 se espera ROJO en 1-9 (huecos abiertos).');
console.log('════════════════════════════════════════════════════════════\n');

try {
  console.log('── setup: grafo de fixtures ──');

  const { data: hip } = await admin.from('hipodromos').select('id').limit(1).single();
  const { data: cat } = await admin.from('categorias_carrera')
    .select('id').eq('club_id', CLUB_DOLORES).limit(1).single();
  if (!hip || !cat) throw new Error('faltan hipodromo/categoria para armar la reunión fixture');

  // Propietarios A y B
  const propA = await ins('propietarios', {
    club_id: CLUB_DOLORES, tipo: 'persona', nombre: `PROBE-A-${RUN}`,
    email: `probe-rls-propa-${RUN}@sgh-probe.invalid`, activo: true,
  }, 'propietarios');
  const propB = await ins('propietarios', {
    club_id: CLUB_DOLORES, tipo: 'persona', nombre: `PROBE-B-${RUN}`,
    email: `probe-rls-propb-${RUN}@sgh-probe.invalid`, activo: true,
  }, 'propietarios');

  // SPCs A y B
  const spcA = await ins('spcs', {
    nombre: `PROBE A ${RUN}`, fecha_nacimiento: '2021-09-01', sexo: 'macho', estado: 'activo',
  }, 'spcs');
  const spcB = await ins('spcs', {
    nombre: `PROBE B ${RUN}`, fecha_nacimiento: '2021-09-01', sexo: 'hembra', estado: 'activo',
  }, 'spcs');
  await admin.from('spc_propietarios').insert([
    { spc_id: spcA, propietario_id: propA, porcentaje: 100, fecha_desde: '2026-01-01', activo: true },
    { spc_id: spcB, propietario_id: propB, porcentaje: 100, fecha_desde: '2026-01-01', activo: true },
  ]);

  // Reunión fixture con hijos (9997) + reunión desechable sin hijos (9996)
  const reunFix = await ins('reuniones', {
    club_id: CLUB_DOLORES, hipodromo_id: hip.id, numero: 9997, fecha: '2099-02-01',
    tipo: 'oficial', estado: 'borrador', observaciones: `probe-rls-${RUN}`,
  }, 'reuniones');
  const reunDesechable = await ins('reuniones', {
    club_id: CLUB_DOLORES, hipodromo_id: hip.id, numero: 9996, fecha: '2099-02-02',
    tipo: 'oficial', estado: 'borrador', observaciones: `probe-rls-${RUN} descartable`,
  }, 'reuniones');

  const carrFix = await ins('carreras', {
    reunion_id: reunFix, numero_turno: 1, categoria_id: cat.id,
    distancia_metros: 1000, bolsa_total: 0, nombre: `PROBE ${RUN}`,
  }, 'carreras');

  const inscA = await ins('inscripciones', {
    carrera_id: carrFix, spc_id: spcA, estado: 'inscripto', canal: 'manual',
  }, 'inscripciones');
  const inscB = await ins('inscripciones', {
    carrera_id: carrFix, spc_id: spcB, estado: 'inscripto', canal: 'manual',
  }, 'inscripciones');

  // Resultado fixture (para el assert 8)
  const resFix = await ins('resultados', {
    carrera_id: carrFix, estado: 'provisional',
  }, 'resultados');

  // Liquidaciones + detalle de A y de B
  const liqA = await ins('liquidaciones', {
    club_id: CLUB_DOLORES, reunion_id: reunFix, propietario_id: propA,
    total_bruto: 0, total_descuentos: 0, estado: 'borrador', notas: `probe-rls-${RUN}`,
  }, 'liquidaciones');
  const liqB = await ins('liquidaciones', {
    club_id: CLUB_DOLORES, reunion_id: reunFix, propietario_id: propB,
    total_bruto: 0, total_descuentos: 0, estado: 'borrador', notas: `probe-rls-${RUN}`,
  }, 'liquidaciones');

  const { data: detA } = await admin.from('liquidacion_detalle').insert({
    liquidacion_id: liqA, concepto: `probe-A-${RUN}`, monto_bruto: 1000,
    estado_linea: 'impago', beneficiario_tipo: 'propietario', beneficiario_id: propA,
  }).select('id').single();
  const { data: detB } = await admin.from('liquidacion_detalle').insert({
    liquidacion_id: liqB, concepto: `probe-B-${RUN}`, monto_bruto: 2000,
    estado_linea: 'impago', beneficiario_tipo: 'propietario', beneficiario_id: propB,
  }).select('id').single();

  // Recibo de B
  const { data: recB, error: eRec } = await admin.from('recibos').insert({
    club_id: CLUB_DOLORES, beneficiario_tipo: 'propietario', propietario_id: propB,
    // GOTCHA #9: neto_a_cobrar es GENERATED ALWAYS — no se incluye en el INSERT.
    forma_pago: 'efectivo', total_premios: 2000, total_descuentos: 0,
    retencion_dgi: 0, estado: 'emitido',
    numero_recibo: 999000 + Math.floor(Math.random() * 900),
    notas: `probe-rls-${RUN}`,
  }).select('id').single();
  if (recB) fx.recibos.push(recB.id);
  if (eRec) info(`(recibo fixture no creado: ${eRec.message} — el assert 2 queda sin dato de B)`);

  const uA = await crearUsuarioPortal('a', propA);
  await crearUsuarioPortal('b', propB);
  const sbA = await clientePortal(uA.email);
  info(`portal A logueado: ${uA.email}\n`);

  // =========================================================================
  console.log('── Asserts negativos (1-9): A no debe alcanzar lo de B ──');
  // =========================================================================

  // 1 — liquidacion_detalle de B
  const { data: verDetB } = await sbA.from('liquidacion_detalle').select('id').eq('id', detB.id);
  check(1, (verDetB?.length ?? 0) === 0,
    'A NO lee liquidacion_detalle de B', `filas=${verDetB?.length}`);

  // 2 — recibos de B
  if (recB) {
    const { data: verRecB } = await sbA.from('recibos').select('id').eq('id', recB.id);
    check(2, (verRecB?.length ?? 0) === 0, 'A NO lee recibos de B', `filas=${verRecB?.length}`);
  } else {
    pending(2, 'A NO lee recibos de B', 'no se pudo crear el recibo fixture');
  }

  // 3 — UPDATE propietarios.email de B  (vector de suplantación de §D-H1)
  const { data: snapPropB } = await admin.from('propietarios').select('email').eq('id', propB).single();
  await sbA.from('propietarios').update({ email: `secuestrado-${RUN}@sgh-probe.invalid` }).eq('id', propB);
  const { data: postPropB } = await admin.from('propietarios').select('email').eq('id', propB).single();
  check(3, postPropB?.email === snapPropB?.email,
    'A NO puede escribir propietarios.email de B', `antes=${snapPropB?.email} después=${postPropB?.email}`);

  // 4 — UPDATE spcs de B
  const { data: snapSpcB } = await admin.from('spcs').select('nombre,estado').eq('id', spcB).single();
  await sbA.from('spcs').update({ estado: 'retirado' }).eq('id', spcB);
  const { data: postSpcB } = await admin.from('spcs').select('nombre,estado').eq('id', spcB).single();
  check(4, postSpcB?.estado === snapSpcB?.estado,
    'A NO puede escribir spcs de B', `antes=${snapSpcB?.estado} después=${postSpcB?.estado}`);

  // 5 — INSERT en spc_propietarios (reclamar propiedad del caballo de B)
  await sbA.from('spc_propietarios').insert({
    spc_id: spcB, propietario_id: propA, porcentaje: 100,
    fecha_desde: '2026-01-01', activo: true,
  });
  const { data: reclamo } = await admin.from('spc_propietarios')
    .select('id').eq('spc_id', spcB).eq('propietario_id', propA);
  check(5, (reclamo?.length ?? 0) === 0,
    'A NO puede reclamar propiedad vía spc_propietarios', `filas=${reclamo?.length}`);

  // 6 — UPDATE/DELETE inscripciones de B  (fixture: si el hueco está abierto, borra basura propia)
  const { data: snapInscB } = await admin.from('inscripciones').select('estado').eq('id', inscB).single();
  await sbA.from('inscripciones').update({ estado: 'forfait' }).eq('id', inscB);
  const { data: postInscB } = await admin.from('inscripciones').select('estado').eq('id', inscB).single();
  check(6, postInscB?.estado === snapInscB?.estado,
    'A NO puede poner en forfait la inscripción de B', `antes=${snapInscB?.estado} después=${postInscB?.estado}`);

  // 7 — DELETE reuniones / carreras (contra la reunión desechable, sin hijos)
  await sbA.from('reuniones').delete().eq('id', reunDesechable);
  const { data: postReun } = await admin.from('reuniones').select('id').eq('id', reunDesechable);
  check(7, (postReun?.length ?? 0) === 1,
    'A NO puede borrar una reunión', `sobrevivió=${(postReun?.length ?? 0) === 1}`);
  if ((postReun?.length ?? 0) === 0) {
    info('⚠️  la reunión fixture fue BORRADA por una cuenta de portal — hueco D-H6 confirmado');
    fx.reuniones = fx.reuniones.filter((r) => r !== reunDesechable);
  }

  // 8 — UPDATE resultados
  const { data: snapRes } = await admin.from('resultados').select('estado').eq('id', resFix).single();
  await sbA.from('resultados').update({ estado: 'oficial' }).eq('id', resFix);
  const { data: postRes } = await admin.from('resultados').select('estado').eq('id', resFix).single();
  check(8, postRes?.estado === snapRes?.estado,
    'A NO puede alterar resultados', `antes=${snapRes?.estado} después=${postRes?.estado}`);

  // 9 — usuarios: sólo su propia fila
  const { data: usrVis } = await sbA.from('usuarios').select('id,email');
  const soloPropia = (usrVis?.length ?? 0) === 1 && usrVis[0].email === uA.email;
  check(9, soloPropia, 'A sólo ve su propia fila de usuarios', `filas=${usrVis?.length}`);

  // =========================================================================
  console.log('\n── Assert positivo (10): A sí ve lo suyo ──');
  // =========================================================================
  const { data: misSpcs } = await sbA.from('spcs').select('id').eq('id', spcA);
  const { data: misInsc } = await sbA.from('inscripciones').select('id').eq('id', inscA);
  const { data: misDet }  = await sbA.from('liquidacion_detalle').select('id').eq('id', detA.id);
  const ve = {
    spc: (misSpcs?.length ?? 0) === 1,
    insc: (misInsc?.length ?? 0) === 1,
    det: (misDet?.length ?? 0) === 1,
  };
  check(10, ve.spc && ve.insc && ve.det,
    'A ve su caballo, su inscripción y su línea de liquidación',
    `spc=${ve.spc} insc=${ve.insc} detalle=${ve.det}`);

  // =========================================================================
  console.log('\n── Assert 13: escalada por auto-edición (guarda de FASE 2c) ──');
  // =========================================================================
  // `usuarios_update` deja editar la fila propia y RLS no tiene granularidad de
  // columna. Como la identidad del portal se resuelve por usuarios.entidad_id,
  // sin guarda una cuenta podría reapuntarse a la ficha de otro y suplantarlo
  // SIN tocar la fila de la víctima. Lo frena trg_usuarios_guard_privilegios.
  const { data: snapU } = await admin.from('usuarios')
    .select('entidad_id').eq('email', uA.email).maybeSingle();
  await sbA.from('usuarios').update({ entidad_id: propB }).eq('email', uA.email);
  const { data: postU } = await admin.from('usuarios')
    .select('entidad_id').eq('email', uA.email).maybeSingle();
  check(13, postU?.entidad_id === snapU?.entidad_id,
    'A NO puede reapuntar su propio entidad_id a la ficha de B',
    `antes=${snapU?.entidad_id} después=${postU?.entidad_id}`);

  // =========================================================================
  console.log('\n── Asserts del RPC (11-12) ──');
  // =========================================================================
  const { error: eRpc } = await sbA.rpc('portal_inscribir', { p_spc_id: spcB, p_carrera_id: carrFix });
  if (eRpc && /does not exist|Could not find/i.test(eRpc.message)) {
    pending(11, 'portal_inscribir rechaza un SPC ajeno', 'RPC no existe todavía (FASE 4 del PORTAL_V2_PLAN)');
    pending(12, 'portal_inscribir rechaza fuera de ventana', 'RPC no existe todavía (FASE 4 del PORTAL_V2_PLAN)');
  } else {
    const { data: colada } = await admin.from('inscripciones')
      .select('id').eq('spc_id', spcB).eq('carrera_id', carrFix).neq('id', inscB);
    check(11, (colada?.length ?? 0) === 0,
      'portal_inscribir rechaza un SPC ajeno', `inscripciones coladas=${colada?.length}`);
    pending(12, 'portal_inscribir rechaza fuera de ventana',
      'requiere carrera con ventana cargada — implementar junto al RPC');
  }

} catch (err) {
  console.error(`\n💥 ERROR: ${err.message}`);
  resultados.push({ id: '—', label: `excepción: ${err.message}`, estado: 'FAIL' });
} finally {
  await teardown();
}

// ---------------------------------------------------------------------------
const pass = resultados.filter((r) => r.estado === 'PASS').length;
const fail = resultados.filter((r) => r.estado === 'FAIL');
const pend = resultados.filter((r) => r.estado === 'PEND').length;

console.log('\n════════════════════════════════════════════════════════════');
console.log(` RESULTADO: ${pass} PASS · ${fail.length} FAIL · ${pend} PENDIENTE`);
if (fail.length) {
  console.log('\n HUECOS ABIERTOS (cada FAIL = un agujero real de RLS):');
  for (const f of fail) console.log(`   ❌ ${f.id}. ${f.label}${f.detalle ? `  → ${f.detalle}` : ''}`);
  console.log('\n Pre-FASE 2 esto es lo ESPERADO y sirve de baseline.');
  console.log(' Post-FASE 2 cualquier FAIL es un hueco que quedó sin cerrar.');
} else {
  console.log('\n ✅ Ningún hueco alcanzable desde una cuenta de portal.');
}
console.log('════════════════════════════════════════════════════════════\n');
process.exit(fail.length ? 1 : 0);
