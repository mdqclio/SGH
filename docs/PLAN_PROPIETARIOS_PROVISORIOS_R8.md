# Plan — Propietarios provisorios por nombre de caballeriza (R8)

**Estado: PROPUESTA. Nada ejecutado.** Todo lo de este documento es escritura sobre
producción (`propietarios`, `caballeriza_responsables`, `inscripciones` de R8).
Ejecución sólo con OK explícito.

- Proyecto: `unlhcuanfrtpatoipwve` (Dolores prod) · club `0649e9c5-9e87-4aad-842f-101458e6b33c`
- R8 = `7b6e003e-22e2-4629-bf55-f18560b1260f` — domingo 16/08
- Guard verificado al escribir este plan (15/08): `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` = **183**, ref correcta.
- Aprobación de producto: Fede aprobó cargar el **nombre de la caballeriza como titular
  provisorio**, para que la liquidación del domingo emita el 70 % del propietario y el
  bono 6°–8°.
- Encadena con `docs/PLAN_REDERIVACION_PROPIETARIO_R8.md` (commit `408dc07`).

---

## PASO 0 — ¿`propietarios` tiene campo de notas?

**SÍ.** Caso A.

```
propietarios.notas  ·  text  ·  nullable  ·  sin default
```

Verificado contra `information_schema.columns` hoy. Además: hoy hay **1 sola** fila en
toda la tabla con `notas` no vacío (213 propietarios en Dolores, 220 en total), así que
el campo está prácticamente virgen y sirve como marca sin ensuciar nada.

**Decisión: se escribe `notas = 'provisorio R8 15/08'` en cada propietario creado por este
script.** Es la marca que los hace encontrables después, y es también la llave de
idempotencia y de rollback (§2 y §6). No se agrega ninguna columna ni se toca schema.

Texto exacto, literal, sin variantes — todas las queries de este plan filtran por
`notas LIKE 'provisorio R8%'`:

```
provisorio R8 15/08
```

---

## 1. Estado medido hoy (15/08, read-only)

### 1.1 R8

| | |
|---|---|
| inscripciones totales en R8 | 106 |
| **ratificadas** | **67** |
| ratificadas con `propietario_id` | 18 |
| ratificadas sin `propietario_id` | **49** |
| ratificadas sin `caballeriza_id` | 0 |
| caballerizas distintas en los 67 ratificados | 57 |
| resultados cargados / oficiales | 0 / 0 |
| liquidaciones headers / líneas | 0 / 0 |
| recibos emitidos sobre R8 | 0 |

**La ventana sigue limpia.** Nada oficializado, nada liquidado, nada pagado.

### 1.2 Las 57 caballerizas

| | |
|---|---|
| con responsable `rol='propietario'`, `activo=true`, `propietario_id` no nulo | **17** |
| **sin ningún responsable cargado (ni una fila)** | **40** |
| con fila de propietario pero `activo=false` | 0 |
| con fila de propietario y `propietario_id` NULL | 0 |
| con **más de una** fila propietario activa (duplicado) | 0 |

Las 40 sin responsable cubren exactamente las **49** inscripciones ratificadas sin
propietario. La suma cierra: 40 caballerizas → 49 ratificados (algunas corren 2 o 3
caballos; LA MILINGA corre 3).

### 1.3 Homónimos entre los 40 y los propietarios existentes

Chequeado uno por uno: **0 de los 40 nombres de caballeriza coincide con el nombre de un
propietario ya cargado en Dolores.** No hay riesgo de que el INSERT genere un propietario
que sea el duplicado textual de uno real.

---

## 2. Los INSERT — cuántas filas exactas

### 2.1 Números

Si se corriera **hoy**, sin que nadie cargue nada en el medio:

| tabla | filas |
|---|---|
| `propietarios` | **40** (una por caballeriza sin responsable) |
| `caballeriza_responsables` | **40** (una por caballeriza, `rol='propietario'`, `activo=true`) |
| `inscripciones` (UPDATE, §4) | **49** ratificadas de R8 |

