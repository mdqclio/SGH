-- ============================================================
-- SECURITY HARDENING — FASE 1: cierre crítico ANON en apuestas/dividendos
-- Rama: fix/security-hardening   Fecha: 2026-06-07
-- ============================================================
-- Reemplaza las policies permisivas allow_all (hoy expuestas a anon)
-- por el patrón estándar de 4 policies club-scoped TO authenticated,
-- idéntico al de `inscripciones` (verificado contra pg_policies).
--
-- carrera_apuestas  → scope por fn_club_de_carrera(carrera_id)
-- resultado_apuestas → scope por fn_club_de_resultado(resultado_id)
--
-- Objetivo: el rol `anon` no puede leer ni escribir apuestas/dividendos.
-- Las helper fn_is_super_admin / fn_get_user_club_id / fn_club_de_* NO se tocan (GOTCHA #26).
-- ============================================================

-- ---------- carrera_apuestas ----------
DROP POLICY IF EXISTS "allow_all" ON public.carrera_apuestas;

CREATE POLICY carrera_apuestas_select ON public.carrera_apuestas
  FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id());

CREATE POLICY carrera_apuestas_insert ON public.carrera_apuestas
  FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id());

CREATE POLICY carrera_apuestas_update ON public.carrera_apuestas
  FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id());

CREATE POLICY carrera_apuestas_delete ON public.carrera_apuestas
  FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id());

-- ---------- resultado_apuestas ----------
DROP POLICY IF EXISTS "allow_all_resultado_apuestas" ON public.resultado_apuestas;

CREATE POLICY resultado_apuestas_select ON public.resultado_apuestas
  FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_resultado(resultado_id) = fn_get_user_club_id());

CREATE POLICY resultado_apuestas_insert ON public.resultado_apuestas
  FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR fn_club_de_resultado(resultado_id) = fn_get_user_club_id());

CREATE POLICY resultado_apuestas_update ON public.resultado_apuestas
  FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_resultado(resultado_id) = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR fn_club_de_resultado(resultado_id) = fn_get_user_club_id());

CREATE POLICY resultado_apuestas_delete ON public.resultado_apuestas
  FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_resultado(resultado_id) = fn_get_user_club_id());
