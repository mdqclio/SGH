#!/usr/bin/env node
// ============================================================
// Probe JSON v2 del Stud Book — unitarios + sincronización
// ============================================================
// NO toca la DB, NO necesita browser, NO necesita credenciales.
//   node tests/probe_studbook_v2.mjs
//
// Cubre cuatro cosas:
//   A. chapas_map.mjs sigue en sync con el catálogo de chapas.js
//   B. mandil.mjs sigue en sync con renumerar-chapas.js
//   C. el filtro de carreras (casos que R6 no tiene: no-oficial, anulada,
//      sin categoría, resultado provisional)
//   D. el mandil con forfaits intercalados y un no_largo
//
// A y B existen porque los dos módulos de _shared son PORTS de scripts de
// browser que no se pueden importar (sin `export`, cargados como global por
// resultados.html / ratificacion.html). Si alguien toca el original y no el
// port, esto falla.
// ============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildReunionJson } from '../supabase/functions/_shared/studbook_format.mjs';
import { renumerarChapas } from '../supabase/functions/_shared/mandil.mjs';
import { CHAPAS_CODIGO_A_ID, CHAPA_ID_VARIOS, VARIANTES_LEGACY, resolverChapa }
  from '../supabase/functions/_shared/chapas_map.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

let ok = 0, fail = 0;
const check = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log(`  OK    ${nombre}`); }
  else { fail++; console.log(`  FALLA ${nombre}${detalle ? ' — ' + detalle : ''}`); }
};
const eq = (nombre, got, exp) =>
  check(nombre, JSON.stringify(got) === JSON.stringify(exp),
        `got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`);

// Carga un script de browser (sin export) y devuelve los globals pedidos.
function cargarScriptBrowser(rel, nombres) {
  const src = readFileSync(join(RAIZ, rel), 'utf8');
  const salida = {};
  const cuerpo = src + '\n;return {' + nombres.map(n => `${n}: typeof ${n} !== "undefined" ? ${n} : undefined`).join(',') + '};';
  Object.assign(salida, new Function(cuerpo)());
  return salida;
}

// ------------------------------------------------------------
console.log('\nA. chapas_map.mjs ↔ chapas.js');
// ------------------------------------------------------------
{
  const { CHAPAS_CATALOG } = cargarScriptBrowser('chapas.js', ['CHAPAS_CATALOG']);
  check('chapas.js carga', Array.isArray(CHAPAS_CATALOG));
  eq('el catálogo tiene 20 entradas', CHAPAS_CATALOG.length, 20);

  const conCodigo = CHAPAS_CATALOG.filter(c => c.codigo != null);
  eq('19 entradas con código fijo', conCodigo.length, 19);
  eq('el mapa tiene los mismos 19', Object.keys(CHAPAS_CODIGO_A_ID).length, 19);

  let desalineados = [];
  for (const c of conCodigo) {
    if (CHAPAS_CODIGO_A_ID[c.codigo] !== c.id) {
      desalineados.push(`${c.codigo}: catalogo=${c.id} mapa=${CHAPAS_CODIGO_A_ID[c.codigo]}`);
    }
  }
  check('todos los codigo→id coinciden con el catálogo', desalineados.length === 0,
        desalineados.join(' | '));

  const sobran = Object.keys(CHAPAS_CODIGO_A_ID)
    .filter(k => !conCodigo.some(c => c.codigo === k));
  check('el mapa no inventa códigos que no estén en el catálogo',
        sobran.length === 0, sobran.join(','));

  const varios = CHAPAS_CATALOG.find(c => c.tipo === 'varios');
  eq('el id de "varios" coincide', CHAPA_ID_VARIOS, varios.id);

  // Los ids NO son contiguos a propósito: el 20 va entre el 16 y el 17.
  const idsEnOrden = CHAPAS_CATALOG.map(c => c.id);
  eq('el id 20 va entre el 16 y el 17 (orden del array)',
     idsEnOrden.slice(idsEnOrden.indexOf(16), idsEnOrden.indexOf(16) + 3), [16, 20, 17]);

  // Toda variante legacy tiene que apuntar a algo resoluble.
  const rotas = Object.entries(VARIANTES_LEGACY)
    .filter(([, canon]) => resolverChapa(canon).id == null)
    .map(([k, v]) => `${k}→${v}`);
  check('toda variante legacy resuelve a un id', rotas.length === 0, rotas.join(','));
}

