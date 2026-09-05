/**
 * Probe — pantalla "Ya casi" del paso final de solicitar-acceso.html (código real, sin browser).
 *
 * El agujero que tapa el código bajo prueba: el circuito de registro tiene TRES pasos —llenar el
 * form, confirmar el correo, enviar la solicitud— y el tercero no se leía como un paso. El que
 * clickeaba el link del mail volvía a solicitar-acceso.html, veía el MISMO formulario con sus
 * datos precargados y lo interpretaba como que ya había terminado: cerraba la pestaña. La cuenta
 * quedaba confirmada en auth.users y `solicitudes_acceso` vacía — invisible para la secretaría.
 * Le pasó al primer usuario real el 03/09/2026.
 * Diagnóstico: docs/diagnosticos/2026-09-03_fede-registro-real-sin-solicitud.md
 *
 * La decisión de producto fue NO auto-enviar al detectar sesión + borrador (mandaría sin que la
 * persona revise y arrastra el riesgo de un borrador viejo), sino hacer el paso inconfundible:
 * ficha de sólo lectura + un botón grande. Este probe verifica las CINCO ramas del camino 2 y que
 * la ficha no se pueda confundir con el formulario.
 *
 * Patrón de tests/README.md § "Browser NO disponible": se extrae del propio solicitar-acceso.html
 * el bloque real —helpers de UI, validación, los handlers y el "camino 2"— por ancla y balance de
 * llaves, y se lo corre con new AsyncFunction inyectando un mini-DOM. Nada se reimplementa acá:
 * si el archivo cambia, el probe corre el archivo cambiado.
 *
 * SIN RED Y SIN CREDENCIALES, a diferencia de probe_solicitar_cuenta_existente.mjs. Lo que se
 * prueba son ramas de UI: qué pantalla se muestra según sesión / usuario / solicitud / borrador.
 * Supabase entra como stub (las respuestas de `usuarios` y `solicitudes_acceso` son el INPUT de
 * la decisión, no algo que haya que descubrir en prod), así que NO manda mails, NO planta cuentas
 * y NO escribe una fila. Se puede correr en cualquier rutina y las veces que haga falta.
 *
 *   node tests/probe_solicitar_falta_paso.mjs
 *   node tests/probe_solicitar_falta_paso.mjs --mutantes           # los 12 mutantes
 *   node tests/probe_solicitar_falta_paso.mjs --mutantes=N1,N4     # por tanda
 *
 * NO CONFUNDIR con tests/probe_solicitar_cuenta_existente.mjs, que toca el MISMO archivo pero sí
 * pega contra GoTrue y manda 2 mails que rebotan en Resend: ése sigue siendo A DEMANDA.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOLICITAR_PATH = process.env.SOLICITAR_HTML || join(HERE, '..', 'solicitar-acceso.html');
const HTML = readFileSync(SOLICITAR_PATH, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const results = [];
const ok = (t, c, n='') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

// ── extracción por ancla ────────────────────────────────────────────────────
// El scan arranca en la llave FINAL de la firma, no en la primera que aparezca después del ancla.
function desdeFirma(src, firma){
  const i = src.indexOf(firma);
  if (i < 0) throw new Error(`no encontré: ${firma}`);
  if (!firma.endsWith('{')) throw new Error(`la firma tiene que terminar en '{': ${firma}`);
  let d = 0;
  for (let k = i + firma.length - 1; k < src.length; k++){
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return { desde:i, hasta:k + 1, src:src.slice(i, k + 1) }; }
  }
  throw new Error(`no pude cerrar: ${firma}`);
}

// El slab: de los helpers de UI hasta el final del "camino 2". Bloque contiguo del archivo, sin
// editar — pintarResumen, precargarForm, abrirFormCorreccion y los dos handlers nuevos caen
// adentro solos.
const INICIO_SLAB = 'function showErr(m) {';
const FIN_SLAB    = '// --- Camino 2: ya logueado (volvió de confirmar el email) -------------------\n(async () => {';
const iSlab = HTML.indexOf(INICIO_SLAB);
if (iSlab < 0) throw new Error(`no encontré el arranque del slab: ${INICIO_SLAB}`);
const camino2 = desdeFirma(HTML, FIN_SLAB);
const SLAB = HTML.slice(iSlab, camino2.hasta) + ')();';

// ── mini-DOM ────────────────────────────────────────────────────────────────
// Los ids salen del HTML REAL: pedir uno que el archivo no tiene revienta el probe en vez de
// devolver un nodo fantasma. Es el guard que hace que renombrar #sec-falta o una fila del
// resumen rompa acá en vez de pasar en silencio.
const IDS_HTML = new Set([...HTML.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
function mkDom(valores = {}){
  const nodos = {};
  const nuevo = (id) => ({
    id, value: valores[id] ?? '', textContent: '', innerHTML: '', disabled: false, checked: false,
    onclick: null, style: {}, addEventListener(){}, _focus: 0, focus(){ this._focus++; },
    classList: { _c:new Set(),
      add(c){ this._c.add(c); }, remove(c){ this._c.delete(c); },
      contains(c){ return this._c.has(c); },
      toggle(c, on){ on ? this._c.add(c) : this._c.delete(c); } },
  });
  const get = (id) => {
    if (!IDS_HTML.has(id)) throw new Error(`el código pidió #${id} y ese id NO existe en el HTML`);
    return (nodos[id] ||= nuevo(id));
  };
  const radios = { profesional: nuevo('rol-prof'), propietario: nuevo('rol-prop') };
  return {
    getElementById: get,
    querySelector(sel){
      if (sel === 'input[name=rol]:checked'){
        const r = Object.entries(radios).find(([, n]) => n.checked);
        if (!r) throw new Error('ningún radio de rol está marcado');
        return { value: r[0] };
      }
      const m = sel.match(/^input\[name=rol\]\[value="(.+)"\]$/);
      if (m) return radios[m[1]];
      throw new Error(`selector no soportado por el mini-DOM: ${sel}`);
    },
    _n: nodos, _radios: radios,
    txt(id){ return get(id).textContent; },
    val(id){ return get(id).value; },
    // Para las notas: un nodo que nunca se tocó no existe todavía en el mini-DOM, y leerle
    // .style.display revienta el probe en vez de mostrar por qué falló el assert. Con un
    // mutante que hace return antes de tiempo, eso convierte una muerte en un crash.
    dsp(id){ return JSON.stringify(get(id).style.display); },
    est(id){ return get(id).style.display; },
    // Una fila del resumen se esconde con style.display = 'none'; el resto queda en '' (la que
    // nunca se tocó queda en undefined, que también es "visible" en el HTML).
    visible(id){ return get(id).style.display !== 'none'; },
    // Una SECCIÓN sólo cuenta como visible si seccion() la puso en '': arrancan todas con
    // display:none en el HTML, así que undefined acá es "nunca se mostró".
    seccionVisible(id){ return get(id).style.display === ''; },
  };
}

// Los comentarios HTML citan textualmente el copy VIEJO para dejar asentado qué se cambió y por
// qué. Eso no lo lee nadie en el navegador, así que los asserts de texto miran el bloque sin
// comentarios: lo que se afirma es lo que el usuario ve.
const sinComentarios = (h) => h.replace(/<!--[\s\S]*?-->/g, '');

// El bloque de una sección tal como está escrito en el archivo, para asertar sobre el HTML crudo.
function bloqueHtml(idSeccion, marcaFin){
  const i = HTML.indexOf(`<div id="${idSeccion}"`);
  const j = HTML.indexOf(marcaFin, i);
  if (i < 0 || j < 0) throw new Error(`no pude recortar el bloque de #${idSeccion}`);
  return HTML.slice(i, j);
}

// ── arnés: el slab real con stubs ───────────────────────────────────────────
function chain(filas){
  const api = { select:()=>api, eq:()=>api, maybeSingle: async()=>({ data: filas, error:null }) };
  return api;
}
async function mkPagina({ dom, session = null, tablas = {}, borrador = null,
                          respSignUp = null, rpcError = null }){
  const rpc = [];
  const sb = {
    auth: {
      getSession: async () => ({ data:{ session } }),
      signUp: async () => respSignUp,
    },
    from: (t) => chain(tablas[t] ?? null),
    rpc: async (fn, args) => { rpc.push({ fn, args }); return { error: rpcError }; },
  };
  const loc = { href: 'https://sigh.com.ar/solicitar-acceso.html', search:'', replace(u){ this.reemplazo = u; } };
  const store = { _d:{}, getItem(k){ return this._d[k] ?? null; },
                  setItem(k,v){ this._d[k]=String(v); }, removeItem(k){ delete this._d[k]; } };
  if (borrador !== null) store.setItem('sgh_solicitud_borrador', JSON.stringify(borrador));
  const cf = { reset:0 };
  const fn = new AsyncFunction(
    'document','window','localStorage','sb','CLUB_DOLORES','BORRADOR','cfToken','cfReset','ActiveReunion',
    SLAB + `
 return {
   enviar:       document.getElementById('btn-enviar').onclick,
   faltaEnviar:  document.getElementById('btn-falta-enviar').onclick,
   faltaCorregir:document.getElementById('btn-falta-corregir').onclick,
   seccion, leerDatos, validar, setRol,
 };`);
  const api = await fn(dom, { location: loc }, store, sb,
    '0649e9c5-9e87-4aad-842f-101458e6b33c', 'sgh_solicitud_borrador',
    () => 'cf-token-de-prueba', () => { cf.reset++; }, null);
  // El "camino 2" es una IIFE async que nadie awaitea: dos vueltas de cola alcanzan, porque los
  // stubs resuelven en el acto.
  await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  return { ...api, sb, loc, store, cf, rpc };
}

// ── fixtures ────────────────────────────────────────────────────────────────
const SES = { user:{ id:'uid-probe' } };
const SIN_NADA = { usuarios: null, solicitudes_acceso: null };

// Un borrador de propietario que pasa validar(): es el caso de Fede.
const BORR_PROP = {
  nombre:'Federico', apellido:'Iguacel', dni:'23456789', telefono:'5492245123456',
  rol:'propietario', origenHipodromo:'Tandil', origenPatente:'', origenCaballeriza:'Stud La Yaya',
};
const BORR_PROF = {
  nombre:'Ana', apellido:'Gómez', dni:'30111222', telefono:'',
  rol:'profesional', origenHipodromo:'Azul', origenPatente:'AZ-4412', origenCaballeriza:'',
};
// Mismo profesional, sin patente ni teléfono: las dos filas opcionales del resumen.
const BORR_PROF_PELADO = { ...BORR_PROF, origenPatente:'' };
// Le falta el hipódromo de origen — validar() lo rechaza.
const BORR_INCOMPLETO = { ...BORR_PROP, origenHipodromo:'' };

// Un formulario ya tipeado, para el alta sin sesión.
const FORM = (email) => ({
  'f-nombre':'Juan', 'f-apellido':'Probe', 'f-dni':'12345678', 'f-tel':'2245123456',
  'f-hip-prop':'Tandil', 'f-caballeriza':'Stud Probe', 'f-email':email, 'f-pass':'Probe12345!',
});

// ══════════════════════════════ MUTANTES ════════════════════════════════════
// Uno por rama del camino 2 y por pieza de la pantalla nueva.
const MUTANTES = [
  { id:'N1', desc:'el camino 2 vuelve a re-mostrar el formulario (el bug original vuelve)',
    mata:['P1','P2'],
    from:`    pintarResumen(b);\n    seccion('sec-falta');`,
    to:  `    seccion('sec-form');` },

  { id:'N2', desc:'la condición se invierte: ficha con borrador roto, formulario con borrador bueno',
    mata:['P1','P6'],
    from:`  if (!validar(b, false)) {`,
    to:  `  if (validar(b, false)) {` },

  { id:'N3', desc:'seccion() no conoce sec-falta: la pantalla nunca se muestra', mata:['P1'],
    from:`  ['sec-form','sec-confirmar','sec-existe','sec-falta','sec-listo','sec-reintento'].forEach(s => {`,
    to:  `  ['sec-form','sec-confirmar','sec-existe','sec-listo','sec-reintento'].forEach(s => {` },

  { id:'N4', desc:'"corregir mis datos" no despliega el formulario', mata:['P5'],
    from:`document.getElementById('btn-falta-corregir').onclick = () => { hideMsgs(); abrirFormCorreccion(); };`,
    to:  `document.getElementById('btn-falta-corregir').onclick = () => { hideMsgs(); };` },

  { id:'N5', desc:'el botón de la ficha da "enviada" sin llamar a la RPC', mata:['P4'],
    from:`  loading('btn-falta-enviar', 'btn-falta-txt', true);\n  const e = await enviarSolicitud(d);`,
    to:  `  loading('btn-falta-enviar', 'btn-falta-txt', true);\n  const e = null;` },

  { id:'N6', desc:'sin borrador, el form usa el texto genérico del alta (no dice que falta la solicitud)',
    mata:['P6b'],
    from:`      'Tu correo ya está confirmado, pero todavía falta la solicitud. Completá los datos y enviala.';`,
    to:  `      'Completá tus datos y la secretaría del hipódromo va a revisar la solicitud.';` },

  { id:'N7', desc:'sec-confirmar vuelve al texto viejo: no anticipa el paso que falta', mata:['P11'],
    from:`        <strong style="color:var(--oro-suave);">Ojo: con eso todavía no queda enviada.</strong>`,
    to:  `        Abrilo y volvés acá para terminar la solicitud.` },

  { id:'N8', desc:'la etiqueta del hipódromo no cambia con el rol', mata:['P3'],
    from:`    esProp ? 'Hipódromo de la caballeriza' : 'Hipódromo de la patente';`,
    to:  `    'Hipódromo';` },

  { id:'N9', desc:'la ficha se muestra vacía: el resumen no se pinta', mata:['P2'],
    from:`    pintarResumen(b);\n    seccion('sec-falta');`,
    to:  `    seccion('sec-falta');` },

  { id:'N10', desc:'la fila de caballeriza se muestra siempre, también para el entrenador',
    mata:['P3'],
    from:`  fila('res-row-caballeriza', esProp);`,
    to:  `  fila('res-row-caballeriza', true);` },

  { id:'N11', desc:'con usuario en el sistema ya no redirige a portal.html', mata:['P8'],
    from:`  if (usr) { window.location.replace('portal.html'); return; }`,
    to:  `  if (usr) { return; }` },

  { id:'N12', desc:'la ficha manda la RPC aunque el borrador esté incompleto', mata:['P13'],
    from:`  if (err) { showErr(err); abrirFormCorreccion(); return; }`,
    to:  `  if (err) { showErr(err); }` },
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
  const dir = mkdtempSync(join(tmpdir(), 'mut-solicitar-falta-'));
  console.log(`\n═══ MUTATION TESTING · ${tanda.length}/${MUTANTES.length} mutantes${pedidos ? ` (tanda: ${pedidos.join(',')})` : ''} ═══\n(copias en ${dir} — el repo no se toca)\n`);
  let vivos = 0, arnes = 0;
  for (const m of tanda){
    if (!HTML.includes(m.from)) {
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el ancla no existe en el fuente. ${m.desc}`);
      arnes++; continue;
    }
    const path = join(dir, `${m.id}.html`);
    writeFileSync(path, HTML.replace(m.from, m.to));
    let out = '';
    try { out = execFileSync(process.execPath, [SELF],
      { env:{ ...process.env, SOLICITAR_HTML: path }, encoding:'utf8', stdio:['ignore','pipe','pipe'] }); }
    catch (e) { out = (e.stdout||'') + (e.stderr||''); }

    // "murió por assert" vs "murió al arrancar": si no está la línea final, el hijo no llegó a
    // los asserts y del mutante no se sabe nada — reportarlo como SOBREVIVE sería mentir.
    const corrio = /^\d+\/\d+ OK$/m.test(out);
    if (!corrio) {
      const causa = (out.split('\n').find(l => /Error|error:/.test(l)) || '(sin línea de error)').trim();
      console.log(`⚠ ${m.id} ERROR DE ARNÉS — el probe no llegó a correr los asserts. ${m.desc}`
        + `\n     ↳ ${causa.slice(0, 160)}`);
      arnes++; continue;
    }
    const muertos = m.mata.filter(a => out.includes(`❌ ${a})`));
    const vivo = muertos.length === 0;
    if (vivo) vivos++;
    console.log(`${vivo?'❌':'✅'} ${m.id} ${vivo?'SOBREVIVE':'muere'} — ${m.desc}`
      + `  [esperaba matar ${m.mata.join(',')}${muertos.length?`; murieron ${muertos.join(',')}`:''}]`);
  }
  const partes = [`${tanda.length - vivos - arnes} muertos`];
  if (vivos) partes.push(`${vivos} SOBREVIVEN`);
  if (arnes) partes.push(`${arnes} ERROR DE ARNÉS`);
  console.log(`\n${vivos===0 && arnes===0 ? '✅ TANDA LIMPIA' : '❌ TANDA CON HALLAZGOS'} — ${tanda.length} probados · ${partes.join(' · ')}\n`);
  process.exit(vivos === 0 && arnes === 0 ? 0 : 1);
}

// ══════════════════════════════ CORRIDA NORMAL ══════════════════════════════
(async () => {
  try {
    // ── P1/P2 · borrador válido → la ficha, NO el formulario ────────────────
    const d1 = mkDom(); d1._radios.propietario.checked = true;
    const p1 = await mkPagina({ dom:d1, session:SES, tablas:SIN_NADA, borrador:BORR_PROP });

    ok('P1) sesión + sin usuario + sin solicitud + borrador válido → pantalla "Ya casi", '
       + 'y el formulario NO se muestra',
       d1.seccionVisible('sec-falta') && !d1.seccionVisible('sec-form')
       && p1.loc.reemplazo === undefined,
       `sec-falta=${d1.dsp('sec-falta')}`
       + ` · sec-form=${d1.dsp('sec-form')}`
       + ` · replace=${p1.loc.reemplazo}`);

    ok('P2) la ficha muestra los datos del borrador, legibles',
       d1.txt('res-nombre') === 'Federico Iguacel'
       && d1.txt('res-dni') === '23456789'
       && d1.txt('res-rol') === 'Propietario'
       && d1.txt('res-caballeriza') === 'Stud La Yaya'
       && d1.txt('res-hipodromo') === 'Tandil'
       && d1.txt('res-tel') === '5492245123456',
       [ 'nombre='+d1.txt('res-nombre'), 'dni='+d1.txt('res-dni'), 'rol='+d1.txt('res-rol'),
         'caballeriza='+d1.txt('res-caballeriza'), 'hip='+d1.txt('res-hipodromo'),
         'tel='+d1.txt('res-tel') ].join(' · '));

    ok('P2b) propietario: se ve la caballeriza y no la patente, y la etiqueta del hipódromo '
       + 'es la de la caballeriza',
       d1.visible('res-row-caballeriza') && !d1.visible('res-row-patente')
       && d1.txt('res-k-hipodromo') === 'Hipódromo de la caballeriza',
       `caballeriza=${d1.visible('res-row-caballeriza')} · patente=${d1.visible('res-row-patente')}`
       + ` · etiqueta=${d1.txt('res-k-hipodromo')}`);

    // ── P3 · el otro rol ────────────────────────────────────────────────────
    const d3 = mkDom(); d3._radios.propietario.checked = true;
    await mkPagina({ dom:d3, session:SES, tablas:SIN_NADA, borrador:BORR_PROF });
    ok('P3) entrenador: patente visible, caballeriza escondida, etiqueta de hipódromo la de la patente',
       d3.txt('res-rol') === 'Entrenador'
       && d3.visible('res-row-patente') && d3.txt('res-patente') === 'AZ-4412'
       && !d3.visible('res-row-caballeriza')
       && d3.txt('res-k-hipodromo') === 'Hipódromo de la patente',
       `rol=${d3.txt('res-rol')} · patente=${d3.visible('res-row-patente')}/${d3.txt('res-patente')}`
       + ` · caballeriza=${d3.visible('res-row-caballeriza')} · etiqueta=${d3.txt('res-k-hipodromo')}`);

    ok('P3b) el teléfono vacío no deja una fila en blanco', !d3.visible('res-row-tel'),
       `res-row-tel=${d3.dsp('res-row-tel')}`);

    const d3c = mkDom(); d3c._radios.propietario.checked = true;
    await mkPagina({ dom:d3c, session:SES, tablas:SIN_NADA, borrador:BORR_PROF_PELADO });
    ok('P3c) la patente es opcional: sin ella, la fila tampoco aparece',
       !d3c.visible('res-row-patente') && d3c.visible('res-row-hipodromo'),
       `patente=${d3c.dsp('res-row-patente')}`);

    // ── P4 · el botón grande manda la solicitud ─────────────────────────────
    const d4 = mkDom(); d4._radios.propietario.checked = true;
    const p4 = await mkPagina({ dom:d4, session:SES, tablas:SIN_NADA, borrador:BORR_PROP });
    await p4.faltaEnviar();
    ok('P4) "Enviar solicitud" llama a rpc_solicitar_acceso con los datos de la ficha',
       p4.rpc.length === 1 && p4.rpc[0].fn === 'rpc_solicitar_acceso'
       && p4.rpc[0].args.p_documento_nro === '23456789'
       && p4.rpc[0].args.p_rol_pedido === 'propietario'
       && p4.rpc[0].args.p_origen_caballeriza === 'Stud La Yaya'
       && p4.rpc[0].args.p_origen_hipodromo === 'Tandil',
       JSON.stringify(p4.rpc));
    ok('P4b) y después muestra "solicitud enviada" y limpia el borrador',
       d4.seccionVisible('sec-listo') && !d4.seccionVisible('sec-falta')
       && p4.store.getItem('sgh_solicitud_borrador') === null,
       `sec-listo=${d4.dsp('sec-listo')}`
       + ` · borrador=${p4.store.getItem('sgh_solicitud_borrador')}`);

    // Si la RPC falla, la ficha se queda donde está: el borrador NO se borra.
    const d4e = mkDom(); d4e._radios.propietario.checked = true;
    const p4e = await mkPagina({ dom:d4e, session:SES, tablas:SIN_NADA, borrador:BORR_PROP,
                                 rpcError:{ message:'ya envió una solicitud' } });
    await p4e.faltaEnviar();
    ok('P4c) si la RPC falla, no dice "enviada" y el borrador sobrevive para reintentar',
       !d4e.seccionVisible('sec-listo')
       && p4e.store.getItem('sgh_solicitud_borrador') !== null
       && d4e._n['err'].classList.contains('show')
       && /ya envió una solicitud/i.test(d4e.txt('err')),
       `sec-listo=${d4e.dsp('sec-listo')} · err=${d4e.txt('err')}`);

    // ── P5 · el link de corregir despliega el formulario precargado ─────────
    const d5 = mkDom(); d5._radios.propietario.checked = true;
    const p5 = await mkPagina({ dom:d5, session:SES, tablas:SIN_NADA, borrador:BORR_PROP });
    p5.faltaCorregir();
    ok('P5) "corregir mis datos" despliega el formulario y esconde la ficha',
       d5.seccionVisible('sec-form') && !d5.seccionVisible('sec-falta'),
       `sec-form=${d5.dsp('sec-form')}`
       + ` · sec-falta=${d5.dsp('sec-falta')}`);
    ok('P5b) y viene precargado con el borrador, sin pedir la cuenta de nuevo',
       d5._n['f-nombre'].value === 'Federico' && d5._n['f-apellido'].value === 'Iguacel'
       && d5._n['f-dni'].value === '23456789' && d5._n['f-tel'].value === '5492245123456'
       && d5._n['f-hip-prop'].value === 'Tandil'
       && d5._n['f-caballeriza'].value === 'Stud La Yaya'
       && d5.est('grp-cuenta') === 'none',
       `nombre=${d5._n['f-nombre'].value} · dni=${d5._n['f-dni'].value}`
       + ` · hip=${d5.val('f-hip-prop')} · grp-cuenta=${d5.dsp('grp-cuenta')}`);
    ok('P5c) con el rol del borrador ya elegido y el bloque de origen correcto',
       d5._radios.propietario.checked === true
       && d5.est('grp-origen-prop') === ''
       && d5.est('grp-origen-prof') === 'none'
       && d5._n['opt-prop'].classList.contains('sel'),
       `origen-prop=${d5.dsp('grp-origen-prop')}`
       + ` · origen-prof=${d5.dsp('grp-origen-prof')}`);
    ok('P5d) el subtítulo del formulario dice que todavía hay que enviar',
       /enviar solicitud/i.test(d5._n['sub-form'].textContent)
       && d5._n['f-nombre']._focus === 1,
       `sub=${d5._n['sub-form'].textContent} · focus=${d5._n['f-nombre']._focus}`);

    // Y desde ahí, el botón de siempre manda la solicitud (camino ya logueado de #btn-enviar).
    await p5.enviar();
    ok('P5e) desde el formulario corregido, "Enviar solicitud" manda la RPC y no re-crea la cuenta',
       p5.rpc.length === 1 && p5.rpc[0].args.p_nombre === 'Federico'
       && d5.seccionVisible('sec-listo'),
       JSON.stringify(p5.rpc));

    // ── P6/P7 · sin borrador utilizable → formulario, con texto propio ──────
    const d6 = mkDom(); d6._radios.propietario.checked = true;
    const p6 = await mkPagina({ dom:d6, session:SES, tablas:SIN_NADA, borrador:null });
    const SUB_ALTA = 'Completá tus datos y la secretaría del hipódromo va a revisar la solicitud.';
    ok('P6) sin borrador (otro dispositivo, localStorage limpio) → el formulario, no la ficha',
       d6.seccionVisible('sec-form') && !d6.seccionVisible('sec-falta')
       && d6.est('grp-cuenta') === 'none' && p6.loc.reemplazo === undefined,
       `sec-form=${d6.dsp('sec-form')}`
       + ` · sec-falta=${d6.dsp('sec-falta')}`);
    ok('P6b) con un texto propio: dice que el correo quedó confirmado y que la solicitud FALTA',
       /confirmad/i.test(d6._n['sub-form'].textContent)
       && /falta/i.test(d6._n['sub-form'].textContent)
       && d6._n['sub-form'].textContent !== SUB_ALTA
       && d6._n['sub-form'].textContent !== d5._n['sub-form'].textContent,
       `sub=${d6._n['sub-form'].textContent}`);

    const d7 = mkDom(); d7._radios.propietario.checked = true;
    await mkPagina({ dom:d7, session:SES, tablas:SIN_NADA, borrador:BORR_INCOMPLETO });
    ok('P7) borrador que no pasa validar() → mismo camino que sin borrador, nunca la ficha',
       d7.seccionVisible('sec-form') && !d7.seccionVisible('sec-falta')
       && d7._n['sub-form'].textContent === d6._n['sub-form'].textContent,
       `sec-falta=${d7.dsp('sec-falta')} · sub=${d7.txt('sub-form')}`);
    ok('P7b) y lo que sí tenía el borrador roto queda precargado, no se pierde',
       d7.val('f-nombre') === 'Federico' && d7.val('f-dni') === '23456789'
       && d7.val('f-hip-prop') === '',
       `nombre=${d7.val('f-nombre')} · hip=${JSON.stringify(d7.val('f-hip-prop'))}`);

    // ── P8/P9 · las dos ramas anteriores del camino 2, intactas ─────────────
    const d8 = mkDom(); d8._radios.propietario.checked = true;
    const p8 = await mkPagina({ dom:d8, session:SES, borrador:BORR_PROP,
      tablas:{ usuarios:{ id:'u1' }, solicitudes_acceso:null } });
    ok('P8) con fila en usuarios → sigue redirigiendo a portal.html, sin mostrar la ficha',
       p8.loc.reemplazo === 'portal.html' && !d8.seccionVisible('sec-falta'),
       `replace=${p8.loc.reemplazo} · sec-falta=${d8.dsp('sec-falta')}`);

    const d9 = mkDom(); d9._radios.propietario.checked = true;
    const p9 = await mkPagina({ dom:d9, session:SES, borrador:BORR_PROP,
      tablas:{ usuarios:null, solicitudes_acceso:{ id:'s1' } } });
    ok('P9) con solicitud ya enviada → sigue mostrando "solicitud enviada", sin ficha ni redirect',
       d9.seccionVisible('sec-listo') && !d9.seccionVisible('sec-falta')
       && p9.loc.reemplazo === undefined,
       `sec-listo=${d9.dsp('sec-listo')} · replace=${p9.loc.reemplazo}`);

    // ── P10 · el alta sin sesión sigue yendo a "revisá tu correo" ───────────
    const d10 = mkDom(FORM('probe@sgh-probe.invalid')); d10._radios.propietario.checked = true;
    const p10 = await mkPagina({ dom:d10, session:null, borrador:null,
      respSignUp:{ data:{ user:{ id:'u-nuevo', identities:[{ id:'i1' }] }, session:null }, error:null } });
    await p10.enviar();
    ok('P10) alta nueva sin sesión → "revisá tu correo", y NO la ficha',
       d10.seccionVisible('sec-confirmar') && !d10.seccionVisible('sec-falta')
       && d10.txt('conf-email') === 'probe@sgh-probe.invalid',
       `sec-confirmar=${d10.dsp('sec-confirmar')}`
       + ` · conf-email=${d10.txt('conf-email')}`);
    ok('P10b) y el borrador queda guardado para cuando vuelva de confirmar',
       JSON.parse(p10.store.getItem('sgh_solicitud_borrador') || '{}').dni === '12345678',
       String(p10.store.getItem('sgh_solicitud_borrador')));

    // ── P11 · el texto de sec-confirmar anticipa el paso que falta ──────────
    const SEC_CONF = sinComentarios(bloqueHtml('sec-confirmar', '<!-- ===== EL CORREO YA TIENE CUENTA'));
    ok('P11) "revisá tu correo" avisa que la solicitud NO queda enviada y nombra el botón',
       /todav[ií]a no queda enviada/i.test(SEC_CONF)
       && /Enviar solicitud/.test(SEC_CONF)
       && !/volv[eé]s ac[aá] para terminar la solicitud/i.test(SEC_CONF),
       SEC_CONF.replace(/\s+/g, ' ').slice(0, 320));

    // ── P12 · la ficha no se puede confundir con el formulario ─────────────
    const SEC_FALTA = bloqueHtml('sec-falta', '<!-- ===== SOLICITUD ENVIADA');
    ok('P12) la ficha no tiene un solo <input>: no se lee como formulario',
       !/<input/i.test(SEC_FALTA), (SEC_FALTA.match(/<input[^>]*>/gi) || []).join(' | '));
    ok('P12b) tiene un único botón de envío, y el de corregir es un link secundario',
       (SEC_FALTA.match(/<button/g) || []).length === 2
       && /<button class="btn" id="btn-falta-enviar"/.test(SEC_FALTA)
       && /<button class="lnk-sec" id="btn-falta-corregir"/.test(SEC_FALTA),
       (SEC_FALTA.match(/<button[^>]*>/g) || []).join(' | '));
    ok('P12c) y su título es distinto del de sec-reintento — son dos pantallas, no una',
       (SEC_FALTA.match(/<h2 class="card-title"[^>]*>([^<]+)</) || [])[1]
       !== (bloqueHtml('sec-reintento', '</div>\n  </div>').match(/<h2 class="card-title"[^>]*>([^<]+)</) || [])[1],
       `falta=${(SEC_FALTA.match(/<h2 class="card-title"[^>]*>([^<]+)</) || [])[1]}`);

    // ── P13 · defensa: borrador roto no manda una solicitud coja ────────────
    const d13 = mkDom(); d13._radios.propietario.checked = true;
    const p13 = await mkPagina({ dom:d13, session:SES, tablas:SIN_NADA, borrador:BORR_PROP });
    p13.store.setItem('sgh_solicitud_borrador', JSON.stringify(BORR_INCOMPLETO));  // otra pestaña
    await p13.faltaEnviar();
    ok('P13) si el borrador se rompió entremedio, el botón NO manda la RPC y abre el formulario',
       p13.rpc.length === 0 && d13.seccionVisible('sec-form') && !d13.seccionVisible('sec-falta')
       && d13._n['err'].classList.contains('show'),
       `rpc=${JSON.stringify(p13.rpc)} · sec-form=${d13.dsp('sec-form')}`);

  } catch (err) {
    ok('💥 el probe corrió entero', false, `${err.message}\n${err.stack}`);
  }

  console.log('\n── Probe · pantalla "Ya casi" (paso final) en solicitar-acceso.html ──');
  console.log(`   solicitar=${SOLICITAR_PATH}`);
  results.forEach(r => console.log(` ${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`));
  const malos = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - malos}/${results.length} OK`);
  process.exit(malos ? 1 : 0);
})();
