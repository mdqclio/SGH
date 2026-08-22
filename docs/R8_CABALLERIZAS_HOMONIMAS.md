# Caballerizas homónimas de Dolores — alcance y plan de consolidación

**Read-only. Estado: PROPUESTA, nada ejecutado.** Medición del 14/08/2026 05:47 UTC.

- Proyecto: `unlhcuanfrtpatoipwve` (Dolores prod) · club `0649e9c5-9e87-4aad-842f-101458e6b33c`
- R8 = `7b6e003e-22e2-4629-bf55-f18560b1260f` · guard `spcs` = **183** ✅
- Reproducible: `source .env && node tests/diag_caballerizas_homonimas.mjs`
- Contexto: `docs/PLAN_REDERIVACION_PROPIETARIO_R8.md` · lista de Yesi:
  `docs/r8_caballerizas_sin_propietario.csv`

**Para qué es este doc:** antes de que Yesi cargue los 40 responsables, saber si el CSV la
puede mandar a cargar en la fila equivocada — y, si el problema es chico, consolidar los
duplicados en vez de cargarles un responsable nuevo.

---

## Regla que hay que tener presente

La derivación de `propietario_id` lee **`inscripciones.caballeriza_id`**, no
`spcs.caballeriza_id`. Cuando divergen, **manda la inscripción**.

---

## 1. Caballerizas de Dolores con nombre duplicado

Comparación **ignorando mayúsculas y acentos** (NFD + strip de diacríticos + colapso de
espacios). **292 caballerizas · 290 nombres distintos · 2 grupos duplicados, 4 filas.**
Ninguno de los dos es grafía idéntica: los dos difieren sólo en capitalización.

### ▸ EL LINYE Y RAMI

| id | nombre | responsable | SPC | inscripciones (todas) | ratif. R8 | profesionales |
|---|---|---|---|---|---|---|
| `a692fdea-6434-4121-8a34-cc6b26d5c228` | `El linye y Rami` | **NO** — 0 filas | **0** | **2** | 1 | 0 |
| `d8f78de4-e153-4b12-8640-4a8674a58aa7` | `EL LINYE Y RAMI` | **SÍ** — CESAR DANIEL CUEVAS, DNI [DNI REDACTADO] (`8f63f7ab-260d-4f07-985e-467145bd11bd`) | **3** | **4** | 1 | 0 |

### ▸ LA NARCISA

| id | nombre | responsable | SPC | inscripciones (todas) | ratif. R8 | profesionales |
|---|---|---|---|---|---|---|
| `5b49b278-2163-4246-a1a5-61ea69b83a1a` | `La Narcisa` | **NO** — 0 filas | **0** | **0** | 0 | 0 |
| `f2b6f35b-9b12-4443-a538-9d5ff14f4774` | `LA NARCISA` | **SÍ** — ORNELA CARLI, DNI [DNI REDACTADO] (`02fecba6-8ce8-42af-b6cf-c9692eddc01c`) + coprop. FEDERICO CARLI, DNI [DNI REDACTADO] | **2** | **2** | 0 | 0 |

**Patrón idéntico en los dos grupos:** la fila en minúsculas es una **cáscara** — 0 SPC,
0 responsables, 0 profesionales. La de mayúsculas es la real. Las cuatro están
`activo=true`, `estado='activo'`: ninguna se descarta por estado.

**No es una pregunta de negocio: es error de carga por capitalización.** Se consolida.

### Qué cuelga exactamente de cada fila

```
▸ El linye y Rami  (a692fdea…)  ← cáscara, lo único que tiene son 2 inscripciones
   inscripciones:
     DE BELLOSO | R8 (2026-08-16) c2 | ratificado | propietario_id NULL | 735850ad-63c1-4f22-8646-ab826d08dbf1
     DE BELLOSO | R8 (2026-08-16) c6 | forfait     | propietario_id NULL | cfc29863-1192-475a-a03b-5c4d51f0cd7a
   spcs: (ninguno)   responsables: (ninguno)   profesionales: (ninguno)

▸ EL LINYE Y RAMI  (d8f78de4…)  ← la real
   spcs:  De Moda · LA DIVERTENTE · DE BELLOSO
   responsables:  propietario activo — CESAR DANIEL CUEVAS
   inscripciones: LA DIVERTENTE R6 c7 · De Moda R6 c1 · LA DIVERTENTE R8 c5 · LA DIVERTENTE R8 c8 (forfait)

▸ La Narcisa  (5b49b278…)  ← cáscara TOTALMENTE vacía: 0 de todo
▸ LA NARCISA  (f2b6f35b…)  ← la real: 2 SPC, 2 responsables, 2 inscripciones (R6)
```

