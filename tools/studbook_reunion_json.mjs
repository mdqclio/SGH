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
import { buildReunionJson } from '../supabase/functions/_shared/studbook_format.mjs';

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
// La lógica de FORMATO vive en supabase/functions/_shared/studbook_format.mjs
// (compartida con la Edge Function). Acá solo queda el I/O: fetch + writeFile.
function die(ctx, err) {
  console.error(`[${ctx}]`, err);
  throw err;
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
    'id, nombre, chaquetilla_descripcion, hipodromo_patente');
  const spcMap = await fetchByIds('spcs', allInsc.map(i => i.spc_id), 'id, nombre, studbook_id');

  // --- Armado del JSON (lógica compartida con la Edge Function) ---
  const out = buildReunionJson({
    reunion, hipodromo, carreras,
    resByCarrera, inscByCarrera, posByInsc,
    catMap, profMap, cabMap, spcMap,
    tz: TZ,
  });

  writeFileSync(outFile, JSON.stringify(out, null, 2));

  // --- Reporte ---
  const totalComp = out.data.carreras.reduce((a, c) => a + c.competidores_cantidad, 0);
  console.log(`OK reunion=${reunionId}`);
  console.log(`  archivo: ${outFile}`);
  console.log(`  carreras: ${out.data.carreras.length}`);
  console.log(`  competidores: ${totalComp}`);
}

main().catch(err => { console.error(err); process.exit(1); });
