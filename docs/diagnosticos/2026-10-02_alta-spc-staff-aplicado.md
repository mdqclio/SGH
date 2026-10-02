# #50 — alta de SPC desde el modal "Inscribir SPC" de la secretaría: aplicado y mergeado

- Fecha: 2026-10-02
- Guards: pwd `/home/clio/dev/SGH`; proyecto `unlhcuanfrtpatoipwve`; club Dolores = 1 fila (verificado antes de cada escritura).
- Propuesta y decisiones: `2026-10-02_inscripciones-alta-spc-studbook-fase1.md`.

> En las salidas crudas de los probes, los uuid de fixtures (borrados en el teardown) van recortados a sus primeros 8 caracteres: el chequeo de datos personales
> confunde sus segmentos numéricos con teléfonos.

## Conclusión

Quedó completo, en dos ventanas sin actividad del usuario de inscripciones (`a1c490f5-81ee-4d9f-acb7-d2123e99e7d3`):

| paso | cuándo (UTC) | evidencia |
|---|---|---|
| migración `rpc_spc_alta_studbook_staff` | 21:36 | versión `20261002213637`; `md5(pg_get_functiondef)` = `aa39e36a72f6a802700ef42acd1e2221` = sandbox; v1 antes = `704f4762eb9ce373aecd4be9abdd0a78`; `fn_spcs_alta_revision` sin cambios (`cd33a7683698ccf0704683e678bdc623`) |
| Edge Function `studbook-buscar` v3 | 21:38 | `verify_jwt` true; el contenido desplegado coincide con `supabase/functions/studbook-buscar/index.ts` de la rama |
| e2e de staff con el HTML de la rama | ~21:47 | `probe_inscripciones_alta_spc_prod` 13/13 |
| regresión del portal | ~21:49 | `probe_portal_alta_spc_prod` 14/14; `probe_studbook_buscar_e2e` 13/13 |
| merge del HTML | 22:38:34 | `9473a71`; a 60 min 13 s de la última actividad del usuario (21:38:09) y sin actividad de nadie más |
| deploy | 22:39:19 | md5 de `inscripciones.html` servido = el del merge (`8dce59821a615462ab58e00016c7ddaf`) |
| e2e contra el HTML servido | ~22:42 | staff 13/13 y portal 14/14 |

La ventana anterior se cerró a las 21:38:09, cuando el usuario aprobó una solicitud de portal: el registro `3916d94a-7faa-4d0b-859a-c23af77250d6`, de rol
profesional. Para entonces ya estaban aplicadas la migración y la Edge Function, y ninguna de las dos cambia lo que ve la pantalla: hasta el merge,
el modal servido no tenía el botón. El HTML esperó a la ventana siguiente.

