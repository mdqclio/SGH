/**
 * ISSUE-065 — El DELETE de `recibos` está revocado para los roles de aplicación.
 *
 * Verifica que un recibo sólo se puede revertir con `anular_recibo`, no borrando la fila. Mientras
 * el DELETE esté abierto, todo el circuito de anulación —estado, motivo, autor, foto de las
 * líneas— es OPCIONAL: hay un camino más corto que no deja el rastro que el circuito existe para
 * dejar.
 *
 * DOS CAPAS, DOS ASSERTS. Es la lección de GOTCHA #86 aplicada de entrada:
 *   · DROP POLICY  → la RLS rechaza, pero EN SILENCIO: PostgREST devuelve 204 y 0 filas, porque la
 *                    policy filtra las filas y el DELETE no matchea ninguna. Observable: el recibo
 *                    SIGUE EXISTIENDO (D1).
 *   · REVOKE       → el rechazo pasa a ser un ERROR duro 42501. Observable: hay error (D1c).
 * Si sólo se assertea "el recibo sigue existiendo", la capa del GRANT no se prueba y un rollback
 * parcial pasa desapercibido.
 *
 * ⚠️ ANTES DE APLICAR LA MIGRACIÓN ESTE PROBE FALLA — y esa falla ES la demostración del agujero.
 * Corriéndolo contra la base sin revocar, `D1` se pone en rojo porque el borrado FUNCIONA. Eso hace
 * las veces de mutation test sin escribir una sola línea: el estado actual de la base es,
 * literalmente, "la revocación neutralizada". Ver la sección MUTACIÓN al final del archivo.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_recibos_delete_revocado.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { snapshotLineas, restaurarLineas, diffLineas, describir, recibosDesde }
  from './lib/estado_lineas.mjs';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }
// Publishable key: la misma que sirve el front. Es la que convierte una sesión en rol
// `authenticated`, que es exactamente el rol bajo prueba.
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';

const CLUB_B = 'a6da7e40-1515-45dc-8933-4eef33ce937a'; // Mi Club Hípico — sandbox
const CLUB_A = '0649e9c5-9e87-4aad-842f-101458e6b33c'; // Dolores — sólo para restaurar su secuencia
const TAG = 'TEST ISSUE-065';

const sb = createClient(SUPABASE_URL, KEY, { auth:{ autoRefreshToken:false, persistSession:false } });

const results = [];
const ok = (t, c, n='') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
const RUN = Date.now().toString(36);
const T0 = new Date(Date.now() - 5000).toISOString();

(async () => {
  const creados = { liqs: [], dets: [], recibos: [], usuarios: [], authIds: [] };
  let antesB = {}, REUNION_B = null;
  const secuencias = {};
  let phase = 'init';
  try {
    // Limpieza preflight (GOTCHA #83): un SIGKILL no corre el finally.
    phase = 'preflight';
    const { data: restos } = await sb.from('liquidacion_detalle').select('id,liquidacion_id').ilike('concepto', `${TAG}%`);
    if (restos?.length){
      console.log(`[preflight] ${restos.length} línea(s) de una corrida cortada — se limpian`);
      const { data: recV } = await sb.from('recibos').select('id').ilike('cobrador_nombre', `${TAG}%`);
      if (recV?.length){
        await sb.from('liquidacion_detalle').update({ recibo_id:null, pagado_at:null }).in('recibo_id', recV.map(r=>r.id));
        await sb.from('recibos').delete().in('id', recV.map(r=>r.id));
      }
      await sb.from('liquidacion_detalle').delete().in('id', restos.map(r=>r.id));
      await sb.from('liquidaciones').delete().in('id', [...new Set(restos.map(r=>r.liquidacion_id))]);
    }

    phase = 'setup';
    const { data: rB } = await sb.from('reuniones').select('id').eq('club_id', CLUB_B).limit(1);
    REUNION_B = rB?.[0]?.id;
    if (!REUNION_B) throw new Error('el club B no tiene reuniones');
    const { data: profsB } = await sb.from('profesionales')
      .select('id,nombre,apellido').eq('club_id', CLUB_B).eq('activo', true).limit(10);
    if (!profsB?.length) throw new Error('faltan profesionales activos en el club B');
    const BENEF = profsB[0].id;

    antesB = await snapshotLineas(sb, REUNION_B);
    for (const c of [CLUB_A, CLUB_B]) {
      const { data: seq } = await sb.from('club_secuencias').select('ultimo_numero').eq('club_id', c).eq('tipo','recibo').maybeSingle();
      secuencias[c] = seq ? seq.ultimo_numero : null;
    }

    // ── sesión authenticated real ─────────────────────────────────────────────
    // signInWithPassword está gateado por Turnstile desde el 04/08/2026; magiclink no.
    phase = 'sesion';
    const EMAIL = `probe.065.${RUN}@sgh.test`;
    const { data: au, error: eAu } = await sb.auth.admin.createUser({ email: EMAIL, email_confirm: true });
    if (eAu) throw new Error('createUser: ' + eAu.message);
    creados.authIds.push(au.user.id);
    const { error: eIns } = await sb.from('usuarios').insert({
      email: EMAIL, nombre_completo: `Probe 065 ${RUN}`, club_id: CLUB_B,
      rol: 'secretario_carreras', activo: true, estado: 'activo', password_hash: '',
      auth_user_id: au.user.id });
    if (eIns) throw new Error('insert usuarios: ' + eIns.message);
    creados.usuarios.push(EMAIL);
    const { data: link, error: eLink } = await sb.auth.admin.generateLink({ type:'magiclink', email: EMAIL });
    if (eLink) throw new Error('generateLink: ' + eLink.message);
    const cli = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth:{ autoRefreshToken:false, persistSession:false } });
    const { error: eOtp } = await cli.auth.verifyOtp({ token_hash: link.properties.hashed_token, type:'magiclink' });
    if (eOtp) throw new Error('verifyOtp: ' + eOtp.message);

    // ── fixtures ──────────────────────────────────────────────────────────────
    phase = 'fixtures';
    const plantar = async (concepto, bruto) => {
      const { data: liq, error: eL } = await sb.from('liquidaciones')
        .insert({ club_id: CLUB_B, reunion_id: REUNION_B, profesional_id: BENEF,
                  estado:'borrador', total_bruto:0, total_descuentos:0 }).select().single();
      if (eL) throw new Error('crear liq: ' + eL.message);
      creados.liqs.push(liq.id);
      const { data: det, error: eD } = await sb.from('liquidacion_detalle')
        .insert({ liquidacion_id: liq.id, beneficiario_tipo:'profesional', beneficiario_id: BENEF,
                  reunion_id: REUNION_B, concepto, monto_bruto: bruto, monto_descuento: 0,
                  concepto_tipo:'premio', estado_linea:'impago' }).select().single();
      if (eD) throw new Error('crear detalle: ' + eD.message);
      creados.dets.push(det.id);
      return det;
    };
    const emitir = async (cliente, ids) => {
      const r = await cliente.rpc('emitir_recibo', {
        p_club_id: CLUB_B, p_beneficiario_tipo:'profesional', p_beneficiario_id: BENEF,
        p_linea_ids: ids, p_forma_pago:'efectivo',
        p_cobrador_nombre: `${TAG} ${RUN}`, p_cobrador_documento:'00000000', p_comprobante_url:null });
      if (r.error) throw new Error('emitir_recibo: ' + r.error.message);
      const rec = Array.isArray(r.data) ? r.data[0] : r.data;
      creados.recibos.push(rec.id);
      return rec;
    };
    const existe = async id => !!(await sb.from('recibos').select('id').eq('id', id).maybeSingle()).data;

    // ── D · el usuario authenticated NO puede borrar ──────────────────────────
    phase = 'D';
    const dA = await plantar(`${TAG} a ${RUN}`, 12345);
    const recA = await emitir(cli, [dA.id]);

    // Un recibo CON líneas no se borra ni con permisos, porque la FK es NO ACTION. Para probar el
    // permiso hay que soltar las líneas primero — que es exactamente el revert manual del #4, y la
    // razón por la que la FK es un badén y no un guard. Se sueltan con service_role para que lo
    // único bajo prueba sea el DELETE.
    await sb.from('liquidacion_detalle').update({ recibo_id:null, pagado_at:null, estado_linea:'impago' }).eq('id', dA.id);

    const del = await cli.from('recibos').delete().eq('id', recA.id);
    const sigueA = await existe(recA.id);

    ok('D1) un usuario authenticated NO puede borrar un recibo: la fila sigue existiendo',
       sigueA === true,
       sigueA ? 'el recibo sobrevivió' : '¡BORRADO! el DELETE está abierto — la migración no está aplicada');
    ok('D1b) y el borrado no reporta filas afectadas',
       (del.data == null || (Array.isArray(del.data) && del.data.length === 0)),
       JSON.stringify(del.data));
    // Capa del GRANT. Con la policy dropeada pero el GRANT vivo, esto sería `null` y el rechazo
    // silencioso; el REVOKE es lo que lo vuelve ruidoso. Assert propio POR CAPA (GOTCHA #86).
    ok('D1c) y el rechazo es un ERROR de permisos (42501), no un silencioso 0 filas',
       !!del.error && (del.error.code === '42501' || /permission denied/i.test(del.error.message||'')),
       del.error ? `${del.error.code} ${del.error.message}` : 'sin error — el GRANT sigue vivo');

    // Un ANULADO es el caso más expuesto: no tiene líneas apuntándolo, así que la FK no lo protege
    // ni de casualidad. Es el registro que creamos para preservar el rastro.
    const dB = await plantar(`${TAG} b ${RUN}`, 54321);
    const recB = await emitir(cli, [dB.id]);
    const { error: eAnu } = await cli.rpc('anular_recibo', { p_recibo_id: recB.id, p_motivo: `${TAG} — anulado ${RUN}` });
    if (eAnu) throw new Error('anular_recibo: ' + eAnu.message);
    const delAnu = await cli.from('recibos').delete().eq('id', recB.id);
    ok('D1d) tampoco se puede borrar un recibo ANULADO, que es el que la FK no protege',
       (await existe(recB.id)) === true,
       delAnu.error ? `${delAnu.error.code}` : (await existe(recB.id) ? 'sobrevivió' : '¡BORRADO!'));

    // ── D2 · service_role SÍ puede borrar ─────────────────────────────────────
    // No es un detalle: los 8 probes del repo que borran recibos en su cleanup dependen de esto.
    // Si el REVOKE alcanzara a service_role, se romperían todos y el restore dejaría basura.
    phase = 'D2';
    const dC = await plantar(`${TAG} c ${RUN}`, 999);
    const recC = await emitir(cli, [dC.id]);
    await sb.from('liquidacion_detalle').update({ recibo_id:null, pagado_at:null, estado_linea:'impago' }).eq('id', dC.id);
    const delSvc = await sb.from('recibos').delete().eq('id', recC.id);
    const sigueC = await existe(recC.id);
    ok('D2) service_role SÍ puede borrar — los probes siguen pudiendo limpiar sus fixtures',
       !delSvc.error && sigueC === false,
       delSvc.error ? `${delSvc.error.code} ${delSvc.error.message}` : 'borrado OK');
    if (sigueC === false) creados.recibos = creados.recibos.filter(id => id !== recC.id);

    // ── A · anular_recibo sigue funcionando igual ─────────────────────────────
    phase = 'A';
    const dD = await plantar(`${TAG} d ${RUN}`, 77777);
    const recD = await emitir(cli, [dD.id]);
    const MOTIVO = `${TAG} — sigue andando ${RUN}`;
    const { data: anu, error: eAnuD } = await cli.rpc('anular_recibo', { p_recibo_id: recD.id, p_motivo: MOTIVO });
    ok('A1) anular_recibo sigue funcionando desde una sesión authenticated', !eAnuD,
       eAnuD?.message || 'ok');
    const { data: recDDB } = await sb.from('recibos').select('*').eq('id', recD.id).maybeSingle();
    ok('A1b) y el recibo queda ANULADO, no borrado — con motivo y fecha',
       recDDB?.estado === 'anulado' && recDDB?.motivo_anulacion === MOTIVO && !!recDDB?.anulado_at,
       `estado=${recDDB?.estado} motivo=${recDDB?.motivo_anulacion ? 'sí' : 'no'}`);
    const foto = recDDB?.lineas_anuladas;
    ok('A1c) y la FOTO de las líneas (v2) se sigue guardando',
       Array.isArray(foto) && foto.length === 1 && typeof foto[0] === 'object' && foto[0]?.id === dD.id
       && Number(foto[0]?.monto_neto) === Number(dD.monto_neto),
       `${Array.isArray(foto) ? foto.length : 'n/a'} línea(s) en la foto`);
    const { data: lineaD } = await sb.from('liquidacion_detalle').select('estado_linea,recibo_id').eq('id', dD.id).maybeSingle();
    ok('A1d) y la línea volvió a quedar pendiente de cobro',
       lineaD?.recibo_id === null && lineaD?.estado_linea === 'impago',
       `estado=${lineaD?.estado_linea} recibo_id=${lineaD?.recibo_id}`);
    ok('A2) el número anulado NO se reutiliza: la secuencia no volvió atrás',
       (await sb.from('club_secuencias').select('ultimo_numero').eq('club_id', CLUB_B).eq('tipo','recibo').maybeSingle())
         .data?.ultimo_numero >= recD.numero_recibo,
       `numero=${recD.numero_recibo}`);

    // ── G · el estado que quedó, medido ──────────────────────────────────────
    phase = 'Gfinal';
    ok('G1) el circuito completo queda sin atajo: borrar rechazado, anular vivo',
       sigueA === true && !eAnuD, `borrar=${sigueA ? 'rechazado' : 'PERMITIDO'} anular=${eAnuD ? 'roto' : 'ok'}`);

  } catch (e) {
    ok(`X1) el probe corrió sin excepciones (fase: ${phase})`, false, e.message);
  } finally {
    // ── restore ───────────────────────────────────────────────────────────────
    if (creados.recibos.length) {
      await sb.from('liquidacion_detalle').update({ recibo_id: null, pagado_at: null }).in('recibo_id', creados.recibos);
      await sb.from('recibos').delete().in('id', creados.recibos);
    }
    if (creados.dets.length) await sb.from('liquidacion_detalle').delete().in('id', creados.dets);
    if (creados.liqs.length) await sb.from('liquidaciones').delete().in('id', creados.liqs);
    // El usuario del probe no se puede borrar de una: `auditoria_usuario_id_fkey`,
    // `recibos_emitido_por_fkey` y `recibos_anulado_por_fkey` son NO ACTION, así que hay que soltar
    // las referencias primero. Sin esto el DELETE falla y —si nadie mira el error— queda un usuario
    // de prueba vivo en producción. Mismo patrón que probe_anular_recibo.mjs.
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
    const { data: sobranU } = await sb.from('usuarios').select('id').ilike('email', 'probe.065.%@sgh.test');
    ok('R5) no quedó ningún usuario del probe', (sobranU||[]).length === 0, JSON.stringify(sobranU));
    const { data: seqFin } = await sb.from('club_secuencias').select('club_id,ultimo_numero').eq('tipo','recibo').in('club_id',[CLUB_A, CLUB_B]);
    ok('R6) club_secuencias de los dos clubes devuelto a donde estaba',
       (seqFin||[]).every(r => secuencias[r.club_id] === r.ultimo_numero),
       (seqFin||[]).map(r => `${r.club_id.slice(0,8)}: ${secuencias[r.club_id]}→${r.ultimo_numero}`).join(' · '));
  }

  console.log('\n── Probe ISSUE-065 · el DELETE de recibos está revocado ──');
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();

/*
 * ═══════════════════════════════ MUTACIÓN ═══════════════════════════════
 * No hay runner de mutantes acá, y a propósito: el cambio bajo prueba es SQL de permisos, no
 * código JS, así que no hay archivo que copiar a un tmpdir y mutar. El equivalente exacto de
 * "neutralizar la revocación" es correr el probe contra una base donde la revocación NO está
 * aplicada — y eso es gratis de dos maneras:
 *
 *   1. ANTES de aplicar la migración. Es el estado actual de la base al escribir esto. `D1` tiene
 *      que ponerse en ROJO ("¡BORRADO! el DELETE está abierto"). Si diera verde con el agujero
 *      abierto, el assert no probaría nada.
 *
 *   2. DESPUÉS de aplicar, corriendo el rollback y volviendo a correr el probe:
 *        psql < migrations/rollback_revocar_recibos_delete.sql
 *        node tests/probe_recibos_delete_revocado.mjs      # D1 y D1c en rojo
 *        psql < migrations/revocar_recibos_delete.sql
 *        node tests/probe_recibos_delete_revocado.mjs      # todo verde
 *
 * Y las dos capas se pueden mutar por separado, que es lo que justifica tener D1 y D1c:
 *   · sólo `GRANT DELETE ... TO authenticated` (sin recrear la policy) → D1 verde, **D1c rojo**.
 *     La RLS sigue tapando, pero el rechazo vuelve a ser silencioso.
 *   · sólo `CREATE POLICY recibos_delete ...` (sin el GRANT) → D1 rojo. El borrado funciona.
 * Si D1c no existiera, el primer caso pasaría desapercibido: media revocación leyéndose como
 * revocación completa.
 */