**Mañana van a ser menos, y ése es el punto** (§3): el script deriva el conjunto de la
base en el momento de correr, no de una lista fija de 40. Si Yesi, Fede y Valeria cargan
25, el script inserta 15 + 15 y re-deriva las que queden.

### 2.2 Qué se escribe en cada fila

`propietarios`:

| columna | valor |
|---|---|
| `club_id` | el de la caballeriza (Dolores) |
| `tipo` | `'persona'` (default de la tabla; los 2 `'sociedad'` que existen son por CUIT) |
| `nombre` | **el nombre de la caballeriza, tal cual está en `caballerizas.nombre`** |
| `notas` | `'provisorio R8 15/08'` |
| `activo` / `estado` | `true` / `'activo'` |
| documento, domicilio, teléfono, email | **NULL** — no se inventa nada |

`caballeriza_responsables`:

| columna | valor |
|---|---|
| `caballeriza_id` | la caballeriza |
| `propietario_id` | el provisorio recién creado |
| `rol` | `'propietario'` |
| `activo` | `true` |
| `nombre` | el nombre de la caballeriza (para que se vea algo en `caballerizas.html`) |
| `apellido` | NULL |
| **`documento_nro`** | **NULL — obligatorio que quede NULL. Ver §2.3** |

### 2.3 ⚠️ Por qué `documento_nro` tiene que quedar NULL

`caballeriza_responsables` tiene un trigger que no estaba documentado en el plan de
`408dc07`:

```sql
CREATE TRIGGER trg_cab_resp_set_propietario
  BEFORE INSERT OR UPDATE OF rol, documento_tipo, documento_nro, caballeriza_id
  ON public.caballeriza_responsables
  FOR EACH ROW EXECUTE FUNCTION fn_caballeriza_resp_set_propietario()
```

La función arranca con:

```sql
IF NEW.rol='propietario' AND NEW.documento_nro IS NOT NULL THEN
  ...  -- busca propietario por (club, tipo_doc, nro_doc); si no existe, LO CREA
       -- y PISA NEW.propietario_id con el que encontró o creó
```

O sea: si se le pasa un `documento_nro`, el trigger **ignora el `propietario_id` que le
mandamos** y resuelve por documento — creando un segundo propietario si el documento no
existía. Con `documento_nro = NULL` la función entra en el `IF` en falso, es un no-op, y
el `propietario_id` que pasamos sobrevive intacto.

**Regla: en las filas provisorias no se carga documento. Ni tipo ni número.**

### 2.4 El SQL — una sola sentencia, atómica

```sql
WITH falta AS (
  -- Caballerizas de R8 con ratificados y SIN NINGUNA fila de responsable propietario.
  -- El NOT EXISTS es sobre rol='propietario' sin filtrar activo: si alguien cargó una
  -- fila y la dejó inactiva, es edición humana en curso -> NO se toca, se reporta (§5.3).
  SELECT DISTINCT c.id AS cab_id, c.club_id, c.nombre
  FROM inscripciones i
  JOIN carreras ca   ON ca.id = i.carrera_id
  JOIN caballerizas c ON c.id = i.caballeriza_id
  WHERE ca.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
    AND i.estado = 'ratificado'
    AND NOT EXISTS (
      SELECT 1 FROM caballeriza_responsables cr
      WHERE cr.caballeriza_id = c.id AND cr.rol = 'propietario'
    )
),
nuevos AS (
  INSERT INTO propietarios (club_id, tipo, nombre, activo, estado, notas)
  SELECT f.club_id, 'persona', f.nombre, true, 'activo', 'provisorio R8 15/08'
  FROM falta f
  WHERE NOT EXISTS (          -- idempotencia sobre propietarios
    SELECT 1 FROM propietarios p
    WHERE p.club_id = f.club_id
      AND upper(btrim(p.nombre)) = upper(btrim(f.nombre))
      AND p.notas LIKE 'provisorio R8%'
  )
  RETURNING id, club_id, nombre
)
INSERT INTO caballeriza_responsables (caballeriza_id, propietario_id, rol, activo, nombre)
SELECT f.cab_id, COALESCE(n.id, pe.id), 'propietario', true, f.nombre
FROM falta f
LEFT JOIN nuevos n
  ON n.club_id = f.club_id AND upper(btrim(n.nombre)) = upper(btrim(f.nombre))
LEFT JOIN LATERAL (           -- si el propietario ya existía de una corrida anterior
  SELECT p.id FROM propietarios p
  WHERE p.club_id = f.club_id
    AND upper(btrim(p.nombre)) = upper(btrim(f.nombre))
    AND p.notas LIKE 'provisorio R8%'
  ORDER BY p.created_at, p.id LIMIT 1
) pe ON true
WHERE COALESCE(n.id, pe.id) IS NOT NULL;
```

