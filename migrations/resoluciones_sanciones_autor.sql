-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ESTADO EN PRODUCCIÓN: **APLICADA el 2026-09-27** (`20260927223658 resoluciones_sanciones_autor`). Foto de prod después = tests/local/resoluciones_sanciones_md5_esperado.txt (55/55). Probe --prod 32/32. Este bloque de ESTADO
-- se agregó DESPUÉS de aplicar: las sentencias son idénticas a las aplicadas.
-- ISSUE-097 · pieza A — autor y última modificación EN LA FILA, impuestos por la base.
--
-- resoluciones y sanciones:
--   · creado_por      (ya existía, nullable, FK usuarios): lo pone la base al INSERT con el usuarios.id de
--                      la sesión (auth.uid() → usuarios.auth_user_id). Lo que mande el cliente se ignora.
--                      Sin sesión (service_role, MCP, migración) queda NULL. En las ediciones queda CONGELADO
--                      (siempre: tampoco una migración lo cambia sin deshabilitar el trigger a propósito).
--   · modificado_por  (nueva, nullable, FK usuarios) y modificado_at (nueva, timestamptz, nullable): NULL al
--                      crear; en cada UPDATE, el usuario de la sesión (NULL sin sesión) y now().
-- Motivo de tenerlo en la fila y no sólo en la auditoría: la auditoría se purga a los 12 meses
-- (fn_purgar_auditoria) y una suspensión dura más.
--
-- Las resoluciones N° 39 y 40 (cargadas el 2026-09-27 18:10 y 18:14, hora argentina) QUEDAN SIN AUTOR:
-- se cargaron antes de este cambio, resoluciones.html no mandaba creado_por y la tabla no tenía auditoría.
-- Decisión del 27/09: no completarlas a mano. Queda explicado en el COMMENT de la columna.
--
-- Rollback: migrations/rollback_resoluciones_sanciones_autor.sql
-- Probe:    tests/probe_resoluciones_sanciones_autor.mjs (sandbox, GOTCHA #101)
-- md5 esperado de pg_get_functiondef(fn_autor_fila), medido en el sandbox: ver
-- tests/local/resoluciones_sanciones_md5_esperado.txt
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE public.resoluciones
  ADD COLUMN IF NOT EXISTS modificado_por uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS modificado_at  timestamptz;
ALTER TABLE public.sanciones
  ADD COLUMN IF NOT EXISTS modificado_por uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS modificado_at  timestamptz;

CREATE OR REPLACE FUNCTION public.fn_autor_fila()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario uuid := (SELECT u.id FROM usuarios u WHERE u.auth_user_id = auth.uid());
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.creado_por     := v_usuario;
    NEW.modificado_por := NULL;
    NEW.modificado_at  := NULL;
  ELSE
    NEW.creado_por     := OLD.creado_por;
    NEW.modificado_por := v_usuario;
    NEW.modificado_at  := now();
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_resoluciones_autor BEFORE INSERT OR UPDATE ON public.resoluciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_autor_fila();
CREATE TRIGGER trg_sanciones_autor BEFORE INSERT OR UPDATE ON public.sanciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_autor_fila();

COMMENT ON COLUMN public.resoluciones.creado_por IS
  'Lo impone la base (trg_resoluciones_autor, ISSUE-097): usuarios.id de la sesión al crear; NULL sin sesión. '
  'Las N° 39 y 40 (2026-09-27) quedaron NULL: se cargaron antes del cambio y no hay registro de quién las cargó.';
COMMENT ON COLUMN public.sanciones.creado_por IS
  'Lo impone la base (trg_sanciones_autor, ISSUE-097): usuarios.id de la sesión al crear; NULL sin sesión.';

COMMIT;
