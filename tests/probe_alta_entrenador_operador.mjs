/**
 * Probe — la secretaría (rol `operador`) puede crear un entrenador y la ficha sirve para aprobar
 * la solicitud. Código real, sin browser.
 *
 * EL CALLEJÓN SIN SALIDA QUE SE CIERRA
 * ------------------------------------
 * `profesionales.html` ocultaba el botón "+ Nuevo Entrenador" para todo rol que no fuera
 * `super_admin` (commit `302e684`, 08/05/2026 — cuatro meses antes de que existiera el
 * autorregistro). Yesi es `operador`. La bandeja de solicitudes, cuando no hay match, le dice
 * *"creá la ficha desde Entrenadores y volvé"* (`solicitudes.html:324-327`) — y la manda
 * exactamente a la pantalla donde el botón no está. Resultado: no podía aprobar a nadie sin ficha
 * (2 de las 4 solicitudes pendientes de Dolores al 2026-09-10: Lo Gioia y Caporale).
 * Fede confirmó que no había motivo: descuido, no decisión.
 * Diagnóstico: docs/diagnosticos/2026-09-10_alta-entrenador-desde-solicitudes.md
 *
 * LO QUE SE PRUEBA (cuatro piezas, más lo que arrastran)
 * -----------------------------------------------------
 *   1. El `load()` real corrido como `operador` NO esconde `#btn-nuevo`, y el `cardHTML()` real
 *      le da Editar. Eliminar sigue siendo de `super_admin` porque `profesionales_delete` es
 *      `fn_is_super_admin()`: mostrarlo sería un botón que miente.
 *   2. El alta persiste `club_id` (ya estaba bien en este archivo desde ISSUE-049; el assert lo
 *      fija para que no se pierda, que es lo que sí había pasado en `propietarios.html`).
 *   3. ⭐ La ficha recién creada es encontrable por el `buscarFichas()` REAL de
 *      `solicitudes.html` — el circuito completo, que es lo que estaba roto.
 *   4. El `tipo` sale del selector nuevo, no de una constante escondida en el código: un alta
 *      hecha desde `jockeys.html` puede quedar `entrenador`, se puede crear un `ambos`, y editar
 *      un `ambos` no lo degrada.
 *
 * Y de arrastre, ISSUE-073: el UPDATE (modal y toggle) y el DELETE quedan acotados por club, con
 * chequeo de 0 filas — PostgREST devuelve `error: null` cuando no matchea nada.
 * Más el helper nuevo `profesionales-duplicados.js`: `profesionales` NO tiene índice único por
 * documento (los únicos índices son `profesionales_pkey` e `idx_profesionales_club`), así que
 * nada en la base frena un alta repetida.
 *
 * Patrón de tests/README.md § "Browser NO disponible": se extraen del HTML los cuerpos REALES de
 * `load()`, `saveRecord()`, `cardHTML()`, `openModal()`, `toggleEstado()` y `deleteRecord()` de
 * las dos pantallas y de `buscarFichas()` de `solicitudes.html` —por ancla y balance de llaves— y
 * se corren con `new AsyncFunction` inyectando un cliente Supabase REAL y un mini-DOM. Nada se
 * reimplementa acá: si el archivo cambia, el probe corre el archivo cambiado.
 *
 * ESCRIBE EN PRODUCCIÓN. Crea fichas de fixture y las borra en el `finally`. El teardown se
 * verifica por ESTADO (cada id tiene que dejar de existir) y además por CONTEO contra la línea de
 * base. Preflight: barre restos de corridas anteriores por apellido de fixture.
 *
 * Se usa `SUPABASE_SECRET_KEY`, que bypasea RLS a propósito: lo que se prueba es el filtro del
 * CLIENTE, no la policy.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_alta_entrenador_operador.mjs
 *   node tests/probe_alta_entrenador_operador.mjs --mutantes           # los 14 mutantes
 *   node tests/probe_alta_entrenador_operador.mjs --mutantes=M1,M7     # por tanda
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROF_PATH = process.env.PROFESIONALES_HTML || join(HERE, '..', 'profesionales.html');
const JOCK_PATH = process.env.JOCKEYS_HTML       || join(HERE, '..', 'jockeys.html');
const SOL_PATH  = process.env.SOLICITUDES_HTML   || join(HERE, '..', 'solicitudes.html');
const DUP_PATH  = process.env.DUPLICADOS_JS      || join(HERE, '..', 'profesionales-duplicados.js');
const PROF_HTML = readFileSync(PROF_PATH, 'utf8');
const JOCK_HTML = readFileSync(JOCK_PATH, 'utf8');
const SOL_HTML  = readFileSync(SOL_PATH, 'utf8');
const DUP_SRC   = readFileSync(DUP_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const CLUB_DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const CLUB_OTRO    = 'a6da7e40-1515-45dc-8933-4eef33ce937a';   // "Mi Club Hípico"
const APELLIDO_FIX = 'ZZPROBEALTAENT';                          // marca de fixture, para el barrido

const results = [];
const ok = (t, c, n='') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

// ── extracción por ancla ────────────────────────────────────────────────────
function desdeFirma(src, firma){
  const i = src.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  if (!firma.endsWith('{')) throw new Error(`la firma tiene que terminar en '{': ${firma}`);
  let d = 0;
  for (let k = i + firma.length - 1; k < src.length; k++){
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error(`no pude cerrar: ${firma}`);
}
// El CUERPO de la función, sin la firma ni las llaves externas: es lo que va como body del
// AsyncFunction, para que los `return` tempranos del código real sigan siendo returns.
function cuerpoDe(src, firma){
  const fn = desdeFirma(src, firma);
  return fn.slice(fn.indexOf('{') + 1, fn.length - 1);
}
function unaLinea(src, re, quien){
  const m = src.match(re);
  if (!m) throw new Error(`no encontré ${quien}`);
  return m[0];
}

const PROF = {
  load:    cuerpoDe(PROF_HTML, 'async function load() {'),
  save:    cuerpoDe(PROF_HTML, 'async function saveRecord(e) {'),
  toggle:  cuerpoDe(PROF_HTML, 'async function toggleEstado(id, estado, nombre) {'),
  del:     cuerpoDe(PROF_HTML, 'async function deleteRecord(id, nombre) {'),
  openMod: cuerpoDe(PROF_HTML, 'function openModal(rec = null) {'),
  card:    desdeFirma(PROF_HTML, 'function cardHTML(r) {'),
  escape:  desdeFirma(PROF_HTML, 'function escapeHtml(s) {'),
  badge:   desdeFirma(PROF_HTML, 'function estadoBadge(estado) {'),
  fmtDni:  desdeFirma(PROF_HTML, 'function formatDNI(num) {'),
  parseDni:unaLinea(PROF_HTML, /^function parseDNI\(str\).*$/m, 'parseDNI en profesionales.html'),
};
const JOCK = {
  load:    cuerpoDe(JOCK_HTML, 'async function load() {'),
  save:    cuerpoDe(JOCK_HTML, 'async function saveRecord(e) {'),
  openMod: cuerpoDe(JOCK_HTML, 'function openModal(rec = null) {'),
  fmtDni:  desdeFirma(JOCK_HTML, 'function formatDNI(num) {'),
  parseDni:unaLinea(JOCK_HTML, /^function parseDNI\(str\).*$/m, 'parseDNI en jockeys.html'),
};
const CUERPO_BUSCAR = cuerpoDe(SOL_HTML, 'async function buscarFichas(sol, textoManual) {');

// Las constantes de identidad de cada pantalla se leen del archivo, no se hardcodean acá: si
// alguien cambia TIPO_DEFAULT, el probe corre con el valor nuevo y los asserts lo dicen.
const leerConst = (src, nombre) => {
  const m = src.match(new RegExp(`^const ${nombre}\\s*=\\s*(.+?);\\s*$`, 'm'));
  if (!m) throw new Error(`no encontré la const ${nombre}`);
  // eslint-disable-next-line no-new-func
  return new Function(`return (${m[1]});`)();
};
const PROF_TIPO_DEFAULT   = leerConst(PROF_HTML, 'TIPO_DEFAULT');
const PROF_TIPOS_PANTALLA = leerConst(PROF_HTML, 'TIPOS_PANTALLA');
const JOCK_TIPO_DEFAULT   = leerConst(JOCK_HTML, 'TIPO_DEFAULT');
const JOCK_TIPOS_PANTALLA = leerConst(JOCK_HTML, 'TIPOS_PANTALLA');

// ── el helper de duplicados, cargado de verdad ──────────────────────────────
function cargarDup(){
  const g = {};
  // eslint-disable-next-line no-new-func
  new Function('window', DUP_SRC)(g);
  if (typeof g.buscarProfesionalesParecidos !== 'function') {
    throw new Error('profesionales-duplicados.js no expuso buscarProfesionalesParecidos');
  }
  return g;
}
const DUP = cargarDup();

// ── mini-DOM ────────────────────────────────────────────────────────────────
// Los ids salen del HTML REAL: pedir uno que el archivo no tiene revienta el probe en vez de
// devolver un nodo fantasma. Renombrar #f-tipo rompe acá, no en producción.
function mkDom(htmlSrc, valores = {}){
  const IDS = new Set([...htmlSrc.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const nodos = {};
  const nuevo = (id) => ({
    id, value: valores[id] ?? '', textContent: '', innerHTML: '', disabled: false, checked: false,
    onclick: null, style: {}, addEventListener(){},
    classList: { _c:new Set(), add(c){ this._c.add(c); }, remove(c){ this._c.delete(c); },
                 contains(c){ return this._c.has(c); }, toggle(c,on){ on?this._c.add(c):this._c.delete(c); } },
  });
  const get = (id) => {
    if (!IDS.has(id)) throw new Error(`el código pidió #${id} y ese id NO existe en el HTML`);
    return (nodos[id] ||= nuevo(id));
  };
  return { getElementById: get, _n: nodos, val(id){ return get(id).value; } };
}

// ── arneses ─────────────────────────────────────────────────────────────────
// load() real de cualquiera de las dos pantallas. `allData` es una `let` de módulo del archivo;
// acá entra como parámetro y vuelve con un `return` que es la única línea que el arnés agrega.
async function correrLoad(sb, cual, { rol = 'operador', filtroEstado = '' } = {}){
  const html   = cual === 'prof' ? PROF_HTML : JOCK_HTML;
  const cuerpo = cual === 'prof' ? PROF.load : JOCK.load;
  const dom = mkDom(html, { 'filter-estado': filtroEstado, 'search': '' });
  // Se instancia antes de correr, así el assert mira un nodo real y no la ausencia de uno.
  // Sólo profesionales.html tiene ese id: el botón de jockeys.html nunca estuvo gateado y por eso
  // nunca necesitó uno.
  if (cual === 'prof') dom.getElementById('btn-nuevo');
  const toasts = [];
  const efectos = { updateStats:0, filterRender:0 };
  const fn = new AsyncFunction('document','sb','CLUB_ID','currentUser','toast','updateStats','filterRender','allData',
    cuerpo + '\n return allData;');
  const filas = await fn(dom, sb, CLUB_DOLORES, { rol, id:'probe' },
    (msg, tipo='success') => toasts.push({ msg, tipo }),
    () => { efectos.updateStats++; },
    () => { efectos.filterRender++; },
    []);
  return { filas, toasts, efectos, dom };
}

// saveRecord real. Devuelve lo observable: toasts, si cerró el modal y si recargó.
async function correrSave(sb, cual, valores, { clubId = CLUB_DOLORES } = {}){
  const html = cual === 'prof' ? PROF_HTML : JOCK_HTML;
  const P    = cual === 'prof' ? PROF : JOCK;
  const tiposPantalla = cual === 'prof' ? PROF_TIPOS_PANTALLA : JOCK_TIPOS_PANTALLA;
  const dom = mkDom(html, valores);
  const toasts = [];
  const efectos = { cerroModal:0, recargo:0 };
  const fn = new AsyncFunction('document','sb','CLUB_ID','TIPOS_PANTALLA','toast','confirm','closeModal','load','allData','e',
    P.parseDni + '\n' + P.save);
  await fn(dom, sb, clubId, tiposPantalla,
    (msg, tipo='success') => toasts.push({ msg, tipo }),
    () => true,
    () => { efectos.cerroModal++; },
    async () => { efectos.recargo++; },
    [],
    { preventDefault(){} });
  return { toasts, efectos };
}

// cardHTML real de profesionales.html, con el rol que se le pase.
function correrCard(rol, fila){
  const fn = new Function('currentUser','r',
    PROF.escape + '\n' + PROF.badge + '\n' + PROF.fmtDni + '\n' + PROF.card + '\n return cardHTML(r);');
  return fn({ rol }, fila);
}

// openModal real de cualquiera de las dos: interesa qué deja en #f-tipo.
function correrOpenModal(cual, rec){
  const html = cual === 'prof' ? PROF_HTML : JOCK_HTML;
  const P    = cual === 'prof' ? PROF : JOCK;
  const tipoDefault = cual === 'prof' ? PROF_TIPO_DEFAULT : JOCK_TIPO_DEFAULT;
  const dom = mkDom(html);
  const fn = new Function('document','TIPO_DEFAULT','formatDNI','dupLimpiar','apoLoad','rec',
    P.openMod);
  fn(dom, tipoDefault,
     (n) => (n ? String(n) : ''),
     () => {},
     () => {},
     rec);
  return dom;
}

async function correrToggle(sb, id, estado, { clubId = CLUB_DOLORES } = {}){
  const toasts = [];
  const efectos = { recargo:0 };
  const fn = new AsyncFunction('sb','CLUB_ID','toast','confirm','load','id','estado','nombre', PROF.toggle);
  await fn(sb, clubId, (msg, tipo='success') => toasts.push({ msg, tipo }), () => true,
           async () => { efectos.recargo++; }, id, estado, 'fixture');
  return { toasts, efectos };
}

async function correrDelete(sb, id, { clubId = CLUB_DOLORES } = {}){
  const toasts = [];
  const efectos = { recargo:0 };
  const fn = new AsyncFunction('sb','CLUB_ID','toast','confirm','load','id','nombre', PROF.del);
  await fn(sb, clubId, (msg, tipo='success') => toasts.push({ msg, tipo }), () => true,
           async () => { efectos.recargo++; }, id, 'fixture');
  return { toasts, efectos };
}

// buscarFichas() real de solicitudes.html — el verificador del circuito. NO se toca en este fix.
async function correrBuscar(sb, sol, textoManual){
  const fn = new AsyncFunction('sb','CLUB_ID','sol','textoManual', CUERPO_BUSCAR);
  return fn(sb, CLUB_DOLORES, sol, textoManual);
}

// ══════════════════════════════ MUTANTES ════════════════════════════════════
// Uno por cada pieza del cambio, más los bugs originales tal cual estaban.
const MUTANTES = [
  { id:'M1', desc:'BUG ORIGINAL — load() vuelve a esconder "+ Nuevo Entrenador" salvo super_admin',
    archivo:'prof', mata:['A1'],
    from:`  document.getElementById('list-container').innerHTML = '<div class="loading-state"><div class="spinner"></div> Cargando entrenadores…</div>';`,
    to:  `  if (currentUser.rol !== 'super_admin') { document.getElementById('btn-nuevo').style.display = 'none'; }\n`
       + `  document.getElementById('list-container').innerHTML = '<div class="loading-state"><div class="spinner"></div> Cargando entrenadores…</div>';` },

  { id:'M2', desc:'BUG ORIGINAL — cardHTML vuelve a dar Editar sólo a super_admin',
    archivo:'prof', mata:['A2'],
    from:`      <button class="btn-sm btn-edit" onclick='openModal(\${JSON.stringify(r)})'>✏️ Editar</button>`,
    to:  `      \${currentUser.rol === 'super_admin' ? \`<button class="btn-sm btn-edit" onclick='openModal(\${JSON.stringify(r)})'>✏️ Editar</button>\` : ''}` },

  { id:'M3', desc:'Eliminar se muestra a cualquiera — botón que miente (la policy es super_admin)',
    archivo:'prof', mata:['A2b'],
    from:`      \${currentUser.rol === 'super_admin'\n        ? \`<button class="btn-sm btn-delete"`,
    to:  `      \${true\n        ? \`<button class="btn-sm btn-delete"` },

  { id:'M4', desc:'el payload del alta pierde club_id: la ficha nace huérfana e invisible para la bandeja',
    archivo:'prof', mata:['A3','A4','A4b'],
    from:`  const payload = {\n    club_id: CLUB_ID,\n    tipo: document.getElementById('f-tipo').value,`,
    to:  `  const payload = {\n    tipo: document.getElementById('f-tipo').value,` },

  { id:'M5', desc:'BUG ORIGINAL — en profesionales.html el tipo vuelve a estar fijo en el código',
    archivo:'prof', mata:['A5b','A6d'],
    from:`    tipo: document.getElementById('f-tipo').value,`,
    to:  `    tipo: 'entrenador',` },

  { id:'M6', desc:'BUG ORIGINAL — en jockeys.html el tipo vuelve a estar fijo en \'jockey\'',
    archivo:'jock', mata:['A6','A6b'],
    from:`    tipo: document.getElementById('f-tipo').value,`,
    to:  `    tipo: 'jockey',` },

  { id:'M7', desc:'openModal no precarga el tipo real: editar un \'ambos\' lo degrada',
    archivo:'prof', mata:['A7'],
    from:`  document.getElementById('f-tipo').value = rec?.tipo || TIPO_DEFAULT;`,
    to:  `  document.getElementById('f-tipo').value = TIPO_DEFAULT;` },

  { id:'M8', desc:'ISSUE-073 — el UPDATE del modal pierde el acote por club',
    archivo:'prof', mata:['A8'],
    from:`    ? await sb.from('profesionales').update(payload).eq('id', id).eq('club_id', CLUB_ID).select('id')`,
    to:  `    ? await sb.from('profesionales').update(payload).eq('id', id).select('id')` },

  { id:'M9', desc:'el UPDATE de 0 filas canta "actualizado" igual',
    archivo:'prof', mata:['A8b'],
    from:`  if (id && (!filasUpd || filasUpd.length === 0)) {\n    toast('No se pudo actualizar: la ficha no pertenece a este hipódromo.', 'error'); return;\n  }\n`,
    to:  `` },

  { id:'M10', desc:'ISSUE-073 — el toggle rápido de estado pierde el acote por club',
    archivo:'prof', mata:['A9'],
    from:`    .eq('id', id).eq('club_id', CLUB_ID).select('id');\n  if (error) { toast(error.message, 'error'); return; }\n  if (!filasUpd || filasUpd.length === 0) {`,
    to:  `    .eq('id', id).select('id');\n  if (error) { toast(error.message, 'error'); return; }\n  if (!filasUpd || filasUpd.length === 0) {` },

  { id:'M11', desc:'el DELETE pierde el acote por club y borra una ficha de otro hipódromo',
    archivo:'prof', mata:['A10'],
    from:`  const { data: filasDel, error } = await sb.from('profesionales').delete()\n    .eq('id', id).eq('club_id', CLUB_ID).select('id');`,
    to:  `  const { data: filasDel, error } = await sb.from('profesionales').delete()\n    .eq('id', id).select('id');` },

  { id:'M12', desc:'el helper de duplicados deja de buscar por documento — el duplicado real pasa mudo',
    archivo:'dup', mata:['A11'],
    from:`    if (doc) {`, to:  `    if (false) {` },

  { id:'M13', desc:'el helper de duplicados pierde el filtro por club: sugiere fichas de otro hipódromo',
    archivo:'dup', mata:['A12'],
    from:`        .eq('club_id', clubId).ilike('apellido', patron)`,
    to:  `        .ilike('apellido', patron)` },

  { id:'M14', desc:'el helper acepta apellidos de 1-2 letras y trae medio padrón como "parecido"',
    archivo:'dup', mata:['A13'],
    from:`    const apeSirve = normalizar(ape).length >= 3;`,
    to:  `    const apeSirve = normalizar(ape).length >= 1;` },
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
  const dir = mkdtempSync(join(tmpdir(), 'mut-alta-entrenador-'));
  const FUENTE = { prof: PROF_HTML, jock: JOCK_HTML, dup: DUP_SRC };
  const ENVVAR = { prof: 'PROFESIONALES_HTML', jock: 'JOCKEYS_HTML', dup: 'DUPLICADOS_JS' };
  const EXT    = { prof: 'html', jock: 'html', dup: 'js' };
  console.log(`\n═══ MUTATION TESTING · ${tanda.length}/${MUTANTES.length} mutantes${pedidos ? ` (tanda: ${pedidos.join(',')})` : ''} ═══\n(copias en ${dir} — el repo no se toca)\n`);
  let vivos = 0, arnes = 0;
  for (const m of tanda){
    const src = FUENTE[m.archivo];
    if (!src.includes(m.from)) {
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el ancla no existe en el fuente. ${m.desc}`);
      arnes++; continue;
    }
    const path = join(dir, `${m.id}.${EXT[m.archivo]}`);
    writeFileSync(path, src.replace(m.from, m.to));
    const env = { ...process.env };
    env[ENVVAR[m.archivo]] = path;
    let out = '';
    try { out = execFileSync(process.execPath, [SELF], { env, encoding:'utf8', stdio:['ignore','pipe','pipe'] }); }
    catch (e) { out = (e.stdout||'') + (e.stderr||''); }

    // "murió por assert" vs "murió al arrancar": sin la línea final el hijo no llegó a los
    // asserts y del mutante no se sabe nada — reportarlo como SOBREVIVE sería mentir (GOTCHA #90).
    const corrio = /^\d+\/\d+ OK$/m.test(out);
    if (!corrio) {
      const causa = (out.split('\n').find(l => /Error|error:/.test(l)) || '(sin línea de error)').trim();
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el probe no llegó a correr los asserts. ${m.desc}`
        + `\n     ↳ ${causa.slice(0, 160)}`);
      arnes++; continue;
    }
    // El teardown tiene que haber quedado limpio también bajo el mutante: si un mutante deja
    // basura en prod, eso es un hallazgo aunque el mutante muera.
    const sucio = out.includes('❌ Z1)') || out.includes('❌ Z2)');
    const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));
    const vivo = muertos.length === 0;
    if (vivo) vivos++;
    console.log(`${vivo?'❌':'✅'} ${m.id} ${vivo?'SOBREVIVE':'muere'} — ${m.desc}`
      + `  [esperaba matar ${m.mata.join(',')}${muertos.length?`; murieron ${muertos.join(',')}`:''}]`
      + (sucio ? '\n     ⚠ ADEMÁS: el teardown de esa corrida NO quedó limpio' : ''));
  }
  const partes = [`${tanda.length - vivos - arnes} muertos`];
  if (vivos) partes.push(`${vivos} SOBREVIVEN`);
  if (arnes) partes.push(`${arnes} ERROR DE ARNÉS`);
  console.log(`\n${vivos===0 && arnes===0 ? '✅ TANDA LIMPIA' : '❌ TANDA CON HALLAZGOS'} — ${tanda.length} probados · ${partes.join(' · ')}\n`);
  process.exit(vivos === 0 && arnes === 0 ? 0 : 1);
}

// ══════════════════════════════ CORRIDA NORMAL ══════════════════════════════
const URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a).'); process.exit(2); }
const sb = createClient(URL, KEY, { auth:{ persistSession:false } });

// DNIs de fixture, distintos entre sí y estables dentro de la corrida.
const SEMILLA = Date.now() % 100000;
const DNI = {
  A: `77${String(SEMILLA).padStart(6,'0')}`,
  B: `78${String(SEMILLA).padStart(6,'0')}`,
  C: `79${String(SEMILLA).padStart(6,'0')}`,
  D: `76${String(SEMILLA).padStart(6,'0')}`,
  E: `75${String(SEMILLA).padStart(6,'0')}`,
};

const camposProf = (extra={}) => ({
  'f-id':'', 'f-estado':'activo', 'f-estado-original':'', 'f-tipo':'entrenador',
  'f-nombre':'Luciana', 'f-apellido':APELLIDO_FIX, 'f-doc-tipo':'DNI', 'f-doc-nro':'',
  'f-nacimiento':'', 'f-telefono':'', 'f-email':'', 'f-patente':'', 'f-hipodromo-patente':'',
  'f-notas':'fixture de probe', ...extra,
});
const camposJock = (extra={}) => ({
  'f-id':'', 'f-estado':'activo', 'f-estado-original':'', 'f-tipo':'jockey',
  'f-nombre':'Desde Jockeys', 'f-apellido':APELLIDO_FIX, 'f-doc-tipo':'DNI', 'f-doc-nro':'',
  'f-nacimiento':'', 'f-telefono':'', 'f-email':'', 'f-matricula':'', 'f-categoria':'',
  'f-hipodromo-patente':'', 'f-notas':'fixture de probe', ...extra,
});

async function contarPorClub(){
  const q = async (f) => (await sb.from('profesionales').select('id', { count:'exact', head:true }).eq('club_id', f)).count;
  const nulos = (await sb.from('profesionales').select('id', { count:'exact', head:true }).is('club_id', null)).count;
  const total = (await sb.from('profesionales').select('id', { count:'exact', head:true })).count;
  return { total, dolores: await q(CLUB_DOLORES), otro: await q(CLUB_OTRO), nulos };
}
const traer = async (dni) => (await sb.from('profesionales')
  .select('id,club_id,nombre,apellido,tipo,documento_tipo,documento_nro,estado,activo,patente')
  .eq('documento_nro', dni).maybeSingle()).data;

const creados = [];   // ids a borrar en el finally

(async () => {
  let base = null;
  try {
    // ── preflight: barrer restos de corridas anteriores ────────────────────
    const { data: restos } = await sb.from('profesionales').select('id,apellido').like('apellido', `${APELLIDO_FIX}%`);
    if (restos?.length) {
      await sb.from('profesionales').delete().in('id', restos.map(r => r.id));
      console.log(`⚠ preflight: se barrieron ${restos.length} fixture(s) de una corrida anterior`);
    }
    base = await contarPorClub();
    console.log(`   línea de base: total=${base.total} dolores=${base.dolores} otro=${base.otro} nulos=${base.nulos}`);

    ok('A0) la línea de base no tiene fichas huérfanas (club_id NULL) antes de empezar',
       base.nulos === 0, `nulos=${base.nulos}`);

    // ══════ PIEZA 1 · un operador ve el botón y puede editar ═══════════════
    const comoOperador = await correrLoad(sb, 'prof', { rol:'operador' });
    const btn = comoOperador.dom._n['btn-nuevo'];
    ok('A1) ⭐ corriendo el load() REAL como rol `operador`, "+ Nuevo Entrenador" NO queda oculto',
       !!btn && btn.style.display !== 'none'
       && PROF_HTML.includes('+ Nuevo Entrenador'),
       `style.display=${JSON.stringify(btn?.style?.display)}`
       + ` · el botón sigue en el HTML=${PROF_HTML.includes('+ Nuevo Entrenador')}`);

    const filaDemo = { id:'11111111-1111-1111-1111-111111111111', nombre:'Ana', apellido:'Demo',
                       tipo:'entrenador', estado:'activo', documento_nro:'12345678', documento_tipo:'DNI' };
    const cardOper  = correrCard('operador', filaDemo);
    const cardAdmin = correrCard('super_admin', filaDemo);
    ok('A2) cardHTML() le da Editar al operador (la policy de UPDATE es fn_is_staff, que lo incluye)',
       /Editar/.test(cardOper) && /Editar/.test(cardAdmin),
       `operador_tiene_editar=${/Editar/.test(cardOper)} · admin=${/Editar/.test(cardAdmin)}`);

    ok('A2b) …y NO le da Eliminar, porque profesionales_delete es fn_is_super_admin: sería un '
       + 'botón que miente. El super_admin sí lo ve',
       !/Eliminar/.test(cardOper) && /Eliminar/.test(cardAdmin),
       `operador_tiene_eliminar=${/Eliminar/.test(cardOper)} · admin=${/Eliminar/.test(cardAdmin)}`);

    // ══════ PIEZA 2 · el alta persiste el club ═════════════════════════════
    const alta = await correrSave(sb, 'prof', camposProf({ 'f-doc-nro':DNI.A, 'f-patente':'ENT-PROBE' }));
    const fichaA = await traer(DNI.A);
    if (fichaA) creados.push(fichaA.id);

    ok('A3) saveRecord() de profesionales.html crea la ficha CON club_id del hipódromo activo',
       !!fichaA && fichaA.club_id === CLUB_DOLORES,
       `toasts=${JSON.stringify(alta.toasts)} · fila=${JSON.stringify(fichaA)}`);

    ok('A3b) y el resto del payload llegó entero, con el DNI normalizado por parseDNI',
       !!fichaA && fichaA.documento_nro === DNI.A && fichaA.documento_tipo === 'DNI'
       && fichaA.apellido === APELLIDO_FIX && fichaA.estado === 'activo' && fichaA.activo === true
       && fichaA.patente === 'ENT-PROBE',
       JSON.stringify(fichaA));

    // ══════ PIEZA 3 · ⭐ EL CIRCUITO: la bandeja tiene que encontrarla ══════
    // `sol` tiene la forma de la fila real de Luciana Lo Gioia (fee3566e…), con el DNI del fixture.
    const SOL = { id:'probe', rol_pedido:'profesional', documento_nro:DNI.A, apellido:APELLIDO_FIX };
    const exacto = await correrBuscar(sb, SOL);
    ok('A4) ⭐ buscarFichas() de solicitudes.html la encuentra por DNI exacto y la marca EXACTO — '
       + 'el botón "Vincular y aprobar" se habilita',
       exacto.tabla === 'profesionales' && exacto.exactas.length === 1
       && exacto.exactas[0].id === fichaA?.id,
       `exactas=${JSON.stringify(exacto.exactas)} · sugeridas=${exacto.sugeridas.length}`);

    const manual = await correrBuscar(sb, SOL, APELLIDO_FIX);
    ok('A4b) …y el buscador manual de la bandeja también — circuito completo '
       + 'profesionales.html → solicitudes.html',
       manual.manual === true && manual.sugeridas.some(f => f.id === fichaA?.id),
       `sugeridas=${JSON.stringify((manual.sugeridas||[]).map(f => ({id:f.id, ap:f.apellido})))}`);

    // ══════ PIEZA 4 · el tipo sale del selector ════════════════════════════
    ok('A5) con el selector en "Entrenador", la ficha queda `entrenador` y aparece en el listado '
       + 'de esta pantalla',
       fichaA?.tipo === 'entrenador' && PROF_TIPOS_PANTALLA.includes(fichaA?.tipo),
       `tipo=${fichaA?.tipo} · TIPOS_PANTALLA=${JSON.stringify(PROF_TIPOS_PANTALLA)}`);

    // El assert que prueba que el valor SALE DEL SELECTOR y no de una constante: si el tipo
    // estuviera fijo en el código —como estaba— esta ficha saldría `entrenador` igual.
    const altaProfJockey = await correrSave(sb, 'prof', camposProf({
      'f-doc-nro':DNI.E, 'f-tipo':'jockey', 'f-nombre':'Jockey Desde Entrenadores' }));
    const fichaE = await traer(DNI.E);
    if (fichaE) creados.push(fichaE.id);
    ok('A5b) ⭐ eligiendo "Jockey" desde profesionales.html la ficha queda `jockey` — el tipo sale '
       + 'del selector, no de una constante escondida en el código',
       fichaE?.tipo === 'jockey' && fichaE?.club_id === CLUB_DOLORES
       && altaProfJockey.toasts.some(t => /Jockeys/.test(t.msg)),
       `tipo=${fichaE?.tipo} · toasts=${JSON.stringify(altaProfJockey.toasts)}`);

    // El caso que motiva el punto 2: Yesi crea a una entrenadora desde la pantalla que conoce.
    const altaJock = await correrSave(sb, 'jock', camposJock({ 'f-doc-nro':DNI.B, 'f-tipo':'entrenador' }));
    const fichaB = await traer(DNI.B);
    if (fichaB) creados.push(fichaB.id);
    ok('A6) ⭐ un alta hecha desde jockeys.html eligiendo "Entrenador" queda `entrenador`, no '
       + '`jockey` — era el defecto del tipo fijo',
       fichaB?.tipo === 'entrenador' && fichaB?.club_id === CLUB_DOLORES,
       `fila=${JSON.stringify(fichaB)} · toasts=${JSON.stringify(altaJock.toasts)}`);

    ok('A6b) …y avisa que la ficha quedó fuera de este listado, en vez de dejarla "desaparecer"',
       altaJock.toasts.some(t => /Entrenadores/.test(t.msg)) && altaJock.efectos.cerroModal === 1,
       JSON.stringify(altaJock.toasts));

    const listaJock = await correrLoad(sb, 'jock');
    const listaProf = await correrLoad(sb, 'prof');
    ok('A6c) coherencia de los dos listados: la ficha `entrenador` está en Entrenadores y NO en '
       + 'Jockeys, y los dos filtran por club',
       (listaProf.filas||[]).some(r => r.id === fichaB?.id)
       && !(listaJock.filas||[]).some(r => r.id === fichaB?.id)
       && (listaProf.filas||[]).every(r => r.club_id === CLUB_DOLORES)
       && (listaJock.filas||[]).every(r => r.club_id === CLUB_DOLORES),
       `en_prof=${(listaProf.filas||[]).length} · en_jock=${(listaJock.filas||[]).length}`);

    // 'ambos' no se podía crear desde ninguna pantalla: hay 1 sola en la base y entró por importación.
    await correrSave(sb, 'prof', camposProf({ 'f-doc-nro':DNI.C, 'f-tipo':'ambos', 'f-nombre':'Los Dos' }));
    const fichaC = await traer(DNI.C);
    if (fichaC) creados.push(fichaC.id);
    const listaProf2 = await correrLoad(sb, 'prof');
    const listaJock2 = await correrLoad(sb, 'jock');
    ok('A6d) ahora se puede crear un `ambos`, y aparece en LOS DOS listados',
       fichaC?.tipo === 'ambos'
       && (listaProf2.filas||[]).some(r => r.id === fichaC?.id)
       && (listaJock2.filas||[]).some(r => r.id === fichaC?.id),
       `tipo=${fichaC?.tipo}`);

    // El comportamiento viejo que NO hay que perder: editar un 'ambos' no lo degrada.
    const domEditAmbos = correrOpenModal('prof', fichaC);
    ok('A7) openModal() precarga el tipo REAL de la ficha: al editar un `ambos` desde '
       + 'Entrenadores, el selector viene en `ambos` y no lo degrada',
       domEditAmbos._n['f-tipo']?.value === 'ambos',
       `f-tipo=${JSON.stringify(domEditAmbos._n['f-tipo']?.value)}`);

    const domAltaNueva = correrOpenModal('prof', null);
    ok('A7b) …y en un alta nueva el selector arranca en el tipo de la pantalla',
       domAltaNueva._n['f-tipo']?.value === PROF_TIPO_DEFAULT && PROF_TIPO_DEFAULT === 'entrenador',
       `f-tipo=${JSON.stringify(domAltaNueva._n['f-tipo']?.value)} · TIPO_DEFAULT=${PROF_TIPO_DEFAULT}`);

    // ══════ ISSUE-073 · escrituras acotadas por club ═══════════════════════
    const { data: ajena, error: errAjena } = await sb.from('profesionales').insert({
      club_id: CLUB_OTRO, tipo:'entrenador', nombre:'Ajeno', apellido:APELLIDO_FIX,
      documento_nro: DNI.D, documento_tipo:'DNI', estado:'activo', activo:true,
    }).select('id,club_id,nombre,apellido,tipo,estado').single();
    if (errAjena) throw new Error(`no pude plantar el fixture ajeno: ${errAjena.message}`);
    creados.push(ajena.id);

    const edicionAjena = await correrSave(sb, 'prof', camposProf({
      'f-id': ajena.id, 'f-estado-original':'activo', 'f-nombre':'PISADA POR EL PROBE',
      'f-doc-nro': DNI.D,
    }));
    const ajenaDespues = (await sb.from('profesionales')
      .select('id,club_id,nombre,tipo,estado').eq('id', ajena.id).maybeSingle()).data;

    ok('A8) editar por id una ficha de otro club es un no-op: no la pisa NI la mueve de hipódromo',
       ajenaDespues?.nombre === 'Ajeno' && ajenaDespues?.club_id === CLUB_OTRO,
       JSON.stringify(ajenaDespues));

    ok('A8b) …y avisa, en vez de cantar "Entrenador actualizado" sobre 0 filas',
       edicionAjena.toasts.some(t => t.tipo === 'error' && /no pertenece a este hipódromo/i.test(t.msg))
       && !edicionAjena.toasts.some(t => /actualizado/i.test(t.msg))
       && edicionAjena.efectos.cerroModal === 0,
       JSON.stringify(edicionAjena.toasts));

    const toggleAjeno = await correrToggle(sb, ajena.id, 'activo');
    const ajenaTrasToggle = (await sb.from('profesionales')
      .select('estado,activo').eq('id', ajena.id).maybeSingle()).data;
    ok('A9) el toggle rápido de estado tampoco puede tocar una ficha de otro club',
       ajenaTrasToggle?.estado === 'activo' && ajenaTrasToggle?.activo === true
       && toggleAjeno.toasts.some(t => t.tipo === 'error'),
       `estado=${JSON.stringify(ajenaTrasToggle)} · toasts=${JSON.stringify(toggleAjeno.toasts)}`);

    const delAjeno = await correrDelete(sb, ajena.id);
    const ajenaTrasDelete = (await sb.from('profesionales')
      .select('id').eq('id', ajena.id).maybeSingle()).data;
    ok('A10) el DELETE tampoco: la ficha de otro club sigue existiendo y la pantalla lo dice',
       !!ajenaTrasDelete && delAjeno.toasts.some(t => t.tipo === 'error')
       && !delAjeno.toasts.some(t => /eliminado/i.test(t.msg)),
       `sigue=${!!ajenaTrasDelete} · toasts=${JSON.stringify(delAjeno.toasts)}`);

    // El acote no puede romper el camino legítimo.
    const edicionPropia = await correrSave(sb, 'prof', camposProf({
      'f-id': fichaA.id, 'f-estado':'inactivo', 'f-estado-original':'activo',
      'f-doc-nro': DNI.A, 'f-patente':'ENT-PROBE-2', 'f-tipo':'entrenador',
    }));
    const propiaDespues = await traer(DNI.A);
    ok('A8c) editar una ficha del propio club sigue guardando y no le cambia el club '
       + '(el acote no es un falso positivo)',
       propiaDespues?.patente === 'ENT-PROBE-2' && propiaDespues?.estado === 'inactivo'
       && propiaDespues?.activo === false && propiaDespues?.club_id === CLUB_DOLORES
       && edicionPropia.toasts.some(t => /Entrenador actualizado/.test(t.msg))
       && edicionPropia.efectos.cerroModal === 1,
       JSON.stringify(propiaDespues) + ' · toasts=' + JSON.stringify(edicionPropia.toasts));

    // ══════ Aviso de fichas parecidas ══════════════════════════════════════
    // `profesionales` NO tiene índice único por documento: sin este aviso nada frena el duplicado.
    const dupDoc = await DUP.buscarProfesionalesParecidos(sb, {
      clubId: CLUB_DOLORES, apellido: APELLIDO_FIX, documentoNro: DNI.A });
    ok('A11) el aviso detecta el duplicado REAL: mismo documento en el mismo club',
       dupDoc.consultado && dupDoc.porDocumento.length === 1
       && dupDoc.porDocumento[0].id === fichaA.id,
       `porDocumento=${JSON.stringify(dupDoc.porDocumento.map(f=>f.id))}`);

    ok('A11b) …y el mismo apellido lo lista aparte, sin repetir la ficha que ya salió por documento',
       dupDoc.porApellido.length >= 2
       && !dupDoc.porApellido.some(f => f.id === fichaA.id)
       && dupDoc.porApellido.some(f => f.id === fichaB.id),
       `porApellido=${JSON.stringify(dupDoc.porApellido.map(f=>f.apellido+'/'+f.nombre))}`);

    ok('A12) el aviso NO cruza clubes: la ficha de "Mi Club Hípico" con el mismo apellido no sale',
       !dupDoc.porApellido.some(f => f.id === ajena.id)
       && !dupDoc.porDocumento.some(f => f.id === ajena.id),
       `ids=${JSON.stringify([...dupDoc.porApellido, ...dupDoc.porDocumento].map(f=>f.id))}`);

    const dupCorto = await DUP.buscarProfesionalesParecidos(sb, {
      clubId: CLUB_DOLORES, apellido: 'Zu' });
    ok('A13) un apellido de menos de 3 letras NO dispara consulta: traería medio padrón y no es '
       + 'una señal',
       dupCorto.consultado === false && dupCorto.porApellido.length === 0,
       JSON.stringify(dupCorto));

    // El falso positivo que hay que tolerar, con datos reales del padrón: ZUBIARRAIN (entrenador,
    // DNI 14527442) y ZUBIRIA (jockey, DNI 39342378) son DOS PERSONAS. Por eso el aviso informa y
    // no bloquea, y por eso muestra siempre el documento.
    const dupZubi = await DUP.buscarProfesionalesParecidos(sb, {
      clubId: CLUB_DOLORES, apellido: 'ZUBI' });
    ok('A13b) con "ZUBI" trae los dos parecidos reales del padrón, con documentos DISTINTOS a la '
       + 'vista — es un falso positivo legítimo y por eso no puede bloquear',
       dupZubi.consultado && dupZubi.porApellido.length >= 2
       && dupZubi.porDocumento.length === 0
       && new Set(dupZubi.porApellido.map(f => f.documento_nro)).size === dupZubi.porApellido.length,
       JSON.stringify(dupZubi.porApellido.map(f => `${f.apellido}/${f.documento_nro}/${f.tipo}`)));

    const dupEditando = await DUP.buscarProfesionalesParecidos(sb, {
      clubId: CLUB_DOLORES, apellido: APELLIDO_FIX, documentoNro: DNI.A, excluirId: fichaA.id });
    ok('A14) `excluirId` saca a la propia ficha: editando, no se avisa a sí misma',
       !dupEditando.porDocumento.some(f => f.id === fichaA.id)
       && !dupEditando.porApellido.some(f => f.id === fichaA.id),
       `porDocumento=${dupEditando.porDocumento.length} · porApellido=${dupEditando.porApellido.length}`);

    ok('A14b) los comodines de PostgREST van escapados: un apellido con % no matchea de más',
       DUP._dupEscaparLike('50%_x') === '50\\%\\_x' && DUP._dupNormalizar('  ACUÑA  ') === 'acuna',
       `escapado=${DUP._dupEscaparLike('50%_x')} · normalizado=${DUP._dupNormalizar('  ACUÑA  ')}`);

  } catch (err) {
    ok('💥 el probe corrió entero', false, `${err.message}\n${err.stack}`);
  } finally {
    // ── teardown: por ESTADO y además por CONTEO ──────────────────────────
    if (creados.length) await sb.from('profesionales').delete().in('id', creados);
    const { data: sobran } = await sb.from('profesionales').select('id,apellido').like('apellido', `${APELLIDO_FIX}%`);
    const { data: porId } = creados.length
      ? await sb.from('profesionales').select('id').in('id', creados) : { data: [] };
    ok('Z1) teardown por estado: ninguno de los ids creados sigue existiendo, y no queda ninguna '
       + 'fila con el apellido del fixture',
       (porId || []).length === 0 && (sobran || []).length === 0,
       `ids_creados=${creados.length} · siguen_vivos=${JSON.stringify(porId)}`
       + ` · por_apellido=${JSON.stringify(sobran)}`);

    if (base) {
      const fin = await contarPorClub();
      ok('Z2) teardown por conteo: total, Dolores, otro club y huérfanos vuelven a la línea de base',
         fin.total === base.total && fin.dolores === base.dolores
         && fin.otro === base.otro && fin.nulos === base.nulos,
         `base=${JSON.stringify(base)} · fin=${JSON.stringify(fin)}`);
    } else {
      ok('Z2) teardown por conteo', false, 'no se llegó a tomar la línea de base');
    }
  }

  console.log('\n── Probe · alta de entrenador para el rol operador (profesionales.html / jockeys.html) ──');
  console.log(`   profesionales=${PROF_PATH}`);
  console.log(`   jockeys      =${JOCK_PATH}`);
  console.log(`   solicitudes  =${SOL_PATH}`);
  console.log(`   duplicados   =${DUP_PATH}`);
  console.log(`   dnis_fixture =${JSON.stringify(DNI)}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
