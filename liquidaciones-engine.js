/* ════════════════════════════════════════════════════════════════════════
   liquidaciones-engine.js — motor de liquidación por REUNIÓN (paid-safe)

   Fuente única de la generación de liquidaciones. Lo usan:
     - liquidaciones.html → botón "Recalcular reunión"
     - resultados.html    → oficializar_carrera / desoficializar_carrera
     - tests/probe_oficializar_carrera.mjs (real-code)

   Diseño PAID-SAFE (pay-as-you-go, confirmado Fede 2026-06-09):
     - NO bloquea si hay líneas pagadas/aprobadas. PRESERVA las líneas comprometidas
       (estado_linea='pagado' OR recibo_id IS NOT NULL) y sus headers, y recalcula SOLO
       lo no pagado desde los resultados oficiales de la reunión.
     - Idempotente: re-correr no duplica (borra lo no-pagado + regenera; lo pagado se
       saltea por clave de línea para no duplicarlo).
     - Incentivo jockey: per-reunión, una sola línea por jockey que corrió ≥1 (dedup).
       Si ya está pagada, NO se duplica ni se dropea (se preserva por clave).

   Reusa la lógica de cálculo de generarLiquidaciones() tal cual estaba (premios, bono
   ganador fundido, piso ganancia_minima, empates/dead-heat, bono 6-8, fondo solidario,
   reparto por roles + subs peón/capataz/sereno, descuentos comision_config, retención
   anti-doping 1°/2°, incentivos). NO se cambió ninguna regla de plata: solo la
   persistencia pasó de "borrar+recrear todo" a "preservar pagado + recalcular el resto".
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const DIST_FALLBACK = { '1': 60, '2': 19, '3': 12, '4': 6, '5': 3 };

  function defaultFmt(n) {
    return '$' + (Math.round((parseFloat(n) || 0) * 100) / 100)
      .toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Clave estable de una línea para el dedup paid-safe. Debe identificar la MISMA línea
  // entre dos recálculos: beneficiario + concepto_tipo + caballo/puesto + texto del concepto
  // (el concepto desambigua subs "Peón — X" y premio vs bono del mismo puesto).
  function lineKey(d) {
    return [d.beneficiario_tipo, d.beneficiario_id, d.concepto_tipo,
            d.inscripcion_id || '', d.posicion == null ? '' : d.posicion,
            d.concepto || ''].join('|');
  }

  async function recomputeHeaderTotals(sb, liqId) {
    const { data: lines } = await sb.from('liquidacion_detalle')
      .select('monto_bruto,monto_descuento').eq('liquidacion_id', liqId);
    let tb = 0, td = 0;
    for (const l of (lines || [])) {
      tb += parseFloat(l.monto_bruto) || 0;
      td += parseFloat(l.monto_descuento) || 0;
    }
    await sb.from('liquidaciones')
      .update({ total_bruto: Math.round(tb * 100) / 100, total_descuentos: Math.round(td * 100) / 100 })
      .eq('id', liqId);
  }

  /**
   * Recalcula (paid-safe) las liquidaciones de una reunión desde sus resultados oficiales.
   * @param {{ sb:object, clubId:string, reunionId:string, liqConfig?:object, comCfg?:Array, fmt?:Function }} opts
   * @returns {Promise<{created:number, headers:number, preserved:number, error?:string}>}
   */
  async function generarLiquidacionesReunion(opts) {
    const sb = opts.sb;
    const clubId = opts.clubId;
    const rid = opts.reunionId;
    const fmt = opts.fmt || defaultFmt;
    if (!rid) return { created: 0, headers: 0, preserved: 0, error: 'sin reunión' };

    // Config de reparto (la pasa la página; si no, la carga el motor).
    let liqConfig = opts.liqConfig;
    if (!liqConfig) {
      const { data } = await sb.from('liquidacion_config')
        .select('*').eq('club_id', clubId).eq('activo', true).maybeSingle();
      liqConfig = data;
    }
    if (!liqConfig) return { created: 0, headers: 0, preserved: 0, error: 'sin liquidacion_config' };

    // ── Cargar datos de la reunión ───────────────────────────────────────
    const [{ data: cars }, comCfgRes, { data: reunionRow }] = await Promise.all([
      sb.from('carreras').select('id,numero_turno,numero_carrera_programa,bolsa_total,distribucion_premios').eq('reunion_id', rid),
      opts.comCfg ? Promise.resolve({ data: opts.comCfg })
                  : sb.from('comision_config').select('*').eq('club_id', clubId).eq('activo', true),
      sb.from('reuniones').select('fecha').eq('id', rid).single(),
    ]);
    const comCfg = comCfgRes.data || [];
    const carIds = (cars || []).map(c => c.id);
    if (!carIds.length) return { created: 0, headers: 0, preserved: 0, error: 'la reunión no tiene carreras' };

    const [{ data: results }, { data: inscs }] = await Promise.all([
      sb.from('resultados').select('id,carrera_id').in('carrera_id', carIds).eq('estado', 'oficial'),
      sb.from('inscripciones').select('*').in('carrera_id', carIds).neq('estado', 'forfait'),
    ]);
    const resIds = (results || []).map(r => r.id);

    const { data: poss } = resIds.length
      ? await sb.from('resultado_posiciones').select('*')
          .in('resultado_id', resIds).not('posicion', 'is', null).eq('descalificado', false)
      : { data: [] };

    // ── Fechas / pcts / incentivos (idéntico a generarLiquidaciones) ─────
    const diasAntidoping = parseInt(liqConfig.dias_antidoping) || 30;
    let fechaLiberacion = null;
    if (reunionRow?.fecha) {
      const d = new Date(reunionRow.fecha + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + diasAntidoping);
      fechaLiberacion = d.toISOString().slice(0, 10);
    }
    const PCTS = {
      propietario: parseFloat(liqConfig.pct_propietario) / 100,
      entrenador:  parseFloat(liqConfig.pct_entrenador)  / 100,
      jockey:      parseFloat(liqConfig.pct_jockey)      / 100,
      peon:        parseFloat(liqConfig.pct_peon)        / 100,
      capataz:     parseFloat(liqConfig.pct_capataz)     / 100,
      sereno:      parseFloat(liqConfig.pct_sereno)      / 100,
    };
    const fondoPct  = parseFloat(liqConfig.pct_fondo_solidario)        || 0;
    const incJockey = parseFloat(liqConfig.incentivo_jockey_monto)     || 0;
    const incEntr   = parseFloat(liqConfig.incentivo_entrenador_monto) || 0;

    const calcPremio = (car, posicion) => {
      const dist = car.distribucion_premios || DIST_FALLBACK;
      const pct = dist[String(posicion)];
      if (!pct) return 0;
      let p = parseFloat(car.bolsa_total) * pct / 100;
      if (posicion === 1 && dist.bono_ganador) p += parseFloat(dist.bono_ganador);
      const minimo = parseFloat(dist.ganancia_minima) || 0;
      return minimo > 0 && p < minimo ? minimo : p;
    };
    const calcBono68 = (car, posicion) => {
      const dist = car.distribucion_premios || DIST_FALLBACK;
      if (dist.bono_posicion_desde && dist.bono_posicion_hasta && dist.bono_posicion_monto &&
          posicion >= dist.bono_posicion_desde && posicion <= dist.bono_posicion_hasta) {
        return parseFloat(dist.bono_posicion_monto);
      }
      return 0;
    };

    // ── actorMap (idéntico a generarLiquidaciones) ───────────────────────
    const actorMap = {};
    const addActor = (id, tipo, item) => {
      if (!id) return;
      if (!actorMap[id]) actorMap[id] = { tipo, items: [] };
      actorMap[id].items.push(item);
    };

    const possByRes = {};
    for (const pos of (poss || [])) {
      (possByRes[pos.resultado_id] ??= []).push(pos);
    }

    for (const res of (results || [])) {
      const car = (cars || []).find(c => c.id === res.carrera_id);
      if (!car) continue;
      const carPoss = possByRes[res.id] || [];
      const ordered = [...carPoss].filter(p => p.posicion != null).sort((a, b) => a.posicion - b.posicion);
      const groups = [];
      for (let i = 0; i < ordered.length; i++) {
        const grp = [ordered[i]];
        while (i + 1 < ordered.length && ordered[i].empate && ordered[i + 1].empate &&
               ordered[i + 1].posicion === ordered[i].posicion + 1) {
          grp.push(ordered[++i]);
        }
        groups.push(grp);
      }
      for (const poses of groups) {
        const posNum = poses[0].posicion;
        let premioEfectivo;
        if (poses.length > 1) {
          let sum = 0;
          for (let i = 0; i < poses.length; i++) sum += calcPremio(car, posNum + i);
          premioEfectivo = sum / poses.length;
        } else {
          premioEfectivo = calcPremio(car, posNum);
        }
        const bono68 = calcBono68(car, posNum);
        if (!premioEfectivo && !bono68) continue;
        const bono68Efectivo = poses.length > 1 ? bono68 / poses.length : bono68;
        const nroCarrera = car.numero_carrera_programa ?? car.numero_turno ?? '';
        const conceptoBase = `Carrera ${nroCarrera} — ${posNum}° puesto`;
        const bolsaFmt = fmt(premioEfectivo);
        for (const pos of poses) {
          const insc = (inscs || []).find(i => i.id === pos.inscripcion_id);
          if (!insc) continue;
          if (premioEfectivo > 0) {
            const subs = [
              { nombre: insc.peon,    rol: 'Peón',    pct: PCTS.peon },
              { nombre: insc.capataz, rol: 'Capataz', pct: PCTS.capataz },
              { nombre: insc.sereno,  rol: 'Sereno',  pct: PCTS.sereno },
            ].filter(s => s.nombre && s.nombre.trim());
            addActor(insc.propietario_id, 'propietario', {
              premio: premioEfectivo, pct: PCTS.propietario, subs: [], conceptoTipo: 'premio',
              concepto: conceptoBase, descripcion: `${conceptoBase} — Propietario (bolsa: ${bolsaFmt})`,
              posicion: posNum, inscripcion_id: insc.id, carrera_id: car.id,
            });
            addActor(insc.entrenador_id, 'entrenador', {
              premio: premioEfectivo, pct: PCTS.entrenador, subs, conceptoTipo: 'premio',
              concepto: conceptoBase, descripcion: `${conceptoBase} — Entrenador (bolsa: ${bolsaFmt})`,
              posicion: posNum, inscripcion_id: insc.id, carrera_id: car.id,
            });
            addActor(insc.jockey_titular_id, 'jockey', {
              premio: premioEfectivo, pct: PCTS.jockey, subs: [], conceptoTipo: 'premio',
              concepto: conceptoBase, descripcion: `${conceptoBase} — Jockey (bolsa: ${bolsaFmt})`,
              posicion: posNum, inscripcion_id: insc.id, carrera_id: car.id,
            });
            if (fondoPct > 0) {
              addActor(clubId, 'club', {
                premio: premioEfectivo, pct: fondoPct / 100, subs: [], conceptoTipo: 'fondo_solidario',
                concepto: `${conceptoBase} — Fondo solidario`,
                descripcion: `Fondo solidario ${fondoPct}% (premio: ${bolsaFmt})`,
                posicion: posNum, inscripcion_id: insc.id, carrera_id: car.id,
              });
            }
          }
          if (bono68Efectivo > 0) {
            const empateNota = poses.length > 1 ? `, empate ${poses.length} (${fmt(bono68)}/${poses.length})` : '';
            addActor(insc.propietario_id, 'propietario', {
              premio: bono68Efectivo, pct: 1, subs: [], conceptoTipo: 'bono',
              concepto: `Carrera ${nroCarrera} — Bono ${posNum}° puesto`,
              descripcion: `Bono ${posNum}° puesto (100% propietario${empateNota}): ${fmt(bono68Efectivo)}`,
              posicion: posNum, inscripcion_id: insc.id, carrera_id: car.id,
            });
          }
        }
      }
    }

    // INCENTIVOS (Bloque C) — idéntico a generarLiquidaciones (jockey per-reunión dedup,
    // entrenador per-caballo). Las líneas de incentivo no llevan carrera_id (per-reunión).
    if (incJockey > 0 || incEntr > 0) {
      const { data: largaron } = resIds.length
        ? await sb.from('resultado_posiciones').select('inscripcion_id')
            .in('resultado_id', resIds).eq('no_largo', false)
        : { data: [] };
      const jockeysSet = new Set();
      for (const lp of (largaron || [])) {
        const insc = (inscs || []).find(i => i.id === lp.inscripcion_id);
        if (!insc || insc.estado !== 'ratificado') continue;
        if (incJockey > 0 && insc.jockey_titular_id) jockeysSet.add(insc.jockey_titular_id);
        if (incEntr > 0 && insc.entrenador_id) {
          addActor(insc.entrenador_id, 'entrenador', {
            premio: incEntr, pct: 1, subs: [], conceptoTipo: 'incentivo_entrenador',
            concepto: 'Incentivo entrenador',
            descripcion: `Incentivo entrenador por caballo corrido: ${fmt(incEntr)}`,
            posicion: null, inscripcion_id: insc.id, carrera_id: null,
          });
        }
      }
      if (incJockey > 0) for (const jid of jockeysSet) {
        addActor(jid, 'jockey', {
          premio: incJockey, pct: 1, subs: [], conceptoTipo: 'incentivo_jockey',
          concepto: 'Incentivo jockey',
          descripcion: `Incentivo jockey por actuación en la reunión: ${fmt(incJockey)}`,
          posicion: null, inscripcion_id: null, carrera_id: null,
        });
      }
    }

    // ── PERSISTENCIA PAID-SAFE ───────────────────────────────────────────
    // 1. Cargar headers + líneas existentes de la reunión (preservar pagado, reusar headers).
    const { data: existingLiqs } = await sb.from('liquidaciones')
      .select('id, profesional_id, propietario_id, estado, ' +
              'liquidacion_detalle(id,estado_linea,recibo_id,beneficiario_tipo,beneficiario_id,' +
              'concepto,concepto_tipo,inscripcion_id,posicion)')
      .eq('reunion_id', rid).eq('club_id', clubId);

    const headerByActor = {};   // actorId -> header row
    const paidKeys = new Set(); // claves de líneas comprometidas (no regenerar)
    const paidCountByHeader = {};
    let preserved = 0;
    for (const h of (existingLiqs || [])) {
      const aid = h.propietario_id || h.profesional_id || clubId;
      headerByActor[aid] = h;
      paidCountByHeader[h.id] = 0;
      for (const d of (h.liquidacion_detalle || [])) {
        if (d.estado_linea === 'pagado' || d.recibo_id != null) {
          paidKeys.add(lineKey(d));
          paidCountByHeader[h.id]++;
          preserved++;
        }
      }
    }

    // 2. Borrar SOLO las líneas no comprometidas (recibo_id null AND estado != 'pagado').
    //    Lo pagado se preserva; retenido sin recibo se recalcula.
    const allHeaderIds = (existingLiqs || []).map(h => h.id);
    if (allHeaderIds.length) {
      await sb.from('liquidacion_detalle').delete()
        .in('liquidacion_id', allHeaderIds)
        .is('recibo_id', null)
        .neq('estado_linea', 'pagado');
    }

    // 3. Construir líneas nuevas por actor (idéntico cálculo de detalleRows), saltear las
    //    que coincidan con una línea ya pagada, y adjuntarlas al header (reusado o nuevo).
    let created = 0;
    const survivingHeaderIds = new Set();
    for (const [actorId, actorData] of Object.entries(actorMap)) {
      const cfg = (comCfg || []).find(c => c.tipo_profesional === actorData.tipo || c.tipo_profesional === 'ambos');
      const descPct = ((cfg?.descuento_fondo_solidario_pct || 0) + (cfg?.descuento_incentivo_pct || 0));
      const bTipo = actorData.tipo === 'propietario' ? 'propietario'
                  : actorData.tipo === 'club'        ? 'club'
                  : 'profesional';
      const detalleRows = [];
      for (const item of actorData.items) {
        const bruto = item.premio * item.pct;
        const aplicaDesc = item.conceptoTipo === 'premio';
        const desc = aplicaDesc ? bruto * descPct / 100 : 0;
        const retenido = item.conceptoTipo === 'premio' && (item.posicion === 1 || item.posicion === 2);
        detalleRows.push({
          concepto: item.concepto, descripcion: item.descripcion,
          monto_bruto: bruto, porcentaje_desc: aplicaDesc ? (descPct || null) : null, monto_descuento: desc,
          concepto_tipo: item.conceptoTipo, posicion: item.posicion,
          inscripcion_id: item.inscripcion_id, carrera_id: item.carrera_id ?? null,
          beneficiario_tipo: bTipo, beneficiario_id: actorId, reunion_id: rid,
          estado_linea: retenido ? 'retenido' : 'impago',
          fecha_liberacion: retenido ? fechaLiberacion : null,
        });
        for (const sub of (item.subs || [])) {
          const sb2 = item.premio * sub.pct;
          const sd2 = sb2 * descPct / 100;
          detalleRows.push({
            concepto: `${sub.rol} — ${sub.nombre}`,
            descripcion: `${item.concepto} — A redistribuir (${Math.round(sub.pct * 100)}%)`,
            monto_bruto: sb2, porcentaje_desc: descPct || null, monto_descuento: sd2,
            concepto_tipo: 'actuacion', posicion: item.posicion,
            inscripcion_id: item.inscripcion_id, carrera_id: item.carrera_id ?? null,
            beneficiario_tipo: 'profesional', beneficiario_id: actorId, reunion_id: rid,
            estado_linea: retenido ? 'retenido' : 'impago',
            fecha_liberacion: retenido ? fechaLiberacion : null,
          });
        }
      }
      // Saltear las líneas que ya existen pagadas (no duplicar lo comprometido).
      const freshRows = detalleRows.filter(d => !paidKeys.has(lineKey(d)));

      let header = headerByActor[actorId];
      if (!header) {
        if (!freshRows.length) continue;
        const liqPayload = {
          club_id: clubId, reunion_id: rid, estado: 'borrador',
          total_bruto: 0, total_descuentos: 0,
        };
        if (actorData.tipo === 'propietario') liqPayload.propietario_id = actorId;
        else if (actorData.tipo !== 'club')   liqPayload.profesional_id = actorId;
        const { data: liqData, error } = await sb.from('liquidaciones').insert(liqPayload).select().single();
        if (error) { console.error('[engine] crear liquidación:', error); continue; }
        header = liqData;
        headerByActor[actorId] = liqData;
        paidCountByHeader[header.id] = 0;
        created++;
      }
      survivingHeaderIds.add(header.id);
      if (freshRows.length) {
        const offset = paidCountByHeader[header.id] || 0;
        const dRows = freshRows.map((d, i) => ({ ...d, liquidacion_id: header.id, orden_display: offset + i + 1 }));
        const { error: detErr } = await sb.from('liquidacion_detalle').insert(dRows);
        if (detErr) console.error('[engine] insertar detalle:', detErr);
      }
    }

    // 4. Recomputar totales de todos los headers tocados/sobrevivientes; borrar los vacíos.
    let headers = 0;
    for (const h of (existingLiqs || [])) survivingHeaderIds.add(h.id); // recompute todos los existentes
    for (const hid of survivingHeaderIds) {
      const { count } = await sb.from('liquidacion_detalle')
        .select('id', { count: 'exact', head: true }).eq('liquidacion_id', hid);
      if (!count) {
        await sb.from('liquidaciones').delete().eq('id', hid);
      } else {
        await recomputeHeaderTotals(sb, hid);
        headers++;
      }
    }

    return { created, headers, preserved };
  }

  global.generarLiquidacionesReunion = generarLiquidacionesReunion;
  global.lineKey = global.lineKey || lineKey;
})(typeof window !== 'undefined' ? window : globalThis);
