-- ROLLBACK del saneamiento de peso_balanza en R6 y R8 (2026-08-23).
--
-- Restaura los 104 valores que se pusieron en NULL. NO ejecutar salvo que se
-- quiera deshacer aquel cambio. Ojo: la constraint inscripciones_peso_balanza_rango
-- rechaza estos valores — para correr esto hay que dropearla primero:
--
--   ALTER TABLE inscripciones DROP CONSTRAINT inscripciones_peso_balanza_rango;
--
-- Contexto: los 104 valores eran el handicap del jockey cargado por error en la
-- columna del peso del caballo. 103 de 104 son copia exacta de peso_final; la
-- excepción es 73cd96b9 (balanza 55 vs peso_final 57).

UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '803a4268-69ef-4c71-a6c2-981abe494d39';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'e7d7e085-286a-4f7a-8623-2b5237b2be4f';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'fcdecfe7-9117-4b8e-9d8b-0833e4c37b14';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '66820fe1-3968-4939-a7dc-3bcd988ca7c3';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '34c977b7-c5ab-4737-a016-0d99a4018f2e';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '4d3db027-2f3b-403e-8b87-dacf7b35ff02';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '01a41f66-8932-4d43-8fac-92ced690a91f';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'bfabef7d-2fb2-4213-bc6b-07f807fc7452';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'bd87c196-2e9c-4809-b6b3-c3cb07c28ec6';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '316fb581-3e10-442b-ac85-2e47c8850a99';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '23ce0134-3db7-4549-a39f-a710e473acb4';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'addc3bd4-67c9-4935-8afe-f402bf1d4afd';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '785d802d-7e5c-4bd0-8bf6-455da36370b3';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '4f3cb8d5-cf3e-48f5-a8e3-5ac4795c8654';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'c91777f8-e2c4-4f46-b1b7-61fbcb419d04';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'b15c9cae-6d58-41a4-82f5-7642b95f9ffa';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'eccae519-b127-4270-8213-214f8b75057a';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '07d3830c-884d-4122-a246-2850cde12763';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '469aedca-7784-43e1-8dac-6540ae44088d';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'f12095ad-c52f-480c-8eaf-aedb3f30653b';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '0e147226-6f40-468b-ac02-508961681be4';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '6861c907-444b-4869-bb56-b8eb05de6d07';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '6d1b78bb-c549-4d10-b8b9-70f4edb5b71c';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '54ef92fd-4abc-4688-af97-5f5aa580efd7';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '766f1538-0ca2-4f64-8b68-8dfd77f04e7d';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'f325ae40-9fbf-4b53-802a-76b4b78227ed';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'a08dead5-2fd3-4ff1-9a08-d9fb2b346404';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'a370bfc3-329f-4c4d-b6af-bddb0760d881';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'ea96ff0f-3002-4540-9c9e-1f521a484214';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'ac5a8b2d-9de0-4076-bcbb-9b7287d09579';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'd21f589c-2ef1-45eb-b3b8-8b180680e861';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '9c618243-c86e-41ec-a849-6e6dd00e9a1f';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '1a12730c-ce33-465c-be73-3ba0f0976ce5';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'cda7b037-4721-4033-99f2-591e7e19669e';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'a3672b92-081a-4c7c-948b-9b1983204673';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'f82f4462-c9d3-4ee7-ab1b-6b8b6f059df1';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'e9b3e921-fea8-4347-a04f-a41d37d283e7';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'f8daf95e-487a-4b47-98a0-489b32d8beff';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'c253de99-fef7-413f-bfd1-7449e6b919cb';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'd7b909c5-2b92-4985-b3f3-1610a715223d';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '20b80f1f-2f28-4a9f-8ea2-a0a1850063d3';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '1cdac0b9-e71f-4f45-b4c9-81ae155bd3be';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '7fbbd8b1-24e8-4fe9-beee-09df6e51a4a5';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'cafc4989-c618-4fa9-bad2-d3343c75ce65';
UPDATE inscripciones SET peso_balanza = 59.00 WHERE id = '6cda9b4a-fb9a-4877-a222-834712cbeada';
UPDATE inscripciones SET peso_balanza = 59.00 WHERE id = '6632e8d1-20da-41a6-b745-7a6ee6066c93';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '3c91aad4-50a6-4b44-88d2-d96470b88330';
UPDATE inscripciones SET peso_balanza = 59.00 WHERE id = '24cae834-69c6-4b1d-9c6d-d1f5cad50af8';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'd7c88975-b03c-4b2b-bb62-eca77ccddd5a';
UPDATE inscripciones SET peso_balanza = 59.00 WHERE id = 'd4b7577d-e5c8-4fda-9cdb-fdd91ec3606e';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'dc3ba066-b75f-46c9-a050-c90b0499540f';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '9c4fa3c2-12d3-4131-aab8-4fac28f0f7cb';
UPDATE inscripciones SET peso_balanza = 58.00 WHERE id = '53cddf30-0123-457b-b698-387b646cfa4f';
UPDATE inscripciones SET peso_balanza = 56.00 WHERE id = 'dd0a126e-12d4-4d5c-988e-c1ac79b36d59';
UPDATE inscripciones SET peso_balanza = 56.00 WHERE id = 'b49c637e-d83d-49a1-b6d0-b67ce458365d';
UPDATE inscripciones SET peso_balanza = 58.00 WHERE id = '2360f43d-b2e8-4b72-8513-d05d7a713d0a';
UPDATE inscripciones SET peso_balanza = 56.00 WHERE id = '95949960-5b77-4168-b9ed-5e25ab8f7f01';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '6bee22d1-f56b-4157-854e-34dee2fe074a';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'd3ede44c-cad4-4c14-8350-20508dee9573';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '47bccbdf-02a0-4f28-bf3f-d197e3b33631';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '23b3bd4c-a43f-4e6e-a802-68f53f6e9e6d';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'ab2e6b01-5a1d-4fb2-a5a5-cc373cfc6f59';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '7895647b-915a-41e1-b002-a6327d73087a';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '73cd96b9-ae0c-4306-ac28-6689c881d6d8';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '7c5536e5-8dfd-44ea-a35f-af1c99553b6b';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'a49b9e9c-9a59-4a58-afed-23e6948803f2';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'bb6309ac-2277-4a54-b2a3-7572272dda02';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'b3ffb23b-df80-40c4-9da6-107fe808c600';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'f6ab7903-69cd-402a-bc4a-9817545df01e';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '1fd12d62-6d76-489b-9efa-e8d6c8842335';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'bb2b0c39-28b3-46b9-b3a8-7b8ad4d7f5bb';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '714d8716-3e05-4b4e-99c7-11bdb66d5aab';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '2f24cfdc-ee6b-4f24-b0be-fc2aa3c4c43e';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'b6ef2dbb-59aa-45c7-8385-386197acb0e8';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '4370d235-6dd9-479a-b7af-cd7c4d81c82f';
UPDATE inscripciones SET peso_balanza = 59.00 WHERE id = 'a6774bec-54d2-4e05-8d8d-c011bac9722a';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'a9f13d7a-70c2-447b-9324-34727561d8aa';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = 'db0c95a1-54c9-4162-894f-e56f14d112f3';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'b96dc7db-3863-4006-ab49-400c54c309a0';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '8236d271-dabb-47b8-8afb-1ee292b047c3';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '9a0507d8-567d-4b6b-9be6-bf0509d689a6';
UPDATE inscripciones SET peso_balanza = 59.00 WHERE id = '77a73523-e0f4-4cea-8799-1f8da0d54b52';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = 'e8f65349-051e-4514-9fb5-18978903663a';
UPDATE inscripciones SET peso_balanza = 59.00 WHERE id = 'bde2d35b-bf27-4a47-8bed-c2a606e3fd55';
UPDATE inscripciones SET peso_balanza = 59.00 WHERE id = '52a23e94-0ed6-4548-a28e-66c0f94019d0';
UPDATE inscripciones SET peso_balanza = 54.00 WHERE id = 'f946b09a-d053-4ac2-bc37-51062e8a91eb';
UPDATE inscripciones SET peso_balanza = 54.00 WHERE id = '3ca6f178-d9a1-415a-8a1e-91f81c883890';
UPDATE inscripciones SET peso_balanza = 58.00 WHERE id = 'acf40fde-e0d4-431a-81af-6b78f8b83cff';
UPDATE inscripciones SET peso_balanza = 64.00 WHERE id = '6f9cfdff-fb50-43a3-9d84-c9bc3d24e4c7';
UPDATE inscripciones SET peso_balanza = 60.00 WHERE id = 'dd61243b-f88d-4c61-8e09-f57722d17c02';
UPDATE inscripciones SET peso_balanza = 60.00 WHERE id = 'fe8a3a29-ef2a-472f-8708-2f2de495d4e7';
UPDATE inscripciones SET peso_balanza = 56.00 WHERE id = 'eab81296-7ece-4b54-b50e-8d725da3d873';
UPDATE inscripciones SET peso_balanza = 60.00 WHERE id = '9cc3be69-fb3a-4da9-9ac8-840ddfee0377';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '48700371-5561-4f23-bc33-6766dccdc33e';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '71926a67-0379-4a4d-b8c1-0b9e4165cf04';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '199f1edf-2b13-48be-80f1-de8f5a354215';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '5972c941-0e47-4f40-ab75-660dc765ea68';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '06bd452c-6605-4aa8-bd85-5b21880e8d37';
UPDATE inscripciones SET peso_balanza = 57.00 WHERE id = '8ffcc170-be94-417f-8d45-5f63af74c375';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '735850ad-63c1-4f22-8646-ab826d08dbf1';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '7ef76a33-aaee-42b6-8c2b-da4e84a4ed06';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '8ffff9c4-fd33-42d1-bca0-335189737a1f';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '05aa1b2d-c3c1-4d3f-abf1-cccd4d56f332';
UPDATE inscripciones SET peso_balanza = 55.00 WHERE id = '4af9e043-3b1b-4793-b37b-c8d52dbbf4ab';
