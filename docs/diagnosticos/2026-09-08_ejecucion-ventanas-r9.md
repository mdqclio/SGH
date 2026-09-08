# EJECUTADO — las tres ventanas de R9 corregidas

**Fecha:** 2026-09-08, ~02:10 UTC (23:10 AR del 07/09)
**Estado:** ✅ **EJECUTADO Y VERIFICADO.** 11 filas, todas las verificaciones en verde.
**Autorización:** el usuario, tras leer
`docs/diagnosticos/2026-09-08_plan-ventanas-r9-tres-columnas.md`.
**SQL:** `migrations/fix_ventanas_r9_hora_argentina.sql`, rama `fix/hora-ventanas-r9` (`5ed5504`).
**SHA de `main`:** `776a17b8423e184994a5db7e6836eaab85cc98ea` (sube ISSUE-074).
**SHA de este informe:** ver §8.

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) FROM spcs;      -- por MCP, proyecto unlhcuanfrtpatoipwve
[{"spcs":181}]

ref del proyecto: unlhcuanfrtpatoipwve
```

## Resumen

| | |
|---|---|
| Filas tocadas | **11** — exactamente los once turnos de R9 |
| Columnas | 3 (`cierre_inscripcion`, `apertura_ratificacion`, `cierre_ratificacion`) |
| `apertura_inscripcion` | **intacta**, verificado |
| Verificaciones | **5/5 en verde** + idempotencia + punta a punta |
| Entradas de auditoría | 11 |
| Inscripciones | 3, intactas |
| Rollback | no hizo falta |
| Chip del portal | **`cierra 11/9 12:00 hs`** en los once |

---

## 1. Snapshot inmediatamente previo

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

11 filas. **Idéntico al del plan**, sin una sola diferencia:

| T | id | ap_insc AR | ci_insc AR | ap_rat AR | ci_rat AR | bolsa | estado |
|---|---|---|---|---|---|---|---|
| 1 | `c037b139-…bd643` | 23/08 21:00 | **11/09 09:00** | **13/09 21:00** | **14/09 09:00** | 1054166.67 | abierta |
| 2 | `2d4016ad-…0edee` | 27/08 21:00 | **11/09 09:00** | **13/09 21:00** | **14/09 09:00** | 1016666.67 | abierta |
| 3 | `7250cda2-…5241b` | 27/08 21:00 | **11/09 09:00** | **13/09 21:00** | **14/09 09:00** | 1118333.33 | abierta |
| 4 | `fbf0de67-…52f2f` | 27/08 21:00 | **11/09 09:00** | **13/09 21:00** | **14/09 09:00** | 1000000.00 | abierta |
| 5 | `9733113c-…125c` | 27/08 21:00 | **11/09 09:00** | **13/09 21:00** | **14/09 09:00** | 1166666.67 | abierta |
| 6 | `7da3fa1c-…cba22` | 27/08 21:00 | **11/09 09:00** | **13/09 21:00** | **14/09 09:00** | 1083333.33 | abierta |
| 7 | `3b553ea4-…76dfc0` | 27/08 21:00 | **11/09 09:00** | **13/09 21:00** | **14/09 09:00** | 1191666.67 | abierta |
| 8 | `bae8008f-…7489b3` | 27/08 21:00 | **11/09 09:00** | **13/09 21:00** | **14/09 09:00** | 1191666.67 | abierta |
| 9 | `5cd5d00e-…863af5` | 27/08 21:00 | **11/09 09:00** | **13/09 21:00** | **14/09 09:00** | 3333333.33 | abierta |
| 10 | `099b050d-…d5cd13` | 27/08 21:00 | **11/09 09:00** | **13/09 21:00** | **14/09 09:00** | 1833333.33 | abierta |
| 11 | `0bf74c72-…5da0c23` | 27/08 21:00 | **11/09 09:00** | **13/09 21:00** | **14/09 09:00** | 1833333.33 | abierta |

Crudos, idénticos en los once: `ci_insc = 2026-09-11 12:00:00+00`,
`ap_rat = 2026-09-14 00:00:00+00`, `ci_rat = 2026-09-14 12:00:00+00`.
`ap_insc = 2026-08-28 00:00:00+00` salvo T1, que es `2026-08-24 00:00:00+00`.

---

## 2. El UPDATE

```sql
UPDATE carreras c
SET cierre_inscripcion    = TIMESTAMP '2026-09-11 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires',
    apertura_ratificacion = TIMESTAMP '2026-09-14 00:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires',
    cierre_ratificacion   = TIMESTAMP '2026-09-14 12:00:00' AT TIME ZONE 'America/Argentina/Buenos_Aires'
