#!/usr/bin/env node
/**
 * probe_orden_ui.mjs — Gate 2 de feat/orden-llamados.
 *
 * Corre la lógica REAL de reordenamiento extraída de carta-llamados.html (patrón
 * tests/README.md: sin browser, extrayendo el cuerpo de las funciones y ejecutándolas
 * con dependencias inyectadas). Verifica que el payload que la UI le manda a la RPC
 * `reordenar_turnos` es el correcto, y que la barra de guardado aparece cuando debe.
 *
 * No escribe nada: la RPC se stubea. La escritura real ya está cubierta por
 * probe_reordenar_turnos.mjs contra R9.
 *
 *   T1  carrerasEnOrden respeta la propuesta en memoria
 *   T2  moverTurno sube y baja, y no se pasa de los extremos
 *   T3  llamadosMovidos cuenta contra el numero_turno persistido
 *   T4  huecos de un borrado marcan la lista como sucia sin haber tocado nada
 *   T5  el payload a la RPC es 1..N en el orden de la vista
 *   T6  descartarOrden vuelve al orden de la DB
 *
 *   node tests/probe_orden_ui.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- extracción del código real (balance de llaves) ---------- */
function extractFn(src, name) {
  const start = src.search(new RegExp(`(async )?function ${name}\\(`));
  if (start < 0) throw new Error(`no se encontró function ${name}( en el HTML`);
  let depth = 0;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error(`llaves desbalanceadas en ${name}`);
}

const html = readFileSync(join(ROOT, 'carta-llamados.html'), 'utf8');
const FUENTES = ['carrerasEnOrden', 'llamadosMovidos', 'moverTurno', 'descartarOrden', 'guardarOrden']
  .map(n => extractFn(html, n)).join('\n');

// `ordenSucio` es una arrow const, no function: se extrae aparte
const ordenSucioSrc = html.match(/const ordenSucio = [^\n]+/)[0];

/**
 * Monta el módulo con estado y dependencias inyectadas. Devuelve un handle para
 * inspeccionar el estado interno, que en el HTML son `let` de módulo.
 */
function montar(carreras, { rpc, confirmar = () => true } = {}) {
  const estado = { renders: 0, toasts: [], confirms: [], rpcCalls: [], recargado: false };

  const fabricar = new Function(
    'carreras', 'renderCarreras', 'renderOrdenBar', 'document',
    'sb', 'toast', 'confirm', 'reunionId', 'recargarCarreras', 'console',
    `let ordenPropuesto = null;
     ${FUENTES}
     ${ordenSucioSrc}
     return {
       carrerasEnOrden, llamadosMovidos, moverTurno, descartarOrden, guardarOrden, ordenSucio,
       get ordenPropuesto() { return ordenPropuesto; },
       set ordenPropuesto(v) { ordenPropuesto = v; },
     };`,
  );

  estado.api = fabricar(
    carreras,
    () => { estado.renders++; },
    () => {},
    { getElementById: () => null },
    { rpc: async (fn, args) => { estado.rpcCalls.push({ fn, args }); return rpc ? rpc(args) : { data: null, error: null }; } },
    (m, t) => estado.toasts.push({ m, t }),
    (m) => { estado.confirms.push(m); return confirmar(m); },
    'REUNION-TEST',
    async () => { estado.recargado = true; },
    console,
  );
  return estado;
}

const carrerasFalsas = (turnos) => turnos.map(t => ({ id: `c${t}`, numero_turno: t, nombre: `Llamado ${t}` }));

