# JSON v2 — cierre del contrato con Diego

**Fecha**: 2026-08-03 · **Rama**: `feat/json-v2-diego` · **Deploy: NO incluido** (gate aparte)
**Proyecto**: `unlhcuanfrtpatoipwve` · **Guard**: `pwd = /home/clio/dev/SGH`, `spcs = 144` ✅
**Cero escrituras en la base.**

---

## 0. Corrección a la premisa: no había rebase que hacer

El pedido daba por hecho que `feat/json-v2-diego` (`fea359e`) estaba colgada de un `main` viejo. **Es al revés**: `fea359e` ya era **ancestro** de `main` (`35b32c2`).

```
git merge-base --is-ancestor fea359e main   → true
git log --oneline main..feat/json-v2-diego  → (vacío)
git log --oneline feat/json-v2-diego..main  → 67 commits
```

`main` ya traía el aplanado de `premios`/`competidores` **y** el filtro por `resultados.estado==='oficial'`. Un `rebase` habría dado una rama vacía. Se hizo **`git merge --ff-only main`** (fast-forward limpio, sin force-push) y los commits nuevos van encima.

Esto **corrige `docs/INTEGRACION_STUDBOOK_ESTADO.md` §4.3**, que decía que la rama "nunca se mergeó". Lo cierto: **está mergeada pero no deployada**. El deploy vivo es v14 del `2026-06-12T03:55Z`; `fea359e` se escribió el `2026-06-12T17:39Z`, 14 horas después. **La divergencia real es `main` ≠ deploy, no `main` ≠ rama.**

---

## 1. Los cambios

| commit | qué |
|---|---|
| `1adfbca` | filtro de oficiales por categoría |
| `0786c8e` | `orden` = mandil |
| `9472097` | `cuerpos.id_interno` |
| `359d6f2` | seguridad: sólo `Authorization: Bearer` |
| `08ba710` | fix: no filtrar datos de un resultado sin oficializar |
| `ed1c004` | probe: 40 asserts, unitarios + sincronización |

### 1.1 Filtro de oficiales — eje CATEGORÍA

El conjunto de carreras que viajan es **fijo**, dos condiciones y nada más:

```js
categorias_carrera.es_oficial === true  &&  carreras.estado !== 'anulada'
```

**El estado del resultado no filtra carreras.** Sólo decide si se adjunta el resultado:

```js
const resRaw = resByCarrera.get(c.id) || null;
const res    = resRaw?.estado === 'oficial' ? resRaw : null;
```

Una carrera con resultado **provisional** o **en_protesta** viaja igual, en modo programa: `estado: null`, `puesto: '0'`, sin `tiempo`, sin `estado_pista`, sin dividendos, competidores = ratificados.

Detalles:
- El eje es el **flag `es_oficial`**, nunca el `codigo`. El club `710d43c1` reusa `OC`/`ONC`/`CC` con otra semántica (ahí `ONC` es "Oficial No Clásico" y **es** computable). Ver `INTEGRACION_STUDBOOK_ESTADO.md` §2.2.
- **Fail-closed**: carrera sin `categoria_id`, o con una que no está en `catMap`, no viaja.
- `catMap` se pedía con `'id, nombre'`; se amplió a `'id, nombre, codigo, es_oficial, es_computable'` en los **dos** consumidores (Edge Function y CLI).

### 1.2 `orden` = mandil

`orden` mandaba `inscripciones.numero_partidor` (la **gatera**: cajón sorteado, con huecos). Ahora manda el **mandil** (número del dorsal, 1..N).

Se calcula con `renumerarChapas()` sobre **todas** las inscripciones de la carrera y se consulta por id:

```js
const mandilMap = renumerarChapas(insc);   // insc = inscByCarrera, SIN filtrar
...
orden: str(mandilMap[i.id] ?? null),
```

**No se renumera `comps`.** Con resultado, `comps` son los que tienen fila en `resultado_posiciones`, que no es exactamente el set de ratificados; renumerar ese array daría mandiles corridos respecto del programa y la carta de llamados ya impresos (`YUNTA_MANDIL_ESTADO.md` §3).

- El que **no largó** (`no_largo=true`) conserva su mandil y deja el hueco — sale gratis: sigue siendo ratificado.
- **Sin fallback a gatera.** Un competidor fuera del mapa sale `orden: null`. Mandar la gatera ahí sería mandar otra cosa con el mismo nombre.
- El sort de competidores pasa a mandil, con los sin-mandil al final.
- `yunta` sigue `null`: es columna futura, no existe en el schema.