// ------------------------------------------------------------
console.log('\nB. mandil.mjs ↔ renumerar-chapas.js');
// ------------------------------------------------------------
{
  const orig = cargarScriptBrowser('renumerar-chapas.js', ['renumerarChapas']).renumerarChapas;
  check('renumerar-chapas.js carga', typeof orig === 'function');

  const fixtures = [
    [],
    [{ id: 'a', estado: 'ratificado', numero_partidor: 1 }],
    // huecos de gatera + forfait intercalado + mal_inscrito
    [{ id: 'a', estado: 'ratificado', numero_partidor: 1 },
     { id: 'b', estado: 'forfait', numero_partidor: 2 },
     { id: 'c', estado: 'ratificado', numero_partidor: 5 },
     { id: 'd', estado: 'ratificado', numero_partidor: 3 },
     { id: 'e', estado: 'mal_inscrito', numero_partidor: 4 }],
    // gateras null (van al final) y estados que no cuentan
    [{ id: 'x', estado: 'ratificado', numero_partidor: null },
     { id: 'y', estado: 'ratificado', numero_partidor: 2 },
     { id: 'z', estado: 'inscripto', numero_partidor: 1 }],
  ];
  let difs = 0;
  fixtures.forEach((f, i) => {
    if (JSON.stringify(orig(f)) !== JSON.stringify(renumerarChapas(f))) difs++;
  });
  check('las dos implementaciones dan lo mismo en todos los fixtures', difs === 0,
        `${difs} divergencias`);
}

// ------------------------------------------------------------
console.log('\nC. filtro de carreras');
// ------------------------------------------------------------
const CAT_OF = 'cat-oficial', CAT_NO = 'cat-no-oficial', CAT_ONC = 'cat-onc', CAT_SF_ONC = 'cat-sf-onc';
const catMap = new Map([
  [CAT_OF,  { id: CAT_OF,  nombre: 'Oficial Computable',    codigo: 'OC',  es_oficial: true,  es_computable: true }],
  [CAT_NO,  { id: CAT_NO,  nombre: 'Concertada',            codigo: 'CC',  es_oficial: false, es_computable: false }],
  // Dolores: oficial PERO no computable. No viaja desde el 2026-08-23.
  [CAT_ONC, { id: CAT_ONC, nombre: 'Oficial No Computable', codigo: 'ONC', es_oficial: true,  es_computable: false }],
  // Jockey Club San Francisco: MISMO código `ONC`, otra cosa — "Oficial No
  // Clásico", oficial y computable. Está acá para dejar clavado que el filtro
  // mira los FLAGS y no el código: esta sí viaja aunque comparta el `ONC`.
  [CAT_SF_ONC, { id: CAT_SF_ONC, nombre: 'Oficial No Clásico', codigo: 'ONC', es_oficial: true, es_computable: true }],
]);

function armar(carreras, { resultados = [], inscripciones = [], posiciones = [] } = {}) {
  const resByCarrera = new Map(resultados.map(r => [r.carrera_id, r]));
  const inscByCarrera = new Map();
  for (const i of inscripciones) {
    if (!inscByCarrera.has(i.carrera_id)) inscByCarrera.set(i.carrera_id, []);
    inscByCarrera.get(i.carrera_id).push(i);
  }
  return buildReunionJson({
    reunion: { id: 'r', fecha: '2026-06-20' },
    hipodromo: { id: 'h', nombre: 'Dolores' },
    carreras,
    resByCarrera, inscByCarrera,
    posByInsc: new Map(posiciones.map(p => [p.inscripcion_id, p])),
    catMap, profMap: new Map(), cabMap: new Map(), spcMap: new Map(),
  });
}

{
  const carreras = [
    { id: 'c1', numero_turno: 1, categoria_id: CAT_OF, estado: 'abierta' },
    { id: 'c2', numero_turno: 2, categoria_id: CAT_NO, estado: 'abierta' },   // no oficial
    { id: 'c3', numero_turno: 3, categoria_id: CAT_OF, estado: 'anulada' },   // anulada
    { id: 'c4', numero_turno: 4, categoria_id: null,   estado: 'abierta' },   // sin categoría
    { id: 'c5', numero_turno: 5, categoria_id: 'inexistente', estado: 'abierta' },
    { id: 'c6', numero_turno: 6, categoria_id: CAT_OF, estado: null },        // estado null = ok
    { id: 'c7', numero_turno: 7, categoria_id: CAT_ONC, estado: 'abierta' },  // oficial NO computable
    { id: 'c8', numero_turno: 8, categoria_id: CAT_SF_ONC, estado: 'abierta' }, // `ONC` de otro club: sí computable
  ];
  const out = armar(carreras);
  const nums = out.data.carreras.map(c => c.numero);
  eq('sólo viajan las oficiales computables no anuladas', nums, ['1', '6', '8']);
  check('la no-oficial queda afuera', !nums.includes('2'));
  check('la anulada queda afuera', !nums.includes('3'));
  check('sin categoría queda afuera (fail-closed)', !nums.includes('4'));
  check('categoría que no está en catMap queda afuera', !nums.includes('5'));
  check('la OFICIAL NO COMPUTABLE queda afuera', !nums.includes('7'));
  check('el filtro mira el flag y no el código: `ONC` computable de otro club viaja',
        nums.includes('8'));
}

