/**
 * probe_forfait_portal.mjs — forfait desde el portal (ventana de ratificación).
 *
 * EL PEDIDO (Fede, 08/09/2026)
 * ---------------------------------------------------------------------------
 * "Forfait es retirar y tiene que ser el lunes antes de las 12 hs". Esa es la
 * ventana de ratificación —en R9, lunes 14/09 de 00:00 a 12:00— y no es un
 * mecanismo nuevo: es `rpc_baja_inscripcion` mirando una ventana más.
 *
 * LA DECISIÓN QUE ESTE PROBE FIJA
 * ---------------------------------------------------------------------------
 * Misma acción, DOS resultados:
 *   · ventana de INSCRIPCIÓN  → DELETE (la fila desaparece)
 *   · ventana de RATIFICACIÓN → UPDATE estado='forfait' (la fila QUEDA)
 *
 * Porque el forfait SE IMPRIME: bloque BORRADOS del PDF de ratificación
 * (ratificacion.html:397-405) y tachado en el programa (programa.html:67-68).
 * Un DELETE ahí borra el rastro y el programa no puede tachar lo que no existe.
 *
 * Por eso A2 NO se assertea con "el RPC no dio error": se relee la fila de la
 * base y se verifica que SIGA EXISTIENDO con estado='forfait'. Lección de
 * GOTCHA #93: el assert tiene que mirar el efecto, no el retorno.
 *
 * PATRÓN
 * ---------------------------------------------------------------------------
 * Sesiones de portal reales (magiclink + verifyOtp, como probe_gate4_inscribir)
 * llamando al RPC REAL. La parte de UI extrae `modoRetiro` de portal.html.
 * Fixture propio (reunión 9989, fecha 2099) con teardown en el `finally`.
 * NO toca R9 ni ninguna reunión real.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_forfait_portal.mjs
 *   node tests/probe_forfait_portal.mjs --mutantes
 *
 * Los mutantes de la RAMA SQL no se pueden aplicar sobre una copia del archivo:
 * el RPC vive en la base. Se aplican con CREATE OR REPLACE sobre una función
 * GEMELA (`rpc_baja_inscripcion_mut`) y el probe hijo la llama por env
 * RPC_BAJA. La función real de producción NUNCA se toca.
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

const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }
const admin = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const HERE = dirname(fileURLToPath(import.meta.url));
const PORTAL_PATH = process.env.PORTAL_HTML || join(HERE, '..', 'portal.html');
const PORTAL = readFileSync(PORTAL_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// Qué RPC llamar. En la corrida normal, el real. En un mutante, el gemelo.
const RPC_BAJA = process.env.RPC_BAJA || 'rpc_baja_inscripcion';

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

const RUN = Math.random().toString(36).slice(2, 8);
const PASS = `Probe-${RUN}-${Math.random().toString(36).slice(2, 10)}!`;
const mail = (q) => `probe-ff-${q}-${RUN}@sgh-probe.invalid`;
const fx = { authIds: [], usuarios: [], profesionales: [], caballerizas: [],
             spcs: [], reuniones: [], carreras: [], inscripciones: [] };
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

async function crearUsuarioPortal(q, entidadId, tipo = 'profesional') {
  const email = mail(q);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  if (error) die(`createUser ${q}`, error);
  fx.authIds.push(data.user.id);
  const { data: uRow, error: e2 } = await admin.from('usuarios').insert({
    email, nombre_completo: `Probe FF ${q} ${RUN}`, club_id: CLUB, rol: tipo,
    activo: true, estado: 'activo', password_hash: '', auth_user_id: data.user.id,
    entidad_tipo: tipo, entidad_id: entidadId,
  }).select('id').single();
  if (e2) die(`insert usuarios ${q}`, e2);
  fx.usuarios.push(email);
  return { email, usuarioId: uRow.id };
}

const baja = async (sb, id) => {
  const { error } = await sb.rpc(RPC_BAJA, { p_inscripcion_id: id });
  return { ok: !error, msg: error?.message ?? null };
};
/** Relee la fila con ADMIN. null = ya no existe. */
const leer = async (id) => {
  const { data } = await admin.from('inscripciones')
    .select('id,estado,canal,inscripto_por,numero_partidor,motivo_estado').eq('id', id).maybeSingle();
  return data ?? null;
};

