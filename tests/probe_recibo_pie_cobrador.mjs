/**
 * Probe — recibo de cobro: el pie no se separa de las líneas + captura del cobrador.
 *
 * Sin browser (Chromium no corre en este Ubuntu, ver docs/SERVER.md). Prueba el código REAL de
 * liquidaciones.html: se extraen las funciones del archivo por ancla + balance de llaves y se
 * corren con `new AsyncFunction(...)` inyectando dependencias reales (cliente Supabase con
 * SUPABASE_SECRET_KEY) y un DOM mínimo. Si el archivo cambia, el probe corre el archivo cambiado.
 *
 * Cubre:
 *   (a) CSS de impresión: sin min-height:100vh ni margin-top:auto; .recibo-pie con
 *       break-inside/page-break-inside: avoid; body con margin:0.
 *   (b) presupuesto en mm calculado con los valores de CSS PARSEADOS del archivo: el recibo de
 *       6 líneas entra en una hoja A4, y se reporta cuántas filas entran.
 *   (c) el HTML que realmente genera imprimirReciboCobro con 6 líneas: 2 copias, 6 filas cada
 *       una, y total + "Retira" + firma DENTRO del mismo bloque .recibo-pie.
 *   (d) el desplegable trae titular + apoderados vigentes + "Otro", y precarga nombre/documento.
 *   (e) se puede cargar un cobrador que NO está en la lista (campos editables, opción "Otro").
 *   (f) emitir_recibo recibe nombre y documento NO nulos (se verifica la fila persistida).
 *   (g) transferencia: el recibo imprime la nota de comprobante y NO el bloque de firma.
 *   (h) cuando cobra el titular, el pie no repite el nombre.
 *
 * NO cubre (imposible sin browser): el corte de página real. Ver la checklist "mirar a ojo" en
 * docs/diagnosticos/2026-08-28_recibo-pie-cobrador.md.
 *
 * Fixtures propias sobre la reunión 9999 (sandbox), snapshot → run → assert → restore en el finally.
 * Clave server-side de process.env.SUPABASE_SECRET_KEY (.env gitignore). Nunca hardcodeada.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { snapshotLineas, diffLineas, restaurarLineas, describir, recibosDesde } from './lib/estado_lineas.mjs';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!SERVICE_KEY) { console.error('Falta SUPABASE_SECRET_KEY (source .env).'); process.exit(2); }
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
// Reunión 9999 (PRUEBA) — la sandbox designada del proyecto, misma que usa
// probe_recuperacion_monta.mjs. NO se usa R5: hoy tiene 0 carreras y 0 inscripciones (medido el
// 2026-08-28), así que las fixtures que necesitan inscripcion_id no se pueden armar ahí. Además
// R5 es una reunión real y la 9999 existe justamente para esto.
const SANDBOX = 'a0000000-0000-0000-0000-000000009999';
const BENEF   = 'f6637123-af74-42ae-81e1-d5b9fed88fc9'; // profesionales.id (MENDIBURU, BRIAN ADRIAN)

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const results = [];
const ok = (t, c, n='') => results.push({ t, s: c ? '✅' : '❌', n });

const HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'liquidaciones.html'), 'utf8');

// Extrae el SOURCE completo de una función (firma incluida), por ancla + balance de llaves.
function extractFn(html, sig){
  const s = html.indexOf(sig); if (s < 0) throw new Error('no fn: ' + sig);
  const o = html.indexOf('{', s); let d = 0, i = o;
  for (; i < html.length; i++){ if (html[i] === '{') d++; else if (html[i] === '}'){ d--; if (!d) break; } }
  return html.slice(s, i + 1);
}
// Bloque @media print completo (para los asserts de CSS y el presupuesto en mm).
function extractMediaPrint(html){
  const s = html.indexOf('@media print'); if (s < 0) throw new Error('no @media print');
  const o = html.indexOf('{', s); let d = 0, i = o;
  for (; i < html.length; i++){ if (html[i] === '{') d++; else if (html[i] === '}'){ d--; if (!d) break; } }
  // Sin comentarios: el bloque documenta el bug viejo citando `min-height:100vh` y
  // `margin-top:auto`, y un assert de ausencia que lea el comentario da falso negativo.
  return html.slice(o + 1, i).replace(/\/\*[\s\S]*?\*\//g, '');
}
// Valor de una propiedad dentro de un selector del bloque de print.
function cssProp(block, selector, prop){
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  const m = re.exec(block); if (!m) return null;
  const p = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)').exec(m[1]);
  return p ? p[1].trim() : null;
}
const px = v => { const m = /(-?[\d.]+)px/.exec(v || ''); return m ? parseFloat(m[1]) : 0; };
const PX_MM = 25.4 / 96;

// DOM mínimo: sólo lo que tocan las funciones bajo prueba.
function makeDom(){
  const els = {};
  const mk = id => (els[id] = {
    id, innerHTML: '', value: '', textContent: '', disabled: false,
    style: {}, classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, has(c){return this._s.has(c);} },
  });
  ['cobr-resumen','cobr-quien','cobr-nombre','cobr-doc','cobr-forma','cobr-comprobante',
   'cobr-comprobante-row','cobr-nota-firma','btn-cobr-emitir','modal-cobrador','recibo-print'].forEach(mk);
  let checked = [];
  const document = {
    getElementById: id => els[id] || mk(id),
    querySelectorAll: sel => (sel.includes('cob-chk') ? checked : []),
  };
  return { document, els, setChecked: c => { checked = c; } };
}
const chk = (id, monto) => ({ value: id, dataset: { monto: String(monto) }, checked: true });
// Primer bloque .recibo-pie, acotado al inicio de la copia siguiente. Sin acotar, el slice se come
// el encabezado de la 2ª copia —que sí lleva el nombre del titular— y rompe el assert de h2.
function primerPie(html){
  const ini = html.indexOf('class="recibo-pie"'); if (ini < 0) return '';
  const sig = html.indexOf('class="recibo-copia"', ini);
  return html.slice(ini, sig > 0 ? sig : html.length);
}
// El recibo recién emitido se identifica por DIFERENCIA de ids, nunca por max(numero_recibo):
// el sandbox 9999 tiene los recibos 9001/9002, que ganan cualquier orden por número.
const fotoRecibos = async () => new Set((((await sb.from('recibos').select('id').eq('club_id', CLUB_ID)).data) || []).map(r => r.id));
const reciboNuevo = async (antes) => (((await sb.from('recibos').select('*').eq('club_id', CLUB_ID)).data) || []).find(r => !antes.has(r.id));

(async () => {
  let liqId = null, lineas = [], recIds = [], phase = 'init';
  // Restore verificado por ESTADO, no por conteo de filas: contar filas dio verde el 2026-08-28
  // mientras 9 líneas del sandbox quedaban en 'pagado' colgadas de un recibo ajeno.
  const T0 = new Date(Date.now() - 1000).toISOString();
  const snapAntes = await snapshotLineas(sb, SANDBOX);
  // club_secuencias también se fotografía: el probe emite recibos REALES contra Dolores y
  // fn_siguiente_recibo incrementa el correlativo del club. Se devuelve en el finally (R6).
  const seqAntes = (await sb.from('club_secuencias')
    .select('ultimo_numero').eq('club_id', CLUB_ID).eq('tipo', 'recibo').maybeSingle()).data?.ultimo_numero ?? null;
  console.log(`[snapshot] ${Object.keys(snapAntes).length} líneas del sandbox fotografiadas por estado · club_secuencias=${seqAntes}`);
  try {
    // ── sandbox con el código REAL del archivo ──────────────────────────────
    phase = 'sandbox';
    const src = [
      extractFn(HTML, 'function closeModal(id)'),
      extractFn(HTML, 'function escapeHtml(s)'),
      extractFn(HTML, 'function formatMonto(num)'),
      extractFn(HTML, 'function rolDeLinea(l)'),
      extractFn(HTML, 'function docBenef(tipo, id)'),
      extractFn(HTML, 'function cobrosEmitir()'),
      extractFn(HTML, 'function cobrosQuienCambio()'),
      extractFn(HTML, 'function cobrosFormaCambio()'),
      extractFn(HTML, 'async function cobrosConfirmarEmision()'),
      extractFn(HTML, 'async function imprimirReciboCobro(recibo, lineaIds, opts)'),
    ].join('\n\n');
    const mkSandbox = (cobBenef, cobApoderados, document, toast, profMap) => new AsyncFunction(
      'sb','CLUB_ID','document','window','toast','propietariosMap','profesionales',
      'precargarLogo','ROL_POR_BENEFICIARIO','cobBenef','cobApoderados','cobrosBuscar',
      `let cobEmitirIds = [];
       const fmt = formatMonto;
       ${src}
       return { cobrosEmitir, cobrosQuienCambio, cobrosFormaCambio, cobrosConfirmarEmision,
                imprimirReciboCobro, getIds: () => cobEmitirIds };`
    )(sb, CLUB_ID, document, { print(){} }, toast, {}, profMap, async()=>{},
      { propietario:'Propietario', profesional:'Profesional', club:'Club' },
      cobBenef, cobApoderados, async()=>{});

    // (a) CSS de impresión ───────────────────────────────────────────────────
    phase = 'a';
    const mp = extractMediaPrint(HTML);
    ok('a1 .recibo-copia ya NO declara min-height:100vh',
       !/\.recibo-copia\s*\{[^}]*min-height\s*:\s*100vh/.test(mp));
    const jsFirma = HTML.slice(HTML.indexOf('const firma'), HTML.indexOf('const copia'));
    ok('a2 la firma ya NO usa margin-top:auto (no queda anclada al fondo de la caja)',
       !/margin-top\s*:\s*auto/.test(mp) && !/margin-top\s*:\s*auto/.test(jsFirma));
    ok('a3 .recibo-pie tiene break-inside: avoid', cssProp(mp, '.recibo-pie', 'break-inside') === 'avoid');
    ok('a4 .recibo-pie tiene page-break-inside: avoid (legacy)', cssProp(mp, '.recibo-pie', 'page-break-inside') === 'avoid');
    ok('a5 body resetea margin en impresión', (cssProp(mp, 'body', 'margin') || '').trim() === '0',
       `margin="${cssProp(mp,'body','margin')}"`);
    ok('a6 las copias se separan con break-after: page', /\.recibo-copia:not\(:last-child\)\s*\{[^}]*break-after\s*:\s*page/.test(mp));

    // (b) presupuesto en mm con valores PARSEADOS del CSS ────────────────────
    phase = 'b';
    const fCell = px(cssProp(mp, '.recibo-table th, .recibo-table td', 'font-size'));
    const pCell = px((cssProp(mp, '.recibo-table th, .recibo-table td', 'padding') || '').split(/\s+/)[0]);
    const rowMm = (fCell * 1.2 + pCell * 2 + 2) * PX_MM;   // texto + padding arriba/abajo + bordes
    const logoMm = px(cssProp(mp, '.recibo-logo', 'height')) * PX_MM;
    // Alto fijo: rótulo + header + beneficiario + thead + pie. Aproximación conservadora (suma de
    // los bloques del CSS real); no reemplaza la verificación visual, acota el orden de magnitud.
    const fijoMm = 3.5 + (logoMm + 6.9 + 4.6 + 4.8) + 7.0 + rowMm + 38.3;
    const hojaMm = 297 - 2 * 15;   // @page A4 margin 15mm
    const seisMm = fijoMm + 6 * rowMm;
    const maxFilas = Math.floor((hojaMm - fijoMm) / rowMm);
    ok(`b1 el recibo de 6 líneas entra en una hoja (${seisMm.toFixed(0)}mm de ${hojaMm}mm)`, seisMm <= hojaMm);
    ok(`b2 entra con holgura, no al filo (usa <70% de la hoja)`, seisMm < hojaMm * 0.7, `${(seisMm/hojaMm*100).toFixed(0)}%`);
    ok(`b3 el caso extremo de 20 líneas sigue entrando en una hoja`, fijoMm + 20 * rowMm <= hojaMm,
       `${(fijoMm+20*rowMm).toFixed(0)}mm`);
    console.log(`[presupuesto] fila=${rowMm.toFixed(2)}mm  fijo=${fijoMm.toFixed(1)}mm  → entran ~${maxFilas} filas por hoja`);

    // ── fixtures ────────────────────────────────────────────────────────────
    phase = 'fixtures';
    // El probe emite 2 recibos reales, así que mueve el correlativo de Dolores. Se snapshotea
    // arriba y se restaura en el finally (R6). Antes no se restauraba —"los números de recibo son
    // ilimitados"— y el drift se acumulaba corrida a corrida: 28 → 32 en una sola noche
    // (2026-08-30). El número no lo ve nadie, pero era el único probe del set que no lo devolvía.
    const { data: cars } = await sb.from('carreras').select('id').eq('reunion_id',SANDBOX).limit(3);
    const { data: ins } = await sb.from('inscripciones').select('id,carrera_id').in('carrera_id',(cars||[]).map(c=>c.id)).limit(8);
    if ((ins||[]).length < 3) throw new Error('la reunión 9999 no tiene inscripciones suficientes');
    const { data: liq, error: eL } = await sb.from('liquidaciones')
      .insert({club_id:CLUB_ID, reunion_id:SANDBOX, profesional_id:BENEF, estado:'borrador', total_bruto:0, total_descuentos:0}).select().single();
    if (eL) throw new Error('crear liq: ' + eL.message); liqId = liq.id;
    const base = { liquidacion_id: liqId, beneficiario_tipo:'profesional', beneficiario_id:BENEF,
                   reunion_id: SANDBOX, monto_descuento: 0, estado_linea: 'impago' };
    const mk = async (concepto, bruto, tipo, pos, insc) => {
      const { data, error } = await sb.from('liquidacion_detalle')
        .insert({ ...base, concepto, monto_bruto: bruto, concepto_tipo: tipo, posicion: pos, inscripcion_id: insc })
        .select().single();
      if (error) throw new Error('linea ' + concepto + ': ' + error.message); return data;
    };
    // El caso de Fede exacto: 3 incentivos de 10.000 + un 3°, un 4° y un 5°.
    lineas.push(await mk('TEST Carrera 1 — 3° puesto', 12200, 'premio', 3, ins[0].id));
    lineas.push(await mk('TEST Carrera 2 — 4° puesto', 10500, 'premio', 4, ins[1].id));
    lineas.push(await mk('TEST Carrera 7 — 5° puesto', 10000, 'premio', 5, ins[2].id));
    for (let i = 0; i < 3; i++) lineas.push(await mk('TEST Incentivo entrenador', 10000, 'incentivo_entrenador', null, null));
    // 2 líneas extra para el recibo de transferencia
    lineas.push(await mk('TEST transferencia A', 5000, 'premio', 1, ins[0].id));
    lineas.push(await mk('TEST transferencia B', 5000, 'premio', 2, ins[1].id));
    const seis = lineas.slice(0, 6).map(l => l.id);
    const dos  = lineas.slice(6, 8).map(l => l.id);
    console.log(`[fixtures] liq=${liqId}  6 líneas caso Fede + 2 para transferencia`);

    // ── (d) el desplegable ──────────────────────────────────────────────────
    phase = 'd';
    const { data: prof } = await sb.from('profesionales').select('id,nombre,apellido,documento_nro').eq('id',BENEF).single();
    const PROF_MAP_LOCAL = { [BENEF]: prof };
    const cobBenef = { tipo:'profesional', id: BENEF, nombre: `${prof.apellido}, ${prof.nombre}` };
    const APOS = [
      { autorizado_nombre: 'PEREZ, JUANA',   autorizado_documento: '30111222' },
      { autorizado_nombre: 'GOMEZ, RICARDO', autorizado_documento: '27333444' },
    ];
    const toasts = [];
    const dom = makeDom();
    const M = await mkSandbox(cobBenef, APOS, dom.document, (m,k)=>toasts.push([k,m]), PROF_MAP_LOCAL);

    dom.setChecked(seis.map((id,i) => chk(id, [12200,10500,10000,10000,10000,10000][i])));
    M.cobrosEmitir();
    const optsHtml = dom.els['cobr-quien'].innerHTML;
    const nOpts = (optsHtml.match(/<option /g) || []).length;
    ok('d1 el select trae titular + 2 apoderados + "Otro" (4 opciones)', nOpts === 4, `n=${nOpts}`);
    ok('d2 la 1ª opción es el titular con su nombre', /value="titular"[^>]*>Titular — /.test(optsHtml) && optsHtml.includes(prof.apellido));
    ok('d3 aparecen los 2 apoderados vigentes', optsHtml.includes('PEREZ, JUANA') && optsHtml.includes('GOMEZ, RICARDO'));
    ok('d4 existe la opción "Otro"', /value="otro"/.test(optsHtml));
    ok('d5 el modal se abrió', dom.els['modal-cobrador'].classList.has('open'));
    ok('d6 las 6 líneas tildadas quedaron capturadas', M.getIds().length === 6);

    dom.els['cobr-quien'].value = 'titular'; M.cobrosQuienCambio();
    ok('d7 elegir titular precarga su nombre', dom.els['cobr-nombre'].value === cobBenef.nombre);
    ok('d8 elegir titular precarga su documento', dom.els['cobr-doc'].value === (prof.documento_nro || ''),
       `doc="${dom.els['cobr-doc'].value}"`);
    dom.els['cobr-quien'].value = 'apo:1'; M.cobrosQuienCambio();
    ok('d9 elegir un apoderado precarga nombre y documento del apoderado',
       dom.els['cobr-nombre'].value === 'GOMEZ, RICARDO' && dom.els['cobr-doc'].value === '27333444');

    // ── (e) cobrador que NO está en la lista ────────────────────────────────
    phase = 'e';
    dom.els['cobr-quien'].value = 'otro'; M.cobrosQuienCambio();
    ok('e1 "Otro" limpia los campos para tipear de cero',
       dom.els['cobr-nombre'].value === '' && dom.els['cobr-doc'].value === '');
    ok('e2 los inputs NUNCA se deshabilitan (el select precarga, no bloquea)',
       dom.els['cobr-nombre'].disabled === false && dom.els['cobr-doc'].disabled === false);
    ok('e3 el HTML de los inputs no tiene readonly ni disabled',
       !/id="cobr-(nombre|doc)"[^>]*(readonly|disabled)/.test(HTML));
    // validación: sin nombre no se llama al RPC
    dom.els['cobr-nombre'].value = ''; dom.els['cobr-doc'].value = '99'; dom.els['cobr-forma'].value = 'efectivo';
    const { count: antes } = await sb.from('recibos').select('*', { count:'exact', head:true }).eq('club_id',CLUB_ID);
    await M.cobrosConfirmarEmision();
    const { count: despues } = await sb.from('recibos').select('*', { count:'exact', head:true }).eq('club_id',CLUB_ID);
    ok('e4 sin nombre NO se emite (validación previa al RPC)', antes === despues && toasts.some(t=>t[0]==='error'));

    // ── (f) emitir_recibo recibe nombre y documento no nulos ────────────────
    phase = 'f';
    dom.els['cobr-nombre'].value = 'SERENO SIN APODERADO';   // no está en la lista
    dom.els['cobr-doc'].value    = '11222333';
    dom.els['cobr-forma'].value  = 'efectivo';
    dom.els['cobr-comprobante'].value = '';
    const fotoA = await fotoRecibos();
    await M.cobrosConfirmarEmision();
    const recA = await reciboNuevo(fotoA);
    if (recA) recIds.push(recA.id);
    ok('f1 se emitió el recibo con un cobrador que NO estaba en la lista', !!recA);
    ok('f2 cobrador_nombre persistido NO es null', recA?.cobrador_nombre === 'SERENO SIN APODERADO', `="${recA?.cobrador_nombre}"`);
    ok('f3 cobrador_documento persistido NO es null', recA?.cobrador_documento === '11222333', `="${recA?.cobrador_documento}"`);
    ok('f4 forma_pago = efectivo', recA?.forma_pago === 'efectivo');
    ok('f5 el modal se cerró tras emitir', !dom.els['modal-cobrador'].classList.has('open'));
    const { data: marcadas } = await sb.from('liquidacion_detalle').select('id,estado_linea').eq('recibo_id',recA.id);
    ok('f6 las 6 líneas quedaron pagadas contra ese recibo',
       (marcadas||[]).length === 6 && (marcadas||[]).every(l=>l.estado_linea==='pagado'), `n=${(marcadas||[]).length}`);

    // ── (c) el HTML impreso: el pie va con las líneas ───────────────────────
    phase = 'c';
    await M.imprimirReciboCobro(recA, seis, { origen: 'otro' });
    const out = dom.els['recibo-print'].innerHTML;
    ok('c1 se generan 2 copias (original + duplicado)', (out.match(/class="recibo-copia"/g)||[]).length === 2);
    ok('c2 rotuladas ORIGINAL y DUPLICADO', out.includes('>ORIGINAL<') && out.includes('>DUPLICADO<'));
    ok('c3 cada copia trae las 6 filas', (out.match(/<tr><td>/g)||[]).length === 12);
    ok('c4 hay 2 bloques .recibo-pie', (out.match(/class="recibo-pie"/g)||[]).length === 2);
    // el pie tiene que CONTENER total + retira + firma: se verifica por posición dentro del bloque
    const pie = primerPie(out);
    ok('c5 el TOTAL está dentro del pie', pie.includes('NETO A COBRAR'));
    ok('c6 "Retira" está dentro del pie', pie.includes('Retira:'));
    ok('c7 la FIRMA está dentro del pie (no suelta al final de la copia)',
       pie.includes('recibo-firma') && pie.includes('Aclaración') && pie.includes('DNI'));
    ok('c8 el pie imprime el nombre del cobrador que no era titular', pie.includes('SERENO SIN APODERADO'));
    ok('c9 el pie imprime el documento', pie.includes('11222333'));
    ok('c10 el encabezado dice "A nombre de" con el beneficiario', out.includes('A nombre de') && out.includes(prof.apellido));

    // ── (h) titular: sin redundancia ────────────────────────────────────────
    phase = 'h';
    await M.imprimirReciboCobro({ ...recA, cobrador_nombre: cobBenef.nombre, cobrador_documento: '55666777' }, seis, { origen: 'titular' });
    const outT = dom.els['recibo-print'].innerHTML;
    ok('h1 si cobra el titular, el pie dice "el titular"', outT.includes('Retira:</strong> el titular'));
    const pieT = primerPie(outT);
    ok('h2 y NO repite el nombre del titular en el pie',
       pieT.length > 0 && !pieT.includes(cobBenef.nombre), `pie=${pieT.length}b`);
    ok('h3 el nombre del titular sigue estando arriba, en "A nombre de"', outT.includes('A nombre de') && outT.includes(cobBenef.nombre));

    // ── (g) transferencia: sin firma ────────────────────────────────────────
    phase = 'g';
    dom.setChecked(dos.map(id => chk(id, 5000)));
    M.cobrosEmitir();
    dom.els['cobr-quien'].value = 'otro'; M.cobrosQuienCambio();
    dom.els['cobr-nombre'].value = 'TESORERIA';
    dom.els['cobr-doc'].value = '20999888';
    dom.els['cobr-forma'].value = 'transferencia';
    M.cobrosFormaCambio();
    ok('g1 en transferencia se muestra el campo de comprobante', dom.els['cobr-comprobante-row'].style.display === '');
    ok('g2 la nota del modal avisa que no hay firma', /SIN espacio de firma/.test(dom.els['cobr-nota-firma'].textContent));
    dom.els['cobr-comprobante'].value = 'https://banco.test/comp/123';
    const fotoB = await fotoRecibos();
    await M.cobrosConfirmarEmision();
    const recB = await reciboNuevo(fotoB);
    if (recB) recIds.push(recB.id);
    ok('g3 se emitió con forma_pago = transferencia', recB?.forma_pago === 'transferencia');
    ok('g4 el comprobante quedó persistido', recB?.comprobante_url === 'https://banco.test/comp/123');
    ok('g5 el cobrador también se registra en transferencia',
       recB?.cobrador_nombre === 'TESORERIA' && recB?.cobrador_documento === '20999888');
    await M.imprimirReciboCobro(recB, dos, { origen: 'otro' });
    const outB = dom.els['recibo-print'].innerHTML;
    ok('g6 en transferencia el recibo NO imprime el bloque de firma', !outB.includes('recibo-firma'));
    ok('g7 imprime la nota de transferencia', outB.includes('TRANSFERENCIA') && outB.includes('no requiere firma'));
    ok('g8 imprime la referencia del comprobante', outB.includes('https://banco.test/comp/123'));
    ok('g9 y el pie sigue siendo un bloque atómico', (outB.match(/class="recibo-pie"/g)||[]).length === 2);
    // efectivo vs transferencia: la diferencia es SOLO el pie
    ok('g10 en efectivo sí imprimía firma (control de la comparación)', out.includes('recibo-firma'));

  } catch (e) {
    ok(`EXCEPCIÓN en fase '${phase}'`, false, e.message); console.error(e);
  } finally {
    try {
      // Orden: soltar líneas → borrar líneas → borrar liquidación → borrar recibos. El FK
      // liquidacion_detalle.recibo_id es NO ACTION: si quedara una línea apuntando, el DELETE del
      // recibo falla en silencio y deja basura (pasó en la 1ª corrida del 2026-08-28).
      for (const rid of recIds) await sb.from('liquidacion_detalle').update({ recibo_id: null }).eq('recibo_id', rid);
      for (const l of lineas) await sb.from('liquidacion_detalle').delete().eq('id', l.id);
      if (liqId) await sb.from('liquidaciones').delete().eq('id', liqId);
      for (const rid of recIds) await sb.from('recibos').delete().eq('id', rid);
      const { data: liqFin } = await sb.from('liquidaciones').select('id').eq('id', liqId || '00000000-0000-0000-0000-000000000000');
      const { data: recFin } = await sb.from('recibos').select('id').in('id', recIds.length ? recIds : ['00000000-0000-0000-0000-000000000000']);
      ok('R1 cleanup: fixtures borradas (liquidación, líneas y recibos de prueba)',
         !liqFin?.length && !recFin?.length);
      // El sandbox tiene que quedar como estaba: las fixtures son propias, no se toca lo que ya vivía ahí.
      const { data: sobra } = await sb.from('liquidacion_detalle').select('id')
        .eq('liquidacion_id', liqId || '00000000-0000-0000-0000-000000000000');
      ok('R2 cleanup: no quedan líneas huérfanas de la liquidación de prueba', !sobra?.length);

      // ── R3/R4/R5 — verificación por ESTADO ────────────────────────────────
      // Las fixtures propias ya se borraron; lo que queda tiene que ser, línea por línea y campo
      // por campo, lo mismo que había antes de arrancar. Si algo cambió se restaura Y se reporta:
      // haber podido arreglarlo no lo vuelve aceptable, significa que el probe pisó algo ajeno.
      const arregladas = await restaurarLineas(sb, snapAntes, await snapshotLineas(sb, SANDBOX));
      const verif = diffLineas(snapAntes, await snapshotLineas(sb, SANDBOX));
      ok('R3 restore por ESTADO: el sandbox quedó campo por campo como estaba',
         verif.limpio, describir(verif));
      ok('R4 el probe no pisó ninguna línea ajena (0 restauraciones de emergencia)',
         arregladas === 0, `${arregladas} línea(s) hubo que devolver a su estado`);
      // Sin filtro de club: el recibo fantasma del 2026-08-28 sobrevivió porque fotoRecibos()
      // filtraba por el club de Dolores y el recibo había salido con el de Mi Club Hípico.
      const recSobra = (await recibosDesde(sb, T0)).filter(r => !recIds.includes(r.id));
      ok('R5 no quedó ningún recibo creado durante la corrida, en NINGÚN club',
         recSobra.length === 0,
         recSobra.map(r => `#${r.numero_recibo} club=${r.club_id.slice(0,8)}`).join(', '));

      // ── R6 — club_secuencias ──────────────────────────────────────────────
      // Borrar los recibos NO devuelve el correlativo: fn_siguiente_recibo es un contador
      // monótono en club_secuencias, no un MAX+1. Hay que reponerlo a mano.
      if (seqAntes === null) {
        await sb.from('club_secuencias').delete().eq('club_id', CLUB_ID).eq('tipo', 'recibo');
      } else {
        await sb.from('club_secuencias').update({ ultimo_numero: seqAntes })
          .eq('club_id', CLUB_ID).eq('tipo', 'recibo');
      }
      const seqDespues = (await sb.from('club_secuencias')
        .select('ultimo_numero').eq('club_id', CLUB_ID).eq('tipo', 'recibo').maybeSingle()).data?.ultimo_numero ?? null;
      ok('R6 club_secuencias de Dolores devuelto a donde estaba',
         seqDespues === seqAntes, `antes=${seqAntes} después=${seqDespues}`);
    } catch (e) { ok('CLEANUP FALLÓ — revisar manualmente', false, e.message); console.error('[cleanup]', e); }
    console.log('\n──────── RESULTADO ────────');
    for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  (' + r.n + ')' : ''}`);
    const failed = results.filter(r => r.s === '❌').length;
    console.log(`\n${failed === 0 ? '✅ TODO OK' : '❌ ' + failed + ' fallo(s)'} — ${results.length} checks`);
    process.exit(failed === 0 ? 0 : 1);
  }
})();
