# R8 — tanda 3: alta de SPCs, reporte de casos

- Nombres pedidos por Yesi: **10**
- Altas propuestas por el script: **5** → **4 tras revisión manual** (ver nota)
- Casos que vuelven a Yesi: **5** → **6 con ESPLENDID CRAF**
- Snapshot de `spcs` usado: 163 filas

> ⚠ **Nota de revisión manual — ESPLENDID CRAF sale de las altas.**
> El script lo dio ALTA_OK porque el nombre normalizado no coincide con el
> de la base (`ESPLENDIDCRAF` vs `ESPLENDIDOCRAF`) y la fila de la base
> tiene `studbook_id` NULL, así que el guard de idempotencia no la ve.
> Es la misma mancha: base `Esplendido Craf` (id `f78a132a-…`, nac
> 2020-10-18, macho) vs SB `ESPLENDID CRAF` (sb 421807, 18/10/2020, Macho).
> El autocomplete del SB con `ESPLENDIDO CRAF` devuelve **cero** resultados
> → el typo está en la base, no en la planilla. El INSERT quedó comentado
> en `migrations/spcs_r8_tanda_3.sql`, con un UPDATE alternativo también
> comentado. Ver `docs/TANDA_3_R8.md` §1.

Nada fue ejecutado contra la base. Los INSERTs están en `migrations/spcs_r8_tanda_3.sql` y esperan OK.

## Altas propuestas

| pedido | nombre SB | sb_id | nac | sexo | pelaje | padre | madre | alertas |
|---|---|---|---|---|---|---|---|---|
| BAHIA ROMANA | BAHIA ROMANA | 435330 | 2022-08-10 | hembra | Alazan | Roman Joy | Oh Bahia | — |
| INDIO GOLDEN | INDIO GOLDEN | 439349 | 2022-10-30 | macho | Zaino | Golden Cigars | India Candela's | — |
| CONI ROSE | CONI ROSE | 430718 | 2021-10-15 | hembra | Tordillo | Marconi (USA) | Rose City | — |
| ESPLENDID CRAF | ESPLENDID CRAF | 421807 | 2020-10-18 | macho | Zaino | Mastercraftsman (IRE) | Esplendida Halo | — |
| ES SABALERO | ES SABALERO | 432333 | 2021-10-20 | macho | Tordillo | Pure Miron | Ori Champ | — |

## Ya está en la base con el mismo nombre (5)

### `LOCA DUBAI`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `LOCA DUBAI` · id `83dca3e3-bbce-4c5f-9d0e-2fa5ce0d5967` · nac 2022-11-06 · sexo hembra · studbook_id —

### `AMIGUITO JESUS`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `AMIGUITO JESUS` · id `d9d93d98-483e-4ff3-9a82-1b4e8088a5f3` · nac 2022-07-29 · sexo macho · studbook_id 436018

### `KUCCINI`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `KUCCINI` · id `cc8e4e35-b7ae-4624-9e6b-1138e1a4dfbc` · nac 2022-07-28 · sexo macho · studbook_id —

### `CHAMPION GOLDEN`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `CHAMPION GOLDEN` · id `de7886a7-f71a-4421-a299-6a1cde46edfc` · nac 2022-11-06 · sexo macho · studbook_id —

### `DESTINADO JOHAN`

Ya hay 1 SPC con ese nombre en la base. No se da de alta.

- en base: `DESTINADO JOHAN` · id `3f62772e-1dce-44cc-a028-e9c7493f4812` · nac 2020-09-07 · sexo macho · studbook_id —

