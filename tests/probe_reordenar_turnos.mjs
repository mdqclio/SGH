#!/usr/bin/env node
/**
 * probe_reordenar_turnos.mjs — Gate 1 de feat/orden-llamados.
 *
 * Verifica la RPC `reordenar_turnos` (migrations/reordenar_turnos.sql) contra prod,
 * usando R9 (06/09/2026) como banco de pruebas: 11 carreras, 0 inscripciones.
 *
 * Patrón snapshot → run → assert → restore (tests/README.md): al terminar, R9 queda
 * exactamente con el orden que tenía antes de correr, pase lo que pase.
 *
 *   T1  dry run NO escribe, pero devuelve el resumen completo
 *   T2  permutación circular real: turnos quedan 1..N sin huecos ni repetidos
 *   T3  el resumen cuenta bien carreras movidas e inscripciones afectadas
 *   T4  rechazos: entrada de más, de menos, id sustituido, hueco, repetido
 *   T5  rechazo por programa ya numerado (numero_carrera_programa)
 *   T6  rechazo por estado no editable (reunión publicada)
 *   T7  rechazo por reunión inexistente
 *   T8  ningún rechazo dejó escrituras a medias
 *
 * Requiere SUPABASE_SECRET_KEY: la RPC tiene REVOKE a anon, y las lecturas de control
 * pasan por RLS. Sourcear el .env antes:
 *
 *   set -a; . ./.env; set +a; node tests/probe_reordenar_turnos.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) {
  console.error('Falta SUPABASE_SECRET_KEY. Correr:  set -a; . ./.env; set +a; node tests/probe_reordenar_turnos.mjs');
  process.exit(1);
}

const R9 = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9';   // 06/09/2026 — programada, 11 carreras, 0 inscriptos
const R8 = '7b6e003e-22e2-4629-bf55-f18560b1260f';   // 16/08/2026 — publicada, programa numerado
const FANTASMA = '00000000-0000-0000-0000-000000000000';

const sb = createClient(SUPABASE_URL, KEY);

let fallos = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) fallos++; };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${msg}${JSON.stringify(a) === JSON.stringify(b) ? '' : `\n       esperado: ${JSON.stringify(b)}\n       obtenido: ${JSON.stringify(a)}`}`);

async function turnosDe(reunionId) {
  const { data, error } = await sb.from('carreras')
    .select('id,numero_turno,numero_carrera_programa')
    .eq('reunion_id', reunionId).order('numero_turno');
  if (error) { console.error('[turnosDe]', error); throw error; }
  return data;
}

const rpc = (reunionId, orden, dryRun = false) =>
  sb.rpc('reordenar_turnos', { p_reunion_id: reunionId, p_orden: orden, p_dry_run: dryRun });

/** espera que la RPC falle, y que el mensaje contenga `fragmento` */
async function esperaRechazo(msg, reunionId, orden, fragmento, dryRun = false) {
  const { data, error } = await rpc(reunionId, orden, dryRun);
  if (!error) { ok(false, `${msg} — NO rechazó (devolvió ${JSON.stringify(data)?.slice(0, 120)})`); return; }
  ok(error.message.includes(fragmento), `${msg} — rechazó: "${error.message.split('\n')[0].slice(0, 110)}"`);
}

console.log('\n=== probe_reordenar_turnos — RPC de reordenamiento de la carta ===\n');

const snapshot = await turnosDe(R9);
const ordenOriginal = snapshot.map(c => ({ id: c.id, turno: c.numero_turno }));
const N = snapshot.length;
console.log(`R9 — ${N} carreras, turnos ${snapshot.map(c => c.numero_turno).join(',')}\n`);

if (N < 3) { console.error('R9 tiene menos de 3 carreras: el probe no puede permutar. Abortando.'); process.exit(1); }

// permutación circular: la carrera del turno k pasa al turno k+1, la última al 1
const ordenCircular = snapshot.map((c, i) => ({ id: c.id, turno: (i + 1) % N + 1 }));

