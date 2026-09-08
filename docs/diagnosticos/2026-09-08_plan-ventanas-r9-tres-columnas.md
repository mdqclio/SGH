# PLAN — corregir por SQL las tres ventanas de R9

**Fecha:** 2026-09-08
**Estado:** **PLAN. NADA EJECUTADO.** Ni un `UPDATE`. La base sigue como está.
**Decisión:** lo corregimos nosotros por SQL. **No** se mergea todavía el fix de
`carta-llamados.html` y **no** se le pide a Yesi que corrija desde la pantalla.
**SHA de `main`:** `79821ae01a9b8e8768ae698b967462d00baa71a0`
**Rama con el `.sql`:** `fix/hora-ventanas-r9` — **pusheada, sin mergear** — `5ed5504c0701687e1b6d41d074012ae4da6eabdc`
**SHA de este informe:** ver §9.

**Base:**
`docs/diagnosticos/2026-09-08_plan-hora-cierre-r9.md` (§4, que acá se extiende a tres columnas) y
`docs/diagnosticos/2026-09-08_fix-carta-llamados-hora-local.md`.

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) FROM spcs;      -- por MCP, proyecto unlhcuanfrtpatoipwve
[{"spcs":181}]

ref del proyecto: unlhcuanfrtpatoipwve
```

---

## 0. Las dos respuestas que pediste antes de nada

### 0.1 `bolsa_total` — los once la tienen cargada. No hay problema latente.

```sql
SELECT c.numero_turno, c.bolsa_total FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9 ORDER BY c.numero_turno;
```

| T | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `bolsa_total` | 1054166.67 | 1016666.67 | 1118333.33 | 1000000.00 | 1166666.67 | 1083333.33 | 1191666.67 | 1191666.67 | 3333333.33 | 1833333.33 | 1833333.33 |

**Ninguna en `null`, ninguna en 0.** El bug del §5 del informe anterior (input vacío cuando la
bolsa es falsy → `saveRecord` manda `null` → viola el NOT NULL) **no puede dispararse en los once
turnos de R9**, ni ahora ni cuando alguien los edite. Sigue siendo un bug real para turnos con
bolsa 0, pero no toca este cambio ni queda como riesgo pendiente sobre R9.

### 0.2 El criterio de ratificación — encontré evidencia INDEPENDIENTE, no lo tuve que reconstruir

Pediste que avisara si algo contradecía la reconstrucción. **No la contradice: la confirma, y por
una vía que no depende del patrón de −3 h.**

`reuniones` tiene una columna `hora_cierre_ratificacion` de tipo **`time without time zone`**.
Al no llevar zona, **es inmune al bug**: lo que se cargó ahí es literalmente lo que se ve.

```sql
SELECT r.numero, r.numero_publico, r.fecha, r.estado, r.hora_cierre_ratificacion,
       pg_typeof(r.hora_cierre_ratificacion) AS tipo
