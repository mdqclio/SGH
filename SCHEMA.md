# Schema reference — SGH / Supabase

> Reflects the live schema as of 2026-05-23. Generated from `information_schema` and `pg_catalog` via MCP.

---

## Enum `estado_resultado`

```sql
TYPE estado_resultado AS ENUM ('provisional', 'oficial', 'anulado')
```

---

## Table `resultados`

One row per carrera. Unique constraint on `carrera_id` (a carrera can only have one resultado).

| Columna | Tipo | Nullable | Default | Notas |
|---------|------|----------|---------|-------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `carrera_id` | `uuid` | NOT NULL | — | FK → `carreras(id)`, UNIQUE |
| `estado` | `estado_resultado` | NOT NULL | `'provisional'` | enum |
| `tiempo_ganador` | `varchar(20)` | YES | — | ej. `'1:02.40'` |
| `dividendos` | `jsonb` | YES | — | legacy, no se escribe desde v2 |
| `incidentes` | `text` | YES | — | |
| `observaciones` | `text` | YES | — | |
| `oficializado_por` | `uuid` | YES | — | FK → `usuarios(id)` |
| `oficializado_at` | `timestamptz` | YES | — | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `estado_pista` | `varchar(20)` | YES | — | CHECK (ver abajo) |
| `favorito_mandil` | `integer` | YES | — | número de partidor del favorito |
| `redistribucion_legs` | `jsonb` | YES | `'{}'` | mapa leg→destino, ej. `{"1":"gde","2":"al3"}` |
| `tiempo_clima` | `varchar(50)` | YES | — | **nuevo en v2** — ej. `'BUENO'`, `'LLUVIOSO'` |
| `updated_at` | `timestamptz` | YES | `now()` | **nuevo en v2** — lo mantiene el trigger |

### CHECK `estado_pista`

```sql
estado_pista IN ('normal', 'seca', 'humeda', 'fangosa', 'pesada')
```

`'normal'` se agregó en `carga-resultados-v2`; los valores previos eran `seca`/`humeda`/`fangosa`/`pesada`.

### Constraints

| Nombre | Tipo | Detalle |
|--------|------|---------|
| `resultados_pkey` | PRIMARY KEY | `(id)` |
| `resultados_carrera_id_key` | UNIQUE | `(carrera_id)` |
| `resultados_carrera_id_fkey` | FOREIGN KEY | `carrera_id → carreras(id)` |
| `resultados_oficializado_por_fkey` | FOREIGN KEY | `oficializado_por → usuarios(id)` |
| `resultados_estado_pista_check` | CHECK | ver arriba |

### Índices

| Nombre | Definición |
|--------|-----------|
| `resultados_pkey` | `UNIQUE btree(id)` |
| `resultados_carrera_id_key` | `UNIQUE btree(carrera_id)` |
| `idx_resultados_updated_at` | `btree(id, updated_at)` — soporta el lock check en `aplicar_resultado` |

### Triggers

#### `resultados_set_updated_at` (BEFORE UPDATE)

Mantiene `updated_at` actualizado en cada UPDATE. Lo usa el optimistic locking.

```sql
CREATE TRIGGER resultados_set_updated_at
  BEFORE UPDATE ON resultados
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Función:

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
```

#### `trg_audit_resultados` (AFTER INSERT OR UPDATE OR DELETE)

Escribe en la tabla de auditoría. No afecta la lógica de negocio.

```sql
CREATE TRIGGER trg_audit_resultados
  AFTER INSERT OR DELETE OR UPDATE ON resultados
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();
```

---

## Table `resultado_apuestas`

Filas de dividendos de un resultado. Se reemplazan en bloque en cada llamada a `aplicar_resultado` (DELETE + INSERT).

