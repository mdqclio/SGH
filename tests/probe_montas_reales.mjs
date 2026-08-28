/**
 * Probe — Montas reales + gate de oficialización (real-code, READ-ONLY).
 *
 * Corre el CÓDIGO REAL extraído de resultados.html, no una copia:
 *   - moInscripciones() / moOpciones()   (modal de Montas — cambio A)
 *   - montasFaltantes()                  (fuente del gate)
 *   - el bloque del GATE dentro de oficializar(), extraído por sus anclas (cambio B)
 * Sin browser (chromium no corre en ubuntu 26.04). NO escribe una sola fila: los escenarios
 * se arman mutando EN MEMORIA copias de filas reales de R8 traídas de producción.
 *
 * Contexto (Fede, 2026-08-28): el jockey que cobra tiene que ser el que corrió, no el
 * inscripto. Hoy la liquidación lee inscripciones.jockey_titular_id de punta a punta, y el
 * motor descarta la línea en silencio cuando ese campo está en null (addActor: if (!id) return).
 * Medido sobre auditoria: 19 casos en R6 y 9 en R8 de ratificados que LARGARON con jockey null.
 *
 * S0) sensibilidad — el archivo tiene el gate y el modal (contra main esto falla y corta)
 * G1) el gate rechaza una carrera con un ratificado que largó sin jockey, y lo nombra
 * G2) el gate deja pasar una carrera completa
 * G3) los "no corrió" del marcador abierto (noLargoMandiles) no cuentan
 * G4) los no_largo persistidos (carrera que no es la abierta) tampoco cuentan
 * G5) forfait / mal_inscrito / inscripto no cuentan
 * G6) al bloquear no se oficializa nada, y ofrece abrir Montas
 * M1) el modal ordena por gatera (numero_partidor ASC, sin gatera al final)
 * M2) el suplente va primero y etiquetado "(suplente)"
 * M3) sin suplente: "Sin asignar" primero y después alfabético por apellido
 * M4) sólo entran profesionales tipo jockey|ambos
 * M5) contra R8 real, montasFaltantes coincide con lo que dice la base
 * A1) la alta rápida marca el registro en notas (asserts sobre el texto del archivo: correr el
 *     INSERT crearía un profesional en prod, y este probe es read-only)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) throw new Error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a antes de correr).');
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC  = readFileSync(join(HERE, '..', 'resultados.html'), 'utf8');
const RENUM = readFileSync(join(HERE, '..', 'renumerar-chapas.js'), 'utf8');

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

/* ── Extracción por ancla, con balance de llaves ───────────────────────────── */
function extraerFn(nombre) {
  const i = SRC.indexOf(`function ${nombre}(`);
  if (i < 0) throw new Error(`no encontré function ${nombre}( en resultados.html`);
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error(`no pude cerrar function ${nombre}`);
}
const GATE_INI = '// ═══ GATE MONTAS — INICIO';
const GATE_FIN = '// ═══ GATE MONTAS — FIN ═══';
function extraerGate() {
  const a = SRC.indexOf(GATE_INI), b = SRC.indexOf(GATE_FIN);
  if (a < 0 || b < 0 || b < a) throw new Error('no encontré las anclas del GATE MONTAS');
  return SRC.slice(SRC.indexOf('\n', a) + 1, b);
}

/* ── S0 — sensibilidad: contra main nada de esto existe ────────────────────── */
const faltantes = ['moInscripciones', 'moOpciones', 'montasFaltantes', 'openMontas', 'saveMontas']
  .filter(n => SRC.indexOf(`function ${n}(`) < 0 && SRC.indexOf(`async function ${n}(`) < 0);
const tieneGate = SRC.includes(GATE_INI) && SRC.includes(GATE_FIN);
const tieneModal = SRC.includes('id="modal-montas"') && SRC.includes('openMontas()');
ok('S0 · el archivo tiene gate + modal (contra main falla acá)',
   faltantes.length === 0 && tieneGate && tieneModal,
   faltantes.length ? `faltan: ${faltantes.join(', ')}` : (tieneGate ? '' : 'sin anclas del gate'));
if (faltantes.length || !tieneGate || !tieneModal) {
  console.log('\n❌ S0 — resultados.html no tiene los cambios. El probe mide algo: contra main corta acá.');
  for (const r of results) console.log(`${r.s}  ${r.t}${r.n ? ' — ' + r.n : ''}`);
  process.exit(1);
}

/* ── Harness: el código real, con dependencias inyectadas ──────────────────── */
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const FUENTE = ['moInscripciones', 'moOpciones', 'montasFaltantes'].map(extraerFn).join('\n\n');
const GATE   = extraerGate();

