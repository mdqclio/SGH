# Pasos 1 y 2 (03/10) — aviso de revisión en el modal de Inscripciones + indicador de progreso del Stud Book

- Fecha: 2026-10-03
- PR #53, rama `feat/aviso-revision-modal-y-progreso-studbook` en `8d137f0`. Merge `281e738` a las 14:01 UTC.
- Ventana: sin actividad de staff desde el 02/10 a las 21:38:09 UTC; consultado a las 14:01:26 UTC del 03/10.
- Guards: pwd `/home/clio/dev/SGH`; club Dolores = 1 fila. No toca la base.

## 1. Aviso en el select de estado del modal de Inscripciones

- **Disparo.** Elegir **"Ratificado"** con un SPC que tiene `spcs.revision_pendiente = true` lee el SPC y pide `confirm()` con **el mismo texto** que
  `ratificacion.html`, carácter por carácter, porque ahora sale de una sola función (`textoConfirmarRatificarRevision`, en `revision-pendiente.js`):
  `"<caballo> está pendiente de revisión en Stud Book (SPCs).\nMotivo: <motivos | alta desde el portal>.\n\n¿Ratificar igual?"`
- **Cancelar** devuelve el select al estado anterior.
- **Aceptar** deja "ratificado" y Guardar no vuelve a preguntar por ese SPC.
- **Re-chequeo al guardar.** Si después de aceptar se cambia el SPC por otro pendiente, Guardar pregunta por el nuevo. Si se cancela, no escribe.
- **Ya ratificada.** Editar una inscripción que ya estaba ratificada no pregunta: no es "pasar a" ratificado.
- **Error.** Si falla la lectura del SPC, se muestra el error y el select no queda en "ratificado". Esa es la opción conservadora.
- **Ratificación.** `ratificacion.html` pasa a usar el mismo JS. El comportamiento no cambia (10/10).

## 2. Indicador de progreso del Stud Book

`studbook-progreso.js` reemplaza el texto suelto "Consultando el Stud Book…", que con ~17 s de espera parecía colgado. Muestra:
- spinner, segundos transcurridos y una barra que avanza hacia ~20 s (nunca llega sola al 100 %);
- la nota "El Stud Book suele tardar unos 20 segundos. No cierres esta ventana.";
- `role="status"` y `aria-live="polite"`.

Se corta al responder. El nombre del caballo ("Trayendo X del Stud Book") va escapado.

Está en:
- `inscripciones.html`: buscar y traer;
- `portal.html`: buscar y traer;
- `spcs.html`: buscar.

## Verificación

| qué | resultado |
|---|---|
| `probe_aviso_revision_modal_y_progreso` (nuevo; jsdom + stub, sintético) | 21/21, 14/14 mutantes |
| `probe_ratificacion_aviso_revision` (muta también el JS compartido) | 10/10, 8/8 |
| `probe_inscripciones_alta_studbook` (MU8 con ancla nueva) | 19/19, 11/11 |
| `correr_todos.sh` | 35 verdes, 12 conocidos, 0 nuevos |
| deploy (md5 servido = merge) | los 6 archivos, 14:02:18 UTC |
| e2e contra lo servido: staff (Stud Book real) | 13/13 |
| e2e contra lo servido: portal (Stud Book real) | 14/14 |

```
inscripciones.html servido = 0ceb7002ef41df7617f921e1d3304733
ratificacion.html servido = 11b52406ca44e6784c985834239a0675
portal.html servido = 54e09965911ecdc5c31ba41ae71229ab
spcs.html servido = a9c24bd062d4bdcb98660b99a7983c68
revision-pendiente.js servido = 57b834b450cf600d814c854b8f2d0296
studbook-progreso.js servido = 609801da5e9753d9e0f1a4f33736f659
```

## Salidas

