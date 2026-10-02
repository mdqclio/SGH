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
 *   S) Turnos SINTÉTICOS (02/10/2026, reemplazan a los de R9): ×3, ×2, turno
 *      limpio, forfait + ratificado y mal_inscrito + ratificado. Antes eran datos
 *      reales de R9 fijados al 12/09; las montas de R9 se editaron después
 *      (ratificación y día de carrera) y los asserts quedaron en rojo por drift,
 *      no por un bug (informe 2026-10-02_r9-jockey-dos-caballos-t3-t5-t11.md).
 *   R8) Datos reales, los 8 casos históricos: los 7 "forfait/mal_inscrito +
 *      ratificado" ya NO avisan; R8 T5 (Aguirre, los dos ratificados) avisa en
 *      ratificación (correcto: ahí los dos estaban activos).
 *   A) inscripciones.html — renderInscripciones() real con DOM stub sobre los
 *      turnos sintéticos: badge ⚠ dup. en las 3 filas del ×3 y en ninguna del
 *      turno limpio ni del forfait + ratificado.
 *   B) portal.html — avisoJockeyRepetidoPortal() real sobre el turno sintético:
 *      muestra el aviso cuando el jockey elegido ya está en otro caballo mío
 *      activo del turno; no lo muestra si ese otro está en forfait.
 *   C) ratificacion.html — texto: cuenta con conteoJockeysActivos y el
 *      updateCounter recalcula; el conteo viejo (todas las filas) no está.
 *   D) resultados.html Montas — moJockeysRepetidos() y saveMontas() reales
 *      sobre R8 T5 con noLargoMandiles armado como lo hace la pantalla:
 *      NOCHE EN VELA no largó → sin aviso; y el backfill (cargar Aguirre en
 *      LA LAGUNERA J con Aguirre todavía en NOCHE EN VELA) NO queda
 *      bloqueado: saveMontas emite el cambio (contra un sb falso que sólo
 *      registra; la base no se toca). Desde ISSUE-084 (22/09) saveMontas no hace
 *      UPDATE directo: llama sb.rpc('rpc_cambiar_monta'); D4 exige ese nombre.
 *
 * MUTANTES (--mutantes): cada uno se corre como subproceso de este mismo probe con
 * SRC_<ARCHIVO> apuntando a una copia mutada; tiene que caer el assert indicado.
 *   M1 resultados.html: saveMontas vuelve a from('inscripciones').update() → D4
 *   M2 jockey-repetido.js: forfait cuenta como activo → S3
 *   M3 inscripciones.html: renderInscripciones no marca la fila duplicada → A1
 *   M4 portal.html: el aviso del portal no se muestra nunca → B1
 *
 * PATRÓN (tests/README.md § "Browser NO disponible")
 * ---------------------------------------------------------------------------
 * Se extraen las funciones de los HTML por ancla con balance de llaves y se
 * corren con new Function / AsyncFunction inyectando el cliente Supabase real
 * (lectura), un mini-DOM y stubs. Nada se reimplementa.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_aviso_jockey_repetido.mjs [--mutantes]
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }

const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
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

// ═══════════════════ S — turnos sintéticos (reemplazan a R9) ═══════════════
// Mismos escenarios que tenía R9 al 12/09, sin depender de que nadie edite montas.
// Jockeys con ids propios ('sj-…'), agregados a profsMap para que nomJ/getProf los nombren.
const SJ = { gonz: 'sj-gonz', canto: 'sj-canto', hahn: 'sj-hahn', aguirre: 'sj-aguirre', presa: 'sj-presa' };
Object.assign(profsMap, {
  [SJ.gonz]: { id: SJ.gonz, apellido: 'SINT-GONZALEZ', nombre: 'LUCAS', tipo: 'jockey' },
  [SJ.canto]: { id: SJ.canto, apellido: 'SINT-CANTO', nombre: 'TOBIAS', tipo: 'jockey' },
  [SJ.hahn]: { id: SJ.hahn, apellido: 'SINT-HAHN', nombre: 'GONZALO', tipo: 'jockey' },
  [SJ.aguirre]: { id: SJ.aguirre, apellido: 'SINT-AGUIRRE', nombre: 'HUGO', tipo: 'jockey' },
  [SJ.presa]: { id: SJ.presa, apellido: 'SINT-PRESA', nombre: 'DANIEL', tipo: 'jockey' },
});
let nInsc = 0;
const ins = (carrera, caballo, estado, jockey) => ({ id: `si-${++nInsc}`, carrera_id: carrera, spc_id: `ss-${nInsc}`, estado,
  jockey_titular_id: jockey, jockey_suplente_id: null, caballeriza_id: null, entrenador_id: null, numero_partidor: nInsc,
  canal: 'manual', spcs: { nombre: caballo }, carreras: { id: carrera, numero_turno: 0, reunion_id: 'sintetica' } });
