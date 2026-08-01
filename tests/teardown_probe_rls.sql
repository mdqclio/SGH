-- Teardown manual del residuo de los probes de RLS
-- (tests/probe_rls_secretaria.mjs y tests/probe_rls_portal.mjs)
--
-- CUÁNDO SE USA
-- Los dos probes limpian solos en un bloque `finally`, así que en la corrida
-- normal este archivo no hace falta. Queda residuo si:
--
--   1. El probe murió por una excepción antes de llegar al `finally`.
--   2. `auth.admin.deleteUser` falló. Igual que en el probe de invitación, el
--      bug de plataforma "kid <nil> ES256" pega en los endpoints admin de
--      GoTrue. El probe loguea y sigue: no falla por eso, pero deja cuentas
--      colgadas en auth.users.
--   3. Un DELETE quedó bloqueado por una FK que el probe no previó.
--
-- Este archivo va por SQL directo y no por la Admin API justamente porque el
-- SQL no pasa por GoTrue, así que el bug del punto 2 no lo toca.
--
-- CÓMO SE USA
-- Correr los SELECT del PASO 1 primero, mirar qué sale, y recién ahí el PASO 2.
-- NO correr el archivo entero de una.
--
-- ⚠️ Los patrones son deliberadamente angostos: dominio .invalid (RFC 2606),
--    prefijo `probe-rls-`, nombres `PROBE %`, reuniones 9996/9997.
--    Nada que matchee puede ser un dato real. NO ampliar los LIKE.
--
-- ⚠️ NO TOCAR la reunión 9999 (PRUEBA RESUMEN): es otro fixture, con su propio
--    teardown en teardown_prueba_resumen_9999.sql. Acá sólo 9996 y 9997.

-- ===========================================================================
-- PASO 1 — INSPECCIÓN (read-only). Correr esto primero, siempre.
-- ===========================================================================

-- 1a. Usuarios fixture
SELECT id, email, rol, club_id, activo, created_at
FROM public.usuarios
WHERE email LIKE 'probe-rls-%@sgh-probe.invalid'
ORDER BY created_at;

-- 1b. Cuentas de Auth fixture
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
WHERE email LIKE 'probe-rls-%@sgh-probe.invalid'
ORDER BY created_at;

-- 1c. Grafo de datos fixture
SELECT 'reuniones'    AS tabla, count(*) FROM public.reuniones     WHERE numero IN (9996, 9997)
UNION ALL SELECT 'carreras',     count(*) FROM public.carreras      WHERE reunion_id IN (SELECT id FROM public.reuniones WHERE numero IN (9996,9997))
UNION ALL SELECT 'propietarios', count(*) FROM public.propietarios  WHERE nombre LIKE 'PROBE-%'
UNION ALL SELECT 'spcs',         count(*) FROM public.spcs          WHERE nombre LIKE 'PROBE %'
UNION ALL SELECT 'liquidaciones',count(*) FROM public.liquidaciones WHERE notas LIKE 'probe-rls-%'
UNION ALL SELECT 'recibos',      count(*) FROM public.recibos       WHERE notas LIKE 'probe-rls-%';

-- 1d. Marcas dejadas por el canario en filas REALES.
--     El probe restaura en el `finally`; si aparece algo acá, no restauró.
SELECT id, carrera_id, info_adicional
FROM public.inscripciones
WHERE info_adicional LIKE 'probe-rls-%';

-- ===========================================================================
-- PASO 2 — BORRADO. Sólo después de mirar el paso 1.
-- ===========================================================================
-- Orden: de las hojas hacia la raíz, respetando las FKs.
-- GOTCHA #12: primero resultado_posiciones, después inscripciones.

BEGIN;

-- 2a. Marcas del canario sobre filas reales → volver a NULL.
--     Sólo toca filas cuyo valor empieza con el prefijo del probe.
UPDATE public.inscripciones SET info_adicional = NULL
WHERE info_adicional LIKE 'probe-rls-%';

