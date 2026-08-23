# Merge del Gate 4 a main — informe previo

**Fecha:** 2026-08-23 · **Rama:** `sec/autoregistro-gate-4` (`51d3d4e`) · **Base:** `main` (`8b3b04c`)
**Estado: integración armada y verde en `tmp/merge-gate4`. NADA mergeado a `main` todavía.**

---

## 1. ¿La rama sigue verde?

**No tal cual está — pero por probes viejos, no por regresiones de producto.** Corridos sobre la rama sin mergear:

| Probe | En la rama | En `main` | Diagnóstico |
|---|---|---|---|
| `probe_gate4_inscribir` | **15 PASS · 0 FAIL** | no existe | ✅ |
| `probe_gate4_portal_ui` | **14 PASS · 0 FAIL** | no existe | ✅ |
| `probe_rls_portal` | 26 PASS · **11 FAIL** | 36 PASS · 0 FAIL | ⚠️ probe viejo |
| `probe_autoregistro_e2e` | 4 OK · **10 FAIL** | 15 OK · 0 FAIL | ⚠️ probe viejo |

Los 21 FAIL son **una sola causa en cascada**. El primer caso falla con:

```
❌ P0. el pendiente puede crear su solicitud → El hipódromo de origen es obligatorio
```

`main` sumó `hipodromo_origen` como campo obligatorio de la solicitud (rama `feat/solicitud-origen`, ya mergeada). La rama del Gate 4 salió antes de eso y su copia del probe todavía crea la solicitud sin ese campo. Sin solicitud creada, los 10 casos que dependen de ella fallan con *"Solicitud inexistente"*. `probe_autoregistro_e2e` ni siquiera está tocado por la rama: la rama arrastra la versión vieja del merge-base y `main` tiene la nueva.

Lo importante: **las tres aserciones del Gate 4 dentro de `probe_rls_portal` pasan en la rama** (11 `rpc_inscribir` rechaza un SPC ajeno, 12 rechaza fuera de ventana, 14 A no ve la inscripción de B).

**Después de resolver el merge, todo queda verde:**

| Probe | Post-merge |
|---|---|
| `probe_rls_portal` | **39 PASS · 0 FAIL · 0 PENDIENTE** (mejor que main: los 3 casos nuevos del Gate 4 cierran los 2 que estaban PENDIENTE) |
| `probe_autoregistro_e2e` | **15 OK · 0 FAIL** |
| `probe_gate4_inscribir` | **15 PASS · 0 FAIL** |
| `probe_gate4_portal_ui` | **14 PASS · 0 FAIL** |
| `probe_portal_validacion` | **6 ok** (reescrito, ver §4) |

---

## 2. Alcance del diff

108 commits de `main` desde el merge-base (`d8472c0`, 06/08) contra 5 de la rama. **Conflicto en un solo archivo: `portal.html`.** Todo lo demás automerge limpio.

```
 docs/AUTOREGISTRO_GATE_4.md                | 441 +++   (plan)
 docs/GATE_4_1_BACKFILL_TENENCIA.md         | 162 +++
 docs/GATE_4_1_LISTA_YESI.md                | 542 +++
 docs/GATE_4_3_RPC_PROBES.md                | 182 +++
 docs/GATE_4_4_UI_PORTAL.md                 | 168 +++
 migrations/backfill_tenencia_spcs.sql      | 128 +++   ya aplicada
 migrations/canal_portal.sql                |  29 +++   ya aplicada
 migrations/inscripciones_select_portal.sql |  54 +++   ya aplicada
 migrations/rollback_tenencia_spcs.sql      |  52 +++
 migrations/rpc_baja_inscripcion.sql        | 118 +++   ya aplicada
 migrations/rpc_inscribir.sql               | 168 +++   ya aplicada
 portal.html                                | 635 +/-   ⚠️ reescritura total
 tests/probe_gate4_inscribir.mjs            | 399 +++
 tests/probe_gate4_portal_ui.mjs            | 380 +++
 tests/probe_rls_portal.mjs                 |  36 +/-
 15 files changed, 3180 insertions(+), 314 deletions(-)
```

### El lado DB ya está vivo en prod

Verificado por MCP: `rpc_inscribir(uuid,uuid)` y `rpc_baja_inscripcion(uuid)` existen y son `SECURITY DEFINER`; las 4 policies de `inscripciones` están; el backfill de tenencia corrió (**114 de 183 SPC con `entrenador_id`, 64 entrenadores distintos**). **El merge no arrastra DDL pendiente: es frontend, docs y probes.** Dicho de otro modo, hoy la base ya acepta inscripciones del portal y lo único que falta es la pantalla.

### `portal.html` no es un diff, es una reescritura

Cambia el nombre de casi todas las funciones:

| main | rama |
|---|---|
| `loadCarta` | `loadLlamado` |
| `confirmarInscripcion` | `anotar` |
| `darForfait` | `retirar` |
| `loadSpcs` / `renderSpcs` | `loadCaballos` / `renderCaballos` |
| `formatMonto` | `formatARS` |
| `chipEdad` | `textoEdad` |
| — | `esc`, `ventanaAbierta`, `cargarInscripcionesCrudas`, `puedeRetirar`, `fechaHora`, `fechaCorta`, `renderListaCaballosModal` |

**Lo que gana:**

