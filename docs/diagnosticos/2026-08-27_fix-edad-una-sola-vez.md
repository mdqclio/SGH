# Plan de fix — la regla del 1° de julio, una sola vez en la base

| | |
|---|---|
| **Fecha** | 2026-08-27 |
| **SHA del commit** | `SHA_PLACEHOLDER` (este informe, branch `reports`) |
| **SHA del código** | `54574bc` — branch `fix/edad-reglamentaria-unica`, **pusheada, NO mergeada** |
| **Estado** | 🔴 **PLAN. NADA APLICADO.** La migración no se ejecutó contra la base. Requiere OK explícito. |
| **Diagnóstico de origen** | `docs/diagnosticos/2026-08-27_edad-gate-inscripcion.md` (SHA `7de5461`) |
| **Censo de daño** | `docs/diagnosticos/2026-08-27_censo-inscripciones-r9.md` (branch `reports`) |

### Guards verificados

```
$ pwd
/home/clio/dev/SGH                       ✅ esperado /home/clio/dev/SGH

SELECT count(*) FROM spcs;
[{"count":181}]                          ✅ esperado 181

ref del proyecto → unlhcuanfrtpatoipwve  ✅
```

### Verificación de que no se aplicó nada

```sql
SELECT count(*) AS fn_ya_existe
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='fn_edad_reglamentaria';
-- → [{"fn_ya_existe":0}]
```

La función no existe en producción. La base está intacta.

---

## Números de resumen

| # | | |
|---|---|---|
| **1** | Implementaciones de la fórmula hoy | **3** (1 correcta, 2 rotas) |
| **2** | Implementaciones después del fix | **2** — 1 en SQL (`fn_edad_reglamentaria`) + 1 en el front (`edad-spc.js`). No se pueden unificar: son dos runtimes. El probe verifica que den el mismo número. |
| **3** | Objetos de base tocados | **3** — 1 función nueva, 1 función reemplazada, 1 vista reemplazada |
| **4** | ¿Hace falta DROP? | **No**, ni en la función ni en la vista (§3 y §4) |
| **5** | ¿Dependencias en cascada de la vista? | **0** (§4.1) |
| **6** | Asserts nuevos en el probe | **~20** (9 de fórmula + 4 de gate + cruce + NULL) |

---

## 1. El problema, en una línea

La regla del 1° de julio existe tres veces y dos están rotas:

| # | dónde | fórmula | fecha de referencia | estado |
|---|---|---|---|---|
| 1 | `edad-spc.js` | año − año − (mes<7) | fecha de la reunión | ✅ correcta desde el 14/08 (`38989d8`) |
| 2 | `validar_inscripcion` | `DATE_PART('year', AGE(...))` — aniversario real | `reuniones.fecha` | 🔴 **rota** (H1) |
| 3 | `v_inscriptos_carrera.spc_edad` | `date_part('year', age(nac))` — aniversario real | **`CURRENT_DATE`** | 🔴 **rota x2** (H1 **y** H1b) |

El ítem 3 es el número 6 del inventario del 14/08, marcado ⚠️ *no tocado*, y es el peor de
los tres: `age()` con **un solo argumento** mide contra `CURRENT_DATE`, así que la misma fila
muestra una edad distinta según el día en que se consulte.

---

## 2. `fn_edad_reglamentaria` — la función nueva

```sql
CREATE OR REPLACE FUNCTION public.fn_edad_reglamentaria(
  p_fecha_ref date,
  p_fecha_nac date
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN p_fecha_ref IS NULL OR p_fecha_nac IS NULL THEN NULL
           ELSE ( EXTRACT(YEAR  FROM p_fecha_ref)::int
                - EXTRACT(YEAR  FROM p_fecha_nac)::int
                - CASE WHEN EXTRACT(MONTH FROM p_fecha_ref)::int < 7 THEN 1 ELSE 0 END )
         END;
$$;

REVOKE ALL ON FUNCTION public.fn_edad_reglamentaria(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_edad_reglamentaria(date, date) TO anon, authenticated, service_role;
```

