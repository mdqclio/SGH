-- ============================================================
-- caballerizas_r8_tanda_5.sql — R8, tanda 5 (data de la reunión)
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo.
--
-- Pedido de Yesi el 10/08/2026 (sábado, data de la reunión R8 del 16/08).
-- Tres movimientos sobre `caballerizas`:
--   1. EL POE  -> rename a 'EL POBRE'  (REVERSA de lo decidido antes: la
--      caballeriza correcta es EL POBRE, 'EL POE' es el error de carga).
--   2. LUNA ROJA   -> alta, hipodromo_patente 'AZ'  (no existe en la base).
--   3. TIAN Y ROMA -> alta, hipodromo_patente 'LP'  (no existe en la base).
--
-- Convención copiada de caballerizas.html (igual que tandas 2/3/4):
--   club_id = Dolores, estado 'activo', activo true.
--   responsable / domicilio / telefono quedan NULL — los carga Yesi.
--
-- Guards corridos ANTES de escribir:
--   a) pwd = /home/clio/dev/SGH                                  ✅
--   b) SELECT count(*) FROM spcs                                 -> 179 ✅
--   c) caballerizas total                                        -> 292
--      (DOL 217 · NULL 74 · SR 1)
--   d) 'EL POE' existe, id a5a0e7a2-4c60-4cbe-bbcc-5271e6a8d40f,
--      hipodromo_patente YA es 'DOL' — el rename toca SÓLO el nombre.
--   e) no existe ninguna caballeriza 'EL POBRE' (scan normalizado)  -> 0
--   f) no existe 'LUNA ROJA' ni 'TIAN Y ROMA' en NINGÚN club
--      (scan `nombre ~* '(LUNA|ROJ|TIAN|ROMA)'` sobre las 292)      -> 0
--      El único hit de la familia LUNA en la base es el propietario
--      'LUNA, AUGUSTO LEONEL' — persona, no caballeriza. Otra cosa.
--
-- Referencias de EL POE contadas ANTES del rename (por eso es rename y no
-- borrar+crear, aunque el conteo haya salido más flaco de lo esperado):
--   caballeriza_responsables  -> 1  (MEDINA OSCAR ROBERTO, rol propietario,
--                                    DNI [REDACTADO], PILA — se conserva)
--   spcs.caballeriza_id       -> 0
--   inscripciones.caballeriza_id -> 0
--   profesionales.caballeriza_id -> 0
--
--   ⚠ LA LAGUNERA J NO cuelga de EL POE por FK: su `caballeriza_id` es NULL.
--     El vínculo es indirecto — `spcs.entrenador_id` = baa43a75-…-56f957 =
--     MEDINA OSCAR ROBERTO, que es el responsable de EL POE. Su inscripción
--     en R8 (reunión 8, 16/08, turno 6, id 97ac015a-…) también tiene
--     caballeriza_id NULL. El rename no la toca ni la rompe; simplemente
--     el dato de caballeriza todavía no está cargado en la inscripción.
--
--   Igual el rename es la operación correcta: preserva el id, la fila de
--   responsables y cualquier FK que se cargue de acá al sábado.
--
-- Idempotente: el UPDATE filtra por nombre = 'EL POE' (segunda corrida = 0
-- filas); los INSERT usan el mismo WHERE NOT EXISTS normalizado de la tanda 4.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Rename EL POE -> EL POBRE  (conserva id y referencias)
--
--    hipodromo_patente ya es 'DOL', se deja explícito igual para que la
--    migración sea autocontenida si alguien la corre sobre otro estado.
-- ------------------------------------------------------------
UPDATE caballerizas
SET nombre = 'EL POBRE',
    hipodromo_patente = 'DOL'
WHERE id = 'a5a0e7a2-4c60-4cbe-bbcc-5271e6a8d40f'
  AND nombre = 'EL POE';

-- ------------------------------------------------------------
-- 2. Altas (2)
--
--    LUNA ROJA (AZ)   — Azul. Yesi confirmó que es de afuera.
--    TIAN Y ROMA (LP) — La Plata.
--
--    La procedencia va en la COLUMNA, no pegada al nombre: caballerizas.html:324
--    e inscripciones.html:508 renderizan `${nombre}${patente ? ' ('+patente+')' : ''}`,
--    así que se muestran como "LUNA ROJA (AZ)" / "TIAN Y ROMA (LP)".
--    (Deuda vieja, no se toca acá: N.R.A (AZ), TRES AMIGOS (AZ) y GARIN CITY (LP)
--     tienen la procedencia dentro del nombre y hipodromo_patente NULL.)
--
--    ⚠ 'AZ' y 'LP' son valores nuevos para la columna — hoy sólo hay DOL y SR.
--      La columna es varchar libre, sin FK ni CHECK: no hay nada que migrar.
-- ------------------------------------------------------------
INSERT INTO caballerizas (club_id, nombre, hipodromo_patente, estado, activo)
SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid, v.nombre, v.patente, 'activo', true
FROM (VALUES
  ('LUNA ROJA',   'AZ'),
  ('TIAN Y ROMA', 'LP')
) AS v(nombre, patente)
WHERE NOT EXISTS (
  SELECT 1 FROM caballerizas c
  WHERE regexp_replace(upper(translate(c.nombre,'ÁÉÍÓÚÑÜáéíóúñü','AEIOUNUAEIOUNU')),'[^A-Z0-9]','','g')
      = regexp_replace(upper(translate(v.nombre,'ÁÉÍÓÚÑÜáéíóúñü','AEIOUNUAEIOUNU')),'[^A-Z0-9]','','g')
);

-- ------------------------------------------------------------
-- 3. Verificación ANTES del COMMIT
-- ------------------------------------------------------------

-- Debe dar 294 (292 + 2 altas).
SELECT count(*) AS caballerizas_total FROM caballerizas;

-- Debe dar 3 filas: EL POBRE (DOL, id a5a0e7a2-…), LUNA ROJA (AZ), TIAN Y ROMA (LP).
SELECT id, nombre, hipodromo_patente, estado, activo, responsable
FROM caballerizas
WHERE nombre IN ('EL POBRE','LUNA ROJA','TIAN Y ROMA')
ORDER BY nombre;

-- Debe dar 0 filas — 'EL POE' ya no existe.
SELECT count(*) AS el_poe_restante FROM caballerizas WHERE nombre = 'EL POE';

-- Debe dar 1 fila — la de MEDINA OSCAR ROBERTO, intacta bajo el nuevo nombre.
SELECT cr.apellido, cr.nombre, cr.rol, c.nombre AS caballeriza
FROM caballeriza_responsables cr
JOIN caballerizas c ON c.id = cr.caballeriza_id
WHERE cr.caballeriza_id = 'a5a0e7a2-4c60-4cbe-bbcc-5271e6a8d40f';

-- Debe devolver SÓLO los 2 duplicados preexistentes (deuda vieja, no se toca acá):
--   ELLINYEYRAMI -> 'El linye y Rami' (DOL) + 'EL LINYE Y RAMI' (DOL)
--   LANARCISA    -> 'La Narcisa'      (DOL) + 'LA NARCISA'      (DOL)
-- Cualquier tercera fila = la tanda 5 duplicó algo.
SELECT regexp_replace(upper(translate(nombre,'ÁÉÍÓÚÑÜáéíóúñü','AEIOUNUAEIOUNU')),'[^A-Z0-9]','','g') AS norm,
       count(*), string_agg(nombre, ' | ') AS filas
FROM caballerizas
GROUP BY 1 HAVING count(*) > 1;

COMMIT;
