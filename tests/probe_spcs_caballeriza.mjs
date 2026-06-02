/**
 * Probe — spcs.html captura caballeriza_id (fix ISSUE-026, id duplicado).
 *
 * El bug: `f-sexo`/`f-caballeriza` existían 2 veces (toolbar + modal) → getElementById
 * agarraba el del toolbar y `caballeriza_id` se guardaba null. Fix: el select del modal pasó
 * a `*-form`. Este probe NO reimplementa: monta el HTML REAL en jsdom (que respeta la semántica
 * getElementById→primer match en orden de documento) y ejecuta el cuerpo REAL de saveRecord().
 *
 * Discriminador: se pone un valor DISTINTO en el filtro del toolbar (decoy). Pre-fix, saveRecord
 * leería el toolbar (decoy); post-fix lee el modal. Además: roundtrip real a la DB (insert →
 * read-back → delete) para confirmar que PERSISTE de verdad, no solo que el payload está bien.
 *
 * SEGURIDAD: service_role (igual que el resto de tests/). Inserta 1 SPC de prueba y lo borra.
 */
import { createClient } from '@supabase/supabase-js';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVubGhjdWFuZnJ0cGF0b2lwd3ZlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjcyNDQ5NywiZXhwIjoyMDkyMzAwNDk3fQ.drl2zQmZ3NMEksHSv14Jd_1p0HQWQg-_ACihQi3vQcE';

// Caballerizas reales y activas de Dolores (FK válida para spcs.caballeriza_id)
const CAB_MODAL = 'a643bac6-bae0-4fe8-a2cd-13f1c2c4fa8b'; // BAUTY MI  → lo que el usuario elige en el modal
const CAB_DECOY = '8e7ce45f-b493-4bb2-8226-9d5d79e697dc'; // El Capitan → decoy en el filtro del toolbar

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
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

// Stub de sb que captura el payload de spcs y deja pasar el resto (spc_propietarios).
function makeSbStub(capture) {
  const api = {
    _table: null,
    from(t) { return { ...api, _table: t }; },
    insert(p) { if (this._table === 'spcs') capture.payload = p; return this; },
    update(_p) { return this; },
    delete() { return this; },
    select() { return this; },
    eq() { return this; },
    single() { return Promise.resolve({ data: { id: '00000000-0000-0000-0000-000000000000' }, error: null }); },
    then(res, rej) { return Promise.resolve({ data: null, error: null }).then(res, rej); },
  };
  return api;
}