// ═════════════════════════════ MUTATION TESTING ═════════════════════════════
// Los mutantes de SQL se aplican sobre una función GEMELA. `from`/`to` operan
// sobre el texto del CREATE que está en migrations/, no sobre el de producción.
const SQL_PATH = join(HERE, '..', 'migrations', 'rpc_baja_inscripcion_forfait.sql');
const SQL_BASE = readFileSync(SQL_PATH, 'utf8')
  .slice(readFileSync(SQL_PATH, 'utf8').indexOf('CREATE OR REPLACE FUNCTION'));

const MUTANTES = [
  { id: 'M1', tipo: 'sql', desc: 'cae el guard de canal=portal', mata: ['A7'],
    from: `  IF v_insc.canal IS DISTINCT FROM 'portal'\n     OR v_insc.inscripto_por IS DISTINCT FROM v_usuario_id\n  THEN`,
    to:   `  IF v_insc.inscripto_por IS DISTINCT FROM v_usuario_id THEN` },

  { id: 'M2', tipo: 'sql', desc: 'cae el guard de inscripto_por (se puede retirar lo de otro)', mata: ['A6'],
    from: `  IF v_insc.canal IS DISTINCT FROM 'portal'\n     OR v_insc.inscripto_por IS DISTINCT FROM v_usuario_id\n  THEN`,
    to:   `  IF v_insc.canal IS DISTINCT FROM 'portal' THEN` },

  { id: 'M3', tipo: 'sql', desc: 'la rama de forfait acepta cualquier estado', mata: ['A13'],
    from: `  IF v_insc.estado NOT IN ('inscripto', 'ratificado') THEN`,
    to:   `  IF false THEN` },

  { id: 'M4', tipo: 'sql', desc: 'la ventana de INSCRIPCIÓN queda siempre abierta', mata: ['A3', 'A4', 'A5'],
    from: `  v_en_inscripcion := v_carrera.apertura_inscripcion IS NOT NULL`,
    to:   `  v_en_inscripcion := true; PERFORM v_carrera.apertura_inscripcion IS NOT NULL` },

  { id: 'M5', tipo: 'sql', desc: 'la ventana de RATIFICACIÓN nunca se abre (vuelve el estado anterior)',
    mata: ['A2', 'A10', 'A11', 'A14'],
    from: `  v_en_ratificacion := v_carrera.apertura_ratificacion IS NOT NULL`,
    to:   `  v_en_ratificacion := false; PERFORM v_carrera.apertura_ratificacion IS NOT NULL` },

  { id: 'M6', tipo: 'sql', desc: 'el fail-closed de NULL desaparece: sin fechas, ventana abierta', mata: ['A9'],
    from: `  v_en_ratificacion := v_carrera.apertura_ratificacion IS NOT NULL\n                   AND v_carrera.cierre_ratificacion   IS NOT NULL\n                   AND now() >= v_carrera.apertura_ratificacion\n                   AND now() <= v_carrera.cierre_ratificacion;`,
    to:   `  v_en_ratificacion := coalesce(now() >= v_carrera.apertura_ratificacion, true)\n                   AND coalesce(now() <= v_carrera.cierre_ratificacion, true);` },

  { id: 'M7', tipo: 'sql', desc: 'LA CLAVE: la rama de ratificación BORRA en vez de dejar forfait',
    mata: ['A2', 'A10', 'A11', 'A14'],
    from: `  UPDATE inscripciones\n     SET estado          = 'forfait',\n         numero_partidor = NULL,\n         motivo_estado   = 'Forfait desde el portal'\n   WHERE id = p_inscripcion_id;`,
    to:   `  DELETE FROM resultado_posiciones WHERE inscripcion_id = p_inscripcion_id;\n  DELETE FROM inscripciones WHERE id = p_inscripcion_id;` },

  { id: 'M8', tipo: 'sql', desc: 'el forfait no limpia numero_partidor', mata: ['A10'],
    from: `         numero_partidor = NULL,\n`, to: `` },

  { id: 'M9', tipo: 'sql', desc: 'el forfait pisa canal e inscripto_por (se pierde el rastro)', mata: ['A11'],
    from: `     SET estado          = 'forfait',`,
    to:   `     SET estado          = 'forfait',\n         canal           = 'manual',\n         inscripto_por   = NULL,` },

  { id: 'M10', tipo: 'sql', desc: 'cae el guard de reunión publicada', mata: ['A8'],
    from: `  IF v_carrera.reunion_estado IS DISTINCT FROM 'publicada' THEN`,
    to:   `  IF false THEN` },

  { id: 'M11', tipo: 'sql', desc: 'el forfait no deja marca de origen en motivo_estado', mata: ['A12'],
    from: `         motivo_estado   = 'Forfait desde el portal'`,
    to:   `         motivo_estado   = NULL` },

  { id: 'M12', tipo: 'portal', desc: 'modoRetiro devuelve siempre "inscripcion"', mata: ['U1', 'U2'],
    from: `  if (ventanaRatificacion(c, rEstado) && ['inscripto', 'ratificado'].includes(i.estado)) {
    return 'ratificacion';
  }`, to: `` },

  { id: 'M13', tipo: 'portal', desc: 'el select del portal deja de pedir las columnas de ratificación',
    mata: ['U3'],
    from: `          + 'apertura_ratificacion,cierre_ratificacion,'\n`, to: `` },

  { id: 'M14', tipo: 'portal', desc: 'ventanaRatificacion pierde el fail-closed de NULL', mata: ['U4'],
    from: `  if (!c.apertura_ratificacion || !c.cierre_ratificacion) return false;\n  const ahora = Date.now();\n  return ahora >= Date.parse(c.apertura_ratificacion) && ahora <= Date.parse(c.cierre_ratificacion);`,
    to:   `  const ahora = Date.now();\n  return !(ahora < Date.parse(c.apertura_ratificacion)) && !(ahora > Date.parse(c.cierre_ratificacion));` },
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
  const dir = mkdtempSync(join(tmpdir(), 'mut-forfait-'));
  try { symlinkSync(join(HERE, '..', 'node_modules'), join(dir, 'node_modules'), 'dir'); }
  catch (e) { console.warn(`[runner] symlink node_modules: ${e.message}`); }

  // Los mutantes de SQL no se pueden automatizar desde acá: no hay vía de DDL
  // (sin cliente `pg`, sin connection string, y crear un `exec_sql` genérico
  // sería abrir una inyección en producción). Se emiten como .sql sobre una
  // función GEMELA y se aplican por MCP; el procedimiento está abajo y en el
  // informe. La función REAL nunca se toca.
  const GEMELA = 'rpc_baja_inscripcion_mut';
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
      writeFileSync(p, SQL_BASE.replace(m.from, m.to)
        .replace('public.rpc_baja_inscripcion(', `public.${GEMELA}(`));
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
    console.log(`  2. RPC_BAJA=${GEMELA} node tests/probe_forfait_portal.mjs`);
    console.log(`  3. execute_sql: DROP FUNCTION IF EXISTS public.${GEMELA}(uuid);`);
    console.log('La función REAL rpc_baja_inscripcion no se toca en ningún momento.\n');
    sqlPendientes.forEach(m => console.log(`  ${m.id}  mata ${m.mata.join(',')}  — ${m.desc}\n       ${m.path}`));
    console.log('');
  }
  process.exit(vivos === 0 && arnes === 0 ? 0 : 1);
}

