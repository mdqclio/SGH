/**
 * probe_caballeriza_provisorio.mjs — alta de caballeriza sin titular → propietario provisorio.
 *
 * EL PEDIDO (Yesi 16/09, criterio Fede 15/08/2026)
 * ---------------------------------------------------------------------------
 * caballerizas.html exigía apellido+nombre+DNI del propietario para guardar (desde
 * d5b441a, 11/05). Yesi no podía crear una caballeriza sin titular, y tampoco EDITAR
 * 95/295 (43 sin titular + 52 con titular provisorio sin DNI). Diagnóstico y plan:
 * docs/diagnosticos/2026-09-16_alta-caballeriza-exige-titular.md y
 * 2026-09-16_plan-caballeriza-titular-opcional-provisorio.md (reports).
 *
 * LO QUE ESTE PROBE FIJA
 * ---------------------------------------------------------------------------
 *  UI (caballerizas.html, extraída y corrida con stubs de DOM y de sb):
 *   · titular OPCIONAL, todo-o-nada (vacío ok; parcial error; completo ok);
 *   · edición sin tocar el bloque de responsables → NO se escribe en
 *     caballeriza_responsables (ni delete ni insert) — el riesgo §5.2;
 *   · edición con el bloque cambiado → camino de siempre (delete + insert);
 *   · alta/edición con titular vacío → rpc_caballeriza_provisorio (A);
 *   · esProvisorio() reconoce las marcas 'provisorio …' y no las 'ex provisorio …'.
 *  RPC (rpc_caballeriza_provisorio, con sesiones reales — parte A):
 *   · crea propietario provisorio + vínculo sin DNI + re-deriva inscripciones;
 *   · idempotente; reusa provisorio homónimo; falla ante homónimo REAL;
 *   · staff-only y por club.
 *
 * PATRÓN: código real sin browser (tests/README.md). Fixture propio, teardown por
 * estado en el finally. NO toca ninguna caballeriza real.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_caballeriza_provisorio.mjs
 *   node tests/probe_caballeriza_provisorio.mjs --mutantes
 *   CABALLERIZAS_HTML=https://sigh.com.ar/caballerizas.html node tests/probe_caballeriza_provisorio.mjs
 *
 * Los mutantes de SQL van sobre una gemela (rpc_caballeriza_provisorio_mut) creada por
 * execute_sql (NUNCA apply_migration — GOTCHAS "gemela que revive"); el probe hijo la
 * llama por env RPC_PROV.
 */

process.env.TZ = 'America/Argentina/Buenos_Aires';

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const SPCS_BASELINE = 210;

const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }
const admin = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = process.env.CABALLERIZAS_HTML || join(HERE, '..', 'caballerizas.html');
const HTML = HTML_PATH.startsWith('http')
  ? await (await fetch(`${HTML_PATH}${HTML_PATH.includes('?') ? '&' : '?'}v=${Date.now()}`, { cache: 'no-store' })).text()
  : readFileSync(HTML_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const RPC_PROV = process.env.RPC_PROV || 'rpc_caballeriza_provisorio';
// La parte A (RPC) se corre sólo si la función existe en la base: así el commit B
// (form solo) también tiene su probe verde.
const SOLO_UI = process.argv.includes('--solo-ui');

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

const RUN = Math.random().toString(36).slice(2, 8);
const PASS = `Probe-${RUN}-${Math.random().toString(36).slice(2, 10)}!`;
const mail = (q) => `probe-cab-${q}-${RUN}@sgh-probe.invalid`;
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
async function crearUsuario(q, rol, club, entidadId = null) {
  const email = mail(q);
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  if (error) die(`createUser ${q}`, error);
  fx.authIds.push(data.user.id);
  const { data: uRow, error: e2 } = await admin.from('usuarios').insert({
    email, nombre_completo: `Probe CAB ${q} ${RUN}`, club_id: club, rol,
    activo: true, estado: 'activo', password_hash: '', auth_user_id: data.user.id,
    entidad_tipo: entidadId ? 'profesional' : null, entidad_id: entidadId,
  }).select('id').single();
  if (e2) die(`insert usuarios ${q}`, e2);
  fx.usuarios.push(email);
  return { email, usuarioId: uRow.id };
}

// ── extracción de caballerizas.html ─────────────────────────────────────────
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
const PIEZAS_UI = [
  'function formatDNI(num) {', 'function parseDNI(str) {', 'function esProvisorio(resp) {',
  'function getResponsableData() {', 'function propietarioVacio(rows) {', 'function validateResponsables(rows) {',
  'function buildResponsableText(rows) {', 'async function resolveAndInsertResponsables(rows, cabId) {',
  'async function saveRecord(e) {',
];

// Stub de supabase-js: cualquier cadena from().x().y() es awaitable y queda registrada.
function sbStub(ctx) {
  const calls = [];
  const builder = (tabla) => {
    const chain = [];
    const b = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          const resp = ctx.respuesta?.(tabla, chain) ?? { data: null, error: null };
          calls.push({ tabla, chain: chain.map(c => c.m + (c.a.length ? `(${c.a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(',')})` : '()')) });
          return (res) => res(resp);
        }
        return (...a) => { chain.push({ m: prop, a }); return b; };
      },
    });
    return b;
  };
  return {
    calls,
    sb: { from: (t) => builder(t), rpc: async (n, p) => { calls.push({ tabla: `rpc:${n}`, chain: [JSON.stringify(p)] }); return ctx.rpcResp ?? { data: { ok: true }, error: null }; } },
  };
}

