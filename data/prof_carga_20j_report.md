# Reporte de carga de profesionales — Reunión 6 (2026-06-20, Dolores)

Alta de los 64 profesionales faltantes del borrador + 1 fix de data.
**Estado: EJECUTADO** contra producción (club Dolores `0649e9c5`).

> Solo apellido + nombre. Sin DNI/CUIT, teléfono ni datos personales (repo público).

## Conteo de profesionales (club Dolores)

| | jockey | entrenador | total |
|---|---|---|---|
| ANTES | 10 | 82 | **92** |
| DESPUÉS | 36 | 120 | **156** |
| Alta | +26 | +38 | **+64** |

Dedup case-insensitive (tildes/ñ) contra existentes: **0 colisiones, 0 skips**.
No se tocaron los 5 `PRUEBA 9999 — BORRAR` (se eliminan con el teardown).

## Altas (64)

### Jockeys (26)
ACUÑA LUIS · ACUÑA MATIAS · AGUIRRE HUGO · ARREGUY FRANCISCO · AVENDAÑO MIGUEL A ·
CANTO TOBIAS · DA SILVA RUBEN · DELLI QUADRI IGNACIO · DIESTRA BAUTISTA ·
DIESTRA PEDRO · D'ELIA THIAGO · GIL SANTINO · MENDEZ KEVIN · OSUNA JOSE ·
PAIZ JAVIER · ROJAS HERNAN · ROMAY ABEL I · SALDIAS DIEGO · TORRES ANIBAL ·
YALET IRINEO · YALET JORGE · ZAPICO DIEGO · ZUBIRIA SANTIAGO ·
MARTINEZ AGUSTIN · PRESA DANIEL · GIULIANO BRUNO

### Entrenadores / cuidadores (38)
ALBERDI OSVALDO · ALZA MAXIMILIANO · AMADEO LUIS ALEJANDRO · BARRERA MARIA LAURA ·
BARRIONUEVO OSCAR ABEL · BLANCO MARCELO · BOLONTI ROBERTO · CANTO HORACIO ·
CANTO TOMAS · CASTELLANO ROBERTO E · CONSTANCIO ALEXIS · DE LA TORRE GABRIEL ·
DI FRANCO GUSTAVO · DIESTRA CLAUDIO MAXIMILIANO · DIESTRA FLORENCIA ·
DIESTRA JUAN DOMINGO · ECHENIQUE ATILIO · FLEKSTEIN LEONARDO · GAITAN PICART RAMIRO ·
GOMEZ JULIO · IPARAGUIRRE RICARDO · MAITIA LUIS · MAITIA MIGUEL A · MORAN HECTOR ROBERTO ·
NOTARIO GONZALO · OLIVERA MARIO RAUL · PADRON WALTER · PREBE JOSE · TAVAGNUTTI RICARDO H ·
TEDESCHI ALEJANDRO · TEVEZ OSCAR · THEILLER RAUL OMAR · TOLEDO MARIA ELENA · TRUPPA ROBERTO ·
VILLARUEL EDUARDO EMILIO · ZUBIARRAIN SANTIAGO · ALDAY SERGIO ESTEBAN · CARLI FEDERICO

Dudosos resueltos por Yesica (creados como personas distintas):
ZUBIRIA SANTIAGO (jockey) ≠ ZUBIARRAIN SANTIAGO (entrenador); BARRERA MARIA LAURA ≠ BRIGANTI Maria Laura;
MARTINEZ AGUSTIN, PRESA DANIEL, GIULIANO BRUNO, ALDAY SERGIO ESTEBAN, CARLI FEDERICO.
"DIESTRA MAXIMILIANO" NO se creó: es la misma persona que DIESTRA CLAUDIO MAXIMILIANO.

## Fix de data

**BAM BAM HITS** (inscripción `bfabef7d-2fb2-4213-bc6b-07f807fc7452`, Turno 2 — machos 3 años).
`entrenador_id`: `NULL` → `7e2d0cf0-d94d-47a8-ad1b-0e88f15bd005` (DIESTRA JUAN DOMINGO).
UPDATE sin guard (WHERE por id único, pisa el valor previo).

## ROLLBACK

