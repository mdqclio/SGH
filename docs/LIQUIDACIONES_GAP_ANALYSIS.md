# Liquidaciones — Gap Analysis (implementación actual vs modelo cerrado)

> Fecha: 2026-06-08 · Rama: `docs/liquidaciones-gap-analysis` (creada desde `main`)
> Tipo: **análisis / planificación, solo lectura.** No se tocó código, DB ni migraciones.
> Spec de verdad: [`docs/LIQUIDACIONES_MODELO.md`](LIQUIDACIONES_MODELO.md) (modelo CERRADO, secciones 1-9 + gaps A+B).

## Fuentes verificadas

- **Código:** `liquidaciones.html` (en `main`, post-merge de hoy `ccef143`), `premios-utils.js`.
- **DB:** `information_schema.columns` + `pg_type`/`pg_enum` + counts vía MCP Supabase (live, 2026-06-08).
- **Spec:** `docs/LIQUIDACIONES_MODELO.md`, `CLAUDE.md`, `docs/MODELO_NUMERACION.md`, `docs/GOTCHAS.md`, `docs/SCHEMA.md`.

## TL;DR

**Lo de Fase 1 + Fase 2 YA ESTÁ EN `main`** (entró con el merge de hoy): reparto por config, fondo solidario ruteado, fix del bono 6-8, bono ganador, piso mínimo, incentivos Bloque C. La auditoría vieja que los listaba como pendientes quedó desactualizada.

**El gap restante es casi todo CÓDIGO, no schema.** La Fase 0 (schema C+D) dejó en la DB **todas** las columnas/tablas/enums para lo que falta (estado de línea, retención anti-doping, recibos por persona, numeración por secuencia, forma de pago/cobrador). Están presentes y **sin usar** por el frontend:

| Estructura DB | Estado | Uso por código |
|---|---|---|
| `recibos` (tabla completa) | existe, **0 filas** | **NO se usa** — `imprimirRecibo()` imprime una liquidación suelta |
| `club_secuencias` | existe, **0 filas** | **NO se usa** — numeración correlativa sin implementar |
| `liquidacion_detalle.estado_linea` (`impago/pagado/retenido`) | existe, default `impago` | **NO se setea** — las 45 filas reales están todas `impago` |
| `liquidacion_detalle.fecha_liberacion` | existe (nullable) | **NO se setea** — sin retención anti-doping |
| `liquidacion_detalle.recibo_id` / `pagado_at` | existe (nullable) | **NO se setea** |
| `liquidacion_config.dias_antidoping` (default 30) | existe | **NO se lee** |
| `liquidacion_config.retencion_dgi_pct` | existe (nullable) | sin lógica (correcto: Dolores no retiene) |

