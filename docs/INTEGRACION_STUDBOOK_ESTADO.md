# Integración Stud Book — estado de nuestro lado

**Fecha**: 2026-08-03
**Tipo**: relevamiento SOLO LECTURA. No se modificó nada (ni DB ni Edge Function).
**Proyecto**: `unlhcuanfrtpatoipwve` · Club Dolores `0649e9c5-9e87-4aad-842f-101458e6b33c`
**Guard**: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** ✅
**Motivo**: Diego (Stud Book) definió la integración. Medimos nuestro lado antes de tocar `reunion-json`.

Reuniones de referencia:

| | reunion_id | fecha | estado | carreras | inscripciones |
|---|---|---|---|---|---|
| **R6** | `b02ca761-6f44-4720-86aa-a3c3099019ea` | 2026-06-20 | publicada | 11 | 125 (81 ratif · 36 forfait · 8 inscripto) |
| **R8** | `7b6e003e-22e2-4629-bf55-f18560b1260f` | 2026-08-16 | publicada | 12 | **1** (inscripto) |

> ⚠️ **R8 está prácticamente vacía**: 12 carreras creadas, 1 sola inscripción, 0 ratificados, 0 resultados. No sirve como muestra de datos; sólo para medir el catálogo de carreras.

---

## 1. Catálogo de categorías

### 1.1 Tabla `categorias_carrera` completa (3 clubes × 4 filas)

| club | nombre | codigo | es_oficial | es_computable | activo | orden |
|---|---|---|---|---|---|---|
| **Dolores** `0649e9c5` | Oficial Computable | OC | ✅ | ✅ | ✅ | 1 |
| **Dolores** | Oficial No Computable | ONC | ✅ | ❌ | ✅ | 2 |
| **Dolores** | No Oficial | NO | ❌ | ❌ | ✅ | 3 |
| **Dolores** | Concertada | CC | ❌ | ❌ | ✅ | 4 |
| `a6da7e40` | Oficial Computable | OC | ✅ | ✅ | ✅ | 1 |
| `a6da7e40` | Oficial No Computable | ONC | ✅ | ❌ | ✅ | 2 |
| `a6da7e40` | No Oficial | NO | ❌ | ❌ | ✅ | 3 |
| `a6da7e40` | Concertada | CC | ❌ | ❌ | ✅ | 4 |
| `710d43c1` | Oficial Clásico | OC | ✅ | ✅ | ✅ | 1 |
| `710d43c1` | **Oficial No Clásico** | ONC | ✅ | **✅** | ✅ | 2 |
| `710d43c1` | No Oficial | NO | ❌ | ❌ | ✅ | 3 |
| `710d43c1` | **Clásico Confirmado** | CC | **✅** | **✅** | ✅ | 4 |

UUIDs Dolores (los que viajarían como `tipo_carrera.id`):
```
OC   30c4d502-418a-477b-aa3d-a43580cb50a0  (dup de nombre con a6da7e40, distinto UUID)
     c0bbe167-9923-4b9a-b857-3121c5e5b4d7  ← este es el de Dolores
ONC  35cf2228-b5fd-4f69-bb89-e16e6a5d4953
NO   504666b2-662f-4216-bc34-40e59e100f32
CC   ce76d686-c07a-434c-a3b0-74be3bf0c906
```

### 1.2 Uso real en R6 y R8

| reunión | código | categoría | es_oficial | es_computable | carreras |
|---|---|---|---|---|---|
| R6 | OC | Oficial Computable | ✅ | ✅ | **3** |
| R6 | ONC | Oficial No Computable | ✅ | ❌ | **8** |
| R8 | OC | Oficial Computable | ✅ | ✅ | **2** |
| R8 | ONC | Oficial No Computable | ✅ | ❌ | **10** |

**Cero carreras `NO` y cero `CC` en R6 y R8.** Toda carrera real cargada en Dolores es oficial (OC u ONC).

Detalle R6 (11 turnos):

