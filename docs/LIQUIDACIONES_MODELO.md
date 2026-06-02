# Modelo de Liquidaciones — SGH / Hipódromo de Dolores

> Estado: **modelo cerrado** — todas las definiciones de negocio confirmadas con Leonardo.
> Listo para implementar (plan de CC aprobado, Fase 0).

-----

## 1. Reparto del premio por carrera (1°-5°) — CONFIRMADO

El premio de cada carrera se reparte del **1° al 5°** puesto (porcentajes por puesto en
`distribucion_premios`). El premio de cada caballo ubicado se reparte por **porcentaje
directo entre los roles** — NO es el modelo de “pool” de los hipódromos grandes (La Plata /
Palermo), es reparto directo, que es lo que `generarLiquidaciones` ya implementa.

|Rol            |%       |
|---------------|--------|
|Propietario    |70%     |
|Entrenador     |10%     |
|Jockey         |10%     |
|Peón           |4%      |
|Capataz        |3%      |
|Sereno         |1%      |
|Fondo solidario|2%      |
|**Total**      |**100%**|

- Peón, capataz y sereno se muestran como sub-líneas bajo el entrenador (ADR-025).
- Coincide con los % hardcodeados en `generarLiquidaciones`. Pendiente técnico: moverlos a
  config (por club).

## 2. Fondo solidario — CONFIRMADO

El **2% no se le paga a nadie**: va a un fondo solidario para accidentes / choques.

- No genera recibo.
- Se acumula y se contabiliza como un concepto aparte, a nivel club (Dolores lleva la cuenta).
- Hoy en A+B ese 2% queda sin asignar → hay que **rutearlo explícitamente** al fondo.

## 3. Bonos — CONFIRMADO

- **Bono al ganador: 250.000** (el “dos cincuenta”), se suma al premio del 1°. Configurable.
  Coincide con `bono_ganador` cargado en R5C1.
- Piso de **ganancia mínima** (Math.max sobre el premio del puesto).
- **Bono por posición 6°-8°: SÍ se paga** (no es dato viejo). Va **100% al propietario** — NO
  se reparte entre roles. Monto **configurable** (hoy 100.000; sube por inflación: 120k, 150k,
  etc.). El código actual es un **bug** (`calcPremio` devuelve 0 antes de aplicarlo): hay que
  **arreglarlo** (no borrarlo) y que pague 100% al propietario. Los puestos 6°-8° no cobran
  premio (el premio es 1°-5°); este bono es su única acreencia.

## 4. Incentivos por reunión (Bloque C) — CONFIRMADO

Pagos **por reunión**, independientes de ganar. Se liquidan y aparecen como líneas en el
recibo de la persona. Los montos son **configurables**.

- **Jockeys:** un incentivo (tipo viático), **uno por reunión**, a cada jockey que
  **efectivamente corrió** (largó al menos una) y estaba cargado en el programa. Si no corre,
  no cobra. No es por monta ni por cantidad de carreras. **No hay pago de “monta perdida”
  aparte** — este incentivo es el único pago por-reunión al jockey.
- **Entrenadores:** monto fijo a los entrenadores de la reunión.
- El sistema necesita campos configurables para cargar ambos montos.

## 5. Descuentos — CONFIRMADO

El **único descuento es el 2% del fondo solidario** (sección 2). Dolores NO tiene seguro
jockey, NI aporte de asociación/gremio, NI ningún otro descuento — eso se paga aparte.
(Los conceptos seguro jockey / aporte asociación de los recibos de La Plata / Palermo son de
esos hipódromos, no de Dolores.)

## 6. Retención impositiva — CONFIRMADO

Dolores **no aplica retención** AFIP / DGI. (Dejar el campo nullable por multi-tenant, pero
sin lógica de cálculo por ahora.)

## 7. Recibo — CONFIRMADO

- Es **por persona** y **on-demand**: cuando alguien viene a cobrar, junta **todo lo que se
  le debe** (varias carreras, incluso varias reuniones) en un solo recibo. Excluye las líneas
  retenidas (anti-doping) que todavía no se liberaron.
- Líneas: una por concepto (premio por puesto, bono, incentivo), con fecha de reunión,
  premio/carrera, SPC/caballo, puesto y monto. Columnas Premios / Descuentos / Líquido.
- **Numeración:** la **genera el sistema** (correlativa propia por club). No hay numeración previa.
- **Forma de pago:**
  - **Efectivo** → recibo impreso **con firma**.
  - **Transferencia** → recibo **sin firma**; se adjunta/escanea el comprobante de
    transferencia como respaldo.
- Los premios del **1° y 2°** se pagan generalmente por **transferencia** (ver sección 8).
- Datos del pie: nombre + DNI del que cobra, forma de pago, total, neto a cobrar.

## 8. Estado de cada línea — CONFIRMADO

Cada monto adeudado es una línea con estado:

- **Impago / pendiente**
- **Pagado** — queda saldado al emitir el recibo. Idempotente: no se paga dos veces.
- **Retenido por anti-doping** — los premios del **1° y 2°** quedan retenidos **~30 días**
  (configurable) por el control anti-doping privado que exige el reglamento. Es **automático
  para todo 1° y 2°** (no hay flag de doping). El **recibo se puede emitir apenas termina la
  carrera** con lo demás; las líneas retenidas se excluyen hasta liberarse y se cobran en un
  recibo posterior. La emisión del recibo y la fecha de cobro son momentos distintos.

## 9. Resumen de reunión (Bloque D) — CONFIRMADO

Reporte al cierre de la reunión: total pagado (premios + bonos + actuaciones + incentivos) y
**quién queda pendiente de cobrar**. Derivable del estado de las líneas (sección 8).

-----

## Gaps técnicos de A+B a resolver (de la auditoría)

- A+B filtra `estado='oficial'`; R5 está en provisional → no liquida. Flujo: botón
  “Oficializar reunión” (valida + setea estado oficial en bloque).
- `liquidaciones.reunion_id` obligatorio → la **consolidación por persona cruzando reuniones**
  NO existe. Se resuelve con tabla `recibos` + línea como unidad de deuda (decisión C1).
- `numero_recibo` existe pero no se asigna → numeración correlativa por club.
- Falta modelar: forma de pago (efectivo/transferencia), firma sí/no, cobrador + DNI,
  estado “retenido por anti-doping” con fecha de liberación para 1° y 2°.
- Bug: bono por posición 6°-8° (código muerto) → **arreglar Y** que pague 100% al propietario
  (sin reparto entre roles).
- Fondo solidario 2% sin rutear a un concepto.
- % de reparto y montos de incentivos hardcodeados → mover a `liquidacion_config` por club.
- Incentivos jockey/entrenador (Bloque C): no existen → campos configurables + generación de
  sus líneas por reunión.
