# PR #17 — Reparto al 100 % (peón/capataz/sereno siempre, entrenador 18 %) + reuniones con la liquidación cerrada

- Fecha: 2026-09-25
- PR: https://github.com/mdqclio/SGH/pull/17 — rama `feat/reparto-100-subroles` @ `02c94bb02d75b0c640d31fe6e0f3bb0b63c7337b` (base `main` @ `a4ec2ad`). **Sin merge.**
- Guards: `pwd` = /home/clio/dev/SGH · `select count(*) from spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- **En prod no se aplicó ni se escribió nada.** En prod sólo hubo lecturas (MCP `execute_sql` con SELECT y el motor en
  seco, que captura las escrituras y no las envía). Todo lo que escribe se corrió en el **sandbox local** (`tests/local/`,
  Postgres en Docker con una copia de la 9999).
- Decisiones aplicadas: las del OK del 25/09 (opción A; R6/R8 congeladas tal como están; R9 abierta; recibo
  complementario para las 27; gate de entrenadores; concepto = rol + residuo; cierre por migración).

---

## Resumen

| Condición del OK | Estado |
|---|---|
| (a) orden: migración + cierre R6/R8 en una transacción → motor y UI → recálculo R9; parar si falla | La migración es **una** transacción, con un `DO` final que aborta todo si R6/R8 no quedaron cerradas. `recalculo_r9_subroles.mjs --ejecutar` **se niega** si la migración no está aplicada (R6/R8 abiertas), si R9 está cerrada o si el motor servido en `sigh.com.ar` no es el del repo. Si el plan en seco no da 3 × premiados, **para** |
| (b) copia de las 147 líneas + rollback escrito; después, pagadas y retenidas idénticas (md5) y nuevas = 69 | `--ejecutar` guarda la copia (líneas + headers) en `tests/local/out/` antes de tocar nada, recalcula y verifica: V1 comprometidas (md5 de la fila entera), V2 retenidas/impagas previas (md5 de contenido: el motor las reinserta con id nuevo), V3 nuevas = 3 × premiados (hoy **69**), todas `actuacion`, V4 ninguna desaparece. Si algo no da, para y dice el comando de `--rollback`. **Rollback probado de punta a punta en el sandbox: md5 de líneas y headers idénticos al estado previo** |
| (c) R9 no se recalcula con Valeria trabajando | `--ejecutar` exige `--ventana-confirmada`. **Espero tu confirmación de la ventana** |
| (d) probe completo antes del deploy, sintético y contra prod, 5 mutantes | `tests/probe_reparto_100.mjs --mutantes`: **41/41, 5/5 mutantes muertos** |

**Cambio respecto del plan**: la condición de "sesión directa" de los triggers pasó de `auth.role() IS NULL` a
`session_user <> 'authenticator'`.
- En prod, por MCP, `session_user = 'postgres'` y `auth.role()` es NULL, así que las dos funcionan (Q3).
- Pero el stub de `auth.role()` del sandbox cae a `current_user` y no daba NULL, y la condición nueva no depende del
  stub: toda la API entra por `authenticator`.

**Regla de residuo**: la implementada es la variante que deja **idénticas** las líneas de propietario, entrenador y
jockey: el sereno cierra el 18 % y el fondo cierra el 100 %. La del plan movía al entrenador y al propietario ±1
centavo, y eso rompía la condición (b) en 4 retenidas de R9. Con esta variante, R9 da **0 líneas "renacen distintas"**
(P3) y los 23 caballos cierran exactos (P4).

---

## Commits de la rama

```
02c94bb feat(liquidaciones): probe reparto 100 % (41/41, 5/5 mutantes) + recálculo de R9 con copia y rollback + docs
713f2c8 docs(issues): ISSUE-091 recálculo de reunión saldada genera líneas cobrables (R6+R8: 33, $1.345.823,34) + ISSUE-092 peón post-oficial
2b48e38 feat(liquidaciones): reparto al 100 % — peón/capataz/sereno siempre (entrenador 18 %) + reunión cerrada (WIP)
```
```
 CHANGELOG.md                                       |  34 ++
 CLAUDE.md                                          |  10 +
 docs/ISSUES.md                                     | 165 +++++++++
 liquidaciones-engine.js                            |  86 ++++-
 liquidaciones.html                                 | 109 +++++-
 migrations/reunion_liquidacion_cerrada.sql         | 147 ++++++++
 .../rollback_reunion_liquidacion_cerrada.sql       |  26 ++
 resultados.html                                    |  36 +-
 tests/lib/motor_dryrun.mjs                         | 145 ++++++++
 tests/probe_recibo_una_hoja.mjs                    |   3 +-
 tests/probe_reparto_100.mjs                        | 385 +++++++++++++++++++++
 tests/recalculo_r9_subroles.mjs                    | 172 +++++++++
 tests/render_recibo_pdf.mjs                        |   3 +-
 13 files changed, 1291 insertions(+), 30 deletions(-)
