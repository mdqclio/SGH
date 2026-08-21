# Caballeriza en el JSON de Diego — nombre puro + procedencia

**Fecha**: 2026-08-06 · **Proyecto**: `unlhcuanfrtpatoipwve` (SGH) · **Branch**: `tmp/caballerizas-diego`
**Alcance**: `reunion-json` únicamente. Export de **lectura pura** — no toca el circuito del día de carrera.
**Guard**: `pwd = /home/clio/dev/SGH`, prod = Edge Function `reunion-json`, reunión de contraste R6 (`b02ca761-6f44-4720-86aa-a3c3099019ea`, 2026-06-20, 8 carreras, 81 competidores).

---

## Resultado en una línea

🟢 **v16 → v17.** `procedencia` ya estaba bien; **`nombre` salía sucio** en 6 de los 81 competidores de R6. Ajustado y deployado. El JSON de producción es **byte a byte idéntico** al generado localmente, y difiere del anterior **sólo** en esos 6 nombres.

---

## 1. Verificación previa — qué emitía el build vivo

Se regeneró el build desde los fuentes (`_build/build.mjs`) y se corrió contra los datos reales de R6. El build salió **byte a byte idéntico** al `_build/index.ts` que estaba vivo, y su JSON **idéntico** a la referencia `tools/_out/r6_v2.json` (114035 chars, 8 carreras, 81 competidores). O sea: lo medido es exactamente lo que estaba en producción.

Competidor de muestra (carrera 1, primer competidor), tal como salía **antes**:

```json
{
  "idCarreraInt": "803a4268-69ef-4c71-a6c2-981abe494d39",
  "puesto": "4",
  "orden": "1",
  "ejemplar": { "nombre": "Conesera", "id": null },
  "kilos_ejemplar": "55",
  "jockey_inscripto": { "nombre": "IGNACIO DELLI QUADRI", "dni": null, "cuit": null },
  "cuidador": { "nombre": "ADRIAN ALFREDO ALDAY", "dni": "[REDACTADO]", "cuit": null },
  "caballeriza": {
    "nombre": "Abuelo Calin",
    "id": "7f7cee40-beed-42fb-807a-70c900259be5",
    "descripcion_chaquetilla": null,
    "procedencia": "DOL"
  },
  "jockey_kilos": "55.00",
  "cuerpos": { "id_interno": 4, "nombre": "½ cbz" },
  "pagaria": "4.6"
}
```

### Veredicto por punto

| lo que pide Diego | estado antes del ajuste |
|---|---|
| procedencia en **campo aparte** | ✅ ya estaba: `caballeriza.procedencia`, poblado por `procedenciaCaballeriza()` |
| **nombre puro**, sin el `(XX)` pegado | ❌ **no**: `nombre` viajaba crudo desde la DB |

Los 6 competidores (de 81) que salían con el sufijo pegado:

| carrera | caballeriza — antes | procedencia |
|---|---|---|
| 1 | `EL GALPON LOBOS (DOL)` | `DOL` |
| 3 | `LA BETTY (TDL)` | `TDL` |
| 3 | `GARIN CITY (LP)` | `LP` |
| 4 | `CAROSUEÑO (DOL)` | `DOL` |
| 5 | `ERICK (TDL)` | `TDL` |
| 7 | `CAROSUEÑO (DOL)` | `DOL` |

O sea: la procedencia ya viajaba bien en su campo, **y además** duplicada dentro del texto del nombre.

---

## 2. El ajuste

`supabase/functions/_shared/studbook_format.mjs` — se agrega `nombreCaballerizaLimpio()` y se usa en `caballeriza.nombre`:

```js
function nombreCaballerizaLimpio(cab) {
  if (!cab || !cab.nombre) return cab?.nombre ?? null;
  const limpio = String(cab.nombre).replace(/\s*\([^)]+\)\s*$/, '').trim();
  return limpio || cab.nombre;
}
```

