#!/usr/bin/env node
// ============================================================
// Stud Book — Generador de JSON de reunión (READ-ONLY, v1)
// ============================================================
// Dada una reunion_id, arma el JSON con el formato del Stud Book
// y lo escribe a un archivo para revisión. NO escribe en la DB.
//
// Uso:
//   node tools/studbook_reunion_json.mjs <reunion_id> [archivo_salida]
//
// Si no se pasa reunion_id, usa R5 por defecto.
// Lectura pura vía Supabase (publishable key, igual que el frontend).
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

// --- Config ---
// Las tablas tienen RLS: la publishable key (anon) NO ve filas sin sesión.
// Para una lectura server-side limpia se usa la SECRET key vía env (igual que
// los probes de tests/, que la sourcean desde .env). Fallback: publishable.
const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SUPABASE_PUBLISHABLE = 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || SUPABASE_PUBLISHABLE;
const TZ = 'America/Argentina/Buenos_Aires';

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const REUNION_R5 = 'c90b6186-268d-4089-8cc6-71626b627cf8';
const reunionId = process.argv[2] || REUNION_R5;
const outFile = process.argv[3] || `tools/_out/reunion_${reunionId}.json`;

// --- Helpers ---
function die(ctx, err) {
  console.error(`[${ctx}]`, err);
  throw err;
}

// max(bolsa*pct/100, ganancia_minima) — réplica de premios-utils.js#calcPremiosConPiso
function importePuesto(bolsa, pct, minimo) {
  const calc = (parseFloat(bolsa) || 0) * (parseFloat(pct) || 0) / 100;
  const min = parseFloat(minimo) || 0;
  return (min > 0 && calc < min) ? min : calc;
}

// Parte un tiempo_ganador (varchar libre) en {minutos, segundos, decimas}.
// Formatos tolerados: "M:SS.d", "M:SS", "SS.d", "SS", numérico de segundos.
// Si no se puede parsear (o es null), devuelve los tres campos en null.
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

// 'ambos' → 'T'; otros valores se pasan tal cual (gap de mapeo definitivo).
function mapSexo(s) {
  if (s == null) return null;
  return s === 'ambos' ? 'T' : s;
}

function nombreCompleto(p) {
  if (!p) return null;
  return [p.nombre, p.apellido].filter(Boolean).join(' ') || null;
}

// Carga registros por lista de ids, en un solo .in().
async function fetchByIds(tabla, ids, cols = '*') {
  const clean = [...new Set(ids.filter(Boolean))];
  if (!clean.length) return new Map();
  const { data, error } = await db.from(tabla).select(cols).in('id', clean);
  if (error) die(`fetch ${tabla}`, error);
  return new Map(data.map(r => [r.id, r]));
}

