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
 * SEGURIDAD: usa la service_role (vía env SUPABASE_SERVICE_ROLE_KEY, igual que el resto de tests/). Hace ESCRITURAS
 * (set resultados a 'oficial', generar/borrar liquidaciones de prueba) — todo revertido al final.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ── Credenciales por entorno (no hardcodear) ─────────────────────────────────
// Las keys salen de variables de entorno. Ej:
//   SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... node tests/probe_fase2_liquidaciones.mjs
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Exportala antes de correr el test (NO hardcodear la key).`);
  return v;
}


const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SERVICE_KEY  = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
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
  let snapTieEmpate = null, tieCarId = null, tieBonoLead = null, tieBonoMonto = null, tieBonoInscIds = [];
  let tiePremioLead = null, tiePremioInscIds = [], tiePremioEsperado = null;
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

    // ── Setup de empates (dead-heat) ALINEADO AL SCHEMA: NO se mueve `posicion` (la constraint
    // UNIQUE (resultado_id,posicion) lo prohíbe). Se marca `empate=true` en finishers que YA
    // están en posiciones consecutivas. Snapshot+restore de `empate` (R4 honesto: hay mutación
    // real que revertir, a diferencia del intento viejo que fallaba antes de mutar).
    //   • Empate de BONO  (C2): dos finishers consecutivos dentro de [desde,hasta] (p.ej. 6°-7°).
    //   • Empate de PREMIO (C3): dos finishers consecutivos en 1..5 (p.ej. 1°-2°) — la plata grande.
    // Se exige un hueco (≥1 puesto) entre ambos pares para que el agrupamiento no los fusione.
    phase = 'mutate-tie';
    const firstConsecutivePair = (rows, lo, hi) => {
      for (let i = 0; i + 1 < rows.length; i++) {
        if (rows[i].posicion >= lo && rows[i + 1].posicion <= hi &&
            rows[i + 1].posicion === rows[i].posicion + 1) return [rows[i], rows[i + 1]];
      }
      return null;
    };
    const bonoCars = cars.filter(c => {
      const d = c.distribucion_premios || {};
      return d.bono_posicion_desde && d.bono_posicion_hasta && d.bono_posicion_monto;
    });
    let tieCand = null;   // preferimos una carrera que soporte AMBOS empates
    for (const c of bonoCars) {
      const resB = resAll.find(r => r.carrera_id === c.id);
      if (!resB) continue;
      const { data: posB } = await sb.from('resultado_posiciones')
        .select('id,inscripcion_id,posicion,empate').eq('resultado_id', resB.id)
        .not('posicion', 'is', null).eq('descalificado', false).eq('no_largo', false)
        .order('posicion', { ascending: true });
      if (!posB || posB.length < 2) continue;
      const dist = c.distribucion_premios;
      const bonoPair = firstConsecutivePair(posB, dist.bono_posicion_desde, dist.bono_posicion_hasta);
      if (!bonoPair) continue;
      const premioPairRaw = firstConsecutivePair(posB, 1, 5);
      // hueco: el par de premio debe terminar al menos 1 puesto antes del de bono (no fusión).
      const premioPair = (premioPairRaw && premioPairRaw[1].posicion + 1 < bonoPair[0].posicion) ? premioPairRaw : null;
      const cand = { c, dist, bonoPair, premioPair };
      if (premioPair) { tieCand = cand; break; }   // ideal: soporta bono + premio
      if (!tieCand) tieCand = cand;                 // respaldo: solo bono
    }
    if (tieCand) {
      const { c, dist, bonoPair, premioPair } = tieCand;
      const flipped = [...bonoPair, ...(premioPair || [])];
      snapTieEmpate = flipped.map(p => ({ id: p.id, empate: p.empate === true }));
      for (const p of flipped) {
        const { error } = await sb.from('resultado_posiciones').update({ empate: true }).eq('id', p.id);
        if (error) throw new Error(`tie setup ${p.id}: ${error.message}`);
      }
      tieCarId = c.id;
      tieBonoLead = bonoPair[0].posicion;
      tieBonoMonto = parseFloat(dist.bono_posicion_monto);
      tieBonoInscIds = bonoPair.map(p => p.inscripcion_id);
      console.log(`[mutate] empate BONO: turno ${c.numero_turno}, ${tieBonoLead}°-${bonoPair[1].posicion}° (bono ${tieBonoMonto} → ${tieBonoMonto / 2} c/u)`);
      if (premioPair) {
        tiePremioLead = premioPair[0].posicion;
        tiePremioInscIds = premioPair.map(p => p.inscripcion_id);
        const pa = premioOracle(dist, c.bolsa_total, premioPair[0].posicion);
        const pb = premioOracle(dist, c.bolsa_total, premioPair[1].posicion);
        tiePremioEsperado = (pa + pb) / 2;   // dead-heat: Σ premios del grupo / N
        console.log(`[mutate] empate PREMIO: turno ${c.numero_turno}, ${tiePremioLead}°-${premioPair[1].posicion}° (premioEf ${Math.round(tiePremioEsperado)} c/u)`);
      } else {
        console.log('[mutate] ⚠ sin par de PREMIO con hueco — C3 quedará en skip');
      }
    } else {
      console.log('[mutate] ⚠ no se pudo armar empate (ninguna carrera con bono+par consecutivo)');
    }

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
      .select('resultado_id,inscripcion_id,posicion,no_largo,descalificado,empate').in('resultado_id', resAll.map(r => r.id));
    const resCar = Object.fromEntries(resAll.map(r => [r.id, r.carrera_id]));

    // ── Oráculo de grupos de empate — ESPEJA el agrupamiento de liquidaciones.html ──
    // grupo = corrida de finishers consecutivos con empate=true; lead = primera posición del grupo.
    // premioEf = Σ premioOracle(lead..lead+N-1) / N ; bonoEf = bono68Oracle(lead) / N.
    // Las líneas generadas usan posicion = lead para TODOS los miembros del grupo.
    const groupInfo = {};   // inscripcion_id -> { lead, n, premioEf, bonoEf }
    const possByResA = {};
    for (const p of poss) {
      if (p.posicion == null || p.descalificado || p.no_largo) continue;
      if (!possByResA[p.resultado_id]) possByResA[p.resultado_id] = [];
      possByResA[p.resultado_id].push(p);
    }
    for (const [rid, rows] of Object.entries(possByResA)) {
      rows.sort((a, b) => a.posicion - b.posicion);
      const car = carById[resCar[rid]];
      const dist = car.distribucion_premios, bolsa = car.bolsa_total;
      for (let i = 0; i < rows.length; i++) {
        const grp = [rows[i]];
        while (i + 1 < rows.length && rows[i].empate && rows[i + 1].empate &&
               rows[i + 1].posicion === rows[i].posicion + 1) grp.push(rows[++i]);
        const lead = grp[0].posicion, n = grp.length;
        let pSum = 0; for (let k = 0; k < n; k++) pSum += premioOracle(dist, bolsa, lead + k);
        const premioEf = pSum / n, bonoEf = bono68Oracle(dist, lead) / n;
        for (const g of grp) groupInfo[g.inscripcion_id] = { lead, n, premioEf, bonoEf };
      }
    }

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

    // ── B. Por cada ubicado con premio (1-5): reparto completo 70/10/10/4/3/1 + fondo 2% = 100% ──
    // premioEfectivo sale del ORÁCULO de grupos (empate-aware): un empate de premio se reparte
    // promediado (Σ premios del grupo / N). Las líneas usan posicion = lead del grupo.
    let ubic15 = 0, b1 = 0, b2 = 0, b3 = 0;
    const bad = [];
    for (const p of poss) {
      if (p.posicion == null || p.descalificado || p.no_largo) continue;
      const gi = groupInfo[p.inscripcion_id];
      const premioEf = gi ? gi.premioEf : 0;
      if (premioEf <= 0) continue; // posiciones 6-8 no tienen premio (solo bono)
      ubic15++;
      const car = carById[resCar[p.resultado_id]];
      const lines = dets.filter(d => d.inscripcion_id === p.inscripcion_id && d.posicion === gi.lead);
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

    // ── C1. Bono 6-8: línea 'bono' 100% propietario, neto. Empate → bono(lead)/N (oráculo) ──
    let bonoEsperados = 0, bonoOK = 0;
    for (const p of poss) {
      if (p.posicion == null || p.descalificado || p.no_largo) continue;
      const gi = groupInfo[p.inscripcion_id];
      const bEsperado = gi ? gi.bonoEf : 0;
      if (bEsperado <= 0) continue;
      bonoEsperados++;
      const insc = inscById[p.inscripcion_id];
      const line = dets.find(d => d.inscripcion_id === p.inscripcion_id && d.posicion === gi.lead && d.concepto_tipo === 'bono');
      if (line && near(Number(line.monto_bruto), bEsperado, 1) && Number(line.monto_descuento) === 0 &&
          line.beneficiario_tipo === 'propietario' && line.beneficiario_id === insc?.propietario_id &&
          line.liquidacion_id && liqsAfter.find(l => l.id === line.liquidacion_id)?.propietario_id === insc?.propietario_id) {
        bonoOK++;
      }
    }
    ok('C1 bono 6-8 genera línea bono (=monto, o monto/empatados), 100% propietario, neto',
       bonoEsperados > 0 && bonoOK === bonoEsperados, `ok=${bonoOK}/${bonoEsperados}`);

    // ── C2. Empate de BONO: 2 caballos comparten UN bono → cada uno 50%, suma = monto ──
    // Tras el fix, las 2 líneas de bono usan posicion = lead del grupo (no la física de cada uno).
    if (tieCarId && tieBonoInscIds.length === 2) {
      const tieLines = dets.filter(d => d.concepto_tipo === 'bono' && d.posicion === tieBonoLead &&
                                        tieBonoInscIds.includes(d.inscripcion_id));
      const dos   = tieLines.length === 2;
      const mitad = dos && tieLines.every(d => near(Number(d.monto_bruto), tieBonoMonto / 2, 1));
      const suma  = dos && near(tieLines.reduce((s, d) => s + Number(d.monto_bruto), 0), tieBonoMonto, 2);
      const props = dos && tieLines.every(d => d.beneficiario_tipo === 'propietario' && Number(d.monto_descuento) === 0);
      ok('C2 empate bono: 2 líneas bono, cada una = monto/2, suma = monto, 100% propietario neto',
         dos && mitad && suma && props,
         `lineas=${tieLines.length} c/u≈${tieBonoMonto / 2} suma≈${tieBonoMonto}`);
    } else {
      ok('C2 empate bono (setup)', false, 'no se pudo forzar el empate de bono en R5');
    }

    // ── C3. Empate de PREMIO (la plata grande): 2 caballos comparten el premio PROMEDIADO ──
    // Cada uno cobra (Σ premios del grupo)/N como premioEfectivo; el reparto 70/.../fondo se
    // aplica sobre ESE split. Verificamos: línea propietario = 70% del split, y suma TODAS = split.
    if (tiePremioLead != null && tiePremioInscIds.length === 2) {
      const propLines = tiePremioInscIds.map(id =>
        dets.find(d => d.inscripcion_id === id && d.posicion === tiePremioLead &&
                       d.concepto_tipo === 'premio' && d.beneficiario_tipo === 'propietario'));
      const dos    = propLines.every(Boolean);
      const split  = dos && propLines.every(d => near(Number(d.monto_bruto), tiePremioEsperado * 0.70, 2));
      const cien   = dos && tiePremioInscIds.every(id => {
        const ls = dets.filter(d => d.inscripcion_id === id && d.posicion === tiePremioLead);
        return near(ls.reduce((s, d) => s + Number(d.monto_bruto), 0), tiePremioEsperado, 3);
      });
      ok('C3 empate premio: cada caballo cobra premio promediado (split), reparto 70/.../fondo sobre el split',
         dos && split && cien,
         `prop c/u≈${Math.round(tiePremioEsperado * 0.70)} de split≈${Math.round(tiePremioEsperado)}`);
    } else {
      ok('C3 empate premio (setup)', false, 'no se pudo forzar el empate de premio en R5 (skip)');
    }

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
      // 3c. Restaurar el flag `empate` que flipeamos para forzar los empates (bono + premio).
      for (const t of (snapTieEmpate || [])) {
        await sb.from('resultado_posiciones').update({ empate: t.empate }).eq('id', t.id);
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
      // R4 restore del flag `empate` que flipeamos para los dead-heats forzados.
      let tieRestored = true;
      if (snapTieEmpate?.length) {
        const { data: empFin } = await sb.from('resultado_posiciones')
          .select('id,empate').in('id', snapTieEmpate.map(t => t.id));
        tieRestored = snapTieEmpate.every(t => (empFin.find(r => r.id === t.id)?.empate === true) === t.empate);
      }
      ok('R4 restore flag empate (dead-heat forzado)', tieRestored);
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
