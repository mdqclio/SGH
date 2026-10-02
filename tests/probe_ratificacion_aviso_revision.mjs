/**
 * Probe — ratificacion.html: AVISO al ratificar un SPC pendiente de revisión (alta desde el portal que la secretaría
 * todavía no revisó en Stud Book). Es aviso, no bloqueo: badge en la fila + confirmación al ratificar.
 * SIN red y SIN base: monta el ratificacion.html REAL en jsdom (el CDN de supabase-js se corta, initAuth falla sola),
 * le inyecta un `sb` STUB y datos SINTÉTICOS, y usa renderAll / ratificar / init reales.
 *
 *   node tests/probe_ratificacion_aviso_revision.mjs              # contra el working tree
 *   node tests/probe_ratificacion_aviso_revision.mjs --mutantes   # + mutantes (cada uno TIENE que morir)
 *   RATIFICACION_HTML=/ruta/ratificacion.html node tests/…        # contra otro archivo
 *
 *   A1  fila de un SPC pendiente: badge "⚠ Por revisar" con los motivos en el title
 *   A2  fila de un SPC normal: sin badge
 *   A3  nombre hostil (<img onerror>) se muestra como texto, sin crear elementos
 *   B1  ratificar un pendiente y CANCELAR → no se escribe nada
 *   B2  ratificar un pendiente y ACEPTAR → update estado 'ratificado'; el mensaje nombra el caballo y el motivo
 *   B3  ratificar un normal → sin confirmación, update
 *   B4  pendiente sin motivos → el mensaje dice "alta desde el portal"
 *   C1  init pide revision_pendiente y revision_motivos de spcs
 */
import { readFileSync } from 'node:fs';
import jsdom from 'jsdom';
const { JSDOM, VirtualConsole, requestInterceptor } = jsdom;

const ROOT = new URL('..', import.meta.url).pathname;
process.on('unhandledRejection', (e) => {
  if (/supabase is not defined/.test(String(e?.message ?? e))) return;
  console.error('unhandledRejection:', e); process.exit(3);
});
const MUTANTES = process.argv.includes('--mutantes');
const ARCHIVO = process.env.RATIFICACION_HTML || ROOT + 'ratificacion.html';

