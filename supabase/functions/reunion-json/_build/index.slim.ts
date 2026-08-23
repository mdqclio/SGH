// ============================================================
// reunion-json — DEPLOY SLIM (generado, no editar)
// ============================================================
// Igual que _build/index.ts pero sin las líneas de comentario, para que
// entre en el tope de ~32 KB del deploy inline por MCP.
//   node supabase/functions/reunion-json/_build/slim.mjs
// fuente : _build/index.ts
// sha256 : 5798ef6f4221ef94812e8b77e067cb5b855dda64482d9b42a0b99c68f53071c5
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';


const CHAPAS_CODIGO_A_ID = {
  'emp':     1,   // Empate
  'vm':      2,   // Ventaja mínima
  'hoc':     3,   // Hocico
  '½ cbz':   4,   // Media cabeza
  'cza':     5,   // Cabeza
  '½ pzo':   6,   // Medio pescuezo
  'pzo':     7,   // Pescuezo
  '½ cpo':   8,   // ½ cuerpo
  '¾ cpo':   9,   // ¾ cuerpo
  '1 cpo':  10,   // 1 cuerpo
  '1½ cpo': 11,   // 1 cuerpo y ½
  '2 cpos': 12,   // 2 cuerpos
  '2½ cpos':13,   // 2½ cuerpos
  '3 cpos': 14,   // 3 cuerpos
  '3½ cpos':15,   // 3½ cuerpos
  '4 cpos': 16,   // 4 cuerpos
  '4½ cpos':20,   // 4½ cuerpos — alta posterior, por eso el id fuera de orden
  's.a.':   18,   // Sin apreciación (tipo estado, no distancia)
  'desm.':  19,   // Desmontó        (tipo estado, no distancia)
};

const CHAPA_ID_VARIOS = 17;

const VARIANTES_LEGACY = {
  '1 cuerpo':      '1 cpo',
  '2 cuerpos':     '2 cpos',
  '3 cuerpos':     '3 cpos',
  '5 cuerpos':     '5 cpos',   // → varios (id 17, n=5)
  'cabeza':        'cza',
  'media cabeza':  '½ cbz',
  'pescuezo':      'pzo',
  '3/4 cuerpo':    '¾ cpo',
  '1 1/2 cuerpos': '1½ cpo',
  '2 1/2 cuerpos': '2½ cpos',
};

const RX_VARIOS = /^(\d+) cpos$/;

/**
 * Resuelve el texto de resultado_posiciones.diferencia contra el catálogo.
 *
 * Orden de resolución:
 *   1. código exacto del catálogo
 *   2. "N cpos" con N ≥ 5 → varios (id 17) + n
 *   3. variante legacy conocida → se reintenta con el código canónico
 *   4. nada → id null (el texto viaja igual, sin reescribir)
 *
 * @param {string|null} txt
 * @returns {{id: number|null, codigo: string|null, n: number|null}}
 */
function resolverChapa(txt) {
  const vacio = { id: null, codigo: null, n: null };
  if (txt == null) return vacio;
  const s = String(txt).trim();
  if (!s) return vacio;

  const directo = CHAPAS_CODIGO_A_ID[s];
  if (directo != null) return { id: directo, codigo: s, n: null };

  const mv = RX_VARIOS.exec(s);
  if (mv) {
    const n = parseInt(mv[1], 10);
    if (n >= 5) return { id: CHAPA_ID_VARIOS, codigo: s, n };
    return vacio;
  }

  const canon = VARIANTES_LEGACY[s];
  if (canon != null) {
    const porCanon = CHAPAS_CODIGO_A_ID[canon];
    if (porCanon != null) return { id: porCanon, codigo: canon, n: null };
    const mc = RX_VARIOS.exec(canon);
    if (mc) {
      const n = parseInt(mc[1], 10);
      if (n >= 5) return { id: CHAPA_ID_VARIOS, codigo: canon, n };
    }
  }

  return vacio;
}


/**
 * Renumeración canónica de chapas 1..N.
 *
 * Solo inscripciones en estado 'ratificado' cuentan (filtro POSITIVO, no lista
 * de exclusión: forfait y mal_inscrito quedan afuera solos).
 * Se ordenan ASC por numero_partidor (nulls al final) y se les asigna
 * mandil 1, 2, … N en ese orden.
 *
 * @param {Array} inscripciones  TODAS las inscripciones de la carrera, sin
 *                               filtrar, con { id, estado, numero_partidor }.
 * @returns {Object}  Mapa { inscripcion_id (string): mandil (number) }.
 */
function renumerarChapas(inscripciones) {
  const ratificadas = (inscripciones || [])
    .filter(i => i.estado === 'ratificado')
    .sort((a, b) => (a.numero_partidor || 9999) - (b.numero_partidor || 9999));
  const map = {};
  ratificadas.forEach((i, idx) => { map[i.id] = idx + 1; });
  return map;
}



const TZ_DEFAULT = 'America/Argentina/Buenos_Aires';

function importePuesto(bolsa, pct, minimo) {
  const calc = (parseFloat(bolsa) || 0) * (parseFloat(pct) || 0) / 100;
  const min = parseFloat(minimo) || 0;
  return (min > 0 && calc < min) ? min : calc;
}

const TIEMPO_MAX_SEGUNDOS = 600;

