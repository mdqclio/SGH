/**
 * Probe PASO 5 — columna PADRE-MADRE en los programas.
 *
 * CORRE EL CÓDIGO REAL: extrae del working tree los snippets que arman `pedigree`/
 * `spcSub` (programa.html) y `padreMadre` (programa-oficial.html y -color.html) y los
 * ejecuta con `new Function` sobre filas `spcs` REALES leídas de la DB. No hay
 * reimplementación: si el texto del HTML cambia, cambia lo que corre el probe.
 * Sin browser (Playwright no soporta chromium en ubuntu26.04 — ver tests/README.md).
 *
 * Seed descartable en reunión 9998 + 4 SPCs de prueba que cubren las 4 combinaciones:
 *   PED_FULL  padre + madre      -> "PADRE - MADRE" / "PADRE — MADRE"
 *   PED_NONE  ninguno            -> vacío, sin "Por", sin separador
 *   PED_MADRE sólo madre         -> separador NO colgado a la izquierda
 *   PED_PADRE sólo padre         -> separador NO colgado a la derecha
 *
 * Verifica:
 *  - columna presente: `${padreMadre}` vive dentro de un <td> en los dos oficiales
 *  - SPC con pedigree -> "PADRE - MADRE" (programa) / "PADRE — MADRE" (oficiales)
 *  - SPC sin pedigree -> string vacío. Sin '?', sin '—' de placeholder, sin "Por" suelto
 *  - separador nunca colgado cuando falta un lado
 *  - layout intacto: con todos los campos cargados, `spcSub` da exactamente la misma
 *    forma "SEXO+EDAD | COLOR | Por P - M" que antes del cambio, y nunca aparece
 *    un segmento vacío (' |  | ')
 *
 * SEGURIDAD: escribe sólo filas de prueba (reunión 9998 + 4 spcs con prefijo del probe).
 * Teardown completo en el finally de la misma corrida.
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
const CARRERA   = 'c0000000-0000-0000-0000-0000000099e1';
const HIPODROMO = 'c33ade84-98a4-4072-b3f1-a7d980e11849';
const CATEGORIA = 'ce76d686-c07a-434c-a3b0-74be3bf0c906';

const SPC_FULL  = 'd0000000-0000-0000-0000-0000000099f1';
const SPC_NONE  = 'd0000000-0000-0000-0000-0000000099f2';
const SPC_MADRE = 'd0000000-0000-0000-0000-0000000099f3';
const SPC_PADRE = 'd0000000-0000-0000-0000-0000000099f4';
const SPC_IDS   = [SPC_FULL, SPC_NONE, SPC_MADRE, SPC_PADRE];

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

/** Extrae el snippet real entre un ancla de inicio y el fin de sentencia que la cierra. */
function extractSnippet(html, startAnchor, endAnchor, label) {
  const s = html.indexOf(startAnchor);
  if (s < 0) throw new Error(`[${label}] no encontré el ancla de inicio: ${startAnchor}`);
  const e = html.indexOf(endAnchor, s);
  if (e < 0) throw new Error(`[${label}] no encontré el ancla de fin: ${endAnchor}`);
  return html.slice(s, e + endAnchor.length);
}

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '..');

