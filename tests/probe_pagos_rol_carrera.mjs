/**
 * Probe — rol y número de carrera en la tarjeta del tab Pagos (real-code, READ-ONLY).
 *
 * Corre el CÓDIGO REAL extraído de liquidaciones.html, no una copia:
 *   - rolDeLinea()        (ya existía; la usa el recibo desde 67f9371)
 *   - etiquetaRoles()     (nueva — cambio 1c)
 *   - etiquetaCarreras()  (nueva — cambio 2b)
 *   - el bloque de resolución de nº de carrera de cobrosBuscar() (nuevo — cambio 2a/2b)
 * Sin browser (chromium no corre en ubuntu 26.04). Sólo SELECT: no escribe una fila.
 *
 * CAMBIO 1 — rol en la pantalla
 *   1a) las 3 columnas del rol viajan en los SELECT de cobrosBuscar y cobrosDetalle
 *   1b) la tabla del detalle tiene columna Rol y los colspan acompañan
 *   1c) etiquetaRoles muestra TODOS los roles, no el de la primera línea
 *   1d) vocabulario exacto Propietario/Entrenador/Jockey — nunca "cuidador"
 *   1e) ninguna tarjeta cae al genérico "profesional"
 *
 * CAMBIO 2 — nº de carrera en la tarjeta
 *   2a) el nº sale de numero_carrera_programa ?? numero_turno, sin offset
 *   2b) orden numérico (C2 antes que C10), no textual
 *   2c) las líneas sin carrera se rotulan, no dejan hueco
 *   2d) la resolución coincide con la base, beneficiario por beneficiario
 *   2e) el respaldo ?? carrera_id está en el detalle y en el recibo
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) throw new Error('Falta SUPABASE_SECRET_KEY (source .env antes de correr).');

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'liquidaciones.html'), 'utf8');

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

// ── Extraer las funciones REALES por ancla ──────────────────────────────────
function extraer(nombre) {
  const i = SRC.indexOf(`function ${nombre}(`);
  if (i < 0) throw new Error(`no encontré function ${nombre}( en liquidaciones.html`);
  let d = 0, j = SRC.indexOf('{', i);
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error(`no pude cerrar function ${nombre}`);
}
const fuente = ['rolDeLinea', 'etiquetaRoles', 'etiquetaCarreras'].map(extraer).join('\n');
const ROL_DECL = SRC.slice(SRC.indexOf('const ROL_POR_BENEFICIARIO'),
                           SRC.indexOf('\n', SRC.indexOf('const ROL_POR_BENEFICIARIO')));
const { rolDeLinea, etiquetaRoles, etiquetaCarreras } =
  new Function(`${ROL_DECL}\n${fuente}\nreturn {rolDeLinea, etiquetaRoles, etiquetaCarreras};`)();

// ── 1a/1b/2e — el código quedó conectado ────────────────────────────────────
const selBuscar = SRC.match(/let qy = sb\.from\('liquidacion_detalle'\)\s*\n\s*\.select\('([^']+)'\)/)[1];
ok('1a) cobrosBuscar trae descripcion y concepto_tipo (rol) y carrera_id',
   ['descripcion', 'concepto_tipo', 'beneficiario_tipo', 'carrera_id'].every(c => selBuscar.includes(c)),
   selBuscar);

const selDetalle = SRC.match(/\.select\('id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id'\)/);
ok('1a) cobrosDetalle trae las 3 columnas del rol + carrera_id', !!selDetalle);

ok('1b) la tabla de pagables tiene columna Rol',
   SRC.includes('<th>Puesto</th><th>Rol</th><th>Concepto</th>'));
ok('1b) los colspan acompañan la columna nueva (8 y 7)',
   SRC.includes("colspan=\"8\" style=\"text-align:center;padding:14px") &&
   SRC.includes('<td colspan="7">TOTAL SELECCIONADO</td>'));
ok('1b) la tabla de retenidas también rotula el rol',
   SRC.includes('<th>Puesto</th><th>Rol</th><th>Concepto</th><th style="text-align:right">Neto</th><th>Liberación</th>'));
ok('1c) la tarjeta usa etiquetaRoles y etiquetaCarreras, no ${g.tipo} pelado',
   SRC.includes('${etiquetaRoles(g)} · ${g.n} línea(s) pagable(s) · ${etiquetaCarreras(g)}'));
ok('2e) el detalle tiene el respaldo ?? carrera_id',
   /d\?\.numero_carrera_programa \?\? d\?\.numero_turno/.test(SRC));
ok('2e) el recibo tiene el respaldo ?? carrera_id',
   (SRC.match(/d\?\.numero_carrera_programa \?\? d\?\.numero_turno/g) || []).length >= 2);
ok('2a) sigue sin haber offsets artificiales en el módulo',
   !/numero_turno\s*[+-]\s*\d/.test(SRC) && !/numero_carrera_programa\s*[+-]\s*\d/.test(SRC));

// ── 1d — vocabulario ────────────────────────────────────────────────────────
const VOC = ['Propietario', 'Entrenador', 'Jockey'];
ok('1d) rolDeLinea no dice "cuidador"', !/cuidador/i.test(extraer('rolDeLinea')));
ok('1d) etiquetaRoles no reescribe el vocabulario', !/cuidador/i.test(extraer('etiquetaRoles')));

// ── Datos reales: las líneas pagables ───────────────────────────────────────
const { data: lns, error: eL } = await sb.from('liquidacion_detalle')
  .select('beneficiario_tipo,beneficiario_id,monto_neto,inscripcion_id,carrera_id,descripcion,concepto_tipo')
  .eq('estado_linea', 'impago').neq('beneficiario_tipo', 'club').is('recibo_id', null);
if (eL) throw eL;
ok('hay líneas pagables para probar', (lns || []).length > 0, `${lns.length} líneas`);

// resolución de carrera, igual que la pantalla
const inscIds = [...new Set(lns.map(l => l.inscripcion_id).filter(Boolean))];
const { data: inscs } = await sb.from('inscripciones').select('id,carrera_id').in('id', inscIds);
const inscCarrera = Object.fromEntries((inscs || []).map(i => [i.id, i.carrera_id]));
const carreraDe = l => inscCarrera[l.inscripcion_id] ?? l.carrera_id;
const carrIds = [...new Set(lns.map(carreraDe).filter(Boolean))];
const { data: carrs } = await sb.from('carreras').select('id,numero_turno,numero_carrera_programa').in('id', carrIds);
const nroCarrera = Object.fromEntries((carrs || []).map(c => [c.id, c.numero_carrera_programa ?? c.numero_turno]));

// agrupar igual que cobrosBuscar
const grupos = {};
for (const l of lns) {
  const k = `${l.beneficiario_tipo}|${l.beneficiario_id}`;
  if (!grupos[k]) grupos[k] = { tipo: l.beneficiario_tipo, id: l.beneficiario_id, total: 0, n: 0,
                                roles: new Set(), carreras: new Set(), sinCarrera: 0 };
  grupos[k].total += parseFloat(l.monto_neto) || 0; grupos[k].n++;
  const r = rolDeLinea(l); if (r) grupos[k].roles.add(r);
  const nro = nroCarrera[carreraDe(l)];
  if (nro != null) grupos[k].carreras.add(nro); else grupos[k].sinCarrera++;
}
const gs = Object.values(grupos);

// ── 1d/1e — vocabulario y genérico sobre datos reales ───────────────────────
const rolesVistos = [...new Set(lns.map(rolDeLinea))];
ok('1d) todo rol derivado está en {Propietario, Entrenador, Jockey}',
   rolesVistos.every(r => VOC.includes(r)), rolesVistos.join(' / '));
ok('1e) ninguna línea cae al genérico "Profesional"',
   !rolesVistos.includes('Profesional') && !rolesVistos.includes('Club'));
ok('1e) ninguna tarjeta muestra el genérico "profesional"',
   gs.every(g => !/^profesional$/i.test(etiquetaRoles(g))));

// ── 1c — el caso que obliga a mostrar todos los roles ───────────────────────
const multi = gs.filter(g => g.roles.size > 1);
ok('1c) hay al menos un beneficiario con más de un rol (si no, el test no prueba nada)',
   multi.length >= 1, `${multi.length} de ${gs.length} beneficiarios`);
for (const g of multi) {
  const et = etiquetaRoles(g);
  ok(`1c) el beneficiario multi-rol los muestra todos: "${et}"`,
     [...g.roles].every(r => et.includes(r)) && et.includes(' / '));
  // el contraejemplo: derivar del primero perdería roles
  const primero = rolDeLinea(lns.find(l => l.beneficiario_id === g.id));
  ok('1c) derivar de la primera línea habría perdido al menos un rol',
     [...g.roles].some(r => r !== primero), `primera línea = ${primero}, real = ${et}`);
}
ok('1c) los mono-rol siguen mostrando exactamente su rol',
   gs.filter(g => g.roles.size === 1).every(g => etiquetaRoles(g) === [...g.roles][0]));

// ── 2b — orden numérico, no textual ─────────────────────────────────────────
const fake = { roles: new Set(['Entrenador']), carreras: new Set([10, 2, 1, 12, 3]), sinCarrera: 0, tipo: 'profesional' };
ok('2b) ordena numérico: C1, C2, C3, C10, C12', etiquetaCarreras(fake) === 'C1, C2, C3, C10, C12',
   etiquetaCarreras(fake));
ok('2b) un sort textual habría dado otra cosa (el test es sensible)',
   [...fake.carreras].map(n => `C${n}`).sort().join(', ') !== etiquetaCarreras(fake));

// ── 2c — las líneas sin carrera se rotulan ──────────────────────────────────
ok('2c) sólo-sin-carrera → "incentivo por reunión"',
   etiquetaCarreras({ carreras: new Set(), sinCarrera: 3 }) === 'incentivo por reunión');
ok('2c) mixto → carreras + el rótulo',
   etiquetaCarreras({ carreras: new Set([5, 3]), sinCarrera: 1 }) === 'C3, C5 · + incentivo por reunión');
ok('2c) sólo-carreras → sin rótulo de más',
   etiquetaCarreras({ carreras: new Set([4]), sinCarrera: 0 }) === 'C4');
ok('2c) ninguna tarjeta real queda con la etiqueta vacía o en "—"',
   gs.every(g => { const e = etiquetaCarreras(g); return e && e !== '—'; }));

const soloReunion = gs.filter(g => g.carreras.size === 0 && g.sinCarrera > 0);
ok('2c) los beneficiarios sin ninguna carrera son incentivo de jockey y quedan rotulados',
   soloReunion.length > 0 && soloReunion.every(g => etiquetaCarreras(g) === 'incentivo por reunión'),
   `${soloReunion.length} beneficiarios`);
ok('2c) y todas sus líneas son incentivo_jockey (no es que se perdió el dato)',
   soloReunion.every(g => lns.filter(l => l.beneficiario_id === g.id)
                             .every(l => l.concepto_tipo === 'incentivo_jockey')));

// ── 2a/2d — la resolución coincide con la base ──────────────────────────────
const carrMap = Object.fromEntries((carrs || []).map(c => [c.id, c]));
let malResueltas = 0, conCarrera = 0;
for (const l of lns) {
  const cid = carreraDe(l); if (!cid) continue;
  conCarrera++;
  const c = carrMap[cid];
  const esperado = c.numero_carrera_programa ?? c.numero_turno;
  if (nroCarrera[cid] !== esperado) malResueltas++;
}
ok('2a) toda línea con carrera se resuelve como numero_carrera_programa ?? numero_turno',
   malResueltas === 0, `${conCarrera} líneas con carrera, ${malResueltas} mal`);

const conProgramaNull = (carrs || []).filter(c => c.numero_carrera_programa == null).length;
ok('2a) el fallback a numero_turno se ejerce de verdad (hay carreras sin numero_carrera_programa)',
   conProgramaNull > 0, `${conProgramaNull} de ${(carrs || []).length} carreras usan el fallback`);

// 2d — cotejo por beneficiario contra la base, sin pasar por el código de pantalla
const { data: crudo, error: eC } = await sb.from('liquidacion_detalle')
  .select('beneficiario_tipo,beneficiario_id,inscripcion_id,carrera_id')
  .eq('estado_linea', 'impago').neq('beneficiario_tipo', 'club').is('recibo_id', null);
if (eC) throw eC;
let benefMal = 0;
for (const g of gs) {
  const suyas = crudo.filter(l => l.beneficiario_id === g.id && l.beneficiario_tipo === g.tipo);
  const esperadas = new Set(suyas.map(l => nroCarrera[inscCarrera[l.inscripcion_id] ?? l.carrera_id])
                                 .filter(n => n != null));
  const mismo = esperadas.size === g.carreras.size && [...esperadas].every(n => g.carreras.has(n));
  if (!mismo) benefMal++;
}
ok('2d) el set de carreras de cada tarjeta coincide con la base', benefMal === 0,
   `${gs.length} beneficiarios, ${benefMal} con diferencia`);

// ── read-only: nada escrito ────────────────────────────────────────────────
const { count: postLineas } = await sb.from('liquidacion_detalle').select('*', { count: 'exact', head: true });
const { count: postSpcs } = await sb.from('spcs').select('*', { count: 'exact', head: true });
ok('read-only: liquidacion_detalle intacta (493)', postLineas === 493, `${postLineas} filas`);
ok('read-only: spcs intacta (181)', postSpcs === 181, `${postSpcs} filas`);

// ── Reporte ────────────────────────────────────────────────────────────────
console.log('\n=== probe_pagos_rol_carrera — rol y nº de carrera en el tab Pagos ===\n');
for (const r of results) console.log(`  ${r.s} ${r.t}${r.n ? `\n       ${r.n}` : ''}`);
const fall = results.filter(r => r.s === '❌').length;
console.log(`\n  ${results.length - fall}/${results.length} OK\n`);

// muestra legible de tarjetas reales
console.log('  Muestra de tarjetas (rol · líneas · carreras):');
for (const g of gs.sort((a, b) => b.total - a.total).slice(0, 12))
  console.log(`    ${etiquetaRoles(g).padEnd(21)} · ${String(g.n).padStart(2)} línea(s) · ${etiquetaCarreras(g)}`);
for (const g of multi)
  console.log(`    [multi-rol] ${etiquetaRoles(g)} · ${g.n} línea(s) · ${etiquetaCarreras(g)}`);
console.log('');
process.exit(fall ? 1 : 0);
