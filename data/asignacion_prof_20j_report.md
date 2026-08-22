# Reporte — Asignación de profesionales a inscripciones · Reunión 6 (2026-06-20)

**EJECUTADO** contra prod (club Dolores). Solo se completaron campos en NULL (guard `is.null` server-side, 0 pisados). Dobles montas y no-confirmados excluidos.

## Conteo de UPDATEs: **160** (85 jockey + 75 cuidador)

Excluidos a propósito:
- Doble monta (jockey a mano por Yesica): T6 PORTEÑO Y BAILARIN, T7 BELLO PRESAGIO.
- No confirmados (sin asignar): T5 VITO LO CAPO (cuidador VEGA ROLANDO no existe), T11 WAVE RIMOUT (caballo a verificar).
- Caballo sin inscripción: T2 HEART OR GOLD (typo de HEART OF GOLD).
- Cuidador inexistente: MALENA GUSTAVO (T1 TIRSO).

## Campos tocados (insc · campo · profesional)

| T | Caballo | Campo | Profesional | inscripcion_id |
|---|---|---|---|---|
| 1 | BERRY NIK | jockey | PRESA DANIEL | `2d793bee-bd3c-4d9b-a706-57980834b906` |
| 1 | CARRIGAN FITZ | cuidador | TOLEDO MARIA ELENA | `3e5f0a35-f2ba-4e52-a857-4671efe65508` |
| 1 | CONESERA | jockey | DELLI QUADRI IGNACIO | `803a4268-69ef-4c71-a6c2-981abe494d39` |
| 1 | DE MODA | jockey | TORRES ANIBAL | `fcdecfe7-9117-4b8e-9d8b-0833e4c37b14` |
| 1 | DOCTORA APASIONADA | cuidador | CARLI FEDERICO | `01a41f66-8932-4d43-8fac-92ced690a91f` |
| 1 | DOCTORA APASIONADA | jockey | DIESTRA PEDRO | `01a41f66-8932-4d43-8fac-92ced690a91f` |
| 1 | ES MISTRES | jockey | GIL SANTINO | `0a35f9e7-3142-49a0-9955-faf9a1fcd1a6` |
| 1 | GREAT ORPEN | cuidador | DIESTRA CLAUDIO MAXIMILIANO | `e7d7e085-286a-4f7a-8623-2b5237b2be4f` |
| 1 | GREAT ORPEN | jockey | DIESTRA PEDRO | `e7d7e085-286a-4f7a-8623-2b5237b2be4f` |
| 1 | MONADESEDA | cuidador | DIESTRA JUAN DOMINGO | `35aaf81f-ce6e-4a84-b371-cf2e1502cc76` |
| 1 | MONADESEDA | jockey | ZAPICO DIEGO | `35aaf81f-ce6e-4a84-b371-cf2e1502cc76` |
| 1 | MOSQUITA GARDEN | cuidador | MAITIA LUIS | `34c977b7-c5ab-4737-a016-0d99a4018f2e` |
| 1 | QUIET SANTINA | cuidador | CANTO TOMAS | `060436fe-f0cf-42d5-b712-b94109a919dd` |
| 1 | SANTA PACIENCIA | cuidador | TOLEDO MARIA ELENA | `8a22eb45-2244-40e6-8e73-e2a6106231cc` |
| 1 | SANTA PACIENCIA | jockey | ARREGUY FRANCISCO | `8a22eb45-2244-40e6-8e73-e2a6106231cc` |
| 1 | TIRSO | jockey | CANTO TOBIAS | `4d3db027-2f3b-403e-8b87-dacf7b35ff02` |
| 2 | ASTUTO NOTES | cuidador | TRUPPA ROBERTO | `23ce0134-3db7-4549-a39f-a710e473acb4` |
| 2 | BENDITO PRESAGIO | cuidador | ALDAY SERGIO ESTEBAN | `316fb581-3e10-442b-ac85-2e47c8850a99` |
| 2 | BENDITO PRESAGIO | jockey | PRESA DANIEL | `316fb581-3e10-442b-ac85-2e47c8850a99` |
| 2 | CALAVERIANDO | cuidador | IPARAGUIRRE RICARDO | `addc3bd4-67c9-4935-8afe-f402bf1d4afd` |
| 2 | CALAVERIANDO | jockey | DIESTRA PEDRO | `addc3bd4-67c9-4935-8afe-f402bf1d4afd` |
| 2 | DESDEN | cuidador | DIESTRA FLORENCIA | `2467e8af-8e59-41b0-a350-66380f665e6f` |
| 2 | DESDEN | jockey | DIESTRA BAUTISTA | `2467e8af-8e59-41b0-a350-66380f665e6f` |
| 2 | DOCTOR SKY | cuidador | CARLI FEDERICO | `bd87c196-2e9c-4809-b6b3-c3cb07c28ec6` |
| 2 | DOCTOR SKY | jockey | IBARRA FERNANDO AUGUSTO | `bd87c196-2e9c-4809-b6b3-c3cb07c28ec6` |
| 2 | EL BORJA | jockey | GIL SANTINO | `ad96829f-3a37-4953-bf76-cf79f0d7c122` |
| 2 | EL MEJOR DUQUE | jockey | CANTO TOBIAS | `785d802d-7e5c-4bd0-8bf6-455da36370b3` |
| 2 | THE SULTAN | cuidador | CANTO TOMAS | `f5a9b457-d2e6-4a99-950a-3c0808d649b4` |
| 2 | THE SULTAN | jockey | CANTO TOBIAS | `f5a9b457-d2e6-4a99-950a-3c0808d649b4` |
| 2 | VISION SECURITY | jockey | AGUIRRE HUGO | `592e0938-33ae-4ac6-abb2-035094add09b` |
| 2 | YO SOY TANGO | cuidador | THEILLER RAUL OMAR | `4f3cb8d5-cf3e-48f5-a8e3-5ac4795c8654` |
| 2 | YO SOY TANGO | jockey | TORRES ANIBAL | `4f3cb8d5-cf3e-48f5-a8e3-5ac4795c8654` |
| 3 | BACHUNA | cuidador | FLEKSTEIN LEONARDO | `117668fd-cad5-4004-8e6d-a268615a3b62` |
| 3 | DOCTORA MIA | cuidador | BOLONTI ROBERTO | `07d3830c-884d-4122-a246-2850cde12763` |
| 3 | LA SENTADA | cuidador | PADRON WALTER | `c91777f8-e2c4-4f46-b1b7-61fbcb419d04` |
| 3 | LA SENTADA | jockey | CANTO TOBIAS | `c91777f8-e2c4-4f46-b1b7-61fbcb419d04` |
| 3 | LATIN RAIN | jockey | GIL SANTINO | `2fbbf2ec-cf5b-4bdc-b5c6-b7818235fe54` |
| 3 | LOCA DUBAI | cuidador | BLANCO MARCELO | `eccae519-b127-4270-8213-214f8b75057a` |
| 3 | LOCA DUBAI | jockey | DA SILVA RUBEN | `eccae519-b127-4270-8213-214f8b75057a` |
| 3 | SANTA LISA | cuidador | MAITIA LUIS | `b15c9cae-6d58-41a4-82f5-7642b95f9ffa` |
| 3 | SIEMPREHAYESPERANZA | cuidador | CONSTANCIO ALEXIS | `f12095ad-c52f-480c-8eaf-aedb3f30653b` |
| 3 | SIEMPREHAYESPERANZA | jockey | DIESTRA PEDRO | `f12095ad-c52f-480c-8eaf-aedb3f30653b` |
| 3 | SOL GALANA | cuidador | FLEKSTEIN LEONARDO | `d756de1a-9723-455b-a9a2-17aa26fd7961` |
| 3 | TALENTOSA CATCH | jockey | MARTINEZ AGUSTIN | `d4889e35-22ec-4853-9b8b-39e6c96a74f8` |
| 3 | TATI SONG | cuidador | TOLEDO MARIA ELENA | `a91a1752-8878-4cd7-8ab2-4ffab74b71e5` |
| 3 | TATI SONG | jockey | ARREGUY FRANCISCO | `a91a1752-8878-4cd7-8ab2-4ffab74b71e5` |
| 4 | BUEN MANUEL | cuidador | PADRON WALTER | `5f066fbc-3cff-453f-8ce1-11ba86413c88` |
| 4 | BUEN MANUEL | jockey | CANTO TOBIAS | `5f066fbc-3cff-453f-8ce1-11ba86413c88` |
| 4 | GOIAS GREEN | cuidador | AMADEO LUIS ALEJANDRO | `974dd95e-5be6-4272-a532-42cc96cc462c` |
| 4 | GOIAS GREEN | jockey | PAIZ JAVIER | `974dd95e-5be6-4272-a532-42cc96cc462c` |
| 4 | MAESTRO DE ARMAS | jockey | SALDIAS DIEGO | `f6680dbb-b847-417a-8425-e161f1bab507` |
| 4 | REY DE PILA | cuidador | DI FRANCO GUSTAVO | `e5a55bae-c79c-4e7b-bb29-d388a614222e` |
| 4 | REY DE PILA | jockey | YALET JORGE | `e5a55bae-c79c-4e7b-bb29-d388a614222e` |
| 4 | SALVADOR EVER | cuidador | TEVEZ OSCAR | `968e3944-cc8b-4c27-b159-92d758f9e01f` |
| 4 | SALVADOR EVER | jockey | ROJAS HERNAN | `968e3944-cc8b-4c27-b159-92d758f9e01f` |
| 4 | TOY BOY | cuidador | MAITIA MIGUEL A | `7e820a9b-a162-442c-9e74-ee4aca7d898d` |
| 4 | TOY BOY | jockey | ZUBIRIA SANTIAGO | `7e820a9b-a162-442c-9e74-ee4aca7d898d` |
| 4 | TURRON KEY | cuidador | CONSTANCIO ALEXIS | `e4902e8b-efe5-480d-8efe-92296e054eba` |
| 4 | TURRON KEY | jockey | DIESTRA PEDRO | `e4902e8b-efe5-480d-8efe-92296e054eba` |
| 5 | DESDEN | cuidador | DIESTRA FLORENCIA | `6861c907-444b-4869-bb56-b8eb05de6d07` |
| 5 | DESDEN | jockey | DIESTRA BAUTISTA | `6861c907-444b-4869-bb56-b8eb05de6d07` |
| 5 | DOCTORA MIA | cuidador | BOLONTI ROBERTO | `ff5b084a-2f0c-4b87-86ac-de1898661438` |
| 5 | EL BORJA | jockey | GIL SANTINO | `0e147226-6f40-468b-ac02-508961681be4` |
| 5 | HEART OF GOLD | cuidador | TRUPPA ROBERTO | `766f1538-0ca2-4f64-8b68-8dfd77f04e7d` |
| 5 | KRISTALINA | cuidador | TRUPPA ROBERTO | `72182c04-6b28-4c1a-a90a-389411c7c866` |
| 5 | LATIN RAIN | jockey | D'ELIA THIAGO | `7c4d1517-542b-4b1a-9d1f-f236d3eabd48` |
| 5 | THE SULTAN | cuidador | CANTO TOMAS | `db516afe-2326-4a58-be0f-70cc06913bcc` |
| 5 | THE SULTAN | jockey | CANTO TOBIAS | `db516afe-2326-4a58-be0f-70cc06913bcc` |
| 5 | UNBOTHERED | cuidador | MARTIN DAMIAN ALBERTO | `8aa123a0-9778-40f0-8478-50475845a6cb` |
| 5 | UNBOTHERED | jockey | GIULIANO BRUNO | `8aa123a0-9778-40f0-8478-50475845a6cb` |
| 5 | VISION SECURITY | jockey | AGUIRRE HUGO | `54ef92fd-4abc-4688-af97-5f5aa580efd7` |
| 6 | AMIGUITO JESUS | cuidador | TAVAGNUTTI RICARDO H | `5a8eeb44-bbf7-4c5a-bddb-724464206680` |
| 6 | AMIGUITO JESUS | jockey | DIESTRA PEDRO | `5a8eeb44-bbf7-4c5a-bddb-724464206680` |
| 6 | CHAMPION GOLDEN | cuidador | BOLONTI ROBERTO | `f82f4462-c9d3-4ee7-ab1b-6b8b6f059df1` |
| 6 | CHAMPION GOLDEN | jockey | CANTO TOBIAS | `f82f4462-c9d3-4ee7-ab1b-6b8b6f059df1` |
| 6 | CHE CARABANERA | jockey | GIL SANTINO | `c767b98c-1b03-4abf-903a-e85285936754` |
| 6 | CIUDAD REAL | cuidador | GAITAN PICART RAMIRO | `cae36d76-2711-4959-a733-08510b933b07` |
| 6 | CLAIRE CHUCK | cuidador | BARRIONUEVO OSCAR ABEL | `a08dead5-2fd3-4ff1-9a08-d9fb2b346404` |
| 6 | CLAIRE CHUCK | jockey | ACUÑA MATIAS | `a08dead5-2fd3-4ff1-9a08-d9fb2b346404` |
| 6 | COLONIAL JOHAN | cuidador | NOTARIO GONZALO | `1a12730c-ce33-465c-be73-3ba0f0976ce5` |
| 6 | COLONIAL JOHAN | jockey | ACUÑA MATIAS | `1a12730c-ce33-465c-be73-3ba0f0976ce5` |
| 6 | ESTAS A TIEMPO | cuidador | CANTO HORACIO | `e82c8b4c-2754-483b-a528-6b532bf90d0c` |
| 6 | FALAYS | cuidador | TRUPPA ROBERTO | `6e27a694-8b41-49f3-9706-4e0e226d606b` |
| 6 | FREE CRY | jockey | GIL SANTINO | `730f3e33-d237-4b68-a891-5af8bef7fbbf` |
| 6 | KUCCINI | cuidador | CANTO HORACIO | `a370bfc3-329f-4c4d-b6af-bddb0760d881` |
| 6 | LADY BLIK | cuidador | GOMEZ JULIO | `f325ae40-9fbf-4b53-802a-76b4b78227ed` |
| 6 | LADY BLIK | jockey | ROJAS HERNAN | `f325ae40-9fbf-4b53-802a-76b4b78227ed` |
| 6 | LUMIN | jockey | ROMAY ABEL I | `ea96ff0f-3002-4540-9c9e-1f521a484214` |
| 6 | NOCHE EN VELA | jockey | AGUIRRE HUGO | `34abb6b9-8992-4403-8935-98574051fa82` |
| 6 | PAULINA KEY | jockey | ALDECOA IVAN | `ac5a8b2d-9de0-4076-bcbb-9b7287d09579` |
| 6 | PORTEÑO Y BAILARIN | cuidador | AZURI SANTIAGO DAMIAN | `d21f589c-2ef1-45eb-b3b8-8b180680e861` |
| 6 | TATA FOOT | cuidador | DI FRANCO GUSTAVO | `9c618243-c86e-41ec-a849-6e6dd00e9a1f` |
| 6 | TATA FOOT | jockey | AVENDAÑO MIGUEL A | `9c618243-c86e-41ec-a849-6e6dd00e9a1f` |
| 6 | TIMBERA IN YOU | cuidador | TEDESCHI ALEJANDRO | `cda7b037-4721-4033-99f2-591e7e19669e` |
| 6 | TIMBERA IN YOU | jockey | OSUNA JOSE | `cda7b037-4721-4033-99f2-591e7e19669e` |
| 6 | WISLA KEN | jockey | DELLI QUADRI IGNACIO | `a3672b92-081a-4c7c-948b-9b1983204673` |
| 7 | LA NOUBITA | cuidador | NOTARIO GONZALO | `e19a9674-2ea6-4394-8a85-43c8bc32c279` |
| 7 | LA NOUBITA | jockey | ACUÑA MATIAS | `e19a9674-2ea6-4394-8a85-43c8bc32c279` |
| 7 | LE BIRD | cuidador | TOLEDO MARIA ELENA | `5f75b822-4afd-46d3-b8d6-1aef68e7238f` |
| 7 | LE BIRD | jockey | ARREGUY FRANCISCO | `5f75b822-4afd-46d3-b8d6-1aef68e7238f` |
| 7 | QUEEN OF HEARTS | cuidador | CONSTANCIO ALEXIS | `9e14fb38-e903-4468-9342-bc91590c20d9` |
| 7 | QUEEN OF HEARTS | jockey | DIESTRA PEDRO | `9e14fb38-e903-4468-9342-bc91590c20d9` |
| 7 | SOY ISLEÑO | cuidador | BRIGANTI MARIA LAURA | `022327d3-0017-4e07-9beb-10f4ab70c74a` |
| 7 | SOY ISLEÑO | jockey | GIL SANTINO | `022327d3-0017-4e07-9beb-10f4ab70c74a` |
| 8 | BABY PARADISE | jockey | AGUIRRE HUGO | `e9b3e921-fea8-4347-a04f-a41d37d283e7` |
| 8 | CRAZY RABID | cuidador | OLIVERA MARIO RAUL | `c253de99-fef7-413f-bfd1-7449e6b919cb` |
| 8 | DESTINADO JOHAN | cuidador | PREBE JOSE | `7fbbd8b1-24e8-4fe9-beee-09df6e51a4a5` |
| 8 | DESTINADO JOHAN | jockey | CANTO TOBIAS | `7fbbd8b1-24e8-4fe9-beee-09df6e51a4a5` |
| 8 | FLORENTINA IN YOU | cuidador | TEDESCHI ALEJANDRO | `1cdac0b9-e71f-4f45-b4c9-81ae155bd3be` |
| 8 | FLORENTINA IN YOU | jockey | OSUNA JOSE | `1cdac0b9-e71f-4f45-b4c9-81ae155bd3be` |
| 8 | FURIOSO ON | cuidador | TEDESCHI ALEJANDRO | `b9263dff-46da-4c92-8436-18971fe9c10f` |
| 8 | GLAM METAL | cuidador | BRIGANTI MARIA LAURA | `db0074d9-f900-4a91-b432-80376980433b` |
| 8 | GLAM METAL | jockey | GIL SANTINO | `db0074d9-f900-4a91-b432-80376980433b` |
| 8 | GRILLADA RYE | jockey | PRESA DANIEL | `f8daf95e-487a-4b47-98a0-489b32d8beff` |
| 8 | LOCO FUN | cuidador | DIESTRA CLAUDIO MAXIMILIANO | `d7b909c5-2b92-4985-b3f3-1610a715223d` |
| 8 | LOCO FUN | jockey | CANTO TOBIAS | `d7b909c5-2b92-4985-b3f3-1610a715223d` |
| 8 | MI ILUSION | jockey | SALDIAS DIEGO | `cafc4989-c618-4fa9-bad2-d3343c75ce65` |
| 8 | QUINIELA TREND | jockey | YALET IRINEO | `9141f32e-2f9a-4410-b9f6-c07bc5115ae3` |
| 8 | ZETA FOOT | cuidador | MORAN HECTOR ROBERTO | `20b80f1f-2f28-4a9f-8ea2-a0a1850063d3` |
| 8 | ZETA FOOT | jockey | DIESTRA BAUTISTA | `20b80f1f-2f28-4a9f-8ea2-a0a1850063d3` |
| 9 | AFRICUM | cuidador | IPARAGUIRRE RICARDO | `6632e8d1-20da-41a6-b745-7a6ee6066c93` |
| 9 | AFRICUM | jockey | DIESTRA PEDRO | `6632e8d1-20da-41a6-b745-7a6ee6066c93` |
| 9 | BUEN DURAZNO | cuidador | CASTELLANO ROBERTO E | `6cda9b4a-fb9a-4877-a222-834712cbeada` |
| 9 | DARIN | jockey | PRESA DANIEL | `699d7bb0-8c61-48ea-b5cc-ed0242058df3` |
| 9 | DEVIL'S KING | cuidador | ECHENIQUE ATILIO | `57a87d37-fdd0-45be-a905-c0a128518d10` |
| 9 | DEVIL'S KING | jockey | DIESTRA BAUTISTA | `57a87d37-fdd0-45be-a905-c0a128518d10` |
| 9 | DOLAR JOHAN | cuidador | BOLONTI ROBERTO | `d4b7577d-e5c8-4fda-9cdb-fdd91ec3606e` |
| 9 | DOLAR JOHAN | jockey | CANTO TOBIAS | `d4b7577d-e5c8-4fda-9cdb-fdd91ec3606e` |
| 9 | ECHO IN THE SKY | cuidador | VILLARUEL EDUARDO EMILIO | `d7c88975-b03c-4b2b-bb62-eca77ccddd5a` |
| 9 | ECHO IN THE SKY | jockey | ACUÑA LUIS | `d7c88975-b03c-4b2b-bb62-eca77ccddd5a` |
| 9 | EMMOZONITO | cuidador | TRUPPA ROBERTO | `7e510b9b-0e1f-4d29-98ed-b67aaacade4a` |
| 9 | EMMOZONITO | jockey | PRESA DANIEL | `7e510b9b-0e1f-4d29-98ed-b67aaacade4a` |
| 9 | ESTOY BLUE | cuidador | TEVEZ OSCAR | `1a281704-ea1c-4115-9b26-7f274ce4439f` |
| 9 | ESTOY BLUE | jockey | ROJAS HERNAN | `1a281704-ea1c-4115-9b26-7f274ce4439f` |
| 9 | GINIYA GOOD | cuidador | ALBERDI OSVALDO | `8b1fb329-aac9-4ccb-81bc-ccd74e50211f` |
| 9 | GINIYA GOOD | jockey | TORRES ANIBAL | `8b1fb329-aac9-4ccb-81bc-ccd74e50211f` |
| 9 | LA DIVERTENTE | jockey | PRESA DANIEL | `dc3ba066-b75f-46c9-a050-c90b0499540f` |
| 9 | LATIN PRESUMIDA | jockey | D'ELIA THIAGO | `615e796b-6c0e-4b2f-b0e0-0a822fd1c442` |
| 9 | QUIET GAUCHO | cuidador | DIESTRA CLAUDIO MAXIMILIANO | `6634e27e-57c9-4070-ac5b-0b79aa2ef22a` |
| 9 | QUIET GAUCHO | jockey | DIESTRA BAUTISTA | `6634e27e-57c9-4070-ac5b-0b79aa2ef22a` |
| 9 | SEMBRADOR CHUCK | cuidador | MAITIA MIGUEL A | `24cae834-69c6-4b1d-9c6d-d1f5cad50af8` |
| 9 | SEMBRADOR CHUCK | jockey | ZUBIRIA SANTIAGO | `24cae834-69c6-4b1d-9c6d-d1f5cad50af8` |
| 9 | SEÑOR MONCHI | cuidador | ZUBIARRAIN SANTIAGO | `9c4fa3c2-12d3-4131-aab8-4fac28f0f7cb` |
| 9 | TAHYI TAROVA | cuidador | BARRIONUEVO OSCAR ABEL | `17ab6239-319a-4c4a-8e08-a082bfe9ed57` |
| 9 | TAHYI TAROVA | jockey | ACUÑA MATIAS | `17ab6239-319a-4c4a-8e08-a082bfe9ed57` |
| 10 | IX GOAL TUN | cuidador | BARRERA MARIA LAURA | `6a5e46b6-9043-4c6b-a0fa-2bfb2b7e2c32` |
| 10 | IX GOAL TUN | jockey | ROJAS HERNAN | `6a5e46b6-9043-4c6b-a0fa-2bfb2b7e2c32` |
| 10 | LATIN PRESUMIDA | jockey | GIL SANTINO | `79ee695c-dd71-42d2-a9aa-3da619939599` |
| 11 | BELLO PRESAGIO | jockey | AGUIRRE HUGO | `b49c637e-d83d-49a1-b6d0-b67ce458365d` |
| 11 | CHINITA SALTEÑA | cuidador | ALZA MAXIMILIANO | `53cddf30-0123-457b-b698-387b646cfa4f` |
| 11 | ESCUCHAR TU VOZ | jockey | DELLI QUADRI IGNACIO | `83428fca-fccf-4cc6-8c08-523c6460fdb0` |
| 11 | ICY TOM | cuidador | ALBERDI OSVALDO | `fa324608-72c1-4a43-8d59-084d3404fc80` |
| 11 | ICY TOM | jockey | CANTO TOBIAS | `fa324608-72c1-4a43-8d59-084d3404fc80` |
| 11 | LA RODESIA | jockey | MENDEZ KEVIN | `07f8b7a5-aaec-465e-8eed-14d782d22448` |
| 11 | LE BIRD | cuidador | TOLEDO MARIA ELENA | `1ec69573-5373-431c-a2a4-15002885f32f` |
| 11 | LE BIRD | jockey | ARREGUY FRANCISCO | `1ec69573-5373-431c-a2a4-15002885f32f` |
| 11 | QUIET GAUCHO | cuidador | DIESTRA CLAUDIO MAXIMILIANO | `0d0951c4-a532-4c2a-9c9e-47c9da081546` |
| 11 | QUIET GAUCHO | jockey | DIESTRA PEDRO | `0d0951c4-a532-4c2a-9c9e-47c9da081546` |
| 11 | RIDGE PRINCE | jockey | GIL SANTINO | `2360f43d-b2e8-4b72-8513-d05d7a713d0a` |
| 11 | SIGO VIAJE | cuidador | OLIVERA MARIO RAUL | `dd0a126e-12d4-4d5c-988e-c1ac79b36d59` |

