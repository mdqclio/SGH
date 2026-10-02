# Paso 2 — merge de #46 (inscripciones: listado continuo de todos los turnos)

- Fecha: 2026-10-02
- Rama: `feat/inscripciones-listado-continuo` en `4672a408fcc76f34e1854b8b42de3916ecc2089b`, al día con `main`. Para eso se mergeó `origin/main`, con conflicto en
  `CHANGELOG.md`: se conservaron las dos entradas.
- Merge: `b92ce70` en `main`, a las 21:35:41 UTC.
- Guards: pwd `/home/clio/dev/SGH`; proyecto `unlhcuanfrtpatoipwve`; club Dolores = 1 fila (consultado a las 21:35:06 UTC).

## Conclusión

Mergeado y servido: el md5 de `inscripciones.html` en `sigh.com.ar` es igual al del merge.

Se cumplieron las dos condiciones del pedido:

1. **60 minutos sin actividad del usuario de inscripciones** (`a1c490f5-81ee-4d9f-acb7-d2123e99e7d3`): su última fila en `auditoria` era de las
   20:35:09 UTC y el merge fue a las 21:35:41 UTC (60 min 32 s).
2. **Los 4 rojos fallan igual sobre `main`.** Se corrieron `probe_pagos_carrera_busqueda`, `probe_pagos_vista_carrera`,
   `probe_pagos_vista_incentivo_pagados` y `probe_recibo_una_hoja`: mismos checks y mismos valores en #46 y en `main`
   (`c28d8bee35c4304109ac7e6b763129f1b0a2c574`). Ninguno pasa en `main` y falla en #46. El assert y el dato que cambió están en el informe del paso 1
   (`2026-10-02_merge-47-v-inscriptos.md`): el universo pagable de R9 bajó de ≥ 10 tarjetas a 5 por los 31 recibos emitidos hoy.
   El arreglo es el PR #51, que pasa los 4 probes a sintético.

**Después del merge**, a las 21:38:09 UTC, el mismo usuario volvió a trabajar: aprobó un usuario de portal. Desde entonces ve el listado nuevo.

## correr_todos.sh sobre la rama (checkout principal, en 4672a408fcc76f34e1854b8b42de3916ecc2089b)

```
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       3s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      2s
probe_badge_overlap                        🟢 verde                                                      1s
probe_bolsa_efectiva                       🟢 verde                                                      1s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      0s
probe_chapa_4medio                         🟢 verde                                                      0s
probe_cobros_caballeriza                   🟢 verde                                                      1s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=2)                                       1s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       1s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      43s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      1s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_inscripciones_listado                🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      3s
probe_motor_chequeo_errores                🟢 verde                                                      0s
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       5s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🔴 ROJO NUEVO (rc=1)                                         19s
probe_pagos_vista_carrera                  🔴 ROJO NUEVO (rc=1)                                         14s
probe_pagos_vista_incentivo_pagados        🔴 ROJO NUEVO (rc=1)                                         13s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      1s
probe_programa_null_estado                 🟢 verde                                                      1s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🔴 ROJO NUEVO (rc=1)                                         65s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_resultados_front_cerrada             🟢 verde                                                      2s
probe_reparto_100                          🟢 verde                                                     39s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       1s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                      11s
probe_studbook_v2                          🟢 verde                                                      0s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       3s
probe_v_inscriptos_cerrada                 🟢 verde                                                      2s

Resumen: 28 verdes · 12 rojos conocidos · 4 rojos NUEVOS · 0 ausentes
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

## Los 4 rojos: rama vs main

`diff` de las líneas que fallan entre `main` y #46: vacío en los 4. Detalle anonimizado (los detalles con nombres de personas se omiten):

```
== probe_pagos_carrera_busqueda (#46)
❌ B11a) hay universo pagable en R9 para armar los casos (≥ 10 tarjetas)  → 5
❌ B11b) se armaron casos de los 4 tipos (compuesto, Ñ, caballeriza, provisorio)  → 6 casos; compuesto=true Ñ=true caballerizas=0 provisorio=true
❌ B13) sin q: el universo de R9 se lista entero (≥ 10 tarjetas)  → 5
30/33 checks OK
== probe_pagos_vista_carrera (#46)
❌ 2c) C5: cada rol de ese bloque lleva el beneficiario correcto según la inscripción
❌ 3) C5: los 0 incentivo(s) de jockey pagable(s) de quienes largaron acá aparecen (sin inscripcion_id ni carrera_id) — con importe si C5 es su carrera dueña, como nota si no  → [detalle con nombres omitidos]
❌ 4) C5: una misma persona en dos roles tiene dos botones Pagar (propietario y profesional)  → [detalle con nombres omitidos]
❌ 8) sin carrera: modo tarjetas por persona intacto (≥ 10 tarjetas, sin cob-vista)  → 5 tarjetas
21/25 checks OK
== probe_pagos_vista_incentivo_pagados (#46)
❌ 2c) R9: los 0 incentivos pagables aparecen con importe una sola vez, en la carrera de número más bajo
❌ 2d) cada incentivo con importe lleva "Incentivo por reunión — se paga una sola vez"
❌ 3) [jockey] (una monta, incentivo pagable): con importe en su carrera y sin nota  → {"lin":[],"notas":[]}
23/26 checks OK
== probe_recibo_una_hoja (#46)
❌ 2c) en las 2 copias el pie contiene total (NETO A COBRAR), "Retira:" y la firma (Firma/Aclaración/DNI) — todo dentro de .recibo-pie  → 652 chars
❌ 3d) 9 líneas → 1 página, corte a la mitad (137.2 mm), fin del duplicado 274.7 mm ≤ 267
17/19 checks OK
```

## Deploy

```
$ curl -s "https://sigh.com.ar/inscripciones.html?v=$RANDOM" -o prod_insc.html
$ git show b92ce70:inscripciones.html > local_insc.html
$ md5sum local_insc.html prod_insc.html
3995c4b88a430984c44bdd79488ea1e4  local_insc.html
3995c4b88a430984c44bdd79488ea1e4  prod_insc.html
```

## Actividad (auditoría, por usuario, sin nombres)

```sql
select now(), (select max(created_at) from auditoria where usuario_id='a1c490f5-81ee-4d9f-acb7-d2123e99e7d3') yesi_ult;
-- 21:35:06 UTC → 20:35:09 UTC (59:56); merge 40 s después
select tabla, accion, count(*), min(created_at), max(created_at) from auditoria
 where usuario_id='a1c490f5-81ee-4d9f-acb7-d2123e99e7d3' and created_at > '2026-10-02 21:30' group by 1,2;
-- usuarios | INSERT | 1 | 21:38:09 UTC  (registro 3916d94a-7faa-4d0b-859a-c23af77250d6, rol profesional)
```
