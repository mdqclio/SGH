-- ============================================================
-- backfill_caballerizas_r8.sql — spcs.caballeriza_id desde la planilla oficial
-- ============================================================
-- ✅ APLICADO el 10/08/2026 por MCP apply_migration, migración
--    `backfill_caballerizas_r8`. Verificado: 37/37 con caballeriza_id,
--    KUCCINI sigue en DON VALENTINO y DOCTOR SKY en LA NARCISA (los 2
--    conflictos quedaron intactos, como corresponde),
--    caballerizas ~* 'ORIGEN' = 1 fila (HARAS EL ORIGEN, no se creó nada),
--    spcs sin caballeriza 64 -> 31.
--
-- Fuente: mapa SPC|caballeriza de la planilla oficial de Yesi (83 pares),
-- pasado el 10/08/2026. Typos ya normalizados en origen (WISKA = WISLA KEN;
-- TIAN Y ROMA con y sin '(LP)' es la misma).
--
-- Regla: UPDATE spcs.caballeriza_id SOLO donde es NULL.
-- Donde la base ya tiene caballeriza y difiere -> CONFLICTO, no se toca.
--
-- Resultado del cruce (83 pares):
--   37 BACKFILL      -> los de este UPDATE (35 + los 2 de HARAS EL ORIGEN)
--   44 ya coinciden  -> nada que hacer
--    2 CONFLICTO real-> KUCCINI, DOCTOR SKY (ver abajo, NO se tocan)
--    2 CONFLICTO falso-> LA DIVERTENTE, LUMIN (caballeriza duplicada, ver abajo)
--    0 HUECO         -> 'HS EL ORIGEN' (CHAMPION GOLDEN, INDIO GOLDEN) se
--                       mapea a HARAS EL ORIGEN e664ce7c: HS = Haras, la
--                       unificación decidida en la tanda 3. NO se crea
--                       caballeriza nueva. Verificado: una sola fila con
--                       'ORIGEN' en la tabla, ya con 2 SPCs.
--   0 SPC faltantes  -> los 83 ejemplares de la planilla están en la base.
--
-- ⚠ CONFLICTOS REALES (base != planilla, NO se tocan — decide Yesi):
--     KUCCINI     base: DON VALENTINO   planilla: MARTIN Y NICOLAS
--     DOCTOR SKY  base: LA NARCISA      planilla: LOS URONES
--
-- ⚠ CONFLICTOS FALSOS por caballerizas DUPLICADAS en la base:
--     'EL LINYE Y RAMI' existe 2 veces: d8f78de4 y a692fdea
--     'SANTA BARBARA'  existe 2 veces: 1bb92f70 y 0dc1260f
--   LA DIVERTENTE y LUMIN ya apuntan a una de las dos: el dato es correcto,
--   sólo hay dos filas para el mismo stud. No es un conflicto de datos, es
--   deuda de la tabla caballerizas (ya conocida: ELLINYEYRAMI y LANARCISA).
--   Por eso DE BELLOSO se fija explícitamente a d8f78de4 — la misma fila que
--   ya usa LA DIVERTENTE — en vez de resolverse por nombre.
--
-- Impacto en el programa oficial: NINGUNO. programa-oficial.html lee
-- inscripciones.caballeriza_id (líneas 161 y 379), no spcs.caballeriza_id,
-- y para R8 esa columna está 100% completa (77 líneas no-forfait, 0 en
-- blanco). Este backfill es higiene de datos, no un fix de salida.
-- ============================================================

BEGIN;

