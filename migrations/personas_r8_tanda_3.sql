-- ============================================================
-- personas_r8_tanda_3.sql — alta de jockeys faltantes (R8, tanda 3)
-- ============================================================
-- ✅ APLICADO el 06/08/2026 por MCP apply_migration, migración `personas_r8_tanda_3`
--    2 altas (LOPEZ ALEXIS, MARCHANT JUAN — jockeys). profesionales 177 -> 179.
--    Verificado: 0 con club_id NULL, 0 duplicados de (apellido, nombre),
--    las 2 con documento_nro / documento_tipo / hipodromo_patente NULL.
--
-- Misma regla que la tanda 2 (autorizada por Leo el 05/08): esta tanda SÍ
-- crea personas, con nombre completo y documento_nro NULL donde no haya DNI.
-- El DNI llega después por auto-registro (Gate 3 ya vivo).
--
-- Padrón de la tanda 3: 4 jockeys + 5 cuidadores, más 2 que Leo pidió
-- cruzar por venir de junio (BOLONTI ROBERTO, CANTO TOBIAS).
-- Cruzado contra las 177 filas de profesionales.
-- Resultado: 9 ya existen, 2 son alta, 0 cambios de tipo.
--
-- Convención copiada de profesionales.html / jockeys.html:
--   estado 'activo', activo true, hipodromo_patente NULL (el form lo deja
--   vacío en un alta nueva), documento_tipo/documento_nro NULL,
--   club_id = Dolores.
--
-- ⚠ profesionales NO tiene unique en (apellido, nombre) — sólo PK en id.
--   La idempotencia la da el WHERE NOT EXISTS, no la base.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Jockeys faltantes (2 de 4)
--
--    Ya existen y NO se tocan:
--      D'ELIA THIAGO      jockey · id b4727bd1-9808-40cf-8467-772c4a8b8539
--      DIESTRA BAUTISTA   jockey · id 70907ee8-7c1b-45d6-9821-d55f344c05a6
--
--    ⚠ DIESTRA BAUTISTA es persona distinta de DIESTRA PEDRO (jockey,
--      id 654dc3ea-…), como avisó Leo. NO es typo. La tabla tiene además
--      DIESTRA CLAUDIO MAXIMILIANO, DIESTRA FLORENCIA y DIESTRA JUAN
--      DOMINGO (los tres entrenadores): es una familia, no duplicados.
--
--    Verificado para cada alta con regex acento-insensible sobre las 177
--    filas: 0 filas con apellido L[OÓ]PEZ, 0 con MARCHAN.
--    El único ALEXIS de la tabla es CONSTANCIO ALEXIS (entrenador) —
--    otro apellido, otra persona.
-- ------------------------------------------------------------
INSERT INTO profesionales (club_id, tipo, apellido, nombre, estado, activo)
SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid, 'jockey'::tipo_profesional,
       v.apellido, v.nombre, 'activo', true
FROM (VALUES
  ('LOPEZ',    'ALEXIS'),  -- 0 LOPEZ / LÓPEZ en la tabla
  ('MARCHANT', 'JUAN')     -- 0 MARCHANT / MARCHAN en la tabla
) AS v(apellido, nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM profesionales p
  WHERE upper(btrim(p.apellido)) = upper(btrim(v.apellido))
    AND upper(btrim(p.nombre))   = upper(btrim(v.nombre))
);

-- ------------------------------------------------------------
-- 2. Cuidadores — 0 altas. Los 5 pedidos ya existen.
--    'cuidador' en la planilla = tipo 'entrenador' en profesionales.
--
--      BLANCO MARCELO      entrenador · 3c973f57-… · sin DNI
--      PREBE JOSE          entrenador · 8528087d-… · sin DNI
--      CANTO HORACIO       entrenador · a8d0e58a-… · sin DNI
--      MORAGA ADRIAN       → en base MORAGA, 'ADRIAN LEONARDO'
--                            entrenador · 3d20a735-… · DNI 43001366 · DOL
--      CASINELLI FABRICIO  entrenador · 580338fd-… · DNI 41434669 · DOL
--
--    MORAGA ADRIAN matchea contra la grafía más larga de la base, igual
--    que los 6 casos de la tanda 2 (FARIAS OSVALDO = OSVALDO ISMAEL, etc.).
--    Confirmado por dato externo: la caballeriza EL DESEMPEÑO ya tiene
--    responsable 'MORAGA MILLAN ADRIAN LEONARDO (propietario)'.
--    No se da de alta.
--
--    ⚠ CANTO HORACIO (entrenador) convive con CANTO TOMAS (entrenador) y
--      CANTO TOBIAS (jockey). Tres personas distintas, ninguna es typo.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3. Los dos de junio que Leo pidió cruzar — ambos están. 0 altas.
--      BOLONTI ROBERTO   entrenador · 87bc872c-… · sin DNI
--      CANTO TOBIAS      jockey     · 005caa02-… · sin DNI
-- ------------------------------------------------------------

-- Verificación dentro de la misma transacción:
--   revisar ANTES de hacer COMMIT.
SELECT count(*) AS profesionales_total FROM profesionales;                -- esperado 179
SELECT count(*) AS sin_club FROM profesionales WHERE club_id IS NULL;     -- esperado 0
SELECT apellido, nombre, tipo, documento_nro, hipodromo_patente, club_id, estado
FROM profesionales
WHERE (upper(apellido), upper(nombre)) IN (('LOPEZ','ALEXIS'), ('MARCHANT','JUAN'))
ORDER BY apellido;                                                        -- esperado 2 filas
SELECT upper(btrim(apellido)) a, upper(btrim(nombre)) n, count(*)
FROM profesionales GROUP BY 1,2 HAVING count(*) > 1;                      -- esperado 0 filas

COMMIT;
