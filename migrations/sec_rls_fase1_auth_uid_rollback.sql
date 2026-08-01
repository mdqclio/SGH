-- ===========================================================================
-- ROLLBACK de sec_rls_fase1_auth_uid.sql
-- ===========================================================================
-- Escrito y commiteado ANTES de aplicar la migración (regla de oro de la
-- pasada SEC_RLS: ninguna fase toca prod sin rollback commiteado primero).
--
-- Deja la DB exactamente como estaba antes de la FASE 1:
--   · fn_get_user_club_id() y fn_is_super_admin() vuelven a resolver por email
--   · desaparece el trigger de autocompletado
--   · desaparece la columna usuarios.auth_user_id
--
-- El fuente de las dos funciones es COPIA TEXTUAL de pg_get_functiondef()
-- tomada el 01/08/2026 antes de tocar nada. No reescribir de memoria.
--
-- ORDEN: primero se restauran las funciones (para que nada dependa de la
-- columna), después se dropea la columna. Invertirlo deja un intervalo en el
-- que las funciones referencian una columna que ya no existe.
--
-- CUÁNDO CORRERLO
-- Si probe_rls_secretaria.mjs (el canario) se pone rojo, o si algún usuario
-- real no puede loguearse. Sin discutir: primero se revierte, después se
-- averigua.
--
--   set -a; . ./.env; set +a
--   # aplicar por MCP apply_migration o psql
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Trigger de autocompletado — se va primero (depende de la columna)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_usuarios_set_auth_user_id ON public.usuarios;
DROP FUNCTION IF EXISTS public.fn_usuarios_set_auth_user_id();

-- ---------------------------------------------------------------------------
-- 2. fn_get_user_club_id() — fuente exacto previo a la FASE 1
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_user_club_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT club_id FROM usuarios
  WHERE email = (auth.jwt() ->> 'email')
  LIMIT 1;
$function$;

-- ---------------------------------------------------------------------------
-- 3. fn_is_super_admin() — fuente exacto previo a la FASE 1
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE email = (auth.jwt() ->> 'email')
      AND rol = 'super_admin'
  );
$function$;

-- ---------------------------------------------------------------------------
-- 4. La columna — última, ya sin dependencias
-- ---------------------------------------------------------------------------
ALTER TABLE public.usuarios DROP COLUMN IF EXISTS auth_user_id;

COMMIT;

-- ===========================================================================
-- VERIFICACIÓN — esperado: columna=0, y las dos funciones con 'auth.jwt'
-- ===========================================================================
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='usuarios'
--       AND column_name='auth_user_id') AS columna_quedo,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname IN ('fn_get_user_club_id','fn_is_super_admin')
--       AND pg_get_functiondef(p.oid) LIKE '%auth.jwt%') AS funciones_por_email;
