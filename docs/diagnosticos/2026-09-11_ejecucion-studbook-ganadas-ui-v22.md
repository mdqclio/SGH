# Stud Book — ejecución completa: backfill de ganadas ✓ · UI ✓ · formatter ✓ · reunion-json v22 ✓

**Fecha:** 2026-09-11 (noche) · **`main`:** `4144a91` · **Branch:** `feat/studbook-condicion-5-campos` @ `06183dd` (pusheada, **sin mergear a `main`** — con tu OK; `carta-llamados.html` en prod sigue siendo el de `main` hasta el merge) · **Anterior:** `2026-09-11_ejecucion-studbook-paso1-ddl-vista-previa.md`
**Escrituras:** `apply_migration carreras_ganadas_backfill` (46 UPDATE) · `deploy_edge_function reunion-json` → **v22**.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 203 | ✅ |
| ref | `unlhcuanfrtpatoipwve` | ✅ |

---

## 1. Backfill (2.b) — 46 filas, distribución exacta

`apply_migration carreras_ganadas_backfill`: el UPDATE del SQL dentro de un `DO` que aborta si `ROW_COUNT <> 46`, si queda alguna con texto y sin `desde`, o si la distribución no es **25 / 3 / 13 / 1 / 3 / 1 + 3 (NULL,NULL)**. `{"success":true}`. Idempotente: un segundo run da 0 filas y aborta por diseño (`ROW_COUNT <> 46`) — o sea, no se puede correr dos veces por accidente.

---

## 2. UI — `carta-llamados.html` (en la rama)

| dónde | qué |
|---|---|
| `:353-360` | dos `form-group` nuevos después de "Edad máxima": `#f-ganadas-desde` (placeholder "0 = perdedores") y `#f-ganadas-hasta` (placeholder "vacío = o más"), `min=0 max=50` |
| `:1152-1153` | carga del modal con `rec?.ganadas_desde ?? ''` (no `||`: el 0 tiene que mostrarse) |
| `:1218-1219` | payload con `value !== '' ? parseInt(...) : null` (no truthy: "0" viaja como 0) |

Probe nuevo, sin red, extrae esas 4 líneas del HTML real y las corre con un `document` stub — `tests/probe_ganadas_carta_llamados.mjs`: **10/10** ("0"/"0" → 0/0 · "2"/"" → 2/null · ""/"" → null/null · carga de 0 muestra 0 · carga de null muestra "" · alta sin registro → ""/"").

Hasta el merge, Yesi ve la carta sin los inputs; las 11 de R9 ya tienen `ganadas` por el backfill, así que para el domingo no le falta cargar nada.

---

## 3. Formatter + deploy — `reunion-json` v22

`studbook_format.mjs:325-326`: `ganadadesde: c.ganadas_desde ?? null`, `ganadahasta: c.ganadas_hasta ?? null` (con el comentario de la convención y de que un tope se traduce ahí).

Procedimiento, el mismo de v18/v19 (`docs/DEPLOY_JSON_V2.md`, CHANGELOG 23/08):

| paso | resultado |
|---|---|
| `_build/build.mjs` | BUILD OK · imports relativos 0 · bundle 31.852 B (sha `e446a31c…`) |
| `_build/slim.mjs` | SLIM OK · 16.017 B |
| diff slim nuevo vs slim de `main` (= fuente vivo de v21, sha `5798ef6f…` verificado con `get_edge_function`) | **exactamente 2 líneas**: las de `ganadadesde/ganadahasta` |
| dry-run `tests/dryrun_reunion_json.mjs 2026-08-16` (R8, datos reales, mismo builder) | ✅ estructura válida, 2 carreras computables; `condicion` de ambas: `{"ganadadesde":0,"ganadahasta":0}` — y R8 T12 sale `"sexo":"hembras"` (el fix del paso 1) |
| rollback pre-staged | `_build/rollback_v21.ts` (= slim de `main`) |
| `deploy_edge_function` con `verify_jwt:false` | **v22**, ACTIVE, `ezbr_sha256 f07f5727…` |
| smoke en frío | sin token → **401**; token malo → **401** `{"status":401,"error":"unauthorized"}`. La función arranca (un import roto daría 5xx en frío, no un 401 del propio código) |
| smoke 200 | **no se pudo desde el VPS**: `STUDBOOK_API_TOKEN` es secret de la función, no está en `.env` (sólo `SUPABASE_SECRET_KEY`). Cubierto por el dry-run local con el mismo `_shared`. **Sin verificar** el 200 en caliente — lo verifica Diego o vos con el token |
| logs edge-function | vacíos (sin errores de boot en la ventana) |

