# Buscador de liquidaciones + emisión de recibo — MVP v1 (Fase 4)

> Fecha: 2026-06-08 · Rama: `feat/buscador-liquidaciones` (desde main) · **NO mergeado a main.**
> Toca el flujo de plata (marca líneas pagadas + numeración) vía RPC atómico.
> **PENDIENTE TU OK:** aplicar la RPC a la DB y correr el probe (ambos bloqueados hasta tu revisión del DDL).

## Paso 0 — hallazgos

### `imprimirRecibo()` actual (qué hace hoy)

`liquidaciones.html:552-582`. Imprime **una liquidación suelta** (`liquidaciones` header, per-reunión per-persona): nombre del profesional, tabla de `liquidacion_detalle` (concepto/descripción/bruto/desc/neto), totales del header, y una línea fija "Firma y sello". **No** usa la tabla `recibos`, **no** asigna número (`liq.numero_recibo` nunca se setea), **no** captura forma de pago/cobrador, **no** consolida cruzando reuniones, **no** distingue firma efectivo/transferencia. Es un print informativo, no el recibo de tesorería.

### Peón / capataz / sereno — ¿buscables por su persona? **NO** (hallazgo clave)

Verificado vía MCP sobre `liquidacion_detalle WHERE concepto_tipo='actuacion'`:

| concepto | beneficiario_id | beneficiario (resuelto) |
|---|---|---|
| `Capataz — Marcelo GAllardo` | 1da2aebd… | **CUEVAS, CESAR DANIEL** (entrenador) |
| `Peón — Gonzalo Higuain` | 896bb14e… | **ETCHEVERRY, MARIO ALFREDO** (entrenador) |

Las sub-líneas de actuación se guardan con `beneficiario_id = el ENTRENADOR` (ADR-025); el nombre del peón/capataz/sereno es **solo texto libre** en `concepto` (viene de `inscripciones.peon/capataz/sereno`, que son `VARCHAR`, no FK a una persona). **Consecuencia v1:** peón/capataz/sereno **no son entidades buscables**; su plata viaja dentro del recibo del **entrenador**, que se la reparte a mano. El buscador, por tanto, matchea **propietarios** y **profesionales (jockey/entrenador)**; las actuaciones aparecen como líneas dentro del recibo del entrenador. (Si en el futuro se quiere recibo propio por peón, requeriría modelarlos como personas con FK — fuera de v1.)

## Tarea — DDL de la RPC `emitir_recibo` (MOSTRADO, NO aplicado aún)

Verificado en DB (no inventado): `fn_siguiente_recibo(p_club_id uuid)→int` existe; `recibos.neto_a_cobrar` es GENERATED = `(total_premios - total_descuentos) - COALESCE(retencion_dgi,0)`; enums `beneficiario_tipo {profesional,propietario,club}`, `forma_pago_recibo {efectivo,transferencia}`. `emitir_recibo` **no existía** (0).

Archivo: `migrations/emitir_recibo_fase4.sql`.

```sql
CREATE OR REPLACE FUNCTION emitir_recibo(
  p_club_id uuid, p_beneficiario_tipo beneficiario_tipo, p_beneficiario_id uuid,
  p_linea_ids uuid[], p_forma_pago forma_pago_recibo,
  p_cobrador_nombre text, p_cobrador_documento text, p_comprobante_url text DEFAULT NULL
) RETURNS recibos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_num int; v_recibo recibos; v_marcadas int; v_bruto numeric; v_desc numeric;
BEGIN
  IF p_linea_ids IS NULL OR array_length(p_linea_ids,1) IS NULL THEN
    RAISE EXCEPTION 'emitir_recibo: sin líneas'; END IF;
  v_num := fn_siguiente_recibo(p_club_id);                                   -- (a) número correlativo
  INSERT INTO recibos (club_id, numero_recibo, beneficiario_tipo, profesional_id, propietario_id,
                       forma_pago, cobrador_nombre, cobrador_documento, comprobante_url, estado)
  VALUES (p_club_id, v_num, p_beneficiario_tipo,
          CASE WHEN p_beneficiario_tipo='profesional' THEN p_beneficiario_id END,
          CASE WHEN p_beneficiario_tipo='propietario' THEN p_beneficiario_id END,
          p_forma_pago, p_cobrador_nombre, p_cobrador_documento, p_comprobante_url, 'emitido')
  RETURNING * INTO v_recibo;                                                 -- (b) cabecera
  UPDATE liquidacion_detalle d                                              -- (c) marcar pagables sin recibo
     SET estado_linea='pagado', recibo_id=v_recibo.id, pagado_at=now()
   WHERE d.id = ANY(p_linea_ids) AND d.beneficiario_id = p_beneficiario_id AND d.recibo_id IS NULL
     AND (d.estado_linea='impago' OR (d.estado_linea='retenido' AND d.fecha_liberacion IS NOT NULL AND d.fecha_liberacion <= current_date));
  GET DIAGNOSTICS v_marcadas = ROW_COUNT;
  IF v_marcadas = 0 THEN
    RAISE EXCEPTION 'emitir_recibo: ninguna línea pagable (ya cobradas, retenidas a futuro o de otro beneficiario)'; END IF;
  SELECT COALESCE(sum(monto_bruto),0), COALESCE(sum(monto_descuento),0) INTO v_bruto, v_desc
    FROM liquidacion_detalle WHERE recibo_id=v_recibo.id;
  UPDATE recibos SET total_premios=v_bruto, total_descuentos=v_desc WHERE id=v_recibo.id RETURNING * INTO v_recibo;
  RETURN v_recibo;
END $$;
```

