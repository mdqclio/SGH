// Colores canónicos SBARG (Stud Book Argentino) — 16 mandiles
const PARTIDOR_COLORS = {
   1: { bg: '#D50000', fg: '#FFFFFF' },  // Rojo
   2: { bg: '#FFFFFF', fg: '#000000' },  // Blanco
   3: { bg: '#0047AB', fg: '#FFFFFF' },  // Azul
   4: { bg: '#FFD400', fg: '#000000' },  // Amarillo
   5: { bg: '#009B3A', fg: '#FFFFFF' },  // Verde
   6: { bg: '#000000', fg: '#FFFFFF' },  // Negro
   7: { bg: '#FF6A00', fg: '#FFFFFF' },  // Naranja
   8: { bg: '#FF69B4', fg: '#000000' },  // Rosa
   9: { bg: '#4FC3F7', fg: '#000000' },  // Celeste
  10: { bg: '#7B1FA2', fg: '#FFFFFF' },  // Violeta
  11: { bg: '#808080', fg: '#FFFFFF' },  // Gris
  12: { bg: '#6D4C41', fg: '#FFFFFF' },  // Marrón
  13: { bg: '#00B8B8', fg: '#000000' },  // Turquesa
  14: { bg: '#D8C3A5', fg: '#000000' },  // Beige
  15: { bg: '#A4C400', fg: '#000000' },  // Verde limón
  16: { bg: '#800020', fg: '#FFFFFF' },  // Bordó
};

function partidorColor(n) {
  const num = parseInt(n, 10);
  return PARTIDOR_COLORS[num] || { bg: '#CCCCCC', fg: '#000000' };
}

function partidorChipHTML(n) {
  const { bg, fg } = partidorColor(n);
  const border = bg.toUpperCase() === '#FFFFFF' ? '1px solid #000' : 'none';
  return `<span class="partidor-chip" style="background:${bg};color:${fg};border:${border}">${n}</span>`;
}
