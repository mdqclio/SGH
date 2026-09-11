/**
 * Probe — ganadas_desde / ganadas_hasta en carta-llamados.html (Stud Book, 11/09/2026).
 *
 * Sin browser: extrae del HTML real las dos líneas del payload y las dos de carga del modal y las
 * corre con un `document` stub. Lo que importa: "0" viaja como 0 (perdedores), vacío como null
 * ("o más" en hasta / no cargado), y al cargar un 0 del registro el input muestra "0", no "".
 * Sin red. Se puede correr siempre.
 *
 *   node tests/probe_ganadas_carta_llamados.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(HERE, '..', 'carta-llamados.html'), 'utf8');
const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

const payLines = HTML.split('\n').filter(l => /^\s*ganadas_(desde|hasta):\s*document\.getElementById/.test(l));
const loadLines = HTML.split('\n').filter(l => /document\.getElementById\('f-ganadas-(desde|hasta)'\)\.value = rec\?/.test(l));
ok('payload: 2 líneas ganadas_*', payLines.length === 2, String(payLines.length));
ok('carga del modal: 2 líneas', loadLines.length === 2, String(loadLines.length));
ok('inputs en el HTML', /id="f-ganadas-desde"/.test(HTML) && /id="f-ganadas-hasta"/.test(HTML));

function runPayload(desde, hasta) {
  const vals = { 'f-ganadas-desde': desde, 'f-ganadas-hasta': hasta };
  const document = { getElementById: id => ({ value: vals[id] }) };
  const body = 'return {' + payLines.join('\n') + '};';
  return new Function('document', body)(document);
}
function runLoad(rec) {
  const store = {};
  const document = { getElementById: id => ({ set value(v) { store[id] = v; }, get value() { return store[id]; } }) };
  new Function('document', 'rec', loadLines.join('\n'))(document, rec);
  return store;
}

let p = runPayload('0', '0');
ok('"0"/"0" → 0/0 (perdedores)', p.ganadas_desde === 0 && p.ganadas_hasta === 0, JSON.stringify(p));
p = runPayload('2', '');
ok('"2"/"" → 2/null (o más)', p.ganadas_desde === 2 && p.ganadas_hasta === null, JSON.stringify(p));
p = runPayload('', '');
ok('""/"" → null/null (no cargado)', p.ganadas_desde === null && p.ganadas_hasta === null, JSON.stringify(p));
p = runPayload('1', '2');
ok('"1"/"2" → 1/2', p.ganadas_desde === 1 && p.ganadas_hasta === 2, JSON.stringify(p));

let s = runLoad({ ganadas_desde: 0, ganadas_hasta: 0 });
ok('carga 0/0 muestra 0 y 0 (no "")', s['f-ganadas-desde'] === 0 && s['f-ganadas-hasta'] === 0, JSON.stringify(s));
s = runLoad({ ganadas_desde: 3, ganadas_hasta: null });
ok('carga 3/null muestra 3 y ""', s['f-ganadas-desde'] === 3 && s['f-ganadas-hasta'] === '', JSON.stringify(s));
s = runLoad(null);
ok('carga sin registro (alta) → "" y ""', s['f-ganadas-desde'] === '' && s['f-ganadas-hasta'] === '', JSON.stringify(s));

for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  → ' + r.n : ''}`);
const fails = results.filter(r => r.s === '❌').length;
console.log(`\n${results.length - fails}/${results.length} asserts OK`);
process.exit(fails ? 1 : 0);
