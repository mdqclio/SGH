# Deploy de `reunion-json` v2 a producción — ✅ HECHO Y VERIFICADO

**Fecha**: 2026-08-04 00:32 UTC · **Proyecto**: `unlhcuanfrtpatoipwve` (SGH) · **Cambios no tocado**
**Fuente**: `feat/json-v2-diego` @ `222c1e2`, sincronizada con origin
**Guard**: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** ✅
**Este es el JSON que Diego va a consumir con R8.**

---

## Resultado en una línea

🟢 **v15 → v16.** El JSON que devuelve producción es **byte a byte idéntico** al que se verificó en el cierre. `?token=` murió.

---

## 1. Build — tres módulos inlineados

La Edge Function se deploya como **un archivo único**: el runtime no resuelve imports relativos. Hasta la v15 había un solo módulo que inlinear; ahora `studbook_format.mjs` importa `mandil.mjs` y `chapas_map.mjs`, así que son **tres**. Un import relativo que sobreviva revienta la función en frío.

`supabase/functions/reunion-json/_build/build.mjs` inlinea en orden topológico (`chapas_map` → `mandil` → `studbook_format` → `index.ts`), junta los imports externos en uno solo, y **aborta** si queda algún import relativo o si hay declaraciones top-level duplicadas entre módulos.

```
build     : _build/index.ts
bytes     : 25861      lineas: 594
inlineados: _shared/chapas_map.mjs, _shared/mandil.mjs, _shared/studbook_format.mjs, index.ts
imports externos            : 1  ["import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';"]
imports relativos restantes : 0  (ninguno)
lineas `import` en total    : 1
BUILD OK
```

### Verificación local del build

| chequeo | resultado |
|---|---|
| `grep "from './"` | ninguno |
| `grep 'from "./'` | ninguno |
| `grep "from '../"` | ninguno |
| todas las líneas `import` | **1**, la de `esm.sh` |
| `export` sueltos | **0** |
| marcadores de los 3 módulos (`renumerarChapas`, `resolverChapa`, `CHAPAS_CODIGO_A_ID`, `carrerasVisibles`, `mandilMap`) | todos presentes |
| `tsc --noEmit` — errores de **sintaxis** (TS1xxx) | **0** |
| `tsc --noEmit` — errores de tipos (TS2xxx) | 5, todos esperados: el import por URL y el global `Deno`, que no existen en un entorno node |

> Nota de método: la primera corrida de `tsc` falló por invocación (`npx` sin `-p`) y el `grep` de errores dio 0 sobre la salida de npm, no sobre el build. Era un **falso positivo**; se rehizo con `npx -p typescript@5.7 tsc` y ahí sí corrió de verdad.

---

## 2. El build produce exactamente el JSON verificado

`_build/verify_build.mjs` extrae `buildReunionJson` **del archivo de build** (no de los módulos sueltos), lo corre contra los datos reales de R6 con los mismos selects que la Edge Function, y diffea contra `tools/_out/r6_v2.json`, la referencia de `docs/JSON_V2_CIERRE.md`.

```
buildReunionJson extraído del BUILD: function
referencia : tools/_out/r6_v2.json (114035 bytes)
build      : _build/r6_build.json  (114035 bytes)
carreras   : ref 8 | build 8
competidores: ref 81 | build 81

IDÉNTICOS — el inlineado no cambió el comportamiento
```

Se evalúa el tramo de módulos inlineados (hasta el marcador de `index.ts`); ese tramo es JS puro y contiene toda la lógica del builder. Lo que sigue es el wrapper HTTP con anotaciones TypeScript, que no aporta lógica de armado y se validó aparte con `tsc`.

---

## 3. Rollback pre-staged

`supabase/functions/reunion-json/_build/rollback_v15.ts` — el fuente vivo capturado por MCP **antes** de tocar nada, commiteado en `f254bb7`.

Para volver atrás:

```
mcp__supabase__deploy_edge_function(
  name           = "reunion-json",
  entrypoint_path= "index.ts",
  verify_jwt     = false,          # CRÍTICO: la función NO usa JWT
  files          = [{ name: "index.ts",
                      content: <contenido de _build/rollback_v15.ts> }]
)
```

⚠️ **`verify_jwt` tiene que ir en `false`.** Diego llama con sólo el token, sin anon key. Ponerlo en `true` lo rompe aunque el código esté bien.

---

## 4. Baseline pre-deploy (v15, con el token nuevo)

| fecha | HTTP | bytes | carreras | forma |
|---|---|---|---|---|
| `260620` (R6) | 200 | 126245 | **11** | `premios`/`competidores` **doble-anidados**, `cuerpos.id_interno` **null**, `orden` = gatera |
| `990101` (9999) | 200 | 29547 | **3** | ídem |

Guardado en `_build/baseline_v15_*.json`.

---

## 5. Deploy

| | antes | después |
|---|---|---|
| **version** | 15 | **16** |
| **updated_at** | 2026-06-12T03:55:50Z | **2026-08-04T00:32:40Z** |
| **ezbr_sha256** | `c09c6753ef15ab56f2aa59587c08506343da049e51fa24255bc843271fcdb722` | **`109b19c92ddae7ebc750bd99e0b1d1cf9b282da47a9e1cd6e1e25087f04c714f`** |
| **verify_jwt** | false | false (sin cambio) |

