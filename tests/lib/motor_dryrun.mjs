/**
 * tests/lib/motor_dryrun.mjs — herramientas para correr el MOTOR REAL de liquidación
 * (liquidaciones-engine.js, tal cual está en el archivo) sin tocar la base.
 *
 *   cargarMotor(src)           → { generarLiquidacionesReunion, lineKey } evaluando el texto del motor.
 *   sbDryRun(real, {hook})     → cliente que LEE de `real` y CAPTURA toda escritura sin enviarla.
 *                                `captured` trae cada insert/update/delete/upsert. Una rpc() tira.
 *   sbMemoria(tablas)          → cliente 100 % en memoria (sin red) para casos sintéticos: soporta
 *                                exactamente las consultas que hace el motor.
 *   montoPg(x)                 → cómo guarda Postgres un monto en numeric(…,2) (redondeo a centavos).
 *   md5Filas(filas, cols?)     → md5 de filas ordenadas por id (para "antes / después").
 *
 * Usado por tests/probe_reparto_100.mjs y tests/recalculo_r9_subroles.mjs.
 */
import { createHash, randomUUID } from 'node:crypto';

export const montoPg = x => (x == null ? x : Math.round((Number(x) + 1e-9) * 100) / 100);

export function cargarMotor(src) {
  const ctx = {};
  new Function('window', src)(ctx);
  if (typeof ctx.generarLiquidacionesReunion !== 'function') throw new Error('el texto no define generarLiquidacionesReunion');
  return { generarLiquidacionesReunion: ctx.generarLiquidacionesReunion, lineKey: ctx.lineKey };
}

export function md5Filas(filas, cols) {
  const norm = [...filas].sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(f => cols ? cols.map(c => [c, f[c] ?? null]) : Object.keys(f).sort().map(c => [c, f[c] ?? null]));
  return createHash('md5').update(JSON.stringify(norm)).digest('hex');
}

// ── Dry-run sobre una base real ────────────────────────────────────────────────────────────
const ESCRITURA = new Set(['insert', 'update', 'delete', 'upsert']);
export function sbDryRun(real, { hook } = {}) {
  const captured = [];
  let n = 0;
  const from = (table) => {
    const chain = [];
    let write = null;
    const run = async () => {
      if (write) {
        captured.push({ table, op: write.op, payload: write.args[0] ?? null,
          filters: chain.filter(([m]) => !ESCRITURA.has(m) && m !== 'select' && m !== 'single') });
        if (write.op === 'insert' && chain.some(([m]) => m === 'single'))
          return { data: { id: `DRYRUN-${++n}`, ...write.args[0] }, error: null };
        return { data: null, error: null, count: null };
      }
      if (chain[0]?.[0] !== 'select') throw new Error(`dry-run: cadena sin select en ${table}`);
      let q = real.from(table);
      for (const [m, a] of chain) q = q[m](...a);
      const res = await q;
      if (hook && res?.data) res.data = hook(table, res.data);
      return res;
    };
    const api = new Proxy({}, {
      get(_, m) {
        if (m === 'then') return (ok, ko) => run().then(ok, ko);
        return (...args) => {
          if (ESCRITURA.has(m)) { if (write) throw new Error('doble escritura'); write = { op: m, args }; }
          chain.push([m, args]);
          return api;
        };
      },
    });
    return api;
  };
  return { sb: { from, rpc: () => { throw new Error('dry-run: rpc no permitida'); } }, captured };
}

// ── Base en memoria (casos sintéticos) ────────────────────────────────────────────────────────
const GENERADAS = { liquidacion_detalle: r => ({ monto_neto: montoPg((r.monto_bruto || 0) - (r.monto_descuento || 0)) }),
                    liquidaciones: r => ({ total_neto: montoPg((r.total_bruto || 0) - (r.total_descuentos || 0)) }) };
const NUMERICAS = ['monto_bruto', 'monto_descuento', 'total_bruto', 'total_descuentos'];

export function sbMemoria(tablas) {
  const T = tablas;
  for (const k of ['liquidaciones', 'liquidacion_detalle']) T[k] ??= [];
  const escrituras = [];
  const normalizar = (table, r) => {
    const f = { ...r };
    for (const c of NUMERICAS) if (c in f) f[c] = montoPg(f[c]);
    return { ...f, ...(GENERADAS[table]?.(f) || {}) };
  };
  const from = (table) => {
    const filtros = [];
    let op = 'select', payload = null, cols = '*', opts = {}, single = false, maybe = false;
    const pasa = r => filtros.every(([m, c, v, w]) => {
      if (m === 'eq') return r[c] === v;
      if (m === 'neq') return r[c] !== v && r[c] != null;   // como PostgREST: NULL no pasa un neq
      if (m === 'in') return v.includes(r[c]);
      if (m === 'is') return v === null ? r[c] == null : r[c] === v;
      if (m === 'not') return v === 'is' && w === null ? r[c] != null : true;
      throw new Error(`sbMemoria: filtro ${m} no soportado`);
    });
    const run = async () => {
      T[table] ??= [];
      if (op === 'insert') {
        const filas = (Array.isArray(payload) ? payload : [payload]).map(r => normalizar(table, { id: r.id || randomUUID(), ...r }));
        T[table].push(...filas);
        escrituras.push({ table, op, filas: filas.length });
        return { data: single ? filas[0] : filas, error: null };
      }
      const hit = T[table].filter(pasa);
      if (op === 'delete') {
        T[table] = T[table].filter(r => !pasa(r));
        if (table === 'liquidaciones') {
          const ids = new Set(hit.map(h => h.id));
          T.liquidacion_detalle = T.liquidacion_detalle.filter(d => !ids.has(d.liquidacion_id));   // on delete cascade
        }
        escrituras.push({ table, op, filas: hit.length });
        return { data: null, error: null };
      }
      if (op === 'update') {
        for (const r of hit) Object.assign(r, normalizar(table, { ...r, ...payload }));
        escrituras.push({ table, op, filas: hit.length });
        return { data: null, error: null };
      }
      if (opts.head) return { data: null, count: hit.length, error: null };
      const anidado = /liquidacion_detalle\(/.test(cols);
      const data = hit.map(r => anidado ? { ...r, liquidacion_detalle: T.liquidacion_detalle.filter(d => d.liquidacion_id === r.id).map(d => ({ ...d })) } : { ...r });
      if (single || maybe) {
        if (!data.length) return maybe ? { data: null, error: null } : { data: null, error: { message: 'no rows' } };
        return { data: data[0], error: null };
      }
      return { data, error: null, count: data.length };
    };
    const api = {
      select(c = '*', o = {}) { if (op === 'select') { cols = c; opts = o; } return api; },
      insert(p) { op = 'insert'; payload = p; return api; },
      update(p) { op = 'update'; payload = p; return api; },
      delete() { op = 'delete'; return api; },
      eq(c, v) { filtros.push(['eq', c, v]); return api; },
      neq(c, v) { filtros.push(['neq', c, v]); return api; },
      in(c, v) { filtros.push(['in', c, v]); return api; },
      is(c, v) { filtros.push(['is', c, v]); return api; },
      not(c, o, v) { filtros.push(['not', c, o, v]); return api; },
      order() { return api; },
      single() { single = true; return api; },
      maybeSingle() { maybe = true; return api; },
      then(ok, ko) { return run().then(ok, ko); },
    };
    return api;
  };
  return { sb: { from, rpc: () => { throw new Error('sbMemoria: rpc no soportada'); } }, tablas: T, escrituras };
}