Criterio: saca **exactamente** el paréntesis final que lee `procedenciaCaballeriza()`, ningún otro. Si al sacarlo no queda nada, devuelve el nombre original — no se emite un nombre vacío.

`procedencia` **no se tocó**: sigue siendo `hipodromo_patente` si existe, y el sufijo del nombre como fallback.

El módulo es compartido con el generador CLI (`tools/studbook_reunion_json.mjs`), así que ambos siguen dando el mismo output.

### ⚠️ Colisión de nombres puros — para que Diego lo sepa

Al sacar el sufijo, dos caballerizas **distintas** pueden quedar con el mismo `nombre`. Hoy pasa en dos casos, ambos en Dolores:

| nombre puro | filas en DB | patente de cada una |
|---|---|---|
| `CAROSUEÑO` | `CAROSUEÑO` + `CAROSUEÑO (DOL)` | `DOL` / `(NULL)` |
| `SANTA BARBARA` | `SANTA BARBARA` + `SANTA BARBARA (DOL)` | `(NULL)` / `DOL` |

Se desambiguan por **`caballeriza.id`** (UUID), que ya viaja en el mismo objeto. Son duplicados de padrón que conviene unificar del lado nuestro; no es un problema del JSON.

---

## 3. Gate de código

| chequeo | resultado |
|---|---|
| build reproducible desde fuentes antes de tocar nada | ✅ byte a byte igual al `_build/index.ts` vivo (`sha256 1cacd37d…`) |
| imports relativos restantes en el build | **0** |
| líneas `import` en total | **1** (la de `esm.sh`) |
| `export` sueltos | **0** |
| marcadores de los 3 módulos + `nombreCaballerizaLimpio` | todos presentes |
| `tsc --noEmit` — errores de **sintaxis** (TS1xxx) | **0** |
| `tsc --noEmit` — errores de tipos (TS2xxx) | 5, los esperados: import por URL + global `Deno` |

### Diff estructural contra el JSON del paso 1

No es diff de líneas: se comparan los dos JSON **por path**, recursivo.

```
diferencias totales: 6

por campo:
  6x  /data/carreras[]/competidores[]/caballeriza/nombre
```

| path | antes | ahora |
|---|---|---|
| `carreras/0/competidores/4` | `EL GALPON LOBOS (DOL)` | `EL GALPON LOBOS` |
| `carreras/2/competidores/5` | `LA BETTY (TDL)` | `LA BETTY` |
| `carreras/2/competidores/6` | `GARIN CITY (LP)` | `GARIN CITY` |
| `carreras/3/competidores/1` | `CAROSUEÑO (DOL)` | `CAROSUEÑO` |
| `carreras/4/competidores/1` | `ERICK (TDL)` | `ERICK` |
| `carreras/6/competidores/6` | `CAROSUEÑO (DOL)` | `CAROSUEÑO` |

**Ningún otro campo se movió.** `procedencia` idéntico en los 81 competidores.

---

## 4. Rollback pre-staged

`supabase/functions/reunion-json/_build/rollback_v16.ts` — copia byte a byte del build que estaba vivo, capturada **antes** de rebuildear. Commiteada en `01f98fe`.

`sha256 = 1cacd37d3ccd7d33bc9d8ec077197c42d43b7554c68d1e858d6ca09328eefa4d` (25861 bytes).

Que el fuente vivo era ése quedó probado por contenido y por comportamiento: el JSON que devolvía producción para R6 antes del deploy tiene `sha256 d4061413f895b9c46d6aaf7f5c69c7b3ccbe8beba20e582d603987d264e46ad9`, **idéntico** al generado localmente con ese build.

Para volver atrás:

```
mcp__supabase__deploy_edge_function(
  name           = "reunion-json",
  entrypoint_path= "index.ts",
  verify_jwt     = false,          # CRÍTICO: la función NO usa JWT
  files          = [{ name: "index.ts",
                      content: <contenido de _build/rollback_v16.ts> }]
)
```

