/**
 * probe_gate4_inscribir.mjs — Gate 4.3: rpc_inscribir + rpc_baja_inscripcion.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_gate4_inscribir.mjs
 *
 * ---------------------------------------------------------------------------
 * QUÉ PRUEBA
 * ---------------------------------------------------------------------------
 * Los 15 asserts de docs/AUTOREGISTRO_GATE_4.md §F.2. Los que importan de
 * verdad son los NEGATIVOS —G6 (caballo ajeno), G7/G8/G9/G10 (ventana),
 * G13/G14 (baja)—: son los que impiden anotar el caballo de otro, anotarse
 * tarde y borrar el trabajo de la secretaría.
 *
 * ---------------------------------------------------------------------------
 * LA TRAMPA — leer antes de tocar el archivo
 * ---------------------------------------------------------------------------
 * Un rechazo por RLS no da error: da éxito con 0 filas. Un RPC que lanza
 * EXCEPTION sí da error, pero el probe NO se conforma con eso: después de
 * cada intento que debe fallar, RELEE con el cliente ADMIN y afirma sobre
 * las FILAS QUE HAY, no sobre el status de la respuesta.
 *
 * ---------------------------------------------------------------------------
 * SEGURIDAD DE LOS DATOS
 * ---------------------------------------------------------------------------
 * · Reunión fixture 9995, fecha 2099. NO se toca R8 ni ninguna reunión real.
 * · Ningún dato de persona real: todo PROBE-* / .invalid.
 * · Teardown en `finally`, en orden de FK: resultado_posiciones →
 *   inscripciones → carreras → reuniones (GOTCHAS #12).
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
const resultados = [];
function check(id, cond, label, detalle) {
  resultados.push({ id, label, estado: cond ? 'PASS' : 'FAIL', detalle });
  console.log(`  ${cond ? '✅' : '❌'} ${id}. ${label}${!cond && detalle ? `  → ${detalle}` : ''}`);
}
function info(msg) { console.log(`     ${msg}`); }

const RUN  = Math.random().toString(36).slice(2, 8);
const PASS = `Probe-${RUN}-${Math.random().toString(36).slice(2, 10)}!`;
const mail = (q) => `probe-g4-${q}-${RUN}@sgh-probe.invalid`;

const fx = {
  authIds: [], usuarios: [], profesionales: [], caballerizas: [],
  spcs: [], reuniones: [], carreras: [], inscripciones: [],
};

const die = (ctx, err) => { throw new Error(`[${ctx}] ${err?.message ?? JSON.stringify(err)}`); };

async function ins(tabla, fila, bucket) {
  const { data, error } = await admin.from(tabla).insert(fila).select('id').single();
  if (error) die(`insert ${tabla}`, error);
  if (bucket) fx[bucket].push(data.id);
  return data.id;
}

// Sesión sin password: Turnstile bloquea grant_type=password, pero
// /auth/v1/verify no está gateado. Mismo patrón que probe_autoregistro_e2e.
async function clientePortal(email) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) die(`generateLink ${email}`, error);
  const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: e2 } = await sb.auth.verifyOtp({
    token_hash: link.properties.hashed_token, type: 'magiclink',
  });
  if (e2) die(`verifyOtp ${email}`, e2);
  return sb;
}

async function crearUsuarioPortal(q, profesionalId) {
  const email = mail(q);
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASS, email_confirm: true,
  });
  if (error) die(`createUser ${q}`, error);
  fx.authIds.push(data.user.id);

  const { data: uRow, error: e2 } = await admin.from('usuarios').insert({
    email,
    nombre_completo: `Probe G4 ${q} ${RUN}`,
    club_id: CLUB_DOLORES,
    rol: 'profesional',
    activo: true,
    estado: 'activo',
    password_hash: '',
    auth_user_id: data.user.id,
    entidad_tipo: 'profesional',
    entidad_id: profesionalId,
  }).select('id').single();
  if (e2) die(`insert usuarios ${q}`, e2);
  fx.usuarios.push(email);
  // inscripciones.inscripto_por es FK a usuarios(id), no a auth.users:
  // el probe compara contra ESE id, no contra el de auth.
  return { email, authId: data.user.id, usuarioId: uRow.id };
}

// Cuántas inscripciones hay de ese SPC en esa carrera, leído con ADMIN.
async function filasEn(carreraId, spcId) {
  const { data, error } = await admin.from('inscripciones')
    .select('id').eq('carrera_id', carreraId).eq('spc_id', spcId);
  if (error) die('relectura inscripciones', error);
  return data ?? [];
}

// Llamar al RPC y devolver {ok, id, msg} sin explotar.
async function inscribir(sb, spcId, carreraId) {
  const { data, error } = await sb.rpc('rpc_inscribir', {
    p_spc_id: spcId, p_carrera_id: carreraId,
  });
  return { ok: !error, id: data ?? null, msg: error?.message ?? null };
}
async function darDeBaja(sb, inscripcionId) {
  const { error } = await sb.rpc('rpc_baja_inscripcion', { p_inscripcion_id: inscripcionId });
  return { ok: !error, msg: error?.message ?? null };
}

// ===========================================================================
async function main() {
  console.log(`\n probe_gate4_inscribir — 21 asserts · run ${RUN}\n`);

  // --- lookups de contexto ---
  const { data: hip, error: eH } = await admin.from('hipodromos')
    .select('id').eq('club_id', CLUB_DOLORES).limit(1).single();
  if (eH) die('hipodromo', eH);
  const { data: cat, error: eC } = await admin.from('categorias_carrera')
    .select('id').eq('club_id', CLUB_DOLORES).limit(1).single();
  if (eC) die('categoria', eC);

  // --- entidades ---
  const profA = await ins('profesionales', {
    club_id: CLUB_DOLORES, tipo: 'entrenador',
    nombre: `PROBE-G4-A`, apellido: RUN, hipodromo_patente: 'DOL',
  }, 'profesionales');
  const profB = await ins('profesionales', {
    club_id: CLUB_DOLORES, tipo: 'entrenador',
    nombre: `PROBE-G4-B`, apellido: RUN, hipodromo_patente: 'DOL',
  }, 'profesionales');

  const cab = await ins('caballerizas', {
    club_id: CLUB_DOLORES, nombre: `PROBE-G4-CAB-${RUN}`, hipodromo_patente: 'DOL',
  }, 'caballerizas');

  // SPCs de A (machos, adultos) y uno de B.
  const nac = '2020-01-01';
  const spcA1 = await ins('spcs', {
    nombre: `PROBE-G4-A1-${RUN}`, fecha_nacimiento: nac, sexo: 'macho',
    estado: 'activo', entrenador_id: profA, caballeriza_id: cab,
  }, 'spcs');
  const spcA2 = await ins('spcs', {
    nombre: `PROBE-G4-A2-${RUN}`, fecha_nacimiento: nac, sexo: 'macho',
    estado: 'activo', entrenador_id: profA, caballeriza_id: cab,
  }, 'spcs');
  const spcB1 = await ins('spcs', {
    nombre: `PROBE-G4-B1-${RUN}`, fecha_nacimiento: nac, sexo: 'macho',
    estado: 'activo', entrenador_id: profB, caballeriza_id: cab,
  }, 'spcs');

  const uA = await crearUsuarioPortal('a', profA);
  const uB = await crearUsuarioPortal('b', profB);

  // --- reuniones fixture ---
  const reunPub = await ins('reuniones', {
    club_id: CLUB_DOLORES, hipodromo_id: hip.id, numero: 9995,
    fecha: '2099-03-01', estado: 'publicada',
  }, 'reuniones');
  const reunBorr = await ins('reuniones', {
    club_id: CLUB_DOLORES, hipodromo_id: hip.id, numero: 9994,
    fecha: '2099-03-02', estado: 'borrador',
  }, 'reuniones');

  const ayer   = new Date(Date.now() - 86400e3).toISOString();
  const manana = new Date(Date.now() + 86400e3).toISOString();
  const anteayer = new Date(Date.now() - 2 * 86400e3).toISOString();

  const carrera = (reunion, turno, extra) => ins('carreras', {
    reunion_id: reunion, numero_turno: turno, categoria_id: cat.id,
    distancia_metros: 1000, estado: 'abierta',
    apertura_inscripcion: ayer, cierre_inscripcion: manana,
    ...extra,
  }, 'carreras');

  const cAbierta   = await carrera(reunPub, 1);
  const cAbierta2  = await carrera(reunPub, 2);                                    // multi-categoría
  const cCerrada   = await carrera(reunPub, 3, { apertura_inscripcion: anteayer, cierre_inscripcion: ayer });
  const cSinVent   = await carrera(reunPub, 4, { apertura_inscripcion: null, cierre_inscripcion: null });
  const cAnulada   = await carrera(reunPub, 5, { estado: 'anulada' });
  const cHembras   = await carrera(reunPub, 6, { condicion_sexo: 'hembras' });
  const cBorrador  = await carrera(reunBorr, 1);

  const sbA = await clientePortal(uA.email);
  const sbB = await clientePortal(uB.email);

  // =========================================================================
  console.log('\n── Camino feliz ──');
  // =========================================================================
  const r1 = await inscribir(sbA, spcA1, cAbierta);
  const f1 = await filasEn(cAbierta, spcA1);
  if (r1.id) fx.inscripciones.push(r1.id);
  check('G1', r1.ok && f1.length === 1,
    'entrenador con tenencia inscribe su caballo con la ventana abierta',
    r1.msg ?? `filas=${f1.length}`);

  const row = f1[0]
    ? (await admin.from('inscripciones').select('*').eq('id', f1[0].id).single()).data
    : null;

  check('G2', row?.canal === 'portal' && row?.inscripto_por === uA.usuarioId && row?.estado === 'inscripto',
    'la fila nace con canal=portal, inscripto_por=usuarios.id del que llamó y estado=inscripto',
    `canal=${row?.canal} inscripto_por=${row?.inscripto_por === uA.usuarioId} estado=${row?.estado}`);

  check('G3', row?.entrenador_id === profA && row?.caballeriza_id === cab,
    'entrenador_id = el que inscribe; caballeriza_id copiada del SPC',
    `entrenador=${row?.entrenador_id === profA} caballeriza=${row?.caballeriza_id === cab}`);
  // propietario_id lo pone el trigger a partir de los responsables de la
  // caballeriza. La caballeriza fixture no tiene responsables, así que acá
  // queda NULL — eso NO es un fallo del RPC. Se informa, no se assertea:
  // afirmarlo verde exigiría montar caballeriza_responsables de mentira.
  info(`propietario_id que dejó el trigger: ${row?.propietario_id ?? 'NULL'} (fixture sin responsables)`);

  // =========================================================================
  console.log('\n── Multi-categoría: PERMITIDO (GOTCHAS #69) ──');
  // =========================================================================
  const r4 = await inscribir(sbA, spcA1, cAbierta2);
  if (r4.id) fx.inscripciones.push(r4.id);
  const { data: enReunion } = await admin.from('inscripciones')
    .select('id, carrera_id').eq('spc_id', spcA1).in('carrera_id', [cAbierta, cAbierta2]);
  check('G4', r4.ok && (enReunion?.length ?? 0) === 2,
    'el MISMO caballo en 2 carreras de la MISMA reunión: las dos aceptadas',
    r4.msg ?? `filas en la reunión=${enReunion?.length}`);

  const r5 = await inscribir(sbA, spcA1, cAbierta);
  const f5 = await filasEn(cAbierta, spcA1);
  check('G5', !r5.ok && f5.length === 1,
    'el mismo caballo DOS VECES en la misma carrera: rechazado',
    r5.ok ? 'el RPC lo aceptó' : `filas=${f5.length}`);

  // =========================================================================
  console.log('\n── Inscripción libre (cambio de regla 24/08/2026) ──');
  // =========================================================================
  // ANTES este assert era el inverso: A NO podía inscribir un caballo de B.
  // Fede y Yesi cambiaron la regla — cualquier entrenador puede anotar
  // cualquier SPC del padrón y el control es disciplinario, con
  // inscripto_por como evidencia. Ver migrations/portal_inscripcion_libre.sql.
  const r6 = await inscribir(sbA, spcB1, cAbierta);
  const f6 = await filasEn(cAbierta, spcB1);
  if (r6.id) fx.inscripciones.push(r6.id);
  check('G6', r6.ok && f6.length === 1,
    'A SÍ puede inscribir un caballo AJENO (de B) — inscripción libre',
    r6.msg ?? `filas=${f6.length}`);

  const rowAjeno = f6[0]
    ? (await admin.from('inscripciones').select('*').eq('id', f6[0].id).single()).data
    : null;

  // El dato que reemplaza al filtro: queda registrado que fue A, y el
  // entrenador de la inscripción es A —el que se declara responsable—,
  // NO el profB que figura en el padrón.
  check('G6b', rowAjeno?.inscripto_por === uA.usuarioId
            && rowAjeno?.entrenador_id === profA
            && rowAjeno?.canal === 'portal',
    'la inscripción ajena registra a A como quien inscribió y como entrenador',
    `inscripto_por=${rowAjeno?.inscripto_por === uA.usuarioId} entrenador=${rowAjeno?.entrenador_id === profA}`);

  // Sin fn_mis_spc_visibles() esta fila le quedaría invisible al propio A:
  // el caballo no está en su tenencia y la policy vieja filtraba por ella.
  const { data: veAjena } = await sbA.from('inscripciones')
    .select('id').eq('id', f6[0]?.id ?? '00000000-0000-0000-0000-000000000000');
  check('G6c', (veAjena?.length ?? 0) === 1,
    'A VE la inscripción ajena que él mismo cargó (fn_mis_spc_visibles)',
    `filas visibles=${veAjena?.length ?? 0}`);

  // B, el dueño del caballo, la ve por tenencia. Sigue valiendo.
  const { data: veB } = await sbB.from('inscripciones')
    .select('id').eq('id', f6[0]?.id ?? '00000000-0000-0000-0000-000000000000');
  check('G6d', (veB?.length ?? 0) === 1,
    'B ve la inscripción de su propio caballo, aunque la haya cargado A',
    `filas visibles=${veB?.length ?? 0}`);

  // Retirar es de quien la cargó, NO de quien tiene el caballo: B no puede.
  const b6e = await darDeBaja(sbB, f6[0]?.id);
  check('G6e', !b6e.ok && (await filasEn(cAbierta, spcB1)).length === 1,
    'B NO puede retirar la inscripción que cargó A, aunque el caballo sea suyo',
    b6e.ok ? 'la borró' : b6e.msg);

  // El buscador ve todo el padrón, incluido el caballo de B.
  const { data: busq, error: eBusq } = await sbA.rpc('rpc_buscar_spc', { p_q: `PROBE-G4-B1-${RUN}` });
  check('G6f', !eBusq && (busq?.length ?? 0) === 1 && busq[0].id === spcB1 && busq[0].habilitado === true,
    'rpc_buscar_spc encuentra un SPC ajeno y lo marca habilitado',
    eBusq?.message ?? `filas=${busq?.length ?? 0}`);

  const { data: corto } = await sbA.rpc('rpc_buscar_spc', { p_q: 'a' });
  check('G6g', (corto?.length ?? 0) === 0,
    'rpc_buscar_spc no devuelve nada con menos de 2 caracteres',
    `filas=${corto?.length ?? 0}`);

  // =========================================================================
  console.log('\n── Ventana ──');
  // =========================================================================
  const r7 = await inscribir(sbA, spcA2, cCerrada);
  check('G7', !r7.ok && (await filasEn(cCerrada, spcA2)).length === 0,
    'ventana CERRADA (cierre en el pasado): rechazado', r7.msg);

  const r8 = await inscribir(sbA, spcA2, cSinVent);
  check('G8', !r8.ok && (await filasEn(cSinVent, spcA2)).length === 0,
    'ventana SIN CARGAR (apertura/cierre NULL): rechazado — fail-closed', r8.msg);

  const r9 = await inscribir(sbA, spcA2, cBorrador);
  check('G9', !r9.ok && (await filasEn(cBorrador, spcA2)).length === 0,
    'reunión en BORRADOR con ventana abierta: rechazado', r9.msg);

  const r10 = await inscribir(sbA, spcA2, cAnulada);
  check('G10', !r10.ok && (await filasEn(cAnulada, spcA2)).length === 0,
    'carrera ANULADA con ventana abierta: rechazado', r10.msg);

  // =========================================================================
  console.log('\n── Reglas de la carrera ──');
  // =========================================================================
  const r11 = await inscribir(sbA, spcA2, cHembras);
  check('G11', !r11.ok && (await filasEn(cHembras, spcA2)).length === 0,
    'SPC macho en carrera de hembras: rechazado por validar_inscripcion',
    r11.ok ? 'el RPC lo aceptó — la validación no está cableada' : r11.msg);

  // =========================================================================
  console.log('\n── Baja ──');
  // =========================================================================
  const rIns = await inscribir(sbA, spcA2, cAbierta);
  if (rIns.id) fx.inscripciones.push(rIns.id);
  const b12 = await darDeBaja(sbA, rIns.id);
  check('G12', b12.ok && (await filasEn(cAbierta, spcA2)).length === 0,
    'el entrenador retira su PROPIA inscripción con la ventana abierta',
    b12.msg);

  // Fila cargada "por la secretaría": canal manual, sin inscripto_por.
  const inscManual = await ins('inscripciones', {
    carrera_id: cAbierta, spc_id: spcA2, estado: 'inscripto',
    canal: 'manual', entrenador_id: profA, caballeriza_id: cab,
  }, 'inscripciones');
  const b13 = await darDeBaja(sbA, inscManual);
  const sigue = await filasEn(cAbierta, spcA2);
  check('G13', !b13.ok && sigue.length === 1,
    'NO puede borrar una inscripción cargada por la SECRETARÍA (canal=manual)',
    b13.ok ? 'la borró' : `sigue ahí=${sigue.length === 1}`);

  // Baja con la ventana cerrada: se reusa la inscripción de G4 y se mueve el
  // cierre de esa carrera al pasado.
  const idParaG14 = enReunion?.find((r) => r.carrera_id === cAbierta2)?.id ?? r4.id;
  await admin.from('carreras').update({ cierre_inscripcion: ayer }).eq('id', cAbierta2);
  const b14 = await darDeBaja(sbA, idParaG14);
  const sigue14 = await filasEn(cAbierta2, spcA1);
  check('G14', !b14.ok && sigue14.length === 1,
    'NO puede retirar con la ventana ya CERRADA (eso es forfait, fuera de v1)',
    b14.ok ? 'la borró' : `sigue ahí=${sigue14.length === 1}`);

  // =========================================================================
  console.log('\n── El back office no entra por acá ──');
  // =========================================================================
  // Un usuario staff no tiene entidad profesional vinculada: el RPC lo rechaza
  // en la validación 1. La secretaría inscribe por su propio camino.
  const { data: staff } = await admin.from('usuarios')
    .select('email').eq('club_id', CLUB_DOLORES).eq('rol', 'secretario_carreras')
    .eq('activo', true).limit(1).maybeSingle();
  if (staff?.email) {
    const sbS = await clientePortal(staff.email);   // magic link, no crea nada
    const r15 = await inscribir(sbS, spcA1, cAbierta);
    check('G15', !r15.ok && (await filasEn(cAbierta, spcA1)).length === 1,
      'un usuario STAFF llamando rpc_inscribir: rechazado', r15.msg);
  } else {
    check('G15', false, 'staff llamando rpc_inscribir: rechazado',
      'no encontré un usuario secretario_carreras activo en Dolores');
  }
}

// ===========================================================================
async function teardown() {
  console.log('\n── Teardown ──');
  const borrar = async (tabla, ids, col = 'id') => {
    if (!ids?.length) return;
    const { error } = await admin.from(tabla).delete().in(col, ids);
    if (error) console.error(`  ⚠️ teardown ${tabla}: ${error.message}`);
  };

  // Orden de FK: resultado_posiciones → inscripciones → carreras → reuniones.
  const { data: todasInsc } = await admin.from('inscripciones')
    .select('id').in('carrera_id', fx.carreras.length ? fx.carreras : ['00000000-0000-0000-0000-000000000000']);
  const inscIds = [...new Set([...(todasInsc ?? []).map((r) => r.id), ...fx.inscripciones])];

  await borrar('resultado_posiciones', inscIds, 'inscripcion_id');
  await borrar('inscripciones', inscIds);
  await borrar('carreras', fx.carreras);
  await borrar('reuniones', fx.reuniones);
  await borrar('spcs', fx.spcs);
  await borrar('caballerizas', fx.caballerizas);
  await borrar('profesionales', fx.profesionales);

  // `auditoria.usuario_id` es FK a usuarios: si el probe generó filas de
  // auditoría (las genera en cuanto inscribe), el DELETE de usuarios falla y
  // quedan cuentas huérfanas en producción. Se borran primero las de estos
  // usuarios fixture — y sólo las de ellos.
  const { data: usrRows } = await admin.from('usuarios').select('id').in('email', fx.usuarios);
  const usrIds = (usrRows ?? []).map((r) => r.id);
  await borrar('auditoria', usrIds, 'usuario_id');
  await borrar('usuarios', fx.usuarios, 'email');
  for (const id of fx.authIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`  ⚠️ teardown auth ${id}: ${error.message}`);
  }
  console.log('  listo');
}

try {
  await main();
} catch (err) {
  console.error('\n💥 el probe se cortó:', err.message);
  resultados.push({ id: '—', label: 'ejecución', estado: 'FAIL', detalle: err.message });
} finally {
  await teardown();
}

const pass = resultados.filter((r) => r.estado === 'PASS').length;
const fail = resultados.filter((r) => r.estado === 'FAIL').length;
console.log(`\n── Resumen ──\n  PASS ${pass}   FAIL ${fail}\n`);
if (fail) {
  console.log('  Fallaron:');
  resultados.filter((r) => r.estado === 'FAIL')
    .forEach((r) => console.log(`    ${r.id}. ${r.label} → ${r.detalle ?? ''}`));
}
process.exit(fail ? 1 : 0);
