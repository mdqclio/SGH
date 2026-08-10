-- =============================================================
-- numero_publico_reuniones.sql
-- Gate 2 — Numeración pública de reuniones
-- Branch: feat/numero-publico-reuniones
-- Diseño: docs/NUMERO_PUBLICO_REUNIONES.md
--
-- NO APLICADA. Requiere aviso previo a Yesi + OK de Leo.
--
-- Idempotente: se puede correr más de una vez sin efectos extra.
-- Verificado contra PostgreSQL 17.6 (Supabase).
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. Columna
-- -------------------------------------------------------------
-- NULL es un valor legítimo: "no consume número público"
-- (suspendida/cancelada) o "todavía sin numerar".
ALTER TABLE reuniones
  ADD COLUMN IF NOT EXISTS numero_publico integer;

COMMENT ON COLUMN reuniones.numero_publico IS
  'Número de reunión de cara al público (programa, PDF, portal). '
  'Secuencia 1..N por club y año calendario, ordenada por fecha, '
  'salteando las reuniones suspendidas/canceladas (que quedan en NULL). '
  'Editable por secretaría. Distinto de reuniones.numero, que es la '
  'identidad técnica interna y no se toca.';

-- -------------------------------------------------------------
-- 2. Backfill
-- -------------------------------------------------------------
-- Primero liberar las que no consumen número.
UPDATE reuniones
   SET numero_publico = NULL
 WHERE estado IN ('cancelada', 'suspendida')
   AND numero_publico IS NOT NULL;

-- Luego renumerar 1..N por (club, año), ordenando por fecha.
-- El desempate por `numero` sólo actúa si dos reuniones del mismo
-- club caen el mismo día (hoy no pasa; está por las dudas).
WITH sec AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY club_id, EXTRACT(YEAR FROM fecha)
           ORDER BY fecha, numero
         ) AS n
    FROM reuniones
   WHERE estado NOT IN ('cancelada', 'suspendida')
)
UPDATE reuniones r
   SET numero_publico = sec.n
  FROM sec
 WHERE r.id = sec.id
   AND r.numero_publico IS DISTINCT FROM sec.n;

-- -------------------------------------------------------------
-- 3. Guard de unicidad
-- -------------------------------------------------------------
-- Índice único PARCIAL: la unicidad sólo aplica entre las reuniones
-- que efectivamente consumen número. Va DESPUÉS del backfill para
-- evitar colisiones transitorias durante el UPDATE masivo.
--
-- extract(text, date) es IMMUTABLE en PG 17.6 (provolatile='i') y
-- reuniones.fecha es date, así que la expresión es indexable.
CREATE UNIQUE INDEX IF NOT EXISTS reuniones_numero_publico_uniq
    ON reuniones (club_id, (EXTRACT(YEAR FROM fecha)::int), numero_publico)
 WHERE numero_publico IS NOT NULL
   AND estado NOT IN ('cancelada', 'suspendida');

-- -------------------------------------------------------------
-- 4. Función de default
-- -------------------------------------------------------------
-- Única definición de la regla. La consume la pantalla de reuniones
-- (vía RPC) para PROPONER el número al crear; el usuario confirma o
-- pisa. No hay trigger: la numeración es de secretaría, el sistema
-- no la cambia por la espalda. Ver docs/NUMERO_PUBLICO_REUNIONES.md §3.
CREATE OR REPLACE FUNCTION siguiente_numero_publico(
  p_club_id uuid,
  p_fecha   date
) RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
  SELECT COALESCE(MAX(numero_publico), 0) + 1
    FROM reuniones
   WHERE club_id = p_club_id
     AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM p_fecha)
     AND estado NOT IN ('cancelada', 'suspendida')
     AND numero_publico IS NOT NULL
     AND fecha < p_fecha;
$$;

COMMENT ON FUNCTION siguiente_numero_publico(uuid, date) IS
  'Propone el numero_publico para una reunión nueva del club en la '
  'fecha dada. Sugerencia, no imposición: la pantalla la muestra y '
  'secretaría puede pisarla.';

COMMIT;

-- =============================================================
-- VERIFICACIÓN (correr después del COMMIT)
-- =============================================================

-- V1 — El caso que motivó todo: la reunión del 16/08/2026 en Dolores
--      debe quedar en numero_publico = 7 (interno 8).
--      Esperado: una fila, ok = true.
SELECT numero        AS interno,
       numero_publico AS publico,
       fecha,
       estado::text,
       (numero_publico = 7) AS ok
  FROM reuniones
 WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
   AND fecha   = '2026-08-16';

-- V2 — Secuencia completa de Dolores 2026.
--      Esperado: 1..6 derecho, el 19/07 en NULL, 16/08 → 7, y de ahí
--      8,9,10,11 hasta el 13/12.
SELECT numero AS interno, fecha, estado::text, numero_publico AS publico
  FROM reuniones
 WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
   AND EXTRACT(YEAR FROM fecha) = 2026
 ORDER BY fecha;

-- V3 — Sin huecos ni saltos en ninguna secuencia.
--      Esperado: 0 filas.
SELECT club_id,
       EXTRACT(YEAR FROM fecha)::int AS anio,
       count(*)               AS reuniones_activas,
       max(numero_publico)    AS max_publico
  FROM reuniones
 WHERE estado NOT IN ('cancelada', 'suspendida')
   AND numero_publico IS NOT NULL
 GROUP BY 1, 2
HAVING count(*) <> max(numero_publico);

-- V4 — Ninguna suspendida/cancelada conserva número.
--      Esperado: 0 filas.
SELECT id, numero, fecha, estado::text, numero_publico
  FROM reuniones
 WHERE estado IN ('cancelada', 'suspendida')
   AND numero_publico IS NOT NULL;

-- V5 — La función propone bien. Para Dolores, una reunión hipotética
--      posterior al 13/12/2026 debe dar 12.
--      Esperado: 12.
SELECT siguiente_numero_publico(
         '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid,
         '2026-12-27'::date
       ) AS proximo_esperado_12;

-- =============================================================
-- ROLLBACK (si hiciera falta deshacer el gate 2 entero)
-- =============================================================
-- DROP FUNCTION IF EXISTS siguiente_numero_publico(uuid, date);
-- DROP INDEX  IF EXISTS reuniones_numero_publico_uniq;
-- ALTER TABLE reuniones DROP COLUMN IF EXISTS numero_publico;
-- (El numero interno nunca se tocó, así que no hay nada que restaurar.)
