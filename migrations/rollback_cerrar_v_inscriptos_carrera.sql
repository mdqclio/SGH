-- ============================================================================
-- rollback_cerrar_v_inscriptos_carrera.sql — deshace cerrar_v_inscriptos_carrera.sql
-- ============================================================================
-- ⚠ VUELVE A ABRIR la vista: anon (sin login) lee todas las inscripciones con nombres.
-- Sólo para volver al estado exacto anterior si el cierre rompiera algo que no se vio.
-- ============================================================================

ALTER VIEW public.v_inscriptos_carrera RESET (security_invoker);

GRANT SELECT ON public.v_inscriptos_carrera TO anon;