FROM reuniones r
WHERE c.reunion_id = r.id
  AND r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND r.numero  = 9
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

### Salida cruda del RETURNING

**11 filas** — turnos `1, 4, 5, 6, 7, 11, 10, 9, 8, 2, 3` (el orden lo da el planner, no hay
`ORDER BY` en un `UPDATE ... RETURNING`). Los once son los once.

Las once filas devolvieron **exactamente los mismos valores**:

```
ci_insc_raw : 2026-09-11 15:00:00+00     ci_insc_ar : 2026-09-11 12:00:00
ap_rat_raw  : 2026-09-14 03:00:00+00     ap_rat_ar  : 2026-09-14 00:00:00
ci_rat_raw  : 2026-09-14 15:00:00+00     ci_rat_ar  : 2026-09-14 12:00:00
```

| turno | ci_insc_raw | ci_insc_ar | ap_rat_raw | ap_rat_ar | ci_rat_raw | ci_rat_ar |
|---|---|---|---|---|---|---|
| 1 | 2026-09-11 15:00:00+00 | 2026-09-11 12:00:00 | 2026-09-14 03:00:00+00 | 2026-09-14 00:00:00 | 2026-09-14 15:00:00+00 | 2026-09-14 12:00:00 |
| 4 | 2026-09-11 15:00:00+00 | 2026-09-11 12:00:00 | 2026-09-14 03:00:00+00 | 2026-09-14 00:00:00 | 2026-09-14 15:00:00+00 | 2026-09-14 12:00:00 |
| 5 | 2026-09-11 15:00:00+00 | 2026-09-11 12:00:00 | 2026-09-14 03:00:00+00 | 2026-09-14 00:00:00 | 2026-09-14 15:00:00+00 | 2026-09-14 12:00:00 |
| 6 | 2026-09-11 15:00:00+00 | 2026-09-11 12:00:00 | 2026-09-14 03:00:00+00 | 2026-09-14 00:00:00 | 2026-09-14 15:00:00+00 | 2026-09-14 12:00:00 |
| 7 | 2026-09-11 15:00:00+00 | 2026-09-11 12:00:00 | 2026-09-14 03:00:00+00 | 2026-09-14 00:00:00 | 2026-09-14 15:00:00+00 | 2026-09-14 12:00:00 |
| 11 | 2026-09-11 15:00:00+00 | 2026-09-11 12:00:00 | 2026-09-14 03:00:00+00 | 2026-09-14 00:00:00 | 2026-09-14 15:00:00+00 | 2026-09-14 12:00:00 |
| 10 | 2026-09-11 15:00:00+00 | 2026-09-11 12:00:00 | 2026-09-14 03:00:00+00 | 2026-09-14 00:00:00 | 2026-09-14 15:00:00+00 | 2026-09-14 12:00:00 |
| 9 | 2026-09-11 15:00:00+00 | 2026-09-11 12:00:00 | 2026-09-14 03:00:00+00 | 2026-09-14 00:00:00 | 2026-09-14 15:00:00+00 | 2026-09-14 12:00:00 |
| 8 | 2026-09-11 15:00:00+00 | 2026-09-11 12:00:00 | 2026-09-14 03:00:00+00 | 2026-09-14 00:00:00 | 2026-09-14 15:00:00+00 | 2026-09-14 12:00:00 |
| 2 | 2026-09-11 15:00:00+00 | 2026-09-11 12:00:00 | 2026-09-14 03:00:00+00 | 2026-09-14 00:00:00 | 2026-09-14 15:00:00+00 | 2026-09-14 12:00:00 |
| 3 | 2026-09-11 15:00:00+00 | 2026-09-11 12:00:00 | 2026-09-14 03:00:00+00 | 2026-09-14 00:00:00 | 2026-09-14 15:00:00+00 | 2026-09-14 12:00:00 |

**11 filas exactas. No hizo falta parar.**

---

## 3. Verificaciones

### 3.1 — Las tres columnas en AR + los invariantes

