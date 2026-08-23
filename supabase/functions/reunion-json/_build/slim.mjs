#!/usr/bin/env node
/**
 * slim.mjs — variante del bundle SIN los comentarios de línea completa.
 *
 * Por qué existe: el deploy por MCP (`deploy_edge_function`) manda el fuente
 * inline en la llamada, y la llamada tiene un tope de ~32 KB. El bundle
 * comentado pesa 32.459 B ya escapado, o sea que no entra por unos cientos de
 * bytes. Esta variante saca las líneas que son 100 % comentario y entra holgada
 * (~15,9 KB).
 *
 * NO es una minificación: no toca identificadores, ni strings, ni saltos de
 * línea dentro del código. Sólo borra líneas que matchean /^\s*\/\//. Es seguro
 * porque el bundle no tiene ningún template literal multilínea (verificado:
 * cero líneas con backticks impares), así que ninguna línea que empiece con //
 * puede estar dentro de un string.
 *
 * El canónico para leer y revisar sigue siendo _build/index.ts. Este archivo se
 * regenera, no se edita:
 *   node supabase/functions/reunion-json/_build/build.mjs   # primero el bundle
 *   node supabase/functions/reunion-json/_build/slim.mjs    # después el slim
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const FUENTE = join(DIR, 'index.ts');
const SALIDA = join(DIR, 'index.slim.ts');

const full = readFileSync(FUENTE, 'utf8');
const shaFull = createHash('sha256').update(full).digest('hex');

// Guarda: si apareciera un template literal multilínea, una línea de adentro
// podría empezar con // y no ser un comentario. Abortar antes de romper nada.
const impares = full.split('\n').filter(l => ((l.match(/`/g) || []).length % 2) === 1);
if (impares.length) {
  console.error('FALLA: hay template literals multilínea. Stripping inseguro.');
  process.exit(1);
}

const cuerpo = full.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const header = [
  '// ============================================================',
  '// reunion-json — DEPLOY SLIM (generado, no editar)',
  '// ============================================================',
  '// Igual que _build/index.ts pero sin las líneas de comentario, para que',
  '// entre en el tope de ~32 KB del deploy inline por MCP.',
  '//   node supabase/functions/reunion-json/_build/slim.mjs',
  `// fuente : _build/index.ts`,
  `// sha256 : ${shaFull}`,
  '// ============================================================',
  '',
].join('\n');

const out = header + cuerpo;
writeFileSync(SALIDA, out, 'utf8');

const rel = (out.match(/from\s+'\.\.?\//g) || []).length;
const imports = (out.match(/^\s*import\s/gm) || []).length;

console.log('salida    :', SALIDA);
console.log('bytes     :', Buffer.byteLength(out), '(full:', Buffer.byteLength(full) + ')');
console.log('lineas    :', out.split('\n').length);
console.log('sha256 full   :', shaFull);
console.log('sha256 slim   :', createHash('sha256').update(out).digest('hex'));
console.log('imports relativos :', rel);
console.log('imports totales   :', imports);

if (rel) { console.error('\nFALLA: imports relativos.'); process.exit(1); }
if (imports !== 1) { console.error('\nFALLA: se esperaba exactamente 1 import.'); process.exit(1); }
if (!/Deno\.serve/.test(out)) { console.error('\nFALLA: falta Deno.serve.'); process.exit(1); }
if (!/es_computable === true/.test(out)) { console.error('\nFALLA: falta el filtro es_computable.'); process.exit(1); }
console.log('\nSLIM OK');
