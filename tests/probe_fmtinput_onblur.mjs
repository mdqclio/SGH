// probe_fmtinput_onblur.mjs — liquidaciones.html: los inputs de monto formatean al SALIR del campo
// (onblur), no en cada tecla (oninput). Bug del 19/09: con oninput, tipear 60000 dígito por dígito
// quedaba en "$6,00" y a la base llegaba 6 (el reformateo por tecla se comía los ceros).
//
// Sin browser, sin Supabase real: extrae formatMonto/parseMonto/fmtInput/saveReparto del HTML por
// ancla + balance de llaves y los corre con stubs de DOM y un `sb` que captura el payload del UPDATE.
// Solo lectura. LIQUIDACIONES_HTML acepta ruta local o URL (https://sigh.com.ar/liquidaciones.html).
//
//   node tests/probe_fmtinput_onblur.mjs
//   LIQUIDACIONES_HTML=https://sigh.com.ar/liquidaciones.html node tests/probe_fmtinput_onblur.mjs

import { readFileSync } from 'node:fs';

const SRC_REF = process.env.LIQUIDACIONES_HTML || 'liquidaciones.html';
const src = SRC_REF.startsWith('http')
  ? await (await fetch(SRC_REF + (SRC_REF.includes('?') ? '&' : '?') + 'v=' + Date.now())).text()
  : readFileSync(SRC_REF, 'utf8');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ✔ ${msg}`); }
  else { fail++; console.log(`  ✘ ${msg}`); }
}

function extract(name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`no encontré function ${name}( en ${SRC_REF}`);
  let d = 0, j = i;
  for (; j < src.length; j++) { if (src[j] === '{') d++; if (src[j] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, j + 1);
}
const helpers = ['formatMonto', 'parseMonto', 'fmtInput'].map(extract).join('\n');
const { fmtInput, parseMonto, formatMonto } = new Function(helpers + '\nreturn { fmtInput, parseMonto, formatMonto };')();

// ── 1. El HTML: los 4 inputs de monto van por onblur, ninguno por oninput ─────────────────────
console.log('\n1. Atributos en el HTML');
const IDS = ['rp-inc-jockey', 'rp-inc-entrenador', 'cf-monto', 'cf-monto-bono'];
const onInputCount = (src.match(/oninput="fmtInput\(this\)"/g) || []).length;
const onBlurCount  = (src.match(/onblur="fmtInput\(this\)"/g) || []).length;
assert(onInputCount === 0, `0 inputs con oninput="fmtInput(this)" (hay ${onInputCount})`);
assert(onBlurCount === 4, `4 inputs con onblur="fmtInput(this)" (hay ${onBlurCount})`);
for (const id of IDS) {
  const tag = (src.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) || [''])[0];
  assert(/onblur="fmtInput\(this\)"/.test(tag) && !/oninput=/.test(tag), `#${id} → onblur, sin oninput`);
}
// Nadie más depende de fmtInput por tecla: los únicos oninput que quedan son los buscadores.
const otrosOninput = [...src.matchAll(/oninput="([^"]+)"/g)].map(m => m[1]);
assert(otrosOninput.every(h => !/fmtInput/.test(h)), `ningún oninput restante llama a fmtInput (${otrosOninput.join(' | ') || '—'})`);

