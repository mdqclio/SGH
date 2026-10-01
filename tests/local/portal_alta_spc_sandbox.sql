-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SÓLO SANDBOX (tests/local) — NUNCA APLICAR EN PROD.
-- Base mínima para probar migrations/portal_alta_spc_studbook.sql sin tocar producción:
-- tablas con las columnas de prod (information_schema, 2026-10-01), RLS + las 4 políticas de
-- spcs y la de INSERT de inscripciones, y las funciones REALES copiadas de pg_get_functiondef de
-- prod el 2026-10-01 (fn_is_staff, fn_is_portal_user, fn_is_super_admin, fn_mis_entidades,
-- fn_mis_spc_ids, fn_mis_spc_visibles, fn_get_user_club_id, fn_club_de_carrera,
-- fn_edad_reglamentaria, set_updated_at, fn_auditoria_log, validar_inscripcion, rpc_inscribir,
-- rpc_padron_spcs) + auth.uid()/role()/jwt() de prod.
-- No replica: trg_insc_set_propietario ni trg_insc_monta_oficial (no los toca este flujo), el
-- resto de las tablas del club ni sus políticas (eso lo cubre probe_politicas_escritura_staff).
--
-- Se carga en una base APARTE del sandbox de siempre, así no pisa lo que haya en `sgh`:
--   docker exec -i sgh-local-pg psql -U postgres -c 'create database sgh_portal_alta'
--   docker exec -i sgh-local-pg psql -v ON_ERROR_STOP=1 -U postgres -d sgh_portal_alta < tests/local/portal_alta_spc_sandbox.sql
-- tests/probe_portal_alta_spc_studbook.mjs lo hace solo (template + una base por corrida).
-- Fechas relativas a now(): la carrera T1 queda con la inscripción abierta al cargar.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── auth (copia de prod) ─────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $function$
  select
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

-- ── ENUMs (valores de prod) ──────────────────────────────────────────────────────────────────
CREATE TYPE sexo_spc AS ENUM ('macho','hembra','castrado');
CREATE TYPE estado_spc AS ENUM ('activo','retirado','suspendido','fallecido','vendido');
CREATE TYPE canal_inscripcion AS ENUM ('manual','web','app','portal');
CREATE TYPE condicion_sexo AS ENUM ('ambos','machos','hembras','machos_castrados');
CREATE TYPE entidad_sancionada AS ENUM ('profesional','spc','propietario','caballeriza');
CREATE TYPE estado_inscripcion AS ENUM ('pre_inscripto','confirmado','ratificado','forfait','no_presentado','inscripto','mal_inscrito');
CREATE TYPE estado_reunion AS ENUM ('borrador','publicada','en_curso','finalizada','cancelada','suspendida','programada');
CREATE TYPE estado_sancion AS ENUM ('activa','cumplida','apelada','revocada');
CREATE TYPE rol_usuario AS ENUM ('super_admin','secretario_carreras','operador','profesional','propietario','publico');
CREATE TYPE tipo_pista AS ENUM ('cesped','arena','mixta','sintetica','tierra');
CREATE TYPE tipo_profesional AS ENUM ('jockey','entrenador','ambos');
CREATE TYPE tipo_reunion AS ENUM ('oficial','extraoficial','especial','nocturna');

