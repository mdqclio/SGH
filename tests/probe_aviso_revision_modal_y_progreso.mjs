/**
 * Probe — (1) aviso al pasar a "ratificado" un SPC pendiente de revisión desde el SELECT de estado del modal de
 * inscripciones.html (mismo texto que ratificacion.html, revision-pendiente.js) y (2) indicador de progreso visible
 * mientras se consulta el Stud Book (studbook-progreso.js) en inscripciones.html, portal.html y spcs.html. 03/10.
 * SIN red y SIN base: HTML REAL en jsdom + `sb` STUB; funciones y eventos reales; datos sintéticos.
 *
 *   node tests/probe_aviso_revision_modal_y_progreso.mjs              # contra el working tree
 *   node tests/probe_aviso_revision_modal_y_progreso.mjs --mutantes   # + mutantes (cada uno TIENE que morir)
 *
 *   R1  elegir "ratificado" con un SPC pendiente → confirm con EXACTAMENTE textoConfirmarRatificarRevision(spc)
 *       (el mismo texto, carácter por carácter, que arma ratificacion.html)
 *   R2  cancelar → el select vuelve al estado anterior; Guardar después no escribe "ratificado"
 *   R3  aceptar → queda "ratificado"; Guardar NO vuelve a preguntar e inserta estado 'ratificado'
 *   R4  SPC no pendiente → sin confirm
 *   R5  editar una inscripción YA ratificada → sin confirm (no es "pasar a" ratificado)
 *   R6  "ratificado" aceptado con el SPC A (pendiente) y después se cambia al SPC B (también pendiente) →
 *       Guardar pregunta por B; cancelar no escribe
 *   R7  falla la consulta del SPC → error en pantalla y el select no queda en "ratificado"
 *   R8  sin motivos cargados → "Motivo: alta desde el portal."
 *   P1  inscripciones buscar: mientras la Edge Function no responde, indicador con role=status, segundos que avanzan,
 *       barra > 0 y la nota "suele tardar"; al responder desaparece
 *   P2  inscripciones traer: indicador con el nombre del caballo ESCAPADO (nombre hostil no inyecta nada)
 *   P3  portal buscar y traer: el indicador
 *   P4  spcs buscar: el indicador
 *   P5  las 3 pantallas cargan studbook-progreso.js; inscripciones y ratificacion cargan revision-pendiente.js
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
const leer = (f) => readFileSync(ROOT + f, 'utf8');
const HOSTIL = '<img id="xss-pg" src=x onerror="window.__pwn=1">TROMPA';
const T1 = 'b1000000-0000-0000-0000-000000000001';
const SPC = {
  pend: { id: 'a0000000-0000-0000-0000-000000000001', nombre: 'POTRO PENDIENTE', revision_pendiente: true, revision_motivos: ['edad > 12 (14 años según el Stud Book)'] },
  sinM: { id: 'a0000000-0000-0000-0000-000000000002', nombre: 'YEGUA SIN MOTIVO', revision_pendiente: true, revision_motivos: null },
  norm: { id: 'a0000000-0000-0000-0000-000000000003', nombre: 'CABALLO REVISADO', revision_pendiente: false, revision_motivos: null },
};

function stub(st) {
  const log = [];
  const qb = (tabla) => {
    const ops = [];
    const p = new Proxy({}, {
      get(_, k) {
        if (k === 'then') {
          log.push({ from: tabla, ops });
          const r = st.from?.(tabla, ops) ?? { data: [], error: null };
          return (ok, ko) => Promise.resolve(r).then(ok, ko);
        }
        return (...a) => { ops.push([k, a]); return p; };
      },
    });
    return p;
  };
  return { log, from: qb, rpc: async () => ({ data: [], error: null }),
    functions: { invoke: (fn, opts) => { log.push({ invoke: fn, body: opts?.body }); return st.invoke(opts?.body); } },
    auth: { getSession: async () => ({ data: { session: null } }) } };
}
const interceptor = (archivos) => requestInterceptor((request) => {
  const u = new URL(request.url);
  const rel = u.pathname.replace(/^\//, '');
  let cuerpo = '';
  if (u.hostname === 'sigh.com.ar') { try { cuerpo = archivos[rel] ?? leer(rel); } catch { cuerpo = ''; } }
  return new Response(cuerpo, { headers: { 'Content-Type': 'application/javascript' } });
});
async function montar(pagina, archivos) {
  const errores = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errores.push(String(e.message || e)));
  const dom = new JSDOM(archivos[pagina] ?? leer(pagina), { url: `https://sigh.com.ar/${pagina}`, runScripts: 'dangerously',
    resources: { interceptors: [interceptor(archivos)] }, virtualConsole: vc, pretendToBeVisual: true });
  await new Promise((r) => dom.window.addEventListener('load', r));
  dom.window.alert = () => {};
  return { w: dom.window, d: dom.window.document, errores };
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const diferido = () => { let res; const p = new Promise((r) => { res = r; }); return { p, res }; };

// el texto esperado, armado por la función compartida (la misma que usa ratificacion.html)
function textoEsperado(spc) {
  const m = (spc.revision_motivos || []).filter(Boolean);
  return `${spc.nombre} está pendiente de revisión en Stud Book (SPCs).\nMotivo: ${m.length ? m.join(' · ') : 'alta desde el portal'}.\n\n¿Ratificar igual?`;
}

async function casosAviso(ok, archivos) {
  const { w, d } = await montar('inscripciones.html', archivos);
  const st = { falla: false };
  const s = stub({
    from: (tabla, ops) => {
      if (tabla === 'spcs') {
        if (st.falla) return { data: null, error: { message: 'boom' } };
        const id = ops.find(([k, a]) => k === 'eq' && a[0] === 'id')?.[1]?.[1];
        return { data: Object.values(SPC).find((x) => x.id === id) ?? null, error: null };
      }
      return { data: null, error: null };
    },
    invoke: async () => ({ data: { ok: true, exactos: [], parciales: [] }, error: null }),
  });
  w.__sb = s; w.__toasts = [];
  const confirms = []; let resp = true;
  w.confirm = (m) => { confirms.push(m); return /caballeriza/.test(m) ? true : resp; };
  w.eval(`sb = window.__sb; currentCarreraId = '${T1}'; recargarInscripciones = async () => {}; avisarJockeyRepetido = () => {};
    toast = (m, t) => window.__toasts.push([t || 'ok', m]);`);
  const sel = d.getElementById('f-estado');
  const elegir = async (v) => { sel.value = v; sel.dispatchEvent(new w.Event('change')); await espera(40); };
  const avisos = () => confirms.filter((m) => /pendiente de revisión/.test(m));
  const inserts = () => s.log.filter((l) => l.from === 'inscripciones' && l.ops.some(([k]) => k === 'insert' || k === 'update'));
  const ultimoPayload = () => { const l = inserts().at(-1); return l?.ops.find(([k]) => k === 'insert' || k === 'update')?.[1]?.[0]; };
  const nuevo = (spc) => { w.eval('openModal()'); d.getElementById('f-spc-id').value = spc.id; confirms.length = 0; };

  // R1/R2
  nuevo(SPC.pend); resp = false;
  await elegir('ratificado');
  ok('R1) elegir "ratificado" con SPC pendiente → confirm con el texto compartido, exacto', avisos().length === 1 && avisos()[0] === textoEsperado(SPC.pend)
    && avisos()[0] === w.textoConfirmarRatificarRevision(SPC.pend), JSON.stringify(avisos()));
  ok('R2a) cancelar → el select vuelve a "inscripto"', sel.value === 'inscripto', sel.value);
  await w.eval('saveRecord()'); await espera(20);
  ok('R2b) Guardar después de cancelar no escribe "ratificado"', ultimoPayload()?.estado === 'inscripto', JSON.stringify(ultimoPayload()));
  // R3
  nuevo(SPC.pend); resp = true;
  await elegir('ratificado');
  const n1 = avisos().length;
  await w.eval('saveRecord()'); await espera(20);
  ok('R3) aceptar → queda ratificado; Guardar no vuelve a preguntar e inserta estado ratificado',
    n1 === 1 && avisos().length === 1 && sel.value === 'ratificado' && ultimoPayload()?.estado === 'ratificado', JSON.stringify([n1, avisos().length, ultimoPayload()?.estado]));
  // R4
  nuevo(SPC.norm);
  await elegir('ratificado'); await w.eval('saveRecord()'); await espera(20);
  ok('R4) SPC no pendiente → sin confirm', avisos().length === 0 && ultimoPayload()?.estado === 'ratificado', JSON.stringify(avisos()));
  // R5
  w.eval(`openModal({ id: 'i-rat', carrera_id: '${T1}', spc_id: '${SPC.pend.id}', estado: 'ratificado' })`); confirms.length = 0;
  await w.eval('saveRecord()'); await espera(20);
  ok('R5) editar una inscripción ya ratificada → sin confirm', avisos().length === 0, JSON.stringify(avisos()));
  // R6
  nuevo(SPC.pend); resp = true;
  await elegir('ratificado');                       // aviso por A, aceptado
  d.getElementById('f-spc-id').value = SPC.sinM.id; resp = false; const nAntes = inserts().length;
  await w.eval('saveRecord()'); await espera(20);
  ok('R6) aceptado por un SPC pendiente y después se cambia a OTRO pendiente → Guardar pregunta por el nuevo y cancelar no escribe',
    avisos().length === 2 && /YEGUA SIN MOTIVO/.test(avisos()[1]) && inserts().length === nAntes, JSON.stringify([avisos(), inserts().length - nAntes]));
  // R7
  nuevo(SPC.pend); st.falla = true; w.__toasts.length = 0;
  await elegir('ratificado');
  ok('R7) falla la consulta del SPC → error en pantalla y el select no queda en ratificado',
    sel.value === 'inscripto' && w.__toasts.some(([t, m]) => t === 'error' && /revisión/.test(m)), JSON.stringify([sel.value, w.__toasts]));
  st.falla = false;
  // R8
  nuevo(SPC.sinM); resp = false;
  await elegir('ratificado');
  ok('R8) sin motivos → "Motivo: alta desde el portal."', avisos().length === 1 && /Motivo: alta desde el portal\./.test(avisos()[0]), JSON.stringify(avisos()));
  w.close();
}

// Indicador: la Edge Function no contesta hasta que el probe la suelta.
async function verIndicador(ok, etiqueta, d, contenedorId, disparar, soltar, nombreEsperado) {
  const p = disparar();
  await espera(60);
  const el = d.getElementById(contenedorId);
  const ind = el?.querySelector('.sb-progreso');
  const seg0 = ind?.querySelector('.sb-progreso-seg')?.textContent;
  await espera(2150);
  const seg2 = ind?.querySelector('.sb-progreso-seg')?.textContent;
  const ancho = parseFloat(ind?.querySelector('.sb-progreso-fill')?.style.width || '0');
  ok(`${etiqueta}a) indicador visible (role=status) con segundos que avanzan, barra > 0 y "suele tardar"`,
    !!ind && ind.getAttribute('role') === 'status' && seg0 === '0 s' && /^[2-3] s$/.test(seg2 || '') && ancho > 0
    && /suele tardar/.test(ind.textContent) && (!nombreEsperado || ind.textContent.includes(nombreEsperado)),
    JSON.stringify({ hay: !!ind, seg0, seg2, ancho, txt: (ind?.textContent || el?.textContent || '').trim().slice(0, 140) }));
  soltar(); await p; await espera(60);
  ok(`${etiqueta}b) al responder, el indicador desaparece`, !el?.querySelector('.sb-progreso'), (el?.innerHTML || '').slice(0, 120));
}

async function casosProgreso(ok, archivos) {
  const respBuscar = { data: { ok: true, exactos: [{ sb_id: '128894', nombre: HOSTIL, fecha_nacimiento: '1987-12-01', sexo: 'macho', padrillo_nombre: 'P', madre_nombre: 'M', alertas: [] }], parciales: [] }, error: null };
  const respTraer = { data: { ok: true, spc_id: 'spc-nuevo', ya_existia: false, revision_motivos: null, nombre: 'TROMPA' }, error: null };
  let pend = diferido();
  const s = stub({ from: () => ({ data: [], error: null }), invoke: () => pend.p.then((body) => body) });
  const ronda = (resp) => { pend = diferido(); return () => pend.res(resp); };

  // inscripciones: buscar + traer
  {
    const { w, d } = await montar('inscripciones.html', archivos);
    w.__sb = s; w.eval(`sb = window.__sb; currentCarreraId = '${T1}'; toast = () => {}; openModal();`);
    d.getElementById('spc-search-input').value = 'TROMPA';
    let soltar = ronda(respBuscar);
    await verIndicador(ok, 'P1', d, 'spc-sb', () => w.eval('buscarEnStudBookStaff()'), soltar);
    soltar = ronda(respTraer);
    await verIndicador(ok, 'P2', d, 'spc-sb', () => w.eval('traerYUsarStaff(0)'), soltar, HOSTIL);
    ok('P2c) el nombre hostil no inyecta nada', !d.getElementById('xss-pg') && w.__pwn !== 1);
    w.close();
  }
  // portal: buscar + traer
  {
    const { w, d } = await montar('portal.html', archivos);
    w.__sb = s;
    w.eval(`sb = window.__sb; carreraSeleccionada = { id: '${T1}', reunionId: 'r' }; misCaballos = []; misInscripciones = [];
      leerMontaAnotar = () => ({}); anotar = async () => {}; loadLlamado = async () => {};`);
    d.getElementById('minsc-buscar').value = 'TROMPA';
    let soltar = ronda(respBuscar);
    await verIndicador(ok, 'P3', d, 'minsc-sb', () => w.eval('buscarEnStudBookPortal()'), soltar);
    soltar = ronda(respTraer);
    await verIndicador(ok, 'P3t', d, 'minsc-sb', () => w.eval('traerYAnotar(0)'), soltar, HOSTIL);
    w.close();
  }
  // spcs: buscar
  {
    const { w, d } = await montar('spcs.html', archivos);
    w.__sb = s; w.eval('sb = window.__sb;');
    d.getElementById('sb-term').value = 'TROMPA';
    const soltar = ronda(respBuscar);
    await verIndicador(ok, 'P4', d, 'sb-result', () => w.eval('buscarStudBook()'), soltar);
    w.close();
  }
  const usa = (f, js) => new RegExp(`<script src="${js.replace('.', '\\.')}"></script>`).test(archivos[f] ?? leer(f));
  ok('P5) inscripciones/portal/spcs cargan studbook-progreso.js; inscripciones/ratificacion cargan revision-pendiente.js',
    ['inscripciones.html', 'portal.html', 'spcs.html'].every((f) => usa(f, 'studbook-progreso.js'))
    && ['inscripciones.html', 'ratificacion.html'].every((f) => usa(f, 'revision-pendiente.js')));
}

async function correr(archivos = {}) {
  const res = [];
  const ok = (t, c, n = '') => { res.push({ t, s: c ? '✅' : '❌', n }); return c; };
  try { await casosAviso(ok, archivos); } catch (e) { ok('X1 excepción en el aviso', false, String(e?.stack || e).split('\n').slice(0, 2).join(' ')); }
  try { await casosProgreso(ok, archivos); } catch (e) { ok('X2 excepción en el progreso', false, String(e?.stack || e).split('\n').slice(0, 2).join(' ')); }
  return res;
}

const res = await correr();
for (const x of res) console.log(`${x.s} ${x.t}${x.s === '❌' && x.n ? '  → ' + x.n : ''}`);
const fails = res.filter((x) => x.s === '❌').length;
console.log(`\n${res.length - fails}/${res.length} checks OK`);

let vivos = 0;
if (MUTANTES) {
  const ins = leer('inscripciones.html'), prog = leer('studbook-progreso.js'), rev = leer('revision-pendiente.js');
  const M = [
    ['MU1 el select no avisa', { 'inscripciones.html': ins.replace("if (sel.value === 'ratificado' && estadoPrevioSelect !== 'ratificado') {", 'if (false) {') }],
    ['MU2 cancelar no revierte el select', { 'inscripciones.html': ins.replace('if (!sigue) sel.value = estadoPrevioSelect;', '') }],
    ['MU3 Guardar no vuelve a chequear', { 'inscripciones.html': ins.replace("if (document.getElementById('f-estado').value === 'ratificado') {\n    let sigue", "if (false) {\n    let sigue") }],
    ['MU4 avisa aunque ya estuviera ratificada', { 'inscripciones.html': ins.replace("if (estadoOriginalModal === 'ratificado' || revisionAceptadaPara === spcId) return true;", 'if (revisionAceptadaPara === spcId) return true;') }],
    ['MU5 no recuerda lo aceptado (pregunta dos veces)', { 'inscripciones.html': ins.replace('  revisionAceptadaPara = spcId;\n  return true;', '  return true;') }],
    ['MU6 el aviso aceptado vale para cualquier SPC', { 'inscripciones.html': ins.replace('revisionAceptadaPara === spcId) return true;', 'revisionAceptadaPara) return true;') }],
    ['MU7 error de la consulta se traga', { 'inscripciones.html': ins.replace("catch (e) { toast('No se pudo verificar la revisión del SPC: ' + e.message, 'error'); sigue = false; }", 'catch (e) { sigue = true; }') }],
    ['MU8 texto distinto en el modal', { 'inscripciones.html': ins.replace('if (!confirm(textoConfirmarRatificarRevision(spc))) return false;', "if (!confirm(spc.nombre + ' por revisar')) return false;") }],
    ['MU9 inscripciones sin indicador (texto suelto)', { 'inscripciones.html': ins.replace("const finProgreso = progresoStudBook(out, 'Consultando el Stud Book');", "out.innerHTML = '<div class=\"sb-msg\">Consultando el Stud Book…</div>'; const finProgreso = () => {};") }],
    ['MU10 el contador no avanza', { 'studbook-progreso.js': prog.replace('const iv = setInterval(tick, 1000);', 'const iv = 0;') }],
    ['MU11 nombre sin escapar en el indicador', { 'studbook-progreso.js': prog.replace('<span>${esc(texto)}…</span>', '<span>${texto}…</span>') }],
    ['MU12 portal sin indicador', { 'portal.html': leer('portal.html').replace("const finProgreso = progresoStudBook(out, 'Consultando el Stud Book');", "out.innerHTML = 'Consultando…'; const finProgreso = () => {};") }],
    ['MU13 spcs sin indicador', { 'spcs.html': leer('spcs.html').replace("const finProgreso = progresoStudBook(out, 'Consultando el Stud Book');", "out.innerHTML = 'Consultando…'; const finProgreso = () => {};") }],
    ['MU14 sin "alta desde el portal" por defecto', { 'revision-pendiente.js': rev.replace(": 'alta desde el portal';", ": '';") }],
  ];
  console.log('\n── mutantes ──');
  for (const [n, archivos] of M) {
    if (Object.entries(archivos).every(([k, v]) => v === leer(k))) { console.log(`⚠ ${n}: el reemplazo no aplicó`); vivos++; continue; }
    const r = await correr(archivos);
    const muere = r.some((x) => x.s === '❌');
    if (!muere) vivos++;
    console.log(`${muere ? '💀 muere' : '🟢 VIVO '} ${n}  (${r.filter((x) => x.s === '❌').map((x) => x.t.split(')')[0]).join(',')})`);
  }
  console.log(`mutantes: ${M.length - vivos}/${M.length} muertos`);
}
process.exit(fails || vivos ? 1 : 0);
