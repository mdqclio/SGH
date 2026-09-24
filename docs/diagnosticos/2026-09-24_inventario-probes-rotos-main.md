# Inventario: probes que fallan en `main` (probe_pagos_rol_carrera, probe_montas_reales)

- Fecha: 2026-09-24
- Leído y corrido contra `main` @ `dac2da86a18c07566b85a9337964da2d4ac464be`, en un worktree separado (`git worktree add --detach … main`)
- Guards: `pwd` = /home/clio/dev/SGH · `select count(*) from spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- Solo lectura: los dos probes sólo hacen SELECT. **No se arregló nada.**
- Salidas anonimizadas con el mismo script del informe del PR #12 (tokens `N###` para palabras de nombres, `F###` para nombres de caballo/caballeriza/propietario).

## Resumen

| Probe | Falla | Veredicto | Motivo |
|---|---|---|---|
| `probe_montas_reales.mjs` | se cae con `ReferenceError: noLargoIds is not defined` (0 asserts) | **harness viejo** | `5e0a57b` (12/09, aviso de jockey repetido) sacó la lógica de "no largó" de `montasFaltantes` a una función nueva, `noLargoIds`, **idéntica** (comparada abajo). El probe extrae `['moInscripciones','moOpciones','montasFaltantes']` y no la nueva. Corrido con `noLargoIds` agregado a esa lista (copia descartable, **no commiteada**): **34/34** |
| `probe_pagos_rol_carrera.mjs` 1a "cobrosDetalle trae las 3 columnas del rol + carrera_id" | ❌ | **assert viejo** | Busca el `.select('…')` literal completo. `09ddb5b` (29/08, ISSUE-060, aislamiento de club) le agregó `,liquidaciones(club_id)` al final. Las columnas que el assert quiere (`descripcion`, `concepto_tipo`, `beneficiario_tipo`, `carrera_id`) siguen estando |
| ídem 1c "hay al menos un beneficiario con más de un rol" | ❌ `0 de 27` | **precondición de datos, no bug** | El único caso multi-rol era el profesional de tipo `ambos`: hoy tiene 4 líneas y **0 impagas** (cobró). Ningún beneficiario profesional tiene hoy líneas impagas de dos roles (consulta abajo). El código de `etiquetaRoles` no cambió; lo que se perdió es **cobertura**: el caso multi-rol no se ejerce hasta que vuelva a aparecer en los datos |
| ídem "read-only: liquidacion_detalle intacta (493)" | ❌ `640 filas` | **assert viejo** | Número fijo del 27/08. Hoy hay 640 líneas porque se liquidaron R8/R9. El probe no escribe: no tiene insert/update/delete/rpc |
| ídem "read-only: spcs intacta (181)" | ❌ `210 filas` | **assert viejo** | Baseline de spcs del 23/08. Hoy es 210 (CLAUDE.md § Guard de sesión). Además es el patrón que GOTCHA #77 desaconseja: contar filas no prueba que no se escribió |

**Bugs reales encontrados: 0.** Las 5 fallas son de los probes: 1 extracción desactualizada, 3 números o literales
fijos, 1 precondición de datos que hoy no se cumple.

Para cuando se arreglen (no se hizo):
- `montas_reales`: sumar `'noLargoIds'` a `FUENTE`.
- `rol_carrera` 1a: chequear las columnas una por una, como ya hace el otro 1a con `selBuscar`.
- `rol_carrera` 1c: armar el caso multi-rol con datos sintéticos, o marcarlo "sin caso hoy" en vez de ❌. Es lo que
  hace `probe_pagos_vista_carrera` 4.
- `rol_carrera` read-only: comparar antes/después dentro de la misma corrida, no contra un número fijo.

## Evidencia

### probe_montas_reales — la función nueva es la misma lógica

`montasFaltantes` antes de `5e0a57b` (`git show 5e0a57b^:resultados.html`):
```js
function montasFaltantes(carreraId) {
  const insc = moInscripciones(carreraId);
  let noLargo;
  if (carreraId === currentCarreraId) {
    const chapaForInsc = renumerarChapas(insc);
    noLargo = new Set(insc.filter(i => noLargoMandiles.has(chapaForInsc[i.id])).map(i => i.id));
  } else {
    const res = resultados[carreraId];
    const pos = (res && posicionesMap[res.id]) || [];
    noLargo = new Set(pos.filter(p => p.no_largo).map(p => p.inscripcion_id));
  }
  return insc
    .filter(i => !noLargo.has(i.id) && !i.jockey_titular_id)
    .map(i => spcsMap[i.spc_id]?.nombre || '(sin nombre)');
}
```

En `main` (`resultados.html:1985` y `:2154`):
```js
function noLargoIds(carreraId) {
  const insc = moInscripciones(carreraId);
  if (carreraId === currentCarreraId) {
    const chapaForInsc = renumerarChapas(insc);
    return new Set(insc.filter(i => noLargoMandiles.has(chapaForInsc[i.id])).map(i => i.id));
  }
  const res = resultados[carreraId];
  const pos = (res && posicionesMap[res.id]) || [];
  return new Set(pos.filter(p => p.no_largo).map(p => p.inscripcion_id));
}

function montasFaltantes(carreraId) {
  const insc = moInscripciones(carreraId);
  const noLargo = noLargoIds(carreraId);
  return insc
    .filter(i => !noLargo.has(i.id) && !i.jockey_titular_id)
    .map(i => spcsMap[i.spc_id]?.nombre || '(sin nombre)');
}
```

`git log main -S"noLargoIds" -- resultados.html`:
```
5e0a57b 2026-09-12 feat: aviso de jockey repetido en el turno en las 4 pantallas (sin bloqueo); ratificación deja de contar forfaits
```

