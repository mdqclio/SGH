# Fix del JSON de `reunion-json` — los 4 puntos de Diego que son nuestros

**Fecha:** 2026-08-23 · **Branch:** `fix/json-studbook-diego-r8` (desde `main` @ `c7b2865`)
**Base:** `docs/diagnosticos/2026-08-22_diagnostico-json-r8-diego.md`
**Alcance:** puntos 1, 2, 3 y 5 del diagnóstico. **NO se tocan** las carreras No Computables
(punto 6) ni los campos de condición (punto 7) — los define Fede.

> **Estado de despliegue: NADA DESPLEGADO.** La Edge Function en producción sigue en la versión
> anterior. Ver §Deploy al final.

---

## 1. Tiempo mal convertido — arreglado el mapeo; quedan 2 tiempos que necesitan el ticket

### Qué estaba mal

Eran tres cosas distintas mezcladas en un mismo síntoma.

**(a) Código — el campo `decimas` transportaba CENTÉSIMAS.** `parseTiempo` hacía
`parseInt(dec, 10)` sobre los dos dígitos que siguen al punto. Para `01:15.51` emitía
`decimas: 51`, que son 51 centésimas. Afectaba a las **6 carreras bien cargadas**, no sólo a las
rotas.

**(b) Código — sin guarda de plausibilidad.** `43:13.00` se parseaba a `{minutos: 43, segundos: 13}`
y salía tal cual. Una carrera de 800 m con 43 minutos viajaba como si fuera un dato bueno.

**(c) Datos — 2 carreras de 800 m cargadas con otra convención.** El operador tipeó `43:13`
queriendo decir "43 segundos 13 centésimas" y la máscara `MM:SS.CC` de `resultados.html` lo aceptó
como 43 minutos. Son las únicas 2 filas con este defecto en todo el histórico de `resultados`, y
las únicas 2 de 800 m.

### Qué se cambió

`parseTiempo()` en `supabase/functions/_shared/studbook_format.mjs`:

1. **Se agrega `centesimas`** con el nombre correcto. **`decimas` se mantiene** emitiendo el mismo
   número que hoy. Contrato **aditivo**, igual que `numero_publico`: Diego no se rompe, y cuando
   confirme que migró a `centesimas`, `decimas` se puede retirar. No se cambió el valor de `decimas`
   a décimas reales a propósito — Diego hoy lo lee como centésimas (notación `"47.13c"`), así que
   "corregirlo" a `5` le rompería la lectura en silencio.
2. **Un dígito después del punto se normaliza a centésimas**: `1:15.5` → 5 décimas → `centesimas: 50`.
   Antes salía `decimas: 5`, que mezclaba dos escalas en el mismo campo.
3. **Guarda de plausibilidad** (`TIEMPO_MAX_SEGUNDOS = 600`): un tiempo por encima de 10 minutos sale
   con los cuatro campos en `null`. Ninguna carrera de turf dura eso — la más larga del calendario
   argentino (3000 m) se corre en ~3'10". **Emitir "43 minutos" es mandar un número falso con cara
   de dato bueno; `null` dice "no tengo el tiempo", que es la verdad hasta que alguien lo corrija.**

### Verificación de las 8 carreras

No tengo los tickets del tote — no están en el repo. Lo que sí se puede verificar sin ellos es la
**coherencia interna**: velocidad media contra `distancia_metros`. Un galope de carrera está en el
orden de 15–17 m/s.

| nro | dist | `tiempo_ganador` en DB | salida vieja | salida nueva | seg | m/s | veredicto |
|---|---|---|---|---|---|---|---|
| 1 | 800 | `43:13.00` | `{43, 13, 0}` | **todo `null`** | — | — | 🔴 dato roto — **necesita ticket** |
| 2 | 800 | `49:00.00` | `{49, 0, 0}` | **todo `null`** | — | — | 🔴 dato roto — **necesita ticket** |
| 3 | 1000 | `01:02.03` | `{1, 2, 3}` | `{1, 2, c:3}` | 62,03 | 16,12 | ✅ coherente |
| 4 | 1000 | `01:00.72` | `{1, 0, 72}` | `{1, 0, c:72}` | 60,72 | 16,47 | ✅ coherente |
| 5 | 1000 | `00:59.90` | `{0, 59, 90}` | `{0, 59, c:90}` | 59,90 | 16,69 | ✅ coherente |
| 6 | 1100 | `01:04.81` | `{1, 4, 81}` | `{1, 4, c:81}` | 64,81 | 16,97 | ✅ coherente |
| 7 | 1200 | `01:15.51` | `{1, 15, 51}` | `{1, 15, c:51}` | 75,51 | 15,89 | ✅ coherente |
| 8 | 1200 | `01:15.19` | `{1, 15, 19}` | `{1, 15, c:19}` | 75,19 | 15,96 | ✅ coherente |

