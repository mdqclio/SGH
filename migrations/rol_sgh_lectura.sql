-- migrations/rol_sgh_lectura.sql — rol de Postgres de SOLO LECTURA para consultas directas (psql / cliente SQL).
-- Pedido 2026-10-02. Aplicar por MCP apply_migration. Rollback: migrations/rollback_rol_sgh_lectura.sql.
--
-- QUÉ ES:
--   · LOGIN y BYPASSRLS (decisión del 02/10: tiene que poder leer los datos; las 37 tablas tienen RLS y ninguna política
--     aplica a un rol nuevo). Sin superusuario, sin CREATEDB / CREATEROLE / REPLICATION, sin herencia.
--   · USAGE en el schema public y SELECT en sus tablas y vistas actuales, MENOS las que guardan secretos:
--       usuarios            (password_hash)
--       club_configuracion  (tabla clave/valor para configuración: hoy vacía, pensada para tokens y claves)
--     Nada de INSERT/UPDATE/DELETE/TRUNCATE en ninguna.
--   · statement_timeout 30 s; default_transaction_read_only = on; idle_in_transaction_session_timeout 60 s; hasta 3 conexiones.
--
-- LA CONTRASEÑA NO VA ACÁ: el repo es público y la base registra el DDL (log_statement = 'ddl'). Se pone después con
-- `ALTER ROLE sgh_lectura PASSWORD 'SCRAM-SHA-256$…'` usando el VERIFICADOR SCRAM calculado afuera (nunca el texto plano),
-- y la contraseña se entrega por la terminal.
--
-- LÍMITES QUE ESTE ROL NO PUEDE CAMBIAR (ver el informe 2026-10-02_rol-lectura-sgh.md):
--   · Con BYPASSRLS lee TODO lo de las tablas con SELECT, incluidos datos personales (DNI, teléfonos, emails de
--     profesionales, propietarios, solicitudes_acceso, caballeriza_responsables, apoderados, recibos.cobrador_documento).
--   · EXECUTE: las funciones con EXECUTE para PUBLIC las puede ejecutar cualquier rol (no se puede negar a uno solo).
--     Medido el 2026-10-02: las 16 SECURITY DEFINER no-trigger ejecutables por PUBLIC sólo leen.
--   · TEMPORARY sobre la base viene de PUBLIC; con default_transaction_read_only no puede crear tablas temporales salvo
--     que cambie esa variable en su sesión (la variable no es un candado; el candado son los GRANT).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgh_lectura') THEN
    CREATE ROLE sgh_lectura LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 3;
  END IF;
END $$;

GRANT CONNECT ON DATABASE postgres TO sgh_lectura;
GRANT USAGE ON SCHEMA public TO sgh_lectura;
-- SELECT tabla por tabla (y vistas), salvo las de secretos. Sólo las que existen hoy: las nuevas no, a propósito.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
             AND c.relname NOT IN ('usuarios', 'club_configuracion')
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO sgh_lectura', r.relname);
  END LOOP;
END $$;
-- Por si alguna vez se otorgó: las de secretos, explícitamente sin nada.
REVOKE ALL ON public.usuarios, public.club_configuracion FROM sgh_lectura;

ALTER ROLE sgh_lectura SET statement_timeout = '30s';
ALTER ROLE sgh_lectura SET default_transaction_read_only = on;
ALTER ROLE sgh_lectura SET idle_in_transaction_session_timeout = '60s';
