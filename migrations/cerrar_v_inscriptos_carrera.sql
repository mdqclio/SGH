-- ============================================================================
-- cerrar_v_inscriptos_carrera.sql — ISSUE-098 (SEGURIDAD)
-- ============================================================================
-- Qué pasaba: v_inscriptos_carrera corría con los permisos de su dueño (postgres) y
-- salteaba la RLS de las 7 tablas que lee. anon (sin login, con la publishable key,
-- que es pública) leía las 425 inscripciones de la base, con propietario, entrenador,
-- jockeys, caballeriza e info_adicional. Advisor: security_definer_view (ERROR).
--
-- Causa: la vista tenía security_invoker=true desde security_hardening_fase2_reversible
-- (20260607195414). El 27/08, v_inscriptos_carrera_edad_reglamentaria (20260827173321,
-- migrations/fn_edad_reglamentaria.sql) la recreó con CREATE OR REPLACE VIEW SIN
-- WITH (security_invoker = true), y CREATE OR REPLACE VIEW REEMPLAZA las opciones de la
-- vista por las del comando: quedaron vacías (probado en el sandbox, GOTCHA #102).
--
-- Lectores: ninguno (git grep v_inscriptos_carrera main: 0 HTML/JS/Edge Functions/probes;
-- ninguna vista ni función depende de ella). Con invoker cada rol ve lo que le dejan las
-- RLS de las tablas; authenticated conserva SELECT (staff ve su club, portal lo suyo).
-- Informe: docs/diagnosticos/2026-10-02_issue-099-funciones-anon-y-v-inscriptos-fase1.md (reports).
--
-- Rollback: rollback_cerrar_v_inscriptos_carrera.sql (VUELVE A ABRIR la vista a anon).
-- Probe: tests/probe_v_inscriptos_cerrada.mjs
-- ============================================================================

ALTER VIEW public.v_inscriptos_carrera SET (security_invoker = true);

REVOKE SELECT ON public.v_inscriptos_carrera FROM anon;

-- Verificación (después del apply):
--   select reloptions, has_table_privilege('anon', oid, 'SELECT') anon_sel,
--          has_table_privilege('authenticated', oid, 'SELECT') auth_sel
--   from pg_class where oid = 'public.v_inscriptos_carrera'::regclass;
--   → {security_invoker=true} | f | t