UPDATE spcs s SET caballeriza_id = v.cab::uuid, updated_at = now()
FROM (VALUES
 ('454f1de3-a39b-431b-8821-49ecfa1c30d4','384ef42f-6814-4373-a20b-529d00c89929'), -- ABELITO MIMOSO  -> MAR DEL TUYU
 ('6350d628-9949-4e79-a321-0ca116f8f4ee','0ee13029-fc1c-4af0-a217-0d00e2a45c69'), -- ACAPULCO        -> EL DOMADOR
 ('cb050a3e-22d8-4d53-9ac6-821fb57fbbf2','9c0c95a0-479d-4a89-9ae0-41ec5f309428'), -- AMOROUS         -> MI BELLA GIULIA
 ('b6f83915-93c7-495f-9792-311c6551158b','c8d7cfcf-d4cd-484d-bed1-8c1527c7a7aa'), -- BAHIA ROMANA    -> RD NECOCHEA
 ('9abddbff-1395-4a3d-8ed4-35fb8cd335e8','1f011076-06d0-4e5f-b1cd-5dbad1602d16'), -- BOHEMIO TOP     -> LOS MELLI
 ('6a3e219c-ab9a-49dc-9301-aa8e8ec924be','5711fd6f-e0c1-43c9-89bd-74f17c315b89'), -- CONI ROSE       -> EL DESEMPEÑO
 ('cfe378af-8f57-4f17-bfd7-e16861cf02b9','256a7167-aae3-4dda-bf60-7067a33d15fb'), -- CURIOSA GO ON   -> 5 ESTRELLAS
 ('8afce1a4-924c-495d-a726-d1b1f57bec55','d8f78de4-e153-4b12-8640-4a8674a58aa7'), -- DE BELLOSO      -> EL LINYE Y RAMI (fila d8f78de4, ver nota)
 ('6e7ef66d-efb7-47d7-923c-dd0b8979e34a','65b4a9c6-360b-412b-aede-a9b223974743'), -- EL GRAN HECTOR  -> CRAZY HORSE
 ('983a7859-1e71-4953-9574-ec61c065934f','6910e069-eeb9-4f98-8ca8-62b1ffedf741'), -- EL JOROBA       -> LA CALIFORNIA
 ('b205c33d-395e-4b7e-a3fd-95a1db148a85','d2f822b3-98d5-4e57-9692-894ea3bb9bc0'), -- ES SABALERO     -> LA INTERPERIE
 ('f78a132a-7fe7-4713-8ac2-9bd41a34f565','77c213c6-1f59-4939-b429-2aa23cf9db26'), -- ESPLENDID CRAF  -> MI MARTINCITO
 ('59dcdc67-aebd-4107-be8e-369992b3e3a9','266f7bf5-1557-448b-9bfd-80c2fd160107'), -- GAUCHA PRECIOSA -> LOS EDUCADITOS
 ('3efe749e-2088-4f60-9d8e-883fc4c273b5','256a7167-aae3-4dda-bf60-7067a33d15fb'), -- GRAND FITO      -> 5 ESTRELLAS
 ('b743522a-4e80-4694-a0ce-cec99663787f','e83d6e12-5337-453d-8e6e-97b9a5271a8f'), -- IDALIA MARO     -> ABUELO FLORO
 ('ba091251-9e8b-47df-aad0-e820bf8d45b2','86f4bcf4-c1ae-44dd-8371-4a944bd56d44'), -- INFILTRADO SLEW -> EL VETERANO
 ('d5d39984-a248-46ff-8e6d-5b207876cbf5','256a7167-aae3-4dda-bf60-7067a33d15fb'), -- LA DE ETIQUETA  -> 5 ESTRELLAS
 ('edde1a8c-5722-40b6-b1c9-a52a84990c50','266f7bf5-1557-448b-9bfd-80c2fd160107'), -- LA GRAN TEMPESTAD -> LOS EDUCADITOS
 ('3e90190a-24c4-4d63-b820-07bc04c9abce','a5a0e7a2-4c60-4cbe-bbcc-5271e6a8d40f'), -- LA LAGUNERA J   -> EL POBRE
 ('98d5b7b1-11af-405e-94a7-0199eb21130e','93c99b75-ccbc-492b-ac08-7e0bc3793c3c'), -- LE BATEAU       -> EL DESTINO
 ('fa61f989-ede8-436f-a5fa-1475d442dd58','c8dd2ada-0769-4662-beb9-b3146e85f1da'), -- LE CHAT MIMOUS  -> TIAN Y ROMA
 ('ab14ee82-a68a-4eb9-bea9-26d11683eaa9','dad5066d-d056-4157-8dbf-a271374926a7'), -- LIVIA DRUSA     -> LUNA ROJA
 ('71911106-b45b-4381-b077-41195ee67f81','88049e6a-bc48-477f-a6e1-5ceb6ec95433'), -- LOGUACIOUS      -> EL NIETO
 ('a82769b8-10fe-434d-808c-50479fe88328','3201de5c-9e29-4053-86d4-fb69a62f019d'), -- MAC VITAL       -> BETTY SANTI
 ('f23beae3-af36-4b89-be03-f6c66edbc11c','88619548-2b4d-48db-8b60-0095877bd08e'), -- NELIDA RIM      -> FEDERICO Y MIGUEL
 ('d838d0b9-0ef8-4f79-9dc5-a5fdc69d6ea9','f533d362-2453-4a2b-9395-7657017306dc'), -- NORMANDO LU     -> ESTAMPA DEL SUR
 ('0124e863-a975-420d-bd5f-07f11352142b','13948689-ddfe-4127-904e-57edd56dd285'), -- RECUERDAME IN YOU -> NEGRO T
 ('9bdab685-498f-4fd3-8d16-abb278f80d93','1307c8d5-23cb-4141-a644-276daa00202a'), -- REINA ATREVIDA  -> EL CHINGA
 ('f02c7f94-57aa-4c5e-ab4f-f1cab6296a14','1143284d-3889-4793-992f-b852708c5403'), -- REINA EDITION   -> EMI
 ('d8e133ea-f39d-40cd-b682-3a089150243c','e0a4f006-9144-41ad-9ce9-b42c96959b8b'), -- SOY RICARDO     -> LOS MORENITOS
 ('47a6c344-dd22-46f2-926f-9df5b0c8eae9','ebba426f-52b5-4329-9566-df01ec768df3'), -- TERRIBLE KING   -> DON BENICIO
 ('6ecc516a-3440-428d-9bc4-351a4693924c','49ed956b-9678-480b-8421-d3326c077f40'), -- TIENE RITMO     -> DON NITO
 ('4b7dd532-b140-4a3e-99f4-12bbc4990a6d','a05aed22-7858-4d48-be47-06e4e8012a20'), -- TOUCH OF BLUE   -> NUEVO MUNDO
 ('82351c05-4d69-4f9a-82cb-392785e06457','bcfb348a-859e-48bd-9919-8b75d4863c9f'), -- WILSON SECURITY -> SANTOS VEGA
 ('1b8771fb-13b5-48f7-a638-abfbe63abcad','e9907e8b-1bcc-484b-9920-c16cd9268669'), -- YOOKY           -> MELINA A
 -- 'HS EL ORIGEN' de la planilla = HARAS EL ORIGEN (HS = Haras), unificación
 -- decidida en la tanda 3. NO se crea caballeriza nueva. Verificado el 10/08:
 -- caballerizas ~* 'ORIGEN' devuelve UNA sola fila, e664ce7c, que ya tiene
 -- 2 SPCs colgando. Sin evidencia de que sean dos studs distintos.
 ('de7886a7-f71a-4421-a299-6a1cde46edfc','e664ce7c-78dd-4d1d-904b-c25cf0f92b96'), -- CHAMPION GOLDEN -> HARAS EL ORIGEN
 ('9c337a8c-3f61-42ca-9da0-62b964a85042','e664ce7c-78dd-4d1d-904b-c25cf0f92b96')  -- INDIO GOLDEN    -> HARAS EL ORIGEN
) AS v(spc, cab)
WHERE s.id = v.spc::uuid
  AND s.caballeriza_id IS NULL;   -- guard: nunca pisa un valor existente

