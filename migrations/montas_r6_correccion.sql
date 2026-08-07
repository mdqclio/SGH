-- ============================================================
-- montas_r6_correccion.sql — corrección de montas (jockey titular)
-- de R6 contra la planilla oficial de Yesi
-- ============================================================
-- Reunión 6 — 20/06/2026 — Hipódromo de Dolores
-- reunion_id = b02ca761-6f44-4720-86aa-a3c3099019ea
--
-- Motivo: los jockeys cambiados el día de la reunión nunca entraron al
-- sistema porque el alta de profesionales estaba rota (bug de club_id,
-- ISSUE-049). La planilla oficial de Yesi — la misma que les manda a
-- los jockeys por mail — es la fuente autoritativa de las montas.
--
-- ALCANCE: SOLO inscripciones.jockey_titular_id. Posiciones, tiempos y
-- dividendos están correctos según Yesi y NO se tocan. La regeneración
-- de liquidaciones queda para el lunes (ver nota al pie).
--
-- Mapeo turno -> carrera de programa (no es 1:1):
--   1ª=t1  2ª=t2  3ª=t3  4ª=t8  5ª=t11  6ª=t6  7ª=t9  8ª=t5
--   Turnos 4, 7 y 10 tienen numero_carrera_programa NULL (no corrieron)
--   y quedan fuera del alcance: no figuran en la planilla.
--
-- Cruce: 8 carreras, 81 ratificados. 38 ya coincidían, 11 son "XX" en
-- la planilla (sin jockey en el oficial) y ya tenían jockey_titular_id
-- NULL — no se tocan. 32 difieren y son las de abajo:
--   17 altas de monta (NULL -> jockey)
--   15 reasignaciones (jockey -> otro jockey)
--
-- DIESTRA PEDRO vs DIESTRA BAUTISTA son personas distintas. Tras esta
-- corrección PEDRO queda con 0 montas ratificadas en R6.
-- ⚠ CORRECCIÓN DE PREMISA (verificado en base el 07/08): BAUTISTA NO es
-- alta de la tanda 3. profesionales.created_at = 2026-06-15, el mismo
-- lote que PEDRO y 5 días ANTES de R6 (20/06). Además 3 inscripciones de
-- R6 ya tenían BAUTISTA desde antes de esta corrección (QUIET GAUCHO
-- desde el 20/06 mismo, ZETA FOOT y DESDEN desde el 22/07), y las 3
-- coinciden con el oficial. O sea: el cargador SÍ podía elegir BAUTISTA,
-- y el argumento "cayó todo en PEDRO por ser el único DIESTRA" no se
-- sostiene. Los 5 cambios PEDRO -> BAUTISTA se apoyan ÚNICAMENTE en la
-- planilla oficial de Yesi, que es fuente autoritativa y suficiente.
-- Queda anotado por si se quiere una confirmación extra con Yesi.
--
-- Sí tienen respaldo estructural (jockey inexistente al cargar R6) 7 de
-- las 32: DE MAIO FACUNDO (alta 07/08, 4 montas), GUZMAN CLAUDIO
-- (05/08, 1), MARCHANT JUAN (06/08, 1), GONZALEZ JOSE (07/08, 1).
-- Las otras 25 son puramente documentales.
--
-- Prerrequisito: migrations/personas_montas_r6.sql (alta de
-- DE MAIO FACUNDO y GONZALEZ JOSE). ✅ APLICADO 07/08/2026.
--
-- Auditoría de valores previos: data/montas_r6_previo.json (32 filas,
-- con jockey_titular_id y updated_at anteriores — sirve de rollback).
--
-- Cada UPDATE lleva guard por valor previo (IS NOT DISTINCT FROM):
-- la sentencia es idempotente y no pisa un valor que haya cambiado
-- entre la captura del snapshot y la aplicación.
-- ============================================================

BEGIN;

-- ==== 1ª carrera (turno 1) — 5 correcciones ====
-- MONADESEDA | ZAPICO DIEGO -> DE MAIO FACUNDO
UPDATE inscripciones SET jockey_titular_id = 'cef0b9b0-8456-4bed-9751-db0457483d27'
  WHERE id = '35aaf81f-ce6e-4a84-b371-cf2e1502cc76'
    AND jockey_titular_id IS NOT DISTINCT FROM '8abe11d7-12df-4b2a-b12d-3db255e939f2'::uuid;