-- ── Tablas (columnas de prod) ────────────────────────────────────────────────────────────────
CREATE TABLE clubs (id uuid primary key default uuid_generate_v4(), nombre varchar not null, sigla varchar not null, activo boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE TABLE usuarios (id uuid primary key default uuid_generate_v4(), club_id uuid not null references clubs(id), email varchar not null, password_hash text not null, nombre_completo varchar, rol rol_usuario not null default 'publico', entidad_tipo varchar, entidad_id uuid, activo boolean not null default true, ultimo_login timestamptz, created_at timestamptz not null default now(), telefono varchar, estado varchar default 'activo', auth_user_id uuid);
CREATE TABLE caballerizas (id uuid primary key default uuid_generate_v4(), club_id uuid not null references clubs(id), nombre varchar not null, responsable varchar, domicilio varchar, telefono varchar, activo boolean not null default true, notas text, estado varchar default 'activo', chaquetilla_descripcion varchar, chaquetilla_url varchar, hipodromo_patente varchar);
CREATE TABLE profesionales (id uuid primary key default uuid_generate_v4(), club_id uuid references clubs(id), tipo tipo_profesional not null, nombre varchar not null, apellido varchar not null, documento_tipo varchar, documento_nro varchar, fecha_nacimiento date, matricula_nro varchar, categoria_jockey varchar, peso_minimo numeric, peso_maximo numeric, caballeriza_id uuid, telefono varchar, email varchar, foto_url text, activo boolean not null default true, notas text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), patente varchar, hipodromo_patente varchar, localidad varchar, estado varchar default 'activo');
CREATE TABLE reuniones (id uuid primary key default uuid_generate_v4(), club_id uuid not null references clubs(id), hipodromo_id uuid not null, numero integer not null, fecha date not null, tipo tipo_reunion not null default 'oficial', estado estado_reunion not null default 'borrador', tiempo_clima varchar, observaciones text, creado_por uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), hora_cierre_ratificacion time not null default '12:00:00', fechas_inscripciones text, fechas_forfaits text, fechas_compromiso_montas text, sorteo_partidores text, numero_publico integer, es_prueba boolean not null default false, liquidacion_cerrada_at timestamptz, liquidacion_cerrada_nota text);
CREATE TABLE carreras (id uuid primary key default uuid_generate_v4(), reunion_id uuid not null references reuniones(id), numero_turno integer not null, nombre varchar, categoria_id uuid not null, tipo_pista tipo_pista not null default 'cesped', distancia_metros integer not null, edad_minima_anos integer, edad_maxima_anos integer, condicion_sexo condicion_sexo not null default 'ambos', condicion_handicap varchar, condicion_adicional text, bolsa_total numeric not null default 0, distribucion_premios jsonb, cupo_maximo integer, hora_estimada time, apertura_inscripcion timestamptz, cierre_inscripcion timestamptz, apertura_ratificacion timestamptz, cierre_ratificacion timestamptz, estado varchar default 'programada', bolsa_bonos numeric default 0, numero_carrera_programa integer, apuestas text[] default ARRAY[]::text[], apuestas_notas text, ganadas_desde integer, ganadas_hasta integer);
CREATE TABLE spcs (id uuid primary key default uuid_generate_v4(), club_id uuid references clubs(id) on delete cascade, nombre varchar not null, registro_stud_book varchar, fecha_nacimiento date not null, sexo sexo_spc not null, color varchar, marcas text, padrillo_nombre varchar, madre_nombre varchar, abuela_materna varchar, pais_origen varchar default 'Argentina', caballeriza_id uuid references caballerizas(id), entrenador_id uuid references profesionales(id), jockey_habitual_id uuid references profesionales(id), estado estado_spc not null default 'activo', notas text, doc_url text, foto_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), certificado_correr boolean default false, ult_performances text, studbook_id text);
CREATE UNIQUE INDEX spcs_studbook_id_uniq ON public.spcs USING btree (studbook_id) WHERE (studbook_id IS NOT NULL);
CREATE TABLE inscripciones (id uuid primary key default uuid_generate_v4(), carrera_id uuid not null references carreras(id), spc_id uuid not null references spcs(id), propietario_id uuid, entrenador_id uuid, jockey_titular_id uuid, jockey_suplente_id uuid, numero_partidor integer, peso_declarado numeric, peso_final numeric, estado estado_inscripcion not null default 'pre_inscripto', canal canal_inscripcion not null default 'manual', motivo_estado varchar, info_adicional text, inscripto_por uuid, ratificado_por uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), caballeriza_id uuid, peon varchar, capataz varchar, sereno varchar, certificado_correr boolean default false, peso_balanza numeric, performance text);
ALTER TABLE inscripciones ADD CONSTRAINT inscripciones_inscripto_por_fkey FOREIGN KEY (inscripto_por) REFERENCES usuarios(id);
CREATE TABLE spc_propietarios (id uuid primary key default uuid_generate_v4(), spc_id uuid not null references spcs(id), propietario_id uuid not null, porcentaje numeric not null default 100.00, fecha_desde date not null, fecha_hasta date, activo boolean not null default true);
CREATE TABLE sanciones (id uuid primary key default uuid_generate_v4(), club_id uuid not null, entidad_tipo entidad_sancionada not null, entidad_id uuid not null, tipo_sancion varchar not null, motivo text, codigo_resolucion varchar, fecha_inicio date not null, fecha_fin date, alcance varchar not null default 'club', estado estado_sancion not null default 'activa', resolucion_url text, notas text, creado_por uuid, created_at timestamptz not null default now(), modificado_por uuid, modificado_at timestamptz);
CREATE VIEW v_sanciones_vigentes AS SELECT id, club_id, entidad_tipo, entidad_id, tipo_sancion, motivo, codigo_resolucion, fecha_inicio, fecha_fin, alcance, estado, resolucion_url, notas, creado_por, created_at
   FROM sanciones WHERE estado = 'activa'::estado_sancion AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE);
