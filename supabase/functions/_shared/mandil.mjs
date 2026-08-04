// ============================================================
// Mandil (= chapa) — renumeración canónica 1..N
// ============================================================
// Port EXACTO de renumerar-chapas.js (raíz del repo), que es el fuente de
// verdad usado por el frontend. No se puede importar el original desde acá:
// es un script de browser sin `export`, cargado como global por
// resultados.html y ratificacion.html — agregarle `export` obligaría a
// convertir esos <script> a type="module" y rompería dos páginas de
// producción.
//
// La duplicación está cubierta por tests/probe_studbook_v2.mjs, que carga
// renumerar-chapas.js y compara la salida de ambas implementaciones sobre
// fixtures. Si alguien toca una y no la otra, el probe falla.
//
// Modelo (ver docs/MODELO_NUMERACION.md y CLAUDE.md):
//   - GATERA  = inscripciones.numero_partidor. Cajón de largada por sorteo.
//               Puede tener huecos. Nunca se muestra al usuario.
//   - MANDIL  = número visible en el dorsal. Siempre 1..N consecutivo.
//               Se DERIVA de la gatera. No se persiste en ninguna tabla.
// ============================================================

/**
 * Renumeración canónica de chapas 1..N.
 *
 * Solo inscripciones en estado 'ratificado' cuentan (filtro POSITIVO, no lista
 * de exclusión: forfait y mal_inscrito quedan afuera solos).
 * Se ordenan ASC por numero_partidor (nulls al final) y se les asigna
 * mandil 1, 2, … N en ese orden.
 *
 * @param {Array} inscripciones  TODAS las inscripciones de la carrera, sin
 *                               filtrar, con { id, estado, numero_partidor }.
 * @returns {Object}  Mapa { inscripcion_id (string): mandil (number) }.
 */
export function renumerarChapas(inscripciones) {
  const ratificadas = (inscripciones || [])
    .filter(i => i.estado === 'ratificado')
    .sort((a, b) => (a.numero_partidor || 9999) - (b.numero_partidor || 9999));
  const map = {};
  ratificadas.forEach((i, idx) => { map[i.id] = idx + 1; });
  return map;
}
