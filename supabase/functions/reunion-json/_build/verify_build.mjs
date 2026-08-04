#!/usr/bin/env node
// ============================================================
// Verificación pre-deploy: el BUILD produce el mismo JSON que los módulos
// ============================================================
//   set -a; . ./.env; set +a
//   node supabase/functions/reunion-json/_build/verify_build.mjs <reunion_id> <ref.json>
//
// Toma buildReunionJson DEL ARCHIVO DE BUILD (no de los módulos sueltos),
// lo corre contra los datos reales de la reunión con los MISMOS selects que
// usa la Edge Function, y diffea el resultado contra el JSON de referencia.
//
// Se evalúa el tramo de módulos inlineados del build (hasta el marcador de
// index.ts). Ese tramo es JS puro y contiene toda la lógica del builder; lo
// que sigue es el wrapper HTTP (Deno.serve) con anotaciones TypeScript, que
// no aporta lógica de armado y se valida aparte con tsc.
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const BUILD = join(AQUI, 'index.ts');
const TZ = 'America/Argentina/Buenos_Aires';

const reunionId = process.argv[2];
const refFile = process.argv[3];
if (!reunionId || !refFile) {
  console.error('uso: verify_build.mjs <reunion_id> <referencia.json>');
  process.exit(2);
}

// --- extraer buildReunionJson DEL BUILD ---
const buildSrc = readFileSync(BUILD, 'utf8');
const corte = buildSrc.indexOf('// ---------- inline: index.ts ----------');
if (corte < 0) { console.error('no encuentro el marcador de index.ts en el build'); process.exit(1); }
const tramoModulos = buildSrc
  .slice(0, corte)
  .replace(/^\s*import\s.*$/gm, '');   // el import externo no hace falta acá

const buildReunionJson = new Function(
  tramoModulos + '\n;return buildReunionJson;'
)();
console.log('buildReunionJson extraído del BUILD:', typeof buildReunionJson);
if (typeof buildReunionJson !== 'function') process.exit(1);

// --- datos reales, mismos selects que la Edge Function ---
const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('falta SUPABASE_SECRET_KEY en el entorno'); process.exit(2); }
const db = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const die = (ctx, err) => { console.error(`[${ctx}]`, err); process.exit(1); };
async function fetchByIds(tabla, ids, cols = '*') {
  const clean = [...new Set(ids.filter(Boolean))];
  if (!clean.length) return new Map();
  const { data, error } = await db.from(tabla).select(cols).in('id', clean);
  if (error) die(`fetch ${tabla}`, error);
  return new Map(data.map(r => [r.id, r]));
}

const { data: reunion, error: eR } = await db.from('reuniones')
  .select('id, fecha, hipodromo_id, numero, estado').eq('id', reunionId).single();
if (eR) die('reunion', eR);

let hipodromo = null;
if (reunion.hipodromo_id) {
  const { data, error } = await db.from('hipodromos').select('id, nombre')
    .eq('id', reunion.hipodromo_id).single();
  if (error) die('hipodromo', error);
  hipodromo = data;
}

const { data: carreras, error: eC } = await db.from('carreras').select('*')
  .eq('reunion_id', reunionId).order('numero_turno', { ascending: true });
if (eC) die('carreras', eC);
const carreraIds = carreras.map(c => c.id);

let resByCarrera = new Map();
if (carreraIds.length) {
  const { data, error } = await db.from('resultados').select('*').in('carrera_id', carreraIds);
  if (error) die('resultados', error);
  resByCarrera = new Map(data.map(r => [r.carrera_id, r]));
}

const inscByCarrera = new Map();
let allInsc = [];
if (carreraIds.length) {
  const { data, error } = await db.from('inscripciones').select('*').in('carrera_id', carreraIds);
  if (error) die('inscripciones', error);
  allInsc = data;
  for (const i of data) {
    if (!inscByCarrera.has(i.carrera_id)) inscByCarrera.set(i.carrera_id, []);
    inscByCarrera.get(i.carrera_id).push(i);
  }
}

const resultadoIds = [...resByCarrera.values()].map(r => r.id);
let posByInsc = new Map();
if (resultadoIds.length) {
  const { data, error } = await db.from('resultado_posiciones').select('*').in('resultado_id', resultadoIds);
  if (error) die('resultado_posiciones', error);
  posByInsc = new Map(data.map(p => [p.inscripcion_id, p]));
}

const catMap = await fetchByIds('categorias_carrera', carreras.map(c => c.categoria_id),
  'id, nombre, codigo, es_oficial, es_computable');
const profIds = allInsc.flatMap(i => [i.jockey_titular_id, i.entrenador_id]);
const profMap = await fetchByIds('profesionales', profIds, 'id, nombre, apellido, documento_nro');
const cabMap = await fetchByIds('caballerizas', allInsc.map(i => i.caballeriza_id),
  'id, nombre, chaquetilla_descripcion, hipodromo_patente');
const spcMap = await fetchByIds('spcs', allInsc.map(i => i.spc_id), 'id, nombre, studbook_id');

const out = buildReunionJson({
  reunion, hipodromo, carreras,
  resByCarrera, inscByCarrera, posByInsc,
  catMap, profMap, cabMap, spcMap,
  tz: TZ,
});

const salida = join(AQUI, 'r6_build.json');
writeFileSync(salida, JSON.stringify(out, null, 2));

// --- diff contra la referencia ---
const ref = JSON.parse(readFileSync(refFile, 'utf8'));
const a = JSON.stringify(ref, null, 2);
const b = JSON.stringify(out, null, 2);

console.log('\nreferencia :', refFile, `(${a.length} bytes)`);
console.log('build      :', salida, `(${b.length} bytes)`);
console.log('carreras   : ref', ref.data.carreras.length, '| build', out.data.carreras.length);
console.log('competidores: ref',
  ref.data.carreras.reduce((s, c) => s + c.competidores.length, 0), '| build',
  out.data.carreras.reduce((s, c) => s + c.competidores.length, 0));

if (a === b) {
  console.log('\nIDÉNTICOS — el inlineado no cambió el comportamiento');
  process.exit(0);
}

console.error('\nDIFIEREN — FRENAR EL DEPLOY');
const la = a.split('\n'), lb = b.split('\n');
let mostradas = 0;
for (let i = 0; i < Math.max(la.length, lb.length) && mostradas < 25; i++) {
  if (la[i] !== lb[i]) { console.error(`  L${i + 1}\n    ref  : ${la[i]}\n    build: ${lb[i]}`); mostradas++; }
}
process.exit(1);
