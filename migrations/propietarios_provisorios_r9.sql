-- ============================================================
-- propietarios_provisorios_r9.sql — propietario PROVISORIO para toda caballeriza con inscripción en R9 y sin titular
-- ============================================================
-- ✅ EJECUTADA el 11/09/2026 (noche) por MCP apply_migration (nombre: propietarios_provisorios_r9), con OK de Leo.
--    Marca usada: 'provisorio R9 11/09'. Resultado: 7 provisorios + 7 vínculos; 21 inscripciones re-derivadas
--    (R6 8, R8 5, R9 8 — Leo pidió incluir las viejas: no generan plata, dejan el historial con dueño).
--    R9 quedó 76 inscripciones / 68 con propietario / 0 con caballeriza sin propietario / 8 sin caballeriza.
--    propietarios 264→271, provisorios 40→47, responsables 263→270, liquidaciones sin cambio (189/493).
--
-- RE-EJECUTABLE (pedido de Leo): la lista se calcula al correr. Si entre hoy y el lunes aparece otra
-- caballeriza sin titular con inscripción en R9, volver a correr el bloque DO de abajo tal cual
-- (con la marca de la fecha) — es idempotente: no duplica provisorios ni vínculos, y aborta si no hay nada.
--
-- Lo que se aplicó fue el bloque DO (§EJECUTADO, al final), no el BEGIN/COMMIT de abajo: misma lógica,
-- con los conteos esperados calculados adentro y RAISE en cada desvío. El BEGIN/COMMIT queda como
-- lectura paso a paso.
--
-- Medido el 11/09/2026 (docs/diagnosticos/2026-09-11_r9-cuadro-72-y-plan-provisorios.md):
--   R9 = 72 inscripciones · 56 con propietario_id · 8 con caballeriza SIN ningún responsable → propietario_id NULL
--   · 8 sin caballeriza todavía (los 8 SPC dados de alta hoy; Yesi las asigna).
--   Las 7 caballerizas sin responsable: 2 DE ABRIL MAIPU, Abuelo Calin, HARAS EL ORIGEN, LA COLONIA,
--   LOS 6 CORAZONES, MONTE DEL TORDILLO (×2), SAICA. Ninguna tiene un propietario homónimo en el club.
--
-- Es el caso de R8 (docs/RUNBOOK_R8_PROVISORIOS.md §B4-B6) en R9: sin dueño no se liquida el premio del
-- propietario ni el bono 6-8 (GOTCHA #47). Criterio de Fede (15/08): propietario provisorio con el nombre
-- de la caballeriza, sin documento, marca en notas; se completa cuando alguien viene a cobrar.
-- Mismo formato que los 40 de R8 y que EL DON JORGE (LP) (11/09):
--   propietarios:             club_id, tipo 'persona', nombre = caballeriza, activo, 'activo', notas 'provisorio R9 <fecha>'
--   caballeriza_responsables: rol 'propietario', activo, nombre = caballeriza, documento_tipo 'DNI', sin nro, sin profesional
--
-- DATA-DRIVEN, no por ids: la lista se calcula al ejecutar. Así, si Yesi asigna hoy las 8 caballerizas que
-- faltan y alguna tampoco tiene titular, entra sola. Por eso conviene correrlo el LUNES 14/09 después de la
-- ratificación: entran sólo caballerizas con inscripciones definitivas.
-- Idempotente: no crea un segundo provisorio si ya hay uno con ese nombre y marca; no crea responsable si la
-- caballeriza ya tiene titular activo.
-- Re-derivación (§3): TODAS las inscripciones sin propietario de esas caballerizas (R6, R8 y R9) — decisión
-- de Leo 11/09: no genera plata (no re-liquida) y deja el historial con dueño.
-- ============================================================

-- MARCA: 'provisorio R9 14/09' — ajustar a la fecha real de ejecución (formato 'provisorio R<n> DD/MM', como 'provisorio R8 15/08').
-- Aparece 5 veces abajo; reemplazar las 5 si cambia.

-- ------------------------------------------------------------
-- 0. Pre-chequeos (fuera de la tx)
-- ------------------------------------------------------------

-- 0.a  La lista que va a entrar. Anotar N (el 11/09: 7 caballerizas / 8 inscripciones).
SELECT c.id AS cab_id, c.nombre, c.hipodromo_patente,
       count(i.id) AS inscr_r9_sin_prop,
       string_agg(s.nombre || ' T' || ca.numero_turno, ', ' ORDER BY ca.numero_turno) AS caballos
FROM caballerizas c
JOIN inscripciones i ON i.caballeriza_id = c.id AND i.propietario_id IS NULL
JOIN carreras ca ON ca.id = i.carrera_id AND ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'
JOIN spcs s ON s.id = i.spc_id
WHERE c.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND NOT EXISTS (SELECT 1 FROM caballeriza_responsables r WHERE r.caballeriza_id = c.id AND r.rol = 'propietario' AND r.activo)
GROUP BY c.id, c.nombre, c.hipodromo_patente
ORDER BY c.nombre;

-- 0.b  Inscripciones de R9 con caballeriza que SÍ tiene titular y aun así propietario_id NULL: tiene que dar 0.
--      (si da algo, el trigger no corrió — resolver antes, no es este caso)
SELECT count(*) FROM inscripciones i JOIN carreras ca ON ca.id = i.carrera_id
WHERE ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9' AND i.caballeriza_id IS NOT NULL AND i.propietario_id IS NULL
  AND EXISTS (SELECT 1 FROM caballeriza_responsables r WHERE r.caballeriza_id = i.caballeriza_id AND r.rol = 'propietario' AND r.activo);

-- 0.c  Homónimos: propietarios del club con el nombre de alguna de esas caballerizas. Tiene que dar 0
--      (el 11/09 dio 0). Si da algo, es un titular real ya cargado → vincularlo, no crear provisorio.
SELECT p.id, p.nombre, p.documento_nro, p.notas FROM propietarios p
WHERE p.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND upper(btrim(p.nombre)) IN (
    SELECT upper(btrim(c.nombre)) FROM caballerizas c
    JOIN inscripciones i ON i.caballeriza_id = c.id AND i.propietario_id IS NULL
    JOIN carreras ca ON ca.id = i.carrera_id AND ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'
    WHERE NOT EXISTS (SELECT 1 FROM caballeriza_responsables r WHERE r.caballeriza_id = c.id AND r.rol = 'propietario' AND r.activo));

-- 0.d  Conteos: anotar.
SELECT (SELECT count(*) FROM propietarios) AS propietarios,
       (SELECT count(*) FROM propietarios WHERE notas LIKE 'provisorio R%') AS provisorios,
       (SELECT count(*) FROM caballeriza_responsables) AS responsables,
       (SELECT count(*) FROM inscripciones i JOIN carreras ca ON ca.id = i.carrera_id WHERE ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9' AND i.propietario_id IS NULL) AS r9_sin_prop;

BEGIN;

-- ------------------------------------------------------------
-- 1 + 2. Provisorios + vínculos (una sola sentencia, forma del runbook de R8 §B4)
-- ------------------------------------------------------------
WITH falta AS (
  SELECT DISTINCT c.id AS cab_id, c.club_id, c.nombre
  FROM caballerizas c
  JOIN inscripciones i ON i.caballeriza_id = c.id AND i.propietario_id IS NULL
  JOIN carreras ca ON ca.id = i.carrera_id AND ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'
  WHERE c.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
    AND NOT EXISTS (SELECT 1 FROM caballeriza_responsables r WHERE r.caballeriza_id = c.id AND r.rol = 'propietario' AND r.activo)
),
nuevos AS (
  INSERT INTO propietarios (club_id, tipo, nombre, activo, estado, notas)
  SELECT f.club_id, 'persona', f.nombre, true, 'activo', 'provisorio R9 14/09'
  FROM falta f
  WHERE NOT EXISTS (
    SELECT 1 FROM propietarios p
    WHERE p.club_id = f.club_id AND upper(btrim(p.nombre)) = upper(btrim(f.nombre)) AND p.notas LIKE 'provisorio R%'
  )
  RETURNING id, club_id, nombre
)
INSERT INTO caballeriza_responsables (caballeriza_id, propietario_id, rol, activo, nombre, documento_tipo)
SELECT f.cab_id, COALESCE(n.id, pe.id), 'propietario', true, f.nombre, 'DNI'
FROM falta f
LEFT JOIN nuevos n ON n.club_id = f.club_id AND upper(btrim(n.nombre)) = upper(btrim(f.nombre))
LEFT JOIN LATERAL (
  SELECT p.id FROM propietarios p
  WHERE p.club_id = f.club_id AND upper(btrim(p.nombre)) = upper(btrim(f.nombre)) AND p.notas LIKE 'provisorio R%'
  ORDER BY p.created_at, p.id LIMIT 1
) pe ON true
WHERE COALESCE(n.id, pe.id) IS NOT NULL;
-- Esperado: N filas (una por caballeriza de 0.a).

-- ------------------------------------------------------------
-- 3. Re-derivación en R9 (runbook §B6, acotado a R9)
-- ------------------------------------------------------------
UPDATE inscripciones i
SET propietario_id = sub.propietario_id
FROM (
  SELECT DISTINCT ON (cr.caballeriza_id) cr.caballeriza_id, cr.propietario_id
  FROM caballeriza_responsables cr
  WHERE cr.rol = 'propietario' AND cr.activo = true AND cr.propietario_id IS NOT NULL
  ORDER BY cr.caballeriza_id, cr.created_at NULLS LAST, cr.id
) sub
WHERE sub.caballeriza_id = i.caballeriza_id
  AND i.propietario_id IS NULL
  AND i.carrera_id IN (SELECT id FROM carreras WHERE reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9');
-- Esperado: = inscr_r9_sin_prop de 0.a (el 11/09: 8).

-- ------------------------------------------------------------
-- Verificación ANTES del COMMIT
-- ------------------------------------------------------------
-- 0: ninguna inscripción de R9 con caballeriza y sin propietario.
SELECT count(*) AS r9_con_cab_sin_prop FROM inscripciones i JOIN carreras ca ON ca.id = i.carrera_id
WHERE ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9' AND i.caballeriza_id IS NOT NULL AND i.propietario_id IS NULL;

-- 0: ninguna caballeriza con más de un titular activo (el LIMIT 1 del trigger elegiría al azar).
SELECT cr.caballeriza_id, count(*) FROM caballeriza_responsables cr
WHERE cr.rol = 'propietario' AND cr.activo GROUP BY 1 HAVING count(*) > 1;

-- Los nuevos, con sus caballos de R9.
SELECT p.nombre, p.notas, c.nombre AS cab, string_agg(s.nombre || ' T' || ca.numero_turno, ', ') AS caballos_r9
FROM propietarios p
JOIN caballeriza_responsables cr ON cr.propietario_id = p.id
JOIN caballerizas c ON c.id = cr.caballeriza_id
JOIN inscripciones i ON i.caballeriza_id = c.id AND i.propietario_id = p.id
JOIN carreras ca ON ca.id = i.carrera_id AND ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'
JOIN spcs s ON s.id = i.spc_id
WHERE p.notas = 'provisorio R9 14/09'
GROUP BY p.nombre, p.notas, c.nombre ORDER BY p.nombre;

-- Conteos: propietarios +N, provisorios +N, responsables +N, r9_sin_prop = sólo las sin caballeriza.
SELECT (SELECT count(*) FROM propietarios) AS propietarios,
       (SELECT count(*) FROM propietarios WHERE notas LIKE 'provisorio R%') AS provisorios,
       (SELECT count(*) FROM caballeriza_responsables) AS responsables,
       (SELECT count(*) FROM inscripciones i JOIN carreras ca ON ca.id = i.carrera_id WHERE ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9' AND i.propietario_id IS NULL) AS r9_sin_prop,
       (SELECT count(*) FROM liquidaciones) AS liq, (SELECT count(*) FROM liquidacion_detalle) AS det;   -- liq/det sin cambio

COMMIT;

-- ------------------------------------------------------------
-- 4. (OPCIONAL, decisión aparte — NO incluido en la tx) Re-derivar R6 y R8 de las mismas caballerizas
-- ------------------------------------------------------------
-- Mismo UPDATE de §3 cambiando el reunion_id por el de R6 ('…') y R8 ('7b6e003e-22e2-4629-bf55-f18560b1260f').
-- No genera líneas de liquidación (no re-liquida nada); sólo deja el historial con dueño. Si alguna vez se
-- re-liquida R6/R8, esos provisorios cobrarían lo suyo. El 11/09: R6 9 inscripciones, R8 5.

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- UPDATE inscripciones i SET propietario_id = NULL
--   WHERE i.propietario_id IN (SELECT id FROM propietarios WHERE notas = 'provisorio R9 14/09')
--     AND i.carrera_id IN (SELECT id FROM carreras WHERE reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9');
-- DELETE FROM caballeriza_responsables WHERE propietario_id IN (SELECT id FROM propietarios WHERE notas = 'provisorio R9 14/09');
-- DELETE FROM propietarios WHERE notas = 'provisorio R9 14/09'
--   AND NOT EXISTS (SELECT 1 FROM liquidaciones l WHERE l.propietario_id = propietarios.id)
--   AND NOT EXISTS (SELECT 1 FROM recibos r WHERE r.propietario_id = propietarios.id);
-- COMMIT;
-- (Seguro sólo antes de liquidar R9. Después, los provisorios tienen plata y se completan, no se borran.)


-- ============================================================
-- EJECUTADO — bloque DO tal como se aplicó (re-ejecutable; cambiar `marca` a la fecha del día)
-- ============================================================
DO $$
DECLARE n_cabs int; n_null int; n int; k int; liq0 int; det0 int; liq1 int; det1 int; p0 int; r0 int; p1 int; r1 int;
  r9 uuid := 'cafa37d6-89f4-45cb-a0d9-835bc27407e9';
  dol uuid := '0649e9c5-9e87-4aad-842f-101458e6b33c';
  marca text := 'provisorio R9 11/09';
BEGIN
  CREATE TEMP TABLE falta ON COMMIT DROP AS
    SELECT DISTINCT c.id AS cab_id, c.club_id, c.nombre
    FROM caballerizas c
    JOIN inscripciones i ON i.caballeriza_id = c.id AND i.propietario_id IS NULL
    JOIN carreras ca ON ca.id = i.carrera_id AND ca.reunion_id = r9
    WHERE c.club_id = dol
      AND NOT EXISTS (SELECT 1 FROM caballeriza_responsables r WHERE r.caballeriza_id = c.id AND r.rol = 'propietario' AND r.activo);
  SELECT count(*) INTO n_cabs FROM falta;
  SELECT count(*) INTO n_null FROM inscripciones i WHERE i.caballeriza_id IN (SELECT cab_id FROM falta) AND i.propietario_id IS NULL;
  IF n_cabs = 0 THEN RAISE EXCEPTION 'nada que hacer: 0 caballerizas sin titular con inscripciones en R9'; END IF;
  SELECT count(*) INTO k FROM inscripciones i JOIN carreras ca ON ca.id = i.carrera_id
    WHERE ca.reunion_id = r9 AND i.caballeriza_id IS NOT NULL AND i.propietario_id IS NULL
      AND EXISTS (SELECT 1 FROM caballeriza_responsables r WHERE r.caballeriza_id = i.caballeriza_id AND r.rol = 'propietario' AND r.activo);
  IF k <> 0 THEN RAISE EXCEPTION '% inscripciones de R9 con titular y propietario NULL (trigger?) -> rollback', k; END IF;
  SELECT count(*) INTO k FROM propietarios p WHERE p.club_id = dol AND upper(btrim(p.nombre)) IN (SELECT upper(btrim(nombre)) FROM falta);
  IF k <> 0 THEN RAISE EXCEPTION '% propietarios homónimos de caballerizas de falta -> resolver a mano', k; END IF;
  SELECT count(*) INTO p0 FROM propietarios; SELECT count(*) INTO r0 FROM caballeriza_responsables;
  SELECT count(*) INTO liq0 FROM liquidaciones; SELECT count(*) INTO det0 FROM liquidacion_detalle;
  INSERT INTO propietarios (club_id, tipo, nombre, activo, estado, notas)
  SELECT f.club_id, 'persona', f.nombre, true, 'activo', marca FROM falta f
  WHERE NOT EXISTS (SELECT 1 FROM propietarios p WHERE p.club_id = f.club_id AND upper(btrim(p.nombre)) = upper(btrim(f.nombre)) AND p.notas LIKE 'provisorio R%');
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> n_cabs THEN RAISE EXCEPTION 'propietarios insertados % <> caballerizas % -> rollback', n, n_cabs; END IF;
  INSERT INTO caballeriza_responsables (caballeriza_id, propietario_id, rol, activo, nombre, documento_tipo)
  SELECT f.cab_id, p.id, 'propietario', true, f.nombre, 'DNI'
  FROM falta f
  JOIN LATERAL (SELECT p.id FROM propietarios p WHERE p.club_id = f.club_id AND upper(btrim(p.nombre)) = upper(btrim(f.nombre)) AND p.notas LIKE 'provisorio R%' ORDER BY p.created_at, p.id LIMIT 1) p ON true;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> n_cabs THEN RAISE EXCEPTION 'responsables insertados % <> caballerizas % -> rollback', n, n_cabs; END IF;
  UPDATE inscripciones i SET propietario_id = cr.propietario_id
  FROM falta f
  JOIN caballeriza_responsables cr ON cr.caballeriza_id = f.cab_id AND cr.rol = 'propietario' AND cr.activo AND cr.propietario_id IS NOT NULL
  WHERE i.caballeriza_id = f.cab_id AND i.propietario_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> n_null THEN RAISE EXCEPTION 're-derivadas % <> esperadas % -> rollback', n, n_null; END IF;
  SELECT count(*) INTO k FROM inscripciones i WHERE i.caballeriza_id IN (SELECT cab_id FROM falta) AND i.propietario_id IS NULL;
  IF k <> 0 THEN RAISE EXCEPTION 'quedan % inscripciones en NULL -> rollback', k; END IF;
  SELECT count(*) INTO k FROM inscripciones i JOIN carreras ca ON ca.id = i.carrera_id WHERE ca.reunion_id = r9 AND i.caballeriza_id IS NOT NULL AND i.propietario_id IS NULL;
  IF k <> 0 THEN RAISE EXCEPTION 'R9: % inscripciones con caballeriza y sin propietario -> rollback', k; END IF;
  SELECT count(*) INTO k FROM (SELECT caballeriza_id FROM caballeriza_responsables WHERE rol = 'propietario' AND activo GROUP BY 1 HAVING count(*) > 1) x;
  IF k <> 0 THEN RAISE EXCEPTION '% caballerizas con más de un titular activo -> rollback', k; END IF;
  SELECT count(*) INTO p1 FROM propietarios; SELECT count(*) INTO r1 FROM caballeriza_responsables;
  IF p1 <> p0 + n_cabs OR r1 <> r0 + n_cabs THEN RAISE EXCEPTION 'conteos propietarios %->% responsables %->% (esperaba +%) -> rollback', p0, p1, r0, r1, n_cabs; END IF;
  SELECT count(*) INTO liq1 FROM liquidaciones; SELECT count(*) INTO det1 FROM liquidacion_detalle;
  IF liq1 <> liq0 OR det1 <> det0 THEN RAISE EXCEPTION 'liquidaciones cambiaron -> rollback'; END IF;
  RAISE NOTICE 'OK: % caballerizas, % inscripciones re-derivadas', n_cabs, n_null;
END $$;
