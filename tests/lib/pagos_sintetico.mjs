/**
 * pagos_sintetico.mjs — reunión SINTÉTICA para los probes del tab Pagos (02/10/2026).
 *
 * Hasta el 02/10 probe_pagos_carrera_busqueda / _vista_carrera / _vista_incentivo_pagados armaban sus casos
 * con lo que en ese momento era pagable en R9: cada cobro de Valeria los rompía (el 02/10, 31 recibos →
 * quedaron 5 tarjetas, 0 incentivos de jockey impagos, el recibo de referencia pasó a transferencia).
 * Esta reunión trae, fijos, todos los casos que esas reglas necesitan. Nombres inventados (SINT / FICTICIO),
 * documentos cortos que no son DNI.
 *
 * Carreras (nº programa · turno): 1·1 (estado NULL), [T2 anulada], 2·3, 3·4, 4·5, [T6 anulada], 5·7, 6·8, 7·9 (sin resultado).
 * Casos:
 *   · Carrera 5: un caballo con los tres roles impagos (+ peón del entrenador), uno con la MISMA persona propietario y
 *     entrenador, uno todo pagado (transferencia + efectivo + regularizado), uno que no largó, uno forfait.
 *   · Incentivos de jockey (uno por reunión, sin inscripción ni carrera): J2 largó en 1 y 5 (dueña 1, nota en 5), J3 sólo en 5
 *     (dueña 5), J4 largó en 3 y fue NL en 4, JN largó en 1/2/4/6 y NL en 5, J5 largó en 2 y 5 y su incentivo está PAGADO
 *     por transferencia.
 *   · Búsqueda: entrenador con nombre compuesto + homónimo sin plata, jockey con Ñ, caballeriza con Ñ y espacios, caballeriza
 *     sin espacios, propietario provisorio sin documento con nombre de caballeriza.
 *   · Ruido que NO tiene que verse: una línea de otro club, una de una reunión sandbox (es_prueba), una retenida.
 *   · ≥ 10 beneficiarios con deuda pagable (modo tarjetas).
 */
export const RS = 'sint-reunion-pagos';
export const RP = 'sint-reunion-prueba';

export const REL_PAGOS = {
  liquidaciones: { uno: 'liquidacion_id' },
  recibos: { uno: 'recibo_id' },
  caballerizas: { uno: 'caballeriza_id' },
  spcs: { uno: 'spc_id' },
  carreras: { uno: 'carrera_id' },
  resultado_posiciones: { muchos: 'inscripcion_id' },
};

