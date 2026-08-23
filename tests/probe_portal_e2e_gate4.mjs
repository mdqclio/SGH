#!/usr/bin/env node
/**
 * probe_portal_e2e_gate4.mjs — el recorrido completo del entrenador en el portal
 *
 * Verificación end-to-end de los 5 puntos, contra PRODUCCIÓN, corriendo el
 * código REAL de portal.html (el <script> entero, evaluado con un DOM falso) y
 * una sesión REAL de Supabase Auth con la publishable key y RLS activo:
 *
 *   1. entra al portal y ve sus caballos
 *   2. ve el llamado ordenado por número de turno
 *   3. anota un caballo suyo en un turno
 *   4. una inscripción que TIENE que ser rechazada se bloquea, con el mensaje
 *      genérico y visible en pantalla
 *   5. anota el MISMO caballo en otro turno de la misma reunión — la regla de Fede
 *
 * FIXTURE DESCARTABLE. No toca ningún dato real: crea su propio entrenador,
 * caballeriza, SPC, usuario de portal (auth + usuarios) y una reunión 9992 con
 * fecha 2099. Teardown en `finally`, en orden de FK, y después una consulta de
 * residuos que confirma que no quedó nada.
 *
 * Uso:  set -a; . ./.env; set +a; node tests/probe_portal_e2e_gate4.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB_DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const GENERICO = 'Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.';

const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SECRET) { console.error('FALTA env: SUPABASE_SECRET_KEY'); process.exit(2); }
const admin = createClient(SUPABASE_URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });

const resultados = [];
function check(id, cond, label, detalle) {
  resultados.push({ id, label, estado: cond ? 'PASS' : 'FAIL', detalle });
  console.log(`  ${cond ? '✅' : '❌'} ${id}. ${label}${!cond && detalle ? `  → ${detalle}` : ''}`);
}
const info = (m) => console.log(`     ${m}`);

const RUN = Math.random().toString(36).slice(2, 8);
const mail = (q) => `probe-e2e-${q}-${RUN}@sgh-probe.invalid`;
const fx = { authIds: [], usuarios: [], profesionales: [], caballerizas: [], spcs: [], reuniones: [], carreras: [] };
const die = (ctx, e) => { throw new Error(`[${ctx}] ${e?.message ?? JSON.stringify(e)}`); };

async function ins(tabla, fila, bucket) {
  const { data, error } = await admin.from(tabla).insert(fila).select('id').single();
  if (error) die(`insert ${tabla}`, error);
  if (bucket) fx[bucket].push(data.id);
  return data.id;
}

function nuevoDom() {
  const nodos = new Map();
  const nodo = (id) => {
    if (!nodos.has(id)) {
      nodos.set(id, {
        id, innerHTML: '', textContent: '', style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {},
        insertAdjacentHTML(_p, h) { this.innerHTML = h + this.innerHTML; },
        appendChild() {}, remove() {},
      });
    }
    return nodos.get(id);
  };
  return { nodos, doc: { getElementById: nodo, querySelectorAll: () => [], createElement: () => ({ className: '', textContent: '', remove() {} }), addEventListener() {} } };
}

// El <script> real de portal.html, sin el IIFE de arranque (que redirige a login).
function cargarPortal(dom) {
  const html = readFileSync(new URL('../portal.html', import.meta.url), 'utf8');
  const ini = html.indexOf('<script>\n', html.indexOf('supabase-js@2')) + '<script>\n'.length;
  const fin = html.indexOf('</script>\n</body>');
  if (ini < 10 || fin < 0) throw new Error('no pude aislar el <script> de portal.html');
  let body = html.slice(ini, fin);
  const iife = body.lastIndexOf('(async () => {');
  if (iife < 0) throw new Error('no encontré el IIFE de arranque');
  body = body.slice(0, iife);
  body += `
    function __set(o) {
      if ('sb' in o) sb = o.sb;
      if ('miUsuarioId' in o) miUsuarioId = o.miUsuarioId;
      if ('esEntrenador' in o) esEntrenador = o.esEntrenador;
      if ('currentUser' in o) currentUser = o.currentUser;
      if ('carreraSeleccionada' in o) carreraSeleccionada = o.carreraSeleccionada;
    }
    function __get() { return { misCaballos, misInscripciones, turnosAbiertos, carreraSeleccionada }; }
    return { __set, __get, anotar, loadCaballos, loadLlamado, loadMisInscripciones,
             cargarInscripcionesCrudas, abrirInscripcion, renderListaCaballosModal, ventanaAbierta };
  `;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  return new AsyncFunction('document', 'window', 'supabase', 'confirm', 'alert', body)(
    dom.doc, { location: { replace() {} } }, { createClient }, () => true, () => {},
  );
}

async function sesionPortal(email) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) die(`generateLink ${email}`, error);
  const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e2 } = await sb.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (e2) die(`verifyOtp ${email}`, e2);
  return sb;
}

async function crearEntrenadorPortal(q, profesionalId) {
  const email = mail(q);
  const { data, error } = await admin.auth.admin.createUser({
    email, password: `Probe-${RUN}-${Math.random().toString(36).slice(2, 10)}!`, email_confirm: true,
  });
  if (error) die(`createUser ${q}`, error);
  fx.authIds.push(data.user.id);
  const { data: uRow, error: e2 } = await admin.from('usuarios').insert({
    email, nombre_completo: `Probe E2E ${q} ${RUN}`, club_id: CLUB_DOLORES,
    rol: 'profesional', activo: true, estado: 'activo', password_hash: '',
    auth_user_id: data.user.id, entidad_tipo: 'profesional', entidad_id: profesionalId,
  }).select('id').single();
  if (e2) die(`insert usuarios ${q}`, e2);
  fx.usuarios.push(email);
  return { email, usuarioId: uRow.id };
}

const filasDe = async (spcId) => {
  const { data } = await admin.from('inscripciones')
    .select('id,carrera_id,estado,canal').eq('spc_id', spcId);
  return data ?? [];
};

async function main() {
  console.log(`\n probe_portal_e2e_gate4 — recorrido del entrenador, código real · run ${RUN}\n`);

  const { data: hip } = await admin.from('hipodromos').select('id').eq('club_id', CLUB_DOLORES).limit(1).single();
  const { data: cat } = await admin.from('categorias_carrera').select('id').eq('club_id', CLUB_DOLORES).limit(1).single();

  const prof = await ins('profesionales', { club_id: CLUB_DOLORES, tipo: 'entrenador', nombre: 'PROBE-E2E', apellido: RUN, hipodromo_patente: 'DOL' }, 'profesionales');
  const cab = await ins('caballerizas', { club_id: CLUB_DOLORES, nombre: `PROBE-E2E-CAB-${RUN}`, hipodromo_patente: 'DOL' }, 'caballerizas');
  // Macho: el rechazo del punto 4 se provoca con una carrera de hembras.
  const spc = await ins('spcs', {
    nombre: `PROBE-E2E-CABALLO-${RUN}`, fecha_nacimiento: '2020-01-01', sexo: 'macho',
    estado: 'activo', entrenador_id: prof, caballeriza_id: cab,
  }, 'spcs');

  const u = await crearEntrenadorPortal('ent', prof);

  const reun = await ins('reuniones', {
    club_id: CLUB_DOLORES, hipodromo_id: hip.id, numero: 9992, fecha: '2099-05-01', estado: 'publicada',
  }, 'reuniones');

  const ayer = new Date(Date.now() - 86400e3).toISOString();
  const manana = new Date(Date.now() + 86400e3).toISOString();
  const carrera = (turno, extra) => ins('carreras', {
    reunion_id: reun, numero_turno: turno, categoria_id: cat.id, distancia_metros: 1000,
    estado: 'abierta', apertura_inscripcion: ayer, cierre_inscripcion: manana, ...extra,
  }, 'carreras');

  // Se crean DESORDENADAS a propósito: el orden por turno tiene que salir del código.
  const t7 = await carrera(7, { nombre: `PROBE TURNO 7 ${RUN}` });
  const t1 = await carrera(1, { nombre: `PROBE TURNO 1 ${RUN}` });
  const t4 = await carrera(4, { nombre: `PROBE TURNO 4 ${RUN}`, condicion_sexo: 'hembras' });

  const sb = await sesionPortal(u.email);
  const dom = nuevoDom();
  const P = await cargarPortal(dom);
  P.__set({ sb, miUsuarioId: u.usuarioId, esEntrenador: true, currentUser: { rol: 'profesional' } });

  // ========================================================================
  console.log('\n── 1. Entra al portal y ve sus caballos ──');
  // ========================================================================
  const { data: esPortal } = await sb.rpc('fn_is_portal_user');
  check('E1a', esPortal === true, 'la sesión es de portal (fn_is_portal_user)', `dio ${esPortal}`);

  await P.loadCaballos();
  const caballos = P.__get().misCaballos || [];
  check('E1b', caballos.length === 1 && caballos[0].id === spc,
    've exactamente su caballo, resuelto por fn_mis_spc_ids()',
    `ve ${caballos.length}: ${caballos.map(c => c.nombre).join(', ')}`);

  // ========================================================================
  console.log('\n── 2. Ve el llamado ordenado por turno ──');
  // ========================================================================
  await P.loadLlamado();
  const htmlCarta = dom.nodos.get('carta-container').innerHTML;
  const turnos = P.__get().turnosAbiertos.find(r => r.id === reun);
  const orden = (turnos?.carreras || []).map(c => c.numero_turno);
  check('E2a', JSON.stringify(orden) === JSON.stringify([1, 4, 7]),
    'los turnos salen 1, 4, 7 aunque se crearon 7, 1, 4', `salió ${JSON.stringify(orden)}`);

  const pos = [1, 4, 7].map(n => htmlCarta.indexOf(`PROBE TURNO ${n} ${RUN}`));
  check('E2b', pos.every(p => p >= 0) && pos[0] < pos[1] && pos[1] < pos[2],
    'y en el HTML aparecen en ese orden', `posiciones ${JSON.stringify(pos)}`);
  info(`la reunión sale rotulada: ${(htmlCarta.match(/Reunión[^<]*/) || ['(no encontrada)'])[0].trim()}`);

  // ========================================================================
  console.log('\n── 3. Anota un caballo suyo en un turno ──');
  // ========================================================================
  await P.abrirInscripcion(t1, reun);
  await P.anotar(spc);
  let filas = await filasDe(spc);
  const enT1 = filas.filter(f => f.carrera_id === t1);
  check('E3a', enT1.length === 1, 'queda 1 inscripción en el turno 1', `hay ${enT1.length}`);
  check('E3b', enT1[0]?.estado === 'inscripto' && enT1[0]?.canal === 'portal',
    "nace con estado='inscripto' y canal='portal'", `estado=${enT1[0]?.estado} canal=${enT1[0]?.canal}`);
  const vm = dom.nodos.get('validation-msg');
  check('E3c', !/validation-err/.test(vm.className || ''),
    'no marcó error en el caso válido', `className="${vm.className}"`);

  // ========================================================================
  console.log('\n── 4. Una inscripción que TIENE que ser rechazada se bloquea ──');
  // ========================================================================
  // Turno 4 es de hembras y el caballo es macho → validar_inscripcion rechaza.
  await P.abrirInscripcion(t4, reun);
  await P.anotar(spc);
  const vm4 = dom.nodos.get('validation-msg');
  const enT4 = (await filasDe(spc)).filter(f => f.carrera_id === t4);
  check('E4a', enT4.length === 0, 'NO se escribió ninguna fila', `se escribieron ${enT4.length}`);
  check('E4b', vm4.style.display === 'block', 'el mensaje se muestra (display:block)', `display=${vm4.style.display}`);
  check('E4c', /validation-err/.test(vm4.className || ''), 'con la clase de error', `className="${vm4.className}"`);
  check('E4d', vm4.textContent.includes(GENERICO),
    'y el texto es el mensaje GENÉRICO, sin filtrar el motivo real', `dijo: ${vm4.textContent}`);
  info(`mensaje en pantalla: ${vm4.textContent}`);

  // ========================================================================
  console.log('\n── 5. El MISMO caballo en otro turno de la misma reunión (regla de Fede) ──');
  // ========================================================================
  await P.abrirInscripcion(t7, reun);
  await P.anotar(spc);
  filas = await filasDe(spc);
  const enT7 = filas.filter(f => f.carrera_id === t7);
  check('E5a', enT7.length === 1, 'la segunda anotación se ACEPTA', `hay ${enT7.length} en el turno 7`);
  check('E5b', filas.length === 2,
    'el caballo queda anotado en 2 turnos de la MISMA reunión', `quedó en ${filas.length}`);
  const vm7 = dom.nodos.get('validation-msg');
  check('E5c', !/validation-err/.test(vm7.className || ''), 'sin error en pantalla', `className="${vm7.className}"`);

  // El aviso de ISSUE-048: la UI muestra las otras anotaciones y deja anotar
  // igual. Se abre el turno 4, donde el caballo NO está anotado — en un turno
  // donde ya está, gana el chip "ya anotado en este turno".
  await P.cargarInscripcionesCrudas();
  await P.abrirInscripcion(t4, reun);
  P.renderListaCaballosModal();
  const htmlModal = dom.nodos.get('minsc-lista').innerHTML;
  const avisoOtros = /también anotado en el turno ([^<]*?) — está bien, la secretaría define después/.exec(htmlModal);
  check('E5d', !!avisoOtros,
    'la UI avisa que ya está en otros turnos, sin bloquear',
    htmlModal.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 160));
  if (avisoOtros) info(`aviso en el modal: "también anotado en el turno ${avisoOtros[1]} — está bien, la secretaría define después"`);
  check('E5f', !/disabled>Anotado</.test(htmlModal),
    'y el botón de anotar sigue habilitado en ese turno');

  // Duplicado en el MISMO turno: eso sí se rechaza.
  await P.abrirInscripcion(t1, reun);
  await P.anotar(spc);
  const enT1Bis = (await filasDe(spc)).filter(f => f.carrera_id === t1);
  check('E5e', enT1Bis.length === 1, 'el duplicado en el MISMO turno sigue rechazado', `hay ${enT1Bis.length}`);
  info(`mensaje: ${dom.nodos.get('validation-msg').textContent}`);
}

async function teardown() {
  console.log('\n── Teardown ──');
  const borrar = async (tabla, ids, col = 'id') => {
    if (!ids?.length) return;
    const { error } = await admin.from(tabla).delete().in(col, ids);
    if (error) console.error(`  ⚠️ teardown ${tabla}: ${error.message}`);
  };
  const { data: insc } = await admin.from('inscripciones').select('id')
    .in('carrera_id', fx.carreras.length ? fx.carreras : ['00000000-0000-0000-0000-000000000000']);
  const inscIds = (insc ?? []).map(r => r.id);
  await borrar('resultado_posiciones', inscIds, 'inscripcion_id');
  await borrar('inscripciones', inscIds);
  await borrar('carreras', fx.carreras);
  await borrar('reuniones', fx.reuniones);
  await borrar('spcs', fx.spcs);
  await borrar('caballerizas', fx.caballerizas);
  await borrar('profesionales', fx.profesionales);
  // auditoria.usuario_id es FK a usuarios: si no se borra antes, el DELETE de
  // usuarios falla y quedan cuentas huérfanas en producción.
  const { data: usrRows } = await admin.from('usuarios').select('id').in('email', fx.usuarios);
  await borrar('auditoria', (usrRows ?? []).map(r => r.id), 'usuario_id');
  await borrar('usuarios', fx.usuarios, 'email');
  for (const id of fx.authIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`  ⚠️ teardown auth ${id}: ${error.message}`);
  }

  // --- Control de residuos: que no haya quedado NADA ---
  const resto = {};
  const contar = async (tabla, col, ids) => {
    if (!ids?.length) { resto[tabla] = 0; return; }
    const { count } = await admin.from(tabla).select('id', { count: 'exact', head: true }).in(col, ids);
    resto[tabla] = count ?? 0;
  };
  await contar('inscripciones', 'spc_id', fx.spcs);
  await contar('carreras', 'id', fx.carreras);
  await contar('reuniones', 'id', fx.reuniones);
  await contar('spcs', 'id', fx.spcs);
  await contar('caballerizas', 'id', fx.caballerizas);
  await contar('profesionales', 'id', fx.profesionales);
  await contar('usuarios', 'email', fx.usuarios);
  let authVivos = 0;
  for (const id of fx.authIds) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data?.user) authVivos++;
  }
  resto['auth.users'] = authVivos;

  const sucio = Object.entries(resto).filter(([, n]) => n > 0);
  console.log(`  residuos: ${Object.entries(resto).map(([t, n]) => `${t}=${n}`).join(' · ')}`);
  console.log(sucio.length ? `  ❌ QUEDÓ BASURA: ${sucio.map(([t, n]) => `${t}(${n})`).join(', ')}` : '  ✅ no quedó nada');
  return sucio.length === 0;
}

let limpio = false;
try {
  await main();
} catch (err) {
  console.error('\n💥 el probe se cortó:', err.message);
  resultados.push({ id: '—', label: 'ejecución', estado: 'FAIL', detalle: err.message });
} finally {
  limpio = await teardown();
}

const pass = resultados.filter(r => r.estado === 'PASS').length;
const fail = resultados.filter(r => r.estado === 'FAIL').length;
console.log(`\n── Resumen ──\n  PASS ${pass}   FAIL ${fail}   teardown ${limpio ? 'limpio' : 'SUCIO'}\n`);
if (fail) resultados.filter(r => r.estado === 'FAIL').forEach(r => console.log(`    ${r.id}. ${r.label} → ${r.detalle ?? ''}`));
process.exit(fail || !limpio ? 1 : 0);
