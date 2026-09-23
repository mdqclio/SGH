/**
 * Probe — guard de staff en las seis RPC (+ rpc_cambiar_monta).
 *
 * Cierra el vector medido el 2026-09-22 (`docs/diagnosticos/2026-09-22_paso3-vector-portal.md`):
 * un usuario del PORTAL entraba al cuerpo de las seis, y `aplicar_resultado`,
 * `desoficializar_carrera` y `fn_siguiente_recibo` no tenían guard de ningún tipo.
 *
 * Matriz: cada función × 7 perfiles, SIEMPRE con argumentos VÁLIDOS de la reunión 9999
 * (nunca UUID inexistentes: acá se mide el guard, no el lookup — lección del paso 3, donde
 * rpc_cambiar_monta contestaba "la inscripción no existe" y no el 42501).
 *
 *   perfil                         esperado
 *   service_role                   pasa
 *   super_admin (club MCH)         pasa (aunque el objeto sea de Dolores)
 *   secretario_carreras (Dolores)  pasa
 *   operador (Dolores)             pasa
 *   operador de OTRO club (MCH)    42501 de club
 *   portal (profesional, Dolores)  42501 del guard 0
 *   authenticated SIN fila         42501 del guard 0
 *   anon                           42501 (ACL o guard)
 *
 * MODO POR FUNCIÓN — después de cada apply_migration se corre sólo la de esa función:
 *   node tests/probe_guard_staff_rpcs.mjs --fn liberar_linea
 * Sin --fn corre las siete. Una función todavía no aplicada da rojo a propósito: sus
 * asserts de portal/sin-fila fallan porque el guard no está. El resumen las lista aparte.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_guard_staff_rpcs.mjs [--fn <nombre>] [--mutantes[=M1,M2]]
 *
 * Sandbox local (tests/local/): SUPABASE_URL + SUPABASE_SECRET_KEY + LOCAL_JWT_SECRET
 * (firma los JWT de los perfiles) + PSQL_CMD (aplica los mutantes sobre la gemela).
 *
 * ESCRIBE en la 9999 y restaura por estado (GOTCHA #77). Recibos sin filtro de club (#76).
 */
process.env.TZ = 'America/Argentina/Buenos_Aires';

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const JWT_SECRET = process.env.LOCAL_JWT_SECRET || null;
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const CLUB_AJENO = 'a6da7e40-1515-45dc-8933-4eef33ce937a';   // Mi Club Hípico
const RID = 'a0000000-0000-0000-0000-000000009999';
const RUN = Date.now().toString(36);
const SUFIJO = process.env.RPC_SUFIJO || '';   // '_mut' para los mutantes

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

let okN = 0, failN = 0; const fallas = [];
const ok = (label, cond, nota = '') => {
  if (cond) { okN++; console.log(`✅ ${label}${nota ? `\n   → ${nota}` : ''}`); }
  else { failN++; fallas.push(label); console.log(`❌ ${label}${nota ? `\n   → ${nota}` : ''}`); }
  return cond;
};
const q = async (p, ctx) => { const { data, error } = await p; if (error) throw new Error(`${ctx}: ${error.message}`); return data; };
const msg = e => (e?.message || '').replace(/\s+/g, ' ');
const es42501 = e => !!e && (e.code === '42501' || /permission denied/i.test(msg(e)));

