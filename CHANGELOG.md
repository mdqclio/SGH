# Changelog

## [Unreleased]

---

## 2026-05-27 — `feature/apuestas-tabla-relacional` → main

### Agregado
- **Tabla `carrera_apuestas`** (relacional): reemplaza `carreras.apuestas_habilitadas JSONB`. Columnas: `id`, `carrera_id`, `tipo` VARCHAR(10), `precio` NUMERIC(10,2), `nombre` TEXT, `aseg` NUMERIC, `incr` NUMERIC, `orden` SMALLINT. Tipos válidos: `GAN`, `SEG`, `TER`, `EX`, `IM`, `TR`, `CUAT`, `X2`, `X2P`, `X3`, `X4`, `X5`, `CAD`. `TE` removido.
- **Columna `carreras.apuestas_notas`** TEXT NULL — texto libre para notas de apuestas en el programa oficial.
- **UNIQUE `(resultado_id, tipo, orden)`** en `resultado_apuestas` — permite multi-slot para SEG (2) y TER (3).
- **Columna `inscripciones.peso_balanza`** NUMERIC(5,2) NULL — peso registrado en balanza el día de la carrera (300–600 kg, peso del caballo no del jockey).
- **Modal "Apuestas" en `programa.html`**: checkbox + precio + nombre + asegurado/incremento por carrera. Guardado bulk con `Promise.all`. Grupos: Posicionales / Apuestas directas / Apuestas combinadas.
- **Modal "Div. habilitadas" en `resultados.html`**: carga de dividendos por tipo habilitado. Posicionales en 3 columnas con chapa SBARG + input de dinero. Directas y combinadas en lista vertical.
- **Vista Reducida** en `resultados.html`: posicionales GAN/SEG/TER en 3 columnas, estilo papel, read-only. Chapa SBARG con color + monto en cápsula.
- **Vista Detallada** en `resultados.html`: posicionales + separador + Apuestas directas (con composición auto-computada via chips SBARG) + Apuestas combinadas.
- **`renumerar-chapas.js`**: helper `renumerarChapas(inscripciones)` — filtra `estado === 'ratificado'`, ordena por `numero_partidor` ASC, devuelve `{ id → 1..N }`.
- **`formatARS` / `parseARS` / `bindARSInput`** en `resultados.html`: formato argentino (punto miles, coma decimal, 2 decimales) para todos los inputs y displays de dinero.
- **`formatApuestasText()`** en `programa-oficial.html` y `programa-oficial-color.html`: agrupación inteligente de apuestas por precio para el texto del programa impreso.
- **Botón "Pesos balanza"** en `resultados.html`: modal que muestra inscripciones ratificadas, permite cargar `peso_balanza` (min 300, max 600 kg).

### Cambiado
- **Terminología visible al usuario**: "Combinatoriales" → "Apuestas directas", "Multi-carrera" → "Apuestas combinadas". Códigos internos (`EX`, `X2`, etc.) sin cambio.
- **Vista de dividendos** (`resultados.html`): eliminada grilla tabla editable (columnas APUESTA/VAL.APU/COMPOSICIÓN/DIV.ORIG/DIV.INC, nav bar, modal Agregar/Cambiar/Eliminar). Reemplazada por `renderDivHTML()` — mismo código sirve para provisional y oficial.
- **`renderOficial()`**: ahora usa `renderDivHTML()` con detalle completo en lugar de la tabla antigua.
- **Cosméticos `resultados.html`**: "Turno N" → "Carrera N", subtítulo solo distancia, labels M.(F) y (MANDIL) removidos, "Sport" → "Div a GAN".
- **Renumeración chapas**: filtro corregido de `!includes(['forfait','mal_inscrito'])` (negativo, perdía 'anulada') a `=== 'ratificado'` (positivo estricto). Afectaba 7 call sites en `resultados.html`, `programa-oficial.html`, `programa-oficial-color.html`.
- **`programa-oficial.html`** y **`programa-oficial-color.html`**: `renderCarrera()` ahora filtra `ins.filter(i => i.estado === 'ratificado')` antes de mapear chapas.