```

(`713f2c8` es el commit de ISSUE-091/092 de la rama `chore/issues-091-092-recalculo-saldadas-peon`, traído con
cherry-pick. Esa rama queda **superada** por esta: no abrí PR para ella.)

---

## Q1 — Probe nuevo: `PSQL_CMD="tests/local/up.sh sql" LOCAL_JWT_SECRET=… node tests/probe_reparto_100.mjs --mutantes`

Sandbox rearmado desde cero (`tests/local/up.sh`), con `migrations/rpc_cambiar_monta.sql` y
`migrations/reunion_liquidacion_cerrada.sql` aplicadas. La parte P corre contra **prod, sólo lectura**.

```
✅ S1a) bolsa 1000000: los 5 premiados reparten el 100 % exacto (centavo a centavo)
✅ S1b) entrenador + peón + capataz + sereno = r2(18 % del premio) exacto
✅ S1c) las 3 sub-líneas nacen siempre, concepto = rol, "(sin nombre cargado)"
✅ S1d) cada línea queda a ≤ 1 centavo de su % teórico
✅ S1e) las subs heredan retención y fecha de liberación del 10 % del entrenador (1°/2° retenido)
✅ S2a) bolsa 1083333.33: los 5 premiados reparten el 100 % exacto (centavo a centavo)
✅ S2b) entrenador + peón + capataz + sereno = r2(18 % del premio) exacto
✅ S2c) las 3 sub-líneas nacen siempre, concepto = rol, "(sin nombre cargado)"
✅ S2d) cada línea queda a ≤ 1 centavo de su % teórico
✅ S2e) las subs heredan retención y fecha de liberación del 10 % del entrenador (1°/2° retenido)
✅ S3) empate 2°–3°: cada uno reparte el 100 % del premio promediado
✅ S4) con nombre: concepto "Peón", descripción "… — Peón: JUAN PEREZ — A redistribuir (4%)"
✅ S50) hay una sub-línea de peón para marcar como pagada
✅ S5) peón renombrado después de pagada: sigue habiendo UNA sub-línea de peón (la pagada), no dos
✅ S60) hay una sub-línea de peón para marcar como pagada
✅ S6) peón cargado después de pagada: sigue habiendo UNA sub-línea de peón (la pagada), no dos
✅ S7) reunión con liquidacion_cerrada_at: devuelve cerrada y 0 escrituras
✅ S8) recalcular dos veces da exactamente las mismas líneas
✅ S9) caballo sin entrenador: ni 10 % ni subs (lo cubre el GATE ENTRENADORES de oficializar)
✅ U1) peón/capataz/sereno: Rol = el sub-rol (no "Profesional"), Concepto = rol — nombre o "(sin nombre)"; formato viejo también
✅ U2) el recibo imprime el concepto discriminado y escapado, el subtotal del personal y "(incluye personal de caballeriza)"
✅ U3) Pagos: pagables y retenidas con concepto discriminado; "Habilitar caballo" en las retenidas
✅ U4) Liquidaciones: Recalcular se deshabilita en reunión cerrada y el recálculo avisa si el motor dice cerrada
✅ U5) oficializar tiene el GATE ENTRENADORES después del de montas y ANTES de aplicar(…, 'oficial'), y corta con return
✅ U6) entrenadoresFaltantes: sólo los que largaron sin entrenador (el "no corrió" no cuenta)
✅ U7) des-oficializar se corta en reunión cerrada ANTES de la RPC
✅ P1) R9: el motor nuevo no da error y no toca líneas comprometidas (el DELETE filtra recibo NULL y ≠ pagado)
✅ P2) R9: nacen exactamente 69 líneas, todas peón/capataz/sereno (3 por caballo premiado)
✅ P3) R9: ninguna línea existente cambia de monto, estado o fecha (retenidas incluidas) y ninguna desaparece
✅ P4) R9: los 23 premiados reparten el 100 % exacto y el entrenador + personal = 18 % exacto
✅ P5) R9: la suma de las nuevas = Σ (18 % − 10 % del entrenador) por caballo, al centavo
✅ P6) R6 (cierre SIMULADO en memoria: la migración no está aplicada): el motor corta con 0 escrituras
✅ P6) R8 (cierre SIMULADO en memoria: la migración no está aplicada): el motor corta con 0 escrituras
✅ P7) md5 de las líneas de R6, R8 y R9: idéntico antes y después (el probe no escribió nada)
✅ D1) reunión cerrada: un INSERT como authenticated en liquidacion_detalle → P0091
✅ D2) reunión cerrada: un UPDATE como authenticated → P0091
✅ D3) reunión cerrada: un DELETE como authenticated → P0091
✅ D4) reunión cerrada: borrar el header como authenticated → P0091
✅ D5) service_role (regularización) sí puede escribir en la reunión cerrada
✅ D6) reabrir como authenticated (no super_admin) → 42501
✅ D7) limpieza: 0 filas de prueba y la 9999 vuelve a quedar abierta

