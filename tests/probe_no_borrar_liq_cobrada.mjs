/**
 * ISSUE-067 (opción 1) — no se puede eliminar una liquidación con líneas ya cobradas.
 *
 * El botón 🗑️ se escondía con `l.estado !== 'pagada'` — el estado de la CABECERA. Pero las 177
 * liquidaciones con líneas comprometidas están TODAS en 'borrador', así que el botón estaba visible
 * para las 346 líneas comprometidas del sistema: $23.023.740,85, el 70% de las líneas. Y
 * `eliminarLiq` borra el detalle con su propia sentencia, así que se las llevaba puestas sin dejar
 * rastro — `liquidacion_detalle` no tiene trigger de auditoría.
 *
 * LO QUE ESTE PROBE TIENE QUE ATRAPAR, y es la mitad del agujero: "comprometida" son DOS cosas.
 *   · recibo_id IS NOT NULL      → cobrada con recibo
 *   · estado_linea = 'pagado'    → saldado administrativo, SIN recibo (GOTCHA #74)
 * Contar sólo la primera daba 8 líneas; contando las dos son 346. Por eso `U3` existe y por eso el
 * mutante que saca la segunda condición tiene que morir.
 *
 * ESTO ES UI, NO ES UN GUARD (GOTCHA #80): un `curl` lo saltea. El guard de verdad es el trigger
 * BEFORE DELETE de la opción 3, que va aparte. Lo que se prueba acá es que el botón desaparece y
 * que la función se planta — que es donde está el riesgo real, un click apurado con gente esperando.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_no_borrar_liq_cobrada.mjs
 *   node tests/probe_no_borrar_liq_cobrada.mjs --mutantes=M1,M2,M3
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { snapshotLineas, restaurarLineas, diffLineas, describir } from './lib/estado_lineas.mjs';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }

const CLUB_B = 'a6da7e40-1515-45dc-8933-4eef33ce937a'; // Mi Club Hípico — sandbox
const TAG = 'TEST ISSUE-067';

const sb = createClient(SUPABASE_URL, KEY, { auth:{ autoRefreshToken:false, persistSession:false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = process.env.LIQ_HTML || join(HERE, '..', 'liquidaciones.html');
const HTML = readFileSync(HTML_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const results = [];
const ok = (t, c, n='') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
const RUN = Date.now().toString(36);

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

// Mini-DOM. `renderLiquidaciones` y `eliminarLiq` sólo usan getElementById, así que
// querySelectorAll TIRA siempre: si alguien agrega un selector, el probe muere en vez de pasar en
// verde con una lista vacía (misma clase de guard que en los probes anteriores).
function mkDom(){
  const nodos = {};
  const get = id => (nodos[id] ||= { id, innerHTML:'', textContent:'', value:'',
                                     style:{}, classList:{ add(){}, remove(){}, toggle(){} },
                                     scrollIntoView(){} });
  ['liq-container','sel-reunion','f-estado-f'].forEach(get);
  return { getElementById: id => get(id), _n: nodos,
           querySelectorAll(sel){ throw new Error(`mini-DOM: selector no soportado → ${sel}`); } };
}

const MUTANTES = [
  { id:'M1', desc:'el guard de UI vuelve a mirar el estado de la CABECERA', mata:['U1','U1b','U1e'],
    from:`    .filter(d => d.recibo_id != null || d.estado_linea === 'pagado').length;`,
    to:  `    .filter(d => false).length;` },
  // `mata` es U1e y NO U3/U3b: el saldado administrativo lo atrapan DOS capas —el render y el
  // re-chequeo de eliminarLiq—, así que romper el render deja U3/U3b en verde. Sólo un assert del
  // render, solo, para ese caso, distingue una capa de la otra. Es GOTCHA #86.
  { id:'M2', desc:'EL GRANDE: el RENDER cuenta sólo recibo_id y pierde el saldado administrativo', mata:['U1e'],
    from:`    .filter(d => d.recibo_id != null || d.estado_linea === 'pagado').length;`,
    to:  `    .filter(d => d.recibo_id != null).length;` },
  { id:'M3', desc:'el re-chequeo de eliminarLiq contra la base desaparece', mata:['U2','U2b'],
    from:`  if (comps?.length) {`,
    to:  `  if (false) {` },
  { id:'M4', desc:'el re-chequeo pierde la mitad de estado_linea', mata:['U3b'],
    from:`    .or('recibo_id.not.is.null,estado_linea.eq.pagado');`,
    to:  `    .not('recibo_id','is',null);` },
  { id:'M5', desc:'vuelve a ignorarse el error del primer delete', mata:['U4','U4b'],
    from:`  if (eDet) { console.error('[eliminarLiq/detalle]', eDet); toast(eDet.message,'error',9000); return; }`,
    to:  `  if (false) { console.error('[eliminarLiq/detalle]', eDet); toast(eDet.message,'error',9000); return; }` },
  { id:'M6', desc:'el badge deja de mostrar el conteo', mata:['U1b'],
    from:'🔒 ${comprometidasDe(l)} cobrada(s)',
    to:  '🔒 bloqueada' },
  { id:'M7', desc:'el aviso no dice cuántas líneas ni por cuánto', mata:['U2b'],
    from:'`No se puede eliminar: tiene ${comps.length} línea(s) ya cobrada(s) por ${fmt(total)}. `',
    to:  '`No se puede eliminar. `' },
  { id:'M8', desc:'el mini-DOM devuelve [] ante selector desconocido en vez de tirar', mata:['G1'],
    from:`           querySelectorAll(sel){ throw new Error(\`mini-DOM: selector no soportado → \${sel}\`); } };`,
    to:  `           querySelectorAll(sel){ return []; } };`,
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
  const dir = mkdtempSync(join(tmpdir(), 'mut-issue067-'));
  try {
    symlinkSync(join(HERE, '..', 'node_modules'), join(dir, 'node_modules'), 'dir');
    symlinkSync(join(HERE, 'lib'), join(dir, 'lib'), 'dir');
  } catch (e) { console.warn(`[runner] no pude symlinkear deps: ${e.message}`); }
  console.log(`\n═══ MUTATION TESTING · ${tanda.length}/${MUTANTES.length} mutantes${pedidos?` (tanda: ${pedidos.join(',')})`:''} ═══\n(copias en ${dir} — el repo no se toca)\n`);
  let vivos = 0, arnes = 0;
  for (const m of tanda){
    const esProbe = m.archivo === 'probe';
    const src = esProbe ? SELF_SRC : HTML;
    if (!src.includes(m.from)) { console.log(`⚠ ${m.id} ERROR DE ARNÉS — el ancla no existe. ${m.desc}`); arnes++; continue; }
    const path = join(dir, `${m.id}.${esProbe ? 'mjs' : 'html'}`);
    writeFileSync(path, src.replace(m.from, m.to));
    const script = esProbe ? path : SELF;
    const env = { ...process.env, LIQ_HTML: esProbe ? HTML_PATH : path };
    let out = '';
    try { out = execFileSync(process.execPath, [script], { env, encoding:'utf8', stdio:['ignore','pipe','pipe'] }); }
    catch (e) { out = (e.stdout||'') + (e.stderr||''); }
    // GOTCHA #84 — "murió por assert" vs "murió al arrancar".
    if (!/^\d+\/\d+ OK$/m.test(out)) {
      const causa = (out.split('\n').find(l => /Error|error:/.test(l)) || '(sin línea de error)').trim();
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el probe no llegó a correr los asserts. ${m.desc}\n     ↳ ${causa.slice(0,160)}`);
      arnes++; continue;
    }
    // GOTCHA #82 — anclar en el ")" del rótulo.
    const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));
    const vivo = muertos.length === 0;
    if (vivo) vivos++;
    console.log(`${vivo?'❌':'✅'} ${m.id} ${vivo?'SOBREVIVE':'muere'} — ${m.desc}`
      + `  [esperaba matar ${m.mata.join(',')}${muertos.length?`; murieron ${muertos.join(',')}`:''}]`);
  }
  console.log(`\n${vivos===0&&arnes===0?'✅ TANDA LIMPIA':'❌ TANDA CON HALLAZGOS'} — ${tanda.length} probados`
    + `${vivos?` · ${vivos} SOBREVIVEN`:''}${arnes?` · ${arnes} ERROR DE ARNÉS`:''}\n`);
  process.exit(vivos === 0 && arnes === 0 ? 0 : 1);
}

// ══════════════════════════════ CORRIDA NORMAL ══════════════════════════════
(async () => {
  const creados = { liqs: [], dets: [], recibos: [] };
  let antesB = {}, REUNION_B = null;
  let phase = 'init';
  try {
    phase = 'preflight';
    const { data: restos } = await sb.from('liquidacion_detalle').select('id,liquidacion_id').ilike('concepto', `${TAG}%`);
    if (restos?.length){
      console.log(`[preflight] ${restos.length} línea(s) de una corrida cortada — se limpian`);
      await sb.from('liquidacion_detalle').update({ recibo_id:null, pagado_at:null, estado_linea:'impago' }).in('id', restos.map(r=>r.id));
      await sb.from('liquidacion_detalle').delete().in('id', restos.map(r=>r.id));
      await sb.from('liquidaciones').delete().in('id', [...new Set(restos.map(r=>r.liquidacion_id))]);
    }

    phase = 'setup';
    const { data: rB } = await sb.from('reuniones').select('id').eq('club_id', CLUB_B).limit(1);
    REUNION_B = rB?.[0]?.id;
    if (!REUNION_B) throw new Error('el club B no tiene reuniones');
    const { data: profsB } = await sb.from('profesionales').select('id,nombre,apellido').eq('club_id', CLUB_B).eq('activo', true).limit(5);
    if (!profsB?.length) throw new Error('faltan profesionales activos en el club B');
    const BENEF = profsB[0].id;
    antesB = await snapshotLineas(sb, REUNION_B);

    phase = 'fixtures';
    // Tres liquidaciones, una por caso. Las tres en 'borrador' — que es el punto: el estado de la
    // cabecera no dice nada sobre si hay plata cobrada adentro.
    const crearLiq = async () => {
      const { data, error } = await sb.from('liquidaciones')
        .insert({ club_id: CLUB_B, reunion_id: REUNION_B, profesional_id: BENEF,
                  estado:'borrador', total_bruto:0, total_descuentos:0 }).select().single();
      if (error) throw new Error('crear liq: ' + error.message);
      creados.liqs.push(data.id); return data;
    };
    const crearDet = async (liqId, concepto, bruto, extra={}) => {
      const { data, error } = await sb.from('liquidacion_detalle')
        .insert({ liquidacion_id: liqId, beneficiario_tipo:'profesional', beneficiario_id: BENEF,
                  reunion_id: REUNION_B, concepto, monto_bruto: bruto, monto_descuento: 0,
                  concepto_tipo:'premio', estado_linea:'impago', ...extra }).select().single();
      if (error) throw new Error('crear detalle: ' + error.message);
      creados.dets.push(data.id); return data;
    };

    // (a) con recibo emitido
    const liqA = await crearLiq();
    const dA1 = await crearDet(liqA.id, `${TAG} a1 ${RUN}`, 11000);
    const dA2 = await crearDet(liqA.id, `${TAG} a2 ${RUN}`, 22000);
    const rEmi = await sb.rpc('emitir_recibo', {
      p_club_id: CLUB_B, p_beneficiario_tipo:'profesional', p_beneficiario_id: BENEF,
      p_linea_ids: [dA1.id], p_forma_pago:'efectivo',
      p_cobrador_nombre:`${TAG} ${RUN}`, p_cobrador_documento:'00000000', p_comprobante_url:null });
    if (rEmi.error) throw new Error('emitir_recibo: ' + rEmi.error.message);
    creados.recibos.push((Array.isArray(rEmi.data)?rEmi.data[0]:rEmi.data).id);

    // (b) SALDADO ADMINISTRATIVO: estado_linea='pagado' pero SIN recibo (GOTCHA #74). Es el caso
    // que el filtro viejo no veía, y son 346 de las 346 líneas comprometidas del sistema.
    const liqB = await crearLiq();
    const dB1 = await crearDet(liqB.id, `${TAG} b1 ${RUN}`, 33000, { estado_linea:'pagado' });

    // (c) limpia: nada comprometido
    const liqC = await crearLiq();
    const dC1 = await crearDet(liqC.id, `${TAG} c1 ${RUN}`, 44000);

    const releer = async () => (await sb.from('liquidaciones')
      .select('*, liquidacion_detalle(*)').in('id', creados.liqs)).data || [];

    // ── arnés ────────────────────────────────────────────────────────────────
    phase = 'harness';
    const cuerpos = [
      extractFn(HTML, 'function comprometidasDe(l){'),
      extractFn(HTML, 'function renderLiquidaciones() {'),
      extractFn(HTML, 'async function eliminarLiq(id) {'),
    ].join('\n\n');
    const dom = mkDom();
    const mkApi = async (sbInyectado, confirmar = true) => {
      const preludio = `
        const CLUB_ID = ${JSON.stringify(CLUB_B)};
        const profesionales = ${JSON.stringify(Object.fromEntries((profsB||[]).map(p=>[p.id,p])))};
        const propietariosMap = {};
        let liquidaciones = [];
        const toasts = [];
        const toast = (m, t='success', ms) => toasts.push({ m, t, ms });
        const fmt = n => '$ ' + Number(n||0).toLocaleString('es-AR', { minimumFractionDigits:2, maximumFractionDigits:2 });
        const confirm = () => ${confirmar};
        // loadLiquidaciones se stubbea: relee de la base y repinta, y acá lo que se mide es lo que
        // eliminarLiq DECIDE, no el refresco. Se cuenta cuántas veces se llamó.
        let recargas = 0;
        const loadLiquidaciones = async () => { recargas++; };
        const document = doc;
      `;
      const epilogo = `
        return { comprometidasDe, renderLiquidaciones, eliminarLiq,
                 setLiqs: v => { liquidaciones = v; },
                 estado: () => ({ toasts, recargas }) };
      `;
      return new AsyncFunction('sb','doc', preludio + cuerpos + epilogo)(sbInyectado, dom);
    };
    const api = await mkApi(sb);

    // ── U1 · el render ───────────────────────────────────────────────────────
    phase = 'U1';
    api.setLiqs(await releer());
    api.renderLiquidaciones();
    const html = dom._n['liq-container'].innerHTML;
    const tieneBoton = id => new RegExp(`eliminarLiq\\('${id}'\\)`).test(html);
    // El badge de LA TARJETA de esa liquidación. Cortar por `liq-card` y no por un slice de N
    // caracteres: las tarjetas son contiguas y un slice fijo se mete en la siguiente — daba el
    // badge del vecino y ponía U1c en rojo con el código correcto.
    const tarjetas = html.split('<div class="liq-card').slice(1);
    const badgeDe = id => {
      const t = tarjetas.find(x => x.includes(id));
      return t ? ((t.match(/🔒 ([^<]*)</) || [])[1] || null) : null;
    };
    // Los dos casos de "comprometida" se assertean POR SEPARADO, y no juntos en un &&: el render y
    // el re-chequeo de eliminarLiq son dos capas que se tapan entre sí (GOTCHA #86). Si el render
    // pierde el saldado administrativo, el re-chequeo lo sigue atrapando y el bug pasa desapercibido
    // — salvo que haya un assert del render, solo, para ese caso. Ése es U1e.
    ok('U1) con un recibo emitido NO se renderiza el botón 🗑️',
       !tieneBoton(liqA.id), tieneBoton(liqA.id)?'CON BOTÓN':'sin botón');
    ok('U1b) y en su lugar va el badge 🔒 con el CONTEO',
       badgeDe(liqA.id) === '1 cobrada(s)', `badge="${badgeDe(liqA.id)}"`);
    ok('U1e) el RENDER también tapa el saldado administrativo (pagado SIN recibo)',
       !tieneBoton(liqB.id) && badgeDe(liqB.id) === '1 cobrada(s)',
       `boton=${tieneBoton(liqB.id)?'CON BOTÓN':'sin botón'} badge="${badgeDe(liqB.id)}"`);
    ok('U1c) la liquidación sin nada comprometido SÍ conserva su botón',
       tieneBoton(liqC.id) && badgeDe(liqC.id) === null,
       `C=${tieneBoton(liqC.id)?'con botón':'SIN BOTÓN'} badge="${badgeDe(liqC.id)}"`);
    ok('U1d) el badge explica por qué, en el title',
       /No se puede eliminar: tiene líneas ya cobradas/.test(html),
       (html.match(/title="[^"]{0,80}/)||[])[0] || 'sin title');

    // ── U2 · eliminarLiq se planta ───────────────────────────────────────────
    phase = 'U2';
    api.estado().toasts.length = 0;
    await api.eliminarLiq(liqA.id);
    const { data: sigueA } = await sb.from('liquidaciones').select('id').eq('id', liqA.id).maybeSingle();
    const { data: lineasA } = await sb.from('liquidacion_detalle').select('id').eq('liquidacion_id', liqA.id);
    ok('U2) eliminarLiq sobre una liquidación con líneas cobradas NO borra nada',
       !!sigueA && (lineasA||[]).length === 2,
       `liquidación=${sigueA?'sigue':'BORRADA'} líneas=${(lineasA||[]).length}/2`);
    const t2 = api.estado().toasts.at(-1);
    ok('U2b) y el aviso nombra cuántas líneas y por cuánto — no un error crudo',
       t2?.t === 'error' && /1 línea\(s\) ya cobrada\(s\)/.test(t2?.m||'') && /\$/.test(t2?.m||''),
       JSON.stringify(t2?.m));

    // ── U3 · el saldado administrativo, la mitad que faltaba ────────────────
    phase = 'U3';
    api.estado().toasts.length = 0;
    await api.eliminarLiq(liqB.id);
    const { data: sigueB } = await sb.from('liquidaciones').select('id').eq('id', liqB.id).maybeSingle();
    const { data: lineasB } = await sb.from('liquidacion_detalle').select('id,estado_linea,recibo_id').eq('liquidacion_id', liqB.id);
    ok('U3) una línea estado_linea=pagado SIN recibo también bloquea el borrado',
       !!sigueB && (lineasB||[]).length === 1 && lineasB[0].recibo_id === null,
       `liquidación=${sigueB?'sigue':'BORRADA'} recibo_id=${lineasB?.[0]?.recibo_id}`);
    ok('U3b) y el re-chequeo contra la base la detecta (no sólo el render)',
       /1 línea\(s\) ya cobrada\(s\)/.test(api.estado().toasts.at(-1)?.m || ''),
       JSON.stringify(api.estado().toasts.at(-1)?.m));

    // ── U4 · el error del primer delete ya no se ignora ─────────────────────
    // Se inyecta un cliente que falla SÓLO en el delete de liquidacion_detalle. Con service_role no
    // hay forma de que ese delete falle de verdad, y lo que hay que probar es que la función se
    // detiene cuando falla — no que falle.
    phase = 'U4';
    const sbFalla = {
      from(tabla){
        if (tabla !== 'liquidacion_detalle') return sb.from(tabla);
        const real = sb.from(tabla);
        return { select: (...a) => real.select(...a),
                 delete: () => ({ eq: async () => ({ data:null, error:{ message:'permission denied for table liquidacion_detalle', code:'42501' } }) }) };
      },
      rpc: (...a) => sb.rpc(...a),
    };
    const apiFalla = await mkApi(sbFalla);
    await apiFalla.eliminarLiq(liqC.id);
    const { data: sigueC } = await sb.from('liquidaciones').select('id').eq('id', liqC.id).maybeSingle();
    ok('U4) si el borrado del detalle falla, la cabecera NO se borra (el error ya no se ignora)',
       !!sigueC, sigueC ? 'la liquidación sobrevivió' : '¡BORRADA! el error se siguió ignorando');
    const t4 = apiFalla.estado().toasts.at(-1);
    ok('U4b) y el error se le muestra al operador, no queda en silencio',
       t4?.t === 'error' && /permission denied/.test(t4?.m || ''),
       JSON.stringify(t4?.m));
    ok('U4c) y NO se avisa "Liquidación eliminada" sobre un borrado que no ocurrió',
       !apiFalla.estado().toasts.some(t => /eliminada/i.test(t.m||'')),
       JSON.stringify(apiFalla.estado().toasts.map(t=>t.m)));

    // ── U5 · el camino feliz sigue andando ──────────────────────────────────
    // Tan importante como los bloqueos: una defensa que rompe el flujo normal se termina sacando.
    phase = 'U5';
    api.estado().toasts.length = 0;
    await api.eliminarLiq(liqC.id);
    const { data: sigueC2 } = await sb.from('liquidaciones').select('id').eq('id', liqC.id).maybeSingle();
    const { data: lineasC } = await sb.from('liquidacion_detalle').select('id').eq('liquidacion_id', liqC.id);
    ok('U5) una liquidación SIN líneas comprometidas se sigue pudiendo eliminar',
       !sigueC2 && (lineasC||[]).length === 0,
       `liquidación=${sigueC2?'SIGUE':'borrada'} líneas=${(lineasC||[]).length}`);
    ok('U5b) y avisa que se eliminó',
       api.estado().toasts.some(t => /eliminada/i.test(t.m||'')),
       JSON.stringify(api.estado().toasts.map(t=>t.m)));
    if (!sigueC2) { creados.liqs = creados.liqs.filter(i => i !== liqC.id); creados.dets = creados.dets.filter(i => i !== dC1.id); }

    // ── G · guard del arnés ─────────────────────────────────────────────────
    phase = 'G';
    let tiro = false;
    try { dom.querySelectorAll('.liq-card'); } catch { tiro = true; }
    ok('G1) el mini-DOM TIRA ante cualquier selector (nada debería usar querySelectorAll acá)', tiro);

  } catch (e) {
    ok(`X1) el probe corrió sin excepciones (fase: ${phase})`, false, e.message);
  } finally {
    if (creados.recibos.length) {
      await sb.from('liquidacion_detalle').update({ recibo_id:null, pagado_at:null, estado_linea:'impago' }).in('recibo_id', creados.recibos);
      await sb.from('recibos').delete().in('id', creados.recibos);
    }
    if (creados.dets.length) {
      await sb.from('liquidacion_detalle').update({ recibo_id:null, pagado_at:null, estado_linea:'impago' }).in('id', creados.dets);
      await sb.from('liquidacion_detalle').delete().in('id', creados.dets);
    }
    if (creados.liqs.length) await sb.from('liquidaciones').delete().in('id', creados.liqs);
    if (REUNION_B){
      const desp = await snapshotLineas(sb, REUNION_B);
      const arregladas = await restaurarLineas(sb, antesB, desp);
      const v = diffLineas(antesB, await snapshotLineas(sb, REUNION_B));
      ok('R1) restore por ESTADO: las líneas quedaron como estaban', v.limpio, describir(v));
      ok('R2) y no hubo que restaurar nada a mano', arregladas === 0, `${arregladas} línea(s)`);
    }
    const { data: sobranL } = await sb.from('liquidacion_detalle').select('id').ilike('concepto', `${TAG}%`);
    ok('R3) no quedaron líneas del probe en la base', (sobranL||[]).length === 0, JSON.stringify(sobranL));
    const { data: sobranR } = await sb.from('recibos').select('id,numero_recibo').ilike('cobrador_nombre', `${TAG}%`);
    ok('R4) no quedaron recibos del probe', (sobranR||[]).length === 0, JSON.stringify(sobranR));
  }

  console.log('\n── Probe ISSUE-067 · no borrar liquidaciones con líneas cobradas ──');
  console.log(`   html=${HTML_PATH}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
