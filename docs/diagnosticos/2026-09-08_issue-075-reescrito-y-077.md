# ISSUE-075 reescrito e ISSUE-077 abierto — las dos ventanas de ratificación

**Fecha:** 2026-09-08
**Alcance:** **sólo documentación.** Ni una línea de `ratificacion.html`, ni DDL, ni datos.
**SHA de `main`:** `eface80078b99a56c9ae3160053cd8fd0c425d31`
**SHA de este informe:** ver §6.
**Plan que lo motiva:** `docs/diagnosticos/2026-09-08_plan-issue-075-ventana-ratificacion.md`

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) FROM spcs;      -- por MCP, proyecto unlhcuanfrtpatoipwve
[{"spcs":181}]

ref del proyecto: unlhcuanfrtpatoipwve
```

## Resumen

| | |
|---|---|
| ISSUE-075 | **reescrito** — el diagnóstico viejo queda tachado, con el porqué del error |
| ISSUE-077 | **nuevo** — el guard de ratificación que no existe en la base |
| ISSUE-074 | referencia corregida al diagnóstico nuevo |
| `docs/SCHEMA.md` | nota que dice **de quién es cada ventana** |
| `ratificacion.html` | **sin tocar**, como se pidió |
| Archivos cambiados | 2, los dos de `docs/` |

---

## 1. ISSUE-075 — el diagnóstico nuevo

Lo que dice ahora, en orden:

**(a) El hecho que lo decide.** En R8 la secretaría ratificó **el lunes 15:23–15:27**, con toda la
sesión —3 `mal_inscrito`, 31 `forfait`, 2 correcciones y los 67 `ratificado`— entre las 14:23 y las
17:58, por un solo usuario. El cierre pretendido era el lunes 12:00: **+3 h 23 min**.

**(b) El diagnóstico correcto.** No son dos cálculos de la misma fecha:

| Ventana | ¿Para quién? | ¿Qué gobierna? | Fuente |
|---|---|---|---|
| **Plazo del entrenador** | portal | hasta cuándo pide el forfait él mismo | `carreras.apertura/cierre_ratificacion` |
| **Cierre de la carga** | `ratificacion.html` | hasta cuándo la secretaría procesa | `reuniones.hora_cierre_ratificacion` + `fecha` |

Y el orden es a propósito: **primero cierra la ventana del entrenador, después la secretaría
procesa lo que entró** — incluidos los forfait que le llegan por teléfono. Si fueran el mismo
instante, no tendría un minuto para cargar nada.

**(c) Cuál es el problema, entonces.** Que las dos se llamen "cierre de ratificación". Ya causó
daño dos veces: **ISSUE-074** (se cargaron los cuatro campos de R9 creyendo que gobernaban la
pantalla) y **la primera versión de este mismo issue**, que a partir del nombre concluyó "calcula
mal" y propuso un cambio que habría roto la operación.

**(d) El texto viejo queda**, tachado dentro de un `<details>`, con la explicación de por qué
estaba mal:

> *El error de razonamiento fue asumir, a partir del nombre compartido, que las dos fuentes
> describían el mismo plazo. Sin mirar cuándo se ratifica de verdad, "seis días de diferencia"
> parecía un bug y era el diseño.*

Se conserva a propósito: el issue documenta tanto la conclusión como el camino equivocado, que es
lo que evita repetirlo.

---

## 2. Los dos nombres propuestos

Como pediste. **Sólo propuestos, no aplicados** — el renombre en la UI es trabajo aparte.

| Concepto | **Nombre propuesto** | Dónde habría que cambiarlo |
|---|---|---|
| `carreras.apertura/cierre_ratificacion` | **«Plazo de forfait del entrenador»**<br>(corto: *«Forfait desde el portal»*) | inputs `f-ap-rat` / `f-ci-rat` del modal de turno en `carta-llamados.html`; chip del portal; doc |
| `reuniones.hora_cierre_ratificacion` + `fecha` | **«Cierre de carga de secretaría»**<br>(alt: *«Cierre de la planilla»*) | campo `f-hora-cierre-rat` de `reuniones.html`; rótulo de `renderCierreStatus`; doc |

**El criterio: cada nombre dice de quién es el plazo.** El error viene de que los dos decían
"ratificación", que es el **trámite**, no el **actor**. Dos actores distintos con plazos distintos
sobre el mismo trámite necesitan dos nombres, y el nombre tiene que llevar al actor.

Y el rótulo de `ratificacion.html:560-566`, que hoy dice `Cierre 12:00 hs — ABIERTA` a secas —sin
dueño, y es lo que la secretaría lee como *el* cierre— pasaría a mostrar los dos:

```
Forfait del entrenador: cerró el lunes 14/09 12:00
Carga de secretaría: abierta hasta el domingo 20/09 12:00
```

## 3. `reuniones.hora_cierre_ratificacion` se queda

Confirmado en el issue: **no es un campo muerto.** Gobierna la ventana de la secretaría, que es
real y se usa todas las reuniones. Lo que hay que cambiarle es el **nombre en la UI**, no la
existencia.

Es lo contrario del caso de ISSUE-074, donde las dos columnas de `carreras` sí estaban sin
consumidor — y ahí la salida fue darles uno, no borrarlas.

---

## 4. ISSUE-077 — el guard que no existe

El contraste, que es lo que pediste que quedara en el ticket:

| | Portal (entrenador) | `ratificacion.html` (secretaría) |
|---|---|---|
| Cómo escribe | `sb.rpc('rpc_baja_inscripcion', …)` | `sb.from('inscripciones').update({estado:'ratificado'})` **directo** |
| Guard de ventana | **en la base** | **ninguno** |
| Guard de canal / autor | **en la base** | no aplica |
| Guard de estado admitido | **en la base** | **ninguno** |
| Si se esquiva la UI | el RPC rechaza | **se escribe** |

La única policy es de club, sin condición de tiempo ni validación de transición:

```
inscripciones_update | UPDATE |
  (NOT fn_is_portal_user())
  AND (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id())
