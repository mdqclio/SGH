#!/usr/bin/env node
/**
 * probe_pagos_vista_incentivo_pagados.mjs — Pagos, vista por carrera (24/09/2026)
 *
 * A) El incentivo de jockey (UNA línea por reunión, sin inscripcion_id) se mostraba con importe
 *    bajo CADA carrera donde el jockey corrió: sumando carreras R9 daba $1.028.700 contra $908.700
 *    reales. Ahora va con importe sólo en la carrera DUEÑA (la de número más bajo en que largó) y
 *    en las otras queda una nota gris "Incentivo por reunión: figura en la carrera N".
 * B) Lo pagado se muestra donde estaba el botón: chip por recibo ("✓ Transferido · Rec. #N" /
 *    "✓ Efectivo · Rec. #N"), "✓ Pagado (regularizado)" si está saldado sin recibo; recibo anulado
 *    no cuenta. Rótulo del caballo sin pagable: "Sin deuda pagable · todo pagado (N transferencia,
 *    M efectivo)" o "Sin deuda pagable" a secas.
 *
 * Código REAL extraído de liquidaciones.html (bloque VISTA POR CARRERA + cobrosBuscar) con DOM stub.
 * SOLO LECTURA: no escribe nada en la base. Lo esperado sale de la BASE, no de otra pantalla (GOTCHA #93).
 * Las reglas sobre una reunión entera (§ 1–4) corren DOS veces:
 *   [S]  reunión SINTÉTICA (tests/lib/pagos_sintetico.mjs + cliente en memoria tests/lib/sb_fixture.mjs),
 *        estricta: hay incentivos impagos con una y con varias montas, uno pagado por transferencia,
 *        chips de efectivo / transferencia / regularizado;
 *   [R9] R9 real con la secret key: las mismas reglas, con "si hay, está bien" en lo que necesita algo
 *        IMPAGO — el 02/10 se cobraron todos los incentivos de jockey de R9 y 2c/2d/3 quedaron sin caso.
 * Los chips de recibo anulado y los casos de una línea van por las funciones puras (§ 5–7).
 *
 * MUTANTES (`--mutante=<nombre>` / `--mutantes`): ver MUTANTES abajo, uno por regla.
 *
 * Uso:
 *   set -a; . ./.env; set +a
 *   node tests/probe_pagos_vista_incentivo_pagados.mjs
 *   node tests/probe_pagos_vista_incentivo_pagados.mjs --mutantes
 *   LIQUIDACIONES_HTML=https://sigh.com.ar/liquidaciones.html node tests/probe_pagos_vista_incentivo_pagados.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sbFixture } from './lib/sb_fixture.mjs';
import { reunionPagosSintetica, REL_PAGOS, RS } from './lib/pagos_sintetico.mjs';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const R9_REAL = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }
const sbReal = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

const MUTANTES = {
  // A — incentivo una sola vez
  incentivo_en_todas:   ["const esDuena = !d || d.carrera_id === carreraId;", "const esDuena = true;"],
  dueno_mas_alto:       ["if (!prev || c.nro < prev.nro ||", "if (!prev || c.nro > prev.nro ||"],
  sin_nota:             ["if (!b.notas.includes(nota)) b.notas.push(nota);", ""],
  nota_tambien_en_duena:["if (esDuena) { meter(porInsc[i.id], l, 'Jockey'); continue; }\n        const nota = `Incentivo por reunión: figura en la carrera ${d.nro}`;",
                         "if (esDuena) { meter(porInsc[i.id], l, 'Jockey'); }\n        const nota = `Incentivo por reunión: figura en la carrera ${d?.nro}`;"],
  sin_rotulo_una_vez:   ["· Incentivo por reunión — se paga una sola vez", "· por reunión"],
  // B — pagados
  anulado_cuenta:       ["if (!r || r.estado === 'anulado') return null;", "if (!r) return null;"],
  regularizado_ignorado:["return l.estado_linea === 'pagado' ? { tipo: 'regularizado' } : null;", "return null;"],
  todo_efectivo:        ["tipo: r.forma_pago === 'transferencia' ? 'transferencia' : 'efectivo'", "tipo: 'efectivo'"],
  boton_solo_sin_pagos: ["${be.lineas.length ? `<button", "${be.lineas.length && !be.pagos.length ? `<button"],
  chips_solo_sin_pendiente: ["${cobChipsPago(be.pagos).map(", "${(be.lineas.length ? [] : cobChipsPago(be.pagos)).map("],
  rotulo_ignora_pagos:  ["if (!bloque.pagos.length) return 'Sin deuda pagable';", "return 'Sin deuda pagable';"],
  pagado_suma_total:    ["if (l._pago) { b.pagos.push(l._pago); bloque.pagos.push({ ...l._pago, benef: k(l) }); return; }",
                         "if (l._pago) { b.pagos.push(l._pago); bloque.pagos.push({ ...l._pago, benef: k(l) }); }"],
  chip_por_linea:       ["if (vistos.has(p.recibo_id)) continue;", ""],
  todo_pagado_con_retenidas: ["if (retenidas) return 'Sin deuda pagable · Pagado · resta lo retenido por antidoping';", ""],
  regularizados_con_ceros: ["const partes = conRecibo\n    ?", "const partes = true\n    ?"],
  regularizado_singular: [", ${reg.size} regularizados` : ''}", ", ${reg.size} regularizado` : ''}"],
  pagadas_no_se_cargan: ["cobLineasDeCarrera([...lineas, ...pagadas],", "cobLineasDeCarrera([...lineas],"],
};
const args = process.argv.slice(2);
const mutArg = args.find(a => a.startsWith('--mutante='))?.split('=')[1];
if (args.includes('--mutantes')) {
  let vivos = 0;
  for (const m of Object.keys(MUTANTES)) {
    const r = spawnSync(process.execPath, [SELF, `--mutante=${m}`], { encoding: 'utf8', env: process.env });
    const murio = r.status !== 0; if (!murio) vivos++;
    const fallos = (r.stdout.match(/^❌ .*$/gm) || []);
    console.log(`${murio ? '💀' : '🧟'} mutante ${m.padEnd(26)} → ${murio ? `muerto (${fallos.length} assert(s))` : 'VIVO — el probe no lo detecta'}`);
    fallos.slice(0, 3).forEach(f => console.log('     ' + f));
    if (murio && !fallos.length) console.log('     ' + (r.stderr || r.stdout).trim().split('\n').slice(-3).join(' | '));
  }
  console.log(`\n${Object.keys(MUTANTES).length - vivos}/${Object.keys(MUTANTES).length} mutantes muertos`);
  process.exit(vivos ? 1 : 0);
}

let SRC;
const fuente = process.env.LIQUIDACIONES_HTML;
if (fuente && /^https?:/.test(fuente)) SRC = await (await fetch(`${fuente}?v=${Date.now()}`)).text();
else SRC = readFileSync(fuente || join(HERE, '..', 'liquidaciones.html'), 'utf8');
if (mutArg) {
  const m = MUTANTES[mutArg];
  if (!m) { console.error(`mutante desconocido: ${mutArg}`); process.exit(2); }
  const [de, a] = m;
  if (!SRC.includes(de)) { console.error(`el mutante ${mutArg} no aplica: no está ${JSON.stringify(de).slice(0, 80)}`); process.exit(2); }
  SRC = SRC.replace(de, a);
  console.log(`⚠ MUTANTE ${mutArg} aplicado`);
}

const results = [];
let ETQ = '';
const ok = (t, c, n = '') => { results.push({ t: `[${ETQ}] ${t}`, s: c ? '✅' : '❌', n }); return c; };
function extractFn(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error(`no pude cerrar: ${firma}`);
}
const bloque = (ini, fin) => {
  const i = SRC.indexOf(ini), j = SRC.indexOf(fin, i);
  if (i < 0 || j < 0) throw new Error(`no encontré el bloque ${ini}`);
  return SRC.slice(SRC.indexOf('\n', i) + 1, j);
};

// ── arnés: cobrosBuscar real + la vista, con DOM stub (mismo que probe_pagos_vista_carrera) ──
// sb / R9 / profesionales / propietariosMap son los de la corrida en curso ([S] o [R9]).
let sb, R9, ESTRICTO, profesionales = {}, propietariosMap = {};
async function usar(cliente, reunion, estricto, etq) {
  sb = cliente; R9 = reunion; ESTRICTO = estricto; ETQ = etq;
  const [{ data: profs }, { data: props }] = await Promise.all([
    sb.from('profesionales').select('id,nombre,apellido,tipo,documento_nro').eq('club_id', CLUB_ID),
    sb.from('propietarios').select('id,nombre,nombre_stud,documento_nro').eq('activo', true),
  ]);
  profesionales = {}; propietariosMap = {};
  profs.forEach(p => { profesionales[p.id] = p; }); props.forEach(p => { propietariosMap[p.id] = p; });
}
const hay = n => !ESTRICTO || n > 0;   // [R9]: un caso que hoy no existe (todo cobrado) no es rojo; [S]: tiene que existir
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unescape = s => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const fmt = n => '$' + Number(n).toFixed(2);
function mkDocument(campos) {
  const nodos = {};
  const get = id => (nodos[id] ||= { value: campos[id] ?? '', innerHTML: '', textContent: '', style: {}, classList: { add(){}, remove(){}, toggle(){} }, scrollIntoView(){} });
  Object.keys(campos).forEach(get); ['cob-detalle', 'cob-beneficiarios'].forEach(get);
  return { getElementById: id => get(id), _n: nodos, querySelectorAll: () => [] };
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const srcVista = bloque('// ═══ VISTA POR CARRERA — INICIO', '// ═══ VISTA POR CARRERA — FIN ═══');
const srcMatch = bloque('// ═══ MATCHEO DEL BUSCADOR — ANCLAS DEL PROBE', '// ═══ MATCHEO DEL BUSCADOR — FIN ═══');
const src = [
  SRC.slice(SRC.indexOf('const ROL_POR_BENEFICIARIO'), SRC.indexOf('\n', SRC.indexOf('const ROL_POR_BENEFICIARIO'))),
  extractFn(SRC, 'function rolDeLinea(l)'), extractFn(SRC, 'function subRolDeLinea(l)'), extractFn(SRC, 'function conceptoDeLinea(l)'),   // rolDeLinea y la vista las usan para 'actuacion' (25/09)
  extractFn(SRC, 'function nombreBenef(tipo, id)'),
  srcMatch, extractFn(SRC, 'function benefSearch(tipo, id)'),
  extractFn(SRC, 'function etiquetaRoles(g)'), extractFn(SRC, 'function etiquetaCarreras(g)'),
  extractFn(SRC, 'async function cobCargarReunPrueba()'), extractFn(SRC, 'function cobVisible(l, rid)'),
  extractFn(SRC, 'function cobDelClub(l)'), srcVista, extractFn(SRC, 'async function cobrosBuscar()'),
].join('\n\n');
async function modulo(document) {
  return new AsyncFunction('sb', 'CLUB_ID', 'document', 'toast', 'fmt', 'escapeHtml', 'propietariosMap', 'profesionales',
    `let cobCaballerizas = [], cobInscCarrera = {}, cobNroCarrera = {}, cobMapsScope = null, cobReunPrueba = null;
     ${src}
     return { cobrosBuscar, cobMarcarPagadas, cobArmarVistaCarrera, cobHtmlVistaCarrera, cobDuenosIncentivo };`)(
    sb, CLUB_ID, document, (m) => { throw new Error('toast: ' + m); }, fmt, escapeHtml, propietariosMap, profesionales);
}
async function buscar(carreraId, rid = R9) {
  const document = mkDocument({ 'cob-q': '', 'cob-reunion': rid, 'cob-carrera': carreraId });
  const warnReal = console.warn;   // la línea de otro club del fixture avisa ISSUE-060: es lo esperado
  console.warn = (...a) => { if (!/ISSUE-060/.test(a.join(' '))) warnReal(...a); };
  try { await (await modulo(document)).cobrosBuscar(); } finally { console.warn = warnReal; }
  return document._n['cob-beneficiarios'].innerHTML;
}
// parser: bloques { titulo, info, pagable, benefs:[{rol, nombre, pagar, lineas:[{texto,monto}], notas:[], chips:[]}] }
function parsear(html) {
  return html.split('<div class="liq-card cob-caballo').slice(1).map(p => {
    const titulo = unescape(/class="liq-prof">([^<]*)</.exec(p)?.[1] || '');
    const info = unescape(/class="liq-recibo">([^<]*)</.exec(p)?.[1] || '');
    const pagableTxt = /class="monto-val neto">([^<]*)</.exec(p)?.[1];
    const benefs = p.split('<div class="cob-rol">').slice(1).flatMap(r => {
      const rol = unescape(/cob-rol-titulo">([^<]*)</.exec(r)?.[1] || '');
      return r.split('<div class="cob-benef">').slice(1).map(b => ({
        rol,
        nombre: unescape(/cob-benef-nombre">([^<]*)</.exec(b)?.[1] || ''),
        pagar: /cobrosDetalle\('([^']*)','([^']*)'\)/.exec(b)?.slice(1, 3) || null,
        lineas: [...b.matchAll(/<li><span>([\s\S]*?)<\/span><span>([^<]*)<\/span><\/li>/g)].map(m => ({ texto: unescape(m[1].replace(/<[^>]+>/g, '')), monto: parseFloat(m[2].replace('$', '')) })),
        notas: [...b.matchAll(/<li class="cob-nota"><span>([^<]*)<\/span><\/li>/g)].map(m => unescape(m[1])),
        chips: [...b.matchAll(/<span class="cob-pagado">([^<]*)<\/span>/g)].map(m => unescape(m[1])),
      }));
    });
    return { titulo, info, pagable: pagableTxt ? parseFloat(pagableTxt.replace('$', '')) : 0, benefs };
  });
}
const round2 = n => Math.round(n * 100) / 100;
const esIncentivo = l => /se paga una sola vez/.test(l.texto);

async function seccion() {
// ═════════ datos de la BASE (independientes de la pantalla) ═════════
const { data: carrs } = await sb.from('carreras').select('id,numero_turno,numero_carrera_programa,estado').eq('reunion_id', R9);
const carrsVivas = carrs.filter(c => c.estado == null || c.estado !== 'anulada');
const nroDe = c => c.numero_carrera_programa ?? c.numero_turno;
const { data: inscsR9 } = await sb.from('inscripciones')
  .select('id,carrera_id,jockey_titular_id,resultado_posiciones(no_largo)').in('carrera_id', carrsVivas.map(c => c.id)).eq('estado', 'ratificado');
// jockey → carreras (número) donde largó
const largoEn = {};
for (const i of inscsR9) {
  const rp = Array.isArray(i.resultado_posiciones) ? i.resultado_posiciones[0] : i.resultado_posiciones;
  if (!rp || rp.no_largo !== false || !i.jockey_titular_id) continue;
  (largoEn[i.jockey_titular_id] ||= new Set()).add(nroDe(carrs.find(c => c.id === i.carrera_id)));
}
const minNro = jid => Math.min(...largoEn[jid]);
const { data: todasR9 } = await sb.from('liquidacion_detalle')
  .select('id,beneficiario_tipo,beneficiario_id,concepto_tipo,inscripcion_id,carrera_id,monto_neto,estado_linea,recibo_id,recibos(numero_recibo,forma_pago,estado),liquidaciones(club_id)')
  .eq('reunion_id', R9);
const delClub = todasR9.filter(l => l.liquidaciones?.club_id === CLUB_ID && l.beneficiario_tipo !== 'club');
// Lo que la solapa Resumen llama "Pendiente de cobrar": impago, no club (recalculado acá desde la base)
const pendienteBase = round2(delClub.filter(l => l.estado_linea === 'impago' && !l.recibo_id).reduce((s, l) => s + parseFloat(l.monto_neto), 0));
const nombreProf = id => profesionales[id] ? `${profesionales[id].apellido}, ${profesionales[id].nombre}` : id;

// ═════════ render de las carreras vivas de R9 ═════════
const vistas = [];
for (const c of [...carrsVivas].sort((a, b) => nroDe(a) - nroDe(b))) vistas.push({ c, nro: nroDe(c), b: parsear(await buscar(c.id)) });
const conResultado = vistas.filter(v => v.b.some(b => /^\d+°/.test(b.titulo)));

// 1) suma de lo pagable mostrado = pendiente de la base
const sumaPagable = round2(vistas.reduce((s, v) => s + v.b.reduce((t, b) => t + b.pagable, 0), 0));
const sumaLineas = round2(vistas.reduce((s, v) => s + v.b.reduce((t, b) => t + b.benefs.reduce((u, be) => u + be.lineas.reduce((w, l) => w + l.monto, 0), 0), 0), 0));
ok(`1) suma del "Pagable" de las ${vistas.length} carreras (${conResultado.length} con resultado) = pendiente en la base (Resumen)`, sumaPagable === pendienteBase, `${sumaPagable.toFixed(2)} vs ${pendienteBase.toFixed(2)}`);
ok('1b) suma de los importes de todas las líneas mostradas = pendiente en la base', sumaLineas === pendienteBase, `${sumaLineas.toFixed(2)}`);
const idsPendientes = delClub.filter(l => l.estado_linea === 'impago' && !l.recibo_id);
const nLineasVista = vistas.reduce((s, v) => s + v.b.reduce((t, b) => t + b.benefs.reduce((u, be) => u + be.lineas.length, 0), 0), 0);
ok('1c) cantidad de líneas pagables mostradas = líneas impagas de la base (ninguna dos veces, ninguna afuera)', nLineasVista === idsPendientes.length, `${nLineasVista} vs ${idsPendientes.length}`);

// 2/2b/2p) caso de un jockey que largó en dos carreras: pasaron a SINTÉTICOS (§ 7, al final). Antes usaban un jockey real de
// R9 cuyo incentivo estaba impago; el 02/10 se cobró por transferencia y el caso dejó de existir (mismo motivo que P2/P5 de
// probe_reparto_100). Las reglas generales sobre R9 real (2c, 3b, 3c, 4) siguen acá abajo.
function apariciones(jid) {
  const lin = [], notas = [];
  for (const v of vistas) for (const b of v.b) for (const be of b.benefs) {
    if (be.pagar?.[1] === jid || (be.rol === 'Jockey' && be.nombre === nombreProf(jid))) {
      be.lineas.filter(esIncentivo).forEach(() => lin.push(v.nro));
      be.notas.forEach(n => notas.push({ nro: v.nro, n }));
    }
  }
  return { lin, notas };
}
// 2c) regla general: todo incentivo pagable aparece con importe exactamente una vez, en min(carreras donde largó)
const incPend = delClub.filter(l => l.concepto_tipo === 'incentivo_jockey' && l.estado_linea === 'impago' && !l.recibo_id);
const malUbicados = incPend.filter(l => { const a = apariciones(l.beneficiario_id); return !(a.lin.length === 1 && a.lin[0] === minNro(l.beneficiario_id)); });
ok(`2c) los ${incPend.length} incentivos pagables aparecen con importe una sola vez, en la carrera de número más bajo`, hay(incPend.length) && malUbicados.length === 0, malUbicados.map(l => nombreProf(l.beneficiario_id)).join(', '));
// 2d) la línea lleva la etiqueta
const lineasInc = vistas.flatMap(v => v.b.flatMap(b => b.benefs.flatMap(be => be.lineas.filter(l => /incentivo jockey/i.test(l.texto)))));
ok('2d) cada incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"', hay(lineasInc.length) && lineasInc.every(esIncentivo), lineasInc[0]?.texto);

// 3) jockey con una sola monta: sin nota
const unaMonta = Object.keys(largoEn).filter(j => largoEn[j].size === 1 && delClub.some(l => l.concepto_tipo === 'incentivo_jockey' && l.beneficiario_id === j));
const conNotaIndebida = unaMonta.filter(j => apariciones(j).notas.length);
// 3) antes: un jockey real con nombre propio (una monta, incentivo pagable); el 02/10 lo cobró. Ahora la regla: TODOS los
// de una monta con incentivo pagable lo muestran con importe una vez y sin nota.
const unaMontaPag = unaMonta.filter(j => incPend.some(l => l.beneficiario_id === j));
const unaMontaMal = unaMontaPag.filter(j => !(apariciones(j).lin.length === 1 && apariciones(j).notas.length === 0));
ok(`3) los ${unaMontaPag.length} jockeys de una monta con incentivo pagable: con importe en su carrera y sin nota`, hay(unaMontaPag.length) && unaMontaMal.length === 0, unaMontaMal.map(j => JSON.stringify(apariciones(j))).join('; '));
ok(`3b) ninguno de los ${unaMonta.length} jockeys de una sola monta lleva nota`, hay(unaMonta.length) && conNotaIndebida.length === 0, conNotaIndebida.map(nombreProf).join(', '));
// 3c) varias montas → nota en todas menos la dueña (pagado o no)
const variasMontas = Object.keys(largoEn).filter(j => largoEn[j].size > 1 && delClub.some(l => l.concepto_tipo === 'incentivo_jockey' && l.beneficiario_id === j));
const notasMal = variasMontas.filter(j => { const n = apariciones(j).notas; return n.length !== largoEn[j].size - 1 || n.some(x => x.nro === minNro(j)); });
ok(`3c) los ${variasMontas.length} jockeys con varias montas llevan nota en todas menos la dueña`, hay(variasMontas.length) && notasMal.length === 0, notasMal.map(nombreProf).join(', '));

// 4) chips reales de R9 contra la base: por carrera, los recibos (no anulados) de sus líneas
//    — premio/bono/etc. por inscripción + incentivo en su carrera dueña — y los regularizados
const insCarrera = Object.fromEntries(inscsR9.map(i => [i.id, i.carrera_id]));
const pagadasBase = delClub.filter(l => l.recibo_id ? l.recibos && l.recibos.estado !== 'anulado' : l.estado_linea === 'pagado');
let malChips = [];
for (const v of conResultado) {
  const mias = pagadasBase.filter(l => l.concepto_tipo === 'incentivo_jockey'
    ? largoEn[l.beneficiario_id] && minNro(l.beneficiario_id) === v.nro
    : (insCarrera[l.inscripcion_id] === v.c.id || (!l.inscripcion_id && l.carrera_id === v.c.id)));
  const espRec = [...new Set(mias.filter(l => l.recibo_id).map(l => `${l.recibos.forma_pago === 'transferencia' ? 'Transferido' : 'Efectivo'} · Rec. #${l.recibos.numero_recibo}`))].sort();
  const vistos = [...new Set(v.b.flatMap(b => b.benefs.flatMap(be => be.chips.filter(c => /Rec\. #/.test(c)).map(c => c.replace('✓ ', '')))))].sort();
  const regEsp = new Set(mias.filter(l => !l.recibo_id).map(l => `${l.beneficiario_tipo}|${l.beneficiario_id}|${l.inscripcion_id || 'inc'}`)).size;
  const regVis = v.b.reduce((s, b) => s + b.benefs.filter(be => be.chips.includes('✓ Pagado (regularizado)')).length, 0);
  if (JSON.stringify(espRec) !== JSON.stringify(vistos) || regEsp !== regVis) malChips.push(`C${v.nro}: rec ${vistos.length}/${espRec.length}, reg ${regVis}/${regEsp}`);
}
const totalChipsR9 = conResultado.reduce((s, v) => s + v.b.reduce((t, b) => t + b.benefs.reduce((u, be) => u + be.chips.length, 0), 0), 0);
ok(`4) en cada carrera con resultado, los chips de recibo = recibos de la base y los "regularizado" = saldados sin recibo (${totalChipsR9} chips)`, hay(totalChipsR9) && malChips.length === 0, malChips.join('; '));
ok('4b) ningún importe pagado entra al "Pagable" (ver 1) y ningún beneficiario sólo-pagado tiene botón Pagar',
   conResultado.every(v => v.b.every(b => b.benefs.every(be => be.lineas.length || !be.pagar))));

}

await usar(sbFixture(reunionPagosSintetica(CLUB_ID), REL_PAGOS), RS, true, 'S');
await seccion();
await usar(sbReal, R9_REAL, false, 'R9');
await seccion();
ETQ = 'puras';

// ═════════ 5) casos sintéticos por las funciones puras (sin base) ═════════
const api = await modulo(mkDocument({}));
const IDS = { P1: 'p1', E1: 'e1', J1: 'j1', P2: 'p2', P3: 'p3', J2: 'j2' };
// nombres sintéticos en los mismos mapas que usa nombreBenef (se pasan por referencia al módulo)
for (const [k, id] of Object.entries(IDS)) {
  if (k.startsWith('P')) propietariosMap[id] = { id, nombre: `SINT ${k}` };
  else profesionales[id] = { id, apellido: 'SINT', nombre: k };
}
const NOM = k => k.startsWith('P') ? `SINT ${k}` : `SINT, ${k}`;
const insc = (id, extra) => ({ id, numero_partidor: 1, posicion: 1, no_largo: false, largo: true, caballo: `CAB ${id}`, propietario_id: null, entrenador_id: null, jockey_titular_id: null, ...extra });
const inscsS = [
  insc('A', { posicion: 1, propietario_id: IDS.P1, entrenador_id: IDS.E1, jockey_titular_id: IDS.J1 }),
  insc('B', { posicion: 2, propietario_id: IDS.P2 }),
  insc('C', { posicion: 3, propietario_id: IDS.P3 }),
  insc('D', { posicion: 4 }),
  insc('E', { posicion: 5, jockey_titular_id: IDS.J2 }),
];
const L = (id, tipo, bid, ins, extra) => ({ id, beneficiario_tipo: tipo, beneficiario_id: bid, inscripcion_id: ins, carrera_id: 'CX', reunion_id: 'RX', concepto_tipo: 'premio', concepto: 'Carrera 1 — premio', monto_neto: '1000', liquidaciones: { club_id: CLUB_ID }, ...extra });
const REC = (n, forma, estado = 'emitido') => ({ numero_recibo: n, forma_pago: forma, estado });
const crudasPagadas = [
  L('a1', 'propietario', IDS.P1, 'A', { estado_linea: 'pagado', recibo_id: 'r901', recibos: REC(901, 'transferencia') }),
  L('a1b', 'propietario', IDS.P1, 'A', { estado_linea: 'pagado', recibo_id: 'r901', recibos: REC(901, 'transferencia'), concepto_tipo: 'bono' }),
  L('a2', 'profesional', IDS.E1, 'A', { estado_linea: 'pagado', recibo_id: 'r902', recibos: REC(902, 'efectivo') }),
  L('a3', 'profesional', IDS.J1, 'A', { estado_linea: 'pagado', recibo_id: null, descripcion: 'Jockey' }),
  L('e1', 'profesional', IDS.J2, 'E', { estado_linea: 'pagado', recibo_id: null, descripcion: 'Jockey' }),
  L('b1', 'propietario', IDS.P2, 'B', { estado_linea: 'pagado', recibo_id: 'r903', recibos: REC(903, 'efectivo') }),
  L('c1', 'propietario', IDS.P3, 'C', { estado_linea: 'pagado', recibo_id: 'r904', recibos: REC(904, 'transferencia', 'anulado') }),
  L('x1', 'propietario', IDS.P1, 'A', { estado_linea: 'pagado', recibo_id: 'r905', recibos: REC(905, 'efectivo'), liquidaciones: { club_id: 'otro-club' } }),
];
const pendientesS = [L('b2', 'propietario', IDS.P2, 'B', { estado_linea: 'impago', recibo_id: null, monto_neto: '500' })];
const marcadas = api.cobMarcarPagadas(crudasPagadas);
ok('5) cobMarcarPagadas: recibo anulado y línea de otro club quedan afuera', !marcadas.some(l => l.id === 'c1' || l.id === 'x1') && marcadas.length === 6, marcadas.map(l => l.id).join(','));
const bS = api.cobArmarVistaCarrera([...pendientesS, ...marcadas], inscsS, 'CX', new Map());
const hS = parsear(api.cobHtmlVistaCarrera(bS, {}));
const blk = t => hS.find(b => b.titulo.endsWith(`CAB ${t}`));
const be = (t, k) => blk(t).benefs.find(x => x.nombre === NOM(k));
ok('5b) transferencia: "✓ Transferido · Rec. #901", UN chip aunque el recibo tenga 2 líneas, sin botón', JSON.stringify(be('A', 'P1')?.chips) === '["✓ Transferido · Rec. #901"]' && !be('A', 'P1').pagar, JSON.stringify(be('A', 'P1')));
ok('5c) efectivo: "✓ Efectivo · Rec. #902", sin botón', JSON.stringify(be('A', 'E1')?.chips) === '["✓ Efectivo · Rec. #902"]' && !be('A', 'E1').pagar);
ok('5d) saldado sin recibo: "✓ Pagado (regularizado)", sin botón', JSON.stringify(be('A', 'J1')?.chips) === '["✓ Pagado (regularizado)"]' && !be('A', 'J1').pagar);
ok('5e) caballo todo pagado: "Sin deuda pagable · todo pagado (1 transferencia, 1 efectivo, 1 regularizados)"', blk('A').info === 'Sin deuda pagable · todo pagado (1 transferencia, 1 efectivo, 1 regularizados)', blk('A').info);
ok('5e2) caballo pagado sólo por saldado sin recibo: "Sin deuda pagable · todo pagado (1 regularizados)"', blk('E').info === 'Sin deuda pagable · todo pagado (1 regularizados)', blk('E').info);
ok('5f) parte pagada y parte pendiente: chip "✓ Efectivo · Rec. #903" JUNTO al botón Pagar, total sólo lo pendiente',
   JSON.stringify(be('B', 'P2')?.chips) === '["✓ Efectivo · Rec. #903"]' && be('B', 'P2').pagar?.[1] === IDS.P2 && blk('B').pagable === 500 && /^1 línea\(s\) pagable\(s\)/.test(blk('B').info), JSON.stringify(blk('B')));
ok('5g) recibo anulado: no hay chip #904 ni beneficiario pagado; el caballo dice "Sin deuda pagable" a secas',
   !hS.some(b => b.benefs.some(x => x.chips.some(c => c.includes('#904')))) && blk('C').info === 'Sin deuda pagable' && blk('C').benefs.length === 0, JSON.stringify(blk('C')));
ok('5h) caballo que nunca tuvo líneas: "Sin deuda pagable" a secas', blk('D').info === 'Sin deuda pagable');
const hRet = parsear(api.cobHtmlVistaCarrera(bS, { A: 1 }));
ok('5i) todo pagado pero con retenida: "Sin deuda pagable · Pagado · resta lo retenido por antidoping", no "todo pagado"', hRet.find(b => b.titulo.endsWith('CAB A')).info.startsWith('Sin deuda pagable · Pagado · resta lo retenido por antidoping · 🔒 1 retenida'), hRet.find(b => b.titulo.endsWith('CAB A')).info);
ok('5j) lo pagado no entra en ningún total', bS.reduce((s, b) => s + b.total, 0) === 500);

// 6) regla de la carrera dueña, sintética: número más bajo, empate por turno, NL no cuenta
const car = [{ id: 'k3', numero_carrera_programa: 3, numero_turno: 6 }, { id: 'k1', numero_carrera_programa: 1, numero_turno: 1 }, { id: 'k2', numero_carrera_programa: null, numero_turno: 2 }];
const d = api.cobDuenosIncentivo(car, [
  { carrera_id: 'k3', jockey_titular_id: 'jx', largo: true }, { carrera_id: 'k1', jockey_titular_id: 'jx', largo: false },
  { carrera_id: 'k2', jockey_titular_id: 'jx', largo: true }, { carrera_id: 'k3', jockey_titular_id: 'jy', largo: true },
]);
ok('6) cobDuenosIncentivo: la carrera de número más bajo donde LARGÓ (NL no cuenta; sin nº de programa usa el turno)', d.get('jx')?.carrera_id === 'k2' && d.get('jx')?.nro === 2 && d.get('jy')?.carrera_id === 'k3', JSON.stringify([...d]));
const inc = { id: 'i1', beneficiario_tipo: 'profesional', beneficiario_id: 'jx', concepto_tipo: 'incentivo_jockey', concepto: 'Incentivo jockey', monto_neto: '60000', reunion_id: 'RX', inscripcion_id: null, carrera_id: null };
const en = cid => api.cobArmarVistaCarrera([inc], [insc('Z', { jockey_titular_id: 'jx' })], cid, d);
const b3 = en('k3'), b2 = en('k2');
ok('6b) en la dueña: importe; en la otra: nota sin importe y sin botón', b2[0].total === 60000 && b3[0].total === 0 && b3[0].roles[0].beneficiarios[0].notas[0] === 'Incentivo por reunión: figura en la carrera 2' && !b3[0].roles[0].beneficiarios[0].lineas.length,
   JSON.stringify(b3[0].roles));

// ═════════ 7) jockey que largó en dos carreras, SINTÉTICO, por la vista entera (armar + HTML + parser) ═════════
// Carreras 1 y 5; el incentivo es UNO por reunión. Impago: importe sólo en la 1 (la dueña), nota en la 5. Pagado: en ninguna
// con importe, chip del recibo en la 1 y la nota sigue en la 5 (decisión del 24/09: la nota sigue la regla esté pagado o no).
profesionales.jq = { id: 'jq', apellido: 'SINT', nombre: 'JQ' };
const NQ = 'SINT, JQ';
const carQ = [{ id: 'q5', numero_carrera_programa: 5, numero_turno: 7 }, { id: 'q1', numero_carrera_programa: 1, numero_turno: 1 }];
const dQ = api.cobDuenosIncentivo(carQ, [{ carrera_id: 'q1', jockey_titular_id: 'jq', largo: true }, { carrera_id: 'q5', jockey_titular_id: 'jq', largo: true }]);
const incQ = { id: 'iq', beneficiario_tipo: 'profesional', beneficiario_id: 'jq', concepto_tipo: 'incentivo_jockey', concepto: 'Incentivo jockey',
  monto_neto: '60000', reunion_id: 'RX', inscripcion_id: null, carrera_id: null, estado_linea: 'impago', recibo_id: null, liquidaciones: { club_id: CLUB_ID } };
const vistaQ = (cid, lineas) => parsear(api.cobHtmlVistaCarrera(api.cobArmarVistaCarrera(lineas, [insc(`Q${cid}`, { jockey_titular_id: 'jq' })], cid, dQ), {}));
const delJQ = v => v.flatMap(b => b.benefs.filter(x => x.nombre === NQ));
const imp1 = delJQ(vistaQ('q1', [incQ])), imp5 = delJQ(vistaQ('q5', [incQ]));
ok('2) sintético: jockey que largó en las carreras 1 y 5, incentivo impago → con importe ("se paga una sola vez") SÓLO en la 1',
   imp1.flatMap(x => x.lineas).filter(esIncentivo).length === 1 && imp5.flatMap(x => x.lineas).filter(esIncentivo).length === 0 && imp1[0]?.pagar?.[1] === 'jq',
   JSON.stringify({ c1: imp1, c5: imp5 }));
ok('2b) sintético: en la 5, nota "figura en la carrera 1" sin importe ni botón; en la 1, sin nota',
   JSON.stringify(imp5.flatMap(x => x.notas)) === JSON.stringify(['Incentivo por reunión: figura en la carrera 1']) && !imp5.some(x => x.pagar)
   && imp1.flatMap(x => x.notas).length === 0, JSON.stringify(imp5));
const pagQ = api.cobMarcarPagadas([{ ...incQ, id: 'iq2', estado_linea: 'pagado', recibo_id: 'r974', recibos: REC(974, 'transferencia') }]);
const pag1 = delJQ(vistaQ('q1', pagQ)), pag5 = delJQ(vistaQ('q5', pagQ));
ok('2p) sintético: el mismo incentivo PAGADO por transferencia → con importe en ninguna; chip "✓ Transferido · Rec. #974" en la 1, sin botón; la nota sigue en la 5',
   pag1.concat(pag5).flatMap(x => x.lineas).filter(esIncentivo).length === 0 && JSON.stringify(pag1.flatMap(x => x.chips)) === '["✓ Transferido · Rec. #974"]'
   && !pag1.some(x => x.pagar) && JSON.stringify(pag5.flatMap(x => x.notas)) === JSON.stringify(['Incentivo por reunión: figura en la carrera 1']),
   JSON.stringify({ c1: pag1, c5: pag5 }));

for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  → ' + r.n : ''}`);
const fail = results.filter(r => r.s === '❌').length;
console.log(`\n${results.length - fail}/${results.length} checks OK${mutArg ? ` (mutante ${mutArg})` : ''}`);
process.exit(fail ? 1 : 0);