1. **La inscripción pasa por `rpc_inscribir`.** El front ya no hace `INSERT`. El RPC es `SECURITY DEFINER` y revalida todo server-side: entidad profesional, tenencia vía `fn_mis_spc_ids()`, reunión `publicada`, carrera no anulada, ventana `apertura_inscripcion`/`cierre_inscripcion` abierta, `validar_inscripcion` completa y duplicado en el mismo turno. **El bug de `valResult.valido` deja de ser posible por construcción**: no hay decisión del cliente que se pueda saltear.
2. **`esc()` en todas las interpolaciones** — cierra la parte de ISSUE-018 que corresponde al portal.
3. **Ventana de inscripción real** (`apertura_inscripcion` / `cierre_inscripcion`), fail-closed si están en NULL.
4. **Retiro desde el portal** (`rpc_baja_inscripcion`), sólo sobre filas propias, `canal='portal'`, sin ratificar y con la ventana abierta.
5. **Multi-turno explícito en la UI.** Si el caballo ya está anotado en otro turno de la misma reunión, lo muestra y **deja anotar igual**: *"— está bien, la secretaría define después"*. Es la regla de Fede y lo que pide ISSUE-048, ahora en pantalla.
6. Ya dice **"Turno"** en todos lados, sin necesidad de mi cambio de `efd73cc`.

**Lo que la rama NO traía y hubo que reinyectar** (main lo ganó después del merge-base):

| Qué | De dónde | Cómo se resolvió |
|---|---|---|
| `numero_publico` en el select y en los 3 renders | `edb48cb` | agregado con fallback `numero_publico ?? numero`. Sin esto el portal mostraría "Reunión 8" donde el hipódromo dice 7. |
| `.gte('fecha', hoy)` | `fbdd988` | agregado: una reunión publicada con fecha pasada no se ofrece. |
| Spinner que se limpia SÍ o SÍ en el error | `fbdd988` | agregado, con botón Reintentar. La rama hacía `toast(); return;` y dejaba "Cargando turnos…" para siempre. |

Resolución del conflicto: se tomó **la versión de la rama entera** (supersede a la de main por diseño) y se reinyectaron esos tres puntos. Los 9 hunks quedaron resueltos, sin marcadores, y el `<script>` pasa `node --check`.

---

## 3. ⚠️ Lo que el merge SACA del portal

La rama **elimina el alta y la edición de SPC desde el portal**. En `main` existen `openModalSpc`, `closeModalSpc`, `saveSpc`, `searchMiSpc`, `selectInscSpc`: el usuario del portal puede **crear y editar fichas de `spcs`** (nombre, registro Stud Book, fecha de nacimiento, sexo, pelo, padrillo, madre).

En la rama la sección pasa a llamarse **"Mis caballos — sólo lectura"**, y el comentario dice que la tenencia sale de `fn_mis_spc_ids()` (que lee `spcs.entrenador_id`), que la puebla el gate 4.1 y **la corrige la secretaría en el ABM**.

Es defendible: los SPC son **globales, sin `club_id`** (GOTCHA #13), así que un entrenador editando una ficha del Stud Book toca un registro compartido entre hipódromos. Pero es una **capacidad que hoy está en producción y desaparece con el merge**, y eso es decisión de producto, no técnica.

---

## 4. Probes que quedaron obsoletos

`probe_portal_validacion.mjs` y `probe_portal_validacion_rls.mjs` extraen `confirmarInscripcion` de `portal.html`, que ya no existe. Mueren con *"No se pudo extraer confirmarInscripcion"*.

Lo que cuidaban — que el veredicto del servidor no se ignore — se movió al servidor y lo cubre `probe_gate4_inscribir` (15 PASS contra prod). Lo que queda del lado del cliente es que **el rechazo se vea**: un `anotar` que se coma el error dejaría al entrenador creyendo que anotó.

`probe_portal_validacion.mjs` se reescribió con ese foco: corre el `anotar` real con el RPC stubeado, sin red ni base, 6 casos — motivo genérico, duplicado en el mismo turno, caballo ajeno, ventana cerrada, RPC caído (fail-closed) y caso válido. **6 ok.** Verifica `display:block`, `class="validation-msg validation-err"`, el texto, que no haya toast de éxito y que no refresque como si hubiera anotado.

`probe_portal_validacion_rls.mjs` (sesión real por magic link) queda para retargetear en la verificación de prod post-merge.

---

## 5. Cobertura de lo que pidió Fede

`probe_gate4_inscribir`, contra prod, con usuario de portal real y teardown:

```
✅ G1.  entrenador con tenencia inscribe su caballo con la ventana abierta
✅ G4.  el MISMO caballo en 2 carreras de la MISMA reunión: las dos aceptadas   ← la regla de Fede
✅ G5.  el mismo caballo DOS VECES en la misma carrera: rechazado
✅ G6.  A NO puede inscribir un caballo AJENO (de B)
✅ G11. SPC macho en carrera de hembras: rechazado por validar_inscripcion
✅ G15. un usuario STAFF llamando rpc_inscribir: rechazado
```

**G4 es la confirmación de Fede, ya verificada contra la base de producción.**

---

## 6. Bloqueante para la verificación end-to-end en prod

El **único** usuario de portal (`hipodromodolores@gmail.com`, profesional `11d8c346`) tiene **0 SPC a su nombre**, aunque el backfill haya vinculado 114. Con esa cuenta, "Mis caballos" sale vacío y `rpc_inscribir` responde *"Ese caballo no figura a su nombre"*.

O sea que el recorrido completo con esa cuenta **no se puede verificar tal cual**. `probe_gate4_inscribir` lo esquiva creando su propio usuario descartable y borrándolo después. Para la verificación en prod hay dos caminos: usar esa misma mecánica de fixture descartable, o que la secretaría vincule algún SPC real a esa ficha.

---

## Estado

- `main` intacto en `8b3b04c`.
- Integración resuelta, verde y con sintaxis validada en `tmp/merge-gate4`.
- **Pendiente de decisión:** §3, la baja del alta/edición de SPC desde el portal.
