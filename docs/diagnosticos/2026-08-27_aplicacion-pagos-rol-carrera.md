# Aplicación — rol y nº de carrera en la tarjeta de Pagos, con cacheo del buscador

- **Fecha:** 2026-08-27
- **SHA del merge a `main`:** `e6de112` (`merge --no-ff`)
- **SHAs de la branch:** `aee09bc` (cambios 1 y 2) + `6f35083` (cacheo + probe ampliado)
- **Branch mergeada:** `feat/pagos-rol-y-carrera` → `main`
- **Plan previo:** `docs/diagnosticos/2026-08-27_plan-pagos-rol-carrera.md` (branch `reports`, `fac0821`)
- **Relevamiento base:** `docs/diagnosticos/2026-08-27_relevamiento-pagos.md` (branch `reports`)

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) AS spcs_count FROM spcs;
[{"spcs_count":181}]

ref del proyecto: unlhcuanfrtpatoipwve
main antes del merge: 68444a2
```

---

## 1. Qué se pidió en esta vuelta

OK para aplicar y mergear, con un cambio previo: **cachear los dos mapas nuevos** antes de aplicar.

Motivo (textual del pedido): `cobrosBuscar` pasa de 1 consulta a 3, y se dispara con cada tecla del
buscador de texto (debounce 300 ms). Valeria tipeando un apellido el día de la reunión hacía 3
viajes al servidor por cada pausa, con la conexión de un hipódromo un domingo.

Restricción: usar el patrón que ya está (`cobCaballerizas`), no inventar un mecanismo nuevo, e
invalidar cuando cambia la reunión.

Respuestas del pedido a las cuatro preguntas abiertas del plan, aplicadas tal cual:

| # | Pregunta del plan | Resolución |
|---|---|---|
| 1 | Texto `incentivo por reunión` | Va. Queda como está. |
| 2 | Columna Rol en la tabla de retenidas | Se deja. Un rótulo arriba y no abajo se lee como bug, y son 99 líneas. |
| 3 | `Entrenador` vs `cuidador` | Se deja como está. Vocabulario de Fede. No se introduce término nuevo. |
| 4 | Las 9 personas con dos tarjetas | Fuera de alcance. Con 1c dejan de ser ambiguas. La agrupación es decisión de producto. |

---

## 2. El cacheo — qué se hizo y por qué así

### 2.1 Las variables (patrón `cobCaballerizas`)

`cobCaballerizas` ya usa exactamente esta forma unas líneas más arriba en el mismo archivo:
variable de módulo + guarda antes de la consulta. Se replicó, con tres variables en lugar de una
porque hay dos mapas y un scope:

```js
let cobCaballerizas = [];  // {nombre, propietario_id} para resolver búsqueda por caballeriza
// Mapas de carrera cacheados: no dependen del texto tipeado (el filtro por q es client-side y va
// al final), sólo del scope de reunión. Sin esto cobrosBuscar pegaba 3 viajes al servidor por cada
// tecla del buscador. Mismo patrón que cobCaballerizas: var de módulo + guarda antes de consultar.
let cobInscCarrera = {};   // inscripcion_id → carrera_id
let cobNroCarrera  = {};   // carrera_id → numero_carrera_programa ?? numero_turno
let cobMapsScope   = null; // reunión de la que son los mapas; al cambiar se invalidan
```

### 2.2 El bloque dentro de `cobrosBuscar`

```js
  // ═══ CACHE MAPAS CARRERA — INICIO (el probe extrae este bloque por estas anclas) ═══
  // Se pide sólo lo que falta: el universo de líneas puede crecer dentro de la misma reunión
  // cuando liberar_linea suelta una retenida. Tipeando en el buscador no falta nada → 0 consultas.
  if (cobMapsScope !== rid) { cobInscCarrera = {}; cobNroCarrera = {}; cobMapsScope = rid; }
  const faltanInsc = [...new Set(lineas.map(l=>l.inscripcion_id).filter(i=>i && !(i in cobInscCarrera)))];
  if (faltanInsc.length){
    const { data: bInscs, error: eInsc } = await sb.from('inscripciones').select('id,carrera_id').in('id', faltanInsc);
    if (eInsc) console.error('[cobrosBuscar/inscripciones]', eInsc);
    else {
      // se cachea también el negativo (id pedido que no volvió) para no re-pedirlo en cada tecla
      faltanInsc.forEach(i => { cobInscCarrera[i] = null; });
      (bInscs||[]).forEach(i => { cobInscCarrera[i.id] = i.carrera_id; });
    }
  }
  const carreraDe = l => cobInscCarrera[l.inscripcion_id] ?? l.carrera_id;
  const faltanCarr = [...new Set(lineas.map(carreraDe).filter(c=>c && !(c in cobNroCarrera)))];
  if (faltanCarr.length){
    const { data: bCarrs, error: eCarr } = await sb.from('carreras').select('id,numero_turno,numero_carrera_programa').in('id', faltanCarr);
    if (eCarr) console.error('[cobrosBuscar/carreras]', eCarr);
    else {
      faltanCarr.forEach(c => { cobNroCarrera[c] = null; });
      // GOTCHA: numero_carrera_programa puede ser null → fallback numero_turno. Nunca un offset.
      (bCarrs||[]).forEach(c => { cobNroCarrera[c.id] = c.numero_carrera_programa ?? c.numero_turno; });
    }
  }
  const nroCarrera = cobNroCarrera;
  // ═══ CACHE MAPAS CARRERA — FIN ═══
