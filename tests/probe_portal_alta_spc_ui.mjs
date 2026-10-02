/**
 * Probe — pantallas del alta de SPC desde el portal (portal.html, spcs.html, inscripciones.html).
 * SIN Supabase y SIN red: monta el HTML REAL en jsdom con sus scripts locales (el CDN de supabase-js
 * se corta, initAuth falla sola) y le inyecta a la página un `sb` STUB que registra cada llamada y
 * devuelve lo que el caso necesita. Se llaman las funciones reales y se clickean los botones reales.
 *
 *   node tests/probe_portal_alta_spc_ui.mjs              # contra el working tree
 *   node tests/probe_portal_alta_spc_ui.mjs --mutantes   # + mutantes de pantalla (cada uno TIENE que morir)
 *
 * portal.html
 *   U1  búsqueda sin resultados en el padrón → botón "Buscar «X» en el Stud Book" (el texto viejo "todavía no
 *       está cargado… avisale" ya no es el único camino)
 *   U2  candidatos del Stud Book: nombre hostil escapado; el que ya está en el padrón (mismo studbook_id) ofrece
 *       "Ya está en el padrón — anotarlo" y NO trae
 *   U3  "Es este — anotarlo" SIN caballeriza → no llama a traer (no se crea una ficha que no se puede anotar)
 *   U4  con la monta completa → invoke('studbook-buscar', {accion:'traer', sb_id, nombre, carrera_id}) con SÓLO esas
 *       4 claves (el navegador no manda la ficha), recarga el padrón y llama rpc_inscribir con el spc_id devuelto
 *   U5  traer rechazado (422) → el mensaje de la RPC en pantalla y NO se llama rpc_inscribir
 *   U6  Stud Book caído (502) → "El Stud Book no responde ahora. Pedile a … que lo cargue."
 * spcs.html
 *   V1  chip "Por revisar" con el conteo, oculto con 0; filtro "Por revisar (portal)"; badge en la fila
 *   V2  ✏️ de una ficha con apóstrofo (DEVIL'S KING) abre el modal (antes el atributo se rompía: 12 fichas al 01/10)
 *   V3  caja de revisión: quién (escapado), motivos, botón "Marcar revisado"
 *   V4  "Marcar revisado" → update({revision_pendiente:false}) y nada más; 0 filas = error y el modal NO se cierra;
 *       con 1 fila cierra y recarga
 * inscripciones.html
 *   W1  el SELECT pide spcs(nombre,revision_pendiente)
 *   W2  "Cargada por" muestra "ficha nueva, por revisar" con revision_pendiente y no sin ella
 */
import { readFileSync } from 'node:fs';
import jsdom from 'jsdom';
const { JSDOM, VirtualConsole, requestInterceptor } = jsdom;

const ROOT = new URL('..', import.meta.url).pathname;
// El CDN de supabase-js se corta a propósito: initAuth() de cada página rechaza con
// "supabase is not defined". Ése, y sólo ése, se ignora; cualquier otro rechazo tumba el probe.
process.on('unhandledRejection', (e) => {
  if (/supabase is not defined/.test(String(e?.message ?? e))) return;
  console.error('unhandledRejection:', e); process.exit(3);
});
const MUTANTES = process.argv.includes('--mutantes');
const T = 'b1000000-0000-0000-0000-000000000001', R = 'b0000000-0000-0000-0000-000000000001';

// ── stub de supabase-js: registra llamadas; cada caso define las respuestas ───────────────────
function stub(resp) {
  const log = [];
  const qb = (tabla) => {
    const q = { tabla, ops: [] };
    const p = new Proxy({}, {
      get(_, k) {
        if (k === 'then') {
          log.push({ from: tabla, ops: q.ops });
          const r = (resp.from?.[tabla]?.(q.ops)) ?? { data: [], error: null };
          return (ok, ko) => Promise.resolve(r).then(ok, ko);
        }
        return (...a) => { q.ops.push([k, a]); return p; };
      },
    });
    return p;
  };
  return {
    log,
    from: qb,
    rpc: async (fn, args) => { log.push({ rpc: fn, args }); return (resp.rpc?.[fn]?.(args)) ?? { data: [], error: null }; },
    functions: { invoke: async (fn, opts) => { log.push({ invoke: fn, body: opts?.body }); return resp.invoke(opts?.body); } },
    auth: { getSession: async () => ({ data: { session: null } }) },
  };
}
// Error de functions.invoke como lo deja supabase-js (status + body en error.context)
const fnError = (status, body) => ({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { status, json: async () => body } } });