// ── 2. Carga del modal: sigue formateado ─────────────────────────────────────────────────────
console.log('\n2. Carga del modal (openRepartoModal usa formatMonto)');
assert(/getElementById\('rp-inc-jockey'\)\.value\s*=\s*c\.incentivo_jockey_monto\s*\?\s*formatMonto\(/.test(src),
  'openRepartoModal pone formatMonto(incentivo_jockey_monto) en el input');
assert(formatMonto(50000) === '$50.000,00', `formatMonto(50000) = "${formatMonto(50000)}"`);
assert(formatMonto('60000.00') === '$60.000,00', `formatMonto("60000.00") (string de Postgres) = "${formatMonto('60000.00')}"`);

// ── 3. Tipear dígito por dígito con onblur: NO pierde ceros ──────────────────────────────────
console.log('\n3. Tipeo dígito por dígito (sin oninput, blur al final)');
function tipearYBlur(inicial, teclas) {
  const el = { value: inicial };
  for (const t of teclas) el.value += t;   // sin oninput no hay reformateo entre teclas
  fmtInput(el);                            // onblur
  return el.value;
}
for (const [teclas, esperado] of [['60000', '$60.000,00'], ['60.000', '$60.000,00'], ['60000,00', '$60.000,00']]) {
  const v = tipearYBlur('', teclas);
  assert(v === esperado && parseMonto(v) === parseMonto(esperado), `tipear "${teclas}" → blur → "${v}" → parseMonto ${parseMonto(v)}`);
}
// Un decimal suelto (",5") no se formatea al blur — es el guard /,\d{0,1}$/ de fmtInput, previo al fix y
// fuera de su alcance (cosmético: el valor parsea bien igual).
{ const v = tipearYBlur('', '60000,5'); assert(parseMonto(v) === 60000.5, `tipear "60000,5" → blur → "${v}" → parseMonto ${parseMonto(v)} (no se formatea, guard previo)`); }
// Mutante: con reformateo por tecla (el bug), el mismo tipeo queda en $6,00.
{
  const el = { value: '' };
  for (const t of '60000') { el.value += t; fmtInput(el); }
  assert(el.value === '$6,00', `control del bug: fmtInput por tecla deja "${el.value}" (= por qué el oninput estaba mal)`);
}

// ── 4. Caso Valeria: seleccionar el 5 de $50.000,00 y tipear 6 ───────────────────────────────
console.log('\n4. Caso Valeria');
{
  const el = { value: '$60.000,00' };  // resultado de reemplazar el "5" seleccionado por "6"
  fmtInput(el);
  assert(el.value === '$60.000,00' && parseMonto(el.value) === 60000, `"$60.000,00" → blur → "${el.value}" → ${parseMonto(el.value)}`);
}

// ── 5. Camino de guardado: qué payload sale al UPDATE ────────────────────────────────────────
console.log('\n5. saveReparto → payload del UPDATE (sb stub, sin red)');
{
  const dom = {
    'rp-propietario': '70', 'rp-entrenador': '10', 'rp-jockey': '10', 'rp-peon': '4',
    'rp-capataz': '3', 'rp-sereno': '1', 'rp-fondo': '2', 'rp-antidoping': '30',
    'rp-inc-jockey': tipearYBlur('', '60000'),          // lo que queda en el input tras el blur
    'rp-inc-entrenador': '$10.000,00',
  };
  const els = Object.fromEntries(Object.entries(dom).map(([k, v]) => [k, { value: v }]));
  els['btn-save-reparto'] = { disabled: false, textContent: '' };
  let captured = null;
  const sb = { from: t => ({ update: p => ({ eq: (col, val) => ({ select: () => ({ single: async () => { captured = { t, p, col, val }; return { data: p, error: null }; } }) }) }), insert: p => ({ select: () => ({ single: async () => { captured = { t, p, insert: true }; return { data: p, error: null }; } }) }) }) };
  const ctx = {
    document: { getElementById: id => els[id] }, sb, CLUB_ID: 'club-x',
    liqConfig: { id: 'cfg-1' }, toast: () => {}, closeModal: () => {}, loadReparto: () => {},
    parseMonto, formatMonto,
  };
  const body = extract('saveReparto').replace(/^function saveReparto\(\)\s*\{/, '').replace(/\}$/, '');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(...Object.keys(ctx), body)(...Object.values(ctx));
  assert(captured && captured.t === 'liquidacion_config' && !captured.insert && captured.col === 'id' && captured.val === 'cfg-1',
    `UPDATE liquidacion_config … eq('id','cfg-1') (${JSON.stringify({ t: captured?.t, col: captured?.col, val: captured?.val })})`);
  assert(captured?.p?.incentivo_jockey_monto === 60000, `payload.incentivo_jockey_monto = ${captured?.p?.incentivo_jockey_monto}`);
  assert(captured?.p?.incentivo_entrenador_monto === 10000, `payload.incentivo_entrenador_monto = ${captured?.p?.incentivo_entrenador_monto}`);
  // Y si el usuario clickea Guardar sin que dispare blur (valor crudo), parseMonto igual lo lee bien.
  assert(parseMonto('60000') === 60000 && parseMonto('60.000') === 60000, 'parseMonto acepta el valor crudo sin blur (60000 / 60.000)');
}

console.log(`\n${SRC_REF} — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
