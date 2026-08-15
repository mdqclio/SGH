/**
 * Probe cuerpos en la vista oficial — fix/resultados-mostrar-cuerpos.
 *
 * renderOficial() de resultados.html no imprimia resultado_posiciones.diferencia (la ventaja
 * de llegada). El dato estaba en la DB desde junio; se perdio al reescribir la vista (el
 * legacy sí lo pintaba, resultados_legacy.html:403). Este probe corre el renderOficial REAL
 * extraido del working tree, con datos REALES de R6, y coteja el texto emitido contra la
 * planilla oficial de Yesi (tmp/R6 resultados planilla.json, columna distancia_llegada).
 *
 * Sin browser (chromium no corre en ubuntu26.04): AsyncFunction + stubs de DOM. SOLO LECTURA,
 * no escribe nada en la DB.
 *
 * Bloques:
 *   A  cobertura: cada posicion con diferencia en DB emite un .pos-dif con ese texto.
 *   B  el 1° de cada carrera NO emite .pos-dif (diferencia NULL por diseno, res. l.1411).
 *   C  posicion sin dato cargado tampoco emite el nodo (ni guion ni hueco) — criterio K E S P.
 *   D  cotejo contra la planilla: cada ventaja normalizada tiene que coincidir.
 *   E  R8 sigue por renderFormulario (ninguna carrera oficial) — la pantalla de carga en vivo
 *      no cambia.
 *
 * Uso:
 *   set -a; . ./.env; set +a
 *   node tests/probe_cuerpos_oficial.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Exportala (o source .env) antes de correr.`);
  return v;
}

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || requireEnv('SUPABASE_SECRET_KEY');

const R6 = 'b02ca761-6f44-4720-86aa-a3c3099019ea';   // 20/06/2026
const R8_FECHA = '2026-08-16';                        // reunion de agosto, sin resultados

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? 'OK' : 'FALLA', n }); return c; };

/* ── harness: extraer el cuerpo real de una funcion del HTML ── */
function extractFnBody(html, signature) {
  const start = html.indexOf(signature);
  if (start < 0) throw new Error(`No encontre la firma: ${signature}`);
  const braceOpen = html.indexOf('{', start);
  let depth = 0, i = braceOpen;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) break; }
  }
  return html.slice(braceOpen + 1, i);
}

/* ── normalizacion de ventajas a forma canonica {u, v} ──
   u = unidad (cpo/cbz/pzo/hoc/emp/vm/sa/desm), v = cantidad. Los dos lados escriben distinto:
   la planilla usa "1 1/2CP" / "S/A" / "1/2CZA"; la DB guarda el codigo del catalogo de
   chapas.js: "1½ cpo" / "s.a." / "½ cbz". Ademas la planilla mezcla CP y CPS sin respetar
   el plural, asi que la comparacion es por (unidad, cantidad), no por string. */
function canonPlanilla(raw) {
  const s = (raw || '').trim().toUpperCase();
  if (!s) return null;
  if (s === 'S/A' || s === 'SA') return { u: 'sa', v: 1 };
  if (s === 'VM') return { u: 'vm', v: 1 };
  if (s === 'EMP') return { u: 'emp', v: 1 };
  if (s === 'HOC') return { u: 'hoc', v: 1 };
  if (s.startsWith('DESM')) return { u: 'desm', v: 1 };
  const m = s.match(/^(?:(\d+)\s*)?(?:(\d)\/(\d))?\s*(CPS|CP|CZA|PZO)$/);
  if (!m) return { u: '?', v: NaN, raw: s };
  const ent  = m[1] ? parseInt(m[1], 10) : 0;
  const frac = m[2] ? parseInt(m[2], 10) / parseInt(m[3], 10) : 0;
  const u = (m[4] === 'CPS' || m[4] === 'CP') ? 'cpo' : m[4] === 'CZA' ? 'cbz' : 'pzo';
  return { u, v: (ent + frac) || 1 };
}

