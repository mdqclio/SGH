# FASE 3 — Carga de 74 SPCs faltantes (Reunión 2026-06-20, Dolores)

- **Fecha**: 2026-06-12
- **Fuente**: `data/studbook_faltantes_20j.json` (scrape read-only de www.studbook.org.ar) + re-fetch de 5 ambiguos
- **Tabla afectada**: `spcs` (única) — SPCs globales (`club_id=NULL`)
- **Conteo**: spcs 66 → 140 (+74)
- **Insertados**: 74 · **Saltados (dedup case-insensitive ñ/acentos)**: 0
- **Origen**: 67 match exacto + 5 ambiguos resueltos al candidato de fecha reciente + 2 nombres corregidos por Fede (2026-06-12)

## Mapeo aplicado (idéntico a `studbook_26_insert_report.md`)
- `nombre` = nombre (mayúsculas) · `sexo` = lower(Macho→macho / Hembra→hembra)
- `fecha_nacimiento` = YYYY-MM-DD · `color` = pelaje · `pais_origen` = pais
- `padrillo_nombre` = padre · `madre_nombre` = madre
- `abuela_materna` = NULL (el "por X" es abuelo materno/damsire → va en notas)
- `registro_stud_book` = NULL (id SB va en notas)
- `club_id` / `caballeriza_id` / `entrenador_id` = NULL · `estado` = 'activo'
- `notas` = "SB id=<id> · <url> · microchip <mc o -> · criador <criador> · abuelo materno (damsire): <damsire>"

## Insertados — exactos (67)