-- GREAT ORPEN | DIESTRA PEDRO -> DIESTRA BAUTISTA
UPDATE inscripciones SET jockey_titular_id = '70907ee8-7c1b-45d6-9821-d55f344c05a6'
  WHERE id = 'e7d7e085-286a-4f7a-8623-2b5237b2be4f'
    AND jockey_titular_id IS NOT DISTINCT FROM '654dc3ea-5c90-46cd-a579-eb0efa3bd1c0'::uuid;
-- DOCTORA APASIONADA | DIESTRA PEDRO -> IBARRA FERNANDO
UPDATE inscripciones SET jockey_titular_id = '8f24be30-e951-4287-82bd-2db54d0e32dc'
  WHERE id = '01a41f66-8932-4d43-8fac-92ced690a91f'
    AND jockey_titular_id IS NOT DISTINCT FROM '654dc3ea-5c90-46cd-a579-eb0efa3bd1c0'::uuid;
-- MOSQUITA GARDEN | (vacío) -> GUZMAN CLAUDIO
UPDATE inscripciones SET jockey_titular_id = '9a7c0668-bb85-4a04-b3ad-dfa15c299fe0'
  WHERE id = '34c977b7-c5ab-4737-a016-0d99a4018f2e'
    AND jockey_titular_id IS NULL;
-- ARMOÑOZO | (vacío) -> YALET IRINEO
UPDATE inscripciones SET jockey_titular_id = 'b3072f82-9d29-4d61-8e0b-98a606cf2f02'
  WHERE id = '66820fe1-3968-4939-a7dc-3bcd988ca7c3'
    AND jockey_titular_id IS NULL;

-- ==== 2ª carrera (turno 2) — 4 correcciones ====
-- CALAVERIANDO | DIESTRA PEDRO -> DIESTRA BAUTISTA
UPDATE inscripciones SET jockey_titular_id = '70907ee8-7c1b-45d6-9821-d55f344c05a6'
  WHERE id = 'addc3bd4-67c9-4935-8afe-f402bf1d4afd'
    AND jockey_titular_id IS NOT DISTINCT FROM '654dc3ea-5c90-46cd-a579-eb0efa3bd1c0'::uuid;
-- BAM BAM HITS | (vacío) -> ZAPICO DIEGO
UPDATE inscripciones SET jockey_titular_id = '8abe11d7-12df-4b2a-b12d-3db255e939f2'
  WHERE id = 'bfabef7d-2fb2-4213-bc6b-07f807fc7452'
    AND jockey_titular_id IS NULL;
-- EL MEJOR DUQUE | (vacío) -> YALET IRINEO
UPDATE inscripciones SET jockey_titular_id = 'b3072f82-9d29-4d61-8e0b-98a606cf2f02'
  WHERE id = '785d802d-7e5c-4bd0-8bf6-455da36370b3'
    AND jockey_titular_id IS NULL;
-- ASTUTO NOTES | (vacío) -> CONTRERAS JUAN CRUZ
UPDATE inscripciones SET jockey_titular_id = '9ba2e954-fb72-41ac-bc28-b26e5348f28f'
  WHERE id = '23ce0134-3db7-4549-a39f-a710e473acb4'
    AND jockey_titular_id IS NULL;

-- ==== 3ª carrera (turno 3) — 3 correcciones ====
-- SIEMPREHAYESPERANZA | DIESTRA PEDRO -> DIESTRA BAUTISTA
UPDATE inscripciones SET jockey_titular_id = '70907ee8-7c1b-45d6-9821-d55f344c05a6'
  WHERE id = 'f12095ad-c52f-480c-8eaf-aedb3f30653b'
    AND jockey_titular_id IS NOT DISTINCT FROM '654dc3ea-5c90-46cd-a579-eb0efa3bd1c0'::uuid;
-- SANTA LISA | (vacío) -> GIL SANTINO
UPDATE inscripciones SET jockey_titular_id = '01b92e06-41df-4d25-9aa6-268b4fdffdbc'
  WHERE id = 'b15c9cae-6d58-41a4-82f5-7642b95f9ffa'
    AND jockey_titular_id IS NULL;
-- LOCA DUBAI | DA SILVA RUBEN -> MARCHANT JUAN
UPDATE inscripciones SET jockey_titular_id = '7d069965-d8a5-4ef4-885e-8eda3c6bacbe'
  WHERE id = 'eccae519-b127-4270-8213-214f8b75057a'
    AND jockey_titular_id IS NOT DISTINCT FROM 'c8894b64-5521-460a-a50b-a7c57ec3f59a'::uuid;