```

Lo que hoy frena a un `secretario_carreras` autenticado de ratificar una reunión finalizada, o de
pasar de `forfait` a `ratificado` meses después, **es la UI y nada más**. Deshabilitar un
`<button>` no es un control de acceso.

**Por qué es más grave que el 075**: el 075 es deuda de claridad —nadie se rompe, sólo se
confunde—. Esto es un control que no existe sobre la tabla de la que salen el programa, el sorteo,
los mandiles, la liquidación y el JSON del Stud Book.

**El atenuante honesto**, que también quedó escrito: la secretaría **es** la autoridad y tiene que
poder forzar — ratificó a las 15:23 pasado el plazo del entrenador y estuvo bien. El problema no es
que pueda: es que **no hay ninguna línea donde diga hasta dónde**, ni rastro de cuándo la cruzó.

**Y la advertencia de orden**, que es la lección del 075 aplicada a su propia solución:

> Antes de escribir el guard hay que **medir qué hace la secretaría de verdad**. Si se define la
> ventana desde el papel en vez de desde la auditoría, se bloquea la operación — que es justo lo
> que casi pasa acá.

Prioridad **Alta**, sin daño medido. No se hace ahora.

---

## 5. `docs/SCHEMA.md`

Nota nueva junto a la definición de las columnas, para que la próxima persona que las lea sepa cuál
es cuál sin tener que reconstruirlo:

```diff
diff --git a/docs/SCHEMA.md b/docs/SCHEMA.md
index a34e18b..17352aa 100644
--- a/docs/SCHEMA.md
+++ b/docs/SCHEMA.md
@@ -220,6 +220,19 @@ id UUID PK, club_id FK, usuario_id FK, tabla, registro_id UUID, accion, datos_an
 
 ## JSONB distribucion_premios
 {"1": 60, "2": 19, "3": 12, "4": 6, "5": 3, "bono_ganador": 250000, "bono_posicion_desde": 6, "bono_posicion_hasta": 8, "bono_posicion_monto": 100000, "ganancia_minima": 100000}