| nombre | spc_id | sexo | fecha_nacimiento | SB id |
|---|---|---|---|---|
| AFRICUM | acd956c5-4464-4e49-8c58-9b42bab741e9 | macho | 2020-09-27 | 424106 |
| ARMOÑOZO | c1b66c74-473b-4c61-9239-7f475f2ac62b | macho | 2023-09-02 | 450644 |
| ASTUTO NOTES | 045409b7-bbd1-4b59-8335-c268d733b448 | macho | 2022-10-13 | 439094 |
| BABY PARADISE | d76cc137-b0be-4470-9003-a49ae4ee3458 | hembra | 2019-10-08 | 417843 |
| BAM BAM HITS | 00672983-e5e1-471f-8d54-59f924dce9a5 | macho | 2022-09-24 | 436816 |
| BUEN DURAZNO | 4054f0d0-38a1-4af4-96ca-6ae4b8c0c668 | macho | 2018-09-22 | 410081 |
| BUEN MANUEL | 2fe642e4-899c-4d24-8e6b-2a650ee87b84 | macho | 2021-09-20 | 429444 |
| CALAVERIANDO | 4400ad90-c4df-4c41-bebe-0dc66f897887 | macho | 2022-09-21 | 437575 |
| CARRIGAN FITZ | 3b58d125-5cf1-4372-ba6d-5965aed44593 | hembra | 2023-07-19 | 445303 |
| CHAMPION GOLDEN | de7886a7-f71a-4421-a299-6a1cde46edfc | macho | 2022-11-06 | 439350 |
| CHINITA SALTEÑA | f3b5ea21-49c9-44ff-a317-3fc5da91bf1c | hembra | 2021-08-01 | 427240 |
| CLAIRE CHUCK | 90bf9216-43fa-4c19-9bfd-fceebedb1237 | macho | 2021-07-30 | 427383 |
| CRAZY RABID | 685bf933-b6e8-4b00-9759-c73144106a21 | macho | 2020-09-23 | 426382 |
| DARIN | 7797feb5-deff-414c-96ce-135d9c1b1058 | macho | 2019-08-13 | 414133 |
| DESTINADO JOHAN | 3f62772e-1dce-44cc-a028-e9c7493f4812 | macho | 2020-09-07 | 424261 |
| DOCTOR SKY | e5b66d8e-adb2-40a5-ac02-22bc6aacb3f7 | macho | 2022-10-25 | 438390 |
| DOCTORA APASIONADA | 95a9e41a-ed43-4581-9acf-c6c3e83017f3 | hembra | 2023-09-29 | 445105 |
| DOCTORA MIA | f6a0a429-938c-4f1b-bb69-f86844ffe872 | hembra | 2022-10-26 | 438806 |
| DOLAR JOHAN | cfe2802c-afb1-49aa-afc7-e6ed5c8be70a | macho | 2019-07-14 | 413397 |
| ECHO IN THE SKY | 25ba7fcc-c8f1-4653-b1b3-ed8bb2327301 | macho | 2020-10-08 | 422036 |
| EMMOZONITO | 54f683ba-8ad9-4158-b0f8-de19c09f4b77 | macho | 2020-08-10 | 420455 |
| ESCUCHAR TU VOZ | f17f49f0-6ad3-4a2a-bdee-f15b44425dae | hembra | 2019-08-22 | 414782 |
| ESTAS A TIEMPO | f69e6942-5686-4746-9001-a24515651573 | hembra | 2022-11-02 | 440042 |
| EVER AHEAD | 42f5fe13-39ae-48e2-961f-8e00c80e23a9 | macho | 2022-09-06 | 436754 |
| FALAYS | fb319df9-eaa7-4833-9239-611b694d715b | macho | 2021-10-26 | 430284 |
| FURIA ENCANTADA | bfb697af-0a73-4c53-a387-3a851ea9bb2f | hembra | 2020-07-03 | 420265 |
| FURIOSO ON | 50364813-85b5-4510-9f62-4a2a0b766abb | macho | 2020-09-24 | 423143 |
| GINIYA GOOD | e6aae323-233e-4812-8fcc-492e16449322 | macho | 2019-09-29 | 417115 |
| GOIAS GREEN | f2f97127-9bf9-414b-ad3d-8707a73d6e7f | macho | 2021-10-05 | 430130 |
| GRAND VUELTERA | e1b371d4-4326-4ebb-976d-81a016538cb6 | hembra | 2020-11-10 | 426177 |
| GRILLADA RYE | dec9fe8d-4671-4689-91f5-b2df01d67a66 | hembra | 2019-11-12 | 425955 |
| INDIO VALIDO | e9861c14-8f9f-4098-9bd5-11249450747e | macho | 2021-10-28 | 430478 |
| IX GOAL TUN | 49abdb5b-f3cd-48cd-b535-a1db6cf24884 | hembra | 2018-07-29 | 410369 |
| KRISTALINA | 740b8473-6f07-4419-b480-ac69c1f4b0d2 | hembra | 2021-11-11 | 432338 |
| KUCCINI | cc8e4e35-b7ae-4624-9e6b-1138e1a4dfbc | macho | 2022-07-28 | 435333 |
| LA DIVERTENTE | cc1d70a1-3b58-4185-b6d5-20f911bc3365 | hembra | 2020-07-27 | 421232 |
| LA NOUBITA | 8c1ff6e9-bf5f-44af-81ab-4ab51907c350 | hembra | 2021-09-23 | 432757 |
| LA SENTADA | 37eb7f3f-5753-4716-b6ca-28c011f64493 | hembra | 2022-09-13 | 437485 |
| LATIN PRESUMIDA | 96b0686d-1496-4e1b-af70-b2fc9c8392d9 | hembra | 2020-12-08 | 423631 |
| LATIN RAIN | 7f3c0dd5-c13c-4dcd-b2f7-16dab0f4c49c | hembra | 2021-10-22 | 432773 |
| LE BIRD | e956c550-3235-4c71-972e-d29d378cb75b | macho | 2021-10-04 | 429634 |
| LOCA DUBAI | 83dca3e3-bbce-4c5f-9d0e-2fa5ce0d5967 | hembra | 2022-11-06 | 439044 |
| LOCO FUN | 367c4b09-f4ff-4cc4-a789-086a9940a53f | macho | 2018-11-09 | 410711 |
| LUMIN | 19c4b222-8dea-4ad6-8192-f823df4c8c02 | macho | 2021-11-07 | 432890 |
| MAESTRO DE ARMAS | f260bc98-5730-4daf-9374-1125034f5238 | macho | 2021-10-26 | 431660 |
| NOCHE EN VELA | 5cee9e5a-91be-4e3d-85f2-c82f77add2a8 | hembra | 2022-07-28 | 435077 |
| PAULINA KEY | 72c35acb-95fc-451d-b2da-2c49cbc3cd4e | hembra | 2022-09-14 | 438718 |
| PORTEÑO Y BAILARIN | de84352b-58e5-4061-98dd-4ee4aad9adf5 | macho | 2021-08-03 | 433230 |
| QUE TAL OREJA | 8871fd1f-28d2-4527-a3bc-0783c4cc3aff | macho | 2020-10-25 | 425484 |
| QUIET GAUCHO | d4281015-6b5c-481f-98f0-ee0de274a0fa | macho | 2020-09-23 | 425716 |
| QUIET SANTINA | 0615510e-759a-4dbf-a572-f3eccdc4224c | hembra | 2023-10-05 | 445487 |
| REY DE PILA | 5f94e992-1033-4078-81aa-1f822bb6ecc7 | macho | 2021-10-14 | 430421 |
| SANTA LISA | ff8c8e60-b8bb-4533-9b71-ae7a04fb6088 | hembra | 2021-10-10 | 432707 |
| SANTA PACIENCIA | aa05ad47-0ca4-41a1-ae6c-2cd78d7e799c | hembra | 2023-08-06 | 442436 |
| SEMBRADOR CHUCK | b2110a1e-8692-44aa-b53a-68073be4a4f9 | macho | 2020-09-29 | 424248 |
| SIEMPREHAYESPERANZA | d36b0b52-370b-435a-bcb3-505dde9ae3bc | hembra | 2022-09-07 | 438279 |
| SIGO VIAJE | a963f167-637e-45ab-9de1-aa8c12037a2d | macho | 2016-07-29 | 358691 |
| TAHYI TAROVA | 18400237-617f-4a9d-9510-3de67c3e8a2b | macho | 2020-10-21 | 423599 |
| TATA FOOT | 028ed453-bafe-491b-afe1-8aa93e56f675 | macho | 2021-08-30 | 428851 |
| TATI SONG | 185f5edf-5430-4290-b1d8-4bb21eef468d | hembra | 2022-07-02 | 434924 |
| THE SULTAN | c4d8456e-8d62-4d97-b689-3455301b4fac | macho | 2022-10-25 | 439817 |
| TOY BOY | a467ce50-8173-44c7-bbb2-e07b45cd59ed | macho | 2021-10-28 | 433093 |
| TURRON KEY | b794be92-40d3-43d1-b042-534ec765ee96 | macho | 2021-09-25 | 433948 |
| UNBOTHERED | 517466e5-0b19-4eca-9a80-2842ba49a745 | macho | 2022-07-31 | 434645 |
| VISION SECURITY | 2916cc0f-b181-4138-8f55-ec028e48228c | macho | 2022-10-08 | 438837 |
| YO SOY TANGO | 67db5702-1886-4128-88fa-55e8a002cbf2 | macho | 2022-10-17 | 438802 |
| YUKINA | 082a1320-bf09-4a24-9f77-401fd1cbfe02 | hembra | 2021-10-29 | 433306 |