Es **una** sentencia: o entran las dos tablas o no entra ninguna. No hay estado
intermedio con propietarios huérfanos.

---

## 3. IDEMPOTENCIA — lo más importante

El requisito: mañana Yesi, Fede y Valeria van a completar las que sepan. El script tiene
que correr **sobre las que queden sin responsable en ese momento**, no sobre las 40 a
ciegas, y tiene que poder correrse varias veces sin duplicar.

Tres candados, independientes entre sí:

### Candado 1 — el conjunto se deriva en el momento, no está hardcodeado

El CTE `falta` es una query, no una lista. Se evalúa contra la base en el instante de
ejecutar. Si a las 18:00 Yesi cargó 25 caballerizas, `falta` devuelve 15. **No hay ningún
UUID ni ningún nombre escrito a mano en el script.** No existe una versión "de las 40".

### Candado 2 — cualquier fila `rol='propietario'` bloquea la caballeriza

`NOT EXISTS (... rol='propietario')`, sin filtrar por `activo` ni por `propietario_id`.
Si la caballeriza tiene **cualquier** fila de propietario — activa, inactiva, con o sin
`propietario_id` — el script la saltea. Nunca pisa una carga humana, ni siquiera una a
medias. Las de carga a medias se reportan aparte (§5.3) para arreglarlas a mano.

Esto también implica: **después de la primera corrida, las caballerizas ya procesadas
quedan bloqueadas por su propia fila provisoria.** La segunda corrida las excluye sola.

### Candado 3 — el `NOT EXISTS` por nombre + marca en `propietarios`

Aunque el candado 2 fallara (p.ej. alguien borró la fila de `caballeriza_responsables`
pero no el propietario), el INSERT en `propietarios` no crea un segundo provisorio con el
mismo nombre: lo busca por `(club_id, nombre normalizado, notas LIKE 'provisorio R8%')` y
reusa el existente vía el `LEFT JOIN LATERAL pe`.

**Por eso `notas` importa**: sin la marca, el `NOT EXISTS` por nombre podría matchear un
propietario **real** homónimo y linkear la caballeriza a una persona real por accidente.
La marca hace que sólo se reuse lo que este mismo script creó.

### Verificación de la idempotencia

Correrlo dos veces seguidas: la segunda tiene que reportar **0 filas afectadas** en las
dos tablas. Si la segunda corrida inserta algo, **frenar y avisar** — significa que uno de
los tres candados no está funcionando como acá se describe.

### Lo que la idempotencia NO cubre

Si alguien carga el responsable **real** de una caballeriza que ya tiene el provisorio
cargado, van a quedar **dos** filas propietario activas. Ahí gana el `LIMIT 1` sin
`ORDER BY` de `fn_inscripcion_set_propietario` — no determinístico (ya anotado en
`408dc07` §1.2). Por eso el chequeo de duplicados de §5.2 es obligatorio antes de
re-derivar, y por eso la re-derivación usa el UPDATE explícito y no el trigger.

