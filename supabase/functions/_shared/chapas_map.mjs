// ============================================================
// Chapas (cuerpos) — resolución de texto → id del catálogo
// ============================================================
// El catálogo canónico es CHAPAS_CATALOG en chapas.js (raíz del repo), spec
// validada por Fede el 25/05/2026, cableado al dropdown de resultados.html.
// Acá se replica SOLO el par codigo→id, sin los SVG, porque chapas.js es un
// script de browser sin `export` (lo cargan resultados.html y
// ratificacion.html como global) y convertirlo a módulo rompería esas dos
// páginas de producción.
//
// La duplicación está cubierta por tests/probe_studbook_v2.mjs, que carga
// chapas.js y verifica que los 19 códigos y sus ids coinciden exactamente.
//
// ⚠️ Los ids NO son contiguos ni siguen el orden de distancia: están
// persistidos por código en resultado_posiciones.diferencia, así que nunca se
// renumeran. El id 20 ("4½ cpos") se dio de alta después y va, por distancia,
// entre el 16 y el 17.
// ============================================================

// Los 19 códigos fijos del catálogo. El id 17 ("varios") no está acá: no
// tiene código fijo, se arma dinámico como "N cpos" con N ≥ 5.
export const CHAPAS_CODIGO_A_ID = {
  'emp':     1,   // Empate
  'vm':      2,   // Ventaja mínima
  'hoc':     3,   // Hocico
  '½ cbz':   4,   // Media cabeza
  'cza':     5,   // Cabeza
  '½ pzo':   6,   // Medio pescuezo
  'pzo':     7,   // Pescuezo
  '½ cpo':   8,   // ½ cuerpo
  '¾ cpo':   9,   // ¾ cuerpo
  '1 cpo':  10,   // 1 cuerpo
  '1½ cpo': 11,   // 1 cuerpo y ½
  '2 cpos': 12,   // 2 cuerpos
  '2½ cpos':13,   // 2½ cuerpos
  '3 cpos': 14,   // 3 cuerpos
  '3½ cpos':15,   // 3½ cuerpos
  '4 cpos': 16,   // 4 cuerpos
  '4½ cpos':20,   // 4½ cuerpos — alta posterior, por eso el id fuera de orden
  's.a.':   18,   // Sin apreciación (tipo estado, no distancia)
  'desm.':  19,   // Desmontó        (tipo estado, no distancia)
};

export const CHAPA_ID_VARIOS = 17;

// ------------------------------------------------------------
// Variantes legacy: texto libre cargado a mano ANTES de que el dropdown de
// resultados.html estuviera cableado al catálogo. Mapa EXPLÍCITO, revisado
// uno por uno — nada de fuzzy matching ni normalización automática, porque
// un match aproximado equivocado cambia el margen de llegada de una carrera
// oficial.
//
// Son 10 de los 11 valores fuera de catálogo que hay hoy en la base.
// El 11º es "nariz" y NO se mapea a propósito: no existe en el catálogo. Lo
// más cercano sería 'hoc' (Hocico), pero eso es una decisión de dominio, no
// nuestra. Sale con id_interno null y el texto intacto, y queda listado en
// docs/JSON_V2_CIERRE.md como pregunta para Yesi/Fede.
// ------------------------------------------------------------
export const VARIANTES_LEGACY = {
  '1 cuerpo':      '1 cpo',
  '2 cuerpos':     '2 cpos',
  '3 cuerpos':     '3 cpos',
  '5 cuerpos':     '5 cpos',   // → varios (id 17, n=5)
  'cabeza':        'cza',
  'media cabeza':  '½ cbz',
  'pescuezo':      'pzo',
  '3/4 cuerpo':    '¾ cpo',
  '1 1/2 cuerpos': '1½ cpo',
  '2 1/2 cuerpos': '2½ cpos',
};

const RX_VARIOS = /^(\d+) cpos$/;

/**
 * Resuelve el texto de resultado_posiciones.diferencia contra el catálogo.
 *
 * Orden de resolución:
 *   1. código exacto del catálogo
 *   2. "N cpos" con N ≥ 5 → varios (id 17) + n
 *   3. variante legacy conocida → se reintenta con el código canónico
 *   4. nada → id null (el texto viaja igual, sin reescribir)
 *
 * @param {string|null} txt
 * @returns {{id: number|null, codigo: string|null, n: number|null}}
 */
export function resolverChapa(txt) {
  const vacio = { id: null, codigo: null, n: null };
  if (txt == null) return vacio;
  const s = String(txt).trim();
  if (!s) return vacio;

  const directo = CHAPAS_CODIGO_A_ID[s];
  if (directo != null) return { id: directo, codigo: s, n: null };

  const mv = RX_VARIOS.exec(s);
  if (mv) {
    const n = parseInt(mv[1], 10);
    // 1..4 cuerpos tienen código propio (ids 10/12/14/16) y ya cayeron en el
    // lookup directo. "varios" arranca en 5.
    if (n >= 5) return { id: CHAPA_ID_VARIOS, codigo: s, n };
    return vacio;
  }

  const canon = VARIANTES_LEGACY[s];
  if (canon != null) {
    const porCanon = CHAPAS_CODIGO_A_ID[canon];
    if (porCanon != null) return { id: porCanon, codigo: canon, n: null };
    const mc = RX_VARIOS.exec(canon);
    if (mc) {
      const n = parseInt(mc[1], 10);
      if (n >= 5) return { id: CHAPA_ID_VARIOS, codigo: canon, n };
    }
  }

  return vacio;
}