```sql
SELECT c.numero_turno,
       to_char(c.cierre_inscripcion    AT TIME ZONE 'America/Argentina/Buenos_Aires','TMDay DD/MM HH24:MI') AS ci_insc_ar,
       to_char(c.apertura_ratificacion AT TIME ZONE 'America/Argentina/Buenos_Aires','TMDay DD/MM HH24:MI') AS ap_rat_ar,
       to_char(c.cierre_ratificacion   AT TIME ZONE 'America/Argentina/Buenos_Aires','TMDay DD/MM HH24:MI') AS ci_rat_ar,
       (c.cierre_inscripcion    AT TIME ZONE 'America/Argentina/Buenos_Aires') = TIMESTAMP '2026-09-11 12:00:00' AS ok_ci_insc,
       (c.apertura_ratificacion AT TIME ZONE 'America/Argentina/Buenos_Aires') = TIMESTAMP '2026-09-14 00:00:00' AS ok_ap_rat,
       (c.cierre_ratificacion   AT TIME ZONE 'America/Argentina/Buenos_Aires') = TIMESTAMP '2026-09-14 12:00:00' AS ok_ci_rat,
       c.cierre_inscripcion < c.apertura_ratificacion AS cierre_antes_de_ratificacion,
       c.apertura_inscripcion < c.cierre_inscripcion  AS ventana_coherente,
       c.cierre_inscripcion > now() AS todavia_abierta
FROM reuniones r JOIN carreras c ON c.reunion_id = r.id
WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9
ORDER BY c.numero_turno;
```

**11 filas, todas idénticas:**

| turno | ci_insc_ar | ap_rat_ar | ci_rat_ar | ok_ci_insc | ok_ap_rat | ok_ci_rat | cierre<ratif | ventana ok | abierta |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Friday 11/09 12:00** | **Monday 14/09 00:00** | **Monday 14/09 12:00** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 3 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 4 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 5 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 6 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 7 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 8 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 9 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 10 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 11 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Viernes y lunes**, como corresponde. Los seis booleanos en `true` en los once.

### 3.2 a 3.5 — Los cuatro controles restantes

```sql
SELECT
  (SELECT count(*) FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
    WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9
      AND c.apertura_inscripcion NOT IN (TIMESTAMPTZ '2026-08-24 00:00:00+00',
                                         TIMESTAMPTZ '2026-08-28 00:00:00+00')
  ) AS v52_aperturas_de_inscripcion_movidas,
  (SELECT count(*) FROM carreras c JOIN reuniones r ON r.id=c.reunion_id
    WHERE (c.cierre_inscripcion    = TIMESTAMPTZ '2026-09-11 15:00:00+00'
        OR c.apertura_ratificacion = TIMESTAMPTZ '2026-09-14 03:00:00+00'
        OR c.cierre_ratificacion   = TIMESTAMPTZ '2026-09-14 15:00:00+00')
      AND NOT (r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9)
  ) AS v53_filas_nuevas_fuera_de_r9,
  (SELECT count(*) FROM auditoria
    WHERE tabla='carreras' AND accion='UPDATE' AND created_at > now() - interval '5 minutes'
  ) AS v54_entradas_auditoria,
  (SELECT count(*) FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
     JOIN inscripciones i ON i.carrera_id=c.id
    WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9
  ) AS v55_inscripciones,
  (SELECT count(*) FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
     JOIN inscripciones i ON i.carrera_id=c.id
    WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9 AND i.estado='inscripto'
  ) AS v55_inscripto;
```

```json
[{"v52_aperturas_de_inscripcion_movidas":0,
  "v53_filas_nuevas_fuera_de_r9":0,
  "v54_entradas_auditoria":11,
  "v55_inscripciones":3,
  "v55_inscripto":3}]
```

| Verificación | Esperado | Obtenido | |
|---|---|---|---|
| 3.2 · `apertura_inscripcion` movida | 0 | **0** | ✅ intacta |
| 3.3 · filas con valores nuevos fuera de R9 / de Dolores | 0 | **0** | ✅ nada colateral |
| 3.4 · entradas de auditoría del UPDATE | 11 | **11** | ✅ una por turno |
| 3.5 · inscripciones (y en estado `inscripto`) | 3 / 3 | **3 / 3** | ✅ intactas |

### 3.6 — Idempotencia, comprobada en caliente

Se volvió a correr **el mismo UPDATE, textual**:

```
RETURNING → []      (0 filas)
```

**0 filas.** El predicado de idempotencia funciona: correrlo dos veces no vuelve a correr las
horas otras +3 h. El `.sql` se puede re-ejecutar sin miedo.

---

## 4. Verificación de punta a punta — el chip del portal

No alcanza con la base: había que ver qué le llega al entrenador. Se bajó el `portal.html` que
**sirve producción** y se corrió su `loadLlamado()` **real** contra la base de producción.

```
$ curl -sL https://sigh.com.ar/portal.html -o portal.html
MD5 servido: 526d1bf4cd403b9a2f689e3a521afc85
MD5 main:    526d1bf4cd403b9a2f689e3a521afc85     ← idénticos
```

