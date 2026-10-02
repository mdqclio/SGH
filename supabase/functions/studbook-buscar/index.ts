// ============================================================
// studbook-buscar — consulta al Stud Book Argentino para el alta de SPC (spcs.html y portal.html)
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
// El contrato hacia las pantallas — buscar `{ ok, term, exactos, parciales, fuente }`, traer
// `{ ok, spc_id, ya_existia, revision_motivos, nombre }` — NO cambia, y spcs.html / portal.html no se
// tocan. Poner el nombre de la fuente nueva en `FUENTE`.
//   ⚠ Si esa API exige allowlist de IP: una Edge Function NO puede salir con IP fija
//   (docs/diagnosticos/2026-09-10_ips-fijas-consulta-studbook.md §3.1) y la consulta tiene que
//   pasar por un proxy con IP propia (el VPS). En ese caso esta función llama al proxy.
//
// DOS ACCIONES (body JSON):
//
//   { term }  — BUSCAR. Devuelve candidatos. No escribe. Staff (spcs.html) y, desde 2026-10, usuarios
//               del portal (portal.html, cuando el caballo no está en el padrón). Los HOMÓNIMOS NO SE
//               DESAMBIGUAN ACÁ: se devuelven todos con fecha, sexo, pelaje y padres, y elige la persona
//               (docs/diagnosticos/2026-09-11_plan-studbook-buscar-edge-function.md §4).
//               En spcs.html el INSERT lo sigue haciendo la pantalla con el cliente del usuario (RLS,
//               rpc_spcs_duplicados, índice único spcs_studbook_id_uniq).
//
//   { accion: 'traer', sb_id, nombre, carrera_id }  — TRAER (portal y, desde v3 del 02/10, secretaría desde el modal
//               "Inscribir SPC" de inscripciones.html). El navegador manda SÓLO qué
//               caballo eligió; los datos los vuelve a pedir ESTA función al Stud Book (`nombre` como
//               término, y se queda con el hit cuyo id === sb_id). Con eso llama a la RPC
//               rpc_spc_alta_studbook_portal con la key secreta (service_role): es la ÚNICA que la
//               puede ejecutar. La RPC valida, reusa o crea la ficha (pendiente de revisión) y
//               devuelve el id; la inscripción sigue en el portal por rpc_inscribir, sin cambios. Para la
//               secretaría la RPC (v2, migrations/rpc_spc_alta_studbook_staff.sql) decide el modo por el rol del
//               usuario: sin ventana ni cupo, la ficha nace 'secretaria' y sin revisión pendiente; el modal
//               selecciona el caballo y la inscripción la guarda la pantalla como siempre.
//               Diseño y decisiones: docs/diagnosticos/2026-10-01_portal-alta-spc-studbook.md (reports),
//               migrations/portal_alta_spc_studbook.sql.
//
// SECRETOS — NUNCA en el repo. La key secreta sólo para 'traer', resuelta como invite-user
// (resolverDbKey: STUDBOOK_DB_KEY | INVITE_DB_KEY | SGH_SECRET_KEY | SB_SECRET_KEY |
// SUPABASE_SERVICE_ROLE_KEY, descartando las legacy `eyJ…`, muertas desde 2026-06-07).
//
// Auth: verify_jwt=true en el deploy + getUser(jwt) server-side + rol por RPC con el JWT del caller
// (fn_is_staff / fn_is_portal_user). Buscar y traer: staff o portal; el resto → 403.
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
// TRAER — helpers puros (los prueba tests/probe_studbook_buscar_fn.mjs sin Supabase)
// ------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valida el body de 'traer'. Devuelve el mensaje de error o null.
export function validarTraer(b: any): string | null {
  const sb = String(b?.sb_id ?? '');
  const nombre = String(b?.nombre ?? '').trim();
  if (!/^[0-9]{1,9}$/.test(sb)) return 'sb_id: sólo dígitos, de 1 a 9.';
  if (nombre.length < TERM_MIN || nombre.length > TERM_MAX || [...nombre].some((ch) => ch.charCodeAt(0) < 32)) {
    return `nombre: entre ${TERM_MIN} y ${TERM_MAX} caracteres, sin caracteres de control.`;
  }
  if (!UUID_RE.test(String(b?.carrera_id ?? ''))) return 'carrera_id: UUID esperado.';
  return null;
}

