-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK de migrations/revocar_recibos_delete.sql (ISSUE-065)
--
-- Devuelve el DELETE de `recibos` a los roles de aplicación, tal como estaba antes
-- del 2026-08-30. Reabre el agujero: un usuario autenticado vuelve a poder borrar un
-- recibo por PostgREST sin pasar por `anular_recibo`.
--
-- ANTES DE CORRER ESTO, saber por qué. El único motivo legítimo sería que se rompa
-- algo que sí necesitaba borrar recibos desde el front — y al momento de revocar se
-- verificó que **no existe**: la única referencia a `from('recibos')` en
-- `liquidaciones.html` es un `.select()`, y los 8 probes que borran recibos usan
-- `service_role`, que nunca perdió el privilegio.
--
-- Si el motivo es "hay que borrar un recibo puntual", NO es este archivo: es
-- `anular_recibo`, o service_role por consola.
--
-- La policy se recrea EXACTAMENTE como estaba (capturada de pg_policy el 2026-08-30):
--   USING ((NOT fn_is_portal_user()) AND (fn_is_super_admin() OR club_id = fn_get_user_club_id()))
-- ═══════════════════════════════════════════════════════════════════════════════

GRANT DELETE ON public.recibos TO authenticated;
GRANT DELETE ON public.recibos TO anon;

CREATE POLICY recibos_delete ON public.recibos
  FOR DELETE TO authenticated
  USING (
    (NOT (SELECT fn_is_portal_user()))
    AND (
      (SELECT fn_is_super_admin())
      OR (club_id = (SELECT fn_get_user_club_id()))
    )
  );

COMMENT ON TABLE public.recibos IS NULL;

-- Verificación:
--   SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy
--    WHERE polrelid='recibos'::regclass AND polcmd='d';
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name='recibos' AND privilege_type='DELETE' ORDER BY grantee;
