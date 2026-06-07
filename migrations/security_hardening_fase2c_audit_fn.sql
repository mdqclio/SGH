-- ============================================================
-- SECURITY HARDENING — FASE 2c: función auditora de policies permisivas
-- Rama: fix/security-hardening   Fecha: 2026-06-07
-- ============================================================
-- Soporte para el probe de regresión tests/probe_rls_no_permissive.mjs.
-- Devuelve toda policy de escritura (INSERT/UPDATE/DELETE/ALL) en `public`
-- cuyo USING o WITH CHECK sea literal `true` (RLS efectivamente anulada).
-- Las SELECT-only `USING(true)` se excluyen a propósito (patrón de lectura
-- pública deliberada; coincide con el lint 0024 del advisor).
--
-- SECURITY DEFINER + grant SOLO a service_role: no agrega superficie a anon/authenticated.
-- pg_policies vive en pg_catalog y no se expone por PostgREST; este RPC es el único acceso.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_policies_permisivas()
RETURNS TABLE(
  schemaname text, tablename text, policyname text,
  cmd text, roles text, qual text, with_check text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.schemaname::text, p.tablename::text, p.policyname::text, p.cmd::text,
         p.roles::text, p.qual::text, p.with_check::text
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
    AND (p.qual = 'true' OR p.with_check = 'true')
$$;

REVOKE EXECUTE ON FUNCTION public.fn_audit_policies_permisivas() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_audit_policies_permisivas() TO service_role;