| turno | nº programa | cat | premio | dist | ratif | resultado |
|---|---|---|---|---|---|---|
| 1 | 1 | ONC | MARTIN MIGUEL DE GÜEMES | 1000 | 10 | oficial |
| 2 | 2 | ONC | DIA DEL PERIODISTA | 1000 | 8 | oficial |
| 3 | 3 | ONC | RADIO MAX DOLORES | 1000 | 7 | oficial |
| 4 | — | ONC | (sin nombre) | 1000 | 0 | — |
| 5 | 8 | ONC | MODO INVIERNO | 1300 | 10 | oficial |
| 6 | 6 | ONC | MUNDIAL 2026 | 1100 | 15 | oficial |
| 7 | — | ONC | (sin nombre) | 1000 | 0 | — |
| 8 | 4 | **OC** | DIA DE LA BANDERA | 1000 | 12 | oficial |
| 9 | 7 | **OC** | DIA DEL PADRE | 1100 | 13 | oficial |
| 10 | — | **OC** | (sin nombre) | 800 | 0 | — |
| 11 | 5 | ONC | ESPECIAL MANUEL BELGRANO | 1000 | 6 | oficial |

8 de 11 turnos con resultado `oficial`; 3 turnos vacíos (sin nombre, sin ratificados, sin resultado) — turnos armados y no usados.

---

## 2. Los tres tipos de Diego

Diego dice: Dolores maneja **OFICIAL / oficial no computable / no oficial**, y el JSON lleva **sólo las oficiales**.

### 2.1 ¿Nuestro modelo distingue los tres casos?

Sí para los tres que él nombra, **pero hay dos ambigüedades**.

Mapeo directo en Dolores:

| Diego | nuestra categoría | es_oficial | es_computable |
|---|---|---|---|
| OFICIAL | `OC` Oficial Computable | ✅ | ✅ |
| oficial no computable | `ONC` Oficial No Computable | ✅ | ❌ |
| no oficial | `NO` No Oficial | ❌ | ❌ |

### 2.2 ⚠️ Ambigüedad A — `CC` colisiona con `NO` en los flags

En Dolores, **`NO` (No Oficial)** y **`CC` (Concertada)** tienen **exactamente los mismos flags**: `es_oficial=false, es_computable=false`. Con `es_oficial + es_computable` **NO alcanza**: son dos categorías indistinguibles.

Para el filtro "sólo oficiales" da igual (ambas se excluyen). Para **derivar el tipo** que Diego quiere ver en `tipo_carrera`, no alcanza: hay que mandar el **`codigo`** (o el UUID), no los flags.

### 2.3 ⚠️ Ambigüedad B — los códigos no son estables entre clubes

El club `710d43c1` reusa los mismos códigos con **otra semántica**:

- `ONC` ahí es **"Oficial No Clásico"** con `es_computable = TRUE` (en Dolores `ONC` es no-computable).
- `CC` ahí es **"Clásico Confirmado"** con `es_oficial = TRUE` (en Dolores `CC` es no-oficial).

O sea: `codigo` **solo** es interpretable dentro de un club. Si el endpoint se generaliza más allá de Dolores, ni el código ni los flags son un contrato estable — habría que mandar el par `{codigo, nombre}` + los dos flags, y que el Stud Book decida.

### 2.4 ⚠️ Ambigüedad C — "oficial" tiene DOS ejes en nuestro modelo

Esta es la más importante para el filtro:

| eje | dónde vive | valores |
|---|---|---|
| **categoría oficial** | `categorias_carrera.es_oficial` | true/false — es lo que Diego llama OFICIAL/no oficial |
| **resultado oficializado** | `resultados.estado` (ENUM `estado_resultado`) | `provisional` / `oficial` / `en_protesta` |

`carreras.estado` es un tercer eje y **no** tiene el valor "oficial": valores reales en toda la base → `abierta` 31, `anulada` 3, `programada` 3, `(null)` 1.

La rama `feat/json-v2-diego` (ver §4.3) implementó el filtro sobre `resultados.estado='oficial'` — **eje resultado**, no eje categoría. Hay que confirmar con Diego cuál de los dos quiere:

- Si es **categoría** → en R6 pasarían las 11 carreras (todas OC/ONC), incluidos los 3 turnos vacíos.
- Si es **resultado oficializado** → en R6 pasan 8 carreras (los 3 turnos vacíos caen solos).
- Probablemente quiere **ambos**: categoría `es_oficial=true` **Y** `resultados.estado='oficial'`. Con los datos de R6 el resultado es el mismo (8), porque no hay carreras NO/CC cargadas.