---

## 4. Re-derivación — encadenado con `408dc07`

### 4.1 ¿Sigue siendo válido ese plan? **Sí. Re-verificado hoy.**

| lo que afirmaba `408dc07` | verificado hoy 15/08 | estado |
|---|---|---|
| trigger = `BEFORE INSERT OR UPDATE OF caballeriza_id` | idéntico, leído de `pg_get_triggerdef` | ✅ |
| `fn_inscripcion_set_propietario` con `LIMIT 1` sin `ORDER BY` | idéntico | ✅ |
| 67 ratificados / 18 con propietario / 49 sin | 67 / 18 / 49 | ✅ sin cambios |
| 0 resultados, 0 oficiales, 0 liquidaciones | 0 / 0 / 0 líneas y 0 headers | ✅ |
| 0 caballerizas de R8 con propietario activo duplicado | 0 | ✅ |
| «verificar que `caballeriza_responsables` tenga `created_at`» — *pendiente ahí* | **existe**, `timestamp without time zone`, default `now()` | ✅ resuelto |

**El Plan A de `408dc07` §1.3 se usa tal cual, sin modificaciones.** El `ORDER BY
cr.created_at NULLS LAST, cr.id` es ejecutable — la columna existe.

Un dato que `408dc07` no tenía y que **refuerza** su recomendación de Plan A sobre Plan B:
el trigger `trg_cab_resp_set_propietario` de §2.3 de este documento. No cambia nada del
Plan A (que no toca `caballeriza_responsables`), pero confirma que esta parte del schema
tiene más automatismo del que se veía, y que conviene el UPDATE explícito.

### 4.2 El UPDATE (copiado de `408dc07` §1.3, sin cambios)

```sql
UPDATE inscripciones i
SET propietario_id = sub.propietario_id
FROM (
  SELECT DISTINCT ON (cr.caballeriza_id)
         cr.caballeriza_id, cr.propietario_id
  FROM caballeriza_responsables cr
  WHERE cr.rol = 'propietario' AND cr.activo = true AND cr.propietario_id IS NOT NULL
  ORDER BY cr.caballeriza_id, cr.created_at NULLS LAST, cr.id
) sub
WHERE sub.caballeriza_id = i.caballeriza_id
  AND i.propietario_id IS NULL
  AND i.estado = 'ratificado'
  AND i.carrera_id IN (
    SELECT id FROM carreras WHERE reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
  );
```

Por qué hace falta: el trigger de `inscripciones` es `BEFORE INSERT OR UPDATE OF
caballeriza_id`. Insertar filas en `caballeriza_responsables` **no lo dispara** — no
re-corre solo sobre inscripciones que ya existen. Sin este UPDATE, las 49 siguen en NULL
por más que el responsable esté cargado.

Propiedades (todas de `408dc07`, siguen valiendo): no dispara el trigger, no puede tocar
las 18 ya resueltas (`propietario_id IS NULL` las excluye), determinístico ante
duplicados, acotado a ratificados de R8, e idempotente.

Filas afectadas esperadas: **49 hoy**; mañana, las que hayan quedado en NULL.

---

## 5. Verificación

### 5.1 PREVIA — cuántas quedarían resueltas (antes de tocar nada)

```sql
SELECT count(*) AS ratificados,
       count(*) FILTER (WHERE COALESCE(i.propietario_id, d.deriv) IS NOT NULL) AS quedarian_resueltas,
       count(*) FILTER (WHERE COALESCE(i.propietario_id, d.deriv) IS NULL)     AS seguirian_en_null
FROM inscripciones i
JOIN carreras c ON c.id = i.carrera_id
LEFT JOIN LATERAL (
  SELECT cr.propietario_id AS deriv FROM caballeriza_responsables cr
  WHERE cr.caballeriza_id = i.caballeriza_id AND cr.rol='propietario'
    AND cr.activo = true AND cr.propietario_id IS NOT NULL
  ORDER BY cr.created_at NULLS LAST, cr.id LIMIT 1
) d ON true
WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' AND i.estado = 'ratificado';
```