-- ==== 4ª carrera (turno 8) — 4 correcciones ====
-- LOCO FUN | CANTO TOBIAS -> DE MAIO FACUNDO
UPDATE inscripciones SET jockey_titular_id = 'cef0b9b0-8456-4bed-9751-db0457483d27'
  WHERE id = 'd7b909c5-2b92-4985-b3f3-1610a715223d'
    AND jockey_titular_id IS NOT DISTINCT FROM '005caa02-fc91-45b3-9ae6-6f55d989fa2e'::uuid;
-- FLORENTINA IN YOU | OSUNA JOSE -> ZAPICO DIEGO
UPDATE inscripciones SET jockey_titular_id = '8abe11d7-12df-4b2a-b12d-3db255e939f2'
  WHERE id = '1cdac0b9-e71f-4f45-b4c9-81ae155bd3be'
    AND jockey_titular_id IS NOT DISTINCT FROM '4bebf74b-b607-430f-92dc-342cec22d0e7'::uuid;
-- CRAZY RABID | (vacío) -> GATICA DARIO
UPDATE inscripciones SET jockey_titular_id = '7381c730-f95c-459f-8b24-41637300f117'
  WHERE id = 'c253de99-fef7-413f-bfd1-7449e6b919cb'
    AND jockey_titular_id IS NULL;
-- MI ILUSION | (vacío) -> GONZALEZ JOSE
UPDATE inscripciones SET jockey_titular_id = '3fc8f1fd-44be-417b-83ed-578d4f32be6a'
  WHERE id = 'cafc4989-c618-4fa9-bad2-d3343c75ce65'
    AND jockey_titular_id IS NULL;

-- ==== 5ª carrera (turno 11) — 3 correcciones ====
-- CHINITA SALTEÑA | (vacío) -> IBARRA FERNANDO
UPDATE inscripciones SET jockey_titular_id = '8f24be30-e951-4287-82bd-2db54d0e32dc'
  WHERE id = '53cddf30-0123-457b-b698-387b646cfa4f'
    AND jockey_titular_id IS NULL;
-- YUKINA | (vacío) -> CAÑETE FACUNDO
UPDATE inscripciones SET jockey_titular_id = '2a4a0c3f-abfe-47b4-93ff-2fa6a678632b'
  WHERE id = '95949960-5b77-4168-b9ed-5e25ab8f7f01'
    AND jockey_titular_id IS NULL;
-- SIGO VIAJE | (vacío) -> GATICA DARIO
UPDATE inscripciones SET jockey_titular_id = '7381c730-f95c-459f-8b24-41637300f117'
  WHERE id = 'dd0a126e-12d4-4d5c-988e-c1ac79b36d59'
    AND jockey_titular_id IS NULL;

-- ==== 6ª carrera (turno 6) — 6 correcciones ====
-- KUCCINI | (vacío) -> GIL SANTINO
UPDATE inscripciones SET jockey_titular_id = '01b92e06-41df-4d25-9aa6-268b4fdffdbc'
  WHERE id = 'a370bfc3-329f-4c4d-b6af-bddb0760d881'
    AND jockey_titular_id IS NULL;
-- PORTEÑO Y BAILARIN | DIESTRA PEDRO -> DIESTRA BAUTISTA
UPDATE inscripciones SET jockey_titular_id = '70907ee8-7c1b-45d6-9821-d55f344c05a6'
  WHERE id = 'd21f589c-2ef1-45eb-b3b8-8b180680e861'
    AND jockey_titular_id IS NOT DISTINCT FROM '654dc3ea-5c90-46cd-a579-eb0efa3bd1c0'::uuid;
-- LUMIN | ROMAY ABEL I -> CAÑETE FACUNDO
UPDATE inscripciones SET jockey_titular_id = '2a4a0c3f-abfe-47b4-93ff-2fa6a678632b'
  WHERE id = 'ea96ff0f-3002-4540-9c9e-1f521a484214'
    AND jockey_titular_id IS NOT DISTINCT FROM '484361c0-abb5-41af-b20e-3090535cb075'::uuid;
-- TATA FOOT | AVENDAÑO MIGUEL A -> YALET JORGE
UPDATE inscripciones SET jockey_titular_id = 'ebc7829a-9a9d-4aa5-b159-4fce010ccbc1'
  WHERE id = '9c618243-c86e-41ec-a849-6e6dd00e9a1f'
    AND jockey_titular_id IS NOT DISTINCT FROM 'a249ea0d-0b5c-4fbb-ad14-f4e9e1f6bb01'::uuid;
