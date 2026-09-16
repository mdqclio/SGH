/**
 * probe_modificar_inscripcion_portal.mjs — "Modificar" en Mis inscripciones.
 *
 * EL PEDIDO (Yesi, 14/09/2026)
 * ---------------------------------------------------------------------------
 * El entrenador puede cambiar caballeriza, entrenador que presenta, jockey y
 * suplente de una inscripción que cargó él desde el portal. El caballo y el
 * turno NO: eso es retirar y anotar de nuevo.
 * Plan: docs/diagnosticos/2026-09-14_plan-modificar-inscripcion-portal.md.
 *
 * LO QUE ESTE PROBE FIJA
 * ---------------------------------------------------------------------------
 *  · Mismos guards que rpc_baja_inscripcion (propia, publicada, ventana de
 *    inscripción O ratificación fail-closed, estado admitido por rama).
 *  · A0 transversal: spc_id, carrera_id, estado, numero_partidor, canal e
 *    inscripto_por NO cambian nunca — se snapshotean antes de CADA llamada.
 *  · La cadena del propietario: trg_insc_set_propietario re-deriva
 *    propietario_id al cambiar la caballeriza; si la nueva no tiene titular
 *    queda NULL y el RPC lo DICE (sin_propietario=true). GOTCHA #47.
 *  · GATE-1 = B: cambiar el entrenador NO transfiere inscripto_por.
 *  · Un ratificado no se queda sin jockey (D2).
 *
 * PATRÓN
 * ---------------------------------------------------------------------------
 * Copia de probe_forfait_portal.mjs: sesiones de portal reales (magiclink +
 * verifyOtp) contra el RPC REAL, relectura con admin (GOTCHA #93), fixture
 * propio (reuniones 9987/9986, fecha 2099) con teardown en el `finally`.
 * NO toca R9 ni ninguna reunión real. La parte de UI extrae funciones de
 * portal.html y las corre con stubs de DOM.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_modificar_inscripcion_portal.mjs
 *   node tests/probe_modificar_inscripcion_portal.mjs --mutantes
 *
 *   # contra el HTML servido (después del merge):
 *   PORTAL_HTML=https://sigh.com.ar/portal.html node tests/probe_modificar_inscripcion_portal.mjs
 *
 * Los mutantes de SQL se aplican sobre una función GEMELA
 * (`rpc_modificar_inscripcion_mut`) por MCP y el probe hijo la llama por env
 * RPC_MOD. La función real de producción NUNCA se toca.
 */

process.env.TZ = 'America/Argentina/Buenos_Aires';

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
// Baseline de CLAUDE.md (guard de sesión). Se actualiza cuando hay altas/bajas.
const SPCS_BASELINE = 210;

const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }
const admin = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const HERE = dirname(fileURLToPath(import.meta.url));
const PORTAL_PATH = process.env.PORTAL_HTML || join(HERE, '..', 'portal.html');
// PORTAL_HTML puede ser una URL: así el probe corre contra lo que SIRVE
// sigh.com.ar después del merge, no sólo contra el archivo local.
const PORTAL = PORTAL_PATH.startsWith('http')
  ? await (await fetch(`${PORTAL_PATH}${PORTAL_PATH.includes('?') ? '&' : '?'}v=${Date.now()}`, { cache: 'no-store' })).text()
  : readFileSync(PORTAL_PATH, 'utf8');
const JOCKEY_JS = readFileSync(join(HERE, '..', 'jockey-repetido.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const RPC_MOD = process.env.RPC_MOD || 'rpc_modificar_inscripcion';

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

const RUN = Math.random().toString(36).slice(2, 8);
const PASS = `Probe-${RUN}-${Math.random().toString(36).slice(2, 10)}!`;
const mail = (q) => `probe-mod-${q}-${RUN}@sgh-probe.invalid`;
const fx = { authIds: [], usuarios: [], profesionales: [], caballerizas: [], responsables: [],
             propietarios: [], spcs: [], reuniones: [], carreras: [], inscripciones: [] };
const die = (ctx, e) => { throw new Error(`[${ctx}] ${e?.message ?? JSON.stringify(e)}`); };

async function ins(tabla, fila, bucket) {
  const { data, error } = await admin.from(tabla).insert(fila).select('id').single();
  if (error) die(`insert ${tabla}`, error);
  if (bucket) fx[bucket].push(data.id);
  return data.id;
}

async function clientePortal(email) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) die(`generateLink ${email}`, error);
  const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e2 } = await sb.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (e2) die(`verifyOtp ${email}`, e2);
  return sb;
}

// rol 'profesional' con entidad → usuario de portal. rol 'secretario_carreras'
// sin entidad → staff (A19).
async function crearUsuario(q, entidadId, rol = 'profesional') {
  const email = mail(q);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  if (error) die(`createUser ${q}`, error);
  fx.authIds.push(data.user.id);
  const { data: uRow, error: e2 } = await admin.from('usuarios').insert({
    email, nombre_completo: `Probe MOD ${q} ${RUN}`, club_id: CLUB, rol,
    activo: true, estado: 'activo', password_hash: '', auth_user_id: data.user.id,
    entidad_tipo: entidadId ? 'profesional' : null, entidad_id: entidadId,
  }).select('id').single();
  if (e2) die(`insert usuarios ${q}`, e2);
  fx.usuarios.push(email);
  return { email, usuarioId: uRow.id };
}

const COLS_FIJAS = ['spc_id', 'carrera_id', 'estado', 'numero_partidor', 'canal', 'inscripto_por'];
/** Relee la fila con ADMIN. null = ya no existe. */
const leer = async (id) => {
  const { data } = await admin.from('inscripciones')
    .select('id,spc_id,carrera_id,estado,numero_partidor,canal,inscripto_por,caballeriza_id,entrenador_id,jockey_titular_id,jockey_suplente_id,propietario_id')
    .eq('id', id).maybeSingle();
  return data ?? null;
};

// A0 transversal: antes de CADA llamada se snapshotean las columnas que el RPC
// no puede tocar; después se comparan. Cualquier diferencia queda anotada.
const a0Fallas = [];
let a0Llamadas = 0;
const mod = async (sb, id, p) => {
  const antes = await leer(id);
  const { data, error } = await sb.rpc(RPC_MOD, {
    p_inscripcion_id: id, p_caballeriza_id: p.cab, p_entrenador_id: p.ent,
    p_jockey_titular_id: p.joc ?? null, p_jockey_suplente_id: p.sup ?? null,
  });
  const despues = await leer(id);
  a0Llamadas++;
  if (antes && despues) {
    const dif = COLS_FIJAS.filter(c => antes[c] !== despues[c]);
    if (dif.length) a0Fallas.push(`${id.slice(0, 8)}: ${dif.map(c => `${c} ${antes[c]}→${despues[c]}`).join(', ')}`);
  } else if (antes && !despues) {
    a0Fallas.push(`${id.slice(0, 8)}: la fila DESAPARECIÓ`);
  }
  return { ok: !error, data: data ?? null, msg: error?.message ?? null, fila: despues };
};

