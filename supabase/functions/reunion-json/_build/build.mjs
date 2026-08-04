#!/usr/bin/env node
// ============================================================
// Build del deploy de reunion-json — archivo único
// ============================================================
//   node supabase/functions/reunion-json/_build/build.mjs
//
// La Edge Function se deploya como UN solo archivo: el runtime no resuelve
// los imports relativos a ../_shared/*. Hasta la v15 había un único módulo
// para inlinear (studbook_format.mjs); ahora ese módulo importa a su vez
// mandil.mjs y chapas_map.mjs, así que son TRES. Un import relativo que
// sobreviva al build revienta la función en frío.
//
// Orden de inlineado = orden topológico de dependencias:
//   chapas_map.mjs  → sin deps
//   mandil.mjs      → sin deps
//   studbook_format.mjs → depende de los dos anteriores
//   index.ts        → depende de studbook_format
//
// El script verifica solo:
//   - que no quede ningún import relativo
//   - que no haya declaraciones top-level duplicadas entre módulos
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FN = join(AQUI, '..');
const SHARED = join(FN, '..', '_shared');
const SALIDA = join(AQUI, 'index.ts');

const RX_IMPORT_REL = /^\s*import\s.*from\s+['"]\.[^'"]*['"];?\s*$/gm;
const RX_IMPORT_EXT = /^\s*import\s.*from\s+['"]https?:[^'"]*['"];?\s*$/gm;

// Quita `export ` de las declaraciones top-level y los imports relativos.
function desmodularizar(src) {
  return src
    .replace(RX_IMPORT_REL, '')
    .replace(/^export\s+(function|const|let|class|async\s+function)\s/gm, '$1 ')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
}

// Nombres declarados en el top level, para detectar colisiones al concatenar.
function declaracionesTopLevel(src) {
  const out = new Set();
  const rx = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = rx.exec(src)) !== null) out.add(m[1]);
  return out;
}

const modulos = [
  { nombre: '_shared/chapas_map.mjs', path: join(SHARED, 'chapas_map.mjs') },
  { nombre: '_shared/mandil.mjs', path: join(SHARED, 'mandil.mjs') },
  { nombre: '_shared/studbook_format.mjs', path: join(SHARED, 'studbook_format.mjs') },
  { nombre: 'index.ts', path: join(FN, 'index.ts') },
];

const fuentes = modulos.map(m => ({ ...m, src: readFileSync(m.path, 'utf8') }));

// --- colisiones de nombres ---
const vistos = new Map();
const choques = [];
for (const f of fuentes) {
  for (const d of declaracionesTopLevel(f.src)) {
    if (vistos.has(d)) choques.push(`${d}: ${vistos.get(d)} vs ${f.nombre}`);
    else vistos.set(d, f.nombre);
  }
}
if (choques.length) {
  console.error('COLISIÓN de declaraciones top-level — el build sería inválido:');
  choques.forEach(c => console.error('  ' + c));
  process.exit(1);
}

// --- imports externos: se juntan y se emiten una sola vez arriba ---
const externos = new Set();
for (const f of fuentes) {
  for (const m of f.src.matchAll(RX_IMPORT_EXT)) externos.add(m[0].trim());
}

const partes = [];
partes.push('// ============================================================');
partes.push('// reunion-json — DEPLOY BUILD (archivo único, shared inlineado)');
partes.push('// ============================================================');
partes.push('// GENERADO. No editar a mano: se regenera con');
partes.push('//   node supabase/functions/reunion-json/_build/build.mjs');
partes.push('// Fuente: los 4 archivos listados abajo, inlineados en orden de');
partes.push('// dependencias. El runtime no resuelve imports relativos.');
partes.push('// ============================================================');
partes.push('');
partes.push([...externos].join('\n'));
partes.push('');
for (const f of fuentes) {
  partes.push(`// ---------- inline: ${f.nombre} ----------`);
  partes.push(desmodularizar(f.src).replace(RX_IMPORT_EXT, '').trim());
  partes.push('');
}

const build = partes.join('\n') + '\n';
writeFileSync(SALIDA, build, 'utf8');

// --- verificación del build ---
const relRestantes = build.match(RX_IMPORT_REL) || [];
const importsTotales = build.match(/^\s*import\s/gm) || [];

console.log('build     :', SALIDA);
console.log('bytes     :', build.length);
console.log('lineas    :', build.split('\n').length);
console.log('inlineados:', fuentes.map(f => f.nombre).join(', '));
console.log('imports externos :', [...externos].length, JSON.stringify([...externos]));
console.log('imports relativos restantes :', relRestantes.length,
            relRestantes.length ? JSON.stringify(relRestantes) : '(ninguno)');
console.log('lineas `import` en total    :', importsTotales.length);

if (relRestantes.length) {
  console.error('\nFALLA: quedaron imports relativos sin inlinear.');
  process.exit(1);
}
if (importsTotales.length !== externos.size) {
  console.error('\nFALLA: hay líneas `import` inesperadas.');
  process.exit(1);
}
console.log('\nBUILD OK');
