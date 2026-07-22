/**
 * Probe — filtro de carreras NULL-safe en el programa oficial.
 *
 * Regresión de: `.neq('estado','anulada')` se traduce a `estado <> 'anulada'`, que para
 * una fila con `estado IS NULL` da NULL (no true) y Postgres la descarta en silencio.
 * `carreras.estado` es VARCHAR libre y admite NULL (gotcha #5), así que la carrera
 * desaparecía del programa impreso con todos sus ratificados, sin ningún error.
 * Diagnóstico original: tmp/diag_programa.md (SHA da33f8e).
 *
 * READ-ONLY: sólo SELECT. No escribe, no seedea, no borra. No necesita teardown.
 *
 * Caso vivo: reunión 6 (2026-06-20, Dolores) — 11 carreras = 3 anuladas + 7 con estado
 * cargado + 1 con estado NULL (turno 2, numero_carrera_programa=2, 8 ratificados).
 *
 * El filtro nuevo NO está hardcodeado: se extrae de programa-oficial.html, así que el
 * probe verifica el texto que realmente se sirve. Si alguien lo revierte, esto falla.
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
const REUNION_6    = 'b02ca761-6f44-4720-86aa-a3c3099019ea';

const FILTRO_VIEJO = "neq('estado','anulada')";  // baseline histórico, ya no está en el código

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const ok = (t, c, n='') => results.push({ t, s: c ? '✅' : '❌', n });

const dir  = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '..');

/** Saca el argumento del .or(...) de la query de carreras del HTML real. */
function filtroNuevoDesdeHTML(file) {
  const html = readFileSync(join(root, file), 'utf8');
  const m = html.match(/from\('carreras'\)[^\n]*?\.or\('([^']+)'\)/);
  if (!m) throw new Error(`[${file}] no encontré el .or() de la query de carreras`);
  return m[1];
}

