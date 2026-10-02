/**
 * sb_fixture.mjs — cliente de Supabase EN MEMORIA, sólo lectura, para correr código real de las pantallas
 * contra datos sintéticos (02/10: los probes de Pagos dejaron de depender de lo que hoy es pagable en R9).
 *
 *   const sb = sbFixture(tablas, REL);   // tablas = { nombre: [filas] }
 *   await sb.from('inscripciones').select('id,spcs(nombre),resultado_posiciones(posicion,no_largo)').eq('carrera_id', x)
 *
 * Imita lo que PostgREST hace y el código de las pantallas usa:
 *   · columnas: `a,b`, `*`, y embeds de UN nivel `rel(c1,c2)` — "uno" (FK en la fila → objeto o null) o
 *     "muchos" (FK en el hijo → array). Las relaciones se declaran en REL; sin declarar, el embed tira error
 *     (mejor que devolver undefined en silencio);
 *   · la fila vuelve PROYECTADA: sólo las columnas pedidas (si el código lee una que no pidió, ve undefined,
 *     igual que en prod);
 *   · filtros eq / neq (NULL no pasa, como `<>` en SQL) / is / in / not(c,'is',null) / or('c.op.v,…') con
 *     eq, neq, is.null, not.is.null; order (asc/desc, nullsFirst) / limit / single / maybeSingle /
 *     select(…, { count:'exact', head:true }).
 * No escribe: insert/update/delete/rpc tiran error (los probes que lo usan son de lectura).
 */
export function sbFixture(tablas, REL = {}) {
  const partirTop = s => {   // "a,b(c,d),e" → ["a","b(c,d)","e"]
    const out = []; let d = 0, cur = '';
    for (const ch of s) {
      if (ch === '(') d++; else if (ch === ')') d--;
      if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const proyectar = (fila, cols) => {
    if (cols.trim() === '*') return { ...fila };
    const o = {};
    for (const c of partirTop(cols)) {
      const m = /^(\w+)\((.*)\)$/.exec(c);
      if (!m) { o[c] = fila[c]; continue; }
      const [, rel, sub] = m;
      const def = REL[rel];
      if (!def) throw new Error(`sbFixture: embed sin relación declarada: ${rel}`);
      if (def.muchos) o[rel] = (tablas[rel] || []).filter(h => h[def.muchos] === fila.id).map(h => proyectar(h, sub));
      else { const p = (tablas[rel] || []).find(h => h.id === fila[def.uno]); o[rel] = p ? proyectar(p, sub) : null; }
    }
    return o;
  };
  const cond = (r, col, op, v) => {
    if (op === 'eq') return r[col] != null && String(r[col]) === String(v);
    if (op === 'neq') return r[col] != null && String(r[col]) !== String(v);
    if (op === 'is') return v === null || v === 'null' ? r[col] == null : r[col] === v;
    if (op === 'notis') return v === null || v === 'null' ? r[col] != null : r[col] !== v;
    if (op === 'in') return v.map(String).includes(String(r[col]));
    throw new Error(`sbFixture: operador ${op} no soportado`);
  };
  const parseOr = s => partirTop(s).map(t => {
    const p = t.split('.');
    if (p[1] === 'not' && p[2] === 'is') return [p[0], 'notis', p.slice(3).join('.')];
    return [p[0], p[1], p.slice(2).join('.')];
  });
  const from = (table) => {
    const filtros = [], orden = [];
    let cols = '*', opts = {}, single = false, maybe = false, lim = null;
    const run = async () => {
      if (!tablas[table]) return { data: null, error: { message: `sbFixture: tabla ${table} no está en el fixture` } };
      let hit = tablas[table].filter(r => filtros.every(f => f(r)));
      for (const [c, asc, nullsFirst] of [...orden].reverse()) {
        hit = [...hit].sort((a, b) => {
          const x = a[c], y = b[c];
          if (x == null || y == null) return x == null && y == null ? 0 : ((x == null) === nullsFirst ? -1 : 1);
          return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
        });
      }
      if (lim != null) hit = hit.slice(0, lim);
      if (opts.head) return { data: null, count: hit.length, error: null };
      const data = hit.map(r => proyectar(r, cols));
      if (single || maybe) {
        if (data.length > 1) return { data: null, error: { message: 'más de una fila' } };
        if (!data.length) return maybe ? { data: null, error: null } : { data: null, error: { message: 'no rows' } };
        return { data: data[0], error: null };
      }
      return { data, error: null, count: opts.count ? data.length : null };
    };
    const api = {
      select(c = '*', o = {}) { cols = c; opts = o; return api; },
      eq(c, v) { filtros.push(r => cond(r, c, 'eq', v)); return api; },
      neq(c, v) { filtros.push(r => cond(r, c, 'neq', v)); return api; },
      is(c, v) { filtros.push(r => cond(r, c, 'is', v)); return api; },
      in(c, v) { filtros.push(r => cond(r, c, 'in', v)); return api; },
      not(c, op, v) { if (op !== 'is') throw new Error(`sbFixture: not.${op} no soportado`); filtros.push(r => cond(r, c, 'notis', v)); return api; },
      or(s) { const cs = parseOr(s); filtros.push(r => cs.some(([c, op, v]) => cond(r, c, op, v))); return api; },
      order(c, o = {}) { const asc = o.ascending !== false; orden.push([c, asc, o.nullsFirst ?? !asc]); return api; },
      limit(n) { lim = n; return api; },
      single() { single = true; return api; },
      maybeSingle() { maybe = true; return api; },
      insert() { throw new Error('sbFixture: sólo lectura'); },
      update() { throw new Error('sbFixture: sólo lectura'); },
      delete() { throw new Error('sbFixture: sólo lectura'); },
      then(ok, ko) { return run().then(ok, ko); },
    };
    return api;
  };
  return { from, rpc: () => { throw new Error('sbFixture: rpc no soportada'); } };
}