**Criterio de avance: `quedarian_resueltas` = 67, `seguirian_en_null` = 0.**

### 5.2 PREVIA — duplicados (obligatorio después de la carga manual)

```sql
SELECT cab.nombre, count(*) AS filas_propietario_activo
FROM caballeriza_responsables cr
JOIN caballerizas cab ON cab.id = cr.caballeriza_id
WHERE cr.rol='propietario' AND cr.activo = true
  AND cr.caballeriza_id IN (
    SELECT DISTINCT i.caballeriza_id FROM inscripciones i JOIN carreras c ON c.id = i.carrera_id
    WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' AND i.estado='ratificado')
GROUP BY cab.id, cab.nombre HAVING count(*) > 1;
```

**Esperado: 0 filas.** Si aparece alguna (típico: el provisorio + el real cargado
después), resolver a mano cuál queda activa **antes** de re-derivar.

### 5.3 POSTERIOR — el conteo que pediste: 67/67

```sql
SELECT count(*) AS ratificados,
       count(i.propietario_id) AS con_propietario,
       count(*) FILTER (WHERE i.propietario_id IS NULL) AS sin_propietario
FROM inscripciones i JOIN carreras c ON c.id = i.carrera_id
WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' AND i.estado = 'ratificado';
```

**Esperado: 67 / 67 / 0.**

**Si no son 67 — la lista de cuáles faltan y por qué** (es la §3.2 de `408dc07`, que ya
devuelve el eslabón roto por fila):

```sql
SELECT c.numero_carrera_programa AS carrera, s.nombre AS ejemplar,
       cab.nombre AS caballeriza, i.caballeriza_id,
       CASE
         WHEN i.caballeriza_id IS NULL THEN 'inscripción sin caballeriza'
         WHEN NOT EXISTS (SELECT 1 FROM caballeriza_responsables cr
                          WHERE cr.caballeriza_id = i.caballeriza_id)
              THEN 'caballeriza sin ninguna fila de responsable'
         WHEN NOT EXISTS (SELECT 1 FROM caballeriza_responsables cr
                          WHERE cr.caballeriza_id = i.caballeriza_id AND cr.rol='propietario')
              THEN 'tiene responsables pero ninguno con rol propietario'
         WHEN NOT EXISTS (SELECT 1 FROM caballeriza_responsables cr
                          WHERE cr.caballeriza_id = i.caballeriza_id AND cr.rol='propietario' AND cr.activo=true)
              THEN 'rol propietario cargado pero INACTIVO'
         ELSE 'fila de propietario con propietario_id en NULL'
       END AS eslabon_que_falta
FROM inscripciones i
JOIN carreras c ON c.id = i.carrera_id
JOIN spcs s ON s.id = i.spc_id
LEFT JOIN caballerizas cab ON cab.id = i.caballeriza_id
WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
  AND i.estado = 'ratificado' AND i.propietario_id IS NULL
ORDER BY c.numero_carrera_programa, s.nombre;
```

Los tres motivos realistas de que no dé 67, con lo medido hoy:

| motivo | probabilidad hoy | qué hacer |
|---|---|---|
| caballeriza con fila propietario **inactiva** (candado 2 la saltea a propósito) | 0 casos hoy, posible tras la carga manual | activar la fila a mano en `caballerizas.html` y re-derivar |
| fila propietario cargada con `propietario_id` NULL | 0 casos hoy, posible si se carga sin documento y sin elegir propietario | completar el propietario y re-derivar |
| inscripción sin `caballeriza_id` | **0 casos** — las 67 tienen caballeriza | — |

### 5.4 POSTERIOR — que no se haya tocado nada de más

