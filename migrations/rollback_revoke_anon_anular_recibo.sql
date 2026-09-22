-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK de migrations/revoke_anon_anular_recibo.sql
--
-- Devuelve `anular_recibo(uuid, text)` a la ACL que tenía en producción hasta el
-- 2026-09-22, es decir CON el agujero: EXECUTE para PUBLIC (y por lo tanto para `anon`,
-- que es lo que sirve la publishable key sin sesión).
--
--     ANTES del revoke: =X/postgres  postgres=X/postgres  anon=X/postgres  authenticated=X/postgres  service_role=X/postgres
--
-- Sólo tiene sentido si el REVOKE rompe algo que hoy no se conoce (ninguna página llama a
-- `anular_recibo` sin sesión: liquidaciones.html la invoca con el usuario logueado). Si se
-- corre, el vector del §2 del informe vuelve a estar abierto — avisar antes.
--
-- El GRANT explícito a anon no se repone: `GRANT … TO PUBLIC` ya lo cubre, y dejarlo
-- fuera hace visible en la ACL que hubo un cambio.
-- ═══════════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public.anular_recibo(uuid, text) TO PUBLIC;