⚠️ **`verify_jwt` tiene que ir en `false`.** Diego llama sólo con el token, sin anon key. En `true` se rompe aunque el código esté bien.

---

## 5. Baseline pre-deploy (v16, producción)

| fecha | HTTP | bytes | sha256 |
|---|---|---|---|
| `260620` (R6) | 200 | 114077 | `d4061413f895b9c46d6aaf7f5c69c7b3ccbe8beba20e582d603987d264e46ad9` |
| `990101` (fixture 9999) | 200 | 318 | `851aabc59162d3a1d538fc3bfb56ea61afb754ff273ec77ac60b9c437610a75f` |

---

## 6. Deploy

| | antes | después |
|---|---|---|
| **version** | 16 | **17** |
| **updated_at** | 2026-08-04T00:32:40Z | **2026-08-06T13:19:29Z** |
| **ezbr_sha256** | `109b19c92ddae7ebc750bd99e0b1d1cf9b282da47a9e1cd6e1e25087f04c714f` | **`0cb1b32267f6418d4c69a19554b8d132e0d97bbe97dfd74f6afc55dd24e0153d`** |
| **verify_jwt** | false | false (sin cambio) |

Se envió `_build/index.ts` **tal cual**, sin recortar comentarios — la deuda que había dejado el deploy de la v16.

---

## 7. Verificación por contenido del fuente deployado

Traído con `get_edge_function` después del deploy:

| qué | estado |
|---|---|
| comentarios completos, sin condensar (deuda de la v16) | ✅ **resuelto** — el fuente vivo coincide con `_build/index.ts` |
| `function nombreCaballerizaLimpio(cab)` | ✅ presente |
| `nombre: nombreCaballerizaLimpio(cab)` dentro de `caballeriza` | ✅ presente |
| `procedencia: procedenciaCaballeriza(cab)` | ✅ presente, sin cambios |
| 4 marcadores `// ---------- inline:` | ✅ los 4 |
| `carrerasVisibles` con `cat?.es_oficial === true` | ✅ presente |
| `renumerarChapas` / `resolverChapa` / `CHAPAS_CODIGO_A_ID` | ✅ presentes |
| imports | 1 solo, `esm.sh`; **0** relativos |
| `url.searchParams.get('token')` | ✅ **AUSENTE** |

---

## 8. Verificación funcional en producción

Token leído de `~/secrets/studbook_token_2026-08.txt`, sin imprimirlo.

| llamada | esperado | obtenido |
|---|---|---|
| `fecha=260620` con `Authorization: Bearer` | 200 | ✅ **200**, 114042 bytes |
| sin header | 401 | ✅ 401 |
| `Authorization: Bearer no-es-el-token` | 401 | ✅ 401 |
| `?fecha=260620&token=<válido>` (query string) | 401 | ✅ **401** — la vía sigue muerta |
| `fecha=990101` (fixture) | igual que antes | ✅ 318 bytes, sha256 sin cambios |

### JSON de R6 byte-comparado contra el esperado

```
sha256 producción : 6757ca9779dbb47e2b8c162bd5cdd22c83b02ffba720c941b8a36fd01775c31c
sha256 esperado   : 6757ca9779dbb47e2b8c162bd5cdd22c83b02ffba720c941b8a36fd01775c31c
IDÉNTICOS byte a byte ✅
```

114077 → 114042 bytes: **-35**, que son exactamente los 6 sufijos sacados (` (DOL)`×3 = 18, ` (TDL)`×2 = 12, ` (LP)` = 5).

---

## 9. Tabla de procedencias para Diego

Consulta pedida, tal cual (read-only, sin escrituras):

```sql
SELECT hipodromo_patente, count(*) FROM caballerizas
WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
GROUP BY 1 ORDER BY 2 DESC;
```

| `hipodromo_patente` | caballerizas |
|---|---|
| `DOL` | 216 |
| **NULL** | **65** |
| **total** | **281** |

De esas 65 sin patente, 8 igual resuelven procedencia por el sufijo del nombre; **57 quedan sin procedencia de ningún lado** → salen con `"procedencia": null` en el JSON.