### 2.5 Matriz real de combinaciones en carreras cargadas

Toda la base (38 carreras, incluida la reunión de prueba 9999):

| es_oficial | es_computable | código | carreras | reuniones |
|---|---|---|---|---|
| ✅ | ✅ | OC | 7 | 3 |
| ✅ | ❌ | ONC | 28 | 3 |
| ❌ | ❌ | CC | 3 | 1 (la de prueba **9999**) |

**Sólo 3 de las 4 categorías aparecen en carreras reales.** Ninguna carrera `NO` (No Oficial) existe en la base. Las 3 `CC` son de la reunión de prueba `9999` / 2099-01-01 (que **se conserva** como sandbox — ver `docs/diagnosticos/2026-08-29_issue-055-merge.md`; el teardown quedó sin usar), y son justamente la reunión que el sample del JSON usa como fixture — ojo: **si el filtro de oficiales entra en producción, el sample 9999 pasa a devolver 0 carreras**.

---

## 3. Identificadores que pide Diego

### 3.1 `profesionales.documento_nro` — cobertura y formato

Columna: `documento_nro varchar(30)`, `documento_tipo varchar(20)`, `tipo` ENUM `tipo_profesional` (`jockey` / `entrenador` / `ambos`).

**Cobertura global** (toda la tabla, 167 filas):

| tipo | total | con doc | % | DNI pelado 7-8 díg | CUIT 11 díg | CUIT c/guiones | otro formato |
|---|---|---|---|---|---|---|---|
| entrenador | 125 | 87 | **69.6 %** | 87 | 0 | 0 | 0 |
| jockey | 42 | 16 | **38.1 %** | 16 | 0 | 0 | 0 |
| ambos | 0 | — | — | — | — | — | — |

**Respuesta a "¿DNI pelado o CUIT?": guardamos DNI pelado, 100 % de lo cargado.** Cero CUIT. Formato **consistente**: los 103 valores no vacíos son 7 u 8 dígitos sin puntos, guiones ni prefijo. Nada raro, nada que normalizar.

`documento_tipo`: `DNI` 98 · `(null)` 69. Como hay 103 con `documento_nro`, hay **5 filas con documento cargado y `documento_tipo` en null** — inconsistencia menor, no bloqueante (el JSON no usa `documento_tipo`).

**Cobertura efectiva sobre las inscripciones que viajarían** (lo que importa de verdad):

| reunión | rol | filas | sin profesional asignado | profs distintos | de esos, con doc | **filas que saldrían sin doc** |
|---|---|---|---|---|---|---|
| R6 | entrenador | 125 | 4 | 59 | **22 / 59** | **72** |
| R6 | jockey_titular | 125 | **55** | 29 | **4 / 29** | **64** |
| R8 | entrenador | 1 | 0 | 1 | 0 / 1 | 1 |
| R8 | jockey_titular | 1 | 1 | 0 | — | 0 |

🔴 **Este es el bloqueante duro de la integración.** En R6:
- **72 de 125** inscripciones saldrían con `cuidador.dni = null`.
- **64 de 125** saldrían con `jockey_inscripto.dni = null`, y además **55 no tienen jockey asignado** (nombre también null).
- Sólo **4 de 29** jockeys usados en R6 tienen documento.

Si Diego matchea por documento, hoy le entra ~42 % de los cuidadores y ~9 % de los jockeys.

### 3.2 Caballerizas — qué ID exponemos

Hoy `reunion-json` manda:
```js
caballeriza: {
  nombre:  cab.nombre,
  id:      String(cab.id),          // ← UUID interno de Supabase
  descripcion_chaquetilla: cab.chaquetilla_descripcion,
  procedencia: cab.hipodromo_patente ?? /\(([^)]+)\)\s*$/.exec(cab.nombre)?.[1]
}
```