`IMMUTABLE`: para el mismo par de fechas siempre devuelve lo mismo, no lee tablas ni depende
de `now()`. Eso la hace cacheable por el planner e indexable si algún día hace falta.

---

## 3. Sin fecha de nacimiento: el gate queda FAIL-OPEN, y el fix NO lo cambia

**Esto se pidió explícitamente, así que va derecho:**

### Cómo se comporta HOY (antes del fix)

```
AGE(reunion.fecha, NULL)            → NULL
DATE_PART('year', NULL)             → NULL
v_edad_carrera                      → NULL
```

Y las dos ramas del gate son:

```sql
IF v_carrera.edad_minima_anos IS NOT NULL AND v_edad_carrera < v_carrera.edad_minima_anos THEN
```

`NULL < 3` evalúa a `NULL`, no a `TRUE`. Un `IF` con condición `NULL` **no entra**. Lo mismo
con la rama del máximo.

👉 **Hoy, un SPC sin `fecha_nacimiento` PASA el gate de edad.** No lo rechaza: lo deja entrar
a cualquier carrera, sin importar la condición.

### Cómo se comporta DESPUÉS del fix

`fn_edad_reglamentaria` devuelve `NULL` si cualquiera de los dos argumentos es `NULL`, que es
exactamente lo que se pidió. `v_edad_carrera` sigue siendo `NULL` y las dos comparaciones
siguen dando `NULL`.

👉 **El fix NO cambia este comportamiento. Sigue siendo fail-open.**

### ¿Importa hoy?

```sql
SELECT count(*) AS total, count(fecha_nacimiento) AS con_fecha,
       count(*) - count(fecha_nacimiento) AS sin_fecha FROM spcs;
-- → [{"total":181,"con_fecha":181,"sin_fecha":0}]
```

**Cero SPCs sin fecha de nacimiento.** El caso es teórico hoy, pero queda vivo: el día que se
dé de alta un ejemplar sin fecha, entra a cualquier carrera sin control de edad.

⚠️ **Es una decisión de producto pendiente, no la tomé** — ver pregunta abierta 1 en §8.

---

## 4. `validar_inscripcion` — reemplazo sin DROP

La firma **no cambia** (`p_spc_id uuid, p_carrera_id uuid`), así que `CREATE OR REPLACE`
alcanza: no hace falta `DROP` y **no se genera overload**. Es lo contrario de lo que pasó con
`rpc_inscribir` el 25/08, donde sí cambió la firma y hubo que dropear.

Lo único que cambia son 5 líneas. Todo lo demás — gates de estado, sexo, sanción, cupo, los
textos y el `fn_is_staff()` — queda idéntico:

```sql
-- ANTES
SELECT DATE_PART('year', AGE(
    (SELECT fecha FROM reuniones WHERE id = v_carrera.reunion_id), v_spc.fecha_nacimiento
))::INTEGER INTO v_edad_carrera;

-- DESPUÉS
SELECT fn_edad_reglamentaria(r.fecha, v_spc.fecha_nacimiento)
  INTO v_edad_carrera
  FROM reuniones r
 WHERE r.id = v_carrera.reunion_id;
```

La fecha de referencia sigue siendo `reuniones.fecha`, que ya estaba bien (H1b nunca aplicó acá).

---

## 5. `v_inscriptos_carrera` — verificado antes de tocarla

### 5.1 Dependencias en cascada: **ninguna**

```sql
SELECT DISTINCT dependent_ns.nspname, dependent_view.relname, dependent_view.relkind::text
FROM pg_depend d
JOIN pg_rewrite rw ON rw.oid = d.objid
JOIN pg_class dependent_view ON dependent_view.oid = rw.ev_class
JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_view.relnamespace
JOIN pg_class source ON source.oid = d.refobjid
WHERE source.relname = 'v_inscriptos_carrera'
  AND dependent_view.relname <> 'v_inscriptos_carrera';
-- → []
```

