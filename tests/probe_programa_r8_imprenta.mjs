#!/usr/bin/env node
/**
 * probe_programa_r8_imprenta.mjs — Gate de fix/programa-r8-imprenta
 *
 * Verifica los tres cambios para la imprenta del 16/08 (R8):
 *   1. K E S P en cuatro tokens con espacio simple, sin caracteres separadores, y sin
 *      ensanchar la columna (antes la edad y el sexo iban pegados: "3H").
 *   2. La linea BOLSA ya no dice "GAN. MIN." en ninguno de los tres documentos.
 *   3. La linea BOLSA dice "BONO 6°-8° $100.000/puesto", leido del JSONB.
 * Y que NO cambio lo que no debia:
 *   4. El total de BOLSA de cada carrera es identico al de main (el piso sigue aplicando).
 *   5. Sigue habiendo una fila <tr> por caballo ratificado.
 *
 * Patron de harness de codigo real (tests/README.md): se extrae del HTML la funcion que
 * renderiza cada carrera y se ejecuta via AsyncFunction con datos reales de Supabase.
 * El "antes" sale de `git show main:<archivo>`, asi que el contraste es contra prod.
 *
 * carreras tiene RLS: usar la secret server-side. Solo SELECTs.
 *   set -a; . ./.env; set +a; node tests/probe_programa_r8_imprenta.mjs
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const { createClient } = (await import('/home/clio/dev/SGH/node_modules/@supabase/supabase-js/dist/index.cjs')).default;

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY: set -a; . ./.env; set +a'); process.exit(2); }
const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const R8 = '7b6e003e-22e2-4629-bf55-f18560b1260f';

let pass = 0, fail = 0;
const ok  = m => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${m}`); };
const bad = m => { fail++; console.log(`  \x1b[31m✘\x1b[0m ${m}`); };
const asrt = (c, m) => (c ? ok(m) : bad(m));

function extractFn(src, sig) {
  const s = src.indexOf(sig); if (s < 0) throw new Error(`no se encontro: ${sig}`);
  const o = src.indexOf('{', s + sig.length - 1); let d = 0, i = o;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; }
  return src.slice(o + 1, i);
}
/** Todas las funciones sueltas que el render necesita, tal cual estan en el HTML. */
function helpers(src, names) {
  return names.map(n => {
    const sig = `function ${n}(`;
    if (!src.includes(sig)) return '';
    const s = src.indexOf(sig);
    const o = src.indexOf('{', s); let d = 0, i = o;
    for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; }
    return src.slice(s, i + 1);
  }).join('\n');
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// ── Datos reales de R8 (las 8 carreras que van al programa) ──────────────────
const { data: carreras } = await sb.from('carreras').select('*').eq('reunion_id', R8)
  .or('estado.is.null,estado.neq.anulada').order('numero_carrera_programa');
const carIds = carreras.map(c => c.id);
const { data: inscs } = await sb.from('inscripciones').select('*').in('carrera_id', carIds);
const spcIds = [...new Set(inscs.map(i => i.spc_id).filter(Boolean))];
const { data: spcs } = await sb.from('spcs').select('*').in('id', spcIds);
const { data: cats } = await sb.from('categorias_carrera').select('*');
const maps = {
  spcMap: Object.fromEntries(spcs.map(s => [s.id, s])),
  profMap: {}, propMap: {}, cabMap: {},
  catMap: Object.fromEntries(cats.map(c => [c.id, c])),
};
const inscDe = cid => inscs.filter(i => i.carrera_id === cid);

const premiosUtils = readFileSync(new URL('../premios-utils.js', import.meta.url), 'utf8')
  .replace(/\(function \(global\) \{/, '').replace(/\}\)\(window\);\s*$/, '')
  .replace(/global\.\w+ = \w+;/g, '');
// El COLOR usa partidorChipHTML(), que vive en partidor-colors.js (cargado por <script src>).
const partidorColors = readFileSync(new URL('../partidor-colors.js', import.meta.url), 'utf8');

/**
 * Renderiza una carrera con el codigo real del archivo indicado.
 * Las dos firmas difieren: el B&N recibe los mapas sueltos y posicionales,
 * el COLOR recibe un objeto `maps` que desestructura adentro.
 */
