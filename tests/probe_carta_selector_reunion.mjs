/**
 * Probe — selector de reunión en carta-llamados.html (código real, sin browser).
 *
 * El problema que arregla el código bajo prueba: Fede no podía ver la carta de R8 (16/08,
 * pública N° 7) para usarla de plantilla de la de octubre. No estaba borrada — la página no
 * tenía selector, y su default era `.in(estado, [borrador,programada,publicada])` +
 * `.order(fecha, ASC).limit(1)`: dos defectos que se suman. El filtro deja afuera 'finalizada',
 * que es el estado de toda carta pasada, y el ASC sin piso de fecha devuelve la MÁS VIEJA, así
 * que entrando desde el dashboard la página abría en un borrador de junio.
 * Diagnóstico: docs/diagnosticos/2026-09-01_carta-llamados-r8-no-visible.md
 *
 * Patrón de tests/README.md § "Browser NO disponible": se EXTRAEN del propio carta-llamados.html
 * las funciones a probar —por ancla, con balance de llaves— y se las corre con new AsyncFunction
 * inyectando el cliente Supabase real y stubs de DOM. Nada se reimplementa acá: si el HTML
 * cambia, este probe corre el HTML cambiado.
 *
 * SOLO LECTURA contra la base: la parte A consulta, y el resto son funciones puras sobre listas
 * (reales o sintéticas). No planta fixtures, así que no hay restore ni riesgo de residuo.
 *
 * Qué cubre:
 *   A) el selector lista TODAS las reuniones — la finalizada (R8) y la de prueba (9999) incluidas
 *   B) elegir una finalizada la deja en modo lectura: sin "+ Nuevo Turno" ni "Publicar carta"
 *   C) el default sin ?reunion_id: activa → próxima abierta → más reciente. Nunca R6 de junio,
 *      nunca la sandbox por descarte
 *   D) LA DECISIÓN: mirar una carta NO cambia la reunión activa del sistema
 *   E) los puntos de entrada a la página
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_carta_selector_reunion.mjs                      # corrida normal
 *   node tests/probe_carta_selector_reunion.mjs --mutantes=M1,M2,M3  # mutation testing por tanda
 *   node tests/probe_carta_selector_reunion.mjs --mutantes           # los 10 de un saque
 *
 * Los mutantes van en TANDAS de 4-5: cada uno es una corrida completa del probe y los 120 s de
 * timeout del harness llegan como SIGKILL (exit 137). Mismo motivo que en
 * probe_filtro_concepto_pagos.mjs, que es de donde sale este runner.
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

const CLUB_ID  = '0649e9c5-9e87-4aad-842f-101458e6b33c';   // Hipódromo de Dolores
const R8       = '7b6e003e-22e2-4629-bf55-f18560b1260f';   // 16/08/2026 · pública N° 7 · finalizada
const R6       = 'b02ca761-6f44-4720-86aa-a3c3099019ea';   // 20/06/2026 · borrador — el default viejo
const SANDBOX  = 'a0000000-0000-0000-0000-000000009999';   // es_prueba=true

const sb = createClient(SUPABASE_URL, KEY, { auth:{ autoRefreshToken:false, persistSession:false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = process.env.CARTA_HTML || join(HERE, '..', 'carta-llamados.html');
const HTML = readFileSync(HTML_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const results = [];
const ok = (t, c, n='') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

// ── extracción por ancla ────────────────────────────────────────────────────
// El scan de llaves arranca en la llave FINAL de la firma, no en la primera que aparezca
// después del ancla (probe_filtro_concepto_pagos.mjs, mismo motivo).
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
// Para las const: hasta la primera línea en blanco. Cortar en el primer ';' no sirve —
// escH termina en `.replace(/'/g,'&#39;');` y ese `&#39;` TIENE un punto y coma adentro.
function extractStmt(src, firma){
  const i = src.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  const fin = src.indexOf('\n\n', i);
  if (fin < 0) throw new Error(`no pude cerrar: ${firma}`);
  return src.slice(i, fin);
}

// ── mini-DOM ────────────────────────────────────────────────────────────────
// Sólo lo que el código realmente toca: getElementById sobre cuatro ids. No hay
// querySelectorAll acá, así que no hace falta motor de selectores.
const IDS = ['sel-reunion', 'btn-nueva-carrera', 'btn-publicar', 'reunion-info', 'list-container'];
function mkDom(){
  const nodos = {};
  const get = id => (nodos[id] ||= { id, innerHTML:'', value:'', textContent:'', style:{} });
  IDS.forEach(get);
  return { getElementById: id => get(id), _n: nodos };
}
/** Parsea los <option> que renderSelectorReuniones escribió, en orden. */
function opciones(sel){
  const out = [];
  const re = /<option value="([^"]*)">([\s\S]*?)<\/option>/g;
  let m;
  while ((m = re.exec(sel.innerHTML))) out.push({ id: m[1], rotulo: m[2] });
  return out;
}

