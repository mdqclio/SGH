/**
 * Probe peso onblur — persistencia de peso_declarado vía updatePeso() (fix/peso-onblur-persist).
 *
 * CORRE EL CÓDIGO REAL de updatePeso() de ratificacion.html (working tree). NO usa browser
 * (Playwright no soporta chromium en ubuntu26.04). Extrae el cuerpo de la función y lo ejecuta
 * vía AsyncFunction con un cliente Supabase real + stub de toast. Es el código REAL, no una
 * reimplementación ni un UPDATE simulado.
 *
 * Reunión DESCARTABLE 9998 (a0000000-...-9998): se crea acá (reunión + 1 carrera + 1 inscripción)
 * y se borra en el finally MISMA CORRIDA. NO toca la 6 ni la 9999.
 *
 * Verifica:
 *  - cargar peso vía updatePeso('58,5')  → persiste peso_declarado=58.5 (coma decimal)
 *  - editar de nuevo updatePeso('60')    → persiste el nuevo valor 60
 *  - vaciar updatePeso('')               → peso_declarado = NULL (peso limpiado)
 *  - inválido updatePeso('0') y ('abc')  → rechazado, NO escribe (queda el valor previo)
 *  - NO toca peso_balanza ni peso_final
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

// reunión descartable 9998 + carrera + inscripción
const REUNION = 'a0000000-0000-0000-0000-000000009998';
const CARRERA = 'c0000000-0000-0000-0000-000000009998';
const INSC    = 'a1000000-0000-0000-0000-000000009998';
const HIPODROMO = 'c33ade84-98a4-4072-b3f1-a7d980e11849';
const CATEGORIA = 'ce76d686-c07a-434c-a3b0-74be3bf0c906';
const SPC       = '209eef9a-922e-48b0-b6ef-ae66ab004bb8';

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

async function pesoDB() {
  const { data, error } = await sb.from('inscripciones')
    .select('peso_declarado, peso_balanza, peso_final').eq('id', INSC).single();
  if (error) throw new Error('lectura peso: ' + error.message);
  return data;
}

(async () => {
  let phase = 'init';
  try {
    // ════ SEED reunión descartable 9998 ════════════════════════════════════
    phase = 'seed';
    // limpieza defensiva por si quedó de una corrida previa abortada
    await sb.from('inscripciones').delete().eq('carrera_id', CARRERA);
    await sb.from('carreras').delete().eq('reunion_id', REUNION);
    await sb.from('reuniones').delete().eq('id', REUNION);

    const { error: er } = await sb.from('reuniones').insert({
      id: REUNION, club_id: CLUB_ID, hipodromo_id: HIPODROMO, numero: 9998,
      fecha: '2099-01-02', estado: 'borrador' });
    if (er) throw new Error('seed reunión: ' + er.message);
    const { error: ec } = await sb.from('carreras').insert({
      id: CARRERA, reunion_id: REUNION, numero_turno: 1,
      categoria_id: CATEGORIA, distancia_metros: 1000, estado: 'programada' });
    if (ec) throw new Error('seed carrera: ' + ec.message);
    const { error: ei } = await sb.from('inscripciones').insert({
      id: INSC, carrera_id: CARRERA, spc_id: SPC, estado: 'inscripto' });
    if (ei) throw new Error('seed inscripción: ' + ei.message);
    console.log(`[seed] reunión 9998 + carrera + inscripción ${INSC}`);

    // ════ EXTRAER el código REAL de updatePeso() ════════════════════════════
    phase = 'extract';
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'ratificacion.html'), 'utf8');
    const body = extractFnBody(html, 'async function updatePeso(');
    const toast = (m, t) => console.log(`  [toast${t ? ':' + t : ''}]`, m);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const updatePeso = new AsyncFunction('sb', 'toast', 'inscId', 'value', body);

    // ════ CASO 1: cargar 58,5 (coma decimal) ════════════════════════════════
    phase = 'caso1';
    await updatePeso(sb, toast, INSC, '58,5');
    let p = await pesoDB();
    ok('1 carga "58,5" → peso_declarado = 58.5', Number(p.peso_declarado) === 58.5, `db=${p.peso_declarado}`);

    // ════ CASO 2: editar a 60 ═══════════════════════════════════════════════
    phase = 'caso2';
    await updatePeso(sb, toast, INSC, '60');
    p = await pesoDB();
    ok('2 edita "60" → peso_declarado = 60 (persiste nuevo valor)', Number(p.peso_declarado) === 60, `db=${p.peso_declarado}`);

    // ════ CASO 3: vaciar → NULL ═════════════════════════════════════════════
    phase = 'caso3';
    await updatePeso(sb, toast, INSC, '');
    p = await pesoDB();
    ok('3 vacía "" → peso_declarado = NULL (peso limpiado)', p.peso_declarado === null, `db=${p.peso_declarado}`);

    // ════ CASO 4: inválidos NO escriben (dejan valor previo) ════════════════
    phase = 'caso4';
    await updatePeso(sb, toast, INSC, '57');   // setear base
    await updatePeso(sb, toast, INSC, '0');     // <=0 → rechazado
    p = await pesoDB();
    ok('4a "0" rechazado → queda 57 (no sobreescribe)', Number(p.peso_declarado) === 57, `db=${p.peso_declarado}`);
    await updatePeso(sb, toast, INSC, 'abc');   // NaN → rechazado
    p = await pesoDB();
    ok('4b "abc" rechazado → queda 57 (no sobreescribe)', Number(p.peso_declarado) === 57, `db=${p.peso_declarado}`);

    // ════ CASO 5: no toca balanza/final ═════════════════════════════════════
    phase = 'caso5';
    ok('5 peso_balanza y peso_final intactos (NULL)', p.peso_balanza === null && p.peso_final === null,
       `balanza=${p.peso_balanza} final=${p.peso_final}`);

  } catch (e) {
    ok(`EXCEPCIÓN en fase '${phase}'`, false, e.message);
    console.error(e);
  } finally {
    // ════ TEARDOWN reunión 9998 ════════════════════════════════════════════
    try {
      await sb.from('inscripciones').delete().eq('carrera_id', CARRERA);
      await sb.from('carreras').delete().eq('reunion_id', REUNION);
      await sb.from('reuniones').delete().eq('id', REUNION);
      const { data: gone } = await sb.from('reuniones').select('id').eq('id', REUNION);
      ok('R1 teardown 9998 (reunión borrada)', (gone?.length || 0) === 0);
    } catch (e) {
      ok('TEARDOWN FALLÓ — BORRAR 9998 A MANO', false, e.message);
      console.error('[teardown]', e);
    }
    console.log('\n──────── RESULTADO ────────');
    for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  ('+r.n+')' : ''}`);
    const failed = results.filter(r => r.s === '❌').length;
    console.log(`\n${failed === 0 ? '✅ TODO OK' : '❌ ' + failed + ' fallo(s)'} — ${results.length} checks`);
    process.exit(failed === 0 ? 0 : 1);
  }
})();