**0 filas.** No hay vistas ni matviews colgando de ella. No hay cascada que avisar.

Además, en el repo:

```
$ grep -rn "v_inscriptos_carrera" --include=*.html --include=*.js --include=*.mjs .
(sin resultados)
```

**El front no la usa.** Se arregla igual — está rota y es la fuente de verdad de nadie hoy,
pero mañana sí.

### 5.2 `CREATE OR REPLACE VIEW` es viable, **con una condición**

`CREATE OR REPLACE VIEW` exige mismo nombre, tipo y orden de columnas. Y acá hay una trampa:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='v_inscriptos_carrera' AND column_name='spc_edad';
-- → [{"column_name":"spc_edad","data_type":"double precision"}]
```

`date_part()` devuelve `double precision`. `fn_edad_reglamentaria` devuelve `integer`. Sin
cast, el `REPLACE` falla con:

```
cannot change data type of view column "spc_edad" from double precision to integer
```

Por eso la migración castea: `fn_edad_reglamentaria(rn.fecha, s.fecha_nacimiento)::double precision`.
Así el `REPLACE` funciona y **no hace falta `DROP`**, que se llevaría puestos los GRANTs y
habría que reponerlos a mano.

> Alternativa descartada: `DROP VIEW` + `CREATE` con `spc_edad` como `integer`, que es el tipo
> semánticamente correcto. Más limpio, pero implica reponer permisos y es una operación
> destructiva sobre prod para ganar una prolijidad de tipo. Queda como pregunta abierta 2.

### 5.3 Cambio de semántica: `CURRENT_DATE` → fecha de la reunión

La vista **no tenía** join a `carreras` ni a `reuniones` — por eso usaba `age()` de un
argumento. Hay que agregarlos:

```sql
     LEFT JOIN carreras cr ON cr.id = i.carrera_id
     LEFT JOIN reuniones rn ON rn.id = cr.reunion_id
