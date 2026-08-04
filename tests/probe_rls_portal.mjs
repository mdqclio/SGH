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
  solicitudes: [],
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

// Cuenta PENDIENTE: existe en auth.users y NO tiene fila en `usuarios`. Es el
// estado del auto-registrado antes de que la secretaría lo apruebe (Gate 2).
// Todo el diseño se apoya en que sin fila en usuarios, fn_is_staff(),
// fn_get_user_club_id(), fn_mis_entidades() y fn_mis_spc_ids() devuelven
// falso/NULL/vacío, así que las policies ya lo deniegan sin excepción alguna.
async function crearCuentaPendiente(q) {
  const email = emailPortal(q);
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASS, email_confirm: true,
  });
  if (error) throw new Error(`createUser(${q}): ${error.message}`);
  fx.authIds.push(data.user.id);
  return { email, authId: data.user.id };
}

// Staff real, para poder ejercitar las RPCs de resolución con una sesión que
// pase fn_is_staff(). El admin client NO sirve: auth.uid() es null y el guard
// corta con 'No autenticado' — que es justamente lo que queremos que haga.
async function crearStaff(q) {
  const email = emailPortal(q);
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASS, email_confirm: true,
  });
  if (error) throw new Error(`createUser(${q}): ${error.message}`);
  fx.authIds.push(data.user.id);
  const { error: e2 } = await admin.from('usuarios').insert({
    email,
    nombre_completo: `Probe staff ${q} ${RUN}`,
    club_id: CLUB_DOLORES,
    rol: 'secretario_carreras',
    activo: true,
    estado: 'activo',
    auth_user_id: data.user.id,
    password_hash: '',
  });
  if (e2) throw new Error(`insert usuarios staff(${q}): ${e2.message}`);
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
  await borrar('solicitudes_acceso', fx.solicitudes);
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
  console.log('\n── Cuenta PENDIENTE — auto-registro, Gate 2 (P1-P12) ──');
  // =========================================================================
  // Una cuenta que existe en auth.users y NO tiene fila en `usuarios`. Es lo
  // que produce el auto-registro antes de la aprobación de la secretaría.
  // Diseño en docs/AUTOREGISTRO_PLAN.md §B.2 y §C.7.
  //
  // Los asserts de ESCRITURA respetan la trampa del encabezado: un UPDATE
  // bloqueado por RLS devuelve éxito con 0 filas. Todo se verifica releyendo
  // con el cliente ADMIN y comparando VALORES.

  const propC = await ins('propietarios', {
    club_id: CLUB_DOLORES, tipo: 'persona', nombre: `PROBE-C-${RUN}`,
    email: `probe-rls-propc-${RUN}@sgh-probe.invalid`, activo: true,
  }, 'propietarios');

  const staff = await crearStaff('staff');
  const pend1 = await crearCuentaPendiente('pend1');
  const pend2 = await crearCuentaPendiente('pend2');
  const sbP1 = await clientePortal(pend1.email);
  const sbP2 = await clientePortal(pend2.email);
  const sbStaff = await clientePortal(staff.email);
  info(`pendiente 1: ${pend1.email}`);

  // Cada solicitud usa un DNI distinto: el índice parcial anti-flood prohíbe
  // dos pendientes con el mismo documento en el mismo club.
  const doc1 = String(30000000 + Math.floor(Math.random() * 9000000));
  const doc2 = String(30000000 + Math.floor(Math.random() * 9000000));

  const { data: sol1, error: eSol1 } = await sbP1.rpc('rpc_solicitar_acceso', {
    p_nombre: 'Probe', p_apellido: `Pendiente ${RUN}`, p_documento_nro: doc1,
    p_telefono: '2245-000000', p_rol_pedido: 'propietario', p_club_id: CLUB_DOLORES,
  });
  check('P0', !eSol1 && !!sol1, 'el pendiente puede crear su solicitud',
    eSol1?.message ?? `id=${sol1}`);
  if (sol1) fx.solicitudes.push(sol1);

  const { data: sol2 } = await sbP2.rpc('rpc_solicitar_acceso', {
    p_nombre: 'Probe', p_apellido: `Pendiente2 ${RUN}`, p_documento_nro: doc2,
    p_telefono: '2245-000001', p_rol_pedido: 'propietario', p_club_id: CLUB_DOLORES,
  });
  if (sol2) fx.solicitudes.push(sol2);

  // --- validaciones de rpc_solicitar_acceso -------------------------------
  const { error: eDni } = await sbP1.rpc('rpc_solicitar_acceso', {
    p_nombre: 'X', p_apellido: 'Y', p_documento_nro: '12.345.678',
    p_telefono: '1', p_rol_pedido: 'propietario', p_club_id: CLUB_DOLORES,
  });
  check('P0b', !!eDni && /DNI/i.test(eDni.message),
    'rechaza un DNI con formato inválido', eDni?.message);

  const { error: eDup } = await sbP1.rpc('rpc_solicitar_acceso', {
    p_nombre: 'X', p_apellido: 'Y', p_documento_nro: doc1,
    p_telefono: '1', p_rol_pedido: 'propietario', p_club_id: CLUB_DOLORES,
  });
  check('P0c', !!eDup, 'una cuenta no puede enviar dos solicitudes', eDup?.message);

  // --- P1-P5: el pendiente no lee NADA ------------------------------------
  const vacio = async (tabla) => {
    const { data } = await sbP1.from(tabla).select('id').limit(5);
    return (data?.length ?? 0) === 0;
  };
  check('P1', (await vacio('propietarios')) && (await vacio('profesionales')) && (await vacio('spcs')),
    'no lee propietarios / profesionales / spcs');
  check('P2', (await vacio('reuniones')) && (await vacio('carreras')) && (await vacio('inscripciones'))
             && (await vacio('caballerizas')) && (await vacio('resultados')),
    'no lee reuniones / carreras / inscripciones / caballerizas / resultados');
  check('P3', (await vacio('liquidaciones')) && (await vacio('recibos')) && (await vacio('liquidacion_detalle')),
    'no lee liquidaciones / recibos / liquidacion_detalle');
  check('P4', await vacio('usuarios'), 'no lee usuarios (no tiene fila propia)');
  check('P5', (await vacio('performances')) && (await vacio('sanciones')),
    'no lee performances / sanciones (cerrado en el Gate 1)');

  // --- P6-P7: el pendiente no escribe -------------------------------------
  await sbP1.from('usuarios').insert({
    email: `colado-${RUN}@sgh-probe.invalid`, club_id: CLUB_DOLORES,
    rol: 'secretario_carreras', activo: true, password_hash: '',
  });
  const { data: colUsr } = await admin.from('usuarios').select('id')
    .eq('email', `colado-${RUN}@sgh-probe.invalid`);
  check('P6', (colUsr?.length ?? 0) === 0, 'no puede crearse una fila en usuarios',
    `filas coladas=${colUsr?.length}`);

  const { data: snapPropC } = await admin.from('propietarios').select('nombre').eq('id', propC).single();
  await sbP1.from('propietarios').update({ nombre: `HACKEADO-${RUN}` }).eq('id', propC);
  const { data: postPropC } = await admin.from('propietarios').select('nombre').eq('id', propC).single();
  check('P7', postPropC?.nombre === snapPropC?.nombre,
    'no puede modificar una ficha de propietario', `nombre=${postPropC?.nombre}`);

  // --- P8-P9: su solicitud, y sólo la suya --------------------------------
  const { data: misSol } = await sbP1.from('solicitudes_acceso').select('id, estado');
  check('P8', (misSol?.length ?? 0) === 1 && misSol[0].id === sol1,
    've exactamente 1 solicitud: la suya', `filas=${misSol?.length}`);
  check('P11', !(misSol ?? []).some((s) => s.id === sol2),
    'NO ve la solicitud de otra cuenta pendiente');

  await sbP1.from('solicitudes_acceso').update({ estado: 'aprobada' }).eq('id', sol1);
  const { data: postSol } = await admin.from('solicitudes_acceso').select('estado').eq('id', sol1).single();
  check('P9', postSol?.estado === 'pendiente',
    'no puede auto-aprobarse editando la fila', `estado=${postSol?.estado}`);

  // --- P10: tampoco por la RPC --------------------------------------------
  const { error: eAprSelf } = await sbP1.rpc('rpc_aprobar_solicitud', {
    p_solicitud_id: sol1, p_entidad_tipo: 'propietario', p_entidad_id: propC,
  });
  check('P10', !!eAprSelf && /autorizado|secretar/i.test(eAprSelf.message),
    'rpc_aprobar_solicitud rechaza a quien no es staff', eAprSelf?.message);

  const { error: eRechSelf } = await sbP1.rpc('rpc_rechazar_solicitud', {
    p_solicitud_id: sol1, p_motivo: 'me auto-rechazo',
  });
  check('P10b', !!eRechSelf, 'rpc_rechazar_solicitud rechaza a quien no es staff',
    eRechSelf?.message);

  // --- P12: el staff aprueba, y la ficha queda tomada ----------------------
  const { data: usrNuevo, error: eApr } = await sbStaff.rpc('rpc_aprobar_solicitud', {
    p_solicitud_id: sol1, p_entidad_tipo: 'propietario', p_entidad_id: propC,
    p_copiar_documento: true,
  });
  check('P12', !eApr && !!usrNuevo, 'el staff SÍ puede aprobar', eApr?.message ?? `usuario=${usrNuevo}`);
  if (usrNuevo) fx.usuarios.push(pend1.email);

  const { data: solPost } = await admin.from('solicitudes_acceso')
    .select('estado, resuelta_por, resuelta_at').eq('id', sol1).single();
  check('P12b', solPost?.estado === 'aprobada' && !!solPost?.resuelta_por && !!solPost?.resuelta_at,
    'la aprobación deja estado, resuelta_por y resuelta_at', `estado=${solPost?.estado}`);

  const { data: usrCreado } = await admin.from('usuarios')
    .select('rol, activo, entidad_tipo, entidad_id, club_id').eq('email', pend1.email).single();
  check('P12c',
    usrCreado?.rol === 'propietario' && usrCreado?.activo === true
    && usrCreado?.entidad_tipo === 'propietario' && usrCreado?.entidad_id === propC
    && usrCreado?.club_id === CLUB_DOLORES,
    'la fila de usuarios queda con rol explícito, activa y vinculada',
    JSON.stringify(usrCreado));

  // El DNI declarado se copió a la ficha, que lo tenía vacío.
  const { data: propCPost } = await admin.from('propietarios')
    .select('documento_nro').eq('id', propC).single();
  check('P12d', propCPost?.documento_nro === doc1,
    'copia el DNI declarado a la ficha que lo tenía vacío', `doc=${propCPost?.documento_nro}`);

  // Segunda cuenta contra LA MISMA ficha → tiene que fallar por ux_entidad_una_cuenta.
  const { error: eApr2 } = await sbStaff.rpc('rpc_aprobar_solicitud', {
    p_solicitud_id: sol2, p_entidad_tipo: 'propietario', p_entidad_id: propC,
  });
  check('P13', !!eApr2 && /ya está vinculada/i.test(eApr2.message),
    'dos cuentas NO pueden quedar vinculadas a la misma ficha', eApr2?.message);

  const { data: sol2Post } = await admin.from('solicitudes_acceso').select('estado').eq('id', sol2).single();
  check('P13b', sol2Post?.estado === 'pendiente',
    'la solicitud rechazada por ficha tomada queda pendiente, no a medias',
    `estado=${sol2Post?.estado}`);

  // --- descartar: los curiosos, sin motivo y sin avisar -------------------
  const { error: eDesc } = await sbStaff.rpc('rpc_descartar_solicitud', { p_solicitud_id: sol2 });
  const { data: sol2Desc } = await admin.from('solicitudes_acceso').select('estado').eq('id', sol2).single();
  check('P14', !eDesc && sol2Desc?.estado === 'descartada',
    'el staff descarta una solicitud de curioso', eDesc?.message ?? `estado=${sol2Desc?.estado}`);

  const { error: eDesc2 } = await sbStaff.rpc('rpc_descartar_solicitud', { p_solicitud_id: sol2 });
  check('P15', !!eDesc2 && /ya fue resuelta/i.test(eDesc2.message),
    'no se puede resolver dos veces la misma solicitud', eDesc2?.message);

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