41/41 checks OK

── Mutantes ──
💀 M1 muerto — las subs vuelven a nacer sólo con nombre (.filter) (S1a, S1b, S1c, S2a, S2b, S2c, S3, S60)
💀 M2 muerto — sin regla de residuo (sereno y fondo redondeados por separado) (S2a, S2b, S3)
💀 M3 muerto — el concepto de la sub vuelve a llevar el nombre (clave inestable) (S1b, S1c, S2b, S2c, S4, S5, S6)
💀 M4 muerto — el motor no corta en reunión cerrada (S7)
💀 M5 muerto — la base sin el trigger de reunión cerrada en liquidacion_detalle (D1, D2, D3)

5/5 mutantes muertos
```

## Q2 — md5 de las funciones de la migración (sandbox; tiene que coincidir con el encabezado del `.sql`)

```
NOTIFY
         proname         |               md5                
-------------------------+----------------------------------
 fn_liq_cerrada_guard    | e17f0c81a60afa0356fcda83819f5d4a
 fn_reunion_cierre_guard | e531d5094c6ca559d3e0898b38c8839c
 fn_reunion_liq_cerrada  | 11730b64066014745a40500ab5f97fb0
(3 rows)
```

## Q3 — Quién es una "sesión directa" en prod (MCP, sólo lectura)

```sql
select session_user::text as session_user, current_user::text as current_user, auth.role() as auth_role,
 (select rolname from pg_roles where rolname='authenticator') authenticator_existe,
 (select string_agg(r.rolname, ',') from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where u.rolname='authenticator') authenticator_miembro_de;
```
```json
[{"session_user":"postgres","current_user":"postgres","auth_role":null,"authenticator_existe":"authenticator","authenticator_miembro_de":"anon,authenticated,service_role"}]
```

## Q4 — Plan del recálculo de R9 contra prod (`node tests/recalculo_r9_subroles.mjs`, sólo lectura)

```
R9: 147 líneas hoy · 23 caballos premiados · nacerían 69 (esperado 69), $564096.66
   tipos de las nuevas: actuacion/Peón, actuacion/Capataz, actuacion/Sereno
   md5 fila entera (todas): d909b969541b07139c12a7a42d6f6603 · comprometidas: 5379bdeffc4de1a824f6d93cf06acd8c · contenido no comprometidas: daf081daae9e044c717c9260685fd6d7

PLAN: no se escribió nada.
```
Estos md5 son la foto de **hoy**: `--ejecutar` vuelve a medir justo antes de escribir.

## Q5 — `recalculo_r9_subroles.mjs` de punta a punta en el sandbox (`SANDBOX=1`, reunión 9999)

**Camino de falla + rollback.** Sobre la 9999 tal como viene, con fixtures de otros beneficiarios y sub-líneas en
formato viejo, la verificación **tiene** que fallar y el rollback **tiene** que dejar todo como estaba:
```
ANTES
 lineas   |    75 | 567eedb701e110c87c90c8db14584c4b
 headers  |    10 | d40b966fde685e61fc98c6e92e80f245
motor: {"created":5,"headers":8,"preserved":4}
V1 pagadas/con recibo idénticas (fila entera): ✅  3168c44dfc349b8efbf23db7948b64e8
V2 retenidas/impagas previas idénticas (contenido): ❌
V3 nuevas = 88 (esperado 45), todas actuacion: ❌  $1212560.00
V4 ninguna línea desapareció: ❌
R9 ahora: 106 líneas (antes 75)

