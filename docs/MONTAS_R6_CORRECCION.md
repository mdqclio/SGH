# Corrección de montas — R6 (20/06/2026, Hipódromo de Dolores)

**Fecha de ejecución:** 07/08/2026
**Branch:** `fix/montas-r6`
**Reunión:** R6 — `b02ca761-6f44-4720-86aa-a3c3099019ea` — 20/06/2026 — estado `publicada`
**Fuente:** planilla oficial de Yesi (la misma que les manda a los jockeys por mail) — **fuente autoritativa**
**Autorización:** Leo, 07/08/2026 (gate 1 y gate 2 aprobados en un solo OK)

---

## ⚠ NOTA OPERATIVA — LEER ANTES DE TOCAR PLATA DE R6

**Las liquidaciones de R6 quedan DESACTUALIZADAS respecto de las montas.**

Esta corrección cambió 32 montas pero **no** regeneró liquidaciones. Todo lo que
se deriva del jockey queda calculado sobre las montas viejas:

- incentivos por monta (jockey 50k/reunión, entrenador 10k/caballo)
- cualquier premio o retención asociada al jockey titular

**NO EMITIR RECIBOS NI PAGAR NADA DE R6** hasta la regeneración de liquidaciones,
prevista para el **lunes 10/08/2026**. Después de regenerar, borrar esta advertencia.

---

## 1. Alcance

Se tocó **una sola columna**: `inscripciones.jockey_titular_id`.

Fuera de alcance, sin modificar y verificado intacto:
posiciones, tiempos, dividendos (`resultado_posiciones` y `resultado_apuestas`
siguen con sus 81 filas originales — Yesi confirmó que están bien),
`jockey_suplente_id`, pesos, estados de inscripción, liquidaciones.

### Mapeo turno → carrera de programa

No es 1:1. La planilla numera por carrera de programa; la base ordena por turno:

| Carrera (planilla) | 1ª | 2ª | 3ª | 4ª | 5ª | 6ª | 7ª | 8ª |
|---|---|---|---|---|---|---|---|---|
| `numero_turno` | 1 | 2 | 3 | **8** | **11** | **6** | **9** | **5** |

Los turnos **4, 7 y 10** tienen `numero_carrera_programa` NULL: no corrieron y no
figuran en la planilla. Quedaron intactos (verificado: 0 filas modificadas).

Validación del mapeo: el conteo de ratificados coincide 1:1 con el conteo de
entradas de la planilla en las 8 carreras (10, 8, 7, 12, 6, 15, 13, 10).

---

## 2. Paso 1 — Cruce de jockeys contra `profesionales`

La planilla menciona **25 jockeys distintos**. Contra las 179 filas de
`profesionales`: **23 ya existían, 2 faltaban.**

De los 8 sospechados por Leo, **6 ya estaban en la base**:

| Sospechado | Realidad |
|---|---|
| IBARRA FERNANDO | Existe como `IBARRA FERNANDO AUGUSTO` (grafía más larga, mismo id `8f24be30…`, DOL, DNI 34749265) |
| ZAPICO DIEGO | Existe (`8abe11d7…`) |
| CAÑETE FACUNDO | Existe (`2a4a0c3f…`, DOL, DNI 43521065) |
| ACUÑA MATIAS | Existe (`0b2c6b27…`) |
| ACUÑA LUIS | Existe (`f67ec948…`) |
| GIULIANO BRUNO | Existe (`5c1d5e54…`) |

### Altas efectivas (2)

Verificadas con búsqueda amplia por regex sobre `apellido||nombre` en el padrón
entero, no sólo igualdad exacta:

| Alta | id asignado | Evidencia de ausencia |
|---|---|---|
| DE MAIO FACUNDO | `cef0b9b0-8456-4bed-9751-db0457483d27` | 0 filas con `maio` en todo el padrón. El único FACUNDO jockey era CAÑETE FACUNDO (persona distinta) |
| GONZALEZ JOSE | `3fc8f1fd-44be-417b-83ed-578d4f32be6a` | Hay GONZALEZ ADRIAN AGUSTIN (entrenador), GONZALEZ AGUSTIN y GONZALEZ LUCAS (jockeys). Ningún JOSE. OSUNA JOSE y PREBE JOSE son personas distintas |

Regla aplicada: la de la **tanda 2** (autorizada por Leo el 05/08) —
`club_id` = Dolores, `tipo` = `jockey`, `estado` `activo`, `activo` true,
`documento_nro` NULL (el DNI llega después por auto-registro),
`hipodromo_patente` NULL, idempotencia por `WHERE NOT EXISTS`.

**Migración:** `migrations/personas_montas_r6.sql` — ✅ aplicada por MCP
(`personas_montas_r6`).

**Verificación:** `profesionales` 179 → 181; 0 filas con `club_id` NULL;
0 duplicados de `(apellido, nombre)` en toda la tabla.

---

## 3. Paso 2 — Diff de montas

