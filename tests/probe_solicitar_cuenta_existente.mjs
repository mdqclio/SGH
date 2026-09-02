/**
 * Probe — "ese correo ya está registrado" en solicitar-acceso.html (código real, sin browser).
 *
 * El bug que arregla el código bajo prueba: GoTrue, ante un alta repetida sobre una cuenta YA
 * CONFIRMADA, responde 200 sin error y con un user obfuscado —anti-enumeración, para no filtrar
 * qué correos existen— y NO manda ningún mail. La página sólo miraba `authErr`, así que caía en
 * `sec-confirmar` ("revisá tu correo") por un mail que nunca se emitió. Le pasó a un usuario real
 * el 02/09/2026. Diagnóstico: docs/diagnosticos/2026-09-02_fede-mail-verificacion-no-llega.md
 *
 * La señal es `user.identities` vacío. Este probe la verifica CONTRA GOTRUE DE PRODUCCIÓN en vez
 * de darla por buena, porque un falso positivo rompería el camino feliz: si un alta genuina
 * también devolviera identities vacío, nadie podría registrarse.
 *
 * Patrón de tests/README.md § "Browser NO disponible": se extrae del propio solicitar-acceso.html
 * el bloque real —helpers de UI, lectura del form, validación, el handler de #btn-enviar y el
 * "camino 2"— por ancla y balance de llaves, y se lo corre con new AsyncFunction inyectando un
 * mini-DOM y las RESPUESTAS REALES que devolvió GoTrue en la sección A. Nada se reimplementa acá.
 *
 * OJO CON LA LIBRERÍA: la señal viaja adentro de `data.user`, y ESO DEPENDE DE LA VERSIÓN de
 * supabase-js. La 2.106.1 que hay en node_modules devuelve `user: null` en todo signUp sin sesión
 * (su `_sessionResponse` hace `data.user ?? null`, y GoTrue manda el user SIN envoltorio); la
 * 2.112.4 que sirve el CDN —la que carga la página— sí lo devuelve. Por eso la sección A corre el
 * signUp con el MISMO bundle que carga solicitar-acceso.html, bajado del CDN en la corrida. Si un
 * día el CDN vuelve a la variante que nulea el user, A5 se pone en rojo en vez de dejar el fix
 * convertido en código muerto sin que nadie se entere.
 *
 * Qué cubre:
 *   A) GoTrue real, con el bundle del CDN: alta nueva · reenvío sin confirmar · repetida confirmada
 *   B) la página, alimentada con esas respuestas: sec-confirmar vs sec-existe, y los dos links
 *   C) el "camino 2" (ya logueado) sigue yendo a portal.html — el fix no lo toca
 *   D) el deep link ?recuperar=1 de login.html abre el panel de "olvidé mi contraseña"
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_solicitar_cuenta_existente.mjs
 *   node tests/probe_solicitar_cuenta_existente.mjs --mutantes           # los 6 mutantes
 *   node tests/probe_solicitar_cuenta_existente.mjs --mutantes=M1,M2     # por tanda
 *
 * ⚠️ ESCRIBE EN PROD (auth): crea 3 cuentas `probe-<caso>-<run>@sgh-probe.invalid` y las borra en
 *    el finally, verificando por listUsers que no quedó ninguna (conteo antes y después).
 * ⚠️ MANDA 2 MAILS por corrida: el alta nueva y el reenvío a la cuenta sin confirmar son envíos
 *    de verdad de GoTrue. Van a un dominio .invalid, así que rebotan en Resend. Es el precio de
 *    verificar la señal contra el servidor real en vez de contra una respuesta escrita a mano;
 *    no correr el probe en loop.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }

// El signUp anónimo está detrás de Turnstile (probe_autoregistro_e2e.mjs §0). Con la secret key
// GoTrue saltea el captcha, así que el probe puede ejercitar el endpoint REAL de signup.
const admin = createClient(SUPABASE_URL, KEY, { auth:{ autoRefreshToken:false, persistSession:false } });

const HERE = dirname(fileURLToPath(import.meta.url));
const SOLICITAR_PATH = process.env.SOLICITAR_HTML || join(HERE, '..', 'solicitar-acceso.html');
const LOGIN_PATH     = process.env.LOGIN_HTML     || join(HERE, '..', 'login.html');
const HTML  = readFileSync(SOLICITAR_PATH, 'utf8');
const LOGIN = readFileSync(LOGIN_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const results = [];
const ok = (t, c, n='') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

// ── extracción por ancla ────────────────────────────────────────────────────
// El scan arranca en la llave FINAL de la firma, no en la primera que aparezca después del ancla.
function desdeFirma(src, firma){
  const i = src.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  if (!firma.endsWith('{')) throw new Error(`la firma tiene que terminar en '{': ${firma}`);
  let d = 0;
  for (let k = i + firma.length - 1; k < src.length; k++){
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return { desde:i, hasta:k + 1, src:src.slice(i, k + 1) }; }
  }
  throw new Error(`no pude cerrar: ${firma}`);
}

// El slab: de los helpers de UI hasta el final del "camino 2". Es un bloque contiguo del archivo,
// sin editar: si mañana alguien mete una función en el medio, el probe la corre igual.
const INICIO_SLAB = 'function showErr(m) {';
const FIN_SLAB    = '// --- Camino 2: ya logueado (volvió de confirmar el email) -------------------\n(async () => {';
const iSlab = HTML.indexOf(INICIO_SLAB);
if (iSlab < 0) throw new Error(`no encontré el arranque del slab: ${INICIO_SLAB}`);
const camino2 = desdeFirma(HTML, FIN_SLAB);
const SLAB = HTML.slice(iSlab, camino2.hasta) + ')();';

// ── mini-DOM ────────────────────────────────────────────────────────────────
// Los ids salen del HTML REAL: pedir uno que el archivo no tiene revienta el probe en vez de
// devolver un nodo fantasma. Es el guard que hace que renombrar #sec-existe rompa acá.
const IDS_HTML = new Set([...HTML.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
function mkDom(valores = {}){
  const nodos = {};
  const nuevo = (id) => ({
    id, value: valores[id] ?? '', textContent: '', innerHTML: '', disabled: false, checked: false,
    onclick: null, style: {}, addEventListener(){},
    classList: { _c:new Set(),
      add(c){ this._c.add(c); }, remove(c){ this._c.delete(c); },
      contains(c){ return this._c.has(c); },
      toggle(c, on){ on ? this._c.add(c) : this._c.delete(c); } },
  });
  const get = (id) => {
    if (!IDS_HTML.has(id)) throw new Error(`el código pidió #${id} y ese id NO existe en el HTML`);
    return (nodos[id] ||= nuevo(id));
  };
  const radios = { profesional: nuevo('rol-prof'), propietario: nuevo('rol-prop') };
  return {
    getElementById: get,
    querySelector(sel){
      if (sel === 'input[name=rol]:checked'){
        const r = Object.entries(radios).find(([, n]) => n.checked);
        if (!r) throw new Error('ningún radio de rol está marcado');
        return { value: r[0] };
      }
      const m = sel.match(/^input\[name=rol\]\[value="(.+)"\]$/);
      if (m) return radios[m[1]];
      throw new Error(`selector no soportado por el mini-DOM: ${sel}`);
    },
    _n: nodos, _radios: radios,
    visible(id){ return get(id).style.display === ''; },
  };
}

// Un <a> del HTML real, para asertar el href tal como está escrito en el archivo.
function link(id){
  const m = HTML.match(new RegExp(`<a[^>]*id="${id}"[^>]*>`));
  if (!m) return null;
  const h = m[0].match(/href="([^"]*)"/);
  return h ? h[1] : null;
}

// ── arnés: el slab real con stubs ───────────────────────────────────────────
function chain(filas){
  const api = { select:()=>api, eq:()=>api, maybeSingle: async()=>({ data: filas, error:null }) };
  return api;
}
async function mkPagina({ dom, respSignUp = null, session = null, tablas = {}, rpc = [] }){
  const sb = {
    auth: {
      getSession: async () => ({ data:{ session } }),
      signUp: async () => respSignUp,
    },
    from: (t) => chain(tablas[t] ?? null),
    rpc: async (fn, args) => { rpc.push({ fn, args }); return { error:null }; },
  };
  const loc = { href: 'https://sigh.com.ar/solicitar-acceso.html', search:'', replace(u){ this.reemplazo = u; } };
  const store = { _d:{}, getItem(k){ return this._d[k] ?? null; },
                  setItem(k,v){ this._d[k]=String(v); }, removeItem(k){ delete this._d[k]; } };
  const cf = { reset:0 };
  const fn = new AsyncFunction(
    'document','window','localStorage','sb','CLUB_DOLORES','BORRADOR','cfToken','cfReset','ActiveReunion',
    SLAB + "\n return { enviar: document.getElementById('btn-enviar').onclick, seccion, leerDatos, validar, setRol };");
  const api = await fn(dom, { location: loc }, store, sb,
    '0649e9c5-9e87-4aad-842f-101458e6b33c', 'sgh_solicitud_borrador',
    () => 'cf-token-de-prueba', () => { cf.reset++; }, null);
  // El "camino 2" es una IIFE async que nadie awaitea: dos vueltas de cola alcanzan, porque los
  // stubs resuelven en el acto.
  await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  return { ...api, sb, loc, store, cf, rpc };
}

// Un formulario de propietario válido, ya tipeado.
const FORM = (email) => ({
  'f-nombre':'Juan', 'f-apellido':'Probe', 'f-dni':'12345678', 'f-tel':'2245123456',
  'f-hip-prop':'Tandil', 'f-caballeriza':'Stud Probe', 'f-email':email, 'f-pass':'Probe12345!',
});
async function enviarComo(email, respSignUp){
  const dom = mkDom(FORM(email));
  dom._radios.propietario.checked = true;
  const rpc = [];
  const p = await mkPagina({ dom, respSignUp, rpc });
  await p.enviar();
  return { dom, p, rpc };
}

// ══════════════════════════════ MUTANTES ════════════════════════════════════
const MUTANTES = [
  { id:'M1', desc:'se neutraliza el check de identities (el bug original vuelve)', mata:['B4','B5'],
    from:`  if (Array.isArray(authData.user?.identities) && authData.user.identities.length === 0) {`,
    to:  `  if (false) {` },

  { id:'M2', desc:'la pantalla filtra datos de la cuenta ajena (enumeración por copy)', mata:['B12'],
    from:`        ningún mail: iniciá sesión con tu contraseña para continuar.`,
    to:  `        ningún mail: ya sos secretario del hipódromo, iniciá sesión.` },

  { id:'M3', desc:'el corte se invierte: el alta NUEVA se toma por cuenta existente', mata:['B1'],
    from:`authData.user.identities.length === 0) {`,
    to:  `authData.user.identities.length >= 0) {` },

  { id:'M4', desc:'seccion() no conoce sec-existe: la pantalla nunca se muestra', mata:['B4'],
    from:`  ['sec-form','sec-confirmar','sec-existe','sec-listo','sec-reintento'].forEach(s => {`,
    to:  `  ['sec-form','sec-confirmar','sec-listo','sec-reintento'].forEach(s => {` },

  { id:'M5', desc:'el link de recuperación apunta a reset-password.html (callejón sin salida)',
    mata:['B9'],
    from:`<a class="btn btn-sec" id="lnk-recuperar" href="login.html?recuperar=1"`,
    to:  `<a class="btn btn-sec" id="lnk-recuperar" href="reset-password.html"` },

  { id:'M6', desc:'el deep link ?recuperar=1 de login.html no abre nada', mata:['D1'], archivo:'login',
    from:`  if (new URLSearchParams(window.location.search).get('recuperar') !== '1') return;`,
    to:  `  if (true) return;` },
];

const argMut = process.argv.find(a => a === '--mutantes' || a.startsWith('--mutantes='));
if (argMut) {
  const pedidos = argMut.includes('=')
    ? argMut.split('=')[1].split(',').map(s => s.trim()).filter(Boolean) : null;
  if (pedidos) {
    const desconocidos = pedidos.filter(p => !MUTANTES.some(m => m.id === p));
    if (desconocidos.length) { console.error(`mutantes inexistentes: ${desconocidos.join(', ')}`); process.exit(2); }
  }
  const tanda = pedidos ? MUTANTES.filter(m => pedidos.includes(m.id)) : MUTANTES;
  const SELF = fileURLToPath(import.meta.url);
  const dir = mkdtempSync(join(tmpdir(), 'mut-solicitar-existe-'));
  try { symlinkSync(join(HERE, '..', 'node_modules'), join(dir, 'node_modules'), 'dir'); }
  catch (e) { console.warn(`[runner] no pude symlinkear node_modules al tmpdir: ${e.message}`); }
  console.log(`\n═══ MUTATION TESTING · ${tanda.length}/${MUTANTES.length} mutantes${pedidos ? ` (tanda: ${pedidos.join(',')})` : ''} ═══\n(copias en ${dir} — el repo no se toca)\n`);
  // Una sola captura contra GoTrue para toda la tanda: los mutantes tocan el código de la
  // página, no el servidor, y así la tanda no planta cuentas ni dispara mails de más.
  const CAP = join(dir, 'respuestas.json');
  try {
    execFileSync(process.execPath, [SELF], { env:{ ...process.env, CAPTURA: CAP },
      encoding:'utf8', stdio:['ignore','pipe','pipe'] });
    console.log(`(captura de GoTrue en ${CAP} — los mutantes la reusan)\n`);
  } catch (e) {
    console.error(`✗ no pude capturar las respuestas de GoTrue: ${((e.stdout||'')+(e.stderr||'')).slice(-400)}`);
    process.exit(2);
  }
  let vivos = 0, arnes = 0;
  for (const m of tanda){
    const esLogin = m.archivo === 'login';
    const fuente = esLogin ? LOGIN : HTML;
    if (!fuente.includes(m.from)) {
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el ancla no existe en el fuente. ${m.desc}`);
      arnes++; continue;
    }
    const path = join(dir, `${m.id}.html`);
    writeFileSync(path, fuente.replace(m.from, m.to));
    const env = { ...process.env, RESP_CACHE: CAP, [esLogin ? 'LOGIN_HTML' : 'SOLICITAR_HTML']: path };
    let out = '';
    try { out = execFileSync(process.execPath, [SELF], { env, encoding:'utf8', stdio:['ignore','pipe','pipe'] }); }
    catch (e) { out = (e.stdout||'') + (e.stderr||''); }

    // "murió por assert" vs "murió al arrancar": si no está la línea final, el hijo no llegó a
    // los asserts y del mutante no se sabe nada — reportarlo como SOBREVIVE sería mentir.
    const corrio = /^\d+\/\d+ OK$/m.test(out);
    if (!corrio) {
      const causa = (out.split('\n').find(l => /Error|error:/.test(l)) || '(sin línea de error)').trim();
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el probe no llegó a correr los asserts. ${m.desc}`
        + `\n     ↳ ${causa.slice(0, 160)}`);
      arnes++; continue;
    }
    const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));
    const vivo = muertos.length === 0;
    if (vivo) vivos++;
    console.log(`${vivo?'❌':'✅'} ${m.id} ${vivo?'SOBREVIVE':'muere'} — ${m.desc}`
      + `  [esperaba matar ${m.mata.join(',')}${muertos.length?`; murieron ${muertos.join(',')}`:''}]`);
  }
  const partes = [`${tanda.length - vivos - arnes} muertos`];
  if (vivos) partes.push(`${vivos} SOBREVIVEN`);
  if (arnes) partes.push(`${arnes} ERROR DE ARNÉS`);
  console.log(`\n${vivos===0 && arnes===0 ? '✅ TANDA LIMPIA' : '❌ TANDA CON HALLAZGOS'} — ${tanda.length} probados · ${partes.join(' · ')}\n`);
  process.exit(vivos === 0 && arnes === 0 ? 0 : 1);
}

// ══════════════════════════════ CORRIDA NORMAL ══════════════════════════════
const RUN = Math.random().toString(36).slice(2, 8);
const MIOS = new Set();                          // los mails que planta esta corrida
const mail = (q) => { const m = `probe-${q}-${RUN}@sgh-probe.invalid`; MIOS.add(m); return m; };
const PASS = `Probe-${RUN}-x9!`;

// El teardown se verifica por ESTADO —listar y ver que no quedó ninguno de los míos— y no por
// los ids que fui juntando: en el caso obfuscado GoTrue devuelve un id que no existe, así que
// una lista de ids no es prueba de nada.
const censo = async () => {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  return { total: data.users.length, mios: data.users.filter(u => MIOS.has(u.email || '')) };
};

// El mismo <script> que carga la página, corrido acá: la señal depende de la versión.
const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
async function clienteDelCdn(){
  const src = await (await fetch(CDN)).text();
  const umd = new Function(src + '\n;return supabase;')();
  const ver = (src.match(/supabase-js\/(2\.[0-9.]+)/) || [])[1] || '?';
  return { ver, sb: umd.createClient(SUPABASE_URL, KEY, { auth:{ autoRefreshToken:false, persistSession:false } }) };
}

const CACHE = process.env.RESP_CACHE ? JSON.parse(readFileSync(process.env.RESP_CACHE, 'utf8')) : null;

(async () => {
  const antes = CACHE ? null : await censo();
  try {
    // ── A) GOTRUE REAL, CON EL BUNDLE DE LA PÁGINA ──────────────────────────
    // La secret key saltea Turnstile (probe_autoregistro_e2e.mjs §0); el resto del endpoint es
    // el mismo que pega el navegador.
    // Con RESP_CACHE las respuestas vienen de una captura previa: es lo que corren los mutantes,
    // que ejercitan el código de la página y no GoTrue. Así la tanda de 6 no manda 12 mails.
    let ver, rNuevo, rSinConf, rConf, idSinConf, idConf, mNuevo, mSinConf, mConf;
    const enVivo = !CACHE;
    if (CACHE) {
      ({ ver, rNuevo, rSinConf, rConf, idSinConf, idConf, mNuevo, mSinConf, mConf } = CACHE);
    } else {
      const cli = await clienteDelCdn();
      ver = cli.ver;
      const signUp = (email) => cli.sb.auth.signUp({ email, password: PASS });

      mNuevo = mail('nuevo');
      rNuevo = await signUp(mNuevo);

      mSinConf = mail('sinconf');
      const { data: uSinConf, error: eSinConf } = await admin.auth.admin.createUser({
        email: mSinConf, password: PASS, email_confirm: false });
      if (eSinConf) throw new Error(`createUser(sinconf): ${eSinConf.message}`);
      idSinConf = uSinConf.user.id;
      rSinConf = await signUp(mSinConf);

      mConf = mail('confirmada');
      const { data: uConf, error: eConf } = await admin.auth.admin.createUser({
        email: mConf, password: PASS, email_confirm: true });
      if (eConf) throw new Error(`createUser(confirmada): ${eConf.message}`);
      idConf = uConf.user.id;
      rConf = await signUp(mConf);
    }

    ok('A0) la página carga supabase-js del CDN por major, sin pin de versión',
       HTML.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2'),
       `bundle probado = ${ver}${enVivo ? '' : ' (respuestas cacheadas)'}`);
    ok('A1) alta NUEVA: GoTrue no da error y devuelve identities con 1 entrada',
       !rNuevo.error && rNuevo.data?.user?.identities?.length === 1,
       rNuevo.error?.message ?? `identities=${JSON.stringify(rNuevo.data?.user?.identities?.length)}`);
    ok('A2) y no devuelve sesión: falta confirmar el mail',
       rNuevo.data?.session === null, JSON.stringify(rNuevo.data?.session));
    ok('A3) alta repetida sobre cuenta SIN confirmar: identities sigue en 1 (reenvía el mail)',
       !rSinConf.error && rSinConf.data?.user?.identities?.length === 1,
       rSinConf.error?.message ?? `identities=${rSinConf.data?.user?.identities?.length}`);
    ok('A3b) y es el usuario REAL, no uno obfuscado',
       rSinConf.data?.user?.id === idSinConf, `${rSinConf.data?.user?.id} vs ${idSinConf}`);
    ok('A4) alta repetida sobre cuenta CONFIRMADA: 200, sin error, identities VACÍO — el caso de Fede',
       !rConf.error && Array.isArray(rConf.data?.user?.identities) && rConf.data.user.identities.length === 0,
       rConf.error?.message ?? `identities=${JSON.stringify(rConf.data?.user?.identities)}`);
    ok('A4b) el user que devuelve es obfuscado: id distinto del real',
       rConf.data?.user?.id !== idConf, `${rConf.data?.user?.id} vs ${idConf}`);
    ok('A4c) y trae un confirmation_sent_at igual — por eso no sirve como señal',
       !!rConf.data?.user?.confirmation_sent_at, String(rConf.data?.user?.confirmation_sent_at));
    if (enVivo) {
      const { data: uConfPost } = await admin.auth.admin.getUserById(idConf);
      ok('A4d) la cuenta real quedó intacta: sigue confirmada y sin mail nuevo',
         !!uConfPost?.user?.email_confirmed_at, String(uConfPost?.user?.email_confirmed_at));
    }
    ok('A5) el bundle que carga la página SIGUE exponiendo user.identities — si esto se pone en '
       + 'rojo, el fix quedó en código muerto y hay que pinear la versión',
       !!rNuevo.data?.user && Array.isArray(rNuevo.data.user.identities)
       && !!rConf.data?.user && Array.isArray(rConf.data.user.identities), `supabase-js ${ver}`);
    if (process.env.CAPTURA) {
      writeFileSync(process.env.CAPTURA,
        JSON.stringify({ ver, rNuevo, rSinConf, rConf, idSinConf, idConf, mNuevo, mSinConf, mConf }));
    }

    // ── B) LA PÁGINA, CON ESAS RESPUESTAS ───────────────────────────────────
    const b1 = await enviarComo(mNuevo, rNuevo);
    ok('B1) alta nueva → "revisá tu correo"', b1.dom.visible('sec-confirmar'));
    ok('B2) con el correo escrito en la pantalla',
       b1.dom._n['conf-email'].textContent === mNuevo, b1.dom._n['conf-email'].textContent);
    ok('B3) y sin mostrar la pantalla de cuenta existente', !b1.dom.visible('sec-existe'));

    const b2 = await enviarComo(mConf, rConf);
    ok('B4) alta repetida sobre confirmada → pantalla de cuenta existente', b2.dom.visible('sec-existe'));
    ok('B5) y NO "revisá tu correo" — el mail nunca se emitió', !b2.dom.visible('sec-confirmar'));
    ok('B6) con el correo escrito, y sin decir nada más de la cuenta',
       b2.dom._n['existe-email'].textContent === mConf, b2.dom._n['existe-email'].textContent);

    const b3 = await enviarComo(mSinConf, rSinConf);
    ok('B7) reenvío a cuenta sin confirmar → sigue siendo "revisá tu correo" (no hay falso positivo)',
       b3.dom.visible('sec-confirmar') && !b3.dom.visible('sec-existe'));

    ok('B8) el link a login.html está en el HTML real', link('lnk-login') === 'login.html',
       String(link('lnk-login')));
    ok('B9) y el de contraseña abre el panel de recuperación de login.html',
       link('lnk-recuperar') === 'login.html?recuperar=1', String(link('lnk-recuperar')));
    ok('B10) el caso de cuenta existente no llama a la RPC', b2.rpc.length === 0,
       JSON.stringify(b2.rpc));
    ok('B11) el botón queda usable y el captcha reseteado para reintentar',
       b2.dom._n['btn-enviar'].disabled === false && b2.p.cf.reset === 1,
       `disabled=${b2.dom._n['btn-enviar'].disabled} · cfReset=${b2.p.cf.reset}`);
    ok('B12) el texto de la pantalla no nombra rol, club ni nada de la cuenta',
       !/secretari|propietario habilitado|club|hipódromo de/i.test(
         HTML.slice(HTML.indexOf('<div id="sec-existe"'), HTML.indexOf('<!-- ===== SOLICITUD ENVIADA'))));

    // ── C) EL CAMINO 2 (YA LOGUEADO) SIGUE INTACTO ──────────────────────────
    const SES = { user:{ id:'uid-probe' } };
    const c1 = await mkPagina({ dom: mkDom(FORM('x@y.com')), session: SES,
      tablas: { usuarios: { id:'u1' }, solicitudes_acceso: null } });
    ok('C1) con sesión y usuario del sistema → portal.html', c1.loc.reemplazo === 'portal.html',
       String(c1.loc.reemplazo));

    const domC2 = mkDom(FORM('x@y.com'));
    const c2 = await mkPagina({ dom: domC2, session: SES,
      tablas: { usuarios: null, solicitudes_acceso: { id:'s1' } } });
    ok('C2) con sesión y solicitud ya enviada → "solicitud enviada", sin redirigir',
       domC2.visible('sec-listo') && c2.loc.reemplazo === undefined,
       `sec-listo=${domC2._n['sec-listo'].style.display} · replace=${c2.loc.reemplazo}`);

    const domC3 = mkDom(FORM('x@y.com'));
    const c3 = await mkPagina({ dom: domC3, session: SES, tablas: { usuarios:null, solicitudes_acceso:null } });
    ok('C3) con sesión, sin usuario y sin solicitud → el form sin el bloque de cuenta',
       domC3._n['grp-cuenta'].style.display === 'none' && c3.loc.reemplazo === undefined,
       `grp-cuenta=${domC3._n['grp-cuenta'].style.display} · replace=${c3.loc.reemplazo}`);

    // ── D) EL DEEP LINK DE login.html ───────────────────────────────────────
    const dlSrc = desdeFirma(LOGIN, '(function abrirRecuperar() {').src + ')();';
    const correDeep = async (search) => {
      let llamado = 0;
      await new AsyncFunction('window','showForgot', dlSrc)({ location:{ search } }, () => { llamado++; });
      return llamado;
    };
    ok('D1) ?recuperar=1 abre el panel de "olvidé mi contraseña"', await correDeep('?recuperar=1') === 1);
    ok('D2) sin el parámetro no toca nada', await correDeep('') === 0);
    ok('D3) showForgot existe en login.html', LOGIN.includes('function showForgot() {'));
    ok('D4) reset-password.html sigue sin formulario para pedir el link — por eso no se linkea ahí',
       !readFileSync(join(HERE, '..', 'reset-password.html'), 'utf8').includes('resetPasswordForEmail'));

  } catch (err) {
    ok('💥 el probe corrió entero', false, err.message);
  } finally {
    // ── teardown, verificado por ESTADO ─────────────────────────────────────
    // Con RESP_CACHE no se plantó nada: no hay qué borrar ni conteo con qué comparar.
    if (CACHE) { /* sin fixtures propias */ } else {
    const vivos = (await censo()).mios;
    for (const u of vivos) {
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) console.error(`  ⚠️  no pude borrar auth.users ${u.email}: ${error.message}`);
    }
    const despues = await censo();
    ok('Z1) teardown: no quedó ninguna cuenta de esta corrida',
       despues.mios.length === 0, despues.mios.map(u => u.email).join(', '));
    ok('Z2) y auth.users volvió al conteo de antes',
       despues.total === antes.total, `antes=${antes.total} · después=${despues.total}`);
    }
  }

  console.log('\n── Probe · "ese correo ya está registrado" en solicitar-acceso.html ──');
  console.log(`   solicitar=${SOLICITAR_PATH}\n   login=${LOGIN_PATH}\n   run=${RUN}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
