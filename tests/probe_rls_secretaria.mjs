/**
 * probe_rls_secretaria.mjs — EL CANARIO.
 *
 * Afirma que una cuenta de SECRETARÍA conserva todo lo que necesita para
 * trabajar. Es el probe que decide si una fase de endurecimiento de RLS se
 * revierte: si esto se pone rojo, la secretaría no puede operar y hay que
 * volver atrás sin discutir.
 *
 * Contexto: SEC_RLS_FASE0. Sistema en producción, carga de R8 proyectada
 * ~08/08. Romper el SELECT de la secretaría es peor que dejar un hueco una
 * semana más.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_rls_secretaria.mjs
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ NO USA service_role
 * ---------------------------------------------------------------------------
 * `service_role` BYPASEA RLS. Un probe de RLS que corra con esa key no prueba
 * absolutamente nada: pasa siempre, con las policies abiertas o cerradas.
 *
 * Este probe crea un usuario FIXTURE de secretaría, se loguea con la
 * publishable key (rol `authenticated`, igual que el browser) y corre todas
 * las assertions con ESE cliente. La key secreta se usa sólo para tres cosas:
 * crear/borrar el fixture, snapshotear, y VERIFICAR en la DB lo que el
 * cliente autenticado escribió o no escribió.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ UN FIXTURE Y NO dolores@sgh.com
 * ---------------------------------------------------------------------------
 * Las policies no miran QUÉ usuario de secretaría es: resuelven club vía
 * fn_get_user_club_id(). Un fixture con rol='secretario_carreras' y el club de
 * Dolores recorre exactamente los mismos caminos, sin tocar la cuenta real ni
 * mandarle magic links a una casilla de verdad.
 *
 * ---------------------------------------------------------------------------
 * COMPATIBILIDAD CON LA FASE 1 (identidad por auth.uid())
 * ---------------------------------------------------------------------------
 * En FASE 1, fn_get_user_club_id() pasa a resolver por `usuarios.auth_user_id`
 * en lugar del email. El fixture DETECTA si la columna existe y la puebla. Sin
 * eso, después de la fase 1 este probe daría rojo por un defecto del propio
 * probe y no por una regresión real — el peor resultado posible en un canario.
 *
 * ---------------------------------------------------------------------------
 * SEGURIDAD DE LOS DATOS
 * ---------------------------------------------------------------------------
 * · Ningún dato de persona real. Fixtures con dominio .invalid (RFC 2606).
 * · Las escrituras sobre filas REALES son snapshot → write → assert → restore,
 *   siempre en `finally`.
 * · Las escrituras destructivas (DELETE) NUNCA apuntan a datos reales: van
 *   contra filas fixture creadas por el propio probe.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
// Publishable key: pública por diseño, es la misma que sirve cada HTML del repo.
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';

const CLUB_DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const CLUB_AJENO   = 'a6da7e40-1515-45dc-8933-4eef33ce937a'; // Mi Club Hípico

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
let ok = 0, fail = 0;
const fallidos = [];
function check(cond, label, extra) {
  if (cond) { ok++; console.log(`  ✅ ${label}`); }
  else {
    fail++; fallidos.push(label);
    console.log(`  ❌ ${label}${extra ? `  → ${extra}` : ''}`);
  }
}
function info(msg) { console.log(`     ${msg}`); }

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const RUN  = Math.random().toString(36).slice(2, 8);
const PASS = `Probe-${RUN}-${Math.random().toString(36).slice(2, 10)}!`;
const EMAIL_SECRE = `probe-rls-secre-${RUN}@sgh-probe.invalid`;

const creado = { authId: null, usuarioEmail: null, liquidacionId: null };
const restaurar = [];   // [{tabla, id, campos:{}}]

async function columnaExiste(tabla, columna) {
  const { error } = await admin.from(tabla).select(columna).limit(1);
  return !error;
}

async function crearFixtureSecretaria() {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL_SECRE, password: PASS, email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  creado.authId = data.user.id;

  const fila = {
    email: EMAIL_SECRE,
    nombre_completo: `Probe secretaria ${RUN}`,
    club_id: CLUB_DOLORES,
    rol: 'secretario_carreras',
    activo: true,
    estado: 'activo',
    password_hash: '',
  };

  // FASE 1 forward-compat: si la columna ya existe, poblarla.
  const tieneAuthUserId = await columnaExiste('usuarios', 'auth_user_id');
  if (tieneAuthUserId) {
    fila.auth_user_id = creado.authId;
    info(`usuarios.auth_user_id existe → fixture vinculado a auth.users (${creado.authId.slice(0, 8)}…)`);
  } else {
    info('usuarios.auth_user_id NO existe todavía (pre-FASE 1) → identidad por email');
  }

  const { error: insErr } = await admin.from('usuarios').insert(fila);
  if (insErr) throw new Error(`insert usuarios: ${insErr.message}`);
  creado.usuarioEmail = EMAIL_SECRE;
}

// Auth del probe — NO por signInWithPassword.
// Desde el 04/08/2026 hay Attack Protection (Turnstile) activo y GoTrue
// rechaza grant_type=password con captcha_failed antes de mirar credenciales.
// /auth/v1/verify NO está gateado, así que se canjea un magiclink generado por
// Admin API (no manda mail, no gasta cuota).
async function sesionPorMagiclink(email, label) {
  const { data: link, error: eLink } =
    await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (eLink) throw new Error(`generateLink ${label}: ${eLink.message}`);
  const hashed = link?.properties?.hashed_token;
  if (!hashed) throw new Error(`generateLink ${label}: sin hashed_token`);

  const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await sb.auth.verifyOtp({ token_hash: hashed, type: 'magiclink' });
  if (error) throw new Error(`verifyOtp ${label}: ${error.message}`);
  return sb;
}

async function clienteSecretaria() {
  return sesionPorMagiclink(EMAIL_SECRE, 'secretaria');
}

async function teardown() {
  console.log('\n── teardown ──');
  for (const r of restaurar.reverse()) {
    const { error } = await admin.from(r.tabla).update(r.campos).eq('id', r.id);
    if (error) console.error(`  ⚠️  restore ${r.tabla}/${r.id}: ${error.message}`);
    else console.log(`  ↩︎  ${r.tabla}/${r.id.slice(0, 8)}… restaurado`);
  }
  if (creado.liquidacionId) {
    await admin.from('liquidacion_detalle').delete().eq('liquidacion_id', creado.liquidacionId);
    const { error } = await admin.from('liquidaciones').delete().eq('id', creado.liquidacionId);
    console.log(error ? `  ⚠️  liquidación fixture: ${error.message}` : '  🗑  liquidación fixture borrada');
  }
  if (creado.usuarioEmail) {
    // El trigger trg_audit_inscripciones deja filas en `auditoria` apuntando al
    // fixture, y auditoria_usuario_id_fkey bloquea el DELETE. Se anula el
    // usuario_id (la columna es nullable) en vez de borrar la entrada: el
    // registro de auditoría sobre una fila REAL no se destruye.
    const { data: u } = await admin.from('usuarios').select('id').eq('email', creado.usuarioEmail).maybeSingle();
    if (u?.id) {
      const { error: eAud } = await admin.from('auditoria').update({ usuario_id: null }).eq('usuario_id', u.id);
      if (eAud) console.error(`  ⚠️  auditoria: ${eAud.message}`);
    }
    const { error } = await admin.from('usuarios').delete().eq('email', creado.usuarioEmail);
    console.log(error ? `  ⚠️  usuarios: ${error.message}` : '  🗑  fila usuarios borrada');
  }
  if (creado.authId) {
    const { error } = await admin.auth.admin.deleteUser(creado.authId);
    console.log(error ? `  ⚠️  auth.users: ${error.message} (ver tests/teardown_probe_rls.sql)` : '  🗑  auth.users borrado');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log('\n════════════════════════════════════════════════════════════');
console.log(' probe_rls_secretaria — CANARIO de la secretaría');
console.log(`  run=${RUN}  club=Dolores`);
console.log('════════════════════════════════════════════════════════════\n');

try {
  console.log('── setup ──');
  await crearFixtureSecretaria();
  const sb = await clienteSecretaria();
  info(`fixture ${EMAIL_SECRE} logueado como rol=authenticated\n`);

  // -------------------------------------------------------------------------
  console.log('── S1. Lectura del programa ──');
  // -------------------------------------------------------------------------
  const { data: reuns, error: eReun } = await sb.from('reuniones')
    .select('id,numero,fecha,club_id').eq('club_id', CLUB_DOLORES);
  check(!eReun && (reuns?.length ?? 0) > 0,
    'S1.1 lee reuniones de su club', eReun?.message || `filas=${reuns?.length}`);
  info(`reuniones visibles: ${reuns?.length ?? 0}`);

  const { data: carrs, error: eCarr } = await sb.from('carreras').select('id,reunion_id').limit(50);
  check(!eCarr && (carrs?.length ?? 0) > 0,
    'S1.2 lee carreras', eCarr?.message || `filas=${carrs?.length}`);

  const { data: insc, error: eInsc } = await sb.from('inscripciones')
    .select('id,spc_id,estado,info_adicional,carrera_id').limit(50);
  check(!eInsc && (insc?.length ?? 0) > 0,
    'S1.3 lee inscripciones', eInsc?.message || `filas=${insc?.length}`);
  info(`inscripciones visibles: ${insc?.length ?? 0}`);

  // -------------------------------------------------------------------------
  console.log('\n── S2. Aislamiento entre clubes (prueba que RLS está VIVA) ──');
  // -------------------------------------------------------------------------
  const { data: ajenas } = await sb.from('reuniones').select('id').eq('club_id', CLUB_AJENO);
  check((ajenas?.length ?? 0) === 0,
    'S2.1 NO ve reuniones de otro club', `filas=${ajenas?.length}`);
  info('si esto falla, RLS no está filtrando y el resto del probe no significa nada');

  // -------------------------------------------------------------------------
  console.log('\n── S3. Escritura sobre inscripciones (snapshot→write→verify→restore) ──');
  // -------------------------------------------------------------------------
  const objetivo = insc?.[0];
  if (!objetivo) {
    check(false, 'S3.x sin inscripción para probar escritura', 'no hay filas');
  } else {
    restaurar.push({ tabla: 'inscripciones', id: objetivo.id, campos: { info_adicional: objetivo.info_adicional } });
    const marca = `probe-rls-${RUN}`;
    const { error: eUpd } = await sb.from('inscripciones')
      .update({ info_adicional: marca }).eq('id', objetivo.id);
    check(!eUpd, 'S3.1 UPDATE inscripciones sin error', eUpd?.message);

    // La trampa: un UPDATE bloqueado por RLS devuelve ÉXITO con 0 filas.
    // Se verifica el VALOR en la DB con el cliente admin, nunca el status.
    const { data: verif } = await admin.from('inscripciones')
      .select('info_adicional').eq('id', objetivo.id).single();
    check(verif?.info_adicional === marca,
      'S3.2 el UPDATE realmente persistió (verificado en DB)', `valor=${verif?.info_adicional}`);
  }

  // -------------------------------------------------------------------------
  console.log('\n── S4. Catálogos ──');
  // -------------------------------------------------------------------------
  const cat = async (tabla) => {
    const { data, error } = await sb.from(tabla).select('id').limit(5);
    return { n: data?.length ?? 0, error };
  };
  for (const t of ['spcs', 'propietarios', 'profesionales', 'caballerizas', 'categorias_carrera']) {
    const r = await cat(t);
    check(!r.error && r.n > 0, `S4 lee ${t}`, r.error?.message || `filas=${r.n}`);
  }

  // -------------------------------------------------------------------------
  console.log('\n── S5. Liquidaciones: leer y generar ──');
  // -------------------------------------------------------------------------
  const { data: liqs, error: eLiq } = await sb.from('liquidaciones')
    .select('id,club_id,estado').limit(20);
  check(!eLiq && (liqs?.length ?? 0) > 0,
    'S5.1 lee liquidaciones de su club', eLiq?.message || `filas=${liqs?.length}`);

  const { data: det, error: eDet } = await sb.from('liquidacion_detalle')
    .select('id,estado_linea,beneficiario_tipo').limit(20);
  check(!eDet && (det?.length ?? 0) > 0,
    'S5.2 lee liquidacion_detalle', eDet?.message || `filas=${det?.length}`);

  // Generar: INSERT real de una liquidación borrador (fixture, se borra después).
  const reunionParaLiq = reuns?.[0];
  if (reunionParaLiq) {
    const { data: nueva, error: eIns } = await sb.from('liquidaciones').insert({
      club_id: CLUB_DOLORES,
      reunion_id: reunionParaLiq.id,
      total_bruto: 0,
      total_descuentos: 0,
      estado: 'borrador',
      notas: `probe-rls-${RUN} — fixture, borrar`,
    }).select('id').single();
    check(!eIns && !!nueva?.id, 'S5.3 INSERT liquidación (generar)', eIns?.message);
    if (nueva?.id) {
      creado.liquidacionId = nueva.id;
      const { error: eDetIns } = await sb.from('liquidacion_detalle').insert({
        liquidacion_id: nueva.id,
        concepto: `probe-rls-${RUN}`,
        monto_bruto: 0,
        estado_linea: 'impago',
      });
      check(!eDetIns, 'S5.4 INSERT liquidacion_detalle', eDetIns?.message);
    }
  } else {
    check(false, 'S5.3 INSERT liquidación', 'sin reunión disponible');
  }

  // -------------------------------------------------------------------------
  console.log('\n── S6. Usuarios del club ──');
  // -------------------------------------------------------------------------
  const { data: usrs, error: eUsr } = await sb.from('usuarios')
    .select('id,email,rol,club_id');
  check(!eUsr && (usrs?.length ?? 0) > 1,
    'S6.1 lee usuarios de su club', eUsr?.message || `filas=${usrs?.length}`);
  info(`usuarios visibles: ${usrs?.length ?? 0} (incluye el fixture)`);
  info('NOTA: en FASE 2 paso 5 esto sigue igual para secretaría; sólo se acota al portal');

  // -------------------------------------------------------------------------
  console.log('\n── S7. Resultados ──');
  // -------------------------------------------------------------------------
  const { data: res, error: eRes } = await sb.from('resultados').select('id,estado').limit(10);
  check(!eRes, 'S7.1 lee resultados', eRes?.message);
  const { data: pos, error: ePos } = await sb.from('resultado_posiciones').select('id').limit(10);
  check(!ePos, 'S7.2 lee resultado_posiciones', ePos?.message);

} catch (err) {
  console.error(`\n💥 ERROR: ${err.message}`);
  fail++; fallidos.push(`excepción: ${err.message}`);
} finally {
  await teardown();
}

// ---------------------------------------------------------------------------
console.log('\n════════════════════════════════════════════════════════════');
console.log(` RESULTADO: ${ok} OK · ${fail} FAIL`);
if (fail) {
  console.log('\n ❌ CANARIO ROJO — la secretaría perdió capacidades.');
  console.log('    Si esto aparece después de aplicar una fase: ROLLBACK INMEDIATO.');
  for (const f of fallidos) console.log(`      · ${f}`);
} else {
  console.log('\n ✅ CANARIO VERDE — la secretaría conserva todo lo que necesita.');
}
console.log('════════════════════════════════════════════════════════════\n');
process.exit(fail ? 1 : 0);
