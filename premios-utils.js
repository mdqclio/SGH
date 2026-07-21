(function (global) {
  const EXCLUIR = ['bonos','bono_ganador','bono_posicion_desde','bono_posicion_hasta','bono_posicion_monto','ganancia_minima'];

  // Calcula premios efectivos por puesto aplicando piso ganancia_minima.
  // Devuelve: { puestos: { '1': monto, '2': monto, ... }, bolsaEfectiva, deltaPiso }
  // Para carreras sin distribución cargada, devuelve bolsaEfectiva = bolsa nominal.
  function calcPremiosConPiso(bolsaNominal, dist) {
    const bolsa = parseFloat(bolsaNominal) || 0;
    const minimo = parseFloat(dist?.ganancia_minima) || 0;
    const puestos = {};
    let bolsaEfectiva = 0;
    Object.entries(dist || {}).forEach(([k, v]) => {
      if (EXCLUIR.includes(k)) return;
      const pct = parseFloat(v) || 0;
      if (pct <= 0) return;
      const calc = bolsa * pct / 100;
      const efectivo = (minimo > 0 && calc < minimo) ? minimo : calc;
      puestos[k] = efectivo;
      bolsaEfectiva += efectivo;
    });
    if (bolsaEfectiva === 0) bolsaEfectiva = bolsa;
    return { puestos, bolsaEfectiva, deltaPiso: bolsaEfectiva - bolsa };
  }

  // Reparto EFECTIVO (con piso) para DISPLAY (carta de llamado, programa, inscriptos).
  // Los montos por puesto = los EFECTIVOS que se pagan: envuelve calcPremiosConPiso, así que
  // un 4°/5° por debajo del piso ganancia_minima se MUESTRA en el piso (ej. 100.000).
  // La BOLSA mostrada = round(bolsaEfectiva) y Σ puestos ≡ total EXACTO (sin drift de $1):
  // el resto de redondeo lo absorbe el puesto de MAYOR monto (siempre por encima del piso),
  // para no desclavar los pisos de los puestos bajos. Los BONOS NO entran acá (calcPremiosConPiso
  // los excluye): van aparte como líneas condicionales (decisión de Fede).
  // Devuelve: { puestos: { '1': monto, ... }, total } con total = Σ puestos = round(bolsaEfectiva).
  function repartoDisplay(bolsaNominal, dist) {
    const { puestos: efectivos, bolsaEfectiva } = calcPremiosConPiso(bolsaNominal, dist);
    const total = Math.round(bolsaEfectiva);
    const puestos = {};
    let acum = 0, topKey = null, topVal = -Infinity;
    Object.keys(efectivos).forEach(k => {
      const monto = Math.round(efectivos[k]);
      puestos[k] = monto;
      acum += monto;
      if (efectivos[k] > topVal) { topVal = efectivos[k]; topKey = k; }
    });
    // El puesto de mayor monto absorbe el resto de redondeo → Σ puestos ≡ total, pisos intactos.
    if (topKey !== null) puestos[topKey] += total - acum;
    return { puestos, total };
  }

  // ¿El piso (ganancia_minima) es desproporcionado respecto de la bolsa?
  // Un piso > 20% de la bolsa casi siempre es un error de tipeo (se cargó la bolsa
  // entera en el campo del piso). NO bloquea: sirve para disparar un warning confirmable.
  function pisoSospechoso(gananciaMinima, bolsa) {
    const g = parseFloat(gananciaMinima) || 0;
    const b = parseFloat(bolsa) || 0;
    return b > 0 && g > b * 0.2;
  }

  global.calcPremiosConPiso = calcPremiosConPiso;
  global.repartoDisplay = repartoDisplay;
  global.pisoSospechoso = pisoSospechoso;
})(window);
