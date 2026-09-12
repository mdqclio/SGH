/**
 * Probe — aviso (no bloqueo) de jockey repetido en la misma carrera, en los
 * cuatro puntos de UI: inscripciones.html, portal.html, ratificacion.html y el
 * modal Montas de resultados.html. Código real, sin browser. SOLO LECTURA.
 *
 * EL PEDIDO (Yesi, 12/09/2026)
 * ---------------------------------------------------------------------------
 * Que se vea cuando un jockey ya está cargado en otro caballo del mismo turno.
 * Aviso y no bloqueo: en la inscripción es normal (R9 hoy tiene 4 turnos así) y
 * después de la carrera el jockey queda en el caballo que no largó mientras se
 * lo carga en el que corrió (R8 T5, Aguirre — el backfill del 17/08). Y el
 * aviso viejo de ratificación contaba forfaits y mal inscriptos: 7 de los 8
 * casos históricos no eran colisión. Relevamiento:
 * docs/diagnosticos/2026-09-12_jockey-repetido-misma-carrera.md (reports).
 *
 * QUÉ VERIFICA
 * ---------------------------------------------------------------------------
 *   H) jockey-repetido.js — el helper compartido, con casos sintéticos:
 *      forfait/mal_inscrito con el mismo jockey NO cuentan; inscripto +
 *      inscripto y ratificado + ratificado SÍ.
 *   R9) Datos reales: los 4 turnos de R9 con jockey repetido (T2 Gonzalez ×3,
 *      T5 Canto ×2, T10 Aguirre ×3, T11 Canto ×2) avisan; los otros 7 no.
 *   R8) Datos reales, los 8 casos históricos: los 7 "forfait/mal_inscrito +
 *      ratificado" ya NO avisan; R8 T5 (Aguirre, los dos ratificados) avisa en
 *      ratificación (correcto: ahí los dos estaban activos).
 *   A) inscripciones.html — renderInscripciones() real con DOM stub: badge
 *      ⚠ dup. en las filas de R9 T2 y en ninguna de un turno limpio.
 *   B) portal.html — avisoJockeyRepetidoPortal() real: muestra el aviso cuando
 *      el jockey elegido ya está en otro caballo mío activo del turno; no lo
 *      muestra si ese otro está en forfait.
 *   C) ratificacion.html — texto: cuenta con conteoJockeysActivos y el
 *      updateCounter recalcula; el conteo viejo (todas las filas) no está.
 *   D) resultados.html Montas — moJockeysRepetidos() y saveMontas() reales
 *      sobre R8 T5 con noLargoMandiles armado como lo hace la pantalla:
 *      NOCHE EN VELA no largó → sin aviso; y el backfill (cargar Aguirre en
 *      LA LAGUNERA J con Aguirre todavía en NOCHE EN VELA) NO queda
 *      bloqueado: saveMontas emite el UPDATE (contra un sb falso que sólo
 *      registra; la base no se toca).
 *
 * PATRÓN (tests/README.md § "Browser NO disponible")
 * ---------------------------------------------------------------------------
 * Se extraen las funciones de los HTML por ancla con balance de llaves y se
 * corren con new Function / AsyncFunction inyectando el cliente Supabase real
 * (lectura), un mini-DOM y stubs. Nada se reimplementa.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_aviso_jockey_repetido.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }

const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const R9_ID   = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9';   // Reunión 9 — 20/09/2026
const R8_ID   = '7b6e003e-22e2-4629-bf55-f18560b1260f';   // Reunión 8 — 16/08/2026 (finalizada)
const R6_ID   = 'b02ca761-6f44-4720-86aa-a3c3099019ea';   // Reunión 6 — 20/06/2026

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const rd = (f) => readFileSync(process.env[`SRC_${f.replace(/[.-]/g, '_').toUpperCase()}`] || join(ROOT, f), 'utf8');
const HELPER = rd('jockey-repetido.js');
const INSC   = rd('inscripciones.html');
const PORTAL = rd('portal.html');
const RATI   = rd('ratificacion.html');
const RESU   = rd('resultados.html');
const CHAPAS = rd('renumerar-chapas.js');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

function extractFn(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  let d = 0;
  for (let k = i + firma.length - 1; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error(`no pude cerrar: ${firma}`);
}

// El helper, cargado como lo carga el browser (script clásico → globales).
const H = {};
new Function('window', HELPER + '\nwindow.conteoJockeysActivos = conteoJockeysActivos; window.jockeysRepetidos = jockeysRepetidos; window.badgeJockeyDup = badgeJockeyDup; window.ESTADOS_ACTIVOS_MONTA = ESTADOS_ACTIVOS_MONTA;')(H);

function mkDom() {
  const nodos = {};
  const get = (id) => (nodos[id] ||= {
    id, innerHTML: '', value: '', textContent: '', hidden: false, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, insertAdjacentHTML() {},
  });
  return { _n: nodos, getElementById: get, querySelectorAll: () => [], createElement: () => ({ className: '', textContent: '', remove() {} }) };
}

// ═══════════════════════════ H — helper sintético ═══════════════════════════
const J1 = 'j1', J2 = 'j2';
const f = (estado, j) => ({ estado, jockey_titular_id: j });
ok('H1) forfait + ratificado, mismo jockey → NO repetido', H.jockeysRepetidos([f('forfait', J1), f('ratificado', J1)]).size === 0);
ok('H2) mal_inscrito + ratificado, mismo jockey → NO repetido', H.jockeysRepetidos([f('mal_inscrito', J1), f('ratificado', J1)]).size === 0);
ok('H3) inscripto + inscripto, mismo jockey → repetido', H.jockeysRepetidos([f('inscripto', J1), f('inscripto', J1)]).has(J1));
ok('H4) ratificado + ratificado, mismo jockey → repetido', H.jockeysRepetidos([f('ratificado', J1), f('ratificado', J1)]).has(J1));
ok('H5) inscripto + ratificado, mismo jockey → repetido', H.jockeysRepetidos([f('inscripto', J1), f('ratificado', J1)]).has(J1));
ok('H6) dos jockeys distintos → nada', H.jockeysRepetidos([f('inscripto', J1), f('inscripto', J2)]).size === 0);
ok('H7) sin jockey no cuenta', H.jockeysRepetidos([f('inscripto', null), f('inscripto', null), f('inscripto', undefined)]).size === 0);
ok('H8) conteo ×3', H.conteoJockeysActivos([f('inscripto', J1), f('inscripto', J1), f('ratificado', J1), f('forfait', J1)])[J1] === 3);
ok('H9) badge lleva ⚠ dup. y la cantidad', /⚠ dup\. ×3/.test(H.badgeJockeyDup(3)) && /badge-jockey-dup/.test(H.badgeJockeyDup(2)));

// ═══════════════════════════ datos reales ═══════════════════════════════════
async function inscDeReunion(reunionId) {
  const { data, error } = await sb.from('inscripciones')
    .select('id, carrera_id, spc_id, estado, numero_partidor, jockey_titular_id, jockey_suplente_id, caballeriza_id, entrenador_id, canal, peon, capataz, sereno, certificado_correr, spcs(nombre), carreras!inner(id, numero_turno, reunion_id)')
    .eq('carreras.reunion_id', reunionId);
  if (error) throw error;
  return data;
}
const { data: profs } = await sb.from('profesionales').select('id, apellido, nombre, tipo').eq('club_id', CLUB_ID);
const profsMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
const nomJ = (id) => profsMap[id] ? `${profsMap[id].apellido}, ${profsMap[id].nombre}` : id;
const porTurno = (insc) => { const m = {}; insc.forEach(i => (m[i.carreras.numero_turno] ||= []).push(i)); return m; };

// R9
const r9 = porTurno(await inscDeReunion(R9_ID));
const ESPERADO_R9 = { 2: 'GONZALEZ, LUCAS', 5: 'CANTO, TOBIAS', 10: 'AGUIRRE, HUGO', 11: 'CANTO, TOBIAS' };
for (const t of Object.keys(r9).map(Number).sort((a, b) => a - b)) {
  const rep = [...H.jockeysRepetidos(r9[t])].map(nomJ);
  if (ESPERADO_R9[t]) ok(`R9) T${t} avisa: ${ESPERADO_R9[t]}`, rep.length === 1 && rep[0] === ESPERADO_R9[t], rep.join(' | ') || '(nada)');
  else ok(`R9) T${t} sin aviso`, rep.length === 0, rep.join(' | '));
}
ok('R9) T2 Gonzalez ×3', H.conteoJockeysActivos(r9[2] || [])[Object.keys(profsMap).find(id => nomJ(id) === 'GONZALEZ, LUCAS')] === 3);
ok('R9) T10 Aguirre ×3', H.conteoJockeysActivos(r9[10] || [])[Object.keys(profsMap).find(id => nomJ(id) === 'AGUIRRE, HUGO')] === 3);

// R8 + R6: los 8 casos históricos
const r8 = porTurno(await inscDeReunion(R8_ID));
const r6 = porTurno(await inscDeReunion(R6_ID));
const SIN_COLISION = [['R6', r6, 9, 'PRESA, DANIEL'], ['R8', r8, 2, 'LOPEZ, ALEXIS'], ['R8', r8, 3, 'GONZALEZ, LUCAS'],
  ['R8', r8, 5, 'DELLI QUADRI, IGNACIO DANIEL'], ['R8', r8, 8, 'PRESA, DANIEL'], ['R8', r8, 10, 'TORRES, ANIBAL'], ['R8', r8, 11, 'CONTRERAS, JUAN CRUZ']];
for (const [r, m, t, jockey] of SIN_COLISION) {
  const rep = [...H.jockeysRepetidos(m[t] || [])].map(nomJ);
  ok(`R8) ${r} T${t} ${jockey}: forfait/mal_inscrito + ratificado → ya no avisa`, !rep.includes(jockey), rep.join(' | ') || '(nada)');
}
{
  const rep = [...H.jockeysRepetidos(r8[5] || [])].map(nomJ);
  ok('R8) T5 AGUIRRE, HUGO: los dos ratificados → avisa en ratificación (correcto)', rep.includes('AGUIRRE, HUGO') && rep.length === 1, rep.join(' | '));
}

// ═══════════════════ A — inscripciones.html renderInscripciones ═════════════
{
  const src = extractFn(INSC, 'function renderInscripciones() {');
  ok('A0) inscripciones.html carga jockey-repetido.js', /<script src="jockey-repetido\.js"><\/script>/.test(INSC));
  const run = new Function('document', 'inscripciones', 'getSpc', 'getCab', 'getProf', 'conteoJockeysActivos', 'badgeJockeyDup', 'ESTADOS_ACTIVOS_MONTA', src + '\nrenderInscripciones();');
  const render = (insc) => {
    const dom = mkDom();
    run(dom, insc, () => null, () => null, (id) => profsMap[id] || null, H.conteoJockeysActivos, H.badgeJockeyDup, H.ESTADOS_ACTIVOS_MONTA);
    return dom._n['list-container'].innerHTML;
  };
  const htmlT2 = render(r9[2]);
  const dupsT2 = (htmlT2.match(/badge-jockey-dup/g) || []).length;
  ok('A1) R9 T2: 3 filas con ⚠ dup. (Gonzalez ×3)', dupsT2 === 3, `badges: ${dupsT2}`);
  ok('A2) R9 T2: las filas marcadas son las de Gonzalez', ['DEL CAMPEON', 'OLA DOCTOR', 'TOUCH OF BLUE'].every(n => new RegExp(`<tr class="jockey-duplicado">\\s*<td><div class="spc-name">${n}</div>`).test(htmlT2)));
  ok('A3) R9 T2: ALHENA (Hahn, único) sin badge', /<tr>\s*<td><div class="spc-name">ALHENA<\/div>/.test(htmlT2));
  const limpio = Object.keys(r9).map(Number).find(t => !ESPERADO_R9[t]);
  ok(`A4) R9 T${limpio} (turno limpio): 0 badges`, (render(r9[limpio]).match(/badge-jockey-dup/g) || []).length === 0);
  // R8 T2: Lopez en WILSON SECURITY (ratificado) + MAC VITAL (forfait) → 0 badges
  ok('A5) R8 T2 (Lopez: ratificado + forfait): 0 badges', (render(r8[2]).match(/badge-jockey-dup/g) || []).length === 0);
  ok('A6) saveRecord llama avisarJockeyRepetido (toast, no return antes del insert)', /await loadInscripciones\(\);\s*avisarJockeyRepetido\(payload\.jockey_titular_id\);/.test(INSC));
  const av = extractFn(INSC, 'function avisarJockeyRepetido(jockeyId) {');
  const toasts = [];
  new Function('inscripciones', 'getProf', 'toast', 'conteoJockeysActivos', av + "\navisarJockeyRepetido(arguments[4]);")(r9[2], (id) => profsMap[id], (m, t) => toasts.push([m, t]), H.conteoJockeysActivos, r9[2].find(i => nomJ(i.jockey_titular_id) === 'GONZALEZ, LUCAS').jockey_titular_id);
  ok('A7) toast de aviso al guardar con Gonzalez en T2, tipo warning', toasts.length === 1 && /GONZALEZ, LUCAS queda en 3 caballos/.test(toasts[0][0]) && toasts[0][1] === 'warning', JSON.stringify(toasts));
}

// ═══════════════════ B — portal.html avisoJockeyRepetidoPortal ══════════════
{
  ok('B0) portal.html carga jockey-repetido.js y pide jockey_titular_id', /<script src="jockey-repetido\.js"><\/script>/.test(PORTAL) && /created_at,jockey_titular_id,spcs\(nombre\)/.test(PORTAL));
  const src = extractFn(PORTAL, 'function avisoJockeyRepetidoPortal() {');
  const corre = (misInscripciones, jockeyId, carreraId) => {
    const dom = mkDom();
    dom.getElementById('minsc-jockey').value = jockeyId;
    new Function('document', 'misInscripciones', 'carreraSeleccionada', 'ESTADOS_ACTIVOS_MONTA', src + '\navisoJockeyRepetidoPortal();')(dom, misInscripciones, { id: carreraId }, H.ESTADOS_ACTIVOS_MONTA);
    return dom._n['minsc-jockey-aviso'];
  };
  const gonz = r9[2].find(i => nomJ(i.jockey_titular_id) === 'GONZALEZ, LUCAS');
  const mias = r9[2].filter(i => i.jockey_titular_id === gonz.jockey_titular_id).slice(0, 2);   // como si fueran míos
  const a1 = corre(mias, gonz.jockey_titular_id, gonz.carrera_id);
  ok('B1) jockey ya en 2 caballos míos del turno → aviso visible con los nombres', a1.hidden === false && /Ya declaraste este jockey en/.test(a1.textContent) && mias.every(i => a1.textContent.includes(i.spcs.nombre)), a1.textContent);
  const a2 = corre(mias.map(i => ({ ...i, estado: 'forfait' })), gonz.jockey_titular_id, gonz.carrera_id);
  ok('B2) los otros en forfait → sin aviso', a2.hidden === true && a2.textContent === '');
  const a3 = corre(mias, gonz.jockey_titular_id, 'otra-carrera');
  ok('B3) otro turno → sin aviso', a3.hidden === true);
  const a4 = corre(mias, '', gonz.carrera_id);
  ok('B4) sin jockey elegido → sin aviso', a4.hidden === true);
  ok('B5) el aviso dice que se puede anotar igual (no bloqueo)', /Podés anotar igual/.test(a1.textContent));
}

// ═══════════════════ C — ratificacion.html (texto + recalc) ═════════════════
{
  ok('C0) ratificacion.html carga jockey-repetido.js', /<script src="jockey-repetido\.js"><\/script>/.test(RATI));
  ok('C1) render: jockeyCount = conteoJockeysActivos(insc)', /const jockeyCount = conteoJockeysActivos\(insc\);/.test(RATI));
  ok('C2) el conteo viejo sobre todas las filas ya no está', !/insc\.forEach\(i => \{ if \(i\.jockey_titular_id\) jockeyCount/.test(RATI));
  ok('C3) recalcJockeyColisiones cuenta por estado de fila', /conteoJockeysActivos\(filas\.map/.test(extractFn(RATI, 'function recalcJockeyColisiones(carreraId) {')));
  ok('C4) updateCounter recalcula el aviso tras cada cambio de estado', /recalcJockeyColisiones\(carreraId\);\s*\}/.test(extractFn(RATI, 'function updateCounter(inscId) {')));
  ok('C5) ratificar() sigue sin mirar colisiones (no bloqueo)', !/olision|repetid/.test(extractFn(RATI, 'async function ratificar(inscId) {')));
  // estadoDeFila con un badge stub
  const edf = extractFn(RATI, 'function estadoDeFila(row) {');
  const estado = (cls) => new Function(edf + '\nreturn estadoDeFila(arguments[0]);')({ querySelector: () => ({ classList: cls.split(' ') }) });
  ok('C6) estadoDeFila lee badge-ratificado / badge-mal_inscrito', estado('badge badge-ratificado') === 'ratificado' && estado('badge badge-mal_inscrito') === 'mal_inscrito');
}

// ═══════════════════ D — resultados.html Montas sobre R8 T5 ═════════════════
{
  ok('D0) resultados.html carga jockey-repetido.js', /<script src="jockey-repetido\.js"><\/script>/.test(RESU));
  const t5 = r8[5];
  const carreraId = t5[0].carrera_id;
  const { data: res } = await sb.from('resultados').select('id, estado').eq('carrera_id', carreraId).single();
  const { data: pos } = await sb.from('resultado_posiciones').select('inscripcion_id, posicion, no_largo').eq('resultado_id', res.id);
  // noLargoMandiles como lo arma la pantalla al cargar la carrera (resultados.html, "Inicializar no_largo desde posiciones guardadas")
  const chapas = {}; new Function('window', CHAPAS + '\nwindow.renumerarChapas = renumerarChapas;')(chapas);
  const ratificados = t5.filter(i => i.estado === 'ratificado');
  const chapaForInsc = chapas.renumerarChapas(ratificados);
  const noLargoMandiles = new Set(pos.filter(p => p.no_largo).map(p => chapaForInsc[p.inscripcion_id]).filter(n => n != null));
  const noche = t5.find(i => i.spcs.nombre === 'NOCHE EN VELA'), lagunera = t5.find(i => i.spcs.nombre === 'LA LAGUNERA J');
  ok('D1) R8 T5: NOCHE EN VELA no largó (dato persistido)', noLargoMandiles.has(chapaForInsc[noche.id]), `noLargo mandiles: ${[...noLargoMandiles]}`);
  ok('D2) R8 T5: Aguirre en los dos, ratificados', noche.jockey_titular_id === lagunera.jockey_titular_id && nomJ(noche.jockey_titular_id) === 'AGUIRRE, HUGO');

  const piezas = [
    extractFn(RESU, 'function moInscripciones(carreraId) {'),
    extractFn(RESU, 'function noLargoIds(carreraId) {'),
    extractFn(RESU, 'function moJockeysRepetidos() {'),
    extractFn(RESU, 'async function saveMontas() {'),
  ].join('\n\n');
  // sb FALSO: registra los UPDATE y no escribe nada.
  const updates = [];
  const sbFalso = { from: () => ({ update: (payload) => ({ eq: async (col, val) => { updates.push({ ...payload, id: val }); return { error: null }; } }) }) };
  const toasts = [];
  const make = (valores, moOriginal) => {
    const dom = mkDom();
    Object.entries(valores).forEach(([id, v]) => { dom.getElementById(`mo-${id}`).value = v || ''; });
    const fn = new AsyncFunction('document', 'sb', 'toast', 'inscripciones', 'currentCarreraId', 'noLargoMandiles', 'resultados', 'posicionesMap', 'renumerarChapas', 'conteoJockeysActivos', 'badgeJockeyDup', 'profsMap', 'moOriginal',
      piezas + '\nreturn { rep: moJockeysRepetidos(), save: saveMontas };');
    return fn(dom, sbFalso, (m, t) => toasts.push([m, t]), t5.map(i => ({ ...i })), carreraId, noLargoMandiles, {}, {}, chapas.renumerarChapas, H.conteoJockeysActivos, H.badgeJockeyDup, profsMap, moOriginal);
  };
  // (i) estado actual de la base: Aguirre en los dos, uno no largó → sin aviso
  const actual = Object.fromEntries(ratificados.map(i => [i.id, i.jockey_titular_id]));
  const r1 = await make(actual, { ...actual });
  ok('D3) estado actual (Aguirre ×2, NOCHE EN VELA no largó) → moJockeysRepetidos sin repetidos', Object.values(r1.rep.conteo).every(n => n < 2), JSON.stringify(r1.rep.conteo));
  // (ii) el backfill del 17/08: LA LAGUNERA J venía sin jockey y se le carga Aguirre con Aguirre todavía en NOCHE EN VELA → NO bloquea
  updates.length = 0; toasts.length = 0;
  const antes = { ...actual, [lagunera.id]: null };
  const r2 = await make(actual, antes);
  await r2.save();
  ok('D4) backfill R8 T5: saveMontas emite el UPDATE de LA LAGUNERA J (no bloqueado)', updates.length === 1 && updates[0].id === lagunera.id && updates[0].jockey_titular_id === lagunera.jockey_titular_id, JSON.stringify(updates));
  ok('D5) backfill R8 T5: toast de guardado y NINGÚN aviso de repetido (el otro no largó)', toasts.some(t => /monta\(s\) guardada/.test(t[0])) && !toasts.some(t => t[1] === 'warning'), JSON.stringify(toasts));
  // (iii) mismo jockey en dos que SÍ largaron → aviso warning, pero se guarda igual
  updates.length = 0; toasts.length = 0;
  const otro = ratificados.find(i => i.id !== noche.id && i.id !== lagunera.id && !noLargoMandiles.has(chapaForInsc[i.id]));
  const conDup = { ...actual, [otro.id]: lagunera.jockey_titular_id };
  const r3 = await make(conDup, { ...actual });
  await r3.save();
  ok('D6) Aguirre en dos que largaron → se guarda igual (UPDATE emitido) + toast warning', updates.length === 1 && updates[0].id === otro.id && toasts.some(t => t[1] === 'warning' && /AGUIRRE, HUGO/.test(t[0])), JSON.stringify({ updates, toasts }));
  ok('D7) montasFaltantes usa noLargoIds (refactor sin cambio de criterio)', /const noLargo = noLargoIds\(carreraId\);/.test(extractFn(RESU, 'function montasFaltantes(carreraId) {')));
  // Verificación de que D no escribió: releer las dos filas de la base real.
  const { data: relectura } = await sb.from('inscripciones').select('id, jockey_titular_id, estado').in('id', [lagunera.id, otro.id]);
  const igual = (relectura || []).every(r => { const o = t5.find(i => i.id === r.id); return o && o.jockey_titular_id === r.jockey_titular_id && o.estado === r.estado; });
  ok('D8) la base no se tocó: LA LAGUNERA J y el tercer caballo siguen como estaban', relectura?.length === 2 && igual, JSON.stringify(relectura));
}

// ═══════════════════════════════ reporte ════════════════════════════════════
for (const r of results) console.log(`${r.s} ${r.t}${r.n ? `  — ${r.n}` : ''}`);
const fails = results.filter(r => r.s === '❌').length;
console.log(`\n${results.length - fails}/${results.length} asserts OK${fails ? ` — ${fails} FALLARON` : ''}`);
process.exit(fails ? 1 : 0);