CREATE TABLE auditoria (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid REFERENCES clubs(id), usuario_id uuid REFERENCES usuarios(id), tabla varchar NOT NULL, registro_id uuid, accion varchar NOT NULL, datos_antes jsonb, datos_despues jsonb, ip varchar, created_at timestamptz NOT NULL DEFAULT now());

-- GRANTs como prod (lo que protege es RLS)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- ── Funciones REALES de prod (pg_get_functiondef, 2026-10-01) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE auth_user_id = auth.uid()
      AND activo
      AND rol IN ('super_admin', 'secretario_carreras', 'operador')
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_is_portal_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE auth_user_id = auth.uid()
      AND activo
      AND rol IN ('propietario', 'profesional')
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE auth_user_id = auth.uid()
      AND rol = 'super_admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_mis_entidades()
 RETURNS TABLE(entidad_tipo text, entidad_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.entidad_tipo::text, u.entidad_id
  FROM usuarios u
  WHERE u.auth_user_id = auth.uid()
    AND u.activo
    AND u.entidad_tipo IS NOT NULL
    AND u.entidad_id IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.fn_mis_spc_ids()
 RETURNS TABLE(spc_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id FROM spcs s
   WHERE s.entrenador_id IN (
     SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'profesional')
  UNION
  SELECT sp.spc_id FROM spc_propietarios sp
   WHERE sp.activo
     AND sp.propietario_id IN (
       SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'propietario');
$function$;

CREATE OR REPLACE FUNCTION public.fn_mis_spc_visibles()
 RETURNS TABLE(spc_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.spc_id FROM fn_mis_spc_ids() m
  UNION
  SELECT i.spc_id
    FROM inscripciones i
    JOIN usuarios u ON u.id = i.inscripto_por
   WHERE u.auth_user_id = auth.uid() AND u.activo;
$function$;

CREATE OR REPLACE FUNCTION public.fn_get_user_club_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid() AND activo;
$function$;

CREATE OR REPLACE FUNCTION public.fn_club_de_carrera(p_carrera_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.club_id
  FROM reuniones r
  JOIN carreras c ON c.reunion_id = r.id
  WHERE c.id = p_carrera_id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.fn_edad_reglamentaria(p_fecha_ref date, p_fecha_nac date)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
           WHEN p_fecha_ref IS NULL OR p_fecha_nac IS NULL THEN NULL
           ELSE GREATEST(
                  EXTRACT(YEAR  FROM p_fecha_ref)::int
                - EXTRACT(YEAR  FROM p_fecha_nac)::int
                - CASE WHEN EXTRACT(MONTH FROM p_fecha_ref)::int < 7 THEN 1 ELSE 0 END,
                  0)
         END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_auditoria_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario_id UUID;
  v_club_id UUID;
  v_email TEXT;
  v_datos_antes JSONB;
  v_datos_despues JSONB;
  v_registro_id UUID;
BEGIN
  BEGIN
    v_email := auth.jwt() ->> 'email';
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  IF v_email IS NOT NULL THEN
    SELECT id, club_id INTO v_usuario_id, v_club_id
    FROM usuarios WHERE email = v_email LIMIT 1;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_registro_id := OLD.id;
    v_datos_antes := to_jsonb(OLD);
    v_datos_despues := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_registro_id := NEW.id;
    v_datos_antes := NULL;
    v_datos_despues := to_jsonb(NEW);
  ELSE
    v_registro_id := NEW.id;
    v_datos_antes := to_jsonb(OLD);
    v_datos_despues := to_jsonb(NEW);
    IF (v_datos_antes - 'updated_at') = (v_datos_despues - 'updated_at') THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'usuarios' THEN
    IF v_datos_antes IS NOT NULL THEN
      v_datos_antes := v_datos_antes - 'password_hash';
    END IF;
    IF v_datos_despues IS NOT NULL THEN
      v_datos_despues := v_datos_despues - 'password_hash';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'clubs' THEN
    IF TG_OP = 'DELETE' THEN v_club_id := OLD.id; ELSE v_club_id := NEW.id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      v_club_id := COALESCE((to_jsonb(OLD) ->> 'club_id')::UUID, v_club_id);
    ELSE
      v_club_id := COALESCE((to_jsonb(NEW) ->> 'club_id')::UUID, v_club_id);
    END IF;
  END IF;

  INSERT INTO auditoria (
    club_id, usuario_id, tabla, registro_id, accion,
    datos_antes, datos_despues, created_at
  ) VALUES (
    v_club_id, v_usuario_id, TG_TABLE_NAME, v_registro_id, TG_OP,
    v_datos_antes, v_datos_despues, NOW()
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validar_inscripcion(p_spc_id uuid, p_carrera_id uuid)
 RETURNS TABLE(puede_inscribirse boolean, motivo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_spc RECORD; v_carrera RECORD; v_edad_carrera INTEGER; v_sancion RECORD;
    -- Texto provisorio hasta que Fede defina qué se le puede decir al portal.
    v_generico CONSTANT TEXT := 'Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.';
    -- ¿Quién pregunta tiene derecho al motivo detallado? Staff siempre. Un usuario
    -- de portal, nunca — ni sobre su propio ejemplar — hasta que Fede lo defina.
    v_detalle BOOLEAN := fn_is_staff();
BEGIN
    SELECT * INTO v_spc FROM spcs WHERE id = p_spc_id;
    IF v_spc IS NULL THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'No se encontró el ejemplar.' ELSE v_generico END; RETURN;
    END IF;

    SELECT * INTO v_carrera FROM carreras WHERE id = p_carrera_id;
    IF v_carrera IS NULL THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'No se encontró la carrera.' ELSE v_generico END; RETURN;
    END IF;

    -- Regla del 1° de julio, centralizada en fn_edad_reglamentaria.
    -- ANTES (roto): DATE_PART('year', AGE(reunion.fecha, v_spc.fecha_nacimiento))
    -- daba el aniversario real. La fecha de referencia (reuniones.fecha) ya estaba bien.
    SELECT fn_edad_reglamentaria(r.fecha, v_spc.fecha_nacimiento)
      INTO v_edad_carrera
      FROM reuniones r
     WHERE r.id = v_carrera.reunion_id;

    IF v_spc.estado != 'activo' THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'El SPC no está activo: ' || v_spc.estado ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.edad_minima_anos IS NOT NULL AND v_edad_carrera < v_carrera.edad_minima_anos THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Edad insuficiente: ' || v_edad_carrera || ' años. Mínimo: ' || v_carrera.edad_minima_anos
            ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.edad_maxima_anos IS NOT NULL AND v_edad_carrera > v_carrera.edad_maxima_anos THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Excede edad máxima: ' || v_edad_carrera || ' años. Máximo: ' || v_carrera.edad_maxima_anos
            ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.condicion_sexo = 'machos' AND v_spc.sexo NOT IN ('macho', 'castrado') THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Carrera solo para machos.' ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.condicion_sexo = 'hembras' AND v_spc.sexo != 'hembra' THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Carrera solo para hembras.' ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.condicion_sexo = 'machos_castrados' AND v_spc.sexo != 'castrado' THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Carrera solo para castrados.' ELSE v_generico END; RETURN;
    END IF;

    SELECT * INTO v_sancion FROM v_sanciones_vigentes
     WHERE entidad_tipo = 'spc' AND entidad_id = p_spc_id LIMIT 1;
    IF FOUND THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'SPC con sanción vigente: ' || v_sancion.tipo_sancion ELSE v_generico END; RETURN;
    END IF;

    IF v_carrera.cupo_maximo IS NOT NULL THEN
        IF (SELECT COUNT(*) FROM inscripciones
             WHERE carrera_id = p_carrera_id AND estado != 'forfait') >= v_carrera.cupo_maximo THEN
            RETURN QUERY SELECT FALSE, 'Cupo máximo alcanzado.'; RETURN;
        END IF;
    END IF;

    RETURN QUERY SELECT TRUE, 'SPC habilitado para inscribirse.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_inscribir(p_spc_id uuid, p_carrera_id uuid, p_caballeriza_id uuid, p_entrenador_id uuid, p_jockey_titular_id uuid DEFAULT NULL::uuid, p_jockey_suplente_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario_id     uuid;
  v_carrera        RECORD;
  v_reunion_estado text;
  v_club_id        uuid;
  v_spc            RECORD;
  v_ok             boolean;
  v_motivo         text;
  v_id             uuid;
BEGIN
  -- Entidad de portal: profesional O propietario. Quién anota queda en
  -- inscripto_por; quién entrena se declara en p_entrenador_id.
  IF NOT EXISTS (
    SELECT 1 FROM fn_mis_entidades() e
     WHERE e.entidad_tipo IN ('profesional', 'propietario')
  ) THEN
    RAISE EXCEPTION 'No autorizado: esta operación es para usuarios del portal.';
  END IF;

  SELECT u.id INTO v_usuario_id
    FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: la cuenta no tiene usuario activo.';
  END IF;

  SELECT * INTO v_spc FROM spcs WHERE id = p_spc_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El caballo no existe.';
  END IF;

  SELECT c.*, r.estado::text AS reunion_estado, r.club_id AS club_id
    INTO v_carrera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE c.id = p_carrera_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La carrera no existe.';
  END IF;

  v_reunion_estado := v_carrera.reunion_estado;
  v_club_id        := v_carrera.club_id;

  IF v_reunion_estado IS DISTINCT FROM 'publicada'
     OR v_carrera.estado IS NOT DISTINCT FROM 'anulada'
     OR v_carrera.apertura_inscripcion IS NULL
     OR v_carrera.cierre_inscripcion  IS NULL
     OR now() < v_carrera.apertura_inscripcion
     OR now() > v_carrera.cierre_inscripcion
  THEN
    RAISE EXCEPTION 'La inscripción para ese turno no está abierta.';
  END IF;

  IF p_caballeriza_id IS NULL THEN
    RAISE EXCEPTION 'Falta la caballeriza: es obligatoria para anotar.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM caballerizas
     WHERE id = p_caballeriza_id AND activo AND club_id = v_club_id
  ) THEN
    RAISE EXCEPTION 'Esa caballeriza no existe o no está activa en este hipódromo.';
  END IF;

  IF p_entrenador_id IS NULL THEN
    RAISE EXCEPTION 'Falta el entrenador: hay que declarar quién presenta el caballo.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM profesionales
     WHERE id = p_entrenador_id AND activo
       AND tipo IN ('entrenador', 'ambos') AND club_id = v_club_id
  ) THEN
    RAISE EXCEPTION 'El entrenador declarado no está en el padrón activo de este hipódromo.';
  END IF;

  -- Jockey OPCIONAL al anotar: se define hasta el martes y es obligatorio en
  -- la ratificación. Si viene, tiene que ser del padrón.
  IF p_jockey_titular_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM profesionales
        WHERE id = p_jockey_titular_id AND activo
          AND tipo IN ('jockey', 'ambos') AND club_id = v_club_id
     )
  THEN
    RAISE EXCEPTION 'El jockey declarado no está en el padrón activo de este hipódromo.';
  END IF;

  IF p_jockey_suplente_id IS NOT NULL THEN
    IF p_jockey_titular_id IS NULL THEN
      RAISE EXCEPTION 'No se puede declarar un suplente sin jockey titular.';
    END IF;
    IF p_jockey_suplente_id = p_jockey_titular_id THEN
      RAISE EXCEPTION 'El suplente no puede ser el mismo jockey que el titular.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM profesionales
       WHERE id = p_jockey_suplente_id AND activo
         AND tipo IN ('jockey', 'ambos') AND club_id = v_club_id
    ) THEN
      RAISE EXCEPTION 'El jockey suplente no está en el padrón activo de este hipódromo.';
    END IF;
  END IF;

  SELECT v.puede_inscribirse, v.motivo
    INTO v_ok, v_motivo
    FROM validar_inscripcion(p_spc_id, p_carrera_id) v;

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'No se puede inscribir: %', COALESCE(v_motivo, 'no cumple las condiciones de la carrera');
  END IF;

  IF EXISTS (
    SELECT 1 FROM inscripciones
     WHERE carrera_id = p_carrera_id AND spc_id = p_spc_id
  ) THEN
    RAISE EXCEPTION 'Ese caballo ya está anotado en ese turno.';
  END IF;

  INSERT INTO inscripciones (
    carrera_id, spc_id, estado, canal, inscripto_por,
    entrenador_id, caballeriza_id, jockey_titular_id, jockey_suplente_id
  ) VALUES (
    p_carrera_id, p_spc_id,
    'inscripto',
    'portal',
    v_usuario_id,
    p_entrenador_id,
    p_caballeriza_id,
    p_jockey_titular_id,
    p_jockey_suplente_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_padron_spcs()
 RETURNS TABLE(id uuid, nombre text, sexo text, fecha_nacimiento date, color text, studbook_id text, padrillo_nombre text, madre_nombre text, estado text, habilitado boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Misma autorización que rpc_buscar_spc: staff o usuario de portal.
  IF NOT ((SELECT fn_is_staff()) OR (SELECT fn_is_portal_user())) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  RETURN QUERY
    SELECT s.id, s.nombre::text, s.sexo::text, s.fecha_nacimiento,
           s.color::text, s.studbook_id::text,
           s.padrillo_nombre::text, s.madre_nombre::text,
           s.estado::text,
           (s.estado = 'activo') AS habilitado
      FROM spcs s
     ORDER BY s.nombre;
END;
$function$;

-- ── Triggers que ya existen en prod sobre estas tablas ───────────────────────────────────────
CREATE TRIGGER trg_spcs_updated_at BEFORE UPDATE ON public.spcs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_inscripciones AFTER INSERT OR DELETE OR UPDATE ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();

-- ── RLS (políticas de prod, pg_policies 2026-10-01) ──────────────────────────────────────────
ALTER TABLE spcs ENABLE ROW LEVEL SECURITY;
CREATE POLICY spcs_delete ON spcs FOR DELETE TO authenticated USING (( SELECT fn_is_super_admin() AS fn_is_super_admin));
CREATE POLICY spcs_insert ON spcs FOR INSERT TO authenticated WITH CHECK (( SELECT fn_is_staff() AS fn_is_staff));
CREATE POLICY spcs_select ON spcs FOR SELECT TO authenticated USING ((( SELECT fn_is_staff() AS fn_is_staff) OR (id IN ( SELECT s.spc_id FROM fn_mis_spc_visibles() s(spc_id)))));
CREATE POLICY spcs_update ON spcs FOR UPDATE TO authenticated USING (( SELECT fn_is_staff() AS fn_is_staff)) WITH CHECK (( SELECT fn_is_staff() AS fn_is_staff));
ALTER TABLE inscripciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY inscripciones_insert ON inscripciones FOR INSERT TO public WITH CHECK (((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))));
CREATE POLICY inscripciones_select_probe ON inscripciones FOR SELECT TO authenticated USING (true);

-- ── Fixtures ─────────────────────────────────────────────────────────────────────────────────
INSERT INTO clubs (id, nombre, sigla) VALUES
  ('0649e9c5-9e87-4aad-842f-101458e6b33c', 'Hipódromo de Dolores (sandbox)', 'HDO');

INSERT INTO caballerizas (id, club_id, nombre) VALUES
  ('c0000000-0000-0000-0000-000000000001', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'STUD PROBE');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido) VALUES
  ('d0000000-0000-0000-0000-000000000001', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'Ent', 'Probe'),
  ('d0000000-0000-0000-0000-000000000002', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'Ent2', 'Probe');

-- auth_user_id = a1…; usuarios.id = e1…
INSERT INTO usuarios (id, club_id, email, password_hash, nombre_completo, rol, entidad_tipo, entidad_id, activo, auth_user_id) VALUES
  ('e0000000-0000-0000-0000-000000000001', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'portal1@probe', '', 'Portal Uno', 'profesional', 'profesional', 'd0000000-0000-0000-0000-000000000001', true,  'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'portal2@probe', '', 'Portal Dos', 'profesional', 'profesional', 'd0000000-0000-0000-0000-000000000002', true,  'a0000000-0000-0000-0000-000000000002'),
  ('e0000000-0000-0000-0000-000000000003', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'prop@probe',    '', 'Propietario', 'propietario', 'propietario', 'f0000000-0000-0000-0000-000000000001', true, 'a0000000-0000-0000-0000-000000000003'),
  ('e0000000-0000-0000-0000-000000000004', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'inactivo@probe','', 'Inactivo', 'profesional', 'profesional', 'd0000000-0000-0000-0000-000000000001', false, 'a0000000-0000-0000-0000-000000000004'),
  ('e0000000-0000-0000-0000-000000000005', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'sinent@probe',  '', 'Sin entidad', 'profesional', NULL, NULL, true, 'a0000000-0000-0000-0000-000000000005'),
  ('e0000000-0000-0000-0000-000000000006', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'staff@probe',   '', 'Staff', 'secretario_carreras', NULL, NULL, true, 'a0000000-0000-0000-0000-000000000006');

INSERT INTO reuniones (id, club_id, hipodromo_id, numero, fecha, estado) VALUES
  ('b0000000-0000-0000-0000-000000000001', '0649e9c5-9e87-4aad-842f-101458e6b33c', '0649e9c5-9e87-4aad-842f-101458e6b33c', 9999, current_date + 10, 'publicada');
INSERT INTO carreras (id, reunion_id, numero_turno, nombre, categoria_id, distancia_metros, apertura_inscripcion, cierre_inscripcion, estado) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 1, 'T1 abierta', gen_random_uuid(), 1000, now() - interval '1 day', now() + interval '1 day', 'abierta'),
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 2, 'T2 cerrada', gen_random_uuid(), 1000, now() - interval '3 days', now() - interval '1 hour', 'abierta'),
  ('b1000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 3, 'T3 anulada', gen_random_uuid(), 1000, now() - interval '1 day', now() + interval '1 day', 'anulada');

INSERT INTO spcs (id, nombre, fecha_nacimiento, sexo, padrillo_nombre, madre_nombre, studbook_id, created_at) VALUES
  -- Wave Rimout ×2 como en prod (f277af1c más vieja, 5ebc5e48 más nueva), sin studbook_id
  ('f277af1c-a4ac-4a98-87d7-b41871718c8d', 'Wave Rimout',  '2017-08-08', 'macho',  'Remote (GB)', 'Holiday Wave', NULL,     '2026-05-07'),
  ('5ebc5e48-2caf-4c44-be6a-ad75f2716850', 'Wave Rimout',  '2017-08-08', 'macho',  'Remote (GB)', 'Holiday Wave', NULL,     '2026-06-12'),
  -- D1: ya cargado con studbook_id
  ('5c000000-0000-0000-0000-000000000001', 'CON SB PROBE', '2020-09-01', 'macho',  'PADRE D1', 'MADRE D1', '400001', '2026-09-01'),
  -- D2: ficha vieja sin studbook_id
  ('5c000000-0000-0000-0000-000000000002', 'Ficha Vieja Probe', '2019-10-10', 'hembra', 'PADRE D2', 'MADRE D2', NULL, '2026-06-01'),
  -- D4: homónimo (otra fecha, otros padres)
  ('5c000000-0000-0000-0000-000000000003', 'BIEN COQUETA', '2021-10-15', 'hembra', 'Padre Coqueta 2021', 'Madre Coqueta 2021', '429819', '2026-09-11');
