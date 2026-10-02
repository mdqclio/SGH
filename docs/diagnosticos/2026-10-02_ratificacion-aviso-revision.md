# #48 — ratificación: aviso al ratificar un SPC pendiente de revisión

- Fecha: 2026-10-02
- Rama: `feat/ratificacion-aviso-revision` en `2a85584` (al día con `main`). Merge: `5b823cb`, a las 22:45 UTC.
- Ventana: la última actividad del usuario de inscripciones fue a las 21:38:09 UTC. A las 22:45:05 seguía sin actividad suya ni de nadie más.
- Guards: pwd `/home/clio/dev/SGH`; club Dolores = 1 fila. No toca la base.

## Qué hace

- **Badge en la fila.** Un SPC con `spcs.revision_pendiente = true` (alta desde el portal todavía sin revisar) muestra **"⚠ Por revisar"** al lado del nombre,
  con los motivos (`revision_motivos`) en el tooltip.
- **Confirmación al ratificar.** "✅ Ratificar" pregunta: "<caballo> está pendiente de revisión en Stud Book (SPCs). Motivo: …. ¿Ratificar igual?".
  - Si se cancela, no se escribe nada.
  - Si se acepta, ratifica como siempre.
  - Sin motivos cargados, dice "alta desde el portal".
- **Es aviso, no bloqueo.** Conservador: la revisión sigue en SPCs y no se le saca la decisión a la secretaría.
- **De paso:** el nombre del SPC y los motivos de esa celda se escapan con `escape-html.js` (ISSUE-018), porque los nombres que vienen del portal los cargan terceros.

Dato de hoy: 1 SPC pendiente de revisión (alta del portal) con inscripción a una reunión futura.

```sql
select s.revision_pendiente, s.alta_origen, count(*) n,
 count(*) filter (where exists (select 1 from inscripciones i join carreras c on c.id=i.carrera_id join reuniones r on r.id=c.reunion_id
   where i.spc_id=s.id and r.fecha >= current_date and i.estado in ('inscripto','ratificado'))) con_insc_futura
from spcs s group by 1,2 order by 1,2;
-- false | secretaria | 257 | 117
-- true  | portal     |   1 |   1
```

Fuera de alcance, queda como pregunta abierta: el select de estado del modal de `inscripciones.html` también deja pasar una inscripción a `ratificado`, y ahí no
hay aviso. ¿Lo sumamos?

## Probe (jsdom + sb stub, datos sintéticos)

### Rama, con mutantes
```
✅ A1) pendiente: badge "⚠ Por revisar" con los motivos en el title
✅ A2) normal: sin badge
✅ A3) nombre y motivo hostiles se muestran como texto (sin <img>/<b> creados, sin ejecutar)
✅ B1) pendiente + Cancelar → se pregunta y no se escribe nada
✅ B2) pendiente + Aceptar → update a ratificado; el mensaje nombra caballo y motivo
✅ B3) normal → sin confirmación, update
✅ B4) pendiente sin motivos → "alta desde el portal"
✅ C1) init pide revision_pendiente y revision_motivos de spcs
✅ E) sin errores de JS

9/9 checks OK

── mutantes ──
💀 muere MU1 sin confirmación al ratificar
💀 muere MU2 sin badge en la fila
💀 muere MU3 init no pide las columnas de revisión
💀 muere MU4 nombre sin escapar
💀 muere MU5 motivos sin escapar en el title
💀 muere MU6 confirma siempre (también los revisados)
💀 muere MU7 sin el texto por defecto
mutantes: 7/7 muertos
```

### Contra main previo (ratificacion.html de c28d8be, sin el cambio)
```
❌ A1) pendiente: badge "⚠ Por revisar" con los motivos en el title
✅ A2) normal: sin badge
❌ A3) nombre y motivo hostiles se muestran como texto (sin <img>/<b> creados, sin ejecutar)  → 
        <td class="num-part print-hide"></td>
        <td><div class="spc-name"><img src="x" onerror="window.__pwn=1"></div></td>
        <td style="font-size:12px;color:var(--muted)">—</td>
        <td class="jockey-cell"><select class="jockey-select" data-insc="i4" onchange="onJockeyChange(this)"
❌ B1) pendiente + Cancelar → se pregunta y no se escribe nada  → [0,1]
❌ B2) pendiente + Aceptar → update a ratificado; el mensaje nombra caballo y motivo  → [[],[["update",[{"estado":"ratificado","peso_final":null}]],["eq",["id","i1"]]]]
✅ B3) normal → sin confirmación, update
❌ B4) pendiente sin motivos → "alta desde el portal"  → []
❌ C1) init pide revision_pendiente y revision_motivos de spcs  → id,nombre
✅ E) sin errores de JS

3/9 checks OK
```

### Contra el HTML servido después del deploy

`curl -s https://sigh.com.ar/ratificacion.html | RATIFICACION_HTML=/dev/stdin node tests/probe_ratificacion_aviso_revision.mjs` → `9/9 checks OK`.
El md5 del servido es igual al del merge: `b76cfd948088484b9f0894d88d9728d3`, servido a las 22:46:06 UTC.

## correr_todos.sh antes del merge (checkout principal, HEAD separado en 2a85584)

```
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       3s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      2s
probe_badge_overlap                        🟢 verde                                                      0s
probe_bolsa_efectiva                       🟢 verde                                                      1s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      0s
probe_chapa_4medio                         🟢 verde                                                      1s
probe_cobros_caballeriza                   🟢 verde                                                      1s
probe_condicion_sexo_r9                    🟢 verde                                                      4s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=2)                                       1s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      11s
probe_fmtinput_onblur                      🟢 verde                                                      1s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_inscripciones_alta_studbook          🟢 verde                                                      6s
probe_inscripciones_listado                🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      1s
probe_montas_reales                        🟢 verde                                                      2s
probe_motor_chequeo_errores                🟢 verde                                                      0s
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       7s
probe_orden_inscriptos                     🟢 verde                                                      2s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde                                                      6s
probe_pagos_vista_carrera                  🟢 verde                                                     14s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     13s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      0s
probe_programa_null_estado                 🟢 verde                                                      1s
probe_programa_r8_imprenta                 🟢 verde                                                      1s
probe_ratificacion_aviso_revision          🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      0s
probe_recibo_una_hoja                      🟢 verde                                                     40s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_resultados_front_cerrada             🟢 verde                                                      1s
probe_reparto_100                          🟢 verde                                                     38s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       1s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_v2                          🟢 verde                                                      0s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       2s
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

## Verificación de push

```
$ git ls-remote origin reports
c87a1677a3874d47c7931fcf9c61ce47ed95d71f
$ git rev-parse HEAD
c87a1677a3874d47c7931fcf9c61ce47ed95d71f
```
Chequeo de datos personales sobre lo agregado: vacío.
