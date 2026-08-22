# Plan — Re-derivación de `propietario_id` sobre R8

**Estado: PROPUESTA. Nada ejecutado.** Es **escritura sobre R8**, la reunión real
del domingo 16/08. Ejecución sólo con OK explícito y **sólo cuando la carga de los
40 responsables esté terminada**.

- Proyecto: `unlhcuanfrtpatoipwve` (Dolores prod) · club `0649e9c5-9e87-4aad-842f-101458e6b33c`
- R8 = `7b6e003e-22e2-4629-bf55-f18560b1260f`
- Guard verificado al escribir este plan: `pwd = /home/clio/dev/SGH`, `spcs` = **183**.
- Contexto del problema: `docs/PLAN_REUNION_PRUEBA_9998.md` §9. Lista de trabajo:
  `docs/r8_caballerizas_sin_propietario.csv`.

### Estado medido de R8 al 13/08 (read-only)

| | |
|---|---|
| ratificados | 67 |
| con `propietario_id` | 18 |
| sin `propietario_id` | 49 |
| **resultados cargados** | **0** |
| **resultados oficiales** | **0** |
| **liquidaciones (headers / líneas)** | **0 / 0** |
| líneas pagadas o con recibo | 0 |

**La ventana está limpia.** Ver §6: correr esto antes de oficializar cualquier
carrera evita por completo el problema de recálculo.

---

## 1. El UPDATE

### 1.1 Sobre el trigger y el no-op

Definición real, leída de `pg_get_triggerdef`:

```sql
CREATE TRIGGER trg_insc_set_propietario
  BEFORE INSERT OR UPDATE OF caballeriza_id
  ON public.inscripciones
  FOR EACH ROW EXECUTE FUNCTION fn_inscripcion_set_propietario()
```

**Confirmado: es `BEFORE INSERT OR UPDATE OF caballeriza_id`.**

Sobre si `SET caballeriza_id = caballeriza_id` lo dispara: **sí**. En PostgreSQL,
`UPDATE OF <columna>` se evalúa de forma **sintáctica**, no por valor — el trigger
dispara si la columna aparece como destino en el `SET`, aunque el valor nuevo sea
idéntico al viejo. No hay comparación de valores de por medio.

**Salvedad honesta:** esto lo afirmo por la semántica documentada de Postgres, no
porque lo haya probado empíricamente contra esta base — probarlo implica escribir,
y este plan es read-only. Si querés la prueba antes de tocar R8, el paso 0 de §7
la hace sobre una tabla descartable, sin rozar `inscripciones`.

### 1.2 Pero el no-op NO es lo que propongo

Recomiendo **no usar el trigger**. Dos problemas:

1. **Toca las 67 filas, incluidas las 18 ya resueltas** (ver §2).
2. La función tiene un `SELECT … LIMIT 1` **sin `ORDER BY`**:

```sql
SELECT cr.propietario_id INTO NEW.propietario_id FROM caballeriza_responsables cr
WHERE cr.caballeriza_id = NEW.caballeriza_id AND cr.rol='propietario' AND cr.activo=true LIMIT 1;
```

Si una caballeriza terminara con **dos** responsables propietario activos, cuál
gana es **no determinístico**. Hoy no pasa (medido: 0 caballerizas de R8 con más
de una fila activa), pero Yesi va a editar 40 caballerizas y un duplicado es un
error de carga perfectamente posible.

### 1.3 Plan A — UPDATE explícito, acotado a las que están en NULL (recomendado)

```sql
-- Sólo ratificados de R8 que HOY están en NULL. Las 18 resueltas quedan fuera
-- por construcción: la condición i.propietario_id IS NULL las excluye.
UPDATE inscripciones i
SET propietario_id = sub.propietario_id
FROM (
  SELECT DISTINCT ON (cr.caballeriza_id)
         cr.caballeriza_id, cr.propietario_id
  FROM caballeriza_responsables cr
  WHERE cr.rol = 'propietario' AND cr.activo = true AND cr.propietario_id IS NOT NULL
  ORDER BY cr.caballeriza_id, cr.created_at NULLS LAST, cr.id   -- desempate determinístico
) sub
WHERE sub.caballeriza_id = i.caballeriza_id
  AND i.propietario_id IS NULL
  AND i.estado = 'ratificado'
  AND i.carrera_id IN (
    SELECT id FROM carreras WHERE reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
  );
```