(async () => {
  let phase = 'init';
  try {
    // ════ 0. el filtro nuevo está en los DOS archivos ══════════════════════
    phase = 'lectura del código';
    const fOficial = filtroNuevoDesdeHTML('programa-oficial.html');
    const fColor   = filtroNuevoDesdeHTML('programa-oficial-color.html');
    console.log(`[código] programa-oficial.html        → .or('${fOficial}')`);
    console.log(`[código] programa-oficial-color.html  → .or('${fColor}')`);
    ok('C1 los dos programas usan el mismo filtro de carreras', fOficial === fColor,
       `oficial="${fOficial}" color="${fColor}"`);
    ok('C2 el filtro contempla estado NULL', fOficial.includes('estado.is.null'), fOficial);

    // ════ 1. query VIEJA — .neq('estado','anulada') ════════════════════════
    phase = 'query vieja';
    const { data: viejas, error: eV } = await sb.from('carreras')
      .select('id,numero_turno,numero_carrera_programa,estado')
      .eq('reunion_id', REUNION_6).neq('estado', 'anulada');
    if (eV) throw new Error('query vieja: ' + eV.message);

    // ════ 2. query NUEVA — el .or() leído del HTML ═════════════════════════
    phase = 'query nueva';
    const { data: nuevas, error: eN } = await sb.from('carreras')
      .select('id,numero_turno,numero_carrera_programa,estado')
      .eq('reunion_id', REUNION_6).or(fOficial);
    if (eN) throw new Error('query nueva: ' + eN.message);

    console.log(`\n[conteos] filtro viejo .${FILTRO_VIEJO}  → ${viejas.length} carreras`);
    console.log(`[conteos] filtro nuevo .or('${fOficial}') → ${nuevas.length} carreras`);
    console.log(`[conteos] diferencia                      → ${nuevas.length - viejas.length}\n`);

    ok('Q1 la query vieja devuelve 7 (pierde la de estado NULL)', viejas.length === 7, `${viejas.length}`);
    ok('Q2 la query nueva devuelve 8', nuevas.length === 8, `${nuevas.length}`);

    // ════ 3. asserts sobre el resultado NUEVO ══════════════════════════════
    phase = 'asserts';
    const nula = nuevas.find(c => c.estado === null);
    ok('A1 el resultado nuevo trae 8 filas', nuevas.length === 8, `${nuevas.length}`);
    ok('A2 incluye la carrera con numero_carrera_programa=2 y estado NULL',
       !!nula && nula.numero_carrera_programa === 2,
       nula ? `turno ${nula.numero_turno}, nº prog ${nula.numero_carrera_programa}` : 'no vino ninguna con estado NULL');
    const anuladas = nuevas.filter(c => c.estado === 'anulada');
    ok('A3 0 filas con estado anulada (las 3 siguen excluidas)', anuladas.length === 0, `${anuladas.length}`);

    // regresión extra: lo que la vieja perdía es exactamente esa carrera
    const idsViejas = new Set(viejas.map(c => c.id));
    const perdidas  = nuevas.filter(c => !idsViejas.has(c.id));
    ok('A4 lo que recuperó el fix es exactamente 1 carrera, la de estado NULL',
       perdidas.length === 1 && perdidas[0].estado === null,
       perdidas.map(c => `turno ${c.numero_turno}/estado ${c.estado ?? 'NULL'}`).join(', ') || 'ninguna');

    // ════ 4. banner "próxima reunión" ══════════════════════════════════════
    // reuniones.estado es el ENUM estado_reunion, que NO tiene la etiqueta 'anulada'.
    // El filtro viejo no es que "no excluía nada": reventaba con 22P02 y dejaba
    // proximaReunion en null, así que el banner nunca se renderizaba.
    phase = 'banner';
    const CLUB_DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c';
    const FECHA_R6 = '2026-06-20';

    const viejoBanner = await sb.from('reuniones').select('id,fecha,numero,estado')
      .eq('club_id', CLUB_DOLORES).gt('fecha', FECHA_R6)
      .neq('estado', 'anulada')
      .order('fecha', { ascending: true }).limit(1);

    const nuevoBanner = await sb.from('reuniones').select('id,fecha,numero,estado')
      .eq('club_id', CLUB_DOLORES).gt('fecha', FECHA_R6)
      .or('estado.is.null,estado.neq.cancelada')
      .order('fecha', { ascending: true }).limit(1);

    console.log(`[banner] filtro viejo → error: ${viejoBanner.error?.code || 'ninguno'} | filas: ${viejoBanner.data?.length ?? 'null'}`);
    console.log(`[banner] filtro nuevo → error: ${nuevoBanner.error?.code || 'ninguno'} | filas: ${nuevoBanner.data?.length ?? 'null'}\n`);

    ok("B1 el filtro viejo erroraba con 22P02 ('anulada' no existe en el enum estado_reunion)",
       viejoBanner.error?.code === '22P02', viejoBanner.error?.message || 'no erroró');
    ok('B2 con el filtro viejo el banner nunca tenía datos (proximaReunion siempre null)',
       viejoBanner.data == null, JSON.stringify(viejoBanner.data));
    ok('B3 el filtro nuevo no errora', !nuevoBanner.error, nuevoBanner.error?.message || 'sin error');
    ok('B4 el filtro nuevo sí encuentra la próxima reunión', (nuevoBanner.data?.length || 0) === 1,
       nuevoBanner.data?.length ? `nº${nuevoBanner.data[0].numero} ${nuevoBanner.data[0].fecha}` : 'ninguna');

    const cancel = await sb.from('reuniones').select('id', { count: 'exact', head: true })
      .eq('estado', 'cancelada');
    ok("B5 'cancelada' sí es una etiqueta válida del enum y es lo que hay que excluir",
       !cancel.error && cancel.count > 0, cancel.error?.message || `${cancel.count} cancelada(s)`);

  } catch (ex) {
    ok(`FALLO en fase "${phase}"`, false, ex.message);
  }

  console.log('==== RESULTADOS ====');
  for (const r of results) console.log(`${r.s} ${r.t}${r.n ? `  → ${r.n}` : ''}`);
  const fail = results.filter(r => r.s === '❌').length;
  console.log(`\n${results.length - fail}/${results.length} OK`);
  process.exit(fail ? 1 : 0);
})();
