/**
 * Catálogo de chapas — distancias entre caballos al cruzar el disco.
 * Spec validada por Fede 25/05/2026.
 *
 * Uso:
 *   CHAPAS_CATALOG               → array con las 20 entradas en orden de distancia.
 *   getChapa(id)                 → devuelve la entrada por id.
 *   getChapaByCodigo(codigo)     → devuelve por código de texto (ej. "1 cpo").
 *   renderVariosChapa(n)         → SVG dinámico para "varios + N" (n ≥ 5).
 *   getVariosCodigo(n)           → string "N cpos" (siempre plural, n ≥ 5).
 *
 * Los ids NO son contiguos ni siguen el orden del array: están persistidos por
 * código en resultado_posiciones.diferencia, así que nunca se renumeran. El
 * orden del dropdown lo da la POSICIÓN en el array, no el id. Altas nuevas
 * toman el siguiente id libre y se insertan donde corresponda por distancia
 * (así entró id 20 = "4½ cpos", entre id 16 y id 17).
 *
 * Tipos:
 *   "distancia" → ids 1-16 y 20, distancias fijas con SVG estático.
 *   "varios"    → id 17. El operador ingresa N ≥ 5 entero; SVG y código
 *                 se arman dinámicamente vía render/getVarios.
 *   "estado"    → ids 18-19. No son distancias; reemplazan al campo.
 *
 * En la columna "Cpos" de los resultados se muestra el código (texto).
 * Los SVG son para mostrar al lado del código en la UI cuando aplique.
 */

const CHAPAS_YELLOW = '#FFD600';
const CHAPAS_BLACK  = '#000000';

