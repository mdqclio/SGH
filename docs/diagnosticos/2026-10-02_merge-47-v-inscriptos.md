# Paso 1 — merge de #47 (v_inscriptos_carrera cerrada, ISSUE-098)

- Fecha: 2026-10-02, ~20:40 UTC
- Rama: `fix/v-inscriptos-security-invoker` en `fbe9d08d25550231ceebef2b4524fa535bec6e58` (al día con `main` antes del merge)
- Merge: `d481e68f7195377408cdc9180a8864efe824e3e3` en `main`
- Guards: pwd `/home/clio/dev/SGH`; proyecto `unlhcuanfrtpatoipwve`; `SELECT nombre FROM clubs WHERE id='0649e9c5-…'` → `Hipódromo de Dolores` (1 fila)
- La migración ya estaba aplicada en prod desde la sesión anterior (informe `2026-10-02_v-inscriptos-cerrada.md`). El merge sólo lleva a `main` el SQL versionado, el rollback, el probe y la documentación: no cambia ningún HTML servido.

## Conclusión

Mergeado. `correr_todos.sh` sobre la rama: 27 verdes · 12 rojos conocidos · **4 rojos nuevos**. Los 4 fallan **igual sobre `main`**
(`c28d8bee35c4304109ac7e6b763129f1b0a2c574`): mismos checks, mismos valores. Son ajenos al cambio (la rama no toca pagos ni recibos).
Causa: el dato. Hoy se cobró en R9 (31 recibos emitidos el 02/10, 23 de ellos entre las 19 y las 20 UTC), y el universo pagable de R9
bajó por debajo de lo que los probes asumen (≥ 10 tarjetas → hay 5). `probe_recibo_una_hoja` mide un recibo real que cambió.
Pasarlos a datos sintéticos es el PR aparte del pedido ("+ Los 3 probes rojos a sintético"): son 4, no 3. `probe_pagos_carrera_busqueda`
también cayó.

## Resumen de correr_todos.sh sobre la rama (checkout principal, HEAD separado en origin/fix/v-inscriptos-security-invoker)

```
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       4s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       5s
probe_aviso_jockey_repetido                🟢 verde                                                      4s
probe_badge_overlap                        🟢 verde                                                      1s
probe_bolsa_efectiva                       🟢 verde                                                      1s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      2s
probe_chapa_4medio                         🟢 verde                                                      0s
probe_cobros_caballeriza                   🟢 verde                                                      3s
probe_condicion_sexo_r9                    🟢 verde                                                      5s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=2)                                       2s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      14s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      2s
probe_motor_chequeo_errores                🟢 verde                                                      1s
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       8s
probe_orden_inscriptos                     🟢 verde                                                      6s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🔴 ROJO NUEVO (rc=1)                                         20s
probe_pagos_vista_carrera                  🔴 ROJO NUEVO (rc=1)                                         13s
probe_pagos_vista_incentivo_pagados        🔴 ROJO NUEVO (rc=1)                                         15s
probe_portal_alta_spc_ui                   🟢 verde                                                      1s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       1s
probe_portal_validacion                    🟢 verde                                                      0s
probe_programa_null_estado                 🟢 verde                                                      2s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      0s
probe_recibo_una_hoja                      🔴 ROJO NUEVO (rc=1)                                         69s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_resultados_front_cerrada             🟢 verde                                                      1s
probe_reparto_100                          🟢 verde                                                     43s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                      11s
probe_studbook_v2                          🟢 verde                                                      0s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       2s
probe_v_inscriptos_cerrada                 🟢 verde                                                      2s

Resumen: 27 verdes · 12 rojos conocidos · 4 rojos NUEVOS · 0 ausentes
Rojos conocidos (no bloquean):
  - probe_activacion_pendiente          drift del probe: su stub de sb no tiene .select() después de update().eq() (TypeError)
  - probe_alineado_programa             drift: el check de márgenes de página (10mm 8mm) del programa color no coincide — el CSS de impresión cambió desde que se escribió
  - probe_apuestas_especiales           drift: 9 checks de tarjetas (cantidad, número, nombre, rango) no coinciden con la pantalla actual
  - probe_cuerpos_oficial               drift de datos: espera 8 carreras oficiales en R6 y hay 7 (C3 está provisional desde el 14/08)
  - probe_edad_display                  drift: no encuentra el ancla de fin del bloque de edad en el HTML
  - probe_edad_reglamentaria            2/32: el Stud Book no devuelve dato para los ejemplares de R9 (fuente externa; ver studbook_buscar_fn)
  - probe_forfait_anulada               drift de extracción: ReferenceError renumerarChapas
  - probe_orden_carreras                drift de datos: 2/18 asumen R9 con 0 anuladas y sin sortear (R9 ya tiene anuladas y sorteo)
  - probe_portal_carta                  drift: no encuentra loadCarta en portal.html (hoy se llama loadLlamado)
  - probe_spcs_r9_tanda_1               evidencia histórica: asserta count(spcs) = 205 (hoy 239)
  - probe_studbook_buscar_fn            fuente externa: el Stud Book responde HTTP 403 a las búsquedas desde este servidor
  - probe_tapa_flyer                    drift de extracción: ReferenceError edadSPC
ROJOS NUEVOS (bloquean el merge):
  - probe_pagos_carrera_busqueda
  - probe_pagos_vista_carrera
  - probe_pagos_vista_incentivo_pagados
  - probe_recibo_una_hoja
Salida completa de cada probe: <tmpdir>/<probe>.txt
```