⛔ PARAR: la verificación no dio — correr: node tests/recalculo_r9_subroles.mjs --rollback /home/clio/dev/SGH/tests/local/out/r9_copia_2026-09-25T15-56-16-835Z.json
DESPUÉS DE EJECUTAR
 lineas   |   106 | 8fc67231dac822a958d0727857012873
 headers  |     8 | 82e0c977412e31285fc17cb3b2cb091d
ROLLBACK: 75 líneas (copia 75) · md5 fila entera ✅ idéntico a la copia
DESPUÉS DEL ROLLBACK
 lineas   |    75 | 567eedb701e110c87c90c8db14584c4b
 headers  |    10 | d40b966fde685e61fc98c6e92e80f245
```
(La primera prueba del rollback encontró un bug: el motor borra los headers que quedan vacíos y reinsertar las líneas
violaba la FK. Se corrigió: el rollback repone primero los headers de la copia. La salida de arriba es la corrida ya
corregida.)

**Camino exitoso**, con la forma que va a tener R9: primero la 9999 del sandbox se regeneró con el motor de `main`
y sin nombres de peón. Después, el script con el motor nuevo:
```
motor de main (sin nombres): {"created":0,"headers":8,"preserved":4}
motor: {"created":0,"headers":8,"preserved":4}
V1 pagadas/con recibo idénticas (fila entera): ✅  3168c44dfc349b8efbf23db7948b64e8
V2 retenidas/impagas previas idénticas (contenido): ✅
V3 nuevas = 42 (esperado 42), todas actuacion: ✅  $252160.00
V4 ninguna línea desapareció: ✅
R9 ahora: 106 líneas (antes 64)

✅ Recálculo verificado.
ROLLBACK: 64 líneas (copia 64) · md5 fila entera ✅ idéntico a la copia
```

## Q6 — Regresión de los probes que dependen del código tocado

**Sólo lectura, contra prod**, con `LIQUIDACIONES_HTML` = el archivo de la rama. Resultado por check. El detalle se
omitió porque trae nombres de personas reales (jockeys, entrenadores y propietarios de R9) y la rama es pública:

#### probe_pagos_carrera_busqueda.txt
```
✅ A0) [detalle omitido: nombres de personas]
✅ A1) [detalle omitido: nombres de personas]
✅ A2) [detalle omitido: nombres de personas]
✅ A3) [detalle omitido: nombres de personas]
✅ A4) [detalle omitido: nombres de personas]
✅ A5) [detalle omitido: nombres de personas]
✅ A6) [detalle omitido: nombres de personas]
✅ A7) [detalle omitido: nombres de personas]
✅ A8) [detalle omitido: nombres de personas]
✅ A9) [detalle omitido: nombres de personas]
✅ A10) [detalle omitido: nombres de personas]
✅ B1) [detalle omitido: nombres de personas]
✅ B2) [detalle omitido: nombres de personas]
✅ B3) [detalle omitido: nombres de personas]
✅ B4) [detalle omitido: nombres de personas]
✅ B5) [detalle omitido: nombres de personas]
✅ B6) [detalle omitido: nombres de personas]
✅ B6b) [detalle omitido: nombres de personas]
✅ B7) [detalle omitido: nombres de personas]
✅ B8) [detalle omitido: nombres de personas]
✅ B9) [detalle omitido: nombres de personas]
✅ B10) [detalle omitido: nombres de personas]
✅ B11a) [detalle omitido: nombres de personas]
✅ B11b) [detalle omitido: nombres de personas]
✅ B11) [detalle omitido: nombres de personas]
✅ B11) [detalle omitido: nombres de personas]
✅ B11) [detalle omitido: nombres de personas]
✅ B11) [detalle omitido: nombres de personas]
✅ B11) [detalle omitido: nombres de personas]
✅ B11) [detalle omitido: nombres de personas]
✅ B11) [detalle omitido: nombres de personas]
✅ B11) [detalle omitido: nombres de personas]
✅ B11) [detalle omitido: nombres de personas]
✅ B11) [detalle omitido: nombres de personas]
✅ B11) [detalle omitido: nombres de personas]
✅ B11) [detalle omitido: nombres de personas]
✅ B11) [detalle omitido: nombres de personas]
✅ B12) [detalle omitido: nombres de personas]
✅ B13) [detalle omitido: nombres de personas]
✅ B14) [detalle omitido: nombres de personas]

