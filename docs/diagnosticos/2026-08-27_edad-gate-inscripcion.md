# Diagnóstico — el gate de inscripción calcula la edad por aniversario real

**Fecha**: 2026-08-27 · **Síntoma**: ABELITO MIMOSO y MOSQUITA GARDEN rechazados al anotar
**Estado: INFORME. Nada aplicado.** Read-only: sólo `SELECT` por MCP, `grep`/`sed`/`awk` sobre el repo.

**GUARD**: `pwd` = `/home/clio/dev/SGH` ✅ · `SELECT count(*) FROM spcs` = **181** ✅ · ref `unlhcuanfrtpatoipwve` ✅ · cero DDL, cero DML.

---

## 0. Veredicto

| hipótesis | resultado |
|---|---|
| **H1** — el gate usa aniversario real en vez de la regla del 1° de julio | ✅ **CONFIRMADA** |
| **H1b** — variante: usa `new Date()` / `CURRENT_DATE` en vez de la fecha de la reunión | ❌ descartada |
| **H2** — el bloqueo no es por edad (SPC inactivo, sin certificado, sanción, cupo, autoregistro) | ❌ descartada |

Es el mismo bug corregido el 14/08 en `edad-spc.js`, replicado en la función de base
`validar_inscripcion`. La mitad del fix del 14/08 (fecha de referencia = la reunión) ya
estaba bien acá; falta la otra mitad, la fórmula.

---

## 1. Corrección previa: el doc citado no existe

La consigna advertía:

> *`docs/SGH_REGLAS_DOMINIO.md` §11 dice que `edad_minima_anos` / `edad_maxima_anos` están
> en NULL y que la condición de edad vive como texto libre en `condicion_adicional`.*

**Ese archivo no existe en el repo.** No hay ningún `SGH_REGLAS_DOMINIO.md` ni nada que
matchee `*REGLA*` / `*DOMINIO*` con ese contenido. Lo más cercano:

- `docs/diagnosticos/2026-08-13_edad-reglamentaria.md` — la regla del 1° de julio y el fix.
- `docs/GOTCHAS.md §18` — *"`condicion_adicional` NO es la condición principal"*: es sólo una
  nota extra; la condición real vive en **`condicion_handicap`**, no en `condicion_adicional`.

Y el dato que ese §11 afirma **es falso hoy**:

```sql
SELECT count(*) AS total, count(edad_minima_anos) AS con_min, count(edad_maxima_anos) AS con_max
FROM carreras;
-- → 49 total · 34 con edad_minima · 30 con edad_maxima
```

**R9 (2026-09-20, `publicada`, la que se está anotando) tiene edad cargada en los 11 turnos.**
R8 sí las tiene todas en NULL — por eso el bug estuvo dormido: **R9 es la primera reunión con
las edades cargadas**, y recién ahora el `IF ... IS NOT NULL` del gate entra.

---

## 2. H1 — CONFIRMADA

`validar_inscripcion(p_spc_id, p_carrera_id)`, `SECURITY DEFINER`:

```sql
SELECT DATE_PART('year', AGE(
    (SELECT fecha FROM reuniones WHERE id = v_carrera.reunion_id), v_spc.fecha_nacimiento
))::INTEGER INTO v_edad_carrera;
...
IF v_carrera.edad_minima_anos IS NOT NULL AND v_edad_carrera < v_carrera.edad_minima_anos THEN
    RETURN QUERY SELECT FALSE, ... 'Edad insuficiente: ' || v_edad_carrera ...
```

`AGE()` da el aniversario real. La regla del Reglamento General de Carreras es:

```
edad = anioReferencia - anioNacimiento
si la fecha de referencia es ANTERIOR al 1 de julio de ese anio  ->  edad -= 1
```

Todo SPC nacido entre julio y diciembre queda contado **un año menos** de lo que corresponde.

### H1b — descartada

La fecha de referencia es `reuniones.fecha`, correcta. No usa `now()` ni `CURRENT_DATE`.
Esa mitad ya estaba bien.

---

## 3. Los dos casos reportados

Simulados contra la fecha de R9 (`2026-09-20`):

| | nacimiento | `AGE()` crudo | gate hoy | reglamentaria |
|---|---|---|---:|---:|
| ABELITO MIMOSO `454f1de3…` | 2022-11-10 | 3 años 10 meses 10 días | **3** | **4** |
| MOSQUITA GARDEN `c1af88b9…` | 2023-10-10 | 2 años 11 meses 10 días | **2** | **3** |

Ambos nacidos después del 1° de julio. Ambos `estado = 'activo'`.

### Falla en las dos direcciones

