/**
 * probe_buscador_spc.mjs — el buscador de caballos del modal de anotar.
 *
 * EL PEDIDO (Fede, 08/09/2026)
 * ---------------------------------------------------------------------------
 * Que sugiera mientras se tipea, desde el tercer carácter, encontrando el
 * término en cualquier parte del nombre.
 *
 * QUÉ CAMBIÓ
 * ---------------------------------------------------------------------------
 * Ya había autocompletado —`oninput`, umbral de 2, debounce de 250 ms, contra
 * `rpc_buscar_spc`—, pero contra el SERVIDOR y con un agujero: `ILIKE` NO es
 * acento-insensible y `unaccent` no está instalada (GOTCHA #71), así que
 * "saltena" devolvía CERO para "CHINITA SALTEÑA".
 *
 * Ahora el padrón se trae UNA vez al abrir el modal (`rpc_padron_spcs`, 181
 * ejemplares, 42,5 kB de JSON — 11 kB por el cable con gzip) y se filtra en el
 * cliente: instantáneo y con los acentos resueltos por `normalize('NFD')`.
 *
 * EL ORÁCULO NO ES LA PANTALLA
 * ---------------------------------------------------------------------------
 * Los asserts no comparan el buscador contra sí mismo ni contra otra pantalla:
 * comparan contra (1) el padrón REAL leído aparte con la clave de servicio y
 * (2) casos concretos escritos a mano. Lección de GOTCHA #93.
 *
 * QUIÉN CORRE EL CÓDIGO
 * ---------------------------------------------------------------------------
 * El arnés recibe un cliente firmado como USUARIO DE PORTAL efímero, no la
 * clave de servicio: `rpc_padron_spcs` exige `fn_is_staff() OR
 * fn_is_portal_user()` y con la secret key `auth.uid()` es NULL. Correrlo como
 * portal es además lo que verifica la regla de dominio que no cambia —
 * cualquier entrenador puede anotar cualquier SPC.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_buscador_spc.mjs
 *   node tests/probe_buscador_spc.mjs --mutantes
 */

process.env.TZ = 'America/Argentina/Buenos_Aires';

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';

const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }
const admin = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const HERE = dirname(fileURLToPath(import.meta.url));
const PORTAL_PATH = process.env.PORTAL_HTML || join(HERE, '..', 'portal.html');
const EDAD_PATH   = process.env.EDAD_JS     || join(HERE, '..', 'edad-spc.js');
const PORTAL = readFileSync(PORTAL_PATH, 'utf8');
const EDAD   = readFileSync(EDAD_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

const RUN = Math.random().toString(36).slice(2, 8);
const PASS = `Probe-${RUN}-${Math.random().toString(36).slice(2, 10)}!`;
const fx = { authIds: [], usuarios: [], profesionales: [] };
const die = (ctx, e) => { throw new Error(`[${ctx}] ${e?.message ?? JSON.stringify(e)}`); };

async function crearPortal() {
  const email = `probe-spc-${RUN}@sgh-probe.invalid`;
  const { data: prof, error: e0 } = await admin.from('profesionales')
    .insert({ club_id: CLUB, tipo: 'entrenador', nombre: 'PROBE-SPC', apellido: RUN, hipodromo_patente: 'DOL' })
    .select('id').single();
  if (e0) die('insert profesionales', e0);
  fx.profesionales.push(prof.id);

  const { data: au, error: e1 } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  if (e1) die('createUser', e1);
  fx.authIds.push(au.user.id);

  const { error: e2 } = await admin.from('usuarios').insert({
    email, nombre_completo: `Probe SPC ${RUN}`, club_id: CLUB, rol: 'profesional',
    activo: true, estado: 'activo', password_hash: '', auth_user_id: au.user.id,
    entidad_tipo: 'profesional', entidad_id: prof.id,
  });
  if (e2) die('insert usuarios', e2);
  fx.usuarios.push(email);

  const { data: link, error: e3 } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (e3) die('generateLink', e3);
  const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e4 } = await sb.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (e4) die('verifyOtp', e4);
  return sb;
}

/**
 * Barre fixtures de corridas anteriores que quedaron a medias. Una corrida
 * matada (SIGKILL, timeout) nunca llega al `finally`: pasó el 08/09 con la
 * tanda de mutantes y dejó un profesional y un usuario de auth colgados.
 * El barrido está acotado al namespace del probe — nunca toca datos reales.
 */
