-- ============================================================
-- ISSUE-028 — APODERADOS v1: autorizados a cobrar por autorizante
-- Rama: feat/apoderados-v1   Fecha: 2026-06-10
-- ============================================================
-- Tabla plana nueva (NO toca plata existente). Un autorizante (propietario o
-- profesional) puede autorizar a varias personas a cobrar en su nombre.
--
-- autorizante_id es POLIMÓRFICO (→ propietarios/profesionales según
-- autorizante_tipo), SIN FK, igual que el patrón beneficiario_id de
-- liquidacion_detalle. Se valida por aplicación + RLS club-scoped.
--
-- RLS: patrón estándar de tabla plana con club_id (idéntico a `caballerizas`):
-- 4 policies TO authenticated, fn_is_super_admin() OR club_id = fn_get_user_club_id().
-- Tabla plana con RLS — NO el patrón SECURITY DEFINER. Las helper fn_* NO se tocan (GOTCHA #26).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.apoderados (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           uuid NOT NULL REFERENCES public.clubs(id),
  autorizante_tipo  text NOT NULL CHECK (autorizante_tipo IN ('propietario','profesional')),
  autorizante_id    uuid NOT NULL,                 -- polimórfico, SIN FK (patrón beneficiario)
  autorizado_nombre     text NOT NULL,
  autorizado_documento  text NOT NULL,             -- dato que el operador verifica
  vigente           boolean NOT NULL DEFAULT true,
  creado_at         timestamptz DEFAULT now(),
  creado_por        uuid                            -- mismo convenio que el resto del repo
);

-- Índice de lectura por autorizante (la UI lista por autorizante).
CREATE INDEX IF NOT EXISTS apoderados_autorizante_idx
  ON public.apoderados (club_id, autorizante_tipo, autorizante_id);

-- Anti-duplicado: un mismo documento no puede estar vigente dos veces para el
-- mismo autorizante. Parcial (WHERE vigente) → permite re-autorizar tras revocar.
CREATE UNIQUE INDEX IF NOT EXISTS apoderados_uniq_vigente
  ON public.apoderados (club_id, autorizante_tipo, autorizante_id, autorizado_documento)
  WHERE vigente;

-- ---------- RLS (club-scoped, authenticated) ----------
ALTER TABLE public.apoderados ENABLE ROW LEVEL SECURITY;

CREATE POLICY apoderados_select ON public.apoderados
  FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR (club_id = fn_get_user_club_id()));

CREATE POLICY apoderados_insert ON public.apoderados
  FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR (club_id = fn_get_user_club_id()));

CREATE POLICY apoderados_update ON public.apoderados
  FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR (club_id = fn_get_user_club_id()))
  WITH CHECK (fn_is_super_admin() OR (club_id = fn_get_user_club_id()));

CREATE POLICY apoderados_delete ON public.apoderados
  FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR (club_id = fn_get_user_club_id()));

-- Grants estándar de tabla (RLS filtra las filas; sin grants no hay acceso).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apoderados TO authenticated;
