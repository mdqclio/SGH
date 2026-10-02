-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SÓLO SANDBOX (tests/local) — NUNCA APLICAR EN PROD.
-- Base mínima para probar las 4 migraciones de ISSUE-102/101/089 (resultados en reunión cerrada):
-- resultados_backfill_oficializado, resultados_guard_cerrada, aplicar_resultado_v2, desoficializar_carrera_v2.
-- Columnas, constraints, políticas y funciones auxiliares copiadas de prod el 2026-10-02 (pg_get_functiondef /
-- pg_policies / information_schema). aplicar_resultado y desoficializar_carrera v1 NO están acá: el probe las
-- crea aplicando migrations/rollback_aplicar_resultado_v2.sql y rollback_desoficializar_carrera_v2.sql (= v1 exacta).
-- Lo usa tests/probe_resultados_cerrada.mjs (template + una base por corrida en el contenedor sgh-local-pg).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $function$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$function$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $function$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text
$function$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $function$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$function$;

CREATE TYPE rol_usuario AS ENUM ('super_admin','secretario_carreras','operador','profesional','propietario','publico');
CREATE TYPE estado_resultado AS ENUM ('provisional','oficial','en_protesta');
CREATE TYPE estado_linea_liq AS ENUM ('impago','pagado','retenido');
CREATE TYPE concepto_liq AS ENUM ('premio','bono','actuacion','incentivo_jockey','incentivo_entrenador','fondo_solidario');
CREATE TYPE beneficiario_tipo AS ENUM ('profesional','propietario','club');