// ══════════════════════════════ CORRIDA NORMAL ══════════════════════════════
(async () => {
  try {
    const { data: hip } = await admin.from('hipodromos').select('id').eq('club_id', CLUB).limit(1).single();
    const { data: cat } = await admin.from('categorias_carrera').select('id').eq('club_id', CLUB).limit(1).single();

    const profA = await ins('profesionales', { club_id: CLUB, tipo: 'entrenador', nombre: 'PROBE-FF-A', apellido: RUN, hipodromo_patente: 'DOL' }, 'profesionales');
    const profB = await ins('profesionales', { club_id: CLUB, tipo: 'entrenador', nombre: 'PROBE-FF-B', apellido: RUN, hipodromo_patente: 'DOL' }, 'profesionales');
    const cab   = await ins('caballerizas', { club_id: CLUB, nombre: `PROBE-FF-CAB-${RUN}`, hipodromo_patente: 'DOL' }, 'caballerizas');
    const uA = await crearUsuarioPortal('a', profA);
    const uB = await crearUsuarioPortal('b', profB);
    const sbA = await clientePortal(uA.email);

    const spc = async (n) => ins('spcs', { nombre: `PROBE-FF-${n}-${RUN}`, fecha_nacimiento: '2020-01-01', sexo: 'macho', estado: 'activo', entrenador_id: profA, caballeriza_id: cab }, 'spcs');

    const reunPub  = await ins('reuniones', { club_id: CLUB, hipodromo_id: hip.id, numero: 9989, fecha: '2099-07-05', estado: 'publicada' }, 'reuniones');
    const reunBorr = await ins('reuniones', { club_id: CLUB, hipodromo_id: hip.id, numero: 9988, fecha: '2099-07-06', estado: 'borrador' }, 'reuniones');

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

    // Inscripción abierta, ratificación todavía no
    const cInsc   = await carrera(reunPub, 1, { apertura_ratificacion: manana, cierre_ratificacion: pasado });
    // Inscripción cerrada, RATIFICACIÓN ABIERTA  ← el caso de Fede
    const cRat    = await carrera(reunPub, 2, { apertura_inscripcion: anteayer, cierre_inscripcion: ayer, apertura_ratificacion: ayer, cierre_ratificacion: manana });
    // Todavía no abrió ninguna
    const cAntes  = await carrera(reunPub, 3, { apertura_inscripcion: manana, cierre_inscripcion: pasado, apertura_ratificacion: manana, cierre_ratificacion: pasado });
    // EL HUECO: inscripción cerrada, ratificación todavía no abrió
    const cHueco  = await carrera(reunPub, 4, { apertura_inscripcion: anteayer, cierre_inscripcion: ayer, apertura_ratificacion: manana, cierre_ratificacion: pasado });
    // Las dos cerradas
    const cDesp   = await carrera(reunPub, 5, { apertura_inscripcion: anteayer, cierre_inscripcion: ayer, apertura_ratificacion: anteayer, cierre_ratificacion: ayer });
    // Inscripción cerrada, ratificación en NULL → fail-closed
    const cNull   = await carrera(reunPub, 6, { apertura_inscripcion: anteayer, cierre_inscripcion: ayer });
    // Reunión borrador, ratificación abierta
    const cBorr   = await carrera(reunBorr, 1, { apertura_ratificacion: ayer, cierre_ratificacion: manana });

    const anotar = async (carreraId, spcId, extra = {}) => ins('inscripciones', {
      carrera_id: carreraId, spc_id: spcId, estado: 'inscripto', canal: 'portal',
      inscripto_por: uA.usuarioId, caballeriza_id: cab, entrenador_id: profA, ...extra,
    }, 'inscripciones');

    // ── A) EL RPC ───────────────────────────────────────────────────────────
    console.log('\n── El RPC ──');

    // A1 · inscripción: sigue borrando
    const i1 = await anotar(cInsc, await spc('1'));
    const r1 = await baja(sbA, i1);
    ok('A1) retirar durante la INSCRIPCIÓN sigue funcionando, y BORRA la fila',
       r1.ok && (await leer(i1)) === null, `ok=${r1.ok} msg=${r1.msg} fila=${JSON.stringify(await leer(i1))}`);

    // A2 · ratificación: forfait, la fila QUEDA
    const s2 = await spc('2');
    const i2 = await anotar(cRat, s2, { numero_partidor: 7 });
    const r2 = await baja(sbA, i2);
    const f2 = await leer(i2);
    ok('A2) retirar durante la RATIFICACIÓN funciona y deja estado=forfait — la fila NO se borra',
       r2.ok && f2 !== null && f2.estado === 'forfait',
       `ok=${r2.ok} msg=${r2.msg} fila=${JSON.stringify(f2)}`);
    ok('A10) el forfait limpia numero_partidor', f2?.numero_partidor === null, `numero_partidor=${f2?.numero_partidor}`);
    ok('A11) el forfait CONSERVA canal e inscripto_por (el rastro no se pierde)',
       f2?.canal === 'portal' && f2?.inscripto_por === uA.usuarioId,
       `canal=${f2?.canal} inscripto_por=${f2?.inscripto_por}`);
    ok('A12) el forfait deja marca de origen en motivo_estado',
       (f2?.motivo_estado || '').toLowerCase().includes('portal'), `motivo_estado=${JSON.stringify(f2?.motivo_estado)}`);

    // A14 · un RATIFICADO también puede darse de baja en esa ventana
    const s14 = await spc('14');
    const i14 = await anotar(cRat, s14, { estado: 'ratificado', numero_partidor: 3 });
    const r14 = await baja(sbA, i14);
    const f14 = await leer(i14);
    ok('A14) un caballo ya RATIFICADO puede darse de forfait en esa ventana',
       r14.ok && f14?.estado === 'forfait', `ok=${r14.ok} msg=${r14.msg} estado=${f14?.estado}`);

    // A13 · ya forfait → rechaza
    const r13 = await baja(sbA, i2);
    ok('A13) un caballo ya en forfait no se puede volver a retirar', !r13.ok, `msg=${r13.msg}`);

    // A3/A4/A5 · fuera de las ventanas
    const i3 = await anotar(cAntes, await spc('3'));
    const r3 = await baja(sbA, i3);
    ok('A3) antes de que abra ninguna ventana, rechaza', !r3.ok && (await leer(i3)) !== null, `msg=${r3.msg}`);

    const i4 = await anotar(cHueco, await spc('4'));
    const r4 = await baja(sbA, i4);
    ok('A4) EL HUECO entre el cierre de inscripción y la apertura de ratificación, rechaza',
       !r4.ok && (await leer(i4)) !== null, `msg=${r4.msg}`);

    const i5 = await anotar(cDesp, await spc('5'));
    const r5 = await baja(sbA, i5);
    ok('A5) después del cierre de ratificación, rechaza', !r5.ok && (await leer(i5)) !== null, `msg=${r5.msg}`);

    // A6 · lo de otro
    const i6 = await anotar(cRat, await spc('6'), { inscripto_por: uB.usuarioId });
    const r6 = await baja(sbA, i6);
    ok('A6) no se puede retirar lo que cargó OTRO usuario', !r6.ok && (await leer(i6)) !== null, `msg=${r6.msg}`);

    // A7 · lo de la secretaría
    const i7 = await anotar(cRat, await spc('7'), { canal: 'manual', inscripto_por: uA.usuarioId });
    const r7 = await baja(sbA, i7);
    ok('A7) no se puede retirar lo que cargó la SECRETARÍA (canal manual)',
       !r7.ok && (await leer(i7)) !== null, `msg=${r7.msg}`);

    // A8 · reunión no publicada
    const i8 = await anotar(cBorr, await spc('8'));
    const r8 = await baja(sbA, i8);
    ok('A8) reunión no publicada, rechaza', !r8.ok && (await leer(i8)) !== null, `msg=${r8.msg}`);

    // A9 · fail-closed
    const i9 = await anotar(cNull, await spc('9'));
    const r9 = await baja(sbA, i9);
    ok('A9) ventana de ratificación en NULL → fail-closed, rechaza',
       !r9.ok && (await leer(i9)) !== null, `msg=${r9.msg}`);

    // ── U) LA UI ────────────────────────────────────────────────────────────
    console.log('\n── La UI ──');
    const piezas = [
      'function ventanaAbierta(c, reunionEstado) {',
      'function ventanaRatificacion(c, reunionEstado) {',
      'function modoRetiro(i) {',
      'function puedeRetirar(i) {',
    ].map(f => {
      const i = PORTAL.indexOf(f);
      if (i < 0) throw new Error(`no encontré: ${f}`);
      let d = 0;
      for (let k = i + f.length - 1; k < PORTAL.length; k++) {
        if (PORTAL[k] === '{') d++;
        else if (PORTAL[k] === '}') { d--; if (d === 0) return PORTAL.slice(i, k + 1); }
      }
      throw new Error(`no pude cerrar: ${f}`);
    }).join('\n\n');
    const UI = await new AsyncFunction('miUsuarioId', `${piezas}
      return { ventanaAbierta, ventanaRatificacion, modoRetiro, puedeRetirar };`)(uA.usuarioId);

    const fila = (extra) => ({ canal: 'portal', inscripto_por: uA.usuarioId, estado: 'inscripto',
      carreras: { estado: 'abierta', reuniones: { estado: 'publicada' },
        apertura_inscripcion: ayer, cierre_inscripcion: manana,
        apertura_ratificacion: null, cierre_ratificacion: null, ...extra } });

    ok('U1) modoRetiro distingue las dos ventanas y el fuera-de-plazo',
       UI.modoRetiro(fila({})) === 'inscripcion'
       && UI.modoRetiro(fila({ apertura_inscripcion: anteayer, cierre_inscripcion: ayer, apertura_ratificacion: ayer, cierre_ratificacion: manana })) === 'ratificacion'
       && UI.modoRetiro(fila({ apertura_inscripcion: anteayer, cierre_inscripcion: ayer })) === null,
       `insc=${UI.modoRetiro(fila({}))} · rat=${UI.modoRetiro(fila({ apertura_inscripcion: anteayer, cierre_inscripcion: ayer, apertura_ratificacion: ayer, cierre_ratificacion: manana }))}`);

    const filaRat = fila({ apertura_inscripcion: anteayer, cierre_inscripcion: ayer, apertura_ratificacion: ayer, cierre_ratificacion: manana });
    ok('U2) el rótulo del botón es "Dar forfait" en ratificación y "Retirar" en inscripción',
       PORTAL.includes(`modo === 'ratificacion' ? 'Dar forfait' : 'Retirar'`)
       && UI.modoRetiro(filaRat) === 'ratificacion');

    ok('U3) cargarInscripcionesCrudas pide apertura_ratificacion y cierre_ratificacion',
       PORTAL.includes("'apertura_ratificacion,cierre_ratificacion,'"));

    ok('U4) ventanaRatificacion es fail-closed: sin las dos fechas, cerrada',
       UI.ventanaRatificacion({ apertura_ratificacion: null, cierre_ratificacion: null }, 'publicada') === false
       && UI.ventanaRatificacion({ apertura_ratificacion: ayer, cierre_ratificacion: null }, 'publicada') === false);

    ok('U5) un RATIFICADO muestra botón en la ventana de ratificación, no en la de inscripción',
       UI.modoRetiro({ ...filaRat, estado: 'ratificado' }) === 'ratificacion'
       && UI.modoRetiro({ ...fila({}), estado: 'ratificado' }) === null);

    ok('U6) lo de otro y lo de la secretaría no muestran botón',
       UI.modoRetiro({ ...filaRat, inscripto_por: uB.usuarioId }) === null
       && UI.modoRetiro({ ...filaRat, canal: 'manual' }) === null);

  } finally {
    for (const id of fx.inscripciones) await admin.from('inscripciones').delete().eq('id', id);
    for (const id of fx.carreras)      await admin.from('carreras').delete().eq('id', id);
    for (const id of fx.reuniones)     await admin.from('reuniones').delete().eq('id', id);
    for (const id of fx.spcs)          await admin.from('spcs').delete().eq('id', id);
    for (const em of fx.usuarios) {
      const { data: u } = await admin.from('usuarios').select('id').eq('email', em).maybeSingle();
      if (u) { await admin.from('auditoria').delete().eq('usuario_id', u.id); await admin.from('usuarios').delete().eq('id', u.id); }
    }
    for (const id of fx.authIds)       await admin.auth.admin.deleteUser(id).catch(() => {});
    for (const id of fx.caballerizas)  await admin.from('caballerizas').delete().eq('id', id);
    for (const id of fx.profesionales) await admin.from('profesionales').delete().eq('id', id);

    const { data: q1 } = await admin.from('reuniones').select('id').eq('club_id', CLUB).in('numero', [9988, 9989]);
    const { data: q2 } = await admin.from('spcs').select('id').like('nombre', `PROBE-FF-%-${RUN}`);
    ok('T1) teardown: no quedaron reuniones 9988/9989 ni SPC del run',
       (q1 || []).length === 0 && (q2 || []).length === 0,
       `reuniones=${(q1 || []).length} spcs=${(q2 || []).length}`);
  }

  console.log('\n── Probe · forfait desde el portal ──');
  console.log(`   portal=${PORTAL_PATH}  ·  rpc=${RPC_BAJA}  ·  run=${RUN}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
