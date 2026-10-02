/**
 * Probe — inscripciones.html: alta del caballo desde el Stud Book en el modal "Inscribir SPC" (02/10).
 * SIN Supabase y SIN red: monta el HTML REAL en jsdom (el CDN de supabase-js se corta, initAuth falla sola)
 * y le inyecta un `sb` STUB que registra cada llamada. Se llaman las funciones reales y se clickean los
 * botones reales. Patrón de tests/probe_portal_alta_spc_ui.mjs.
 *
 *   node tests/probe_inscripciones_alta_studbook.mjs              # contra el working tree
 *   node tests/probe_inscripciones_alta_studbook.mjs --mutantes   # + mutantes de pantalla (cada uno TIENE que morir)
 *   INSCRIPCIONES_HTML=<ruta> node tests/probe_inscripciones_alta_studbook.mjs
 *
 *   I1  buscador del modal: sin resultados en el padrón → opción "🔎 Buscar «WAVE» en el Stud Book"; con
 *       resultados también (al pie); con 2 letras, no
 *   I2  la opción llama studbook-buscar {term}; pregunta al padrón por studbook_id; candidato con nombre hostil
 *       escapado; el que ya está en el padrón ofrece "usarlo" y el otro "traerlo"
 *   I3  "Ya está en el padrón — usarlo" → NO llama a traer; queda seleccionado con su caballeriza
 *   I4  "Es este — traerlo" → invoke con SÓLO {accion, sb_id, nombre, carrera_id} (el navegador no manda la
 *       ficha), carrera = turno elegido; queda seleccionado; NO inscribe solo
 *   I5  motivos devueltos (homónimo / edad > 12) → aviso (toast warning) DESPUÉS de crear
 *   I6  traer rechazado (422) → el mensaje de la RPC en pantalla, nada seleccionado
 *   I7  Stud Book caído (502) al buscar → "El Stud Book no responde ahora…"
 *   I8  editando una inscripción: traer usa el turno de la FILA, no el del select
 *   I9  abrir el modal limpia los candidatos de la vez anterior
 *   I10 alta sin turno elegido → "Seleccionar un turno" y no llama a traer
 *   I11 guardar después de traer → INSERT en inscripciones con el spc_id traído (camino de siempre)
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
const RUTA = process.env.INSCRIPCIONES_HTML || ROOT + 'inscripciones.html';
const T_ELEGIDO = 'b1000000-0000-0000-0000-000000000001', T_FILA = 'b1000000-0000-0000-0000-000000000009';
const HOSTIL = '<img id="xss-sb" src=x onerror="window.__pwn=1">WAVE';

function stub(resp) {
  const log = [];
  const qb = (tabla) => {
    const q = { tabla, ops: [] };
    const p = new Proxy({}, {
      get(_, k) {
        if (k === 'then') {
          log.push({ from: tabla, ops: q.ops });
          const r = (resp.from?.[tabla]?.(q.ops)) ?? { data: [], error: null };
          return (ok, ko) => Promise.resolve(r).then(ok, ko);
        }
        return (...a) => { q.ops.push([k, a]); return p; };
      },
    });
    return p;
  };
  return {
    log, from: qb,
    rpc: async (fn, args) => { log.push({ rpc: fn, args }); return { data: [], error: null }; },
    functions: { invoke: async (fn, opts) => { log.push({ invoke: fn, body: opts?.body }); return resp.invoke(opts?.body); } },
    auth: { getSession: async () => ({ data: { session: null } }) },
  };
}
const fnError = (status, body) => ({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { status, json: async () => body } } });

const interceptor = () => requestInterceptor((request) => {
  const u = new URL(request.url);
  let cuerpo = '';
  if (u.hostname === 'sigh.com.ar') { try { cuerpo = readFileSync(ROOT + u.pathname.replace(/^\//, ''), 'utf8'); } catch { cuerpo = ''; } }
  return new Response(cuerpo, { headers: { 'Content-Type': 'application/javascript' } });
});
async function montar(html) {
  const errores = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errores.push(String(e.message || e)));
  const dom = new JSDOM(html, { url: 'https://sigh.com.ar/inscripciones.html', runScripts: 'dangerously',
    resources: { interceptors: [interceptor()] }, virtualConsole: vc, pretendToBeVisual: true });
  await new Promise((r) => dom.window.addEventListener('load', r));
  dom.window.confirm = () => true;
  return { w: dom.window, d: dom.window.document, errores };
}
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

async function correr(src) {
  const res = [];
  const ok = (t, c, n = '') => { res.push({ t, s: c ? '✅' : '❌', n }); return c; };
  try { await casos(src, ok); } catch (e) { ok('X  excepción en los casos (cuenta como fallo)', false, String(e?.stack || e).split('\n').slice(0, 2).join(' ')); }
  return res;
}

async function casos(src, ok) {
  const { w, d } = await montar(src);
  let modo = { buscar: 'ok', traer: 'ok', padron: [] };
  const s = stub({
    invoke: (body) => {
      if (body.accion !== 'traer') {
        if (modo.buscar === 'caido') return fnError(502, { ok: false, error: 'studbook_no_disponible', detalle: 'studbook HTTP 503' });
        return { data: { ok: true, exactos: [
          { sb_id: '397805', nombre: HOSTIL, fecha_nacimiento: '2017-08-08', sexo: 'macho', color: 'Zaino', padrillo_nombre: 'Remote (GB)', madre_nombre: 'Holiday Wave', alertas: [] },
          { sb_id: '111', nombre: 'YA CARGADO', fecha_nacimiento: '2020-08-08', sexo: 'hembra', padrillo_nombre: 'P', madre_nombre: 'M', alertas: [] },
        ], parciales: [] }, error: null };
      }
      if (modo.traer === 'rechazo') return fnError(422, { ok: false, error: 'rechazado', detalle: 'Ese caballo ya está cargado más de una vez en el padrón. Buscalo por nombre en la lista o avisale a la secretaría.' });
      if (modo.traer === 'motivos') return { data: { ok: true, spc_id: 'spc-nuevo', ya_existia: false, revision_motivos: ['homónimo de WAVE RIMOUT (nac. 08/08/2017, id x)'], nombre: 'WAVE RIMOUT' }, error: null };
      return { data: { ok: true, spc_id: 'spc-nuevo', ya_existia: false, revision_motivos: null, nombre: 'WAVE RIMOUT' }, error: null };
    },
    from: {
      spcs: (ops) => {
        const ilike = ops.find(([k]) => k === 'ilike');
        if (ilike) return { data: modo.padron, error: null };
        if (ops.find(([k, a]) => k === 'in' && a[0] === 'studbook_id')) {
          return { data: [{ id: 'spc-111', nombre: 'YA CARGADO', studbook_id: '111', estado: 'activo', entrenador_id: null, caballeriza_id: 'cab-1', certificado_correr: true }], error: null };
        }
        return { data: [], error: null };
      },
      inscripciones: () => ({ data: null, error: null }),
    },
  });
  w.__sb = s;
  w.eval(`sb = window.__sb; currentCarreraId = '${T_ELEGIDO}';
    recargarInscripciones = async () => {}; avisarJockeyRepetido = () => {};`);
  const cab = d.getElementById('f-caballeriza');
  cab.innerHTML = '<option value="">—</option><option value="cab-1">STUD</option>';
  const invocaciones = () => s.log.filter((x) => x.invoke);
  const toasts = () => [...d.querySelectorAll('#toast-container .toast')].map((t) => `${t.className}|${t.textContent}`);
  const tipear = async (q) => { d.getElementById('spc-search-input').value = q; w.eval('searchSpc()'); await tick(400); };

  // I1
  w.eval('openModal()');
  await tipear('WAVE');
  let dd = d.getElementById('spc-dropdown');
  let opt = [...dd.querySelectorAll('.spc-option')].find((o) => /Stud Book/.test(o.textContent));
  ok('I1 sin resultados en el padrón → "🔎 Buscar «WAVE» en el Stud Book"', !!opt && /Buscar «WAVE» en el Stud Book/.test(opt.textContent) && /Sin resultados en el padrón/.test(dd.textContent), dd.textContent.trim().slice(0, 200));
  modo.padron = [{ id: 'spc-a', nombre: 'WAVE OTRO', sexo: 'macho', fecha_nacimiento: '2019-01-01', certificado_correr: false }];
  await tipear('WAVE');
  const conResult = [...d.querySelectorAll('#spc-dropdown .spc-option')];
  ok('I1 con resultados en el padrón → la opción del Stud Book también está, al pie', conResult.length === 2 && /Stud Book/.test(conResult[1].textContent), conResult.map((o) => o.textContent.trim()).join(' | '));
  await tipear('WA');
  ok('I1 con 2 letras → sin opción del Stud Book', ![...d.querySelectorAll('#spc-dropdown .spc-option')].some((o) => /Stud Book/.test(o.textContent)));
  modo.padron = [];

  // I2
  await tipear('WAVE');
  opt = [...d.querySelectorAll('#spc-dropdown .spc-option')].find((o) => /Stud Book/.test(o.textContent));
  const nInv0 = invocaciones().length;
  opt?.click(); await tick();
  const inv = invocaciones().slice(nInv0);
  ok('I2 la opción llama studbook-buscar con {term: "WAVE"}', inv.length === 1 && inv[0].invoke === 'studbook-buscar' && JSON.stringify(inv[0].body) === '{"term":"WAVE"}', JSON.stringify(inv));
  ok('I2 pregunta al padrón por studbook_id de los candidatos', s.log.some((x) => x.from === 'spcs' && x.ops.some(([k, a]) => k === 'in' && a[0] === 'studbook_id' && JSON.stringify(a[1]) === '["397805","111"]')));
  ok('I2 nombre hostil escapado (no se crea el <img>, no corre el onerror)', !d.getElementById('xss-sb') && w.__pwn === undefined && d.getElementById('spc-sb').textContent.includes('<img id="xss-sb"'));
  const botones = [...d.querySelectorAll('#spc-sb button')].map((b) => b.textContent.trim());
  ok('I2 el que está en el padrón (SB 111) → "usarlo"; el otro → "traerlo"', JSON.stringify(botones) === JSON.stringify(['Es este — traerlo', 'Ya está en el padrón — usarlo']), JSON.stringify(botones));

  // I3
  let n = invocaciones().length;
  [...d.querySelectorAll('#spc-sb button')].find((b) => /usarlo/.test(b.textContent))?.click(); await tick();
  ok('I3 "usarlo" NO llama a traer; queda seleccionado con su caballeriza; candidatos limpios', invocaciones().length === n
    && d.getElementById('f-spc-id').value === 'spc-111' && d.getElementById('spc-search-input').value === 'YA CARGADO' && cab.value === 'cab-1' && d.getElementById('spc-sb').innerHTML === '',
    `${d.getElementById('f-spc-id').value} ${cab.value}`);

  // I4
  w.eval('openModal()');
  await tipear('WAVE');
  [...d.querySelectorAll('#spc-dropdown .spc-option')].find((o) => /Stud Book/.test(o.textContent))?.click(); await tick();
  n = invocaciones().length;
  [...d.querySelectorAll('#spc-sb button')].find((b) => /traerlo/.test(b.textContent))?.click(); await tick();
  let tr = invocaciones().slice(n);
  ok('I4 traer manda SÓLO {accion, sb_id, nombre, carrera_id} con el turno elegido', tr.length === 1
    && JSON.stringify(tr[0].body) === JSON.stringify({ accion: 'traer', sb_id: '397805', nombre: HOSTIL, carrera_id: T_ELEGIDO }), JSON.stringify(tr));
  ok('I4 el caballo traído queda seleccionado en el modal', d.getElementById('f-spc-id').value === 'spc-nuevo' && d.getElementById('spc-search-input').value === 'WAVE RIMOUT', d.getElementById('f-spc-id').value);
  ok('I4 no inscribe solo (ningún INSERT en inscripciones todavía)', !s.log.some((x) => x.from === 'inscripciones'));
  ok('I4 aviso de éxito', toasts().some((t) => /toast-success/.test(t) && /WAVE RIMOUT quedó cargado desde el Stud Book/.test(t)), JSON.stringify(toasts()));

  // I11 (sigue del I4)
  await w.eval('saveRecord()'); await tick();
  const ins = s.log.filter((x) => x.from === 'inscripciones' && x.ops.some(([k]) => k === 'insert'));
  const payload = ins[0]?.ops.find(([k]) => k === 'insert')?.[1]?.[0];
  ok('I11 guardar → INSERT en inscripciones con el spc_id traído y el turno elegido', ins.length === 1 && payload?.spc_id === 'spc-nuevo' && payload?.carrera_id === T_ELEGIDO, JSON.stringify(payload));

  // I5
  modo.traer = 'motivos';
  w.eval('openModal()');
  await tipear('WAVE');
  [...d.querySelectorAll('#spc-dropdown .spc-option')].find((o) => /Stud Book/.test(o.textContent))?.click(); await tick();
  [...d.querySelectorAll('#spc-sb button')].find((b) => /traerlo/.test(b.textContent))?.click(); await tick();
  ok('I5 motivos → aviso (warning) después de crear, con el motivo', toasts().some((t) => /toast-warning/.test(t) && /Revisá la ficha en Stud Book \(SPCs\): homónimo de WAVE RIMOUT/.test(t)) && d.getElementById('f-spc-id').value === 'spc-nuevo', JSON.stringify(toasts()));

  // I6
  modo.traer = 'rechazo';
  w.eval('openModal()');
  await tipear('WAVE');
  [...d.querySelectorAll('#spc-dropdown .spc-option')].find((o) => /Stud Book/.test(o.textContent))?.click(); await tick();
  [...d.querySelectorAll('#spc-sb button')].find((b) => /traerlo/.test(b.textContent))?.click(); await tick();
  ok('I6 traer rechazado → el mensaje de la RPC en pantalla y nada seleccionado', /Ese caballo ya está cargado más de una vez en el padrón/.test(d.getElementById('spc-sb').textContent) && d.getElementById('f-spc-id').value === '', d.getElementById('spc-sb').textContent.slice(0, 200));
  modo.traer = 'ok';

  // I7
  modo.buscar = 'caido';
  await tipear('WAVE');
  [...d.querySelectorAll('#spc-dropdown .spc-option')].find((o) => /Stud Book/.test(o.textContent))?.click(); await tick();
  ok('I7 Stud Book caído → "El Stud Book no responde ahora…"', /El Stud Book no responde ahora/.test(d.getElementById('spc-sb').textContent), d.getElementById('spc-sb').textContent.slice(0, 200));
  modo.buscar = 'ok';

  // I9
  w.eval('openModal()');
  ok('I9 abrir el modal limpia los candidatos', d.getElementById('spc-sb').innerHTML === '');

  // I8
  w.eval(`openModal({ id: 'insc-1', carrera_id: '${T_FILA}', spc_id: 'spc-111', estado: 'inscripto' })`);
  await tipear('WAVE');
  [...d.querySelectorAll('#spc-dropdown .spc-option')].find((o) => /Stud Book/.test(o.textContent))?.click(); await tick();
  n = invocaciones().length;
  [...d.querySelectorAll('#spc-sb button')].find((b) => /traerlo/.test(b.textContent))?.click(); await tick();
  tr = invocaciones().slice(n);
  ok('I8 editando: traer usa el turno de la FILA, no el del select', tr.length === 1 && tr[0].body.carrera_id === T_FILA, JSON.stringify(tr.map((x) => x.body)));

  // I10
  w.eval(`currentCarreraId = null; openModal()`);
  await tipear('WAVE');
  [...d.querySelectorAll('#spc-dropdown .spc-option')].find((o) => /Stud Book/.test(o.textContent))?.click(); await tick();
  n = invocaciones().length;
  [...d.querySelectorAll('#spc-sb button')].find((b) => /traerlo/.test(b.textContent))?.click(); await tick();
  ok('I10 alta sin turno → "Seleccionar un turno" y NO llama a traer', invocaciones().length === n && toasts().some((t) => /toast-error\|Seleccionar un turno/.test(t)), JSON.stringify(toasts().slice(-2)));
}

const BASE = readFileSync(RUTA, 'utf8');
const base = await correr(BASE);
for (const x of base) console.log(`${x.s} ${x.t}${x.s === '❌' && x.n ? '  → ' + x.n : ''}`);
const fails = base.filter((x) => x.s === '❌').length;
console.log(`\n${base.length - fails}/${base.length} asserts OK`);

const MUT = [
  ['MU1 el navegador manda la ficha entera', `body: { accion: 'traer', sb_id: String(c.sb_id), nombre: c.nombre, carrera_id: carreraId },`, `body: { accion: 'traer', sb_id: String(c.sb_id), nombre: c.nombre, carrera_id: carreraId, ficha: c },`],
  ['MU2 candidatos sin escapar', '<div class="sb-cand-nombre">${escapeHtml(c.nombre)}</div>', '<div class="sb-cand-nombre">${c.nombre}</div>'],
  ['MU3 sin opción del Stud Book cuando hay resultados', `    }).join('') + opcionStudBook(q);`, `    }).join('');`],
  ['MU4 sin chequeo de padrón por studbook_id', `    sbCandidatosStaff.forEach(c => { c._padron = porSb.get(String(c.sb_id)) || null; });`, ``],
  ['MU5 traer siempre con el turno del select', `  return document.getElementById('f-id').value ? document.getElementById('f-carrera-id').value : currentCarreraId;`, `  return currentCarreraId;`],
  ['MU6 sin aviso de motivos', `  if (motivos.length) toast(`, `  if (false) toast(`],
  ['MU7 abrir el modal no limpia candidatos', `function openModal(rec=null) {\n  limpiarStudBookStaff();\n`, `function openModal(rec=null) {\n`],
  ['MU8 sin chequeo de turno antes de traer', `  if (!carreraId) { toast('Seleccionar un turno', 'error'); return; }\n  const out = document.getElementById('spc-sb');\n  out.innerHTML = \`<div class="sb-msg">Trayendo`, `  const out = document.getElementById('spc-sb');\n  out.innerHTML = \`<div class="sb-msg">Trayendo`],
  ['MU9 error de traer sin mensaje', `    renderCandidatosStudBookStaff({ exactos: sbCandidatosStaff }, mensajeStudBookStaff(e));`, `    renderCandidatosStudBookStaff({ exactos: sbCandidatosStaff });`],
  ['MU10 traer no selecciona el caballo', `  selectSpc(data.spc_id, nombre, '', '', '', false);`, ``],
  ['MU11 Stud Book caído con mensaje genérico', `  if (e.code === 'studbook_no_disponible') return 'El Stud Book no responde ahora. Cargalo a mano en Stud Book (SPCs).';\n`, ``],
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
