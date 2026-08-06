-- ============================================================
-- Gate 4.1 — valor 'portal' en el ENUM canal_inscripcion
-- ============================================================
-- Ver docs/AUTOREGISTRO_GATE_4.md §C.5.
--
-- El ENUM es ('manual','web','app'). Falta 'portal', que es el valor que
-- corresponde: 'web' es ambiguo porque el back office también es web.
--
-- ⚠️ VA EN SU PROPIA MIGRACIÓN, ANTES que rpc_inscribir.sql.
--    Postgres no permite usar un valor de ENUM en la misma transacción en
--    la que se lo agregó.
--
-- Es aditivo y seguro: sólo ADD VALUE, nunca quitar (GOTCHAS #11).
-- Ningún consumidor rompe — hoy nadie filtra por `canal` y las 186 filas
-- están en 'manual'.
-- ============================================================

ALTER TYPE canal_inscripcion ADD VALUE IF NOT EXISTS 'portal';

-- ============================================================
-- VERIFICACIÓN
--   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'canal_inscripcion' ORDER BY e.enumsortorder;
--   -- esperado: manual, web, app, portal
--
-- ROLLBACK: no hay. Un valor de ENUM no se puede quitar sin recrear el tipo
-- y todas sus dependencias. Por eso es aditivo y por eso no molesta: si el
-- gate 4 se cae, el valor queda sin usar y no afecta a nadie.
-- ============================================================
