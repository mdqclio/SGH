-- ═══════════════════════════════════════════════════════════════════════════════
-- SEGURIDAD — sanciones: INSERT y UPDATE exigen además fn_is_staff() (igual que SELECT)
--
-- ESTADO EN PRODUCCIÓN: **APLICADA el 2026-09-25** (`20260925205245 sanciones_insert_update_staff`; se aplicó
-- este archivo con el encabezado anterior — sólo cambió este comentario). md5 de las 4 políticas verificado
-- contra el esperado de abajo; probe contra prod 13/13 (portal: INSERT 42501 y UPDATE sin efecto). Informe:
-- docs/diagnosticos/2026-09-25_aplicacion-sanciones-merge-pr19.md (reports).
--
-- Por qué: sanciones_insert y sanciones_update sólo pedían `super_admin OR club_id = fn_get_user_club_id()`.
-- Un usuario del PORTAL (profesional/propietario) con club_id — hay 16 activos, todos con club — podía
-- crear o editar sanciones de su club por la API. La de SELECT ya distingue staff. Diagnóstico:
-- docs/diagnosticos/2026-09-25_sanciones-rls-insert-yesi.md (reports).
--
-- Qué hace: reemplaza las dos políticas por `super_admin OR (fn_is_staff() AND club_id = club del usuario)`.
-- fn_is_staff() = super_admin | secretario_carreras | operador, activo (sec_rls_fase2a_catalogos, 01/08).
-- No toca SELECT ni DELETE (DELETE ya es sólo super_admin).
--
-- md5 esperado (las políticas no tienen pg_get_functiondef: se mide sobre su texto deparseado, medido
-- aplicando ESTE archivo en el sandbox tests/local/ con el fixture tests/local/sanciones_sandbox.sql):
--   sanciones_insert → md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) = 851412fcb330fce19eebb3de7055282c
--   sanciones_update → md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) = 037b23db86ad676cb86984cac876da25
--   select policyname, md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) from pg_policies
--    where schemaname='public' and tablename='sanciones' and policyname in ('sanciones_insert','sanciones_update') order by 1;
--
-- Hoy en prod (sin aplicar): sanciones_insert ee075422773f3bdc4c1f562ef17c72ef · sanciones_update d61391593f16b3c8c5855054f6e496b6.
-- Rollback: migrations/rollback_sanciones_insert_update_staff.sql (vuelve a las definiciones del 25/09: da
-- exactamente esos dos md5, medido en el sandbox).
-- Probe: tests/probe_sanciones_alta.mjs.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS sanciones_insert ON public.sanciones;
CREATE POLICY sanciones_insert ON public.sanciones
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT fn_is_super_admin())
    OR ((SELECT fn_is_staff()) AND club_id = (SELECT fn_get_user_club_id()))
  );

DROP POLICY IF EXISTS sanciones_update ON public.sanciones;
CREATE POLICY sanciones_update ON public.sanciones
  FOR UPDATE TO authenticated
  USING (
    (SELECT fn_is_super_admin())
    OR ((SELECT fn_is_staff()) AND club_id = (SELECT fn_get_user_club_id()))
  )
  WITH CHECK (
    (SELECT fn_is_super_admin())
    OR ((SELECT fn_is_staff()) AND club_id = (SELECT fn_get_user_club_id()))
  );

COMMIT;
