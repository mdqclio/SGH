# Probes rojos de `main` arreglados: probe_montas_reales + probe_pagos_rol_carrera (issue #13) + GOTCHA #100

- Fecha: 2026-09-24
- Rama: `fix/probes-rojos-main` @ `f428a50f8daddf063292aa5d7b0e433cf49204bd` — **PR #14** (https://github.com/mdqclio/SGH/pull/14), **sin merge**
- Base: `main` @ `dac2da86a18c07566b85a9337964da2d4ac464be`
- Guards: `pwd` = /home/clio/dev/SGH · `select count(*) from spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- No se tocó `liquidaciones.html` ni `resultados.html` (`git diff --name-only main...HEAD` abajo).
- Salidas anonimizadas con el script de siempre: tokens `N###` / `F###`, `<uuid>`, `<dni>`.

## Resultado

| | antes (main) | ahora |
|---|---|---|
| `probe_montas_reales.mjs` | se cae con `ReferenceError: noLargoIds is not defined` | **34/34** |
| `probe_pagos_rol_carrera.mjs` | 42/46 | **51/51** |
| `probe_pagos_rol_carrera.mjs --mutantes` | no tenía | **6/6** |
| Restos del fixture en la base, después de todas las corridas (normales + 6 mutantes) | — | **0** (query abajo) |

## Qué se hizo

1. **`probe_montas_reales`**: `'noLargoIds'` entra en la lista de funciones que se extraen de `resultados.html`
   (`FUENTE`) y en el control S0. Es la función real, extraída, no una copia en el test.
