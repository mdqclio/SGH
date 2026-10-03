# Paso 4 (03/10) — `probe_xss_portal_nombres` al día con `usuarios.html` (drift del 27/09)

- Fecha: 2026-10-03
- PR #52, rama `fix/probe-xss-usuarios-drift`, merge `0f96fff`. Sólo tests: no cambia ninguna pantalla ni la base.
- Guards: pwd `/home/clio/dev/SGH`; club Dolores = 1 fila. El probe escribe en la 9999 (5 usuarios y 5 inscripciones de fixture) y la restaura por estado.

## Causa

El 02/10, después del apply de ISSUE-099, el probe dio 53/58. La causa es `846b7b6` (27/09, una hora después de la última versión del probe):
`usuarios.html` dejó de mostrar "Editar" a los usuarios del portal (`puedeEditar = !esPortal(u) && puedeModificar(u)`), y las acciones pasaron
a depender del rol del que mira. El probe ubicaba la fila por el botón "Editar" y no la encontraba (U2), y no tenía `currentUser`, así que
tampoco había ningún otro botón.

## Cambio

- **U2:** la fila se ubica por `tr[data-id]`.
- **Rol:** la página corre como super_admin (`currentUser = { rol: 'super_admin' }`), el único que ve acciones sobre usuarios del portal.
- **U6 nuevo:**
  - el usuario del portal **no** tiene "Editar";
  - tiene un solo "Activar";
  - el `onclick` es exactamente `toggleActivo('<id>',true)`, sólo el id, así que el nombre hostil no entra al JS inline.
  - Antes U6 abría el modal de edición, que para el portal ya no existe.
- **M2** usaba `git show main:` como versión "pre-fix", pero `main` ya tiene el fix, así que dejó de ser un mutante. Queda fijado a `067722257009d464291a5e1392c41115dc724fb2^`.
- **M4 nuevo:** el portal vuelve a tener "Editar". Muere en U6.

## Resultado

82/82 y 4/4 mutantes. `correr_todos.sh` sobre la rama: 34 verdes, 12 rojos conocidos, 0 nuevos. Este probe escribe en prod y no está en la suite.

### Salida del probe con mutantes

En la salida, los emails de los fixtures (dominio de prueba, borrados en el teardown) van como `‹email›`.

