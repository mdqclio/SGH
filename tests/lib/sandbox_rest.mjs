/**
 * tests/lib/sandbox_rest.mjs — cliente supabase-js contra el SANDBOX local (tests/local/up.sh: Postgres + PostgREST + proxy
 * en /rest/v1), para los probes que necesitan crear fixtures (reuniones, carreras, hipódromos…). En prod un probe no crea
 * entidades raíz (CLAUDE.md, gotcha 19).
 *
 *   const SBX = await clienteSandbox();   // { sb, url } si el sandbox responde; { sb: null, motivo } si no
 *
 * URL: SANDBOX_URL (default http://127.0.0.1:54321). Se NIEGA a devolver un cliente que no apunte a localhost.
 * Clave: SANDBOX_KEY, o tests/local/out/jwt, o un JWT de service_role firmado con LOCAL_JWT_SECRET (default: el secreto
 * del sandbox que fija tests/local/up.sh, que sólo sirve para el contenedor local).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const SECRETO_UP_SH = 'sgh-local-jwt-secret-solo-para-el-sandbox-0123456789';

function jwtServiceRole(secreto) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b({ alg: 'HS256', typ: 'JWT' }), p = b({ role: 'service_role', iss: 'sgh-local', exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac('sha256', secreto).update(`${h}.${p}`).digest('base64url')}`;
}

// verificar(sb) → null si el sandbox sirve para el probe, o un texto con el motivo (p. ej. faltan FK para un embed).
export async function clienteSandbox({ verificar } = {}) {
  const url = process.env.SANDBOX_URL || 'http://127.0.0.1:54321';
  let host;
  try { host = new URL(url).hostname; } catch { return { sb: null, motivo: `SANDBOX_URL inválida: ${url}` }; }
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) return { sb: null, motivo: `SANDBOX_URL no es local (${host}): los fixtures no van a prod` };
  const archivo = new URL('../local/out/jwt', import.meta.url);
  const key = process.env.SANDBOX_KEY
    || (existsSync(archivo) ? readFileSync(archivo, 'utf8').trim() : jwtServiceRole(process.env.LOCAL_JWT_SECRET || SECRETO_UP_SH));
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { error } = await sb.from('reuniones').select('id').limit(1);
    if (error) return { sb: null, motivo: `el sandbox respondió con error: ${error.message}` };
  } catch (e) { return { sb: null, motivo: `el sandbox no responde en ${url} (${e.message}); levantarlo con tests/local/up.sh` }; }
  if (verificar) {
    const motivo = await verificar(sb);
    if (motivo) return { sb: null, motivo };
  }
  return { sb, url };
}

// Los embeds del llamado y del encabezado de inscripciones necesitan las FK de tests/local/llamado_sandbox.sql.
export async function verificarEmbedsLlamado(sb) {
  const { error } = await sb.from('reuniones').select('id,hipodromos(nombre),carreras(id,categorias_carrera(nombre))').limit(1);
  return error ? `faltan las FK del llamado en el sandbox (${error.code}): tests/local/up.sh sql < tests/local/llamado_sandbox.sql` : null;
}