// Corre saveRecord extraído con DOM + sb + toast de mentira. `valores`: por id de input.
async function correrSave(ctx) {
  const piezas = PIEZAS_UI.map(a => bloque(HTML, a)).join('\n\n');
  const { calls, sb } = sbStub(ctx);
  const r = await new AsyncFunction('ctx', 'sb', 'calls', `
    const CLUB_ID = '${CLUB}';
    let responsablesAlCargar = ctx.snapshot ?? null;
    const els = {};
    const el = (id) => els[id] ||= { value: ctx.valores[id] ?? '', textContent: '', hidden: true, disabled: false, style: {}, files: [], dataset: {}, innerHTML: '' };
    const document = { getElementById: el, querySelectorAll: () => [] };
    const toasts = []; function toast(m, t = 'success') { toasts.push({ m, t }); }
    let cerrado = 0, recargas = 0; function closeModal() { cerrado++; } function load() { recargas++; }
    function confirm() { return true; }
    async function uploadChaquetilla() { throw new Error('no debería subir nada'); }
    ${piezas}
    await saveRecord({ preventDefault() {} });
    return { toasts, cerrado, recargas, validate: validateResponsables, vacio: propietarioVacio, esProv: esProvisorio, rows: getResponsableData() };
  `)(ctx, sb, calls);
  return { ...r, calls };
}
const vals = (o) => ({ 'f-id': '', 'f-nombre': `PROBE-CAB-${RUN}`, 'f-telefono': '', 'f-estado': 'activo', 'f-estado-original': 'activo', 'f-notas': '',
  'f-hipodromo-patente': 'DOL', 'f-chaq-desc': '', 'rp-apellido': '', 'rp-nombre': '', 'rp-dni': '', 'rp-fnac': '', 'rp-localidad': '', ...o });
const toca = (calls, tabla, metodo) => calls.filter(c => c.tabla === tabla && c.chain.some(s => s.startsWith(metodo)));

// ═════════════════════════════ MUTATION TESTING ═════════════════════════════
const SQL_PATH = join(HERE, '..', 'migrations', 'rpc_caballeriza_provisorio.sql');
const SQL_BASE = existsSync(SQL_PATH) ? (() => { const r = readFileSync(SQL_PATH, 'utf8'); return r.slice(r.indexOf('CREATE OR REPLACE FUNCTION')); })() : '';

