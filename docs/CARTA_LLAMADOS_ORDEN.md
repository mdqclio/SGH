# Carta de llamados — turno por llamado y reordenamiento manual

Diseño previo a implementación. Pedido de secretaría para **R9 (06/09/2026)**.
Branch: `feat/orden-llamados`. Estado: **propuesta, sin código**.

---

## 0. Resumen

Tres pedidos. Uno ya está hecho, otro es el trabajo real, el tercero es UI.

| # | Pedido | Veredicto |
|---|---|---|
| 1 | Turno visible por llamado en el PDF | **Ya existe.** `numero_turno` es columna real y el PDF ya la imprime. No hay concepto que agregar — hay que confirmar con Yesi qué le falta de verdad |
| 2 | Reordenar llamados, recalculando turnos | **Trabajo real.** RPC atómica + resguardo por inscripciones afectadas |
| 3 | Botones subir/bajar | UI sobre lo anterior, con guardado en dos etapas |

---

## 1. Qué existe hoy (verificado, no supuesto)

### 1.1 `numero_turno` es un campo propio, y es el único concepto de orden

```
carreras.numero_turno   integer NOT NULL
UNIQUE (reunion_id, numero_turno)     -- carreras_reunion_id_numero_turno_key, NO deferrable
```

No hay columna `orden` ni nada equivalente en `carreras` (24 columnas revisadas). **`numero_turno` es el orden.** Cualquier diseño que agregue un `orden` separado duplica el concepto y hay que descartarlo.

El otro número, `numero_carrera_programa`, es un concepto **distinto y posterior**: es el orden del programa una vez hecha la ratificación, salteando las carreras anuladas (en R8: 12 turnos → 8 carreras). No se toca en este trabajo.

### 1.2 El PDF ya imprime el turno

`carta-llamados.html:780-782`, dentro de `renderPrint()` — la función que genera el documento imprimible:

```js
const turnoLabel = c.numero_carrera_programa
  ? `CARRERA ${c.numero_carrera_programa} (TURNO ${c.numero_turno})`
  : `TURNO ${c.numero_turno}`;
```

Y en la vista de pantalla, `carta-llamados.html:706-708`, el título de cada card arranca con `TURNO ${c.numero_turno}`.

**Entonces el pedido 1 ya está satisfecho tal como está escrito.** Antes de tocar nada hay que preguntarle a Yesi cuál de estas tres es la queja real:

- **(a) No lo vio** porque R9 todavía no tiene carta impresa. Se resuelve mostrándole el PDF de R8. Costo: cero.
- **(b) El número está, pero no se destaca** — hoy es texto corrido dentro de un encabezado junto a categoría, condición y distancia. Si la gente tiene que anotarse "en el turno N", quizás quiera un número grande a la izquierda, como el trapecio del programa oficial. Costo: chico, sólo CSS + markup del print.
- **(c) Los números tienen huecos o no arrancan en 1.** Esta es la hipótesis fuerte, y la que conecta con el pedido 2 — ver abajo.

### 1.3 De dónde salen los huecos

El turno se escribe **a mano**. Un solo lugar en todo el repo lo persiste (`carta-llamados.html:927`), y el valor viene de un input de texto del modal cuyo default es `carreras.length + 1`:

```js
document.getElementById('f-turno').value = rec?.numero_turno || (carreras.length+1);
```

Consecuencias:

- Si se borra un turno del medio, queda el hueco (1, 2, 4, 5...). `deleteCarrera` no renumera.
- Si se carga en otro orden, el default `length + 1` puede chocar con un turno existente → el `UNIQUE` lo rechaza y sale el error crudo de Postgres por `toast(error.message)`.
- Nada garantiza que la carta vaya 1..N contigua.

**El reordenamiento del pedido 2 resuelve esto de fondo**: si el orden se maneja con botones y se renumera solo, el número deja de escribirse a mano y la contigüidad pasa a estar garantizada por construcción.

### 1.4 Modelo de bloqueo actual

`carta-llamados.html:614-626`:

```js
const canEdit = ['borrador','programada'].includes(reunion?.estado);
```

El ENUM `estado_reunion` real tiene siete valores: `borrador`, `programada`, `publicada`, `en_curso`, `finalizada`, `cancelada`, `suspendida`. Hoy la carta se edita en los dos primeros y queda bloqueada con banner 🔒 en el resto.

> **Ojo con esto para el pedido 2.** Tu instinto fue "libre en borrador; con la carta publicada, confirmación explícita". Pero hoy `publicada` está **totalmente bloqueada**, así que esa propuesta *afloja* la regla actual, no la endurece. Y `programada` —que hoy es libre— es justo el estado de R9. Ver §3.

