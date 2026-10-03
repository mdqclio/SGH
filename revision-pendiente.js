/**
 * revision-pendiente.js — aviso al RATIFICAR un SPC pendiente de revisión (alta desde el portal que la
 * secretaría todavía no revisó en Stud Book (SPCs): spcs.revision_pendiente = true).
 *
 * Un solo texto para todas las pantallas que ratifican: ratificacion.html (botón Ratificar) e
 * inscripciones.html (select de estado del modal). Es AVISO, no bloqueo: se confirma o se cancela.
 *
 *   motivosRevision(spc)                 → 'edad > 12 (…) · homónimo de …' | 'alta desde el portal'
 *   textoConfirmarRatificarRevision(spc) → el texto del confirm()
 */
function motivosRevision(spc) {
  const m = (spc?.revision_motivos || []).filter(Boolean);
  return m.length ? m.join(' · ') : 'alta desde el portal';
}

function textoConfirmarRatificarRevision(spc) {
  return `${spc?.nombre || 'Este SPC'} está pendiente de revisión en Stud Book (SPCs).\nMotivo: ${motivosRevision(spc)}.\n\n¿Ratificar igual?`;
}
