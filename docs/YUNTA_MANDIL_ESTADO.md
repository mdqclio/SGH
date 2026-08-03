# Yunta, mandil y catálogo de chapas — qué tenemos

**Fecha**: 2026-08-03 · **Tipo**: solo lectura. **Cero cambios.**
**Proyecto**: `unlhcuanfrtpatoipwve` (Dolores `0649e9c5-9e87-4aad-842f-101458e6b33c`)
**Guard**: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** ✅

**Contexto**: Diego definió que en el JSON el campo `orden` lleva el número de **mandil**, y la **yunta** va como campo separado (`orden: 3, yunta: "A"`).

---

## 1. Yunta — 🔴 NO EXISTE EN NINGÚN LADO. Es campo nuevo.

Buscado exhaustivamente. **Cero resultados** salvo el placeholder de salida del JSON.

### En la base

| dónde busqué | resultado |
|---|---|
| Columnas de `inscripciones`, `carreras`, `resultado_posiciones` (listado completo, columna por columna) | ninguna |
| Cualquier columna del schema `public` con `yunt` en el nombre | ninguna |
| Columnas con `pareja`, `letra`, `mandil`, `chapa`, `acoplad`, `entry`, `bis`, `sufijo` | sólo `resultados.favorito_mandil integer` — es el mandil del favorito de la carrera, **no** una letra de yunta |
| ENUMs (nombre de tipo y labels) | ninguno |
| Funciones/RPC (nombre y cuerpo) | ninguna |
| Constraints, vistas, comentarios de tabla | ninguno |

### En el frontend

| dónde | resultado |
|---|---|
| `inscripciones.html`, `resultados.html`, `programa.html`, `programa-oficial.html`, `programa-oficial-color.html` | **cero hits** de "yunta" |
| Todo el repo (`grep -rni yunta`) | **sólo 2 archivos**, ambos de la capa Stud Book (abajo) |
| Sinónimos en HTML/JS: `acoplado`, `pareja`, `entry`, `coupled`, `dupla` | **cero** (los hits de `1A`/`1B` son colores hex CSS; `bis` es "2bis" en comentarios de oficialización) |
| `migrations/` | cero |

### El único lugar donde aparece la palabra

```
supabase/functions/_shared/studbook_format.mjs:146:   yunta: null,   // gap v1
tools/samples/9999_sample.json:                        "yunta": null,   (×17)
```

Es decir: **el campo existe en el contrato del JSON, hardcodeado a `null`, marcado como gap desde la v1.** No hay dato detrás.

**Conclusión**: implementar yunta es **alta de columna nueva** (`inscripciones.yunta`, probablemente `varchar(1)` o ENUM `A/B/C`) + UI de carga en `inscripciones.html` o `ratificacion.html` + propagación al JSON. No hay nada que reutilizar.

---

## 2. ¿Alguna inscripción real la tiene cargada?

**No, porque la columna no existe.** Nada que consultar.

Chequeo adicional por proxy, para saber si el caso siquiera se da hoy en Dolores: en el turf la yunta suele ser dos ejemplares de la misma caballeriza corriendo el mismo turno. Busqué eso en R6 y R8:

```sql
-- ratificados, misma carrera, misma caballeriza, count > 1
```
→ **cero filas** en ambas reuniones.

O sea: con los datos actuales **no hay ninguna yunta candidata** en R6 ni en R8. Confirmar con Fede/Yesi si Dolores corre yuntas en la práctica — si no corre, el campo puede quedar `null` sin costo y la implementación baja de prioridad.

---

## 3. Mandil vs gatera en el JSON — hoy manda **GATERA** en los tres lados

Verificado contra el fuente, no de memoria.

| fuente | línea | qué manda en `orden` | qué es |
|---|---|---|---|
| **Deploy vivo** (`reunion-json` v14, leído por MCP) | `orden: str(i.numero_partidor)` | `inscripciones.numero_partidor` | 🔴 **GATERA** |
| **`main`** — `supabase/functions/_shared/studbook_format.mjs` | :145 `orden: str(i.numero_partidor),` | ídem | 🔴 **GATERA** |
| **`feat/json-v2-diego`** — mismo archivo | :145 `orden: str(i.numero_partidor),` | ídem | 🔴 **GATERA — idéntico, la rama NO lo tocó** |