// ── perfiles ─────────────────────────────────────────────────────────────────
const creados = [];
function firmarJWT(claims) {
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b({ alg: 'HS256', typ: 'JWT' });
  const pl = b({ iss: 'sgh-local', exp: Math.floor(Date.now() / 1000) + 3600, ...claims });
  return `${h}.${pl}.${createHmac('sha256', JWT_SECRET).update(`${h}.${pl}`).digest('base64url')}`;
}
async function cliente({ rol, club, conFila = true, etiqueta }) {
  if (rol === 'anon') {
    return JWT_SECRET
      ? createClient(SUPABASE_URL, firmarJWT({ role: 'anon' }), { auth: { persistSession: false } })
      : createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  const email = `probe.guard.${etiqueta}.${RUN}@sgh.test`;
  let authId;
  if (JWT_SECRET) authId = randomUUID();
  else {
    const { data: au, error } = await sb.auth.admin.createUser({ email, password: `Px-${RUN}-${Math.random().toString(36).slice(2)}`, email_confirm: true });
    if (error) throw new Error('createUser: ' + error.message);
    authId = au.user.id;
  }
  creados.push({ email, authId });
  if (conFila) {
    const { error } = await sb.from('usuarios').insert({ email, nombre_completo: `Probe guard ${etiqueta}`, club_id: club, rol, activo: true, estado: 'activo', password_hash: '', auth_user_id: authId });
    if (error) throw new Error('insert usuarios: ' + error.message);
  }
  if (JWT_SECRET) return createClient(SUPABASE_URL, firmarJWT({ role: 'authenticated', sub: authId }), { auth: { persistSession: false } });
  const { data: link, error: eLink } = await sb.auth.admin.generateLink({ type: 'magiclink', email });
  if (eLink) throw new Error('generateLink: ' + eLink.message);
  const cli = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eOtp } = await cli.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (eOtp) throw new Error('verifyOtp: ' + eOtp.message);
  return cli;
}
async function limpiarPerfiles() {
  // `auditoria.usuario_id` es FK a usuarios(id) SIN ON DELETE: los perfiles que PASAN dejan
  // filas de auditoría (el UPDATE de resultados se audita) y el DELETE del usuario rebota.
  // Sin borrar esas filas primero, el teardown falla EN SILENCIO y quedan usuarios de prueba
  // en producción. Las filas que se borran son las que generó este probe, en la 9999.
  const errores = [];
  for (const u of creados) {
    const fila = await sb.from('usuarios').select('id').eq('email', u.email).maybeSingle();
    if (fila.data?.id) {
      const { error: eAud } = await sb.from('auditoria').delete().eq('usuario_id', fila.data.id);
      if (eAud) errores.push(`auditoria ${u.email}: ${eAud.message}`);
    }
    const { error } = await sb.from('usuarios').delete().eq('email', u.email);
    if (error) errores.push(`usuarios ${u.email}: ${error.message}`);
    if (!JWT_SECRET) { try { await sb.auth.admin.deleteUser(u.authId); } catch (e) { errores.push(`auth ${u.email}: ${e.message}`); } }
  }
  if (errores.length) console.log(`⚠ teardown con errores:\n   ${errores.join('\n   ')}`);
}

