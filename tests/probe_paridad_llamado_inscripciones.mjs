/**
 * Probe — paridad llamado abierto (portal.html) ↔ encabezado de turno
 * (inscripciones.html), y el formato de hora en 24 h. Código real, sin browser.
 *
 * EL PEDIDO (Fede + Yesi, 07/09/2026)
 * ---------------------------------------------------------------------------
 * Las dos pantallas mostraban cada una la mitad de lo mismo: el llamado del
 * portal tenía los chips (distancia, pista, sexo, edad, bolsa, cierre) pero no
 * el texto de la condición; inscripciones tenía el texto de la condición pero
 * no los chips. Ahora las dos muestran el conjunto completo.
 *
 * Y el bug de formato que marcó Fede: el chip de cierre imprimía
 * "cierra 11/9 09:00 a. m. hs" — las dos notaciones mezcladas y la unidad
 * repetida. `toLocaleTimeString('es-AR', {hour:'2-digit'})` devuelve
 * "09:00 a. m." en el ICU actual y el código le concatenaba " hs".
 *
 * PATRÓN (tests/README.md § "Browser NO disponible")
 * ---------------------------------------------------------------------------
 * Se EXTRAEN de los propios HTML las funciones a probar —por ancla, con balance
 * de llaves— y se las corre con new AsyncFunction inyectando el cliente
 * Supabase real y un mini-DOM. Nada se reimplementa acá: si el HTML cambia,
 * este probe corre el HTML cambiado.
 *
 * DATOS
 * ---------------------------------------------------------------------------
 * Fixture propio (reunión 9992, fecha 2099) con DOS turnos copiados de los
 * reales de R9: uno de condición corta y uno de condición LARGA — 192
 * caracteres entre condicion_handicap y condicion_adicional, que son tres
 * renglones y es el caso que puede romper la tarjeta. Teardown en el `finally`.
 * NO toca R9 ni ninguna reunión real, y no escribe hora_cierre de nada.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_paridad_llamado_inscripciones.mjs
 *   node tests/probe_paridad_llamado_inscripciones.mjs --mutantes=M1,M2,M3,M4,M5
 *   node tests/probe_paridad_llamado_inscripciones.mjs --mutantes
 *
 * Los mutantes van en TANDAS de 4-5: cada uno es una corrida completa del probe
 * y los 120 s de timeout del harness llegan como SIGKILL (mismo motivo que en
 * probe_carta_selector_reunion.mjs, de donde sale este runner).
 */

// La zona horaria fija el "09:00" esperado. Va antes de tocar cualquier Date.
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