**El SPC DE BELLOSO ya cuelga de la fila real** (`d8f78de4`). Lo único mal apuntado son sus
**2 inscripciones de R8**.

---

## 2. De las 40 del CSV, cuáles son mitad de un par duplicado

**Una sola: `El linye y Rami`.** Las otras 39 matchean exactamente una caballeriza.

`LA NARCISA` no está en el CSV y no tiene ratificados en R8 — no afecta esta carga, pero
entra igual en la consolidación porque es la misma trampa esperando en la próxima reunión.

**Consecuencia directa: esa fila del CSV no debería existir.** El propietario de
`El linye y Rami` ya está cargado en la fila real. Si Yesi la carga, tipea de nuevo a CESAR
DANIEL CUEVAS y arriesga duplicarlo en `propietarios`. **Con la consolidación de §3, el CSV
baja a 39 filas y DE BELLOSO se resuelve solo.**

---

## 3. Plan de consolidación (PROPUESTA — no ejecutado)

Alcance total: **2 filas de `inscripciones` a repuntar y 2 filas de `caballerizas` a retirar.**
Nada más. `spcs`, `caballeriza_responsables` y `profesionales` no se tocan: las cáscaras no
tienen ninguna fila en esas tres tablas.

### 3.0 Qué apunta a `caballerizas` (verificado, no asumido)

Cuatro caminos, probados uno por uno contra la base:

| tabla | columna | filas en las 4 caballerizas |
|---|---|---|
| `spcs` | `caballeriza_id` | 5 — todas en las filas reales |
| `inscripciones` | `caballeriza_id` | 8 — **2 en la cáscara** `a692fdea` |
| `caballeriza_responsables` | `caballeriza_id` (ON DELETE CASCADE) | 3 — todas en las filas reales |
| `profesionales` | `caballeriza_id` | 0 |

Polimórficas (`sanciones`, `resolucion_entidades` con `entidad_tipo='caballeriza'`): **0 filas.**

### 3.1 Qué fila sobrevive

| grupo | sobrevive | se retira | criterio |
|---|---|---|---|
| EL LINYE Y RAMI | **`d8f78de4-…`** `EL LINYE Y RAMI` | `a692fdea-…` | tiene los 3 SPC, el responsable y 4 de las 6 inscripciones |
| LA NARCISA | **`f2b6f35b-…`** `LA NARCISA` | `5b49b278-…` | tiene los 2 SPC, los 2 responsables y las 2 inscripciones |

En los dos casos sobrevive la escrita en mayúsculas, que además es la convención del resto
de la tabla.

### 3.2 Qué se repunta

Sólo `inscripciones`, sólo las 2 de la cáscara `a692fdea`:

```sql
-- Las 2 inscripciones de DE BELLOSO en R8 pasan a la caballeriza real.
UPDATE inscripciones
SET caballeriza_id = 'd8f78de4-e153-4b12-8640-4a8674a58aa7'
WHERE caballeriza_id = 'a692fdea-6434-4121-8a34-cc6b26d5c228';
-- Esperado: 2 filas.
```

⚠️ **Esto SÍ dispara `trg_insc_set_propietario`** (`BEFORE INSERT OR UPDATE OF caballeriza_id`).
Es deliberado y es la parte buena: las 2 filas van a derivar `propietario_id` =
CESAR DANIEL CUEVAS solas. **DE BELLOSO deja de estar en NULL sin que Yesi cargue nada.**

Efecto en el conteo de la re-derivación: **de 18/67 pasa a 19/67**, y los pendientes bajan
de 49 a 48. La fila `El linye y Rami` sale del CSV.

