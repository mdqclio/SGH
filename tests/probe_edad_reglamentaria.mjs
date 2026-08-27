#!/usr/bin/env node
/**
 * probe_edad_reglamentaria.mjs — Gate del fix de edad de SPC.
 *
 * En hipismo la edad se cuenta desde el 1° de julio (Reglamento General de Carreras):
 * todos los SPC cumplen anos ese dia. El codigo calculaba edad cronologica exacta y
 * ademas usaba new Date() (hoy) en vez de la fecha de la reunion.
 *
 * Compara, para cada ratificado de R8:
 *   - edad que imprime el codigo previo al fix (`git show 42f9942:programa-oficial.html`)
 *   - edad que imprime el codigo corregido (HEAD, via edad-spc.js)
 *   - edad publicada por el Stud Book (scrape del perfil, fuente de verdad)
 *
 * READ-ONLY: solo SELECT contra Supabase y GET contra studbook.org.ar.
 *   set -a; . ./.env; set +a; node tests/probe_edad_reglamentaria.mjs
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const { createClient } = (await import('/home/clio/dev/SGH/node_modules/@supabase/supabase-js/dist/index.cjs')).default;

const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY: set -a; . ./.env; set +a'); process.exit(2); }
const sb = createClient('https://unlhcuanfrtpatoipwve.supabase.co', KEY, { auth: { persistSession: false } });
const R8 = '7b6e003e-22e2-4629-bf55-f18560b1260f';

let pass = 0, fail = 0;
const ok  = m => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${m}`); };
const bad = m => { fail++; console.log(`  \x1b[31m✘\x1b[0m ${m}`); };
const asrt = (c, m) => (c ? ok(m) : bad(m));

// ── El calcEdad viejo, extraido de main tal cual ─────────────────────────────
function extractFnBody(src, sig) {
  const s = src.indexOf(sig);
  const o = src.indexOf('{', s + sig.length - 1); let d = 0, i = o;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; }
  return src.slice(o + 1, i);
}
// Baseline fijado al commit ANTERIOR al merge del fix (42f9942), no a `main`: una vez
// mergeado, `main` ya no tiene calcEdad() y el contraste antes/despues se pierde solo.
const BASELINE = '42f9942';
const mainHtml = execSync(`git show ${BASELINE}:programa-oficial.html`, { encoding: 'utf8', maxBuffer: 32e6 });
if (!mainHtml.includes('function calcEdad(fecha)'))
  throw new Error(`El baseline ${BASELINE} no tiene calcEdad(): revisar la referencia.`);
const calcEdadViejo = new Function('fecha', extractFnBody(mainHtml, 'function calcEdad(fecha)'));

// ── El helper nuevo, cargado del archivo real ────────────────────────────────
const g = {};
new Function('window', readFileSync(new URL('../edad-spc.js', import.meta.url), 'utf8'))(g);
const { edadSPC } = g;

// ── Stud Book ────────────────────────────────────────────────────────────────
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const SB_HEADERS = { 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://www.studbook.org.ar/ejemplares', 'User-Agent': 'Mozilla/5.0' };

// Hay homonimos en el Stud Book (mismo nombre, otro ejemplar de los 70/90). Cuando el
// nombre no alcanza se desambigua por fecha de nacimiento contra la que tiene la base:
// es exacta y no deja lugar a eleccion.
async function sbBuscar(nombre, nacDB) {
  const url = 'https://www.studbook.org.ar/ejemplares/autocomplete?tipo=1&muerto=1&term=' + encodeURIComponent(nombre);
  const r = await fetch(url, { headers: SB_HEADERS });
  if (!r.ok) return null;
  const hits = await r.json();
  const ex = hits.filter(h => norm(h.text) === norm(nombre));
  if (ex.length === 1) return { ...ex[0], _via: 'nombre' };
  const [y, m, d] = String(nacDB || '').split('-');
  const porFecha = ex.filter(h => h.nacimiento === `${d}/${m}/${y}`);
  return porFecha.length === 1 ? { ...porFecha[0], _via: 'nombre+nacimiento' } : null;
}
async function sbEdad(hit) {
  const r = await fetch(`https://www.studbook.org.ar/ejemplares/perfil/${hit.id}/${hit.url_friendly}`, { headers: SB_HEADERS });
  if (!r.ok) return null;
  const txt = (await r.text()).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  const m = txt.match(/(\d{2}\/\d{2}\/\d{4})\s*\((\d+)\s*a[nñ]os?\)/);
  return m ? { nacimiento: m[1], edad: Number(m[2]) } : null;
}

// ── Datos de R8 ──────────────────────────────────────────────────────────────
const { data: reunion } = await sb.from('reuniones').select('fecha,numero').eq('id', R8).single();
const { data: carreras } = await sb.from('carreras').select('*').eq('reunion_id', R8)
  .or('estado.is.null,estado.neq.anulada').order('numero_carrera_programa');
const { data: inscs } = await sb.from('inscripciones').select('*')
  .in('carrera_id', carreras.map(c => c.id)).eq('estado', 'ratificado');
const { data: spcs } = await sb.from('spcs').select('*').in('id', [...new Set(inscs.map(i => i.spc_id))]);
const S = Object.fromEntries(spcs.map(s => [s.id, s]));
const C = Object.fromEntries(carreras.map(c => [c.id, c]));

console.log(`\n=== probe_edad_reglamentaria — R8, reunion del ${reunion.fecha} ===`);
console.log(`Ratificados: ${inscs.length} · fecha de referencia del fix: ${reunion.fecha}\n`);

// ── Scrape (concurrencia baja, para no castigar al Stud Book) ────────────────
const filas = [];
const pend = inscs.map(i => ({ i, s: S[i.spc_id], c: C[i.carrera_id] }))
  .sort((a, b) => (a.c.numero_carrera_programa - b.c.numero_carrera_programa) ||
                  ((a.i.numero_partidor || 0) - (b.i.numero_partidor || 0)));
const LOTE = 4;
for (let k = 0; k < pend.length; k += LOTE) {
  await Promise.all(pend.slice(k, k + LOTE).map(async ({ i, s, c }) => {
    const hit = await sbBuscar(s.nombre, s.fecha_nacimiento);
    const sbi = hit ? await sbEdad(hit) : null;
    filas.push({
      carrera: c.numero_carrera_programa,
      nombre: s.nombre,
      nac: s.fecha_nacimiento,
      hoy: calcEdadViejo(s.fecha_nacimiento),
      fix: edadSPC(s.fecha_nacimiento, reunion.fecha),
      sb: sbi ? sbi.edad : null,
      sb_id: hit ? hit.id : null,
      sb_nac: sbi ? sbi.nacimiento : null,
      via: hit ? hit._via : null,
    });
  }));
}
filas.sort((a, b) => (a.carrera - b.carrera) || a.nombre.localeCompare(b.nombre));

// ── Tabla ────────────────────────────────────────────────────────────────────
console.log('  C#  SPC                        NACIMIENTO   HOY  FIX   SB   ');
console.log('  ──  ─────────────────────────  ──────────  ────  ───  ────  ─────');
for (const f of filas) {
  const coincide = f.sb !== null && f.fix === f.sb;
  const marca = f.sb === null ? ' ?? sin dato SB' : (coincide ? '' : '  <<< NO COINCIDE');
  const cambio = f.hoy !== f.fix ? ' *' : '  ';
  console.log(`  ${String(f.carrera).padStart(2)}  ${f.nombre.slice(0,25).padEnd(25)}  ${String(f.nac).padEnd(10)}  ${String(f.hoy).padStart(3)}${cambio} ${String(f.fix).padStart(3)}  ${String(f.sb ?? '—').padStart(3)}${marca}`);
}

const conSB     = filas.filter(f => f.sb !== null);
const sinSB     = filas.filter(f => f.sb === null);
const coinciden = conSB.filter(f => f.fix === f.sb);
const noCoinc   = conSB.filter(f => f.fix !== f.sb);
const viejoOk   = conSB.filter(f => f.hoy === f.sb);
const cambiaron = filas.filter(f => f.hoy !== f.fix);

console.log(`\n  (*) = la edad cambia respecto del baseline\n`);
console.log(`  resueltos en el Stud Book ...... ${conSB.length}/${filas.length}`);
console.log(`  FIX coincide con Stud Book ..... ${coinciden.length}/${conSB.length}`);
console.log(`  main coincidia con Stud Book ... ${viejoOk.length}/${conSB.length}`);
console.log(`  filas cuya edad cambia ......... ${cambiaron.length}`);

console.log('');
asrt(filas.length === inscs.length, `una fila por ratificado (${filas.length}/${inscs.length})`);
asrt(sinSB.length === 0, `todos resueltos en el Stud Book (sin dato: ${sinSB.length}${sinSB.length ? ' -> ' + sinSB.map(f=>f.nombre).join(', ') : ''})`);
asrt(noCoinc.length === 0,
     `la edad corregida coincide con el Stud Book en todas (difieren: ${noCoinc.length}${noCoinc.length ? ' -> ' + noCoinc.map(f => `${f.nombre}: fix ${f.fix} vs SB ${f.sb}`).join(', ') : ''})`);
asrt(viejoOk.length < conSB.length, `el baseline ${BASELINE} NO coincidia con el Stud Book en al menos una (coincidia en ${viejoOk.length}/${conSB.length})`);
// La fecha de nacimiento de la base coincide con la del Stud Book.
const nacDistinto = conSB.filter(f => {
  const [d, m, y] = f.sb_nac.split('/');
  return `${y}-${m}-${d}` !== String(f.nac);
});
asrt(nacDistinto.length === 0,
     `la fecha de nacimiento de la base coincide con el Stud Book (difieren: ${nacDistinto.length}${nacDistinto.length ? ' -> ' + nacDistinto.map(f => `${f.nombre}: DB ${f.nac} vs SB ${f.sb_nac}`).join(', ') : ''})`);

// ── Determinismo: la edad no depende de cuando se imprima ────────────────────
console.log('');
const otroDia = filas.every(f => edadSPC(f.nac, reunion.fecha) === f.fix);
asrt(otroDia, 'la edad depende de la fecha de la reunion, no de hoy (reimpresion estable)');
const sinRef = filas.filter(f => edadSPC(f.nac) !== edadSPC(f.nac, reunion.fecha));
console.log(`     (si se usara "hoy" en vez de la fecha de reunion cambiarian ${sinRef.length} filas)`);
asrt(!/new Date\(\)/.test(readFileSync(new URL('../edad-spc.js', import.meta.url), 'utf8')
      .split('function edadSPC')[1].split('function edadSPCTexto')[0]),
     'edadSPC() no usa new Date() en su cuerpo');

// ── Chequeo cruzado con la condicion de edad de cada carrera ─────────────────
console.log('\n── Condicion de edad por carrera ──');
// edad_minima_anos / edad_maxima_anos estan en NULL en las 8 carreras de R8, asi que la
// condicion real vive en el texto de condicion_handicap. Se interpretan los dos patrones
// que usa Dolores; cualquier otro se reporta como no interpretable en vez de darse por bueno.
function condicionEdad(c) {
  if (c.edad_minima_anos != null || c.edad_maxima_anos != null) {
    return { min: c.edad_minima_anos, max: c.edad_maxima_anos, fuente: 'campos estructurados' };
  }
  const t = (c.condicion_handicap || '').toLowerCase();
  // "de 6 años y más edad" / "de 4 años y + edad"  ->  minimo, sin maximo
  let m = t.match(/de\s+(\d+)\s*a[nñ]os?\s+y\s*(?:m[aá]s|\+)/);
  if (m) return { min: +m[1], max: null, fuente: `texto: "${c.condicion_handicap}"` };
  // "de 4 y 5 años"  ->  rango cerrado
  m = t.match(/de\s+(\d+)\s+y\s+(\d+)\s*a[nñ]os?/);
  if (m) return { min: +m[1], max: +m[2], fuente: `texto: "${c.condicion_handicap}"` };
  // "de 4 años" a secas  ->  edad exacta
  m = t.match(/de\s+(\d+)\s*a[nñ]os?/);
  if (m) return { min: +m[1], max: +m[1], fuente: `texto: "${c.condicion_handicap}"` };
  return { min: null, max: null, fuente: null };
}

let fueraNuevo = 0, fueraViejo = 0, noInterpretables = 0;
for (const c of carreras) {
  const cond  = condicionEdad(c);
  const suyos = filas.filter(f => f.carrera === c.numero_carrera_programa);
  const rango = cond.min == null && cond.max == null ? '—'
    : `${cond.min ?? '—'}..${cond.max ?? '+'}`;
  if (cond.fuente === null) {
    noInterpretables++;
    console.log(`  C${String(c.numero_carrera_programa).padStart(2)}  condicion no interpretable: "${c.condicion_handicap || ''}"`);
    continue;
  }
  const fuera = (edadDe) => suyos.filter(f => {
    const e = edadDe(f);
    return (cond.min != null && e < cond.min) || (cond.max != null && e > cond.max);
  });
  const fN = fuera(f => f.fix), fV = fuera(f => f.hoy);
  fueraNuevo += fN.length; fueraViejo += fV.length;
  console.log(`  C${String(c.numero_carrera_programa).padStart(2)}  ${rango} anios  (${cond.fuente})`);
  console.log(`       edades corregidas: ${[...new Set(suyos.map(f => f.fix))].sort((a,b)=>a-b).join(', ')}` +
              (fN.length ? `   <<< FUERA DE CONDICION: ${fN.map(f => `${f.nombre} (${f.fix})`).join(', ')}` : '   ok'));
  if (fV.length) console.log(`       con las edades del baseline habrian figurado fuera: ${fV.map(f => `${f.nombre} (${f.hoy})`).join(', ')}`);
}

console.log('');
asrt(noInterpretables === 0, `todas las condiciones de edad interpretadas (no interpretables: ${noInterpretables})`);
asrt(fueraNuevo === 0,
     `ningun ratificado fuera de la condicion de edad de su carrera (fuera: ${fueraNuevo})`);
console.log(`     con las edades del baseline habrian figurado ${fueraViejo} caballos fuera de condicion`);


// ════════════════════════════════════════════════════════════════════════════
// PARTE B — el gate de la BASE: fn_edad_reglamentaria + validar_inscripcion
// ════════════════════════════════════════════════════════════════════════════
// La parte A compara el helper del front (edad-spc.js) contra el Stud Book.
// Esta parte verifica que la BASE calcule igual, y que el gate de inscripción
// decida bien en LAS DOS DIRECCIONES: que deje pasar al que puede correr y que
// frene al que no.
//
// Antes del fix, validar_inscripcion usaba DATE_PART('year', AGE(...)), o sea
// el aniversario real: todo SPC nacido entre julio y diciembre quedaba con un
// año de menos. 94 de 181 SPCs del padrón.
//
// Requiere la migración migrations/fn_edad_reglamentaria.sql aplicada.

console.log('\n\n══ PARTE B — gate de la base (fn_edad_reglamentaria + validar_inscripcion) ══\n');

const R9_NUM = 9;
const { data: r9 } = await sb.from('reuniones').select('id,fecha,numero').eq('numero', R9_NUM).single();
const { data: c9 } = await sb.from('carreras')
  .select('id,numero_turno,edad_minima_anos,edad_maxima_anos,condicion_sexo,condicion_handicap')
  .eq('reunion_id', r9.id).order('numero_turno');

const turno1 = c9.find(c => c.edad_minima_anos === 3 && c.edad_maxima_anos === 3);
const turno4 = c9.find(c => c.edad_minima_anos === 4 && c.edad_maxima_anos === 4);
asrt(!!turno1, `R9 tiene un turno de 3/3 (turno ${turno1?.numero_turno})`);
asrt(!!turno4, `R9 tiene un turno de 4/4 (turno ${turno4?.numero_turno})`);

const nombres = ['MOSQUITA GARDEN', 'ABELITO MIMOSO', 'Amiguito Peligroso'];
const { data: spcB } = await sb.from('spcs').select('id,nombre,fecha_nacimiento,sexo,estado').in('nombre', nombres);
const N = Object.fromEntries((spcB || []).map(s => [s.nombre.toUpperCase(), s]));
for (const n of nombres) asrt(!!N[n.toUpperCase()], `SPC de prueba presente en el padrón: ${n}`);

// ── B1. La función, aislada ─────────────────────────────────────────────────
console.log('\n── B1. fn_edad_reglamentaria(fecha_ref, fecha_nac) ──');
async function fnEdad(ref, nac) {
  const { data, error } = await sb.rpc('fn_edad_reglamentaria', { p_fecha_ref: ref, p_fecha_nac: nac });
  if (error) { bad(`fn_edad_reglamentaria(${ref}, ${nac}) -> ERROR ${error.message}`); return undefined; }
  return data;
}
const CASOS_FN = [
  // ref,          nac,           esperado, nota
  [r9.fecha, '2023-10-10', 3, 'MOSQUITA GARDEN — nacida en octubre, el aniversario real daría 2'],
  [r9.fecha, '2022-11-10', 4, 'ABELITO MIMOSO — nacido en noviembre, el aniversario real daría 3'],
  [r9.fecha, '2023-07-07', 3, 'Amiguito Peligroso — 5 días después del corte, ambas fórmulas coinciden'],
  [r9.fecha, '2023-06-28', 3, 'nacido 3 días ANTES del corte del año anterior'],
  ['2026-06-20', '2022-11-10', 3, 'reunión ANTERIOR al 1° de julio: la resta del CASE sí aplica'],
  ['2026-07-01', '2022-11-10', 4, 'reunión el 1° de julio exacto: ya cumplió, no resta'],
  ['2026-06-30', '2022-11-10', 3, 'reunión el 30 de junio: todavía no cumplió, resta'],
  [r9.fecha, '2027-03-01', 0, 'nacido DESPUES de la reunión: clampea en 0, igual que edad-spc.js'],
  ['2026-06-20', '2026-05-01', 0, 'nacido el mismo año, antes del 1/7: la resta daría -1, clampea en 0'],
  [r9.fecha, null, null, 'sin fecha de nacimiento -> NULL'],
  [null, '2022-11-10', null, 'sin fecha de referencia -> NULL'],
];
for (const [ref, nac, esperado, nota] of CASOS_FN) {
  const got = await fnEdad(ref, nac);
  asrt(got === esperado, `fn(${ref ?? 'NULL'}, ${nac ?? 'NULL'}) = ${got} (esperado ${esperado}) — ${nota}`);
}

// La base y el front tienen que dar el MISMO número: son dos implementaciones
// de la misma regla y no hay forma de compartir código entre Postgres y el browser.
console.log('\n── B2. la base y edad-spc.js coinciden ──');
let divergen = 0;
for (const f of filas) {
  const enBase = await fnEdad(reunion.fecha, f.nac);
  if (enBase !== f.fix) { divergen++; console.log(`     DIVERGE ${f.nombre}: base ${enBase} vs edad-spc.js ${f.fix}`); }
}
asrt(divergen === 0, `fn_edad_reglamentaria coincide con edadSPC() en los ${filas.length} ratificados de R8 (divergen: ${divergen})`);

// ── B3. El gate, en las dos direcciones ─────────────────────────────────────
console.log('\n── B3. validar_inscripcion — acepta y rechaza ──');
async function gate(spc, carrera) {
  const { data, error } = await sb.rpc('validar_inscripcion', { p_spc_id: spc.id, p_carrera_id: carrera.id });
  if (error) return { ok: null, motivo: `ERROR ${error.message}` };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: row?.puede_inscribirse ?? null, motivo: row?.motivo ?? '(sin motivo)' };
}
const CASOS_GATE = [
  { spc: 'MOSQUITA GARDEN',    carrera: turno1, espera: true,
    nota: '3 años reales en carrera de 3/3 — ANTES DEL FIX RECHAZABA (falso negativo)' },
  { spc: 'ABELITO MIMOSO',     carrera: turno1, espera: false,
    nota: '4 años reales en carrera de 3/3 — ANTES DEL FIX ACEPTABA (falso positivo, el más grave)' },
  { spc: 'ABELITO MIMOSO',     carrera: turno4, espera: true,
    nota: '4 años reales en carrera de 4/4 — ANTES DEL FIX RECHAZABA' },
  { spc: 'Amiguito Peligroso', carrera: turno1, espera: true,
    nota: 'las dos fórmulas coinciden — tiene que seguir aceptando (no-regresión)' },
];
for (const c of CASOS_GATE) {
  const s = N[c.spc.toUpperCase()];
  const r = await gate(s, c.carrera);
  asrt(r.ok === c.espera,
    `${c.spc} vs turno ${c.carrera.numero_turno} (${c.carrera.edad_minima_anos}/${c.carrera.edad_maxima_anos}): ` +
    `${r.ok ? 'ACEPTA' : 'RECHAZA'} (esperado ${c.espera ? 'ACEPTA' : 'RECHAZA'}) — ${c.nota}` +
    (r.ok === c.espera ? '' : ` [motivo: ${r.motivo}]`));
}

// ── B4. SPC sin fecha_nacimiento: el gate queda FAIL-OPEN ───────────────────
// No se crea un SPC fixture a propósito: `SELECT count(*) FROM spcs` = 181 es uno
// de los tres guards de sesión, y un alta/baja lo movería. Se verifica la
// semántica NULL de las dos comparaciones del gate, que es lo que decide el caso.
console.log('\n── B4. SPC sin fecha_nacimiento ──');
const { data: sinFecha } = await sb.from('spcs').select('id,nombre').is('fecha_nacimiento', null);
console.log(`     SPCs sin fecha_nacimiento en el padrón: ${(sinFecha || []).length}`);
const { data: nullSem } = await sb.rpc('fn_edad_reglamentaria', { p_fecha_ref: r9.fecha, p_fecha_nac: null });
asrt(nullSem === null, 'fn_edad_reglamentaria devuelve NULL si falta la fecha de nacimiento');
// `NULL < 3` es NULL, y un IF con NULL no entra: el gate NO rechaza. Igual que antes
// del fix, donde DATE_PART('year', AGE(fecha, NULL)) también daba NULL.
if ((sinFecha || []).length > 0) {
  const r = await gate(sinFecha[0], turno1);
  asrt(r.ok === true,
    `${sinFecha[0].nombre} (sin fecha de nacimiento) pasa el gate de edad — fail-open, comportamiento SIN CAMBIO respecto de antes del fix`);
} else {
  ok('no hay SPCs sin fecha_nacimiento en el padrón: el caso es teórico (fail-open documentado en el informe)');
}

console.log(`\n${'─'.repeat(66)}`);
console.log(fail === 0 ? `\x1b[32mGATE OK\x1b[0m — ${pass}/${pass + fail} asserts`
                       : `\x1b[31mGATE FAIL\x1b[0m — ${fail} de ${pass + fail} fallaron`);
process.exit(fail === 0 ? 0 : 1);
