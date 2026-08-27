# Aplicación del fix de edad — APLICADO EN PRODUCCIÓN

| | |
|---|---|
| **Fecha** | 2026-08-27 |
| **SHA del commit** | `6236547` (este informe, branch `reports`) |
| **SHA del código** | `54ccbad` — branch `fix/edad-reglamentaria-unica`, **pusheada, NO mergeada a `main`** |
| **Estado** | 🟢 **APLICADO.** Probe **GATE OK — 32/32**. |
| **Antecedentes** | `2026-08-27_edad-gate-inscripcion.md` (`7de5461`) · `2026-08-27_censo-inscripciones-r9.md` · `2026-08-27_fix-edad-una-sola-vez.md` · `2026-08-27_quien-choco-con-el-gate.md` |

---

## ⏱ MOMENTO EXACTO DE LA APLICACIÓN — para avisarle a Yesi

> **La migración quedó aplicada entre las 14:32:27 y las 14:33:27 ART del 27/08/2026**
> (17:32:27 – 17:33:27 UTC). Un minuto de ventana, tres `apply_migration` seguidos.
>
> **Desde las 14:33 ART el gate decide distinto.** Si Yesi probó inscripciones antes de esa
> hora, vio el comportamiento viejo; después, el nuevo. Concretamente: caballos nacidos entre
> julio y diciembre ahora cuentan un año más, así que **algunos que le rebotaban ahora entran,
> y algunos que le entraban ahora rebotan**. Lo segundo es lo que le va a llamar la atención.

| hito | UTC | ART |
|---|---|---|
| conteo PRE | 2026-08-27 17:32:27 | 14:32:27 |
| `fn_edad_reglamentaria` creada | 17:32:2x | 14:32:2x |
| `validar_inscripcion` reemplazada | 17:32:5x | 14:32:5x |
| `v_inscriptos_carrera` reemplazada | 17:33:1x | 14:33:1x |
| conteo POST | 2026-08-27 17:33:27 | **14:33:27** |

---

## Números de resumen

| # | | |
|---|---|---|
| **1** | Asserts del probe | **32 / 32 OK**, exit 0 |
| **2** | Filas de `v_inscriptos_carrera` PRE → POST | **249 → 249** (sin pérdida) |
| **3** | Filas escritas por el probe | **0** — `inscripciones` 249 → 249, `spcs` 181 → 181, R9 sigue con 1 |
| **4** | Overloads de `validar_inscripcion` | **1** (no se duplicó la firma) |
| **5** | Ratificados de R8 donde la edad cambia | **46 de 67** |
| **6** | Coincidencia con el Stud Book | **67/67** con el fix · **21/67** antes |

---

## 1. Las tres condiciones previas

### 1.1 Rollback capturado ✅

`migrations/fn_edad_reglamentaria.sql` termina con un bloque `ROLLBACK` que contiene, comentadas,
las definiciones previas de `validar_inscripcion` y `v_inscriptos_carrera`, capturadas con
`pg_get_functiondef()` y `pg_get_viewdef()` **inmediatamente antes** del `apply_migration`.

Es copia **literal**, acentos incluidos. En un primer intento las había transcripto sin tildes
y lo corregí: un rollback que cambia los textos que ve el usuario no es un rollback.

Para revertir: descomentar los dos bloques y ejecutarlos. Vuelve todo al estado previo, con el
bug incluido. `fn_edad_reglamentaria` queda huérfana; para borrarla también,
`DROP FUNCTION IF EXISTS public.fn_edad_reglamentaria(date, date);` **después** de revertir los
dos objetos que la llaman.

### 1.2 El probe no escribe nada ✅

**`validar_inscripcion` sólo lee.** Su cuerpo tiene únicamente `SELECT ... INTO` y
`RETURN QUERY SELECT`. Cero `INSERT`, `UPDATE` o `DELETE` — verificable en el código de la
migración, donde el conteo de esas tres palabras da 0.

**B3 no crea inscripciones.** Los RPC que el probe invoca son exactamente tres llamadas, a dos
funciones:

```
249: rpc('fn_edad_reglamentaria'
283: rpc('validar_inscripcion'
314: rpc('fn_edad_reglamentaria'
```

**No llama a `rpc_inscribir`**, que es la única que inserta. Y no hay ningún `.insert(`,
`.update(`, `.delete(` ni `.upsert(` en todo el archivo.

Confirmado además por conteo después de correrlo dos veces:

```json
{"inscripciones_post_probe":249,"spcs_post_probe":181,
 "vista_post_probe":249,"inscripciones_R9":1}
```

**R9 sigue con su única inscripción, la de Fabio.** La carta de llamados está limpia.

### 1.3 `spcs.fecha_nacimiento` es NOT NULL ✅ — la pregunta 1 se cierra sola

```sql
SELECT is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='spcs' AND column_name='fecha_nacimiento';
-- → "NO"
```

| columna | `is_nullable` |
|---|---|
| `spcs.fecha_nacimiento` | **NO** |
| `spcs.sexo` | **NO** |
| `spcs.registro_stud_book` | **YES** ⚠️ |
| `reuniones.fecha` | **NO** |
| `inscripciones.carrera_id` | **NO** |

👉 **El fail-open es imposible por el camino del gate**: los dos argumentos de la función
siempre vienen cargados. La pregunta abierta 1 queda cerrada sin necesidad de decidir nada.

⚠️ **Una corrección al antecedente que me pasaste**: dijiste que `registro_stud_book` también
era `NOT NULL`, reflejando que *"caballo sin Stud Book no corre"*. **No lo es: es nullable.**
`fecha_nacimiento` y `sexo` sí. Si la regla de negocio es que sin Stud Book no se corre, hoy el
schema no la sostiene — pero eso es otro tema y no lo toqué.

La rama `NULL` de la función se conserva igual, porque la vista usa `LEFT JOIN` y una fila
huérfana sí puede traer `rn.fecha` en NULL.

---

## 2. Cambios respecto del plan aprobado

### 2.1 Clamp en 0 (pregunta 3) ✅

```sql
ELSE GREATEST(
       EXTRACT(YEAR  FROM p_fecha_ref)::int
     - EXTRACT(YEAR  FROM p_fecha_nac)::int
     - CASE WHEN EXTRACT(MONTH FROM p_fecha_ref)::int < 7 THEN 1 ELSE 0 END,
       0)
```

Replica el `edad < 0 ? 0 : edad` de `edad-spc.js`. Dos casos nuevos en el probe, ambos OK:

- `fn('2026-09-20','2027-03-01') = 0` — nacido después de la reunión.
- `fn('2026-06-20','2026-05-01') = 0` — mismo año, reunión antes del 1/7: la resta daría −1.

### 2.2 `spc_edad` sigue en `double precision` (pregunta 2) ✅

Sin `DROP`. Anotado como deuda técnica en §5.

### 2.3 Las otras tres

- **4 — camino de staff**: fuera de este trabajo, como indicaste.
- **5 — turno 8 de R9**: ya consultado con Yesi. Dato, no código.
- **6 — los 13**: se avisan después del fix, por caballeriza. Y anotado: son 13 que **serían**
  rechazados, no 13 que intentaron.

---

## 3. Aplicación

Tres `apply_migration`, los tres `{"success":true}`:

| # | nombre | objeto |
|---|---|---|
| 1 | `fn_edad_reglamentaria_1_julio` | función nueva |
| 2 | `validar_inscripcion_usa_fn_edad_reglamentaria` | `CREATE OR REPLACE FUNCTION` |
| 3 | `v_inscriptos_carrera_edad_reglamentaria` | `CREATE OR REPLACE VIEW` |

### 3.1 Conteos PRE / POST

```json
PRE   {"utc":"2026-08-27 17:32:27","vista_PRE":249,"inscripciones_PRE":249,"spcs_PRE":181}
POST  {"utc":"2026-08-27 17:33:27","vista_POST":249,"inscripciones_POST":249,"spcs_POST":181,
       "fn_existe":1,"validar_overloads":1}
```