try {
  console.log('T1 — dry run no escribe');
  {
    const { data, error } = await rpc(R9, ordenCircular, true);
    if (error) { ok(false, `dry run falló: ${error.message}`); }
    else {
      ok(data.dry_run === true, 'devuelve dry_run: true');
      eq(data.turnos, N, 'informa la cantidad de turnos');
      eq(data.carreras_movidas, N, `las ${N} carreras se mueven en una permutación circular`);
      ok(Array.isArray(data.detalle) && data.detalle.length === N, `detalle trae ${N} filas`);
      const d0 = data.detalle.find(d => d.turno_nuevo === 1);
      ok(d0 && d0.turno_anterior === N, 'la última carrera pasa al turno 1');
    }
    const post = await turnosDe(R9);
    eq(post.map(c => c.numero_turno), snapshot.map(c => c.numero_turno), 'la DB quedó intacta tras el dry run');
  }

  console.log('\nT2 — permutación real');
  {
    const { data, error } = await rpc(R9, ordenCircular);
    if (error) { ok(false, `reordenamiento falló: ${error.message}`); }
    else ok(data.dry_run === false, 'devuelve dry_run: false');

    const post = await turnosDe(R9);
    const turnos = post.map(c => c.numero_turno);
    eq(turnos, Array.from({ length: N }, (_, i) => i + 1), 'los turnos quedaron 1..N sin huecos ni repetidos');

    const esperado = new Map(ordenCircular.map(o => [o.id, o.turno]));
    const aplicado = post.every(c => esperado.get(c.id) === c.numero_turno);
    ok(aplicado, 'cada carrera quedó en el turno pedido');

    // ninguna quedó en negativo: la fase 1 se completó
    ok(post.every(c => c.numero_turno > 0), 'no quedaron turnos negativos de la fase intermedia');
  }

  console.log('\nT3 — el resumen cuenta bien');
  {
    // volver al original: también es una permutación, y de paso deja R9 como estaba
    const { data, error } = await rpc(R9, ordenOriginal);
    if (error) ok(false, `restauración falló: ${error.message}`);
    else {
      eq(data.carreras_movidas, N, 'informa las N carreras movidas al volver al original');
      eq(data.inscripciones_afectadas, 0, 'R9 no tiene inscripciones: 0 afectadas');
    }
    const post = await turnosDe(R9);
    eq(post.map(c => c.numero_turno), snapshot.map(c => c.numero_turno), 'R9 volvió al orden original');

    // identidad: reordenar al mismo orden no mueve nada
    const { data: idem } = await rpc(R9, ordenOriginal, true);
    eq(idem?.carreras_movidas, 0, 'reordenar al mismo orden informa 0 movidas');
  }

  console.log('\nT4 — rechazos de payload');
  {
    await esperaRechazo('entrada de más', R9,
      [...ordenOriginal, { id: FANTASMA, turno: N + 1 }], 'entradas y la reunión tiene');
    await esperaRechazo('entrada de menos', R9,
      ordenOriginal.slice(0, -1), 'entradas y la reunión tiene');
    await esperaRechazo('id sustituido', R9,
      [...ordenOriginal.slice(0, -1), { id: FANTASMA, turno: N }], 'no coincide con las carreras');
    await esperaRechazo('turno con hueco', R9,
      ordenOriginal.map((o, i) => ({ id: o.id, turno: i === 0 ? N + 1 : i + 1 })), 'exactamente 1..');
    await esperaRechazo('turno repetido', R9,
      ordenOriginal.map((o, i) => ({ id: o.id, turno: i === 0 ? 2 : i + 1 })), 'exactamente 1..');
  }

  console.log('\nT5 — rechazo por programa ya numerado');
  {
    const victima = snapshot[0].id;
    const { error: eSet } = await sb.from('carreras')
      .update({ numero_carrera_programa: 1 }).eq('id', victima);
    if (eSet) { ok(false, `no se pudo preparar el caso: ${eSet.message}`); }
    else {
      await esperaRechazo('programa numerado', R9, ordenCircular, 'programa ya está numerado');
      const { error: eDel } = await sb.from('carreras')
        .update({ numero_carrera_programa: null }).eq('id', victima);
      ok(!eDel, 'numero_carrera_programa restaurado a NULL');
    }
  }

  console.log('\nT6 — rechazo por estado no editable');
  {
    const r8 = await turnosDe(R8);
    const ordenR8 = r8.map((c, i) => ({ id: c.id, turno: i + 1 }));
    await esperaRechazo('R8 publicada', R8, ordenR8, 'la carta no se puede reordenar');
    const post = await turnosDe(R8);
    eq(post.map(c => c.numero_turno), r8.map(c => c.numero_turno), 'R8 quedó intacta');
  }

  console.log('\nT7 — reunión inexistente');
  await esperaRechazo('uuid fantasma', FANTASMA, ordenOriginal, 'reunión inexistente');

  console.log('\nT8 — estado final');
  {
    const post = await turnosDe(R9);
    eq(post.map(c => `${c.id}:${c.numero_turno}`), snapshot.map(c => `${c.id}:${c.numero_turno}`),
       'R9 idéntica al snapshot inicial (id → turno)');
    ok(post.every(c => c.numero_carrera_programa === null), 'ninguna carrera de R9 quedó con numero_carrera_programa');
  }

} finally {
  // red de seguridad: si algo explotó a mitad, devolver R9 al orden del snapshot
  const post = await turnosDe(R9);
  const distinto = post.some((c, i) => `${c.id}:${c.numero_turno}` !== `${snapshot[i]?.id}:${snapshot[i]?.numero_turno}`);
  if (distinto) {
    console.log('\n⚠️  R9 quedó distinta — restaurando desde el snapshot...');
    const { error } = await rpc(R9, ordenOriginal);
    console.log(error ? `   ❌ NO se pudo restaurar: ${error.message}` : '   ✅ restaurada');
    if (error) fallos++;
  }
}

console.log(`\n=== ${fallos === 0 ? 'OK — todos los asserts pasaron' : `${fallos} ASSERT(S) FALLARON`} ===\n`);
process.exit(fallos === 0 ? 0 : 1);
