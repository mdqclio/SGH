#!/usr/bin/env node
/**
 * probe_alineado_programa.mjs — Gate de fix/alineado-programa.
 *
 * Mide el ancho de las celdas de las tablas de inscriptos del programa oficial, para
 * verificar que las columnas JOCKEY y ENTRENADOR volvieron a entrar en una línea.
 *
 * ⚠️  NO mide layout real. El criterio pedido era "contar con chromium headless las filas
 *     que ocupan más de una línea". Chromium NO corre en esta máquina — reproducido:
 *       $ npx playwright install chromium
 *       Error: ERROR: Playwright does not support chromium on ubuntu26.04-x64
 *     (limitación documentada en docs/SERVER.md y tests/README.md).
 *
 *     El proxy que se usa acá es COMPARATIVO contra el programa de junio (R6), que es el
 *     que Fede y Yesi dan por bueno: si ninguna celda de R8 supera a la celda más ancha
 *     que R6 ya imprimía en una línea, R8 no puede envolver más que R6. Es una cota, no
 *     una prueba de layout. La verificación definitiva es abrir el PDF.
 *
 * Corre el `nombreCorto` REAL extraído de programa-oficial-color.html (patrón
 * tests/README.md), con datos reales de prod. Sólo lee.
 *
 *   set -a; . ./.env; set +a; node tests/probe_alineado_programa.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY: set -a; . ./.env; set +a'); process.exit(1); }

const R8 = '7b6e003e-22e2-4629-bf55-f18560b1260f';   // 16/08/2026 — el que se queja
const R6 = 'b02ca761-6f44-4720-86aa-a3c3099019ea';   // 20/06/2026 — el programa de junio, referencia

/* ---------- código real del HTML ---------- */
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`no se encontró function ${name}( en el HTML`);
  let depth = 0;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error(`llaves desbalanceadas en ${name}`);
}
const htmlColor = readFileSync(join(ROOT, 'programa-oficial-color.html'), 'utf8');
const htmlBN    = readFileSync(join(ROOT, 'programa-oficial.html'), 'utf8');
const nombreCorto = new Function(`${extractFn(htmlColor, 'nombreCorto')}; return nombreCorto;`)();

// la versión larga es la que había antes del fix — se conserva acá sólo para medir el ANTES
const nombreLargo = p => p ? `${p.apellido || ''} ${p.nombre || ''}`.trim().toUpperCase() : '';

const sb = createClient(SUPABASE_URL, KEY);

async function datosDe(reunionId) {
  const { data: carreras, error: e1 } = await sb.from('carreras')
    .select('id,numero_turno,numero_carrera_programa')
    .eq('reunion_id', reunionId).or('estado.is.null,estado.neq.anulada');
  if (e1) { console.error('[carreras]', e1); throw e1; }

  const ids = (carreras || []).map(c => c.id);
  if (!ids.length) return { carreras: [], ins: [], profMap: {} };

  const { data: ins, error: e2 } = await sb.from('inscripciones')
    .select('id,carrera_id,estado,jockey_titular_id,entrenador_id,spc_id,caballeriza_id,performance')
    .in('carrera_id', ids).eq('estado', 'ratificado');
  if (e2) { console.error('[inscripciones]', e2); throw e2; }

  const profIds = [...new Set((ins || []).flatMap(i => [i.jockey_titular_id, i.entrenador_id]).filter(Boolean))];
  const { data: profs, error: e3 } = profIds.length
    ? await sb.from('profesionales').select('id,nombre,apellido').in('id', profIds)
    : { data: [], error: null };
  if (e3) { console.error('[profesionales]', e3); throw e3; }

  const spcIds = [...new Set((ins || []).map(i => i.spc_id).filter(Boolean))];
  const { data: spcs, error: e4 } = spcIds.length
    ? await sb.from('spcs').select('id,nombre,padrillo_nombre,madre_nombre,ult_performances').in('id', spcIds)
    : { data: [], error: null };
  if (e4) { console.error('[spcs]', e4); throw e4; }

  const cabIds = [...new Set((ins || []).map(i => i.caballeriza_id).filter(Boolean))];
  const { data: cabs, error: e5 } = cabIds.length
    ? await sb.from('caballerizas').select('id,nombre').in('id', cabIds)
    : { data: [], error: null };
  if (e5) { console.error('[caballerizas]', e5); throw e5; }

  return {
    carreras: (carreras || []).sort((a, b) =>
      (a.numero_carrera_programa ?? a.numero_turno ?? 999) - (b.numero_carrera_programa ?? b.numero_turno ?? 999)),
    ins: ins || [],
    profMap: Object.fromEntries((profs || []).map(p => [p.id, p])),
    spcMap:  Object.fromEntries((spcs  || []).map(s => [s.id, s])),
    cabMap:  Object.fromEntries((cabs  || []).map(c => [c.id, c])),
  };
}