async function barrerHuerfanos() {
  const { data: us } = await admin.from('usuarios')
    .select('email').like('email', 'probe-spc-%@sgh-probe.invalid');
  for (const u of us || []) await admin.from('usuarios').delete().eq('email', u.email);

  const { data: au } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of (au?.users || []).filter(x => /^probe-spc-.*@sgh-probe\.invalid$/.test(x.email || '')))
    await admin.auth.admin.deleteUser(u.id).catch(() => {});

  const { data: pr } = await admin.from('profesionales').select('id').eq('nombre', 'PROBE-SPC');
  for (const p of pr || []) await admin.from('profesionales').delete().eq('id', p.id).eq('nombre', 'PROBE-SPC');
}

async function limpiar() {
  for (const e of fx.usuarios)       await admin.from('usuarios').delete().eq('email', e);
  for (const id of fx.authIds)       await admin.auth.admin.deleteUser(id).catch(() => {});
  for (const id of fx.profesionales) await admin.from('profesionales').delete().eq('id', id);
}

function extractFn(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  let d = 0;
  for (let k = i + firma.length - 1; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error(`no pude cerrar: ${firma}`);
}
function extractConst(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  return src.slice(i, src.indexOf('\n', i));
}

// ── mini-DOM ────────────────────────────────────────────────────────────────
function mkDom() {
  const nodos = {};
  const get = (id) => (nodos[id] ||= {
    id, innerHTML: '', value: '', textContent: '', style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, appendChild() {}, remove() {},
  });
  return { _get: get, getElementById: get, querySelectorAll: () => [],
           createElement: () => ({}), addEventListener() {} };
}

// ── el arnés: código REAL de portal.html + edad-spc.js ──────────────────────
async function mkBuscador(dom, sbPortal) {
  const piezas = [
    extractFn(PORTAL, 'function esc(v) {'),
    extractFn(PORTAL, 'function fechaCorta(iso) {'),
    extractConst(PORTAL, 'const MIN_CHARS_BUSQUEDA'),
    extractFn(PORTAL, 'function normalizarBusqueda(s) {'),
    extractFn(PORTAL, 'function edadYNacimiento(fechaNac) {'),
    extractFn(PORTAL, 'async function cargarPadronSpcs() {'),
    extractFn(PORTAL, 'function onBuscarSpc(q) {'),
    extractFn(PORTAL, 'function buscarEnPadron(termino) {'),
  ].join('\n\n');

  const cuerpo = `
    ${EDAD}
    // edad-spc.js es un IIFE que cuelga del global; acá el global es el objeto
    // que recibe el arnés, así que no quedan como identificadores sueltos.
    const { edadSPC, edadSPCTexto } = window;
    let padronSpcs = null;
    let resultadosBusqueda = null;
    let renderCalls = 0;
    function renderListaCaballosModal() { renderCalls++; }
    ${piezas}
    return { cargarPadronSpcs, onBuscarSpc, buscarEnPadron, normalizarBusqueda,
             edadYNacimiento, edadSPC, MIN_CHARS_BUSQUEDA,
             _get: () => ({ padronSpcs, resultadosBusqueda, renderCalls }) };`;

  return new AsyncFunction('document', 'sb', 'console', 'window', cuerpo)(dom, sbPortal, console, {});
}

// ═════════════════════════════ MUTATION TESTING ═════════════════════════════
const MUTANTES = [
  { id: 'M1', archivo: 'portal', desc: 'el umbral baja a 1 carácter', mata: ['U1'],
    from: `const MIN_CHARS_BUSQUEDA = 3;`, to: `const MIN_CHARS_BUSQUEDA = 1;` },

  { id: 'M2', archivo: 'portal', desc: 'el umbral sube a 4 — con 3 ya no sugiere', mata: ['U2'],
    from: `const MIN_CHARS_BUSQUEDA = 3;`, to: `const MIN_CHARS_BUSQUEDA = 4;` },

  { id: 'M3', archivo: 'portal', desc: 'la coincidencia pasa a ser por PREFIJO — "quita" pierde MOSQUITA',
    mata: ['B1', 'B2', 'B3'],
    from: `    .filter(r => r._busca.includes(t))`, to: `    .filter(r => r._busca.startsWith(t))` },

  { id: 'M4', archivo: 'portal', desc: 'se pierde la insensibilidad a ACENTOS', mata: ['A1', 'B3'],
    from: `  return (s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim();`,
    to:   `  return (s || '').toLowerCase().trim();` },

  { id: 'M5', archivo: 'portal', desc: 'se pierde la insensibilidad a MAYÚSCULAS', mata: ['A2', 'B3'],
    from: `  return (s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim();`,
    to:   `  return (s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();` },

  { id: 'M6', archivo: 'portal', desc: 'el padrón no se cachea: cada búsqueda lo vuelve a pedir', mata: ['C2'],
    from: `  if (padronSpcs !== null) return;`, to: `  if (false) return;` },

  { id: 'M7', archivo: 'portal', desc: 'los que EMPIEZAN con el término dejan de ir primero', mata: ['B4'],
    from: `      return pa !== pb ? pa - pb : a._busca.localeCompare(b._busca);`,
    to:   `      return a._busca.localeCompare(b._busca);` },

  { id: 'M8', archivo: 'portal', desc: 'onBuscarSpc deja de respetar el umbral', mata: ['U3'],
    from: `  if (t.length < MIN_CHARS_BUSQUEDA) {\n    resultadosBusqueda = null;`,
    to:   `  if (false) {\n    resultadosBusqueda = null;` },

  { id: 'M9', archivo: 'portal', desc: 'la sugerencia deja de mostrar la edad', mata: ['D1'],
    from: `  return txt ? \`\${txt} · \${corta}\` : corta;`, to: `  return corta;` },

  { id: 'M10', archivo: 'edad', desc: 'la edad ignora el corte del 1° de julio', mata: ['D4'],
    from: `if (ref.mes < 7) edad--;`, to: `` },
];

const argMut = process.argv.find(a => a === '--mutantes' || a.startsWith('--mutantes='));
if (argMut) {
  const pedidos = argMut.includes('=') ? argMut.split('=')[1].split(',').map(s => s.trim()).filter(Boolean) : null;
  if (pedidos) {
    const d = pedidos.filter(p => !MUTANTES.some(m => m.id === p));
    if (d.length) { console.error(`mutantes inexistentes: ${d.join(', ')}`); process.exit(2); }
  }
  const tanda = pedidos ? MUTANTES.filter(m => pedidos.includes(m.id)) : MUTANTES;
  const SELF = fileURLToPath(import.meta.url);
  const dir = mkdtempSync(join(tmpdir(), 'mut-buscador-'));
  try { symlinkSync(join(HERE, '..', 'node_modules'), join(dir, 'node_modules'), 'dir'); }
  catch (e) { console.warn(`[runner] symlink: ${e.message}`); }
  const SRC = { portal: PORTAL, edad: EDAD };
  const ENV = { portal: 'PORTAL_HTML', edad: 'EDAD_JS' };
  const EXT = { portal: 'html', edad: 'js' };
  console.log(`\n═══ MUTATION TESTING · ${tanda.length}/${MUTANTES.length} mutantes ═══\n(copias en ${dir} — el repo no se toca)\n`);
  let vivos = 0, arnes = 0;
  for (const m of tanda) {
    if (!SRC[m.archivo].includes(m.from)) {
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el ancla no existe. ${m.desc}`); arnes++; continue;
    }
    const p = join(dir, `${m.id}.${EXT[m.archivo]}`);
    writeFileSync(p, SRC[m.archivo].replace(m.from, m.to));
    let out = '';
    try { out = execFileSync(process.execPath, [SELF], { env: { ...process.env, [ENV[m.archivo]]: p }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    if (!/^\d+\/\d+ OK$/m.test(out)) {   // GOTCHA #84
      const causa = (out.split('\n').find(l => /Error|error:/.test(l)) || '(sin línea de error)').trim();
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — no llegó a los asserts. ${m.desc}\n     ↳ ${causa.slice(0, 200)}`);
      arnes++; continue;
    }
    const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));   // GOTCHA #82
    const vivo = muertos.length === 0;
    if (vivo) vivos++;
    console.log(`${vivo ? '❌' : '✅'} ${m.id} ${vivo ? 'SOBREVIVE' : 'muere'} — ${m.desc}`
      + `  [esperaba matar ${m.mata.join(',')}${muertos.length ? `; murieron ${muertos.join(',')}` : ''}]`);
  }
  const partes = [`${tanda.length - vivos - arnes} muertos`];
  if (vivos) partes.push(`${vivos} SOBREVIVEN`);
  if (arnes) partes.push(`${arnes} ERROR DE ARNÉS`);
  console.log(`\n${vivos === 0 && arnes === 0 ? '✅ TANDA LIMPIA' : '❌ TANDA CON HALLAZGOS'} — ${tanda.length} probados · ${partes.join(' · ')}\n`);
  process.exit(vivos === 0 && arnes === 0 ? 0 : 1);
}