**Bloqueante de DATOS (no de código):** `inscripciones.propietario_id` = **10/95** cargados (85 NULL); `spc_propietarios` = **0 filas**. Sin dueño no se liquida el propietario ni el bono 6-8 de esos caballos (GOTCHA #47). Era 0/87 en la auditoría previa; hubo backfill parcial.

---

## 1. Estado actual — mapa de la implementación

### `generarLiquidaciones()` — `liquidaciones.html:571-855`

Flujo: lee `carreras` (bolsa + `distribucion_premios`), `resultados` filtrando **`estado='oficial'`** (`:601`), `inscripciones` (≠forfait), `resultado_posiciones` (posición no nula, no descalificado). Arma `actorMap` por persona/rol y persiste una fila `liquidaciones` + N `liquidacion_detalle` por actor.

- **% de reparto: desde config, NO hardcodeados** (Fase 1 hecha). `PCTS` se arma desde `liqConfig.pct_*` en `:613-620`; fondo/incentivos en `:622-624`. Fallback de distribución por puesto nacional `{1:60,2:19,3:12,4:6,5:3}` en `:611` (es la distribución por puesto, no los % de rol).
- **Empates (dead-heat):** manejados por corrida de filas `empate=true` consecutivas (`:680-768`), promedio de premios y bono dividido. Documentado contra GOTCHA #45.

### `calcPremio()` — `liquidaciones.html:629-637`

`bolsa * pct/100` + **bono al ganador fundido en 1°** (`:634`, `dist.bono_ganador`) + **piso `ganancia_minima`** (`:635-636`). El bono ganador se reparte por roles (decisión Fase 2 P3). El piso también vive en `premios-utils.js` (`calcPremiosConPiso`, no invocado desde el flujo principal — utilitario paralelo).

### `calcBono68()` — `liquidaciones.html:643-650` (bug RESUELTO)

El bono 6°-8° ya **no es código muerto**. Función separada que lee `dist.bono_posicion_{desde,hasta,monto}` y se aplica en `:758-766` **100% al propietario**, `concepto_tipo='bono'`, neto, sin reparto entre roles, con división por empate. El comentario `:639-642` documenta el bug viejo (calcPremio devolvía 0 antes de llegar a 6-8).

### Fondo solidario — `liquidaciones.html:747-754` (RESUELTO)

2% del premio efectivo ruteado al **club** (`addActor(CLUB_ID,'club',…)`), `concepto_tipo='fondo_solidario'`. La liquidación del club va sin `propietario_id`/`profesional_id` (`:843-845`, render "Fondo solidario (club)" en `:470`). No incluye el bono 6-8.

### Incentivos Bloque C — `liquidaciones.html:771-801` (RESUELTO)

Una línea por jockey/entrenador que **largó** (`no_largo=false`) estando **ratificado** (`:781`), monto fijo desde `liqConfig.incentivo_{jockey,entrenador}_monto`, neto, `concepto_tipo='incentivo_jockey'/'incentivo_entrenador'`. Solo se genera si el monto > 0.

### Descuentos — `liquidaciones.html:805-835`

`comision_config.descuento_fondo_solidario_pct + descuento_incentivo_pct`, **solo sobre `concepto_tipo='premio'`** (`:816`); bono/incentivo/fondo van netos. Multi-tenant: existe la maquinaria de descuentos pero para Dolores el modelo dice 0 (único descuento real = el 2% del fondo, que es reparto, no descuento de recibo).

### Persistencia — `liquidaciones.html:837-851`

`liquidaciones` (`club_id, reunion_id, estado='borrador', total_bruto, total_descuentos`; `total_neto` es GENERATED). `liquidacion_detalle` con `concepto_tipo, posicion, inscripcion_id, beneficiario_tipo, beneficiario_id, reunion_id`. **NO** se setea `estado_linea` (queda default `impago`), `fecha_liberacion`, `recibo_id`, `pagado_at`, `carrera_id`.

### Estados / recibo — `liquidaciones.html:497-568`

- `cambiarEstado()` (`:497`): flujo `borrador → aprobada → pagada` a nivel **liquidación entera** (no por línea, no idempotente real). Enum `estado_liquidacion = {borrador,aprobada,pagada,anulada}`.
- `imprimirRecibo()` (`:539-568`): `window.print()` de **una** liquidación (= una persona en una reunión). **No** toca `recibos`, **no** asigna `numero_recibo`, **no** captura forma de pago / cobrador / DNI, **no** consolida cruzando reuniones, **no** excluye líneas retenidas.

### RPC

- `aplicar_resultado` (existe) — guarda posiciones+apuestas con optimistic lock; setea `resultados.estado` (`p_estado`). Es el punto donde una carrera pasa a `oficial`.
- **NO existen** `oficializar_reunion`, `emitir_recibo`, ni función de secuencia (`siguiente_numero`). Confirmado en `pg_proc`.

### `reuniones.estado`

Valores reales en DB: `borrador, programada, publicada, finalizada`. **No hay estado `oficial` a nivel reunión.** El filtro "oficial" del modelo vive en **`resultados.estado`** (`oficial:3, provisional:3` en DB). "Oficializar reunión" = pasar los resultados de la reunión a `oficial` en bloque — hoy se hace carrera por carrera vía `aplicar_resultado`, sin botón de reunión.

### Estado de la implementación por fase del modelo

| Fase modelo | Estado |
|---|---|
| Fase 0 (schema C+D) | ✅ en DB (todas las columnas/tablas/enums) |
| Fase 1 (config por club) | ✅ en `main` (código usa `liquidacion_config`) |
| Fase 2 (fondo + bono 6-8 + incentivos) | ✅ en `main` |
| Fase 2bis (oficializar) | ⏳ falta |
| Fase 3 (estado de línea + anti-doping) | ⏳ schema sí, código no |
| Fase 4 (recibos por persona on-demand) | ⏳ schema sí, código no |
| Fase 5 (resumen de reunión) | ⏳ falta |
| Fase 6 (validar A+B con R5 real) | ⏳ falta (bloqueado por datos) |

---

## 2. Gap analysis por sección del modelo

Leyenda: ✅ IMPLEMENTADO · 🟡 PARCIAL · ❌ FALTANTE

### §1 Reparto 1°-5° por % de rol — ✅ IMPLEMENTADO

`PCTS` desde `liquidacion_config` (`liquidaciones.html:613-620`); columnas `pct_propietario..pct_sereno` con defaults 70/10/10/4/3/1 en DB. Peón/capataz/sereno como sub-líneas bajo el entrenador (`:725-729`, `:824-834`, ADR-025). **Ya no está hardcodeado.** Falta solo: UI de edición ya existe (`saveReparto` `:396`, valida suma=100 con el 2% incluido).

### §2 Fondo solidario 2% ruteado — ✅ IMPLEMENTADO

Ruteado al club como `concepto_tipo='fondo_solidario'` (`:747-754`). No genera recibo, se acumula a nivel club. **Ya no queda sin asignar.**

### §3 Bonos — ✅ IMPLEMENTADO (los tres)

- **250k ganador:** fundido en premio del 1° (`:634`), configurable vía `dist.bono_ganador`.
- **Piso mínimo:** `Math.max` implícito en `calcPremio` (`:635-636`) y `calcPremiosConPiso`.
- **Bono 6°-8°:** bug **arreglado** — `calcBono68` (`:643-650`) paga 100% al propietario (`:758-766`). El monto sale de `distribucion_premios.bono_posicion_monto` (configurable por carrera).

### §4 Incentivos Bloque C — ✅ IMPLEMENTADO

Líneas por jockey/entrenador que largó+ratificado, monto configurable (`:771-801`). 🟡 Matiz menor: el modelo dice "estaba cargado en el programa"; el código usa "largó (no_largo=false) y ratificado", que es equivalente operativo. Sin pago de "monta perdida" aparte (correcto).

### §5 Descuentos (solo 2% fondo) — ✅ IMPLEMENTADO

Maquinaria de descuentos multi-tenant en `comision_config`, solo sobre premios (`:816`). Para Dolores el único "descuento" real es el fondo (que es reparto). Correcto por diseño.

### §6 Retención impositiva — ✅ IMPLEMENTADO por diseño

`liquidacion_config.retencion_dgi_pct` y `recibos.retencion_dgi` nullable, **sin lógica de cálculo** — exactamente lo que pide el modelo (Dolores no retiene; campo dejado para multi-tenant).

### §7 Recibo por persona, on-demand, cruzando reuniones — ❌ FALTANTE (gap grande)

Schema 100% presente (`recibos`), código 0%. Hoy:
- `imprimirRecibo()` imprime **una liquidación = una persona en UNA reunión**. No consolida varias carreras/reuniones.
- `numero_recibo` **no se asigna** (ni `liquidaciones.numero_recibo` varchar legacy, ni `recibos.numero_recibo` integer NOT NULL). `club_secuencias` vacía.
- Forma de pago (efectivo+firma / transferencia+comprobante), cobrador+DNI: **no se capturan** (columnas `recibos.forma_pago` enum `{efectivo,transferencia}`, `cobrador_nombre`, `cobrador_documento`, `comprobante_url` presentes, sin usar).
- No excluye líneas retenidas (porque tampoco hay retención — ver §8).

### §8 Estado de cada línea (impago / pagado idempotente / retenido anti-doping) — ❌ FALTANTE en código (schema sí)

- Enum `estado_linea_liq = {impago,pagado,retenido}` y `fecha_liberacion`/`pagado_at`/`recibo_id` presentes. `liquidacion_config.dias_antidoping` default 30.
- Código: **nunca setea estado_linea** → las 45 filas reales están todas `impago`. Sin lógica de "retenido automático para 1° y 2°" ni fecha de liberación (`fecha_reunion + dias_antidoping`). Sin "pagado idempotente" real (el `cambiarEstado` es a nivel liquidación, no marca líneas ni evita doble pago por línea).

### §9 Resumen de reunión (Bloque D) — ❌ FALTANTE

No hay reporte de total pagado + quién queda pendiente. Es derivable de `liquidacion_detalle.estado_linea` una vez que §8 exista.

### Gaps técnicos A+B

| Gap (modelo) | Estado | Evidencia |
|---|---|---|
| Filtro `estado='oficial'` | 🟡 funciona, falta botón | filtra `resultados.estado='oficial'` (`:601`); sin botón "Oficializar reunión" en bloque |
| `liquidaciones.reunion_id` obligatorio → consolidación cruzando reuniones | ❌ | `reunion_id NOT NULL` (DB); solución = `recibos` + línea como unidad de deuda (sin usar) |
| `numero_recibo` correlativo | ❌ | `recibos.numero_recibo` NOT NULL **sin default**; `club_secuencias` vacía; no se asigna |
| Forma de pago / firma / cobrador+DNI | ❌ (schema sí) | columnas en `recibos`, sin captura en UI |
| Estado "retenido anti-doping" + fecha liberación 1°/2° | ❌ (schema sí) | `estado_linea`/`fecha_liberacion`/`dias_antidoping` sin uso |
| Bug bono 6-8 | ✅ resuelto | `calcBono68` |
| Fondo solidario sin rutear | ✅ resuelto | `:747-754` |
| %s + incentivos hardcodeados | ✅ resuelto | `liquidacion_config` |
| Incentivos jockey/entrenador inexistentes | ✅ resuelto | `:771-801` |
| **Dato:** `inscripciones.propietario_id` NULL | ❌ bloqueante | 10/95 cargados; `spc_propietarios` 0 filas |

---

## 3. Plan por fases (menor → mayor riesgo)

> Convención de riesgo: 🟢 bajo (solo lectura/datos o solo escribe `liquidacion*`), 🟡 medio (UI/flujo nuevo aislado), 🔴 alto (toca el flujo de save/RPC de resultados o introduce numeración concurrente/idempotencia).

### Fase A — Backfill de propietarios 🟢 (datos, no código)
Cargar `inscripciones.propietario_id` (85 NULL) y/o poblar `spc_propietarios`. **No toca save/RPC.** Desbloquea liquidación de propietario + bono 6-8. Pre-requisito de la validación real (Fase F). Riesgo: necesita el dato de mapeo SPC→propietario (mismo tipo de bloqueo que el de caballeriza de la sesión de seguridad).

### Fase B — Oficializar reunión 🟡/🔴
Botón que pasa los `resultados` de la reunión a `estado='oficial'` en bloque, con validación (todas las carreras con resultado cargado, etc.). **Marca riesgo:** toca el dominio del flujo de save de `resultados` (idealmente un RPC `oficializar_reunion` análogo a `aplicar_resultado`, con lock). Sin esto, A+B solo liquida lo ya oficial carrera-por-carrera. Depende de nada (pero validar con datos requiere A).

### Fase C — Estado de línea + retención anti-doping 🟢
En `generarLiquidaciones`, setear por línea:
- `estado_linea='retenido'` + `fecha_liberacion = fecha_reunion + liquidacion_config.dias_antidoping` para `concepto_tipo='premio'` con `posicion ∈ {1,2}` (automático, sin flag de doping).
- `estado_linea='impago'` para el resto.
- UI: badges por línea en `verDetalle`. **No toca `aplicar_resultado`** — solo escribe `liquidacion_detalle`. Riesgo bajo. Pre-requisito de Fase D y E.

### Fase D — Recibos por persona, on-demand 🔴
Flujo nuevo de emisión:
1. Seleccionar persona → juntar líneas `impago` **liberadas** (excluir `retenido` con `fecha_liberacion` futura) cruzando **todas** sus reuniones (vía `liquidacion_detalle.beneficiario_id`).
2. Asignar `numero_recibo` correlativo por club **atómico** vía `club_secuencias` (RPC `emitir_recibo` con `UPDATE … RETURNING` o `SELECT … FOR UPDATE`).
3. Capturar `forma_pago` (efectivo→firma / transferencia→`comprobante_url`), `cobrador_nombre`, `cobrador_documento`.
4. Crear fila `recibos`, marcar líneas `estado_linea='pagado'` + `recibo_id` + `pagado_at` (**idempotente**: no re-pagar líneas ya con `recibo_id`).
5. Reescribir `imprimirRecibo` para imprimir desde `recibos` + sus líneas.
**Riesgo alto:** numeración concurrente + idempotencia de pago. Depende de C (necesita estado_linea/liberación) y A (propietario).

### Fase E — Resumen de reunión (Bloque D) 🟢
Reporte read-only: total pagado (premios+bonos+incentivos) y pendientes, derivado de `liquidacion_detalle.estado_linea`/`recibo_id`. Depende de C (y se enriquece con D).

### Fase F — Validar A+B con R5 real 🟢
Correr el ciclo completo sobre R5 una vez backfilleados los propietarios (A) y oficializada (B). Cierra el modelo. Depende de A+B+C+D.

### Grafo de dependencias
```
A (datos) ─┐
B (ofic.) ─┼─► F (validar)
C (línea) ─┴─► D (recibos) ─► E (resumen) ─► F
```
Orden sugerido de ejecución: **A → C → B → D → E → F** (A y C son independientes y de bajo riesgo; B antes de D para tener data oficial; D es el grande).

---

## Apéndice — schema/enums reales (verificado en DB 2026-06-08)

```
estado_liquidacion   = {borrador, aprobada, pagada, anulada}
estado_linea_liq     = {impago, pagado, retenido}
estado_recibo        = {emitido, anulado}
forma_pago_recibo    = {efectivo, transferencia}
beneficiario_tipo    = {profesional, propietario, club}
concepto_liq         = {premio, bono, actuacion, incentivo_jockey, incentivo_entrenador, fondo_solidario}

liquidacion_config:  pct_propietario(70) pct_entrenador(10) pct_jockey(10) pct_peon(4)
                     pct_capataz(3) pct_sereno(1) pct_fondo_solidario(2)
                     incentivo_jockey_monto(0) incentivo_entrenador_monto(0)
                     dias_antidoping(30) retencion_dgi_pct(null)
liquidaciones:       reunion_id NOT NULL · numero_recibo varchar(null) · total_neto GENERATED
liquidacion_detalle: estado_linea(impago) fecha_liberacion pagado_at recibo_id
                     beneficiario_{tipo,id} reunion_id concepto_tipo posicion inscripcion_id
                     monto_neto GENERATED
recibos:             numero_recibo int NOT NULL (sin default) · forma_pago · cobrador_{nombre,documento}
                     comprobante_url · retencion_dgi · neto_a_cobrar · estado(emitido)
club_secuencias:     club_id, tipo, ultimo_numero(0)

Datos: inscripciones.propietario_id 10/95 · spc_propietarios 0 · recibos 0
       club_secuencias 0 · liquidacion_detalle 45 (todas impago)
       resultados oficial:3/provisional:3
```
