-- R2a — Wrap (SELECT fn()) en las policies RLS de public
-- ---------------------------------------------------------------------------
-- Objetivo: que las funciones row-independientes se evalúen UNA vez por query
-- (InitPlan) en lugar de una vez por fila. Ataca H2 del PERF_AUDIT.
--
-- Alcance: SOLO las tres llamadas zero-arg / auth.*:
--   fn_is_super_admin()      STABLE, SECURITY DEFINER, 0 args
--   fn_get_user_club_id()    STABLE, SECURITY DEFINER, 0 args
--   auth.jwt()
--
-- NO se tocan las fn_club_de_*(uuid) — toman una columna de la fila, son
-- correlacionadas por definición y el wrap no produciría InitPlan.
--
-- La transformación es puramente sintáctica: las funciones son STABLE, el
-- resultado dentro de una transacción es idéntico. NO cambia la semántica de
-- autorización.
--
-- Idempotente: normaliza (desenvuelve y vuelve a envolver), así que correrla
-- dos veces no anida subqueries.
--
-- Estado previo medido (2026-07-29): 117 policies en public, 0 ya wrappeadas.
-- Rollback: migrations/r2a_wrap_policies_initplan_rollback.sql
-- ---------------------------------------------------------------------------

DO $r2a$
DECLARE
  r          record;
  nq         text;
  nc         text;
  partes     text;
  n_cambiadas int := 0;
  n_total     int := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  LOOP
    n_total := n_total + 1;
    nq := r.qual;
    nc := r.with_check;

    -- Paso 1: desenvolver lo ya envuelto (idempotencia).
    -- pg_policies serializa un scalar subquery como: ( SELECT fn() AS alias)
    FOREACH partes IN ARRAY ARRAY['fn_is_super_admin\(\)', 'fn_get_user_club_id\(\)', 'auth\.jwt\(\)']
    LOOP
      nq := regexp_replace(nq, '\(\s*SELECT\s+(' || partes || ')(\s+AS\s+[a-zA-Z_][a-zA-Z_0-9]*)?\s*\)', '\1', 'g');
      nc := regexp_replace(nc, '\(\s*SELECT\s+(' || partes || ')(\s+AS\s+[a-zA-Z_][a-zA-Z_0-9]*)?\s*\)', '\1', 'g');
    END LOOP;

    -- Paso 2: envolver
    nq := regexp_replace(nq, 'fn_is_super_admin\(\)',   '(SELECT fn_is_super_admin())',   'g');
    nq := regexp_replace(nq, 'fn_get_user_club_id\(\)', '(SELECT fn_get_user_club_id())', 'g');
    nq := regexp_replace(nq, 'auth\.jwt\(\)',           '(SELECT auth.jwt())',            'g');

    nc := regexp_replace(nc, 'fn_is_super_admin\(\)',   '(SELECT fn_is_super_admin())',   'g');
    nc := regexp_replace(nc, 'fn_get_user_club_id\(\)', '(SELECT fn_get_user_club_id())', 'g');
    nc := regexp_replace(nc, 'auth\.jwt\(\)',           '(SELECT auth.jwt())',            'g');

    -- Nada que hacer si no cambió
    CONTINUE WHEN nq IS NOT DISTINCT FROM r.qual
              AND nc IS NOT DISTINCT FROM r.with_check;

    partes := '';
    IF nq IS NOT NULL THEN
      partes := partes || format(' USING (%s)', nq);
    END IF;
    IF nc IS NOT NULL THEN
      partes := partes || format(' WITH CHECK (%s)', nc);
    END IF;

    EXECUTE format('ALTER POLICY %I ON %I.%I%s',
                   r.policyname, r.schemaname, r.tablename, partes);

    n_cambiadas := n_cambiadas + 1;
    RAISE NOTICE 'R2a: %.% / % actualizada', r.schemaname, r.tablename, r.policyname;
  END LOOP;

  RAISE NOTICE 'R2a: % policies actualizadas de % revisadas', n_cambiadas, n_total;
END
$r2a$;

-- ---------------------------------------------------------------------------
-- Verificación estructural (debe dar 0 en las tres columnas "sin_wrap"):
--
--   SELECT
--     count(*) FILTER (WHERE e ~ '(?<!SELECT )fn_is_super_admin') AS _,
--     count(*) FILTER (WHERE e ~ 'fn_is_super_admin\(\)')   AS con_sa,
--     count(*) FILTER (WHERE e ~ 'SELECT fn_is_super_admin') AS sa_wrap
--   FROM (SELECT coalesce(qual,'')||' '||coalesce(with_check,'') e
--         FROM pg_policies WHERE schemaname='public') s;
--
-- Verificación real: EXPLAIN de un SELECT como rol `authenticated` debe mostrar
-- los nodos InitPlan.
-- ---------------------------------------------------------------------------
