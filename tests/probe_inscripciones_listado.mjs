/**
 * Probe — inscripciones.html: listado continuo de todos los turnos (pedido de Fede, fase 2 del 02/10).
 * SIN red y SIN base: monta el inscripciones.html REAL en jsdom (el CDN de supabase-js se corta, initAuth falla sola), le
 * inyecta un `sb` STUB con datos SINTÉTICOS (sin personas reales) y llama loadAll() y los botones reales.
 *
 *   node tests/probe_inscripciones_listado.mjs              # contra el working tree
 *   node tests/probe_inscripciones_listado.mjs --mutantes   # + mutantes (cada uno TIENE que morir)
 *   INSCRIPCIONES_HTML=/ruta/inscripciones.html node tests/…
 *
 *   L1  arranque: el listado (opción "Todos los turnos" elegida), una sección por turno en orden de turno, cada una con su
 *       encabezado (número y nombre del turno, chips) y su conteo
 *   L2  cada sección tiene SÓLO las filas de su turno, en alfabético castellano
 *   L3  turno sin anotados: "Sin inscriptos en este turno."
 *   L4  jockey repetido contado POR TURNO: uno que monta en T1 y T3 no se marca; dos caballos del mismo jockey en T2 sí
 *   L5  "+ Inscribir" de la sección T2 → el INSERT va a T2, el listado se recarga y vuelve a la sección T2
 *   L6  editar una fila de T3 desde el listado → UPDATE con carrera_id T3 y vuelve a la sección T3
 *   L7  borrar una fila de T1 → DELETE de esa fila y vuelve a la sección T1
 *   L8  estado del turno desde la sección → UPDATE de ESA carrera, badge en la sección
 *   L9  "Ver sólo este turno" → vista por turno (encabezado de arriba, una tabla, botón "+ Inscribir SPC")
 *   L10 deep link ?carrera_id= → vista por turno, no el listado
 *   L11 cambiar de reunión → vuelve al listado
 *   L12 el aviso de jockey repetido al guardar cuenta sólo el turno de la inscripción
 *   L13 la vista por turno sigue en el selector (opción de cada turno)
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

// ── datos sintéticos ──────────────────────────────────────────────────────────────────────────
const R1 = 'r1000000-0000-0000-0000-000000000001', R2 = 'r2000000-0000-0000-0000-000000000002';
const T = n => `c${n}000000-0000-0000-0000-00000000000${n}`;
const CARRERAS = {
  [R1]: [1, 2, 3].map(n => ({ id: T(n), reunion_id: R1, numero_turno: n, nombre: `TURNO SINT ${n}`, distancia_metros: 1000 + n * 100,
    tipo_pista: 'tierra', estado: 'abierta', bolsa_total: 100000, distribucion_premios: { 1: 60, 2: 20, 3: 10, 4: 6, 5: 4 },
    condicion_handicap: `Condición sintética ${n}`, condicion_adicional: null, categoria_id: null, categorias_carrera: null })),
  [R2]: [{ id: 'c9000000-0000-0000-0000-000000000009', reunion_id: R2, numero_turno: 1, nombre: 'OTRA REUNION', distancia_metros: 1200,
    tipo_pista: 'tierra', estado: 'abierta', categorias_carrera: null }],
};
const J = { a: 'j1000000-0000-0000-0000-00000000000a', b: 'j2000000-0000-0000-0000-00000000000b' };
const ins = (id, carrera, nombre, jockey, estado = 'inscripto') => ({ id, carrera_id: carrera, spc_id: `s-${id}`, estado, canal: 'manual',
  jockey_titular_id: jockey, caballeriza_id: null, entrenador_id: null, jockey_suplente_id: null, numero_partidor: null,
  certificado_correr: true, spcs: { nombre, revision_pendiente: false }, cargador: null });
const INSCS = [
  ins('i1', T(1), 'ÑANDÚ SINT', J.a), ins('i2', T(1), 'NUBE SINT', null),
  ins('i3', T(2), 'ZORZAL SINT', J.b), ins('i4', T(2), 'ALBA SINT', J.b),
  // T3 sin la monta de i1 repetida: el jockey A monta en T1 y en T3 (no es repetido)
  ins('i5', T(3), 'CEIBO SINT', J.a),
];

function stub() {
  const log = [];
  const tablas = {
    reuniones: [{ id: R1, numero: 10, fecha: '2099-01-01', estado: 'publicada', hipodromos: { nombre: 'H' } },
                { id: R2, numero: 11, fecha: '2099-02-01', estado: 'publicada', hipodromos: { nombre: 'H' } }],
    profesionales: [{ id: J.a, nombre: 'A', apellido: 'SINT', tipo: 'jockey' }, { id: J.b, nombre: 'B', apellido: 'SINT', tipo: 'jockey' }],
    spcs: [], caballerizas: [],
  };
  const qb = (tabla) => {
    const ops = [];
    const p = new Proxy({}, {
      get(_, k) {
        if (k === 'then') {
          log.push({ from: tabla, ops });
          const op = ops.find(([m]) => ['insert', 'update', 'delete'].includes(m));
          let data = null;
          if (!op) {
            const eq = ops.filter(([m]) => m === 'eq').map(([, a]) => a), inn = ops.find(([m]) => m === 'in')?.[1];
            if (tabla === 'carreras') {
              const rid = eq.find(([c]) => c === 'reunion_id')?.[1], id = eq.find(([c]) => c === 'id')?.[1];
              // copias: la página muta sus carreras (estado) y no tiene que contaminar la corrida siguiente
              data = rid ? structuredClone(CARRERAS[rid] || []) : Object.values(CARRERAS).flat().filter(c => c.id === id).map(c => ({ ...structuredClone(c), reuniones: { id: c.reunion_id } }));
              if (ops.some(([m]) => m === 'single')) data = data[0] || null;
            } else if (tabla === 'inscripciones') {
              const car = eq.find(([c]) => c === 'carrera_id')?.[1];
              data = INSCS.filter(i => (car ? i.carrera_id === car : true) && (inn ? inn[1].includes(i.carrera_id) : true)).map(i => ({ ...i }));
            } else data = tablas[tabla] ?? [];
          }
          return (ok, ko) => Promise.resolve({ data, error: null }).then(ok, ko);
        }
        return (...a) => { ops.push([k, a]); return p; };
      },
    });
    return p;
  };
  return { log, sb: { from: qb, rpc: async () => ({ data: null, error: null }), auth: { getSession: async () => ({ data: { session: null } }) } } };
}
const escrituras = (log) => log.filter(x => x.ops.some(([m]) => ['insert', 'update', 'delete'].includes(m)))
  .map(x => { const [m, a] = x.ops.find(([m]) => ['insert', 'update', 'delete'].includes(m)); const eq = x.ops.find(([k]) => k === 'eq');
    return { tabla: x.from, op: m, payload: a[0], eq: eq ? eq[1] : null }; });

const interceptor = () => requestInterceptor((request) => {
  const u = new URL(request.url);
  let cuerpo = '';
  if (u.hostname === 'sigh.com.ar') { try { cuerpo = readFileSync(ROOT + u.pathname.replace(/^\//, ''), 'utf8'); } catch { cuerpo = ''; } }
  return new Response(cuerpo, { headers: { 'Content-Type': 'application/javascript' } });
});
async function montar(html, qs = '') {
  const dom = new JSDOM(html, { url: `https://sigh.com.ar/inscripciones.html${qs}`, runScripts: 'dangerously',
    resources: { interceptors: [interceptor()] }, virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
  await new Promise((r) => dom.window.addEventListener('load', r));
  const w = dom.window;
  w.confirm = () => true;
  w.__scroll = [];
  w.HTMLElement.prototype.scrollIntoView = function () { w.__scroll.push(this.id); };
  w.localStorage.setItem('sgh_active_reunion_id', R1);
  return w;
}
async function arrancar(html, qs = '') {
  const w = await montar(html, qs);
  const s = stub();
  w.__sb = s.sb; w.__toasts = [];
  w.eval(`sb = window.__sb; CLUB_ID = 'CLUB'; currentUser = { rol: 'secretario_carreras' };
    toast = (m, t) => window.__toasts.push([m, t]);`);
  await w.eval('loadAll()');
  return { w, log: s.log, d: w.document };
}
const sec = (d, n) => d.getElementById(`turno-sec-${T(n)}`);
const nombres = (el) => [...(el?.querySelectorAll('.spc-name') || [])].map(x => x.textContent);

async function correr(html) {
  const res = [];
  const ok = (t, c, n = '') => { res.push({ t, s: c ? '✅' : '❌', n }); return c; };
  try {
    // L1..L4: arranque
    const { w, log, d } = await arrancar(html);
    const secciones = [...d.querySelectorAll('section.turno-sec')];
    ok('L1 arranque: el listado con "Todos los turnos" elegido, una sección por turno en orden, con encabezado y conteo',
      d.getElementById('sel-carrera').value === '__todos__' && secciones.map(x => x.id).join() === [1, 2, 3].map(n => `turno-sec-${T(n)}`).join()
      && [1, 2, 3].every(n => sec(d, n).querySelector('.carrera-header .carrera-num')?.textContent === String(n)
        && sec(d, n).querySelector('.carrera-name')?.textContent === `TURNO SINT ${n}` && sec(d, n).querySelectorAll('.carrera-chips .chip').length > 0)
      && sec(d, 2).querySelector('.turno-sec-count')?.textContent === '2 inscriptos',
      JSON.stringify({ sel: d.getElementById('sel-carrera').value, secs: secciones.map(x => x.id) }));
    ok('L2 cada sección tiene sólo sus filas, en alfabético castellano (Ñ después de N)',
      nombres(sec(d, 1)).join() === 'NUBE SINT,ÑANDÚ SINT' && nombres(sec(d, 2)).join() === 'ALBA SINT,ZORZAL SINT' && nombres(sec(d, 3)).join() === 'CEIBO SINT',
      JSON.stringify([1, 2, 3].map(n => nombres(sec(d, n)))));
    // L3 con un turno vacío: T3 sin inscripciones
    const dup = (n) => sec(d, n).querySelectorAll('tr.jockey-duplicado').length;
    ok('L4 jockey repetido por turno: el que monta en T1 y T3 no se marca; los dos de T2 sí', dup(1) === 0 && dup(3) === 0 && dup(2) === 2,
      JSON.stringify({ t1: dup(1), t2: dup(2), t3: dup(3) }));

    // L5: + Inscribir en T2
    log.length = 0; w.__scroll.length = 0;
    sec(d, 2).querySelector('.btn-inscribir-turno').click();
    d.getElementById('f-spc-id').value = 's-nuevo';
    await w.eval('saveRecord()');
    const e5 = escrituras(log);
    ok('L5 "+ Inscribir" de la sección T2: INSERT con carrera_id T2, recarga el listado y vuelve a T2',
      e5.length === 1 && e5[0].op === 'insert' && e5[0].payload.carrera_id === T(2) && !!sec(d, 2) && w.__scroll.at(-1) === `turno-sec-${T(2)}`,
      JSON.stringify({ e5, scroll: w.__scroll }));

    // L6: editar fila de T3 desde el listado
    log.length = 0; w.__scroll.length = 0;
    sec(d, 3).querySelector('.btn-edit').click();
    await w.eval('saveRecord()');
    const e6 = escrituras(log);
    ok('L6 editar una fila de T3 desde el listado: UPDATE de esa fila con carrera_id T3 y vuelve a T3',
      e6.length === 1 && e6[0].op === 'update' && e6[0].payload.carrera_id === T(3) && e6[0].eq?.[1] === 'i5' && w.__scroll.at(-1) === `turno-sec-${T(3)}`,
      JSON.stringify({ e6, scroll: w.__scroll }));

    // L7: borrar fila de T1
    log.length = 0; w.__scroll.length = 0;
    sec(d, 1).querySelector('.btn-delete').click();
    await new Promise(r => setTimeout(r, 30));
    const e7 = escrituras(log);
    ok('L7 borrar una fila de T1: DELETE de esa fila y vuelve a T1',
      e7.length === 1 && e7[0].op === 'delete' && ['i1', 'i2'].includes(e7[0].eq?.[1]) && w.__scroll.at(-1) === `turno-sec-${T(1)}`,
      JSON.stringify({ e7, scroll: w.__scroll }));

    // L8: estado del turno desde la sección
    log.length = 0;
    await w.eval(`onEstadoCarreraSeccion('${T(2)}', 'anulada')`);
    const e8 = escrituras(log);
    ok('L8 estado del turno desde la sección: UPDATE de esa carrera y badge ANULADA en la sección',
      e8.length === 1 && e8[0].tabla === 'carreras' && e8[0].payload.estado === 'anulada' && e8[0].eq?.[1] === T(2)
      && /ANULADA/.test(sec(d, 2).querySelector('.turno-sec-acciones')?.textContent || ''), JSON.stringify(e8));

    // L12: aviso de jockey repetido al guardar, sólo el turno
    w.__toasts.length = 0;
    w.eval(`avisarJockeyRepetido('${J.a}', '${T(1)}')`);
    const sinAviso = w.__toasts.length === 0;
    w.eval(`avisarJockeyRepetido('${J.b}', '${T(2)}')`);
    ok('L12 aviso al guardar cuenta sólo el turno: el jockey de T1+T3 no avisa; el doble de T2 sí',
      sinAviso && w.__toasts.length === 1 && /queda en 2 caballos/.test(w.__toasts[0][0]), JSON.stringify(w.__toasts));

    // L9: ver sólo este turno
    sec(d, 1).querySelector('.turno-sec-acciones .btn-outline').click();
    await new Promise(r => setTimeout(r, 30));
    ok('L9 "Ver sólo este turno": vista por turno (encabezado arriba, sin secciones, "+ Inscribir SPC" visible)',
      d.getElementById('sel-carrera').value === T(1) && !d.querySelector('section.turno-sec') && d.getElementById('carrera-header').style.display === 'flex'
      && d.getElementById('btn-nueva').style.display === '' && !!d.querySelector('#list-container table'),
      JSON.stringify({ sel: d.getElementById('sel-carrera').value, secs: d.querySelectorAll('section.turno-sec').length }));
    ok('L13 la vista por turno sigue en el selector (opción por cada turno, más "Todos los turnos")',
      [...d.getElementById('sel-carrera').options].map(o => o.value).join() === ['__todos__', T(1), T(2), T(3)].join());

    // L11: cambiar de reunión → listado de la otra
    d.getElementById('sel-reunion').value = R2;
    await w.eval('cambiarReunion()');
    ok('L11 cambiar de reunión vuelve al listado (de la reunión nueva)',
      d.getElementById('sel-carrera').value === '__todos__' && d.querySelectorAll('section.turno-sec').length === 1 && !!d.getElementById('turno-sec-c9000000-0000-0000-0000-000000000009'));

    // L3: turno vacío (T3 en una reunión sin inscripciones para él)
    INSCS.splice(INSCS.findIndex(i => i.id === 'i5'), 1);
    d.getElementById('sel-reunion').value = R1;
    await w.eval('cambiarReunion()');
    ok('L3 turno sin anotados: la sección aparece con "Sin inscriptos en este turno."',
      /Sin inscriptos en este turno/.test(sec(d, 3)?.textContent || '') && sec(d, 3).querySelector('.turno-sec-count')?.textContent === '0 inscriptos');
    INSCS.push(ins('i5', T(3), 'CEIBO SINT', J.a));

    // L10: deep link
    const dl = await arrancar(html, `?carrera_id=${T(2)}`);
    ok('L10 deep link ?carrera_id: abre ese turno en la vista por turno, no el listado',
      dl.d.getElementById('sel-carrera').value === T(2) && !dl.d.querySelector('section.turno-sec') && nombres(dl.d.getElementById('list-container')).join() === 'ALBA SINT,ZORZAL SINT');
  } catch (e) { ok('X  excepción en los casos (cuenta como fallo)', false, String(e?.stack || e).split('\n').slice(0, 3).join(' ')); }
  return res;
}

const BASE = readFileSync(ARCHIVO, 'utf8');
const base = await correr(BASE);
for (const x of base) console.log(`${x.s} ${x.t}${x.s === '❌' && x.n ? '  → ' + x.n.slice(0, 400) : ''}`);
const fails = base.filter(x => x.s === '❌').length;
console.log(`\n${base.length - fails}/${base.length} asserts OK  (${ARCHIVO})`);

const MUT = [
  ['MU1 el arranque vuelve al primer turno', `      await onReunionChange();\n      await mostrarTodos();`, `      await onReunionChange();\n      document.getElementById('sel-carrera').value = document.getElementById('sel-carrera').options[1]?.value; currentCarreraId = document.getElementById('sel-carrera').value; await onCarreraChange();`],
  ['MU2 secciones sin el encabezado del turno', `      <div class="carrera-header">\${htmlEncabezadoCarrera(c)}`, `      <div class="carrera-header">`],
  ['MU3 jockey repetido contado sobre toda la reunión', `  const jockeyCount = conteoJockeysActivos(lista);`, `  const jockeyCount = conteoJockeysActivos(inscripciones);`],
  ['MU4 las secciones muestran todas las filas', `    const lista = inscripciones.filter(i => i.carrera_id === c.id);`, `    const lista = inscripciones;`],
  ['MU5 + Inscribir no fija el turno', `function inscribirEnTurno(carreraId) {\n  currentCarreraId = carreraId;`, `function inscribirEnTurno(carreraId) {`],
  ['MU6 después de guardar no vuelve a la sección', `    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });`, ``],
  ['MU7 guardar recarga la vista por turno aunque esté el listado', `  return modoTodos ? loadTodos() : loadInscripciones();`, `  return loadInscripciones();`],
  ['MU8 borrar no recuerda el turno', `  volverATurno = turno;\n`, ``],
  ['MU9 estado de la sección no actualiza la carrera en memoria', `  if (c) c.estado = nuevoEstado;\n`, ``],
  ['MU10 aviso al guardar cuenta toda la reunión', `  const lista = carreraId ? inscripciones.filter(i => i.carrera_id === carreraId) : inscripciones;`, `  const lista = inscripciones;`],
  ['MU11 cambiar de reunión no vuelve al listado', `  if (document.getElementById('sel-reunion').value) await mostrarTodos();`, ``],
  ['MU12 sin la opción "Todos los turnos" en el selector', "  selC.innerHTML = `<option value=\"${TODOS}\">— Todos los turnos —</option>` +", "  selC.innerHTML = '' +"],
  ['MU13 secciones sin orden alfabético', `  inscripciones = (data || []).sort((a, b) =>\n    (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '', 'es'));\n  renderTodos();`, `  inscripciones = (data || []);\n  renderTodos();`],
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
