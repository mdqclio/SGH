# Merge de #40 y #41 · fixtures de dos probes al sandbox (PR #42) · ventana de las 20:07

- **Fecha**: 2026-10-02
- **`main`**: `ade78361a16146cb73262d4bc33b95962f28b158` (merge del #41)
- **Guards**: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` ✅ · clubs Dolores por uuid ✅. Nada escribió en prod.

## Resumen

| # | Pedido | Estado |
|---|---|---|
| 1 | Mergear #40 y #41 con `correr_todos.sh` antes | ✅ **#40** MERGED 15:40:51 UTC (`817e9e023dafb2f458890129fc6d5f6253859c68`) · **#41** MERGED 15:45:06 UTC (`ade78361a16146cb73262d4bc33b95962f28b158`). 0 rojos nuevos en los dos. Deploy verificado (md5 de `CLAUDE.md` servido = el del merge, 15:46:34 UTC) |
| 2 | `probe_bolsa_efectiva` y `probe_paridad_llamado_inscripciones` al sandbox, PR aparte | ✅ **PR #42** (`fix/probes-fixtures-al-sandbox`, `09c6af738db4c4692406a50d713487d62a76a3b9`), **sin mergear** |
| 3 | Los 12 rojos conocidos, en tandas | ⏳ no empezado (sin apuro). Propuesta de tandas abajo |

### 1. Merges

- **#40, primera corrida: 1 rojo nuevo, `probe_reparto_100`.** No era del #40: la rama era anterior al merge del #39 y tenía los P2/P5
  viejos, y la lista de conocidos (de #41) ya no lo traía. Se actualizó la rama con `main` (`77b4408614bf49dfb74a8a29dbb6945709c73efc`) y
  la segunda corrida dio **27 verdes · 12 conocidos · 0 nuevos**; los 3 de Pagos pasaron a verde. Merge.
- **#41**: con #40 en `main`, se sacaron los 3 de Pagos de `correr_todos.rojos_conocidos` (regla: un conocido que pasa a verde sale en el
  mismo PR), se actualizó con `main` y se corrió **su propio** script: **27 verdes · 12 conocidos · 0 nuevos**
  (`47ab3c45eeda2eb3e5c75449969bf76d082483f7`). Merge.
- Quedan **12 rojos conocidos** en `main` (lista en la salida de abajo).

### 2. PR #42 — fixtures al sandbox

- `tests/lib/sandbox_rest.mjs` (nuevo): cliente contra el sandbox local; **se niega** si la URL no es localhost.
- `tests/local/llamado_sandbox.sql` (nuevo): las 3 FK que PostgREST necesita para los embeds del llamado y del encabezado de inscripciones
  (`reuniones_hipodromo_id_fkey`, `carreras_reunion_id_fkey`, `carreras_categoria_id_fkey`, con la definición de prod; `NOT VALID`). El
  sandbox no tenía **ninguna** FK (el DDL de `clonar_9999` no las trae) y por eso los embeds fallaban con `PGRST200`. **Se aplicó al
  sandbox** (`sgh-local-pg`, base `sgh`); prod no se tocó.
- `probe_bolsa_efectiva`: fixture y pantallas en el sandbox (crea su propio hipódromo y categoría ahí); E1/E2 siguen **leyendo** R9 de prod;
  nuevo T2: la 9990 no existe en prod. **20/20 · mutantes 8/8.** Sin sandbox saltea esa parte con ⏸, por eso **entra** a `correr_todos.sh`.
- `probe_paridad_llamado_inscripciones`: todo en el sandbox; T2 verifica prod. **51/51 · mutantes 17/17.** Sin sandbox, exit 2: queda en
  la categoría "sólo sandbox" del script.
- `correr_todos.sh` sobre la rama: **28 verdes · 12 conocidos · 0 nuevos** (1 ausente: `probe_motor_chequeo_errores`, que llega con #38).
- Sandbox después de todas las corridas: 1 reunión (la 9999), 0 hipódromos, 0 categorías — igual que antes.

### Ventana de las 20:07 (#37 y #38)

- Para que la tarea pueda correr `correr_todos.sh` en la rama del #38 (que era anterior al script), **#37 y #38 se actualizaron con `main`**:
  heads nuevos **#37 `44280646c3e29863e702bf9834317301c0e48ef9`**, **#38 `3f7d0c0daacc73f1f4637208fcfef112f1ac180a`**. La tarea se rehízo con esos heads
  (`3736b947`, 20:07 ART, sólo en esta sesión).
- **Corrida previa sobre el #38** (sin mergear): **28 verdes · 12 conocidos · 0 nuevos · 0 ausentes**; `probe_motor_chequeo_errores` verde.
  A las 20:07 se vuelve a correr antes del merge.

### 3. Los 12 rojos conocidos — propuesta de tandas

| Tanda | Probes | Tipo |
|---|---|---|
| A — extracción (lo más rápido, mismo patrón que #40) | `forfait_anulada` (`renumerarChapas`), `tapa_flyer` (`edadSPC`), `portal_carta` (`loadCarta` → `loadLlamado`), `edad_display` (ancla), `activacion_pendiente` (stub sin `.select()`) | el probe no sigue al HTML |
| B — datos que cambiaron | `cuerpos_oficial` (R6 C3 provisional), `orden_carreras` (R9 con anuladas), `spcs_r9_tanda_1` (205) | pasar a sintéticos o a asserts relativos, como #39 |
| C — pantallas | `alineado_programa` (márgenes de página), `apuestas_especiales` (9 checks de tarjetas) | mirar si es drift del probe o un cambio de pantalla no querido |
| D — fuente externa | `studbook_buscar_fn`, `edad_reglamentaria` (el Stud Book responde 403 desde este servidor) | ver primero si el 403 es de la IP del VPS; si es así, no es del código |

## Preguntas abiertas

1. ¿Arranco por la tanda A?
2. Tanda D: el 403 del Stud Book desde el VPS, ¿es nuevo? La Edge Function `studbook-buscar` corre en Supabase, no en el VPS: no la afecta.

## Salida cruda

### `correr_todos.sh` sobre el #40 — primera corrida (rama sin actualizar)

```
094b7fdf958e50920ea269b22198fe1fed88fef0
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       4s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      2s
probe_badge_overlap                        🟢 verde                                                      1s
probe_carta_numero_turno                   🟢 verde                                                      1s
probe_carta_selector_reunion               🟢 verde                                                      1s
probe_chapa_4medio                         🟢 verde                                                      1s
probe_cobros_caballeriza                   🟢 verde                                                      1s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      27s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      1s
probe_montas_reales                        🟢 verde                                                      2s
probe_motor_chequeo_errores                — no está en esta rama
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       6s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde (estaba en rojos conocidos: sacarlo de la lista)    28s
probe_pagos_vista_carrera                  🟢 verde (estaba en rojos conocidos: sacarlo de la lista)    14s
probe_pagos_vista_incentivo_pagados        🟢 verde (estaba en rojos conocidos: sacarlo de la lista)    14s
probe_portal_alta_spc_ui                   🟢 verde                                                      1s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       1s
probe_portal_validacion                    🟢 verde                                                      0s
probe_programa_null_estado                 🟢 verde                                                      1s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🟢 verde                                                     60s
probe_regex_datos_personales               🟢 verde                                                      1s
probe_reparto_100                          🔴 ROJO NUEVO (rc=1)                                         39s
probe_rls_no_permissive                    🟢 verde                                                      0s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       1s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                       1s
probe_studbook_v2                          🟢 verde                                                      1s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       2s

Resumen: 26 verdes · 12 rojos conocidos · 1 rojos NUEVOS · 1 ausentes
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
Conocidos que ahora pasan (sacarlos de <scratchpad>/ct_conocidos.txt):
  - probe_pagos_carrera_busqueda
  - probe_pagos_vista_carrera
  - probe_pagos_vista_incentivo_pagados
ROJOS NUEVOS (bloquean el merge):
  - probe_reparto_100
Salida completa de cada probe: <scratchpad>/ct_40/<probe>.txt
exit=1
```

### `correr_todos.sh` sobre el #40 — después de actualizarlo con `main`

```
77b4408614bf49dfb74a8a29dbb6945709c73efc
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       2s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      2s
probe_badge_overlap                        🟢 verde                                                      0s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      1s
probe_chapa_4medio                         🟢 verde                                                      0s
probe_cobros_caballeriza                   🟢 verde                                                      1s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       1s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      26s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      1s
probe_montas_reales                        🟢 verde                                                      2s
probe_motor_chequeo_errores                — no está en esta rama
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       5s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      1s
probe_pagos_carrera_busqueda               🟢 verde (estaba en rojos conocidos: sacarlo de la lista)    25s
probe_pagos_vista_carrera                  🟢 verde (estaba en rojos conocidos: sacarlo de la lista)    15s
probe_pagos_vista_incentivo_pagados        🟢 verde (estaba en rojos conocidos: sacarlo de la lista)    14s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      1s
probe_programa_null_estado                 🟢 verde                                                      1s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🟢 verde                                                     61s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_reparto_100                          🟢 verde                                                     39s
probe_rls_no_permissive                    🟢 verde                                                      0s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                       1s
probe_studbook_v2                          🟢 verde                                                      0s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       3s

Resumen: 27 verdes · 12 rojos conocidos · 0 rojos NUEVOS · 1 ausentes
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
Conocidos que ahora pasan (sacarlos de <scratchpad>/ct_conocidos.txt):
  - probe_pagos_carrera_busqueda
  - probe_pagos_vista_carrera
  - probe_pagos_vista_incentivo_pagados
Salida completa de cada probe: <scratchpad>/ct_40b/<probe>.txt
exit=0
```

### `correr_todos.sh` del propio #41 sobre su rama

```
47ab3c45eeda2eb3e5c75449969bf76d082483f7
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       3s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      3s
probe_badge_overlap                        🟢 verde                                                      0s
probe_carta_numero_turno                   🟢 verde                                                      1s
probe_carta_selector_reunion               🟢 verde                                                      1s
probe_chapa_4medio                         🟢 verde                                                      1s
probe_cobros_caballeriza                   🟢 verde                                                      1s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       1s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      31s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      1s
probe_montas_reales                        🟢 verde                                                      2s
probe_motor_chequeo_errores                — no está en esta rama
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       5s
probe_orden_inscriptos                     🟢 verde                                                      4s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde                                                     27s
probe_pagos_vista_carrera                  🟢 verde                                                     14s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     14s
probe_portal_alta_spc_ui                   🟢 verde                                                      1s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      1s
probe_programa_null_estado                 🟢 verde                                                      1s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🟢 verde                                                     61s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_reparto_100                          🟢 verde                                                     38s
probe_rls_no_permissive                    🟢 verde                                                      0s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                       1s
probe_studbook_v2                          🟢 verde                                                      0s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       3s

Resumen: 27 verdes · 12 rojos conocidos · 0 rojos NUEVOS · 1 ausentes
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
Salida completa de cada probe: <scratchpad>/ct_41/<probe>.txt
exit=0
```

### Merges

```
$ gh pr merge 40 --merge --match-head-commit 77b4408614bf49dfb74a8a29dbb6945709c73efc
817e9e023dafb2f458890129fc6d5f6253859c68 merge: test — probes de Pagos extraen subRolDeLinea y conceptoDeLinea — PR #40
MERGED 2026-10-02T15:40:51Z
$ gh pr merge 41 --merge --match-head-commit 47ab3c45eeda2eb3e5c75449969bf76d082483f7
ade78361a16146cb73262d4bc33b95962f28b158 merge: chore — tests/correr_todos.sh + regla de correrlo antes de cada merge — PR #41
MERGED 2026-10-02T15:45:06Z
$ # md5 de CLAUDE.md servido vs git show ade78361…:CLAUDE.md
deploy ok 15:46:34 e5c046f216b56927315c4332372ace49
```

### `correr_todos.sh` sobre el #38 actualizado (corrida previa a la ventana)

```
3f7d0c0daacc73f1f4637208fcfef112f1ac180a
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       5s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      2s
probe_badge_overlap                        🟢 verde                                                      0s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      1s
probe_chapa_4medio                         🟢 verde                                                      0s
probe_cobros_caballeriza                   🟢 verde                                                      2s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      27s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      1s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      2s
probe_motor_chequeo_errores                🟢 verde                                                      0s
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       6s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde                                                     26s
probe_pagos_vista_carrera                  🟢 verde                                                     14s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     13s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      0s
probe_programa_null_estado                 🟢 verde                                                      2s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      0s
probe_recibo_una_hoja                      🟢 verde                                                     59s
probe_regex_datos_personales               🟢 verde                                                      1s
probe_reparto_100                          🟢 verde                                                     40s
probe_rls_no_permissive                    🟢 verde                                                      0s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                       1s
probe_studbook_v2                          🟢 verde                                                      1s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       2s

Resumen: 28 verdes · 12 rojos conocidos · 0 rojos NUEVOS · 0 ausentes
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
Salida completa de cada probe: <scratchpad>/ct_38/<probe>.txt
exit=0
```

### PR #42 — `probe_bolsa_efectiva --mutantes`

```

═══ MUTATION TESTING · 8/8 mutantes ═══
(copias en /tmp/mut-bolsa-O3QUrK — el repo no se toca)

✅ M1 muere — vuelve el bug: el chip del portal muestra bolsa_total crudo  [esperaba matar P1,P2,P3; murieron P1,P2,P3]
✅ M2 muere — vuelve el bug: el chip de inscripciones muestra bolsa_total crudo  [esperaba matar I1,I2,I3; murieron I1,I2,I3]
✅ M3 muere — el portal deja de pedir distribucion_premios en el select  [esperaba matar P1,P2,P3; murieron P1,P2,P3]
✅ M4 muere — inscripciones deja de pedir distribucion_premios en el select  [esperaba matar I1,I2,I3; murieron I1,I2,I3]
✅ M5 muere — el helper deja de aplicar el piso ganancia_minima  [esperaba matar H1,H2,P2,P3,I2,I3; murieron H1,H2,P2,P3,I2,I3]
✅ M6 muere — el helper suma los bonos a la bolsa (no debe)  [esperaba matar H1,H2,P2,I2; murieron H1,H2,P2,I2]
✅ M7 muere — el resto de redondeo deja de absorberse: Σ puestos ≠ total  [esperaba matar H3b; murieron H3b]
✅ M8 muere — el chip del portal se cuelga del otro chip en vez del helper  [esperaba matar P1,P2,P3; murieron P1,P2,P3]

✅ TANDA LIMPIA — 8 probados · 8 muertos

```

### PR #42 — `probe_paridad_llamado_inscripciones` (base y `--mutantes`)

```

── Probe · paridad llamado abierto ↔ encabezado de inscripciones ──
   TZ=America/Argentina/Buenos_Aires · condición larga=192 chars
 ✅ H1) el llamado imprime la hora en 24 h, sin duplicar la unidad  → fechaHora → "1/5 09:00 hs"  (esperado "1/5 09:00 hs")
 ✅ H2) sin "a. m." ni "p. m."  → "1/5 09:00 hs"
 ✅ H3) una sola vez "hs"  → "1/5 09:00 hs"
 ✅ H4) inscripciones imprime la MISMA hora que el llamado  → portal="1/5 09:00 hs" · inscripciones="1/5 09:00 hs"
 ✅ H5) el valor guardado sigue siendo 09:00 AR — sólo cambió el formato  → db=2099-05-01T12:00:00+00:00 → "1/5 09:00 hs"
 ✅ H6) medianoche sale 00:00 en las dos pantallas, no 24:00  → portal="2/5 00:00 hs" · inscripciones="2/5 00:00 hs"
 ✅ H7) el helper es idéntico en los dos archivos (ninguno se quedó atrás)
 ✅ P0) el llamado renderizó el bloque de la reunión del fixture  → container=3239 chars
 ✅ P1) el turno de condición larga tiene su fila
 ✅ P2) chip de distancia  → 1100m | tierra | 5 a 10 años | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs
 ✅ P3) el llamado SIGUE mostrando el chip de pista
 ✅ P4) el llamado YA NO muestra el chip de sexo  → 1100m | tierra | 5 a 10 años | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs
 ✅ P5) chip de rango de edad
 ✅ P6) el chip de bolsa del llamado == repartoDisplay, NO el nominal  → chip=1100m | tierra | 5 a 10 años | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs · esperado=$1.159.292,00 · nominal(prohibido)=$1.054.166,67
 ✅ P7) el número de turno está en la fila
 ✅ P8) el texto de la condición está en la fila
 ✅ P9) chip de cierre en 24 h
 ✅ P10) ni un "a. m." en todo el llamado renderizado
 ✅ Q0) onReunionChange trajo los dos turnos del fixture  → carreras=2
 ✅ Q1) el encabezado se muestra
 ✅ Q2) chip de distancia  → 1100m | tierra | 5 a 10 años | PROBE paridad | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs
 ✅ Q3) inscripciones SIGUE mostrando el chip de pista
 ✅ Q4) inscripciones YA NO muestra el chip de sexo  → 1100m | tierra | 5 a 10 años | PROBE paridad | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs
 ✅ Q5) chip de rango de edad
 ✅ Q6) el chip de bolsa de inscripciones == repartoDisplay, NO el nominal  → chip=1100m | tierra | 5 a 10 años | PROBE paridad | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs · esperado=$1.159.292,00
 ✅ Q7) chip de cierre en 24 h
 ✅ Q8) el texto de la condición está en el encabezado
 ✅ Q9) el número de turno está en el encabezado
 ✅ Q10) ni un "a. m." en el encabezado
 ✅ Y1) el chip de categoría que pidió Yesi está en inscripciones  → categoría="PROBE paridad"
 ✅ D1) los 7 campos aparecen en LAS DOS pantallas  → 7/7
 ✅ D2) la condición se arma igual en las dos (mismo separador)
 ✅ D3) el rango de edad se arma igual en las dos
 ✅ D4) la bolsa se formatea igual en las dos  → portal="$1.159.292,00" · inscripciones="$1.159.292,00"
 ✅ D6) NINGUNA de las dos muestra el sexo, y el fixture SÍ lo tiene cargado  → fixture condicion_sexo='ambos' · portal=[1100m | tierra | 5 a 10 años | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs] · insc=[1100m | tierra | 5 a 10 años | PROBE paridad | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs]
 ✅ D7) las dos SIGUEN mostrando los cuatro que Fede quiere: distancia, edad, bolsa y cierre
 ✅ D5) las dos coinciden CON EL ORÁCULO, no sólo entre sí  → oráculo=$1.159.292,00 (nominal $1.054.166,67 no debe aparecer)
 ✅ L1) el llamado muestra la condición larga COMPLETA, sin truncar  → render=192 chars · esperado=192
 ✅ L2) inscripciones muestra la condición larga COMPLETA, sin truncar  → render=192 chars · esperado=192
 ✅ L3) en el llamado la condición va en su propio bloque, no en la fila de chips
 ✅ L4) en inscripciones la condición va en su propio bloque, no en la fila de chips
 ✅ L5) el llamado: mismo número de chips con condición corta y con larga  → larga=6 · corta=6
 ✅ L6) inscripciones: mismo número de chips con condición corta y con larga  → larga=7 · corta=7
 ✅ L7) .carrera-cond declara overflow-wrap: anywhere en las dos hojas  → portal=".carrera-cond { font-size: 12px; line-height: 1.45; color: var(--muted); margin-top: 6px; overflow-wrap: anywhere; }" · inscripciones=".carrera-cond { font-size: 12px; line-height: 1.45; color: var(--muted); margin-top: 6px; overflow-wrap: anywhere; }"
 ✅ L8) el contenedor de texto puede encogerse (min-width), así el bloque crece hacia abajo
 ✅ F1) mirar el encabezado no cambia la reunión activa por otra cosa que el select  → ids=["361d896e-f26a-405d-9172-58fb8c42d306"]
 ✅ F2) ningún toast de error durante el render  → []
 ✅ F3) el gate de edad de la inscripción quedó intacto
 ✅ F4) al deseleccionar el turno el encabezado se limpia
 ✅ T1) teardown en el sandbox: no quedó ninguna reunión 9992  → quedan=0
 ✅ T2) prod: no existe ninguna reunión 9992 (el probe no escribe en prod)  → en prod=0