FROM reuniones r WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c'
ORDER BY r.fecha DESC LIMIT 15;
```

| numero | pública | fecha | estado | **hora_cierre_ratificacion** | tipo |
|---|---|---|---|---|---|
| 9999 | — | 2099-01-01 | cancelada | **12:00:00** | time without time zone |
| 12 | 11 | 2026-12-27 | programada | **12:00:00** | time without time zone |
| 11 | 10 | 2026-11-22 | programada | **12:00:00** | time without time zone |
| 10 | 9 | 2026-10-11 | programada | **12:00:00** | time without time zone |
| **9** | **8** | **2026-09-20** | **publicada** | **12:00:00** | time without time zone |
| 8 | 7 | 2026-08-16 | finalizada | **12:00:00** | time without time zone |
| 7 | — | 2026-07-19 | cancelada | **12:00:00** | time without time zone |
| 6 | 6 | 2026-06-20 | borrador | **12:00:00** | time without time zone |
| 5 | 5 | 2026-05-17 | finalizada | **12:00:00** | time without time zone |
| 4 | 4 | 2026-04-19 | finalizada | **12:00:00** | time without time zone |
| 3 | 3 | 2026-03-22 | finalizada | **12:00:00** | time without time zone |
| 2 | 2 | 2026-02-08 | finalizada | **12:00:00** | time without time zone |
| 1 | 1 | 2026-01-18 | finalizada | **12:00:00** | time without time zone |

**Las trece reuniones de Dolores, `12:00:00`. R9 incluida.** El criterio de 12:00 para el cierre
de ratificación no es reconstrucción: está escrito en una columna que el bug nunca tocó, y es
consistente en todo el historial del club.

**Pero hay que separar las dos ventanas de ratificación, porque no tienen el mismo respaldo:**

| Valor propuesto | Respaldo |
|---|---|
| `cierre_ratificacion` = **14/09 12:00 AR** | **Independiente y fuerte.** `reuniones.hora_cierre_ratificacion = 12:00:00` en las 13 reuniones, columna sin zona |
| `cierre_inscripcion` = **11/09 12:00 AR** | Tu criterio del 26/08 (viernes 12:00) + el patrón de −3 h |
| `apertura_ratificacion` = **14/09 00:00 AR** | **Sólo el patrón de −3 h.** No existe una columna `hora_apertura_ratificacion`; no hay segunda fuente |

Lo digo explícito porque es la única de las tres que se apoya nada más que en la inferencia. Ver
el §3, que es donde deja de importar.

---

## 1. Snapshot previo — los once turnos, las cuatro columnas

Corrido recién (2026-09-08 02:00 UTC), para confirmar que nada cambió desde el relevamiento
anterior.

```sql
SELECT c.numero_turno, c.id,
       c.apertura_inscripcion  AS ap_insc_raw,
       c.apertura_inscripcion  AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ap_insc_ar,
       c.cierre_inscripcion    AS ci_insc_raw,
       c.cierre_inscripcion    AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ci_insc_ar,
       c.apertura_ratificacion AS ap_rat_raw,
       c.apertura_ratificacion AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ap_rat_ar,
       c.cierre_ratificacion   AS ci_rat_raw,
       c.cierre_ratificacion   AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ci_rat_ar,
       c.bolsa_total, c.estado