```
fixture: tag=32699f11 · barridos de corridas anteriores=0
fixture: 5 usuarios + 5 inscripciones portal en 9999 T3
✅ U0) usuarios.html load() corre
✅ U1) usuarios.html: 0 elementos inyectados en la lista
✅ U2.simple) fila renderizada
✅ U3.simple) nombre tal cual
✅ U4.simple) email tal cual
✅ U5.simple) teléfono tal cual
✅ U6.simple) sin "Editar" y un solo Activar/Desactivar con onclick = sólo el id
✅ U7.simple) nada se ejecutó
✅ U2.doble) fila renderizada
✅ U3.doble) nombre tal cual
✅ U4.doble) email tal cual
✅ U6.doble) sin "Editar" y un solo Activar/Desactivar con onclick = sólo el id
✅ U7.doble) nada se ejecutó
✅ U2.script) fila renderizada
✅ U3.script) nombre tal cual
✅ U4.script) email tal cual
✅ U5.script) teléfono tal cual
✅ U6.script) sin "Editar" y un solo Activar/Desactivar con onclick = sólo el id
✅ U7.script) nada se ejecutó
✅ U2.amp) fila renderizada
✅ U3.amp) nombre tal cual
✅ U4.amp) email tal cual
✅ U5.amp) teléfono tal cual
✅ U6.amp) sin "Editar" y un solo Activar/Desactivar con onclick = sólo el id
✅ U7.amp) nada se ejecutó
✅ U2.delia) fila renderizada
✅ U3.delia) nombre tal cual
✅ U4.delia) email tal cual
✅ U5.delia) teléfono tal cual
✅ U6.delia) sin "Editar" y un solo Activar/Desactivar con onclick = sólo el id
✅ U7.delia) nada se ejecutó
✅ A0) admin.html loadPendientes() corre
✅ A1) admin.html: 0 elementos inyectados en pendientes
✅ A2.simple) fila renderizada
✅ A3.simple) nombre y email tal cual
✅ A4.simple.Aprobar) pregunta por ESE nombre
✅ A5.simple.Aprobar) nada se ejecutó
✅ A4.simple.Rechazar) pregunta por ESE nombre
✅ A5.simple.Rechazar) nada se ejecutó
✅ A2.doble) fila renderizada
✅ A3.doble) nombre y email tal cual
✅ A4.doble.Aprobar) pregunta por ESE nombre
✅ A5.doble.Aprobar) nada se ejecutó
✅ A4.doble.Rechazar) pregunta por ESE nombre
✅ A5.doble.Rechazar) nada se ejecutó
✅ A2.script) fila renderizada
✅ A3.script) nombre y email tal cual
✅ A4.script.Aprobar) pregunta por ESE nombre
✅ A5.script.Aprobar) nada se ejecutó
✅ A4.script.Rechazar) pregunta por ESE nombre
✅ A5.script.Rechazar) nada se ejecutó
✅ A2.amp) fila renderizada
✅ A3.amp) nombre y email tal cual
✅ A4.amp.Aprobar) pregunta por ESE nombre
✅ A5.amp.Aprobar) nada se ejecutó
✅ A4.amp.Rechazar) pregunta por ESE nombre
✅ A5.amp.Rechazar) nada se ejecutó
✅ A2.delia) fila renderizada
✅ A3.delia) nombre y email tal cual
✅ A4.delia.Aprobar) pregunta por ESE nombre
✅ A5.delia.Aprobar) nada se ejecutó
✅ A4.delia.Rechazar) pregunta por ESE nombre
✅ A5.delia.Rechazar) nada se ejecutó
✅ I0) inscripciones.html loadInscripciones() corre
✅ I1) inscripciones.html: 0 elementos inyectados en la lista
✅ I2) se renderizan todas las filas de T3
✅ I3.simple) fila renderizada
✅ I4.simple) "Cargada por" = Portal + nombre tal cual
✅ I3.doble) fila renderizada
✅ I4.doble) "Cargada por" = Portal + nombre tal cual
✅ I3.script) fila renderizada
✅ I4.script) "Cargada por" = Portal + nombre tal cual
✅ I3.amp) fila renderizada
✅ I4.amp) "Cargada por" = Portal + nombre tal cual
✅ I3.delia) fila renderizada
✅ I4.delia) "Cargada por" = Portal + nombre tal cual
✅ I5) nada se ejecutó
✅ S1.usuarios.html) carga escape-html.js
✅ S1.admin.html) carga escape-html.js
✅ S1.inscripciones.html) carga escape-html.js
✅ S2) usuarios.html: Editar no serializa el objeto al atributo
✅ S3) admin.html: Aprobar/Rechazar pasan sólo el id

SUITE: 82/82
💀 muere M1 escape-html.js = identidad — 12/82 asserts en rojo:
     ❌ U1) usuarios.html: 0 elementos inyectados en la lista  ← inyectados=4
     ❌ U3.script) nombre tal cual  ← "window.__pwn=1"
     ❌ U4.script) email tal cual  ← ["📞 11","‹email›"]
     ❌ U5.script) teléfono tal cual  ← ["📞 11","‹email›"]
     ❌ U3.amp) nombre tal cual  ← "Tom & Jerry \"});window.__pwn=2;//');window.__pwn=3;//"
     ❌ U5.amp) teléfono tal cual  ← ["📞 & 11","‹email›"]
     ❌ A1) admin.html: 0 elementos inyectados en pendientes  ← inyectados=3
     ❌ A3.script) nombre y email tal cual  ← ["window.__pwn=1","‹email›"]
     ❌ A3.amp) nombre y email tal cual  ← ["Tom & Jerry \"});window.__pwn=2;//');window.__pwn=3;//","‹email›"]
     ❌ I1) inscripciones.html: 0 elementos inyectados en la lista  ← inyectados=2
     ❌ I4.script) "Cargada por" = Portal + nombre tal cual  ← "window.__pwn=1"
     ❌ I4.amp) "Cargada por" = Portal + nombre tal cual  ← "Tom & Jerry \"});window.__pwn=2;//');window.__pwn=3;//"
💀 muere M2 usuarios/admin/inscripciones antes del fix (067722257009d464291a5e1392c41115dc724fb2^) — 25/58 asserts en rojo:
     ❌ U1) usuarios.html: 0 elementos inyectados en la lista  ← inyectados=4
     ❌ U2.simple) fila renderizada  ← 
     ❌ U2.doble) fila renderizada  ← 
     ❌ U2.script) fila renderizada  ← 
     ❌ U2.amp) fila renderizada  ← 
     ❌ U2.delia) fila renderizada  ← 
     ❌ A1) admin.html: 0 elementos inyectados en pendientes  ← inyectados=3
     ❌ A4.doble.Aprobar) pregunta por ESE nombre  ← []
     ❌ A4.doble.Rechazar) pregunta por ESE nombre  ← []
     ❌ A3.script) nombre y email tal cual  ← ["window.__pwn=1","‹email›"]
     ❌ A4.script.Aprobar) pregunta por ESE nombre  ← []
     ❌ A4.script.Rechazar) pregunta por ESE nombre  ← []
     ❌ A3.amp) nombre y email tal cual  ← ["Tom & Jerry \"});window.__pwn=2;//');window.__pwn=3;//","‹email›"]
     ❌ A4.amp.Aprobar) pregunta por ESE nombre  ← ["¿Aprobar el registro de \"Tom & Jerry \"});window.__pwn=2;//\"?"]
     ❌ A5.amp.Aprobar) nada se ejecutó  ← __pwn=3
     ❌ A4.amp.Rechazar) pregunta por ESE nombre  ← ["¿Rechazar el registro de \"Tom & Jerry \"});window.__pwn=2;//\"? Esta acción lo marcará como rechazado."]
     ❌ A5.amp.Rechazar) nada se ejecutó  ← __pwn=3
     ❌ I1) inscripciones.html: 0 elementos inyectados en la lista  ← inyectados=2
     ❌ I4.script) "Cargada por" = Portal + nombre tal cual  ← "window.__pwn=1"
     ❌ I4.amp) "Cargada por" = Portal + nombre tal cual  ← "Tom & Jerry \"});window.__pwn=2;//');window.__pwn=3;//"
     ❌ S1.usuarios.html) carga escape-html.js  ← 
     ❌ S1.admin.html) carga escape-html.js  ← 
     ❌ S1.inscripciones.html) carga escape-html.js  ← 
     ❌ S2) usuarios.html: Editar no serializa el objeto al atributo  ← 
     ❌ S3) admin.html: Aprobar/Rechazar pasan sólo el id  ← 
💀 muere M3 usuarios.html sin <script src="escape-html.js"> — 7/58 asserts en rojo:
     ❌ U0) usuarios.html load() corre  ← escapeHtml is not defined
     ❌ U2.simple) fila renderizada  ← 
     ❌ U2.doble) fila renderizada  ← 
     ❌ U2.script) fila renderizada  ← 
     ❌ U2.amp) fila renderizada  ← 
     ❌ U2.delia) fila renderizada  ← 
     ❌ S1.usuarios.html) carga escape-html.js  ← 
💀 muere M4 usuarios.html: el portal vuelve a tener "Editar" (pre 846b7b6) — 5/82 asserts en rojo:
     ❌ U6.simple) sin "Editar" y un solo Activar/Desactivar con onclick = sólo el id  ← [["✏️ Editar","openEdit('de6c3df3…')"],["Activar","toggleActivo('de6c3df3…',true)"]]
     ❌ U6.doble) sin "Editar" y un solo Activar/Desactivar con onclick = sólo el id  ← [["✏️ Editar","openEdit('5e5a717e…')"],["Activar","toggleActivo('5e5a717e…',true)"]]
     ❌ U6.script) sin "Editar" y un solo Activar/Desactivar con onclick = sólo el id  ← [["✏️ Editar","openEdit('4397a2d2…')"],["Activar","toggleActivo('4397a2d2…',true)"]]
     ❌ U6.amp) sin "Editar" y un solo Activar/Desactivar con onclick = sólo el id  ← [["✏️ Editar","openEdit('dfeb41f9…')"],["Activar","toggleActivo('dfeb41f9…',true)"]]
     ❌ U6.delia) sin "Editar" y un solo Activar/Desactivar con onclick = sólo el id  ← [["✏️ Editar","openEdit('9ce82799…')"],["Activar","toggleActivo('9ce82799…',true)"]]
MUTANTES: 4/4 muertos
✅ Z) limpieza por estado: usuarios probe.xss=0 · inscripciones del probe=0 · 9999 mismas inscripciones (ids)=true (17)
```

