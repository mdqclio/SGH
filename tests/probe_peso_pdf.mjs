/**
 * Probe peso en PDF impreso — peso a la derecha del renglón (estilo Palermo).
 *
 * Valida el fix de renderBloqueCarrera (listaHtml) ANTES de aplicarlo al archivo:
 * extrae el cuerpo REAL de renderBloqueCarrera de ratificacion.html y le aplica EN MEMORIA
 * el MISMO diff propuesto (inyecta pesoVal/pesoHtml + append del span al renglón). Corre ese
 * render con datos REALES sembrados en la reunión DESCARTABLE 9998 (seed + teardown misma
 * corrida, NO toca la 6 ni la 9999). Sin browser (no soportado).
 *
 * Casos (1 carrera 'programada', no anulada):
 *   A ratificado peso_declarado=57.00, final=null      → muestra "57"
 *   B ratificado peso_declarado=56.5,  final=55.00     → muestra "55" (peso_final tiene prioridad)
 *   C ratificado ambos null                            → SIN span de peso
 *   D forfait    peso_declarado=54.00                  → en sección FORFAITS, SIN peso
 *
 * Asserts (DOM headless): el span .pi-peso aparece DESPUÉS de .pi-spc-name en el mismo renglón,
 * con el valor correcto; C sin peso; forfaits sin peso.
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
const CLUB_ID      = '0649e9c5-9e87-4aad-842f-101458e6b33c';

const REUNION   = 'a0000000-0000-0000-0000-000000009998';
const CARRERA   = 'c0000000-0000-0000-0000-0000000099b1';
const HIPODROMO = 'c33ade84-98a4-4072-b3f1-a7d980e11849';
const CATEGORIA = 'ce76d686-c07a-434c-a3b0-74be3bf0c906';
const SPCS = [
  '00672983-e5e1-471f-8d54-59f924dce9a5',
  '019d9b9f-7b81-490e-b219-aff383fae166',
  '028ed453-bafe-491b-afe1-8aa93e56f675',
  '045409b7-bbd1-4b59-8335-c268d733b448',
];

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const ok = (t, c, n='') => results.push({ t, s: c ? '✅' : '❌', n });

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

// nombre del spc → para asserts por renglón
const nameOf = {};

(async () => {
  let phase = 'init';
  try {
    // ════ SEED 9998 ═════════════════════════════════════════════════════════
    phase = 'seed';
    await sb.from('inscripciones').delete().eq('carrera_id', CARRERA);
    await sb.from('carreras').delete().eq('reunion_id', REUNION);
    await sb.from('reuniones').delete().eq('id', REUNION);

    let e = (await sb.from('reuniones').insert({
      id: REUNION, club_id: CLUB_ID, hipodromo_id: HIPODROMO, numero: 9998,
      fecha: '2099-01-02', estado: 'borrador' })).error;
    if (e) throw new Error('seed reunión: ' + e.message);
    e = (await sb.from('carreras').insert({
      id: CARRERA, reunion_id: REUNION, numero_turno: 1, categoria_id: CATEGORIA,
      distancia_metros: 1000, estado: 'programada' })).error;
    if (e) throw new Error('seed carrera: ' + e.message);
    e = (await sb.from('inscripciones').insert([
      { carrera_id: CARRERA, spc_id: SPCS[0], estado: 'ratificado', peso_declarado: 57.00, peso_final: null, certificado_correr: true },
      { carrera_id: CARRERA, spc_id: SPCS[1], estado: 'ratificado', peso_declarado: 56.5,  peso_final: 55.00, certificado_correr: true },
      { carrera_id: CARRERA, spc_id: SPCS[2], estado: 'ratificado', peso_declarado: null,  peso_final: null,  certificado_correr: true },
      { carrera_id: CARRERA, spc_id: SPCS[3], estado: 'forfait',    peso_declarado: 54.00, peso_final: null,  certificado_correr: true },
    ])).error;
    if (e) throw new Error('seed insc: ' + e.message);
    console.log('[seed] 9998 carrera programada: A=57 B(final)=55 C=sin-peso D=forfait');

    // ════ LEER como la página (inscsByCarrera con spcs join) ════════════════
    phase = 'read';
    const { data: inscs, error: er } = await sb.from('inscripciones')
      .select('estado, certificado_correr, peso_declarado, peso_final, spc_id, spcs(nombre, sexo)')
      .eq('carrera_id', CARRERA);
    if (er) throw new Error('read: ' + er.message);
    inscs.forEach(i => { nameOf[i.spc_id] = (i.spcs?.nombre || '').toUpperCase(); });
    const ratificados = inscs.filter(i => i.estado === 'ratificado');
    const forfaits    = inscs.filter(i => i.estado === 'forfait');

    // ════ EXTRAER renderBloqueCarrera REAL + aplicar el diff EN MEMORIA ══════
    phase = 'patch';
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'ratificacion.html'), 'utf8');
    let body = extractFnBody(html, 'function renderBloqueCarrera(');

    // diff parte 1: insertar pesoVal/pesoHtml tras la línea `const prefix = ...`
    const anchor = "const prefix = isAnulada ? '• ' : '';";
    if (!body.includes(anchor)) throw new Error('no encontré el anchor del prefix — el fix cambió');
    body = body.replace(anchor, anchor +
      "\n      const pesoVal = i.peso_final || i.peso_declarado;" +
      "\n      const pesoHtml = pesoVal ? `<span class=\"pi-peso\">${parseFloat(pesoVal)}</span>` : '';");

    // diff parte 2: append ${pesoHtml} antes del cierre </div> del renglón
    const rowEnd = "<span class=\"pi-nocert\">●</span>' : ''}</div>`;";
    if (!body.includes(rowEnd)) throw new Error('no encontré el cierre del renglón — el fix cambió');
    body = body.replace(rowEnd, "<span class=\"pi-nocert\">●</span>' : ''}${pesoHtml}</div>`;");

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const calcPremiosConPiso = () => ({ bolsaEfectiva: 0 });
    const formatBolsa = () => '';
    const buildCondAbr = () => '';
    const render = new AsyncFunction(
      'car', 'items', 'isAnulada', 'forfaits',
      'calcPremiosConPiso', 'formatBolsa', 'buildCondAbr', body);

    const car = { id: CARRERA, estado: 'programada', numero_turno: 1, numero_carrera_programa: null,
      condicion_sexo: null, bolsa_total: 0, distribucion_premios: null, tipo_pista: null,
      hora_estimada: null, categorias_carrera: null };
    const out = await render(car, ratificados, false, forfaits,
      calcPremiosConPiso, formatBolsa, buildCondAbr);

    // ════ ASSERTS ═══════════════════════════════════════════════════════════
    phase = 'assert';
    const nA = nameOf[SPCS[0]], nB = nameOf[SPCS[1]], nC = nameOf[SPCS[2]], nD = nameOf[SPCS[3]];

    // helper: peso aparece DESPUÉS del nombre, dentro del mismo renglón
    const pesoTrasNombre = (nombre, valor) => {
      const iName = out.indexOf(nombre);
      const span = `<span class="pi-peso">${valor}</span>`;
      const iPeso = out.indexOf(span);
      return iName >= 0 && iPeso > iName;
    };

    ok('A muestra "57" a la derecha del nombre', pesoTrasNombre(nA, '57'), `name=${nA}`);
    ok('B muestra "55" (peso_final prioridad sobre declarado 56.5)',
       pesoTrasNombre(nB, '55') && !out.includes('>56.5<'), `name=${nB}`);
    ok('C (ambos null) → renglón SIN span de peso',
       out.includes(nC) && !new RegExp(nC + '[\\s\\S]*?pi-peso[\\s\\S]*?</div>').test(out.slice(out.indexOf(nC), out.indexOf(nC) + 120)),
       `name=${nC}`);
    // estructura: en cada renglón con peso, pi-spc-name viene antes de pi-peso
    const ordenOK = out.indexOf('class="pi-spc-name"') < out.indexOf('class="pi-peso"');
    ok('estructura: .pi-spc-name antes de .pi-peso (peso a la derecha)', ordenOK);
    // forfait sin peso
    ok('D forfait en sección FORFAITS sin peso',
       out.includes('FORFAITS') && out.includes(nD) && !out.includes('>54<'), `name=${nD}`);
    // conteo: exactamente 2 spans de peso (A y B; C y D no)
    const nPesos = (out.match(/class="pi-peso"/g) || []).length;
    ok('exactamente 2 spans de peso (A,B) — C y D sin peso', nPesos === 2, `n=${nPesos}`);

    console.log('\n[fragmento render]');
    console.log(out.replace(/></g, '>\n<').split('\n').filter(l => l.includes('pi-spc-name') || l.includes('pi-peso') || l.includes('forfait')).join('\n'));

  } catch (ex) {
    ok(`EXCEPCIÓN en fase '${phase}'`, false, ex.message);
    console.error(ex);
  } finally {
    // ════ TEARDOWN ══════════════════════════════════════════════════════════
    try {
      await sb.from('inscripciones').delete().eq('carrera_id', CARRERA);
      await sb.from('carreras').delete().eq('reunion_id', REUNION);
      await sb.from('reuniones').delete().eq('id', REUNION);
      const { data: gone } = await sb.from('reuniones').select('id').eq('id', REUNION);
      ok('R1 teardown 9998 (reunión borrada)', (gone?.length || 0) === 0);
    } catch (ex) {
      ok('TEARDOWN FALLÓ — BORRAR 9998 A MANO', false, ex.message);
      console.error('[teardown]', ex);
    }
    console.log('\n──────── RESULTADO ────────');
    for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  ('+r.n+')' : ''}`);
    const failed = results.filter(r => r.s === '❌').length;
    console.log(`\n${failed === 0 ? '✅ TODO OK' : '❌ ' + failed + ' fallo(s)'} — ${results.length} checks`);
    process.exit(failed === 0 ? 0 : 1);
  }
})();