function stub() {
  const log = [];
  const tablas = {};
  const qb = (tabla) => {
    const ops = [];
    const p = new Proxy({}, {
      get(_, k) {
        if (k === 'then') {
          log.push({ from: tabla, ops });
          const single = ops.some(([m]) => m === 'single' || m === 'maybeSingle');
          const data = tablas[tabla] ?? (single ? null : []);
          return (ok, ko) => Promise.resolve({ data, error: null, count: 0 }).then(ok, ko);
        }
        return (...a) => { ops.push([k, a]); return p; };
      },
    });
    return p;
  };
  return { log, tablas, sb: { from: qb, rpc: async () => ({ data: null, error: null }), auth: { getSession: async () => ({ data: { session: null } }) } } };
}
const interceptor = () => requestInterceptor((request) => {
  const u = new URL(request.url);
  let cuerpo = '';
  if (u.hostname === 'sigh.com.ar') { try { cuerpo = readFileSync(ROOT + u.pathname.replace(/^\//, ''), 'utf8'); } catch { cuerpo = ''; } }
  return new Response(cuerpo, { headers: { 'Content-Type': 'application/javascript' } });
});
async function montar(html) {
  const vc = new VirtualConsole(); const errJs = []; vc.on('jsdomError', (e) => errJs.push(String(e.message || e)));
  const dom = new JSDOM(html, { url: 'https://sigh.com.ar/ratificacion.html', runScripts: 'dangerously',
    resources: { interceptors: [interceptor()] }, virtualConsole: vc, pretendToBeVisual: true });
  await new Promise((r) => dom.window.addEventListener('load', r));
  dom.window.alert = () => {};
  return { w: dom.window, errJs };
}
const tick = () => new Promise((r) => setTimeout(r, 20));

// ── datos sintéticos ──
const CAR = 'c0000000-0000-0000-0000-000000000001';
const SPC = {
  pend:  { id: 'a0000000-0000-0000-0000-000000000001', nombre: 'POTRO DE PRUEBA', revision_pendiente: true, revision_motivos: ['edad > 12 (14 años según el Stud Book)', 'homónimo en el padrón'] },
  sinM:  { id: 'a0000000-0000-0000-0000-000000000002', nombre: 'YEGUA SIN MOTIVO', revision_pendiente: true, revision_motivos: [] },
  norm:  { id: 'a0000000-0000-0000-0000-000000000003', nombre: 'CABALLO REVISADO', revision_pendiente: false, revision_motivos: null },
  host:  { id: 'a0000000-0000-0000-0000-000000000004', nombre: '<img src=x onerror="window.__pwn=1">', revision_pendiente: true, revision_motivos: ['"><b>x</b>'] },
};
const INSC = [
  { id: 'i1', carrera_id: CAR, spc_id: SPC.pend.id, estado: 'inscripto', jockey_titular_id: 'j1', caballeriza_id: null, numero_partidor: null },
  { id: 'i2', carrera_id: CAR, spc_id: SPC.sinM.id, estado: 'inscripto', jockey_titular_id: 'j2', caballeriza_id: null, numero_partidor: null },
  { id: 'i3', carrera_id: CAR, spc_id: SPC.norm.id, estado: 'inscripto', jockey_titular_id: 'j3', caballeriza_id: null, numero_partidor: null },
  { id: 'i4', carrera_id: CAR, spc_id: SPC.host.id, estado: 'inscripto', jockey_titular_id: 'j4', caballeriza_id: null, numero_partidor: null },
];
const CARRERA = { id: CAR, numero_turno: 1, estado: 'abierta', distancia_metros: 1000 };

async function correr(html) {
  const res = [];
  const ok = (t, c, n = '') => { res.push({ t, s: c ? '✅' : '❌', n }); return c; };
  const { w, errJs } = await montar(html);
  const d = w.document;
  const s = stub();
  w.__sb = s.sb; w.__datos = { spcs: Object.values(SPC), insc: INSC, car: CARRERA };
  const confirms = []; let respuesta = true;
  w.confirm = (m) => { confirms.push(m); return respuesta; };
  try {
    w.eval(`sb = window.__sb; spcs = window.__datos.spcs; isCerrada = false;
      toast = () => {}; updateCounter = () => {};
      renderAll([window.__datos.car], window.__datos.insc);`);
  } catch (e) { ok('render sin excepción', false, String(e.message)); }
  const fila = (id) => d.getElementById(`row-${id}`);
  const badge = (id) => fila(id)?.querySelector('.badge-revision');

  ok('A1) pendiente: badge "⚠ Por revisar" con los motivos en el title',
    badge('i1')?.textContent.trim() === '⚠ Por revisar' && /edad > 12/.test(badge('i1')?.title || '') && /homónimo/.test(badge('i1')?.title || ''), badge('i1')?.outerHTML);
  ok('A2) normal: sin badge', !!fila('i3') && !badge('i3'), fila('i3')?.innerHTML.slice(0, 200));
  ok('A3) nombre y motivo hostiles se muestran como texto (sin <img>/<b> creados, sin ejecutar)',
    !!fila('i4') && !fila('i4').querySelector('img') && !fila('i4').querySelector('b') && w.__pwn !== 1
    && fila('i4').querySelector('.spc-name')?.textContent === SPC.host.nombre && /"><b>x<\/b>/.test(badge('i4')?.title || ''), fila('i4')?.innerHTML.slice(0, 300));

  const updates = () => s.log.filter((l) => l.from === 'inscripciones' && l.ops.some(([m]) => m === 'update'));
  respuesta = false; confirms.length = 0;
  await w.eval(`ratificar('i1')`); await tick();
  ok('B1) pendiente + Cancelar → se pregunta y no se escribe nada', confirms.length === 1 && updates().length === 0, JSON.stringify([confirms.length, updates().length]));
  respuesta = true; confirms.length = 0;
  await w.eval(`ratificar('i1')`); await tick();
  const u1 = updates().at(-1);
  ok('B2) pendiente + Aceptar → update a ratificado; el mensaje nombra caballo y motivo',
    confirms.length === 1 && /POTRO DE PRUEBA/.test(confirms[0]) && /edad > 12/.test(confirms[0]) && /Ratificar igual/.test(confirms[0])
    && u1?.ops.find(([m]) => m === 'update')?.[1]?.[0]?.estado === 'ratificado' && JSON.stringify(u1.ops.find(([m]) => m === 'eq')?.[1]) === '["id","i1"]',
    JSON.stringify([confirms, u1?.ops]));
  confirms.length = 0; const n0 = updates().length;
  await w.eval(`ratificar('i3')`); await tick();
  ok('B3) normal → sin confirmación, update', confirms.length === 0 && updates().length === n0 + 1, JSON.stringify([confirms, updates().length - n0]));
  confirms.length = 0;
  await w.eval(`ratificar('i2')`); await tick();
  ok('B4) pendiente sin motivos → "alta desde el portal"', confirms.length === 1 && /alta desde el portal/.test(confirms[0]), JSON.stringify(confirms));

  s.log.length = 0;
  try { await w.eval(`init()`); } catch (_) { /* reuniones vacías */ }
  await tick();
  const selSpcs = s.log.find((l) => l.from === 'spcs')?.ops.find(([m]) => m === 'select')?.[1]?.[0] || '';
  ok('C1) init pide revision_pendiente y revision_motivos de spcs', /revision_pendiente/.test(selSpcs) && /revision_motivos/.test(selSpcs), selSpcs);
  ok('E) sin errores de JS', errJs.filter((e) => !/supabase is not defined|Not implemented/.test(e)).length === 0, errJs.join(' | ').slice(0, 300));
  return res;
}

const base = readFileSync(ARCHIVO, 'utf8');
const res = await correr(base);
for (const x of res) console.log(`${x.s} ${x.t}${x.s === '❌' && x.n ? '  → ' + x.n : ''}`);
const fails = res.filter((x) => x.s === '❌').length;
console.log(`\n${res.length - fails}/${res.length} checks OK`);

let vivos = 0;
if (MUTANTES) {
  const M = [
    ['MU1 sin confirmación al ratificar', (h) => h.replace(/\n  if \(spc\?\.revision_pendiente && !confirm\([^\n]*\n/, '\n')],
    ['MU2 sin badge en la fila', (h) => h.replace("${spc?.revision_pendiente?badgeRevision(spc):''}", '')],
    ['MU3 init no pide las columnas de revisión', (h) => h.replace("select('id,nombre,revision_pendiente,revision_motivos')", "select('id,nombre')")],
    ['MU4 nombre sin escapar', (h) => h.replace('${escapeHtml(spc?.nombre||i.spc_id)}', '${spc?.nombre||i.spc_id}')],
    ['MU5 motivos sin escapar en el title', (h) => h.replace("title=\"${escapeHtml('Pendiente de revisión en Stud Book (SPCs): ' + motivosRevision(spc))}\"", "title=\"Pendiente de revisión en Stud Book (SPCs): ${motivosRevision(spc)}\"")],
    ['MU6 confirma siempre (también los revisados)', (h) => h.replace('if (spc?.revision_pendiente && !confirm(', 'if (!confirm(')],
    ['MU7 sin el texto por defecto', (h) => h.replace(": 'alta desde el portal';", ": '';")],
  ];
  console.log('\n── mutantes ──');
  for (const [n, f] of M) {
    const h = f(base);
    if (h === base) { console.log(`⚠ ${n}: el reemplazo no aplicó`); vivos++; continue; }
    const r = await correr(h);
    const muere = r.some((x) => x.s === '❌');
    if (!muere) vivos++;
    console.log(`${muere ? '💀 muere' : '🟢 VIVO '} ${n}`);
  }
  console.log(`mutantes: ${M.length - vivos}/${M.length} muertos`);
}
process.exit(fails || vivos ? 1 : 0);
