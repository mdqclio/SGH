// ============================================================
// CONFIGURACIÓN GLOBAL — Sistema de Gestión Hípica
// ============================================================

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.Supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVubGhjdWFuZnJ0cGF0b2lwd3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MjQ0OTcsImV4cCI6MjA5MjMwMDQ5N30.rKb8BI7fBQcRdyyyxVfBOZbtCmGYKIMLUDLVmkn1SYM';
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
