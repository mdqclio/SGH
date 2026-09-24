# probe_pagos_rol_carrera: club_secuencias se devuelve sólo por compare-and-set; la emisión ajena da aviso, no rojo

- Fecha: 2026-09-24
- Rama: `fix/probes-rojos-main` @ `8795fec0b3fb72612412176369019b5fc5488639` — **PR #14**, sin merge
- Informes anteriores de la rama (reports): `2026-09-24_probes-rojos-main-arreglo.md` (`c75ccef`), `2026-09-24_probe-rol-carrera-guard-conteos-aborto.md` (`ddcd72b`)
- Guards de sesión: `pwd` = /home/clio/dev/SGH · `select count(*) from spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- No se tocó `liquidaciones.html`. Salidas anonimizadas.

## Resultado

| | |
|---|---|
| Corrida normal | **65/65**, exit 0, 0 avisos |
| Aborto provocado `--abortar=tras_lineas` | 59/60: la única ❌ es la marca del aborto; restore ✅ |
| Mutantes | **11/11** (4 nuevos: `sin_cas`, `sin_chequeo_ajenos`, `no_devuelve`, `ajena_como_rojo`) |
| Base después de todo | fichas del probe 0 · 9999 10 headers / 76 líneas · auditoría huérfana 0 · `club_secuencias` Dolores=71, otro=19 (sin cambios) |

## Qué cambió

1. **Devolución condicional** (`devolverSecuencia(sbX, clubId, antes, numerosProbe)`). Por cada club donde el fixture
   emitió, después de borrar los recibos del fixture:
   - "valor que dejó el probe" = el mayor número de recibo que emitió;
   - si hay **recibos ajenos** con número > antes → **no escribe**, estado `ajena`;
   - si no, `UPDATE club_secuencias SET ultimo_numero = antes WHERE club_id = … AND tipo = 'recibo' AND ultimo_numero
     = <dejado>`. Es **compare-and-set en la misma sentencia**, sin ventana entre leer y escribir. Si no afectó ninguna
     fila, alguien movió la secuencia → estado `ajena`, sin escribir.
2. **Assert nuevo**: "restore: el probe no dejó consumidos sus propios números de recibo". Pasa si no quedan recibos
   del fixture y ningún club quedó en rojo. Si un club quedó `ajena` → **aviso ⚠️**: "secuencia: alguien emitió
   durante la corrida, secuencia no restaurada (club …)", con los números del probe que quedan como hueco. Los avisos
   no cuentan como falla y el resumen los muestra aparte ("N/M OK · K aviso(s)").
3. `club_secuencias` **salió** de la igualdad de conteos (antes comparaba contra el valor inicial). Si cambió sin que
   el probe emitiera → aviso "cambió durante la corrida sin que el probe emitiera", no rojo.
4. **Hoy el caso no emite recibos**, así que en la corrida real la devolución no se ejerce ("el caso no emitió
   recibos"). Se prueba con un **stub** de `club_secuencias`/`recibos`, sin tocar la base, en 4 escenarios:

| Escenario | Estado del stub | Esperado | Mutante que lo mata |
|---|---|---|---|
| S1 nadie emitió | antes 71, probe 72, secuencia 72 | vuelve a **71**, ok | `no_devuelve` |
| S2 ajeno **después** del probe | probe 72, ajeno 73, secuencia 73 | **no escribe**, queda 73, **aviso** | `ajena_como_rojo` |
| S3 ajeno **entre medio** | ajeno 72, probe 73, secuencia 73 (= lo que dejó el probe) | **no escribe**: volver a 71 repetiría el 72 real | `sin_chequeo_ajenos` |
| S4 carrera | el recibo ajeno 73 todavía no se ve, secuencia ya en 73 | el compare-and-set **no escribe** | `sin_cas` |

S3 es el caso donde un chequeo que sólo mire el valor de la secuencia se equivoca: el valor coincide con lo que dejó
el probe, pero en el medio hay un número real. Por eso van los dos controles.

## Salidas crudas (anonimizadas)

### `node tests/probe_pagos_rol_carrera.mjs`
```
  [barrido al arrancar] nada que barrer
  [conteos] antes {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0} · club_secuencias 0649e9c5=71 a6da7e40=19
  [conteos] después {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0} · club_secuencias 0649e9c5=71 a6da7e40=19
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
  ✅ secuencia S1: nadie emitió → se devuelve al valor de antes (71)
       {"r1":{"estado":"restaurada","dejado":72},"tabla":{"ultimo_numero":71}}
  ✅ secuencia S2: emisión ajena después del probe → NO escribe, queda en 73
       {"r2":{"estado":"ajena","dejado":72,"motivo":"recibos ajenos con número 73"},"tabla":{"ultimo_numero":73},"escrituras":[]}
  ✅ secuencia S2: ese caso es AVISO, no rojo
  ✅ secuencia S3: emisión ajena ENTRE medio (72 N003, 73 probe) → NO escribe (devolver a 71 repetiría el 72)
       {"r3":{"estado":"ajena","dejado":73,"motivo":"recibos ajenos con número 72"},"escrituras":[]}
  ✅ secuencia S4: la secuencia ya no está en lo que dejó el probe (72) → el compare-and-set no escribe
       {"r4":{"estado":"ajena","dejado":72,"actual":73,"motivo":"la secuencia está en 73; el probe la dejó en 72"},"escrituras":[]}
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
  ✅ restore: el probe no dejó consumidos sus propios números de recibo
       el caso no emitió recibos

  65/65 OK

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