// ═════════════════════════════ MUTATION TESTING ═════════════════════════════
const SQL_PATH = join(HERE, '..', 'migrations', 'rpc_modificar_inscripcion.sql');
const SQL_RAW = readFileSync(SQL_PATH, 'utf8');
const SQL_BASE = SQL_RAW.slice(SQL_RAW.indexOf('CREATE OR REPLACE FUNCTION'));

const MUTANTES = [
  { id: 'M1', tipo: 'sql', desc: 'cae canal=portal del guard de tenencia (se modifica lo de la secretaría)', mata: ['A6'],
    from: `  IF v_insc.canal IS DISTINCT FROM 'portal'\n     OR v_insc.inscripto_por IS DISTINCT FROM v_usuario_id\n  THEN`,
    to:   `  IF v_insc.inscripto_por IS DISTINCT FROM v_usuario_id THEN` },

  { id: 'M2', tipo: 'sql', desc: 'cae inscripto_por=yo del guard de tenencia (se modifica lo de otro)', mata: ['A5'],
    from: `  IF v_insc.canal IS DISTINCT FROM 'portal'\n     OR v_insc.inscripto_por IS DISTINCT FROM v_usuario_id\n  THEN`,
    to:   `  IF v_insc.canal IS DISTINCT FROM 'portal' THEN` },

  { id: 'M3', tipo: 'sql', desc: 'cae el guard de reunión publicada', mata: ['A10'],
    from: `  IF v_carrera.reunion_estado IS DISTINCT FROM 'publicada' THEN`,
    to:   `  IF false THEN` },

  { id: 'M4', tipo: 'sql', desc: 'la ventana de INSCRIPCIÓN queda siempre abierta', mata: ['A7', 'A8'],
    from: `  v_en_inscripcion := v_carrera.apertura_inscripcion IS NOT NULL`,
    to:   `  v_en_inscripcion := true; PERFORM v_carrera.apertura_inscripcion IS NOT NULL` },

  { id: 'M5', tipo: 'sql', desc: 'la ventana de RATIFICACIÓN nunca se abre', mata: ['A2', 'A3'],
    from: `  v_en_ratificacion := v_carrera.apertura_ratificacion IS NOT NULL`,
    to:   `  v_en_ratificacion := false; PERFORM v_carrera.apertura_ratificacion IS NOT NULL` },

  { id: 'M6', tipo: 'sql', desc: 'el fail-closed de NULL desaparece: sin fechas, ventana abierta', mata: ['A9'],
    from: `  v_en_ratificacion := v_carrera.apertura_ratificacion IS NOT NULL\n                   AND v_carrera.cierre_ratificacion   IS NOT NULL\n                   AND now() >= v_carrera.apertura_ratificacion\n                   AND now() <= v_carrera.cierre_ratificacion;`,
    to:   `  v_en_ratificacion := coalesce(now() >= v_carrera.apertura_ratificacion, true)\n                   AND coalesce(now() <= v_carrera.cierre_ratificacion, true);` },

  { id: 'M7', tipo: 'sql', desc: 'en ratificación se acepta cualquier estado (un forfait se modifica)', mata: ['A21'],
    from: `    IF v_insc.estado NOT IN ('inscripto', 'ratificado') THEN`,
    to:   `    IF false THEN` },

  { id: 'M8', tipo: 'sql', desc: 'cae "un ratificado necesita jockey"', mata: ['A4'],
    from: `  IF v_insc.estado = 'ratificado' AND p_jockey_titular_id IS NULL THEN`,
    to:   `  IF false THEN` },

  { id: 'M9', tipo: 'sql', desc: 'el SET pisa estado (un ratificado vuelve a inscripto)', mata: ['A0', 'A3'],
    from: `     SET caballeriza_id     = p_caballeriza_id,`,
    to:   `     SET caballeriza_id     = p_caballeriza_id,\n         estado             = 'inscripto',` },

  { id: 'M10', tipo: 'sql', desc: 'sin_propietario siempre false (el RPC no avisa)', mata: ['A12'],
    from: `  v_sin_propietario := v_titular_nuevo IS NULL;`,
    to:   `  v_sin_propietario := false;` },

  { id: 'M11', tipo: 'sql', desc: 'cae el chequeo post-trigger y el SET deja propietario_id en NULL', mata: ['A11', 'A13'],
    from: `  IF v_propietario_post IS DISTINCT FROM v_titular_nuevo THEN`,
    to:   `  UPDATE inscripciones SET propietario_id = NULL WHERE id = p_inscripcion_id;\n  v_propietario_post := NULL;\n  IF false THEN` },

  { id: 'M12', tipo: 'sql', desc: 'cae la validación de padrón del entrenador', mata: ['A15'],
    from: `  IF NOT EXISTS (\n    SELECT 1 FROM profesionales\n     WHERE id = p_entrenador_id AND activo\n       AND tipo IN ('entrenador', 'ambos') AND club_id = v_club_id\n  ) THEN`,
    to:   `  IF false THEN` },

  { id: 'M13', tipo: 'sql', desc: 'cae "suplente sin titular"', mata: ['A16'],
    from: `    IF p_jockey_titular_id IS NULL THEN\n      RAISE EXCEPTION 'No se puede declarar un suplente sin jockey titular.';\n    END IF;`,
    to:   `` },

  { id: 'M14', tipo: 'sql', desc: 'GATE-1=B roto: el RPC pisa inscripto_por con NULL', mata: ['A0', 'A17'],
    from: `         jockey_suplente_id = p_jockey_suplente_id\n   WHERE id = p_inscripcion_id;`,
    to:   `         jockey_suplente_id = p_jockey_suplente_id,\n         inscripto_por      = NULL\n   WHERE id = p_inscripcion_id;` },

  { id: 'M16', tipo: 'sql', desc: 'cae el guard de turno anulado', mata: ['A22'],
    from: `  IF v_carrera.estado IS NOT DISTINCT FROM 'anulada' THEN`,
    to:   `  IF false THEN` },

  // M15 (FOR UPDATE quitado) NO está en la tanda: es concurrencia, un probe
  // secuencial no lo puede matar. Se declara equivalente-no-cubierto.

  { id: 'P1', tipo: 'portal', desc: 'el botón Modificar sale siempre, sin modoRetiro', mata: ['U1'],
    from: `function accionesFila(i) {\n  const modo = modoRetiro(i);\n  if (!modo) return '<span style="color:var(--muted);font-size:12px;">—</span>';`,
    to:   `function accionesFila(i) {\n  const modo = modoRetiro(i);\n  if (!modo) return \`<button class="btn-sm btn-modificar" onclick="abrirModificar('\${esc(i.id)}')">Modificar</button>\`;` },

  { id: 'P2', tipo: 'portal', desc: 'el select deja de pedir caballeriza/entrenador/suplente/propietario', mata: ['U2'],
    from: `          + 'caballeriza_id,entrenador_id,jockey_suplente_id,propietario_id,'\n`, to: `` },

  { id: 'P3', tipo: 'portal', desc: 'el confirm() de cambio de entrenador desaparece', mata: ['U3'],
    from: `  if (entrenadorId !== i.entrenador_id) {`, to: `  if (false) {` },

  { id: 'P4', tipo: 'portal', desc: 'el confirm() de caballeriza sin titular desaparece', mata: ['U4'],
    from: `  if (caballerizaSinTitular(caballerizaId)) {`, to: `  if (false) {` },

  { id: 'P4b', tipo: 'portal', desc: 'el confirm() de caballeriza se muestra pero se guarda igual con "Cancelar"', mata: ['U4'],
    from: '¿Guardar igual?`)) return;', to: '¿Guardar igual?`)) {}' },

  { id: 'P5', tipo: 'portal', desc: 'la propia fila cuenta en el aviso de jockey repetido', mata: ['U5'],
    from: `    && i.id !== excluirInscId\n`, to: `` },

  { id: 'P6', tipo: 'portal', desc: 'el toast de sin_propietario desaparece', mata: ['U6'],
    from: `  if (data?.sin_propietario) toast(AVISO_CAB_SIN_TITULAR, 'warning');\n`, to: `` },

  { id: 'P7', tipo: 'portal', desc: 'el modal de modificar no excluye la propia fila del aviso', mata: ['U5'],
    from: `    inscModificando?.carrera_id || null,\n    inscModificando?.id || null);`,
    to:   `    inscModificando?.carrera_id || null,\n    null);` },

  { id: 'P8', tipo: 'portal', desc: 'un ratificado sin jockey pasa el corte del front', mata: ['U7'],
    from: `  if (i.estado === 'ratificado' && !jockeyId) return falla(`, to: `  if (false) return falla(` },
];