### Procedencia **efectiva** (lo que realmente ve Diego)

`hipodromo_patente`, y si es NULL el sufijo `(XX)` del nombre:

| procedencia | caballerizas |
|---|---|
| `DOL` | 218 |
| *(sin dato → `null`)* | 57 |
| `AZ` | 2 |
| `TDL` | 2 |
| `LP` | 1 |
| `SL` | 1 |

⚠️ El único `SL` es `PRUEBA 9999 — BORRAR Stud (SL)`, de la reunión de prueba 9999. **No se borra por ahora**: Fede la usa para las pruebas de pagos. Ver §11.

### Texto para pegar en el mail

> Diego: la caballeriza ya te viaja con el nombre puro y la procedencia en campo aparte.
>
> ```json
> "caballeriza": {
>   "nombre": "LA BETTY",
>   "id": "…uuid…",
>   "descripcion_chaquetilla": null,
>   "procedencia": "TDL"
> }
> ```
>
> Cambió sólo eso: antes el nombre venía como `LA BETTY (TDL)`, con la procedencia repetida adentro del texto. En la reunión del 20/06 eran 6 de 81 competidores; el resto del JSON no se movió ni un byte.
>
> `procedencia` sale de la patente del hipódromo de la caballeriza; si no la tiene cargada, del sufijo del nombre; si no hay ninguna de las dos, va `null`.
>
> Cómo está hoy el padrón de Dolores — 281 caballerizas:
>
> | procedencia | caballerizas |
> |---|---|
> | DOL | 218 |
> | (sin dato → `null`) | 57 |
> | AZ | 2 |
> | TDL | 2 |
> | LP | 1 |
> | SL | 1 |
>
> Esas 57 sin dato son caballerizas que no tienen la patente cargada y cuyo nombre tampoco trae el sufijo. Las vamos a ir completando; mientras tanto te llegan con `procedencia: null`, nunca con un valor inventado.
>
> Un detalle: al sacar el sufijo, dos caballerizas distintas pueden quedar con el mismo `nombre` (hoy pasa con CAROSUEÑO y con SANTA BARBARA, que están duplicadas en nuestro padrón). Si necesitás distinguirlas, usá el `id`, que es único.

---

## 10. Decisión: las 57 sin procedencia se quedan en `null`

**No se backfillea `hipodromo_patente`.** Ni en bloque ni ficha por ficha. Decidido por Leo el 06/08.

Poner `DOL` por defecto es **inventar un dato registral**. Si alguna de esas 57 es un stud de afuera, le estaríamos mintiendo a Diego justo en el campo que usa para desambiguar procedencia — y una mentira plausible es peor que un hueco, porque no se detecta.

`null` es la respuesta honesta: **sin dato ≠ dato local**. El JSON ya lo emite así, y el criterio del builder (`patente → sufijo → null`, sin fallback inventado) es exactamente el correcto. No hay nada que arreglar acá.

El backfill real sale gratis con el tiempo, por dos vías que ya existen:
- **Yesi** completa la patente cuando toca cada ficha en el ABM de caballerizas.
- El **auto-registro** da de alta los studs nuevos con el dato fresco de origen.

O sea: el set de 57 se drena solo, con dato verdadero, sin una migración que adivine.

## 11. Estado y pendientes

- Deployado, verificado y **mergeado a `main`**.
- **Duplicados de padrón** `CAROSUEÑO` / `SANTA BARBARA` — unificar del lado nuestro. Abierto.
- ⚠️ `PRUEBA 9999 — BORRAR Stud (SL)` **NO se toca**. Diego ya no la usa, pero **las pruebas de pagos de Fede sí**. El teardown (`teardown_prueba_resumen_9999.sql`) sigue gateado como siempre: no se corre sin confirmación.
- `supabase/functions/*/_build/r6_build.json` agregado al `.gitignore`: es artefacto generado y se coló en un commit anterior.
