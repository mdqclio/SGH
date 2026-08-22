# Estado R8 — Reunión del 16/08/2026

**Consulta de solo lectura** contra prod (`unlhcuanfrtpatoipwve`), ejecutada el **29/07/2026**.
No se modificó schema ni datos. Guard verificado: `pwd=/home/clio/dev/SGH`, `SELECT count(*) FROM spcs` = **144**.

Club: Hipódromo de Dolores — `0649e9c5-9e87-4aad-842f-101458e6b33c`.

---

## Respuesta corta

**Sí, la reunión del 16/08 existe** (R8, `7b6e003e-22e2-4629-bf55-f18560b1260f`), estado `publicada`, con las **12 carreras creadas** — pero con **0 inscripciones**.

**El hito de sacar el programa por sistema corre riesgo, pero todavía no está perdido.** El precedente bueno (R6) cargó las 125 inscripciones **8 días antes** de la fecha de reunión. Hoy faltan **18 días** para el 16/08, así que la ventana de carga todavía no llegó. El riesgo real no es el calendario sino que R7 —la reunión intermedia— **nunca recibió una sola inscripción** antes de ser cancelada, así que no hay evidencia de que el circuito de carga se haya vuelto a ejercitar desde el 12/06.

---

## 1. Todas las reuniones del club de Dolores

Ordenadas por fecha. `carreras` e `inscripciones` contadas vía `carreras.reunion_id` → `inscripciones.carrera_id`.

| # | Fecha | Estado | created_at (UTC) | Carreras | Inscripciones |
|---:|---|---|---|---:|---:|
| 1 | 2026-01-18 | finalizada | 2026-05-09 03:06 | 0 | 0 |
| 2 | 2026-02-08 | finalizada | 2026-04-22 11:20 | 0 | 0 |
| 3 | 2026-03-22 | finalizada | 2026-04-22 05:27 | 0 | 0 |
| 4 | 2026-04-19 | finalizada | 2026-05-07 02:43 | 0 | 0 |
| 5 | 2026-05-17 | finalizada | 2026-04-22 11:18 | 0 | 0 |
| **6** | **2026-06-20** | **publicada** | 2026-05-09 03:05 | **11** | **125** |
| **7** | **2026-07-19** | **cancelada** | 2026-05-09 03:33 | **12** | **0** |
| **8** | **2026-08-16** | **publicada** | 2026-05-09 03:37 | **12** | **0** |
| 9 | 2026-09-06 | programada | 2026-05-09 03:43 | 0 | 0 |
| 10 | 2026-10-11 | programada | 2026-05-09 03:39 | 0 | 0 |
| 11 | 2026-11-01 | programada | 2026-05-09 03:39 | 0 | 0 |
| 12 | 2026-12-13 | programada | 2026-05-09 03:39 | 0 | 0 |
| 9999 | 2099-01-01 | cancelada | 2026-06-10 02:31 | 3 | 17 |

Totales de la base: 38 carreras, 142 inscripciones, **0 carreras huérfanas y 0 inscripciones huérfanas** (los conteos de arriba son completos, no hay filas perdidas por FK rota).

### Dos observaciones que salen de esta tabla

1. **R1–R5 tienen 0 carreras y 0 inscripciones.** `CLAUDE.md` documenta a R5 (17/05) como la reunión de prueba con "11 turnos, ~81 inscripciones". Eso **ya no está en la base**: las 142 inscripciones vivas son 125 de R6 + 17 de la reunión de prueba 9999. Si algún probe o instructivo todavía apunta a R5 como reunión activa de testing, va a encontrarla vacía. (Solo se reporta; no se tocó nada.)
2. **La reunión de prueba 9999 (PRUEBA RESUMEN) sigue viva**, con 3 carreras y 17 inscripciones. `CLAUDE.md` marcaba borrarla con `teardown_prueba_resumen_9999.sql` antes del 20/06. Sigue pendiente, 39 días después.

---

## 2. R8 — 16/08/2026 en detalle