**Hallazgo — el Stud Book está lento e intermitente.** Hoy tardó entre 16,9 y 18,5 s por búsqueda (medido con una sesión de staff real), y en una
corrida la Edge Function devolvió 502 `studbook_no_disponible`, mientras un `traer` directo segundos después funcionó. Los dos e2e
(staff y portal) esperaban 25 s y fallaban por tiempo, no por código. Las esperas pasaron a 60 s. La pantalla ya maneja el 502 ("El Stud Book
no responde ahora. Cargalo a mano"). Pregunta abierta: ¿vale la pena un indicador de progreso más visible en el modal? Hoy dice "Consultando el Stud Book…" durante ~17 s.

Las corridas fallidas del e2e de staff (por tiempo) igual crearon y borraron su ficha fixture: R1/R2 dieron restore limpio y spcs antes = después (258 → 258) en todas.

## correr_todos.sh antes del merge (checkout principal, HEAD separado en la rama = 47a0798)

```
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       4s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       4s
probe_aviso_jockey_repetido                🟢 verde                                                      3s
probe_badge_overlap                        🟢 verde                                                      0s
probe_bolsa_efectiva                       🟢 verde                                                      1s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      0s
probe_chapa_4medio                         🟢 verde                                                      1s
probe_cobros_caballeriza                   🟢 verde                                                      2s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=2)                                       1s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      12s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      1s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_inscripciones_alta_studbook          🟢 verde                                                      5s
probe_inscripciones_listado                🟢 verde                                                      2s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      2s
probe_motor_chequeo_errores                🟢 verde                                                      1s
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       6s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde                                                      8s
probe_pagos_vista_carrera                  🟢 verde                                                     12s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     14s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      0s
probe_programa_null_estado                 🟢 verde                                                      2s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      0s
probe_recibo_una_hoja                      🟢 verde                                                     39s
probe_regex_datos_personales               🟢 verde                                                      1s
probe_resultados_front_cerrada             🟢 verde                                                      1s
probe_reparto_100                          🟢 verde                                                     38s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                       8s
probe_studbook_v2                          🟢 verde                                                      0s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       3s
probe_v_inscriptos_cerrada                 🟢 verde                                                      1s

Resumen: 33 verdes · 12 rojos conocidos · 0 rojos NUEVOS · 0 ausentes
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

## e2e de staff contra el HTML servido (salida completa)

```
✅ H) el inscripciones.html tiene el alta desde el Stud Book (traerYUsarStaff / buscarEnStudBookStaff)  → https://sigh.com.ar/inscripciones.html
✅ S1) TROMPETERO no está en el padrón → "Sin resultados en el padrón" + "Buscar «TROMPETERO» en el Stud Book"  → Sin resultados en el padrón🔎 Buscar «TROMPETERO» en el Stud Book
✅ S2) studbook-buscar real (sesión staff) devuelve el candidato SB 128894 con "Es este — traerlo"  → Stud Book — elegí el caballoTROMPETEROmacho · nac. 01/12/1987 · Alazan · El Troyano × Excentric · SB 128894Es este — traerloAl traerlo queda cargado en Stud Book (SPCs) con los datos del Stud Book. Después completá caballeriza y jockey y guardá la inscripción.
✅ S3) ficha nueva: TROMPETERO, alta_origen secretaria, alta_por = operador, NO pendiente, activa  → {"id":"e22c8a9f…","nombre":"TROMPETERO","studbook_id":"128894","alta_origen":"secretaria","alta_por":"d68877b4…","revision_pendiente":false,"revision_motivos":["edad > 12 (112 años según el Stud Book)"],"estado":"activo","notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde Inscripciones por Probe STAFF murjpe4c 02/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"}
✅ S4) motivo "edad > 12" informativo en revision_motivos y notas "alta desde Inscripciones por Probe STAFF"  → [["edad > 12 (112 años según el Stud Book)"],"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde Inscripciones por Probe STAFF murjpe4c 02/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"]
✅ S5) queda seleccionada en el modal (f-spc-id = ficha) y el aviso muestra el motivo  → [["warning","TROMPETERO quedó cargado desde el Stud Book. Completá caballeriza y jockey y guardá. ⚠ Revisá la ficha en Stud Book (SPCs): edad > 12 (112 años según el Stud Book)"]]
✅ S6) spcs +1 exacto
✅ S7) Guardar inscribe la ficha nueva en el turno, con la caballeriza elegida  → [{"id":"6fe862d8…","estado":"inscripto","caballeriza_id":"bd41a150…","spc_id":"e22c8a9f…"},["ok","SPC inscripto"]]
✅ S8) auditoría del INSERT en spcs con alta_por = operador  → [{"accion":"INSERT","datos_despues":{"id":"e22c8a9f…","sexo":"macho","color":"Alazan","notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde Inscripciones por Probe STAFF murjpe4c 02/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)","estado":"activo","marcas":null,"nombre":"TROMPETERO","club_id":null,"doc_url":null,"alta_por":"d68877b4…","foto_url":null,"created_at":"2026-10-02T22:40:11.926851+00:00","updated_at":"2026-10-02T22:40:11.926851+00:00","alta_origen":"secretaria","pais_origen":"Argentina","revisado_at":null,"studbook_id":"128894","madre_nombre":"Excentric","revisado_por":null,"entrenador_id":null,"abuela_materna":null,"caballeriza_id":null,"padrillo_nombre":"El Troyano","fecha_nacimiento":"1987-12-01","revision_motivos":["edad > 12 (112 años según el Stud Book)"],"ult_performances":null,"certificado_correr":false,"jockey_habitual_id":null,"registro_stud_book":null,"revision_pendiente":false}}]
✅ D1) segundo traer: ya_existia, mismo spc_id, spcs no crece  → [{"ok":true,"spc_id":"e22c8a9f…","ya_existia":true,"revision_motivos":null,"nombre":"TROMPETERO"},null]
✅ E) sin errores de JS en la página
✅ R1) restore: 0 filas del run (reunión, inscripciones, TROMPETERO, usuario, auth, caballeriza, auditoría)  → {"reuniones_9983":0,"inscripciones":0,"trompetero":0,"usuarios":0,"caballerizas":0,"auditoria_del_run":0,"auth":0}
✅ R2) spcs antes = después (ninguna alta real)  → 258 → 258