const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';   // Hipódromo de Dolores

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const PORTAL_PATH = process.env.PORTAL_HTML || join(HERE, '..', 'portal.html');
const INSC_PATH   = process.env.INSC_HTML   || join(HERE, '..', 'inscripciones.html');
const PORTAL = readFileSync(PORTAL_PATH, 'utf8');
const INSC   = readFileSync(INSC_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

// ── ORÁCULO INDEPENDIENTE ───────────────────────────────────────────────────
// Este probe compara DOS PANTALLAS entre sí, y eso solo no verifica ningún
// valor: el 08/09 los dos chips de bolsa mostraban `bolsa_total` crudo en vez
// de la bolsa efectiva, coincidían perfectamente, y el probe pasó en verde
// mientras el número era el equivocado.
//
// Regla que queda: **un assert de paridad necesita un tercer punto de apoyo.**
// Para todo campo que sea un valor CALCULADO —hoy sólo la bolsa— el esperado
// sale de acá, de `premios-utils.js` cargado aparte, no de la otra pantalla.
// El detalle completo vive en tests/probe_bolsa_efectiva.mjs.
const oraculo = {};
new Function('window', readFileSync(join(HERE, '..', 'premios-utils.js'), 'utf8'))(oraculo);
const { repartoDisplay } = oraculo;

// ── extracción por ancla ────────────────────────────────────────────────────
// El scan de llaves arranca en la llave FINAL de la firma, no en la primera que
// aparezca después del ancla (probe_carta_selector_reunion.mjs, mismo motivo).
function extractFn(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  if (!firma.endsWith('{')) throw new Error(`la firma tiene que terminar en '{': ${firma}`);
  let d = 0;
  for (let k = i + firma.length - 1; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error(`no pude cerrar: ${firma}`);
}

// ── mini-DOM ────────────────────────────────────────────────────────────────
// Sólo lo que el código realmente toca. Los nodos se crean a demanda: si el
// código pide un id que no previmos, no explota — y lo que escribió queda
// disponible para assertear.
function mkDom() {
  const nodos = {};
  const get = (id) => (nodos[id] ||= {
    id, innerHTML: '', value: '', textContent: '', style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, appendChild() {}, remove() {},
  });
  return {
    _n: nodos,
    getElementById: get,
    querySelectorAll: () => [],
    createElement: () => ({ className: '', textContent: '', remove() {} }),
    addEventListener() {},
  };
}

// ═══════════════════════ arneses de las dos pantallas ═══════════════════════

/** portal.html — el llamado abierto. */
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

  // cargarInscripcionesCrudas se stubea: la real lee TODAS las inscripciones de
  // la base con la secret key y este probe no mira esa lista.
  const cuerpo = `
    const TEL = 'la secretaría del hipódromo';
    let misInscripciones = ${JSON.stringify(inscs)};
    let turnosAbiertos = [];
    async function cargarInscripcionesCrudas() {}
    ${piezas}
    return { esc, formatARS, fechaHora, textoEdad, textoCondicion, ventanaAbierta,
             bolsaChip, loadLlamado, _get: () => ({ turnosAbiertos }) };`;
  const make = new AsyncFunction('document', 'sb', 'toast', 'console', 'repartoDisplay', cuerpo);
  return make(dom, sb, () => {}, console, repartoDisplay);
}

/** inscripciones.html — el encabezado del turno. */
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

  // loadInscripciones se stubea: este probe mira el encabezado, no la tabla.
  const cuerpo = `
    let carreras = [], currentCarrera = null, currentCarreraId = null;
    const toasts = [];
    function toast(msg, tipo) { toasts.push({ msg, tipo }); }
    async function loadInscripciones() {}
    ${piezas}
    return { formatMonto, esc, fechaHora, textoEdad, textoCondicion,
             onReunionChange, onCarreraChange, renderCarreraHeader,
             renderCarreraChips, limpiarCarreraHeader,
             _get: () => ({ carreras, currentCarrera, toasts }) };`;
  const setSpy = { ids: [] };
  const ActiveReunion = { get: () => null, set: (id) => setSpy.ids.push(id), resolve: () => null };
  const make = new AsyncFunction(
    'document', 'sb', 'CLUB_ID', 'ActiveReunion', 'currentUser', 'console', 'repartoDisplay', cuerpo);
  const api = await make(dom, sb, CLUB_ID, ActiveReunion, currentUser, console, repartoDisplay);
  api._setSpy = setSpy;
  return api;
}

// ── utilidades de lectura del HTML renderizado ──────────────────────────────

/** Recorta el bloque de UNA reunión del container del llamado. */
function bloqueDeReunion(html, etiqueta) {
  const i = html.indexOf(etiqueta);
  if (i < 0) return '';
  const desde = html.lastIndexOf('<div class="reunion-block">', i);
  const sig = html.indexOf('<div class="reunion-block">', i);
  return html.slice(desde < 0 ? i : desde, sig < 0 ? html.length : sig);
}

/** Recorta la fila de UN turno dentro del bloque de la reunión. */
function filaDeTurno(bloqueHtml, textoAncla) {
  const i = bloqueHtml.indexOf(textoAncla);
  if (i < 0) return '';
  const desde = bloqueHtml.lastIndexOf('<div class="carrera-row">', i);
  const sig = bloqueHtml.indexOf('<div class="carrera-row">', i);
  return bloqueHtml.slice(desde < 0 ? 0 : desde, sig < 0 ? bloqueHtml.length : sig);
}

/** Contenido del div de chips (sin el bloque de condición, que es hermano). */
function divChips(html) {
  const i = html.indexOf('<div class="carrera-chips">');
  if (i < 0) return '';
  const fin = html.indexOf('<div class="carrera-cond">', i);
  return html.slice(i, fin < 0 ? html.length : fin);
}
const contarChips = (html) => (divChips(html).match(/<span class="chip"/g) || []).length;
/** Etiquetas de los chips, compactas, para el detalle de los asserts. */
const chipsTxt = (html) =>
  [...divChips(html).matchAll(/<span class="chip">([\s\S]*?)<\/span>/g)].map(m => m[1]).join(' | ');

/** Texto del bloque de condición. */
function textoCond(html) {
  const m = html.match(/<div class="carrera-cond">([\s\S]*?)<\/div>/);
  return m ? m[1] : '';
}