### `node tests/probe_pagos_rol_carrera.mjs --abortar=tras_lineas`
```
  [barrido al arrancar] nada que barrer
  [conteos] antes {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0} · club_secuencias 0649e9c5=71 a6da7e40=19
  [conteos] después {"lineas_9999":76,"headers_9999":10,"fichas_probe":0,"auditoria_fixture":0,"recibos_fixture":0} · club_secuencias 0649e9c5=71 a6da7e40=19
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
  ✅ secuencia S1: nadie emitió → se devuelve al valor de antes (71)
       {"r1":{"estado":"restaurada","dejado":72},"tabla":{"ultimo_numero":71}}
  ✅ secuencia S2: emisión ajena después del probe → NO escribe, queda en 73
       {"r2":{"estado":"ajena","dejado":72,"motivo":"recibos ajenos con número 73"},"tabla":{"ultimo_numero":73},"escrituras":[]}
  ✅ secuencia S2: ese caso es AVISO, no rojo
  ✅ secuencia S3: emisión ajena ENTRE medio (72 N003, 73 probe) → NO escribe (devolver a 71 repetiría el 72)
       {"r3":{"estado":"ajena","dejado":73,"motivo":"recibos ajenos con número 72"},"escrituras":[]}
  ✅ secuencia S4: la secuencia ya no está en lo que dejó el probe (72) → el compare-and-set no escribe
       {"r4":{"estado":"ajena","dejado":72,"actual":73,"motivo":"la secuencia está en 73; el probe la dejó en 72"},"escrituras":[]}
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
  ✅ restore: el probe no dejó consumidos sus propios números de recibo
       el caso no emitió recibos

  59/60 OK

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
💀 mutante sin_cas              → muerto (1 assert(s))
     ❌ secuencia S4: la secuencia ya no está en lo que dejó el probe (72) → el compare-and-set no escribe
💀 mutante sin_chequeo_ajenos   → muerto (1 assert(s))
     ❌ secuencia S3: emisión ajena ENTRE medio (72 N003, 73 probe) → NO escribe (devolver a 71 repetiría el 72)
💀 mutante no_devuelve          → muerto (1 assert(s))
     ❌ secuencia S1: nadie emitió → se devuelve al valor de antes (71)
💀 mutante ajena_como_rojo      → muerto (1 assert(s))
     ❌ secuencia S2: ese caso es AVISO, no rojo

11/11 mutantes muertos
exit 0
```

### Base después de todas las corridas
```sql
select 'fichas_probe' k, count(*)::text v from profesionales where nombre like 'PROBE-ROL-%'
union all select 'headers_9999', count(*)::text from liquidaciones where reunion_id='a0000000-0000-0000-0000-000000009999'
union all select 'lineas_9999', count(*)::text from liquidacion_detalle where reunion_id='a0000000-0000-0000-0000-000000009999'
union all select 'auditoria_huerfana_liq_3h', count(*)::text from auditoria a where a.tabla='liquidaciones' and a.created_at > now() - interval '3 hours' and not exists (select 1 from liquidaciones l where l.id=a.registro_id)
union all select 'club_secuencias', string_agg(left(club_id::text,8)||'/'||tipo||'='||ultimo_numero, ' ' order by club_id) from club_secuencias;
```
```json
[{"k":"fichas_probe","v":"0"},{"k":"headers_9999","v":"10"},{"k":"lineas_9999","v":"76"},{"k":"auditoria_huerfana_liq_3h","v":"0"},{"k":"club_secuencias","v":"0649e9c5/recibo=71 a6da7e40/recibo=19"}]
```

