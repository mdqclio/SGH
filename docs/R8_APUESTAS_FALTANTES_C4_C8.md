# R8 — habilitar los tipos de apuesta que faltaban en la 4ª y la 8ª

**Fecha:** 2026-08-18
**Reunión:** R8 — Hipódromo de Dolores — `7b6e003e-22e2-4629-bf55-f18560b1260f` (fecha 2026-08-16)
**Proyecto Supabase:** `unlhcuanfrtpatoipwve` (prod)
**Objetivo:** que Yesi pueda oficializar la 4ª y la 8ª, que hoy están en `provisional`
porque no tenían habilitada la fila donde el tote pagó la combinada.

---

## Guard de arranque

| Chequeo | Esperado | Medido |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | `/home/clio/dev/SGH` ✅ |
| `SELECT count(*) FROM spcs` | 183 | 183 ✅ |
| Project URL | `https://unlhcuanfrtpatoipwve.supabase.co` | idem ✅ |

---

## Numeración: "la 4ª" y "la 8ª" son de programa, no de turno

En R8 el `numero_turno` y el `numero_carrera_programa` no coinciden (hubo 4 turnos
anulados). La lectura correcta es **`numero_carrera_programa`**, y hay tres pruebas
independientes de que es así:

1. Las dos carreras que quedan en `provisional` — las únicas que Yesi tiene pendientes —
   son programa 4 (turno 5) y programa 8 (turno 8). Coinciden exactamente con las dos que
   pediste tocar.
2. El "NO HACER" cierra: la 2ª de programa (turno 12) ya tenía X3, la 5ª (turno 10) ya
   tenía X4 y la 1ª (turno 2) ya tenía X2. Son las tres filas mal ubicadas que hay que
   dejar quietas.
3. Ninguna otra numeración hace calzar las tres cosas a la vez.

Mapa completo de R8:

| Programa | Turno | Resultado |
|---:|---:|---|
| 1 | 2 | oficial |
| 2 | 12 | oficial |
| 3 | 4 | oficial |
| **4** | **5** | **provisional** ← se tocó |
| 5 | 10 | oficial |
| 6 | 11 | oficial |
| 7 | 3 | oficial |
| **8** | **8** | **provisional** ← se tocó |

(Turnos 1, 6, 7 y 9 están `anulada`, sin apuestas ni resultado.)

---

## Contexto del tote (aportado por el usuario, 8 tickets)

La combinada se carga en la carrera donde **termina**, no donde empieza.

- Carrera 4: X2 (9/4), X2 (9/7), X3 (5/9/4) 0,00, X3 (5/9/7) 0,00
- Carrera 8: X2 (2/5) 3.429,80, X4 (8/5/2/5) 0,00

---

## Parte A — lo que se aplicó (única parte aprobada)

Tres filas nuevas en `carrera_apuestas`, todas con `precio = 200`:

| Carrera (programa) | Tipo | Precio | Orden |
|---:|---|---:|---:|
| 4 | X3 | 200 | 5 |
| 8 | X2 | 200 | 4 |
| 8 | X4 | 200 | 5 |

`nombre`, `asegurado` e `incremento` quedaron en NULL: sólo se habilitó el tipo, sin
inventar rótulos ni pozos asegurados.

El precio tiene que ser > 0 por dos motivos: la tabla tiene
`CHECK (precio > 0)`, y `resultados.html` filtra con
`.filter(a => a.precio > 0)` antes de armar el `habMap` de la vista de dividendos
(`resultados.html:1283`). Con precio 0 ni siquiera se puede insertar la fila.

### SQL aplicado

```sql
WITH nuevas(prog, tipo, precio, orden) AS (
  VALUES (4, 'X3', 200::numeric, 5::smallint),
         (8, 'X2', 200::numeric, 4::smallint),
         (8, 'X4', 200::numeric, 5::smallint)
)
INSERT INTO carrera_apuestas (carrera_id, tipo, precio, orden)
SELECT c.id, n.tipo, n.precio, n.orden
FROM nuevas n
JOIN carreras c ON c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
               AND c.numero_carrera_programa = n.prog;
```

`RETURNING` devolvió exactamente 3 filas: `4/X3/200/5`, `8/X2/200/4`, `8/X4/200/5`.

### Rollback

```sql
DELETE FROM carrera_apuestas ca
USING carreras c
WHERE ca.carrera_id = c.id
  AND c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
  AND ( (c.numero_carrera_programa = 4 AND ca.tipo = 'X3')
     OR (c.numero_carrera_programa = 8 AND ca.tipo IN ('X2','X4')) );
```

Es seguro mientras nadie haya cargado un dividendo en esas filas: `carrera_apuestas` no
tiene FK entrante desde `resultado_apuestas` (la asociación es por `tipo`), así que borrar
la habilitación deja el dividendo huérfano en pantalla. Si Yesi ya cargó, no revertir.

