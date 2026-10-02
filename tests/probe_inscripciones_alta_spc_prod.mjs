/**
 * Probe — alta de SPC desde el modal "Inscribir SPC" de la SECRETARÍA, de punta a punta EN PROD.
 * Paso 3 del 02/10 (rama staff de rpc_spc_alta_studbook_portal v2 + studbook-buscar v3 'traer' para staff).
 * Gemelo de probe_portal_alta_spc_prod.mjs, del lado del staff.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_inscripciones_alta_spc_prod.mjs                                   # contra el HTML que sirve sigh.com.ar
 *   INSCRIPCIONES_HTML=inscripciones.html node tests/probe_inscripciones_alta_spc_prod.mjs   # contra el archivo local (antes del merge)
 *
 * Cómo: monta en jsdom el inscripciones.html (sus <script src> se piden a sigh.com.ar; el CDN de supabase-js se corta)
 * y le inyecta como `sb` un cliente supabase-js REAL con la sesión de un operador de prueba de Dolores (magiclink).
 * Se clickean los botones reales; studbook-buscar y la RPC son las de prod. Se verifica con admin lo que quedó.
 *
 * Fixture (ESCRIBE, todo con teardown en el finally y verificado por estado):
 *   reunión 9983 (Dolores, 2099-08-11, publicada) · carrera T1 SIN ventana de inscripción (el staff no la necesita)
 *   · caballeriza PROBE-ALTA-STAFF-CAB-<run> · usuario operador probe-alta-staff-<run>.
 *   S) TROMPETERO (SB 128894, 1987, NO está en el padrón) → "Sin resultados en el padrón" + "Buscar en el Stud Book"
 *      → "Es este — traerlo" → ficha nueva secretaria, NO pendiente, alta_por = operador, motivo edad > 12 informativo
 *      → queda seleccionada en el modal → Guardar → inscripción.
 *   D) segundo 'traer' del mismo caballo → ya_existia (D1), spcs no crece.
 *   R) restore: 0 filas del run, spcs antes = después, ningún TROMPETERO / SB 128894 en el padrón.
 * Correrlo con la secretaría sin actividad: spcs antes = después cuenta todo el padrón.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import jsdom from 'jsdom';
const { JSDOM, VirtualConsole, requestInterceptor } = jsdom;

process.on('unhandledRejection', (e) => {
  if (/supabase is not defined/.test(String(e?.message ?? e))) return;   // initAuth sin CDN, a propósito
  console.error('unhandledRejection:', e); process.exit(3);
});

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const PUB = 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }
const admin = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const RUN = Date.now().toString(36);
const SB_NUEVO = '128894', NOMBRE_NUEVO = 'TROMPETERO';
const SRC = process.env.INSCRIPCIONES_HTML || 'https://sigh.com.ar/inscripciones.html';

const res = [];
const ok = (t, c, n = '') => { res.push({ t, s: c ? '✅' : '❌', n }); return c; };
const fx = { reunion: null, carrera: null, cab: null, authId: null, usuarioId: null, email: null, insc: [], spcNuevo: null };
const die = (ctx, e) => { throw new Error(`[${ctx}] ${e?.message ?? JSON.stringify(e)}`); };
const esperar = async (f, ms = 25000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f(); if (v) return v; await new Promise((r) => setTimeout(r, 300)); } return null; };
const contarSpcs = async () => (await admin.from('spcs').select('id', { count: 'exact', head: true })).count;

const { count: yaHay } = await admin.from('spcs').select('id', { count: 'exact', head: true }).eq('studbook_id', SB_NUEVO);
if (yaHay) { console.error(`SB ${SB_NUEVO} ya está en el padrón (${yaHay}): el probe lo borraría en el teardown. No corro.`); process.exit(2); }

const spcsAntes = await contarSpcs();
try {
  // ── fixture ──
  const { data: hip } = await admin.from('hipodromos').select('id').eq('club_id', CLUB).limit(1).single();
  const { data: cat } = await admin.from('categorias_carrera').select('id').eq('club_id', CLUB).limit(1).single();
  const ins = async (t, fila) => { const { data, error } = await admin.from(t).insert(fila).select('id').single(); if (error) die(`insert ${t}`, error); return data.id; };
  fx.reunion = await ins('reuniones', { club_id: CLUB, hipodromo_id: hip.id, numero: 9983, fecha: '2099-08-11', estado: 'publicada' });
  fx.carrera = await ins('carreras', { reunion_id: fx.reunion, numero_turno: 1, categoria_id: cat.id, distancia_metros: 1000, estado: 'abierta', bolsa_total: 0 });
  fx.cab = await ins('caballerizas', { club_id: CLUB, nombre: `PROBE-ALTA-STAFF-CAB-${RUN}`, hipodromo_patente: 'DOL', activo: true });
  fx.email = `probe-alta-staff-${RUN}` + String.fromCharCode(64) + 'sgh-probe.invalid';
  const { data: au, error: eA } = await admin.auth.admin.createUser({ email: fx.email, password: `Px-${RUN}-${Math.random()}`, email_confirm: true });
  if (eA) die('createUser', eA);
  fx.authId = au.user.id;
  fx.usuarioId = await ins('usuarios', { email: fx.email, nombre_completo: `Probe STAFF ${RUN}`, club_id: CLUB, rol: 'operador', activo: true, estado: 'activo',
    password_hash: '', auth_user_id: fx.authId });
  const { data: link, error: eL } = await admin.auth.admin.generateLink({ type: 'magiclink', email: fx.email });
  if (eL) die('generateLink', eL);
  const sbStaff = createClient(SUPABASE_URL, PUB, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eO } = await sbStaff.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (eO) die('verifyOtp', eO);

  // ── inscripciones.html ──
  const html = SRC.startsWith('http') ? await (await fetch(`${SRC}?v=${RUN}`)).text() : readFileSync(SRC, 'utf8');
  const interceptor = requestInterceptor(async (request) => {
    const u = new URL(request.url);
    if (u.hostname === 'sigh.com.ar') {
      const r = await fetch(`https://sigh.com.ar${u.pathname}?v=${RUN}`);
      return new Response(await r.text(), { headers: { 'Content-Type': 'application/javascript' } });
    }
    return new Response('', { headers: { 'Content-Type': 'application/javascript' } });
  });
  const vc = new VirtualConsole(); const errJs = []; vc.on('jsdomError', (e) => errJs.push(String(e.message || e)));
  const dom = new JSDOM(html, { url: 'https://sigh.com.ar/inscripciones.html', runScripts: 'dangerously', resources: { interceptors: [interceptor] }, virtualConsole: vc, pretendToBeVisual: true });
  await new Promise((r) => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document;
  ok('H) el inscripciones.html tiene el alta desde el Stud Book (traerYUsarStaff / buscarEnStudBookStaff)', html.includes('async function traerYUsarStaff') && html.includes('async function buscarEnStudBookStaff'), SRC);
  w.__sb = sbStaff; w.__toasts = [];
  w.eval(`sb = window.__sb; currentCarreraId = '${fx.carrera}';
    toast = (m, t) => window.__toasts.push([t || 'ok', m]);
    confirm = () => true; recargarInscripciones = async () => {}; avisarJockeyRepetido = () => {};`);
  d.getElementById('f-caballeriza').innerHTML = `<option value="">—</option><option value="${fx.cab}">CAB</option>`;
  w.eval('openModal()');
  d.getElementById('f-caballeriza').value = fx.cab;

  // ── S) nuevo, traído del Stud Book ──
  d.getElementById('spc-search-input').value = NOMBRE_NUEVO;
  w.eval('searchSpc()');
  const optSB = await esperar(() => [...d.querySelectorAll('#spc-dropdown .sb-buscar')][0] || null, 8000);
  const ddTxt = d.getElementById('spc-dropdown').textContent;
  ok('S1) TROMPETERO no está en el padrón → "Sin resultados en el padrón" + "Buscar «TROMPETERO» en el Stud Book"',
    /Sin resultados en el padrón/.test(ddTxt) && !!optSB && /Buscar «TROMPETERO» en el Stud Book/.test(optSB.textContent), ddTxt.trim().slice(0, 200));
  optSB?.click();
  const botones = await esperar(() => { const b = [...d.querySelectorAll('#spc-sb button')]; return b.length ? b : null; });
  const txtSB = d.getElementById('spc-sb').textContent;
  ok('S2) studbook-buscar real (sesión staff) devuelve el candidato SB 128894 con "Es este — traerlo"',
    !!botones && txtSB.includes('SB 128894') && botones[0].textContent.trim() === 'Es este — traerlo', txtSB.trim().slice(0, 300));
  botones?.[0]?.click();
  const ficha = await esperar(async () => (await admin.from('spcs').select('id,nombre,studbook_id,alta_origen,alta_por,revision_pendiente,revision_motivos,estado,notas').eq('studbook_id', SB_NUEVO).maybeSingle()).data);
  if (ficha) fx.spcNuevo = ficha.id;
  ok('S3) ficha nueva: TROMPETERO, alta_origen secretaria, alta_por = operador, NO pendiente, activa',
    ficha?.nombre === 'TROMPETERO' && ficha?.alta_origen === 'secretaria' && ficha?.alta_por === fx.usuarioId && ficha?.revision_pendiente === false && ficha?.estado === 'activo', JSON.stringify(ficha));
  ok('S4) motivo "edad > 12" informativo en revision_motivos y notas "alta desde Inscripciones por Probe STAFF"',
    (ficha?.revision_motivos || []).some((m) => /^edad > 12/.test(m)) && /alta desde Inscripciones por Probe STAFF/.test(ficha?.notas || ''), JSON.stringify([ficha?.revision_motivos, ficha?.notas]));
  await esperar(() => d.getElementById('f-spc-id').value || null, 5000);
  ok('S5) queda seleccionada en el modal (f-spc-id = ficha) y el aviso muestra el motivo',
    !!ficha && d.getElementById('f-spc-id').value === ficha.id && w.__toasts.some(([t, m]) => t === 'warning' && /edad > 12/.test(m)), JSON.stringify(w.__toasts));
  ok('S6) spcs +1 exacto', (await contarSpcs()) === spcsAntes + 1);
  await w.eval('saveRecord()');
  const insc = ficha ? (await admin.from('inscripciones').select('id,estado,caballeriza_id,spc_id').eq('carrera_id', fx.carrera).eq('spc_id', ficha.id).maybeSingle()).data : null;
  if (insc) fx.insc.push(insc.id);
  ok('S7) Guardar inscribe la ficha nueva en el turno, con la caballeriza elegida', insc?.estado === 'inscripto' && insc?.caballeriza_id === fx.cab, JSON.stringify([insc, w.__toasts.at(-1)]));
  const { data: aud } = ficha ? await admin.from('auditoria').select('accion,datos_despues').eq('tabla', 'spcs').eq('registro_id', ficha.id) : { data: [] };
  ok('S8) auditoría del INSERT en spcs con alta_por = operador', (aud || []).some((a) => a.accion === 'INSERT' && a.datos_despues?.alta_por === fx.usuarioId), JSON.stringify(aud));

  // ── D) segundo traer del mismo caballo → D1 ──
  const { data: d1, error: eD1 } = await sbStaff.functions.invoke('studbook-buscar', { body: { accion: 'traer', sb_id: SB_NUEVO, nombre: NOMBRE_NUEVO, carrera_id: fx.carrera } });
  ok('D1) segundo traer: ya_existia, mismo spc_id, spcs no crece', !eD1 && d1?.ya_existia === true && d1?.spc_id === ficha?.id && (await contarSpcs()) === spcsAntes + 1, JSON.stringify([d1, eD1?.message]));
  ok('E) sin errores de JS en la página', errJs.filter((e) => !/supabase is not defined|Not implemented: navigation/.test(e)).length === 0, errJs.join(' | ').slice(0, 300));
} finally {
  // ── teardown por estado ── (inscripciones → carrera/reunión → ficha nueva → auditoría → usuario → resto)
  for (const id of fx.insc) await admin.from('inscripciones').delete().eq('id', id);
  if (fx.carrera) await admin.from('inscripciones').delete().eq('carrera_id', fx.carrera);
  if (fx.carrera) await admin.from('carreras').delete().eq('id', fx.carrera);
  if (fx.reunion) await admin.from('reuniones').delete().eq('id', fx.reunion);
  const { data: tromp } = await admin.from('spcs').select('id').eq('studbook_id', SB_NUEVO);
  for (const t of tromp || []) await admin.from('spcs').delete().eq('id', t.id);
  const regs = [...fx.insc, fx.carrera, fx.reunion, fx.cab, fx.spcNuevo, ...(tromp || []).map((t) => t.id)].filter(Boolean);
  if (regs.length) await admin.from('auditoria').delete().in('registro_id', regs);
  if (fx.usuarioId) { await admin.from('auditoria').delete().eq('usuario_id', fx.usuarioId); await admin.from('usuarios').delete().eq('id', fx.usuarioId); }
  if (fx.authId) await admin.auth.admin.deleteUser(fx.authId).catch(() => {});
  if (fx.cab) await admin.from('caballerizas').delete().eq('id', fx.cab);

  const cuenta = async (q) => (await q).count || 0;
  const ids = regs.length ? regs : ['00000000-0000-0000-0000-000000000000'];
  const restos = {
    reuniones_9983: await cuenta(admin.from('reuniones').select('id', { count: 'exact', head: true }).eq('club_id', CLUB).eq('numero', 9983)),
    inscripciones: fx.carrera ? await cuenta(admin.from('inscripciones').select('id', { count: 'exact', head: true }).eq('carrera_id', fx.carrera)) : 0,
    trompetero: await cuenta(admin.from('spcs').select('id', { count: 'exact', head: true }).eq('studbook_id', SB_NUEVO)),
    usuarios: await cuenta(admin.from('usuarios').select('id', { count: 'exact', head: true }).eq('email', fx.email || '-')),
    caballerizas: await cuenta(admin.from('caballerizas').select('id', { count: 'exact', head: true }).eq('nombre', `PROBE-ALTA-STAFF-CAB-${RUN}`)),
    auditoria_del_run: await cuenta(admin.from('auditoria').select('id', { count: 'exact', head: true }).in('registro_id', ids)),
  };
  const { data: au } = await admin.auth.admin.listUsers({ perPage: 1000 });
  restos.auth = (au?.users || []).filter((u) => u.email === fx.email).length;
  const spcsDespues = await contarSpcs();
  ok('R1) restore: 0 filas del run (reunión, inscripciones, TROMPETERO, usuario, auth, caballeriza, auditoría)', Object.values(restos).every((n) => n === 0), JSON.stringify(restos));
  ok('R2) spcs antes = después (ninguna alta real)', spcsAntes === spcsDespues, `${spcsAntes} → ${spcsDespues}`);
}
for (const x of res) console.log(`${x.s} ${x.t}${x.n ? '  → ' + x.n : ''}`);
const fails = res.filter((x) => x.s === '❌').length;
console.log(`\n${res.length - fails}/${res.length} asserts OK`);
process.exit(fails ? 1 : 0);
