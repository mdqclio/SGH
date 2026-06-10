# FASE 2 — Carga de 25 SPCs al Stud Book (Dolores)

- **Fecha**: 2026-06-10
- **Fuente**: `data/studbook_26.json` → array `ejemplares` (25 registros)
- **Ignorado**: LADY BLICK (NO_ENCONTRADOS)
- **Tabla afectada**: `spcs` (única) — SPCs globales (`club_id=NULL`)
- **Conteo**: spcs 40 → 65 (+25)
- **Insertados**: 25 · **Saltados (ya existían)**: 0 (dedup case-insensitive con translate ñ/acentos → 0 matches)

## Mapeo aplicado
- `nombre` = nombre (mayúsculas)
- `sexo` = lower(sexo): Macho→macho, Hembra→hembra
- `fecha_nacimiento` = fecha_nacimiento (YYYY-MM-DD)
- `color` = pelaje
- `pais_origen` = pais
- `padrillo_nombre` = padre · `madre_nombre` = madre
- `abuela_materna` = NULL (el "por X" es abuelo materno/damsire — va en notas, pendiente confirmar)
- `registro_stud_book` = NULL (pendiente formato; id va en notas)
- `club_id` / `caballeriza_id` / `entrenador_id` = NULL
- `estado` = 'activo'
- `notas` = "SB id=<id> · <url> · microchip <mc o -> · criador <criador> · abuelo materno (damsire): <abuelo_materno>"

## Flags
- ⚠️ SALVADOR EVER tiene `discrepancia_sexo_hint` en `_meta` → cargado `macho` (dato fuente). Confirmar con Fede.
- ⚠️ BACHUNA microchip = null → notas "microchip -".

## Registros insertados

| nombre | spc_id | sexo | fecha_nacimiento |
|---|---|---|---|
| ALIADO SCAT | e8934aa5-4fd6-41b0-8b91-ef41112c8f0c | macho | 2019-08-18 |
| AMIGUITO JESUS | d9d93d98-483e-4ff3-9a82-1b4e8088a5f3 | macho | 2022-07-29 |
| BACHUNA | 3529b1dc-bc09-4239-a2c1-8a3288a09f2b | hembra | 2022-11-24 |
| BELLO PRESAGIO | 66ee9d0e-2dba-4ca3-8a57-e40faed2ea47 | macho | 2021-09-10 |
| BENDITO PRESAGIO | 9e7da603-a362-483f-91a6-d492df70300e | macho | 2022-09-29 |
| CHE CARABANERA | 409b8fa5-9008-49d9-bd3b-904a0b28f8db | hembra | 2022-08-20 |
| COLONIAL JOHAN | ffc0dd8d-f198-4321-8f7c-a5241fc59daf | macho | 2021-10-15 |
| DEVIL'S KING | 8813bd53-04ad-4ad0-9562-5aaac3d7ffc1 | macho | 2018-08-17 |
| EL BORJA | cac9569b-c277-4b0c-95f1-3b7a7c36cb4b | macho | 2022-09-02 |
| EL MEJOR DUQUE | 0f40daa9-676d-4391-91ea-a543d165352c | macho | 2022-10-27 |
| ESTOY BLUE | f0ae5ca1-79e5-4b35-81c1-2d3a51409009 | macho | 2020-10-16 |
| FLORENTINA IN YOU | b52c1ecd-a9ef-4f67-b2d5-cbcad5c7d93f | hembra | 2020-11-01 |
| FREE CRY | 34423341-70bb-4f17-843e-d892c7307a4c | macho | 2021-10-03 |
| GLAM METAL | 25593578-89b4-409f-9fb2-9626cf468e3d | hembra | 2020-07-09 |
| MARUKA PLUS | cb58487f-ece8-4456-86a2-4d6557da5d25 | hembra | 2021-10-20 |
| NO TIENE CONTRAS | 5a33b6be-7002-4b96-9aee-46441ec9585d | macho | 2021-07-20 |
| QUINIELA TREND | ce3a7e24-05f0-49d5-97fa-801d4b23f37f | hembra | 2018-09-23 |
| RIDGE PRINCE | 08057815-961d-4b13-b095-43d6bd43ebb0 | macho | 2021-08-24 |
| SALVADOR EVER | 09b4b96f-2023-4c9a-b359-c92275314907 | macho | 2021-11-15 |
| SEÑOR MONCHI | 49ff5956-5aef-4b82-a950-0cdb4a28d192 | macho | 2020-09-27 |
| SOL GALANA | 2a7b3360-7a63-4fd3-a756-e864397b4ded | hembra | 2022-10-27 |
| SOY ISLEÑO | d3d9ed49-7910-436c-ba2e-1dbcf22b0e35 | macho | 2021-07-26 |
| TIMBERA IN YOU | 369c2372-d08e-451b-9a36-7d9be9bb9445 | hembra | 2022-09-03 |
| WISLA KEN | 29db5000-920f-4185-9cc7-2d310d584b78 | hembra | 2021-09-28 |
| ZETA FOOT | 2910b8d3-17a0-4e0e-bea5-4f1d6f2cf52e | macho | 2020-10-08 |

## Rollback

```sql
DELETE FROM spcs WHERE id IN (
  'e8934aa5-4fd6-41b0-8b91-ef41112c8f0c','d9d93d98-483e-4ff3-9a82-1b4e8088a5f3',
  '3529b1dc-bc09-4239-a2c1-8a3288a09f2b','66ee9d0e-2dba-4ca3-8a57-e40faed2ea47',
  '9e7da603-a362-483f-91a6-d492df70300e','409b8fa5-9008-49d9-bd3b-904a0b28f8db',
  'ffc0dd8d-f198-4321-8f7c-a5241fc59daf','8813bd53-04ad-4ad0-9562-5aaac3d7ffc1',
  'cac9569b-c277-4b0c-95f1-3b7a7c36cb4b','0f40daa9-676d-4391-91ea-a543d165352c',
  'f0ae5ca1-79e5-4b35-81c1-2d3a51409009','b52c1ecd-a9ef-4f67-b2d5-cbcad5c7d93f',
  '34423341-70bb-4f17-843e-d892c7307a4c','25593578-89b4-409f-9fb2-9626cf468e3d',
  'cb58487f-ece8-4456-86a2-4d6557da5d25','5a33b6be-7002-4b96-9aee-46441ec9585d',
  'ce3a7e24-05f0-49d5-97fa-801d4b23f37f','08057815-961d-4b13-b095-43d6bd43ebb0',
  '09b4b96f-2023-4c9a-b359-c92275314907','49ff5956-5aef-4b82-a950-0cdb4a28d192',
  '2a7b3360-7a63-4fd3-a756-e864397b4ded','d3d9ed49-7910-436c-ba2e-1dbcf22b0e35',
  '369c2372-d08e-451b-9a36-7d9be9bb9445','29db5000-920f-4185-9cc7-2d310d584b78',
  '2910b8d3-17a0-4e0e-bea5-4f1d6f2cf52e'
);
```