## Anexo — diff del probe en este paso
```diff
diff --git a/tests/probe_pagos_rol_carrera.mjs b/tests/probe_pagos_rol_carrera.mjs
index b1cbe1c..6c1719f 100644
--- a/tests/probe_pagos_rol_carrera.mjs
+++ b/tests/probe_pagos_rol_carrera.mjs
@@ -44,6 +44,10 @@
  *   teardown_sin_ficha      el teardown no borra el profesional sintético   → restore: "no queda nada"
  *   teardown_ensucia_9999   el probe toca una línea AJENA de la 9999        → restore por estado (2 asserts)
  *   sin_guard               guardSandbox no chequea nada                    → "guard: se niega a escribir en …"
+ *   sin_cas                 secuencia restaurada sin compare-and-set        → S4
+ *   sin_chequeo_ajenos      no mira recibos ajenos con número > antes      → S3
+ *   no_devuelve             la secuencia no vuelve al valor de antes        → S1
+ *   ajena_como_rojo         la emisión ajena se marca como falla            → S2 (aviso, no rojo)
  *
  * GUARD: el fixture sólo se escribe en la reunión 9999 (id + es_prueba + club + numero). Con
  * PROBE_REUNION=<otra> el probe se niega y sale con 2 sin escribir nada. PROBE_REUNION sólo existe
@@ -88,6 +92,10 @@ const MUTANTES = {
   teardown_sin_ficha:     null,
   teardown_ensucia_9999:  null,
   sin_guard:              null,   // lado probe: guardSandbox no chequea nada
+  sin_cas:                null,   // lado probe: el UPDATE de la secuencia sin WHERE ultimo_numero = dejado
+  sin_chequeo_ajenos:     null,   // lado probe: no mira recibos ajenos con número > antes
+  no_devuelve:            null,   // lado probe: "devuelve" al valor que dejó el probe (no restaura)
+  ajena_como_rojo:        null,   // lado probe: la emisión ajena cuenta como falla
 };
 const args = process.argv.slice(2);
 const mutArg = args.find(a => a.startsWith('--mutante='))?.split('=')[1];
@@ -135,6 +143,9 @@ const barridos = await barrerRestos();
 
 const results = [];
 const ok = (t, c, n = '') => { results.push({ t, s: c ? '✅' : '❌', n }); return c; };
+// aviso: algo que hay que mirar pero que NO es culpa del probe (p.ej. alguien emitió un recibo real
+// durante la corrida). Se imprime con ⚠️ y no cuenta como falla.
+const aviso = (t, n = '') => { results.push({ t, s: '⚠️ ', n }); };
 
 // ── Extraer las funciones REALES por ancla ──────────────────────────────────
 function extraer(nombre) {
@@ -478,8 +489,9 @@ async function barrerRestos() {
 
 // ── Conteos de lo que el fixture toca + club_secuencias ─────────────────────────────────────────
 // Acotados a la 9999 y a las filas del probe: un conteo de la tabla entera se mueve con el uso
-// real de prod en el medio de la corrida (GOTCHA #77/#100). club_secuencias va ENTERA (todas las
-// filas de todos los clubes): el fixture no emite recibos, así que no tiene que moverse ninguna.
+// real de prod en el medio de la corrida (GOTCHA #77/#100). club_secuencias NO va en esta igualdad:
+// la mueve cualquier recibo real emitido en el medio. Su control es otro (ver SECUENCIA más abajo):
+// que el probe no deje consumidos SUS números.
 async function conteos() {
   const n = async (q, rotulo) => { const { count, error } = await q; if (error) throw new Error(`${rotulo}: ${error.message}`); return count; };
   const { data: sec, error: eS } = await sb.from('club_secuencias').select('club_id,tipo,ultimo_numero').order('club_id').order('tipo');
@@ -490,11 +502,44 @@ async function conteos() {
     fichas_probe: await n(sb.from('profesionales').select('id', { count: 'exact', head: true }).like('nombre', 'PROBE-ROL-%'), 'fichas_probe'),
     auditoria_fixture: fx.liq ? await n(sb.from('auditoria').select('id', { count: 'exact', head: true }).eq('registro_id', fx.liq.id), 'auditoria_fixture') : 0,
     recibos_fixture: fx.prof ? await n(sb.from('recibos').select('id', { count: 'exact', head: true }).eq('profesional_id', fx.prof.id), 'recibos_fixture') : 0,
-    club_secuencias: (sec || []).map(s => `${s.club_id.slice(0, 8)}/${s.tipo}=${s.ultimo_numero}`).join(' '),
   };
 }
+async function secuencias() {
+  const { data, error } = await sb.from('club_secuencias').select('club_id,tipo,ultimo_numero').eq('tipo', 'recibo');
+  if (error) throw error;
+  return Object.fromEntries((data || []).map(r => [r.club_id, r.ultimo_numero]));
+}
+const fmtSec = m => Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([c, v]) => `${c.slice(0, 8)}=${v}`).join(' ');
+
+// ── SECUENCIA: devolver los números que el probe consumió, sin pisar números reales ────────────
+// Restaurar "al valor de antes" a ciegas repite números de recibo reales si alguien emitió durante
+// la corrida. Se devuelve SÓLO si (a) no hay recibos ajenos con número > antes y (b) la secuencia
+// sigue EXACTAMENTE en el valor que dejó el probe — (b) es un compare-and-set en el mismo UPDATE
+// (WHERE ultimo_numero = dejado), así que no hay ventana entre leer y escribir.
+// Devuelve { estado: 'restaurada' | 'ajena', dejado, actual?, motivo? }. Recibe el cliente para
+// poder probarla con un stub (los recibos del fixture no existen hoy: el caso no emite).
+async function devolverSecuencia(sbX, clubId, antes, numerosProbe) {
+  const dejado = Math.max(...numerosProbe);
+  if (mutArg !== 'sin_chequeo_ajenos') {
+    const { data: post, error: eR } = await sbX.from('recibos').select('numero_recibo').eq('club_id', clubId).gt('numero_recibo', antes);
+    if (eR) throw new Error(`devolverSecuencia/recibos: ${eR.message}`);
+    const ajenos = (post || []).map(r => r.numero_recibo).filter(n => !numerosProbe.includes(n));
+    if (ajenos.length) return { estado: 'ajena', dejado, motivo: `recibos ajenos con número ${ajenos.join(', ')}` };
+  }
+  let q = sbX.from('club_secuencias').update({ ultimo_numero: mutArg === 'no_devuelve' ? dejado : antes }).eq('club_id', clubId).eq('tipo', 'recibo');
+  if (mutArg !== 'sin_cas') q = q.eq('ultimo_numero', dejado);
+  const { data, error } = await q.select('ultimo_numero');
+  if (error) throw new Error(`devolverSecuencia/update: ${error.message}`);
+  if ((data || []).length === 1) return { estado: 'restaurada', dejado };
+  const { data: act } = await sbX.from('club_secuencias').select('ultimo_numero').eq('club_id', clubId).eq('tipo', 'recibo').single();
+  return { estado: 'ajena', dejado, actual: act?.ultimo_numero, motivo: `la secuencia está en ${act?.ultimo_numero}; el probe la dejó en ${dejado}` };
+}
+// ajena → aviso, nunca rojo: los números del probe quedan como hueco, pero nadie pierde el suyo.
+const clasificarSecuencia = r => r.estado === 'restaurada' ? 'ok' : (mutArg === 'ajena_como_rojo' ? 'rojo' : 'aviso');
+const secResultados = [];   // lo que devolvió devolverSecuencia en el teardown real (hoy: nada, no emite)
 
 const antesConteos = await conteos();
+const antesSec = await secuencias();
 const antes9999 = await snapshotLineas(sb, R9999);
 const { data: car9999, error: eCar } = await sb.from('carreras').select('id,numero_turno,numero_carrera_programa').eq('reunion_id', R9999).order('numero_turno');
 if (eCar) throw eCar;
@@ -521,15 +566,10 @@ async function teardown() {
       await sb.from('liquidacion_detalle').update({ recibo_id: null, estado_linea: 'impago', pagado_at: null }).eq('recibo_id', r.id);
       await sb.from('recibos').delete().eq('id', r.id);
     }
-    if ((recs || []).length) {
-      const antesSec = Object.fromEntries(antesConteos.club_secuencias.split(' ').map(x => x.split('=')));
-      for (const r of recs) {
-        const k = `${r.club_id.slice(0, 8)}/recibo`;
-        const { data: ajenos } = await sb.from('recibos').select('id').eq('club_id', r.club_id).gte('created_at', T0);
-        if (!(ajenos || []).length && antesSec[k] != null)
-          await sb.from('club_secuencias').update({ ultimo_numero: Number(antesSec[k]) }).eq('club_id', r.club_id).eq('tipo', 'recibo');
-      }
-    }
+    const porClub = {};
+    for (const r of recs || []) (porClub[r.club_id] ||= []).push(r.numero_recibo);
+    for (const [club, nums] of Object.entries(porClub))
+      secResultados.push({ club, nums, ...(await devolverSecuencia(sb, club, antesSec[club], nums)) });
   }
   if (fx.liq) {
     await sb.from('liquidaciones').delete().eq('id', fx.liq.id);
@@ -542,6 +582,47 @@ async function teardown() {
     if (ajena) await sb.from('liquidacion_detalle').update({ pagado_at: new Date().toISOString() }).eq('id', ajena);
   }
 }
+// ── SECUENCIA con stub: los 4 escenarios, sin tocar la base ─────────────────────────────────────
+function stubSecuencias(valor, recibos) {
+  const tabla = { ultimo_numero: valor }, escrituras = [];
+  const q = (tablaNom) => {
+    const f = []; let upd = null; let single = false;
+    const api = {
+      select() { return api; }, update(v) { upd = v; return api; }, single() { single = true; return api; },
+      eq(c, v) { f.push(r => r[c] === v || c === 'club_id' || c === 'tipo'); return api; },
+      gt(c, v) { f.push(r => r[c] > v); return api; },
+      then(res) {
+        if (tablaNom === 'recibos') return res({ data: recibos.filter(r => f.every(fn => fn(r))), error: null });
+        if (upd) { const pasa = f.every(fn => fn(tabla)); if (pasa) { escrituras.push({ ...upd }); Object.assign(tabla, upd); } return res({ data: pasa ? [{ ...tabla }] : [], error: null }); }
+        return res({ data: single ? { ...tabla } : [{ ...tabla }], error: null });
+      },
+    };
+    return api;
+  };
+  return { from: q, tabla, escrituras };
+}
+{
+  const R = n => ({ numero_recibo: n });
+  // S1: nadie emitió. antes 71, el probe emitió 72 → vuelve a 71
+  const s1 = stubSecuencias(72, [R(72)]);
+  const r1 = await devolverSecuencia(s1, 'club', 71, [72]);
+  ok('secuencia S1: nadie emitió → se devuelve al valor de antes (71)', r1.estado === 'restaurada' && s1.tabla.ultimo_numero === 71 && clasificarSecuencia(r1) === 'ok', JSON.stringify({ r1, tabla: s1.tabla }));
+  // S2: alguien emitió DESPUÉS del probe (73). No se escribe nada; aviso
+  const s2 = stubSecuencias(73, [R(72), R(73)]);
+  const r2 = await devolverSecuencia(s2, 'club', 71, [72]);
+  ok('secuencia S2: emisión ajena después del probe → NO escribe, queda en 73', r2.estado === 'ajena' && s2.escrituras.length === 0 && s2.tabla.ultimo_numero === 73, JSON.stringify({ r2, tabla: s2.tabla, escrituras: s2.escrituras }));
+  ok('secuencia S2: ese caso es AVISO, no rojo', clasificarSecuencia(r2) === 'aviso');
+  // S3: alguien emitió ENTRE el antes y el probe (72 ajeno, 73 probe). La secuencia está en 73 = lo que
+  // dejó el probe, pero devolverla a 71 repetiría el 72 real
+  const s3 = stubSecuencias(73, [R(72), R(73)]);
+  const r3 = await devolverSecuencia(s3, 'club', 71, [73]);
+  ok('secuencia S3: emisión ajena ENTRE medio (72 real, 73 probe) → NO escribe (devolver a 71 repetiría el 72)', r3.estado === 'ajena' && s3.escrituras.length === 0 && s3.tabla.ultimo_numero === 73, JSON.stringify({ r3, escrituras: s3.escrituras }));
+  // S4: carrera — el recibo ajeno 73 todavía no se ve al consultar recibos, pero la secuencia ya se movió
+  const s4 = stubSecuencias(73, [R(72)]);
+  const r4 = await devolverSecuencia(s4, 'club', 71, [72]);
+  ok('secuencia S4: la secuencia ya no está en lo que dejó el probe (72) → el compare-and-set no escribe', r4.estado === 'ajena' && s4.escrituras.length === 0 && s4.tabla.ultimo_numero === 73, JSON.stringify({ r4, escrituras: s4.escrituras }));
+}
+
 async function quedoDelFixture() {
   const [l, h, a, p] = await Promise.all([
     fx.liq ? sb.from('liquidacion_detalle').select('id').eq('liquidacion_id', fx.liq.id) : { data: [] },
@@ -606,14 +687,26 @@ try {
   const despuesConteos = await conteos();
   for (const k of Object.keys(antesConteos))
     ok(`restore: conteo ${k} igual antes y después`, String(antesConteos[k]) === String(despuesConteos[k]), `antes ${antesConteos[k]} · después ${despuesConteos[k]}`);
+  // SECUENCIA — el probe no dejó consumidos sus propios números. Con emisión ajena en el medio:
+  // aviso ("secuencia no restaurada"), no rojo.
+  const despuesSec = await secuencias();
+  const recibosQuedaron = fx.prof ? (await sb.from('recibos').select('id', { count: 'exact', head: true }).eq('profesional_id', fx.prof.id)).count : 0;
+  const consumidos = secResultados.filter(r => clasificarSecuencia(r) !== 'ok');
+  ok('restore: el probe no dejó consumidos sus propios números de recibo',
+     recibosQuedaron === 0 && secResultados.every(r => clasificarSecuencia(r) !== 'rojo'),
+     secResultados.length ? secResultados.map(r => `${r.club.slice(0, 8)}: ${r.estado} (${r.nums.join(',')})`).join('; ') : 'el caso no emitió recibos');
+  for (const r of consumidos)
+    aviso(`secuencia: alguien emitió durante la corrida, secuencia no restaurada (club ${r.club.slice(0, 8)})`, `${r.motivo}; números del probe que quedan como hueco: ${r.nums.join(', ')}`);
+  if (!secResultados.length && fmtSec(antesSec) !== fmtSec(despuesSec))
+    aviso('secuencia: cambió durante la corrida sin que el probe emitiera (recibo real emitido en el medio)', `antes ${fmtSec(antesSec)} · después ${fmtSec(despuesSec)}`);
   // red de seguridad: pase lo que pase arriba (mutante incluido), no queda basura
   if (fx.liq) { await sb.from('liquidacion_detalle').delete().eq('liquidacion_id', fx.liq.id); await sb.from('liquidaciones').delete().eq('id', fx.liq.id); await sb.from('auditoria').delete().eq('registro_id', fx.liq.id); }
   if (fx.prof) await sb.from('profesionales').delete().eq('id', fx.prof.id);
   const final = await quedoDelFixture();
   const v = diffLineas(antes9999, await snapshotLineas(sb, R9999));
   console.log(`  [barrido al arrancar] ${barridos.length ? barridos.join('; ') : 'nada que barrer'}`);
-  console.log(`  [conteos] antes ${JSON.stringify(antesConteos)}`);
-  console.log(`  [conteos] después ${JSON.stringify(await conteos())}`);
+  console.log(`  [conteos] antes ${JSON.stringify(antesConteos)} · club_secuencias ${fmtSec(antesSec)}`);
+  console.log(`  [conteos] después ${JSON.stringify(await conteos())} · club_secuencias ${fmtSec(await secuencias())}`);
   console.log(`  [red de seguridad] fixture al final: ${JSON.stringify(final)} · 9999 ${v.limpio ? 'limpia' : describir(v)}${abortado ? ` · ABORTADO: ${abortado}` : ''}`);
   if (final.lineas || final.header || final.auditoria || final.ficha) { console.error('❌ QUEDÓ BASURA DEL FIXTURE EN PROD', JSON.stringify(final), JSON.stringify(fx)); process.exitCode = 3; }
   process.off('SIGINT', alInterrumpir); process.off('SIGTERM', alInterrumpir);
@@ -625,7 +718,9 @@ try {
 console.log('\n=== probe_pagos_rol_carrera — rol y nº de carrera en el tab Pagos ===\n');
 for (const r of results) console.log(`  ${r.s} ${r.t}${r.n ? `\n       ${r.n}` : ''}`);
 const fall = results.filter(r => r.s === '❌').length;
-console.log(`\n  ${results.length - fall}/${results.length} OK\n`);
+const nAvisos = results.filter(r => r.s.startsWith('⚠')).length;
+const nOk = results.length - fall - nAvisos;
+console.log(`\n  ${nOk}/${nOk + fall} OK${nAvisos ? ` · ${nAvisos} aviso(s) — no son falla, mirarlos` : ''}\n`);
 
 // muestra legible de tarjetas reales
 console.log('  Muestra de tarjetas (rol · líneas · carreras):');
```
