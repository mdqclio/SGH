/**
 * Probe — la bolsa que se muestra al usuario es la EFECTIVA, con piso.
 * Código real, sin browser.
 *
 * EL BUG (Fede, 08/09/2026)
 * ---------------------------------------------------------------------------
 * El llamado del portal decía `$1.054.166,67` en el turno 1 de R9 y la carta
 * decía `Bolsa: $1.159.292,00`. Los dos números estaban bien calculados: el del
 * portal era `carreras.bolsa_total` CRUDO y el de la carta era la bolsa
 * EFECTIVA — la suma de los puestos con el piso `ganancia_minima` aplicado.
 *
 * La regla (GOTCHA #63, aclarada por Yesica) dice que lo que se muestra es la
 * EFECTIVA. Seis pantallas la respetaban; el chip del portal no, y el chip del
 * encabezado de inscripciones —agregado el 08/09— la copió del portal.
 * Diez de los once turnos de R9 diferían. Delta de la reunión: $791.475.
 * Ver docs/diagnosticos/2026-09-08_bolsas-portal-vs-detalle-r9.md.
 *
 * POR QUÉ ESTE PROBE Y NO UN ASSERT DE PARIDAD
 * ---------------------------------------------------------------------------
 * El probe de paridad comparaba el chip del portal contra el chip de
 * inscripciones. Los dos decían lo mismo — lo mismo EQUIVOCADO — así que pasaba
 * en verde. Comparar dos pantallas entre sí no verifica un valor: verifica que
 * coincidan. Acá el oráculo es OTRA COSA:
 *
 *   1. `repartoDisplay()` de premios-utils.js, cargado aparte como referencia; y
 *   2. una tabla de NÚMEROS CONCRETOS escritos a mano, para que un cambio en el
 *      propio helper tampoco pase desapercibido.
 *
 * Un assert que sólo compara el chip contra el helper no detectaría un helper
 * roto; uno que sólo compara contra la tabla no detectaría que el chip dejó de
 * usar el helper. Van los dos.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_bolsa_efectiva.mjs
 *   node tests/probe_bolsa_efectiva.mjs --mutantes
 */

process.env.TZ = 'America/Argentina/Buenos_Aires';

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }

const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const PORTAL_PATH = process.env.PORTAL_HTML || join(HERE, '..', 'portal.html');
const INSC_PATH   = process.env.INSC_HTML   || join(HERE, '..', 'inscripciones.html');
const UTILS_PATH  = process.env.UTILS_JS    || join(HERE, '..', 'premios-utils.js');
const PORTAL = readFileSync(PORTAL_PATH, 'utf8');
const INSC   = readFileSync(INSC_PATH, 'utf8');
const UTILS  = readFileSync(UTILS_PATH, 'utf8');
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

// ── El ORÁCULO 1: premios-utils.js cargado aparte ───────────────────────────
// Es el mismo archivo que sirve producción, pero instanciado por separado: el
// chip tiene que coincidir con ESTO, no con el otro chip.
const oraculo = {};
new Function('window', UTILS)(oraculo);
const { repartoDisplay, calcPremiosConPiso } = oraculo;

// ── El ORÁCULO 2: los once números de R9, escritos a mano ───────────────────
// Copiados del informe del 08/09 y verificados a mano contra la definición del
// piso. Si el helper cambiara de comportamiento, esta tabla lo delata.
//   [turno, bolsa_total, tiene bono_ganador, bolsa EFECTIVA esperada]
const R9 = [
  [ 1, 1054166.67, true,  1159292],
  [ 2, 1016666.67, true,  1125167],
  [ 3, 1118333.33, true,  1217683],
  [ 4, 1000000.00, true,  1110000],
  [ 5, 1166666.67, true,  1261667],
  [ 6, 1083333.33, true,  1185833],
  [ 7, 1191666.67, true,  1284417],
  [ 8, 1191666.67, true,  1284417],
  [ 9, 3333333.33, false, 3333333],
  [10, 1833333.33, false, 1878333],
  [11, 1833333.33, false, 1878333],
];
const DIST_BASE = { "1": 60, "2": 19, "3": 12, "4": 6, "5": 3,
                    ganancia_minima: 100000,
                    bono_posicion_desde: 6, bono_posicion_hasta: 8, bono_posicion_monto: 100000 };