## correr_todos.sh (HEAD separado en la rama)

```
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       5s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      3s
probe_badge_overlap                        🟢 verde                                                      1s
probe_bolsa_efectiva                       🟢 verde                                                      1s
probe_carta_numero_turno                   🟢 verde                                                      3s
probe_carta_selector_reunion               🟢 verde                                                      1s
probe_chapa_4medio                         🟢 verde                                                      0s
probe_cobros_caballeriza                   🟢 verde                                                      4s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=2)                                       3s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      12s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_inscripciones_alta_studbook          🟢 verde                                                      6s
probe_inscripciones_listado                🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      4s
probe_motor_chequeo_errores                🟢 verde                                                      0s
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       8s
probe_orden_inscriptos                     🟢 verde                                                      4s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde                                                      7s
probe_pagos_vista_carrera                  🟢 verde                                                     15s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     15s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      1s
probe_programa_null_estado                 🟢 verde                                                      1s
probe_programa_r8_imprenta                 🟢 verde                                                      3s
probe_ratificacion_aviso_revision          🟢 verde                                                      1s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🟢 verde                                                     39s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_resultados_front_cerrada             🟢 verde                                                      2s
probe_reparto_100                          🟢 verde                                                     42s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                      11s
probe_studbook_v2                          🟢 verde                                                      0s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       3s
probe_v_inscriptos_cerrada                 🟢 verde                                                      1s

Resumen: 34 verdes · 12 rojos conocidos · 0 rojos NUEVOS · 0 ausentes
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