const ST = {
  tres: [ins('sc-tres', 'DEL CAMPEON S', 'inscripto', SJ.gonz), ins('sc-tres', 'OLA DOCTOR S', 'inscripto', SJ.gonz),
         ins('sc-tres', 'TOUCH OF BLUE S', 'inscripto', SJ.gonz), ins('sc-tres', 'ALHENA S', 'inscripto', SJ.hahn)],
  dos: [ins('sc-dos', 'KUCCINI S', 'ratificado', SJ.canto), ins('sc-dos', 'DESTINADO S', 'ratificado', SJ.canto),
        ins('sc-dos', 'NELIDA S', 'ratificado', SJ.aguirre)],
  limpio: [ins('sc-limpio', 'UNO S', 'ratificado', SJ.gonz), ins('sc-limpio', 'DOS S', 'ratificado', SJ.canto),
           ins('sc-limpio', 'TRES S', 'inscripto', SJ.hahn), ins('sc-limpio', 'CUATRO S', 'inscripto', null)],
  forfait: [ins('sc-forf', 'WILSON S', 'ratificado', SJ.presa), ins('sc-forf', 'MAC VITAL S', 'forfait', SJ.presa)],
  malins: [ins('sc-mal', 'PRIMERO S', 'ratificado', SJ.aguirre), ins('sc-mal', 'SEGUNDO S', 'mal_inscrito', SJ.aguirre)],
};
const repS = (t) => [...H.jockeysRepetidos(ST[t])].map(nomJ);
ok('S1) ×3 inscriptos con el mismo jockey → avisa ese jockey (y no el del caballo único)', JSON.stringify(repS('tres')) === JSON.stringify(['SINT-GONZALEZ, LUCAS']), repS('tres').join(' | ') || '(nada)');
ok('S1) conteo ×3', H.conteoJockeysActivos(ST.tres)[SJ.gonz] === 3);
ok('S2) ×2 ratificados → avisa', JSON.stringify(repS('dos')) === JSON.stringify(['SINT-CANTO, TOBIAS']), repS('dos').join(' | ') || '(nada)');
ok('S3) forfait + ratificado, mismo jockey → no avisa', repS('forfait').length === 0, repS('forfait').join(' | '));
ok('S4) mal_inscrito + ratificado, mismo jockey → no avisa', repS('malins').length === 0, repS('malins').join(' | '));
ok('S5) turno limpio (jockeys distintos, uno sin jockey) → no avisa', repS('limpio').length === 0, repS('limpio').join(' | '));

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
  // Desde el listado continuo (02/10) las filas salen de filasInscripciones(lista) / tablaInscripciones(lista).
  const src = extractFn(INSC, 'function filasInscripciones(lista) {') + '\n' + extractFn(INSC, 'function tablaInscripciones(lista) {')
    + '\n' + extractFn(INSC, 'function renderInscripciones() {');
  ok('A0) inscripciones.html carga jockey-repetido.js', /<script src="jockey-repetido\.js"><\/script>/.test(INSC));
  // escapeHtml real (escape-html.js): la celda "Cargada por" la usa desde ISSUE-018; faltaba acá.
  const escapeHtml = new Function(rd('escape-html.js') + '\nreturn escapeHtml;')();
  const run = new Function('document', 'inscripciones', 'getSpc', 'getCab', 'getProf', 'conteoJockeysActivos', 'badgeJockeyDup', 'ESTADOS_ACTIVOS_MONTA', 'escapeHtml', src + '\nrenderInscripciones();');
  const render = (insc) => {
    const dom = mkDom();
    run(dom, insc, () => null, () => null, (id) => profsMap[id] || null, H.conteoJockeysActivos, H.badgeJockeyDup, H.ESTADOS_ACTIVOS_MONTA, escapeHtml);
    return dom._n['list-container'].innerHTML;
  };
  const htmlTres = render(ST.tres);
  const dupsTres = (htmlTres.match(/badge-jockey-dup/g) || []).length;
  ok('A1) turno ×3: 3 filas con ⚠ dup.', dupsTres === 3, `badges: ${dupsTres}`);
  ok('A2) turno ×3: las filas marcadas son las del jockey repetido', ['DEL CAMPEON S', 'OLA DOCTOR S', 'TOUCH OF BLUE S'].every(n => new RegExp(`<tr class="jockey-duplicado">\\s*<td><div class="spc-name">${n}</div>`).test(htmlTres)));
  ok('A3) turno ×3: ALHENA S (jockey único) sin badge', /<tr>\s*<td><div class="spc-name">ALHENA S<\/div>/.test(htmlTres));
  ok('A4) turno limpio: 0 badges', (render(ST.limpio).match(/badge-jockey-dup/g) || []).length === 0);
  ok('A5) ratificado + forfait con el mismo jockey: 0 badges', (render(ST.forfait).match(/badge-jockey-dup/g) || []).length === 0);
  ok('A6) saveRecord llama avisarJockeyRepetido con el turno (toast, no return antes del insert)', /await recargarInscripciones\(\);\s*avisarJockeyRepetido\(payload\.jockey_titular_id, carreraId\);/.test(INSC));
  const av = extractFn(INSC, 'function avisarJockeyRepetido(jockeyId, carreraId = null) {');
  const toasts = [];
  new Function('inscripciones', 'getProf', 'toast', 'conteoJockeysActivos', av + "\navisarJockeyRepetido(arguments[4]);")(ST.tres, (id) => profsMap[id], (m, t) => toasts.push([m, t]), H.conteoJockeysActivos, SJ.gonz);
  ok('A7) toast de aviso al guardar con el jockey ×3, tipo warning', toasts.length === 1 && /SINT-GONZALEZ, LUCAS queda en 3 caballos/.test(toasts[0][0]) && toasts[0][1] === 'warning', JSON.stringify(toasts));
}