// ─────────────────────────── el fixture ─────────────────────────────────────
// Copias literales de dos turnos de R9 (2026-09-20). El LARGO es T9: 66 + 3 +
// 123 = 192 caracteres una vez unidos, que es el caso de tres renglones.
const HC_LARGA = 'Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras.';
const AD_LARGA = 'Peso 52 kilos al ganador de 2 carreras. Recargo de 2 kilos por carrera subsiguiente ganada. Jockey aprendices sin descargo.';
const COND_LARGA = `${HC_LARGA} — ${AD_LARGA}`;
const HC_CORTA = 'Todo caballo 5 años y + edad perdedor.';

// 2099-05-01 12:00 UTC = 09:00 en Argentina (UTC-3 todo el año). Es el mismo
// 09:00 que Yesi cargó en los once turnos de R9 — el valor no se toca, sólo se
// mira cómo se imprime.
const CIERRE_ISO = '2099-05-01T12:00:00+00:00';
const HORA_ESPERADA = '1/5 09:00 hs';

// Bolsa y distribución copiadas de R9 T1. Se eligió a propósito una donde el
// piso MUERDE (4° y 5° quedan por debajo de 100.000 y se elevan): así el
// nominal ($1.054.166,67) y la efectiva ($1.159.292) son distintos y un chip
// que mostrara el crudo no puede pasar por coincidencia.
const BOLSA = 1054166.67;
const DIST = { "1": 60, "2": 19, "3": 12, "4": 6, "5": 3,
               bono_ganador: 250000, ganancia_minima: 100000,
               bono_posicion_desde: 6, bono_posicion_hasta: 8, bono_posicion_monto: 100000 };
// El esperado sale del ORÁCULO, no de ninguna de las dos pantallas.
const BOLSA_EFECTIVA = repartoDisplay(BOLSA, DIST).total;   // 1159292

