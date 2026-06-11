// ============================================================
// Edge Function: reunion-json
// ============================================================
// Expone el JSON de reunión del Stud Book POR FECHA, scope Dolores.
//
//   GET /reunion-json?fecha=YYMMDD   (ej 990101 → 2099-01-01)
//   Auth: header  Authorization: Bearer <STUDBOOK_API_TOKEN>
//         o query  ?token=<STUDBOOK_API_TOKEN>
//
// Devuelve EXACTAMENTE el mismo JSON que tools/studbook_reunion_json.mjs:
// usa la MISMA buildReunionJson() compartida (_shared/studbook_format.mjs),
// mismos selects, y JSON.stringify(out, null, 2) → idéntico byte a byte.
//
// Secretos (NUNCA en el código, se setean en el env de la función):
//   STUDBOOK_DB_KEY    → sb_secret_... (server-side, bypassa RLS). NO usar la
//                        legacy service_role eyJ (desactivada 2026-06-07).
//   STUDBOOK_API_TOKEN → token que exige al cliente.
// SUPABASE_URL lo inyecta la plataforma; fallback al URL del proyecto.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildReunionJson } from '../_shared/studbook_format.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://unlhcuanfrtpatoipwve.supabase.co';
const DB_KEY = Deno.env.get('STUDBOOK_DB_KEY') ?? '';
const API_TOKEN = Deno.env.get('STUDBOOK_API_TOKEN') ?? '';
const CLUB_ID_DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const TZ = 'America/Argentina/Buenos_Aires';

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

// Extrae el token de Authorization: Bearer <x> o de ?token=<x>.
function extractToken(req: Request, url: URL): string | null {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  const q = url.searchParams.get('token');
  return q ? q.trim() : null;
}

// YYMMDD → "20YY-MM-DD" (ej 990101 → 2099-01-01). null si no es válido.
function fechaFromParam(raw: string | null): string | null {
  if (!raw || !/^\d{6}$/.test(raw)) return null;
  const yy = raw.slice(0, 2), mm = raw.slice(2, 4), dd = raw.slice(4, 6);
  const m = parseInt(mm, 10), d = parseInt(dd, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `20${yy}-${mm}-${dd}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // 1) AUTH obligatoria — sin token válido → 401.
  if (!API_TOKEN) return json({ status: 500, error: 'server misconfigured: STUDBOOK_API_TOKEN unset' }, 500);
  const token = extractToken(req, url);
  if (!token || token !== API_TOKEN) {
    return json({ status: 401, error: 'unauthorized' }, 401);
  }

  if (!DB_KEY) return json({ status: 500, error: 'server misconfigured: STUDBOOK_DB_KEY unset' }, 500);

  // 2) fecha → date
  const fecha = fechaFromParam(url.searchParams.get('fecha'));
  if (!fecha) return json({ status: 400, error: 'fecha inválida (esperado YYMMDD, ej 990101)' }, 400);

  const db = createClient(SUPABASE_URL, DB_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const die = (ctx: string, err: unknown) => { throw new Error(`[${ctx}] ${JSON.stringify(err)}`); };
  const fetchByIds = async (tabla: string, ids: unknown[], cols = '*') => {
    const clean = [...new Set(ids.filter(Boolean))];
    if (!clean.length) return new Map();
    const { data, error } = await db.from(tabla).select(cols).in('id', clean);
    if (error) die(`fetch ${tabla}`, error);
    return new Map((data ?? []).map((r: any) => [r.id, r]));
  };

  try {
    // 3) Reunión Dolores en esa fecha → 404 limpio si no hay.
    const { data: reunion, error: eR } = await db
      .from('reuniones')
      .select('id, fecha, hipodromo_id, numero, estado')
      .eq('club_id', CLUB_ID_DOLORES)
      .eq('fecha', fecha)
      .maybeSingle();
    if (eR) die('reunion', eR);
    if (!reunion) return json({ status: 404, data: null, error: `sin reunión para fecha ${fecha}` }, 404);

    const reunionId = reunion.id;

    let hipodromo: any = null;
    if (reunion.hipodromo_id) {
      const { data, error } = await db
        .from('hipodromos').select('id, nombre').eq('id', reunion.hipodromo_id).single();
      if (error) die('hipodromo', error);
      hipodromo = data;
    }

    const { data: carreras, error: eC } = await db
      .from('carreras').select('*').eq('reunion_id', reunionId)
      .order('numero_turno', { ascending: true });
    if (eC) die('carreras', eC);
    const carreraIds = (carreras ?? []).map((c: any) => c.id);

    let resByCarrera = new Map();
    if (carreraIds.length) {
      const { data, error } = await db.from('resultados').select('*').in('carrera_id', carreraIds);
      if (error) die('resultados', error);
      resByCarrera = new Map((data ?? []).map((r: any) => [r.carrera_id, r]));
    }

    const inscByCarrera = new Map();
    let allInsc: any[] = [];
    if (carreraIds.length) {
      const { data, error } = await db.from('inscripciones').select('*').in('carrera_id', carreraIds);
      if (error) die('inscripciones', error);
      allInsc = data ?? [];
      for (const i of allInsc) {
        if (!inscByCarrera.has(i.carrera_id)) inscByCarrera.set(i.carrera_id, []);
        inscByCarrera.get(i.carrera_id).push(i);
      }
    }

    const resultadoIds = [...resByCarrera.values()].map((r: any) => r.id);
    let posByInsc = new Map();
    if (resultadoIds.length) {
      const { data, error } = await db.from('resultado_posiciones').select('*').in('resultado_id', resultadoIds);
      if (error) die('resultado_posiciones', error);
      posByInsc = new Map((data ?? []).map((p: any) => [p.inscripcion_id, p]));
    }

    const catMap = await fetchByIds('categorias_carrera', (carreras ?? []).map((c: any) => c.categoria_id), 'id, nombre');
    const profIds = allInsc.flatMap((i) => [i.jockey_titular_id, i.entrenador_id]);
    const profMap = await fetchByIds('profesionales', profIds, 'id, nombre, apellido, documento_nro');
    const cabMap = await fetchByIds('caballerizas', allInsc.map((i) => i.caballeriza_id),
      'id, nombre, chaquetilla_descripcion, hipodromo_patente');
    const spcMap = await fetchByIds('spcs', allInsc.map((i) => i.spc_id), 'id, nombre, studbook_id');

    const out = buildReunionJson({
      reunion, hipodromo, carreras: carreras ?? [],
      resByCarrera, inscByCarrera, posByInsc,
      catMap, profMap, cabMap, spcMap,
      tz: TZ,
    });

    return json(out, 200);
  } catch (err) {
    console.error('[reunion-json]', err);
    return json({ status: 500, error: 'internal error' }, 500);
  }
});
