# Merge del historial de recibos — drift cerrado y verificado contra prod

**Fecha:** 2026-08-30
**SHA del merge de la feature:** `82484e52031de68ddecb04301f28328d681e3222`
**SHA de `main` al cierre:** `dc978c092848629831e59ed912430ee021e97c60` (docs + GOTCHAS)
**Rama de este informe:** `reports`
**Continúa:** `docs/diagnosticos/2026-08-30_historial-recibos-implementado.md`

---

## Guards verificados

```
$ pwd
/home/clio/dev/SGH
```

```sql
SELECT count(*) AS spcs_count FROM spcs;
```
```json
[{"spcs_count":181}]
```

```
ref del proyecto: unlhcuanfrtpatoipwve
```

---

# 0. EL SHA QUE PEDISTE

```
82484e52031de68ddecb04301f28328d681e3222
```

Es el merge `--no-ff` de `feat/historial-recibos` a `main`. Después hay un segundo merge,
`dc978c092848629831e59ed912430ee021e97c60`, que trae **sólo documentación** (ISSUES, CHANGELOG,
GOTCHAS 85–87, contador de CLAUDE.md) y **no toca `liquidaciones.html`** — verificado abajo.

---

# 1. TL;DR

| | |
|---|---|
| Merge de la feature | `82484e5` — `--no-ff`, pusheado |
| Merge de docs | `dc978c0` — `--no-ff`, pusheado |
| **Drift cerrado** | `migrations/anular_recibo_v2_snapshot.sql` ya está en `main`; prod corre v2 |
| md5 local = commit = prod | `fa8cf1cdd8bc6e0af92ff3f64eed400d` |
| Probe contra el HTML **servido** | **39/39** |
| Latencia del CDN | ~40 s |
| ISSUE-056 | opción B tachada como HECHA |
| GOTCHAS | **85**, **86** y **87**. Contador 84 → 87 |

---

# 2. EL DRIFT — que era lo urgente

Tenías razón en el orden: la migración v2 ya estaba aplicada en producción y `main` no tenía el
archivo. Una sesión nueva que leyera `main` habría encontrado sólo
`migrations/anular_recibo_v1.sql` y la habría creído vigente — con la consecuencia concreta de
escribir código que asume `lineas_anuladas` como array de ids.

Verificación de que quedó cerrado, por los dos lados:

```
$ git show dc978c0:migrations/anular_recibo_v2_snapshot.sql | grep -c "to_jsonb(d)"
5
```

```sql
SELECT position('to_jsonb(d)' in pg_get_functiondef(p.oid)) > 0 AS prod_tiene_v2,
       position('jsonb_agg(d.id' in pg_get_functiondef(p.oid)) > 0 AS prod_tiene_v1
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='anular_recibo';
```
```json
[{"prod_tiene_v2":true,"prod_tiene_v1":false}]
```

**El repo y la base dicen lo mismo.** Y el `main` de ahora tiene las dos migraciones del día
(`anular_recibo_v2_snapshot.sql` y `fix_seeds_recibos_9001_9002.sql`) como fuente de verdad
versionada.

---

# 3. EL MERGE, SALIDA CRUDA

```
$ git checkout main && git pull origin main
$ git log --oneline -1
2821c7c merge: filtro por tipo de concepto en el detalle de Pagos

$ git merge --no-ff feat/historial-recibos -m "merge: historial de recibos + anular_recibo v2 (foto de las lineas)" …
 tests/probe_historial_recibos.mjs          | 735 +++++++++++++++++++++++++++++
 tests/probe_reunion_es_prueba.mjs          |  27 +-
 9 files changed, 1485 insertions(+), 18 deletions(-)
 create mode 100644 migrations/anular_recibo_v2_snapshot.sql
 create mode 100644 migrations/fix_seeds_recibos_9001_9002.sql
 create mode 100644 tests/probe_historial_recibos.mjs

$ git push origin main
To github.com:mdqclio/SGH.git
   2821c7c..82484e5  main -> main

$ git rev-parse HEAD
82484e52031de68ddecb04301f28328d681e3222

$ git ls-remote origin main
82484e52031de68ddecb04301f28328d681e3222	refs/heads/main
```

Y el segundo, el de documentación:

```
$ git merge --no-ff chore/cierre-historial-recibos -m "merge: cierre del historial de recibos — docs y GOTCHAS 85-87"
 docs/GOTCHAS.md | 157 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 docs/ISSUES.md  |  16 ++++--
 4 files changed, 231 insertions(+), 6 deletions(-)

$ git push origin main
   82484e5..dc978c0  main -> main

$ git rev-parse HEAD
dc978c092848629831e59ed912430ee021e97c60

$ git ls-remote origin main
dc978c092848629831e59ed912430ee021e97c60	refs/heads/main
```

---

# 4. md5 CONTRA `sigh.com.ar`

```
$ git show 82484e5:liquidaciones.html > $SP/local2.html
$ md5sum $SP/local2.html
local (commit 82484e5): fa8cf1cdd8bc6e0af92ff3f64eed400d

$ for i in $(seq 1 20); do curl -s "https://sigh.com.ar/liquidaciones.html?v=$RANDOM$i" -o $SP/prod2.html; … done
intento 1 · 19:14:58 · prod=63d7fc970601b7b2ca5bc91f52bf44c8 (viejo)
intento 2 · 19:15:18 · prod=63d7fc970601b7b2ca5bc91f52bf44c8 (viejo)
intento 3 · 19:15:39 · prod=fa8cf1cdd8bc6e0af92ff3f64eed400d ← COINCIDE
```

Las tres copias, iguales:

```
$ md5sum $SP/local2.html $SP/prod2.html liquidaciones.html
fa8cf1cdd8bc6e0af92ff3f64eed400d  …/local2.html          ← el commit 82484e5
fa8cf1cdd8bc6e0af92ff3f64eed400d  …/prod2.html           ← lo que sirve sigh.com.ar
fa8cf1cdd8bc6e0af92ff3f64eed400d  liquidaciones.html     ← el working tree
```

El md5 viejo (`63d7fc97…`) es el del filtro por concepto, que era lo que estaba en prod hasta
este merge. **Latencia del CDN: ~40 s.**

Y el merge de documentación **no movió el archivo servido**:

```
$ git show dc978c0:liquidaciones.html | md5sum
fa8cf1cdd8bc6e0af92ff3f64eed400d  -
$ md5sum $SP/prod2.html
fa8cf1cdd8bc6e0af92ff3f64eed400d  …/prod2.html
```

Así que el md5 verificado arriba sigue siendo el vigente en `main`.

---

# 5. PROBE CONTRA EL HTML SERVIDO — salida cruda completa

No contra el archivo local: contra el `.html` que bajó `curl` de `sigh.com.ar`.

