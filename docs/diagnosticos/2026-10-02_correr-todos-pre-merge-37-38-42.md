# Paso 1 — `correr_todos.sh` antes de mergear #37, #38 y #42: rojo nuevo en `main`, se paró

- **Fecha**: 2026-10-02, ~17:20 UTC (14:20 ART)
- **`main`**: `ade78361a16146cb73262d4bc33b95962f28b158`
- **Guards**: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` (MCP `get_project_url`) ✅ · `SELECT nombre FROM clubs WHERE id =
  '0649e9c5-9e87-4aad-842f-101458e6b33c'` → `Hipódromo de Dolores` ✅
- **Anonimizado**: el jockey del caso va como `<J07>` (mismo token que el informe del 24/09 anonimizado); sin nombres de personas.

## Resultado

**Se paró en la primera corrida, la de `main` (base): 25 verdes · 12 conocidos · 2 rojos NUEVOS.** Las corridas de #37, #38 y #42 no
llegaron a correr, y **no se mergeó nada**. Los pasos 2 a 5 quedan sin ejecutar (ver § Estado de los otros pasos).

| Probe | Assert que falla | Estaba |
|---|---|---|
| `probe_pagos_vista_carrera` | 3e) `<J07>`: en la carrera 1 (dueña) el incentivo está con importe y "se paga una sola vez" | verde a las 15:40 UTC (#40) |
| `probe_pagos_vista_incentivo_pagados` | 2) `<J07>`: incentivo pagable en UNA sola carrera, la 1 → con importe en: — (en ninguna) | verde a las 15:40 UTC (#40) |

## Causa: un dato de R9 cambió hoy, no el código

Los dos asserts usan como caso real el incentivo de jockey de R9 de `<J07>`, que estaba **impago**. **Hoy a las 13:07 ART se pagó por
transferencia** (recibo N.º 74). Ya no es pagable, así que la vista por carrera no lo muestra con importe en ninguna carrera — que es
justamente lo que la pantalla tiene que hacer con algo pagado. El código de Pagos no cambió (`main` es el mismo del merge del #41).

Además: la línea cuyo id usaba el informe del 24/09 (`5690c007-89c1-4aa0-88ed-01ec06443234`) **ya no existe** — el recálculo de R9 del 25/09
la regeneró con otro id (`79ad9dec-dae1-41a4-8d82-e424e5a96de4`). Los probes no dependen del id (buscan por jockey), por eso no fallaron antes.

**Recibos emitidos hoy** (los primeros por transferencia de la historia de la base):

| Recibo | Hora (ART) | Forma de pago | Conceptos | Total |
|---|---|---|---|---|
| 72 | 12:57 | transferencia | actuación (peón/capataz/sereno) | $10.120,00 |
| 73 | 13:03 | transferencia | actuación | $8.000,00 |
| 74 | 13:07 | transferencia | incentivo de jockey (`<J07>`) | $60.000,00 |
| 75 | 13:10 | transferencia | actuación | $8.000,00 |
| 76 | 13:17 | transferencia | premio | $70.000,00 |
| 77 | 13:19 | transferencia | actuación | $8.000,00 |
| 78 | 13:23 | transferencia | incentivo de entrenador | $10.000,00 |

Esto corrige, para después de las 12:45 ART, el informe `2026-10-02_transferencias-30-09-pagos.md` (que a esa hora decía, bien, que no había
recibos desde el 30/09): **las transferencias se registraron entre las 12:57 y las 13:23 ART**, todas de R9 y ninguna de premios de 1°/2° retenidos.

## Qué hacer con los dos probes (propuesta, no hecho)

Mismo tratamiento que P2/P5 de `probe_reparto_100` (#39): **no depender del estado de cobro de una persona real**. Dos opciones:
- **(a)** El caso "incentivo con importe en la carrera dueña" pasa a datos sintéticos (como los casos 5b/5g del mismo probe), y contra R9 se
  deja sólo lo que no depende de quién cobró (p. ej. que la suma de "Pagable" = lo pendiente de la base).
- **(b)** Elegir el caso de R9 en tiempo de corrida (un jockey que largó en 2+ carreras y cuyo incentivo sigue impago) y, si no queda ninguno,
  marcar el assert como ⏸ en vez de rojo.

Recomiendo **(a)**: (b) deja de probar algo apenas se cobre el último.

## Estado de los otros pasos (no ejecutados por el corte)

- **2/3 — merges y deploy**: no se hicieron. Los heads siguen: #37 `44280646c3e29863e702bf9834317301c0e48ef9`, #38 `3f7d0c0daacc73f1f4637208fcfef112f1ac180a`,
  #42 `09c6af738db4c4692406a50d713487d62a76a3b9`. La corrida previa del #38 (15:5x UTC) había dado 0 nuevos; con el dato de hoy, cualquier rama va a
  dar estos mismos 2 rojos, porque vienen de la base.
- **4 — rol de solo lectura**: **no se creó en prod.** Se preparó la migración (rama local `chore/rol-sgh-lectura`, sin pushear) y se probó en el
  sandbox (SELECT anda; UPDATE falla por transacción de solo lectura y, sacándola, por `permission denied`; CREATE falla). Dos hallazgos para
  decidir antes de aplicarla: **(i)** las 37 tablas de `public` tienen RLS y ninguna política aplica a un rol nuevo → **sin BYPASSRLS el rol ve 0
  filas en todas**; **(ii)** la base registra el DDL (`log_statement = ddl`): la contraseña se pone con el verificador SCRAM, nunca en texto.
- **5 — fase 1 del front de resultados**: lectura hecha, informe pendiente. Adelanto: el atajo F10 llama a `aplicar(…,'provisional')` **también en
  la vista oficial**; los errores P0092/P0089 se muestran crudos ("Error al guardar: …"); `resultados_legacy.html` **sigue publicada** (HTTP 200),
  no la enlaza ninguna pantalla y escribe directo en `resultados` / `resultado_posiciones` / `performances` (incluido des-oficializar con un `UPDATE`
  que no pasa por el chequeo de pagos de `desoficializar_carrera`).

## Preguntas

1. ¿Arreglo los dos probes con la opción (a) en un PR y, con eso en `main`, retomo los pasos 1–3?
2. Paso 4: ¿el rol va sin BYPASSRLS aunque vea 0 filas (y después se agregan políticas `TO sgh_lectura` tabla por tabla), o con BYPASSRLS?

## Salida cruda

### `correr_todos.sh` sobre `main`

```
rama=main sha=ade78361a16146cb73262d4bc33b95962f28b158
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       5s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       5s
probe_aviso_jockey_repetido                🟢 verde                                                      4s
probe_badge_overlap                        🟢 verde                                                      0s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      2s
probe_chapa_4medio                         🟢 verde                                                      0s
probe_cobros_caballeriza                   🟢 verde                                                      3s
probe_condicion_sexo_r9                    🟢 verde                                                      6s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=1)                                       3s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      71s
probe_fmtinput_onblur                      🟢 verde                                                      0s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       1s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      0s
probe_montas_reales                        🟢 verde                                                      3s
probe_motor_chequeo_errores                — no está en esta rama
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       8s
probe_orden_inscriptos                     🟢 verde                                                      4s
probe_orden_ui                             🟢 verde                                                      0s
probe_pagos_carrera_busqueda               🟢 verde                                                     29s
probe_pagos_vista_carrera                  🔴 ROJO NUEVO (rc=1)                                         17s
probe_pagos_vista_incentivo_pagados        🔴 ROJO NUEVO (rc=1)                                         13s
probe_portal_alta_spc_ui                   🟢 verde                                                      2s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      0s
probe_programa_null_estado                 🟢 verde                                                      3s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_recibo_rol                           🟢 verde                                                      0s
probe_recibo_una_hoja                      🟢 verde                                                     63s
probe_regex_datos_personales               🟢 verde                                                      1s
probe_reparto_100                          🟢 verde                                                     44s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_v2                          🟢 verde                                                      0s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       3s

