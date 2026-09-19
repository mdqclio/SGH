# Pozo de ratificación — §6 (pago al ganador: línea vs circuito, con inclinación) y §8 (preguntas abiertas)

- **Fecha:** 2026-09-19 · extracto pedido por Leonardo del plan `docs/diagnosticos/2026-09-19_plan-pozo-ratificacion-fase1-cobro.md` (rama `reports`).
- **SHA de `main` relevado:** `ef78472`. Guards: `pwd` → `/home/clio/dev/SGH` · `spcs` → **210** · ref `unlhcuanfrtpatoipwve`.
- Texto idéntico al del plan (mismo commit); las referencias a §5/§8 apuntan a ese documento.
- Asentado en el plan (§0 y §3.4): **el pozo avisa al oficializar por decisión de Fede, no por consistencia con el gate de montas** — ese gate bloquea.

---

## 6. Pago al ganador: ¿línea de su liquidación o circuito aparte? (análisis, sin decidir)

### Opción A — una línea más en `liquidacion_detalle` (`concepto_tipo = 'pozo_ratificacion'`, beneficiario = propietario del 1°)

A favor:
- **Un solo recibo.** El propietario del ganador pasa por Pagos, lo buscan por nombre/DNI, y cobra premio + bono + pozo juntos. Es lo que Valeria pidió para los incentivos ("destildo los demás y tildo solamente…", `liquidaciones.html:1250`) y funciona con el buscador, los grupos de cobro, el filtro por carrera y el recibo con logo/firma **sin tocar nada**.
- El motor ya resuelve **quién es el propietario del 1°**, incluidos empate (dead-heat), descalificado y `propietario_id` NULL (`liquidaciones-engine.js:176-197`). Sería un `addActor(insc.propietario_id, 'propietario', { premio: al_ganador, pct: 1, conceptoTipo: 'pozo_ratificacion', … })` al lado del bono del 1°. ~15 líneas.
- Paid-safe gratis: si se paga y después se recalcula, la línea se preserva por clave.
- `anular_recibo`, `liberar_linea`, Resumen por beneficiario, aislamiento por club: todo aplica.
- DDL mínimo: `ALTER TYPE concepto_liq ADD VALUE IF NOT EXISTS 'pozo_ratificacion'` (gotcha #11, sin rollback posible pero inofensivo).

En contra:
- **La liquidación pasa a depender de la caja.** Hoy `generarLiquidacionesReunion` es función de (resultados oficiales, config, comisiones): dos recalcs con los mismos datos dan lo mismo. Con el pozo adentro, el monto de la línea depende de **cuántos cobros vivos hay en ese instante**. Si se oficializa con 9/13 cobrados y el 10° paga a la tarde, la línea del ganador queda en 720.000 hasta que alguien recalcule; si ya se pagó, queda mal para siempre (preservada por clave — la clave no incluye el monto). Y a la inversa: una devolución posterior baja el pozo pero no la línea pagada.
- **Contamina el Resumen.** "Total liquidado" sumaría plata que no es del club; la reconciliación `pagado+impago+retenido+fondo=total` sigue cuadrando aritméticamente pero deja de significar "lo que la bolsa reparte". Habría que excluir el `concepto_tipo` en cada bucket (4-5 lugares en `liquidaciones.html:1990-2092`) o aceptar que Resumen mida otra cosa.
- **¿Retención anti-doping?** Los premios de 1° y 2° quedan `retenido` 30 días (Fase C). Si el pozo va como línea, hay que decidir si también (es plata que cobra el ganador; si el doping da positivo, ¿se devuelve al pozo? ¿a los demás?). Con línea propia la decisión es un `if` en el motor; con circuito aparte hay que construir la retención de cero. Pregunta §8-4.
- **Fondo solidario / comisiones:** `descPct` se aplica sólo a `conceptoTipo === 'premio'` (`liquidaciones-engine.js:294-298`), así que el pozo no sufriría el 2 % ni las comisiones por accidente — bien. Pero hay que dejarlo escrito para que nadie lo "arregle".
- Semánticamente, `liquidaciones.reunion_id` + `total_bruto` se leen como "lo que el club debe por la reunión". El pozo es plata **de los propietarios entre sí** que el club sólo custodia.

### Opción B — circuito aparte (`pozo_pagos`: una fila por carrera pagada, con snapshot del bruto, pct, retención y neto; serie propia `recibo_pozo`; pantalla en `pozo.html`)

A favor:
- **Ciclo cerrado y reconciliable solo:** `Σ cobrado = Σ devuelto + Σ retenido + Σ pagado + pendiente`, todo en dos tablas (`pozo_cobros`, `pozo_pagos`) sin tocar `liquidacion_detalle`. La caja del pozo se audita en una pantalla.
- El pago **congela** bruto/pct/neto en el momento de pagar (como `recibos` congela `total_premios`): ningún recalc posterior lo mueve, ningún cobro tardío lo mueve. Si llega un cobro tardío después de pagar, queda como "cobrado pero no repartido" y es visible — no se pierde ni se paga dos veces.
- El motor de liquidaciones sigue siendo puro (resultados → deuda). Cero riesgo de regresión en lo que ya cobra R6/R8/R9.
- La decisión de anti-doping se toma aparte y no arrastra a los premios.

En contra:
- **Dos recibos para la misma persona el mismo día**, dos búsquedas, dos pantallas. El propietario del ganador cobra en Pagos y después en Pozo. Es exactamente lo que Valeria no quería con los incentivos.
- Duplica infraestructura: buscador por propietario, impresión, anulación con motivo, ventana de 5 días, aislamiento por club — todo eso ya existe en `recibos`/`emitir_recibo` y habría que reescribirlo (o generalizar `recibos` con `tipo`, que es tocar `chk_recibo_beneficiario`, `uq_recibo_por_club`, la pestaña Recibos y los 6 probes de recibos).
- Empate en el 1° y `propietario_id` NULL: hay que resolverlos de nuevo (el motor ya los resuelve).
- El "Resumen" de cierre de reunión queda partido en dos lugares.

### Híbrido posible (lo dejo anotado, no lo recomiendo sin ver Fase 1 andando)

Circuito aparte para **calcular y congelar** (`pozo_pagos` con bruto/pct/neto), y **al pagar** inyectar una línea `pozo_ratificacion` ya congelada en la liquidación del propietario para que salga en el mismo recibo. Junta lo mejor de las dos, pero son dos fuentes de verdad para el mismo número y hay que mantenerlas iguales (`anular_recibo` tendría que soltar también la fila de `pozo_pagos`). Más piezas móviles que cualquiera de las dos puras.

### Qué inclinaría la balanza (para Fede/Valeria, antes de decidir)

1. ¿El propietario del ganador **tiene que** cobrar todo junto en un papel, o le da igual firmar dos? Si tiene que → A o híbrido. Si le da igual → B, sin dudar.
2. ¿El pozo se paga **el mismo día** que el premio (con retención anti-doping 30 días) o **en el momento**, después de la carrera, en efectivo, como un pozo de amigos? Si es en el momento → B (la liquidación se genera al oficializar, tarde para eso; y no hay retención). Si es con el premio → A.
3. ¿Qué pasa con el que no pagó y ganó? (§8-2) Si "no cobra el pozo hasta que pague su parte", eso es una regla de caja que vive mejor en B.

Mi lectura, sin decidir: las reglas que dictó Fede ("plata que ENTRA y después SALE", "distinto de todo lo que hay", devolución si no larga, dos recibos) describen un **ciclo de caja**, y el modelo de liquidaciones es de **deuda por resultado**. Eso empuja a B. Lo que empuja a A es un solo hecho, operativo y fuerte: Valeria en la ventanilla con un propietario adelante. La pregunta 2 decide.

---


---

## 8. Preguntas abiertas (para Fede / Valeria / Yesi)

1. **¿Se cobra sólo a ratificados, o también a inscriptos antes de la ratificación?** El plan asume ratificados (guard 3 de `cobrar_pozo`). Si Valeria cobra el jueves cuando todavía están `inscripto`, el guard tiene que aceptar `inscripto` y la devolución cubrir "no ratificó".
2. **El que no pagó y largó: ¿el pozo se calcula sobre lo cobrado (plan) o sobre lo esperado?** Y si ese caballo gana, ¿cobra el pozo igual, cobra menos su parte, o no cobra hasta pagar? Cambia la fórmula de §5.1 y el guard de Fase 2.
3. **¿La devolución necesita número propio de comprobante** o alcanza con "devolución del recibo de cobro C-NNNN"?
4. **¿El pago del pozo al ganador tiene retención anti-doping** (30 días como el premio) o se paga en el momento? Es la pregunta que más pesa en §6.
5. **¿Default del % de retención** por club (`liquidacion_config`, prellena el modal de reunión) o Yesi lo escribe cada vez?
6. **Orden de la lista en ventanilla:** alfabético (como inscripciones) o por mandil.
7. **¿El monto va impreso** en el programa oficial / carta de llamados ("Ratificación a premios: $100.000")?
8. **Recibo de cobro: ¿a nombre de quién?** El plan guarda pagador libre (quien trae la plata) + vínculo a la inscripción (caballeriza/propietario). ¿Valeria quiere que el papel diga la caballeriza, el propietario, o el que pagó?
9. **¿Efectivo y transferencia, o sólo efectivo?** El ENUM `forma_pago_recibo` ya tiene los dos; si es sólo efectivo, se fija en el RPC.

---


---

## Verificación de publicación

(se completa abajo con `git ls-remote`)

```
$ git push origin reports
$ git ls-remote origin reports
e205ab03b8ec8968f83338b3adc82281efde83c1	refs/heads/reports
$ git rev-parse HEAD
e205ab03b8ec8968f83338b3adc82281efde83c1
```
(commit del extracto; este apéndice va en el commit siguiente)
