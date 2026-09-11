/**
 * Probe — spcs.html, alta desde el Stud Book (pieza D-pantalla del plan studbook-buscar).
 *
 * Sin browser: extrae DEL HTML el bloque real que va desde `// STUD BOOK — buscar` hasta
 * `async function deleteRecord` (buscarStudBook, renderCandidatos, candidatoHTML, usarCandidato,
 * mostrarPanelDuplicados, saveRecord…) y lo corre con un `document` stub y el cliente Supabase
 * REAL de un operador de prueba (magiclink) — la función deployada y el RPC se llaman de verdad.
 *
 * Casos:
 *   1) buscar BIEN COQUETA → 2 candidatos exactos en pantalla, NINGUNO prellenado, fuente visible
 *   2) Usar(0) → form con nombre, sb 429819, fecha, hembra, color, padres, país, notas SB+url+alta
 *   3) buscar MARIA CATU → 0 exactos, rótulo "Sin coincidencia exacta", MARIA CATULENGA listada
 *   4) buscar ZZZZQ → mensaje "No está en el Stud Book"
 *   5) buscar "ab" → mensaje de la función (term_invalido), sin romper
 *   6) alta con studbook_id 431567 (LOGUACIOUS) → panel BLOQUEADO (sin "Guardar igual"), sin INSERT
 *   7) alta "OTRA" con fecha+padres de CONESERA → panel bloqueado por fecha_padre_madre, sin INSERT
 *   8) alta "WAVE RIMOUT" 2020, sin padres → panel con "Guardar igual", sin INSERT
 *   9) idem con {omitirDuplicados:true} → llega al INSERT (interceptado, no escribe)
 *  10) alta nombre único → rpc 0 filas → INSERT REAL con studbook_id → fila verificada → borrada
 * ESCRIBE: 1 usuario de prueba + 1 spc (caso 10); teardown en el finally, verificado por estado.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_spcs_studbook_alta.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(HERE, '..', 'spcs.html'), 'utf8');
const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) throw new Error('Falta SUPABASE_SECRET_KEY (source .env antes de correr).');
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const RUN = Date.now().toString(36);
const admin = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

// ---- extracción del código real -------------------------------------------------------------
const ini = HTML.indexOf('// STUD BOOK — buscar, elegir, prellenar.');
const fin = HTML.indexOf('async function deleteRecord');
if (ini < 0 || fin < 0) throw new Error('anclas no encontradas en spcs.html');
const CODE = HTML.slice(ini, fin);
// edad-spc.js real (misma que carga la página)
const EDAD = readFileSync(join(HERE, '..', 'edad-spc.js'), 'utf8');
const g = {}; new Function('window', EDAD)(g);   // el IIFE toma `window` si existe
if (typeof g.edadSPCTexto !== 'function') throw new Error('edad-spc.js no expuso edadSPCTexto');
const edadSPCTexto = g.edadSPCTexto;

// ---- DOM stub ---------------------------------------------------------------------------------
function makeDoc() {
  const els = {};
  const mk = (id) => els[id] || (els[id] = {
    id, value: '', innerHTML: '', textContent: '', hidden: false, disabled: false,
    _cls: new Set(),
    classList: { add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle() {}, _s: null },
    scrollIntoView() {},
  });
  const doc = {
    els,
    getElementById: (id) => { const e = mk(id); e.classList._s = e._cls; return e; },
    querySelectorAll: (sel) => {
      if (sel === '.sb-cand') return Object.values(els).filter(e => e.id.startsWith('sb-cand-')).map(e => { e.classList._s = e._cls; return e; });
      return [];
    },
    querySelector: () => null,
  };
  return doc;
}
const toasts = [];
const stubs = {
  toast: (m, t = 'success') => toasts.push({ m, t }),
  switchTab: () => {}, closeModal: () => {}, load: () => {}, openModal: () => {},
  escapeHtml: (s) => s == null ? '' : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
};

function build(sb, document, allData = []) {
  const f = new Function('sb', 'document', 'allData', 'editingId', 'toast', 'switchTab', 'closeModal', 'load', 'openModal', 'escapeHtml', 'edadSPCTexto', 'console',
    CODE + '\nreturn { sbReset, buscarStudBook, renderCandidatos, usarCandidato, mostrarPanelDuplicados, ocultarDuplicados, saveRecord, get sbCandidatos(){ return sbCandidatos; } };');
  const quiet = { ...console, error: () => {} };
  return f(sb, document, allData, null, stubs.toast, stubs.switchTab, stubs.closeModal, stubs.load, stubs.openModal, stubs.escapeHtml, edadSPCTexto, quiet);
}

// ---- sesión staff real ------------------------------------------------------------------------
const creados = []; let spcCreadoId = null;
async function sesion(rol) {
  const email = `probe.sbalta.${rol}.${RUN}@sgh.test`;
  const { data: au, error: eAu } = await admin.auth.admin.createUser({ email, password: `Px-${RUN}-${Math.random().toString(36).slice(2)}`, email_confirm: true });
  if (eAu) throw new Error('createUser: ' + eAu.message);
  creados.push({ email, authId: au.user.id });
  const { error: eIns } = await admin.from('usuarios').insert({ email, nombre_completo: `Probe sbalta ${rol} ${RUN}`, club_id: CLUB, rol, activo: true, estado: 'activo', password_hash: '', auth_user_id: au.user.id });
  if (eIns) throw new Error('insert usuarios: ' + eIns.message);
  const { data: link, error: eLink } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (eLink) throw new Error('generateLink: ' + eLink.message);
  const cli = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eOtp } = await cli.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (eOtp) throw new Error('verifyOtp: ' + eOtp.message);
  return cli;
}
// sb con INSERT en spcs interceptado (para los casos que NO deben escribir)
function sbSinInsert(real, log) {
  return new Proxy(real, { get(t, p) {
    if (p !== 'from') return Reflect.get(t, p);
    return (tabla) => {
      const q = t.from(tabla);
      if (tabla !== 'spcs') return q;
      return new Proxy(q, { get(qt, qp) {
        if (qp === 'insert') return (payload) => { log.push(payload); return { select: () => ({ single: async () => ({ data: { id: 'fake-' + RUN }, error: null }) }) }; };
        return Reflect.get(qt, qp);
      } });
    };
  } });
}
const setForm = (doc, vals) => { for (const [k, v] of Object.entries(vals)) doc.getElementById(k).value = v; };
const FORM_VACIO = { 'f-nombre': '', 'f-registro': '', 'f-studbook-id': '', 'f-nacimiento': '', 'f-sexo-form': 'macho', 'f-color': '', 'f-marcas': '', 'f-caballeriza-form': '', 'f-entrenador': '', 'f-jockey': '', 'f-estado-spc': 'activo', 'f-notas': '', 'f-padrillo': '', 'f-madre': '', 'f-ult-perf': '', 'f-abuela': '', 'f-pais': 'Argentina' };

try {
  const staff = await sesion('operador');
  const inserts = [];
  const doc = makeDoc();
  const m = build(sbSinInsert(staff, inserts), doc);

  // 1) BIEN COQUETA
  setForm(doc, FORM_VACIO); doc.getElementById('sb-term').value = 'BIEN COQUETA';
  await m.buscarStudBook();
  let html = doc.getElementById('sb-result').innerHTML;
  ok('1) BIEN COQUETA → 2 coincidencias exactas en pantalla', /2 coincidencias exactas/.test(html) && (html.match(/class="sb-cand"/g) || []).length === 2, html.slice(0, 120));
  ok('1) … muestra fecha, edad, sexo, pelaje, padres y SB de cada una', /15\/10\/2021 \(/.test(html) && /29\/07\/1998 \(/.test(html) && /Hembra/.test(html) && /Zaino Colorado/.test(html) && /Bien Terminado × Gritty/.test(html) && /SB 429819/.test(html) && /SB 216248/.test(html));
  ok('1) … NADA prellenado (f-nombre y f-studbook-id vacíos)', doc.getElementById('f-nombre').value === '' && doc.getElementById('f-studbook-id').value === '');
  ok('1) … fuente visible viene de la función', /fuente: studbook\.org\.ar\/ejemplares\/autocomplete/.test(doc.getElementById('sb-fuente').textContent), doc.getElementById('sb-fuente').textContent);
  ok('1) … botón Buscar vuelve a habilitado', doc.getElementById('sb-btn').disabled === false && doc.getElementById('sb-btn').textContent === 'Buscar');

  // 2) Usar(0)
  m.usarCandidato(0);
  const v = (id) => doc.getElementById(id).value;
  ok('2) Usar(0) → nombre, sb 429819, 2021-10-15, hembra, Zaino Colorado, padres, Argentina', v('f-nombre') === 'BIEN COQUETA' && v('f-studbook-id') === '429819' && v('f-nacimiento') === '2021-10-15' && v('f-sexo-form') === 'hembra' && v('f-color') === 'Zaino Colorado' && v('f-padrillo') === 'Bien Terminado' && v('f-madre') === 'Gritty' && v('f-pais') === 'Argentina', JSON.stringify(['f-nombre', 'f-studbook-id', 'f-nacimiento', 'f-sexo-form', 'f-color', 'f-padrillo', 'f-madre', 'f-pais'].map(v)));
  ok('2) … notas: SB 429819 · url perfil · alta desde spcs.html · abuelo materno; f-abuela vacía', /^SB 429819 · https:\/\/www\.studbook\.org\.ar\/ejemplares\/perfil\/429819\/bien-coqueta · alta desde spcs\.html \d{2}\/\d{2}\/\d{4} · abuelo materno: Luhuk \(USA\)/.test(v('f-notas')) && v('f-abuela') === '', v('f-notas'));
  ok('2) … candidato 0 marcado sb-elegido, el 1 no', doc.getElementById('sb-cand-0').classList.contains('sb-elegido') && !doc.getElementById('sb-cand-1').classList.contains('sb-elegido'));

  // 3) MARIA CATU
  doc.getElementById('sb-term').value = 'MARIA CATU'; await m.buscarStudBook();
  html = doc.getElementById('sb-result').innerHTML;
  ok('3) MARIA CATU → "Sin coincidencia exacta — parecidos" con MARIA CATULENGA', /Sin coincidencia exacta/.test(html) && /MARIA CATULENGA/.test(html) && !/coincidencias? exacta[s]?:/.test(html), html.slice(0, 100));

  // 4) ZZZZQ
  doc.getElementById('sb-term').value = 'ZZZZQ'; await m.buscarStudBook();
  ok('4) ZZZZQ → "No está en el Stud Book"', /No está en el Stud Book con ese nombre/.test(doc.getElementById('sb-result').innerHTML) && m.sbCandidatos.length === 0);

  // 5) término corto: la pantalla corta antes ("al menos 3 letras"); y "abc" que la función acepta pero da 0
  doc.getElementById('sb-term').value = 'ab'; await m.buscarStudBook();
  ok('5) "ab" → mensaje de la pantalla, sin llamar', /al menos 3 letras/.test(doc.getElementById('sb-result').innerHTML));

  // 6) alta con studbook_id de LOGUACIOUS → bloquea
  setForm(doc, { ...FORM_VACIO, 'f-nombre': 'LOGUARCIUS', 'f-studbook-id': '431567' });
  await m.saveRecord();
  let dup = doc.getElementById('dup-panel');
  ok('6) sb 431567 → panel visible, motivo "mismo nº Stud Book", LOGUACIOUS listado', dup.hidden === false && /mismo nº Stud Book/.test(doc.getElementById('dup-list').innerHTML) && /LOGUACIOUS/.test(doc.getElementById('dup-list').innerHTML), doc.getElementById('dup-list').innerHTML.slice(0, 160));
  ok('6) … BLOQUEADO: texto "mismo animal", sin botón Guardar igual, sin INSERT', /mismo animal/.test(doc.getElementById('dup-texto').textContent) && doc.getElementById('dup-actions').innerHTML === '' && inserts.length === 0);
  ok('6) … botón Guardar rehabilitado', doc.getElementById('btn-save').disabled === false);

  // 7) fecha + padres de CONESERA con otro nombre → bloquea por fecha_padre_madre
  setForm(doc, { ...FORM_VACIO, 'f-nombre': 'OTRA YEGUA', 'f-nacimiento': '2023-09-20', 'f-padrillo': 'Emmanuel', 'f-madre': 'Milonga Burrera' });
  m.ocultarDuplicados(); await m.saveRecord();
  ok('7) fecha+padres de CONESERA → bloqueado por "misma fecha y padres", sin INSERT', doc.getElementById('dup-panel').hidden === false && /misma fecha y padres/.test(doc.getElementById('dup-list').innerHTML) && /CONESERA/.test(doc.getElementById('dup-list').innerHTML) && doc.getElementById('dup-actions').innerHTML === '' && inserts.length === 0, doc.getElementById('dup-list').innerHTML.slice(0, 160));

  // 8) homónimo: WAVE RIMOUT con otra fecha y sin padres → sólo nombre → Guardar igual
  setForm(doc, { ...FORM_VACIO, 'f-nombre': 'WAVE RIMOUT', 'f-nacimiento': '2020-01-01' });
  m.ocultarDuplicados(); await m.saveRecord();
  ok('8) WAVE RIMOUT 2020 → panel sólo "mismo nombre" (2 filas), botón "Guardar igual", sin INSERT', doc.getElementById('dup-panel').hidden === false && (doc.getElementById('dup-list').innerHTML.match(/mismo nombre/g) || []).length === 2 && !/misma fecha|mismo nº/.test(doc.getElementById('dup-list').innerHTML) && /Guardar igual/.test(doc.getElementById('dup-actions').innerHTML) && inserts.length === 0, doc.getElementById('dup-actions').innerHTML);

  // 9) Guardar igual → llega al INSERT (interceptado)
  await m.saveRecord({ omitirDuplicados: true });
  ok('9) omitirDuplicados → INSERT con nombre WAVE RIMOUT, studbook_id null, fecha 2020-01-01', inserts.length === 1 && inserts[0].nombre === 'WAVE RIMOUT' && inserts[0].studbook_id === null && inserts[0].fecha_nacimiento === '2020-01-01', JSON.stringify(inserts[0]));
  ok('9) … panel oculto, toast "SPC creado"', doc.getElementById('dup-panel').hidden === true && toasts.some(t => t.m === 'SPC creado'));

  // 10) INSERT real con nombre único + studbook_id (rpc 0 filas)
  const doc2 = makeDoc(); const m2 = build(staff, doc2);
  const NOMBRE = `PROBE SBALTA ${RUN.toUpperCase()}`; const SBID = `probe-${RUN}`;
  setForm(doc2, { ...FORM_VACIO, 'f-nombre': NOMBRE, 'f-studbook-id': SBID, 'f-nacimiento': '2021-01-01', 'f-sexo-form': 'hembra', 'f-padrillo': 'Probe Padre', 'f-madre': 'Probe Madre', 'f-notas': `SB ${SBID} · probe D-pantalla` });
  await m2.saveRecord();
  const { data: fila } = await admin.from('spcs').select('id,nombre,studbook_id,fecha_nacimiento,sexo,padrillo_nombre,madre_nombre,registro_stud_book,club_id').eq('nombre', NOMBRE).maybeSingle();
  spcCreadoId = fila?.id || null;
  ok('10) nombre único → INSERT real: fila con studbook_id, sexo hembra, padres, registro NULL, club NULL', !!fila && fila.studbook_id === SBID && fila.sexo === 'hembra' && fila.padrillo_nombre === 'Probe Padre' && fila.registro_stud_book === null && fila.club_id === null && doc2.getElementById('dup-panel').hidden === true, JSON.stringify(fila));
  // 10b) volver a dar de alta el mismo → bloqueado por studbook_id (y nombre)
  const doc3 = makeDoc(); const ins3 = []; const m3 = build(sbSinInsert(staff, ins3), doc3);
  setForm(doc3, { ...FORM_VACIO, 'f-nombre': NOMBRE, 'f-studbook-id': SBID });
  await m3.saveRecord();
  ok('10) mismo studbook_id de nuevo → bloqueado (motivos studbook_id + nombre), sin INSERT', doc3.getElementById('dup-panel').hidden === false && /mismo nº Stud Book/.test(doc3.getElementById('dup-list').innerHTML) && doc3.getElementById('dup-actions').innerHTML === '' && ins3.length === 0);
} finally {
  if (spcCreadoId) { await admin.from('spc_propietarios').delete().eq('spc_id', spcCreadoId); await admin.from('spcs').delete().eq('id', spcCreadoId); }
  for (const c of creados) { await admin.from('usuarios').delete().eq('email', c.email); await admin.auth.admin.deleteUser(c.authId); }
  const { data: restSpc } = await admin.from('spcs').select('id').like('nombre', 'PROBE SBALTA %');
  ok('T) teardown: 0 spcs de prueba', (restSpc || []).length === 0, JSON.stringify(restSpc));
  const { count } = await admin.from('spcs').select('id', { count: 'exact', head: true });
  ok('T) count spcs = 203 (baseline CLAUDE.md)', count === 203, String(count));
  const { data: rest } = await admin.from('usuarios').select('email').like('email', `probe.sbalta.%.${RUN}@sgh.test`);
  ok('T) teardown: 0 usuarios de prueba', (rest || []).length === 0, JSON.stringify(rest));
  const { data: au } = await admin.auth.admin.listUsers({ perPage: 200 });
  ok('T) teardown: 0 usuarios de prueba en auth', !(au?.users || []).some(u => u.email?.includes('probe.sbalta.') && u.email?.includes(RUN)));
}
for (const x of results) console.log(`${x.s} ${x.t}${x.n ? '  → ' + x.n : ''}`);
const fails = results.filter(x => x.s === '❌').length;
console.log(`\n${results.length - fails}/${results.length} asserts OK`);
process.exit(fails ? 1 : 0);