const distDe = (conBonoGan) => conBonoGan ? { ...DIST_BASE, bono_ganador: 250000 } : { ...DIST_BASE };

// ── mini-DOM ────────────────────────────────────────────────────────────────
function mkDom() {
  const nodos = {};
  const get = (id) => (nodos[id] ||= {
    id, value: '', innerHTML: '', textContent: '', style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, appendChild() {}, remove() {},
  });
  return { _get: get, getElementById: get, querySelectorAll: () => [],
           createElement: () => ({}), addEventListener() {} };
}

// ── arneses ─────────────────────────────────────────────────────────────────
/** portal.html — bolsaChip + loadLlamado reales. repartoDisplay se INYECTA. */
async function mkPortal({ dom, inscs = [] }) {
  const piezas = [
    extractFn(PORTAL, 'function esc(v) {'),
    extractFn(PORTAL, 'function formatARS(num) {'),
    extractFn(PORTAL, 'function fechaHora(iso) {'),
    extractFn(PORTAL, 'function textoEdad(c) {'),
    extractFn(PORTAL, 'function textoCondicion(c) {'),
    extractFn(PORTAL, 'function bolsaChip(c) {'),
    extractFn(PORTAL, 'function ventanaAbierta(c, reunionEstado) {'),
    extractFn(PORTAL, 'async function loadLlamado() {'),
  ].join('\n\n');
  const cuerpo = `
    const TEL = 'x';
    let misInscripciones = ${JSON.stringify(inscs)};
    let turnosAbiertos = [];
    async function cargarInscripcionesCrudas() {}
    ${piezas}
    return { esc, formatARS, bolsaChip, loadLlamado };`;
  return new AsyncFunction('document', 'sb', 'toast', 'console', 'repartoDisplay', cuerpo)(
    dom, sb, () => {}, console, repartoDisplay);
}

/** inscripciones.html — el camino REAL: onReunionChange (que hace el select) →
 *  onCarreraChange → renderCarreraHeader → renderCarreraChips.
 *  Se corre entero a propósito: si sólo se llamara a renderCarreraChips con una
 *  carrera traída por el probe, un `select` que dejara de pedir
 *  distribucion_premios pasaría desapercibido (fue el mutante M4). */
async function mkInsc({ dom, currentUser = { rol: 'secretario_carreras' } }) {
  const piezas = [
    extractFn(INSC, 'function formatMonto(num) {'),
    extractFn(INSC, 'function esc(s) {'),
    extractFn(INSC, 'function fechaHora(iso) {'),
    extractFn(INSC, 'function textoEdad(c) {'),
    extractFn(INSC, 'function textoCondicion(c) {'),
    extractFn(INSC, 'async function onReunionChange() {'),
    extractFn(INSC, 'async function onCarreraChange() {'),
    extractFn(INSC, 'function renderCarreraHeader() {'),
    extractFn(INSC, 'function renderCarreraChips() {'),
    extractFn(INSC, 'function limpiarCarreraHeader() {'),
  ].join('\n\n');
  const cuerpo = `
    let carreras = [], currentCarrera = null, currentCarreraId = null;
    const toasts = [];
    function toast(msg, tipo) { toasts.push({ msg, tipo }); }
    async function loadInscripciones() {}
    ${piezas}
    return { formatMonto, onReunionChange, onCarreraChange, renderCarreraChips,
             _get: () => ({ carreras, currentCarrera, toasts }) };`;
  const ActiveReunion = { get: () => null, set: () => {}, resolve: () => null };
  return new AsyncFunction('document', 'sb', 'CLUB_ID', 'ActiveReunion', 'currentUser',
                           'console', 'repartoDisplay', cuerpo)(
    dom, sb, CLUB_ID, ActiveReunion, currentUser, console, repartoDisplay);
}