La rama `feat/json-v2-diego` (`fea359e`) sólo aplanó `premios`/`competidores` y agregó el filtro de oficiales. **`orden` quedó igual.** Así que ninguna de las tres versiones cumple lo que pidió Diego.

También el `.sort()` previo usa gatera: `(a.numero_partidor ?? 0) - (b.numero_partidor ?? 0)` (`:126`).

### De qué columna sale cada cosa

| concepto | origen | persistido |
|---|---|---|
| **Gatera** (cajón del partidor) | `inscripciones.numero_partidor integer` | ✅ sí, en DB |
| **Mandil / chapa** (1..N visible en el dorsal) | **calculado** por `renumerarChapas()` en `renumerar-chapas.js` | ❌ **no se persiste en ningún lado** |

`renumerarChapas(inscripciones)` (fuente completo, 20 líneas):
1. filtra `estado === 'ratificado'` (filtro **positivo**, no lista de exclusión → los `forfait` y `mal_inscrito` quedan afuera solos),
2. ordena por `numero_partidor` ASC (`null` → 9999, al final),
3. asigna 1, 2, … N por posición,
4. devuelve `{ inscripcion_id → chapa }`.

### ⚠️ Trampa al implementarlo — no es sustituir la línea 145

El JSON elige los competidores con otro criterio que `renumerarChapas`:

```js
const comps = hasResult
  ? insc.filter(i => posByInsc.has(i.id))      // los que tienen fila en resultado_posiciones
  : insc.filter(i => i.estado === 'ratificado');
```

Los dos conjuntos **no siempre coinciden**. Un ratificado sin fila en `resultado_posiciones` entra en la numeración de `renumerarChapas` pero no en `comps`. Si se renumera el array `comps` en vez de usar el mapa, los mandiles salen corridos respecto de lo que se imprimió en el programa y en la carta de llamados.

**Forma correcta**: calcular `renumerarChapas()` sobre **todas** las inscripciones de la carrera (`inscByCarrera.get(c.id)`, sin filtrar) y después hacer *lookup* `mapa[i.id]` por competidor. Nunca renumerar `comps`.

Segunda decisión pendiente: qué mandar en `orden` para un ratificado que **no largó** (`no_largo = true`). Por el modelo conserva su mandil (deja hueco); confirmar con Diego que espera el hueco y no una renumeración compacta.

---

## 4. Catálogo de chapas (cuerpos) para Diego

✅ **Existe catálogo canónico**: `chapas.js` → `CHAPAS_CATALOG`, **20 entradas**, spec validada por Fede el 25/05/2026.

Está **cableado a la UI**: `resultados.html` arma el dropdown desde `CHAPAS_CATALOG` (`:944`) y persiste el **`codigo`** (texto) en `resultado_posiciones.diferencia`. También lo carga `ratificacion.html`.

Detalles del catálogo que Diego necesita saber:
- **Los ids NO son contiguos ni siguen el orden de distancia**: están persistidos por código, así que nunca se renumeran. El id 20 (`4½ cpos`) se dio de alta después y va **entre el 16 y el 17** por distancia. **El orden de display es el del array, no el id.**
- **`tipo = distancia`** (ids 1–16 y 20): distancia fija, `valor` en cuerpos.
- **`tipo = varios`** (id 17): el operador ingresa N ≥ 5 entero; el código se arma dinámico como `"N cpos"`. **No tiene `codigo` fijo** — por eso va vacío en el CSV.
- **`tipo = estado`** (ids 18–19): no son distancias, reemplazan al campo.

### CSV — listo para mandar tal cual