// ── snapshot / restore de la 9999 ────────────────────────────────────────────
const GEN = { liquidaciones: ['total_neto'], liquidacion_detalle: ['monto_neto'] };
const sinGen = (t, r) => Object.fromEntries(Object.entries(r).filter(([k]) => !GEN[t].includes(k)));
let CAR_IDS = [];
async function foto() {
  const [hdrs, lineas, ress, sec] = await Promise.all([
    q(sb.from('liquidaciones').select('*').eq('reunion_id', RID).order('id'), 'foto hdrs'),
    q(sb.from('liquidacion_detalle').select('*').eq('reunion_id', RID).order('id'), 'foto lineas'),
    q(sb.from('resultados').select('id,carrera_id,estado,updated_at,tiempo_ganador,estado_pista,favorito_mandil,incidentes').in('carrera_id', CAR_IDS).order('id'), 'foto res'),
    q(sb.from('club_secuencias').select('club_id,tipo,ultimo_numero').eq('club_id', CLUB), 'foto sec'),
  ]);
  const resIds = ress.map(r => r.id);
  const pos = resIds.length ? await q(sb.from('resultado_posiciones').select('*').in('resultado_id', resIds).order('id'), 'foto pos') : [];
  return { hdrs: hdrs.map(r => sinGen('liquidaciones', r)), lineas: lineas.map(r => sinGen('liquidacion_detalle', r)), ress, pos, sec };
}
const canon = o => JSON.stringify(o, Object.keys(o).sort());
// `resultados.updated_at` queda FUERA del diff: lo bumpea el trigger en cualquier UPDATE,
// incluido el del propio restore, y no hay forma de reponerlo. Lo que se compara es el
// estado con significado (estado, tiempo, pista, favorito, incidentes) — GOTCHA #77.
const IGNORAR = { ress: ['updated_at'] };
function diffFoto(a, b) {
  const difs = [];
  for (const k of ['hdrs', 'lineas', 'ress', 'pos']) {
    const omit = IGNORAR[k] || [];
    const A = new Map(a[k].map(r => [r.id, r])), B = new Map(b[k].map(r => [r.id, r]));
    for (const [id, r] of A) {
      if (!B.has(id)) difs.push(`${k} falta ${id.slice(0, 8)}`);
      else {
        const cols = Object.keys(r).filter(c => !omit.includes(c) && canon({ v: r[c] }) !== canon({ v: B.get(id)[c] }));
        if (cols.length) difs.push(`${k} cambió ${id.slice(0, 8)}: ${cols.join(',')}`);
      }
    }
    for (const id of B.keys()) if (!A.has(id)) difs.push(`${k} sobra ${id.slice(0, 8)}`);
  }
  const sa = a.sec[0]?.ultimo_numero, sbn = b.sec[0]?.ultimo_numero;
  if (sa !== sbn) difs.push(`club_secuencias ${sa} → ${sbn}`);
  return difs;
}
async function restaurar(base) {
  // Sólo se escribe lo que REALMENTE cambió: cualquier UPDATE sobre `resultados` dispara
  // `resultados_set_updated_at` y bumpea updated_at, que después no se puede reponer.
  const ressAhora = await q(sb.from('resultados').select('id,estado,tiempo_ganador,estado_pista,favorito_mandil,incidentes').in('carrera_id', CAR_IDS), 'restore res read');
  for (const r of base.ress) {
    const cur = ressAhora.find(x => x.id === r.id);
    if (!cur) continue;
    const difiere = ['estado', 'tiempo_ganador', 'estado_pista', 'favorito_mandil', 'incidentes'].some(c => String(cur[c]) !== String(r[c]));
    if (difiere) await q(sb.from('resultados').update({ estado: r.estado, tiempo_ganador: r.tiempo_ganador, estado_pista: r.estado_pista, favorito_mandil: r.favorito_mandil, incidentes: r.incidentes }).eq('id', r.id), 'restore res');
  }
  const posAhora = await q(sb.from('resultado_posiciones').select('id').in('resultado_id', base.ress.map(r => r.id)), 'restore pos read');
  const idsBase = new Set(base.pos.map(p => p.id));
  const sobran = posAhora.filter(p => !idsBase.has(p.id)).map(p => p.id);
  if (sobran.length) await q(sb.from('resultado_posiciones').delete().in('id', sobran), 'restore pos del');
  const faltan = base.pos.filter(p => !posAhora.some(x => x.id === p.id));
  if (faltan.length) await q(sb.from('resultado_posiciones').insert(faltan), 'restore pos ins');
  const linAhora = await q(sb.from('liquidacion_detalle').select('id,estado_linea,recibo_id,pagado_at').eq('reunion_id', RID), 'restore lin read');
  for (const b of base.lineas) {
    const cur = linAhora.find(x => x.id === b.id);
    if (cur && (cur.estado_linea !== b.estado_linea || cur.recibo_id !== b.recibo_id)) {
      await q(sb.from('liquidacion_detalle').update({ estado_linea: b.estado_linea, recibo_id: b.recibo_id, pagado_at: b.pagado_at }).eq('id', b.id), 'restore lin');
    }
  }
  const recProbe = await q(sb.from('recibos').select('id').ilike('cobrador_nombre', 'PROBE-GUARD%'), 'rest rec ids');
  if (recProbe.length) {
    await q(sb.from('liquidacion_detalle').update({ estado_linea: 'impago', recibo_id: null, pagado_at: null }).in('recibo_id', recProbe.map(r => r.id)), 'rest lin del recibo');
    await sb.from('recibos').delete().in('id', recProbe.map(r => r.id));
  }
  if (base.sec[0]) await q(sb.from('club_secuencias').update({ ultimo_numero: base.sec[0].ultimo_numero }).eq('club_id', CLUB).eq('tipo', 'recibo'), 'restore sec');
}

// ══════════════════════════ MUTANTES ══════════════════════════
const MUTANTES = [
  { id: 'M1', fn: 'emitir_recibo',          mata: ['G-emitir_recibo-portal'],          desc: 'emitir_recibo sin guard 0' },
  { id: 'M2', fn: 'anular_recibo',          mata: ['G-anular_recibo-portal'],          desc: 'anular_recibo sin guard 0' },
  { id: 'M3', fn: 'liberar_linea',          mata: ['G-liberar_linea-portal'],          desc: 'liberar_linea sin guard 0' },
  { id: 'M4', fn: 'aplicar_resultado',      mata: ['G-aplicar_resultado-portal'],      desc: 'aplicar_resultado sin guard 0' },
  { id: 'M5', fn: 'desoficializar_carrera', mata: ['G-desoficializar_carrera-portal'], desc: 'desoficializar_carrera sin guard 0' },
  { id: 'M6', fn: 'fn_siguiente_recibo',    mata: ['G-fn_siguiente_recibo-portal'],    desc: 'fn_siguiente_recibo sin guard 0' },
  { id: 'M7', fn: 'liberar_linea',          mata: ['G-liberar_linea-sinfila'],         desc: 'guard de club vuelto al patrón "club NULL pasa"',
    clubViejo: true,
    equivalente: 'con el guard 0 puesto, el patrón viejo es inalcanzable: `usuarios.club_id` es NOT NULL, '
               + 'así que TODO el que pasa fn_is_staff() tiene club; y el que no tiene fila en usuarios ya '
               + 'quedó afuera en el guard 0. Ningún test puede distinguir las dos versiones mientras el '
               + 'guard 0 exista — matarlo pediría sacar el guard 0, que es optimizar la métrica. Si alguna '
               + 'vez MUERE, es que el guard 0 se debilitó.' },
  { id: 'M8', fn: 'liberar_linea',          mata: ['G-liberar_linea-operador'],        desc: 'guard 0 sin fn_is_staff() → el operador queda afuera (sobre-cerrar)',
    sinStaff: true },
];