CREATE TABLE clubs (id uuid primary key default uuid_generate_v4(), nombre varchar not null, sigla varchar not null);
CREATE TABLE usuarios (id uuid primary key default uuid_generate_v4(), club_id uuid not null references clubs(id), email varchar not null, password_hash text not null default '', nombre_completo varchar, rol rol_usuario not null default 'publico', entidad_tipo varchar, entidad_id uuid, activo boolean not null default true, estado varchar default 'activo', auth_user_id uuid);
CREATE TABLE reuniones (id uuid primary key default uuid_generate_v4(), club_id uuid not null references clubs(id), numero integer not null, fecha date not null, liquidacion_cerrada_at timestamptz, liquidacion_cerrada_nota text);
CREATE TABLE carreras (id uuid primary key default uuid_generate_v4(), reunion_id uuid not null references reuniones(id), numero_turno integer not null, numero_carrera_programa integer, estado varchar default 'programada');
CREATE TABLE inscripciones (id uuid primary key default uuid_generate_v4(), carrera_id uuid not null references carreras(id), spc_id uuid, estado varchar default 'ratificado');
CREATE TABLE resultados (id uuid not null default uuid_generate_v4() primary key, carrera_id uuid not null unique references carreras(id) on delete cascade, estado estado_resultado not null default 'provisional', tiempo_ganador varchar, dividendos jsonb, incidentes text, observaciones text, oficializado_por uuid references usuarios(id), oficializado_at timestamptz, created_at timestamptz not null default now(), estado_pista varchar check (estado_pista in ('seca','humeda','fangosa','pesada')), favorito_mandil integer, redistribucion_legs jsonb default '{}'::jsonb, updated_at timestamptz default now());
CREATE TABLE resultado_posiciones (id uuid not null default uuid_generate_v4() primary key, resultado_id uuid not null references resultados(id) on delete cascade, inscripcion_id uuid not null references inscripciones(id), posicion integer, tiempo varchar, diferencia varchar, descalificado boolean not null default false, motivo_desc text, empate boolean default false, dividendo numeric, no_largo boolean not null default false, unique (resultado_id, posicion));
CREATE TABLE resultado_apuestas (id uuid not null default gen_random_uuid() primary key, resultado_id uuid not null references resultados(id) on delete cascade, tipo varchar not null check (tipo in ('GAN','SEG','TER','EX','IM','TR','CUAT','X2','X2P','X3','X4','X5','CAD')), val_apu numeric not null default 100, composicion varchar, pozo numeric, vales integer, div_orig numeric, div_inc numeric, vacante boolean not null default false, orden smallint not null default 0, created_at timestamptz default now());
CREATE TABLE liquidacion_detalle (id uuid primary key default uuid_generate_v4(), carrera_id uuid, inscripcion_id uuid, reunion_id uuid, estado_linea estado_linea_liq not null default 'impago', recibo_id uuid, monto_bruto numeric not null default 0);
CREATE TABLE auditoria (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid REFERENCES clubs(id), usuario_id uuid REFERENCES usuarios(id), tabla varchar NOT NULL, registro_id uuid, accion varchar NOT NULL, datos_antes jsonb, datos_despues jsonb, ip varchar, created_at timestamptz NOT NULL DEFAULT now());

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- ── Funciones auxiliares REALES de prod ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_is_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND activo AND rol IN ('super_admin', 'secretario_carreras', 'operador'));
$function$;
CREATE OR REPLACE FUNCTION public.fn_is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND rol = 'super_admin');
$function$;
CREATE OR REPLACE FUNCTION public.fn_is_portal_user() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND activo AND rol IN ('propietario', 'profesional'));
$function$;
CREATE OR REPLACE FUNCTION public.fn_get_user_club_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid() AND activo;
$function$;
CREATE OR REPLACE FUNCTION public.fn_club_de_carrera(p_carrera_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT r.club_id FROM reuniones r JOIN carreras c ON c.reunion_id = r.id WHERE c.id = p_carrera_id LIMIT 1;
$function$;
CREATE OR REPLACE FUNCTION public.fn_club_de_inscripcion(p_inscripcion_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT r.club_id FROM reuniones r JOIN carreras c ON c.reunion_id = r.id JOIN inscripciones i ON i.carrera_id = c.id WHERE i.id = p_inscripcion_id LIMIT 1;
$function$;
CREATE OR REPLACE FUNCTION public.fn_club_de_resultado(p_resultado_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT fn_club_de_carrera(carrera_id) FROM resultados WHERE id = p_resultado_id LIMIT 1;
$function$;
CREATE OR REPLACE FUNCTION public.fn_reunion_liq_cerrada(p_reunion_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS (SELECT 1 FROM reuniones WHERE id = p_reunion_id AND liquidacion_cerrada_at IS NOT NULL);
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_auditoria_log() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_usuario_id UUID; v_club_id UUID; v_email TEXT; v_datos_antes JSONB; v_datos_despues JSONB; v_registro_id UUID;
BEGIN
  BEGIN v_email := auth.jwt() ->> 'email'; EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  IF v_email IS NOT NULL THEN SELECT id, club_id INTO v_usuario_id, v_club_id FROM usuarios WHERE email = v_email LIMIT 1; END IF;
  IF TG_OP = 'DELETE' THEN v_registro_id := OLD.id; v_datos_antes := to_jsonb(OLD); v_datos_despues := NULL;
  ELSIF TG_OP = 'INSERT' THEN v_registro_id := NEW.id; v_datos_antes := NULL; v_datos_despues := to_jsonb(NEW);
  ELSE
    v_registro_id := NEW.id; v_datos_antes := to_jsonb(OLD); v_datos_despues := to_jsonb(NEW);
    IF (v_datos_antes - 'updated_at') = (v_datos_despues - 'updated_at') THEN RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME = 'clubs' THEN
    IF TG_OP = 'DELETE' THEN v_club_id := OLD.id; ELSE v_club_id := NEW.id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN v_club_id := COALESCE((to_jsonb(OLD) ->> 'club_id')::UUID, v_club_id);
    ELSE v_club_id := COALESCE((to_jsonb(NEW) ->> 'club_id')::UUID, v_club_id); END IF;
  END IF;
  INSERT INTO auditoria (club_id, usuario_id, tabla, registro_id, accion, datos_antes, datos_despues, created_at)
  VALUES (v_club_id, v_usuario_id, TG_TABLE_NAME, v_registro_id, TG_OP, v_datos_antes, v_datos_despues, NOW());
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

CREATE TRIGGER resultados_set_updated_at BEFORE UPDATE ON public.resultados FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_resultados AFTER INSERT OR DELETE OR UPDATE ON public.resultados FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();

-- ── RLS + políticas de prod (2026-10-02) ─────────────────────────────────────────────────────
ALTER TABLE resultados ENABLE ROW LEVEL SECURITY;
ALTER TABLE resultado_posiciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE resultado_apuestas ENABLE ROW LEVEL SECURITY;
CREATE POLICY resultados_select ON resultados FOR SELECT TO authenticated USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));
CREATE POLICY resultados_insert ON resultados FOR INSERT TO authenticated WITH CHECK (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));
CREATE POLICY resultados_update ON resultados FOR UPDATE TO authenticated USING (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))) WITH CHECK (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));
CREATE POLICY resultados_delete ON resultados FOR DELETE TO authenticated USING (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));
CREATE POLICY resultado_posiciones_select ON resultado_posiciones FOR SELECT TO authenticated USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));
CREATE POLICY resultado_posiciones_insert ON resultado_posiciones FOR INSERT TO authenticated WITH CHECK (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));
CREATE POLICY resultado_posiciones_update ON resultado_posiciones FOR UPDATE TO authenticated USING (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))) WITH CHECK (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));
CREATE POLICY resultado_posiciones_delete ON resultado_posiciones FOR DELETE TO authenticated USING (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_inscripcion(inscripcion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));
CREATE POLICY resultado_apuestas_select ON resultado_apuestas FOR SELECT TO authenticated USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));
CREATE POLICY resultado_apuestas_insert ON resultado_apuestas FOR INSERT TO authenticated WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));
CREATE POLICY resultado_apuestas_update ON resultado_apuestas FOR UPDATE TO authenticated USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))) WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));
CREATE POLICY resultado_apuestas_delete ON resultado_apuestas FOR DELETE TO authenticated USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));

