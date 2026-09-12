-- ============================================================================
-- fix_ventanas_r9_hora_argentina.sql
--
-- Corrige las ventanas de R9 (Dolores, 20/09/2026) que quedaron corridas −3 h
-- por el bug de zona de carta-llamados.html: el modal mostraba la hora UTC en
-- un <input type="datetime-local"> y guardaba el value pelado, que Postgres
-- toma como UTC. Los CUATRO campos quedaron −3 h. No fueron cuatro errores de
-- carga: fue un bug aplicado cuatro veces. Yesi cargó bien.
--
-- Contexto y evidencia:
--   docs/diagnosticos/2026-09-08_plan-hora-cierre-r9.md
--   docs/diagnosticos/2026-09-08_fix-carta-llamados-hora-local.md
--   docs/diagnosticos/2026-09-08_plan-ventanas-r9-tres-columnas.md   ← este cambio
--   docs/GOTCHAS.md § 91
--
-- ALCANCE: TRES columnas de los once turnos de R9.
--   cierre_inscripcion    → viernes 11/09/2026 12:00 AR
--   apertura_ratificacion → lunes   14/09/2026 00:00 AR
--   cierre_ratificacion   → lunes   14/09/2026 12:00 AR
--
-- NO SE TOCA apertura_inscripcion: ya pasó (27/08) y se decidió no corregir
-- retroactivamente.
--
-- ⚠️ La sesión de la base está en UTC. Un literal pelado ('2026-09-11 12:00:00')
-- se interpretaría como 12:00 UTC = 09:00 AR, o sea que reescribiría el mismo
-- bug. Por eso los tres valores llevan AT TIME ZONE explícito.
-- Argentina es UTC−3 todo el año (sin horario de verano desde 2009).
--
-- Es DML, no DDL: se corre con execute_sql, NO con apply_migration. Vive acá
-- igual para que quede el rastro de qué se ejecutó.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PASO 0 — SNAPSHOT PREVIO. Correr y GUARDAR la salida antes de tocar nada.
-- ---------------------------------------------------------------------------
SELECT c.numero_turno, c.id,
       c.apertura_inscripcion  AS ap_insc_raw,
       c.apertura_inscripcion  AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ap_insc_ar,
       c.cierre_inscripcion    AS ci_insc_raw,
       c.cierre_inscripcion    AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ci_insc_ar,
       c.apertura_ratificacion AS ap_rat_raw,
       c.apertura_ratificacion AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ap_rat_ar,
       c.cierre_ratificacion   AS ci_rat_raw,
       c.cierre_ratificacion   AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ci_rat_ar,
       c.bolsa_total, c.estado
FROM reuniones r JOIN carreras c ON c.reunion_id = r.id
WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND r.numero  = 9
ORDER BY c.numero_turno;

-- Esperado (foto del 2026-09-08 02:00 UTC), idéntico en los once turnos:
--   ap_insc  2026-08-28 00:00:00+00  → 2026-08-27 21:00 AR   (T1: 2026-08-24 → 23/08 21:00)
--   ci_insc  2026-09-11 12:00:00+00  → 2026-09-11 09:00 AR
--   ap_rat   2026-09-14 00:00:00+00  → 2026-09-13 21:00 AR
--   ci_rat   2026-09-14 12:00:00+00  → 2026-09-14 09:00 AR


-- ---------------------------------------------------------------------------
-- PASO 1 — EL UPDATE. Una sola sentencia. Esperado: EXACTAMENTE 11 filas.
--          Si devuelve otro número: PARAR, no seguir, avisar.
-- ---------------------------------------------------------------------------
UPDATE carreras c
SET cierre_inscripcion    = TIMESTAMP '2026-09-11 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires',
    apertura_ratificacion = TIMESTAMP '2026-09-14 00:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires',
    cierre_ratificacion   = TIMESTAMP '2026-09-14 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires'
FROM reuniones r
WHERE c.reunion_id = r.id
  -- acote de tenencia: numero=9 NO es único entre clubes
  AND r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND r.numero  = 9
  -- idempotencia: las TRES tienen que estar en su valor viejo. Si alguna ya fue
  -- tocada, la fila entera queda afuera en vez de pisarse. Correrlo dos veces
  -- toca 0 filas — no vuelve a correr las horas.
  AND c.cierre_inscripcion    = TIMESTAMPTZ '2026-09-11 12:00:00+00'
  AND c.apertura_ratificacion = TIMESTAMPTZ '2026-09-14 00:00:00+00'
  AND c.cierre_ratificacion   = TIMESTAMPTZ '2026-09-14 12:00:00+00'
RETURNING c.numero_turno,
          c.cierre_inscripcion    AS ci_insc_raw,
          c.cierre_inscripcion    AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ci_insc_ar,
          c.apertura_ratificacion AS ap_rat_raw,
          c.apertura_ratificacion AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ap_rat_ar,
          c.cierre_ratificacion   AS ci_rat_raw,
          c.cierre_ratificacion   AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ci_rat_ar;

-- Esperado en las 11 filas:
--   ci_insc  2026-09-11 15:00:00+00  → 2026-09-11 12:00 AR  (viernes)
--   ap_rat   2026-09-14 03:00:00+00  → 2026-09-14 00:00 AR  (lunes)
--   ci_rat   2026-09-14 15:00:00+00  → 2026-09-14 12:00 AR  (lunes)