export function reunionPagosSintetica(CLUB_ID) {
  const T = {
    clubs: [{ id: CLUB_ID, nombre: 'Hipódromo Sintético', domicilio: 'Calle Falsa 123', localidad: 'Ciudad', provincia: 'Buenos Aires', logo_url: null }],
    reuniones: [
      { id: RS, club_id: CLUB_ID, es_prueba: false, fecha: '2099-03-01' },
      { id: RP, club_id: CLUB_ID, es_prueba: true, fecha: '2099-03-02' },
    ],
    profesionales: [], propietarios: [], caballerizas: [], caballeriza_responsables: [], spcs: [],
    carreras: [], inscripciones: [], resultado_posiciones: [], liquidaciones: [], liquidacion_detalle: [], recibos: [],
  };
  const prof = (id, apellido, nombre, tipo, doc) => T.profesionales.push({ id, apellido, nombre, tipo, documento_nro: doc, club_id: CLUB_ID });
  prof('e1', 'FICTICIO', 'ENTRENADOR UNO', 'entrenador', 'D-901');
  prof('e1h', 'FICTICIO', 'OTRO SINPLATA', 'entrenador', 'D-902');
  prof('e2', 'SINTETICO', 'ENTRENADOR DOS', 'entrenador', 'D-903');
  prof('jN', 'MUÑOZPRUEBA', 'JOCKEY', 'jockey', 'D-904');
  prof('j2', 'SINTETICO', 'DOSMONTAS', 'jockey', 'D-905');
  prof('j3', 'SINTETICO', 'UNAMONTA', 'jockey', 'D-906');
  prof('j4', 'SINTETICO', 'NOLARGO', 'jockey', 'D-907');
  prof('j5', 'SINTETICO', 'PAGADO', 'jockey', 'D-908');
  prof('pd', 'SINTETICO', 'DOBLE', 'entrenador', 'D-909');
  const prop = (id, nombre, doc) => T.propietarios.push({ id, nombre, nombre_stud: null, documento_nro: doc, activo: true });
  prop('p1', 'PROPIETARIO FICTICIO UNO', 'D-910');
  prop('p2', 'STUD PROVISORIO EJEMPLO', null);          // provisorio: sin documento, nombre de caballeriza
  prop('pdP', 'SINTETICO, DOBLE', 'D-911');              // la misma persona que el entrenador pd
  prop('p4', 'PROPIETARIO FICTICIO PYP', 'D-912');
  ['CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'].forEach((n, k) => prop(`p${k + 5}`, `PROPIETARIO SINT ${n}`, `D-91${k + 3}`));
  const cab = (id, nombre, propietario_id) => {
    T.caballerizas.push({ id, nombre });
    T.caballeriza_responsables.push({ id: `cr-${id}`, caballeriza_id: id, propietario_id, rol: 'propietario', activo: true });
  };
  cab('cab1', 'LA CAÑADA FICTICIA', 'p1');
  cab('cab2', 'STUD PROVISORIO EJEMPLO', 'p2');
  cab('cab4', 'PYPFICTICIA', 'p4');

  const carr = (id, numero_turno, numero_carrera_programa, estado) => T.carreras.push({ id, reunion_id: RS, numero_turno, numero_carrera_programa, estado });
  carr('c1', 1, 1, null); carr('c2a', 2, null, 'anulada'); carr('c2', 3, 2, 'confirmada'); carr('c3', 4, 3, 'abierta');
  carr('c4', 5, 4, 'abierta'); carr('c6a', 6, null, 'anulada'); carr('c5', 7, 5, 'confirmada'); carr('c6', 8, 6, 'abierta');
  carr('c7', 9, 7, 'abierta');
  T.carreras.push({ id: 'cP', reunion_id: RP, numero_turno: 1, numero_carrera_programa: 1, estado: null });
  for (const c of [...T.carreras]) T.liquidaciones.push({ id: `liq-${c.id}`, club_id: CLUB_ID, carrera_id: c.id, reunion_id: c.reunion_id });
  T.liquidaciones.push({ id: 'liq-otro', club_id: 'otro-club', carrera_id: 'c5', reunion_id: RS });

  // inscripción: [id, carrera, caballo, propietario, entrenador, jockey, partidor, posicion | 'NL' | null (sin resultado), estado]
  const ins = (id, carrera_id, caballo, propietario_id, entrenador_id, jockey_titular_id, numero_partidor, pos, estado = 'ratificado') => {
    T.spcs.push({ id: `spc-${id}`, nombre: caballo });
    T.inscripciones.push({ id, carrera_id, spc_id: `spc-${id}`, propietario_id, entrenador_id, jockey_titular_id, numero_partidor, estado });
    if (pos !== null) T.resultado_posiciones.push({ id: `rp-${id}`, inscripcion_id: id, posicion: pos === 'NL' ? null : pos, no_largo: pos === 'NL' });
  };
  ins('i11', 'c1', 'SINT ALFA', 'p5', 'e2', 'j2', 2, 1);
  ins('i12', 'c1', 'SINT BETA', 'p6', 'e2', 'jN', 1, 2);
  ins('i21', 'c2', 'SINT GAMA', 'p7', 'e1', 'j5', 1, 1);
  ins('i22', 'c2', 'SINT DELTA', 'p8', 'e2', 'jN', 2, 2);
  ins('i31', 'c3', 'SINT EPSILON', 'p9', 'e1', 'j4', 1, 1);
  ins('i41', 'c4', 'SINT ZETA', 'p1', 'e1', 'j4', 1, 'NL');
  ins('i42', 'c4', 'SINT ETA', 'p2', 'e2', 'jN', 3, 1);
  ins('i43', 'c4', 'SINT TITA', 'p4', 'e2', null, 2, 2);
  ins('i51', 'c5', 'SINT IOTA', 'p1', 'e1', 'j3', 4, 1);      // tres roles; gatera 4 pero llegó 1°
  ins('i52', 'c5', 'SINT KAPA', 'pdP', 'pd', 'j2', 1, 2);     // misma persona propietario y entrenador
  ins('i53', 'c5', 'SINT LAMBDA', 'p5', 'e2', 'j5', 2, 3);    // todo pagado
  ins('i54', 'c5', 'SINT MU', 'p6', 'e2', 'jN', 3, 'NL');     // no largó, sin deuda
  ins('i55', 'c5', 'SINT NU', 'p7', 'e1', 'jN', 5, null, 'forfait');
  ins('i61', 'c6', 'SINT XI', 'p8', 'e1', 'jN', 1, 1);
  ins('i71', 'c7', 'SINT OMICRON', 'p9', 'e2', 'jN', 1, null);
  ins('i72', 'c7', 'SINT PI', 'p4', 'e1', 'j2', 2, null);
  ins('iP1', 'cP', 'SINT RHO', 'p9', 'e2', 'jN', 1, 1);

  const rec = (id, numero_recibo, forma_pago, estado = 'emitido') => T.recibos.push({ id, numero_recibo, forma_pago, estado, club_id: CLUB_ID });
  rec('r901', 901, 'efectivo'); rec('r902', 902, 'transferencia'); rec('r903', 903, 'efectivo'); rec('r905', 905, 'transferencia');

  let n = 0;
  const linea = (o) => T.liquidacion_detalle.push({
    id: `ld-${++n}`, reunion_id: RS, inscripcion_id: null, carrera_id: null, estado_linea: 'impago', recibo_id: null,
    concepto_tipo: 'premio', posicion: null, ...o,
  });
  const nroDe = cid => T.carreras.find(c => c.id === cid).numero_carrera_programa;
  // premio de los tres roles de una inscripción; estados: { Propietario: 'impago' | 'retenido' | 'regularizado' | 'r90x' | null }
  const premios = (iid, monto, est = {}) => {
    const i = T.inscripciones.find(x => x.id === iid);
    const pos = T.resultado_posiciones.find(r => r.inscripcion_id === iid)?.posicion;
    const base = `Carrera ${nroDe(i.carrera_id)} — ${pos}° puesto`;
    const roles = [['Propietario', 'propietario', i.propietario_id, 1], ['Entrenador', 'profesional', i.entrenador_id, 0.2], ['Jockey', 'profesional', i.jockey_titular_id, 0.15]];
    for (const [rol, tipo, bid, f] of roles) {
      const e = est[rol] === undefined ? 'impago' : est[rol];
      if (!bid || e === null) continue;
      linea({
        liquidacion_id: `liq-${i.carrera_id}`, beneficiario_tipo: tipo, beneficiario_id: bid, inscripcion_id: iid, carrera_id: i.carrera_id,
        concepto: base, descripcion: `${base} — ${rol} (bolsa: $100.000,00)`, posicion: pos, monto_neto: (monto * f).toFixed(2),
        estado_linea: e === 'impago' || e === 'retenido' ? e : 'pagado', recibo_id: /^r\d/.test(e) ? e : null,
      });
    }
  };
  premios('i11', 100000, { Propietario: 'retenido' });   // 1° con antidoping pendiente: la línea del propietario queda retenida
  premios('i12', 50000, { Entrenador: 'regularizado' });
  premios('i21', 100000, { Propietario: 'r901' });
  premios('i22', 50000);
  premios('i31', 100000);
  premios('i42', 100000);
  premios('i43', 50000, { Jockey: null });
  premios('i51', 100000);
  premios('i52', 50000);
  premios('i53', 30000, { Propietario: 'r902', Entrenador: 'r903', Jockey: 'regularizado' });
  premios('i61', 100000, { Entrenador: null, Jockey: null });
  premios('iP1', 100000, { Entrenador: null, Jockey: null });
  T.liquidacion_detalle.filter(l => l.inscripcion_id === 'iP1').forEach(l => { l.reunion_id = RP; l.liquidacion_id = 'liq-cP'; l.carrera_id = 'cP'; });
  // bono del 1° (propietario) e incentivo de entrenador por caballo corrido, en la carrera 5
  linea({ liquidacion_id: 'liq-c5', beneficiario_tipo: 'propietario', beneficiario_id: 'p1', inscripcion_id: 'i51', carrera_id: 'c5', concepto_tipo: 'bono',
          concepto: 'Bono 1° puesto', descripcion: 'Bono 1° puesto (100% propietario): $20.000,00', posicion: 1, monto_neto: '20000.00' });
  linea({ liquidacion_id: 'liq-c5', beneficiario_tipo: 'profesional', beneficiario_id: 'e1', inscripcion_id: 'i51', carrera_id: null, concepto_tipo: 'incentivo_entrenador',
          concepto: 'Incentivo entrenador', descripcion: 'Incentivo entrenador por caballo corrido: $10.000,00', monto_neto: '10000.00' });
  linea({ liquidacion_id: 'liq-c5', beneficiario_tipo: 'profesional', beneficiario_id: 'e1', inscripcion_id: 'i51', carrera_id: 'c5', concepto_tipo: 'actuacion',
          concepto: 'Peón', descripcion: 'Carrera 5 — 1° puesto — Peón: (sin nombre cargado) — A redistribuir (4%)', posicion: 1, monto_neto: '4000.00' });
  // línea histórica de premio SIN inscripción (puerta 2: sólo carrera_id)
  linea({ liquidacion_id: 'liq-c2', beneficiario_tipo: 'propietario', beneficiario_id: 'p8', carrera_id: 'c2', concepto: 'Carrera 2 — 3° puesto',
          descripcion: 'Carrera 2 — 3° puesto — Propietario (bolsa: $100.000,00)', posicion: 3, monto_neto: '8000.00' });
  // incentivos de jockey: por reunión, sin inscripción ni carrera
  for (const [j, e] of [['j2', 'impago'], ['j3', 'impago'], ['j4', 'impago'], ['jN', 'impago'], ['j5', 'r905']]) {
    linea({ liquidacion_id: 'liq-c1', beneficiario_tipo: 'profesional', beneficiario_id: j, concepto_tipo: 'incentivo_jockey', concepto: 'Incentivo jockey',
            descripcion: 'Incentivo jockey por actuación en la reunión: $60.000,00', monto_neto: '60000.00',
            estado_linea: e === 'impago' ? 'impago' : 'pagado', recibo_id: e === 'impago' ? null : e });
  }
  // fondo solidario (club): nunca llega a Pagos
  linea({ liquidacion_id: 'liq-c5', beneficiario_tipo: 'club', beneficiario_id: CLUB_ID, inscripcion_id: 'i51', carrera_id: 'c5', concepto_tipo: 'fondo_solidario',
          concepto: 'Fondo solidario', descripcion: 'Fondo solidario 2% (premio: $100.000,00)', monto_neto: '2000.00' });
  // de OTRO club, colgada de la misma carrera: no tiene que verse en ningún lado (ISSUE-060)
  linea({ liquidacion_id: 'liq-otro', beneficiario_tipo: 'propietario', beneficiario_id: 'p1', inscripcion_id: 'i51', carrera_id: 'c5',
          concepto: 'Carrera 5 — 1° puesto', descripcion: 'Carrera 5 — 1° puesto — Propietario (bolsa: $1,00)', posicion: 1, monto_neto: '777.00' });
  return T;
}