| Campo | Valor |
|---|---|
| ID | `7b6e003e-22e2-4629-bf55-f18560b1260f` |
| Número | 8 |
| Fecha | 2026-08-16 (**faltan 18 días**) |
| Estado | `publicada` |
| created_at | 2026-05-09 03:37 UTC (99 días antes de la fecha) |
| Carreras | **12** — todas en estado `abierta` |
| Inscripciones | **0** |

Las 12 carreras están armadas con distancia, categoría y bolsa. Ninguna tiene `nombre` ni `cupo_maximo`, y ninguna tiene todavía `numero_carrera_programa` (eso se asigna post-ratificación, así que es lo esperado a esta altura).

**Ventanas de inscripción — cargadas solo en 2 de 12 turnos:**

| Turno | Distancia | Bolsa | Apertura insc. | Cierre insc. | Cierre ratif. |
|---:|---:|---:|---|---|---|
| 1 | 1000 m | 1.054.166,67 | 2026-08-03 08:30 | 2026-08-07 08:30 | 2026-08-10 12:00 |
| 2 | 800 m | 1.016.666,67 | 2026-08-03 08:30 | 2026-08-07 12:00 | 2026-08-10 12:00 |
| 3 | 1200 m | 1.118.333,33 | — | — | — |
| 4 | 1000 m | 1.000.000,00 | — | — | — |
| 5 | 1000 m | 1.166.666,67 | — | — | — |
| 6 | 1000 m | 1.166.666,67 | — | — | — |
| 7 | 1100 m | 1.166.666,67 | — | — | — |
| 8 | 1200 m | 1.191.666,67 | — | — | — |
| 9 | 1200 m | 1.191.666,67 | — | — | — |
| 10 | 1000 m | 3.333.333,33 | — | — | — |
| 11 | 1100 m | 1.833.333,33 | — | — | — |
| 12 | 800 m | 1.750.000,00 | — | — | — |

Los turnos 3–12 tienen las tres fechas en `NULL`. Vale aclarar que **R6 salió bien con las 11 carreras en `NULL`** en esos mismos campos, así que el sistema evidentemente no los exige para operar — parecen informativos más que bloqueantes. Aun así, los turnos 1 y 2 de R8 sí las tienen cargadas, lo que sugiere una carga empezada y no terminada.

Del calendario declarado en los turnos 1–2, si se respeta para toda la reunión:

- **Apertura de inscripción: 03/08** — dentro de 5 días, 13 días antes de la reunión.
- **Cierre de inscripción: 07/08** — 9 días antes de la reunión.
- **Cierre de ratificación: 10/08** — 6 días antes de la reunión.

---

## 3. Contexto comparativo — R6 (salió bien) vs R7 (suspendida)

Días contados contra la fecha de la reunión (positivo = antes).

| | R6 — 20/06 | R7 — 19/07 | R8 — 16/08 |
|---|---|---|---|
| Estado | publicada | **cancelada** | publicada |
| Registro de reunión creado | 09/05 03:05 → **42 días antes** | 09/05 03:33 → **71 días antes** | 09/05 03:37 → **99 días antes** |
| Carreras | 11 | 12 | 12 |
| Inscripciones | **125** | **0** | **0** |
| Primera inscripción | 2026-06-12 19:42 → **8 días antes** | — (nunca) | — (aún no) |
| Última inscripción | 2026-06-12 22:16 → **8 días antes** | — (nunca) | — (aún no) |

Notas sobre esta comparación:

- **Las 12 reuniones del año se crearon el mismo día** (09/05, salvo R2/R3/R4 el 22/04 y 07/05). La columna "días antes de crearse el registro" no mide agilidad operativa — mide nada más que se cargó el calendario anual de una sentada. No es una señal útil de riesgo.
- **Lo que sí es señal: la carga de inscripciones.** En R6 las 125 inscripciones entraron **en una sola sesión de 2 h 34 min**, el 12/06 entre 19:42 y 22:16 UTC — 8 días antes de la reunión. No fue carga incremental de secretaría a lo largo de días; fue una carga en bloque.
- **R7 no tiene inscripciones para medir.** Se le crearon las 12 carreras y se canceló sin que entrara ni una inscripción. No hay "días antes" que reportar. La consecuencia importante: **el circuito de inscripciones no se ejerció desde el 12/06**, hace 47 días.

