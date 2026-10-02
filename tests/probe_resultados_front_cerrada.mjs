/**
 * Probe — resultados.html: bloqueos de reunión cerrada y carrera oficial en la PANTALLA (ISSUE-102 paso 3).
 * SIN red y SIN base: monta el resultados.html REAL en jsdom (el CDN de supabase-js se corta, initAuth falla sola), le
 * inyecta un `sb` STUB y el estado de la página, y usa las funciones y los botones reales.
 *
 *   node tests/probe_resultados_front_cerrada.mjs              # contra el working tree
 *   node tests/probe_resultados_front_cerrada.mjs --mutantes   # + mutantes (cada uno TIENE que morir)
 *   RESULTADOS_HTML=/ruta/resultados.html node tests/…         # contra otro archivo
 *
 *   A1  F10 en la vista OFICIAL → no se llama a aplicar(); aviso "La carrera está oficial…"
 *   A2  F10 en el formulario de una reunión abierta → aplicar() una vez
 *   A3  F10 en el formulario de una reunión CERRADA → no se llama a aplicar(); aviso de reunión cerrada
 *   B1  reunión cerrada, formulario: Aplicar y Hacer oficial DESHABILITADOS (no escondidos) con el motivo; banner
 *   B2  reunión abierta, formulario: botones habilitados, sin banner
 *   B3  reunión cerrada, vista oficial: Des-oficializar deshabilitado con el motivo; banner
 *   B4  la lista de reuniones pide liquidacion_cerrada_at
 *   C1  aplicar() con error P0092 de la base → exactamente el texto de reunión cerrada (sin super_admin ni resolución, sin "Error al guardar")
 *   C2  aplicar() con P0089 → "La carrera está oficial…"
 *   C3  aplicar() con otro error → "Error al guardar: …" como antes
 *   C4  desoficializar() con P0092 de la RPC → el texto de reunión cerrada
 *   C5  oficializar() en reunión cerrada → corta antes de cualquier gate, con el aviso
 *   D1  resultados_legacy.html no está en el repo (Pages la deja de servir: 404)
 *   D2  ningún HTML/JS del repo la enlaza
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import jsdom from 'jsdom';
const { JSDOM, VirtualConsole, requestInterceptor } = jsdom;

const ROOT = new URL('..', import.meta.url).pathname;
process.on('unhandledRejection', (e) => {
  if (/supabase is not defined/.test(String(e?.message ?? e))) return;
  console.error('unhandledRejection:', e); process.exit(3);
});
const MUTANTES = process.argv.includes('--mutantes');
const ARCHIVO = process.env.RESULTADOS_HTML || ROOT + 'resultados.html';
const MSG_CERRADA = 'La liquidación de esta reunión está cerrada: el resultado no se puede cambiar.';
const MSG_OFICIAL = 'La carrera está oficial: para corregirla, des-oficializala primero.';

// sb stub: from(...) devuelve [] (o lo que diga `tablas`), con count 0; rpc según `rpcResp`
function stub() {
  const log = [];
  const st = { rpcResp: () => ({ data: { resultado_id: 'RES1', updated_at: 'x' }, error: null }), tablas: {} };
  const qb = (tabla) => {
    const ops = [];
    const p = new Proxy({}, {
      get(_, k) {
        if (k === 'then') {
          log.push({ from: tabla, ops });
          const single = ops.some(([m]) => m === 'single' || m === 'maybeSingle');
          const data = st.tablas[tabla] ?? (single ? null : []);
          return (ok, ko) => Promise.resolve({ data, error: null, count: 0 }).then(ok, ko);
        }
        return (...a) => { ops.push([k, a]); return p; };
      },
    });
    return p;
  };
  return { st, log, sb: { from: qb, rpc: async (fn, args) => { log.push({ rpc: fn, args }); return st.rpcResp(fn, args); },
    auth: { getSession: async () => ({ data: { session: null } }) } } };
}

const interceptor = () => requestInterceptor((request) => {
  const u = new URL(request.url);
  let cuerpo = '';
  if (u.hostname === 'sigh.com.ar') { try { cuerpo = readFileSync(ROOT + u.pathname.replace(/^\//, ''), 'utf8'); } catch { cuerpo = ''; } }
  return new Response(cuerpo, { headers: { 'Content-Type': 'application/javascript' } });
});
async function montar(html) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { url: 'https://sigh.com.ar/resultados.html', runScripts: 'dangerously',
    resources: { interceptors: [interceptor()] }, virtualConsole: vc, pretendToBeVisual: true });
  await new Promise((r) => dom.window.addEventListener('load', r));
  dom.window.confirm = () => true;
  dom.window.alert = () => {};
  return dom.window;
}
const tick = () => new Promise((r) => setTimeout(r, 20));

async function correr(html) {
  const res = [];
  const ok = (t, c, n = '') => { res.push({ t, s: c ? '✅' : '❌', n }); return c; };
  try {
    ok('B4 la lista de reuniones pide liquidacion_cerrada_at',
      /from\('reuniones'\)\.select\('[^']*liquidacion_cerrada_at[^']*'\)\.eq\('club_id'/.test(html));
    ok('C0 el texto de reunión cerrada es el pedido y no menciona super_admin ni resolución',
      html.includes(`const MSG_CERRADA = '${MSG_CERRADA}';`) && !/MSG_CERRADA = '[^']*(super_admin|resoluci)/i.test(html));

    const w = await montar(html);
    const { st, log, sb } = stub();
    w.__sb = sb;
    w.__toasts = [];
    w.__nAplicar = 0;
    w.eval(`sb = window.__sb; CLUB_ID = 'CLUB'; currentUser = { rol: 'secretario_carreras' };
      toast = (m, t) => window.__toasts.push([m, t]);
      reuniones = [
        { id: 'RA', numero: 1, fecha: '2099-01-01', estado: 'publicada', liquidacion_cerrada_at: null, hipodromos: { nombre: 'H' } },
        { id: 'RC', numero: 2, fecha: '2099-01-02', estado: 'publicada', liquidacion_cerrada_at: '2026-09-25T12:00:00Z', hipodromos: { nombre: 'H' } } ];
      document.getElementById('sel-reunion').innerHTML = '<option value="RA">A</option><option value="RC">C</option>';
      carreras = [{ id: 'K1', reunion_id: 'RA', numero_turno: 1, numero_carrera_programa: 1, distancia_metros: 1000, tipo_pista: 'tierra', nombre: null }];
      inscripciones = []; resultados = {}; posicionesMap = {}; apuestasMap = {}; carreraApuestasMap = {};
      window.__aplicarReal = aplicar;
      aplicar = (...x) => { window.__nAplicar++; return window.__aplicarReal(...x); };`);
    const $ = (id) => w.document.getElementById(id);
    const enReunion = (rid) => { $('sel-reunion').value = rid; w.eval(`carreras[0].reunion_id = '${rid}'`); };
    const formulario = () => { w.eval(`currentCarreraId = 'K1'; resultados = {}; renderFormulario(carreras[0], null, [], [], [])`); };
    const oficial = () => { w.eval(`resultados = { K1: { id: 'RES1', carrera_id: 'K1', estado: 'oficial', estado_pista: 'seca', tiempo_ganador: null } };
      currentCarreraId = 'K1'; renderOficial(carreras[0], resultados.K1, [], [], [])`); };
    const f10 = () => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'F10', bubbles: true }));
    const reset = () => { w.__toasts.length = 0; w.__nAplicar = 0; log.length = 0; };

    // B1 / B2 / B3
    enReunion('RC'); formulario();
    ok('B1 reunión cerrada, formulario: Aplicar y Hacer oficial están (no escondidos), deshabilitados y con el motivo; banner',
      $('btn-aplicar')?.disabled === true && $('btn-aplicar')?.title === MSG_CERRADA && $('btn-oficializar')?.disabled === true
      && $('btn-oficializar')?.title === MSG_CERRADA && ($('banner-cerrada')?.textContent || '').includes(MSG_CERRADA),
      JSON.stringify({ ap: $('btn-aplicar')?.outerHTML?.slice(0, 160), of: !!$('btn-oficializar'), banner: !!$('banner-cerrada') }));
    enReunion('RA'); formulario();
    ok('B2 reunión abierta, formulario: botones habilitados y sin banner',
      $('btn-aplicar')?.disabled === false && $('btn-oficializar')?.disabled === false && !$('banner-cerrada'));
    enReunion('RC'); oficial();
    ok('B3 reunión cerrada, vista oficial: Des-oficializar está, deshabilitado con el motivo; banner',
      $('btn-desoficializar')?.disabled === true && $('btn-desoficializar')?.title === MSG_CERRADA && !!$('banner-cerrada'));
    enReunion('RA'); oficial();
    ok('B3b reunión abierta, vista oficial: Des-oficializar habilitado', $('btn-desoficializar')?.disabled === false && !$('banner-cerrada'));

    // A1 / A2 / A3
    enReunion('RA'); oficial(); reset(); f10(); await tick();
    ok('A1 F10 en la vista oficial: no llama a aplicar(), avisa que está oficial', w.__nAplicar === 0 && !log.some(x => x.rpc)
      && w.__toasts.some(([m]) => m === MSG_OFICIAL), JSON.stringify({ n: w.__nAplicar, toasts: w.__toasts }));
    enReunion('RA'); formulario(); reset(); f10(); await tick();
    ok('A2 F10 en el formulario de una reunión abierta: aplicar() una vez', w.__nAplicar === 1, JSON.stringify({ n: w.__nAplicar, toasts: w.__toasts }));
    enReunion('RC'); formulario(); reset(); f10(); await tick();
    ok('A3 F10 en el formulario de una reunión cerrada: no llama a aplicar(), avisa', w.__nAplicar === 0
      && w.__toasts.some(([m]) => m === MSG_CERRADA), JSON.stringify({ n: w.__nAplicar, toasts: w.__toasts }));

    // C1 / C2 / C3: el error de la base, traducido por código
    const conError = async (error) => {
      enReunion('RA'); formulario(); reset();
      st.rpcResp = () => ({ data: null, error });
      await w.eval(`window.__aplicarReal('K1', 'provisional')`);
      return w.__toasts.map(([m]) => m);
    };
    const t1 = await conError({ code: 'P0092', message: 'aplicar_resultado: la liquidación de esta reunión está cerrada (saldada): … lo corrige un super_admin con la resolución. ISSUE-102' });
    ok('C1 P0092 → exactamente el texto de reunión cerrada, sin super_admin/resolución ni "Error al guardar"',
      t1.length === 1 && t1[0] === MSG_CERRADA, JSON.stringify(t1));
    const t2 = await conError({ code: 'P0089', message: 'aplicar_resultado: la carrera 3 está oficial; … ISSUE-089' });
    ok('C2 P0089 → "La carrera está oficial…"', t2.length === 1 && t2[0] === MSG_OFICIAL, JSON.stringify(t2));
    const t3 = await conError({ code: '23505', message: 'otra cosa' });
    ok('C3 otro error → "Error al guardar: …" como antes', t3.length === 1 && t3[0] === 'Error al guardar: otra cosa', JSON.stringify(t3));
    st.rpcResp = () => ({ data: { resultado_id: 'RES1', updated_at: 'x' }, error: null });

    // C4: des-oficializar con P0092 de la RPC (la reunión figura abierta en la base: el corte lo hace la RPC)
    enReunion('RA'); oficial(); reset();
    st.tablas.reuniones = { liquidacion_cerrada_at: null };
    st.rpcResp = (fn) => fn === 'desoficializar_carrera' ? { data: null, error: { code: 'P0092', message: 'desoficializar_carrera: la liquidación … ISSUE-102' } } : { data: null, error: null };
    await w.eval(`desoficializar('RES1', 'K1')`);
    ok('C4 des-oficializar con P0092 de la RPC → el texto de reunión cerrada', w.__toasts.map(([m]) => m).join('|') === MSG_CERRADA, JSON.stringify(w.__toasts));
    delete st.tablas.reuniones;

    // C5: oficializar en reunión cerrada
    enReunion('RC'); formulario(); reset();
    let errOf = null;
    try { await w.eval(`oficializar('K1')`); } catch (e) { errOf = String(e?.message || e); }   // sin el corte, sigue a los gates
    ok('C5 oficializar() en reunión cerrada corta con el aviso, sin llamar a aplicar()',
      w.__nAplicar === 0 && w.__toasts.some(([m]) => m === MSG_CERRADA), JSON.stringify({ n: w.__nAplicar, toasts: w.__toasts, errOf }));
  } catch (e) { ok('X  excepción en los casos (cuenta como fallo)', false, String(e?.stack || e).split('\n').slice(0, 3).join(' ')); }

  // D: la pantalla legacy
  ok('D1 resultados_legacy.html no está en el repo', !existsSync(ROOT + 'resultados_legacy.html'));
  const enlaces = readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f)).filter(f => readFileSync(ROOT + f, 'utf8').includes('resultados_legacy'));
  ok('D2 ningún HTML/JS del repo la enlaza', enlaces.length === 0, enlaces.join(', '));
  return res;
}

const BASE = readFileSync(ARCHIVO, 'utf8');
const base = await correr(BASE);
for (const x of base) console.log(`${x.s} ${x.t}${x.s === '❌' && x.n ? '  → ' + x.n.slice(0, 400) : ''}`);
const fails = base.filter(x => x.s === '❌').length;
console.log(`\n${base.length - fails}/${base.length} asserts OK  (${ARCHIVO})`);

const MUT = [
  ['MU1 F10 vuelve a llamar a aplicar() siempre', `e.preventDefault(); onF10(); }`, `e.preventDefault(); if (currentCarreraId) aplicar(currentCarreraId,'provisional'); }`],
  ['MU2 F10 no mira si la carrera está oficial', `  if (resultados[currentCarreraId]?.estado === 'oficial') { toast(MSG_OFICIAL, 'error'); return; }\n`, ``],
  ['MU3 F10 no mira si la reunión está cerrada', `  if (reunionCerrada()) { toast(MSG_CERRADA, 'error'); return; }\n  aplicar(currentCarreraId, 'provisional');`, `  aplicar(currentCarreraId, 'provisional');`],
  ['MU4 botones sin deshabilitar en reunión cerrada', "function attrsCerrada() { return reunionCerrada() ? ` disabled title=\"${MSG_CERRADA}\"` : ''; }", "function attrsCerrada() { return ''; }"],
  ['MU5 botones escondidos en vez de deshabilitados', "function attrsCerrada() { return reunionCerrada() ? ` disabled title=\"${MSG_CERRADA}\"` : ''; }", "function attrsCerrada() { return reunionCerrada() ? ` hidden` : ''; }"],
  ['MU6 sin banner', "return reunionCerrada() ? `<div class=\"warning-box no-print\" id=\"banner-cerrada\"", "return false ? `<div class=\"warning-box no-print\" id=\"banner-cerrada\""],
  ['MU7 P0092 sin traducir', `  if (err?.code === 'P0092') return MSG_CERRADA;\n`, ``],
  ['MU8 P0089 sin traducir', `  if (err?.code === 'P0089') return MSG_OFICIAL;\n`, ``],
  ['MU9 aplicar() no usa la traducción', `    const bloqueo = mensajeBloqueo(rpcErr);`, `    const bloqueo = null;`],
  ['MU10 des-oficializar no usa la traducción', `toast(mensajeBloqueo(error) || error.message,'error')`, `toast(error.message,'error')`],
  ['MU11 la lista de reuniones no trae liquidacion_cerrada_at', `select('id,numero,fecha,estado,liquidacion_cerrada_at,hipodromos(nombre)')`, `select('id,numero,fecha,estado,hipodromos(nombre)')`],
  ['MU12 el texto vuelve a nombrar super_admin y resolución', `const MSG_CERRADA = '${MSG_CERRADA}';`, `const MSG_CERRADA = 'La liquidación de esta reunión está cerrada: lo corrige un super_admin con la resolución.';`],
  ['MU13 oficializar() sin corte de reunión cerrada', `  if (reunionCerrada()) { toast(MSG_CERRADA, 'error'); return; }\n  // ═══ GATE MONTAS`, `  // ═══ GATE MONTAS`],
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
