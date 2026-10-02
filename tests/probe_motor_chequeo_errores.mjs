/**
 * Probe — ISSUE-104 (2a): el motor de liquidación CORTA y devuelve el error cuando falla una lectura,
 * el DELETE o un INSERT, en vez de seguir con datos a medias (que es lo que duplica plata).
 * SIN red y SIN base: corre el liquidaciones-engine.js REAL sobre la base en memoria de
 * tests/lib/motor_dryrun.mjs (sbMemoria), con un envoltorio que hace fallar UNA consulta elegida.
 *
 *   node tests/probe_motor_chequeo_errores.mjs              # contra el working tree
 *   node tests/probe_motor_chequeo_errores.mjs --mutantes   # + mutantes (cada uno TIENE que morir)
 *   ENGINE_JS=/ruta/liquidaciones-engine.js node tests/…    # contra otro motor (p. ej. el de main)
 *
 * Escenario: una carrera oficial con 5 caballos; primera corrida limpia; después una línea se marca
 * pagada con recibo (lo que hace emitir_recibo). Cada caso parte de ese estado.
 *
 *   E0  sin fallas: recalcular no cambia nada y no duplica (regresión del camino feliz)
 *   L1–L8  falla una LECTURA (liquidacion_config, carreras, comision_config, resultados, inscripciones,
 *          posiciones, quién largó, liquidaciones existentes) → devuelve error "no se cambió nada",
 *          0 escrituras, base idéntica
 *   D1  falla el DELETE de las líneas no pagadas → error, 0 INSERT, base idéntica
 *   I1  falla el INSERT de líneas → error "INCOMPLETA", ninguna clave duplicada, la pagada sigue una vez;
 *       el recálculo siguiente sin fallas deja exactamente lo de antes
 *   I2  falla el INSERT de un header nuevo → error "INCOMPLETA", no se insertan líneas de ese actor ni de los que siguen
 *   C1  falla el CONTEO del paso 4 → error, no se borra ningún header (ON DELETE CASCADE se llevaría la pagada)
 *   C2  falla el DELETE de un header vacío → error devuelto
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { cargarMotor, sbMemoria, md5Filas } from './lib/motor_dryrun.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const ENGINE_JS = process.env.ENGINE_JS || ROOT + 'liquidaciones-engine.js';
const MUTANTES = process.argv.includes('--mutantes');
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const DIST = { 1: 60, 2: 19, 3: 12, 4: 6, 5: 3, bono_ganador: 250000, ganancia_minima: 100000, bono_posicion_desde: 6, bono_posicion_hasta: 8, bono_posicion_monto: 100000 };
const CFG = { pct_propietario: '70.000', pct_entrenador: '10.000', pct_jockey: '10.000', pct_peon: '4.000', pct_capataz: '3.000',
  pct_sereno: '1.000', pct_fondo_solidario: '2.000', incentivo_jockey_monto: '60000.00', incentivo_entrenador_monto: '10000.00', dias_antidoping: 30 };

// ── escenario sintético ───────────────────────────────────────────────────────────────────────
function escenario() {
  const RID = randomUUID(), CAR = randomUUID(), RES = randomUUID();
  const insc = [1, 2, 3, 4, 5].map(i => ({ id: randomUUID(), carrera_id: CAR, estado: 'ratificado',
    propietario_id: `prop-${i}`, entrenador_id: `entr-${i}`, jockey_titular_id: `jock-${i}`, peon: null, capataz: null, sereno: null }));
  return { RID, RES, tablas: {
    reuniones: [{ id: RID, club_id: CLUB, fecha: '2026-09-20', liquidacion_cerrada_at: null }],
    liquidacion_config: [{ id: 'cfg', club_id: CLUB, activo: true, ...CFG }],
    comision_config: [],
    carreras: [{ id: CAR, reunion_id: RID, numero_turno: 1, numero_carrera_programa: 1, bolsa_total: '1000000', distribucion_premios: DIST }],
    resultados: [{ id: RES, carrera_id: CAR, estado: 'oficial' }],
    inscripciones: insc,
    resultado_posiciones: insc.map((x, i) => ({ resultado_id: RES, inscripcion_id: x.id, posicion: i + 1, empate: false, descalificado: false, no_largo: false })),
  } };
}

// ── envoltorio que hace fallar UNA consulta ───────────────────────────────────────────────────
// regla(table, op, chain) → true para la consulta que tiene que fallar (sólo la primera que matchea).
function conFalla(mem, regla) {
  let disparada = 0;
  const from = (table) => {
    const api = mem.sb.from(table);
    let op = 'select';
    const chain = [];
    const prox = new Proxy(api, {
      get(t, k) {
        if (k === 'then') return (ok, ko) => {
          if (!disparada && regla(table, op, chain)) {
            disparada++;
            return Promise.resolve({ data: null, error: { message: 'falla inyectada', code: 'XX000' }, count: null }).then(ok, ko);
          }
          return t.then(ok, ko);
        };
        const f = t[k];
        if (typeof f !== 'function') return f;
        return (...a) => { if (['insert', 'update', 'delete'].includes(k)) op = k; chain.push([k, a]); f.apply(t, a); return prox; };
      },
    });
    return prox;
  };
  return { sb: { from, rpc: mem.sb.rpc }, disparo: () => disparada };
}
const tiene = (chain, metodo, pred = () => true) => chain.some(([m, a]) => m === metodo && pred(a));

// estado de la base que importa: headers y líneas
const foto = (mem) => md5Filas(mem.tablas.liquidaciones, ['id', 'profesional_id', 'propietario_id', 'reunion_id'])
  + md5Filas(mem.tablas.liquidacion_detalle, ['id', 'liquidacion_id', 'beneficiario_id', 'concepto_tipo', 'concepto', 'inscripcion_id', 'posicion', 'monto_bruto', 'estado_linea', 'recibo_id']);
// lo mismo pero sin ids (para comparar "quedó igual que antes" después de borrar y reinsertar)
const contenido = (mem) => mem.tablas.liquidacion_detalle
  .map(d => [d.beneficiario_tipo, d.beneficiario_id, d.concepto_tipo, d.inscripcion_id || '', d.posicion ?? '', d.concepto, d.monto_bruto, d.estado_linea, d.recibo_id || ''].join('|'))
  .sort().join('\n');
const clavesDuplicadas = (motor, mem) => {
  const n = {};
  for (const d of mem.tablas.liquidacion_detalle) { const k = d.reunion_id + '|' + motor.lineKey(d); n[k] = (n[k] || 0) + 1; }
  return Object.values(n).filter(v => v > 1).length;
};

async function correr(SRC) {
  const res = [];
  const ok = (t, c, n = '') => { res.push({ t, s: c ? '✅' : '❌', n }); return c; };
  // el motor hace console.error de las fallas inyectadas: ruido esperado, se silencia durante los casos
  const errOrig = console.error; console.error = () => {};
  try { return await casos(SRC, res, ok); } finally { console.error = errOrig; }
}
async function casos(SRC, res, ok) {
  let motor;
  try { motor = cargarMotor(SRC); } catch (e) { ok('X  el motor no carga', false, e.message); return res; }
  const run = (sb, esc, opts = {}) => motor.generarLiquidacionesReunion({ sb, clubId: CLUB, reunionId: esc.RID,
    liqConfig: 'liqConfig' in opts ? opts.liqConfig : CFG, comCfg: 'comCfg' in opts ? opts.comCfg : [] });

  // estado de partida: corrida limpia + una línea pagada con recibo
  async function preparar() {
    const esc = escenario();
    const mem = sbMemoria(esc.tablas);
    const r0 = await run(mem.sb, esc);
    if (r0.error) throw new Error('la corrida inicial falló: ' + r0.error);
    const pagada = mem.tablas.liquidacion_detalle.find(d => d.concepto_tipo === 'premio' && d.posicion === 3 && d.beneficiario_id === 'jock-3');
    pagada.estado_linea = 'pagado'; pagada.recibo_id = 'rec-1';
    return { esc, mem, pagada };
  }

  try {
    // E0
    {
      const { esc, mem } = await preparar();
      const antes = contenido(mem);
      const r = await run(mem.sb, esc);
      ok('E0 sin fallas: recalcular devuelve éxito, mismo contenido, ninguna clave duplicada',
        !r.error && contenido(mem) === antes && clavesDuplicadas(motor, mem) === 0, JSON.stringify(r));
    }

    // L1–L8 y D1: falla antes de escribir nada → error y base idéntica
    const antesDeEscribir = [
      ['L1', 'liquidacion_config', (t, op) => t === 'liquidacion_config', { liqConfig: undefined }],
      ['L2', 'carreras', (t, op) => t === 'carreras'],
      ['L3', 'comision_config', (t, op) => t === 'comision_config', { comCfg: undefined }],
      ['L4', 'resultados', (t, op) => t === 'resultados'],
      ['L5', 'inscripciones', (t, op) => t === 'inscripciones'],
      ['L6', 'posiciones', (t, op, ch) => t === 'resultado_posiciones' && tiene(ch, 'not')],
      ['L7', 'quién largó', (t, op, ch) => t === 'resultado_posiciones' && tiene(ch, 'eq', a => a[0] === 'no_largo')],
      ['L8', 'liquidaciones existentes', (t, op, ch) => t === 'liquidaciones' && op === 'select' && tiene(ch, 'select', a => /liquidacion_detalle\(/.test(a[0] || ''))],
      ['D1', 'DELETE de líneas no pagadas', (t, op) => t === 'liquidacion_detalle' && op === 'delete'],
    ];
    for (const [id, que, regla, opts] of antesDeEscribir) {
      const { esc, mem } = await preparar();
      const f0 = foto(mem), e0 = mem.escrituras.length;
      const fx = conFalla(mem, regla);
      const r = await run(fx.sb, esc, opts || {});
      ok(`${id} falla ${que} → error "no se cambió nada", 0 escrituras, base idéntica`,
        fx.disparo() === 1 && !!r.error && /no se cambió nada/.test(r.error) && mem.escrituras.length === e0 && foto(mem) === f0,
        JSON.stringify({ disparo: fx.disparo(), r, escr: mem.escrituras.length - e0, igual: foto(mem) === f0 }));
    }

    // I1: falla el INSERT de líneas
    {
      const { esc, mem, pagada } = await preparar();
      const limpio = contenido(mem);
      const fx = conFalla(mem, (t, op) => t === 'liquidacion_detalle' && op === 'insert');
      const r = await run(fx.sb, esc);
      const pagadas = mem.tablas.liquidacion_detalle.filter(d => d.recibo_id === 'rec-1');
      ok('I1 falla INSERT de líneas → error "INCOMPLETA", sin claves duplicadas, la pagada sigue una sola vez',
        fx.disparo() === 1 && !!r.error && /INCOMPLETA/.test(r.error) && clavesDuplicadas(motor, mem) === 0 && pagadas.length === 1 && pagadas[0].id === pagada.id,
        JSON.stringify({ r, dup: clavesDuplicadas(motor, mem), pagadas: pagadas.length }));
      const r2 = await run(mem.sb, esc);
      ok('I1b el recálculo siguiente sin fallas deja exactamente el contenido de antes',
        !r2.error && contenido(mem) === limpio, JSON.stringify(r2));
    }

    // I2: falla el INSERT de un header nuevo (base sin liquidaciones: todos los headers son nuevos)
    {
      const esc = escenario();
      const mem = sbMemoria(esc.tablas);
      const fx = conFalla(mem, (t, op) => t === 'liquidaciones' && op === 'insert');
      const r = await run(fx.sb, esc);
      ok('I2 falla INSERT de un header → error "INCOMPLETA" y no se insertó ninguna línea después',
        fx.disparo() === 1 && !!r.error && /INCOMPLETA/.test(r.error) && mem.tablas.liquidacion_detalle.length === 0,
        JSON.stringify({ r, lineas: mem.tablas.liquidacion_detalle.length }));
    }

    // C1: falla el conteo del paso 4
    {
      const { esc, mem, pagada } = await preparar();
      const headersAntes = mem.tablas.liquidaciones.length;
      const fx = conFalla(mem, (t, op, ch) => t === 'liquidacion_detalle' && op === 'select' && tiene(ch, 'select', a => a[1]?.head));
      const r = await run(fx.sb, esc);
      ok('C1 falla el conteo de líneas de un header → error y ningún header borrado (la pagada sigue)',
        fx.disparo() === 1 && !!r.error && mem.tablas.liquidaciones.length === headersAntes && mem.tablas.liquidacion_detalle.some(d => d.id === pagada.id),
        JSON.stringify({ r, headers: [headersAntes, mem.tablas.liquidaciones.length] }));
    }

    // C2: falla el DELETE de un header vacío (des-oficializar: el resultado deja de ser oficial)
    {
      const { esc, mem } = await preparar();
      esc.tablas.resultados[0].estado = 'provisional';
      const fx = conFalla(mem, (t, op) => t === 'liquidaciones' && op === 'delete');
      const r = await run(fx.sb, esc);
      ok('C2 falla el DELETE de un header vacío → error devuelto', fx.disparo() === 1 && !!r.error && /INCOMPLETA/.test(r.error), JSON.stringify(r));
    }
  } catch (e) { ok('X  excepción en los casos (cuenta como fallo)', false, String(e?.stack || e).split('\n').slice(0, 2).join(' ')); }
  return res;
}

const BASE = readFileSync(ENGINE_JS, 'utf8');
const base = await correr(BASE);
for (const x of base) console.log(`${x.s} ${x.t}${x.s === '❌' && x.n ? '  → ' + x.n.slice(0, 400) : ''}`);
const fails = base.filter(x => x.s === '❌').length;
console.log(`\n${base.length - fails}/${base.length} asserts OK  (${ENGINE_JS})`);

const MUT = [
  ['MU1 sin chequeo de liquidacion_config', `      if (cfgErr) return corte('no se pudo leer liquidacion_config', cfgErr);\n`, ``],
  ['MU2 sin chequeo de carreras', `    if (carsErr) return corte('no se pudieron leer las carreras', carsErr);\n`, ``],
  ['MU3 sin chequeo de comision_config', `    if (comCfgRes.error) return corte('no se pudo leer comision_config', comCfgRes.error);\n`, ``],
  ['MU4 sin chequeo de resultados', `    if (resErr) return corte('no se pudieron leer los resultados', resErr);\n`, ``],
  ['MU5 sin chequeo de inscripciones', `    if (inscErr) return corte('no se pudieron leer las inscripciones', inscErr);\n`, ``],
  ['MU6 sin chequeo de posiciones', `    if (possErr) return corte('no se pudieron leer las posiciones', possErr);\n`, ``],
  ['MU7 sin chequeo de quién largó', `      if (largErr) return corte('no se pudo leer quién largó', largErr);\n`, ``],
  ['MU8 sin chequeo de liquidaciones existentes', `    if (existErr) return corte('no se pudieron leer las liquidaciones existentes', existErr);\n`, ``],
  ['MU9 sin chequeo del DELETE de líneas', `      if (delErr) return corte('no se pudieron borrar las líneas no pagadas', delErr);\n`, ``],
  ['MU10 INSERT de header vuelve a continue', `return cortePersistiendo('no se pudo crear una liquidación', error); }`, `continue; }`],
  ['MU11 INSERT de líneas sólo loguea', `return cortePersistiendo('no se pudieron insertar las líneas', detErr); }`, `}`],
  ['MU12 sin chequeo del conteo', `      if (cntErr) return cortePersistiendo('no se pudieron contar las líneas de una liquidación', cntErr);\n`, ``],
  ['MU13 sin chequeo del DELETE de header', `        if (hdelErr) return cortePersistiendo('no se pudo borrar una liquidación vacía', hdelErr);\n`, ``],
];
let vivos = 0;
if (MUTANTES) {
  console.log('\n── mutantes ──');
  for (const [nombre, de, a] of MUT) {
    if (BASE.split(de).length !== 2) { console.log(`⚠️  ${nombre}: ancla no única/ausente — mutante roto`); vivos++; continue; }
    const r = await correr(BASE.replace(de, a));
    const muertos = r.filter(x => x.s === '❌').map(x => x.t.split(' ')[0]);
    if (!muertos.length) vivos++;
    console.log(`${muertos.length ? '✅ muere' : '❌ VIVE '} ${nombre}${muertos.length ? '  ← ' + [...new Set(muertos)].join(', ') : ''}`);
  }
  console.log(`\nmutantes: ${MUT.length - vivos}/${MUT.length} muertos`);
}
process.exit(fails || vivos ? 1 : 0);
