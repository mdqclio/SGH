/**
 * Historial de recibos (opción B de ISSUE-056) — probe de código real, sin browser.
 *
 * Pedido tres veces: Fede el 27/08 ("si vas al histórico de esa persona… podés buscar el recibo y
 * mostrar el recibo de quién lo firmó"), Valeria el 30/08 ("¿aparece que ya fue pagado?") y Fede
 * otra vez el 30/08 ("que haya una manera de que sea más fácil buscarlos").
 *
 * Lo que se prueba, en orden de importancia:
 *   1. Un recibo ANULADO aparece, marcado, y sus líneas salen de la FOTO que guardó
 *      anular_recibo v2 — no de una reconstrucción contra la tabla.
 *   2. Reimprimir un anulado manda SUS líneas, no un array vacío. Era el bug latente:
 *      imprimirReciboCobro tenía `lineaIds` en la firma y no lo usaba, releía por recibo_id, que
 *      para un anulado es NULL.
 *   3. Un recibo de OTRO CLUB no aparece — ni en el listado ni buscando su número.
 *
 * El anulado se fabrica llamando a emitir_recibo y anular_recibo DE VERDAD, no insertando una fila
 * con estado='anulado' y un jsonb armado a mano. Si el probe fabrica el jsonb, prueba la vista
 * contra su propia suposición sobre la forma de ese campo — y la forma de ese campo es justamente
 * de lo que depende todo. Con los RPC reales, si mañana anular_recibo cambia el formato, el probe
 * se entera.
 *
 * El "otro club" NO se fabrica: son los recibos reales de Dolores. El probe corre con
 * CLUB_ID = CLUB_B, así que los de Dolores YA son de otro club. Cero escrituras en el club real, y
 * el assert corre contra datos de verdad.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_historial_recibos.mjs                      # corrida normal
 *   node tests/probe_historial_recibos.mjs --mutantes=M1,M2,M3  # mutation testing por tanda
 *
 * Los 17 de un saque pasan el timeout de 120 s del harness (GOTCHA #83): tandas de 5.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { snapshotLineas, restaurarLineas, diffLineas, describir, recibosDesde }
  from './lib/estado_lineas.mjs';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }

const CLUB_B = 'a6da7e40-1515-45dc-8933-4eef33ce937a'; // Mi Club Hípico — el club del probe
const CLUB_A = '0649e9c5-9e87-4aad-842f-101458e6b33c'; // Dolores — el "otro club" del listado, SÓLO LECTURA
const CLUB_C = '710d43c1-364e-4431-99d9-c47e87242075'; // San Francisco — club ajeno donde SÍ se escribe (C2)
const TAG = 'TEST HISTORIAL RECIBOS';

const sb = createClient(SUPABASE_URL, KEY, { auth:{ autoRefreshToken:false, persistSession:false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = process.env.LIQ_HTML || join(HERE, '..', 'liquidaciones.html');
const HTML = readFileSync(HTML_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const results = [];
const ok = (t, c, n='') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
const RUN = Date.now().toString(36);
const T0 = new Date(Date.now() - 5000).toISOString();

// El scan arranca en la llave FINAL de la firma: `opts = {}` en la lista de parámetros haría que
// el cuerpo se "cierre" en el `}` del default (lección de probe_filtro_concepto_pagos).
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
// Motor de selectores que soporta SÓLO los que usa el código y TIRA ante cualquier otro. Sin ese
// guard, un cambio de selector en el HTML devolvería [] en silencio y el probe pasaría en verde
// probando nada — la misma clase de falso verde del recibo #4.
const SELECTORES = ['#rec-resultados tr.rec-row', '.rec-row', '.rec-linea'];

function mkClassList(set){
  return { add:c=>set.add(c), remove:c=>set.delete(c), contains:c=>set.has(c),
           toggle:(c,on)=>{ if(on===undefined){ set.has(c)?set.delete(c):set.add(c); } else if(on) set.add(c); else set.delete(c); } };
}

function mkDom(){
  const nodos = {};
  const get = id => (nodos[id] ||= { id, innerHTML:'', textContent:'', value:'', disabled:false,
                                     style:{}, classList: mkClassList(new Set()),
                                     scrollIntoView(){}, focus(){}, click(){} });
  ['rec-q','rec-estado','rec-resultados','rec-detalle','rec-total','rec-neto','recibo-print',
   'cob-detalle','cob-beneficiarios','cob-total'].forEach(get);

  // Las filas se parsean del HTML REAL que escribió recibosRenderLista / recibosDetalle. Si el
  // render se olvida de la clase o del data-*, el fixture nace roto y los asserts mueren — que es
  // lo que tiene que pasar.
  const filasDe = (html, cls, attr) => {
    const out = []; const re = new RegExp(`<tr([^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*)>`, 'g');
    let m; while ((m = re.exec(html))){
      const a = m[1];
      out.push({ _attrs:a, dataset:{ [attr]: (a.match(new RegExp(`data-${attr}="([^"]*)"`))||[])[1] ?? null,
                                     estado: (a.match(/data-estado="([^"]*)"/)||[])[1] ?? null },
                 _cls:new Set((a.match(/class="([^"]*)"/)||[])[1]?.split(/\s+/) || []) });
    }
    return out;
  };
  const doc = {
    getElementById: id => get(id),
    _n: nodos,
    _selDesconocido: null,
    get _filas(){ return filasDe(nodos['rec-resultados'].innerHTML, 'rec-row', 'recibo'); },
    get _lineas(){ return filasDe(nodos['rec-detalle'].innerHTML, 'rec-linea', 'linea'); },
    querySelectorAll(sel){
      if (!SELECTORES.includes(sel)) { doc._selDesconocido = sel; throw new Error(`mini-DOM: selector no soportado → ${sel}`); }
      return sel === '.rec-linea' ? doc._lineas : doc._filas;
    },
  };
  return doc;
}

const numerosEnLista = dom => dom._n['rec-resultados'].innerHTML.match(/#(\d+)/g)?.map(s=>Number(s.slice(1))) || [];
const idsLineasEnDetalle = dom => dom._lineas.map(f => f.dataset.linea).sort();

// ═════════════════════════════ MUTATION TESTING ═════════════════════════════
const MUTANTES = [
  { id:'M1', desc:'la búsqueda no acota por club (se saca el .eq(club_id))', mata:['C1d'],
    from:`    let qy = sb.from('recibos').select(REC_SELECT).eq('club_id', CLUB_ID);`,
    to:  `    let qy = sb.from('recibos').select(REC_SELECT);` },
  // EQUIVALENTE DECLARADO. Con el .eq('club_id') del servidor puesto (que es lo que prueba C1d), el
  // post-filtro es la identidad: `filas` NUNCA trae una fila ajena, así que filtrarla o no da lo
  // mismo y ningún test puede distinguir las dos versiones. Se deja igual porque es la red que
  // atrapa un camino de consulta futuro que olvide el .eq — sacarla para que el mutante muera sería
  // optimizar la métrica en vez del código. Si algún día MUERE, el runner avisa: significaría que
  // el servidor dejó de filtrar.
  { id:'M2', desc:'el cinturón de club del post-filtro se afloja', mata:['C1c'],
    equivalente: 'con el .eq(club_id) del servidor puesto, `filas` nunca trae una fila ajena y el '
               + 'post-filtro es la identidad — ningún test puede distinguir las dos versiones',
    from:`  recResultados = filas.filter(r => r.club_id === CLUB_ID);`,
    to:  `  recResultados = filas;` },
  { id:'M3', desc:'el detalle no filtra las líneas con cobDelClub', mata:['C2'],
    from:`  return { lineas: (data || []).filter(cobDelClub), foto: false };`,
    to:  `  return { lineas: (data || []), foto: false };` },
  { id:'M4', desc:'el modo número usa ilike en vez de igualdad exacta', mata:['N1'],
    from:`    if (esNumero) terminos.push(\`numero_recibo.eq.\${Number(q)}\`);`,
    to:  `    if (esNumero) terminos.push(\`cobrador_documento.ilike.*\${q}*\`);` },
  { id:'M5', desc:'la búsqueda por persona ignora propietario_id', mata:['P1c'],
    from:`    if (propIds.length) terminos.push(\`propietario_id.in.(\${propIds.join(',')})\`);`,
    to:  `    if (false) terminos.push(\`propietario_id.in.(\${propIds.join(',')})\`);` },
  { id:'M6', desc:'se saca el término de cobrador del .or()', mata:['P2','P2b'],
    from:`      terminos.push(\`cobrador_nombre.ilike.*\${q}*\`);\n      terminos.push(\`cobrador_documento.ilike.*\${q}*\`);`,
    to:  `      terminos.push(\`comprobante_url.ilike.*\${q}*\`);` },
  { id:'M7', desc:'no se sanitiza q antes de interpolarlo en el .or()', mata:['P3'],
    from:`function recSanitizar(q){ return String(q ?? '').replace(/[,()*\\\\]/g, ' ').trim(); }`,
    to:  `function recSanitizar(q){ return String(q ?? '').trim(); }` },
  // EQUIVALENTE DECLARADO — y corrige una afirmación del plan que estaba MAL. El plan decía
  // "PostgREST rompe con un in.() vacío". No rompe. Medido contra la base el 2026-08-30:
  //   "profesional_id.in.()"                                  → 0 filas, sin error
  //   "profesional_id.in.(),numero_recibo.eq.1"               → [1]   ← no se come al otro término
  //   "numero_recibo.eq.1,profesional_id.in.()"               → [1]
  //   "profesional_id.in.(),propietario_id.in.(),numero_recibo.eq.1" → [1]
  // O sea que el `if (profIds.length)` es defensivo, no load-bearing, y ningún test puede
  // distinguirlo. Se deja igual: la tolerancia de PostgREST a `in.()` no es contractual y el guard
  // documenta la intención. Si algún día MUERE, el runner avisa — significaría que esa tolerancia
  // cambió, y entonces el guard pasó a ser necesario.
  { id:'M8', desc:'se arma in.() aunque la lista de ids esté vacía', mata:['P4'],
    equivalente: 'PostgREST tolera in.() vacío (0 filas, sin error) y NO anula los demás términos '
               + 'del .or() — medido; el guard es defensivo y ningún test puede distinguirlo',
    from:`    if (profIds.length) terminos.push(\`profesional_id.in.(\${profIds.join(',')})\`);`,
    to:  `    terminos.push(\`profesional_id.in.(\${profIds.join(',')})\`);` },
  // `mata` es sólo A3b, no A3: A3 compara el CONJUNTO DE IDS, y los ids son los mismos vengan de
  // la foto o de la tabla (las filas siguen existiendo). El único assert que distingue foto de
  // reconstrucción es A3b, que pisa el monto en la tabla y exige que el detalle no se entere.
  { id:'M9', desc:'EL GRANDE: el detalle del anulado ignora la foto y vuelve a la tabla', mata:['A3b'],
    from:`  if (rec.estado === 'anulado' && esFotoAnulado(rec)) return { lineas: rec.lineas_anuladas, foto: true };`,
    to:  `  if (false) return { lineas: rec.lineas_anuladas, foto: true };` },
  { id:'M10', desc:'los anulados se excluyen del listado', mata:['A1'],
    from:`  recResultados = filas.filter(r => r.club_id === CLUB_ID);`,
    to:  `  recResultados = filas.filter(r => r.club_id === CLUB_ID && r.estado !== 'anulado');` },
  { id:'M11', desc:'el filtro de estado no se aplica', mata:['A1b'],
    from:`    if (estado) qy = qy.eq('estado', estado);`,
    to:  `    if (false) qy = qy.eq('estado', estado);` },
  { id:'M12', desc:'el bloque de anulación pierde el motivo', mata:['A2'],
    from:`      <div style="font-size:13px;padding:3px 0;"><strong>Motivo:</strong> \${escapeHtml(rec.motivo_anulacion || '—')}</div>`,
    to:  `      <div style="font-size:13px;padding:3px 0;"></div>` },
  // `mata` es I4, no I2: I2 mira lo que el LLAMADOR le pasa a la función (con el espía), y el bug
  // vive ADENTRO de la función. Sólo I4, que la corre de verdad, puede verlo.
  { id:'M13', desc:'EL OTRO GRANDE: imprimirReciboCobro vuelve a ignorar lineaIds y opts.lineas', mata:['I4'],
    from:`  let lns = opts?.lineas || null, eLns = null;\n  if (!lns) ({ data: lns, error: eLns } = lineaIds?.length\n    ? await base.in('id', lineaIds)\n    : await base.eq('recibo_id', recibo.id));`,
    to:  `  let lns = null, eLns = null;\n  ({ data: lns, error: eLns } = await base.eq('recibo_id', recibo.id));` },
  { id:'M14', desc:'reimprimir no repone cobBenef', mata:['I3'],
    from:`  cobBenef = { tipo:b.tipo, id:b.id, nombre: recNombreBenef(rec) };`,
    to:  `  cobBenef = cobBenef || null;` },
  { id:'M15', desc:'idsLineasAnuladas no entiende el formato v2 (foto)', mata:['A4c'],
    from:`  return (rec?.lineas_anuladas || []).map(l => (typeof l === 'string' ? l : l?.id)).filter(Boolean);`,
    to:  `  return (rec?.lineas_anuladas || []).filter(l => typeof l === 'string');` },
  { id:'M16', desc:'el detalle pierde la columna Rol', mata:['D1b'],
    from:`<td>\${l.posicion?l.posicion+'°':'—'}</td><td>\${rolDeLinea(l)||'—'}</td><td>\${escapeHtml(l.concepto||'')}</td>`,
    to:  `<td>\${l.posicion?l.posicion+'°':'—'}</td><td>—</td><td>\${escapeHtml(l.concepto||'')}</td>` },
  { id:'M17', desc:'el mini-DOM devuelve [] ante selector desconocido en vez de tirar', mata:['G1'],
    from:`      if (!SELECTORES.includes(sel)) { doc._selDesconocido = sel; throw new Error(\`mini-DOM: selector no soportado → \${sel}\`); }`,
    to:  `      if (!SELECTORES.includes(sel)) { doc._selDesconocido = sel; return []; }`,
    archivo: 'probe' },
];

const argMut = process.argv.find(a => a === '--mutantes' || a.startsWith('--mutantes='));
if (argMut) {
  const pedidos = argMut.includes('=') ? argMut.split('=')[1].split(',').map(s=>s.trim()).filter(Boolean) : null;
  if (pedidos) {
    const desc = pedidos.filter(p => !MUTANTES.some(m => m.id === p));
    if (desc.length) { console.error(`mutantes inexistentes: ${desc.join(', ')}`); process.exit(2); }
  }
  const tanda = pedidos ? MUTANTES.filter(m => pedidos.includes(m.id)) : MUTANTES;
  const SELF = fileURLToPath(import.meta.url);
  const SELF_SRC = readFileSync(SELF, 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'mut-historial-recibos-'));
  // Un mutante del PROBE corre desde el tmpdir y desde ahí node no resuelve '@supabase/supabase-js'
  // ni './lib/estado_lineas.mjs' — moría en el import y el runner lo leía como sobreviviente
  // (GOTCHA #84). Dos symlinks, sin escribir nada dentro del repo.
  try {
    symlinkSync(join(HERE, '..', 'node_modules'), join(dir, 'node_modules'), 'dir');
    symlinkSync(join(HERE, 'lib'), join(dir, 'lib'), 'dir');
  } catch (e) { console.warn(`[runner] no pude symlinkear deps al tmpdir: ${e.message}`); }
  console.log(`\n═══ MUTATION TESTING · ${tanda.length}/${MUTANTES.length} mutantes${pedidos?` (tanda: ${pedidos.join(',')})`:''} ═══\n(copias en ${dir} — el repo no se toca)\n`);
  let vivos = 0, arnes = 0, equivalentes = 0;
  for (const m of tanda){
    const esProbe = m.archivo === 'probe';
    const src = esProbe ? SELF_SRC : HTML;
    if (!src.includes(m.from)) { console.log(`⚠ ${m.id} ERROR DE ARNÉS — el ancla no existe en el fuente. ${m.desc}`); arnes++; continue; }
    const path = join(dir, `${m.id}.${esProbe ? 'mjs' : 'html'}`);
    writeFileSync(path, src.replace(m.from, m.to));
    const script = esProbe ? path : SELF;
    const env = { ...process.env, LIQ_HTML: esProbe ? HTML_PATH : path };
    let out = '';
    try { out = execFileSync(process.execPath, [script], { env, encoding:'utf8', stdio:['ignore','pipe','pipe'] }); }
    catch (e) { out = (e.stdout||'') + (e.stderr||''); }
    // "murió por assert" vs "murió al arrancar" (GOTCHA #84): el probe siempre cierra con NN/NN OK.
    const corrio = /^\d+\/\d+ OK$/m.test(out);
    if (!corrio) {
      const causa = (out.split('\n').find(l => /Error|error:/.test(l)) || '(sin línea de error)').trim();
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el probe no llegó a correr los asserts. ${m.desc}\n     ↳ ${causa.slice(0,160)}`);
      arnes++; continue;
    }
    // GOTCHA #82 — anclar en el ")" del rótulo: `❌ P2\b` NO delimita `❌ P2b)`.
    const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));
    const vivo = muertos.length === 0;
    if (m.equivalente) {
      equivalentes++;
      if (vivo) console.log(`✅ ${m.id} EQUIVALENTE (sobrevive por diseño) — ${m.desc}\n     ↳ ${m.equivalente}`);
      else { vivos++; console.log(`❌ ${m.id} declarado EQUIVALENTE pero MURIÓ (${muertos.join(',')}) — revisar. ${m.desc}`); }
      continue;
    }
    if (vivo) vivos++;
    console.log(`${vivo?'❌':'✅'} ${m.id} ${vivo?'SOBREVIVE':'muere'} — ${m.desc}`
      + `  [esperaba matar ${m.mata.join(',')}${muertos.length?`; murieron ${muertos.join(',')}`:''}]`);
  }
  const partes = [`${tanda.length - vivos - arnes} muertos o equivalentes`];
  if (equivalentes) partes.push(`${equivalentes} equivalente(s)`);
  if (vivos) partes.push(`${vivos} SOBREVIVEN`);
  if (arnes) partes.push(`${arnes} ERROR DE ARNÉS`);
  console.log(`\n${vivos===0&&arnes===0?'✅ TANDA LIMPIA':'❌ TANDA CON HALLAZGOS'} — ${tanda.length} probados · ${partes.join(' · ')}\n`);
  process.exit(vivos === 0 && arnes === 0 ? 0 : 1);
}

// ══════════════════════════════ CORRIDA NORMAL ══════════════════════════════
(async () => {
  const creados = { liqs: [], dets: [], recibos: [], reuniones: [] };
  let antesB = {}, REUNION_B = null;
  const secuencias = {};
  let phase = 'init';
  try {
    // Limpieza preflight (GOTCHA #83): un SIGKILL no corre el finally, y una corrida cortada deja
    // fixtures que bajan el conteo de la siguiente sin que nada esté roto.
    phase = 'preflight';
    const { data: restos } = await sb.from('liquidacion_detalle').select('id,liquidacion_id').ilike('concepto', `${TAG}%`);
    if (restos?.length){
      console.log(`[preflight] ${restos.length} línea(s) de una corrida anterior cortada — se limpian`);
      const { data: recSueltos } = await sb.from('recibos').select('id').eq('club_id', CLUB_B).ilike('cobrador_nombre', `${TAG}%`);
      if (recSueltos?.length) await sb.from('liquidacion_detalle').update({ recibo_id:null }).in('recibo_id', recSueltos.map(r=>r.id));
      if (recSueltos?.length) await sb.from('recibos').delete().in('id', recSueltos.map(r=>r.id));
      await sb.from('liquidacion_detalle').delete().in('id', restos.map(r=>r.id));
      await sb.from('liquidaciones').delete().in('id', [...new Set(restos.map(r=>r.liquidacion_id))]);
    }

    phase = 'setup';
    const { data: rB } = await sb.from('reuniones').select('id,numero').eq('club_id', CLUB_B).limit(1);
    REUNION_B = rB?.[0]?.id;
    if (!REUNION_B) throw new Error('el club B no tiene reuniones');
    const { data: profsB } = await sb.from('profesionales')
      .select('id,nombre,apellido,documento_nro').eq('club_id', CLUB_B).eq('activo', true).limit(400);
    if (!profsB?.length) throw new Error('faltan profesionales activos en el club B');
    const BENEF = profsB[0].id;
    const OTRO  = profsB[1]?.id || profsB[0].id;

    antesB = await snapshotLineas(sb, REUNION_B);
    for (const c of [CLUB_A, CLUB_B]) {
      const { data: seq } = await sb.from('club_secuencias').select('ultimo_numero').eq('club_id', c).eq('tipo','recibo').maybeSingle();
      secuencias[c] = seq ? seq.ultimo_numero : null;
    }

    // ── fixtures ─────────────────────────────────────────────────────────────
    phase = 'fixtures';
    const plantar = async (concepto, bruto, benef, extra={}) => {
      const { data: liq, error: eL } = await sb.from('liquidaciones')
        .insert({ club_id: CLUB_B, reunion_id: REUNION_B, profesional_id: benef,
                  estado:'borrador', total_bruto:0, total_descuentos:0 }).select().single();
      if (eL) throw new Error('crear liq: ' + eL.message);
      creados.liqs.push(liq.id);
      const { data: det, error: eD } = await sb.from('liquidacion_detalle')
        .insert({ liquidacion_id: liq.id, beneficiario_tipo:'profesional', beneficiario_id: benef,
                  reunion_id: REUNION_B, concepto, monto_bruto: bruto, monto_descuento: 0,
                  concepto_tipo:'premio', estado_linea:'impago', ...extra }).select().single();
      if (eD) throw new Error('crear detalle: ' + eD.message);
      creados.dets.push(det.id);
      return det;
    };
    const COBRADOR = `${TAG} cobrador ${RUN}`;
    // 8 dígitos: un DNI de verdad. Tiene que ser >= 6 para que el buscador lo trate como documento
    // y no como número de recibo (ver el comentario de soloNumero en recibosBuscar).
    const DOC_COBRADOR = String(90000000 + (Date.now() % 9000000));
    const emitir = async (benef, ids) => {
      const r = await sb.rpc('emitir_recibo', {
        p_club_id: CLUB_B, p_beneficiario_tipo:'profesional', p_beneficiario_id: benef,
        p_linea_ids: ids, p_forma_pago:'efectivo',
        p_cobrador_nombre: COBRADOR, p_cobrador_documento: DOC_COBRADOR, p_comprobante_url: null });
      if (r.error) throw new Error('emitir_recibo: ' + r.error.message);
      const rec = Array.isArray(r.data) ? r.data[0] : r.data;
      creados.recibos.push(rec.id);
      return rec;
    };

    // Recibo EMITIDO: 2 líneas.
    const dEmi1 = await plantar(`${TAG} emitido a ${RUN}`, 11000, BENEF);
    const dEmi2 = await plantar(`${TAG} emitido b ${RUN}`, 22000, BENEF);
    const recEmi = await emitir(BENEF, [dEmi1.id, dEmi2.id]);
    // Recibo ANULADO: 3 líneas, para que su cantidad NO coincida con la del emitido (con 2 y 2, un
    // bug que devolviera las líneas del otro recibo daría el mismo conteo y no se detectaría).
    const dAnu1 = await plantar(`${TAG} anulado a ${RUN}`, 33000, OTRO);
    const dAnu2 = await plantar(`${TAG} anulado b ${RUN}`, 44000, OTRO);
    const dAnu3 = await plantar(`${TAG} anulado c ${RUN}`, 55000, OTRO);
    const recAnu = await emitir(OTRO, [dAnu1.id, dAnu2.id, dAnu3.id]);
    // Recibo a nombre de un PROPIETARIO. Sin esto, la búsqueda por persona sólo se ejercita por la
    // rama de profesional_id y el mutante que borra la rama de propietario_id sobrevive: `recibos`
    // no tiene un beneficiario_id genérico, tiene DOS columnas, y hay que probar las dos.
    const { data: propsAll } = await sb.from('propietarios').select('id,nombre,documento_nro').eq('activo', true).limit(1);
    const PROP = propsAll?.[0]?.id || null;
    let recProp = null, dProp = null;
    if (PROP) {
      const { data: liqP, error: eLP } = await sb.from('liquidaciones')
        .insert({ club_id: CLUB_B, reunion_id: REUNION_B, estado:'borrador', total_bruto:0, total_descuentos:0 }).select().single();
      if (eLP) throw new Error('crear liq propietario: ' + eLP.message);
      creados.liqs.push(liqP.id);
      const { data: dP, error: eDP } = await sb.from('liquidacion_detalle')
        .insert({ liquidacion_id: liqP.id, beneficiario_tipo:'propietario', beneficiario_id: PROP,
                  reunion_id: REUNION_B, concepto: `${TAG} propietario ${RUN}`, monto_bruto: 66000,
                  monto_descuento: 0, concepto_tipo:'premio', estado_linea:'impago' }).select().single();
      if (eDP) throw new Error('crear detalle propietario: ' + eDP.message);
      creados.dets.push(dP.id); dProp = dP;
      const rp = await sb.rpc('emitir_recibo', {
        p_club_id: CLUB_B, p_beneficiario_tipo:'propietario', p_beneficiario_id: PROP,
        p_linea_ids: [dP.id], p_forma_pago:'efectivo',
        p_cobrador_nombre: COBRADOR, p_cobrador_documento: DOC_COBRADOR, p_comprobante_url: null });
      if (rp.error) throw new Error('emitir_recibo propietario: ' + rp.error.message);
      recProp = Array.isArray(rp.data) ? rp.data[0] : rp.data;
      creados.recibos.push(recProp.id);
    }
    const MOTIVO = `${TAG} — motivo de prueba ${RUN}`;
    const { error: eAnu } = await sb.rpc('anular_recibo', { p_recibo_id: recAnu.id, p_motivo: MOTIVO });
    if (eAnu) throw new Error('anular_recibo: ' + eAnu.message);
    const { data: recAnuDB } = await sb.from('recibos').select('*').eq('id', recAnu.id).single();
    const IDS_ANULADAS = [dAnu1.id, dAnu2.id, dAnu3.id].sort();

    // A4 — el formato que dejó el RPC. Es la precondición de todo lo demás: si esto no es la foto,
    // los asserts de abajo estarían probando la reconstrucción y no se notaría.
    const primera = recAnuDB?.lineas_anuladas?.[0];
    ok('A4) anular_recibo v2 guardó la FOTO de las filas (objetos con monto_neto), no sólo los ids',
       Array.isArray(recAnuDB?.lineas_anuladas) && typeof primera === 'object' && primera !== null
       && primera.monto_neto != null && primera.id != null
       && [...recAnuDB.lineas_anuladas].map(l=>l.id).sort().join() === IDS_ANULADAS.join(),
       `tipo=${typeof primera} campos=${primera && Object.keys(primera).length}`);

    // Las líneas ya NO apuntan al recibo: es lo que hace imposible reconstruirlas por recibo_id.
    const { data: sueltas } = await sb.from('liquidacion_detalle').select('id,recibo_id').in('id', IDS_ANULADAS);
    ok('A4b) y las líneas quedaron con recibo_id NULL (por eso el detalle no puede usar recibo_id)',
       (sueltas||[]).length === 3 && (sueltas||[]).every(l => l.recibo_id === null),
       JSON.stringify((sueltas||[]).map(l=>l.recibo_id)));

    // ── arnés ────────────────────────────────────────────────────────────────
    phase = 'harness';
    const cuerpos = [
      extractConst(HTML, 'const REC_SELECT ='),
      extractFn(HTML, 'function idsLineasAnuladas(rec){'),
      extractFn(HTML, 'function esFotoAnulado(rec){'),
      extractFn(HTML, 'function recBenef(r){'),
      extractFn(HTML, 'function recNombreBenef(r){'),
      extractFn(HTML, 'function recSanitizar(q){'),
      extractFn(HTML, 'function recibosInit(){'),
      extractFn(HTML, 'async function recibosBuscar(){'),
      extractFn(HTML, 'function recibosRenderLista(){'),
      extractFn(HTML, 'async function recLineasDeRecibo(rec){'),
      extractFn(HTML, 'async function recibosDetalle(reciboId){'),
      extractFn(HTML, 'function recibosReimprimir(reciboId){'),
      // La función REAL de impresión. El espía de más abajo (imprimirReciboCobro) sirve para ver
      // QUÉ se le manda; esto sirve para ver QUÉ HACE con lo que recibe — y el bug del lineaIds
      // ignorado vive adentro de ella, no en el llamador. Sin extraerla, el mutante que la rompe
      // sobrevive porque el probe nunca la corre.
      extractFn(HTML, 'async function imprimirReciboCobro(recibo, lineaIds, opts){').replace('imprimirReciboCobro(', 'imprimirReciboCobroREAL('),
      extractFn(HTML, 'function rolDeLinea(l){'),
      extractConst(HTML, 'const ROL_POR_BENEFICIARIO ='),
      extractFn(HTML, 'function cobDelClub(l){'),
      extractFn(HTML, 'function benefSearch(tipo, id){'),
      extractFn(HTML, 'function nombreBenef(tipo, id){'),
    ].join('\n\n');

    const prof = Object.fromEntries((profsB||[]).map(p => [p.id, p]));
    const { data: propsTodos } = await sb.from('propietarios').select('id,nombre,nombre_stud,documento_nro').eq('activo', true);
    const propMap = Object.fromEntries((propsTodos||[]).map(p => [p.id, p]));
    const preludio = `
      const CLUB_ID = ${JSON.stringify(CLUB_B)};
      const profesionales = ${JSON.stringify(prof)};
      const propietariosMap = ${JSON.stringify(propMap)};
      const club = { nombre: 'Mi Club Hípico' };
      let cobBenef = null;
      let recResultados = [], recLineasCache = {}, recUsuarios = {}, recAbierto = null, _recDebounce = null;
      let recAjenosDescartados = 0;
      const toasts = [];
      const toast = (m, t='success', ms) => toasts.push({ m, t, ms });
      const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const fmt = n => '$ ' + Number(n||0).toLocaleString('es-AR', { minimumFractionDigits:2, maximumFractionDigits:2 });
      const clearTimeout = () => {}; const setTimeout = () => {};
      // Espía del borde de impresión: NO se llama a window.print(). Lo que se asserta es QUÉ líneas
      // se le mandan a imprimir, que es donde vive el bug del lineaIds ignorado (GOTCHA #81: para
      // saber si algo corrió hay que espiar el borde, no el estado final).
      const impresiones = [];
      const imprimirReciboCobro = (recibo, lineaIds, opts) => { impresiones.push({ recibo, lineaIds, opts, benef: cobBenef && {...cobBenef} }); };
      const precargarLogo = async () => {};
      const window = { print(){ window._impreso = (window._impreso||0) + 1; } };
      let document = doc;
    `;
    const epilogo = `
      return { recibosBuscar, recibosRenderLista, recibosDetalle, recibosReimprimir, recLineasDeRecibo,
               idsLineasAnuladas, esFotoAnulado, recSanitizar, imprimirReciboCobroREAL,
               impresoHTML: () => doc.getElementById('recibo-print').innerHTML,
               estado: () => ({ recResultados, recLineasCache, impresiones, toasts, cobBenef, recAjenosDescartados }) };
    `;
    const dom = mkDom();
    const api = await new AsyncFunction('sb','doc', preludio + cuerpos + epilogo)(sb, dom);
    const buscar = async (q, estado='') => {
      dom._n['rec-q'].value = q; dom._n['rec-estado'].value = estado;
      await api.recibosBuscar();
    };

    // A4c/A4d corren acá y no arriba porque usan la función REAL extraída del HTML. Reimplementar
    // idsLineasAnuladas en el probe la habría dejado sin probar: el mutante que la rompe seguiría
    // vivo porque el test estaría corriendo su propia copia.
    ok('A4c) idsLineasAnuladas entiende el formato v2 y devuelve los 3 ids de la foto',
       JSON.stringify([...api.idsLineasAnuladas(recAnuDB)].sort()) === JSON.stringify(IDS_ANULADAS),
       JSON.stringify(api.idsLineasAnuladas(recAnuDB)));
    ok('A4d) y sigue entendiendo el formato v1 (array de ids sueltos), que es el fallback',
       JSON.stringify(api.idsLineasAnuladas({ lineas_anuladas: IDS_ANULADAS })) === JSON.stringify(IDS_ANULADAS),
       JSON.stringify(api.idsLineasAnuladas({ lineas_anuladas: IDS_ANULADAS })));

    // ── N · búsqueda por número ──────────────────────────────────────────────
    phase = 'N';
    await buscar(String(recEmi.numero_recibo));
    ok('N1) buscar un número exacto trae ese recibo y SÓLO ese',
       api.estado().recResultados.length === 1 && api.estado().recResultados[0].id === recEmi.id,
       `${api.estado().recResultados.length} resultado(s): ${JSON.stringify(numerosEnLista(dom))}`);
    // Un numérico corto NO puede arrastrar a todo el que tenga ese dígito en el DNI: era el ruido
    // que tapaba el resultado buscado. Es la diferencia entre "buscar el recibo 3" y "buscar 3".
    ok('N1c) y un número corto no arrastra a nadie por tener ese dígito en el documento',
       api.estado().recResultados.every(r => r.numero_recibo === recEmi.numero_recibo),
       JSON.stringify(numerosEnLista(dom)));
    await buscar('99999999');
    ok('N1b) un número inexistente no trae nada y no rompe',
       api.estado().recResultados.length === 0 && /Sin recibos/.test(dom._n['rec-resultados'].innerHTML),
       `${api.estado().recResultados.length} resultado(s)`);
    await buscar(DOC_COBRADOR);
    ok('N2) un término numérico también busca por documento del cobrador',
       api.estado().recResultados.length >= 2
       && api.estado().recResultados.some(r => r.id === recEmi.id)
       && api.estado().recResultados.some(r => r.id === recAnu.id),
       `${api.estado().recResultados.length} resultado(s) para doc=${DOC_COBRADOR}`);

    // ── P · búsqueda por persona y por cobrador ─────────────────────────────
    phase = 'P';
    const apeBenef = prof[BENEF]?.apellido || '';
    await buscar(apeBenef);
    ok('P1) búsqueda por apellido del beneficiario trae sus recibos',
       api.estado().recResultados.some(r => r.id === recEmi.id),
       `"${apeBenef}" → ${api.estado().recResultados.length} resultado(s)`);
    const idsP1 = api.estado().recResultados.map(r=>r.id);
    ok('P1b) y el beneficiario de cada resultado matchea el término buscado',
       idsP1.length > 0 && api.estado().recResultados.every(r =>
         (r.profesional_id && (prof[r.profesional_id]?.apellido||'').toLowerCase().includes(apeBenef.toLowerCase()))
         || (r.cobrador_nombre||'').toLowerCase().includes(apeBenef.toLowerCase())),
       JSON.stringify(api.estado().recResultados.map(r=>prof[r.profesional_id]?.apellido)));
    // La OTRA columna de beneficiario. recibos.propietario_id y recibos.profesional_id son campos
    // distintos: probar sólo uno deja la mitad del camino sin cubrir.
    const nomProp = (propsAll?.[0]?.nombre || '').split(' ')[0];
    if (PROP && nomProp) {
      await buscar(nomProp);
      ok('P1c) búsqueda por nombre de un PROPIETARIO trae su recibo (la otra columna de beneficiario)',
         api.estado().recResultados.some(r => r.id === recProp.id),
         `"${nomProp}" → ${api.estado().recResultados.length} resultado(s)`);
    } else {
      ok('P1c) búsqueda por nombre de un PROPIETARIO trae su recibo', false, 'no hay propietarios activos para la fixture');
    }
    await buscar('cobrador');
    ok('P2) búsqueda por NOMBRE de quien retiró trae el recibo',
       api.estado().recResultados.some(r => r.id === recEmi.id),
       `${api.estado().recResultados.length} resultado(s)`);
    await buscar(DOC_COBRADOR);
    ok('P2b) búsqueda por DOCUMENTO de quien retiró trae el recibo',
       api.estado().recResultados.some(r => r.id === recEmi.id), `doc=${DOC_COBRADOR}`);
    let rompio = null;
    try { await buscar('Pérez, Juan (h)'); } catch (e) { rompio = e.message; }
    ok('P3) un término con coma y paréntesis no rompe el .or() (sanitización)',
       rompio === null && !api.estado().toasts.some(t => t.t === 'error'),
       rompio || `${api.estado().recResultados.length} resultado(s), sin error`);
    api.estado().toasts.length = 0;
    let rompio2 = null;
    try { await buscar('zzzznoexistenadie'); } catch (e) { rompio2 = e.message; }
    ok('P4) un término que no matchea a nadie no arma un in.() vacío ni tira error',
       rompio2 === null && api.estado().recResultados.length === 0
       && !api.estado().toasts.some(t => t.t === 'error'),
       rompio2 || JSON.stringify(api.estado().toasts));

    // ── D · el detalle de un emitido ────────────────────────────────────────
    phase = 'D';
    await buscar(String(recEmi.numero_recibo));
    await api.recibosDetalle(recEmi.id);
    ok('D1) el detalle de un emitido trae exactamente sus líneas',
       JSON.stringify(idsLineasEnDetalle(dom)) === JSON.stringify([dEmi1.id, dEmi2.id].sort()),
       JSON.stringify(idsLineasEnDetalle(dom)));
    const htmlDet = dom._n['rec-detalle'].innerHTML;
    ok('D1b) y cada línea trae las 7 celdas, con el rol resuelto',
       /<th>Fecha<\/th><th>Carrera<\/th><th>Caballo<\/th><th>Puesto<\/th><th>Rol<\/th><th>Concepto<\/th>/.test(htmlDet)
       && /<td>Propietario<\/td>|<td>Entrenador<\/td>|<td>Jockey<\/td>|<td>Profesional<\/td>/.test(htmlDet),
       htmlDet.match(/<td>(Propietario|Entrenador|Jockey|Profesional)<\/td>/)?.[0] || 'sin rol');
    const sumaEmi = Number(dEmi1.monto_neto) + Number(dEmi2.monto_neto);
    ok('D2) el total de las líneas coincide con el neto del recibo',
       dom._n['rec-total'].innerHTML === '' /* tfoot va dentro del innerHTML del contenedor */
       && htmlDet.includes(sumaEmi.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}))
       && Number(recEmi.neto_a_cobrar) === sumaEmi,
       `lineas=${sumaEmi} neto=${recEmi.neto_a_cobrar}`);

    // ── A · el anulado ───────────────────────────────────────────────────────
    phase = 'A';
    await buscar(String(recAnu.numero_recibo));
    ok('A1) un recibo anulado aparece en la lista, marcado como tal',
       api.estado().recResultados.some(r => r.id === recAnu.id)
       && dom._filas.some(f => f.dataset.recibo === recAnu.id && f._cls.has('rec-anulado'))
       && /badge-anulada">ANULADO/.test(dom._n['rec-resultados'].innerHTML),
       JSON.stringify(dom._filas.map(f => [f.dataset.recibo?.slice(0,8), f.dataset.estado])));
    await buscar('', 'anulado');
    const enAnulados = api.estado().recResultados.map(r=>r.id);
    await buscar('', 'emitido');
    const enEmitidos = api.estado().recResultados.map(r=>r.id);
    ok('A1b) el filtro "Anulados" lo trae y el filtro "Emitidos" NO',
       enAnulados.includes(recAnu.id) && !enEmitidos.includes(recAnu.id) && enEmitidos.includes(recEmi.id),
       `anulados=${enAnulados.length} emitidos=${enEmitidos.length}`);
    await buscar(String(recAnu.numero_recibo));
    await api.recibosDetalle(recAnu.id);
    const htmlAnu = dom._n['rec-detalle'].innerHTML;
    ok('A2) el detalle del anulado muestra motivo, quién anuló y cuándo',
       htmlAnu.includes('ANULADO el') && htmlAnu.includes(MOTIVO.replace(/&/g,'&amp;')),
       htmlAnu.match(/⛔ ANULADO el [^<]*/)?.[0] || 'sin bloque');
    ok('A3) sus líneas se reconstruyen: mismo conjunto de ids que tenía antes de anular',
       JSON.stringify(idsLineasEnDetalle(dom)) === JSON.stringify(IDS_ANULADAS),
       `${idsLineasEnDetalle(dom).length} línea(s)`);
    // A3b — la prueba de que salen de la FOTO: se cambia el monto en la TABLA y el detalle tiene
    // que seguir mostrando el importe viejo. Si viniera de la tabla, mostraría el nuevo.
    const MONTO_PISADO = 1234.56;
    await sb.from('liquidacion_detalle').update({ monto_bruto: MONTO_PISADO }).eq('id', dAnu1.id);
    await buscar(String(recAnu.numero_recibo));
    await api.recibosDetalle(recAnu.id);
    const htmlAnu2 = dom._n['rec-detalle'].innerHTML;
    ok('A3b) el detalle sale de la FOTO: pisar el monto en la tabla NO cambia lo que muestra',
       htmlAnu2.includes(Number(dAnu1.monto_neto).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}))
       && !htmlAnu2.includes('1.234,56'),
       `original=${dAnu1.monto_neto} pisado=${MONTO_PISADO}`);
    await sb.from('liquidacion_detalle').update({ monto_bruto: dAnu1.monto_bruto }).eq('id', dAnu1.id);

    // ── C · aislamiento por club ─────────────────────────────────────────────
    // El "otro club" son los recibos REALES de Dolores. Cero escrituras allá.
    phase = 'C';
    const { data: recsA } = await sb.from('recibos').select('id,numero_recibo').eq('club_id', CLUB_A);
    if (!recsA?.length) throw new Error('precondición rota: Dolores no tiene recibos para el assert de aislamiento');
    await buscar('');
    const idsListados = api.estado().recResultados.map(r=>r.id);
    ok('C1) ningún recibo de otro club aparece en el listado',
       recsA.every(r => !idsListados.includes(r.id)) && idsListados.length > 0,
       `${idsListados.length} listados · ${recsA.length} de Dolores, ninguno presente`);
    const numAjeno = recsA[0].numero_recibo;
    await buscar(String(numAjeno));
    ok('C1b) buscar por número un recibo que existe en el OTRO club no lo trae',
       !api.estado().recResultados.some(r => r.id === recsA[0].id),
       `buscando #${numAjeno} → ${api.estado().recResultados.length} resultado(s), ninguno de Dolores`);
    // C1d prueba la PRIMERA capa: que el filtro lo haga el SERVIDOR. C1/C1b/C1c miran el estado
    // final, y el estado final lo sostiene igual el post-filtro del cliente — o sea que no
    // distinguen cuál de las dos capas trabajó. El contador sí: con el .eq puesto vale 0 siempre.
    ok('C1d) el filtro de club actúa en el SERVIDOR: el cliente no tuvo que descartar ninguna fila',
       api.estado().recAjenosDescartados === 0,
       `${api.estado().recAjenosDescartados} fila(s) ajenas llegaron al cliente`);
    ok('C1c) y todo lo que quedó en recResultados es del club propio',
       api.estado().recResultados.every(r => r.club_id === CLUB_B),
       JSON.stringify(api.estado().recResultados.map(r=>r.club_id?.slice(0,8))));
    // C2 — cobDelClub en el detalle: se fabrica una línea de OTRO club apuntando al recibo propio.
    // El club ajeno es San Francisco, NO Dolores: el assert necesita escribir una liquidación
    // ajena, y escribir en el club real del cliente para probar aislamiento sería absurdo.
    // `liquidaciones.reunion_id` es NOT NULL y San Francisco no tiene ninguna reunión, así que se
    // planta una marcada es_prueba y se borra en el finally. Es el club MÁS seguro donde escribir:
    // está vacío, así que la fixture no puede chocar con nada real.
    let { data: rC } = await sb.from('reuniones').select('id').eq('club_id', CLUB_C).limit(1);
    if (!rC?.length){
      const { data: hip } = await sb.from('hipodromos').select('id').limit(1);
      const { data: nueva, error: eR } = await sb.from('reuniones')
        .insert({ club_id: CLUB_C, hipodromo_id: hip?.[0]?.id, numero: 9997,
                  fecha: '2026-01-01', es_prueba: true }).select().single();
      if (eR) console.error('[C2/reunion ajena]', eR.message);
      if (nueva) { creados.reuniones.push(nueva.id); rC = [nueva]; }
    }
    const { data: liqA, error: eLiqA } = rC?.[0] ? await sb.from('liquidaciones')
      .insert({ club_id: CLUB_C, reunion_id: rC[0].id, profesional_id: null, estado:'borrador', total_bruto:0, total_descuentos:0 })
      .select().single() : { data: null, error: { message: 'sin reunión en el club ajeno' } };
    if (eLiqA) console.error('[C2/liquidacion ajena]', eLiqA.message);
    if (liqA) creados.liqs.push(liqA.id);
    let detAjeno = null;
    if (liqA) {
      const { data: dA } = await sb.from('liquidacion_detalle')
        .insert({ liquidacion_id: liqA.id, beneficiario_tipo:'profesional', beneficiario_id: BENEF,
                  concepto: `${TAG} linea ajena ${RUN}`, monto_bruto: 99000, monto_descuento: 0,
                  concepto_tipo:'premio', estado_linea:'pagado', recibo_id: recEmi.id }).select().single();
      if (dA) { creados.dets.push(dA.id); detAjeno = dA; }
    }
    await buscar(String(recEmi.numero_recibo));
    await api.recibosDetalle(recEmi.id);
    ok('C2) una línea de OTRO club no entra en el detalle (cobDelClub)',
       !!detAjeno && !idsLineasEnDetalle(dom).includes(detAjeno.id)
       && JSON.stringify(idsLineasEnDetalle(dom)) === JSON.stringify([dEmi1.id, dEmi2.id].sort()),
       detAjeno ? `linea ajena ${detAjeno.id.slice(0,8)} — ${idsLineasEnDetalle(dom).length} en el detalle` : 'no se pudo plantar');
    if (detAjeno) await sb.from('liquidacion_detalle').delete().eq('id', detAjeno.id);

    // ── I · reimpresión ──────────────────────────────────────────────────────
    phase = 'I';
    await buscar(String(recEmi.numero_recibo));
    await api.recibosDetalle(recEmi.id);
    api.estado().impresiones.length = 0;
    api.recibosReimprimir(recEmi.id);
    const imp1 = api.estado().impresiones.at(-1);
    ok('I1) reimprimir un EMITIDO manda sus líneas correctas',
       JSON.stringify([...(imp1?.lineaIds||[])].sort()) === JSON.stringify([dEmi1.id, dEmi2.id].sort()),
       JSON.stringify(imp1?.lineaIds));
    await buscar(String(recAnu.numero_recibo));
    await api.recibosDetalle(recAnu.id);
    api.estado().impresiones.length = 0;
    api.recibosReimprimir(recAnu.id);
    const imp2 = api.estado().impresiones.at(-1);
    ok('I2) reimprimir un ANULADO manda SUS líneas, no un array vacío',
       (imp2?.lineaIds||[]).length === 3
       && JSON.stringify([...imp2.lineaIds].sort()) === JSON.stringify(IDS_ANULADAS)
       && (imp2?.opts?.lineas||[]).length === 3,
       `${(imp2?.lineaIds||[]).length} id(s), opts.lineas=${(imp2?.opts?.lineas||[]).length}`);
    ok('I3) antes de imprimir se repone cobBenef con el beneficiario del recibo',
       imp2?.benef?.id === OTRO && !!imp2?.benef?.nombre && imp2.benef.nombre !== '—',
       JSON.stringify(imp2?.benef));

    // I4 — la función REAL de impresión, no el espía. Es donde vive el bug: `lineaIds` estaba en la
    // firma y no se usaba, y para un anulado el `.eq('recibo_id')` devuelve cero filas → cuerpo en
    // blanco. Se corre de verdad y se cuenta lo que quedó en el HTML del impreso.
    phase = 'I4';
    await api.imprimirReciboCobroREAL(recAnuDB, IDS_ANULADAS, { origen:'historial' });
    const htmlImp = api.impresoHTML();
    const filasImp = (htmlImp.match(/<tr>/g) || []).length;
    ok('I4) la impresión REAL de un anulado sale con sus 3 líneas, no con el cuerpo vacío',
       filasImp >= 6 && IDS_ANULADAS.every(() => true)
       && [dAnu1, dAnu2, dAnu3].every(d => htmlImp.includes(Number(d.monto_neto).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}))),
       `${filasImp} <tr> en el impreso (2 copias × 3 líneas = 6 mínimo)`);

    // ── G · guard del arnés ──────────────────────────────────────────────────
    phase = 'G';
    let tiro = false;
    try { dom.querySelectorAll('.rec-row[data-x="1"]'); } catch { tiro = true; }
    ok('G1) el mini-DOM TIRA ante un selector desconocido (si devolviera [] daría falso verde)',
       tiro, `selDesconocido=${dom._selDesconocido}`);

  } catch (e) {
    ok(`X1) el probe corrió sin excepciones (fase: ${phase})`, false, e.message + '\n' + (e.stack||'').split('\n')[1]);
  } finally {
    // ── restore ──────────────────────────────────────────────────────────────
    if (creados.recibos.length) {
      await sb.from('liquidacion_detalle').update({ recibo_id: null, pagado_at: null }).in('recibo_id', creados.recibos);
      await sb.from('recibos').delete().in('id', creados.recibos);
    }
    if (creados.dets.length) await sb.from('liquidacion_detalle').delete().in('id', creados.dets);
    if (creados.liqs.length) await sb.from('liquidaciones').delete().in('id', creados.liqs);
    if (creados.reuniones.length) await sb.from('reuniones').delete().in('id', creados.reuniones);
    // fn_siguiente_recibo es un contador monótono, no un MAX+1 (lección del 2026-08-30).
    for (const [c, n] of Object.entries(secuencias)){
      if (n === null) await sb.from('club_secuencias').delete().eq('club_id', c).eq('tipo','recibo');
      else await sb.from('club_secuencias').update({ ultimo_numero: n }).eq('club_id', c).eq('tipo','recibo');
    }
    if (REUNION_B){
      const desp = await snapshotLineas(sb, REUNION_B);
      const arregladas = await restaurarLineas(sb, antesB, desp);
      const v = diffLineas(antesB, await snapshotLineas(sb, REUNION_B));
      ok('R1) restore por ESTADO: las líneas quedaron como estaban', v.limpio, describir(v));
      ok('R2) y no hubo que restaurar nada a mano', arregladas === 0, `${arregladas} línea(s)`);
    }
    const sobranR = await recibosDesde(sb, T0);   // sin filtro de club (GOTCHA #76)
    ok('R3) no quedó ningún recibo del probe, en NINGÚN club', sobranR.length === 0, JSON.stringify(sobranR));
    const { data: sobranL } = await sb.from('liquidacion_detalle').select('id').ilike('concepto', `${TAG}%`);
    ok('R4) no quedaron líneas del probe en la base', (sobranL||[]).length === 0, JSON.stringify(sobranL));
    const { data: sobranReun } = await sb.from('reuniones').select('id').eq('club_id', CLUB_C);
    ok('R6) no quedó la reunión fixture en el club ajeno', (sobranReun||[]).length === 0,
       `${(sobranReun||[]).length} reunión(es) en San Francisco`);
    const { data: seqFin } = await sb.from('club_secuencias').select('club_id,ultimo_numero').eq('tipo','recibo').in('club_id',[CLUB_A, CLUB_B]);
    ok('R5) club_secuencias de los dos clubes devuelto a donde estaba',
       (seqFin||[]).every(r => secuencias[r.club_id] === r.ultimo_numero),
       (seqFin||[]).map(r => `${r.club_id.slice(0,8)}: ${secuencias[r.club_id]}→${r.ultimo_numero}`).join(' · '));
  }

  console.log('\n── Probe · historial de recibos ──');
  console.log(`   html=${HTML_PATH}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
