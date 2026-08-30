/**
 * Probe — ISSUE-059 / ISSUE-060 / ISSUE-057: aislamiento entre clubes en el circuito de cobro.
 *
 * Origen: el recibo fantasma del 2026-08-28. Parado en Mi Club Hípico con el club-switcher, el tab
 * Pagos listó plata de la reunión 9999 de Dolores, y al tocar Pagar el RPC lo aceptó. Tres capas
 * fallaron a la vez y este probe cubre las tres:
 *   ISSUE-059  emitir_recibo no validaba que las líneas fueran del club del recibo.
 *   ISSUE-060  cobrosBuscar / cobrosDetalle no filtraban por club_id.
 *   ISSUE-057  emitir_recibo nunca seteaba emitido_por (5 de 5 recibos con NULL).
 *
 * Hoy no se nota porque sólo Dolores tiene liquidaciones. Con un segundo hipódromo instalado esto
 * deja de ser un bug y pasa a ser un bloqueante: por eso el probe planta plata REAL en los DOS
 * clubes y prueba las dos direcciones, incluida la que importa — que un club SÍ vea lo suyo.
 *
 * Cobertura (el caso inverso incluido a propósito: un filtro que esconde todo también "pasaría"):
 *   1) el RPC rechaza líneas de otro club aunque beneficiario y estado sean correctos
 *   2) rechaza también la mezcla propia+ajena, entera (todo o nada, sin recibo parcial)
 *   3) el rechazo no deja escritura parcial ni recibo colgado en NINGÚN club
 *   4) cobrosBuscar parado en un club NO lista plata del otro …
 *   5) … y SÍ lista la propia, con el total exacto (el caso inverso)
 *   6) cobrosDetalle tampoco cruza clubes — ni para un beneficiario con plata en los dos
 *   7) emitido_por queda seteado al emitir desde una sesión con usuario real
 *   8) y queda NULL, sin romperse, bajo service_role (probes, MCP, jobs)
 *
 * Sin browser (chromium no corre en este Ubuntu — docs/SERVER.md): el código del front se EXTRAE
 * de liquidaciones.html y se corre con AsyncFunction contra Supabase real. Si el archivo cambia,
 * el probe corre el archivo cambiado.
 *
 * Restore por ESTADO (GOTCHA #77 / ISSUE-058): snapshotLineas antes, restaurarLineas + diffLineas
 * en el finally, y recibosDesde() SIN filtro de club (GOTCHA #76 — el recibo fantasma sobrevivió
 * justamente a una foto filtrada por club).
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_aislamiento_club_cobros.mjs
 *
 * REQUIERE migrations/emitir_recibo_v1_2_aislamiento_club.sql APLICADA. Sin eso, los asserts del
 * RPC (1,2,3,7) fallan — que es exactamente lo que tienen que hacer: son la medida del fix.
 *
 * Overrides para el mutation test (no usar en la corrida normal):
 *   LIQ_HTML=/ruta/a/liquidaciones.html   corre el front desde otro archivo (versión neutralizada)
 *   RPC_EMITIR=nombre_de_la_funcion       apunta a una función sombra en vez de emitir_recibo
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
const CLUB_B = 'a6da7e40-1515-45dc-8933-4eef33ce937a'; // Mi Club Hípico
const RPC_EMITIR = process.env.RPC_EMITIR || 'emitir_recibo';

// montos reconocibles a simple vista en el HTML renderizado
const M_A_PROPIA  = 331111;   // club A, beneficiario de A
const M_A_CRUZADA = 332222;   // club A, beneficiario de B  ← el cebo del leak
const M_B_1       = 333333;   // club B, beneficiario de B
const M_B_2       = 334444;   // club B, beneficiario de B
const TOTAL_B     = M_B_1 + M_B_2;
const TAG = 'TEST ISSUE-059/060';

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = process.env.LIQ_HTML || join(HERE, '..', 'liquidaciones.html');
const HTML = readFileSync(HTML_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
const RUN = Date.now().toString(36);
const T0 = new Date(Date.now() - 5000).toISOString();

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
  const creados = { liqs: [], dets: [], recibos: [], usuarioEmail: null, authId: null };
  let antesA = {}, antesB = {}, REUNION_A = null, REUNION_B = null;
  const secuencias = {};   // club_id → ultimo_numero previo (null = la fila no existía)
  let phase = 'init';
  try {
    // ── 0) reuniones y beneficiarios de cada club ──────────────────────────
    phase = 'setup';
    const { data: rA } = await sb.from('reuniones')
      .select('id,numero,estado,es_prueba').eq('club_id', CLUB_A).eq('es_prueba', false).limit(1);
    const { data: rB } = await sb.from('reuniones')
      .select('id,numero,estado,es_prueba').eq('club_id', CLUB_B).limit(1);
    REUNION_A = rA?.[0]?.id; REUNION_B = rB?.[0]?.id;
    if (!REUNION_A) throw new Error('no hay reunión no-prueba en el club A');
    if (!REUNION_B) throw new Error(`el club B (${CLUB_B}) no tiene reuniones — el probe necesita una`);

    const { data: profsA } = await sb.from('profesionales')
      .select('id,nombre,apellido,documento_nro').eq('club_id', CLUB_A).eq('activo', true).limit(400);
    const { data: profsB } = await sb.from('profesionales')
      .select('id,nombre,apellido,documento_nro').eq('club_id', CLUB_B).eq('activo', true).limit(400);
    if (!profsA?.length) throw new Error('el club A no tiene profesionales activos');
    if (!profsB?.length) throw new Error('el club B no tiene profesionales activos');
    const BENEF_A = profsA[0].id;   // sólo plata en el club A
    const BENEF_B = profsB[0].id;   // plata en B y — a propósito — también en A
    const profMap = Object.fromEntries([...profsA, ...profsB].map(p => [p.id, p]));
    console.log(`[fixtures] A=R${rA[0].numero} benefA=${BENEF_A.slice(0,8)}… · B=R${rB[0].numero} benefB=${BENEF_B.slice(0,8)}…`);

    // ── 1) snapshot por ESTADO, antes de plantar nada ──────────────────────
    phase = 'snapshot';
    antesA = await snapshotLineas(sb, REUNION_A);
    antesB = await snapshotLineas(sb, REUNION_B);
    // Los DOS clubes: en la corrida normal sólo se gasta numeración de B, pero un mutante del
    // guard puede emitir a nombre de A y dejarle el contador movido.
    for (const c of [CLUB_A, CLUB_B]) {
      const { data: seq } = await sb.from('club_secuencias')
        .select('ultimo_numero').eq('club_id', c).eq('tipo', 'recibo').maybeSingle();
      secuencias[c] = seq ? seq.ultimo_numero : null;
    }

    // ── 2) fixtures en los DOS clubes ──────────────────────────────────────
    phase = 'fixtures';
    const plantar = async (clubId, reunionId, benefId, concepto, bruto) => {
      const { data: liq, error: eL } = await sb.from('liquidaciones')
        .insert({ club_id: clubId, reunion_id: reunionId, profesional_id: benefId,
                  estado: 'borrador', total_bruto: 0, total_descuentos: 0 }).select().single();
      if (eL) throw new Error('crear liq: ' + eL.message);
      creados.liqs.push(liq.id);
      const { data: det, error: eD } = await sb.from('liquidacion_detalle')
        .insert({ liquidacion_id: liq.id, beneficiario_tipo: 'profesional', beneficiario_id: benefId,
                  reunion_id: reunionId, concepto, monto_bruto: bruto, monto_descuento: 0,
                  concepto_tipo: 'premio', estado_linea: 'impago' }).select().single();
      if (eD) throw new Error('crear detalle: ' + eD.message);
      creados.dets.push(det.id);
      return det;
    };
    const detAPropia  = await plantar(CLUB_A, REUNION_A, BENEF_A, `${TAG} A-propia ${RUN}`,  M_A_PROPIA);
    const detACruzada = await plantar(CLUB_A, REUNION_A, BENEF_B, `${TAG} A-cruzada ${RUN}`, M_A_CRUZADA);
    const detB1       = await plantar(CLUB_B, REUNION_B, BENEF_B, `${TAG} B-1 ${RUN}`,       M_B_1);
    const detB2       = await plantar(CLUB_B, REUNION_B, BENEF_B, `${TAG} B-2 ${RUN}`,       M_B_2);

    // ── 3) ISSUE-059 — el RPC rechaza líneas de otro club ──────────────────
    // Reproducción exacta del fantasma: recibo del club B, líneas del club A. El beneficiario es
    // correcto (BENEF_B es profesional de B) y las líneas están impagas: si el RPC mira sólo
    // beneficiario y estado, como en v1.1, esto pasa.
    phase = 'rpc-cross';
    const emitir = (cli, clubId, benefId, ids) => cli.rpc(RPC_EMITIR, {
      p_club_id: clubId, p_beneficiario_tipo: 'profesional', p_beneficiario_id: benefId,
      p_linea_ids: ids, p_forma_pago: 'efectivo',
      p_cobrador_nombre: `Probe ${RUN}`, p_cobrador_documento: '00000000', p_comprobante_url: null,
    });

    const { data: dCross, error: eCross } = await emitir(sb, CLUB_B, BENEF_B, [detACruzada.id]);
    ok('1) el RPC rechaza una línea del club A en un recibo del club B',
       !!eCross && !dCross, eCross ? eCross.message : `¡EMITIÓ! recibo=${JSON.stringify(dCross)}`);
    ok('1b) el mensaje del rechazo nombra al club (no es un error genérico)',
       /club/i.test(eCross?.message || ''), eCross?.message || '(sin error)');
    if (dCross?.id) creados.recibos.push(dCross.id);   // por si emitió: hay que limpiarlo

    const { data: dMix, error: eMix } = await emitir(sb, CLUB_B, BENEF_B, [detB1.id, detACruzada.id]);
    ok('2) rechaza la mezcla propia+ajena ENTERA (nada de recibo parcial)',
       !!eMix && !dMix, eMix ? eMix.message : `¡EMITIÓ! recibo=${JSON.stringify(dMix)}`);
    if (dMix?.id) creados.recibos.push(dMix.id);

    const { data: trasFallo } = await sb.from('liquidacion_detalle')
      .select('id,estado_linea,recibo_id').in('id', [detACruzada.id, detB1.id]);
    ok('3) tras los rechazos ninguna línea quedó tocada (sin escritura parcial)',
       (trasFallo || []).length === 2 &&
       trasFallo.every(l => l.estado_linea === 'impago' && l.recibo_id === null),
       JSON.stringify(trasFallo));
    const recibosTrasFallo = await recibosDesde(sb, T0);
    ok('3b) los rechazos no dejaron recibo colgado en NINGÚN club (foto sin filtro de club_id)',
       recibosTrasFallo.length === 0, JSON.stringify(recibosTrasFallo));

    // ── 4) ISSUE-060 — el front, con el código real ────────────────────────
    phase = 'front';
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

    ok('4a) el archivo trae cobDelClub y lo aplica en el listado y en el detalle',
       /function cobDelClub\(l\)/.test(HTML) &&
       /const lineas = \(data\|\|\[\]\)\.filter\(l => cobDelClub\(l\)/.test(HTML) &&
       /cobLineas = \(pag\|\|\[\]\)\.filter\(l => cobDelClub\(l\)/.test(HTML) &&
       /const retLineas = \(ret\|\|\[\]\)\.filter\(l => cobDelClub\(l\)/.test(HTML));
    // Se mira dentro de los .select(...), no en todo el archivo: el comentario de cobDelClub
    // nombra el `!inner` justamente para explicar por qué NO se usa.
    const selectsConLiq = [...HTML.matchAll(/\.select\('([^']*)'\)/g)].map(m => m[1])
      .filter(sel => sel.includes('liquidaciones'));
    ok('4b) el club llega por EMBED, sin !inner (regla NULL-safe de ISSUE-055)',
       selectsConLiq.length >= 3 &&
       selectsConLiq.every(sel => sel.includes('liquidaciones(club_id)') && !sel.includes('!inner')),
       JSON.stringify(selectsConLiq));

    const correr = async (clubId, ridSel = '', q = '') => {
      const document = mkDocument({ 'cob-q': q, 'cob-reunion': ridSel, 'cob-carrera': '' });
      const api = await new AsyncFunction(
        'sb', 'CLUB_ID', 'document', 'toast', 'fmt', 'escapeHtml', 'propietariosMap', 'profesionales',
        `let cobCaballerizas = [], cobInscCarrera = {}, cobNroCarrera = {}, cobMapsScope = null;
         let cobReunPrueba = null, cobBenef = null, cobApoderados = [], cobLineas = [];
       let cobUltimoRecibo = null;   // ISSUE-056
         ${src}
         return { cobrosBuscar, cobrosDetalle, get lineas(){ return cobLineas; } };`
      )(sb, clubId, document, () => {}, n => String(n), v => String(v ?? ''), {}, profMap);
      return { api, document };
    };

    // ── parado en el club B ────────────────────────────────────────────────
    phase = 'front-B';
    const { api: apiB, document: docB } = await correr(CLUB_B);
    await apiB.cobrosBuscar();
    const htmlB = docB._n['cob-beneficiarios'].innerHTML;

    ok('5) parado en B, el buscador NO lista al beneficiario que sólo tiene plata en A',
       !htmlB.includes(BENEF_A), BENEF_A);
    ok('6) parado en B, tampoco entra el monto de la línea cruzada del club A',
       !htmlB.includes(String(M_A_CRUZADA)), `buscaba ${M_A_CRUZADA}`);
    ok('7) [caso inverso] parado en B, el beneficiario propio SÍ aparece',
       htmlB.includes(BENEF_B), BENEF_B);
    const cardB = htmlB.split('<div class="liq-card">').find(b => b.includes(BENEF_B)) || '';
    ok('8) [caso inverso] y su total es exactamente la plata de B, sin sumar la de A',
       cardB.includes(String(TOTAL_B)) && !cardB.includes(String(M_A_CRUZADA + TOTAL_B)),
       `esperado ${TOTAL_B} · card=${cardB.slice(0, 200)}`);

    await apiB.cobrosDetalle('profesional', BENEF_B);
    const detalleB = apiB.lineas;
    ok('9) cobrosDetalle parado en B trae SÓLO las líneas de B (el beneficiario tiene plata en los dos)',
       detalleB.length === 2 && detalleB.every(l => l.liquidaciones?.club_id === CLUB_B),
       JSON.stringify(detalleB.map(l => ({ m: l.monto_neto, c: l.liquidaciones?.club_id?.slice(0, 8) }))));
    ok('10) y la línea cruzada del club A no está entre las tildadas',
       !detalleB.some(l => l.id === detACruzada.id));

    // ── parado en el club A (la simetría: A tampoco ve a B) ────────────────
    phase = 'front-A';
    const { api: apiA, document: docA } = await correr(CLUB_A);
    await apiA.cobrosBuscar();
    const htmlA = docA._n['cob-beneficiarios'].innerHTML;
    ok('11) [caso inverso] parado en A, el beneficiario propio y su monto SÍ aparecen',
       htmlA.includes(BENEF_A) && htmlA.includes(String(M_A_PROPIA)));
    ok('12) parado en A, no entra la plata del club B',
       !htmlA.includes(String(M_B_1)) && !htmlA.includes(String(M_B_2)) && !htmlA.includes(String(TOTAL_B)));
    await apiA.cobrosDetalle('profesional', BENEF_B);
    ok('13) cobrosDetalle parado en A trae sólo la línea de A del beneficiario compartido',
       apiA.lineas.length === 1 && apiA.lineas[0].id === detACruzada.id,
       JSON.stringify(apiA.lineas.map(l => l.id)));

    // ── 5) ISSUE-057 — emitido_por ─────────────────────────────────────────
    // Sesión real por magiclink: signInWithPassword está gateado por Turnstile desde el 04/08/2026
    // (ver probe_rls_secretaria.mjs), /auth/v1/verify no.
    phase = 'usuario';
    const EMAIL = `probe.aisl.${RUN}@sgh.test`;
    const { data: au, error: eAu } = await sb.auth.admin.createUser({
      email: EMAIL, password: `Px-${RUN}-${Math.random().toString(36).slice(2)}`, email_confirm: true });
    if (eAu) throw new Error('createUser: ' + eAu.message);
    creados.authId = au.user.id;
    const { error: eIns } = await sb.from('usuarios').insert({
      email: EMAIL, nombre_completo: `Probe aislamiento ${RUN}`, club_id: CLUB_B,
      rol: 'secretario_carreras', activo: true, estado: 'activo', password_hash: '',
      auth_user_id: creados.authId });
    if (eIns) throw new Error('insert usuarios: ' + eIns.message);
    creados.usuarioEmail = EMAIL;
    const { data: uRow } = await sb.from('usuarios').select('id').eq('email', EMAIL).single();

    const { data: link, error: eLink } = await sb.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
    if (eLink) throw new Error('generateLink: ' + eLink.message);
    const cli = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: eOtp } = await cli.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
    if (eOtp) throw new Error('verifyOtp: ' + eOtp.message);

    phase = 'rpc-sesion';
    // el mismo cruce, ahora desde una sesión de club: tiene que seguir rechazado
    const { data: dCrossSes, error: eCrossSes } = await emitir(cli, CLUB_B, BENEF_B, [detACruzada.id]);
    ok('14) desde una sesión de club B, el cruce a líneas de A también se rechaza',
       !!eCrossSes && !dCrossSes, eCrossSes?.message || '¡EMITIÓ!');
    if (dCrossSes?.id) creados.recibos.push(dCrossSes.id);
    // y no puede emitir a nombre del club A aunque las líneas sean de A
    const { data: dClubAjeno, error: eClubAjeno } = await emitir(cli, CLUB_A, BENEF_B, [detACruzada.id]);
    ok('15) un usuario de B no puede emitir un recibo del club A',
       !!eClubAjeno && !dClubAjeno, eClubAjeno?.message || '¡EMITIÓ!');
    // Si un mutante lo dejó pasar, el recibo se registra para que el teardown lo limpie: un probe
    // que mide un agujero no puede dejar el agujero abierto en la base.
    if (dClubAjeno?.id) creados.recibos.push(dClubAjeno.id);

    // caso positivo con sesión: emitido_por queda cargado
    const { data: rSes, error: eSes } = await emitir(cli, CLUB_B, BENEF_B, [detB1.id]);
    const reciboSes = Array.isArray(rSes) ? rSes[0] : rSes;
    ok('16) [caso inverso] el club B SÍ puede cobrar su propia línea', !eSes && !!reciboSes?.id,
       eSes?.message || `recibo ${reciboSes?.numero_recibo}`);
    if (reciboSes?.id) creados.recibos.push(reciboSes.id);
    ok('17) ISSUE-057 — emitido_por = el usuario de la sesión (no NULL, no auth.uid())',
       reciboSes?.emitido_por === uRow?.id,
       `emitido_por=${reciboSes?.emitido_por} usuarios.id=${uRow?.id} auth.uid=${creados.authId}`);
    ok('18) el recibo salió con el club_id correcto', reciboSes?.club_id === CLUB_B, reciboSes?.club_id);

    // service_role: auth.uid() NULL → emitido_por NULL, sin romperse (protege los probes vivos)
    phase = 'rpc-service';
    const { data: rSvc, error: eSvc } = await emitir(sb, CLUB_B, BENEF_B, [detB2.id]);
    const reciboSvc = Array.isArray(rSvc) ? rSvc[0] : rSvc;
    ok('19) bajo service_role el RPC sigue emitiendo (los probes existentes no se rompen)',
       !eSvc && !!reciboSvc?.id, eSvc?.message || `recibo ${reciboSvc?.numero_recibo}`);
    if (reciboSvc?.id) creados.recibos.push(reciboSvc.id);
    ok('20) y emitido_por queda NULL cuando no hay usuario detrás (no inventa autor)',
       reciboSvc?.emitido_por === null, String(reciboSvc?.emitido_por));

  } catch (e) {
    ok(`EXCEPCIÓN en fase ${phase}`, false, e.message);
    console.error(e);
  } finally {
    // ── restore ────────────────────────────────────────────────────────────
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
    if (creados.usuarioEmail) {
      const { data: u } = await sb.from('usuarios').select('id').eq('email', creados.usuarioEmail).maybeSingle();
      if (u?.id) {
        await sb.from('auditoria').update({ usuario_id: null }).eq('usuario_id', u.id);
        await sb.from('recibos').update({ emitido_por: null }).eq('emitido_por', u.id);
      }
      const { error } = await sb.from('usuarios').delete().eq('email', creados.usuarioEmail);
      if (error) console.error('  ⚠️  usuarios: ' + error.message);
    }
    if (creados.authId) {
      const { error } = await sb.auth.admin.deleteUser(creados.authId);
      if (error) console.error('  ⚠️  auth.users: ' + error.message);
    }
    // las secuencias de recibo vuelven a donde estaban (los números que gastó el probe no son un
    // recibo real de nadie)
    for (const [c, n] of Object.entries(secuencias)) {
      if (n === null) await sb.from('club_secuencias').delete().eq('club_id', c).eq('tipo', 'recibo');
      else await sb.from('club_secuencias').update({ ultimo_numero: n }).eq('club_id', c).eq('tipo', 'recibo');
    }

    // verificación por ESTADO, no por conteo de filas (GOTCHA #77)
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
    ok('R3) no quedó ningún recibo del probe, en ningún club (foto sin filtro de club_id)',
       sobranR.length === 0, JSON.stringify(sobranR));
    const { data: sobranL } = await sb.from('liquidacion_detalle').select('id').ilike('concepto', `${TAG}%`);
    ok('R4) no quedaron líneas TEST ISSUE-059/060 en la base', (sobranL || []).length === 0,
       JSON.stringify(sobranL));
  }

  console.log('\n── Probe ISSUE-059/060/057 · aislamiento entre clubes en el circuito de cobro ──');
  console.log(`   html=${HTML_PATH}  rpc=${RPC_EMITIR}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