Propiedades:

- **No dispara `trg_insc_set_propietario`** — no menciona `caballeriza_id` en el `SET`.
- **Es imposible que toque las 18**: `i.propietario_id IS NULL` las excluye.
- **Determinístico** ante duplicados: `DISTINCT ON` + `ORDER BY` explícito, en vez
  del `LIMIT 1` suelto de la función.
- Acotado a `estado='ratificado'` y a las carreras de R8. No toca R6, ni la 9999,
  ni forfaits, ni mal_inscritos, ni ninguna otra reunión.
- Idempotente: correrlo dos veces no cambia nada la segunda vez (ya no hay NULLs
  que matcheen).

*(Verificar que `caballeriza_responsables` tenga `created_at` antes de ejecutar; si
no existe, usar sólo `cr.id` como desempate.)*

### 1.4 Plan B — el no-op del trigger (sólo si por algún motivo se descarta el A)

```sql
UPDATE inscripciones i SET caballeriza_id = i.caballeriza_id
WHERE i.estado = 'ratificado'
  AND i.carrera_id IN (SELECT id FROM carreras
                       WHERE reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f');
```

Dispara el trigger en las 67. **Hereda los dos riesgos de §1.2.** Si se usa, la
verificación de §4 (diff de las 18) deja de ser una formalidad y pasa a ser
obligatoria.

### 1.5 Si ninguno de los dos alcanzara

Alternativa de último recurso, fila por fila y con el valor escrito a mano desde
el CSV que complete Yesi:

```sql
UPDATE inscripciones SET propietario_id = '<uuid>' WHERE id = '<inscripcion_id>';
```

Sirve para casos sueltos donde la caballeriza sea ambigua o el dueño del caballo
no coincida con el de la caballeriza. No dispara el trigger.

### 1.6 Efectos laterales de cualquiera de los dos

- `trg_inscripciones_updated_at` (BEFORE UPDATE) → `updated_at = now()` en las
  filas tocadas. Esperado y sin consecuencias.
- `trg_audit_inscripciones` (AFTER UPDATE) → una fila en `auditoria` por
  inscripción tocada. Con el Plan A son ~49; con el Plan B, 67. Es el registro de
  la operación: **no borrarlo**.
- RLS está activo en `inscripciones` y en `caballeriza_responsables`. Por MCP se
  ejecuta con rol privilegiado y no aplica; si en cambio se corriera desde el
  frontend, las policies mandan.

---

## 2. Qué pasa con las 18 que ya están resueltas

**Con el Plan A: nada. No las toca.** El `WHERE i.propietario_id IS NULL` las deja
afuera por construcción, no por suerte.

**Con el Plan B: sí las pisa.** El trigger corre `FOR EACH ROW` sobre las 67 y
**reescribe `NEW.propietario_id` en todas**, incluidas las que ya tenían valor. El
riesgo que planteás es real:

> si la caballeriza tiene ahora un responsable distinto, la inscripción cambia de
> propietario silenciosamente.

Y hay un caso peor que el cambio: si alguien, cargando los 40, **desactiva** por
error el responsable de una caballeriza que hoy sí lo tiene, el `SELECT … INTO`
no encuentra fila, `NEW.propietario_id` queda **NULL**, y una de las 18 que
funcionaba pasa a estar rota. El Plan B puede **restar** propietarios, no sólo
sumarlos.

Estado medido hoy (13/08), antes de que Yesi toque nada:

| chequeo | resultado |
|---|---|
| de las 18, cuántas tienen `propietario_id` ≠ al derivable de su caballeriza | **0** |
| de las 18, cuántas tienen derivable NULL | **0** |
| caballerizas de R8 con más de un responsable propietario activo | **0** |

O sea: **hoy** el Plan B sería inocuo. Pero el punto es justamente que se va a
ejecutar *después* de 40 ediciones manuales, y estos tres números pueden dejar de
ser cero en el medio. Por eso el Plan A.

---

## 3. Verificación PREVIA (correr antes del UPDATE)

### 3.1 Cuántas quedarían resueltas

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

