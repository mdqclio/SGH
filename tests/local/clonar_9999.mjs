/**
 * Clona a SQL (schema mínimo + datos) lo que hace falta para correr, en un Postgres local,
 * los probes de liquidación sobre la reunión 9999: la reunión, sus carreras, inscripciones,
 * resultados, posiciones, liquidaciones, líneas, recibos referenciados, los SPC y los
 * profesionales del club, la config de liquidación y el club.
 *
 * SOLO LEE producción (secret key). Escribe dos archivos en tests/local/out/:
 *   schema.sql  — enums + tablas (columnas reales, GENERATED incluidas) + helpers de auth
 *                 stubeados (auth.uid() → NULL, fn_* reales copiados) + roles de PostgREST
 *   datos.sql   — INSERTs de las filas
 *
 * Uso:  set -a; . ./.env; set +a; node tests/local/clonar_9999.mjs
 * Después: tests/local/up.sh (levanta postgres + postgrest + proxy y carga los dos .sql).
 *
 * Los tipos de columna se leyeron de information_schema el 2026-09-22 (no hay acceso a
 * information_schema por PostgREST). Si el schema de prod cambia, actualizar DDL acá.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const URL = process.env.SUPABASE_URL || 'https://unlhcuanfrtpatoipwve.supabase.co';
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!KEY) { console.error('Falta SUPABASE_SECRET_KEY'); process.exit(2); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const CLUB = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const RID  = 'a0000000-0000-0000-0000-000000009999';

// ── DDL (foto de information_schema, 2026-09-22) ─────────────────────────────
const ENUMS = {
  beneficiario_tipo: ['profesional','propietario','club'],
  canal_inscripcion: ['manual','web','app','portal'],
  concepto_liq: ['premio','bono','actuacion','incentivo_jockey','incentivo_entrenador','fondo_solidario'],
  condicion_sexo: ['ambos','machos','hembras','machos_castrados'],
  estado_inscripcion: ['pre_inscripto','confirmado','ratificado','forfait','no_presentado','inscripto','mal_inscrito'],
  estado_linea_liq: ['impago','pagado','retenido'],
  estado_liquidacion: ['borrador','aprobada','pagada','anulada'],
  estado_recibo: ['emitido','anulado'],
  estado_resultado: ['provisional','oficial','en_protesta'],
  estado_reunion: ['borrador','publicada','en_curso','finalizada','cancelada','suspendida','programada'],
  estado_spc: ['activo','retirado','suspendido','fallecido','vendido'],
  forma_pago_recibo: ['efectivo','transferencia'],
  rol_usuario: ['super_admin','secretario_carreras','operador','profesional','propietario','publico'],
  sexo_spc: ['macho','hembra','castrado'],
  tipo_cobro: ['porcentaje_bolsa','monto_fijo','bono_actuacion','combinado'],
  tipo_pista: ['cesped','arena','mixta','sintetica','tierra'],
  tipo_profesional: ['jockey','entrenador','ambos'],
  tipo_reunion: ['oficial','extraoficial','especial','nocturna'],
};
const TABLES = {
  clubs: `id uuid primary key default gen_random_uuid(), nombre varchar not null, sigla varchar not null, razon_social varchar, cuit varchar, domicilio varchar, localidad varchar, provincia varchar, telefono varchar, email varchar, logo_url text, activo boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), pais varchar default 'Argentina', auditoria_retencion_meses integer default 12, comision_carreras jsonb default '[]'::jsonb, sponsors jsonb default '[]'::jsonb, disclaimer_importante text, disclaimer_nota text, website text, instagram text, facebook text, tiktok text, twitter_x text, youtube text, comisariato jsonb default '[]'::jsonb, secretaria_carreras_nombre text, inscripciones_telefono text, sponsor_destacado jsonb`,
  usuarios: `id uuid primary key default gen_random_uuid(), club_id uuid not null, email varchar not null, password_hash text not null default '', nombre_completo varchar, rol rol_usuario not null default 'publico', entidad_tipo varchar, entidad_id uuid, activo boolean not null default true, ultimo_login timestamptz, created_at timestamptz not null default now(), telefono varchar, estado varchar default 'activo', auth_user_id uuid`,
  reuniones: `id uuid primary key default gen_random_uuid(), club_id uuid not null, hipodromo_id uuid not null, numero integer not null, fecha date not null, tipo tipo_reunion not null default 'oficial', estado estado_reunion not null default 'borrador', tiempo_clima varchar, observaciones text, creado_por uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), hora_cierre_ratificacion time not null default '12:00:00', fechas_inscripciones text, fechas_forfaits text, fechas_compromiso_montas text, sorteo_partidores text, numero_publico integer, es_prueba boolean not null default false`,
  carreras: `id uuid primary key default gen_random_uuid(), reunion_id uuid not null, numero_turno integer not null, nombre varchar, categoria_id uuid not null, tipo_pista tipo_pista not null default 'cesped', distancia_metros integer not null, edad_minima_anos integer, edad_maxima_anos integer, condicion_sexo condicion_sexo not null default 'ambos', condicion_handicap varchar, condicion_adicional text, bolsa_total numeric not null default 0, distribucion_premios jsonb, cupo_maximo integer, hora_estimada time, apertura_inscripcion timestamptz, cierre_inscripcion timestamptz, apertura_ratificacion timestamptz, cierre_ratificacion timestamptz, estado varchar default 'programada', bolsa_bonos numeric default 0, numero_carrera_programa integer, apuestas text[] default ARRAY[]::text[], apuestas_notas text, ganadas_desde integer, ganadas_hasta integer`,
  spcs: `id uuid primary key default gen_random_uuid(), club_id uuid, nombre varchar not null, registro_stud_book varchar, fecha_nacimiento date not null, sexo sexo_spc not null, color varchar, marcas text, padrillo_nombre varchar, madre_nombre varchar, abuela_materna varchar, pais_origen varchar default 'Argentina', caballeriza_id uuid, entrenador_id uuid, jockey_habitual_id uuid, estado estado_spc not null default 'activo', notas text, doc_url text, foto_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), certificado_correr boolean default false, ult_performances text, studbook_id text`,
  profesionales: `id uuid primary key default gen_random_uuid(), club_id uuid, tipo tipo_profesional not null, nombre varchar not null, apellido varchar not null, documento_tipo varchar, documento_nro varchar, fecha_nacimiento date, matricula_nro varchar, categoria_jockey varchar, peso_minimo numeric, peso_maximo numeric, caballeriza_id uuid, telefono varchar, email varchar, foto_url text, activo boolean not null default true, notas text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), patente varchar, hipodromo_patente varchar, localidad varchar, estado varchar default 'activo'`,
  inscripciones: `id uuid primary key default gen_random_uuid(), carrera_id uuid not null, spc_id uuid not null, propietario_id uuid, entrenador_id uuid, jockey_titular_id uuid, jockey_suplente_id uuid, numero_partidor integer, peso_declarado numeric, peso_final numeric, estado estado_inscripcion not null default 'pre_inscripto', canal canal_inscripcion not null default 'manual', motivo_estado varchar, info_adicional text, inscripto_por uuid, ratificado_por uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), caballeriza_id uuid, peon varchar, capataz varchar, sereno varchar, certificado_correr boolean default false, peso_balanza numeric, performance text`,
  resultados: `id uuid primary key default gen_random_uuid(), carrera_id uuid not null, estado estado_resultado not null default 'provisional', tiempo_ganador varchar, dividendos jsonb, incidentes text, observaciones text, oficializado_por uuid, oficializado_at timestamptz, created_at timestamptz not null default now(), estado_pista varchar, favorito_mandil integer, redistribucion_legs jsonb default '{}'::jsonb, updated_at timestamptz default now()`,
  resultado_posiciones: `id uuid primary key default gen_random_uuid(), resultado_id uuid not null, inscripcion_id uuid not null, posicion integer, tiempo varchar, diferencia varchar, descalificado boolean not null default false, motivo_desc text, empate boolean default false, dividendo numeric, no_largo boolean not null default false`,
  performances: `id uuid primary key default gen_random_uuid(), spc_id uuid not null, carrera_id uuid, fecha_carrera date not null, hipodromo_sigla varchar not null, hipodromo_nombre varchar, numero_carrera integer, categoria_codigo varchar, categoria_simbolo varchar, distancia_metros integer, tipo_pista varchar, posicion integer, tiempo_ganador varchar, diferencia varchar, peso_llevado numeric, jockey_id uuid, jockey_nombre varchar, observaciones text, descalificado boolean not null default false, fuente varchar not null default 'local', created_at timestamptz not null default now()`,
  liquidacion_config: `id uuid primary key default gen_random_uuid(), club_id uuid not null, pct_propietario numeric not null default 70, pct_entrenador numeric not null default 10, pct_jockey numeric not null default 10, pct_peon numeric not null default 4, pct_capataz numeric not null default 3, pct_sereno numeric not null default 1, pct_fondo_solidario numeric not null default 2, incentivo_jockey_monto numeric not null default 0, incentivo_entrenador_monto numeric not null default 0, dias_antidoping integer not null default 30, retencion_dgi_pct numeric, vigente_desde date not null default CURRENT_DATE, vigente_hasta date, activo boolean not null default true, created_at timestamptz not null default now()`,
  comision_config: `id uuid primary key default gen_random_uuid(), club_id uuid not null, hipodromo_id uuid, categoria_id uuid, tipo_profesional tipo_profesional, tipo_cobro tipo_cobro not null, porcentaje numeric, monto_fijo numeric, posicion_bono integer, monto_bono numeric, descuento_fondo_solidario_pct numeric default 0, descuento_incentivo_pct numeric default 0, otros_descuentos jsonb, vigente_desde date not null, vigente_hasta date, descripcion text, activo boolean not null default true`,
  recibos: `id uuid primary key default gen_random_uuid(), club_id uuid not null, numero_recibo integer not null, beneficiario_tipo beneficiario_tipo not null, profesional_id uuid, propietario_id uuid, forma_pago forma_pago_recibo not null, total_premios numeric not null default 0, total_descuentos numeric not null default 0, retencion_dgi numeric, neto_a_cobrar numeric GENERATED ALWAYS AS (((total_premios - total_descuentos) - COALESCE(retencion_dgi, 0::numeric))) STORED, cobrador_nombre text, cobrador_documento text, comprobante_url text, estado estado_recibo not null default 'emitido', emitido_por uuid, emitido_at timestamptz not null default now(), anulado_at timestamptz, notas text, created_at timestamptz not null default now(), anulado_por uuid, motivo_anulacion text, lineas_anuladas jsonb`,
  liquidaciones: `id uuid primary key default gen_random_uuid(), club_id uuid not null, reunion_id uuid not null, profesional_id uuid, propietario_id uuid, periodo_desde date, periodo_hasta date, total_bruto numeric not null default 0, total_descuentos numeric not null default 0, total_neto numeric GENERATED ALWAYS AS ((total_bruto - total_descuentos)) STORED, estado estado_liquidacion not null default 'borrador', numero_recibo varchar, recibo_pdf_url text, aprobado_por uuid, pagado_at timestamptz, notas text, created_at timestamptz not null default now()`,
  liquidacion_detalle: `id uuid primary key default gen_random_uuid(), liquidacion_id uuid not null references liquidaciones(id) on delete cascade, carrera_id uuid, concepto varchar not null, descripcion text, monto_bruto numeric not null, porcentaje_desc numeric default 0, monto_descuento numeric default 0, monto_neto numeric GENERATED ALWAYS AS ((monto_bruto - monto_descuento)) STORED, orden_display integer default 0, estado_linea estado_linea_liq not null default 'impago', concepto_tipo concepto_liq, posicion integer, inscripcion_id uuid, fecha_liberacion date, pagado_at timestamptz, recibo_id uuid references recibos(id), beneficiario_tipo beneficiario_tipo, beneficiario_id uuid, reunion_id uuid`,
};
const ARRAY_COLS = { carreras: ['apuestas'] };

// Helpers de auth tal como están en prod (2026-09-22), con auth.uid() → NULL: en local
// no hay GoTrue, y NULL es exactamente lo que ve service_role.
const HELPERS = `
CREATE SCHEMA IF NOT EXISTS auth;
-- auth.uid() / auth.role() leen los claims del JWT igual que en Supabase: PostgREST deja el
-- payload en el GUC request.jwt.claims. Sin JWT (psql directo) los dos dan NULL/current_user,
-- que es lo que ve service_role.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', ''), current_user::text) $$;
CREATE OR REPLACE FUNCTION public.fn_club_de_carrera(p_carrera_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT r.club_id FROM reuniones r JOIN carreras c ON c.reunion_id = r.id WHERE c.id = p_carrera_id LIMIT 1; $$;
CREATE OR REPLACE FUNCTION public.fn_get_user_club_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid() AND activo; $$;
CREATE OR REPLACE FUNCTION public.fn_is_portal_user() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND activo AND rol IN ('propietario', 'profesional')); $$;
CREATE OR REPLACE FUNCTION public.fn_is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND rol = 'super_admin'); $$;
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_inscripciones_updated_at ON inscripciones;
CREATE TRIGGER trg_inscripciones_updated_at BEFORE UPDATE ON inscripciones FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Roles de PostgREST (el probe entra como service_role con un JWT local)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN PASSWORD 'authenticator' NOINHERIT; END IF;
END $$;
GRANT anon, authenticated, service_role TO authenticator;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role, authenticated;
`;

// ── lectura ──────────────────────────────────────────────────────────────────
async function q(p) { const { data, error } = await p; if (error) throw new Error(error.message); return data; }
async function all(table, build) {
  const out = []; let from = 0;
  for (;;) {
    const page = await q(build(sb.from(table).select('*')).range(from, from + 999));
    out.push(...page); if (page.length < 1000) break; from += 1000;
  }
  return out;
}
const reuniones = await all('reuniones', b => b.eq('id', RID));
const carreras  = await all('carreras',  b => b.eq('reunion_id', RID));
const carIds = carreras.map(c => c.id);
const inscripciones = await all('inscripciones', b => b.in('carrera_id', carIds));
const resultados    = await all('resultados',    b => b.in('carrera_id', carIds));
const resIds = resultados.map(r => r.id);
const resultado_posiciones = resIds.length ? await all('resultado_posiciones', b => b.in('resultado_id', resIds)) : [];
const performances  = await all('performances', b => b.in('carrera_id', carIds));
const liquidaciones = await all('liquidaciones', b => b.eq('reunion_id', RID));
const liquidacion_detalle = await all('liquidacion_detalle', b => b.eq('reunion_id', RID));
const reciboIds = [...new Set(liquidacion_detalle.map(d => d.recibo_id).filter(Boolean))];
const recibos = reciboIds.length ? await all('recibos', b => b.in('id', reciboIds)) : [];
const spcIds = [...new Set(inscripciones.map(i => i.spc_id))];
const spcs = spcIds.length ? await all('spcs', b => b.in('id', spcIds)) : [];
const profIdsRef = [...new Set([...inscripciones.flatMap(i => [i.jockey_titular_id, i.jockey_suplente_id, i.entrenador_id]),
  ...liquidacion_detalle.filter(d => d.beneficiario_tipo === 'profesional').map(d => d.beneficiario_id)].filter(Boolean))];
const profClub = await all('profesionales', b => b.eq('club_id', CLUB));
const profOtros = profIdsRef.filter(id => !profClub.some(p => p.id === id));
const profesionales = profClub.concat(profOtros.length ? await all('profesionales', b => b.in('id', profOtros)) : []);
const liquidacion_config = await all('liquidacion_config', b => b.eq('club_id', CLUB));
const comision_config    = await all('comision_config',    b => b.eq('club_id', CLUB));
const clubs = await all('clubs', b => b);   // los 3: P2 del probe necesita un club ajeno real (FK usuarios.club_id → clubs)

// ── serialización ────────────────────────────────────────────────────────────
const lit = (v, isArray) => {
  if (v === null || v === undefined) return 'NULL';
  if (isArray) return `ARRAY[${v.map(x => lit(x)).join(',')}]::text[]`;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const GENERATED = { recibos: ['neto_a_cobrar'], liquidaciones: ['total_neto'], liquidacion_detalle: ['monto_neto'] };
function inserts(table, rows) {
  if (!rows.length) return `-- ${table}: 0 filas\n`;
  const skip = new Set(GENERATED[table] || []);
  const cols = Object.keys(rows[0]).filter(c => !skip.has(c));
  const arr = new Set(ARRAY_COLS[table] || []);
  return `-- ${table}: ${rows.length} filas\n` + rows.map(r =>
    `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(c => lit(r[c], arr.has(c))).join(',')});`).join('\n') + '\n';
}

let schema = 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n';
for (const [n, vals] of Object.entries(ENUMS)) schema += `CREATE TYPE ${n} AS ENUM (${vals.map(v => `'${v}'`).join(',')});\n`;
for (const [t, ddl] of Object.entries(TABLES)) schema += `CREATE TABLE ${t} (${ddl});\n`;
schema += HELPERS;
writeFileSync(join(OUT, 'schema.sql'), schema);

let datos = 'BEGIN;\n';
datos += inserts('clubs', clubs) + inserts('reuniones', reuniones) + inserts('carreras', carreras)
  + inserts('spcs', spcs) + inserts('profesionales', profesionales) + inserts('inscripciones', inscripciones)
  + inserts('resultados', resultados) + inserts('resultado_posiciones', resultado_posiciones)
  + inserts('performances', performances) + inserts('liquidacion_config', liquidacion_config)
  + inserts('comision_config', comision_config) + inserts('recibos', recibos)
  + inserts('liquidaciones', liquidaciones) + inserts('liquidacion_detalle', liquidacion_detalle);
datos += 'COMMIT;\n';
writeFileSync(join(OUT, 'datos.sql'), datos);

console.log('escrito tests/local/out/{schema,datos}.sql');
for (const [k, v] of Object.entries({ reuniones, carreras, inscripciones, resultados, resultado_posiciones, performances, liquidaciones, liquidacion_detalle, recibos, spcs, profesionales, liquidacion_config, comision_config, clubs }))
  console.log(`  ${k.padEnd(22)} ${v.length}`);
