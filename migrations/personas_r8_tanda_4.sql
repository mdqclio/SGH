-- ============================================================
-- personas_r8_tanda_4.sql — alta de cuidadores faltantes (R8, tanda 4)
-- ============================================================
-- ✅ APLICADO el 07/08/2026 por MCP apply_migration, migración `personas_r8_tanda_4`
--    3 altas (MALENA GUSTAVO, PALMIERI LEONARDO, VILLANUEVA SANTINO — los tres
--    entrenadores). profesionales 181 -> 184.
--    Verificado: 0 con club_id NULL, 0 duplicados de (apellido, nombre),
--    las 3 con documento_nro / documento_tipo / hipodromo_patente NULL.
--
-- Misma regla que las tandas 2 y 3 (autorizada por Leo el 05/08): esta
-- tanda SÍ crea personas, con nombre completo y documento_nro NULL donde
-- no haya DNI. El DNI llega después por auto-registro (Gate 3 ya vivo).
--
-- Padrón de la tanda 4: 1 jockey + 13 cuidadores.
-- Cruzado contra las 181 filas de profesionales, match por apellido
-- normalizado (upper, sin acentos) para no perder grafías largas.
-- Resultado: 11 ya existen, 3 son alta, 0 cambios de tipo.
--
-- 'cuidador' en la planilla = tipo 'entrenador' en profesionales.
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
-- 1. Cuidadores faltantes (3 de 13) → tipo 'entrenador'
--
--    Verificado para cada alta con regex acento-insensible sobre
--    apellido || ' ' || nombre de las 181 filas:
--      MALENA     → 0 filas con 'MALENA' en ningún campo.
--      PALMIERI   → 0 filas con PALMIER / PALMER.
--      VILLANUEVA → 0 filas con VILLANUEV / VILLANOV.
--
--    ⚠ El único SANTINO de la tabla es GIL SANTINO (jockey,
--      01b92e06-…). Otro apellido, otra persona: VILLANUEVA SANTINO
--      es alta igual.
--
--    ⚠ MALENA como APELLIDO es poco habitual (suele ser nombre de pila),
--      pero la planilla viene en formato APELLIDO NOMBRE y no hay ninguna
--      fila en la base con 'MALENA' en apellido NI en nombre, así que no
--      hay contra qué matchear ni evidencia de inversión. Se carga tal
--      cual vino. Si Yesi avisa que es GUSTAVO MALENA, es un UPDATE de
--      dos campos, sin impacto en FKs.
-- ------------------------------------------------------------
INSERT INTO profesionales (club_id, tipo, apellido, nombre, estado, activo)
SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid, 'entrenador'::tipo_profesional,
       v.apellido, v.nombre, 'activo', true
FROM (VALUES
  ('MALENA',     'GUSTAVO'),
  ('PALMIERI',   'LEONARDO'),
  ('VILLANUEVA', 'SANTINO')
) AS v(apellido, nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM profesionales p
  WHERE upper(btrim(p.apellido)) = upper(btrim(v.apellido))
    AND upper(btrim(p.nombre))   = upper(btrim(v.nombre))
);

-- ------------------------------------------------------------
-- 2. Jockeys — 0 altas. El único pedido ya existe.
--
--      ROMAY ABEL I.  → en base ROMAY, 'ABEL I'  (sin el punto final)
--                       jockey · 484361c0-… · sin DNI · patente NULL
--
--    Es la misma persona: mismo apellido, misma inicial. El punto es
--    puntuación de la planilla, no un dato. No se normaliza el nombre
--    de la base en esta tanda.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3. Cuidadores que ya existen — 0 altas, no se tocan (10)
--
--      ALZA MAXIMILIANO    entrenador · b75cbb70-… · sin DNI · patente NULL
--      TRUPPA ROBERTO      entrenador · 405ba68e-… · sin DNI · patente NULL
--      CARLI FEDERICO      entrenador · 05d9fbb6-… · sin DNI · patente NULL
--      CLAVERIE CLAUDIO    entrenador · ea8c26e4-… · DNI 23525492 · DOL
--      PALLET GUIDO        entrenador · 428cec84-… · DNI 34412986 · DOL
--      ANRIQUEZ GERONIMO   → en base 'GERONIMO FERNANDO'
--                            entrenador · bee25d92-… · DNI 25395876 · DOL
--      AZURI SANTIAGO      → en base 'SANTIAGO DAMIAN'
--                            entrenador · 280c3aab-… · DNI 21446180 · DOL
--      CUEVAS CESAR        → en base 'CESAR DANIEL'
--                            entrenador · 1da2aebd-… · DNI 23983195 · DOL
--      PEREZ GUILLERMO     → en base 'GUILLERMO HERNESTO'
--                            entrenador · ba8e2691-… · DNI 27105881 · DOL
--      PRESA LUIS          → en base 'LUIS HORACIO'
--                            entrenador · ec4af08c-… · DNI 12735421 · DOL
--
--    Los 5 que matchean contra una grafía más larga siguen el mismo
--    criterio de las tandas 2 y 3 (FARIAS OSVALDO = OSVALDO ISMAEL,
--    MORAGA ADRIAN = ADRIAN LEONARDO): la planilla trae el nombre corto,
--    la base el completo. No se duplica.
--
--    Confirmaciones cruzadas por dato externo (responsable de caballeriza):
--      AZURI SANTIAGO DAMIAN     → LOS AMIGOS
--      CUEVAS CESAR DANIEL       → EL LINYE Y RAMI
--      PEREZ GUILLERMO HERNESTO  → SANTA BARBARA (DOL)
--      PALLET GUIDO              → EL GALPON
--
--    ✅ PRESA LUIS es persona distinta de PRESA DANIEL, como avisó Leo.
--       En la base: PRESA LUIS HORACIO (entrenador, DNI 12735421, DOL) y
--       PRESA DANIEL (jockey, 8c358b73-…, sin DNI). Distinto tipo,
--       distinto nombre, distinto DNI. NO es typo, no se unifican.
--
--    ⚠ CARLI FEDERICO (entrenador, sin DNI) convive con CARLI ORNELA
--      (entrenador, DNI 34653709, DOL). Dos personas, no duplicados.
-- ------------------------------------------------------------

-- Verificación dentro de la misma transacción:
--   revisar ANTES de hacer COMMIT.
SELECT count(*) AS profesionales_total FROM profesionales;                -- esperado 184
SELECT count(*) AS sin_club FROM profesionales WHERE club_id IS NULL;     -- esperado 0
SELECT apellido, nombre, tipo, documento_nro, hipodromo_patente, club_id, estado
FROM profesionales
WHERE (upper(apellido), upper(nombre)) IN
      (('MALENA','GUSTAVO'), ('PALMIERI','LEONARDO'), ('VILLANUEVA','SANTINO'))
ORDER BY apellido;                                                        -- esperado 3 filas
SELECT upper(btrim(apellido)) a, upper(btrim(nombre)) n, count(*)
FROM profesionales GROUP BY 1,2 HAVING count(*) > 1;                      -- esperado 0 filas

COMMIT;