Las 6 buenas caen en una banda estrecha (15,89–16,97 m/s). Consistente entre sí y con la distancia.
**Su valor numérico no cambia** con este fix: lo único que cambia es que ahora el número viaja
también en un campo que se llama como lo que es.

### Lo que queda pendiente y NO se tocó

**Las 2 carreras de 800 m siguen con el dato malo en la base.** No las corregí:

- Para la **nro 1**, el diagnóstico del 22/08 dice que el ticket marca **47.13**, contra `43.13` de
  la base. Los segundos no coinciden — reinterpretar `43:13` como "43 s 13 c" daría `43.13`, que
  **sigue estando mal**. No es un problema de re-parseo, es un dígito equivocado.
- Para la **nro 2** no hay ningún valor de ticket documentado. `49:00.00` leído como 49,00 s da
  16,33 m/s, que es plausible, pero *plausible no es verificado*.

Corrección sugerida una vez que alguien mire los tickets (**no aplicada**):

```sql
-- nro 1 (turno 2, 800 m) — SOLO si el ticket confirma 47"13
UPDATE resultados SET tiempo_ganador = '00:47.13'
WHERE carrera_id = (SELECT c.id FROM carreras c JOIN reuniones r ON r.id=c.reunion_id
                    WHERE r.numero=8 AND c.numero_turno=2);
-- nro 2 (turno 12, 800 m) — SOLO si el ticket confirma 49"00
UPDATE resultados SET tiempo_ganador = '00:49.00'
WHERE carrera_id = (SELECT c.id FROM carreras c JOIN reuniones r ON r.id=c.reunion_id
                    WHERE r.numero=8 AND c.numero_turno=12);
```

### Recomendación fuera de alcance

`getTiempoGanador()` (`resultados.html:1369`) valida contra `^(\d{1,2}):([0-5]\d)\.(\d{2})$` — acepta
hasta 99 minutos y nada cruza el tiempo contra la distancia. **Mientras esa máscara siga como está,
el 20/09 se puede volver a cargar `43:13`.** El guard de rango sirve igual que el de `peso_balanza`:
rechazar > 10 min en el guardado. No lo implementé porque este turno estaba acotado al mapeo.

---

## 2. Jockey hardcodeado en nulo — arreglado, con un límite que hay que conocer

### De dónde debería salir el jockey que efectivamente montó

**Respuesta corta: de `inscripciones.jockey_suplente_id` cuando hay suplente designado, y de
`inscripciones.jockey_titular_id` cuando no. No hay una tercera fuente.**

Barrido de schema para confirmarlo:

- No existe tabla `montas` / `jockeys` / `jinetes` — 0 resultados en `information_schema.tables`.
- `inscripciones` tiene exactamente **dos** columnas de jockey: `jockey_titular_id` y
  `jockey_suplente_id`.
- **`resultado_posiciones` no tiene ninguna columna de jockey** — la tabla del orden de llegada no
  registra quién iba arriba.

O sea: **no hay ningún lugar en la base donde se anote "quién largó" como dato distinto de "quién
estaba inscripto"**. La columna del titular hace las dos veces.

### Qué estaba mal

```js
jockey: { nombre: null, dni: null, cuit: null }, // v1
```

Tres `null` literales. No había consulta detrás — marcado `// v1`, nunca implementado. No era un dato
faltante: era un campo que la función no llenaba.

### Qué se cambió

```js
const jockEfectivo = profMap.get(i.jockey_suplente_id ?? i.jockey_titular_id) || null;
...
jockey: { nombre: nombreCompleto(jockEfectivo), dni: jockEfectivo?.documento_nro ?? null, cuit: null },
```

Más `jockey_suplente_id` agregado al lookup de `profesionales` en los **dos** consumidores
(`reunion-json/index.ts` y `tools/studbook_reunion_json.mjs`), que si no el suplente saldría `null`
por no estar en el `profMap`.

Verificado con fixture — titular solo → `jockey` = titular; con suplente → `jockey` = suplente;
sin ninguno → `null`:

```
i1 | inscripto: "Ana Titular" | montó: "Ana Titular"   | dni: "11111111"
i2 | inscripto: "Ana Titular" | montó: "Beto Suplente" | dni: "22222222"
i3 | inscripto: null          | montó: null           | dni: null
```

### El límite

**En R8, `jockey_suplente_id` está en NULL en los 67 competidores.** O sea que en la práctica
`jockey` va a salir **igual** a `jockey_inscripto`. Eso no es el fix fallando: es lo máximo que la
base puede afirmar hoy, y es estrictamente mejor que tres `null` — Diego pasa de "no hay dato" a
"el que sabemos".

Lo que **no** arregla: si el día de la carrera cambia la monta y nadie lo carga, `jockey_titular_id`
queda con el jockey viejo y este campo lo repite sin poder marcarlo. R6 necesitó **32 UPDATEs a
mano** contra la planilla de Yesi (`d1600d3`) tres meses después. **R8 no tuvo esa pasada de
reconciliación** — no existe doc ni commit equivalente. Por eso Diego ve que no coincide con el que
corrió, y del lado nuestro no tenemos con qué verificarlo.

Cerrar esto de verdad son dos cosas separadas de este fix:
1. **Reconciliar las montas de R8** contra la planilla de Yesi (trabajo de datos, como el de R6).
2. **Agregar la columna del jockey que corrió** — en `resultado_posiciones`, que es donde vive el
   hecho de la carrera — para que inscripto y efectivo dejen de pisarse.

`cuit` sigue en `null` hardcodeado en los tres bloques: **no hay columna de CUIT en `profesionales`**
(barrido `cuit|cuil` en todo `public` → único hit `clubs.cuit`). No hay nada que emitir.

---

## 3. IDs de caballos nulos — es dato faltante, no bug de mapeo

**Es dato faltante.** El mapeo está bien: `ejemplar.id` ← `spcs.studbook_id`, que es el "Idcaballo"
del perfil de studbook.org.ar (columna `text`, índice único parcial `spcs_studbook_id_uniq`).
No confundir con `spcs.registro_stud_book`, que es seed legacy (`SB-D001`…) y no es el registro real.

Conteo en vivo sobre R8 (2026-08-23):

| Alcance | Total | Con `studbook_id` | En NULL |
|---|---|---|---|
| **Competidores en el JSON de R8** | **67** | **44** (65,7 %) | **23 (34,3 %)** |
| SPCs distintos de R8 | 67 | 44 | 23 |
| Tabla `spcs` completa | 183 | 67 (36,6 %) | 116 (63,4 %) |

> Nota: los 67 competidores de R8 son 67 ejemplares distintos — ningún caballo corrió dos veces, así
> que "competidores" y "SPCs distintos" coinciden. (El diagnóstico del 22/08 decía 80 SPCs distintos
> contando los no-competidores de la reunión; acá cuento sólo los que viajan en el JSON.)

Los 44 valores cargados son numéricos limpios de 6 dígitos, sin duplicados (el índice único lo
impide). **No hay nada que arreglar en el código: los 23 nulos son ejemplares a los que todavía no
se les cargó el id.** Se carga aparte, con el circuito de `docs/CIRCUITO_ALTA_SPCS_R8.md`.

Dos cosas que conviene saber al cargarlos:

- **2 de los 23 sin id son ganadores** (DESTINADO JOHAN c3, CHINITA SALTEÑA c5) — son los que más
  molestan para normalizar.
- **`Wave Rimout` está duplicado** en `spcs` (dos filas, misma fecha de nacimiento 2017-08-08, ambas
  con `studbook_id` NULL). `spcs` no tiene unique en `nombre`, sólo en `studbook_id`, así que el
  guard de idempotencia del alta **no ve el duplicado mientras el id siga NULL**. Hay que resolver
  cuál de las dos filas es la buena antes de cargarle el id, o se duplica el problema.

Aparte: el caso **441094 ↔ TOUCH OF BLUE** que Diego marcó como "incorrecto" no es un error nuestro
— el valor viene del scrape con match exacto de nombre y el perfil público lo respalda
(`studbook.org.ar/ejemplares/perfil/441094/touch-of-blue`). Si en su padrón 441094 es otro caballo,
hay que preguntárselo con la URL en la mano.

---

## 4. DNI de personas — se emite; falta el dato

**El DNI sí se emite.** `dni: jock?.documento_nro` y `dni: cuid?.documento_nro`, desde
`profesionales.documento_nro`. No se omite a propósito.