40/40 checks OK
```

#### probe_pagos_vista_carrera.txt
```
✅ 1) [detalle omitido: nombres de personas]
✅ 1b) [detalle omitido: nombres de personas]
✅ 1c) [detalle omitido: nombres de personas]
✅ 1d) [detalle omitido: nombres de personas]
✅ 2) [detalle omitido: nombres de personas]
✅ 2b) [detalle omitido: nombres de personas]
✅ 2c) [detalle omitido: nombres de personas]
✅ 3) [detalle omitido: nombres de personas]
✅ 3b) [detalle omitido: nombres de personas]
✅ 3c) [detalle omitido: nombres de personas]
✅ 3d) [detalle omitido: nombres de personas]
✅ 3e) [detalle omitido: nombres de personas]
✅ 4) [detalle omitido: nombres de personas]
✅ 5) [detalle omitido: nombres de personas]
✅ 6) [detalle omitido: nombres de personas]
✅ 6b) [detalle omitido: nombres de personas]
✅ 6c) [detalle omitido: nombres de personas]
✅ 7) [detalle omitido: nombres de personas]
✅ 8) [detalle omitido: nombres de personas]
✅ 9) [detalle omitido: nombres de personas]
✅ 9b) [detalle omitido: nombres de personas]
✅ 10) [detalle omitido: nombres de personas]
✅ 10b) [detalle omitido: nombres de personas]
✅ 11) [detalle omitido: nombres de personas]
✅ 11b) [detalle omitido: nombres de personas]

25/25 checks OK
```

#### probe_pagos_vista_incentivo_pagados.txt
```
✅ 1) [detalle omitido: nombres de personas]
✅ 1b) [detalle omitido: nombres de personas]
✅ 1c) [detalle omitido: nombres de personas]
✅ 2) [detalle omitido: nombres de personas]
✅ 2b) [detalle omitido: nombres de personas]
✅ 2) [detalle omitido: nombres de personas]
✅ 2b) [detalle omitido: nombres de personas]
✅ 2c) [detalle omitido: nombres de personas]
✅ 2d) [detalle omitido: nombres de personas]
✅ 3) [detalle omitido: nombres de personas]
✅ 3b) [detalle omitido: nombres de personas]
✅ 3c) [detalle omitido: nombres de personas]
✅ 4) [detalle omitido: nombres de personas]
✅ 4b) [detalle omitido: nombres de personas]
✅ 5) [detalle omitido: nombres de personas]
✅ 5b) [detalle omitido: nombres de personas]
✅ 5c) [detalle omitido: nombres de personas]
✅ 5d) [detalle omitido: nombres de personas]
✅ 5e) [detalle omitido: nombres de personas]
✅ 5e2) [detalle omitido: nombres de personas]
✅ 5f) [detalle omitido: nombres de personas]
✅ 5g) [detalle omitido: nombres de personas]
✅ 5h) [detalle omitido: nombres de personas]
✅ 5i) [detalle omitido: nombres de personas]
✅ 5j) [detalle omitido: nombres de personas]
✅ 6) [detalle omitido: nombres de personas]
✅ 6b) [detalle omitido: nombres de personas]

27/27 checks OK
```

#### probe_recibo_rol.txt
```
✅ a) [detalle omitido: nombres de personas]
✅ a) [detalle omitido: nombres de personas]
✅ a) [detalle omitido: nombres de personas]
✅ b) [detalle omitido: nombres de personas]
✅ b) [detalle omitido: nombres de personas]
✅ b) [detalle omitido: nombres de personas]
✅ c) [detalle omitido: nombres de personas]
✅ c) [detalle omitido: nombres de personas]
✅ c) [detalle omitido: nombres de personas]
✅ c) [detalle omitido: nombres de personas]
✅ c) [detalle omitido: nombres de personas]
✅ c) [detalle omitido: nombres de personas]
✅ c) [detalle omitido: nombres de personas]
✅ c) [detalle omitido: nombres de personas]
✅ d) [detalle omitido: nombres de personas]
✅ d) [detalle omitido: nombres de personas]
✅ d) [detalle omitido: nombres de personas]
✅ d) [detalle omitido: nombres de personas]
✅ d) [detalle omitido: nombres de personas]

