/**
 * probe_invite_user.mjs — Edge Function `invite-user` (alta por invitación cerrada).
 *
 * Cubre los 6 casos de la etapa (a) de docs/plan_alta_invitacion.md:
 *
 *   1) 200 feliz            → invitación aceptada; fila en usuarios con
 *                             estado='pendiente', activo=false, club_id correcto.
 *   2) 401 sin token        → sin header Authorization.
 *   3) 403 rol operador     → caller autenticado pero sin permiso de invitar.
 *   4) 403 club ajeno       → secretario_carreras apuntando a OTRO club.
 *                             Verifica ADEMÁS que NO se creó nada (ni fila en
 *                             usuarios, ni cuenta en Auth). Es el test de
 *                             escalada de privilegios: el más importante.
 *   5) 409 repetido         → mismo email, sin `reinvitar`.
 *   6) 422 rol inválido     → rol fuera del enum rol_usuario.
 *
 * Sumado en la etapa (b):
 *   7) reinvitación doble   → invitar 2 veces con `reinvitar:true` sobre un
 *                             usuario que existe SIN confirmar, para ver qué
 *                             hace GoTrue de verdad (la §2.4 lo asume, no lo
 *                             verifica). Afirma los invariantes que valen sí o
 *                             sí (1 sola fila, sigue pendiente/inactivo) y
 *                             REPORTA la respuesta real para decidir con el
 *                             dato a la vista.
 *
 * ---------------------------------------------------------------------------
 * NO corre hasta que la función esté deployada (etapa (a)). Queda listo.
 * ---------------------------------------------------------------------------
 *
 * TODO se lee de env vars. Nada hardcodeado (el repo es público):
 *
 *   INVITE_FN_URL          URL de la función.
 *                          ej: https://<ref>.supabase.co/functions/v1/invite-user
 *   SUPABASE_URL           URL del proyecto.
 *   SUPABASE_PUBLISHABLE_KEY  key publishable (pública) — para signInWithPassword.
 *   SUPABASE_SECRET_KEY    key secreta server-side — para provisionar fixtures,
 *                          verificar la DB y limpiar. NUNCA commitear.
 *   INVITE_TEST_EMAIL      casilla REAL y controlada que recibe la invitación
 *                          del caso 1. Tiene que ser EXTERNA a la organización
 *                          de Supabase (§3.2 del plan: si el mailer sólo entrega
 *                          a miembros de la org, el síntoma es silencioso).
 *
 * Env OPCIONALES:
 *   INVITE_KEEP_TEST_USER=1   NO borra el invitado de INVITE_TEST_EMAIL en el
 *                             cleanup. Se usa cuando el mail de invitación se va
 *                             a abrir a mano para probar el flujo completo por
 *                             reset-password.html (test end-to-end de la etapa
 *                             (b)): si el probe lo borra, el link muere. Los
 *                             fixtures .invalid se limpian igual.
 *   INVITE_REINVITACIONES=N   Reinvitaciones del caso 7. Default 1.
 *                             Cada una CONSUME UN EMAIL de la cuota horaria, que
 *                             en el mailer built-in de Supabase es de 2/hora en
 *                             total. Con el default (1) la corrida entera gasta
 *                             exactamente 2: el caso 1 + esta. Subirlo a 2 hace
 *                             que la última pegue contra el rate limit y vuelva
 *                             429 — lo cual es un resultado válido, pero deja de
 *                             medir lo que el caso 7 quiere medir.
 *
 * Uso:
 *   INVITE_FN_URL=... SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... \
 *   SUPABASE_SECRET_KEY=... INVITE_TEST_EMAIL=... \
 *   node tests/probe_invite_user.mjs
 *
 * ⚠️ ESCRIBE EN PROD. Crea 3 usuarios fixture (dominio .invalid, prefijo
 *    `probe-invite-`) y 1 invitado real, y los borra al final. El cleanup SÓLO
 *    toca emails que este probe creó en esta corrida — nunca datos ajenos.
 * ⚠️ CONSUME 2 EMAILS de la cuota horaria con los defaults: el caso 1 (feliz) y
 *    la reinvitación del caso 7.
 * ⚠️ El caso 1 responde 200 aunque el mail no se entregue. Comprobar RECEPCIÓN
 *    a mano en INVITE_TEST_EMAIL — eso el probe no lo puede verificar.
 * ⚠️ Si el caso 7 llega a reenviar, la casilla recibe DOS invitaciones. Vale la
 *    ÚLTIMA: GoTrue rota el token en cada invitación.
 */
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`FALTA env: ${name}`);
    process.exit(2);
  }
  return v;
}