// ── montaje ──────────────────────────────────────────────────────────────────────────────────
const interceptor = (over) => requestInterceptor((request) => {
  const u = new URL(request.url);
  let cuerpo = '';
  if (u.hostname === 'sigh.com.ar') { try { cuerpo = readFileSync(ROOT + u.pathname.replace(/^\//, ''), 'utf8'); } catch { cuerpo = ''; } }
  return new Response(cuerpo, { headers: { 'Content-Type': 'application/javascript' } });
});
async function montar(pagina, html) {
  const errores = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errores.push(String(e.message || e)));
  const dom = new JSDOM(html, { url: `https://sigh.com.ar/${pagina}`, runScripts: 'dangerously',
    resources: { interceptors: [interceptor()] }, virtualConsole: vc, pretendToBeVisual: true });
  await new Promise((r) => dom.window.addEventListener('load', r));
  dom.window.confirm = () => true;
  return { w: dom.window, d: dom.window.document, errores };
}
const tick = () => new Promise((r) => setTimeout(r, 30));

// ── casos ────────────────────────────────────────────────────────────────────────────────────
async function correr(fuentes) {
  const res = [];
  const ok = (t, c, n = '') => { res.push({ t, s: c ? '✅' : '❌', n }); return c; };
  try { await casos(fuentes, ok); } catch (e) { ok('X  excepción en los casos (cuenta como fallo)', false, String(e?.stack || e).split('\n').slice(0, 2).join(' ')); }
  return res;
}
async function casos(fuentes, ok) {

  // ═════ portal.html ═════
  {
    const { w, d } = await montar('portal.html', fuentes['portal.html']);
    const HOSTIL = '<img id="xss-sb" src=x onerror="window.__pwn=1">WAVE';
    let modo = 'ok';
    const s = stub({
      invoke: (body) => {
        if (body.accion !== 'traer') {
          if (modo === 'caido') return fnError(502, { ok: false, error: 'studbook_no_disponible', detalle: 'studbook HTTP 503' });
          return { data: { ok: true, exactos: [
            { sb_id: '397805', nombre: HOSTIL, fecha_nacimiento: '2017-08-08', sexo: 'macho', color: 'Zaino', padrillo_nombre: 'Remote (GB)', madre_nombre: 'Holiday Wave', alertas: [] },
            { sb_id: '111', nombre: 'YA CARGADO', fecha_nacimiento: '2020-08-08', sexo: 'hembra', padrillo_nombre: 'P', madre_nombre: 'M', alertas: [] },
          ], parciales: [] }, error: null };
        }
        if (modo === 'rechazo') return fnError(422, { ok: false, error: 'rechazado', detalle: 'Ya trajiste 3 caballos nuevos hoy. Si necesitás más, pedíselos a la secretaría.' });
        return { data: { ok: true, spc_id: 'spc-nuevo', ya_existia: false, revision_motivos: null, nombre: 'WAVE RIMOUT' }, error: null };
      },
      rpc: {
        rpc_padron_spcs: () => ({ data: [{ id: 'spc-111', nombre: 'YA CARGADO', studbook_id: '111', sexo: 'hembra', estado: 'activo', habilitado: true }], error: null }),
        rpc_inscribir: () => ({ data: 'insc-1', error: null }),
      },
    });
    w.__sb = s;
    w.eval(`sb = window.__sb;
      carreraSeleccionada = { id: '${T}', reunionId: '${R}' };
      turnosAbiertos = [{ id: '${R}', carreras: [{ id: '${T}', numero_turno: 1 }] }];
      misCaballos = []; misInscripciones = []; padronSpcs = null;
      loadLlamado = async () => {}; avisoJockeyRepetidoPortal = () => {};`);
    await w.eval('cargarPadronSpcs()');
    // selects de monta vacíos (como al abrir el modal sin elegir)
    for (const id of ['minsc-caballeriza', 'minsc-entrenador', 'minsc-jockey', 'minsc-suplente']) {
      d.getElementById(id).innerHTML = '<option value="">—</option><option value="x-' + id + '">X</option>';
      d.getElementById(id).value = '';
    }
    d.getElementById('minsc-buscar').value = 'WAVE';
    w.eval(`onBuscarSpc('WAVE')`);
    const btnSB = [...d.querySelectorAll('#minsc-lista button')].find((b) => /Stud Book/.test(b.textContent));
    ok('U1 sin resultados en el padrón → botón "Buscar «WAVE» en el Stud Book"', !!btnSB && /Buscar «WAVE» en el Stud Book/.test(btnSB.textContent), d.getElementById('minsc-lista').textContent.trim().slice(0, 200));

    btnSB?.click(); await tick();
    const filas = [...d.querySelectorAll('#minsc-sb button')].map((b) => b.textContent.trim());
    ok('U2 candidatos: nombre hostil escapado, sin elementos inyectados', !d.getElementById('xss-sb') && !w.__pwn && d.getElementById('minsc-sb').textContent.includes('<img id="xss-sb"'), '');
    ok('U2 el que ya está en el padrón (mismo nº SB) → "Ya está en el padrón — anotarlo"; el otro → "Es este — anotarlo"',
      filas.length === 2 && filas[0] === 'Es este — anotarlo' && filas[1] === 'Ya está en el padrón — anotarlo', JSON.stringify(filas));

    const nAntes = s.log.length;
    [...d.querySelectorAll('#minsc-sb button')][0]?.click(); await tick();
    const traidos = s.log.slice(nAntes).filter((x) => x.invoke && x.body?.accion === 'traer');
    ok('U3 sin caballeriza → no llama a traer y pide la caballeriza', traidos.length === 0 && /elegir la caballeriza/.test(d.getElementById('validation-msg').textContent), d.getElementById('validation-msg').textContent);

    d.getElementById('minsc-caballeriza').value = 'x-minsc-caballeriza';
    d.getElementById('minsc-entrenador').value = 'x-minsc-entrenador';
    const n2 = s.log.length;
    [...d.querySelectorAll('#minsc-sb button')][0]?.click(); await tick(); await tick();
    const tras = s.log.slice(n2);
    const inv = tras.find((x) => x.invoke && x.body?.accion === 'traer');
    const insc = tras.find((x) => x.rpc === 'rpc_inscribir');
    ok('U4 traer con SÓLO {accion, sb_id, nombre, carrera_id}', !!inv && JSON.stringify(Object.keys(inv.body).sort()) === JSON.stringify(['accion', 'carrera_id', 'nombre', 'sb_id'])
      && inv.body.sb_id === '397805' && inv.body.carrera_id === T, JSON.stringify(inv?.body));
    ok('U4 recarga el padrón y anota con el spc_id devuelto (rpc_inscribir)', tras.some((x) => x.rpc === 'rpc_padron_spcs')
      && insc?.args?.p_spc_id === 'spc-nuevo' && insc?.args?.p_carrera_id === T && insc?.args?.p_caballeriza_id === 'x-minsc-caballeriza', JSON.stringify(insc?.args));

    modo = 'rechazo';
    d.getElementById('minsc-buscar').value = 'WAVE'; w.eval(`onBuscarSpc('WAVE')`);
    [...d.querySelectorAll('#minsc-lista button')].find((b) => /Stud Book/.test(b.textContent))?.click(); await tick();
    const n3 = s.log.length;
    [...d.querySelectorAll('#minsc-sb button')][0]?.click(); await tick();
    ok('U5 traer rechazado → mensaje de la RPC y NO se anota', /Ya trajiste 3 caballos nuevos hoy/.test(d.getElementById('validation-msg').textContent)
      && !s.log.slice(n3).some((x) => x.rpc === 'rpc_inscribir'), d.getElementById('validation-msg').textContent);

    modo = 'caido';
    w.eval(`onBuscarSpc('WAVE')`);
    [...d.querySelectorAll('#minsc-lista button')].find((b) => /Stud Book/.test(b.textContent))?.click(); await tick();
    ok('U6 Stud Book caído → "El Stud Book no responde ahora. Pedile a la secretaría del hipódromo que lo cargue."',
      /El Stud Book no responde ahora\. Pedile a la secretaría del hipódromo que lo cargue\./.test(d.getElementById('minsc-sb').textContent), d.getElementById('minsc-sb').textContent.trim());
  }

  // ═════ spcs.html ═════
  {
    const { w, d } = await montar('spcs.html', fuentes['spcs.html']);
    const U = 'e0000000-0000-0000-0000-000000000001';
    const filasSpcs = [
      { id: 's-pend', nombre: 'WAVE RIMOUT', sexo: 'macho', estado: 'activo', fecha_nacimiento: '2017-08-08', alta_origen: 'portal', alta_por: U, revision_pendiente: true,
        revision_motivos: ['edad > 12 (15 años según el Stud Book)'], created_at: '2026-10-01T15:00:00Z' },
      { id: 's-devil', nombre: "DEVIL'S KING", sexo: 'macho', estado: 'activo', fecha_nacimiento: '2020-08-08', notas: "abuelo materno: Harlan's Holiday", alta_origen: 'secretaria', revision_pendiente: false },
    ];
    let filasUpdate = [];
    const s = stub({
      from: {
        spcs: (ops) => ops.some(([k]) => k === 'update') ? { data: filasUpdate, error: null } : { data: filasSpcs, error: null },
        usuarios: () => ({ data: [{ id: U, nombre_completo: '<b id="xss-u">Pepe</b>' }], error: null }),
      },
      invoke: () => ({ data: null, error: null }),
    });
    w.__sb = s;
    w.eval(`sb = window.__sb; CLUB_ID = 'club'; load = load;`);
    await w.eval('load()'); await tick();
    ok('V1 chip "Por revisar" = 1 y visible', d.getElementById('chip-revision').hidden === false && d.getElementById('cnt-revision').textContent === '1', `${d.getElementById('chip-revision').hidden} ${d.getElementById('cnt-revision').textContent}`);
    d.getElementById('chip-revision').click();
    const nombres = [...d.querySelectorAll('#list-container .spc-name')].map((x) => x.textContent);
    ok('V1 clic en el chip filtra "Por revisar (portal)" → sólo la pendiente, con badge', JSON.stringify(nombres) === JSON.stringify(['WAVE RIMOUT'])
      && /Portal — por revisar/.test(d.getElementById('list-container').textContent), JSON.stringify(nombres));
    d.getElementById('f-estado').value = ''; w.eval('filterRender()');
    const botDevil = [...d.querySelectorAll('#list-container tr')].find((tr) => tr.textContent.includes("DEVIL'S KING"))?.querySelector('.btn-edit');
    botDevil?.click();
    ok('V2 ✏️ de DEVIL\'S KING (apóstrofo) abre el modal con esa ficha', d.getElementById('modal').classList.contains('open') && d.getElementById('f-nombre').value === "DEVIL'S KING", d.getElementById('f-nombre').value);
    ok('V2 ficha de secretaría → sin caja de revisión', d.getElementById('revision-box').hidden === true);
    w.eval('closeModal()');
    [...d.querySelectorAll('#list-container tr')].find((tr) => tr.textContent.includes('WAVE RIMOUT'))?.querySelector('.btn-edit')?.click();
    const box = d.getElementById('revision-box');
    ok('V3 caja de revisión: quién (escapado), motivo, botón', box.hidden === false && !d.getElementById('xss-u') && box.textContent.includes('<b id="xss-u">Pepe</b>')
      && box.textContent.includes('edad > 12 (15 años según el Stud Book)') && !!d.getElementById('btn-revisado'), box.textContent.trim().slice(0, 300));

    const n0 = s.log.length;
    d.getElementById('btn-revisado')?.click(); await tick();
    const up = s.log.slice(n0).find((x) => x.from === 'spcs' && x.ops.some(([k]) => k === 'update'));
    const payload = up?.ops.find(([k]) => k === 'update')?.[1]?.[0];
    ok('V4 Marcar revisado → update({revision_pendiente:false}) y nada más, por id', JSON.stringify(payload) === '{"revision_pendiente":false}'
      && up.ops.some(([k, a]) => k === 'eq' && a[0] === 'id' && a[1] === 's-pend'), JSON.stringify(up?.ops));
    ok('V4 0 filas → error y el modal sigue abierto', d.getElementById('modal').classList.contains('open') && d.getElementById('btn-revisado')?.disabled === false);
    filasUpdate = [{ id: 's-pend' }];
    const n1 = s.log.length;
    d.getElementById('btn-revisado')?.click(); await tick(); await tick();
    ok('V4 1 fila → cierra el modal y recarga', !d.getElementById('modal').classList.contains('open') && s.log.slice(n1).filter((x) => x.from === 'spcs').length >= 2, '');
  }

  // ═════ inscripciones.html ═════
  {
    const src = fuentes['inscripciones.html'];
    ok('W1 el SELECT de inscripciones pide spcs(nombre,revision_pendiente)', src.includes(".select('*, cargador:usuarios!inscripciones_inscripto_por_fkey(nombre_completo), spcs(nombre,revision_pendiente)')"));
    const ini = src.indexOf('    const fichaNueva = ');
    const fin = src.indexOf('    const gateraCell');
    const tramo = ini > 0 && fin > ini ? src.slice(ini, fin) : '';
    const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const celda = (i) => new Function('i', 'escapeHtml', tramo + '\nreturn cargadaCell;')(i, esc);
    let c1 = '', c2 = '', c3 = '';
    try {
      c1 = celda({ canal: 'portal', cargador: { nombre_completo: 'Portal Uno' }, spcs: { nombre: 'X', revision_pendiente: true } });
      c2 = celda({ canal: 'portal', cargador: { nombre_completo: 'Portal Uno' }, spcs: { nombre: 'X', revision_pendiente: false } });
      c3 = celda({ canal: 'manual', spcs: { nombre: 'X', revision_pendiente: true } });
    } catch (e) { c1 = 'ERROR ' + e.message; }
    ok('W2 "Cargada por": portal + pendiente → "ficha nueva, por revisar"; sin pendiente → no; secretaría + pendiente → sí',
      /ficha nueva, por revisar/.test(c1) && !/ficha nueva/.test(c2) && /Secretaría/.test(c3) && /ficha nueva, por revisar/.test(c3), JSON.stringify([c1, c2, c3]).slice(0, 400));
  }
}

const BASE = Object.fromEntries(['portal.html', 'spcs.html', 'inscripciones.html'].map((f) => [f, readFileSync(ROOT + f, 'utf8')]));
const base = await correr(BASE);
for (const x of base) console.log(`${x.s} ${x.t}${x.s === '❌' && x.n ? '  → ' + x.n : ''}`);
const fails = base.filter((x) => x.s === '❌').length;
console.log(`\n${base.length - fails}/${base.length} asserts OK`);

const MUT = [
  ['MU1 portal: traer sin validar la monta antes', 'portal.html', `  // La monta se valida ANTES de traer: si falta la caballeriza no se crea nada.\n  if (!leerMontaAnotar()) return;\n`, ''],
  ['MU2 portal: el navegador manda la ficha entera', 'portal.html', `body: { accion: 'traer', sb_id: String(c.sb_id), nombre: c.nombre, carrera_id: carreraSeleccionada.id },`, `body: { accion: 'traer', sb_id: String(c.sb_id), nombre: c.nombre, carrera_id: carreraSeleccionada.id, ficha: c },`],
  ['MU3 portal: candidatos sin escapar', 'portal.html', `<div style="font-family:'Playfair Display',serif;color:var(--accent);font-size:15px;">\${esc(c.nombre)}</div>\n          <div class="carrera-chips" style="margin-top:4px;">\n            <span class="chip">\${esc(sexo)}</span>`, `<div style="font-family:'Playfair Display',serif;color:var(--accent);font-size:15px;">\${c.nombre}</div>\n          <div class="carrera-chips" style="margin-top:4px;">\n            <span class="chip">\${esc(sexo)}</span>`],
  ['MU4 portal: sin botón del Stud Book en lista vacía', 'portal.html', `           <div style="margin:8px 0;">\${botonStudBookPortal()}</div>\n`, ''],
  ['MU5 spcs: ✏️ vuelve a JSON.stringify en el atributo', 'spcs.html', `onclick="openModalId('\${r.id}')"`, `onclick='openModal(\${JSON.stringify(r)})'`],
  ['MU6 spcs: Marcar revisado sin chequeo de 0 filas', 'spcs.html', `  if (error || !data?.length) {`, `  if (error) {`],
  ['MU7 spcs: chip sin conteo', 'spcs.html', `  document.getElementById('chip-revision').hidden = nRev === 0;`, ``],
  ['MU8 inscripciones: sin la línea de ficha nueva', 'inscripciones.html', `\${escapeHtml(i.cargador?.nombre_completo || '—')}</span>\${fichaNueva}</div>`, `\${escapeHtml(i.cargador?.nombre_completo || '—')}</span></div>`],
];
let vivos = 0;
if (MUTANTES) {
  console.log('\n── mutantes ──');
  for (const [nombre, arch, de, a] of MUT) {
    if (BASE[arch].split(de).length !== 2) { console.log(`⚠️  ${nombre}: ancla no única/ausente — mutante roto`); vivos++; continue; }
    const r = await correr({ ...BASE, [arch]: BASE[arch].replace(de, a) });
    const muertos = r.filter((x) => x.s === '❌').map((x) => x.t.split(' ')[0]);
    if (!muertos.length) vivos++;
    console.log(`${muertos.length ? '✅ muere' : '❌ VIVE '} ${nombre}${muertos.length ? '  ← ' + [...new Set(muertos)].join(', ') : ''}`);
  }
  console.log(`\nmutantes: ${MUT.length - vivos}/${MUT.length} muertos`);
}
process.exit(fails || vivos ? 1 : 0);