+NOTA — LAS DOS VENTANAS DE RATIFICACIÓN (no son la misma, ISSUE-075):
+· `carreras.apertura_ratificacion` / `cierre_ratificacion` (timestamptz, POR TURNO) =
+  **plazo del ENTRENADOR**: hasta cuándo puede pedir el forfait él mismo desde el portal.
+  Lo lee `rpc_baja_inscripcion`. En R8 y R9 cae el LUNES, seis días antes del domingo de la
+  carrera. Se edita en el modal de turno de `carta-llamados.html` (`f-ap-rat` / `f-ci-rat`).
+· `reuniones.hora_cierre_ratificacion` (time, POR REUNIÓN) + `reuniones.fecha` =
+  **cierre de la CARGA DE SECRETARÍA**: hasta cuándo `ratificacion.html` la deja procesar —
+  ratificar, cargar los forfait que llegaron por teléfono, pesos, jockeys. Cierra el DÍA DE LA
+  CARRERA a esa hora. Se edita en `reuniones.html` (`f-hora-cierre-rat`).
+El orden es a propósito: primero cierra la ventana del entrenador, DESPUÉS la secretaría procesa
+lo que entró. En R8 ratificó el lunes 15:23, tres horas después del cierre del entrenador —
+unificar las dos habría bloqueado esa sesión entera. NO son intercambiables.
+
 NOTA ganancia_minima: piso de premio por puesto. Si `bolsa * pct / 100 < ganancia_minima`, ese puesto se eleva al piso; los que superan el piso no se tocan. Display via `premios-utils.js#calcPremiosConPiso` (bolsa efectiva derivada al render); pago efectivo via `liquidaciones.html` (que aplica el Math.max incluyendo bonos). `carreras.bolsa_total` en DB es siempre la bolsa nominal — nunca se persiste la efectiva.
 
 ## ALTER TABLE ejecutados posteriormente
```

---

## 6. Verificación en `origin`

```
$ git ls-remote origin main
eface80078b99a56c9ae3160053cd8fd0c425d31	refs/heads/main

$ git log --oneline origin/main -2
eface80 docs: ISSUE-075 reescrito (son dos plazos, no dos cálculos) e ISSUE-077 nuevo
972c077 merge: forfait desde el portal en la ventana de ratificación

$ git diff --stat origin/main~1..origin/main    # sólo docs
 docs/ISSUES.md | 286 +++++++++++++++++++++++++++++++++++++++++++++++----------
 docs/SCHEMA.md |  13 +++
 2 files changed, 253 insertions(+), 46 deletions(-)

$ git diff --stat origin/main~1..origin/main -- ratificacion.html   # sin tocar
(vacío = ratificacion.html no se tocó)
```

## 7. Preguntas abiertas

1. **El renombre en la UI queda propuesto, no hecho.** Son cuatro rótulos (`carta-llamados.html`
   ×2, `reuniones.html`, `renderCierreStatus`) más el rótulo doble. ¿Lo hago, o lo confirmás con
   Fede y Yesi primero? Son ellos los que leen esas etiquetas todas las semanas.
2. **La evidencia es de una sola reunión.** R8 es la única completa con ventanas cargadas. El
   criterio de "la secretaría procesa después" se apoya en ella. Con R9 —lunes 14/09— vamos a tener
   la segunda medición, y ahí se confirma o se corrige.
3. **ISSUE-077 necesita medición antes de diseñarse** (§4). Cuando se encare, el primer paso es la
   consulta a `auditoria`, no el `CREATE FUNCTION`.
4. **Nada de esto corre para el lunes 14.** El forfait del portal ya cierra a las 12:00.

### 7.1 SHA final

```
$ git ls-remote origin reports
f8f49753f876f5d689a73b7aaa5da5fcb6fe43ff	refs/heads/reports
$ git rev-parse HEAD
f8f49753f876f5d689a73b7aaa5da5fcb6fe43ff
$ git ls-remote origin main
eface80078b99a56c9ae3160053cd8fd0c425d31	refs/heads/main
```

Los dos refs verificados en `origin`.
