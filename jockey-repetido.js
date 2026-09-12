/**
 * Jockey repetido dentro de una misma carrera — AVISO, no bloqueo.
 *
 * Pedido de Yesi (12/09/2026): que se vea cuando un jockey ya está cargado en
 * otro caballo del mismo turno. Es aviso y no bloqueo porque en la inscripción
 * es normal declarar el mismo jockey en dos o tres caballos (el compromiso de
 * monta se cierra en la ratificación — Fede 25/08/2026), y porque después de la
 * carrera el jockey puede quedar en un caballo que no largó mientras se lo carga
 * en el que sí corrió (R8 T5, Aguirre: NOCHE EN VELA no largó, LA LAGUNERA J
 * se cargó al día siguiente). Un bloqueo rompería los dos flujos. Relevamiento:
 * docs/diagnosticos/2026-09-12_jockey-repetido-misma-carrera.md (reports).
 *
 * Sólo cuentan las inscripciones ACTIVAS: 'inscripto' y 'ratificado'. Un forfait
 * o un mal inscripto con el mismo jockey no es colisión — el aviso anterior de
 * ratificacion.html los contaba, y 7 de los 8 casos históricos eran eso.
 *
 * @param {Array} inscripciones  Objetos con { jockey_titular_id, estado } del
 *                               MISMO turno (el que llama filtra por carrera).
 * @returns {Object}  Mapa { jockey_titular_id: cantidad } sólo sobre activos.
 */
const ESTADOS_ACTIVOS_MONTA = ['inscripto', 'ratificado'];

function conteoJockeysActivos(inscripciones) {
  const conteo = {};
  (inscripciones || []).forEach(i => {
    if (!i || !i.jockey_titular_id) return;
    if (!ESTADOS_ACTIVOS_MONTA.includes(i.estado)) return;
    conteo[i.jockey_titular_id] = (conteo[i.jockey_titular_id] || 0) + 1;
  });
  return conteo;
}

/**
 * Set de jockey_titular_id que aparecen en 2+ inscripciones activas del turno.
 */
function jockeysRepetidos(inscripciones) {
  const conteo = conteoJockeysActivos(inscripciones);
  return new Set(Object.keys(conteo).filter(id => conteo[id] >= 2));
}

/**
 * Badge HTML del aviso. Mismo texto y clase en las cuatro pantallas
 * (inscripciones, portal, ratificación, Montas).
 */
function badgeJockeyDup(cantidad) {
  const n = cantidad >= 2 ? ` ×${cantidad}` : '';
  return `<span class="badge-jockey-dup" title="Este jockey ya está cargado en otro caballo de este turno. Es un aviso: no bloquea.">⚠ dup.${n}</span>`;
}
