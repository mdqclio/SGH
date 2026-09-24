# probe_pagos_rol_carrera, el probe que escribe: guard de la 9999, conteos + club_secuencias, limpieza ante aborto

- Fecha: 2026-09-24
- Rama: `fix/probes-rojos-main` @ `471c654ccbf745223db1f631b773ba688dd8305b` — **PR #14**, sin merge
- Informe anterior de la misma rama: `docs/diagnosticos/2026-09-24_probes-rojos-main-arreglo.md` (reports @ `c75ccef`)
- Guards de sesión: `pwd` = /home/clio/dev/SGH · `select count(*) from spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- No se tocó `liquidaciones.html`. Salidas anonimizadas (tokens `N###`/`F###`, `<uuid>`).

## Resultado

| Condición | Cómo quedó | Evidencia |
|---|---|---|
| 1. Restauración verificada con conteos + `club_secuencias` | 6 asserts propios `restore: conteo X igual antes y después`, además de los 3 por estado | corrida normal **60/60**: `lineas_9999` 76→76, `headers_9999` 10→10, `fichas_probe` 0→0, `auditoria_fixture` 0→0, `recibos_fixture` 0→0, `club_secuencias` `0649e9c5/recibo=71 a6da7e40/recibo=19` → igual |
| 1b. Si emite recibos, la secuencia vuelve | el caso **no** emite recibos (`recibos_fixture` 0). El teardown igual busca recibos del fixture: los borra y devuelve `club_secuencias` si no hubo recibos ajenos en el medio (patrón del smoke) | no ejercido: no hay recibos que emitir |
| 2. Limpia si falla a mitad | `try/catch/finally` + 4 puntos de aborto provocado + SIGINT/SIGTERM por el mismo `finally` + **barrido al arrancar** para `kill -9` | abortos **4/4**: la única ❌ es la marca del aborto; los 9 asserts de restore dan ✅. SIGINT a mitad: limpio, exit 130. `kill -9`: basura comprobada en la base, la corrida siguiente la barre y da 60/60 |
| 3. Guard de club | `guardSandbox`: id = 9999 **y** `es_prueba` **y** club Dolores **y** `numero` 9999. Corre al arrancar (antes de cualquier lectura) y otra vez pegado a la primera escritura | `PROBE_REUNION=<R9>` → `exit 2`; `PROBE_REUNION=<inexistente>` → `exit 2`. En la base no cambia nada (R9 70 headers / 147 líneas antes y después). Mutante `sin_guard` **muerto** |
| Mutantes | **7/7** | abajo |

## Decisiones (para confirmar)