const argMut = process.argv.find(a => a === '--mutantes' || a.startsWith('--mutantes='));
if (argMut) {
  const pedidos = argMut.includes('=') ? argMut.split('=')[1].split(',').map(s => s.trim()).filter(Boolean) : null;
  if (pedidos) {
    const d = pedidos.filter(p => !MUTANTES.some(m => m.id === p));
    if (d.length) { console.error(`mutantes inexistentes: ${d.join(', ')}`); process.exit(2); }
  }
  const tanda = pedidos ? MUTANTES.filter(m => pedidos.includes(m.id)) : MUTANTES;
  const SELF = fileURLToPath(import.meta.url);
  const dir = mkdtempSync(join(tmpdir(), 'mut-modificar-'));
  try { symlinkSync(join(HERE, '..', 'node_modules'), join(dir, 'node_modules'), 'dir'); }
  catch (e) { console.warn(`[runner] symlink node_modules: ${e.message}`); }

  const GEMELA = 'rpc_modificar_inscripcion_mut';
  const sqlPendientes = [];

  console.log(`\n═══ MUTATION TESTING · ${tanda.length}/${MUTANTES.length} mutantes ═══\n(copias en ${dir} — el repo y la función real no se tocan)\n`);
  let vivos = 0, arnes = 0;
  for (const m of tanda) {
    const src = m.tipo === 'sql' ? SQL_BASE : PORTAL;
    if (!src.includes(m.from)) {
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el ancla no existe en el fuente. ${m.desc}`); arnes++; continue;
    }
    if (m.tipo === 'sql') {
      const p = join(dir, `${m.id}.sql`);
      // La gemela: mismo cuerpo mutado, otro nombre en CREATE/COMMENT/REVOKE/GRANT.
      writeFileSync(p, SQL_BASE.replace(m.from, m.to)
        .replaceAll('public.rpc_modificar_inscripcion(', `public.${GEMELA}(`));
      sqlPendientes.push({ id: m.id, desc: m.desc, mata: m.mata, path: p });
      continue;
    }
    const env = { ...process.env };
    const p = join(dir, `${m.id}.html`);
    writeFileSync(p, PORTAL.replace(m.from, m.to));
    env.PORTAL_HTML = p;
    let out = '';
    try { out = execFileSync(process.execPath, [SELF], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    if (!/^\d+\/\d+ OK$/m.test(out)) {   // GOTCHA #84
      const causa = (out.split('\n').find(l => /Error|error:/.test(l)) || '(sin línea de error)').trim();
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — no llegó a los asserts. ${m.desc}\n     ↳ ${causa.slice(0, 200)}`);
      arnes++; continue;
    }
    const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));   // GOTCHA #82
    const vivo = muertos.length === 0;
    if (vivo) vivos++;
    console.log(`${vivo ? '❌' : '✅'} ${m.id} ${vivo ? 'SOBREVIVE' : 'muere'} — ${m.desc}`
      + `  [esperaba matar ${m.mata.join(',')}${muertos.length ? `; murieron ${muertos.join(',')}` : ''}]`);
  }
  const auto = tanda.length - sqlPendientes.length;
  const partes = [`${auto - vivos - arnes} muertos`];
  if (vivos) partes.push(`${vivos} SOBREVIVEN`);
  if (arnes) partes.push(`${arnes} ERROR DE ARNÉS`);
  console.log(`\n${vivos === 0 && arnes === 0 ? '✅ TANDA LIMPIA' : '❌ TANDA CON HALLAZGOS'} — ${auto} automáticos · ${partes.join(' · ')}`);

  if (sqlPendientes.length) {
    console.log(`\n── ${sqlPendientes.length} mutantes de SQL: requieren DDL, se aplican por MCP ──`);
    console.log('Para cada uno:');
    console.log(`  1. apply_migration con el contenido del .sql  (crea ${GEMELA})`);
    console.log(`  2. RPC_MOD=${GEMELA} node tests/probe_modificar_inscripcion_portal.mjs`);
    console.log(`  3. execute_sql: DROP FUNCTION IF EXISTS public.${GEMELA}(uuid,uuid,uuid,uuid,uuid);`);
    console.log('La función REAL rpc_modificar_inscripcion no se toca en ningún momento.\n');
    sqlPendientes.forEach(m => console.log(`  ${m.id}  mata ${m.mata.join(',')}  — ${m.desc}\n       ${m.path}`));
    console.log('');
  }
  process.exit(vivos === 0 && arnes === 0 ? 0 : 1);
}

