/**
 * Probe — ISSUE-018 / H6: nombres hostiles de usuarios del portal en las pantallas del staff.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_xss_portal_nombres.mjs              # suite contra el código del working tree
 *   node tests/probe_xss_portal_nombres.mjs --mutantes   # + mutantes (cada uno TIENE que morir)
 *
 * Qué prueba. Los usuarios del portal eligen su propio nombre (solicitar-acceso) y pueden
 * reescribir su fila de `usuarios` por la API. Ese texto se renderiza en:
 *   - usuarios.html      filaHTML (nombre, teléfono, email) + botón Activar (super_admin; el portal no tiene Editar)
 *   - admin.html         loadPendientes (nombre, email) + botones Aprobar/Rechazar
 *   - inscripciones.html renderInscripciones, columna "Cargada por" (nombre del cargador del portal)
 *
 * Cómo. Sin reimplementar nada: monta el HTML REAL en jsdom con sus scripts (runScripts
 * 'dangerously'), los <script src> locales se sirven del disco (escape-html.js incluido) y el
 * CDN de supabase-js se corta (initAuth falla sola, a propósito). Después se le inyecta a la
 * página un cliente Supabase real (service_role) en su `sb` y se llaman las funciones REALES
 * de carga: load(), loadPendientes(), loadInscripciones(). Los botones se clickean de verdad:
 * jsdom ejecuta el onclick inline igual que el navegador (decodifica entidades antes del JS).
 *
 * Nombres hostiles (5): comilla simple, comilla doble, <script>/<img>, & con entidades que
 * escapan de un onclick, y uno normal con tilde y apóstrofe (D'Elía). Por cada uno:
 *   - la fila se renderiza,
 *   - el texto se ve TAL CUAL se escribió (textContent === valor en la base),
 *   - no aparece ningún elemento inyectado (<script>, <img>, [id^=xss]),
 *   - usuarios: sin "Editar" para el portal (846b7b6, 27/09) y Activar con onclick = sólo el id; Aprobar pregunta por ESE nombre,
 *   - window.__pwn no se setea (ningún payload se ejecuta).
 *
 * Fixture (ESCRIBE en prod): 5 filas en `usuarios` (Dolores, rol profesional, estado
 * 'pendiente', activo=false, email probe.xss.*@sgh.test, sin cuenta de Auth) y 5 inscripciones
 * canal 'portal' en la reunión 9999 (T3), inscripto_por = esos usuarios. Se borran en el
 * finally (inscripciones antes que usuarios: FK inscripto_por) y se barre al arrancar lo que
 * haya dejado un kill -9. Verificación por estado: 0 usuarios probe.xss, 0 inscripciones del
 * probe, y la 9999 vuelve a las mismas 17 inscripciones (ids) que tenía antes.
 *
 * Mutantes (--mutantes): M1 escape-html.js = identidad · M2 usuarios/admin/inscripciones de
 * `0677222^` (antes del fix) · M3 usuarios.html sin el <script src="escape-html.js"> · M4 el portal
 * vuelve a tener "Editar" en usuarios.html.
 *
 * Overrides por entorno (ruta a archivo): USUARIOS_HTML, ADMIN_HTML, INSCRIPCIONES_HTML, ESCAPE_JS.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import jsdom from 'jsdom';
const { JSDOM, VirtualConsole, requestInterceptor } = jsdom;

const ROOT = new URL('..', import.meta.url).pathname;
const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }

const CLUB_DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const REUNION_9999 = 'a0000000-0000-0000-0000-000000009999';
const CARRERA_T3   = 'c0000000-0000-0000-0000-000000000003';
// SPCs de T1/T2 de la 9999: no están en T3, así que no chocan con (carrera, spc).
const SPCS_T1_T2_INSC = ['a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000005'];
const EMAIL_LIKE = 'probe.xss.%@sgh.test';

const admin = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = randomBytes(4).toString('hex');

const CASOS = [
  { k: 'simple', nombre: "x' onmouseover='window.__pwn=4", telefono: '11 5555-0001' },
  { k: 'doble',  nombre: 'Juan "El Rayo" Pérez', telefono: null },
  { k: 'script', nombre: '<script>window.__pwn=1</script><img id="xss-img" src="x">',
    telefono: '<b id="xss-tel">11</b>', email: `probe.xss.<i id="xss-mail">m</i>.${TAG}@sgh.test` },
  { k: 'amp',    nombre: 'Tom & Jerry &quot;});window.__pwn=2;//&#39;);window.__pwn=3;//', telefono: '&amp; 11' },
  { k: 'delia',  nombre: "José D'Elía", telefono: '2245 44-1234' },
].map(c => ({ ...c, email: c.email || `probe.xss.${c.k}.${TAG}@sgh.test` }));

// ── fixture ───────────────────────────────────────────────────────────────────
async function barrer() {
  const { data: us, error: e1 } = await admin.from('usuarios').select('id').like('email', EMAIL_LIKE);
  if (e1) throw e1;
  const ids = (us || []).map(u => u.id);
  if (ids.length) {
    const { error: e2 } = await admin.from('inscripciones').delete().in('inscripto_por', ids);
    if (e2) throw e2;
    const { error: e3 } = await admin.from('usuarios').delete().in('id', ids);
    if (e3) throw e3;
  }
  return ids.length;
}

async function inscripciones9999() {
  const { data, error } = await admin.from('inscripciones').select('id, carreras!inner(reunion_id)')
    .eq('carreras.reunion_id', REUNION_9999);
  if (error) throw error;
  return (data || []).map(r => r.id).sort();
}

async function sembrar() {
  const { data: spcs, error: eS } = await admin.from('inscripciones').select('id, spc_id').in('id', SPCS_T1_T2_INSC);
  if (eS) throw eS;
  const spcPorInsc = Object.fromEntries(spcs.map(r => [r.id, r.spc_id]));
  for (const [idx, c] of CASOS.entries()) {
    const { data: u, error } = await admin.from('usuarios').insert({
      email: c.email, nombre_completo: c.nombre, telefono: c.telefono, club_id: CLUB_DOLORES,
      rol: 'profesional', activo: false, estado: 'pendiente', password_hash: '',
    }).select('id').single();
    if (error) throw new Error(`alta usuario ${c.k}: ${error.message}`);
    c.id = u.id;
    const { data: i, error: eI } = await admin.from('inscripciones').insert({
      carrera_id: CARRERA_T3, spc_id: spcPorInsc[SPCS_T1_T2_INSC[idx]], estado: 'inscripto',
      canal: 'portal', inscripto_por: c.id,
    }).select('id').single();
    if (eI) throw new Error(`alta inscripción ${c.k}: ${eI.message}`);
    c.inscId = i.id;
  }
}

// ── montaje en jsdom ──────────────────────────────────────────────────────────
const fuente = (arch, overrides) => overrides[arch] ?? readFileSync(ROOT + arch, 'utf8');

// Los <script src> locales salen del disco (o del override del mutante); todo lo demás
// (CDN de supabase-js, Google Fonts, imágenes) recibe una respuesta vacía, sin red.
const interceptor = overrides => requestInterceptor(request => {
  const u = new URL(request.url);
  let cuerpo = '';
  if (u.hostname === 'sigh.com.ar') {
    try { cuerpo = fuente(u.pathname.replace(/^\//, ''), overrides); } catch { cuerpo = ''; }
  }
  return new Response(cuerpo, { headers: { 'Content-Type': 'application/javascript' } });
});

async function montar(pagina, overrides) {
  const errores = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errores.push(String(e.message || e)));
  const dom = new JSDOM(fuente(pagina, overrides), {
    url: `https://sigh.com.ar/${pagina}`, runScripts: 'dangerously', resources: { interceptors: [interceptor(overrides)] },
    virtualConsole: vc, pretendToBeVisual: true,
  });
  await new Promise(r => dom.window.addEventListener('load', r));
  dom.window.__sb = admin;
  dom.window.confirm = () => false;
  return { dom, w: dom.window, d: dom.window.document, errores };
}

const inyectados = root => root.querySelectorAll('script, img, [id^="xss"]').length;
const filaPorId = (d, sel, id) => [...d.querySelectorAll(sel)].find(b => (b.getAttribute('onclick') || b.getAttribute('onchange') || '').includes(id))?.closest('tr');

// ── suite ─────────────────────────────────────────────────────────────────────
async function suite(overrides = {}) {
  const res = [];
  const ok = (t, c, n = '') => res.push({ t, c: !!c, n });

  // usuarios.html
  {
    const { w, d } = await montar('usuarios.html', overrides);
    let cargo = true;
    // super_admin: es el único que ve acciones sobre usuarios del portal (usuarios.html, 846b7b6 del 27/09)
    try { await w.eval(`sb = __sb; CLUB_ID = '${CLUB_DOLORES}'; currentUser = { id: '00000000-0000-0000-0000-0000000000aa', rol: 'super_admin' }; load()`); } catch (e) { cargo = false; ok('U0) usuarios.html load() corre', false, e.message); }
    const cont = d.getElementById('list-container');
    if (cargo) ok('U0) usuarios.html load() corre', true);
    ok('U1) usuarios.html: 0 elementos inyectados en la lista', inyectados(cont) === 0, `inyectados=${inyectados(cont)}`);
    for (const c of CASOS) {
      const tr = d.querySelector(`tr[data-id="${c.id}"]`);
      ok(`U2.${c.k}) fila renderizada`, !!tr);
      if (!tr) continue;
      const nom = tr.querySelector('.cell-name')?.textContent;
      ok(`U3.${c.k}) nombre tal cual`, nom === c.nombre, JSON.stringify(nom));
      const subs = [...tr.querySelectorAll('.cell-sub')].map(x => x.textContent);
      ok(`U4.${c.k}) email tal cual`, subs.includes(c.email), JSON.stringify(subs));
      if (c.telefono) ok(`U5.${c.k}) teléfono tal cual`, subs.includes('📞 ' + c.telefono), JSON.stringify(subs));
      // Desde 846b7b6 (27/09) un usuario del portal NO tiene "Editar" (edita su propia cuenta); el super_admin
      // ve Activar/Desactivar. El onclick lleva sólo el id: el nombre hostil no entra al JS inline.
      const botones = [...tr.querySelectorAll('button')];
      const toggle = botones.filter(b => /toggleActivo/.test(b.getAttribute('onclick') || ''));
      ok(`U6.${c.k}) sin "Editar" y un solo Activar/Desactivar con onclick = sólo el id`,
        !botones.some(b => b.textContent.includes('Editar')) && toggle.length === 1
        && toggle[0].getAttribute('onclick') === `toggleActivo('${c.id}',true)`,
        JSON.stringify(botones.map(b => [b.textContent.trim(), b.getAttribute('onclick')])));
      ok(`U7.${c.k}) nada se ejecutó`, w.__pwn === undefined, `__pwn=${w.__pwn}`);
    }
    w.close();
  }

  // admin.html — aprobaciones pendientes
  {
    const { w, d } = await montar('admin.html', overrides);
    let cargo = true;
    try { await w.eval('sb = __sb; loadPendientes()'); } catch (e) { cargo = false; ok('A0) admin.html loadPendientes() corre', false, e.message); }
    if (cargo) ok('A0) admin.html loadPendientes() corre', true);
    const cont = d.getElementById('pendientes-container');
    ok('A1) admin.html: 0 elementos inyectados en pendientes', inyectados(cont) === 0, `inyectados=${inyectados(cont)}`);
    for (const c of CASOS) {
      const tr = filaPorId(d, '#pendientes-container button', c.id);
      ok(`A2.${c.k}) fila renderizada`, !!tr);
      if (!tr) continue;
      const divs = tr.querySelectorAll('td:first-child div');
      ok(`A3.${c.k}) nombre y email tal cual`, divs[0]?.textContent === c.nombre && divs[1]?.textContent === c.email,
        JSON.stringify([divs[0]?.textContent, divs[1]?.textContent]));
      for (const acc of ['Aprobar', 'Rechazar']) {
        const preguntas = [];
        w.confirm = m => { preguntas.push(m); return false; };   // false: no se escribe nada
        w.__pwn = undefined;
        [...tr.querySelectorAll('button')].find(b => b.textContent.includes(acc))?.click();
        await new Promise(r => setTimeout(r, 0));
        ok(`A4.${c.k}.${acc}) pregunta por ESE nombre`, preguntas.length === 1 && preguntas[0].includes(`"${c.nombre}"`), JSON.stringify(preguntas));
        ok(`A5.${c.k}.${acc}) nada se ejecutó`, w.__pwn === undefined, `__pwn=${w.__pwn}`);
      }
    }
    w.close();
  }

  // inscripciones.html — "Cargada por"
  {
    const { w, d } = await montar('inscripciones.html', overrides);
    let cargo = true;
    try { await w.eval(`sb = __sb; CLUB_ID = '${CLUB_DOLORES}'; currentCarreraId = '${CARRERA_T3}'; loadInscripciones()`); }
    catch (e) { cargo = false; ok('I0) inscripciones.html loadInscripciones() corre', false, e.message); }
    if (cargo) ok('I0) inscripciones.html loadInscripciones() corre', true);
    const cont = d.getElementById('list-container');
    ok('I1) inscripciones.html: 0 elementos inyectados en la lista', inyectados(cont) === 0, `inyectados=${inyectados(cont)}`);
    const esperadas = await admin.from('inscripciones').select('id', { count: 'exact', head: true }).eq('carrera_id', CARRERA_T3);
    ok('I2) se renderizan todas las filas de T3', cont.querySelectorAll('tbody tr').length === esperadas.count,
      `filas=${cont.querySelectorAll('tbody tr').length} base=${esperadas.count}`);
    for (const c of CASOS) {
      const tr = filaPorId(d, '#list-container [onclick], #list-container [onchange]', c.inscId);
      ok(`I3.${c.k}) fila renderizada`, !!tr);
      if (!tr) continue;
      const celda = tr.children[8];
      const span = celda?.querySelectorAll('span')[1];
      ok(`I4.${c.k}) "Cargada por" = Portal + nombre tal cual`, celda?.textContent.startsWith('Portal') && span?.textContent === c.nombre,
        JSON.stringify(span?.textContent));
    }
    ok('I5) nada se ejecutó', w.__pwn === undefined, `__pwn=${w.__pwn}`);
    w.close();
  }

  // estático: la página carga el helper y el onclick lleva sólo el id
  for (const p of ['usuarios.html', 'admin.html', 'inscripciones.html']) {
    const src = fuente(p, overrides);
    ok(`S1.${p}) carga escape-html.js`, /<script src="escape-html\.js"><\/script>/.test(src));
  }
  ok('S2) usuarios.html: Editar no serializa el objeto al atributo', !/openEdit\(\$\{JSON\.stringify/.test(fuente('usuarios.html', overrides)));
  ok('S3) admin.html: Aprobar/Rechazar pasan sólo el id', !/(aprobar|rechazar)Usuario\('\$\{u\.id\}',/.test(fuente('admin.html', overrides)));
  return res;
}

// ── main ──────────────────────────────────────────────────────────────────────
const MUTANTES = {
  'M1 escape-html.js = identidad': () => ({
    'escape-html.js': 'function escapeHtml(s) { return s === null || s === undefined ? "" : String(s); }\n' }),
  'M2 usuarios/admin/inscripciones antes del fix (0677222^)': () => Object.fromEntries(
    ['usuarios.html', 'admin.html', 'inscripciones.html'].map(f => [f, execSync(`git -C ${ROOT} show 0677222^:${f}`, { encoding: 'utf8' })])),
  'M3 usuarios.html sin <script src="escape-html.js">': () => ({
    'usuarios.html': readFileSync(ROOT + 'usuarios.html', 'utf8').replace('<script src="escape-html.js"></script>\n', '') }),
  'M4 usuarios.html: el portal vuelve a tener "Editar" (pre 846b7b6)': () => ({
    'usuarios.html': readFileSync(ROOT + 'usuarios.html', 'utf8').replace('function puedeEditar(u)     { return !esPortal(u) && puedeModificar(u); }', 'function puedeEditar(u)     { return puedeModificar(u); }') }),
};

const ENV_OVERRIDES = Object.fromEntries([['usuarios.html', 'USUARIOS_HTML'], ['admin.html', 'ADMIN_HTML'],
  ['inscripciones.html', 'INSCRIPCIONES_HTML'], ['escape-html.js', 'ESCAPE_JS']]
  .filter(([, v]) => process.env[v]).map(([f, v]) => [f, readFileSync(process.env[v], 'utf8')]));

// Rechazos de initAuth (supabase-js no se carga a propósito) y demás ruido de la página.
process.on('unhandledRejection', () => {});

let codigo = 0;
const lineas = [];
const log = s => { lineas.push(s); console.log(s); };
let antes9999 = null;
try {
  const barridos = await barrer();
  log(`fixture: tag=${TAG} · barridos de corridas anteriores=${barridos}`);
  antes9999 = await inscripciones9999();
  await sembrar();
  log(`fixture: ${CASOS.length} usuarios + ${CASOS.length} inscripciones portal en 9999 T3`);

  const res = await suite(ENV_OVERRIDES);
  for (const r of res) log(`${r.c ? '✅' : '❌'} ${r.t}${r.c ? '' : '  ← ' + r.n}`);
  const bien = res.filter(r => r.c).length;
  log(`\nSUITE: ${bien}/${res.length}`);
  if (bien !== res.length) codigo = 1;

  if (process.argv.includes('--mutantes')) {
    let muertos = 0;
    for (const [nombre, mk] of Object.entries(MUTANTES)) {
      const r = await suite(mk());
      const caidos = r.filter(x => !x.c);
      log(`${caidos.length ? '💀 muere' : '🧟 SOBREVIVE'} ${nombre} — ${caidos.length}/${r.length} asserts en rojo:`);
      for (const x of caidos) log(`     ❌ ${x.t}  ← ${x.n}`);
      if (caidos.length) muertos++;
    }
    log(`MUTANTES: ${muertos}/${Object.keys(MUTANTES).length} muertos`);
    if (muertos !== Object.keys(MUTANTES).length) codigo = 1;
  }
} catch (e) {
  log(`❌ ERROR: ${e.stack || e.message}`);
  codigo = 1;
} finally {
  try {
    await barrer();
    const { count: quedanU } = await admin.from('usuarios').select('id', { count: 'exact', head: true }).like('email', EMAIL_LIKE);
    const ids = CASOS.map(c => c.inscId).filter(Boolean);
    const { count: quedanI } = ids.length
      ? await admin.from('inscripciones').select('id', { count: 'exact', head: true }).in('id', ids) : { count: 0 };
    const despues9999 = await inscripciones9999();
    const igual = antes9999 === null || JSON.stringify(antes9999) === JSON.stringify(despues9999);
    const limpio = quedanU === 0 && quedanI === 0 && igual;
    log(`${limpio ? '✅' : '❌'} Z) limpieza por estado: usuarios probe.xss=${quedanU} · inscripciones del probe=${quedanI} · 9999 mismas inscripciones (ids)=${igual} (${despues9999.length})`);
    if (!limpio) codigo = 1;
  } catch (e) { log(`❌ Z) limpieza falló: ${e.message}`); codigo = 1; }
  process.exit(codigo);
}
