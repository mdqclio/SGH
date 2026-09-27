/**
 * escapeHtml — la función de escape única para texto que va a innerHTML.
 *
 * ISSUE-018 / H6 del informe 2026-09-27_usuarios-roles-portal-escalada.md
 * (reports): los usuarios del portal se registran solos (solicitar-acceso) y
 * eligen su propio nombre y teléfono; además pueden reescribir su propia fila
 * de `usuarios` por la API (la RLS lo permite para nombre, teléfono, email y
 * estado). Ese texto lo escribe un tercero sin privilegios y se renderiza en
 * pantallas del personal del hipódromo. Todo lo que venga de ahí pasa por acá.
 *
 * Escapa los cinco caracteres que importan en contenido Y en atributos entre
 * comillas (simples o dobles). No alcanza para meter texto dentro de código JS
 * (un onclick="f('…')"): el navegador decodifica las entidades del atributo
 * ANTES de ejecutar el JS, así que `&#39;` vuelve a ser una comilla. Para los
 * onclick se pasa sólo el id y el objeto se busca en memoria.
 *
 * Misma implementación que el `escapeHtml` que ya tenían inline auditoria,
 * caballerizas, jockeys, profesionales, propietarios, spcs, etc. (null →
 * cadena vacía). Es una función global (script clásico, sin módulos).
 *
 * @param {*} s  Cualquier valor; null/undefined → ''.
 * @returns {string}
 */
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
