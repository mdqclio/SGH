# PASO 4 — Scrape SB de los 26 SPCs sin pedigree — READ-ONLY, sin UPDATE aplicado

**Fecha**: 2026-07-22 · **Branch**: `feat/pedigree-programa`
**Script**: `tools/sb_pedigree_26.py` (no toca Supabase)
**Salida cruda**: `data/pedigree_scrape_26.json`
**SQL propuesto (NO ejecutado)**: `migrations/pedigree_backfill_26.sql`

| | n |
|---|---|
| Lista | 26 |
| Encontrados en SB con padre+madre | 23 |
| No encontrados | 3 |
| **Propuestos para UPDATE** | **22** |
| Frenados para revisión | 4 |

Alcance del UPDATE: **sólo `padrillo_nombre` y `madre_nombre`**. No se toca
`fecha_nacimiento`, `sexo`, `color`, `registro_stud_book`, `studbook_id` ni `notas`.

---

## Criterio de match

1. `autocomplete(nombre)` → match **exacto** por nombre normalizado (sin acentos ni puntuación).
2. Homónimos → se prefiere el que **coincide en `fecha_nacimiento` con la DB**;
   si ninguno coincide, el de nacimiento más reciente.
3. Sin match exacto → **NO ENCONTRADO**. No se elige por parecido, no se inventa.
4. Sanity por sexo/edad: **se reporta la discrepancia, no descarta el match**.
   El `sexo` de estas 26 filas es carga manual con default `macho` (ver paso 1),
   así que como filtro daría falsos negativos.

Único ajuste sobre el criterio de siempre: `TERM_OVERRIDE` reescribe el **término de
búsqueda** cuando el autocomplete del SB no tolera un carácter (`MR. PATO` → `MR PATO`).
El match sigue siendo exacto contra el nombre normalizado — no afloja nada.

---

## BUCKET A — 16 · fecha_nacimiento SB == DB · aplicar

| # | Nombre | SB id | Nac. | PADRE | MADRE | insc |
|---|---|---|---|---|---|---|
| 1 | Amiguito Peligroso | 441819 | 2023-07-07 | Amiguito Calificado | Amiguita Bohemia | 0 |
| 2 | Berry Nik | 447004 | 2023-10-23 | Nicodemus (USA) | Bafana | 1 |
| 3 | Come on Baby | 420587 | 2020-08-21 | Señor Candy (USA) | Coming Away | 0 |
| 4 | Conesera | 444373 | 2023-09-20 | Emmanuel | Milonga Burrera | 1 |
| 5 | Cursi Nik | 447006 | 2023-10-27 | Nicodemus (USA) | Cursi Gulch | 0 |
| 6 | De Moda | 444272 | 2023-09-04 | Valid Stripes | Vauquita | 1 |
| 7 | Dourada | 441798 | 2023-07-01 | Il Mercato | Dixie Mask | 0 |
| 8 | Es Mistres | 447999 | 2023-10-05 | Master Of Hounds (USA) | Ando Mateando | 1 |
| 9 | Fiestera Nik | 443351 | 2023-08-29 | Nicodemus (USA) | Fiestera Seattle | 0 |
| 10 | Icy Tom | 408138 | 2018-09-02 | Icy Glory | Normandina | 1 |
| 11 | La City Porteña | 441496 | 2023-07-01 | Cityscape (GB) | La Remota | 0 |
| 12 | La Motocicleta | 442428 | 2023-08-22 | Manipulator (USA) | Ampi Nistel | 0 |
| 13 | Malenuchi Jack | 448214 | 2023-10-15 | Emir Jack | Quartermaster | 0 |
| 14 | Vito lo capo | 430797 | 2021-10-22 | Cosmic Trigger | Campirina | 1 |
| 15 | Wave Rimout *(fila 1)* | 397805 | 2017-08-08 | Remote (GB) | Holiday Wave | 1 |
| 16 | Wave Rimout *(fila 2)* | 397805 | 2017-08-08 | Remote (GB) | Holiday Wave | 0 |

`Conesera` y `De Moda` tenían 2 homónimos exactos en SB cada uno; se resolvieron por
coincidencia exacta de `fecha_nacimiento` con la DB (regla 2), no por "el más reciente".

Las dos filas de `Wave Rimout` apuntan al mismo SB 397805 — es el duplicado de DB ya
marcado en paso 1. Se llenan las dos: no cambia nada mientras el duplicado exista, y
si Fede después mergea, el dato ya está bien en la fila que sobreviva.

---

## BUCKET B — 6 · nombre único en SB, `fecha_nacimiento` de la DB discrepa · aplicar con nota

