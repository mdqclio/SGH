# Censo de inscripciones R9 — daño del gate de edad

| | |
|---|---|
| **Fecha** | 2026-08-27 |
| **SHA del commit** | `7398c12` |
| **Branch** | `reports` |
| **Diagnóstico de origen** | `docs/diagnosticos/2026-08-27_edad-gate-inscripcion.md` (SHA `7de5461`) |
| **Tipo** | Censo de datos. **Read-only**: sólo `SELECT` por MCP y `grep`/`sed` sobre el repo. Cero DDL, cero DML, cero cambios de código. |

### Guards verificados

```
pwd                          → /home/clio/dev/SGH          ✅
SELECT count(*) FROM spcs    → 181  (baseline 2026-08-23)  ✅
ref del proyecto             → unlhcuanfrtpatoipwve        ✅
```

---

## Números de resumen

| # | pregunta | respuesta |
|---|---|---|
| **1** | Inscripciones en violación (existen y no deberían) | **0** |
| **2** | SPC rechazados de más, por turno | **13 a 29 según el turno** — 13 en el único abierto (turno 1). Tabla completa en §4. |
| **3** | ¿R8 está limpia? | **SÍ, limpia.** Los 12 turnos tienen `edad_minima_anos` y `edad_maxima_anos` en NULL, así que el `IF ... IS NOT NULL` del gate nunca entró. Además sus 106 inscripciones son `canal='manual'`, 0 por portal: ni siquiera pasaron por `rpc_inscribir`. |
| **4** | ¿Otra reunión con edades cargadas, abierta o por abrir? | **No. R9 es la única.** Las otras dos con edades cargadas ya pasaron y están fuera de juego: R7 `cancelada`, R6 `borrador`. Detalle en §5. |

**Conclusión: no hay nada que reparar en `inscripciones`.** El fix de `validar_inscripcion` no
necesita backfill ni corrección de datos. Lo que sí corre reloj es la ventana abierta del
turno 1 (§4).

---

## 1. Contexto

`validar_inscripcion` calcula la edad con `DATE_PART('year', AGE(reunion.fecha, spc.fecha_nacimiento))`
— aniversario real — en vez de la regla del 1° de julio del Reglamento General de Carreras.
Todo SPC nacido entre julio y diciembre queda contado un año menos. R9 es la primera reunión
con `edad_minima_anos` / `edad_maxima_anos` cargadas, así que es la primera donde el gate
efectivamente decide por edad.

---

## 2. Censo de R9 — 1 inscripción, correcta

### Query

```sql
WITH r9 AS (SELECT id, fecha FROM reuniones WHERE numero = 9)
SELECT i.id::text AS insc_id, i.estado::text, i.canal, i.created_at::text,
       u.nombre_completo AS anoto,
       c.numero_turno, c.edad_minima_anos AS emin, c.edad_maxima_anos AS emax,
       left(c.condicion_handicap,50) AS condicion,
       s.nombre AS spc, s.fecha_nacimiento::text, s.sexo,
       DATE_PART('year', AGE((SELECT fecha FROM r9), s.fecha_nacimiento))::int AS e_gate,
       (date_part('year',(SELECT fecha FROM r9)) - date_part('year', s.fecha_nacimiento))::int AS e_regl
FROM inscripciones i
JOIN carreras c ON c.id = i.carrera_id
JOIN spcs s ON s.id = i.spc_id
LEFT JOIN usuarios u ON u.id = i.inscripto_por
WHERE c.reunion_id = (SELECT id FROM r9);
```

### Salida cruda

```json
[{"insc_id":"da791e64-9262-4af8-b9c2-f5ffcecd44ff","estado":"inscripto","canal":"portal",
  "created_at":"2026-08-25 18:26:02.340134+00","anoto":"FABIO JOSE CASTRO",
  "numero_turno":1,"emin":3,"emax":3,"condicion":"Todo caballo 3 años perdedor.",
  "spc":"Amiguito Peligroso","fecha_nacimiento":"2023-07-07","sexo":"macho",
  "e_gate":3,"e_regl":3}]
```