### 1.5 Estado real de R9 — corrige el contexto del pedido

El pedido dice "R9 existe como reunión pero SIN carreras cargadas". **No es así**: R9 (`cafa37d6…`, 06/09/2026, estado `programada`) ya tiene **11 carreras** cargadas.

Son un esqueleto: distancia y categoría puestas, `nombre` en NULL, `numero_carrera_programa` en NULL, **0 inscripciones en las 11**. Turnos 1..11 contiguos, sin huecos.

Esto es una buena noticia para el diseño: R9 es el caso ideal para estrenar el reordenamiento —hay filas reales para mover y cero inscriptos que puedan verse afectados— y además sirve de banco de pruebas del gate sin tocar datos sensibles.

### 1.6 Qué cuelga de una carrera

Referencian `carreras(id)`: `inscripciones`, `carrera_apuestas`, `resultados`, `performances`, `liquidacion_detalle`, `novedades_reunion`, más la vista `v_inscriptos_carrera`.

**Todas apuntan por `carrera_id`, ninguna guarda el turno.** Reordenar no rompe ninguna FK ni exige migrar datos: es un `UPDATE` sobre una columna que nadie referencia.

El riesgo del reordenamiento **no es de integridad, es de comunicación**: alguien a quien le dijeron "corrés en el turno 4" y ahora corre en el 6.

---

## 2. Pedido 2 — reordenamiento

### 2.1 El problema técnico: el UNIQUE no es deferrable

Reordenar es aplicar una permutación de `numero_turno` entre las carreras de una reunión. El camino obvio —bajar el turno 3 a 4 y subir el 4 a 3— pasa por un estado intermedio con dos filas en el mismo número, y `carreras_reunion_id_numero_turno_key` lo rechaza. Hacerlo desde el front con dos `UPDATE` sueltos falla, y si falla en el medio deja la carta con turnos rotos.

Dos salidas:

**(A) Hacer el constraint `DEFERRABLE INITIALLY IMMEDIATE`** y diferirlo dentro de la transacción. Es lo más limpio conceptualmente, pero es DDL sobre una constraint que hoy protege una invariante en producción, y cambia el comportamiento de *cualquier* escritura futura a esa tabla.

**(B) Permutación en dos fases con offset negativo, dentro de una RPC.** ← **recomendada**

No requiere DDL. En una sola transacción:

1. `UPDATE carreras SET numero_turno = -numero_turno WHERE reunion_id = p_reunion_id` — los negativos no pueden chocar con los positivos, y entre sí son únicos porque los originales lo eran.
2. `UPDATE` desde el mapeo `(id → turno final)` a los valores positivos definitivos.

Verificado que no hay `CHECK (numero_turno > 0)` en la tabla, así que la fase intermedia es válida. Si en algún momento se agrega ese CHECK, la fase 1 debe pasar a un offset alto (`+10000`) en vez de negativo.

### 2.2 RPC propuesta

```
reordenar_turnos(p_reunion_id uuid, p_orden jsonb) → jsonb
```

`p_orden` es el orden final completo: `[{"id": "<uuid>", "turno": 1}, ...]`.

Validaciones, todas dentro de la transacción y antes de escribir:

1. La reunión existe y su `estado` habilita reordenar (§3).
2. **El conjunto de ids de `p_orden` es exactamente el conjunto de carreras de la reunión** — ni de más, ni de menos. Esto es también el control de concurrencia: si otra persona agregó o borró un turno mientras esta armaba el orden, los conjuntos difieren y la RPC rechaza en vez de pisar.
3. Los turnos son exactamente `1..N`, sin huecos ni repetidos.
4. **Ninguna carrera de la reunión tiene `numero_carrera_programa` seteado.** Si la ratificación ya numeró el programa, reordenar turnos desincroniza la carta del programa impreso. Bloqueo duro, independiente del estado de la reunión.

Devuelve un resumen para el toast: cuántas carreras cambiaron de turno y cuántas inscripciones quedaron afectadas.

La RPC es la **única** vía de escritura del orden. El front no vuelve a escribir `numero_turno` suelto: el campo del modal deja de ser editable y pasa a ser informativo (§4.3).

### 2.3 Renumeración al borrar

Con la RPC hecha, `deleteCarrera` puede cerrar el hueco llamándola con el orden resultante. Propuesta conservadora: cerrar el hueco automáticamente **sólo si la reunión no tiene ninguna inscripción**; si las tiene, dejar el hueco y ofrecer un botón "Renumerar 1..N" que pasa por la misma confirmación del §3. Motivo: borrar un turno ya avisa que se pierden inscripciones; renumerar de prepo encima cambiaría el turno de terceros sin avisar.