```sql
SELECT (SELECT count(*) FROM propietarios WHERE notas LIKE 'provisorio R8%')       AS provisorios,
       (SELECT count(*) FROM caballeriza_responsables cr
          JOIN propietarios p ON p.id=cr.propietario_id
         WHERE p.notas LIKE 'provisorio R8%')                                      AS cr_provisorios,
       (SELECT count(*) FROM spcs)                                                 AS spcs,
       (SELECT count(*) FROM propietarios)                                         AS propietarios_total;
```

**Esperado hoy: 40 / 40 / 183 / 253** (213 Dolores + 40, o 220 + 40 global). Los dos
primeros números tienen que ser **iguales entre sí** siempre: un propietario provisorio
sin su fila de responsable es un huérfano.

Más el diff de las 18 contra el snapshot (`408dc07` §4.2, esperado **0 filas**) y el
control de que R6 y la 9999 no se movieron (`408dc07` §4.4).

---

## 6. ROLLBACK

Hay **dos** rollbacks distintos y se corren en este orden: primero se devuelven las
inscripciones, después se sacan los provisorios. Al revés, la FK rebota.

### 6.1 Snapshot previo (obligatorio, `408dc07` §5.1)

`CREATE TABLE bak_r8_propietario AS SELECT ...` sobre los 67 ratificados, más el CSV
commiteado al branch. Es la primera escritura de toda la operación, antes que los INSERT.

### 6.2 Paso 1 — devolver las inscripciones

```sql
UPDATE inscripciones i
SET propietario_id = b.propietario_id
FROM bak_r8_propietario b
WHERE b.inscripcion_id = i.id
  AND i.propietario_id IS DISTINCT FROM b.propietario_id;
```

Vuelve a 18 con propietario / 49 en NULL. No dispara el trigger.

### 6.3 Paso 2 — borrar los provisorios sin tocar los reales

La marca de `notas` es lo que hace esto seguro: **sólo se borra lo que tiene la marca.**
Un propietario real nunca la tiene.

```sql
-- 2a. Primero las filas de responsable que apuntan a provisorios.
DELETE FROM caballeriza_responsables cr
USING propietarios p
WHERE p.id = cr.propietario_id
  AND p.notas LIKE 'provisorio R8%';

-- 2b. Después los propietarios provisorios.
DELETE FROM propietarios p
WHERE p.notas LIKE 'provisorio R8%';
```

Esperado hoy: 40 y 40. El orden importa — `caballeriza_responsables_propietario_id_fkey`
**no tiene** `ON DELETE CASCADE`, así que 2b antes que 2a falla.

### 6.4 Qué pasa si alguno ya tiene un recibo emitido

**La base lo frena sola.** Ninguna de las FK que apuntan a `propietarios` tiene CASCADE:

```
caballeriza_responsables.propietario_id  → propietarios(id)
inscripciones.propietario_id             → propietarios(id)
liquidaciones.propietario_id             → propietarios(id)
recibos.propietario_id                   → propietarios(id)
spc_propietarios.propietario_id          → propietarios(id)
```

Si hay un recibo o una liquidación contra un provisorio, el `DELETE` de 6.3 aborta con
`violates foreign key constraint`. **Eso es lo correcto: no se borra plata ya emitida.**
No forzar, no cascadear, no borrar el recibo.

Qué hacer en ese caso — **desactivar en vez de borrar**:

```sql
UPDATE propietarios
SET activo = false,
    estado = 'inactivo',
    notas  = notas || ' — reemplazado por titular real, no borrar: tiene recibo'
WHERE id = '<uuid del provisorio>';

UPDATE caballeriza_responsables SET activo = false
WHERE propietario_id = '<uuid del provisorio>';
```

El propietario provisorio queda como registro histórico de a quién se le pagó ese día
—que es exactamente lo que un recibo emitido significa— y deja de aparecer en las
búsquedas. Después, cargar el titular real como responsable nuevo y re-derivar para las
reuniones siguientes. **Las inscripciones de R8 que ya tienen recibo cobrado no se
retocan.**

