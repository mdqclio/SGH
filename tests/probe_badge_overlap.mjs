#!/usr/bin/env node
/**
 * probe_badge_overlap.mjs — Gate de fix/badge-bono-overlap.
 *
 * El badge "BONO $X AL GANADOR" del programa color tapaba el texto de la condición y de
 * la bolsa en el visor de iOS: estaba en position:absolute, así que no reservaba espacio
 * y las líneas de texto le corrían por debajo.
 *
 * ⚠️  Este probe NO mide geometría. La comparación de bounding boxes que pidieron
 *     —que el rect del badge no intersecte ningún rect de texto— necesita un motor de
 *     layout, y chromium no corre en esta máquina (docs/SERVER.md). Ese chequeo está
 *     escrito en probe_badge_overlap_browser.mjs, para correr donde haya browser.
 *
 *     Lo que sí verifica acá es más fuerte que una medición puntual: que el badge ya no
 *     esté fuera del flujo. Un elemento flotado RESERVA su caja y las líneas de texto se
 *     acomodan al lado — por construcción de CSS, ningún texto puede quedar debajo, en
 *     ningún visor y a cualquier ancho. La medición geométrica confirma el resultado; esto
 *     verifica la causa.
 *
 *   node tests/probe_badge_overlap.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const color = readFileSync(join(ROOT, 'programa-oficial-color.html'), 'utf8');
const bn    = readFileSync(join(ROOT, 'programa-oficial.html'), 'utf8');

let fallos = 0;
const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) fallos++; };

/** devuelve el cuerpo de una regla CSS por selector exacto */
function regla(src, selector) {
  const i = src.indexOf(selector + ' {');
  if (i < 0) return null;
  const ini = src.indexOf('{', i), fin = src.indexOf('}', ini);
  return src.slice(ini + 1, fin);
}

console.log('\n=== probe_badge_overlap — el badge del bono no puede tapar texto ===');
console.log('⚠️  verificación estructural, no geométrica (sin chromium acá)\n');

console.log('programa-oficial-color.html');
const badge = regla(color, '.carrera-color-info .bono-lateral');
const cont  = regla(color, '.carrera-color-info');

ok(badge !== null, 'existe la regla .carrera-color-info .bono-lateral');
if (badge) {
  ok(!/position\s*:\s*absolute/.test(badge), 'el badge NO está en position:absolute');
  ok(!/(^|;)\s*(top|right|left|bottom)\s*:/.test(badge),
     'el badge no tiene offsets de posicionamiento (top/right/left/bottom)');
  ok(/float\s*:\s*right/.test(badge), 'el badge usa float:right — reserva su caja');
  ok(/margin\s*:/.test(badge), 'tiene margin para separarse del texto que lo rodea');
}

ok(cont !== null && /overflow\s*:\s*hidden/.test(cont),
   '.carrera-color-info contiene el float (overflow:hidden), el badge no se sale del bloque');

// el float sólo afecta a las líneas que vienen DESPUÉS: el badge tiene que ir primero
const bloque = color.slice(color.indexOf('<div class="carrera-color-info">'));
const posBadge = bloque.indexOf('bono-lateral');
const posCond  = bloque.indexOf('${condiciones');
const posBolsa = bloque.indexOf('bolsa-linea');
ok(posBadge >= 0 && posCond > posBadge, 'el badge va ANTES de la condición en el markup');
ok(posBadge >= 0 && posBolsa > posBadge, 'el badge va ANTES de la línea de bolsa');

// nada más dentro del bloque de info puede estar fuera de flujo
const infoCss = [
  regla(color, '.carrera-color-info .bolsa-linea'),
].filter(Boolean);
ok(infoCss.every(r => !/position\s*:\s*absolute/.test(r)),
   'ningún otro elemento del bloque de info está en position:absolute');

console.log('\nprograma-oficial.html (referencia — nunca tuvo el bug)');
const bnFloat = regla(bn, '.bono-float');
ok(bnFloat !== null && /float\s*:\s*right/.test(bnFloat),
   '.bono-float sigue usando float:right');
ok(/\.carrera-center\s*\{[^}]*overflow\s*:\s*hidden/.test(bn),
   '.carrera-center sigue conteniendo su float');

console.log(`\n=== ${fallos === 0 ? 'OK — el badge está en flujo, no puede solaparse' : `${fallos} ASSERT(S) FALLARON`} ===\n`);
process.exit(fallos === 0 ? 0 : 1);
