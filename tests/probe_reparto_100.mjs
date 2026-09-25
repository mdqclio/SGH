/**
 * probe_reparto_100.mjs — reparto al 100 % con peón/capataz/sereno SIEMPRE (entrenador 18 %)
 * y protección de reuniones con la liquidación CERRADA (ISSUE-091/092; decisiones del 25/09).
 *
 * Código real, sin browser: el motor `liquidaciones-engine.js` se evalúa tal cual; de
 * `liquidaciones.html` y `resultados.html` se extraen las funciones por su firma. Nada se
 * reimplementa: lo único "propio" es el ORÁCULO del premio (bolsa × % de la distribución, + bono
 * ganador, piso ganancia_minima), que es la regla del reglamento y sirve de vara independiente.
 *
 * Partes:
 *   S  sintético — base EN MEMORIA (tests/lib/motor_dryrun.mjs → sbMemoria). Sin red.
 *   U  pantallas — helpers de liquidaciones.html + gate de resultados.html.
 *   P  contra prod, SOLO LECTURA — el motor en seco sobre R9/R6/R8 (toda escritura se captura y
 *      NO se envía) + md5 de las líneas antes y después. Necesita SUPABASE_SECRET_KEY.
 *   D  base (sandbox tests/local/, NUNCA prod) — los triggers de la migración. Necesita el sandbox
 *      levantado con migrations/reunion_liquidacion_cerrada.sql aplicada, PSQL_CMD y LOCAL_JWT_SECRET.
 *
 * Uso:
 *   set -a; . ./.env; set +a
 *   node tests/probe_reparto_100.mjs                 # S + U + P (+ D si hay sandbox)
 *   node tests/probe_reparto_100.mjs --mutantes      # los 5 mutantes: M1–M4 en el motor, M5 en la base
 *   Sandbox: tests/local/up.sh && tests/local/up.sh sql < migrations/reunion_liquidacion_cerrada.sql
 *     PSQL_CMD="tests/local/up.sh sql" LOCAL_JWT_SECRET=$(cat tests/local/out/jwt_secret) node tests/probe_reparto_100.mjs --mutantes
 *
 * Env: ENGINE_JS · LIQUIDACIONES_HTML · RESULTADOS_HTML (rutas; default los del repo) ·
 *      SUPABASE_URL (prod por default) · SANDBOX_URL (default http://127.0.0.1:54321) · PSQL_CMD ·
 *      LOCAL_JWT_SECRET · SOLO=S,U,P,D (partes a correr).
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { cargarMotor, sbMemoria, sbDryRun, montoPg, md5Filas } from './lib/motor_dryrun.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const ENGINE_JS = process.env.ENGINE_JS || ROOT + 'liquidaciones-engine.js';
const LIQ_HTML = process.env.LIQUIDACIONES_HTML || ROOT + 'liquidaciones.html';
const RES_HTML = process.env.RESULTADOS_HTML || ROOT + 'resultados.html';
const PROD_URL = process.env.SUPABASE_URL || 'https://unlhcuanfrtpatoipwve.supabase.co';
const SANDBOX_URL = process.env.SANDBOX_URL || 'http://127.0.0.1:54321';
const SOLO = (process.env.SOLO || 'S,U,P,D').split(',');
const MUTANTES = process.argv.includes('--mutantes');
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const R6 = 'b02ca761-6f44-4720-86aa-a3c3099019ea', R8 = '7b6e003e-22e2-4629-bf55-f18560b1260f', R9 = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9';
const R9999 = 'a0000000-0000-0000-0000-000000009999';
const ENGINE_SRC = readFileSync(ENGINE_JS, 'utf8');
const c2 = x => Math.round(Number(x) * 100);                 // centavos enteros (comparaciones exactas)

// ── Oráculo del premio (reglamento: bolsa × %; bono al ganador; piso) ─────────────────────────
function premioOraculo(bolsa, dist, pos) {
  const pct = dist[String(pos)]; if (!pct) return 0;
  let p = Number(bolsa) * pct / 100;
  if (pos === 1 && dist.bono_ganador) p += Number(dist.bono_ganador);
  const min = Number(dist.ganancia_minima) || 0;
  return min > 0 && p < min ? min : p;
}
const DIST_R9 = { 1: 60, 2: 19, 3: 12, 4: 6, 5: 3, bono_ganador: 250000, ganancia_minima: 100000, bono_posicion_desde: 6, bono_posicion_hasta: 8, bono_posicion_monto: 100000 };
const CFG = { pct_propietario: '70.000', pct_entrenador: '10.000', pct_jockey: '10.000', pct_peon: '4.000', pct_capataz: '3.000',
  pct_sereno: '1.000', pct_fondo_solidario: '2.000', incentivo_jockey_monto: '60000.00', incentivo_entrenador_monto: '10000.00', dias_antidoping: 30 };
const PCT = { propietario: .70, entrenador: .10, jockey: .10, peon: .04, capataz: .03, sereno: .01, fondo: .02 };

function extractFn(src, firma) {
  const i = src.indexOf(firma); if (i < 0) throw new Error('no encontré: ' + firma);
  let d = 0; for (let k = src.indexOf('{', i + firma.length); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  throw new Error('no pude cerrar: ' + firma);
}
const entre = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); return i >= 0 && j > i ? src.slice(i, j + b.length) : null; };

// ── Mutantes ───────────────────────────────────────────────────────────────────────────────
const MUT = {
  M1: { desc: 'las subs vuelven a nacer sólo con nombre (.filter)', motor: true,
    de: `.filter(s => s.pct > 0).map(s => ({ ...s, nombre: (s.nombre || '').trim() || null }));`,
    a: `.filter(s => s.nombre && s.nombre.trim());` },
  M2: { desc: 'sin regla de residuo (sereno y fondo redondeados por separado)', motor: true,
    de: [`m.sereno = r2(e18 - m.entrenador - m.peon - m.capataz);`, `if (fondoPct > 0) m.fondo = r2(P - m.propietario - m.jockey - e18);`],
    a: [`m.sereno = r2(premio * PCTS.sereno);`, `if (fondoPct > 0) m.fondo = r2(premio * fondoPct / 100);`] },
  M3: { desc: 'el concepto de la sub vuelve a llevar el nombre (clave inestable)', motor: true,
    de: 'concepto: sub.rol,', a: 'concepto: `${sub.rol} — ${sub.nombre}`,' },
  M4: { desc: 'el motor no corta en reunión cerrada', motor: true,
    de: `if (reunionRow?.liquidacion_cerrada_at) {`, a: `if (false && reunionRow?.liquidacion_cerrada_at) {` },
  M5: { desc: 'la base sin el trigger de reunión cerrada en liquidacion_detalle', motor: false },
};
function mutarMotor(id) {
  const m = MUT[id]; let s = ENGINE_SRC;
  const des = [].concat(m.de), as = [].concat(m.a);
  des.forEach((d, i) => { if (!s.includes(d)) throw new Error(`${id}: ancla no encontrada: ${d}`); s = s.replace(d, as[i]); });
  return s;
}

// ═══ S — sintético (base en memoria) ═══════════════════════════════════════════════════════════
function escenario({ bolsa, poses, cerrada = false }) {
  const RID = randomUUID(), CAR = randomUUID(), RES = randomUUID();
  const insc = poses.map((p, i) => ({ id: p.id || randomUUID(), carrera_id: CAR, estado: 'ratificado',
    propietario_id: `prop-${i}`, entrenador_id: p.sinEntrenador ? null : `entr-${i}`, jockey_titular_id: `jock-${i}`,
    peon: p.peon ?? null, capataz: p.capataz ?? null, sereno: p.sereno ?? null }));
  return {
    RID, insc,
    tablas: {
      reuniones: [{ id: RID, club_id: CLUB, fecha: '2026-09-20', liquidacion_cerrada_at: cerrada ? '2026-09-25T12:00:00Z' : null }],
      carreras: [{ id: CAR, reunion_id: RID, numero_turno: 1, numero_carrera_programa: 1, bolsa_total: String(bolsa), distribucion_premios: DIST_R9 }],
      resultados: [{ id: RES, carrera_id: CAR, estado: 'oficial' }],
      inscripciones: insc,
      resultado_posiciones: poses.map((p, i) => ({ resultado_id: RES, inscripcion_id: insc[i].id, posicion: p.pos, empate: !!p.empate, descalificado: false, no_largo: false })),
    },
  };
}
const correr = (motor, esc, extra = {}) => { const mem = extra.mem || sbMemoria(esc.tablas);
  return motor.generarLiquidacionesReunion({ sb: mem.sb, clubId: CLUB, reunionId: esc.RID, liqConfig: CFG, comCfg: [] }).then(r => ({ r, mem })); };
const lineasDe = (mem, inscId) => mem.tablas.liquidacion_detalle.filter(d => d.inscripcion_id === inscId);
const rolDe = d => d.concepto_tipo === 'fondo_solidario' ? 'fondo' : d.concepto_tipo === 'actuacion' ? d.concepto
  : d.concepto_tipo === 'premio' ? ((/— (Propietario|Entrenador|Jockey) \(/.exec(d.descripcion) || [])[1] || '?') : d.concepto_tipo;

async function suiteS(motor, ok) {
  // S1/S2: cada caballo premiado reparte el 100 % exacto y el entrenador + personal = 18 % exacto.
  for (const [id, bolsa] of [['S1', 1000000], ['S2', 1083333.33]]) {
    const esc = escenario({ bolsa, poses: [1, 2, 3, 4, 5].map(pos => ({ pos })) });
    const { r, mem } = await correr(motor, esc);
    let malos100 = [], malos18 = [], malosSubs = [], malosLinea = [], malosRet = [];
    esc.insc.forEach((ins, i) => {
      const pos = i + 1, P0 = premioOraculo(bolsa, DIST_R9, pos), P = montoPg(P0);
      const ls = lineasDe(mem, ins.id).filter(d => ['premio', 'fondo_solidario', 'actuacion'].includes(d.concepto_tipo));
      const by = {}; ls.forEach(d => { by[rolDe(d)] = (by[rolDe(d)] || 0) + c2(d.monto_bruto); });
      const suma = ls.reduce((a, d) => a + c2(d.monto_bruto), 0);
      if (suma !== c2(P)) malos100.push({ pos, P, suma: suma / 100 });
      const e18 = (by.Entrenador || 0) + (by['Peón'] || 0) + (by.Capataz || 0) + (by.Sereno || 0);
      if (e18 !== c2(montoPg(P0 * .18))) malos18.push({ pos, e18: e18 / 100, esperado: montoPg(P0 * .18) });
      const subs = ls.filter(d => d.concepto_tipo === 'actuacion');
      if (subs.map(d => d.concepto).sort().join() !== 'Capataz,Peón,Sereno' || !subs.every(d => d.descripcion.includes('(sin nombre cargado)'))) malosSubs.push(pos);
      const esperado = { Propietario: PCT.propietario, Entrenador: PCT.entrenador, Jockey: PCT.jockey, 'Peón': PCT.peon, Capataz: PCT.capataz, Sereno: PCT.sereno, fondo: PCT.fondo };
      for (const [k, v] of Object.entries(by)) if (Math.abs(v - c2(P0 * esperado[k])) > 1) malosLinea.push({ pos, k, v: v / 100, pct: P0 * esperado[k] });
      const entr = ls.find(d => rolDe(d) === 'Entrenador');
      const retOk = subs.every(d => d.estado_linea === entr.estado_linea && d.fecha_liberacion === entr.fecha_liberacion)
        && (pos <= 2 ? entr.estado_linea === 'retenido' : entr.estado_linea === 'impago');
      if (!retOk) malosRet.push(pos);
    });
    ok(`${id}a) bolsa ${bolsa}: los 5 premiados reparten el 100 % exacto (centavo a centavo)`, !r.error && !malos100.length, JSON.stringify(malos100));
    ok(`${id}b) entrenador + peón + capataz + sereno = r2(18 % del premio) exacto`, !malos18.length, JSON.stringify(malos18));
    ok(`${id}c) las 3 sub-líneas nacen siempre, concepto = rol, "(sin nombre cargado)"`, !malosSubs.length, JSON.stringify(malosSubs));
    ok(`${id}d) cada línea queda a ≤ 1 centavo de su % teórico`, !malosLinea.length, JSON.stringify(malosLinea));
    ok(`${id}e) las subs heredan retención y fecha de liberación del 10 % del entrenador (1°/2° retenido)`, !malosRet.length, JSON.stringify(malosRet));
  }
  // S3: empate 2°-3° (dead-heat): premio promediado, también exacto.
  {
    const bolsa = 1083333.33, esc = escenario({ bolsa, poses: [{ pos: 1 }, { pos: 2, empate: true }, { pos: 3, empate: true }] });
    const { mem } = await correr(motor, esc);
    const P0 = (premioOraculo(bolsa, DIST_R9, 2) + premioOraculo(bolsa, DIST_R9, 3)) / 2;
    const res = [1, 2].map(i => lineasDe(mem, esc.insc[i].id).filter(d => ['premio', 'fondo_solidario', 'actuacion'].includes(d.concepto_tipo)).reduce((a, d) => a + c2(d.monto_bruto), 0));
    ok('S3) empate 2°–3°: cada uno reparte el 100 % del premio promediado', res.every(s => s === c2(montoPg(P0))), `${res.map(s => s / 100)} vs ${montoPg(P0)}`);
  }
  // S4: nombre cargado → concepto sigue siendo el rol, el nombre va en la descripción.
  {
    const esc = escenario({ bolsa: 1000000, poses: [{ pos: 3, peon: 'JUAN PEREZ' }] });
    const { mem } = await correr(motor, esc);
    const peon = lineasDe(mem, esc.insc[0].id).find(d => d.concepto_tipo === 'actuacion' && /Peón/.test(d.concepto));
    ok('S4) con nombre: concepto "Peón", descripción "… — Peón: JUAN PEREZ — A redistribuir (4%)"',
      peon?.concepto === 'Peón' && /— Peón: JUAN PEREZ — A redistribuir \(4%\)/.test(peon?.descripcion || ''), JSON.stringify(peon && { concepto: peon.concepto, descripcion: peon.descripcion }));
  }
  // S5/S6: la sub-línea ya pagada NO se duplica al cargar o cambiar el nombre (ISSUE-092).
  for (const [id, antes, despues] of [['S5', 'JUAN PEREZ', 'OTRO NOMBRE'], ['S6', null, 'JUAN PEREZ']]) {
    const esc = escenario({ bolsa: 1000000, poses: [{ pos: 3, peon: antes }] });
    const { mem } = await correr(motor, esc);
    const pagada = lineasDe(mem, esc.insc[0].id).find(d => d.concepto_tipo === 'actuacion' && /Peón/.test(d.concepto));
    if (!ok(`${id}0) hay una sub-línea de peón para marcar como pagada`, !!pagada)) continue;
    Object.assign(pagada, { estado_linea: 'pagado', recibo_id: 'recibo-probe' });
    esc.tablas.inscripciones[0].peon = despues;
    await correr(motor, esc, { mem });
    const peones = lineasDe(mem, esc.insc[0].id).filter(d => d.concepto_tipo === 'actuacion' && /Peón/.test(d.concepto));
    ok(`${id}) peón ${antes ? 'renombrado' : 'cargado'} después de pagada: sigue habiendo UNA sub-línea de peón (la pagada), no dos`,
      peones.length === 1 && peones[0].estado_linea === 'pagado', JSON.stringify(peones.map(d => [d.concepto, d.estado_linea, d.monto_bruto])));
  }
  // S7: reunión cerrada → el motor no escribe NADA.
  {
    const esc = escenario({ bolsa: 1000000, poses: [1, 2, 3].map(pos => ({ pos })), cerrada: true });
    const mem = sbMemoria(esc.tablas);
    const { r } = await correr(motor, esc, { mem });
    ok('S7) reunión con liquidacion_cerrada_at: devuelve cerrada y 0 escrituras', r.cerrada === true && mem.escrituras.length === 0,
      JSON.stringify({ r, escrituras: mem.escrituras }));
  }
  // S8: idempotente — recalcular dos veces no duplica ni mueve montos.
  {
    const esc = escenario({ bolsa: 1083333.33, poses: [1, 2, 3, 4, 5].map(pos => ({ pos })) });
    const { mem } = await correr(motor, esc);
    const foto = () => mem.tablas.liquidacion_detalle.map(d => [d.inscripcion_id, d.concepto_tipo, d.concepto, d.monto_bruto, d.estado_linea].join('|')).sort().join('\n');
    const a = foto(); await correr(motor, esc, { mem }); const b = foto();
    ok('S8) recalcular dos veces da exactamente las mismas líneas', a === b, `${a.split('\n').length} vs ${b.split('\n').length}`);
  }
  // S9: sin entrenador el motor no genera ni su 10 % ni las subs (por eso el gate de oficializar).
  {
    const esc = escenario({ bolsa: 1000000, poses: [{ pos: 3, sinEntrenador: true }] });
    const { mem } = await correr(motor, esc);
    const ls = lineasDe(mem, esc.insc[0].id);
    ok('S9) caballo sin entrenador: ni 10 % ni subs (lo cubre el GATE ENTRENADORES de oficializar)',
      !ls.some(d => d.concepto_tipo === 'actuacion') && !ls.some(d => rolDe(d) === 'Entrenador'), JSON.stringify(ls.map(rolDe)));
  }
}

// ═══ U — pantallas ═══════════════════════════════════════════════════════════════════════════
async function suiteU(ok) {
  const L = readFileSync(LIQ_HTML, 'utf8'), R = readFileSync(RES_HTML, 'utf8');
  const code = [L.slice(L.indexOf('const ROL_POR_BENEFICIARIO'), L.indexOf('\n', L.indexOf('const ROL_POR_BENEFICIARIO'))),
    extractFn(L, 'function rolDeLinea(l)'), extractFn(L, 'function subRolDeLinea(l)'), extractFn(L, 'function conceptoDeLinea(l)')].join('\n');
  const { rolDeLinea, conceptoDeLinea } = new Function(code + '\nreturn { rolDeLinea, conceptoDeLinea };')();
  const casos = [
    [{ concepto_tipo: 'actuacion', beneficiario_tipo: 'profesional', concepto: 'Peón', descripcion: 'Carrera 1 — 1° puesto — Peón: JUAN PEREZ — A redistribuir (4%)' }, 'Peón', 'Peón — JUAN PEREZ'],
    [{ concepto_tipo: 'actuacion', beneficiario_tipo: 'profesional', concepto: 'Capataz', descripcion: 'Carrera 1 — 1° puesto — Capataz: (sin nombre cargado) — A redistribuir (3%)' }, 'Capataz', 'Capataz — (sin nombre)'],
    [{ concepto_tipo: 'actuacion', beneficiario_tipo: 'profesional', concepto: 'Sereno — Sergio Sereno', descripcion: 'Carrera 2 — 1° puesto — A redistribuir (1%)' }, 'Sereno', 'Sereno — Sergio Sereno'],
    [{ concepto_tipo: 'premio', beneficiario_tipo: 'profesional', concepto: 'Carrera 1 — 3° puesto', descripcion: 'Carrera 1 — 3° puesto — Entrenador (bolsa: $120.000,00)' }, 'Entrenador', 'Carrera 1 — 3° puesto'],
  ];
  const fallas = casos.filter(([l, rol, con]) => rolDeLinea(l) !== rol || conceptoDeLinea(l) !== con).map(([l]) => [l.concepto, rolDeLinea(l), conceptoDeLinea(l)]);
  ok('U1) peón/capataz/sereno: Rol = el sub-rol (no "Profesional"), Concepto = rol — nombre o "(sin nombre)"; formato viejo también', !fallas.length, JSON.stringify(fallas));
  const recibo = extractFn(L, 'async function imprimirReciboCobro(recibo, lineaIds, opts)');
  ok('U2) el recibo imprime el concepto discriminado y escapado, el subtotal del personal y "(incluye personal de caballeriza)"',
    /escapeHtml\(conceptoDeLinea\(l\)\)/.test(recibo) && /Personal de caballeriza/.test(recibo) && /incluye personal de caballeriza/.test(recibo));
  const detalle = extractFn(L, 'async function cobrosDetalle(tipo, id, opts = {})');
  ok('U3) Pagos: pagables y retenidas con concepto discriminado; "Habilitar caballo" en las retenidas',
    (detalle.match(/escapeHtml\(conceptoDeLinea\(l\)\)/g) || []).length >= 2 && /habilitarCaballo\(/.test(detalle) && /async function habilitarCaballo\(/.test(L));
  const gen = extractFn(L, 'async function generarLiquidaciones()');
  ok('U4) Liquidaciones: Recalcular se deshabilita en reunión cerrada y el recálculo avisa si el motor dice cerrada',
    /r\.cerrada/.test(gen) && /id="btn-recalcular"/.test(L) && /btn\.disabled = !!cerrada/.test(extractFn(L, 'async function liqPintarCierre(rid)')));
  // Gate de entrenadores: por anclas, entre el gate de montas y aplicar(...,'oficial').
  const ofi = extractFn(R, 'async function oficializar(carreraId)');
  const gate = entre(ofi, '// ═══ GATE ENTRENADORES — INICIO', '// ═══ GATE ENTRENADORES — FIN ═══');
  ok('U5) oficializar tiene el GATE ENTRENADORES después del de montas y ANTES de aplicar(…, \'oficial\'), y corta con return',
    !!gate && ofi.indexOf('GATE MONTAS — FIN') < ofi.indexOf('GATE ENTRENADORES — INICIO')
      && ofi.indexOf('GATE ENTRENADORES — FIN') < ofi.indexOf(`await aplicar(carreraId, 'oficial')`) && /return;/.test(gate));
  const faltantes = new Function('moInscripciones', 'noLargoIds', 'spcsMap',
    extractFn(R, 'function entrenadoresFaltantes(carreraId)') + '\nreturn entrenadoresFaltantes;')(
      () => [{ id: 'a', spc_id: 's1', entrenador_id: 'e' }, { id: 'b', spc_id: 's2', entrenador_id: null }, { id: 'c', spc_id: 's3', entrenador_id: null }],
      () => new Set(['c']), { s1: { nombre: 'UNO' }, s2: { nombre: 'DOS' }, s3: { nombre: 'TRES' } });
  const f = faltantes('car');
  ok('U6) entrenadoresFaltantes: sólo los que largaron sin entrenador (el "no corrió" no cuenta)', JSON.stringify(f) === '["DOS"]', JSON.stringify(f));
  const des = extractFn(R, 'async function desoficializar(resId, carreraId)');
  ok('U7) des-oficializar se corta en reunión cerrada ANTES de la RPC', des.indexOf('liquidacion_cerrada_at') > 0 && des.indexOf('liquidacion_cerrada_at') < des.indexOf(`sb.rpc('desoficializar_carrera'`));
}

// ═══ P — contra prod, SOLO LECTURA (motor en seco) ═══════════════════════════════════════════
async function suiteP(motor, ok) {
  if (!process.env.SUPABASE_SECRET_KEY) { ok('P0) SUPABASE_SECRET_KEY para la parte contra prod', false, 'falta'); return; }
  const real = createClient(PROD_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const lineas = async rid => { const { data, error } = await real.from('liquidacion_detalle').select('*').eq('reunion_id', rid); if (error) throw error; return data; };
  const antes = {}; for (const rid of [R6, R8, R9]) antes[rid] = md5Filas(await lineas(rid));

  // R9 (abierta): nacen exactamente las sub-líneas, nada más cambia.
  const prev = await lineas(R9);
  const { sb, captured } = sbDryRun(real);
  const r = await motor.generarLiquidacionesReunion({ sb, clubId: CLUB, reunionId: R9 });
  const inserts = captured.filter(c => c.table === 'liquidacion_detalle' && c.op === 'insert').flatMap(c => c.payload).map(d => ({ ...d, monto_bruto: montoPg(d.monto_bruto) }));
  const K = motor.lineKey, prevBy = new Map(prev.map(d => [K(d), d]));
  const nuevas = inserts.filter(d => !prevBy.has(K(d)));
  const distintas = inserts.filter(d => { const p = prevBy.get(K(d)); return p && (c2(p.monto_bruto) !== c2(d.monto_bruto) || p.estado_linea !== d.estado_linea || String(p.fecha_liberacion ?? '') !== String(d.fecha_liberacion ?? '')); });
  const noComprometidas = prev.filter(d => d.recibo_id == null && d.estado_linea !== 'pagado');
  const insKeys = new Set(inserts.map(K));
  const desaparecen = noComprometidas.filter(d => !insKeys.has(K(d)));
  const premiados = new Set(prev.filter(d => d.concepto_tipo === 'fondo_solidario').map(d => d.inscripcion_id));
  ok('P1) R9: el motor nuevo no da error y no toca líneas comprometidas (el DELETE filtra recibo NULL y ≠ pagado)',
    !r.error && captured.filter(c => c.table === 'liquidacion_detalle' && c.op === 'delete').every(c => JSON.stringify(c.filters).includes('"recibo_id",null') && JSON.stringify(c.filters).includes('"estado_linea","pagado"')),
    JSON.stringify(r));
  ok(`P2) R9: nacen exactamente ${premiados.size * 3} líneas, todas peón/capataz/sereno (3 por caballo premiado)`,
    nuevas.length === premiados.size * 3 && nuevas.every(d => d.concepto_tipo === 'actuacion') && premiados.size > 0,
    `nuevas=${nuevas.length} premiados=${premiados.size} tipos=${[...new Set(nuevas.map(d => d.concepto_tipo + '/' + d.concepto))]}`);
  ok('P3) R9: ninguna línea existente cambia de monto, estado o fecha (retenidas incluidas) y ninguna desaparece',
    !distintas.length && !desaparecen.length, `distintas=${distintas.length} desaparecen=${desaparecen.length}`);
  // 100 % / 18 % por caballo con el oráculo de la bolsa.
  const { data: cars } = await real.from('carreras').select('id,bolsa_total,distribucion_premios').eq('reunion_id', R9);
  const { data: ins } = await real.from('inscripciones').select('id,carrera_id').in('id', [...premiados]);
  const { data: res } = await real.from('resultados').select('id,carrera_id').in('carrera_id', cars.map(c => c.id)).eq('estado', 'oficial');
  const { data: pos } = await real.from('resultado_posiciones').select('inscripcion_id,posicion,empate').in('resultado_id', res.map(x => x.id)).in('inscripcion_id', [...premiados]);
  const finales = [...prev.filter(d => d.recibo_id != null || d.estado_linea === 'pagado'), ...inserts];
  let malos = [], sumaNuevas = 0, sumaEsperada = 0;
  for (const iid of premiados) {
    const p = pos.find(x => x.inscripcion_id === iid), car = cars.find(c => c.id === ins.find(x => x.id === iid).carrera_id);
    if (p.empate) { malos.push({ iid, motivo: 'empate: el oráculo no lo cubre' }); continue; }
    const P0 = premioOraculo(car.bolsa_total, car.distribucion_premios, p.posicion);
    const ls = finales.filter(d => d.inscripcion_id === iid && ['premio', 'fondo_solidario', 'actuacion'].includes(d.concepto_tipo));
    const suma = ls.reduce((a, d) => a + c2(d.monto_bruto), 0);
    const e18 = ls.filter(d => d.concepto_tipo === 'actuacion' || rolDe(d) === 'Entrenador').reduce((a, d) => a + c2(d.monto_bruto), 0);
    if (suma !== c2(montoPg(P0)) || e18 !== c2(montoPg(P0 * .18))) malos.push({ iid, pos: p.posicion, P: montoPg(P0), suma: suma / 100, e18: e18 / 100 });
    sumaEsperada += c2(montoPg(P0 * .18)) - c2(ls.find(d => rolDe(d) === 'Entrenador').monto_bruto);
  }
  sumaNuevas = nuevas.reduce((a, d) => a + c2(d.monto_bruto), 0);
  ok(`P4) R9: los ${premiados.size} premiados reparten el 100 % exacto y el entrenador + personal = 18 % exacto`, !malos.length, JSON.stringify(malos));
  ok('P5) R9: la suma de las nuevas = Σ (18 % − 10 % del entrenador) por caballo, al centavo', sumaNuevas === sumaEsperada,
    `nuevas ${sumaNuevas / 100} · esperado ${sumaEsperada / 100}`);

  // R6 / R8 (saldadas): con la columna, el motor corta sin escribir nada. Si la migración todavía no
  // está aplicada, la marca se simula EN MEMORIA y se avisa.
  const { error: eCol } = await real.from('reuniones').select('liquidacion_cerrada_at').limit(1);
  const migrada = !eCol;
  for (const [nom, rid] of [['R6', R6], ['R8', R8]]) {
    const hook = migrada ? undefined : (t, d) => t === 'reuniones' ? (Array.isArray(d) ? d.map(x => ({ ...x, liquidacion_cerrada_at: 'SIMULADO' })) : { ...d, liquidacion_cerrada_at: 'SIMULADO' }) : d;
    const dr = sbDryRun(real, { hook });
    const rr = await motor.generarLiquidacionesReunion({ sb: dr.sb, clubId: CLUB, reunionId: rid });
    ok(`P6) ${nom} ${migrada ? '(cerrada en la base)' : '(cierre SIMULADO en memoria: la migración no está aplicada)'}: el motor corta con 0 escrituras`,
      rr.cerrada === true && dr.captured.length === 0, JSON.stringify({ rr, escrituras: dr.captured.length }));
  }
  const despues = {}; for (const rid of [R6, R8, R9]) despues[rid] = md5Filas(await lineas(rid));
  ok('P7) md5 de las líneas de R6, R8 y R9: idéntico antes y después (el probe no escribió nada)',
    [R6, R8, R9].every(rid => antes[rid] === despues[rid]), JSON.stringify({ antes, despues }));
}

// ═══ D — la base (sandbox tests/local; nunca prod) ═══════════════════════════════════════════
function jwt(role, secret) {
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b({ alg: 'HS256', typ: 'JWT' }), p = b({ role, sub: randomUUID(), iss: 'sgh-local', exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
}
async function suiteD(ok) {
  const PSQL = process.env.PSQL_CMD, SECRET = process.env.LOCAL_JWT_SECRET;
  if (!PSQL || !SECRET) { console.log('⏸ D) sin sandbox (PSQL_CMD + LOCAL_JWT_SECRET): no se prueban los triggers'); return false; }
  if (/unlhcuanfrtpatoipwve/.test(SANDBOX_URL)) throw new Error('D) SANDBOX_URL apunta a prod: se niega');
  const sql = q => execSync(PSQL, { input: q, encoding: 'utf8' });
  const cli = role => createClient(SANDBOX_URL, jwt(role, SECRET), { auth: { persistSession: false } });
  const MARCA = 'PROBE-REPARTO-100';
  const hdr = sql(`select id from liquidaciones where reunion_id='${R9999}' limit 1;`).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
  const linea = sql(`select id from liquidacion_detalle where reunion_id='${R9999}' limit 1;`).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
  if (!hdr || !linea) { ok('D0) el sandbox tiene la 9999 con liquidaciones', false); return true; }
  sql(`update reuniones set liquidacion_cerrada_at=now(), liquidacion_cerrada_nota='${MARCA}' where id='${R9999}';`);
  try {
    const auth = cli('authenticated'), svc = cli('service_role');
    const fila = { liquidacion_id: hdr, reunion_id: R9999, concepto: MARCA, monto_bruto: 1, monto_descuento: 0, concepto_tipo: 'actuacion', beneficiario_tipo: 'profesional', estado_linea: 'impago' };
    const i1 = await auth.from('liquidacion_detalle').insert(fila);
    ok('D1) reunión cerrada: un INSERT como authenticated en liquidacion_detalle → P0091', i1.error?.code === 'P0091', JSON.stringify(i1.error));
    const u1 = await auth.from('liquidacion_detalle').update({ monto_bruto: 999 }).eq('id', linea);
    ok('D2) reunión cerrada: un UPDATE como authenticated → P0091', u1.error?.code === 'P0091', JSON.stringify(u1.error));
    const d1 = await auth.from('liquidacion_detalle').delete().eq('id', linea);
    ok('D3) reunión cerrada: un DELETE como authenticated → P0091', d1.error?.code === 'P0091', JSON.stringify(d1.error));
    const h1 = await auth.from('liquidaciones').delete().eq('id', hdr);
    ok('D4) reunión cerrada: borrar el header como authenticated → P0091', h1.error?.code === 'P0091', JSON.stringify(h1.error));
    const s1 = await svc.from('liquidacion_detalle').insert(fila);
    ok('D5) service_role (regularización) sí puede escribir en la reunión cerrada', !s1.error, JSON.stringify(s1.error));
    const r1 = await auth.from('reuniones').update({ liquidacion_cerrada_at: null }).eq('id', R9999);
    ok('D6) reabrir como authenticated (no super_admin) → 42501', r1.error?.code === '42501', JSON.stringify(r1.error));
  } finally {
    sql(`delete from liquidacion_detalle where concepto='${MARCA}'; update reuniones set liquidacion_cerrada_at=null, liquidacion_cerrada_nota=null where id='${R9999}';`);
  }
  const quedo = sql(`select count(*) from liquidacion_detalle where concepto='${MARCA}'; select count(*) from reuniones where id='${R9999}' and liquidacion_cerrada_at is not null;`);
  ok('D7) limpieza: 0 filas de prueba y la 9999 vuelve a quedar abierta', (quedo.match(/^\s*0\s*$/gm) || []).length === 2, quedo.replace(/\s+/g, ' '));
  return true;
}

// ═══ Corrida ═══════════════════════════════════════════════════════════════════════════════════
async function correrTodo(motorSrc, partes, { silencioso = false } = {}) {
  const res = [];
  const ok = (t, c, n = '') => { res.push({ t, c: !!c, n }); if (!silencioso) console.log(`${c ? '✅' : '❌'} ${t}${!c && n ? `\n   → ${String(n).slice(0, 600)}` : ''}`); return c; };
  const motor = cargarMotor(motorSrc);
  if (partes.includes('S')) await suiteS(motor, ok);
  if (partes.includes('U')) await suiteU(ok);
  if (partes.includes('P')) await suiteP(motor, ok);
  let dCorrio = false;
  if (partes.includes('D')) dCorrio = await suiteD(ok);
  return { res, dCorrio };
}

const { res, dCorrio } = await correrTodo(ENGINE_SRC, SOLO);
const malos = res.filter(r => !r.c);
console.log(`\n${res.length - malos.length}/${res.length} checks OK${dCorrio ? '' : ' (sin la parte D: sandbox no disponible)'}`);

if (MUTANTES) {
  console.log('\n── Mutantes ──');
  let muertos = 0, total = 0;
  for (const [id, m] of Object.entries(MUT)) {
    total++;
    if (m.motor) {
      let r;
      try { r = await correrTodo(mutarMotor(id), ['S'], { silencioso: true }); }
      catch (e) { r = { res: [{ t: `excepción) ${e.message}`, c: false }] }; }
      const murio = r.res.some(x => !x.c);
      muertos += murio;
      console.log(`${murio ? '💀' : '🧟'} ${id} ${murio ? 'muerto' : 'VIVO'} — ${m.desc}${murio ? ` (${r.res.filter(x => !x.c).map(x => x.t.split(')')[0]).join(', ')})` : ''}`);
    } else {
      const PSQL = process.env.PSQL_CMD;
      if (!PSQL || !process.env.LOCAL_JWT_SECRET) { console.log(`⏸ ${id} MANUAL (sin sandbox) — ${m.desc}`); continue; }
      execSync(PSQL, { input: 'ALTER TABLE liquidacion_detalle DISABLE TRIGGER trg_liq_detalle_cerrada;', encoding: 'utf8' });
      let r;
      try { r = await correrTodo(ENGINE_SRC, ['D'], { silencioso: true }); }
      finally { execSync(PSQL, { input: 'ALTER TABLE liquidacion_detalle ENABLE TRIGGER trg_liq_detalle_cerrada;', encoding: 'utf8' }); }
      const murio = r.res.some(x => !x.c);
      muertos += murio;
      console.log(`${murio ? '💀' : '🧟'} ${id} ${murio ? 'muerto' : 'VIVO'} — ${m.desc}${murio ? ` (${r.res.filter(x => !x.c).map(x => x.t.split(')')[0]).join(', ')})` : ''}`);
    }
  }
  console.log(`\n${muertos}/${total} mutantes muertos`);
  if (muertos !== total) process.exitCode = 1;
}
if (malos.length) process.exitCode = 1;
