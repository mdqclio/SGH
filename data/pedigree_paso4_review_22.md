# PASO 4 — Planilla de review: 22 UPDATE propuestos + 4 frenados

**SHA del scrape**: `b6e47f4` · **Branch**: `feat/pedigree-programa` · **Fecha**: 2026-07-22
**Estado**: NADA aplicado en la DB. Esperando OK.

Fuente cruda: `data/pedigree_scrape_26.json` · SQL: `migrations/pedigree_backfill_26.sql`
Detalle del criterio y de los descartes: `data/pedigree_paso4_scrape.md`

---

## Los 22 a actualizar — CABALLO → PADRE → MADRE

`B` = nombre único en el Stud Book pero la `fecha_nacimiento` de la DB discrepa (ver Δ).

| # | CABALLO | PADRE | MADRE | SB id | Bkt | Δ fecha | insc |
|---|---|---|---|---|---|---|---|
| 1 | **Amiguito Peligroso** | Amiguito Calificado | Amiguita Bohemia | 441819 | A | — | 0 |
| 2 | **Berry Nik** | Nicodemus (USA) | Bafana | 447004 | A | — | 1 |
| 3 | **Come on Baby** | Señor Candy (USA) | Coming Away | 420587 | A | — | 0 |
| 4 | **Conesera** | Emmanuel | Milonga Burrera | 444373 | A | — | 1 |
| 5 | **Cursi Nik** | Nicodemus (USA) | Cursi Gulch | 447006 | A | — | 0 |
| 6 | **De Moda** | Valid Stripes | Vauquita | 444272 | A | — | 1 |
| 7 | **Dourada** | Il Mercato | Dixie Mask | 441798 | A | — | 0 |
| 8 | **Es Mistres** | Master Of Hounds (USA) | Ando Mateando | 447999 | A | — | 1 |
| 9 | **Fiestera Nik** | Nicodemus (USA) | Fiestera Seattle | 443351 | A | — | 0 |
| 10 | **Folke Dancer** | Forge (GB) | Follow | 422244 | B | 10 d (SB 2020-07-16 / DB 2020-07-06) | 0 |
| 11 | **GREAT ORPEN** | Orpen Farrero | Great Perfection | 447875 | B | 68 d (SB 2023-12-12 / DB 2023-10-05) | 1 |
| 12 | **Icy Tom** | Icy Glory | Normandina | 408138 | A | — | 1 |
| 13 | **La City Porteña** | Cityscape (GB) | La Remota | 441496 | A | — | 0 |
| 14 | **La Motocicleta** | Manipulator (USA) | Ampi Nistel | 442428 | A | — | 0 |
| 15 | **Malenuchi Jack** | Emir Jack | Quartermaster | 448214 | A | — | 0 |
| 16 | **MONADESEDA** | Forge (GB) | Shake (USA) | 445820 | B | 1 d (SB 2023-10-02 / DB 2023-10-01) | 1 |
| 17 | **MOSQUITA GARDEN** | The Garden | Veneciana Storm | 444643 | B | 30 d (SB 2023-09-10 / DB 2023-10-10) | 1 |
| 18 | **MR. PATO** | Gouverneur Morris (USA) | Doña Nota | 442770 | B | 11 d (SB 2023-08-28 / DB 2023-08-17) | 1 |
| 19 | **PUNAB** | Peten Itza | Honey Moon | 446115 | B | 9 d (SB 2023-10-13 / DB 2023-10-04) | 0 |
| 20 | **Vito lo capo** | Cosmic Trigger | Campirina | 430797 | A | — | 1 |
| 21 | **Wave Rimout *(fila 1)*** | Remote (GB) | Holiday Wave | 397805 | A | — | 1 |
| 22 | **Wave Rimout *(fila 2)*** | Remote (GB) | Holiday Wave | 397805 | A | — | 0 |

Suma: **22** — 16 en bucket A (fecha SB == fecha DB), 6 en bucket B.

Alcance por fila: `UPDATE spcs SET padrillo_nombre = ..., madre_nombre = ...`
con `WHERE id = ... AND padrillo_nombre IS NULL AND madre_nombre IS NULL`.
Ningún otro campo se toca. Rollback = volver esos 22 ids a NULL.

---

## Los 4 frenados — NO se actualizan

| CABALLO | DB | Qué hay en el Stud Book | Por qué no se aplica |
|---|---|---|---|
| **First Queen** | 2023-10-04, macho, 0 insc | 2 homónimos: `441762` Hembra 2023-07-16 (Village King – Felurian) y `265247` Hembra 2005-09-06 (First Halo – Reine Zulu) | Ninguno coincide en fecha con la DB, y el nombre además está duplicado en la DB (`Fist Queen`). Sin criterio que cierre. |
| **Fist Queen** | 2023-10-04, macho, 0 insc | Nada. `FIST` devuelve 12 ejemplares, ninguno relacionado | No existe en SB. Misma fecha de nacimiento que `First Queen` → typo de la misma alta. Es merge/borrado, no backfill. |
| **Malenuchi** | 2023-10-15, macho, 0 insc | Nada exacto. El término `MALENUCHI` devuelve **uno solo**: `MALENUCHI JACK` (448214, 2023-10-15) | Ese registro ya es el match de la *otra* fila de la DB, con la misma fecha. Son el mismo caballo cargado dos veces. |
| **Esplendido Craf** | 2020-10-18, macho, 0 insc | Nada exacto. Los 13 `ESPLENDIDO*` no incluyen ningún `... CRAF`. Lo único parecido: `ESPLENDIDA CRAF` (401751, **Hembra, 2017-10-13**) | No cierra ni el sexo ni el año contra la DB. No se asume que sea el mismo. |

Ninguno tiene inscripciones vivas — no frenan el programa.

---

## Conteo

| | antes | después |
|---|---|---|
| SPCs con pedigree | 118 / 144 | **140 / 144** |
| SPCs sin pedigree | 26 | 4 |