*(La segunda inscripción es un `forfait` de la misma R8 c6. También recibe `propietario_id`.
No liquida — un forfait no cobra — así que es inocuo y deja el dato consistente.)*

`La Narcisa` (`5b49b278`) no tiene nada que repuntar: **0 filas en las 4 tablas.**

### 3.3 Qué se hace con las cáscaras

**Recomendado antes del domingo: desactivarlas, no borrarlas.**

```sql
UPDATE caballerizas SET activo = false, estado = 'inactivo'
WHERE id IN ('a692fdea-6434-4121-8a34-cc6b26d5c228',
             '5b49b278-2163-4246-a1a5-61ea69b83a1a');
```

Las saca de los selectores de `caballerizas.html` para que nadie vuelva a inscribir contra
ellas, y es trivialmente reversible.

**El `DELETE` va en frío, después de que R8 esté liquidada y cerrada:**

```sql
-- Sólo cuando el chequeo de 3.4 dé 0 en las cuatro tablas.
DELETE FROM caballerizas
WHERE id IN ('a692fdea-6434-4121-8a34-cc6b26d5c228',
             '5b49b278-2163-4246-a1a5-61ea69b83a1a');
```

`caballeriza_responsables` tiene `ON DELETE CASCADE`, pero las dos cáscaras tienen 0 filas
ahí, así que el cascade no borra nada. Aun así: **no borrar el domingo.** Un `DELETE` sin
red en la semana de la reunión no compra nada que el `activo=false` no dé.

### 3.4 Verificación posterior

```sql
-- (a) nada quedó apuntando a las cáscaras — esperado: 0, 0, 0, 0
SELECT (SELECT count(*) FROM inscripciones           WHERE caballeriza_id IN ('a692fdea-6434-4121-8a34-cc6b26d5c228','5b49b278-2163-4246-a1a5-61ea69b83a1a')) AS insc,
       (SELECT count(*) FROM spcs                    WHERE caballeriza_id IN ('a692fdea-6434-4121-8a34-cc6b26d5c228','5b49b278-2163-4246-a1a5-61ea69b83a1a')) AS spcs,
       (SELECT count(*) FROM caballeriza_responsables WHERE caballeriza_id IN ('a692fdea-6434-4121-8a34-cc6b26d5c228','5b49b278-2163-4246-a1a5-61ea69b83a1a')) AS resp,
       (SELECT count(*) FROM profesionales           WHERE caballeriza_id IN ('a692fdea-6434-4121-8a34-cc6b26d5c228','5b49b278-2163-4246-a1a5-61ea69b83a1a')) AS profs;

-- (b) DE BELLOSO quedó con propietario — esperado: 2 filas, las dos con CESAR DANIEL CUEVAS
SELECT i.id, i.estado, i.propietario_id
FROM inscripciones i JOIN spcs s ON s.id = i.spc_id
WHERE s.nombre = 'DE BELLOSO';

-- (c) nada más de R8 se movió — esperado: 19 con propietario, 48 en NULL
SELECT count(*) FILTER (WHERE i.propietario_id IS NOT NULL) AS con_prop,
       count(*) FILTER (WHERE i.propietario_id IS NULL)     AS sin_prop
FROM inscripciones i JOIN carreras c ON c.id = i.carrera_id
WHERE c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f' AND i.estado = 'ratificado';
```

Y re-correr `node tests/diag_caballerizas_homonimas.mjs`: **grupos duplicados debe pasar de
2 a 0** una vez borradas las cáscaras (con `activo=false` siguen apareciendo, porque el
script no filtra por estado — es a propósito, una cáscara inactiva sigue siendo un homónimo).

### 3.5 Rollback

**Snapshot antes de tocar nada** (DDL, va por `apply_migration`):

```sql
CREATE TABLE bak_consolidacion_homonimas AS
SELECT 'inscripciones' AS tabla, i.id AS fila_id, i.caballeriza_id, i.propietario_id, now() AS snapshot_at
FROM inscripciones i
WHERE i.caballeriza_id IN ('a692fdea-6434-4121-8a34-cc6b26d5c228','5b49b278-2163-4246-a1a5-61ea69b83a1a');

SELECT count(*) FROM bak_consolidacion_homonimas;   -- Esperado: 2
```