## Insertados — ambiguos resueltos al más reciente (5)

Cada nombre tenía varios SP homónimos en el SB; se eligió el de nacimiento reciente (los descartados son de décadas atrás).

| nombre | spc_id | sexo | fecha ELEGIDA | fecha(s) homónimo DESCARTADO |
|---|---|---|---|---|
| CIUDAD REAL | be1c180a-d524-4429-82af-a59ad94165c7 | hembra | 2022-09-07 | 1984-11-05, 1967-11-02 |
| DESDEN | 25fafcd8-4d87-4a84-b9d1-cf7c82564205 | macho | 2022-08-01 | 1981-10-10, 1979-03-16 |
| LA ALFARERA | 7e1204e3-5610-4062-a761-92fbbc561dab | hembra | 2021-09-14 | 1997-09-22 |
| MI ILUSION | 54f25bff-70d0-4cdc-8076-307f20f762be | hembra | 2020-10-26 | 1982-09-23, 1949-01-01 |
| TIRSO | e08e7cd3-e462-4778-a42d-0fbe859ec0ef | macho | 2023-10-06 | 1981-01-01 |

## Insertados — nombres corregidos por Fede 2026-06-12 (2)

Planilla traía el nombre mal escrito; Fede confirmó la grafía real. Sanity check de sexo/edad vs categorías de la reunión: ✅ ambos cuadran. `notas` incluye "en planilla figura como <nombre mal escrito>".

