/**
 * probe_gate4_portal_ui.mjs — Gate 4.4: la UI de portal.html, sin browser.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_gate4_portal_ui.mjs
 *
 * ---------------------------------------------------------------------------
 * CÓMO CORRE SIN BROWSER
 * ---------------------------------------------------------------------------
 * Playwright/chromium no anda en Ubuntu 26.04 (ver tests/README.md). Se usa el
 * patrón de harness de código real: se lee el <script> de portal.html TAL CUAL,
 * se le saca el IIFE de arranque, se le agrega un setter de estado, y se
 * evalúa con `new AsyncFunction` inyectando dependencias REALES —cliente
 * Supabase autenticado como entrenador del portal— y stubs de DOM.
 *
 * O sea: corre el MISMO texto que sirve producción. No hay reimplementación.
 *
 * ---------------------------------------------------------------------------
 * QUÉ VERIFICA
 * ---------------------------------------------------------------------------
 * · El criterio de ventana (fail-closed) tal como lo aplica la UI.
 * · Que el llamado abierto muestre SÓLO los turnos con ventana vigente.
 * · Los estados vacíos CON explicación (el entrenador sin tenencia).
 * · Que el aviso de multi-categoría sea informativo y no bloquee.
 * · Que "Retirar" aparezca sólo sobre filas propias, del portal, con la
 *   ventana abierta.
 *
 * ---------------------------------------------------------------------------
 * SEGURIDAD DE LOS DATOS
 * ---------------------------------------------------------------------------
 * · Reunión fixture 9993, fecha 2099. NO toca R8 ni ninguna reunión real.
 * · Teardown en `finally`, con la auditoría de sus usuarios antes que usuarios
 *   (auditoria.usuario_id es FK a usuarios).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB_DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c';

function requireSecret() {
  const v = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!v) { console.error('FALTA env: SUPABASE_SECRET_KEY'); process.exit(2); }
  return v;
}
const admin = createClient(SUPABASE_URL, requireSecret(), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const resultados = [];
function check(id, cond, label, detalle) {
  resultados.push({ id, label, estado: cond ? 'PASS' : 'FAIL', detalle });
  console.log(`  ${cond ? '✅' : '❌'} ${id}. ${label}${!cond && detalle ? `  → ${detalle}` : ''}`);
}

const RUN = Math.random().toString(36).slice(2, 8);
const mail = (q) => `probe-ui-${q}-${RUN}@sgh-probe.invalid`;
const fx = { authIds: [], usuarios: [], profesionales: [], caballerizas: [], spcs: [], reuniones: [], carreras: [] };
const die = (ctx, e) => { throw new Error(`[${ctx}] ${e?.message ?? JSON.stringify(e)}`); };

async function ins(tabla, fila, bucket) {
  const { data, error } = await admin.from(tabla).insert(fila).select('id').single();
  if (error) die(`insert ${tabla}`, error);
  if (bucket) fx[bucket].push(data.id);
  return data.id;
}

// ---------------------------------------------------------------------------
// Stubs de DOM — lo mínimo que toca el script del portal.
// ---------------------------------------------------------------------------
function nuevoDom() {
  const nodos = new Map();
  const nodo = (id) => {
    if (!nodos.has(id)) {
      nodos.set(id, {
        id, innerHTML: '', textContent: '', style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {},
        insertAdjacentHTML(_pos, html) { this.innerHTML = html + this.innerHTML; },
        appendChild() {}, remove() {},
      });
    }
    return nodos.get(id);
  };
  return {
    nodos,
    doc: {
      getElementById: nodo,
      querySelectorAll: () => [],
      createElement: () => ({ className: '', textContent: '', remove() {} }),
      addEventListener() {},
    },
  };
}

// ---------------------------------------------------------------------------
// El código REAL de portal.html, evaluado.
// ---------------------------------------------------------------------------
function cargarPortal(dom) {
  const html = readFileSync(new URL('../portal.html', import.meta.url), 'utf8');
  const ini = html.indexOf('<script>\n', html.indexOf('supabase-js@2')) + '<script>\n'.length;
  const fin = html.indexOf('</script>\n</body>');
  if (ini < 10 || fin < 0) throw new Error('no pude aislar el <script> de portal.html');

  let body = html.slice(ini, fin);

  // Se saca el IIFE de arranque: dispara initAuth() y redirige a login.html.
  const iife = body.lastIndexOf('(async () => {');
  if (iife < 0) throw new Error('no encontré el IIFE de arranque');
  body = body.slice(0, iife);

  // Setter sobre las MISMAS variables de módulo que usa el código real.
  body += `
    function __set(o) {
      if ('sb' in o) sb = o.sb;
      if ('miUsuarioId' in o) miUsuarioId = o.miUsuarioId;
      if ('esEntrenador' in o) esEntrenador = o.esEntrenador;
      if ('misCaballos' in o) misCaballos = o.misCaballos;
      if ('misInscripciones' in o) misInscripciones = o.misInscripciones;
      if ('currentUser' in o) currentUser = o.currentUser;
    }
    function __get() { return { misCaballos, misInscripciones, turnosAbiertos, esEntrenador }; }
    return { __set, __get, ventanaAbierta, puedeRetirar, esc, formatARS,
             renderCaballos, loadLlamado, loadMisInscripciones,
             cargarInscripcionesCrudas, abrirInscripcion, renderListaCaballosModal };
  `;

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  return new AsyncFunction('document', 'window', 'supabase', 'confirm', 'alert', body)(
    dom.doc, { location: { replace() {} } }, { createClient }, () => true, () => {},
  );
}

async function sesionPortal(email) {
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

async function crearEntrenadorPortal(q, profesionalId) {
  const email = mail(q);
  const { data, error } = await admin.auth.admin.createUser({ email, password: `P-${RUN}-x9!`, email_confirm: true });
  if (error) die(`createUser ${q}`, error);
  fx.authIds.push(data.user.id);
  const { data: uRow, error: e2 } = await admin.from('usuarios').insert({
    email, nombre_completo: `Probe UI ${q} ${RUN}`, club_id: CLUB_DOLORES,
    rol: 'profesional', activo: true, estado: 'activo', password_hash: '',
    auth_user_id: data.user.id, entidad_tipo: 'profesional', entidad_id: profesionalId,
  }).select('id').single();
  if (e2) die(`insert usuarios ${q}`, e2);
  fx.usuarios.push(email);
  return { email, usuarioId: uRow.id };
}

// ===========================================================================
async function main() {
  console.log(`\n probe_gate4_portal_ui — código real de portal.html · run ${RUN}\n`);

  const { data: hip } = await admin.from('hipodromos').select('id').eq('club_id', CLUB_DOLORES).limit(1).single();
  const { data: cat } = await admin.from('categorias_carrera').select('id').eq('club_id', CLUB_DOLORES).limit(1).single();

  const prof = await ins('profesionales', {
    club_id: CLUB_DOLORES, tipo: 'entrenador', nombre: 'PROBE-UI', apellido: RUN, hipodromo_patente: 'DOL',
  }, 'profesionales');
  const profSinCaballos = await ins('profesionales', {
    club_id: CLUB_DOLORES, tipo: 'entrenador', nombre: 'PROBE-UI-VACIO', apellido: RUN, hipodromo_patente: 'DOL',
  }, 'profesionales');
  const cab = await ins('caballerizas', {
    club_id: CLUB_DOLORES, nombre: `PROBE-UI-CAB-${RUN}`, hipodromo_patente: 'DOL',
  }, 'caballerizas');
  // Monta obligatoria desde el 25/08/2026: el fixture necesita un jockey.
  const jock = await ins('profesionales', {
    club_id: CLUB_DOLORES, tipo: 'jockey', nombre: 'PROBE-UI-JOC', apellido: RUN,
    hipodromo_patente: 'DOL', activo: true,
  }, 'profesionales');

  const spc1 = await ins('spcs', {
    nombre: `PROBE-UI-UNO-${RUN}`, fecha_nacimiento: '2020-01-01', sexo: 'macho',
    estado: 'activo', entrenador_id: prof, caballeriza_id: cab,
  }, 'spcs');

  const uA = await crearEntrenadorPortal('a', prof);
  const uVacio = await crearEntrenadorPortal('vacio', profSinCaballos);

  const reun = await ins('reuniones', {
    club_id: CLUB_DOLORES, hipodromo_id: hip.id, numero: 9993,
    fecha: '2099-04-01', estado: 'publicada',
  }, 'reuniones');

  const ayer = new Date(Date.now() - 86400e3).toISOString();
  const manana = new Date(Date.now() + 86400e3).toISOString();
  const carrera = (turno, extra) => ins('carreras', {
    reunion_id: reun, numero_turno: turno, categoria_id: cat.id, distancia_metros: 1000,
    estado: 'abierta', apertura_inscripcion: ayer, cierre_inscripcion: manana, ...extra,
  }, 'carreras');

  const cAbierta  = await carrera(1);
  const cAbierta2 = await carrera(2);
  const cCerrada  = await carrera(3, { cierre_inscripcion: ayer, apertura_inscripcion: new Date(Date.now() - 2 * 86400e3).toISOString() });
  const cSinVent  = await carrera(4, { apertura_inscripcion: null, cierre_inscripcion: null });
  const cAnulada  = await carrera(5, { estado: 'anulada' });

  const sbA = await sesionPortal(uA.email);

  // =========================================================================
  console.log('\n── Funciones puras, extraídas del archivo ──');
  // =========================================================================
  const dom = nuevoDom();
  const P = await cargarPortal(dom);

  const reunPub = 'publicada';
  check('U1',
    P.ventanaAbierta({ estado: 'abierta', apertura_inscripcion: ayer, cierre_inscripcion: manana }, reunPub) === true
    && P.ventanaAbierta({ estado: 'abierta', apertura_inscripcion: null, cierre_inscripcion: null }, reunPub) === false
    && P.ventanaAbierta({ estado: 'abierta', apertura_inscripcion: ayer, cierre_inscripcion: ayer }, reunPub) === false
    && P.ventanaAbierta({ estado: 'anulada', apertura_inscripcion: ayer, cierre_inscripcion: manana }, reunPub) === false
    && P.ventanaAbierta({ estado: 'abierta', apertura_inscripcion: ayer, cierre_inscripcion: manana }, 'borrador') === false,
    'ventanaAbierta: fail-closed en NULL, cerrada, anulada y reunión no publicada');

  check('U2', P.esc(`<img src=x onerror="alert(1)">`) === '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    'esc() escapa el HTML que viene de la DB (ISSUE-018)');

  check('U3', P.formatARS(1234567.5) === '$1.234.567,50',
    'formatARS usa el formato argentino', P.formatARS(1234567.5));

  // =========================================================================
  console.log('\n── Estado vacío: entrenador sin tenencia ──');
  // =========================================================================
  const domV = nuevoDom();
  const PV = await cargarPortal(domV);
  PV.__set({ sb: sbA, misCaballos: [], esEntrenador: true });
  PV.renderCaballos();
  const htmlVacio = domV.nodos.get('spcs-container').innerHTML;
  check('U4',
    /todavía no figuran a tu nombre/i.test(htmlVacio)
    && /pedile a la secretaría/i.test(htmlVacio)
    // Desde el 24/08/2026 el estado vacío ya no puede terminar en "esperá a la
    // secretaría": con inscripción libre el entrenador puede anotar igual.
    && /no te impide anotar/i.test(htmlVacio)
    && /cualquier ejemplar del padrón/i.test(htmlVacio),
    'el entrenador sin caballos ve POR QUÉ está vacío y que igual puede anotar',
    htmlVacio.slice(0, 120));

  // El mismo caso, pero end-to-end contra la base: cuenta real sin tenencia.
  const sbVacio = await sesionPortal(uVacio.email);
  const { data: idsVacio } = await sbVacio.rpc('fn_mis_spc_ids');
  check('U5', (idsVacio ?? []).length === 0,
    'fn_mis_spc_ids devuelve 0 para un entrenador sin caballos asignados',
    `filas=${idsVacio?.length}`);

  // =========================================================================
  console.log('\n── Llamado abierto: sólo los turnos con ventana vigente ──');
  // =========================================================================
  P.__set({ sb: sbA, miUsuarioId: uA.usuarioId, esEntrenador: true, misCaballos: [], misInscripciones: [] });
  await P.loadLlamado();
  const htmlLlamado = dom.nodos.get('carta-container').innerHTML;
  const turnos = P.__get().turnosAbiertos.find(r => r.id === reun);
  const idsVisibles = (turnos?.carreras || []).map(c => c.id);

  check('U6',
    idsVisibles.includes(cAbierta) && idsVisibles.includes(cAbierta2)
    && !idsVisibles.includes(cCerrada) && !idsVisibles.includes(cSinVent) && !idsVisibles.includes(cAnulada),
    'muestra los 2 turnos abiertos y descarta cerrado, sin ventana y anulado',
    `visibles=${idsVisibles.length}`);

  check('U7', /cierra/i.test(htmlLlamado) && /Anotar/.test(htmlLlamado),
    'cada turno dice hasta cuándo se puede anotar y ofrece el botón');

  // =========================================================================
  console.log('\n── Multi-categoría: avisa, no bloquea (GOTCHAS #69) ──');
  // =========================================================================
  const insc1 = await sbA.rpc('rpc_inscribir', {
    p_spc_id: spc1, p_carrera_id: cAbierta,
    p_caballeriza_id: cab, p_entrenador_id: prof,
    p_jockey_titular_id: jock, p_jockey_suplente_id: null,
  });
  if (insc1.error) die('rpc_inscribir fixture', insc1.error);

  await P.cargarInscripcionesCrudas();
  P.__set({ misCaballos: [{ id: spc1, nombre: `PROBE-UI-UNO-${RUN}`, sexo: 'macho' }] });
  await P.loadLlamado();
  P.abrirInscripcion(cAbierta2, reun);
  const htmlModal = dom.nodos.get('minsc-lista').innerHTML;

  check('U8',
    /también anotado en el turno 1/i.test(htmlModal)
    && /la secretaría define después/i.test(htmlModal)
    && /onclick="anotar\(/.test(htmlModal),
    'en otro turno de la misma reunión: avisa y DEJA anotar igual',
    htmlModal.slice(0, 160));

  P.abrirInscripcion(cAbierta, reun);
  const htmlMismo = dom.nodos.get('minsc-lista').innerHTML;
  check('U9', /ya anotado en este turno/i.test(htmlMismo) && /disabled/.test(htmlMismo),
    'en el MISMO turno: el botón queda deshabilitado');

  // =========================================================================
  console.log('\n── Mis inscripciones: "Retirar" sólo sobre lo propio ──');
  // =========================================================================
  await P.loadMisInscripciones();
  const htmlInsc = dom.nodos.get('inscripciones-container').innerHTML;
  check('U10', /Retirar/.test(htmlInsc) && /Portal/.test(htmlInsc),
    'la fila propia del portal ofrece Retirar y muestra el origen');

  // Fila "de la secretaría": mismo caballo, otro turno, canal manual.
  await admin.from('inscripciones').insert({
    carrera_id: cAbierta2, spc_id: spc1, estado: 'inscripto',
    canal: 'manual', entrenador_id: prof, caballeriza_id: cab,
  });
  await P.loadMisInscripciones();
  const conManual = dom.nodos.get('inscripciones-container').innerHTML;
  const filasRetirar = (conManual.match(/Retirar/g) || []).length;
  check('U11', filasRetirar === 1 && /Secretaría/.test(conManual),
    'con una fila de secretaría en pantalla, Retirar sigue apareciendo UNA sola vez',
    `botones=${filasRetirar}`);

  const st = P.__get();
  const manual = st.misInscripciones.find(i => i.canal === 'manual');
  const propia = st.misInscripciones.find(i => i.canal === 'portal');
  check('U12', P.puedeRetirar(propia) === true && P.puedeRetirar(manual) === false,
    'puedeRetirar: sí sobre la propia del portal, no sobre la de secretaría');

  // Ventana cerrada → desaparece el botón.
  await admin.from('carreras').update({ cierre_inscripcion: ayer }).eq('id', cAbierta);
  await P.loadMisInscripciones();
  const cerrado = dom.nodos.get('inscripciones-container').innerHTML;
  check('U13', !/Retirar/.test(cerrado),
    'con la ventana cerrada ya no se ofrece Retirar (eso es forfait, fuera de v1)');

  // El texto viene de un template literal con saltos de línea: se normaliza
  // el whitespace antes de buscarlo, si no el assert falla por el wrap.
  const plano = cerrado.replace(/\s+/g, ' ');
  check('U14',
    /Sólo se pueden retirar las inscripciones que cargaste vos desde el portal/i.test(plano)
    && /se dan de baja hablando con la secretaría/i.test(plano),
    'la tabla explica cuáles se pueden retirar y cuáles no',
    plano.slice(plano.indexOf('Sólo se pueden'), plano.indexOf('Sólo se pueden') + 90));
}

async function teardown() {
  console.log('\n── Teardown ──');
  const borrar = async (tabla, ids, col = 'id') => {
    if (!ids?.length) return;
    const { error } = await admin.from(tabla).delete().in(col, ids);
    if (error) console.error(`  ⚠️ teardown ${tabla}: ${error.message}`);
  };
  const { data: insc } = await admin.from('inscripciones')
    .select('id').in('carrera_id', fx.carreras.length ? fx.carreras : ['00000000-0000-0000-0000-000000000000']);
  const inscIds = (insc ?? []).map(r => r.id);
  await borrar('resultado_posiciones', inscIds, 'inscripcion_id');
  await borrar('inscripciones', inscIds);
  await borrar('carreras', fx.carreras);
  await borrar('reuniones', fx.reuniones);
  await borrar('spcs', fx.spcs);
  await borrar('caballerizas', fx.caballerizas);
  await borrar('profesionales', fx.profesionales);
  const { data: usrRows } = await admin.from('usuarios').select('id').in('email', fx.usuarios);
  await borrar('auditoria', (usrRows ?? []).map(r => r.id), 'usuario_id');
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

const pass = resultados.filter(r => r.estado === 'PASS').length;
const fail = resultados.filter(r => r.estado === 'FAIL').length;
console.log(`\n── Resumen ──\n  PASS ${pass}   FAIL ${fail}\n`);
if (fail) {
  resultados.filter(r => r.estado === 'FAIL')
    .forEach(r => console.log(`    ${r.id}. ${r.label} → ${r.detalle ?? ''}`));
}
process.exit(fail ? 1 : 0);