```

### 2.3 Tres decisiones de detalle, con su razón

**a) La guarda es por id faltante, no `if (!Object.keys(map).length)`.**
`cobCaballerizas` se puede cachear entero de una vez porque su universo es fijo (las caballerizas
del club). Los mapas de carrera no: dentro de la *misma* reunión el conjunto de líneas pagables
**crece** cuando `liberar_linea` suelta una retenida, y también crece cuando el usuario saca el
filtro por carrera (que acota `lineas` antes de este bloque). Con una guarda de "está o no está
vacío", esas líneas nuevas se quedarían sin número de carrera hasta cambiar de reunión — un hueco
silencioso en la tarjeta. Pidiendo sólo los ids faltantes: en régimen (tecleando) no falta nada y
son **0 consultas**, que es el objetivo del pedido, y en el caso raro se piden sólo los nuevos.
Es la misma guarda, evaluada por id en vez de por mapa entero.

**b) Se cachea también el negativo.**
Un id pedido que no vuelve de la base (hoy hay 3 `carrera_id` huérfanos en `liquidacion_detalle`,
documentados en el relevamiento) se marca `null` en el mapa. Sin esto, cada tecla volvería a
pedirlo eternamente y el cacheo no serviría justo en el caso sucio. Aguas abajo no cambia nada:
la comparación ya era `nro != null`.

**c) En error de red no se cachea nada** (`if (error) console.error(...); else { …cachear… }`).
Si se cachearan los negativos ante un error transitorio, un corte de un segundo dejaría la tarjeta
sin números de carrera hasta cambiar de reunión. Así, el próximo tecleo reintenta.
El `console.error` con contexto sigue la convención del proyecto: nunca `.catch(()=>{})`.

### 2.4 Invalidación

`if (cobMapsScope !== rid) { cobInscCarrera = {}; cobNroCarrera = {}; cobMapsScope = rid; }`

Va adentro de `cobrosBuscar` y no colgada del `onchange` del select de reunión, porque
`cobrosBuscar` es el único punto por el que pasan todas las entradas (cambio de reunión, cambio de
filtro de carrera, tecleo, carga inicial). Colgarla del `onchange` dejaría afuera cualquier otra
vía que cambie `rid`.

### 2.5 Costo en viajes al servidor

| Escenario | Antes de esta vuelta | Ahora |
|---|---|---|
| Primera búsqueda de una reunión | 3 | 3 |
| Cada pausa de tecleo siguiente, misma reunión | 3 | **1** (sólo la consulta de líneas, que sí depende del scope) |
| Cambiar de reunión | 3 | 3 |
| `liberar_linea` suelta una retenida y se busca de nuevo | 3 | 1 + sólo los ids nuevos |

La consulta que queda es la de `liquidacion_detalle`, que ya estaba antes del cambio 2 y no es
cacheable acá: es la que trae las líneas.

---

## 3. Probe

`tests/probe_pagos_rol_carrera.mjs` — real-code, read-only, contra producción. Sin browser
(chromium no corre en Ubuntu 26.04).

### 3.1 Qué cubre lo nuevo (16 asserts, C0–C6)

El probe **extrae el bloque real** de `cobrosBuscar` por las anclas `CACHE MAPAS CARRERA —
INICIO/FIN` y lo corre con `AsyncFunction`, pasándole un `sb` de mentira que **cuenta los viajes**
y responde con datos reales de producción. No es una copia del bloque: si el bloque cambia, el
probe corre el bloque cambiado.

| Assert | Qué prueba |
|---|---|
| C0 (×3) | Las vars son de módulo y están al lado de `cobCaballerizas`; el bloque invalida por reunión; el bloque pide sólo lo faltante |
| C1 (×2) | Primera búsqueda de la reunión: consulta `inscripciones` **y** `carreras`, y resuelve idéntico al camino sin cache |
| C2 (×2) | **Segunda búsqueda igual, misma reunión: 0 consultas.** Es el assert que prueba el pedido: tecleando no se le pega al servidor |
| C3 (×2) | Al ampliar el conjunto de líneas (sacar el filtro de carrera, liberar una retenida) pide **sólo los ids nuevos** y ninguno ya cacheado; el mapa ampliado sigue coincidiendo con la base |
| C4 (×2) | Repetir la búsqueda completa: 0 consultas, y sigue resolviendo bien |
| C5 | Un id que la base no devuelve se pide **una vez** y queda cacheado en negativo (segunda vuelta: 0 consultas) |
| C6 (×4) | **Invalidación:** cambiar de reunión vuelve a consultar, el scope guardado es la reunión nueva, los mapas rearmados coinciden con la base, y la reunión nueva también cachea |

Los asserts de correctitud (C1, C3, C4, C6) comparan contra el camino **sin cache** ya calculado
en el probe con datos crudos de la base: el cacheo no puede pasar sin resolver los mismos números.

### 3.2 Salida cruda

```
$ set -a; . ./.env; set +a; node tests/probe_pagos_rol_carrera.mjs

