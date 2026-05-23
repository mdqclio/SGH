# Changelog

## [Unreleased]

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
