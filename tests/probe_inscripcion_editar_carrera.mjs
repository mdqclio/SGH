/**
 * Probe — inscripciones.html: al EDITAR, saveRecord guarda el turno de la FILA, no el del select.
 * SIN Supabase y SIN red: monta el HTML REAL en jsdom (el CDN de supabase-js se corta, initAuth falla sola),
 * le inyecta un `sb` STUB que registra cada llamada, y llama openModal / saveRecord reales.
 *
 *   node tests/probe_inscripcion_editar_carrera.mjs              # contra el working tree
 *   node tests/probe_inscripcion_editar_carrera.mjs --mutantes   # + mutantes (cada uno TIENE que morir)
 *   INSCRIPCIONES_HTML=/ruta/inscripciones.html node tests/…     # contra otro archivo (p. ej. el de main)
 *
 * Motivo: saveRecord armaba `carrera_id: currentCarreraId` también al editar. Con otro turno elegido en el
 * select (o con un modo "todos los turnos", donde no hay uno), la edición movía la inscripción a ese turno
 * sin avisar. Informe docs/diagnosticos/2026-10-02_inscriptos-todos-los-turnos-fase1.md (reports), § 3.
 *
 *   E1  editar una fila de T3 con T1 elegido → UPDATE … eq('id', fila) con carrera_id = T3
 *   E2  editar una fila de T3 sin turno elegido (currentCarreraId null) → UPDATE igual, con carrera_id = T3
 *   E3  alta (openModal() sin fila) después de una edición, con T1 elegido → INSERT con carrera_id = T1
 *       (el hidden de la edición anterior no se arrastra)
 *   E4  alta sin turno elegido → no escribe nada y avisa "Seleccionar un turno"
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
const ARCHIVO = process.env.INSCRIPCIONES_HTML || ROOT + 'inscripciones.html';
const T1 = 'c1000000-0000-0000-0000-000000000001', T3 = 'c1000000-0000-0000-0000-000000000003';
const FILA = 'd1000000-0000-0000-0000-000000000001', SPC = 'e1000000-0000-0000-0000-000000000001';

// stub de supabase-js: registra cada cadena from(...).op(...) cuando se la espera
function stub() {
  const log = [];
  const qb = (tabla) => {
    const ops = [];
    const p = new Proxy({}, {
      get(_, k) {
        if (k === 'then') { log.push({ from: tabla, ops }); return (ok, ko) => Promise.resolve({ data: [], error: null }).then(ok, ko); }
        return (...a) => { ops.push([k, a]); return p; };
      },
    });
    return p;
  };
  return { log, from: qb, rpc: async () => ({ data: [], error: null }), auth: { getSession: async () => ({ data: { session: null } }) } };
}

const interceptor = () => requestInterceptor((request) => {
  const u = new URL(request.url);
  let cuerpo = '';
  if (u.hostname === 'sigh.com.ar') { try { cuerpo = readFileSync(ROOT + u.pathname.replace(/^\//, ''), 'utf8'); } catch { cuerpo = ''; } }
  return new Response(cuerpo, { headers: { 'Content-Type': 'application/javascript' } });
});
async function montar(html) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { url: 'https://sigh.com.ar/inscripciones.html', runScripts: 'dangerously',
    resources: { interceptors: [interceptor()] }, virtualConsole: vc, pretendToBeVisual: true });
  await new Promise((r) => dom.window.addEventListener('load', r));
  dom.window.confirm = () => true;
  return dom.window;
}

// escrituras a inscripciones (insert/update), con su payload y su filtro
const escrituras = (log) => log.filter((x) => x.from === 'inscripciones')
  .map((x) => {
    const op = x.ops.find(([k]) => k === 'insert' || k === 'update');
    if (!op) return null;
    const eq = x.ops.find(([k]) => k === 'eq');
    return { op: op[0], carrera_id: op[1][0]?.carrera_id, eq: eq ? eq[1] : null };
  }).filter(Boolean);

async function correr(html) {
  const res = [];
  const ok = (t, c, n = '') => { res.push({ t, s: c ? '✅' : '❌', n }); return c; };
  try {
    const w = await montar(html);
    const s = stub();
    w.__sb = s;
    const toasts = [];
    w.__toasts = toasts;
    w.eval(`sb = window.__sb; currentUser = { rol: 'secretario_carreras' };
      toast = (m, t) => window.__toasts.push([m, t]);
      inscripciones = []; spcs = []; caballerizas = []; profesionales = [];`);
    const fila = { id: FILA, carrera_id: T3, spc_id: SPC, caballeriza_id: null, entrenador_id: null, jockey_titular_id: null,
      jockey_suplente_id: null, estado: 'inscripto', certificado_correr: false };
    // openModal no carga el SPC si no está en el cache: se completa el hidden como lo haría la pantalla
    const editar = async (actual) => {
      s.log.length = 0;
      w.eval(`currentCarreraId = ${actual ? `'${actual}'` : 'null'}; openModal(${JSON.stringify(fila)});
        document.getElementById('f-spc-id').value = '${SPC}';`);
      await w.eval('saveRecord()');
      return escrituras(s.log);
    };
    const alta = async (actual) => {
      s.log.length = 0; toasts.length = 0;
      w.eval(`currentCarreraId = ${actual ? `'${actual}'` : 'null'}; openModal();
        document.getElementById('f-spc-id').value = '${SPC}';`);
      await w.eval('saveRecord()');
      return escrituras(s.log);
    };

    const e1 = await editar(T1);
    ok('E1 editar fila de T3 con T1 elegido → UPDATE de esa fila con carrera_id T3',
      e1.length === 1 && e1[0].op === 'update' && e1[0].carrera_id === T3 && e1[0].eq?.[0] === 'id' && e1[0].eq?.[1] === FILA, JSON.stringify(e1));
    const e2 = await editar(null);
    ok('E2 editar fila de T3 sin turno elegido → UPDATE igual, carrera_id T3',
      e2.length === 1 && e2[0].op === 'update' && e2[0].carrera_id === T3, JSON.stringify(e2));
    const e3 = await alta(T1);
    ok('E3 alta después de una edición, con T1 elegido → INSERT con carrera_id T1',
      e3.length === 1 && e3[0].op === 'insert' && e3[0].carrera_id === T1, JSON.stringify(e3));
    const e4 = await alta(null);
    ok('E4 alta sin turno elegido → no escribe y avisa "Seleccionar un turno"',
      e4.length === 0 && toasts.some(([m, t]) => t === 'error' && /Seleccionar un turno/.test(m)), JSON.stringify({ e4, toasts }));
  } catch (e) { ok('X  excepción en los casos (cuenta como fallo)', false, String(e?.stack || e).split('\n').slice(0, 2).join(' ')); }
  return res;
}

const BASE = readFileSync(ARCHIVO, 'utf8');
const base = await correr(BASE);
for (const x of base) console.log(`${x.s} ${x.t}${x.s === '❌' && x.n ? '  → ' + x.n : ''}`);
const fails = base.filter((x) => x.s === '❌').length;
console.log(`\n${base.length - fails}/${base.length} asserts OK  (${ARCHIVO})`);

const MUT = [
  ['MU1 saveRecord vuelve a usar currentCarreraId al editar',
    `  const carreraId = id ? document.getElementById('f-carrera-id').value : currentCarreraId;`,
    `  const carreraId = currentCarreraId;`],
  ['MU2 openModal no guarda el turno de la fila',
    `  document.getElementById('f-carrera-id').value = rec?.carrera_id||'';\n`, ``],
  ['MU3 el payload ignora carreraId',
    `    carrera_id: carreraId,`, `    carrera_id: currentCarreraId,`],
  ['MU4 alta sin chequeo de turno',
    `  if (!carreraId) { toast('Seleccionar un turno','error'); return; }\n`, ``],
];
let vivos = 0;
if (MUTANTES) {
  console.log('\n── mutantes ──');
  for (const [nombre, de, a] of MUT) {
    if (BASE.split(de).length !== 2) { console.log(`⚠️  ${nombre}: ancla no única/ausente — mutante roto`); vivos++; continue; }
    const r = await correr(BASE.replace(de, a));
    const muertos = r.filter((x) => x.s === '❌').map((x) => x.t.split(' ')[0]);
    if (!muertos.length) vivos++;
    console.log(`${muertos.length ? '✅ muere' : '❌ VIVE '} ${nombre}${muertos.length ? '  ← ' + [...new Set(muertos)].join(', ') : ''}`);
  }
  console.log(`\nmutantes: ${MUT.length - vivos}/${MUT.length} muertos`);
}
process.exit(fails || vivos ? 1 : 0);
