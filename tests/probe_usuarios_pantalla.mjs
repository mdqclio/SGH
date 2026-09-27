/**
 * probe_usuarios_pantalla.mjs — usuarios.html: secciones personal/portal, acciones según rol, nunca
 * éxito sobre 0 filas, rol sólo si cambió y se puede, baja con estado válido.
 *
 * SÓLO SANDBOX (GOTCHA #101): crea usuarios de todos los roles, que en prod no deben inventarse.
 *
 *   tests/local/up.sh sql < tests/local/usuarios_sandbox.sql      # RLS + triggers + CHECK de prod
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=$(cat tests/local/out/jwt) \
 *     LOCAL_JWT_SECRET=$(cat tests/local/out/jwt_secret) node tests/probe_usuarios_pantalla.mjs [--mutantes]
 *
 * Cómo. HTML REAL en jsdom con sus scripts (runScripts 'dangerously'); los <script src> locales se
 * sirven del disco, el CDN de supabase-js se corta (initAuth falla sola). A la página se le inyecta
 * `sb` = cliente del sandbox con el JWT del usuario que "mira" (sesión real contra la RLS de la
 * réplica), `currentUser` y `CLUB_ID`, y se llaman las funciones REALES: load(), openEdit(),
 * saveEdit(), toggleActivo(). Los botones se leen del DOM; las escrituras se leen de la base con
 * service_role; los toasts del #toast-container; el payload del UPDATE con un espía sobre sb.
 *
 * Fixtures sintéticos (Dolores): super_admin, 2 secretarios, 1 operador, 2 profesionales,
 * 1 propietario + 1 operador de otro club (no tiene que aparecer). Se borran en el finally.
 *
 * Mutantes (--mutantes), uno por regla (texto de usuarios.html):
 *   M1 secciones: esPortal() siempre false            M2 portal con Editar
 *   M3 saveEdit sin chequeo de 0 filas                 M4 rol siempre en el payload (el '' de antes)
 *   M5 acciones sin filtrar por rol                    M6 toggleActivo sin chequeo de 0 filas
 *   M7 baja con estado 'inactivo' (el CHECK lo rechaza) M8 se ofrece darse de baja a uno mismo
 * Env: USUARIOS_HTML (ruta; default el del repo).
 */
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import jsdom from 'jsdom';
const { JSDOM, VirtualConsole, requestInterceptor } = jsdom;

const ROOT = new URL('..', import.meta.url).pathname;
const BASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;
const JWT_SECRET = process.env.LOCAL_JWT_SECRET;
if (!BASE_URL || BASE_URL.includes('unlhcuanfrtpatoipwve')) { console.error('Sólo sandbox (GOTCHA #101): SUPABASE_URL=http://127.0.0.1:54321'); process.exit(2); }
if (!KEY || !JWT_SECRET) { console.error('Faltan SUPABASE_SECRET_KEY / LOCAL_JWT_SECRET del sandbox'); process.exit(2); }

const DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c', OTRO = 'a6da7e40-1515-45dc-8933-4eef33ce937a';
const RUN = `PROBE-USR-${Date.now()}`;
const admin = createClient(BASE_URL, KEY, { auth: { persistSession: false } });
const HTML = readFileSync(process.env.USUARIOS_HTML || ROOT + 'usuarios.html', 'utf8');
const q = async (p, c) => { const r = await p; if (r.error) throw new Error(`[${c}] ${r.error.message}`); return r.data; };
const jwt = sub => { const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b({ alg: 'HS256', typ: 'JWT' }), p = b({ role: 'authenticated', sub, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`; };
process.on('unhandledRejection', () => {});   // initAuth sin supabase-js, a propósito

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────
const U = {};
async function alta(k, rol, club = DOLORES, extra = {}) {
  const authId = randomUUID();
  const fila = await q(admin.from('usuarios').insert({ email: `${RUN.toLowerCase()}-${k}@example.invalid`, password_hash: '',
    nombre_completo: `${RUN} ${k}`, telefono: `tel-${k}`, rol, club_id: club, activo: true, estado: 'activo', auth_user_id: authId, ...extra })
    .select('*').single(), `alta ${k}`);
  U[k] = { ...fila, authId };
}
// Restaurar un rol con service_role no se puede: auth.uid() es NULL y trg_proteger_rol_club_id_usuario
// rechaza cualquier cambio de rol que no venga de un super_admin logueado. Se restaura con la sesión
// del super_admin sintético.
const saCli = () => createClient(BASE_URL, KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt(U.sa.authId)}` } } });
const leer = async k => q(admin.from('usuarios').select('*').eq('id', U[k].id).single(), `leer ${k}`);
const barrer = async () => { await admin.from('usuarios').delete().like('email', `${RUN.toLowerCase()}%`);
  return (await admin.from('usuarios').select('*', { count: 'exact', head: true }).like('email', `${RUN.toLowerCase()}%`)).count; };