- **Conteos acotados, no globales.** Se cuentan las líneas y los headers **de la 9999** y las filas **del fixture**
  (ficha `PROBE-ROL-*`, auditoría y recibos de su header y su beneficiario), no las tablas enteras. En prod, un recálculo
  o un cobro real en el medio de la corrida movería un conteo global y el assert daría rojo sin culpa del probe
  (GOTCHA #77/#100). `club_secuencias` va **entera**, como pediste. Riesgo: si alguien emite un recibo real durante
  los ~20 s de la corrida, ese assert da rojo. En ese caso el detalle muestra antes/después y se ve que es ajeno.
- **`auditoria_fixture` "antes" siempre da 0**, porque el header todavía no existe. El que importa es el "después".
- **`kill -9` no se puede atrapar** (no pasa por `finally` ni por handlers). Lo cubre el barrido del arranque
  siguiente: borra fichas `PROBE-ROL-*` y sus headers **sólo si están en la 9999**, y su auditoría. Si una ficha tuviera
  headers fuera de la 9999 no la toca y lo dice. El barrido corre **antes** de las secciones que leen datos reales. Al
  principio corría después, y la basura de un `kill -9` entraba como si fuera un beneficiario multi-rol de prod (dio
  62/62 en vez de 60/60). Se corrigió y se repitió la prueba.
- **`PROBE_REUNION`** existe sólo para demostrar que el guard se niega. `--mutantes` no lo pasa nunca, así que el
  mutante `sin_guard` corre sobre la 9999 y muere por los asserts que llaman al guard con R9 y con una reunión
  inexistente. Nunca se escribió en otra reunión.
- **Transacción con rollback: no.** El probe escribe por PostgREST (una request por operación, sin transacción que
  abarque varias) y además tiene que leer el fixture desde el código real de la pantalla, que hace sus propias
  requests. Por eso `finally` más barrido.

## 3 — Guard

```
$ PROBE_REUNION=cafa37d6-89f4-45cb-a0d9-835bc27407e9 node tests/probe_pagos_rol_carrera.mjs
⛔ guard: el fixture sólo va en la reunión 9999 (<uuid>); pidieron <uuid> — el probe no corre y no escribe nada.
exit 2
$ PROBE_REUNION=00000000-0000-0000-0000-000000000000 node tests/probe_pagos_rol_carrera.mjs
⛔ guard: el fixture sólo va en la reunión 9999 (<uuid>); pidieron <uuid> — el probe no corre y no escribe nada.
exit 2
```

Base antes y después de esas dos corridas (la de "antes" se tomó después del barrido del kill -9 y antes de las
corridas del guard; la de "después", al terminar toda la tanda final: guard, abortos, SIGINT, normal y mutantes):

```sql
select 'fichas_probe' k, count(*)::text v from profesionales where nombre like 'PROBE-ROL-%'
union all select 'headers_R9', count(*)::text from liquidaciones where reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9'
union all select 'lineas_R9', count(*)::text from liquidacion_detalle where reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9'
union all select 'headers_9999', count(*)::text from liquidaciones where reunion_id='a0000000-0000-0000-0000-000000009999'
union all select 'lineas_9999', count(*)::text from liquidacion_detalle where reunion_id='a0000000-0000-0000-0000-000000009999'
-- (+ en la de después: líneas del fixture por descripción, auditoría huérfana, pagado_at tocado, club_secuencias, spcs)
```

antes:
```json
[{"k":"auditoria_header_kill9","v":"0"},{"k":"fichas_probe","v":"0"},{"k":"headers_R9","v":"70"},{"k":"lineas_R9","v":"147"},{"k":"headers_9999","v":"10"},{"k":"lineas_9999","v":"76"}]
```
después:
```json
[{"k":"fichas_probe","v":"0"},{"k":"headers_R9","v":"70"},{"k":"lineas_R9","v":"147"},{"k":"headers_9999","v":"10"},{"k":"lineas_9999","v":"76"},{"k":"lineas_fixture_por_desc","v":"0"},{"k":"auditoria_huerfana_liq_3h","v":"0"},{"k":"lineas_9999_pagado_at_3h","v":"0"},{"k":"club_secuencias","v":"0649e9c5/recibo=71 a6da7e40/recibo=19"},{"k":"spcs","v":"210"}]
```

## 2 — Aborto provocado

Cuatro puntos de aborto; en cada uno la única ❌ es "fixture: el caso corrió entero", que es la marca del aborto.

### `--abortar=tras_ficha`
```
  [barrido al arrancar] nada que barrer
  [conteos] antes {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0,"club_secuencias":"0649e9c5/recibo=71 a6da7e40/recibo=19"}
  [conteos] después {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0,"club_secuencias":"0649e9c5/recibo=71 a6da7e40/recibo=19"}
  [red de seguridad] fixture al final: {"lineas":0,"header":0,"auditoria":0,"ficha":0} · 9999 limpia · ABORTADO: ABORTO PROVOCADO en tras_ficha (--abortar=tras_ficha)

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
  ✅ 1d) rolDeLinea no dice "N002"
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
  ✅ 2c) ninguna tarjeta N003 queda con la N004 vacía o en "—"
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
  ✅ C4) y sigue resolviendo N005
  ✅ C5) el id que no existe se pide una vez y queda cacheado en negativo
       0 consultas en la segunda vuelta
  ✅ C6) cambiar de reunión invalida el cache y vuelve a consultar
       2 consultas, scope = R2
  ✅ C6) el scope guardado es la reunión nueva
  ✅ C6) los mapas rearmados vuelven a coincidir con la base
  ✅ C6) y la reunión nueva también cachea (segunda tecla: cero viajes)
       0 consultas
  ✅ guard: la 9999 pasa (existe, es_prueba, N006, numero 9999)
  ✅ guard: se niega a escribir en R9 (reunión N003 de N006)
  ✅ guard: se niega a escribir en una reunión que no existe
  ❌ fixture: el caso corrió entero (sin aborto ni error)
       ABORTO PROVOCADO en tras_ficha (--abortar=tras_ficha)
  ✅ restore: del fixture no queda nada (líneas, header, auditoría del header, ficha)
       {"lineas":0,"header":0,"auditoria":0,"ficha":0}
  ✅ restore: la 9999 quedó línea por línea como al arrancar (por estado)
       sin diferencias
  ✅ restore: no hubo que restaurar ninguna línea ajena
       0 restauradas
  ✅ restore: conteo lineas_9999 igual antes y después
       antes 76 · después 76
  ✅ restore: conteo headers_9999 igual antes y después
       antes 10 · después 10
  ✅ restore: conteo fichas_probe igual antes y después
       antes 0 · después 0
  ✅ restore: conteo auditoria_fixture igual antes y después
       antes 0 · después 0
  ✅ restore: conteo recibos_fixture igual antes y después
       antes 0 · después 0
  ✅ restore: conteo club_secuencias igual antes y después
       antes 0649e9c5/recibo=71 a6da7e40/recibo=19 · después 0649e9c5/recibo=71 a6da7e40/recibo=19

  54/55 OK

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

### `--abortar=tras_header`
```
  [barrido al arrancar] nada que barrer
  [conteos] antes {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0,"club_secuencias":"0649e9c5/recibo=71 a6da7e40/recibo=19"}
  [conteos] después {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0,"club_secuencias":"0649e9c5/recibo=71 a6da7e40/recibo=19"}
  [red de seguridad] fixture al final: {"lineas":0,"header":0,"auditoria":0,"ficha":0} · 9999 limpia · ABORTADO: ABORTO PROVOCADO en tras_header (--abortar=tras_header)

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
  ✅ 1d) rolDeLinea no dice "N002"
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
  ✅ 2c) ninguna tarjeta N003 queda con la N004 vacía o en "—"
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
  ✅ C4) y sigue resolviendo N005
  ✅ C5) el id que no existe se pide una vez y queda cacheado en negativo
       0 consultas en la segunda vuelta
  ✅ C6) cambiar de reunión invalida el cache y vuelve a consultar
       2 consultas, scope = R2
  ✅ C6) el scope guardado es la reunión nueva
  ✅ C6) los mapas rearmados vuelven a coincidir con la base
  ✅ C6) y la reunión nueva también cachea (segunda tecla: cero viajes)
       0 consultas
  ✅ guard: la 9999 pasa (existe, es_prueba, N006, numero 9999)
  ✅ guard: se niega a escribir en R9 (reunión N003 de N006)
  ✅ guard: se niega a escribir en una reunión que no existe
  ❌ fixture: el caso corrió entero (sin aborto ni error)
       ABORTO PROVOCADO en tras_header (--abortar=tras_header)
  ✅ restore: del fixture no queda nada (líneas, header, auditoría del header, ficha)
       {"lineas":0,"header":0,"auditoria":0,"ficha":0}
  ✅ restore: la 9999 quedó línea por línea como al arrancar (por estado)
       sin diferencias
  ✅ restore: no hubo que restaurar ninguna línea ajena
       0 restauradas
  ✅ restore: conteo lineas_9999 igual antes y después
       antes 76 · después 76
  ✅ restore: conteo headers_9999 igual antes y después
       antes 10 · después 10
  ✅ restore: conteo fichas_probe igual antes y después
       antes 0 · después 0
  ✅ restore: conteo auditoria_fixture igual antes y después
       antes 0 · después 0
  ✅ restore: conteo recibos_fixture igual antes y después
       antes 0 · después 0
  ✅ restore: conteo club_secuencias igual antes y después
       antes 0649e9c5/recibo=71 a6da7e40/recibo=19 · después 0649e9c5/recibo=71 a6da7e40/recibo=19

  54/55 OK

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