function parseTiempo(raw) {
  const empty = { minutos: null, segundos: null, centesimas: null, decimas: null };
  if (raw == null) return empty;
  const s = String(raw).trim();
  if (!s) return empty;
  let minutos = 0, resto = s;
  if (s.includes(':')) {
    const [m, r] = s.split(':');
    minutos = parseInt(m, 10) || 0;
    resto = r;
  }
  let segundos = 0, centesimas = 0;
  if (resto.includes('.')) {
    const [seg, cen] = resto.split('.');
    segundos = parseInt(seg, 10) || 0;
    const cenTxt = String(cen).replace(/\D/g, '');
    centesimas = cenTxt.length === 1 ? (parseInt(cenTxt, 10) || 0) * 10 : (parseInt(cenTxt, 10) || 0);
  } else {
    segundos = parseInt(resto, 10) || 0;
  }
  if (Number.isNaN(minutos) && Number.isNaN(segundos)) return empty;
  if (minutos * 60 + segundos > TIEMPO_MAX_SEGUNDOS) return empty;
  return { minutos, segundos, centesimas, decimas: centesimas };
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

function nombreCaballerizaLimpio(cab) {
  if (!cab || !cab.nombre) return cab?.nombre ?? null;
  const limpio = String(cab.nombre).replace(/\s*\([^)]+\)\s*$/, '').trim();
  return limpio || cab.nombre;
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
  const carrerasVisibles = carreras.filter(c => {
    if (c.estado === 'anulada') return false;
    const cat = c.categoria_id ? catMap.get(c.categoria_id) : null;
    return cat?.es_oficial === true && cat?.es_computable === true;
  });

  const carrerasJson = carrerasVisibles.map(c => {
    const resRaw = resByCarrera.get(c.id) || null;
    const res = resRaw?.estado === 'oficial' ? resRaw : null;
    const hasResult = !!res;

    const insc = inscByCarrera.get(c.id) || [];
    const comps = hasResult
      ? insc.filter(i => posByInsc.has(i.id))
      : insc.filter(i => i.estado === 'ratificado');

    const mandilMap = renumerarChapas(insc);

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
      .sort((a, b) => (mandilMap[a.id] ?? 9999) - (mandilMap[b.id] ?? 9999))
      .map(i => {
        const rp = hasResult ? (posByInsc.get(i.id) || null) : null;
        const spc = spcMap.get(i.spc_id) || null;
        const jock = profMap.get(i.jockey_titular_id) || null;
        const cuid = profMap.get(i.entrenador_id) || null;
        const cab = cabMap.get(i.caballeriza_id) || null;

        const jockEfectivo = profMap.get(i.jockey_suplente_id ?? i.jockey_titular_id) || null;

        let puesto;
        if (!hasResult) puesto = '0';
        else if (rp?.no_largo) puesto = '99';
        else puesto = rp?.posicion != null ? String(rp.posicion) : '0';

        return {
          idCarreraInt: i.id,             // UUID de la inscripción → queda string (no forzar a número)
          puesto,
          estado: null,                 // ignorable v1
          estado_equino_carrera: null,  // ignorable v1
          orden: str(mandilMap[i.id] ?? null),
          yunta: null,                  // columna futura — no existe en el schema
          distanciado: rp?.descalificado ? 'SI' : 'NO',
          motivo_distanciado: rp?.motivo_desc ?? null,
          ejemplar: { nombre: spc?.nombre ?? null, id: str(spc?.studbook_id) },
          kilos_ejemplar: str(i.peso_balanza),
          jockey_inscripto: {
            nombre: nombreCompleto(jock),
            dni: jock?.documento_nro ?? null,
            cuit: null,
          },
          jockey: {
            nombre: nombreCompleto(jockEfectivo),
            dni: jockEfectivo?.documento_nro ?? null,
            cuit: null,
          },
          cuidador: {
            nombre: nombreCompleto(cuid),
            dni: cuid?.documento_nro ?? null,
            cuit: null,
          },
          caballeriza: {
            nombre: nombreCaballerizaLimpio(cab),
            id: str(cab?.id),
            descripcion_chaquetilla: cab?.chaquetilla_descripcion ?? null,
            procedencia: procedenciaCaballeriza(cab),
          },
          jockey_kilos: str2(i.peso_final),
          cuerpos: {
            id_interno: resolverChapa(rp?.diferencia).id,
            nombre: rp?.diferencia ?? null,
          },
          pagaria: str(rp?.dividendo),
        };
      });

    return {
      estado: res?.estado ?? null,           // se deja sin convertir
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
      premios,
      competidores_cantidad: competidores.length, // se deja sin convertir
      competidores,
    };
  });

  return {
    status: 200,
    data: {
      id: reunion.id,
      titulo_reunion: null, // gap v1
      fecha: { date: reunion.fecha, timezone: tz },
      hipodromo: { nombre: hipodromo?.nombre ?? null, id: null },
      carreras: carrerasJson,
    },
  };
}


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

function extractToken(req: Request): string | null {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return null;
}

function fechaFromParam(raw: string | null): string | null {
  if (!raw || !/^\d{6}$/.test(raw)) return null;
  const yy = raw.slice(0, 2), mm = raw.slice(2, 4), dd = raw.slice(4, 6);
  const m = parseInt(mm, 10), d = parseInt(dd, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `20${yy}-${mm}-${dd}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (!API_TOKEN) return json({ status: 500, error: 'server misconfigured: STUDBOOK_API_TOKEN unset' }, 500);
  const token = extractToken(req);
  if (!token || token !== API_TOKEN) {
    return json({ status: 401, error: 'unauthorized' }, 401);
  }

  if (!DB_KEY) return json({ status: 500, error: 'server misconfigured: STUDBOOK_DB_KEY unset' }, 500);

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
    const { data: reunion, error: eR } = await db
      .from('reuniones')
      .select('id, fecha, hipodromo_id, numero, numero_publico, estado')
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

    const catMap = await fetchByIds('categorias_carrera', (carreras ?? []).map((c: any) => c.categoria_id),
      'id, nombre, codigo, es_oficial, es_computable');
    const profIds = allInsc.flatMap((i) => [i.jockey_titular_id, i.jockey_suplente_id, i.entrenador_id]);
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