---

## Lo que NO se tocó

- **No** se destildó X3 de la 2ª, X4 de la 5ª ni X2 de la 1ª. Siguen ahí, con valor cero,
  como dato informativo. Borrarlas obligaría a des-oficializar carreras ya cerradas.
- **No** se tocó el multi-fila. La 4ª necesita dos X3 y dos X2, y la 8ª un segundo tramo;
  hoy es imposible: `carrera_apuestas` tiene `UNIQUE (carrera_id, tipo)`. Con una fila de
  cada tipo alcanza para oficializar. **Las segundas filas quedan pendientes** y requieren
  cambio de schema, no de datos.
- **No** se tocó ninguna liquidación, ningún resultado, ninguna inscripción.

---

## Verificación

### 1. En la 4ª aparece el input de X3, en la 8ª los de X2 y X4

Estado de `carrera_apuestas` por carrera, medido después de aplicar:

| Programa | Resultado | Apuestas habilitadas |
|---:|---|---|
| 1 | oficial | GAN SEG TER EX IM TR X2 |
| 2 | oficial | GAN SEG EX IM X2 X3 |
| 3 | oficial | GAN SEG TER EX IM TR X2 |
| **4** | provisional | GAN SEG EX IM X2 **X3** |
| 5 | oficial | GAN SEG EX IM X2 X4 |
| 6 | oficial | GAN SEG EX IM X2 |
| 7 | oficial | GAN SEG EX IM X2 |
| **8** | provisional | GAN SEG EX IM **X2 X4** |

X3 y X4 están en la lista `COMBINADAS` de `resultados.html:1160`
(`['X2','X2P','X3','X4','X5','CAD']`), y en modo edición se dibuja una fila con input para
**todos** los tipos habilitados, tengan o no valor guardado
(`habCombinadas = COMBINADAS.filter(t => habMap[t])`, `resultados.html:1168`).

> ⚠️ **Para Yesi:** los campos de combinadas sólo se ven en **Vista Detallada**. En Vista
> Reducida no aparecen — `fullDetail = !isReducida()` (`resultados.html:1286`). Si no los
> ve, es que está en reducida.

### 2. Puede escribir VAC en esos campos

El input de combinadas se renderiza con `placeholder="0,00 o VAC"`
(`resultados.html:1176`), el mismo componente que las directas. El handler normaliza
`/^vac$/i` → `VAC` en mayúsculas (`resultados.html:437` y `:444`) y al guardar lo traduce a
`vacante = true, div_orig = null` (`resultados.html:1265`). Es el camino ya probado en las
otras carreras de R8, no uno nuevo.

### 3. Las otras 6 carreras no cambiaron

Comparación fila por fila del listado completo de `carrera_apuestas` de R8 antes y después:
los programas 1, 2, 3, 5, 6 y 7 son idénticos, carácter por carácter, en tipo, precio,
orden, nombre y asegurado.

| Métrica | Antes | Después | Δ |
|---|---:|---:|---:|
| `carrera_apuestas` de R8 | 45 | 48 | **+3** |
| `carrera_apuestas` global (todas las reuniones) | 105 | 108 | **+3** |

El delta global es idéntico al de R8: no se insertó ni una fila fuera de R8. Y el
`RETURNING` de la operación devolvió exactamente esas 3 filas.

Hash de referencia de las otras 6 carreras (para futuras comparaciones):
`md5 = 8df5cbed641723762f389ed118178ac2`
sobre `programa:tipo:precio:orden:nombre:asegurado` ordenado, excluyendo 4 y 8.

### 4. Ninguna liquidación se tocó

| Métrica | Antes | Después |
|---|---:|---:|
| `liquidacion_detalle` de R8 | 199 | **199** |
| Suma `monto_bruto` de R8 | 13.015.055,32 | **13.015.055,32** |
| `resultado_apuestas` de R8 | 53 | **53** |

Sin cambios. Habilitar un tipo de apuesta no dispara recálculo: `carrera_apuestas` sólo
define qué inputs se dibujan, no alimenta el motor de premios.

---

## Estado y pendientes

✅ Parte A aplicada y verificada. La 4ª y la 8ª ya tienen dónde cargar el dividendo que
falta; Yesi puede completarlas y oficializar.

Pendientes, fuera del alcance de esta operación:

1. **Multi-fila.** La 4ª tiene dos X2 y dos X3 en los tickets, y sólo entra uno de cada
   tipo. Bloqueado por `UNIQUE (carrera_id, tipo)` — necesita decisión de schema.
2. **Filas mal ubicadas.** X3 en la 2ª, X4 en la 5ª y X2 en la 1ª quedaron donde la
   combinada empieza, no donde termina. Se dejan como están por acuerdo explícito.