- **`id` = UUID interno** (`uuid`), p.ej. `3f9c…`. No hay ningún código corto, patente propia ni numérico de caballeriza.
- Columnas reales de `caballerizas`: `id, club_id, nombre, responsable, domicilio, telefono, activo, notas, estado, chaquetilla_descripcion, chaquetilla_url, hipodromo_patente`. **No existe** columna `codigo`.
- `hipodromo_patente varchar(50)` es la **procedencia** (hipódromo de origen), no un ID de caballeriza. Cobertura Dolores: **207 de 272 (76 %)**; para las otras 65 la EF hace *fallback* parseando lo que esté entre paréntesis al final del nombre.

Si Diego quiere un ID nuestro estable para caballeriza, hoy lo único que hay es el UUID. Aceptable si él lo guarda como clave externa opaca; no sirve si espera un entero.

### 3.3 Tipo de pista / estado de pista

| campo | dónde | tipo real | ¿tabla con IDs? | valores en uso |
|---|---|---|---|---|
| **tipo de pista** | `carreras.tipo_pista` | **ENUM PG `tipo_pista`** | ❌ no hay tabla | `tierra` 33 · `cesped` 5 |
| **estado de pista** | `resultados.estado_pista` | **`varchar(20)` texto libre** | ❌ no hay tabla ni ENUM | `seca` 9 · `pesada` 1 · `humeda` 1 |
| **tipo de codo** | — | **no existe en el modelo** | — | — |

Labels del ENUM `tipo_pista` (orden PG): `cesped`, `arena`, `mixta`, `sintetica`, `tierra`.

**No hay IDs numéricos ni tablas de catálogo para ninguno de los tres.** La EF hoy manda `id = nombre = el string`:
```js
tipo_pista:   { id: c.tipo_pista,      nombre: c.tipo_pista }      // 'tierra'
estado_pista: { id: res.estado_pista,  nombre: res.estado_pista }  // 'seca'
tipo_codo:    { id: null, nombre: null }                            // siempre null
```
`estado_pista` al ser varchar libre no tiene garantía de vocabulario: hoy los 3 valores están limpios y en minúscula sin acento (`humeda`, no `húmeda`), pero nada lo impide en la DB. Si Diego necesita un dominio cerrado, hay que ENUM-izarlo o tabularlo de nuestro lado.

Otros ENUMs relevantes, por si sirven al contrato:
- `estado_resultado`: `provisional`, `oficial`, `en_protesta`
- `estado_inscripcion`: `pre_inscripto`, `confirmado`, `ratificado`, `forfait`, `no_presentado`, `inscripto`, `mal_inscrito`
- `tipo_profesional`: `jockey`, `entrenador`, `ambos`

### 3.4 Bonus — `ejemplar.id` (no lo preguntaste, pero es un gap grande)

El JSON manda `ejemplar.id = String(spc.studbook_id)`. Cobertura: **27 de 144 SPCs (18.8 %)** tienen `studbook_id`; los 27 son numéricos limpios. **117 de 144 ejemplares saldrían con `ejemplar.id = null`.**

---

## 4. `reunion-json` hoy — campos exportados y delta vs Diego

### 4.1 Qué está deployado

Leído del **deploy real** (`get_edge_function` slug `reunion-json`, **version 14**, `verify_jwt=false`, `updated_at` 2026-06-06). Es un *build* con el shared module inlineado — **no** es el `supabase/functions/reunion-json/index.ts` del repo, que importa `_shared/studbook_format.mjs`.

Contrato:
```
GET /reunion-json?fecha=YYMMDD          (990101 → 2099-01-01)
Auth: Authorization: Bearer <STUDBOOK_API_TOKEN>  ó  ?token=<...>
Scope: hardcodeado a CLUB_ID_DOLORES; 1 reunión por fecha (maybeSingle)
```

