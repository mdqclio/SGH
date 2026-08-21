#!/usr/bin/env node
/**
 * diag_certeza_propietarios_r8.mjs — READ-ONLY
 *
 * Enriquece el listado de caballerizas de R8 sin propietario asignado con un
 * nivel de certeza sobre el titular sugerido.
 *
 * Regla (confirmada por Fede, 14/08/2026):
 *   En carreras OFICIALES COMPUTABLES el certificado de correr exige que el
 *   ejemplar figure en el Stud Book a nombre de un propietario de la
 *   caballeriza que lo inscribe. Por lo tanto, en esas carreras el titular del
 *   Stud Book es propietario válido de la caballeriza, por reglamento.
 *   En NO COMPUTABLES no aplica (venta posterior, certificado en trámite).
 *
 * R8 (reunión 7b6e003e-22e2-4629-bf55-f18560b1260f, 16/08/2026):
 *   computables = carreras 2ª (turno 12, GRAL SAN MARTIN) y 6ª (turno 11,
 *   ANIV. DOLORES), ambas categoría 'Oficial Computable'. El resto, no.
 *   Los números "cN" son numero_carrera_programa, no numero_turno.
 *
 * Fuentes de titular:
 *   F1 "Stud Book": spcs.caballeriza_id -> caballeriza_responsables -> propietarios.nombre
 *   F2 "Local":     inscripciones.caballeriza_id -> caballeriza_responsables -> propietarios.nombre
 *
 * Certeza por ejemplar:
 *   ALTA      = computable, F1 da titular y la caballeriza del Stud Book es la
 *               misma que inscribe (se admite homónima por mayúsculas)
 *   MEDIA     = no computable, F1 y F2 coinciden
 *   BAJA      = no computable, sólo F1
 *   DESCARTAR = F1 apunta a otra caballeriza distinta de la que inscribe
 *   SIN_DATO  = no hay titular por ninguna fuente
 *
 * Por caballeriza se toma el mejor caso; si los titulares de Stud Book difieren
 * entre sus caballos, se marca CONFLICTO y la sugerencia se anula.
 *
 * ENTRADA: dump JSON de la consulta SQL documentada abajo (se corre por MCP con
 * rol de servicio; la publishable key no atraviesa RLS sobre `inscripciones`).
 *   node tests/diag_certeza_propietarios_r8.mjs <ruta_dump.json>
 *
 * SQL de origen del dump:
 *   WITH r8 AS (
 *     SELECT i.id, i.spc_id, i.caballeriza_id AS cab_insc, i.estado AS estado_insc,
 *            c.numero_carrera_programa AS prog, c.numero_turno AS turno,
 *            (cat.nombre = 'Oficial Computable') AS computable
 *     FROM inscripciones i
 *     JOIN carreras c ON c.id = i.carrera_id
 *     LEFT JOIN categorias_carrera cat ON cat.id = c.categoria_id
 *     WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
 *       AND c.estado <> 'anulada' AND i.propietario_id IS NULL
 *   ), tit AS (
 *     SELECT cr.caballeriza_id,
 *            string_agg(DISTINCT p.nombre, ' | ' ORDER BY p.nombre) AS titulares
 *     FROM caballeriza_responsables cr JOIN propietarios p ON p.id = cr.propietario_id
 *     GROUP BY cr.caballeriza_id
 *   )
 *   SELECT ci.nombre AS caballeriza, r8.cab_insc::text AS caballeriza_id,
 *          s.nombre AS ejemplar, r8.prog, r8.turno, r8.computable,
 *          r8.estado_insc::text AS estado_insc, coalesce(cs.nombre,'') AS cab_studbook,
 *          coalesce(ts.titulares,'') AS f1, coalesce(ti.titulares,'') AS f2,
 *          (upper(btrim(cs.nombre)) = upper(btrim(ci.nombre))) AS misma_cab,
 *          (cs.id IS DISTINCT FROM ci.id
 *           AND upper(btrim(cs.nombre)) = upper(btrim(ci.nombre))) AS homonima
 *   FROM r8
 *   JOIN spcs s ON s.id = r8.spc_id
 *   LEFT JOIN caballerizas ci ON ci.id = r8.cab_insc
 *   LEFT JOIN caballerizas cs ON cs.id = s.caballeriza_id
 *   LEFT JOIN tit ts ON ts.caballeriza_id = s.caballeriza_id
 *   LEFT JOIN tit ti ON ti.caballeriza_id = r8.cab_insc
 *   ORDER BY caballeriza, prog;
 *
 * SALIDAS:
 *   tmp/R8 propietarios certeza ALTA.csv        -> A) carga directa
 *   tmp/R8 propietarios para Yesi.csv           -> B) el resto
 *   tmp/R8 propietarios detalle por ejemplar.csv -> respaldo, grano ejemplar
 *
 * No ejecuta INSERT/UPDATE/DELETE. Sólo lee el dump y escribe CSV.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const dumpPath = process.argv[2];
if (!dumpPath) {
  console.error('Uso: node tests/diag_certeza_propietarios_r8.mjs <ruta_dump.json>');
  process.exit(1);
}

const rows = JSON.parse(readFileSync(dumpPath, 'utf8'));

const norm = s => (s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();

const csvCell = v => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCSV = (headers, data) =>
  [headers.join(';'), ...data.map(r => headers.map(h => csvCell(r[h])).join(';'))].join('\n') + '\n';

// --- clasificación por ejemplar ---
const porEjemplar = rows.map(r => {
  let certeza, motivo;
  if (r.computable && r.f1 && r.misma_cab) {
    certeza = 'ALTA';
    motivo = 'computable + titular Stud Book (reglamento certificado de correr)';
  } else if (r.computable && r.f1) {
    certeza = 'DESCARTAR';
    motivo = `computable, pero el Stud Book lo registra en otra caballeriza (${r.cab_studbook}) — contradice el certificado`;
  } else if (!r.computable && r.f1 && r.f2 && norm(r.f1) === norm(r.f2)) {
    certeza = 'MEDIA';
    motivo = 'no computable, Stud Book y caballeriza local coinciden';
  } else if (!r.computable && r.f1 && r.misma_cab) {
    certeza = 'BAJA';
    motivo = 'no computable, sólo Stud Book';
  } else if (!r.computable && r.f1) {
    certeza = 'DESCARTAR';
    motivo = `no computable y el Stud Book lo registra en otra caballeriza (${r.cab_studbook})`;
  } else {
    certeza = 'SIN_DATO';
    motivo = 'sin titular por ninguna fuente — lo tiene que completar Yesi';
  }
  return {
    caballeriza: r.caballeriza,
    caballeriza_id: r.caballeriza_id,
    ejemplar: r.ejemplar,
    carrera_programa: r.prog,
    turno: r.turno,
    tipo_carrera: r.computable ? 'computable' : 'no computable',
    estado_inscripcion: r.estado_insc,
    titular_studbook: r.f1,
    titular_local: r.f2,
    cab_studbook: r.cab_studbook,
    homonima_studbook: r.homonima ? 'SI' : '',
    certeza,
    motivo,
  };
});

// --- agregación por caballeriza ---
const RANK = { ALTA: 4, MEDIA: 3, BAJA: 2, DESCARTAR: 1, SIN_DATO: 0 };
const porCab = new Map();
for (const r of porEjemplar) {
  if (!porCab.has(r.caballeriza)) porCab.set(r.caballeriza, []);
  porCab.get(r.caballeriza).push(r);
}

const filas = [];
for (const [caballeriza, rs] of [...porCab].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
  const ejemplares = [...new Set(rs.map(r => r.ejemplar))];
  const titularesDistintos = [...new Set(rs.map(r => r.titular_studbook).filter(Boolean))];
  const conflicto = titularesDistintos.length > 1;
  const mejor = rs.reduce((a, b) => (RANK[b.certeza] > RANK[a.certeza] ? b : a));

  filas.push({
    caballeriza,
    certeza: conflicto ? 'CONFLICTO' : mejor.certeza,
    titular_sugerido: conflicto ? '' : mejor.titular_studbook,
    conflicto_titulares: conflicto ? 'SI' : '',
    titulares_en_conflicto: conflicto ? titularesDistintos.join(' || ') : '',
    caballos: ejemplares.length,
    ejemplares: rs
      .map(r => `${r.ejemplar} (c${r.carrera_programa}/${r.tipo_carrera === 'computable' ? 'COMP' : 'nc'}/${r.estado_inscripcion})`)
      .join(', '),
    carreras: [...new Set(rs.map(r => r.carrera_programa))].sort((a, b) => a - b).join(', '),
    tipo_carrera: [...new Set(rs.map(r => r.tipo_carrera))].sort().join(' + '),
    homonima_studbook: rs.some(r => r.homonima_studbook === 'SI') ? 'SI' : '',
    cab_studbook_divergente: [...new Set(
      rs.filter(r => r.cab_studbook && !r.homonima_studbook && norm(r.cab_studbook) !== norm(caballeriza))
        .map(r => r.cab_studbook)
    )].join(' | '),
    motivo: conflicto
      ? 'titulares de Stud Book distintos entre los caballos — la sugerencia no sirve'
      : mejor.motivo,
    caballeriza_id: rs[0].caballeriza_id,
  });
}

const HEADERS = [
  'caballeriza', 'certeza', 'titular_sugerido', 'conflicto_titulares',
  'titulares_en_conflicto', 'caballos', 'ejemplares', 'carreras', 'tipo_carrera',
  'homonima_studbook', 'cab_studbook_divergente', 'motivo', 'caballeriza_id',
];

const alta = filas.filter(f => f.certeza === 'ALTA');
const resto = filas.filter(f => f.certeza !== 'ALTA');

writeFileSync('tmp/R8 propietarios certeza ALTA.csv', toCSV(HEADERS, alta), 'utf8');
writeFileSync('tmp/R8 propietarios para Yesi.csv', toCSV(HEADERS, resto), 'utf8');
writeFileSync('tmp/R8 propietarios detalle por ejemplar.csv', toCSV([
  'caballeriza', 'ejemplar', 'carrera_programa', 'turno', 'tipo_carrera',
  'estado_inscripcion', 'titular_studbook', 'titular_local', 'cab_studbook',
  'homonima_studbook', 'certeza', 'motivo',
], porEjemplar), 'utf8');

const conteoEj = {};
for (const r of porEjemplar) conteoEj[r.certeza] = (conteoEj[r.certeza] ?? 0) + 1;
const conteoCab = {};
for (const f of filas) conteoCab[f.certeza] = (conteoCab[f.certeza] ?? 0) + 1;

console.log(`inscripciones sin propietario (carreras no anuladas): ${porEjemplar.length}`);
console.log(`caballerizas afectadas: ${filas.length}`);
console.log('certeza por ejemplar:  ', conteoEj);
console.log('certeza por caballeriza:', conteoCab);
console.log(`A) ALTA  -> tmp/R8 propietarios certeza ALTA.csv (${alta.length})`);
console.log(`B) resto -> tmp/R8 propietarios para Yesi.csv (${resto.length})`);
