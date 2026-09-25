-- ═══════════════════════════════════════════════════════════════════════════════
-- ISSUE-091 — Liquidación CERRADA por reunión + marcado de R6 y R8 (congeladas)
--
-- ESTADO EN PRODUCCIÓN: **NO APLICADA.** Se aplica sólo con OK explícito, y en este orden
-- (condición a del OK del 25/09): (1) ESTE archivo entero —columna, triggers y marcado de
-- R6/R8 en la MISMA transacción—; (2) recién después, deploy del motor y la UI de la rama
-- feat/reparto-100-subroles; (3) recién después, el recálculo de R9 con
-- tests/recalculo_r9_subroles.mjs. Si algo falla en el medio, se para.
--
-- md5(pg_get_functiondef) esperado (medido aplicando ESTE archivo en el sandbox tests/local/,
-- GOTCHA #99; hay que compararlo inmediatamente después del apply_migration):
--   fn_reunion_liq_cerrada   → 11730b64066014745a40500ab5f97fb0 (292 bytes)
--   fn_liq_cerrada_guard     → c0eaf6277644b9d5ec6529697707d3a4 (825 bytes)
--   fn_reunion_cierre_guard  → feb6722228b1b22ee3f06ab3c4069c31 (781 bytes)
--   select p.proname, md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname in ('fn_reunion_liq_cerrada','fn_liq_cerrada_guard','fn_reunion_cierre_guard');
--
-- Por qué: el motor (liquidaciones-engine.js) recalcula la reunión ENTERA con los datos de hoy.
-- En R6/R8, saldadas el 28/08, un recálculo haría nacer como cobrables las líneas de todo lo que
-- se completó después (33 líneas, $1.345.823,34 — ISSUE-091) y, con el reparto al 100 % de la
-- misma rama, además el 8 % de peón/capataz/sereno (225 líneas, $2.315.016,02). Medido con el
-- motor real en seco: docs/diagnosticos/2026-09-25_plan-reparto-100-subroles-fase1.md (reports).
--
-- Qué hace:
--   1. reuniones.liquidacion_cerrada_at / liquidacion_cerrada_nota. NULL = abierta.
--   2. Trigger en liquidacion_detalle y liquidaciones (INSERT/UPDATE/DELETE): si la reunión
--      está cerrada, RAISE P0091. Pasan SÓLO service_role (auth.role()) y la sesión directa sin
--      JWT (auth.role() IS NULL: migraciones por MCP/psql), que es por donde se regulariza.
--      Nadie más: ni super_admin. Para tocar plata de una reunión cerrada, primero se reabre.
--      Alcanza también a emitir_recibo / anular_recibo / liberar_linea sobre esas líneas: la
--      reunión queda congelada entera, que es lo que se pidió.
--   3. Trigger en reuniones: cerrar o reabrir (cambiar liquidacion_cerrada_at / _nota) sólo lo
--      hacen super_admin, service_role o una migración. La UI para cerrar queda FUERA de este
--      cambio (decisión 6 del 25/09): por ahora se cierra por migración.
--   4. Cierra R6 y R8 TAL COMO ESTÁN (decisión 2 del 25/09), en esta misma transacción.
--
-- Rollback: migrations/rollback_reunion_liquidacion_cerrada.sql (saca triggers, funciones y
-- columnas; R6/R8 vuelven a quedar abiertas).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.reuniones
  ADD COLUMN IF NOT EXISTS liquidacion_cerrada_at   timestamptz,
  ADD COLUMN IF NOT EXISTS liquidacion_cerrada_nota text;

COMMENT ON COLUMN public.reuniones.liquidacion_cerrada_at IS
  'ISSUE-091: si no es NULL, la liquidación de la reunión está cerrada (saldada): el motor no recalcula y la base rechaza escrituras en liquidacion_detalle/liquidaciones (salvo service_role o migración).';

CREATE OR REPLACE FUNCTION public.fn_reunion_liq_cerrada(p_reunion_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM reuniones WHERE id = p_reunion_id AND liquidacion_cerrada_at IS NOT NULL);
$function$;

CREATE OR REPLACE FUNCTION public.fn_liq_cerrada_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old uuid;
  v_new uuid;
BEGIN
  -- Regularización: service_role (API con la secret key) o sesión directa sin JWT (migración).
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := OLD.reunion_id; END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') THEN v_new := NEW.reunion_id; END IF;
  IF fn_reunion_liq_cerrada(v_old) OR fn_reunion_liq_cerrada(v_new) THEN
    RAISE EXCEPTION 'La liquidación de esta reunión está cerrada (saldada): no se puede modificar %. ISSUE-091', TG_TABLE_NAME
      USING ERRCODE = 'P0091';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS trg_liq_detalle_cerrada ON public.liquidacion_detalle;
CREATE TRIGGER trg_liq_detalle_cerrada
  BEFORE INSERT OR UPDATE OR DELETE ON public.liquidacion_detalle
  FOR EACH ROW EXECUTE FUNCTION public.fn_liq_cerrada_guard();

DROP TRIGGER IF EXISTS trg_liquidaciones_cerrada ON public.liquidaciones;
CREATE TRIGGER trg_liquidaciones_cerrada
  BEFORE INSERT OR UPDATE OR DELETE ON public.liquidaciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_liq_cerrada_guard();

CREATE OR REPLACE FUNCTION public.fn_reunion_cierre_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.liquidacion_cerrada_at   IS NOT DISTINCT FROM OLD.liquidacion_cerrada_at
     AND NEW.liquidacion_cerrada_nota IS NOT DISTINCT FROM OLD.liquidacion_cerrada_nota THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.liquidacion_cerrada_at IS NULL AND NEW.liquidacion_cerrada_nota IS NULL THEN
    RETURN NEW;
  END IF;
  IF auth.role() IS NULL OR auth.role() = 'service_role' OR fn_is_super_admin() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Sólo un super_admin puede cerrar o reabrir la liquidación de una reunión. ISSUE-091'
    USING ERRCODE = '42501';
END $function$;

DROP TRIGGER IF EXISTS trg_reunion_cierre ON public.reuniones;
CREATE TRIGGER trg_reunion_cierre
  BEFORE INSERT OR UPDATE OF liquidacion_cerrada_at, liquidacion_cerrada_nota ON public.reuniones
  FOR EACH ROW EXECUTE FUNCTION public.fn_reunion_cierre_guard();

REVOKE ALL ON FUNCTION public.fn_liq_cerrada_guard()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_reunion_cierre_guard() FROM PUBLIC, anon, authenticated;

-- ── R6 y R8: se cierran TAL COMO ESTÁN (decisión 2, 25/09) ─────────────────────────────
UPDATE public.reuniones
   SET liquidacion_cerrada_at   = now(),
       liquidacion_cerrada_nota = 'Congelada tal como está (saldado administrativo del 28/08): SIN el 8 % de peón/capataz/sereno '
                               || 'y SIN las líneas de ISSUE-091. NO es la decisión final sobre esa plata: queda congelada '
                               || 'hasta que Fede conteste. Decisión del 25/09/2026.'
 WHERE id IN ('b02ca761-6f44-4720-86aa-a3c3099019ea',   -- R6 2026-06-20
              '7b6e003e-22e2-4629-bf55-f18560b1260f')   -- R8 2026-08-16
   AND club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
   AND liquidacion_cerrada_at IS NULL;

-- Si R6/R8 existen (prod), tienen que haber quedado cerradas las dos; si no, se aborta TODO.
-- (En el sandbox de tests/local no existen: 0 filas, pasa.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.reuniones
              WHERE id IN ('b02ca761-6f44-4720-86aa-a3c3099019ea', '7b6e003e-22e2-4629-bf55-f18560b1260f')
                AND liquidacion_cerrada_at IS NULL) THEN
    RAISE EXCEPTION 'R6/R8 no quedaron cerradas: se aborta la migración entera';
  END IF;
END $$;

COMMIT;
