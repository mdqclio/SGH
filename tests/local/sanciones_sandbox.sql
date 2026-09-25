-- ═══════════════════════════════════════════════════════════════════════════════
-- SÓLO SANDBOX (tests/local) — NUNCA APLICAR EN PROD.
-- Recrea `sanciones` como está en prod el 2026-09-25 (antes de migrations/sanciones_insert_update_staff.sql):
-- enums, tabla, FKs, RLS, grants y las 4 políticas copiadas de pg_policies, más lo que la de SELECT
-- necesita y el clon de la 9999 no trae (fn_mis_entidades, fn_mis_spc_ids, spc_propietarios, spcs.entrenador_id).
-- Uso: tests/local/up.sh sql < tests/local/sanciones_sandbox.sql   (idempotente: DROP de la tabla y recrea)
-- Diferencia deliberada con prod: id default gen_random_uuid() (el sandbox no tiene uuid-ossp).
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entidad_sancionada') THEN
    CREATE TYPE entidad_sancionada AS ENUM ('profesional', 'spc', 'propietario', 'caballeriza'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_sancion') THEN
    CREATE TYPE estado_sancion AS ENUM ('activa', 'cumplida', 'apelada', 'revocada'); END IF;
END $$;

ALTER TABLE spcs ADD COLUMN IF NOT EXISTS entrenador_id uuid;
CREATE TABLE IF NOT EXISTS spc_propietarios (id uuid primary key default gen_random_uuid(), spc_id uuid, propietario_id uuid,
  porcentaje numeric, fecha_desde date, fecha_hasta date, activo boolean default true);

CREATE OR REPLACE FUNCTION public.fn_mis_entidades()
 RETURNS TABLE(entidad_tipo text, entidad_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT u.entidad_tipo::text, u.entidad_id FROM usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.activo AND u.entidad_tipo IS NOT NULL AND u.entidad_id IS NOT NULL;
$function$;
CREATE OR REPLACE FUNCTION public.fn_mis_spc_ids()
 RETURNS TABLE(spc_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT s.id FROM spcs s WHERE s.entrenador_id IN (SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'profesional')
  UNION
  SELECT sp.spc_id FROM spc_propietarios sp WHERE sp.activo
     AND sp.propietario_id IN (SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'propietario');
$function$;

DROP TABLE IF EXISTS sanciones;
CREATE TABLE sanciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  entidad_tipo entidad_sancionada NOT NULL,
  entidad_id uuid NOT NULL,
  tipo_sancion varchar NOT NULL,
  motivo text,
  codigo_resolucion varchar,
  fecha_inicio date NOT NULL,
  fecha_fin date,
  alcance varchar NOT NULL DEFAULT 'club',
  estado estado_sancion NOT NULL DEFAULT 'activa',
  resolucion_url text,
  notas text,
  creado_por uuid REFERENCES usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sanciones ENABLE ROW LEVEL SECURITY;
GRANT ALL ON sanciones TO anon, authenticated, service_role;

-- Políticas como en prod el 2026-09-25.
CREATE POLICY sanciones_delete ON sanciones FOR DELETE TO authenticated USING ((SELECT fn_is_super_admin()));
CREATE POLICY sanciones_insert ON sanciones FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id())));
CREATE POLICY sanciones_update ON sanciones FOR UPDATE TO authenticated
  USING ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id())))
  WITH CHECK ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id())));
CREATE POLICY sanciones_select ON sanciones FOR SELECT TO authenticated USING (
  (SELECT fn_is_super_admin())
  OR ((SELECT fn_is_staff()) AND ((club_id = (SELECT fn_get_user_club_id())) OR ((alcance)::text <> 'club'::text)))
  OR ((entidad_tipo = 'profesional'::entidad_sancionada) AND (entidad_id IN (SELECT e.entidad_id FROM fn_mis_entidades() e(entidad_tipo, entidad_id) WHERE (e.entidad_tipo = 'profesional'::text))))
  OR ((entidad_tipo = 'propietario'::entidad_sancionada) AND (entidad_id IN (SELECT e.entidad_id FROM fn_mis_entidades() e(entidad_tipo, entidad_id) WHERE (e.entidad_tipo = 'propietario'::text))))
  OR ((entidad_tipo = 'spc'::entidad_sancionada) AND (entidad_id IN (SELECT s.spc_id FROM fn_mis_spc_ids() s(spc_id))))
);
NOTIFY pgrst, 'reload schema';
