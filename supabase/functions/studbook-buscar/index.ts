// ============================================================
// studbook-buscar — consulta al Stud Book Argentino para el alta de SPC desde spcs.html
// ============================================================
//
// FUENTE DE DATOS (2026-09): el buscador PÚBLICO del sitio del Stud Book, o sea el endpoint
// interno que usa su propia página de ejemplares:
//
//     GET https://www.studbook.org.ar/ejemplares/autocomplete?tipo=1&muerto=1&term=<nombre>
//     header obligatorio: X-Requested-With: XMLHttpRequest   (sin él responde 404 con HTML)
//
// NO ES UNA API ACORDADA con el Stud Book. Es scraping del mismo endpoint que usa
// tools/studbook_scrape_tanda.mjs desde el VPS. Sin token, sin allowlist de IP, sin rate limit
// documentado (~1 s por consulta, verificado 2026-09-11). Puede cambiar o cerrarse sin aviso: si
// eso pasa, esta función devuelve 502 `studbook_no_disponible` y la pantalla dice "cargalo a mano".
//
// CUANDO EXISTA LA API DE DIEGO (Stud Book Argentino, ISSUE-030): se reemplaza SÓLO lo que está
// entre los marcadores  «FUENTE — INICIO / FIN»  de abajo (`autocomplete()` y `aCandidato()`).
// El contrato hacia spcs.html — `{ ok, term, exactos, parciales, fuente }` — NO cambia, y
// spcs.html no se toca. Poner el nombre de la fuente nueva en `FUENTE`.
//   ⚠ Si esa API exige allowlist de IP: una Edge Function NO puede salir con IP fija
//   (docs/diagnosticos/2026-09-10_ips-fijas-consulta-studbook.md §3.1) y la consulta tiene que
//   pasar por un proxy con IP propia (el VPS). En ese caso esta función llama al proxy.
//
// ESTA FUNCIÓN NO ESCRIBE EN LA BASE y NO GUARDA SECRETOS. Devuelve candidatos; el INSERT lo hace
// spcs.html con el cliente del usuario (RLS, auditoría, índice único spcs_studbook_id_uniq) después
// de pasar por rpc_spcs_duplicados. Los HOMÓNIMOS NO SE DESAMBIGUAN ACÁ: se devuelven todos con
// fecha, sexo, pelaje y padres, y elige la persona en la pantalla
// (docs/diagnosticos/2026-09-11_plan-studbook-buscar-edge-function.md §4).
//
// Auth: verify_jwt=true en el deploy + getUser(jwt) server-side + fn_is_staff() por RPC con el JWT
// del caller (portal → 403). Patrón copiado de invite-user.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://unlhcuanfrtpatoipwve.supabase.co';
// Publishable key: pública, va hardcodeada en los HTML del sitio. Acá sólo para validar el JWT del caller.
const PUBLISHABLE_KEY = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const ALLOWED_ORIGINS = (Deno.env.get('STUDBOOK_BUSCAR_ALLOWED_ORIGINS') ?? 'https://sigh.com.ar')
  .split(',').map((s) => s.trim()).filter(Boolean);

const FUENTE = 'studbook.org.ar/ejemplares/autocomplete (scraping del buscador público, no API)';
const TERM_MIN = 3, TERM_MAX = 60;