function render(src, { sig, args }, carrera) {
  const body = extractFn(src, sig);
  const deps = helpers(src, ['calcEdad','pelajeCodigo','sexoCodigo','pesoKesp','kespTexto',
                             'formatMonto','nombreCorto','formatApuestasText','partidorChipHTML']);
  const code = `
    ${premiosUtils}
    ${partidorColors}
    ${deps}
    function _render(${args.join(',')}) {${body}}
    return _render(${args.join(',')});`;
  const vals = args.map(a => ({
    c: carrera, ins: inscDe(carrera.id), idx: 0, maps,
    spcMap: maps.spcMap, profMap: maps.profMap, propMap: maps.propMap,
    cabMap: maps.cabMap, catMap: maps.catMap,
  }[a]));
  return new Function(...args, code)(...vals);
}

const FILES = [
  { f: 'programa-oficial.html',       label: 'B&N',
    sig: 'function renderCarrera(',
    args: ['c','ins','spcMap','profMap','propMap','cabMap','catMap'] },
  { f: 'programa-oficial-color.html', label: 'COLOR',
    sig: 'function renderCarreraColor(',
    args: ['c','ins','maps','idx'] },
];

console.log('\n=== probe_programa_r8_imprenta — R8 (16/08/2026) ===');
console.log('Ref: unlhcuanfrtpatoipwve · READ-ONLY (solo SELECT)\n');
asrt(carreras.length === 8, `R8 aporta 8 carreras al programa (obtenido: ${carreras.length})`);

for (const F of FILES) {
  const { f, label } = F;
  const head = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const main = execSync(`git show main:${f}`, { encoding: 'utf8', maxBuffer: 32e6 });
  console.log(`\n── ${label} — ${f} ──`);

  let sinGanMin = 0, conBono = 0, totalesIguales = 0, filasOk = 0;
  for (const c of carreras) {
    const htmlNew = render(head, F, c);
    const htmlOld = render(main, F, c);
    const lineaNew = (htmlNew.match(/BOLSA:[^<]*/) || [''])[0];
    const lineaOld = (htmlOld.match(/BOLSA:[^<]*/) || [''])[0];

    if (!/GAN\.\s*M[IÍ]N\./i.test(lineaNew)) sinGanMin++;
    if (/BONO 6°-8° \$\s?100\.000\/puesto/.test(lineaNew)) conBono++;
    // El total es el monto inmediatamente despues de "BOLSA:", antes del primer guion largo.
    const tot = s => (s.match(/BOLSA:\s*([^—]+)/) || [, ''])[1].trim();
    if (tot(lineaNew) === tot(lineaOld) && tot(lineaNew) !== '') totalesIguales++;
    // Una fila por caballo ratificado.
    const filas = (htmlNew.match(/<tr>/g) || []).length - 1; // -1 = la fila de thead
    const ratif = inscDe(c.id).filter(i => i.estado === 'ratificado').length;
    if (filas === ratif) filasOk++;

    if (c.numero_carrera_programa === 1) {
      console.log(`     antes:   ${lineaOld.slice(0, 150)}`);
      console.log(`     despues: ${lineaNew.slice(0, 150)}`);
      const kesp = [...htmlNew.matchAll(/<td class="col-kesp">(.*?)<\/td>/g)].map(m => m[1]);
      const keOld = [...htmlOld.matchAll(/<td class="col-kesp">(.*?)<\/td>/g)].map(m => m[1]);
      console.log(`     K E S P antes:   ${keOld.slice(0, 4).join(' | ')}`);
      console.log(`     K E S P despues: ${kesp.slice(0, 4).join(' | ')}`);
    }
  }
  asrt(sinGanMin === 8,      `las 8 carreras SIN "GAN. MÍN." (obtenido: ${sinGanMin}/8)`);
  asrt(conBono === 8,        `las 8 carreras CON "BONO 6°-8° $100.000/puesto" (obtenido: ${conBono}/8)`);
  asrt(totalesIguales === 8, `el total de BOLSA es identico al de main en las 8 (obtenido: ${totalesIguales}/8)`);
  asrt(filasOk === 8,        `una fila por caballo ratificado en las 8 (obtenido: ${filasOk}/8)`);

  // K E S P: peso sin decimales y cuatro campos separados.
  const todo = carreras.map(c => render(head, F, c)).join('');
  const kesps = [...todo.matchAll(/<td class="col-kesp">(.*?)<\/td>/g)].map(m => m[1].trim());
  asrt(kesps.length === 67, `67 celdas K E S P (una por ratificado) (obtenido: ${kesps.length})`);
  // Cuatro tokens con espacio simple y NADA mas: ni puntos medios, ni comas, ni guiones.
  asrt(kesps.every(k => /^[^\s]+( [^\s]+)*$/.test(k)), 'espacio simple entre tokens, sin espacios dobles ni al borde');
  asrt(!kesps.some(k => /[·,;\-\/|]/.test(k)), 'ningun caracter separador introducido');
  asrt(kesps.filter(k => k).every(k => k.split(' ').length >= 3), 'edad y sexo separados (antes iban pegados: "3H")');
  // Ancho: la columna es auto y la fija el mayor entre encabezado y contenido.
  const maxLen = Math.max(...kesps.map(k => k.length));
  const maxOld = Math.max(...carreras.flatMap(c => [...render(main, F, c)
    .matchAll(/<td class="col-kesp">(.*?)<\/td>/g)].map(m => m[1].trim().length)));
  console.log(`     ancho K E S P: ${maxOld} -> ${maxLen} chars (encabezado "K E S P" = 7)`);
  asrt(maxLen <= 9, `el string mas largo entra en 9 chars (obtenido: ${maxLen})`);
  asrt(!/\.col-kesp\s*\{[^}]*width/.test(head), 'no se le puso width fijo a .col-kesp');
  asrt(/\.col-kesp\s*\{[^}]*white-space:\s*nowrap/.test(head), '.col-kesp conserva white-space:nowrap (no envuelve)');
  asrt(!/GAN\.\s*M[IÍ]N\./i.test(todo), 'el documento entero no menciona GAN. MÍN.');
  // Las 2 sin pelaje quedan con 3 campos, sin separador colgando.
  const tresCampos = kesps.filter(k => k.split(' ').length === 3);
  asrt(tresCampos.length === 2 && !tresCampos.some(k => /\s$/.test(k)),
       `2 celdas sin pelaje, sin separador colgando (obtenido: ${tresCampos.length})`);
}