/**
 * Ancho de cada columna de texto de la tabla y de la fila completa.
 * El envolvido lo decide el ancho TOTAL de la fila: las columnas son auto-width
 * (sólo .col-num está fijada en 26px), así que el browser reparte el sobrante.
 */
function medir({ ins, profMap, spcMap, cabMap }, fn) {
  const cols = { caballeriza: [], performance: [], spc: [], jockey: [], padreMadre: [], entrenador: [] };
  for (const i of ins) {
    const s = spcMap[i.spc_id] || {};
    cols.caballeriza.push((cabMap[i.caballeriza_id]?.nombre || '').toUpperCase());
    cols.performance.push(i.performance || s.ult_performances || '');
    cols.spc.push((s.nombre || '').toUpperCase());
    cols.jockey.push(profMap[i.jockey_titular_id] ? fn(profMap[i.jockey_titular_id]) : 'XX');
    cols.padreMadre.push([s.padrillo_nombre, s.madre_nombre].filter(Boolean).map(x => x.toUpperCase()).join(' — '));
    cols.entrenador.push(fn(profMap[i.entrenador_id]));
  }
  const max  = a => a.reduce((m, s) => Math.max(m, s.length), 0);
  const peor = a => a.reduce((x, y) => y.length > x.length ? y : x, '');
  const totales = ins.map((_, idx) => Object.values(cols).reduce((s, a) => s + a[idx].length, 0));
  return {
    filas: ins.length, cols,
    max:  Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, max(v)])),
    peor: Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, peor(v)])),
    filaMax:  totales.length ? Math.max(...totales) : 0,
    filaProm: totales.length ? Math.round(totales.reduce((a, b) => a + b, 0) / totales.length) : 0,
    conPerformance: cols.performance.filter(Boolean).length,
  };
}

let fallos = 0;
const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) fallos++; };

console.log('\n=== probe_alineado_programa — ancho de JOCKEY y ENTRENADOR ===');
console.log('⚠️  proxy comparativo, NO layout real (sin chromium en esta máquina)\n');

const d8 = await datosDe(R8);
const d6 = await datosDe(R6);

const ref   = medir(d6, nombreLargo);   // junio, tal como se imprimió y gustó
const antes = medir(d8, nombreLargo);
const post  = medir(d8, nombreCorto);

const tabla = (t, m) => {
  console.log(`${t} — ${m.filas} ratificados, ${m.conPerformance} con performance`);
  for (const k of Object.keys(m.max)) {
    console.log(`  ${k.padEnd(12)} máx ${String(m.max[k]).padStart(3)}  "${m.peor[k].slice(0, 44)}"`);
  }
  console.log(`  ${'FILA'.padEnd(12)} máx ${String(m.filaMax).padStart(3)}  prom ${m.filaProm}\n`);
};

tabla('R6 (junio, referencia)', ref);
tabla('R8 ANTES del fix', antes);
tabla('R8 DESPUÉS del fix', post);

console.log('Asserts');
ok(d8.carreras.length === 8, `R8 tiene 8 carreras en el programa (${d8.carreras.length})`);
ok(post.filas > 0, `hay ratificados que medir (${post.filas})`);
ok(post.max.jockey <= antes.max.jockey,
   `JOCKEY no empeoró: ${antes.max.jockey} → ${post.max.jockey}`);
ok(post.max.jockey <= ref.max.jockey,
   `JOCKEY de R8 (${post.max.jockey}) no supera al peor de junio (${ref.max.jockey})`);
ok(post.max.entrenador <= ref.max.entrenador,
   `ENTRENADOR de R8 (${post.max.entrenador}) no supera al peor de junio (${ref.max.entrenador})`);

// Criterio central: la fila completa es lo que decide el envolvido. R8 arrastra la
// columna performance, que en junio venía vacía (0/81) y ahora trae 10 caracteres en
// las 67 filas. El acortado de nombres tiene que compensarla con margen.
ok(post.filaMax <= ref.filaMax,
   `fila más ancha de R8 (${post.filaMax}) no supera a la de junio (${ref.filaMax})`);
// El promedio NO es criterio de envolvido —, una fila envuelve por su propio ancho, no por
// el de la tabla— y R8 arrastra nombres de caballo y pedigríes más largos que R6 por razones
// ajenas a este fix. Se mide como efecto del fix, no contra junio.
ok(post.filaProm < antes.filaProm,
   `el fix estrechó la fila promedio: ${antes.filaProm} → ${post.filaProm} (junio: ${ref.filaProm})`);