Chequeo previo al rollback, para saber en qué caso estamos:

```sql
SELECT p.id, p.nombre,
       (SELECT count(*) FROM recibos r WHERE r.propietario_id = p.id)       AS recibos,
       (SELECT count(*) FROM liquidaciones l WHERE l.propietario_id = p.id) AS liquidaciones
FROM propietarios p
WHERE p.notas LIKE 'provisorio R8%'
ORDER BY 3 DESC, 4 DESC;
```

Si todo da 0 → `DELETE` limpio (6.3). Si alguno da >0 → desactivar ése, borrar el resto.

### 6.5 Limpieza

`DROP TABLE bak_r8_propietario` recién cuando R8 esté liquidada, cobrada y cerrada.

---

## 7. ORDEN DE EJECUCIÓN

| # | paso | tipo | criterio de avance |
|---|---|---|---|
| 1 | Guard: `pwd` + `SELECT count(*) FROM spcs` = 183 + ref `unlhcuanfrtpatoipwve` | read-only | los tres OK |
| 2 | Foto previa: §1.1 + §1.2 (cuántas quedan sin responsable **en ese momento**) | read-only | anotar los números |
| 3 | Snapshot `bak_r8_propietario` + CSV al branch (`408dc07` §5.1) | **DDL** | `count` = 67 y CSV commiteado |
| 4 | **(a)** INSERT §2.4 — propietarios + responsables provisorios. Sin excepciones: `El linye y Rami` entra como una más (§8) | **escritura** | filas = las que faltaban en el paso 2, en ambas tablas |
| 5 | Correr el INSERT §2.4 **una segunda vez** | **escritura** | **0 filas**. Si inserta algo, frenar |
| 6 | §5.2 duplicados | read-only | 0 filas |
| 7 | **(b)** UPDATE §4.2 — re-derivar `propietario_id` sobre R8 | **escritura R8** | filas = las que estaban en NULL |
| 8 | **(c)** §5.3 verificación | read-only | **67 / 67 / 0** |
| 9 | Si no da 67: lista de §5.3 y **frenar**, decisión de Fede | read-only | — |
| 10 | §4.2 de `408dc07` — diff de las 18 contra el snapshot | read-only | **0 filas** |
| 11 | §5.4 — provisorios = cr_provisorios, spcs = 183 | read-only | valores esperados |
| 12 | **(d)** Recién ahora: oficializar la primera carrera del domingo | — | — |

**El orden no es preferencia, es guarda** (`408dc07` §7): oficializar dispara
`generarLiquidacionesReunion()`. Si en ese momento falta `propietario_id`, las líneas del
70 % y el bono 6°–8° **no se emiten**, y aparecen recién al recalcular — lo que significa
pagar en dos vueltas con la gente en la ventanilla.

Si el paso 10 devuelve filas → rollback §6 inmediato.

---

## 8. `El linye y Rami` duplicada — RESUELTO, no bloquea

**`El linye y Rami` está duplicada en Dolores, y las dos corren en R8.**

| caballeriza | id | responsable | ratificado en R8 |
|---|---|---|---|
| `El linye y Rami` | `a692fdea-…` | **ninguno** | DE BELLOSO — carrera 2 |
| `EL LINYE Y RAMI` | `d8f78de4-…` | CUEVAS, CESAR DANIEL | LA DIVERTENTE — carrera 5 |

*(cada una tiene además un forfait del mismo ejemplar en otro turno — no afecta: el script
sólo mira ratificados.)*

**Decisión tomada (Leo, 15/08): NO se unen.** Asumir que son la misma caballeriza arriesga
pagarle el 70 % a la persona equivocada.

**Y no frena nada.** `El linye y Rami` (`a692fdea-…`) se trata como **una más del
conjunto**: recibe su propietario provisorio con el nombre de la caballeriza, igual que las
otras. No hay excepción, no hay caso especial en el SQL de §2.4 — el CTE `falta` ya la
incluye por construcción, porque no tiene ninguna fila de responsable.

