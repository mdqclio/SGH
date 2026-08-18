/**
 * Probe — rótulo del rol en el recibo de Pagos (real-code, read-only).
 *
 * Corre la función REAL rolDeLinea() extraída de liquidaciones.html (no una copia) contra
 * las líneas reales de R8, y verifica que un recibo de propietario y uno de entrenador
 * salgan distinguibles. Sin browser. Sólo SELECT.
 *
 * Checks:
 *   a) el recibo trae las columnas del rol (descripcion, concepto_tipo, beneficiario_tipo)
 *   b) la tabla tiene columna Rol y el encabezado imprime el rol del beneficiario
 *   c) cada concepto_tipo de R8 se rotula bien, y ninguna línea queda sin rol
 *   d) un recibo de PROPIETARIO y uno de ENTRENADOR del mismo caballo/puesto se distinguen
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) throw new Error('Falta SUPABASE_SECRET_KEY (source .env antes de correr).');
const R8 = '7b6e003e-22e2-4629-bf55-f18560b1260f';

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'liquidaciones.html'), 'utf8');

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

// ── a) el SELECT del recibo trae las columnas del rol ───────────────────────
const desdeFn = SRC.indexOf('async function imprimirReciboCobro');
const selLinea = SRC.slice(desdeFn, SRC.indexOf('const reunIds=', desdeFn));   // ojo: 'const reunIds=' también existe en el recibo del otro tab
for (const col of ['descripcion', 'concepto_tipo', 'beneficiario_tipo']) {
  ok(`a) el SELECT del recibo trae ${col}`, selLinea.includes(col));
}

// ── b) la plantilla imprime el rol ──────────────────────────────────────────
ok('b) la tabla del recibo tiene columna Rol',
   /<th>Puesto<\/th><th>Rol<\/th><th>Concepto<\/th>/.test(SRC));
ok('b) el encabezado imprime el rol del beneficiario',
   SRC.includes('rolesLineas.length?` — <strong>${rolesLineas.join(\' / \')}</strong>`'));
ok('b) cada fila imprime el rol', SRC.includes('<td>${rolDeLinea(l)||\'—\'}</td>'));

// ── función REAL, extraída del archivo ─────────────────────────────────────
const desde = SRC.indexOf('const ROL_POR_BENEFICIARIO');
const hasta = SRC.indexOf('async function imprimirReciboCobro');
const rolDeLinea = new Function(`${SRC.slice(desde, hasta)}; return rolDeLinea;`)();

// ── c) rotulado sobre las líneas reales de R8 ──────────────────────────────
const { data: lns, error } = await sb.from('liquidacion_detalle')
  .select('concepto,descripcion,concepto_tipo,beneficiario_tipo,posicion,inscripcion_id,monto_neto')
  .eq('reunion_id', R8);
if (error) throw error;

const porTipo = {};
for (const l of lns) {
  const rol = rolDeLinea(l);
  (porTipo[l.concepto_tipo] ??= new Set()).add(rol || '(vacío)');
}
const esperado = {
  premio: null,                              // depende del beneficiario
  bono: 'Propietario',
  incentivo_entrenador: 'Entrenador',
  incentivo_jockey: 'Jockey',
  fondo_solidario: 'Club',
};
for (const [tipo, set] of Object.entries(porTipo)) {
  const vals = [...set].sort().join(', ');
  if (esperado[tipo]) ok(`c) ${tipo} → ${esperado[tipo]}`, vals === esperado[tipo], vals);
  else ok(`c) ${tipo} → roles derivados de descripcion`, !set.has('(vacío)'), vals);
}
ok('c) ninguna línea de R8 queda sin rol', lns.every(l => !!rolDeLinea(l)),
   `${lns.filter(l => !rolDeLinea(l)).length} sin rol de ${lns.length}`);

const premios = lns.filter(l => l.concepto_tipo === 'premio');
ok('c) los premios de propietario se rotulan Propietario',
   premios.filter(l => l.beneficiario_tipo === 'propietario').every(l => rolDeLinea(l) === 'Propietario'));
ok('c) los premios de profesional se rotulan Entrenador o Jockey',
   premios.filter(l => l.beneficiario_tipo === 'profesional')
          .every(l => ['Entrenador', 'Jockey'].includes(rolDeLinea(l))));

// ── d) el caso que reportó Valeria: mismo caballo y puesto, distinto rol ───
const porClave = {};
for (const l of premios) (porClave[`${l.inscripcion_id}|${l.posicion}`] ??= []).push(l);
const choque = Object.values(porClave).find(g =>
  g.some(l => l.beneficiario_tipo === 'propietario') && g.some(l => l.beneficiario_tipo === 'profesional'));
ok('d) hay un caballo/puesto con línea de propietario y de profesional', !!choque);

if (choque) {
  const prop = choque.find(l => l.beneficiario_tipo === 'propietario');
  const prof = choque.find(l => l.beneficiario_tipo === 'profesional');
  // lo que imprimía ANTES: sólo el concepto
  ok('d) ANTES las dos filas imprimían el mismo texto', prop.concepto === prof.concepto,
     prop.concepto);
  // lo que imprime AHORA: rol + concepto
  const celdaProp = `${rolDeLinea(prop)} | ${prop.concepto}`;
  const celdaProf = `${rolDeLinea(prof)} | ${prof.concepto}`;
  ok('d) AHORA se distinguen', celdaProp !== celdaProf, `${celdaProp}   vs   ${celdaProf}`);
  ok('d) el del propietario dice Propietario', rolDeLinea(prop) === 'Propietario');
  ok('d) el del profesional dice Entrenador o Jockey',
     ['Entrenador', 'Jockey'].includes(rolDeLinea(prof)), rolDeLinea(prof));
}

for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  → ' + r.n : ''}`);
const fail = results.filter(r => r.s === '❌').length;
console.log(`\n${results.length - fail}/${results.length} checks OK`);
process.exit(fail ? 1 : 0);