let fallos = 0;
const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) fallos++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${m}${JSON.stringify(a) === JSON.stringify(b) ? '' : `\n       esperado: ${JSON.stringify(b)}\n       obtenido: ${JSON.stringify(a)}`}`);

console.log('\n=== probe_orden_ui — lógica de reordenamiento de carta-llamados.html ===\n');

console.log('T1 — carrerasEnOrden');
{
  const { api } = montar(carrerasFalsas([1, 2, 3]));
  eq(api.carrerasEnOrden().map(c => c.id), ['c1', 'c2', 'c3'], 'sin propuesta devuelve el orden de la DB');
  api.ordenPropuesto = ['c3', 'c1', 'c2'];
  eq(api.carrerasEnOrden().map(c => c.id), ['c3', 'c1', 'c2'], 'con propuesta devuelve el orden propuesto');
}

console.log('\nT2 — moverTurno');
{
  const { api } = montar(carrerasFalsas([1, 2, 3, 4]));
  api.moverTurno('c3', -1);
  eq(api.carrerasEnOrden().map(c => c.id), ['c1', 'c3', 'c2', 'c4'], 'subir mueve una posición');
  api.moverTurno('c3', 1);
  eq(api.carrerasEnOrden().map(c => c.id), ['c1', 'c2', 'c3', 'c4'], 'bajar deshace el movimiento');
  api.moverTurno('c1', -1);
  eq(api.carrerasEnOrden().map(c => c.id), ['c1', 'c2', 'c3', 'c4'], 'subir el primero no hace nada');
  api.moverTurno('c4', 1);
  eq(api.carrerasEnOrden().map(c => c.id), ['c1', 'c2', 'c3', 'c4'], 'bajar el último no hace nada');
  api.moverTurno('inexistente', 1);
  eq(api.carrerasEnOrden().map(c => c.id), ['c1', 'c2', 'c3', 'c4'], 'id inexistente no rompe');
}

console.log('\nT3 — llamadosMovidos');
{
  const { api } = montar(carrerasFalsas([1, 2, 3, 4]));
  eq(api.llamadosMovidos(), 0, 'orden intacto: 0 movidos');
  ok(!api.ordenSucio(), 'orden intacto no está sucio');
  api.moverTurno('c1', 1);   // c2 c1 c3 c4 → dos posiciones cambian
  eq(api.llamadosMovidos(), 2, 'un swap mueve 2 llamados');
  ok(api.ordenSucio(), 'tras mover queda sucio');
}

console.log('\nT4 — huecos de un borrado');
{
  const { api } = montar(carrerasFalsas([1, 2, 4, 5]));   // se borró el turno 3
  eq(api.llamadosMovidos(), 2, 'los turnos 4 y 5 pasarían a 3 y 4');
  ok(api.ordenSucio(), 'el hueco marca la lista como sucia sin haber tocado nada');
  ok(api.ordenPropuesto === null, 'pero no hay propuesta en memoria (no se bloquea la navegación)');
}

console.log('\nT5 — payload a la RPC');
{
  const resumen = { turnos: 4, carreras_movidas: 2, inscripciones_afectadas: 0, detalle: [] };
  const { api, ...estado } = montar(carrerasFalsas([1, 2, 3, 4]), { rpc: () => ({ data: resumen, error: null }) });
  api.moverTurno('c1', 1);
  await api.guardarOrden();

  const llamadas = estado.rpcCalls ?? [];
  eq(llamadas.map(l => l.fn), ['reordenar_turnos', 'reordenar_turnos'], 'llama dos veces: dry run y escritura');
  eq(llamadas[0].args.p_dry_run, true,  'la primera es dry run');
  eq(llamadas[1].args.p_dry_run, false, 'la segunda escribe');
  eq(llamadas[1].args.p_orden, [
    { id: 'c2', turno: 1 }, { id: 'c1', turno: 2 }, { id: 'c3', turno: 3 }, { id: 'c4', turno: 4 },
  ], 'el payload es 1..N en el orden de la vista');
  eq(llamadas[0].args.p_orden, llamadas[1].args.p_orden, 'dry run y escritura mandan el mismo orden');
}

console.log('\nT6 — sin inscripciones no pregunta; con inscripciones sí');
{
  const sinInsc = { turnos: 2, carreras_movidas: 2, inscripciones_afectadas: 0, detalle: [] };
  const e1 = montar(carrerasFalsas([1, 2]), { rpc: () => ({ data: sinInsc, error: null }) });
  e1.api.moverTurno('c1', 1);
  await e1.api.guardarOrden();
  eq(e1.confirms.length, 0, 'con 0 inscripciones afectadas no pide confirmación');

  const conInsc = {
    turnos: 2, carreras_movidas: 2, inscripciones_afectadas: 7,
    detalle: [
      { id: 'c2', nombre: 'Llamado 2', turno_anterior: 2, turno_nuevo: 1, inscriptos: 7 },
      { id: 'c1', nombre: 'Llamado 1', turno_anterior: 1, turno_nuevo: 2, inscriptos: 0 },
    ],
  };
  const e2 = montar(carrerasFalsas([1, 2]), { rpc: () => ({ data: conInsc, error: null }) });
  e2.api.moverTurno('c1', 1);
  await e2.api.guardarOrden();
  eq(e2.confirms.length, 1, 'con inscripciones afectadas pide confirmación');
  ok(/7 inscripciones en total/.test(e2.confirms[0] || ''), 'la confirmación dice cuántas inscripciones cambian');
  ok(/TURNO 2 → 1/.test(e2.confirms[0] || ''), 'la confirmación detalla turno anterior → nuevo');
}

console.log('\nT7 — descartarOrden');
{
  const { api } = montar(carrerasFalsas([1, 2, 3]));
  api.moverTurno('c1', 1);
  ok(api.ordenPropuesto !== null, 'hay propuesta tras mover');
  api.descartarOrden();
  ok(api.ordenPropuesto === null, 'descartar limpia la propuesta');
  eq(api.carrerasEnOrden().map(c => c.id), ['c1', 'c2', 'c3'], 'vuelve al orden de la DB');
}

console.log(`\n=== ${fallos === 0 ? 'OK — todos los asserts pasaron' : `${fallos} ASSERT(S) FALLARON`} ===\n`);
process.exit(fallos === 0 ? 0 : 1);
