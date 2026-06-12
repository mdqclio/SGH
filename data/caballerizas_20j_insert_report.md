# Carga de caballerizas faltantes — Reunión 2026-06-20 (Dolores)

- **Fecha**: 2026-06-12
- **Motivo**: Yesica no podía guardar inscripciones por caballerizas faltantes.
- **Fuente**: planilla de 84 nombres (`data/caballerizas_20j_planilla.txt`).
- **Tabla afectada**: `caballerizas` (única). `club_id = 0649e9c5-9e87-4aad-842f-101458e6b33c` (Dolores).
- **Conteo Dolores**: 209 → **272** (+63).
- **Planilla**: 84 nombres → **21 ya existían** + **63 insertadas**. Sin duplicados en la planilla.

## Schema verificado
`caballerizas`: únicas NOT NULL sin default = `club_id` + `nombre`. Resto nullable o con default
(`activo` default true, `estado` default 'activo', `id` default uuid_generate_v4()).
Insert mínimo: `club_id`, `nombre`, `notas` (traza).

## Normalización del diff
`regexp_replace(translate(upper(btrim(x)),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNAEIOUUN'),'\s+',' ','g')`
— case-insensitive, sin tildes, espacios colapsados. **Los sufijos `(DOL)/(LP)/(TDL)/(AZ)` se conservan**
en la clave → son parte del nombre, no se fusionan.

### Dudosos resueltos (NO fusionados)
| planilla | en DB | decisión |
|---|---|---|
| `CAROSUEÑO (DOL)` | existe `CAROSUEÑO` (sin sufijo) | distinto → **insertado** |
| `EL GALPON LOBOS (DOL)` | existe `EL GALPON` | distinto → **insertado** (`EL GALPON` quedó como existente) |
| `SANTA BARBARA` | existe `SANTA BARBARA (DOL)` | distinto → **insertado** |
| `PASCUAL` | existe `DON PASCUAL` | distinto → **insertado** (`DON PASCUAL` quedó como existente) |

## 21 existentes (no se tocaron)
ABUELO CALIN, ABUELO ELDO, C&C, DON PASCUAL, EL CAPITAN, EL GALPON, EL HINDU, EL LINYE Y RAMI,
EL MANZANAR, EL VIEJO NOEL, JUANA Y JUAN, KID PELUFO RAWSON, LA FORTALEZA, LA NARCISA, LA YAMILA CELESTE,
LOS AMIGOS, LOS PERRITOS, MARIA EVA, POR TU CULPA, QUINTA IMPERIO, STUD CHICO.

## 63 insertadas (nombre tal cual planilla)
2 DE ABRIL MAIPU, AMORES MIOS, CARLITOS E, CAROSUEÑO (DOL), CRAZY HORSE, DON GIOVANNI, DON LEON, DON RAUL,
DON VALENTINO, EL CEREALERO, EL COLORADO, EL DERBY, EL DESTINO, EL DOMADOR, EL GALPON LOBOS (DOL), EL GITANO,
EL GRUÑON, EL HORNERITO CAFE, EL LALO, EL MOLINERO, EL NIETO, EL PIMPO, EL PRIMER REBUSQUE, EL VIAJANTE, EL YAYA,
ERICK (TDL), FLOR Y AGUS, GARIN CITY (LP), HARAS EL ORIGEN, JUVENTUD LP, LA BETTY (TDL), LA COLONIA, LA ENSENADA,
LA ESCUELITA LP, LA MILINGA, LA MORALEJA, LA PICHI, LA SUREÑA, LAGUNA VERDE, LOS 6 CORAZONES, LOS CATACHOS,
LOS CUERVOS, LOS MELLI, LOS MONCHITOS, MANSO EL ZORRO, MARTIN Y NICOLAS, MELINA A, MI BELLA GIULIA, MI MARTINCITO,
MI QUERIDO VIEJO, MIS VIEJOS, MONTE DEL TORDILLO, N.R.A (AZ), NEGRO T, PARAJE LA TABLADA, PASCUAL, R.E.C,
RD NECOCHEA, ROBERTITO B, SACRIFICIO, SANTA BARBARA, STUD HS LA GUILLERMINA, TRES AMIGOS (AZ).