const MUTANTES = [
  { id: 'M1', tipo: 'sql', desc: 'cae fn_is_staff (el portal puede crear provisorios)', mata: ['A6'],
    from: `  IF NOT fn_is_staff() THEN`, to: `  IF false THEN` },
  { id: 'M2', tipo: 'sql', desc: 'cae el guard de club (staff de otro hipódromo)', mata: ['A7'],
    from: `  IF NOT fn_is_super_admin() AND v_cab.club_id IS DISTINCT FROM fn_get_user_club_id() THEN`, to: `  IF false THEN` },
  { id: 'M3', tipo: 'sql', desc: 'cae el no-op "ya tiene titular" (segundo vínculo)', mata: ['A2'],
    from: `  IF FOUND THEN\n    RETURN jsonb_build_object('ok', true, 'creado', false, 'motivo', 'ya tiene titular',`,
    to:   `  IF false THEN\n    RETURN jsonb_build_object('ok', true, 'creado', false, 'motivo', 'ya tiene titular',` },
  { id: 'M4', tipo: 'sql', desc: 'cae el corte por homónimo REAL', mata: ['A5'],
    from: `       AND (p.notas IS NULL OR p.notas NOT ILIKE 'provisorio%')\n  ) THEN\n    RAISE EXCEPTION 'Ya existe un propietario`,
    to:   `       AND false\n  ) THEN\n    RAISE EXCEPTION 'Ya existe un propietario` },
  { id: 'M5', tipo: 'sql', desc: 'no reusa el provisorio homónimo (crea otro)', mata: ['A4'],
    from: `     AND p.notas ILIKE 'provisorio%' AND p.activo\n   ORDER BY p.created_at, p.id LIMIT 1;`,
    to:   `     AND false\n   ORDER BY p.created_at, p.id LIMIT 1;` },
  { id: 'M6', tipo: 'sql', desc: 'el vínculo lleva DNI → el trigger crea OTRO propietario', mata: ['A1'],
    from: `  VALUES (p_caballeriza_id, v_prop, 'propietario', true, v_cab.nombre, 'DNI')`,
    to:   `  VALUES (p_caballeriza_id, v_prop, 'propietario', true, v_cab.nombre, 'DNI', '99999999')` },
  { id: 'M7', tipo: 'sql', desc: 'cae la re-derivación de inscripciones', mata: ['A3'],
    from: `  UPDATE inscripciones SET propietario_id = v_prop\n   WHERE caballeriza_id = p_caballeriza_id AND propietario_id IS NULL;`,
    to:   `  UPDATE inscripciones SET propietario_id = v_prop\n   WHERE false;` },
  { id: 'M8', tipo: 'sql', desc: 're-deriva TAMBIÉN las que ya tenían propietario', mata: ['A3'],
    from: `   WHERE caballeriza_id = p_caballeriza_id AND propietario_id IS NULL;`,
    to:   `   WHERE caballeriza_id = p_caballeriza_id;` },
  { id: 'M9', tipo: 'sql', desc: 'la marca no empieza con "provisorio" (esProvisorio no lo reconoce)', mata: ['A1'],
    from: `  v_marca := 'provisorio alta ' ||`, to: `  v_marca := 'alta provisoria ' ||` },
  // M10 (FOR UPDATE quitado): concurrencia, no cubierto por un probe secuencial.

  { id: 'P1', tipo: 'html', desc: 'validateResponsables vuelve a exigir DNI siempre', mata: ['U1'],
    from: `  if (!propietarioVacio(rows) && (!prop.apellido || !prop.nombre || !prop.documento_nro)) {`,
    to:   `  if (!prop.apellido || !prop.nombre || !prop.documento_nro) {` },
  { id: 'P2', tipo: 'html', desc: 'validación parcial se acepta (apellido sin DNI pasa)', mata: ['U1'],
    from: `  if (!propietarioVacio(rows) && (!prop.apellido || !prop.nombre || !prop.documento_nro)) {`,
    to:   `  if (false) {` },
  { id: 'P3', tipo: 'html', desc: 'la edición borra/reinserta responsables aunque no cambiaron', mata: ['U3'],
    from: `  const responsablesSinCambios = !!id && JSON.stringify(rows) === responsablesAlCargar;`,
    to:   `  const responsablesSinCambios = false;` },
  { id: 'P4', tipo: 'html', desc: 'la edición nunca escribe responsables (ni cuando cambiaron)', mata: ['U4'],
    from: `  const responsablesSinCambios = !!id && JSON.stringify(rows) === responsablesAlCargar;`,
    to:   `  const responsablesSinCambios = !!id;` },
  { id: 'P5', tipo: 'html', desc: 'titular vacío no llama al RPC (queda huérfana)', mata: ['U2', 'U5'],
    from: `  if (propietarioVacio(rows)) {\n    // Sin titular conocido`, to: `  if (false) {\n    // Sin titular conocido` },
  { id: 'P6', tipo: 'html', desc: 'esProvisorio toma "ex provisorio … completado" como provisorio', mata: ['U6'],
    from: `  if (typeof notas === 'string') return /^provisorio/i.test(notas.trim());`,
    to:   `  if (typeof notas === 'string') return /provisorio/i.test(notas);` },
];