FROM reuniones r JOIN carreras c ON c.reunion_id = r.id
WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9
ORDER BY c.numero_turno;
```

**Los once idénticos en las cuatro ventanas**, salvo la apertura de inscripción de T1:

| T | id | ap_insc raw → AR | ci_insc raw → AR | ap_rat raw → AR | ci_rat raw → AR | estado |
|---|---|---|---|---|---|---|
| 1 | `c037b139-b8b5-46d7-900e-cbc7a01bd643` | `2026-08-24 00:00+00` → **23/08 21:00** | `2026-09-11 12:00+00` → **11/09 09:00** | `2026-09-14 00:00+00` → **13/09 21:00** | `2026-09-14 12:00+00` → **14/09 09:00** | abierta |
| 2 | `2d4016ad-460a-44c9-9b2d-d710a510edee` | `2026-08-28 00:00+00` → **27/08 21:00** | `2026-09-11 12:00+00` → **11/09 09:00** | `2026-09-14 00:00+00` → **13/09 21:00** | `2026-09-14 12:00+00` → **14/09 09:00** | abierta |
| 3 | `7250cda2-4b1b-40f5-80ed-54121745241b` | `2026-08-28 00:00+00` → **27/08 21:00** | `2026-09-11 12:00+00` → **11/09 09:00** | `2026-09-14 00:00+00` → **13/09 21:00** | `2026-09-14 12:00+00` → **14/09 09:00** | abierta |
| 4 | `fbf0de67-875f-4dbd-834c-60503d2d6f2f` | `2026-08-28 00:00+00` → **27/08 21:00** | `2026-09-11 12:00+00` → **11/09 09:00** | `2026-09-14 00:00+00` → **13/09 21:00** | `2026-09-14 12:00+00` → **14/09 09:00** | abierta |
| 5 | `9733113c-8c80-40eb-80b4-6f741abf125c` | `2026-08-28 00:00+00` → **27/08 21:00** | `2026-09-11 12:00+00` → **11/09 09:00** | `2026-09-14 00:00+00` → **13/09 21:00** | `2026-09-14 12:00+00` → **14/09 09:00** | abierta |
| 6 | `7da3fa1c-a32a-42dc-ad2f-6b10e86cba22` | `2026-08-28 00:00+00` → **27/08 21:00** | `2026-09-11 12:00+00` → **11/09 09:00** | `2026-09-14 00:00+00` → **13/09 21:00** | `2026-09-14 12:00+00` → **14/09 09:00** | abierta |
| 7 | `3b553ea4-1052-4411-933b-156e6676dfc0` | `2026-08-28 00:00+00` → **27/08 21:00** | `2026-09-11 12:00+00` → **11/09 09:00** | `2026-09-14 00:00+00` → **13/09 21:00** | `2026-09-14 12:00+00` → **14/09 09:00** | abierta |
| 8 | `bae8008f-87fc-479e-a416-27502c7489b3` | `2026-08-28 00:00+00` → **27/08 21:00** | `2026-09-11 12:00+00` → **11/09 09:00** | `2026-09-14 00:00+00` → **13/09 21:00** | `2026-09-14 12:00+00` → **14/09 09:00** | abierta |
| 9 | `5cd5d00e-c844-467d-925f-83b378863af5` | `2026-08-28 00:00+00` → **27/08 21:00** | `2026-09-11 12:00+00` → **11/09 09:00** | `2026-09-14 00:00+00` → **13/09 21:00** | `2026-09-14 12:00+00` → **14/09 09:00** | abierta |
| 10 | `099b050d-b7e5-412c-b789-55dae7d5cd13` | `2026-08-28 00:00+00` → **27/08 21:00** | `2026-09-11 12:00+00` → **11/09 09:00** | `2026-09-14 00:00+00` → **13/09 21:00** | `2026-09-14 12:00+00` → **14/09 09:00** | abierta |
| 11 | `0bf74c72-9300-4406-8949-d81705da0c23` | `2026-08-28 00:00+00` → **27/08 21:00** | `2026-09-11 12:00+00` → **11/09 09:00** | `2026-09-14 00:00+00` → **13/09 21:00** | `2026-09-14 12:00+00` → **14/09 09:00** | abierta |

**Nada cambió desde el relevamiento anterior.** El patrón de −3 h se ve limpio en las cuatro
columnas y en los once turnos.

Inscripciones, también sin cambios respecto del plan anterior: **3** (T1 ×2, T11 ×1), las tres
`inscripto`, ninguna `ratificado`.

---

## 2. Los valores a escribir

Sesión de la base y días de la semana, verificados:

```sql
SELECT current_setting('TimeZone') AS tz_sesion,
       to_char(DATE '2026-09-14','TMDay') AS dia_14_09,
       extract(isodow FROM DATE '2026-09-14') AS isodow_14,
       (TIMESTAMP '2026-09-11 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires') AS ci_insc_nuevo,
       (TIMESTAMP '2026-09-14 00:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires') AS ap_rat_nuevo,
       (TIMESTAMP '2026-09-14 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires') AS ci_rat_nuevo;
-- [{"tz_sesion":"UTC","dia_14_09":"Monday","isodow_14":"1",
--   "ci_insc_nuevo":"2026-09-11 15:00:00+00",
--   "ap_rat_nuevo":"2026-09-14 03:00:00+00",
--   "ci_rat_nuevo":"2026-09-14 15:00:00+00"}]
```

11/09 es **viernes** (verificado en el plan anterior, isodow 5); 14/09 es **lunes** (isodow 1).

| Columna | Ahora (crudo) | Ahora (AR) | **A escribir (crudo)** | **Se releerá (AR)** | Δ |
|---|---|---|---|---|---|
| `cierre_inscripcion` | `2026-09-11 12:00:00+00` | 11/09 09:00 | **`2026-09-11 15:00:00+00`** | **viernes 11/09 12:00** | +3 h |
| `apertura_ratificacion` | `2026-09-14 00:00:00+00` | 13/09 21:00 | **`2026-09-14 03:00:00+00`** | **lunes 14/09 00:00** | +3 h |
| `cierre_ratificacion` | `2026-09-14 12:00:00+00` | 14/09 09:00 | **`2026-09-14 15:00:00+00`** | **lunes 14/09 12:00** | +3 h |
| `apertura_inscripcion` | `2026-08-28 00:00:00+00` | 27/08 21:00 | **NO SE TOCA** | — | 0 |

**Los tres valores van con `AT TIME ZONE 'America/Argentina/Buenos_Aires'` explícito.** La sesión
está en UTC: un literal pelado `'2026-09-11 12:00:00'` se interpretaría como 12:00 UTC = 09:00 AR
y **reescribiría el mismo bug que estamos arreglando**. Argentina es UTC−3 todo el año, así que
el offset no depende de la fecha.

---

## 3. Qué depende de cada columna — y por qué eso cambia lo que está en juego

Barrido de dependencias de las columnas de ratificación (el de `cierre_inscripcion` está en el
§3 del plan anterior):

```sql
SELECT n.nspname||'.'||p.proname AS funcion FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind='f'
  AND pg_get_functiondef(p.oid) ILIKE '%_ratificacion%';
