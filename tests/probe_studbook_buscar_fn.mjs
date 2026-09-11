/**
 * Probe — studbook-buscar (Edge Function), pieza B: la lógica de consulta y clasificación,
 * extraída DEL ARCHIVO de la función (patrón _build/verify_build.mjs), corrida contra el Stud
 * Book real. No toca Supabase. Sin browser.
 *
 * Se toma el tramo entre `export function norm` y `// ------` previo a `Deno.serve`, se le quitan
 * los `export`, los tipos TS y las anotaciones, y se evalúa como JS. Si la función cambia, el
 * probe corre la función cambiada — no una copia.
 *
 * Casos (nombres reales del padrón de R9):
 *   1) EL MAS SABIO   → 1 exacto, 0 parciales, sexo macho, sb 431662, sin alertas
 *   2) BIEN COQUETA   → 2 exactos (2021 y 1998), ambos hembra — NO se elige: los dos vuelven
 *   3) MARIA CATU     → 0 exactos, ≥1 parcial que contiene MARIA CATULENGA (typo de planilla)
 *   4) bella doña     → 1 exacto por normalización (minúscula, ñ) → sb 403664
 *   5) ZZZZQ          → 0 / 0
 *   6) aCandidato con un hit de raza 3 y bandera extranjera → 2 alertas
 *   7) toISO / norm: casos borde
 *
 *   node tests/probe_studbook_buscar_fn.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'supabase', 'functions', 'studbook-buscar', 'index.ts'), 'utf8');

const ini = SRC.indexOf('export function norm');
const fin = SRC.indexOf('// ------------------------------------------------------------------\nDeno.serve');
if (ini < 0 || fin < 0) throw new Error('anclas no encontradas en index.ts');
let js = SRC.slice(ini, fin)
  .replace(/^export interface Candidato \{[\s\S]*?\n\}\n/m, '')          // interfaz TS
  .replace(/^export /gm, '')
  .replace(/const SEXO: Record<string, Candidato\['sexo'\]>/, 'const SEXO')
  .replace(/\(s: unknown\)/g, '(s)').replace(/\(h: any\)/g, '(h)').replace(/\(ddmmyyyy: unknown\)/g, '(ddmmyyyy)')
  .replace(/\(term: string\): Promise<any\[\]>/g, '(term)')
  .replace(/\(term: string, hits: any\[\]\): \{ exactos: Candidato\[\]; parciales: Candidato\[\] \}/g, '(term, hits)')
  .replace(/: string\[\] = \[\]/g, ' = []').replace(/: Candidato\[\] = \[\]/g, ' = []')
  .replace(/\(h\): Candidato/g, '(h)').replace(/\): string \{/g, ') {').replace(/\): string \| null \{/g, ') {');
if (/: (string|number|any|Candidato)\b/.test(js.replace(/\/\/.*$/gm, ''))) {
  throw new Error('quedaron anotaciones TS sin limpiar:\n' + js.split('\n').filter(l => /: (string|number|any|Candidato)\b/.test(l)).join('\n'));
}
const mod = new Function(js + '\nreturn { norm, toISO, aCandidato, autocomplete, clasificar };')();

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
const buscar = async (term) => mod.clasificar(term, await mod.autocomplete(term));

let r = await buscar('EL MAS SABIO');
ok('1) EL MAS SABIO → 1 exacto, 0 parciales', r.exactos.length === 1 && r.parciales.length === 0, `${r.exactos.length}/${r.parciales.length}`);
ok('1) … macho, sb 431662, 2021-10-26, Alazan, sin alertas', r.exactos[0]?.sexo === 'macho' && r.exactos[0]?.sb_id === '431662' && r.exactos[0]?.fecha_nacimiento === '2021-10-26' && r.exactos[0]?.color === 'Alazan' && r.exactos[0]?.alertas.length === 0, JSON.stringify(r.exactos[0]));

r = await buscar('BIEN COQUETA');
ok('2) BIEN COQUETA → 2 exactos (homónimas), no se elige', r.exactos.length === 2, `${r.exactos.length}`);
ok('2) … años 2021 y 1998, las dos hembra, con padres', new Set(r.exactos.map(c => c.fecha_nacimiento?.slice(0, 4))).size === 2 && r.exactos.every(c => c.sexo === 'hembra' && c.padrillo_nombre && c.madre_nombre), JSON.stringify(r.exactos.map(c => [c.fecha_nacimiento, c.padrillo_nombre, c.madre_nombre])));

r = await buscar('MARIA CATU');
ok('3) MARIA CATU → 0 exactos, parcial MARIA CATULENGA', r.exactos.length === 0 && r.parciales.some(c => c.nombre === 'MARIA CATULENGA'), JSON.stringify(r.parciales.map(c => c.nombre)));

r = await buscar('bella doña');
ok('4) "bella doña" → 1 exacto por normalización (sb 403664)', r.exactos.length === 1 && r.exactos[0].sb_id === '403664', JSON.stringify(r.exactos.map(c => c.sb_id)));

r = await buscar('ZZZZQ');
ok('5) ZZZZQ → 0 / 0', r.exactos.length === 0 && r.parciales.length === 0, `${r.exactos.length}/${r.parciales.length}`);

const c6 = mod.aCandidato({ id: 1, text: 'X', sexo: 'Hembra', pelo: 'Zaino', raza: 3, icon: '/img/banderas/239.png', nacimiento: '01/01/2020', padre: 'P', madre: 'M' });
ok('6) raza 3 + bandera extranjera → 2 alertas, pais_origen null', c6.alertas.length === 2 && c6.pais_origen === null, JSON.stringify(c6.alertas));
const c6b = mod.aCandidato({ id: 2, text: 'Y', sexo: 'Yegua?', raza: 4, icon: '/img/banderas/10.png', nacimiento: '' });
ok('6) sexo desconocido → sexo null + alerta; fecha vacía → null', c6b.sexo === null && c6b.alertas.some(a => a.startsWith('sexo desconocido')) && c6b.fecha_nacimiento === null, JSON.stringify([c6b.sexo, c6b.alertas, c6b.fecha_nacimiento]));

ok('7) norm("Bella Doña") === norm("BELLADONA")', mod.norm('Bella Doña') === mod.norm('BELLADONA'));
ok('7) toISO("15/10/2021") → 2021-10-15; toISO("x") → null', mod.toISO('15/10/2021') === '2021-10-15' && mod.toISO('x') === null);

for (const x of results) console.log(`${x.s} ${x.t}${x.n ? '  → ' + x.n : ''}`);
const fails = results.filter(x => x.s === '❌').length;
console.log(`\n${results.length - fails}/${results.length} asserts OK`);
process.exit(fails ? 1 : 0);