| Columna | Tipo | Nullable | Default | Notas |
|---------|------|----------|---------|-------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `resultado_id` | `uuid` | NOT NULL | — | FK → `resultados(id)` |
| `tipo` | `varchar(10)` | NOT NULL | — | ej. `'TE'`, `'EX'`, `'X2'`, `'X3'` |
| `val_apu` | `numeric(10,2)` | NOT NULL | `100` | valor de la apuesta base |
| `composicion` | `varchar(60)` | YES | — | ej. `'2/4'`, `'8/5/2'` |
| `pozo` | `numeric(15,2)` | YES | — | pozo bruto |
| `vales` | `integer` | YES | — | NULL = vacante |
| `div_orig` | `numeric(12,2)` | YES | — | dividendo original |
| `div_inc` | `numeric(12,2)` | YES | — | dividendo con INC |
| `vacante` | `boolean` | NOT NULL | `false` | |
| `orden` | `smallint` | NOT NULL | `0` | orden de presentación |
| `created_at` | `timestamptz` | YES | `now()` | |

### Constraints

| Nombre | Tipo | Detalle |
|--------|------|---------|
| `resultado_apuestas_pkey` | PRIMARY KEY | `(id)` |
| `resultado_apuestas_resultado_id_fkey` | FOREIGN KEY | `resultado_id → resultados(id)` |

### Índices

| Nombre | Definición |
|--------|-----------|
| `resultado_apuestas_pkey` | `UNIQUE btree(id)` |
| `idx_resultado_apuestas_resultado_id` | `btree(resultado_id)` — lookup por resultado |

---

## RPC `aplicar_resultado`

Función atómica que reemplaza posiciones y dividendos de un resultado en una sola transacción, con optimistic locking sobre `updated_at`.

### Firma

```sql
CREATE OR REPLACE FUNCTION public.aplicar_resultado(
  p_resultado_id        uuid,
  p_expected_updated_at timestamptz,
  p_carrera_id          uuid,
  p_estado              text,
  p_tiempo_clima        text,
  p_estado_pista        text,
  p_tiempo_ganador      text,
  p_incidentes          text,
  p_favorito_mandil     integer,
  p_redistribucion_legs jsonb,
  p_posiciones          jsonb,
  p_apuestas            jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
```

### Payload de `p_apuestas`

Array JSON de objetos, uno por fila de dividendos:

```json
[
  {
    "tipo":        "TE",
    "val_apu":     1,
    "composicion": "5",
    "pozo":        3833.33,
    "vales":       5500,
    "div_orig":    1.80,
    "div_inc":     1.80,
    "vacante":     false,
    "orden":       1
  }
]
```

- Array vacío `[]` → DELETE se ejecuta pero INSERT no → grilla queda vacía (fix bug 3b).
- `null` → misma semántica que `[]`.

### Payload de `p_posiciones`

```json
[
  { "inscripcion_id": "<uuid>", "posicion": 1, "descalificado": false, "empate": false }
]
```

### Retorno

```json
{ "resultado_id": "<uuid>", "updated_at": "<timestamptz>" }
```

El cliente debe almacenar `updated_at` devuelto y enviarlo como `p_expected_updated_at` en el siguiente save.

### Comportamiento

1. **Optimistic lock** (si `p_resultado_id` y `p_expected_updated_at` son non-null):
   - `SELECT updated_at ... FOR UPDATE` — adquiere row lock.
   - Si `updated_at IS DISTINCT FROM p_expected_updated_at` → `RAISE EXCEPTION 'CONCURRENT_MODIFICATION'`.
2. **Upsert resultado**: INSERT si `p_resultado_id IS NULL`, UPDATE si no.
3. **Posiciones**: DELETE + INSERT condicional.
4. **Apuestas**: DELETE + INSERT condicional.
5. Retorna `{ resultado_id, updated_at }` con el nuevo timestamp post-trigger.

### Errores

| Excepción | Condición | Mensaje al usuario |
|-----------|-----------|-------------------|
| `CONCURRENT_MODIFICATION` | `updated_at` en DB ≠ `p_expected_updated_at` enviado | "Otro operador modificó este resultado. Recargá antes de guardar." |

### Seguridad

- `SECURITY DEFINER`: ejecuta con los permisos del owner de la función, no del caller.
- `SET search_path TO 'public', 'pg_temp'`: evita search_path injection.
- RLS de las tablas subyacentes no aplica dentro de la función (por SECURITY DEFINER).
