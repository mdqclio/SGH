/**
 * Probe — rol y número de carrera en la tarjeta del tab Pagos (real-code).
 *
 * Corre el CÓDIGO REAL extraído de liquidaciones.html, no una copia:
 *   - rolDeLinea()        (ya existía; la usa el recibo desde 67f9371)
 *   - etiquetaRoles()     (nueva — cambio 1c)
 *   - etiquetaCarreras()  (nueva — cambio 2b)
 *   - el bloque de resolución de nº de carrera de cobrosBuscar() (nuevo — cambio 2a/2b)
 * Sin browser (chromium no corre en ubuntu 26.04).
 *
 * ESCRIBE (desde 2026-09-24, issue #13) un fixture en la reunión 9999 —un profesional sintético
 * inactivo, su liquidación y 3 líneas impagas— para los casos que antes dependían de que prod
 * tuviera ese día un beneficiario multi-rol. Teardown en el finally; restore verificado por ESTADO
 * (tests/lib/estado_lineas.mjs), no contando filas. Nada de baselines fijos (GOTCHA #100).
 *
 * CAMBIO 1 — rol en la pantalla
 *   1a) cobrosDetalle REAL rinde el rol y la carrera de cada línea (fixture: Entrenador por
 *       inscripción, Jockey por reunión, Jockey con carrera_id sin inscripción)
 *   1b) la tabla del detalle tiene columna Rol y los colspan acompañan
 *   1c) etiquetaRoles muestra TODOS los roles, no el de la primera línea (fixture: cobrosBuscar
 *       REAL sobre la 9999 rinde la tarjeta del multi-rol como "Entrenador / Jockey")
 *   1d) vocabulario exacto Propietario/Entrenador/Jockey — nunca "cuidador"
 *   1e) ninguna tarjeta cae al genérico "profesional"
 *
 * CAMBIO 2 — nº de carrera en la tarjeta
 *   2a) el nº sale de numero_carrera_programa ?? numero_turno, sin offset
 *   2b) orden numérico (C2 antes que C10), no textual
 *   2c) las líneas sin carrera se rotulan, no dejan hueco
 *   2d) la resolución coincide con la base, beneficiario por beneficiario
 *   2e) el respaldo ?? carrera_id está en el detalle y en el recibo
 *
 * CACHEO — los mapas de carrera no se re-consultan con cada tecla
 *   C1) la primera búsqueda de una reunión arma los dos mapas
 *   C2) tecleando en el buscador: cero viajes al servidor
 *   C3) si el conjunto de líneas crece (liberar_linea, sacar el filtro) pide sólo los ids nuevos
 *   C4/C5) el negativo también se cachea: un id inexistente no se re-pide
 *   C6) cambiar de reunión invalida y rearma, y la reunión nueva vuelve a cachear
 *
 * MUTANTES (`--mutante=<nombre>` / `--mutantes`) de los asserts reescritos el 24/09:
 *   detalle_sin_rol      cobrosDetalle no trae descripcion/concepto_tipo   → 1a (rol) cae a "Profesional"
 *   detalle_sin_carrera  cobrosDetalle no trae carrera_id                  → 1a (C del respaldo) queda "—"
 *   roles_solo_primero   etiquetaRoles devuelve sólo el primer rol          → 1c
 *   teardown_sin_auditoria  el teardown no borra la auditoría del header    → restore: "no queda nada"
 *   teardown_sin_ficha      el teardown no borra el profesional sintético   → restore: "no queda nada"
 *   teardown_ensucia_9999   el probe toca una línea AJENA de la 9999        → restore por estado (2 asserts)
 * Después de los asserts de restore corre una red de seguridad que borra lo que haya quedado del
 * fixture, así que el mutante de teardown no deja basura.
 *
 * Uso:
 *   set -a; . ./.env; set +a
 *   node tests/probe_pagos_rol_carrera.mjs
 *   node tests/probe_pagos_rol_carrera.mjs --mutantes
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { snapshotLineas, diffLineas, restaurarLineas, describir } from './lib/estado_lineas.mjs';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) throw new Error('Falta SUPABASE_SECRET_KEY (source .env antes de correr).');

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
let SRC = readFileSync(join(HERE, '..', 'liquidaciones.html'), 'utf8');
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const R9999 = 'a0000000-0000-0000-0000-000000009999';

const SEL_DET = "'id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id,liquidaciones(club_id)'";
const MUTANTES = {
  detalle_sin_rol:     [SEL_DET, "'id,concepto,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id,liquidaciones(club_id)'"],
  detalle_sin_carrera: [SEL_DET, "'id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,liquidaciones(club_id)'"],
  roles_solo_primero:  ["function etiquetaRoles(g){ return [...g.roles].join(' / ') || g.tipo; }", "function etiquetaRoles(g){ return [...g.roles][0] || g.tipo; }"],
  // lado probe (ver teardown()). No hay mutante "se olvida una línea": liquidacion_detalle.liquidacion_id
  // es ON DELETE CASCADE, borrar el header arrastra las líneas — ese mutante sería equivalente.
  teardown_sin_auditoria: null,
  teardown_sin_ficha:     null,
  teardown_ensucia_9999:  null,
};
const args = process.argv.slice(2);
const mutArg = args.find(a => a.startsWith('--mutante='))?.split('=')[1];
if (args.includes('--mutantes')) {
  let vivos = 0;
  for (const m of Object.keys(MUTANTES)) {
    const r = spawnSync(process.execPath, [SELF, `--mutante=${m}`], { encoding: 'utf8', env: process.env });
    const murio = r.status !== 0; if (!murio) vivos++;
    const fallos = (r.stdout.match(/^\s*❌ .*$/gm) || []);
    console.log(`${murio ? '💀' : '🧟'} mutante ${m.padEnd(20)} → ${murio ? `muerto (${fallos.length} assert(s))` : 'VIVO — el probe no lo detecta'}`);
    fallos.slice(0, 4).forEach(f => console.log('     ' + f.trim()));
    if (murio && !fallos.length) console.log('     ' + (r.stderr || r.stdout).trim().split('\n').slice(-3).join(' | '));
  }
  console.log(`\n${Object.keys(MUTANTES).length - vivos}/${Object.keys(MUTANTES).length} mutantes muertos`);
  process.exit(vivos ? 1 : 0);
}
if (mutArg) {
  if (!(mutArg in MUTANTES)) { console.error(`mutante desconocido: ${mutArg}`); process.exit(2); }
  if (MUTANTES[mutArg]) {
    const [de, a] = MUTANTES[mutArg];
    if (!SRC.includes(de)) { console.error(`el mutante ${mutArg} no aplica`); process.exit(2); }
    SRC = SRC.replace(de, a);
  }
  console.log(`⚠ MUTANTE ${mutArg} aplicado`);
}

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

// 1a de cobrosDetalle: se verifica por COMPORTAMIENTO con el fixture de la 9999 (sección F, al final).
// Antes buscaba el literal del .select y se rompió cuando ISSUE-060 le agregó liquidaciones(club_id).

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
// El caso multi-rol ya NO se exige a los datos de prod (el único, tipo 'ambos', cobró y el assert
// quedó rojo sin que hubiera bug): se garantiza con el fixture de la sección F. Si prod tiene alguno
// hoy, se chequea igual.
const multi = gs.filter(g => g.roles.size > 1);
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

// ── C) CACHEO — el bloque real de cobrosBuscar contra un sb que cuenta viajes ───
// Motivo del cacheo: cobrosBuscar se dispara con cada tecla (debounce 300 ms). Los dos mapas
// nuevos no dependen del texto, sólo del scope de reunión → se cachean como cobCaballerizas.
const CACHE_INI = '// ═══ CACHE MAPAS CARRERA — INICIO';
const CACHE_FIN = '// ═══ CACHE MAPAS CARRERA — FIN ═══';
const iIni = SRC.indexOf(CACHE_INI), iFin = SRC.indexOf(CACHE_FIN);
if (iIni < 0 || iFin < 0) throw new Error('no encontré el bloque de cache en cobrosBuscar');
const bloqueCache = SRC.slice(SRC.indexOf('\n', iIni) + 1, iFin);

ok('C0) las vars del cache son de módulo, al lado de cobCaballerizas',
   /let cobCaballerizas = \[\];[\s\S]{0,600}let cobInscCarrera = \{\};/.test(SRC) &&
   /let cobNroCarrera\s+= \{\};/.test(SRC) && /let cobMapsScope\s+= null;/.test(SRC));
ok('C0) el bloque invalida cuando cambia la reunión', /if \(cobMapsScope !== rid\)/.test(bloqueCache));
ok('C0) el bloque pide sólo lo que falta (no el universo entero)',
   /!\(i in cobInscCarrera\)/.test(bloqueCache) && /!\(c in cobNroCarrera\)/.test(bloqueCache));

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const correr = new AsyncFunction('sb', 'rid', 'lineas', 'st', `
  let cobInscCarrera = st.i, cobNroCarrera = st.n, cobMapsScope = st.s;
${bloqueCache}
  st.i = cobInscCarrera; st.n = cobNroCarrera; st.s = cobMapsScope;
  return { nroCarrera, carreraDe };
`);

let viajes = [];
const stubSb = { from(tabla){ return { select(){ return { in(_col, ids){
  viajes.push({ tabla, ids: [...ids] });
  const filas = tabla === 'inscripciones' ? (inscs || []) : (carrs || []);
  return Promise.resolve({ data: filas.filter(f => ids.includes(f.id)), error: null });
} }; } }; } };

// coherencia con el camino sin cache ya calculado arriba (inscCarrera / nroCarrera / carreraDe)
const resuelveIgual = (r, ls) => ls.every(l => (r.nroCarrera[r.carreraDe(l)] ?? null) === (nroCarrera[carreraDe(l)] ?? null));

const st = { i: {}, n: {}, s: null };
const subset = lns.slice(0, Math.min(20, lns.length));

viajes = []; const rA = await correr(stubSb, 'R1', subset, st);
const viajesA = viajes.map(v => v.tabla);
ok('C1) primera búsqueda de la reunión: consulta inscripciones y carreras',
   viajesA.includes('inscripciones') && viajesA.includes('carreras'), viajesA.join(' + '));
ok('C1) y resuelve igual que el camino sin cache', resuelveIgual(rA, subset));

viajes = []; const rB = await correr(stubSb, 'R1', subset, st);
ok('C2) tecleando lo mismo en la misma reunión: CERO viajes al servidor',
   viajes.length === 0, `${viajes.length} consultas`);
ok('C2) y el resultado no cambió', resuelveIgual(rB, subset));

viajes = []; const rC = await correr(stubSb, 'R1', lns, st);
const pedidosC = viajes.flatMap(v => v.ids);
const yaCacheadasC = new Set(subset.map(l => l.inscripcion_id).filter(Boolean));
ok('C3) al ampliar el conjunto pide sólo los ids nuevos, no los ya cacheados',
   lns.length === subset.length || (pedidosC.length > 0 && !pedidosC.some(id => yaCacheadasC.has(id))),
   `${pedidosC.length} ids pedidos en ${viajes.length} consultas`);
ok('C3) y el mapa ampliado sigue coincidiendo con la base', resuelveIgual(rC, lns));

viajes = []; const rD = await correr(stubSb, 'R1', lns, st);
ok('C4) repetir la búsqueda completa: CERO viajes', viajes.length === 0, `${viajes.length} consultas`);
ok('C4) y sigue resolviendo bien', resuelveIgual(rD, lns));

// negativo cacheado: un id que la base no devuelve no se re-pide en cada tecla
const FANTASMA = { inscripcion_id: '00000000-0000-0000-0000-000000000000', carrera_id: null };
viajes = []; await correr(stubSb, 'R1', [...lns, FANTASMA], st);
const pedidoFantasma = viajes.flatMap(v => v.ids).includes(FANTASMA.inscripcion_id);
viajes = []; await correr(stubSb, 'R1', [...lns, FANTASMA], st);
ok('C5) el id que no existe se pide una vez y queda cacheado en negativo',
   pedidoFantasma && viajes.length === 0, `${viajes.length} consultas en la segunda vuelta`);

// invalidación por reunión: cambiar de reunión tiene que rearmar los mapas
viajes = []; const rE = await correr(stubSb, 'R2', lns, st);
ok('C6) cambiar de reunión invalida el cache y vuelve a consultar',
   viajes.length >= 2 && viajes.map(v => v.tabla).includes('inscripciones'),
   `${viajes.length} consultas, scope = ${st.s}`);
ok('C6) el scope guardado es la reunión nueva', st.s === 'R2');
ok('C6) los mapas rearmados vuelven a coincidir con la base', resuelveIgual(rE, lns));

viajes = []; await correr(stubSb, 'R2', lns, st);
ok('C6) y la reunión nueva también cachea (segunda tecla: cero viajes)', viajes.length === 0,
   `${viajes.length} consultas`);

// ── F) FIXTURE en la 9999: 1a (cobrosDetalle) y 1c (multi-rol) por COMPORTAMIENTO ─────────────
// Un profesional sintético INACTIVO (no aparece en ningún select de la UI), su liquidación en la
// 9999 y 3 líneas impagas:
//   F1 premio "— Entrenador" con inscripción de la 9999   → rol Entrenador, carrera por inscripción
//   F2 incentivo_jockey sin inscripción ni carrera          → rol Jockey, carrera "—"
//   F3 premio "— Jockey" SIN inscripción, CON carrera_id    → rol Jockey, carrera por el respaldo
// Lo esperado sale de la base en esta corrida (numero_carrera_programa ?? numero_turno), no de
// números escritos acá. Reemplaza a los viejos "read-only: … intacta (493)/(181)": contar filas
// globales contra un número fijo caducó solo (GOTCHA #100) y, en una base viva, contar la tabla
// entera antes/después tampoco prueba nada (GOTCHA #77) — se verifica el ESTADO de lo que el probe
// toca: la 9999 línea por línea, y que del fixture no quede nada (líneas, header, auditoría, ficha).
function extraerFirma(firma) {
  const i = SRC.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  // el cuerpo arranca en el "){" que cierra la firma: un default `opts = {}` no es el cuerpo
  const cuerpo = SRC.indexOf('){', i);
  if (cuerpo < 0 || cuerpo > SRC.indexOf('\n', i)) throw new Error(`firma sin "){" en su línea: ${firma}`);
  let d = 0;
  for (let k = cuerpo + 1; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error(`no pude cerrar: ${firma}`);
}
const bloqueEntre = (ini, fin) => { const i = SRC.indexOf(ini), j = SRC.indexOf(fin, i); if (i < 0 || j < 0) throw new Error(`no encontré ${ini}`); return SRC.slice(SRC.indexOf('\n', i) + 1, j); };
const escapeHtml = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => '$' + Number(n).toFixed(2);
function mkDocument(campos) {
  const nodos = {};
  const get = id => (nodos[id] ||= { value: campos[id] ?? '', innerHTML: '', textContent: '', style: {}, classList: { add(){}, remove(){}, toggle(){} }, scrollIntoView(){} });
  Object.keys(campos).forEach(get); ['cob-detalle', 'cob-beneficiarios'].forEach(get);
  return { getElementById: id => get(id), _n: nodos, querySelectorAll: () => [] };
}
const fuenteCob = [
  ROL_DECL, extraerFirma('function rolDeLinea(l)'), extraerFirma('function nombreBenef(tipo, id)'),
  bloqueEntre('// ═══ MATCHEO DEL BUSCADOR — ANCLAS DEL PROBE', '// ═══ MATCHEO DEL BUSCADOR — FIN ═══'),
  extraerFirma('function benefSearch(tipo, id)'), extraerFirma('function etiquetaRoles(g)'), extraerFirma('function etiquetaCarreras(g)'),
  extraerFirma('async function cobCargarReunPrueba()'), extraerFirma('function cobVisible(l, rid)'), extraerFirma('function cobDelClub(l)'),
  bloqueEntre('// ═══ VISTA POR CARRERA — INICIO', '// ═══ VISTA POR CARRERA — FIN ═══'), extraerFirma('async function cobrosBuscar()'),
  SRC.slice(SRC.indexOf('const GRUPO_DE_TIPO_COB'), SRC.indexOf('\n\n', SRC.indexOf('const ORDEN_GRUPOS_COB'))),
  extraerFirma('function grupoDeTipo(t)'), extraerFirma('function rotuloGrupo(grupo, tipos)'), extraerFirma('function cobrosGruposPresentes()'),
  extraerFirma('function cobChecked(l, selPrevia, idsPrevios, filtro)'), extraerFirma('async function cobrosDetalle(tipo, id, opts = {})'),
].join('\n\n');
async function pantalla(profesionalesMap) {
  const document = mkDocument({ 'cob-q': '', 'cob-reunion': R9999, 'cob-carrera': '' });
  const api = await new AsyncFunction('sb', 'CLUB_ID', 'document', 'toast', 'fmt', 'escapeHtml', 'propietariosMap', 'profesionales',
    `let cobCaballerizas = [], cobInscCarrera = {}, cobNroCarrera = {}, cobMapsScope = null, cobReunPrueba = null;
     let cobLineas = [], cobBenef = null, cobApoderados = [], cobFiltro = 'todo';
     function cobLimpiarPanelRecibo(){}   // DOM puro (panel del recibo emitido)
     function cobrosFiltrar(){}           // DOM puro (chips/aviso sobre el HTML ya puesto)
     ${fuenteCob}
     return { cobrosBuscar, cobrosDetalle };`)(sb, CLUB_ID, document, m => { throw new Error('toast: ' + m); }, fmt, escapeHtml, {}, profesionalesMap);
  return { api, document };
}
const unesc = x => String(x).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const filasDetalle = html => [...html.matchAll(/<tr class="cob-row"[^>]*>([\s\S]*?)<\/tr>/g)].map(m => {
  const td = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(t => unesc(t[1].replace(/<[^>]+>/g, '').trim()));
  const id = /value="([^"]+)"/.exec(m[1])?.[1];
  return { id, fecha: td[1], carrera: td[2], caballo: td[3], puesto: td[4], rol: td[5], concepto: td[6], neto: td[7] };
});

const tag = `PROBE-ROL-${Date.now()}`;
const fx = { prof: null, liq: null, lineas: [] };
const antes9999 = await snapshotLineas(sb, R9999);
const { data: car9999, error: eCar } = await sb.from('carreras').select('id,numero_turno,numero_carrera_programa').eq('reunion_id', R9999).order('numero_turno');
if (eCar) throw eCar;
const { data: ins9999, error: eIns } = await sb.from('inscripciones').select('id,carrera_id').in('carrera_id', car9999.map(c => c.id));
if (eIns) throw eIns;
const cA = car9999.find(c => ins9999.some(i => i.carrera_id === c.id));
const cB = car9999.find(c => c.id !== cA?.id);
if (!cA || !cB) throw new Error('la 9999 no tiene dos carreras (una con inscripciones) para armar el fixture');
const inscA = ins9999.find(i => i.carrera_id === cA.id);
const nroDe = c => c.numero_carrera_programa ?? c.numero_turno;

async function teardown() {
  const ids = fx.lineas.map(l => l.id);
  if (ids.length) await sb.from('liquidacion_detalle').delete().in('id', ids);
  if (fx.liq) {
    await sb.from('liquidaciones').delete().eq('id', fx.liq.id);
    // el DELETE del header dispara trg_audit_liquidaciones: la auditoría se borra DESPUÉS
    if (mutArg !== 'teardown_sin_auditoria') await sb.from('auditoria').delete().eq('registro_id', fx.liq.id);
  }
  if (fx.prof && mutArg !== 'teardown_sin_ficha') await sb.from('profesionales').delete().eq('id', fx.prof.id);
  if (mutArg === 'teardown_ensucia_9999') {
    const ajena = Object.keys(antes9999)[0];
    if (ajena) await sb.from('liquidacion_detalle').update({ pagado_at: new Date().toISOString() }).eq('id', ajena);
  }
}
async function quedoDelFixture() {
  const [l, h, a, p] = await Promise.all([
    fx.liq ? sb.from('liquidacion_detalle').select('id').eq('liquidacion_id', fx.liq.id) : { data: [] },
    fx.liq ? sb.from('liquidaciones').select('id').eq('id', fx.liq.id) : { data: [] },
    fx.liq ? sb.from('auditoria').select('id').eq('registro_id', fx.liq.id) : { data: [] },
    fx.prof ? sb.from('profesionales').select('id').eq('id', fx.prof.id) : { data: [] },
  ]);
  return { lineas: l.data?.length ?? -1, header: h.data?.length ?? -1, auditoria: a.data?.length ?? -1, ficha: p.data?.length ?? -1 };
}
try {
  const { data: prof, error: eP } = await sb.from('profesionales')
    .insert({ club_id: CLUB_ID, tipo: 'ambos', apellido: 'PROBE', nombre: tag, activo: false, notas: `${tag} — fixture de tests/probe_pagos_rol_carrera.mjs, se borra solo` })
    .select('id,apellido,nombre,tipo').single();
  if (eP) throw eP; fx.prof = prof;
  const { data: liq, error: eH } = await sb.from('liquidaciones')
    .insert({ club_id: CLUB_ID, reunion_id: R9999, profesional_id: prof.id, estado: 'borrador' }).select('id').single();
  if (eH) throw eH; fx.liq = liq;
  const base = { liquidacion_id: liq.id, reunion_id: R9999, beneficiario_tipo: 'profesional', beneficiario_id: prof.id, estado_linea: 'impago', monto_descuento: 0 };
  const { data: lineas, error: eD } = await sb.from('liquidacion_detalle').insert([
    { ...base, concepto_tipo: 'premio', concepto: `Carrera ${nroDe(cA)} — 1° puesto`, descripcion: `Carrera ${nroDe(cA)} — 1° puesto — Entrenador (${tag})`, monto_bruto: 1000, posicion: 1, inscripcion_id: inscA.id, carrera_id: cA.id, orden_display: 1 },
    { ...base, concepto_tipo: 'incentivo_jockey', concepto: 'Incentivo jockey', descripcion: `Incentivo jockey (${tag})`, monto_bruto: 600, orden_display: 2 },
    { ...base, concepto_tipo: 'premio', concepto: `Carrera ${nroDe(cB)} — 2° puesto`, descripcion: `Carrera ${nroDe(cB)} — 2° puesto — Jockey (${tag})`, monto_bruto: 300, posicion: 2, inscripcion_id: null, carrera_id: cB.id, orden_display: 3 },
  ]).select('id,concepto_tipo');
  if (eD) throw eD; fx.lineas = lineas;

  const profMap = { ...Object.fromEntries((await sb.from('profesionales').select('id,apellido,nombre,tipo,documento_nro').eq('club_id', CLUB_ID)).data.map(p => [p.id, p])), [prof.id]: prof };
  // 1a — cobrosDetalle REAL
  const { api, document } = await pantalla(profMap);
  await api.cobrosDetalle('profesional', prof.id);
  const filas = filasDetalle(document._n['cob-detalle'].innerHTML);
  const f = k => filas.find(r => r.id === lineas[k].id);
  ok(`1a) cobrosDetalle rinde las ${lineas.length} líneas del fixture`, filas.length === lineas.length && lineas.every((_, k) => f(k)), `${filas.length} filas`);
  ok('1a) premio con inscripción → Rol "Entrenador", Carrera por la inscripción', f(0)?.rol === 'Entrenador' && f(0)?.carrera === `C${nroDe(cA)}`, JSON.stringify(f(0)));
  ok('1a) incentivo de jockey por reunión → Rol "Jockey", Carrera "—"', f(1)?.rol === 'Jockey' && f(1)?.carrera === '—', JSON.stringify(f(1)));
  ok('1a) premio sin inscripción → Rol "Jockey", Carrera por el respaldo carrera_id', f(2)?.rol === 'Jockey' && f(2)?.carrera === `C${nroDe(cB)}`, JSON.stringify(f(2)));
  // 1c — cobrosBuscar REAL sobre la 9999: la tarjeta del multi-rol
  const { api: api2, document: doc2 } = await pantalla(profMap);
  await api2.cobrosBuscar();
  const nombre = `${prof.apellido}, ${prof.nombre}`;
  const tarj = [...doc2._n['cob-beneficiarios'].innerHTML.matchAll(/<div class="liq-prof">([^<]*)<\/div><div class="liq-recibo">([^<]*)<\/div>/g)]
    .map(m => ({ nombre: unesc(m[1]), info: unesc(m[2]) })).find(t => t.nombre === nombre);
  ok('1c) la tarjeta del beneficiario multi-rol muestra TODOS sus roles: "Entrenador / Jockey"', /^Entrenador \/ Jockey · 3 línea\(s\) pagable\(s\) · /.test(tarj?.info || ''), tarj?.info || 'sin tarjeta');
  ok('1c) y sus carreras + el rótulo del incentivo por reunión', tarj?.info?.endsWith(`· ${[nroDe(cA), nroDe(cB)].sort((a, b) => a - b).map(n => `C${n}`).join(', ')} · + incentivo por reunión`), tarj?.info);
} finally {
  await teardown();
  const quedo = await quedoDelFixture();
  ok('restore: del fixture no queda nada (líneas, header, auditoría del header, ficha)', quedo.lineas === 0 && quedo.header === 0 && quedo.auditoria === 0 && quedo.ficha === 0, JSON.stringify(quedo));
  const despues = await snapshotLineas(sb, R9999);
  const arregladas = await restaurarLineas(sb, antes9999, despues);
  const v = diffLineas(antes9999, await snapshotLineas(sb, R9999));
  ok('restore: la 9999 quedó línea por línea como al arrancar (por estado)', diffLineas(antes9999, despues).limpio, describir(diffLineas(antes9999, despues)));
  ok('restore: no hubo que restaurar ninguna línea ajena', arregladas === 0, `${arregladas} restauradas`);
  // red de seguridad: pase lo que pase arriba (mutante incluido), no queda basura
  if (fx.liq) { await sb.from('liquidacion_detalle').delete().eq('liquidacion_id', fx.liq.id); await sb.from('liquidaciones').delete().eq('id', fx.liq.id); await sb.from('auditoria').delete().eq('registro_id', fx.liq.id); }
  if (fx.prof) await sb.from('profesionales').delete().eq('id', fx.prof.id);
  const final = await quedoDelFixture();
  console.log(`  [red de seguridad] fixture al final: ${JSON.stringify(final)} · 9999 ${v.limpio ? 'limpia' : describir(v)}`);
  if (final.lineas || final.header || final.auditoria || final.ficha) { console.error('❌ QUEDÓ BASURA DEL FIXTURE EN PROD', JSON.stringify(final), JSON.stringify(fx)); process.exitCode = 3; }
}


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
process.exit(fall ? 1 : (process.exitCode || 0));