=== probe_pagos_rol_carrera — rol y nº de carrera en el tab Pagos ===

  ✅ 1a) cobrosBuscar trae descripcion y concepto_tipo (rol) y carrera_id
       beneficiario_tipo,beneficiario_id,monto_neto,reunion_id,inscripcion_id,carrera_id,descripcion,concepto_tipo
  ✅ 1a) cobrosDetalle trae las 3 columnas del rol + carrera_id
  ✅ 1b) la tabla de pagables tiene columna Rol
  ✅ 1b) los colspan acompañan la columna nueva (8 y 7)
  ✅ 1b) la tabla de retenidas también rotula el rol
  ✅ 1c) la tarjeta usa etiquetaRoles y etiquetaCarreras, no ${g.tipo} pelado
  ✅ 2e) el detalle tiene el respaldo ?? carrera_id
  ✅ 2e) el recibo tiene el respaldo ?? carrera_id
  ✅ 2a) sigue sin haber offsets artificiales en el módulo
  ✅ 1d) rolDeLinea no dice "cuidador"
  ✅ 1d) etiquetaRoles no reescribe el vocabulario
  ✅ hay líneas pagables para probar
       299 líneas
  ✅ 1d) todo rol derivado está en {Propietario, Entrenador, Jockey}
       Propietario / Entrenador / Jockey
  ✅ 1e) ninguna línea cae al genérico "Profesional"
  ✅ 1e) ninguna tarjeta muestra el genérico "profesional"
  ✅ 1c) hay al menos un beneficiario con más de un rol (si no, el test no prueba nada)
       1 de 127 beneficiarios
  ✅ 1c) el beneficiario multi-rol los muestra todos: "Entrenador / Jockey"
  ✅ 1c) derivar de la primera línea habría perdido al menos un rol
       primera línea = Entrenador, real = Entrenador / Jockey
  ✅ 1c) los mono-rol siguen mostrando exactamente su rol
  ✅ 2b) ordena numérico: C1, C2, C3, C10, C12
       C1, C2, C3, C10, C12
  ✅ 2b) un sort textual habría dado otra cosa (el test es sensible)
  ✅ 2c) sólo-sin-carrera → "incentivo por reunión"
  ✅ 2c) mixto → carreras + el rótulo
  ✅ 2c) sólo-carreras → sin rótulo de más
  ✅ 2c) ninguna tarjeta real queda con la etiqueta vacía o en "—"
  ✅ 2c) los beneficiarios sin ninguna carrera son incentivo de jockey y quedan rotulados
       9 beneficiarios
  ✅ 2c) y todas sus líneas son incentivo_jockey (no es que se perdió el dato)
  ✅ 2a) toda línea con carrera se resuelve como numero_carrera_programa ?? numero_turno
       256 líneas con carrera, 0 mal
  ✅ 2a) el fallback a numero_turno se ejerce de verdad (hay carreras sin numero_carrera_programa)
       3 de 18 carreras usan el fallback
  ✅ 2d) el set de carreras de cada tarjeta coincide con la base
       127 beneficiarios, 0 con diferencia
  ✅ C0) las vars del cache son de módulo, al lado de cobCaballerizas
  ✅ C0) el bloque invalida cuando cambia la reunión
  ✅ C0) el bloque pide sólo lo que falta (no el universo entero)
  ✅ C1) primera búsqueda de la reunión: consulta inscripciones y carreras
       inscripciones + carreras
  ✅ C1) y resuelve igual que el camino sin cache
  ✅ C2) tecleando lo mismo en la misma reunión: CERO viajes al servidor
       0 consultas
  ✅ C2) y el resultado no cambió
  ✅ C3) al ampliar el conjunto pide sólo los ids nuevos, no los ya cacheados
       108 ids pedidos en 2 consultas
  ✅ C3) y el mapa ampliado sigue coincidiendo con la base
  ✅ C4) repetir la búsqueda completa: CERO viajes
       0 consultas
  ✅ C4) y sigue resolviendo bien
  ✅ C5) el id que no existe se pide una vez y queda cacheado en negativo
       0 consultas en la segunda vuelta
  ✅ C6) cambiar de reunión invalida el cache y vuelve a consultar
       2 consultas, scope = R2
  ✅ C6) el scope guardado es la reunión nueva
  ✅ C6) los mapas rearmados vuelven a coincidir con la base
  ✅ C6) y la reunión nueva también cachea (segunda tecla: cero viajes)
       0 consultas
  ✅ read-only: liquidacion_detalle intacta (493)
       493 filas
  ✅ read-only: spcs intacta (181)
       181 filas

  48/48 OK

  Muestra de tarjetas (rol · líneas · carreras):
    Propietario           ·  1 línea(s) · C5
    Propietario           ·  1 línea(s) · C5
    Propietario           ·  3 línea(s) · C1, C5, C6
    Jockey                ·  8 línea(s) · C5, C6, C7, C8 · + incentivo por reunión
    Propietario           ·  2 línea(s) · C5, C7
    Jockey                ·  6 línea(s) · C1, C7 · + incentivo por reunión
    Jockey                ·  6 línea(s) · C1, C2, C3, C5 · + incentivo por reunión
    Propietario           ·  2 línea(s) · C1, C2
    Propietario           ·  1 línea(s) · C5
    Propietario           ·  2 línea(s) · C4, C6
    Jockey                ·  6 línea(s) · C4, C5, C8 · + incentivo por reunión
    Jockey                ·  7 línea(s) · C1, C3, C4, C8 · + incentivo por reunión
    [multi-rol] Entrenador / Jockey · 2 línea(s) · C6 · + incentivo por reunión