✅ **La vista no perdió filas: 249 → 249.** Los `LEFT JOIN` hicieron su trabajo.
✅ `validar_inscripcion` tiene **una sola** firma: no se generó overload.

### 3.2 Verificación directa de la función

```sql
SELECT fn_edad_reglamentaria('2026-09-20','2023-10-10') AS mosquita_esp_3,
       fn_edad_reglamentaria('2026-09-20','2022-11-10') AS abelito_esp_4,
       fn_edad_reglamentaria('2026-09-20','2023-07-07') AS amiguito_esp_3,
       fn_edad_reglamentaria('2026-06-20','2022-11-10') AS antes_1jul_esp_3,
       fn_edad_reglamentaria('2026-07-01','2022-11-10') AS el_1jul_esp_4,
       fn_edad_reglamentaria('2026-09-20','2027-03-01') AS futuro_esp_0,
       fn_edad_reglamentaria('2026-09-20', NULL)        AS nulo_esp_null;
```

```json
[{"mosquita_esp_3":3,"abelito_esp_4":4,"amiguito_esp_3":3,
  "antes_1jul_esp_3":3,"el_1jul_esp_4":4,"futuro_esp_0":0,"nulo_esp_null":null}]
```

Siete de siete.

---

## 4. Resultado completo del probe

```
$ set -a; . ./.env; set +a; node tests/probe_edad_reglamentaria.mjs
exit=0
```

### 4.1 Parte A — R8 contra el Stud Book

```
=== probe_edad_reglamentaria — R8, reunion del 2026-08-16 ===
Ratificados: 67 · fecha de referencia del fix: 2026-08-16

  C#  SPC                        NACIMIENTO   HOY  FIX   SB
  ──  ─────────────────────────  ──────────  ────  ───  ────
   1  ASTUTO NOTES               2022-10-13    3 *   4    4
   1  BACHUNA                    2022-11-24    3 *   4    4
   1  BENDITO PRESAGIO           2022-09-29    3 *   4    4
   1  BESO CURIOSO               2022-10-22    3 *   4    4
   1  DOCTOR SKY                 2022-10-25    3 *   4    4
   1  ELSEPTIMOESDECALDERA       2022-10-27    3 *   4    4
   1  LINDA MAIPUENSE            2022-09-30    3 *   4    4
   1  LOCA DUBAI                 2022-11-06    3 *   4    4
   1  TOUCH OF BLUE              2022-10-30    3 *   4    4
   1  WILSON SECURITY            2022-08-05    4     4    4
   2  CHE CARABANERA             2022-08-20    4     4    4
   2  DE BELLOSO                 2021-09-01    4 *   5    5
   2  IDALIA MARO                2021-10-15    4 *   5    5
   2  LA GRAN TEMPESTAD          2021-09-08    4 *   5    5
   2  LOGUACIOUS                 2021-10-23    4 *   5    5
   2  MARUKA PLUS                2021-10-20    4 *   5    5
   2  SANTA LISA                 2021-10-10    4 *   5    5
   3  ALIADO SCAT                2019-08-18    7     7    7
   3  BABY PARADISE              2019-10-08    6 *   7    7
   3  DESTINADO JOHAN            2020-09-07    5 *   6    6
   3  FLORENTINA IN YOU          2020-11-01    5 *   6    6
   3  GLAM METAL                 2020-07-09    6     6    6
   3  GRAND VUELTERA             2020-11-10    5 *   6    6
   3  GRILLADA RYE               2019-11-12    6 *   7    7
   3  INFILTRADO SLEW            2020-07-27    6     6    6
   3  LIVIA DRUSA                2020-09-16    5 *   6    6
   3  QUINIELA TREND             2018-09-23    7 *   8    8
   3  RECUERDAME IN YOU          2020-10-05    5 *   6    6
   3  TERRIBLE KING              2019-08-23    7     7    7
   4  AMIGUITO JESUS             2022-07-29    4     4    4
   4  CONI ROSE                  2021-10-15    4 *   5    5
   4  FALAYS                     2021-10-26    4 *   5    5
   4  IX GOAL TUN                2018-07-29    8     8    8
   4  LA LAGUNERA J              2022-10-10    3 *   4    4
   [... 67 filas en total ...]

  (*) = la edad cambia respecto del baseline

  resueltos en el Stud Book ...... 67/67
  FIX coincide con Stud Book ..... 67/67
  main coincidia con Stud Book ... 21/67
  filas cuya edad cambia ......... 46

  ✔ una fila por ratificado (67/67)
  ✔ todos resueltos en el Stud Book (sin dato: 0)
  ✔ la edad corregida coincide con el Stud Book en todas (difieren: 0)
  ✔ el baseline 42f9942 NO coincidia con el Stud Book en al menos una (coincidia en 21/67)
  ✔ la fecha de nacimiento de la base coincide con el Stud Book (difieren: 0)

  ✔ la edad depende de la fecha de la reunion, no de hoy (reimpresion estable)
     (si se usara "hoy" en vez de la fecha de reunion cambiarian 0 filas)
  ✔ edadSPC() no usa new Date() en su cuerpo
```

