/**
 * Probe — Derivación de propietario (migración liquidaciones_cd_propietario_derivacion.sql).
 *
 * Verifica la cadena construida por A/B/C:
 *   inscripciones.caballeriza_id
 *     → caballeriza_responsables (rol='propietario', activo) .propietario_id
 *       → propietarios (club=Dolores, documento_nro)
 *   y que inscripciones.propietario_id quedó derivado (C2 backfill + trigger C).
 *
 * Caso ancla: R5 / caballeriza "BAUTY MI" / titular OLGUIN (DNI 14269781).
 *
 * Secciones:
 *   A) Estática (read-only): la cadena BAUTY MI→OLGUIN está completa tras el backfill.
 *   B) Trigger C en vivo (inscripciones): setear caballeriza_id deriva propietario; volver a
 *      null lo limpia. Snapshot+restore de la inscripción usada.
 *   C) Trigger C3 en vivo (caballeriza_responsables): alta de responsable titular crea/enlaza
 *      el propietario (resuelve v_club desde la caballeriza). Idempotencia por documento.
 *      Limpia el responsable y el propietario creados.
 *
 * SEGURIDAD: usa service_role (igual que el resto de tests/). Hace escrituras acotadas, todas
 * revertidas en finally. NO toca liquidaciones ni resultados.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVubGhjdWFuZnJ0cGF0b2lwd3ZlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjcyNDQ5NywiZXhwIjoyMDkyMzAwNDk3fQ.drl2zQmZ3NMEksHSv14Jd_1p0HQWQg-_ACihQi3vQcE';
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const R5      = 'c90b6186-268d-4089-8cc6-71626b627cf8';

const CABALLERIZA_ANCLA = 'BAUTY MI';
const DNI_ANCLA = '14269781';        // OLGUIN
const DNI_FAKE_1 = '99999901';       // para test del trigger C3 (alta)
const DNI_FAKE_2 = '99999902';       // para test de idempotencia C3

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const results = [];
const ok = (t, c, n = '') => results.push({ t, s: c ? '✅' : '❌', n });

(async () => {
  let phase = 'init';
  // estado a revertir
  let inscTrig = null;                 // {id, caballeriza_id, propietario_id} snapshot
  const createdRespIds = [];           // caballeriza_responsables creados (borrar primero)
  const createdPropDocs = [DNI_FAKE_1, DNI_FAKE_2]; // propietarios fake a borrar al final
  try {
    // ════ A) Cadena estática BAUTY MI → OLGUIN ════════════════════════════════
    phase = 'A';
    const { data: cab, error: eCab } = await sb.from('caballerizas')
      .select('id,nombre,club_id').eq('nombre', CABALLERIZA_ANCLA).eq('club_id', CLUB_ID).maybeSingle();
    if (eCab) throw new Error(`caballeriza: ${eCab.message}`);
    ok('A0 caballeriza ancla existe en Dolores', !!cab, `${CABALLERIZA_ANCLA} id=${cab?.id}`);

    // titular de la caballeriza
    const { data: tit } = await sb.from('caballeriza_responsables')
      .select('id,propietario_id,documento_nro,apellido')
      .eq('caballeriza_id', cab.id).eq('rol', 'propietario').eq('activo', true).maybeSingle();
    ok('A1 titular (rol=propietario,activo) tiene propietario_id (puente B2)',
       !!tit?.propietario_id, `dni=${tit?.documento_nro} ap=${tit?.apellido} prop=${tit?.propietario_id}`);

    // propietario apuntado
    const { data: prop } = await sb.from('propietarios')
      .select('id,club_id,documento_nro,nombre').eq('id', tit.propietario_id).maybeSingle();
    ok('A2 propietario del puente es de Dolores y doc = DNI ancla',
       prop?.club_id === CLUB_ID && prop?.documento_nro === DNI_ANCLA,
       `club=${prop?.club_id === CLUB_ID ? 'Dolores' : prop?.club_id} doc=${prop?.documento_nro} nombre=${prop?.nombre}`);

    // inscripción de R5 sobre esa caballeriza: propietario_id derivado (C2)
    const { data: carsR5 } = await sb.from('carreras').select('id').eq('reunion_id', R5);
    const carIds = carsR5.map(c => c.id);
    const { data: inscAncla } = await sb.from('inscripciones')
      .select('id,propietario_id,caballeriza_id').in('carrera_id', carIds).eq('caballeriza_id', cab.id).limit(1).maybeSingle();
    ok('A3 inscripción R5 sobre BAUTY MI tiene propietario_id derivado (C2 backfill)',
       inscAncla?.propietario_id === prop.id,
       `insc=${inscAncla?.id} propietario_id=${inscAncla?.propietario_id}`);

    // ════ B) Trigger C en vivo (inscripciones) ════════════════════════════════
    phase = 'B';
    // una inscripción de R5 SIN caballeriza y SIN propietario (las de turnos 2-11)
    const { data: insSinCab } = await sb.from('inscripciones')
      .select('id,caballeriza_id,propietario_id').in('carrera_id', carIds)
      .is('caballeriza_id', null).is('propietario_id', null).limit(1).maybeSingle();
    if (!insSinCab) { ok('B0 hay inscripción R5 sin caballeriza para el test', false, 'no encontrada'); }
    else {
      inscTrig = { id: insSinCab.id, caballeriza_id: null, propietario_id: null };
      // set caballeriza_id = BAUTY MI → el trigger debe derivar propietario_id
      const { error: eU } = await sb.from('inscripciones').update({ caballeriza_id: cab.id }).eq('id', insSinCab.id);
      if (eU) throw new Error(`set caballeriza_id: ${eU.message}`);
      const { data: after1 } = await sb.from('inscripciones').select('propietario_id').eq('id', insSinCab.id).single();
      ok('B1 trigger C: setear caballeriza_id deriva propietario_id (=OLGUIN)',
         after1.propietario_id === prop.id, `propietario_id=${after1.propietario_id}`);
      // volver a null → el trigger debe limpiar propietario_id
      const { error: eU2 } = await sb.from('inscripciones').update({ caballeriza_id: null }).eq('id', insSinCab.id);
      if (eU2) throw new Error(`unset caballeriza_id: ${eU2.message}`);
      const { data: after2 } = await sb.from('inscripciones').select('propietario_id,caballeriza_id').eq('id', insSinCab.id).single();
      ok('B2 trigger C: quitar caballeriza_id limpia propietario_id',
         after2.propietario_id === null && after2.caballeriza_id === null, `propietario_id=${after2.propietario_id}`);
      inscTrig = null; // ya quedó como estaba
    }

    // ════ C) Trigger C3 en vivo (caballeriza_responsables) ════════════════════
    phase = 'C';
    // alta de responsable titular con DNI nuevo → crea propietario y lo enlaza
    const { data: r1, error: eR1 } = await sb.from('caballeriza_responsables')
      .insert({ caballeriza_id: cab.id, rol: 'propietario', activo: true,
                apellido: 'PROBE', nombre: 'DERIV', documento_tipo: 'DNI', documento_nro: DNI_FAKE_1 })
      .select('id,propietario_id').single();
    if (eR1) throw new Error(`insert resp1: ${eR1.message}`);
    createdRespIds.push(r1.id);
    ok('C1 trigger C3: alta de responsable titular enlaza propietario_id', !!r1.propietario_id, `prop=${r1.propietario_id}`);
    const { data: propNew } = await sb.from('propietarios').select('id,club_id,documento_nro').eq('id', r1.propietario_id).maybeSingle();
    ok('C2 trigger C3: propietario creado es de Dolores con el DNI nuevo',
       propNew?.club_id === CLUB_ID && propNew?.documento_nro === DNI_FAKE_1,
       `club=${propNew?.club_id === CLUB_ID ? 'Dolores' : propNew?.club_id} doc=${propNew?.documento_nro}`);

    // idempotencia: segundo responsable MISMO DNI → mismo propietario (no duplica)
    const { data: r2, error: eR2 } = await sb.from('caballeriza_responsables')
      .insert({ caballeriza_id: cab.id, rol: 'propietario', activo: true,
                apellido: 'PROBE', nombre: 'DERIV2', documento_tipo: 'DNI', documento_nro: DNI_FAKE_1 })
      .select('id,propietario_id').single();
    if (eR2) throw new Error(`insert resp2: ${eR2.message}`);
    createdRespIds.push(r2.id);
    const { count: dupCount } = await sb.from('propietarios')
      .select('id', { count: 'exact', head: true }).eq('club_id', CLUB_ID).eq('documento_tipo', 'DNI').eq('documento_nro', DNI_FAKE_1);
    ok('C3 trigger C3: mismo DNI reusa el propietario (sin duplicar)',
       r2.propietario_id === r1.propietario_id && dupCount === 1, `mismo=${r2.propietario_id === r1.propietario_id} count=${dupCount}`);

  } catch (e) {
    ok(`EXCEPCIÓN en fase '${phase}'`, false, e.message);
    console.error(e);
  } finally {
    // ════ CLEANUP + RESTORE ════════════════════════════════════════════════
    phase = 'cleanup';
    try {
      // B) si quedó a medias, restaurar la inscripción usada
      if (inscTrig) await sb.from('inscripciones')
        .update({ caballeriza_id: inscTrig.caballeriza_id, propietario_id: inscTrig.propietario_id }).eq('id', inscTrig.id);
      // C) borrar responsables creados (primero, por la FK propietario_id), luego propietarios fake
      if (createdRespIds.length) await sb.from('caballeriza_responsables').delete().in('id', createdRespIds);
      for (const doc of createdPropDocs) {
        await sb.from('propietarios').delete().eq('club_id', CLUB_ID).eq('documento_tipo', 'DNI').eq('documento_nro', doc);
      }
      // verificación de limpieza
      const { count: leftResp } = await sb.from('caballeriza_responsables')
        .select('id', { count: 'exact', head: true }).in('documento_nro', createdPropDocs);
      const { count: leftProp } = await sb.from('propietarios')
        .select('id', { count: 'exact', head: true }).eq('club_id', CLUB_ID).in('documento_nro', createdPropDocs);
      ok('R1 cleanup: 0 responsables fake restantes', (leftResp || 0) === 0, `quedan=${leftResp}`);
      ok('R2 cleanup: 0 propietarios fake restantes', (leftProp || 0) === 0, `quedan=${leftProp}`);
    } catch (e) {
      ok('RESTORE FALLÓ — REVISAR MANUALMENTE', false, e.message);
      console.error('[restore]', e);
    }
    console.log('\n──────── RESULTADO ────────');
    for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  (' + r.n + ')' : ''}`);
    const failed = results.filter(r => r.s === '❌').length;
    console.log(`\n${failed === 0 ? '✅ TODO OK' : '❌ ' + failed + ' fallo(s)'} — ${results.length} checks`);
    process.exit(failed === 0 ? 0 : 1);
  }
})();
