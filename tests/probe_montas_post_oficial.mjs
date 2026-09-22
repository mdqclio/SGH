/**
 * Probe — ISSUE-084: cambio de monta después de oficializar (rpc_cambiar_monta + trigger
 * trg_insc_monta_oficial + saveMontas real de resultados.html).
 *
 * Corre CÓDIGO REAL: la RPC y el trigger en la base, `saveMontas` extraído de resultados.html
 * por sus anclas (`document` stub, `sb` real), y el motor `liquidaciones-engine.js` tal cual.
 * Fixture en la reunión 9999 (sandbox, es_prueba). ESCRIBE: alinea una inscripción con su
 * línea, planta estados, corre la RPC y el recálculo; al final RESTAURA la reunión entera
 * (headers + líneas con sus ids, jockeys, resultados, performances, recibo de prueba) y lo
 * verifica por estado (GOTCHA #77). Sólo toca la 9999; los recibos se miran sin filtro de
 * club (GOTCHA #76).
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_montas_post_oficial.mjs                 # contra prod (cuando la migración esté aplicada)
 *   node tests/probe_montas_post_oficial.mjs --mutantes      # tanda completa (los de SQL sólo con PSQL_CMD)
 *   node tests/probe_montas_post_oficial.mjs --mutantes=M1,M7
 *
 * Sandbox local (tests/local/up.sh; ver tests/README.md):
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=$(cat tests/local/out/jwt) \
 *   PSQL_CMD="tests/local/up.sh sql" node tests/probe_montas_post_oficial.mjs --mutantes
 *
 * Env: SUPABASE_URL (default prod) · SUPABASE_SECRET_KEY · RPC_MONTA (gemela para mutantes de
 * SQL; default rpc_cambiar_monta) · RESULTADOS_HTML · ENGINE_JS · PSQL_CMD (cómo aplicar SQL:
 * sólo en el sandbox; en prod los mutantes de SQL se aplican por MCP sobre la gemela).
 *
 * Casos (cada uno arranca de la 9999 restaurada + la inscripción alineada con su línea):
 *   S0  sensibilidad — anclas y rpc en el HTML, RPC y trigger en la base
 *   P0  fixture esperado — la línea del 3° del turno 2 está impago y es de FERRARI
 *   A1  impago → saveMontas real: RPC + recálculo; 1 sola línea de jockey en (insc, puesto), al entrante, mismo monto; performances.jockey_id actualizado
 *   A2  retenido (1° puesto) → ídem, la nueva queda retenido
 *   A3  pagado CON recibo → RAISE con el N° de recibo; jockey, línea y recibo intactos
 *   A4  pagado SIN recibo (saldado administrativo) → RAISE "saldado administrativo"; nada cambia
 *   A5  incentivo del saliente pagado y sin otra monta → RAISE aunque el premio esté impago
 *   A6  carrera provisional → cambia sin recálculo y sin tocar líneas
 *   A7  RPC pasa y el recálculo falla → la línea impago del saliente YA no existe; toast rojo
 *   A8  UPDATE directo en carrera oficial → el trigger lo rechaza
 *   A9  propietario pagado + jockey impago → pasa (el guard mira sólo al jockey saliente)
 *   A10 UPDATE con payload entero y el mismo jockey en carrera oficial → pasa (NEW IS NOT DISTINCT FROM OLD)
 *   A11 después de la RPC, un UPDATE directo sigue rechazado (set_config local a la transacción)
 *   A12 incentivo del saliente pagado PERO con otra monta en una carrera provisional → pasa y no lo toca
 *   P1  anon → rechazado (sin privilegio de EXECUTE)
 *   P2  authenticated con club de otro hipódromo → 42501
 *   P3  authenticated SIN fila en `usuarios` (club NULL) → 42501, no "pasa por service_role"
 *   R1  restore por estado limpio · R2 nada fuera de la 9999 cambió (líneas totales, recibos)
 *
 * P1–P3 necesitan sesiones con rol: en el sandbox se firman JWT con LOCAL_JWT_SECRET
 * (tests/local/out/jwt_secret); contra prod se crean usuarios y sesiones reales por magiclink
 * (mismo patrón que probe_rpc_spcs_duplicados) y se borran en el finally.
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
const RPC = process.env.RPC_MONTA || 'rpc_cambiar_monta';
const HTML_PATH   = process.env.RESULTADOS_HTML || join(HERE, '..', 'resultados.html');
const ENGINE_PATH = process.env.ENGINE_JS || join(HERE, '..', 'liquidaciones-engine.js');
const SQL_PATH    = join(HERE, '..', 'migrations', 'rpc_cambiar_monta.sql');
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const CLUB_AJENO = 'a6da7e40-1515-45dc-8933-4eef33ce937a';   // Mi Club Hípico
const RID  = 'a0000000-0000-0000-0000-000000009999';
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const JWT_SECRET = process.env.LOCAL_JWT_SECRET || null;     // sandbox: firma JWT; prod: null → sesiones reales
const RUN = Date.now().toString(36);
const TAG  = 'PROBE-084';
const RECIBO_NRO = 99084;

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HTML = readFileSync(HTML_PATH, 'utf8');

// ── asserts ──────────────────────────────────────────────────────────────────
let okN = 0, failN = 0; const fallas = [];
function ok(label, cond, nota = '') {
  if (cond) { okN++; console.log(`✅ ${label}${nota ? `\n   → ${nota}` : ''}`); }
  else { failN++; fallas.push(label); console.log(`❌ ${label}${nota ? `\n   → ${nota}` : ''}`); }
}
async function q(p, ctx) { const { data, error } = await p; if (error) throw new Error(`${ctx}: ${error.message}`); return data; }

// ── código real extraído ─────────────────────────────────────────────────────
function extraerBloque(src, ini, fin) {
  const a = src.indexOf(ini), b = src.indexOf(fin);
  if (a < 0 || b < 0 || b < a) throw new Error(`no encontré las anclas ${ini} / ${fin}`);
  return src.slice(a, b);
}
function extraerFn(src, firma) {
  const start = src.indexOf(firma);
  if (start < 0) throw new Error(`no encontré ${firma}`);
  const open = src.indexOf('{', start);
  let depth = 0, i = open;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) break; } }
  return src.slice(start, i + 1);
}
const SAVE_MONTAS = extraerBloque(HTML, '// ═══ SAVE MONTAS — INICIO', '// ═══ SAVE MONTAS — FIN ═══');
const MO_INSC     = extraerFn(HTML, 'function moInscripciones(carreraId) {');
const engineGlobal = {};
new Function('window', readFileSync(ENGINE_PATH, 'utf8'))(engineGlobal);
if (typeof engineGlobal.generarLiquidacionesReunion !== 'function') throw new Error('motor no expuesto');

/**
 * Corre el saveMontas REAL con el DOM stubeado. `cambios` = { inscId: jockeyId|null } es lo que
 * el operador eligió en los selects; `engine` es el motor (el real, o uno que falla para A7).
 */