### `--abortar=tras_lineas`
```
  [barrido al arrancar] nada que barrer
  [conteos] antes {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0,"club_secuencias":"0649e9c5/recibo=71 a6da7e40/recibo=19"}
  [conteos] después {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0,"club_secuencias":"0649e9c5/recibo=71 a6da7e40/recibo=19"}
  [red de seguridad] fixture al final: {"lineas":0,"header":0,"auditoria":0,"ficha":0} · 9999 limpia · ABORTADO: ABORTO PROVOCADO en tras_lineas (--abortar=tras_lineas)

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
  ✅ 1d) rolDeLinea no dice "N002"
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
  ✅ 2c) ninguna tarjeta N003 queda con la N004 vacía o en "—"
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
  ✅ C4) y sigue resolviendo N005
  ✅ C5) el id que no existe se pide una vez y queda cacheado en negativo
       0 consultas en la segunda vuelta
  ✅ C6) cambiar de reunión invalida el cache y vuelve a consultar
       2 consultas, scope = R2
  ✅ C6) el scope guardado es la reunión nueva
  ✅ C6) los mapas rearmados vuelven a coincidir con la base
  ✅ C6) y la reunión nueva también cachea (segunda tecla: cero viajes)
       0 consultas
  ✅ guard: la 9999 pasa (existe, es_prueba, N006, numero 9999)
  ✅ guard: se niega a escribir en R9 (reunión N003 de N006)
  ✅ guard: se niega a escribir en una reunión que no existe
  ❌ fixture: el caso corrió entero (sin aborto ni error)
       ABORTO PROVOCADO en tras_lineas (--abortar=tras_lineas)
  ✅ restore: del fixture no queda nada (líneas, header, auditoría del header, ficha)
       {"lineas":0,"header":0,"auditoria":0,"ficha":0}
  ✅ restore: la 9999 quedó línea por línea como al arrancar (por estado)
       sin diferencias
  ✅ restore: no hubo que restaurar ninguna línea ajena
       0 restauradas
  ✅ restore: conteo lineas_9999 igual antes y después
       antes 76 · después 76
  ✅ restore: conteo headers_9999 igual antes y después
       antes 10 · después 10
  ✅ restore: conteo fichas_probe igual antes y después
       antes 0 · después 0
  ✅ restore: conteo auditoria_fixture igual antes y después
       antes 0 · después 0
  ✅ restore: conteo recibos_fixture igual antes y después
       antes 0 · después 0
  ✅ restore: conteo club_secuencias igual antes y después
       antes 0649e9c5/recibo=71 a6da7e40/recibo=19 · después 0649e9c5/recibo=71 a6da7e40/recibo=19

  54/55 OK

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

### `--abortar=en_pantalla`
```
  [barrido al arrancar] nada que barrer
  [conteos] antes {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0,"club_secuencias":"0649e9c5/recibo=71 a6da7e40/recibo=19"}
  [conteos] después {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0,"club_secuencias":"0649e9c5/recibo=71 a6da7e40/recibo=19"}
  [red de seguridad] fixture al final: {"lineas":0,"header":0,"auditoria":0,"ficha":0} · 9999 limpia · ABORTADO: ABORTO PROVOCADO en en_pantalla (--abortar=en_pantalla)

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
  ✅ 1d) rolDeLinea no dice "N002"
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
  ✅ 2c) ninguna tarjeta N003 queda con la N004 vacía o en "—"
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
  ✅ C4) y sigue resolviendo N005
  ✅ C5) el id que no existe se pide una vez y queda cacheado en negativo
       0 consultas en la segunda vuelta
  ✅ C6) cambiar de reunión invalida el cache y vuelve a consultar
       2 consultas, scope = R2
  ✅ C6) el scope guardado es la reunión nueva
  ✅ C6) los mapas rearmados vuelven a coincidir con la base
  ✅ C6) y la reunión nueva también cachea (segunda tecla: cero viajes)
       0 consultas
  ✅ guard: la 9999 pasa (existe, es_prueba, N006, numero 9999)
  ✅ guard: se niega a escribir en R9 (reunión N003 de N006)
  ✅ guard: se niega a escribir en una reunión que no existe
  ❌ fixture: el caso corrió entero (sin aborto ni error)
       ABORTO PROVOCADO en en_pantalla (--abortar=en_pantalla)
  ✅ restore: del fixture no queda nada (líneas, header, auditoría del header, ficha)
       {"lineas":0,"header":0,"auditoria":0,"ficha":0}
  ✅ restore: la 9999 quedó línea por línea como al arrancar (por estado)
       sin diferencias
  ✅ restore: no hubo que restaurar ninguna línea ajena
       0 restauradas
  ✅ restore: conteo lineas_9999 igual antes y después
       antes 76 · después 76
  ✅ restore: conteo headers_9999 igual antes y después
       antes 10 · después 10
  ✅ restore: conteo fichas_probe igual antes y después
       antes 0 · después 0
  ✅ restore: conteo auditoria_fixture igual antes y después
       antes 0 · después 0
  ✅ restore: conteo recibos_fixture igual antes y después
       antes 0 · después 0
  ✅ restore: conteo club_secuencias igual antes y después
       antes 0649e9c5/recibo=71 a6da7e40/recibo=19 · después 0649e9c5/recibo=71 a6da7e40/recibo=19

  54/55 OK

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

### SIGINT a mitad (con el fixture ya escrito)