Conteo en vivo sobre las personas que aparecen en el JSON de R8 (2026-08-23):

| Rol | Personas distintas | Con DNI | Sin DNI |
|---|---|---|---|
| **Jockeys** | 26 | **23** (88,5 %) | **3** |
| **Cuidadores** | 43 | **26** (60,5 %) | **17** |

Contexto de toda la tabla `profesionales`: jockeys 41/51 (80 %), entrenadores 103/133 (77 %).

**El agujero es cuidadores: 17 de 43 sin documento**, contra 3 de 26 en jockeys. Si Diego los
necesita para normalizar, ahí está el 85 % del trabajo de carga.

> Parte de los faltantes tiene origen conocido: los 2 jockeys dados de alta en la corrección de
> montas de R6 (`d1600d3`) entraron **sin DNI** por regla explícita de esa tanda.

**CUIT**: no hay columna en `profesionales`. Está hardcodeado `null` en los tres bloques y no hay
dato que emitir. Habilitarlo es agregar columna + ABM + carga.

---

## Deploy — pendiente, nada aplicado

La Edge Function se despliega como **un solo archivo** inlineado; el runtime no resuelve los imports
relativos a `../_shared/*`. Antes de desplegar hay que regenerar el build:

```bash
node supabase/functions/reunion-json/_build/build.mjs   # regenera _build/index.ts
# y recién ahí desplegar la función
```

No lo corrí para dejar el diff legible: `_build/index.ts` son ~27 KB generados que taparían los
tres cambios reales.

**Checklist antes de que Diego vuelva a bajar el JSON:**

1. [ ] Aprobar el diff.
2. [ ] Regenerar el build y desplegar `reunion-json`.
3. [ ] Avisarle a Diego del campo `centesimas` (aditivo — `decimas` sigue saliendo igual).
4. [ ] Avisarle que las 2 carreras de 800 m van a venir con `tiempo: null` **a propósito**, hasta que
       se corrijan contra el ticket. Es un cambio visible respecto de lo que vio.
5. [ ] Decidir sobre los 2 tiempos de 800 m con los tickets en la mano.
6. [ ] Carga de datos, en orden de impacto: 17 DNI de cuidadores → 23 `studbook_id` → reconciliación
       de montas de R8.

---

# Anexo — cotejo contra los tickets del tote y corrección (2026-08-23)

Los 8 tiempos del ticket los aportó el usuario en sesión. Cotejo contra `tiempo_ganador`:

| nro | turno | dist | en DB (antes) | ticket | cotejo | valor aplicado |
|---|---|---|---|---|---|---|
| 1 | 2 | 800 | `43:13.00` | 47.13 | 🔴 **DIFIERE** | `00:47.13` |
| 2 | 12 | 800 | `49:00.00` | 49.00 | 🔴 **DIFIERE** | `00:49.00` |
| 3 | 4 | 1000 | `01:02.03` | 1:02.03 | ✅ igual | — |
| 4 | 5 | 1000 | `01:00.72` | 1:00.72 | ✅ igual | — |
| 5 | 10 | 1000 | `00:59.90` | 59.90 | ✅ igual | — |
| 6 | 11 | 1100 | `01:04.81` | 1:04.81 | ✅ igual | — |
| 7 | 3 | 1200 | `01:15.51` | 1:15.51 | ✅ igual | — |
| 8 | 8 | 1200 | `01:15.19` | 1:15.19 | ✅ igual | — |

**2 filas corregidas**, las mismas 2 que la guarda de plausibilidad había marcado. Las 6 restantes
coinciden dígito por dígito con el ticket — la coherencia de velocidad no se equivocó en ninguna.

Nótese el caso de la **nro 2**: `49:00.00` y `49.00` comparten los dígitos, pero lo guardado eran
**49 minutos**. Coincidencia de grafía, no de valor.

## Estado post-corrección

| nro | dist | `tiempo_ganador` | m/s | `tiempo` en el JSON |
|---|---|---|---|---|
| 1 | 800 | `00:47.13` | 16,97 | `{minutos:0, segundos:47, centesimas:13, decimas:13}` |
| 2 | 800 | `00:49.00` | 16,33 | `{minutos:0, segundos:49, centesimas:0, decimas:0}` |
| 3 | 1000 | `01:02.03` | 16,12 | `{1, 2, c:3}` |
| 4 | 1000 | `01:00.72` | 16,47 | `{1, 0, c:72}` |
| 5 | 1000 | `00:59.90` | 16,69 | `{0, 59, c:90}` |
| 6 | 1100 | `01:04.81` | 16,97 | `{1, 4, c:81}` |
| 7 | 1200 | `01:15.51` | 15,89 | `{1, 15, c:51}` |
| 8 | 1200 | `01:15.19` | 15,96 | `{1, 15, c:19}` |

