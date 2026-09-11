# Revisión — las cinco ramas sin mergear: qué falta en `main`, qué es residuo, dónde hay drift — 2026-09-11

**Fecha:** 2026-09-11 (noche)
**`main`:** `7a0a8ee828bd666794829167e17ed17090f7c63b` (post merge studbook-buscar)
**Guards:** `pwd` = `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` = **203** · ref `unlhcuanfrtpatoipwve`
**Solo lectura.** Nada mergeado, nada borrado, nada ejecutado en la base. (Se corrió un probe READ-ONLY de una de las ramas, §3.)

## 1. Veredicto

| Rama | Commit único | Qué trae que NO está en `main` | ¿SQL ejecutado en prod? | ¿Drift (base cambiada, repo sin registro)? | Conflicto al mergear | **Decisión propuesta** |
|---|---|---|---|---|---|---|
| `fix/condicion-sexo-t8-t10-r9` | `0b72673` | `migrations/fix_condicion_sexo_r9_t8_t10.sql`, `rollback_…sql`, `tests/probe_condicion_sexo_r9.mjs` | **SÍ** — R9 T8 y T10 están en `hembras` hoy (§2.1); informe `2026-09-08_ejecucion-fix-condicion-sexo-t8-t10-r9.md`: "APLICADO EN PRODUCCIÓN. 2 filas" | **SÍ** | no | **MERGEAR** |
| `fix/hora-ventanas-r9` | `5ed5504` | `migrations/fix_ventanas_r9_hora_argentina.sql` | **SÍ** — el commit dice "NO EJECUTADO" pero se ejecutó después: las tres ventanas de los 11 turnos están en hora AR (§2.1); informe `2026-09-08_ejecucion-ventanas-r9.md`: "EJECUTADO Y VERIFICADO. 11 filas" | **SÍ** | no | **MERGEAR** |
| `feat/buscador-spc-autocompletado` | `5ab8320` | `migrations/rpc_padron_spcs.sql`, `portal.html` (buscador filtra en cliente, acento-insensible), `tests/probe_buscador_spc.mjs` | **SÍ, parcial** — `rpc_padron_spcs()` está en la base (migración `20260908112640 rpc_padron_spcs`) pero **nadie la llama**: `portal.html` de `main` sigue con `rpc_buscar_spc` (§2.2) | **SÍ** (la función existe y el repo no tiene el `.sql`) | no | **MERGEAR** (o, si no se quiere la UI, borrar la rama **y** `DROP FUNCTION rpc_padron_spcs()` — el informe del 08/09 ya lo decía: "Si decidís no mergear, hay que borrarla") |
| `fix/llamado-chips-fede` | `966b6c8` | `inscripciones.html` y `portal.html` sin el chip de sexo (pedido de Fede 08/09), probe ampliado | no (sin SQL) | no | no | **MERGEAR** — no es residuo: `main` todavía muestra el chip (`portal.html:625`, `inscripciones.html:558`). La contradicción que lo frenaba (T8/T10 con chip `ambos` y texto "Yeguas") ya no existe desde que se corrigió el sexo |
| `chore/issue-081-pii-residual-vps` | `5a0f80c` | `docs/ISSUES.md` +50 líneas (ISSUE-081) | no (docs) | no | no | **MERGEAR** — `main` no tiene ISSUE-081 |

**Residuo de algo ya mergeado: ninguna.** Las cinco tienen exactamente 1 commit propio, `git cherry` lo marca `+` (patch no presente en `main`) y ningún archivo que traen existe ya en `main` — salvo `tests/probe_paridad_llamado_inscripciones.mjs`, que existe pero **sin** las modificaciones de la rama (el diff aplica limpio hacia adelante y NO aplica en reversa: no está).

**Drift real: tres.** Las dos de R9 con SQL ejecutado por `execute_sql` (DML, sin fila en `schema_migrations`) y `rpc_padron_spcs` (DDL con fila en `schema_migrations` pero sin `.sql` en `main`). Mergear las tres cierra el drift sin tocar la base.

**Ninguna hay que borrar sin mergear.** Si se prefiere no llevar la UI del buscador al portal, esa es la única que además requiere un `DROP FUNCTION` en la base para no dejar drift.

## 2. Evidencia

### 2.1 Estado de la base — R9 (query `execute_sql`)