Estructura devuelta:
```
{ status, data: {
    id, titulo_reunion: null,
    fecha: { date, timezone: 'America/Argentina/Buenos_Aires' },
    hipodromo: { nombre, id: null },
    carreras: [ {
      estado                  ← resultados.estado ('oficial'/'provisional'/…) ó null
      numero                  ← numero_carrera_programa ?? numero_turno   (string)
      horario                 ← carreras.hora_estimada
      premio                  ← carreras.nombre
      distancia               ← distancia_metros (string)
      tipo_carrera  { id: categoria_id (UUID), nombre }
      tipo_pista    { id: <enum label>, nombre: <idem> }
      estado_pista  { id: <texto libre>, nombre: <idem> }
      tipo_codo     { id: null, nombre: null }              ← siempre null
      condicion { texto, edaddesde, edadhasta, sexo, ganadadesde: null, ganadahasta: null }
      tiempo    { minutos, segundos, decimas }              ← parseado de tiempo_ganador
      premios              [[ { puesto, importe } ]]        ← DOBLE-ANIDADO
      competidores_cantidad
      competidores         [[ { … } ]]                      ← DOBLE-ANIDADO
    } ]
} }
```

Cada competidor:
```
idCarreraInt              ← inscripciones.id (UUID)
puesto                    ← '0' sin resultado | '99' si no_largo | String(posicion)
estado: null, estado_equino_carrera: null, yunta: null    ← siempre null
orden                     ← numero_partidor (GATERA, no mandil)
distanciado               ← 'SI'/'NO' de rp.descalificado
motivo_distanciado        ← rp.motivo_desc
ejemplar          { nombre, id: spcs.studbook_id }
kilos_ejemplar            ← peso_balanza
jockey_inscripto  { nombre: "nombre apellido", dni: documento_nro, cuit: null }
jockey            { nombre: null, dni: null, cuit: null }  ← siempre null (jockey efectivo no modelado)
cuidador          { nombre, dni: documento_nro, cuit: null }
caballeriza       { nombre, id: UUID, descripcion_chaquetilla, procedencia }
jockey_kilos              ← peso_final (2 decimales)
cuerpos           { id_interno: null, nombre: rp.diferencia }
pagaria                   ← rp.dividendo
```

Selección de competidores: si la carrera tiene resultado → los que tienen fila en `resultado_posiciones`; si no → los `estado='ratificado'`. Ordenados por `numero_partidor` ASC.

### 4.2 Delta contra lo que pide Diego

| # | Pide Diego | Estado hoy (v14 deployada) | Delta |
|---|---|---|---|
| 1 | **Filtro: sólo carreras oficiales** | ❌ **NO filtra** — exporta las 11 carreras de R6, incluidos los 3 turnos vacíos | **Falta.** Código listo pero sin deployar (§4.3). Y hay que resolver la Ambigüedad C (§2.4): ¿categoría `es_oficial` o `resultados.estado='oficial'`? |
| 2 | **Documento en vez de ID interno** para jockey y cuidador | ✅ **Ya es así**: `jockey_inscripto.dni` y `cuidador.dni` = `documento_nro`. No se expone el UUID de profesional | ✅ Contrato OK. 🔴 **Datos NO**: 72/125 cuidadores y 64/125 jockeys de R6 saldrían con `dni: null` (§3.1). `cuit` va hardcodeado a `null` — si él acepta DNI, no hace falta tocar nada; si necesita CUIT, no lo tenemos en ninguna fila |
| 3 | **IDs nuestros para el resto** | Parcial | `tipo_carrera.id` = UUID categoría ✅ · `caballeriza.id` = UUID ✅ (no hay otro) · `tipo_pista.id` = label del ENUM (string, no ID) ⚠️ · `estado_pista.id` = texto libre (no ID) ⚠️ · `tipo_codo.id` = null ❌ (no existe) · `hipodromo.id` = **null** ❌ (se consulta `hipodromos.id` pero no se emite) · `ejemplar.id` = `studbook_id`, **null en 117/144** 🔴 |
| 4 | **Cómo viajan los cuerpos** | `cuerpos: { id_interno: null, nombre: rp.diferencia }` | 🔴 **`id_interno` siempre null** — no existe catálogo de cuerpos. **`nombre` es texto libre sin normalizar**: 33 valores distintos en 36 filas no nulas, con variantes del mismo margen: `1½ cpo` / `1 1/2 cuerpos` / `1 cpo` / `1 cuerpo`, `½ cbz` / `media cabeza` / `cabeza`, `½ pzo` / `pzo` / `pescuezo`, más `s.a.` y `vm`. Si Diego quiere ID, hay que crear tabla de márgenes y normalizar los 36 valores cargados |

