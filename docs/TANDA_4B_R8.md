# TANDA 4b de R8 — un SPC de último momento

**Fecha:** 07/08/2026 · **Branch:** `fix/spcs-r8-tanda-4b` · **Pedido:** Yesi, después del cierre de la tanda 4.

Un solo nombre: **`LE CHAT MIMOUS`**. Circuito exprés de siempre — cruce contra `spcs`,
scrape del Stud Book, gate, alta. Padrón crudo en `data/r8_tanda_4b.txt`.

> **Estado: propuesta.** 1 alta. `spcs` 178 → 179. Cero casos no resueltos, cero alertas
> del scrape, 5/5 guards limpios.

---

## 0. Guards de arranque

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| branch | `fix/spcs-r8-tanda-4b` desde `main` (`08f291a`) | ✅ |
| `SELECT count(*) FROM spcs` | 178 (cierre de la tanda 4) | ✅ 178 |

---

## 1. Cruce contra la base — no está

`spcs` tiene 178 filas (62 con `studbook_id`). El scan por radical devuelve **una sola**
fila y no es el mismo ejemplar:

```sql
SELECT ... FROM spcs
WHERE nombre ~* '(CHAT|MIMO|GATO|MINOU|MIMOU)'
   OR padrillo_nombre ~* '(CHAT|MIMO)' OR madre_nombre ~* '(CHAT|MIMO)';
```

| fila | por qué no es | |
|---|---|---|
| `ABELITO MIMOSO` · sb 439663 | **macho**, 2022-11-10, Magic Stripes / Fairy Mosa | otro ejemplar |

Es alta de la tanda 4 y comparte apenas el radical `MIMO`. Ninguna otra fila de `spcs`
toca `CHAT`, `MIMOU`, `ASSASSIN` ni `CHATEAU`.

> ⚠ `unaccent()` **no está instalada** en la base — el scan acento-insensible de las tandas
> anteriores hay que hacerlo con regex plano (`~*`) o `translate()`. Anotado para la próxima.

---

## 2. Scrape — el SB devolvió la grafía exacta

Un único match exacto. **No hubo ambigüedad que reportar.**

| nombre | sb_id | nac | sexo | pelo | padre / madre | tomo/folio |
|---|---|---|---|---|---|---|
| **LE CHAT MIMOUS** | **421129** | 2020-09-18 | hembra | Zaino | Bodemeister (USA) / Le Chat Assassin | 1232/637 |

Leyenda `(2020 H SP)` · `raza = 4` (SPC) · bandera argentina · abuelo materno
Exchange Rate (USA) · perfil: <https://www.studbook.org.ar/ejemplares/perfil/421129/le-chat-mimous>

Evidencia: `data/spcs_r8_tanda_4b_scrape.json`. 0 alertas.

### La grafía francesa — sondeada igual

El pedido decía probar variantes cercanas si el SB no devolvía el nombre exacto. Devolvió el
exacto, pero la sonda se corrió igual para dejar registro de que **no hay ninguna variante
competidora**. Resultado en `data/spcs_r8_tanda_4b_variantes.json`:

| término | hits | lectura |
|---|---|---|
| `LE CHAT` | 14 | 9 son `LE CHAT <algo>`; **una sola** es MIMOUS |
| `CHAT MIMO` | 0 | — |
| `MIMOUS` | 0 | — |
| `MIMOU` | 0 | — |
| `MIMOSA` | 15 | ninguna empieza con `LE CHAT` |

> **Hallazgo del circuito, para las próximas tandas**: el autocomplete del SB matchea por
> **prefijo**, no por substring. Por eso `MIMOUS`, `MIMOU` y `CHAT MIMO` dan 0 hits *por
> construcción*, no porque el caballo no exista. Buscar una grafía dudosa por el final del
> nombre siempre va a dar vacío — hay que atacar por el prefijo (acá, `LE CHAT`).

La familia completa que devuelve el prefijo `LE CHAT`, toda descendiente de `Le Chateau (USA)`:

