# Merge de #51 — probes de Pagos y del recibo con datos sintéticos (sólo tests)

- Fecha: 2026-10-02, ~22:35 UTC
- Rama: `fix/probes-pagos-recibo-sinteticos` en `812301f`. Para dejarla al día se mergeó `origin/main` (`b92ce70`). Hubo conflicto sólo en `CHANGELOG.md`,
  resuelto dejando las dos entradas.
- Merge: `c53cfd9` en `main`.
- Sin cambios en HTML ni en la base: no hace falta ventana. Detalle del cambio: `2026-10-02_probes-pagos-recibo-sinteticos.md`.

## Conclusión

`correr_todos.sh` da 32 verdes, 12 rojos conocidos y **0 rojos nuevos** (rc=0). Los 4 rojos que venían bloqueando por drift de R9 pasaron a verde:
`probe_pagos_carrera_busqueda`, `probe_pagos_vista_carrera`, `probe_pagos_vista_incentivo_pagados` y `probe_recibo_una_hoja`. Mergeado.

Pregunta abierta, heredada del PR: un recibo de transferencia con 9 líneas no entra en una hoja. El fin del duplicado queda en 274,7 mm y el
límite es 267. ¿Tiene que entrar?

## correr_todos.sh (checkout principal, HEAD separado en origin/fix/probes-pagos-recibo-sinteticos = 812301f)

```
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       5s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       5s
probe_aviso_jockey_repetido                🟢 verde                                                      4s
probe_badge_overlap                        🟢 verde                                                      0s
probe_bolsa_efectiva                       🟢 verde                                                      2s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      1s
probe_chapa_4medio                         🟢 verde                                                      0s
probe_cobros_caballeriza                   🟢 verde                                                      2s
probe_condicion_sexo_r9                    🟢 verde                                                      5s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=2)                                       1s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       1s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      12s
probe_fmtinput_onblur                      🟢 verde                                                      1s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_inscripciones_listado                🟢 verde                                                      2s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      3s
probe_motor_chequeo_errores                🟢 verde                                                      0s
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       9s
probe_orden_inscriptos                     🟢 verde                                                      4s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde                                                      8s
probe_pagos_vista_carrera                  🟢 verde                                                     14s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     14s
probe_portal_alta_spc_ui                   🟢 verde                                                      1s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       1s
probe_portal_validacion                    🟢 verde                                                      0s
probe_programa_null_estado                 🟢 verde                                                      2s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🟢 verde                                                     39s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_resultados_front_cerrada             🟢 verde                                                      1s
probe_reparto_100                          🟢 verde                                                     42s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                      11s
probe_studbook_v2                          🟢 verde                                                      0s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       2s
probe_v_inscriptos_cerrada                 🟢 verde                                                      2s

Resumen: 32 verdes · 12 rojos conocidos · 0 rojos NUEVOS · 0 ausentes
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
Salida completa de cada probe: <tmpdir>/<probe>.txt
```
