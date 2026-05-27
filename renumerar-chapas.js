/**
 * Renumeración canónica de chapas 1..N.
 *
 * Solo inscripciones en estado 'ratificado' cuentan.
 * Se ordenan ASC por numero_partidor (nulls al final) y se les
 * asigna chapa 1, 2, … N en ese orden.
 *
 * @param {Array} inscripciones  Array de objetos inscripcion con
 *                               { id, estado, numero_partidor }.
 * @returns {Object}  Mapa { inscripcion_id (string): chapa (number) }.
 */
function renumerarChapas(inscripciones) {
  const ratificadas = (inscripciones || [])
    .filter(i => i.estado === 'ratificado')
    .sort((a, b) => (a.numero_partidor || 9999) - (b.numero_partidor || 9999));
  const map = {};
  ratificadas.forEach((i, idx) => { map[i.id] = idx + 1; });
  return map;
}