(async () => {
  let createdSpcId = null;
  try {
    const htmlPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'spcs.html');
    const html = readFileSync(htmlPath, 'utf8');
    // jsdom SIN ejecutar los scripts de la página (solo queremos el DOM real)
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // ── 1. Estructural: los ids del modal quedaron renombrados y SIN duplicar ──
    const modal = document.getElementById('modal');
    const toolbar = document.querySelector('.toolbar');
    const cabFormInModal = !!modal?.querySelector('#f-caballeriza-form');
    const sexFormInModal = !!modal?.querySelector('#f-sexo-form');
    const cabFilterInToolbar = !!toolbar?.querySelector('#f-caballeriza');
    const sexFilterInToolbar = !!toolbar?.querySelector('#f-sexo');
    ok('1a select caballeriza del modal renombrado a #f-caballeriza-form', cabFormInModal);
    ok('1b select sexo del modal renombrado a #f-sexo-form', sexFormInModal);
    ok('1c filtro #f-caballeriza sigue en el toolbar', cabFilterInToolbar);
    ok('1d filtro #f-sexo sigue en el toolbar', sexFilterInToolbar);
    ok('1e no quedan ids duplicados (f-caballeriza / f-sexo únicos)',
       document.querySelectorAll('#f-caballeriza').length === 1 &&
       document.querySelectorAll('#f-sexo').length === 1 &&
       document.querySelectorAll('#f-caballeriza-form').length === 1 &&
       document.querySelectorAll('#f-sexo-form').length === 1);

    // ── 2. Setup del DOM como tras populate + selección del usuario ──
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const addOptSel = (id, val) => {
      const el = document.getElementById(id);
      const o = document.createElement('option'); o.value = val; o.textContent = val;
      el.appendChild(o); el.value = val;
    };
    setVal('f-nombre', 'PROBE DERIV ' + CAB_MODAL.slice(0, 8));
    setVal('f-nacimiento', '2020-01-01'); // spcs.fecha_nacimiento es NOT NULL
    setVal('f-sexo-form', 'macho');
    addOptSel('f-estado-spc', 'activo');
    addOptSel('f-caballeriza-form', CAB_MODAL);   // lo que el usuario elige en el MODAL
    addOptSel('f-caballeriza', CAB_DECOY);        // DECOY en el filtro del TOOLBAR (≠ modal)

    // ── 3. Ejecutar el saveRecord() REAL (alta: editingId=null) con sb stub ──
    const capture = {};
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const body = extractFnBody(html, 'async function saveRecord()');
    const run = new AsyncFunction(
      'document', 'sb', 'toast', 'switchTab', 'closeModal', 'load', 'editingId', body);
    await run(document, makeSbStub(capture), () => {}, () => {}, () => {}, async () => {}, null);

    ok('2a saveRecord captura caballeriza_id NO-null', !!capture.payload?.caballeriza_id,
       `caballeriza_id=${capture.payload?.caballeriza_id}`);
    ok('2b lee el MODAL (=BAUTY MI), no el filtro del toolbar (decoy)',
       capture.payload?.caballeriza_id === CAB_MODAL && capture.payload?.caballeriza_id !== CAB_DECOY,
       `got=${capture.payload?.caballeriza_id} modal=${CAB_MODAL} decoy=${CAB_DECOY}`);

    // ── 4. Persistencia REAL: insert con el payload del código → read-back → delete ──
    const { data: ins, error: eIns } = await sb.from('spcs').insert(capture.payload).select('id,caballeriza_id,nombre').single();
    if (eIns) throw new Error(`insert real: ${eIns.message}`);
    createdSpcId = ins.id;
    ok('3a SPC insertado en DB con caballeriza_id persistido', ins.caballeriza_id === CAB_MODAL,
       `db.caballeriza_id=${ins.caballeriza_id}`);
    // confirmar con SELECT fresco (no confiar solo en el returning)
    const { data: reread } = await sb.from('spcs').select('caballeriza_id').eq('id', createdSpcId).single();
    ok('3b re-lectura desde DB confirma caballeriza_id no-null y correcto', reread?.caballeriza_id === CAB_MODAL,
       `reread=${reread?.caballeriza_id}`);

    // ── 5. Edición: el mismo path lee del modal (capture del update payload) ──
    const capEdit = {};
    const sbEdit = makeSbStub(capEdit);
    // en update() el payload va por update(), no insert(): capturamos ahí
    sbEdit.update = function (p) { if (this._table === 'spcs') capEdit.payload = p; return this; };
    const runEdit = new AsyncFunction(
      'document', 'sb', 'toast', 'switchTab', 'closeModal', 'load', 'editingId', body);
    await runEdit(document, sbEdit, () => {}, () => {}, () => {}, async () => {}, 'some-existing-id');
    ok('4a edición también lee caballeriza_id del modal', capEdit.payload?.caballeriza_id === CAB_MODAL,
       `edit.caballeriza_id=${capEdit.payload?.caballeriza_id}`);

  } catch (e) {
    ok(`EXCEPCIÓN: ${e.message}`, false);
    console.error(e);
  } finally {
    // cleanup: borrar el SPC de prueba
    try {
      if (createdSpcId) {
        await sb.from('spc_propietarios').delete().eq('spc_id', createdSpcId);
        await sb.from('spcs').delete().eq('id', createdSpcId);
        const { count } = await sb.from('spcs').select('id', { count: 'exact', head: true }).eq('id', createdSpcId);
        ok('R1 cleanup: SPC de prueba borrado', (count || 0) === 0, `quedan=${count}`);
      }
    } catch (e) {
      ok('RESTORE FALLÓ — borrar SPC manualmente', false, `${e.message} id=${createdSpcId}`);
    }
    console.log('\n──────── RESULTADO ────────');
    for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  (' + r.n + ')' : ''}`);
    const failed = results.filter(r => r.s === '❌').length;
    console.log(`\n${failed === 0 ? '✅ TODO OK' : '❌ ' + failed + ' fallo(s)'} — ${results.length} checks`);
    process.exit(failed === 0 ? 0 : 1);
  }
})();