-- 2b. Cadena de liquidaciones
DELETE FROM public.recibos            WHERE notas LIKE 'probe-rls-%';
DELETE FROM public.liquidacion_detalle
  WHERE liquidacion_id IN (SELECT id FROM public.liquidaciones WHERE notas LIKE 'probe-rls-%')
     OR concepto LIKE 'probe-%';
DELETE FROM public.liquidaciones      WHERE notas LIKE 'probe-rls-%';

-- 2c. Resultados e inscripciones de las reuniones fixture
DELETE FROM public.resultado_posiciones
  WHERE resultado_id IN (
    SELECT r.id FROM public.resultados r
    JOIN public.carreras c ON c.id = r.carrera_id
    WHERE c.reunion_id IN (SELECT id FROM public.reuniones WHERE numero IN (9996,9997)));
DELETE FROM public.resultados
  WHERE carrera_id IN (
    SELECT id FROM public.carreras
    WHERE reunion_id IN (SELECT id FROM public.reuniones WHERE numero IN (9996,9997)));
DELETE FROM public.inscripciones
  WHERE carrera_id IN (
    SELECT id FROM public.carreras
    WHERE reunion_id IN (SELECT id FROM public.reuniones WHERE numero IN (9996,9997)));
DELETE FROM public.carreras
  WHERE reunion_id IN (SELECT id FROM public.reuniones WHERE numero IN (9996,9997));
DELETE FROM public.reuniones WHERE numero IN (9996, 9997);

-- 2d. Catálogos fixture
DELETE FROM public.spc_propietarios
  WHERE spc_id IN (SELECT id FROM public.spcs WHERE nombre LIKE 'PROBE %')
     OR propietario_id IN (SELECT id FROM public.propietarios WHERE nombre LIKE 'PROBE-%');
DELETE FROM public.spcs         WHERE nombre LIKE 'PROBE %';
DELETE FROM public.propietarios WHERE nombre LIKE 'PROBE-%';

-- 2e. Usuarios.
-- ⚠️ auditoria_usuario_id_fkey bloquea el DELETE: los triggers de auditoría
--    dejan filas apuntando al fixture. Se ANULA usuario_id (columna nullable)
--    en vez de borrar la entrada — el registro de auditoría sobre filas REALES
--    no se destruye, sólo se despega del usuario que ya no va a existir.
UPDATE public.auditoria SET usuario_id = NULL
WHERE usuario_id IN (
  SELECT id FROM public.usuarios WHERE email LIKE 'probe-rls-%@sgh-probe.invalid');

DELETE FROM public.usuarios WHERE email LIKE 'probe-rls-%@sgh-probe.invalid';

-- Revisar los conteos contra lo que mostró el paso 1.
-- Si no coinciden: ROLLBACK y averiguar por qué antes de insistir.
COMMIT;

-- 2f. Auth — bloque aparte a propósito.
-- ⚠️ El DELETE sobre auth.users CASCADEA a auth.identities, auth.sessions y
--    auth.refresh_tokens. Es lo que se quiere para un fixture, y es la razón
--    por la que el WHERE tiene que quedar angosto.
BEGIN;
DELETE FROM auth.users WHERE email LIKE 'probe-rls-%@sgh-probe.invalid';
COMMIT;

-- ===========================================================================
-- PASO 3 — VERIFICACIÓN. Esperado: 0 en todas las columnas.
-- ===========================================================================
SELECT
  (SELECT count(*) FROM public.usuarios     WHERE email  LIKE 'probe-rls-%@sgh-probe.invalid') AS usuarios,
  (SELECT count(*) FROM auth.users          WHERE email  LIKE 'probe-rls-%@sgh-probe.invalid') AS auth_users,
  (SELECT count(*) FROM public.reuniones    WHERE numero IN (9996, 9997))                      AS reuniones,
  (SELECT count(*) FROM public.spcs         WHERE nombre LIKE 'PROBE %')                       AS spcs,
  (SELECT count(*) FROM public.propietarios WHERE nombre LIKE 'PROBE-%')                       AS propietarios,
  (SELECT count(*) FROM public.inscripciones WHERE info_adicional LIKE 'probe-rls-%')          AS marcas_canario;