```sql
BEGIN;
-- revertir fix de data
UPDATE inscripciones SET entrenador_id = NULL
  WHERE id = 'bfabef7d-2fb2-4213-bc6b-07f807fc7452';
-- borrar los 64 profesionales creados
DELETE FROM profesionales WHERE id IN (
  'f67ec948-8793-444d-8951-8ea821e30dda','0b2c6b27-3343-4e7f-b4f7-c0674e225466',
  'a66df20c-cd72-4125-a1d7-b32e48fcf037','7dcddbdb-52dc-4f56-8010-0fc8a5de9dcb',
  'a249ea0d-0b5c-4fbb-ad14-f4e9e1f6bb01','005caa02-fc91-45b3-9ae6-6f55d989fa2e',
  'c8894b64-5521-460a-a50b-a7c57ec3f59a','0bbe6666-bdf5-446b-8ee2-5279eafdc844',
  '70907ee8-7c1b-45d6-9821-d55f344c05a6','654dc3ea-5c90-46cd-a579-eb0efa3bd1c0',
  'b4727bd1-9808-40cf-8467-772c4a8b8539','01b92e06-41df-4d25-9aa6-268b4fdffdbc',
  '9c03f925-0272-4ba6-95c7-e71fad20f63d','4bebf74b-b607-430f-92dc-342cec22d0e7',
  '30ee4249-d70b-44df-ab3d-cb6e1e42b182','2e3428cb-be99-4c91-9b99-13c3b499e147',
  '484361c0-abb5-41af-b20e-3090535cb075','6d3129b7-42ef-40e3-976e-325b5d7a8c28',
  '9a8af6b4-afeb-4dbb-b7a4-5399e0cd9de9','b3072f82-9d29-4d61-8e0b-98a606cf2f02',
  'ebc7829a-9a9d-4aa5-b159-4fce010ccbc1','8abe11d7-12df-4b2a-b12d-3db255e939f2',
  '674157cf-9393-419e-bf50-0881802b785e','78cb7c87-0fef-4454-aa16-d81651a469cd',
  '8c358b73-8d01-4293-9ac8-0f4d44f535f6','5c1d5e54-7f0b-4730-9d77-def5724c3c60',
  '77c12f49-2986-47e1-991c-bc945659a2ac','b75cbb70-4f43-41f7-961e-d66a6ccb5eb3',
  'fcb5ab70-db5b-486e-9b6d-33bff5f7092c','f9d75926-c185-46e7-88c7-075433ab4972',
  '81973a09-9d84-4946-bc5c-b6dae0870841','3c973f57-4163-4e78-b7e1-cca4885d787f',
  '87bc872c-a460-494c-8bb1-3e1064c2afb1','a8d0e58a-1024-4555-834e-3b931ce577b3',
  '67cfb6f0-3a53-45d3-aba8-76594750bfb7','a88d874a-a5a7-4037-8573-050fb9470f35',
  '2fd211ae-c5f6-4b52-bb43-ba98f4f59b8d','e23c1260-8761-4f50-a878-f905a8f34a2b',
  'fc3388a1-f62a-4203-aee5-5daa883608f4','2471b028-3498-4245-9b34-6ed4bcbbed0c',
  '93c8d7d6-5977-4bef-88fc-939d3668d94b','7e2d0cf0-d94d-47a8-ad1b-0e88f15bd005',
  '4740724a-42d9-4fb5-a6de-afa9473bc8da','5e625dc3-8336-4fbe-9669-c6dd00f91dbc',
  '8c041b7b-022f-44d4-a1a2-057a139af46c','7b68e043-6832-4ee3-89f1-8d71dbb16785',
  '9bbc8647-7737-4bf5-b027-c105de8ea690','85a69b69-603f-4028-8f95-f2dbe2dd70e1',
  'de1252b1-a852-4993-9a2f-c13347459c7a','18c48e90-4496-4381-9f73-b4d474b6c229',
  'ea01ca82-aa48-4895-bc8f-9701ca24b120','d5cbf776-34d1-47d8-809a-16ae181968d1',
  '2ca89d1c-2bb5-49a7-98ac-13a25594b13c','8528087d-ff46-45ac-9226-9e043cab39fb',
  '6b159718-dd90-4512-bd06-72de2c20ab33','78267be2-396a-470f-936f-a9e4238b9eb1',
  'ffca6c03-4259-4d92-8479-66c7c6aa8eca','18226f63-ff38-4d50-be4e-b8d0a5889f8e',
  'f98b78be-13b3-40e0-b1d4-b0c9dfb221c2','405ba68e-78e0-40ca-bc3c-a06c60f11659',
  'f195e041-d239-43f1-af58-af1dc5128c2d','1f46b478-5edf-4cb5-be36-957d7fec99d3',
  '65cd87b3-9945-432d-9e90-a87737237bfc','05d9fbb6-33d0-4d68-8d03-2d34376cb6b5'
);
COMMIT;
```

> Nota: el rollback del fix vuelve `entrenador_id` a `NULL` (su valor previo real).