### probe_aviso_revision_modal_y_progreso --mutantes
```
✅ R1) elegir "ratificado" con SPC pendiente → confirm con el texto compartido, exacto
✅ R2a) cancelar → el select vuelve a "inscripto"
✅ R2b) Guardar después de cancelar no escribe "ratificado"
✅ R3) aceptar → queda ratificado; Guardar no vuelve a preguntar e inserta estado ratificado
✅ R4) SPC no pendiente → sin confirm
✅ R5) editar una inscripción ya ratificada → sin confirm
✅ R6) aceptado por un SPC pendiente y después se cambia a OTRO pendiente → Guardar pregunta por el nuevo y cancelar no escribe
✅ R7) falla la consulta del SPC → error en pantalla y el select no queda en ratificado
✅ R8) sin motivos → "Motivo: alta desde el portal."
✅ P1a) indicador visible (role=status) con segundos que avanzan, barra > 0 y "suele tardar"
✅ P1b) al responder, el indicador desaparece
✅ P2a) indicador visible (role=status) con segundos que avanzan, barra > 0 y "suele tardar"
✅ P2b) al responder, el indicador desaparece
✅ P2c) el nombre hostil no inyecta nada
✅ P3a) indicador visible (role=status) con segundos que avanzan, barra > 0 y "suele tardar"
✅ P3b) al responder, el indicador desaparece
✅ P3ta) indicador visible (role=status) con segundos que avanzan, barra > 0 y "suele tardar"
✅ P3tb) al responder, el indicador desaparece
✅ P4a) indicador visible (role=status) con segundos que avanzan, barra > 0 y "suele tardar"
✅ P4b) al responder, el indicador desaparece
✅ P5) inscripciones/portal/spcs cargan studbook-progreso.js; inscripciones/ratificacion cargan revision-pendiente.js

21/21 checks OK

── mutantes ──
💀 muere MU1 el select no avisa  (R1,R2a,R2b,R3,R6,R7,R8)
💀 muere MU2 cancelar no revierte el select  (R2a,R2b,R7)
💀 muere MU3 Guardar no vuelve a chequear  (R6)
💀 muere MU4 avisa aunque ya estuviera ratificada  (R5)
💀 muere MU5 no recuerda lo aceptado (pregunta dos veces)  (R3)
💀 muere MU6 el aviso aceptado vale para cualquier SPC  (R6)
💀 muere MU7 error de la consulta se traga  (R7)
💀 muere MU8 texto distinto en el modal  (R1,R3,R6,R8)
💀 muere MU9 inscripciones sin indicador (texto suelto)  (P1a)
💀 muere MU10 el contador no avanza  (P1a,P2a,P3a,P3ta,P4a)
💀 muere MU11 nombre sin escapar en el indicador  (P2a,P3ta)
💀 muere MU12 portal sin indicador  (P3a)
💀 muere MU13 spcs sin indicador  (P4a)
💀 muere MU14 sin "alta desde el portal" por defecto  (R8)
mutantes: 14/14 muertos
```

### probe_ratificacion_aviso_revision --mutantes
```
✅ A1) pendiente: badge "⚠ Por revisar" con los motivos en el title
✅ A2) normal: sin badge
✅ A3) nombre y motivo hostiles se muestran como texto (sin <img>/<b> creados, sin ejecutar)
✅ B1) pendiente + Cancelar → se pregunta y no se escribe nada
✅ B2) pendiente + Aceptar → update a ratificado; el mensaje nombra caballo y motivo
✅ B3) normal → sin confirmación, update
✅ B4) pendiente sin motivos → "alta desde el portal"
✅ C1) init pide revision_pendiente y revision_motivos de spcs
✅ C2) carga revision-pendiente.js (el texto del aviso es el mismo que en inscripciones.html)
✅ E) sin errores de JS

10/10 checks OK

── mutantes ──
💀 muere MU1 sin confirmación al ratificar
💀 muere MU2 sin badge en la fila
💀 muere MU3 init no pide las columnas de revisión
💀 muere MU4 nombre sin escapar
💀 muere MU5 motivos sin escapar en el title
💀 muere MU6 confirma siempre (también los revisados)
💀 muere MU7 sin el texto por defecto (revision-pendiente.js)
💀 muere MU8 texto del confirm distinto (revision-pendiente.js)
mutantes: 8/8 muertos
```