Deltas adicionales que él no listó pero rompen si no se hablan:

| # | Punto | Detalle |
|---|---|---|
| 5 | `premios` y `competidores` **doble-anidados** `[[…]]` | Sigue así en el deploy. Diego ya pidió aplanarlo (2026-06-12) — arreglado en rama, sin deployar |
| 6 | `orden` = **gatera**, no mandil | Manda `numero_partidor` crudo. Por convención SGH la gatera nunca se muestra; el número visible es el mandil 1..N de `renumerarChapas()`. Confirmar cuál espera el Stud Book |
| 7 | `jockey` (efectivo) siempre `{null,null,null}` | Sólo modelamos `jockey_titular_id`. No hay jockey efectivo/reemplazo |
| 8 | `hipodromo.id: null` | La query trae `hipodromos.id` y el builder lo descarta |
| 9 | `titulo_reunion`, `estado`, `estado_equino_carrera`, `yunta`, `ganadadesde`, `ganadahasta` | Todos hardcodeados a `null` |
| 10 | Sin `Cache-Control` y 6 queries seriales | Deuda de performance conocida, no bloqueante |

### 4.3 Trabajo ya hecho y sin deployar

Rama **`feat/json-v2-diego`**, commit **`fea359e`** — *"JSON v2 — aplanar premios/competidores + solo carreras oficiales"* (2026-06-12), toca sólo `supabase/functions/_shared/studbook_format.mjs` + el sample:

1. `premios: [premios]` → `premios` y `competidores: [competidores]` → `competidores` (aplanado, delta #5).
2. Filtro `carreras.filter(c => resByCarrera.get(c.id)?.estado === 'oficial')` (delta #1) — **eje resultado**.

Los cambios 3 (`tipo_carrera`) y 4 (IDs numéricos) quedaron auditados sin codear.

**Nada de esto está en producción**: el deploy v14 conserva el doble-anidado y no filtra. La rama no está mergeada a `main`.

⚠️ Si se deploya el filtro tal cual: la reunión de prueba **9999** (fixture del sample, 3 carreras categoría `CC` = no oficial) sigue devolviendo sus 3 carreras porque el filtro mira `resultados.estado`, no la categoría. Si además se agrega el filtro por categoría, ese fixture pasa a devolver **0 carreras** y hay que rehacer el sample.

---

## 5. Resumen ejecutivo — qué bloquea qué

| Prioridad | Item | Bloqueante | Acción |
|---|---|---|---|
| 🔴 1 | `documento_nro` de jockeys (38 % global, **4/29 usados en R6**) | Sí — el matching de Diego no funciona | Backfill de documentos. Es carga de datos, no código |
| 🔴 2 | `documento_nro` de entrenadores (70 % global, **22/59 usados en R6**) | Sí | Backfill |
| 🔴 3 | `spcs.studbook_id` 27/144 (18.8 %) | Sí — `ejemplar.id` null en 117 ejemplares | Backfill contra el Stud Book |
| 🟡 4 | Definir "oficial": categoría vs resultado (§2.4) | Sí — define el filtro | **Preguntar a Diego** |
| 🟡 5 | `cuerpos` texto libre, 33 variantes, `id_interno` null | Depende de si él lo parsea | Preguntar; si pide ID → tabla de márgenes + normalizar 36 filas |
| 🟡 6 | `orden` = gatera vs mandil | Riesgo de dato mal interpretado | **Preguntar a Diego** |
| 🟢 7 | Deployar `feat/json-v2-diego` (aplanado + filtro) | No | Merge + deploy cuando se cierre el punto 4 |
| 🟢 8 | `estado_pista` varchar libre sin dominio cerrado | No hoy (3 valores limpios) | ENUM-izar si él necesita catálogo |
| 🟢 9 | `caballeriza.id` = UUID (no hay alternativa) | No, si él acepta clave opaca | Confirmar |
| 🟢 10 | `hipodromo.id` null aunque se consulta | No | Fix trivial en el builder |
| 🟢 11 | R8 vacía (1 inscripción, 0 resultados) | No | No usarla como muestra |

**Cero cambios aplicados.** Todo lo de arriba es medición.