---

## 3. La regla crítica — resguardo del reordenamiento

### 3.1 Qué está realmente en riesgo

`inscripciones` no guarda el turno, así que no hay corrupción posible. Lo que se rompe es un acuerdo con una persona: se anotó "en el turno 4" y ahora ese llamado es el 6. El daño escala con **cuánta gente ya se anotó y cuánto circuló la carta**, no con la etiqueta del estado.

Por eso el resguardo no debería colgar sólo del `estado`: una reunión `programada` con 40 inscriptos es más delicada que una `borrador` con 0. Propongo cruzar ambas cosas.

### 3.2 Niveles propuestos

| Nivel | Condición | Comportamiento |
|---|---|---|
| **Libre** | `estado ∈ (borrador, programada)` **y** 0 inscripciones en toda la reunión | Subir/bajar y guardar sin confirmación. Toast: "Orden actualizado — N turnos" |
| **Confirmado** | `estado ∈ (borrador, programada)` **y** hay inscripciones | Modal de confirmación con el detalle de §3.3. Requiere aceptar |
| **Bloqueado** | `estado ∉ (borrador, programada)` | Botones ocultos, igual que hoy. Banner 🔒 existente |
| **Bloqueado duro** | cualquier carrera con `numero_carrera_programa` seteado | Bloqueado en todos los estados, con su propio mensaje |

Con esto, **R9 cae en "Libre"** (programada, 0 inscripciones) y Yesi arma la carta de septiembre sin fricción — que es el objetivo inmediato.

### 3.3 Qué muestra la confirmación

No alcanza con "¿estás segura?". Tiene que mostrar el daño concreto, sólo de las carreras que **cambian** de turno:

```
Reordenar cambia el turno de 3 llamados con gente anotada:

  TURNO 2 → 4    Perdedores 3 años        7 inscriptos
  TURNO 4 → 5    Ganadores                12 inscriptos
  TURNO 5 → 2    Especial Santa Rosa      4 inscriptos

  23 inscripciones en total cambian de turno.
  Los otros 6 llamados no se mueven.

Quien se anotó "en el turno 2" ahora corre en el 4.
[ Cancelar ]  [ Reordenar igual ]
```

Botón de confirmación con texto explícito ("Reordenar igual"), no un "Aceptar" genérico. El conteo sale de la misma consulta que alimenta la lista, sin viaje extra.

### 3.4 Sobre habilitar reordenamiento con la carta publicada

Tu instinto planteaba confirmación explícita en `publicada`. **No lo incluyo en v1**, y quiero dejar dicho por qué, porque es una decisión de producto y la convención del proyecto es elegir lo conservador y anotarlo:

- Hoy `publicada` bloquea la carta **entera**. Habilitar sólo el reordenamiento sería la única operación de escritura permitida en ese estado — una excepción rara de explicar y de mantener.
- Una carta publicada ya salió: se imprimió, se mandó por WhatsApp, la leyó gente. Cambiar los turnos ahí no es un cambio de dato, es **emitir un documento distinto con el mismo nombre**. Si se habilita, hace falta además versionar o marcar la carta como reeditada y volver a distribuirla — trabajo que excede este pedido.
- El caso de uso real (armar los llamados y acomodarlos) ocurre **antes** de publicar. R9 está `programada`, no `publicada`.

Si secretaría igual lo necesita, la extensión natural es un cuarto nivel "Publicada — reordenamiento excepcional": misma confirmación del §3.3 más un segundo paso donde se tipea el número de inscripciones afectadas para confirmar, y un marcador `carta_reeditada_at` en `reuniones` que el PDF imprima como "CARTA REEDITADA — reemplaza a la del DD/MM". Queda propuesto, no implementado, a la espera de Fede.

---

## 4. Pedido 3 — UI

### 4.1 Botones, no drag&drop

Ya decidido: ▲▼ por card. Más confiable en móvil, funciona con teclado, y no necesita librería.

- El ▲ del primero y el ▼ del último van `disabled`.
- Sólo se muestran si el nivel es Libre o Confirmado.
- Área táctil mínima 44×44 px — la secretaría no siempre está en compu.

### 4.2 Guardado en dos etapas

Los botones **no persisten en cada click**. Reordenan en memoria y aparece una barra fija:

```
Orden modificado — 3 llamados movidos     [ Descartar ]  [ Guardar orden ]
```