## Rollback
```sql
DELETE FROM caballerizas WHERE id IN (
  'b562b75e-f1f8-4e6a-8d68-cbfcb2c61d5e','1eb1297a-f12f-4235-81ec-37728b21690b',
  'e50ec9f3-ed50-4513-bdfb-32f7955a5572','46cc818b-aac4-4d39-b3c9-0b0c156fc6cc',
  '65b4a9c6-360b-412b-aede-a9b223974743','de9c5157-7b6b-4cfa-bdd5-0eda799afa2d',
  '1a2bb28d-5944-46fd-86bf-e58fa443495e','022c05f1-c258-431a-a503-c511fe1dc13c',
  '14c24aca-942a-4635-99a9-6de8a2f4865c','c2c1af88-a73f-4cb2-b0f8-3d81e14b407d',
  '23cf2ee5-ddf3-4e36-977f-238003588cde','992049ab-72f7-448e-954d-e13c9ed1af2d',
  '93c99b75-ccbc-492b-ac08-7e0bc3793c3c','0ee13029-fc1c-4af0-a217-0d00e2a45c69',
  'aaa17d36-c4fd-448b-8cb5-cd2a31291c7a','aa052912-c9d2-46f7-9524-cb0dbf73a556',
  '23d53dc5-bfb6-4d8a-aa78-7a08d0360a6b','457aba56-d01f-40f7-b000-b75622c77f04',
  '66e683fb-fc36-4af8-8f12-fe27ae16b984','faa15712-a879-4f29-9543-fa96f77967f6',
  '88049e6a-bc48-477f-a6e1-5ceb6ec95433','f25e7474-cc1b-4f1c-8ba2-6209a7e055aa',
  'f3d82c4a-b719-40ba-919a-4b01ca647c04','894f5e0f-67c3-420c-9864-ac765dc8bd67',
  '82ee1f41-3587-4faa-a493-411857f81ffb','d1b5c128-dad7-447f-a09d-d026ca72c649',
  '421b837f-9978-4aaf-ad78-603456060885','7995989a-38d3-42ca-ac5c-8ba43c9209e6',
  'e664ce7c-78dd-4d1d-904b-c25cf0f92b96','2886eb79-89df-48e4-8062-397fb338e6c2',
  '31da02e7-e5c9-4982-bfff-b00dd28cfd17','559b97a6-ac5a-4d73-a160-99f8b8872756',
  'd93188cf-6aa9-48e7-bacf-3f84ef955f68','da7e286c-1aae-477a-95c5-66dc477cfd73',
  '07d88cea-8985-41d7-b0a0-430bd8475288','a91ec28f-dd35-458c-a9b3-647567590305',
  '3c72a213-7f50-40ec-b233-b0b6c7a5d05e','d5b05372-e324-4f13-9e67-b86cc2557239',
  '2954eaf7-d859-454d-a712-7d2931a48f53','a9da0600-320f-4aa9-baac-1eba3e981d7e',
  '4a5b2641-30e6-450f-92c1-b8b847d91de6','59b16f30-8b79-48c6-86c8-0d97c7eb0084',
  '1f011076-06d0-4e5f-b1cd-5dbad1602d16','c446eb38-3f40-46eb-9d1c-ee4be2c9df6b',
  '1559d760-0966-445a-afaa-8d63db0e9e87','0273b3f8-22b3-450f-b811-6c7bdd5fc5e3',
  'e9907e8b-1bcc-484b-9920-c16cd9268669','9c0c95a0-479d-4a89-9ae0-41ec5f309428',
  '77c213c6-1f59-4939-b429-2aa23cf9db26','b3c42105-0682-455b-9618-b194b0a1e099',
  'ebfe8a1b-2982-4157-aefb-01135f8382f1','01cbb031-50cd-43ed-9665-5c5bc4e7f99f',
  '470af80e-fac1-4f76-b0dd-a770f31251ce','13948689-ddfe-4127-904e-57edd56dd285',
  'fc3631c3-6ac9-475d-bd61-0a6c8ecb20a0','a00047b8-9e24-4782-a0c5-f4a74e005069',
  'eaaee1fe-8806-4afc-9fb9-94fd4d357291','c8d7cfcf-d4cd-484d-bed1-8c1527c7a7aa',
  '1474737a-3b22-4f30-80ec-cb999a5958fa','fa04eea1-aacb-4ac9-9c6f-ad2e0e490b2d',
  '1bb92f70-e651-4888-9cb5-7b2d2573ca45','e73ac251-a750-4c66-8457-f65e1d91ae4f',
  'edcc1429-30f1-44ad-a028-bac4e30c0541'
);
```