### probe_inscripciones_alta_studbook --mutantes
```
✅ I1 sin resultados en el padrón → "🔎 Buscar «WAVE» en el Stud Book"
✅ I1 con resultados en el padrón → la opción del Stud Book también está, al pie
✅ I1 con 2 letras → sin opción del Stud Book
✅ I2 la opción llama studbook-buscar con {term: "WAVE"}
✅ I2 pregunta al padrón por studbook_id de los candidatos
✅ I2 nombre hostil escapado (no se crea el <img>, no corre el onerror)
✅ I2 el que está en el padrón (SB 111) → "usarlo"; el otro → "traerlo"
✅ I3 "usarlo" NO llama a traer; queda seleccionado con su caballeriza; candidatos limpios
✅ I4 traer manda SÓLO {accion, sb_id, nombre, carrera_id} con el turno elegido
✅ I4 el caballo traído queda seleccionado en el modal
✅ I4 no inscribe solo (ningún INSERT en inscripciones todavía)
✅ I4 aviso de éxito
✅ I11 guardar → INSERT en inscripciones con el spc_id traído y el turno elegido
✅ I5 motivos → aviso (warning) después de crear, con el motivo
✅ I6 traer rechazado → el mensaje de la RPC en pantalla y nada seleccionado
✅ I7 Stud Book caído → "El Stud Book no responde ahora…"
✅ I9 abrir el modal limpia los candidatos
✅ I8 editando: traer usa el turno de la FILA, no el del select
✅ I10 alta sin turno → "Seleccionar un turno" y NO llama a traer

19/19 asserts OK

── mutantes ──
✅ muere MU1 el navegador manda la ficha entera  ← I4
✅ muere MU2 candidatos sin escapar  ← I2
✅ muere MU3 sin opción del Stud Book cuando hay resultados  ← I1
✅ muere MU4 sin chequeo de padrón por studbook_id  ← I2, I3
✅ muere MU5 traer siempre con el turno del select  ← I8
✅ muere MU6 sin aviso de motivos  ← I5
✅ muere MU7 abrir el modal no limpia candidatos  ← I9
✅ muere MU8 sin chequeo de turno antes de traer  ← I10
✅ muere MU9 error de traer sin mensaje  ← I6
✅ muere MU10 traer no selecciona el caballo  ← I4, I11, I5
✅ muere MU11 Stud Book caído con mensaje genérico  ← I7

mutantes: 11/11 muertos
```