| nombre real | spc_id | sexo | fecha_nacimiento | SB id | en planilla | sanity check |
|---|---|---|---|---|---|---|
| QUEEN OF HEARTS | afb74456-39cc-46ed-aabf-ecc9c0ccf8f3 | hembra | 2022-07-05 | 435064 | QUEEN OF HEART | "3 y 4 años": 3 años + hembra ✓ (homónimos 1984/1969 descartados) |
| HEART OF GOLD | 8e72a714-8599-4ec2-afa1-2186730ca18c | macho | 2021-11-24 | 432334 | HEART OR GOLD | "machos / 3 y 4 años": 4 años + macho ✓ (homónimo H 1997 descartado) |

## NO insertados — 2 pendientes (sin grafía confirmada)

| planilla | más parecido en SB | lectura |
|---|---|---|
| L A RODESIA | —sin candidatos— | espaciado roto (¿LA RODESIA?) |
| TALENTOSA CACH | —sin candidatos— | apócope (¿TALENTOSA CACHO/CACHA?) |

Acción: confirmar grafía con Fede/planilla antes de re-scrapear e insertar.

> Resueltos 2026-06-12: QUEEN OF HEART → QUEEN OF HEARTS y HEART OR GOLD → HEART OF GOLD (ver sección anterior).

## Rollback