**Criterio de avance: `quedarian_resueltas` = 67 y `seguirian_en_null` = 0.**
Si no da 67, **no correr el UPDATE todavía** — o correrlo sabiendo cuáles quedan
afuera, con la lista de §3.2 en la mano.

### 3.2 Las que faltarían, con su caballeriza (para volver a pedirle el dato a Yesi)

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
  AND i.estado = 'ratificado'
  AND i.propietario_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM caballeriza_responsables cr
                  WHERE cr.caballeriza_id = i.caballeriza_id AND cr.rol='propietario'
                    AND cr.activo = true AND cr.propietario_id IS NOT NULL)
ORDER BY c.numero_carrera_programa, s.nombre;
```

Devuelve el diagnóstico por fila, así el pedido a Yesi es específico ("a LA PICHI
le cargaste el responsable pero quedó inactivo") en vez de "faltan datos".

### 3.3 Chequeo de duplicados (nuevo — importante después de 40 ediciones)

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

**Esperado: 0 filas.** Si aparece alguna, corregir la carga antes de seguir: el
Plan A elegiría una de forma determinística pero **arbitraria**, y puede no ser la
correcta.

---

## 4. Verificación POSTERIOR

### 4.1 Conteo

```sql
SELECT count(*) AS ratificados,
       count(i.propietario_id) AS con_propietario,
       count(*) FILTER (WHERE i.propietario_id IS NULL) AS sin_propietario
FROM inscripciones i JOIN carreras c ON c.id = i.carrera_id
WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' AND i.estado = 'ratificado';
```

**Esperado: 67 / 67 / 0.**

### 4.2 Diff contra el snapshot — que ninguna de las 18 haya cambiado

```sql
SELECT b.inscripcion_id, s.nombre AS ejemplar,
       b.propietario_id AS antes, i.propietario_id AS despues
FROM bak_r8_propietario b
JOIN inscripciones i ON i.id = b.inscripcion_id
JOIN spcs s ON s.id = i.spc_id
WHERE b.propietario_id IS NOT NULL
  AND b.propietario_id IS DISTINCT FROM i.propietario_id;
```

**Esperado: 0 filas.** Cualquier fila acá es exactamente el escenario que querías
evitar — una inscripción que ya estaba bien y cambió de dueño. Si aparece, aplicar
el rollback de §5 y revisar la carga.

### 4.3 Diff completo (qué se agregó)

```sql
SELECT c.numero_carrera_programa AS carrera, s.nombre AS ejemplar,
       p.nombre AS propietario_asignado
FROM bak_r8_propietario b
JOIN inscripciones i ON i.id = b.inscripcion_id
JOIN carreras c ON c.id = i.carrera_id
JOIN spcs s ON s.id = i.spc_id
LEFT JOIN propietarios p ON p.id = i.propietario_id
WHERE b.propietario_id IS NULL AND i.propietario_id IS NOT NULL
ORDER BY c.numero_carrera_programa, s.nombre;
```

**Esperado: 49 filas.** Es la lista para revisar de ojo contra el CSV que completó
Yesi, antes de dar por buena la operación.

### 4.4 Que no se haya tocado nada fuera de R8

```sql
SELECT (SELECT count(*) FROM inscripciones i JOIN carreras c ON c.id=i.carrera_id
        WHERE c.reunion_id='b02ca761-6f44-4720-86aa-a3c3099019ea' AND i.propietario_id IS NOT NULL) AS r6_con_prop,
       (SELECT count(*) FROM inscripciones i JOIN carreras c ON c.id=i.carrera_id
        WHERE c.reunion_id='a0000000-0000-0000-0000-000000009999') AS insc_9999,
       (SELECT count(*) FROM spcs) AS spcs;
```

**Esperado: 21 / 17 / 183.** *(el 21 de R6 es sobre las 11 carreras completas —
anotar el valor exacto en el snapshot previo y comparar contra ése.)*

---

## 5. Rollback

### 5.1 Snapshot ANTES de tocar nada (paso obligatorio)

```sql
CREATE TABLE bak_r8_propietario AS
SELECT i.id AS inscripcion_id, i.carrera_id, i.spc_id, i.caballeriza_id,
       i.propietario_id, now() AS snapshot_at
FROM inscripciones i JOIN carreras c ON c.id = i.carrera_id
WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' AND i.estado = 'ratificado';

