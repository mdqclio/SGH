/**
 * Probe Fase 2 — FORMA de las líneas de liquidación (fondo solidario, bono 6-8, incentivos).
 *
 * NO usa browser (Playwright no instala chromium en ubuntu26.04). En su lugar EXTRAE el
 * cuerpo real de generarLiquidaciones() de liquidaciones.html (working tree, Fase 2) y lo
 * ejecuta vía AsyncFunction con un cliente Supabase real (service_role) + stubs de DOM.
 * Así corre el código REAL, no una reimplementación.
 *
 * Garantías:
 *  - Snapshot + restore de R5: resultados.estado y las liquidaciones/detalle preexistentes.
 *  - Solo valida la FORMA; NO aprueba ni paga nada.
 *  - Limpia todo lo generado y deja R5 idéntica a como estaba.
 *
 * SEGURIDAD: usa la service_role hardcodeada (igual que el resto de tests/). Hace ESCRITURAS
 * (set resultados a 'oficial', generar/borrar liquidaciones de prueba) — todo revertido al final.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVubGhjdWFuZnJ0cGF0b2lwd3ZlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjcyNDQ5NywiZXhwIjoyMDkyMzAwNDk3fQ.drl2zQmZ3NMEksHSv14Jd_1p0HQWQg-_ACihQi3vQcE';
const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const R5      = 'c90b6186-268d-4089-8cc6-71626b627cf8';

// Setup controlado: las inscripciones ubicadas de R5 tienen propietario_id en null y
// entrenador/jockey parciales, así que el generador no produciría líneas de propietario
// ni bono. Asignamos los 6 roles (IDs reales) a los ubicados para validar el reparto
// completo de forma determinística. Snapshot + restore de estos campos al final.
const PROP_ID = '3e758672-7be8-4ed6-b4e9-7c18a33a7f17'; // propietarios.id (Leonardo Fernandez)
const ENTR_ID = 'c34e5c0b-7bcf-45ad-8891-1bd22cda3f0d'; // profesionales.id (entrenador Gimenez)
const JOCK_ID = 'f6637123-af74-42ae-81e1-d5b9fed88fc9'; // jockey ya usado en inscripciones R5 (FK válida)
const ROLES_SETUP = { propietario_id: PROP_ID, entrenador_id: ENTR_ID, jockey_titular_id: JOCK_ID,
                      peon: 'PROBE_PEON', capataz: 'PROBE_CAP', sereno: 'PROBE_SER' };
const ROLE_FIELDS = Object.keys(ROLES_SETUP);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const ok   = (t, c, n='') => results.push({ t, s: c ? '✅' : '❌', n });
const near = (a, b, tol=1) => Math.abs(a - b) <= tol;

// ── Extraer el cuerpo real de generarLiquidaciones() del HTML ────────────────
function extractFnBody(html, signature) {
  const start = html.indexOf(signature);
  if (start < 0) throw new Error(`No encontré la firma: ${signature}`);
  const braceOpen = html.indexOf('{', start);
  let depth = 0, i = braceOpen;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) break; }
  }
  return html.slice(braceOpen + 1, i); // contenido entre llaves
}

// ── Oráculo independiente (para verificar montos/ratios) ─────────────────────
function premioOracle(dist, bolsa, pos) {
  const pct = dist[String(pos)];
  if (!pct) return 0;
  let p = parseFloat(bolsa) * pct / 100;
  if (pos === 1 && dist.bono_ganador) p += parseFloat(dist.bono_ganador);
  const min = parseFloat(dist.ganancia_minima) || 0;
  return min > 0 && p < min ? min : p;
}
function bono68Oracle(dist, pos) {
  if (dist.bono_posicion_desde && dist.bono_posicion_hasta && dist.bono_posicion_monto &&
      pos >= dist.bono_posicion_desde && pos <= dist.bono_posicion_hasta) return parseFloat(dist.bono_posicion_monto);
  return 0;
}

(async () => {
  let snapResEstados = null, snapLiqs = null, snapDets = null, mutatedRes = [];
  let snapInscs = null;
  let phase = 'init';
  try {
    // ════ SNAPSHOT ════════════════════════════════════════════════════════
    phase = 'snapshot';
    const { data: cars } = await sb.from('carreras')
      .select('id,numero_turno,bolsa_total,distribucion_premios').eq('reunion_id', R5);
    const carIds = cars.map(c => c.id);
    const { data: resAll } = await sb.from('resultados').select('id,carrera_id,estado').in('carrera_id', carIds);
    snapResEstados = resAll.map(r => ({ id: r.id, estado: r.estado }));

    // Inscripciones ubicadas (posicion != null): snapshot de sus 6 campos de rol.
    const { data: posSnap } = await sb.from('resultado_posiciones')
      .select('inscripcion_id').in('resultado_id', resAll.map(r => r.id)).not('posicion', 'is', null);
    const placedInscIds = [...new Set(posSnap.map(p => p.inscripcion_id))];
    const { data: inscSnap } = await sb.from('inscripciones')
      .select(['id', ...ROLE_FIELDS].join(',')).in('id', placedInscIds);
    snapInscs = inscSnap;

    const { data: liqsBefore } = await sb.from('liquidaciones').select('*').eq('reunion_id', R5);
    snapLiqs = liqsBefore;
    const liqIdsBefore = liqsBefore.map(l => l.id);
    const { data: detsBefore } = liqIdsBefore.length
      ? await sb.from('liquidacion_detalle').select('*').in('liquidacion_id', liqIdsBefore)
      : { data: [] };
    snapDets = detsBefore;
    console.log(`[snapshot] resultados=${resAll.length} liquidaciones=${liqsBefore.length} detalle=${snapDets.length}`);
    // Guard: no avanzar si hay liquidaciones aprobadas/pagadas (el generador abortaría igual)
    if (liqsBefore.some(l => l.estado === 'aprobada' || l.estado === 'pagada'))
      throw new Error('R5 tiene liquidaciones aprobadas/pagadas — abortando para no tocar nada.');

    // ════ MUTAR: poner todos los resultados de R5 en 'oficial' ════════════
    phase = 'mutate';
    for (const r of resAll) {
      if (r.estado !== 'oficial') {
        const { error } = await sb.from('resultados').update({ estado: 'oficial' }).eq('id', r.id);
        if (error) throw new Error(`set oficial ${r.id}: ${error.message}`);
        mutatedRes.push(r.id);
      }
    }
    console.log(`[mutate] resultados puestos en oficial: ${mutatedRes.length}`);
    // Asignar los 6 roles a las inscripciones ubicadas (setup determinístico del reparto).
    for (const ins of snapInscs) {
      const { error } = await sb.from('inscripciones').update(ROLES_SETUP).eq('id', ins.id);
      if (error) throw new Error(`setup roles ${ins.id}: ${error.message}`);
    }
    console.log(`[mutate] inscripciones ubicadas con roles asignados: ${snapInscs.length}`);

    // ════ EJECUTAR el código REAL de generarLiquidaciones() ═══════════════
    phase = 'run';
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'liquidaciones.html'), 'utf8');
    const { data: liqConfig } = await sb.from('liquidacion_config')
      .select('*').eq('club_id', CLUB_ID).eq('activo', true).maybeSingle();
    const body = extractFnBody(html, 'async function generarLiquidaciones()');
    const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
    const documentStub = { getElementById: (id) => ({ value: id === 'sel-reunion' ? R5 : '' }) };
    const toast = (m) => console.log('  [toast]', m);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const gen = new AsyncFunction(
      'sb', 'CLUB_ID', 'liqConfig', 'fmt', 'toast', 'confirm', 'document', 'loadLiquidaciones', body);
    await gen(sb, CLUB_ID, liqConfig, fmt, toast, () => true, documentStub, async () => {});

    // ════ LEER lo generado ════════════════════════════════════════════════
    phase = 'assert';
    const { data: liqsAfter } = await sb.from('liquidaciones').select('*').eq('reunion_id', R5);
    const newLiqIds = liqsAfter.map(l => l.id);
    const { data: dets } = await sb.from('liquidacion_detalle').select('*').in('liquidacion_id', newLiqIds);
    console.log(`[generado] liquidaciones=${liqsAfter.length} detalle=${dets.length}\n`);

    const carById = Object.fromEntries(cars.map(c => [c.id, c]));
    const { data: inscs } = await sb.from('inscripciones').select('id,carrera_id,propietario_id').in('carrera_id', carIds);
    const inscById = Object.fromEntries(inscs.map(i => [i.id, i]));
    const { data: poss } = await sb.from('resultado_posiciones')
      .select('resultado_id,inscripcion_id,posicion,no_largo,descalificado').in('resultado_id', resAll.map(r => r.id));
    const resCar = Object.fromEntries(resAll.map(r => [r.id, r.carrera_id]));

    // ── A. Liquidación CLUB (fondo solidario): exactamente 1, sin persona ──
    const clubLiqs = liqsAfter.filter(l => !l.propietario_id && !l.profesional_id);
    ok('A1 una sola liquidación club (sin propietario ni profesional)', clubLiqs.length === 1,
       `encontradas=${clubLiqs.length}`);
    const clubLiqId = clubLiqs[0]?.id;
    const fondoLines = dets.filter(d => d.concepto_tipo === 'fondo_solidario');
    ok('A2 líneas fondo_solidario todas en la liquidación club', clubLiqId && fondoLines.every(d => d.liquidacion_id === clubLiqId),
       `fondo=${fondoLines.length}`);
    ok('A3 fondo_solidario: beneficiario_tipo=club + beneficiario_id=CLUB_ID + descuento 0',
       fondoLines.length > 0 && fondoLines.every(d => d.beneficiario_tipo === 'club' && d.beneficiario_id === CLUB_ID && Number(d.monto_descuento) === 0));

    // ── B. Por cada ubicado 1-5: reparto completo 70/10/10/4/3/1 + fondo 2% = 100% ──
    let ubic15 = 0, b1 = 0, b2 = 0, b3 = 0;
    const bad = [];
    for (const p of poss) {
      if (p.posicion == null || p.descalificado || p.no_largo) continue;
      const car = carById[resCar[p.resultado_id]];
      const premioEf = premioOracle(car.distribucion_premios, car.bolsa_total, p.posicion);
      if (premioEf <= 0) continue; // posiciones 6-8 no tienen premio (solo bono)
      ubic15++;
      const lines = dets.filter(d => d.inscripcion_id === p.inscripcion_id && d.posicion === p.posicion);
      const prop  = lines.find(d => d.concepto_tipo === 'premio' && d.beneficiario_tipo === 'propietario');
      const fondo = lines.find(d => d.concepto_tipo === 'fondo_solidario');
      if (prop && fondo) b1++; else { bad.push(`t${car.numero_turno}/p${p.posicion}:prop=${!!prop},fondo=${!!fondo}`); continue; }
      // fondo == 2% del premio efectivo
      if (near(Number(fondo.monto_bruto), premioEf * 0.02, 2)) b2++;
      // propietario == 70% del premio efectivo y suma de TODAS las líneas == premioEf (100%)
      const sumAll = lines.reduce((s, d) => s + Number(d.monto_bruto), 0);
      if (near(Number(prop.monto_bruto), premioEf * 0.70, 2) && near(sumAll, premioEf, 3)) b3++;
    }
    ok('B1 cada ubicado 1-5 tiene línea premio(propietario) + fondo_solidario', b1 === ubic15 && ubic15 > 0,
       `ok=${b1}/${ubic15}${bad.length ? ' · ' + bad.slice(0,3).join('; ') : ''}`);
    ok('B2 fondo_solidario = 2% de premioEfectivo', b2 === ubic15 && ubic15 > 0, `ok=${b2}/${ubic15}`);
    ok('B3 propietario=70% y suma total = 100% (98% roles + 2% fondo)', b3 === ubic15 && ubic15 > 0, `ok=${b3}/${ubic15}`);

    // ── C. Bono 6-8: línea 'bono' 100% propietario, neto ──
    let bonoEsperados = 0, bonoOK = 0;
    for (const p of poss) {
      if (p.posicion == null || p.descalificado || p.no_largo) continue;
      const car = carById[resCar[p.resultado_id]];
      const b = bono68Oracle(car.distribucion_premios, p.posicion);
      if (b <= 0) continue;
      bonoEsperados++;
      const insc = inscById[p.inscripcion_id];
      const line = dets.find(d => d.inscripcion_id === p.inscripcion_id && d.posicion === p.posicion && d.concepto_tipo === 'bono');
      if (line && near(Number(line.monto_bruto), b, 1) && Number(line.monto_descuento) === 0 &&
          line.beneficiario_tipo === 'propietario' && line.beneficiario_id === insc?.propietario_id &&
          line.liquidacion_id && liqsAfter.find(l => l.id === line.liquidacion_id)?.propietario_id === insc?.propietario_id) {
        bonoOK++;
      }
    }
    ok('C1 bono 6-8 genera línea bono=monto, 100% propietario, neto', bonoEsperados > 0 && bonoOK === bonoEsperados,
       `ok=${bonoOK}/${bonoEsperados} (esperados>0 porque R5 tiene 6°/7°)`);

    // ── D. Incentivos: monto 0 → NO se generan ──
    const incLines = dets.filter(d => d.concepto_tipo === 'incentivo_jockey' || d.concepto_tipo === 'incentivo_entrenador');
    ok('D1 incentivos NO generados (monto 0 en liquidacion_config)', incLines.length === 0, `encontradas=${incLines.length}`);

    // ── E. concepto_tipo dentro del ENUM permitido ──
    const ENUM = new Set(['premio', 'bono', 'actuacion', 'incentivo_jockey', 'incentivo_entrenador', 'fondo_solidario']);
    ok('E1 todos los concepto_tipo en el ENUM válido', dets.every(d => ENUM.has(d.concepto_tipo)),
       `tipos=${[...new Set(dets.map(d => d.concepto_tipo))].join(',')}`);
    const BEN = new Set(['profesional', 'propietario', 'club']);
    ok('E2 todos los beneficiario_tipo en el ENUM válido', dets.every(d => BEN.has(d.beneficiario_tipo)));
    ok('E3 reunion_id seteado en todas las líneas', dets.every(d => d.reunion_id === R5));

  } catch (e) {
    ok(`EXCEPCIÓN en fase '${phase}'`, false, e.message);
    console.error(e);
  } finally {
    // ════ CLEANUP + RESTORE ════════════════════════════════════════════════
    try {
      // 1. Borrar TODO lo que haya ahora en R5 (lo generado por el probe).
      const { data: nowLiqs } = await sb.from('liquidaciones').select('id').eq('reunion_id', R5);
      const nowIds = (nowLiqs || []).map(l => l.id);
      if (nowIds.length) {
        await sb.from('liquidacion_detalle').delete().in('liquidacion_id', nowIds);
        await sb.from('liquidaciones').delete().in('id', nowIds);
      }
      // 2. Re-insertar las liquidaciones preexistentes (sin columnas generadas).
      if (snapLiqs?.length) {
        const liqRows = snapLiqs.map(({ total_neto, ...r }) => r);
        const { error: e1 } = await sb.from('liquidaciones').insert(liqRows);
        if (e1) throw new Error(`restore liquidaciones: ${e1.message}`);
      }
      if (snapDets?.length) {
        const detRows = snapDets.map(({ monto_neto, ...r }) => r);
        const { error: e2 } = await sb.from('liquidacion_detalle').insert(detRows);
        if (e2) throw new Error(`restore detalle: ${e2.message}`);
      }
      // 3. Restaurar estados de resultados que mutamos.
      for (const s of (snapResEstados || [])) {
        if (mutatedRes.includes(s.id)) await sb.from('resultados').update({ estado: s.estado }).eq('id', s.id);
      }
      // 3b. Restaurar los 6 campos de rol de las inscripciones ubicadas.
      for (const ins of (snapInscs || [])) {
        const orig = {}; for (const f of ROLE_FIELDS) orig[f] = ins[f];
        await sb.from('inscripciones').update(orig).eq('id', ins.id);
      }
      // 4. Verificar restore.
      const { data: liqsFin } = await sb.from('liquidaciones').select('id,estado').eq('reunion_id', R5);
      const { data: resFin }  = await sb.from('resultados').select('id,estado').in('id', (snapResEstados || []).map(s => s.id));
      const liqRestored = (liqsFin?.length || 0) === (snapLiqs?.length || 0);
      const resRestored = (snapResEstados || []).every(s => resFin.find(r => r.id === s.id)?.estado === s.estado);
      ok('R1 restore liquidaciones (count == original)', liqRestored, `final=${liqsFin?.length} original=${snapLiqs?.length}`);
      ok('R2 restore estados de resultados', resRestored);
      // R3 restore de los 6 campos de rol de las inscripciones ubicadas.
      let inscRestored = true;
      if (snapInscs?.length) {
        const { data: inscFin } = await sb.from('inscripciones')
          .select(['id', ...ROLE_FIELDS].join(',')).in('id', snapInscs.map(i => i.id));
        inscRestored = snapInscs.every(o => {
          const f = inscFin.find(r => r.id === o.id);
          return f && ROLE_FIELDS.every(k => (f[k] ?? null) === (o[k] ?? null));
        });
      }
      ok('R3 restore roles de inscripciones (propietario/entrenador/jockey/subs)', inscRestored);
    } catch (e) {
      ok('RESTORE FALLÓ — REVISAR R5 MANUALMENTE', false, e.message);
      console.error('[restore]', e);
    }
    // ════ REPORTE ════════════════════════════════════════════════════════
    console.log('\n──────── RESULTADO ────────');
    for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  ('+r.n+')' : ''}`);
    const failed = results.filter(r => r.s === '❌').length;
    console.log(`\n${failed === 0 ? '✅ TODO OK' : '❌ ' + failed + ' fallo(s)'} — ${results.length} checks`);
    process.exit(failed === 0 ? 0 : 1);
  }
})();