Script (solo lectura, mismo patrón de harness que los probes: se extraen `esc`, `formatARS`,
`fechaHora`, `textoEdad`, `textoCondicion`, `ventanaAbierta` y `loadLlamado` del HTML servido y
se los corre con `new AsyncFunction` y un mini-DOM):

```
$ node check.mjs
reunión pública 8 (interna 9) encontrada en el llamado: true
turnos renderizados: 1,2,3,4,5,6,7,8,9,10,11 (11)
chips de cierre distintos: [ 'cierra 11/9 12:00 hs' ]
total chips de cierre: 11
TODOS dicen "cierra 11/9 12:00 hs": true
ningún "a. m.": true
ningún "hs" duplicado: true
```

**Los once turnos muestran `⏳ cierra 11/9 12:00 hs`.** Un solo valor distinto en el set: no hay
un turno que se haya quedado atrás.

Esto valida las **dos** cosas a la vez:
- el `UPDATE` de hoy — dice **12:00**, no 09:00;
- el fix de formato de esta mañana (merge `1676bf7`) — dice **`12:00 hs`**, no `12:00 a. m. hs`.

---

## 5. Lo que NO se tocó

| | |
|---|---|
| `apertura_inscripcion` | intacta. Verificación 3.2 en 0 |
| Otras reuniones (10, 11, 12) | intactas. Verificación 3.3 en 0 |
| Otros clubes | intactos. Verificación 3.3 en 0 |
| Las 3 inscripciones | intactas, las tres `inscripto`. Verificación 3.5 |
| `fix/carta-llamados-hora-local` | **sin mergear**, sigue en `71a5995` esperando su turno |
| `fix/hora-ventanas-r9` | sin mergear, `5ed5504` — es sólo el `.sql` versionado |
| Rollback | **no se corrió.** No hizo falta |

---

## 6. ISSUE-074 anotado

Como pediste, el hallazgo del §3 del plan quedó escrito en `docs/ISSUES.md`, en `main`
(`776a17b`):

> **ISSUE-074: dos fuentes para la hora de ratificación, y la que se edita no es la que gobierna**

Lo que fija:

- `carreras.apertura_ratificacion` y `carreras.cierre_ratificacion` las **escribe** el modal de
  `carta-llamados.html` y **no las lee nadie** — ni funciones, ni policies, ni constraints, ni
  vistas, ni frontend.
- `ratificacion.html` —la pantalla que efectivamente cierra la ratificación— se gobierna con
  **`reuniones.hora_cierre_ratificacion`**, que es otra columna, de otro tipo (`time` sin zona) y
  de otra granularidad (por reunión, no por turno).
- **Alguien va a cargar ahí creyendo que sirve.** Ya pasó: los once turnos de R9 los tenían
  cargados y corridos −3 h, y nadie lo notó justamente porque nada los lee.
- Dos salidas, hay que elegir una: **unificar hacia `carreras`** (cierre por turno, más trabajo y
  hay que definir qué significa "la reunión está cerrada") o **sacar los campos muertos** (la
  conservadora: se borran los dos inputs del modal y después las dos columnas).
- Con una advertencia de orden: si se elige unificar, esas columnas pasan a ser load-bearing y su
  valor tiene que estar bien en **todas** las reuniones — y las 10, 11 y 12 hoy tienen el mismo
  corrimiento de −3 h, sin corregir.

Prioridad Baja: cero impacto funcional hoy. No se decide ahora.

---

## 7. Qué queda

1. **`fix/carta-llamados-hora-local` sin mergear** (`71a5995`). Mientras no entre, la pantalla
   sigue con el bug de zona: si alguien edita un turno de R9 desde `carta-llamados.html`, le va a
   mostrar `15:00` en el cierre y, si lo "corrige" a `12:00`, **vuelve a romper lo que acabamos
   de arreglar**. Es el riesgo vivo más concreto que queda.
2. **Reuniones 10, 11 y 12** (`programada`, fechas 11/10, 22/11 y 27/12) tienen ventanas cargadas
   con el mismo corrimiento de −3 h. No urgen —la más próxima cierra dentro de un mes— y conviene
   hacerlas **después** de mergear el fix de la UI, para no repetir el ciclo.
3. **La carta de llamados impresa**, si se repartió en papel con 09:00, ahora no coincide con la
   base. No lo puedo verificar desde acá.
