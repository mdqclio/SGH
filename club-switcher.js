// club-switcher.js — inyecta un selector de hipódromo en el topbar para usuarios super_admin
(function() {
  function selectClub(clubId) {
    if (clubId) {
      localStorage.setItem('sgh_selected_club_id', clubId);
    } else {
      localStorage.removeItem('sgh_selected_club_id');
    }
    // Limpiar la reunión activa porque pertenece a otro club
    try { localStorage.removeItem('sgh_active_reunion_id'); } catch(_) {}
    // Reload sin query string para no arrastrar reunion_id u otros parámetros del club anterior
    window.location.href = window.location.pathname;
  }

  async function injectSwitcher() {
    // Nota: sb, currentUser y CLUB_ID son `let` en el lexical env global compartido de cada página
    // (no propiedades de window), accesibles por scope chain desde este IIFE.
    if (!currentUser || currentUser.rol !== 'super_admin') return;
    if (!sb) return;
    if (document.getElementById('topbar-club-switcher')) return; // ya inyectado

    const { data: clubs, error } = await sb.from('clubs').select('id,nombre,sigla').order('nombre');
    if (error || !clubs || !clubs.length) return;

    const sel = document.createElement('select');
    sel.id = 'topbar-club-switcher';
    sel.title = 'Cambiar de hipódromo activo (super admin)';
    sel.style.cssText = 'background:rgba(0,0,0,0.3);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:8px;font-family:inherit;font-size:13px;cursor:pointer;margin-right:8px;max-width:220px;';
    sel.innerHTML = '<option value="">— Elegir hipódromo —</option>' +
      clubs.map(c => `<option value="${c.id}" ${c.id===CLUB_ID?'selected':''}>${c.nombre}${c.sigla?` (${c.sigla})`:''}</option>`).join('');
    sel.addEventListener('change', (e) => selectClub(e.target.value));

    // Insertar antes de #user-name en el topbar (todos los .html operativos lo tienen)
    const userName = document.getElementById('user-name');
    if (userName && userName.parentNode) {
      userName.parentNode.insertBefore(sel, userName);
    }
  }

  // initAuth corre async. Esperar a que setee las globals con polling corto.
  function waitAndInject() {
    let tries = 0;
    const max = 60; // hasta 6 segundos
    const interval = setInterval(() => {
      tries++;
      // currentUser y sb son `let` compartidos, accesibles como bare names (no window.*)
      if (typeof currentUser !== 'undefined' && currentUser &&
          typeof sb !== 'undefined' && sb) {
        clearInterval(interval);
        injectSwitcher();
      } else if (tries >= max) {
        clearInterval(interval);
      }
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitAndInject);
  } else {
    waitAndInject();
  }
})();