```
$ set -a; . ./.env; set +a
$ LIQ_HTML=$SP/prod2.html node tests/probe_historial_recibos.mjs

── Probe · historial de recibos ──
   html=/tmp/claude-1000/-home-clio-dev-SGH/4e92703c-295b-415c-81af-7c6ec9d3cd7a/scratchpad/prod2.html
 ✅ A4) anular_recibo v2 guardó la FOTO de las filas (objetos con monto_neto), no sólo los ids  → tipo=object campos=20
 ✅ A4b) y las líneas quedaron con recibo_id NULL (por eso el detalle no puede usar recibo_id)  → [null,null,null]
 ✅ A4c) idsLineasAnuladas entiende el formato v2 y devuelve los 3 ids de la foto  → ["72b89075-71cc-4332-9eec-681763c8112e","d966ff66-6ea0-4e94-bd86-582c56426827","df6f7358-0990-4cfd-b9d8-caaf63582efc"]
 ✅ A4d) y sigue entendiendo el formato v1 (array de ids sueltos), que es el fallback  → ["72b89075-71cc-4332-9eec-681763c8112e","d966ff66-6ea0-4e94-bd86-582c56426827","df6f7358-0990-4cfd-b9d8-caaf63582efc"]
 ✅ N1) buscar un número exacto trae ese recibo y SÓLO ese  → 1 resultado(s): [2]
 ✅ N1c) y un número corto no arrastra a nadie por tener ese dígito en el documento  → [2]
 ✅ N1b) un número inexistente no trae nada y no rompe  → 0 resultado(s)
 ✅ N2) un término numérico también busca por documento del cobrador  → 3 resultado(s) para doc=96347271
 ✅ P1) búsqueda por apellido del beneficiario trae sus recibos  → "Labanca" → 1 resultado(s)
 ✅ P1b) y el beneficiario de cada resultado matchea el término buscado  → ["Labanca"]
 ✅ P1c) búsqueda por nombre de un PROPIETARIO trae su recibo (la otra columna de beneficiario)  → "Leonardo" → 1 resultado(s)
 ✅ P2) búsqueda por NOMBRE de quien retiró trae el recibo  → 3 resultado(s)
 ✅ P2b) búsqueda por DOCUMENTO de quien retiró trae el recibo  → doc=96347271
 ✅ P3) un término con coma y paréntesis no rompe el .or() (sanitización)  → 0 resultado(s), sin error
 ✅ P4) un término que no matchea a nadie no arma un in.() vacío ni tira error  → []
 ✅ D1) el detalle de un emitido trae exactamente sus líneas  → ["408e23be-7aad-4eaf-baa0-6dbfbe57a577","a02dff55-2841-4107-96f5-d6b59bfc809a"]
 ✅ D1b) y cada línea trae las 7 celdas, con el rol resuelto  → <td>Profesional</td>
 ✅ D2) el total de las líneas coincide con el neto del recibo  → lineas=33000 neto=33000
 ✅ A1) un recibo anulado aparece en la lista, marcado como tal  → [["f6722773","anulado"]]
 ✅ A1b) el filtro "Anulados" lo trae y el filtro "Emitidos" NO  → anulados=1 emitidos=2
 ✅ A2) el detalle del anulado muestra motivo, quién anuló y cuándo  → ⛔ ANULADO el 30/8/2026 07:15 p. m.
 ✅ A3) sus líneas se reconstruyen: mismo conjunto de ids que tenía antes de anular  → 3 línea(s)
 ✅ A3b) el detalle sale de la FOTO: pisar el monto en la tabla NO cambia lo que muestra  → original=33000 pisado=1234.56
 ✅ C1) ningún recibo de otro club aparece en el listado  → 3 listados · 5 de Dolores, ninguno presente
 ✅ C1b) buscar por número un recibo que existe en el OTRO club no lo trae  → buscando #3 → 1 resultado(s), ninguno de Dolores
 ✅ C1d) el filtro de club actúa en el SERVIDOR: el cliente no tuvo que descartar ninguna fila  → 0 fila(s) ajenas llegaron al cliente
 ✅ C1c) y todo lo que quedó en recResultados es del club propio  → ["a6da7e40"]
 ✅ C2) una línea de OTRO club no entra en el detalle (cobDelClub)  → linea ajena 5d34a855 — 2 en el detalle
 ✅ I1) reimprimir un EMITIDO manda sus líneas correctas  → ["a02dff55-2841-4107-96f5-d6b59bfc809a","408e23be-7aad-4eaf-baa0-6dbfbe57a577"]
 ✅ I2) reimprimir un ANULADO manda SUS líneas, no un array vacío  → 3 id(s), opts.lineas=3
 ✅ I3) antes de imprimir se repone cobBenef con el beneficiario del recibo  → {"tipo":"profesional","id":"21dc62f8-5da6-4319-95c6-0146e3ae7245","nombre":"Gaitán, Alfredo"}
 ✅ I4) la impresión REAL de un anulado sale con sus 3 líneas, no con el cuerpo vacío  → 8 <tr> en el impreso (2 copias × 3 líneas = 6 mínimo)
 ✅ G1) el mini-DOM TIRA ante un selector desconocido (si devolviera [] daría falso verde)  → selDesconocido=.rec-row[data-x="1"]
 ✅ R1) restore por ESTADO: las líneas quedaron como estaban  → sin diferencias
 ✅ R2) y no hubo que restaurar nada a mano  → 0 línea(s)
 ✅ R3) no quedó ningún recibo del probe, en NINGÚN club  → []
 ✅ R4) no quedaron líneas del probe en la base  → []
 ✅ R6) no quedó la reunión fixture en el club ajeno  → 0 reunión(es) en San Francisco
 ✅ R5) club_secuencias de los dos clubes devuelto a donde estaba  → 0649e9c5: 32→32 · a6da7e40: 1→1

39/39 OK
```

