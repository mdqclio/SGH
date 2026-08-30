/**
 * Filtro por tipo de concepto en el detalle de Pagos — probe de código real, sin browser.
 *
 * Pedido de Valeria (30/08): poder ver sólo los incentivos para cobrarlos sueltos, sin destildar
 * los premios a mano.
 *
 * Lo que se prueba NO es "el filtro filtra" — eso es lo fácil. Es la invariante que hace que el
 * filtro no sea peligroso:
 *
 *     FILTRAR ES UNA VISTA, NO UNA SELECCIÓN.
 *     Se emite lo TILDADO, nunca lo VISIBLE. Si esas dos cosas difieren, el recibo sale mal y
 *     nadie se entera hasta que lo imprime.
 *
 * Patrón de siempre (tests/README.md § "Browser NO disponible"): se EXTRAEN las funciones del
 * propio liquidaciones.html por ancla, con balance de llaves, y se las corre con new AsyncFunction
 * inyectando dependencias reales (cliente Supabase con SUPABASE_SECRET_KEY) y stubs de DOM. Nada
 * se reimplementa acá: si el HTML cambia, este probe corre el HTML cambiado.
 *
 * DIFERENCIA CON LOS PROBES ANTERIORES: acá el comportamiento bajo prueba ES el DOM, así que el
 * stub `querySelectorAll: () => []` de probe_anular_recibo_ui.mjs no sirve — devolvería vacío y el
 * probe pasaría en verde probando nada. Hay un mini-DOM con filas de verdad y un motor de
 * selectores que entiende EXACTAMENTE los 6 selectores que usa el código, y que TIRA ante
 * cualquier otro (assert F9). Ese guard es lo que impide el falso verde si alguien cambia un
 * selector en el HTML.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_filtro_concepto_pagos.mjs              # corrida normal
 *   node tests/probe_filtro_concepto_pagos.mjs --mutantes   # mutation testing
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { snapshotLineas, restaurarLineas, diffLineas, describir, recibosDesde }
  from './lib/estado_lineas.mjs';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }

const CLUB_B = 'a6da7e40-1515-45dc-8933-4eef33ce937a'; // Mi Club Hípico — sandbox de fixtures
const TAG = 'TEST FILTRO CONCEPTO';

const sb = createClient(SUPABASE_URL, KEY, { auth:{ autoRefreshToken:false, persistSession:false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = process.env.LIQ_HTML || join(HERE, '..', 'liquidaciones.html');
const HTML = readFileSync(HTML_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const results = [];
const ok = (t, c, n='') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
const RUN = Date.now().toString(36);
const T0 = new Date(Date.now() - 5000).toISOString();

// El scan de llaves arranca en la llave FINAL de la firma, no en la primera que aparezca después
// del ancla: `async function cobrosDetalle(tipo, id, opts = {}){` tiene un `{}` en la lista de
// parámetros, y arrancar por ahí devolvía la firma sola, truncada (el cuerpo se cerraba en el
// `}` de `opts = {}`). El síntoma era un "Unexpected token 'async'" al compilar el arnés.
function extractFn(src, firma){
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
function extractConst(src, firma){
  const i = src.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  const fin = src.indexOf('\n', src.indexOf(';', i));
  return src.slice(i, fin);
}

// ═════════════════════════════════ MINI-DOM ═════════════════════════════════
// Nodos con classList respaldada por un Set real y un motor que soporta SÓLO los selectores que el
// código usa. Ante cualquier otro TIRA: si el HTML cambia un selector, el probe muere en vez de
// pasar en verde con una lista vacía. Es la misma clase de falso verde del recibo #4.
const SELECTORES = [
  '.cob-chk',
  '.cob-chk:checked',
  '#cob-detalle tr.cob-row',
  '#cob-detalle tr.cob-row:not(.cob-row-oculta)',
  '#cob-detalle tr.cob-row:not(.cob-row-oculta) .cob-chk',
  '#cob-detalle tr.cob-row.cob-row-oculta .cob-chk:checked',
];

function mkClassList(set){
  return {
    add:    c => set.add(c),
    remove: c => set.delete(c),
    contains: c => set.has(c),
    toggle: (c, on) => { if (on === undefined) { set.has(c) ? set.delete(c) : set.add(c); }
                         else if (on) set.add(c); else set.delete(c); },
  };
}

/** Arma el mini-DOM a partir del HTML que cobrosDetalle escribió en #cob-detalle. */
function mkDom(htmlDetalle){
  const filas = [];
  // Se parsea el HTML REAL que produjo cobrosDetalle. Si el render se olvida del data-grupo o de
  // la clase cob-row, el fixture nace roto y F1/F1d mueren — que es lo que tiene que pasar.
  const reTr = /<tr([^>]*)>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = reTr.exec(htmlDetalle))){
    const attrs = m[1], cuerpo = m[2];
    if (!/class="[^"]*\bcob-row\b/.test(attrs)) continue;
    const grupo = (attrs.match(/data-grupo="([^"]*)"/) || [])[1] ?? null;
    const chk = cuerpo.match(/<input type="checkbox" class="cob-chk" value="([^"]*)" data-monto="([^"]*)"( checked)?/);
    if (!chk) throw new Error('fila cob-row sin checkbox reconocible: ' + cuerpo.slice(0, 120));
    const clsFila = new Set(['cob-row']);
    const input = { value: chk[1], dataset: { monto: chk[2] }, checked: !!chk[3], _fila: null };
    const fila  = { dataset: { grupo }, _cls: clsFila, classList: mkClassList(clsFila), _chk: input };
    input._fila = fila;
    filas.push(fila);
  }
  const nodos = {};
  const get = id => (nodos[id] ||= { id, innerHTML:'', textContent:'', value:'', disabled:false,
                                     style:{}, classList: mkClassList(new Set()),
                                     scrollIntoView(){}, focus(){}, click(){} });
  ['cob-detalle','cob-beneficiarios','cob-total','cob-chips','cob-acciones','cob-aviso-row',
   'cob-recibo-emitido','cob-reunion',
   'cobr-resumen','cobr-quien','cobr-forma','cobr-comprobante','cobr-nombre','cobr-doc',
   'cobr-comprobante-row','cobr-nota-firma','modal-cobrador']
    .forEach(get);
  get('cob-detalle').innerHTML = htmlDetalle;

  const visible = f => !f._cls.has('cob-row-oculta');
  const doc = {
    getElementById: id => get(id),
    _n: nodos,
    _filas: filas,
    _selDesconocido: null,
    querySelectorAll(sel){
      if (!SELECTORES.includes(sel)) {
        doc._selDesconocido = sel;
        throw new Error(`mini-DOM: selector no soportado → ${sel}`);
      }
      switch (sel) {
        case '.cob-chk':                                             return filas.map(f => f._chk);
        case '.cob-chk:checked':                                     return filas.filter(f => f._chk.checked).map(f => f._chk);
        case '#cob-detalle tr.cob-row':                              return filas;
        case '#cob-detalle tr.cob-row:not(.cob-row-oculta)':         return filas.filter(visible);
        case '#cob-detalle tr.cob-row:not(.cob-row-oculta) .cob-chk':return filas.filter(visible).map(f => f._chk);
        case '#cob-detalle tr.cob-row.cob-row-oculta .cob-chk:checked':
          return filas.filter(f => !visible(f) && f._chk.checked).map(f => f._chk);
      }
    },
  };
  return doc;
}

