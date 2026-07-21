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

  // Reparto NOMINAL para DISPLAY (carta de llamado, programa, inscriptos).
  // A diferencia de calcPremiosConPiso, NO aplica el piso ganancia_minima ni suma bonos:
  // la BOLSA mostrada es exactamente bolsa_total (reparto tal cual se carga). El piso sigue
  // vivo en calcPremiosConPiso, que es lo que se usa para LIQUIDAR/pagar.
  // Devuelve: { puestos: { '1': monto, ... }, total } con total = round(bolsa_total).
  function repartoDisplay(bolsaNominal, dist) {
    const bolsa = parseFloat(bolsaNominal) || 0;
    const posKeys = Object.keys(dist || {})
      .filter(k => /^\d+$/.test(k) && (parseFloat(dist[k]) || 0) > 0)
      .map(Number)
      .sort((a, b) => a - b);
    const total = Math.round(bolsa);
    const puestos = {};
    let acum = 0;
    posKeys.forEach((k, idx) => {
      if (idx < posKeys.length - 1) {
        const monto = Math.round(bolsa * (parseFloat(dist[k]) || 0) / 100);
        puestos[k] = monto;
        acum += monto;
      } else {
        // Último puesto absorbe el resto: Σ puestos === total SIEMPRE (sin drift de $1).
        puestos[k] = total - acum;
      }
    });
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