```sql
select c.numero_turno, c.condicion_sexo, c.condicion_handicap,
  c.cierre_inscripcion at time zone 'America/Argentina/Buenos_Aires' as ci_insc_ar,
  c.apertura_ratificacion at time zone 'America/Argentina/Buenos_Aires' as ap_rat_ar,
  c.cierre_ratificacion at time zone 'America/Argentina/Buenos_Aires' as ci_rat_ar
from carreras c join reuniones r on r.id=c.reunion_id
where r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' and r.numero=9 order by numero_turno;
```

| T | condicion_sexo | condicion_handicap | ci_insc AR | ap_rat AR | ci_rat AR |
|---|---|---|---|---|---|
| 1 | ambos | Todo caballo 3 años perdedor. | 2026-09-11 12:00 | 2026-09-14 00:00 | 2026-09-14 12:00 |
| 2 | ambos | Todo caballo 4 años perdedor. | 2026-09-11 12:00 | 2026-09-14 00:00 | 2026-09-14 12:00 |
| 3 | ambos | Todo caballo 4 años perdedor. | 2026-09-11 12:00 | 2026-09-14 00:00 | 2026-09-14 12:00 |
| 4 | ambos | Todo caballo 5 años y + edad perdedor. | 2026-09-11 12:00 | 2026-09-14 00:00 | 2026-09-14 12:00 |
| 5 | ambos | Todo caballo 3 y 4 años ganador de 1 o 2 carreras. | 2026-09-11 12:00 | 2026-09-14 00:00 | 2026-09-14 12:00 |
| 6 | ambos | Todo caballo de 5 años ganador de 1 o 2 carreras. | 2026-09-11 12:00 | 2026-09-14 00:00 | 2026-09-14 12:00 |
| 7 | ambos | Todo caballo 6 años y + edad ganadores de 1 o 2 carreras. | 2026-09-11 12:00 | 2026-09-14 00:00 | 2026-09-14 12:00 |
| **8** | **hembras** | Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras. | 2026-09-11 12:00 | 2026-09-14 00:00 | 2026-09-14 12:00 |
| 9 | ambos | Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras. | 2026-09-11 12:00 | 2026-09-14 00:00 | 2026-09-14 12:00 |
| **10** | **hembras** | Yeguas 5 años y + edad perdedoras. | 2026-09-11 12:00 | 2026-09-14 00:00 | 2026-09-14 12:00 |
| 11 | ambos | Todo caballo 5 años y + edad perdedor. | 2026-09-11 12:00 | 2026-09-14 00:00 | 2026-09-14 12:00 |

- T8/T10 `hembras` = lo que hace `fix_condicion_sexo_r9_t8_t10.sql` (predicado `condicion_sexo='ambos'` sobre T8 y T10). Antes del 08/09 estaban en `ambos` (informe `2026-09-08_machos-en-t8-t10-r9.md`).
- Ventanas: `12:00 AR / 00:00 AR / 12:00 AR` = exactamente el `SET` de `fix_ventanas_r9_hora_argentina.sql` (líneas 63-65). Antes: `09:00 AR / 21:00 AR (13/09) / 09:00 AR` (foto en el mismo archivo, líneas 51-55).
- Ninguna de las dos figura en `schema_migrations` (son DML por `execute_sql`; el registro es el `.sql` en el repo — que hoy sólo vive en las ramas):

```sql
select version||' '||name from supabase_migrations.schema_migrations
 where name ilike '%sexo%' or name ilike '%ventana%' or name ilike '%padron%' or name ilike '%buscar_spc%' or name ilike '%chips%';
-- 20260825184207 portal_monta_al_anotar_padron_jockeys
-- 20260825184416 rpc_padron_profesionales
-- 20260908112640 rpc_padron_spcs            ← la de feat/buscador-spc-autocompletado
-- 20260911195351 spcs_conesera_sexo
-- 20260911214545 fix_condicion_sexo_r6_r7_r8
```

`main` ya lo sabe a medias: `migrations/fix_condicion_sexo_r6_r7_r8.sql:8-9` dice *"Mismo defecto que R9 T8/T10 (fix del 08/09, migrations/fix_condicion_sexo_r9_t8_t10.sql en la rama fix/condicion-sexo-t8-t10-r9)"* — apunta a un archivo que `main` no tiene.

### 2.2 Funciones en la base vs `main`

```sql
select proname||'('||pg_get_function_identity_arguments(oid)||')' from pg_proc … where proname in ('rpc_padron_spcs','rpc_buscar_spc','rpc_padron_profesionales');
-- rpc_buscar_spc(p_q text)          ← la usa main:portal.html:669
-- rpc_padron_profesionales()        ← la usa main:portal.html:707
-- rpc_padron_spcs()                 ← NADIE la usa en main; .sql sólo en la rama
```