**Las 8 salen con tiempo válido. Ninguna en `null`.** La banda de velocidad quedó en 15,89–16,97 m/s.

## Rollback de la corrección

```sql
UPDATE resultados res SET tiempo_ganador = v.viejo
FROM (VALUES (1,'43:13.00'), (2,'49:00.00')) AS v(prog, viejo)
JOIN carreras c ON c.numero_carrera_programa = v.prog
JOIN reuniones r ON r.id = c.reunion_id AND r.numero = 8
WHERE res.carrera_id = c.id;
```

No hay motivo para correrlo: los valores viejos son los erróneos. Queda por trazabilidad.

## Guarda en la carga (`resultados.html`)

La máscara vieja validaba forma, no magnitud. Ahora el tiempo se cruza contra
`carreras.distancia_metros` con una banda de 8–20 m/s, se acepta la forma en segundos pelados
(`47.13` → `00:47.13`) y el rechazo sugiere la reinterpretación: para 800 m, `43:13.00` propone
`00:43.13`. Sin distancia cargada se aplica el tope de 10 min, el mismo `TIEMPO_MAX_SEGUNDOS` del
exportador.

Casos probados: los 8 de R8 (los 2 rotos rechazados, los 6 buenos aceptados), segundos pelados,
enteros, legacy `1:11.20`, un decimal `1:15.5`, 3000 m en `03:10.00`, basura y `seg > 59`.

---

# Deploy — APLICADO 2026-08-23

| Ítem | Valor |
|---|---|
| Función | `reunion-json` |
| Versión | **17 → 18** (ACTIVE) |
| `verify_jwt` | `false` — **preservado**. La función usa su propio `Bearer STUDBOOK_API_TOKEN`; ponerlo en `true` habría hecho que la plataforma rechazara el token de Diego antes de llegar al código. |
| Build | `node supabase/functions/reunion-json/_build/build.mjs` → 30.140 bytes, 667 líneas, 0 imports relativos |

**Verificación post-deploy:**

1. `get_edge_function` devuelve el fuente desplegado con las tres regiones cambiadas presentes:
   `TIEMPO_MAX_SEGUNDOS`, `parseTiempo` con `centesimas`, el bloque `jockey` con `jockEfectivo`, y
   `profIds` incluyendo `jockey_suplente_id`. El camino de auth quedó intacto.
2. Smoke test en frío contra el endpoint real:
   - sin header `Authorization` → **HTTP 401** `{"status":401,"error":"unauthorized"}`
   - con token inválido → **HTTP 401**

   El 401 limpio (en vez de un 500 o un error de arranque) prueba que el módulo parsea, que el
   top-level ejecuta y que `Deno.serve` quedó registrado. Una corrupción del archivo habría
   reventado en el cold start.

No se pudo hacer un GET con datos: el `STUDBOOK_API_TOKEN` no está en el repo (correctamente) ni en
esta sesión. **La verificación del contenido del JSON contra R8 la tiene que hacer quien tenga el
token** — o Diego directamente.

## Lo que Diego va a ver distinto

1. **`tiempo.centesimas`** — campo nuevo. `tiempo.decimas` sigue saliendo con el mismo número de
   antes, así que si ya lo consumía no se rompe nada.
2. **Carreras 1 y 2** — antes `{minutos:43, segundos:13}` y `{minutos:49, segundos:0}`; ahora
   `{minutos:0, segundos:47, centesimas:13}` y `{minutos:0, segundos:49, centesimas:0}`.
3. **Bloque `jockey`** — antes tres `null`; ahora nombre y DNI. En R8 coincide con
   `jockey_inscripto` porque no hay suplentes cargados.

## Lo que NO cambió y sigue pendiente

- `resultados.html` (la guarda de carga) está en la rama, **no en `main`**, así que **no está en
  producción**: GitHub Pages sirve `main`. Hasta que se mergee, el 20/09 se puede volver a cargar
  un tiempo implausible.
- Puntos 6 y 7 de Diego (No Computables, campos de condición): sin tocar, los define Fede.
- Carga de datos pendiente, por impacto: 17 DNI de cuidadores → 23 `studbook_id` → reconciliación de
  montas de R8.