## Los 4 rojos nuevos, corridos sobre main (c28d8bee35c4304109ac7e6b763129f1b0a2c574)

Comando: `for p in …; do node tests/$p.mjs; done` con `.env` cargado. Sólo las líneas que fallan; en las que el detalle trae nombres de
personas, el detalle se reemplazó por `[detalle con nombres omitidos]` (repo público). El diff de las líneas que fallan entre `main` y la rama dio vacío en los 4.

```
== probe_pagos_carrera_busqueda (main)
❌ B11a) hay universo pagable en R9 para armar los casos (≥ 10 tarjetas)  → 5
❌ B11b) se armaron casos de los 4 tipos (compuesto, Ñ, caballeriza, provisorio)  → 6 casos; compuesto=true Ñ=true caballerizas=0 provisorio=true
❌ B13) sin q: el universo de R9 se lista entero (≥ 10 tarjetas)  → 5
30/33 checks OK
== probe_pagos_carrera_busqueda (#47)
30/33 checks OK
== probe_pagos_vista_carrera (main)
❌ 2c) C5: cada rol de ese bloque lleva el beneficiario correcto según la inscripción
❌ 3) C5: los 0 incentivo(s) de jockey pagable(s) de quienes largaron acá aparecen (sin inscripcion_id ni carrera_id) — con importe si C5 es su carrera dueña, como nota si no  → [detalle con nombres omitidos]
❌ 4) C5: una misma persona en dos roles tiene dos botones Pagar (propietario y profesional)  → [detalle con nombres omitidos]
❌ 8) sin carrera: modo tarjetas por persona intacto (≥ 10 tarjetas, sin cob-vista)  → 5 tarjetas
21/25 checks OK
== probe_pagos_vista_carrera (#47)
21/25 checks OK
== probe_pagos_vista_incentivo_pagados (main)
❌ 2c) R9: los 0 incentivos pagables aparecen con importe una sola vez, en la carrera de número más bajo
❌ 2d) cada incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"
❌ 3) [jockey] (una monta, incentivo pagable): con importe en su carrera y sin nota  → {"lin":[],"notas":[]}
23/26 checks OK
== probe_pagos_vista_incentivo_pagados (#47)
23/26 checks OK
== probe_recibo_una_hoja (main)
❌ 2c) en las 2 copias el pie contiene total (NETO A COBRAR), "Retira:" y la firma (Firma/Aclaración/DNI) — todo dentro de .recibo-pie  → 652 chars
❌ 3d) 9 líneas → 1 página, corte a la mitad (137.2 mm), fin del duplicado 274.7 mm ≤ 267
17/19 checks OK
== probe_recibo_una_hoja (#47)
17/19 checks OK
```

## El dato que cambió (R9, `cafa37d6-89f4-45cb-a0d9-835bc27407e9`)

```sql
select l.estado_linea, (l.recibo_id is not null) as con_recibo, count(*) n, sum(l.monto_neto) total
from liquidacion_detalle l join carreras c on c.id=l.carrera_id
where c.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' group by 1,2 order by 1,2;
```
```
impago   | false | 30 | $228.624,16
pagado   | false |  2 | $200.000,00
pagado   | true  | 74 | $1.642.710,00
retenido | false | 60 | $5.479.874,18
```
```sql
select date_trunc('hour', created_at) hora, count(*) recibos from recibos where created_at > now() - interval '3 days' group by 1 order by 1;
```
```
2026-10-02 15:00 UTC |  1
2026-10-02 16:00 UTC |  6
2026-10-02 19:00 UTC | 23
2026-10-02 20:00 UTC |  1
```
