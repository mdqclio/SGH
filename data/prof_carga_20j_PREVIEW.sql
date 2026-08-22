-- PREVIEW — NO EJECUTADO. Pendiente de OK de Yesica/Fede.
-- Reunión 6 (2026-06-20), club Dolores 0649e9c5. 64 altas (26 jockey + 38 entrenador) + 1 fix de data.
-- Dedup case-insensitive vs existentes: 0 colisiones. UUIDs client-gen (rollback al pie).

-- Carga 64 profesionales faltantes reunión 6 (2026-06-20) — club Dolores
-- UUIDs client-gen (rollback abajo). NO incluye DNI/PII.
BEGIN;
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('f67ec948-8793-444d-8951-8ea821e30dda', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'LUIS', 'ACUÑA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('0b2c6b27-3343-4e7f-b4f7-c0674e225466', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'MATIAS', 'ACUÑA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('a66df20c-cd72-4125-a1d7-b32e48fcf037', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'HUGO', 'AGUIRRE', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('7dcddbdb-52dc-4f56-8010-0fc8a5de9dcb', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'FRANCISCO', 'ARREGUY', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('a249ea0d-0b5c-4fbb-ad14-f4e9e1f6bb01', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'MIGUEL A', 'AVENDAÑO', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('005caa02-fc91-45b3-9ae6-6f55d989fa2e', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'TOBIAS', 'CANTO', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('c8894b64-5521-460a-a50b-a7c57ec3f59a', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'RUBEN', 'DA SILVA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('0bbe6666-bdf5-446b-8ee2-5279eafdc844', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'IGNACIO', 'DELLI QUADRI', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('70907ee8-7c1b-45d6-9821-d55f344c05a6', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'BAUTISTA', 'DIESTRA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('654dc3ea-5c90-46cd-a579-eb0efa3bd1c0', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'PEDRO', 'DIESTRA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('b4727bd1-9808-40cf-8467-772c4a8b8539', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'THIAGO', 'D''ELIA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('01b92e06-41df-4d25-9aa6-268b4fdffdbc', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'SANTINO', 'GIL', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('9c03f925-0272-4ba6-95c7-e71fad20f63d', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'KEVIN', 'MENDEZ', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('4bebf74b-b607-430f-92dc-342cec22d0e7', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'JOSE', 'OSUNA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('30ee4249-d70b-44df-ab3d-cb6e1e42b182', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'JAVIER', 'PAIZ', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('2e3428cb-be99-4c91-9b99-13c3b499e147', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'HERNAN', 'ROJAS', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('484361c0-abb5-41af-b20e-3090535cb075', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'ABEL I', 'ROMAY', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('6d3129b7-42ef-40e3-976e-325b5d7a8c28', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'DIEGO', 'SALDIAS', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('9a8af6b4-afeb-4dbb-b7a4-5399e0cd9de9', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'ANIBAL', 'TORRES', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('b3072f82-9d29-4d61-8e0b-98a606cf2f02', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'IRINEO', 'YALET', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('ebc7829a-9a9d-4aa5-b159-4fce010ccbc1', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'JORGE', 'YALET', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('8abe11d7-12df-4b2a-b12d-3db255e939f2', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'DIEGO', 'ZAPICO', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('674157cf-9393-419e-bf50-0881802b785e', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'SANTIAGO', 'ZUBIRIA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('78cb7c87-0fef-4454-aa16-d81651a469cd', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'AGUSTIN', 'MARTINEZ', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('8c358b73-8d01-4293-9ac8-0f4d44f535f6', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'DANIEL', 'PRESA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('5c1d5e54-7f0b-4730-9d77-def5724c3c60', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'jockey', 'BRUNO', 'GIULIANO', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('77c12f49-2986-47e1-991c-bc945659a2ac', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'OSVALDO', 'ALBERDI', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('b75cbb70-4f43-41f7-961e-d66a6ccb5eb3', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'MAXIMILIANO', 'ALZA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('fcb5ab70-db5b-486e-9b6d-33bff5f7092c', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'LUIS ALEJANDRO', 'AMADEO', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('f9d75926-c185-46e7-88c7-075433ab4972', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'MARIA LAURA', 'BARRERA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('81973a09-9d84-4946-bc5c-b6dae0870841', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'OSCAR ABEL', 'BARRIONUEVO', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('3c973f57-4163-4e78-b7e1-cca4885d787f', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'MARCELO', 'BLANCO', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('87bc872c-a460-494c-8bb1-3e1064c2afb1', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'ROBERTO', 'BOLONTI', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('a8d0e58a-1024-4555-834e-3b931ce577b3', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'HORACIO', 'CANTO', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('67cfb6f0-3a53-45d3-aba8-76594750bfb7', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'TOMAS', 'CANTO', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('a88d874a-a5a7-4037-8573-050fb9470f35', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'ROBERTO E', 'CASTELLANO', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('2fd211ae-c5f6-4b52-bb43-ba98f4f59b8d', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'ALEXIS', 'CONSTANCIO', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('e23c1260-8761-4f50-a878-f905a8f34a2b', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'GABRIEL', 'DE LA TORRE', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('fc3388a1-f62a-4203-aee5-5daa883608f4', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'GUSTAVO', 'DI FRANCO', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('2471b028-3498-4245-9b34-6ed4bcbbed0c', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'CLAUDIO MAXIMILIANO', 'DIESTRA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('93c8d7d6-5977-4bef-88fc-939d3668d94b', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'FLORENCIA', 'DIESTRA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('7e2d0cf0-d94d-47a8-ad1b-0e88f15bd005', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'JUAN DOMINGO', 'DIESTRA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('4740724a-42d9-4fb5-a6de-afa9473bc8da', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'ATILIO', 'ECHENIQUE', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('5e625dc3-8336-4fbe-9669-c6dd00f91dbc', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'LEONARDO', 'FLEKSTEIN', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('8c041b7b-022f-44d4-a1a2-057a139af46c', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'RAMIRO', 'GAITAN PICART', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('7b68e043-6832-4ee3-89f1-8d71dbb16785', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'JULIO', 'GOMEZ', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('9bbc8647-7737-4bf5-b027-c105de8ea690', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'RICARDO', 'IPARAGUIRRE', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('85a69b69-603f-4028-8f95-f2dbe2dd70e1', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'LUIS', 'MAITIA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('de1252b1-a852-4993-9a2f-c13347459c7a', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'MIGUEL A', 'MAITIA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('18c48e90-4496-4381-9f73-b4d474b6c229', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'HECTOR ROBERTO', 'MORAN', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('ea01ca82-aa48-4895-bc8f-9701ca24b120', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'GONZALO', 'NOTARIO', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('d5cbf776-34d1-47d8-809a-16ae181968d1', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'MARIO RAUL', 'OLIVERA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('2ca89d1c-2bb5-49a7-98ac-13a25594b13c', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'WALTER', 'PADRON', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('8528087d-ff46-45ac-9226-9e043cab39fb', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'JOSE', 'PREBE', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('6b159718-dd90-4512-bd06-72de2c20ab33', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'RICARDO H', 'TAVAGNUTTI', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('78267be2-396a-470f-936f-a9e4238b9eb1', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'ALEJANDRO', 'TEDESCHI', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('ffca6c03-4259-4d92-8479-66c7c6aa8eca', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'OSCAR', 'TEVEZ', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('18226f63-ff38-4d50-be4e-b8d0a5889f8e', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'RAUL OMAR', 'THEILLER', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('f98b78be-13b3-40e0-b1d4-b0c9dfb221c2', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'MARIA ELENA', 'TOLEDO', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('405ba68e-78e0-40ca-bc3c-a06c60f11659', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'ROBERTO', 'TRUPPA', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('f195e041-d239-43f1-af58-af1dc5128c2d', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'EDUARDO EMILIO', 'VILLARUEL', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('1f46b478-5edf-4cb5-be36-957d7fec99d3', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'SANTIAGO', 'ZUBIARRAIN', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('65cd87b3-9945-432d-9e90-a87737237bfc', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'SERGIO ESTEBAN', 'ALDAY', true, 'activo');
INSERT INTO profesionales (id, club_id, tipo, nombre, apellido, activo, estado) VALUES ('05d9fbb6-33d0-4d68-8d03-2d34376cb6b5', '0649e9c5-9e87-4aad-842f-101458e6b33c', 'entrenador', 'FEDERICO', 'CARLI', true, 'activo');

-- FIX DATA: BAM BAM HITS (Turno 2, machos 3 años) entrenador_id NULL -> DIESTRA JUAN DOMINGO
UPDATE inscripciones SET entrenador_id = '7e2d0cf0-d94d-47a8-ad1b-0e88f15bd005' WHERE id = 'bfabef7d-2fb2-4213-bc6b-07f807fc7452' AND entrenador_id IS NULL;
COMMIT;

-- ROLLBACK (revierte todo):
-- UPDATE inscripciones SET entrenador_id = NULL WHERE id = 'bfabef7d-2fb2-4213-bc6b-07f807fc7452';
-- DELETE FROM profesionales WHERE id IN (
--   'f67ec948-8793-444d-8951-8ea821e30dda',
--   '0b2c6b27-3343-4e7f-b4f7-c0674e225466',
--   'a66df20c-cd72-4125-a1d7-b32e48fcf037',
--   '7dcddbdb-52dc-4f56-8010-0fc8a5de9dcb',
--   'a249ea0d-0b5c-4fbb-ad14-f4e9e1f6bb01',
--   '005caa02-fc91-45b3-9ae6-6f55d989fa2e',
--   'c8894b64-5521-460a-a50b-a7c57ec3f59a',
--   '0bbe6666-bdf5-446b-8ee2-5279eafdc844',
--   '70907ee8-7c1b-45d6-9821-d55f344c05a6',
--   '654dc3ea-5c90-46cd-a579-eb0efa3bd1c0',
--   'b4727bd1-9808-40cf-8467-772c4a8b8539',
--   '01b92e06-41df-4d25-9aa6-268b4fdffdbc',
--   '9c03f925-0272-4ba6-95c7-e71fad20f63d',
--   '4bebf74b-b607-430f-92dc-342cec22d0e7',
--   '30ee4249-d70b-44df-ab3d-cb6e1e42b182',
--   '2e3428cb-be99-4c91-9b99-13c3b499e147',
--   '484361c0-abb5-41af-b20e-3090535cb075',
--   '6d3129b7-42ef-40e3-976e-325b5d7a8c28',
--   '9a8af6b4-afeb-4dbb-b7a4-5399e0cd9de9',
--   'b3072f82-9d29-4d61-8e0b-98a606cf2f02',
--   'ebc7829a-9a9d-4aa5-b159-4fce010ccbc1',
--   '8abe11d7-12df-4b2a-b12d-3db255e939f2',
--   '674157cf-9393-419e-bf50-0881802b785e',
--   '78cb7c87-0fef-4454-aa16-d81651a469cd',
--   '8c358b73-8d01-4293-9ac8-0f4d44f535f6',
--   '5c1d5e54-7f0b-4730-9d77-def5724c3c60',
--   '77c12f49-2986-47e1-991c-bc945659a2ac',
--   'b75cbb70-4f43-41f7-961e-d66a6ccb5eb3',
--   'fcb5ab70-db5b-486e-9b6d-33bff5f7092c',
--   'f9d75926-c185-46e7-88c7-075433ab4972',
--   '81973a09-9d84-4946-bc5c-b6dae0870841',
--   '3c973f57-4163-4e78-b7e1-cca4885d787f',
--   '87bc872c-a460-494c-8bb1-3e1064c2afb1',
--   'a8d0e58a-1024-4555-834e-3b931ce577b3',
--   '67cfb6f0-3a53-45d3-aba8-76594750bfb7',
--   'a88d874a-a5a7-4037-8573-050fb9470f35',
--   '2fd211ae-c5f6-4b52-bb43-ba98f4f59b8d',
--   'e23c1260-8761-4f50-a878-f905a8f34a2b',
--   'fc3388a1-f62a-4203-aee5-5daa883608f4',
--   '2471b028-3498-4245-9b34-6ed4bcbbed0c',
--   '93c8d7d6-5977-4bef-88fc-939d3668d94b',
--   '7e2d0cf0-d94d-47a8-ad1b-0e88f15bd005',
--   '4740724a-42d9-4fb5-a6de-afa9473bc8da',
--   '5e625dc3-8336-4fbe-9669-c6dd00f91dbc',
--   '8c041b7b-022f-44d4-a1a2-057a139af46c',
--   '7b68e043-6832-4ee3-89f1-8d71dbb16785',
--   '9bbc8647-7737-4bf5-b027-c105de8ea690',
--   '85a69b69-603f-4028-8f95-f2dbe2dd70e1',
--   'de1252b1-a852-4993-9a2f-c13347459c7a',
--   '18c48e90-4496-4381-9f73-b4d474b6c229',
--   'ea01ca82-aa48-4895-bc8f-9701ca24b120',
--   'd5cbf776-34d1-47d8-809a-16ae181968d1',
--   '2ca89d1c-2bb5-49a7-98ac-13a25594b13c',
--   '8528087d-ff46-45ac-9226-9e043cab39fb',
--   '6b159718-dd90-4512-bd06-72de2c20ab33',
--   '78267be2-396a-470f-936f-a9e4238b9eb1',
--   'ffca6c03-4259-4d92-8479-66c7c6aa8eca',
--   '18226f63-ff38-4d50-be4e-b8d0a5889f8e',
--   'f98b78be-13b3-40e0-b1d4-b0c9dfb221c2',
--   '405ba68e-78e0-40ca-bc3c-a06c60f11659',
--   'f195e041-d239-43f1-af58-af1dc5128c2d',
--   '1f46b478-5edf-4cb5-be36-957d7fec99d3',
--   '65cd87b3-9945-432d-9e90-a87737237bfc',
--   '05d9fbb6-33d0-4d68-8d03-2d34376cb6b5'
-- );