2. **`probe_pagos_rol_carrera`**, las 4 fallas:
   - **1a** (`cobrosDetalle`): ya no busca el literal del `.select`. Corre `cobrosDetalle` **real**, con stubs sólo
     para `cobLimpiarPanelRecibo` y `cobrosFiltrar` (tocan sólo el DOM), sobre un fixture de 3 líneas. Chequea Rol y
     Carrera de cada fila: premio "— Entrenador" con inscripción → `Entrenador` / C por la inscripción; incentivo por
     reunión → `Jockey` / `—`; premio "— Jockey" sin inscripción → `Jockey` / C por el respaldo `carrera_id`. Lo
     esperado (`numero_carrera_programa ?? numero_turno`) sale de la base en la misma corrida.
   - **1c** (multi-rol): ya no exige que prod lo tenga. Crea un profesional **sintético e inactivo** (`tipo='ambos'`,
     no aparece en ningún select de la UI), su liquidación en la **9999** y las 3 líneas. `cobrosBuscar` **real** con la
     9999 elegida tiene que rendir "Entrenador / Jockey · 3 línea(s) pagable(s) · C1, C2 · + incentivo por reunión".
   - **read-only 493 / 181**: reemplazados por **restore por estado**:
     - del fixture no queda nada (líneas, header, **auditoría del header** —el DELETE dispara
       `trg_audit_liquidaciones`—, ficha);
     - la 9999 está línea por línea como al arrancar (`tests/lib/estado_lineas.mjs`);
     - no hubo que restaurar ninguna línea ajena.

     No se usó una comparación de conteos globales antes/después: en una base viva, otro usuario los mueve en el medio
     y el assert daría rojo sin que el probe hiciera nada (GOTCHA #77).
   - Red de seguridad al final del `finally`: borra lo que haya quedado del fixture aunque falle un assert o haya un
     mutante, y avisa con exit 3 si igual queda algo.
   - La función de extracción del harness arranca el cuerpo en el `){` de la firma: el `opts = {}` de
     `cobrosDetalle(tipo, id, opts = {})` confundía el balance de llaves.
3. **GOTCHA #100** (`docs/GOTCHAS.md`), con la tabla de las 5 fallas del día. Queda anotado qué asserts de la misma
   clase siguen en el probe sin tocar.
4. **Mutantes** de los asserts reescritos (6/6):
   - `detalle_sin_rol` y `detalle_sin_carrera` (sacan columnas del select de `cobrosDetalle`): matan lo mismo que
     mataba el literal viejo.
   - `roles_solo_primero` (`etiquetaRoles`): mata lo que mataba 1c cuando había dato.
   - `teardown_sin_auditoria`, `teardown_sin_ficha` y `teardown_ensucia_9999`: matan lo que pretendía el read-only.
   - **Declarado equivalente:** "el teardown se olvida una línea". `liquidacion_detalle.liquidacion_id` es
     `ON DELETE CASCADE` (`confdeltype = 'c'`, query abajo): borrar el header arrastra la línea. Se probó y quedó vivo
     por eso; se reemplazó por los tres de arriba.

## Interpretación del pedido (para confirmar)

"Nada de tocar … la base" + "el caso jockey+entrenador va con datos sintéticos en la 9999": lo tomé como el patrón de
siempre de los probes que escriben. El fixture vive sólo durante la corrida, en la 9999, con teardown verificado por
estado. No se tocó schema ni datos reales. El probe **ahora escribe** (el encabezado del archivo y `CLAUDE.md` lo dicen).

## Quedan sin tocar (misma clase, hoy verdes, fuera de lo pedido)

- 2c "hay beneficiarios sólo con incentivo por reunión" (`soloReunion.length > 0`) y 2a "el fallback a
  `numero_turno` se ejerce" dependen de los datos de prod del día.
- 1b, 1c (tarjeta usa `etiquetaRoles`), 2e y C0 buscan texto de `liquidaciones.html`.

## Salidas crudas (anonimizadas)

### `node tests/probe_montas_reales.mjs`
```

── Probe montas reales + gate de oficialización ──
✅  S0 · el archivo N001 gate + modal (contra main falla acá)
✅  G2 · carrera completa → el gate deja pasar — 10 ratificados, 0 sin jockey
✅  G2b · no dispara el diálogo del gate
✅  G1 · ratificado que largó sin jockey → el gate rechaza
✅  G1b · el mensaje nombra al caballo, no es genérico — F355
✅  G1c · el mensaje dice cuántos faltan
✅  G6 · al bloquear NO se oficializa nada
✅  G6b · ofrece abrir Montas y lo abre si el operador acepta
✅  G6c · el gate corre ANTES del confirm de oficializar
✅  G3 · sin jockey y sin marcar → rechaza — mandil 1
✅  G3b · el mismo caballo marcado "no corrió" → pasa
✅  G4 · hay en R8 una carrera con no_largo persistido para probar — <uuid>
✅  G4b · el no_largo elegido es un ratificado
✅  G4c · no_largo persistido sin jockey → NO bloquea — F321
✅  G5 · forfait sin jockey → no bloquea
✅  G5 · mal_inscrito sin jockey → no bloquea
✅  G5 · inscripto sin jockey → no bloquea
✅  M1 · el modal ordena por gatera (numero_partidor ASC) — gateras: 1,2,3,4,5,6,7,8,9,10
✅  M1b · los sin gatera quedan al final
✅  M2 · el suplente va primero, después de "Sin asignar" — N002, N003 (suplente)
✅  M2b · el suplente no aparece duplicado más abajo
✅  M3 · sin suplente: "Sin asignar" primero — — Sin asignar —
✅  M3b · el resto va alfabético por apellido
✅  M4 · sólo entran jockey|ambos, no entrenadores — probado contra N004 (entrenador)
✅  M4b · están todos los jockeys del club — 47 en el select vs 47 en la base
✅  M2c · marca selected el jockey actual
✅  M5 · montasFaltantes sobre R8 coincide con la base — código 0 vs base 0
✅  M5b · R8 hoy no N001 ratificados que largaron sin jockey — si esto falla, R8 quedaría bloqueada al re-oficializar
✅  A1 · el INSERT de la alta rápida escribe notas
✅  A1b · la marca es greppable y constante
✅  A1c · la nota dice que la ficha está incompleta
✅  A1d · registra quién y cuándo
✅  A1e · el toast avisa que la ficha quedó incompleta
✅  A1f · el patrón LIKE no colisiona con notas preexistentes — 0 marcados hoy

34/34 OK
exit 0
```

### `node tests/probe_pagos_rol_carrera.mjs`
```
  [red de seguridad] fixture al final: {"lineas":0,"header":0,"auditoria":0,"ficha":0} · 9999 limpia

=== probe_pagos_rol_carrera — rol y nº de carrera en el tab Pagos ===

  ✅ 1a) cobrosBuscar trae descripcion y concepto_tipo (rol) y carrera_id
       id,beneficiario_tipo,beneficiario_id,monto_neto,reunion_id,inscripcion_id,carrera_id,descripcion,concepto,concepto_tipo,liquidaciones(club_id)
  ✅ 1b) la tabla de pagables N001 columna Rol
  ✅ 1b) los colspan acompañan la columna nueva (8 y 7)
  ✅ 1b) la tabla de retenidas también rotula el rol
  ✅ 1c) la tarjeta usa etiquetaRoles y etiquetaCarreras, no ${g.tipo} pelado
  ✅ 2e) el detalle N001 el respaldo ?? carrera_id
  ✅ 2e) el recibo N001 el respaldo ?? carrera_id
  ✅ 2a) sigue sin haber offsets artificiales en el módulo
  ✅ 1d) rolDeLinea no dice "N005"
  ✅ 1d) etiquetaRoles no reescribe el vocabulario
  ✅ hay líneas pagables para probar
       63 líneas
  ✅ 1d) todo rol derivado está en {Propietario, Entrenador, Jockey}
       Entrenador / Propietario / Jockey
  ✅ 1e) ninguna línea cae al genérico "Profesional"
  ✅ 1e) ninguna tarjeta muestra el genérico "profesional"
  ✅ 1c) los mono-rol siguen mostrando exactamente su rol
  ✅ 2b) ordena numérico: C1, C2, C3, C10, C12
       C1, C2, C3, C10, C12
  ✅ 2b) un sort textual habría dado otra cosa (el test es sensible)
  ✅ 2c) sólo-sin-carrera → "incentivo por reunión"
  ✅ 2c) mixto → carreras + el rótulo
  ✅ 2c) sólo-carreras → sin rótulo de más
  ✅ 2c) ninguna tarjeta N006 queda con la N007 vacía o en "—"
  ✅ 2c) los beneficiarios sin ninguna carrera son incentivo de jockey y quedan rotulados
       2 beneficiarios
  ✅ 2c) y todas sus líneas son incentivo_jockey (no es que se perdió el dato)
  ✅ 2a) toda línea con carrera se resuelve como numero_carrera_programa ?? numero_turno
       57 líneas con carrera, 0 mal
  ✅ 2a) el fallback a numero_turno se ejerce de verdad (hay carreras sin numero_carrera_programa)
       3 de 7 carreras usan el fallback
  ✅ 2d) el set de carreras de cada tarjeta coincide con la base
       27 beneficiarios, 0 con diferencia
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
       17 ids pedidos en 2 consultas
  ✅ C3) y el mapa ampliado sigue coincidiendo con la base
  ✅ C4) repetir la búsqueda completa: CERO viajes
       0 consultas
  ✅ C4) y sigue resolviendo N008
  ✅ C5) el id que no existe se pide una vez y queda cacheado en negativo
       0 consultas en la segunda vuelta
  ✅ C6) cambiar de reunión invalida el cache y vuelve a consultar
       2 consultas, scope = R2
  ✅ C6) el scope guardado es la reunión nueva
  ✅ C6) los mapas rearmados vuelven a coincidir con la base
  ✅ C6) y la reunión nueva también cachea (segunda tecla: cero viajes)
       0 consultas
  ✅ 1a) cobrosDetalle rinde las 3 líneas del fixture
       3 filas
  ✅ 1a) premio con inscripción → Rol "Entrenador", Carrera por la inscripción
       {"id":"<uuid>","fecha":"1/1/2099","carrera":"C1","caballo":"F307","puesto":"1°","rol":"Entrenador","concepto":"Carrera 1 — 1° puesto","neto":"$1000.00"}
  ✅ 1a) incentivo de jockey por reunión → Rol "Jockey", Carrera "—"
       {"id":"<uuid>","fecha":"1/1/2099","carrera":"—","caballo":"—","puesto":"—","rol":"Jockey","concepto":"Incentivo jockey","neto":"$600.00"}
  ✅ 1a) premio sin inscripción → Rol "Jockey", Carrera por el respaldo carrera_id
       {"id":"<uuid>","fecha":"1/1/2099","carrera":"C2","caballo":"—","puesto":"2°","rol":"Jockey","concepto":"Carrera 2 — 2° puesto","neto":"$300.00"}
  ✅ 1c) la tarjeta del beneficiario multi-rol muestra TODOS sus roles: "Entrenador / Jockey"
       Entrenador / Jockey · 3 línea(s) pagable(s) · C1, C2 · + incentivo por reunión
  ✅ 1c) y sus carreras + el rótulo del incentivo por reunión
       Entrenador / Jockey · 3 línea(s) pagable(s) · C1, C2 · + incentivo por reunión
  ✅ restore: del fixture no queda nada (líneas, header, auditoría del header, ficha)
       {"lineas":0,"header":0,"auditoria":0,"ficha":0}
  ✅ restore: la 9999 quedó línea por línea como al arrancar (por estado)
       sin diferencias
  ✅ restore: no hubo que restaurar ninguna línea ajena
       0 restauradas

  51/51 OK

  Muestra de tarjetas (rol · líneas · carreras):
    Jockey                ·  4 línea(s) · C1, C5 · + incentivo por reunión
    Propietario           ·  1 línea(s) · C5
    Propietario           ·  1 línea(s) · C5
    Entrenador            ·  9 línea(s) · C1, C2, C3
    Jockey                ·  4 línea(s) · C1, C2, C3 · + incentivo por reunión
    Jockey                ·  4 línea(s) · C1, C2, C3 · + incentivo por reunión
    Propietario           ·  1 línea(s) · C4
    Propietario           ·  1 línea(s) · C3
    Propietario           ·  1 línea(s) · C5
    Propietario           ·  1 línea(s) · C2
    Propietario           ·  1 línea(s) · C5
    Jockey                ·  1 línea(s) · incentivo por reunión

exit 0
```

### `node tests/probe_pagos_rol_carrera.mjs --mutantes`
```
💀 mutante detalle_sin_rol      → muerto (3 assert(s))
     ❌ 1a) premio con inscripción → Rol "Entrenador", Carrera por la inscripción
     ❌ 1a) incentivo de jockey por reunión → Rol "Jockey", Carrera "—"
     ❌ 1a) premio sin inscripción → Rol "Jockey", Carrera por el respaldo carrera_id
💀 mutante detalle_sin_carrera  → muerto (1 assert(s))
     ❌ 1a) premio sin inscripción → Rol "Jockey", Carrera por el respaldo carrera_id
💀 mutante roles_solo_primero   → muerto (1 assert(s))
     ❌ 1c) la tarjeta del beneficiario multi-rol muestra TODOS sus roles: "Entrenador / Jockey"
💀 mutante teardown_sin_auditoria → muerto (1 assert(s))
     ❌ restore: del fixture no queda nada (líneas, header, auditoría del header, ficha)
💀 mutante teardown_sin_ficha   → muerto (1 assert(s))
     ❌ restore: del fixture no queda nada (líneas, header, auditoría del header, ficha)
💀 mutante teardown_ensucia_9999 → muerto (2 assert(s))
     ❌ restore: la 9999 quedó línea por línea como al arrancar (por estado)
     ❌ restore: no hubo que restaurar ninguna línea ajena

6/6 mutantes muertos
exit 0
```

### Restos en la base después de todas las corridas
```sql
select 'fichas_probe' k, count(*) from profesionales where nombre like 'PROBE-ROL-%'
union all select 'lineas_fixture', count(*) from liquidacion_detalle where descripcion like '%PROBE-ROL-%'
union all select 'headers_9999_huerfanos', count(*) from liquidaciones l where l.reunion_id='a0000000-0000-0000-0000-000000009999' and l.profesional_id is not null and not exists (select 1 from profesionales p where p.id=l.profesional_id)
union all select 'auditoria_huerfana_2h', count(*) from auditoria a where a.tabla='liquidaciones' and a.created_at > now() - interval '3 hours' and not exists (select 1 from liquidaciones l where l.id=a.registro_id)
union all select 'lineas_9999_pagado_at_3h', count(*) from liquidacion_detalle where reunion_id='a0000000-0000-0000-0000-000000009999' and pagado_at > now() - interval '3 hours'
union all select 'spcs', count(*) from spcs;
```
```json
[{"k":"fichas_probe","count":0},{"k":"lineas_fixture","count":0},{"k":"headers_9999_huerfanos","count":0},{"k":"auditoria_huerfana_2h","count":0},{"k":"lineas_9999_pagado_at_3h","count":0},{"k":"spcs","count":210}]
```

### FK de `liquidacion_detalle` (por qué el mutante "se olvida una línea" es equivalente)
```sql
select conname, confdeltype from pg_constraint where conrelid='public.liquidacion_detalle'::regclass and contype='f';
```
```json
[{"conname":"liquidacion_detalle_carrera_id_fkey","confdeltype":"a"},{"conname":"liquidacion_detalle_inscripcion_id_fkey","confdeltype":"a"},{"conname":"liquidacion_detalle_liquidacion_id_fkey","confdeltype":"c"},{"conname":"liquidacion_detalle_recibo_id_fkey","confdeltype":"a"},{"conname":"liquidacion_detalle_reunion_id_fkey","confdeltype":"a"}]
```

### Archivos tocados
```
$ git diff --stat main...HEAD
 CHANGELOG.md                      |  20 ++++
 CLAUDE.md                         |   4 +-
 docs/GOTCHAS.md                   |  38 ++++++
 tests/probe_montas_reales.mjs     |   7 +-
 tests/probe_pagos_rol_carrera.mjs | 237 +++++++++++++++++++++++++++++++++++---
 5 files changed, 287 insertions(+), 19 deletions(-)
$ git diff --name-only main...HEAD | grep -E 'liquidaciones.html|resultados.html'; echo "exit $?"
exit 1 (1 = ninguno)
```

## Anexo — diff de los tests y del GOTCHA
```diff
diff --git a/docs/GOTCHAS.md b/docs/GOTCHAS.md
index 6d078e9..42c3a9f 100644
--- a/docs/GOTCHAS.md
+++ b/docs/GOTCHAS.md
@@ -1760,3 +1760,41 @@ Control del 2026-09-22 sobre las cinco funciones ya aplicadas de esta tanda —
 
 Emparentado con GOTCHA #95 (`apply_migration` deja rastro en el historial de migraciones, así que el DDL efímero va por `execute_sql`): los dos salen de tratar a `apply_migration` como si fuera "correr el archivo", cuando en realidad es "correr el texto que le pasé".
 
+
+## 100. Un assert con un número fijo o atado a los datos de prod del día caduca solo — y después nadie sabe si el rojo es bug o vejez (2026-09-24)
+
+**Qué pasó.** El 24/09 dos probes estaban rojos en `main` y nadie sabía desde cuándo ni por qué. El inventario (issue #13) encontró **cero bugs**: las cinco fallas eran de los probes.
+
+| probe · assert | escrito | qué esperaba | qué había el 24/09 | por qué envejeció |
+|---|---|---|---|---|
+| `probe_pagos_rol_carrera` · read-only | 27/08 | `liquidacion_detalle` = **493** filas | **640** | se liquidaron R8 y R9: número fijo contra una tabla viva |
+| `probe_pagos_rol_carrera` · read-only | 27/08 | `spcs` = **181** | **210** | Yesi dio de alta ejemplares (baseline del 23/08) |
+| `probe_pagos_rol_carrera` · 1c | 27/08 | ≥ 1 beneficiario impago con dos roles | **0 de 27** | el único (tipo `ambos`) cobró: 4 líneas, 0 impagas. El código no cambió; se había ido el dato |
+| `probe_pagos_rol_carrera` · 1a | 27/08 | el literal `.select('…,carrera_id')` de `cobrosDetalle` | `…,carrera_id,liquidaciones(club_id)` | ISSUE-060 (`09ddb5b`, 29/08) agregó el club al select; las columnas del rol seguían ahí |
+| `probe_montas_reales` · todo | 28/08 | extraer `montasFaltantes` y correrla | `ReferenceError: noLargoIds is not defined` | `5e0a57b` (12/09) sacó su lógica a `noLargoIds` sin cambiarla; el probe no la extraía |
+
+Los cinco decían ❌ con la misma cara que un bug. Para saber que no lo eran hubo que rastrear commit por commit, correr una copia del probe con la extracción corregida (34/34) y consultar la base.
+
+**Cómo se detectó.** El rojo de `probe_pagos_rol_carrera` (42/46) apareció al correrlo como regresión del PR #12. Salía igual contra `main`, así que no era del PR. Pero tampoco decía qué era.
+
+**Regla que queda.**
+
+> **Un assert no puede tener un valor esperado que dependa del día en que se escribió.** El esperado se calcula desde la base **en la misma corrida**, o el assert compara una **relación que no envejece** (antes/después dentro de la corrida, "lo que muestra = lo que hay"). Un caso que necesita cierto dato en prod (un multi-rol, un NL, una transferencia) se **fabrica**: un fixture en la 9999 con teardown verificado por estado, o líneas sintéticas en las funciones puras. Y se verifica **comportamiento** (lo que la función real rinde o persiste), no el texto del código: un literal buscado se rompe con cualquier cambio legítimo y no dice si el comportamiento cambió.
+
+Corolarios:
+- Un "read-only: la tabla X tiene N filas" no prueba nada aunque N se calcule al arrancar: en una base viva, otro usuario cambia N en el medio (GOTCHA #77). Lo que se verifica es el **estado de lo que el probe toca**: su fixture no quedó, la 9999 está línea por línea como estaba (`tests/lib/estado_lineas.mjs`).
+- Si hoy no hay dato para ejercer un caso, el probe dice "sin caso hoy" y **no** pinta ❌: un rojo que no es bug entrena a ignorar los rojos.
+- La lista de funciones que extrae un harness también es un "valor fijo". Si la función bajo prueba empieza a llamar a otra, el harness cae con `ReferenceError`. Eso por lo menos es ruidoso; el riesgo es arreglarlo reimplementando la función en el test, y eso no se hace.
+
+**Cómo se verifica.**
+
+```bash
+set -a; . ./.env; set +a
+node tests/probe_pagos_rol_carrera.mjs              # 51/51; fixture multi-rol en la 9999 + restore por estado
+node tests/probe_pagos_rol_carrera.mjs --mutantes   # 6/6
+node tests/probe_montas_reales.mjs                  # 34/34
+# asserts con número fijo o literal de código que quedan (candidatos a esta regla):
+grep -nE "=== [0-9]{3,}\b|\(\s*[0-9]{3,}\s*\)'" tests/*.mjs
+```
+
+Quedan en `probe_pagos_rol_carrera` asserts de la **misma clase** que no se tocaron en este arreglo (se pidieron sólo los 4 rojos): 2c "hay beneficiarios sólo con incentivo por reunión" y 2a "el fallback a `numero_turno` se ejerce" dependen de los datos de prod del día; 1b, 1c (tarjeta), 2e y C0 buscan texto de `liquidaciones.html`. Hoy están verdes; van a envejecer igual.
diff --git a/tests/probe_montas_reales.mjs b/tests/probe_montas_reales.mjs
index bcb306d..eacbb05 100644
--- a/tests/probe_montas_reales.mjs
+++ b/tests/probe_montas_reales.mjs
@@ -66,7 +66,7 @@ function extraerGate() {
 }
 
 /* ── S0 — sensibilidad: contra main nada de esto existe ────────────────────── */
-const faltantes = ['moInscripciones', 'moOpciones', 'montasFaltantes', 'openMontas', 'saveMontas']
+const faltantes = ['moInscripciones', 'moOpciones', 'noLargoIds', 'montasFaltantes', 'openMontas', 'saveMontas']
   .filter(n => SRC.indexOf(`function ${n}(`) < 0 && SRC.indexOf(`async function ${n}(`) < 0);
 const tieneGate = SRC.includes(GATE_INI) && SRC.includes(GATE_FIN);
 const tieneModal = SRC.includes('id="modal-montas"') && SRC.includes('openMontas()');
@@ -81,7 +81,10 @@ if (faltantes.length || !tieneGate || !tieneModal) {
 
 /* ── Harness: el código real, con dependencias inyectadas ──────────────────── */
 const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
-const FUENTE = ['moInscripciones', 'moOpciones', 'montasFaltantes'].map(extraerFn).join('\n\n');
+// noLargoIds: montasFaltantes la llama desde 5e0a57b (12/09), cuando la lógica de "no largó" se sacó a
+// una función propia para compartirla con el aviso de jockey repetido. Sin extraerla, el probe se caía
+// con ReferenceError antes del primer assert (inventario del 24/09, issue #13).
+const FUENTE = ['moInscripciones', 'moOpciones', 'noLargoIds', 'montasFaltantes'].map(extraerFn).join('\n\n');
 const GATE   = extraerGate();
 
 function correr(estado) {
diff --git a/tests/probe_pagos_rol_carrera.mjs b/tests/probe_pagos_rol_carrera.mjs
index 8168475..50c1144 100644
--- a/tests/probe_pagos_rol_carrera.mjs
+++ b/tests/probe_pagos_rol_carrera.mjs
@@ -1,17 +1,24 @@
 /**
- * Probe — rol y número de carrera en la tarjeta del tab Pagos (real-code, READ-ONLY).
+ * Probe — rol y número de carrera en la tarjeta del tab Pagos (real-code).
  *
  * Corre el CÓDIGO REAL extraído de liquidaciones.html, no una copia:
  *   - rolDeLinea()        (ya existía; la usa el recibo desde 67f9371)
  *   - etiquetaRoles()     (nueva — cambio 1c)
  *   - etiquetaCarreras()  (nueva — cambio 2b)
  *   - el bloque de resolución de nº de carrera de cobrosBuscar() (nuevo — cambio 2a/2b)
- * Sin browser (chromium no corre en ubuntu 26.04). Sólo SELECT: no escribe una fila.
+ * Sin browser (chromium no corre en ubuntu 26.04).
+ *
+ * ESCRIBE (desde 2026-09-24, issue #13) un fixture en la reunión 9999 —un profesional sintético
+ * inactivo, su liquidación y 3 líneas impagas— para los casos que antes dependían de que prod
+ * tuviera ese día un beneficiario multi-rol. Teardown en el finally; restore verificado por ESTADO
+ * (tests/lib/estado_lineas.mjs), no contando filas. Nada de baselines fijos (GOTCHA #100).
  *
  * CAMBIO 1 — rol en la pantalla
- *   1a) las 3 columnas del rol viajan en los SELECT de cobrosBuscar y cobrosDetalle
+ *   1a) cobrosDetalle REAL rinde el rol y la carrera de cada línea (fixture: Entrenador por
+ *       inscripción, Jockey por reunión, Jockey con carrera_id sin inscripción)
  *   1b) la tabla del detalle tiene columna Rol y los colspan acompañan
- *   1c) etiquetaRoles muestra TODOS los roles, no el de la primera línea
+ *   1c) etiquetaRoles muestra TODOS los roles, no el de la primera línea (fixture: cobrosBuscar
+ *       REAL sobre la 9999 rinde la tarjeta del multi-rol como "Entrenador / Jockey")
  *   1d) vocabulario exacto Propietario/Entrenador/Jockey — nunca "cuidador"
  *   1e) ninguna tarjeta cae al genérico "profesional"
  *
@@ -28,11 +35,28 @@
  *   C3) si el conjunto de líneas crece (liberar_linea, sacar el filtro) pide sólo los ids nuevos
  *   C4/C5) el negativo también se cachea: un id inexistente no se re-pide
  *   C6) cambiar de reunión invalida y rearma, y la reunión nueva vuelve a cachear
+ *
+ * MUTANTES (`--mutante=<nombre>` / `--mutantes`) de los asserts reescritos el 24/09:
+ *   detalle_sin_rol      cobrosDetalle no trae descripcion/concepto_tipo   → 1a (rol) cae a "Profesional"
+ *   detalle_sin_carrera  cobrosDetalle no trae carrera_id                  → 1a (C del respaldo) queda "—"
+ *   roles_solo_primero   etiquetaRoles devuelve sólo el primer rol          → 1c
+ *   teardown_sin_auditoria  el teardown no borra la auditoría del header    → restore: "no queda nada"
+ *   teardown_sin_ficha      el teardown no borra el profesional sintético   → restore: "no queda nada"
+ *   teardown_ensucia_9999   el probe toca una línea AJENA de la 9999        → restore por estado (2 asserts)
+ * Después de los asserts de restore corre una red de seguridad que borra lo que haya quedado del
+ * fixture, así que el mutante de teardown no deja basura.
+ *
+ * Uso:
+ *   set -a; . ./.env; set +a
+ *   node tests/probe_pagos_rol_carrera.mjs
+ *   node tests/probe_pagos_rol_carrera.mjs --mutantes
  */
 import { createClient } from '@supabase/supabase-js';
 import { readFileSync } from 'node:fs';
 import { fileURLToPath } from 'node:url';
 import { dirname, join } from 'node:path';
+import { spawnSync } from 'node:child_process';
+import { snapshotLineas, diffLineas, restaurarLineas, describir } from './lib/estado_lineas.mjs';
 
 const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
 const KEY = process.env.SUPABASE_SECRET_KEY;
@@ -40,7 +64,46 @@ if (!KEY) throw new Error('Falta SUPABASE_SECRET_KEY (source .env antes de corre
 
 const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
 const HERE = dirname(fileURLToPath(import.meta.url));
-const SRC = readFileSync(join(HERE, '..', 'liquidaciones.html'), 'utf8');
+const SELF = fileURLToPath(import.meta.url);
+let SRC = readFileSync(join(HERE, '..', 'liquidaciones.html'), 'utf8');
+const CLUB_ID = '0649e9c5-9e87-4aad-842f-101458e6b33c';
+const R9999 = 'a0000000-0000-0000-0000-000000009999';
+
+const SEL_DET = "'id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id,liquidaciones(club_id)'";
+const MUTANTES = {
+  detalle_sin_rol:     [SEL_DET, "'id,concepto,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id,liquidaciones(club_id)'"],
+  detalle_sin_carrera: [SEL_DET, "'id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,liquidaciones(club_id)'"],
+  roles_solo_primero:  ["function etiquetaRoles(g){ return [...g.roles].join(' / ') || g.tipo; }", "function etiquetaRoles(g){ return [...g.roles][0] || g.tipo; }"],
+  // lado probe (ver teardown()). No hay mutante "se olvida una línea": liquidacion_detalle.liquidacion_id
+  // es ON DELETE CASCADE, borrar el header arrastra las líneas — ese mutante sería equivalente.
+  teardown_sin_auditoria: null,
+  teardown_sin_ficha:     null,
+  teardown_ensucia_9999:  null,
+};
+const args = process.argv.slice(2);
+const mutArg = args.find(a => a.startsWith('--mutante='))?.split('=')[1];
+if (args.includes('--mutantes')) {
+  let vivos = 0;
+  for (const m of Object.keys(MUTANTES)) {
+    const r = spawnSync(process.execPath, [SELF, `--mutante=${m}`], { encoding: 'utf8', env: process.env });
+    const murio = r.status !== 0; if (!murio) vivos++;
+    const fallos = (r.stdout.match(/^\s*❌ .*$/gm) || []);
+    console.log(`${murio ? '💀' : '🧟'} mutante ${m.padEnd(20)} → ${murio ? `muerto (${fallos.length} assert(s))` : 'VIVO — el probe no lo detecta'}`);
+    fallos.slice(0, 4).forEach(f => console.log('     ' + f.trim()));
+    if (murio && !fallos.length) console.log('     ' + (r.stderr || r.stdout).trim().split('\n').slice(-3).join(' | '));
+  }
+  console.log(`\n${Object.keys(MUTANTES).length - vivos}/${Object.keys(MUTANTES).length} mutantes muertos`);
+  process.exit(vivos ? 1 : 0);
+}
+if (mutArg) {
+  if (!(mutArg in MUTANTES)) { console.error(`mutante desconocido: ${mutArg}`); process.exit(2); }
+  if (MUTANTES[mutArg]) {
+    const [de, a] = MUTANTES[mutArg];
+    if (!SRC.includes(de)) { console.error(`el mutante ${mutArg} no aplica`); process.exit(2); }
+    SRC = SRC.replace(de, a);
+  }
+  console.log(`⚠ MUTANTE ${mutArg} aplicado`);
+}
 
 const results = [];
 const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
@@ -68,8 +131,8 @@ ok('1a) cobrosBuscar trae descripcion y concepto_tipo (rol) y carrera_id',
    ['descripcion', 'concepto_tipo', 'beneficiario_tipo', 'carrera_id'].every(c => selBuscar.includes(c)),
    selBuscar);
 
-const selDetalle = SRC.match(/\.select\('id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id'\)/);
-ok('1a) cobrosDetalle trae las 3 columnas del rol + carrera_id', !!selDetalle);
+// 1a de cobrosDetalle: se verifica por COMPORTAMIENTO con el fixture de la 9999 (sección F, al final).
+// Antes buscaba el literal del .select y se rompió cuando ISSUE-060 le agregó liquidaciones(club_id).
 
 ok('1b) la tabla de pagables tiene columna Rol',
    SRC.includes('<th>Puesto</th><th>Rol</th><th>Concepto</th>'));
@@ -131,9 +194,10 @@ ok('1e) ninguna tarjeta muestra el genérico "profesional"',
    gs.every(g => !/^profesional$/i.test(etiquetaRoles(g))));
 
 // ── 1c — el caso que obliga a mostrar todos los roles ───────────────────────
+// El caso multi-rol ya NO se exige a los datos de prod (el único, tipo 'ambos', cobró y el assert
+// quedó rojo sin que hubiera bug): se garantiza con el fixture de la sección F. Si prod tiene alguno
+// hoy, se chequea igual.
 const multi = gs.filter(g => g.roles.size > 1);
-ok('1c) hay al menos un beneficiario con más de un rol (si no, el test no prueba nada)',
-   multi.length >= 1, `${multi.length} de ${gs.length} beneficiarios`);
 for (const g of multi) {
   const et = etiquetaRoles(g);
   ok(`1c) el beneficiario multi-rol los muestra todos: "${et}"`,
@@ -284,11 +348,154 @@ viajes = []; await correr(stubSb, 'R2', lns, st);
 ok('C6) y la reunión nueva también cachea (segunda tecla: cero viajes)', viajes.length === 0,
    `${viajes.length} consultas`);
 
-// ── read-only: nada escrito ────────────────────────────────────────────────
-const { count: postLineas } = await sb.from('liquidacion_detalle').select('*', { count: 'exact', head: true });
-const { count: postSpcs } = await sb.from('spcs').select('*', { count: 'exact', head: true });
-ok('read-only: liquidacion_detalle intacta (493)', postLineas === 493, `${postLineas} filas`);
-ok('read-only: spcs intacta (181)', postSpcs === 181, `${postSpcs} filas`);
+// ── F) FIXTURE en la 9999: 1a (cobrosDetalle) y 1c (multi-rol) por COMPORTAMIENTO ─────────────
+// Un profesional sintético INACTIVO (no aparece en ningún select de la UI), su liquidación en la
+// 9999 y 3 líneas impagas:
+//   F1 premio "— Entrenador" con inscripción de la 9999   → rol Entrenador, carrera por inscripción
+//   F2 incentivo_jockey sin inscripción ni carrera          → rol Jockey, carrera "—"
+//   F3 premio "— Jockey" SIN inscripción, CON carrera_id    → rol Jockey, carrera por el respaldo
+// Lo esperado sale de la base en esta corrida (numero_carrera_programa ?? numero_turno), no de
+// números escritos acá. Reemplaza a los viejos "read-only: … intacta (493)/(181)": contar filas
+// globales contra un número fijo caducó solo (GOTCHA #100) y, en una base viva, contar la tabla
+// entera antes/después tampoco prueba nada (GOTCHA #77) — se verifica el ESTADO de lo que el probe
+// toca: la 9999 línea por línea, y que del fixture no quede nada (líneas, header, auditoría, ficha).
+function extraerFirma(firma) {
+  const i = SRC.indexOf(firma);
+  if (i < 0) throw new Error(`no encontré: ${firma}`);
+  // el cuerpo arranca en el "){" que cierra la firma: un default `opts = {}` no es el cuerpo
+  const cuerpo = SRC.indexOf('){', i);
+  if (cuerpo < 0 || cuerpo > SRC.indexOf('\n', i)) throw new Error(`firma sin "){" en su línea: ${firma}`);
+  let d = 0;
+  for (let k = cuerpo + 1; k < SRC.length; k++) {
+    if (SRC[k] === '{') d++;
+    else if (SRC[k] === '}') { d--; if (d === 0) return SRC.slice(i, k + 1); }
+  }
+  throw new Error(`no pude cerrar: ${firma}`);
+}
+const bloqueEntre = (ini, fin) => { const i = SRC.indexOf(ini), j = SRC.indexOf(fin, i); if (i < 0 || j < 0) throw new Error(`no encontré ${ini}`); return SRC.slice(SRC.indexOf('\n', i) + 1, j); };
+const escapeHtml = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
+const fmt = n => '$' + Number(n).toFixed(2);
+function mkDocument(campos) {
+  const nodos = {};
+  const get = id => (nodos[id] ||= { value: campos[id] ?? '', innerHTML: '', textContent: '', style: {}, classList: { add(){}, remove(){}, toggle(){} }, scrollIntoView(){} });
+  Object.keys(campos).forEach(get); ['cob-detalle', 'cob-beneficiarios'].forEach(get);
+  return { getElementById: id => get(id), _n: nodos, querySelectorAll: () => [] };
+}
+const fuenteCob = [
+  ROL_DECL, extraerFirma('function rolDeLinea(l)'), extraerFirma('function nombreBenef(tipo, id)'),
+  bloqueEntre('// ═══ MATCHEO DEL BUSCADOR — ANCLAS DEL PROBE', '// ═══ MATCHEO DEL BUSCADOR — FIN ═══'),
+  extraerFirma('function benefSearch(tipo, id)'), extraerFirma('function etiquetaRoles(g)'), extraerFirma('function etiquetaCarreras(g)'),
+  extraerFirma('async function cobCargarReunPrueba()'), extraerFirma('function cobVisible(l, rid)'), extraerFirma('function cobDelClub(l)'),
+  bloqueEntre('// ═══ VISTA POR CARRERA — INICIO', '// ═══ VISTA POR CARRERA — FIN ═══'), extraerFirma('async function cobrosBuscar()'),
+  SRC.slice(SRC.indexOf('const GRUPO_DE_TIPO_COB'), SRC.indexOf('\n\n', SRC.indexOf('const ORDEN_GRUPOS_COB'))),
+  extraerFirma('function grupoDeTipo(t)'), extraerFirma('function rotuloGrupo(grupo, tipos)'), extraerFirma('function cobrosGruposPresentes()'),
+  extraerFirma('function cobChecked(l, selPrevia, idsPrevios, filtro)'), extraerFirma('async function cobrosDetalle(tipo, id, opts = {})'),
+].join('\n\n');
+async function pantalla(profesionalesMap) {
+  const document = mkDocument({ 'cob-q': '', 'cob-reunion': R9999, 'cob-carrera': '' });
+  const api = await new AsyncFunction('sb', 'CLUB_ID', 'document', 'toast', 'fmt', 'escapeHtml', 'propietariosMap', 'profesionales',
+    `let cobCaballerizas = [], cobInscCarrera = {}, cobNroCarrera = {}, cobMapsScope = null, cobReunPrueba = null;
+     let cobLineas = [], cobBenef = null, cobApoderados = [], cobFiltro = 'todo';
+     function cobLimpiarPanelRecibo(){}   // DOM puro (panel del recibo emitido)
+     function cobrosFiltrar(){}           // DOM puro (chips/aviso sobre el HTML ya puesto)
+     ${fuenteCob}
+     return { cobrosBuscar, cobrosDetalle };`)(sb, CLUB_ID, document, m => { throw new Error('toast: ' + m); }, fmt, escapeHtml, {}, profesionalesMap);
+  return { api, document };
+}
+const unesc = x => String(x).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
+const filasDetalle = html => [...html.matchAll(/<tr class="cob-row"[^>]*>([\s\S]*?)<\/tr>/g)].map(m => {
+  const td = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(t => unesc(t[1].replace(/<[^>]+>/g, '').trim()));
+  const id = /value="([^"]+)"/.exec(m[1])?.[1];
+  return { id, fecha: td[1], carrera: td[2], caballo: td[3], puesto: td[4], rol: td[5], concepto: td[6], neto: td[7] };
+});
+
+const tag = `PROBE-ROL-${Date.now()}`;
+const fx = { prof: null, liq: null, lineas: [] };
+const antes9999 = await snapshotLineas(sb, R9999);
+const { data: car9999, error: eCar } = await sb.from('carreras').select('id,numero_turno,numero_carrera_programa').eq('reunion_id', R9999).order('numero_turno');
+if (eCar) throw eCar;
+const { data: ins9999, error: eIns } = await sb.from('inscripciones').select('id,carrera_id').in('carrera_id', car9999.map(c => c.id));
+if (eIns) throw eIns;
+const cA = car9999.find(c => ins9999.some(i => i.carrera_id === c.id));
+const cB = car9999.find(c => c.id !== cA?.id);
+if (!cA || !cB) throw new Error('la 9999 no tiene dos carreras (una con inscripciones) para armar el fixture');
+const inscA = ins9999.find(i => i.carrera_id === cA.id);
+const nroDe = c => c.numero_carrera_programa ?? c.numero_turno;
+
+async function teardown() {
+  const ids = fx.lineas.map(l => l.id);
+  if (ids.length) await sb.from('liquidacion_detalle').delete().in('id', ids);
+  if (fx.liq) {
+    await sb.from('liquidaciones').delete().eq('id', fx.liq.id);
+    // el DELETE del header dispara trg_audit_liquidaciones: la auditoría se borra DESPUÉS
+    if (mutArg !== 'teardown_sin_auditoria') await sb.from('auditoria').delete().eq('registro_id', fx.liq.id);
+  }
+  if (fx.prof && mutArg !== 'teardown_sin_ficha') await sb.from('profesionales').delete().eq('id', fx.prof.id);
+  if (mutArg === 'teardown_ensucia_9999') {
+    const ajena = Object.keys(antes9999)[0];
+    if (ajena) await sb.from('liquidacion_detalle').update({ pagado_at: new Date().toISOString() }).eq('id', ajena);
+  }
+}
+async function quedoDelFixture() {
+  const [l, h, a, p] = await Promise.all([
+    fx.liq ? sb.from('liquidacion_detalle').select('id').eq('liquidacion_id', fx.liq.id) : { data: [] },
+    fx.liq ? sb.from('liquidaciones').select('id').eq('id', fx.liq.id) : { data: [] },
+    fx.liq ? sb.from('auditoria').select('id').eq('registro_id', fx.liq.id) : { data: [] },
+    fx.prof ? sb.from('profesionales').select('id').eq('id', fx.prof.id) : { data: [] },
+  ]);
+  return { lineas: l.data?.length ?? -1, header: h.data?.length ?? -1, auditoria: a.data?.length ?? -1, ficha: p.data?.length ?? -1 };
+}
+try {
+  const { data: prof, error: eP } = await sb.from('profesionales')
+    .insert({ club_id: CLUB_ID, tipo: 'ambos', apellido: 'PROBE', nombre: tag, activo: false, notas: `${tag} — fixture de tests/probe_pagos_rol_carrera.mjs, se borra solo` })
+    .select('id,apellido,nombre,tipo').single();
+  if (eP) throw eP; fx.prof = prof;
+  const { data: liq, error: eH } = await sb.from('liquidaciones')
+    .insert({ club_id: CLUB_ID, reunion_id: R9999, profesional_id: prof.id, estado: 'borrador' }).select('id').single();
+  if (eH) throw eH; fx.liq = liq;
+  const base = { liquidacion_id: liq.id, reunion_id: R9999, beneficiario_tipo: 'profesional', beneficiario_id: prof.id, estado_linea: 'impago', monto_descuento: 0 };
+  const { data: lineas, error: eD } = await sb.from('liquidacion_detalle').insert([
+    { ...base, concepto_tipo: 'premio', concepto: `Carrera ${nroDe(cA)} — 1° puesto`, descripcion: `Carrera ${nroDe(cA)} — 1° puesto — Entrenador (${tag})`, monto_bruto: 1000, posicion: 1, inscripcion_id: inscA.id, carrera_id: cA.id, orden_display: 1 },
+    { ...base, concepto_tipo: 'incentivo_jockey', concepto: 'Incentivo jockey', descripcion: `Incentivo jockey (${tag})`, monto_bruto: 600, orden_display: 2 },
+    { ...base, concepto_tipo: 'premio', concepto: `Carrera ${nroDe(cB)} — 2° puesto`, descripcion: `Carrera ${nroDe(cB)} — 2° puesto — Jockey (${tag})`, monto_bruto: 300, posicion: 2, inscripcion_id: null, carrera_id: cB.id, orden_display: 3 },
+  ]).select('id,concepto_tipo');
+  if (eD) throw eD; fx.lineas = lineas;
+
+  const profMap = { ...Object.fromEntries((await sb.from('profesionales').select('id,apellido,nombre,tipo,documento_nro').eq('club_id', CLUB_ID)).data.map(p => [p.id, p])), [prof.id]: prof };
+  // 1a — cobrosDetalle REAL
+  const { api, document } = await pantalla(profMap);
+  await api.cobrosDetalle('profesional', prof.id);
+  const filas = filasDetalle(document._n['cob-detalle'].innerHTML);
+  const f = k => filas.find(r => r.id === lineas[k].id);
+  ok(`1a) cobrosDetalle rinde las ${lineas.length} líneas del fixture`, filas.length === lineas.length && lineas.every((_, k) => f(k)), `${filas.length} filas`);
+  ok('1a) premio con inscripción → Rol "Entrenador", Carrera por la inscripción', f(0)?.rol === 'Entrenador' && f(0)?.carrera === `C${nroDe(cA)}`, JSON.stringify(f(0)));
+  ok('1a) incentivo de jockey por reunión → Rol "Jockey", Carrera "—"', f(1)?.rol === 'Jockey' && f(1)?.carrera === '—', JSON.stringify(f(1)));
+  ok('1a) premio sin inscripción → Rol "Jockey", Carrera por el respaldo carrera_id', f(2)?.rol === 'Jockey' && f(2)?.carrera === `C${nroDe(cB)}`, JSON.stringify(f(2)));
+  // 1c — cobrosBuscar REAL sobre la 9999: la tarjeta del multi-rol
+  const { api: api2, document: doc2 } = await pantalla(profMap);
+  await api2.cobrosBuscar();
+  const nombre = `${prof.apellido}, ${prof.nombre}`;
+  const tarj = [...doc2._n['cob-beneficiarios'].innerHTML.matchAll(/<div class="liq-prof">([^<]*)<\/div><div class="liq-recibo">([^<]*)<\/div>/g)]
+    .map(m => ({ nombre: unesc(m[1]), info: unesc(m[2]) })).find(t => t.nombre === nombre);
+  ok('1c) la tarjeta del beneficiario multi-rol muestra TODOS sus roles: "Entrenador / Jockey"', /^Entrenador \/ Jockey · 3 línea\(s\) pagable\(s\) · /.test(tarj?.info || ''), tarj?.info || 'sin tarjeta');
+  ok('1c) y sus carreras + el rótulo del incentivo por reunión', tarj?.info?.endsWith(`· ${[nroDe(cA), nroDe(cB)].sort((a, b) => a - b).map(n => `C${n}`).join(', ')} · + incentivo por reunión`), tarj?.info);
+} finally {
+  await teardown();
+  const quedo = await quedoDelFixture();
+  ok('restore: del fixture no queda nada (líneas, header, auditoría del header, ficha)', quedo.lineas === 0 && quedo.header === 0 && quedo.auditoria === 0 && quedo.ficha === 0, JSON.stringify(quedo));
+  const despues = await snapshotLineas(sb, R9999);
+  const arregladas = await restaurarLineas(sb, antes9999, despues);
+  const v = diffLineas(antes9999, await snapshotLineas(sb, R9999));
+  ok('restore: la 9999 quedó línea por línea como al arrancar (por estado)', diffLineas(antes9999, despues).limpio, describir(diffLineas(antes9999, despues)));
+  ok('restore: no hubo que restaurar ninguna línea ajena', arregladas === 0, `${arregladas} restauradas`);
+  // red de seguridad: pase lo que pase arriba (mutante incluido), no queda basura
+  if (fx.liq) { await sb.from('liquidacion_detalle').delete().eq('liquidacion_id', fx.liq.id); await sb.from('liquidaciones').delete().eq('id', fx.liq.id); await sb.from('auditoria').delete().eq('registro_id', fx.liq.id); }
+  if (fx.prof) await sb.from('profesionales').delete().eq('id', fx.prof.id);
+  const final = await quedoDelFixture();
+  console.log(`  [red de seguridad] fixture al final: ${JSON.stringify(final)} · 9999 ${v.limpio ? 'limpia' : describir(v)}`);
+  if (final.lineas || final.header || final.auditoria || final.ficha) { console.error('❌ QUEDÓ BASURA DEL FIXTURE EN PROD', JSON.stringify(final), JSON.stringify(fx)); process.exitCode = 3; }
+}
+
 
 // ── Reporte ────────────────────────────────────────────────────────────────
 console.log('\n=== probe_pagos_rol_carrera — rol y nº de carrera en el tab Pagos ===\n');
@@ -303,4 +510,4 @@ for (const g of gs.sort((a, b) => b.total - a.total).slice(0, 12))
 for (const g of multi)
   console.log(`    [multi-rol] ${etiquetaRoles(g)} · ${g.n} línea(s) · ${etiquetaCarreras(g)}`);
 console.log('');
-process.exit(fall ? 1 : 0);
+process.exit(fall ? 1 : (process.exitCode || 0));
```