/**
 * Recibo sintético para el impreso (probe_recibo_una_hoja / render_recibo_pdf --fixture). Las líneas tienen el largo típico
 * de un recibo real de propietario (concepto "Carrera N — P° puesto", caballo de 2 palabras) y el logo del sitio (el alto del
 * encabezado depende de él): el layout se mide con éstas, no con el recibo que haya hoy. `forma` = 'efectivo' (firma/aclaración/DNI) o 'transferencia' (sin firma, comprobante).
 */
export function reciboSintetico(CLUB_ID, { lineas = 4, forma = 'efectivo', logo_url = 'https://sigh.com.ar/logo-dolores-verde.png' } = {}) {
  const T = reunionPagosSintetica(CLUB_ID);
  T.clubs[0].logo_url = logo_url;
  const cabs = ['SINT ALFA', 'SINT BETA', 'SINT GAMA', 'SINT DELTA'];
  const ids = [];
  for (let k = 0; k < lineas; k++) {
    const c = T.carreras.filter(x => x.reunion_id === RS && x.numero_carrera_programa)[k % 7];
    const iid = `irec-${k}`;
    T.spcs.push({ id: `spc-${iid}`, nombre: cabs[k % cabs.length] });
    T.inscripciones.push({ id: iid, carrera_id: c.id, spc_id: `spc-${iid}`, estado: 'ratificado' });
    const tipo = k % 4 === 3 ? 'bono' : 'premio';
    const pos = (k % 3) + 1;
    T.liquidacion_detalle.push({ id: `ldrec-${k}`, reunion_id: RS, inscripcion_id: iid, carrera_id: c.id, beneficiario_tipo: 'propietario', beneficiario_id: 'p1',
      concepto_tipo: tipo, posicion: pos, concepto: tipo === 'bono' ? `Bono ${pos}° puesto` : `Carrera ${c.numero_carrera_programa} — ${pos}° puesto`,
      descripcion: tipo === 'bono' ? `Bono ${pos}° puesto (100% propietario)` : `Carrera ${c.numero_carrera_programa} — ${pos}° puesto — Propietario (bolsa: $3.000.000,00)`,
      monto_neto: (123456.78 * (k + 1)).toFixed(2), estado_linea: 'pagado', recibo_id: 'rrec' });
    ids.push(`ldrec-${k}`);
  }
  const total = T.liquidacion_detalle.filter(l => l.recibo_id === 'rrec').reduce((s, l) => s + +l.monto_neto, 0);
  const recibo = { id: 'rrec', numero_recibo: 1234, club_id: CLUB_ID, forma_pago: forma, estado: 'emitido', propietario_id: 'p1', profesional_id: null,
    total_premios: total.toFixed(2), total_descuentos: '0.00', neto_a_cobrar: total.toFixed(2),
    cobrador_nombre: forma === 'efectivo' ? 'RETIRA, TERCERO FICTICIO' : 'PROPIETARIO FICTICIO UNO', cobrador_documento: 'D-000',
    comprobante_url: forma === 'transferencia' ? 'comprobante-sintetico.pdf' : null };
  T.recibos.push(recibo);
  return { tablas: T, recibo, lineaIds: ids, cobBenef: { tipo: 'propietario', id: 'p1', nombre: 'PROPIETARIO FICTICIO UNO' } };
}