```bash
node tests/probe_pagos_rol_carrera.mjs --pausar=60 > sigint.txt 2>&1 &  PID=$!
timeout 90 grep -m1 "\[pausa\]" <(tail -n +1 -f sigint.txt)     # espera a que el fixture esté escrito
kill -INT $PID; wait $PID; echo "exit $?"
```
```
  [pausa] fixture creado (PROBE-ROL-1790287120312, header <uuid>); durmiendo 60s

  ⚠ SIGINT recibido — limpiando antes de salir
  [barrido al arrancar] nada que barrer
  [conteos] antes {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0,"club_secuencias":"0649e9c5/recibo=71 a6da7e40/recibo=19"}
  [conteos] después {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0,"club_secuencias":"0649e9c5/recibo=71 a6da7e40/recibo=19"}
  [red de seguridad] fixture al final: {"lineas":0,"header":0,"auditoria":0,"ficha":0} · 9999 limpia · ABORTADO: INTERRUMPIDO (SIGINT) en tras_lineas

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
  ✅ 1d) rolDeLinea no dice "N002"
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
  ✅ 2c) ninguna tarjeta N003 queda con la N004 vacía o en "—"
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
  ✅ C4) y sigue resolviendo N005
  ✅ C5) el id que no existe se pide una vez y queda cacheado en negativo
       0 consultas en la segunda vuelta
  ✅ C6) cambiar de reunión invalida el cache y vuelve a consultar
       2 consultas, scope = R2
  ✅ C6) el scope guardado es la reunión nueva
  ✅ C6) los mapas rearmados vuelven a coincidir con la base
  ✅ C6) y la reunión nueva también cachea (segunda tecla: cero viajes)
       0 consultas
  ✅ guard: la 9999 pasa (existe, es_prueba, N006, numero 9999)
  ✅ guard: se niega a escribir en R9 (reunión N003 de N006)
  ✅ guard: se niega a escribir en una reunión que no existe
  ❌ fixture: el caso corrió entero (sin aborto ni error)
       INTERRUMPIDO (SIGINT) en tras_lineas
  ✅ restore: del fixture no queda nada (líneas, header, auditoría del header, ficha)
       {"lineas":0,"header":0,"auditoria":0,"ficha":0}
  ✅ restore: la 9999 quedó línea por línea como al arrancar (por estado)
       sin diferencias
  ✅ restore: no hubo que restaurar ninguna línea ajena
       0 restauradas
  ✅ restore: conteo lineas_9999 igual antes y después
       antes 76 · después 76
  ✅ restore: conteo headers_9999 igual antes y después
       antes 10 · después 10
  ✅ restore: conteo fichas_probe igual antes y después
       antes 0 · después 0
  ✅ restore: conteo auditoria_fixture igual antes y después
       antes 0 · después 0
  ✅ restore: conteo recibos_fixture igual antes y después
       antes 0 · después 0
  ✅ restore: conteo club_secuencias igual antes y después
       antes 0649e9c5/recibo=71 a6da7e40/recibo=19 · después 0649e9c5/recibo=71 a6da7e40/recibo=19

  54/55 OK

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

exit 130
```

### `kill -9` a mitad y la corrida siguiente

```bash
node tests/probe_pagos_rol_carrera.mjs --pausar=60 > kill9.txt 2>&1 &  PID=$!
timeout 90 grep -m1 "\[pausa\]" <(tail -n +1 -f kill9.txt)
kill -9 $PID; wait $PID; echo "exit $?"
```
```
  [pausa] fixture creado (PROBE-ROL-1790287030728, header <uuid>); durmiendo 60s
exit 137
```

La base con el probe muerto (basura esperada: `kill -9` no pasa por el `finally`):

```sql
select 'fichas_probe' k, count(*)::text v from profesionales where nombre like 'PROBE-ROL-%'
union all select 'headers_9999', count(*)::text from liquidaciones where reunion_id='a0000000-0000-0000-0000-000000009999'
union all select 'lineas_9999', count(*)::text from liquidacion_detalle where reunion_id='a0000000-0000-0000-0000-000000009999'
union all select 'auditoria_header_kill9', count(*)::text from auditoria where registro_id='<header del fixture muerto>'
union all select 'club_secuencias', string_agg(left(club_id::text,8)||'/'||tipo||'='||ultimo_numero, ' ' order by club_id) from club_secuencias;
```
```json
[{"k":"fichas_probe","v":"1"},{"k":"headers_9999","v":"11"},{"k":"lineas_9999","v":"79"},{"k":"auditoria_header_kill9","v":"1"},{"k":"auditoria_header_kill9_anterior","v":"0"},{"k":"club_secuencias","v":"0649e9c5/recibo=71 a6da7e40/recibo=19"}]
```

