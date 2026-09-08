/**
 * Probe — las cuatro ventanas de carta-llamados.html van y vuelven en hora
 * ARGENTINA, no en UTC. Código real, sin browser.
 *
 * EL BUG
 * ---------------------------------------------------------------------------
 * `apertura_inscripcion`, `cierre_inscripcion`, `apertura_ratificacion` y
 * `cierre_ratificacion` son `timestamptz`: PostgREST las devuelve con offset,
 * "2026-09-11T12:00:00+00:00". Los inputs son `datetime-local`, o sea hora
 * local SIN zona.
 *
 * El código viejo hacía `.slice(0,16)` sobre el ISO para llenar el input y
 * mandaba el value pelado al guardar. Eso se queda con la hora UTC y le arranca
 * el offset: la pantalla mostraba 12:00 (que en Argentina son las 09:00) y al
 * guardar escribía 12:00 UTC, o sea otra vez las 09:00.
 *
 * Los CUATRO campos de R9 quedaron corridos exactamente −3 h. No fueron cuatro
 * errores de carga: fue este bug, aplicado cuatro veces. Yesi cargó bien.
 * Ver docs/diagnosticos/2026-09-08_plan-hora-cierre-r9.md y GOTCHA #91.
 *
 * PATRÓN (tests/README.md § "Browser NO disponible")
 * ---------------------------------------------------------------------------
 * Se EXTRAEN de carta-llamados.html las funciones reales —helpers, `openModal`
 * y `saveRecord`— por ancla y con balance de llaves, y se las corre con
 * `new AsyncFunction` inyectando el cliente Supabase real y un mini-DOM. El
 * assert central es una IDA Y VUELTA de verdad: leer de la base → llenar el
 * modal → guardar → releer de la base.
 *
 * DATOS
 * ---------------------------------------------------------------------------
 * Fixture propio: reunión 9991, fecha 2099, con una carrera. Teardown en el
 * `finally`, verificado. NO toca R9 ni ninguna reunión real.
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_carta_hora_local.mjs
 *   node tests/probe_carta_hora_local.mjs --mutantes=M1,M2,M3,M4
 *   node tests/probe_carta_hora_local.mjs --mutantes
 */

// Argentina es UTC−3 todo el año (sin horario de verano desde 2009). La zona va
// antes de tocar cualquier Date: es la que hace que "12:00 local" sea 15:00Z.
process.env.TZ = 'America/Argentina/Buenos_Aires';

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY (set -a; . ./.env; set +a)'); process.exit(2); }

const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';   // Hipódromo de Dolores

