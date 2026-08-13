# Tabla de edades de R8 — codigo vs Stud Book

**Reunion**: R8 (numero 8, publico 7) — **2026-08-16**
**Branch**: `fix/programa-r8-imprenta` · **Generado**: 2026-08-13 · READ-ONLY

## Que es cada columna

| columna | de donde sale |
|---|---|
| `fecha_nacimiento` | `spcs.fecha_nacimiento` de la base |
| **ANTES** | `calcEdad()` de `git show main:programa-oficial.html`, ejecutado tal cual |
| **DESPUES** | `edadSPC()` de `edad-spc.js` (HEAD), referida a la fecha de reunion 2026-08-16 |
| **STUD BOOK** | scrape del perfil del ejemplar en studbook.org.ar |
| `nac. SB` | fecha de nacimiento que publica el Stud Book, para control |

**El scraper SI devuelve la edad.** El autocomplete
(`/ejemplares/autocomplete`) da nombre, fecha de nacimiento y padres pero **no** la edad;
la edad esta en el perfil del ejemplar (`/ejemplares/perfil/<id>/<slug>`), publicada como
`08/08/2017 (9 años)`. Se lee de ahi. Igual va la columna `nac. SB` para que se pueda
recalcular a mano.

## Resultado

- Ratificados de R8: **67**
- Resueltos en el Stud Book: **67**
- **Filas donde DESPUES != STUD BOOK: 0** (ninguna)
- Filas donde ANTES != STUD BOOK: **53**
- Filas cuya edad cambia con el fix: **53**
- SPCs sin `fecha_nacimiento`: **0**

## Tabla

`*` en ANTES = la edad cambia con el fix. `⚠` = DESPUES no coincide con el Stud Book.