**Lectura**: nació el 07/07/2023, cinco días después del corte del 1° de julio. Es de los
casos donde las dos fórmulas coinciden (`e_gate = e_regl = 3`). Entró a una carrera de 3 años
y le corresponde. **Legítima.**

### Agregado

```sql
-- misma CTE
SELECT count(*) AS inscripciones_r9,
       count(*) FILTER (WHERE e_gate <> e_regl) AS con_edad_mal_calculada,
       count(*) FILTER (WHERE emin IS NOT NULL AND (e_regl < emin OR e_regl > emax)) AS colados,
       count(*) FILTER (WHERE emin IS NOT NULL AND e_regl >= emin AND e_regl <= emax) AS legitimos,
       count(*) FILTER (WHERE fecha_nacimiento IS NULL) AS sin_fecha_nac
FROM insc;
```

```json
[{"inscripciones_r9":1,"con_edad_mal_calculada":0,"colados":0,
  "legitimos":1,"sin_fecha_nac":0,
  "primera":"2026-08-25 18:26:02.340134+00","ultima":"2026-08-25 18:26:02.340134+00"}]
```

---

## 3. Por qué el daño es tan chico: 9 de 11 turnos no admiten inscripción

### Query

```sql
SELECT c.numero_turno, c.apertura_inscripcion::text, c.cierre_inscripcion::text,
       count(i.id) AS inscriptos
FROM reuniones r JOIN carreras c ON c.reunion_id = r.id
LEFT JOIN inscripciones i ON i.carrera_id = c.id
WHERE r.numero = 9
GROUP BY c.numero_turno, c.apertura_inscripcion, c.cierre_inscripcion
ORDER BY c.numero_turno;
```

### Salida

| turno | apertura | cierre | inscriptos |
|---:|---|---|---:|
| 1 | 2026-08-24 00:00Z | 2026-09-11 12:00Z | **1** |
| 2 | 2026-09-07 00:00Z | 2026-09-11 12:00Z | 0 |
| 3 | `NULL` | `NULL` | 0 |
| 4 | `NULL` | `NULL` | 0 |
| 5 | `NULL` | `NULL` | 0 |
| 6 | `NULL` | `NULL` | 0 |
| 7 | `NULL` | `NULL` | 0 |
| 8 | `NULL` | `NULL` | 0 |
| 9 | `NULL` | `NULL` | 0 |
| 10 | `NULL` | `NULL` | 0 |
| 11 | `NULL` | `NULL` | 0 |

`rpc_inscribir` es fail-closed con ventana nula:

```sql
IF v_reunion_estado IS DISTINCT FROM 'publicada'
   OR v_carrera.apertura_inscripcion IS NULL
   OR v_carrera.cierre_inscripcion  IS NULL
   OR now() < v_carrera.apertura_inscripcion
   OR now() > v_carrera.cierre_inscripcion
THEN RAISE EXCEPTION 'La inscripción para ese turno no está abierta.';
```

Desde que abrió, el gate de edad sólo pudo decidir sobre **el turno 1**.

`cierre = 2026-09-11 12:00Z` = **11/09 09:00 ART**, que es la ventana que se reportó.

---

## 4. Rechazados de más y colados posibles, por turno

Sobre los SPC `estado='activo'` con `fecha_nacimiento` cargada, contra la fecha de R9 (2026-09-20).

### Query