function canonDB(raw) {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 's.a.') return { u: 'sa', v: 1 };
  if (s === 'vm')   return { u: 'vm', v: 1 };
  if (s === 'emp')  return { u: 'emp', v: 1 };
  if (s === 'hoc')  return { u: 'hoc', v: 1 };
  if (s === 'desm.') return { u: 'desm', v: 1 };
  const m = s.match(/^(\d+)?\s*([½¾])?\s*(cpos|cpo|cbz|cza|pzo)$/);
  if (!m) return { u: '?', v: NaN, raw: s };
  const ent  = m[1] ? parseInt(m[1], 10) : 0;
  const frac = m[2] === '½' ? 0.5 : m[2] === '¾' ? 0.75 : 0;
  const u = m[3].startsWith('cp') ? 'cpo' : (m[3] === 'cbz' || m[3] === 'cza') ? 'cbz' : 'pzo';
  return { u, v: (ent + frac) || 1 };
}

const sameVentaja = (a, b) =>
  (a === null && b === null) || (!!a && !!b && a.u === b.u && a.v === b.v);
const showV = v => v === null ? '(vacio)' : `${v.v} ${v.u}`;

/* ── parse ligero del HTML emitido: un registro por <li> de .pos-list ── */
function parsePosList(html) {
  const ul = html.match(/<ul class="pos-list">([\s\S]*?)<\/ul>/);
  if (!ul) return [];
  return [...ul[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(li => {
    const frag = li[1];
    const num  = frag.match(/<div class="pos-num">(\d+)°<\/div>/);
    const spc  = frag.match(/<div class="pos-spc">\[(\d+|\?)\]\s*([^<]*?)(?:\s*<span|<\/div>)/);
    const dif  = frag.match(/<div class="pos-dif">([^<]*)<\/div>/);
    return {
      posicion: num ? parseInt(num[1], 10) : null,
      mandil:   spc ? spc[1] : null,
      nombre:   spc ? spc[2].trim() : null,
      dif:      dif ? dif[1] : null,          // null = el nodo NO se emitio
      difNodes: (frag.match(/pos-dif/g) || []).length,
      texto:    frag.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    };
  });
}

async function main() {
  const html = readFileSync(join(ROOT, 'resultados.html'), 'utf8');
  const renumJs = readFileSync(join(ROOT, 'renumerar-chapas.js'), 'utf8');

  // helper REAL renumerarChapas (mismo archivo que sirve prod)
  const renumerarChapas = new Function(`${renumJs}; return renumerarChapas;`)();

  const body = extractFnBody(html, 'function renderOficial(carrera, res, pos, apus, insc)');
  ok('H1 cuerpo de renderOficial extraido', body.length > 500);
  ok('H2 renderOficial referencia p.diferencia', /p\.diferencia/.test(body),
     'si falla, el fix no esta en el archivo');

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction(
    'carrera', 'res', 'pos', 'apus', 'insc',
    'isDirty', 'divViewEditable',
    'renumerarChapas', 'spcsMap', 'carreras', 'carreraApuestasMap', 'renderDivHTML', 'document',
    body
  );

  /* ── datos REALES de R6 (mismos selects que resultados.html l.467/503-516) ── */
  const [{ data: carrerasR6 }, { data: spcs }] = await Promise.all([
    sb.from('carreras').select('*').eq('reunion_id', R6).order('numero_turno'),
    sb.from('spcs').select('id,nombre').order('nombre'),
  ]);
  const carIds = carrerasR6.map(c => c.id);
  const [{ data: inscAll }, { data: resAll }] = await Promise.all([
    sb.from('inscripciones').select('*').in('carrera_id', carIds),
    sb.from('resultados').select('*').in('carrera_id', carIds),
  ]);
  const resIds = resAll.map(r => r.id);
  const [{ data: posAll }, { data: capAll }] = await Promise.all([
    sb.from('resultado_posiciones').select('*').in('resultado_id', resIds),
    sb.from('carrera_apuestas').select('*').in('carrera_id', carIds),
  ]);

  const spcsMap = Object.fromEntries(spcs.map(s => [s.id, s]));
  const carreraApuestasMap = {};
  capAll.forEach(a => { (carreraApuestasMap[a.carrera_id] ||= []).push(a); });
  const posicionesMap = {};
  posAll.forEach(p => { (posicionesMap[p.resultado_id] ||= []).push(p); });
  const resultadosMap = Object.fromEntries(resAll.map(r => [r.carrera_id, r]));

  const oficiales = carrerasR6.filter(c => resultadosMap[c.id]?.estado === 'oficial')
    .sort((a, b) => (a.numero_carrera_programa ?? a.numero_turno) - (b.numero_carrera_programa ?? b.numero_turno));
  ok('D0 R6 tiene 8 carreras oficiales', oficiales.length === 8, `hay ${oficiales.length}`);

  /* ── planilla de Yesi ── */
  const planilla = JSON.parse(readFileSync(join(ROOT, 'tmp', 'R6 resultados planilla.json'), 'utf8'));
  const planillaPorNum = Object.fromEntries(
    planilla.map(c => [parseInt(String(c.carrera).replace(/\D/g, ''), 10), c])
  );

  /* ── render de las 8 carreras ── */
  const salida = [];
  let difsEmitidas = 0, difsEsperadas = 0, primerosConDif = 0, huecosEmitidos = 0;
  const discrepancias = [];

  for (const carrera of oficiales) {
    const res  = resultadosMap[carrera.id];
    const pos  = posicionesMap[res.id] || [];
    const insc = inscAll.filter(i => i.carrera_id === carrera.id);

    let emitido = '';
    const documentStub = {
      getElementById: id => id === 'main-container'
        ? { set innerHTML(v) { emitido = v; }, get innerHTML() { return emitido; } }
        : null,
    };
    // renderDivHTML se stubea: la columna de dividendos no es lo que este probe verifica.
    await fn(carrera, res, pos, [], insc, false, false,
             renumerarChapas, spcsMap, carrerasR6, carreraApuestasMap, () => '', documentStub);

    const filas = parsePosList(emitido);
    const num = carrera.numero_carrera_programa ?? carrera.numero_turno;
    const pl = planillaPorNum[num];
    const plPorPos = Object.fromEntries(
      (pl?.posiciones || []).filter(p => /^\d+$/.test(p.pos)).map(p => [parseInt(p.pos, 10), p])
    );

    const detalle = filas.map(f => {
      const dbRow = pos.find(p => p.posicion === f.posicion);
      const plRow = plPorPos[f.posicion];
      const cDB = canonDB(f.dif);
      const cPL = canonPlanilla(plRow?.distancia_llegada);
      const coincide = sameVentaja(cDB, cPL);
      if (dbRow?.diferencia) difsEsperadas++;
      if (f.dif !== null) difsEmitidas++;
      if (f.posicion === 1 && f.dif !== null) primerosConDif++;
      if (f.dif !== null && f.dif.trim() === '') huecosEmitidos++;
      if (!coincide) {
        discrepancias.push({ carrera: num, pos: f.posicion, spc: f.nombre,
                             vista: f.dif ?? '(sin nodo)', planilla: plRow?.distancia_llegada ?? '(sin fila)' });
      }
      return { ...f, db: dbRow?.diferencia ?? null, pl: plRow?.distancia_llegada ?? null, coincide };
    });
    salida.push({ num, turno: carrera.numero_turno, nombre: carrera.nombre, premio: pl?.premio, detalle,
                  noLargo: pos.filter(p => p.no_largo).length });
  }

  /* ── A: cobertura ── */
  ok('A1 se emite un .pos-dif por cada diferencia cargada en DB',
     difsEmitidas === difsEsperadas, `emitidas ${difsEmitidas} vs esperadas ${difsEsperadas}`);
  ok('A2 son las 50 ventajas de R6', difsEsperadas === 50, `esperadas ${difsEsperadas}`);
  ok('A3 el texto emitido es identico al de la DB',
     salida.every(c => c.detalle.every(f => f.dif === f.db)));

  /* ── B: el 1° no lleva ventaja ── */
  ok('B1 ningun 1° emite .pos-dif', primerosConDif === 0, `${primerosConDif} lo emiten`);
  ok('B2 hay 8 primeros puestos', salida.filter(c => c.detalle.some(f => f.posicion === 1)).length === 8);

  /* ── C: sin dato -> sin nodo (criterio K E S P) ── */
  ok('C1 no se emite .pos-dif vacio', huecosEmitidos === 0, `${huecosEmitidos} vacios`);
  const sinDato = salida.flatMap(c => c.detalle.filter(f => f.db === null));
  ok('C2 toda posicion sin dato omite el nodo entero', sinDato.every(f => f.difNodes === 0),
     `${sinDato.length} posiciones sin dato`);
  ok('C3 ningun texto queda con guion o separador colgando',
     salida.every(c => c.detalle.every(f => !/[—–-]\s*$/.test(f.texto))));
  // no_largo no entra a la lista (posOrdenadas los filtra) -> 58 li en total, no 81
  const totalLi = salida.reduce((n, c) => n + c.detalle.length, 0);
  ok('C4 la lista trae solo los que largaron (58)', totalLi === 58, `hay ${totalLi}`);

  /* ── D: cotejo contra la planilla ── */
  ok('D1 cada ventaja coincide con la planilla de Yesi', discrepancias.length === 0,
     `${discrepancias.length} discrepancias`);

  /* ── E: R8 no cambia ── */
  const { data: r8 } = await sb.from('reuniones').select('id,numero,fecha').eq('fecha', R8_FECHA).maybeSingle();
  if (r8) {
    const { data: carrerasR8 } = await sb.from('carreras').select('id').eq('reunion_id', r8.id);
    const idsR8 = carrerasR8.map(c => c.id);
    const { data: resR8 } = await sb.from('resultados').select('id,estado').in('carrera_id', idsR8);
    const oficialesR8 = (resR8 || []).filter(r => r.estado === 'oficial').length;
    ok('E1 R8 no tiene ninguna carrera oficial -> va por renderFormulario',
       oficialesR8 === 0, `${oficialesR8} oficiales`);
    ok('E2 R8 no tiene resultados cargados', (resR8 || []).length === 0,
       `${(resR8 || []).length} filas en resultados`);
  } else {
    ok('E1 R8 localizada', false, `no hay reunion con fecha ${R8_FECHA}`);
  }
  // el formulario de carga y el picker no se tocaron
  ok('E3 openChapaDropdown intacto', /function openChapaDropdown\(p\) \{/.test(html));
  ok('E4 renderFormulario no menciona pos-dif',
     !/pos-dif/.test(extractFnBody(html, 'function renderFormulario(')));

  /* ── reporte ── */
  console.log('\n══ R6 — 20/06/2026 — vista oficial, posicion por posicion ══');
  for (const c of salida) {
    console.log(`\n── Carrera ${c.num} (turno ${c.turno}) — ${c.premio || c.nombre || ''}   [${c.noLargo} no largaron]`);
    console.log('   pos  mandil  ejemplar                   vista            planilla');
    for (const f of c.detalle) {
      const mark = f.coincide ? ' ' : ' <-- DISCREPANCIA';
      console.log(`   ${String(f.posicion).padStart(2)}°   ${String(f.mandil).padStart(4)}   ` +
        `${(f.nombre || '').padEnd(24).slice(0, 24)}  ${(f.dif ?? '—(sin nodo)').padEnd(14)}   ` +
        `${(f.pl || '(vacio)').padEnd(10)}${mark}`);
    }
  }

  if (discrepancias.length) {
    console.log('\n══ DISCREPANCIAS vs planilla ══');
    discrepancias.forEach(d => console.log(`   c${d.carrera} pos ${d.pos} ${d.spc}: vista="${d.vista}" planilla="${d.planilla}"`));
  }

  console.log('\n══ Checks ══');
  results.forEach(r => console.log(`  ${r.s === 'OK' ? '✅' : '❌'} ${r.t}${r.n ? ` — ${r.n}` : ''}`));
  const fallas = results.filter(r => r.s !== 'OK').length;
  console.log(`\n${results.length - fallas}/${results.length} checks OK`);
  process.exit(fallas ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