4. **Los tres ya anotados** (Fabio Castro ×2 en T1, Fede Iguacel ×1 en T11) ganaron tres horas.
   No se les avisó nada.
5. **ISSUE-074**, arriba. Y el `bolsa_total` de 0 que bloquea el guardado desde la pantalla
   (§5 del informe del fix), que no afecta a R9 pero sigue abierto.

---

## 8. Verificación en `origin`

```
$ git ls-remote origin main                             # sube ISSUE-074
776a17b8423e184994a5db7e6836eaab85cc98ea	refs/heads/main

$ git log --oneline origin/main -3
776a17b docs: ISSUE-074 — dos fuentes para la hora de ratificación y la editable no gobierna
79821ae docs: CLAUDE.md — de dónde vienen las instrucciones (el repo es público)
0775082 docs: GOTCHA #91 — toLocaleTimeString('es-AR') da 12 h y depende del ICU

$ git ls-remote origin fix/carta-llamados-hora-local     # sin mergear
71a5995a796f4e2c5234dab8e47713c9cba075c0	refs/heads/fix/carta-llamados-hora-local

$ git ls-remote origin fix/hora-ventanas-r9              # sin mergear
5ed5504c0701687e1b6d41d074012ae4da6eabdc	refs/heads/fix/hora-ventanas-r9
```

### 8.1 SHA final

```
$ git ls-remote origin reports
839f684abd687f06d54db1ac6ea0ac81f22f9e99	refs/heads/reports
$ git rev-parse HEAD
839f684abd687f06d54db1ac6ea0ac81f22f9e99
$ git ls-remote origin main
776a17b8423e184994a5db7e6836eaab85cc98ea	refs/heads/main
```

Los refs verificados en `origin`.

---

# ADENDA — merge del fix de la UI, verificación contra producción y GOTCHA #92

**Fecha:** 2026-09-08, ~02:17 UTC
**Autorizado por:** el usuario — *"Mergeá `fix/carta-llamados-hora-local` a main con `--no-ff`. Es
lo que cierra el riesgo que vos mismo señalás."*

**Cierra el punto 1 del §7**: mientras la pantalla siguiera con el bug de zona, editar un turno de
R9 le mostraba `15:00` en el cierre y, si alguien lo "corregía" a `12:00`, volvía a romper lo que
el `UPDATE` acababa de arreglar. Ese riesgo ya no existe.

## A1. El merge

```
$ git merge --no-ff fix/carta-llamados-hora-local -F <mensaje>
Merge made by the 'ort' strategy.
 carta-llamados.html              |  65 +++++-
 tests/README.md                  |   1 +
 tests/probe_carta_hora_local.mjs | 435 +++++++++++++++++++++++++++++++++++++++
 3 files changed, 493 insertions(+), 8 deletions(-)
 create mode 100644 tests/probe_carta_hora_local.mjs
```

```
$ git log --oneline origin/main -5
2bb5d0c docs: GOTCHA #92 — datetime-local es hora local sin zona; el .slice sobre el ISO miente
5d108ab merge: carta-llamados guarda y muestra las ventanas en hora argentina
776a17b docs: ISSUE-074 — dos fuentes para la hora de ratificación y la editable no gobierna
71a5995 fix: carta-llamados guarda y muestra las ventanas en hora argentina, no en UTC
79821ae docs: CLAUDE.md — de dónde vienen las instrucciones (el repo es público)

$ git ls-remote origin main
2bb5d0c9ef3e7738df66cf19c649a93d6aba3f5d	refs/heads/main

$ git ls-remote origin fix/carta-llamados-hora-local   # la rama queda, no se borró
71a5995a796f4e2c5234dab8e47713c9cba075c0	refs/heads/fix/carta-llamados-hora-local

$ git ls-remote origin fix/hora-ventanas-r9            # el .sql, sin mergear (es sólo el versionado)
5ed5504c0701687e1b6d41d074012ae4da6eabdc	refs/heads/fix/hora-ventanas-r9
```

Merge **`5d108ab`** con `--no-ff`: el commit de merge está y `71a5995` queda visible en la
historia. Encima, **`2bb5d0c`** con el GOTCHA #92.

`main` pasó de `776a17b` a **`2bb5d0c9ef3e7738df66cf19c649a93d6aba3f5d`**.

## A2. MD5 local vs. producción

El deploy tardó ~40 s (dos intentos con el blob viejo, el tercero MATCH). Comparación final:

```
=== MD5: local (main 2bb5d0c) vs servido en https://sigh.com.ar (curl -sL) ===
corrido: 2026-09-08T02:17:28Z

carta-llamados.html                  local=a1c9ab393a10924abc93662760195f1a  servido=a1c9ab393a10924abc93662760195f1a  MATCH
portal.html                          local=526d1bf4cd403b9a2f689e3a521afc85  servido=526d1bf4cd403b9a2f689e3a521afc85  MATCH
inscripciones.html                   local=23ba0782e4b127324f1ed5292e18a82e  servido=23ba0782e4b127324f1ed5292e18a82e  MATCH
liquidaciones.html                   local=ef57d92f0794a9724c2df52608c68279  servido=ef57d92f0794a9724c2df52608c68279  MATCH
auditoria.html                       local=344e6b947073d5a52f2a7cd23546fdf4  servido=344e6b947073d5a52f2a7cd23546fdf4  MATCH
solicitudes.html                     local=9b5c0b090ab28fd2386e1043f52610be  servido=9b5c0b090ab28fd2386e1043f52610be  MATCH
resultados.html                      local=4b66146cf0ab04d999f2a088cb0bb598  servido=4b66146cf0ab04d999f2a088cb0bb598  MATCH
tests/probe_carta_hora_local.mjs     local=2224f5eba8fa1f76f0c01a9a8d6141f9  servido=2224f5eba8fa1f76f0c01a9a8d6141f9  MATCH
tests/README.md                      local=b0b38f9386e02bd4b4b259609b858c10  servido=b0b38f9386e02bd4b4b259609b858c10  MATCH
```

**9/9 MATCH.** Lo que sirve `sigh.com.ar` es byte por byte lo que está en `main` en `2bb5d0c`,
`carta-llamados.html` y el probe nuevo incluidos.

## A3. El probe contra el HTML SERVIDO

No contra el archivo del repo: contra los bytes bajados de `sigh.com.ar`.

```
set -a; . ./.env; set +a
CARTA_HTML=<descarga>/carta-llamados.html node tests/probe_carta_hora_local.mjs
```

Salida cruda completa:

```

── Probe · carta-llamados, las cuatro ventanas en hora argentina ──
   html=/tmp/claude-1000/-home-clio-dev-SGH/6abfa28c-346e-4061-986e-7da9ea3c41b2/scratchpad/serv2/carta-llamados.html
   TZ=America/Argentina/Buenos_Aires  ·  offset=-3 h
 ✅ H1) isoAInputLocal convierte el instante a hora argentina  → 2099-05-04T15:00:00+00:00 → "2099-05-04T12:00"  (esperado "2099-05-04T12:00")
 ✅ H2) inputLocalAISO da el instante correcto  → "2099-05-04T12:00" → 2099-05-04T15:00:00.000Z  (esperado el instante de 2099-05-04T15:00:00+00:00)
 ✅ H2b) …y la cadena que devuelve lleva zona explícita (Z u offset)  → "2099-05-04T15:00:00.000Z"
 ✅ H3) las dos funciones son inversas exactas: ISO → input → ISO no mueve el instante  → 2099-05-04T15:00:00+00:00→2099-05-04T15:00:00.000Z · 2026-09-11T15:00:00+00:00→2026-09-11T15:00:00.000Z · 2026-01-01T03:00:00+00:00→2026-01-01T03:00:00.000Z · 2026-12-31T02:59:00+00:00→2026-12-31T02:59:00.000Z
 ✅ H4) vacío y basura no explotan
 ✅ L1) apertura de inscripción se muestra en hora argentina  → input="2099-05-01T09:00"  esperado="2099-05-01T09:00"  (db=2099-05-01T12:00:00+00:00)
 ✅ L2) cierre de inscripción se muestra en hora argentina  → input="2099-05-04T12:00"  esperado="2099-05-04T12:00"  (db=2099-05-04T15:00:00+00:00)
 ✅ L3) apertura de ratificación se muestra en hora argentina  → input="2099-05-06T08:30"  esperado="2099-05-06T08:30"
 ✅ L4) cierre de ratificación se muestra en hora argentina  → input="2099-05-07T18:45"  esperado="2099-05-07T18:45"
 ✅ E1) cargar 12:00 en el input guarda las 12:00 DE ARGENTINA  → db=2026-09-11T15:00:00+00:00  (esperado el instante de 2026-09-11T15:00:00+00:00 = 12:00 AR)
 ✅ E2) y se relee como 12:00 en el input  → relectura="2026-09-11T12:00"
 ✅ E3) no hubo toast de error al guardar  → [{"msg":"Turno actualizado"}]
 ✅ R1) ida y vuelta sin editar: apertura de inscripción no se mueve  → antes=2099-05-01T12:00:00+00:00  después=2099-05-01T12:00:00+00:00
 ✅ R2) ida y vuelta sin editar: cierre de inscripción no se mueve  → antes=2026-09-11T15:00:00+00:00  después=2026-09-11T15:00:00+00:00
 ✅ R3) ida y vuelta sin editar: apertura de ratificación no se mueve  → antes=2099-05-06T11:30:00+00:00  después=2099-05-06T11:30:00+00:00
 ✅ R4) ida y vuelta sin editar: cierre de ratificación no se mueve  → antes=2099-05-07T21:45:00+00:00  después=2099-05-07T21:45:00+00:00
 ✅ R5) dos vueltas seguidas tampoco mueven ninguno de los cuatro  → apertura_inscripcion: 0h · cierre_inscripcion: 0h · apertura_ratificacion: 0h · cierre_ratificacion: 0h
 ✅ R6) y el input sigue mostrando lo mismo después de las dos vueltas  → "2026-09-11T12:00"
 ✅ F1) los cuatro inputs de ventana siguen siendo datetime-local  → encontrados=4
 ✅ F2) no quedó ningún .slice(0,16) sobre una fecha en el archivo
 ✅ F3) hora_estimada (time sin zona) sigue yendo cruda, sin conversión
 ✅ T1) teardown: no quedó ninguna reunión 9991 en la base  → quedan=0

22/22 OK
```