// ══════════════════════════ CASOS ══════════════════════════
// Cada función: cómo llamarla con argumentos VÁLIDOS, y qué verificar cuando el perfil pasa.
function casos(ctx) {
  const n = f => `${f}${SUFIJO}`;
  return {
    fn_siguiente_recibo: {
      args: () => ({ p_club_id: CLUB }),
      efecto: async (antes) => {
        const s = await q(sb.from('club_secuencias').select('ultimo_numero').eq('club_id', CLUB).eq('tipo', 'recibo').single(), 'sec');
        return s.ultimo_numero > antes;
      },
      estadoPrevio: async () => (await q(sb.from('club_secuencias').select('ultimo_numero').eq('club_id', CLUB).eq('tipo', 'recibo').single(), 'sec')).ultimo_numero,
    },
    liberar_linea: {
      args: () => ({ p_linea_id: ctx.lineaRetenida }),
      efecto: async () => (await q(sb.from('liquidacion_detalle').select('estado_linea').eq('id', ctx.lineaRetenida).single(), 'lin')).estado_linea === 'impago',
      restaurar: async () => { await q(sb.from('liquidacion_detalle').update({ estado_linea: 'retenido' }).eq('id', ctx.lineaRetenida), 'rest lin'); },
      estadoPrevio: async () => (await q(sb.from('liquidacion_detalle').select('estado_linea').eq('id', ctx.lineaRetenida).single(), 'lin')).estado_linea,
    },
    desoficializar_carrera: {
      args: () => ({ p_carrera_id: ctx.carreraLibre }),
      efecto: async () => (await q(sb.from('resultados').select('estado').eq('carrera_id', ctx.carreraLibre).single(), 'res')).estado === 'provisional',
      restaurar: async () => { await q(sb.from('resultados').update({ estado: 'oficial' }).eq('carrera_id', ctx.carreraLibre), 'rest res'); },
      estadoPrevio: async () => (await q(sb.from('resultados').select('estado').eq('carrera_id', ctx.carreraLibre).single(), 'res')).estado,
    },
    aplicar_resultado: {
      args: () => ({
        p_resultado_id: ctx.resultadoLibre.id, p_expected_updated_at: null,
        p_carrera_id: ctx.carreraLibre, p_estado: 'oficial',
        // `resultados.estado_pista` tiene CHECK (seca|humeda|fangosa|pesada): el marcador del
        // probe es un valor VÁLIDO distinto del actual, no una etiqueta inventada.
        p_estado_pista: ctx.pistaMarcador, p_tiempo_ganador: ctx.resultadoLibre.tiempo_ganador,
        p_incidentes: ctx.resultadoLibre.incidentes, p_favorito_mandil: ctx.resultadoLibre.favorito_mandil,
        p_redistribucion_legs: {}, p_posiciones: ctx.posicionesLibres, p_apuestas: [],
      }),
      efecto: async () => (await q(sb.from('resultados').select('estado_pista').eq('id', ctx.resultadoLibre.id).single(), 'res')).estado_pista === ctx.pistaMarcador,
      restaurar: async () => { await q(sb.from('resultados').update({ estado_pista: ctx.resultadoLibre.estado_pista }).eq('id', ctx.resultadoLibre.id), 'rest res'); },
      estadoPrevio: async () => (await q(sb.from('resultados').select('estado_pista').eq('id', ctx.resultadoLibre.id).single(), 'res')).estado_pista,
    },
    emitir_recibo: {
      args: () => ({
        p_club_id: CLUB, p_beneficiario_tipo: ctx.lineaImpaga.beneficiario_tipo,
        p_beneficiario_id: ctx.lineaImpaga.beneficiario_id, p_linea_ids: [ctx.lineaImpaga.id],
        p_forma_pago: 'efectivo', p_cobrador_nombre: `PROBE-GUARD ${RUN}`, p_cobrador_documento: '0',
      }),
      efecto: async () => (await q(sb.from('liquidacion_detalle').select('estado_linea').eq('id', ctx.lineaImpaga.id).single(), 'lin')).estado_linea === 'pagado',
      restaurar: async () => {
        await q(sb.from('liquidacion_detalle').update({ estado_linea: 'impago', recibo_id: null, pagado_at: null }).eq('id', ctx.lineaImpaga.id), 'rest lin');
        await sb.from('recibos').delete().ilike('cobrador_nombre', 'PROBE-GUARD%');
      },
      estadoPrevio: async () => (await q(sb.from('liquidacion_detalle').select('estado_linea').eq('id', ctx.lineaImpaga.id).single(), 'lin')).estado_linea,
    },
    anular_recibo: {
      args: () => ({ p_recibo_id: ctx.reciboPropio, p_motivo: `PROBE-GUARD ${RUN}` }),
      efecto: async () => (await q(sb.from('recibos').select('estado').eq('id', ctx.reciboPropio).single(), 'rec')).estado === 'anulado',
      restaurar: async () => {
        await q(sb.from('recibos').update({ estado: 'emitido', anulado_at: null, anulado_por: null, motivo_anulacion: null, lineas_anuladas: null }).eq('id', ctx.reciboPropio), 'rest rec');
        await q(sb.from('liquidacion_detalle').update({ estado_linea: 'pagado', recibo_id: ctx.reciboPropio, pagado_at: ctx.pagadoAtOriginal }).eq('id', ctx.lineaDelRecibo), 'rest lin');
      },
      estadoPrevio: async () => (await q(sb.from('recibos').select('estado').eq('id', ctx.reciboPropio).single(), 'rec')).estado,
    },
    rpc_cambiar_monta: {
      args: () => ({ p_inscripcion_id: ctx.inscripcion.id, p_jockey_id: ctx.inscripcion.jockey_titular_id }),
      efecto: async () => true,   // mismo jockey → cambio:false, no escribe: alcanza con que no dé 42501
      estadoPrevio: async () => (await q(sb.from('inscripciones').select('jockey_titular_id').eq('id', ctx.inscripcion.id).single(), 'insc')).jockey_titular_id,
    },
  };
}

