-- ============================================================
-- caballerizas_r8_tanda_2.sql — alta de caballerizas faltantes (R8, tandas 1 + 2)
-- ============================================================
-- ✅ APLICADO el 05/08/2026 por MCP apply_migration, migración `caballerizas_r8_tanda_2`
--    9 altas. Caballerizas de Dolores 272 -> 281. Verificado.
-- ✅ DON NITO aplicado después, el 06/08/2026, por migración
--    `caballerizas_r8_tanda_2_don_nito`. Dolores 281 -> 282. Ver el bloque
--    al final. La unificación con DON NINO sigue abierta.
-- Cambio de regla autorizado por Leo el 05/08: esta tanda SÍ crea
-- caballerizas. Antes quedaban fuera del circuito (las cargaba Yesi).
--
-- Cruce hecho contra las 272 caballerizas de Dolores el 05/08:
--   9 de las 16 pedidas no existen ni con nombre parecido.
--   6 ya existen (ABUELO ELDO, CRAZY HORSE, EL DERBY, EL HINDU,
--     EL MANZANAR, LOS MONCHITOS) → no se tocan.
--   1 queda comentada (DON NITO) — ver bloque al final.
--
-- Convención copiada de caballerizas.html (alta por pantalla):
--   club_id = Dolores, hipodromo_patente = 'DOL' (el form lo pone por
--   default en un alta nueva), estado 'activo', activo true.
--   responsable / telefono / chaquetilla quedan NULL: los completa Yesi.
--
-- ⚠ caballerizas NO tiene unique en nombre (sólo PK en id). La
--   idempotencia la da el WHERE NOT EXISTS de cada INSERT, no la base.
-- ============================================================

BEGIN;

INSERT INTO caballerizas (club_id, nombre, hipodromo_patente, estado, activo)
SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid, v.nombre, 'DOL', 'activo', true
FROM (VALUES
  -- pendientes de la tanda 1 (7)
  ('SAICA'),
  ('NUEVO MUNDO'),
  ('SANTOS VEGA'),
  ('BETTY SANTI'),      -- existe LA BETTY (TDL), otra caballeriza (confirmado tanda 1)
  ('LOS MORENITOS'),    -- existe LOS MONCHITOS, otra caballeriza (confirmado tanda 1)
  ('LOS EDUCADITOS'),
  ('ESTAMPA DEL SUR'),
  -- nuevas de la tanda 2 (2)
  ('ABUELO FLORO'),     -- lo más parecido en base es FLOR Y AGUS: no es lo mismo
  ('EL CHINGA')         -- sin parecidos en base
) AS v(nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM caballerizas c
  WHERE upper(btrim(c.nombre)) = upper(btrim(v.nombre))
    AND c.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid
);

-- ------------------------------------------------------------
-- DON NITO — ✅ APLICADO el 06/08/2026 (bloque diferido, ver abajo)
-- ------------------------------------------------------------
-- Historia: quedó comentado el 05/08 porque en la base ya está DON NINO
-- (DOL) y la diferencia es una sola letra, fuera de la lista de typos que
-- Leo mandó normalizar. Si se insertaba y era typo, quedaban dos
-- caballerizas para el mismo dueño con los caballos repartidos.
--
-- Desbloqueo (Leo, 06/08): la duda era de UNIFICACIÓN, no de EXISTENCIA, y
-- son dos problemas distintos. La evidencia de existencia alcanza — la
-- planilla la usa, el Stud Book la tiene registrada como stud, y Yesi la
-- chequeó. La caballeriza tiene que existir hoy para que Yesi pueda
-- inscribir a TIENE RITMO en el cierre de mañana.
--
-- La unificación con DON NINO SIGUE ABIERTA: si Yesi alguna vez confirma
-- que son la misma, se mergea post-hito (mover los spcs/inscripciones de
-- una a la otra y desactivar la sobrante). No es un bloqueo del hito.
--
-- Aplicado por MCP apply_migration, migración `caballerizas_r8_tanda_2_don_nito`,
-- con exactamente este INSERT. Caballerizas de Dolores 281 -> 282 (286 total).
-- Resultado: DON NITO id 49ed956b-9678-480b-8421-d3326c077f40, DOL, activo,
-- responsable NULL. DON NINO intacto (b50cec95-…, responsable HOURCADE ABEL PEDRO).

INSERT INTO caballerizas (club_id, nombre, hipodromo_patente, estado, activo)
SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid, 'DON NITO', 'DOL', 'activo', true
WHERE NOT EXISTS (
  SELECT 1 FROM caballerizas c
  WHERE upper(btrim(c.nombre)) = 'DON NITO'
    AND c.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid
);

-- Verificación dentro de la misma transacción:
--   revisar ANTES de hacer COMMIT.
SELECT count(*) AS caballerizas_dolores
FROM caballerizas WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid;

SELECT nombre, hipodromo_patente, estado, activo
FROM caballerizas
WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid
  AND upper(nombre) IN ('SAICA','NUEVO MUNDO','SANTOS VEGA','BETTY SANTI',
                        'LOS MORENITOS','LOS EDUCADITOS','ESTAMPA DEL SUR',
                        'ABUELO FLORO','EL CHINGA','DON NITO')
ORDER BY nombre;

-- Ninguno de los nombres de esta tanda quedó duplicado (debe dar 0 filas).
-- Ojo: NO chequear duplicados sobre toda la tabla — la base ya trae
-- duplicados históricos por mayúsculas ('LA NARCISA' / 'La Narcisa',
-- 'EL LINYE Y RAMI' / 'El linye y Rami') que no son de esta tanda.
SELECT upper(btrim(nombre)) AS nom, count(*)
FROM caballerizas
WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid
  AND upper(btrim(nombre)) IN ('SAICA','NUEVO MUNDO','SANTOS VEGA','BETTY SANTI',
                               'LOS MORENITOS','LOS EDUCADITOS','ESTAMPA DEL SUR',
                               'ABUELO FLORO','EL CHINGA','DON NITO')
GROUP BY 1 HAVING count(*) > 1;

COMMIT;
