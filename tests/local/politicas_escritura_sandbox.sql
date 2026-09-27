-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SÓLO SANDBOX (tests/local) — NUNCA APLICAR EN PROD.
-- Réplica de las 14 tablas de ISSUE-093 como están en prod el 2026-09-27, ANTES de
-- migrations/politicas_escritura_staff_14.sql: crea las que el clon de la 9999 no trae (columnas de
-- prod, sin FKs), las funciones fn_club_de_* que faltan, habilita RLS, crea las políticas de SELECT
-- (la de clubs se llama clubs_select también en prod; en las demás el nombre es el mismo patrón) y
-- las 36 de escritura de hoy.
--   tests/local/up.sh sql < tests/local/politicas_escritura_sandbox.sql
-- Para volver el sandbox a su estado de antes: tests/local/up.sh (recarga todo).
-- GENERADO por tests/local/gen_politicas_escritura_staff.py — no editar a mano.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS caballerizas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL, nombre varchar NOT NULL,
  responsable varchar, domicilio varchar, telefono varchar, activo boolean NOT NULL DEFAULT true, notas text, estado varchar DEFAULT 'activo',
  chaquetilla_descripcion varchar, chaquetilla_url varchar, hipodromo_patente varchar);
CREATE TABLE IF NOT EXISTS caballeriza_responsables (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), caballeriza_id uuid NOT NULL, profesional_id uuid,
  apellido varchar, nombre varchar, documento_tipo varchar DEFAULT 'DNI', documento_nro varchar, fecha_nacimiento date, localidad varchar,
  rol varchar DEFAULT 'propietario', porcentaje numeric, activo boolean DEFAULT true, created_at timestamp DEFAULT now(), propietario_id uuid);
CREATE TABLE IF NOT EXISTS carrera_apuestas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), carrera_id uuid NOT NULL, tipo varchar NOT NULL,
  precio numeric NOT NULL CHECK (precio > 0), nombre text, asegurado numeric, incremento numeric, orden smallint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(), UNIQUE (carrera_id, tipo));
CREATE TABLE IF NOT EXISTS categorias_carrera (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL, nombre varchar NOT NULL,
  codigo varchar NOT NULL, descripcion text, es_computable boolean NOT NULL DEFAULT true, es_oficial boolean NOT NULL DEFAULT true, simbolo varchar,
  color_hex varchar, orden_display integer NOT NULL DEFAULT 0, activo boolean NOT NULL DEFAULT true, UNIQUE (club_id, codigo));
CREATE TABLE IF NOT EXISTS club_configuracion (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL, clave varchar NOT NULL,
  valor text, descripcion text, UNIQUE (club_id, clave));
CREATE TABLE IF NOT EXISTS hipodromos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL, nombre varchar NOT NULL,
  sigla varchar NOT NULL, localidad varchar, provincia varchar, tipo_pista varchar, activo boolean NOT NULL DEFAULT true,
  cantidad_gateras integer DEFAULT 12, UNIQUE (club_id, sigla));
CREATE TABLE IF NOT EXISTS novedades_reunion (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reunion_id uuid NOT NULL, carrera_id uuid, spc_id uuid,
  tipo_novedad varchar NOT NULL, descripcion text, hora_novedad timestamptz NOT NULL DEFAULT now(), visibilidad varchar NOT NULL DEFAULT 'interna',
  creado_por uuid);
CREATE TABLE IF NOT EXISTS resoluciones (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), club_id uuid NOT NULL, reunion_id uuid, numero varchar NOT NULL,
  fecha date NOT NULL, tipo varchar NOT NULL, texto text, documento_url text, estado varchar NOT NULL DEFAULT 'borrador', creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (club_id, numero));
CREATE TABLE IF NOT EXISTS resolucion_entidades (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resolucion_id uuid NOT NULL, entidad_tipo varchar NOT NULL,
  entidad_id uuid NOT NULL, descripcion text);
CREATE TABLE IF NOT EXISTS resultado_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resultado_id uuid NOT NULL, usuario_id uuid, accion text NOT NULL,
  datos_antes jsonb, datos_despues jsonb, created_at timestamptz NOT NULL DEFAULT now());

