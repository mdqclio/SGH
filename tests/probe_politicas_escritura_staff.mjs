/**
 * probe_politicas_escritura_staff.mjs — ISSUE-093: escritura de 14 tablas sólo para staff.
 *
 * Matriz: 14 tablas × {INSERT, UPDATE, DELETE} × perfiles con SESIÓN REAL (sandbox: JWT firmado;
 * prod: magiclink). Nunca service_role para los intentos: service_role se usa sólo para sembrar
 * fixtures, leer el estado y limpiar.
 *
 *   Perfiles que NO tienen que poder escribir:
 *     portal        profesional del portal, club Dolores, activo      ← el agujero
 *     portal_prop   propietario del portal, club Dolores, activo      ← el agujero
 *     inactivo      operador de Dolores con activo=false              (control)
 *     otroclub      operador de Mi Club Hípico sobre filas de Dolores (control del predicado de club)
 *   Perfiles que TIENEN que seguir pudiendo:
 *     secretario    secretario_carreras de Dolores
 *     operador      operador de Dolores
 *     superadmin    super_admin
 *
 * Cómo se decide cada celda:
 *   INSERT  → negativo: error 42501 y 0 filas nuevas con la marca · positivo: sin error.
 *   UPDATE  → sobre un fixture propio de esa celda: negativo = 0 filas devueltas Y el fixture igual
 *             (leído con service_role) · positivo = 1 fila.
 *   DELETE  → sobre un fixture propio de esa celda: negativo = 0 filas y el fixture sigue · positivo =
 *             1 fila y el fixture ya no está.
 *   `clubs` sólo tiene UPDATE en el cambio (INSERT/DELETE ya eran sólo super_admin). Todos los intentos
 *   son UPDATE no-op sobre la fila real de Dolores (sigla = la misma sigla): negativos → 0 filas,
 *   positivos → 1 fila. El contenido no cambia; en los positivos se mueve `updated_at` (trigger) y el
 *   trigger de auditoría no registra nada (descarta cambios que sólo tocan updated_at). No se usa un
 *   club fixture: en prod ningún club se puede borrar (fn_auditoria_log audita la baja con el club_id
 *   del club recién borrado y viola auditoria_club_id_fkey).
 *
 * Fixtures: todo marcado con RUN (PROBE-093-…) y fuera de circuito: filas de liquidacion_config y
 * comision_config con activo=false y vigencia 2099, hipódromo inactivo, apuestas/log sobre la 9999,
 * caballeriza de prueba (responsable sin documento: el trigger de propietario no corre). El finally
 * borra todo y verifica POR ESTADO: 0 filas con la marca en las 14 tablas + las filas reales de
 * Dolores en clubs / liquidacion_config / club_secuencias idénticas a la foto del arranque.
 *
 * Dónde corre:
 *   Sandbox (default):
 *     tests/local/up.sh sql < tests/local/politicas_escritura_sandbox.sql          # estado de HOY
 *     SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=$(cat tests/local/out/jwt) \
 *       LOCAL_JWT_SECRET=$(cat tests/local/out/jwt_secret) node tests/probe_politicas_escritura_staff.mjs
 *       → con las políticas de hoy tiene que dar ROJO en portal/portal_prop (reproduce el agujero)
 *     tests/local/up.sh sql < migrations/politicas_escritura_staff_14.sql
 *     … mismo comando → verde. Con PSQL_CMD="tests/local/up.sh sql" y --mutantes: 14 mutantes, uno por
 *     tabla (se le vuelve a poner a ESA tabla la política de hoy); cada uno tiene que morir.
 *   Prod (sólo DESPUÉS de aplicar): node tests/probe_politicas_escritura_staff.mjs --prod
 *     ESCRIBE: usuarios de auth + filas de usuarios temporales y fixtures marcados; borra
 *     todo en el finally. Los mutantes no corren en prod.
 *   --tabla=<t> corre una sola tabla.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHmac, randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const ROOT = new URL('..', import.meta.url).pathname;
const PROD_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const BASE_URL = process.env.SUPABASE_URL || PROD_URL;
const EN_PROD = BASE_URL.includes('unlhcuanfrtpatoipwve');
const KEY = process.env.SUPABASE_SECRET_KEY;
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const JWT_SECRET = process.env.LOCAL_JWT_SECRET;
const PSQL = process.env.PSQL_CMD;
const MUTANTES = process.argv.includes('--mutantes');
const SOLO = (process.argv.find(a => a.startsWith('--tabla=')) || '').slice(8) || null;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY'); process.exit(2); }
if (EN_PROD && !process.argv.includes('--prod')) { console.error('SUPABASE_URL es prod: el probe escribe; pasá --prod (sólo después de aplicar la migración)'); process.exit(2); }
if (!EN_PROD && !JWT_SECRET) { console.error('Sandbox: falta LOCAL_JWT_SECRET'); process.exit(2); }
if (MUTANTES && (EN_PROD || !PSQL)) { console.error('--mutantes: sólo sandbox y con PSQL_CMD'); process.exit(2); }

const DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c', OTRO = 'a6da7e40-1515-45dc-8933-4eef33ce937a';
const R9999 = 'a0000000-0000-0000-0000-000000009999';
const CARRERAS = ['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003'];
const RESULTADO = 'd0000000-0000-0000-0000-000000000001';
const RUN = `PROBE-093-${Date.now()}`;
const TIPOS_APU = ['GAN', 'SEG', 'TER', 'EX', 'IM', 'TR', 'CUAT', 'X2', 'X2P', 'X3', 'X4', 'X5', 'CAD'];
const admin = createClient(BASE_URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const q = async (p, ctx) => { const r = await p; if (r.error) throw new Error(`[${ctx}] ${r.error.message}`); return r.data; };
const rnd = () => randomUUID().slice(0, 6);

const jwt = sub => { const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b({ alg: 'HS256', typ: 'JWT' }), p = b({ role: 'authenticated', sub, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`; };

// ── usuarios temporales con sesión real ──────────────────────────────────────────────────────
const creados = [];
async function sesion(nombre, rol, club, extra = {}) {
  const email = `${RUN.toLowerCase()}-${nombre}@example.invalid`;
  let authId;
  if (EN_PROD) {
    const { data: au, error } = await admin.auth.admin.createUser({ email, password: 'Px-' + randomUUID(), email_confirm: true });
    if (error) throw error; authId = au.user.id;
  } else authId = randomUUID();
  const u = await q(admin.from('usuarios').insert({ email, password_hash: '', nombre_completo: `${RUN} ${nombre}`, rol, club_id: club,
    activo: true, estado: 'activo', auth_user_id: authId, ...extra }).select('id').single(), `alta ${nombre}`);
  creados.push({ usuarioId: u.id, authId });
  let cli;
  if (EN_PROD) {
    const { data: link, error: eL } = await admin.auth.admin.generateLink({ type: 'magiclink', email }); if (eL) throw eL;
    cli = createClient(BASE_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: eV } = await cli.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' }); if (eV) throw eV;
  } else cli = createClient(BASE_URL, KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt(authId)}` } } });
  return { nombre, cli, usuarioId: u.id };
}

// ── especificación por tabla ─────────────────────────────────────────────────────────────────
// key(row) → filtro que identifica la fila; nueva(n, ctx) → payload de INSERT marcado; upd → columna y
// valor para el UPDATE; marca → filtro para barrer todo lo del probe.
const apuPool = [];   // pares (carrera, tipo) libres para carrera_apuestas
let apuOrden = 90;    // orden libre para resultado_apuestas (único resultado+tipo+orden)
function spec(ctx) {
  return {
    caballeriza_responsables: {
      nueva: () => ({ caballeriza_id: ctx.cab, apellido: RUN, nombre: 'x', rol: 'peon' }),
      upd: { nombre: 'upd' }, marca: ['apellido', RUN] },
    carrera_apuestas: {
      nueva: () => { const [carrera_id, tipo] = apuPool.shift(); return { carrera_id, tipo, precio: 1, nombre: RUN, orden: 99 }; },
      upd: { precio: 2 }, marca: ['nombre', RUN] },
    categorias_carrera: {
      nueva: () => ({ club_id: DOLORES, nombre: RUN, codigo: `P9${rnd()}`, activo: false }),
      upd: { descripcion: 'upd' }, marca: ['nombre', RUN] },
    club_configuracion: {
      nueva: () => ({ club_id: DOLORES, clave: `probe093-${rnd()}`, valor: RUN }),
      upd: { descripcion: 'upd' }, marca: ['valor', RUN] },
    club_secuencias: {
      nueva: () => ({ club_id: DOLORES, tipo: `${RUN}-${rnd()}`, ultimo_numero: 0 }),
      key: r => ({ club_id: r.club_id, tipo: r.tipo }), upd: { ultimo_numero: 1 }, marca: ['tipo', `${RUN}%`, 'like'] },
    comision_config: {
      nueva: () => ({ club_id: DOLORES, tipo_cobro: 'monto_fijo', vigente_desde: '2099-01-01', activo: false, descripcion: RUN }),
      upd: { monto_fijo: 1 }, marca: ['descripcion', RUN] },
    hipodromos: {
      nueva: () => ({ club_id: DOLORES, nombre: RUN, sigla: `P${rnd()}`, activo: false }),
      upd: { localidad: 'upd' }, marca: ['nombre', RUN] },
    liquidacion_config: {
      nueva: () => ({ club_id: DOLORES, activo: false, vigente_desde: '2099-01-01', vigente_hasta: '2099-01-02', retencion_dgi_pct: 0.093 }),
      upd: { dias_antidoping: 31 }, marca: ['retencion_dgi_pct', 0.093] },
    novedades_reunion: {
      nueva: () => ({ reunion_id: R9999, tipo_novedad: 'probe', descripcion: RUN }),
      upd: { visibilidad: 'upd' }, marca: ['descripcion', RUN] },
    resolucion_entidades: {
      nueva: () => ({ resolucion_id: ctx.resol, entidad_tipo: 'spc', entidad_id: randomUUID(), descripcion: RUN }),
      upd: { entidad_tipo: 'upd' }, marca: ['descripcion', RUN] },
    resoluciones: {
      nueva: () => ({ club_id: DOLORES, numero: `${RUN}-${rnd()}`, fecha: '2099-01-01', tipo: 'probe', texto: RUN }),
      upd: { estado: 'upd' }, marca: ['texto', RUN],
      // ISSUE-097 (pieza C): borrar una resolución es sólo de super_admin.
      borraSoloSuperAdmin: true },
    resultado_apuestas: {
      nueva: () => ({ resultado_id: RESULTADO, tipo: 'CAD', composicion: RUN, orden: apuOrden++ }),
      upd: { div_orig: 1 }, marca: ['composicion', RUN] },
    resultado_log: {
      nueva: () => ({ resultado_id: RESULTADO, accion: RUN }),
      upd: { datos_despues: { upd: true } }, marca: ['accion', RUN] },
  };
}
// Migraciones aplicadas DESPUÉS de ISSUE-093 sobre alguna de estas tablas (el restore de los mutantes las reaplica).
const POSTERIORES = { resoluciones: ['migrations/resoluciones_delete_super_admin.sql'] };   // ISSUE-097 pieza C
const TABLAS = ['caballeriza_responsables', 'carrera_apuestas', 'categorias_carrera', 'club_configuracion', 'club_secuencias', 'clubs',
  'comision_config', 'hipodromos', 'liquidacion_config', 'novedades_reunion', 'resolucion_entidades', 'resoluciones', 'resultado_apuestas', 'resultado_log'];

const filtro = (qb, m) => m[2] === 'like' ? qb.like(m[0], m[1]) : qb.eq(m[0], m[1]);
const aplicarKey = (qb, k) => Object.entries(k).reduce((acc, [c, v]) => acc.eq(c, v), qb);
const keyDe = (s, r) => (s.key ? s.key(r) : { id: r.id });
const fixture = async (t, s) => q(admin.from(t).insert(s.nueva()).select('*').single(), `fixture ${t}`);
const leerFila = async (t, k) => (await q(aplicarKey(admin.from(t).select('*'), k), `leer ${t}`))[0] || null;
const md5 = o => createHash('md5').update(JSON.stringify(o)).digest('hex');

// ── una tabla ────────────────────────────────────────────────────────────────────────────────
const NEG = ['portal', 'portal_prop', 'inactivo', 'otroclub'], POS = ['secretario', 'operador', 'superadmin'];
async function probarTabla(t, P, ctx, ok) {
  if (t === 'clubs') {
    const real = await leerFila('clubs', { id: DOLORES });
    for (const n of NEG) {
      const { data, error } = await P[n].cli.from('clubs').update({ sigla: real.sigla }).eq('id', DOLORES).select('id');
      ok(`${t}.UPDATE.${n}) Dolores (no-op): 0 filas`, !error && (data || []).length === 0 || error?.code === '42501', JSON.stringify({ n: data?.length, e: error?.code }));
    }
    for (const n of POS) {
      const { data, error } = await P[n].cli.from('clubs').update({ sigla: real.sigla }).eq('id', DOLORES).select('id');
      ok(`${t}.UPDATE.${n}) Dolores (no-op): 1 fila`, !error && (data || []).length === 1, JSON.stringify({ n: data?.length, e: error?.message }));
    }
    const despues = await leerFila('clubs', { id: DOLORES });
    ok(`${t}) Dolores sin cambios de contenido (sólo updated_at)`, md5({ ...real, updated_at: 0 }) === md5({ ...despues, updated_at: 0 }));
    return;
  }
  const s = spec(ctx)[t];
  // Un fixture propio por (perfil, operación): si un intento que debía fallar pasa, no contamina
  // las celdas siguientes.
  for (const n of NEG) {
    const ins = await P[n].cli.from(t).insert(s.nueva()).select('*');
    ok(`${t}.INSERT.${n}) rechazado`, ins.error?.code === '42501' && !(ins.data || []).length, JSON.stringify({ e: ins.error?.code, n: ins.data?.length }));
    const fu = keyDe(s, await fixture(t, s)), antes = md5(await leerFila(t, fu));
    const up = await aplicarKey(P[n].cli.from(t).update(s.upd), fu).select('*');
    ok(`${t}.UPDATE.${n}) 0 filas y fixture igual`, !(up.data || []).length && md5(await leerFila(t, fu)) === antes, JSON.stringify({ e: up.error?.code, n: up.data?.length }));
    const fd = keyDe(s, await fixture(t, s));
    const del = await aplicarKey(P[n].cli.from(t).delete(), fd).select('*');
    ok(`${t}.DELETE.${n}) 0 filas y fixture sigue`, !(del.data || []).length && !!(await leerFila(t, fd)), JSON.stringify({ e: del.error?.code, n: del.data?.length }));
  }
  for (const n of POS) {
    const ins = await P[n].cli.from(t).insert(s.nueva()).select('*');
    ok(`${t}.INSERT.${n}) OK`, !ins.error && (ins.data || []).length === 1, JSON.stringify({ e: ins.error?.message, n: ins.data?.length }));
    const fu = keyDe(s, await fixture(t, s));
    const up = await aplicarKey(P[n].cli.from(t).update(s.upd), fu).select('*');
    ok(`${t}.UPDATE.${n}) 1 fila`, !up.error && (up.data || []).length === 1, JSON.stringify({ e: up.error?.message, n: up.data?.length }));
    const fd = keyDe(s, await fixture(t, s));
    const del = await aplicarKey(P[n].cli.from(t).delete(), fd).select('*');
    if (s.borraSoloSuperAdmin && n !== 'superadmin')
      ok(`${t}.DELETE.${n}) 0 filas y fixture sigue (sólo super_admin borra)`, !(del.data || []).length && !!(await leerFila(t, fd)), JSON.stringify({ e: del.error?.code, n: del.data?.length }));
    else
      ok(`${t}.DELETE.${n}) 1 fila`, !del.error && (del.data || []).length === 1 && !(await leerFila(t, fd)), JSON.stringify({ e: del.error?.message, n: del.data?.length }));
  }
}

// ── limpieza ─────────────────────────────────────────────────────────────────────────────────
const ORDEN_BORRADO = ['resolucion_entidades', 'resoluciones', 'caballeriza_responsables', 'carrera_apuestas', 'categorias_carrera', 'club_configuracion',
  'club_secuencias', 'comision_config', 'hipodromos', 'liquidacion_config', 'novedades_reunion', 'resultado_apuestas', 'resultado_log'];
async function barrerFixtures(ctx) {
  const s = spec(ctx || {}), errores = [];
  for (const t of ORDEN_BORRADO) { const { error } = await filtro(admin.from(t).delete(), s[t].marca); if (error) errores.push(`${t}: ${error.message}`); }
  await llenarPoolApuestas();
  return errores;
}
async function llenarPoolApuestas() {
  const usadas = await q(admin.from('carrera_apuestas').select('carrera_id,tipo').in('carrera_id', CARRERAS), 'apu usadas');
  apuPool.length = 0;
  for (const c of CARRERAS) for (const tp of TIPOS_APU) if (!usadas.some(u => u.carrera_id === c && u.tipo === tp)) apuPool.push([c, tp]);
}
async function barrer(ctx) {
  const s = spec(ctx || {});
  const orden = ORDEN_BORRADO;
  const errores = await barrerFixtures(ctx);
  // resoluciones fixture del contexto (numero con RUN) y caballeriza
  await admin.from('resoluciones').delete().like('numero', `${RUN}%`);
  await admin.from('caballerizas').delete().eq('nombre', RUN);
  // auditoria.usuario_id tiene FK a usuarios: las filas que generaron los perfiles del probe (sus
  // escrituras en tablas auditadas y su propia alta/baja) se borran ANTES que los usuarios.
  const ids = creados.map(c => c.usuarioId);
  if (ids.length) {
    const { error } = await admin.from('auditoria').delete().in('usuario_id', ids);
    // el sandbox no tiene tabla auditoria (el clon de la 9999 no la trae): sólo ahí se tolera
    if (error && (EN_PROD || !/auditoria|does not exist|schema cache/i.test(error.message))) errores.push(`auditoria: ${error.message}`);
  }
  for (const c of creados.splice(0)) {
    const { error } = await admin.from('usuarios').delete().eq('id', c.usuarioId); if (error) errores.push(`usuarios: ${error.message}`);
    if (EN_PROD) { const { error: eA } = await admin.auth.admin.deleteUser(c.authId); if (eA) errores.push(`auth: ${eA.message}`); }
  }
  const quedan = {};
  for (const t of orden) quedan[t] = (await filtro(admin.from(t).select('*', { count: 'exact', head: true }), s[t].marca)).count;
  quedan.resoluciones += (await admin.from('resoluciones').select('*', { count: 'exact', head: true }).like('numero', `${RUN}%`)).count;
  quedan.caballerizas = (await admin.from('caballerizas').select('*', { count: 'exact', head: true }).eq('nombre', RUN)).count;
  quedan.usuarios = (await admin.from('usuarios').select('*', { count: 'exact', head: true }).like('email', `${RUN.toLowerCase()}%`)).count;
  return { errores, quedan };
}

async function fotoReales() {
  return {
    clubs: md5({ ...(await leerFila('clubs', { id: DOLORES })), updated_at: 0 }),   // los positivos de clubs son no-op: sólo mueven updated_at
    liquidacion_config: md5(await q(admin.from('liquidacion_config').select('*').eq('club_id', DOLORES).eq('activo', true), 'liq')),
    club_secuencias: md5(await q(admin.from('club_secuencias').select('*').order('club_id'), 'seq')),
  };
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────
const lineas = []; const log = s => { lineas.push(s); console.log(s); };
let codigo = 0, ctx = null, foto = null;
try {
  foto = await fotoReales();
  // contexto: caballeriza, resolución, pool de carrera_apuestas libres
  const cab = await q(admin.from('caballerizas').insert({ club_id: DOLORES, nombre: RUN, activo: false }).select('id').single(), 'cab');
  const resol = await q(admin.from('resoluciones').insert({ club_id: DOLORES, numero: `${RUN}-ctx`, fecha: '2099-01-01', tipo: 'probe' }).select('id').single(), 'resol');
  ctx = { cab: cab.id, resol: resol.id };
  await llenarPoolApuestas();

  const P = {};
  P.portal = await sesion('portal', 'profesional', DOLORES, { entidad_tipo: 'profesional', entidad_id: randomUUID() });
  P.portal_prop = await sesion('portal_prop', 'propietario', DOLORES, { entidad_tipo: 'propietario', entidad_id: randomUUID() });
  P.inactivo = await sesion('inactivo', 'operador', DOLORES);
  await q(admin.from('usuarios').update({ activo: false, estado: 'suspendido' }).eq('id', P.inactivo.usuarioId), 'inactivo');
  P.otroclub = await sesion('otroclub', 'operador', OTRO);
  P.secretario = await sesion('secretario', 'secretario_carreras', DOLORES);
  P.operador = await sesion('operador', 'operador', DOLORES);
  P.superadmin = await sesion('superadmin', 'super_admin', DOLORES);
  log(`contexto: RUN=${RUN} · ${EN_PROD ? 'PROD' : 'sandbox'} · ${Object.keys(P).length} perfiles con sesión real · pool apuestas=${apuPool.length}`);

  const tablas = SOLO ? [SOLO] : TABLAS;
  const res = []; const ok = (t, c, n = '') => res.push({ t, c: !!c, n });
  for (const t of tablas) await probarTabla(t, P, ctx, ok);
  for (const r of res) log(`${r.c ? '✅' : '❌'} ${r.t}${r.c ? '' : '  ← ' + r.n}`);
  const bien = res.filter(r => r.c).length;
  log(`\nMATRIZ: ${bien}/${res.length}`);
  if (bien !== res.length) codigo = 1;

  if (MUTANTES) {
    const rb = readFileSync(ROOT + 'migrations/rollback_politicas_escritura_staff_14.sql', 'utf8');
    const fw = readFileSync(ROOT + 'migrations/politicas_escritura_staff_14.sql', 'utf8');
    const bloques = (sql, t) => sql.split(/\n\n/).filter(b => b.includes(` ON public.${t};`)).join('\n\n') + '\n';
    let muertos = 0;
    for (const t of TABLAS) {
      execSync(PSQL, { input: bloques(rb, t), encoding: 'utf8', stdio: ['pipe', 'ignore', 'inherit'] });   // ESA tabla vuelve a la política de hoy
      const r = []; const okM = (x, c, n = '') => r.push({ t: x, c: !!c, n });
      try { await probarTabla(t, P, ctx, okM); } finally {
        execSync(PSQL, { input: bloques(fw, t), encoding: 'utf8', stdio: ['pipe', 'ignore', 'inherit'] });
        // Migraciones posteriores a ISSUE-093 que tocan la misma tabla: si no se reaplican, el restore de 093 las pisaría.
        for (const f of (POSTERIORES[t] || [])) execSync(PSQL, { input: readFileSync(ROOT + f, 'utf8'), encoding: 'utf8', stdio: ['pipe', 'ignore', 'inherit'] });
      }
      const rojos = r.filter(x => !x.c);
      const soloPortal = rojos.every(x => /portal/.test(x.t));
      log(`${rojos.length ? '💀 muere' : '🧟 SOBREVIVE'} M-${t} (política de hoy sólo en esa tabla) — ${rojos.length}/${r.length} en rojo${rojos.length ? (soloPortal ? ', todos de perfiles de portal' : ', OJO: rojos fuera del portal') : ''}: ${rojos.map(x => x.t).join(' | ')}`);
      if (rojos.length) muertos++;
      await barrerFixtures(ctx);   // sólo los fixtures de la corrida; perfiles y contexto siguen
    }
    log(`MUTANTES: ${muertos}/${TABLAS.length} muertos`);
    if (muertos !== TABLAS.length) codigo = 1;
  }
} catch (e) {
  log(`❌ ERROR: ${e.stack || e.message}`); codigo = 1;
} finally {
  try {
    const l = await barrer(ctx);
    const despues = foto ? await fotoReales() : null;
    const reales = foto && JSON.stringify(foto) === JSON.stringify(despues);
    const limpio = !l.errores.length && Object.values(l.quedan).every(v => v === 0);
    log(`${limpio && reales ? '✅' : '❌'} Z) limpieza por estado: ${JSON.stringify(l.quedan)}${l.errores.length ? ' · errores: ' + l.errores.join('; ') : ''} · filas reales (clubs Dolores, liquidacion_config activa, club_secuencias) idénticas a la foto: ${reales}`);
    if (!(limpio && reales)) codigo = 1;
  } catch (e) { log(`❌ Z) limpieza falló: ${e.message}`); codigo = 1; }
  process.exit(codigo);
}