Con eso, el 70 % de **DE BELLOSO** queda asignado a un registro identificable, **sin
decidir** si las dos caballerizas son la misma. La pregunta a Fede queda abierta pero
desacoplada de la ejecución: si después confirma que son la misma, se unifican los dos
registros y se corrige — con R8 ya liquidada y sin haber frenado el domingo.

Lo que **no** hay que hacer es linkear `a692fdea-…` a
`8f63f7ab-260d-4f07-985e-467145bd11bd` (CUEVAS) antes de que Fede lo confirme.

(`LA NARCISA` también está duplicada pero **no corre en R8** — no afecta esto.)

---

## 9. Lo que este plan NO hace

- No agrega columnas ni toca schema. `notas` ya existía (§ PASO 0).
- No inventa documento, domicilio, teléfono ni email de nadie. Todo NULL.
- No toca las 17 caballerizas que ya tienen responsable, ni las 18 inscripciones ya
  resueltas.
- No toca ninguna caballeriza que tenga **cualquier** fila `rol='propietario'`, aunque
  esté inactiva o incompleta — ésas se reportan, no se pisan.
- No toca R6, la 9999, ni ninguna otra reunión.
- No modifica los triggers ni las funciones. El `LIMIT 1` sin `ORDER BY` de
  `fn_inscripcion_set_propietario` sigue siendo deuda técnica a corregir en frío después
  del domingo.
- No implementa la guarda de aviso al oficializar (`408dc07` §8) — sigue siendo una
  decisión aparte, sin codear.

---

## Anexo — las 40 caballerizas sin responsable al 15/08

Nombre · ratificados en R8. Suma = 49.

| # | caballeriza | ratif |
|---|---|---|
| 1 | ABUELO FLORO | 1 |
| 2 | BETTY SANTI | 1 |
| 3 | CRAZY HORSE | 2 |
| 4 | DON BENICIO | 1 |
| 5 | DON GIOVANNI | 1 |
| 6 | DON RAUL | 1 |
| 7 | EL CHINGA | 1 |
| 8 | EL COLORADO | 1 |
| 9 | EL DERBY | 1 |
| 10 | EL DESTINO | 1 |
| 11 | EL HORNERITO CAFE | 1 |
| 12 | EL LALO | 1 |
| 13 | El linye y Rami | 1 |
| 14 | EL NIETO | 2 |
| 15 | EL PIMPO | 1 |
| 16 | EL VETERANO | 1 |
| 17 | EMI | 1 |
| 18 | ESTAMPA DEL SUR | 1 |
| 19 | FEDERICO Y MIGUEL | 1 |
| 20 | LA MILINGA | 3 |
| 21 | LA MORALEJA | 1 |
| 22 | LA PICHI | 1 |
| 23 | LAGUNA VERDE | 1 |
| 24 | LOS CATACHOS | 2 |
| 25 | LOS CUERVOS | 1 |
| 26 | LOS EDUCADITOS | 1 |
| 27 | LOS MELLI | 2 |
| 28 | LOS MONCHITOS | 1 |
| 29 | LOS MORENITOS | 1 |
| 30 | LOS URONES | 1 |
| 31 | LUNA ROJA | 1 |
| 32 | MAR DEL TUYU | 1 |
| 33 | MARTIN Y NICOLAS | 1 |
| 34 | MELINA A | 2 |
| 35 | MI MARTINCITO | 1 |
| 36 | NEGRO T | 2 |
| 37 | NUEVO MUNDO | 1 |
| 38 | RD NECOCHEA | 2 |
| 39 | SANTOS VEGA | 1 |
| 40 | TIAN Y ROMA | 1 |

Esta lista es **informativa, de hoy**. El script no la usa: deriva el conjunto de la base
en el momento de correr (§3, candado 1).

**Nada de esto se ejecuta hasta tu OK explícito.**