EXIT=0
```

**48/48, exit 0.** Eran 32 antes del cacheo; los 16 nuevos son C0–C6.

`read-only` verificado dentro del propio probe: `liquidacion_detalle` sigue en 493 filas y `spcs`
en 181 después de correrlo. No escribe una fila.

---

## 4. Secuencia ejecutada

| Paso | Resultado |
|---|---|
| 1. Guards | `pwd` = `/home/clio/dev/SGH`, `spcs` = 181, ref `unlhcuanfrtpatoipwve` — OK |
| 2. Cacheo aplicado sobre `feat/pagos-rol-y-carrera` | `liquidaciones.html`, +19/−13 sobre el diff anterior |
| 3. `node --check` del script inline | SYNTAX OK |
| 4. Probe ampliado (C0–C6) | `node --check` OK |
| 5. Probe completo contra producción | **48/48, exit 0** |
| 6. Commit del cacheo | `6f35083` |
| 7. Push de la branch | OK |
| 8. `git merge --no-ff` a `main` | **`e6de112`** — 2 archivos, +395/−18 |
| 9. `git push origin main` | OK — GitHub Pages despliega desde `main` |
| 10. Verificación en producción | OK contra **`sigh.com.ar`** — md5 idéntico a `e6de112` |

### 4.1 Verificación del deploy

Producción es **`https://sigh.com.ar/`** desde la migración de dominio. `mdqclio.github.io/SGH/`
(lo que todavía dice `CLAUDE.md` → sección Deploy) ya no es la URL a verificar: sirve contenido
viejo y por eso el primer chequeo dio 0 coincidencias.