```csv
id,codigo,nombre,valor_cuerpos,tipo,orden_display
1,emp,Empate,0,distancia,1
2,vm,Ventaja mínima,0.01,distancia,2
3,hoc,Hocico,0.05,distancia,3
4,½ cbz,Media cabeza,0.1,distancia,4
5,cza,Cabeza,0.2,distancia,5
6,½ pzo,Medio pescuezo,0.3,distancia,6
7,pzo,Pescuezo,0.4,distancia,7
8,½ cpo,½ cuerpo,0.5,distancia,8
9,¾ cpo,¾ cuerpo,0.75,distancia,9
10,1 cpo,1 cuerpo,1,distancia,10
11,1½ cpo,1 cuerpo y ½,1.5,distancia,11
12,2 cpos,2 cuerpos,2,distancia,12
13,2½ cpos,2½ cuerpos,2.5,distancia,13
14,3 cpos,3 cuerpos,3,distancia,14
15,3½ cpos,3½ cuerpos,3.5,distancia,15
16,4 cpos,4 cuerpos,4,distancia,16
20,4½ cpos,4½ cuerpos,4.5,distancia,17
17,,Varios cuerpos,,varios,18
18,s.a.,Sin apreciación,,estado,19
19,desm.,Desmontó,,estado,20
```

> El archivo se genera desde el fuente con:
> `node -e "..."` sobre `chapas.js` (ver el comando en el commit de este reporte). El `svg` de cada entrada se omite a propósito: es un blob grande y no le sirve a Diego.

### Estado real del dato en `resultado_posiciones.diferencia`

98 filas totales:

| clase | filas | valores distintos |
|---|---|---|
| **En catálogo** (código exacto) | **37** | 15 |
| **Varios** (`^[0-9]+ cpos$` → id 17) | **13** | 5 (`5`, `6`, `7`, `8`, `9 cpos`) |
| **Fuera de catálogo** (texto libre legacy) | **12** | 11 |
| `NULL` | 36 | — |

O sea: **50 de 62 filas no nulas (81 %) ya mapean al catálogo**. Las 12 restantes son carga manual vieja, previa a que el dropdown estuviera cableado:

`1 cuerpo` (×2), `cabeza`, `pescuezo`, `media cabeza`, `nariz`, `2 cuerpos`, `3 cuerpos`, `5 cuerpos`, `3/4 cuerpo`, `1 1/2 cuerpos`, `2 1/2 cuerpos`

Diez de esas once son variantes tipográficas de un código que **sí** existe (`1 cuerpo`→`1 cpo`, `media cabeza`→`½ cbz`, `pescuezo`→`pzo`, etc.). La única sin equivalente directo es **`nariz`**, que no está en el catálogo (lo más cercano es `hoc` = Hocico). Normalizarlas sería un UPDATE acotado de 12 filas — **no ejecutado, queda como propuesta con su propio gate**.

### 🔧 Corrección a `docs/INTEGRACION_STUDBOOK_ESTADO.md`

Ese documento (del 03/08, punto 4.2 delta #4) afirma que **"no existe catálogo de cuerpos"** y que `cuerpos.id_interno` es imposible. **Es incorrecto**: el catálogo existe (`chapas.js`, 20 entradas, ids estables por diseño) y está en producción.

Lo que sí es cierto es que **la Edge Function no lo usa**: manda `cuerpos: { id_interno: null, nombre: rp.diferencia }` — texto crudo, sin resolver contra el catálogo. **Poblar `id_interno` es cambio de código en el builder, no falta de datos**: alcanza con `getChapaByCodigo(rp.diferencia)?.id` (más el caso `varios`, que resuelve a id 17 + el N). Cubriría el 81 % de las filas hoy y el 100 % de las nuevas.

Los números también estaban mal en ese doc ("33 variantes en 36 filas"): el **36 era el conteo de NULLs**. Correcto: 62 filas no nulas, 31 valores distintos.

---

## 5. Resumen para Diego

| pide | tenemos | falta |
|---|---|---|
| `orden` = **mandil** | ❌ hoy manda **gatera** (`numero_partidor`) en deploy, `main` y `feat/json-v2-diego` | Usar el mapa de `renumerarChapas()` calculado sobre **todas** las inscripciones de la carrera. Cambio de código, sin migración |
| `yunta` como campo separado (`"A"`) | ❌ **no existe en absoluto** — sólo el placeholder `null` en el JSON | Columna nueva + UI de carga + propagación. Antes: confirmar con Fede si Dolores corre yuntas (en R6/R8 no hay ninguna candidata) |
| catálogo de chapas/cuerpos | ✅ **existe y está en producción**: 20 entradas, ids estables | Sólo mandarle el CSV de arriba. Aparte: que la EF resuelva `cuerpos.id_interno` contra el catálogo en vez de mandar texto crudo |

**Nada fue modificado.**
