# B8 · Controles de que no se tocó nada fuera de R8

**READ-ONLY. 5 SELECT, cero escritura.** Re-corrido el 18/08 después de cerrar B11, con el
estado final de la base. Ventana de la operación: desde `2026-08-18 16:00:00+00` (el snapshot
B2 se creó 16:01:22) hasta ahora.

**Los cuatro controles pasan.**

---

## 1 · Inscripciones de otras reuniones — ninguna modificada

```sql
SELECT COALESCE(r.numero::text,'(sin reunión)') AS reunion, r.fecha,
       count(*) FILTER (WHERE i.updated_at >= '2026-08-18 16:00:00+00') AS tocadas_en_la_operacion,
       count(*) AS inscripciones
FROM inscripciones i
JOIN carreras c ON c.id = i.carrera_id
JOIN reuniones r ON r.id = c.reunion_id
GROUP BY r.numero, r.fecha
HAVING count(*) FILTER (WHERE i.updated_at >= '2026-08-18 16:00:00+00') > 0
ORDER BY r.fecha;
```

| reunión | fecha | tocadas | total |
|---|---|---|---|
| **8** | 2026-08-16 | **49** | 106 |

**Es la única fila que devuelve la query.** Ninguna otra reunión tiene una sola inscripción
modificada en la ventana. Y control directo, por si el `HAVING` escondiera algo:

```sql
SELECT count(*) FROM inscripciones i
JOIN carreras c ON c.id=i.carrera_id JOIN reuniones r ON r.id=c.reunion_id
WHERE r.numero <> 8 AND i.updated_at >= '2026-08-18 16:00:00+00';
```

```
0
```

Las 49 son exactamente las que actualizó B6. Dentro de la propia R8, **57 de las 106 no se
tocaron** (las no ratificadas y las 18 que ya tenían titular).

## 2 · Liquidaciones de R6 y anteriores — ninguna tocada

```sql
SELECT r.numero AS reunion, r.fecha, count(*) AS liquidaciones,
       count(*) FILTER (WHERE l.created_at >= '2026-08-18 16:00:00+00') AS creadas_en_la_operacion,
       (SELECT count(*) FROM liquidacion_detalle ld WHERE ld.reunion_id = r.id) AS lineas,
       (SELECT max(ld.xmin::text::bigint) FROM liquidacion_detalle ld WHERE ld.reunion_id = r.id) AS xmin_max_lineas
FROM liquidaciones l JOIN reuniones r ON r.id = l.reunion_id
GROUP BY r.id, r.numero, r.fecha ORDER BY r.fecha;
```

| reunión | fecha | liquidaciones | creadas en la operación | líneas | xmin máx de sus líneas |
|---|---|---|---|---|---|
| 6 | 2026-06-20 | 86 | **0** | 192 | **10949** |
| 8 | 2026-08-16 | 94 | 25 | 199 | 12576 |
| 9999 | 2099-01-01 | 10 | **0** | 76 | **5852** |

Dos evidencias independientes:

- **`created_at`**: 0 liquidaciones creadas en la ventana fuera de R8.
- **`xmin`** (id de transacción que escribió cada fila): la línea más nueva de R6 es la
  **10949** y la de la 9999 la **5852**. La primera escritura de esta operación fue la
  **12448** (snapshot B2). **Ninguna línea de R6 ni de la 9999 fue escrita por esta
  operación** — están más de mil quinientas transacciones atrás.

> **Límite de la prueba, dicho explícito:** `xmin` sólo habla de filas vivas; un DELETE puro
> no dejaría rastro ahí. Ese flanco se cerró aparte, por código: el motor lee sus headers con
> `.eq('reunion_id', rid).eq('club_id', clubId)` (`liquidaciones-engine.js:259-263`) y **todo
> lo que borra pasa por esa lista** — `.in('liquidacion_id', allHeaderIds)` (283-290) y el
> `delete().eq('id', hid)` de la 367, con `hid ∈ existingLiqs`. Con `rid` = R8, el DELETE no
> puede alcanzar una línea de otra reunión. Detalle completo en
> `docs/COTEJO_R6_REMEDICION.md` §3.

R6 quedó como estaba desde el **15/08 01:51**, por la des-oficialización de su carrera 3, que
no tiene nada que ver con esta operación (ver `docs/R6_CARRERA_3_PENDIENTE.md`).

## 3 · Los 213 propietarios preexistentes de Dolores — intactos