Corrida normal siguiente: el barrido la limpia **antes** de leer datos reales, y los conteos quedan en 76/10:
```
  [barrido al arrancar] PROBE-ROL-1790287030728: 1 header(s) borrados
  [conteos] antes {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0,"club_secuencias":"0649e9c5/recibo=71 a6da7e40/recibo=19"}
  [conteos] después {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0,"club_secuencias":"0649e9c5/recibo=71 a6da7e40/recibo=19"}
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
  ✅ 1d) rolDeLinea no dice "N002"
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
  ✅ 2c) ninguna tarjeta N003 queda con la N004 vacía o en "—"
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
  ✅ C4) y sigue resolviendo N005
  ✅ C5) el id que no existe se pide una vez y queda cacheado en negativo
       0 consultas en la segunda vuelta
  ✅ C6) cambiar de reunión invalida el cache y vuelve a consultar
       2 consultas, scope = R2
  ✅ C6) el scope guardado es la reunión nueva
  ✅ C6) los mapas rearmados vuelven a coincidir con la base
  ✅ C6) y la reunión nueva también cachea (segunda tecla: cero viajes)
       0 consultas
  ✅ guard: la 9999 pasa (existe, es_prueba, N006, numero 9999)
  ✅ guard: se niega a escribir en R9 (reunión N003 de N006)
  ✅ guard: se niega a escribir en una reunión que no existe
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
  ✅ restore: conteo lineas_9999 igual antes y después
       antes 76 · después 76
  ✅ restore: conteo headers_9999 igual antes y después
       antes 10 · después 10
  ✅ restore: conteo fichas_probe igual antes y después
       antes 0 · después 0
  ✅ restore: conteo auditoria_fixture igual antes y después
       antes 0 · después 0
  ✅ restore: conteo recibos_fixture igual antes y después
       antes 0 · después 0
  ✅ restore: conteo club_secuencias igual antes y después
       antes 0649e9c5/recibo=71 a6da7e40/recibo=19 · después 0649e9c5/recibo=71 a6da7e40/recibo=19

  60/60 OK

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

Después: `auditoria_header_kill9` = 0 y `fichas_probe` = 0 (query "antes" de § 3).

## Corrida normal final
```
  [barrido al arrancar] nada que barrer
  [conteos] antes {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0,"club_secuencias":"0649e9c5/recibo=71 a6da7e40/recibo=19"}
  [conteos] después {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0,"club_secuencias":"0649e9c5/recibo=71 a6da7e40/recibo=19"}
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
  ✅ 1d) rolDeLinea no dice "N002"
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
  ✅ 2c) ninguna tarjeta N003 queda con la N004 vacía o en "—"
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
  ✅ C4) y sigue resolviendo N005
  ✅ C5) el id que no existe se pide una vez y queda cacheado en negativo
       0 consultas en la segunda vuelta
  ✅ C6) cambiar de reunión invalida el cache y vuelve a consultar
       2 consultas, scope = R2
  ✅ C6) el scope guardado es la reunión nueva
  ✅ C6) los mapas rearmados vuelven a coincidir con la base
  ✅ C6) y la reunión nueva también cachea (segunda tecla: cero viajes)
       0 consultas
  ✅ guard: la 9999 pasa (existe, es_prueba, N006, numero 9999)
  ✅ guard: se niega a escribir en R9 (reunión N003 de N006)
  ✅ guard: se niega a escribir en una reunión que no existe
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
  ✅ restore: conteo lineas_9999 igual antes y después
       antes 76 · después 76
  ✅ restore: conteo headers_9999 igual antes y después
       antes 10 · después 10
  ✅ restore: conteo fichas_probe igual antes y después
       antes 0 · después 0
  ✅ restore: conteo auditoria_fixture igual antes y después
       antes 0 · después 0
  ✅ restore: conteo recibos_fixture igual antes y después
       antes 0 · después 0
  ✅ restore: conteo club_secuencias igual antes y después
       antes 0649e9c5/recibo=71 a6da7e40/recibo=19 · después 0649e9c5/recibo=71 a6da7e40/recibo=19

  60/60 OK

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

## Mutantes (`--mutantes`)
```
💀 mutante detalle_sin_rol      → muerto (3 assert(s))
     ❌ 1a) premio con inscripción → Rol "Entrenador", Carrera por la inscripción
     ❌ 1a) incentivo de jockey por reunión → Rol "Jockey", Carrera "—"
     ❌ 1a) premio sin inscripción → Rol "Jockey", Carrera por el respaldo carrera_id
💀 mutante detalle_sin_carrera  → muerto (1 assert(s))
     ❌ 1a) premio sin inscripción → Rol "Jockey", Carrera por el respaldo carrera_id
💀 mutante roles_solo_primero   → muerto (1 assert(s))
     ❌ 1c) la tarjeta del beneficiario multi-rol muestra TODOS sus roles: "Entrenador / Jockey"
💀 mutante teardown_sin_auditoria → muerto (2 assert(s))
     ❌ restore: del fixture no queda nada (líneas, header, auditoría del header, ficha)
     ❌ restore: conteo auditoria_fixture igual antes y después
💀 mutante teardown_sin_ficha   → muerto (2 assert(s))
     ❌ restore: del fixture no queda nada (líneas, header, auditoría del header, ficha)
     ❌ restore: conteo fichas_probe igual antes y después
💀 mutante teardown_ensucia_9999 → muerto (2 assert(s))
     ❌ restore: la 9999 quedó línea por línea como al arrancar (por estado)
     ❌ restore: no hubo que restaurar ninguna línea ajena
💀 mutante sin_guard            → muerto (2 assert(s))
     ❌ guard: se niega a escribir en R9 (reunión N003 de N006)
     ❌ guard: se niega a escribir en una reunión que no existe

7/7 mutantes muertos
exit 0
```