**Garantías de diseño:**
- **Atómico:** todo en una transacción (la función). Si algo falla o `v_marcadas=0`, `RAISE` hace rollback del recibo **y** del incremento de `fn_siguiente_recibo` → no se consume número ni queda recibo vacío.
- **Idempotente:** solo marca líneas con `recibo_id IS NULL`. Re-emitir las mismas → 0 marcadas → rechaza. Re-emitir mezcla → toma solo las nuevas.
- **Blindaje:** solo marca líneas cuyo `beneficiario_id == p_beneficiario_id` y que sean pagables (excluye retenidas a futuro).
- **Reversible:** `DROP FUNCTION emitir_recibo(uuid,beneficiario_tipo,uuid,uuid[],forma_pago_recibo,text,text,text);`

## Frontend — tab "🧾 Cobros" (`liquidaciones.html`, diff en la rama)

- **Buscador** (`cobrosBuscar`): query de líneas **pagables** (`estado_linea='impago' OR (retenido AND fecha_liberacion<=hoy)`, `recibo_id IS NULL`, `beneficiario_tipo != 'club'`), agrupadas por beneficiario con total. Texto matchea nombre de **propietario**/**profesional**; **caballeriza** se resuelve a su propietario titular vía `caballeriza_responsables(es_titular)`.
- **Detalle pagable** (`cobrosDetalle`): líneas del beneficiario cruzando reuniones, con fecha de reunión, carrera (join `inscripcion_id→carreras`), caballo (`spcs.nombre`), puesto, concepto, monto; checkboxes + total recalculable.
- **Emitir** (`cobrosEmitir`): valida cobrador+DNI, llama `sb.rpc('emitir_recibo', …)`, imprime.
- **Imprimir** (`imprimirReciboCobro`): header del hipódromo, N° recibo, beneficiario, cobrador+DNI, líneas (fecha/carrera/caballo/puesto/concepto/monto), totales, neto, y **firma si efectivo / "comprobante adjunto" si transferencia**. Reusa el estilo `.recibo-container`.
- **Nota formato:** se usa el `fmt` (formatMonto) del módulo, no `formatARS` — `liquidaciones.html` define su propio par (GOTCHA #46); mantener consistencia interna. Si preferís `formatARS`, lo unifico.

**No se tocó:** generador (`generarLiquidaciones`), bonos, retención anti-doping.

## Probe — `tests/probe_recibos_emision.mjs` (PENDIENTE correr — necesita la RPC aplicada)

Real-code sobre la RPC + la query de pagable. Fixtures propias (liquidación de prueba + 3 líneas con beneficiario real), snapshot→fixtures→run→assert→restore (borra fixtures + restaura `club_secuencias`):
- (a) pagable incluye L1 (impago) + L2 (retenido liberado ayer), **excluye** L3 (retenido mañana); total 3000.
- (b) emitir [L1,L2] → recibo con número; L1/L2 → pagado + recibo_id + pagado_at.
- (c) re-emitir [L1,L2] → RPC rechaza (0 pagables); emitir [L1,L2,L4nuevo] → toma solo L4 (1500).
- (d) total_premios = suma de líneas; neto_a_cobrar = 3000.

**Output:** _pendiente — se corre cuando autorices aplicar la RPC._

## Fuera de v1 (no hecho, va a v2)

Búsqueda por carrera; autorización estricta de DNI (v1 solo captura nombre+DNI, sin bloqueo); upload de comprobante (v1 = campo URL); resumen de reunión (Fase 5).

## Qué falta para cerrar

1. Tu **OK al DDL** → aplico `migrations/emitir_recibo_fase4.sql` por MCP.
2. Corro `tests/probe_recibos_emision.mjs`, pego el output acá.
3. Con tu OK + el de Leonardo → merge a main.