### Salida cruda — `node tests/probe_montas_reales.mjs` (main)
```
<anonymous_script>:51
  const noLargo = noLargoIds(carreraId);
                  ^

ReferenceError: noLargoIds is not defined
    at montasFaltantes (eval at correr (file:///tmp/claude-1000/-home-clio-dev-SGH/<uuid>/scratchpad/wt-main/tests/probe_montas_reales.mjs:94:14), <anonymous>:51:19)
    at oficializarReal (eval at correr (file:///tmp/claude-1000/-home-clio-dev-SGH/<uuid>/scratchpad/wt-main/tests/probe_montas_reales.mjs:94:14), <anonymous>:65:24)
    at eval (eval at correr (file:///tmp/claude-1000/-home-clio-dev-SGH/<uuid>/scratchpad/wt-main/tests/probe_montas_reales.mjs:94:14), <anonymous>:77:18)
    at correr (file:///tmp/claude-1000/-home-clio-dev-SGH/<uuid>/scratchpad/wt-main/tests/probe_montas_reales.mjs:105:10)
    at file:///tmp/claude-1000/-home-clio-dev-SGH/<uuid>/scratchpad/wt-main/tests/probe_montas_reales.mjs:154:33
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)

Node.js v22.22.1
exit 1
```

### Diagnóstico — la misma corrida con `noLargoIds` en la extracción (copia `tests/_diag_montas.mjs` en el worktree, borrada después)
```
84c84
< const FUENTE = ['moInscripciones', 'moOpciones', 'montasFaltantes'].map(extraerFn).join('\n\n');
---
> const FUENTE = ['moInscripciones', 'moOpciones', 'noLargoIds', 'montasFaltantes'].map(extraerFn).join('\n\n');
```
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

### probe_pagos_rol_carrera — 1a

Assert (`tests/probe_pagos_rol_carrera.mjs:71-72`):
```js
const selDetalle = SRC.match(/\.select\('id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id'\)/);
ok('1a) cobrosDetalle trae las 3 columnas del rol + carrera_id', !!selDetalle);
```
`cobrosDetalle` en `main`:
```js
    sb.from('liquidacion_detalle')
      .select('id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id,liquidaciones(club_id)')
--
    sb.from('liquidacion_detalle')
      .select('id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id,fecha_liberacion,liquidaciones(club_id)')
```
Cambio que lo desfasó (`git show 09ddb5b -- liquidaciones.html`, líneas del select):
```
-      .select('id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id')
+      .select('id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id,liquidaciones(club_id)')
-      .select('id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id,fecha_liberacion')
+      .select('id,concepto,descripcion,concepto_tipo,beneficiario_tipo,monto_neto,posicion,reunion_id,inscripcion_id,carrera_id,fecha_liberacion,liquidaciones(club_id)')
```

### probe_pagos_rol_carrera — 1c (datos)

```sql
select p.tipo, count(distinct d.beneficiario_id) benefs,
 count(*) filter (where d.estado_linea='impago' and d.recibo_id is null) lineas_impagas,
 count(*) lineas_totales
from liquidacion_detalle d join profesionales p on p.id=d.beneficiario_id
where d.beneficiario_tipo='profesional' and p.tipo='ambos' group by 1;
```
```json
[{"tipo":"ambos","benefs":1,"lineas_impagas":0,"lineas_totales":4}]
```
```sql
select count(*) benef_multirol_impago from (
 select d.beneficiario_id
 from liquidacion_detalle d
 where d.beneficiario_tipo='profesional' and d.estado_linea='impago' and d.recibo_id is null
 group by 1
 having count(distinct case when d.concepto_tipo='incentivo_jockey' or d.descripcion ilike '%— Jockey%' then 'J'
                            when d.concepto_tipo in ('incentivo_entrenador','actuacion') or d.descripcion ilike '%— Entrenador%' then 'E' end) > 1) x;
```
```json
[{"benef_multirol_impago":0}]
```

### probe_pagos_rol_carrera — read-only (`:286-291`)
```js

// ── read-only: nada escrito ────────────────────────────────────────────────
const { count: postLineas } = await sb.from('liquidacion_detalle').select('*', { count: 'exact', head: true });
const { count: postSpcs } = await sb.from('spcs').select('*', { count: 'exact', head: true });
ok('read-only: liquidacion_detalle intacta (493)', postLineas === 493, `${postLineas} filas`);
ok('read-only: spcs intacta (181)', postSpcs === 181, `${postSpcs} filas`);
```
`git grep -nE "\.(insert|update|delete|upsert|rpc)\(" main -- tests/probe_pagos_rol_carrera.mjs`:
```
exit 1 (1 = ninguna escritura)
```

### Salida cruda — `node tests/probe_pagos_rol_carrera.mjs` (main)
```

=== probe_pagos_rol_carrera — rol y nº de carrera en el tab Pagos ===

  ✅ 1a) cobrosBuscar trae descripcion y concepto_tipo (rol) y carrera_id
       id,beneficiario_tipo,beneficiario_id,monto_neto,reunion_id,inscripcion_id,carrera_id,descripcion,concepto,concepto_tipo,liquidaciones(club_id)
  ❌ 1a) cobrosDetalle trae las 3 columnas del rol + carrera_id
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
  ❌ 1c) hay al menos un beneficiario con más de un rol (si no, el test no prueba nada)
       0 de 27 beneficiarios
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
  ❌ read-only: liquidacion_detalle intacta (493)
       640 filas
  ❌ read-only: spcs intacta (181)
       210 filas

  42/46 OK

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

exit 1
```