Resumen: 25 verdes · 12 rojos conocidos · 2 rojos NUEVOS · 1 ausentes
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
  - probe_pagos_vista_carrera
  - probe_pagos_vista_incentivo_pagados
Salida completa de cada probe: <scratchpad>/pre/out_main/<probe>.txt
exit=1
```

### Asserts que fallan (de `<scratchpad>/pre/out_main/<probe>.txt`)

```
$ grep -E "❌|checks OK" probe_pagos_vista_carrera.txt
❌ 3e) <J07>: en la carrera 1 (dueña) el incentivo está con importe y "se paga una sola vez"
24/25 checks OK
$ grep -E "❌|checks OK" probe_pagos_vista_incentivo_pagados.txt
❌ 2) <J07>: corrió en 1 y 5; incentivo YA NO pagable (pagado) en UNA sola carrera, la 1  → con importe en: —
26/27 checks OK
```

### Consultas

```sql
select d.id, d.estado_linea, d.recibo_id, d.monto_neto, d.pagado_at from liquidacion_detalle d where d.id='5690c007-89c1-4aa0-88ed-01ec06443234';
-- 0 filas
select 'recibos_12h', count(*), max(created_at) from recibos where created_at > now() - interval '12 hours';   -- 7, 13:23 ART
select 'pagadas_12h', count(*), max(pagado_at) from liquidacion_detalle where pagado_at > now() - interval '12 hours';   -- 15, 13:23 ART
-- recibos de hoy con sus conceptos y total (tabla de arriba), y la línea de incentivo de <J07> en R9:
select 'recibo' k, r.numero_recibo, r.forma_pago, r.estado, r.created_at, (select string_agg(distinct d.concepto_tipo::text, ',') from liquidacion_detalle d where d.recibo_id=r.id),
       (select sum(d.monto_neto) from liquidacion_detalle d where d.recibo_id=r.id)
from recibos r where r.created_at > now() - interval '12 hours';
select d.id, d.estado_linea, d.recibo_id, d.pagado_at, d.monto_neto from liquidacion_detalle d
where d.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and d.concepto_tipo='incentivo_jockey' and d.beneficiario_id='70907ee8-7c1b-45d6-9821-d55f344c05a6';
```
```
inc_jockey <J07> | 79ad9dec-dae1-41a4-8d82-e424e5a96de4 | pagado | recibo b9d30a41-4698-4a72-b782-3c8ffca79be1 | 2026-10-02 13:07 ART | $60.000,00
lineas_r9        | 216 líneas | $9.051.208,34
```

## Verificación de push

Chequeo de datos personales sobre lo agregado: **0**. Búsqueda de nombres de personas en lo agregado: **0**.

```
$ git push -q origin HEAD:reports && git ls-remote origin reports && git rev-parse HEAD
173654b9adda5fd9f45bc50a98d730ca78417b4f	refs/heads/reports
173654b9adda5fd9f45bc50a98d730ca78417b4f
```

Este anexo va en un commit posterior; su SHA es el tip de `origin/reports`.