/** Vector de tildes, fila por fila, en orden. Comparar ESTO, no un conteo (GOTCHA #77). */
const vector  = dom => dom._filas.map(f => f._chk.checked);
const ocultas = dom => dom._filas.map(f => f._cls.has('cob-row-oculta'));
const idsChk  = dom => dom._filas.filter(f => f._chk.checked).map(f => f._chk.value).sort();

// ═════════════════════════════ MUTATION TESTING ═════════════════════════════
// Cada mutante neutraliza UNA cosa sobre una COPIA del HTML en un tmpdir — el repo no se toca — y
// re-corre este mismo probe con LIQ_HTML apuntando a la copia. Un mutante que no mata ningún
// assert significa que ese assert no prueba lo que dice probar.
const MUTANTES = [
  { id:'M1', desc:'cobrosFiltrar nunca aplica la clase de ocultar', mata:['F1'],
    from:`    tr.classList.toggle('cob-row-oculta', !(grupo === 'todo' || tr.dataset.grupo === grupo));`,
    to:  `    tr.classList.toggle('cob-row-oculta', false);` },
  { id:'M2', desc:'el filtro invierte el match (oculta lo que debería mostrar)', mata:['F1','F1b'],
    from:`    tr.classList.toggle('cob-row-oculta', !(grupo === 'todo' || tr.dataset.grupo === grupo));`,
    to:  `    tr.classList.toggle('cob-row-oculta', (grupo === 'todo' || tr.dataset.grupo === grupo));` },
  { id:'M3', desc:'FILTRAR ES SELECCIONAR: cobrosFiltrar pisa checked con la visibilidad', mata:['F2','F2b'],
    from:`    tr.classList.toggle('cob-row-oculta', !(grupo === 'todo' || tr.dataset.grupo === grupo));`,
    to:  `    const v = (grupo === 'todo' || tr.dataset.grupo === grupo);\n    tr.classList.toggle('cob-row-oculta', !v); tr._chk && (tr._chk.checked = v);` },
  { id:'M4', desc:'cobrosEmitir manda lo VISIBLE en vez de lo TILDADO', mata:['F3','F3b'],
    from:`  const chks = [...document.querySelectorAll('.cob-chk:checked')];`,
    to:  `  const chks = [...document.querySelectorAll('#cob-detalle tr.cob-row:not(.cob-row-oculta) .cob-chk')].filter(c=>c.checked);` },
  { id:'M5', desc:'el total suma sólo las visibles', mata:['F4','F4b'],
    from:`  let t=0; document.querySelectorAll('.cob-chk:checked').forEach(c=>t+=parseFloat(c.dataset.monto)||0);`,
    to:  `  let t=0; document.querySelectorAll('#cob-detalle tr.cob-row:not(.cob-row-oculta) .cob-chk').forEach(c=>{ if(c.checked) t+=parseFloat(c.dataset.monto)||0; });` },
  { id:'M6', desc:'el aviso de tildadas fuera del filtro nunca se renderiza', mata:['F5'],
    from:`  if (cobFiltro === 'todo' || !ocultas.length) { fila.innerHTML = ''; return; }`,
    to:  `  if (true) { fila.innerHTML = ''; return; }` },
  { id:'M7', desc:'el aviso se renderiza también sin filtro', mata:['F5b'],
    from:`  if (cobFiltro === 'todo' || !ocultas.length) { fila.innerHTML = ''; return; }`,
    to:  `  if (!ocultas.length) { fila.innerHTML = ''; return; }` },
  { id:'M8', desc:'tildar/destildar visibles pierde el :not(.cob-row-oculta) y pisa las ocultas', mata:['F6','F6b'],
    from:`  document.querySelectorAll('#cob-detalle tr.cob-row:not(.cob-row-oculta) .cob-chk')\n    .forEach(c => { c.checked = valor; });`,
    to:  `  document.querySelectorAll('.cob-chk').forEach(c => { c.checked = valor; });` },
  { id:'M9', desc:'"tildar sólo estas" no destilda las ocultas primero', mata:['F7'],
    from:`  document.querySelectorAll('.cob-chk').forEach(c => { c.checked = false; });\n  cobrosTildarVisibles(true);`,
    to:  `  cobrosTildarVisibles(true);` },
  { id:'M10', desc:'el rótulo se queda en "Tildar todo" con filtro puesto', mata:['F8'],
    from:'${conFiltro ? `Tildar los ${visibles} visibles` : \'Tildar todo\'}',
    to:  '${\'Tildar todo\'}' },
  { id:'M11', desc:'el <tr> se renderiza sin data-grupo', mata:['F1d'],
    from:'<tr class="cob-row" data-grupo="${grupoDeTipo(l.concepto_tipo)}">',
    to:  '<tr class="cob-row">' },
  { id:'M12', desc:'los chips se arman desde el ENUM y no desde cobLineas (chip vacío)', mata:['F1e'],
    from:`  return ORDEN_GRUPOS_COB.filter(g => acc[g])\n    .map(g => ({ grupo:g, n:acc[g].n, rotulo:rotuloGrupo(g, acc[g].tipos) }));`,
    to:  `  return ORDEN_GRUPOS_COB\n    .map(g => ({ grupo:g, n:(acc[g]?acc[g].n:0), rotulo:rotuloGrupo(g, acc[g]?acc[g].tipos:new Set()) }));` },
  { id:'M13', desc:'habilitarLinea NO preserva: vuelve a resetear todo a tildado', mata:['H1','H2'],
    from:`  await cobrosDetalle(tipo, id, { preservar: true });`,
    to:  `  await cobrosDetalle(tipo, id);` },
  { id:'M14', desc:'la línea recién liberada entra TILDADA aunque quede fuera del filtro', mata:['H3'],
    from:`  return filtro === 'todo' || grupoDeTipo(l.concepto_tipo) === filtro;\n}`,
    to:  `  return true;\n}` },
  { id:'M15', desc:'habilitarLinea no avisa que la línea quedó fuera del filtro', mata:['H4'],
    from:`  if (fuera) toast('Línea habilitada — quedó FUERA del filtro actual y sin tildar. Cambiá el filtro para verla.', 'error', 9000);`,
    to:  `  if (false) toast('Línea habilitada — quedó FUERA del filtro actual y sin tildar. Cambiá el filtro para verla.', 'error', 9000);` },
  { id:'M16', desc:'un filtro que ya no existe se conserva y deja la tabla vacía', mata:['H5'],
    from:`  cobFiltro = (filtroPrevio !== 'todo' && gruposPresentes.has(filtroPrevio)) ? filtroPrevio : 'todo';`,
    to:  `  cobFiltro = filtroPrevio;` },
  { id:'M17', desc:'el mini-DOM devuelve [] ante selector desconocido en vez de tirar', mata:['F9'],
    from:`        doc._selDesconocido = sel;\n        throw new Error(\`mini-DOM: selector no soportado → \${sel}\`);`,
    to:  `        doc._selDesconocido = sel;\n        return [];`,
    archivo: 'probe' },
];