-- []

SELECT 'policy' AS clase, ... FROM pg_policies WHERE ... ILIKE '%_ratificacion%'
UNION ALL SELECT 'constraint', ... UNION ALL SELECT 'vista', ... UNION ALL SELECT 'trigger', ...;
-- [{"clase":"trigger","objeto":"carreras :: trg_audit_carreras"}]
```

Y del lado del código, contra `main`:

```
$ git grep -n "cierre_ratificacion\|apertura_ratificacion" main -- '*.html' '*.js'
main:carta-llamados.html:1113:  document.getElementById('f-ap-rat').value = rec?.apertura_ratificacion ? rec.apertura_ratificacion.slice(0,16) : '';
main:carta-llamados.html:1114:  document.getElementById('f-ci-rat').value = rec?.cierre_ratificacion ? rec.cierre_ratificacion.slice(0,16) : '';
main:carta-llamados.html:1166:    apertura_ratificacion: document.getElementById('f-ap-rat').value || null,
main:carta-llamados.html:1167:    cierre_ratificacion: document.getElementById('f-ci-rat').value || null,
main:ratificacion.html:512:    sb.from('reuniones').select('id,numero,...,hora_cierre_ratificacion,...')
main:ratificacion.html:554:  const [hh, mm] = (reunion.hora_cierre_ratificacion || '12:00:00').split(':').map(Number);
main:ratificacion.html:562:  const hora = (reunion.hora_cierre_ratificacion || '12:00:00').slice(0, 5);
main:reuniones.html:389:  document.getElementById('f-hora-cierre-rat').value = rec?.hora_cierre_ratificacion ? ...
main:reuniones.html:431:    hora_cierre_ratificacion: document.getElementById('f-hora-cierre-rat').value || null,
```

**Hallazgo: `carreras.apertura_ratificacion` y `carreras.cierre_ratificacion` son columnas de
sólo escritura.** El único código que las toca es el propio modal de `carta-llamados.html`, que
las escribe y las vuelve a leer. **Nada las consume**:

- `ratificacion.html` —la pantalla que efectivamente cierra la ratificación— **no las mira**:
  se gobierna con `reuniones.hora_cierre_ratificacion`, la columna `time` del §0.2.
- Cero funciones, cero policies, cero constraints, cero vistas.
- El único trigger de `carreras` es el de auditoría.

Consecuencia para este cambio:

| Columna | ¿Quién la lee? | Qué está en juego |
|---|---|---|
| `cierre_inscripcion` | `rpc_inscribir`, `rpc_baja_inscripcion` (SECURITY DEFINER) y `ventanaAbierta()` del portal | **Es la que importa.** Gobierna quién puede anotarse y hasta cuándo. Con fecha: viernes 11/09 |
| `apertura_ratificacion` | **nadie** | higiene de datos |
| `cierre_ratificacion` | **nadie** | higiene de datos |

Esto no cambia el plan, pero sí el riesgo: **la única de las tres que puede romper algo si sale
mal es `cierre_inscripcion`**, y se mueve hacia adelante, o sea que sólo ensancha la ventana. Y
la reconstrucción de `apertura_ratificacion` —la única sin segunda fuente (§0.2)— resulta ser
también **la de menor consecuencia**, porque ningún código la lee. Si estuviera errada, no
rompería nada; quedaría un dato feo hasta que alguien lo corrija.

---

## 4. El UPDATE

**NO EJECUTADO.** El archivo versionado está en `migrations/fix_ventanas_r9_hora_argentina.sql`,
rama `fix/hora-ventanas-r9`.

```sql
UPDATE carreras c
SET cierre_inscripcion    = TIMESTAMP '2026-09-11 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires',
    apertura_ratificacion = TIMESTAMP '2026-09-14 00:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires',
    cierre_ratificacion   = TIMESTAMP '2026-09-14 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires'
