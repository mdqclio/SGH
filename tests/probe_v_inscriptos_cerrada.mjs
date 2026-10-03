/**
 * probe_v_inscriptos_cerrada.mjs — ISSUE-098: v_inscriptos_carrera cerrada para anon.
 *
 * Del 27/08 al 02/10 la vista corrió con los permisos de su dueño (sin security_invoker) y
 * anon —sin login, con la publishable key pública— leía todas las inscripciones con nombres.
 * La causa fue un CREATE OR REPLACE VIEW sin WITH (security_invoker = true), que le borró la
 * opción (GOTCHA #102). Migración: migrations/cerrar_v_inscriptos_carrera.sql.
 *
 *   C1  anon → v_inscriptos_carrera: rechazado (42501), 0 filas.
 *   C2  service_role → v_inscriptos_carrera: la vista sigue viva (> 0 filas).
 *   C3  anon → las otras 3 vistas: rechazado (42501). Hasta el 03/10 era "0 filas" (RLS); desde revoke_anon_tablas_publicas.sql
 *       anon no tiene privilegios en ellas.
 *   C4  lint de migrations/*.sql: toda CREATE [OR REPLACE] VIEW lleva security_invoker
 *       (salvo el bloque histórico marcado HISTÓRICO-SIN-INVOKER, aplicado así el 27/08).
 *
 * SÓLO LECTURA (GET por la API + lectura de archivos). Sin browser.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_v_inscriptos_cerrada.mjs [--mutantes]
 *
 * --mutantes: alimenta los chequeos con respuestas y textos que TIENEN que caer
 * (vista abierta, vista muerta, CREATE OR REPLACE VIEW sin la opción, marcador quitado).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_REST = 'https://unlhcuanfrtpatoipwve.supabase.co/rest/v1';
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!SECRET) { console.error('Falta SUPABASE_SECRET_KEY (.env)'); process.exit(2); }
const PUBLISHABLE = (readFileSync(join(RAIZ, 'supabase.js'), 'utf8').match(/sb_publishable_[A-Za-z0-9_-]+/) || [])[0];
if (!PUBLISHABLE) { console.error('No encontré la publishable key en supabase.js'); process.exit(2); }

const OTRAS_VISTAS = ['v_programa_reunion', 'v_sanciones_vigentes', 'v_spcs_activos'];

async function get(vista, key, { conBearer }) {
  const headers = { apikey: key, Prefer: 'count=exact' };
  if (conBearer) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${URL_REST}/${vista}?select=*&limit=1`, { headers });
  let body = null;
  try { body = await res.json(); } catch (_) { /* sin body */ }
  const total = Number((res.headers.get('content-range') || '').split('/')[1]);
  return { status: res.status, body, total: Number.isFinite(total) ? total : null };
}

