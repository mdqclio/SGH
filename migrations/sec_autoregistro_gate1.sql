-- ============================================================
-- Gate 1 de auto-registro — cerrar los huecos que el flujo activa
-- ============================================================
-- Fecha: 2026-08-04 · Base: main @ eb61639
-- Plan: docs/AUTOREGISTRO_PLAN.md §C y §E (Gate 1)
-- Rollback: migrations/sec_autoregistro_gate1_rollback.sql (commiteado antes)
--
-- Motivo: el auto-registro crea cuentas `authenticated` a voluntad. Todo lo que
-- una cuenta autenticada puede leer sin más condición pasa a ser público de
-- hecho. Este gate cierra eso, más dos defensas en profundidad que el diseño
-- nuevo no necesita pero que conviene no dejar armadas.
--
-- Todas las expresiones van envueltas en (SELECT fn_...()) — optimización
-- InitPlan de R2a, que evita reevaluar la función por fila.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------------------
-- 1 · performances_select — era USING (true)
-- ------------------------------------------------------------------------
-- performances es el historial de carreras del ejemplar (form guide). NO tiene
-- club_id: es dato cross-club por naturaleza, con hipodromo_sigla como texto.
-- Así que no se puede scopear por club; se copia el criterio que ya usa
-- spcs_select, que resuelve exactamente el mismo problema para los SPCs
-- (globales, sin club_id — GOTCHA #13):
--     staff ve todo · el usuario de portal ve lo de SUS ejemplares.
-- Una cuenta pendiente no es staff y fn_mis_spc_ids() le devuelve vacío → 0 filas.
DROP POLICY IF EXISTS performances_select ON performances;
CREATE POLICY performances_select ON performances
  FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_staff())
    OR spc_id IN (SELECT s.spc_id FROM fn_mis_spc_ids() s)
  );

-- ------------------------------------------------------------------------
-- 2 · sanciones_select — era USING (true)
-- ------------------------------------------------------------------------
-- sanciones SÍ tiene club_id NOT NULL, pero NO alcanza con scopear por club:
-- el propósito de la tabla es que las sanciones se compartan entre hipódromos
-- (CLAUDE.md). La columna `alcance` es la que dice hasta dónde llega cada una;
-- hoy el único valor cargado es 'club'.
--
-- Criterio:
--   · super_admin: todo.
--   · staff: las de su club, MÁS las de otros clubes cuyo alcance no sea 'club'
--     (o sea, las compartidas) — si no, se rompe la función de la tabla.
--   · usuario de portal: las que lo tienen a ÉL como entidad sancionada, sea
--     como profesional, propietario o por uno de sus ejemplares.
--   · cuenta pendiente: ninguna de las tres ramas aplica → 0 filas.
--
-- `alcance` es NOT NULL, así que `alcance <> 'club'` no tiene el agujero del
-- NULL. entidad_sancionada: profesional | spc | propietario | caballeriza.
-- Caballeriza queda afuera a propósito: no hay vínculo cuenta→caballeriza.
DROP POLICY IF EXISTS sanciones_select ON sanciones;
CREATE POLICY sanciones_select ON sanciones
  FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_super_admin())
    OR (
      (SELECT fn_is_staff())
      AND (club_id = (SELECT fn_get_user_club_id()) OR alcance <> 'club')
    )
    OR (entidad_tipo = 'profesional'::entidad_sancionada
        AND entidad_id IN (SELECT e.entidad_id FROM fn_mis_entidades() e
                           WHERE e.entidad_tipo = 'profesional'))
    OR (entidad_tipo = 'propietario'::entidad_sancionada
        AND entidad_id IN (SELECT e.entidad_id FROM fn_mis_entidades() e
                           WHERE e.entidad_tipo = 'propietario'))
    OR (entidad_tipo = 'spc'::entidad_sancionada
        AND entidad_id IN (SELECT s.spc_id FROM fn_mis_spc_ids() s))
  );