`renumerarChapas` se **portó** a `supabase/functions/_shared/mandil.mjs` en vez de importar `renumerar-chapas.js`: el original es script de browser sin `export`, cargado como global por `resultados.html` y `ratificacion.html`. Agregarle `export` obligaría a pasar esos `<script>` a `type="module"` y rompería dos páginas de producción. La duplicación está cubierta por un test de sincronización.

### 1.3 `cuerpos.id_interno`

Nuevo `supabase/functions/_shared/chapas_map.mjs` con `resolverChapa(txt)`:

1. código exacto del catálogo → id
2. `"N cpos"` con N ≥ 5 → varios (id 17) + `n`
3. variante legacy conocida → id canónico
4. nada → `null`

**El texto de `nombre` nunca se reescribe.** Sólo se agrega el id.

Las variantes legacy van en un mapa **explícito**, revisado una por una, sin fuzzy matching — un match aproximado equivocado cambiaría el margen de llegada de una carrera oficial:

| valor en DB | → canónico | id |
|---|---|---|
| `1 cuerpo` | `1 cpo` | 10 |
| `2 cuerpos` | `2 cpos` | 12 |
| `3 cuerpos` | `3 cpos` | 14 |
| `5 cuerpos` | `5 cpos` | 17 (varios, n=5) |
| `cabeza` | `cza` | 5 |
| `media cabeza` | `½ cbz` | 4 |
| `pescuezo` | `pzo` | 7 |
| `3/4 cuerpo` | `¾ cpo` | 9 |
| `1 1/2 cuerpos` | `1½ cpo` | 11 |
| `2 1/2 cuerpos` | `2½ cpos` | 13 |

Mismo motivo que `mandil.mjs` para replicar `codigo→id` en vez de importar `chapas.js`. Los ids **no son contiguos** a propósito (persistidos por código, nunca se renumeran): el 20 va, por distancia, entre el 16 y el 17.

### 1.4 Seguridad — sólo `Authorization: Bearer`

`extractToken()` ya no lee `?token=` de la query string. Los query params quedan en logs de acceso, proxies e historial del cliente: era una vía de fuga del token independiente del chat (`ROTACION_STUDBOOK_FASE0.md` §1). Un cliente que llame con `?token=` ahora recibe 401.

No rompe a nadie: Diego no consume todavía, y el mensaje con el token nuevo de la rotación le va a indicar cómo llamar.

### 1.5 Fix encontrado por el probe

Al tratar una carrera con resultado provisional como programa, `comps` caía bien a los ratificados, pero los campos por competidor **seguían leyendo `posByInsc`**, que todavía tiene la fila de `resultado_posiciones` del provisional. Se publicaban **dividendos, márgenes y distanciamientos de un resultado sin oficializar** — justo lo que la regla de publicación quiere evitar.

Ahora la fila sólo se lee si `hasResult` (o sea, si el resultado está oficializado).

---

## 2. Verificación (sin deploy)

Todo contra el builder local, vía el CLI `tools/studbook_reunion_json.mjs`, que importa el mismo `_shared/studbook_format.mjs` que la Edge Function.

### 2.1 Probe — `node tests/probe_studbook_v2.mjs` → **40 OK · 0 FALLA**

Sin DB, sin browser, sin credenciales.

- **A. Sync `chapas_map.mjs` ↔ `chapas.js`**: 20 entradas, 19 con código, todos los `codigo→id` coinciden, el mapa no inventa códigos, el id de "varios" concuerda, el 20 sigue entre el 16 y el 17, toda variante legacy resuelve.
- **B. Sync `mandil.mjs` ↔ `renumerar-chapas.js`**: misma salida sobre fixtures con huecos de gatera, forfaits intercalados y gateras `null`.
- **C. Filtro**: no-oficial, anulada, sin categoría, categoría ausente de `catMap`, y resultado provisional. **R6 no tiene ninguno de estos casos** — se prueban sólo acá.
- **D. Mandil**: forfaits que no consumen mandil, 1..N sin huecos ni repetidos, `no_largo` que conserva el suyo, `yunta` null, cuerpos resueltos, texto intacto, arrays planos.

### 2.2 R6 real

```
node tools/studbook_reunion_json.mjs b02ca761-… tools/_out/r6_v2.json
  → carreras: 8   competidores: 81
```

| # | assert | resultado |
|---|---|---|
| 1 | 8 carreras (turnos 4/7/10 anuladas afuera) | ✅ |
| 2 | ninguna de categoría no-oficial | ✅ (R6 no tiene → cubierto en el probe) |
| 3 | `orden` 1..N contiguo, sin huecos ni repetidos, en las 8 | ✅ |
| 4 | spot-check turno 6 (15 comp) y turno 11 → nº 5 (6 comp) | ✅ coincide con `renumerarChapas` |
| 5 | `cuerpos.id_interno` poblado donde mapea | ✅ **50 de 50** (100 %) |
| 6 | `yunta` null en los 81 | ✅ |
| 7 | `premios` / `competidores` planos | ✅ |
| 8 | reunión 9999 → 0 carreras | ✅ (categoría `CC`, `es_oficial=false`) |

