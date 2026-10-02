/**
 * Probe — alta de SPC desde el portal, de punta a punta EN PROD, con el portal.html que SIRVE sigh.com.ar.
 * Paso 3 de la aplicación del 02/10: una inscripción NORMAL (caballo que ya está en el padrón) y una NUEVA
 * (caballo traído del Stud Book), las dos sobre un FIXTURE propio con teardown — nada en R10 ni en reuniones reales.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_portal_alta_spc_prod.mjs
 *   PORTAL_HTML=portal.html node tests/probe_portal_alta_spc_prod.mjs   # contra el archivo local
 *
 * Cómo: monta en jsdom el portal.html servido (sus <script src> se piden a sigh.com.ar; el CDN de supabase-js se
 * corta) y le inyecta como `sb` un cliente supabase-js REAL con la sesión de un usuario de portal de prueba
 * (magiclink). Se llaman las funciones reales y se clickean los botones reales; la función studbook-buscar y las
 * RPC son las de prod. Se verifica con admin (service key) lo que quedó en la base.
 *
 * Fixture (ESCRIBE, todo con teardown en el finally y verificado por estado):
 *   reunión 9984 (Dolores, 2099-08-10, publicada) · carrera T1 con inscripción abierta · entrenador y caballeriza
 *   PROBE-ALTA-<run> · usuario de portal probe-alta-<run> (profesional con entidad).
 *   N) NORMAL: BIEN COQUETA (8fa89a02…, SB 429819, ya en el padrón) → Anotar → rpc_inscribir.
 *   T) NUEVA: TROMPETERO (SB 128894, 1987, único en el Stud Book, NO está en el padrón) → "Buscar en el Stud Book"
 *      → "Es este — anotarlo" → ficha nueva pendiente de revisión (motivo edad > 12) + inscripción.
 *      La ficha de TROMPETERO es FIXTURE: se borra en el teardown. Ninguna alta queda en spcs.
 *   R) restore: 0 filas del run, spcs antes = después, ningún TROMPETERO / SB 128894 en el padrón.
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
const SPC_NORMAL = '8fa89a02-3882-4858-a3f1-22861fd59b96';   // BIEN COQUETA, SB 429819
const SB_NUEVO = '128894', NOMBRE_NUEVO = 'TROMPETERO';
const PORTAL_SRC = process.env.PORTAL_HTML || 'https://sigh.com.ar/portal.html';

const res = [];
const ok = (t, c, n = '') => { res.push({ t, s: c ? '✅' : '❌', n }); return c; };
const fx = { reunion: null, carrera: null, prof: null, cab: null, authId: null, usuarioId: null, email: null, insc: [], spcNuevo: null };
const die = (ctx, e) => { throw new Error(`[${ctx}] ${e?.message ?? JSON.stringify(e)}`); };
const esperar = async (f, ms = 25000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f(); if (v) return v; await new Promise((r) => setTimeout(r, 300)); } return null; };
const contarSpcs = async () => (await admin.from('spcs').select('id', { count: 'exact', head: true })).count;

const spcsAntes = await contarSpcs();
try {
  // ── fixture ──
  const { data: hip } = await admin.from('hipodromos').select('id').eq('club_id', CLUB).limit(1).single();
  const { data: cat } = await admin.from('categorias_carrera').select('id').eq('club_id', CLUB).limit(1).single();
  const ins = async (t, fila) => { const { data, error } = await admin.from(t).insert(fila).select('id').single(); if (error) die(`insert ${t}`, error); return data.id; };
  fx.reunion = await ins('reuniones', { club_id: CLUB, hipodromo_id: hip.id, numero: 9984, fecha: '2099-08-10', estado: 'publicada' });
  fx.carrera = await ins('carreras', { reunion_id: fx.reunion, numero_turno: 1, categoria_id: cat.id, distancia_metros: 1000, estado: 'abierta', bolsa_total: 0,
    apertura_inscripcion: new Date(Date.now() - 86400e3).toISOString(), cierre_inscripcion: new Date(Date.now() + 86400e3).toISOString() });
  fx.prof = await ins('profesionales', { club_id: CLUB, tipo: 'entrenador', nombre: `PROBE-ALTA-E`, apellido: RUN, hipodromo_patente: 'DOL', activo: true });
  fx.cab = await ins('caballerizas', { club_id: CLUB, nombre: `PROBE-ALTA-CAB-${RUN}`, hipodromo_patente: 'DOL', activo: true });
  fx.email = `probe-alta-${RUN}@sgh-probe.invalid`;
  const { data: au, error: eA } = await admin.auth.admin.createUser({ email: fx.email, password: `Px-${RUN}-${Math.random()}`, email_confirm: true });
  if (eA) die('createUser', eA);
  fx.authId = au.user.id;
  fx.usuarioId = await ins('usuarios', { email: fx.email, nombre_completo: `Probe ALTA ${RUN}`, club_id: CLUB, rol: 'profesional', activo: true, estado: 'activo',
    password_hash: '', auth_user_id: fx.authId, entidad_tipo: 'profesional', entidad_id: fx.prof });
  const { data: link, error: eL } = await admin.auth.admin.generateLink({ type: 'magiclink', email: fx.email });
  if (eL) die('generateLink', eL);
  const sbPortal = createClient(SUPABASE_URL, PUB, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eO } = await sbPortal.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (eO) die('verifyOtp', eO);

  // ── portal.html servido ──
  const html = PORTAL_SRC.startsWith('http') ? await (await fetch(`${PORTAL_SRC}?v=${RUN}`)).text() : readFileSync(PORTAL_SRC, 'utf8');
  const interceptor = requestInterceptor(async (request) => {
    const u = new URL(request.url);
    if (u.hostname === 'sigh.com.ar') {
      const r = await fetch(`https://sigh.com.ar${u.pathname}?v=${RUN}`);
      return new Response(await r.text(), { headers: { 'Content-Type': 'application/javascript' } });
    }
    return new Response('', { headers: { 'Content-Type': 'application/javascript' } });
  });
  const vc = new VirtualConsole(); const errJs = []; vc.on('jsdomError', (e) => errJs.push(String(e.message || e)));
  const dom = new JSDOM(html, { url: 'https://sigh.com.ar/portal.html', runScripts: 'dangerously', resources: { interceptors: [interceptor] }, virtualConsole: vc, pretendToBeVisual: true });
  await new Promise((r) => dom.window.addEventListener('load', r));
  const w = dom.window, d = w.document;
  ok('H) el portal.html servido tiene el flujo nuevo (traerYAnotar / botonStudBookPortal)', html.includes('async function traerYAnotar') && html.includes('function botonStudBookPortal'), PORTAL_SRC);
  w.__sb = sbPortal;
  w.eval(`sb = window.__sb;
    carreraSeleccionada = { id: '${fx.carrera}', reunionId: '${fx.reunion}' };
    turnosAbiertos = [{ id: '${fx.reunion}', carreras: [{ id: '${fx.carrera}', numero_turno: 1 }] }];
    misCaballos = []; misInscripciones = []; padronSpcs = null;
    loadLlamado = async () => {}; avisoJockeyRepetidoPortal = () => {};`);
  d.getElementById('minsc-caballeriza').innerHTML = `<option value="">—</option><option value="${fx.cab}">CAB</option>`;
  d.getElementById('minsc-caballeriza').value = fx.cab;
  d.getElementById('minsc-entrenador').innerHTML = `<option value="">—</option><option value="${fx.prof}">ENT</option>`;
  d.getElementById('minsc-entrenador').value = fx.prof;
  await w.eval('cargarPadronSpcs()');

  const inscDe = async (spcId) => (await admin.from('inscripciones').select('id,canal,inscripto_por,estado,caballeriza_id,entrenador_id').eq('carrera_id', fx.carrera).eq('spc_id', spcId).maybeSingle()).data;

  // ── N) NORMAL: caballo del padrón ──
  d.getElementById('minsc-buscar').value = 'BIEN COQUETA';
  w.eval(`onBuscarSpc('BIEN COQUETA')`);
  const botN = [...d.querySelectorAll('#minsc-lista button')].find((b) => (b.getAttribute('onclick') || '').includes(SPC_NORMAL));
  ok('N1) BIEN COQUETA aparece en el buscador del padrón con "Anotar"', !!botN && botN.textContent.trim() === 'Anotar', d.getElementById('minsc-lista').textContent.trim().slice(0, 200));
  botN?.click();
  const iN = await esperar(() => inscDe(SPC_NORMAL));
  if (iN) fx.insc.push(iN.id);
  ok('N2) inscripción normal en prod: canal portal, inscripto_por = usuario, caballeriza/entrenador declarados',
    iN?.canal === 'portal' && iN?.inscripto_por === fx.usuarioId && iN?.estado === 'inscripto' && iN?.caballeriza_id === fx.cab && iN?.entrenador_id === fx.prof, JSON.stringify(iN));
  const { data: spcN } = await admin.from('spcs').select('alta_origen,revision_pendiente').eq('id', SPC_NORMAL).single();
  ok('N3) la ficha del padrón no se tocó (secretaria, sin revisión)', spcN?.alta_origen === 'secretaria' && spcN?.revision_pendiente === false, JSON.stringify(spcN));

  // ── T) NUEVA: traída del Stud Book ──
  const antesT = await contarSpcs();
  d.getElementById('minsc-buscar').value = NOMBRE_NUEVO;
  w.eval(`onBuscarSpc('${NOMBRE_NUEVO}')`);
  const botSB = [...d.querySelectorAll('#minsc-lista button')].find((b) => /Stud Book/.test(b.textContent));
  ok('T1) TROMPETERO no está en el padrón → botón "Buscar «TROMPETERO» en el Stud Book"', !!botSB && /Buscar «TROMPETERO» en el Stud Book/.test(botSB.textContent), d.getElementById('minsc-lista').textContent.trim().slice(0, 200));
  botSB?.click();
  const botones = await esperar(() => { const b = [...d.querySelectorAll('#minsc-sb button')]; return b.length ? b : null; });
  const txtSB = d.getElementById('minsc-sb').textContent;
  ok('T2) la función real devuelve el candidato (SB 128894) con "Es este — anotarlo"', !!botones && txtSB.includes('SB 128894') && botones[0].textContent.trim() === 'Es este — anotarlo', txtSB.trim().slice(0, 300));
  botones?.[0]?.click();
  const fichaNueva = await esperar(async () => (await admin.from('spcs').select('id,nombre,studbook_id,alta_origen,alta_por,revision_pendiente,revision_motivos,estado,club_id,entrenador_id,notas').eq('studbook_id', SB_NUEVO).maybeSingle()).data);
  if (fichaNueva) fx.spcNuevo = fichaNueva.id;
  ok('T3) ficha nueva: TROMPETERO, portal, alta_por = usuario, pendiente, activo, club/entrenador NULL',
    fichaNueva?.nombre === 'TROMPETERO' && fichaNueva?.alta_origen === 'portal' && fichaNueva?.alta_por === fx.usuarioId && fichaNueva?.revision_pendiente === true
    && fichaNueva?.estado === 'activo' && fichaNueva?.club_id === null && fichaNueva?.entrenador_id === null, JSON.stringify(fichaNueva));
  ok('T4) motivo "edad > 12" en revision_motivos (no en notas) y notas con "alta desde el portal por Probe ALTA"',
    (fichaNueva?.revision_motivos || []).some((m) => /^edad > 12 \(\d+ años según el Stud Book\)$/.test(m)) && !/edad > 12/.test(fichaNueva?.notas || '')
    && /alta desde el portal por Probe ALTA/.test(fichaNueva?.notas || ''), JSON.stringify([fichaNueva?.revision_motivos, fichaNueva?.notas]));
  const iT = fichaNueva ? await esperar(() => inscDe(fichaNueva.id)) : null;
  if (iT) fx.insc.push(iT.id);
  ok('T5) inscripción de la nueva de corrido: canal portal, inscripto_por = usuario', iT?.canal === 'portal' && iT?.inscripto_por === fx.usuarioId && iT?.estado === 'inscripto', JSON.stringify(iT));
  ok('T6) spcs +1 exacto durante la prueba', (await contarSpcs()) === antesT + 1);
  const { data: audT } = fichaNueva ? await admin.from('auditoria').select('accion,datos_despues').eq('tabla', 'spcs').eq('registro_id', fichaNueva.id) : { data: [] };
  ok('T7) auditoría del INSERT en spcs con alta_por', (audT || []).some((a) => a.accion === 'INSERT' && a.datos_despues?.alta_por === fx.usuarioId), JSON.stringify(audT));
  ok('E) sin errores de JS en la página', errJs.filter((e) => !/supabase is not defined|Not implemented: navigation/.test(e)).length === 0, errJs.join(' | ').slice(0, 300));
} finally {
  // ── teardown por estado ── (inscripciones → carrera/reunión → ficha nueva → auditoría → usuario → resto)
  for (const id of fx.insc) await admin.from('inscripciones').delete().eq('id', id);
  if (fx.carrera) await admin.from('inscripciones').delete().eq('carrera_id', fx.carrera);
  if (fx.carrera) await admin.from('carreras').delete().eq('id', fx.carrera);
  if (fx.reunion) await admin.from('reuniones').delete().eq('id', fx.reunion);
  const { data: tromp } = await admin.from('spcs').select('id').eq('studbook_id', SB_NUEVO);
  for (const t of tromp || []) await admin.from('spcs').delete().eq('id', t.id);
  const regs = [...fx.insc, fx.carrera, fx.reunion, fx.prof, fx.cab, fx.spcNuevo, ...(tromp || []).map((t) => t.id)].filter(Boolean);
  if (regs.length) await admin.from('auditoria').delete().in('registro_id', regs);
  if (fx.usuarioId) { await admin.from('auditoria').delete().eq('usuario_id', fx.usuarioId); await admin.from('usuarios').delete().eq('id', fx.usuarioId); }
  if (fx.authId) await admin.auth.admin.deleteUser(fx.authId).catch(() => {});
  if (fx.prof) await admin.from('profesionales').delete().eq('id', fx.prof);
  if (fx.cab) await admin.from('caballerizas').delete().eq('id', fx.cab);

  const cuenta = async (q) => (await q).count || 0;
  const restos = {
    reuniones_9984: await cuenta(admin.from('reuniones').select('id', { count: 'exact', head: true }).eq('club_id', CLUB).eq('numero', 9984)),
    inscripciones: fx.carrera ? await cuenta(admin.from('inscripciones').select('id', { count: 'exact', head: true }).eq('carrera_id', fx.carrera)) : 0,
    trompetero: await cuenta(admin.from('spcs').select('id', { count: 'exact', head: true }).eq('studbook_id', SB_NUEVO)),
    usuarios: await cuenta(admin.from('usuarios').select('id', { count: 'exact', head: true }).eq('email', fx.email || '-')),
    profesionales: await cuenta(admin.from('profesionales').select('id', { count: 'exact', head: true }).eq('nombre', 'PROBE-ALTA-E').eq('apellido', RUN)),
    caballerizas: await cuenta(admin.from('caballerizas').select('id', { count: 'exact', head: true }).eq('nombre', `PROBE-ALTA-CAB-${RUN}`)),
    auditoria_del_run: await cuenta(admin.from('auditoria').select('id', { count: 'exact', head: true }).in('registro_id', [fx.carrera, fx.reunion, fx.prof, fx.cab, fx.spcNuevo, ...fx.insc].filter(Boolean).length ? [fx.carrera, fx.reunion, fx.prof, fx.cab, fx.spcNuevo, ...fx.insc].filter(Boolean) : ['00000000-0000-0000-0000-000000000000'])),
  };
  const { data: au } = await admin.auth.admin.listUsers({ perPage: 1000 });
  restos.auth = (au?.users || []).filter((u) => u.email === fx.email).length;
  const spcsDespues = await contarSpcs();
  ok('R1) restore: 0 filas del run (reunión, inscripciones, TROMPETERO, usuario, auth, profesional, caballeriza, auditoría)', Object.values(restos).every((n) => n === 0), JSON.stringify(restos));
  ok('R2) spcs antes = después (ninguna alta real)', spcsAntes === spcsDespues, `${spcsAntes} → ${spcsDespues}`);
}
for (const x of res) console.log(`${x.s} ${x.t}${x.n ? '  → ' + x.n : ''}`);
const fails = res.filter((x) => x.s === '❌').length;
console.log(`\n${res.length - fails}/${res.length} asserts OK`);
process.exit(fails ? 1 : 0);