13/13 asserts OK
```

## e2e del portal (regresión, HTML servido)

```
✅ H) el portal.html servido tiene el flujo nuevo (traerYAnotar / botonStudBookPortal)  → https://sigh.com.ar/portal.html
✅ N1) BIEN COQUETA aparece en el buscador del padrón con "Anotar"  → BIEN COQUETA
        
          hembra
          5 años · 15/10/2021
          SB 429819
          Bien Terminado × Gritty
          
          
        
      
      Anotar
    ¿No es ninguno de esto
✅ N2) inscripción normal en prod: canal portal, inscripto_por = usuario, caballeriza/entrenador declarados  → {"id":"ddce7a17…","canal":"portal","inscripto_por":"9f22f58c…","estado":"inscripto","caballeriza_id":"c0d16810…","entrenador_id":"a91306e3…"}
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
✅ T3) ficha nueva: TROMPETERO, portal, alta_por = usuario, pendiente, activo, club/entrenador NULL  → {"id":"39fb239e…","nombre":"TROMPETERO","studbook_id":"128894","alta_origen":"portal","alta_por":"9f22f58c…","revision_pendiente":true,"revision_motivos":["edad > 12 (112 años según el Stud Book)"],"estado":"activo","club_id":null,"entrenador_id":null,"notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde el portal por Probe ALTA murjr1zx 02/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"}
✅ T4) motivo "edad > 12" en revision_motivos (no en notas) y notas con "alta desde el portal por Probe ALTA"  → [["edad > 12 (112 años según el Stud Book)"],"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde el portal por Probe ALTA murjr1zx 02/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"]
✅ T5) inscripción de la nueva de corrido: canal portal, inscripto_por = usuario  → {"id":"54f23a9f…","canal":"portal","inscripto_por":"9f22f58c…","estado":"inscripto","caballeriza_id":"c0d16810…","entrenador_id":"a91306e3…"}
✅ T6) spcs +1 exacto durante la prueba
✅ T7) auditoría del INSERT en spcs con alta_por  → [{"accion":"INSERT","datos_despues":{"id":"39fb239e…","sexo":"macho","color":"Alazan","notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde el portal por Probe ALTA murjr1zx 02/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)","estado":"activo","marcas":null,"nombre":"TROMPETERO","club_id":null,"doc_url":null,"alta_por":"9f22f58c…","foto_url":null,"created_at":"2026-10-02T22:41:34.798331+00:00","updated_at":"2026-10-02T22:41:34.798331+00:00","alta_origen":"portal","pais_origen":"Argentina","revisado_at":null,"studbook_id":"128894","madre_nombre":"Excentric","revisado_por":null,"entrenador_id":null,"abuela_materna":null,"caballeriza_id":null,"padrillo_nombre":"El Troyano","fecha_nacimiento":"1987-12-01","revision_motivos":["edad > 12 (112 años según el Stud Book)"],"ult_performances":null,"certificado_correr":false,"jockey_habitual_id":null,"registro_stud_book":null,"revision_pendiente":true}}]
✅ E) sin errores de JS en la página
✅ R1) restore: 0 filas del run (reunión, inscripciones, TROMPETERO, usuario, auth, profesional, caballeriza, auditoría)  → {"reuniones_9984":0,"inscripciones":0,"trompetero":0,"usuarios":0,"profesionales":0,"caballerizas":0,"auditoria_del_run":0,"auth":0}
✅ R2) spcs antes = después (ninguna alta real)  → 258 → 258