-- ---------------------------------------------------------------------------
-- PASO 2 — VERIFICACIONES
-- ---------------------------------------------------------------------------

-- 2.1 · Las tres columnas releídas en AR + los invariantes de ventana.
--       Esperado: 11 filas, los cuatro booleanos en true en todas.
SELECT c.numero_turno,
       to_char(c.cierre_inscripcion    AT TIME ZONE 'America/Argentina/Buenos_Aires', 'TMDay DD/MM HH24:MI') AS ci_insc_ar,
       to_char(c.apertura_ratificacion AT TIME ZONE 'America/Argentina/Buenos_Aires', 'TMDay DD/MM HH24:MI') AS ap_rat_ar,
       to_char(c.cierre_ratificacion   AT TIME ZONE 'America/Argentina/Buenos_Aires', 'TMDay DD/MM HH24:MI') AS ci_rat_ar,
       (c.cierre_inscripcion AT TIME ZONE 'America/Argentina/Buenos_Aires') = TIMESTAMP '2026-09-11 12:00:00' AS ok_ci_insc,
       (c.apertura_ratificacion AT TIME ZONE 'America/Argentina/Buenos_Aires') = TIMESTAMP '2026-09-14 00:00:00' AS ok_ap_rat,
       (c.cierre_ratificacion AT TIME ZONE 'America/Argentina/Buenos_Aires') = TIMESTAMP '2026-09-14 12:00:00' AS ok_ci_rat,
       c.cierre_inscripcion < c.apertura_ratificacion AS cierre_antes_de_ratificacion
FROM reuniones r JOIN carreras c ON c.reunion_id = r.id
WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9
ORDER BY c.numero_turno;

-- 2.2 · apertura_inscripcion INTACTA. Esperado: 0.
SELECT count(*) AS aperturas_de_inscripcion_movidas
FROM reuniones r JOIN carreras c ON c.reunion_id = r.id
WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9
  AND c.apertura_inscripcion NOT IN (TIMESTAMPTZ '2026-08-24 00:00:00+00',
                                     TIMESTAMPTZ '2026-08-28 00:00:00+00');

-- 2.3 · Nada tocado fuera de R9 / fuera de Dolores. Esperado: 0.
SELECT count(*) AS filas_con_valores_nuevos_fuera_de_r9
FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
WHERE (c.cierre_inscripcion    = TIMESTAMPTZ '2026-09-11 15:00:00+00'
    OR c.apertura_ratificacion = TIMESTAMPTZ '2026-09-14 03:00:00+00'
    OR c.cierre_ratificacion   = TIMESTAMPTZ '2026-09-14 15:00:00+00')
  AND NOT (r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9);

-- 2.4 · Las 11 entradas de auditoría del UPDATE. Esperado: 11.
SELECT count(*) AS entradas, min(created_at) AS desde, max(created_at) AS hasta
FROM auditoria
WHERE tabla = 'carreras' AND accion = 'UPDATE'
  AND created_at > now() - interval '5 minutes';

-- 2.5 · Las 3 inscripciones existentes siguen ahí y sin tocar. Esperado: 3.
SELECT count(*) AS inscripciones, count(*) FILTER (WHERE i.estado = 'inscripto') AS inscripto
FROM reuniones r JOIN carreras c ON c.reunion_id = r.id
JOIN inscripciones i ON i.carrera_id = c.id
WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9;


-- ---------------------------------------------------------------------------
-- PASO 3 — ROLLBACK. Simétrico, mismos acotes, valores exactos del snapshot.
--          SOLO si el PASO 1 salió mal. Devuelve la base al bug, no a un
--          estado neutro: no sirve como "deshacer" después de avisarle a nadie.
--          Esperado: 11 filas.
-- ---------------------------------------------------------------------------
-- UPDATE carreras c
-- SET cierre_inscripcion    = TIMESTAMPTZ '2026-09-11 12:00:00+00',
--     apertura_ratificacion = TIMESTAMPTZ '2026-09-14 00:00:00+00',
--     cierre_ratificacion   = TIMESTAMPTZ '2026-09-14 12:00:00+00'
-- FROM reuniones r
-- WHERE c.reunion_id = r.id
--   AND r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
--   AND r.numero  = 9
--   AND c.cierre_inscripcion    = TIMESTAMPTZ '2026-09-11 15:00:00+00'
--   AND c.apertura_ratificacion = TIMESTAMPTZ '2026-09-14 03:00:00+00'
--   AND c.cierre_ratificacion   = TIMESTAMPTZ '2026-09-14 15:00:00+00'
-- RETURNING c.numero_turno, c.cierre_inscripcion, c.apertura_ratificacion, c.cierre_ratificacion;


-- ---------------------------------------------------------------------------
-- PASO 4 — VERIFICACIÓN DEL LADO DEL USUARIO (fuera de SQL)
-- ---------------------------------------------------------------------------
-- Abrir el llamado abierto del portal (https://sigh.com.ar/portal.html) y
-- confirmar que el chip de los once turnos dice:
--
--     ⏳ cierra 11/9 12:00 hs
--
-- Es la prueba de punta a punta: usa el fechaHora() en 24 h mergeado el
-- 2026-09-08 (merge 1676bf7). Si dijera "09:00" el UPDATE no llegó; si dijera
-- "12:00 a. m." el que no llegó es el fix de formato.