(async () => {
  let phase = 'init';
  try {
    // ════ SEED ══════════════════════════════════════════════════════════════
    phase = 'seed';
    await sb.from('inscripciones').delete().eq('carrera_id', CARRERA);
    await sb.from('carreras').delete().eq('reunion_id', REUNION);
    await sb.from('reuniones').delete().eq('id', REUNION);
    await sb.from('spcs').delete().in('id', SPC_IDS);

    let e = (await sb.from('spcs').insert([
      { id: SPC_FULL,  nombre: 'PROBE PEDIGREE FULL',  fecha_nacimiento: '2021-09-01', sexo: 'macho',
        color: 'Zaino', padrillo_nombre: 'Padre Probe', madre_nombre: 'Madre Probe', estado: 'activo' },
      { id: SPC_NONE,  nombre: 'PROBE PEDIGREE NONE',  fecha_nacimiento: '2021-09-01', sexo: 'macho',
        color: 'Zaino', padrillo_nombre: null, madre_nombre: null, estado: 'activo' },
      { id: SPC_MADRE, nombre: 'PROBE PEDIGREE MADRE', fecha_nacimiento: '2021-09-01', sexo: 'hembra',
        color: 'Zaino', padrillo_nombre: null, madre_nombre: 'Madre Sola', estado: 'activo' },
      { id: SPC_PADRE, nombre: 'PROBE PEDIGREE PADRE', fecha_nacimiento: '2021-09-01', sexo: 'macho',
        color: 'Zaino', padrillo_nombre: 'Padre Solo', madre_nombre: null, estado: 'activo' },
    ])).error;
    if (e) throw new Error('seed spcs: ' + e.message);

    e = (await sb.from('reuniones').insert({
      id: REUNION, club_id: CLUB_ID, hipodromo_id: HIPODROMO, numero: 9998,
      fecha: '2099-01-03', estado: 'borrador' })).error;
    if (e) throw new Error('seed reunión: ' + e.message);

    e = (await sb.from('carreras').insert({
      id: CARRERA, reunion_id: REUNION, numero_turno: 1, categoria_id: CATEGORIA,
      distancia_metros: 1000, estado: 'programada' })).error;
    if (e) throw new Error('seed carrera: ' + e.message);

    e = (await sb.from('inscripciones').insert(SPC_IDS.map((id, n) => ({
      carrera_id: CARRERA, spc_id: id, estado: 'ratificado',
      numero_partidor: n + 1, peso_declarado: 55 + n, certificado_correr: true,
    })))).error;
    if (e) throw new Error('seed insc: ' + e.message);
    console.log('[seed] 9998: 1 carrera + 4 SPCs (full / none / sólo madre / sólo padre)');

    // ════ LEER LAS FILAS REALES DE LA DB ════════════════════════════════════
    phase = 'read';
    const { data: spcRows, error: eRead } = await sb.from('spcs')
      .select('id,nombre,sexo,color,fecha_nacimiento,padrillo_nombre,madre_nombre')
      .in('id', SPC_IDS);
    if (eRead) throw new Error('read spcs: ' + eRead.message);
    const byId = Object.fromEntries(spcRows.map(r => [r.id, r]));
    ok('SEED  4 SPCs de prueba leídos de la DB', spcRows.length === 4, `leídos ${spcRows.length}`);

    // ════ CÓDIGO REAL — programa.html ═══════════════════════════════════════
    phase = 'programa.html';
    const htmlProg = readFileSync(join(root, 'programa.html'), 'utf8');
    // calcEdad real de programa.html (no stub): entra en la misma línea que se asserta.
    // Delega en edadSPCTexto() de edad-spc.js y lee currentReunion, asi que se inyectan
    // el helper real y una reunion de referencia en vez de stubbearlos.
    const edadSpcJs = readFileSync(join(root, 'edad-spc.js'), 'utf8')
      .replace("typeof window !== 'undefined' ? window : globalThis", 'globalThis');
    const calcEdad = new Function('fecha', `
      ${edadSpcJs}
      const currentReunion = { fecha: '2026-08-16' };
      ${extractFnBody(htmlProg, 'function calcEdad(fecha)')}
    `);
    const snipProg = extractSnippet(
      htmlProg, 'const pedigree = spc ?', ".filter(Boolean).join(' | ') : '';", 'programa.html');
    const runProg = new Function('spc', 'calcEdad', snipProg + '\n return { pedigree, spcSub };');

    const pFull  = runProg(byId[SPC_FULL],  calcEdad);
    const pNone  = runProg(byId[SPC_NONE],  calcEdad);
    const pMadre = runProg(byId[SPC_MADRE], calcEdad);
    const pPadre = runProg(byId[SPC_PADRE], calcEdad);

    ok('P1 programa: con pedigree → "PADRE - MADRE"',
       pFull.pedigree === 'Padre Probe - Madre Probe', pFull.pedigree);
    ok('P2 programa: sin pedigree → vacío (sin "?", sin "—")',
       pNone.pedigree === '' && !/[?—]/.test(pNone.spcSub), JSON.stringify(pNone));
    ok('P3 programa: sin pedigree → no imprime "Por" suelto',
       !pNone.spcSub.includes('Por'), pNone.spcSub);
    ok('P4 programa: sólo madre → separador no colgado a la izquierda',
       pMadre.pedigree === 'Madre Sola' && pMadre.spcSub.includes('Por Madre Sola'), pMadre.pedigree);
    ok('P5 programa: sólo padre → separador no colgado a la derecha',
       pPadre.pedigree === 'Padre Solo' && !pPadre.pedigree.includes(' - '), pPadre.pedigree);
    const edadFull = calcEdad(byId[SPC_FULL].fecha_nacimiento);
    ok('P6 programa: layout intacto con todos los campos',
       pFull.spcSub === `macho${edadFull} | Zaino | Por Padre Probe - Madre Probe`, pFull.spcSub);
    ok('P7 programa: ningún segmento " | " vacío en los 4 casos',
       [pFull, pNone, pMadre, pPadre].every(p => !p.spcSub.includes(' |  |') && !/\|\s*$/.test(p.spcSub)),
       [pFull, pNone, pMadre, pPadre].map(p => p.spcSub).join(' /// '));

    // ════ CÓDIGO REAL — programa-oficial.html y -color.html ═════════════════
    for (const file of ['programa-oficial.html', 'programa-oficial-color.html']) {
      phase = file;
      const tag = file.includes('color') ? 'COLOR' : 'B&N';
      const html = readFileSync(join(root, file), 'utf8');
      const snip = extractSnippet(
        html, 'const padreMadre', ".join(' — ');", file);
      const run = new Function('spc', snip + '\n return padreMadre;');

      ok(`O1 ${tag}: columna presente (\${padreMadre} dentro de un <td>)`,
         /<td[^>]*>\s*\$\{padreMadre\}\s*<\/td>/.test(html));
      ok(`O2 ${tag}: con pedigree → "PADRE — MADRE"`,
         run(byId[SPC_FULL]) === 'PADRE PROBE — MADRE PROBE', run(byId[SPC_FULL]));
      ok(`O3 ${tag}: sin pedigree → vacío (sin "—" de placeholder)`,
         run(byId[SPC_NONE]) === '', JSON.stringify(run(byId[SPC_NONE])));
      ok(`O4 ${tag}: sólo madre → separador no colgado a la izquierda`,
         run(byId[SPC_MADRE]) === 'MADRE SOLA', run(byId[SPC_MADRE]));
      ok(`O5 ${tag}: sólo padre → separador no colgado a la derecha`,
         run(byId[SPC_PADRE]) === 'PADRE SOLO', run(byId[SPC_PADRE]));
    }

    // ════ REGRESIÓN — el backfill del paso 4 llegó ══════════════════════════
    phase = 'backfill';
    // excluye los SPCs del propio seed: 2 de ellos tienen padrillo_nombre NULL a propósito
    const { count: sinPed } = await sb.from('spcs')
      .select('id', { count: 'exact', head: true })
      .is('padrillo_nombre', null)
      .not('id', 'in', `(${SPC_IDS.join(',')})`);
    ok('B1 backfill paso 4: quedan 5 SPCs sin pedigree (4 sin match + GREAT ORPEN)',
       sinPed === 5, `sin pedigree = ${sinPed}`);

  } catch (ex) {
    ok(`FALLO en fase "${phase}"`, false, ex.message);
  } finally {
    // ════ TEARDOWN — misma corrida ════════════════════════════════════════
    try {
      await sb.from('inscripciones').delete().eq('carrera_id', CARRERA);
      await sb.from('carreras').delete().eq('reunion_id', REUNION);
      await sb.from('reuniones').delete().eq('id', REUNION);
      await sb.from('spcs').delete().in('id', SPC_IDS);
      const { data: r } = await sb.from('reuniones').select('id').eq('id', REUNION);
      const { data: s } = await sb.from('spcs').select('id').in('id', SPC_IDS);
      ok('T1 teardown 9998 (reunión + 4 SPCs de prueba borrados)',
         (r?.length || 0) === 0 && (s?.length || 0) === 0,
         `reuniones=${r?.length || 0} spcs=${s?.length || 0}`);
    } catch (ex) {
      ok('TEARDOWN FALLÓ — BORRAR 9998 Y LOS SPCs d0000000-...-99f1..f4 A MANO', false, ex.message);
    }
  }

  console.log('\n==== RESULTADOS ====');
  for (const r of results) console.log(`${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`);
  const fail = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - fail}/${results.length} OK`);
  process.exit(fail ? 1 : 0);
})();
