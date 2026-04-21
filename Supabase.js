// ============================================================
// CONFIGURACIÓN GLOBAL — Sistema de Gestión Hípica
// ============================================================

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const CLUB_ID      = 'a6da7e40-1515-45dc-8933-4eef33ce937a';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// Navegación entre módulos
function irA(pagina) {
  window.location.href = pagina;
}

// Toast global
function toast(msg, tipo = 'ok') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = tipo === 'ok' ? '✅ ' + msg : '❌ ' + msg;
  t.className = 'toast show ' + tipo;
  setTimeout(() => t.className = 'toast', 3500);
}

// Cerrar modal
function cerrarModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Escape cierra modales
document.addEventListener('keydown', e => {
  if (e.key === 'Escape')
    document.querySelectorAll('.modal-overlay.open')
      .forEach(m => m.classList.remove('open'));
});