Y guardar aparte las 2 filas de `caballerizas` completas (`SELECT * FROM caballerizas WHERE
id IN (...)`) como CSV commiteado al branch — son las que habría que re-insertar si se llegó
a borrar.

**Restaurar el repunte:**

```sql
UPDATE inscripciones i
SET caballeriza_id = b.caballeriza_id
FROM bak_consolidacion_homonimas b
WHERE b.tabla = 'inscripciones' AND b.fila_id = i.id
  AND i.caballeriza_id IS DISTINCT FROM b.caballeriza_id;
```

Vuelve a disparar el trigger, que al no encontrar responsable en la cáscara deja
`propietario_id` en **NULL** — exactamente el estado previo. Verificar con 3.4(c): debe
volver a dar 18 / 49.

**Si ya se borró la caballeriza:** re-insertarla con **el mismo UUID** (`INSERT INTO
caballerizas (id, club_id, nombre, …) VALUES ('a692fdea-…', …)`) *antes* de correr el
UPDATE de restauración, o la FK lo rechaza. De ahí que el `DELETE` vaya en frío y no el
domingo.

### 3.6 Dónde entra en la secuencia del plan de re-derivación

Va **antes** del paso 2 de §7 de `PLAN_REDERIVACION_PROPIETARIO_R8.md` — es decir, antes de
la re-derivación, idealmente antes de que Yesi arranque, porque le saca una fila del CSV:

> 0) **consolidar homónimas (este doc)** → 1) Yesi carga los 39 restantes →
> 2) re-derivación → 3) verificar 67 → 4) oficializar

Si se corre después de que Yesi ya cargó `El linye y Rami`, no se rompe nada, pero queda un
responsable duplicado en la cáscara que hay que borrar a mano antes del `DELETE`.

---

## 4. Divergencia `spcs` ↔ `inscripciones` que NO es un homónimo — para Fede

De los 67 ratificados de R8 hay 2 con el Stud Book apuntando a una caballeriza y la
inscripción a otra. **Una de las dos (DE BELLOSO) es el duplicado por capitalización de §1 y
la resuelve la consolidación — no es pregunta para nadie.** Queda una sola:

| ejemplar | carrera | Stud Book (`spcs`) | Inscripción R8 — **manda** | `propietario_id` hoy |
|---|---|---|---|---|
| **DOCTOR SKY** | **1** | `LA NARCISA` — `f2b6f35b-9b12-4443-a538-9d5ff14f4774` · resp **SÍ** (ORNELA CARLI) | `LOS URONES` — `6d5138dc-a13e-4fb1-8bde-c8e52e148dd2` · resp **NO** | NULL |

No son homónimas: son dos caballerizas distintas con nombres distintos. **Es un cambio de
caballeriza, no un error de tipeo.**

Dato que ayuda a decidir: en **R6 (20/06) DOCTOR SKY corrió inscripto en `LA NARCISA`**, con
`propietario_id` cargado. En R8 está inscripto en `LOS URONES`. Lo más probable es que el
caballo se haya mudado de caballeriza entre junio y agosto y que el Stud Book (`spcs`) haya
quedado atrasado — en cuyo caso la inscripción está bien y sólo falta cargarle el
responsable a `LOS URONES`, que ya está en el CSV de Yesi.

**Confirmarlo con Fede igual, porque si es al revés** (la inscripción es la equivocada), el
70 % de DOCTOR SKY va a ORNELA CARLI o al responsable de LOS URONES según qué se toque, y el
error queda enterrado en una liquidación que cierra igual. Es una pregunta de una línea:
*¿DOCTOR SKY corre el domingo por LOS URONES o por LA NARCISA?*

---

## 5. Lo que este doc NO hace

- No ejecuta la consolidación ni ninguna parte del plan de re-derivación.
- No escribe en `caballerizas`, `caballeriza_responsables`, `inscripciones` ni `spcs`.
- No modifica el CSV de Yesi (la baja de `El linye y Rami` es una recomendación de §2).
- No decide la divergencia de DOCTOR SKY — eso es de Fede.