```sql
WITH r9 AS (SELECT id, fecha FROM reuniones WHERE numero=9),
sp AS (SELECT s.id,
         DATE_PART('year', AGE((SELECT fecha FROM r9), s.fecha_nacimiento))::int AS e_gate,
         (date_part('year',(SELECT fecha FROM r9)) - date_part('year', s.fecha_nacimiento))::int AS e_regl
       FROM spcs s WHERE s.fecha_nacimiento IS NOT NULL AND s.estado='activo')
SELECT c.numero_turno AS turno, c.edad_minima_anos AS min, c.edad_maxima_anos AS max,
       CASE WHEN c.apertura_inscripcion IS NULL THEN 'sin ventana'
            WHEN now() BETWEEN c.apertura_inscripcion AND c.cierre_inscripcion THEN 'ABIERTO'
            WHEN c.apertura_inscripcion > now() THEN 'por abrir'
            ELSE 'cerrado' END AS ventana,
       count(*) FILTER (WHERE sp.e_regl BETWEEN c.edad_minima_anos AND c.edad_maxima_anos
                          AND NOT (sp.e_gate BETWEEN c.edad_minima_anos AND c.edad_maxima_anos)) AS rechazados_de_mas,
       count(*) FILTER (WHERE sp.e_gate BETWEEN c.edad_minima_anos AND c.edad_maxima_anos
                          AND NOT (sp.e_regl BETWEEN c.edad_minima_anos AND c.edad_maxima_anos)) AS colados_posibles
FROM carreras c CROSS JOIN sp
WHERE c.reunion_id = (SELECT id FROM r9)
GROUP BY c.numero_turno, c.edad_minima_anos, c.edad_maxima_anos, c.apertura_inscripcion, c.cierre_inscripcion
ORDER BY c.numero_turno;
```

### Salida

| turno | min/max | ventana | **rechazados de más** | **colados posibles** |
|---:|---|---|---:|---:|
| 1 | 3/3 | 🔴 **ABIERTO** | **13** | **24** |
| 2 | 4/4 | 🟡 por abrir (07/09) | 24 | 29 |
| 3 | 4/4 | sin ventana | 24 | 29 |
| 4 | 5/10 | sin ventana | 29 | 0 |
| 5 | 5/10 | sin ventana | 29 | 0 |
| 6 | 5/10 | sin ventana | 29 | 0 |
| 7 | 6/10 | sin ventana | 20 | 0 |
| 8 | 4/4 | sin ventana | 24 | 29 |
| 9 | 5/10 | sin ventana | 29 | 0 |
| 10 | 5/10 | sin ventana | 29 | 0 |
| 11 | 5/5 | sin ventana | 29 | 20 |

**Rango: 13 a 29 rechazados de más por turno.** El único con exposición viva hoy es el turno 1
(13 rechazados de más, 24 que colarían). El turno 2 abre el 07/09 y sube a 24/29.

### Los 24 que colarían en el turno 1 (4 años reales, el gate los cuenta 3)

Todos nacidos sep–nov 2022:

ABELITO MIMOSO (2022-11-10), ASTUTO NOTES (2022-10-13), BACHUNA (2022-11-24),
BAM BAM HITS (2022-09-24), BENDITO PRESAGIO (2022-09-29), BESO CURIOSO (2022-10-22),
CALAVERIANDO (2022-09-21), CHAMPION GOLDEN (2022-11-06), DOCTOR SKY (2022-10-25),
DOCTORA MIA (2022-10-26), EL MEJOR DUQUE (2022-10-27), ELSEPTIMOESDECALDERA (2022-10-27),
ESTAS A TIEMPO (2022-11-02), INDIO GOLDEN (2022-10-30), LA LAGUNERA J (2022-10-10),
LINDA MAIPUENSE (2022-09-30), LOCA DUBAI (2022-11-06), MAC VITAL (2022-11-23),
NELIDA RIM (2022-11-02), SOL GALANA (2022-10-27), THE SULTAN (2022-10-25),
TOUCH OF BLUE (2022-10-30), VISION SECURITY (2022-10-08), YO SOY TANGO (2022-10-17).

### Los 13 rechazados de más en el turno 1 (3 años reales, el gate los cuenta 2)

Todos nacidos sep–dic 2023:

Berry Nik (2023-10-23), Cursi Nik (2023-10-27), DOCTORA APASIONADA (2023-09-29),
Es Mistres (2023-10-05), First Queen (2023-10-04), GREAT ORPEN (2023-12-12),
Malenuchi Jack (2023-10-15), MONADESEDA (2023-10-01), **MOSQUITA GARDEN (2023-10-10)**,
PUNAB (2023-10-04), QUIET SANTINA (2023-10-05), SI TIN (2023-10-07), TIRSO (2023-10-06).

MOSQUITA GARDEN es uno de los dos casos que dispararon el diagnóstico original.
ABELITO MIMOSO está en la lista de los 24 que colarían.

---

## 5. R8 y el resto de las reuniones

### R8 — limpia

```sql
SELECT (SELECT count(*) FROM carreras c WHERE c.reunion_id=r.id) AS turnos,
       (SELECT count(*) FROM carreras c WHERE c.reunion_id=r.id AND c.edad_minima_anos IS NOT NULL) AS con_edad_min,
       (SELECT count(*) FROM carreras c WHERE c.reunion_id=r.id AND c.edad_maxima_anos IS NOT NULL) AS con_edad_max,
       (SELECT count(*) FROM inscripciones i JOIN carreras c ON c.id=i.carrera_id WHERE c.reunion_id=r.id) AS inscripciones,
       (SELECT count(*) FROM inscripciones i JOIN carreras c ON c.id=i.carrera_id WHERE c.reunion_id=r.id AND i.canal='portal') AS via_portal,
       r.fecha::text, r.estado::text
FROM reuniones r WHERE r.numero=8;
```

```json
[{"turnos":12,"con_edad_min":0,"con_edad_max":0,"inscripciones":106,
  "via_portal":0,"fecha":"2026-08-16","estado":"publicada"}]
```

**Doble motivo por el que está limpia**: (a) los 12 turnos tienen las edades en NULL, así que
las dos ramas `IF ... IS NOT NULL` del gate nunca se ejecutaron; (b) las 106 inscripciones son
`canal='manual'`, cero por portal, o sea que ni siquiera pasaron por `rpc_inscribir`.

### Reuniones con edades cargadas

```sql
SELECT r.numero, r.fecha::text, r.estado::text AS r_estado,
       count(c.id) AS turnos, count(c.edad_minima_anos) AS con_edad,
       count(*) FILTER (WHERE c.apertura_inscripcion IS NOT NULL AND c.cierre_inscripcion IS NOT NULL
                          AND now() BETWEEN c.apertura_inscripcion AND c.cierre_inscripcion) AS abiertos_ahora,
       count(*) FILTER (WHERE c.apertura_inscripcion > now()) AS por_abrir,
       count(*) FILTER (WHERE c.apertura_inscripcion IS NULL OR c.cierre_inscripcion IS NULL) AS sin_ventana,
       (r.fecha >= current_date) AS futura
FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
GROUP BY r.numero, r.fecha, r.estado
HAVING count(c.edad_minima_anos) > 0
ORDER BY r.fecha DESC;
```

| reunión | fecha | estado | turnos | con edad | abiertos | por abrir | sin ventana | futura |
|---:|---|---|---:|---:|---:|---:|---:|---|
| **9** | 2026-09-20 | `publicada` | 11 | 11 | **1** | **1** | 9 | **sí** |
| 7 | 2026-07-19 | `cancelada` | 12 | 12 | 0 | 0 | 12 | no |
| 6 | 2026-06-20 | `borrador` | 11 | 11 | 0 | 0 | 11 | no |

**R9 es la única reunión con edades cargadas que está abierta o por abrir.** R7 está cancelada
y R6 en borrador, ambas con fecha pasada y sin ninguna ventana viva.

---

## 6. Hallazgos colaterales (fuera del alcance del censo, anotados)

### 6.1 — R6 tiene 14 inscripciones fuera de rango, pero NO por este bug

```sql
SELECT r.numero, count(*) AS inscripciones,
       count(*) FILTER (WHERE e_gate <> e_regl) AS edad_mal_calculada,
       count(*) FILTER (WHERE e_regl < emin OR e_regl > emax) AS fuera_de_rango
FROM (...) t JOIN reuniones r ON r.id = t.rid GROUP BY r.numero;
```

