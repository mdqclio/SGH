#!/usr/bin/env node
/**
 * probe_pdf_inscriptos_cond.mjs — verificación del template del PDF de inscriptos.
 *
 * Extrae el código REAL de inscripciones.html (SEXO_TXT / SEXO_RE / buildCond) y lo
 * evalúa contra los datos de producción de la reunión indicada (default: R8 de Dolores).
 *
 * Verifica los 3 arreglos de presentación:
 *   1. Texto de condición completo — sin abreviar ("perd", "g.1c") ni truncar ("…").
 *   2. "Especial" hoisteado al frente como etiqueta, seguido de la condición completa.
 *   3. Etiqueta OFICIAL COMPUTABLE / OFICIAL NO COMPUTABLE derivada de categorias_carrera.
 *
 * Uso:  node tests/probe_pdf_inscriptos_cond.mjs [numero_reunion]
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SUPABASE_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK');
const CLUB_ID      = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const NUM_REUNION  = Number(process.argv[2] || 8);

// --- Extraer el código real del template ---------------------------------
const html = readFileSync(new URL('../inscripciones.html', import.meta.url), 'utf8');
const start = html.indexOf('  const SEXO_TXT =');
const end   = html.indexOf('  function formatBolsa(');
if (start < 0 || end < 0 || end <= start) {
  console.error('✗ No se pudo extraer buildCond de inscripciones.html — ¿cambiaron los marcadores?');
  process.exit(1);
}
const src = html.slice(start, end);
const buildCond = new Function(`${src}\n return buildCond;`)();

// Réplica exacta del label de categoría del template (misma expresión que el render)
const oficialLabelOf = (cat) => cat
  ? (cat.es_oficial
      ? (cat.es_computable ? 'OFICIAL COMPUTABLE' : 'OFICIAL NO COMPUTABLE')
      : (cat.nombre || '').toUpperCase())
  : '';

// --- Datos: prod si hay credenciales, si no el fixture --------------------
// Con la publishable key RLS devuelve 0 filas para reuniones. Exportar
// SUPABASE_SECRET_KEY para correr contra prod; si no, se usa el snapshot.
let reunion, cars, fuente;
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (SECRET) {
  const sb = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });
  const { data: r, error: eR } = await sb.from('reuniones')
    .select('id,numero,fecha').eq('club_id', CLUB_ID).eq('numero', NUM_REUNION).single();
  if (eR) { console.error('[reunion]', eR); process.exit(1); }
  const { data: c, error: eC } = await sb.from('carreras')
    .select('id,numero_turno,nombre,distancia_metros,tipo_pista,edad_minima_anos,edad_maxima_anos,condicion_sexo,condicion_handicap,estado,categoria_id,categorias_carrera(nombre,es_oficial,es_computable)')
    .eq('reunion_id', r.id).order('numero_turno');
  if (eC) { console.error('[carreras]', eC); process.exit(1); }
  reunion = r; cars = c; fuente = 'prod';
} else {
  if (NUM_REUNION !== 8) {
    console.error(`✗ Sin SUPABASE_SECRET_KEY solo se puede verificar R8 (fixture). Pedida: R${NUM_REUNION}`);
    process.exit(1);
  }
  const fx = JSON.parse(readFileSync(new URL('./fixtures/r8_carreras.json', import.meta.url), 'utf8'));
  reunion = fx.reunion; cars = fx.carreras; fuente = 'fixture tests/fixtures/r8_carreras.json';
}

// --- Render + asserts -----------------------------------------------------
let fails = 0;
const fail = (msg) => { console.error(`  ✗ ${msg}`); fails++; };

console.log(`\nReunión ${reunion.numero} — ${reunion.fecha} — ${cars.length} turnos  [fuente: ${fuente}]\n`);

for (const car of cars) {
  const { texto, especial } = buildCond(car);
  const oficial = oficialLabelOf(car.categorias_carrera);
  const linea = `${especial ? 'ESPECIAL ' : ''}${texto}`;
  console.log(`T${String(car.numero_turno).padStart(2)}  ${linea}`);
  console.log(`     ${oficial}`);

  const hc = (car.condicion_handicap || '').trim();

  // 1. Sin truncar ni abreviar
  if (texto.includes('…')) fail(`T${car.numero_turno}: condición truncada con elipsis`);
  for (const abbr of ['perd ', 'perd', 'g.1c', 'g.2c']) {
    if (hc && !hc.toLowerCase().includes(abbr) && texto.split(/\s+/).includes(abbr)) {
      fail(`T${car.numero_turno}: quedó la abreviatura "${abbr}"`);
    }
  }
  // Todas las palabras del handicap (menos el "Especial" hoisteado y el punto final)
  // deben sobrevivir en el texto renderizado.
  if (hc) {
    const resto = hc.replace(/^especial(?:es)?\s*[:,-]?\s*/i, '').replace(/\s*\.\s*$/, '');
    for (const w of resto.split(/\s+/).filter(Boolean)) {
      if (!texto.toLowerCase().includes(w.toLowerCase())) {
        fail(`T${car.numero_turno}: falta la palabra "${w}" del texto de condición`);
      }
    }
  }
  // Sin duplicar el prefijo de sexo
  const dupTodo = (texto.toLowerCase().match(/todo\s+caballos?/g) || []).length;
  if (dupTodo > 1) fail(`T${car.numero_turno}: prefijo de sexo duplicado`);

  // 2. Especial hoisteado
  if (/^especial/i.test(hc)) {
    if (!especial) fail(`T${car.numero_turno}: condición especial no detectada`);
    if (/^\s*especial/i.test(texto)) fail(`T${car.numero_turno}: "Especial" quedó dentro del texto de condición`);
  } else if (especial) {
    fail(`T${car.numero_turno}: marcada como especial sin serlo`);
  }

  // 3. Etiqueta de categoría
  if (car.categoria_id && !oficial) fail(`T${car.numero_turno}: sin etiqueta de categoría`);
  if (car.categorias_carrera?.es_oficial) {
    const esperado = car.categorias_carrera.es_computable ? 'OFICIAL COMPUTABLE' : 'OFICIAL NO COMPUTABLE';
    if (oficial !== esperado) fail(`T${car.numero_turno}: etiqueta "${oficial}" ≠ "${esperado}"`);
  }
  // Distancia siempre presente
  if (car.distancia_metros && !texto.includes(`${car.distancia_metros} mts`)) {
    fail(`T${car.numero_turno}: falta la distancia`);
  }
}

console.log(`\n${fails === 0 ? '✓ OK' : `✗ ${fails} fallas`} — ${cars.length} turnos verificados\n`);
process.exit(fails === 0 ? 0 : 1);
