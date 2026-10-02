/**
 * Probe — alta de SPC desde el portal (migrations/portal_alta_spc_studbook.sql) y, desde el 02/10, también
 * desde la secretaría (migrations/rpc_spc_alta_studbook_staff.sql = v2 de la RPC, aplicada ENCIMA). SÓLO SANDBOX:
 * crea ejemplares, y en prod no se crean ejemplares (GOTCHA #101 / pedido del 01/10).
 *
 * Arma, en el Postgres del sandbox (contenedor sgh-local-pg), una base TEMPLATE con
 * tests/local/portal_alta_spc_sandbox.sql (funciones reales de prod) y, por cada corrida, una base
 * nueva desde el template a la que le aplica el TEXTO de la migración (o un mutante) y corre los casos
 * con sesiones simuladas como en Supabase (SET ROLE + request.jwt.claims). No toca la base `sgh` del
 * sandbox de siempre.
 *
 *   node tests/probe_portal_alta_spc_studbook.mjs              # 1 corrida, migración tal cual
 *   node tests/probe_portal_alta_spc_studbook.mjs --mutantes   # + un mutante por regla; cada uno tiene que morir
 *   PSQL_BASE="docker exec -i sgh-local-pg psql -v ON_ERROR_STOP=1 -U postgres -q -tA" (default)
 *
 * Casos:
 * Cada corrida aplica: previa → portal_alta_spc_studbook.sql → rpc_spc_alta_studbook_staff.sql (v2). Los casos
 * del portal (S*, P*) corren contra la v2: el portal tiene que seguir igual.
 *
 *   S1  portal trae un caballo nuevo e inscribe de corrido (rpc_inscribir real con su sesión): ficha
 *       portal / alta_por / pendiente / activo / club NULL / entrenador NULL; inscripción canal portal;
 *       auditoría del INSERT con alta_por
 *   S2  mismo nº de Stud Book otra vez → reusa (ya_existia), 0 filas nuevas
 *   S3a dos altas SIMULTÁNEAS del mismo caballo (mismo nombre) → 1 sola ficha, las dos con el mismo id
 *   S3b idem con OTRO nombre (lo frena sólo el índice único + ON CONFLICT) → 1 sola ficha
 *   S3c homónimos simultáneos (mismo nombre, otro caballo) → el segundo ve al primero (lock por nombre)
 *   S4  D2: fecha + padres de una ficha sin studbook_id → la reusa y NO le escribe el studbook_id
 *   S5  D3: Wave Rimout (2 fichas iguales) → rechazo con el mensaje D3
 *   S6  D4: homónimo → crea, motivo "homónimo de …"
 *   S7  V1: turno cerrado / anulado / inexistente → "La inscripción para ese turno no está abierta."
 *   S8–S12 V2 sb inválido, V3 raza 3, V4 nombre vacío, V5 fecha nula y futura, V6 sexo nulo
 *   S13 V7: edad < 2 rechaza; > 12 crea con motivo "edad > 12"; 3 años crea sin motivo
 *   S14 R1: 3 altas OK, la 4ª se rechaza; otro usuario sigue pudiendo; un caballo YA cargado se reusa
 *       aunque el usuario esté en el tope
 *   P1  authenticated (portal) llamando la RPC → permission denied (sin EXECUTE)
 *   P1c postgres sin JWT (tiene EXECUTE) → 42501 del guard 0
 *   P4  EXECUTE: anon no, authenticated no, service_role sí
 *   P5  G1: inactivo / sin entidad / operador inactivo / uuid desconocido / NULL → 42501 "…del portal o de la secretaría"
 *   P2  portal: INSERT directo a spcs y a inscripciones rechazados por RLS; UPDATE directo a spcs → 0 filas
 *   P6  staff (spcs.html): INSERT con alta_origen='portal' → la base lo deja en 'secretaria' y alta_por = staff;
 *       marcar revisado con revisado_por/alta_por falsos → revisado_por = staff, alta_por y motivos intactos;
 *       editar otro campo no toca la revisión; la edición queda auditada con el usuario
 *   P7  la migración no cambia NINGUNA política ni GRANT de tabla (md5 antes/después)
 *   B0  SIN la previa, la migración falla con 0A000 (el error de prod del 01/10: _bak_merge_duplicados_spc.fila
 *       era del tipo fila de spcs)
 *   B1  previa (cerrar_tablas_bak_publicas.sql): fila → jsonb con los 2 ids, RLS prendido en las 3 tablas,
 *       anon y authenticated sin ningún privilegio, conteos 2/67/148
 *   B2  anon no puede leer ninguna de las 3 (permission denied)
 *   B3  rollback_merge_duplicados_spc.sql (jsonb_populate_record) reinserta las 2 fichas, ya con las columnas nuevas
 *
 * Staff (v2, alta desde el modal "Inscribir SPC" de inscripciones.html):
 *   E1  secretaría trae un caballo nuevo en T1 y lo inscribe con su sesión (INSERT directo, RLS de staff): ficha
 *       'secretaria', alta_por = staff, NO pendiente, notas "alta desde Inscripciones por Staff"; auditoría
 *   E2  turno con la inscripción CERRADA → OK (sin ventana)
 *   E3  turno anulado / reunión cancelada / turno inexistente → rechazo
 *   E4  turno de otro club → 42501; super_admin de otro club → OK; operador de Dolores → OK
 *   E5  sin cupo: 4 altas seguidas OK
 *   E6  D1 / D2 reusan, D3 rechaza (igual que el portal)
 *   E7  edad < 2 rechaza; > 12 y homónimo → crea con los motivos guardados, sin pendiente
 *   E8  el portal no puede hacerse pasar: un portal con el cupo lleno sigue frenado (R1 intacto con la v2)
 *   R1v rollback_rpc_spc_alta_studbook_staff.sql deja el md5 de la v1 y el staff vuelve a 42501
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = readFileSync(join(HERE, '..', 'migrations', 'portal_alta_spc_studbook.sql'), 'utf8');
// v2 (02/10): misma RPC con la rama de la secretaría. Se aplica encima de MIG en cada corrida.
const MIG_V2 = readFileSync(join(HERE, '..', 'migrations', 'rpc_spc_alta_studbook_staff.sql'), 'utf8');
const ROLLBACK_V2 = readFileSync(join(HERE, '..', 'migrations', 'rollback_rpc_spc_alta_studbook_staff.sql'), 'utf8');
// Previa obligatoria (2026-10-02): sin ella la migración falla en prod con 0A000 (ver B0).
const PREVIA = readFileSync(join(HERE, '..', 'migrations', 'cerrar_tablas_bak_publicas.sql'), 'utf8');
const ROLLBACK_MERGE = readFileSync(join(HERE, '..', 'migrations', 'rollback_merge_duplicados_spc.sql'), 'utf8');
const FIXTURE = readFileSync(join(HERE, 'local', 'portal_alta_spc_sandbox.sql'), 'utf8');
const PSQL = (process.env.PSQL_BASE || 'docker exec -i sgh-local-pg psql -v ON_ERROR_STOP=1 -U postgres -q -tA').split(' ');
const TPL = 'sgh_pa_tpl', RUN = 'sgh_pa_run';
const MUTANTES = process.argv.includes('--mutantes');

// ── psql ─────────────────────────────────────────────────────────────────────────────────────
function psql(db, sql) {
  const r = spawnSync(PSQL[0], [...PSQL.slice(1), '-d', db], { input: sql, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
function psqlAsync(db, sql) {
  return new Promise((res) => {
    const p = spawn(PSQL[0], [...PSQL.slice(1), '-d', db]);
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => res({ ok: code === 0, out: out.trim(), err: err.trim() }));
    p.stdin.end(sql);
  });
}
const ultima = (out) => out.split('\n').filter(Boolean).pop() ?? '';
const json = (r) => { try { return JSON.parse(ultima(r.out)); } catch { return null; } };

// ── sesiones ─────────────────────────────────────────────────────────────────────────────────
const claims = (o) => `select set_config('request.jwt.claims', '${JSON.stringify(o)}', true) is null as x_ \\gset\n`;
const SR = `set local role service_role;\n${claims({ role: 'service_role' })}`;
const AS = (sub, email) => `set local role authenticated;\n${claims({ role: 'authenticated', sub, email })}`;
const RESET = `reset role;\nselect set_config('request.jwt.claims', '', true) is null as x_ \\gset\n`;

const U1 = 'a0000000-0000-0000-0000-000000000001', U2 = 'a0000000-0000-0000-0000-000000000002',
      PROP = 'a0000000-0000-0000-0000-000000000003', INACT = 'a0000000-0000-0000-0000-000000000004',
      SINENT = 'a0000000-0000-0000-0000-000000000005', STAFF = 'a0000000-0000-0000-0000-000000000006';
const USU1 = 'e0000000-0000-0000-0000-000000000001', USU_STAFF = 'e0000000-0000-0000-0000-000000000006';
const STAFF2 = 'a0000000-0000-0000-0000-000000000007', ADMIN = 'a0000000-0000-0000-0000-000000000008',
      OPER = 'a0000000-0000-0000-0000-000000000009', OPERX = 'a0000000-0000-0000-0000-000000000010';
const USU_ADMIN = 'e0000000-0000-0000-0000-000000000008', USU_OPER = 'e0000000-0000-0000-0000-000000000009';
const T5_CANCELADA = 'b1000000-0000-0000-0000-000000000005', T6_OTRO = 'b1000000-0000-0000-0000-000000000006';
const T1 = 'b1000000-0000-0000-0000-000000000001', T2 = 'b1000000-0000-0000-0000-000000000002',
      T3 = 'b1000000-0000-0000-0000-000000000003';
const CAB = 'c0000000-0000-0000-0000-000000000001', ENT = 'd0000000-0000-0000-0000-000000000001';
const D2_ID = '5c000000-0000-0000-0000-000000000002';

// Reunión del fixture = hoy + 10 días. Fechas de nacimiento por edad reglamentaria.
const ref = new Date(Date.now() + 10 * 86400000);
const nacParaEdadMenorA2 = `${ref.getUTCFullYear() - 1}-08-01`;   // edad 1 ó 0
const nacEdad3 = `${ref.getUTCFullYear() - 3}-08-01`;            // edad 3 ó 2 (≥ 2 siempre)
const nacEdad15 = `${ref.getUTCFullYear() - 15}-08-01`;          // edad 15 ó 14

const lit = (v) => v === null || v === undefined ? 'NULL'
  : Array.isArray(v) ? (v.length ? `ARRAY[${v.map(lit).join(',')}]::text[]` : 'ARRAY[]::text[]')
  : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
function P(o = {}) {
  const p = { auth: U1, carrera: T1, sb: '500001', nombre: 'NUEVO PROBE', fecha: '2021-09-01', sexo: 'macho',
    color: 'Zaino', padre: 'PADRE N', madre: 'MADRE N', abuelo: 'ABUELO N', pais: 'Argentina',
    url: 'https://www.studbook.org.ar/ejemplares/perfil/500001/nuevo-probe', leyenda: '(2021 M SP)', raza: 4, alertas: [], ...o };
  return `rpc_spc_alta_studbook_portal(${lit(p.auth)}::uuid, ${lit(p.carrera)}::uuid, ${lit(p.sb)}, ${lit(p.nombre)}, ${lit(p.fecha)}::date, ${lit(p.sexo)}, ${lit(p.color)}, ${lit(p.padre)}, ${lit(p.madre)}, ${lit(p.abuelo)}, ${lit(p.pais)}, ${lit(p.url)}, ${lit(p.leyenda)}, ${lit(p.raza)}::int, ${lit(p.alertas)})`;
}
const ALTA = (o) => `select row_to_json(t) from ${P(o)} t;\n`;

// ── casos ────────────────────────────────────────────────────────────────────────────────────
async function correrCasos(db, pre, md5v1) {
  const res = [];
  const ok = (t, c, n = '') => { res.push({ t, s: c ? '✅' : '❌', n }); return c; };
  const enTx = (body) => psql(db, `begin;\n${body}\nrollback;\n`);
  const rechaza = (r, frag) => !r.ok && r.err.includes(frag);

  // S1
  let r = enTx(`${SR}select spc_id as nuevo from ${P()} \\gset\n${RESET}${AS(U1, 'portal1@probe')}`
    + `select rpc_inscribir(:'nuevo', '${T1}', '${CAB}', '${ENT}') as insc_id \\gset\n${RESET}`
    + `select json_build_object('s', (select row_to_json(s) from (select alta_origen, alta_por, revision_pendiente, revision_motivos, estado, club_id, entrenador_id, caballeriza_id, studbook_id, notas from spcs where id = :'nuevo') s),
        'i', (select row_to_json(i) from (select canal, inscripto_por, estado, spc_id = :'nuevo' as mismo from inscripciones where id = :'insc_id') i),
        'a', (select json_agg(json_build_object('tabla', tabla, 'accion', accion, 'alta_por', datos_despues->>'alta_por')) from auditoria where tabla = 'spcs' and registro_id = :'nuevo'));`);
  let j = json(r);
  ok('S1 alta + rpc_inscribir de corrido (sesión real del portal)', r.ok && j?.i?.mismo === true, r.ok ? '' : r.err);
  ok('S1 ficha: portal, alta_por=usuario, pendiente, activo, club/entrenador/caballeriza NULL, studbook_id', j?.s?.alta_origen === 'portal' && j?.s?.alta_por === USU1
    && j?.s?.revision_pendiente === true && j?.s?.estado === 'activo' && j?.s?.club_id === null && j?.s?.entrenador_id === null
    && j?.s?.caballeriza_id === null && j?.s?.studbook_id === '500001' && j?.s?.revision_motivos === null, JSON.stringify(j?.s));
  ok('S1 notas con SB, url, "alta desde el portal por Portal Uno", abuelo y leyenda', /^SB 500001 · https:\/\/.+ · alta desde el portal por Portal Uno \d\d\/\d\d\/\d{4} · abuelo materno: ABUELO N · \(2021 M SP\)$/.test(j?.s?.notas ?? ''), j?.s?.notas);
  ok('S1 inscripción canal portal, inscripto_por = usuario', j?.i?.canal === 'portal' && j?.i?.inscripto_por === USU1 && j?.i?.estado === 'inscripto', JSON.stringify(j?.i));
  ok('S1 auditoría del INSERT en spcs con alta_por', j?.a?.length === 1 && j.a[0].accion === 'INSERT' && j.a[0].alta_por === USU1, JSON.stringify(j?.a));

  // S2
  r = enTx(`${SR}select spc_id as a from ${P()} \\gset\nselect count(*) as n0 from spcs \\gset\nselect row_to_json(t) from ${P()} t \\gset r_\n`
    + `select json_build_object('mismo', (:'r_row_to_json'::json->>'spc_id')::uuid = :'a', 'ya', (:'r_row_to_json'::json->>'ya_existia')::boolean, 'n', (select count(*) from spcs) - :n0);`);
  j = json(r);
  ok('S2 mismo nº de Stud Book → reusa, ya_existia, 0 filas nuevas', r.ok && j?.mismo === true && j?.ya === true && j?.n === 0, r.ok ? JSON.stringify(j) : r.err);

  // S3a / S3b / S3c — concurrencia real (dos conexiones; la primera duerme antes del COMMIT).
  // Estos COMMITEAN: usan padres propios, si no D2 (misma fecha + padres) los reusaría en los casos siguientes.
  const par = async (oa, ob) => {
    const a = psqlAsync(db, `begin;\n${SR}${ALTA(oa)}select pg_sleep(1.5);\ncommit;\n`);
    await new Promise((x) => setTimeout(x, 400));
    const b = psqlAsync(db, `begin;\n${SR}${ALTA(ob)}commit;\n`);
    return Promise.all([a, b]);
  };
  let [ra, rb] = await par({ sb: '600001', nombre: 'CONC MISMO', padre: 'CONC P1', auth: U1 }, { sb: '600001', nombre: 'CONC MISMO', padre: 'CONC P1', auth: U2 });
  let ja = json(ra), jb = json(rb);
  let n = psql(db, `select count(*) from spcs where studbook_id = '600001';`).out;
  ok('S3a simultáneas, mismo nombre → 1 ficha; la 2ª reusa la de la 1ª', ra.ok && rb.ok && n === '1' && ja?.ya_existia === false && jb?.ya_existia === true && ja?.spc_id === jb?.spc_id, `${n} ${ra.err}${rb.err} ${JSON.stringify([ja, jb])}`);
  [ra, rb] = await par({ sb: '600002', nombre: 'CONC NOMBRE A', padre: 'CONC P2', auth: U1 }, { sb: '600002', nombre: 'CONC NOMBRE B', padre: 'CONC P2B', auth: U2 });
  ja = json(ra); jb = json(rb);
  n = psql(db, `select count(*) from spcs where studbook_id = '600002';`).out;
  ok('S3b simultáneas, otro nombre (sólo índice único + ON CONFLICT) → 1 ficha, la 2ª reusa', ra.ok && rb.ok && n === '1' && jb?.ya_existia === true && ja?.spc_id === jb?.spc_id, `${n} ${ra.err}${rb.err} ${JSON.stringify([ja, jb])}`);
  [ra, rb] = await par({ sb: '610001', nombre: 'HOMO LOCK', fecha: '2020-08-01', padre: 'PA', madre: 'MA', auth: U1 },
                       { sb: '610002', nombre: 'HOMO LOCK', fecha: '2019-08-01', padre: 'PB', madre: 'MB', auth: U2 });
  jb = json(rb);
  ok('S3c homónimos simultáneos → el 2º ve al 1º (motivo homónimo): lock por nombre', ra.ok && rb.ok && (jb?.revision_motivos || []).some((m) => m.startsWith('homónimo de HOMO LOCK')), `${rb.err} ${JSON.stringify(jb)}`);
  // Las altas commiteadas de S3 cuentan para el cupo R1 de U1/U2: se las corre 2 días atrás.
  psql(db, `update spcs set created_at = now() - interval '2 days' where studbook_id in ('600001','600002','610001','610002');`);

  // S4 D2
  r = enTx(`${SR}select count(*) as n0 from spcs \\gset\nselect row_to_json(t) from ${P({ sb: '700001', nombre: 'FICHA VIEJA PROBE', fecha: '2019-10-10', padre: 'Padre D2', madre: 'madre d2 ', sexo: 'hembra' })} t \\gset r_\n`
    + `select json_build_object('id', :'r_row_to_json'::json->>'spc_id', 'ya', :'r_row_to_json'::json->>'ya_existia', 'n', (select count(*) from spcs) - :n0, 'sb', (select studbook_id from spcs where id = '${D2_ID}'));`);
  j = json(r);
  ok('S4 D2 fecha+padres (normalizados) de ficha sin studbook_id → la reusa, no crea, no le escribe el nº', r.ok && j?.id === D2_ID && j?.ya === 'true' && j?.n === 0 && j?.sb === null, r.ok ? JSON.stringify(j) : r.err);

  // S5 D3
  r = enTx(`${SR}${ALTA({ sb: '397805', nombre: 'WAVE RIMOUT', fecha: '2017-08-08', padre: 'Remote (GB)', madre: 'Holiday Wave' })}`);
  ok('S5 D3 Wave Rimout (2 fichas) → rechazo', rechaza(r, 'Ese caballo ya está cargado más de una vez en el padrón'), r.err || r.out);

  // S6 D4
  r = enTx(`${SR}${ALTA({ sb: '800001', nombre: 'Bien Coqueta', fecha: '2020-09-09', padre: 'OTRO', madre: 'OTRA', sexo: 'hembra' })}`);
  j = json(r);
  ok('S6 D4 homónimo → crea, motivo "homónimo de BIEN COQUETA (nac. 15/10/2021 …)"', r.ok && j?.ya_existia === false && (j?.revision_motivos || []).some((m) => m.startsWith('homónimo de BIEN COQUETA (nac. 15/10/2021')), r.ok ? JSON.stringify(j) : r.err);

  // S7 V1
  const MSG_V1 = 'La inscripción para ese turno no está abierta.';
  for (const [lbl, c] of [['cerrado', T2], ['anulado', T3], ['inexistente', '99999999-0000-0000-0000-000000000000']]) {
    r = enTx(`${SR}${ALTA({ carrera: c })}`);
    ok(`S7 V1 turno ${lbl} → "${MSG_V1}"`, rechaza(r, MSG_V1), r.err || r.out);
  }

  // S8–S12
  const casosForma = [
    ['S8 V2 nº de Stud Book "12a"', { sb: '12a' }, 'El número de Stud Book no es válido.'],
    ['S8 V2 nº de Stud Book de 10 dígitos', { sb: '1234567890' }, 'El número de Stud Book no es válido.'],
    ['S9 V3 raza 3', { raza: 3 }, 'no figura como Sangre Pura de Carrera'],
    ['S9 V3 raza NULL', { raza: null }, 'no figura como Sangre Pura de Carrera'],
    ['S10 V4 nombre vacío', { nombre: '  ' }, 'El Stud Book no devolvió el nombre'],
    ['S11 V5 fecha NULL', { fecha: null }, 'no tiene la fecha de nacimiento'],
    ['S11 V5 fecha futura', { fecha: '2099-01-01' }, 'no tiene la fecha de nacimiento'],
    ['S12 V6 sexo NULL', { sexo: null }, 'no informa el sexo'],
    ['S12 V6 sexo "yegua"', { sexo: 'yegua' }, 'no informa el sexo'],
    ['S13 V7 edad < 2', { fecha: nacParaEdadMenorA2 }, 'revisá que hayas elegido el correcto'],
  ];
  for (const [lbl, o, frag] of casosForma) {
    r = enTx(`${SR}${ALTA(o)}`);
    ok(`${lbl} → rechazo`, rechaza(r, frag), r.err || r.out);
  }
  r = enTx(`${SR}${ALTA({ fecha: nacEdad15 })}`); j = json(r);
  ok('S13 V7 edad > 12 → crea, motivo "edad > 12 (N años según el Stud Book)" en revision_motivos', r.ok && j?.ya_existia === false && (j?.revision_motivos || []).some((m) => /^edad > 12 \(1[45] años según el Stud Book\)$/.test(m)), r.ok ? JSON.stringify(j) : r.err);
  r = enTx(`${SR}${ALTA({ fecha: nacEdad3 })}`); j = json(r);
  ok('S13 V7 edad 2–3 → crea sin motivos', r.ok && j?.ya_existia === false && j?.revision_motivos === null, r.ok ? JSON.stringify(j) : r.err);
  r = enTx(`${SR}${ALTA({ alertas: ['bandera no argentina: /img/banderas/239.png', 'raza != 4 (SPC): 4'] })}\n`); j = json(r);
  ok('S13b alerta de bandera → motivo "alerta Stud Book: …" (las de raza/sexo no)', r.ok && JSON.stringify(j?.revision_motivos) === JSON.stringify(['alerta Stud Book: bandera no argentina: /img/banderas/239.png']), r.ok ? JSON.stringify(j) : r.err);

  // S14 R1 (con el propietario, que no tiene altas de los casos de concurrencia)
  const tres = [1, 2, 3].map((k) => ALTA({ auth: PROP, sb: `90000${k}`, nombre: `CUPO ${k}`, padre: `CUPO P${k}` })).join('');
  r = enTx(`${SR}${tres}${ALTA({ auth: PROP, sb: '900004', nombre: 'CUPO 4', padre: 'CUPO P4' })}`);
  ok('S14 R1 4ª alta del mismo usuario en 24 h → rechazo', rechaza(r, 'Ya trajiste 3 caballos nuevos hoy'), r.err || r.out);
  r = enTx(`${SR}${tres}${ALTA({ auth: U2, sb: '900005', nombre: 'CUPO OTRO', padre: 'CUPO P5' })}`); j = json(r);
  ok('S14 R1 otro usuario sigue pudiendo', r.ok && j?.ya_existia === false, r.err || r.out);
  r = enTx(`${SR}${tres}${ALTA({ auth: PROP, sb: '400001', nombre: 'CON SB PROBE', fecha: '2020-09-01', padre: 'PADRE D1 (ARG)', madre: 'MADRE D1' })}`); j = json(r);
  // padre distinto al del padrón: D2 no lo agarra, lo reconoce sólo D1 (por nº de Stud Book)
  ok('S14 R1 en el tope, un caballo YA cargado (mismo nº SB, padre escrito distinto) se reusa igual: D1 antes del cupo', r.ok && j?.ya_existia === true && j?.spc_id === '5c000000-0000-0000-0000-000000000001', r.err || r.out);

  // P1 / P1c / P4
  r = enTx(`${AS(U1, 'portal1@probe')}${ALTA()}`);
  ok('P1 portal (authenticated) llama la RPC → permission denied', rechaza(r, 'permission denied for function rpc_spc_alta_studbook_portal'), r.err || r.out);
  r = enTx(ALTA());
  ok('P1c postgres SIN JWT (tiene EXECUTE) → 42501 del guard 0', rechaza(r, 'rpc_spc_alta_studbook_portal: sin permiso'), r.err || r.out);
  r = psql(db, `select json_object_agg(r.rolname, has_function_privilege(r.oid, 'public.rpc_spc_alta_studbook_portal(uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,integer,text[])', 'EXECUTE')) from pg_roles r where r.rolname in ('anon','authenticated','service_role');`);
  j = json(r);
  ok('P4 EXECUTE: anon no, authenticated no, service_role sí', j?.anon === false && j?.authenticated === false && j?.service_role === true, JSON.stringify(j));

  // P5 G1
  const MSG_G1 = 'No autorizado: esta operación es para usuarios del portal o de la secretaría.';
  for (const [lbl, a] of [['inactivo', INACT], ['sin entidad', SINENT], ['operador inactivo', OPERX], ['uuid desconocido', '99999999-9999-9999-9999-999999999999'], ['NULL', null]]) {
    r = enTx(`${SR}${ALTA({ auth: a })}`);
    ok(`P5 G1 usuario ${lbl} → "${MSG_G1}"`, rechaza(r, MSG_G1), r.err || r.out);
  }
  r = enTx(`${SR}${ALTA({ auth: PROP })}`); j = json(r);
  ok('P5 G1 propietario del portal con entidad → OK', r.ok && j?.ya_existia === false, r.err || r.out);

  // P2 portal directo
  r = enTx(`${AS(U1, 'portal1@probe')}insert into spcs (nombre, fecha_nacimiento, sexo) values ('DIRECTO', '2020-01-01', 'macho');`);
  ok('P2 portal INSERT directo a spcs → RLS', rechaza(r, 'row-level security'), r.err || r.out);
  r = enTx(`${AS(U1, 'portal1@probe')}insert into inscripciones (carrera_id, spc_id, canal) values ('${T1}', '${D2_ID}', 'portal');`);
  ok('P2 portal INSERT directo a inscripciones → RLS', rechaza(r, 'row-level security'), r.err || r.out);
  r = enTx(`${SR}select spc_id as nuevo from ${P()} \\gset\n${RESET}${AS(U1, 'portal1@probe')}`
    + `with u as (update spcs set revision_pendiente = false, nombre = 'HACKEADO' where id = :'nuevo' returning 1) select count(*) as n from u \\gset\n${RESET}`
    + `select json_build_object('n', :n, 'pend', revision_pendiente, 'nombre', nombre) from spcs where id = :'nuevo';`);
  j = json(r);
  ok('P2 portal UPDATE directo a spcs (bajar la marca) → 0 filas, nada cambia', r.ok && j?.n === 0 && j?.pend === true && j?.nombre === 'NUEVO PROBE', r.ok ? JSON.stringify(j) : r.err);

  // P6 staff
  r = enTx(`${AS(STAFF, 'staff@probe')}insert into spcs (nombre, fecha_nacimiento, sexo, alta_origen, alta_por, revision_pendiente, revision_motivos) values ('ALTA STAFF', '2020-01-01', 'macho', 'portal', '${USU1}', true, ARRAY['x']) returning id as sid \\gset\n${RESET}`
    + `select row_to_json(s) from (select alta_origen, alta_por, revision_pendiente, revision_motivos from spcs where id = :'sid') s;`);
  j = json(r);
  ok('P6 staff INSERT disfrazado de portal → secretaria, alta_por = staff, sin revisión', r.ok && j?.alta_origen === 'secretaria' && j?.alta_por === USU_STAFF && j?.revision_pendiente === false && j?.revision_motivos === null, r.ok ? JSON.stringify(j) : r.err);
  r = enTx(`${SR}select spc_id as nuevo from ${P({ fecha: nacEdad15 })} \\gset\n${RESET}${AS(STAFF, 'staff@probe')}`
    + `update spcs set color = 'Tordillo' where id = :'nuevo';\n`
    + `select revision_pendiente as p1 from spcs where id = :'nuevo' \\gset\n`
    + `update spcs set revision_pendiente = false, revisado_por = '${USU1}', revisado_at = '2000-01-01', alta_por = '${USU_STAFF}', alta_origen = 'secretaria', revision_motivos = NULL where id = :'nuevo';\n${RESET}`
    + `select json_build_object('p1', :'p1', 's', (select row_to_json(s) from (select alta_origen, alta_por, revision_pendiente, revisado_por, revisado_at > now() - interval '1 minute' as at_ok, revision_motivos from spcs where id = :'nuevo') s),
        'aud', (select json_agg(usuario_id) from auditoria where tabla = 'spcs' and registro_id = :'nuevo' and accion = 'UPDATE'));`);
  j = json(r);
  ok('P6 staff edita otro campo → la marca sigue pendiente', r.ok && j?.p1 === 't', r.ok ? JSON.stringify(j) : r.err);
  ok('P6 staff marca revisado con revisado_por/alta_por/origen/motivos falsos → base impone staff+now, conserva alta y motivos', j?.s?.revision_pendiente === false && j?.s?.revisado_por === USU_STAFF && j?.s?.at_ok === true
    && j?.s?.alta_por === USU1 && j?.s?.alta_origen === 'portal' && (j?.s?.revision_motivos || []).length === 1, JSON.stringify(j?.s));
  ok('P6 las dos ediciones del staff quedan auditadas con su usuario', JSON.stringify(j?.aud) === JSON.stringify([USU_STAFF, USU_STAFF]), JSON.stringify(j?.aud));

  // ── E · secretaría (v2) ────────────────────────────────────────────────────────────────────
  // E1
  r = enTx(`${SR}select spc_id as nuevo from ${P({ auth: STAFF, sb: '510001', nombre: 'TRAIDO STAFF', padre: 'PADRE ST' })} \\gset\n${RESET}${AS(STAFF, 'staff@probe')}`
    + `insert into inscripciones (carrera_id, spc_id, caballeriza_id, estado) values ('${T1}', :'nuevo', '${CAB}', 'inscripto') returning id as insc_id \\gset\n${RESET}`
    + `select json_build_object('s', (select row_to_json(s) from (select alta_origen, alta_por, revision_pendiente, revision_motivos, estado, club_id, studbook_id, notas from spcs where id = :'nuevo') s),
        'i', (select row_to_json(i) from (select canal, estado, spc_id = :'nuevo' as mismo from inscripciones where id = :'insc_id') i),
        'a', (select json_agg(json_build_object('accion', accion, 'alta_por', datos_despues->>'alta_por')) from auditoria where tabla = 'spcs' and registro_id = :'nuevo'));`);
  j = json(r);
  ok('E1 secretaría trae caballo nuevo y lo inscribe con su sesión (INSERT directo)', r.ok && j?.i?.mismo === true && j?.i?.canal === 'manual', r.ok ? JSON.stringify(j?.i) : r.err);
  ok('E1 ficha: secretaria, alta_por = staff, NO pendiente, sin motivos, activo, studbook_id', j?.s?.alta_origen === 'secretaria' && j?.s?.alta_por === USU_STAFF
    && j?.s?.revision_pendiente === false && j?.s?.revision_motivos === null && j?.s?.estado === 'activo' && j?.s?.studbook_id === '510001', JSON.stringify(j?.s));
  ok('E1 notas "alta desde Inscripciones por Staff"', /^SB 510001 · https:\/\/.+ · alta desde Inscripciones por Staff \d\d\/\d\d\/\d{4} · /.test(j?.s?.notas ?? ''), j?.s?.notas);
  ok('E1 auditoría del INSERT con alta_por = staff', j?.a?.length === 1 && j.a[0].accion === 'INSERT' && j.a[0].alta_por === USU_STAFF, JSON.stringify(j?.a));
  // E2
  r = enTx(`${SR}${ALTA({ auth: STAFF, carrera: T2 })}`); j = json(r);
  ok('E2 secretaría en turno con la inscripción CERRADA → OK (sin ventana)', r.ok && j?.ya_existia === false, r.err || r.out);
  // E3
  for (const [lbl, c, frag] of [['anulado', T3, 'Ese turno está anulado o la reunión está cancelada.'],
                                ['de reunión cancelada', T5_CANCELADA, 'Ese turno está anulado o la reunión está cancelada.'],
                                ['inexistente', '99999999-0000-0000-0000-000000000000', 'Ese turno no existe.']]) {
    r = enTx(`${SR}${ALTA({ auth: STAFF, carrera: c })}`);
    ok(`E3 secretaría, turno ${lbl} → rechazo`, rechaza(r, frag), r.err || r.out);
  }
  // E4
  r = enTx(`${SR}${ALTA({ auth: STAFF, carrera: T6_OTRO })}`);
  ok('E4 secretaría de Dolores, turno de OTRO club → 42501', rechaza(r, 'No autorizado: el turno es de otro hipódromo.'), r.err || r.out);
  r = enTx(`${SR}${ALTA({ auth: STAFF2, carrera: T1 })}`);
  ok('E4 secretaría de otro club, turno de Dolores → 42501', rechaza(r, 'No autorizado: el turno es de otro hipódromo.'), r.err || r.out);
  r = enTx(`${SR}select row_to_json(t) from ${P({ auth: ADMIN })} t \\gset r_\nselect json_build_object('ya', :'r_row_to_json'::json->>'ya_existia', 'por', (select alta_por from spcs where id = (:'r_row_to_json'::json->>'spc_id')::uuid));`);
  j = json(r);
  ok('E4 super_admin de otro club, turno de Dolores → OK, alta_por = super_admin', r.ok && j?.ya === 'false' && j?.por === USU_ADMIN, r.ok ? JSON.stringify(j) : r.err);
  r = enTx(`${SR}select row_to_json(t) from ${P({ auth: OPER })} t \\gset r_\nselect json_build_object('ya', :'r_row_to_json'::json->>'ya_existia', 'por', (select alta_por from spcs where id = (:'r_row_to_json'::json->>'spc_id')::uuid));`);
  j = json(r);
  ok('E4 operador de Dolores → OK, alta_por = operador', r.ok && j?.ya === 'false' && j?.por === USU_OPER, r.ok ? JSON.stringify(j) : r.err);
  // E5
  const cuatro = [1, 2, 3, 4].map((k) => ALTA({ auth: STAFF, sb: `91000${k}`, nombre: `STAFF CUPO ${k}`, padre: `ST CUPO P${k}` })).join('');
  r = enTx(`${SR}${cuatro}select count(*) from spcs where alta_por = '${USU_STAFF}';`);
  ok('E5 secretaría sin cupo: 4 altas seguidas OK', r.ok && ultima(r.out) === '4', r.err || r.out);
  // E6
  r = enTx(`${SR}${ALTA({ auth: STAFF, sb: '400001', nombre: 'CON SB PROBE', fecha: '2020-09-01', padre: 'PADRE D1', madre: 'MADRE D1' })}`); j = json(r);
  ok('E6 D1 (mismo nº SB) → reusa', r.ok && j?.ya_existia === true && j?.spc_id === '5c000000-0000-0000-0000-000000000001', r.err || r.out);
  r = enTx(`${SR}${ALTA({ auth: STAFF, sb: '700002', nombre: 'FICHA VIEJA PROBE', fecha: '2019-10-10', padre: 'Padre D2', madre: 'madre d2 ', sexo: 'hembra' })}`); j = json(r);
  ok('E6 D2 (fecha + padres) → reusa la ficha sin nº', r.ok && j?.ya_existia === true && j?.spc_id === D2_ID, r.err || r.out);
  r = enTx(`${SR}${ALTA({ auth: STAFF, sb: '397805', nombre: 'WAVE RIMOUT', fecha: '2017-08-08', padre: 'Remote (GB)', madre: 'Holiday Wave' })}`);
  ok('E6 D3 (Wave Rimout ×2) → rechazo', rechaza(r, 'Ese caballo ya está cargado más de una vez en el padrón'), r.err || r.out);
  // E7
  r = enTx(`${SR}${ALTA({ auth: STAFF, fecha: nacParaEdadMenorA2 })}`);
  ok('E7 edad < 2 → rechazo', rechaza(r, 'revisá que hayas elegido el correcto'), r.err || r.out);
  r = enTx(`${SR}select row_to_json(t) from ${P({ auth: STAFF, sb: '810001', nombre: 'Bien Coqueta', fecha: nacEdad15, padre: 'OTRO ST', madre: 'OTRA ST', sexo: 'hembra' })} t \\gset r_\n`
    + `select json_build_object('r', :'r_row_to_json'::json, 's', (select row_to_json(s) from (select revision_pendiente, revision_motivos, alta_origen from spcs where id = (:'r_row_to_json'::json->>'spc_id')::uuid) s));`);
  j = json(r);
  ok('E7 edad > 12 + homónimo → crea, devuelve y GUARDA los 2 motivos, sin pendiente, secretaria', r.ok && j?.s?.revision_pendiente === false && j?.s?.alta_origen === 'secretaria'
    && (j?.s?.revision_motivos || []).length === 2 && j.s.revision_motivos.some((m) => m.startsWith('edad > 12')) && j.s.revision_motivos.some((m) => m.startsWith('homónimo de BIEN COQUETA'))
    && JSON.stringify(j?.r?.revision_motivos) === JSON.stringify(j?.s?.revision_motivos), r.ok ? JSON.stringify(j) : r.err);
  // E8
  r = enTx(`${SR}${tres}${ALTA({ auth: PROP, sb: '900006', nombre: 'CUPO 6', padre: 'CUPO P6' })}`);
  ok('E8 con la v2, el portal con el cupo lleno sigue frenado (R1)', rechaza(r, 'Ya trajiste 3 caballos nuevos hoy'), r.err || r.out);
  r = enTx(`${SR}${tres}${ALTA({ auth: STAFF, sb: '900007', nombre: 'CUPO 7', padre: 'CUPO P7' })}select alta_origen || '|' || revision_pendiente from spcs where studbook_id = '900007';`);
  ok('E8 las altas de la secretaría no tocan el cupo del portal ni nacen como portal', r.ok && ultima(r.out) === 'secretaria|false', r.err || r.out);

  // R1v — rollback de la v2: vuelve la v1 exacta y la secretaría vuelve a 42501
  r = enTx(`${ROLLBACK_V2.replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '')}\nselect md5(pg_get_functiondef('public.rpc_spc_alta_studbook_portal'::regproc));`);
  ok('R1v rollback de la v2 → md5 = v1 medido en esta corrida', r.ok && ultima(r.out) === md5v1, `${ultima(r.out)} vs ${md5v1} ${r.err}`);
  r = enTx(`${ROLLBACK_V2.replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '')}\n${SR}${ALTA({ auth: STAFF })}`);
  ok('R1v con la v1, la secretaría → 42501 "…del portal."', rechaza(r, 'No autorizado: esta operación es para usuarios del portal.'), r.err || r.out);

  // B1 / B2 / B3 — la previa
  r = psql(db, `select json_build_object(
    'tipo', (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public._bak_merge_duplicados_spc'::regclass and attname = 'fila'),
    'ids', (select string_agg(fila->>'id', ',' order by fila->>'id') from _bak_merge_duplicados_spc),
    'rls', (select json_object_agg(relname, relrowsecurity) from pg_class where relname in ('_bak_merge_duplicados_spc','bak_r8_propietario','_gate41_backfill_tenencia')),
    'priv', (select count(*) from information_schema.role_table_grants where table_name in ('_bak_merge_duplicados_spc','bak_r8_propietario','_gate41_backfill_tenencia') and grantee in ('anon','authenticated')),
    'n', (select array[(select count(*) from _bak_merge_duplicados_spc), (select count(*) from bak_r8_propietario), (select count(*) from _gate41_backfill_tenencia)]));`);
  j = json(r);
  ok('B1 previa: fila jsonb con los 2 ids, RLS en las 3, 0 privilegios de anon/authenticated, conteos 2/67/148', j?.tipo === 'jsonb'
    && j?.ids === '0dc2f58f-0e2f-4915-be79-a7515fdd6ee4,da839b11-00a3-4eb8-b09f-03790d425ed9'
    && Object.values(j?.rls || {}).length === 3 && Object.values(j.rls).every((x) => x === true) && j?.priv === 0
    && JSON.stringify(j?.n) === '[2,67,148]', JSON.stringify(j));
  for (const t of ['_bak_merge_duplicados_spc', 'bak_r8_propietario', '_gate41_backfill_tenencia']) {
    r = enTx(`set local role anon;\nselect count(*) from public.${t};`);
    ok(`B2 anon no puede leer ${t}`, rechaza(r, 'permission denied'), r.err || r.out);
  }
  r = enTx(`${ROLLBACK_MERGE.replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '')}\nselect json_agg(json_build_object('n', nombre, 'o', alta_origen, 'p', revision_pendiente) order by nombre) from spcs where id in ('0dc2f58f-0e2f-4915-be79-a7515fdd6ee4','da839b11-00a3-4eb8-b09f-03790d425ed9');`);
  j = json(r);
  ok('B3 rollback de la unificación (jsonb_populate_record) reinserta las 2 fichas, con las columnas nuevas completas', r.ok
    && JSON.stringify(j) === JSON.stringify([{ n: 'Fist Queen', o: 'secretaria', p: false }, { n: 'Malenuchi', o: 'secretaria', p: false }]), r.ok ? JSON.stringify(j) : r.err);

  // P7
  const post = foto(db);
  ok('P7 la migración no cambia ninguna política (md5 de pg_policies)', post.pol === pre.pol, `${pre.pol} → ${post.pol}`);
  ok('P7 la migración no cambia ningún GRANT de tabla', post.gr === pre.gr, `${pre.gr} → ${post.gr}`);
  return res;
}

function foto(db) {
  const r = psql(db, `select json_build_object(
    'pol', (select md5(string_agg(tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), '#' order by tablename, policyname)) from pg_policies),
    'gr',  (select md5(string_agg(table_name||'|'||grantee||'|'||privilege_type, '#' order by table_name, grantee, privilege_type)) from information_schema.role_table_grants where table_schema = 'public'));`);
  return json(r) || {};
}

// ── corrida ──────────────────────────────────────────────────────────────────────────────────
function prepararTemplate() {
  let r = psql('postgres', `drop database if exists ${RUN};\ndrop database if exists ${TPL};\ncreate database ${TPL};\n`);
  if (!r.ok) throw new Error('no se pudo crear el template: ' + r.err);
  r = psql(TPL, FIXTURE);
  if (!r.ok) throw new Error('fixture: ' + r.err);
}
async function corrida(migSql, previaSql = PREVIA, v2Sql = MIG_V2) {
  let r = psql('postgres', `drop database if exists ${RUN};\ncreate database ${RUN} template ${TPL};\n`);
  if (!r.ok) throw new Error('createdb: ' + r.err);
  // B0: sin la previa la migración tiene que fallar como en prod (0A000) y no dejar nada.
  const b0 = psql(RUN, migSql);
  const b0ok = !b0.ok && b0.err.includes('uses its row type') && psql(RUN, `select count(*) from pg_proc where proname = 'rpc_spc_alta_studbook_portal';`).out === '0';
  r = psql(RUN, previaSql);
  if (!r.ok) return { aplica: false, err: 'previa: ' + r.err, res: [] };
  const pre = foto(RUN);
  r = psql(RUN, migSql);
  if (!r.ok) return { aplica: false, err: r.err, res: [] };
  const md5q = `select json_object_agg(p.proname, md5(pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('rpc_spc_alta_studbook_portal', 'fn_spcs_alta_revision');`;
  const md5v1 = json(psql(RUN, md5q));
  r = psql(RUN, v2Sql);
  if (!r.ok) return { aplica: false, err: 'v2: ' + r.err, res: [] };
  const md5 = psql(RUN, md5q);
  const res = await correrCasos(RUN, pre, md5v1?.rpc_spc_alta_studbook_portal);
  res.unshift({ t: 'B0 sin la previa la migración falla con 0A000 ("uses its row type") y no deja nada', s: b0ok ? '✅' : '❌', n: b0.err || b0.out });
  return { aplica: true, md5: json(md5), md5v1, res };
}

const MUT = [
  ['M1 sin guard 0', `  IF coalesce(auth.role(), '') <> 'service_role' THEN\n    RAISE EXCEPTION 'rpc_spc_alta_studbook_portal: sin permiso' USING ERRCODE = '42501';\n  END IF;`, ''],
  ['M2 G1 sin "activo"', `     AND u.activo\n     AND (   (    u.rol IN ('profesional', 'propietario')`, `     AND (   (    u.rol IN ('profesional', 'propietario')`],
  ['M3 V1 sin ventana', `     OR now() > v_carrera.cierre_inscripcion\n  THEN`, `\n  THEN`],
  ['M4 V3 raza libre', `IF p_raza IS DISTINCT FROM 4 THEN`, `IF false THEN`],
  ['M5 V5 sin control de fecha', `IF p_fecha_nacimiento IS NULL OR p_fecha_nacimiento > current_date THEN`, `IF false THEN`],
  ['M6 V6 sin control de sexo', `IF p_sexo IS NULL OR p_sexo NOT IN ('macho', 'hembra', 'castrado') THEN`, `IF p_sexo IS NULL THEN`],
  ['M7 V7 mínimo 0', `IF v_edad < 2 THEN`, `IF v_edad < 0 THEN`],
  ['M8 V7 sin motivo edad > 12', `IF v_edad > 12 THEN`, `IF false THEN`],
  ['M9 sin D1', `  SELECT s.id INTO v_id FROM spcs s WHERE s.studbook_id = v_sb;\n  IF FOUND THEN`, `  IF false THEN`],
  ['M10 D2 crea en vez de reusar', `IF coalesce(array_length(v_ids, 1), 0) = 1 THEN`, `IF false THEN`],
  ['M11 D3 reusa la primera', `      RAISE EXCEPTION 'Ese caballo ya está cargado más de una vez en el padrón. Buscalo por nombre en la lista o avisale a la secretaría.';`, `      RETURN QUERY SELECT v_ids[1], true, NULL::text[]; RETURN;`],
  ['M12 R1 tope 99', `IF v_altas >= 3 THEN`, `IF v_altas >= 99 THEN`],
  ['M13 sin D4 (homónimo)', `    v_motivos := v_motivos || format('homónimo de %s (nac. %s, id %s)',\n                   v_homonimo.nombre, to_char(v_homonimo.fecha_nacimiento, 'DD/MM/YYYY'), v_homonimo.id);`, `    NULL;`],
  ['M14 sin ON CONFLICT', `  ON CONFLICT (studbook_id) WHERE studbook_id IS NOT NULL DO NOTHING\n`, ``],
  ['M15 sin lock por nombre', `  PERFORM pg_advisory_xact_lock(hashtext('spc_alta_portal:' || v_nn));`, ``],
  ['M16 nace sin revisión pendiente', `v_usuario.id, NOT v_staff, CASE`, `v_usuario.id, false, CASE`],
  ['M17 GRANT a authenticated', `\nCOMMIT;`, `\nGRANT EXECUTE ON FUNCTION public.rpc_spc_alta_studbook_portal(uuid, uuid, text, text, date, text, text, text, text, text, text, text, text, integer, text[]) TO authenticated;\nCOMMIT;`],
  ['M18 trigger INSERT no impone secretaria', `    NEW.alta_origen        := 'secretaria';\n    NEW.alta_por           := v_usuario;\n    NEW.revision_pendiente := false;\n    NEW.revision_motivos   := NULL;`, ``],
  ['M19 trigger UPDATE no impone revisado_por', `      NEW.revisado_por := v_usuario;\n      NEW.revisado_at  := now();`, ``],
  ['M20 trigger UPDATE deja cambiar alta_por', `  NEW.alta_por         := OLD.alta_por;\n`, ``],
  ['M21 sin auditoría de spcs', `CREATE TRIGGER trg_audit_spcs AFTER INSERT OR DELETE OR UPDATE ON public.spcs\n  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_log();`, ``],
  // mutantes de la rama de la secretaría (v2)
  ['MS1 sin el guard de club del staff', `    IF v_usuario.rol <> 'super_admin' AND v_carrera.reunion_club IS DISTINCT FROM v_usuario.club_id THEN`, `    IF false THEN`],
  ['MS2 staff con ventana (como el portal)', `  IF v_staff THEN\n    -- Staff: sin ventana`, `  IF false THEN\n    -- Staff: sin ventana`],
  ['MS3 cupo también para el staff', `  IF NOT v_staff THEN\n    SELECT count(*) INTO v_altas`, `  IF true THEN\n    SELECT count(*) INTO v_altas`],
  ['MS4 staff nace pendiente', `v_usuario.id, NOT v_staff, CASE`, `v_usuario.id, true, CASE`],
  ['MS5 staff nace como portal', `CASE WHEN v_staff THEN 'secretaria' ELSE 'portal' END, v_usuario.id`, `'portal', v_usuario.id`],
  ['MS6 staff acepta turno anulado / reunión cancelada', `    IF v_carrera.estado IS NOT DISTINCT FROM 'anulada' OR v_carrera.reunion_estado IN ('cancelada', 'suspendida') THEN`, `    IF false THEN`],
  ['MS7 operador fuera de la lista', `          OR u.rol IN ('super_admin', 'secretario_carreras', 'operador'));`, `          OR u.rol IN ('super_admin', 'secretario_carreras'));`],
  ['MS8 super_admin atado a su club', `IF v_usuario.rol <> 'super_admin' AND v_carrera.reunion_club`, `IF v_carrera.reunion_club`],
  ['MS9 staff sin motivos guardados', `CASE WHEN v_staff THEN 'secretaria' ELSE 'portal' END, v_usuario.id, NOT v_staff, CASE WHEN cardinality(v_motivos) > 0 THEN v_motivos END`, `CASE WHEN v_staff THEN 'secretaria' ELSE 'portal' END, v_usuario.id, NOT v_staff, CASE WHEN NOT v_staff AND cardinality(v_motivos) > 0 THEN v_motivos END`],
  ['MS10 notas del staff dicen "el portal"', `CASE WHEN v_staff THEN 'Inscripciones' ELSE 'el portal' END`, `'el portal'`],
  // mutantes de la PREVIA (4º elemento = 'previa')
  ['M22 previa sin REVOKE de bak_r8_propietario', `REVOKE ALL ON public.bak_r8_propietario        FROM anon, authenticated;`, ``, 'previa'],
  ['M23 previa sin RLS en _gate41_backfill_tenencia', `ALTER TABLE public._gate41_backfill_tenencia ENABLE ROW LEVEL SECURITY;`, ``, 'previa'],
];

prepararTemplate();
const base = await corrida(MIG);
if (!base.aplica) { console.error('La migración NO aplica en el sandbox:\n' + base.err); process.exit(1); }
for (const x of base.res) console.log(`${x.s} ${x.t}${x.s === '❌' && x.n ? '  → ' + x.n : ''}`);
const fails = base.res.filter((x) => x.s === '❌').length;
console.log(`\n${base.res.length - fails}/${base.res.length} asserts OK`);
console.log(`md5(pg_get_functiondef) en el sandbox, v1 (portal_alta_spc_studbook.sql): ${JSON.stringify(base.md5v1)}`);
console.log(`md5(pg_get_functiondef) en el sandbox, v2 (rpc_spc_alta_studbook_staff.sql): ${JSON.stringify(base.md5)}`);

let vivos = 0;
if (MUTANTES) {
  console.log('\n── mutantes ──');
  for (const [nombre, de, a, cual] of MUT) {
    // La RPC vive en la v2 (se aplica encima): sus mutantes van sobre MIG_V2. Trigger/auditoría sobre MIG.
    const cualReal = cual || (/^M(1[89]|2[01]) /.test(nombre) ? 'mig' : 'v2');
    const src = cualReal === 'previa' ? PREVIA : cualReal === 'mig' ? MIG : MIG_V2;
    if (src.split(de).length !== 2) { console.log(`⚠️  ${nombre}: el ancla no aparece UNA vez — mutante roto`); vivos++; continue; }
    const m = cualReal === 'previa' ? await corrida(MIG, PREVIA.replace(de, a))
      : cualReal === 'mig' ? await corrida(MIG.replace(de, a)) : await corrida(MIG, PREVIA, MIG_V2.replace(de, a));
    const muertos = m.aplica ? m.res.filter((x) => x.s === '❌').map((x) => x.t.split(' ')[0]) : ['(no aplica)'];
    const vive = m.aplica && muertos.length === 0;
    if (vive) vivos++;
    console.log(`${vive ? '❌ VIVE ' : '✅ muere'} ${nombre}${vive ? '' : '  ← ' + [...new Set(muertos)].join(', ')}`);
  }
  console.log(`\nmutantes: ${MUT.length - vivos}/${MUT.length} muertos`);
}
psql('postgres', `drop database if exists ${RUN};\ndrop database if exists ${TPL};\n`);
process.exit(fails || vivos ? 1 : 0);