// ── lectura del HTML renderizado ────────────────────────────────────────────
const chipsTxt = (html) =>
  [...html.matchAll(/<span class="chip">([\s\S]*?)<\/span>/g)].map(m => m[1]);
const chipBolsa = (html) => (chipsTxt(html).find(t => t.startsWith('💰')) || '').replace('💰 ', '');

function bloqueDeReunion(html, etiqueta) {
  const i = html.indexOf(etiqueta);
  if (i < 0) return '';
  const a = html.lastIndexOf('<div class="reunion-block">', i);
  const b = html.indexOf('<div class="reunion-block">', i);
  return html.slice(a < 0 ? i : a, b < 0 ? html.length : b);
}
function filasDeTurno(bloqueHtml) {
  return bloqueHtml.split('<div class="carrera-row">').slice(1).map(f => {
    const t = (f.match(/<div class="carrera-num">(\d+)<\/div>/) || [])[1];
    return { turno: Number(t), html: f };
  });
}

// ═════════════════════════════ MUTATION TESTING ═════════════════════════════
const MUTANTES = [
  { id: 'M1', archivo: 'portal', desc: 'vuelve el bug: el chip del portal muestra bolsa_total crudo',
    mata: ['P1', 'P2', 'P3'],
    from: `  const { total } = repartoDisplay(c.bolsa_total, c.distribucion_premios);
  return \`<span class="chip">💰 \${esc(formatARS(total))}</span>\`;`,
    to: `  return \`<span class="chip">💰 \${esc(formatARS(c.bolsa_total))}</span>\`;` },

  { id: 'M2', archivo: 'insc', desc: 'vuelve el bug: el chip de inscripciones muestra bolsa_total crudo',
    mata: ['I1', 'I2', 'I3'],
    from: `c.bolsa_total ? \`💰 \${formatMonto(repartoDisplay(c.bolsa_total, c.distribucion_premios).total)}\` : '',`,
    to: `c.bolsa_total ? \`💰 \${formatMonto(c.bolsa_total)}\` : '',` },

  { id: 'M3', archivo: 'portal', desc: 'el portal deja de pedir distribucion_premios en el select',
    mata: ['P1', 'P2', 'P3'],
    from: `bolsa_total,distribucion_premios,cupo_maximo`,
    to: `bolsa_total,cupo_maximo` },

  { id: 'M4', archivo: 'insc', desc: 'inscripciones deja de pedir distribucion_premios en el select',
    mata: ['I1', 'I2', 'I3'],
    from: `edad_maxima_anos,bolsa_total,distribucion_premios,cupo_maximo`,
    to: `edad_maxima_anos,bolsa_total,cupo_maximo` },

  { id: 'M5', archivo: 'utils', desc: 'el helper deja de aplicar el piso ganancia_minima',
    // NO mata P1/I1 —el chip y el oráculo comparten el helper mutado y siguen
    // coincidiendo—: lo matan P2/I2, que van contra los números escritos a mano.
    // Es exactamente para esto que la tabla concreta existe.
    mata: ['H1', 'H2', 'P2', 'P3', 'I2', 'I3'],
    from: `      const efectivo = (minimo > 0 && calc < minimo) ? minimo : calc;`,
    to: `      const efectivo = calc;` },

  { id: 'M6', archivo: 'utils', desc: 'el helper suma los bonos a la bolsa (no debe)',
    mata: ['H1', 'H2', 'P2', 'I2'],
    from: `  const EXCLUIR = ['bonos','bono_ganador','bono_posicion_desde','bono_posicion_hasta','bono_posicion_monto','ganancia_minima'];`,
    to: `  const EXCLUIR = ['bonos','bono_posicion_desde','bono_posicion_hasta','ganancia_minima'];` },

  { id: 'M7', archivo: 'utils', desc: 'el resto de redondeo deja de absorberse: Σ puestos ≠ total',
    mata: ['H3b'],
    from: `  if (topKey !== null) puestos[topKey] += total - acum;`,
    to: `  if (false) puestos[topKey] += total - acum;` },

  { id: 'M8', archivo: 'portal', desc: 'el chip del portal se cuelga del otro chip en vez del helper',
    mata: ['P1', 'P2', 'P3'],
    from: `  const { total } = repartoDisplay(c.bolsa_total, c.distribucion_premios);`,
    to: `  const total = Math.round(parseFloat(c.bolsa_total));` },
];