CREATE OR REPLACE FUNCTION public.fn_club_de_caballeriza(p_caballeriza_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT club_id FROM caballerizas WHERE id = p_caballeriza_id LIMIT 1; $function$;
CREATE OR REPLACE FUNCTION public.fn_club_de_resolucion(p_resolucion_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT club_id FROM resoluciones WHERE id = p_resolucion_id LIMIT 1; $function$;
CREATE OR REPLACE FUNCTION public.fn_club_de_resultado(p_resultado_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT fn_club_de_carrera(carrera_id) FROM resultados WHERE id = p_resultado_id LIMIT 1; $function$;

-- "otro club" para los perfiles de control (en prod existe: Mi Club Hípico)
INSERT INTO clubs (id, nombre, sigla) VALUES ('a6da7e40-1515-45dc-8933-4eef33ce937a', 'Mi Club Hípico', 'MCH') ON CONFLICT DO NOTHING;

ALTER TABLE public.caballeriza_responsables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrera_apuestas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias_carrera ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_secuencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comision_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hipodromos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidacion_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.novedades_reunion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resolucion_entidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resoluciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resultado_apuestas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resultado_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caballeriza_responsables TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carrera_apuestas TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorias_carrera TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_configuracion TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_secuencias TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clubs TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comision_config TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hipodromos TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liquidacion_config TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.novedades_reunion TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resolucion_entidades TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resoluciones TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resultado_apuestas TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resultado_log TO authenticated, anon;

DROP POLICY IF EXISTS caballeriza_responsables_select ON public.caballeriza_responsables;
CREATE POLICY caballeriza_responsables_select ON public.caballeriza_responsables AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS carrera_apuestas_select ON public.carrera_apuestas;
CREATE POLICY carrera_apuestas_select ON public.carrera_apuestas AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS categorias_carrera_select ON public.categorias_carrera;
CREATE POLICY categorias_carrera_select ON public.categorias_carrera AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS club_configuracion_select ON public.club_configuracion;
CREATE POLICY club_configuracion_select ON public.club_configuracion AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS clubs_select ON public.clubs;
CREATE POLICY clubs_select ON public.clubs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS comision_config_select ON public.comision_config;
CREATE POLICY comision_config_select ON public.comision_config AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS hipodromos_select ON public.hipodromos;
CREATE POLICY hipodromos_select ON public.hipodromos AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS novedades_reunion_select ON public.novedades_reunion;
CREATE POLICY novedades_reunion_select ON public.novedades_reunion AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resolucion_entidades_select ON public.resolucion_entidades;
CREATE POLICY resolucion_entidades_select ON public.resolucion_entidades AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resoluciones_select ON public.resoluciones;
CREATE POLICY resoluciones_select ON public.resoluciones AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resultado_apuestas_select ON public.resultado_apuestas;
CREATE POLICY resultado_apuestas_select ON public.resultado_apuestas AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resultado_log_select ON public.resultado_log;
CREATE POLICY resultado_log_select ON public.resultado_log AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS caballeriza_responsables_delete ON public.caballeriza_responsables;
CREATE POLICY caballeriza_responsables_delete ON public.caballeriza_responsables AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS caballeriza_responsables_insert ON public.caballeriza_responsables;
CREATE POLICY caballeriza_responsables_insert ON public.caballeriza_responsables AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS caballeriza_responsables_update ON public.caballeriza_responsables;
CREATE POLICY caballeriza_responsables_update ON public.caballeriza_responsables AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_caballeriza(caballeriza_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS carrera_apuestas_delete ON public.carrera_apuestas;
CREATE POLICY carrera_apuestas_delete ON public.carrera_apuestas AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS carrera_apuestas_insert ON public.carrera_apuestas;
CREATE POLICY carrera_apuestas_insert ON public.carrera_apuestas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS carrera_apuestas_update ON public.carrera_apuestas;
CREATE POLICY carrera_apuestas_update ON public.carrera_apuestas AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS categorias_carrera_delete ON public.categorias_carrera;
CREATE POLICY categorias_carrera_delete ON public.categorias_carrera AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS categorias_carrera_insert ON public.categorias_carrera;
CREATE POLICY categorias_carrera_insert ON public.categorias_carrera AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS categorias_carrera_update ON public.categorias_carrera;
CREATE POLICY categorias_carrera_update ON public.categorias_carrera AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS club_configuracion_delete ON public.club_configuracion;
CREATE POLICY club_configuracion_delete ON public.club_configuracion AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS club_configuracion_insert ON public.club_configuracion;
CREATE POLICY club_configuracion_insert ON public.club_configuracion AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS club_configuracion_update ON public.club_configuracion;
CREATE POLICY club_configuracion_update ON public.club_configuracion AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS club_secuencias_rls ON public.club_secuencias;
CREATE POLICY club_secuencias_rls ON public.club_secuencias AS PERMISSIVE FOR ALL TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS clubs_update_self_or_admin ON public.clubs;
CREATE POLICY clubs_update_self_or_admin ON public.clubs AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS comision_config_delete ON public.comision_config;
CREATE POLICY comision_config_delete ON public.comision_config AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS comision_config_insert ON public.comision_config;
CREATE POLICY comision_config_insert ON public.comision_config AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS comision_config_update ON public.comision_config;
CREATE POLICY comision_config_update ON public.comision_config AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS hipodromos_delete ON public.hipodromos;
CREATE POLICY hipodromos_delete ON public.hipodromos AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS hipodromos_insert ON public.hipodromos;
CREATE POLICY hipodromos_insert ON public.hipodromos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS hipodromos_update ON public.hipodromos;
CREATE POLICY hipodromos_update ON public.hipodromos AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS liquidacion_config_rls ON public.liquidacion_config;
CREATE POLICY liquidacion_config_rls ON public.liquidacion_config AS PERMISSIVE FOR ALL TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS novedades_reunion_delete ON public.novedades_reunion;
CREATE POLICY novedades_reunion_delete ON public.novedades_reunion AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS novedades_reunion_insert ON public.novedades_reunion;
CREATE POLICY novedades_reunion_insert ON public.novedades_reunion AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS novedades_reunion_update ON public.novedades_reunion;
CREATE POLICY novedades_reunion_update ON public.novedades_reunion AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_reunion(reunion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resolucion_entidades_delete ON public.resolucion_entidades;
CREATE POLICY resolucion_entidades_delete ON public.resolucion_entidades AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resolucion_entidades_insert ON public.resolucion_entidades;
CREATE POLICY resolucion_entidades_insert ON public.resolucion_entidades AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resolucion_entidades_update ON public.resolucion_entidades;
CREATE POLICY resolucion_entidades_update ON public.resolucion_entidades AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resoluciones_delete ON public.resoluciones;
CREATE POLICY resoluciones_delete ON public.resoluciones AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resoluciones_insert ON public.resoluciones;
CREATE POLICY resoluciones_insert ON public.resoluciones AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resoluciones_update ON public.resoluciones;
CREATE POLICY resoluciones_update ON public.resoluciones AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resultado_apuestas_delete ON public.resultado_apuestas;
CREATE POLICY resultado_apuestas_delete ON public.resultado_apuestas AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resultado_apuestas_insert ON public.resultado_apuestas;
CREATE POLICY resultado_apuestas_insert ON public.resultado_apuestas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resultado_apuestas_update ON public.resultado_apuestas;
CREATE POLICY resultado_apuestas_update ON public.resultado_apuestas AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resultado_log_delete ON public.resultado_log;
CREATE POLICY resultado_log_delete ON public.resultado_log AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resultado_log_insert ON public.resultado_log;
CREATE POLICY resultado_log_insert ON public.resultado_log AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));

DROP POLICY IF EXISTS resultado_log_update ON public.resultado_log;
CREATE POLICY resultado_log_update ON public.resultado_log AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
  WITH CHECK ((( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resultado(resultado_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))));
