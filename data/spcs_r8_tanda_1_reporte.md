# R8 — tanda 1: alta de SPCs, reporte de casos

- Nombres pedidos por Yesi: **27**
- Altas propuestas: **12**
- Casos que vuelven a Yesi: **15**
- Snapshot de `spcs` usado: 144 filas

Nada fue ejecutado contra la base. Los INSERTs están en `migrations/spcs_r8_tanda_1.sql` y esperan OK.

## Altas propuestas

| pedido | nombre SB | sb_id | nac | sexo | pelaje | padre | madre | alertas |
|---|---|---|---|---|---|---|---|---|
| SI TIN | SI TIN | 446891 | 2023-10-07 | macho | Alazan | Il Mercato | Sobra Fe | — |
| ELSEPTIMOESDECALDERA | ELSEPTIMOESDECALDERA | 440489 | 2022-10-27 | macho | Zaino Colorado | Presagio Key | La Dama Alada | — |
| TOUCH OF BLUE | TOUCH OF BLUE | 441094 | 2022-10-30 | hembra | Zaino | Heliostatic (IRE) | Honradeza | — |
| LINDA MAIPUENSE | LINDA MAIPUENSE | 438809 | 2022-09-30 | hembra | Zaino Colorado | Lucky Island | Mirror Plus | — |
| BESO CURIOSO | BESO CURIOSO | 439623 | 2022-10-22 | macho | Zaino | Curioso Johan | Belhart | — |
| WILSON SECURITY | WILSON SECURITY | 436668 | 2022-08-05 | macho | Alazan | Victor Security | Cataluya | — |
| MAC VITAL | MAC VITAL | 440906 | 2022-11-23 | macho | Zaino | Manipuler | Vital Spark | — |
| LA GRAN TEMPESTAD | LA GRAN TEMPESTAD | 431248 | 2021-09-08 | hembra | Alazan | Sea Dog | Me Salvo El Doctor | — |
| LA LAGUNERA J | LA LAGUNERA J | 438800 | 2022-10-10 | hembra | Zaino | Shawerton | Señorita Ana J | — |
| BOHEMIO TOP | BOHEMIO TOP | 433253 | 2020-08-12 | macho | Zaino | Maipo Top | Bohemia Mia | — |
| NORMANDO LU | NORMANDO LU | 414815 | 2019-08-27 | macho | Tordillo | Lunatico Emperor | Normandina | — |
| AMOROUS | AMOROUS | 429711 | 2021-09-13 | hembra | Zaino | Angiolo | Shadow Queen | — |

## Homónimos en el Stud Book — Yesi tiene que elegir (1)

### `SOY RICARDO`

2 homónimos exactos en el Stud Book. El ejemplar no está en la base todavía, así que no hay fecha de nacimiento contra la cual desambiguar. Yesi tiene que decir cuál es.

Candidatos en el SB:

| sb_id | nombre | sexo | nacimiento | pelo | padre | madre | perfil |
|---|---|---|---|---|---|---|---|
| 434608 | SOY RICARDO | Macho | 01/08/2022 | Alazan | El Moises | Western Dream | https://www.studbook.org.ar/ejemplares/perfil/434608/soy-ricardo |
| 35625 | SOY RICARDO | Macho | 01/01/1976 | No Consigna | Sin Asignar | Sin Asignar | https://www.studbook.org.ar/ejemplares/perfil/35625/soy-ricardo |

## Sin match en el Stud Book — confirmar grafía (3)

### `GRAND VUETERA`

No hay match exacto en el Stud Book. No se inventa nada: vuelve a Yesi para que confirme la grafía.

Candidatos parciales en el SB (NO se eligió ninguno):