// ------------------------------------------------------------------
// Helpers HTTP (patrón invite-user)
// ------------------------------------------------------------------
function corsHeaders(origin: string | null): Record<string, string> {
  const permitido = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
function json(obj: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}
function fail(status: number, error: string, detalle: string, origin: string | null): Response {
  return json({ ok: false, error, detalle }, status, origin);
}

// ------------------------------------------------------------------
// Normalización — idéntica a tools/studbook_scrape_tanda.mjs y a rpc_spcs_duplicados:
// NFD sin diacríticos, mayúsculas, sólo [A-Z0-9]. Así "BELLA DOÑA" = "BELLADONA" = "bella dona".
// ------------------------------------------------------------------
export function norm(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export interface Candidato {
  sb_id: string;
  nombre: string;
  fecha_nacimiento: string | null;   // ISO yyyy-mm-dd
  sexo: 'macho' | 'hembra' | 'castrado' | null;
  sexo_sb: string | null;
  color: string | null;
  padrillo_nombre: string | null;
  madre_nombre: string | null;
  abuelo_materno: string | null;
  pais_origen: string | null;        // 'Argentina' si la bandera es /10.png; si no, null
  url_perfil: string;
  leyenda: string | null;            // ej. "(2021 H SP)"
  tomo: number | null;
  folio: number | null;
  raza: number | null;               // 4 = SPC
  alertas: string[];
}

// ==================================================================
// «FUENTE — INICIO»  Todo lo que depende de DÓNDE se consulta está acá.
// Para pasar a la API de Diego: reescribir autocomplete() y aCandidato(), nada más.
// ==================================================================
const SB_URL = 'https://www.studbook.org.ar/ejemplares/autocomplete';
const SEXO: Record<string, Candidato['sexo']> = { Macho: 'macho', Hembra: 'hembra', Castrado: 'castrado' };

// Copia de tools/studbook_scrape_tanda.mjs:26-40. Devuelve el array crudo de hits del Stud Book.
// Lanza si el Stud Book no responde 200 con JSON (el 404-HTML de "sin X-Requested-With" cae acá).
async function autocomplete(term: string): Promise<any[]> {
  const url = `${SB_URL}?tipo=1&muerto=1&term=${encodeURIComponent(term)}`;
  const res = await fetch(url, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Referer': 'https://www.studbook.org.ar/ejemplares',
      'User-Agent': 'Mozilla/5.0',
    },
  });
  if (!res.ok) throw new Error(`studbook HTTP ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('json')) throw new Error(`studbook content-type ${ct || 'vacío'} (esperaba JSON)`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('studbook: la respuesta no es un array');
  return data;
}

// dd/mm/yyyy → yyyy-mm-dd (copia de toISO del scraper, tolerante a vacío)
function toISO(ddmmyyyy: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(ddmmyyyy ?? '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Copia del armado de "alta" del scraper (:80-99), con las mismas 3 alertas.
export function aCandidato(h: any): Candidato {
  const alertas: string[] = [];
  const sexo = SEXO[h?.sexo] ?? null;
  if (!sexo) alertas.push(`sexo desconocido: ${h?.sexo ?? 'null'}`);
  if (h?.raza !== 4) alertas.push(`raza != 4 (SPC): ${h?.raza ?? 'null'}`);
  const icon = String(h?.icon ?? '');
  if (!icon.endsWith('/10.png')) alertas.push(`bandera no argentina: ${icon || 'sin bandera'}`);
  const id = String(h?.id ?? '');
  return {
    sb_id: id,
    nombre: String(h?.text ?? ''),
    fecha_nacimiento: toISO(h?.nacimiento),
    sexo, sexo_sb: h?.sexo ?? null,
    color: h?.pelo ?? null,
    padrillo_nombre: h?.padre ?? null,
    madre_nombre: h?.madre ?? null,
    abuelo_materno: h?.abuelo_materno ?? null,
    pais_origen: icon.endsWith('/10.png') ? 'Argentina' : null,
    url_perfil: `https://www.studbook.org.ar/ejemplares/perfil/${id}/${h?.url_friendly ?? ''}`,
    leyenda: h?.leyenda ?? null,
    tomo: h?.tomo ?? null, folio: h?.folio ?? null, raza: h?.raza ?? null,
    alertas,
  };
}
// ==================================================================
// «FUENTE — FIN»
// ==================================================================

// Clasificación (copia de la lógica del scraper :57-79) — pero SIN elegir: los exactos van todos.
export function clasificar(term: string, hits: any[]): { exactos: Candidato[]; parciales: Candidato[] } {
  const t = norm(term);
  const exactos: Candidato[] = [], parciales: Candidato[] = [];
  for (const h of hits) (norm(h?.text) === t ? exactos : parciales).push(aCandidato(h));
  return { exactos, parciales };
}

// ------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Sólo se acepta POST.', origin);

  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const jwt = authHeader && /^Bearer\s+/i.test(authHeader) ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;
  if (!jwt) return fail(401, 'sin_token', 'Falta el header Authorization: Bearer <access_token>.', origin);

  let term = '';
  try {
    const body = await req.json();
    term = String(body?.term ?? '').trim();
  } catch { return fail(400, 'body_invalido', 'Body JSON esperado: { "term": "NOMBRE" }.', origin); }
  // sin caracteres de control (ASCII 0-31)
  if (term.length < TERM_MIN || term.length > TERM_MAX || [...term].some((ch) => ch.charCodeAt(0) < 32)) {
    return fail(400, 'term_invalido', `term: entre ${TERM_MIN} y ${TERM_MAX} caracteres, sin caracteres de control.`, origin);
  }

  try {
    // Token validado CONTRA AUTH (firma + expiración), no decodificado a mano.
    const asCaller = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: authData, error: authErr } = await asCaller.auth.getUser(jwt);
    if (authErr || !authData?.user?.id) return fail(401, 'token_invalido', 'Token inválido o expirado.', origin);

    // Staff solamente. fn_is_staff() mira usuarios.auth_user_id = auth.uid() con rol super_admin /
    // secretario_carreras / operador. Se llama con el JWT del caller (RLS del caller, no service role).
    const { data: esStaff, error: staffErr } = await asCaller.rpc('fn_is_staff');
    if (staffErr) { console.error('[studbook-buscar] fn_is_staff:', staffErr.message); return fail(500, 'staff_lookup_failed', 'No se pudo verificar el rol.', origin); }
    if (esStaff !== true) return fail(403, 'solo_staff', 'Esta consulta es para la secretaría.', origin);

    let hits: any[];
    try {
      hits = await autocomplete(term);
    } catch (e) {
      console.error('[studbook-buscar] fuente:', (e as Error).message);
      return fail(502, 'studbook_no_disponible', `El Stud Book no respondió como se esperaba: ${(e as Error).message}`, origin);
    }
    const { exactos, parciales } = clasificar(term, hits);
    return json({ ok: true, term, exactos, parciales, fuente: FUENTE }, 200, origin);
  } catch (err) {
    console.error('[studbook-buscar]', err);
    return fail(500, 'internal_error', 'Error interno.', origin);
  }
});