FROM reuniones r
WHERE c.reunion_id = r.id
  AND r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'   -- Dolores
  AND r.numero  = 9                                        -- SOLO R9
  AND c.cierre_inscripcion    = TIMESTAMPTZ '2026-09-11 12:00:00+00'
  AND c.apertura_ratificacion = TIMESTAMPTZ '2026-09-14 00:00:00+00'
  AND c.cierre_ratificacion   = TIMESTAMPTZ '2026-09-14 12:00:00+00'
RETURNING c.numero_turno,
          c.cierre_inscripcion    AS ci_insc_raw,
          c.cierre_inscripcion    AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ci_insc_ar,
          c.apertura_ratificacion AS ap_rat_raw,
          c.apertura_ratificacion AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ap_rat_ar,
          c.cierre_ratificacion   AS ci_rat_raw,
          c.cierre_ratificacion   AT TIME ZONE 'America/Argentina/Buenos_Aires' AS ci_rat_ar;
```

Una sola sentencia, `RETURNING` de las tres columnas en crudo y en AR. Los acotes:

| Predicado | Para qué |
|---|---|
| `r.numero = 9` + `c.reunion_id = r.id` | sólo los turnos de R9 |
| `r.club_id = '0649e9c5-…'` | sólo Dolores — `numero = 9` no es único entre clubes |
| las tres igualdades por valor actual | **idempotencia**: las tres columnas tienen que estar en su valor viejo. Si alguna ya fue tocada, **la fila entera queda afuera en vez de pisarse**. Correrlo dos veces toca 0 filas: no vuelve a correr las horas |
| `SET` de tres columnas | `apertura_inscripcion` no aparece ni en el `SET` ni en el `WHERE` |

**Esperado: exactamente 11 filas.** Si devuelve otro número → **parar y avisar**, algo cambió.

---

## 5. Verificaciones

**5.1 — Las tres columnas en AR + los invariantes.** Esperado: 11 filas, los cuatro booleanos en
`true` en todas.

```sql
SELECT c.numero_turno,
       to_char(c.cierre_inscripcion    AT TIME ZONE 'America/Argentina/Buenos_Aires','TMDay DD/MM HH24:MI') AS ci_insc_ar,
       to_char(c.apertura_ratificacion AT TIME ZONE 'America/Argentina/Buenos_Aires','TMDay DD/MM HH24:MI') AS ap_rat_ar,
       to_char(c.cierre_ratificacion   AT TIME ZONE 'America/Argentina/Buenos_Aires','TMDay DD/MM HH24:MI') AS ci_rat_ar,
       (c.cierre_inscripcion    AT TIME ZONE 'America/Argentina/Buenos_Aires') = TIMESTAMP '2026-09-11 12:00:00' AS ok_ci_insc,
       (c.apertura_ratificacion AT TIME ZONE 'America/Argentina/Buenos_Aires') = TIMESTAMP '2026-09-14 00:00:00' AS ok_ap_rat,
       (c.cierre_ratificacion   AT TIME ZONE 'America/Argentina/Buenos_Aires') = TIMESTAMP '2026-09-14 12:00:00' AS ok_ci_rat,
       c.cierre_inscripcion < c.apertura_ratificacion AS cierre_antes_de_ratificacion
FROM reuniones r JOIN carreras c ON c.reunion_id = r.id
WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9
ORDER BY c.numero_turno;
```

Esperado en las once: `Friday 11/09 12:00`, `Monday 14/09 00:00`, `Monday 14/09 12:00`.
`cierre_antes_de_ratificacion` en `true` — el cierre queda 2 días 12 h antes de la apertura de
ratificación.

**5.2 — `apertura_inscripcion` intacta.** Esperado: **0**.

```sql
SELECT count(*) AS aperturas_de_inscripcion_movidas
FROM reuniones r JOIN carreras c ON c.reunion_id = r.id
WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9
  AND c.apertura_inscripcion NOT IN (TIMESTAMPTZ '2026-08-24 00:00:00+00',
                                     TIMESTAMPTZ '2026-08-28 00:00:00+00');