// ═════════════════════════════ MUTATION TESTING ═════════════════════════════
// Cada mutante neutraliza UNA cosa sobre una COPIA del HTML en un tmpdir —el
// repo no se toca— y re-corre este mismo probe con PORTAL_HTML / INSC_HTML
// apuntando a la copia. Un mutante que no mata ningún assert significa que ese
// assert no prueba lo que dice probar.
const MUTANTES = [
  { id: 'M1', archivo: 'portal', desc: 'vuelve el bug: fechaHora usa toLocaleTimeString y le pega " hs"',
    mata: ['H1', 'H2', 'H5', 'H7'],
    from: '  const p2 = (n) => String(n).padStart(2, \'0\');\n  return `${d.getDate()}/${d.getMonth() + 1} ${p2(d.getHours())}:${p2(d.getMinutes())} hs`;',
    to: "  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })\n    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs';" },

  { id: 'M2', archivo: 'portal', desc: 'la unidad queda duplicada ("09:00 hs hs")',
    mata: ['H1', 'H3'],
    from: '${p2(d.getHours())}:${p2(d.getMinutes())} hs`;',
    to: '${p2(d.getHours())}:${p2(d.getMinutes())} hs hs`;' },

  { id: 'M3', archivo: 'insc', desc: 'inscripciones se desincroniza: fechaHora vuelve a 12 h',
    mata: ['H4', 'H6', 'H7'],
    from: '  const p2 = (n) => String(n).padStart(2, \'0\');\n  return `${d.getDate()}/${d.getMonth() + 1} ${p2(d.getHours())}:${p2(d.getMinutes())} hs`;',
    to: "  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })\n    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs';" },

  { id: 'M4', archivo: 'portal', desc: 'el llamado vuelve a no mostrar el texto de la condición',
    mata: ['P8', 'L1', 'L3', 'D1'],
    from: '          ${textoCondicion(c) ? `<div class="carrera-cond">${esc(textoCondicion(c))}</div>` : \'\'}\n',
    to: '' },

  { id: 'M5', archivo: 'insc', desc: 'inscripciones vuelve a no mostrar el texto de la condición',
    mata: ['Q8', 'L2', 'L4', 'D1'],
    from: "      ${cond ? `<div class=\"carrera-cond\">${esc(cond)}</div>` : ''}",
    to: '' },

  { id: 'M6', archivo: 'insc', desc: 'el select de carreras vuelve a las cinco columnas viejas',
    mata: ['Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'D1', 'D5'],
    from: ".select('id,numero_turno,nombre,distancia_metros,tipo_pista,condicion_sexo,edad_minima_anos,edad_maxima_anos,bolsa_total,distribucion_premios,cupo_maximo,condicion_handicap,condicion_adicional,cierre_inscripcion,estado,categoria_id,categorias_carrera(nombre)')",
    to: ".select('id,numero_turno,nombre,distancia_metros,condicion_handicap')" },

  { id: 'M7', archivo: 'insc', desc: 'la condición se mete adentro de la fila de chips y la estira',
    mata: ['L4'],
    from: "    c.cierre_inscripcion ? `⏳ cierra ${fechaHora(c.cierre_inscripcion)}` : '',\n  ].filter(Boolean)",
    to: "    c.cierre_inscripcion ? `⏳ cierra ${fechaHora(c.cierre_inscripcion)}` : '',\n    cond,\n  ].filter(Boolean)" },

  { id: 'M8', archivo: 'portal', desc: 'el llamado trunca la condición larga a 70 caracteres',
    mata: ['L1'],
    from: '  return [c.condicion_handicap, c.condicion_adicional]\n    .map(s => (s || \'\').trim()).filter(Boolean).join(\' — \');',
    to: '  const t = [c.condicion_handicap, c.condicion_adicional]\n    .map(s => (s || \'\').trim()).filter(Boolean).join(\' — \');\n  return t.length > 70 ? t.slice(0, 70) + \'…\' : t;' },

  { id: 'M9', archivo: 'insc', desc: 'inscripciones pierde el chip de cierre',
    mata: ['Q7', 'D1'],
    from: "    c.cierre_inscripcion ? `⏳ cierra ${fechaHora(c.cierre_inscripcion)}` : '',",
    to: '' },

  { id: 'M10', archivo: 'portal', desc: 'la condición pierde overflow-wrap: una palabra larga desborda la tarjeta',
    mata: ['L7'],
    from: '.carrera-cond { font-size: 12px; line-height: 1.45; color: var(--muted); margin-top: 6px; overflow-wrap: anywhere; }',
    to: '.carrera-cond { font-size: 12px; line-height: 1.45; color: var(--muted); margin-top: 6px; white-space: nowrap; }' },

  { id: 'M11', archivo: 'insc', desc: 'inscripciones pierde el chip de categoría que pidió Yesi',
    mata: ['Y1'],
    from: '    cat,\n', to: '' },

  // ── Los dos que dejó pasar la versión vieja de este probe (08/09/2026) ────
  // Con los asserts chip-contra-chip, M12 y M13 aplicados JUNTOS sobrevivían:
  // las dos pantallas mostraban el nominal, coincidían, y la paridad daba en
  // verde. Ahora cada uno muere por separado contra el oráculo, y D5 los mata
  // aunque coincidan entre sí.
  { id: 'M12', archivo: 'portal', desc: 'vuelve el bug: el chip del portal muestra bolsa_total crudo',
    mata: ['P6', 'D1', 'D5'],
    from: `  const { total } = repartoDisplay(c.bolsa_total, c.distribucion_premios);
  return \`<span class="chip">💰 \${esc(formatARS(total))}</span>\`;`,
    to: `  return \`<span class="chip">💰 \${esc(formatARS(c.bolsa_total))}</span>\`;` },

  { id: 'M13', archivo: 'insc', desc: 'vuelve el bug: el chip de inscripciones muestra bolsa_total crudo',
    mata: ['Q6', 'D1', 'D5'],
    from: `c.bolsa_total ? \`💰 \${formatMonto(repartoDisplay(c.bolsa_total, c.distribucion_premios).total)}\` : '',`,
    to: `c.bolsa_total ? \`💰 \${formatMonto(c.bolsa_total)}\` : '',` },
];

const argMut = process.argv.find(a => a === '--mutantes' || a.startsWith('--mutantes='));
if (argMut) {
  const pedidos = argMut.includes('=')
    ? argMut.split('=')[1].split(',').map(s => s.trim()).filter(Boolean) : null;
  if (pedidos) {
    const desconocidos = pedidos.filter(p => !MUTANTES.some(m => m.id === p));
    if (desconocidos.length) { console.error(`mutantes inexistentes: ${desconocidos.join(', ')}`); process.exit(2); }
  }
  const tanda = pedidos ? MUTANTES.filter(m => pedidos.includes(m.id)) : MUTANTES;
  const SELF = fileURLToPath(import.meta.url);
  const dir = mkdtempSync(join(tmpdir(), 'mut-paridad-llamado-'));
  // Sin este symlink un mutante que corriera desde el tmpdir no resolvería
  // '@supabase/supabase-js' y moriría en el import — el runner lo leería como
  // sobreviviente cuando en realidad es un fallo del arnés.
  try { symlinkSync(join(HERE, '..', 'node_modules'), join(dir, 'node_modules'), 'dir'); }
  catch (e) { console.warn(`[runner] no pude symlinkear node_modules al tmpdir: ${e.message}`); }
  console.log(`\n═══ MUTATION TESTING · ${tanda.length}/${MUTANTES.length} mutantes${pedidos ? ` (tanda: ${pedidos.join(',')})` : ''} ═══\n(copias en ${dir} — el repo no se toca)\n`);
  let vivos = 0, arnes = 0;
  for (const m of tanda) {
    const SRC = m.archivo === 'portal' ? PORTAL : INSC;
    if (!SRC.includes(m.from)) {
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el ancla no existe en el fuente. ${m.desc}`);
      arnes++; continue;
    }
    const path = join(dir, `${m.id}.html`);
    writeFileSync(path, SRC.replace(m.from, m.to));
    const env = { ...process.env };
    env[m.archivo === 'portal' ? 'PORTAL_HTML' : 'INSC_HTML'] = path;
    let out = '';
    try { out = execFileSync(process.execPath, [SELF], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }

    // "murió por assert" vs "murió al arrancar": el probe siempre cierra con
    // "NN/NN OK". Sin esa línea el hijo no llegó a los asserts y NO se sabe
    // nada del mutante — reportarlo como SOBREVIVE sería leerlo como agujero
    // de cobertura cuando es un fallo del arnés.
    const corrio = /^\d+\/\d+ OK$/m.test(out);
    if (!corrio) {
      const causa = (out.split('\n').find(l => /Error|error:/.test(l)) || '(sin línea de error)').trim();
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el probe no llegó a correr los asserts. ${m.desc}`
        + `\n     ↳ ${causa.slice(0, 200)}`);
      arnes++; continue;
    }
    // GOTCHA #82 — anclar en el ')' del rótulo: `❌ H1\b` NO delimita `❌ H1b)`.
    const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));
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
  // Guard del arnés: si el proceso no corre en UTC-3, el "09:00" esperado no
  // aplica y todo lo de hora sería ruido. Se corta acá con un mensaje claro.
  if (new Date(CIERRE_ISO).getHours() !== 9) {
    console.error(`ARNÉS: el proceso no está en UTC-3 (TZ=${process.env.TZ}, `
      + `getHours=${new Date(CIERRE_ISO).getHours()}). Abortado.`);
    process.exit(2);
  }

  try {
    const { data: hip } = await sb.from('hipodromos').select('id').eq('club_id', CLUB_ID).limit(1).single();
    const { data: cat } = await sb.from('categorias_carrera').select('id,nombre').eq('club_id', CLUB_ID).limit(1).single();

    const reun = await ins('reuniones', {
      club_id: CLUB_ID, hipodromo_id: hip.id, numero: 9992,
      fecha: '2099-05-05', estado: 'publicada',
    }, 'reuniones');

    const base = {
      reunion_id: reun, estado: 'abierta', categoria_id: cat.id,
      apertura_inscripcion: '2026-01-01T00:00:00+00:00',
      cierre_inscripcion: CIERRE_ISO,
    };
    // Turno 9 — condición LARGA (192 caracteres): el caso de tres renglones.
    const cLarga = await ins('carreras', {
      ...base, numero_turno: 9, distancia_metros: 1100, tipo_pista: 'tierra',
      condicion_sexo: 'ambos', edad_minima_anos: 5, edad_maxima_anos: 10,
      bolsa_total: BOLSA, distribucion_premios: DIST, cupo_maximo: 14,
      condicion_handicap: HC_LARGA, condicion_adicional: AD_LARGA,
    }, 'carreras');
    // Turno 1 — condición corta, un solo renglón, sin adicional.
    const cCorta = await ins('carreras', {
      ...base, numero_turno: 1, distancia_metros: 1200, tipo_pista: 'cesped',
      condicion_sexo: 'ambos', edad_minima_anos: 5, edad_maxima_anos: 5,
      bolsa_total: BOLSA, distribucion_premios: DIST, cupo_maximo: 14,
      condicion_handicap: HC_CORTA, condicion_adicional: null,
    }, 'carreras');

    // ── A) HORA — el bug que marcó Fede ──────────────────────────────────────
    const domP = mkDom();
    const P = await mkPortal({ dom: domP });
    const hP = P.fechaHora(CIERRE_ISO);

    ok('H1) el llamado imprime la hora en 24 h, sin duplicar la unidad',
       hP === HORA_ESPERADA, `fechaHora → "${hP}"  (esperado "${HORA_ESPERADA}")`);
    ok('H2) sin "a. m." ni "p. m."', !/[ap]\.\s*m\./i.test(hP), `"${hP}"`);
    ok('H3) una sola vez "hs"', (hP.match(/\bhs\b/g) || []).length === 1, `"${hP}"`);

    const domI = mkDom();
    const I = await mkInsc({ dom: domI });
    const hI = I.fechaHora(CIERRE_ISO);
    ok('H4) inscripciones imprime la MISMA hora que el llamado',
       hI === hP && hI === HORA_ESPERADA, `portal="${hP}" · inscripciones="${hI}"`);

    // El valor de hora_cierre no se toca: se verifica que lo que se lee de la
    // base sigue siendo el 09:00 AR que cargó Yesi.
    const { data: carrDb } = await sb.from('carreras')
      .select('cierre_inscripcion').eq('id', cLarga).single();
    ok('H5) el valor guardado sigue siendo 09:00 AR — sólo cambió el formato',
       new Date(carrDb.cierre_inscripcion).getHours() === 9
       && P.fechaHora(carrDb.cierre_inscripcion) === HORA_ESPERADA,
       `db=${carrDb.cierre_inscripcion} → "${P.fechaHora(carrDb.cierre_inscripcion)}"`);

    // Medianoche: hour12:false puede dar "24:00" en algunos locales. Acá no.
    const medianoche = '2099-05-02T03:00:00+00:00';   // 00:00 AR
    ok('H6) medianoche sale 00:00 en las dos pantallas, no 24:00',
       P.fechaHora(medianoche) === '2/5 00:00 hs' && I.fechaHora(medianoche) === '2/5 00:00 hs',
       `portal="${P.fechaHora(medianoche)}" · inscripciones="${I.fechaHora(medianoche)}"`);

    ok('H7) el helper es idéntico en los dos archivos (ninguno se quedó atrás)',
       ['2099-05-01T12:00:00+00:00', '2099-05-02T03:00:00+00:00', '2099-11-05T14:35:00+00:00', null]
         .every(v => P.fechaHora(v) === I.fechaHora(v)));

    // ── B) EL LLAMADO ABIERTO (portal.html) ──────────────────────────────────
    await P.loadLlamado();
    const cartaHtml = domP.getElementById('carta-container').innerHTML;
    const bloque = bloqueDeReunion(cartaHtml, 'Reunión 9992');
    ok('P0) el llamado renderizó el bloque de la reunión del fixture',
       bloque.length > 0, `container=${cartaHtml.length} chars`);

    const filaL = filaDeTurno(bloque, HC_LARGA);
    const filaC = filaDeTurno(bloque, HC_CORTA);
    ok('P1) el turno de condición larga tiene su fila', filaL.length > 0);

    const chipsL = divChips(filaL);
    ok('P2) chip de distancia', chipsL.includes('>1100m<'), chipsTxt(filaL));
    ok('P3) chip de pista', chipsL.includes('>tierra<'));
    ok('P4) chip de sexo', chipsL.includes('>ambos<'));
    ok('P5) chip de rango de edad', chipsL.includes('>5 a 10 años<'));
    // ⚠️ NO comparar contra el otro chip: eso fue lo que dejó pasar el bug del
    // 08/09. El esperado viene del oráculo (premios-utils.js cargado aparte).
    ok('P6) el chip de bolsa del llamado == repartoDisplay, NO el nominal',
       chipsL.includes(P.formatARS(BOLSA_EFECTIVA)) && !chipsL.includes(P.formatARS(BOLSA)),
       `chip=${chipsTxt(filaL)} · esperado=${P.formatARS(BOLSA_EFECTIVA)} · nominal(prohibido)=${P.formatARS(BOLSA)}`);
    ok('P7) el número de turno está en la fila', filaL.includes('<div class="carrera-num">9</div>'));
    ok('P8) el texto de la condición está en la fila', filaL.includes(HC_LARGA));
    ok('P9) chip de cierre en 24 h', chipsL.includes(`⏳ cierra ${HORA_ESPERADA}`));
    ok('P10) ni un "a. m." en todo el llamado renderizado', !/[ap]\.\s*m\./i.test(cartaHtml));

    // ── C) EL ENCABEZADO DE INSCRIPCIONES (inscripciones.html) ───────────────
    domI.getElementById('sel-reunion').value = reun;
    await I.onReunionChange();
    ok('Q0) onReunionChange trajo los dos turnos del fixture',
       I._get().carreras.length === 2, `carreras=${I._get().carreras.length}`);

    domI.getElementById('sel-carrera').value = cLarga;
    await I.onCarreraChange();
    const headL = domI.getElementById('carrera-header').innerHTML;
    ok('Q1) el encabezado se muestra', domI.getElementById('carrera-header').style.display === 'flex');

    const chipsQL = divChips(headL);
    ok('Q2) chip de distancia', chipsQL.includes('>1100m<'), chipsTxt(headL));
    ok('Q3) chip de pista', chipsQL.includes('>tierra<'));
    ok('Q4) chip de sexo', chipsQL.includes('>ambos<'));
    ok('Q5) chip de rango de edad', chipsQL.includes('>5 a 10 años<'));
    ok('Q6) el chip de bolsa de inscripciones == repartoDisplay, NO el nominal',
       chipsQL.includes(I.formatMonto(BOLSA_EFECTIVA)) && !chipsQL.includes(I.formatMonto(BOLSA)),
       `chip=${chipsTxt(headL)} · esperado=${I.formatMonto(BOLSA_EFECTIVA)}`);
    ok('Q7) chip de cierre en 24 h', chipsQL.includes(`⏳ cierra ${HORA_ESPERADA}`));
    ok('Q8) el texto de la condición está en el encabezado', headL.includes(HC_LARGA));
    ok('Q9) el número de turno está en el encabezado',
       headL.includes('<div class="carrera-num">9</div>'));
    ok('Q10) ni un "a. m." en el encabezado', !/[ap]\.\s*m\./i.test(headL));

    ok('Y1) el chip de categoría que pidió Yesi está en inscripciones',
       chipsQL.includes(`>${cat.nombre}<`), `categoría="${cat.nombre}"`);

    // ── D) PARIDAD: campo por campo, las dos muestran lo mismo ───────────────
    const CAMPOS = [
      ['número de turno', '>9<', '>9<'],
      ['distancia', '>1100m<', '>1100m<'],
      ['pista', '>tierra<', '>tierra<'],
      ['sexo', '>ambos<', '>ambos<'],
      ['rango de edad', '>5 a 10 años<', '>5 a 10 años<'],
      ['bolsa', P.formatARS(BOLSA_EFECTIVA), I.formatMonto(BOLSA_EFECTIVA)],
      ['cierre', `cierra ${HORA_ESPERADA}`, `cierra ${HORA_ESPERADA}`],
      ['condición', HC_LARGA, HC_LARGA],
    ];
    const faltan = CAMPOS.filter(([, a, b]) => !(filaL.includes(a) && headL.includes(b)))
      .map(([n]) => n);
    ok('D1) los ocho campos aparecen en LAS DOS pantallas',
       faltan.length === 0, faltan.length ? `faltan: ${faltan.join(', ')}` : '8/8');

    ok('D2) la condición se arma igual en las dos (mismo separador)',
       P.textoCondicion({ condicion_handicap: HC_LARGA, condicion_adicional: AD_LARGA })
       === I.textoCondicion({ condicion_handicap: HC_LARGA, condicion_adicional: AD_LARGA }));
    ok('D3) el rango de edad se arma igual en las dos',
       [[5, 10], [5, 5], [3, null], [null, 4], [null, null]]
         .every(([a, b]) => P.textoEdad({ edad_minima_anos: a, edad_maxima_anos: b })
                          === I.textoEdad({ edad_minima_anos: a, edad_maxima_anos: b })));
    ok('D4) la bolsa se formatea igual en las dos',
       P.formatARS(BOLSA_EFECTIVA) === I.formatMonto(BOLSA_EFECTIVA),
       `portal="${P.formatARS(BOLSA_EFECTIVA)}" · inscripciones="${I.formatMonto(BOLSA_EFECTIVA)}"`);

    // El assert que faltaba: paridad NO alcanza. Aunque las dos coincidan, el
    // valor tiene que ser el del oráculo. Si las dos volvieran al nominal, D1 y
    // D4 seguirían en verde y sólo este las agarra.
    ok('D5) las dos coinciden CON EL ORÁCULO, no sólo entre sí',
       filaL.includes(P.formatARS(BOLSA_EFECTIVA)) && headL.includes(I.formatMonto(BOLSA_EFECTIVA))
       && !filaL.includes(P.formatARS(BOLSA)) && !headL.includes(I.formatMonto(BOLSA)),
       `oráculo=${P.formatARS(BOLSA_EFECTIVA)} (nominal ${P.formatARS(BOLSA)} no debe aparecer)`);

    // ── E) LAYOUT: la condición larga no rompe la tarjeta ────────────────────
    ok('L1) el llamado muestra la condición larga COMPLETA, sin truncar',
       textoCond(filaL) === COND_LARGA && COND_LARGA.length === 192,
       `render=${textoCond(filaL).length} chars · esperado=${COND_LARGA.length}`);
    ok('L2) inscripciones muestra la condición larga COMPLETA, sin truncar',
       textoCond(headL) === COND_LARGA,
       `render=${textoCond(headL).length} chars · esperado=${COND_LARGA.length}`);
    ok('L3) en el llamado la condición va en su propio bloque, no en la fila de chips',
       filaL.includes('<div class="carrera-cond">') && !divChips(filaL).includes(HC_LARGA));
    ok('L4) en inscripciones la condición va en su propio bloque, no en la fila de chips',
       headL.includes('<div class="carrera-cond">') && !divChips(headL).includes(HC_LARGA));

    // El turno corto y el largo tienen que tener la MISMA cantidad de chips: si
    // la condición larga se filtrara a la fila de chips, el largo tendría uno más.
    domI.getElementById('sel-carrera').value = cCorta;
    await I.onCarreraChange();
    const headC = domI.getElementById('carrera-header').innerHTML;
    ok('L5) el llamado: mismo número de chips con condición corta y con larga',
       contarChips(filaL) === contarChips(filaC) && contarChips(filaL) > 0,
       `larga=${contarChips(filaL)} · corta=${contarChips(filaC)}`);
    ok('L6) inscripciones: mismo número de chips con condición corta y con larga',
       contarChips(headL) === contarChips(headC) && contarChips(headL) > 0,
       `larga=${contarChips(headL)} · corta=${contarChips(headC)}`);

    // El CSS es lo único que impide que una palabra sin espacios estire la
    // tarjeta. Se lee del propio archivo, no se asume.
    const cssP = (PORTAL.match(/\.carrera-cond\s*\{[^}]*\}/) || [''])[0];
    const cssI = (INSC.match(/\.carrera-cond\s*\{[^}]*\}/) || [''])[0];
    ok('L7) .carrera-cond declara overflow-wrap: anywhere en las dos hojas',
       /overflow-wrap:\s*anywhere/.test(cssP) && /overflow-wrap:\s*anywhere/.test(cssI),
       `portal="${cssP}" · inscripciones="${cssI}"`);
    ok('L8) el contenedor de texto puede encogerse (min-width), así el bloque crece hacia abajo',
       /\.carrera-info\s*\{[^}]*min-width/.test(PORTAL)
       && /\.carrera-header-body\s*\{[^}]*min-width:\s*0/.test(INSC));

    // ── F) LO QUE NO SE TOCÓ ─────────────────────────────────────────────────
    ok('F1) mirar el encabezado no cambia la reunión activa por otra cosa que el select',
       I._setSpy.ids.every(id => id === reun), `ids=${JSON.stringify(I._setSpy.ids)}`);
    ok('F2) ningún toast de error durante el render',
       I._get().toasts.filter(t => t.tipo === 'error').length === 0,
       JSON.stringify(I._get().toasts));
    ok('F3) el gate de edad de la inscripción quedó intacto',
       INSC.includes('edadSPCTexto') && !INSC.includes('// gate edad deshabilitado'));

    // Encabezado vacío al deseleccionar.
    domI.getElementById('sel-carrera').value = '';
    await I.onCarreraChange();
    ok('F4) al deseleccionar el turno el encabezado se limpia',
       domI.getElementById('carrera-header').innerHTML === ''
       && domI.getElementById('carrera-header').style.display === 'none');

  } finally {
    // Teardown: carreras antes que reuniones (FK).
    for (const id of fx.carreras) await sb.from('carreras').delete().eq('id', id);
    for (const id of fx.reuniones) await sb.from('reuniones').delete().eq('id', id);
    const { data: quedan } = await sb.from('reuniones')
      .select('id').eq('club_id', CLUB_ID).eq('numero', 9992);
    ok('T1) teardown: no quedó ninguna reunión 9992 en la base',
       (quedan || []).length === 0, `quedan=${(quedan || []).length}`);
  }

  console.log('\n── Probe · paridad llamado abierto ↔ encabezado de inscripciones ──');
  console.log(`   portal=${PORTAL_PATH}`);
  console.log(`   insc=${INSC_PATH}`);
  console.log(`   TZ=${process.env.TZ} · condición larga=${COND_LARGA.length} chars`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
