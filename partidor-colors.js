const PARTIDOR_COLORS = {
   1: { bg: '#E10600', fg: '#FFFFFF' },
   2: { bg: '#FFFFFF', fg: '#000000' },
   3: { bg: '#1E2691', fg: '#FFFFFF' },
   4: { bg: '#FFE600', fg: '#000000' },
   5: { bg: '#006B3C', fg: '#FFFFFF' },
   6: { bg: '#000000', fg: '#FFE600' },
   7: { bg: '#F26522', fg: '#FFFFFF' },
   8: { bg: '#ED1C76', fg: '#000000' },
   9: { bg: '#1FB7E0', fg: '#000000' },
  10: { bg: '#6D2C8F', fg: '#FFFFFF' },
  11: { bg: '#B8B8B8', fg: '#E10600' },
  12: { bg: '#3DB54A', fg: '#FFFFFF' },
  13: { bg: '#4D1414', fg: '#FFFFFF' },
  14: { bg: '#7A1E1E', fg: '#FFE600' },
  15: { bg: '#6E6E6E', fg: '#000000' },
  16: { bg: '#7BD5E5', fg: '#E10600' },
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
