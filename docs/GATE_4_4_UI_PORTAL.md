# Gate 4.4 — UI del portal · ✅ **HECHO Y VERIFICADO**

**Fecha**: 2026-08-06 · **Branch**: `sec/autoregistro-gate-4` · **Ref**: `unlhcuanfrtpatoipwve`
**Guard**: `pwd = /home/clio/dev/SGH`, `spcs = 163`, `spcs.entrenador_id = 114` ✅

> 🔴 **Nada en `main`.** `portal.html` sólo cambia en la branch. El merge lo decide Fede el **lunes 17**.
> Este gate **no aplica nada a la base**: es sólo frontend. Las funciones y la policy ya estaban vivas del 4.3.

---

## 1. Resultado en una línea

🟢 **44 asserts en verde entre los tres probes** (14 nuevos de UI + 15 del RPC + 15 del RLS del portal, sobre 37 totales de ese archivo). `portal.html` pasó de estar cableado contra un modelo que no existe a operar el circuito real.

---

## 2. Los cinco bugs vivos que tenía `portal.html`

Todos estaban en el archivo antes de este gate. Ninguno se había ejecutado nunca contra datos reales.

| dónde | qué pasaba | ahora |
|---|---|---|
| query de reuniones | `.in('estado', ['publicada','abierta'])` — **`'abierta'` no existe** en el ENUM `estado_reunion` → `22P02`. La sección **nunca cargaba**, ni con datos ni sin ellos. | `.eq('estado','publicada')` |
| **query de carreras** | pedía **`condicion_edad`, que no es una columna** → `42703 column carreras_1.condicion_edad does not exist`. Mismo efecto: la sección no cargaba. | `edad_minima_anos` / `edad_maxima_anos`, con un `textoEdad()` que arma "3 a 5 años" |
| validación | `valResult.valido === false` — `validar_inscripcion` devuelve `puede_inscribirse`. `undefined === false` es `false`, así que **la validación nunca bloqueó nada** | la hace el RPC, con `IS NOT TRUE` |
| alta de SPC | `sb.from('spcs').insert(...)` desde el portal. Los SPCs son **globales**: un entrenador daría de alta registros del Stud Book para todos los hipódromos | **eliminada** (botón, modal y función) |
| botón Forfait | `UPDATE estado='forfait'` directo. El forfait es acto de ratificación, fuera de v1 | **eliminado** |

> El segundo lo encontró el probe, no la lectura del código: `condicion_edad` venía del archivo original y se veía perfectamente plausible.

Además: `formatMonto()` propio → **`formatARS()`** con el formato argentino, y el vínculo usuario↔entidad ya no se busca **por email** sino con **`fn_mis_entidades()`** — la misma función que usan las policies y los RPC. Buscar por email daba un vínculo distinto del que la base considera válido.

---

## 3. Qué hace ahora cada sección

### Mis caballos — sólo lectura

Sale de **`fn_mis_spc_ids()`**, que lee `spcs.entrenador_id` (el campo que pobló el gate 4.1). No deriva nada.

**Estado vacío con explicación** — es lo que van a ver los entrenadores de los 49 SPCs sin tenencia:

> **Todavía no hay caballos asociados a tu ficha**
> Esto no quiere decir que no tengas caballos: quiere decir que en el sistema todavía no figuran a tu nombre.
> **Qué hacer:** pedile a la secretaría del hipódromo que vincule tus caballos a tu ficha. Es un minuto de trabajo de su lado y después aparecen acá solos.
> Mientras tanto, tus inscripciones las sigue cargando la secretaría, como siempre.

Dice **por qué** está vacío, **qué hacer**, y que **no se quedan afuera** mientras tanto.

### Llamado abierto

Criterio único, fail-closed (§B del plan): reunión `publicada` + carrera no `anulada` + `apertura`/`cierre` cargados y vigentes. Cada turno muestra **hasta cuándo** se puede anotar y, si ya tenés caballos ahí, cuántos.

Vacío: «No hay inscripciones abiertas en este momento. Cuando la secretaría abra el llamado para la próxima reunión, los turnos aparecen acá con la fecha límite… Si sabés que el llamado ya salió y no lo ves, consultá en la secretaría.»

Un propietario ve el llamado pero no el botón, con el motivo escrito: anotar lo hace el entrenador.

### Anotar — multi-categoría sin fricción

No hay buscador libre sobre los 163 SPCs: se listan **mis caballos**, con su estado respecto de ese turno.

- Ya anotado **en ese mismo turno** → botón deshabilitado, dice "Anotado".
- Ya anotado **en otro turno de la misma reunión** → chip informativo:
  *"también anotado en el turno 1 — está bien, la secretaría define después"*, **y el botón sigue habilitado.**

Es GOTCHAS #69 hecho interfaz: el aviso existe para que el entrenador no crea que se equivocó, no para frenarlo.

Toda la escritura pasa por `rpc_inscribir`. El portal no tiene `INSERT` sobre `inscripciones`.

### Mis inscripciones

Caballo, hipódromo, reunión, **turno** (etiquetado turno, no "carrera" — ISSUE-029), estado y **quién la cargó** (Portal / Secretaría).