```

`LEFT` y no `INNER` a propósito: con `INNER` se perderían filas si faltara la carrera o la
reunión, y **el conteo de la vista cambiaría**. Con `LEFT`, una fila huérfana simplemente
queda con `spc_edad = NULL`, que es honesto.

---

## 6. El probe — las dos direcciones

`tests/probe_edad_reglamentaria.mjs` pasa de 216 a 329 líneas. La parte A (comparación contra
el Stud Book) queda intacta; se agrega una **PARTE B**.

### B1 — la función aislada, 9 casos

| `fecha_ref` | `fecha_nac` | esperado | qué prueba |
|---|---|---:|---|
| 2026-09-20 | 2023-10-10 | **3** | MOSQUITA GARDEN — el aniversario real daría 2 |
| 2026-09-20 | 2022-11-10 | **4** | ABELITO MIMOSO — el aniversario real daría 3 |
| 2026-09-20 | 2023-07-07 | **3** | Amiguito Peligroso — ambas fórmulas coinciden |
| 2026-09-20 | 2023-06-28 | **3** | nacido 3 días ANTES del corte |
| **2026-06-20** | 2022-11-10 | **3** | **reunión anterior al 1° de julio: la resta sí aplica** |
| 2026-07-01 | 2022-11-10 | **4** | borde: el 1° de julio exacto ya cumplió |
| 2026-06-30 | 2022-11-10 | **3** | borde: el 30 de junio todavía no |
| 2026-09-20 | `NULL` | `NULL` | sin fecha de nacimiento |
| `NULL` | 2022-11-10 | `NULL` | sin fecha de referencia |

### B2 — la base y el front dan el mismo número

Recorre los ratificados de R8 y compara `fn_edad_reglamentaria(reunion.fecha, nac)` contra
`edadSPC(nac, reunion.fecha)`. Es el assert que impide que las dos implementaciones se
separen con el tiempo.

### B3 — el gate, en las dos direcciones

| SPC | carrera | esperado | hoy | por qué importa |
|---|---|---|---|---|
| MOSQUITA GARDEN (3 reales) | turno 3/3 | **ACEPTA** | 🔴 rechaza | falso negativo |
| **ABELITO MIMOSO (4 reales)** | **turno 3/3** | **RECHAZA** | ⚠️ **acepta** | **falso positivo — el más grave: un 4 años corriendo contra 3 años** |
| ABELITO MIMOSO (4 reales) | turno 4/4 | **ACEPTA** | 🔴 rechaza | falso negativo |
| Amiguito Peligroso | turno 3/3 | **ACEPTA** | ✅ acepta | no-regresión: es la única inscripción viva de R9 |

Los turnos se resuelven por condición (`edad_minima_anos = edad_maxima_anos = 3` / `= 4`), no
por número fijo, para que el probe no se rompa si Yesi reordena los turnos.

### B4 — SPC sin fecha de nacimiento

**No crea un fixture a propósito.** `SELECT count(*) FROM spcs` = 181 es uno de los tres
guards de sesión: dar de alta y de baja un SPC lo movería y ensuciaría el guard. En su lugar
verifica que `fn_edad_reglamentaria` devuelva `NULL`, cuenta cuántos SPCs sin fecha hay hoy
(cero) y, si algún día aparece uno, corre el gate contra él y documenta el fail-open.

---

## 7. Qué falta para aplicar

Nada automático. Con OK explícito:

1. `apply_migration` con `migrations/fn_edad_reglamentaria.sql`.
2. Pre y post conteo de `v_inscriptos_carrera` para confirmar que no perdió filas.
3. `set -a; . ./.env; set +a; node tests/probe_edad_reglamentaria.mjs`.
4. Resultado del probe a este mismo informe.
5. Merge de `fix/edad-reglamentaria-unica` a `main` — **también con OK**.

**Reloj**: Yesi habilita hoy los 11 turnos de R9. Hasta ahora el gate decidía sobre 1 turno;
a partir de hoy decide sobre 11. Cierre de inscripciones **11/09 09:00 ART**.

---

## 8. Preguntas abiertas

1. **SPC sin fecha de nacimiento: ¿fail-open o fail-closed?** Hoy pasa el gate y el fix no lo
   cambia (§3). Hay 0 casos hoy. ¿Se deja así, o el gate debe rechazar cuando no puede
   calcular la edad? Es decisión de producto — no la tomé.
2. **`spc_edad`: ¿`double precision` o `integer`?** Mantuve `double precision` para poder usar
   `CREATE OR REPLACE VIEW` sin `DROP` (§5.2). El tipo correcto es `integer`. ¿Vale un `DROP`
   + reposición de GRANTs para corregirlo?
3. **¿La fórmula debe clampear en 0?** `edad-spc.js` hace `edad < 0 ? 0 : edad`.
   `fn_edad_reglamentaria` **no clampea**, porque la especificación que me pasaste no lo
   incluye. Con una fecha de nacimiento posterior a la reunión daría negativo. Hoy no pasa,
   pero es una divergencia real entre las dos implementaciones y B2 la detectaría si apareciera.
4. **El camino de staff sigue sin validar.** `inscripciones.html:716` hace `.insert()` directo
   y nunca llama a `validar_inscripcion`: el fix no lo alcanza. La secretaría puede seguir
   inscribiendo fuera de condición. ¿Entra en este trabajo o va aparte?
5. **R9 turno 8 tiene los datos cruzados.** `condicion_handicap` dice "Yeguas de 5 años y +
   edad" pero está cargado `4/4` y `condicion_sexo='ambos'`. Con el gate arreglado va a
   rechazar exactamente lo que el texto promete. Es dato, no código, y es urgente si Yesi
   abre ese turno hoy.
6. **¿Los 13 rechazados del turno 1 se avisan?** No hay log de intentos rechazados
   (`auditoria` registra escrituras, no rechazos). Si se los quiere recuperar, el aviso tiene
   que ser proactivo por caballeriza.
