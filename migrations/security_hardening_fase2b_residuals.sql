-- ============================================================
-- SECURITY HARDENING — FASE 2b: residuales del advisor post-FASE 2
-- Rama: fix/security-hardening   Fecha: 2026-06-07
-- ============================================================
-- (a) Bucket chaquetillas: el advisor marca CUALQUIER SELECT policy en bucket
--     público como "listable". La app solo usa getPublicUrl (URL directa,
--     caballerizas.html:515), nunca .list(). En un bucket público el endpoint
--     /object/public/... sirve sin RLS, así que se elimina la SELECT policy
--     por completo → no se puede listar y las imágenes siguen cargando.
-- (b) Trigger-functions expuestas como RPC SECURITY DEFINER a anon/authenticated.
--     fn_inscripcion_set_propietario y fn_caballeriza_resp_set_propietario
--     RETURNS trigger (atadas a trg_insc_set_propietario / trg_cab_resp_set_propietario);
--     nunca deben llamarse por RPC. Misma clase que fn_auditoria_log (FASE 2).
--     Los triggers disparan sin EXECUTE explícito.
-- ============================================================

-- (a) Bucket: sin SELECT policy → sin listado; URLs públicas directas intactas
DROP POLICY IF EXISTS "chaquetillas_auth_read" ON storage.objects;

-- (b) Trigger functions: fuera de la API RPC
REVOKE EXECUTE ON FUNCTION public.fn_inscripcion_set_propietario()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_caballeriza_resp_set_propietario()   FROM PUBLIC, anon, authenticated;