async function correrSaveMontas({ carreraId, inscs, cambios, engine }) {
  const toasts = [];
  const selects = {};
  for (const i of inscs) selects[`mo-${i.id}`] = { value: cambios[i.id] !== undefined ? (cambios[i.id] || '') : (i.jockey_titular_id || '') };
  let modalAbierto = true;
  const document = {
    getElementById(id) {
      if (id === 'modal-montas') return { classList: { remove() { modalAbierto = false; }, add() {} } };
      if (id === 'sel-reunion') return { value: RID };
      return selects[id] || null;
    },
  };
  const ctx = {
    sb, document, toast: (m, t) => toasts.push({ m, t }), CLUB_ID: CLUB, currentCarreraId: carreraId,
    inscripciones: inscs.map(i => ({ ...i })), carreras: [{ id: carreraId, reunion_id: RID }],
    moOriginal: Object.fromEntries(inscs.map(i => [i.id, i.jockey_titular_id || null])),
    profsMap: {}, moJockeysRepetidos: () => ({ conteo: {} }), console: { error() {} },
    generarLiquidacionesReunion: engine,
  };
  const src = `${MO_INSC}\n${SAVE_MONTAS}\nreturn saveMontas();`;
  const fn = new (Object.getPrototypeOf(async function () {}).constructor)(...Object.keys(ctx), src);
  await fn(...Object.values(ctx));
  return { toasts, modalAbierto, selects };
}

