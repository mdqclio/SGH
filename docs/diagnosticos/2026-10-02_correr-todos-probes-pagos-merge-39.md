# Probes de Pagos (PR #40) · `tests/correr_todos.sh` + regla (PR #41) · merge del PR #39

- **Fecha**: 2026-10-02
- **`main`**: `2e98974884e2b02ef78de2f9b664955049682873` (merge del #39)
- **Guards**: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` ✅ · clubs Dolores por uuid ✅.

## Resumen

| # | Pedido | Estado |
|---|---|---|
| 1 | Arreglar los probes de Pagos (extraer `subRolDeLinea`), PR aparte | ✅ **PR #40** (`fix/probes-pagos-subrol`, `094b7fdf958e50920ea269b22198fe1fed88fef0`), sin mergear |
| 2 | `tests/correr_todos.sh` + regla en CLAUDE.md | ✅ **PR #41** (`chore/correr-todos-probes`, `ddbb5b16141fb28976bcda6ad50584d8f8b0e475`), sin mergear |
| 3 | Mergear el PR #39 | ✅ **MERGED** 2026-10-02T15:28:33Z, merge `2e98974884e2b02ef78de2f9b664955049682873`. Antes: `correr_todos.sh` sobre su rama → **0 rojos nuevos** |

### 1. PR #40 — probes de Pagos

Eran **tres**, no dos: `probe_pagos_vista_carrera`, `probe_pagos_vista_incentivo_pagados` y `probe_pagos_carrera_busqueda`. Los tres
reventaban con `ReferenceError: subRolDeLinea is not defined` y, arreglado eso, con `conceptoDeLinea`: desde el reparto al 100 % (25/09)
`rolDeLinea` y la vista usan las dos. Se agregó la extracción de ambas. Resultado (solo lectura contra prod): **25/25 · 7/7**,
**27/27 · 17/17**, **41/41 · 8/8**. Con el probe roto, `--mutantes` decía "7/7 muertos" igual: los mutantes morían por el crash, no por un
assert. Ahora cada mutante muere por 1 a 11 asserts.

### 2. PR #41 — `tests/correr_todos.sh`

- **Lista explícita de 40 probes** que sólo leen prod, corren en memoria, con jsdom o con Chromium. Se eligieron leyendo cada probe:
  el encabezado no alcanza. `probe_bolsa_efectiva` y `probe_paridad_llamado_inscripciones` **crean y borran reuniones fixture en prod**
  y quedaron afuera (ver § Incidente). Excluidos, con el motivo en el script: escriben en prod, sólo sandbox, mandan mails, necesitan
  login real (`alineado_browser`, `badge_overlap_browser`: `SGH_EMAIL`/`SGH_PASSWORD`), no son probes.
- Salida por probe: 🟢 verde · 🟠 rojo conocido · 🔴 rojo NUEVO · "no está en esta rama". Sale con 1 si hay un rojo nuevo. Avisa cuando un
  conocido pasa a verde. Env: `REPO`, `CONOCIDOS`, `SALIDA`, `TIEMPO`.
- **Se corre en el checkout principal**: `probe_cuerpos_oficial` lee `tmp/` (gitignored). En un worktree daba rojo por eso.
- `tests/correr_todos.rojos_conocidos`: **15 rojos** con motivo (16 sobre `main` de esta mañana; `probe_reparto_100` salió al mergear
  #39). Tres los arregla #40.
- **Regla en CLAUDE.md** (§ Probes de regresión): antes de cada merge a `main` se corre y el resumen va en el informe; los conocidos se
  listan y no bloquean; un rojo nuevo bloquea (se arregla o se explica y se pide OK, no se lo agrega a la lista para destrabar); un
  conocido que pasa a verde sale de la lista en el mismo PR; probes nuevos de solo lectura se suman al script.

Los 15 rojos conocidos (motivo de cada uno en la salida de abajo): 8 drift de extracción o de ancla del HTML, 3 drift de datos (R6 C3
provisional desde el 14/08; R9 con anuladas y sorteo; `spcs` = 205 histórico), 2 fuente externa (el Stud Book responde 403 desde este
servidor), 1 márgenes de página del programa color, y los 3 de Pagos que arregla #40. **Ninguno se investigó a fondo**: son preexistentes.

### 3. Merge del #39

Corrida de `correr_todos.sh` en el checkout principal parado en `fix/probe-reparto-p2-p5-sintetico` (`517aba5e…`): **24 verdes · 15
conocidos · 0 nuevos**; `probe_reparto_100` pasó a verde (era conocido). Merge con `--match-head-commit`. Sólo toca `tests/` y CLAUDE.md:
no cambia nada que use Valeria, por eso no esperó a la ventana de la noche.

### Ventana de las 20:07 (#37 y #38)

La tarea programada se **rehízo** (`795335d6`, misma hora) para cumplir la regla nueva: antes de mergear corre el probe del motor y
`correr_todos.sh` (con el script y la lista de #41 si todavía no está mergeado) y no mergea si aparece un rojo nuevo; además mira la
última renovación de sesión del usuario operador y los recibos de la última hora. Sigue siendo una tarea de esta sesión: si se cierra,
no corre.

## Incidente: dos probes que corrí como "solo lectura" crean reuniones en prod

Hoy al mediodía (verificación del PR #36, ~12:14 UTC) corrí `probe_bolsa_efectiva` y `probe_paridad_llamado_inscripciones`
pensando que eran de solo lectura, y lo puse así en la descripción del PR #36 ("Sin regresión (solo lectura / sin red)"); la salida está
en el anexo de `2026-10-02_reports-local-divergida.md`. **No lo son**: crean una reunión fixture (`numero` 9990 y 9992, fecha 2099,
estado **`publicada`**) con carreras, y las borran en el `finally`. Verificado después: **no quedó ninguna** (la única reunión con
`numero >= 9000` es la 9999). Mientras duró cada corrida (segundos), esas reuniones eran visibles en el llamado abierto del portal
(reunión `publicada` con fecha futura). Además van contra la regla de CLAUDE.md "un probe no crea entidades raíz en prod". Queda
anotado; no se corrigieron esos probes (fuera de alcance). **Pregunta**: ¿se pasan a la 9999 o al sandbox?

```sql
select id, numero, fecha, estado, es_prueba, created_at from reuniones where created_at > now() - interval '1 day' or numero >= 9000 order by created_at desc;
```
```
<id de la 9999, ver CLAUDE.md> | 9999 | 2099-01-01 | cancelada | true | 2026-06-10 02:31:52.392179+00   (el id va resumido: su grupo de ceros cae en el chequeo de datos personales)
```

## Preguntas abiertas

1. ¿Los dos probes que crean reuniones en prod se pasan a la 9999 o al sandbox?
2. Los 15 rojos conocidos: ¿se arreglan de a uno (PR chicos) o quedan como están?

## Salida cruda

### `correr_todos.sh` sobre `main` (054d70b…, antes del merge de #39), con la lista de #41

```
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       2s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      3s
probe_badge_overlap                        🟢 verde                                                      0s
probe_carta_numero_turno                   🟢 verde                                                      2s
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
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      2s
probe_motor_chequeo_errores                — no está en esta rama
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       6s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟠 rojo CONOCIDO (rc=1)                                       8s
probe_pagos_vista_carrera                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_pagos_vista_incentivo_pagados        🟠 rojo CONOCIDO (rc=1)                                       3s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      0s
probe_programa_null_estado                 🟢 verde                                                      2s
probe_programa_r8_imprenta                 🟢 verde                                                      1s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🟢 verde                                                     59s
probe_regex_datos_personales               🟢 verde                                                      1s
probe_reparto_100                          🟠 rojo CONOCIDO (rc=1)                                      39s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       1s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_v2                          🟢 verde                                                      0s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       2s

Resumen: 23 verdes · 16 rojos conocidos · 0 rojos NUEVOS · 1 ausentes
Rojos conocidos (no bloquean):
  - probe_activacion_pendiente          drift del probe: su stub de sb no tiene .select() después de update().eq() (TypeError)
  - probe_alineado_programa             drift: el check de márgenes de página (10mm 8mm) del programa color no coincide — el CSS de impresión cambió desde que se escribió (motivo reescrito después, sin arroba)
  - probe_apuestas_especiales           drift: 9 checks de tarjetas (cantidad, número, nombre, rango) no coinciden con la pantalla actual
  - probe_cuerpos_oficial               drift de datos: espera 8 carreras oficiales en R6 y hay 7 (C3 está provisional desde el 14/08)
  - probe_edad_display                  drift: no encuentra el ancla de fin del bloque de edad en el HTML
  - probe_edad_reglamentaria            2/32: el Stud Book no devuelve dato para los ejemplares de R9 (fuente externa; ver studbook_buscar_fn)
  - probe_forfait_anulada               drift de extracción: ReferenceError renumerarChapas
  - probe_orden_carreras                drift de datos: 2/18 asumen R9 con 0 anuladas y sin sortear (R9 ya tiene anuladas y sorteo)
  - probe_pagos_carrera_busqueda        drift de extracción: ReferenceError subRolDeLinea (arreglado en PR #40)
  - probe_pagos_vista_carrera           drift de extracción: ReferenceError subRolDeLinea (arreglado en PR #40)
  - probe_pagos_vista_incentivo_pagados drift de extracción: ReferenceError subRolDeLinea (arreglado en PR #40)
  - probe_portal_carta                  drift: no encuentra loadCarta en portal.html (hoy se llama loadLlamado)
  - probe_reparto_100                   P2/P5 esperan las 69 sub-líneas de R9, que ya nacieron el 25/09 (arreglado en PR #39)
  - probe_spcs_r9_tanda_1               evidencia histórica: asserta count(spcs) = 205 (hoy 239)
  - probe_studbook_buscar_fn            fuente externa: el Stud Book responde HTTP 403 a las búsquedas desde este servidor
  - probe_tapa_flyer                    drift de extracción: ReferenceError edadSPC
Salida completa de cada probe: <scratchpad>/ct_main/<probe>.txt
exit=0
```

### `correr_todos.sh` sobre la rama del #39 (primera línea: SHA del checkout)

```
517aba5e172adc2e81811ca6d65b5f35a025f8ac
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       3s
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
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      25s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       1s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      3s
probe_motor_chequeo_errores                — no está en esta rama
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       5s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟠 rojo CONOCIDO (rc=1)                                       8s
probe_pagos_vista_carrera                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_pagos_vista_incentivo_pagados        🟠 rojo CONOCIDO (rc=1)                                       4s
probe_portal_alta_spc_ui                   🟢 verde                                                      1s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       1s
probe_portal_validacion                    🟢 verde                                                      0s
probe_programa_null_estado                 🟢 verde                                                      1s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🟢 verde                                                     59s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_reparto_100                          🟢 verde (estaba en rojos conocidos: sacarlo de la lista)    39s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       1s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                       1s
probe_studbook_v2                          🟢 verde                                                      1s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       2s

Resumen: 24 verdes · 15 rojos conocidos · 0 rojos NUEVOS · 1 ausentes
Rojos conocidos (no bloquean):
  - probe_activacion_pendiente          drift del probe: su stub de sb no tiene .select() después de update().eq() (TypeError)
  - probe_alineado_programa             drift: el check de márgenes de página (10mm 8mm) del programa color no coincide — el CSS de impresión cambió desde que se escribió (motivo reescrito después, sin arroba)
  - probe_apuestas_especiales           drift: 9 checks de tarjetas (cantidad, número, nombre, rango) no coinciden con la pantalla actual
  - probe_cuerpos_oficial               drift de datos: espera 8 carreras oficiales en R6 y hay 7 (C3 está provisional desde el 14/08)
  - probe_edad_display                  drift: no encuentra el ancla de fin del bloque de edad en el HTML
  - probe_edad_reglamentaria            2/32: el Stud Book no devuelve dato para los ejemplares de R9 (fuente externa; ver studbook_buscar_fn)
  - probe_forfait_anulada               drift de extracción: ReferenceError renumerarChapas
  - probe_orden_carreras                drift de datos: 2/18 asumen R9 con 0 anuladas y sin sortear (R9 ya tiene anuladas y sorteo)
  - probe_pagos_carrera_busqueda        drift de extracción: ReferenceError subRolDeLinea (arreglado en PR #40)
  - probe_pagos_vista_carrera           drift de extracción: ReferenceError subRolDeLinea (arreglado en PR #40)
  - probe_pagos_vista_incentivo_pagados drift de extracción: ReferenceError subRolDeLinea (arreglado en PR #40)
  - probe_portal_carta                  drift: no encuentra loadCarta en portal.html (hoy se llama loadLlamado)
  - probe_spcs_r9_tanda_1               evidencia histórica: asserta count(spcs) = 205 (hoy 239)
  - probe_studbook_buscar_fn            fuente externa: el Stud Book responde HTTP 403 a las búsquedas desde este servidor
  - probe_tapa_flyer                    drift de extracción: ReferenceError edadSPC
Conocidos que ahora pasan (sacarlos de <scratchpad>/ct_conocidos.txt):
  - probe_reparto_100
Salida completa de cada probe: <scratchpad>/ct_39/<probe>.txt
exit=0
```

### Deploy del #39

```
$ # md5 de CLAUDE.md servido por sigh.com.ar vs git show 2e98974…:CLAUDE.md (esperando al CDN)
2e300d4f351591f5111062e1020ff2a6  local_claude.md
2e300d4f351591f5111062e1020ff2a6  sigh.com.ar/CLAUDE.md (15:29:25 UTC)
```

### Merge del #39

```
$ gh pr view 39 --json state,mergeable,headRefOid --jq '.state+" "+.mergeable+" "+.headRefOid'
OPEN MERGEABLE 517aba5e172adc2e81811ca6d65b5f35a025f8ac
$ gh pr merge 39 --merge --match-head-commit 517aba5e172adc2e81811ca6d65b5f35a025f8ac --subject "merge: test — probe_reparto_100 P2/P5 a escenario sintético (S10/S11) — PR #39"
$ git pull --ff-only origin main && git log -1 --format='%H %s'
2e98974884e2b02ef78de2f9b664955049682873 merge: test — probe_reparto_100 P2/P5 a escenario sintético (S10/S11) — PR #39
$ gh pr view 39 --json state,mergedAt --jq '.state+" "+.mergedAt'
MERGED 2026-10-02T15:28:33Z
```

## Verificación de push

Chequeo de datos personales sobre lo agregado: 1 coincidencia en la primera pasada (el id de la 9999 en la salida de la query del
incidente), reescrita; segunda pasada **0**.

```
$ git push -q origin HEAD:reports && git ls-remote origin reports && git rev-parse HEAD
3f6f84b371e03829a04bc12341e0b2e5a2f9ed06	refs/heads/reports
3f6f84b371e03829a04bc12341e0b2e5a2f9ed06
```

Este anexo va en un commit posterior; su SHA es el tip de `origin/reports`.
