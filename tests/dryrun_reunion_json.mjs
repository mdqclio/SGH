#!/usr/bin/env node
/**
 * dryrun_reunion_json.mjs — arma el JSON del Stud Book LOCALMENTE con los datos
 * reales de prod, sin desplegar ni tocar la Edge Function.
 *
 * Replica el fetch de supabase/functions/reunion-json/index.ts y llama al mismo
 * buildReunionJson. Muestra ANTES (filtro viejo: sólo es_oficial) contra AHORA
 * (es_oficial + es_computable) y valida la estructura de lo que se emite:
 * status, arrays, coherencia de competidores_cantidad, y que no se cuele nada
 * de las carreras filtradas.
 *
 * El "ANTES" se simula forzando es_computable:true en el catMap — así no hay
 * dos copias del filtro que se puedan desincronizar.
 *
 * Uso:  set -a; . ./.env; set +a; node tests/dryrun_reunion_json.mjs 2026-08-16
 *
 * Sólo lee. No escribe nada en la DB.
 */
import { createClient } from '@supabase/supabase-js';
import { buildReunionJson } from '../supabase/functions/_shared/studbook_format.mjs';

const db = createClient('https://unlhcuanfrtpatoipwve.supabase.co', process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } });
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const fecha = process.argv[2];

const { data: reunion } = await db.from('reuniones')
  .select('id, fecha, hipodromo_id, numero, numero_publico, estado')
  .eq('club_id', CLUB).eq('fecha', fecha).maybeSingle();
if (!reunion) { console.error('sin reunión', fecha); process.exit(1); }

const { data: hipodromo } = await db.from('hipodromos').select('id, nombre').eq('id', reunion.hipodromo_id).single();
const { data: carreras } = await db.from('carreras').select('*').eq('reunion_id', reunion.id).order('numero_turno');
const ids = carreras.map(c => c.id);
const { data: resultados } = await db.from('resultados').select('*').in('carrera_id', ids);
const { data: insc } = await db.from('inscripciones').select('*').in('carrera_id', ids);
const resByCarrera = new Map(resultados.map(r => [r.carrera_id, r]));
const inscByCarrera = new Map();
for (const i of insc) { if (!inscByCarrera.has(i.carrera_id)) inscByCarrera.set(i.carrera_id, []); inscByCarrera.get(i.carrera_id).push(i); }
const { data: pos } = await db.from('resultado_posiciones').select('*').in('resultado_id', resultados.map(r => r.id));
const posByInsc = new Map((pos ?? []).map(p => [p.inscripcion_id, p]));
const uniq = a => [...new Set(a.filter(Boolean))];
const mapOf = async (t, idsx, cols) => new Map(((await db.from(t).select(cols).in('id', uniq(idsx))).data ?? []).map(r => [r.id, r]));
const catMap  = await mapOf('categorias_carrera', carreras.map(c => c.categoria_id), 'id, nombre, codigo, es_oficial, es_computable');
const profMap = await mapOf('profesionales', insc.flatMap(i => [i.jockey_titular_id, i.jockey_suplente_id, i.entrenador_id]), 'id, nombre, apellido, documento_nro');
const cabMap  = await mapOf('caballerizas', insc.map(i => i.caballeriza_id), 'id, nombre, chaquetilla_descripcion, hipodromo_patente');
const spcMap  = await mapOf('spcs', insc.map(i => i.spc_id), 'id, nombre, studbook_id');

const base = { reunion, hipodromo, carreras, resByCarrera, inscByCarrera, posByInsc, profMap, cabMap, spcMap, tz: 'America/Argentina/Buenos_Aires' };

// ANTES = se fuerza es_computable:true en todas → reproduce el filtro viejo.
const catViejo = new Map([...catMap].map(([k, v]) => [k, { ...v, es_computable: true }]));
const antes = buildReunionJson({ ...base, catMap: catViejo });
const ahora = buildReunionJson({ ...base, catMap });

const resumen = (o) => o.data.carreras.map(c =>
  `      #${c.numero} ${(c.tipo_carrera.nombre || '?').padEnd(22)} ${String(c.competidores_cantidad).padStart(2)} comp · ${c.estado ?? 'sin resultado'}`).join('\n');

console.log(`\n=== ${fecha} · reunión ${reunion.numero_publico ?? reunion.numero} (${reunion.estado}) · ${carreras.length} carreras en DB ===`);
console.log(`\nANTES (filtro es_oficial):  ${antes.data.carreras.length} carreras`);
console.log(resumen(antes));
console.log(`\nAHORA (+ es_computable):    ${ahora.data.carreras.length} carreras`);
console.log(resumen(ahora) || '      (ninguna)');

// --- validaciones estructurales sobre lo EMITIDO ---
let malo = 0;
const bad = (m) => { malo++; console.log('  ✗ ' + m); };
const j = JSON.parse(JSON.stringify(ahora));
if (j.status !== 200) bad('status != 200');
if (!Array.isArray(j.data.carreras)) bad('carreras no es array');
if (j.data.id !== reunion.id) bad('id de reunión cambiado');
if (j.data.fecha?.date !== fecha) bad('fecha cambiada');
if (!j.data.hipodromo?.nombre) bad('hipódromo sin nombre');
for (const c of j.data.carreras) {
  const cat = [...catMap.values()].find(x => x.nombre === c.tipo_carrera.nombre);
  if (!cat?.es_computable) bad(`#${c.numero} viajó y no es computable`);
  if (!Array.isArray(c.competidores)) bad(`#${c.numero} competidores no es array`);
  if (c.competidores_cantidad !== c.competidores.length) bad(`#${c.numero} competidores_cantidad ${c.competidores_cantidad} != ${c.competidores.length}`);
  if (!Array.isArray(c.premios)) bad(`#${c.numero} premios no es array`);
  if (c.competidores.length === 0) console.log(`  ⚠ #${c.numero} sin competidores (array vacío, válido pero raro)`);
}
const emitidas = new Set(j.data.carreras.map(c => c.numero));
const soloAntes = antes.data.carreras.filter(c => !emitidas.has(c.numero));
const idsFiltrados = soloAntes.flatMap(c => c.competidores.map(x => x.nombre)).filter(Boolean);
const txt = JSON.stringify(j);
const colados = idsFiltrados.filter(n => txt.includes(`"${n}"`) &&
  !j.data.carreras.some(c => c.competidores.some(x => x.nombre === n)));
if (colados.length) bad(`se colaron datos de carreras filtradas: ${colados.slice(0,3)}`);

console.log(`\n${malo === 0 ? '✅ estructura válida' : `❌ ${malo} problema(s)`} · ${(txt.length/1024).toFixed(1)} KB emitidos (antes ${(JSON.stringify(antes).length/1024).toFixed(1)} KB)\n`);
