// active-reunion.js — fuente única de verdad de qué reunión está "activa"
window.ActiveReunion = (function() {
  const KEY = 'sgh_active_reunion_id';
  function get() { try { return localStorage.getItem(KEY) || null; } catch(_) { return null; } }
  function set(id) { try { if (id) localStorage.setItem(KEY, id); } catch(_) {} }
  function findClosest(reuniones) {
    const today = new Date().toISOString().slice(0,10);
    const validas = (reuniones||[]).filter(r => r.estado !== 'anulada' && r.fecha);
    const upcoming = validas.filter(r => r.fecha >= today).sort((a,b) => a.fecha.localeCompare(b.fecha));
    if (upcoming.length) return upcoming[0].id;
    const past = validas.filter(r => r.fecha < today).sort((a,b) => b.fecha.localeCompare(a.fecha));
    return past.length ? past[0].id : null;
  }
  function resolve(reuniones) {
    const urlRid = new URLSearchParams(location.search).get('reunion_id');
    if (urlRid && reuniones.some(r => r.id === urlRid)) { set(urlRid); return urlRid; }
    const lsRid = get();
    if (lsRid && reuniones.some(r => r.id === lsRid)) return lsRid;
    const closest = findClosest(reuniones);
    if (closest) { set(closest); return closest; }
    return null;
  }
  return { get, set, findClosest, resolve };
})();