Salida cruda del dry-run:
```

=== 2026-08-16 · reunión 7 (finalizada) · 12 carreras en DB ===

ANTES (filtro es_oficial):  8 carreras
      #1 Oficial No Computable  10 comp · oficial
      #7 Oficial No Computable   6 comp · oficial
      #3 Oficial No Computable  12 comp · oficial
      #4 Oficial No Computable   8 comp · oficial
      #8 Oficial No Computable   8 comp · oficial
      #5 Oficial No Computable   8 comp · oficial
      #6 Oficial Computable      8 comp · oficial
      #2 Oficial Computable      7 comp · oficial

AHORA (+ es_computable):    2 carreras
      #6 Oficial Computable      8 comp · oficial
      #2 Oficial Computable      7 comp · oficial

✅ estructura válida · 11.7 KB emitidos (antes 51.1 KB)
CONDICIONES: [{"numero":"6","condicion":{"texto":"Todo caballo de 5 años y más edad perdedores","edaddesde":null,"edadhasta":null,"sexo":"T","ganadadesde":0,"ganadahasta":0}},{"numero":"2","condicion":{"texto":"Yeguas de 4 y 5 años perdedoras","edaddesde":null,"edadhasta":null,"sexo":"hembras","ganadadesde":0,"ganadahasta":0}}]
```

---

## 4. Lo que queda en la rama, para el merge

`feat/studbook-condicion-5-campos` @ `06183dd`: `carta-llamados.html`, `_shared/studbook_format.mjs`, `_build/index.ts` + `index.slim.ts` + `rollback_v21.ts`, `migrations/fix_condicion_sexo_r6_r7_r8.sql` y `migrations/carreras_ganadas_desde_hasta.sql` (los dos marcados EJECUTADA), `tests/probe_ganadas_carta_llamados.mjs`, entrada `[2026-09-11 noche, 5]` en CHANGELOG. **Merge con tu OK** — es lo que pone los inputs en `sigh.com.ar`.

Estado de los 5 campos para Diego, hoy en producción (v22):

| campo | fuente | R9 | retro |
|---|---|---|---|
| `edaddesde` | `edad_minima_anos` | 11/11 | R8 12/12 NULL (derivable del texto, otro OK) |
| `edadhasta` | `edad_maxima_anos` | 11/11 (NULL = y +) | idem |
| `sexo` | `condicion_sexo` (`T` / `machos` / `hembras`) | 11/11 | 0 desacuerdos texto/columna en las 49 |
| `ganadadesde` / `ganadahasta` | **nuevas** | 11/11 | 46/49 (las 3 de la 9999 en NULL) |

Pendientes que no son de esta tanda: 10 DNI de entrenadores (Yesi), pista con labels (Diego), `edad` de R8, doc del endpoint (Diego).

---

## 5. Verificación de push

```
$ git ls-remote origin feat/studbook-condicion-5-campos
06183ddf2cf74f96ad5d048ebc6f559d250ccaf3	refs/heads/feat/studbook-condicion-5-campos
$ git push origin reports
$ git ls-remote origin reports
9865d7df0ca738a948004ad9cde8fe087e2b647a	refs/heads/reports
$ git rev-parse HEAD
9865d7df0ca738a948004ad9cde8fe087e2b647a
```