51/51 OK


═══ MUTATION TESTING · 17/17 mutantes ═══
(copias en /tmp/mut-paridad-llamado-wFmZbu — el repo no se toca)

✅ M1 muere — vuelve el bug: fechaHora usa toLocaleTimeString y le pega " hs"  [esperaba matar H1,H2,H5,H7; murieron H1,H2,H5,H7]
✅ M2 muere — la unidad queda duplicada ("09:00 hs hs")  [esperaba matar H1,H3; murieron H1,H3]
✅ M3 muere — inscripciones se desincroniza: fechaHora vuelve a 12 h  [esperaba matar H4,H6,H7; murieron H4,H6,H7]
✅ M4 muere — el llamado vuelve a no mostrar el texto de la condición  [esperaba matar P8,L1,L3,D1; murieron P8,L1,L3,D1]
✅ M5 muere — inscripciones vuelve a no mostrar el texto de la condición  [esperaba matar Q8,L2,L4,D1; murieron Q8,L2,L4,D1]
✅ M6 muere — el select de carreras vuelve a las cinco columnas viejas  [esperaba matar Q3,Q4,Q5,Q6,Q7,D1,D5; murieron Q3,Q5,Q6,Q7,D1,D5]
✅ M7 muere — la condición se mete adentro de la fila de chips y la estira  [esperaba matar L4; murieron L4]
✅ M8 muere — el llamado trunca la condición larga a 70 caracteres  [esperaba matar L1; murieron L1]
✅ M9 muere — inscripciones pierde el chip de cierre  [esperaba matar Q7,D1; murieron Q7,D1]
✅ M10 muere — la condición pierde overflow-wrap: una palabra larga desborda la tarjeta  [esperaba matar L7; murieron L7]
✅ M11 muere — inscripciones pierde el chip de categoría que pidió Yesi  [esperaba matar Y1; murieron Y1]
✅ M12 muere — vuelve el bug: el chip del portal muestra bolsa_total crudo  [esperaba matar P6,D1,D5; murieron P6,D1,D5]
✅ M14 muere — vuelve el chip de sexo al llamado  [esperaba matar P4,D6; murieron P4,D6]
✅ M15 muere — vuelve el chip de sexo a inscripciones  [esperaba matar Q4,D6; murieron Q4,D6]
✅ M16 muere — se va también la PISTA — perdería el dato en 49 de 49 carreras  [esperaba matar P3,D1; murieron P3,D1]
✅ M17 muere — se va también la PISTA en inscripciones  [esperaba matar Q3,D1; murieron Q3,D1]
✅ M13 muere — vuelve el bug: el chip de inscripciones muestra bolsa_total crudo  [esperaba matar Q6,D1,D5; murieron Q6,D1,D5]