**81 ratificados** en las 8 carreras del programa:

| Categoría | Filas |
|---|---|
| Ya coincidían con el oficial | 38 |
| "XX" en la planilla (sin jockey en el oficial) | 11 |
| **Difieren → corregidas** | **32** |

Las 11 "XX" ya tenían `jockey_titular_id` NULL en la base: **no se tocaron**
(no había nada que borrar).

De las 32 corregidas: **17 altas de monta** (NULL → jockey) y
**15 reasignaciones** (jockey → otro jockey).

| Carrera | Ejemplar | Antes | Después |
|---|---|---|---|
| 1ª (t1) | MONADESEDA | ZAPICO DIEGO | DE MAIO FACUNDO |
| 1ª | GREAT ORPEN | DIESTRA PEDRO | DIESTRA BAUTISTA |
| 1ª | DOCTORA APASIONADA | DIESTRA PEDRO | IBARRA FERNANDO |
| 1ª | MOSQUITA GARDEN | *(vacío)* | GUZMAN CLAUDIO |
| 1ª | ARMOÑOZO | *(vacío)* | YALET IRINEO |
| 2ª (t2) | CALAVERIANDO | DIESTRA PEDRO | DIESTRA BAUTISTA |
| 2ª | BAM BAM HITS | *(vacío)* | ZAPICO DIEGO |
| 2ª | EL MEJOR DUQUE | *(vacío)* | YALET IRINEO |
| 2ª | ASTUTO NOTES | *(vacío)* | CONTRERAS JUAN CRUZ |
| 3ª (t3) | SIEMPREHAYESPERANZA | DIESTRA PEDRO | DIESTRA BAUTISTA |
| 3ª | SANTA LISA | *(vacío)* | GIL SANTINO |
| 3ª | LOCA DUBAI | DA SILVA RUBEN | MARCHANT JUAN |
| 4ª (t8) | LOCO FUN | CANTO TOBIAS | DE MAIO FACUNDO |
| 4ª | FLORENTINA IN YOU | OSUNA JOSE | ZAPICO DIEGO |
| 4ª | CRAZY RABID | *(vacío)* | GATICA DARIO |
| 4ª | MI ILUSION | *(vacío)* | GONZALEZ JOSE |
| 5ª (t11) | CHINITA SALTEÑA | *(vacío)* | IBARRA FERNANDO |
| 5ª | YUKINA | *(vacío)* | CAÑETE FACUNDO |
| 5ª | SIGO VIAJE | *(vacío)* | GATICA DARIO |
| 6ª (t6) | KUCCINI | *(vacío)* | GIL SANTINO |
| 6ª | PORTEÑO Y BAILARIN | DIESTRA PEDRO | DIESTRA BAUTISTA |
| 6ª | LUMIN | ROMAY ABEL I | CAÑETE FACUNDO |
| 6ª | TATA FOOT | AVENDAÑO MIGUEL A | YALET JORGE |
| 6ª | TIMBERA IN YOU | OSUNA JOSE | ZAPICO DIEGO |
| 6ª | CLAIRE CHUCK | *(vacío)* | DE MAIO FACUNDO |
| 7ª (t9) | AFRICUM | DIESTRA PEDRO | DE MAIO FACUNDO |
| 7ª | FURIA ENCANTADA | *(vacío)* | GIL SANTINO |
| 7ª | SEMBRADOR CHUCK | ZUBIRIA SANTIAGO | IBARRA FERNANDO |
| 7ª | SEÑOR MONCHI | ARREGUY FRANCISCO | YALET IRINEO |
| 7ª | BUEN DURAZNO | *(vacío)* | GATICA DARIO |
| 8ª (t5) | HEART OF GOLD | *(vacío)* | CANTO TOBIAS |
| 8ª | MAESTRO DE ARMAS | *(vacío)* | DELLI QUADRI IGNACIO |

Nota de grafía: `TALENTOSA CACH` de la planilla = `TALENTOSA CATCH` en la base
(mismo ejemplar; el jockey ya coincidía, sin UPDATE).

---

## 4. ⚠ DIESTRA PEDRO vs DIESTRA BAUTISTA — corrección de premisa

Son personas distintas. Tras la corrección, **DIESTRA PEDRO queda con 0 montas
ratificadas en R6** (sus 6 pasan a BAUTISTA ×4, IBARRA ×1, DE MAIO ×1).

La justificación dada al autorizar fue: *"BAUTISTA no existía en el sistema
cuando se cargó R6 — alta de esta semana, tanda 3 — así que todo cayó en PEDRO
por ser el único DIESTRA"*. **Verificado en base: esa premisa no se sostiene.**

