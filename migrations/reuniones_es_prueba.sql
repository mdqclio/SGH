-- ISSUE-055 — reuniones.es_prueba
-- Separa "dato de prueba" (sandbox) de "evento suspendido" (estado='cancelada').
-- Una reunión cancelada de verdad es un evento real y PUEDE tener plata legítima para pagar:
-- filtrar el circuito de cobro por estado='cancelada' escondería pagos reales. Por eso un flag
-- propio y explícito.
--
-- Guards al momento de escribir esta migración (2026-08-29):
--   pwd  = /home/clio/dev/SGH
--   spcs = 181
--   ref  = unlhcuanfrtpatoipwve
--
-- Aplicar con apply_migration (DDL). El UPDATE dispara trg_audit_reuniones → queda en auditoría.

BEGIN;

-- 1) La columna. NOT NULL DEFAULT false: toda reunión existente queda como reunión real.
ALTER TABLE public.reuniones
  ADD COLUMN IF NOT EXISTS es_prueba boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.reuniones.es_prueba IS
  'Reunión de datos de prueba (sandbox), no un evento real. Sus líneas se excluyen del circuito de cobro (Pagos) cuando el operador no eligió reunión. NO confundir con estado=''cancelada'': eso es una reunión real suspendida, que sí puede tener plata legítima para pagar.';

-- 2) Índice parcial. El universo son 13 filas hoy, pero cobrosBuscar corre con cada tecla del
--    buscador (debounce 300 ms) y la consulta se cachea por sesión: barato igual.
CREATE INDEX IF NOT EXISTS reuniones_es_prueba_idx
  ON public.reuniones (club_id) WHERE es_prueba;

-- 3) Marcado. SOLO la 9999 de Dolores. Triple condición (club + numero + id) a propósito:
--    cualquiera de las tres sola podría alcanzar a otra fila en el futuro.
UPDATE public.reuniones
   SET es_prueba = true
 WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
   AND numero  = 9999
   AND id      = 'a0000000-0000-0000-0000-000000009999';

-- 4) Guard duro: exactamente 1 reunión marcada en toda la base. Si no, aborta la transacción.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.reuniones WHERE es_prueba;
  IF n <> 1 THEN
    RAISE EXCEPTION 'es_prueba: esperaba 1 reunión marcada, encontré %', n;
  END IF;
END $$;

COMMIT;

-- Verificación post-aplicación (correr aparte):
--   SELECT id, numero, fecha, estado, es_prueba FROM reuniones WHERE es_prueba;
--   → 1 fila: 9999 · 2099-01-01 · cancelada · true