const FNS = ['fn_siguiente_recibo', 'liberar_linea', 'desoficializar_carrera', 'aplicar_resultado', 'anular_recibo', 'emitir_recibo', 'rpc_cambiar_monta'];
const argFn = process.argv.find(a => a.startsWith('--fn'));
const SOLO = argFn ? (argFn.includes('=') ? argFn.split('=')[1] : process.argv[process.argv.indexOf(argFn) + 1]) : null;
if (SOLO && !FNS.includes(SOLO)) { console.error(`--fn desconocida: ${SOLO}. Opciones: ${FNS.join(', ')}`); process.exit(2); }
const AL_MENOS = SOLO ? [SOLO] : FNS;

// ══════════════════════════ RUNNER DE MUTANTES ══════════════════════════
const mutArg = process.argv.find(a => a.startsWith('--mutantes'));
if (mutArg) {
  const pedidos = mutArg.includes('=') ? mutArg.split('=')[1].split(',') : null;
  const tanda = MUTANTES.filter(m => (!pedidos || pedidos.includes(m.id)) && (!SOLO || m.fn === SOLO));
  const PSQL = process.env.PSQL_CMD;
  const dir = mkdtempSync(join(tmpdir(), 'mut-guard-'));
  const aplicar = sql => execSync(PSQL, { input: sql + "\nNOTIFY pgrst, 'reload schema';\nSELECT pg_sleep(0.6);\n", stdio: ['pipe', 'ignore', 'pipe'] });
  console.log(`\n═══ MUTATION TESTING · ${tanda.length}/${MUTANTES.length} mutantes ═══\n(gemelas <fn>_mut por execute_sql — GOTCHA #95; las funciones REALES no se tocan)\n`);
  let vivos = 0, arnes = 0, manuales = 0;
  for (const m of tanda) {
    const path = join(HERE, '..', 'migrations', `guard_staff_${m.fn}.sql`);
    let src;
    try { src = readFileSync(path, 'utf8'); }
    catch { console.log(`⚠ ${m.id} ERROR DE ARNÉS — no está ${path}`); arnes++; continue; }
    let mutado = src;
    if (m.sinStaff) {
      const from = `OR fn_is_super_admin() OR fn_is_staff()) THEN\n    RAISE EXCEPTION '${m.fn}: sin permiso'`;
      if (!src.includes(from)) { console.log(`⚠ ${m.id} ERROR DE ARNÉS — ancla sinStaff ausente`); arnes++; continue; }
      mutado = src.replace(from, `OR fn_is_super_admin()) THEN\n    RAISE EXCEPTION '${m.fn}: sin permiso'`);
    } else if (m.clubViejo) {
      const from = `  IF NOT (coalesce(auth.role(), '') = 'service_role' OR fn_is_super_admin()) THEN\n    v_user_club := fn_get_user_club_id();\n    IF v_user_club IS NULL THEN`;
      if (!src.includes(from)) { console.log(`⚠ ${m.id} ERROR DE ARNÉS — ancla clubViejo ausente`); arnes++; continue; }
      mutado = src.replace(from, `  IF fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin() THEN\n    v_user_club := fn_get_user_club_id();\n    IF false THEN`);
    } else {
      const re = new RegExp(`  IF NOT \\(coalesce\\(auth\\.role\\(\\), ''\\) = 'service_role'\\n          OR fn_is_super_admin\\(\\) OR fn_is_staff\\(\\)\\) THEN\\n    RAISE EXCEPTION '${m.fn}: sin permiso' USING ERRCODE = '42501';\\n  END IF;`);
      if (!re.test(src)) { console.log(`⚠ ${m.id} ERROR DE ARNÉS — ancla del guard 0 ausente en ${m.fn}`); arnes++; continue; }
      mutado = src.replace(re, '  -- guard 0 removido por el mutante');
    }
    if (!PSQL) {
      const p = join(dir, `${m.id}.sql`);
      writeFileSync(p, mutado.replaceAll(`public.${m.fn}(`, `public.${m.fn}_mut(`));
      console.log(`⏸ ${m.id} MANUAL (sin PSQL_CMD) — ${m.desc}\n     ↳ aplicar ${p} por execute_sql, correr con RPC_SUFIJO=_mut --fn ${m.fn}, y dropear la gemela`);
      manuales++; continue;
    }
    aplicar(mutado.replaceAll(`public.${m.fn}(`, `public.${m.fn}_mut(`));
    let out = '';
    try { out = execFileSync(process.execPath, [SELF, '--fn', m.fn], { env: { ...process.env, RPC_SUFIJO: '_mut' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    try { aplicar(`DROP FUNCTION IF EXISTS public.${m.fn}_mut CASCADE;`); } catch {}
    if (!/^\d+\/\d+ OK/m.test(out)) {
      const causa = (out.split('\n').find(l => /Error|error:|💥/.test(l)) || '(sin línea de error)').trim();
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — no llegó a los asserts. ${m.desc}\n     ↳ ${causa.slice(0, 220)}`); arnes++; continue;
    }
    const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));
    const vivo = muertos.length === 0;
    if (m.equivalente) {
      // GOTCHA #84: los equivalentes se DECLARAN con su prueba, no se "arreglan".
      if (vivo) console.log(`✅ ${m.id} EQUIVALENTE (sobrevive por diseño) — ${m.desc}\n     ↳ ${m.equivalente}`);
      else { vivos++; console.log(`❌ ${m.id} DEJÓ DE SER EQUIVALENTE — murió ${muertos.join(',')}: el código cambió, revisar la declaración`); }
      continue;
    }
    if (vivo) vivos++;
    console.log(`${vivo ? '❌' : '✅'} ${m.id} ${vivo ? 'SOBREVIVE' : 'muere'} — ${m.desc}  [esperaba matar ${m.mata.join(',')}${muertos.length ? `; murieron ${muertos.join(',')}` : ''}]`);
  }
  const auto = tanda.length - manuales;
  console.log(`\n${vivos === 0 && arnes === 0 ? '✅ TANDA LIMPIA' : '❌ TANDA CON HALLAZGOS'} — ${auto} automáticos · ${auto - vivos - arnes} muertos${vivos ? ` · ${vivos} SOBREVIVEN` : ''}${arnes ? ` · ${arnes} ERROR DE ARNÉS` : ''}${manuales ? ` · ${manuales} manuales` : ''}`);
  process.exit(vivos === 0 && arnes === 0 ? 0 : 1);
}

// ══════════════════════════ CORRIDA NORMAL ══════════════════════════
let base = null;
const sinGuard = [];
try {
  const cars = await q(sb.from('carreras').select('id,numero_turno').eq('reunion_id', RID).order('numero_turno'), 'carreras');
  CAR_IDS = cars.map(c => c.id);
  base = await foto();

  // ── fixture: objetos VÁLIDOS de la 9999 ──
  const lineas = base.lineas;
  const lineaRetenida = lineas.find(l => l.estado_linea === 'retenido');
  // Las impagas que se van a cobrar NO pueden ser de `carreraLibre`: un recibo sobre ellas
  // la vuelve "carrera con pagos emitidos" y `desoficializar_carrera` la rechaza.
  const impagasTodas = lineas.filter(l => l.estado_linea === 'impago' && l.beneficiario_tipo !== 'club');
  // El recibo para `anular_recibo` tiene que ser RECIENTE: la ventana de 5 días corta a
  // secretario y operador, y el recibo seed de la 9999 es del 2026-06-10. Se emite uno
  // nuevo con service_role sobre otra línea impaga y se borra en el restore.

  // carrera sin líneas comprometidas → des-oficializable
  const comprometidas = new Set(lineas.filter(l => l.recibo_id || l.estado_linea === 'pagado').map(l => l.carrera_id).filter(Boolean));
  const carreraLibre = cars.map(c => c.id).find(id => !comprometidas.has(id));
  const resultadoLibre = base.ress.find(r => r.carrera_id === carreraLibre);
  const posicionesLibres = base.pos.filter(p => p.resultado_id === resultadoLibre?.id)
    .map(p => ({ inscripcion_id: p.inscripcion_id, posicion: p.posicion, no_largo: p.no_largo, descalificado: p.descalificado, tiempo: p.tiempo, diferencia: p.diferencia, motivo_desc: p.motivo_desc, empate: p.empate, dividendo: p.dividendo }));
  // El guard de desoficializar mira `carrera_id` O `inscripcion_id IN (inscripciones de la carrera)`:
  // hay que excluir las dos vías, no sólo carrera_id.
  const inscDeCarreraLibre = new Set((await q(sb.from('inscripciones').select('id').eq('carrera_id', carreraLibre), 'insc libre')).map(i => i.id));
  const impagas = impagasTodas.filter(l => l.carrera_id !== carreraLibre && !inscDeCarreraLibre.has(l.inscripcion_id));
  const lineaImpaga = impagas[0];
  const lineaParaRecibo = impagas.find(l => l.id !== lineaImpaga?.id);
  const inscripcion = (await q(sb.from('inscripciones').select('id,jockey_titular_id').in('carrera_id', CAR_IDS).eq('estado', 'ratificado').limit(1), 'insc'))[0];

  ok('P0) fixture de la 9999: dos líneas impagas, una retenida, carrera sin plata comprometida e inscripción ratificada',
     !!lineaRetenida && !!lineaImpaga && !!lineaParaRecibo && !!carreraLibre && !!resultadoLibre && !!inscripcion,
     `retenida=${lineaRetenida?.id.slice(0,8)} impaga=${lineaImpaga?.id.slice(0,8)} paraRecibo=${lineaParaRecibo?.id.slice(0,8)} carreraLibre=${carreraLibre?.slice(0,8)} insc=${inscripcion?.id.slice(0,8)}`);
  if (!lineaRetenida || !lineaImpaga || !lineaParaRecibo || !carreraLibre || !inscripcion) throw new Error('fixture incompleto en la 9999');

  // Recibo fresco para el caso anular_recibo (service_role siempre pasa el guard).
  const { data: recFresco, error: eRec } = await sb.rpc(`emitir_recibo${SUFIJO === '_mut' ? '' : ''}`, {
    p_club_id: CLUB, p_beneficiario_tipo: lineaParaRecibo.beneficiario_tipo,
    p_beneficiario_id: lineaParaRecibo.beneficiario_id, p_linea_ids: [lineaParaRecibo.id],
    p_forma_pago: 'efectivo', p_cobrador_nombre: `PROBE-GUARD ${RUN}`, p_cobrador_documento: '0',
  });
  ok('P0b) recibo fresco emitido para probar anular_recibo dentro de la ventana de 5 días',
     !eRec && !!recFresco?.id, eRec ? msg(eRec) : `N° ${recFresco?.numero_recibo}`);
  if (eRec) throw new Error('no se pudo emitir el recibo del fixture: ' + msg(eRec));

  const ctx = { lineaRetenida: lineaRetenida.id, lineaImpaga, carreraLibre, resultadoLibre, posicionesLibres, inscripcion,
                pistaMarcador: resultadoLibre?.estado_pista === 'humeda' ? 'seca' : 'humeda',
                reciboPropio: recFresco.id, lineaDelRecibo: lineaParaRecibo.id, pagadoAtOriginal: null };
  const C = casos(ctx);

  // ── perfiles ──
  const perfiles = [
    { k: 'service_role', pasa: true,  cli: sb },
    { k: 'superadmin',   pasa: true,  make: () => cliente({ rol: 'super_admin', club: CLUB_AJENO, etiqueta: 'superadmin' }) },
    { k: 'secretario',   pasa: true,  make: () => cliente({ rol: 'secretario_carreras', club: CLUB, etiqueta: 'secretario' }) },
    { k: 'operador',     pasa: true,  make: () => cliente({ rol: 'operador', club: CLUB, etiqueta: 'operador' }) },
    { k: 'otroclub',     pasa: false, make: () => cliente({ rol: 'operador', club: CLUB_AJENO, etiqueta: 'otroclub' }) },
    { k: 'portal',       pasa: false, make: () => cliente({ rol: 'profesional', club: CLUB, etiqueta: 'portal' }) },
    { k: 'sinfila',      pasa: false, make: () => cliente({ rol: 'operador', club: null, conFila: false, etiqueta: 'sinfila' }) },
    { k: 'anon',         pasa: false, make: () => cliente({ rol: 'anon' }) },
  ];
  for (const p of perfiles) if (!p.cli) p.cli = await p.make();

  for (const fn of AL_MENOS) {
    const c = C[fn];
    console.log(`\n── ${fn}${SUFIJO} ──`);
    let rompio = false;
    for (const p of perfiles) {
      const antes = await c.estadoPrevio();
      const { error } = await p.cli.rpc(`${fn}${SUFIJO}`, c.args());
      if (p.pasa) {
        const efecto = !error ? await c.efecto(antes) : false;
        ok(`G-${fn}-${p.k}) ${p.k} pasa y el efecto se produce`, !error && efecto, error ? msg(error) : `efecto=${efecto}`);
        if (c.restaurar) await c.restaurar();
      } else {
        const bloqueado = es42501(error);
        const intacto = (await c.estadoPrevio()) === antes;
        // GOTCHA #86 — observable POR CAPA: el 42501 tiene que salir del guard de ESTA
        // función, no de otra que la tape. Sin esto, sacarle el guard 0 a emitir_recibo
        // "no se nota" porque lo ataja el de fn_siguiente_recibo, que llama por dentro.
        // Los RAISE de la gemela `<fn>_mut` conservan el nombre original en el texto, así que
        // el `_mut` va opcional y NO pegado al nombre por concatenación (bug del primer intento).
        const propio = new RegExp(`(^|\\s)${fn}(_mut)?: |permission denied for function ${fn}`).test(msg(error));
        if (!bloqueado || !propio) rompio = true;
        ok(`G-${fn}-${p.k}) ${p.k} → 42501 del guard de ${fn}, y nada cambia`, bloqueado && intacto && propio,
           `code=${error?.code ?? '(sin error)'} ${msg(error) || 'PASÓ'}${intacto ? '' : ' · ¡EL ESTADO CAMBIÓ!'}${bloqueado && !propio ? ' · ¡lo atajó OTRA función!' : ''}`);
        if (!intacto && c.restaurar) await c.restaurar();
      }
    }
    if (rompio) sinGuard.push(fn);
  }
} catch (e) {
  console.log('💥 el probe no corrió entero:', e.message);
  failN++; fallas.push('excepción');
} finally {
  // ORDEN: primero restaurar (borra los recibos del probe), DESPUÉS los usuarios. Al revés,
  // el DELETE de usuarios rebota contra recibos_emitido_por_fkey y deja usuarios en prod.
  if (base) {
    try {
      await restaurar(base);
      await limpiarPerfiles();
      const difs = diffFoto(base, await foto());
      ok('R1) restore por estado: la 9999 quedó exactamente como al empezar', difs.length === 0, difs.slice(0, 8).join(' | ') || 'sin diferencias');
      const us = (await sb.from('usuarios').select('id', { count: 'exact', head: true }).like('email', 'probe.guard.%')).count;
      const rec = (await sb.from('recibos').select('id', { count: 'exact', head: true }).ilike('cobrador_nombre', 'PROBE-GUARD%')).count;
      ok('R2) no quedaron usuarios ni recibos del probe', us === 0 && rec === 0, `usuarios=${us} recibos=${rec}`);
    } catch (e) { ok('R1) restore', false, e.message); try { await limpiarPerfiles(); } catch {} }
  } else {
    try { await limpiarPerfiles(); } catch (e) { console.log('⚠ limpieza de perfiles:', e.message); }
  }
  if (sinGuard.length) {
    console.log(`\nℹ Funciones SIN el guard todavía (rojo esperado si aún no se aplicó su migración): ${sinGuard.join(', ')}`);
  }
  console.log(`\n${okN}/${okN + failN} OK${failN ? ` — fallan: ${fallas.join(', ')}` : ''}`);
  process.exit(failN ? 1 : 0);
}