const argMut = process.argv.find(a => a === '--mutantes' || a.startsWith('--mutantes='));
if (argMut) {
  const pedidos = argMut.includes('=')
    ? argMut.split('=')[1].split(',').map(s => s.trim()).filter(Boolean) : null;
  if (pedidos) {
    const desc = pedidos.filter(p => !MUTANTES.some(m => m.id === p));
    if (desc.length) { console.error(`mutantes inexistentes: ${desc.join(', ')}`); process.exit(2); }
  }
  const tanda = pedidos ? MUTANTES.filter(m => pedidos.includes(m.id)) : MUTANTES;
  const SELF = fileURLToPath(import.meta.url);
  const dir = mkdtempSync(join(tmpdir(), 'mut-bolsa-'));
  try { symlinkSync(join(HERE, '..', 'node_modules'), join(dir, 'node_modules'), 'dir'); }
  catch (e) { console.warn(`[runner] no pude symlinkear node_modules: ${e.message}`); }
  const SRC = { portal: PORTAL, insc: INSC, utils: UTILS };
  const ENV = { portal: 'PORTAL_HTML', insc: 'INSC_HTML', utils: 'UTILS_JS' };
  const EXT = { portal: 'html', insc: 'html', utils: 'js' };
  console.log(`\n═══ MUTATION TESTING · ${tanda.length}/${MUTANTES.length} mutantes ═══\n(copias en ${dir} — el repo no se toca)\n`);
  let vivos = 0, arnes = 0;
  for (const m of tanda) {
    if (!SRC[m.archivo].includes(m.from)) {
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el ancla no existe. ${m.desc}`); arnes++; continue;
    }
    const path = join(dir, `${m.id}.${EXT[m.archivo]}`);
    writeFileSync(path, SRC[m.archivo].replace(m.from, m.to));
    let out = '';
    try { out = execFileSync(process.execPath, [SELF], { env: { ...process.env, [ENV[m.archivo]]: path }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    // GOTCHA #84 — sin la línea final el hijo no llegó a los asserts.
    if (!/^\d+\/\d+ OK$/m.test(out)) {
      const causa = (out.split('\n').find(l => /Error|error:/.test(l)) || '(sin línea de error)').trim();
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — no llegó a los asserts. ${m.desc}\n     ↳ ${causa.slice(0, 200)}`);
      arnes++; continue;
    }
    const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));   // GOTCHA #82
    const vivo = muertos.length === 0;
    if (vivo) vivos++;
    console.log(`${vivo ? '❌' : '✅'} ${m.id} ${vivo ? 'SOBREVIVE' : 'muere'} — ${m.desc}`
      + `  [esperaba matar ${m.mata.join(',')}${muertos.length ? `; murieron ${muertos.join(',')}` : ''}]`);
  }
  const partes = [`${tanda.length - vivos - arnes} muertos`];
  if (vivos) partes.push(`${vivos} SOBREVIVEN`);
  if (arnes) partes.push(`${arnes} ERROR DE ARNÉS`);
  console.log(`\n${vivos === 0 && arnes === 0 ? '✅ TANDA LIMPIA' : '❌ TANDA CON HALLAZGOS'} — ${tanda.length} probados · ${partes.join(' · ')}\n`);
  process.exit(vivos === 0 && arnes === 0 ? 0 : 1);
}