```

**5.3 — Nada tocado fuera de R9 ni de Dolores.** Esperado: **0**.

```sql
SELECT count(*) AS filas_con_valores_nuevos_fuera_de_r9
FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
WHERE (c.cierre_inscripcion    = TIMESTAMPTZ '2026-09-11 15:00:00+00'
    OR c.apertura_ratificacion = TIMESTAMPTZ '2026-09-14 03:00:00+00'
    OR c.cierre_ratificacion   = TIMESTAMPTZ '2026-09-14 15:00:00+00')
  AND NOT (r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9);
```

**5.4 — Auditoría.** Esperado: **11**. El trigger `trg_audit_carreras` es `AFTER UPDATE FOR EACH
ROW`, así que deja una entrada por turno.

```sql
SELECT count(*) AS entradas, min(created_at) AS desde, max(created_at) AS hasta
FROM auditoria WHERE tabla='carreras' AND accion='UPDATE'
  AND created_at > now() - interval '5 minutes';
```

**5.5 — Las 3 inscripciones intactas.** Esperado: **3**, las tres `inscripto`. El `UPDATE` no
toca la tabla `inscripciones`, y el cierre se mueve **hacia adelante**, así que la ventana sólo
se ensancha.

```sql
SELECT count(*) AS inscripciones, count(*) FILTER (WHERE i.estado='inscripto') AS inscripto
FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
JOIN inscripciones i ON i.carrera_id=c.id
WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9;
```

---

## 6. Rollback

Simétrico, mismos cuatro acotes, con los valores exactos del snapshot del §1 —que son idénticos
en los once turnos, así que el rollback es exacto y no necesita tabla auxiliar.

```sql
UPDATE carreras c
SET cierre_inscripcion    = TIMESTAMPTZ '2026-09-11 12:00:00+00',
    apertura_ratificacion = TIMESTAMPTZ '2026-09-14 00:00:00+00',
    cierre_ratificacion   = TIMESTAMPTZ '2026-09-14 12:00:00+00'
FROM reuniones r
WHERE c.reunion_id = r.id
  AND r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND r.numero  = 9
  AND c.cierre_inscripcion    = TIMESTAMPTZ '2026-09-11 15:00:00+00'
  AND c.apertura_ratificacion = TIMESTAMPTZ '2026-09-14 03:00:00+00'
  AND c.cierre_ratificacion   = TIMESTAMPTZ '2026-09-14 15:00:00+00'
RETURNING c.numero_turno, c.cierre_inscripcion, c.apertura_ratificacion, c.cierre_ratificacion;
```

Esperado: 11 filas, de vuelta en los valores viejos. **Devuelve la base al bug**, no a un estado
neutro: sirve si el `UPDATE` sale mal, no como "deshacer" después de que alguien ya vio el
cambio.

---

## 7. El `.sql` y la secuencia de ejecución

**Archivo:** `migrations/fix_ventanas_r9_hora_argentina.sql` (167 líneas), con snapshot, `UPDATE`,
las cinco verificaciones, el rollback (comentado, para que no se corra por accidente) y la
verificación del lado del usuario.

**Rama:** `fix/hora-ventanas-r9`, pusheada, **sin mergear**. No fue a `main`.

Es **DML, no DDL**: se corre con `execute_sql`, **no** con `apply_migration`. Vive en
`migrations/` igual, para que quede el rastro de qué se ejecutó — como pediste.

### Secuencia, cuando des el OK

1. Re-correr el snapshot del §1 y guardar la salida (el estado puede cambiar entre este plan y
   el OK).
2. `UPDATE` del §4. **Verificar que devuelve exactamente 11 filas. Si no, parar.**
3. Las cinco verificaciones del §5.
4. **Verificación del lado del usuario:** abrir el llamado abierto del portal
   (`https://sigh.com.ar/portal.html`) y confirmar que el chip de los once turnos dice
   **`⏳ cierra 11/9 12:00 hs`**. Es la prueba de punta a punta, y usa el `fechaHora()` en 24 h
   mergeado hoy (merge `1676bf7`). Si dijera `09:00`, el `UPDATE` no llegó; si dijera
   `12:00 a. m.`, el que no llegó es el fix de formato.