// ── Chequeos puros (los mismos que usan los mutantes) ─────────────────────────
function chequeoAnonRechazado(r) {
  const filas = Array.isArray(r.body) ? r.body.length : 0;
  const rechazado = (r.status === 401 || r.status === 403) && r.body?.code === '42501';
  return { ok: rechazado && filas === 0, det: `status=${r.status} code=${r.body?.code ?? '-'} filas=${filas}` };
}
function chequeoViva(r) {
  return { ok: r.status >= 200 && r.status < 300 && (r.total ?? 0) > 0, det: `status=${r.status} total=${r.total}` };
}
function chequeoCeroFilas(r) {
  const filas = Array.isArray(r.body) ? r.body.length : -1;
  return { ok: r.status >= 200 && r.status < 300 && filas === 0 && (r.total ?? 0) === 0, det: `status=${r.status} filas=${filas} total=${r.total}` };
}
// Devuelve las CREATE [OR REPLACE] VIEW sin security_invoker (y sin el marcador histórico
// en las 8 líneas de arriba). Las que están dentro de un comentario de bloque también cuentan:
// un rollback comentado se descomenta y se corre tal cual.
function lintVistas(nombre, texto) {
  const lineas = texto.split('\n');
  const malas = [];
  lineas.forEach((l, i) => {
    if (!/^\s*CREATE\s+(OR\s+REPLACE\s+)?VIEW\b/i.test(l)) return;
    // encabezado del CREATE hasta el AS que abre la consulta
    let cab = '';
    for (let j = i; j < Math.min(i + 6, lineas.length); j++) { cab += ' ' + lineas[j]; if (/\bAS\s*$/i.test(lineas[j]) || /\bAS\b\s*(SELECT|\()/i.test(lineas[j])) break; }
    if (/security_invoker\s*=\s*(true|on)/i.test(cab)) return;
    const previas = lineas.slice(Math.max(0, i - 8), i).join('\n');
    if (/HISTÓRICO-SIN-INVOKER/.test(previas)) return;
    malas.push(`${nombre}:${i + 1}`);
  });
  return malas;
}
function lintMigraciones(archivos) {
  const malas = archivos.flatMap(([n, t]) => lintVistas(n, t));
  return { ok: malas.length === 0, det: malas.length ? `sin security_invoker: ${malas.join(', ')}` : `${archivos.length} archivos` };
}

let fallas = 0, total = 0;
function assert(id, desc, { ok, det }) {
  total++; if (!ok) fallas++;
  console.log(`${ok ? '✅' : '❌'} ${id} ${desc} — ${det}`);
}

const migraciones = readdirSync(join(RAIZ, 'migrations')).filter(f => f.endsWith('.sql')).sort()
  .map(f => [`migrations/${f}`, readFileSync(join(RAIZ, 'migrations', f), 'utf8')]);

if (process.argv.includes('--mutantes')) {
  const filasFalsas = [{ inscripcion_id: 'x', propietario_nombre: 'X' }];
  const fnEdad = migraciones.find(([n]) => n.endsWith('fn_edad_reglamentaria.sql'));
  const mutantes = [
    ['MU1 vista abierta (200 con filas, como antes del 02/10)', () => chequeoAnonRechazado({ status: 206, body: filasFalsas, total: 425 })],
    ['MU2 anon con 0 filas pero sin rechazo (invoker sin REVOKE)', () => chequeoAnonRechazado({ status: 200, body: [], total: 0 })],
    ['MU3 vista muerta para service_role', () => chequeoViva({ status: 404, body: { code: '42P01' }, total: null })],
    ['MU4 otra vista abierta a anon', () => chequeoAnonRechazado({ status: 200, body: filasFalsas, total: 3 })],
    ['MU5 migración nueva con CREATE OR REPLACE VIEW sin la opción', () => lintMigraciones([...migraciones,
      ['migrations/zz_mutante.sql', 'CREATE OR REPLACE VIEW public.v_inscriptos_carrera AS\n SELECT 1;']])],
    ['MU6 se quita el marcador del bloque histórico', () => lintMigraciones(migraciones.map(([n, t]) =>
      [n, n === fnEdad?.[0] ? t.replaceAll('HISTÓRICO-SIN-INVOKER', 'HISTORICO') : t]))],
    ['MU7 rollback de fn_edad sin WITH', () => lintMigraciones(migraciones.map(([n, t]) =>
      [n, n === fnEdad?.[0] ? t.replace('v_inscriptos_carrera WITH (security_invoker = true) AS', 'v_inscriptos_carrera AS') : t]))],
  ];
  let muertos = 0;
  for (const [nombre, fn] of mutantes) {
    const r = fn();
    const muere = !r.ok;
    if (muere) muertos++;
    console.log(`${muere ? '💀' : '🧟'} ${nombre} — ${r.det}`);
  }
  console.log(`\nMutantes: ${muertos}/${mutantes.length} muertos`);
  process.exit(muertos === mutantes.length ? 0 : 1);
}

// C1 — anon (publishable key sola, que es lo que manda supabase-js sin sesión)
assert('C1', 'anon NO lee v_inscriptos_carrera', chequeoAnonRechazado(await get('v_inscriptos_carrera', PUBLISHABLE, { conBearer: false })));
// C2 — service_role
assert('C2', 'service_role: la vista sigue viva', chequeoViva(await get('v_inscriptos_carrera', SECRET, { conBearer: true })));
// C3 — otras vistas
// desde el 03/10 (revoke_anon_tablas_publicas.sql) anon no tiene privilegios en ninguna vista: rechazado, no sólo 0 filas
for (const v of OTRAS_VISTAS) assert('C3', `anon → ${v}: rechazado (42501)`, chequeoAnonRechazado(await get(v, PUBLISHABLE, { conBearer: false })));
// C4 — lint
assert('C4', 'toda CREATE [OR REPLACE] VIEW de migrations/ lleva security_invoker', lintMigraciones(migraciones));

console.log(`\n${total - fallas}/${total} OK`);
process.exit(fallas ? 1 : 0);