✅ TANDA LIMPIA — 17 probados · 17 muertos

exit=0
```

### PR #42 — `correr_todos.sh` sobre la rama

```
09c6af738db4c4692406a50d713487d62a76a3b9
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       3s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      2s
probe_badge_overlap                        🟢 verde                                                      1s
probe_bolsa_efectiva                       🟢 verde                                                      1s
probe_carta_numero_turno                   🟢 verde                                                      1s
probe_carta_selector_reunion               🟢 verde                                                      1s
probe_chapa_4medio                         🟢 verde                                                      0s
probe_cobros_caballeriza                   🟢 verde                                                      2s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      26s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      1s
probe_montas_reales                        🟢 verde                                                      2s
probe_motor_chequeo_errores                — no está en esta rama
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       6s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde                                                     25s
probe_pagos_vista_carrera                  🟢 verde                                                     15s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     13s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      0s
probe_programa_null_estado                 🟢 verde                                                      2s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      0s
probe_recibo_una_hoja                      🟢 verde                                                     60s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_reparto_100                          🟢 verde                                                     38s
probe_rls_no_permissive                    🟢 verde                                                      0s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                       1s
probe_studbook_v2                          🟢 verde                                                      1s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       2s

Resumen: 28 verdes · 12 rojos conocidos · 0 rojos NUEVOS · 1 ausentes
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
Salida completa de cada probe: <scratchpad>/ct_sbx/<probe>.txt
exit=0
$ docker exec sgh-local-pg psql -U postgres -d sgh -tAc "select (select count(*) from reuniones), (select count(*) from hipodromos), (select count(*) from categorias_carrera)"
1|0|0
```

## Nota posterior (16:51 UTC, después de un corte de sesión)

Este informe quedó commiteado pero **sin pushear** cuando se cortó la sesión; se publica ahora. La tarea programada de las 20:07
(`3736b947`) **murió con la sesión** (era sólo de memoria): no corrió. Los merges de #37 y #38 se hacen en la sesión siguiente, con la
confirmación de que la operadora de Pagos ya no está trabajando (ver `2026-10-02_correr-todos-pre-merge-37-38-42.md`).
