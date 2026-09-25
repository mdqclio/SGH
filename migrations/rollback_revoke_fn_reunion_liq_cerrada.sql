-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK de migrations/revoke_fn_reunion_liq_cerrada.sql
--
-- Devuelve el EXECUTE a PUBLIC y anon, que es exactamente el ACL que había antes del REVOKE
-- (medido el 25/09: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,
-- service_role=X/postgres}). Vuelve a abrir el advisor 0028 de anon.
-- ═══════════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public.fn_reunion_liq_cerrada(uuid) TO PUBLIC, anon;