| C# | SPC | fecha_nacimiento | ANTES | DESPUES | STUD BOOK | nac. SB | |
|---:|---|---|---:|---:|---:|---|---|
| 1 | ASTUTO NOTES | 2022-10-13 | 3 \* | **4** | 4 | 2022-10-13 |  |
| 1 | BACHUNA | 2022-11-24 | 3 \* | **4** | 4 | 2022-11-24 |  |
| 1 | BENDITO PRESAGIO | 2022-09-29 | 3 \* | **4** | 4 | 2022-09-29 |  |
| 1 | BESO CURIOSO | 2022-10-22 | 3 \* | **4** | 4 | 2022-10-22 |  |
| 1 | DOCTOR SKY | 2022-10-25 | 3 \* | **4** | 4 | 2022-10-25 |  |
| 1 | ELSEPTIMOESDECALDERA | 2022-10-27 | 3 \* | **4** | 4 | 2022-10-27 |  |
| 1 | LINDA MAIPUENSE | 2022-09-30 | 3 \* | **4** | 4 | 2022-09-30 |  |
| 1 | LOCA DUBAI | 2022-11-06 | 3 \* | **4** | 4 | 2022-11-06 |  |
| 1 | TOUCH OF BLUE | 2022-10-30 | 3 \* | **4** | 4 | 2022-10-30 |  |
| 1 | WILSON SECURITY | 2022-08-05 | 4 | **4** | 4 | 2022-08-05 |  |
| 2 | CHE CARABANERA | 2022-08-20 | 3 \* | **4** | 4 | 2022-08-20 |  |
| 2 | DE BELLOSO | 2021-09-01 | 4 \* | **5** | 5 | 2021-09-01 |  |
| 2 | IDALIA MARO | 2021-10-15 | 4 \* | **5** | 5 | 2021-10-15 |  |
| 2 | LA GRAN TEMPESTAD | 2021-09-08 | 4 \* | **5** | 5 | 2021-09-08 |  |
| 2 | LOGUACIOUS | 2021-10-23 | 4 \* | **5** | 5 | 2021-10-23 |  |
| 2 | MARUKA PLUS | 2021-10-20 | 4 \* | **5** | 5 | 2021-10-20 |  |
| 2 | SANTA LISA | 2021-10-10 | 4 \* | **5** | 5 | 2021-10-10 |  |
| 3 | ALIADO SCAT | 2019-08-18 | 6 \* | **7** | 7 | 2019-08-18 |  |
| 3 | BABY PARADISE | 2019-10-08 | 6 \* | **7** | 7 | 2019-10-08 |  |
| 3 | DESTINADO JOHAN | 2020-09-07 | 5 \* | **6** | 6 | 2020-09-07 |  |
| 3 | FLORENTINA IN YOU | 2020-11-01 | 5 \* | **6** | 6 | 2020-11-01 |  |
| 3 | GLAM METAL | 2020-07-09 | 6 | **6** | 6 | 2020-07-09 |  |
| 3 | GRAND VUELTERA | 2020-11-10 | 5 \* | **6** | 6 | 2020-11-10 |  |
| 3 | GRILLADA RYE | 2019-11-12 | 6 \* | **7** | 7 | 2019-11-12 |  |
| 3 | INFILTRADO SLEW | 2020-07-27 | 6 | **6** | 6 | 2020-07-27 |  |
| 3 | LIVIA DRUSA | 2020-09-16 | 5 \* | **6** | 6 | 2020-09-16 |  |
| 3 | QUINIELA TREND | 2018-09-23 | 7 \* | **8** | 8 | 2018-09-23 |  |
| 3 | RECUERDAME IN YOU | 2020-10-05 | 5 \* | **6** | 6 | 2020-10-05 |  |
| 3 | TERRIBLE KING | 2019-08-23 | 6 \* | **7** | 7 | 2019-08-23 |  |
| 4 | AMIGUITO JESUS | 2022-07-29 | 4 | **4** | 4 | 2022-07-29 |  |
| 4 | CONI ROSE | 2021-10-15 | 4 \* | **5** | 5 | 2021-10-15 |  |
| 4 | FALAYS | 2021-10-26 | 4 \* | **5** | 5 | 2021-10-26 |  |
| 4 | IX GOAL TUN | 2018-07-29 | 8 | **8** | 8 | 2018-07-29 |  |
| 4 | LA LAGUNERA J | 2022-10-10 | 3 \* | **4** | 4 | 2022-10-10 |  |
| 4 | NELIDA RIM | 2022-11-02 | 3 \* | **4** | 4 | 2022-11-02 |  |
| 4 | NOCHE EN VELA | 2022-07-28 | 4 | **4** | 4 | 2022-07-28 |  |
| 4 | PORTEÑO Y BAILARIN | 2021-08-03 | 5 | **5** | 5 | 2021-08-03 |  |
| 5 | BELLO PRESAGIO | 2021-09-10 | 4 \* | **5** | 5 | 2021-09-10 |  |
| 5 | CHINITA SALTEÑA | 2021-08-01 | 5 | **5** | 5 | 2021-08-01 |  |
| 5 | ESPLENDID CRAF | 2020-10-18 | 5 \* | **6** | 6 | 2020-10-18 |  |
| 5 | Icy Tom | 2018-09-02 | 7 \* | **8** | 8 | 2018-09-02 |  |
| 5 | LA DIVERTENTE | 2020-07-27 | 6 | **6** | 6 | 2020-07-27 |  |
| 5 | NORMANDO LU | 2019-08-27 | 6 \* | **7** | 7 | 2019-08-27 |  |
| 5 | Wave Rimout | 2017-08-08 | 9 | **9** | 9 | 2017-08-08 |  |
| 5 | WISLA KEN | 2021-09-28 | 4 \* | **5** | 5 | 2021-09-28 |  |
| 6 | COLONIAL JOHAN | 2021-10-15 | 4 \* | **5** | 5 | 2021-10-15 |  |
| 6 | EL GRAN HECTOR | 2021-08-25 | 4 \* | **5** | 5 | 2021-08-25 |  |
| 6 | ES SABALERO | 2021-10-20 | 4 \* | **5** | 5 | 2021-10-20 |  |
| 6 | HEART OF GOLD | 2021-11-24 | 4 \* | **5** | 5 | 2021-11-24 |  |
| 6 | QUE TAL OREJA | 2020-10-25 | 5 \* | **6** | 6 | 2020-10-25 |  |
| 6 | REINA EDITION | 2021-10-24 | 4 \* | **5** | 5 | 2021-10-24 |  |
| 6 | REY DE PILA | 2021-10-14 | 4 \* | **5** | 5 | 2021-10-14 |  |
| 6 | TATA FOOT | 2021-08-30 | 4 \* | **5** | 5 | 2021-08-30 |  |
| 7 | ABELITO MIMOSO | 2022-11-10 | 3 \* | **4** | 4 | 2022-11-10 |  |
| 7 | BAHIA ROMANA | 2022-08-10 | 4 | **4** | 4 | 2022-08-10 |  |
| 7 | DESDEN | 2022-08-01 | 4 | **4** | 4 | 2022-08-01 |  |
| 7 | MAC VITAL | 2022-11-23 | 3 \* | **4** | 4 | 2022-11-23 |  |
| 7 | SOY RICARDO | 2022-08-01 | 4 | **4** | 4 | 2022-08-01 |  |
| 7 | VISION SECURITY | 2022-10-08 | 3 \* | **4** | 4 | 2022-10-08 |  |
| 8 | BOHEMIO TOP | 2020-08-12 | 6 | **6** | 6 | 2020-08-12 |  |
| 8 | DEVIL'S KING | 2018-08-17 | 7 \* | **8** | 8 | 2018-08-17 |  |
| 8 | ECHO IN THE SKY | 2020-10-08 | 5 \* | **6** | 6 | 2020-10-08 |  |
| 8 | LE BATEAU | 2020-10-20 | 5 \* | **6** | 6 | 2020-10-20 |  |
| 8 | LE CHAT MIMOUS | 2020-09-18 | 5 \* | **6** | 6 | 2020-09-18 |  |
| 8 | REINA ATREVIDA | 2019-10-12 | 6 \* | **7** | 7 | 2019-10-12 |  |
| 8 | SEÑOR MONCHI | 2020-09-27 | 5 \* | **6** | 6 | 2020-09-27 |  |
| 8 | YOOKY | 2020-08-15 | 5 \* | **6** | 6 | 2020-08-15 |  |

## SPCs sin fecha_nacimiento cargada

**Ninguno.** Los 67 ratificados tienen `fecha_nacimiento` cargada, asi que ninguna
celda K E S P sale con la edad vacia.

## Homonimos desambiguados

El Stud Book tiene mas de un ejemplar con el mismo nombre. Se eligio por fecha de
nacimiento contra la de la base, que coincide exacto:

| SPC | sb_id | nac. base | nac. SB | criterio |
|---|---:|---|---|---|
| HEART OF GOLD | 432334 | 2021-11-24 | 2021-11-24 | nombre + fecha de nacimiento |
| DESDEN | 435069 | 2022-08-01 | 2022-08-01 | nombre + fecha de nacimiento |
| SOY RICARDO | 434608 | 2022-08-01 | 2022-08-01 | nombre + fecha de nacimiento |

## Control: fecha de nacimiento base vs Stud Book

Coinciden en las 67 filas resueltas. La edad no se apoya en una
fecha distinta de la que tiene la base.
