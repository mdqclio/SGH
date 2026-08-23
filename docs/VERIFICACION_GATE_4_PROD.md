# Gate 4 en producción — verificación del recorrido del entrenador

**Fecha:** 2026-08-23 · **Merge:** `b3e1c1a` · **Prod:** desplegado y verificado
**Resultado: 17 PASS · 0 FAIL · teardown limpio.**

---

## Merge

`sec/autoregistro-gate-4` (`51d3d4e`) → `main` (`b3e1c1a`). Detalle del alcance y de la
resolución del conflicto en [`MERGE_GATE_4_PREVIO.md`](MERGE_GATE_4_PREVIO.md).

Dos decisiones de Leo, tomadas antes de mergear:

1. **El alta y la edición de SPC desde el portal se van.** El portal es para inscribir; los datos
   del caballo los carga la secretaría o vienen del Stud Book. Si cada entrenador puede editarlos se
   ensucia el padrón y se pierde la trazabilidad. Refuerza el punto que los SPC son **globales, sin
   `club_id`** (GOTCHA #13): era un registro compartido entre hipódromos.
2. **Verificación con fixture descartable**, no con datos reales ni dependiendo de Yesi.

Probes sobre `main` ya mergeado:

| Probe | Resultado |
|---|---|
| `probe_rls_portal` | 39 PASS · 0 FAIL · 0 PENDIENTE |
| `probe_autoregistro_e2e` | 15 OK · 0 FAIL |
| `probe_gate4_inscribir` | 15 PASS · 0 FAIL |
| `probe_gate4_portal_ui` | 14 PASS · 0 FAIL |
| `probe_portal_validacion` | 6 ok |
| `probe_portal_e2e_gate4` (nuevo) | **17 PASS · 0 FAIL** |

Deploy: GitHub Pages tardó ~60 s. `portal.html` servido en prod es **byte a byte idéntico** a `main`.

---

## La verificación

`tests/probe_portal_e2e_gate4.mjs`, nuevo. Corre el **`<script>` entero de `portal.html`** —el
archivo real, no una reimplementación— con un DOM falso, y lo maneja con una **sesión real de
Supabase Auth**: JWT por magic link, publishable key, PostgREST de producción, RLS activo. Es el
camino exacto del navegador.

Fixture descartable: entrenador, caballeriza, SPC, usuario de portal (auth + `usuarios`) y una
reunión **9992 con fecha 2099** con tres turnos. **No toca ningún dato real.** Los turnos se crean
**desordenados a propósito** (7, 1, 4) para que el orden tenga que salir del código y no del INSERT.

### 1. Entra al portal y ve sus caballos

```
✅ E1a. la sesión es de portal (fn_is_portal_user)
✅ E1b. ve exactamente su caballo, resuelto por fn_mis_spc_ids()
```

La tenencia sale de `fn_mis_spc_ids()`, que lee `spcs.entrenador_id`. Ve 1 caballo: el suyo.

### 2. Ve el llamado ordenado por turno

```
✅ E2a. los turnos salen 1, 4, 7 aunque se crearon 7, 1, 4
✅ E2b. y en el HTML aparecen en ese orden
     la reunión sale rotulada: Reunión 9992 — Hipódromo de Dolores
```

Ordena por `numero_turno` ASC, tanto en la estructura como en el HTML renderizado. El rótulo usa
`numero_publico ?? numero` — el fallback reinyectado en el merge.

### 3. Anota un caballo suyo en un turno

```
✅ E3a. queda 1 inscripción en el turno 1
✅ E3b. nace con estado='inscripto' y canal='portal'
✅ E3c. no marcó error en el caso válido
```

### 4. Una inscripción que TIENE que ser rechazada se bloquea

Turno 4 es de hembras, el caballo del fixture es macho → lo rechaza `validar_inscripcion`.

```
✅ E4a. NO se escribió ninguna fila
✅ E4b. el mensaje se muestra (display:block)
✅ E4c. con la clase de error
✅ E4d. y el texto es el mensaje GENÉRICO, sin filtrar el motivo real
```

**Mensaje en pantalla, textual:**

> ❌ Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.

No falla en silencio y no filtra el motivo real (que era "Carrera solo para hembras"): el motivo
detallado sólo lo ve el staff, por `fn_is_staff()` dentro de `validar_inscripcion`. El texto
definitivo sigue pendiente de Fede; cambiarlo es una constante.

### 5. El mismo caballo en más de un turno — la regla de Fede

```
✅ E5a. la segunda anotación se ACEPTA
✅ E5b. el caballo queda anotado en 2 turnos de la MISMA reunión
✅ E5c. sin error en pantalla
✅ E5d. la UI avisa que ya está en otros turnos, sin bloquear
✅ E5f. y el botón de anotar sigue habilitado en ese turno
✅ E5e. el duplicado en el MISMO turno sigue rechazado
```

**Confirmado: el portal permite anotar el mismo caballo en varios turnos de la misma reunión.**
Y no lo esconde — el modal muestra:

> también anotado en el turno 7, 1 — está bien, la secretaría define después

Con el botón de anotar habilitado. Es exactamente lo que pide ISSUE-048: *el portal anota, la
secretaría resuelve.*

El duplicado dentro del **mismo** turno sigue rechazado, y ahora con un mensaje legible en vez del
error crudo de Postgres que salía antes:

> ❌ Ese caballo ya está anotado en ese turno.

---

## Teardown

Borrado en orden de FK, con `auditoria` antes que `usuarios` (`auditoria.usuario_id` es FK a
`usuarios`: sin eso el DELETE falla y quedan cuentas huérfanas en producción). Después, el probe
**cuenta residuos** en cada tabla y contra `auth.users`:

```
residuos: inscripciones=0 · carreras=0 · reuniones=0 · spcs=0 ·
          caballerizas=0 · profesionales=0 · usuarios=0 · auth.users=0
✅ no quedó nada
```

Barrido global independiente sobre prod, por si algo hubiera sobrevivido a éste o a corridas
anteriores:

| Qué | Filas |
|---|---|
| `usuarios` con mail `@sgh-probe.invalid` | 0 |
| `auth.users` con mail `@sgh-probe.invalid` | 0 |
| `profesionales` / `caballerizas` / `spcs` con nombre `PROBE%` | 0 / 0 / 0 |
| `inscripciones` con `canal='portal'` | 0 |
| reuniones ≥ 9990 | **1** |

Esa reunión es la **9999 del 2099-01-01, creada el 10/06** — la reunión fake de PRUEBA RESUMEN que
ya está anotada como ISSUE-035 para borrar. **No es residuo de esta verificación**; la 9992 del
fixture no está.

---

## Detalles menores, no bloqueantes

1. ~~El aviso lista los turnos sin ordenar~~ — **corregido**: `renderListaCaballosModal` ordena los
   turnos por número antes de imprimirlos. Decía *"turno 7, 1"* porque salía del orden de
   `misInscripciones`, que viene por `created_at`. Cubierto por E5g.
2. ~~El texto del rechazo sigue pendiente de Fede~~ — **decidido por Fede el 2026-08-23**: va el
   genérico, sin el motivo. El texto vivo ya es ése, así que no hay cambio que hacer. (El comentario
   de `migrations/validar_inscripcion_security_definer.sql` todavía dice "texto provisorio"; es
   cosmético, el cuerpo de la función es el correcto.)
3. **El único usuario de portal real** (`hipodromodolores@gmail.com`, profesional `11d8c346`) tiene
   **0 SPC a su nombre**, aunque el backfill vinculó 114 de 183. Con esa cuenta el portal funciona
   pero "Mis caballos" sale vacío y no hay nada para anotar. **Para que un entrenador de verdad use
   el portal, la secretaría tiene que vincularle los caballos** — es dato, no código.

## Lo que queda abierto

- **ISSUE-053**: la resolución de las anotaciones multi-turno sigue sin control, y ahora que el
  portal las hace masivas la prioridad sube. Espera la decisión de Fede entre las tres opciones.
- **Tenencia y cuentas** — lo que falta para que el portal sirva de verdad. Ver
  [`TENENCIA_SPC_ESTADO.md`](TENENCIA_SPC_ESTADO.md).