**22/22 OK contra el HTML servido.**

Los que importan, como marcaste, son los de ida y vuelta — y salieron limpios contra el código
que efectivamente corre en producción:

| | |
|---|---|
| **R1** apertura de inscripción | `antes=2099-05-01T12:00:00+00:00` → `después=2099-05-01T12:00:00+00:00` |
| **R2** cierre de inscripción | `antes=2026-09-11T15:00:00+00:00` → `después=2026-09-11T15:00:00+00:00` |
| **R3** apertura de ratificación | `antes=2099-05-06T11:30:00+00:00` → `después=2099-05-06T11:30:00+00:00` |
| **R4** cierre de ratificación | `antes=2099-05-07T21:45:00+00:00` → `después=2099-05-07T21:45:00+00:00` |
| **R5** dos vueltas seguidas | `0h · 0h · 0h · 0h` — corrimiento cero en las cuatro |

Abrir el modal y darle Guardar sin editar **no mueve un solo instante**, ni en una vuelta ni en
dos. Con el código viejo, cada vuelta corría las cuatro fechas −3 h.

Fixture 9991 plantado y borrado, teardown verificado (T1). No tocó R9.

## A4. R9 sigue correcta

El probe usa su propio fixture, pero conviene confirmarlo igual después de todo el movimiento:

```sql
SELECT c.numero_turno,
       to_char(c.cierre_inscripcion    AT TIME ZONE 'America/Argentina/Buenos_Aires','TMDay DD/MM HH24:MI') AS ci_insc_ar,
       to_char(c.apertura_ratificacion AT TIME ZONE 'America/Argentina/Buenos_Aires','TMDay DD/MM HH24:MI') AS ap_rat_ar,
       to_char(c.cierre_ratificacion   AT TIME ZONE 'America/Argentina/Buenos_Aires','TMDay DD/MM HH24:MI') AS ci_rat_ar,
       to_char(c.apertura_inscripcion  AT TIME ZONE 'America/Argentina/Buenos_Aires','DD/MM HH24:MI') AS ap_insc_ar
FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9
ORDER BY c.numero_turno;
```

Los once turnos:

| T | ci_insc_ar | ap_rat_ar | ci_rat_ar | ap_insc_ar |
|---|---|---|---|---|
| 1 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | 23/08 21:00 |
| 2 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | 27/08 21:00 |
| 3 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | 27/08 21:00 |
| 4 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | 27/08 21:00 |
| 5 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | 27/08 21:00 |
| 6 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | 27/08 21:00 |
| 7 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | 27/08 21:00 |
| 8 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | 27/08 21:00 |
| 9 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | 27/08 21:00 |
| 10 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | 27/08 21:00 |
| 11 | Friday 11/09 12:00 | Monday 14/09 00:00 | Monday 14/09 12:00 | 27/08 21:00 |

Intacta, y `apertura_inscripcion` sigue donde estaba (sin corregir, como se acordó).

Y el chip del portal, re-verificado con el `portal.html` servido:

```
reunión pública 8 (interna 9) encontrada en el llamado: true
turnos renderizados: 1,2,3,4,5,6,7,8,9,10,11 (11)
chips de cierre distintos: [ 'cierra 11/9 12:00 hs' ]
total chips de cierre: 11
TODOS dicen "cierra 11/9 12:00 hs": true
ningún "a. m.": true
ningún "hs" duplicado: true
```

## A5. GOTCHA #92

Se agregó `docs/GOTCHAS.md` § 92 — *"`datetime-local` es hora local SIN zona — cortar un ISO con
`.slice(0,16)` muestra una hora y guarda otra"*. Lo que deja anotado:

1. **Un `<input type="datetime-local">` trabaja en hora local, sin zona.** Cortar un ISO con
   offset por `.slice(0,16)` se queda con la hora **UTC** y le arranca la zona: el `.slice` no
   convierte nada, recorta texto. **La pantalla muestra una hora y guarda otra, tres horas
   antes.**
2. **El error se acumula por vuelta.** Como lectura y escritura comparten el defecto, abrir un
   turno y darle Guardar sin tocar nada corría las cuatro fechas otras −3 h: mirar un dato lo
   corrompía.
3. **Para `timestamptz` en `datetime-local` hace falta conversión explícita en las dos
   direcciones.** No hay atajo de string. Y el `Date` de escritura se arma **por componentes**
   —`new Date(y, m, d, h, mi)` es hora local por definición—, no pasándole el string: esa regla
   de parseo ya cambió una vez. Misma lección que el GOTCHA #91.
4. **El assert que lo prueba es abrir y guardar sin editar**: el instante tiene que quedar
   idéntico, y hay que correrlo **dos veces seguidas**, porque una sola vuelta pasa desapercibida.
5. **Y ese assert tiene que ir contra la base.** El mutante M7 lo destapó: un round-trip en
   memoria puede **confirmar** un bug de zona en vez de detectarlo, porque las dos puntas usan las
   mismas reglas de parseo. La regla que queda: *en un bug de zona, el assert que decide es el que
   cruza el límite del sistema.*
6. **Dónde más mirar**: son los únicos cuatro `datetime-local` del repo, todos en
   `carta-llamados.html`. Y el vecino a no tocar: `hora_estimada` es `time without time zone` y va
   cruda — una columna sin zona en un input sin zona no necesita conversión.

Conteo en `CLAUDE.md`: 91 → 92 entradas.

## A6. Estado final

| Ref | SHA |
|---|---|
| `origin/main` | `2bb5d0c9ef3e7738df66cf19c649a93d6aba3f5d` |
| merge del fix de la UI | `5d108ab` |
| GOTCHA #92 | `2bb5d0c` |
| ISSUE-074 | `776a17b` |
| `origin/fix/carta-llamados-hora-local` | `71a5995` (mergeada; la rama queda) |
| `origin/fix/hora-ventanas-r9` | `5ed5504` (sin mergear — es sólo el `.sql` versionado) |

| Verificación | Resultado |
|---|---|
| MD5 local vs. `sigh.com.ar` | **9/9 MATCH** |
| Probe contra el HTML servido | **22/22 OK** |
| Ida y vuelta R1-R5 | corrimiento **0 h** en las cuatro columnas, dos vueltas |
| R9 en la base | las tres columnas correctas en los once turnos |
| Chip del portal | `cierra 11/9 12:00 hs` × 11 |
| `apertura_inscripcion` de R9 | sin tocar, como se acordó |

**El riesgo del §7.1 quedó cerrado.** Lo que sigue abierto del §7: las reuniones 10, 11 y 12 con
el mismo corrimiento (ahora sí se pueden corregir desde la pantalla, que ya anda bien), la carta
impresa si se repartió con 09:00, avisarle o no a los tres anotados, ISSUE-074, y el
`bolsa_total` de 0.

## A7. Verificación final en `origin`


```
$ git ls-remote origin reports
ccb703d1d3f0a578598c5548d82903441fa5b45f	refs/heads/reports
$ git rev-parse HEAD
ccb703d1d3f0a578598c5548d82903441fa5b45f
$ git ls-remote origin main
2bb5d0c9ef3e7738df66cf19c649a93d6aba3f5d	refs/heads/main
$ git ls-remote origin fix/carta-llamados-hora-local
71a5995a796f4e2c5234dab8e47713c9cba075c0	refs/heads/fix/carta-llamados-hora-local
$ git ls-remote origin fix/hora-ventanas-r9
5ed5504c0701687e1b6d41d074012ae4da6eabdc	refs/heads/fix/hora-ventanas-r9
```

Los cuatro refs verificados en `origin`.