```json
[{"reunion":9,"fecha":"2026-09-20","inscripciones":1,"edad_mal_calculada":0,"colados":0},
 {"reunion":6,"fecha":"2026-06-20","inscripciones":125,"edad_mal_calculada":0,"colados":14}]
```

R6 cae **antes** del 1° de julio, y ahí las dos fórmulas dan lo mismo — por eso
`edad_mal_calculada = 0`. Esas 14 violan el rango bajo **ambas** fórmulas: el gate corregido
tampoco las habría dejado pasar. No entraron por el bug de edad, **entraron sin pasar por el gate**:

```json
[{"canal":"manual","estado":"ratificado","n":10,"primera":"2026-06-12 19:57:57","ultima":"2026-06-12 20:47:33"},
 {"canal":"manual","estado":"forfait","n":4,"primera":"2026-06-12 19:55:37","ultima":"2026-06-12 20:28:10"}]
```

`inscripciones.html:716` hace `.insert()` directo contra la tabla:

```js
: await sb.from('inscripciones').insert(payload);
```

Nunca llama a `validar_inscripcion`. **El gate de condiciones sólo existe en el camino del
portal**; la secretaría inscribe sin validación de edad, sexo, sanción ni cupo. Es un hallazgo
más viejo y más amplio que el bug de edad.

### 6.2 — Los rechazos no dejan rastro

```sql
SELECT count(*) AS filas_auditoria,
       count(*) FILTER (WHERE tabla='inscripciones') AS de_inscripciones,
       max(created_at)::text AS ultima FROM auditoria;
-- → {"filas_auditoria":6990,"de_inscripciones":2881,"ultima":"2026-08-25 19:23:44"}
```

`auditoria` registra **escrituras, no rechazos**. Un `rpc_inscribir` que levanta excepción no
inserta nada y no deja fila. Los 13 falsos negativos del turno 1 son invisibles: no hay forma
de saber cuántos entrenadores intentaron anotar, recibieron el genérico *"Tu ejemplar no está
habilitado para inscribirse. Consultá en secretaría."* y se fueron.

ABELITO y MOSQUITA llegaron por reclamo humano, no por el log. **El daño medible es cero; el
daño no medible es gente rebotada en silencio.**

### 6.3 — R9 turno 8 tiene los datos cruzados

`condicion_handicap` = *"Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras"*, pero está
cargado `edad_minima_anos=4`, `edad_maxima_anos=4`, `condicion_sexo='ambos'`. Ni la edad ni el
sexo coinciden con el texto. Independiente de este bug — es dato, no código.

---

## 7. Preguntas abiertas

1. **¿Los 9 turnos de R9 sin ventana son intencionales?** Hoy nadie puede anotar en ellos.
   Si es a propósito (se abren escalonados, como el turno 2 el 07/09), bien; si no, faltan
   `apertura_inscripcion` / `cierre_inscripcion` en 9 de 11 turnos a 15 días del cierre.
2. **¿Se avisa a los 13 rechazados del turno 1?** No hay registro de quiénes intentaron.
   Si se quiere recuperarlos, el aviso tiene que ser proactivo por caballeriza, no por log.
3. **¿El fix entra antes del 11/09 09:00?** Es el cierre del turno 1. Después de esa fecha el
   turno 1 queda decidido con el gate roto y ya no se puede anotar para corregirlo.
4. **¿Se corrige también el camino de staff (§6.1)?** Hoy `inscripciones.html` no valida nada.
   Decisión de producto: ¿la secretaría debe poder saltear condiciones a propósito, o es un
   agujero?
5. **¿Se corrige `v_inscriptos_carrera.spc_edad` en la misma migración?** Ítem 6 del inventario
   del 14/08, sigue con `AGE()` + `CURRENT_DATE`. Es display, no gate.
6. **R9 turno 8 (§6.3)**: ¿cuál manda, el texto o los campos?
