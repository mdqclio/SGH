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

  global.calcPremiosConPiso = calcPremiosConPiso;
})(window);