### Eliminado
- **`carreras.apuestas_habilitadas`** JSONB — dropeada, reemplazada por tabla relacional.
- **`modal-apuesta`** (Agregar/Cambiar apuesta en resultados.html) — eliminado junto con `openModal()`, `closeModal()`, `confirmApuesta()`, `deleteApuesta()`.
- **Nav bar** (« ‹ N/M › ») y `selectRow()`, `navFirst/Last/Prev/Next()`.
- **Tipo `TE` (Tómbola Exacta)** — removido del set válido de tipos de apuesta.

### Corregido
- **7 bugs de renumeración de chapas** en 3 archivos: `autoComp()`, `openDivModal()`, `activeInsc` main render, `openPesoBalanza()`, `savePesoBalanza()`, `renderCarrera()` en programa-oficial (x2).

### Archivos nuevos
- `renumerar-chapas.js` — helper centralizado de renumeración.

### Archivos modificados
- `resultados.html`, `programa.html`, `programa-oficial.html`, `programa-oficial-color.html`

---

## 2026-05-23 — `cleanup-fede` (feedback del secretario de carreras)

### Revertido / Eliminado
- **`estado_pista = 'normal'`** revertido del CHECK y del `<select>` de la UI. El hipódromo tiene precedente legal que establece que los únicos valores válidos son `seca`, `humeda`, `fangosa` y `pesada`. El selector arranca ahora con opción vacía `—` para forzar elección consciente.
- **`resultados.tiempo_clima`** eliminado: columna dropeada de la tabla, campo removido de la UI y del payload del RPC. El clima no va en la pantalla de resultados.
- **Display de jockey 1° y 2°** eliminado del panel central de resultados. El dato sigue viviendo en inscripciones y performances; se removió solo de esta pantalla porque ya está disponible en el programa.

---

## 2026-05-23 — `carga-resultados-v2`

### Agregado
- **Rediseño carga de resultados** (`resultados.html`): layout legacy SGH con marcador de posiciones 1°–20° (colores de fotofinish internacionales), grilla densa de dividendos, selector de condiciones de carrera (clima, estado pista, tiempo ganador, incidentes), Vista Reducida / Vista Detallada. [Ver SCHEMA.md](SCHEMA.md)
- **RPC atómico `aplicar_resultado`**: reemplaza posiciones y dividendos en una sola transacción con optimistic locking (`FOR UPDATE` sobre `updated_at`). Elimina las escrituras directas a las tablas desde el cliente.
- **Optimistic locking concurrente**: el servidor detecta escrituras en conflicto y devuelve `CONCURRENT_MODIFICATION`; la UI muestra el toast "Otro operador modificó este resultado. Recargá antes de guardar."
- **Schema changes** (ver [SCHEMA.md](SCHEMA.md)):
  - `resultado_apuestas` (tabla nueva): columnas `tipo`, `val_apu`, `composicion`, `pozo`, `vales`, `div_orig`, `div_inc`, `vacante`, `orden`, FK a `resultados`. Detalle en SCHEMA.md.
  - `resultados.redistribucion_legs` (`jsonb`, default `'{}'`)
  - `resultados.updated_at` (`timestamptz`) con trigger `BEFORE UPDATE` (`set_updated_at`)
  - Índice `idx_resultados_updated_at (id, updated_at)`
  - ~~`resultados.tiempo_clima`~~ — revertido, ver arriba
  - ~~CHECK `estado_pista` ampliado con `'normal'`~~ — revertido, ver arriba

### Corregido
- **Bug 3b**: borrar todas las filas de dividendos, aplicar (F10) y recargar mostraba las 20 filas originales en vez de una grilla vacía. La RPC ahora ejecuta el DELETE incondicionalmente aunque `p_apuestas` sea un array vacío.

### Cambiado
- Escritura de dividendos centralizada en la RPC `aplicar_resultado` en lugar de inserts directos desde el cliente.
- Tecla F10 llama `aplicar_resultado('carrera_id', 'provisional')`; F8 recarga desde DB; F9 descarta cambios.

### Pendiente de validación
- Interpretación de `resultados.redistribucion_legs` (selectores "Gde / al 3° / al 4° / al 5° / al 6°" como umbral de redistribución por pata en apuestas combinadas X2/X3/X4/X5) sujeta a confirmación del secretario de carreras. Columna modelada como `jsonb` para permitir cambio de semántica sin migración de schema.
