/**
 * Probe chapa "4½ cpos" (id 20) — lógica pura de frontend, SIN DB, sin browser.
 *
 * Clave: NO mockea nada. Carga el chapas.js REAL con `new Function(...)` y extrae los
 * cuerpos REALES de parseDif / chapaGetCodigo / chapaGetSvg desde resultados.html, así
 * que si el catálogo o el parser cambian de forma incompatible, el probe FALLA.
 *
 * Contexto: reunión 6, Yesi carga un margen de 4½ cuerpos. Antes del fix el catálogo
 * saltaba de "4 cpos" (id 16, valor 4.0) a "Varios" (id 17, solo enteros N≥5) — 4½ no
 * se podía cargar.
 *
 * Tests:
 *  T01  getChapaByCodigo('4½ cpos') → entrada nueva (id 20, valor 4.5, tipo distancia)
 *  T02  round-trip chapaGetCodigo({id:20}) === '4½ cpos'
 *  T03  orden del array: '4½ cpos' queda entre '4 cpos' (16) y Varios (17)
 *  T04  parseDif('4½ cpos') → {id:20} y NO cae en la rama varios (id 17)
 *  T05  regresión: '4 cpos' y '5 cpos' siguen resolviendo como antes
 *  T06  ids únicos y no renumerados (16,17,18,19 intactos en su id original)
 *  T07  el SVG nuevo existe y sigue el estilo del catálogo (amarillo + negro)
 *  T08  cabe en resultado_posiciones.diferencia varchar(20)
 *  T09  el dropdown (CHAPAS_CATALOG.map de resultados.html) no asume ids contiguos
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));

const results = [];
const ok = (t, c, n = '') => results.push({ t, s: c ? '✅' : '❌', n });

function extractFnBody(html, signature) {
  const start = html.indexOf(signature);
  if (start < 0) throw new Error(`No encontré la firma: ${signature}`);
  const braceOpen = html.indexOf('{', start);
  let depth = 0, i = braceOpen;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) break; }
  }
  return html.slice(braceOpen + 1, i);
}

(async () => {
  let phase = 'init';
  try {
    // ════ CARGA DEL CÓDIGO REAL ════════════════════════════════════════════
    phase = 'load chapas.js';
    const chapasSrc = readFileSync(join(dir, '..', 'chapas.js'), 'utf8');
    const api = new Function(
      chapasSrc +
      '\n return { CHAPAS_CATALOG, getChapa, getChapaByCodigo, getVariosCodigo, renderVariosChapa };'
    )();
    const { CHAPAS_CATALOG, getChapa, getChapaByCodigo, getVariosCodigo, renderVariosChapa } = api;

    phase = 'load resultados.html';
    const html = readFileSync(join(dir, '..', 'resultados.html'), 'utf8');
    // cuerpos REALES del archivo de prod — si cambian, cambia lo que testeamos
    const parseDif = new Function('deps', `
      const { getChapaByCodigo } = deps;
      return function parseDif(str) {${extractFnBody(html, 'function parseDif(')}};
    `)(api);
    const chapaGetCodigo = new Function('deps', `
      const { getChapa, getVariosCodigo } = deps;
      return function chapaGetCodigo(st) {${extractFnBody(html, 'function chapaGetCodigo(')}};
    `)(api);
    const chapaGetSvg = new Function('deps', `
      const { getChapa, renderVariosChapa } = deps;
      return function chapaGetSvg(st) {${extractFnBody(html, 'function chapaGetSvg(')}};
    `)(api);
    console.log(`[load] catálogo real: ${CHAPAS_CATALOG.length} entradas; parseDif/chapaGetCodigo/chapaGetSvg extraídos de resultados.html`);

    // ════ T01 — la entrada nueva existe y está bien formada ═════════════════
    phase = 'T01';
    const nueva = getChapaByCodigo('4½ cpos');
    ok('T01a', !!nueva, 'getChapaByCodigo("4½ cpos") devuelve entrada (no null)');
    ok('T01b', nueva?.id === 20, `id === 20 (fue: ${nueva?.id})`);
    ok('T01c', nueva?.valor === 4.5, `valor === 4.5 (fue: ${nueva?.valor})`);
    ok('T01d', nueva?.tipo === 'distancia', `tipo === "distancia" (fue: ${nueva?.tipo})`);
    ok('T01e', nueva?.nombre === '4½ cuerpos', `nombre === "4½ cuerpos" (fue: ${nueva?.nombre})`);
    ok('T01f', getChapa(20) === nueva, 'getChapa(20) devuelve la MISMA entrada que getChapaByCodigo');
    // el ½ tiene que ser el mismo carácter que usan 2½ y 3½ (U+00BD), no "1/2" ni otro glifo
    const half = getChapaByCodigo('2½ cpos')?.codigo.match(/[^\d\s a-z]/i)?.[0];
    ok('T01g', half === '½' && nueva?.codigo.includes('½'),
       `usa el mismo carácter ½ (U+00BD) que "2½ cpos" (fue: U+${nueva?.codigo.charCodeAt(1).toString(16).toUpperCase()})`);

    // ════ T02 — round-trip ═════════════════════════════════════════════════
    phase = 'T02';
    ok('T02a', chapaGetCodigo({ id: 20, n: null }) === '4½ cpos',
       `chapaGetCodigo({id:20}) === "4½ cpos" (fue: ${JSON.stringify(chapaGetCodigo({ id: 20, n: null }))})`);
    // round-trip completo: código → parseDif → chapaGetCodigo → mismo código
    const rt = chapaGetCodigo(parseDif('4½ cpos'));
    ok('T02b', rt === '4½ cpos', `round-trip código→parseDif→chapaGetCodigo estable (fue: ${JSON.stringify(rt)})`);

    // ════ T03 — orden del array (el dropdown se ordena por POSICIÓN) ═══════
    phase = 'T03';
    const idx = c => CHAPAS_CATALOG.findIndex(x => x.id === c);
    const i16 = idx(16), i20 = idx(20), i17 = idx(17);
    ok('T03a', i16 >= 0 && i20 >= 0 && i17 >= 0, 'ids 16, 20 y 17 presentes en el array');
    ok('T03b', i16 < i20 && i20 < i17,
       `"4½ cpos" entre "4 cpos" y Varios (posiciones: 4cpos=${i16}, 4½=${i20}, varios=${i17})`);
    // las distancias fijas quedan monótonas por valor
    const dist = CHAPAS_CATALOG.filter(c => c.tipo === 'distancia');
    const monotona = dist.every((c, k) => k === 0 || dist[k - 1].valor < c.valor);
    ok('T03c', monotona, `los "distancia" quedan ordenados por valor ASC (${dist.map(c => c.valor).join(' < ')})`);

    // ════ T04 — parseDif NO cae en la rama varios ══════════════════════════
    phase = 'T04';
    const p45 = parseDif('4½ cpos');
    ok('T04a', p45?.id === 20, `parseDif("4½ cpos").id === 20 (fue: ${JSON.stringify(p45)})`);
    ok('T04b', p45?.id !== 17, 'NO cae en la rama varios (id 17)');
    ok('T04c', p45?.n === null, `n === null, no es un "varios + N" (fue: ${p45?.n})`);

    // ════ T05 — regresión de los vecinos ═══════════════════════════════════
    phase = 'T05';
    const p4 = parseDif('4 cpos');
    ok('T05a', p4?.id === 16 && p4?.n === null, `parseDif("4 cpos") → id 16 sin n (fue: ${JSON.stringify(p4)})`);
    const p5 = parseDif('5 cpos');
    ok('T05b', p5?.id === 17 && p5?.n === 5, `parseDif("5 cpos") → varios id 17 n=5 (fue: ${JSON.stringify(p5)})`);
    ok('T05c', chapaGetCodigo(p5) === '5 cpos', 'round-trip de "5 cpos" intacto (getVariosCodigo)');
    ok('T05d', getChapaByCodigo('4 cpos')?.valor === 4.0, '"4 cpos" sigue valiendo 4.0');
    ok('T05e', parseDif('3½ cpos')?.id === 15, '"3½ cpos" sigue resolviendo a id 15');
    ok('T05f', parseDif(null) === null && parseDif('') === null, 'parseDif(null|"") sigue devolviendo null');
    ok('T05g', parseDif('no existe') === null, 'parseDif de un código inválido sigue devolviendo null');
    // los enteros < 5 no deben caer en varios (siguen yendo al catálogo fijo)
    ok('T05h', parseDif('2 cpos')?.id === 12, '"2 cpos" no cae en varios (id 12)');

    // ════ T06 — ids estables, sin renumerar ════════════════════════════════
    phase = 'T06';
    const ids = CHAPAS_CATALOG.map(c => c.id);
    ok('T06a', new Set(ids).size === ids.length, `ids únicos (${ids.join(',')})`);
    ok('T06b', getChapa(16)?.codigo === '4 cpos', 'id 16 sigue siendo "4 cpos"');
    ok('T06c', getChapa(17)?.tipo === 'varios', 'id 17 sigue siendo "varios"');
    ok('T06d', getChapa(18)?.codigo === 's.a.', 'id 18 sigue siendo "s.a." (persistido por código)');
    ok('T06e', getChapa(19)?.codigo === 'desm.', 'id 19 sigue siendo "desm." (persistido por código)');
    ok('T06f', CHAPAS_CATALOG.length === 20, `20 entradas (fue: ${CHAPAS_CATALOG.length})`);

    // ════ T07 — SVG consistente con el resto del catálogo ══════════════════
    phase = 'T07';
    const svg = nueva?.svg || '';
    ok('T07a', svg.startsWith('<svg') && svg.includes('viewBox="0 0 100 100"'), 'SVG con el viewBox 100x100 del catálogo');
    ok('T07b', svg.includes('#FFD600') && svg.includes('#000000'), 'fondo amarillo + trazo negro como las demás');
    // las medias (1½,2½,3½) se dibujan con círculos huecos: 4½ hace lo mismo, con 4 círculos
    const huecos = (svg.match(/fill="none"/g) || []).length;
    ok('T07c', huecos === 4, `4 círculos huecos, igual criterio que 2½ (2) y 3½ (3) — fue: ${huecos}`);
    ok('T07d', chapaGetSvg({ id: 20, n: null }) === svg, 'chapaGetSvg({id:20}) devuelve el SVG nuevo');

    // ════ T08 — cabe en la columna de DB ═══════════════════════════════════
    phase = 'T08';
    ok('T08', '4½ cpos'.length <= 20, `"4½ cpos" = ${'4½ cpos'.length} chars ≤ varchar(20) de resultado_posiciones.diferencia`);

    // ════ T09 — el dropdown no asume ids contiguos ═════════════════════════
    phase = 'T09';
    // el render real del dropdown sólo hace un caso especial para id 17; el resto sale por array
    const ddSrc = html.slice(html.indexOf('dd.innerHTML = CHAPAS_CATALOG.map'), html.indexOf('dd.innerHTML = CHAPAS_CATALOG.map') + 900);
    ok('T09a', ddSrc.includes('CHAPAS_CATALOG.map'), 'el dropdown itera el catálogo (no una lista hardcodeada)');
    ok('T09b', !/for\s*\(\s*(let|var)\s+\w+\s*=\s*1\s*;\s*\w+\s*<=?\s*19/.test(html),
       'ningún loop 1..19 sobre ids en resultados.html');
    ok('T09c', !/CHAPAS_CATALOG\.slice\(|CHAPAS_CATALOG\.length\s*[-+]/.test(html),
       'nadie recorta el catálogo por longitud/índice fijo');
    // el catálogo se simula entero por el render del dropdown: la entrada nueva produce una opción
    const opt = CHAPAS_CATALOG.filter(c => c.id === 20)
      .map(ch => `<span class="chapa-opt-code">${ch.codigo || ''}</span>`).join('');
    ok('T09d', opt.includes('4½ cpos'), 'la entrada nueva renderiza su código en la opción del dropdown');

    // ════ RESUMEN ══════════════════════════════════════════════════════════
    console.log('\n── Resultados ─────────────────────────────');
    results.forEach(r => console.log(`${r.s} ${r.t}  ${r.n}`));
    const fails = results.filter(r => r.s === '❌');
    console.log(`\n${results.length - fails.length}/${results.length} OK`);
    if (fails.length) {
      console.log(`\n❌ FALLAN: ${fails.map(f => f.t).join(', ')}`);
      process.exit(1);
    }
    console.log('✅ Todos los asserts pasan.');
  } catch (err) {
    console.error(`\n💥 Error en fase "${phase}":`, err.message);
    process.exit(1);
  }
})();