```sql
SELECT count(*) AS propietarios_dolores,
       count(*) FILTER (WHERE notas LIKE 'provisorio R8%') AS provisorios_nuevos,
       count(*) FILTER (WHERE notas IS NULL OR notas NOT LIKE 'provisorio R8%') AS preexistentes,
       count(*) FILTER (WHERE (notas IS NULL OR notas NOT LIKE 'provisorio R8%')
                          AND updated_at >= '2026-08-18 16:00:00+00') AS preexistentes_modificados,
       count(*) FILTER (WHERE (notas IS NULL OR notas NOT LIKE 'provisorio R8%')
                          AND created_at >= '2026-08-18 16:00:00+00') AS preexistentes_creados,
       max(xmin::text::bigint) FILTER (WHERE notas IS NULL
                          OR notas NOT LIKE 'provisorio R8%') AS xmin_max_preexistentes
FROM propietarios WHERE club_id='0649e9c5-9e87-4aad-842f-101458e6b33c';
```

```
propietarios_dolores      = 253
provisorios_nuevos        =  40
preexistentes             = 213   ← intactos
preexistentes_modificados =   0
preexistentes_creados     =   0
xmin_max_preexistentes    = 4485  ← contra 12448 de la primera escritura de la operación
```

**253 = 213 + 40.** Los 40 son **adicionales, no reemplazos**: ninguno de los 213 fue
modificado ni creado en la ventana, y su transacción de escritura más reciente (4485) es muy
anterior a todo lo de hoy.

*(El "220" que se midió antes de B3 era el total de la tabla **incluyendo otros clubes**; los
de Dolores eran 213. Dos recortes distintos, no una discrepancia.)*

## 4 · `club_secuencias` — sin moverse

```sql
SELECT cs.club_id, cs.tipo, cs.ultimo_numero, cs.xmin::text::bigint AS xmin,
       (SELECT count(*) FROM recibos r WHERE r.club_id=cs.club_id) AS recibos,
       (SELECT max(r.created_at) FROM recibos r WHERE r.club_id=cs.club_id) AS ultimo_recibo
FROM club_secuencias cs WHERE cs.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c';
```

| tipo | ultimo_numero | xmin | recibos | último recibo |
|---|---|---|---|---|
| recibo | **1** | 11198 | 3 | 2026-08-16 18:46:44 |

Sigue en **1**, el recibo de QUINTEROS. Su `xmin` (11198) es anterior a la operación (12448):
**la fila no se reescribió**. Ningún recibo nuevo — el último es del 16/08, dos días antes.
El recálculo no emite recibos ni toca el contador.

## 5 · Los tres controles del runbook

```sql
SELECT
 (SELECT count(*) FROM bak_r8_propietario b JOIN inscripciones i ON i.id=b.inscripcion_id
   WHERE b.propietario_id IS NOT NULL
     AND b.propietario_id IS DISTINCT FROM i.propietario_id)        AS cambiaron_de_dueno,
 (SELECT count(*) FROM spcs)                                        AS spcs,
 (SELECT count(*) FROM propietarios WHERE notas LIKE 'provisorio R8%') AS provisorios,
 (SELECT count(*) FROM inscripciones i JOIN carreras c ON c.id=i.carrera_id
   WHERE c.reunion_id='a0000000-0000-0000-0000-000000009999')       AS insc_9999;
```

```
cambiaron_de_dueno = 0     ← CRITERIO: 0. CUMPLE. Ninguna de las 18 ya resueltas cambió.
spcs               = 183   ← CUMPLE, igual que en el guard B0
provisorios        = 40    ← CUMPLE, = N
insc_9999          = 17    ← CUMPLE, la reunión de prueba sin cambios
```

---

## Resumen

| control | criterio | medido | |
|---|---|---|---|
| Inscripciones de otras reuniones | 0 | **0** | ✅ |
| Liquidaciones de R6 y anteriores | 0 creadas / 0 escritas | **0 / 0** | ✅ |
| 213 preexistentes de Dolores | intactos, 40 adicionales | **213 + 40 = 253**, 0 modificados | ✅ |
| `club_secuencias` | sin cambios | **`ultimo_numero` = 1**, fila sin reescribir | ✅ |
| *(runbook)* dueño cambiado | 0 | **0** | ✅ |
| *(runbook)* `spcs` | 183 | **183** | ✅ |
| *(runbook)* provisorios | 40 | **40** | ✅ |
| *(runbook)* `insc_9999` | 17 | **17** | ✅ |

**La operación no tocó nada fuera de R8.** Con esto B8 queda cerrado y la secuencia completa
—B0 a B11— verificada sin un solo criterio incumplido.