**Retirar** aparece sólo si se cumplen las cuatro condiciones de §D: fila propia, `canal='portal'`, `estado='inscripto'` y ventana abierta. Si no, no se muestra el botón — no se ofrece deshabilitado lo que no se puede hacer. Debajo de la tabla, la regla escrita en castellano.

El RPC revalida las cuatro condiciones igual: la UI decide qué mostrar, no qué se permite.

---

## 4. Seguridad — ISSUE-018

Todo lo que viene de la DB pasa por un `esc()` antes de ir a `innerHTML`. Verificado con un assert que inyecta `<img src=x onerror="alert(1)">` y comprueba que sale escapado.

---

## 5. El probe: código real, sin browser

`tests/probe_gate4_portal_ui.mjs` — 14 asserts.

Playwright/chromium no corre en Ubuntu 26.04, así que se usa el patrón de harness del repo (`tests/README.md`): se lee el `<script>` de `portal.html` **tal cual**, se le saca el IIFE de arranque, se le agrega un setter sobre las mismas variables de módulo, y se evalúa con `new AsyncFunction` inyectando un **cliente Supabase real autenticado como entrenador del portal** + stubs de DOM.

Corre **el mismo texto que sirve producción**. No hay reimplementación.

```
── Funciones puras, extraídas del archivo ──
  ✅ U1. ventanaAbierta: fail-closed en NULL, cerrada, anulada y reunión no publicada
  ✅ U2. esc() escapa el HTML que viene de la DB (ISSUE-018)
  ✅ U3. formatARS usa el formato argentino
── Estado vacío: entrenador sin tenencia ──
  ✅ U4. el entrenador sin caballos ve POR QUÉ está vacío y QUÉ hacer
  ✅ U5. fn_mis_spc_ids devuelve 0 para un entrenador sin caballos asignados
── Llamado abierto: sólo los turnos con ventana vigente ──
  ✅ U6. muestra los 2 turnos abiertos y descarta cerrado, sin ventana y anulado
  ✅ U7. cada turno dice hasta cuándo se puede anotar y ofrece el botón
── Multi-categoría: avisa, no bloquea (GOTCHAS #69) ──
  ✅ U8. en otro turno de la misma reunión: avisa y DEJA anotar igual
  ✅ U9. en el MISMO turno: el botón queda deshabilitado
── Mis inscripciones: "Retirar" sólo sobre lo propio ──
  ✅ U10. la fila propia del portal ofrece Retirar y muestra el origen
  ✅ U11. con una fila de secretaría en pantalla, Retirar sigue apareciendo UNA sola vez
  ✅ U12. puedeRetirar: sí sobre la propia del portal, no sobre la de secretaría
  ✅ U13. con la ventana cerrada ya no se ofrece Retirar (eso es forfait, fuera de v1)
  ✅ U14. la tabla explica cuáles se pueden retirar y cuáles no

  PASS 14   FAIL 0
```

Fixture: reunión **9993**, fecha 2099. **No toca R8 ni ninguna reunión real.**

### Los otros dos, sin regresión

```
probe_gate4_inscribir  → PASS 15  FAIL 0
probe_rls_portal       → 37 PASS · 0 FAIL · 0 PENDIENTE
```

### Producción, después de todo

| | |
|---|---:|
| `inscripciones` | 198 (sin cambios) |
| con `canal='portal'` | **0** |
| usuarios / SPCs / profesionales / caballerizas `PROBE-%` | **0** |
| reuniones fixture 9990-9998 | **0** |
| `spcs` / con `entrenador_id` | 163 / 114 |

**Cero residuo.**

---

## 6. Lo que sigue afuera de v1

| | por qué |
|---|---|
| alta de SPC desde el portal | Stud Book global; acto de secretaría |
| forfait y ratificar | acto de ratificación, decisión 2 pendiente de Fede |
| que el propietario anote | sin fuente confiable de tenencia por propiedad (`spc_propietarios` vacía) |
| "Lo que se me debe" (§C.4 de PORTAL_V2_PLAN) | no entra en el Gate 4; el bloque de retenidos por doping necesita su propia vuelta |

---

## 7. Estado del Gate 4

| gate | estado |
|---|---|
| 4.0 plan | ✅ |
| 4.1 backfill de tenencia | ✅ aplicado y verificado |
| **4.2 ventana editable con la reunión publicada** | ⏸ **esperando a Yesi** |
| 4.3 RPC + policy + probes | ✅ aplicado, 30/30 |
| 4.4 UI | ✅ hecho, 14/14 |

**El 4.2 sigue siendo el bloqueante para usarlo de verdad.** Hoy la secretaría no puede abrir la ventana en una reunión ya publicada (`carta-llamados.html` congela la edición al publicar), y sin ventana cargada el portal muestra "no hay inscripciones abiertas" — que es el lado correcto para fallar, pero deja el circuito sin arrancar.

---

## 8. Congelamiento

`main` congelado desde el **viernes al mediodía hasta el lunes 17**: nada, ni siquiera docs. El domingo es el hito. Este gate no lo toca — todo vive en `sec/autoregistro-gate-4`.