**67/67 contra el Stud Book, que es la fuente de verdad. Antes: 21/67.**

### 4.2 Condición de edad por carrera (R8)

```
  C 1  4..4 anios  (texto: "Todo caballo de 4 años perdedores")
       edades corregidas: 4   ok
       con las edades del baseline habrian figurado fuera: ASTUTO NOTES (3), BACHUNA (3),
       BENDITO PRESAGIO (3), BESO CURIOSO (3), DOCTOR SKY (3), ELSEPTIMOESDECALDERA (3),
       LINDA MAIPUENSE (3), LOCA DUBAI (3), TOUCH OF BLUE (3)
  C 2  4..5 anios  ok
  C 3  6..+ anios  ok   (baseline: DESTINADO JOHAN, FLORENTINA IN YOU, GRAND VUELTERA,
                         LIVIA DRUSA, RECUERDAME IN YOU habrían figurado fuera)
  C 4  4..+ anios  ok   (baseline: LA LAGUNERA J, NELIDA RIM)
  C 5  4..+ anios  ok
  C 6  5..+ anios  ok   (baseline: COLONIAL JOHAN, ES SABALERO, HEART OF GOLD,
                         REINA EDITION, REY DE PILA, TATA FOOT)
  C 7  4..4 anios  ok   (baseline: ABELITO MIMOSO, MAC VITAL, VISION SECURITY)
  C 8  6..+ anios  ok   (baseline: ECHO IN THE SKY, LE BATEAU, LE CHAT MIMOUS, SEÑOR MONCHI)

  ✔ todas las condiciones de edad interpretadas (no interpretables: 0)
  ✔ ningun ratificado fuera de la condicion de edad de su carrera (fuera: 0)
     con las edades del baseline habrian figurado 29 caballos fuera de condicion
```

Dato para dimensionar: **con las edades viejas, 29 de los 67 ratificados de R8 habrían figurado
fuera de la condición de su propia carrera.** Con el fix, cero. ABELITO MIMOSO aparece ahí, en
la C7 — el mismo caballo del reclamo original.

### 4.3 Parte B — el gate de la base