### 2.3 Git — crudo

```
=== chore/issue-081-pii-residual-vps
local: 5a0f80c1db9f6b5811d1f3bc5b7750ecbe2040e8  remote: 5a0f80c1db9f6b5811d1f3bc5b7750ecbe2040e8
merge-base: 4f6ff1338f7b7a7797804ba69beb0de25771749a
ahead of main: 1  behind: 6
-- commits not in main:
5a0f80c docs: ISSUE-081 — PII de terceros residual en el VPS (ramas gone + tmp/), limpieza a cargo de Leo
-- cherry (- = patch already in main):
+ 5a0f80c1db9f6b5811d1f3bc5b7750ecbe2040e8
-- files changed vs merge-base:
 docs/ISSUES.md | 50 ++++++++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 50 insertions(+)

=== feat/buscador-spc-autocompletado
local: 5ab83206e29d54586654580662bff7b6e961e2f6  remote: 5ab83206e29d54586654580662bff7b6e961e2f6
merge-base: eface80078b99a56c9ae3160053cd8fd0c425d31
ahead of main: 1  behind: 35
-- commits not in main:
5ab8320 feat: autocompletado del buscador de SPC en el portal
-- cherry (- = patch already in main):
+ 5ab83206e29d54586654580662bff7b6e961e2f6
-- files changed vs merge-base:
 migrations/rpc_padron_spcs.sql |  54 +++++
 portal.html                    | 112 ++++++++--
 tests/probe_buscador_spc.mjs   | 453 +++++++++++++++++++++++++++++++++++++++++
 3 files changed, 598 insertions(+), 21 deletions(-)

=== fix/condicion-sexo-t8-t10-r9
local: 0b726736cac872e5b75403dfec552522e5c7ff0a  remote: 0b726736cac872e5b75403dfec552522e5c7ff0a
merge-base: eface80078b99a56c9ae3160053cd8fd0c425d31
ahead of main: 1  behind: 35
-- commits not in main:
0b72673 fix: T8 y T10 de R9 son carreras de yeguas — condicion_sexo 'ambos' → 'hembras'
-- cherry (- = patch already in main):
+ 0b726736cac872e5b75403dfec552522e5c7ff0a
-- files changed vs merge-base:
 migrations/fix_condicion_sexo_r9_t8_t10.sql      |  84 +++++++++++++++++++
 migrations/rollback_condicion_sexo_r9_t8_t10.sql |  61 ++++++++++++++
 tests/probe_condicion_sexo_r9.mjs                | 101 +++++++++++++++++++++++
 3 files changed, 246 insertions(+)

=== fix/hora-ventanas-r9
local: 5ed5504c0701687e1b6d41d074012ae4da6eabdc  remote: 5ed5504c0701687e1b6d41d074012ae4da6eabdc
merge-base: 79821ae01a9b8e8768ae698b967462d00baa71a0
ahead of main: 1  behind: 46
-- commits not in main:
5ed5504 chore: SQL de corrección de las ventanas de R9 (NO EJECUTADO)
-- cherry (- = patch already in main):
+ 5ed5504c0701687e1b6d41d074012ae4da6eabdc
-- files changed vs merge-base:
 migrations/fix_ventanas_r9_hora_argentina.sql | 167 ++++++++++++++++++++++++++
 1 file changed, 167 insertions(+)

=== fix/llamado-chips-fede
local: 966b6c823a48427020f1b7b3ecbfc52d302a12d4  remote: 966b6c823a48427020f1b7b3ecbfc52d302a12d4
merge-base: eface80078b99a56c9ae3160053cd8fd0c425d31
ahead of main: 1  behind: 35
-- commits not in main:
966b6c8 fix: sale el chip de sexo del llamado y del encabezado de inscripciones
-- cherry (- = patch already in main):
+ 966b6c823a48427020f1b7b3ecbfc52d302a12d4
-- files changed vs merge-base:
 inscripciones.html                            |  7 ++-
 portal.html                                   | 10 ++++-
 tests/probe_paridad_llamado_inscripciones.mjs | 62 ++++++++++++++++++++++++---
 3 files changed, 70 insertions(+), 9 deletions(-)


== files in main?
migrations/fix_condicion_sexo_r9_t8_t10.sql             no
migrations/rollback_condicion_sexo_r9_t8_t10.sql        no
tests/probe_condicion_sexo_r9.mjs                       no
migrations/fix_ventanas_r9_hora_argentina.sql           no
migrations/rpc_padron_spcs.sql                          no
tests/probe_buscador_spc.mjs                            no
tests/probe_paridad_llamado_inscripciones.mjs           EN_MAIN

== ISSUE-081 en main:
no


== fix/llamado-chips-fede (solo .html)
  forward aplica limpio → NO está en main
  reverse NO aplica
== feat/buscador-spc-autocompletado (solo .html)
  forward aplica limpio → NO está en main
  reverse NO aplica

== conflictos al mergear en main (merge-tree, sin tocar nada)
-- chore/issue-081-pii-residual-vps → SIN conflictos; 
-- feat/buscador-spc-autocompletado → SIN conflictos; 
-- fix/condicion-sexo-t8-t10-r9 → SIN conflictos; 
-- fix/hora-ventanas-r9 → SIN conflictos; 
-- fix/llamado-chips-fede → SIN conflictos; 

== informes de ejecución en reports (¿se corrió el SQL?)
```