| caballo | turno | condición | min/max | gate hoy | debería |
|---|---|---|---|---|---|
| MOSQUITA (3) | 1 | Todo caballo 3 años perdedor | 3/3 | 🔴 RECHAZA | acepta |
| ABELITO (4) | 2 | Todo caballo 4 años perdedor | 4/4 | 🔴 RECHAZA | acepta |
| ABELITO (4) | 3 | Todo caballo 4 años perdedor | 4/4 | 🔴 RECHAZA | acepta |
| ABELITO (4) | 1 | Todo caballo **3 años** perdedor | 3/3 | ⚠️ **acepta** | RECHAZA |

La última fila es la grave: no sólo rebota a quien puede correr, **deja entrar un caballo de
4 años a una carrera de 3**. Falso negativo y falso positivo con el mismo error de signo.

---

## 4. Alcance

```sql
WITH ref AS (SELECT '2026-09-20'::date AS f)
SELECT count(DISTINCT s.id) AS spcs_con_fecha,
       count(DISTINCT s.id) FILTER (
         WHERE DATE_PART('year', AGE((SELECT f FROM ref), s.fecha_nacimiento))::int
             <> (date_part('year',(SELECT f FROM ref)) - date_part('year', s.fecha_nacimiento))::int
       ) AS spcs_mal_calculados
FROM spcs s WHERE s.fecha_nacimiento IS NOT NULL;
-- → 181 / 94
```

**94 de 181 SPCs mal calculados para la fecha de R9 — el 52 % del padrón.** Todos los
nacidos entre julio y diciembre. No es un caso de borde.

---

## 5. H2 — descartada

`rpc_inscribir` (6 params, versión del 25/08) fue leída entera. Sus gates, en orden:

1. entidad de portal (`profesional` o `propietario`)
2. usuario activo
3. SPC existe
4. carrera existe
5. reunión `publicada` + turno no `anulada` + ventana `apertura/cierre_inscripcion` abierta
6. caballeriza no nula, activa, del club de la reunión
7. entrenador no nulo, activo, `tipo IN ('entrenador','ambos')`, del club
8. jockey titular (opcional) y suplente, del padrón
9. **`validar_inscripcion`** ← acá muere
10. duplicado en el mismo turno

Descartes puntuales:

- **`certificado_correr` no se chequea en ningún lado.** Ambos lo tienen en `false` y aun así
  no es lo que los bloquea.
- **No hay chequeo de caballeriza del SPC ni de tenencia** — eso murió con inscripción libre
  el 24/08.
- **Sanción y cupo** se evalúan en `validar_inscripcion` *después* de la edad: no llegan.
  Además `cupo_maximo` está en NULL en las 49 carreras.
- Ambos SPC `estado = 'activo'`.

El único camino que rechaza a estos dos es `IF v_edad_carrera < v_carrera.edad_minima_anos`.

---

## 6. Hallazgos laterales

1. **R9 turno 8 tiene los datos cruzados.** `condicion_handicap` dice *"Yeguas de 5 años y +
   edad ganadoras de 1 o 2 carreras"*, pero está cargado `edad_minima_anos=4`,
   `edad_maxima_anos=4` y `condicion_sexo='ambos'`. Ni la edad ni el sexo coinciden con el
   texto. Independiente de este bug — va a dar rechazos raros el domingo.
2. **`v_inscriptos_carrera.spc_edad` sigue sin corregir.** Es el ítem 6 del inventario del
   14/08, marcado ⚠️ *no tocado*: usa `date_part('year', age(...))` con `CURRENT_DATE`, o sea
   que ahí aplican **H1 y H1b a la vez**. Es display, no gate, pero muestra edades distintas
   de las del programa.

---

## 7. Fix propuesto — NO aplicado

Una línea en `validar_inscripcion`, misma fórmula que `edad-spc.js`:

```sql
-- actual
SELECT DATE_PART('year', AGE(
    (SELECT fecha FROM reuniones WHERE id = v_carrera.reunion_id), v_spc.fecha_nacimiento
))::INTEGER INTO v_edad_carrera;

-- propuesto: regla del 1° de julio, misma fecha de referencia
SELECT (DATE_PART('year', r.fecha) - DATE_PART('year', v_spc.fecha_nacimiento)
        - CASE WHEN DATE_PART('month', r.fecha) < 7 THEN 1 ELSE 0 END)::INTEGER
  INTO v_edad_carrera
  FROM reuniones r WHERE r.id = v_carrera.reunion_id;
```

Acompañar con:

- Extender `tests/probe_edad_reglamentaria.mjs` con los dos casos de este informe
  (nacido después del 1/7, reunión antes y después del 1/7).
- Decidir si se corrige también `v_inscriptos_carrera.spc_edad` en la misma migración.
- Revisar aparte el turno 8 de R9 (§6.1) — es dato, no código.