// ── clientes por ROL (P1–P3) ─────────────────────────────────────────────────
// Sandbox: JWT firmado con el secreto local (auth.uid()/auth.role() leen request.jwt.claims,
// igual que Supabase). Prod: usuario + sesión real por magiclink. El `anon` de prod es la
// publishable key, que es exactamente lo que sirve el sitio público.
const creadosAuth = [];
function firmarJWT(claims) {
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b({ alg: 'HS256', typ: 'JWT' });
  const pl = b({ iss: 'sgh-local', exp: Math.floor(Date.now() / 1000) + 3600, ...claims });
  return `${h}.${pl}.${createHmac('sha256', JWT_SECRET).update(`${h}.${pl}`).digest('base64url')}`;
}
async function clienteAnon() {
  if (JWT_SECRET) return createClient(SUPABASE_URL, firmarJWT({ role: 'anon' }), { auth: { persistSession: false } });
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}
/** authenticated con (o sin) fila en `usuarios`. `club`=null + conFila=false → club NULL. */
async function clienteAuth({ club, conFila = true, etiqueta }) {
  const email = `probe.084.${etiqueta}.${RUN}@sgh.test`;
  let authId;
  if (JWT_SECRET) {
    authId = randomUUID();
  } else {
    const { data: au, error } = await sb.auth.admin.createUser({ email, password: `Px-${RUN}-${Math.random().toString(36).slice(2)}`, email_confirm: true });
    if (error) throw new Error('createUser: ' + error.message);
    authId = au.user.id;
  }
  creadosAuth.push({ email, authId });
  if (conFila) {
    const { error } = await sb.from('usuarios').insert({ email, nombre_completo: `Probe 084 ${etiqueta}`, club_id: club, rol: 'operador', activo: true, estado: 'activo', password_hash: '', auth_user_id: authId });
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
async function limpiarAuth() {
  for (const u of creadosAuth) {
    await sb.from('usuarios').delete().eq('email', u.email);
    if (!JWT_SECRET) { try { await sb.auth.admin.deleteUser(u.authId); } catch {} }
  }
}

// ── snapshot / restore de la reunión ENTERA (headers + líneas con sus ids) ────
const GEN = { liquidaciones: ['total_neto'], liquidacion_detalle: ['monto_neto'] };
const sinGen = (t, r) => Object.fromEntries(Object.entries(r).filter(([k]) => !GEN[t].includes(k)));
async function fotoReunion() {
  const [hdrs, lineas, inscs, ress] = await Promise.all([
    q(sb.from('liquidaciones').select('*').eq('reunion_id', RID).order('id'), 'foto hdrs'),
    q(sb.from('liquidacion_detalle').select('*').eq('reunion_id', RID).order('id'), 'foto lineas'),
    q(sb.from('inscripciones').select('id,carrera_id,spc_id,estado,jockey_titular_id,numero_partidor').in('carrera_id', CAR_IDS).order('id'), 'foto inscs'),
    q(sb.from('resultados').select('id,carrera_id,estado').in('carrera_id', CAR_IDS).order('id'), 'foto res'),
  ]);
  return { hdrs: hdrs.map(r => sinGen('liquidaciones', r)), lineas: lineas.map(r => sinGen('liquidacion_detalle', r)), inscs, ress };
}
const canon = o => JSON.stringify(o, Object.keys(o).sort());
function diffFoto(a, b) {
  const difs = [];
  for (const k of ['hdrs', 'lineas', 'inscs', 'ress']) {
    const A = new Map(a[k].map(r => [r.id, r])), B = new Map(b[k].map(r => [r.id, r]));
    for (const [id, r] of A) { if (!B.has(id)) difs.push(`${k} falta ${id.slice(0, 8)}`); else if (canon(r) !== canon(B.get(id))) difs.push(`${k} cambió ${id.slice(0, 8)}: ${Object.keys(r).filter(c => canon({ v: r[c] }) !== canon({ v: B.get(id)[c] })).join(',')}`); }
    for (const id of B.keys()) if (!A.has(id)) difs.push(`${k} sobra ${id.slice(0, 8)}`);
  }
  return difs;
}
/** Vuelve la 9999 al snapshot: borra headers+líneas, re-pone jockeys por la RPC (única vía en oficial), re-inserta. */
async function restaurarReunion(base) {
  await q(sb.from('liquidacion_detalle').delete().eq('reunion_id', RID), 'restore del lineas');
  await q(sb.from('liquidaciones').delete().eq('reunion_id', RID), 'restore del hdrs');
  // resultados (A6 los toca) — antes que los jockeys, para que la RPC vea el estado real
  for (const r of base.ress) await q(sb.from('resultados').update({ estado: r.estado }).eq('id', r.id), 'restore res');
  const ahora = await q(sb.from('inscripciones').select('id,jockey_titular_id').in('carrera_id', CAR_IDS), 'restore inscs read');
  for (const i of base.inscs) {
    const cur = ahora.find(x => x.id === i.id);
    if (cur && (cur.jockey_titular_id || null) !== (i.jockey_titular_id || null)) {
      const { error } = await sb.rpc(RPC, { p_inscripcion_id: i.id, p_jockey_id: i.jockey_titular_id });
      if (error) throw new Error(`restore jockey ${i.id}: ${error.message}`);
    }
  }
  if (base.hdrs.length) await q(sb.from('liquidaciones').insert(base.hdrs), 'restore ins hdrs');
  if (base.lineas.length) await q(sb.from('liquidacion_detalle').insert(base.lineas), 'restore ins lineas');
  await sb.from('performances').delete().eq('hipodromo_sigla', TAG);
  await sb.from('recibos').delete().eq('numero_recibo', RECIBO_NRO).eq('club_id', CLUB);
}

// ── datos base ───────────────────────────────────────────────────────────────
const CARRERAS = await q(sb.from('carreras').select('id,numero_turno,bolsa_total').eq('reunion_id', RID).order('numero_turno'), 'carreras');
const CAR_IDS = CARRERAS.map(c => c.id);
const lineasJockey = async (inscId) => q(sb.from('liquidacion_detalle')
  .select('id,beneficiario_id,estado_linea,recibo_id,monto_bruto,posicion,concepto_tipo')
  .eq('inscripcion_id', inscId).eq('beneficiario_tipo', 'profesional').eq('concepto_tipo', 'premio').ilike('descripcion', '%Jockey%'), 'lineasJockey');
const jockeyDe = async (inscId) => (await q(sb.from('inscripciones').select('jockey_titular_id,updated_at').eq('id', inscId).single(), 'jockeyDe'));
const rpc = (inscId, jockeyId) => sb.rpc(RPC, { p_inscripcion_id: inscId, p_jockey_id: jockeyId });
const inscsDe = async (carreraId) => q(sb.from('inscripciones').select('*').eq('carrera_id', carreraId), 'inscsDe');
const msg = e => (e?.message || '').replace(/\s+/g, ' ');

// ═══════════════════════════ MUTATION TESTING ═══════════════════════════
const MUTANTES = [
  { id: 'M1', tipo: 'sql', mata: ['A4'], desc: 'el guard del premio cuenta sólo recibo_id (pierde el saldado administrativo)',
    from: "AND d.concepto_tipo = 'premio'\n       AND (d.recibo_id IS NOT NULL OR d.estado_linea = 'pagado');",
    to:   "AND d.concepto_tipo = 'premio'\n       AND (d.recibo_id IS NOT NULL);" },
  { id: 'M3', tipo: 'sql', mata: ['A5'], desc: 'el guard no mira el incentivo del saliente',
    from: "IF v_otras_montas = 0 THEN\n      SELECT count(*), COALESCE(v_recibo_nro, max(r.numero_recibo)) INTO v_comp_incent, v_recibo_nro",
    to:   "IF false AND v_otras_montas = 0 THEN\n      SELECT count(*), COALESCE(v_recibo_nro, max(r.numero_recibo)) INTO v_comp_incent, v_recibo_nro" },
  { id: 'M4', tipo: 'sql', mata: ['A9'], desc: 'el guard mira cualquier línea de la inscripción, no sólo las del jockey saliente (bloquea de más)',
    from: "AND d.beneficiario_tipo = 'profesional' AND d.beneficiario_id = v_viejo\n       AND d.concepto_tipo = 'premio'\n       AND (d.recibo_id IS NOT NULL OR d.estado_linea = 'pagado');",
    to:   "AND (d.recibo_id IS NOT NULL OR d.estado_linea = 'pagado');" },
  { id: 'M5', tipo: 'sql', mata: ['A7'], desc: 'la RPC no borra la línea impago del saliente',
    from: "AND d.concepto_tipo = 'premio'\n       AND d.recibo_id IS NULL AND d.estado_linea <> 'pagado';\n    GET DIAGNOSTICS v_borradas = ROW_COUNT;",
    to:   "AND d.concepto_tipo = 'premio'\n       AND false;\n    GET DIAGNOSTICS v_borradas = ROW_COUNT;" },
  { id: 'M6', tipo: 'trigger', mata: ['A8', 'A11'], desc: 'el trigger deja pasar siempre (la excepción de la RPC queda abierta)',
    from: "IF current_setting('sgh.cambiar_monta', true) = '1' THEN",
    to:   "IF true THEN" },
  { id: 'M9', tipo: 'sql', mata: ['P3'], desc: 'guard 1 vuelve al patrón viejo (infiere service_role de club NULL)',
    from: "IF NOT (coalesce(auth.role(), '') = 'service_role' OR fn_is_super_admin()) THEN\n    v_user_club := fn_get_user_club_id();\n    IF v_user_club IS NULL THEN\n      RAISE EXCEPTION 'rpc_cambiar_monta: la sesión no tiene hipódromo asignado' USING ERRCODE = '42501';\n    END IF;\n    IF v_club IS DISTINCT FROM v_user_club THEN",
    to:   "IF fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin() THEN\n    v_user_club := fn_get_user_club_id();\n    IF v_club IS DISTINCT FROM v_user_club THEN" },
  { id: 'M10', tipo: 'sql', mata: ['A12'], desc: 'v_otras_montas vuelve a contar SÓLO carreras ya oficializadas',
    from: "       AND ( EXISTS (SELECT 1 FROM resultados r\n                       JOIN resultado_posiciones rp ON rp.resultado_id = r.id\n                      WHERE r.carrera_id = c.id AND r.estado = 'oficial'\n                        AND rp.inscripcion_id = i.id AND rp.no_largo = false)\n          OR ( (c.estado IS NULL OR c.estado <> 'anulada')\n               AND NOT EXISTS (SELECT 1 FROM resultados r\n                                WHERE r.carrera_id = c.id AND r.estado = 'oficial') ) );",
    to:   "       AND EXISTS (SELECT 1 FROM resultados r\n                     JOIN resultado_posiciones rp ON rp.resultado_id = r.id\n                    WHERE r.carrera_id = c.id AND r.estado = 'oficial'\n                      AND rp.inscripcion_id = i.id AND rp.no_largo = false);" },
  { id: 'M7', tipo: 'html', mata: ['A1'], desc: 'saveMontas vuelve al UPDATE directo (el trigger lo rechaza en oficial)',
    from: "sb.rpc('rpc_cambiar_monta', { p_inscripcion_id: u.id, p_jockey_id: u.jockey_titular_id })",
    to:   "sb.from('inscripciones').update({ jockey_titular_id: u.jockey_titular_id }).eq('id', u.id).select('id').single()" },
  { id: 'M8', tipo: 'html', mata: ['A1'], desc: 'saveMontas no recalcula después de la RPC',
    from: "if (recalcular) {\n    const carrera = carreras.find(c => c.id === currentCarreraId);",
    to:   "if (false) {\n    const carrera = carreras.find(c => c.id === currentCarreraId);" },
];
const mutArg = process.argv.find(a => a.startsWith('--mutantes'));
if (mutArg) {
  const pedidos = mutArg.includes('=') ? mutArg.split('=')[1].split(',') : null;
  const tanda = MUTANTES.filter(m => !pedidos || pedidos.includes(m.id));
  const SQL_BASE = readFileSync(SQL_PATH, 'utf8');
  const PSQL = process.env.PSQL_CMD;   // p.ej. "tests/local/up.sh sql" — sólo sandbox
  const dir = mkdtempSync(join(tmpdir(), 'mut-montas-'));
  // el hijo corre SIEMPRE este mismo archivo (SELF); en el tmpdir van sólo las copias mutadas del HTML/SQL
  const GEMELA = 'rpc_cambiar_monta_mut';
  const aplicarSQL = (sql) => execSync(PSQL, { input: sql + "\nNOTIFY pgrst, 'reload schema';\nSELECT pg_sleep(0.5);\n", stdio: ['pipe', 'ignore', 'pipe'] });
  const correrHijo = (env) => {
    let out = '';
    try { out = execFileSync(process.execPath, [SELF], { env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    return out;
  };
  console.log(`\n═══ MUTATION TESTING · ${tanda.length}/${MUTANTES.length} mutantes ═══\n(copias en ${dir}; la función y el trigger REALES no se tocan salvo M6 en el sandbox)\n`);
  let vivos = 0, arnes = 0, manuales = 0;
  for (const m of tanda) {
    const src = m.tipo === 'html' ? HTML : SQL_BASE;
    if (!src.includes(m.from)) { console.log(`⚠ ${m.id} ERROR DE ARNÉS — el ancla no existe en el fuente. ${m.desc}`); arnes++; continue; }
    const env = {};
    if (m.tipo === 'html') {
      const p = join(dir, `${m.id}.html`); writeFileSync(p, HTML.replace(m.from, m.to)); env.RESULTADOS_HTML = p;
    } else if (!PSQL) {
      const p = join(dir, `${m.id}.sql`);
      writeFileSync(p, SQL_BASE.replace(m.from, m.to).replaceAll('public.rpc_cambiar_monta(', `public.${GEMELA}(`));
      console.log(`⏸ ${m.id} MANUAL (sin PSQL_CMD) — ${m.desc}\n     ↳ aplicar ${p} por MCP (execute_sql, NO apply_migration — GOTCHA #95), correr RPC_MONTA=${GEMELA} y dropear la gemela`);
      manuales++; continue;
    } else if (m.tipo === 'sql') {
      // gemela: sólo la RPC renombrada (sin el trigger, que ya está)
      const soloRpc = SQL_BASE.slice(SQL_BASE.indexOf('-- ── 2. RPC'));
      aplicarSQL(soloRpc.replace(m.from, m.to).replaceAll('public.rpc_cambiar_monta(', `public.${GEMELA}(`));
      env.RPC_MONTA = GEMELA;
      // el saveMontas real también tiene que llamar a la gemela (A1/A7 pasan por él)
      const p = join(dir, `${m.id}.html`); writeFileSync(p, HTML.replaceAll("sb.rpc('rpc_cambiar_monta'", `sb.rpc('${GEMELA}'`)); env.RESULTADOS_HTML = p;
    } else { // trigger — sólo sandbox: se muta la función del trigger y se restaura después
      const soloTrg = SQL_BASE.slice(SQL_BASE.indexOf('-- ── 1. Trigger'), SQL_BASE.indexOf('-- ── 2. RPC'));
      aplicarSQL(soloTrg.replace(m.from, m.to));
    }
    const out = correrHijo(env);
    if (m.tipo === 'sql') aplicarSQL(`DROP FUNCTION IF EXISTS public.${GEMELA}(uuid, uuid);`);
    if (m.tipo === 'trigger') aplicarSQL(SQL_BASE.slice(SQL_BASE.indexOf('-- ── 1. Trigger'), SQL_BASE.indexOf('-- ── 2. RPC')));
    if (!/^\d+\/\d+ OK/m.test(out)) {   // GOTCHA #84: el hijo no llegó a los asserts (la línea final es `N/M OK` o `N/M OK — fallan: …`)
      const causa = (out.split('\n').find(l => /Error|error:|💥/.test(l)) || '(sin línea de error)').trim();
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — no llegó a los asserts. ${m.desc}\n     ↳ ${causa.slice(0, 220)}`); arnes++; continue;
    }
    const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));   // GOTCHA #82: ancla en ")"
    const vivo = muertos.length === 0; if (vivo) vivos++;
    console.log(`${vivo ? '❌' : '✅'} ${m.id} ${vivo ? 'SOBREVIVE' : 'muere'} — ${m.desc}  [esperaba matar ${m.mata.join(',')}${muertos.length ? `; murieron ${muertos.join(',')}` : ''}]`);
  }
  const auto = tanda.length - manuales;
  console.log(`\n${vivos === 0 && arnes === 0 ? '✅ TANDA LIMPIA' : '❌ TANDA CON HALLAZGOS'} — ${auto} automáticos · ${auto - vivos - arnes} muertos${vivos ? ` · ${vivos} SOBREVIVEN` : ''}${arnes ? ` · ${arnes} ERROR DE ARNÉS` : ''}${manuales ? ` · ${manuales} manuales (SQL sin PSQL_CMD)` : ''}`);
  process.exit(vivos === 0 && arnes === 0 ? 0 : 1);
}

// ═══════════════════════════ CORRIDA NORMAL ═══════════════════════════
const t0 = new Date().toISOString();
let base = null, lineasTotalesAntes = 0, recibosAntes = 0;
try {
  // S0 — sensibilidad
  ok('S0) resultados.html tiene las anclas SAVE MONTAS y llama a rpc_cambiar_monta',
     SAVE_MONTAS.includes("sb.rpc('rpc_cambiar_monta'") || !!process.env.RESULTADOS_HTML, `RESULTADOS_HTML=${HTML_PATH}`);
  const { error: eRpc } = await sb.rpc(RPC, { p_inscripcion_id: null, p_jockey_id: null });
  ok('S0b) la RPC existe en la base y valida el parámetro', /falta la inscripción/.test(msg(eRpc)), msg(eRpc));
  // Sin la RPC no hay nada que probar y el restore no podría reponer los jockeys: cortar ANTES de tocar la 9999.
  if (!/falta la inscripción/.test(msg(eRpc))) throw new Error(`${RPC} no está en esta base — aplicar migrations/rpc_cambiar_monta.sql primero`);

  lineasTotalesAntes = (await sb.from('liquidacion_detalle').select('id', { count: 'exact', head: true })).count;
  recibosAntes       = (await sb.from('recibos').select('id', { count: 'exact', head: true })).count;
  base = await fotoReunion();

  // Fixture: 3° puesto del turno 2 (no retenido) — la línea del jockey que está en la base.
  const turno2 = CARRERAS.find(c => c.numero_turno === 2), turno1 = CARRERAS.find(c => c.numero_turno === 1), turno3 = CARRERAS.find(c => c.numero_turno === 3);
  const LA = base.lineas.find(d => d.carrera_id === turno2.id && d.posicion === 3 && d.concepto_tipo === 'premio' && d.beneficiario_tipo === 'profesional' && /Jockey/.test(d.descripcion || ''));
  const LB = base.lineas.find(d => d.carrera_id === turno1.id && d.posicion === 1 && d.concepto_tipo === 'premio' && d.beneficiario_tipo === 'profesional' && /Jockey/.test(d.descripcion || ''));
  const LC = base.lineas.find(d => d.carrera_id === turno3.id && d.posicion === 4 && d.concepto_tipo === 'premio' && d.beneficiario_tipo === 'profesional' && /Jockey/.test(d.descripcion || ''));
  // Header de un propietario en la 9999: A9 le cuelga una línea de premio pagada por la misma inscripción
  // (las inscripciones de la 9999 no tienen propietario_id — GOTCHA #47 — así que la línea se planta).
  const HDR_PROP = base.hdrs.find(h => h.propietario_id);
  const INC_PAG = base.lineas.find(d => d.concepto_tipo === 'incentivo_jockey' && d.estado_linea === 'pagado' && d.recibo_id);
  ok('P0) fixture — línea de jockey del 3° del turno 2 impago; 1° del turno 1 retenido; 4° del turno 3; incentivo pagado con recibo; header de propietario',
     LA?.estado_linea === 'impago' && !LA.recibo_id && LB?.estado_linea === 'retenido' && !!LC && !!INC_PAG && !!HDR_PROP,
     `LA=${LA?.id.slice(0, 8)} ${LA?.estado_linea} · LB=${LB?.id.slice(0, 8)} ${LB?.estado_linea} · INC=${INC_PAG?.id.slice(0, 8)} benef ${INC_PAG?.beneficiario_id?.slice(0, 8)} · hdrProp=${HDR_PROP?.id.slice(0, 8)}`);
  if (!LA || !LB || !LC || !HDR_PROP || !INC_PAG) throw new Error('fixture incompleto en la 9999');
  const INSC_A = LA.inscripcion_id, V = LA.beneficiario_id;
  const INSC_B = LB.inscripcion_id, VB = LB.beneficiario_id;
  const INSC_C = LC.inscripcion_id;
  const G = INC_PAG.beneficiario_id;   // jockey con incentivo pagado y (en la 9999) sin ninguna monta
  const jockeys = await q(sb.from('profesionales').select('id,apellido').in('tipo', ['jockey', 'ambos']).eq('club_id', CLUB).eq('activo', true).limit(50), 'jockeys');
  // entrante: un jockey real del club sin líneas ni montas en la 9999 (los `f9000000-…` de PRUEBA ya montan ahí)
  const N = jockeys.find(p => ![V, VB, G].includes(p.id) && !p.id.startsWith('f9000000-') && !base.lineas.some(d => d.beneficiario_id === p.id) && !base.inscs.some(i => i.jockey_titular_id === p.id))?.id;
  if (!N) throw new Error('no encontré un jockey entrante sin líneas en la 9999');
  const spcA = base.inscs.find(i => i.id === INSC_A).spc_id;

  const alinear = async (inscId, jockeyId) => { const { error } = await rpc(inscId, jockeyId); if (error) throw new Error(`alinear ${inscId}: ${error.message}`); };
  const reset = async () => { await restaurarReunion(base); };
  const soloJockey = async (inscId) => (await lineasJockey(inscId));

  // ── A1 · impago, por el saveMontas REAL con el motor REAL ──
  await alinear(INSC_A, V);
  await q(sb.from('performances').insert({ spc_id: spcA, carrera_id: turno2.id, fecha_carrera: '2026-01-01', hipodromo_sigla: TAG, jockey_id: V, posicion: 3 }), 'perf fixture');
  {
    const r = await correrSaveMontas({ carreraId: turno2.id, inscs: await inscsDe(turno2.id), cambios: { [INSC_A]: N }, engine: engineGlobal.generarLiquidacionesReunion });
    const lin = await soloJockey(INSC_A);
    const perf = await q(sb.from('performances').select('jockey_id').eq('hipodromo_sigla', TAG).single(), 'perf');
    ok('A1) impago → saveMontas real: UNA línea de jockey en (insc, 3°), al entrante, impago, mismo monto que la del saliente',
       lin.length === 1 && lin[0].beneficiario_id === N && lin[0].estado_linea === 'impago' && Number(lin[0].monto_bruto) === Number(LA.monto_bruto),
       `líneas=${lin.length} ${lin.map(l => `${l.beneficiario_id.slice(0, 8)}:${l.estado_linea}:$${l.monto_bruto}`).join(' ')} · toasts=${r.toasts.map(t => t.t).join(',')}`);
    ok('A1b) la inscripción quedó con el entrante y el modal se cerró', (await jockeyDe(INSC_A)).jockey_titular_id === N && !r.modalAbierto);
    ok('A1c) performances.jockey_id de esa inscripción pasó al entrante', perf.jockey_id === N, `jockey_id=${perf.jockey_id?.slice(0, 8)}`);
    ok('A1d) el saliente no tiene ninguna línea de jockey por esa inscripción', !lin.some(l => l.beneficiario_id === V));
  }
  await reset();

  // ── A2 · retenido real (1° puesto) ──
  await alinear(INSC_B, VB);
  {
    const r = await correrSaveMontas({ carreraId: turno1.id, inscs: await inscsDe(turno1.id), cambios: { [INSC_B]: N }, engine: engineGlobal.generarLiquidacionesReunion });
    const lin = await soloJockey(INSC_B);
    ok('A2) retenido (1°) → la línea del saliente se borra y la del entrante nace RETENIDA',
       lin.length === 1 && lin[0].beneficiario_id === N && lin[0].estado_linea === 'retenido',
       `líneas=${lin.length} ${lin.map(l => `${l.beneficiario_id.slice(0, 8)}:${l.estado_linea}`).join(' ')} · toasts=${r.toasts.map(t => t.t).join(',')}`);
  }
  await reset();

  // ── A3 · pagado CON recibo → RAISE con el número ──
  await alinear(INSC_A, V);
  {
    const rec = await q(sb.from('recibos').insert({ club_id: CLUB, numero_recibo: RECIBO_NRO, beneficiario_tipo: 'profesional', profesional_id: V, forma_pago: 'efectivo', total_premios: LA.monto_bruto, cobrador_nombre: TAG, cobrador_documento: '0' }).select('id').single(), 'recibo fixture');
    await q(sb.from('liquidacion_detalle').update({ estado_linea: 'pagado', recibo_id: rec.id, pagado_at: t0 }).eq('id', LA.id), 'LA pagado');
    const { data, error } = await rpc(INSC_A, N);
    const lin = await soloJockey(INSC_A);
    const recAfter = await q(sb.from('recibos').select('estado').eq('id', rec.id).single(), 'rec after');
    ok('A3) pagado con recibo → RAISE que nombra el recibo; nada cambia',
       !!error && new RegExp(`recibo N° ${RECIBO_NRO}`).test(msg(error)) && !data
         && (await jockeyDe(INSC_A)).jockey_titular_id === V
         && lin.length === 1 && lin[0].id === LA.id && lin[0].estado_linea === 'pagado' && lin[0].recibo_id === rec.id
         && recAfter.estado === 'emitido',
       msg(error) || 'sin error');
  }
  await reset();

  // ── A4 · pagado SIN recibo (saldado administrativo) ──
  await alinear(INSC_A, V);
  {
    await q(sb.from('liquidacion_detalle').update({ estado_linea: 'pagado', recibo_id: null, pagado_at: t0 }).eq('id', LA.id), 'LA saldado');
    const { error } = await rpc(INSC_A, N);
    const lin = await soloJockey(INSC_A);
    ok('A4) pagado sin recibo (saldado administrativo) → RAISE "saldado administrativo"; nada cambia',
       !!error && /saldado administrativo/.test(msg(error)) && (await jockeyDe(INSC_A)).jockey_titular_id === V && lin.length === 1 && lin[0].estado_linea === 'pagado' && !lin[0].recibo_id,
       msg(error) || 'sin error');
  }
  await reset();

  // ── A5 · incentivo del saliente pagado, sin otra monta → RAISE aunque el premio esté impago ──
  await alinear(INSC_A, G);
  {
    const { error } = await rpc(INSC_A, N);
    const inc = await q(sb.from('liquidacion_detalle').select('estado_linea,recibo_id').eq('id', INC_PAG.id).single(), 'inc');
    ok('A5) incentivo del saliente pagado y sin otra monta en la reunión → RAISE con recibo; jockey e incentivo intactos',
       !!error && /recibo N°/.test(msg(error)) && (await jockeyDe(INSC_A)).jockey_titular_id === G && inc.estado_linea === 'pagado' && inc.recibo_id === INC_PAG.recibo_id,
       msg(error) || 'sin error');
  }
  await reset();

  // ── A6 · carrera provisional → cambia, sin recálculo, sin tocar líneas ──
  {
    const resC = base.ress.find(r => r.carrera_id === turno3.id);
    await q(sb.from('resultados').update({ estado: 'provisional' }).eq('id', resC.id), 'res provisional');
    const antes = await q(sb.from('liquidacion_detalle').select('id').eq('reunion_id', RID), 'lineas antes');
    const { data, error } = await rpc(INSC_C, N);
    const despues = await q(sb.from('liquidacion_detalle').select('id').eq('reunion_id', RID), 'lineas despues');
    ok('A6) carrera provisional → cambio:true, oficial:false, recalcular:false, 0 borradas; las líneas no se tocan',
       !error && data?.cambio === true && data?.oficial === false && data?.recalcular === false && data?.lineas_borradas === 0
         && (await jockeyDe(INSC_C)).jockey_titular_id === N && antes.length === despues.length,
       error ? msg(error) : JSON.stringify(data));
  }
  await reset();

  // ── A7 · la RPC pasa y el recálculo falla → la línea impago del saliente YA no está ──
  await alinear(INSC_A, V);
  {
    const engineRoto = async () => ({ created: 0, headers: 0, preserved: 0, error: 'simulado por el probe' });
    const r = await correrSaveMontas({ carreraId: turno2.id, inscs: await inscsDe(turno2.id), cambios: { [INSC_A]: N }, engine: engineRoto });
    const lin = await soloJockey(INSC_A);
    ok('A7) RPC ok + recálculo fallido → el saliente no tiene línea pagable (la borró la RPC); toast rojo que manda a Recalcular',
       (await jockeyDe(INSC_A)).jockey_titular_id === N && !lin.some(l => l.beneficiario_id === V) && lin.length === 0
         && r.toasts.some(t => t.t === 'error' && /Recalcular reuni/.test(t.m)),
       `líneas=${lin.length} · toasts=${r.toasts.map(t => `${t.t}:${t.m.slice(0, 40)}`).join(' | ')}`);
  }
  await reset();

  // ── A8 · UPDATE directo en carrera oficial → el trigger lo rechaza ──
  await alinear(INSC_A, V);
  {
    const { error } = await sb.from('inscripciones').update({ jockey_titular_id: N }).eq('id', INSC_A);
    ok('A8) UPDATE directo de jockey_titular_id en carrera oficial → rechazado por el trigger; la columna no cambia',
       !!error && /oficializada/.test(msg(error)) && (await jockeyDe(INSC_A)).jockey_titular_id === V, msg(error) || 'sin error');
  }

  // ── A9 · propietario pagado + jockey impago → pasa ──
  {
    const prop0 = await q(sb.from('liquidacion_detalle').insert({
      liquidacion_id: HDR_PROP.id, reunion_id: RID, carrera_id: turno2.id, inscripcion_id: INSC_A, posicion: 3,
      concepto: `${TAG} — Carrera 2 — 3° puesto`, descripcion: `${TAG} propietario pagado`, concepto_tipo: 'premio',
      beneficiario_tipo: 'propietario', beneficiario_id: HDR_PROP.propietario_id,
      monto_bruto: 84000, monto_descuento: 0, estado_linea: 'pagado', pagado_at: t0 }).select('id').single(), 'prop fixture');
    const { data, error } = await rpc(INSC_A, N);
    const prop = await q(sb.from('liquidacion_detalle').select('estado_linea,beneficiario_id').eq('id', prop0.id).single(), 'prop after');
    ok('A9) propietario pagado + jockey impago → la RPC pasa (mira sólo al jockey saliente); la línea del propietario queda',
       !error && data?.cambio === true && (await jockeyDe(INSC_A)).jockey_titular_id === N && prop.estado_linea === 'pagado',
       error ? msg(error) : JSON.stringify(data));
  }
  await reset();

  // ── A10 · payload entero con el mismo jockey (inscripciones.html) → pasa ──
  await alinear(INSC_A, V);
  {
    const fila = await q(sb.from('inscripciones').select('*').eq('id', INSC_A).single(), 'fila');
    const payload = { ...fila }; delete payload.id; delete payload.created_at; delete payload.updated_at;
    const { error } = await sb.from('inscripciones').update(payload).eq('id', INSC_A);
    ok('A10) UPDATE con el payload entero y el mismo jockey en carrera oficial → pasa (NEW IS NOT DISTINCT FROM OLD)',
       !error && (await jockeyDe(INSC_A)).jockey_titular_id === V, msg(error) || 'ok');
  }

  // ── A11 · después de la RPC, el UPDATE directo sigue rechazado ──
  {
    const { error: e1 } = await rpc(INSC_A, N);
    const { error: e2 } = await sb.from('inscripciones').update({ jockey_titular_id: V }).eq('id', INSC_A);
    ok('A11) tras una RPC exitosa, un UPDATE directo sigue rechazado (set_config fue local a la transacción de la RPC)',
       !e1 && !!e2 && /oficializada/.test(msg(e2)) && (await jockeyDe(INSC_A)).jockey_titular_id === N, `rpc=${e1 ? msg(e1) : 'ok'} · update=${msg(e2) || 'PASÓ'}`);
  }
  await reset();

  // ── A12 · incentivo pagado del saliente, PERO tiene otra monta en una carrera
  //          provisional (todavía sin resultado oficial) → la RPC pasa y no lo toca ──
  {
    const resC = base.ress.find(r => r.carrera_id === turno3.id);
    await q(sb.from('resultados').update({ estado: 'provisional' }).eq('id', resC.id), 'A12 res provisional');
    await alinear(INSC_C, G);          // G monta en el turno 3, que NO tiene resultado oficial
    await alinear(INSC_A, G);          // y también en el turno 2, que SÍ es oficial
    const { data, error } = await rpc(INSC_A, N);
    const inc = await q(sb.from('liquidacion_detalle').select('estado_linea,recibo_id').eq('id', INC_PAG.id).single(), 'A12 inc');
    ok('A12) incentivo pagado del saliente + otra monta en carrera PROVISIONAL → la RPC pasa y el incentivo no se toca',
       !error && data?.cambio === true && inc.estado_linea === 'pagado' && inc.recibo_id === INC_PAG.recibo_id
         && (await jockeyDe(INSC_A)).jockey_titular_id === N,
       error ? msg(error) : `${JSON.stringify(data)} · incentivo ${inc.estado_linea}${inc.recibo_id ? '+recibo' : ''}`);
  }
  await reset();

  // ── P1/P2/P3 · permisos ──
  await alinear(INSC_A, V);
  {
    const anon = await clienteAnon();
    const { data, error } = await anon.rpc(RPC, { p_inscripcion_id: INSC_A, p_jockey_id: N });
    ok('P1) anon → rechazado antes de entrar a la función (no tiene EXECUTE)',
       !!error && !data && (/permission denied/i.test(msg(error)) || error.code === '42501')
         && (await jockeyDe(INSC_A)).jockey_titular_id === V,
       `code=${error?.code} ${msg(error) || 'SIN ERROR — ENTRÓ'}`);
  }
  {
    const cli = await clienteAuth({ club: CLUB_AJENO, conFila: true, etiqueta: 'otroclub' });
    const { data, error } = await cli.rpc(RPC, { p_inscripcion_id: INSC_A, p_jockey_id: N });
    ok('P2) authenticated con club de otro hipódromo → 42501, la monta no cambia',
       !!error && !data && error.code === '42501' && /otro hipódromo/.test(msg(error))
         && (await jockeyDe(INSC_A)).jockey_titular_id === V,
       `code=${error?.code} ${msg(error) || 'SIN ERROR — PASÓ'}`);
  }
  {
    const cli = await clienteAuth({ club: null, conFila: false, etiqueta: 'sinclub' });
    const { data, error } = await cli.rpc(RPC, { p_inscripcion_id: INSC_A, p_jockey_id: N });
    ok('P3) authenticated SIN fila en usuarios (club NULL) → 42501; NO se lo confunde con service_role',
       !!error && !data && error.code === '42501' && /no tiene hipódromo asignado/.test(msg(error))
         && (await jockeyDe(INSC_A)).jockey_titular_id === V,
       `code=${error?.code} ${msg(error) || 'SIN ERROR — PASÓ COMO SERVICE_ROLE'}`);
  }
} catch (e) {
  console.log('💥 el probe no corrió entero:', e.message);
  failN++; fallas.push('excepción');
} finally {
  try { await limpiarAuth(); } catch (e) { console.log('⚠ limpieza de usuarios de prueba:', e.message); }
  if (base) {
    let difsAntes = [];
    try {
      difsAntes = diffFoto(base, await fotoReunion());
      await restaurarReunion(base);
      const difs = diffFoto(base, await fotoReunion());
      ok('R1) restore por estado: la 9999 quedó exactamente como al empezar (headers, líneas con sus ids, jockeys, resultados)', difs.length === 0, difs.slice(0, 6).join(' | ') || 'sin diferencias');
      const lineasTotales = (await sb.from('liquidacion_detalle').select('id', { count: 'exact', head: true })).count;
      const recibos = (await sb.from('recibos').select('id', { count: 'exact', head: true })).count;
      const perfs = (await sb.from('performances').select('id', { count: 'exact', head: true }).eq('hipodromo_sigla', TAG)).count;
      ok('R2) nada fuera de la 9999 cambió: total de líneas, total de recibos (sin filtro de club) y 0 performances del probe',
         lineasTotales === lineasTotalesAntes && recibos === recibosAntes && perfs === 0,
         `líneas ${lineasTotalesAntes}→${lineasTotales} · recibos ${recibosAntes}→${recibos} · perfs=${perfs} · antes del restore diferían ${difsAntes.length} fila(s), como corresponde a un probe que recalcula`);
    } catch (e) { ok('R1) restore', false, e.message); }
  }
  console.log(`\n${okN}/${okN + failN} OK${failN ? ` — fallan: ${fallas.join(', ')}` : ''}`);
  process.exit(failN ? 1 : 0);
}