const FN_URL          = requireEnv('INVITE_FN_URL');
const SUPABASE_URL    = requireEnv('SUPABASE_URL');
const PUBLISHABLE_KEY = requireEnv('SUPABASE_PUBLISHABLE_KEY');
const SECRET_KEY      = requireEnv('SUPABASE_SECRET_KEY');
const TEST_EMAIL      = requireEnv('INVITE_TEST_EMAIL').trim().toLowerCase();

// Opcionales — ver el encabezado.
const KEEP_TEST_USER  = process.env.INVITE_KEEP_TEST_USER === '1';
const REINVITACIONES  = Math.max(0, Number(process.env.INVITE_REINVITACIONES ?? 1) || 0);

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Reintentos por el fallo de plataforma "kid <nil> ES256"  (23/07/2026)
// ---------------------------------------------------------------------------
// Medido contra prod ese día: los endpoints ADMIN de GoTrue rechazan ~20-35% de
// las llamadas con
//   403 invalid JWT: ... unrecognized JWT kid <nil> for algorithm ES256
// de forma intermitente, con la misma secret key que en la llamada anterior
// funcionó. NO es de este código:
//   · PostgREST con esa misma key: 20/20 OK.
//   · GoTrue por el camino anon (settings, signInWithPassword): 12/12 OK.
//   · Sólo falla secret key → endpoints admin de GoTrue.
// Es la traducción `sb_secret_` → JWT de service_role del gateway, que a veces
// emite un token que GoTrue no sabe verificar.
//
// Sin reintentos el probe no mide NADA: se cae armando los fixtures. Se reintenta
// SÓLO esta firma de error — cualquier otro error se propaga tal cual, para no
// tapar un bug real.
const ES_KID_NIL = (msg) => /unrecognized JWT kid/i.test(String(msg ?? ''));

