# PASO 1 — SPCs sin pedigree (padre/madre) — read-only

**Fecha**: 2026-07-22
**Ref**: `unlhcuanfrtpatoipwve` (prod)
**Branch**: `feat/pedigree-programa`
**Query base**: `select ... from spcs where padrillo_nombre is null or madre_nombre is null`

---

## Hallazgo que cambia el plan

El pedigree **NO está en `spcs.notas`**. Ya está en columnas estructuradas
`spcs.padrillo_nombre` + `spcs.madre_nombre`.

```sql
select count(*) filter (where notas ilike '%padre%' or notas ilike '%madre%') from spcs;
-- 0
```

`notas` sólo guarda el rastro del scrape SB:

```
SB id=424106 · https://www.studbook.org.ar/ejemplares/perfil/424106/africum ·
microchip 981098108600147 · criador El Paraiso · abuelo materno (damsire): Incurable Optimist (USA)
```

Es decir: **SB id, URL, microchip, criador y abuelo materno** — sin padre ni madre.
El scrape ya volcó padre/madre a las columnas en su momento.

Consecuencias sobre la tanda (detalle en el resumen de sesión):
- PASO 2 (`ADD COLUMN padre, madre`) duplicaría `padrillo_nombre`/`madre_nombre`.
- PASO 3 (parseo `notas` → columnas) queda sin insumo: no hay nada que parsear.
- PASO 4 (scrape de los faltantes) y PASO 5 (render) siguen siendo trabajo real.

---

## Universo: 144 SPCs

| notas (scrape) | studbook_id | registro_stud_book | pedigree | n | created_at |
|---|---|---|---|---|---|
| sí | no | no | **sí** | 76 | 2026-06-12 |
| sí | sí | no | **sí** | 26 | 2026-06-10..11 |
| no | no | sí | **sí** | 16 | 2026-04-21..22 |
| no | no | no | **NO** | **26** | 2026-04-22..06-12 |

**118 con pedigree / 26 sin** — coincide con el split esperado.

Los 26 sin pedigree son exactamente los 26 sin `notas`: **ninguno pasó nunca por el scraper**.
Origen = **carga manual** (alta desde `spcs.html` / inscripciones), no "pre-scraper con notas rotas".
Señal secundaria: los 26 tienen `color = NULL` y `registro_stud_book = NULL`, mientras los
16 de carga manual temprana (abril) sí traen `registro_stud_book` cargado a mano y pedigree.

---

## Los 26 faltantes

`insc` = inscripciones vinculadas (prioridad de scrape).

| # | Nombre | Nac. | Sexo (DB) | insc | Creado | Nota |
|---|---|---|---|---|---|---|
| 1 | Amiguito Peligroso | 2023-07-07 | macho | 0 | 2026-05-09 | |
| 2 | Berry Nik | 2023-10-23 | macho | 1 | 2026-05-09 | |
| 3 | Come on Baby | 2020-08-21 | macho | 0 | 2026-05-07 | |
| 4 | Conesera | 2023-09-20 | macho | 1 | 2026-05-09 | ⚠ nombre femenino / sexo=macho |
| 5 | Cursi Nik | 2023-10-27 | macho | 0 | 2026-05-09 | ⚠ nombre femenino / sexo=macho |
| 6 | De Moda | 2023-09-04 | macho | 1 | 2026-05-09 | |
| 7 | Dourada | 2023-07-01 | hembra | 0 | 2026-05-09 | |
| 8 | Es Mistres | 2023-10-05 | macho | 1 | 2026-05-09 | ⚠ nombre femenino / sexo=macho |
| 9 | Esplendido Craf | 2020-10-18 | macho | 0 | 2026-05-07 | |
| 10 | Fiestera Nik | 2023-08-29 | macho | 0 | 2026-05-09 | ⚠ nombre femenino / sexo=macho |
| 11 | First Queen | 2023-10-04 | macho | 0 | 2026-04-27 | ⚠ duplicado con #12 + sexo |
| 12 | Fist Queen | 2023-10-04 | macho | 0 | 2026-04-27 | ⚠ typo de #11, misma fecha nac. |
| 13 | Folke Dancer | 2020-07-06 | macho | 0 | 2026-05-07 | |
| 14 | GREAT ORPEN | 2023-10-05 | macho | 1 | 2026-04-27 | |
| 15 | Icy Tom | 2018-09-02 | macho | 1 | 2026-05-07 | |
| 16 | La City Porteña | 2023-07-01 | macho | 0 | 2026-05-09 | ⚠ nombre femenino / sexo=macho |
| 17 | La Motocicleta | 2023-08-22 | macho | 0 | 2026-05-09 | ⚠ nombre femenino / sexo=macho |
| 18 | Malenuchi | 2023-10-15 | macho | 0 | 2026-05-09 | ⚠ posible dup con #19 |
| 19 | Malenuchi Jack | 2023-10-15 | macho | 0 | 2026-05-09 | ⚠ misma fecha nac. que #18 |
| 20 | MONADESEDA | 2023-10-01 | macho | 1 | 2026-04-27 | |
| 21 | MOSQUITA GARDEN | 2023-10-10 | macho | 1 | 2026-04-27 | ⚠ nombre femenino / sexo=macho |
| 22 | MR. PATO | 2023-08-17 | macho | 1 | 2026-04-22 | |
| 23 | PUNAB | 2023-10-04 | macho | 0 | 2026-04-27 | |
| 24 | Vito lo capo | 2021-10-22 | macho | 1 | 2026-06-12 | |
| 25 | Wave Rimout | 2017-08-08 | macho | 1 | 2026-05-07 | ⚠ duplicado exacto con #26 |
| 26 | Wave Rimout | 2017-08-08 | macho | 0 | 2026-06-12 | ⚠ duplicado exacto de #25 |

**Con inscripciones (11)** — prioridad alta para el scrape del PASO 4:
Berry Nik, Conesera, De Moda, Es Mistres, GREAT ORPEN, Icy Tom, MONADESEDA,
MOSQUITA GARDEN, MR. PATO, Vito lo capo, Wave Rimout (#25).

---

## Ruido de datos detectado (no se toca en esta tanda)

1. **Duplicados**: `First Queen`/`Fist Queen` (typo), `Wave Rimout` ×2 (exacto),
   `Malenuchi`/`Malenuchi Jack` (misma fecha nac.). Merge/borrado = decisión de Fede.
2. **`sexo` sospechoso**: 8 nombres claramente femeninos cargados como `macho`.
   El default del alta manual parece ser `macho`. Esto rompe el sanity-check por sexo
   del scraper → en PASO 4 se usa `"?"` como hint (sin filtro por sexo) para no
   descartar matches válidos, y se reporta la discrepancia sin corregirla.
3. **`color` NULL** en los 26 → el programa oficial imprime el pelaje vacío para ellos.
   Fuera de alcance de esta tanda (el scrape podría traerlo, pero PASO 4 sólo
   actualiza padre/madre por consigna).

---

## Estado del render (relevado, para PASO 5)

| Archivo | Línea | Estado |
|---|---|---|
| `programa-oficial.html` | 376 | ✅ ya arma `PADRE — MADRE` en mayúsculas |
| `programa-oficial-color.html` | 589 | ✅ ídem |
| `programa.html` | 365 | ⚠ usa `'?'` como fallback: `Por ${padrillo\|\|'?'} - ${madre\|\|'?'}` |

PASO 5 se reduce a: sacar el `'?'` de `programa.html` (NULL → vacío) y verificar que
los oficiales no dejen el separador `—` colgado cuando falta un lado.