// ── armado del arnés ────────────────────────────────────────────────────────
async function mkApi({ dom, loc, activeGet, reuniones = [], reunionId = null, reunion = null }){
  const piezas = [
    extractStmt(HTML, 'const escH = s =>'),
    extractStmt(HTML, 'const ESTADOS_ABIERTOS ='),
    extractFn(HTML, 'function rotuloReunion(r) {'),
    extractFn(HTML, 'function elegirReunionPorDefecto(lista) {'),
    extractFn(HTML, 'function renderSelectorReuniones() {'),
    extractFn(HTML, 'function irAReunion(id) {'),
    extractFn(HTML, 'function applyEstadoUI() {'),
  ].join('\n\n');
  const cuerpo = piezas + `
    return {
      ESTADOS_ABIERTOS, rotuloReunion, elegirReunionPorDefecto,
      renderSelectorReuniones, irAReunion, applyEstadoUI,
      _set(p){ if ('reuniones' in p) reuniones = p.reuniones;
               if ('reunionId' in p) reunionId = p.reunionId;
               if ('reunion'   in p) reunion   = p.reunion; },
    };`;
  const setSpy = { llamado: 0, ids: [] };
  const ActiveReunion = {
    get: () => activeGet,
    set: id => { setSpy.llamado++; setSpy.ids.push(id); },
  };
  const make = new AsyncFunction(
    'document', 'location', 'ActiveReunion', 'reuniones', 'reunionId', 'reunion', cuerpo);
  const api = await make(dom, loc, ActiveReunion, reuniones, reunionId, reunion);
  api._setSpy = setSpy;
  return api;
}