- `GRAND ABUELO` · sb_id 276474 · Macho · 07/11/2006 · https://www.studbook.org.ar/ejemplares/perfil/276474/grand-abuelo
- `GRAND ADMIRAL` · sb_id 55361 · Macho · 01/01/1944 · https://www.studbook.org.ar/ejemplares/perfil/55361/grand-admiral
- `GRAND ADVENTURE` · sb_id 329007 · Macho · 22/10/2012 · https://www.studbook.org.ar/ejemplares/perfil/329007/grand-adventure
- `GRAND AFFAIR` · sb_id 273767 · Hembra · 28/09/2006 · https://www.studbook.org.ar/ejemplares/perfil/273767/grand-affair
- `GRAND AGOSTINA` · sb_id 142222 · Hembra · 20/08/1989 · https://www.studbook.org.ar/ejemplares/perfil/142222/grand-agostina
- `GRAND AGUSTINA` · sb_id 213724 · Hembra · 13/10/1997 · https://www.studbook.org.ar/ejemplares/perfil/213724/grand-agustina
- `GRAND ALBA` · sb_id 202756 · Hembra · 20/09/1996 · https://www.studbook.org.ar/ejemplares/perfil/202756/grand-alba
- `GRAND AMI` · sb_id 86095 · Macho · 27/09/1983 · https://www.studbook.org.ar/ejemplares/perfil/86095/grand-ami

Se parece a SPCs que YA están en la base:

- `GRAND VUELTERA` (similitud 0.963) · id `e1b371d4-4326-4ebb-976d-81a016538cb6` · studbook_id —

### `WISKA KEN`

No hay match exacto en el Stud Book. No se inventa nada: vuelve a Yesi para que confirme la grafía.

Se parece a SPCs que YA están en la base:

- `WISLA KEN` (similitud 0.889) · id `29db5000-920f-4185-9cc7-2d310d584b78` · studbook_id 433894

### `LOGARCIUS`

No hay match exacto en el Stud Book. No se inventa nada: vuelve a Yesi para que confirme la grafía.

## Ya está en la base con el mismo nombre (11)

### `MOSQUITA GARDEN`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `MOSQUITA GARDEN` · id `c1af88b9-6fbd-4883-a025-03f44f1fdfab` · nac 2023-10-10 · sexo macho · studbook_id —

### `BACHUNA`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `BACHUNA` · id `3529b1dc-bc09-4239-a2c1-8a3288a09f2b` · nac 2022-11-24 · sexo hembra · studbook_id 440655

### `BENDITO PRESAGIO`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `BENDITO PRESAGIO` · id `9e7da603-a362-483f-91a6-d492df70300e` · nac 2022-09-29 · sexo macho · studbook_id 438827

### `QUINIELA TREND`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `QUINIELA TREND` · id `ce3a7e24-05f0-49d5-97fa-801d4b23f37f` · nac 2018-09-23 · sexo hembra · studbook_id 408157

### `BABY PARADISE`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `BABY PARADISE` · id `d76cc137-b0be-4470-9003-a49ae4ee3458` · nac 2019-10-08 · sexo hembra · studbook_id —

### `GLAM METAL`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `GLAM METAL` · id `25593578-89b4-409f-9fb2-9626cf468e3d` · nac 2020-07-09 · sexo hembra · studbook_id 420280

### `SEÑOR MONCHI`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `SEÑOR MONCHI` · id `49ff5956-5aef-4b82-a950-0cdb4a28d192` · nac 2020-09-27 · sexo macho · studbook_id 420852

### `ECHO IN THE SKY`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `ECHO IN THE SKY` · id `25ba7fcc-c8f1-4653-b1b3-ed8bb2327301` · nac 2020-10-08 · sexo macho · studbook_id —

### `SANTA LISA`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `SANTA LISA` · id `ff8c8e60-b8bb-4533-9b71-ae7a04fb6088` · nac 2021-10-10 · sexo hembra · studbook_id —

### `MARUKA PLUS`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `MARUKA PLUS` · id `cb58487f-ece8-4456-86a2-4d6557da5d25` · nac 2021-10-20 · sexo hembra · studbook_id 430437

### `CHE CARABANERA`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `CHE CARABANERA` · id `409b8fa5-9008-49d9-bd3b-904a0b28f8db` · nac 2022-08-20 · sexo hembra · studbook_id 437182