| Nombre | SB id | Nac. SB | Nac. DB | Δ | Sexo SB | PADRE | MADRE | insc |
|---|---|---|---|---|---|---|---|---|
| Folke Dancer | 422244 | 2020-07-16 | 2020-07-06 | 10 d | Macho | Forge (GB) | Follow | 0 |
| GREAT ORPEN | 447875 | 2023-12-12 | 2023-10-05 | 68 d | Macho | Orpen Farrero | Great Perfection | 1 |
| MONADESEDA | 445820 | 2023-10-02 | 2023-10-01 | 1 d | Hembra | Forge (GB) | Shake (USA) | 1 |
| MOSQUITA GARDEN | 444643 | 2023-09-10 | 2023-10-10 | 30 d | Hembra | The Garden | Veneciana Storm | 1 |
| MR. PATO | 442770 | 2023-08-28 | 2023-08-17 | 11 d | Macho | Gouverneur Morris (USA) | Doña Nota | 1 |
| PUNAB | 446115 | 2023-10-13 | 2023-10-04 | 9 d | Macho | Peten Itza | Honey Moon | 0 |

En los 6 el nombre es **único** en el Stud Book — no hay otro candidato al que pudiera
corresponder. La lectura es que la `fecha_nacimiento` de la carga manual está mal
tipeada (varias son transposición de dígitos: `10-10`↔`09-10`, `10-04`↔`10-13`).

**`GREAT ORPEN` es el más flojo del bucket** (68 días). Sigue siendo el único
`GREAT ORPEN` del SB y tiene inscripción viva. Si preferís frenarlo, sale de la
sentencia y queda en el bucket C.

`MR. PATO` sólo apareció buscando `MR PATO` (el punto rompe el autocomplete del SB).
Sexo Macho coincide con la DB.

---

## BUCKET C — 4 · NO se aplica, requiere decisión

### 1. First Queen — homónimos sin coincidencia de fecha
- DB: `2023-10-04`, macho, 0 inscripciones.
- SB tiene 2 `FIRST QUEEN`: `441762` Hembra 2023-07-16 (Village King – Felurian)
  y `265247` Hembra 2005-09-06 (First Halo – Reine Zulu).
- Ninguno coincide en fecha. El desempate por "más reciente" daría `441762`, pero con
  el nombre duplicado en la DB (`First Queen` / `Fist Queen`) y la fecha sin respaldo,
  **no se aplica**. Confirmación de Fede.

### 2. Fist Queen — no existe en SB
- 0 resultados exactos; `FIST` devuelve 12 ejemplares, ninguno relacionado.
- Misma `fecha_nacimiento` que `First Queen` → typo de la misma alta. Fila a borrar/mergear,
  no a completar.

### 3. Malenuchi — no existe en SB
- 0 resultados exactos. El término `MALENUCHI` devuelve **un solo** ejemplar:
  `MALENUCHI JACK` (448214, 2023-10-15) — que ya es el match de la *otra* fila de la DB,
  con la misma fecha de nacimiento.
- Conclusión: `Malenuchi` y `Malenuchi Jack` son el mismo caballo cargado dos veces.
  No se completa `Malenuchi`; es merge, no backfill.

### 4. Esplendido Craf — no existe en SB
- 0 resultados exactos. `ESPLENDIDO` devuelve 13 ejemplares, ninguno `... CRAF`.
- El único parecido está en femenino: `ESPLENDIDA CRAF` (401751, **Hembra, 2017-10-13**).
  Contra la DB (`macho`, `2020-10-18`) no cierra ni el sexo ni el año.
- **No se aplica.** Se deja listado como candidato para que lo confirme Fede.

---

## Discrepancia de `sexo` — 13 casos, informativa

SB dice `Hembra` donde la DB dice `macho`: Berry Nik, Come on Baby, Conesera, Cursi Nik,
De Moda, Es Mistres, Fiestera Nik, First Queen, La City Porteña, La Motocicleta,
Malenuchi Jack, MONADESEDA, MOSQUITA GARDEN.

Confirma la sospecha del paso 1: el alta manual deja `macho` por default. **No se corrige
en esta tanda** (la consigna es padre/madre). Queda anotado para una tanda de saneamiento
propia — afecta el `sexo` impreso en el programa oficial.

---

## Rollback

Las 22 filas del UPDATE tienen hoy `padrillo_nombre IS NULL AND madre_nombre IS NULL`
(verificado: los 26 tienen ambos NULL). No hay dato previo que preservar — revertir es
volverlas a NULL. Los 22 UUIDs están en el bloque ROLLBACK comentado al pie de
`migrations/pedigree_backfill_26.sql`.

El `WHERE ... IS NULL` de cada sentencia hace el backfill idempotente: re-ejecutarlo no
pisa nada ya cargado.

---

## Conteo esperado

| | antes | después |
|---|---|---|
| SPCs con pedigree | 118 / 144 | **140 / 144** |
| SPCs sin pedigree | 26 | 4 (First Queen, Fist Queen, Malenuchi, Esplendido Craf) |