14/14 asserts OK
```

## e2e de staff con el HTML de la rama, antes del merge (la corrida verde)

```
✅ H) el inscripciones.html tiene el alta desde el Stud Book (traerYUsarStaff / buscarEnStudBookStaff)  → inscripciones.html
✅ S1) TROMPETERO no está en el padrón → "Sin resultados en el padrón" + "Buscar «TROMPETERO» en el Stud Book"  → Sin resultados en el padrón🔎 Buscar «TROMPETERO» en el Stud Book
✅ S2) studbook-buscar real (sesión staff) devuelve el candidato SB 128894 con "Es este — traerlo"  → Stud Book — elegí el caballoTROMPETEROmacho · nac. 01/12/1987 · Alazan · El Troyano × Excentric · SB 128894Es este — traerloAl traerlo queda cargado en Stud Book (SPCs) con los datos del Stud Book. Después completá caballeriza y jockey y guardá la inscripción.
✅ S3) ficha nueva: TROMPETERO, alta_origen secretaria, alta_por = operador, NO pendiente, activa  → {"id":"cae592d8…","nombre":"TROMPETERO","studbook_id":"128894","alta_origen":"secretaria","alta_por":"830d350d…","revision_pendiente":false,"revision_motivos":["edad > 12 (112 años según el Stud Book)"],"estado":"activo","notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde Inscripciones por Probe STAFF murhqb9b 02/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"}
✅ S4) motivo "edad > 12" informativo en revision_motivos y notas "alta desde Inscripciones por Probe STAFF"  → [["edad > 12 (112 años según el Stud Book)"],"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde Inscripciones por Probe STAFF murhqb9b 02/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"]
✅ S5) queda seleccionada en el modal (f-spc-id = ficha) y el aviso muestra el motivo  → [["warning","TROMPETERO quedó cargado desde el Stud Book. Completá caballeriza y jockey y guardá. ⚠ Revisá la ficha en Stud Book (SPCs): edad > 12 (112 años según el Stud Book)"]]
✅ S6) spcs +1 exacto
✅ S7) Guardar inscribe la ficha nueva en el turno, con la caballeriza elegida  → [{"id":"f6f3966d…","estado":"inscripto","caballeriza_id":"96dbd4ae…","spc_id":"cae592d8…"},["ok","SPC inscripto"]]
✅ S8) auditoría del INSERT en spcs con alta_por = operador  → [{"accion":"INSERT","datos_despues":{"id":"cae592d8…","sexo":"macho","color":"Alazan","notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde Inscripciones por Probe STAFF murhqb9b 02/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)","estado":"activo","marcas":null,"nombre":"TROMPETERO","club_id":null,"doc_url":null,"alta_por":"830d350d…","foto_url":null,"created_at":"2026-10-02T21:45:15.314937+00:00","updated_at":"2026-10-02T21:45:15.314937+00:00","alta_origen":"secretaria","pais_origen":"Argentina","revisado_at":null,"studbook_id":"128894","madre_nombre":"Excentric","revisado_por":null,"entrenador_id":null,"abuela_materna":null,"caballeriza_id":null,"padrillo_nombre":"El Troyano","fecha_nacimiento":"1987-12-01","revision_motivos":["edad > 12 (112 años según el Stud Book)"],"ult_performances":null,"certificado_correr":false,"jockey_habitual_id":null,"registro_stud_book":null,"revision_pendiente":false}}]
✅ D1) segundo traer: ya_existia, mismo spc_id, spcs no crece  → [{"ok":true,"spc_id":"cae592d8…","ya_existia":true,"revision_motivos":null,"nombre":"TROMPETERO"},null]
✅ E) sin errores de JS en la página
✅ R1) restore: 0 filas del run (reunión, inscripciones, TROMPETERO, usuario, auth, caballeriza, auditoría)  → {"reuniones_9983":0,"inscripciones":0,"trompetero":0,"usuarios":0,"caballerizas":0,"auditoria_del_run":0,"auth":0}
✅ R2) spcs antes = después (ninguna alta real)  → 258 → 258

13/13 asserts OK
```

## Consultas

```sql
select md5(pg_get_functiondef('public.rpc_spc_alta_studbook_portal'::regproc));   -- aa39e36a72f6a802700ef42acd1e2221 (22:32 UTC, sigue igual)
select version, name from supabase_migrations.schema_migrations order by version desc limit 2;
-- 20261002213637 rpc_spc_alta_studbook_staff
-- 20261002193945 cerrar_v_inscriptos_carrera
```