// ═══════════════════ B — portal.html avisoJockeyRepetidoPortal ══════════════
{
  ok('B0) portal.html carga jockey-repetido.js y pide jockey_titular_id', /<script src="jockey-repetido\.js"><\/script>/.test(PORTAL) && /created_at,jockey_titular_id,spcs\(nombre\)/.test(PORTAL));
  // Desde el 16/09 (Modificar) el wrapper del modal de anotar delega en
  // avisoJockeyRepetido(el, jockeyId, carreraId, excluirInscId): se extraen las dos.
  const src = extractFn(PORTAL, 'function avisoJockeyRepetido(el, jockeyId, carreraId, excluirInscId = null) {')
    + '\n' + extractFn(PORTAL, 'function avisoJockeyRepetidoPortal() {');
  const corre = (misInscripciones, jockeyId, carreraId) => {
    const dom = mkDom();
    dom.getElementById('minsc-jockey').value = jockeyId;
    new Function('document', 'misInscripciones', 'carreraSeleccionada', 'ESTADOS_ACTIVOS_MONTA', src + '\navisoJockeyRepetidoPortal();')(dom, misInscripciones, { id: carreraId }, H.ESTADOS_ACTIVOS_MONTA);
    return dom._n['minsc-jockey-aviso'];
  };
  const gonz = ST.tres[0];
  const mias = ST.tres.filter(i => i.jockey_titular_id === gonz.jockey_titular_id).slice(0, 2);   // como si fueran míos
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
  // sb FALSO: registra y no escribe nada. saveMontas llama rpc_cambiar_monta (ISSUE-084);
  // from().update() queda para que el mutante M1 (UPDATE directo, como antes) registre SIN nombre y D4 falle.
  const updates = [];
  const sbFalso = {
    rpc: async (nombre, args) => { updates.push({ nombre, id: args.p_inscripcion_id, jockey_titular_id: args.p_jockey_id }); return { data: { recalcular: false }, error: null }; },
    from: () => ({ update: (payload) => ({ eq: async (col, val) => { updates.push({ ...payload, id: val }); return { error: null }; } }) }),
  };
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
  ok('D4) backfill R8 T5: saveMontas emite el cambio de LA LAGUNERA J por rpc_cambiar_monta (no bloqueado)', updates.length === 1 && updates[0].nombre === 'rpc_cambiar_monta' && updates[0].id === lagunera.id && updates[0].jockey_titular_id === lagunera.jockey_titular_id, JSON.stringify(updates));
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

// ═══════════════════════════════ mutantes ═══════════════════════════════════
let vivos = 0;
if (process.argv.includes('--mutantes')) {
  const MUT = [
    { id: 'M1', archivo: 'resultados.html', desc: 'saveMontas vuelve a from(\'inscripciones\').update() (UPDATE directo, pre ISSUE-084)', mata: 'D4',
      from: "const { data, error } = await sb.rpc('rpc_cambiar_monta', { p_inscripcion_id: u.id, p_jockey_id: u.jockey_titular_id });",
      to: "const { data, error } = await sb.from('inscripciones').update({ jockey_titular_id: u.jockey_titular_id }).eq('id', u.id);" },
    { id: 'M2', archivo: 'jockey-repetido.js', desc: 'forfait cuenta como monta activa', mata: 'S3',
      from: "const ESTADOS_ACTIVOS_MONTA = ['inscripto', 'ratificado'];",
      to: "const ESTADOS_ACTIVOS_MONTA = ['inscripto', 'ratificado', 'forfait'];" },
    { id: 'M3', archivo: 'inscripciones.html', desc: 'renderInscripciones no marca la fila con jockey repetido', mata: 'A1',
      from: "const jockeyDup = ESTADOS_ACTIVOS_MONTA.includes(i.estado) && !!i.jockey_titular_id && jockeyCount[i.jockey_titular_id] >= 2;",
      to: "const jockeyDup = false;" },
    { id: 'M4', archivo: 'portal.html', desc: 'el aviso de jockey repetido del portal no se muestra nunca', mata: 'B1',
      from: "function avisoJockeyRepetido(el, jockeyId, carreraId, excluirInscId = null) {",
      to: "function avisoJockeyRepetido(el, jockeyId, carreraId, excluirInscId = null) { if (el) { el.hidden = true; el.textContent = ''; } return;" },
  ];
  console.log('\n── mutantes ──');
  const dir = mkdtempSync(join(tmpdir(), 'mut-jockey-'));
  for (const m of MUT) {
    const src = rd(m.archivo);
    if (src.split(m.from).length !== 2) { console.log(`⚠️  ${m.id} ancla no única/ausente en ${m.archivo} — mutante roto`); vivos++; continue; }
    const p = join(dir, `${m.id}-${m.archivo}`);
    writeFileSync(p, src.replace(m.from, m.to));
    const envVar = `SRC_${m.archivo.replace(/[.-]/g, '_').toUpperCase()}`;
    let out = '';
    try { out = execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, [envVar]: p }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    if (!/asserts OK/.test(out)) { console.log(`⚠️  ${m.id} ERROR DE ARNÉS — no llegó a los asserts: ${(out.split('\n').find(l => /Error/.test(l)) || '').trim().slice(0, 200)}`); vivos++; continue; }
    const muere = out.includes(`❌ ${m.mata})`);
    if (!muere) vivos++;
    const caidos = [...new Set([...out.matchAll(/^❌ ([A-Z]+\d*)\)/gm)].map(x => x[1]))];
    console.log(`${muere ? '✅ muere' : '❌ VIVE '} ${m.id} (${m.archivo}) — ${m.desc}  [esperaba matar ${m.mata}; cayeron ${caidos.join(',') || 'ninguno'}]`);
  }
  console.log(`\nmutantes: ${MUT.length - vivos}/${MUT.length} muertos`);
}
process.exit(fails || vivos ? 1 : 0);
