# R8 — Estado de liquidaciones post-oficialización

Fecha: 2026-08-19 · Rama: `diag/initauth-activo` · Base: `e486926`
Reunión: R8 · `numero=8` · `numero_publico=7` · 16/08/2026 · Dolores
`reunion_id = 7b6e003e-22e2-4629-bf55-f18560b1260f`

Alcance: **read-only**. Sólo `SELECT` por MCP. Ninguna escritura, ningún DDL, ninguna migración.
Objetivo: decidir si Valeria puede empezar a pagar.

---

## Respuesta corta para Valeria

**Sí, puede arrancar.** Hay **$5.484.542,00** en 178 líneas pagables hoy.
Quedan **$9.767.376,66** (46 líneas, 64% del total) retenidos por anti-doping hasta el **15/09/2026**.

Salvedad: dentro de esas 178 impagas están las 40 líneas de fondo solidario ($285.162,00), que no se le
pagan a ninguna persona. Descontadas, lo efectivamente pagable a gente es **$5.199.380,00**.

---

## 1 · Carreras oficiales

12 turnos, 4 anulados (turnos 1, 6, 7, 9 — sin resultado). Los **8 turnos con carrera real están todos
`resultados.estado = 'oficial'`**.

| turno | programa | nombre | estado carrera | resultado | oficializada |
|---|---|---|---|---|---|
| 2 | 1 | PACHAMAMA | confirmada | oficial | 16/08 17:54 |
| 3 | 7 | FUERZA AÉREA ARGENTINA | confirmada | oficial | 17/08 23:40 |
| 4 | 3 | DIA DEL VETERINARIO | confirmada | oficial | 18/08 14:05 |
| 5 | **4** | DIA DEL FOLKLORE | confirmada | oficial | **19/08 13:29** |
| 8 | **8** | SANTA ROSA | confirmada | oficial | **19/08 13:36** |
| 10 | 5 | DÍA DEL NIÑO | confirmada | oficial | 18/08 14:03 |
| 11 | 6 | ANIV- DOLORES PRIMER PUEBLO PATRIO | confirmada | oficial | 17/08 23:38 |
| 12 | 2 | GRAL JOSÉ DE SAN MARTIN | **abierta** | oficial | 17/08 23:28 |

Las dos que estaban trabadas por dividendos (programa 4 y programa 8) se oficializaron hoy, y son las dos
últimas del lote — consistente con lo que reportó Yesi.

**Detalle a corregir en algún momento:** el turno 12 quedó con `carreras.estado = 'abierta'` mientras las otras
siete están en `'confirmada'`. El resultado está oficial, así que no bloquea el pago, pero el estado de la
carrera quedó desalineado.

---

## 2 · Liquidaciones, líneas y monto

| | ahora | post-recálculo | delta |
|---|---|---|---|
| Liquidaciones | **93** | — | — |
| Líneas | **225** | 199 | **+26** |
| Total neto | **$15.321.918,66** | $13.015.055,32 | **+$2.306.863,34** |

Controles de integridad:
- `sum(liquidacion_detalle.monto_neto)` = `sum(liquidaciones.total_neto)` = **$15.321.918,66**. Cuadra exacto.
- Contar por `liquidacion_detalle.reunion_id` da las mismas 225 líneas que el join por `liquidacion_id`.
  No hay líneas huérfanas ni cabeceras sin detalle.

---

## 3 · Desglose por rol

| `beneficiario_tipo` | líneas | monto |
|---|---|---|
| propietario | **49** | $10.882.078,33 |
| profesional | 136 | $4.154.678,33 |
| club (fondo solidario) | 40 | $285.162,00 |
| **total** | **225** | **$15.321.918,66** |

Ninguna línea sin `beneficiario_tipo`.

**Propietario: 12 → 41 → 49.** Los +8 desde el recálculo se corresponden con la oficialización de las dos
carreras que faltaban (una línea de propietario por puesto pagado en cada una).

### Qué es `beneficiario_tipo = 'club'`

Es el **fondo solidario**, con otro nombre de rol. Verificado: las 40 líneas tienen todas
`concepto_tipo = 'fondo_solidario'`, y ninguna otra. No hay ningún otro concepto bajo ese rol.
La descripción de cada una lo dice literal: `Fondo solidario 2% (premio: $X)`.

Son 8 carreras × 5 puestos = 40 líneas, una por premio pagado.

Comprobación del 2%:

```
$285.162,00 / 0,02 = $14.258.100,00 de premios base
```

Cierra con la bolsa de ~$14 M. El 2% es exacto, no aproximado. Ejemplos verificables línea por línea:
carrera 5 / 1° puesto → premio $2.000.000,00 → fondo $40.000,00; carrera 6 / 1° → $1.100.000,00 → $22.000,00.

El modelo reparte a personas (propietario 70 / entrenador 10 / jockey 10 / peón 4 / capataz 3 / sereno 1) y el
2% restante queda en el club: por eso el `beneficiario_tipo` es `'club'` y no un rol de persona. El concepto
correcto sí está guardado, en `concepto_tipo`.

**Pendiente de verificar (anotado, no tocado):** si estas 40 líneas aparecen en el buscador de Pagos de Valeria.
Si aparecen, hay que excluirlas — no hay a quién pagárselas.

