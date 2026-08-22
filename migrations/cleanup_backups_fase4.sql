-- ============================================================
-- FASE 4 — Limpieza de backups del 2026-05-15
-- Rama: chore/cleanup-backups (NO main)
-- Propuesto en REMEDIACION_RESULTADO.md §"FASE 4 — DESTRUCTIVO"
-- Sesión: 2026-06-07
--
-- Objetivo:
--   1) DROP de 3 backups vacíos (0 filas).
--   2) Mover 2 backups con datos al schema `archive` (datos preservados).
--   3) spc_entrenadores_hist: NO se toca. RLS ON sin policy = deny-all a todo
--      cliente (solo service_role). Bloqueo INTENCIONAL, documentado abajo.
--
-- Pre-verificado vía REST (service_role), 2026-06-07:
--   backup_novedades_reunion_20260515        = 0  filas
--   backup_spc_entrenadores_hist_20260515    = 0  filas
--   backup_spc_propietarios_20260515         = 0  filas
--   backup_inscripciones_20260515            = 87 filas
--   backup_spcs_20260515                     = 52 filas
--   spc_entrenadores_hist                    = 0  filas (RLS on, sin policy)
-- Grep en repo (*.html/*.js/*.json) + migrations/*.sql: 0 referencias a estas
-- tablas. (pg_proc en vivo no introspectado en esta sesión por falta de conexión
-- DB — la fuente de verdad versionada de funciones/RPC no las referencia.)
-- ============================================================

BEGIN;

-- 1) DROP backups vacíos. Guard defensivo: abortar si alguno NO está vacío.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.backup_novedades_reunion_20260515;
  IF n <> 0 THEN RAISE EXCEPTION 'backup_novedades_reunion_20260515 tiene % filas — abortado', n; END IF;
  SELECT count(*) INTO n FROM public.backup_spc_entrenadores_hist_20260515;
  IF n <> 0 THEN RAISE EXCEPTION 'backup_spc_entrenadores_hist_20260515 tiene % filas — abortado', n; END IF;
  SELECT count(*) INTO n FROM public.backup_spc_propietarios_20260515;
  IF n <> 0 THEN RAISE EXCEPTION 'backup_spc_propietarios_20260515 tiene % filas — abortado', n; END IF;
END $$;

DROP TABLE IF EXISTS public.backup_novedades_reunion_20260515;
DROP TABLE IF EXISTS public.backup_spc_entrenadores_hist_20260515;
DROP TABLE IF EXISTS public.backup_spc_propietarios_20260515;

-- 2) Mover backups con datos al schema `archive` (preserva filas, saca el lint
--    rls_enabled_no_policy de `public`). `archive` NO se expone vía PostgREST
--    (no se agrega a la config de schemas de la API), así queda fuera de la
--    superficie de ataque del cliente.
CREATE SCHEMA IF NOT EXISTS archive;
ALTER TABLE public.backup_inscripciones_20260515 SET SCHEMA archive;
ALTER TABLE public.backup_spcs_20260515          SET SCHEMA archive;

-- 3) spc_entrenadores_hist — BLOQUEO INTENCIONAL, NO TOCAR.
--    Historial de entrenadores (feature inactiva, 0 filas). Tiene RLS ENABLE
--    sin ninguna policy => deny-all para anon/authenticated; solo service_role
--    accede. Es el estado seguro deseado: se deja así a propósito.
--    El lint `rls_enabled_no_policy` sobre ESTA tabla es ACEPTADO (no es un
--    hallazgo a remediar). Si se activa el feature, definir policies espejando
--    la decisión de FASE 3 para spc_propietarios (misma naturaleza: link sobre
--    spc global).
COMMENT ON TABLE public.spc_entrenadores_hist IS
  'Historial de entrenadores (feature inactiva, 0 filas). RLS ON sin policy = deny-all INTENCIONAL (solo service_role). Lint rls_enabled_no_policy ACEPTADO. No agregar policies hasta definir el modelo — ver FASE 3 / REMEDIACION_RESULTADO.md.';

COMMIT;

-- ============================================================
-- AUTOVERIFICACIÓN (correr tras aplicar):
--
--   -- (a) public sin ninguna backup_*20260515 (esperado: 0 filas):
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND tablename LIKE 'backup\_%20260515';
--
--   -- (b) los 2 movidos, accesibles en archive con sus filas (esperado 87 / 52):
--   SELECT 'backup_inscripciones_20260515' AS tabla, count(*) FROM archive.backup_inscripciones_20260515
--   UNION ALL
--   SELECT 'backup_spcs_20260515',                   count(*) FROM archive.backup_spcs_20260515;
--
--   -- (c) advisor / lint: rls_enabled_no_policy ya NO debe listar las 4 tablas
--   --     backup_* (3 dropeadas + 2 movidas a archive fuera de la API). La única
--   --     tabla que puede seguir apareciendo es spc_entrenadores_hist => ACEPTADO.
--   SELECT n.nspname AS schema, c.relname AS tabla
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE c.relrowsecurity                                    -- RLS habilitado
--     AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)  -- sin policy
--     AND n.nspname = 'public';
-- ============================================================
