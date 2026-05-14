# SGH — Plan de implementación: Módulo Liquidaciones (ISSUE-001)

## Contexto

Liquidaciones es el paso 7 (y último) del workflow end-to-end de una reunión:
`Reuniones → Carta de llamados → Inscripciones → Ratificación → Programa → Resultados → Liquidaciones`

El esqueleto de `liquidaciones.html` existe (611 líneas) con UI completa, ABM de comisiones y flujo de estados. Falta el motor de cálculo.

## Decisiones de diseño previas al Bloque B

Antes de arrancar Bloque B se necesitan respuestas a estas tres preguntas:

1. **Peón/capataz/sereno:** ¿se liquidan como texto libre (nombre en `notas`, sin UUID) o se hace matching contra `profesionales`? Los campos en `inscripciones` son `peon VARCHAR`, `capataz VARCHAR`, `sereno VARCHAR` — no tienen UUID.

2. **Montas perdidas — dónde se configura el monto:** ¿en `comision_config` con nuevo valor de `tipo_cobro`, en `clubs`, o en `reuniones`? El schema actual de `comision_config.tipo_cobro` es un ENUM.

3. **`dividendos` vs `apuestas`:** Resuelto en Bloque A — el código ahora usa `dividendos` (nombre real del campo en DB).

---

## Bloque A — Resultados: schema fixes + testing ✅ COMPLETO (14/05/2026)

**Objetivo:** dejar `resultados.html` sin bugs silenciosos y con schema completo.

### Migraciones aplicadas

| Migración | Cambio |
|---|---|
| `resultados_schema_fixes` | `ALTER TABLE resultado_posiciones ADD COLUMN empate BOOLEAN DEFAULT false` |
| `resultados_schema_fixes` | `ALTER TABLE resultados ADD COLUMN estado_pista VARCHAR(20) CHECK (...)` |
| `resultado_log_con_rls` | Tabla nueva `resultado_log` con RLS Fase 2B |
| `resultado_log_con_rls` | Helper `fn_club_de_resultado()` — vía `fn_club_de_carrera` |

### Fixes en resultados.html (5 cambios)

| # | Qué | Dónde |
|---|---|---|
| 1 | `apuestas:` → `dividendos:` en `resPayload` | `guardarResultado()` |
| 2 | `res.apuestas` → `res.dividendos` en lectura | `renderResumenOficial()` |
| 3 | `res?.apuestas` → `res?.dividendos` en lectura | `renderFormulario()` |
| 4 | `motivo_descalificacion` → `motivo_desc` en insert | `guardarResultado()` |
| 5 | 2× `.catch(()=>{})` → `console.error(...)` | `oficializar()`, `modificarOficial()` |

### Test de persistencia

Ejecutado con datos reales de Dolores (carrera turno 6). Todos los campos verificados:

| Campo | Antes | Después |
|---|---|---|
| `resultado_posiciones.empate` | no existía | ✅ `true/false` persiste |
| `resultado_posiciones.motivo_desc` | escribía a campo inexistente | ✅ persiste |
| `resultados.estado_pista` | no existía | ✅ `'seca'` persiste |
| `resultados.dividendos` | escribía a campo `apuestas` (inexistente) | ✅ JSONB persiste |
| `resultado_log` | tabla inexistente, `.catch` silencioso | ✅ tabla creada, RLS aplicada |

### Pendiente — testing manual end-to-end (humano)

El siguiente paso es que un humano verifique desde el browser:

1. Abrir `resultados.html` y seleccionar una reunión de Dolores
2. Cargar posiciones para al menos 3 carreras distintas
3. En cada carrera, completar: posición de al menos 2 inscriptos, estado de pista, tiempo del ganador, al menos 1 tipo de apuesta con dividendo
4. Marcar al menos 1 inscripto como empate y otro como descalificado (con motivo)
5. Hacer "Guardar provisional" en una carrera → verificar que se puede reabrir y los datos se pre-cargan correctamente
6. Hacer "Hacer oficial" en al menos 3 carreras → verificar badge `✅ Oficial` en la grid
7. Verificar en el SQL Editor de Supabase:
   - `SELECT estado_pista, dividendos, tiempo_ganador FROM resultados WHERE estado='oficial'` — deben tener valores
   - `SELECT empate, motivo_desc FROM resultado_posiciones LIMIT 10` — deben tener valores donde corresponde
   - `SELECT * FROM resultado_log` — deben existir filas de log para cada oficialización
8. Hacer "Modificar" en una carrera oficial → ingresar motivo → verificar que queda en `provisional` y que se registra en `resultado_log`

**Criterio de cierre del Bloque A:** ≥3 carreras con `estado='oficial'` en DB con todos los campos correctamente poblados.

---

## Bloque B — Motor de cálculo completo

**Objetivo:** `generarLiquidaciones()` calcula correctamente para todos los beneficiarios.

**Estimación:** 1-2 sesiones
**Dependencias:** Bloque A completo + respuestas a las 3 decisiones de diseño

**Actores y FKs:**
- Propietario → `inscripciones.propietario_id` (UUID) → 70% del premio
- Entrenador → `inscripciones.entrenador_id` (UUID) → 10%
- Jockey → `inscripciones.jockey_titular_id` (UUID) → 10%
- Peón → `inscripciones.peon` (TEXT) → 4% — decisión pendiente
- Capataz → `inscripciones.capataz` (TEXT) → 3% — decisión pendiente
- Sereno → `inscripciones.sereno` (TEXT) → 1% — decisión pendiente
- Fondo solidario → 2% — no va a persona, es descuento

**Fórmula base:**
```
premio_puesto = bolsa_total * distribucion_premios[posicion] / 100
parte_actor   = premio_puesto * porcentaje_actor / 100
comision      = parte_actor * comision_config.porcentaje / 100  (si aplica)
descuentos    = bruto * (fondo_solidario_pct + incentivo_pct) / 100
neto          = bruto - descuentos
```

**Criterio de cierre:** generar liquidaciones para una reunión y verificar en DB que hay filas para propietario + jockey + entrenador de cada carrera oficializada, con montos matemáticamente correctos.

---

## Bloque C — Montas perdidas + incentivo entrenador

**Objetivo:** motor agrega montas perdidas tipo 1 (por reunión) y tipo 2 (por carrera).

**Estimación:** 1 sesión
**Dependencias:** Bloque B + decisión sobre dónde se configura el monto

**Criterio de cierre:** liquidación de un jockey de Dolores incluye líneas de monta perdida con montos correctos.

---

## Bloque D — Recibos, numeración y resumen

**Objetivo:** recibo imprimible completo con número correlativo + vista de resumen de reunión.

**Estimación:** 1 sesión
**Dependencias:** Bloques B y C

**Criterio de cierre:** imprimir recibo de jockey con todos los conceptos, número único de recibo, total neto correcto.

---

## Resumen

| Bloque | Estado | Sesiones | Dependencias |
|---|---|---|---|
| A — Schema + fixes resultados | ✅ Completo (14/05/2026) | 1 | — |
| B — Motor de cálculo completo | ⏳ Pendiente | 1-2 | A + decisiones diseño |
| C — Montas perdidas | ⏳ Pendiente | 1 | B |
| D — Recibos y resumen | ⏳ Pendiente | 1 | B + C |