{
  // Reunión donde TODO es no computable: estructura válida, `carreras` vacío.
  // No es un caso nuevo — ya pasaba con una reunión toda no-oficial — pero
  // ahora es mucho más probable, así que queda clavado.
  const out = armar([
    { id: 'x1', numero_turno: 1, categoria_id: CAT_ONC, estado: 'abierta' },
    { id: 'x2', numero_turno: 2, categoria_id: CAT_ONC, estado: 'abierta' },
  ]);
  eq('status 200 igual', out.status, 200);
  eq('carreras es un array vacío, no null ni undefined', out.data.carreras, []);
  check('la reunión conserva sus campos', out.data.id === 'r' && out.data.fecha.date === '2026-06-20');
  check('el hipódromo sigue ahí', out.data.hipodromo.nombre === 'Dolores');
  check('el JSON serializa sin romperse', typeof JSON.stringify(out) === 'string');
}

{
  // Coherencia: lo que se emite se cuenta sobre lo EMITIDO, no sobre lo que
  // había antes de filtrar. competidores_cantidad es el único total del
  // formato y es por carrera; se verifica que cuente los competidores de SU
  // carrera y que las carreras filtradas no aporten nada.
  const carreras = [
    { id: 'k1', numero_turno: 1, categoria_id: CAT_OF,  estado: 'abierta' },
    { id: 'k2', numero_turno: 2, categoria_id: CAT_ONC, estado: 'abierta' },
  ];
  const inscripciones = [
    { id: 'a1', carrera_id: 'k1', estado: 'ratificado', numero_partidor: 1 },
    { id: 'a2', carrera_id: 'k1', estado: 'ratificado', numero_partidor: 3 },
    // la ONC tiene 5 ratificados que NO tienen que aparecer en ningún conteo
    { id: 'b1', carrera_id: 'k2', estado: 'ratificado', numero_partidor: 1 },
    { id: 'b2', carrera_id: 'k2', estado: 'ratificado', numero_partidor: 2 },
    { id: 'b3', carrera_id: 'k2', estado: 'ratificado', numero_partidor: 3 },
    { id: 'b4', carrera_id: 'k2', estado: 'ratificado', numero_partidor: 4 },
    { id: 'b5', carrera_id: 'k2', estado: 'ratificado', numero_partidor: 5 },
  ];
  const out = armar(carreras, { inscripciones });
  eq('viaja una sola carrera', out.data.carreras.length, 1);
  const c = out.data.carreras[0];
  eq('competidores_cantidad cuenta los de la carrera emitida', c.competidores_cantidad, 2);
  eq('competidores_cantidad coincide con el array', c.competidores_cantidad, c.competidores.length);
  check('ningún competidor de la carrera filtrada se coló',
        !JSON.stringify(out).includes('"b1"'));
}

{
  // Resultado provisional: la carrera VIAJA, pero sin resultado adjunto.
  const carreras = [
    { id: 'p1', numero_turno: 1, categoria_id: CAT_OF, estado: 'abierta' },
    { id: 'p2', numero_turno: 2, categoria_id: CAT_OF, estado: 'abierta' },
  ];
  const resultados = [
    { id: 'r1', carrera_id: 'p1', estado: 'provisional', estado_pista: 'seca', tiempo_ganador: '1:02.5' },
    { id: 'r2', carrera_id: 'p2', estado: 'oficial', estado_pista: 'seca', tiempo_ganador: '1:03.0' },
  ];
  const inscripciones = [
    { id: 'i1', carrera_id: 'p1', estado: 'ratificado', numero_partidor: 1 },
    { id: 'i2', carrera_id: 'p2', estado: 'ratificado', numero_partidor: 1 },
  ];
  const posiciones = [
    { inscripcion_id: 'i1', resultado_id: 'r1', posicion: 1, dividendo: 5, diferencia: '2 cpos' },
    { inscripcion_id: 'i2', resultado_id: 'r2', posicion: 1, dividendo: 7, diferencia: '2 cpos' },
  ];
  const out = armar(carreras, { resultados, inscripciones, posiciones });
  eq('la carrera con resultado provisional viaja igual', out.data.carreras.length, 2);

  const prov = out.data.carreras.find(c => c.numero === '1');
  const ofi = out.data.carreras.find(c => c.numero === '2');
  eq('provisional: estado null', prov.estado, null);
  eq('provisional: estado_pista null', prov.estado_pista, { id: null, nombre: null });
  // `centesimas` se sumó al tiempo en el fix de la R8 (2026-08-23) y `decimas`
  // quedó como alias por compatibilidad con Diego. Esta expectativa se había
  // quedado en la forma vieja y venía fallando desde entonces.
  eq('provisional: tiempo vacío', prov.tiempo,
     { minutos: null, segundos: null, centesimas: null, decimas: null });
  eq('provisional: puesto "0"', prov.competidores[0].puesto, '0');
  eq('provisional: sin dividendo', prov.competidores[0].pagaria, null);
  eq('oficial: estado oficial', ofi.estado, 'oficial');
  eq('oficial: puesto 1', ofi.competidores[0].puesto, '1');
  eq('oficial: dividendo presente', ofi.competidores[0].pagaria, '7');
}