### 2.3 ⚠️ Lo que R6 **no** prueba

**El cambio de `orden` es un no-op sobre R6.** En las 8 carreras, las gateras de los ratificados ya son exactamente 1..N (verificado en DB carrera por carrera), así que mandil == gatera y el diff no muestra ningún cambio en `orden`. Que el mandil esté bien implementado lo prueba el **fixture D del probe**, no R6.

Lo mismo con el filtro: R6 no tiene ninguna carrera de categoría no-oficial, y sus 3 anuladas tampoco tenían resultado, así que el filtro viejo (eje resultado) también daba 8. **Mismo número, distinto motivo.** El eje nuevo se prueba con la reunión 9999 (3 → 0) y con el probe.

### 2.4 Diff estructural v1 → v2 (R6) — para el changelog de Diego

Comparación campo por campo de `r6_v1.json` (versión de `main`) contra `r6_v2.json`:

| campo | ocurrencias | cambio |
|---|---|---|
| `data.carreras[].competidores[].cuerpos.id_interno` | **50** | `null` → id del catálogo (ej. `null→4`, `null→14`, `null→17`) |

**Nada más cambió en R6.** Ni el conteo de carreras (8 → 8), ni el de competidores (81 → 81), ni `orden` (ver §2.3).

Para Diego, en términos de contrato, los cambios reales de la v2 completa (v1 deployada → v2 de esta rama) son:

1. `premios` y `competidores` pasan de `[[…]]` a `[…]` — **ya estaba en `main`, falta deployar**
2. sólo viajan carreras de **categoría oficial** y **no anuladas**
3. carrera con resultado no oficializado viaja **como programa**, sin resultado adjunto
4. `orden` pasa de gatera a **mandil**
5. `cuerpos.id_interno` deja de ser siempre `null`
6. auth: **sólo** `Authorization: Bearer`, se acabó `?token=`

---

## 3. Casos abiertos

### 3.1 `nariz` — sin equivalente en el catálogo

`nariz` no está en `CHAPAS_CATALOG` y **no se mapeó**: sale `id_interno: null` con el texto intacto. Lo más cercano sería `hoc` (Hocico), pero es decisión de dominio.

**Pregunta para Yesi/Fede**: ¿`nariz` es lo mismo que "Hocico", o falta una chapa en el catálogo?

**Prioridad baja**: los 12 valores fuera de catálogo — incluido `nariz` — **están todos en la reunión de prueba 9999**, ninguno en datos reales. En R6 el 100 % de los cuerpos resuelve con los códigos del catálogo. El mapa de variantes legacy es defensivo.

### 3.2 Competidores sin mandil

Un competidor con fila en `resultado_posiciones` que ya no esté `ratificado` saldría con `orden: null`. **No ocurre en R6** (81/81 con mandil). Si aparece, es señal de que alguien cambió el estado de una inscripción después de oficializar el resultado — vale revisarlo, no parchearlo en el builder.

### 3.3 `yunta`

Sigue `null`. Es columna nueva (`YUNTA_MANDIL_ESTADO.md` §1): no existe en el schema, ni en el frontend, ni hay ninguna yunta candidata en R6/R8. Antes de codearla, confirmar con Fede si Dolores corre yuntas.

### 3.4 `no_largo` conserva el mandil

Es nuestro modelo (deja el hueco) y quedó **preguntado a Diego**. Si contesta que quiere renumeración compacta, se ajusta.

### 3.5 Sample 9999 desactualizado a propósito

`tools/samples/9999_sample.json` ya no refleja la salida: con el filtro nuevo, esa reunión devuelve **0 carreras** (categoría `CC`). Regenerarlo con una reunión oficial es tarea aparte. **No se tocó** para no dar por buena una decisión que no es nuestra.

---

## 4. Para el gate de deploy (fuera de alcance acá)

- El deploy vivo es **v14**, de antes de todos estos cambios. Deployar trae **de una** los 6 cambios de contrato del §2.4.
- El build deployado es un **archivo único con el shared inlineado**. Ahora `studbook_format.mjs` importa **dos módulos nuevos** (`mandil.mjs`, `chapas_map.mjs`): el build de deploy tiene que inlinear los tres, no uno.
- Coordinar con la **rotación del token** (`ROTACION_STUDBOOK_FASE0.md`): el mensaje a Diego debería llevar el token nuevo **y** el changelog del §2.4, incluido que `?token=` dejó de funcionar.
- Nada de esto se mergeó a `main`.