// ============================================================
async function main() {
  // 1) Reunión + hipódromo
  const { data: reunion, error: eR } = await db
    .from('reuniones')
    .select('id, fecha, hipodromo_id, numero, estado')
    .eq('id', reunionId)
    .single();
  if (eR) die('reunion', eR);

  let hipodromo = null;
  if (reunion.hipodromo_id) {
    const { data, error } = await db
      .from('hipodromos').select('id, nombre').eq('id', reunion.hipodromo_id).single();
    if (error) die('hipodromo', error);
    hipodromo = data;
  }

  // 2) Carreras
  const { data: carreras, error: eC } = await db
    .from('carreras')
    .select('*')
    .eq('reunion_id', reunionId)
    .order('numero_turno', { ascending: true });
  if (eC) die('carreras', eC);

  const carreraIds = carreras.map(c => c.id);

  // 3) Resultados por carrera
  let resByCarrera = new Map();
  if (carreraIds.length) {
    const { data, error } = await db
      .from('resultados').select('*').in('carrera_id', carreraIds);
    if (error) die('resultados', error);
    resByCarrera = new Map(data.map(r => [r.carrera_id, r]));
  }

  // 4) Inscripciones por carrera
  let inscByCarrera = new Map();
  let allInsc = [];
  if (carreraIds.length) {
    const { data, error } = await db
      .from('inscripciones').select('*').in('carrera_id', carreraIds);
    if (error) die('inscripciones', error);
    allInsc = data;
    for (const i of data) {
      if (!inscByCarrera.has(i.carrera_id)) inscByCarrera.set(i.carrera_id, []);
      inscByCarrera.get(i.carrera_id).push(i);
    }
  }

  // 5) Posiciones por resultado → indexadas por inscripcion_id
  const resultadoIds = [...resByCarrera.values()].map(r => r.id);
  let posByInsc = new Map();
  if (resultadoIds.length) {
    const { data, error } = await db
      .from('resultado_posiciones').select('*').in('resultado_id', resultadoIds);
    if (error) die('resultado_posiciones', error);
    posByInsc = new Map(data.map(p => [p.inscripcion_id, p]));
  }

  // 6) Lookups por id
  const catMap = await fetchByIds('categorias_carrera', carreras.map(c => c.categoria_id), 'id, nombre');
  const profIds = allInsc.flatMap(i => [i.jockey_titular_id, i.entrenador_id]);
  const profMap = await fetchByIds('profesionales', profIds, 'id, nombre, apellido, documento_nro');
  const cabMap = await fetchByIds('caballerizas', allInsc.map(i => i.caballeriza_id),
    'id, nombre, chaquetilla_descripcion');
  const spcMap = await fetchByIds('spcs', allInsc.map(i => i.spc_id), 'id, nombre, studbook_id');

  // --- Armado del JSON ---
  const carrerasJson = carreras.map(c => {
    const res = resByCarrera.get(c.id) || null;
    const hasResult = !!res;

    // competidores: con resultado → los que aparecen en resultado_posiciones;
    // sin resultado → estado='ratificado'. (filtro reportado al final)
    const insc = inscByCarrera.get(c.id) || [];
    const comps = hasResult
      ? insc.filter(i => posByInsc.has(i.id))
      : insc.filter(i => i.estado === 'ratificado');

    // premios puestos 1..5
    const dist = c.distribucion_premios || {};
    const premios = [];
    for (let puesto = 1; puesto <= 5; puesto++) {
      const pct = dist[String(puesto)];
      if (pct == null) continue;
      let importe = importePuesto(c.bolsa_total, pct, dist.ganancia_minima);
      if (puesto === 1 && dist.bono_ganador) importe += parseFloat(dist.bono_ganador) || 0;
      premios.push({ puesto, importe });
    }

    const competidores = comps
      .sort((a, b) => (a.numero_partidor ?? 0) - (b.numero_partidor ?? 0))
      .map(i => {
        const rp = posByInsc.get(i.id) || null;
        const spc = spcMap.get(i.spc_id) || null;
        const jock = profMap.get(i.jockey_titular_id) || null;
        const cuid = profMap.get(i.entrenador_id) || null;
        const cab = cabMap.get(i.caballeriza_id) || null;

        // puesto: sin resultado → "0"; no_largo → "99"; si no → posicion
        let puesto;
        if (!hasResult) puesto = '0';
        else if (rp?.no_largo) puesto = '99';
        else puesto = rp?.posicion != null ? String(rp.posicion) : '0';

        return {
          idCarreraInt: i.id,
          puesto,
          estado: null,                 // ignorable v1
          estado_equino_carrera: null,  // ignorable v1
          orden: i.numero_partidor,
          yunta: null,                  // gap v1
          distanciado: rp?.descalificado ? 'SI' : 'NO',
          motivo_distanciado: rp?.motivo_desc ?? null,
          ejemplar: { nombre: spc?.nombre ?? null, id: spc?.studbook_id ?? null },
          kilos_ejemplar: i.peso_balanza,
          jockey_inscripto: {
            nombre: nombreCompleto(jock),
            dni: jock?.documento_nro ?? null,
            cuit: null,
          },
          jockey: { nombre: null, dni: null, cuit: null }, // v1
          cuidador: {
            nombre: nombreCompleto(cuid),
            dni: cuid?.documento_nro ?? null,
            cuit: null,
          },
          caballeriza: {
            nombre: cab?.nombre ?? null,
            id: cab?.id ?? null,
            descripcion_chaquetilla: cab?.chaquetilla_descripcion ?? null,
          },
          jockey_kilos: i.peso_final,
          cuerpos: { id_interno: null, nombre: rp?.diferencia ?? null },
          pagaria: rp?.dividendo ?? null,
        };
      });

    return {
      estado: res?.estado ?? null,
      numero: c.numero_carrera_programa ?? c.numero_turno,
      horario: c.hora_estimada,
      premio: c.nombre,
      distancia: c.distancia_metros,
      tipo_carrera: { id: null, nombre: catMap.get(c.categoria_id)?.nombre ?? null },
      tipo_pista: { id: null, nombre: c.tipo_pista },
      estado_pista: { id: null, nombre: res?.estado_pista ?? null },
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
      competidores_cantidad: competidores.length,
      competidores,
    };
  });

  const out = {
    data: {
      id: reunion.id,
      titulo_reunion: null, // gap v1
      fecha: { date: reunion.fecha, timezone: TZ },
      hipodromo: { nombre: hipodromo?.nombre ?? null, numero: null, id: null }, // numero pendiente Diego
      carreras: carrerasJson,
    },
  };

  writeFileSync(outFile, JSON.stringify(out, null, 2));

  // --- Reporte ---
  const totalComp = carrerasJson.reduce((a, c) => a + c.competidores_cantidad, 0);
  console.log(`OK reunion=${reunionId}`);
  console.log(`  archivo: ${outFile}`);
  console.log(`  carreras: ${carrerasJson.length}`);
  console.log(`  competidores: ${totalComp}`);
}

main().catch(err => { console.error(err); process.exit(1); });
