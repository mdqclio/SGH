/**
 * probe_resoluciones_sanciones_autor.mjs — ISSUE-097: autor y última modificación impuestos por la base,
 * auditoría en resoluciones / resolucion_entidades / sanciones, y borrado sólo de super_admin (base + pantalla).
 *
 * Sandbox por defecto. Con --prod corre contra prod DESPUÉS de aplicar: usuarios sintéticos en clubs reales (no crea
 * clubs ni reuniones, GOTCHA #101), sin sesión directa (A8 por MCP) y SIN los mutantes de base (M1–M7), que en prod
 * dejarían un rato sin autor ni auditoría; los de pantalla (M8–M11) sí.
 *   tests/local/up.sh sql < tests/local/usuarios_sandbox.sql
 *   tests/local/up.sh sql < tests/local/auditoria_sandbox.sql
 *   tests/local/up.sh sql < migrations/resoluciones_sanciones_autor.sql
 *   tests/local/up.sh sql < migrations/audit_resoluciones_sanciones.sql
 *   tests/local/up.sh sql < migrations/resoluciones_delete_super_admin.sql
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=$(cat tests/local/out/jwt) \
 *     LOCAL_JWT_SECRET=$(cat tests/local/out/jwt_secret) PSQL_CMD="tests/local/up.sh sql" \
 *     node tests/probe_resoluciones_sanciones_autor.mjs [--mutantes]
 *
 * Perfiles con sesión real (JWT firmado con el secreto del sandbox, con `email` para que fn_auditoria_log lo
 * identifique): secretario, operador, super_admin (Dolores), profesional del portal (Dolores), operador de otro
 * club. service_role sólo para sembrar/leer/limpiar y para los casos "sin sesión".
 *
 *   A · autor en la fila: INSERT impone creado_por de la sesión (ignora lo que mande el cliente) y deja
 *       modificado_* NULL; UPDATE congela creado_por y pone modificado_por/at; sin sesión → NULL.
 *   B · auditoría: cada INSERT/UPDATE/DELETE deja su fila con el usuario correcto; el borrado de una resolución
 *       registra también sus entidades (cascada).
 *   C · borrado sólo super_admin (resoluciones y sanciones); portal y otro club no escriben.
 *   D · pantallas (HTML real en jsdom): el botón de borrar sólo para super_admin; si igual se llama a
 *       deleteRecord sin permiso, error y no "eliminada". auditoria.html ofrece las tres tablas.
 * Mutantes (--mutantes, PSQL_CMD): M1–M7 de base, M8–M11 de pantalla. Cada uno tiene que morir.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import jsdom from 'jsdom';
const { JSDOM, VirtualConsole, requestInterceptor } = jsdom;

const ROOT = new URL('..', import.meta.url).pathname;
const PROD_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const EN_PROD = process.argv.includes('--prod');
const BASE_URL = EN_PROD ? PROD_URL : process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SECRET_KEY, JWT_SECRET = process.env.LOCAL_JWT_SECRET, PSQL = process.env.PSQL_CMD;
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
// En prod: usuarios SINTÉTICOS en clubs reales (Dolores, Mi Club Hípico), sesiones por magiclink, fixtures marcados
// que el finally borra (antes su auditoría y sus filas, después los usuarios: FK). Sin sesión directa (A8 se prueba
// aparte, por MCP, en una transacción revertida) y SIN mutantes de base: modificar triggers o políticas de prod para
// probar dejaría un rato sin autor ni auditoría. Los mutantes de pantalla (jsdom) sí corren.
if (!EN_PROD && (!BASE_URL || BASE_URL.includes('unlhcuanfrtpatoipwve'))) { console.error('Sin --prod, sólo sandbox'); process.exit(2); }
if (!KEY || (!EN_PROD && (!JWT_SECRET || !PSQL))) { console.error('Faltan SUPABASE_SECRET_KEY (y en sandbox LOCAL_JWT_SECRET / PSQL_CMD)'); process.exit(2); }
const DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c', OTRO = 'a6da7e40-1515-45dc-8933-4eef33ce937a';
const RUN = `PROBE-097-${Date.now()}`;
const admin = createClient(BASE_URL, KEY, { auth: { persistSession: false } });
const q = async (p, c) => { const r = await p; if (r.error) throw new Error(`[${c}] ${r.error.message}`); return r.data; };
const psql = sql => execSync(PSQL, { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const jwt = (sub, email) => { const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b({ alg: 'HS256', typ: 'JWT' }), p = b({ role: 'authenticated', sub, email, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`; };
process.on('unhandledRejection', () => {});

// ── perfiles ───────────────────────────────────────────────────────────────────────────────────
const P = {};
async function perfil(k, rol, club, extra = {}) {
  const email = `${RUN.toLowerCase()}-${k}@example.invalid`;
  let authId;
  if (EN_PROD) { const { data, error } = await admin.auth.admin.createUser({ email, password: 'Px-' + randomUUID(), email_confirm: true }); if (error) throw error; authId = data.user.id; }
  else authId = randomUUID();
  const u = await q(admin.from('usuarios').insert({ email, password_hash: '', nombre_completo: `${RUN} ${k}`, rol, club_id: club, activo: true, estado: 'activo', auth_user_id: authId, ...extra }).select('id').single(), `alta ${k}`);
  let cli;
  if (EN_PROD) {
    const { data: link, error: eL } = await admin.auth.admin.generateLink({ type: 'magiclink', email }); if (eL) throw eL;
    cli = createClient(BASE_URL, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: eV } = await cli.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' }); if (eV) throw eV;
  } else cli = createClient(BASE_URL, KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt(authId, email)}` } } });
  P[k] = { id: u.id, authId, email, rol, cli };
}
const resol = (extra = {}) => ({ club_id: DOLORES, numero: `${RUN}-${randomUUID().slice(0, 6)}`, fecha: '2099-01-01', tipo: 'probe', texto: RUN, ...extra });
const sanc = (extra = {}) => ({ club_id: DOLORES, entidad_tipo: 'spc', entidad_id: randomUUID(), tipo_sancion: 'probe', motivo: RUN, fecha_inicio: '2099-01-01', alcance: 'club', ...extra });
const leer = (t, id) => q(admin.from(t).select('*').eq('id', id).single(), `leer ${t}`);
const audit = async (t, id) => q(admin.from('auditoria').select('accion,usuario_id,club_id').eq('tabla', t).eq('registro_id', id).order('created_at'), 'audit');
const reciente = ts => ts && Math.abs(Date.now() - new Date(ts).getTime()) < 120000;

// ── A + B + C ──────────────────────────────────────────────────────────────────────────────────
async function suiteBase() {
  const r = []; const ok = (t, c, n = '') => r.push({ t, c: !!c, n });
  // A1 secretario manda creado_por y modificado_* ajenos
  const a1 = await P.sec.cli.from('resoluciones').insert(resol({ creado_por: P.sa.id, modificado_por: P.sa.id, modificado_at: '2000-01-01T00:00:00Z' })).select('*').single();
  ok('A1) secretario crea resolución: creado_por = él (ignora el del cliente), modificado_* NULL', !a1.error && a1.data.creado_por === P.sec.id && a1.data.modificado_por === null && a1.data.modificado_at === null, JSON.stringify({ e: a1.error?.message, d: a1.data && { c: a1.data.creado_por, mp: a1.data.modificado_por, ma: a1.data.modificado_at } }));
  // A2 operador crea sanción sin creado_por
  const a2 = await P.ope.cli.from('sanciones').insert(sanc()).select('*').single();
  ok('A2) operador crea sanción sin mandar autor: creado_por = él', !a2.error && a2.data.creado_por === P.ope.id, JSON.stringify({ e: a2.error?.message, c: a2.data?.creado_por }));
  // A3 super_admin
  const a3 = await P.sa.cli.from('resoluciones').insert(resol()).select('*').single();
  ok('A3) super_admin crea resolución: creado_por = él', !a3.error && a3.data.creado_por === P.sa.id, JSON.stringify({ e: a3.error?.message, c: a3.data?.creado_por }));
  // A4 sin sesión
  const a4 = await admin.from('resoluciones').insert(resol({ creado_por: P.sec.id })).select('*').single();
  ok('A4) service_role (sin sesión) crea resolución mandando autor: creado_por NULL', !a4.error && a4.data.creado_por === null, JSON.stringify({ e: a4.error?.message, c: a4.data?.creado_por }));
  // A5 operador edita la resolución del secretario y trata de cambiar el autor
  if (a1.data) {
    const a5 = await P.ope.cli.from('resoluciones').update({ texto: `${RUN} editado`, creado_por: P.ope.id, modificado_por: P.sa.id }).eq('id', a1.data.id).select('*').single();
    ok('A5) operador edita: creado_por congelado (secretario), modificado_por = operador, modificado_at ahora', !a5.error && a5.data.creado_por === P.sec.id && a5.data.modificado_por === P.ope.id && reciente(a5.data.modificado_at), JSON.stringify({ e: a5.error?.message, d: a5.data && { c: a5.data.creado_por, mp: a5.data.modificado_por, ma: a5.data.modificado_at } }));
  }
  // A6 secretario edita la sanción del operador
  if (a2.data) {
    const a6 = await P.sec.cli.from('sanciones').update({ fecha_fin: '2099-12-31', creado_por: P.sec.id }).eq('id', a2.data.id).select('*').single();
    ok('A6) secretario edita la sanción: creado_por congelado (operador), modificado_por = secretario', !a6.error && a6.data.creado_por === P.ope.id && a6.data.modificado_por === P.sec.id && reciente(a6.data.modificado_at), JSON.stringify({ e: a6.error?.message, d: a6.data && { c: a6.data.creado_por, mp: a6.data.modificado_por } }));
  }
  // A7 service_role edita
  if (a1.data) {
    const a7 = await admin.from('resoluciones').update({ texto: `${RUN} sr`, creado_por: null }).eq('id', a1.data.id).select('*').single();
    ok('A7) service_role edita: creado_por congelado, modificado_por NULL, modificado_at ahora', !a7.error && a7.data.creado_por === P.sec.id && a7.data.modificado_por === null && reciente(a7.data.modificado_at), JSON.stringify({ e: a7.error?.message, d: a7.data && { c: a7.data.creado_por, mp: a7.data.modificado_por } }));
    // A8 sesión directa (como una migración). En prod no hay sesión directa desde acá: se prueba por MCP.
    if (!EN_PROD) {
      psql(`UPDATE resoluciones SET creado_por = NULL WHERE id = '${a1.data.id}';`);
      ok('A8) sesión directa (migración) tampoco cambia creado_por', (await leer('resoluciones', a1.data.id)).creado_por === P.sec.id);
    }
  }

  // B · auditoría
  if (a1.data) {
    const au = await audit('resoluciones', a1.data.id);
    ok('B1) resolución: INSERT del secretario + UPDATE del operador + UPDATE sin sesión, con su usuario', au.length >= 3 && au[0].accion === 'INSERT' && au[0].usuario_id === P.sec.id && au[1].accion === 'UPDATE' && au[1].usuario_id === P.ope.id && au[2].usuario_id === null, JSON.stringify(au));
  }
  if (a2.data) {
    const au = await audit('sanciones', a2.data.id);
    ok('B2) sanción: INSERT del operador + UPDATE del secretario', au.length >= 2 && au[0].accion === 'INSERT' && au[0].usuario_id === P.ope.id && au[1].accion === 'UPDATE' && au[1].usuario_id === P.sec.id, JSON.stringify(au));
  }
  if (a4.data) {
    const au = await audit('resoluciones', a4.data.id);
    ok('B3) INSERT sin sesión queda auditado con usuario NULL', au.length === 1 && au[0].usuario_id === null, JSON.stringify(au));
  }
  const ent = a3.data ? await P.sec.cli.from('resolucion_entidades').insert({ resolucion_id: a3.data.id, entidad_tipo: 'spc', entidad_id: randomUUID(), descripcion: RUN }).select('*').single() : { error: { message: 'sin a3' } };
  if (ent.data) {
    const au = await audit('resolucion_entidades', ent.data.id);
    ok('B4) resolucion_entidades: INSERT auditado con el secretario y su club', au.length === 1 && au[0].usuario_id === P.sec.id && au[0].club_id === DOLORES, JSON.stringify(au));
  } else ok('B4) resolucion_entidades: INSERT auditado', false, ent.error?.message);

  // C · borrado
  for (const k of ['sec', 'ope']) {
    const d = await P[k].cli.from('resoluciones').delete().eq('id', a3.data?.id).select('id');
    ok(`C1.${k}) ${P[k].rol} no puede borrar una resolución (0 filas, sigue)`, !(d.data || []).length && !!(await admin.from('resoluciones').select('id').eq('id', a3.data?.id)).data?.length, JSON.stringify({ e: d.error?.code, n: d.data?.length }));
    const ds = await P[k].cli.from('sanciones').delete().eq('id', a2.data?.id).select('id');
    ok(`C2.${k}) ${P[k].rol} no puede borrar una sanción (0 filas, sigue)`, !(ds.data || []).length && !!(await admin.from('sanciones').select('id').eq('id', a2.data?.id)).data?.length, JSON.stringify({ e: ds.error?.code, n: ds.data?.length }));
  }
  const dsa = await P.sa.cli.from('resoluciones').delete().eq('id', a3.data?.id).select('id');
  ok('C3) super_admin borra la resolución', !dsa.error && (dsa.data || []).length === 1, JSON.stringify({ e: dsa.error?.message, n: dsa.data?.length }));
  if (ent.data) {
    const auR = await audit('resoluciones', a3.data.id), auE = await audit('resolucion_entidades', ent.data.id);
    ok('B5) el borrado queda auditado (resolución con super_admin + su entidad por cascada)', auR.some(x => x.accion === 'DELETE' && x.usuario_id === P.sa.id) && auE.some(x => x.accion === 'DELETE'), JSON.stringify({ auR, auE }));
  }
  const dss = await P.sa.cli.from('sanciones').delete().eq('id', a2.data?.id).select('id');
  ok('C4) super_admin borra la sanción', !dss.error && (dss.data || []).length === 1, JSON.stringify({ e: dss.error?.message, n: dss.data?.length }));
  // portal y otro club
  const pi = await P.portal.cli.from('resoluciones').insert(resol()).select('id');
  ok('C5) portal: crear resolución → 42501', pi.error?.code === '42501', JSON.stringify(pi.error));
  const ps = await P.portal.cli.from('sanciones').insert(sanc()).select('id');
  ok('C6) portal: crear sanción → 42501', ps.error?.code === '42501', JSON.stringify(ps.error));
  if (a1.data) {
    const pu = await P.portal.cli.from('resoluciones').update({ texto: 'portal' }).eq('id', a1.data.id).select('id');
    ok('C7) portal: editar resolución → 0 filas', !(pu.data || []).length, JSON.stringify({ e: pu.error?.code, n: pu.data?.length }));
    const pd = await P.portal.cli.from('resoluciones').delete().eq('id', a1.data.id).select('id');
    ok('C8) portal: borrar resolución → 0 filas', !(pd.data || []).length, JSON.stringify({ e: pd.error?.code, n: pd.data?.length }));
  }
  const oi = await P.otro.cli.from('resoluciones').insert(resol()).select('id');
  ok('C9) operador de otro club: crear resolución de Dolores → 42501', oi.error?.code === '42501', JSON.stringify(oi.error));
  return r;
}

// ── D · pantallas ──────────────────────────────────────────────────────────────────────────────
async function montar(html, quien) {
  const dom = new JSDOM(html, { url: 'https://sigh.com.ar/x.html', runScripts: 'dangerously', virtualConsole: new VirtualConsole(), pretendToBeVisual: true,
    resources: { interceptors: [requestInterceptor(req => { const u = new URL(req.url); let c = ''; if (u.hostname === 'sigh.com.ar') { try { c = readFileSync(ROOT + u.pathname.slice(1), 'utf8'); } catch {} }
      return new Response(c, { headers: { 'Content-Type': 'application/javascript' } }); })] } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window;
  w.__sb = P[quien].cli; w.__cu = { id: P[quien].authId, usuario_id: P[quien].id, rol: P[quien].rol, nombre_completo: 'x' }; w.confirm = () => true;
  w.eval(`sb = __sb; currentUser = __cu; CLUB_ID = '${DOLORES}';`);
  const toasts = () => [...w.document.querySelectorAll('#toast-container .toast, .toast')].map(t => ({ tipo: /error/.test(t.className) ? 'error' : 'ok', msg: t.textContent }));
  return { w, d: w.document, toasts };
}
async function suiteFront(htmlRes, htmlSan, htmlAud) {
  const r = []; const ok = (t, c, n = '') => r.push({ t, c: !!c, n });
  const filaRes = { id: randomUUID(), club_id: DOLORES, numero: 'X', fecha: '2099-01-01', tipo: 'probe', texto: 't', estado: 'notificada' };
  const filaSan = { id: randomUUID(), club_id: DOLORES, entidad_tipo: 'spc', entidad_id: randomUUID(), tipo_sancion: 'probe', motivo: 'm', fecha_inicio: '2099-01-01', estado: 'activa' };
  for (const [pag, html, fila] of [['resoluciones', htmlRes, filaRes], ['sanciones', htmlSan, filaSan]]) {
    for (const k of ['sec', 'ope', 'sa']) {
      const { w, d } = await montar(html, k);
      w.__fila = fila; w.eval('renderList([__fila])');
      const hay = !!d.querySelector('#list-container .btn-delete');
      ok(`D1.${pag}.${k}) botón borrar ${k === 'sa' ? 'visible' : 'oculto'} para ${P[k].rol}`, k === 'sa' ? hay : !hay, `hay=${hay}`);
      w.close();
    }
    // deleteRecord sin permiso, sobre una fila real
    const real = pag === 'resoluciones' ? await q(admin.from('resoluciones').insert(resol()).select('id').single(), 'fx') : await q(admin.from('sanciones').insert(sanc()).select('id').single(), 'fx');
    const { w, toasts } = await montar(pag === 'resoluciones' ? htmlRes : htmlSan, 'ope');
    try { w.eval('allData = []; filterRender = () => {}; updateStats = () => {}; load = () => {};'); } catch {}
    await w.eval(`deleteRecord('${real.id}')`);
    const t = toasts(), sigue = !!(await admin.from(pag).select('id').eq('id', real.id)).data?.length;
    ok(`D2.${pag}) deleteRecord como operador: error "no tenés permiso", nada de "eliminada", la fila sigue`, sigue && t.some(x => x.tipo === 'error' && /permiso/i.test(x.msg)) && !t.some(x => x.tipo === 'ok'), JSON.stringify({ t, sigue }));
    w.close();
  }
  ok('D3) auditoria.html ofrece resoluciones, resolucion_entidades y sanciones', ['resoluciones', 'resolucion_entidades', 'sanciones'].every(t => htmlAud.includes(`<option value="${t}">`)));
  return r;
}

// ── mutantes ───────────────────────────────────────────────────────────────────────────────────
const leerArch = f => readFileSync(ROOT + f, 'utf8');
const SQL_FW = { A: leerArch('migrations/resoluciones_sanciones_autor.sql'), B: leerArch('migrations/audit_resoluciones_sanciones.sql'), C: leerArch('migrations/resoluciones_delete_super_admin.sql') };
const fnSinCongelar = SQL_FW.A.match(/CREATE OR REPLACE FUNCTION public\.fn_autor_fila\(\)[\s\S]*?\$function\$;/)[0].replace('    NEW.creado_por     := OLD.creado_por;\n', '');
const MUT_SQL = {
  'M1 sin trg_resoluciones_autor': ['DROP TRIGGER trg_resoluciones_autor ON resoluciones;', 'CREATE TRIGGER trg_resoluciones_autor BEFORE INSERT OR UPDATE ON public.resoluciones FOR EACH ROW EXECUTE FUNCTION public.fn_autor_fila();'],
  'M2 fn_autor_fila no congela creado_por': [fnSinCongelar, SQL_FW.A.match(/CREATE OR REPLACE FUNCTION public\.fn_autor_fila\(\)[\s\S]*?\$function\$;/)[0]],
  'M3 sin trg_audit_resoluciones': ['DROP TRIGGER trg_audit_resoluciones ON resoluciones;', 'CREATE TRIGGER trg_audit_resoluciones AFTER INSERT OR DELETE OR UPDATE ON public.resoluciones FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();'],
  'M4 sin trg_audit_sanciones': ['DROP TRIGGER trg_audit_sanciones ON sanciones;', 'CREATE TRIGGER trg_audit_sanciones AFTER INSERT OR DELETE OR UPDATE ON public.sanciones FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();'],
  'M5 sin trg_audit_resolucion_entidades': ['DROP TRIGGER trg_audit_resolucion_entidades ON resolucion_entidades;', 'CREATE TRIGGER trg_audit_resolucion_entidades AFTER INSERT OR DELETE OR UPDATE ON public.resolucion_entidades FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();'],
  'M6 resoluciones_delete vuelve a staff': [leerArch('migrations/rollback_resoluciones_delete_super_admin.sql'), SQL_FW.C],
  'M7 sin trg_sanciones_autor': ['DROP TRIGGER trg_sanciones_autor ON sanciones;', 'CREATE TRIGGER trg_sanciones_autor BEFORE INSERT OR UPDATE ON public.sanciones FOR EACH ROW EXECUTE FUNCTION public.fn_autor_fila();'],
};
const HTML = { res: leerArch('resoluciones.html'), san: leerArch('sanciones.html'), aud: leerArch('auditoria.html') };
const mutH = (s, a, b) => { if (s.split(a).length !== 2) throw new Error('ancla: ' + a.slice(0, 50)); return s.replace(a, b); };
const CHK_R = "  if (!data || !data.length) { toast('No tenés permiso para eliminar esta resolución', 'error'); return; }\n";
const CHK_S = "  if (!data || !data.length) { toast('No tenés permiso para eliminar esta sanción', 'error'); return; }\n";
const PB = "function puedeBorrar() { return currentUser?.rol === 'super_admin'; }";
const MUT_FRONT = {
  'M8 resoluciones.html muestra borrar a todos': () => [mutH(HTML.res, PB, 'function puedeBorrar() { return true; }'), HTML.san, HTML.aud],
  'M9 resoluciones.html sin chequeo de 0 filas': () => [mutH(HTML.res, CHK_R, ''), HTML.san, HTML.aud],
  'M10 sanciones.html muestra borrar a todos': () => [HTML.res, mutH(HTML.san, PB, 'function puedeBorrar() { return true; }'), HTML.aud],
  'M11 sanciones.html sin chequeo de 0 filas': () => [HTML.res, mutH(HTML.san, CHK_S, ''), HTML.aud],
};

// ── main ───────────────────────────────────────────────────────────────────────────────────────
async function barrer() {
  const ids = Object.values(P).map(p => p.id);
  await admin.from('resolucion_entidades').delete().eq('descripcion', RUN);
  await admin.from('resoluciones').delete().like('numero', `${RUN}%`);
  await admin.from('sanciones').delete().eq('motivo', RUN);
  if (ids.length) {
    await admin.from('auditoria').delete().in('usuario_id', ids);
    await admin.from('usuarios').delete().in('id', ids);
    if (EN_PROD) for (const p of Object.values(P)) await admin.auth.admin.deleteUser(p.authId);
  }
  const c = async (t, f) => (await f(admin.from(t).select('*', { count: 'exact', head: true }))).count;
  return { resoluciones: await c('resoluciones', x => x.like('numero', `${RUN}%`)), sanciones: await c('sanciones', x => x.eq('motivo', RUN)),
    entidades: await c('resolucion_entidades', x => x.eq('descripcion', RUN)), usuarios: await c('usuarios', x => x.like('email', `${RUN.toLowerCase()}%`)) };
}

let codigo = 0;
try {
  await perfil('sec', 'secretario_carreras', DOLORES); await perfil('ope', 'operador', DOLORES); await perfil('sa', 'super_admin', DOLORES);
  await perfil('portal', 'profesional', DOLORES, { entidad_tipo: 'profesional', entidad_id: randomUUID() }); await perfil('otro', 'operador', OTRO);
  console.log(`contexto: RUN=${RUN} · ${EN_PROD ? 'PROD (sin mutantes de base)' : 'sandbox'} · ${Object.keys(P).length} perfiles`);
  const res = [...await suiteBase(), ...await suiteFront(HTML.res, HTML.san, HTML.aud)];
  for (const x of res) console.log(`${x.c ? '✅' : '❌'} ${x.t}${x.c ? '' : '  ← ' + x.n}`);
  const bien = res.filter(x => x.c).length; console.log(`\nSUITE: ${bien}/${res.length}`); if (bien !== res.length) codigo = 1;
  if (process.argv.includes('--mutantes')) {
    let muertos = 0, total = 0;
    for (const [nom, [mut, rest]] of Object.entries(EN_PROD ? {} : MUT_SQL)) {
      total++; psql(mut); psql("NOTIFY pgrst, 'reload schema';");
      let rr; try { rr = await suiteBase(); } finally { psql(rest); psql("NOTIFY pgrst, 'reload schema';"); }
      const rojos = rr.filter(x => !x.c); if (rojos.length) muertos++;
      console.log(`${rojos.length ? '💀 muere' : '🧟 SOBREVIVE'} ${nom} — ${rojos.length}/${rr.length}: ${rojos.map(x => x.t).join(' | ')}`);
    }
    for (const [nom, mk] of Object.entries(MUT_FRONT)) {
      total++; const rr = await suiteFront(...mk()); const rojos = rr.filter(x => !x.c); if (rojos.length) muertos++;
      console.log(`${rojos.length ? '💀 muere' : '🧟 SOBREVIVE'} ${nom} — ${rojos.length}/${rr.length}: ${rojos.map(x => x.t).join(' | ')}`);
    }
    console.log(`MUTANTES: ${muertos}/${total} muertos`); if (muertos !== total) codigo = 1;
  }
} catch (e) { console.log(`❌ ERROR: ${e.stack || e.message}`); codigo = 1; }
finally {
  const l = await barrer(); const limpio = Object.values(l).every(v => v === 0);
  console.log(`${limpio ? '✅' : '❌'} Z) limpieza: ${JSON.stringify(l)}`); if (!limpio) codigo = 1;
  process.exit(codigo);
}
