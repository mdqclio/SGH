# Schema reference — SGH / Supabase

> Reflects the live schema as of 2026-05-27. Generated from `information_schema` and `pg_catalog` via MCP.

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
| `updated_at` | `timestamptz` | YES | `now()` | **nuevo en v2** — lo mantiene el trigger |

### CHECK `estado_pista`

```sql
estado_pista IN ('seca', 'humeda', 'fangosa', 'pesada')
```

Cuatro valores válidos históricos. `'normal'` fue agregado por error y revertido el 2026-05-23 (precedente legal del hipódromo).

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
| `tipo` | `varchar(10)` | NOT NULL | — | ej. `'GAN'`, `'EX'`, `'CUAT'`, `'X2'` (ver CHECK abajo) |
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
| `chk_resultado_apuestas_tipo` | CHECK | `tipo IN ('GAN','SEG','TER','EX','IM','TR','CUAT','X2','X2P','X3','X4','X5','CAD')` — TE removido en 27/05/2026 |

### Índices

| Nombre | Definición |
|--------|-----------|
| `resultado_apuestas_pkey` | `UNIQUE btree(id)` |
| `idx_resultado_apuestas_resultado_id` | `btree(resultado_id)` — lookup por resultado |
| `idx_resultado_apuestas_resultado_tipo_orden` | `UNIQUE btree(resultado_id, tipo, orden)` — permite multi-slot SEG(2)/TER(3) |

---

## Table `carrera_apuestas`

Apuestas habilitadas por carrera. Reemplaza `carreras.apuestas_habilitadas JSONB` (dropeada 27/05/2026).

| Columna | Tipo | Nullable | Default | Notas |
|---------|------|----------|---------|-------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `carrera_id` | `uuid` | NOT NULL | — | FK → `carreras(id)` ON DELETE CASCADE |
| `tipo` | `varchar(10)` | NOT NULL | — | CHECK (ver abajo) |
| `precio` | `numeric` | NOT NULL | — | CHECK precio > 0 |
| `nombre` | `text` | YES | — | nombre largo en el programa impreso |
| `asegurado` | `numeric` | YES | — | pozo asegurado mínimo |
| `incremento` | `numeric` | YES | — | incremento al pozo asegurado |
| `orden` | `smallint` | NOT NULL | `0` | orden de presentación en el programa |
| `created_at` | `timestamptz` | YES | `now()` | |

### CHECK `tipo`

```sql
tipo IN ('GAN','SEG','TER','EX','IM','TR','CUAT','X2','X2P','X3','X4','X5','CAD')
```

13 tipos válidos. `TE` (Tómbola Exacta) nunca fue incluido aquí — fue removido de `resultado_apuestas` en la misma migración.

### Constraints

| Nombre | Tipo | Detalle |
|--------|------|---------|
| `carrera_apuestas_pkey` | PRIMARY KEY | `(id)` |
| `carrera_apuestas_carrera_id_fkey` | FOREIGN KEY | `carrera_id → carreras(id) ON DELETE CASCADE` |
| `carrera_apuestas_carrera_id_tipo_key` | UNIQUE | `(carrera_id, tipo)` — una apuesta por tipo por carrera |

### Índices

| Nombre | Definición |
|--------|-----------|
| `idx_carrera_apuestas_carrera` | `btree(carrera_id)` — lookup de apuestas de una carrera |

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

### Convención GAN / SEG / TER

Los tipos `GAN`, `SEG`, `TER` representan los dividendos de Ganador (1°), Segundo (2°) y Tercero (3°) respectivamente.

**Reglas:**

- Máximo **1 fila** de cada tipo por carrera (validado en UI antes del save).
- **No se guarda `spc_id` en `resultado_apuestas`**. La asociación caballo↔dividendo se deriva por JOIN:
  - `GAN` ↔ `resultado_posiciones.posicion = 1` → `inscripciones.spc_id`
  - `SEG` ↔ `resultado_posiciones.posicion = 2` → `inscripciones.spc_id`
  - `TER` ↔ `resultado_posiciones.posicion = 3` → `inscripciones.spc_id`
- `composicion` se deja en blanco para estos tres tipos (el caballo no es parte del código del dividendo).

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

---

## Table `inscripciones` (columnas relevantes para resultados)

Una fila por caballo inscripto en una carrera.

| Columna | Tipo | Nullable | Default | Notas |
|---------|------|----------|---------|-------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `carrera_id` | `uuid` | NOT NULL | — | FK → `carreras(id)` |
| `spc_id` | `uuid` | NOT NULL | — | FK → `spcs(id)` — el caballo |
| `jockey_titular_id` | `uuid` | YES | — | FK → `profesionales(id)` |
| `numero_partidor` | `integer` | YES | — | mandil del caballo |
| `estado` | `estado_inscripcion` | NOT NULL | `'pre_inscripto'` | forfait / mal_inscrito = no corrió |
| `peso_declarado` | `numeric` | YES | — | peso asignado pre-carrera (handicap) |
| `peso_final` | `numeric` | YES | — | peso final post-ratificación |
| `peso_balanza` | `numeric(5,2)` | YES | — | **peso real medido en balanza post-carrera** — lo carga sistemas desde el dato de veterinaria |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | mantenido por trigger |

### Columna `peso_balanza`

- Se agrega en migración `add_peso_balanza_to_inscripciones` (2026-05-26).
- Dato separado del handicap (`peso_declarado`/`peso_final`): es el peso real que arroja la balanza al pesaje post-carrera.
- Se carga para **todos los caballos que corrieron** (excluir `forfait` y `mal_inscrito`).
- Rango esperado: 300–600 kg (peso del CABALLO, no del jockey), paso 0.5 kg.
- RLS: cubierto por `rls_inscripciones_update` (mismo check de club que el resto de columnas).