function correr(estado) {
  const log = { confirmMsgs: [], abrioMontas: 0 };
  const deps = {
    ...estado,
    confirm: (m) => { log.confirmMsgs.push(m); return true; },   // el operador acepta
    openMontas: () => { log.abrioMontas++; },
  };
  const fn = new AsyncFunction('deps', `
    const { inscripciones, spcsMap, profsMap, resultados, posicionesMap, currentCarreraId,
            noLargoMandiles, confirm, openMontas, carreraId } = deps;
    ${RENUM}
    ${FUENTE}
    async function oficializarReal(carreraId) {
${GATE}
      return { oficializo: true };
    }
    return await oficializarReal(carreraId);
  `);
  return fn(deps).then(r => ({ salida: r, log }));
}
function evaluar(estado, expr) {
  const fn = new AsyncFunction('deps', `
    const { inscripciones, spcsMap, profsMap, resultados, posicionesMap, currentCarreraId,
            noLargoMandiles } = deps;
    ${RENUM}
    ${FUENTE}
    return (${expr});
  `);
  return fn(estado);
}

/* ── Fixture: filas REALES de R8, copiadas y mutadas en memoria ────────────── */
const { data: r8 } = await sb.from('reuniones').select('id,numero').eq('club_id', CLUB_ID).eq('numero', 8).single();
const { data: cars } = await sb.from('carreras').select('id,numero_turno,numero_carrera_programa')
  .eq('reunion_id', r8.id).or('estado.is.null,estado.neq.anulada').order('numero_turno');
const carIds = cars.map(c => c.id);
const { data: inscsReal } = await sb.from('inscripciones').select('*').in('carrera_id', carIds);
const { data: resReal }   = await sb.from('resultados').select('*').in('carrera_id', carIds);
const { data: posReal }   = await sb.from('resultado_posiciones').select('*').in('resultado_id', resReal.map(r => r.id));
const { data: spcsReal }  = await sb.from('spcs').select('id,nombre');
const { data: profsReal } = await sb.from('profesionales').select('id,nombre,apellido,tipo').eq('club_id', CLUB_ID);

const spcsMap = {}; spcsReal.forEach(s => { spcsMap[s.id] = s; });
const profsMap = {}; profsReal.forEach(p => { profsMap[p.id] = p; });
const resultadosMap = {}; resReal.forEach(r => { resultadosMap[r.carrera_id] = r; });
const posicionesMap = {}; posReal.forEach(p => { (posicionesMap[p.resultado_id] ??= []).push(p); });

const clon = o => JSON.parse(JSON.stringify(o));
const baseEstado = (over = {}) => ({
  inscripciones: clon(inscsReal), spcsMap, profsMap,
  resultados: resultadosMap, posicionesMap,
  currentCarreraId: null, noLargoMandiles: new Set(),
  ...over,
});

// Una carrera de R8 con ratificados que largaron y todos con jockey.
const carreraCompleta = cars.map(c => c.id).find(cid => {
  const res = resultadosMap[cid];
  const nl = new Set(((res && posicionesMap[res.id]) || []).filter(p => p.no_largo).map(p => p.inscripcion_id));
  const rats = inscsReal.filter(i => i.carrera_id === cid && i.estado === 'ratificado' && !nl.has(i.id));
  return rats.length >= 3 && rats.every(i => i.jockey_titular_id);
});
if (!carreraCompleta) throw new Error('no encontré en R8 una carrera con >=3 ratificados que largaron y todos con jockey');
const ratsDeEsa = inscsReal.filter(i => i.carrera_id === carreraCompleta && i.estado === 'ratificado');

/* ── G2 — carrera completa: pasa ───────────────────────────────────────────── */
{
  const { salida, log } = await correr({ ...baseEstado(), carreraId: carreraCompleta });
  ok('G2 · carrera completa → el gate deja pasar', salida?.oficializo === true,
     `${ratsDeEsa.length} ratificados, 0 sin jockey`);
  ok('G2b · no dispara el diálogo del gate', !log.confirmMsgs.some(m => m.includes('No se puede oficializar')));
}

/* ── G1 + G6 — un ratificado que largó sin jockey: rechaza y nombra ────────── */
{
  const est = baseEstado();
  const victima = est.inscripciones.find(i => i.id === ratsDeEsa[0].id);
  victima.jockey_titular_id = null;
  const nombreVictima = spcsMap[victima.spc_id]?.nombre;
  const { salida, log } = await correr({ ...est, carreraId: carreraCompleta });
  ok('G1 · ratificado que largó sin jockey → el gate rechaza', salida === undefined);
  ok('G1b · el mensaje nombra al caballo, no es genérico',
     log.confirmMsgs.some(m => m.includes(nombreVictima)), nombreVictima);
  ok('G1c · el mensaje dice cuántos faltan',
     log.confirmMsgs.some(m => m.includes('1 caballo(s)')));
  ok('G6 · al bloquear NO se oficializa nada', salida?.oficializo !== true);
  ok('G6b · ofrece abrir Montas y lo abre si el operador acepta', log.abrioMontas === 1);
  ok('G6c · el gate corre ANTES del confirm de oficializar',
     !log.confirmMsgs.some(m => m.includes('¿Hacer oficial')));
}