ok(post.filaMax < antes.filaMax,
   `el fix estrechó la fila más ancha: ${antes.filaMax} → ${post.filaMax}`);

// el fix no puede haber dejado celdas vacías donde antes había un nombre
const perdidos = d8.ins.filter(i => {
  const p = d8.profMap[i.entrenador_id];
  return p && nombreLargo(p) && !nombreCorto(p);
}).length;
ok(perdidos === 0, 'ningún entrenador quedó sin nombre por el acortado');

// ambos PDF tienen que usar el helper: no sirve arreglar uno solo
ok(/nombreCorto\(jock\)/.test(htmlColor) && /nombreCorto\(entr\)/.test(htmlColor),
   'programa-oficial-color.html usa nombreCorto en las dos columnas');
ok(/nombreCorto\(jock\)/.test(htmlBN) && /nombreCorto\(entr\)/.test(htmlBN),
   'programa-oficial.html usa nombreCorto en las dos columnas');
ok(!/\$\{jock\.apellido \|\| ''\} \$\{jock\.nombre/.test(htmlColor + htmlBN),
   'no quedó ninguna concatenación de nombre completo en las tablas');

/* ---------- paso 2, sólo en el B&N ---------- */
// El B&N imprimía con 14mm menos de ancho útil que el color (1.5cm vs 8mm de margen
// lateral) y con una tipografía serif más ancha por carácter. En pantalla entraba, al
// imprimir envolvía. Estas reglas viven en @media print: la vista de pantalla no cambia.
console.log('\nPaso 2 — ancho y tipografía de impresión del B&N');
const printBN = htmlBN.slice(htmlBN.indexOf('@media print'), htmlBN.indexOf('@media print') + 1400);

const pageBN = printBN.match(/@page \{ size: A4; margin: ([^;]+);/)?.[1] || '';
ok(/\b8mm\b/.test(pageBN), `márgenes laterales del B&N igualados al color: "${pageBN.trim()}"`);
ok(!/1\.5cm 1\.5cm/.test(pageBN), 'ya no usa 1.5cm a los costados');

const fsPrint = +(printBN.match(/table\.inscriptos \{ font-size: ([\d.]+)px/)?.[1] || 0);
const fsPant  = +(htmlBN.match(/table\.inscriptos \{ width: 100%; border-collapse: collapse; font-size: ([\d.]+)px/)?.[1] || 0);
ok(fsPrint > 0 && fsPrint < fsPant, `tipografía de impresión menor que la de pantalla: ${fsPant}px → ${fsPrint}px`);
ok(fsPant - fsPrint <= 2, `la reducción es de 1-1.5pt, no más (${(fsPant - fsPrint).toFixed(1)}px)`);

for (const c of ['col-jockey', 'col-entrenador', 'col-pedigree']) {
  ok(new RegExp(`table\\.inscriptos \\.${c}\\s*\\{[^}]*width:`).test(htmlBN), `hay reparto de ancho para .${c}`);
  ok(new RegExp(`class="${c}"`).test(htmlBN), `.${c} está aplicada en el markup`);
}
const anchoJock = +(htmlBN.match(/\.col-jockey\s*\{ width: (\d+)%/)?.[1] || 0);
const anchoPed  = +(htmlBN.match(/\.col-pedigree\s*\{ width: (\d+)%/)?.[1] || 0);
ok(anchoJock > 0 && anchoPed > anchoJock,
   `PADRE — MADRE cede ancho pero sigue siendo la más ancha (${anchoPed}% vs ${anchoJock}%)`);
// sin los comentarios CSS: el propio comentario que explica la decisión menciona la regla
const bnSinComentarios = htmlBN.replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/table-layout:\s*fixed/.test(bnSinComentarios),
   'sin table-layout:fixed — el contenido sigue influyendo, nada se trunca');

// el color ya estaba bien: este paso no puede haberlo tocado
console.log('\nEl programa color queda intacto');
ok(/@page \{ size: A4; margin: 10mm 8mm; \}/.test(htmlColor), 'color conserva su @page 10mm 8mm');
ok(/table\.inscriptos-color \{[^}]*font-size: 9\.5px/.test(htmlColor), 'color conserva font-size 9.5px en la tabla');
ok(!/table\.inscriptos-color \{ font-size/.test(htmlColor.slice(htmlColor.indexOf('@media print'))),
   'color no recibió override de tipografía en print');

console.log(`\n=== ${fallos === 0 ? 'OK — todos los asserts pasaron' : `${fallos} ASSERT(S) FALLARON`} ===\n`);
process.exit(fallos === 0 ? 0 : 1);
