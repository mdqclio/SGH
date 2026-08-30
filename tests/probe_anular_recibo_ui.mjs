/**
 * ISSUE-056 · UI de anulación (opción A) — probe de código real, sin browser.
 *
 * Prueba la UI que vive en liquidaciones.html: el panel del recibo recién emitido, el motivo
 * obligatorio, el texto de la confirmación, la ventana de 5 días y el refresco posterior.
 *
 * El patrón es el de siempre: se EXTRAE la función del propio HTML por ancla (con balance de
 * llaves), se la corre con new AsyncFunction inyectando dependencias reales (cliente Supabase con
 * SUPABASE_SECRET_KEY) y stubs de DOM, y se assertea contra la base. Nada se reimplementa acá: si
 * liquidaciones.html cambia, este probe corre el archivo cambiado.
 *
 * El RPC anular_recibo NO se prueba acá — eso es tests/probe_anular_recibo.mjs (29/29). Este
 * archivo prueba la capa de UI, que es otra cosa: el RPC puede estar perfecto y el botón no
 * llamarlo, o llamarlo sin motivo, o no refrescar la pantalla después.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_anular_recibo_ui.mjs              # corrida normal
 *   node tests/probe_anular_recibo_ui.mjs --mutantes   # mutation testing de los guards de UI
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

const CLUB_B = 'a6da7e40-1515-45dc-8933-4eef33ce937a'; // Mi Club Hípico — donde se emite
const CLUB_A = '0649e9c5-9e87-4aad-842f-101458e6b33c'; // Dolores — sólo para restaurar su secuencia
const TAG = 'TEST ISSUE-056 UI';
const M_A = 351111, M_B = 352222, M_RETEN = 353333;

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken:false, persistSession:false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = process.env.LIQ_HTML || join(HERE, '..', 'liquidaciones.html');
const HTML = readFileSync(HTML_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const results = [];
const ok = (t, c, n='') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
const RUN = Date.now().toString(36);
const T0 = new Date(Date.now() - 5000).toISOString();

function extractFn(src, firma){
  const i = src.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++){
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error(`no pude cerrar: ${firma}`);
}

function mkDocument(campos){
  const nodos = {};
  const get = id => (nodos[id] ||= {
    value: campos[id] ?? '', innerHTML: '', textContent: '', disabled: false,
    style: {}, classList: { add(){}, remove(){}, toggle(){} },
    scrollIntoView(){}, focus(){}, click(){},
  });
  Object.keys(campos).forEach(get);
  ['cob-detalle','cob-beneficiarios','cob-total','cob-recibo-emitido','anul-resumen','anul-motivo']
    .forEach(get);
  return { getElementById: id => get(id), _n: nodos, querySelectorAll: () => [] };
}

// ═══════════════════════════════ MUTATION TESTING ═══════════════════════════════
// Cada mutante neutraliza UN guard de la UI sobre una COPIA del HTML en un tmpdir — el archivo del
// repo no se toca nunca — y se re-corre este mismo probe con LIQ_HTML apuntando a la copia. Un
// mutante que no mata ningún assert significa que ese assert no prueba lo que dice probar.
const MUTANTES = [
  { id:'M1', desc:'sacar la validación de motivo vacío del handler', mata:['U2'],
    from:`if (!motivo) { toast('El motivo de la anulación es obligatorio','error'); return; }`,
    to:  `if (false) { toast('El motivo de la anulación es obligatorio','error'); return; }` },
  { id:'M2', desc:'puedeAnularUI devuelve true siempre', mata:['U4','U4d'],
    from:`  if (rol === 'super_admin') return true;\n  if (!recibo || !recibo.emitido_at) return false;`,
    to:  `  return true;\n  if (!recibo || !recibo.emitido_at) return false;` },
  { id:'M3', desc:'puedeAnularUI ignora super_admin', mata:['U4b'],
    from:`  if (rol === 'super_admin') return true;\n  if (!recibo || !recibo.emitido_at) return false;`,
    to:  `  if (!recibo || !recibo.emitido_at) return false;` },
  { id:'M4', desc:'el texto de confirmación pierde el número de recibo', mata:['U3'],
    from:'`¿Anular el recibo #${recibo.numero_recibo} de ${fmt(recibo.neto_a_cobrar)} a ${benef?.nombre || \'—\'}?\\n\\n`',
    to:  '`¿Anular el recibo de ${fmt(recibo.neto_a_cobrar)} a ${benef?.nombre || \'—\'}?\\n\\n`' },
  { id:'M5', desc:'el texto de confirmación pierde el importe', mata:['U3b'],
    from:'`¿Anular el recibo #${recibo.numero_recibo} de ${fmt(recibo.neto_a_cobrar)} a ${benef?.nombre || \'—\'}?\\n\\n`',
    to:  '`¿Anular el recibo #${recibo.numero_recibo} a ${benef?.nombre || \'—\'}?\\n\\n`' },
  { id:'M6', desc:'el handler no refresca el detalle después de anular', mata:['U5'],
    from:`  if (benef?.tipo && benef?.id) await cobrosDetalle(benef.tipo, benef.id);`,
    to:  `  if (false) await cobrosDetalle(benef.tipo, benef.id);` },
  { id:'M7', desc:'no se cuentan ni se avisan las líneas que vuelven a retenidas', mata:['U6'],
    from:`      .select('id').in('id', ids).eq('estado_linea','retenido');`,
    to:  `      .select('id').in('id', ids).eq('estado_linea','no-existe');` },
  { id:'M8', desc:'el panel no sobrevive a la anulación', mata:['U7'],
    from:`  cobUltimoRecibo = panel;\n  cobrosRenderRecibo();`,
    to:  `  cobLimpiarPanelRecibo();` },
];

if (process.argv.includes('--mutantes')) {
  const dir = mkdtempSync(join(tmpdir(), 'mut-anular-ui-'));
  console.log(`\n═══ MUTATION TESTING · ${MUTANTES.length} mutantes ═══\n(copias en ${dir} — el repo no se toca)\n`);
  let vivos = 0;
  for (const m of MUTANTES){
    if (!HTML.includes(m.from)) {
      console.log(`❌ ${m.id} NO APLICABLE — el ancla no existe en el HTML. ${m.desc}`);
      vivos++; continue;
    }
    const path = join(dir, `${m.id}.html`);
    writeFileSync(path, HTML.replace(m.from, m.to));
    let out = '';
    try {
      out = execFileSync(process.execPath, [fileURLToPath(import.meta.url)],
        { env: { ...process.env, LIQ_HTML: path }, encoding:'utf8', stdio:['ignore','pipe','pipe'] });
    } catch (e) { out = (e.stdout||'') + (e.stderr||''); }
    // Anclar en el ")" del rótulo: `❌ U4\b` NO matchea `❌ U4b)` (4 y b son ambos \w, no hay
    // borde), así que un mutante que mataba U4b se reportaba como sobreviviente. Falso positivo
    // del arnés, no del código bajo prueba.
    const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));
    const vivo = muertos.length === 0;
    if (vivo) vivos++;
    console.log(`${vivo?'❌':'✅'} ${m.id} ${vivo?'SOBREVIVE':'muere'} — ${m.desc}`
      + `  [esperaba matar ${m.mata.join(',')}${muertos.length?`; murieron ${muertos.join(',')}`:''}]`);
  }
  console.log(`\n${vivos===0 ? '✅ TODOS LOS MUTANTES MUEREN' : `❌ ${vivos} mutante(s) sobreviven`} — ${MUTANTES.length} probados\n`);
  process.exit(vivos === 0 ? 0 : 1);
}

// ═══════════════════════════════ CORRIDA NORMAL ═══════════════════════════════
(async () => {
  const creados = { liqs: [], dets: [], recibos: [] };
  let antesB = {}, REUNION_B = null;
  const secuencias = {};
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
    const profMap = Object.fromEntries(profsB.map(p => [p.id, p]));

    antesB = await snapshotLineas(sb, REUNION_B);
    for (const c of [CLUB_A, CLUB_B]) {
      const { data: seq } = await sb.from('club_secuencias')
        .select('ultimo_numero').eq('club_id', c).eq('tipo','recibo').maybeSingle();
      secuencias[c] = seq ? seq.ultimo_numero : null;
    }

    // ── fixtures ────────────────────────────────────────────────────────────
    phase = 'fixtures';
    const plantar = async (concepto, bruto, extra={}) => {
      const { data: liq, error: eL } = await sb.from('liquidaciones')
        .insert({ club_id: CLUB_B, reunion_id: REUNION_B, profesional_id: BENEF,
                  estado:'borrador', total_bruto:0, total_descuentos:0 }).select().single();
      if (eL) throw new Error('crear liq: ' + eL.message);
      creados.liqs.push(liq.id);
      const { data: det, error: eD } = await sb.from('liquidacion_detalle')
        .insert({ liquidacion_id: liq.id, beneficiario_tipo:'profesional', beneficiario_id: BENEF,
                  reunion_id: REUNION_B, concepto, monto_bruto: bruto, monto_descuento: 0,
                  concepto_tipo:'premio', estado_linea:'impago', ...extra }).select().single();
      if (eD) throw new Error('crear detalle: ' + eD.message);
      creados.dets.push(det.id);
      return det;
    };
    const iso = d => new Date(Date.now() + d*864e5).toISOString().slice(0,10);
    const detA = await plantar(`${TAG} a ${RUN}`, M_A);
    const detB = await plantar(`${TAG} b ${RUN}`, M_B);
    // fecha_liberacion FUTURA: el caso que hace visible el CASE del RPC. Sin esta línea, "el aviso
    // de retenidas" no se puede probar — y es justamente lo que Valeria no tiene por qué deducir.
    const detR = await plantar(`${TAG} reten ${RUN}`, M_RETEN, { fecha_liberacion: iso(10) });

    // ── harness: código real extraído del HTML ──────────────────────────────
    phase = 'harness';
    const src = [
      HTML.slice(HTML.indexOf('const ROL_POR_BENEFICIARIO'),
                 HTML.indexOf('\n', HTML.indexOf('const ROL_POR_BENEFICIARIO'))),
      extractFn(HTML, 'function formatMonto(num)'),
      extractFn(HTML, 'function escapeHtml(s)'),
      extractFn(HTML, 'function rolDeLinea(l)'),
      extractFn(HTML, 'function nombreBenef(tipo, id)'),
      extractFn(HTML, 'function benefSearch(tipo, id)'),
      extractFn(HTML, 'function etiquetaRoles(g)'),
      extractFn(HTML, 'function etiquetaCarreras(g)'),
      extractFn(HTML, 'async function cobCargarReunPrueba()'),
      extractFn(HTML, 'function cobVisible(l, rid)'),
      extractFn(HTML, 'function cobDelClub(l)'),
      extractFn(HTML, 'async function cobrosBuscar()'),
      extractFn(HTML, 'async function cobrosDetalle(tipo, id)'),
      extractFn(HTML, 'function puedeAnularUI(recibo, rol)'),
      extractFn(HTML, 'function textoConfirmAnular(recibo, benef, nLineas)'),
      extractFn(HTML, 'function cobLimpiarPanelRecibo()'),
      extractFn(HTML, 'function cobrosRenderRecibo()'),
      extractFn(HTML, 'function cobrosAnular()'),
      extractFn(HTML, 'async function cobrosAnularConfirmar()'),
    ].join('\n\n');

    const document = mkDocument({ 'cob-q':'', 'cob-reunion':'', 'cob-carrera':'', 'anul-motivo':'' });
    const toasts = [];
    let confirmRespuesta = true;
    // Espía sobre sb.rpc. Sin esto, "el motivo vacío se rechaza ANTES de llegar al RPC" no es
    // verificable: si se saca la validación del cliente, el RPC rechaza igual, el recibo sigue
    // emitido y el toast también dice "motivo" — el assert pasaba con el guard neutralizado
    // (mutante M1 sobrevivía). Lo que hay que observar es que la llamada no salga.
    let rpcAnular = 0;
    const sbSpy = new Proxy(sb, {
      get(t, prop){
        if (prop === 'rpc') return (name, args) => { if (name === 'anular_recibo') rpcAnular++; return t.rpc(name, args); };
        const v = t[prop];
        return typeof v === 'function' ? v.bind(t) : v;
      }
    });
    const api = await new AsyncFunction(
      'sb','CLUB_ID','document','toast','propietariosMap','profesionales','closeModal','confirm',
      `let cobCaballerizas = [], cobInscCarrera = {}, cobNroCarrera = {}, cobMapsScope = null;
       let cobReunPrueba = null, cobBenef = null, cobApoderados = [], cobLineas = [];
       let cobUltimoRecibo = null, cobEmitirIds = [], currentUser = null;
       const imprimirReciboCobro = () => {};
       ${src}
       const fmt = formatMonto;
       return {
         cobrosBuscar, cobrosDetalle, puedeAnularUI, textoConfirmAnular,
         cobrosRenderRecibo, cobrosAnular, cobrosAnularConfirmar, cobLimpiarPanelRecibo,
         setUser: u => { currentUser = u; },
         setRecibo: r => { cobUltimoRecibo = r; },
         get recibo(){ return cobUltimoRecibo; },
         get lineas(){ return cobLineas; },
       };`
    )(sbSpy, CLUB_B, document,
      (m,t,ms) => toasts.push({ m, t: t||'success', ms: ms||3500 }),
      {}, profMap, () => {}, () => confirmRespuesta);

    api.setUser({ rol: 'secretario_carreras' });

    // ── U1 · el botón existe y llama al RPC ─────────────────────────────────
    // Assert sobre el TEXTO del archivo: el cableado onclick → handler → rpc no se puede observar
    // desde la base, y es exactamente lo que se rompe cuando alguien renombra una función.
    phase = 'U1';
    const srcPanel   = extractFn(HTML, 'function cobrosRenderRecibo()');
    const srcHandler = extractFn(HTML, 'async function cobrosAnularConfirmar()');
    ok('U1) el panel ofrece el botón "Anular recibo" y el handler llama a anular_recibo',
       /Anular recibo/.test(srcPanel) && /onclick="cobrosAnular\(\)"/.test(srcPanel)
       && /rpc\('anular_recibo'/.test(srcHandler),
       `panel_boton=${/onclick="cobrosAnular\(\)"/.test(srcPanel)} handler_rpc=${/rpc\('anular_recibo'/.test(srcHandler)}`);
    ok('U1b) el panel también ofrece reimprimir (el print cancelado hoy no tiene solución)',
       /cobrosReimprimir\(\)/.test(srcPanel));

    // ── U3 · la confirmación nombra número, importe y beneficiario ──────────
    phase = 'U3';
    const reciboFalso = { id:'00000000-0000-0000-0000-000000000000', numero_recibo: 33,
                          neto_a_cobrar: 62700, emitido_at: new Date().toISOString() };
    const txt = api.textoConfirmAnular(reciboFalso, { nombre:'LORENA SOLEDAD VARELA' }, 6);
    ok('U3) la confirmación incluye el número de recibo', /#33\b/.test(txt), txt.split('\n')[0]);
    ok('U3b) la confirmación incluye el importe formateado con fmt (no toLocaleString)',
       txt.includes('62.700'), txt.split('\n')[0]);
    ok('U3c) la confirmación nombra al beneficiario', txt.includes('LORENA SOLEDAD VARELA'));
    ok('U3d) la confirmación dice qué se pierde: líneas pendientes + número no reutilizable',
       /vuelven a quedar pendientes/.test(txt) && /no se reutiliza/.test(txt));
    ok('U3e) y avisa por el papel: "Si ya imprimiste el recibo, ese impreso queda sin valor."',
       txt.includes('Si ya imprimiste el recibo, ese impreso queda sin valor.'));

    // ── U4 · ventana de 5 días ──────────────────────────────────────────────
    phase = 'U4';
    const viejo   = { numero_recibo: 1, neto_a_cobrar: 1, emitido_at: new Date(Date.now()-6*864e5).toISOString() };
    const reciente= { numero_recibo: 2, neto_a_cobrar: 1, emitido_at: new Date(Date.now()-1*864e5).toISOString() };
    ok('U4) recibo de hace 6 días + NO super_admin → el botón no se ofrece',
       api.puedeAnularUI(viejo, 'secretario_carreras') === false);
    ok('U4b) el mismo recibo viejo, siendo super_admin → sí se ofrece',
       api.puedeAnularUI(viejo, 'super_admin') === true);
    ok('U4c) recibo de ayer + NO super_admin → se ofrece (dentro de la ventana)',
       api.puedeAnularUI(reciente, 'secretario_carreras') === true);
    // Y el panel tiene que respetarlo: la función puede estar bien y el render ignorarla.
    api.setRecibo({ recibo: viejo, lineaIds:['x'], benef:{nombre:'X'}, anulado:false, retenidas:0 });
    api.cobrosRenderRecibo();
    const htmlViejo = document._n['cob-recibo-emitido'].innerHTML;
    ok('U4d) el panel de un recibo viejo NO pinta el botón y explica por qué',
       !/onclick="cobrosAnular\(\)"/.test(htmlViejo) && /super_admin/.test(htmlViejo));

    // ── emisión real, para el resto ─────────────────────────────────────────
    phase = 'emision';
    const ids = [detA.id, detB.id, detR.id];
    const { data: emi, error: eEmi } = await sb.rpc('emitir_recibo', {
      p_club_id: CLUB_B, p_beneficiario_tipo:'profesional', p_beneficiario_id: BENEF,
      p_linea_ids: ids, p_forma_pago:'efectivo',
      p_cobrador_nombre:`Probe 056 UI ${RUN}`, p_cobrador_documento:'00000000', p_comprobante_url:null,
    });
    if (eEmi) throw new Error('emitir_recibo: ' + eEmi.message);
    const recibo = Array.isArray(emi) ? emi[0] : emi;
    creados.recibos.push(recibo.id);
    const benef = { tipo:'profesional', id: BENEF, nombre: nombreDe(profMap, BENEF) };
    api.setRecibo({ recibo, lineaIds: ids, origen:'titular', benef, anulado:false, retenidas:0 });

    // ── U2 · motivo vacío rechazado ANTES del RPC ───────────────────────────
    phase = 'U2';
    const malos = [];
    rpcAnular = 0;
    for (const v of ['', '   ', '\n\t ']){
      toasts.length = 0;
      document._n['anul-motivo'].value = v;
      await api.cobrosAnularConfirmar();
      const { data: r } = await sb.from('recibos').select('estado').eq('id', recibo.id).maybeSingle();
      malos.push(r?.estado === 'emitido' && toasts.some(t => /motivo/i.test(t.m) && t.t === 'error'));
    }
    ok('U2) motivo vacío, sólo espacios y sólo saltos: rechazados ANTES de llegar al RPC',
       malos.every(Boolean) && rpcAnular === 0,
       `toasts=${JSON.stringify(malos)} llamadas_al_rpc=${rpcAnular}`);

    // ── U2b · si el operador cancela la confirmación, no pasa nada ──────────
    phase = 'U2b';
    confirmRespuesta = false;
    document._n['anul-motivo'].value = 'probe UI — cancelado';
    await api.cobrosAnularConfirmar();
    const { data: rCancel } = await sb.from('recibos').select('estado').eq('id', recibo.id).maybeSingle();
    ok('U2b) cancelar la confirmación no anula nada', rCancel?.estado === 'emitido', `estado=${rCancel?.estado}`);
    confirmRespuesta = true;

    // ── anulación de verdad ─────────────────────────────────────────────────
    phase = 'anular';
    toasts.length = 0;
    document._n['anul-motivo'].value = 'probe UI — anulación de prueba';
    await api.cobrosAnularConfirmar();
    const { data: rDB } = await sb.from('recibos')
      .select('estado,motivo_anulacion,anulado_at,lineas_anuladas').eq('id', recibo.id).maybeSingle();
    ok('A1) el recibo quedó anulado con su motivo', rDB?.estado === 'anulado'
       && rDB?.motivo_anulacion === 'probe UI — anulación de prueba', JSON.stringify(rDB?.estado));

    // ── U5 · el buscador vuelve a listar las líneas ─────────────────────────
    phase = 'U5';
    const enDetalle = api.lineas.map(l => l.id);
    ok('U5) tras anular, las líneas impagas reaparecen en el detalle sin recargar la página',
       enDetalle.includes(detA.id) && enDetalle.includes(detB.id),
       `${enDetalle.length} línea(s) pagables en el detalle`);
    const { data: retDB } = await sb.from('liquidacion_detalle')
      .select('estado_linea').eq('id', detR.id).maybeSingle();
    ok('U5b) la de fecha_liberacion futura volvió a RETENIDO y por eso NO está entre las pagables',
       retDB?.estado_linea === 'retenido' && !enDetalle.includes(detR.id), `estado=${retDB?.estado_linea}`);
    ok('U5c) y aparece en la tabla de retenidas del detalle, con su botón Habilitar',
       /Retenido por doping/.test(document._n['cob-detalle'].innerHTML)
       && document._n['cob-detalle'].innerHTML.includes(detR.id));

    // ── U6 · el aviso de retenidas ──────────────────────────────────────────
    phase = 'U6';
    const avisoRet = toasts.find(t => /RETENIDA/i.test(t.m));
    ok('U6) el operador recibe el aviso de que hay líneas retenidas de nuevo',
       !!avisoRet && /1 de ellas/.test(avisoRet.m), avisoRet?.m || JSON.stringify(toasts.map(t=>t.m)));
    ok('U6b) y con duración larga: es una instrucción de trabajo, no un acuse',
       (avisoRet?.ms || 0) >= 10000, `ms=${avisoRet?.ms}`);

    // ── U7 · el panel sobrevive a la anulación ──────────────────────────────
    phase = 'U7';
    const htmlPanel = document._n['cob-recibo-emitido'].innerHTML;
    ok('U7) el panel sobrevive y queda como constancia: "Recibo N° X — ANULADO"',
       /ANULADO/.test(htmlPanel) && htmlPanel.includes(String(recibo.numero_recibo)));
    ok('U7b) pero ya no ofrece el botón de anular',
       !/onclick="cobrosAnular\(\)"/.test(htmlPanel));

  } catch (e) {
    ok(`EXCEPCIÓN en fase ${phase}`, false, e.message);
    console.error(e);
  } finally {
    phase = 'restore';
    for (const id of creados.recibos){
      await sb.from('liquidacion_detalle')
        .update({ estado_linea:'impago', recibo_id:null, pagado_at:null }).eq('recibo_id', id);
      await sb.from('recibos').delete().eq('id', id);
    }
    for (const id of creados.dets) await sb.from('liquidacion_detalle').delete().eq('id', id);
    for (const id of creados.liqs){
      await sb.from('liquidacion_detalle').delete().eq('liquidacion_id', id);
      await sb.from('liquidaciones').delete().eq('id', id);
    }
    // club_secuencias de los DOS clubes. Borrar los recibos no devuelve el correlativo:
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
    const sobranR = await recibosDesde(sb, T0);
    ok('R3) no quedó ningún recibo del probe, en NINGÚN club', sobranR.length === 0, JSON.stringify(sobranR));
    const { data: sobranL } = await sb.from('liquidacion_detalle').select('id').ilike('concepto', `${TAG}%`);
    ok('R4) no quedaron líneas del probe en la base', (sobranL||[]).length === 0, JSON.stringify(sobranL));
    const { data: seqFin } = await sb.from('club_secuencias')
      .select('club_id,ultimo_numero').eq('tipo','recibo').in('club_id',[CLUB_A, CLUB_B]);
    const seqOk = (seqFin||[]).every(r => secuencias[r.club_id] === r.ultimo_numero);
    ok('R5) club_secuencias de los dos clubes devuelto a donde estaba', seqOk,
       (seqFin||[]).map(r => `${r.club_id.slice(0,8)}: ${secuencias[r.club_id]}→${r.ultimo_numero}`).join(' · '));
  }

  console.log('\n── Probe ISSUE-056 · UI de anulación ──');
  console.log(`   html=${HTML_PATH}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();

function nombreDe(profMap, id){
  const p = profMap[id]; return p ? `${p.apellido}, ${p.nombre}` : '(profesional)';
}