/* ── G3 — no_largo del marcador abierto no cuenta ──────────────────────────── */
{
  const est = baseEstado({ currentCarreraId: carreraCompleta });
  const victima = est.inscripciones.find(i => i.id === ratsDeEsa[0].id);
  victima.jockey_titular_id = null;
  // mandil de la víctima según renumerarChapas (gatera ASC → 1..N)
  const mandil = await evaluar(est,
    `(() => { const ins = moInscripciones('${carreraCompleta}'); return renumerarChapas(ins)['${victima.id}']; })()`);
  const conNC = { ...est, noLargoMandiles: new Set([mandil]) };
  const sinNC = { ...est, noLargoMandiles: new Set() };
  const { salida: sSin } = await correr({ ...sinNC, carreraId: carreraCompleta });
  const { salida: sCon } = await correr({ ...conNC, carreraId: carreraCompleta });
  ok('G3 · sin jockey y sin marcar → rechaza', sSin === undefined, `mandil ${mandil}`);
  ok('G3b · el mismo caballo marcado "no corrió" → pasa', sCon?.oficializo === true);
}

/* ── G4 — no_largo persistido (carrera que no es la abierta) ───────────────── */
{
  const cidConNL = cars.map(c => c.id).find(cid => {
    const res = resultadosMap[cid];
    return ((res && posicionesMap[res.id]) || []).some(p => p.no_largo);
  });
  ok('G4 · hay en R8 una carrera con no_largo persistido para probar', !!cidConNL, cidConNL || 'ninguna');
  if (cidConNL) {
    const res = resultadosMap[cidConNL];
    const nlIds = posicionesMap[res.id].filter(p => p.no_largo).map(p => p.inscripcion_id);
    const est = baseEstado();                       // currentCarreraId = null → rama persistida
    const v = est.inscripciones.find(i => i.id === nlIds[0]);
    ok('G4b · el no_largo elegido es un ratificado', v?.estado === 'ratificado');
    v.jockey_titular_id = null;
    const { salida } = await correr({ ...est, carreraId: cidConNL });
    ok('G4c · no_largo persistido sin jockey → NO bloquea', salida?.oficializo === true,
       spcsMap[v.spc_id]?.nombre || '');
  }
}

/* ── G5 — forfait / mal_inscrito / inscripto no cuentan ────────────────────── */
{
  for (const estado of ['forfait', 'mal_inscrito', 'inscripto']) {
    const est = baseEstado();
    const v = est.inscripciones.find(i => i.id === ratsDeEsa[0].id);
    v.estado = estado;
    v.jockey_titular_id = null;
    const { salida } = await correr({ ...est, carreraId: carreraCompleta });
    ok(`G5 · ${estado} sin jockey → no bloquea`, salida?.oficializo === true);
  }
}

/* ── M1 — orden por gatera ─────────────────────────────────────────────────── */
{
  const est = baseEstado();
  const orden = await evaluar(est,
    `moInscripciones('${carreraCompleta}').map(i => i.numero_partidor)`);
  const esperado = [...orden].sort((a, b) => (a || 999) - (b || 999));
  ok('M1 · el modal ordena por gatera (numero_partidor ASC)',
     JSON.stringify(orden) === JSON.stringify(esperado), `gateras: ${orden.join(',')}`);
  const sinGatera = orden.filter(g => g == null);
  ok('M1b · los sin gatera quedan al final',
     sinGatera.length === 0 || orden.slice(-sinGatera.length).every(g => g == null));
}

