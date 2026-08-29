/**
 * Probe — ISSUE-055: las reuniones sandbox (reuniones.es_prueba) salen del circuito de cobro.
 *
 * Corre el CÓDIGO REAL extraído de liquidaciones.html (cobrosBuscar / cobrosDetalle /
 * cobVisible / cobCargarReunPrueba), no una copia. Sin browser: DOM stubeado, Supabase real
 * con SUPABASE_SECRET_KEY. Patrón snapshot → run → assert → restore del tests/README.md.
 *
 * Lo que cubre, que es exactamente lo que justifica el flag:
 *   A) la 9999 (es_prueba=true) NO aparece en el buscador de Pagos sin reunión elegida
 *   B) una reunión normal (publicada, es_prueba=false) SÍ aparece
 *   C) una reunión CANCELADA con líneas impagas SÍ aparece  ← el caso de la suspendida de
 *      verdad: cancelada es un evento real y puede tener plata legítima para pagar
 *   D) un beneficiario mixto (plata real + plata de sandbox) muestra SÓLO la real, y su
 *      detalle tampoco trae las líneas del sandbox tildadas
 *   E) el sandbox sigue usable: eligiendo la 9999 a mano en el selector, sus líneas vuelven
 *
 * Requiere migrations/reuniones_es_prueba.sql APLICADA. Si la columna no está, aborta con un
 * mensaje explícito en vez de dar falsos verdes.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_reunion_es_prueba.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) throw new Error('Falta SUPABASE_SECRET_KEY (source .env antes de correr).');
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const SANDBOX = 'a0000000-0000-0000-0000-000000009999';

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(HERE, '..', 'liquidaciones.html'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

// ── extracción por firma, con balance de llaves ─────────────────────────────
function extractFn(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error(`no pude cerrar: ${firma}`);
}

// ── DOM stub: sólo los ids que toca el tab Pagos ────────────────────────────
function mkDocument(campos) {
  const nodos = {};
  const get = id => (nodos[id] ||= { value: campos[id] ?? '', innerHTML: '', textContent: '' });
  Object.keys(campos).forEach(get);
  ['cob-detalle', 'cob-beneficiarios', 'cob-ret-wrap', 'cob-total', 'cob-apoderados'].forEach(get);
  return { getElementById: id => get(id) || null, _n: nodos,
           querySelectorAll: () => [] };
}

(async () => {
  let creados = [];   // {liq, dets:[]}
  let phase = 'init';
  try {
    // ── 0) pre-requisito: la columna existe y marca exactamente la 9999 ─────
    phase = 'pre';
    const { data: marcadas, error: eCol } = await sb.from('reuniones')
      .select('id,numero,estado,es_prueba').eq('es_prueba', true);
    if (eCol) throw new Error(
      'la columna reuniones.es_prueba no existe o no es legible — aplicá ' +
      'migrations/reuniones_es_prueba.sql antes de correr este probe. Detalle: ' + eCol.message);
    ok('0a) exactamente 1 reunión marcada es_prueba en toda la base',
       (marcadas || []).length === 1, JSON.stringify(marcadas));
    ok('0b) la marcada es la 9999 del club de Dolores',
       marcadas?.[0]?.id === SANDBOX && marcadas?.[0]?.numero === 9999);

    // el filtro NO puede estar hecho por estado
    ok('0c) el circuito de cobro no filtra por estado=\'cancelada\'',
       !/estado[^\n]{0,40}cancelada/.test(HTML.slice(HTML.indexOf('async function cobrosBuscar'),
                                                     HTML.indexOf('async function cobrosDetalle'))));

    // ── 1) reuniones reales donde plantar fixtures ──────────────────────────
    phase = 'reuniones';
    const { data: reuns } = await sb.from('reuniones')
      .select('id,numero,fecha,estado,es_prueba').eq('club_id', CLUB_ID).eq('es_prueba', false);
    const rNormal = (reuns || []).find(r => r.estado === 'publicada');
    const rCancel = (reuns || []).find(r => r.estado === 'cancelada');
    if (!rNormal) throw new Error('no hay reunión publicada no-prueba para el fixture B');
    if (!rCancel) throw new Error('no hay reunión cancelada no-prueba para el fixture C');
    console.log(`[fixtures] normal = R${rNormal.numero} (${rNormal.estado}) · cancelada = R${rCancel.numero}`);

    // ── 2) beneficiarios ────────────────────────────────────────────────────
    phase = 'benef';
    const { data: l9 } = await sb.from('liquidacion_detalle')
      .select('beneficiario_tipo,beneficiario_id,monto_neto')
      .eq('reunion_id', SANDBOX).eq('estado_linea', 'impago')
      .neq('beneficiario_tipo', 'club').is('recibo_id', null);
    const porBenef = {};
    for (const l of (l9 || [])) {
      const k = l.beneficiario_id;
      porBenef[k] = (porBenef[k] || 0) + (parseFloat(l.monto_neto) || 0);
    }
    const ids9999 = Object.keys(porBenef);
    if (ids9999.length < 2) throw new Error('la 9999 necesita ≥2 beneficiarios con líneas impagas');
    const BENEF_MIX  = ids9999[0];   // tendrá plata real + plata de sandbox
    const BENEF_SOLO = ids9999[1];   // sólo sandbox → nunca debe aparecer
    const { data: profs } = await sb.from('profesionales')
      .select('id,nombre,apellido,documento_nro').eq('club_id', CLUB_ID).eq('activo', true).limit(400);
    const BENEF_CANC = (profs || []).find(p => !ids9999.includes(p.id))?.id;
    if (!BENEF_CANC) throw new Error('no encontré un profesional ajeno a la 9999 para el fixture C');
    const profMap = Object.fromEntries((profs || []).map(p => [p.id, p]));

    // ── 3) fixtures ─────────────────────────────────────────────────────────
    phase = 'insert';
    const MONTO_REAL = 111111;   // reconocible en los asserts
    const MONTO_CANC = 222222;
    const plantar = async (reunionId, benefId, concepto, bruto) => {
      const { data: liq, error: eL } = await sb.from('liquidaciones')
        .insert({ club_id: CLUB_ID, reunion_id: reunionId, profesional_id: benefId,
                  estado: 'borrador', total_bruto: 0, total_descuentos: 0 }).select().single();
      if (eL) throw new Error('crear liq: ' + eL.message);
      const { data: det, error: eD } = await sb.from('liquidacion_detalle')
        .insert({ liquidacion_id: liq.id, beneficiario_tipo: 'profesional', beneficiario_id: benefId,
                  reunion_id: reunionId, concepto, monto_bruto: bruto, monto_descuento: 0,
                  concepto_tipo: 'premio', estado_linea: 'impago' }).select().single();
      if (eD) throw new Error('crear detalle: ' + eD.message);
      creados.push({ liq: liq.id, dets: [det.id] });
      return det;
    };
    await plantar(rNormal.id, BENEF_MIX,  'TEST ISSUE-055 reunión normal',    MONTO_REAL);
    await plantar(rCancel.id, BENEF_CANC, 'TEST ISSUE-055 reunión cancelada', MONTO_CANC);

    // ── 4) sandbox con el código REAL ───────────────────────────────────────
    phase = 'sandbox';
    const src = [
      HTML.slice(HTML.indexOf('const ROL_POR_BENEFICIARIO'),
                 HTML.indexOf('\n', HTML.indexOf('const ROL_POR_BENEFICIARIO'))),
      extractFn(HTML, 'function rolDeLinea(l)'),
      extractFn(HTML, 'function nombreBenef(tipo, id)'),
      extractFn(HTML, 'function benefSearch(tipo, id)'),
      extractFn(HTML, 'function etiquetaRoles(g)'),
      extractFn(HTML, 'function etiquetaCarreras(g)'),
      extractFn(HTML, 'async function cobCargarReunPrueba()'),
      extractFn(HTML, 'function cobVisible(l, rid)'),
      extractFn(HTML, 'async function cobrosBuscar()'),
      extractFn(HTML, 'async function cobrosDetalle(tipo, id)'),
    ].join('\n\n');
    ok('4a) el archivo trae cobVisible y cobCargarReunPrueba (el filtro está conectado)',
       src.includes('cobReunPrueba.has') && src.includes(".eq('es_prueba', true)"));
    ok('4b) cobrosDetalle también aplica el filtro (no sólo el listado)',
       /cobLineas = \(pag\|\|\[\]\)\.filter\(l => cobVisible\(l, ridSel\)\)/.test(HTML));

    const correr = async (ridSel, q = '') => {
      const document = mkDocument({ 'cob-q': q, 'cob-reunion': ridSel, 'cob-carrera': '' });
      const api = await new AsyncFunction(
        'sb', 'CLUB_ID', 'document', 'toast', 'fmt', 'propietariosMap', 'profesionales',
        `let cobCaballerizas = [], cobInscCarrera = {}, cobNroCarrera = {}, cobMapsScope = null;
         let cobReunPrueba = null, cobBenef = null, cobApoderados = [], cobLineas = [];
         ${src}
         return { cobrosBuscar, cobrosDetalle, get lineas(){ return cobLineas; } };`
      )(sb, CLUB_ID, document, () => {}, n => String(n), {}, profMap);
      return { api, document };
    };

    // ── A/B/C/D — sin reunión elegida ───────────────────────────────────────
    phase = 'sin-reunion';
    const { api: apiTodas, document: docTodas } = await correr('');
    await apiTodas.cobrosBuscar();
    const htmlTodas = docTodas._n['cob-beneficiarios'].innerHTML;

    ok('A) el beneficiario que sólo tiene plata en la 9999 NO aparece',
       !htmlTodas.includes(BENEF_SOLO), BENEF_SOLO);
    ok('B) el beneficiario de la reunión NORMAL aparece',
       htmlTodas.includes(BENEF_MIX), BENEF_MIX);
    ok('C) el beneficiario de la reunión CANCELADA aparece (plata legítima de un evento suspendido)',
       htmlTodas.includes(BENEF_CANC), BENEF_CANC);
    ok('A2) ninguno de los beneficiarios de la 9999 entra por la puerta del sandbox',
       ids9999.filter(id => id !== BENEF_MIX).every(id => !htmlTodas.includes(id)));

    // el total del mixto es SÓLO la plata real, no la del sandbox
    const bloqueMix = htmlTodas.split('<div class="liq-card">')
      .find(b => b.includes(BENEF_MIX)) || '';
    ok('D) el total del beneficiario mixto es sólo la plata real (no suma la del sandbox)',
       bloqueMix.includes(String(MONTO_REAL)) && !bloqueMix.includes(String(Math.round(porBenef[BENEF_MIX]))),
       `real=${MONTO_REAL} sandbox=${porBenef[BENEF_MIX]}`);
    ok('D2) la tarjeta del mixto declara 1 línea pagable, no las del sandbox',
       /1 línea\(s\) pagable\(s\)/.test(bloqueMix), bloqueMix.slice(0, 260));

    // detalle del mixto sin reunión elegida: nada de sandbox
    await apiTodas.cobrosDetalle('profesional', BENEF_MIX);
    const detIds = apiTodas.lineas.map(l => l.reunion_id);
    ok('D3) el detalle del mixto no trae ninguna línea de la 9999 tildada',
       detIds.length > 0 && !detIds.includes(SANDBOX), JSON.stringify([...new Set(detIds)]));

    // ── E — eligiendo la 9999 a mano, el sandbox vuelve ─────────────────────
    phase = 'sandbox-explicito';
    const { api: api9999, document: doc9999 } = await correr(SANDBOX);
    await api9999.cobrosBuscar();
    const html9999 = doc9999._n['cob-beneficiarios'].innerHTML;
    ok('E) eligiendo la 9999 a mano, sus beneficiarios vuelven a aparecer',
       html9999.includes(BENEF_SOLO), BENEF_SOLO);
    await api9999.cobrosDetalle('profesional', BENEF_MIX);
    ok('E2) y el detalle vuelve a traer las líneas del sandbox',
       api9999.lineas.some(l => l.reunion_id === SANDBOX));
    ok('E3) el selector rotula la reunión de prueba (⚗ PRUEBA)', HTML.includes("' ⚗ PRUEBA'"));

  } catch (e) {
    ok(`EXCEPCIÓN en fase ${phase}`, false, e.message);
    console.error(e);
  } finally {
    // ── restore ─────────────────────────────────────────────────────────────
    for (const c of creados) {
      for (const d of c.dets) await sb.from('liquidacion_detalle').delete().eq('id', d);
      await sb.from('liquidacion_detalle').delete().eq('liquidacion_id', c.liq);
      await sb.from('liquidaciones').delete().eq('id', c.liq);
    }
    const { data: sobra } = await sb.from('liquidacion_detalle')
      .select('id').ilike('concepto', 'TEST ISSUE-055%');
    ok('R) restore: no quedaron líneas TEST ISSUE-055 en la base', (sobra || []).length === 0,
       JSON.stringify(sobra));
  }

  console.log('\n── Probe ISSUE-055 · reuniones.es_prueba fuera del circuito de cobro ──');
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
