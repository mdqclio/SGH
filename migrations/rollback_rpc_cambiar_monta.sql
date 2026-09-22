-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK de migrations/rpc_cambiar_monta.sql (ISSUE-084)
--
-- Deja la base exactamente como antes: sin trigger sobre inscripciones.jockey_titular_id
-- y sin la RPC. No toca datos: la migración no escribe filas al aplicarse, y las que la
-- RPC borra en uso (líneas NO comprometidas del jockey saliente) las regenera el motor
-- en el recálculo siguiente — no hay nada que deshacer a nivel datos.
--
-- Con el rollback aplicado y el front nuevo (saveMontas → rpc), Montas falla con
-- "function rpc_cambiar_monta does not exist" hasta volver a aplicar la migración:
-- comportamiento seguro (no escribe). Orden de despliegue: migración primero, front después.
--
-- Probado sobre la copia local de la 9999 el 2026-09-22 (ver
-- docs/diagnosticos/2026-09-22_issue-084-montas-post-oficial-ejecucion.md).
-- ═══════════════════════════════════════════════════════════════════════════════

DROP TRIGGER  IF EXISTS trg_insc_monta_oficial ON public.inscripciones;
DROP FUNCTION IF EXISTS public.fn_insc_monta_oficial_guard();
DROP FUNCTION IF EXISTS public.rpc_cambiar_monta(uuid, uuid);