| Hecho verificado | Dato |
|---|---|
| Alta de DIESTRA BAUTISTA | `created_at` = **2026-06-15**, mismo lote (mismo timestamp) que DIESTRA PEDRO, **5 días antes de R6** |
| BAUTISTA en la tanda 3 | No. La tanda 3 (06/08) agregó LOPEZ ALEXIS y MARCHANT JUAN |
| Inscripciones de R6 que ya tenían BAUTISTA antes de esta corrección | 3: QUIET GAUCHO (desde el **20/06**, día de la reunión), ZETA FOOT y DESDEN (22/07). Las 3 coinciden con el oficial |

O sea: el cargador **sí podía** elegir BAUTISTA, y de hecho lo eligió 3 veces.
**Los 5 cambios PEDRO → BAUTISTA se apoyan únicamente en la planilla oficial**,
que es fuente autoritativa y suficiente por sí sola. Pero el argumento
estructural que sostenía saltear la consulta a Yesi no aplica.
Queda anotado por si se quiere una confirmación extra.

### Qué correcciones sí tienen respaldo estructural

Sólo **7 de las 32** corresponden a jockeys que no existían en el padrón cuando
se cargó R6 (el bug de `club_id` del alta de profesionales, ISSUE-049):

| Jockey | Alta en `profesionales` | Montas corregidas |
|---|---|---|
| DE MAIO FACUNDO | 07/08/2026 (esta corrección) | 4 |
| GUZMAN CLAUDIO | 05/08/2026 (tanda 2) | 1 |
| MARCHANT JUAN | 06/08/2026 (tanda 3) | 1 |
| GONZALEZ JOSE | 07/08/2026 (esta corrección) | 1 |

Las otras **25 son puramente documentales**: el jockey ya existía el 20/06 y se
cargó otro. Consistente con el relato de Yesi de que los cambios del día de la
reunión no llegaron a entrar al sistema.

---

## 5. Paso 3 — Aplicación

**Migración:** `migrations/montas_r6_correccion.sql` — ✅ aplicada por MCP
(`montas_r6_correccion`), 32 UPDATEs en una sola transacción.

Cada UPDATE va por `WHERE id = <insc_id>` (una inscripción, nunca por nombre) con
guard sobre el valor previo (`IS NOT DISTINCT FROM <jockey_prev>` o `IS NULL`):
la sentencia es idempotente y no pisa un valor que haya cambiado entre la captura
del snapshot y la aplicación.

**Auditoría de valores previos:** `data/montas_r6_previo.json` — 32 filas con
`insc_id`, ejemplar, `jockey_titular_id` y `updated_at` anteriores. Sirve de
rollback directo.

---

## 6. Verificación post-aplicación

| Chequeo | Resultado |
|---|---|
| Filas con el jockey esperado | **32 / 32**, 0 mismatch |
| Ningún jockey monta 2 caballos en la misma carrera | ✅ 0 violaciones en las 8 carreras |
| Filas de R6 modificadas hoy | **32** exactas — ni una de más |
| Turnos 4, 7, 10 (no corrieron) | 0 filas tocadas |
| `resultado_posiciones` de R6 | 81 filas, intactas |
| Ratificados del programa | 81 = 70 con jockey + 11 XX sin jockey |
| DIESTRA PEDRO en R6 (ratificados) | 0 montas — resultado esperado |
| `profesionales` | 179 → 181, 0 sin `club_id`, 0 duplicados |

### Montas por jockey en R6 tras la corrección (70 montas)

| Jockey | Montas | | Jockey | Montas |
|---|---|---|---|---|
| CANTO TOBIAS | 7 | | ZAPICO DIEGO | 3 |
| DIESTRA BAUTISTA | 7 | | CAÑETE FACUNDO | 2 |
| GIL SANTINO | 6 | | D'ELIA THIAGO | 2 |
| IBARRA FERNANDO AUGUSTO | 6 | | ROJAS HERNAN | 2 |
| AGUIRRE HUGO | 4 | | TORRES ANIBAL | 2 |
| DE MAIO FACUNDO | 4 | | ACUÑA LUIS | 1 |
| DELLI QUADRI IGNACIO | 4 | | ACUÑA MATIAS | 1 |
| GATICA DARIO | 4 | | ALDECOA IVAN | 1 |
| YALET IRINEO | 4 | | CONTRERAS JUAN CRUZ | 1 |
| PRESA DANIEL | 3 | | GIULIANO BRUNO | 1 |
| | | | GONZALEZ JOSE | 1 |
| | | | GUZMAN CLAUDIO | 1 |
| | | | MARCHANT JUAN | 1 |
| | | | MARTINEZ AGUSTIN | 1 |
| | | | YALET JORGE | 1 |

---

## 7. Pendientes

1. **Regenerar liquidaciones de R6** — lunes 10/08/2026. Hasta entonces rige la
   advertencia del encabezado: no emitir recibos de R6.
2. DNI de DE MAIO FACUNDO y GONZALEZ JOSE — llegan por auto-registro (Gate 3).
3. Opcional: confirmar con Yesi los 5 cambios DIESTRA PEDRO → BAUTISTA (ver §4;
   la planilla ya los respalda, el argumento estructural no).