## ROLLBACK (revierte solo lo asignado en esta corrida)
```sql
BEGIN;
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='4d3db027-2f3b-403e-8b87-dacf7b35ff02' AND jockey_titular_id='005caa02-fc91-45b3-9ae6-6f55d989fa2e';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='0a35f9e7-3142-49a0-9955-faf9a1fcd1a6' AND jockey_titular_id='01b92e06-41df-4d25-9aa6-268b4fdffdbc';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='fcdecfe7-9117-4b8e-9d8b-0833e4c37b14' AND jockey_titular_id='9a8af6b4-afeb-4dbb-b7a4-5399e0cd9de9';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='2d793bee-bd3c-4d9b-a706-57980834b906' AND jockey_titular_id='8c358b73-8d01-4293-9ac8-0f4d44f535f6';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='01a41f66-8932-4d43-8fac-92ced690a91f' AND jockey_titular_id='654dc3ea-5c90-46cd-a579-eb0efa3bd1c0';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='e7d7e085-286a-4f7a-8623-2b5237b2be4f' AND jockey_titular_id='654dc3ea-5c90-46cd-a579-eb0efa3bd1c0';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='803a4268-69ef-4c71-a6c2-981abe494d39' AND jockey_titular_id='0bbe6666-bdf5-446b-8ee2-5279eafdc844';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='8a22eb45-2244-40e6-8e73-e2a6106231cc' AND jockey_titular_id='7dcddbdb-52dc-4f56-8010-0fc8a5de9dcb';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='35aaf81f-ce6e-4a84-b371-cf2e1502cc76' AND jockey_titular_id='8abe11d7-12df-4b2a-b12d-3db255e939f2';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='785d802d-7e5c-4bd0-8bf6-455da36370b3' AND jockey_titular_id='005caa02-fc91-45b3-9ae6-6f55d989fa2e';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='ad96829f-3a37-4953-bf76-cf79f0d7c122' AND jockey_titular_id='01b92e06-41df-4d25-9aa6-268b4fdffdbc';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='316fb581-3e10-442b-ac85-2e47c8850a99' AND jockey_titular_id='8c358b73-8d01-4293-9ac8-0f4d44f535f6';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='4f3cb8d5-cf3e-48f5-a8e3-5ac4795c8654' AND jockey_titular_id='9a8af6b4-afeb-4dbb-b7a4-5399e0cd9de9';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='592e0938-33ae-4ac6-abb2-035094add09b' AND jockey_titular_id='a66df20c-cd72-4125-a1d7-b32e48fcf037';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='2467e8af-8e59-41b0-a350-66380f665e6f' AND jockey_titular_id='70907ee8-7c1b-45d6-9821-d55f344c05a6';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='bd87c196-2e9c-4809-b6b3-c3cb07c28ec6' AND jockey_titular_id='8f24be30-e951-4287-82bd-2db54d0e32dc';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='f5a9b457-d2e6-4a99-950a-3c0808d649b4' AND jockey_titular_id='005caa02-fc91-45b3-9ae6-6f55d989fa2e';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='addc3bd4-67c9-4935-8afe-f402bf1d4afd' AND jockey_titular_id='654dc3ea-5c90-46cd-a579-eb0efa3bd1c0';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='2fbbf2ec-cf5b-4bdc-b5c6-b7818235fe54' AND jockey_titular_id='01b92e06-41df-4d25-9aa6-268b4fdffdbc';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='d4889e35-22ec-4853-9b8b-39e6c96a74f8' AND jockey_titular_id='78cb7c87-0fef-4454-aa16-d81651a469cd';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='eccae519-b127-4270-8213-214f8b75057a' AND jockey_titular_id='c8894b64-5521-460a-a50b-a7c57ec3f59a';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='c91777f8-e2c4-4f46-b1b7-61fbcb419d04' AND jockey_titular_id='005caa02-fc91-45b3-9ae6-6f55d989fa2e';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='f12095ad-c52f-480c-8eaf-aedb3f30653b' AND jockey_titular_id='654dc3ea-5c90-46cd-a579-eb0efa3bd1c0';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='a91a1752-8878-4cd7-8ab2-4ffab74b71e5' AND jockey_titular_id='7dcddbdb-52dc-4f56-8010-0fc8a5de9dcb';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='968e3944-cc8b-4c27-b159-92d758f9e01f' AND jockey_titular_id='2e3428cb-be99-4c91-9b99-13c3b499e147';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='7e820a9b-a162-442c-9e74-ee4aca7d898d' AND jockey_titular_id='674157cf-9393-419e-bf50-0881802b785e';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='f6680dbb-b847-417a-8425-e161f1bab507' AND jockey_titular_id='6d3129b7-42ef-40e3-976e-325b5d7a8c28';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='e5a55bae-c79c-4e7b-bb29-d388a614222e' AND jockey_titular_id='ebc7829a-9a9d-4aa5-b159-4fce010ccbc1';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='5f066fbc-3cff-453f-8ce1-11ba86413c88' AND jockey_titular_id='005caa02-fc91-45b3-9ae6-6f55d989fa2e';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='e4902e8b-efe5-480d-8efe-92296e054eba' AND jockey_titular_id='654dc3ea-5c90-46cd-a579-eb0efa3bd1c0';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='974dd95e-5be6-4272-a532-42cc96cc462c' AND jockey_titular_id='30ee4249-d70b-44df-ab3d-cb6e1e42b182';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='0e147226-6f40-468b-ac02-508961681be4' AND jockey_titular_id='01b92e06-41df-4d25-9aa6-268b4fdffdbc';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='7c4d1517-542b-4b1a-9d1f-f236d3eabd48' AND jockey_titular_id='b4727bd1-9808-40cf-8467-772c4a8b8539';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='54ef92fd-4abc-4688-af97-5f5aa580efd7' AND jockey_titular_id='a66df20c-cd72-4125-a1d7-b32e48fcf037';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='6861c907-444b-4869-bb56-b8eb05de6d07' AND jockey_titular_id='70907ee8-7c1b-45d6-9821-d55f344c05a6';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='8aa123a0-9778-40f0-8478-50475845a6cb' AND jockey_titular_id='5c1d5e54-7f0b-4730-9d77-def5724c3c60';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='db516afe-2326-4a58-be0f-70cc06913bcc' AND jockey_titular_id='005caa02-fc91-45b3-9ae6-6f55d989fa2e';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='a3672b92-081a-4c7c-948b-9b1983204673' AND jockey_titular_id='0bbe6666-bdf5-446b-8ee2-5279eafdc844';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='f325ae40-9fbf-4b53-802a-76b4b78227ed' AND jockey_titular_id='2e3428cb-be99-4c91-9b99-13c3b499e147';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='cda7b037-4721-4033-99f2-591e7e19669e' AND jockey_titular_id='4bebf74b-b607-430f-92dc-342cec22d0e7';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='c767b98c-1b03-4abf-903a-e85285936754' AND jockey_titular_id='01b92e06-41df-4d25-9aa6-268b4fdffdbc';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='730f3e33-d237-4b68-a891-5af8bef7fbbf' AND jockey_titular_id='01b92e06-41df-4d25-9aa6-268b4fdffdbc';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='1a12730c-ce33-465c-be73-3ba0f0976ce5' AND jockey_titular_id='0b2c6b27-3343-4e7f-b4f7-c0674e225466';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='5a8eeb44-bbf7-4c5a-bddb-724464206680' AND jockey_titular_id='654dc3ea-5c90-46cd-a579-eb0efa3bd1c0';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='34abb6b9-8992-4403-8935-98574051fa82' AND jockey_titular_id='a66df20c-cd72-4125-a1d7-b32e48fcf037';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='9c618243-c86e-41ec-a849-6e6dd00e9a1f' AND jockey_titular_id='a249ea0d-0b5c-4fbb-ad14-f4e9e1f6bb01';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='f82f4462-c9d3-4ee7-ab1b-6b8b6f059df1' AND jockey_titular_id='005caa02-fc91-45b3-9ae6-6f55d989fa2e';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='ac5a8b2d-9de0-4076-bcbb-9b7287d09579' AND jockey_titular_id='17ea2904-ce23-4ba1-94be-202b1f62eb50';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='a08dead5-2fd3-4ff1-9a08-d9fb2b346404' AND jockey_titular_id='0b2c6b27-3343-4e7f-b4f7-c0674e225466';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='ea96ff0f-3002-4540-9c9e-1f521a484214' AND jockey_titular_id='484361c0-abb5-41af-b20e-3090535cb075';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='022327d3-0017-4e07-9beb-10f4ab70c74a' AND jockey_titular_id='01b92e06-41df-4d25-9aa6-268b4fdffdbc';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='9e14fb38-e903-4468-9342-bc91590c20d9' AND jockey_titular_id='654dc3ea-5c90-46cd-a579-eb0efa3bd1c0';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='e19a9674-2ea6-4394-8a85-43c8bc32c279' AND jockey_titular_id='0b2c6b27-3343-4e7f-b4f7-c0674e225466';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='5f75b822-4afd-46d3-b8d6-1aef68e7238f' AND jockey_titular_id='7dcddbdb-52dc-4f56-8010-0fc8a5de9dcb';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='1cdac0b9-e71f-4f45-b4c9-81ae155bd3be' AND jockey_titular_id='4bebf74b-b607-430f-92dc-342cec22d0e7';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='20b80f1f-2f28-4a9f-8ea2-a0a1850063d3' AND jockey_titular_id='70907ee8-7c1b-45d6-9821-d55f344c05a6';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='db0074d9-f900-4a91-b432-80376980433b' AND jockey_titular_id='01b92e06-41df-4d25-9aa6-268b4fdffdbc';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='9141f32e-2f9a-4410-b9f6-c07bc5115ae3' AND jockey_titular_id='b3072f82-9d29-4d61-8e0b-98a606cf2f02';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='7fbbd8b1-24e8-4fe9-beee-09df6e51a4a5' AND jockey_titular_id='005caa02-fc91-45b3-9ae6-6f55d989fa2e';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='e9b3e921-fea8-4347-a04f-a41d37d283e7' AND jockey_titular_id='a66df20c-cd72-4125-a1d7-b32e48fcf037';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='cafc4989-c618-4fa9-bad2-d3343c75ce65' AND jockey_titular_id='6d3129b7-42ef-40e3-976e-325b5d7a8c28';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='f8daf95e-487a-4b47-98a0-489b32d8beff' AND jockey_titular_id='8c358b73-8d01-4293-9ac8-0f4d44f535f6';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='d7b909c5-2b92-4985-b3f3-1610a715223d' AND jockey_titular_id='005caa02-fc91-45b3-9ae6-6f55d989fa2e';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='1a281704-ea1c-4115-9b26-7f274ce4439f' AND jockey_titular_id='2e3428cb-be99-4c91-9b99-13c3b499e147';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='57a87d37-fdd0-45be-a905-c0a128518d10' AND jockey_titular_id='70907ee8-7c1b-45d6-9821-d55f344c05a6';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='24cae834-69c6-4b1d-9c6d-d1f5cad50af8' AND jockey_titular_id='674157cf-9393-419e-bf50-0881802b785e';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='615e796b-6c0e-4b2f-b0e0-0a822fd1c442' AND jockey_titular_id='b4727bd1-9808-40cf-8467-772c4a8b8539';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='d4b7577d-e5c8-4fda-9cdb-fdd91ec3606e' AND jockey_titular_id='005caa02-fc91-45b3-9ae6-6f55d989fa2e';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='7e510b9b-0e1f-4d29-98ed-b67aaacade4a' AND jockey_titular_id='8c358b73-8d01-4293-9ac8-0f4d44f535f6';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='dc3ba066-b75f-46c9-a050-c90b0499540f' AND jockey_titular_id='8c358b73-8d01-4293-9ac8-0f4d44f535f6';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='d7c88975-b03c-4b2b-bb62-eca77ccddd5a' AND jockey_titular_id='f67ec948-8793-444d-8951-8ea821e30dda';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='8b1fb329-aac9-4ccb-81bc-ccd74e50211f' AND jockey_titular_id='9a8af6b4-afeb-4dbb-b7a4-5399e0cd9de9';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='6634e27e-57c9-4070-ac5b-0b79aa2ef22a' AND jockey_titular_id='70907ee8-7c1b-45d6-9821-d55f344c05a6';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='6632e8d1-20da-41a6-b745-7a6ee6066c93' AND jockey_titular_id='654dc3ea-5c90-46cd-a579-eb0efa3bd1c0';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='17ab6239-319a-4c4a-8e08-a082bfe9ed57' AND jockey_titular_id='0b2c6b27-3343-4e7f-b4f7-c0674e225466';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='699d7bb0-8c61-48ea-b5cc-ed0242058df3' AND jockey_titular_id='8c358b73-8d01-4293-9ac8-0f4d44f535f6';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='79ee695c-dd71-42d2-a9aa-3da619939599' AND jockey_titular_id='01b92e06-41df-4d25-9aa6-268b4fdffdbc';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='6a5e46b6-9043-4c6b-a0fa-2bfb2b7e2c32' AND jockey_titular_id='2e3428cb-be99-4c91-9b99-13c3b499e147';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='2360f43d-b2e8-4b72-8513-d05d7a713d0a' AND jockey_titular_id='01b92e06-41df-4d25-9aa6-268b4fdffdbc';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='b49c637e-d83d-49a1-b6d0-b67ce458365d' AND jockey_titular_id='a66df20c-cd72-4125-a1d7-b32e48fcf037';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='83428fca-fccf-4cc6-8c08-523c6460fdb0' AND jockey_titular_id='0bbe6666-bdf5-446b-8ee2-5279eafdc844';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='fa324608-72c1-4a43-8d59-084d3404fc80' AND jockey_titular_id='005caa02-fc91-45b3-9ae6-6f55d989fa2e';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='0d0951c4-a532-4c2a-9c9e-47c9da081546' AND jockey_titular_id='654dc3ea-5c90-46cd-a579-eb0efa3bd1c0';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='1ec69573-5373-431c-a2a4-15002885f32f' AND jockey_titular_id='7dcddbdb-52dc-4f56-8010-0fc8a5de9dcb';
UPDATE inscripciones SET jockey_titular_id=NULL WHERE id='07f8b7a5-aaec-465e-8eed-14d782d22448' AND jockey_titular_id='9c03f925-0272-4ba6-95c7-e71fad20f63d';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='01a41f66-8932-4d43-8fac-92ced690a91f' AND entrenador_id='05d9fbb6-33d0-4d68-8d03-2d34376cb6b5';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='34c977b7-c5ab-4737-a016-0d99a4018f2e' AND entrenador_id='85a69b69-603f-4028-8f95-f2dbe2dd70e1';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='e7d7e085-286a-4f7a-8623-2b5237b2be4f' AND entrenador_id='2471b028-3498-4245-9b34-6ed4bcbbed0c';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='060436fe-f0cf-42d5-b712-b94109a919dd' AND entrenador_id='67cfb6f0-3a53-45d3-aba8-76594750bfb7';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='8a22eb45-2244-40e6-8e73-e2a6106231cc' AND entrenador_id='f98b78be-13b3-40e0-b1d4-b0c9dfb221c2';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='3e5f0a35-f2ba-4e52-a857-4671efe65508' AND entrenador_id='f98b78be-13b3-40e0-b1d4-b0c9dfb221c2';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='35aaf81f-ce6e-4a84-b371-cf2e1502cc76' AND entrenador_id='7e2d0cf0-d94d-47a8-ad1b-0e88f15bd005';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='316fb581-3e10-442b-ac85-2e47c8850a99' AND entrenador_id='65cd87b3-9945-432d-9e90-a87737237bfc';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='4f3cb8d5-cf3e-48f5-a8e3-5ac4795c8654' AND entrenador_id='18226f63-ff38-4d50-be4e-b8d0a5889f8e';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='23ce0134-3db7-4549-a39f-a710e473acb4' AND entrenador_id='405ba68e-78e0-40ca-bc3c-a06c60f11659';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='2467e8af-8e59-41b0-a350-66380f665e6f' AND entrenador_id='93c8d7d6-5977-4bef-88fc-939d3668d94b';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='bd87c196-2e9c-4809-b6b3-c3cb07c28ec6' AND entrenador_id='05d9fbb6-33d0-4d68-8d03-2d34376cb6b5';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='f5a9b457-d2e6-4a99-950a-3c0808d649b4' AND entrenador_id='67cfb6f0-3a53-45d3-aba8-76594750bfb7';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='addc3bd4-67c9-4935-8afe-f402bf1d4afd' AND entrenador_id='9bbc8647-7737-4bf5-b027-c105de8ea690';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='d756de1a-9723-455b-a9a2-17aa26fd7961' AND entrenador_id='5e625dc3-8336-4fbe-9669-c6dd00f91dbc';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='117668fd-cad5-4004-8e6d-a268615a3b62' AND entrenador_id='5e625dc3-8336-4fbe-9669-c6dd00f91dbc';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='07d3830c-884d-4122-a246-2850cde12763' AND entrenador_id='87bc872c-a460-494c-8bb1-3e1064c2afb1';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='eccae519-b127-4270-8213-214f8b75057a' AND entrenador_id='3c973f57-4163-4e78-b7e1-cca4885d787f';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='b15c9cae-6d58-41a4-82f5-7642b95f9ffa' AND entrenador_id='85a69b69-603f-4028-8f95-f2dbe2dd70e1';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='c91777f8-e2c4-4f46-b1b7-61fbcb419d04' AND entrenador_id='2ca89d1c-2bb5-49a7-98ac-13a25594b13c';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='f12095ad-c52f-480c-8eaf-aedb3f30653b' AND entrenador_id='2fd211ae-c5f6-4b52-bb43-ba98f4f59b8d';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='a91a1752-8878-4cd7-8ab2-4ffab74b71e5' AND entrenador_id='f98b78be-13b3-40e0-b1d4-b0c9dfb221c2';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='968e3944-cc8b-4c27-b159-92d758f9e01f' AND entrenador_id='ffca6c03-4259-4d92-8479-66c7c6aa8eca';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='7e820a9b-a162-442c-9e74-ee4aca7d898d' AND entrenador_id='de1252b1-a852-4993-9a2f-c13347459c7a';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='e5a55bae-c79c-4e7b-bb29-d388a614222e' AND entrenador_id='fc3388a1-f62a-4203-aee5-5daa883608f4';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='5f066fbc-3cff-453f-8ce1-11ba86413c88' AND entrenador_id='2ca89d1c-2bb5-49a7-98ac-13a25594b13c';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='e4902e8b-efe5-480d-8efe-92296e054eba' AND entrenador_id='2fd211ae-c5f6-4b52-bb43-ba98f4f59b8d';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='974dd95e-5be6-4272-a532-42cc96cc462c' AND entrenador_id='fcb5ab70-db5b-486e-9b6d-33bff5f7092c';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='ff5b084a-2f0c-4b87-86ac-de1898661438' AND entrenador_id='87bc872c-a460-494c-8bb1-3e1064c2afb1';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='766f1538-0ca2-4f64-8b68-8dfd77f04e7d' AND entrenador_id='405ba68e-78e0-40ca-bc3c-a06c60f11659';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='72182c04-6b28-4c1a-a90a-389411c7c866' AND entrenador_id='405ba68e-78e0-40ca-bc3c-a06c60f11659';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='6861c907-444b-4869-bb56-b8eb05de6d07' AND entrenador_id='93c8d7d6-5977-4bef-88fc-939d3668d94b';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='8aa123a0-9778-40f0-8478-50475845a6cb' AND entrenador_id='a43afaee-e5b1-4960-be27-27a345e03ffe';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='db516afe-2326-4a58-be0f-70cc06913bcc' AND entrenador_id='67cfb6f0-3a53-45d3-aba8-76594750bfb7';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='f325ae40-9fbf-4b53-802a-76b4b78227ed' AND entrenador_id='7b68e043-6832-4ee3-89f1-8d71dbb16785';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='cda7b037-4721-4033-99f2-591e7e19669e' AND entrenador_id='78267be2-396a-470f-936f-a9e4238b9eb1';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='1a12730c-ce33-465c-be73-3ba0f0976ce5' AND entrenador_id='ea01ca82-aa48-4895-bc8f-9701ca24b120';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='5a8eeb44-bbf7-4c5a-bddb-724464206680' AND entrenador_id='6b159718-dd90-4512-bd06-72de2c20ab33';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='9c618243-c86e-41ec-a849-6e6dd00e9a1f' AND entrenador_id='fc3388a1-f62a-4203-aee5-5daa883608f4';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='f82f4462-c9d3-4ee7-ab1b-6b8b6f059df1' AND entrenador_id='87bc872c-a460-494c-8bb1-3e1064c2afb1';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='6e27a694-8b41-49f3-9706-4e0e226d606b' AND entrenador_id='405ba68e-78e0-40ca-bc3c-a06c60f11659';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='a370bfc3-329f-4c4d-b6af-bddb0760d881' AND entrenador_id='a8d0e58a-1024-4555-834e-3b931ce577b3';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='e82c8b4c-2754-483b-a528-6b532bf90d0c' AND entrenador_id='a8d0e58a-1024-4555-834e-3b931ce577b3';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='d21f589c-2ef1-45eb-b3b8-8b180680e861' AND entrenador_id='280c3aab-1728-4472-8049-3d87e08234d7';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='cae36d76-2711-4959-a733-08510b933b07' AND entrenador_id='8c041b7b-022f-44d4-a1a2-057a139af46c';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='a08dead5-2fd3-4ff1-9a08-d9fb2b346404' AND entrenador_id='81973a09-9d84-4946-bc5c-b6dae0870841';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='022327d3-0017-4e07-9beb-10f4ab70c74a' AND entrenador_id='fe884181-0da8-49ad-8a84-f015045bc781';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='9e14fb38-e903-4468-9342-bc91590c20d9' AND entrenador_id='2fd211ae-c5f6-4b52-bb43-ba98f4f59b8d';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='e19a9674-2ea6-4394-8a85-43c8bc32c279' AND entrenador_id='ea01ca82-aa48-4895-bc8f-9701ca24b120';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='5f75b822-4afd-46d3-b8d6-1aef68e7238f' AND entrenador_id='f98b78be-13b3-40e0-b1d4-b0c9dfb221c2';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='1cdac0b9-e71f-4f45-b4c9-81ae155bd3be' AND entrenador_id='78267be2-396a-470f-936f-a9e4238b9eb1';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='20b80f1f-2f28-4a9f-8ea2-a0a1850063d3' AND entrenador_id='18c48e90-4496-4381-9f73-b4d474b6c229';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='db0074d9-f900-4a91-b432-80376980433b' AND entrenador_id='fe884181-0da8-49ad-8a84-f015045bc781';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='c253de99-fef7-413f-bfd1-7449e6b919cb' AND entrenador_id='d5cbf776-34d1-47d8-809a-16ae181968d1';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='7fbbd8b1-24e8-4fe9-beee-09df6e51a4a5' AND entrenador_id='8528087d-ff46-45ac-9226-9e043cab39fb';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='d7b909c5-2b92-4985-b3f3-1610a715223d' AND entrenador_id='2471b028-3498-4245-9b34-6ed4bcbbed0c';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='b9263dff-46da-4c92-8436-18971fe9c10f' AND entrenador_id='78267be2-396a-470f-936f-a9e4238b9eb1';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='1a281704-ea1c-4115-9b26-7f274ce4439f' AND entrenador_id='ffca6c03-4259-4d92-8479-66c7c6aa8eca';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='9c4fa3c2-12d3-4131-aab8-4fac28f0f7cb' AND entrenador_id='1f46b478-5edf-4cb5-be36-957d7fec99d3';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='57a87d37-fdd0-45be-a905-c0a128518d10' AND entrenador_id='4740724a-42d9-4fb5-a6de-afa9473bc8da';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='24cae834-69c6-4b1d-9c6d-d1f5cad50af8' AND entrenador_id='de1252b1-a852-4993-9a2f-c13347459c7a';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='6cda9b4a-fb9a-4877-a222-834712cbeada' AND entrenador_id='a88d874a-a5a7-4037-8573-050fb9470f35';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='d4b7577d-e5c8-4fda-9cdb-fdd91ec3606e' AND entrenador_id='87bc872c-a460-494c-8bb1-3e1064c2afb1';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='7e510b9b-0e1f-4d29-98ed-b67aaacade4a' AND entrenador_id='405ba68e-78e0-40ca-bc3c-a06c60f11659';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='d7c88975-b03c-4b2b-bb62-eca77ccddd5a' AND entrenador_id='f195e041-d239-43f1-af58-af1dc5128c2d';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='8b1fb329-aac9-4ccb-81bc-ccd74e50211f' AND entrenador_id='77c12f49-2986-47e1-991c-bc945659a2ac';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='6634e27e-57c9-4070-ac5b-0b79aa2ef22a' AND entrenador_id='2471b028-3498-4245-9b34-6ed4bcbbed0c';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='6632e8d1-20da-41a6-b745-7a6ee6066c93' AND entrenador_id='9bbc8647-7737-4bf5-b027-c105de8ea690';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='17ab6239-319a-4c4a-8e08-a082bfe9ed57' AND entrenador_id='81973a09-9d84-4946-bc5c-b6dae0870841';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='6a5e46b6-9043-4c6b-a0fa-2bfb2b7e2c32' AND entrenador_id='f9d75926-c185-46e7-88c7-075433ab4972';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='fa324608-72c1-4a43-8d59-084d3404fc80' AND entrenador_id='77c12f49-2986-47e1-991c-bc945659a2ac';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='0d0951c4-a532-4c2a-9c9e-47c9da081546' AND entrenador_id='2471b028-3498-4245-9b34-6ed4bcbbed0c';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='53cddf30-0123-457b-b698-387b646cfa4f' AND entrenador_id='b75cbb70-4f43-41f7-961e-d66a6ccb5eb3';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='1ec69573-5373-431c-a2a4-15002885f32f' AND entrenador_id='f98b78be-13b3-40e0-b1d4-b0c9dfb221c2';
UPDATE inscripciones SET entrenador_id=NULL WHERE id='dd0a126e-12d4-4d5c-988e-c1ac79b36d59' AND entrenador_id='d5cbf776-34d1-47d8-809a-16ae181968d1';
COMMIT;
```