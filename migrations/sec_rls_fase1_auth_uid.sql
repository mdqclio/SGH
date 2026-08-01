-- ===========================================================================
-- SEC_RLS FASE 1 — Identidad por auth.uid() en lugar del email
-- ===========================================================================
-- PORTAL_V2_PLAN §B.1-B.2. Es el cambio de mayor palanca de toda la pasada:
-- mata dos problemas de un saque.
--
--   (i)  AMBIGÜEDAD CROSS-CLUB. fn_get_user_club_id() hacía
--        `WHERE email = auth.jwt()->>'email' LIMIT 1`. El único índice sobre
--        email es usuarios_club_id_email_key (club_id, email), así que el mismo
--        email en dos clubes es LEGAL — y el LIMIT 1 elegía un club arbitrario
--        EN SILENCIO. Con UNIQUE sobre auth_user_id el resultado ambiguo pasa a
--        ser imposible, no sólo improbable.
--
--   (ii) SUPLANTACIÓN. La identidad se derivaba de un campo escribible
--        (§D-H1: propietarios_update USING (true) + el portal matcheando por
--        email). auth.uid() sale del JWT firmado por GoTrue: no hay UPDATE que
--        lo cambie.
--
-- ROLLBACK: migrations/sec_rls_fase1_auth_uid_rollback.sql — escrito y
-- commiteado ANTES que este archivo.
--
-- PRE-CHEQUEO (read-only, corrido el 01/08/2026):
--   usuarios total ............. 3
--   con match en auth.users .... 3   ← 3/3, condición de avance cumplida
--   emails duplicados .......... 0 (ni en usuarios ni en auth.users)
--   auth.users huérfanos ....... 2 (sanfrancisco@sgh.com, clio@mdq.com.ar;
--                                   de abril, sin confirmar, sin login — la FK
--                                   va usuarios→auth.users, no los toca)
--
-- SIN FALLBACK POR EMAIL: el backfill cubre 3/3, así que las funciones
-- resuelven exclusivamente por auth.uid(). Si el backfill hubiera dejado
-- filas en NULL habría hecho falta la rama de compatibilidad.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1a. La columna
-- ---------------------------------------------------------------------------
-- ON DELETE SET NULL y no CASCADE: borrar una cuenta de Auth no debe hacer
-- desaparecer la fila de `usuarios` (que es la que lleva rol, club y el
-- histórico de auditoría). Queda huérfana y visible, que es lo que se quiere.
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS auth_user_id uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_auth_user_id
  ON public.usuarios (auth_user_id) WHERE auth_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 1a-bis. Backfill por email
-- ---------------------------------------------------------------------------
UPDATE public.usuarios u
SET auth_user_id = a.id
FROM auth.users a
WHERE lower(btrim(a.email)) = lower(btrim(u.email))
  AND u.auth_user_id IS NULL;

-- Guard duro: si quedó alguna fila sin vincular, la migración ABORTA.
-- Sin esto, esa persona perdería el acceso en silencio al cambiar las
-- funciones del paso 1b.
DO $guard$
DECLARE n_null int;
BEGIN
  SELECT count(*) INTO n_null FROM public.usuarios WHERE auth_user_id IS NULL;
  IF n_null > 0 THEN
    RAISE EXCEPTION
      'FASE 1 ABORTADA: % fila(s) de usuarios sin auth_user_id. '
      'Cambiar las funciones a auth.uid() les sacaría el acceso. '
      'Resolver el match o agregar la rama de fallback por email.', n_null;
  END IF;
  RAISE NOTICE 'FASE 1: backfill OK, 0 filas sin auth_user_id';
END
$guard$;

-- ---------------------------------------------------------------------------
-- 1a-ter. Autocompletado para filas NUEVAS
-- ---------------------------------------------------------------------------
-- AGREGADO respecto del plan original, y la razón importa: `usuarios.html` y
-- la edge function `invite-user` insertan en public.usuarios SIN conocer esta
-- columna. Después del paso 1b, una fila con auth_user_id NULL no resuelve
-- club — o sea, el próximo usuario que invite la secretaría no vería nada, y
-- el síntoma (pantallas vacías) no apunta a la causa.
--
-- El trigger resuelve el id contra auth.users por email en el INSERT. No
-- reintroduce la vulnerabilidad: sólo un super_admin puede insertar en
-- usuarios (usuarios_insert WITH CHECK fn_is_super_admin()), y lo que se
-- resuelve es un id inmutable, no una credencial.
--
-- Si la cuenta de Auth todavía no existe (invitación en vuelo), queda NULL y
-- el UPDATE posterior del email vuelve a intentarlo.
CREATE OR REPLACE FUNCTION public.fn_usuarios_set_auth_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.auth_user_id IS NULL AND NEW.email IS NOT NULL THEN
    SELECT a.id INTO NEW.auth_user_id
    FROM auth.users a
    WHERE lower(btrim(a.email)) = lower(btrim(NEW.email))
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_usuarios_set_auth_user_id ON public.usuarios;
CREATE TRIGGER trg_usuarios_set_auth_user_id
  BEFORE INSERT OR UPDATE OF email ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.fn_usuarios_set_auth_user_id();

-- ---------------------------------------------------------------------------
-- 1b. Las dos funciones de autorización, ahora sobre auth.uid()
-- ---------------------------------------------------------------------------
-- Se conservan STABLE + SECURITY DEFINER + search_path (GOTCHA #10: sin
-- SECURITY DEFINER las policies que las usan entran en recursión infinita).
-- Desaparece el LIMIT 1: con el índice único es innecesario, y su ausencia
-- deja que un duplicado imposible falle en vez de resolverse al azar.

CREATE OR REPLACE FUNCTION public.fn_get_user_club_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT club_id FROM usuarios
  WHERE auth_user_id = auth.uid();
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

COMMIT;

-- ===========================================================================
-- VERIFICACIÓN — esperado: 3 / 3 / 0 / 2 funciones sobre auth.uid()
-- ===========================================================================
-- SELECT
--   (SELECT count(*) FROM public.usuarios)                              AS usuarios,
--   (SELECT count(*) FROM public.usuarios WHERE auth_user_id IS NOT NULL) AS vinculados,
--   (SELECT count(*) FROM public.usuarios WHERE auth_user_id IS NULL)     AS sin_vincular,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname IN ('fn_get_user_club_id','fn_is_super_admin')
--       AND pg_get_functiondef(p.oid) LIKE '%auth.uid()%')               AS fn_por_auth_uid;
--
-- Y después, SIEMPRE:  node tests/probe_rls_secretaria.mjs   → debe dar 18/18
