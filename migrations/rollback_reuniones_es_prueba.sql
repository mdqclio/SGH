-- ROLLBACK de migrations/reuniones_es_prueba.sql (ISSUE-055).
--
-- Orden inverso. Se puede correr entero (revierte todo) o sólo el paso 1 (desmarca la 9999 y deja
-- la columna, que es el rollback "blando": el filtro de liquidaciones.html deja de esconder nada
-- sin tener que revertir el HTML).
--
-- PRE-REQUISITO del paso 3: liquidaciones.html NO debe seguir pidiendo la columna
-- (.eq('es_prueba', true) → 400 si la columna no existe). Revertir el HTML primero.
--
-- Ninguna vista referencia es_prueba: v_inscriptos_carrera y v_programa_reunion dependen de
-- reuniones pero se crearon antes de la columna, así que el DROP no necesita CASCADE.

BEGIN;

-- 1) Desmarcar (rollback blando — suficiente para que vuelva a aparecer en Pagos).
UPDATE public.reuniones SET es_prueba = false WHERE es_prueba;

-- 2) Índice.
DROP INDEX IF EXISTS public.reuniones_es_prueba_idx;

-- 3) Columna. Sólo con el HTML ya revertido.
ALTER TABLE public.reuniones DROP COLUMN IF EXISTS es_prueba;

COMMIT;
