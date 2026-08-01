-- ===========================================================================
-- ROLLBACK de r2a_wrap_policies_initplan.sql
-- ===========================================================================
-- El archivo que el encabezado de la migración R2a referenciaba y que nunca
-- se había escrito. Misma técnica DO/regex, a la inversa: desenvuelve
-- (SELECT fn()) → fn() para las tres llamadas que R2a envuelve.
--
--   fn_is_super_admin()    fn_get_user_club_id()    auth.jwt()
--
-- Idempotente: si una policy ya está desenvuelta, el CONTINUE la saltea.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ UN REGEX INVERSO ALCANZA ACÁ
-- ---------------------------------------------------------------------------
-- El riesgo típico de revertir con regex es dejar la policy semánticamente
-- distinta. Acá no aplica, por dos razones:
--
--   1. La sustitución es de TRES tokens exactos de llamada a función. No toca
--      operadores, columnas ni estructura booleana.
--   2. Si el regex produjera texto inválido, `ALTER POLICY` FALLA al parsear y
--      la transacción entera aborta. Postgres no acepta una expresión rota y
--      la guarda igual. O sea: el modo de falla es "no se aplica nada", no
--      "se aplica algo sutilmente distinto".
--
-- Por eso no hace falta un snapshot literal de las 120 policies.
--
-- ---------------------------------------------------------------------------
-- ⚠️ EFECTO COLATERAL QUE HAY QUE SABER
-- ---------------------------------------------------------------------------
-- Este rollback desenvuelve TODAS las policies, incluidas las 35 que nacieron
-- envueltas en SEC_RLS FASE 2a/2b/2c. Esas no las envolvió R2a — ya vinieron
-- así de fábrica.
--
-- Consecuencia: correr esto no sólo revierte R2a, además des-optimiza FASE 2.
-- NO cambia la semántica de autorización de ninguna (envolver es neutro), pero
-- deja las policies de FASE 2 evaluando sus funciones por fila.
--
-- Si lo que se quiere es revertir SÓLO R2a conservando el wrap de FASE 2, hay
-- que re-aplicar después:
--   migrations/sec_rls_fase2a_catalogos.sql
--   migrations/sec_rls_fase2b_escritura.sql
--   migrations/sec_rls_fase2c_lectura.sql
-- Los tres son idempotentes (DROP POLICY IF EXISTS + CREATE).
--
-- ---------------------------------------------------------------------------
-- NO desenvuelve fn_is_staff() ni fn_is_portal_user() ni auth.uid(): esas no
-- están en el alcance de R2a y desenvolverlas sería salirse del rollback.
-- ===========================================================================

DO $r2a_rb$
DECLARE
  r           record;
  nq          text;
  nc          text;
  partes      text;
  patron      text;
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

    -- Desenvolver. pg_policies serializa el scalar subquery como
    --   ( SELECT fn() AS alias)
    -- así que el alias es opcional en el patrón.
    FOREACH patron IN ARRAY ARRAY[
      'fn_is_super_admin\(\)', 'fn_get_user_club_id\(\)', 'auth\.jwt\(\)'
    ]
    LOOP
      nq := regexp_replace(nq,
        '\(\s*SELECT\s+(' || patron || ')(\s+AS\s+[a-zA-Z_][a-zA-Z_0-9]*)?\s*\)', '\1', 'g');
      nc := regexp_replace(nc,
        '\(\s*SELECT\s+(' || patron || ')(\s+AS\s+[a-zA-Z_][a-zA-Z_0-9]*)?\s*\)', '\1', 'g');
    END LOOP;

    CONTINUE WHEN nq IS NOT DISTINCT FROM r.qual
              AND nc IS NOT DISTINCT FROM r.with_check;

    partes := '';
    IF nq IS NOT NULL THEN partes := partes || format(' USING (%s)', nq); END IF;
    IF nc IS NOT NULL THEN partes := partes || format(' WITH CHECK (%s)', nc); END IF;

    EXECUTE format('ALTER POLICY %I ON %I.%I%s',
                   r.policyname, r.schemaname, r.tablename, partes);

    n_cambiadas := n_cambiadas + 1;
    RAISE NOTICE 'R2a-rollback: %.% / % desenvuelta', r.schemaname, r.tablename, r.policyname;
  END LOOP;

  RAISE NOTICE 'R2a-rollback: % policies desenvueltas de % revisadas', n_cambiadas, n_total;
END
$r2a_rb$;

-- ===========================================================================
-- VERIFICACIÓN — esperado: 0 envueltas de las tres funciones del alcance
-- ===========================================================================
-- WITH e AS (
--   SELECT coalesce(qual,'')||' '||coalesce(with_check,'') AS txt
--   FROM pg_policies WHERE schemaname='public'
-- )
-- SELECT count(*) FILTER (WHERE txt ~ 'SELECT fn_is_super_admin')   AS sa_wrap,
--        count(*) FILTER (WHERE txt ~ 'SELECT fn_get_user_club_id') AS club_wrap,
--        count(*) FILTER (WHERE txt ~ 'SELECT auth\.jwt')           AS jwt_wrap
-- FROM e;
--
-- Y después, SIEMPRE:
--   node tests/probe_rls_secretaria.mjs   → 18/18
--   node tests/probe_rls_portal.mjs       → 11 PASS / 0 FAIL