async function reintentar(label, fn, intentos = 12) {
  for (let i = 1; i <= intentos; i++) {
    const { data, error } = await fn();
    if (!error) return data;
    if (!ES_KID_NIL(error.message)) throw new Error(`${label}: ${error.message}`);
    if (i === intentos) throw new Error(`${label}: ${intentos} intentos, todos "kid <nil> ES256"`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------
let ok = 0, fail = 0;
function check(cond, label, extra) {
  if (cond) { ok++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${extra ? `  → ${extra}` : ''}`); }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const RUN = Math.random().toString(36).slice(2, 8);
const PASS = `Probe-${RUN}-${Math.random().toString(36).slice(2, 10)}!`;
// Dominio .invalid (RFC 2606): formato válido, jamás entregable. Estos usuarios
// se crean con createUser + email_confirm, así que NO se manda ningún mail.
const fixEmail = (rol) => `probe-invite-${rol}-${RUN}@sgh-probe.invalid`;

const EMAIL_SUPER  = fixEmail('super');
const EMAIL_OPER   = fixEmail('operador');
const EMAIL_SECRE  = fixEmail('secretario');
// Destinatarios de los casos negativos: nunca se llega a invitarlos, pero si
// alguno apareciera en la DB sería exactamente el bug que buscamos.
const EMAIL_DEST_AJENO   = `probe-invite-dest-ajeno-${RUN}@sgh-probe.invalid`;
const EMAIL_DEST_ROLBAD  = `probe-invite-dest-rolbad-${RUN}@sgh-probe.invalid`;
const EMAIL_DEST_OPER    = `probe-invite-dest-oper-${RUN}@sgh-probe.invalid`;

const creados = { auth: [], usuarios: [] };

async function crearFixture(email, rol, clubId) {
  const data = await reintentar(`createUser(${rol})`, () => admin.auth.admin.createUser({
    email, password: PASS, email_confirm: true,
  }));
  creados.auth.push(data.user.id);

  const { error: insErr } = await admin.from('usuarios').insert({
    email,
    nombre_completo: `Probe ${rol} ${RUN}`,
    club_id: clubId,
    rol,
    activo: true,
    estado: 'activo',
    password_hash: '',
  });
  if (insErr) throw new Error(`insert usuarios(${rol}): ${insErr.message}`);
  creados.usuarios.push(email);
}

async function tokenDe(email) {
  const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PASS });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return data.session.access_token;
}

// ---------------------------------------------------------------------------
// Llamada a la función
// ---------------------------------------------------------------------------
// La función también come el fallo "kid <nil>" de plataforma, porque usa los
// mismos endpoints admin de GoTrue. Se reintenta SÓLO en los códigos que la
// función devuelve ANTES de llamar a inviteUserByEmail — o sea, donde es seguro
// que NO se mandó ningún mail y no se escribió nada:
//
//   caller_lookup_failed / dest_lookup_failed → lookups previos
//   auth_lookup_failed / auth_scan_truncado   → escaneo de Auth previo
//
// `invite_failed` NO está en la lista a propósito: ahí ya se llamó a GoTrue y no
// se puede afirmar que el mail no salió. Reintentarlo podría mandar dos mails y
// quemar la cuota horaria. Si aparece, se reporta y listo.
const REINTENTABLES_PRE_MAIL = new Set([
  'caller_lookup_failed', 'dest_lookup_failed', 'auth_lookup_failed', 'auth_scan_truncado',
]);

async function invitarUnaVez(token, body) {
  const headers = { 'content-type': 'application/json', apikey: PUBLISHABLE_KEY };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(FN_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  let payload = null;
  try { payload = await res.json(); } catch { /* la plataforma puede no devolver JSON */ }
  return { status: res.status, payload };
}

async function invitar(token, body, intentos = 10) {
  let ultima;
  for (let i = 1; i <= intentos; i++) {
    ultima = await invitarUnaVez(token, body);
    if (ultima.status !== 500 || !REINTENTABLES_PRE_MAIL.has(ultima.payload?.code)) return ultima;
    if (i < intentos) await new Promise((r) => setTimeout(r, 250));
  }
  return ultima;
}

// ---------------------------------------------------------------------------
// Lecturas de verificación (con la key secreta, bypassa RLS)
// ---------------------------------------------------------------------------
const ilikeLiteral = (s) => s.replace(/([\\%_])/g, '\\$1');

// Todas las filas cuyo email matchea EXACTO (post-normalización). Devuelve el
// array entero a propósito: el caso 7 necesita poder afirmar "hay exactamente
// una", que es distinto de "encontré una".
async function filasUsuario(email) {
  const { data, error } = await admin
    .from('usuarios')
    .select('id, email, rol, club_id, activo, estado')
    .ilike('email', ilikeLiteral(email))
    .limit(10);
  if (error) throw new Error(`select usuarios(${email}): ${error.message}`);
  return (data ?? []).filter((r) => String(r.email).toLowerCase() === email);
}

async function filaUsuario(email) {
  return (await filasUsuario(email))[0] ?? null;
}

async function authUser(email) {
  for (let page = 1; page <= 25; page++) {
    const data = await reintentar('listUsers', () => admin.auth.admin.listUsers({ page, perPage: 200 }));
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cleanup — SÓLO lo que creó esta corrida
// ---------------------------------------------------------------------------
async function cleanup() {
  console.log('\n— Cleanup —');

  // El invitado real se conserva cuando alguien va a abrir el mail y completar
  // el flujo a mano: borrarlo invalidaría el link de la invitación.
  const emailsABorrar = KEEP_TEST_USER ? [...creados.usuarios] : [...creados.usuarios, TEST_EMAIL];
  for (const email of emailsABorrar) {
    const { error } = await admin.from('usuarios').delete().ilike('email', ilikeLiteral(email));
    if (error) console.error(`  ⚠️ delete usuarios ${email}: ${error.message}`);
  }

  // El invitado del caso 1 se creó en Auth por la función, no por nosotros.
  const invitado = KEEP_TEST_USER ? null : await authUser(TEST_EMAIL).catch(() => null);
  const ids = [...creados.auth, ...(invitado ? [invitado.id] : [])];
  for (const id of ids) {
    // Con reintentos: si no, el fallo de plataforma deja fixtures colgados en Auth.
    await reintentar(`deleteUser ${id}`, () => admin.auth.admin.deleteUser(id))
      .catch((e) => console.error(`  ⚠️ ${e.message}`));
  }

  console.log(`  limpiados: ${emailsABorrar.length} filas usuarios, ${ids.length} auth users`);
  if (KEEP_TEST_USER) {
    console.log(`  ⏸️  CONSERVADO a propósito: ${TEST_EMAIL} (fila usuarios + cuenta Auth).`);
    console.log('     Teardown pendiente cuando termine la prueba manual del flujo.');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log(`\n=== probe_invite_user  (run ${RUN}) ===`);
console.log(`fn: ${FN_URL}`);

let exitCode = 0;
try {
  // -- Dos clubes distintos: uno para el caller secretario, otro "ajeno".
  const { data: clubs, error: clubsErr } = await admin
    .from('clubs').select('id, nombre').order('created_at', { ascending: true }).limit(5);
  if (clubsErr) throw new Error(`select clubs: ${clubsErr.message}`);
  if (!clubs || clubs.length < 2) {
    throw new Error(`se necesitan ≥2 clubs para el caso "club ajeno"; hay ${clubs?.length ?? 0}`);
  }
  const CLUB_A = clubs[0].id;   // club del caller secretario
  const CLUB_B = clubs[1].id;   // club ajeno
  console.log(`club propio: ${clubs[0].nombre}\nclub ajeno:  ${clubs[1].nombre}\n`);

  // -- Fixtures de callers
  await crearFixture(EMAIL_SUPER, 'super_admin', CLUB_A);
  await crearFixture(EMAIL_OPER,  'operador',    CLUB_A);
  await crearFixture(EMAIL_SECRE, 'secretario_carreras', CLUB_A);

  const tokSuper = await tokenDe(EMAIL_SUPER);
  const tokOper  = await tokenDe(EMAIL_OPER);
  const tokSecre = await tokenDe(EMAIL_SECRE);

  // =========================================================================
  // Caso 2 — 401 sin token   (primero: no escribe nada, y valida el endpoint)
  // =========================================================================
  console.log('\n[2] 401 — sin token');
  {
    const r = await invitar(null, {
      email: EMAIL_DEST_OPER, nombre_completo: 'Sin Token', rol: 'operador',
    });
    // Si la función quedó con verify_jwt=true, el 401 lo devuelve la plataforma
    // (body distinto). Sólo se asegura el status.
    check(r.status === 401, 'status 401', `recibido ${r.status}`);
  }

  // =========================================================================
  // Caso 3 — 403 caller con rol operador
  // =========================================================================
  console.log('\n[3] 403 — caller rol operador');
  {
    const r = await invitar(tokOper, {
      email: EMAIL_DEST_OPER, nombre_completo: 'Rechazado', rol: 'operador',
    });
    check(r.status === 403, 'status 403', `recibido ${r.status}`);
    check(r.payload?.code === 'rol_caller_no_autorizado',
      'code = rol_caller_no_autorizado', JSON.stringify(r.payload));
    check(await filaUsuario(EMAIL_DEST_OPER) === null, 'no se creó fila en usuarios');
    check(await authUser(EMAIL_DEST_OPER) === null, 'no se creó cuenta en Auth');
  }

  // =========================================================================
  // Caso 4 — 403 club ajeno  (ESCALADA DE PRIVILEGIOS — el más importante)
  // =========================================================================
  console.log('\n[4] 403 — secretario_carreras invitando a un club ajeno');
  {
    const r = await invitar(tokSecre, {
      email: EMAIL_DEST_AJENO,
      nombre_completo: 'Escalada Horizontal',
      rol: 'operador',
      club_id: CLUB_B,             // ← club que NO es el suyo
    });
    check(r.status === 403, 'status 403', `recibido ${r.status}`);
    check(r.payload?.code === 'club_ajeno', 'code = club_ajeno', JSON.stringify(r.payload));

    // Lo esencial: NO se escribió NADA en ningún lado.
    const fila = await filaUsuario(EMAIL_DEST_AJENO);
    check(fila === null, 'no se creó fila en usuarios',
      fila ? `apareció con club_id=${fila.club_id}` : '');
    check(await authUser(EMAIL_DEST_AJENO) === null, 'no se creó cuenta en Auth');
  }

  // Variante: el mismo caller intentando otorgar un rol que no puede (super_admin).
  console.log('\n[4b] 403 — secretario_carreras intentando crear un super_admin');
  {
    const r = await invitar(tokSecre, {
      email: EMAIL_DEST_AJENO, nombre_completo: 'Escalada Vertical', rol: 'super_admin',
    });
    check(r.status === 403, 'status 403', `recibido ${r.status}`);
    check(r.payload?.code === 'rol_no_invitable', 'code = rol_no_invitable', JSON.stringify(r.payload));
    check(await filaUsuario(EMAIL_DEST_AJENO) === null, 'no se creó fila en usuarios');
  }

  // =========================================================================
  // Caso 6 — 422 rol fuera del enum   (antes del 200: no consume mail)
  // =========================================================================
  console.log('\n[6] 422 — rol inválido');
  {
    const r = await invitar(tokSuper, {
      email: EMAIL_DEST_ROLBAD,
      nombre_completo: 'Rol Inexistente',
      rol: 'director_tecnico',      // no está en rol_usuario
      club_id: CLUB_A,
    });
    check(r.status === 422, 'status 422', `recibido ${r.status}`);
    check(r.payload?.code === 'rol_invalido', 'code = rol_invalido', JSON.stringify(r.payload));
    check(await filaUsuario(EMAIL_DEST_ROLBAD) === null, 'no se creó fila en usuarios');
  }

  // =========================================================================
  // Caso 1 — 200 feliz   (ÚNICO caso que manda un mail real)
  // =========================================================================
  console.log('\n[1] 200 — invitación feliz');
  {
    const r = await invitar(tokSecre, {
      email: TEST_EMAIL,
      nombre_completo: 'Invitado De Prueba',
      rol: 'operador',
      telefono: '+5492245000000',
      // club_id omitido a propósito: para 'propio' lo resuelve la función.
    });
    check(r.status === 200, 'status 200', `recibido ${r.status} ${JSON.stringify(r.payload)}`);
    check(r.payload?.ok === true, 'ok = true');
    check(r.payload?.estado === 'invitado', 'estado = invitado');
    check(r.payload?.email === TEST_EMAIL, 'email normalizado en la respuesta');
    check(r.payload?.ya_existia === false, 'ya_existia = false');

    const fila = await filaUsuario(TEST_EMAIL);
    check(fila !== null, 'fila creada en public.usuarios');
    if (fila) {
      check(fila.estado === 'pendiente', `estado = 'pendiente'`, `es '${fila.estado}'`);
      check(fila.activo === false, 'activo = false', `es ${fila.activo}`);
      check(fila.rol === 'operador', `rol = 'operador'`, `es '${fila.rol}'`);
      // club_id = el DEL CALLER, no el del body (que ni se mandó).
      check(String(fila.club_id) === String(CLUB_A),
        'club_id = el del caller (no el del body)', `es ${fila.club_id}`);
      check(String(fila.email) === TEST_EMAIL, 'email guardado en lowercase');
    }

    const au = await authUser(TEST_EMAIL);
    check(au !== null, 'cuenta creada en Auth');
    check(au ? !au.email_confirmed_at : false,
      'la cuenta de Auth queda SIN confirmar hasta que acepte');

    console.log(`  ℹ️  verificar A MANO que llegó el mail a ${TEST_EMAIL}`);
    console.log('     (la API responde 200 aunque la entrega falle — §3.2 del plan)');
  }

  // =========================================================================
  // Caso 5 — 409 repetido sin reinvitar
  // =========================================================================
  console.log('\n[5] 409 — mismo email, sin reinvitar');
  {
    const r = await invitar(tokSecre, {
      email: TEST_EMAIL.toUpperCase(),   // además prueba la normalización
      nombre_completo: 'Invitado De Prueba',
      rol: 'operador',
    });
    check(r.status === 409, 'status 409', `recibido ${r.status}`);
    check(r.payload?.code === 'ya_existe', 'code = ya_existe', JSON.stringify(r.payload));
  }

  // =========================================================================
  // Caso 7 — reinvitación doble (etapa (b))
  //
  // Qué se está averiguando: qué hace GoTrue DE VERDAD cuando se llama
  // inviteUserByEmail dos veces sobre un usuario que existe pero NO confirmó.
  // La §2.4 del plan asume que reenvía y genera un link nuevo, pero eso no está
  // verificado contra la implementación real: algunas versiones responden
  // "User already registered" incluso sin confirmar, y ahí el camino de
  // reinvitación del plan se cae y hay que usar generateLink / resend.
  //
  // Por eso este caso NO afirma un happy path: afirma el invariante que tiene
  // que valer sí o sí (no se duplica la fila, no se activa sola) y REPORTA lo
  // que respondió GoTrue para que Leo decida con el dato a la vista.
  //
  // ⚠️ CONSUME UN EMAIL por reinvitación (INVITE_REINVITACIONES, default 1).
  // =========================================================================
  console.log(`\n[7] reinvitación — comportamiento real de GoTrue (x${REINVITACIONES})`);
  {
    const antes = await filaUsuario(TEST_EMAIL);

    const respuestas = [];
    for (let i = 1; i <= REINVITACIONES; i++) {
      const r = await invitar(tokSecre, {
        email: TEST_EMAIL,
        nombre_completo: 'Invitado De Prueba',
        rol: 'operador',
        reinvitar: true,
      });
      respuestas.push([`#${i}`, r]);
      console.log(`  ℹ️  reinvitación #${i} → HTTP ${r.status} ${JSON.stringify(r.payload)}`);
    }

    // Invariante 1: la respuesta nunca es un 500 sin diagnóstico. Puede ser 200
    // (reenvió) o 409 auth_ya_registrado (GoTrue se plantó) — las dos son
    // información útil; un 500 mudo no.
    for (const [n, r] of respuestas) {
      check(r.status !== 500 || !!r.payload?.code,
        `reinvitación ${n}: si falla, falla con un code identificable`,
        `HTTP ${r.status} ${JSON.stringify(r.payload)}`);
    }

    // Invariante 2 (el que importa): no se duplicó la fila en public.usuarios.
    const filas = await filasUsuario(TEST_EMAIL);
    check(filas.length === 1, 'sigue habiendo EXACTAMENTE 1 fila en usuarios',
      `hay ${filas.length}`);

    // Invariante 3: reinvitar NO activa al usuario. La activación es de
    // reset-password.html cuando el invitado fija la contraseña (§4.1).
    const fila = filas[0] ?? null;
    if (fila) {
      check(fila.activo === false, 'sigue activo=false', `es ${fila.activo}`);
      check(fila.estado === 'pendiente', `sigue estado='pendiente'`, `es '${fila.estado}'`);
      check(String(fila.id) === String(antes?.id ?? fila.id),
        'es la MISMA fila (no se borró y recreó)');
    }

    // Invariante 4: la cuenta de Auth sigue sin confirmar y es la misma.
    const au = await authUser(TEST_EMAIL);
    check(au !== null, 'la cuenta de Auth sigue existiendo');
    check(au ? !au.email_confirmed_at : false, 'sigue SIN confirmar');

    const todasOk = respuestas.length > 0 && respuestas.every(([, r]) => r.status === 200);
    if (todasOk) {
      console.log('  ✅ GoTrue reenvía la invitación de un usuario sin confirmar (§2.4 confirmada).');
      console.log('     La casilla recibió MÁS DE UNA invitación: vale la ÚLTIMA (el token rota).');
    } else {
      console.log('  ⚠️  GoTrue NO reenvía por esta vía. §2.4 del plan necesita revisión:');
      console.log('      evaluar admin.generateLink({type:"invite"}) o auth.resend() para el reenvío.');
    }
  }

} catch (e) {
  console.error(`\n💥 ${e.message}`);
  exitCode = 2;
} finally {
  await cleanup().catch((e) => console.error(`  ⚠️ cleanup: ${e.message}`));
}

console.log(`\n=== ${ok} OK · ${fail} FAIL ===`);
process.exit(exitCode || (fail > 0 ? 1 : 0));