---

## Lectura de riesgo para el hito

**Lo que no es riesgo:** que R8 tenga hoy 0 inscripciones. Con el patrón de R6 (carga en bloque a 8 días), lo esperable sería que la carga ocurra alrededor del **08/08**. Faltan 18 días; no hay atraso todavía.

**Lo que sí es riesgo:**

1. **Un solo precedente exitoso, y con 47 días de antigüedad.** R6 es la única reunión que se llevó por sistema de punta a punta. R7 se canceló antes de probar nada. Si algo se rompió entre medio, no lo sabemos.
2. **La carga en bloque concentra el riesgo.** 125 inscripciones en una sesión de 2,5 h a 8 días de la reunión no deja margen: si esa noche algo falla, quedan 8 días para diagnosticar, arreglar, desplegar y recargar.
3. **Ventanas de inscripción a medio cargar.** Turnos 1–2 con fechas, 3–12 vacíos. No es bloqueante (R6 corrió con todas en `NULL`), pero es un indicio de carga interrumpida — vale confirmar con Fede si el calendario de los turnos 1–2 aplica a toda R8.
4. **`inscripciones.propietario_id`** sigue siendo el bloqueante de datos conocido para liquidaciones (GOTCHA #47). No afecta la salida del *programa*, pero sí lo que viene después.

**Sugerencia:** fijar el 03/08 (apertura declarada en los turnos 1–2) como fecha de control. Si al 08/08 R8 sigue en 0 inscripciones, ahí sí el hito está comprometido.

---

## SQL ejecutado (todo SELECT)

```sql
-- Guard
SELECT count(*) FROM spcs;                       -- 144

-- 1. Listado de reuniones
SELECT r.id, r.numero, r.fecha, r.estado, r.created_at,
  (SELECT count(*) FROM carreras c WHERE c.reunion_id = r.id) AS carreras,
  (SELECT count(*) FROM inscripciones i
     JOIN carreras c2 ON c2.id = i.carrera_id
    WHERE c2.reunion_id = r.id) AS inscripciones
FROM reuniones r
WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
ORDER BY r.fecha;

-- 3. Primera/última inscripción por reunión
SELECT c2.reunion_id, r.numero, r.fecha, count(*) AS insc,
  min(i.created_at) AS primera, max(i.created_at) AS ultima,
  (r.fecha - min(i.created_at)::date) AS dias_antes_primera,
  (r.fecha - max(i.created_at)::date) AS dias_antes_ultima,
  (r.fecha - r.created_at::date)      AS dias_antes_creacion_reunion
FROM inscripciones i
JOIN carreras c2  ON c2.id = i.carrera_id
JOIN reuniones r  ON r.id  = c2.reunion_id
WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
GROUP BY c2.reunion_id, r.numero, r.fecha, r.created_at
ORDER BY r.fecha;

-- Control de integridad de los conteos
SELECT (SELECT count(*) FROM inscripciones) AS insc_total,
       (SELECT count(*) FROM carreras)      AS carreras_total,
       (SELECT count(*) FROM inscripciones i
          LEFT JOIN carreras c ON c.id = i.carrera_id
         WHERE c.id IS NULL)                AS insc_huerfanas,
       (SELECT count(*) FROM carreras c
          LEFT JOIN reuniones r ON r.id = c.reunion_id
         WHERE r.id IS NULL)                AS carreras_huerfanas;

-- 2. Detalle de carreras R7/R8 y de R6 (baseline)
-- (SELECT sobre carreras + subconsultas de conteo por carrera)
```

**Nota:** `carreras` no tiene columna `created_at`, así que no se puede fechar cuándo se armó cada turno — solo cuándo se creó la reunión. Es una limitación de la consulta, no un dato faltante que se pueda buscar en otro lado.
