// Colores de mandil 1..16 según el nomenclador oficial que mandó Fede el 18/09/2026
// (fondo / número). El 26/05 (234a833) se habían reemplazado por una paleta "SBARG" que
// tenía 8 fondos y 7 números cambiados (12 marrón, 13 turquesa, 14 beige, 15 verde limón,
// 16 bordó…); vuelve la del 22/05 (5379f75), que ya seguía el nomenclador, con el número
// en negro en el 7 (naranja) y el 12 (verde claro), que ahí estaban en blanco.
// Más de 16: partidorColor() devuelve gris #CCCCCC / negro (Dolores tiene 16 gateras).
const PARTIDOR_COLORS = {
   1: { bg: '#E10600', fg: '#FFFFFF' },  // rojo / blanco
   2: { bg: '#FFFFFF', fg: '#000000' },  // blanco / negro
   3: { bg: '#1E2691', fg: '#FFFFFF' },  // azul marino / blanco
   4: { bg: '#FFE600', fg: '#000000' },  // amarillo / negro
   5: { bg: '#006B3C', fg: '#FFFFFF' },  // verde oscuro / blanco
   6: { bg: '#000000', fg: '#FFE600' },  // negro / amarillo
   7: { bg: '#F26522', fg: '#000000' },  // naranja / negro
   8: { bg: '#ED1C76', fg: '#000000' },  // rosa / negro
   9: { bg: '#1FB7E0', fg: '#000000' },  // celeste / negro
  10: { bg: '#6D2C8F', fg: '#FFFFFF' },  // violeta / blanco
  11: { bg: '#B8B8B8', fg: '#E10600' },  // gris claro / rojo
  12: { bg: '#3DB54A', fg: '#000000' },  // verde claro / negro
  13: { bg: '#4D1414', fg: '#FFFFFF' },  // bordó oscuro / blanco
  14: { bg: '#7A1E1E', fg: '#FFE600' },  // bordó / amarillo
  15: { bg: '#6E6E6E', fg: '#000000' },  // gris oscuro / negro
  16: { bg: '#7BD5E5', fg: '#E10600' },  // celeste claro / rojo
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