-- ------------------------------------------------------------------------
-- 3 · ux_entidad_una_cuenta — dos cuentas no pueden reclamar la misma ficha
-- ------------------------------------------------------------------------
-- Es la salvaguarda que PORTAL_V2_PLAN §B.3 preveía para usuario_entidades y
-- que quedó sin implementar cuando el vínculo terminó viviendo en columnas de
-- usuarios. Sin esto, aprobar dos solicitudes contra la misma ficha le da a
-- dos personas la misma plata.
-- Hoy hay 0 filas con entidad_id, así que no puede fallar por datos previos.
CREATE UNIQUE INDEX IF NOT EXISTS ux_entidad_una_cuenta
  ON usuarios (entidad_tipo, entidad_id)
  WHERE entidad_id IS NOT NULL AND activo;

-- ------------------------------------------------------------------------
-- 4 · fn_get_user_club_id() — defensa en profundidad (§C.1)
-- ------------------------------------------------------------------------
-- No filtraba por `activo`. Como usuarios.club_id es NOT NULL, CUALQUIER fila
-- en usuarios —aunque fuera activo=false, estado='pendiente'— daba lectura de
-- todo el club en reuniones, carreras, inscripciones, caballerizas,
-- resultados, apoderados y caballeriza_responsables.
--
-- El diseño del Gate 2 evita el problema por otra vía (el pendiente no tiene
-- fila en usuarios), pero dejar la función así es dejar el arma cargada.
--
-- Sin LIMIT: ux_usuarios_auth_user_id es UNIQUE parcial sobre auth_user_id, así
-- que no puede devolver más de una fila. Un resultado ambiguo es imposible en
-- vez de silenciosamente arbitrario.
--
-- Verificado antes de aplicar: los 3 usuarios de prod tienen activo=true, así
-- que nadie pierde acceso.
CREATE OR REPLACE FUNCTION public.fn_get_user_club_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid() AND activo;
$function$;

-- ------------------------------------------------------------------------
-- 5 · usuarios.rol DEFAULT — defensa en profundidad (§C.2)
-- ------------------------------------------------------------------------
-- El default era 'operador', y fn_is_staff() cuenta 'operador' como staff. Un
-- INSERT que omitiera el rol creaba staff. Pasa a 'publico', que es el rol sin
-- privilegios del enum.
--
-- Verificado: los 3 lugares que insertan en usuarios (invite-user y los dos
-- probes de RLS) pasan `rol` explícito, así que el cambio no altera ningún
-- camino vivo.
ALTER TABLE usuarios ALTER COLUMN rol SET DEFAULT 'publico'::rol_usuario;

-- ------------------------------------------------------------------------
-- 6 · fn_audit_policies_permisivas() — el probe no miraba los SELECT
-- ------------------------------------------------------------------------
-- Auditaba sólo cmd IN ('INSERT','UPDATE','DELETE','ALL'). Por eso
-- probe_rls_no_permissive daba VERDE con ALLOWLIST vacía mientras
-- performances_select y sanciones_select tenían USING(true) desde siempre: el
-- probe no los podía ver.
--
-- Se agrega SELECT. La ALLOWLIST del probe sigue vacía: después de los puntos
-- 1 y 2 no queda ninguna policy permisiva de ningún tipo.
CREATE OR REPLACE FUNCTION public.fn_audit_policies_permisivas()
RETURNS TABLE(schemaname text, tablename text, policyname text,
              cmd text, roles text, qual text, with_check text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.schemaname::text, p.tablename::text, p.policyname::text,
         p.cmd::text, p.roles::text, p.qual::text, p.with_check::text
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.cmd IN ('SELECT','INSERT','UPDATE','DELETE','ALL')
    AND (p.qual = 'true' OR p.with_check = 'true')
$function$;

-- ------------------------------------------------------------------------
-- Verificación dentro de la transacción — revisar ANTES de hacer COMMIT
-- ------------------------------------------------------------------------
-- (a) ninguna policy permisiva, de ningún cmd
SELECT count(*) AS policies_permisivas FROM fn_audit_policies_permisivas();

-- (b) el default de rol quedó en 'publico'
SELECT column_default AS rol_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='usuarios' AND column_name='rol';

-- (c) el índice existe
SELECT indexdef FROM pg_indexes
WHERE schemaname='public' AND indexname='ux_entidad_una_cuenta';

-- (d) las dos policies nuevas quedaron con condición
SELECT tablename, policyname, left(qual, 80) AS using_recortado
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('performances','sanciones') AND cmd='SELECT';

COMMIT;