**39/39 contra el HTML que está usando la ventanilla.** El restore quedó limpio (`R1`/`R2`), no
quedaron recibos ni líneas del probe en ningún club (`R3`/`R4`), la reunión fixture del club
ajeno se borró (`R6`) y `club_secuencias` volvió a donde estaba (`R5`).

Los tres asserts que justifican la entrega, corriendo contra prod:

- `A3b` — el detalle del anulado sale de la **foto**: se pisa el monto en la tabla y el detalle
  no se entera. Es lo que compra `anular_recibo` v2.
- `I4` — la impresión **real** de un anulado sale con sus 3 líneas. Antes salía vacía.
- `C1d` — el filtro de club actúa **en el servidor**, no lo está tapando el cliente.

---

# 6. `docs/ISSUES.md`

## ISSUE-056 — la opción B queda tachada

En la sección *"Lo que queda fuera, a propósito"*:

```markdown
- ~~**Buscador de recibos / vista de historial** (opción B).~~ ✅ **HECHO** el 2026-08-30, merge
  `82484e5`. Solapa 📄 Recibos: búsqueda por número, por beneficiario y por quien retiró; los
  anulados aparecen marcados con motivo, quién y cuándo; reimpresión desde el historial. De paso
  cerró dos cosas que la opción A había dejado abiertas: **anular un recibo de la semana pasada ya
  no necesita consola** (se lo busca y se lo ve), y **`anular_recibo` pasó a v2** guardando la foto
  de las líneas en vez de sólo los ids.
- **Reimprimir el anulado con sello ANULADO** — decidido: va después. ⚠️ Ahora pesa más: con el
  historial, reimprimir un anulado **funciona de verdad**, así que sale un papel idéntico al
  original de un recibo que ya no vale.
```

El issue en sí ya estaba **✅ CERRADO** desde el 30/08 por el RPC + la UI de anulación; lo que se
actualizó es su lista de pendientes. La advertencia del sello no es adorno: **hasta hoy no se
podía reimprimir un anulado** (salía vacío), así que el riesgo era teórico. Ahora es real.

## ISSUE-066 — sigue abierto, con el estado afinado

```markdown
**Estado**: 🟡 ABIERTO — deuda técnica conocida, sin síntoma hoy. La solapa 📄 Recibos se agregó
al array (merge `82484e5`), así que el resaltado está bien; lo que queda es el refactor.
```

---

# 7. `docs/GOTCHAS.md` — las tres lecciones del día

## #85 — Un probe que STUBBEA la función bajo prueba no la prueba

El caso M13. El probe stubbeaba `imprimirReciboCobro` para espiar qué se le mandaba, y el
mutante que reintroduce el bug **sobrevivió**: el bug vive adentro de la función y el probe
nunca la corría.

> **La regla**: si el mutante muta la función X, el probe tiene que **ejecutar X**. Un stub de X
> hace que ese mutante sea invisible por construcción, y el probe reporta verde sobre código que
> no tocó.

Queda emparentado con GOTCHA #81 pero marcado como el caso **simétrico**: allá sobraba estado
final y faltaba espiar el borde; acá sobra borde y falta ejecutar. Y con la conclusión de que
**hacen falta los dos** asserts: el espía prueba el contrato del llamador, la ejecución prueba la
implementación.

## #86 — Un post-filtro de cliente TAPA la falta del guard principal

El caso M1/M2. Las dos capas de aislamiento por club se tapaban mutuamente y **los dos mutantes
sobrevivieron**. La protección estaba bien; el test no distinguía quién la sostenía.

> **Defensa en profundidad y mutation testing se pelean.** Dos capas que hacen lo mismo hacen que
> cada mutante individual sobreviva, y el resultado se lee como agujero de cobertura cuando en
> realidad es redundancia funcionando. La salida NO es sacar una capa —eso es optimizar la
> métrica— sino **exponer un observable por capa**. Si una capa no tiene forma de decir "yo
> actué", tampoco hay forma de saber cuándo dejó de actuar.

La implementación concreta —el contador `recAjenosDescartados` que con el guard puesto vale
siempre 0— queda documentada con el `console.warn` que explica qué significa que deje de valer 0.