// ── carta-llamados: solo se saca GAN. MIN.; el bono ya estaba ────────────────
console.log('\n── carta-llamados.html ──');
const carta = readFileSync(new URL('../carta-llamados.html', import.meta.url), 'utf8');
// Solo las sentencias que arman la linea, sin comentarios: un comentario que mencione
// la leyenda no debe hacer pasar ni fallar el assert.
const bolsaStmts = carta.slice(carta.indexOf('let bolsaLine'), carta.indexOf('let bolsaLine') + 900)
  .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
asrt(!/GAN\.\s*M[IÍ]N\./i.test(bolsaStmts), 'la linea BOLSA ya no arma "GAN. MÍN."');
asrt(/BONO \$\{bonoPosD\}°-\$\{bonoPosH\}°/.test(bolsaStmts), 'conserva el BONO por posicion desde el JSONB');
asrt(carta.includes('repartoDisplay(bolsa, dist)'), 'sigue calculando el total con repartoDisplay (piso intacto)');

// ── Sin hardcodeos ───────────────────────────────────────────────────────────
console.log('\n── Sin valores hardcodeados ──');
for (const { f } of FILES) {
  const h = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const linea = (h.match(/BONO \$\{bonoPos[^`]*/) || [''])[0];
  asrt(/\$\{bonoPosD\}°-\$\{bonoPosH\}°.*\$\{formatMonto\(bonoPosMon\)\}/.test(linea),
       `${f}: el bono sale de las variables del JSONB, no de literales`);
  asrt(/dist\.bono_posicion_desde/.test(h) && /dist\.bono_posicion_hasta/.test(h) && /dist\.bono_posicion_monto/.test(h),
       `${f}: lee los tres campos bono_posicion_* de distribucion_premios`);
}

console.log(`\n${'─'.repeat(62)}`);
console.log(fail === 0 ? `\x1b[32mGATE OK\x1b[0m — ${pass}/${pass + fail} asserts`
                       : `\x1b[31mGATE FAIL\x1b[0m — ${fail} de ${pass + fail} fallaron`);
process.exit(fail === 0 ? 0 : 1);