19/19 checks OK
```

#### probe_recibo_una_hoja.txt
```
   salida de Chromium en /tmp/recibo-probe-Oz2Ere
✅ 1a) [detalle omitido: nombres de personas]
✅ 1b) [detalle omitido: nombres de personas]
✅ 1c) [detalle omitido: nombres de personas]
✅ 1d) [detalle omitido: nombres de personas]
✅ 1e) [detalle omitido: nombres de personas]
✅ 1f) [detalle omitido: nombres de personas]
✅ 1g) [detalle omitido: nombres de personas]
✅ 1h) [detalle omitido: nombres de personas]
✅ 2a) [detalle omitido: nombres de personas]
✅ 2b) [detalle omitido: nombres de personas]
✅ 2c) [detalle omitido: nombres de personas]
✅ 2d) [detalle omitido: nombres de personas]
✅ 2e) [detalle omitido: nombres de personas]
✅ 3a) [detalle omitido: nombres de personas]
✅ 3a') [detalle omitido: nombres de personas]
✅ 3d) [detalle omitido: nombres de personas]
✅ 3e) [detalle omitido: nombres de personas]
✅ 3b) [detalle omitido: nombres de personas]
✅ 3c) [detalle omitido: nombres de personas]

19/19 checks OK
```

**`probe_montas_post_oficial` contra el sandbox** (motor nuevo + migración aplicada; la 9999 del sandbox, abierta):
```
✅ S0) resultados.html tiene las anclas SAVE MONTAS y llama a rpc_cambiar_monta
   → RESULTADOS_HTML=/home/clio/dev/SGH/resultados.html
✅ S0b) la RPC existe en la base y valida el parámetro
   → rpc_cambiar_monta: falta la inscripción
✅ P0) fixture — línea de jockey del 3° del turno 2 impago; 1° del turno 1 retenido; 4° del turno 3; incentivo pagado con recibo; header de propietario
   → LA=2948caa3 impago · LB=65582b50 retenido · INC=c4016cb6 benef 7381c730 · hdrProp=b0000000
✅ A1) impago → saveMontas real: UNA línea de jockey en (insc, 3°), al entrante, impago, mismo monto que la del saliente
   → líneas=1 9a7c0668:impago:$12000 · toasts=success,success
✅ A1b) la inscripción quedó con el entrante y el modal se cerró
✅ A1c) performances.jockey_id de esa inscripción pasó al entrante
   → jockey_id=9a7c0668
✅ A1d) el saliente no tiene ninguna línea de jockey por esa inscripción
✅ A2) retenido (1°) → la línea del saliente se borra y la del entrante nace RETENIDA
   → líneas=1 9a7c0668:retenido · toasts=success,success
✅ A3) pagado con recibo → RAISE que nombra el recibo; nada cambia
   → La monta de Río Salado (carrera 2) ya tiene un pago emitido al jockey anterior: recibo N° 99084. Anulá el recibo primero. ISSUE-084
✅ A4) pagado sin recibo (saldado administrativo) → RAISE "saldado administrativo"; nada cambia
   → La monta de Río Salado (carrera 2) ya tiene plata saldada al jockey anterior sin recibo (saldado administrativo): no se puede cambiar desde acá — hablá con la secretaría. ISSUE-084
✅ A5) incentivo del saliente pagado y sin otra monta en la reunión → RAISE con recibo; jockey e incentivo intactos
   → La monta de Río Salado (carrera 2) ya tiene un pago emitido al jockey anterior: recibo N° 9001. Anulá el recibo primero. ISSUE-084
✅ A6) carrera provisional → cambio:true, oficial:false, recalcular:false, 0 borradas; las líneas no se tocan
   → {"cambio":true,"oficial":false,"recalcular":false,"performances":0,"jockey_anterior":"f9000000-0000-0000-0000-0000000000a1","lineas_borradas":0}
✅ A7) RPC ok + recálculo fallido → el saliente no tiene línea pagable (la borró la RPC); toast rojo que manda a Recalcular
   → líneas=0 · toasts=success:1 monta(s) guardada(s) | error:Monta guardada, pero la liquidación no s
✅ A8) UPDATE directo de jockey_titular_id en carrera oficial → rechazado por el trigger; la columna no cambia
   → La carrera 2 ya está oficializada: la monta se cambia desde Montas (resultados.html), que recalcula la liquidación. ISSUE-084