```
══ PARTE B — gate de la base (fn_edad_reglamentaria + validar_inscripcion) ══

  ✔ R9 tiene un turno de 3/3 (turno 1)
  ✔ R9 tiene un turno de 4/4 (turno 2)
  ✔ SPC de prueba presente en el padrón: MOSQUITA GARDEN
  ✔ SPC de prueba presente en el padrón: ABELITO MIMOSO
  ✔ SPC de prueba presente en el padrón: Amiguito Peligroso

── B1. fn_edad_reglamentaria(fecha_ref, fecha_nac) ──
  ✔ fn(2026-09-20, 2023-10-10) = 3 — MOSQUITA GARDEN — el aniversario real daría 2
  ✔ fn(2026-09-20, 2022-11-10) = 4 — ABELITO MIMOSO — el aniversario real daría 3
  ✔ fn(2026-09-20, 2023-07-07) = 3 — Amiguito Peligroso — ambas fórmulas coinciden
  ✔ fn(2026-09-20, 2023-06-28) = 3 — nacido 3 días ANTES del corte del año anterior
  ✔ fn(2026-06-20, 2022-11-10) = 3 — reunión ANTERIOR al 1° de julio: la resta sí aplica
  ✔ fn(2026-07-01, 2022-11-10) = 4 — el 1° de julio exacto: ya cumplió, no resta
  ✔ fn(2026-06-30, 2022-11-10) = 3 — el 30 de junio: todavía no cumplió, resta
  ✔ fn(2026-09-20, 2027-03-01) = 0 — nacido DESPUES de la reunión: clampea en 0
  ✔ fn(2026-06-20, 2026-05-01) = 0 — mismo año antes del 1/7: la resta daría -1, clampea
  ✔ fn(2026-09-20, NULL) = null — sin fecha de nacimiento
  ✔ fn(NULL, 2022-11-10) = null — sin fecha de referencia

── B2. la base y edad-spc.js coinciden ──
  ✔ fn_edad_reglamentaria coincide con edadSPC() en los 67 ratificados de R8 (divergen: 0)

── B3. validar_inscripcion — acepta y rechaza ──
  ✔ MOSQUITA GARDEN vs turno 1 (3/3): ACEPTA — ANTES DEL FIX RECHAZABA (falso negativo)
  ✔ ABELITO MIMOSO vs turno 1 (3/3): RECHAZA — ANTES DEL FIX ACEPTABA (falso positivo, el más grave)
  ✔ ABELITO MIMOSO vs turno 2 (4/4): ACEPTA — ANTES DEL FIX RECHAZABA
  ✔ Amiguito Peligroso vs turno 1 (3/3): ACEPTA — no-regresión

── B4. SPC sin fecha_nacimiento ──
     SPCs sin fecha_nacimiento en el padrón: 0
  ✔ fn_edad_reglamentaria devuelve NULL si falta la fecha de nacimiento
  ✔ no hay SPCs sin fecha_nacimiento en el padrón: el caso es teórico

──────────────────────────────────────────────────────────────────
GATE OK — 32/32 asserts
```

**Las dos direcciones verificadas contra producción.** El falso positivo —el más grave, un
caballo de 4 entrando a una carrera de 3— ahora rebota.

---

## 5. Deuda anotada

1. **`v_inscriptos_carrera.spc_edad` sigue en `double precision`.** El tipo correcto es
   `integer`. Se mantuvo para poder usar `CREATE OR REPLACE VIEW` sin `DROP` ni reposición
   manual de GRANTs, a once días del cierre y sobre una vista que hoy no usa nadie. Decisión
   tuya, registrada.
2. **`spcs.registro_stud_book` es nullable** (§1.3). Si la regla es que sin Stud Book no se
   corre, el schema no la sostiene.
3. **`usuarios.ultimo_login` no se puebla** (viene del informe anterior).
4. **El camino de staff sigue sin validar**: `inscripciones.html:716` inserta directo.

---

## 6. Estado del árbol

| rama | SHA | estado |
|---|---|---|
| `fix/edad-reglamentaria-unica` | `54ccbad` | pusheada, **NO mergeada** |
| `reports` | este commit | pusheada |
| `main` | `c531877` | **sin tocar** |

**No se mergeó a `main`**, como indicaste. Queda a la espera de tu OK ahora que viste el
resultado del probe.

⚠️ Ojo con esto: **la base ya tiene el fix aplicado, pero `main` no tiene el código.** Si otra
sesión levanta `main` y lo toma como fuente de verdad, va a ver el `AGE()` viejo en el
repositorio y el nuevo en producción. Conviene no dejar esa ventana abierta mucho tiempo.