// ── montaje ──────────────────────────────────────────────────────────────────────────────────
async function montar(html, quien) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { url: 'https://sigh.com.ar/usuarios.html', runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
    resources: { interceptors: [requestInterceptor(req => {
      const u = new URL(req.url); let cuerpo = '';
      if (u.hostname === 'sigh.com.ar') { try { cuerpo = readFileSync(ROOT + u.pathname.slice(1), 'utf8'); } catch {} }
      return new Response(cuerpo, { headers: { 'Content-Type': 'application/javascript' } });
    })] } });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document;
  const cli = createClient(BASE_URL, KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt(U[quien].authId)}` } } });
  const payloads = [];
  w.__sb = { from: t => { const qb = cli.from(t);
    return new Proxy(qb, { get: (o, m) => m === 'update' ? (p => { payloads.push(p); return o.update(p); }) : (typeof o[m] === 'function' ? o[m].bind(o) : o[m]) }); } };
  w.__cu = { id: U[quien].authId, rol: U[quien].rol, nombre_completo: U[quien].nombre_completo };
  w.confirm = () => true;
  w.eval(`sb = __sb; currentUser = __cu; CLUB_ID = '${DOLORES}';`);
  await w.eval('load()');
  const toasts = () => [...d.querySelectorAll('#toast-container .toast')].map(t => ({ tipo: t.className.includes('toast-error') ? 'error' : 'ok', msg: t.textContent }));
  const limpiarToasts = () => { d.getElementById('toast-container').innerHTML = ''; };
  const fila = k => d.querySelector(`tr[data-id="${U[k].id}"]`) || [...d.querySelectorAll('tr')].find(tr => (tr.innerHTML).includes(U[k].id));
  const botones = k => [...(fila(k)?.querySelectorAll('button') || [])].map(b => b.textContent.trim());
  const seccionDe = k => fila(k)?.closest('[data-seccion]')?.getAttribute('data-seccion') ?? (fila(k) ? 'sin-seccion' : null);
  return { w, d, payloads, toasts, limpiarToasts, fila, botones, seccionDe };
}

// ── suite ────────────────────────────────────────────────────────────────────────────────────
async function suite(html) {
  const res = []; const ok = (t, c, n = '') => res.push({ t, c: !!c, n });

  // S1–S2 · super_admin mira
  {
    const P = await montar(html, 'sa');
    const personal = ['sa', 'sec1', 'sec2', 'ope'], portal = ['prof1', 'prof2', 'prop'];
    ok('S1a) personal en "Personal del hipódromo"', personal.every(k => P.seccionDe(k) === 'personal'), JSON.stringify(personal.map(P.seccionDe)));
    ok('S1b) portal en "Usuarios del portal"', portal.every(k => P.seccionDe(k) === 'portal'), JSON.stringify(portal.map(P.seccionDe)));
    ok('S1c) otro club no aparece', !P.fila('otro'));
    const base = await q(admin.from('usuarios').select('rol,nombre_completo').eq('club_id', DOLORES).order('nombre_completo'), 'conteo');
    const nPortal = base.filter(u => ['profesional', 'propietario'].includes(u.rol)).length, nPersonal = base.length - nPortal;
    const conteo = s => P.d.querySelector(`[data-seccion="${s}"] .seccion-conteo`)?.textContent || '';
    const titulo = s => P.d.querySelector(`[data-seccion="${s}"] .seccion-titulo`)?.textContent || '';
    ok('S1d) títulos', titulo('personal').startsWith('Personal del hipódromo') && titulo('portal').startsWith('Usuarios del portal'), JSON.stringify([titulo('personal'), titulo('portal')]));
    ok('S1e) conteos = base', conteo('personal').startsWith(`${nPersonal} `) && conteo('portal').startsWith(`${nPortal} `) &&
      P.d.querySelectorAll('[data-seccion="personal"] tbody tr').length === nPersonal && P.d.querySelectorAll('[data-seccion="portal"] tbody tr').length === nPortal,
      JSON.stringify({ conteo: [conteo('personal'), conteo('portal')], base: [nPersonal, nPortal] }));
    const orden = s => [...P.d.querySelectorAll(`[data-seccion="${s}"] .cell-name`)].map(e => e.textContent);
    const esperado = f => base.filter(f).map(u => u.nombre_completo || '—');
    ok('S1f) orden alfabético (el de la base) dentro de cada sección',
      JSON.stringify(orden('personal')) === JSON.stringify(esperado(u => !['profesional', 'propietario'].includes(u.rol))) &&
      JSON.stringify(orden('portal')) === JSON.stringify(esperado(u => ['profesional', 'propietario'].includes(u.rol))));
    ok('S2a) fila de portal sin Editar (super_admin)', portal.every(k => !P.botones(k).some(b => b.includes('Editar'))), JSON.stringify(portal.map(P.botones)));
    ok('S2b) fila de portal con alta/baja (super_admin)', portal.every(k => P.botones(k).some(b => /Desactivar|Activar/.test(b))), JSON.stringify(portal.map(P.botones)));
    ok('S2c) personal ajeno: Editar + alta/baja (super_admin)', ['sec1', 'sec2', 'ope'].every(k => P.botones(k).some(b => b.includes('Editar')) && P.botones(k).some(b => /Desactivar/.test(b))));
    ok('S2d) nadie se ofrece darse de baja a sí mismo (super_admin)', !P.botones('sa').some(b => /Desactivar/.test(b)) && P.botones('sa').some(b => b.includes('Editar')), JSON.stringify(P.botones('sa')));

    // S3 · super_admin edita SÓLO el teléfono de una fila de portal (por función: no hay botón)
    P.w.eval(`openEdit('${U.prof1.id}')`);
    ok('S3a) portal: el campo rol no se ofrece', P.d.getElementById('e-rol-group')?.hidden === true);
    P.d.getElementById('e-telefono').value = 'tel-nuevo-prof1';
    P.payloads.length = 0; P.limpiarToasts();
    await P.w.eval('saveEdit()');
    const p1 = await leer('prof1');
    ok('S3b) no manda rol', P.payloads.length === 1 && !('rol' in P.payloads[0]), JSON.stringify(P.payloads));
    ok('S3c) no falla y guarda', p1.telefono === 'tel-nuevo-prof1' && p1.rol === 'profesional' && P.toasts().some(t => t.tipo === 'ok') && !P.toasts().some(t => t.tipo === 'error'), JSON.stringify(P.toasts()));

    // S3d · super_admin sobre personal: rol visible; sin cambio no se manda; con cambio sí
    P.w.eval(`openEdit('${U.sec1.id}')`);
    ok('S3d) personal: el campo rol se ofrece con el rol de la fila', P.d.getElementById('e-rol-group')?.hidden === false && P.d.getElementById('e-rol').value === 'secretario_carreras');
    P.payloads.length = 0; await P.w.eval('saveEdit()');
    ok('S3e) rol sin cambio → no se manda', P.payloads.length === 1 && !('rol' in P.payloads[0]), JSON.stringify(P.payloads));
    await P.w.eval('load()');
    P.w.eval(`openEdit('${U.ope.id}')`); P.d.getElementById('e-rol').value = 'secretario_carreras';
    P.payloads.length = 0; await P.w.eval('saveEdit()');
    ok('S3f) rol cambiado por super_admin → se manda y queda', P.payloads[0]?.rol === 'secretario_carreras' && (await leer('ope')).rol === 'secretario_carreras', JSON.stringify(P.payloads));
    await q(saCli().from('usuarios').update({ rol: 'operador' }).eq('id', U.ope.id), 'restore ope');

    // S8 · super_admin da de baja y de alta a un usuario del portal
    await P.w.eval('load()'); P.limpiarToasts();
    await P.w.eval(`toggleActivo('${U.prof2.id}', false)`);
    const b = await leer('prof2');
    ok('S8a) baja: activo=false con estado válido (no rechaza el CHECK)', b.activo === false && b.estado === 'suspendido' && !P.toasts().some(t => t.tipo === 'error'), JSON.stringify({ activo: b.activo, estado: b.estado, toasts: P.toasts() }));
    await P.w.eval('load()'); P.limpiarToasts();
    await P.w.eval(`toggleActivo('${U.prof2.id}', true)`);
    const a = await leer('prof2');
    ok('S8b) alta: activo=true, estado activo', a.activo === true && a.estado === 'activo' && !P.toasts().some(t => t.tipo === 'error'), JSON.stringify({ activo: a.activo, estado: a.estado }));
    P.w.close();
  }

  // S4–S7 · secretario mira
  {
    const P = await montar(html, 'sec1');
    ok('S4a) secretario: filas ajenas se muestran, sin botones', ['sa', 'sec2', 'ope', 'prof1', 'prof2', 'prop'].every(k => P.fila(k) && P.botones(k).length === 0),
      JSON.stringify(Object.fromEntries(['sa', 'sec2', 'ope', 'prof1', 'prof2', 'prop'].map(k => [k, P.botones(k)]))));
    ok('S4b) secretario: su fila con Editar y sin Desactivar', P.botones('sec1').some(b => b.includes('Editar')) && !P.botones('sec1').some(b => /Desactivar|Activar/.test(b)), JSON.stringify(P.botones('sec1')));
    ok('S4c) secretario: mismas secciones', P.seccionDe('sec2') === 'personal' && P.seccionDe('prof1') === 'portal');

    // S5 · secretario edita a otro secretario (por función: no tiene botón)
    const antes2 = await leer('sec2');
    P.w.eval(`openEdit('${U.sec2.id}')`); P.d.getElementById('e-telefono').value = 'hackeado';
    P.limpiarToasts(); await P.w.eval('saveEdit()');
    const t5 = P.toasts(), despues2 = await leer('sec2');
    ok('S5a) otro secretario → error, no "actualizado"', t5.some(t => t.tipo === 'error' && /permiso/.test(t.msg)) && !t5.some(t => t.tipo === 'ok'), JSON.stringify(t5));
    ok('S5b) la fila no cambió', despues2.telefono === antes2.telefono);

    // S6 · secretario sobre su propia fila
    P.w.eval(`openEdit('${U.sec1.id}')`);
    ok('S6a) su fila: el campo rol no se ofrece (no puede cambiarlo)', P.d.getElementById('e-rol-group')?.hidden === true);
    P.d.getElementById('e-telefono').value = 'tel-propio-sec1';
    P.payloads.length = 0; P.limpiarToasts(); await P.w.eval('saveEdit()');
    const t6 = P.toasts(), s1 = await leer('sec1');
    ok('S6b) guarda, sin rol en el payload, toast ok', s1.telefono === 'tel-propio-sec1' && !('rol' in (P.payloads[0] || {})) && t6.some(t => t.tipo === 'ok') && !t6.some(t => t.tipo === 'error'), JSON.stringify({ t6, p: P.payloads }));

    // S7 · secretario hace toggleActivo sobre fila ajena (por función)
    const antes7 = await leer('prof1');
    P.limpiarToasts(); await P.w.eval(`toggleActivo('${U.prof1.id}', false)`);
    const t7 = P.toasts(), despues7 = await leer('prof1');
    ok('S7a) toggle ajeno → error, no "desactivado"', t7.some(t => t.tipo === 'error' && /permiso/.test(t.msg)) && !t7.some(t => t.tipo === 'ok'), JSON.stringify(t7));
    ok('S7b) la fila no cambió', despues7.activo === antes7.activo && despues7.estado === antes7.estado);
    P.w.close();
  }
  return res;
}

// ── mutantes ─────────────────────────────────────────────────────────────────────────────────
const mut = (a, b) => () => { if (HTML.split(a).length !== 2) throw new Error('ancla no única: ' + a.slice(0, 60)); return HTML.replace(a, b); };
const MUTANTES = {
  'M1 secciones: esPortal() siempre false': mut("function esPortal(u)        { return ROLES_PORTAL.includes(u.rol); }", "function esPortal(u)        { return false; }"),
  'M2 portal con Editar': mut("function puedeEditar(u)     { return !esPortal(u) && puedeModificar(u); }", "function puedeEditar(u)     { return puedeModificar(u); }"),
  'M3 saveEdit sin chequeo de 0 filas': mut("  if (!data || !data.length) { toast('No tenés permiso para modificar este usuario', 'error'); return; }\n  toast('Usuario actualizado');", "  toast('Usuario actualizado');"),
  'M4 rol siempre en el payload': mut("  if (u && puedeCambiarRol(u) && rolNuevo && rolNuevo !== u.rol) cambios.rol = rolNuevo;", "  cambios.rol = rolNuevo;"),
  'M5 acciones sin filtrar por rol': mut("function puedeModificar(u)  { return esSuperAdmin() || esPropia(u); }", "function puedeModificar(u)  { return true; }"),
  'M6 toggleActivo sin chequeo de 0 filas': mut("  if (!data || !data.length) { toast('No tenés permiso para modificar este usuario', 'error'); return; }\n  toast(`Usuario ${activo ? 'activado' : 'desactivado'}`);", "  toast(`Usuario ${activo ? 'activado' : 'desactivado'}`);"),
  "M7 baja con estado 'inactivo'": mut("estado: activo ? 'activo' : 'suspendido'", "estado: activo ? 'activo' : 'inactivo'"),
  'M8 se ofrece darse de baja a uno mismo': mut("function puedeAltaBaja(u)   { return puedeModificar(u) && !esPropia(u); }", "function puedeAltaBaja(u)   { return puedeModificar(u); }"),
};

let codigo = 0;
try {
  await barrer();
  await alta('sa', 'super_admin'); await alta('sec1', 'secretario_carreras'); await alta('sec2', 'secretario_carreras'); await alta('ope', 'operador');
  await alta('prof1', 'profesional', DOLORES, { entidad_tipo: 'profesional', entidad_id: randomUUID() });
  await alta('prof2', 'profesional', DOLORES, { entidad_tipo: 'profesional', entidad_id: randomUUID() });
  await alta('prop', 'propietario', DOLORES, { entidad_tipo: 'propietario', entidad_id: randomUUID() });
  await alta('otro', 'operador', OTRO);
  const foto = JSON.stringify(await q(admin.from('usuarios').select('*').like('email', `${RUN.toLowerCase()}%`).order('email'), 'foto'));
  const restaurar = async () => { const c = saCli(); for (const f of JSON.parse(foto)) await q(c.from('usuarios').update(f).eq('id', f.id), 'restaurar'); };
  console.log(`fixture: RUN=${RUN} · sandbox · ${Object.keys(U).length} usuarios sintéticos`);

  const res = await suite(HTML);
  for (const r of res) console.log(`${r.c ? '✅' : '❌'} ${r.t}${r.c ? '' : '  ← ' + r.n}`);
  const bien = res.filter(r => r.c).length;
  console.log(`\nSUITE: ${bien}/${res.length}`);
  if (bien !== res.length) codigo = 1;

  if (process.argv.includes('--mutantes')) {
    let muertos = 0;
    for (const [nombre, mk] of Object.entries(MUTANTES)) {
      await restaurar();
      const r = await suite(mk());
      const rojos = r.filter(x => !x.c);
      console.log(`${rojos.length ? '💀 muere' : '🧟 SOBREVIVE'} ${nombre} — ${rojos.length}/${r.length} en rojo: ${rojos.map(x => x.t).join(' | ')}`);
      if (rojos.length) muertos++;
    }
    console.log(`MUTANTES: ${muertos}/${Object.keys(MUTANTES).length} muertos`);
    if (muertos !== Object.keys(MUTANTES).length) codigo = 1;
  }
} catch (e) { console.log(`❌ ERROR: ${e.stack || e.message}`); codigo = 1; }
finally {
  const quedan = await barrer();
  console.log(`${quedan === 0 ? '✅' : '❌'} Z) limpieza: usuarios del probe que quedan = ${quedan}`);
  if (quedan !== 0) codigo = 1;
  process.exit(codigo);
}