### Composición de `profesional` (136 líneas)

- `incentivo_jockey`: 19 líneas · $950.000,00 ($50.000 por jockey por reunión)
- `incentivo_entrenador`: 42 líneas · $420.000,00 ($10.000 por caballo corrido)
- `premio`: el resto, repartido entre entrenador y jockey por puesto

### Composición de `propietario` (49 líneas)

- `premio`: por puesto, 70% de la bolsa
- `bono`: 13 líneas de $100.000,00 c/u (bonos 6°, 7° y 8° puesto, 100% propietario)

---

## 4 · Dividendos de las dos carreras destrabadas

Ambas quedaron cargadas, con `vacante` marcado donde corresponde. Ninguna quedó sin filas ni con dividendo en cero.

**Programa 4 / turno 5 — DIA DEL FOLKLORE** (7 filas)

| tipo | div_orig | vacante |
|---|---|---|
| GAN | 3,20 | no |
| SEG | 164,90 | no |
| SEG | 3,40 | no |
| EX | 2.055,30 | no |
| IM | 1.387,00 | no |
| X2 | 1.929,60 | no |
| **X3** | null | **VAC ✔** |

**Programa 8 / turno 8 — SANTA ROSA** (7 filas)

| tipo | div_orig | vacante |
|---|---|---|
| GAN | 5,90 | no |
| SEG | null | **VAC** |
| SEG | null | **VAC** |
| EX | 10.608,00 | no |
| IM | 18.240,00 | no |
| X2 | 3.429,80 | no |
| **X4** | null | **VAC ✔** |

El X3 de la 4ª (programa) y el X4 de la 8ª tienen VAC, que es lo que se preguntó. **Confirmado.**

⚠ **A revisar con Yesi:** en SANTA ROSA los **dos slots de SEG también quedaron VAC**. Puede ser correcto
(no hubo acertantes) o puede ser carga incompleta. No afecta la liquidación, sí el programa impreso.

Para referencia, la otra carrera oficializada el 18/08 — **turno 4 / programa 3, DIA DEL VETERINARIO** — está
completa con 10 filas: GAN 7,60 · SEG 1,80 y 3,20 · TER 1,30 ×3 · IM 11.556,00 · TR 79.200,00 · X2 3.060,00 ·
**EX VAC**.

---

## 5 · Línea pagada de QUINTEROS — intacta

Es la **única** línea en estado `pagado` de toda R8. Sin cambios.

| campo | valor |
|---|---|
| `id` | `28b05448-7983-46bb-94ff-213996dbeb82` |
| beneficiario | **QUINTEROS, CARLA ELISABETH** (propietario) |
| `beneficiario_id` | `37fa6583-08bb-47ca-9923-bbe746c88537` |
| concepto | Carrera 1 — 5° puesto |
| descripción | Carrera 1 — 5° puesto — Propietario (bolsa: $100.000,00) |
| `monto_bruto` | $70.000,00 |
| `monto_descuento` | $0,00 |
| `monto_neto` | **$70.000,00** |
| `estado_linea` | `pagado` |
| `pagado_at` | **2026-08-16 18:46:44** |
| `recibo_id` | `77774e4d-6e5a-4015-9466-76fec012e212` |

El 70% de $100.000 da $70.000. El recibo sigue vinculado. La oficialización de las dos carreras nuevas no la tocó.

---

## 6 · Retenidas por anti-doping

| `estado_linea` | líneas | monto | `fecha_liberacion` | con recibo |
|---|---|---|---|---|
| impago | 178 | $5.484.542,00 | — | 0 |
| **retenido** | **46** | **$9.767.376,66** | **2026-09-15** | 0 |
| pagado | 1 | $70.000,00 | — | 1 |
| **total** | **225** | **$15.321.918,66** | | |

Las 46 retenidas tienen **todas la misma fecha de liberación: 15/09/2026** (`min = max`). No hay escalonamiento,
no hay retenidas sin fecha, y ninguna retenida tiene recibo asociado.

---

## 7 · Pagable hoy vs. retenido hasta el 15/09

| | líneas | monto | % del total |
|---|---|---|---|
| **Pagable hoy** (impago) | 178 | **$5.484.542,00** | 35,8% |
| **Retenido hasta 15/09** | 46 | **$9.767.376,66** | 63,7% |
| Ya pagado (QUINTEROS) | 1 | $70.000,00 | 0,5% |

Ajuste sobre lo pagable, si el fondo solidario no debe listarse:

```
$5.484.542,00 − $285.162,00 (40 líneas de fondo solidario) = $5.199.380,00
```

**Valeria puede arrancar con las 178 líneas impagas.** El grueso de la plata — casi dos tercios — no se toca
hasta el 15/09.

---

## Puntos abiertos (ninguno bloquea el pago)

1. Turno 12 con `carreras.estado = 'abierta'` y resultado oficial.
2. SEG doble VAC en SANTA ROSA — confirmar con Yesi si es real o carga incompleta.
3. Fondo solidario en el buscador de Pagos — verificar si aparece y, si aparece, excluirlo.

Nada fue modificado. Sin cambios en código, esquema ni datos.
