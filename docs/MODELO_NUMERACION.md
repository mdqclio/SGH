# SGH — Modelo de Numeración de Caballos

Confirmado con Fede (secretario de carreras, Hipódromo de Dolores) — 28/05/2026.

---

## Conceptos

### `numero_partidor` = GATERA

El cajón de largada asignado por **sorteo** para esa carrera específica.

- Es **por-carrera** y **aleatorio**: el mismo caballo puede tener gatera 1 en el Turno 1 y gatera 7 en el Turno 4 de la misma reunión.
- Se sortea de un pool del tamaño `hipodromos.cantidad_gateras` (Dolores = 16), no del número de competidores de la carrera. Por eso puede tener **huecos** incluso con cero borrados: 8 caballos pueden salir con gateras 1,3,7,8,9,10,11,13 si esas fueron las cajitas sorteadas.
- **No es orden alfabético** (verificado en 3 carreras de producción).
- **No es un ID permanente** del caballo.
- El sorteo mapea orden alfabético → gatera al azar, para que ningún caballo tenga ventaja de posición por el criterio de asignación.

### MANDIL = CHAPA = número de carrera

El número visible en el **dorsal del caballo durante la carrera**. Siempre es **1..N consecutivo, sin huecos**, donde N = cantidad de ratificados que largan.

Se **deriva en runtime** con `renumerarChapas(inscripciones)`:
1. Filtrar `estado === 'ratificado'`.
2. Ordenar por `numero_partidor` (gatera) ASC — preserva el orden físico de largada.
3. Asignar 1, 2, 3 … N.

**No se persiste en la DB.** Siempre se recalcula.

Los forfaits se excluyen antes de la asignación, entonces la numeración 1..N siempre comprime los huecos de gatera: si largan los caballos de gateras 2,4,5,7 → mandiles 1,2,3,4.

---

## Campos en la DB

| Campo | Tabla | Semántica |
|---|---|---|
| `numero_partidor` | `inscripciones` | Gatera sorteada (cajón físico) — único campo de numeración persistido |
| `cantidad_gateras` | `hipodromos` | Tamaño del pool de sorteo (Dolores = 16) |
| `favorito_mandil` | `resultados` | Mandil (1..N) del favorito, informado manualmente antes de la carrera |

No existe campo `numero_mandil`, `numero_chapa` ni `orden_alfabetico` en la DB.

---

## Reglas de UI

**Regla de oro: `numero_partidor` (gatera) NUNCA se muestra al usuario.**

Lo que el usuario ve, tipea y reconoce es siempre el **mandil/chapa (1..N)** derivado de `renumerarChapas`.

| Pantalla | Qué mostrar | Fuente |
|---|---|---|
| Marcador (`resultados.html`) | Mandil 1..N | El usuario tipea el mandil del caballo que llegó en cada puesto |
| M.(F) / Sport (`resultados.html`) | Mandil 1..N por caballo | `renumerarChapas` → chip de color SBARG |
| Vista Reducida / Detallada | Chip de mandil 1..N | `buildChapaAt` → `renumerarChapas` |
| Programa oficial | Mandil 1..N en columna N° | `renumerarChapas` |
| PDF Inscriptos | Gatera (numero_partidor) | Único lugar donde se muestra la gatera — en la matriz "ORDEN DE LARGADA" |

El PDF de inscriptos (`inscripciones.html`) es la **única excepción**: muestra `numero_partidor` directamente porque la "ORDEN DE LARGADA" documenta el resultado del sorteo de cajones, no el mandil de carrera.

---

## Borrados en el marcador

Los caballos con `estado IN ('forfait', 'mal_inscrito')` no largan.

- **No aparecen en la secuencia 1..N** de mandiles (se excluyen antes de `renumerarChapas`).
- **No reciben dividendo a ganador** (no generan fila en `posData` → no entran al RPC `aplicar_resultado`).
- Los datos persisten en la DB (inscripciones con `estado = 'forfait'` o `'mal_inscrito'`); solo se dejaron de mostrar en la UI.

### Decisión pendiente (28/05/2026)

Visualización de "no corrió" removida temporalmente. Rediseñar con la lógica completa: hay más casos de caballos que no corrieron además de `forfait`/`mal_inscrito`. Definir con Fede antes de reimplementar.

---

## Trampa de nombres: `chapaCell` ≠ mandil del caballo

El `chapaCell` en el marcador de `resultados.html` (botón con SVG de chapa SBARG) **no es el número del caballo**. Es el indicador de **margen de llegada** respecto al ganador: nariz, pescuezo, 1 cuerpo, 5 cuerpos, etc. Se guarda en `resultado_posiciones.diferencia`.

El nombre "chapa" en este contexto viene de las figuras SBARG (Standard Bloodstock Auctioneers Racing Graphics) que ilustran las diferencias. No tiene relación con el número de mandil/chapa del caballo.

---

## Flujo completo

```
INSCRIPCIÓN
  ↓
  numero_partidor = NULL (aún no sorteado)

SORTEO (antes de ratificación)
  ↓
  numero_partidor = gatera asignada (ej: 7)
  Persiste en inscripciones

RATIFICACIÓN
  ↓
  estado = 'ratificado' (o 'forfait' / 'mal_inscrito')
  Los ratificados son los que largan

CARGA DE RESULTADOS (runtime)
  ↓
  renumerarChapas(insc_ratificados)
  → ordena por numero_partidor ASC
  → asigna mandil 1..N
  El usuario tipea mandiles 1..N en el marcador

PERSISTENCIA
  ↓
  resultado_posiciones: {posicion, inscripcion_id}
  La relación mandil ↔ caballo se reconstruye
  siempre desde numero_partidor + renumerarChapas
```