// ══════════════════════════════ CORRIDA NORMAL ══════════════════════════════
const fx = { reuniones: [], carreras: [] };
const die = (ctx, e) => { throw new Error(`[${ctx}] ${e?.message ?? JSON.stringify(e)}`); };
async function ins(tabla, fila, bucket) {
  const { data, error } = await sb.from(tabla).insert(fila).select('id').single();
  if (error) die(`insert ${tabla}`, error);
  if (bucket) fx[bucket].push(data.id);
  return data.id;
}

(async () => {
  try {
    // ── A) EL HELPER contra los números escritos a mano ─────────────────────
    // Si esto falla, el helper cambió de comportamiento: no alcanza con que los
    // chips lo sigan.
    const malH = R9.filter(([t, bolsa, cbg, esperado]) =>
      repartoDisplay(bolsa, distDe(cbg)).total !== esperado);
    ok('H1) el helper da los once valores esperados de R9',
       malH.length === 0,
       malH.length ? malH.map(([t, b, cbg, e]) =>
         `T${t}: helper=${repartoDisplay(b, distDe(cbg)).total} esperado=${e}`).join(' · ')
         : R9.map(([t, , , e]) => `T${t}=${e}`).join(' '));

    ok('H2) la efectiva es MAYOR que el nominal donde el piso muerde (10 de 11)',
       R9.filter(([, b, cbg]) => repartoDisplay(b, distDe(cbg)).total > Math.round(b)).length === 10,
       R9.map(([t, b, cbg]) => `T${t}:+${repartoDisplay(b, distDe(cbg)).total - Math.round(b)}`).join(' '));

    // Con las bolsas de R9 el redondeo da justo y no hay residuo que absorber,
    // así que este assert por sí solo no probaba la absorción (mutante M7).
    // Se agrega una bolsa elegida para que Σ round(puestos) ≠ round(Σ):
    // 1.000.002 deja +1 de residuo, que el puesto mayor tiene que absorber.
    const CON_RESIDUO = 1000002;
    const sumaPuestos = (b, d) => {
      const { puestos, total } = repartoDisplay(b, d);
      return { suma: Object.values(puestos).reduce((s, v) => s + v, 0), total };
    };
    ok('H3) Σ de los puestos ≡ total en los once turnos de R9',
       R9.every(([, b, cbg]) => { const r = sumaPuestos(b, distDe(cbg)); return r.suma === r.total; }));

    const resid = sumaPuestos(CON_RESIDUO, distDe(true));
    const crudo = Object.values(calcPremiosConPiso(CON_RESIDUO, distDe(true)).puestos)
      .reduce((s, v) => s + Math.round(v), 0);
    ok('H3b) …y también con una bolsa que DEJA residuo: el puesto mayor lo absorbe',
       crudo !== resid.total && resid.suma === resid.total,
       `bolsa=${CON_RESIDUO} · Σround(puestos)=${crudo} · round(Σ)=${resid.total}`
       + ` · residuo=${resid.total - crudo} · Σ tras absorber=${resid.suma}`);

    ok('H4) los bonos NO entran en la bolsa',
       repartoDisplay(1054166.67, distDe(true)).total
       === repartoDisplay(1054166.67, distDe(false)).total,
       `con bono_ganador=${repartoDisplay(1054166.67, distDe(true)).total} · sin=${repartoDisplay(1054166.67, distDe(false)).total}`);

    // ── B) FIXTURE con las once bolsas reales de R9 ─────────────────────────
    const { data: hip } = await sb.from('hipodromos').select('id').eq('club_id', CLUB_ID).limit(1).single();
    const { data: cat } = await sb.from('categorias_carrera').select('id').eq('club_id', CLUB_ID).limit(1).single();
    const reun = await ins('reuniones', {
      club_id: CLUB_ID, hipodromo_id: hip.id, numero: 9990,
      fecha: '2099-06-06', estado: 'publicada',
    }, 'reuniones');

    const ids = {};
    for (const [t, bolsa, cbg] of R9) {
      ids[t] = await ins('carreras', {
        reunion_id: reun, numero_turno: t, distancia_metros: 1000, tipo_pista: 'tierra',
        condicion_sexo: 'ambos', categoria_id: cat.id, estado: 'abierta',
        edad_minima_anos: 3, bolsa_total: bolsa, distribucion_premios: distDe(cbg),
        apertura_inscripcion: '2026-01-01T00:00:00+00:00',
        cierre_inscripcion: '2099-06-01T15:00:00+00:00',
      }, 'carreras');
    }

    // ── C) EL CHIP DEL PORTAL, turno por turno ──────────────────────────────
    const domP = mkDom();
    const P = await mkPortal({ dom: domP });
    await P.loadLlamado();
    const bloque = bloqueDeReunion(domP._get('carta-container').innerHTML, 'Reunión 9990');
    const filas = filasDeTurno(bloque);

    ok('P0) el llamado renderizó los once turnos del fixture',
       filas.length === 11, `filas=${filas.length}`);

    // El assert que importa: chip contra HELPER, no contra el otro chip.
    const malP = [];
    for (const [t, bolsa, cbg, esperado] of R9) {
      const fila = filas.find(f => f.turno === t);
      const chip = fila ? chipBolsa(fila.html) : '(sin fila)';
      const delHelper = P.formatARS(repartoDisplay(bolsa, distDe(cbg)).total);
      if (chip !== delHelper) malP.push(`T${t}: chip="${chip}" helper="${delHelper}"`);
    }
    ok('P1) el chip del portal == lo que da repartoDisplay, en los once turnos',
       malP.length === 0, malP.length ? malP.join(' · ') : '11/11');

    // Y contra los números concretos, por si el helper cambiara.
    const malP2 = [];
    for (const [t, , , esperado] of R9) {
      const fila = filas.find(f => f.turno === t);
      const chip = fila ? chipBolsa(fila.html) : '(sin fila)';
      const esp = P.formatARS(esperado);
      if (chip !== esp) malP2.push(`T${t}: chip="${chip}" esperado="${esp}"`);
    }
    ok('P2) el chip del portal == los once números concretos de R9',
       malP2.length === 0,
       malP2.length ? malP2.join(' · ')
                    : R9.map(([t, , , e]) => `T${t}=${P.formatARS(e)}`).join(' '));

    const t1 = filas.find(f => f.turno === 1);
    ok('P3) T1 dice $1.159.292,00, NO $1.054.166,67',
       chipBolsa(t1.html) === '$1.159.292,00' && !bloque.includes('1.054.166,67'),
       `chip="${chipBolsa(t1.html)}"`);

    ok('P4) el bloque no muestra ninguna de las once bolsas NOMINALES',
       !R9.some(([, b]) => bloque.includes(P.formatARS(Math.round(b)).replace(',00', ',67'))
                        || bloque.includes(P.formatARS(b))),
       'ninguna');

    // ── D) EL CHIP DE INSCRIPCIONES, turno por turno ────────────────────────
    const domI = mkDom();
    const I = await mkInsc({ dom: domI });
    // El select REAL de onReunionChange: si deja de pedir distribucion_premios,
    // el chip se queda sin el dato y los asserts de abajo lo detectan.
    domI._get('sel-reunion').value = reun;
    await I.onReunionChange();
    ok('I0) onReunionChange trajo los once turnos del fixture',
       I._get().carreras.length === 11, `carreras=${I._get().carreras.length}`);

    const malI = [], malI2 = [];
    for (const [t, bolsa, cbg, esperado] of R9) {
      domI._get('sel-carrera').value = ids[t];
      await I.onCarreraChange();
      const chip = chipBolsa(domI._get('carrera-header').innerHTML);
      const delHelper = I.formatMonto(repartoDisplay(bolsa, distDe(cbg)).total);
      if (chip !== delHelper) malI.push(`T${t}: chip="${chip}" helper="${delHelper}"`);
      if (chip !== I.formatMonto(esperado)) malI2.push(`T${t}: chip="${chip}" esperado="${I.formatMonto(esperado)}"`);
    }
    ok('I1) el chip de inscripciones == repartoDisplay, en los once turnos',
       malI.length === 0, malI.length ? malI.join(' · ') : '11/11');
    ok('I2) el chip de inscripciones == los once números concretos',
       malI2.length === 0, malI2.length ? malI2.join(' · ') : '11/11');

    domI._get('sel-carrera').value = ids[1];
    await I.onCarreraChange();
    ok('I3) T1 en inscripciones dice $1.159.292,00',
       chipBolsa(domI._get('carrera-header').innerHTML) === '$1.159.292,00',
       `chip="${chipBolsa(domI._get('carrera-header').innerHTML)}"`);

    // ── E) EL FIXTURE NO SE DESPEGÓ DE R9 ───────────────────────────────────
    // Los números de arriba valen mientras las bolsas de R9 sean éstas.
    const { data: r9 } = await sb.from('carreras')
      .select('numero_turno,bolsa_total,distribucion_premios,reuniones!inner(numero,club_id)')
      .eq('reuniones.club_id', CLUB_ID).eq('reuniones.numero', 9).order('numero_turno');
    const drift = (r9 || []).filter(c => {
      const esp = R9.find(([t]) => t === c.numero_turno);
      return !esp || Math.abs(parseFloat(c.bolsa_total) - esp[1]) > 0.005;
    });
    ok('E1) las bolsas reales de R9 siguen siendo las de la tabla del probe',
       (r9 || []).length === 11 && drift.length === 0,
       drift.length ? drift.map(c => `T${c.numero_turno}=${c.bolsa_total}`).join(' ') : `11 turnos, sin drift`);

    ok('E2) el piso de R9 sigue siendo 100.000 en los once',
       (r9 || []).every(c => Number(c.distribucion_premios?.ganancia_minima) === 100000));

    // ── F) NADIE MÁS MUESTRA EL NOMINAL ─────────────────────────────────────
    ok('F1) portal.html carga premios-utils.js',
       /<script src="premios-utils\.js"><\/script>/.test(PORTAL));
    // Sobre CÓDIGO VIVO, no sobre los comentarios: la primera versión de este
    // assert matcheaba el propio comentario que explica el bug viejo y daba en
    // rojo con el fix aplicado. Mismo tropiezo que el conteo de datetime-local
    // del 08/09 — un assert de texto tiene que excluir la prosa.
    const vivo = (src) => src.split('\n')
      .filter(l => !/^\s*(\/\/|\*|<!--)/.test(l)).join('\n');
    const crudoEnVivo = [['portal.html', vivo(PORTAL)], ['inscripciones.html', vivo(INSC)]]
      .filter(([, src]) => /format(ARS|Monto)\(\s*c\.bolsa_total\s*\)/.test(src))
      .map(([n]) => n);
    ok('F2) ningún formatARS/formatMonto sobre bolsa_total crudo en código vivo',
       crudoEnVivo.length === 0,
       crudoEnVivo.length ? `todavía crudo en: ${crudoEnVivo.join(', ')}` : 'portal e inscripciones limpios');

  } finally {
    for (const id of fx.carreras) await sb.from('carreras').delete().eq('id', id);
    for (const id of fx.reuniones) await sb.from('reuniones').delete().eq('id', id);
    const { data: quedan } = await sb.from('reuniones')
      .select('id').eq('club_id', CLUB_ID).eq('numero', 9990);
    ok('T1) teardown: no quedó ninguna reunión 9990', (quedan || []).length === 0,
       `quedan=${(quedan || []).length}`);
  }

  console.log('\n── Probe · la bolsa mostrada es la EFECTIVA, con piso ──');
  console.log(`   portal=${PORTAL_PATH}`);
  console.log(`   insc=${INSC_PATH}`);
  console.log(`   utils=${UTILS_PATH}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