## Anexo — diff del probe en este paso
```diff
diff --git a/tests/probe_pagos_rol_carrera.mjs b/tests/probe_pagos_rol_carrera.mjs
index 50c1144..b1cbe1c 100644
--- a/tests/probe_pagos_rol_carrera.mjs
+++ b/tests/probe_pagos_rol_carrera.mjs
@@ -43,6 +43,14 @@
  *   teardown_sin_auditoria  el teardown no borra la auditoría del header    → restore: "no queda nada"
  *   teardown_sin_ficha      el teardown no borra el profesional sintético   → restore: "no queda nada"
  *   teardown_ensucia_9999   el probe toca una línea AJENA de la 9999        → restore por estado (2 asserts)
+ *   sin_guard               guardSandbox no chequea nada                    → "guard: se niega a escribir en …"
+ *
+ * GUARD: el fixture sólo se escribe en la reunión 9999 (id + es_prueba + club + numero). Con
+ * PROBE_REUNION=<otra> el probe se niega y sale con 2 sin escribir nada. PROBE_REUNION sólo existe
+ * para demostrar eso: `--mutantes` nunca lo pasa, así que el mutante sin_guard corre sobre la 9999.
+ * ABORTO: --abortar=<tras_ficha|tras_header|tras_lineas|en_pantalla> y --pausar=<seg> (para SIGINT
+ * o kill -9 a mano). SIGINT/SIGTERM limpian por el mismo finally; kill -9 lo limpia el BARRIDO que
+ * corre al arrancar (fichas PROBE-ROL-* y sus headers en la 9999).
  * Después de los asserts de restore corre una red de seguridad que borra lo que haya quedado del
  * fixture, así que el mutante de teardown no deja basura.
  *
@@ -79,6 +87,7 @@ const MUTANTES = {
   teardown_sin_auditoria: null,
   teardown_sin_ficha:     null,
   teardown_ensucia_9999:  null,
+  sin_guard:              null,   // lado probe: guardSandbox no chequea nada
 };
 const args = process.argv.slice(2);
 const mutArg = args.find(a => a.startsWith('--mutante='))?.split('=')[1];
@@ -105,6 +114,25 @@ if (mutArg) {
   console.log(`⚠ MUTANTE ${mutArg} aplicado`);
 }
 
+// ── GUARD: el fixture sólo se escribe en la reunión 9999 ───────────────────────────────────────
+// PROBE_REUNION existe SÓLO para probar que el guard se niega (ver informe); nunca se usa para
+// correr el caso en otra reunión. Chequea id, es_prueba, club y numero: los cuatro.
+const REUNION_FIXTURE = process.env.PROBE_REUNION || R9999;
+async function guardSandbox(rid) {
+  if (mutArg === 'sin_guard') return { mutante: 'sin_guard' };
+  if (rid !== R9999) throw new Error(`guard: el fixture sólo va en la reunión 9999 (${R9999}); pidieron ${rid}`);
+  const { data, error } = await sb.from('reuniones').select('id,numero,es_prueba,club_id').eq('id', rid).maybeSingle();
+  if (error) throw new Error(`guard: ${error.message}`);
+  if (!data || data.es_prueba !== true || data.club_id !== CLUB_ID || Number(data.numero) !== 9999)
+    throw new Error(`guard: ${rid} no es la sandbox (es_prueba/club/numero): ${JSON.stringify(data)}`);
+  return data;
+}
+try { await guardSandbox(REUNION_FIXTURE); }
+catch (e) { console.error(`⛔ ${e.message} — el probe no corre y no escribe nada.`); process.exit(2); }
+// Barrido de restos de una corrida que murió sin finally (kill -9): ANTES de leer datos reales, para
+// que la basura de la 9999 no entre en las secciones 1/2 como si fuera un beneficiario de verdad.
+const barridos = await barrerRestos();
+
 const results = [];
 const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
 
@@ -410,7 +438,63 @@ const filasDetalle = html => [...html.matchAll(/<tr class="cob-row"[^>]*>([\s\S]
 });
 
 const tag = `PROBE-ROL-${Date.now()}`;
+const T0 = new Date().toISOString();
 const fx = { prof: null, liq: null, lineas: [] };
+
+// ── Aborto provocado (para probar que limpia si falla a mitad) ──────────────────────────────────
+//   --abortar=<paso>    lanza un error en ese punto: tras_ficha | tras_header | tras_lineas | en_pantalla
+//   --pausar=<seg>      duerme <seg> después de insertar las líneas (para mandarle SIGINT / kill -9 a mano)
+// SIGINT/SIGTERM: el handler marca la interrupción y el próximo punto de control lanza → mismo
+// finally. kill -9 no pasa por ningún finally: lo cubre el BARRIDO del arranque de la corrida siguiente.
+const ABORTAR = args.find(a => a.startsWith('--abortar='))?.split('=')[1] || null;
+const PAUSAR = Number(args.find(a => a.startsWith('--pausar='))?.split('=')[1] || 0);
+let interrumpido = null;
+const alInterrumpir = sig => { interrumpido = sig; console.log(`\n  ⚠ ${sig} recibido — limpiando antes de salir`); };
+process.on('SIGINT', alInterrumpir); process.on('SIGTERM', alInterrumpir);
+function puntoDeControl(paso) {
+  if (interrumpido) throw new Error(`INTERRUMPIDO (${interrumpido}) en ${paso}`);
+  if (ABORTAR === paso) throw new Error(`ABORTO PROVOCADO en ${paso} (--abortar=${paso})`);
+}
+const dormir = s => new Promise(r => { const t = setTimeout(r, s * 1000); const cortar = () => { clearTimeout(t); r(); }; process.once('SIGINT', cortar); process.once('SIGTERM', cortar); });
+
+// ── Barrido: restos de una corrida anterior que murió sin finally (kill -9, corte de SSH) ──────
+// Sólo fichas con el prefijo del probe y sus headers EN LA 9999 (las líneas caen por CASCADE).
+async function barrerRestos() {
+  const { data: viejas, error } = await sb.from('profesionales').select('id,nombre').like('nombre', 'PROBE-ROL-%');
+  if (error) throw error;
+  const hecho = [];
+  for (const p of viejas || []) {
+    const { data: hs } = await sb.from('liquidaciones').select('id,reunion_id').eq('profesional_id', p.id);
+    if ((hs || []).some(h => h.reunion_id !== R9999)) { hecho.push(`${p.nombre}: tiene headers fuera de la 9999, NO se toca`); continue; }
+    for (const h of hs || []) {
+      await sb.from('liquidaciones').delete().eq('id', h.id);
+      await sb.from('auditoria').delete().eq('registro_id', h.id);
+    }
+    await sb.from('profesionales').delete().eq('id', p.id);
+    hecho.push(`${p.nombre}: ${(hs || []).length} header(s) borrados`);
+  }
+  return hecho;
+}
+
+// ── Conteos de lo que el fixture toca + club_secuencias ─────────────────────────────────────────
+// Acotados a la 9999 y a las filas del probe: un conteo de la tabla entera se mueve con el uso
+// real de prod en el medio de la corrida (GOTCHA #77/#100). club_secuencias va ENTERA (todas las
+// filas de todos los clubes): el fixture no emite recibos, así que no tiene que moverse ninguna.
+async function conteos() {
+  const n = async (q, rotulo) => { const { count, error } = await q; if (error) throw new Error(`${rotulo}: ${error.message}`); return count; };
+  const { data: sec, error: eS } = await sb.from('club_secuencias').select('club_id,tipo,ultimo_numero').order('club_id').order('tipo');
+  if (eS) throw eS;
+  return {
+    lineas_9999: await n(sb.from('liquidacion_detalle').select('id', { count: 'exact', head: true }).eq('reunion_id', R9999), 'lineas_9999'),
+    headers_9999: await n(sb.from('liquidaciones').select('id', { count: 'exact', head: true }).eq('reunion_id', R9999), 'headers_9999'),
+    fichas_probe: await n(sb.from('profesionales').select('id', { count: 'exact', head: true }).like('nombre', 'PROBE-ROL-%'), 'fichas_probe'),
+    auditoria_fixture: fx.liq ? await n(sb.from('auditoria').select('id', { count: 'exact', head: true }).eq('registro_id', fx.liq.id), 'auditoria_fixture') : 0,
+    recibos_fixture: fx.prof ? await n(sb.from('recibos').select('id', { count: 'exact', head: true }).eq('profesional_id', fx.prof.id), 'recibos_fixture') : 0,
+    club_secuencias: (sec || []).map(s => `${s.club_id.slice(0, 8)}/${s.tipo}=${s.ultimo_numero}`).join(' '),
+  };
+}
+
+const antesConteos = await conteos();
 const antes9999 = await snapshotLineas(sb, R9999);
 const { data: car9999, error: eCar } = await sb.from('carreras').select('id,numero_turno,numero_carrera_programa').eq('reunion_id', R9999).order('numero_turno');
 if (eCar) throw eCar;
@@ -422,9 +506,31 @@ if (!cA || !cB) throw new Error('la 9999 no tiene dos carreras (una con inscripc
 const inscA = ins9999.find(i => i.carrera_id === cA.id);
 const nroDe = c => c.numero_carrera_programa ?? c.numero_turno;
 
+// guard: además del de arranque, que no haya forma de que el guard se saltee sin que el probe lo note
+ok('guard: la 9999 pasa (existe, es_prueba, Dolores, numero 9999)', !!(await guardSandbox(R9999).catch(() => null)));
+for (const [rot, rid] of [['R9 (reunión real de Dolores)', 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'], ['una reunión que no existe', '00000000-0000-0000-0000-000000000000']])
+  ok(`guard: se niega a escribir en ${rot}`, await guardSandbox(rid).then(() => false, () => true));
+
 async function teardown() {
   const ids = fx.lineas.map(l => l.id);
   if (ids.length) await sb.from('liquidacion_detalle').delete().in('id', ids);
+  // Si alguna vez el caso emite recibos: se borran y la secuencia vuelve (lección del smoke de pago).
+  if (fx.prof) {
+    const { data: recs } = await sb.from('recibos').select('id,club_id,numero_recibo').eq('profesional_id', fx.prof.id);
+    for (const r of recs || []) {
+      await sb.from('liquidacion_detalle').update({ recibo_id: null, estado_linea: 'impago', pagado_at: null }).eq('recibo_id', r.id);
+      await sb.from('recibos').delete().eq('id', r.id);
+    }
+    if ((recs || []).length) {
+      const antesSec = Object.fromEntries(antesConteos.club_secuencias.split(' ').map(x => x.split('=')));
+      for (const r of recs) {
+        const k = `${r.club_id.slice(0, 8)}/recibo`;
+        const { data: ajenos } = await sb.from('recibos').select('id').eq('club_id', r.club_id).gte('created_at', T0);
+        if (!(ajenos || []).length && antesSec[k] != null)
+          await sb.from('club_secuencias').update({ ultimo_numero: Number(antesSec[k]) }).eq('club_id', r.club_id).eq('tipo', 'recibo');
+      }
+    }
+  }
   if (fx.liq) {
     await sb.from('liquidaciones').delete().eq('id', fx.liq.id);
     // el DELETE del header dispara trg_audit_liquidaciones: la auditoría se borra DESPUÉS
@@ -445,26 +551,33 @@ async function quedoDelFixture() {
   ]);
   return { lineas: l.data?.length ?? -1, header: h.data?.length ?? -1, auditoria: a.data?.length ?? -1, ficha: p.data?.length ?? -1 };
 }
+let abortado = null;
 try {
+  await guardSandbox(REUNION_FIXTURE);     // otra vez, pegado a la primera escritura
   const { data: prof, error: eP } = await sb.from('profesionales')
     .insert({ club_id: CLUB_ID, tipo: 'ambos', apellido: 'PROBE', nombre: tag, activo: false, notas: `${tag} — fixture de tests/probe_pagos_rol_carrera.mjs, se borra solo` })
     .select('id,apellido,nombre,tipo').single();
   if (eP) throw eP; fx.prof = prof;
+  puntoDeControl('tras_ficha');
   const { data: liq, error: eH } = await sb.from('liquidaciones')
-    .insert({ club_id: CLUB_ID, reunion_id: R9999, profesional_id: prof.id, estado: 'borrador' }).select('id').single();
+    .insert({ club_id: CLUB_ID, reunion_id: REUNION_FIXTURE, profesional_id: prof.id, estado: 'borrador' }).select('id').single();
   if (eH) throw eH; fx.liq = liq;
-  const base = { liquidacion_id: liq.id, reunion_id: R9999, beneficiario_tipo: 'profesional', beneficiario_id: prof.id, estado_linea: 'impago', monto_descuento: 0 };
+  puntoDeControl('tras_header');
+  const base = { liquidacion_id: liq.id, reunion_id: REUNION_FIXTURE, beneficiario_tipo: 'profesional', beneficiario_id: prof.id, estado_linea: 'impago', monto_descuento: 0 };
   const { data: lineas, error: eD } = await sb.from('liquidacion_detalle').insert([
     { ...base, concepto_tipo: 'premio', concepto: `Carrera ${nroDe(cA)} — 1° puesto`, descripcion: `Carrera ${nroDe(cA)} — 1° puesto — Entrenador (${tag})`, monto_bruto: 1000, posicion: 1, inscripcion_id: inscA.id, carrera_id: cA.id, orden_display: 1 },
     { ...base, concepto_tipo: 'incentivo_jockey', concepto: 'Incentivo jockey', descripcion: `Incentivo jockey (${tag})`, monto_bruto: 600, orden_display: 2 },
     { ...base, concepto_tipo: 'premio', concepto: `Carrera ${nroDe(cB)} — 2° puesto`, descripcion: `Carrera ${nroDe(cB)} — 2° puesto — Jockey (${tag})`, monto_bruto: 300, posicion: 2, inscripcion_id: null, carrera_id: cB.id, orden_display: 3 },
   ]).select('id,concepto_tipo');
   if (eD) throw eD; fx.lineas = lineas;
+  if (PAUSAR) { console.log(`  [pausa] fixture creado (${tag}, header ${liq.id}); durmiendo ${PAUSAR}s`); await dormir(PAUSAR); }
+  puntoDeControl('tras_lineas');
 
   const profMap = { ...Object.fromEntries((await sb.from('profesionales').select('id,apellido,nombre,tipo,documento_nro').eq('club_id', CLUB_ID)).data.map(p => [p.id, p])), [prof.id]: prof };
   // 1a — cobrosDetalle REAL
   const { api, document } = await pantalla(profMap);
   await api.cobrosDetalle('profesional', prof.id);
+  puntoDeControl('en_pantalla');
   const filas = filasDetalle(document._n['cob-detalle'].innerHTML);
   const f = k => filas.find(r => r.id === lineas[k].id);
   ok(`1a) cobrosDetalle rinde las ${lineas.length} líneas del fixture`, filas.length === lineas.length && lineas.every((_, k) => f(k)), `${filas.length} filas`);
@@ -479,21 +592,32 @@ try {
     .map(m => ({ nombre: unesc(m[1]), info: unesc(m[2]) })).find(t => t.nombre === nombre);
   ok('1c) la tarjeta del beneficiario multi-rol muestra TODOS sus roles: "Entrenador / Jockey"', /^Entrenador \/ Jockey · 3 línea\(s\) pagable\(s\) · /.test(tarj?.info || ''), tarj?.info || 'sin tarjeta');
   ok('1c) y sus carreras + el rótulo del incentivo por reunión', tarj?.info?.endsWith(`· ${[nroDe(cA), nroDe(cB)].sort((a, b) => a - b).map(n => `C${n}`).join(', ')} · + incentivo por reunión`), tarj?.info);
+} catch (e) {
+  abortado = e.message;
+  ok('fixture: el caso corrió entero (sin aborto ni error)', false, e.message);
 } finally {
   await teardown();
   const quedo = await quedoDelFixture();
   ok('restore: del fixture no queda nada (líneas, header, auditoría del header, ficha)', quedo.lineas === 0 && quedo.header === 0 && quedo.auditoria === 0 && quedo.ficha === 0, JSON.stringify(quedo));
   const despues = await snapshotLineas(sb, R9999);
   const arregladas = await restaurarLineas(sb, antes9999, despues);
-  const v = diffLineas(antes9999, await snapshotLineas(sb, R9999));
   ok('restore: la 9999 quedó línea por línea como al arrancar (por estado)', diffLineas(antes9999, despues).limpio, describir(diffLineas(antes9999, despues)));
   ok('restore: no hubo que restaurar ninguna línea ajena', arregladas === 0, `${arregladas} restauradas`);
+  const despuesConteos = await conteos();
+  for (const k of Object.keys(antesConteos))
+    ok(`restore: conteo ${k} igual antes y después`, String(antesConteos[k]) === String(despuesConteos[k]), `antes ${antesConteos[k]} · después ${despuesConteos[k]}`);
   // red de seguridad: pase lo que pase arriba (mutante incluido), no queda basura
   if (fx.liq) { await sb.from('liquidacion_detalle').delete().eq('liquidacion_id', fx.liq.id); await sb.from('liquidaciones').delete().eq('id', fx.liq.id); await sb.from('auditoria').delete().eq('registro_id', fx.liq.id); }
   if (fx.prof) await sb.from('profesionales').delete().eq('id', fx.prof.id);
   const final = await quedoDelFixture();
-  console.log(`  [red de seguridad] fixture al final: ${JSON.stringify(final)} · 9999 ${v.limpio ? 'limpia' : describir(v)}`);
+  const v = diffLineas(antes9999, await snapshotLineas(sb, R9999));
+  console.log(`  [barrido al arrancar] ${barridos.length ? barridos.join('; ') : 'nada que barrer'}`);
+  console.log(`  [conteos] antes ${JSON.stringify(antesConteos)}`);
+  console.log(`  [conteos] después ${JSON.stringify(await conteos())}`);
+  console.log(`  [red de seguridad] fixture al final: ${JSON.stringify(final)} · 9999 ${v.limpio ? 'limpia' : describir(v)}${abortado ? ` · ABORTADO: ${abortado}` : ''}`);
   if (final.lineas || final.header || final.auditoria || final.ficha) { console.error('❌ QUEDÓ BASURA DEL FIXTURE EN PROD', JSON.stringify(final), JSON.stringify(fx)); process.exitCode = 3; }
+  process.off('SIGINT', alInterrumpir); process.off('SIGTERM', alInterrumpir);
+  if (interrumpido) process.exitCode = 130;
 }
 
 
@@ -510,4 +634,4 @@ for (const g of gs.sort((a, b) => b.total - a.total).slice(0, 12))
 for (const g of multi)
   console.log(`    [multi-rol] ${etiquetaRoles(g)} · ${g.n} línea(s) · ${etiquetaCarreras(g)}`);
 console.log('');
-process.exit(fall ? 1 : (process.exitCode || 0));
+process.exit(interrumpido ? 130 : fall ? 1 : (process.exitCode || 0));
```