const argMut = process.argv.find(a => a === '--mutantes' || a.startsWith('--mutantes='));
if (argMut) {
  const pedidos = argMut.includes('=') ? argMut.split('=')[1].split(',').map(s => s.trim()).filter(Boolean) : null;
  const tanda = pedidos ? MUTANTES.filter(m => pedidos.includes(m.id)) : MUTANTES;
  const SELF = fileURLToPath(import.meta.url);
  const dir = mkdtempSync(join(tmpdir(), 'mut-cabprov-'));
  try { symlinkSync(join(HERE, '..', 'node_modules'), join(dir, 'node_modules'), 'dir'); } catch (e) { console.warn(`[runner] symlink node_modules: ${e.message}`); }
  const GEMELA = 'rpc_caballeriza_provisorio_mut';
  const sqlPendientes = [];
  console.log(`\n═══ MUTATION TESTING · ${tanda.length}/${MUTANTES.length} mutantes ═══\n(copias en ${dir} — el repo y la función real no se tocan)\n`);
  let vivos = 0, arnes = 0;
  for (const m of tanda) {
    const src = m.tipo === 'sql' ? SQL_BASE : HTML;
    if (!src.includes(m.from)) { console.log(`⚠ ${m.id} ERROR DE ARNÉS — el ancla no existe en el fuente. ${m.desc}`); arnes++; continue; }
    if (m.tipo === 'sql') {
      const p = join(dir, `${m.id}.sql`);
      writeFileSync(p, SQL_BASE.replace(m.from, m.to).replaceAll('public.rpc_caballeriza_provisorio(', `public.${GEMELA}(`));
      sqlPendientes.push({ id: m.id, desc: m.desc, mata: m.mata, path: p, from: m.from, to: m.to });
      continue;
    }
    const env = { ...process.env, CABALLERIZAS_HTML: join(dir, `${m.id}.html`) };
    writeFileSync(env.CABALLERIZAS_HTML, HTML.replace(m.from, m.to));
    let out = '';
    try { out = execFileSync(process.execPath, [SELF, '--solo-ui'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    if (!/^\d+\/\d+ OK$/m.test(out)) {
      const causa = (out.split('\n').find(l => /Error|error:/.test(l)) || '(sin línea de error)').trim();
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — no llegó a los asserts. ${m.desc}\n     ↳ ${causa.slice(0, 200)}`); arnes++; continue;
    }
    const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));
    const vivo = muertos.length === 0; if (vivo) vivos++;
    console.log(`${vivo ? '❌' : '✅'} ${m.id} ${vivo ? 'SOBREVIVE' : 'muere'} — ${m.desc}  [esperaba matar ${m.mata.join(',')}${muertos.length ? `; murieron ${muertos.join(',')}` : ''}]`);
  }
  const auto = tanda.length - sqlPendientes.length;
  console.log(`\n${vivos === 0 && arnes === 0 ? '✅ TANDA LIMPIA' : '❌ TANDA CON HALLAZGOS'} — ${auto} automáticos · ${auto - vivos - arnes} muertos${vivos ? ` · ${vivos} SOBREVIVEN` : ''}${arnes ? ` · ${arnes} ERROR DE ARNÉS` : ''}`);
  if (sqlPendientes.length) {
    console.log(`\n── ${sqlPendientes.length} mutantes de SQL: gemela ${GEMELA} por execute_sql (NO apply_migration), correr con RPC_PROV=${GEMELA}, DROP al final ──`);
    sqlPendientes.forEach(m => console.log(`  ${m.id}  mata ${m.mata.join(',')}  — ${m.desc}\n       ${m.path}`));
  }
  process.exit(vivos === 0 && arnes === 0 ? 0 : 1);
}

// ══════════════════════════════ CORRIDA NORMAL ══════════════════════════════
(async () => {
  const { count: spcsAntes } = await admin.from('spcs').select('id', { count: 'exact', head: true });
  const DNI_REAL = `77${RUN.replace(/\D/g, '').padEnd(6, '1')}`.slice(0, 8);
  try {
    // ── U) LA UI (siempre) ──────────────────────────────────────────────────
    console.log('\n── La UI (caballerizas.html extraída) ──');
    const v0 = await correrSave({ valores: vals({}), snapshot: null, respuesta: (t) => t === 'caballerizas' ? { data: { id: 'CAB-NUEVA' }, error: null } : { data: null, error: null } });
    const V = v0.validate, vacio = v0.vacio, esProv = v0.esProv;
    // misma forma que getResponsableData(): así el snapshot compara bien
    const fila = (o) => [{ rol: 'propietario', apellido: '', nombre: '', documento_nro: '', fecha_nacimiento: null, localidad: null, ...o }];
    // El commit B (form solo) no llama al RPC: la caballeriza nace sin titular. El commit A sí.
    const TIENE_RPC = HTML.includes("sb.rpc('rpc_caballeriza_provisorio'");
    ok('U1) validateResponsables: vacío OK · parcial (sólo apellido / sin DNI) ERROR · completo OK · co-prop parcial ERROR',
       V(fila({})) === null
       && /completá apellido, nombre y DNI/.test(V(fila({ apellido: 'PEREZ' })) || '')
       && /completá apellido, nombre y DNI/.test(V(fila({ apellido: 'PEREZ', nombre: 'JUAN' })) || '')
       && V(fila({ apellido: 'PEREZ', nombre: 'JUAN', documento_nro: '12345678' })) === null
       && /Co-propietario 1/.test(V([...fila({}), { rol: 'copropietario', apellido: 'X', nombre: '', documento_nro: '' }]) || '')
       && vacio(fila({})) === true && vacio(fila({ nombre: 'A' })) === false,
       `vacio=${V(fila({}))} parcial=${V(fila({ apellido: 'PEREZ' }))}`);

    // U2 · ALTA con titular vacío → insert caballeriza + RPC; sin insert en responsables
    const u2 = await correrSave({ valores: vals({}), snapshot: JSON.stringify(fila({})), respuesta: (t) => t === 'caballerizas' ? { data: { id: 'CAB-NUEVA' }, error: null } : { data: null, error: null } });
    const u2rpc = u2.calls.filter(c => c.tabla === `rpc:rpc_caballeriza_provisorio`);
    ok(TIENE_RPC
         ? 'U2) ALTA con titular vacío → inserta la caballeriza, NO inserta responsables y llama a rpc_caballeriza_provisorio con el id nuevo; toast dice "provisorio"'
         : 'U2) [commit B] ALTA con titular vacío → inserta la caballeriza sin responsables, sin error, sin RPC (nace sin titular)',
       toca(u2.calls, 'caballerizas', 'insert').length === 1 && toca(u2.calls, 'caballeriza_responsables', 'insert').length === 0
       && (TIENE_RPC ? (u2rpc.length === 1 && /CAB-NUEVA/.test(u2rpc[0].chain[0]) && u2.toasts.some(t => /provisorio/.test(t.m) && t.t === 'success'))
                     : (u2rpc.length === 0 && u2.toasts.some(t => t.m === 'Caballeriza creada') && !u2.toasts.some(t => t.t === 'error')))
       && u2.cerrado === 1 && u2.recargas === 1,
       `rpc=${u2rpc.length} toasts=${JSON.stringify(u2.toasts.map(t => t.m.slice(0, 50)))}`);

    // U3 · EDICIÓN sin tocar responsables (snapshot igual) → cero escrituras en responsables, ni validación
    const prellenadoProv = fila({ nombre: 'MI STUD' });   // así prellena openModal un provisorio: nombre, sin apellido, sin DNI
    const u3 = await correrSave({ valores: vals({ 'f-id': 'CAB-1', 'rp-nombre': 'MI STUD', 'f-telefono': '2245-1' }), snapshot: JSON.stringify(prellenadoProv) });
    ok('U3) EDICIÓN sin tocar el bloque (titular provisorio prellenado: nombre sin DNI) → guarda la caballeriza, NO toca caballeriza_responsables, NO valida, NO llama al RPC',
       toca(u3.calls, 'caballerizas', 'update').length >= 1 && u3.calls.filter(c => c.tabla === 'caballeriza_responsables').length === 0
       && u3.calls.filter(c => c.tabla.startsWith('rpc:')).length === 0 && u3.toasts.some(t => t.m === 'Caballeriza actualizada') && !u3.toasts.some(t => t.t === 'error'),
       `calls=${JSON.stringify(u3.calls.map(c => c.tabla + ':' + c.chain[0]))} toasts=${JSON.stringify(u3.toasts.map(t => t.m.slice(0, 40)))}`);

    // U4 · EDICIÓN con el bloque cambiado y completo → delete + insert (camino de siempre)
    const u4 = await correrSave({ valores: vals({ 'f-id': 'CAB-1', 'rp-apellido': 'PEREZ', 'rp-nombre': 'JUAN', 'rp-dni': '12345678' }), snapshot: JSON.stringify(fila({})),
      respuesta: (t, ch) => t === 'profesionales' ? { data: null, error: null } : { data: null, error: null } });
    ok('U4) EDICIÓN con titular nuevo completo → delete + insert en caballeriza_responsables (camino actual), sin RPC',
       toca(u4.calls, 'caballeriza_responsables', 'delete').length === 1 && toca(u4.calls, 'caballeriza_responsables', 'insert').length === 1
       && u4.calls.filter(c => c.tabla.startsWith('rpc:')).length === 0 && u4.toasts.some(t => t.m === 'Caballeriza actualizada'),
       `calls=${JSON.stringify(u4.calls.map(c => c.tabla + ':' + c.chain[0]))}`);

    // U5 · EDICIÓN: tenía titular real, lo vacían → delete + RPC (queda con provisorio, no huérfana)
    const u5 = await correrSave({ valores: vals({ 'f-id': 'CAB-1' }), snapshot: JSON.stringify(fila({ apellido: 'PEREZ', nombre: 'JUAN', documento_nro: '12345678' })) });
    ok(TIENE_RPC ? 'U5) EDICIÓN vaciando el titular → delete de responsables + rpc_caballeriza_provisorio (no queda huérfana)'
                 : 'U5) [commit B] EDICIÓN vaciando el titular → delete de responsables, sin insert, sin RPC',
       toca(u5.calls, 'caballeriza_responsables', 'delete').length === 1 && toca(u5.calls, 'caballeriza_responsables', 'insert').length === 0
       && u5.calls.filter(c => c.tabla === 'rpc:rpc_caballeriza_provisorio').length === (TIENE_RPC ? 1 : 0),
       `calls=${JSON.stringify(u5.calls.map(c => c.tabla + ':' + c.chain[0]))}`);

    // U5b · el RPC falla → toast error que dice que quedó sin propietario, pero la caballeriza se guardó
    if (TIENE_RPC) {
      const u5b = await correrSave({ valores: vals({}), snapshot: JSON.stringify(fila({})), rpcResp: { data: null, error: { message: 'P0001: Ya existe un propietario "X" en este hipódromo.' } },
        respuesta: (t) => t === 'caballerizas' ? { data: { id: 'CAB-NUEVA' }, error: null } : { data: null, error: null } });
      ok('U5b) si el RPC falla, el toast lo dice ("quedó SIN propietario: …") y la caballeriza ya está creada',
         u5b.toasts.some(t => t.t === 'error' && /SIN propietario/.test(t.m) && /Ya existe un propietario/.test(t.m)) && toca(u5b.calls, 'caballerizas', 'insert').length === 1,
         JSON.stringify(u5b.toasts.map(t => t.m.slice(0, 80))));
    }

    ok('U6) esProvisorio: marcas "provisorio R8 15/08" / "provisorio R9 11/09" / "provisorio alta 16/09/2026" → true; "ex provisorio … completado" → false; sin propietario embebido: sin DNI y sin apellido → true, con DNI → false',
       esProv({ propietarios: { notas: 'provisorio R8 15/08' } }) && esProv({ propietarios: { notas: 'provisorio R9 11/09' } }) && esProv({ propietarios: { notas: 'provisorio alta 16/09/2026' } })
       && !esProv({ propietarios: { notas: 'ex provisorio R8 15/08 — completado 11/09/2026 con el titular' } })
       && esProv({ documento_nro: null, apellido: null, nombre: 'X' }) && !esProv({ documento_nro: '123', apellido: 'A' }));

    ok('U7) el HTML: sólo f-nombre es required; el propietario ya no lleva asterisco; hay hint de provisorio y aviso rp-provisorio-aviso',
       (HTML.match(/\brequired\b/g) || []).length === 1 && /id="f-nombre" required/.test(HTML)
       && !/Propietario \*/.test(HTML) && !/placeholder="DNI \*"/.test(HTML) && /id="rp-provisorio-aviso"/.test(HTML) && /propietario provisorio/.test(HTML));

    ok('U8) openModal pide propietarios(notas) al cargar responsables y toma el snapshot responsablesAlCargar',
       /select\('\*, propietarios\(notas\)'\)/.test(HTML) && /responsablesAlCargar = JSON\.stringify\(getResponsableData\(\)\)/.test(HTML));

    // ── A) EL RPC (sólo si existe y no es --solo-ui) ─────────────────────────
    const { data: fnExiste } = await admin.rpc('rpc_caballeriza_provisorio', { p_caballeriza_id: '00000000-0000-0000-0000-000000000000' }).then(r => ({ data: !(r.error && /Could not find the function/.test(r.error.message)) }));
    if (SOLO_UI || !fnExiste) {
      console.log(`\n── El RPC: ${SOLO_UI ? '--solo-ui' : 'rpc_caballeriza_provisorio NO existe en la base'} → asserts A salteados ──`);
    } else {
      console.log('\n── El RPC (sesiones reales) ──');
      const { data: otroClub } = await admin.from('clubs').select('id').neq('id', CLUB).limit(1).single();
      const uStaff = await crearUsuario('staff', 'secretario_carreras', CLUB);
      const profP  = await ins('profesionales', { club_id: CLUB, tipo: 'entrenador', nombre: 'PROBE-CAB-P', apellido: RUN, hipodromo_patente: 'DOL', activo: true }, 'profesionales');
      const uPort  = await crearUsuario('portal', 'profesional', CLUB, profP);
      const uOtro  = otroClub ? await crearUsuario('otro', 'secretario_carreras', otroClub.id) : null;
      const sbS = await clientePortal(uStaff.email), sbP = await clientePortal(uPort.email), sbO = uOtro ? await clientePortal(uOtro.email) : null;

      const cab = async (n) => ins('caballerizas', { club_id: CLUB, nombre: n, hipodromo_patente: 'DOL', activo: true }, 'caballerizas');
      const nombreA = `PROBE-CAB-A-${RUN}`;
      const cA  = await cab(nombreA);
      const cA2 = await cab(nombreA);                      // homónima → debe reusar el provisorio de cA
      const nombreR = `PROBE-CAB-REAL-${RUN}`;
      const cR  = await cab(nombreR);
      const propReal = await ins('propietarios', { club_id: CLUB, tipo: 'persona', nombre: nombreR, documento_tipo: 'DNI', documento_nro: DNI_REAL, activo: true, estado: 'activo' }, 'propietarios');

      // inscripciones de probe en cA: 2 sin propietario + 1 con propietario real
      const { data: hip } = await admin.from('hipodromos').select('id').eq('club_id', CLUB).limit(1).single();
      const { data: cat } = await admin.from('categorias_carrera').select('id').eq('club_id', CLUB).limit(1).single();
      const reun = await ins('reuniones', { club_id: CLUB, hipodromo_id: hip.id, numero: 9985, fecha: '2099-07-19', estado: 'borrador' }, 'reuniones');
      const carr = await ins('carreras', { reunion_id: reun, numero_turno: 1, categoria_id: cat.id, distancia_metros: 1000, estado: 'abierta', bolsa_total: 1000000 }, 'carreras');
      const spc = async (n) => ins('spcs', { nombre: `PROBE-CAB-${n}-${RUN}`, fecha_nacimiento: '2020-01-01', sexo: 'macho', estado: 'activo' }, 'spcs');
      const i1 = await ins('inscripciones', { carrera_id: carr, spc_id: await spc('1'), estado: 'inscripto', canal: 'manual', caballeriza_id: cA, entrenador_id: profP }, 'inscripciones');
      const i2 = await ins('inscripciones', { carrera_id: carr, spc_id: await spc('2'), estado: 'ratificado', canal: 'manual', caballeriza_id: cA, entrenador_id: profP, numero_partidor: 3 }, 'inscripciones');
      const i3 = await ins('inscripciones', { carrera_id: carr, spc_id: await spc('3'), estado: 'inscripto', canal: 'manual', caballeriza_id: cA, entrenador_id: profP }, 'inscripciones');
      // i3 con propietario "real" (no derivado): el RPC no debe tocarla
      await admin.from('inscripciones').update({ propietario_id: propReal }).eq('id', i3);
      const leerI = async (id) => (await admin.from('inscripciones').select('propietario_id,estado,numero_partidor,caballeriza_id').eq('id', id).single()).data;
      const pre = { i1: await leerI(i1), i2: await leerI(i2), i3: await leerI(i3) };
      ok('F0) fixture: cA con 2 inscripciones sin propietario (la caballeriza no tiene titular → el trigger dejó NULL) y 1 con propietario real',
         pre.i1.propietario_id === null && pre.i2.propietario_id === null && pre.i3.propietario_id === propReal, JSON.stringify(pre));

      const rpc = async (sb, id) => { const { data, error } = await sb.rpc(RPC_PROV, { p_caballeriza_id: id }); return { ok: !error, data, msg: error?.message ?? null }; };
      const titular = async (cabId) => (await admin.from('caballeriza_responsables').select('id,propietario_id,documento_nro,apellido,nombre,rol,activo,propietarios(nombre,notas,documento_nro,tipo,activo)').eq('caballeriza_id', cabId).eq('rol', 'propietario')).data || [];

      // A1
      const r1 = await rpc(sbS, cA);
      const t1 = await titular(cA);
      if (r1.data?.propietario_id) fx.propietarios.push(r1.data.propietario_id);
      const { data: cabA } = await admin.from('caballerizas').select('responsable,nombre,club_id,activo').eq('id', cA).single();
      ok('A1) staff crea el provisorio: ok, creado=true; 1 vínculo rol propietario activo SIN DNI apuntando a un propietarios tipo persona, nombre = caballeriza, sin documento, notas "provisorio alta DD/MM/YYYY", activo; responsable legado seteado',
         r1.ok && r1.data?.creado === true && t1.length === 1 && t1[0].activo && t1[0].documento_nro === null && t1[0].propietario_id === r1.data.propietario_id
         && t1[0].propietarios?.nombre === nombreA && t1[0].propietarios?.documento_nro === null && t1[0].propietarios?.tipo === 'persona' && t1[0].propietarios?.activo
         && /^provisorio alta \d{2}\/\d{2}\/\d{4}$/.test(t1[0].propietarios?.notas || '') && /provisorio/.test(cabA?.responsable || ''),
         `ok=${r1.ok} msg=${r1.msg} data=${JSON.stringify(r1.data)} titular=${JSON.stringify(t1)} responsable=${cabA?.responsable}`);

      // A3 · re-derivación
      const post = { i1: await leerI(i1), i2: await leerI(i2), i3: await leerI(i3) };
      ok('A3) re-deriva las 2 inscripciones sin propietario al provisorio (inscripciones_rederivadas=2); la que tenía propietario real queda intacta; estado/partidor intactos',
         r1.data?.inscripciones_rederivadas === 2 && post.i1.propietario_id === r1.data.propietario_id && post.i2.propietario_id === r1.data.propietario_id
         && post.i3.propietario_id === propReal && post.i2.estado === 'ratificado' && post.i2.numero_partidor === 3, JSON.stringify(post));

      // A2 · idempotencia
      const r2 = await rpc(sbS, cA);
      const t2 = await titular(cA);
      const { count: nProvA } = await admin.from('propietarios').select('id', { count: 'exact', head: true }).eq('club_id', CLUB).eq('nombre', nombreA);
      ok('A2) segunda llamada: creado=false, motivo "ya tiene titular"; sigue habiendo 1 vínculo y 1 propietario con ese nombre',
         r2.ok && r2.data?.creado === false && /ya tiene titular/.test(r2.data?.motivo || '') && t2.length === 1 && nProvA === 1, `data=${JSON.stringify(r2.data)} vinculos=${t2.length} props=${nProvA}`);

      // A4 · homónima reusa el provisorio
      const r4 = await rpc(sbS, cA2);
      const t4 = await titular(cA2);
      const { count: nProvA4 } = await admin.from('propietarios').select('id', { count: 'exact', head: true }).eq('club_id', CLUB).eq('nombre', nombreA);
      ok('A4) caballeriza homónima sin titular: reusa el mismo provisorio (creado=false, mismo propietario_id), vínculo nuevo; sigue habiendo 1 propietario con ese nombre',
         r4.ok && r4.data?.creado === false && r4.data?.propietario_id === r1.data?.propietario_id && t4.length === 1 && t4[0].propietario_id === r1.data?.propietario_id && nProvA4 === 1,
         `data=${JSON.stringify(r4.data)} props=${nProvA4}`);

      // A5 · homónimo REAL → error, nada creado
      const r5 = await rpc(sbS, cR);
      const t5 = await titular(cR);
      const { count: nProvR } = await admin.from('propietarios').select('id', { count: 'exact', head: true }).eq('club_id', CLUB).eq('nombre', nombreR);
      ok('A5) existe un propietario REAL con el nombre de la caballeriza → error "Ya existe un propietario"; sin vínculo, sin provisorio nuevo',
         !r5.ok && /Ya existe un propietario/.test(r5.msg || '') && t5.length === 0 && nProvR === 1, `msg=${r5.msg} vinculos=${t5.length} props=${nProvR}`);

      // A6 · portal
      const cP = await cab(`PROBE-CAB-PORTAL-${RUN}`);
      const r6 = await rpc(sbP, cP);
      ok('A6) sesión de PORTAL → "No autorizado"; sin vínculo', !r6.ok && /No autorizado/.test(r6.msg || '') && (await titular(cP)).length === 0, `msg=${r6.msg}`);

      // A7 · staff de otro club
      if (sbO) {
        const r7 = await rpc(sbO, cP);
        ok('A7) staff de OTRO club → "otro hipódromo"; sin vínculo', !r7.ok && /otro hipódromo/.test(r7.msg || '') && (await titular(cP)).length === 0, `msg=${r7.msg}`);
      } else ok('A7) (sin otro club en la base — no evaluable)', true);

      // A8 · inexistente
      const r8 = await rpc(sbS, '00000000-0000-0000-0000-000000000000');
      ok('A8) caballeriza inexistente → "no existe"', !r8.ok && /no existe/.test(r8.msg || ''), `msg=${r8.msg}`);

      // A9 · la cadena cierra: nueva inscripción en cA nace con el provisorio
      const i9 = await ins('inscripciones', { carrera_id: carr, spc_id: await spc('9'), estado: 'inscripto', canal: 'manual', caballeriza_id: cA, entrenador_id: profP }, 'inscripciones');
      const f9 = await leerI(i9);
      ok('A9) después del RPC, una inscripción nueva en esa caballeriza nace con propietario_id = provisorio (trg_insc_set_propietario)', f9.propietario_id === r1.data?.propietario_id, JSON.stringify(f9));

      // A0 · nada más cambió
      const { data: cabA2 } = await admin.from('caballerizas').select('nombre,club_id,activo').eq('id', cA).single();
      const { data: pReal } = await admin.from('propietarios').select('nombre,documento_nro,notas').eq('id', propReal).single();
      ok('A0) caballeriza (nombre/club/activo) y el propietario REAL de probe no cambiaron', cabA2.nombre === nombreA && cabA2.club_id === CLUB && cabA2.activo && pReal.documento_nro === DNI_REAL && pReal.notas === null, JSON.stringify({ cabA2, pReal }));
    }
  } finally {
    const idsAud = [...fx.inscripciones, ...fx.propietarios, ...fx.caballerizas, ...fx.profesionales, ...fx.carreras, ...fx.reuniones, ...fx.spcs];
    if (idsAud.length) await admin.from('auditoria').delete().in('registro_id', idsAud);
    for (const id of fx.inscripciones) await admin.from('inscripciones').delete().eq('id', id);
    for (const id of fx.carreras)      await admin.from('carreras').delete().eq('id', id);
    for (const id of fx.reuniones)     await admin.from('reuniones').delete().eq('id', id);
    for (const id of fx.spcs)          await admin.from('spcs').delete().eq('id', id);
    for (const id of fx.caballerizas)  await admin.from('caballeriza_responsables').delete().eq('caballeriza_id', id);
    // provisorios creados por el RPC (nombre PROBE-CAB-…) y el real de probe
    await admin.from('propietarios').delete().eq('club_id', CLUB).like('nombre', `PROBE-CAB-%-${RUN}`);
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
      caballerizas: await cnt('caballerizas', 'nombre', `PROBE-CAB-%-${RUN}`),
      propietarios: await cnt('propietarios', 'nombre', `PROBE-CAB-%-${RUN}`),
      responsables: await cnt('caballeriza_responsables', 'nombre', `PROBE-CAB-%-${RUN}`),
      spcs: await cnt('spcs', 'nombre', `PROBE-CAB-%-${RUN}`),
      usuarios: await cnt('usuarios', 'email', `probe-cab-%-${RUN}@%`),
      profesionales: (await admin.from('profesionales').select('id', { count: 'exact', head: true }).like('nombre', 'PROBE-CAB-%').eq('apellido', RUN)).count || 0,
      reuniones: (await admin.from('reuniones').select('id', { count: 'exact', head: true }).eq('club_id', CLUB).eq('numero', 9985)).count || 0,
    };
    const { count: spcsDespues } = await admin.from('spcs').select('id', { count: 'exact', head: true });
    ok('R1) restore: cero filas del run en caballerizas/propietarios/responsables/spcs/usuarios/profesionales/reuniones 9985; spcs antes = después',
       Object.values(restos).every(n => n === 0) && spcsAntes === spcsDespues, `${JSON.stringify(restos)} spcs ${spcsAntes}→${spcsDespues}`);
    ok(`R2) count(*) FROM spcs = ${SPCS_BASELINE} (baseline CLAUDE.md)`, spcsDespues === SPCS_BASELINE, `spcs=${spcsDespues}`);
  }

  console.log('\n── Probe · caballeriza sin titular → provisorio ──');
  console.log(`   html=${HTML_PATH}  ·  rpc=${RPC_PROV}  ·  run=${RUN}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