// ------------------------------------------------------------
console.log('\nD. orden = mandil');
// ------------------------------------------------------------
{
  const carreras = [{ id: 'm1', numero_turno: 1, categoria_id: CAT_OF, estado: 'abierta' }];
  const resultados = [{ id: 'rm', carrera_id: 'm1', estado: 'oficial' }];
  // gateras 1..6 con dos forfaits intercalados (2 y 4) → mandiles 1,2,3,4
  const inscripciones = [
    { id: 'g1', carrera_id: 'm1', estado: 'ratificado', numero_partidor: 1 },
    { id: 'g2', carrera_id: 'm1', estado: 'forfait',    numero_partidor: 2 },
    { id: 'g3', carrera_id: 'm1', estado: 'ratificado', numero_partidor: 3 },
    { id: 'g4', carrera_id: 'm1', estado: 'mal_inscrito', numero_partidor: 4 },
    { id: 'g5', carrera_id: 'm1', estado: 'ratificado', numero_partidor: 5 },
    { id: 'g6', carrera_id: 'm1', estado: 'ratificado', numero_partidor: 6 },
  ];
  // g5 no largó → conserva mandil 3 y deja hueco en las posiciones
  const posiciones = [
    { inscripcion_id: 'g1', resultado_id: 'rm', posicion: 2, diferencia: 'nariz' },
    { inscripcion_id: 'g3', resultado_id: 'rm', posicion: 1, diferencia: '1 cuerpo' },
    { inscripcion_id: 'g5', resultado_id: 'rm', posicion: null, no_largo: true, diferencia: null },
    { inscripcion_id: 'g6', resultado_id: 'rm', posicion: 3, diferencia: '7 cpos' },
  ];
  const car = armar(carreras, { resultados, inscripciones, posiciones }).data.carreras[0];
  const porId = Object.fromEntries(car.competidores.map(x => [x.idCarreraInt, x]));

  eq('orden es mandil, no gatera (g5: gatera 5 → mandil 3)', porId.g5.orden, '3');
  eq('g1 gatera 1 → mandil 1', porId.g1.orden, '1');
  eq('g3 gatera 3 → mandil 2', porId.g3.orden, '2');
  eq('g6 gatera 6 → mandil 4', porId.g6.orden, '4');
  eq('los forfait no consumen mandil', car.competidores.length, 4);
  eq('mandiles 1..N sin huecos ni repetidos',
     car.competidores.map(c => c.orden), ['1', '2', '3', '4']);
  eq('el que no largó conserva su mandil y sale puesto 99', porId.g5.puesto, '99');
  eq('yunta sigue null', car.competidores.map(c => c.yunta), [null, null, null, null]);

  // cuerpos
  eq('cuerpos: código exacto resuelve', porId.g3.cuerpos.id_interno, 10);   // "1 cuerpo" → 1 cpo
  eq('cuerpos: varios resuelve a 17', porId.g6.cuerpos.id_interno, 17);     // "7 cpos"
  eq('cuerpos: "nariz" queda sin id', porId.g1.cuerpos.id_interno, null);
  eq('cuerpos: el texto original nunca se reescribe', porId.g3.cuerpos.nombre, '1 cuerpo');
  eq('cuerpos: "nariz" conserva su texto', porId.g1.cuerpos.nombre, 'nariz');

  // aplanado
  check('competidores es array plano', Array.isArray(car.competidores) && !Array.isArray(car.competidores[0]));
  check('premios es array plano', Array.isArray(car.premios) && !Array.isArray(car.premios[0]));
}

// ------------------------------------------------------------
console.log(`\n==== ${ok} OK · ${fail} FALLA ====`);
process.exit(fail === 0 ? 0 : 1);