✅ A9) propietario pagado + jockey impago → la RPC pasa (mira sólo al jockey saliente); la línea del propietario queda
   → {"cambio":true,"oficial":true,"recalcular":true,"performances":0,"jockey_anterior":"fa2bf88c-dad6-435a-a5fc-a45b70e0b8d0","lineas_borradas":2}
✅ A10) UPDATE con el payload entero y el mismo jockey en carrera oficial → pasa (NEW IS NOT DISTINCT FROM OLD)
   → ok
✅ A11) tras una RPC exitosa, un UPDATE directo sigue rechazado (set_config fue local a la transacción de la RPC)
   → rpc=ok · update=La carrera 2 ya está oficializada: la monta se cambia desde Montas (resultados.html), que recalcula la liquidación. ISSUE-084
✅ A12) incentivo pagado del saliente + otra monta en carrera PROVISIONAL → la RPC pasa y el incentivo no se toca
   → {"cambio":true,"oficial":true,"recalcular":true,"performances":0,"jockey_anterior":"7381c730-f95c-459f-8b24-41637300f117","lineas_borradas":0} · incentivo pagado+recibo
✅ P1) anon → rechazado antes de entrar a la función (no tiene EXECUTE)
   → code=42501 permission denied for function rpc_cambiar_monta
✅ P2) authenticated con club de otro hipódromo → 42501, la monta no cambia
   → code=42501 rpc_cambiar_monta: la inscripción es de otro hipódromo
✅ P3) authenticated SIN fila en usuarios (club NULL) → 42501 de un guard propio; NO se lo confunde con service_role
   → code=42501 rpc_cambiar_monta: sin permiso
✅ P4) portal + inscripción INEXISTENTE → 42501 del guard (no "la inscripción no existe"): el guard corre antes del lookup
   → code=42501 rpc_cambiar_monta: el portal no cambia montas
✅ R1) restore por estado: la 9999 quedó exactamente como al empezar (headers, líneas con sus ids, jockeys, resultados)
   → sin diferencias
✅ R2) nada fuera de la 9999 cambió: total de líneas, total de recibos (sin filtro de club) y 0 performances del probe
   → líneas 75→75 · recibos 2→2 · perfs=0 · antes del restore diferían 1 fila(s), como corresponde a un probe que recalcula

24/24 OK
```

**No corridos** (escriben en la 9999 de **prod**; sin OK no se escribe en prod): `probe_oficializar_carrera`,
`probe_recuperacion_monta`, `probe_fase_c`, `probe_pagos_rol_carrera`, `probe_historial_recibos`,
`probe_anular_recibo`, `probe_anular_recibo_ui`, `probe_aislamiento_club_cobros`, `probe_filtro_concepto_pagos`,
`probe_recibo_pie_cobrador`, `probe_reunion_es_prueba`. Recomendación: correrlos contra prod **después** de la
migración y antes del recálculo de R9, o en el sandbox si soportan `SUPABASE_URL` local.

---

## Qué falta y quién lo decide

1. **OK para aplicar la migración** (paso 1). Inmediatamente después: comparar los 3 md5 del encabezado (Q2) contra
   `pg_get_functiondef` en prod (GOTCHA #99) y correr `probe_reparto_100.mjs`: P6 pasa de "SIMULADO" a "cerrada en la base".
2. **OK para mergear** (paso 2: deploy de motor y UI) y verificar con md5 que `sigh.com.ar/liquidaciones-engine.js` es
   el de la rama. `--ejecutar` lo vuelve a chequear.
3. **Ventana para el recálculo de R9** (paso 3, condición c): me la confirmás vos.
4. Después del recálculo: el **recibo complementario** de las 27 sub-líneas de los 9 caballos cuyos entrenadores ya
   cobraron (recibos 35, 37, 40, 45, 46, 48, 56, 61). Sale del flujo normal de Pagos: las líneas están impagas y
   aparecen tildadas en el detalle del entrenador.
5. R6/R8 **congeladas** hasta que Fede conteste. Reabrirlas es una migración (o un super_admin).

## Verificación del push (commit del informe)

```
$ git push origin HEAD:refs/heads/reports
$ git rev-parse HEAD
1d47c7b78b9635ef39ff3ba28c7dc372ccf33a98
$ git ls-remote origin reports
1d47c7b78b9635ef39ff3ba28c7dc372ccf33a98	refs/heads/reports
```
Este bloque va en un commit posterior ("verificación de push"): el SHA final de `reports` es el de ese commit.