```sql
DELETE FROM spcs WHERE id IN (
  'acd956c5-4464-4e49-8c58-9b42bab741e9','c1b66c74-473b-4c61-9239-7f475f2ac62b',
  '045409b7-bbd1-4b59-8335-c268d733b448','d76cc137-b0be-4470-9003-a49ae4ee3458',
  '00672983-e5e1-471f-8d54-59f924dce9a5','4054f0d0-38a1-4af4-96ca-6ae4b8c0c668',
  '2fe642e4-899c-4d24-8e6b-2a650ee87b84','4400ad90-c4df-4c41-bebe-0dc66f897887',
  '3b58d125-5cf1-4372-ba6d-5965aed44593','de7886a7-f71a-4421-a299-6a1cde46edfc',
  'f3b5ea21-49c9-44ff-a317-3fc5da91bf1c','90bf9216-43fa-4c19-9bfd-fceebedb1237',
  '685bf933-b6e8-4b00-9759-c73144106a21','7797feb5-deff-414c-96ce-135d9c1b1058',
  '3f62772e-1dce-44cc-a028-e9c7493f4812','e5b66d8e-adb2-40a5-ac02-22bc6aacb3f7',
  '95a9e41a-ed43-4581-9acf-c6c3e83017f3','f6a0a429-938c-4f1b-bb69-f86844ffe872',
  'cfe2802c-afb1-49aa-afc7-e6ed5c8be70a','25ba7fcc-c8f1-4653-b1b3-ed8bb2327301',
  '54f683ba-8ad9-4158-b0f8-de19c09f4b77','f17f49f0-6ad3-4a2a-bdee-f15b44425dae',
  'f69e6942-5686-4746-9001-a24515651573','42f5fe13-39ae-48e2-961f-8e00c80e23a9',
  'fb319df9-eaa7-4833-9239-611b694d715b','bfb697af-0a73-4c53-a387-3a851ea9bb2f',
  '50364813-85b5-4510-9f62-4a2a0b766abb','e6aae323-233e-4812-8fcc-492e16449322',
  'f2f97127-9bf9-414b-ad3d-8707a73d6e7f','e1b371d4-4326-4ebb-976d-81a016538cb6',
  'dec9fe8d-4671-4689-91f5-b2df01d67a66','e9861c14-8f9f-4098-9bd5-11249450747e',
  '49abdb5b-f3cd-48cd-b535-a1db6cf24884','740b8473-6f07-4419-b480-ac69c1f4b0d2',
  'cc8e4e35-b7ae-4624-9e6b-1138e1a4dfbc','cc1d70a1-3b58-4185-b6d5-20f911bc3365',
  '8c1ff6e9-bf5f-44af-81ab-4ab51907c350','37eb7f3f-5753-4716-b6ca-28c011f64493',
  '96b0686d-1496-4e1b-af70-b2fc9c8392d9','7f3c0dd5-c13c-4dcd-b2f7-16dab0f4c49c',
  'e956c550-3235-4c71-972e-d29d378cb75b','83dca3e3-bbce-4c5f-9d0e-2fa5ce0d5967',
  '367c4b09-f4ff-4cc4-a789-086a9940a53f','19c4b222-8dea-4ad6-8192-f823df4c8c02',
  'f260bc98-5730-4daf-9374-1125034f5238','5cee9e5a-91be-4e3d-85f2-c82f77add2a8',
  '72c35acb-95fc-451d-b2da-2c49cbc3cd4e','de84352b-58e5-4061-98dd-4ee4aad9adf5',
  '8871fd1f-28d2-4527-a3bc-0783c4cc3aff','d4281015-6b5c-481f-98f0-ee0de274a0fa',
  '0615510e-759a-4dbf-a572-f3eccdc4224c','5f94e992-1033-4078-81aa-1f822bb6ecc7',
  'ff8c8e60-b8bb-4533-9b71-ae7a04fb6088','aa05ad47-0ca4-41a1-ae6c-2cd78d7e799c',
  'b2110a1e-8692-44aa-b53a-68073be4a4f9','d36b0b52-370b-435a-bcb3-505dde9ae3bc',
  'a963f167-637e-45ab-9de1-aa8c12037a2d','18400237-617f-4a9d-9510-3de67c3e8a2b',
  '028ed453-bafe-491b-afe1-8aa93e56f675','185f5edf-5430-4290-b1d8-4bb21eef468d',
  'c4d8456e-8d62-4d97-b689-3455301b4fac','a467ce50-8173-44c7-bbb2-e07b45cd59ed',
  'b794be92-40d3-43d1-b042-534ec765ee96','517466e5-0b19-4eca-9a80-2842ba49a745',
  '2916cc0f-b181-4138-8f55-ec028e48228c','67db5702-1886-4128-88fa-55e8a002cbf2',
  '082a1320-bf09-4a24-9f77-401fd1cbfe02','be1c180a-d524-4429-82af-a59ad94165c7',
  '25fafcd8-4d87-4a84-b9d1-cf7c82564205','7e1204e3-5610-4062-a761-92fbbc561dab',
  '54f25bff-70d0-4cdc-8076-307f20f762be','e08e7cd3-e462-4778-a42d-0fbe859ec0ef',
  'afb74456-39cc-46ed-aabf-ecc9c0ccf8f3','8e72a714-8599-4ec2-afa1-2186730ca18c'
);
```
