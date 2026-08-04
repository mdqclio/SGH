-- ============================================================
-- ROLLBACK del Gate 2 de auto-registro
-- ============================================================
-- Escrito y commiteado ANTES de aplicar la migración.
-- Base: main @ 8a91183 (Gate 1 ya aplicado).
--
-- El Gate 2 sólo AGREGA: una tabla nueva y cuatro RPCs. No modifica nada
-- preexistente. Por eso el rollback es un drop limpio y no puede romper el
-- estado anterior.
--
-- ⚠️ DROP TABLE solicitudes_acceso BORRA LAS SOLICITUDES CARGADAS. Si ya hay
--    solicitudes reales de los pilotos de Fede, exportarlas antes:
--      SELECT * FROM solicitudes_acceso;
--    Las aprobaciones ya efectuadas NO se revierten: viven como filas en
--    `usuarios` con entidad_tipo/entidad_id y siguen funcionando. Si además
--    hay que deshacerlas, es a mano y con su propio gate.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.rpc_descartar_solicitud(uuid);
DROP FUNCTION IF EXISTS public.rpc_rechazar_solicitud(uuid, text);
DROP FUNCTION IF EXISTS public.rpc_aprobar_solicitud(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.rpc_solicitar_acceso(text, text, text, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.fn_solicitudes_guard_staff(uuid);

DROP TABLE IF EXISTS public.solicitudes_acceso;

-- Verificación dentro de la transacción, ANTES del COMMIT.
SELECT count(*) AS tabla_restante
FROM pg_class WHERE relname = 'solicitudes_acceso' AND relnamespace = 'public'::regnamespace;

SELECT count(*) AS rpcs_restantes
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'rpc_%solicit%';

COMMIT;
