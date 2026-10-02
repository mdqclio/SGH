# Rama local `reports` divergida de `origin/reports` — qué informes hay sólo en local (solo lectura)

- **Fecha**: 2026-10-02
- **Local `reports`**: `f104047eb37908ad7fa52d80fdd7eb88b2a7c871` · **`origin/reports`**: `7b4cec4eab6ec0c4d5b1fc289660eca2d10990a7` (después de `git fetch`)
- **`main`**: `d52afe9350ebfbd75bd341bc178e6e2e198c8a96`
- **Guards**: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` ✅ · `SELECT nombre FROM clubs WHERE id = '0649e9c5-9e87-4aad-842f-101458e6b33c'` → `Hipódromo de Dolores` ✅ (guard nuevo, PR #36)
- **Alcance**: sólo lectura de git. **No se pusheó, no se borró ni se movió nada de la rama local `reports`.** Este informe se
  escribió desde un worktree aparte sobre `origin/reports`.

## Conclusión

1. **No son informes perdidos por un push fallido. `origin/reports` se recreó SIN historia el 2026-09-24** (commit raíz
   `345b722ad3521c606080ef52d9cc3a2486093702`, 20:41 UTC, mensaje: *"Rama reports recreada SIN historia: sólo informes
   anonimizados."*), al día siguiente de la auditoría de PII del historial (`2026-09-23_auditoria-pii-historial-completo.md`,
   que figura en la lista de abajo). La rama local es la `reports` **de antes**: arranca en el *Initial commit* del
   2026-04-21 y no comparte ningún commit con la de `origin` (no hay merge-base).
2. En `docs/diagnosticos` hay **212 rutas sólo en local** (174 `.md` + 38 imágenes, PDFs y scripts), **48 sólo en `origin`**
   y **1 en las dos**.
3. **211 de las 212 son anteriores a la recreación**: quedaron afuera a propósito, porque la rama nueva lleva sólo lo
   anonimizado. **Pushear la local volvería a publicar lo que la recreación sacó.** No pushear.
4. **Una sola es de después de la auditoría y no está en `origin`**: `2026-09-24_incentivo-jockey-r9-duplicado.md`
   (commit local `cf8461cfab3cf703e4bf07bdad747bdfe3062be7`, 2026-09-24 20:06 UTC, 35 minutos antes de la recreación).
   En `origin` hay uno del mismo tema y del mismo día, `2026-09-24_pagos-vista-incentivo-y-pagados.md`. Si es su reemplazo
   anonimizado o si el primero se perdió, no lo puedo decidir desde git — **pregunta abierta 1**.
5. **El que está en las dos** (`2026-09-30_resoluciones-sin-contador-borrador.md`) **no es pérdida**: la versión de
   `origin` es la local **más 38 líneas** (sólo inserciones, 0 borradas: merge de PR #27 + md5 de prod). El commit local
   `f104047eb37908ad7fa52d80fdd7eb88b2a7c871` (2026-09-30 01:56:25) es el mismo informe que `origin` publicó como
   `de1971468abe547a8ab54cbc6deb2f6ad926907c` (mismo segundo, mismo mensaje): una sesión lo commiteó en la local vieja
   además de en la buena.
6. Un nombre de archivo de la lista lleva el nombre de una persona; acá va reemplazado por `[nombre de persona omitido]`
   (el repo es público). La lista completa sin redactar se reproduce en local con el comando del § Comandos.

## Preguntas abiertas

1. `2026-09-24_incentivo-jockey-r9-duplicado.md` (local, `cf8461c…`): ¿quedó subsumido en
   `2026-09-24_pagos-vista-incentivo-y-pagados.md` o hay que publicar una versión anonimizada?
2. ¿Qué se hace con la rama local? Propuesta conservadora (no ejecutada): renombrarla a `bkp/reports-pre-huerfana` para que
   ninguna sesión vuelva a commitear ahí creyendo que es `reports` (pasó el 30/09, punto 5) y crear la local nueva con
   `git branch reports origin/reports`. Ojo: `git checkout reports` hoy deja parado en la vieja, y `git pull` falla
   (*"Diverging branches can't be fast-forwarded"*) — fue lo que destapó esto.
3. ¿La rama vieja debe quedar sólo en esta máquina? Tiene los 211 informes pre-anonimización: no es para pushear a ningún
   lado del repo público.

## Comandos (tal como se corrieron) y salida

```
$ git fetch -q origin
$ git rev-parse reports origin/reports
f104047eb37908ad7fa52d80fdd7eb88b2a7c871
7b4cec4eab6ec0c4d5b1fc289660eca2d10990a7
$ git merge-base reports origin/reports
(sin salida, exit 1: no hay ancestro común)
$ git rev-list --left-right --count reports...origin/reports
1155	101
$ git rev-list --max-parents=0 origin/reports
345b722ad3521c606080ef52d9cc3a2486093702
$ git log -1 --format='%B' 345b722ad3521c606080ef52d9cc3a2486093702 | head -3
reports: Pagos vista por carrera — incentivo una sola vez + pagados (PR #12), anonimizado

Rama reports recreada SIN historia: sólo informes anonimizados.
$ git log --format='%H %ad %s' --date=short reports | tail -2
06ce5a17a53916eb399f6814365378e20a4f06b9 2026-04-21 Update and rename README.md to Index.html
739fc97c2dbcf7c3b53ec05d6b27c2b4d668f82b 2026-04-21 Initial commit

$ export LC_ALL=C
$ git ls-tree -r --name-only reports -- docs/diagnosticos | sort > loc.txt          # 213
$ git ls-tree -r --name-only origin/reports -- docs/diagnosticos | sort > ori.txt   # 49
$ comm -23 loc.txt ori.txt | wc -l      # sólo local
212
$ comm -13 loc.txt ori.txt | wc -l      # sólo origin
48
$ comm -12 loc.txt ori.txt              # en las dos
docs/diagnosticos/2026-09-30_resoluciones-sin-contador-borrador.md

$ git log --format='%H %ad %s' --date=iso reports --since=2026-09-24
f104047eb37908ad7fa52d80fdd7eb88b2a7c871 2026-09-30 01:56:25 +0000 report: resoluciones sin contador de borrador
cf8461cfab3cf703e4bf07bdad747bdfe3062be7 2026-09-24 20:06:30 +0000 reports: incentivo de jockey R9 — duplicado de pantalla en vista por carrera, no en la base (solo lectura)
$ git show --stat --format= cf8461cfab3cf703e4bf07bdad747bdfe3062be7
 .../2026-09-24_incentivo-jockey-r9-duplicado.md    | 603 +++++++++++++++++++++
 1 file changed, 603 insertions(+)
$ git show --stat --format= f104047eb37908ad7fa52d80fdd7eb88b2a7c871
 ...026-09-30_resoluciones-sin-contador-borrador.md | 114 +++++++++++++++++++++
 1 file changed, 114 insertions(+)

$ F=docs/diagnosticos/2026-09-30_resoluciones-sin-contador-borrador.md
$ git show reports:$F | wc -l ; git show origin/reports:$F | wc -l
114
152
$ git diff --stat reports origin/reports -- $F
 ...026-09-30_resoluciones-sin-contador-borrador.md | 38 ++++++++++++++++++++++
 1 file changed, 38 insertions(+)
$ git log --format='%H %ad %s' --date=iso origin/reports -- $F
a9d699cc66257c8ed27d3c2999eab776b09388f8 2026-09-30 01:59:32 +0000 report: merge PR #27 + md5 de prod — resoluciones sin contador
c8ca74803652ad9fe013e4501778936f90cc696d 2026-09-30 01:56:55 +0000 report: verificación de push — resoluciones sin contador
de1971468abe547a8ab54cbc6deb2f6ad926907c 2026-09-30 01:56:25 +0000 report: resoluciones sin contador de borrador
```

Para la lista sin redactar, en esta máquina: `LC_ALL=C comm -23 <(git ls-tree -r --name-only reports -- docs/diagnosticos | sort) <(git ls-tree -r --name-only origin/reports -- docs/diagnosticos | sort)`

## Las 212 rutas de `docs/diagnosticos` que están en la local y no en `origin/reports`

```
  1  docs/diagnosticos/2026-08-13_bono-posicion-R8.md
  2  docs/diagnosticos/2026-08-13_edad-reglamentaria.md
  3  docs/diagnosticos/2026-08-13_fix-orden-carreras-resultados.md
  4  docs/diagnosticos/2026-08-13_programa-r8-imprenta.md
  5  docs/diagnosticos/2026-08-13_tabla-edades-R8.md
  6  docs/diagnosticos/2026-08-22_diagnostico-json-r8-diego.md
  7  docs/diagnosticos/2026-08-27_aplicacion-fix-edad.md
  8  docs/diagnosticos/2026-08-27_aplicacion-pagos-rol-carrera.md
  9  docs/diagnosticos/2026-08-27_auditoria-claude-md.md
 10  docs/diagnosticos/2026-08-27_censo-inscripciones-r9.md
 11  docs/diagnosticos/2026-08-27_diff-claude-md-a3-a6.md
 12  docs/diagnosticos/2026-08-27_edad-gate-inscripcion.md
 13  docs/diagnosticos/2026-08-27_fix-edad-una-sola-vez.md
 14  docs/diagnosticos/2026-08-27_plan-pagos-rol-carrera.md
 15  docs/diagnosticos/2026-08-27_quien-choco-con-el-gate.md
 16  docs/diagnosticos/2026-08-27_relevamiento-pagos.md
 17  docs/diagnosticos/2026-08-28_aplicacion-claude-md-a3-a6.md
 18  docs/diagnosticos/2026-08-28_aplicacion-montas-reales-y-gate.md
 19  docs/diagnosticos/2026-08-28_diff-montas-reales-y-gate.md
 20  docs/diagnosticos/2026-08-28_ejecucion-revert-recibo-4.md
 21  docs/diagnosticos/2026-08-28_ejecucion-saldado-r6-r8.md
 22  docs/diagnosticos/2026-08-28_monta-real-vs-jockey-inscripto.md
 23  docs/diagnosticos/2026-08-28_plan-revert-recibo-4.md
 24  docs/diagnosticos/2026-08-28_plan-saldado-r6-r8.md
 25  docs/diagnosticos/2026-08-28_probe-recibo-resultado.md
 26  docs/diagnosticos/2026-08-28_recibo-pie-cobrador.md
 27  docs/diagnosticos/2026-08-28_relevamiento-apoderados.md
 28  docs/diagnosticos/2026-08-29_aislamiento-club-cobros-plan.md
 29  docs/diagnosticos/2026-08-29_issue-055-ejecucion.md
 30  docs/diagnosticos/2026-08-29_issue-055-es-prueba-plan.md
 31  docs/diagnosticos/2026-08-29_issue-055-merge.md
 32  docs/diagnosticos/2026-08-30_anular-recibo-estado-post-corte.md
 33  docs/diagnosticos/2026-08-30_anular-recibo-plan.md
 34  docs/diagnosticos/2026-08-30_anular-recibo-resultados.md
 35  docs/diagnosticos/2026-08-30_cierre-filtro-concepto.md
 36  docs/diagnosticos/2026-08-30_historial-recibos-implementado.md
 37  docs/diagnosticos/2026-08-30_issue-056-merge.md
 38  docs/diagnosticos/2026-08-30_issue-056-ui-anulacion-entrega.md
 39  docs/diagnosticos/2026-08-30_issue-056-ui-anulacion-plan.md
 40  docs/diagnosticos/2026-08-30_issue-056-ui-merge.md
 41  docs/diagnosticos/2026-08-30_issue-065-aplicado-y-plan-067.md
 42  docs/diagnosticos/2026-08-30_issue-067-opcion-1.md
 43  docs/diagnosticos/2026-08-30_logo-fix-aplicado.md
 44  docs/diagnosticos/2026-08-30_logo-roto-dominio.md
 45  docs/diagnosticos/2026-08-30_merge-historial-recibos.md
 46  docs/diagnosticos/2026-08-30_merge-issue-067-op1.md
 47  docs/diagnosticos/2026-08-30_mutantes-filtro-concepto.md
 48  docs/diagnosticos/2026-08-30_plan-filtro-concepto-pagos.md
 49  docs/diagnosticos/2026-08-30_plan-historial-recibos.md
 50  docs/diagnosticos/2026-08-30_plan-revocar-recibos-delete.md
 51  docs/diagnosticos/2026-09-01_carta-llamados-r8-no-visible.md
 52  docs/diagnosticos/2026-09-02_carta-llamados-selector-reunion.md
 53  docs/diagnosticos/2026-09-02_fede-mail-verificacion-no-llega.md
 54  docs/diagnosticos/2026-09-02_fix-solicitar-acceso-cuenta-existente.md
 55  docs/diagnosticos/2026-09-03_fede-registro-real-sin-solicitud.md
 56  docs/diagnosticos/2026-09-05_solicitar-acceso-paso-final.md
 57  docs/diagnosticos/2026-09-07_aprobacion-solicitud-sin-ficha-propietario.md
 58  docs/diagnosticos/2026-09-07_fix-club-id-alta-propietarios.md
 59  docs/diagnosticos/2026-09-08_bolsas-portal-vs-detalle-r9.md
 60  docs/diagnosticos/2026-09-08_buscador-spc-autocompletado.md
 61  docs/diagnosticos/2026-09-08_chips-llamado-pista-y-sexo.md
 62  docs/diagnosticos/2026-09-08_ejecucion-fix-condicion-sexo-t8-t10-r9.md
 63  docs/diagnosticos/2026-09-08_ejecucion-ventanas-r9.md
 64  docs/diagnosticos/2026-09-08_fix-bolsa-efectiva-portal.md
 65  docs/diagnosticos/2026-09-08_fix-carta-llamados-hora-local.md
 66  docs/diagnosticos/2026-09-08_forfait-portal-aplicado.md
 67  docs/diagnosticos/2026-09-08_issue-075-reescrito-y-077.md
 68  docs/diagnosticos/2026-09-08_machos-en-t8-t10-r9.md
 69  docs/diagnosticos/2026-09-08_paridad-llamado-inscripciones-y-formato-hora.md
 70  docs/diagnosticos/2026-09-08_plan-fix-condicion-sexo-t8-t10-r9.md
 71  docs/diagnosticos/2026-09-08_plan-forfait-desde-el-portal.md
 72  docs/diagnosticos/2026-09-08_plan-hora-cierre-r9.md
 73  docs/diagnosticos/2026-09-08_plan-issue-075-ventana-ratificacion.md
 74  docs/diagnosticos/2026-09-08_plan-ventanas-r9-tres-columnas.md
 75  docs/diagnosticos/2026-09-08_preguntas-fede-buscador-y-validacion.md
 76  docs/diagnosticos/2026-09-08_rastreo-bloque-exited-plan-mode.md
 77  docs/diagnosticos/2026-09-08_whatsapp-de-confirmacion-existe-o-no.md
 78  docs/diagnosticos/2026-09-10_alta-entrenador-desde-solicitudes.md
 79  docs/diagnosticos/2026-09-10_fix-alta-entrenador-operador.md
 80  docs/diagnosticos/2026-09-10_ips-fijas-consulta-studbook.md
 81  docs/diagnosticos/2026-09-10_merge-alta-entrenador-operador.md
 82  docs/diagnosticos/2026-09-11_barrido-caballerizas-duplicadas.md
 83  docs/diagnosticos/2026-09-11_caballeriza-el-don-jorge-lp.md
 84  docs/diagnosticos/2026-09-11_cierre-r9-tanda-3-y-lunes.md
 85  docs/diagnosticos/2026-09-11_ejecucion-el-don-jorge-y-plan-los-urones.md
 86  docs/diagnosticos/2026-09-11_ejecucion-merge-carosueno.md
 87  docs/diagnosticos/2026-09-11_ejecucion-merge-los-urones.md
 88  docs/diagnosticos/2026-09-11_ejecucion-provisorios-r9.md
 89  docs/diagnosticos/2026-09-11_ejecucion-studbook-buscar-pieza-a.md
 90  docs/diagnosticos/2026-09-11_ejecucion-studbook-buscar-pieza-b.md
 91  docs/diagnosticos/2026-09-11_ejecucion-studbook-buscar-pieza-c.md
 92  docs/diagnosticos/2026-09-11_ejecucion-studbook-buscar-pieza-d-deploy.md
 93  docs/diagnosticos/2026-09-11_ejecucion-studbook-ganadas-ui-v22.md
 94  docs/diagnosticos/2026-09-11_ejecucion-studbook-paso1-ddl-vista-previa.md
 95  docs/diagnosticos/2026-09-11_inventario-vps-que-corre-del-hipodromo.md
 96  docs/diagnosticos/2026-09-11_mail-diego-cinco-campos.md
 97  docs/diagnosticos/2026-09-11_plan-alta-el-don-jorge-lp.md
 98  docs/diagnosticos/2026-09-11_plan-merge-carosueno.md
 99  docs/diagnosticos/2026-09-11_plan-merge-los-urones.md
100  docs/diagnosticos/2026-09-11_plan-studbook-buscar-edge-function.md
101  docs/diagnosticos/2026-09-11_plan-studbook-condicion-5-campos.md
102  docs/diagnosticos/2026-09-11_r9-cierre-tanda-2-conesera-galletini.md
103  docs/diagnosticos/2026-09-11_r9-cruce-spcs-planilla.md
104  docs/diagnosticos/2026-09-11_r9-cruce-spcs-planilla_addendum.md
105  docs/diagnosticos/2026-09-11_r9-cuadro-72-y-plan-provisorios.md
106  docs/diagnosticos/2026-09-11_r9-scrape-studbook-resultado.md
107  docs/diagnosticos/2026-09-11_r9-tanda-1-ejecucion.md
108  docs/diagnosticos/2026-09-11_r9-tanda-1-sql-propuesto.md
109  docs/diagnosticos/2026-09-11_r9-tanda-2-ejecucion-y-galletini.md
110  docs/diagnosticos/2026-09-11_r9-verificacion-llamado-acomodado.md
111  docs/diagnosticos/2026-09-11_r9-verificacion-segunda-correccion-yesi.md
112  docs/diagnosticos/2026-09-11_relevamiento-docs-fase-1.md
113  docs/diagnosticos/2026-09-11_relevamiento-scraper-studbook-como-edge-function.md
114  docs/diagnosticos/2026-09-11_relevamiento-studbook-tres-pedidos-diego.md
115  docs/diagnosticos/2026-09-11_revision-cinco-ramas-sin-mergear.md
116  docs/diagnosticos/2026-09-11_whatsapp-yesi-10-dni.md
117  docs/diagnosticos/2026-09-12_ejecucion-aviso-jockey-repetido.md
118  docs/diagnosticos/2026-09-12_ejecucion-orden-inscriptos-es.md
119  docs/diagnosticos/2026-09-12_jockey-repetido-misma-carrera.md
120  docs/diagnosticos/2026-09-12_merge-cinco-ramas.md
121  docs/diagnosticos/2026-09-12_orden-inscriptos-pantalla-vs-pdf.md
122  docs/diagnosticos/2026-09-14_donde-se-carga-el-sorteo-de-partidores.md
123  docs/diagnosticos/2026-09-14_plan-modificar-inscripcion-portal.md
124  docs/diagnosticos/2026-09-16_alta-caballeriza-exige-titular.md
125  docs/diagnosticos/2026-09-16_cruce-planilla-r9-y-beast-party.md
126  docs/diagnosticos/2026-09-16_ejecucion-caballeriza-titular-opcional-provisorio.md
127  docs/diagnosticos/2026-09-16_ejecucion-modificar-inscripcion-portal.md
128  docs/diagnosticos/2026-09-16_estado-post-corte-1905.md
129  docs/diagnosticos/2026-09-16_plan-caballeriza-titular-opcional-provisorio.md
130  docs/diagnosticos/2026-09-17_carta-llamados-pdf-numero-turno.md
131  docs/diagnosticos/2026-09-17_carta-llamados-pdf-numero-turno_DEPLOY.md
132  docs/diagnosticos/2026-09-17_carta-llamados-pdf-numero-turno_GATE.md
133  docs/diagnosticos/2026-09-17_programa-color-columna-spc-desalineada.md
134  docs/diagnosticos/2026-09-18_mandil-colores-nomenclador.md
135  docs/diagnosticos/2026-09-19_incentivo-jockey-input-no-deja-ceros.md
136  docs/diagnosticos/2026-09-19_incentivos-montos-config.md
137  docs/diagnosticos/2026-09-19_plan-pozo-ratificacion-fase1-cobro.md
138  docs/diagnosticos/2026-09-19_pozo-fase1-pieza1-schema_PLAN.md
139  docs/diagnosticos/2026-09-19_pozo-s6-pago-ganador-s8-preguntas.md
140  docs/diagnosticos/2026-09-20_bono-posicion-r9.md
141  docs/diagnosticos/2026-09-20_montas-r9-jockeys-vs-resultado.md
142  docs/diagnosticos/2026-09-20_pagos-[nombre de persona omitido]-r9.md
143  docs/diagnosticos/2026-09-20_pagos-busqueda-caballeriza-r9.md
144  docs/diagnosticos/2026-09-20_pagos-carrera-2-r9.md
145  docs/diagnosticos/2026-09-20_pagos-filtro-carrera-r9.md
146  docs/diagnosticos/2026-09-20_plan-saldado-recibos-manuales-r9.md
147  docs/diagnosticos/2026-09-21_ejecucion-recibo-una-hoja.md
148  docs/diagnosticos/2026-09-21_ejecucion-saldado-recibos-manuales-r9.md
149  docs/diagnosticos/2026-09-21_issue-084-montas-post-oficial-fase1.md
150  docs/diagnosticos/2026-09-21_pagos-a-b-merge-y-prod.md
151  docs/diagnosticos/2026-09-21_pagos-parte-c-ejecucion.md
152  docs/diagnosticos/2026-09-21_pagos-parte-c-merge-y-prod.md
153  docs/diagnosticos/2026-09-21_pagos-partes-a-b-ejecucion.md
154  docs/diagnosticos/2026-09-21_plan-pagos-vista-por-carrera.md
155  docs/diagnosticos/2026-09-21_plan-recibo-una-hoja.md
156  docs/diagnosticos/2026-09-21_recibo-una-hoja-merge-y-prod.md
157  docs/diagnosticos/2026-09-21_registro-aprendizajes-fase1.md
158  docs/diagnosticos/2026-09-21_relevamiento-docs-fase1.md
159  docs/diagnosticos/2026-09-21_valeria-bonos-y-numeros-carrera.md
160  docs/diagnosticos/2026-09-22_fase-corta-documentacion.md
161  docs/diagnosticos/2026-09-22_guard-staff-3-de-6-aplicadas.md
162  docs/diagnosticos/2026-09-22_issue-084-montas-post-oficial-ejecucion.md
163  docs/diagnosticos/2026-09-22_issue-084-permisos-incentivo-concurrencia.md
164  docs/diagnosticos/2026-09-22_paso1-revoke-anon-anular-recibo.md
165  docs/diagnosticos/2026-09-22_paso2-despliegue-issue-084.md
166  docs/diagnosticos/2026-09-22_paso3-vector-portal.md
167  docs/diagnosticos/2026-09-22_paso4-guard-staff-seis-rpc-plan.md
168  docs/diagnosticos/2026-09-22_rpc-cambiar-monta-guard0.md
169  docs/diagnosticos/2026-09-22_verificacion-md5-funciones-aplicadas.md
170  docs/diagnosticos/2026-09-23_auditoria-pii-historial-completo.md
171  docs/diagnosticos/2026-09-23_camino-de-pago-guard-staff-aplicado.md
172  docs/diagnosticos/2026-09-23_recibo-corte-mitad-merge-y-prod.md
173  docs/diagnosticos/2026-09-23_recibo-corte-mitad.md
174  docs/diagnosticos/2026-09-24_incentivo-jockey-r9-duplicado.md
175  docs/diagnosticos/img/2026-09-17_carta-numero-turno/despues_probe_r9.png
176  docs/diagnosticos/img/2026-09-17_carta-numero-turno/medir_encabezado.mjs
177  docs/diagnosticos/img/2026-09-17_carta-numero-turno/variante_A.png
178  docs/diagnosticos/img/2026-09-17_carta-numero-turno/variante_B.png
179  docs/diagnosticos/img/2026-09-17_carta-numero-turno/variante_C.png
180  docs/diagnosticos/img/2026-09-17_carta-numero-turno/variante_D.png
181  docs/diagnosticos/img/2026-09-17_programa-color/antes_tira2.png
182  docs/diagnosticos/img/2026-09-17_programa-color/despues_tira2.png
183  docs/diagnosticos/img/2026-09-17_programa-color/despues_tira3.png
184  docs/diagnosticos/img/2026-09-17_programa-color/prod_pdf_pag3.png
185  docs/diagnosticos/img/2026-09-17_programa-color/v3_pdf_pag2.png
186  docs/diagnosticos/img/2026-09-17_programa-color/v3_pdf_pag3.png
187  docs/diagnosticos/img/2026-09-18_mandil-colores/mandiles_actual_vs_original.png
188  docs/diagnosticos/img/2026-09-18_mandil-colores/prod_despues_tira2.png
189  docs/diagnosticos/img/2026-09-18_mandil-colores/prod_despues_tira4.png
190  docs/diagnosticos/img/2026-09-21_recibo34_1linea_pdf_p1.png
191  docs/diagnosticos/img/2026-09-21_recibo37_4lineas_pdf_p1.png
192  docs/diagnosticos/img/2026-09-21_recibo37_hoy_p1.png
193  docs/diagnosticos/img/2026-09-21_recibo37_una-hoja_p1.png
194  docs/diagnosticos/img/2026-09-21_recibo37_x10_pdf_p1.png
195  docs/diagnosticos/img/2026-09-21_recibo37_x10_pdf_p2.png
196  docs/diagnosticos/img/2026-09-21_recibo37_x20_una-hoja_tira.png
197  docs/diagnosticos/img/2026-09-21_recibo37_x40_pdf_p2.png
198  docs/diagnosticos/img/2026-09-21_recibo37_x9_una-hoja_p1.png
199  docs/diagnosticos/img/2026-09-23_recibo-corte-mitad/antes_recibo_34_pdf_p1.png
200  docs/diagnosticos/img/2026-09-23_recibo-corte-mitad/pdfmedir.mjs
201  docs/diagnosticos/img/2026-09-23_recibo-corte-mitad/recibo_34.pdf
202  docs/diagnosticos/img/2026-09-23_recibo-corte-mitad/recibo_34_pdf_p1.png
203  docs/diagnosticos/img/2026-09-23_recibo-corte-mitad/recibo_37.pdf
204  docs/diagnosticos/img/2026-09-23_recibo-corte-mitad/recibo_37_pdf_p1.png
205  docs/diagnosticos/img/2026-09-23_recibo-corte-mitad/recibo_37_x10.pdf
206  docs/diagnosticos/img/2026-09-23_recibo-corte-mitad/recibo_37_x10_pdf_p1.png
207  docs/diagnosticos/img/2026-09-23_recibo-corte-mitad/recibo_37_x10_pdf_p2.png
208  docs/diagnosticos/img/2026-09-23_recibo-corte-mitad/recibo_37_x9.pdf
209  docs/diagnosticos/img/2026-09-23_recibo-corte-mitad/recibo_37_x9_pdf_p1.png
210  docs/diagnosticos/scripts/2026-09-23_auditoria-pii/final.py
211  docs/diagnosticos/scripts/2026-09-23_auditoria-pii/scan.py
212  docs/diagnosticos/scripts/2026-09-23_auditoria-pii/tabla.py
```