// ══════════════════════════════ CORRIDA NORMAL ══════════════════════════════
// Extrae una función de portal.html por ancla, con balance de llaves.
function bloque(src, ancla) {
  const i = src.indexOf(ancla);
  if (i < 0) throw new Error(`no encontré: ${ancla}`);
  let d = 0;
  for (let k = i + ancla.length - 1; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error(`no pude cerrar: ${ancla}`);
}
function linea(src, ancla) {
  const i = src.indexOf(ancla);
  if (i < 0) throw new Error(`no encontré: ${ancla}`);
  return src.slice(i, src.indexOf('\n', i));
}

(async () => {
  const { count: spcsAntes } = await admin.from('spcs').select('id', { count: 'exact', head: true });
  let propietarioCabCon = null;
  const DNI_PROBE = `PM${RUN}`;
  try {
    const { data: hip } = await admin.from('hipodromos').select('id').eq('club_id', CLUB).limit(1).single();
    const { data: cat } = await admin.from('categorias_carrera').select('id').eq('club_id', CLUB).limit(1).single();

    const pro = (tipo, n, extra = {}) => ins('profesionales', { club_id: CLUB, tipo, nombre: `PROBE-MOD-${n}`, apellido: RUN, hipodromo_patente: 'DOL', activo: true, ...extra }, 'profesionales');
    const profA  = await pro('entrenador', 'A');
    const profB  = await pro('entrenador', 'B');
    const profC  = await pro('entrenador', 'C');                    // sin cuenta de portal
    const profX  = await pro('entrenador', 'X', { activo: false }); // inactivo
    const j1     = await pro('jockey', 'J1');
    const j2     = await pro('jockey', 'J2');

    const cabCon = await ins('caballerizas', { club_id: CLUB, nombre: `PROBE-MOD-CAB-CON-${RUN}`, hipodromo_patente: 'DOL', activo: true }, 'caballerizas');
    const cabSin = await ins('caballerizas', { club_id: CLUB, nombre: `PROBE-MOD-CAB-SIN-${RUN}`, hipodromo_patente: 'DOL', activo: true }, 'caballerizas');
    // Titular de cabCon: trg_cab_resp_set_propietario crea el propietario
    // a partir del DNI (la misma cadena que usa caballerizas.html).
    const respId = await ins('caballeriza_responsables', { caballeriza_id: cabCon, rol: 'propietario', documento_tipo: 'DNI', documento_nro: DNI_PROBE, apellido: 'PROBE-MOD', nombre: RUN, activo: true }, 'responsables');
    const { data: resp } = await admin.from('caballeriza_responsables').select('propietario_id').eq('id', respId).single();
    propietarioCabCon = resp?.propietario_id || null;
    if (propietarioCabCon) fx.propietarios.push(propietarioCabCon);
    ok('F0) fixture: la caballeriza CON titular tiene propietario derivado por el trigger de responsables',
       !!propietarioCabCon, `propietario_id=${propietarioCabCon}`);

    const uA = await crearUsuario('a', profA);
    const uB = await crearUsuario('b', profB);
    const uS = await crearUsuario('staff', null, 'secretario_carreras');
    const sbA = await clientePortal(uA.email);
    const sbB = await clientePortal(uB.email);
    const sbS = await clientePortal(uS.email);

    const spc = async (n) => ins('spcs', { nombre: `PROBE-MOD-${n}-${RUN}`, fecha_nacimiento: '2020-01-01', sexo: 'macho', estado: 'activo', entrenador_id: profA, caballeriza_id: cabCon }, 'spcs');

    const reunPub  = await ins('reuniones', { club_id: CLUB, hipodromo_id: hip.id, numero: 9987, fecha: '2099-07-12', estado: 'publicada' }, 'reuniones');
    const reunBorr = await ins('reuniones', { club_id: CLUB, hipodromo_id: hip.id, numero: 9986, fecha: '2099-07-13', estado: 'borrador' }, 'reuniones');

    const ayer      = new Date(Date.now() - 86400e3).toISOString();
    const anteayer  = new Date(Date.now() - 2 * 86400e3).toISOString();
    const manana    = new Date(Date.now() + 86400e3).toISOString();
    const pasado    = new Date(Date.now() + 2 * 86400e3).toISOString();

    const carrera = (reunion, turno, extra) => ins('carreras', {
      reunion_id: reunion, numero_turno: turno, categoria_id: cat.id,
      distancia_metros: 1000, estado: 'abierta', bolsa_total: 1000000,
      apertura_inscripcion: ayer, cierre_inscripcion: manana,
      apertura_ratificacion: null, cierre_ratificacion: null, ...extra,
    }, 'carreras');

    const cInsc  = await carrera(reunPub, 1, { apertura_ratificacion: manana, cierre_ratificacion: pasado });
    const cRat   = await carrera(reunPub, 2, { apertura_inscripcion: anteayer, cierre_inscripcion: ayer, apertura_ratificacion: ayer, cierre_ratificacion: manana });
    const cHueco = await carrera(reunPub, 3, { apertura_inscripcion: anteayer, cierre_inscripcion: ayer, apertura_ratificacion: manana, cierre_ratificacion: pasado });
    const cDesp  = await carrera(reunPub, 4, { apertura_inscripcion: anteayer, cierre_inscripcion: ayer, apertura_ratificacion: anteayer, cierre_ratificacion: ayer });
    const cNull  = await carrera(reunPub, 5, { apertura_inscripcion: anteayer, cierre_inscripcion: ayer });
    const cAnul  = await carrera(reunPub, 6, { estado: 'anulada', apertura_ratificacion: ayer, cierre_ratificacion: manana });
    const cBorr  = await carrera(reunBorr, 1, { apertura_ratificacion: ayer, cierre_ratificacion: manana });

    // Las filas se insertan con admin (canal='portal', inscripto_por=A): en
    // cRat/cDesp/… la ventana de inscripción está cerrada y rpc_inscribir no
    // las dejaría entrar. Es el mismo atajo de probe_forfait_portal.
    const anotar = async (carreraId, spcId, extra = {}) => ins('inscripciones', {
      carrera_id: carreraId, spc_id: spcId, estado: 'inscripto', canal: 'portal',
      inscripto_por: uA.usuarioId, caballeriza_id: cabCon, entrenador_id: profA,
      jockey_titular_id: j1, ...extra,
    }, 'inscripciones');
    const base = { cab: cabCon, ent: profA, joc: j1 };

    // ── A) EL RPC ───────────────────────────────────────────────────────────
    console.log('\n── El RPC ──');

    // A1 · ventana de inscripción: jockey j1→j2 + suplente
    const i1 = await anotar(cInsc, await spc('1'));
    const r1 = await mod(sbA, i1, { ...base, joc: j2, sup: j1 });
    ok('A1) A modifica lo suyo en la ventana de INSCRIPCIÓN (jockey j1→j2, suplente j1)',
       r1.ok && r1.fila?.jockey_titular_id === j2 && r1.fila?.jockey_suplente_id === j1 && r1.data?.ok === true,
       `ok=${r1.ok} msg=${r1.msg} data=${JSON.stringify(r1.data)}`);

    // A2 · ventana de ratificación, inscripto
    const i2 = await anotar(cRat, await spc('2'));
    const r2 = await mod(sbA, i2, { ...base, joc: j2 });
    ok('A2) A modifica lo suyo en la ventana de RATIFICACIÓN, estado inscripto',
       r2.ok && r2.fila?.jockey_titular_id === j2, `ok=${r2.ok} msg=${r2.msg}`);

    // A3 · ratificado con partidor: cambia jockey, estado y partidor intactos
    const i3 = await anotar(cRat, await spc('3'), { estado: 'ratificado', numero_partidor: 5 });
    const r3 = await mod(sbA, i3, { ...base, joc: j2 });
    ok('A3) un RATIFICADO cambia de jockey en la ventana de ratificación; estado y numero_partidor intactos',
       r3.ok && r3.fila?.jockey_titular_id === j2 && r3.fila?.estado === 'ratificado' && r3.fila?.numero_partidor === 5,
       `ok=${r3.ok} msg=${r3.msg} estado=${r3.fila?.estado} partidor=${r3.fila?.numero_partidor}`);

    // A4 · ratificado sin jockey → no (D2)
    const r4 = await mod(sbA, i3, { ...base, joc: null });
    const f4 = await leer(i3);
    ok('A4) un RATIFICADO no puede quedar sin jockey (D2); la fila no cambia',
       !r4.ok && /jockey/i.test(r4.msg || '') && f4?.jockey_titular_id === j2, `msg=${r4.msg} jockey=${f4?.jockey_titular_id}`);

    // A5 · B modifica lo de A
    const r5 = await mod(sbB, i2, { ...base, joc: j1 });
    ok('A5) B no puede modificar lo que cargó A', !r5.ok && /no la cargó usted/.test(r5.msg || '') && r5.fila?.jockey_titular_id === j2, `msg=${r5.msg}`);

    // A6 · lo de la secretaría
    const i6 = await anotar(cInsc, await spc('6'), { canal: 'manual', inscripto_por: uA.usuarioId });
    const r6 = await mod(sbA, i6, { ...base, joc: j2 });
    ok('A6) no se modifica lo que cargó la SECRETARÍA (canal manual), aunque inscripto_por sea yo',
       !r6.ok && /no la cargó usted/.test(r6.msg || '') && r6.fila?.jockey_titular_id === j1, `msg=${r6.msg}`);

    // A7/A8/A9 · fuera de ventana
    const i7 = await anotar(cDesp, await spc('7'));
    const r7 = await mod(sbA, i7, { ...base, joc: j2 });
    ok('A7) las dos ventanas cerradas → Fuera de plazo', !r7.ok && /Fuera de plazo/.test(r7.msg || '') && r7.fila?.jockey_titular_id === j1, `msg=${r7.msg}`);

    const i8 = await anotar(cHueco, await spc('8'));
    const r8 = await mod(sbA, i8, { ...base, joc: j2 });
    ok('A8) el HUECO entre cierre de inscripción y apertura de ratificación → Fuera de plazo',
       !r8.ok && /Fuera de plazo/.test(r8.msg || '') && r8.fila?.jockey_titular_id === j1, `msg=${r8.msg}`);

    const i9 = await anotar(cNull, await spc('9'));
    const r9 = await mod(sbA, i9, { ...base, joc: j2 });
    ok('A9) ratificación en NULL → fail-closed, Fuera de plazo',
       !r9.ok && /Fuera de plazo/.test(r9.msg || '') && r9.fila?.jockey_titular_id === j1, `msg=${r9.msg}`);

    // A10 · reunión borrador
    const i10 = await anotar(cBorr, await spc('10'));
    const r10 = await mod(sbA, i10, { ...base, joc: j2 });
    ok('A10) reunión no publicada, rechaza', !r10.ok && /no está publicada/.test(r10.msg || ''), `msg=${r10.msg}`);

    // A22 · turno anulado
    const i22 = await anotar(cAnul, await spc('22'));
    const r22 = await mod(sbA, i22, { ...base, joc: j2 });
    ok('A22) turno anulado, rechaza', !r22.ok && /anulado/.test(r22.msg || '') && r22.fila?.jockey_titular_id === j1, `msg=${r22.msg}`);

    // A11/A12/A13/A14 · la cadena del propietario
    const i11 = await anotar(cInsc, await spc('11'));
    const f11pre = await leer(i11);
    ok('A11-pre) la fila arranca con el propietario de cabCon (derivado en el INSERT)',
       f11pre?.propietario_id === propietarioCabCon, `propietario=${f11pre?.propietario_id}`);

    const r12 = await mod(sbA, i11, { ...base, cab: cabSin });
    ok('A12) cambiar a una caballeriza SIN titular: ok, propietario_id queda NULL y el RPC lo DICE (sin_propietario=true)',
       r12.ok && r12.fila?.caballeriza_id === cabSin && r12.fila?.propietario_id === null && r12.data?.sin_propietario === true,
       `ok=${r12.ok} msg=${r12.msg} prop=${r12.fila?.propietario_id} data=${JSON.stringify(r12.data)}`);

    const r13 = await mod(sbA, i11, { ...base, cab: cabCon });
    ok('A13) volver a la caballeriza CON titular: el trigger re-deriva, propietario vuelve; sin_propietario=false',
       r13.ok && r13.fila?.propietario_id === propietarioCabCon && r13.data?.sin_propietario === false && r13.data?.propietario_id === propietarioCabCon,
       `ok=${r13.ok} prop=${r13.fila?.propietario_id} data=${JSON.stringify(r13.data)}`);

    const r11 = await mod(sbA, i11, { ...base, cab: cabCon, joc: j2 });
    ok('A11) con caballeriza CON titular, propietario_id = el titular y sin_propietario=false',
       r11.ok && r11.fila?.propietario_id === propietarioCabCon && r11.data?.sin_propietario === false, `prop=${r11.fila?.propietario_id}`);

    // A14 · sólo jockey, con propietario puesto → intacto
    const r14 = await mod(sbA, i11, { ...base, cab: cabCon, joc: j1 });
    ok('A14) cambiar sólo el jockey deja propietario_id intacto',
       r14.ok && r14.fila?.propietario_id === propietarioCabCon && r14.fila?.jockey_titular_id === j1, `prop=${r14.fila?.propietario_id}`);

    // A15 · padrón del entrenador
    const r15a = await mod(sbA, i1, { ...base, ent: profX, joc: j2 });
    const r15b = await mod(sbA, i1, { ...base, ent: j1, joc: j2 });
    const r15c = await mod(sbA, i1, { ...base, cab: '00000000-0000-0000-0000-000000000000', joc: j2 });
    ok('A15) entrenador inactivo / un jockey como entrenador / caballeriza inexistente → error de padrón; fila intacta',
       !r15a.ok && /entrenador declarado no está en el padrón/.test(r15a.msg || '')
       && !r15b.ok && /entrenador declarado no está en el padrón/.test(r15b.msg || '')
       && !r15c.ok && /caballeriza no existe o no está activa/.test(r15c.msg || '')
       && r15c.fila?.entrenador_id === profA && r15c.fila?.caballeriza_id === cabCon,
       `a=${r15a.msg} · b=${r15b.msg} · c=${r15c.msg}`);

    // A16 · suplente
    const r16a = await mod(sbA, i1, { ...base, joc: null, sup: j2 });
    const r16b = await mod(sbA, i1, { ...base, joc: j2, sup: j2 });
    ok('A16) suplente sin titular / suplente = titular → error',
       !r16a.ok && /suplente sin jockey titular/.test(r16a.msg || '') && !r16b.ok && /mismo jockey que el titular/.test(r16b.msg || '') && r16b.fila?.jockey_suplente_id === null,
       `a=${r16a.msg} · b=${r16b.msg}`);

    // A17 · cambio de entrenador → GATE-1 = B: inscripto_por NO se transfiere
    const r17 = await mod(sbA, i1, { ...base, ent: profC, joc: j2 });
    ok('A17) cambiar el entrenador a uno SIN cuenta: ok, cambio_entrenador=true, inscripto_por INTACTO (GATE-1=B), sigue_siendo_mia=true',
       r17.ok && r17.fila?.entrenador_id === profC && r17.fila?.inscripto_por === uA.usuarioId
       && r17.data?.cambio_entrenador === true && r17.data?.sigue_siendo_mia === true,
       `ok=${r17.ok} msg=${r17.msg} inscripto_por=${r17.fila?.inscripto_por} data=${JSON.stringify(r17.data)}`);
    const r17b = await mod(sbA, i1, { ...base, ent: profB, joc: j2 });
    const r17c = await mod(sbB, i1, { ...base, ent: profB, joc: j1 });
    ok('A18) cambiar el entrenador a B (con cuenta): A la sigue modificando, B NO (la tenencia es quién la cargó)',
       r17b.ok && r17b.fila?.inscripto_por === uA.usuarioId && !r17c.ok && /no la cargó usted/.test(r17c.msg || '') && r17c.fila?.jockey_titular_id === j2,
       `A=${r17b.ok} B=${r17c.msg}`);
    const r17d = await mod(sbA, i1, { ...base, joc: j2 });
    ok('A17c) volver al entrenador original: cambio_entrenador=true (cambió respecto de la fila) y sin cambio → false',
       r17d.ok && r17d.data?.cambio_entrenador === true && (await mod(sbA, i1, { ...base, joc: j2 })).data?.cambio_entrenador === false);

    // A19 · staff
    const r19 = await mod(sbS, i1, { ...base, joc: j1 });
    ok('A19) una sesión de STAFF (sin entidad de portal) no puede usar el RPC', !r19.ok && /usuarios del portal/.test(r19.msg || ''), `msg=${r19.msg}`);

    // A21 · un forfait no se modifica (rama ratificación)
    const i21 = await anotar(cRat, await spc('21'), { estado: 'forfait', numero_partidor: null });
    const r21 = await mod(sbA, i21, { ...base, joc: j2 });
    ok('A21) un FORFAIT no se modifica desde el portal', !r21.ok && /forfait/.test(r21.msg || '') && r21.fila?.jockey_titular_id === j1, `msg=${r21.msg}`);
    // A23 · en ventana de inscripción, un ratificado no se toca (ya procesado)
    const i23 = await anotar(cInsc, await spc('23'), { estado: 'ratificado', numero_partidor: 2 });
    const r23 = await mod(sbA, i23, { ...base, joc: j2 });
    ok('A23) en ventana de INSCRIPCIÓN (sin ratificación) un ratificado ya fue procesado: rechaza',
       !r23.ok && /procesada/.test(r23.msg || '') && r23.fila?.jockey_titular_id === j1, `msg=${r23.msg}`);

    // A20 · auditoría
    const { data: aud } = await admin.from('auditoria').select('accion,usuario_id,datos_antes,datos_despues')
      .eq('tabla', 'inscripciones').eq('registro_id', i1).eq('accion', 'UPDATE').order('created_at').limit(1);
    const a20 = aud?.[0];
    ok('A20) auditoria tiene el UPDATE de A1 con OLD/NEW (jockey j1→j2) y el usuario A',
       !!a20 && a20.datos_antes?.jockey_titular_id === j1 && a20.datos_despues?.jockey_titular_id === j2 && a20.usuario_id === uA.usuarioId,
       `fila=${JSON.stringify(a20 && { accion: a20.accion, usuario: a20.usuario_id, antes: a20.datos_antes?.jockey_titular_id, despues: a20.datos_despues?.jockey_titular_id })}`);

    // A0 · transversal
    ok(`A0) en ${a0Llamadas} llamadas, spc_id/carrera_id/estado/numero_partidor/canal/inscripto_por NUNCA cambiaron`,
       a0Fallas.length === 0, a0Fallas.join(' | '));

    // ── U) LA UI ────────────────────────────────────────────────────────────
    console.log('\n── La UI ──');
    const piezasFila = [
      'function esc(v) {', 'function ventanaAbierta(c, reunionEstado) {', 'function ventanaRatificacion(c, reunionEstado) {',
      'function modoRetiro(i) {', 'function puedeModificar(i) {', 'function accionesFila(i) {',
    ].map(a => bloque(PORTAL, a)).join('\n\n');
    const UI = await new AsyncFunction('miUsuarioId', `${piezasFila}
      return { modoRetiro, puedeModificar, accionesFila };`)(uA.usuarioId);

    const fila = (extra) => ({ id: 'ID-X', canal: 'portal', inscripto_por: uA.usuarioId, estado: 'inscripto',
      carreras: { estado: 'abierta', reuniones: { estado: 'publicada' },
        apertura_inscripcion: ayer, cierre_inscripcion: manana,
        apertura_ratificacion: null, cierre_ratificacion: null, ...extra } });
    const filaRat = fila({ apertura_inscripcion: anteayer, cierre_inscripcion: ayer, apertura_ratificacion: ayer, cierre_ratificacion: manana });
    const filaCerrada = fila({ apertura_inscripcion: anteayer, cierre_inscripcion: ayer });
    const tieneMod = (f) => UI.accionesFila(f).includes("abrirModificar('ID-X')");
    ok('U1) el botón Modificar sale con el MISMO predicado que Retirar: en las dos ventanas sí; cerrada / de otro / secretaría / forfait no',
       tieneMod(fila({})) && tieneMod(filaRat) && tieneMod({ ...filaRat, estado: 'ratificado' })
       && !tieneMod(filaCerrada) && !tieneMod({ ...filaRat, inscripto_por: uB.usuarioId })
       && !tieneMod({ ...filaRat, canal: 'manual' }) && !tieneMod({ ...filaRat, estado: 'forfait' })
       && !tieneMod({ ...fila({}), estado: 'ratificado' })
       && UI.accionesFila(filaCerrada).includes('—') && UI.accionesFila(filaRat).includes('Dar forfait'),
       `insc=${tieneMod(fila({}))} rat=${tieneMod(filaRat)} cerrada=${tieneMod(filaCerrada)}`);

    ok('U2) cargarInscripcionesCrudas pide caballeriza_id, entrenador_id, jockey_suplente_id y propietario_id',
       PORTAL.includes("'caballeriza_id,entrenador_id,jockey_suplente_id,propietario_id,'"));

    // guardarModificacion con stubs de DOM / confirm / sb.rpc / toast
    const piezasGuardar = [
      linea(PORTAL, 'const AVISO_CAB_SIN_TITULAR = '),
      bloque(PORTAL, 'function nombreProfesional(p) {'),
      bloque(PORTAL, 'function caballerizaSinTitular(cabId) {'),
      bloque(PORTAL, 'function cerrarModificar() {'),
      bloque(PORTAL, 'async function guardarModificacion() {'),
    ].join('\n\n');
    const armarGuardar = async (ctx) => new AsyncFunction('ctx', `${JOCKEY_JS}
      const { padronEntrenadores, misInscripciones } = ctx;
      let inscModificando = ctx.row, cabsConTitular = ctx.cabsConTitular;
      const els = {}; const el = (id) => els[id] ||= { value: ctx.valores[id] ?? '', style: {}, className: '', textContent: '', hidden: false, innerHTML: '', classList: { add() {}, remove() {} } };
      const document = { getElementById: el };
      const confirmCalls = []; function confirm(t) { confirmCalls.push(t); return ctx.confirmRet; }
      const toasts = []; function toast(m, t = 'success') { toasts.push({ m, t }); }
      const rpcCalls = []; const sb = { rpc: async (n, p) => { rpcCalls.push({ n, p }); return ctx.rpcResp; } };
      let recargas = 0; async function loadMisInscripciones() { recargas++; }
      ${piezasGuardar}
      await guardarModificacion();
      return { confirmCalls, toasts, rpcCalls, recargas, msg: els['mmod-msg']?.textContent || '', AVISO: AVISO_CAB_SIN_TITULAR };`)(ctx);

    const row = { id: 'INSC-1', carrera_id: 'CAR-1', estado: 'inscripto', caballeriza_id: cabCon, entrenador_id: profA, jockey_titular_id: j1, jockey_suplente_id: null, spcs: { nombre: 'PROBE' } };
    const padronEnt = [{ id: profA, apellido: 'PROBE-MOD-A', nombre: RUN }, { id: profC, apellido: 'PROBE-MOD-C', nombre: RUN }];
    const ctxBase = { row, padronEntrenadores: padronEnt, misInscripciones: [row], cabsConTitular: new Set([cabCon]),
      valores: { 'mmod-caballeriza': cabCon, 'mmod-entrenador': profA, 'mmod-jockey': j1, 'mmod-suplente': '' },
      confirmRet: true, rpcResp: { data: { ok: true, sin_propietario: false, sigue_siendo_mia: true }, error: null } };

    const u3 = await armarGuardar({ ...ctxBase, valores: { ...ctxBase.valores, 'mmod-entrenador': profC } });
    const u3b = await armarGuardar({ ...ctxBase, valores: { ...ctxBase.valores, 'mmod-entrenador': profC }, confirmRet: false });
    ok('U3) cambiar el entrenador → confirm() con el texto de GATE-1=B ANTES de sb.rpc; "Cancelar" no llama al RPC',
       u3.confirmCalls.length === 1 && /Estás cambiando el entrenador que presenta a PROBE-MOD-C/.test(u3.confirmCalls[0])
       && /seguís pudiendo modificar o retirar/.test(u3.confirmCalls[0]) && u3.rpcCalls.length === 1
       && u3.rpcCalls[0].n === 'rpc_modificar_inscripcion' && u3.rpcCalls[0].p.p_entrenador_id === profC
       && u3b.confirmCalls.length === 1 && u3b.rpcCalls.length === 0,
       `confirm=${JSON.stringify(u3.confirmCalls[0]?.slice(0, 60))} rpc=${u3.rpcCalls.length} cancel→rpc=${u3b.rpcCalls.length}`);
    const u3c = await armarGuardar(ctxBase);
    ok('U3b) sin cambio de entrenador ni de caballeriza no se pregunta nada y se guarda',
       u3c.confirmCalls.length === 0 && u3c.rpcCalls.length === 1 && u3c.recargas === 1 && u3c.toasts.some(t => t.m === 'Inscripción modificada'));

    const u4 = await armarGuardar({ ...ctxBase, valores: { ...ctxBase.valores, 'mmod-caballeriza': cabSin } });
    const u4b = await armarGuardar({ ...ctxBase, valores: { ...ctxBase.valores, 'mmod-caballeriza': cabSin }, confirmRet: false });
    ok('U4) caballeriza sin titular → confirm() con el aviso + "¿Guardar igual?"; si devuelve false, sb.rpc NO se llama',
       u4.confirmCalls.length === 1 && u4.confirmCalls[0].startsWith(u4.AVISO) && /¿Guardar igual\?/.test(u4.confirmCalls[0]) && u4.rpcCalls.length === 1
       && u4b.confirmCalls.length === 1 && u4b.rpcCalls.length === 0,
       `confirm=${u4.confirmCalls.length} rpc=${u4.rpcCalls.length} cancel→rpc=${u4b.rpcCalls.length}`);

    const u6 = await armarGuardar({ ...ctxBase, rpcResp: { data: { ok: true, sin_propietario: true, sigue_siendo_mia: true }, error: null } });
    ok('U6) el RPC devuelve sin_propietario=true → toast warning con el aviso (aunque el front no lo haya detectado)',
       u6.toasts.some(t => t.t === 'warning' && t.m === u6.AVISO) && u6.recargas === 1,
       `toasts=${JSON.stringify(u6.toasts.map(t => t.t))}`);
    const u6b = await armarGuardar({ ...ctxBase, rpcResp: { data: null, error: { message: 'P0001: Fuera de plazo: hablá con la secretaría.' } } });
    ok('U6b) error del RPC → mensaje en el modal, sin toast de éxito ni recarga',
       /Fuera de plazo/.test(u6b.msg) && !u6b.toasts.length && u6b.recargas === 0, `msg=${u6b.msg}`);

    const u7 = await armarGuardar({ ...ctxBase, row: { ...row, estado: 'ratificado' }, valores: { ...ctxBase.valores, 'mmod-jockey': '' } });
    ok('U7) un ratificado sin jockey se corta en el front antes del RPC', /ratificado tiene que tener jockey/.test(u7.msg) && u7.rpcCalls.length === 0, `msg=${u7.msg}`);
    const u7b = await armarGuardar({ ...ctxBase, valores: { ...ctxBase.valores, 'mmod-jockey': '', 'mmod-suplente': j2 } });
    ok('U7b) suplente sin titular se corta en el front', /suplente sin jockey titular/.test(u7b.msg) && u7b.rpcCalls.length === 0, `msg=${u7b.msg}`);

    // U5 · aviso de jockey repetido, la propia fila no cuenta
    const piezasAviso = [bloque(PORTAL, 'function avisoJockeyRepetido(el, jockeyId, carreraId, excluirInscId = null) {'),
                         bloque(PORTAL, 'function avisoJockeyRepetidoModificar() {')].join('\n\n');
    const otra = { id: 'INSC-2', carrera_id: 'CAR-1', estado: 'inscripto', jockey_titular_id: j1, spcs: { nombre: 'OTRO' } };
    const ff   = { id: 'INSC-3', carrera_id: 'CAR-1', estado: 'forfait', jockey_titular_id: j1, spcs: { nombre: 'FF' } };
    const aviso = async (lista, valorJockey) => new AsyncFunction('ctx', `${JOCKEY_JS}
      const misInscripciones = ctx.lista; let inscModificando = ctx.row;
      const els = { 'mmod-jockey-aviso': { hidden: true, textContent: '' }, 'mmod-jockey': { value: ctx.valorJockey } };
      const document = { getElementById: (id) => els[id] };
      ${piezasAviso}
      avisoJockeyRepetidoModificar();
      return els['mmod-jockey-aviso'];`)({ lista, row, valorJockey });
    const a1 = await aviso([row], j1);
    const a2 = await aviso([row, otra], j1);
    const a3 = await aviso([row, ff], j1);
    ok('U5) aviso de jockey repetido en Modificar: la PROPIA fila no cuenta; otra activa con el mismo jockey sí; un forfait no',
       a1.hidden === true && a2.hidden === false && /OTRO/.test(a2.textContent) && a3.hidden === true,
       `propia=${a1.hidden} otra=${a2.hidden} forfait=${a3.hidden}`);

    ok('U8) el modal #modal-modificar existe con sus cuatro selects y el botón Guardar',
       ['id="modal-modificar"', 'id="mmod-caballeriza"', 'id="mmod-entrenador"', 'id="mmod-jockey"', 'id="mmod-suplente"', 'onclick="guardarModificacion()"']
         .every(s => PORTAL.includes(s)));
    ok('U9) el pie de Mis inscripciones explica Modificar (caballo y turno no se cambian)',
       /<strong>Modificar<\/strong> cambia la caballeriza/.test(PORTAL) && /retirá y anotá de nuevo/.test(PORTAL));

  } finally {
    // Restore por ESTADO: se borra todo lo del run y se verifica que no quedó nada.
    const idsAud = [...fx.inscripciones, ...fx.propietarios, ...fx.responsables, ...fx.caballerizas, ...fx.profesionales, ...fx.carreras, ...fx.reuniones, ...fx.spcs];
    if (idsAud.length) await admin.from('auditoria').delete().in('registro_id', idsAud);
    for (const id of fx.inscripciones) await admin.from('inscripciones').delete().eq('id', id);
    for (const id of fx.carreras)      await admin.from('carreras').delete().eq('id', id);
    for (const id of fx.reuniones)     await admin.from('reuniones').delete().eq('id', id);
    for (const id of fx.spcs)          await admin.from('spcs').delete().eq('id', id);
    for (const id of fx.responsables)  await admin.from('caballeriza_responsables').delete().eq('id', id);
    for (const id of fx.propietarios)  await admin.from('propietarios').delete().eq('id', id);
    for (const id of fx.caballerizas)  await admin.from('caballerizas').delete().eq('id', id);
    for (const em of fx.usuarios) {
      const { data: u } = await admin.from('usuarios').select('id').eq('email', em).maybeSingle();
      if (u) { await admin.from('auditoria').delete().eq('usuario_id', u.id); await admin.from('usuarios').delete().eq('id', u.id); }
    }
    for (const id of fx.authIds)       await admin.auth.admin.deleteUser(id).catch(() => {});
    for (const id of fx.profesionales) await admin.from('profesionales').delete().eq('id', id);

    const cnt = async (tabla, col, pat) => (await admin.from(tabla).select('id', { count: 'exact', head: true }).like(col, pat)).count || 0;
    const restos = {
      reuniones: (await admin.from('reuniones').select('id', { count: 'exact', head: true }).eq('club_id', CLUB).in('numero', [9986, 9987])).count || 0,
      spcs: await cnt('spcs', 'nombre', `PROBE-MOD-%-${RUN}`),
      caballerizas: await cnt('caballerizas', 'nombre', `PROBE-MOD-CAB-%-${RUN}`),
      profesionales: await cnt('profesionales', 'nombre', 'PROBE-MOD-%'),
      usuarios: await cnt('usuarios', 'email', `probe-mod-%-${RUN}@%`),
      propietarios: await cnt('propietarios', 'documento_nro', DNI_PROBE),
      responsables: await cnt('caballeriza_responsables', 'documento_nro', DNI_PROBE),
    };
    // profesionales: sólo los de ESTE run (apellido = RUN); los de otro run que
    // haya quedado colgado no son de este teardown.
    restos.profesionales = (await admin.from('profesionales').select('id', { count: 'exact', head: true }).like('nombre', 'PROBE-MOD-%').eq('apellido', RUN)).count || 0;
    const { count: spcsDespues } = await admin.from('spcs').select('id', { count: 'exact', head: true });
    ok('R1) restore: cero filas del run en reuniones/spcs/caballerizas/profesionales/usuarios/propietarios/responsables; spcs antes = después',
       Object.values(restos).every(n => n === 0) && spcsAntes === spcsDespues,
       `${JSON.stringify(restos)} spcs ${spcsAntes}→${spcsDespues}`);
    ok(`R2) count(*) FROM spcs = ${SPCS_BASELINE} (baseline de CLAUDE.md; si cambió, hubo altas/bajas y hay que actualizarlo)`,
       spcsDespues === SPCS_BASELINE, `spcs=${spcsDespues}`);
  }

  console.log('\n── Probe · Modificar inscripción desde el portal ──');
  console.log(`   portal=${PORTAL_PATH}  ·  rpc=${RPC_MOD}  ·  run=${RUN}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