if (process.argv.includes('--mutantes')) {
  const SELF = fileURLToPath(import.meta.url);
  const SELF_SRC = readFileSync(SELF, 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'mut-filtro-concepto-'));
  console.log(`\n═══ MUTATION TESTING · ${MUTANTES.length} mutantes ═══\n(copias en ${dir} — el repo no se toca)\n`);
  let vivos = 0;
  for (const m of MUTANTES){
    const esProbe = m.archivo === 'probe';
    const src = esProbe ? SELF_SRC : HTML;
    if (!src.includes(m.from)) {
      console.log(`❌ ${m.id} NO APLICABLE — el ancla no existe. ${m.desc}`);
      vivos++; continue;
    }
    const path = join(dir, `${m.id}.${esProbe ? 'mjs' : 'html'}`);
    writeFileSync(path, src.replace(m.from, m.to));
    // El mutante del arnés corre el PROBE mutado contra el HTML sano; el resto corre el probe sano
    // contra el HTML mutado.
    const script = esProbe ? path : SELF;
    const env = esProbe ? { ...process.env } : { ...process.env, LIQ_HTML: path };
    let out = '';
    try { out = execFileSync(process.execPath, [script], { env, encoding:'utf8', stdio:['ignore','pipe','pipe'] }); }
    catch (e) { out = (e.stdout||'') + (e.stderr||''); }
    // GOTCHA #82 — anclar en el ")" del rótulo. `❌ F1\b` NO delimita `❌ F1b)` (1 y b son ambos
    // \w), así que un mutante que mata F1b se reportaría como sobreviviente.
    const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));
    const vivo = muertos.length === 0;
    if (vivo) vivos++;
    console.log(`${vivo?'❌':'✅'} ${m.id} ${vivo?'SOBREVIVE':'muere'} — ${m.desc}`
      + `  [esperaba matar ${m.mata.join(',')}${muertos.length?`; murieron ${muertos.join(',')}`:''}]`);
  }
  console.log(`\n${vivos===0 ? '✅ TODOS LOS MUTANTES MUEREN' : `❌ ${vivos} mutante(s) sobreviven`} — ${MUTANTES.length} probados\n`);
  process.exit(vivos === 0 ? 0 : 1);
}

