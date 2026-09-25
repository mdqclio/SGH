-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK de migrations/reunion_liquidacion_cerrada.sql (ISSUE-091)
--
-- Saca los tres triggers, las tres funciones y las dos columnas. R6 y R8 vuelven a quedar
-- ABIERTAS: si el motor nuevo ya está desplegado, un recálculo de R6/R8 generaría las 258 líneas
-- ($3.660.839,36) que esto protege. Por eso el orden del rollback es el inverso del deploy:
-- primero volver el motor/UI a main, después este archivo.
--
-- ESTADO EN PRODUCCIÓN: no aplicada (tampoco la migración).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER IF EXISTS trg_liq_detalle_cerrada   ON public.liquidacion_detalle;
DROP TRIGGER IF EXISTS trg_liquidaciones_cerrada ON public.liquidaciones;
DROP TRIGGER IF EXISTS trg_reunion_cierre        ON public.reuniones;

DROP FUNCTION IF EXISTS public.fn_liq_cerrada_guard();
DROP FUNCTION IF EXISTS public.fn_reunion_cierre_guard();
DROP FUNCTION IF EXISTS public.fn_reunion_liq_cerrada(uuid);

ALTER TABLE public.reuniones
  DROP COLUMN IF EXISTS liquidacion_cerrada_nota,
  DROP COLUMN IF EXISTS liquidacion_cerrada_at;

COMMIT;