-- TIMBERA IN YOU | OSUNA JOSE -> ZAPICO DIEGO
UPDATE inscripciones SET jockey_titular_id = '8abe11d7-12df-4b2a-b12d-3db255e939f2'
  WHERE id = 'cda7b037-4721-4033-99f2-591e7e19669e'
    AND jockey_titular_id IS NOT DISTINCT FROM '4bebf74b-b607-430f-92dc-342cec22d0e7'::uuid;
-- CLAIRE CHUCK | (vacío) -> DE MAIO FACUNDO
UPDATE inscripciones SET jockey_titular_id = 'cef0b9b0-8456-4bed-9751-db0457483d27'
  WHERE id = 'a08dead5-2fd3-4ff1-9a08-d9fb2b346404'
    AND jockey_titular_id IS NULL;

-- ==== 7ª carrera (turno 9) — 5 correcciones ====
-- AFRICUM | DIESTRA PEDRO -> DE MAIO FACUNDO
UPDATE inscripciones SET jockey_titular_id = 'cef0b9b0-8456-4bed-9751-db0457483d27'
  WHERE id = '6632e8d1-20da-41a6-b745-7a6ee6066c93'
    AND jockey_titular_id IS NOT DISTINCT FROM '654dc3ea-5c90-46cd-a579-eb0efa3bd1c0'::uuid;
-- FURIA ENCANTADA | (vacío) -> GIL SANTINO
UPDATE inscripciones SET jockey_titular_id = '01b92e06-41df-4d25-9aa6-268b4fdffdbc'
  WHERE id = '3c91aad4-50a6-4b44-88d2-d96470b88330'
    AND jockey_titular_id IS NULL;
-- SEMBRADOR CHUCK | ZUBIRIA SANTIAGO -> IBARRA FERNANDO
UPDATE inscripciones SET jockey_titular_id = '8f24be30-e951-4287-82bd-2db54d0e32dc'
  WHERE id = '24cae834-69c6-4b1d-9c6d-d1f5cad50af8'
    AND jockey_titular_id IS NOT DISTINCT FROM '674157cf-9393-419e-bf50-0881802b785e'::uuid;
-- SEÑOR MONCHI | ARREGUY FRANCISCO -> YALET IRINEO
UPDATE inscripciones SET jockey_titular_id = 'b3072f82-9d29-4d61-8e0b-98a606cf2f02'
  WHERE id = '9c4fa3c2-12d3-4131-aab8-4fac28f0f7cb'
    AND jockey_titular_id IS NOT DISTINCT FROM '7dcddbdb-52dc-4f56-8010-0fc8a5de9dcb'::uuid;
-- BUEN DURAZNO | (vacío) -> GATICA DARIO
UPDATE inscripciones SET jockey_titular_id = '7381c730-f95c-459f-8b24-41637300f117'
  WHERE id = '6cda9b4a-fb9a-4877-a222-834712cbeada'
    AND jockey_titular_id IS NULL;

-- ==== 8ª carrera (turno 5) — 2 correcciones ====
-- HEART OF GOLD | (vacío) -> CANTO TOBIAS
UPDATE inscripciones SET jockey_titular_id = '005caa02-fc91-45b3-9ae6-6f55d989fa2e'
  WHERE id = '766f1538-0ca2-4f64-8b68-8dfd77f04e7d'
    AND jockey_titular_id IS NULL;
-- MAESTRO DE ARMAS | (vacío) -> DELLI QUADRI IGNACIO
UPDATE inscripciones SET jockey_titular_id = '0bbe6666-bdf5-446b-8ee2-5279eafdc844'
  WHERE id = '6d1b78bb-c549-4d10-b8b9-70f4edb5b71c'
    AND jockey_titular_id IS NULL;

COMMIT;

-- ============================================================
-- ⚠ LIQUIDACIONES DE R6 DESACTUALIZADAS
-- Esta migración cambia 32 montas pero NO regenera liquidaciones.
-- Los incentivos por monta (jockey 50k/reunión, entrenador 10k/caballo)
-- y todo premio derivado del jockey quedan calculados sobre las montas
-- viejas hasta la regeneración prevista para el lunes 10/08/2026.
-- NO EMITIR RECIBOS DE R6 EN EL MEDIO.
-- ============================================================