const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = process.env.CARTA_HTML || join(HERE, '..', 'carta-llamados.html');
const HTML = readFileSync(HTML_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

// ── extracción por ancla ────────────────────────────────────────────────────
function extractFn(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  if (!firma.endsWith('{')) throw new Error(`la firma tiene que terminar en '{': ${firma}`);
  let d = 0;
  for (let k = i + firma.length - 1; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error(`no pude cerrar: ${firma}`);
}

// ── mini-DOM ────────────────────────────────────────────────────────────────
function mkDom() {
  const nodos = {};
  const get = (id) => (nodos[id] ||= {
    id, value: '', innerHTML: '', textContent: '', className: '', disabled: false,
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, appendChild() {}, remove() {},
  });
  return {
    _n: nodos, _get: get,
    getElementById: get,
    querySelectorAll: () => [],
    createElement: () => ({ className: '', textContent: '', remove() {} }),
    addEventListener() {},
  };
}

// ── el arnés: código REAL de carta-llamados.html ────────────────────────────
async function mkCarta({ dom, reunionId, carreras = [] }) {
  const piezas = [
    extractFn(HTML, 'function formatMonto(num) {'),
    extractFn(HTML, 'function parseMonto(str) {'),
    extractFn(HTML, 'function isoAInputLocal(iso) {'),
    extractFn(HTML, 'function inputLocalAISO(val) {'),
    extractFn(HTML, 'function updPct() {'),
    extractFn(HTML, 'function openModal(rec=null) {'),
    extractFn(HTML, 'async function saveRecord() {'),
  ].join('\n\n');

  const toasts = [];
  const cuerpo = `
    function closeModal() {}
    async function recargarCarreras() {}
    ${piezas}
    return { formatMonto, parseMonto, isoAInputLocal, inputLocalAISO,
             openModal, saveRecord, _toasts: toasts };`;

  const make = new AsyncFunction(
    'document', 'sb', 'reunionId', 'carreras', 'toast', 'confirm',
    'pisoSospechoso', 'toasts', 'console', cuerpo);
  return make(
    dom, sb, reunionId, carreras,
    (msg, tipo) => toasts.push({ msg, tipo }),
    () => true,
    () => false,          // pisoSospechoso: nunca dispara en el fixture
    toasts, console,
  );
}

// ─────────────────────────── el fixture ─────────────────────────────────────
// Las cuatro ventanas, cargadas como instantes correctos en hora argentina.
// 2099-05-04 12:00 AR = 2099-05-04 15:00 UTC.
const V = {
  ap_insc: { ar: '2099-05-01T09:00', utc: '2099-05-01T12:00:00+00:00' },
  ci_insc: { ar: '2099-05-04T12:00', utc: '2099-05-04T15:00:00+00:00' },
  ap_rat:  { ar: '2099-05-06T08:30', utc: '2099-05-06T11:30:00+00:00' },
  ci_rat:  { ar: '2099-05-07T18:45', utc: '2099-05-07T21:45:00+00:00' },
};
const inst = (s) => new Date(s).getTime();

// ═════════════════════════════ MUTATION TESTING ═════════════════════════════
const MUTANTES = [
  { id: 'M1', desc: 'vuelve el bug: las cuatro LECTURAS con .slice(0,16) sobre el ISO',
    mata: ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'],
    from: `  document.getElementById('f-ap-insc').value = isoAInputLocal(rec?.apertura_inscripcion);
  document.getElementById('f-ci-insc').value = isoAInputLocal(rec?.cierre_inscripcion);
  document.getElementById('f-ap-rat').value  = isoAInputLocal(rec?.apertura_ratificacion);
  document.getElementById('f-ci-rat').value  = isoAInputLocal(rec?.cierre_ratificacion);`,
    to: `  document.getElementById('f-ap-insc').value = rec?.apertura_inscripcion ? rec.apertura_inscripcion.slice(0,16) : '';
  document.getElementById('f-ci-insc').value = rec?.cierre_inscripcion ? rec.cierre_inscripcion.slice(0,16) : '';
  document.getElementById('f-ap-rat').value = rec?.apertura_ratificacion ? rec.apertura_ratificacion.slice(0,16) : '';
  document.getElementById('f-ci-rat').value = rec?.cierre_ratificacion ? rec.cierre_ratificacion.slice(0,16) : '';` },

  { id: 'M2', desc: 'vuelve el bug: las cuatro ESCRITURAS mandan el value pelado',
    mata: ['E1', 'R1', 'R2', 'R3', 'R4'],
    from: `    apertura_inscripcion: inputLocalAISO(document.getElementById('f-ap-insc').value),
    cierre_inscripcion: inputLocalAISO(document.getElementById('f-ci-insc').value),
    apertura_ratificacion: inputLocalAISO(document.getElementById('f-ap-rat').value),
    cierre_ratificacion: inputLocalAISO(document.getElementById('f-ci-rat').value),`,
    to: `    apertura_inscripcion: document.getElementById('f-ap-insc').value || null,
    cierre_inscripcion: document.getElementById('f-ci-insc').value || null,
    apertura_ratificacion: document.getElementById('f-ap-rat').value || null,
    cierre_ratificacion: document.getElementById('f-ci-rat').value || null,` },

  { id: 'M3', desc: 'isoAInputLocal lee la hora UTC (getUTCHours) en vez de la local',
    mata: ['L1', 'L2', 'L3', 'L4', 'H1', 'R1'],
    from: `  return \`\${d.getFullYear()}-\${p2(d.getMonth() + 1)}-\${p2(d.getDate())}\`
       + \`T\${p2(d.getHours())}:\${p2(d.getMinutes())}\`;`,
    to: `  return \`\${d.getUTCFullYear()}-\${p2(d.getUTCMonth() + 1)}-\${p2(d.getUTCDate())}\`
       + \`T\${p2(d.getUTCHours())}:\${p2(d.getUTCMinutes())}\`;` },

  { id: 'M4', desc: 'inputLocalAISO arma el Date en UTC (Date.UTC) en vez de local',
    mata: ['E1', 'H2', 'R1', 'R2', 'R3', 'R4'],
    from: `  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);`,
    to: `  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0));` },

  { id: 'M5', desc: 'sólo el CIERRE de inscripción vuelve al .slice — el resto queda bien',
    mata: ['L2', 'R2'],
    from: `  document.getElementById('f-ci-insc').value = isoAInputLocal(rec?.cierre_inscripcion);`,
    to: `  document.getElementById('f-ci-insc').value = rec?.cierre_inscripcion ? rec.cierre_inscripcion.slice(0,16) : '';` },

  { id: 'M6', desc: 'sólo el CIERRE de ratificación se guarda pelado — el resto queda bien',
    mata: ['R4'],
    from: `    cierre_ratificacion: inputLocalAISO(document.getElementById('f-ci-rat').value),`,
    to: `    cierre_ratificacion: document.getElementById('f-ci-rat').value || null,` },

  // OJO: M7 NO mata H2 —inst() reparsea el string pelado como hora local y da
  // el mismo instante—. Lo matan H2b (exige zona explícita en la cadena) y,
  // sobre todo, E1/R1, que van contra Postgres, donde el string sin zona es UTC.
  { id: 'M7', desc: 'inputLocalAISO devuelve el value sin convertir',
    mata: ['E1', 'H2b', 'R1'],
    from: `  return d.toISOString();
}`,
    to: `  return val;
}` },

  { id: 'M8', desc: 'las dos funciones dejan de ser inversas: isoAInputLocal suma una hora',
    mata: ['H3', 'L1'],
    from: `       + \`T\${p2(d.getHours())}:\${p2(d.getMinutes())}\`;`,
    to: `       + \`T\${p2(d.getHours() + 1)}:\${p2(d.getMinutes())}\`;` },
];

const argMut = process.argv.find(a => a === '--mutantes' || a.startsWith('--mutantes='));
if (argMut) {
  const pedidos = argMut.includes('=')
    ? argMut.split('=')[1].split(',').map(s => s.trim()).filter(Boolean) : null;
  if (pedidos) {
    const desconocidos = pedidos.filter(p => !MUTANTES.some(m => m.id === p));
    if (desconocidos.length) { console.error(`mutantes inexistentes: ${desconocidos.join(', ')}`); process.exit(2); }
  }
  const tanda = pedidos ? MUTANTES.filter(m => pedidos.includes(m.id)) : MUTANTES;
  const SELF = fileURLToPath(import.meta.url);
  const dir = mkdtempSync(join(tmpdir(), 'mut-carta-hora-'));
  try { symlinkSync(join(HERE, '..', 'node_modules'), join(dir, 'node_modules'), 'dir'); }
  catch (e) { console.warn(`[runner] no pude symlinkear node_modules al tmpdir: ${e.message}`); }
  console.log(`\n═══ MUTATION TESTING · ${tanda.length}/${MUTANTES.length} mutantes${pedidos ? ` (tanda: ${pedidos.join(',')})` : ''} ═══\n(copias en ${dir} — el repo no se toca)\n`);
  let vivos = 0, arnes = 0;
  for (const m of tanda) {
    if (!HTML.includes(m.from)) {
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el ancla no existe en el fuente. ${m.desc}`);
      arnes++; continue;
    }
    const path = join(dir, `${m.id}.html`);
    writeFileSync(path, HTML.replace(m.from, m.to));
    let out = '';
    try { out = execFileSync(process.execPath, [SELF], { env: { ...process.env, CARTA_HTML: path }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    // GOTCHA #84 — sin la línea final "NN/NN OK" el hijo no llegó a los asserts.
    if (!/^\d+\/\d+ OK$/m.test(out)) {
      const causa = (out.split('\n').find(l => /Error|error:/.test(l)) || '(sin línea de error)').trim();
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el probe no llegó a correr los asserts. ${m.desc}\n     ↳ ${causa.slice(0, 200)}`);
      arnes++; continue;
    }
    // GOTCHA #82 — anclar en el ')' del rótulo.
    const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));
    const vivo = muertos.length === 0;
    if (vivo) vivos++;
    console.log(`${vivo ? '❌' : '✅'} ${m.id} ${vivo ? 'SOBREVIVE' : 'muere'} — ${m.desc}`
      + `  [esperaba matar ${m.mata.join(',')}${muertos.length ? `; murieron ${muertos.join(',')}` : ''}]`);
  }
  const partes = [`${tanda.length - vivos - arnes} muertos`];
  if (vivos) partes.push(`${vivos} SOBREVIVEN`);
  if (arnes) partes.push(`${arnes} ERROR DE ARNÉS`);
  console.log(`\n${vivos === 0 && arnes === 0 ? '✅ TANDA LIMPIA' : '❌ TANDA CON HALLAZGOS'} — ${tanda.length} probados · ${partes.join(' · ')}\n`);
  process.exit(vivos === 0 && arnes === 0 ? 0 : 1);
}

