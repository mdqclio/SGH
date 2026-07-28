-- Teardown manual del residuo de tests/probe_invite_user.mjs
--
-- CUÁNDO SE USA
-- El probe limpia solo, en un bloque `finally`, así que en la corrida normal
-- este archivo no hace falta. Queda residuo en tres casos:
--
--   1. INVITE_KEEP_TEST_USER=1 — se conserva a propósito el invitado real para
--      poder abrir el mail y completar el flujo por reset-password.html. El
--      teardown de ESE usuario es manual por diseño.
--   2. El borrado en Auth falló. `deleteUser` va con 12 reintentos contra el
--      "kid <nil> ES256", pero si se agotan el probe LOGUEA Y SIGUE — no falla
--      por eso. Quedan cuentas colgadas en auth.users.
--   3. El borrado en public.usuarios falló. Mismo patrón: console.error y sigue.
--
-- El caso 2 es el más probable justamente por el bug de plataforma: el mismo
-- "kid <nil>" que motivó la rama de retry de la función también pega en el
-- deleteUser del cleanup. Por eso este archivo va por SQL directo y no por la
-- Admin API — el SQL no pasa por GoTrue, así que el bug no lo toca.
--
-- CÓMO SE USA
-- Correr los SELECT primero, mirar qué sale, y recién ahí los DELETE.
-- NO correr el archivo entero de una.
--
-- ⚠️ Los patrones de abajo son deliberadamente angostos: dominio .invalid y
--    prefijo `probe-invite-`. Nada que matchee puede ser un usuario real —
--    .invalid es RFC 2606, no existe fuera de este probe. NO ampliar el LIKE.

-- ===========================================================================
-- PASO 1 — INSPECCIÓN (read-only). Correr esto primero, siempre.
-- ===========================================================================

-- 1a. Fixtures en public.usuarios
SELECT id, email, rol, club_id, activo, estado, created_at
FROM public.usuarios
WHERE email LIKE 'probe-invite-%@sgh-probe.invalid'
ORDER BY created_at;

-- 1b. Fixtures en auth.users
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
WHERE email LIKE 'probe-invite-%@sgh-probe.invalid'
ORDER BY created_at;

-- 1c. El invitado real (caso 1 / INVITE_KEEP_TEST_USER).
--     Reemplazar el placeholder por el valor de INVITE_TEST_EMAIL usado en la
--     corrida. NO usar LIKE acá: es una casilla real, se borra por igualdad exacta.
SELECT 'usuarios' AS origen, id::text, email, activo::text AS extra
FROM public.usuarios WHERE lower(email) = lower('REEMPLAZAR@descartable.tld')
UNION ALL
SELECT 'auth.users', id::text, email, email_confirmed_at::text
FROM auth.users     WHERE lower(email) = lower('REEMPLAZAR@descartable.tld');

-- ===========================================================================
-- PASO 2 — BORRADO. Sólo después de mirar el paso 1.
-- ===========================================================================
-- No hay FK entre auth.users y public.usuarios (el vínculo es el email, §1.3
-- del plan), así que el orden entre 2a y 2b es indistinto.
--
-- ⚠️ El DELETE sobre auth.users CASCADEA a auth.identities, auth.sessions y
--    auth.refresh_tokens por FK. Eso es lo que se quiere para un fixture, pero
--    es la razón por la que el WHERE tiene que quedar angosto.

BEGIN;

-- 2a. Fixtures en public.usuarios
DELETE FROM public.usuarios
WHERE email LIKE 'probe-invite-%@sgh-probe.invalid';

-- 2b. Fixtures en auth.users
DELETE FROM auth.users
WHERE email LIKE 'probe-invite-%@sgh-probe.invalid';

-- Revisar el conteo de filas afectadas contra lo que mostró el paso 1.
-- Si no coincide, ROLLBACK y averiguar por qué antes de insistir.
COMMIT;

-- ---------------------------------------------------------------------------
-- 2c. El invitado real — BLOQUE APARTE, a propósito.
-- Descomentar y reemplazar el placeholder sólo cuando la prueba manual del
-- flujo de invitación ya terminó. Borrarlo antes invalida el link del mail.
-- ---------------------------------------------------------------------------
-- BEGIN;
-- DELETE FROM public.usuarios WHERE lower(email) = lower('REEMPLAZAR@descartable.tld');
-- DELETE FROM auth.users      WHERE lower(email) = lower('REEMPLAZAR@descartable.tld');
-- COMMIT;

-- ===========================================================================
-- PASO 3 — VERIFICACIÓN
-- ===========================================================================
-- Esperado: 0 en las dos columnas.
SELECT
  (SELECT count(*) FROM public.usuarios WHERE email LIKE 'probe-invite-%@sgh-probe.invalid') AS quedan_usuarios,
  (SELECT count(*) FROM auth.users      WHERE email LIKE 'probe-invite-%@sgh-probe.invalid') AS quedan_auth;