/* ── M2/M3/M4 — desplegable ────────────────────────────────────────────────── */
{
  const jockeysReales = profsReal.filter(p => p.tipo === 'jockey' || p.tipo === 'ambos');
  const noJockey = profsReal.find(p => p.tipo === 'entrenador');
  const supl = jockeysReales[3];
  const est = baseEstado();
  const i0 = est.inscripciones.find(i => i.id === ratsDeEsa[0].id);
  i0.jockey_suplente_id = supl.id;

  const html = await evaluar(est, `moOpciones(inscripciones.find(i => i.id === '${i0.id}'))`);
  const labels = [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map(m => m[1]);

  ok('M2 · el suplente va primero, después de "Sin asignar"',
     labels[1] === `${supl.apellido}, ${supl.nombre} (suplente)`, labels[1]);
  ok('M2b · el suplente no aparece duplicado más abajo',
     labels.filter(l => l.startsWith(`${supl.apellido}, ${supl.nombre}`)).length === 1);

  const htmlSin = await evaluar(est, `moOpciones(inscripciones.find(i => i.id === '${ratsDeEsa[1].id}'))`);
  const labelsSin = [...htmlSin.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map(m => m[1]);
  ok('M3 · sin suplente: "Sin asignar" primero', labelsSin[0].includes('Sin asignar'), labelsSin[0]);
  const apellidos = labelsSin.slice(1).map(l => l.split(',')[0]);
  ok('M3b · el resto va alfabético por apellido',
     JSON.stringify(apellidos) === JSON.stringify([...apellidos].sort((a, b) => a.localeCompare(b, 'es'))));

  ok('M4 · sólo entran jockey|ambos, no entrenadores',
     !labelsSin.some(l => l.startsWith(`${noJockey.apellido}, ${noJockey.nombre}`)),
     `probado contra ${noJockey.apellido} (entrenador)`);
  ok('M4b · están todos los jockeys del club', labelsSin.length === jockeysReales.length + 1,
     `${labelsSin.length - 1} en el select vs ${jockeysReales.length} en la base`);

  ok('M2c · marca selected el jockey actual',
     html.includes(`value="${i0.jockey_titular_id}" selected`) ||
     html.includes(`value="${i0.jockey_titular_id}"  selected`) ||
     new RegExp(`value="${i0.jockey_titular_id}"[^>]*selected`).test(html));
}

/* ── M5 — contra R8 real, coincide con la base ─────────────────────────────── */
{
  const est = baseEstado();                                   // sin mutar: datos de prod
  let totalCodigo = 0;
  for (const c of cars) {
    const f = await evaluar(est, `montasFaltantes('${c.id}')`);
    totalCodigo += f.length;
  }
  const nlIds = new Set(posReal.filter(p => p.no_largo).map(p => p.inscripcion_id));
  const totalBase = inscsReal.filter(i =>
    carIds.includes(i.carrera_id) && i.estado === 'ratificado' &&
    !nlIds.has(i.id) && !i.jockey_titular_id).length;
  ok('M5 · montasFaltantes sobre R8 coincide con la base',
     totalCodigo === totalBase, `código ${totalCodigo} vs base ${totalBase}`);
  ok('M5b · R8 hoy no tiene ratificados que largaron sin jockey', totalBase === 0,
     `si esto falla, R8 quedaría bloqueada al re-oficializar`);
}

/* ── A1 — la alta rápida deja marca en notas ───────────────────────────────── */
{
  const iAlta = SRC.indexOf('async function altaJockeyRapida()');
  const bloque = SRC.slice(iAlta, SRC.indexOf('async function saveMontas()', iAlta));
  ok('A1 · el INSERT de la alta rápida escribe notas', /notas:\s*`/.test(bloque));
  ok('A1b · la marca es greppable y constante',
     SRC.includes("const ALTA_RAPIDA_MARCA = 'ALTA RAPIDA desde Montas'") &&
     bloque.includes('${ALTA_RAPIDA_MARCA}'));
  ok('A1c · la nota dice que la ficha está incompleta',
     /FICHA INCOMPLETA/.test(bloque));
  ok('A1d · registra quién y cuándo', bloque.includes('currentUser') && bloque.includes('toISOString'));
  ok('A1e · el toast avisa que la ficha quedó incompleta',
     /toast\(`Jockey creado[^`]*ficha incompleta/.test(bloque));
  // La marca tiene que servir para encontrarlos: verificar contra la base que el patrón
  // no colisiona con notas que ya existan por otro motivo.
  const { data: yaMarcados } = await sb.from('profesionales')
    .select('id,apellido,nombre').like('notas', 'ALTA RAPIDA%');
  ok('A1f · el patrón LIKE no colisiona con notas preexistentes',
     Array.isArray(yaMarcados), `${(yaMarcados||[]).length} marcados hoy`);
}

/* ── Salida ────────────────────────────────────────────────────────────────── */
console.log('\n── Probe montas reales + gate de oficialización ──');
for (const r of results) console.log(`${r.s}  ${r.t}${r.n ? ' — ' + r.n : ''}`);
const fail = results.filter(r => r.s === '❌').length;
console.log(`\n${results.length - fail}/${results.length} OK${fail ? ` · ${fail} FALLAN` : ''}`);
process.exit(fail ? 1 : 0);
