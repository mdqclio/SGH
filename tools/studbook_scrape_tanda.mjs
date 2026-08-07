// Scrape studbook.org.ar autocomplete para la tanda 4 de R8.
// No escribe en la DB. Emite JSON de evidencia.
import { writeFileSync } from 'node:fs';

const PEDIDOS = [
  'ABELITO MIMOSO', 'DE BELLOSO', 'GAUCHA PRECIOSA', 'INFILTRADO SLEW', 'LE BATEAU',
  'LIVIA DRUSA', 'NELIDA RIM', 'REINA EDITION', 'TERRIBLE KING', 'YOOKY',
  // agregado fuera de planilla (Silvio, 07/08) — cae en MATCH_AMBIGUO, ver reporte
  'ACAPULCO',
];

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]/g, '');

const SEXO = { Macho: 'macho', Hembra: 'hembra', Castrado: 'castrado' };

async function autocomplete(term) {
  const url = 'https://www.studbook.org.ar/ejemplares/autocomplete'
    + `?tipo=1&muerto=1&term=${encodeURIComponent(term)}`;
  const res = await fetch(url, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Referer': 'https://www.studbook.org.ar/ejemplares',
      'User-Agent': 'Mozilla/5.0',
    },
  });
  if (!res.ok) throw new Error(`${term}: HTTP ${res.status}`);
  return res.json();
}

const toISO = ddmmyyyy => {
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m}-${d}`;
};

const altas = [];
const noResueltos = [];

for (const pedido of PEDIDOS) {
  let hits;
  try {
    hits = await autocomplete(pedido);
  } catch (e) {
    noResueltos.push({ nombre_pedido: pedido, motivo: 'ERROR_HTTP', detalle: String(e) });
    continue;
  }
  const exactos = hits.filter(h => norm(h.text) === norm(pedido));
  if (exactos.length === 0) {
    noResueltos.push({
      nombre_pedido: pedido,
      motivo: 'SIN_MATCH_EXACTO',
      candidatos: hits.map(h => ({ id: h.id, text: h.text, leyenda: h.leyenda })),
    });
    continue;
  }
  if (exactos.length > 1) {
    noResueltos.push({
      nombre_pedido: pedido,
      motivo: 'MATCH_AMBIGUO',
      candidatos: exactos.map(h => ({
        id: h.id, text: h.text, leyenda: h.leyenda,
        nacimiento: h.nacimiento, padre: h.padre, madre: h.madre,
      })),
    });
    continue;
  }
  const h = exactos[0];
  const alertas = [];
  if (!SEXO[h.sexo]) alertas.push(`sexo desconocido: ${h.sexo}`);
  if (h.raza !== 4) alertas.push(`raza != 4 (SPC): ${h.raza}`);
  if (!h.icon.endsWith('/10.png')) alertas.push(`bandera no argentina: ${h.icon}`);
  altas.push({
    nombre_pedido: pedido,
    nombre_sb: h.text,
    sb_id: String(h.id),
    url_perfil: `https://www.studbook.org.ar/ejemplares/perfil/${h.id}/${h.url_friendly}`,
    fecha_nacimiento: toISO(h.nacimiento),
    sexo_sb: h.sexo,
    sexo: SEXO[h.sexo] ?? null,
    color: h.pelo,
    padrillo_nombre: h.padre,
    madre_nombre: h.madre,
    abuelo_materno: h.abuelo_materno,
    leyenda: h.leyenda,
    tomo: h.tomo,
    folio: h.folio,
    pais_origen: h.icon.endsWith('/10.png') ? 'Argentina' : null,
    icon: h.icon,
    raza: h.raza,
    alertas,
  });
}

const out = {
  _meta: {
    fuente: 'www.studbook.org.ar',
    endpoint: '/ejemplares/autocomplete?tipo=1&muerto=1&term=',
    tanda: '4',
    escribe_en_db: false,
    nombres_pedidos: PEDIDOS.length,
    altas_propuestas: altas.length,
    casos_no_resueltos: noResueltos.length,
    snapshot_spcs: 167,
  },
  ALTAS: altas,
  NO_RESUELTOS: noResueltos,
};

writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
console.log(JSON.stringify(out._meta, null, 2));
for (const a of altas) console.log(`OK   ${a.nombre_pedido} -> ${a.nombre_sb} sb=${a.sb_id} ${a.fecha_nacimiento} ${a.sexo} ${a.color} | ${a.padrillo_nombre} / ${a.madre_nombre} ${a.alertas.length ? '⚠ ' + a.alertas.join('; ') : ''}`);
for (const n of noResueltos) console.log(`FALTA ${n.nombre_pedido} [${n.motivo}] ${JSON.stringify(n.candidatos ?? n.detalle)}`);