`git apply --check` del diff `.html` de cada rama contra `main`: **forward aplica limpio, reverse no aplica** → el cambio no está en `main` (ni a mano ni por otra rama). Sale igual para `fix/llamado-chips-fede` y `feat/buscador-spc-autocompletado`.

Lo que dicen los informes del 08/09 (en `reports`):

```
## 2026-09-08_ejecucion-fix-condicion-sexo-t8-t10-r9.md
4:**Estado:** **APLICADO EN PRODUCCIÓN.** 2 filas. Verificado. Sin rollback.
5:**Plan que se ejecutó:** `docs/diagnosticos/2026-09-08_plan-fix-condicion-sexo-t8-t10-r9.md`
8:pusheada a `origin`. **No mergeada a `main`.**
521:1. **El chip del llamado.** Con `fix/llamado-chips-fede` sin mergear, el chip sigue vivo en prod y
527:   Fede.

## 2026-09-08_chips-llamado-pista-y-sexo.md
4:**Pedido de Fede:** *"yo pondría turno 2, 800 metros, sacaría tierra ambos, cuatro años dejaría,
6:**Rama:** `fix/llamado-chips-fede` — **pusheada, SIN mergear.**
41:**Hice sólo el sexo. La pista quedó sin tocar, esperando tu decisión.**
162:+    // El chip de SEXO se sacó el 08/09/2026 (Fede). No pierde el dato: donde
178:+               sacó el 08/09/2026 a pedido de Fede ("sacaría tierra ambos"): en
213:// D7 — los cuatro que Fede quiere conservar

## 2026-09-08_buscador-spc-autocompletado.md
4:**Rama:** `feat/buscador-spc-autocompletado` — **sin mergear**, como pediste
7:**Pedido:** Fede, 08/09/2026 — que el buscador de caballos del portal sugiera mientras se tipea.
103:Este es el bug de fondo del pedido de Fede, aunque él lo haya descrito como
153:## 2. La decisión: cliente, no servidor
233:decidís no mergear, hay que borrarla.
387:**Cualquier entrenador puede anotar cualquier SPC.** Regla confirmada por Fede y
```

## 3. Probe de la rama `fix/condicion-sexo-t8-t10-r9`, corrido hoy contra prod (READ-ONLY)

Se extrajo `tests/probe_condicion_sexo_r9.mjs` de la rama a un archivo temporal, se corrió y se borró (working tree limpio después):