SELECT count(*) FROM bak_r8_propietario;   -- Esperado: 67
```

Es un `CREATE TABLE` — DDL, va por `apply_migration`, y es la **primera** escritura
de la operación. Nada más se ejecuta hasta que este SELECT devuelva 67.

**Copia fuera de la base**, además, por si hay que restaurar con la base en un
estado raro:

```sql
SELECT i.id, s.nombre, i.propietario_id
FROM inscripciones i JOIN carreras c ON c.id=i.carrera_id JOIN spcs s ON s.id=i.spc_id
WHERE c.reunion_id='7b6e003e-22e2-4629-bf55-f18560b1260f' AND i.estado='ratificado'
ORDER BY s.nombre;
```

→ guardar el resultado como `docs/bak_r8_propietario_<fecha>.csv` en el branch,
commiteado antes del UPDATE.

### 5.2 Restaurar

```sql
UPDATE inscripciones i
SET propietario_id = b.propietario_id
FROM bak_r8_propietario b
WHERE b.inscripcion_id = i.id
  AND i.propietario_id IS DISTINCT FROM b.propietario_id;
```

Devuelve las 67 al estado exacto del snapshot, incluidos los NULL. No dispara el
trigger (no menciona `caballeriza_id`). Verificar después con §4.1: debe volver a
dar 18 con propietario.

⚠️ Si el rollback se corre **después** de haber regenerado liquidaciones, hay que
volver a regenerarlas (§6) — si no, quedan líneas de propietarios que ya no
corresponden.

### 5.3 Limpieza del snapshot

Dejar `bak_r8_propietario` hasta que R8 esté liquidada, cobrada y cerrada. Recién
ahí:

```sql
DROP TABLE bak_r8_propietario;
```

---

## 6. Si R8 ya tuviera resultados oficializados

### 6.1 Hoy no los tiene — y ésa es la respuesta corta

Medido al 13/08: **0 resultados, 0 oficiales, 0 liquidaciones, 0 líneas
comprometidas.**

**Recomendación fuerte: correr esta re-derivación ANTES de oficializar cualquier
carrera de R8.** Si se hace en esa ventana, no hay nada que regenerar: cuando
`resultados.html` oficialice, el motor ya va a leer los `propietario_id` completos
y va a emitir las líneas del 70 % de entrada. Cero recálculo, cero riesgo.

Es también el orden más barato operativamente: es un UPDATE y dos SELECT, contra
un recálculo de reunión entera.

### 6.2 Si igual llegara a correrse después de oficializar

Hay que regenerar, porque las liquidaciones ya emitidas **no tienen** las líneas
de propietario y no aparecen solas. Cómo:

- **`liquidaciones.html` → botón "Recalcular reunión"**, que llama a
  `generarLiquidacionesReunion()` de `liquidaciones-engine.js`. Es la vía normal.
- El motor es **paid-safe e idempotente**: preserva las líneas con
  `estado_linea='pagado'` o `recibo_id IS NOT NULL` y sus headers, borra el resto y
  lo recalcula desde los resultados oficiales. No duplica: las líneas preservadas
  se saltean por `lineKey()`.
- Las líneas de propietario que faltaban **no existían**, así que no colisionan con
  ninguna clave preservada: se agregan como nuevas, con
  `estado_linea='retenido'` para los puestos 1° y 2° (retención anti-doping) e
  `'impago'` para el resto.

**El riesgo no es técnico, es de orden de los hechos.** Si Yesi ya le pagó a
entrenadores y jockeys de una carrera y recién después aparecen los propietarios,
hay que abrir una segunda vuelta de pagos con la gente ya en la ventanilla. Nada
se rompe ni se paga dos veces — el motor no toca lo pagado — pero es un papelón
evitable.

### 6.3 Regla operativa

> **Orden obligatorio: (1) cargar los 40 responsables → (2) verificación previa
> §3 → (3) snapshot §5.1 → (4) UPDATE §1.3 → (5) verificación §4 → (6) recién
> ahí oficializar carreras.**

Si el domingo llega con la carga incompleta, es preferible oficializar y liquidar
con los propietarios que haya, y completar después con recálculo, antes que frenar
el pago del día. Pero eso es decisión de Fede y Valeria, no técnica.

---

## 7. SECUENCIA OBLIGADA

> ### 1) Yesi y Fede cargan los responsables de las 40 caballerizas
> ### 2) Se corre la re-derivación sobre R8
> ### 3) Se verifica que las 67 tengan `propietario_id`
> ### 4) RECIÉN AHÍ se oficializa la primera carrera del domingo
>
> **El orden no es una preferencia: es una guarda.**

### Por qué, en una frase

Oficializar dispara la generación de liquidaciones (`oficializar()` en
`resultados.html` llama a `generarLiquidacionesReunion()` al terminar). Si en ese
momento faltan `propietario_id`, las líneas del 70 % **no se emiten**, y aparecen
recién cuando se recalcule después de cargar los datos.

Recalcular **es seguro técnicamente**: el motor es paid-safe e idempotente,
preserva lo pagado y no duplica nada. El problema no es la base, es el mostrador:
**implica pagar en dos vueltas, con la gente ya en la ventanilla.** Yesi le paga al
entrenador y al jockey, y el propietario del mismo caballo tiene que volver más
tarde — o quedarse esperando a que se recalcule — por un dato que se podía haber
cargado el jueves.

### El costo de cada orden

| orden | qué pasa |
|---|---|
| **carga → re-derivación → verificación → oficializar** | Las liquidaciones nacen completas. Cero recálculo, cero segunda vuelta. |
| oficializar → carga → re-derivación → recalcular | Funciona, no se rompe ni se paga dos veces, pero hay una segunda tanda de pagos el mismo día. |
| oficializar → pagar → carga → recalcular | Lo pagado se preserva, pero los propietarios de esas carreras cobran en otro momento. Es el peor escenario operativo, y es evitable. |

### Si el domingo llega con la carga incompleta

Preferible oficializar y liquidar con los propietarios que haya, y completar
después con recálculo, antes que frenar el pago del día. Pero eso es decisión de
Fede y Valeria, no técnica — y conviene tomarla **antes** del domingo, no a las
tres de la tarde con la gente esperando.

### Detalle de ejecución del paso 2

| # | paso | tipo | criterio de avance |
|---|---|---|---|
| 0 | *(opcional)* probar empíricamente que el no-op dispara el trigger, sobre una tabla descartable — **no sobre `inscripciones`** | escritura aislada | sólo si se elige el Plan B |
| 1 | Guard: `pwd` + `SELECT count(*) FROM spcs` = 183 + ref correcta | read-only | los tres OK |
| 2 | Verificación previa §3.1 | read-only | `quedarian_resueltas` = 67 |
| 3 | Verificación previa §3.3 (duplicados) | read-only | 0 filas |
| 4 | Si §3.1 < 67: sacar lista §3.2 y **frenar** | read-only | volver a Yesi |
| 5 | Snapshot §5.1 (tabla + CSV al branch) | **DDL** | `count` = 67 y CSV commiteado |
| 6 | UPDATE §1.3 (Plan A) | **escritura R8** | filas afectadas = 49 |
| 7 | Verificación §4.1 | read-only | 67 / 67 / 0 |
| 8 | Verificación §4.2 (diff de las 18) | read-only | **0 filas** |
| 9 | Verificación §4.3 (las 49 agregadas) | read-only | 49 filas, revisadas contra el CSV |
| 10 | Verificación §4.4 (nada fuera de R8) | read-only | valores esperados |
| 11 | Recién ahora: oficializar carreras | — | — |

Si el paso 8 devuelve algo, rollback §5.2 inmediato y revisión de la carga.

---

## 8. Diagnóstico — guarda de aviso al oficializar (viable, no codeada)

**Pedido:** que el sistema **avise, sin bloquear**, si se va a oficializar una
carrera que todavía tiene ratificados sin `propietario_id`.

**Veredicto: viable, barato y sin consultas nuevas a la base.** Es un `if` con un
`filter` sobre datos que ya están en memoria. No lo codeo — esto es sólo el
diagnóstico de dónde iría y qué mostraría.

### Dónde va

`resultados.html`, función `oficializar(carreraId)` — **línea 1507**, justo
**antes** del `confirm()` de la línea 1508:

```js
async function oficializar(carreraId) {
  if (!confirm('¿Hacer oficial el resultado y generar su liquidación?\n…')) return;   // ← 1508
  await aplicar(carreraId, 'oficial');
```

El aviso tiene que ir **antes** de ese `confirm`, porque después ya se marcó
oficial y se generaron las liquidaciones incompletas (línea 1535).

### Por qué no cuesta nada

Las inscripciones ya están cargadas en memoria con **todas** las columnas —
línea 500:

```js
sb.from('inscripciones').select('*').in('carrera_id', carIds),
```

`select('*')` incluye `propietario_id`. Y la función ya filtra por carrera en la
línea 1514 (`inscripciones.filter(i=>i.carrera_id===carreraId)`). O sea: el chequeo
es un `filter` sobre un array que ya existe. **Cero queries, cero latencia.**

### Qué mostraría

Dos alternativas, ambas no bloqueantes:

**(a) Fundir el aviso en el `confirm()` existente** — un solo diálogo, el operador
lee y decide. No agrega un click. Aceptar sigue oficializando igual.

```
⚠️ 7 de 10 caballos de esta carrera no tienen propietario cargado.
Si oficializás ahora, la liquidación NO va a incluir el 70% del propietario
de esos caballos. Se puede corregir después cargando los responsables y
usando "Recalcular reunión", pero implica pagar en dos vueltas.

¿Hacer oficial igual?
```

**(b) Un `toast` de advertencia previo + el `confirm` normal.** Más visible, pero
el toast se puede pasar por alto justo cuando importa. La (a) es preferible: el
aviso está en el mismo lugar donde se toma la decisión.

### Alcance del chequeo

Conviene contar **dos cosas distintas**:

- los ratificados **de esa carrera** sin `propietario_id` → es lo que afecta la
  liquidación que se está por generar;
- los ratificados **de toda la reunión** sin `propietario_id` → contexto útil,
  porque `oficializar()` recalcula la reunión entera, no sólo la carrera.

Un texto del tipo *"7 en esta carrera · 49 en toda la reunión"* le da a Fede la
foto completa sin obligarlo a ir a buscarla.

### Qué NO debería hacer

- **No bloquear.** Si el domingo se decide liquidar incompleto, tiene que poder
  hacerse. Un guard duro acá convierte un problema de datos en un problema de
  operación en vivo.
- **No repetir el aviso** si ya se aceptó para esa carrera en la misma sesión —
  ruido innecesario al des-oficializar y volver a oficializar.
- **No mostrarlo cuando el conteo es 0.** Si está todo cargado, el flujo tiene que
  quedar exactamente como está hoy.

### Costo estimado

Unas 10-15 líneas dentro de `oficializar()`, sin tocar el motor de liquidación, sin
schema, sin migración, sin consultas nuevas. Se puede hacer y desplegar el mismo
día (GitHub Pages, ~1 minuto de deploy). El único riesgo es el de siempre en
`resultados.html`: las variables de módulo (`inscripciones`, `carreras`) son `let`
y no están en `window.*`, así que un probe de regresión tendría que apoyarse en
evidencia DOM, no en estado interno — igual que el resto de los probes de
`tests/`.

**Recomendación:** hacerlo. Es el único mecanismo que le avisa a Valeria en el
momento exacto en que la pérdida se vuelve difícil de revertir, y a diferencia de
todo lo demás de este plan, sirve para todas las reuniones futuras, no sólo para
R8. Pero es una decisión aparte: **no está incluido en la aprobación de esta
re-derivación** y no lo escribí.

---

## 9. Lo que este plan NO hace

- No toca R6, la 9999, ni ninguna otra reunión.
- No toca `caballerizas` ni `caballeriza_responsables` — esa carga la hacen Yesi y
  Fede por `caballerizas.html`, que es la vía correcta y auditada.
- No toca `club_secuencias`, `recibos`, `liquidaciones` ni `liquidacion_detalle`.
- No modifica el trigger ni la función `fn_inscripcion_set_propietario`. El
  `LIMIT 1` sin `ORDER BY` de §1.2 queda anotado como deuda técnica a corregir en
  frío, después del domingo — no ahora.
- No inventa propietarios: si el dato no está cargado, la inscripción queda en NULL
  y aparece en la lista de §3.2.

**Nada de esto se ejecuta hasta tu OK explícito, y sólo con la carga de
responsables terminada.**