// ══════════════════════════════ CORRIDA NORMAL ══════════════════════════════
(async () => {
  try {
    // ── ORÁCULO: el padrón leído APARTE, sin pasar por el buscador ──────────
    const { data: padronReal, error } = await admin.from('spcs')
      .select('id,nombre,sexo,fecha_nacimiento,studbook_id,padrillo_nombre,madre_nombre')
      .order('nombre');
    if (error) die('padrón oráculo', error);
    const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const esperados = (q) => padronReal.filter(r => norm(r.nombre).includes(norm(q)))
      .map(r => r.nombre).sort();

    await barrerHuerfanos();
    const sbPortal = await crearPortal();
    const B = await mkBuscador(mkDom(), sbPortal);

    // ── C) LA CARGA DEL PADRÓN ─────────────────────────────────────────────
    ok('C1) el umbral está en 3 caracteres', B.MIN_CHARS_BUSQUEDA === 3, `MIN=${B.MIN_CHARS_BUSQUEDA}`);

    await B.cargarPadronSpcs();
    const cargado = B._get().padronSpcs;
    ok('C0) un ENTRENADOR trae el padrón COMPLETO — misma cuenta que el oráculo',
       cargado.length === padronReal.length,
       `buscador=${cargado?.length} · oráculo=${padronReal.length}`);

    const antes = cargado;
    await B.cargarPadronSpcs();
    ok('C2) el padrón se cachea: la segunda llamada no lo vuelve a pedir',
       B._get().padronSpcs === antes);

    const bytes = JSON.stringify(cargado.map(({ _busca, ...r }) => r)).length;
    ok('C3) el payload es chico — filtrar en el cliente es viable',
       bytes < 80000, `${cargado.length} SPC · ${bytes} bytes`);

    const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const { error: eAnon } = await anon.rpc('rpc_padron_spcs');
    ok('C4) sin sesión el RPC rechaza — el padrón no queda público',
       !!eAnon, eAnon ? eAnon.message : 'DEVOLVIÓ DATOS SIN AUTENTICAR');

    // ── U) EL UMBRAL ───────────────────────────────────────────────────────
    ok('U1) con MENOS de 3 caracteres no sugiere nada',
       B.buscarEnPadron('').length === 0 && B.buscarEnPadron('w').length === 0
       && B.buscarEnPadron('wa').length === 0,
       `''=${B.buscarEnPadron('').length} 'w'=${B.buscarEnPadron('w').length} 'wa'=${B.buscarEnPadron('wa').length}`);

    ok('U2) con 3 caracteres YA sugiere',
       B.buscarEnPadron('wav').length > 0 && B.buscarEnPadron('rio').length > 0,
       `'wav'=${B.buscarEnPadron('wav').length} · 'rio'=${B.buscarEnPadron('rio').length}`);

    ok('U3) onBuscarSpc respeta el umbral: abajo de 3 vuelve a la lista propia',
       (() => { B.onBuscarSpc('wa'); const a = B._get().resultadosBusqueda === null;
                B.onBuscarSpc('wav'); const b = Array.isArray(B._get().resultadosBusqueda);
                return a && b; })());

    // ── B) COINCIDENCIA PARCIAL ────────────────────────────────────────────
    const nombres = (q) => B.buscarEnPadron(q).map(r => r.nombre).sort();

    ok('B1) coincide en el MEDIO: "quita" encuentra "MOSQUITA GARDEN"',
       nombres('quita').includes('MOSQUITA GARDEN'), `→ [${nombres('quita')}]`);

    ok('B2) coincide al FINAL: "garden" encuentra "MOSQUITA GARDEN"',
       nombres('garden').includes('MOSQUITA GARDEN'), `→ [${nombres('garden')}]`);

    // Contra el ORÁCULO, no contra sí mismo: para cada término el conjunto que
    // devuelve el buscador tiene que ser EXACTAMENTE el de filtrar el padrón
    // real por su cuenta.
    const TERMINOS = ['quita', 'chinita', 'saltena', 'SALTEÑA', 'wave', 'first', 'foot', 'gauch', 'rio', 'río', 'zzz'];
    const malos = TERMINOS.filter(q => JSON.stringify(nombres(q)) !== JSON.stringify(esperados(q)));
    ok('B3) para 11 términos el resultado es EXACTAMENTE el del padrón real filtrado aparte',
       malos.length === 0,
       malos.length ? malos.map(q => `"${q}": buscador=[${nombres(q)}] oráculo=[${esperados(q)}]`).join(' · ')
                    : TERMINOS.map(q => `${q}:${nombres(q).length}`).join(' '));

    ok('B4) los que EMPIEZAN con el término van primero',
       (() => { const r = B.buscarEnPadron('rio').map(x => norm(x.nombre));
                if (r.length < 2 || !r.some(n => n.startsWith('rio')) || !r.some(n => !n.startsWith('rio'))) return false;
                return r.map(n => n.startsWith('rio')).lastIndexOf(true)
                     < r.findIndex(n => !n.startsWith('rio')); })(),
       `"rio" → [${B.buscarEnPadron('rio').map(x => x.nombre)}]`);

    // ── A) ACENTOS Y MAYÚSCULAS ────────────────────────────────────────────
    ok('A1) SIN acentos encuentra CON acentos: "saltena" → "CHINITA SALTEÑA"',
       nombres('saltena').includes('CHINITA SALTEÑA'), `→ [${nombres('saltena')}]`);

    ok('A2) insensible a mayúsculas: "CHINITA", "chinita" y "ChInItA" dan lo mismo',
       JSON.stringify(nombres('CHINITA')) === JSON.stringify(nombres('chinita'))
       && JSON.stringify(nombres('ChInItA')) === JSON.stringify(nombres('chinita'))
       && nombres('chinita').includes('CHINITA SALTEÑA'),
       `→ [${nombres('chinita')}]`);

    // ── D) QUÉ MUESTRA CADA SUGERENCIA ─────────────────────────────────────
    const wave = B.buscarEnPadron('wave rimout');
    ok('D0) el duplicado real aparece dos veces — el nombre solo NO alcanza',
       wave.length === 2 && wave[0].nombre === wave[1].nombre && wave[0].id !== wave[1].id,
       `"wave rimout" → ${wave.length}: [${wave.map(r => `${r.nombre}/${r.id.slice(0, 8)}`)}]`);

    const conFecha = cargado.find(r => r.fecha_nacimiento);
    ok('D1) la sugerencia muestra la EDAD además de la fecha',
       /^\d+\s+años?\s+·\s+\d/.test(B.edadYNacimiento(conFecha.fecha_nacimiento)),
       `${conFecha.nombre} (${conFecha.fecha_nacimiento}) → "${B.edadYNacimiento(conFecha.fecha_nacimiento)}"`);

    ok('D2) el render incluye padre × madre y el Stud Book condicional',
       PORTAL.includes("esc(c.padrillo_nombre || '?')} × ${esc(c.madre_nombre || '?')}")
       && /c\.studbook_id \?/.test(PORTAL));

    // La edad contra la regla de la BASE, no contra sí misma.
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: edadDb, error: eEdad } = await admin.rpc('fn_edad_reglamentaria',
      { p_fecha_ref: hoy, p_fecha_nac: conFecha.fecha_nacimiento });
    if (eEdad) die('fn_edad_reglamentaria', eEdad);
    ok('D3) la edad mostrada coincide con fn_edad_reglamentaria de la base',
       String(edadDb) === (B.edadYNacimiento(conFecha.fecha_nacimiento).match(/^(\d+)/) || [])[1],
       `base=${edadDb} · buscador="${B.edadYNacimiento(conFecha.fecha_nacimiento)}"`);

    // D3 sólo mide el corte del 1° de julio la mitad del año: hoy es septiembre
    // y la rama `ref.mes < 7` ni se toca. El caso que el assert dice medir tiene
    // que estar en el fixture (GOTCHA #94), así que acá se fija la referencia a
    // mano a los dos lados del corte y se contrasta contra la función de la base.
    const PARES = [
      ['2022-11-10', '2026-06-30'],   // antes del corte
      ['2022-11-10', '2026-07-01'],   // el día del corte
      ['2022-11-10', '2026-09-08'],
      ['2018-09-02', '2026-02-15'],   // antes del corte, nacido después de julio
      ['2018-09-02', '2026-12-31'],
    ];
    const desvios = [];
    for (const [nac, ref] of PARES) {
      const { data: eDb, error: eE } = await admin.rpc('fn_edad_reglamentaria',
        { p_fecha_ref: ref, p_fecha_nac: nac });
      if (eE) die('fn_edad_reglamentaria', eE);
      const eJs = B.edadSPC(nac, ref);
      if (String(eDb) !== String(eJs)) desvios.push(`nac ${nac} ref ${ref}: base=${eDb} js=${eJs}`);
    }
    ok('D4) la regla del 1° de julio coincide con la base a los DOS lados del corte',
       desvios.length === 0,
       desvios.length ? desvios.join(' · ') : `${PARES.length} pares, incluidos 3 con ref anterior al 1/7`);

    // ── E) LO QUE NO ROMPE ─────────────────────────────────────────────────
    ok('E1) un nombre inexistente devuelve lista vacía, sin explotar',
       B.buscarEnPadron('zzzzqqq').length === 0 && esperados('zzzzqqq').length === 0);

    ok('E2) onBuscarSpc con un nombre inexistente deja resultados vacíos, no null',
       (() => { B.onBuscarSpc('zzzzqqq');
                const r = B._get().resultadosBusqueda;
                return Array.isArray(r) && r.length === 0; })());

    ok('E3) null / undefined / espacios no rompen la normalización',
       B.normalizarBusqueda(null) === '' && B.normalizarBusqueda(undefined) === ''
       && B.normalizarBusqueda('  Wave  ') === 'wave');

    // ── S) ELEGIR UNA SUGERENCIA ───────────────────────────────────────────
    // La sugerencia elegida se identifica por id; el id que trae el buscador
    // tiene que resolver al MISMO ejemplar en la base.
    // Sin `?.` un mutante que deja la búsqueda vacía tira acá y el runner no
    // llega a la línea `NN/NN OK` — se leería como error de arnés (GOTCHA #84).
    const elegido = B.buscarEnPadron('chinita')[0];
    const { data: enDb } = elegido
      ? await admin.from('spcs').select('id,nombre,fecha_nacimiento').eq('id', elegido.id).maybeSingle()
      : { data: null };
    ok('S1) elegir una sugerencia carga el SPC correcto (id → misma fila en la base)',
       !!elegido && !!enDb && enDb.nombre === elegido.nombre
       && enDb.fecha_nacimiento === elegido.fecha_nacimiento,
       elegido ? `${elegido.nombre} · ${elegido.id}` : 'la búsqueda no devolvió nada');

    ok('S2) la regla no cambia: se busca sobre TODO el padrón, sin filtro de tenencia',
       cargado.length === padronReal.length,
       `${cargado.length} de ${padronReal.length} visibles para un entrenador cualquiera`);

    // Teardown verificado por ESTADO (GOTCHA #77): después de limpiar no puede
    // quedar NADA en el namespace del probe.
    await limpiar();
    const { count: cU } = await admin.from('usuarios')
      .select('email', { count: 'exact', head: true }).like('email', 'probe-spc-%@sgh-probe.invalid');
    const { count: cP } = await admin.from('profesionales')
      .select('id', { count: 'exact', head: true }).eq('nombre', 'PROBE-SPC');
    ok('T1) el teardown deja el namespace del probe vacío', cU === 0 && cP === 0,
       `usuarios=${cU} · profesionales=${cP}`);

  } finally {
    await limpiar();
  }

  console.log('\n── Probe · buscador de SPC del portal ──');
  console.log(`   portal=${PORTAL_PATH}`);
  console.log(`   edad=${EDAD_PATH}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const mal = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - mal}/${results.length} OK`);
  process.exit(mal ? 1 : 0);
})();