-- Debe dar 37.
SELECT count(*) AS backfilleados FROM spcs s
WHERE s.caballeriza_id IS NOT NULL AND s.id IN (
 '454f1de3-a39b-431b-8821-49ecfa1c30d4','6350d628-9949-4e79-a321-0ca116f8f4ee',
 'cb050a3e-22d8-4d53-9ac6-821fb57fbbf2','b6f83915-93c7-495f-9792-311c6551158b',
 '9abddbff-1395-4a3d-8ed4-35fb8cd335e8','6a3e219c-ab9a-49dc-9301-aa8e8ec924be',
 'cfe378af-8f57-4f17-bfd7-e16861cf02b9','8afce1a4-924c-495d-a726-d1b1f57bec55',
 '6e7ef66d-efb7-47d7-923c-dd0b8979e34a','983a7859-1e71-4953-9574-ec61c065934f',
 'b205c33d-395e-4b7e-a3fd-95a1db148a85','f78a132a-7fe7-4713-8ac2-9bd41a34f565',
 '59dcdc67-aebd-4107-be8e-369992b3e3a9','3efe749e-2088-4f60-9d8e-883fc4c273b5',
 'b743522a-4e80-4694-a0ce-cec99663787f','ba091251-9e8b-47df-aad0-e820bf8d45b2',
 'd5d39984-a248-46ff-8e6d-5b207876cbf5','edde1a8c-5722-40b6-b1c9-a52a84990c50',
 '3e90190a-24c4-4d63-b820-07bc04c9abce','98d5b7b1-11af-405e-94a7-0199eb21130e',
 'fa61f989-ede8-436f-a5fa-1475d442dd58','ab14ee82-a68a-4eb9-bea9-26d11683eaa9',
 '71911106-b45b-4381-b077-41195ee67f81','a82769b8-10fe-434d-808c-50479fe88328',
 'f23beae3-af36-4b89-be03-f6c66edbc11c','d838d0b9-0ef8-4f79-9dc5-a5fdc69d6ea9',
 '0124e863-a975-420d-bd5f-07f11352142b','9bdab685-498f-4fd3-8d16-abb278f80d93',
 'f02c7f94-57aa-4c5e-ab4f-f1cab6296a14','d8e133ea-f39d-40cd-b682-3a089150243c',
 '47a6c344-dd22-46f2-926f-9df5b0c8eae9','6ecc516a-3440-428d-9bc4-351a4693924c',
 '4b7dd532-b140-4a3e-99f4-12bbc4990a6d','82351c05-4d69-4f9a-82cb-392785e06457',
 '1b8771fb-13b5-48f7-a638-abfbe63abcad',
 'de7886a7-f71a-4421-a299-6a1cde46edfc','9c337a8c-3f61-42ca-9da0-62b964a85042');

COMMIT;