```
9533    LE CHAT           1968  M  Argos / Micifusa
341714  LE CHAT ASSASSIN  2014  H  Exchange Rate (USA) / Le Chateau (USA)   <- la madre
332963  LE CHAT BOTTE     2013  M  Sidney's Candy (USA) / Le Chateau (USA)
455444  LE CHAT KORAT     2025  H  King Guillermo (USA) / Le Chat Violet
437055  LE CHAT MALEVOLO  2022  M  Santillano / Le Chat Assassin            <- medio hermano
421129  LE CHAT MIMOUS    2020  H  Bodemeister (USA) / Le Chat Assassin     <- el pedido
314222  LE CHAT NOIR      2011  H  Easing Along (USA) / Le Chateau (USA)
434205  LE CHAT SIAMOIS   2022  H  Equal Stripes / Le Chat Violet
358610  LE CHAT VIOLET    2016  H  Violence (USA) / Le Chateau (USA)
```

La grafía se sostiene **estructuralmente**, no por parecido de letras: la madre es
`Le Chat Assassin` y el criadero viene nombrando toda la línea `LE CHAT <adjetivo francés>`
(`BOTTE`, `NOIR`, `SIAMOIS`, `VIOLET`, `KORAT`, `MALEVOLO`). `MIMOUS` encaja en esa serie.
`LE CHAT MALEVOLO` es medio hermano materno — misma madre, distinto padre.

---

## 3. Guards antes de escribir — 5/5 limpios

| guard | esperado | real |
|---|---|---|
| `spcs` total | 178 | ✅ 178 |
| `studbook_id = '421129'` ocupado | 0 | ✅ 0 |
| `nombre ~* '(CHAT\|MIMOU\|ASSASSIN\|CHATEAU)'` | 0 | ✅ 0 |
| parientes `LE CHAT` en la base (sb 341714/437055/434205/358610/455444) | 0 | ✅ 0 |
| `padrillo_nombre ~* 'BODEMEISTER'` | 0 | ✅ 0 |

Los guards (c) y (d) son la lección `ESPLENDID CRAF` de la tanda 3: la idempotencia del
INSERT es por `studbook_id`, y **no ve** una fila preexistente del mismo caballo escrita
distinto y con `studbook_id` NULL. Por eso el scan por radical va aparte.

---

## 4. Migración

`migrations/spcs_r8_tanda_4b.sql` — 1 INSERT idempotente (`WHERE NOT EXISTS` sobre
`studbook_id`), envuelto en `BEGIN; … COMMIT;` con tres SELECT de verificación antes del
`COMMIT`.

`caballeriza_id`, `entrenador_id`, `jockey_habitual_id`, `club_id` y `registro_stud_book`
quedan NULL, como en todas las tandas: los dos primeros los asigna Yesi al inscribir, los
SPCs son globales, y `registro_stud_book` en la base es seed legacy (`SB-D001…`) — el
identificador real del SB va en `studbook_id`.

---

## 5. Herramientas — el circuito quedó parametrizado

Dos cambios en `tools/`, los dos read-only contra la DB:

- **`studbook_scrape_tanda.mjs`** ahora toma el archivo de nombres, el label de tanda y el
  snapshot por argv:
  ```bash
  node tools/studbook_scrape_tanda.mjs <out.json> [nombres.txt] [tanda] [snapshot_spcs]
  ```
  Sin `nombres.txt` usa la lista hardcodeada de la tanda 4, así que la evidencia de aquella
  sigue siendo reproducible. El archivo de nombres ignora líneas vacías y las que arrancan
  con `#`.
- **`studbook_probe_terms.mjs`** (nuevo) — sonda exploratoria: vuelca los hits crudos de
  varios términos del autocomplete, sin clasificar ni proponer nada. Es la herramienta para
  el caso "el nombre que mandó Yesi no da match exacto".

---

## 6. Pendientes

Ninguno bloqueante.

1. **`unaccent()` no instalada** — los scans acento-insensibles de las tandas 1–4 documentados
   en `CIRCUITO_ALTA_SPCS_R8.md` no corren tal cual por MCP. Usar `~*` plano o `translate()`.
   Post-hito.
2. Los pendientes de la tanda 4 (duplicados de caballerizas, `MALENA GUSTAVO`, deuda de
   modelado de `hipodromo_patente`) siguen abiertos y **no los toca esta tanda**.
