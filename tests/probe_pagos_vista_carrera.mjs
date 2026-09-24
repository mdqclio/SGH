#!/usr/bin/env node
/**
 * probe_pagos_vista_carrera.mjs — tab Pagos, Parte C: vista por carrera (21/09/2026)
 *
 * Con una carrera elegida, cobrosBuscar rinde bloques por CABALLO (posición ASC) y dentro de
 * cada uno los roles PROPIETARIO → ENTRENADOR → JOCKEY, cada rol con su beneficiario, sus
 * líneas y el botón Pagar (cobrosDetalle, sin cambios). El incentivo de jockey (por reunión,
 * sin inscripcion_id ni carrera_id) aparece bajo el caballo que ese jockey montó y largó en la
 * carrera: con importe y rotulado "Incentivo por reunión — se paga una sola vez" en la carrera
 * DUEÑA (número más bajo donde largó), como nota sin importe en las otras (24/09 — ver
 * probe_pagos_vista_incentivo_pagados.mjs, que prueba esa regla y los chips de pagado).
 * Plan: docs/diagnosticos/2026-09-21_plan-pagos-vista-por-carrera.md (reports).
 *
 * Código REAL extraído de liquidaciones.html por anclas + cobrosBuscar real contra R9 con la
 * secret key. SOLO LECTURA. Los casos se arman de lo que hoy es pagable en R9 (el universo
 * cambia con cada cobro), sobre la Carrera 5 (turno 7) y la Carrera 4 (turno 5).
 *
 * MUTANTES (`--mutante=<nombre>` / `--mutantes`):
 *   C1 j_sin_largo     J incluye jockeys que NO largaron (no_largo)         → incentivo bajo un NL
 *   C2 solo_inscripcion selección sólo por inscripcion_id                    → los incentivos de jockey desaparecen
 *   C3 roles_alfabetico ORDEN_ROLES_VISTA alfabético                         → Entrenador antes que Propietario
 *   C4 orden_gatera     bloques por numero_partidor                          → el 1° deja de ir primero
 *   C5 sin_rotulo       sin "Incentivo por reunión — se paga una sola vez"   → el incentivo no se distingue
 *   C6 ocultar_vacios   se ocultan los caballos sin deuda                    → los NL desaparecen
 *   C7 q_ignorado       q no filtra bloques                                  → "yooky" trae todo
 *
 * Uso:
 *   set -a; . ./.env; set +a
 *   node tests/probe_pagos_vista_carrera.mjs
 *   node tests/probe_pagos_vista_carrera.mjs --mutantes
 *   LIQUIDACIONES_HTML=https://sigh.com.ar/liquidaciones.html node tests/probe_pagos_vista_carrera.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const R9 = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

const MUTANTES = {
  // "largó" se chequea dos veces (J y el armado); un mutante sólo tiene sentido si rompe las dos.
  j_sin_largo:      [["inscs.filter(i => i.largo && i.jockey_titular_id)", "inscs.filter(i => i.jockey_titular_id)"],
                     ["for (const i of inscs) if (i.largo && i.jockey_titular_id === l.beneficiario_id)", "for (const i of inscs) if (i.jockey_titular_id === l.beneficiario_id)"]],
  solo_inscripcion: ["|| (!l.inscripcion_id && l.carrera_id === carreraId)\n    || (l.concepto_tipo === 'incentivo_jockey' && l.reunion_id === reunionId && J.has(l.beneficiario_id))", ""],
  roles_alfabetico: ["const ORDEN_ROLES_VISTA = ['Propietario', 'Entrenador', 'Jockey', 'Otros'];", "const ORDEN_ROLES_VISTA = ['Entrenador', 'Jockey', 'Otros', 'Propietario'];"],
  orden_gatera:     ["(a.insc.posicion ?? 999) - (b.insc.posicion ?? 999) || (a.insc.numero_partidor ?? 999) - (b.insc.numero_partidor ?? 999)", "(a.insc.numero_partidor ?? 999) - (b.insc.numero_partidor ?? 999)"],
  sin_rotulo:       ["<span class=\"cob-por-reunion\">· Incentivo por reunión — se paga una sola vez</span>", ""],
  ocultar_vacios:   [".filter(b => cobBloqueMatch(b, q, propIdsPorCaballeriza));", ".filter(b => cobBloqueMatch(b, q, propIdsPorCaballeriza)).filter(b => b.n);"],
  q_ignorado:       ["function cobBloqueMatch(bloque, q, propIdsPorCaballeriza){\n  if (!q) return true;", "function cobBloqueMatch(bloque, q, propIdsPorCaballeriza){\n  if (!q || q) return true;"],
};
const args = process.argv.slice(2);
const mutArg = args.find(a => a.startsWith('--mutante='))?.split('=')[1];
if (args.includes('--mutantes')) {
  let vivos = 0;
  for (const m of Object.keys(MUTANTES)) {
    const r = spawnSync(process.execPath, [SELF, `--mutante=${m}`], { encoding: 'utf8', env: process.env });
    const murio = r.status !== 0; if (!murio) vivos++;
    const fallos = (r.stdout.match(/^❌ .*$/gm) || []);
    console.log(`${murio ? '💀' : '🧟'} mutante ${m.padEnd(17)} → ${murio ? `muerto (${fallos.length} assert(s))` : 'VIVO — el probe no lo detecta'}`);
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
  for (const [de, a] of (Array.isArray(m[0]) ? m : [m])) {
    if (!SRC.includes(de)) { console.error(`el mutante ${mutArg} no aplica: no está ${JSON.stringify(de).slice(0, 80)}`); process.exit(2); }
    SRC = SRC.replace(de, a);
  }
  console.log(`⚠ MUTANTE ${mutArg} aplicado`);
}

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
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

// ── arnés: cobrosBuscar real + la vista, con DOM stub ─────────────────────────
const [{ data: profs }, { data: props }] = await Promise.all([
  sb.from('profesionales').select('id,nombre,apellido,tipo,documento_nro').eq('club_id', CLUB_ID),
  sb.from('propietarios').select('id,nombre,nombre_stud,documento_nro').eq('activo', true),
]);
const profesionales = {}, propietariosMap = {};
profs.forEach(p => { profesionales[p.id] = p; }); props.forEach(p => { propietariosMap[p.id] = p; });
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unescape = s => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
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
  extractFn(SRC, 'function rolDeLinea(l)'), extractFn(SRC, 'function nombreBenef(tipo, id)'),
  srcMatch, extractFn(SRC, 'function benefSearch(tipo, id)'),
  extractFn(SRC, 'function etiquetaRoles(g)'), extractFn(SRC, 'function etiquetaCarreras(g)'),
  extractFn(SRC, 'async function cobCargarReunPrueba()'), extractFn(SRC, 'function cobVisible(l, rid)'),
  extractFn(SRC, 'function cobDelClub(l)'), srcVista, extractFn(SRC, 'async function cobrosBuscar()'),
].join('\n\n');
async function buscar(q, carreraId, rid = R9) {
  const document = mkDocument({ 'cob-q': q, 'cob-reunion': rid, 'cob-carrera': carreraId });
  const api = await new AsyncFunction('sb', 'CLUB_ID', 'document', 'toast', 'fmt', 'escapeHtml', 'propietariosMap', 'profesionales',
    `let cobCaballerizas = [], cobInscCarrera = {}, cobNroCarrera = {}, cobMapsScope = null, cobReunPrueba = null;
     ${src}
     return { cobrosBuscar };`)(sb, CLUB_ID, document, () => {}, n => '$' + Number(n).toFixed(2), escapeHtml, propietariosMap, profesionales);
  await api.cobrosBuscar();
  return document._n['cob-beneficiarios'].innerHTML;
}
// parser del HTML de la vista → bloques { titulo, vacio, roles:[{rol, benefs:[{nombre, lineas:[{texto, monto}]}]}] }
function parsear(html) {
  const partes = html.split('<div class="liq-card cob-caballo').slice(1);
  return partes.map(p => {
    const titulo = unescape(/class="liq-prof">([^<]*)</.exec(p)?.[1] || '');
    const vacio = p.startsWith(' cob-caballo-vacio');
    const info = unescape(/class="liq-recibo">([^<]*)</.exec(p)?.[1] || '');
    const roles = p.split('<div class="cob-rol">').slice(1).map(r => ({
      rol: unescape(/cob-rol-titulo">([^<]*)</.exec(r)?.[1] || ''),
      benefs: r.split('<div class="cob-benef">').slice(1).map(b => ({
        nombre: unescape(/cob-benef-nombre">([^<]*)</.exec(b)?.[1] || ''),
        pagar: /cobrosDetalle\('([^']*)','([^']*)'\)/.exec(b)?.slice(1, 3) || null,
        lineas: [...b.matchAll(/<li><span>([\s\S]*?)<\/span><span>([^<]*)<\/span><\/li>/g)].map(m => ({ texto: unescape(m[1].replace(/<[^>]+>/g, '')), monto: m[2] })),
        notas: [...b.matchAll(/<li class="cob-nota"><span>([^<]*)<\/span><\/li>/g)].map(m => unescape(m[1])),
      })),
    }));
    return { titulo, vacio, info, roles };
  });
}

// ── datos esperados desde la base (misma fuente que el motor) ──────────────────
const { data: carrs } = await sb.from('carreras').select('id,numero_turno,numero_carrera_programa,estado').eq('reunion_id', R9);
const carrera = n => carrs.find(c => c.numero_carrera_programa === n);
const C5 = carrera(5), C4 = carrera(4), C7 = carrera(7);
if (!C5 || !C4 || !C7) throw new Error('R9 no tiene las carreras 4/5/7 esperadas');
async function esperado(c) {
  const { data: inscs } = await sb.from('inscripciones')
    .select('id,numero_partidor,propietario_id,entrenador_id,jockey_titular_id,spcs(nombre),resultado_posiciones(posicion,no_largo)')
    .eq('carrera_id', c.id).eq('estado', 'ratificado');
  const rows = inscs.map(i => { const rp = i.resultado_posiciones?.[0]; return { ...i, caballo: i.spcs?.nombre, posicion: rp?.posicion ?? null, largo: !!rp && rp.no_largo === false }; });
  const { data: lineas } = await sb.from('liquidacion_detalle')
    .select('id,beneficiario_tipo,beneficiario_id,concepto_tipo,inscripcion_id,carrera_id,monto_neto,liquidaciones(club_id)')
    .eq('reunion_id', R9).eq('estado_linea', 'impago').is('recibo_id', null).neq('beneficiario_tipo', 'club');
  const mias = lineas.filter(l => l.liquidaciones?.club_id === CLUB_ID);
  const ids = new Set(rows.map(r => r.id));
  const J = new Set(rows.filter(r => r.largo && r.jockey_titular_id).map(r => r.jockey_titular_id));
  const porInsc = mias.filter(l => ids.has(l.inscripcion_id) || (!l.inscripcion_id && l.carrera_id === c.id));
  const incJ = mias.filter(l => l.concepto_tipo === 'incentivo_jockey' && J.has(l.beneficiario_id));
  return { rows, porInsc, incJ, J };
}
// carrera dueña del incentivo de cada jockey (número más bajo donde largó), desde la base
const { data: inscsR9 } = await sb.from('inscripciones').select('carrera_id,jockey_titular_id,resultado_posiciones(no_largo)')
  .in('carrera_id', carrs.filter(c => c.estado == null || c.estado !== 'anulada').map(c => c.id)).eq('estado', 'ratificado');
const duenoNro = {};
for (const i of inscsR9) {
  const rp = i.resultado_posiciones?.[0];
  if (!rp || rp.no_largo !== false || !i.jockey_titular_id) continue;
  const c = carrs.find(x => x.id === i.carrera_id), n = c.numero_carrera_programa ?? c.numero_turno;
  duenoNro[i.jockey_titular_id] = Math.min(duenoNro[i.jockey_titular_id] ?? Infinity, n);
}
const nombreProf = id => profesionales[id] ? `${profesionales[id].apellido}, ${profesionales[id].nombre}` : id;

// ═════════ 1) Carrera 5 ═════════
const e5 = await esperado(C5);
const html5 = await buscar('', C5.id);
const b5 = parsear(html5);
ok('1) con carrera elegida se rinde la vista por caballo (no tarjetas liq-prof de persona)', html5.includes('cob-vista') && !/class="liq-prof">[^·<]*<\/div><div class="liq-recibo">[^<]*línea\(s\) pagable\(s\) · /.test(html5));
ok(`1b) C5: un bloque por inscripción ratificada (${e5.rows.length})`, b5.length === e5.rows.length, `${b5.length} bloques`);
const ordenEsperado = [...e5.rows].sort((a, b) => (a.posicion ?? 999) - (b.posicion ?? 999) || (a.numero_partidor ?? 999) - (b.numero_partidor ?? 999)).map(r => r.caballo);
ok('1c) C5: bloques por posición ASC, los que no largaron al final', b5.map(b => b.titulo.split(' · ')[1]).join(' | ') === ordenEsperado.join(' | '), b5.map(b => b.titulo).join(' | '));
ok('1d) C5: el título de cada bloque lleva el puesto (N°) o NL', b5.every(b => /^(\d+°|NL|—) · /.test(b.titulo)));

// 2) orden de roles dentro de cada bloque
const ORDEN = ['Propietario', 'Entrenador', 'Jockey', 'Otros'];
ok('2) C5: en todos los bloques los roles van Propietario → Entrenador → Jockey', b5.every(b => {
  const idx = b.roles.map(r => ORDEN.indexOf(r.rol));
  return idx.every(i => i >= 0) && idx.every((v, i) => i === 0 || v > idx[i - 1]);
}), b5.map(b => b.roles.map(r => r.rol[0]).join('')).join(' '));
const conTres = b5.find(b => b.roles.length === 3);
ok('2b) C5: hay al menos un bloque con los tres roles', !!conTres, conTres ? `${conTres.titulo}: ${conTres.roles.map(r => r.rol + '=' + r.benefs.map(x => x.nombre).join('+')).join(' → ')}` : '');
ok('2c) C5: cada rol de ese bloque lleva el beneficiario correcto según la inscripción', !!conTres && (() => {
  const row = e5.rows.find(r => r.caballo === conTres.titulo.split(' · ')[1]);
  const byRol = Object.fromEntries(conTres.roles.map(r => [r.rol, r.benefs.map(b => b.pagar?.[1])]));
  return (!byRol.Propietario || byRol.Propietario.includes(row.propietario_id))
      && (!byRol.Entrenador || byRol.Entrenador.includes(row.entrenador_id))
      && (!byRol.Jockey || byRol.Jockey.includes(row.jockey_titular_id));
})());

// 3) incentivos de jockey bajo el caballo que montó y largó, y en ningún otro
const incLineas = b5.flatMap(b => b.roles.flatMap(r => r.benefs.flatMap(be => [
  ...be.lineas.filter(l => /incentivo jockey/i.test(l.texto)).map(l => ({ bloque: b.titulo.split(' · ')[1], rol: r.rol, benef: be.nombre, benefId: be.pagar?.[1] || Object.keys(profesionales).find(k => nombreProf(k) === be.nombre), texto: l.texto, nota: false })),
  ...be.notas.map(n => ({ bloque: b.titulo.split(' · ')[1], rol: r.rol, benef: be.nombre, benefId: be.pagar?.[1] || Object.keys(profesionales).find(k => nombreProf(k) === be.nombre), texto: n, nota: true })),
])));
ok(`3) C5: los ${e5.incJ.length} incentivo(s) de jockey pagable(s) de quienes largaron acá aparecen (sin inscripcion_id ni carrera_id) — con importe si C5 es su carrera dueña, como nota si no`,
   e5.incJ.length > 0 && e5.incJ.every(l => incLineas.some(x => x.benefId === l.beneficiario_id && x.nota === (duenoNro[l.beneficiario_id] !== 5))),
   e5.incJ.map(l => nombreProf(l.beneficiario_id)).join(', ') + ' → ' + incLineas.map(x => `${x.benef}@${x.bloque}`).join(', '));
ok('3b) C5: cada incentivo está bajo el rol Jockey del caballo que ese jockey montó', incLineas.every(x => x.rol === 'Jockey' && e5.rows.some(r => r.caballo === x.bloque && r.jockey_titular_id === x.benefId && r.largo)));
ok('3c) C5: ningún incentivo bajo un jockey que no largó acá', incLineas.every(x => e5.J.has(x.benefId)));
ok('3d) C5: el incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"; la nota, "figura en la carrera N" (N = dueña)', incLineas.length > 0 && incLineas.every(x => x.nota ? x.texto === `Incentivo por reunión: figura en la carrera ${duenoNro[x.benefId]}` : /Incentivo por reunión — se paga una sola vez/.test(x.texto)), incLineas.map(x => x.texto).join(' | '));

// 3e) la nota de C5 apunta a una carrera donde el incentivo SÍ está, con importe y rótulo
const conNota = incLineas.find(x => x.nota);
if (conNota) {
  const cd = carrera(duenoNro[conNota.benefId]);
  const bd = parsear(await buscar('', cd.id));
  const alla = bd.flatMap(b => b.roles.flatMap(r => r.benefs.filter(be => be.nombre === conNota.benef).flatMap(be => be.lineas.filter(l => /incentivo jockey/i.test(l.texto)))));
  ok(`3e) ${conNota.benef}: en la carrera ${duenoNro[conNota.benefId]} (dueña) el incentivo está con importe y "se paga una sola vez"`, alla.length === 1 && /Incentivo por reunión — se paga una sola vez/.test(alla[0].texto), alla.map(l => l.texto + ' ' + l.monto).join(' | '));
}

// 4) misma persona en dos roles → dos sub-bloques, dos Pagar distintos (propietario / profesional)
const dobles = b5.flatMap(b => { const ids = b.roles.flatMap(r => r.benefs.map(be => be.pagar)); const nombres = b.roles.flatMap(r => r.benefs.map(be => be.nombre)); const rep = nombres.filter((n, i) => nombres.indexOf(n) !== i); return rep.map(n => ({ bloque: b.titulo, nombre: n, tipos: ids.filter((p, i) => nombres[i] === n).map(p => p?.[0]) })); });
ok('4) C5: una misma persona en dos roles tiene dos botones Pagar (propietario y profesional)', dobles.length === 0 || dobles.every(d => new Set(d.tipos).size === d.tipos.length), dobles.map(d => `${d.nombre}@${d.bloque}: ${d.tipos.join('/')}`).join('; ') || 'sin caso hoy');

// 5) caballos sin deuda visibles, apagados
const vacios = b5.filter(b => b.vacio);
ok('5) C5: los caballos sin deuda pagable se muestran (apagados, "sin deuda pagable") en vez de desaparecer', b5.length === e5.rows.length && vacios.every(b => /sin deuda pagable/i.test(b.info)), `${vacios.length} vacíos`);

// 6) q filtra bloques por caballo o por beneficiario
const conLineas = b5.find(b => !b.vacio);
if (conLineas) {
  const nombreCab = conLineas.titulo.split(' · ')[1];
  const h = parsear(await buscar(nombreCab.toLowerCase(), C5.id));
  ok(`6) C5 q=${JSON.stringify(nombreCab.toLowerCase())} → sólo ese bloque`, h.length === 1 && h[0].titulo === conLineas.titulo, h.map(b => b.titulo).join(' | '));
  const benef = conLineas.roles[0].benefs[0];
  const apellido = benef.nombre.split(',')[0];
  const h2 = parsear(await buscar(apellido, C5.id));
  ok(`6b) C5 q=${JSON.stringify(apellido)} → sólo los bloques donde está ese beneficiario`, h2.length >= 1 && h2.every(b => b.roles.some(r => r.benefs.some(be => be.nombre.startsWith(apellido)))) && h2.some(b => b.titulo === conLineas.titulo), h2.map(b => b.titulo).join(' | '));
  const h3 = parsear(await buscar('zzzz-no-existe', C5.id));
  ok('6c) C5 q sin match → 0 bloques', h3.length === 0);
}

// 7) carrera sin resultado: bloques "—", 0 líneas, 0 incentivos
const e7 = await esperado(C7);
const b7 = parsear(await buscar('', C7.id));
ok(`7) C7 (sin resultado): ${e7.rows.length} bloques con "—", todos sin deuda, 0 incentivos (J vacío)`, b7.length === e7.rows.length && b7.every(b => b.vacio && b.titulo.startsWith('— · ')) && e7.J.size === 0, `${b7.length} bloques, J=${e7.J.size}`);

// 8) "Toda carrera" sigue en modo tarjetas
const htmlTodas = await buscar('', '');
const tarjetas = (htmlTodas.match(/class="liq-prof">/g) || []).length;
ok('8) sin carrera: modo tarjetas por persona intacto (≥ 10 tarjetas, sin cob-vista)', tarjetas >= 10 && !htmlTodas.includes('cob-vista'), `${tarjetas} tarjetas`);

// 9) completitud: ninguna línea pagable de la carrera queda fuera
const lineasVista5 = b5.reduce((s, b) => s + b.roles.reduce((t, r) => t + r.benefs.reduce((u, be) => u + be.lineas.length, 0), 0), 0);
const incDuena5 = e5.incJ.filter(l => duenoNro[l.beneficiario_id] === 5);
const dupIncent = incDuena5.length;
ok(`9) C5: líneas en la vista = líneas por inscripción (${e5.porInsc.length}) + incentivos cuya carrera dueña es la 5 (${dupIncent})`, lineasVista5 === e5.porInsc.length + dupIncent, `${lineasVista5}`);
const totalVista5 = b5.reduce((s, b) => s + b.roles.reduce((t, r) => t + r.benefs.reduce((u, be) => u + be.lineas.reduce((v, l) => v + parseFloat(l.monto.replace('$', '')), 0), 0), 0), 0);
const totalEsp5 = e5.porInsc.reduce((s, l) => s + parseFloat(l.monto_neto), 0) + incDuena5.reduce((s, l) => s + parseFloat(l.monto_neto), 0);
ok('9b) C5: la suma de montos de la vista coincide', Math.abs(totalVista5 - totalEsp5) < 0.01, `${totalVista5.toFixed(2)} vs ${totalEsp5.toFixed(2)}`);

// 10) Carrera 4: un jockey con incentivo pagable que acá NO largó (no_largo) no aparece bajo su caballo NL
const e4 = await esperado(C4);
const b4 = parsear(await buscar('', C4.id));
const { data: incTodos } = await sb.from('liquidacion_detalle').select('beneficiario_id').eq('reunion_id', R9).eq('concepto_tipo', 'incentivo_jockey').eq('estado_linea', 'impago').is('recibo_id', null);
const incIds = new Set((incTodos || []).map(l => l.beneficiario_id));
const casosNL = e4.rows.filter(r => !r.largo && r.jockey_titular_id && incIds.has(r.jockey_titular_id));
const nlBloques = b4.filter(b => casosNL.some(r => r.caballo === b.titulo.split(' · ')[1]));
ok(`10) C4: ${casosNL.length} caballo(s) NL cuyo jockey tiene incentivo pagable → el incentivo NO aparece bajo el NL`,
   casosNL.length === 0 || nlBloques.every(b => !b.roles.some(r => r.benefs.some(be => be.lineas.some(l => /incentivo jockey/i.test(l.texto))))),
   casosNL.map(r => `${r.caballo} (${nombreProf(r.jockey_titular_id)})`).join(', ') || 'sin caso hoy');
ok('10b) C4: los bloques van por posición ASC', b4.map(b => b.titulo.split(' · ')[1]).join('|') === [...e4.rows].sort((a, b) => (a.posicion ?? 999) - (b.posicion ?? 999) || (a.numero_partidor ?? 999) - (b.numero_partidor ?? 999)).map(r => r.caballo).join('|'), b4.map(b => b.titulo).join(' | '));

// 11) texto: la selección no usa Set.has sobre inscripcion_id a secas para los incentivos
const srcSel = extractFn(SRC, 'function cobLineasDeCarrera(lineas, carreraId, reunionId, inscs)');
ok('11) cobLineasDeCarrera tiene las tres puertas (inscripción / carrera_id / incentivo por J)', srcSel.includes("inscIds.has(l.inscripcion_id)") && srcSel.includes("l.carrera_id === carreraId") && srcSel.includes("J.has(l.beneficiario_id)"));
ok('11b) cobrosBuscar ya no acota por inscFiltro (el filtro viejo que descartaba los incentivos)', !extractFn(SRC, 'async function cobrosBuscar()').includes('(!inscFiltro ||'));

for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  → ' + r.n : ''}`);
const fail = results.filter(r => r.s === '❌').length;
console.log(`\n${results.length - fail}/${results.length} checks OK${mutArg ? ` (mutante ${mutArg})` : ''}`);
process.exit(fail ? 1 : 0);
