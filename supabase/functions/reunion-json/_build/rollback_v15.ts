// reunion-json (DEPLOY BUILD — shared module inlined) cold-start bump v12
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://unlhcuanfrtpatoipwve.supabase.co';
const DB_KEY = Deno.env.get('STUDBOOK_DB_KEY') ?? '';
const API_TOKEN = Deno.env.get('STUDBOOK_API_TOKEN') ?? '';
const CLUB_ID_DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const TZ = 'America/Argentina/Buenos_Aires';
const TZ_DEFAULT = 'America/Argentina/Buenos_Aires';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

function extractToken(req, url) {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  const q = url.searchParams.get('token');
  return q ? q.trim() : null;
}

function fechaFromParam(raw) {
  if (!raw || !/^\d{6}$/.test(raw)) return null;
  const yy = raw.slice(0, 2), mm = raw.slice(2, 4), dd = raw.slice(4, 6);
  const m = parseInt(mm, 10), d = parseInt(dd, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `20${yy}-${mm}-${dd}`;
}

function importePuesto(bolsa, pct, minimo) {
  const calc = (parseFloat(bolsa) || 0) * (parseFloat(pct) || 0) / 100;
  const min = parseFloat(minimo) || 0;
  return (min > 0 && calc < min) ? min : calc;
}
function parseTiempo(raw) {
  const empty = { minutos: null, segundos: null, decimas: null };
  if (raw == null) return empty;
  const s = String(raw).trim();
  if (!s) return empty;
  let minutos = 0, resto = s;
  if (s.includes(':')) {
    const [m, r] = s.split(':');
    minutos = parseInt(m, 10) || 0;
    resto = r;
  }
  let segundos = 0, decimas = 0;
  if (resto.includes('.')) {
    const [seg, dec] = resto.split('.');
    segundos = parseInt(seg, 10) || 0;
    decimas = parseInt(dec, 10) || 0;
  } else {
    segundos = parseInt(resto, 10) || 0;
  }
  if (Number.isNaN(minutos) && Number.isNaN(segundos)) return empty;
  return { minutos, segundos, decimas };
}
function mapSexo(s) {
  if (s == null) return null;
  return s === 'ambos' ? 'T' : s;
}
function procedenciaCaballeriza(cab) {
  if (!cab) return null;
  if (cab.hipodromo_patente) return cab.hipodromo_patente;
  const m = /\(([^)]+)\)\s*$/.exec(cab.nombre || '');
  return m ? m[1].trim() : null;
}
function nombreCompleto(p) {
  if (!p) return null;
  return [p.nombre, p.apellido].filter(Boolean).join(' ') || null;
}
function str(v) {
  return v == null ? null : String(v);
}
function str2(v) {
  return v == null ? null : (parseFloat(v)).toFixed(2);
}
function buildReunionJson({
  reunion, hipodromo, carreras,
  resByCarrera, inscByCarrera, posByInsc,
  catMap, profMap, cabMap, spcMap,
  tz = TZ_DEFAULT,
}) {
  const carrerasJson = carreras.map(c => {
    const res = resByCarrera.get(c.id) || null;
    const hasResult = !!res;
    const insc = inscByCarrera.get(c.id) || [];
    const comps = hasResult
      ? insc.filter(i => posByInsc.has(i.id))
      : insc.filter(i => i.estado === 'ratificado');
    const dist = c.distribucion_premios || {};
    const premios = [];
    for (let puesto = 1; puesto <= 5; puesto++) {
      const pct = dist[String(puesto)];
      if (pct == null) continue;
      let importe = importePuesto(c.bolsa_total, pct, dist.ganancia_minima);
      if (puesto === 1 && dist.bono_ganador) importe += parseFloat(dist.bono_ganador) || 0;
      premios.push({ puesto: str(puesto), importe: str(importe) });
    }
    const competidores = comps
      .sort((a, b) => (a.numero_partidor ?? 0) - (b.numero_partidor ?? 0))
      .map(i => {
        const rp = posByInsc.get(i.id) || null;
        const spc = spcMap.get(i.spc_id) || null;
        const jock = profMap.get(i.jockey_titular_id) || null;
        const cuid = profMap.get(i.entrenador_id) || null;
        const cab = cabMap.get(i.caballeriza_id) || null;
        let puesto;
        if (!hasResult) puesto = '0';
        else if (rp?.no_largo) puesto = '99';
        else puesto = rp?.posicion != null ? String(rp.posicion) : '0';
        return {
          idCarreraInt: i.id,
          puesto,
          estado: null,
          estado_equino_carrera: null,
          orden: str(i.numero_partidor),
          yunta: null,
          distanciado: rp?.descalificado ? 'SI' : 'NO',
          motivo_distanciado: rp?.motivo_desc ?? null,
          ejemplar: { nombre: spc?.nombre ?? null, id: str(spc?.studbook_id) },
          kilos_ejemplar: str(i.peso_balanza),
          jockey_inscripto: {
            nombre: nombreCompleto(jock),
            dni: jock?.documento_nro ?? null,
            cuit: null,
          },
          jockey: { nombre: null, dni: null, cuit: null },
          cuidador: {
            nombre: nombreCompleto(cuid),
            dni: cuid?.documento_nro ?? null,
            cuit: null,
          },
          caballeriza: {
            nombre: cab?.nombre ?? null,
            id: str(cab?.id),
            descripcion_chaquetilla: cab?.chaquetilla_descripcion ?? null,
            procedencia: procedenciaCaballeriza(cab),
          },
          jockey_kilos: str2(i.peso_final),
          cuerpos: { id_interno: null, nombre: rp?.diferencia ?? null },
          pagaria: str(rp?.dividendo),
        };
      });
    return {
      estado: res?.estado ?? null,
      numero: str(c.numero_carrera_programa ?? c.numero_turno),
      horario: c.hora_estimada,
      premio: c.nombre,
      distancia: str(c.distancia_metros),
      tipo_carrera: { id: c.categoria_id ?? null, nombre: catMap.get(c.categoria_id)?.nombre ?? null },
      tipo_pista: { id: c.tipo_pista ?? null, nombre: c.tipo_pista ?? null },
      estado_pista: { id: res?.estado_pista ?? null, nombre: res?.estado_pista ?? null },
      tipo_codo: { id: null, nombre: null },
      condicion: {
        texto: c.condicion_handicap ?? c.condicion_adicional ?? null,
        edaddesde: c.edad_minima_anos,
        edadhasta: c.edad_maxima_anos,
        sexo: mapSexo(c.condicion_sexo),
        ganadadesde: null,
        ganadahasta: null,
      },
      tiempo: parseTiempo(res?.tiempo_ganador),
      premios: [premios],
      competidores_cantidad: competidores.length,
      competidores: [competidores],
    };
  });
  return {
    status: 200,
    data: {
      id: reunion.id,
      titulo_reunion: null,
      fecha: { date: reunion.fecha, timezone: tz },
      hipodromo: { nombre: hipodromo?.nombre ?? null, id: null },
      carreras: carrerasJson,
    },
  };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!API_TOKEN) return json({ status: 500, error: 'server misconfigured: STUDBOOK_API_TOKEN unset' }, 500);
  const token = extractToken(req, url);
  if (!token || token !== API_TOKEN) {
    return json({ status: 401, error: 'unauthorized' }, 401);
  }
  if (!DB_KEY) return json({ status: 500, error: 'server misconfigured: STUDBOOK_DB_KEY unset' }, 500);
  const fecha = fechaFromParam(url.searchParams.get('fecha'));
  if (!fecha) return json({ status: 400, error: 'fecha inválida (esperado YYMMDD, ej 990101)' }, 400);
  const db = createClient(SUPABASE_URL, DB_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const die = (ctx, err) => { throw new Error(`[${ctx}] ${JSON.stringify(err)}`); };
  const fetchByIds = async (tabla, ids, cols = '*') => {
    const clean = [...new Set(ids.filter(Boolean))];
    if (!clean.length) return new Map();
    const { data, error } = await db.from(tabla).select(cols).in('id', clean);
    if (error) die(`fetch ${tabla}`, error);
    return new Map((data ?? []).map((r) => [r.id, r]));
  };
  try {
    const { data: reunion, error: eR } = await db
      .from('reuniones')
      .select('id, fecha, hipodromo_id, numero, estado')
      .eq('club_id', CLUB_ID_DOLORES)
      .eq('fecha', fecha)
      .maybeSingle();
    if (eR) die('reunion', eR);
    if (!reunion) return json({ status: 404, data: null, error: `sin reunión para fecha ${fecha}` }, 404);
    const reunionId = reunion.id;
    let hipodromo = null;
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
    const carreraIds = (carreras ?? []).map((c) => c.id);
    let resByCarrera = new Map();
    if (carreraIds.length) {
      const { data, error } = await db.from('resultados').select('*').in('carrera_id', carreraIds);
      if (error) die('resultados', error);
      resByCarrera = new Map((data ?? []).map((r) => [r.carrera_id, r]));
    }
    const inscByCarrera = new Map();
    let allInsc = [];
    if (carreraIds.length) {
      const { data, error } = await db.from('inscripciones').select('*').in('carrera_id', carreraIds);
      if (error) die('inscripciones', error);
      allInsc = data ?? [];
      for (const i of allInsc) {
        if (!inscByCarrera.has(i.carrera_id)) inscByCarrera.set(i.carrera_id, []);
        inscByCarrera.get(i.carrera_id).push(i);
      }
    }
    const resultadoIds = [...resByCarrera.values()].map((r) => r.id);
    let posByInsc = new Map();
    if (resultadoIds.length) {
      const { data, error } = await db.from('resultado_posiciones').select('*').in('resultado_id', resultadoIds);
      if (error) die('resultado_posiciones', error);
      posByInsc = new Map((data ?? []).map((p) => [p.inscripcion_id, p]));
    }
    const catMap = await fetchByIds('categorias_carrera', (carreras ?? []).map((c) => c.categoria_id), 'id, nombre');
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