// De los hits crudos del Stud Book, el que el usuario eligió. Por id, nunca por nombre.
export function elegirHit(hits: any[], sbId: string): any {
  return (hits || []).find((h) => String(h?.id ?? '') === String(sbId)) ?? null;
}

// Parámetros de rpc_spc_alta_studbook_portal a partir del candidato que armó ESTA función.
export function paramsAlta(c: any, authUserId: string, carreraId: string): Record<string, unknown> {
  return {
    p_auth_user_id: authUserId,
    p_carrera_id: carreraId,
    p_sb_id: c.sb_id,
    p_nombre: c.nombre,
    p_fecha_nacimiento: c.fecha_nacimiento,
    p_sexo: c.sexo,
    p_color: c.color,
    p_padre: c.padrillo_nombre,
    p_madre: c.madre_nombre,
    p_abuelo_materno: c.abuelo_materno,
    p_pais: c.pais_origen,
    p_url_perfil: c.url_perfil,
    p_leyenda: c.leyenda,
    p_raza: c.raza,
    p_alertas: c.alertas,
  };
}

// Error de la RPC → status + código para la pantalla. Los mensajes de la RPC están escritos para
// que los lea el usuario (rechazos de negocio = P0001 / 22023); los de permiso (42501) también.
export function errorRpcAHttp(e: any): { status: number; error: string; detalle: string } {
  const code = String(e?.code ?? '');
  const msg = String(e?.message ?? 'Error desconocido.');
  if (code === '42501') return { status: 403, error: 'no_autorizado', detalle: msg };
  if (code === 'P0001' || code === '22023') return { status: 422, error: 'rechazado', detalle: msg };
  return { status: 500, error: 'alta_fallida', detalle: 'No se pudo dar de alta el caballo.' };
}