5. Informe con la salida cruda de todo, en `reports`.

**Ventana:** hoy es 08/09 23:00 AR. El cierre viejo es el **viernes 11/09 09:00 AR**. Quedan
~3 días.

---

## 8. Fuera de alcance — respetado

| | |
|---|---|
| `fix/carta-llamados-hora-local` | **NO mergeado.** Sigue en `71a5995`, esperando su turno |
| `apertura_inscripcion` | no aparece en el `SET` ni en el `WHERE` del `UPDATE`. Verificación 5.2 |
| Otras reuniones | el `UPDATE` está acotado por `r.numero = 9`; verificación 5.3 |
| Otros clubes | acotado por `r.club_id`; verificación 5.3 |
| `main` | intacto en `79821ae` |
| Ejecución | **cero.** Ni un `UPDATE`, ni una transacción con `ROLLBACK`. Todo lo corrido fue `SELECT` |

---

## 9. Preguntas abiertas

1. **`apertura_ratificacion` = 00:00 AR es la única sin segunda fuente** (§0.2). Se apoya sólo en
   el patrón de −3 h. Atenuante: ningún código la lee (§3), así que si estuviera errada no
   rompería nada. ¿La incluyo igual o la dejo afuera y quedan sólo dos columnas?
2. **El mismo bug afecta a las reuniones 10, 11 y 12** (`programada`, fechas 11/10, 22/11 y
   27/12), que ya tienen ventanas cargadas por la misma pantalla. No las toqué —el alcance era
   R9— pero van a tener el mismo corrimiento. ¿Las barro y las corrijo en la misma tanda, o las
   dejo para después de mergear el fix de la UI y que se carguen bien de entrada?
3. **La carta de llamados ya impresa.** Si se repartió en papel con 09:00, el papel y la base van
   a decir cosas distintas. No lo puedo verificar desde acá.
4. **Los tres ya anotados** (Fabio Castro ×2, Fede Iguacel ×1) no se perjudican: sólo ganan tres
   horas. Pero cargaron con el cierre viejo a la vista. ¿Se les avisa?
5. **`bolsa_total` de 0 bloquea el guardado desde la pantalla** (§5 del informe anterior). No
   afecta a R9 (§0.1), pero sigue abierto como bug: ¿entra en la rama del fix de
   `carta-llamados.html` o va aparte?

---

## 10. Verificación en `origin`

```
$ git ls-remote origin fix/hora-ventanas-r9      # el .sql, sin mergear
5ed5504c0701687e1b6d41d074012ae4da6eabdc	refs/heads/fix/hora-ventanas-r9

$ git ls-remote origin fix/carta-llamados-hora-local   # el fix de la UI, sin mergear
71a5995a796f4e2c5234dab8e47713c9cba075c0	refs/heads/fix/carta-llamados-hora-local

$ git ls-remote origin main                       # intacto
79821ae01a9b8e8768ae698b967462d00baa71a0	refs/heads/main

$ git diff --stat origin/main..origin/fix/hora-ventanas-r9
 migrations/fix_ventanas_r9_hora_argentina.sql | 167 ++++++++++++++++++++++++++
 1 file changed, 167 insertions(+)
```

**`main` sigue en `79821ae`. Las dos ramas `fix/` están pusheadas y ninguna mergeada.**
**Nada se ejecutó contra la base: los once turnos siguen con las ventanas corridas −3 h.**

### 10.1 SHA final

```
$ git ls-remote origin reports
c91512c2a654df2cea28c8a0ba3f39197e01e995	refs/heads/reports
$ git rev-parse HEAD
c91512c2a654df2cea28c8a0ba3f39197e01e995
$ git ls-remote origin fix/hora-ventanas-r9
5ed5504c0701687e1b6d41d074012ae4da6eabdc	refs/heads/fix/hora-ventanas-r9
$ git ls-remote origin fix/carta-llamados-hora-local
71a5995a796f4e2c5234dab8e47713c9cba075c0	refs/heads/fix/carta-llamados-hora-local
$ git ls-remote origin main
79821ae01a9b8e8768ae698b967462d00baa71a0	refs/heads/main
```

Los cuatro refs verificados en `origin`.