### e2e de staff contra lo servido
```
✅ H) el inscripciones.html tiene el alta desde el Stud Book (traerYUsarStaff / buscarEnStudBookStaff)  → https://sigh.com.ar/inscripciones.html
✅ S1) TROMPETERO no está en el padrón → "Sin resultados en el padrón" + "Buscar «TROMPETERO» en el Stud Book"  → Sin resultados en el padrón🔎 Buscar «TROMPETERO» en el Stud Book
✅ S2) studbook-buscar real (sesión staff) devuelve el candidato SB 128894 con "Es este — traerlo"  → Stud Book — elegí el caballoTROMPETEROmacho · nac. 01/12/1987 · Alazan · El Troyano × Excentric · SB 128894Es este — traerloAl traerlo queda cargado en Stud Book (SPCs) con los datos del Stud Book. Después completá caballeriza y jockey y guardá la inscripción.
✅ S3) ficha nueva: TROMPETERO, alta_origen secretaria, alta_por = operador, NO pendiente, activa  → {"id":"cd2b2468…","nombre":"TROMPETERO","studbook_id":"128894","alta_origen":"secretaria","alta_por":"462a55fb…","revision_pendiente":false,"revision_motivos":["edad > 12 (112 años según el Stud Book)"],"estado":"activo","notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde Inscripciones por Probe STAFF musgoe1h 03/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"}
✅ S4) motivo "edad > 12" informativo en revision_motivos y notas "alta desde Inscripciones por Probe STAFF"  → [["edad > 12 (112 años según el Stud Book)"],"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde Inscripciones por Probe STAFF musgoe1h 03/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"]
✅ S5) queda seleccionada en el modal (f-spc-id = ficha) y el aviso muestra el motivo  → [["warning","TROMPETERO quedó cargado desde el Stud Book. Completá caballeriza y jockey y guardá. ⚠ Revisá la ficha en Stud Book (SPCs): edad > 12 (112 años según el Stud Book)"]]
✅ S6) spcs +1 exacto
✅ S7) Guardar inscribe la ficha nueva en el turno, con la caballeriza elegida  → [{"id":"7bfda506…","estado":"inscripto","caballeriza_id":"2c00bfbc…","spc_id":"cd2b2468…"},["ok","SPC inscripto"]]
✅ S8) auditoría del INSERT en spcs con alta_por = operador  → [{"accion":"INSERT","datos_despues":{"id":"cd2b2468…","sexo":"macho","color":"Alazan","notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde Inscripciones por Probe STAFF musgoe1h 03/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)","estado":"activo","marcas":null,"nombre":"TROMPETERO","club_id":null,"doc_url":null,"alta_por":"462a55fb…","foto_url":null,"created_at":"2026-10-03T14:02:36.443935+00:00","updated_at":"2026-10-03T14:02:36.443935+00:00","alta_origen":"secretaria","pais_origen":"Argentina","revisado_at":null,"studbook_id":"128894","madre_nombre":"Excentric","revisado_por":null,"entrenador_id":null,"abuela_materna":null,"caballeriza_id":null,"padrillo_nombre":"El Troyano","fecha_nacimiento":"1987-12-01","revision_motivos":["edad > 12 (112 años según el Stud Book)"],"ult_performances":null,"certificado_correr":false,"jockey_habitual_id":null,"registro_stud_book":null,"revision_pendiente":false}}]
✅ D1) segundo traer: ya_existia, mismo spc_id, spcs no crece  → [{"ok":true,"spc_id":"cd2b2468…","ya_existia":true,"revision_motivos":null,"nombre":"TROMPETERO"},null]
✅ E) sin errores de JS en la página
✅ R1) restore: 0 filas del run (reunión, inscripciones, TROMPETERO, usuario, auth, caballeriza, auditoría)  → {"reuniones_9983":0,"inscripciones":0,"trompetero":0,"usuarios":0,"caballerizas":0,"auditoria_del_run":0,"auth":0}
✅ R2) spcs antes = después (ninguna alta real)  → 258 → 258

13/13 asserts OK
```

