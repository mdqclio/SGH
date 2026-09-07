/**
 * Probe — `propietarios.html` crea y lista fichas acotadas por club (código real, sin browser).
 *
 * El agujero que tapa el código bajo prueba (gemelo de ISSUE-049, que ya se arregló en
 * `profesionales.html`):
 *
 *   1. El payload del INSERT de `saveRecord()` no incluía `club_id`. La columna es nullable y no
 *      tiene default ni trigger que la complete, así que TODA alta por pantalla nacía con
 *      `club_id = NULL`.
 *   2. `load()` no filtraba por club: desde Dolores se veían —y se podían editar— las 7 fichas de
 *      "Mi Club Hípico".
 *
 * Lo que rompía en la práctica: la bandeja de solicitudes le dice a la secretaría "no hay ficha con
 * ese DNI ni con ese apellido, creá la ficha desde Propietarios y volvé"
 * (`solicitudes.html:322-327`), pero `buscarFichas()` filtra `.eq('club_id', CLUB_ID)`
 * (`solicitudes.html:182,188,198`). Una ficha con `club_id NULL` no aparece ahí ni por DNI exacto
 * ni en el buscador manual, y si igual llegara a seleccionarse, `rpc_aprobar_solicitud` corta con
 * "La ficha pertenece a otro hipódromo". El atajo que la propia UI sugiere no llegaba a ningún lado.
 * Diagnóstico: docs/diagnosticos/2026-09-07_aprobacion-solicitud-sin-ficha-propietario.md
 *
 * EL ASSERT QUE IMPORTA ES A3: una ficha creada por `saveRecord()` tiene que ser encontrable
 * después por el `buscarFichas()` REAL de `solicitudes.html`. Es el circuito completo, extremo a
 * extremo, y es el que hoy está roto. Los demás asserts son las piezas.
 *
 * Patrón de tests/README.md § "Browser NO disponible": se extraen del HTML los cuerpos reales de
 * `saveRecord()`, `load()` y `parseDNI()` de `propietarios.html` y de `buscarFichas()` de
 * `solicitudes.html` —por ancla y balance de llaves— y se corren con `new AsyncFunction` inyectando
 * un cliente Supabase REAL y un mini-DOM. Nada se reimplementa acá: si el archivo cambia, el probe
 * corre el archivo cambiado.
 *
 * ESCRIBE EN PRODUCCIÓN. Crea 2 fichas de fixture (una en Dolores, una en "Mi Club Hípico") y las
 * borra en el `finally`. El teardown se verifica por ESTADO (cada id tiene que dejar de existir) y
 * además por CONTEO contra la línea de base tomada antes de correr. Preflight: barre restos de
 * corridas anteriores por prefijo de nombre antes de empezar.
 *
 * Se usa `SUPABASE_SECRET_KEY`, que bypasea RLS a propósito: lo que se prueba es el filtro del
 * CLIENTE, no la policy. Con la anon key, `propietarios_select` (que para staff es `fn_is_staff()`
 * sin condición de club) no cambiaría nada y el probe daría verde sobre el bug.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_club_id_alta_propietarios.mjs
 *   node tests/probe_club_id_alta_propietarios.mjs --mutantes          # los 7 mutantes
 *   node tests/probe_club_id_alta_propietarios.mjs --mutantes=M1,M5    # por tanda
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROP_PATH = process.env.PROPIETARIOS_HTML || join(HERE, '..', 'propietarios.html');
const SOL_PATH  = process.env.SOLICITUDES_HTML  || join(HERE, '..', 'solicitudes.html');
const PROP_HTML = readFileSync(PROP_PATH, 'utf8');
const SOL_HTML  = readFileSync(SOL_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const CLUB_DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const CLUB_OTRO    = 'a6da7e40-1515-45dc-8933-4eef33ce937a';   // "Mi Club Hípico"
const PREFIJO      = 'ZZ PROBE CLUBID';                        // marca de fixture, para el barrido

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

const CUERPO_LOAD   = cuerpoDe(PROP_HTML, 'async function load() {');
const CUERPO_SAVE   = cuerpoDe(PROP_HTML, 'async function saveRecord(e) {');
const CUERPO_BUSCAR = cuerpoDe(SOL_HTML,  'async function buscarFichas(sol, textoManual) {');
// parseDNI es real, no un stub: lo usa el payload para normalizar el documento.
const SRC_PARSEDNI  = (PROP_HTML.match(/^function parseDNI\(str\).*$/m) || [])[0];
if (!SRC_PARSEDNI) throw new Error('no encontré parseDNI en propietarios.html');

// ── mini-DOM ────────────────────────────────────────────────────────────────
// Los ids salen del HTML REAL: pedir uno que el archivo no tiene revienta el probe en vez de
// devolver un nodo fantasma. Renombrar #f-doc-nro rompe acá, no en producción.
const IDS_HTML = new Set([...PROP_HTML.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
function mkDom(valores = {}){
  const nodos = {};
  const nuevo = (id) => ({
    id, value: valores[id] ?? '', textContent: '', innerHTML: '', disabled: false, checked: false,
    onclick: null, style: {}, addEventListener(){},
    classList: { _c:new Set(), add(c){ this._c.add(c); }, remove(c){ this._c.delete(c); },
                 contains(c){ return this._c.has(c); }, toggle(c,on){ on?this._c.add(c):this._c.delete(c); } },
  });
  const get = (id) => {
    if (!IDS_HTML.has(id)) throw new Error(`el código pidió #${id} y ese id NO existe en el HTML`);
    return (nodos[id] ||= nuevo(id));
  };
  return { getElementById: get, _n: nodos, val(id){ return get(id).value; } };
}

// ── arneses ─────────────────────────────────────────────────────────────────
// saveRecord real. Devuelve lo que el código hizo observable: los toasts, si cerró el modal y si
// llamó a load(). Lo que se persistió se verifica después contra la DB, no acá.
async function correrSave(sb, dom){
  const toasts = [];
  const efectos = { cerroModal:0, recargo:0 };
  const fn = new AsyncFunction('document','sb','CLUB_ID','toast','confirm','closeModal','load','e',
    SRC_PARSEDNI + '\n' + CUERPO_SAVE);
  await fn(dom, sb, CLUB_DOLORES,
    (msg, tipo='success') => toasts.push({ msg, tipo }),
    () => true,
    () => { efectos.cerroModal++; },
    async () => { efectos.recargo++; },
    { preventDefault(){} });
  return { toasts, efectos };
}

// load() real. `allData` es una `let` de módulo del archivo; acá entra como parámetro y se lo
// devuelve con un return agregado al final, que es la única línea que este arnés suma al código.
async function correrLoad(sb, { filtroEstado = '' } = {}){
  const dom = mkDom({ 'filter-estado': filtroEstado, 'search': '', 'filter-tipo': '' });
  const stats = { updateStats:0, filterRender:0, setList:[] };
  const toasts = [];
  const fn = new AsyncFunction('document','sb','CLUB_ID','toast','setList','updateStats','filterRender','allData',
    CUERPO_LOAD + '\n return allData;');
  const filas = await fn(dom, sb, CLUB_DOLORES,
    (msg, tipo='success') => toasts.push({ msg, tipo }),
    (h) => { stats.setList.push(h); },
    () => { stats.updateStats++; },
    () => { stats.filterRender++; },
    []);
  return { filas, toasts, stats };
}

// buscarFichas() real de solicitudes.html — el verificador del circuito. NO se toca en este fix:
// entra tal cual está en main para comprobar que la ficha nueva le resulta visible.
async function correrBuscar(sb, sol, textoManual){
  const fn = new AsyncFunction('sb','CLUB_ID','sol','textoManual', CUERPO_BUSCAR);
  return fn(sb, CLUB_DOLORES, sol, textoManual);
}

// ══════════════════════════════ MUTANTES ════════════════════════════════════
// Uno por cada pieza de los tres fixes, más los dos bugs originales tal cual estaban.
const MUTANTES = [
  { id:'M1', desc:'BUG ORIGINAL 1 — el payload del INSERT vuelve a no mandar club_id',
    archivo:'prop', mata:['A1','A2','A3'],
    from:`  const payload = {\n    club_id: CLUB_ID,\n`, to:`  const payload = {\n` },

  { id:'M2', desc:'club_id se manda pero en null: la ficha nace igual de huérfana',
    archivo:'prop', mata:['A1','A2','A3'],
    from:`    club_id: CLUB_ID,\n    tipo: document.getElementById('f-tipo').value,`,
    to:  `    club_id: null,\n    tipo: document.getElementById('f-tipo').value,` },

  { id:'M3', desc:'BUG ORIGINAL 2 — load() vuelve a listar todos los clubes',
    archivo:'prop', mata:['A4'],
    from:`  let query = sb.from('propietarios').select('*').eq('club_id', CLUB_ID).order('nombre');`,
    to:  `  let query = sb.from('propietarios').select('*').order('nombre');` },

  { id:'M4', desc:'load() filtra por un club fijo equivocado en vez de por CLUB_ID',
    archivo:'prop', mata:['A4'],
    from:`.select('*').eq('club_id', CLUB_ID).order('nombre');`,
    to:  `.select('*').eq('club_id', 'a6da7e40-1515-45dc-8933-4eef33ce937a').order('nombre');` },

  { id:'M5', desc:'el UPDATE pierde el acote por club: una ficha ajena se puede mover de hipódromo',
    archivo:'prop', mata:['A5'],
    from:`.update(payload).eq('id', id).eq('club_id', CLUB_ID).select('id')`,
    to:  `.update(payload).eq('id', id).select('id')` },

  { id:'M6', desc:'el UPDATE de 0 filas canta "actualizado" igual',
    archivo:'prop', mata:['A5b'],
    from:`  if (id && (!filasUpd || filasUpd.length === 0)) {\n    toast('No se pudo actualizar: la ficha no pertenece a este hipódromo.', 'error'); return;\n  }\n`,
    to:  `` },

  { id:'M7', desc:'el UPDATE legítimo del propio club deja de funcionar (falso positivo del acote)',
    archivo:'prop', mata:['A6'],
    from:`.update(payload).eq('id', id).eq('club_id', CLUB_ID).select('id')`,
    to:  `.update(payload).eq('id', id).eq('club_id', 'a6da7e40-1515-45dc-8933-4eef33ce937a').select('id')` },
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
  const dir = mkdtempSync(join(tmpdir(), 'mut-clubid-prop-'));
  console.log(`\n═══ MUTATION TESTING · ${tanda.length}/${MUTANTES.length} mutantes${pedidos ? ` (tanda: ${pedidos.join(',')})` : ''} ═══\n(copias en ${dir} — el repo no se toca)\n`);
  let vivos = 0, arnes = 0;
  for (const m of tanda){
    const src = m.archivo === 'prop' ? PROP_HTML : SOL_HTML;
    if (!src.includes(m.from)) {
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el ancla no existe en el fuente. ${m.desc}`);
      arnes++; continue;
    }
    const path = join(dir, `${m.id}.html`);
    writeFileSync(path, src.replace(m.from, m.to));
    const env = { ...process.env };
    env[m.archivo === 'prop' ? 'PROPIETARIOS_HTML' : 'SOLICITUDES_HTML'] = path;
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

const DNI_FIXTURE = String(900000 + (Date.now() % 90000)).padStart(8, '9').slice(0, 8);
const NOMBRE_DOLORES = `${PREFIJO} Iguacel Loeda, Federico`;
const NOMBRE_OTRO    = `${PREFIJO} Ajeno De Otro Club`;

async function contarPorClub(){
  const q = async (f) => (await sb.from('propietarios').select('id', { count:'exact', head:true }).eq('club_id', f)).count;
  const nulos = (await sb.from('propietarios').select('id', { count:'exact', head:true }).is('club_id', null)).count;
  const total = (await sb.from('propietarios').select('id', { count:'exact', head:true })).count;
  return { total, dolores: await q(CLUB_DOLORES), otro: await q(CLUB_OTRO), nulos };
}

const creados = [];   // ids a borrar en el finally

(async () => {
  let base = null;
  try {
    // ── preflight: barrer restos de corridas anteriores ────────────────────
    const { data: restos } = await sb.from('propietarios').select('id,nombre').like('nombre', `${PREFIJO}%`);
    if (restos?.length) {
      await sb.from('propietarios').delete().in('id', restos.map(r => r.id));
      console.log(`⚠ preflight: se barrieron ${restos.length} fixture(s) de una corrida anterior`);
    }
    base = await contarPorClub();
    console.log(`   línea de base: total=${base.total} dolores=${base.dolores} otro=${base.otro} nulos=${base.nulos}`);

    ok('A0) la línea de base no tiene fichas huérfanas (club_id NULL) antes de empezar',
       base.nulos === 0, `nulos=${base.nulos}`);

    // ── A1 · el alta por pantalla persiste el club ─────────────────────────
    const domAlta = mkDom({
      'f-id':'', 'f-estado':'activo', 'f-estado-original':'', 'f-tipo':'persona',
      'f-nombre':NOMBRE_DOLORES, 'f-stud':'Kazan', 'f-doc-tipo':'DNI', 'f-doc-nro':DNI_FIXTURE,
      'f-domicilio':'', 'f-localidad':'', 'f-provincia':'', 'f-telefono':'541158911520',
      'f-email':'probe-clubid@sgh.test', 'f-colores':'', 'f-notas':'fixture de probe',
    });
    const alta = await correrSave(sb, domAlta);
    const { data: nueva } = await sb.from('propietarios')
      .select('id,club_id,nombre,nombre_stud,documento_tipo,documento_nro,tipo,estado,activo')
      .eq('nombre', NOMBRE_DOLORES).maybeSingle();
    if (nueva) creados.push(nueva.id);

    ok('A1) saveRecord() crea la ficha CON club_id del hipódromo activo (no NULL)',
       !!nueva && nueva.club_id === CLUB_DOLORES,
       `toasts=${JSON.stringify(alta.toasts)} · fila=${JSON.stringify(nueva)}`);

    ok('A1b) y el resto del payload llegó entero, con el DNI normalizado por parseDNI',
       !!nueva && nueva.documento_nro === DNI_FIXTURE && nueva.documento_tipo === 'DNI'
       && nueva.tipo === 'persona' && nueva.estado === 'activo' && nueva.activo === true
       && nueva.nombre_stud === 'Kazan',
       JSON.stringify(nueva));

    // ── A2/A3 · EL CIRCUITO: la bandeja tiene que encontrarla ──────────────
    // `sol` es la forma de la fila real de solicitudes_acceso de Fede (aa1ae749…), con el DNI del
    // fixture. buscarFichas() es el código de solicitudes.html sin tocar.
    const SOL = { id:'probe', rol_pedido:'propietario', documento_nro:DNI_FIXTURE,
                  apellido:'Iguacel Loeda' };
    const exacto = await correrBuscar(sb, SOL);
    ok('A2) buscarFichas() la encuentra por DNI exacto y la marca EXACTO — el botón "Vincular y '
       + 'aprobar" se habilita',
       exacto.tabla === 'propietarios' && exacto.exactas.length === 1
       && exacto.exactas[0].id === nueva?.id,
       `exactas=${JSON.stringify(exacto.exactas)} · sugeridas=${exacto.sugeridas.length}`);

    const manual = await correrBuscar(sb, SOL, 'Iguacel');
    ok('A3) ⭐ y el buscador manual de la bandeja también la encuentra — circuito completo '
       + 'propietarios.html → solicitudes.html',
       manual.manual === true && manual.sugeridas.some(f => f.id === nueva?.id),
       `sugeridas=${JSON.stringify(manual.sugeridas.map(f => ({id:f.id,nombre:f.nombre})))}`);

    // ── A4 · el listado ya no cruza clubes ─────────────────────────────────
    const fixtureOtro = { club_id: CLUB_OTRO, tipo:'persona', nombre: NOMBRE_OTRO,
                          estado:'activo', activo:true };
    const { data: ajena, error: errAjena } = await sb.from('propietarios')
      .insert(fixtureOtro).select('id,club_id,nombre').single();
    if (errAjena) throw new Error(`no pude plantar el fixture ajeno: ${errAjena.message}`);
    creados.push(ajena.id);

    const listado = await correrLoad(sb);
    const conteos = await contarPorClub();
    const ajenasEnLista = (listado.filas || []).filter(r => r.club_id !== CLUB_DOLORES);
    ok('A4) load() lista TODAS las fichas de Dolores y NINGUNA de otro club',
       Array.isArray(listado.filas)
       && ajenasEnLista.length === 0
       && listado.filas.length === conteos.dolores,
       `listadas=${listado.filas?.length} · dolores_en_db=${conteos.dolores}`
       + ` · otro_en_db=${conteos.otro} · ajenas_en_lista=${ajenasEnLista.length}`
       + ` · ejemplo_ajena=${JSON.stringify(ajenasEnLista.slice(0,2).map(r=>r.nombre))}`);

    ok('A4b) la ficha ajena SÍ está en la DB — el 0 de arriba es del filtro, no de una tabla vacía',
       conteos.otro === base.otro + 1 && !!ajena.id,
       `otro_base=${base.otro} · otro_ahora=${conteos.otro}`);

    const listadoActivos = await correrLoad(sb, { filtroEstado:'activos' });
    ok('A4c) el filtro por estado sigue funcionando encima del filtro por club',
       (listadoActivos.filas || []).every(r => r.club_id === CLUB_DOLORES && r.estado === 'activo'),
       `activos=${listadoActivos.filas?.length}`);

    // ── A5 · el UPDATE no puede tocar una ficha ajena ──────────────────────
    const domEdit = mkDom({
      'f-id': ajena.id, 'f-estado':'activo', 'f-estado-original':'activo', 'f-tipo':'sociedad',
      'f-nombre':`${PREFIJO} PISADA POR EL PROBE`, 'f-stud':'', 'f-doc-tipo':'DNI', 'f-doc-nro':'',
      'f-domicilio':'', 'f-localidad':'', 'f-provincia':'', 'f-telefono':'', 'f-email':'',
      'f-colores':'', 'f-notas':'',
    });
    const edicionAjena = await correrSave(sb, domEdit);
    const { data: ajenaDespues } = await sb.from('propietarios')
      .select('id,club_id,nombre,tipo').eq('id', ajena.id).maybeSingle();

    ok('A5) editar por id una ficha de otro club es un no-op: no la pisa NI la mueve de hipódromo',
       ajenaDespues?.nombre === NOMBRE_OTRO
       && ajenaDespues?.club_id === CLUB_OTRO
       && ajenaDespues?.tipo === 'persona',
       JSON.stringify(ajenaDespues));

    ok('A5b) y avisa que no se guardó, en vez de cantar "Propietario actualizado"',
       edicionAjena.toasts.some(t => t.tipo === 'error' && /no pertenece a este hipódromo/i.test(t.msg))
       && !edicionAjena.toasts.some(t => /actualizado/i.test(t.msg))
       && edicionAjena.efectos.cerroModal === 0,
       JSON.stringify(edicionAjena.toasts) + ` · cerroModal=${edicionAjena.efectos.cerroModal}`);

    // ── A6 · el UPDATE legítimo sigue andando ──────────────────────────────
    const domEditPropia = mkDom({
      'f-id': nueva.id, 'f-estado':'inactivo', 'f-estado-original':'activo', 'f-tipo':'persona',
      'f-nombre':NOMBRE_DOLORES, 'f-stud':'Kazan II', 'f-doc-tipo':'DNI', 'f-doc-nro':DNI_FIXTURE,
      'f-domicilio':'Calle Falsa 123', 'f-localidad':'Dolores', 'f-provincia':'Buenos Aires',
      'f-telefono':'541158911520', 'f-email':'probe-clubid@sgh.test', 'f-colores':'', 'f-notas':'',
    });
    const edicionPropia = await correrSave(sb, domEditPropia);
    const { data: propiaDespues } = await sb.from('propietarios')
      .select('id,club_id,nombre_stud,estado,activo,localidad').eq('id', nueva.id).maybeSingle();

    ok('A6) editar una ficha del propio club sigue guardando, y no le cambia el club',
       propiaDespues?.nombre_stud === 'Kazan II' && propiaDespues?.estado === 'inactivo'
       && propiaDespues?.activo === false && propiaDespues?.localidad === 'Dolores'
       && propiaDespues?.club_id === CLUB_DOLORES
       && edicionPropia.toasts.some(t => /Propietario actualizado/.test(t.msg))
       && edicionPropia.efectos.cerroModal === 1 && edicionPropia.efectos.recargo === 1,
       JSON.stringify(propiaDespues) + ' · toasts=' + JSON.stringify(edicionPropia.toasts));

    // ── A7 · el índice anti-duplicado empieza a morder ─────────────────────
    // ux_propietarios_club_doc es UNIQUE (club_id, documento_tipo, documento_nro) WHERE
    // documento_nro IS NOT NULL. Con club_id NULL los duplicados nunca chocaban (NULLs distintos):
    // con el club cargado, el alta repetida del mismo DNI ahora sí da error en vez de duplicar.
    const domDup = mkDom({
      'f-id':'', 'f-estado':'activo', 'f-estado-original':'', 'f-tipo':'persona',
      'f-nombre':`${PREFIJO} Duplicado`, 'f-stud':'', 'f-doc-tipo':'DNI', 'f-doc-nro':DNI_FIXTURE,
      'f-domicilio':'', 'f-localidad':'', 'f-provincia':'', 'f-telefono':'', 'f-email':'',
      'f-colores':'', 'f-notas':'',
    });
    const dup = await correrSave(sb, domDup);
    const { data: dupFila } = await sb.from('propietarios').select('id')
      .eq('nombre', `${PREFIJO} Duplicado`).maybeSingle();
    if (dupFila) creados.push(dupFila.id);
    ok('A7) con club_id cargado, ux_propietarios_club_doc rechaza el alta repetida del mismo DNI',
       !dupFila && dup.toasts.some(t => t.tipo === 'error'),
       `fila_duplicada=${JSON.stringify(dupFila)} · toasts=${JSON.stringify(dup.toasts)}`);

  } catch (err) {
    ok('💥 el probe corrió entero', false, `${err.message}\n${err.stack}`);
  } finally {
    // ── teardown: por ESTADO y además por CONTEO ──────────────────────────
    if (creados.length) await sb.from('propietarios').delete().in('id', creados);
    const { data: sobran } = await sb.from('propietarios').select('id,nombre').like('nombre', `${PREFIJO}%`);
    const { data: porId } = creados.length
      ? await sb.from('propietarios').select('id').in('id', creados) : { data: [] };
    ok('Z1) teardown por estado: ninguno de los ids creados sigue existiendo, y no queda ninguna '
       + 'fila con el prefijo del fixture',
       (porId || []).length === 0 && (sobran || []).length === 0,
       `ids_creados=${creados.length} · siguen_vivos=${JSON.stringify(porId)}`
       + ` · por_prefijo=${JSON.stringify(sobran)}`);

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

  console.log('\n── Probe · club_id en el alta y el listado de propietarios.html (ISSUE-072) ──');
  console.log(`   propietarios=${PROP_PATH}`);
  console.log(`   solicitudes =${SOL_PATH}`);
  console.log(`   dni_fixture =${DNI_FIXTURE}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