// Key secreta para la RPC (patrón invite-user: las legacy `eyJ…` están desactivadas → se descartan).
const CANDIDATAS_DB_KEY = ['STUDBOOK_DB_KEY', 'INVITE_DB_KEY', 'SGH_SECRET_KEY', 'SB_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
function resolverDbKey(): { key: string; fuente: string } | null {
  for (const nombre of CANDIDATAS_DB_KEY) {
    const v = (Deno.env.get(nombre) ?? '').trim();
    if (v && !v.startsWith('eyJ')) return { key: v, fuente: nombre };
  }
  return null;
}

// ------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Sólo se acepta POST.', origin);

  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const jwt = authHeader && /^Bearer\s+/i.test(authHeader) ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;
  if (!jwt) return fail(401, 'sin_token', 'Falta el header Authorization: Bearer <access_token>.', origin);

  let body: any = null;
  try { body = await req.json(); }
  catch { return fail(400, 'body_invalido', 'Body JSON esperado: { "term": "NOMBRE" } o { "accion": "traer", … }.', origin); }
  const traer = body?.accion === 'traer';
  let term = '';
  if (traer) {
    const err = validarTraer(body);
    if (err) return fail(400, 'body_invalido', err, origin);
  } else {
    term = String(body?.term ?? '').trim();
    // sin caracteres de control (ASCII 0-31)
    if (term.length < TERM_MIN || term.length > TERM_MAX || [...term].some((ch) => ch.charCodeAt(0) < 32)) {
      return fail(400, 'term_invalido', `term: entre ${TERM_MIN} y ${TERM_MAX} caracteres, sin caracteres de control.`, origin);
    }
  }

  try {
    // Token validado CONTRA AUTH (firma + expiración), no decodificado a mano.
    const asCaller = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: authData, error: authErr } = await asCaller.auth.getUser(jwt);
    if (authErr || !authData?.user?.id) return fail(401, 'token_invalido', 'Token inválido o expirado.', origin);

    // Rol, con el JWT del caller (no service role). fn_is_staff(): super_admin / secretario_carreras /
    // operador activo. fn_is_portal_user(): profesional / propietario activo.
    const [staffR, portalR] = await Promise.all([asCaller.rpc('fn_is_staff'), asCaller.rpc('fn_is_portal_user')]);
    if (staffR.error || portalR.error) {
      console.error('[studbook-buscar] rol:', staffR.error?.message ?? portalR.error?.message);
      return fail(500, 'staff_lookup_failed', 'No se pudo verificar el rol.', origin);
    }
    const esStaff = staffR.data === true, esPortal = portalR.data === true;

    if (!traer) {
      if (!esStaff && !esPortal) return fail(403, 'solo_staff', 'Esta consulta es para la secretaría y los usuarios del portal.', origin);
      let hits: any[];
      try {
        hits = await autocomplete(term);
      } catch (e) {
        console.error('[studbook-buscar] fuente:', (e as Error).message);
        return fail(502, 'studbook_no_disponible', `El Stud Book no respondió como se esperaba: ${(e as Error).message}`, origin);
      }
      const { exactos, parciales } = clasificar(term, hits);
      return json({ ok: true, term, exactos, parciales, fuente: FUENTE }, 200, origin);
    }

    // ── TRAER ── portal o secretaría. Qué reglas se aplican lo decide la RPC por el rol del usuario.
    if (!esPortal && !esStaff) return fail(403, 'solo_staff', 'Esta acción es para la secretaría y los usuarios del portal.', origin);
    const sbId = String(body.sb_id), nombre = String(body.nombre).trim(), carreraId = String(body.carrera_id);
    let hitsT: any[];
    try {
      hitsT = await autocomplete(nombre);
    } catch (e) {
      console.error('[studbook-buscar] fuente (traer):', (e as Error).message);
      return fail(502, 'studbook_no_disponible', `El Stud Book no respondió como se esperaba: ${(e as Error).message}`, origin);
    }
    const hit = elegirHit(hitsT, sbId);
    if (!hit) return fail(409, 'no_coincide', 'El Stud Book ya no devuelve ese caballo con ese nombre. Buscalo de nuevo.', origin);
    const cand = aCandidato(hit);

    const dbKey = resolverDbKey();
    if (!dbKey) { console.error('[studbook-buscar] sin key secreta para traer'); return fail(500, 'server_misconfigured', 'Falta configuración del servidor.', origin); }
    const admin = createClient(SUPABASE_URL, dbKey.key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: filas, error: rpcErr } = await admin.rpc('rpc_spc_alta_studbook_portal', paramsAlta(cand, String(authData?.user?.id), carreraId));
    if (rpcErr) {
      const m = errorRpcAHttp(rpcErr);
      if (m.status === 500) console.error('[studbook-buscar] rpc_spc_alta_studbook_portal:', rpcErr.code, rpcErr.message, '(key:', dbKey.fuente + ')');
      return fail(m.status, m.error, m.detalle, origin);
    }
    const fila = Array.isArray(filas) ? filas[0] : filas;
    if (!fila?.spc_id) { console.error('[studbook-buscar] RPC sin fila'); return fail(500, 'alta_fallida', 'No se pudo dar de alta el caballo.', origin); }
    return json({ ok: true, spc_id: fila.spc_id, ya_existia: fila.ya_existia === true,
                  revision_motivos: fila.revision_motivos ?? null, nombre: cand.nombre }, 200, origin);
  } catch (err) {
    console.error('[studbook-buscar]', err);
    return fail(500, 'internal_error', 'Error interno.', origin);
  }
});
