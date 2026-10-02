/**
 * Probe — el regex de datos personales de CLAUDE.md (sección "Datos personales: el repo es PÚBLICO").
 * Lee el regex de la línea `grep -nE '…'` de CLAUDE.md (no lo copia) y lo corre con `grep -E` real, igual que el
 * chequeo antes de cada push a reports. Imprime el NOMBRE de cada caso y no su valor: los valores (inventados) tienen
 * forma de DNI/CUIT/teléfono y no pueden ir a reports.
 *
 *   node tests/probe_regex_datos_personales.mjs
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const md = readFileSync(new URL('../CLAUDE.md', import.meta.url), 'utf8');
const linea = md.split('\n').find((l) => l.includes("git diff -U0 origin/reports..HEAD") && l.includes('grep -nE'));
const m = linea && /grep -nE '([^']+)'\s*$/.exec(linea);
if (!m) { console.error('no encontré el regex en CLAUDE.md'); process.exit(2); }
const RE = m[1];

// Valores inventados (no son de nadie). Una línea de texto como aparecería en un informe.
const CASOS = [
  ['DNI con puntos', 'el documento es 12.345.678 según la solicitud', true],
  ['CUIT sin guiones', 'cuit 20123456789 del propietario', true],
  ['celular de 10 dígitos', 'cel 2234567890', true],
  ['teléfono con guion', 'tel 116361-0222', true],
  ['CUIT con guiones', 'CUIT 20-12345678-9', true],
  ['monto con $ y puntos de miles', 'premio de $1.775.000 al ganador', false],
  ['SHA completo de commit', 'commit c39beda9969319c1eabc97b0731f172141209285', false],
  ['fecha ISO', 'fecha 2026-10-02', false],
  ['versión de migración (14 dígitos)', 'version 20261002020753', false],
];

let fails = 0;
console.log(`regex (de CLAUDE.md): ${RE.length} caracteres`);
for (const [nombre, texto, debe] of CASOS) {
  const r = spawnSync('grep', ['-E', RE], { input: texto + '\n', encoding: 'utf8' });
  const detecta = r.status === 0;
  const ok = detecta === debe;
  if (!ok) fails++;
  console.log(`${ok ? '✅' : '❌'} ${nombre}: ${detecta ? 'detecta' : 'no detecta'} (esperado: ${debe ? 'detecta' : 'no'})`);
}
console.log(`\n${CASOS.length - fails}/${CASOS.length} OK`);
process.exit(fails ? 1 : 0);
