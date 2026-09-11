/**
 * Probe — R9 tanda 1: las 18 altas de SPCs de la planilla de anotaciones (11/09/2026).
 *
 * SOLO LECTURA. Compara lo que quedó en `spcs` contra la evidencia del scraper
 * (data/spcs_r9_tanda_1_scrape.json) y contra los 3 resueltos a mano (homónimo por
 * edad + 2 typos de planilla), que están en migrations/spcs_r9_tanda_1.sql.
 *
 * Asserts:
 *   A) count(spcs) = 201 (181 + 18 tanda 1 + 2 tanda 2 — QUE BELLA DOÑA, INDIANA MARO)
 *   B) las 18 filas existen por studbook_id, una sola vez cada una
 *   C) nombre / fecha_nacimiento / sexo / color / padre / madre iguales a la evidencia
 *   D) registro_stud_book NULL, club_id NULL, FK de asignación NULL, estado activo
 *   E) notas empieza con 'SB <id> · <url_perfil>' y los 2 typos llevan 'Planilla R9: <variante>'
 *   F) ABARAJALA es hembra (yeguas T10)
 *   G) ningún studbook_id repetido en toda la tabla
 *   H) CONESERA (1f645327-…) corregida el 11/09 con confirmación de Yesi: hembra, sb 444373, Alazan
 *   I) tanda 2: QUE BELLA DOÑA (446458) e INDIANA MARO (432433) existen, hembras, notas con la variante de planilla
 *
 *   set -a; . ./.env; set +a
 *   node tests/probe_spcs_r9_tanda_1.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) throw new Error('Falta SUPABASE_SECRET_KEY (source .env antes de correr).');
const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const HERE = dirname(fileURLToPath(import.meta.url));

const BASELINE_ANTES = 181;
const TANDA_2 = [
  { nombre_sb: 'QUE BELLA DOÑA', sb_id: '446458', fecha_nacimiento: '2023-10-08', sexo: 'hembra', color: 'Zaino',  padrillo_nombre: 'Sea Dog', madre_nombre: 'Paradise Nistel',  variante: 'BELLA DOÑA' },
  { nombre_sb: 'INDIANA MARO',   sb_id: '432433', fecha_nacimiento: '2021-09-15', sexo: 'hembra', color: 'Alazan', padrillo_nombre: 'Gokstad', madre_nombre: 'Ilusionada Chica', variante: 'INDIA MARO' },
];
const GRUPO_A = ['ETERNA DOCTORA','DESERT OF DUBAI','HERMANOSDEMIPATRIA','ALHENA','OLA DOCTOR','DEL CAMPEON','TORO MAÑERO','BACON','NISTEL WIN','HALLOTOP','EL RISKO','ATOMIZADOR','THE BEAST PARTY','ABARAJALA','GOIADORA'];
const MANUALES = [
  { nombre_sb: 'QUERELLANTE',     sb_id: '416936', fecha_nacimiento: '2019-10-11', sexo: 'macho',  color: 'Zaino', padrillo_nombre: 'Daniel Boone (BRZ)', madre_nombre: 'Que Felicidad',   url_perfil: 'https://www.studbook.org.ar/ejemplares/perfil/416936/querellante' },
  { nombre_sb: 'MARIA CATULENGA', sb_id: '440678', fecha_nacimiento: '2022-10-15', sexo: 'hembra', color: 'Zaino', padrillo_nombre: 'Fiskardo',           madre_nombre: 'Ever Propulsora', url_perfil: 'https://www.studbook.org.ar/ejemplares/perfil/440678/maria-catulenga', variante: 'MARIA CATULANGA' },
  { nombre_sb: 'NIÑO OCEANICO',   sb_id: '428019', fecha_nacimiento: '2021-09-01', sexo: 'macho',  color: 'Zaino', padrillo_nombre: 'Seahenge (USA)',     madre_nombre: 'Niña Divina',     url_perfil: 'https://www.studbook.org.ar/ejemplares/perfil/428019/nino-oceanico',   variante: 'NIÑO OSEANICO' },
];
const CONESERA_ID = '1f645327-a6da-449b-8a62-fdb577a8658e';

const evid = JSON.parse(readFileSync(join(HERE, '..', 'data', 'spcs_r9_tanda_1_scrape.json'), 'utf8'));
const esperados = GRUPO_A.map(n => { const a = evid.ALTAS.find(x => x.nombre_pedido === n); if (!a) throw new Error('evidencia sin ' + n); return a; }).concat(MANUALES);
if (esperados.length !== 18) throw new Error('esperaba 18, hay ' + esperados.length);
const IDS = esperados.map(e => e.sb_id);

const results = [];
const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };

// A
const { count: total, error: eC } = await sb.from('spcs').select('id', { count: 'exact', head: true });
if (eC) throw eC;
ok('A count(spcs) = 201', total === BASELINE_ANTES + 18 + TANDA_2.length, `real ${total}`);

// B–F
const { data: filas, error: eF } = await sb.from('spcs')
  .select('id,nombre,fecha_nacimiento,sexo,color,padrillo_nombre,madre_nombre,pais_origen,registro_stud_book,studbook_id,estado,notas,club_id,caballeriza_id,entrenador_id,jockey_habitual_id')
  .in('studbook_id', IDS);
if (eF) throw eF;
ok('B 18 filas por studbook_id', filas.length === 18, `real ${filas.length}`);
for (const e of esperados) {
  const f = filas.filter(x => x.studbook_id === e.sb_id);
  if (!ok(`B ${e.nombre_sb} sb=${e.sb_id} una sola fila`, f.length === 1, `hay ${f.length}`)) continue;
  const r = f[0];
  ok(`C ${e.nombre_sb} datos = evidencia`,
    r.nombre === e.nombre_sb && r.fecha_nacimiento === e.fecha_nacimiento && r.sexo === e.sexo
      && r.color === e.color && r.padrillo_nombre === e.padrillo_nombre && r.madre_nombre === e.madre_nombre
      && r.pais_origen === 'Argentina',
    `${r.nombre}|${r.fecha_nacimiento}|${r.sexo}|${r.color}|${r.padrillo_nombre}|${r.madre_nombre}`);
  ok(`D ${e.nombre_sb} registro NULL, FKs NULL, activo`,
    r.registro_stud_book === null && r.club_id === null && r.caballeriza_id === null
      && r.entrenador_id === null && r.jockey_habitual_id === null && r.estado === 'activo');
  const pref = `SB ${e.sb_id} · ${e.url_perfil}`;
  ok(`E ${e.nombre_sb} notas con SB + url${e.variante ? ' + variante' : ''}`,
    typeof r.notas === 'string' && r.notas.startsWith(pref)
      && (!e.variante || r.notas.includes(`Planilla R9: ${e.variante}`)),
    r.notas);
}
ok('F ABARAJALA hembra', filas.find(x => x.studbook_id === '433798')?.sexo === 'hembra');

// G
const { data: todos, error: eG } = await sb.from('spcs').select('studbook_id').not('studbook_id', 'is', null);
if (eG) throw eG;
const cnt = {}; for (const t of todos) cnt[t.studbook_id] = (cnt[t.studbook_id] || 0) + 1;
const dups = Object.entries(cnt).filter(([, n]) => n > 1);
ok('G 0 studbook_id repetidos en spcs', dups.length === 0, JSON.stringify(dups));

// H
const { data: con, error: eH } = await sb.from('spcs').select('nombre,sexo,studbook_id').eq('id', CONESERA_ID).single();
if (eH) throw eH;
ok('H CONESERA corregida (hembra, sb 444373)', con.nombre === 'CONESERA' && con.sexo === 'hembra' && con.studbook_id === '444373', JSON.stringify(con));

// I — tanda 2
const { data: t2, error: eI } = await sb.from('spcs').select('nombre,fecha_nacimiento,sexo,color,padrillo_nombre,madre_nombre,studbook_id,registro_stud_book,notas').in('studbook_id', TANDA_2.map(x => x.sb_id));
if (eI) throw eI;
for (const e of TANDA_2) {
  const r = t2.find(x => x.studbook_id === e.sb_id);
  ok(`I ${e.nombre_sb} existe, hembra, datos = SB, nota con variante`,
    !!r && r.nombre === e.nombre_sb && r.fecha_nacimiento === e.fecha_nacimiento && r.sexo === 'hembra' && r.color === e.color
      && r.padrillo_nombre === e.padrillo_nombre && r.madre_nombre === e.madre_nombre && r.registro_stud_book === null
      && typeof r.notas === 'string' && r.notas.startsWith(`SB ${e.sb_id} ·`) && r.notas.includes(`Planilla R9: ${e.variante}`),
    r ? r.notas : 'no existe');
}

for (const r of results) console.log(`${r.s} ${r.t}${r.n ? '  → ' + r.n : ''}`);
const fails = results.filter(r => r.s === '❌').length;
console.log(`\n${results.length - fails}/${results.length} asserts OK`);
process.exit(fails ? 1 : 0);
