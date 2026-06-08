# Modelo de Liquidaciones — SGH / Hipódromo de Dolores

> Estado del modelo: **cerrado** — definiciones de negocio confirmadas con Leonardo.
>
> **Estado de implementación (branch `feat/liquidaciones-cd`, NO en prod salvo schema):**
> - ✅ Fase 0 — schema C+D (VIGENTE en DB de prod). Ver `SCHEMA.md` / `migrations/liquidaciones_cd_fase0.sql`.
> - ✅ Fase 1 — % de reparto e incentivos por club desde `liquidacion_config` (branch).
> - ✅ Fase 2 — fondo solidario 2% al club + bono 6-8 (100% propietario) + incentivos Bloque C (branch).
> - ⏳ Fase 2bis — botón "Oficializar reunión". ⏳ Fase 3 — estados de línea + retención anti-doping. ⏳ Fase 4 — recibos por persona on-demand. ⏳ Fase 5 — resumen de reunión. ⏳ Fase 6 — validar A+B con datos reales de R5.
> Detalle de fases y decisiones: `docs/ISSUES.md` (ISSUE-001). ADRs: ADR-042..047.

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

Pagos independientes de ganar. Se liquidan y aparecen como líneas en el recibo de la persona.
Los montos son **configurables** (`liquidacion_config.incentivo_jockey_monto` /
`incentivo_entrenador_monto`). **Montos confirmados por Fede (2026-06-08): jockey 50.000,
entrenador 10.000.** Granularidad distinta por rol:

- **Jockeys: 50.000 fijo POR REUNIÓN.** Una sola línea por jockey que **efectivamente corrió**
  (largó al menos una, `no_largo=false`, ratificado), aunque corra varias carreras. Si no corre,
  no cobra. No es por monta ni por cantidad de carreras. **No hay pago de “monta perdida”
  aparte.** Línea: `concepto_tipo='incentivo_jockey'`, `inscripcion_id=null` (es de reunión).
- **Entrenadores: 10.000 POR CABALLO que corre.** Una línea **por cada inscripción corrida**
  (`no_largo=false`, ratificado) — NO se deduplica por entrenador. Línea:
  `concepto_tipo='incentivo_entrenador'`, `inscripcion_id` = la inscripción del caballo.
- Ambos montos se cargan en `liquidacion_config` (pestaña "Reparto de premios").

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
- **Retenido por anti-doping** — los premios del **1° y 2°** se marcan `retenido` **automáticamente**
  al generar (no hay flag de doping; Fase C). La **liberación es MANUAL** (confirmado Fede 2026-06-08):
  la línea queda retenida hasta que la secretaría la **habilita a mano** cuando llega el resultado del
  control anti-doping (RPC `liberar_linea`, botón "Habilitar" en Pagos). `fecha_liberacion` (reunión +
  `dias_antidoping`, ~30) es **solo referencia**, NO libera sola. El **recibo se puede emitir apenas
  termina la carrera** con lo demás; las retenidas se excluyen del pago hasta habilitarlas y se cobran
  en un recibo posterior.

## 8bis. Recibo — qué incluye (CONFIRMADO 2026-06-08)
El recibo incluye **todo lo pagable** del beneficiario cruzando reuniones (premios, bonos, incentivos,
actuaciones), **salvo lo retenido** no habilitado. Peón/capataz/sereno se pagan dentro del recibo del
**entrenador** (ADR-025), no tienen recibo propio.

## 8ter. Autorizaciones — pendiente v1.2 (ISSUE-028)
Quien cobra puede ser el beneficiario **o un autorizado**. Se modela como **tabla guardada**:
autorizante (cualquiera que cobra: propietario/profesional) → autorizado (nombre + DNI), con vigencia.
ABM + validación en el flujo de pago. Hoy v1.1 captura cobrador libre (nombre+DNI) sin validar; la
tabla de autorizados es **v1.2**.

## 9. Resumen de reunión (Bloque D) — CONFIRMADO

Reporte al cierre de la reunión: total pagado (premios + bonos + actuaciones + incentivos) y
**quién queda pendiente de cobrar**. Derivable del estado de las líneas (sección 8).

-----

## Gaps técnicos de A+B a resolver (de la auditoría)

> **Actualización 02/06/2026:** los gaps de fondo solidario, bono 6-8, incentivos y config-por-club están RESUELTOS en `feat/liquidaciones-cd` (Fase 1+2). Siguen pendientes: oficializar reunión, consolidación por persona vía `recibos`, numeración de recibo (schema listo, falta UI), forma de pago/cobrador, y retención anti-doping. **Nuevo bloqueante detectado:** `inscripciones.propietario_id` está NULL (0/87) y `spc_propietarios` vacía → sin dueño no se liquida el propietario ni el bono 6-8 (ver GOTCHA #47 / ISSUE-001). Los ítems resueltos quedan abajo como referencia histórica.

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
