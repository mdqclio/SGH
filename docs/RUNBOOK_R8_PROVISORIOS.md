# Runbook — ejecución de los propietarios provisorios (R8)

**Plan aprobado:** `docs/PLAN_PROPIETARIOS_PROVISORIOS_R8.md` (branch
`chore/propietarios-provisorios-r8`, SHA `66d9d05`).

**Estado: ARMADO, SIN EJECUTAR.** Se corre **mañana 16/08**, después de que Yesi, Fede y
Valeria hayan cargado lo que sepan. **Si se corre antes, llena las 40 con provisorios y el
trabajo de ellos pasa de carga a corrección.**

> ### ⚠️ Revisión 18/08 — el escenario cambió
>
> El runbook se escribió para una reunión **sin oficializar**. Al 18/08 R8 tiene
> **6 carreras oficializadas**, **69 liquidaciones** en borrador ($6.429.081,99) y
> **1 pago emitido** (recibo #1, QUINTEROS, $70.000). El backfill **nunca se corrió**:
> 49 de las 67 ratificadas siguen sin `propietario_id` y 40 de las 57 caballerizas sin
> ninguna fila de responsable.
>
> Ocho cambios, detallados en **§Cambios de la revisión 18/08** al final:
>
> 1. **B1** — `oficiales = 0` deja de frenar; pasa a informativo y **obliga** a B10.
> 2. **B9.2** — guard nuevo: la clave de las líneas comprometidas tiene que ser reproducible.
> 3. **B9.1 + B11.1** — foto de la línea pagada antes, comparación después. STOP.
> 4. **B9.3 + B11.3** — conteo de propietario antes/después. STOP sobre el monto.
> 5. **Punto de no retorno** — sección nueva.
> 6. **Rollback §B** — cómo deshacer con el recálculo ya hecho.
> 7. **B9.4 + B11.4** — retenidas por anti-doping: foto y verificación. STOP.
> 8. **B2** — el CSV del snapshot NO se commitea: es PII y el repo es público.
>
> B0, B2, B3, B4, B5, B6, B7 y B8 **no se tocaron**.

- Proyecto: `unlhcuanfrtpatoipwve` · club `0649e9c5-9e87-4aad-842f-101458e6b33c`
- R8 = `7b6e003e-22e2-4629-bf55-f18560b1260f`
- Marca literal: `provisorio R8 15/08` (no cambiar aunque se ejecute el 16 — es la llave
  de idempotencia y de rollback, y ya está escrita en todas las queries de este runbook)

Cada bloque de abajo se corre **entero, en orden**, y no se pasa al siguiente sin cumplir
el criterio. Los bloques marcados 🔴 son escritura.

---

## B0 · Guard (read-only)

Shell:

```bash
pwd            # debe dar /home/clio/dev/SGH
```

SQL:

```sql
SELECT current_database(), (SELECT count(*) FROM spcs) AS spcs;
```

**Criterio: `pwd` = `/home/clio/dev/SGH`, `spcs` = 183, ref = `unlhcuanfrtpatoipwve`.**
Si alguno falla → **FRENAR**. No es la base que pensamos.

---

## B1 · Medir cuántas quedan sin responsable (read-only)

Es el paso 1 de tu orden. **El número que salga de acá es el que se compara en B3 y B5** —
no se usa el 40 de ayer.

```sql
WITH r8 AS (SELECT id FROM carreras WHERE reunion_id='7b6e003e-22e2-4629-bf55-f18560b1260f'),
ins AS (SELECT i.* FROM inscripciones i WHERE i.carrera_id IN (SELECT id FROM r8) AND i.estado='ratificado'),
cab AS (SELECT DISTINCT caballeriza_id FROM ins WHERE caballeriza_id IS NOT NULL)
SELECT
 (SELECT count(*) FROM ins)                                        AS ratificados,
 (SELECT count(*) FROM ins WHERE propietario_id IS NOT NULL)       AS con_prop,
 (SELECT count(*) FROM ins WHERE propietario_id IS NULL)           AS sin_prop,
 (SELECT count(*) FROM cab)                                        AS cab_r8,
 (SELECT count(*) FROM cab WHERE NOT EXISTS (
    SELECT 1 FROM caballeriza_responsables cr
    WHERE cr.caballeriza_id=cab.caballeriza_id AND cr.rol='propietario'))
                                                                   AS cab_sin_ninguna_fila,
 (SELECT count(*) FROM cab WHERE EXISTS (
    SELECT 1 FROM caballeriza_responsables cr
    WHERE cr.caballeriza_id=cab.caballeriza_id AND cr.rol='propietario' AND cr.activo=false))
                                                                   AS cab_prop_inactivo,
 (SELECT count(*) FROM cab WHERE EXISTS (
    SELECT 1 FROM caballeriza_responsables cr
    WHERE cr.caballeriza_id=cab.caballeriza_id AND cr.rol='propietario' AND cr.propietario_id IS NULL))
                                                                   AS cab_fila_prop_sin_id,
 (SELECT count(*) FROM resultados r WHERE r.carrera_id IN (SELECT id FROM r8) AND r.estado='oficial')
                                                                   AS oficiales;
```

**Anotar `cab_sin_ninguna_fila` = N.** Ése es el número de filas que van a entrar en B3, en
las dos tablas.

**Criterio de halt: `ratificados` = 67.**

**`oficiales` pasa a ser INFORMATIVO — ya no frena.** *(revisión 18/08, ver §Cambio 1)*

> **Por qué cambió.** El criterio original era `oficiales = 0`. No protegía ningún dato:
> protegía una **secuencia**. Asumía el orden backfill → oficializar (B9 viejo); con cero
> oficiales no existía ninguna liquidación, así que no había nada que recalcular y no hacía
> falta razonar sobre el recálculo. Su propio texto lo decía: *"cambia el escenario, hay que
> recalcular después"*. Era un "esto no está previsto", no un "esto rompe algo".
>
> El escenario que evitaba **ya ocurrió**: al 18/08 hay **6 carreras oficiales**, 69
> liquidaciones en borrador y 1 pago emitido. Frenar acá no revierte nada — solo deja el
> backfill sin hacer y la plata del propietario sin generar.
>
> **La condición nueva invierte el sentido: en vez de evitar el recálculo, lo obliga.**
> Si `oficiales` > 0, el recálculo (B10) deja de ser opcional y pasa a ser **parte
> obligatoria de la operación**. Terminar en B8 sin recalcular es hoy el estado peligroso:
> `propietario_id` relleno y liquidaciones viejas que no lo reflejan — la base dice una cosa
> y la pantalla de Valeria otra.

**Anotar `oficiales` = O.** Determina el cierre de la operación:

| `oficiales` | cómo cierra |
|---|---|
| `0` | la operación termina en B8. B9–B11 no aplican. |
| `> 0` | **B9, B10 y B11 son obligatorios.** No se da por terminada hasta que B11 pase. |

**Si `oficiales` > 0 y no se puede recalcular en la misma sesión → FRENAR ANTES DE B3.**
No arrancar lo que no se va a poder cerrar.

**Si el guard nuevo fallara** (se anota `oficiales` mal, o se corre B3–B8 y se abandona sin
B10): la base queda con `propietario_id` completo y liquidaciones desactualizadas. **No se
corrompe nada y no se pierde plata** — las líneas viejas siguen siendo válidas y pagables.
El daño es de percepción: faltan las líneas del propietario y nada avisa que falta un paso.
Se arregla corriendo B10 cuando sea. Es recuperable, pero deja a Valeria pagando una foto
incompleta sin saberlo.

`cab_prop_inactivo` y `cab_fila_prop_sin_id` son cargas humanas a medias: el script las
saltea a propósito. Si son > 0, sacar la lista con B7-bis y arreglarlas a mano por
`caballerizas.html` **antes** de B6.

Lista nominal de las que van a entrar (para leerla antes de escribir):

```sql
SELECT c.nombre AS caballeriza, count(*) AS ratif
FROM inscripciones i
JOIN carreras ca ON ca.id=i.carrera_id
JOIN caballerizas c ON c.id=i.caballeriza_id
WHERE ca.reunion_id='7b6e003e-22e2-4629-bf55-f18560b1260f' AND i.estado='ratificado'
  AND NOT EXISTS (SELECT 1 FROM caballeriza_responsables cr
                  WHERE cr.caballeriza_id=c.id AND cr.rol='propietario')
GROUP BY c.id, c.nombre ORDER BY c.nombre;
```

---

## B2 🔴 · Snapshot — primera escritura de toda la operación

**Este bloque no está en tu lista de 7 pasos pero va antes que todo lo demás:** sin él, el
rollback de §6.2 del plan no tiene contra qué restaurar. Es DDL → `apply_migration`.

```sql
CREATE TABLE bak_r8_propietario AS
SELECT i.id AS inscripcion_id, i.carrera_id, i.spc_id, i.caballeriza_id,
       i.propietario_id, now() AS snapshot_at
FROM inscripciones i JOIN carreras c ON c.id = i.carrera_id
WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' AND i.estado = 'ratificado';
```

```sql
SELECT count(*) AS filas, count(propietario_id) AS con_prop FROM bak_r8_propietario;
```

**Criterio: `filas` = 67.** Nada más se ejecuta hasta que esto dé 67.

Copia opcional fuera de la base, **que NO se commitea** (ver aviso abajo):

```sql
SELECT i.id, s.nombre AS ejemplar, i.propietario_id
FROM inscripciones i JOIN carreras c ON c.id=i.carrera_id JOIN spcs s ON s.id=i.spc_id
WHERE c.reunion_id='7b6e003e-22e2-4629-bf55-f18560b1260f' AND i.estado='ratificado'
ORDER BY s.nombre;
```

→ guardar como **`tmp/bak_r8_propietario_20260816.csv`**. **NO commitear.**

> ### 🔴 PII — el CSV no va al repo *(revisión 18/08, ver §Cambio 8)*
>
> La versión original decía *"guardar como `docs/bak_r8_propietario_20260816.csv`, commit +
> push"*. **Se revierte.** El repo es **público** (GitHub Pages sirve `main`) y ese CSV mapea
> inscripciones a propietarios **con nombre y apellido de personas reales**. Es PII y no se
> commitea, ni a `docs/` ni a ningún lado.
>
> **El snapshot que sirve para el rollback es la tabla `bak_r8_propietario` en la base**, que
> ya se creó arriba. El CSV es una comodidad de lectura, no es el respaldo. Si el CSV no se
> genera, el rollback funciona igual.
>
> ⚠️ **`tmp/` NO está en `.gitignore`** y tiene archivos ya trackeados
> (`tmp/etapa_a_deploy.md`, `tmp/preview_tapa.png`, y otros). Dejarlo en `tmp/` **no alcanza**:
> un `git add .` distraído lo sube. Por eso se agregó la regla explícita a `.gitignore`:
>
> ```
> tmp/bak_r8_*.csv
> ```
>
> **Antes de cualquier commit durante esta operación**, verificar:
>
> ```bash
> git status --porcelain | grep -i "bak_r8\|propietario.*csv"   # debe salir vacío
> ```
>
> Relacionado, pendiente aparte: `fix/dni-cuidadores` y `fix/dni-jockeys` tienen el mismo
> problema de PII sin resolver. **No se suma uno más acá.**

---

## B3 🔴 · Insertar provisorios sólo sobre las que quedaron

Paso 2 de tu orden. **Una sola sentencia, atómica.** Sin excepciones: `El linye y Rami`
entra como una más (plan §8).

```sql
WITH falta AS (
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
  WHERE NOT EXISTS (
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
LEFT JOIN LATERAL (
  SELECT p.id FROM propietarios p
  WHERE p.club_id = f.club_id
    AND upper(btrim(p.nombre)) = upper(btrim(f.nombre))
    AND p.notas LIKE 'provisorio R8%'
  ORDER BY p.created_at, p.id LIMIT 1
) pe ON true
WHERE COALESCE(n.id, pe.id) IS NOT NULL;
```

**Criterio: filas afectadas = N (el `cab_sin_ninguna_fila` de B1).**
Si difiere → **FRENAR**: algo cambió entre B1 y B3 (alguien cargando en paralelo). Volver a
B1 y recontar.

⚠️ `documento_nro` y `documento_tipo` van **ausentes** del INSERT, a propósito. Si se
agregan, `trg_cab_resp_set_propietario` pisa el `propietario_id` y crea propietarios por
documento (plan §2.3). **No agregarlos.**

Control inmediato:

```sql
SELECT (SELECT count(*) FROM propietarios WHERE notas LIKE 'provisorio R8%')  AS provisorios,
       (SELECT count(*) FROM caballeriza_responsables cr JOIN propietarios p ON p.id=cr.propietario_id
         WHERE p.notas LIKE 'provisorio R8%')                                 AS cr_provisorios;
```

**Criterio: los dos iguales entre sí, y = N.**

---

## B4 🔴 · Correr B3 una segunda vez — prueba de idempotencia

Paso 3 de tu orden. **Copiar y pegar el mismo bloque B3, sin cambiarle nada.**

**Criterio: 0 filas afectadas.**
Si inserta aunque sea 1 fila → **FRENAR y avisar**. Significa que uno de los tres candados
del plan §3 no funciona como está descripto, y no se re-deriva hasta entender por qué.

Re-correr el control de B3: los dos números tienen que seguir iguales a N.

---

## B5 · Chequeo de duplicados (read-only) — **STOP obligatorio**

Paso 4 de tu orden.

```sql
SELECT cab.nombre, cab.id AS caballeriza_id, count(*) AS filas_propietario_activo,
       array_agg(p.nombre) AS propietarios,
       array_agg(COALESCE(p.notas,'—')) AS notas
FROM caballeriza_responsables cr
JOIN caballerizas cab ON cab.id = cr.caballeriza_id
LEFT JOIN propietarios p ON p.id = cr.propietario_id
WHERE cr.rol='propietario' AND cr.activo = true
  AND cr.caballeriza_id IN (
    SELECT DISTINCT i.caballeriza_id FROM inscripciones i JOIN carreras c ON c.id = i.carrera_id
    WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' AND i.estado='ratificado')
GROUP BY cab.id, cab.nombre HAVING count(*) > 1;
```

**Criterio: 0 filas.**
**Si devuelve algo → FRENAR y avisarte ANTES de re-derivar.** El caso típico va a ser el
provisorio + el real que alguien cargó en el medio; se ve en la columna `notas` cuál es
cuál. Resolver a mano cuál queda `activo=true` y recién después seguir. Si no, gana el
`LIMIT 1` sin `ORDER BY` de `fn_inscripcion_set_propietario` y el titular es arbitrario.

---

## B6 🔴 · Re-derivar `propietario_id` sobre R8

Paso 5 de tu orden. Plan A de `408dc07` §1.3, sin cambios.

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

**Criterio: filas afectadas = el `sin_prop` medido en B1.**

---

## B7 · Verificar 67 / 67 / 0 (read-only)

Paso 6 de tu orden.

```sql
SELECT count(*) AS ratificados,
       count(i.propietario_id) AS con_propietario,
       count(*) FILTER (WHERE i.propietario_id IS NULL) AS sin_propietario
FROM inscripciones i JOIN carreras c ON c.id = i.carrera_id
WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' AND i.estado = 'ratificado';
```

**Criterio: 67 / 67 / 0.**

### B7-bis · Si no da 67 — cuáles y por qué

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

Devuelve el eslabón roto por fila. Arreglar la causa por `caballerizas.html` y re-correr
B6 (es idempotente). **No forzar valores a mano salvo caso suelto y con el dato confirmado.**

---

## B8 · Controles de que no se tocó nada de más (read-only)

```sql
-- 1) ninguna de las que ya estaban resueltas cambió de dueño
SELECT b.inscripcion_id, s.nombre AS ejemplar, b.propietario_id AS antes, i.propietario_id AS despues
FROM bak_r8_propietario b
JOIN inscripciones i ON i.id = b.inscripcion_id
JOIN spcs s ON s.id = i.spc_id
WHERE b.propietario_id IS NOT NULL AND b.propietario_id IS DISTINCT FROM i.propietario_id;
```

**Criterio: 0 filas.** Si devuelve algo → rollback del plan §6, inmediato.

```sql
-- 2) qué se agregó, para revisar de ojo
SELECT c.numero_carrera_programa AS carrera, s.nombre AS ejemplar,
       p.nombre AS propietario_asignado, COALESCE(p.notas,'—') AS notas
FROM bak_r8_propietario b
JOIN inscripciones i ON i.id = b.inscripcion_id
JOIN carreras c ON c.id = i.carrera_id
JOIN spcs s ON s.id = i.spc_id
LEFT JOIN propietarios p ON p.id = i.propietario_id
WHERE b.propietario_id IS NULL AND i.propietario_id IS NOT NULL
ORDER BY c.numero_carrera_programa, s.nombre;
```

```sql
-- 3) nada fuera de R8
SELECT (SELECT count(*) FROM spcs)                                            AS spcs,
       (SELECT count(*) FROM propietarios WHERE notas LIKE 'provisorio R8%')  AS provisorios,
       (SELECT count(*) FROM inscripciones i JOIN carreras c ON c.id=i.carrera_id
         WHERE c.reunion_id='a0000000-0000-0000-0000-000000009999')           AS insc_9999;
```

**Criterio: `spcs` = 183, `provisorios` = N, `insc_9999` sin cambios (17).**

---

## B9 · Fotografiar lo comprometido y contar lo de propietario (read-only) — **STOP obligatorio**

*(bloque nuevo, revisión 18/08 — ver §Cambio 3 y §Cambio 4)*

El B9 viejo decía *"oficializar la primera carrera"*. **Ya no aplica: al 18/08 hay 6 carreras
oficializadas.** No hay primera carrera que oficializar; lo que falta es que las liquidaciones
existentes reflejen el backfill. B9–B11 reemplazan a aquel paso.

**Nada de esto se corre si `oficiales` = 0 en B1.**

### B9.1 · Foto de las líneas comprometidas

```sql
SELECT ld.id, ld.concepto, ld.monto_neto, ld.estado_linea, ld.recibo_id,
       r.numero_recibo, r.neto_a_cobrar, ld.beneficiario_tipo, ld.beneficiario_id,
       ld.concepto_tipo, ld.posicion, ld.inscripcion_id, ld.liquidacion_id
FROM liquidacion_detalle ld
LEFT JOIN recibos r ON r.id = ld.recibo_id
WHERE ld.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
  AND (ld.estado_linea = 'pagado' OR ld.recibo_id IS NOT NULL)
ORDER BY ld.id;
```

**Copiar la salida entera acá abajo antes de seguir.** Es el registro contra el que compara
B11. Estado medido el 18/08 (1 sola fila en toda la reunión):

| campo | valor |
|---|---|
| `id` | `28b05448-7983-46bb-94ff-213996dbeb82` |
| `concepto` | `Carrera 1 — 5° puesto` |
| `monto_neto` | `70000.00` |
| `estado_linea` | `pagado` |
| `numero_recibo` | `1` (QUINTEROS, CARLA ELISABETH) |
| `beneficiario_tipo` / `beneficiario_id` | `propietario` / `37fa6583-08bb-47ca-9923-bbe746c88537` |
| `concepto_tipo` / `posicion` | `premio` / `5` |
| `inscripcion_id` | `6b74ddec-4f93-49e4-b303-b0f8ff33c526` |

**Criterio: la foto tiene que dar exactamente 1 fila y coincidir con la tabla de arriba.**
Si hay más de una, actualizar la tabla con todas antes de seguir — B11 las compara todas.

### B9.2 · Que la clave de esa línea sea reproducible

El motor preserva lo pagado por `lineKey` (`liquidaciones-engine.js:37`):

```
beneficiario_tipo | beneficiario_id | concepto_tipo | inscripcion_id | posicion | concepto
```

El `concepto` se reconstruye como `Carrera ${numero_carrera_programa ?? numero_turno} — ${pos}° puesto`
(`liquidaciones-engine.js:177-178`). **Si el número de carrera cambió desde que se pagó, la
clave no coincide y el motor duplica la línea pagada.**

```sql
SELECT ld.id, ld.concepto AS guardado,
       'Carrera ' || COALESCE(c.numero_carrera_programa, c.numero_turno) || ' — ' || ld.posicion || '° puesto' AS regeneraria,
       (ld.concepto = 'Carrera ' || COALESCE(c.numero_carrera_programa, c.numero_turno) || ' — ' || ld.posicion || '° puesto') AS coincide,
       (i.propietario_id = ld.beneficiario_id) AS benef_ok
FROM liquidacion_detalle ld
JOIN carreras c ON c.id = ld.carrera_id
LEFT JOIN inscripciones i ON i.id = ld.inscripcion_id
WHERE ld.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
  AND (ld.estado_linea = 'pagado' OR ld.recibo_id IS NOT NULL);
```

**Criterio: `coincide` = true y `benef_ok` = true en todas las filas.** Verificado el 18/08:
las dos en `true`.
**Si alguna da false → FRENAR.** Renumeraron la carrera después del pago; recalcular
duplicaría la línea pagada. Hay que entender por qué antes de tocar nada.

### B9.3 · Conteo de propietario ANTES

```sql
SELECT ld.concepto_tipo, ld.estado_linea, count(*) AS lineas, sum(ld.monto_neto) AS neto
FROM liquidacion_detalle ld
WHERE ld.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
  AND ld.beneficiario_tipo = 'propietario'
GROUP BY ROLLUP (ld.concepto_tipo, ld.estado_linea) ORDER BY 1,2;
```

Medido el 18/08 — **anotar lo que dé hoy, no copiar esto**:

| | líneas | neto |
|---|---|---|
| premio | 8 | $1.962.438,33 |
| bono | 4 | $400.000,00 |
| **total propietario** | **12** | **$2.362.438,33** |
| *(de esas: impagas)* | *7* | *$764.000,00* |
| *(retenidas)* | *4* | *$1.528.438,33* |
| *(pagadas)* | *1* | *$70.000,00* |

### B9.4 · Foto de las retenidas por anti-doping — **STOP obligatorio**

*(bloque nuevo, revisión 18/08 — ver §Cambio 7)*

```sql
SELECT ld.id, ld.beneficiario_tipo, ld.beneficiario_id, ld.concepto, ld.concepto_tipo,
       ld.posicion, ld.inscripcion_id, ld.monto_neto, ld.estado_linea, ld.fecha_liberacion
FROM liquidacion_detalle ld
WHERE ld.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
  AND ld.estado_linea = 'retenido'
ORDER BY ld.beneficiario_tipo, ld.posicion, ld.concepto;
```

**Copiar la salida entera antes de seguir.** Estado medido el 18/08: **28 retenidas**, todas
con `fecha_liberacion = 2026-09-15` (reunión 16/08 + `dias_antidoping` 30).

| beneficiario | 1° | 2° | total |
|---|---|---|---|
| profesional | 12 · $1.356.200,00 | 12 · $381.963,32 | **24** |
| **propietario** | **2 · $1.246.700,00** | **2 · $281.738,33** | **4** |
| | | | **28 · $3.266.601,65** |

Las 4 de propietario, nominales:

| id | propietario | concepto | pos | monto |
|---|---|---|---|---|
| `5d38a098-7370-4d2d-8883-f1e9f0ab1e6f` | ALDAY, RAMIRO EMILIO | Carrera 1 — 1° puesto | 1 | $602.000,00 |
| `9390b559-6f34-4765-a25c-71ee8f4c453f` | DIESTRA, CAMILA AYLEN | Carrera 7 — 1° puesto | 1 | $644.700,00 |
| `ec96c1e7-f3ef-48d5-9b9d-c89831fd6057` | DIAZ, CARLOS RODOLFO | Carrera 3 — 2° puesto | 2 | $133.000,00 |
| `1f84b3b0-c0b9-40bc-a937-859a28f1b0b1` | PEREYRA, ROBERTO CARLOS | Carrera 7 — 2° puesto | 2 | $148.738,33 |

**Criterio: 28 retenidas y `fecha_liberacion` única = 2026-09-15.**

Control complementario — que ningún 1°/2° de premio esté ya liberado:

```sql
SELECT ld.posicion, ld.estado_linea, count(*)
FROM liquidacion_detalle ld
WHERE ld.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
  AND ld.concepto_tipo = 'premio' AND ld.posicion IN (1,2)
GROUP BY 1,2 ORDER BY 1,2;
```

**Criterio: todo 1° y 2° en `retenido`. Ninguna en `impago`.**
Medido el 18/08: 14 en 1° y 14 en 2°, **todas retenidas, ninguna liberada a mano**.

⚠️ **Si alguna aparece `impago`**, alguien la liberó con `liberar_linea` **antes** del
recálculo. **FRENAR y avisar**: el recálculo la va a revertir a `retenido` y esa liberación se
pierde en silencio. Hay que decidir primero si fue deliberada.

> ### ⚠️ El `id` de las retenidas SÍ cambia — el control NO puede ser por `id`
>
> A diferencia de la línea pagada, **las retenidas se borran y se regeneran**. El DELETE del
> motor (`liquidaciones-engine.js:284-289`) excluye `recibo_id IS NOT NULL` y
> `estado_linea='pagado'` — **`retenido` no está excluido**, así que entra en el borrado. Se
> vuelve a crear en el paso 3 con `estado_linea: retenido ? 'retenido' : 'impago'`, donde
> `retenido = concepto_tipo==='premio' && (posicion===1 || posicion===2)` (línea 307), y
> `fecha_liberacion` recomputada desde `reuniones.fecha + dias_antidoping` (determinista →
> mismo valor).
>
> **Consecuencia: los 4 `id` de arriba NO van a existir después de B10.** Exigir "mismo id"
> sería un STOP falso garantizado. El control de B11.4 va por **clave lógica**
> (`beneficiario_id` + `inscripcion_id` + `posicion` + `concepto_tipo`), no por `id`.
>
> Los `id` se fotografían igual: sirven para **probar** que fueron reemplazadas y no mutadas.

---

## B10 🔴 · Recalcular las liquidaciones de la reunión

*(bloque nuevo, revisión 18/08 — reemplaza al B9 viejo)*

**No es SQL. Lo hace una persona por pantalla:**
`liquidaciones.html` → seleccionar **R8** → botón **"Recalcular reunión"** → confirmar.

Corre `generarLiquidacionesReunion()` (`liquidaciones-engine.js`), paid-safe. Es el paso que
materializa el backfill: **sin esto, B3–B8 no cambian un peso.** Rellenar
`inscripciones.propietario_id` no dispara nada — no hay trigger, y el motor solo corre desde
este botón o desde oficializar/des-oficializar en `resultados.html`.

⚠️ **Congelar pagos mientras corre.** El motor no es transaccional: borra las líneas no
comprometidas y después inserta las nuevas. En esos segundos la deuda no existe. Si Valeria
está cobrando en el medio ve desaparecer líneas. No corrompe nada — confunde.

⚠️ **Si se corta a mitad** (red, sesión, VPS): la reunión queda **sub-liquidada, no
corrupta**. Lo pagado nunca se borra y el motor es idempotente. **La recuperación es volver a
apretar el mismo botón.** No hay que deshacer nada primero.

---

## B11 · Verificación post-recálculo (read-only) — **STOP obligatorio**

### B11.1 · La línea pagada quedó idéntica

Volver a correr **la query de B9.1** y comparar campo por campo contra la foto.

**Criterio: misma cantidad de filas, y para cada una — mismo `id`, mismo `monto_neto`, mismo
`estado_linea`, mismo `recibo_id`, mismo `numero_recibo`, mismo `beneficiario_id`.**

El `id` es la prueba dura: el motor **no regenera** la fila pagada, la deja intacta (mecanismo
en §Cambio 3). Si el `id` cambió, se borró y se recreó — eso **no debería poder pasar**.

**Si algo difiere → FRENAR Y AVISAR. No seguir pagando.** Ir al Rollback §C.

```sql
-- control agregado: el total pagado no se movió
SELECT count(*) AS lineas, COALESCE(sum(monto_neto),0) AS total
FROM liquidacion_detalle
WHERE reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' AND estado_linea = 'pagado';
```
**Criterio: 1 y $70.000,00** (o lo que haya dado B9.1).

```sql
-- el recibo no quedó huérfano
SELECT r.numero_recibo, r.neto_a_cobrar,
       (SELECT count(*) FROM liquidacion_detalle ld WHERE ld.recibo_id = r.id) AS lineas_vivas
FROM recibos r
WHERE r.id IN (SELECT recibo_id FROM liquidacion_detalle
               WHERE reunion_id='7b6e003e-22e2-4629-bf55-f18560b1260f' AND recibo_id IS NOT NULL);
```
**Criterio: `lineas_vivas` ≥ 1 en cada recibo.** Si da 0 → el recibo perdió su línea → Rollback §C.

### B11.2 · Nada se duplicó

```sql
SELECT beneficiario_tipo, beneficiario_id, concepto_tipo, inscripcion_id, posicion, concepto,
       count(*) AS veces
FROM liquidacion_detalle
WHERE reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
GROUP BY 1,2,3,4,5,6 HAVING count(*) > 1;
```
**Criterio: 0 filas.** Baseline medido el 18/08 antes de tocar nada: **0**. Si aparece algo,
lo produjo el recálculo.

### B11.3 · Conteo de propietario DESPUÉS — que el delta cierre

Volver a correr **la query de B9.3**.

**Criterio (derivado del estado del 18/08 — recalcular con los números que dé B9.3):**

| | antes | después esperado | derivación |
|---|---|---|---|
| líneas premio | 8 | **30** | 5 puestos × 6 carreras oficiales |
| líneas bono | 4 | **11** | puestos 6°–8° existentes en esas 6 carreras |
| **total propietario** | **12** | **41** | |
| **neto propietario** | **$2.362.438,33** | **≈ $8.948.411,64** | + $5.885.973,31 premio + $700.000 bono |

**Delta esperado: +29 líneas y +$6.585.973,31.**

> **Nota sobre el número.** Se habló de "~57 líneas" en la conversación. **Medido da 41**, no
> 57: 30 posiciones premiadas (5 × 6 carreras) + 11 puestos 6°–8°. El monto de $6.585.973,31
> sí es firme — sale de la relación propietario/profesional = 3,5 verificada en las 8
> posiciones que hoy sí tienen línea. **El criterio de halt es el MONTO, no el conteo.**

**Si el neto de propietario no subió ≈ $6.585.973,31 → FRENAR.** Diagnóstico probable: B7 no
dio 67/67/0, o el recálculo se cortó a mitad. Correr B7 de nuevo; si da 67/67/0, repetir B10.

```sql
-- total de la reunión, control grueso
SELECT count(*) AS liquidaciones, sum(total_neto) AS neto
FROM liquidaciones WHERE reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f';
```
Antes: 69 / $6.429.081,99. Después esperado: **≈ $13.015.055,30**.

### B11.4 · Las retenidas siguen retenidas — **STOP obligatorio**

*(bloque nuevo, revisión 18/08 — ver §Cambio 7)*

**Control por clave lógica, NO por `id`** (los `id` cambian, ver la nota de B9.4).

```sql
-- 1) las 4 de propietario fotografiadas en B9.4 siguen presentes y retenidas
WITH foto(beneficiario_id, inscripcion_id, posicion, monto) AS (VALUES
  ('710e65a0-d014-4813-bf3c-0866ae65d28b'::uuid, '7a48d4e6-cc17-4921-a8a5-866f378adb8a'::uuid, 1, 602000.00),
  ('5c46763e-e0d4-42e6-b0d7-8c0d7eac64aa'::uuid, 'd3ede44c-cad4-4c14-8350-20508dee9573'::uuid, 1, 644700.00),
  ('7972525b-8984-486f-923b-ffaa70e95688'::uuid, 'f6ab7903-69cd-402a-bc4a-9817545df01e'::uuid, 2, 133000.00),
  ('2ecd522f-0d58-4c72-b9d8-d54f0b3f209e'::uuid, '6bee22d1-f56b-4157-854e-34dee2fe074a'::uuid, 2, 148738.33)
)
SELECT f.beneficiario_id, f.posicion, f.monto AS monto_antes,
       ld.id AS id_nuevo, ld.estado_linea, ld.monto_neto AS monto_despues, ld.fecha_liberacion
FROM foto f
LEFT JOIN liquidacion_detalle ld
  ON ld.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
 AND ld.beneficiario_tipo = 'propietario'
 AND ld.beneficiario_id = f.beneficiario_id
 AND ld.inscripcion_id  = f.inscripcion_id
 AND ld.posicion        = f.posicion
 AND ld.concepto_tipo   = 'premio';
```

**Criterio, las 4 filas:**
- `id_nuevo` **NO NULL** — si es NULL, la línea desapareció → **FRENAR, Rollback §B**
- `estado_linea` = **`retenido`** — si volvió `impago` → **FRENAR, Rollback §B**
- `monto_despues` = `monto_antes`
- `fecha_liberacion` = **2026-09-15**
- `id_nuevo` **distinto** del `id` de B9.4 — es lo esperado, no un error

```sql
-- 2) ningún 1°/2° de premio quedó pagable
SELECT ld.posicion, ld.estado_linea, count(*)
FROM liquidacion_detalle ld
WHERE ld.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
  AND ld.concepto_tipo = 'premio' AND ld.posicion IN (1,2)
GROUP BY 1,2 ORDER BY 1,2;
```

**Criterio: 0 filas con `estado_linea = 'impago'` en posiciones 1 y 2.**
**Si aparece aunque sea una → FRENAR Y AVISAR. No pagar nada. Rollback §B.**

```sql
-- 3) el total de retenidas creció como corresponde
SELECT beneficiario_tipo, count(*) AS lineas, sum(monto_neto) AS neto,
       count(DISTINCT fecha_liberacion) AS fechas_distintas
FROM liquidacion_detalle
WHERE reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' AND estado_linea = 'retenido'
GROUP BY 1 ORDER BY 1;
```

| beneficiario | antes | después esperado | por qué |
|---|---|---|---|
| profesional | 24 | **24** | 6 carreras × 2 puestos × 2 profesionales — no cambia |
| **propietario** | **4** | **12** | 6 carreras × 2 puestos, ahora con dueño en todas |
| **total** | **28** | **36** | |

**`fechas_distintas` = 1 en cada grupo, valor 2026-09-15.**

**Si `propietario` no llegó a 12 → FRENAR.** Faltan dueños: correr B7 y revisar antes de pagar.

> **Por qué esto es un STOP y no un aviso.** Una línea de 1° o 2° que vuelva como `impago`
> aparece en el buscador de Pagos como cobrable. Valeria la paga de buena fe y el club entrega
> premio de un caballo con anti-doping pendiente, antes de los 30 días. **Es peor que no haber
> recalculado**: no hay forma de "des-pagar" un recibo emitido, y la retención existe
> justamente para el caso en que el análisis dé positivo.

### B11.5 · Alcance — qué sigue faltando

**R8 no queda completa con esta operación.** Las carreras **4ª y 8ª** siguen `provisional`
(bloqueadas por los dividendos de las combinadas, tema aparte). El recálculo liquida
**6 de 8 carreras**. Cuando esas dos se oficialicen, el motor vuelve a correr solo y agrega
lo suyo — sin repetir este runbook.

---

## Punto de no retorno

*(sección nueva, revisión 18/08 — ver §Cambio 5)*

| momento | ¿se puede volver atrás? | cómo |
|---|---|---|
| B2 snapshot | **sí** | `DROP TABLE bak_r8_propietario` |
| B3 provisorios | **sí** | DELETE directo — todavía no cuelga nada de ellos |
| B6 re-derivación | **sí** | restaurar desde `bak_r8_propietario` |
| **B10 recálculo** | **sí, pero en dos pasos** | restaurar snapshot **y volver a recalcular**. Sin ese segundo recálculo el `DELETE FROM propietarios` **aborta por FK**: los provisorios ya tienen header en `liquidaciones`. |
| **recibo emitido contra un provisorio** | 🔴 **NO** | ese propietario ya no se borra nunca. Se desactiva y queda. El día que aparezca el titular real hay que fusionar a mano. |

**El único punto sin retorno es la última fila.** Se cruza cuando alguien cobra contra una
línea generada para un propietario provisorio.

> **Regla operativa:** entre B10 y que B11 pase entero, **nadie emite recibos**. Es la única
> ventana donde una decisión se vuelve irreversible. Avisar a Valeria antes de apretar
> "Recalcular reunión" y avisarle de nuevo cuando B11 pase.

---

## Rollback

### §A · Rollback sin recálculo (se abortó antes de B10)

Plan §6, en este orden y no al revés:

1. `UPDATE inscripciones … FROM bak_r8_propietario` (devuelve las 67 al snapshot)
2. `DELETE FROM caballeriza_responsables … WHERE p.notas LIKE 'provisorio R8%'`
3. `DELETE FROM propietarios WHERE notas LIKE 'provisorio R8%'`

Antes de 2 y 3, chequear si alguno ya tiene recibo:

```sql
SELECT p.id, p.nombre,
       (SELECT count(*) FROM recibos r WHERE r.propietario_id = p.id)       AS recibos,
       (SELECT count(*) FROM liquidaciones l WHERE l.propietario_id = p.id) AS liquidaciones
FROM propietarios p WHERE p.notas LIKE 'provisorio R8%' ORDER BY 3 DESC, 4 DESC;
```

Si algún `recibos` o `liquidaciones` > 0 → **ese no se borra**: se desactiva
(`activo=false`, nota "reemplazado por titular real, no borrar: tiene recibo"). El `DELETE`
abortaría solo por FK — ninguna tiene `ON DELETE CASCADE`.

### §B · Rollback CON recálculo ya hecho (se pasó B10)

*(sección nueva, revisión 18/08 — ver §Cambio 6)*

Después de B10 los provisorios tienen filas en `liquidacion_detalle` y header en
`liquidaciones`. **El orden de §A no alcanza: el paso 3 aborta por FK.** Hay que vaciar
primero, y eso lo hace el propio motor.

1. **Verificar que no haya recibos nuevos.** Si alguien cobró contra un provisorio, ese
   pedazo **no vuelve atrás** (ver Punto de no retorno) — el resto sí:
   ```sql
   SELECT p.id, p.nombre, count(ld.id) AS lineas_comprometidas
   FROM propietarios p
   JOIN liquidacion_detalle ld ON ld.beneficiario_tipo='propietario' AND ld.beneficiario_id=p.id
   WHERE p.notas LIKE 'provisorio R8%'
     AND (ld.estado_linea='pagado' OR ld.recibo_id IS NOT NULL)
   GROUP BY p.id, p.nombre;
   ```
   **0 filas → rollback limpio. > 0 → parar y escalar**, no improvisar.

2. **Restaurar `propietario_id`** desde `bak_r8_propietario` (paso 1 de §A).

3. **Recalcular otra vez** — `liquidaciones.html` → R8 → "Recalcular reunión". Sin
   `propietario_id`, el motor no genera líneas de propietario provisorio; los headers quedan
   en 0 líneas y **se borran solos** (`liquidaciones-engine.js:366`).

4. **Recién ahora** correr los pasos 2 y 3 de §A (DELETE de `caballeriza_responsables` y de
   `propietarios`). Ya no hay FK que lo aborte.

5. **Verificar que la línea pagada sobrevivió al rollback**: correr B11.1. La línea de
   QUINTEROS tiene que seguir idéntica — el rollback tampoco la toca, por el mismo mecanismo
   que el recálculo.

**Estado esperado al final de §B:** 69 liquidaciones, $6.429.081,99, 12 líneas de propietario,
1 línea pagada de $70.000 — exactamente la foto del 18/08.

---

## Resumen del botón

| bloque | qué | escribe | criterio |
|---|---|---|---|
| B0 | guard | no | pwd + spcs 183 + ref |
| B1 | medir N | no | **ratificados 67** · `oficiales` = O (informativo) |
| B2 | snapshot | 🔴 DDL | 67 filas + CSV commiteado |
| B3 | insertar provisorios | 🔴 | N filas en ambas tablas |
| B4 | re-correr B3 | 🔴 | **0 filas** |
| B5 | duplicados | no | **0 filas — si no, FRENAR** |
| B6 | re-derivar | 🔴 | filas = `sin_prop` de B1 |
| B7 | verificar | no | **67 / 67 / 0** |
| B8 | controles | no | 0 cambios en las ya resueltas |
| B9 | foto de pagado + retenidas + conteo antes | no | **1 pagada · clave reproducible · 28 retenidas — STOP** |
| B10 | recalcular reunión | 🔴 pantalla | lo aprieta una persona en `liquidaciones.html` |
| B11 | verificar post-recálculo | no | **pagada idéntica por `id` · 0 duplicados · +$6.585.973,31 · 36 retenidas, ningún 1°/2° impago — STOP** |

B9–B11 solo aplican si `oficiales` > 0 en B1. Hoy (18/08) `oficiales` = 6 → **aplican**.

**Nada de esto se ejecuta hasta tu OK.**

---

## Cambios de la revisión 18/08

Contra la versión original (`5ae063e`). Escrito porque el escenario que el runbook daba por
imposible ya ocurrió: **6 carreras oficializadas y 1 pago emitido** antes de correr el
backfill.

### Cambio 1 · B1 — `oficiales = 0` deja de frenar

| | |
|---|---|
| **Protegía** | Una secuencia, no un dato. Garantizaba que no existiera ninguna liquidación, para no tener que razonar sobre el recálculo. |
| **Protege ahora** | Nada — pasa a informativo. **La condición se invierte:** si `oficiales` > 0, obliga a que B10 se haga, en vez de evitarlo. Terminar en B8 sin recalcular es hoy el estado peligroso. |
| **Si falla** | Se corre B3–B8 y se abandona sin B10. Base con `propietario_id` completo y liquidaciones viejas. **No se corrompe nada ni se pierde plata**; las líneas viejas siguen válidas y pagables. Se arregla corriendo B10 después. El daño es que Valeria paga una foto incompleta sin saber que falta un paso. |

### Cambio 2 · B9.2 — guard nuevo: clave reproducible

**Corrige una propuesta previa equivocada.** Se había propuesto frenar si alguna línea
comprometida colgaba de una inscripción con `propietario_id` NULL. **Ese guard era
incorrecto:** B6 solo rellena NULLs y nunca pisa un valor existente, así que **no puede
cambiar el `beneficiario_id` de ninguna línea ya generada**. Habría frenado casos inocuos
(p. ej. una línea pagada de jockey sobre un caballo sin dueño cargado) sin proteger de nada.

| | |
|---|---|
| **Protegía** (versión descartada) | Nada real. Falso positivo garantizado. |
| **Protege ahora** | Que el `lineKey` de cada línea comprometida sea **reproducible** por el motor. La clave incluye el `concepto`, que se arma con `numero_carrera_programa ?? numero_turno`. Si la carrera se renumeró después del pago, la clave no coincide y **el motor duplica la línea pagada**. |
| **Si falla** | `coincide` = false → frenar. Recalcular con la clave rota crearía una segunda línea del mismo premio: la vieja pagada + una nueva impaga. Valeria vería deuda que ya se pagó y podría pagarla dos veces. **Es el único modo de falla que produce doble pago.** |

### Cambio 3 · B9.1 + B11.1 — foto de lo comprometido y comparación

| | |
|---|---|
| **Protegía** | Nada — no existía. El runbook viejo no contemplaba que hubiera pagos. |
| **Protege ahora** | Que la línea pagada quede **bit a bit igual**. La prueba dura es el `id`: el motor **no la regenera**, la deja intacta. Si el `id` cambió, se borró y se recreó — no debería poder pasar. |
| **Si falla** | Se detecta después del recálculo, no antes. Por eso B11 es STOP: se frena el pago y se va al Rollback §B. La plata no se pierde (el recibo ya está emitido en papel), pero el sistema deja de reflejarlo y hay que reconstruir a mano. |

**Mecanismo concreto (por qué la línea pagada no se toca).** Tres candados independientes en
`liquidaciones-engine.js`:

1. **Se indexa como comprometida** (líneas 269-276): al cargar los headers, toda fila con
   `estado_linea='pagado'` o `recibo_id IS NOT NULL` entra en el set `paidKeys` y suma al
   contador `preserved`.
2. **El DELETE la excluye dos veces** (líneas 284-289):
   `.is('recibo_id', null).neq('estado_linea','pagado')` — la fila de QUINTEROS falla las dos
   condiciones, así que **nunca se borra**.
3. **El candidato nuevo se descarta** (línea 333):
   `freshRows = detalleRows.filter(d => !paidKeys.has(lineKey(d)))`. El motor **sí calcula** una
   línea nueva para ese puesto, pero al coincidir la clave la tira antes de insertarla.

**Respuesta directa: ni la saltea sin más, ni la regenera, ni la marca distinto — la fila
física sobrevive con su `id`, su `created_at`, su `recibo_id` y su `estado_linea='pagado'`
originales.** Lo que se descarta es la línea nueva que le habría hecho sombra. El header
también se reusa (línea 271, `headerByActor[aid] = h`), así que la liquidación de QUINTEROS
conserva su `id`.

Esto es independiente de las 28 retenidas: esas **sí** se borran y se regeneran (el DELETE solo
excluye lo pagado, no lo retenido). Se regeneran idénticas porque son exactamente los puestos
1° y 2° y no hay ninguna liberación manual — verificado el 18/08: 14 + 14, todas `retenido`,
ninguna liberada a mano. Si alguna hubiera sido liberada con `liberar_linea`, el recálculo la
volvería a retener y se perdería esa liberación.

### Cambio 4 · B9.3 + B11.3 — conteo de propietario antes/después

| | |
|---|---|
| **Protegía** | Nada — no existía. |
| **Protege ahora** | Que el backfill haya **producido** la plata que tenía que producir. Sin esto, un recálculo a medias pasa desapercibido: la pantalla muestra más líneas que antes y parece que funcionó. |
| **Si falla** | El delta no cierra → frenar. Causa probable: B7 no dio 67/67/0, o B10 se cortó. Ambas se arreglan repitiendo, sin rollback. |

**El criterio de halt es el MONTO** (+$6.585.973,31), no el conteo de líneas. El monto sale de
la relación propietario/profesional = 3,5 verificada en las 8 posiciones que hoy tienen línea;
el conteo esperado (41) es derivado y puede moverse si cambia algún resultado.

### Cambio 5 · Sección "Punto de no retorno"

| | |
|---|---|
| **Protegía** | Nada — no existía. El runbook viejo trataba todo como reversible. |
| **Protege ahora** | Marca explícitamente el único cruce irreversible: **un recibo emitido contra un propietario provisorio**. Y aclara que B10 sí es reversible, pero en dos pasos. |
| **Si falla** | Si se ignora y alguien cobra contra un provisorio durante la ventana: ese propietario queda para siempre, se desactiva en vez de borrarse, y aparece un titular ficticio con historial de pago. Se arregla fusionando a mano cuando aparezca el real. |

### Cambio 6 · Rollback §B — deshacer con recálculo ya hecho

| | |
|---|---|
| **Protegía** | El rollback viejo (§A) asumía que nada colgaba de los provisorios. Con B10 corrido, su paso 3 **aborta por FK**. |
| **Protege ahora** | Da el orden correcto: verificar recibos → restaurar snapshot → **recalcular otra vez** (los headers vacíos se borran solos, `engine:366`) → recién ahí los DELETE. |
| **Si falla** | Se intenta §A después de B10 y el DELETE aborta. **No rompe nada** — Postgres rechaza la sentencia entera. Queda el `propietario_id` restaurado y los provisorios vivos: estado inconsistente pero inocuo, que se sale corriendo §B completo. |

### Cambio 7 · B9.4 + B11.4 — retenidas por anti-doping

| | |
|---|---|
| **Protegía** | Nada — no existía. El runbook viejo ni mencionaba la retención anti-doping. |
| **Protege ahora** | Que las 28 retenidas de 1° y 2° sigan retenidas después del recálculo. A diferencia de la pagada, **éstas sí se borran y se regeneran**: el DELETE del motor excluye `pagado` y `recibo_id`, pero **no** `retenido`. Se recrean con `estado_linea` derivado de `concepto_tipo==='premio' && posicion IN (1,2)` (`engine:307`) y `fecha_liberacion` recomputada desde `reuniones.fecha + dias_antidoping` — determinista, mismo valor. |
| **Si falla** | Una línea de 1° o 2° vuelve como `impago` y aparece **cobrable** en el buscador de Pagos. Valeria la paga de buena fe y el club entrega premio de un caballo con anti-doping pendiente antes de los 30 días. **Peor que no haber recalculado**: un recibo emitido no se des-emite, y la retención existe justamente por si el análisis da positivo. Por eso es STOP con Rollback §B, no un aviso. |

**Detalle importante: el control NO puede ser por `id`.** Las retenidas se regeneran, así que
sus `id` cambian por diseño. Exigir "mismo `id`" habría sido un STOP falso garantizado en cada
corrida. B11.4 controla por **clave lógica** — `beneficiario_id` + `inscripcion_id` +
`posicion` + `concepto_tipo` — y usa el cambio de `id` como **evidencia de que fueron
reemplazadas y no mutadas**. Es la diferencia de fondo con B11.1, donde el `id` **sí** tiene
que ser el mismo porque esa fila nunca se toca.

**Segundo control, previo:** B9.4 también verifica que ningún 1°/2° esté ya en `impago`
**antes** del recálculo. Si alguien liberó una línea a mano con `liberar_linea`, el recálculo
la revierte a `retenido` y esa liberación se pierde en silencio. Verificado el 18/08: ninguna
liberada a mano (14 en 1° + 14 en 2°, todas `retenido`).

**Conteo esperado:** propietario 4 → **12**, profesional 24 → **24**, total 28 → **36**.

### Cambio 8 · B2 — el CSV del snapshot no se commitea (PII)

| | |
|---|---|
| **Protegía** | Nada. La versión original **creaba** el riesgo: mandaba commitear `docs/bak_r8_propietario_20260816.csv` con `commit + push`. |
| **Protege ahora** | El CSV va a `tmp/bak_r8_propietario_20260816.csv` y **no se commitea**. El repo es **público** (GitHub Pages sirve `main`) y el CSV mapea inscripciones a propietarios con nombre y apellido de personas reales. |
| **Si falla** | Se publica PII de ~67 personas en un repo público, indexable, con historial permanente. Borrarlo después **no alcanza**: queda en el historial de git y hay que reescribirlo con `filter-repo` y forzar el push. Es el único cambio de esta revisión cuyo daño **no se deshace apretando un botón**. |

**El respaldo real del rollback es la tabla `bak_r8_propietario`**, no el CSV. Si el CSV no se
genera, el rollback funciona igual. Es comodidad de lectura, nada más.

⚠️ **`tmp/` no estaba en `.gitignore`** y tiene archivos ya trackeados (`tmp/etapa_a_deploy.md`,
`tmp/preview_tapa.png`, entre otros). "Dejarlo en tmp/" **no era suficiente**: un `git add .`
lo habría subido igual. Se agregó regla explícita:

```
# Snapshots de propietarios (PII: nombres de personas) — nunca al repo
tmp/bak_r8_*.csv
```

Chequeo obligatorio antes de cualquier commit durante la operación:

```bash
git status --porcelain | grep -i "bak_r8\|propietario.*csv"   # debe salir vacío
```

**Pendiente aparte, fuera de este runbook:** `fix/dni-cuidadores` y `fix/dni-jockeys` tienen
el mismo problema de PII sin resolver.