// ══════════════════════════════ CORRIDA NORMAL ══════════════════════════════
(async () => {
  const creados = { liqs: [], dets: [] };
  let antesB = {}, REUNION_B = null;
  let phase = 'init';
  try {
    phase = 'setup';
    const { data: rB } = await sb.from('reuniones').select('id,numero').eq('club_id', CLUB_B).limit(1);
    REUNION_B = rB?.[0]?.id;
    if (!REUNION_B) throw new Error('el club B no tiene reuniones');
    const { data: profsB } = await sb.from('profesionales')
      .select('id,nombre,apellido,documento_nro').eq('club_id', CLUB_B).eq('activo', true).limit(400);
    if (!profsB?.length) throw new Error('faltan profesionales activos en el club B');
    const BENEF = profsB[0].id;

    antesB = await snapshotLineas(sb, REUNION_B);

    // ── fixtures ─────────────────────────────────────────────────────────────
    // 6 premios + 3 incentivo_entrenador. Tamaños DISTINTOS a propósito: con 3 y 3, un bug que
    // devuelva el grupo equivocado da el mismo conteo y no se detecta.
    // Más 1 retenida de premio y 1 retenida de actuacion, para el bloque H (habilitarLinea): la
    // de actuacion estrena un grupo que no existía en los chips, que es un caso real (el
    // entrenador 6361df8c de Dolores tiene retenidas de peón, capataz y sereno).
    phase = 'fixtures';
    const plantar = async (concepto, bruto, tipo, estado='impago') => {
      const { data: liq, error: eL } = await sb.from('liquidaciones')
        .insert({ club_id: CLUB_B, reunion_id: REUNION_B, profesional_id: BENEF,
                  estado:'borrador', total_bruto:0, total_descuentos:0 }).select().single();
      if (eL) throw new Error('crear liq: ' + eL.message);
      creados.liqs.push(liq.id);
      const { data: det, error: eD } = await sb.from('liquidacion_detalle')
        .insert({ liquidacion_id: liq.id, beneficiario_tipo:'profesional', beneficiario_id: BENEF,
                  reunion_id: REUNION_B, concepto, monto_bruto: bruto, monto_descuento: 0,
                  concepto_tipo: tipo, estado_linea: estado }).select().single();
      if (eD) throw new Error('crear detalle: ' + eD.message);
      creados.dets.push(det.id);
      return det;
    };
    const premios = [];
    for (let i = 1; i <= 6; i++) premios.push(await plantar(`${TAG} premio ${i} ${RUN}`, 10000 * i, 'premio'));
    const incents = [];
    for (let i = 1; i <= 3; i++) incents.push(await plantar(`${TAG} incentivo ${i} ${RUN}`, 100000 * i, 'incentivo_entrenador'));
    const retPremio = await plantar(`${TAG} retenida premio ${RUN}`, 777000, 'premio', 'retenido');
    const retActua  = await plantar(`${TAG} retenida actuacion ${RUN}`, 55000, 'actuacion', 'retenido');

    const SUM_PREMIOS  = premios.reduce((s,d)=>s+Number(d.monto_neto), 0);
    const SUM_INCENTS  = incents.reduce((s,d)=>s+Number(d.monto_neto), 0);

    // ── arnés: extraer el código REAL del HTML ──────────────────────────────
    phase = 'harness';
    const cuerpos = [
      extractConst(HTML, 'const GRUPO_DE_TIPO_COB ='),
      extractConst(HTML, 'const ORDEN_GRUPOS_COB '),
      extractFn(HTML, 'function grupoDeTipo(t){'),
      extractFn(HTML, 'function rotuloGrupo(grupo, tipos){'),
      extractFn(HTML, 'function cobrosGruposPresentes(){'),
      extractFn(HTML, 'function cobChecked(l, selPrevia, idsPrevios, filtro){'),
      extractFn(HTML, 'function cobrosFiltrar(grupo){'),
      extractFn(HTML, 'function cobrosRenderChips(){'),
      extractFn(HTML, 'function cobrosTildarVisibles(valor){'),
      extractFn(HTML, 'function cobrosTildarSoloVisibles(){'),
      extractFn(HTML, 'function cobrosRenderAvisoOculto(){'),
      extractFn(HTML, 'function cobrosRecalc(){'),
      extractFn(HTML, 'function cobrosEmitir(){'),
      // No están bajo prueba, pero se extraen igual en vez de stubearse: cobrosEmitir las llama, y
      // un stub vacío escondería un error real de esa cadena.
      extractFn(HTML, 'function cobrosQuienCambio(){'),
      extractFn(HTML, 'function cobrosFormaCambio(){'),
      extractFn(HTML, 'function rolDeLinea(l){'),
      extractConst(HTML, 'const ROL_POR_BENEFICIARIO ='),
      extractFn(HTML, 'async function cobrosDetalle(tipo, id, opts = {}){'),
      extractFn(HTML, 'async function habilitarLinea(lineaId, tipo, id){'),
      extractFn(HTML, 'function cobLimpiarPanelRecibo(){'),
      extractFn(HTML, 'function cobVisible(l, rid){'),
      extractFn(HTML, 'function cobDelClub(l){'),
      extractFn(HTML, 'async function cobCargarReunPrueba(){'),
    ].join('\n\n');

    // Estado de módulo + stubs. `document` se reemplaza en caliente: cobrosDetalle escribe el HTML
    // del detalle en #cob-detalle y recién ahí se puede construir el mini-DOM con filas.
    const preludio = `
      let cobLineas = [], cobBenef = null, cobApoderados = [], cobEmitirIds = [];
      let cobUltimoRecibo = null, cobReunPrueba = null, cobFiltro = 'todo';
      const CLUB_ID = ${JSON.stringify(CLUB_B)};
      const toasts = [];
      const toast = (m, t='success', ms) => toasts.push({ m, t, ms });
      const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const fmt = n => '$ ' + Number(n||0).toLocaleString('es-AR', { minimumFractionDigits:2, maximumFractionDigits:2 });
      const nombreBenef = () => 'Beneficiario de prueba';
      const docBenef = () => '00000000';
      const closeModal = () => {};
      const confirm = () => true;
      let document = docInicial;
      const setDoc = d => { document = d; };
      const estado = () => ({ cobLineas, cobFiltro, cobEmitirIds, toasts });
    `;
    const epilogo = `
      return { cobrosDetalle, cobrosFiltrar, cobrosRecalc, cobrosEmitir, cobrosTildarVisibles,
               cobrosTildarSoloVisibles, cobrosRenderChips, cobrosGruposPresentes, grupoDeTipo,
               habilitarLinea, setDoc, estado };
    `;
    const mkApi = (docInicial) =>
      new AsyncFunction('sb', 'docInicial', preludio + cuerpos + epilogo)(sb, docInicial);

    // ── F1x · render + filtrado ──────────────────────────────────────────────
    phase = 'F1';
    const docBoot = mkDom('');
    const api = await mkApi(docBoot);
    await api.cobrosDetalle('profesional', BENEF);
    const htmlDetalle = docBoot._n['cob-detalle'].innerHTML;
    const dom = mkDom(htmlDetalle);
    api.setDoc(dom);
    // El mini-DOM se rearma sobre el HTML real, así que el estado de #cob-chips / #cob-acciones /
    // #cob-aviso-row hay que recomponerlo: se re-aplica el filtro vigente sobre el DOM nuevo.
    api.cobrosFiltrar('todo');

    ok('F1d) el <tr> renderizado trae class="cob-row" y el data-grupo correcto por línea',
       dom._filas.length === 9
       && dom._filas.filter(f => f.dataset.grupo === 'premio').length === 6
       && dom._filas.filter(f => f.dataset.grupo === 'incentivo').length === 3,
       `${dom._filas.length} filas · grupos=${JSON.stringify(dom._filas.map(f=>f.dataset.grupo))}`);

    const chips0 = docBoot._n['cob-chips'].innerHTML;
    api.cobrosFiltrar('todo');
    const chips = dom._n['cob-chips'].innerHTML;
    ok('F1e) los chips son los grupos PRESENTES con el conteo real, y ninguno viene vacío',
       /Todo \(9\)/.test(chips) && /Premios \(6\)/.test(chips)
       && /Incentivo entrenador \(3\)/.test(chips) && !/\(0\)/.test(chips)
       && !/Bonos/.test(chips) && !/Actuación/.test(chips),
       chips.replace(/<[^>]*>/g, '·'));

    api.cobrosFiltrar('incentivo');
    const ocultasInc = ocultas(dom);
    ok('F1) filtrar por un grupo oculta TODAS las filas de los otros grupos',
       dom._filas.every(f => f.dataset.grupo === 'incentivo' || f._cls.has('cob-row-oculta')),
       JSON.stringify(ocultasInc));
    ok('F1b) y no oculta ninguna del grupo elegido',
       dom._filas.filter(f => f.dataset.grupo === 'incentivo').every(f => !f._cls.has('cob-row-oculta')),
       JSON.stringify(ocultasInc));
    api.cobrosFiltrar('todo');
    ok('F1c) volver a "Todo" no deja ninguna fila oculta',
       dom._filas.every(f => !f._cls.has('cob-row-oculta')), JSON.stringify(ocultas(dom)));

    // ── F2x · LA INVARIANTE: filtrar es una vista, no una selección ──────────
    phase = 'F2';
    const vec0 = vector(dom);
    api.cobrosFiltrar('incentivo');
    api.cobrosFiltrar('todo');
    ok('F2b) filtrar y desfiltrar sin tocar nada deja el vector de checked idéntico',
       JSON.stringify(vector(dom)) === JSON.stringify(vec0),
       `antes=${JSON.stringify(vec0)} después=${JSON.stringify(vector(dom))}`);

    // Con filtro puesto: destildar 1 incentivo visible y 1 premio oculto (a mano, como haría el
    // operador si sacara el filtro). Después sacar el filtro y exigir el vector EXACTO.
    api.cobrosFiltrar('incentivo');
    const filasInc = dom._filas.filter(f => f.dataset.grupo === 'incentivo');
    const filasPre = dom._filas.filter(f => f.dataset.grupo === 'premio');
    filasInc[0]._chk.checked = false;      // destildado con filtro puesto, visible
    filasPre[0]._chk.checked = false;      // destildado con filtro puesto, OCULTO
    api.cobrosRecalc();
    const esperado = dom._filas.map(f => !(f === filasInc[0] || f === filasPre[0]));
    api.cobrosFiltrar('todo');
    ok('F2) tildar con filtro → sacar el filtro → el vector de checked es EXACTAMENTE el esperado',
       JSON.stringify(vector(dom)) === JSON.stringify(esperado),
       `esperado=${JSON.stringify(esperado)} real=${JSON.stringify(vector(dom))}`);

    // ── F3x · emitir manda lo TILDADO, no lo visible ─────────────────────────
    phase = 'F3';
    api.cobrosFiltrar('incentivo');   // visibles: 3 incentivos (uno destildado) — tildado: 4+2=7
    api.cobrosEmitir();
    const emitidos = api.estado().cobEmitirIds.slice().sort();
    const tildados = idsChk(dom);
    ok('F3) cobEmitirIds = lo TILDADO (incluye ocultas), no lo visible',
       JSON.stringify(emitidos) === JSON.stringify(tildados) && emitidos.length === 7,
       `${emitidos.length} emitidos vs ${tildados.length} tildados vs ${dom._filas.filter(f=>!f._cls.has('cob-row-oculta')&&f._chk.checked).length} visibles-tildados`);
    const sumTildado = dom._filas.filter(f => f._chk.checked)
      .reduce((s,f) => s + Number(f._chk.dataset.monto), 0);
    const resumen = dom._n['cobr-resumen'].innerHTML;
    ok('F3b) el importe del resumen del modal es la suma de lo TILDADO',
       resumen.includes(String(sumTildado.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})))
       && resumen.includes('7 línea(s)'),
       resumen.replace(/<[^>]*>/g,'·'));

    // ── F4x · el total ───────────────────────────────────────────────────────
    phase = 'F4';
    api.cobrosRecalc();
    const totalTxt = dom._n['cob-total'].textContent;
    ok('F4) con filtro puesto el total = suma de lo TILDADO, visible u oculto',
       totalTxt.includes(sumTildado.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})),
       `${totalTxt} (esperado ${sumTildado})`);
    const ocultaTildada = dom._filas.find(f => f._cls.has('cob-row-oculta') && f._chk.checked);
    ocultaTildada._chk.checked = false;
    api.cobrosRecalc();
    ok('F4b) destildar una fila OCULTA cambia el total',
       dom._n['cob-total'].textContent !== totalTxt,
       `${totalTxt} → ${dom._n['cob-total'].textContent}`);
    ocultaTildada._chk.checked = true;
    api.cobrosRecalc();

    // ── F5x · el aviso de tildadas fuera del filtro ──────────────────────────
    phase = 'F5';
    const nOcultasTildadas = dom._filas.filter(f => f._cls.has('cob-row-oculta') && f._chk.checked).length;
    const sumOcultas = dom._filas.filter(f => f._cls.has('cob-row-oculta') && f._chk.checked)
      .reduce((s,f) => s + Number(f._chk.dataset.monto), 0);
    const aviso = dom._n['cob-aviso-row'].innerHTML;
    ok('F5) el aviso aparece y nombra el conteo y el importe de lo tildado-oculto',
       aviso.includes(`${nOcultasTildadas} línea(s) tildada(s) fuera del filtro`)
       && aviso.includes(sumOcultas.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}))
       && /el recibo LAS INCLUYE/.test(aviso),
       aviso.replace(/<[^>]*>/g,'·') || '(vacío)');
    api.cobrosFiltrar('todo');
    ok('F5b) con filtro en "Todo" el aviso no está, aunque haya destildadas',
       dom._n['cob-aviso-row'].innerHTML === ''
       && dom._filas.some(f => !f._chk.checked),
       `aviso="${dom._n['cob-aviso-row'].innerHTML}"`);
    // filtro puesto pero cero tildadas ocultas
    api.cobrosTildarVisibles(false);           // sin filtro: destilda todo
    api.cobrosFiltrar('incentivo');
    api.cobrosTildarVisibles(true);            // sólo los 3 incentivos tildados
    ok('F5c) con filtro puesto y CERO tildadas ocultas, el aviso no está',
       dom._n['cob-aviso-row'].innerHTML === '', `aviso="${dom._n['cob-aviso-row'].innerHTML}"`);

    // ── F6x/F7 · tildar / destildar con alcance ──────────────────────────────
    phase = 'F6';
    api.cobrosFiltrar('todo');
    dom._filas.forEach(f => { f._chk.checked = f.dataset.grupo === 'premio'; });  // 6 premios sí, 3 incentivos no
    api.cobrosFiltrar('incentivo');
    api.cobrosTildarVisibles(true);
    ok('F6) "Tildar visibles" tilda sólo las visibles y deja las ocultas como estaban',
       dom._filas.every(f => f._chk.checked === true),   // premios ya estaban en true, incentivos pasan a true
       JSON.stringify(vector(dom)));
    dom._filas.filter(f => f.dataset.grupo === 'premio').forEach((f,i) => { f._chk.checked = i < 3; });
    api.cobrosTildarVisibles(false);
    ok('F6b) "Destildar visibles" no toca las ocultas: la oculta tildada sigue tildada',
       dom._filas.filter(f => f.dataset.grupo === 'incentivo').every(f => !f._chk.checked)
       && dom._filas.filter(f => f.dataset.grupo === 'premio').filter(f => f._chk.checked).length === 3,
       JSON.stringify(vector(dom)));
    api.cobrosFiltrar('todo');
    api.cobrosTildarVisibles(true);
    ok('F6c) sin filtro, tildar opera sobre las 9', vector(dom).every(Boolean), JSON.stringify(vector(dom)));

    phase = 'F7';
    api.cobrosFiltrar('incentivo');
    api.cobrosTildarSoloVisibles();
    ok('F7) "Tildar sólo estas" deja tildadas exactamente las visibles y ninguna otra',
       dom._filas.every(f => f._chk.checked === (f.dataset.grupo === 'incentivo')),
       JSON.stringify(vector(dom)));

    // ── F8x · el rótulo ──────────────────────────────────────────────────────
    phase = 'F8';
    const accFiltrado = dom._n['cob-acciones'].innerHTML;
    ok('F8) el rótulo lleva la cantidad de visibles cuando hay filtro',
       /Tildar los 3 visibles/.test(accFiltrado) && /Destildar los 3 visibles/.test(accFiltrado)
       && /Tildar sólo estos 3/.test(accFiltrado),
       accFiltrado.replace(/<[^>]*>/g,'·'));
    api.cobrosFiltrar('todo');
    const accTodo = dom._n['cob-acciones'].innerHTML;
    ok('F8b) y no dice "visibles" con el filtro en "Todo"',
       /Tildar todo/.test(accTodo) && !/visibles/.test(accTodo) && !/sólo estos/.test(accTodo),
       accTodo.replace(/<[^>]*>/g,'·'));

    // ── F9 · guard del arnés ─────────────────────────────────────────────────
    phase = 'F9';
    let tiro = false;
    try { dom.querySelectorAll('.cob-chk[value="x"]'); } catch { tiro = true; }
    ok('F9) el mini-DOM TIRA ante un selector desconocido (si devolviera [] el probe daría falso verde)',
       tiro, `selDesconocido=${dom._selDesconocido}`);

    // ── Hx · habilitarLinea: la interacción con el doping ───────────────────
    // Es la pregunta que abrió esta tanda: al habilitar una retenida, la línea pasa a la tabla de
    // pagables. Si el refresco resetea, se pierde el filtro y los tildes; si no refresca, la línea
    // no aparece. Acá se verifica el camino del medio: refresca PRESERVANDO.
    phase = 'H';
    api.cobrosFiltrar('todo');
    dom._filas.forEach(f => { f._chk.checked = f.dataset.grupo === 'incentivo'; });
    api.cobrosFiltrar('incentivo');
    const antesIds = idsChk(dom);

    // habilitarLinea llama a cobrosDetalle por dentro, que reescribe #cob-detalle. Se le pasa el
    // dom vigente (para que capture la selección) y después se rearma el mini-DOM con el HTML nuevo.
    await api.habilitarLinea(retActua.id, 'profesional', BENEF);
    const htmlPost = dom._n['cob-detalle'].innerHTML;
    const dom2 = mkDom(htmlPost);
    api.setDoc(dom2);
    api.cobrosFiltrar(api.estado().cobFiltro);

    ok('H1) el filtro sobrevive a habilitar una retenida',
       api.estado().cobFiltro === 'incentivo', `cobFiltro=${api.estado().cobFiltro}`);
    ok('H2) y la selección previa se conserva EXACTA (los 3 incentivos tildados, los 6 premios no)',
       JSON.stringify(idsChk(dom2)) === JSON.stringify(antesIds),
       `antes=${antesIds.length} después=${idsChk(dom2).length}`);
    const filaNueva = dom2._filas.find(f => f._chk.value === retActua.id);
    ok('H3) la línea recién liberada aparece en la tabla, y entra SIN tildar por estar fuera del filtro',
       !!filaNueva && filaNueva.dataset.grupo === 'actuacion' && filaNueva._chk.checked === false
       && filaNueva._cls.has('cob-row-oculta'),
       filaNueva ? `grupo=${filaNueva.dataset.grupo} checked=${filaNueva._chk.checked} oculta=${filaNueva._cls.has('cob-row-oculta')}` : 'NO APARECE');
    const ultimoToast = api.estado().toasts.at(-1);
    ok('H4) y el operador recibe el aviso de que quedó fuera del filtro',
       /FUERA del filtro/.test(ultimoToast?.m || '') && ultimoToast?.t === 'error',
       JSON.stringify(ultimoToast));
    ok('H4b) el grupo nuevo (Actuación) aparece en los chips después de habilitar',
       /Actuación \(1\)/.test(dom2._n['cob-chips'].innerHTML),
       dom2._n['cob-chips'].innerHTML.replace(/<[^>]*>/g,'·'));

    // H5 — el filtro cae a 'todo' si el grupo dejó de existir. Se fuerza abriendo el detalle de un
    // beneficiario sin líneas de ese grupo, preservando.
    phase = 'H5';
    api.cobrosFiltrar('actuacion');
    await sb.from('liquidacion_detalle').update({ estado_linea:'retenido' }).eq('id', retActua.id);
    await api.cobrosDetalle('profesional', BENEF, { preservar: true });
    ok('H5) un filtro cuyo grupo dejó de existir vuelve a "todo" en vez de dejar la tabla vacía',
       api.estado().cobFiltro === 'todo'
       && !api.estado().cobLineas.some(l => l.concepto_tipo === 'actuacion'),
       `cobFiltro=${api.estado().cobFiltro} · lineas=${api.estado().cobLineas.length}`);

    // Guard de coherencia del fixture: los montos que se usaron arriba son los reales.
    ok('F0) el fixture es el esperado: 6 premios + 3 incentivos pagables, 2 retenidas',
       api.estado().cobLineas.length === 9 && SUM_PREMIOS > 0 && SUM_INCENTS > 0,
       `pagables=${api.estado().cobLineas.length} premios=${SUM_PREMIOS} incentivos=${SUM_INCENTS} · retenidas: ${retPremio.id.slice(0,8)}, ${retActua.id.slice(0,8)}`);

  } catch (e) {
    ok(`X1) el probe corrió sin excepciones (fase: ${phase})`, false, e.message);
  } finally {
    // ── restore por ESTADO, no contando filas (GOTCHA #77) ──────────────────
    if (creados.dets.length) await sb.from('liquidacion_detalle').delete().in('id', creados.dets);
    if (creados.liqs.length) await sb.from('liquidaciones').delete().in('id', creados.liqs);
    if (REUNION_B){
      const desp = await snapshotLineas(sb, REUNION_B);
      const arregladas = await restaurarLineas(sb, antesB, desp);
      const v = diffLineas(antesB, await snapshotLineas(sb, REUNION_B));
      ok('R1) restore por ESTADO: las líneas quedaron como estaban', v.limpio, describir(v));
      ok('R2) y no hubo que restaurar nada a mano', arregladas === 0, `${arregladas} línea(s)`);
    }
    // Sin filtro de club (GOTCHA #76): un recibo que se escape en OTRO club también es basura.
    const sobranR = await recibosDesde(sb, T0);
    ok('R3) no quedó ningún recibo del probe, en NINGÚN club', sobranR.length === 0, JSON.stringify(sobranR));
    const { data: sobranL } = await sb.from('liquidacion_detalle').select('id').ilike('concepto', `${TAG}%`);
    ok('R4) no quedaron líneas del probe en la base', (sobranL||[]).length === 0, JSON.stringify(sobranL));
  }

  console.log('\n── Probe · filtro por tipo de concepto en el detalle de Pagos ──');
  console.log(`   html=${HTML_PATH}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