## #87 — `recibos.neto_a_cobrar` es GENERATED

Es GOTCHA #9 otra vez, en una columna que no estaba en la lista. Las conocidas eran
`liquidaciones.total_neto` y `liquidacion_detalle.monto_neto`; **`recibos.neto_a_cobrar` es la
tercera**.

```
ERROR: 428C9: column "neto_a_cobrar" can only be updated to DEFAULT
DETAIL: Column "neto_a_cobrar" is a generated column.
```

El gotcha incluye el corolario que importa: **corregir sólo el neto habría sido peor que no
tocar nada** —el impreso muestra los tres números y quedaría "Total premios: $0" arriba de "NETO
A COBRAR: $170.000"— y la query para no volver a tropezar:

```sql
SELECT table_name, column_name, generation_expression
FROM information_schema.columns WHERE is_generated='ALWAYS' ORDER BY 1,2;
```

```
$ grep -c "^## " docs/GOTCHAS.md
87
```

Contador de `CLAUDE.md`: **84 → 87**.

---

# 8. `CHANGELOG.md`

Entrada nueva al tope: **`## [2026-08-30] — Historial de recibos + `anular_recibo` v2 (merge
`82484e5`)`**, con las tres citas del pedido, la solapa y por qué no fue una vista dentro de
Pagos, el corte de 6 dígitos en la búsqueda numérica y cómo apareció, la búsqueda por cobrador
con su salvedad del 28/08, los anulados, la migración v2 con el argumento de la ventana, el bug
del `lineaIds`, el aislamiento en dos capas, los seeds, el probe (39/39 local y contra prod),
los mutantes 17/17 con los dos agujeros reales que destaparon, la corrección sobre `in.()` y la
regresión preexistente de los cuatro probes.

---

# 9. NÚMEROS DE RESUMEN

| Métrica | Valor |
|---|---|
| SHA del merge de la feature | `82484e52031de68ddecb04301f28328d681e3222` |
| SHA de `main` al cierre | `dc978c092848629831e59ed912430ee021e97c60` |
| Archivos en el merge de la feature | 9 · +1485 / −18 |
| Archivos en el merge de docs | 4 · +231 / −6 |
| md5 de `liquidaciones.html` | `fa8cf1cdd8bc6e0af92ff3f64eed400d` (working tree = commit = prod) |
| Probe contra HTML local | 39/39 |
| Probe contra HTML **servido** | **39/39** |
| Mutantes | 17/17 · 15 mueren + 2 equivalentes · 0 sobrevivientes · 0 errores de arnés |
| Probes de la familia Pagos en verde | 9 (historial, filtro, anular ×2, aislamiento, es_prueba, rol, pie_cobrador, caballeriza) |
| Probes en rojo, **preexistentes** | 3 (`recibos_emision`, `cobros_v11`, `pagos_rol_carrera`) |
| GOTCHAS | 84 → **87** |
| Latencia del CDN | ~40 s |

---

# 10. LO QUE QUEDA ABIERTO

1. **El sello ANULADO en la reimpresión.** Subió de prioridad solo: hasta hoy reimprimir un
   anulado salía vacío, así que el riesgo era teórico. Ahora sale un papel **idéntico al
   original** de un recibo que no vale. Anotado en ISSUE-056 con esa advertencia.
2. **Los 3 probes preexistentes en rojo.** Son fixtures de datos, no código —verificado
   corriéndolos contra el HTML de `main` sin mis cambios: mismas 4, 2 y 3 fallas.
   `probe_pagos_rol_carrera` ya es ISSUE-063.
3. **ISSUE-066** — el refactor de `switchTab` a `data-tab`. Sin síntoma hoy.
4. **Verificación en browser.** Chromium no corre en este Ubuntu (`docs/SERVER.md`). La solapa,
   los badges y el bloque de anulación están verificados por estructura y comportamiento, no por
   layout. Queda para una máquina con browser o para que Valeria lo mire.
5. **Nadie lo usó todavía.** Está en prod, probado contra el HTML servido, sin uso real.

---

# 11. VERIFICACIÓN DE PUBLICACIÓN

Se completa abajo con la salida real.
