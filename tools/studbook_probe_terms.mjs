// Sonda exploratoria del autocomplete del Stud Book: vuelca los hits crudos de
// varios términos, sin clasificar ni proponer nada. Read-only, no toca la DB.
//
//   node tools/studbook_probe_terms.mjs <out.json> "TERMINO 1" "TERMINO 2" ...
//
// Sirve para el caso "el nombre que mandó Yesi no da match exacto": se buscan
// radicales cortos y se listan candidatos para que decida ella.
import { writeFileSync } from 'node:fs';

const [, , OUT, ...TERMINOS] = process.argv;

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

const resultados = [];
for (const term of TERMINOS) {
  try {
    const hits = await autocomplete(term);
    resultados.push({ termino: term, hits: hits.length, resultados: hits });
    console.log(`\n=== ${term} — ${hits.length} hits`);
    for (const h of hits) {
      console.log(`  ${h.id}\t${h.text}\t${h.nacimiento}\t${h.sexo}\t${h.pelo}\t${h.padre} / ${h.madre}\traza=${h.raza}\ticon=${h.icon}`);
    }
  } catch (e) {
    resultados.push({ termino: term, error: String(e) });
    console.log(`\n=== ${term} — ERROR ${e}`);
  }
}

writeFileSync(OUT, JSON.stringify({
  _meta: {
    fuente: 'www.studbook.org.ar',
    endpoint: '/ejemplares/autocomplete?tipo=1&muerto=1&term=',
    escribe_en_db: false,
    terminos: TERMINOS.length,
  },
  TERMINOS: resultados,
}, null, 2));