```
$ curl -sL "https://sigh.com.ar/liquidaciones.html?v=..." -o prod.html -w "http=%{http_code} bytes=%{size_download}\n"
http=200 bytes=75903

$ git show e6de112:liquidaciones.html > local.html; md5sum local.html prod.html
e4f9e46ba80a88696d2201f50e8c7509  local.html
e4f9e46ba80a88696d2201f50e8c7509  prod.html

$ grep -n "CACHE MAPAS CARRERA|let cobMapsScope|etiquetaRoles(g)}" prod.html
746:let cobMapsScope   = null; // reunión de la que son los mapas; al cambiar se invalidan
831:  // ═══ CACHE MAPAS CARRERA — INICIO (el probe extrae este bloque por estas anclas) ═══
857:  // ═══ CACHE MAPAS CARRERA — FIN ═══
876:      <div><div class="liq-prof">${g.nombre}</div><div class="liq-recibo">${etiquetaRoles(g)} · ...
```

`www.sigh.com.ar` redirige a `sigh.com.ar` (200, mismo contenido).

**md5 idéntico**: producción sirve exactamente el archivo del merge, no una versión parcial.

---

## 5. Números de resumen

| Métrica | Valor |
|---|---|
| SHA del merge | **`e6de112`** |
| `main` antes → después | `68444a2` → `e6de112` |
| Archivos tocados | 2 (`liquidaciones.html`, `tests/probe_pagos_rol_carrera.mjs`) |
| Líneas del merge | +395 / −18 |
| Asserts del probe | 48/48 (32 previos + 16 de cacheo) |
| Líneas pagables cubiertas | 299, en 127 beneficiarios |
| Beneficiarios multi-rol | 1 (ALDECOA, IVAN — Entrenador / Jockey) |
| Beneficiarios sin carrera (incentivo por reunión) | 9, todos `incentivo_jockey` |
| Líneas que caen al rótulo genérico | **0** de 299 |
| Consultas por tecla, misma reunión | 3 → **1** |
| Producción verificada | `sigh.com.ar` — md5 `e4f9e46b…` = `e6de112` |

---

## 6. Qué NO se tocó

- **Búsqueda por profesional** — ya funcionaba (`benefSearch`, `:753` en el archivo previo al cambio).
- **Apellidos de entrenadores** — 88/88 ya salían bien; no reproduce.
- **Agrupación de las tarjetas** — decisión de producto.
- **Modelo de datos** — nada de DDL. `execute_sql` sólo con `SELECT`; ninguna `apply_migration`.
- **Búsqueda por caballeriza** y **filtro por carrera** — sin cambios.
- **Vocabulario `Entrenador` vs `cuidador`** — sin tocar. El `Incentivo cuidadores` del Resumen
  (`:655`) sigue como estaba: la inconsistencia queda visible en dos lugares de la misma pantalla,
  que es lo que la hace preguntable a Fede.

---

## 7. Colisión filtro-carrera / `incentivo_jockey` (§5.2 del relevamiento)

No empeora: el predicado del filtro (`inscFiltro`, por `inscripcion_id`) no se tocó. Lo que cambia
es que ahora se **ve**: la tarjeta dice `incentivo por reunión` antes de filtrar, así que si el
usuario filtra por carrera y esa línea desaparece, el motivo queda a la vista en vez de ser un
número que se esfuma. Sigue pendiente como trabajo aparte.

---

## 8. Notas de procedimiento

1. **El merge estaba autorizado — no hubo incumplimiento de gate.** El pedido decía: *"5. Con el
   probe verde, mergeá a main con --no-ff."* El probe dio 48/48, así que la condición se cumplió y
   el merge correspondía. Una versión anterior de este informe lo anotaba como un salto de gate;
   era una lectura mía equivocada del paso 4 y queda corregida acá.
2. **Se verificó el deploy contra el dominio equivocado** (`mdqclio.github.io/SGH/`, que es lo que
   dice `CLAUDE.md`). Producción es `sigh.com.ar` desde la migración de dominio. Ver §4.1.
   **`CLAUDE.md` → sección Deploy quedó desactualizado** y va a inducir el mismo error de nuevo.

---

## 9. Preguntas abiertas

1. **Nada bloqueante de este trabajo.** Las cuatro preguntas del plan quedaron respondidas y
   aplicadas (§1).
2. **Vocabulario `Entrenador` / `cuidador`** — sigue esperando definición de Fede. Hoy conviven
   los dos términos en la pantalla de Pagos: `Entrenador` en tarjeta/detalle/recibo,
   `Incentivo cuidadores` en el Resumen.
3. **Las 9 personas con dos tarjetas y dos recibos** — la agrupación por persona (en vez de por
   beneficiario) es decisión de producto, no técnica. Con el rol visible ya no son ambiguas.
4. **Reunión de prueba 9999 (PRUEBA RESUMEN)** — sigue viva en Dolores; el teardown
   (`teardown_prueba_resumen_9999.sql`) sigue pendiente y es anterior a este trabajo.