// ══════════════════════════════ CORRIDA NORMAL ══════════════════════════════
const fx = { reuniones: [], carreras: [] };
const die = (ctx, e) => { throw new Error(`[${ctx}] ${e?.message ?? JSON.stringify(e)}`); };
async function ins(tabla, fila, bucket) {
  const { data, error } = await sb.from(tabla).insert(fila).select('id').single();
  if (error) die(`insert ${tabla}`, error);
  if (bucket) fx[bucket].push(data.id);
  return data.id;
}
const leer = async (id) => {
  const { data, error } = await sb.from('carreras')
    .select('apertura_inscripcion,cierre_inscripcion,apertura_ratificacion,cierre_ratificacion')
    .eq('id', id).single();
  if (error) die('leer carrera', error);
  return data;
};

(async () => {
  // Guard de arnés: sin UTC−3 todo lo de abajo es ruido.
  if (new Date('2099-05-04T15:00:00+00:00').getHours() !== 12) {
    console.error(`ARNÉS: el proceso no está en UTC−3 (TZ=${process.env.TZ}). Abortado.`);
    process.exit(2);
  }

  try {
    const { data: hip } = await sb.from('hipodromos').select('id').eq('club_id', CLUB_ID).limit(1).single();
    const { data: cat } = await sb.from('categorias_carrera').select('id').eq('club_id', CLUB_ID).limit(1).single();

    const reun = await ins('reuniones', {
      club_id: CLUB_ID, hipodromo_id: hip.id, numero: 9991,
      fecha: '2099-05-10', estado: 'borrador',
    }, 'reuniones');

    const carr = await ins('carreras', {
      reunion_id: reun, numero_turno: 1, distancia_metros: 1200, tipo_pista: 'tierra',
      condicion_sexo: 'ambos', categoria_id: cat.id, estado: 'abierta',
      // bolsa_total es NOT NULL y openModal deja el input vacío si es 0 (falsy),
      // con lo cual saveRecord mandaría null y la fila no se guardaría. Ver la
      // pregunta abierta del informe: es un bug real de carta-llamados, no del
      // probe. Acá el fixture lleva bolsa para poder ejercitar el guardado.
      bolsa_total: 1000000,
      distribucion_premios: { "1": 60, "2": 19, "3": 12, "4": 6, "5": 3 },
      apertura_inscripcion: V.ap_insc.utc,
      cierre_inscripcion: V.ci_insc.utc,
      apertura_ratificacion: V.ap_rat.utc,
      cierre_ratificacion: V.ci_rat.utc,
    }, 'carreras');

    // ── A) LOS HELPERS, sueltos ──────────────────────────────────────────────
    const dom = mkDom();
    const C = await mkCarta({ dom, reunionId: reun, carreras: [] });

    ok('H1) isoAInputLocal convierte el instante a hora argentina',
       C.isoAInputLocal(V.ci_insc.utc) === V.ci_insc.ar,
       `${V.ci_insc.utc} → "${C.isoAInputLocal(V.ci_insc.utc)}"  (esperado "${V.ci_insc.ar}")`);

    ok('H2) inputLocalAISO da el instante correcto',
       inst(C.inputLocalAISO(V.ci_insc.ar)) === inst(V.ci_insc.utc),
       `"${V.ci_insc.ar}" → ${C.inputLocalAISO(V.ci_insc.ar)}  (esperado el instante de ${V.ci_insc.utc})`);

    // H2 solo NO alcanza: inst() vuelve a parsear con las reglas de JS, que
    // interpretan "2099-05-04T12:00" como hora local y dan el mismo número. O
    // sea que un inputLocalAISO que devolviera el value pelado pasaría H2. Lo
    // que NO puede pasar es Postgres, que toma el string sin zona como UTC —
    // por eso el assert de verdad es E1, contra la base. H2b cierra el hueco
    // acá mismo, exigiendo que la cadena lleve zona explícita.
    ok('H2b) …y la cadena que devuelve lleva zona explícita (Z u offset)',
       /(Z|[+-]\d{2}:\d{2})$/.test(String(C.inputLocalAISO(V.ci_insc.ar))),
       `"${C.inputLocalAISO(V.ci_insc.ar)}"`);

    const idayvuelta = ['2099-05-04T15:00:00+00:00', '2026-09-11T15:00:00+00:00',
                        '2026-01-01T03:00:00+00:00', '2026-12-31T02:59:00+00:00'];
    ok('H3) las dos funciones son inversas exactas: ISO → input → ISO no mueve el instante',
       idayvuelta.every(iso => inst(C.inputLocalAISO(C.isoAInputLocal(iso))) === inst(iso)),
       idayvuelta.map(iso => `${iso}→${C.inputLocalAISO(C.isoAInputLocal(iso))}`).join(' · '));

    ok('H4) vacío y basura no explotan',
       C.isoAInputLocal(null) === '' && C.isoAInputLocal('') === ''
       && C.inputLocalAISO(null) === null && C.inputLocalAISO('') === null
       && C.inputLocalAISO('cualquier cosa') === null);

    // ── B) LECTURA: openModal con el registro REAL de la base ────────────────
    const { data: recDb, error: eRec } = await sb.from('carreras').select('*').eq('id', carr).single();
    if (eRec) die('select carrera', eRec);
    C.openModal(recDb);

    ok('L1) apertura de inscripción se muestra en hora argentina',
       dom._get('f-ap-insc').value === V.ap_insc.ar,
       `input="${dom._get('f-ap-insc').value}"  esperado="${V.ap_insc.ar}"  (db=${recDb.apertura_inscripcion})`);
    ok('L2) cierre de inscripción se muestra en hora argentina',
       dom._get('f-ci-insc').value === V.ci_insc.ar,
       `input="${dom._get('f-ci-insc').value}"  esperado="${V.ci_insc.ar}"  (db=${recDb.cierre_inscripcion})`);
    ok('L3) apertura de ratificación se muestra en hora argentina',
       dom._get('f-ap-rat').value === V.ap_rat.ar,
       `input="${dom._get('f-ap-rat').value}"  esperado="${V.ap_rat.ar}"`);
    ok('L4) cierre de ratificación se muestra en hora argentina',
       dom._get('f-ci-rat').value === V.ci_rat.ar,
       `input="${dom._get('f-ci-rat').value}"  esperado="${V.ci_rat.ar}"`);

    // ── C) ESCRITURA: cargar 12:00 en el input tiene que guardar 12:00 AR ────
    // Es el caso exacto de Yesi: escribe "12:00" y espera que sea el mediodía.
    dom._get('f-id').value = carr;
    dom._get('f-ci-insc').value = '2026-09-11T12:00';
    await C.saveRecord();

    const trasEscribir = await leer(carr);
    ok('E1) cargar 12:00 en el input guarda las 12:00 DE ARGENTINA',
       inst(trasEscribir.cierre_inscripcion) === inst('2026-09-11T15:00:00+00:00'),
       `db=${trasEscribir.cierre_inscripcion}  (esperado el instante de 2026-09-11T15:00:00+00:00 = 12:00 AR)`);

    ok('E2) y se relee como 12:00 en el input',
       C.isoAInputLocal(trasEscribir.cierre_inscripcion) === '2026-09-11T12:00',
       `relectura="${C.isoAInputLocal(trasEscribir.cierre_inscripcion)}"`);

    ok('E3) no hubo toast de error al guardar',
       C._toasts.filter(t => t.tipo === 'error').length === 0,
       JSON.stringify(C._toasts));

    // ── D) IDA Y VUELTA COMPLETA: abrir y guardar sin tocar nada ────────────
    // Es el assert que importa: si abrir el modal y darle Guardar mueve una
    // fecha, la pantalla corrompe datos con sólo mirarlos. Cada vuelta tiene
    // que dejar los CUATRO instantes idénticos.
    // Se parte del estado real de la base tras el paso C.
    const antes = await leer(carr);
    const dom2 = mkDom();
    const C2 = await mkCarta({ dom: dom2, reunionId: reun, carreras: [] });
    const { data: rec2 } = await sb.from('carreras').select('*').eq('id', carr).single();
    C2.openModal(rec2);
    dom2._get('f-id').value = carr;
    await C2.saveRecord();          // Guardar SIN editar nada
    const vuelta1 = await leer(carr);

    const campos = [
      ['R1', 'apertura_inscripcion',   'apertura de inscripción'],
      ['R2', 'cierre_inscripcion',     'cierre de inscripción'],
      ['R3', 'apertura_ratificacion',  'apertura de ratificación'],
      ['R4', 'cierre_ratificacion',    'cierre de ratificación'],
    ];
    for (const [rot, col, label] of campos) {
      ok(`${rot}) ida y vuelta sin editar: ${label} no se mueve`,
         inst(vuelta1[col]) === inst(antes[col]),
         `antes=${antes[col]}  después=${vuelta1[col]}`
         + (inst(vuelta1[col]) === inst(antes[col]) ? '' :
            `  · corrimiento=${(inst(vuelta1[col]) - inst(antes[col])) / 3600000} h`));
    }

    // Segunda vuelta: el bug viejo corría −3 h POR VUELTA, así que dos vueltas
    // lo hacían evidente aunque una sola pasara desapercibida.
    const dom3 = mkDom();
    const C3 = await mkCarta({ dom: dom3, reunionId: reun, carreras: [] });
    const { data: rec3 } = await sb.from('carreras').select('*').eq('id', carr).single();
    C3.openModal(rec3);
    dom3._get('f-id').value = carr;
    await C3.saveRecord();
    const vuelta2 = await leer(carr);

    ok('R5) dos vueltas seguidas tampoco mueven ninguno de los cuatro',
       campos.every(([, col]) => inst(vuelta2[col]) === inst(antes[col])),
       campos.map(([, col]) => `${col}: ${(inst(vuelta2[col]) - inst(antes[col])) / 3600000}h`).join(' · '));

    ok('R6) y el input sigue mostrando lo mismo después de las dos vueltas',
       C3.isoAInputLocal(vuelta2.cierre_inscripcion) === '2026-09-11T12:00',
       `"${C3.isoAInputLocal(vuelta2.cierre_inscripcion)}"`);

    // ── E) LO QUE NO SE TOCÓ ────────────────────────────────────────────────
    ok('F1) los cuatro inputs de ventana siguen siendo datetime-local',
       (HTML.match(/<input type="datetime-local" id="f-(ap|ci)-(insc|rat)">/g) || []).length === 4,
       `encontrados=${(HTML.match(/<input type="datetime-local" id="f-(ap|ci)-(insc|rat)">/g) || []).length}`);
    ok('F2) no quedó ningún .slice(0,16) sobre una fecha en el archivo',
       !/\.(apertura|cierre)_\w+\.slice\(0,\s*16\)/.test(HTML));
    ok('F3) hora_estimada (time sin zona) sigue yendo cruda, sin conversión',
       HTML.includes("hora_estimada: document.getElementById('f-hora').value || null"));

  } finally {
    for (const id of fx.carreras) await sb.from('carreras').delete().eq('id', id);
    for (const id of fx.reuniones) await sb.from('reuniones').delete().eq('id', id);
    const { data: quedan } = await sb.from('reuniones')
      .select('id').eq('club_id', CLUB_ID).eq('numero', 9991);
    ok('T1) teardown: no quedó ninguna reunión 9991 en la base',
       (quedan || []).length === 0, `quedan=${(quedan || []).length}`);
  }

  console.log('\n── Probe · carta-llamados, las cuatro ventanas en hora argentina ──');
  console.log(`   html=${HTML_PATH}`);
  console.log(`   TZ=${process.env.TZ}  ·  offset=${-new Date('2099-05-04T15:00:00Z').getTimezoneOffset() / 60} h`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