Razones: una sola confirmación en vez de una por click, una sola RPC atómica en vez de N, "Descartar" sale gratis, y acomodar cinco llamados no dispara cinco escrituras.

La barra bloquea la navegación con cambios sin guardar, como ya hace `resultados.html` (hay un probe de ese patrón: `tests/probe_nav_dirty.mjs`).

### 4.3 El número de turno deja de tipearse

En el modal, `f-turno` pasa de input editable a texto informativo ("Turno 4 — se ajusta con las flechas de la lista"). Los turnos nuevos se agregan al final (`N+1`) y se acomodan con las flechas. Esto elimina de raíz los choques de `UNIQUE` y los huecos del §1.3.

### 4.4 Realce en el PDF — sólo si Yesi confirma

Si la respuesta a §1.2 es la opción (b), el turno pasa a un bloque numerado a la izquierda del encabezado, en la línea del trapecio de `programa-oficial-color.html`. Es CSS y markup del `renderPrint()`, sin tocar datos. **No se hace hasta tener la confirmación** — hoy el número ya está impreso y puede que alcance.

---

## 5. Fuera de alcance

- Agregar una columna `orden` — `numero_turno` ya es eso (§1.1).
- Tocar `numero_carrera_programa` — es post-ratificación, otro concepto.
- Drag & drop.
- Reordenar con la reunión publicada o posterior (§3.4).
- Ordenamiento automático por criterio (perdedores por edad → ganadores → especial). El criterio lo aplica la secretaría a mano; automatizarlo requiere modelar "es especial" y una jerarquía de condiciones que hoy no existe. Si más adelante se quiere, el gancho natural es un botón "Ordenar sugerido" que propone y deja acomodar.

---

## 6. Plan de implementación

Cuatro gates, cada uno verificable antes de pasar al siguiente.

| Gate | Entregable | Verificación |
|---|---|---|
| **1** | `migrations/reordenar_turnos.sql` — RPC con las 4 validaciones del §2.2 | `tests/probe_reordenar_turnos.mjs` contra R9 (0 inscripciones): permutación circular de los 11 turnos, verificar 1..N contiguo, revertir al orden original. Más los casos de rechazo: id de más, id de menos, turnos con hueco, `numero_carrera_programa` seteado |
| **2** | UI en `carta-llamados.html`: ▲▼, barra de guardado, modal de confirmación, `f-turno` informativo | Probe de código real (patrón `tests/README.md`): extraer la función de reordenamiento y verificar que arma bien el payload y calcula bien las inscripciones afectadas |
| **3** | Realce del turno en el PDF | Sólo si Yesi confirma §1.2(b) |
| **4** | Deploy + verificación en prod + entrada en `CHANGELOG.md` y `docs/MODULOS.md` | `curl` a prod, y Yesi carga la carta de R9 de punta a punta |

El gate 1 es independiente del 2: la RPC se puede aplicar y probar sin tocar la UI.

---

## 7. Para confirmar antes de codear

1. **Yesi** — ¿cuál es la queja real del pedido 1: (a) no lo vio, (b) no se destaca, o (c) los números tienen huecos? De esto depende si el gate 3 existe.
2. **Yesi** — R9 ya tiene 11 turnos cargados (esqueleto sin nombre, 0 inscriptos). ¿Son los llamados de septiembre para completar, o hay que empezar de cero?
3. **Fede** — ¿el reordenamiento con la carta ya publicada hace falta de verdad (§3.4), o alcanza con que sea antes de publicar?
4. **Fede** — al borrar un turno del medio con inscripciones cargadas, ¿cerrar el hueco o dejarlo? (§2.3 propone dejarlo y ofrecer el botón).

---

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| El `UNIQUE` rechaza la permutación a mitad de camino | Todo dentro de la RPC, dos fases con offset negativo, una sola transacción (§2.1) |
| Dos personas reordenan a la vez | La RPC exige que el conjunto de ids coincida exactamente con el estado actual; si no, rechaza (§2.2, validación 2) |
| Se reordena con el programa ya numerado | Bloqueo duro por `numero_carrera_programa` en cualquier estado (§2.2, validación 4) |
| Alguien queda con un turno viejo en la cabeza | Es el riesgo irreducible. La confirmación del §3.3 lo hace explícito antes de aceptar; comunicarlo queda del lado de secretaría |
| El piloto de inscripción online del portal muestra turnos que después se mueven | Cuando el portal inscriba, conviene que muestre el nombre del llamado además del número, y que la reunión pase a `publicada` (Bloqueado) antes de abrir inscripción online |