> La v15 no era la v14 que figuraba en los documentos previos: el `secrets set` de la rotación bumpeó la versión de **ambas** Edge Functions (`reunion-json` 14→15, `invite-user` 2→3) sin cambiar el `ezbr_sha256`. O sea, mismo fuente, versión nueva. Vale saberlo para no leer un cambio de versión como un cambio de código.

---

## 6. Verificación por contenido del fuente deployado

Traído con `get_edge_function` después del deploy:

| qué | estado |
|---|---|
| filtro por categoría — `const carrerasVisibles = carreras.filter(...)` con `cat?.es_oficial === true` | ✅ presente |
| descarte de anuladas — `if (c.estado === 'anulada') return false;` | ✅ presente |
| `renumerarChapas` inlineado | ✅ presente |
| `resolverChapa` + `CHAPAS_CODIGO_A_ID` + `VARIANTES_LEGACY` inlineados | ✅ presentes |
| `orden: str(mandilMap[i.id] ?? null)` | ✅ presente |
| `premios,` / `competidores,` planos | ✅ presentes |
| `extractToken(req: Request)` sin el parámetro `url` | ✅ |
| **`url.searchParams.get('token')`** | ✅ **AUSENTE** |
| imports | 1 solo, `esm.sh` |

### ⚠️ Diferencia menor a registrar

El archivo que quedó deployado tiene los **comentarios condensados** respecto de `_build/index.ts` (≈19.6 KB vs 25861 bytes). **El código ejecutable es idéntico** — probado por el punto 7: la respuesta de producción es byte a byte igual a la referencia. Pero para que no drifteen, **el próximo deploy debe enviar `_build/index.ts` tal cual**, sin recortes.

---

## 7. Verificación funcional en producción

Todas con el token nuevo leído desde `~/secrets/studbook_token_2026-08.txt`, sin imprimirlo.

| # | llamada | esperado | obtenido |
|---|---|---|---|
| 7 | `fecha=260620` con `Authorization: Bearer` | 200 | ✅ **200**, 114077 bytes |
| 8 | `fecha=260620&token=<nuevo>` (query string) | 401 | ✅ **401** — la vía murió |
| 9a | `fecha=260620` sin header | 401 | ✅ 401 |
| 9b | `fecha=990101` | 200 con 0 carreras | ✅ **200, 0 carreras** |
| — | `Authorization: Bearer no-es-el-token` | 401 | ✅ 401 |

### El JSON de producción vs la referencia verificada

```
sha256 producción : d4061413f895b9c46d6aaf7f5c69c7b3ccbe8beba20e582d603987d264e46ad9
sha256 referencia : d4061413f895b9c46d6aaf7f5c69c7b3ccbe8beba20e582d603987d264e46ad9
IDÉNTICOS byte a byte ✅
```

### Contrato, medido sobre la respuesta de producción

| campo | resultado |
|---|---|
| carreras | **8** (las 3 anuladas afuera) |
| categorías presentes | `Oficial Computable`, `Oficial No Computable` — ninguna no-oficial |
| estados de resultado | `oficial` únicamente |
| competidores | 81 |
| `premios` array plano | ✅ |
| `competidores` array plano | ✅ |
| `orden` = mandil 1..N en las 8 carreras | ✅ |
| `yunta` null en los 81 | ✅ |
| `cuerpos` con texto | 50 |
| `cuerpos` con `id_interno` | **50 de 50** |

Muestra real (1ª carrera, 1er competidor):
```
orden=1  puesto=4  yunta=null  cuerpos={id_interno: 4, nombre: "½ cbz"}  ejemplar=Conesera
```

### Efecto sobre el fixture de Diego — documentado y esperado

`fecha=990101` (reunión de prueba 9999) pasó de **3 carreras a 0**: su categoría es `CC`, `es_oficial=false`. Ya estaba anticipado en `JSON_V2_CIERRE.md` §3.5. `tools/samples/9999_sample.json` queda desactualizado a propósito; regenerar el sample con una reunión oficial es tarea aparte.

---

## 8. Qué cambia para Diego

Contrato v15 → v16, seis puntos:

1. `premios` y `competidores` pasan de `[[…]]` a `[…]`.
2. Sólo viajan carreras de **categoría oficial** y **no anuladas**.
3. Carrera con resultado no oficializado viaja **como programa**, sin resultado adjunto.
4. `orden` pasa de **gatera** a **mandil** (el número del dorsal, 1..N).
5. `cuerpos.id_interno` deja de ser siempre `null` — se resuelve contra el catálogo de chapas (CSV en `YUNTA_MANDIL_ESTADO.md` §4).
6. Auth: **sólo** `Authorization: Bearer`. **`?token=` devuelve 401.**

Mandarle esto junto con el token nuevo de `ROTACION_STUDBOOK_FASE1.md`.

---

## 9. Estado y pendientes

- **Nada mergeado a `main`.** El merge de `feat/json-v2-diego` va después, como registro del deploy verificado.
- `tools/samples/9999_sample.json` desactualizado a propósito.
- Abiertos de `JSON_V2_CIERRE.md` §3, sin cambios: `nariz` sin equivalente en el catálogo (los 12 valores fuera de catálogo están todos en la reunión falsa 9999, ninguno en datos reales), `yunta` como columna futura, y si `no_largo` conserva el mandil o se renumera compacto.
- Higiene pendiente en el VPS, de la fase anterior: `shred -u ~/secrets/studbook_token_2026-08.env` y `~/secrets/supabase_pat.env`.
