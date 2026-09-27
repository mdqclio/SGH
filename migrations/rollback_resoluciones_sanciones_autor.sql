-- ROLLBACK de migrations/resoluciones_sanciones_autor.sql (ISSUE-097, pieza A).
-- Saca los triggers y la función, y las columnas nuevas (modificado_por, modificado_at: SE PIERDE lo que hayan
-- registrado). creado_por NO se toca (existía antes) ni se borran sus valores; se quitan los COMMENT.
BEGIN;
DROP TRIGGER IF EXISTS trg_resoluciones_autor ON public.resoluciones;
DROP TRIGGER IF EXISTS trg_sanciones_autor ON public.sanciones;
DROP FUNCTION IF EXISTS public.fn_autor_fila();
ALTER TABLE public.resoluciones DROP COLUMN IF EXISTS modificado_por, DROP COLUMN IF EXISTS modificado_at;
ALTER TABLE public.sanciones    DROP COLUMN IF EXISTS modificado_por, DROP COLUMN IF EXISTS modificado_at;
COMMENT ON COLUMN public.resoluciones.creado_por IS NULL;
COMMENT ON COLUMN public.sanciones.creado_por IS NULL;
COMMIT;