-- ── Fixtures ─────────────────────────────────────────────────────────────────────────────────
INSERT INTO clubs (id, nombre, sigla) VALUES ('0649e9c5-9e87-4aad-842f-101458e6b33c', 'Dolores (sandbox)', 'DOL');
-- auth a…N / usuarios e…N
INSERT INTO usuarios (id, club_id, email, nombre_completo, rol, entidad_tipo, entidad_id, activo, auth_user_id) VALUES
  ('e0000000-0000-0000-0000-000000000001', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'secre@probe', 'Secretario', 'secretario_carreras', NULL, NULL, true, 'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'operador@probe', 'Operador', 'operador', NULL, NULL, true, 'a0000000-0000-0000-0000-000000000002'),
  ('e0000000-0000-0000-0000-000000000003', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'super@probe', 'Super', 'super_admin', NULL, NULL, true, 'a0000000-0000-0000-0000-000000000003'),
  ('e0000000-0000-0000-0000-000000000004', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'portal@probe', 'Portal', 'profesional', 'profesional', gen_random_uuid(), true, 'a0000000-0000-0000-0000-000000000004'),
  ('e0000000-0000-0000-0000-000000000005', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'publico@probe', 'Publico con club', 'publico', NULL, NULL, true, 'a0000000-0000-0000-0000-000000000005');

-- R8 (cerrada) y R9 (abierta)
INSERT INTO reuniones (id, club_id, numero, fecha, liquidacion_cerrada_at, liquidacion_cerrada_nota) VALUES
  ('b0000000-0000-0000-0000-000000000008', '0649e9c5-9e87-4aad-842f-101458e6b33c', 8, '2026-08-16', '2026-09-25 16:30:44+00', 'Congelada (sandbox)'),
  ('b0000000-0000-0000-0000-000000000009', '0649e9c5-9e87-4aad-842f-101458e6b33c', 9, '2026-09-20', NULL, NULL);
INSERT INTO carreras (id, reunion_id, numero_turno, numero_carrera_programa, estado) VALUES
  ('c8000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000008', 4, 3, 'abierta'),   -- R8 C3: oficial, con plata comprometida
  ('c8000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000008', 7, 5, 'abierta'),   -- R8 C5: oficial, SIN plata comprometida
  ('c8000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000008', 9, NULL, 'abierta'),-- R8 turno 9: sin resultado
  ('c9000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000009', 5, 4, 'abierta'),   -- R9 C4: oficial
  ('c9000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000009', 9, 6, 'abierta'),   -- R9 C6: provisional
  ('c9000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000009', 11, 8, 'abierta');  -- R9 C8: sin resultado
INSERT INTO inscripciones (carrera_id) SELECT c.id FROM carreras c, generate_series(1, 3) g;

INSERT INTO resultados (id, carrera_id, estado, estado_pista, created_at, updated_at) VALUES
  ('f8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', 'oficial', 'seca', '2026-08-16 17:00', '2026-08-23 11:06'),
  ('f8000000-0000-0000-0000-000000000002', 'c8000000-0000-0000-0000-000000000002', 'oficial', 'seca', '2026-08-16 18:00', '2026-08-16 18:30'),
  ('f9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'oficial', 'seca', '2026-09-20 18:10', '2026-09-20 18:17'),
  ('f9000000-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-000000000002', 'provisional', 'seca', '2026-09-20 19:00', '2026-09-20 19:00');
INSERT INTO resultado_posiciones (resultado_id, inscripcion_id, posicion, no_largo)
  SELECT r.id, i.id, row_number() OVER (PARTITION BY r.id ORDER BY i.id), false
    FROM resultados r JOIN inscripciones i ON i.carrera_id = r.carrera_id;
INSERT INTO resultado_apuestas (resultado_id, tipo, div_orig, orden) SELECT id, 'GAN', 3.5, 1 FROM resultados;
-- plata comprometida sólo en R8 C3 (y una línea pagada en R9 C4 para que desoficializar la rechace por pagos)
INSERT INTO liquidacion_detalle (carrera_id, reunion_id, estado_linea) VALUES
  ('c8000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000008', 'pagado'),
  ('c8000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000008', 'impago');

-- Auditoría de las transiciones a oficial (para el backfill). R8 C3 re-oficializada: vale la ÚLTIMA (operador).
-- Antes, se borra lo que generó la propia carga del fixture (trg_audit_resultados ya estaba activo): si no,
-- el INSERT de hoy como 'oficial' sería la "última transición" y el backfill tomaría now().
DELETE FROM auditoria;
INSERT INTO auditoria (tabla, registro_id, accion, usuario_id, datos_antes, datos_despues, created_at) VALUES
  ('resultados', 'f8000000-0000-0000-0000-000000000001', 'UPDATE', 'e0000000-0000-0000-0000-000000000001', '{"estado":"provisional"}', '{"estado":"oficial"}', '2026-08-16 17:30:00+00'),
  ('resultados', 'f8000000-0000-0000-0000-000000000001', 'UPDATE', 'e0000000-0000-0000-0000-000000000001', '{"estado":"oficial"}', '{"estado":"provisional"}', '2026-08-20 10:00:00+00'),
  ('resultados', 'f8000000-0000-0000-0000-000000000001', 'UPDATE', 'e0000000-0000-0000-0000-000000000002', '{"estado":"provisional"}', '{"estado":"oficial"}', '2026-08-23 11:06:06+00'),
  ('resultados', 'f8000000-0000-0000-0000-000000000002', 'INSERT', NULL, NULL, '{"estado":"oficial"}', '2026-08-16 18:30:00+00'),
  ('resultados', 'f9000000-0000-0000-0000-000000000001', 'INSERT', 'e0000000-0000-0000-0000-000000000001', NULL, '{"estado":"provisional"}', '2026-09-20 18:10:29+00'),
  ('resultados', 'f9000000-0000-0000-0000-000000000001', 'UPDATE', 'e0000000-0000-0000-0000-000000000001', '{"estado":"provisional"}', '{"estado":"oficial"}', '2026-09-20 18:17:24+00');