### e2e del portal contra lo servido
```
✅ H) el portal.html servido tiene el flujo nuevo (traerYAnotar / botonStudBookPortal)  → https://sigh.com.ar/portal.html
✅ N1) BIEN COQUETA aparece en el buscador del padrón con "Anotar"  → BIEN COQUETA
        
          hembra
          5 años · 15/10/2021
          SB 429819
          Bien Terminado × Gritty
          
          
        
      
      Anotar
    ¿No es ninguno de esto
✅ N2) inscripción normal en prod: canal portal, inscripto_por = usuario, caballeriza/entrenador declarados  → {"id":"c55044ac…","canal":"portal","inscripto_por":"ece3d453…","estado":"inscripto","caballeriza_id":"095b5472…","entrenador_id":"adcad64b…"}
✅ N3) la ficha del padrón no se tocó (secretaria, sin revisión)  → {"alta_origen":"secretaria","revision_pendiente":false}
✅ T1) TROMPETERO no está en el padrón → botón "Buscar «TROMPETERO» en el Stud Book"  → Ningún caballo del padrón coincide con esa búsqueda.
           Si el ejemplar existe, buscalo en el Stud Book y anotalo desde acá:
           🔎 Buscar «TROMPETERO» en el Stud Book
           Si tamp
✅ T2) la función real devuelve el candidato (SB 128894) con "Es este — anotarlo"  → Stud Book — elegí el caballo
        
          TROMPETERO
          
            macho
            39 años · 01/12/1987
            Alazan
            El Troyano × Excentric
            SB 128894
          
        
        Es este — anotarlo
      
        Al anotarlo, el caballo queda cargado con
✅ T3) ficha nueva: TROMPETERO, portal, alta_por = usuario, pendiente, activo, club/entrenador NULL  → {"id":"6f488495…","nombre":"TROMPETERO","studbook_id":"128894","alta_origen":"portal","alta_por":"ece3d453…","revision_pendiente":true,"revision_motivos":["edad > 12 (112 años según el Stud Book)"],"estado":"activo","club_id":null,"entrenador_id":null,"notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde el portal por Probe ALTA musgovcu 03/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"}
✅ T4) motivo "edad > 12" en revision_motivos (no en notas) y notas con "alta desde el portal por Probe ALTA"  → [["edad > 12 (112 años según el Stud Book)"],"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde el portal por Probe ALTA musgovcu 03/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"]
✅ T5) inscripción de la nueva de corrido: canal portal, inscripto_por = usuario  → {"id":"‹uuid›","canal":"portal","inscripto_por":"ece3d453…","estado":"inscripto","caballeriza_id":"095b5472…","entrenador_id":"adcad64b…"}
✅ T6) spcs +1 exacto durante la prueba
✅ T7) auditoría del INSERT en spcs con alta_por  → [{"accion":"INSERT","datos_despues":{"id":"6f488495…","sexo":"macho","color":"Alazan","notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde el portal por Probe ALTA musgovcu 03/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)","estado":"activo","marcas":null,"nombre":"TROMPETERO","club_id":null,"doc_url":null,"alta_por":"ece3d453…","foto_url":null,"created_at":"2026-10-03T14:03:33.032296+00:00","updated_at":"2026-10-03T14:03:33.032296+00:00","alta_origen":"portal","pais_origen":"Argentina","revisado_at":null,"studbook_id":"128894","madre_nombre":"Excentric","revisado_por":null,"entrenador_id":null,"abuela_materna":null,"caballeriza_id":null,"padrillo_nombre":"El Troyano","fecha_nacimiento":"1987-12-01","revision_motivos":["edad > 12 (112 años según el Stud Book)"],"ult_performances":null,"certificado_correr":false,"jockey_habitual_id":null,"registro_stud_book":null,"revision_pendiente":true}}]
✅ E) sin errores de JS en la página
✅ R1) restore: 0 filas del run (reunión, inscripciones, TROMPETERO, usuario, auth, profesional, caballeriza, auditoría)  → {"reuniones_9984":0,"inscripciones":0,"trompetero":0,"usuarios":0,"profesionales":0,"caballerizas":0,"auditoria_del_run":0,"auth":0}
✅ R2) spcs antes = después (ninguna alta real)  → 258 → 258

14/14 asserts OK
```

### correr_todos.sh (HEAD separado en la rama)
```
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       4s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       5s
probe_aviso_jockey_repetido                🟢 verde                                                      3s
probe_aviso_revision_modal_y_progreso      🟢 verde                                                     14s
probe_badge_overlap                        🟢 verde                                                      0s
probe_bolsa_efectiva                       🟢 verde                                                      1s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      2s
probe_chapa_4medio                         🟢 verde                                                      0s
probe_cobros_caballeriza                   🟢 verde                                                      2s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=2)                                       2s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      35s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       1s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_inscripciones_alta_studbook          🟢 verde                                                      6s
probe_inscripciones_listado                🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      3s
probe_motor_chequeo_errores                🟢 verde                                                      0s
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       7s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde                                                      8s
probe_pagos_vista_carrera                  🟢 verde                                                     14s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     14s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      0s
probe_programa_null_estado                 🟢 verde                                                      2s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_ratificacion_aviso_revision          🟢 verde                                                      1s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🟢 verde                                                     40s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_resultados_front_cerrada             🟢 verde                                                      1s
probe_reparto_100                          🟢 verde                                                     54s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                       8s
probe_studbook_v2                          🟢 verde                                                      0s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       3s
probe_v_inscriptos_cerrada                 🟢 verde                                                      1s

Resumen: 35 verdes · 12 rojos conocidos · 0 rojos NUEVOS · 0 ausentes
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
