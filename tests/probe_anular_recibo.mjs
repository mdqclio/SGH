/**
 * probe_anular_recibo.mjs — ISSUE-056
 *
 * Verifica el RPC `anular_recibo` contra producción, con código real y sin browser.
 *
 * Cubre lo pedido: anulación con líneas volviendo a impago y a retenido, el correlativo que no
 * se devuelve, el recibo que queda anulado y no borrado, la doble anulación que falla, el
 * candado de club, la ventana de 5 días en sus dos lados, el motivo obligatorio, el jsonb con
 * los ids de las líneas, y que las líneas vuelven a ser COBRABLES — que mide el efecto de
 * negocio y no el estado de la base.
 *
 * Los casos inversos (P1, P2b, P7b, P7c) son deliberados: sin ellos, un guard que niega siempre
 * y un CASE que retiene siempre pasarían el resto de los asserts.
 *
 * REQUIERE migrations/anular_recibo_v1.sql APLICADA.
 *
 * Overrides para el mutation test (no usar en la corrida normal):
 *   RPC_ANULAR=nombre_de_la_funcion   apunta a una función sombra en vez de anular_recibo
 *   LIQ_HTML=/ruta/a/liquidaciones.html
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { snapshotLineas, restaurarLineas, diffLineas, describir, recibosDesde }
  from './lib/estado_lineas.mjs';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';

const CLUB_A = '0649e9c5-9e87-4aad-842f-101458e6b33c'; // Hipódromo de Dolores
const CLUB_B = 'a6da7e40-1515-45dc-8933-4eef33ce937a'; // Mi Club Hípico — donde se emite
const RPC_ANULAR = process.env.RPC_ANULAR || 'anular_recibo';

const M_SIMPLE  = 341111;   // vuelve a impago
const M_RETEN   = 342222;   // fecha_liberacion futura → vuelve a retenido
const M_PASADA  = 343333;   // fecha_liberacion pasada → vuelve a impago
const M_VIEJO   = 344444;   // recibo con emitido_at de hace 6 días
const M_CLUBA   = 345555;   // línea del club A, para el candado de club
const TAG = 'TEST ISSUE-056';

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = process.env.LIQ_HTML || join(HERE, '..', 'liquidaciones.html');
const HTML = readFileSync(HTML_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
const RUN = Date.now().toString(36);
const T0 = new Date(Date.now() - 5000).toISOString();

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

function mkDocument(campos) {
  const nodos = {};
  const get = id => (nodos[id] ||= {
    value: campos[id] ?? '', innerHTML: '', textContent: '',
    style: {}, classList: { add(){}, remove(){}, toggle(){} },
    scrollIntoView(){}, focus(){}, click(){},
  });
  Object.keys(campos).forEach(get);
  ['cob-detalle', 'cob-beneficiarios', 'cob-total'].forEach(get);
  return { getElementById: id => get(id) || null, _n: nodos, querySelectorAll: () => [] };
}

(async () => {
  const creados = { liqs: [], dets: [], recibos: [], usuarios: [], authIds: [] };
  let antesA = {}, antesB = {}, REUNION_A = null, REUNION_B = null;
  const secuencias = {};
  let phase = 'init';
  try {
    // ── 0) setup ───────────────────────────────────────────────────────────
    phase = 'setup';
    const { data: rA } = await sb.from('reuniones')
      .select('id,numero').eq('club_id', CLUB_A).eq('es_prueba', false).limit(1);
    const { data: rB } = await sb.from('reuniones').select('id,numero').eq('club_id', CLUB_B).limit(1);
    REUNION_A = rA?.[0]?.id; REUNION_B = rB?.[0]?.id;
    if (!REUNION_A) throw new Error('no hay reunión no-prueba en el club A');
    if (!REUNION_B) throw new Error('el club B no tiene reuniones');

    const { data: profsA } = await sb.from('profesionales')
      .select('id,nombre,apellido,documento_nro').eq('club_id', CLUB_A).eq('activo', true).limit(400);
    const { data: profsB } = await sb.from('profesionales')
      .select('id,nombre,apellido,documento_nro').eq('club_id', CLUB_B).eq('activo', true).limit(400);
    if (!profsA?.length || !profsB?.length) throw new Error('faltan profesionales activos');
    const BENEF_A = profsA[0].id, BENEF_B = profsB[0].id;
    const profMap = Object.fromEntries([...profsA, ...profsB].map(p => [p.id, p]));
    console.log(`[fixtures] A=R${rA[0].numero} · B=R${rB[0].numero} benefB=${BENEF_B.slice(0,8)}…`);

    phase = 'snapshot';
    antesA = await snapshotLineas(sb, REUNION_A);
    antesB = await snapshotLineas(sb, REUNION_B);
    for (const c of [CLUB_A, CLUB_B]) {
      const { data: seq } = await sb.from('club_secuencias')
        .select('ultimo_numero').eq('club_id', c).eq('tipo', 'recibo').maybeSingle();
      secuencias[c] = seq ? seq.ultimo_numero : null;
    }

    // ── 1) fixtures ────────────────────────────────────────────────────────
    phase = 'fixtures';
    const plantar = async (clubId, reunionId, benefId, concepto, bruto, extra = {}) => {
      const { data: liq, error: eL } = await sb.from('liquidaciones')
        .insert({ club_id: clubId, reunion_id: reunionId, profesional_id: benefId,
                  estado: 'borrador', total_bruto: 0, total_descuentos: 0 }).select().single();
      if (eL) throw new Error('crear liq: ' + eL.message);
      creados.liqs.push(liq.id);
      const { data: det, error: eD } = await sb.from('liquidacion_detalle')
        .insert({ liquidacion_id: liq.id, beneficiario_tipo: 'profesional', beneficiario_id: benefId,
                  reunion_id: reunionId, concepto, monto_bruto: bruto, monto_descuento: 0,
                  concepto_tipo: 'premio', estado_linea: 'impago', ...extra }).select().single();
      if (eD) throw new Error('crear detalle: ' + eD.message);
      creados.dets.push(det.id);
      return det;
    };
    const iso = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

    const detSimple = await plantar(CLUB_B, REUNION_B, BENEF_B, `${TAG} simple ${RUN}`, M_SIMPLE);
    // fecha_liberacion FUTURA: el caso que separa la regla (b) de "siempre impago".
    // No existe en prod (las 8 líneas con recibo tienen fecha_liberacion NULL) — hay que fabricarlo.
    const detReten  = await plantar(CLUB_B, REUNION_B, BENEF_B, `${TAG} retenido ${RUN}`, M_RETEN,
                                    { fecha_liberacion: iso(10) });
    const detPasada = await plantar(CLUB_B, REUNION_B, BENEF_B, `${TAG} lib-pasada ${RUN}`, M_PASADA,
                                    { fecha_liberacion: iso(-10) });
    const detViejo  = await plantar(CLUB_B, REUNION_B, BENEF_B, `${TAG} viejo ${RUN}`, M_VIEJO);
    const detViejo2 = await plantar(CLUB_B, REUNION_B, BENEF_B, `${TAG} viejo2 ${RUN}`, M_VIEJO + 1);
    const detClubA  = await plantar(CLUB_A, REUNION_A, BENEF_A, `${TAG} clubA ${RUN}`, M_CLUBA);

    const emitir = (cli, clubId, benefId, ids) => cli.rpc('emitir_recibo', {
      p_club_id: clubId, p_beneficiario_tipo: 'profesional', p_beneficiario_id: benefId,
      p_linea_ids: ids, p_forma_pago: 'efectivo',
      p_cobrador_nombre: `Probe 056 ${RUN}`, p_cobrador_documento: '00000000',
      p_comprobante_url: null,
    }).then(r => ({ data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error }));
    const anular = (cli, reciboId, motivo) =>
      cli.rpc(RPC_ANULAR, { p_recibo_id: reciboId, p_motivo: motivo });
    const reg = r => { if (r?.id) creados.recibos.push(r.id); return r; };
    const linea = async id => (await sb.from('liquidacion_detalle')
      .select('id,estado_linea,recibo_id,pagado_at,fecha_liberacion').eq('id', id).single()).data;
    const recibo = async id => (await sb.from('recibos').select('*').eq('id', id).maybeSingle()).data;
    const seqDe = async c => (await sb.from('club_secuencias')
      .select('ultimo_numero').eq('club_id', c).eq('tipo', 'recibo').maybeSingle()).data?.ultimo_numero;

    // ── 2) usuarios con sesión real ────────────────────────────────────────
    // signInWithPassword está gateado por Turnstile desde el 04/08/2026; magiclink no.
    phase = 'usuarios';
    const crearSesion = async (clubId, rol, tag) => {
      const EMAIL = `probe.056.${tag}.${RUN}@sgh.test`;
      const { data: au, error: eAu } = await sb.auth.admin.createUser({
        email: EMAIL, password: `Px-${RUN}-${Math.random().toString(36).slice(2)}`, email_confirm: true });
      if (eAu) throw new Error('createUser: ' + eAu.message);
      creados.authIds.push(au.user.id);
      const { error: eIns } = await sb.from('usuarios').insert({
        email: EMAIL, nombre_completo: `Probe 056 ${tag} ${RUN}`, club_id: clubId,
        rol, activo: true, estado: 'activo', password_hash: '', auth_user_id: au.user.id });
      if (eIns) throw new Error('insert usuarios: ' + eIns.message);
      creados.usuarios.push(EMAIL);
      const { data: uRow } = await sb.from('usuarios').select('id').eq('email', EMAIL).single();
      const { data: link, error: eLink } = await sb.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
      if (eLink) throw new Error('generateLink: ' + eLink.message);
      const cli = createClient(SUPABASE_URL, PUBLISHABLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } });
      const { error: eOtp } = await cli.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
      if (eOtp) throw new Error('verifyOtp: ' + eOtp.message);
      return { cli, usuarioId: uRow.id, authId: au.user.id, email: EMAIL };
    };
    const sesB     = await crearSesion(CLUB_B, 'secretario_carreras', 'clubB');
    const sesSuper = await crearSesion(CLUB_B, 'super_admin',         'super');

    // ── P1 · anulación exitosa, líneas vuelven a impago ────────────────────
    phase = 'P1';
    const recSimple = reg((await emitir(sesB.cli, CLUB_B, BENEF_B, [detSimple.id])).data);
    if (!recSimple?.id) throw new Error('no se pudo emitir el recibo simple');
    const seqAntes = await seqDe(CLUB_B);
    const nRecAntes = (await sb.from('recibos').select('id', { count: 'exact', head: true })).count;

    const { data: anuSimple, error: eAnuSimple } =
      await anular(sesB.cli, recSimple.id, 'probe 056 — caso simple');
    const rAnuSimple = Array.isArray(anuSimple) ? anuSimple[0] : anuSimple;
    ok('P1) anulación exitosa: el RPC no falla', !eAnuSimple && !!rAnuSimple?.id,
       eAnuSimple?.message || `recibo ${rAnuSimple?.numero_recibo}`);

    const lSimple = await linea(detSimple.id);
    ok('P1b) la línea volvió a impago, sin recibo y sin pagado_at',
       lSimple.estado_linea === 'impago' && lSimple.recibo_id === null && lSimple.pagado_at === null,
       JSON.stringify(lSimple));

    // ── P2 · líneas con liberación futura vuelven a RETENIDO ───────────────
    phase = 'P2';
    // el caso completo: nace retenida → se libera a mano → se cobra → se anula
    await sb.from('liquidacion_detalle').update({ estado_linea: 'retenido' }).eq('id', detReten.id);
    const { error: eLib } = await sb.rpc('liberar_linea', { p_linea_id: detReten.id });
    if (eLib) throw new Error('liberar_linea: ' + eLib.message);
    const recReten = reg((await emitir(sesB.cli, CLUB_B, BENEF_B, [detReten.id])).data);
    if (!recReten?.id) throw new Error('no se pudo emitir el recibo de la retenida');
    const { error: eAnuReten } = await anular(sesB.cli, recReten.id, 'probe 056 — retenida');
    const lReten = await linea(detReten.id);
    ok('P2) línea con fecha_liberacion FUTURA vuelve a retenido, no a impago',
       !eAnuReten && lReten.estado_linea === 'retenido' && lReten.recibo_id === null,
       eAnuReten?.message || JSON.stringify(lReten));

    // ── P2b · [caso inverso] liberación PASADA vuelve a impago ─────────────
    phase = 'P2b';
    const recPasada = reg((await emitir(sesB.cli, CLUB_B, BENEF_B, [detPasada.id])).data);
    const { error: eAnuPas } = await anular(sesB.cli, recPasada.id, 'probe 056 — liberación pasada');
    const lPasada = await linea(detPasada.id);
    ok('P2b) [caso inverso] fecha_liberacion PASADA vuelve a impago (el CASE no retiene todo)',
       !eAnuPas && lPasada.estado_linea === 'impago',
       eAnuPas?.message || JSON.stringify(lPasada));

    // ── P3 · el correlativo no se devuelve ─────────────────────────────────
    phase = 'P3';
    const seqDespues = await seqDe(CLUB_B);
    ok('P3) el correlativo NO se devuelve: club_secuencias quedó donde estaba',
       seqDespues >= seqAntes, `antes=${seqAntes} después=${seqDespues}`);
    const recPost = reg((await emitir(sesB.cli, CLUB_B, BENEF_B, [detViejo2.id])).data);
    ok('P3b) el recibo siguiente saca un número MAYOR al anulado (no lo recicla)',
       recPost?.numero_recibo > rAnuSimple?.numero_recibo,
       `anulado=${rAnuSimple?.numero_recibo} siguiente=${recPost?.numero_recibo}`);

    // ── P4 · el recibo queda, anulado, sin borrarse ────────────────────────
    phase = 'P4';
    const rSimpleDB = await recibo(recSimple.id);
    ok('P4) el recibo quedó con estado anulado, anulado_at y motivo',
       rSimpleDB?.estado === 'anulado' && !!rSimpleDB?.anulado_at
         && rSimpleDB?.motivo_anulacion === 'probe 056 — caso simple',
       JSON.stringify({ estado: rSimpleDB?.estado, at: rSimpleDB?.anulado_at, m: rSimpleDB?.motivo_anulacion }));
    ok('P4b) y NO se borró: la fila existe y conserva su numero_recibo',
       !!rSimpleDB && rSimpleDB.numero_recibo === recSimple.numero_recibo,
       `numero=${rSimpleDB?.numero_recibo}`);
    const nRecDespues = (await sb.from('recibos').select('id', { count: 'exact', head: true })).count;
    ok('P4c) el conteo total de recibos no bajó (anular no es borrar)',
       nRecDespues >= nRecAntes, `antes=${nRecAntes} después=${nRecDespues}`);

    // ── P4d · el jsonb con los ids de las líneas ───────────────────────────
    phase = 'P4d';
    ok('P4d) lineas_anuladas guardó los ids EXACTOS que tenía el recibo',
       JSON.stringify(rSimpleDB?.lineas_anuladas) === JSON.stringify([detSimple.id]),
       JSON.stringify(rSimpleDB?.lineas_anuladas));
    // un recibo de 2 líneas: que no guarde sólo la primera
    const recDos = reg((await emitir(sesB.cli, CLUB_B, BENEF_B, [detViejo.id, detPasada.id])).data);
    let idsEsperados = [detViejo.id, detPasada.id].sort();
    if (recDos?.id) {
      await anular(sesB.cli, recDos.id, 'probe 056 — dos líneas');
      const rDosDB = await recibo(recDos.id);
      const guardados = [...(rDosDB?.lineas_anuladas || [])].sort();
      ok('P4e) con 2 líneas guarda las DOS, no sólo la primera',
         JSON.stringify(guardados) === JSON.stringify(idsEsperados),
         JSON.stringify(guardados));
      ok('P4f) el jsonb permite reconstruir el recibo: las líneas existen y ya no lo apuntan',
         (await Promise.all(guardados.map(linea))).every(l => l && l.recibo_id === null),
         `${guardados.length} línea(s) reconstruidas`);
    } else {
      ok('P4e) con 2 líneas guarda las DOS, no sólo la primera', false, 'no se pudo emitir');
      ok('P4f) el jsonb permite reconstruir el recibo', false, 'no se pudo emitir');
    }

    // ── P5 · anular dos veces falla ────────────────────────────────────────
    phase = 'P5';
    const atPrimera = rSimpleDB?.anulado_at;
    const { error: eDoble } = await anular(sesB.cli, recSimple.id, 'probe 056 — segunda vez');
    ok('P5) anular dos veces falla con mensaje claro', !!eDoble && /ya fue anulado/.test(eDoble.message || ''),
       eDoble?.message || '¡ANULÓ DOS VECES!');
    const rTrasDoble = await recibo(recSimple.id);
    ok('P5b) y la segunda llamada no pisó el anulado_at ni el motivo de la primera',
       rTrasDoble?.anulado_at === atPrimera && rTrasDoble?.motivo_anulacion === 'probe 056 — caso simple',
       `at=${rTrasDoble?.anulado_at} motivo=${rTrasDoble?.motivo_anulacion}`);

    // ── P6 · candado de club ───────────────────────────────────────────────
    phase = 'P6';
    const recClubA = reg((await emitir(sb, CLUB_A, BENEF_A, [detClubA.id])).data);  // service_role
    if (!recClubA?.id) throw new Error('no se pudo emitir el recibo del club A');
    const { error: eCruz } = await anular(sesB.cli, recClubA.id, 'probe 056 — cruce de club');
    ok('P6) un usuario del club B NO puede anular un recibo del club A',
       !!eCruz && /otro club/.test(eCruz.message || ''), eCruz?.message || '¡ANULÓ!');
    const rClubADB = await recibo(recClubA.id);
    const lClubA = await linea(detClubA.id);
    ok('P6b) y nada cambió: el recibo sigue emitido y su línea sigue pagada',
       rClubADB?.estado === 'emitido' && lClubA.estado_linea === 'pagado'
         && lClubA.recibo_id === recClubA.id,
       JSON.stringify({ rec: rClubADB?.estado, lin: lClubA.estado_linea }));

    // ── P7 · ventana de 5 días ─────────────────────────────────────────────
    phase = 'P7';
    const recViejo = reg((await emitir(sesB.cli, CLUB_B, BENEF_B, [detViejo.id])).data);
    if (!recViejo?.id) throw new Error('no se pudo emitir el recibo viejo');
    await sb.from('recibos')
      .update({ emitido_at: new Date(Date.now() - 6 * 864e5).toISOString() }).eq('id', recViejo.id);
    const { error: eViejo } = await anular(sesB.cli, recViejo.id, 'probe 056 — fuera de ventana');
    ok('P7) pasados los 5 días, el rol que emite NO puede anular',
       !!eViejo && /más de 5 días/.test(eViejo.message || ''), eViejo?.message || '¡ANULÓ!');
    const { error: eSuper } = await anular(sesSuper.cli, recViejo.id, 'probe 056 — super_admin');
    ok('P7b) [caso inverso] pasados los 5 días, un super_admin SÍ puede',
       !eSuper, eSuper?.message || 'anulado por super_admin');
    ok('P7c) [caso inverso] dentro de los 5 días el rol que emite SÍ pudo (P1)',
       results.find(r => r.t.startsWith('P1)'))?.s === '✅');

    // ── P8 · motivo obligatorio ────────────────────────────────────────────
    phase = 'P8';
    const recMotivo = reg((await emitir(sesB.cli, CLUB_B, BENEF_B, [detSimple.id])).data);
    if (!recMotivo?.id) throw new Error('no se pudo re-emitir para el test de motivo');
    const malos = [];
    for (const m of [null, '', '   ']) {
      const { error } = await anular(sesB.cli, recMotivo.id, m);
      malos.push(!!error && /motivo de anulación es obligatorio/.test(error.message || ''));
    }
    ok('P8) motivo NULL, vacío y sólo-espacios: los tres rechazados', malos.every(Boolean),
       JSON.stringify(malos));
    ok('P8b) y el recibo sigue emitido tras los tres intentos',
       (await recibo(recMotivo.id))?.estado === 'emitido');

    // ── P9/P10 · quién anuló ───────────────────────────────────────────────
    phase = 'P9';
    const { data: anuOK } = await anular(sesB.cli, recMotivo.id, 'probe 056 — con motivo');
    const rMotivoDB = await recibo(recMotivo.id);
    const { data: authRow } = await sb.auth.admin.getUserById(sesB.authId);
    ok('P9) anulado_por = usuarios.id de la sesión (no NULL, no auth.uid())',
       rMotivoDB?.anulado_por === sesB.usuarioId && sesB.usuarioId !== sesB.authId,
       `anulado_por=${rMotivoDB?.anulado_por} usuarios.id=${sesB.usuarioId} auth.uid=${authRow?.user?.id}`);

    phase = 'P10';
    const recSvc = reg((await emitir(sb, CLUB_B, BENEF_B, [detSimple.id])).data);
    if (recSvc?.id) {
      await anular(sb, recSvc.id, 'probe 056 — service_role');
      const rSvcDB = await recibo(recSvc.id);
      ok('P10) bajo service_role anulado_por queda NULL (no inventa autor)',
         rSvcDB?.estado === 'anulado' && rSvcDB?.anulado_por === null,
         `estado=${rSvcDB?.estado} anulado_por=${rSvcDB?.anulado_por}`);
    } else {
      ok('P10) bajo service_role anulado_por queda NULL', false, 'no se pudo emitir');
    }

    // ── P11 · efecto de negocio: las líneas vuelven a ser COBRABLES ────────
    phase = 'P11';
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
      extractFn(HTML, 'function cobDelClub(l)'),
      extractFn(HTML, 'async function cobrosBuscar()'),
      // ISSUE-056 — cobrosDetalle limpia el panel del recibo emitido; el helper viaja con ella.
      extractFn(HTML, 'function cobLimpiarPanelRecibo()'),
      extractFn(HTML, 'async function cobrosDetalle(tipo, id)'),
    ].join('\n\n');
    const document = mkDocument({ 'cob-q': '', 'cob-reunion': '', 'cob-carrera': '' });
    const api = await new AsyncFunction(
      'sb', 'CLUB_ID', 'document', 'toast', 'fmt', 'propietariosMap', 'profesionales',
      `let cobCaballerizas = [], cobInscCarrera = {}, cobNroCarrera = {}, cobMapsScope = null;
       let cobReunPrueba = null, cobBenef = null, cobApoderados = [], cobLineas = [];
       let cobUltimoRecibo = null;   // ISSUE-056
       ${src}
       return { cobrosBuscar, cobrosDetalle, get lineas(){ return cobLineas; } };`
    )(sb, CLUB_B, document, () => {}, n => String(n), {}, profMap);
    await api.cobrosBuscar();
    const htmlB = document._n['cob-beneficiarios'].innerHTML;
    // La tarjeta muestra el TOTAL pagable del beneficiario, no el monto de cada línea, y BENEF_B
    // tiene varias líneas. Así que el assert compara contra el total esperado calculado de la base
    // y verifica que la línea recién desanulada esté adentro: eso es el efecto de negocio.
    const { data: pagables } = await sb.from('liquidacion_detalle')
      .select('id,monto_neto,liquidaciones(club_id)')
      .eq('beneficiario_tipo', 'profesional').eq('beneficiario_id', BENEF_B)
      .eq('estado_linea', 'impago').is('recibo_id', null);
    const delClubB = (pagables || []).filter(l => l.liquidaciones?.club_id === CLUB_B);
    const totalEsperado = delClubB.reduce((a, l) => a + Number(l.monto_neto), 0);
    ok('P11) tras anular, la línea vuelve a estar entre lo cobrable y suma al total (efecto de negocio)',
       delClubB.some(l => l.id === detSimple.id) && htmlB.includes(String(totalEsperado)),
       `total=${totalEsperado} incluye_simple=${delClubB.some(l => l.id === detSimple.id)}`);
    await api.cobrosDetalle('profesional', BENEF_B);
    ok('P11b) y el detalle la trae tildada de nuevo',
       api.lineas.some(l => l.id === detSimple.id), `${api.lineas.length} línea(s) en el detalle`);

  } catch (e) {
    ok(`EXCEPCIÓN en fase ${phase}`, false, e.message);
    console.error(e);
  } finally {
    phase = 'restore';
    for (const id of creados.recibos) {
      await sb.from('liquidacion_detalle')
        .update({ estado_linea: 'impago', recibo_id: null, pagado_at: null }).eq('recibo_id', id);
      await sb.from('recibos').delete().eq('id', id);
    }
    for (const id of creados.dets) await sb.from('liquidacion_detalle').delete().eq('id', id);
    for (const id of creados.liqs) {
      await sb.from('liquidacion_detalle').delete().eq('liquidacion_id', id);
      await sb.from('liquidaciones').delete().eq('id', id);
    }
    for (const email of creados.usuarios) {
      const { data: u } = await sb.from('usuarios').select('id').eq('email', email).maybeSingle();
      if (u?.id) {
        await sb.from('auditoria').update({ usuario_id: null }).eq('usuario_id', u.id);
        await sb.from('recibos').update({ emitido_por: null }).eq('emitido_por', u.id);
        await sb.from('recibos').update({ anulado_por: null }).eq('anulado_por', u.id);
      }
      const { error } = await sb.from('usuarios').delete().eq('email', email);
      if (error) console.error('  ⚠️  usuarios: ' + error.message);
    }
    for (const id of creados.authIds) {
      const { error } = await sb.auth.admin.deleteUser(id);
      if (error) console.error('  ⚠️  auth.users: ' + error.message);
    }
    // El grueso de los recibos sale contra el club B (Mi Club Hípico) para no mover el
    // correlativo de Dolores, PERO el fixture detClubA emite uno contra Dolores: el candado
    // de club (P6/P7) necesita un recibo ajeno de verdad para verificar que un usuario del
    // club B no lo puede anular. O sea: el probe toca las DOS secuencias, y por eso las
    // snapshotea y las devuelve a las dos. No decir acá que "sólo emite contra el club B":
    // era falso y el que lo leyera iba a confiar.
    for (const [c, n] of Object.entries(secuencias)) {
      if (n === null) await sb.from('club_secuencias').delete().eq('club_id', c).eq('tipo', 'recibo');
      else await sb.from('club_secuencias').update({ ultimo_numero: n }).eq('club_id', c).eq('tipo', 'recibo');
    }

    if (REUNION_A && REUNION_B) {
      const despA = await snapshotLineas(sb, REUNION_A);
      const despB = await snapshotLineas(sb, REUNION_B);
      const arregladas = await restaurarLineas(sb, antesA, despA) + await restaurarLineas(sb, antesB, despB);
      const vA = diffLineas(antesA, await snapshotLineas(sb, REUNION_A));
      const vB = diffLineas(antesB, await snapshotLineas(sb, REUNION_B));
      ok('R1) restore por estado: las líneas de los dos clubes quedaron como estaban',
         vA.limpio && vB.limpio, `A: ${describir(vA)} | B: ${describir(vB)}`);
      ok('R2) y no hubo que restaurar nada a mano (el probe no ensució fuera de sus fixtures)',
         arregladas === 0, `${arregladas} línea(s) restauradas`);
    }
    const sobranR = await recibosDesde(sb, T0);
    ok('R3) no quedó ningún recibo del probe, en NINGÚN club (foto sin filtro de club_id)',
       sobranR.length === 0, JSON.stringify(sobranR));
    const { data: sobranL } = await sb.from('liquidacion_detalle').select('id').ilike('concepto', `${TAG}%`);
    ok('R4) no quedaron líneas TEST ISSUE-056 en la base', (sobranL || []).length === 0,
       JSON.stringify(sobranL));
  }

  console.log('\n── Probe ISSUE-056 · anular_recibo ──');
  console.log(`   html=${HTML_PATH}  rpc=${RPC_ANULAR}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