// ═════════════════════════════ MUTATION TESTING ═════════════════════════════
// Cada mutante neutraliza UNA cosa sobre una COPIA del HTML en un tmpdir —el repo no se toca— y
// re-corre este mismo probe con CARTA_HTML apuntando a la copia. Un mutante que no mata ningún
// assert significa que ese assert no prueba lo que dice probar.
const MUTANTES = [
  { id:'M1', desc:'el default ignora la reunión activa', mata:['C2','C6'],
    from:`  const activa = ActiveReunion.get();\n  if (activa && lista.some(r => r.id === activa)) return activa;`,
    to:  `  const activa = null;\n  if (activa && lista.some(r => r.id === activa)) return activa;` },

  { id:'M2', desc:'vuelve el bug: sin piso de fecha, la próxima es la MÁS VIEJA abierta (R6 de junio)',
    mata:['C1','C1b'],
    from:`    .filter(r => r.fecha >= hoy && ESTADOS_ABIERTOS.includes(r.estado))`,
    to:  `    .filter(r => ESTADOS_ABIERTOS.includes(r.estado))` },

  { id:'M3', desc:'vuelve el bug: el selector filtra por estado y pierde las finalizadas', mata:['A2','A4','A8'],
    from:`    .eq('club_id', CLUB_ID)\n    .order('fecha', { ascending: false });\n  if (erReuns) { toast(erReuns.message, 'error'); return; }`,
    to:  `    .eq('club_id', CLUB_ID)\n    .in('estado', ['borrador','programada','publicada'])\n    .order('fecha', { ascending: false });\n  if (erReuns) { toast(erReuns.message, 'error'); return; }`,
    archivo:'query' },

  { id:'M4', desc:'el selector esconde la reunión de prueba', mata:['A3','A5'],
    from:`  sel.innerHTML = reuniones\n    .map(r =>`,
    to:  `  sel.innerHTML = reuniones.filter(r => !r.es_prueba)\n    .map(r =>` },

  { id:'M5', desc:'el default puede caer en la sandbox por descarte', mata:['C5'],
    from:`  const reales = lista.filter(r => !r.es_prueba);`,
    to:  `  const reales = lista;` },

  { id:'M6', desc:'el rótulo usa el número interno en vez del público', mata:['A4'],
    from:`  const num = r.numero_publico != null ? \`N° \${r.numero_publico}\` : \`interna \${r.numero}\`;`,
    to:  `  const num = \`N° \${r.numero}\`;` },

  { id:'M7', desc:'elegir en el selector fija la reunión activa del sistema', mata:['D1'],
    from:`function irAReunion(id) {\n  if (!id || id === reunionId) return;`,
    to:  `function irAReunion(id) {\n  if (!id || id === reunionId) return;\n  ActiveReunion.set(id);` },

  { id:'M8', desc:'applyEstadoUI deja editable una reunión finalizada', mata:['B1'],
    from:`  const editable = ['borrador','programada'].includes(reunion?.estado);\n  document.getElementById('btn-nueva-carrera')`,
    to:  `  const editable = true;\n  document.getElementById('btn-nueva-carrera')` },

  { id:'M9', desc:'el selector lista las reuniones más viejas arriba', mata:['A6'],
    from:`    .eq('club_id', CLUB_ID)\n    .order('fecha', { ascending: false });\n  if (erReuns) { toast(erReuns.message, 'error'); return; }`,
    to:  `    .eq('club_id', CLUB_ID)\n    .order('fecha', { ascending: true });\n  if (erReuns) { toast(erReuns.message, 'error'); return; }`,
    archivo:'query' },

  { id:'M10', desc:'el último recurso devuelve la reunión más VIEJA en vez de la más reciente', mata:['C4'],
    from:`  const recientes = [...reales].sort((a, b) => b.fecha.localeCompare(a.fecha));`,
    to:  `  const recientes = [...reales].sort((a, b) => a.fecha.localeCompare(b.fecha));` },
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
  const dir = mkdtempSync(join(tmpdir(), 'mut-carta-selector-'));
  // Sin este symlink un mutante que se ejecutara desde el tmpdir no resolvería
  // '@supabase/supabase-js' y moriría en el import — el runner lo leería como sobreviviente.
  try { symlinkSync(join(HERE, '..', 'node_modules'), join(dir, 'node_modules'), 'dir'); }
  catch (e) { console.warn(`[runner] no pude symlinkear node_modules al tmpdir: ${e.message}`); }
  console.log(`\n═══ MUTATION TESTING · ${tanda.length}/${MUTANTES.length} mutantes${pedidos ? ` (tanda: ${pedidos.join(',')})` : ''} ═══\n(copias en ${dir} — el repo no se toca)\n`);
  let vivos = 0, arnes = 0;
  for (const m of tanda){
    if (!HTML.includes(m.from)) {
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el ancla no existe en el fuente. ${m.desc}`);
      arnes++; continue;
    }
    const path = join(dir, `${m.id}.html`);
    writeFileSync(path, HTML.replace(m.from, m.to));
    const env = { ...process.env, CARTA_HTML: path };
    let out = '';
    try { out = execFileSync(process.execPath, [SELF], { env, encoding:'utf8', stdio:['ignore','pipe','pipe'] }); }
    catch (e) { out = (e.stdout||'') + (e.stderr||''); }

    // "murió por assert" vs "murió al arrancar": el probe siempre cierra con "NN/NN OK". Si esa
    // línea no está, el hijo no llegó a los asserts y NO se sabe nada del mutante — reportarlo
    // como SOBREVIVE sería leerlo como agujero de cobertura cuando es un fallo del arnés.
    const corrio = /^\d+\/\d+ OK$/m.test(out);
    if (!corrio) {
      const causa = (out.split('\n').find(l => /Error|error:/.test(l)) || '(sin línea de error)').trim();
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el probe no llegó a correr los asserts. ${m.desc}`
        + `\n     ↳ ${causa.slice(0, 160)}`);
      arnes++; continue;
    }
    // GOTCHA #82 — anclar en el ')' del rótulo: `❌ C1\b` NO delimita `❌ C1b)`.
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
(async () => {
  const HOY = new Date().toISOString().slice(0,10);

  // ── A) EL SELECTOR ────────────────────────────────────────────────────────
  // La query se corre EXTRAÍDA del HTML, no escrita acá: así un `.in('estado', …)` que alguien
  // reponga en el archivo rompe A2/A8 en vez de pasar desapercibido.
  const QUERY_SRC = HTML.slice(
    HTML.indexOf("const { data: reuns, error: erReuns } = await sb.from('reuniones')"),
    HTML.indexOf("if (erReuns) { toast(erReuns.message, 'error'); return; }"));
  const correQuery = new AsyncFunction('sb', 'CLUB_ID', QUERY_SRC + '\n return { reuns, erReuns };');
  const { reuns, erReuns } = await correQuery(sb, CLUB_ID);
  ok('A0) la query del selector no dio error', !erReuns, erReuns ? erReuns.message : '');

  // Verdad independiente: lo que hay en la base, sin pasar por el código.
  const { data: todas } = await sb.from('reuniones')
    .select('id,numero,numero_publico,fecha,estado,es_prueba').eq('club_id', CLUB_ID);
  ok('A1) el selector trae TODAS las reuniones del club, sin filtro de estado',
     (reuns||[]).length === (todas||[]).length,
     `selector=${(reuns||[]).length} · base=${(todas||[]).length}`);

  const dom = mkDom();
  const loc = { search: '', href: '' };
  const api = await mkApi({ dom, loc, activeGet: null, reuniones: reuns||[], reunionId: R8 });
  api.renderSelectorReuniones();
  const ops = opciones(dom._n['sel-reunion']);

  ok('A2) R8 (16/08, finalizada) está en el selector', ops.some(o => o.id === R8),
     ops.length ? `${ops.length} opciones` : 'sin opciones');
  ok('A3) la reunión de prueba 9999 está en el selector', ops.some(o => o.id === SANDBOX));

  const opR8 = ops.find(o => o.id === R8);
  ok('A4) el rótulo de R8 usa el número PÚBLICO, con fecha y estado',
     opR8?.rotulo === 'N° 7 — 16/8/2026 — finalizada', opR8?.rotulo);

  const opSb = ops.find(o => o.id === SANDBOX);
  ok('A5) la 9999 va rotulada ⚗ PRUEBA, igual que en Pagos',
     !!opSb && opSb.rotulo.endsWith(' ⚗ PRUEBA') && opSb.rotulo.startsWith('interna 9999'), opSb?.rotulo);

  const fechaDe = id => (todas||[]).find(r => r.id === id)?.fecha || '';
  const fechas = ops.map(o => fechaDe(o.id));
  ok('A6) las opciones van de la más reciente a la más vieja',
     fechas.every((f, i) => i === 0 || fechas[i-1] >= f), fechas.join(' > '));

  ok('A7) la opción seleccionada es la reunión mostrada', dom._n['sel-reunion'].value === R8);

  const estadosBase = [...new Set((todas||[]).map(r => r.estado))].sort();
  const estadosSel  = [...new Set(ops.map(o => (todas||[]).find(r => r.id === o.id)?.estado))].sort();
  ok('A8) aparecen TODOS los estados que existen en la base, finalizada incluida',
     JSON.stringify(estadosBase) === JSON.stringify(estadosSel),
     `base=${estadosBase.join(',')} · selector=${estadosSel.join(',')}`);

  // ── B) MODO LECTURA (no se rediseña; se verifica que sigue valiendo desde el selector) ──
  const conEstado = async estado => {
    const d = mkDom();
    const a = await mkApi({ dom: d, loc, activeGet: null, reunion: { estado } });
    a.applyEstadoUI();
    return { nuevo: d._n['btn-nueva-carrera'].style.display,
             pub:   d._n['btn-publicar'].style.display };
  };
  const bFin = await conEstado('finalizada');
  ok('B1) reunión finalizada → sin "+ Nuevo Turno" ni "Publicar carta"',
     bFin.nuevo === 'none' && bFin.pub === 'none', JSON.stringify(bFin));
  const bBor = await conEstado('borrador');
  ok('B2) reunión en borrador → los dos botones vuelven',
     bBor.nuevo === '' && bBor.pub === '', JSON.stringify(bBor));
  const bPub = await conEstado('publicada');
  ok('B3) reunión publicada → tampoco es editable',
     bPub.nuevo === 'none' && bPub.pub === 'none', JSON.stringify(bPub));

  // ── C) EL DEFAULT SIN ?reunion_id ─────────────────────────────────────────
  const elegirCon = async (activeGet, lista) => {
    const a = await mkApi({ dom: mkDom(), loc, activeGet, reuniones: lista });
    return { id: a.elegirReunionPorDefecto(lista), spy: a._setSpy };
  };
  const LISTA = reuns || [];
  const proximaReal = LISTA
    .filter(r => !r.es_prueba && r.fecha >= HOY && ['borrador','programada','publicada','en_curso'].includes(r.estado))
    .sort((a,b) => a.fecha.localeCompare(b.fecha))[0];

  const c1 = await elegirCon(null, LISTA);
  ok('C1) sin activa, cae en la PRÓXIMA abierta (fecha >= hoy)', c1.id === proximaReal?.id,
     `eligió=${c1.id} · esperada=${proximaReal?.id} (${proximaReal?.fecha})`);
  ok('C1b) y NO en R6 de junio, que es donde caía antes', c1.id !== R6, `eligió=${c1.id}`);

  const c2 = await elegirCon(R8, LISTA);
  ok('C2) con una activa vigente, gana la activa aunque esté finalizada', c2.id === R8, c2.id);

  const c3 = await elegirCon('00000000-0000-0000-0000-000000000000', LISTA);
  ok('C3) una activa que ya no existe se ignora y cae en la próxima', c3.id === proximaReal?.id, c3.id);

  // Sintéticas: estados que la base no tiene hoy, para no depender del calendario real.
  const PASADAS = [
    { id:'p1', numero:1, numero_publico:1, fecha:'2020-01-01', estado:'finalizada', es_prueba:false },
    { id:'p2', numero:2, numero_publico:2, fecha:'2020-06-01', estado:'cancelada',  es_prueba:false },
    { id:'p3', numero:3, numero_publico:3, fecha:'2020-03-01', estado:'finalizada', es_prueba:false },
  ];
  const c4 = await elegirCon(null, PASADAS);
  ok('C4) sin ninguna próxima, cae en la MÁS RECIENTE, del estado que sea', c4.id === 'p2', c4.id);

  const SOLO_SANDBOX = [
    ...PASADAS,
    { id:'sbx', numero:9999, numero_publico:null, fecha:'2099-01-01', estado:'publicada', es_prueba:true },
  ];
  const c5 = await elegirCon(null, SOLO_SANDBOX);
  ok('C5) la sandbox no se elige por descarte, ni siendo la única próxima abierta',
     c5.id === 'p2', c5.id);

  const c6 = await elegirCon('sbx', SOLO_SANDBOX);
  ok('C6) pero sí se respeta si alguien la activó a mano', c6.id === 'sbx', c6.id);

  const c7 = await elegirCon(null, []);
  ok('C7) sin reuniones, devuelve null y la página muestra el vacío', c7.id === null, String(c7.id));

  // ── D) LA DECISIÓN: mirar una carta NO cambia la reunión activa ────────────
  const dLoc = { search: '', href: '' };
  const apiD = await mkApi({ dom: mkDom(), loc: dLoc, activeGet: null, reuniones: LISTA, reunionId: R6 });
  apiD.irAReunion(R8);
  ok('D1) elegir en el selector NO fija la reunión activa del sistema',
     apiD._setSpy.llamado === 0, `ActiveReunion.set llamado ${apiD._setSpy.llamado} vez/veces`);
  ok('D2) el default tampoco la fija: sólo la lee', c1.spy.llamado === 0 && c2.spy.llamado === 0);
  ok('D3) navega a la reunión elegida por ?reunion_id',
     dLoc.href === `carta-llamados.html?reunion_id=${R8}`, dLoc.href);

  const dLoc2 = { search: '?club=abc&reunion_id=' + R6, href: '' };
  const apiD2 = await mkApi({ dom: mkDom(), loc: dLoc2, activeGet: null, reuniones: LISTA, reunionId: R6 });
  apiD2.irAReunion(R8);
  ok('D4) conserva el ?club= del club-switcher al saltar de reunión',
     dLoc2.href.includes('club=abc') && dLoc2.href.includes(`reunion_id=${R8}`), dLoc2.href);

  // Sobre el TEXTO del archivo, ignorando comentarios: el comentario que explica la decisión
  // nombra ActiveReunion.set() y un grep pelado lo contaría como llamada.
  const codigo = HTML.split('\n')
    .filter(l => { const t = l.trim(); return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')); })
    .join('\n');
  ok('D5) no queda ninguna llamada a ActiveReunion.set() en la página',
     !codigo.includes('ActiveReunion.set('),
     (codigo.split('\n').find(l => l.includes('ActiveReunion.set(')) || '').trim());
  ok('D6) ni una escritura suelta de sgh_active_reunion_id',
     !codigo.includes("localStorage.setItem('sgh_active_reunion_id'"));
  ok('D7) pero sí se sigue LEYENDO la activa para el default', codigo.includes('ActiveReunion.get()'));

  // ── E) PUNTOS DE ENTRADA ──────────────────────────────────────────────────
  const idx  = readFileSync(join(HERE, '..', 'index.html'), 'utf8');
  const reun = readFileSync(join(HERE, '..', 'reuniones.html'), 'utf8');
  const cal  = readFileSync(join(HERE, '..', 'calendario.html'), 'utf8');
  const sinParam = (idx.match(/carta-llamados\.html'/g) || []).length;
  ok('E1) el dashboard sigue linkeando sin parámetros — ahora el default se hace cargo',
     sinParam === 4, `${sinParam} links`);
  ok('E2) reuniones.html y calendario.html pasan ?reunion_id',
     reun.includes('carta-llamados.html?reunion_id=') && cal.includes('carta-llamados.html?reunion_id='));
  ok('E3) el selector quedó cableado en el topbar',
     HTML.includes('id="sel-reunion"') && HTML.includes('onchange="irAReunion(this.value)"'));

  console.log('\n── Probe · selector de reunión en carta-llamados ──');
  console.log(`   html=${HTML_PATH}  ·  hoy=${HOY}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