```
$ git show fix/condicion-sexo-t8-t10-r9:tests/probe_condicion_sexo_r9.mjs > tests/_tmp_probe_condicion_sexo_r9.mjs
$ node tests/_tmp_probe_condicion_sexo_r9.mjs

── 1 · La columna en los once turnos de R9 ──
  [32m✔[0m R9 tiene 11 turnos (11)
  [32m✔[0m T1: condicion_sexo = 'ambos' (esperado 'ambos')
  [32m✔[0m T2: condicion_sexo = 'ambos' (esperado 'ambos')
  [32m✔[0m T3: condicion_sexo = 'ambos' (esperado 'ambos')
  [32m✔[0m T4: condicion_sexo = 'ambos' (esperado 'ambos')
  [32m✔[0m T5: condicion_sexo = 'ambos' (esperado 'ambos')
  [32m✔[0m T6: condicion_sexo = 'ambos' (esperado 'ambos')
  [32m✔[0m T7: condicion_sexo = 'ambos' (esperado 'ambos')
  [32m✔[0m T8: condicion_sexo = 'hembras' (esperado 'hembras')
  [32m✔[0m T9: condicion_sexo = 'ambos' (esperado 'ambos')
  [32m✔[0m T10: condicion_sexo = 'hembras' (esperado 'hembras')
  [32m✔[0m T11: condicion_sexo = 'ambos' (esperado 'ambos')
  [32m✔[0m T8: el texto sigue diciendo "Yeguas" — "Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras."
  [32m✔[0m T10: el texto sigue diciendo "Yeguas" — "Yeguas 5 años y + edad perdedoras."

── 2 · El gate en T8 y T10 (condicion_sexo = hembras) ──
  [32m✔[0m T8: RECHAZA AFRICUM (macho, 6a)
  [32m✔[0m T8: RECHAZA Gaucho Bravo (castrado, 7a)
  [32m✔[0m T8: ACEPTA  AMOROUS (hembra, 5a)
  [32m✔[0m T10: RECHAZA AFRICUM (macho, 6a)
  [32m✔[0m T10: RECHAZA Gaucho Bravo (castrado, 7a)
  [32m✔[0m T10: ACEPTA  AMOROUS (hembra, 5a)

── 3 · Control de aislamiento: T4 sigue en "ambos", mismo rango de edad ──
  [32m✔[0m T4 sigue en 'ambos' (ambos)
  [32m✔[0m T4 arranca en 5 años como T8/T10 (5)
  [32m✔[0m T4: ACEPTA AFRICUM (macho, 6a) — el rechazo en T8/T10 es por SEXO
  [32m✔[0m T4: ACEPTA Gaucho Bravo (castrado, 7a) — idem
  [32m✔[0m T4: ACEPTA AMOROUS (hembra, 5a)

── 4 · Control negativo: la edad sigue mandando ──
  [32m✔[0m T8: RECHAZA CARRIGAN FITZ (hembra, 3a) — por edad, no por sexo

[32mOK[0m — 26 pass, 0 fail

```

Sigue en verde tres días después: el fix está en la base y el probe de la rama lo verifica. Mergearlo no cambia nada en prod; sólo deja el registro.

`tests/probe_buscador_spc.mjs` (rama `feat/buscador…`) **no se corrió**: ESCRIBE (crea un usuario de portal efímero) y no fue pedido. El comentario "181 ejemplares" del `portal.html` de esa rama quedó viejo (hoy 203) — cosmético, no afecta el código.

## 4. Orden sugerido si se mergean las cinco

Ninguna conflictúa con `main` (`git merge-tree --write-tree`, §2.3). Orden por riesgo, de menor a mayor:

1. `chore/issue-081-pii-residual-vps` — docs.
2. `fix/condicion-sexo-t8-t10-r9` — sólo archivos `migrations/` + probe; cierra drift #1.
3. `fix/hora-ventanas-r9` — sólo `migrations/`; cierra drift #2. Conviene, al mergear, corregir el "(NO EJECUTADO)" del título del commit con una línea en CHANGELOG: *ejecutado el 08/09, ver `…_ejecucion-ventanas-r9.md`*.
4. `fix/llamado-chips-fede` — UI (portal + inscripciones) → **deploy**. Pedido de Fede. Correr `tests/probe_paridad_llamado_inscripciones.mjs` de la rama después del merge (ESCRIBE fixture 9992 con teardown).
5. `feat/buscador-spc-autocompletado` — UI del portal → **deploy**, cambia cómo busca el entrenador (padrón completo en cliente, acento-insensible). Cierra drift #3. Correr `tests/probe_buscador_spc.mjs` después del merge. **Alternativa** si no se quiere la UI: borrar rama + `DROP FUNCTION public.rpc_padron_spcs();` por `apply_migration` (con su `.sql` en `migrations/`) para que la base y el repo queden parejos.

Cada merge `--no-ff`, con OK explícito, como siempre. Después de todos: `git branch -d` de las mergeadas (local y `origin`) si querés; no lo hago sin pedido.

## 5. Verificación de push (reports)

```
$ git push -u origin reports
$ git ls-remote origin reports
eaa9eb055dd8a1a90dbfb4782748ab1f78a450bf	refs/heads/reports
$ git rev-parse HEAD
eaa9eb055dd8a1a90dbfb4782748ab1f78a450bf
```
