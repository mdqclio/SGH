/**
 * studbook-progreso.js — indicador VISIBLE mientras se consulta el Stud Book.
 *
 * La consulta pasa por la Edge Function studbook-buscar, que pide al buscador público del Stud Book:
 * el 02/10 tardó entre 17 y 19 s por consulta. Un texto suelto ("Consultando…") parecía colgado.
 * Muestra spinner + segundos transcurridos + barra que avanza hacia ~20 s (nunca llega al 100 %
 * sola) + una nota de cuánto suele tardar. Lo usan inscripciones.html, portal.html y spcs.html.
 *
 *   const fin = progresoStudBook(el, 'Consultando el Stud Book');   // pinta en `el`
 *   … await sb.functions.invoke(…) …
 *   fin();                                                          // corta el contador
 *
 * Se corta solo si la pantalla reemplaza el contenido de `el` (el nodo del indicador ya no está).
 * El texto que se pasa se escapa (puede llevar el nombre de un caballo).
 */
const STUDBOOK_SEG_ESPERADOS = 20;

(function estilosProgresoStudBook() {
  if (typeof document === 'undefined' || document.getElementById('sb-progreso-css')) return;
  const st = document.createElement('style');
  st.id = 'sb-progreso-css';
  st.textContent = `
    .sb-progreso { display: flex; flex-direction: column; gap: 6px; padding: 10px 0; }
    .sb-progreso-fila { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text, #f5f0e8); }
    .sb-progreso-spin { width: 16px; height: 16px; border: 2px solid var(--border, #245033); border-top-color: var(--accent, #c9a84c);
      border-radius: 50%; animation: sbProgresoGira .8s linear infinite; flex: none; }
    .sb-progreso-seg { color: var(--accent, #c9a84c); font-variant-numeric: tabular-nums; font-weight: 600; }
    .sb-progreso-barra { height: 4px; background: var(--border, #245033); border-radius: 2px; overflow: hidden; }
    .sb-progreso-fill { height: 100%; width: 0; background: var(--accent, #c9a84c); transition: width .9s linear; }
    .sb-progreso-nota { font-size: 11px; color: var(--muted, #8a9e90); }
    @keyframes sbProgresoGira { to { transform: rotate(360deg); } }`;
  document.head.appendChild(st);
})();

function progresoStudBook(el, texto) {
  if (!el) return () => {};
  const t0 = Date.now();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  el.innerHTML = `<div class="sb-progreso" role="status" aria-live="polite">
      <div class="sb-progreso-fila"><span class="sb-progreso-spin"></span><span>${esc(texto)}…</span><span class="sb-progreso-seg">0 s</span></div>
      <div class="sb-progreso-barra"><div class="sb-progreso-fill"></div></div>
      <div class="sb-progreso-nota">El Stud Book suele tardar unos ${STUDBOOK_SEG_ESPERADOS} segundos. No cierres esta ventana.</div>
    </div>`;
  const nodo = el.querySelector('.sb-progreso');
  const tick = () => {
    if (!nodo.isConnected) { clearInterval(iv); return; }
    const s = Math.floor((Date.now() - t0) / 1000);
    nodo.querySelector('.sb-progreso-seg').textContent = `${s} s`;
    nodo.querySelector('.sb-progreso-fill').style.width = `${Math.min(95, (s / STUDBOOK_SEG_ESPERADOS) * 100)}%`;
  };
  const iv = setInterval(tick, 1000);
  return () => clearInterval(iv);
}