const CHAPAS_CATALOG = [
  {
    id: 1,
    codigo: 'emp',
    nombre: 'Empate',
    valor: 0.0,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <text x="50" y="75" text-anchor="middle" font-family="Arial Black, Helvetica Neue, sans-serif" font-size="75" font-weight="900" fill="#000000">E</text>
</svg>`
  },
  {
    id: 2,
    codigo: 'vm',
    nombre: 'Ventaja mínima',
    valor: 0.01,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <text x="50" y="68" text-anchor="middle" font-family="Arial Black, Helvetica Neue, sans-serif" font-size="55" font-weight="900" fill="#000000">Vm</text>
</svg>`
  },
  {
    id: 3,
    codigo: 'hoc',
    nombre: 'Hocico',
    valor: 0.05,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <text x="50" y="75" text-anchor="middle" font-family="Arial Black, Helvetica Neue, sans-serif" font-size="75" font-weight="900" fill="#000000">H</text>
</svg>`
  },
  {
    id: 4,
    codigo: '½ cbz',
    nombre: 'Media cabeza',
    valor: 0.1,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <text x="50" y="68" text-anchor="middle" font-family="Arial Black, Helvetica Neue, sans-serif" font-size="50" font-weight="900" fill="#000000">½ C</text>
</svg>`
  },
  {
    id: 5,
    codigo: 'cza',
    nombre: 'Cabeza',
    valor: 0.2,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <text x="50" y="75" text-anchor="middle" font-family="Arial Black, Helvetica Neue, sans-serif" font-size="75" font-weight="900" fill="#000000">C</text>
</svg>`
  },
  {
    id: 6,
    codigo: '½ pzo',
    nombre: 'Medio pescuezo',
    valor: 0.3,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <text x="50" y="68" text-anchor="middle" font-family="Arial Black, Helvetica Neue, sans-serif" font-size="50" font-weight="900" fill="#000000">½ P</text>
</svg>`
  },
  {
    id: 7,
    codigo: 'pzo',
    nombre: 'Pescuezo',
    valor: 0.4,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <text x="50" y="75" text-anchor="middle" font-family="Arial Black, Helvetica Neue, sans-serif" font-size="75" font-weight="900" fill="#000000">P</text>
</svg>`
  },
  {
    id: 8,
    codigo: '½ cpo',
    nombre: '½ cuerpo',
    valor: 0.5,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <path d="M 50,15 A 35,35 0 0,1 50,85 Z" fill="#000"/>
</svg>`
  },
  {
    id: 9,
    codigo: '¾ cpo',
    nombre: '¾ cuerpo',
    valor: 0.75,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <path d="M 50,50 L 50,15 A 35,35 0 1,0 85,50 Z" fill="#000"/>
</svg>`
  },
  {
    id: 10,
    codigo: '1 cpo',
    nombre: '1 cuerpo',
    valor: 1.0,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <circle cx="50" cy="50" r="30" fill="#000000"/>
</svg>`
  },
  {
    id: 11,
    codigo: '1½ cpo',
    nombre: '1 cuerpo y ½',
    valor: 1.5,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <circle cx="50" cy="50" r="27" fill="none" stroke="#000000" stroke-width="9"/>
</svg>`
  },
  {
    id: 12,
    codigo: '2 cpos',
    nombre: '2 cuerpos',
    valor: 2.0,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <circle cx="32" cy="32" r="18" fill="#000000"/>
  <circle cx="68" cy="68" r="18" fill="#000000"/>
</svg>`
  },
  {
    id: 13,
    codigo: '2½ cpos',
    nombre: '2½ cuerpos',
    valor: 2.5,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <circle cx="32" cy="32" r="15" fill="none" stroke="#000000" stroke-width="6"/>
  <circle cx="68" cy="68" r="15" fill="none" stroke="#000000" stroke-width="6"/>
</svg>`
  },
  {
    id: 14,
    codigo: '3 cpos',
    nombre: '3 cuerpos',
    valor: 3.0,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <circle cx="50" cy="28" r="16" fill="#000000"/>
  <circle cx="30" cy="68" r="16" fill="#000000"/>
  <circle cx="70" cy="68" r="16" fill="#000000"/>
</svg>`
  },
  {
    id: 15,
    codigo: '3½ cpos',
    nombre: '3½ cuerpos',
    valor: 3.5,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <circle cx="50" cy="28" r="13" fill="none" stroke="#000000" stroke-width="6"/>
  <circle cx="30" cy="68" r="13" fill="none" stroke="#000000" stroke-width="6"/>
  <circle cx="70" cy="68" r="13" fill="none" stroke="#000000" stroke-width="6"/>
</svg>`
  },
  {
    id: 16,
    codigo: '4 cpos',
    nombre: '4 cuerpos',
    valor: 4.0,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <circle cx="32" cy="32" r="14" fill="#000000"/>
  <circle cx="68" cy="32" r="14" fill="#000000"/>
  <circle cx="32" cy="68" r="14" fill="#000000"/>
  <circle cx="68" cy="68" r="14" fill="#000000"/>
</svg>`
  },
  {
    id: 20,
    codigo: '4½ cpos',
    nombre: '4½ cuerpos',
    valor: 4.5,
    tipo: 'distancia',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <circle cx="32" cy="32" r="11" fill="none" stroke="#000000" stroke-width="6"/>
  <circle cx="68" cy="32" r="11" fill="none" stroke="#000000" stroke-width="6"/>
  <circle cx="32" cy="68" r="11" fill="none" stroke="#000000" stroke-width="6"/>
  <circle cx="68" cy="68" r="11" fill="none" stroke="#000000" stroke-width="6"/>
</svg>`
  },
  {
    id: 17,
    codigo: null,
    nombre: 'Varios cuerpos',
    valor: null,
    tipo: 'varios',
    svg: null  // se genera con renderVariosChapa(n)
  },
  {
    id: 18,
    codigo: 's.a.',
    nombre: 'Sin apreciación',
    valor: null,
    tipo: 'estado',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <text x="50" y="70" text-anchor="middle" font-family="Arial Black, Helvetica Neue, sans-serif" font-size="50" font-weight="900" fill="#000000">s.a</text>
</svg>`
  },
  {
    id: 19,
    codigo: 'desm.',
    nombre: 'Desmontó',
    valor: null,
    tipo: 'estado',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#FFD600" stroke="#000000" stroke-width="2"/>
  <text x="50" y="62" text-anchor="middle" font-family="Arial Black, Helvetica Neue, sans-serif" font-size="26" font-weight="900" fill="#000000">desm.</text>
</svg>`
  },
];


function getChapa(id) {
  return CHAPAS_CATALOG.find(c => c.id === id) || null;
}

function getChapaByCodigo(codigo) {
  return CHAPAS_CATALOG.find(c => c.codigo === codigo) || null;
}

/**
 * Devuelve el código de texto "N cpos" para varios cuerpos.
 * Siempre plural porque n ≥ 5.
 */
function getVariosCodigo(n) {
  if (!Number.isInteger(n) || n < 5) {
    throw new Error('Varios cuerpos requiere un entero ≥ 5; recibido: ' + n);
  }
  return n + ' cpos';
}

/**
 * Genera el SVG de la chapa "varios + N" con el número embedded
 * (9 puntitos arriba + número grande abajo, mismo cuadrado amarillo).
 */
function renderVariosChapa(n) {
  if (!Number.isInteger(n) || n < 5) {
    throw new Error('renderVariosChapa requiere un entero ≥ 5; recibido: ' + n);
  }
  const dots = [];
  for (const y of [18, 30, 42]) {
    for (const x of [25, 50, 75]) {
      dots.push(`<circle cx="${x}" cy="${y}" r="5" fill="${CHAPAS_BLACK}"/>`);
    }
  }
  const fs = String(n).length <= 2 ? 42 : 34;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${CHAPAS_YELLOW}" stroke="${CHAPAS_BLACK}" stroke-width="2"/>
  ${dots.join('\n  ')}
  <text x="50" y="85" text-anchor="middle"
        font-family="Arial Black, Helvetica Neue, sans-serif"
        font-size="${fs}" font-weight="900" fill="${CHAPAS_BLACK}">${n}</text>
</svg>`;
}

// Si usás módulos ES, podés exportar:
// export { CHAPAS_CATALOG, getChapa, getChapaByCodigo, getVariosCodigo, renderVariosChapa };
