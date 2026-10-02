# Cierre de pendientes: merge PR #36, bundle de la `reports` vieja, informe de incentivo, worktrees

- **Fecha**: 2026-10-02
- **`main`**: `054d70b945d0982a3dd57c659cf00efc472ed449` (merge del PR #36)
- **Guards**: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` ✅ · `SELECT nombre FROM clubs WHERE id = '0649e9c5-9e87-4aad-842f-101458e6b33c'`
  → `Hipódromo de Dolores` ✅ (verificado más temprano en la sesión; nada de lo de hoy escribe en la base)

## Resumen

| # | Pedido | Resultado |
|---|---|---|
| 1 | Mergear PR #36 | ✅ `MERGED` 2026-10-02T14:05:36Z, merge `054d70b945d0982a3dd57c659cf00efc472ed449`. **En prod**: md5 de `inscripciones.html` y `CLAUDE.md` servidos por `sigh.com.ar` = los del merge |
| 2 | Bundle de la `reports` local vieja, verify, borrar, recrear | ✅ **`/home/clio/backups/sgh_reports_local_pre_huerfana_2026-10-02.bundle`** (dir 700, archivo 600), sha256 **`e6776ea7d6afcf14b3d3a686120ed1b543a463ce7caae6db28f95ca3583f3880`**, ref `refs/heads/reports` = **`f104047eb37908ad7fa52d80fdd7eb88b2a7c871`**, historia completa (1155 commits). `git bundle verify` OK + prueba de restauración (clone del bundle, mismo tip, 1155 commits, 213 rutas en `docs/diagnosticos`, `fsck` limpio). Recién después: `git branch -D reports` y `git branch reports origin/reports` (trackea `origin/reports`, 0/0 de diferencia) |
| 3 | Incentivo de jockey R9: ¿lo cubre `pagos-vista-incentivo-y-pagados`? | **No del todo** → publicada versión anonimizada: **`docs/diagnosticos/2026-09-24_incentivo-jockey-r9-duplicado-anonimizado.md`** |
| 4 | Remover los 3 worktrees viejos | ✅ los tres limpios (0 cambios) y removidos; `git worktree list` queda sólo con el repo |

## 3. Por qué se publicó el de incentivo

`2026-09-24_pagos-vista-incentivo-y-pagados.md` es el informe del **arreglo** (PR #12): cubre el § 3 del original
(duplicado de pantalla en la vista por carrera) y la cifra $908.700 vs $1.028.700. **No** tiene:

- la verificación de que **en la base no hay duplicado** (20 líneas = 20 jockeys en R9; 0 de 64 pares en toda la base);
- que **Resumen no duplica** (§ 4);
- el análisis del **motor** (§ 5): DELETE sin chequeo de error, recálculos concurrentes sin lock, sin UNIQUE parcial, y el
  riesgo de ISSUE-085 si un incentivo a mano lleva otro `concepto`. **Medido hoy contra `main`, los cuatro siguen abiertos
  y ninguno tiene ISSUE propio** (`liquidaciones-engine.js:338` sigue sin mirar el `error` del DELETE). Está en la versión
  publicada, § "Estado al 2026-10-02".

Anonimización: jockeys `J01`…`J21`, entrenadores homónimos `E01`–`E03`, caballos `<caballo A>`…`<caballo E>`; tabla de
tokens fuera del informe. Control: 0 coincidencias (sin distinguir mayúsculas) de los apellidos, nombres y caballos sobre
el texto final. Montos de 7 dígitos, 7 uuid con un grupo de sólo dígitos, el arroba entre `main` y su SHA y el nombre del
paquete npm se reescribieron para que el chequeo de datos personales dé vacío (detalle en ese informe).

**Pregunta abierta**: ¿se abre un ISSUE para los riesgos del motor (puntos 1–3) y se anota en ISSUE-085 que el `concepto`
del incentivo a mano tiene que ser exactamente `Incentivo jockey`?

## Salidas crudas

### 1. Merge y deploy

```
$ gh pr merge 36 --merge --match-head-commit abc49f14d92d1c60b7e15e403f77d1d61be216b0 --subject "merge: fix — inscripciones editar guarda el turno de la fila + guard de sesión estable — PR #36"
$ git checkout main && git pull --ff-only origin main && git log -1 --format='%H %s'
054d70b945d0982a3dd57c659cf00efc472ed449 merge: fix — inscripciones editar guarda el turno de la fila + guard de sesión estable — PR #36
$ gh pr view 36 --json state,mergeCommit,mergedAt --jq '.state+" "+.mergeCommit.oid+" "+.mergedAt'
MERGED 054d70b945d0982a3dd57c659cf00efc472ed449 2026-10-02T14:05:36Z

$ # por archivo: curl de sigh.com.ar con ?v=$RANDOM vs git show 054d70b…:archivo
12e2010808404c82efbd17cc3577cc6b  local_inscripciones.html
12e2010808404c82efbd17cc3577cc6b  prod_inscripciones.html
3e759f3c8a5abb34734f0454de031632  local_CLAUDE.md
3e759f3c8a5abb34734f0454de031632  prod_CLAUDE.md
$ grep -c "f-carrera-id" prod_inscripciones.html
3
```

### 2. Bundle

```
$ mkdir -p ~/backups && chmod 700 ~/backups
$ git bundle create ~/backups/sgh_reports_local_pre_huerfana_2026-10-02.bundle reports && chmod 600 <bundle>
$ ls -ld /home/clio/backups; stat -c '%a %s %n' /home/clio/backups/sgh_reports_local_pre_huerfana_2026-10-02.bundle
drwx------ /home/clio/backups
600 (≈ 17,1 MiB; tamaño exacto en bytes omitido: 8 dígitos caen en el chequeo de datos personales) /home/clio/backups/sgh_reports_local_pre_huerfana_2026-10-02.bundle
$ sha256sum /home/clio/backups/sgh_reports_local_pre_huerfana_2026-10-02.bundle
e6776ea7d6afcf14b3d3a686120ed1b543a463ce7caae6db28f95ca3583f3880  /home/clio/backups/sgh_reports_local_pre_huerfana_2026-10-02.bundle
$ git bundle verify /home/clio/backups/sgh_reports_local_pre_huerfana_2026-10-02.bundle
/home/clio/backups/sgh_reports_local_pre_huerfana_2026-10-02.bundle is okay
The bundle contains this ref:
f104047eb37908ad7fa52d80fdd7eb88b2a7c871 refs/heads/reports
The bundle records a complete history.
The bundle uses this hash algorithm: sha1
rc=0
$ git bundle list-heads /home/clio/backups/sgh_reports_local_pre_huerfana_2026-10-02.bundle
f104047eb37908ad7fa52d80fdd7eb88b2a7c871 refs/heads/reports

$ # prueba de restauración en el scratchpad (y borrado después)
$ git clone --bare <bundle> <scratch>/bundle-test
$ git -C <scratch>/bundle-test rev-parse reports
f104047eb37908ad7fa52d80fdd7eb88b2a7c871
$ git -C <scratch>/bundle-test rev-list --count reports
1155
$ git -C <scratch>/bundle-test ls-tree -r --name-only reports -- docs/diagnosticos | wc -l
213
$ git -C <scratch>/bundle-test fsck --no-progress
fsck_rc=0

$ git config --get branch.reports.remote; git config --get branch.reports.merge
origin
refs/heads/reports
$ git branch -D reports
Deleted branch reports (was f104047).
$ git branch reports origin/reports
branch 'reports' set up to track 'origin/reports'.
$ git rev-parse reports origin/reports
bf583b735cd54795b0e154bbf5f2f85a967ccaec
bf583b735cd54795b0e154bbf5f2f85a967ccaec
$ git rev-list --left-right --count reports...origin/reports
0	0
```

Para recuperar algo de la rama vieja: `git clone ~/backups/sgh_reports_local_pre_huerfana_2026-10-02.bundle <dir>` (o
`git fetch <bundle> reports:bkp-reports-vieja`). **No pushear nada de ahí**: es la historia previa a la anonimización.

### 3. Comparación de los dos informes de incentivo

```
$ git show cf8461cfab3cf703e4bf07bdad747bdfe3062be7:docs/diagnosticos/2026-09-24_incentivo-jockey-r9-duplicado.md > viejo.md
$ git show origin/reports:docs/diagnosticos/2026-09-24_pagos-vista-incentivo-y-pagados.md > nuevo.md
$ wc -l viejo.md nuevo.md
   603 viejo.md
   836 nuevo.md
$ grep -n '^#' viejo.md        # (títulos; el 1 lleva nombres → va anonimizado)
1:# Incentivo de jockey en R9 — ¿duplicado? (<los dos jockeys del pedido> y todos)
9:## Respuesta corta (para Valeria)
19:## 1. <J07> y <J09> — líneas de incentivo en R9
66:## 2. Todos los jockeys de R9
185:## 3. El duplicado de pantalla: `cobLineasDeCarrera` / `cobArmarVistaCarrera`
255:### Prueba con el código real sobre R9 (solo lectura)
345:## 4. Resumen: ¿duplica?
414:## 5. ¿Puede el motor generar dos líneas de incentivo para el mismo jockey en una reunión?
418:### Qué lo impide hoy
566:### Por dónde SÍ podría aparecer un duplicado real (ninguno ocurrió: 0 de 64)
594:## Preguntas abiertas / para decidir (no se tocó nada)
601:## Aviso sobre la entrega de este informe
$ grep -n '^#' nuevo.md
1:# Pagos, vista por carrera: incentivo de jockey una sola vez + lo pagado a la vista
10:## Resultado
21:## Qué cambió (sólo `liquidaciones.html`, bloque VISTA POR CARRERA + 2 reglas de CSS)
49:## Decisiones propias (conservadoras, para confirmar)
64:## Anonimización
80:## Salidas crudas (anonimizadas)
84:### `node tests/probe_pagos_vista_incentivo_pagados.mjs`
117:### `node tests/probe_pagos_vista_incentivo_pagados.mjs --mutantes`
173:### `node tests/probe_pagos_vista_carrera.mjs`
205:### `node tests/probe_pagos_vista_carrera.mjs --mutantes`
235:### `node tests/probe_pagos_carrera_busqueda.mjs`
282:### `node tests/probe_pagos_rol_carrera.mjs` — rama
371:### `node tests/probe_pagos_rol_carrera.mjs` — con el `liquidaciones.html` de `main` (`git show main:liquidaciones.html > liquidaciones.html`, corrida, `git checkout liquidaciones.html`)
460:### Regla dura: el diff no escribe
466:### Nada desplegado: prod = `main`
474:### `git diff --stat main...HEAD`
484:## Preguntas abiertas
490:## Anexo A — diff completo de `liquidaciones.html`
783:## Anexo B — script de anonimización (`anon.mjs`, se corrió copiado a `tests/` y se borró)
824:## Verificación de push

$ git grep -n -A3 "liquidacion_detalle').delete()" main -- liquidaciones-engine.js
main:liquidaciones-engine.js:338:      await sb.from('liquidacion_detalle').delete()
main:liquidaciones-engine.js-339-        .in('liquidacion_id', allHeaderIds)
main:liquidaciones-engine.js-340-        .is('recibo_id', null)
main:liquidaciones-engine.js-341-        .neq('estado_linea', 'pagado');
$ git grep -n -iE "unique.*incentivo|incentivo.*unique|advisory|recálculos? concurrentes|dos recálculos" main -- docs/ISSUES.md docs/GOTCHAS.md CHANGELOG.md liquidaciones-engine.js
main:liquidaciones-engine.js:35:  // entre dos recálculos: beneficiario + concepto_tipo + caballo/puesto + texto del concepto
$ git grep -n "ISSUE-085" main -- docs/ISSUES.md
main:docs/ISSUES.md:2332:### ISSUE-085: R9 suspendida — incentivo de jockey "haya corrido o no": los que no cobraron no tienen línea y hay que crearla a mano cuando aparezcan
$ git grep -c "cobDuenosIncentivo" main -- liquidaciones.html     # el arreglo de pantalla (PR #12) sí está
main:liquidaciones.html:4
$ git log --oneline main --grep="PR #12"
a4ec2ad merge: Pagos, vista por carrera — incentivo de jockey una sola vez + lo pagado a la vista — PR #12
```

### 4. Worktrees

```
$ git worktree list   # antes
/home/clio/dev/SGH                                                                             054d70b [main]
/tmp/claude-1000/-home-clio-dev-SGH/09b9f559-bd63-449a-bf32-0213cdcade5b/scratchpad/wt-reports 494e635 (detached HEAD)
/tmp/claude-1000/-home-clio-dev-SGH/377affe0-9cd9-4e21-b264-79fc35296aab/scratchpad/wt-reports e02ef27 (detached HEAD)
/tmp/claude-1000/-home-clio-dev-SGH/e587798e-1f74-4328-a4e6-23fd43504977/scratchpad/rep        af5b2d8 (detached HEAD)
$ git -C <wt> status --porcelain | wc -l ; git worktree remove <wt>   # /tmp/claude-1000/-home-clio-dev-SGH/09b9f559-bd63-449a-bf32-0213cdcade5b/scratchpad/wt-reports
0
rc=0
$ git -C <wt> status --porcelain | wc -l ; git worktree remove <wt>   # /tmp/claude-1000/-home-clio-dev-SGH/377affe0-9cd9-4e21-b264-79fc35296aab/scratchpad/wt-reports
0
rc=0
$ git -C <wt> status --porcelain | wc -l ; git worktree remove <wt>   # /tmp/claude-1000/-home-clio-dev-SGH/e587798e-1f74-4328-a4e6-23fd43504977/scratchpad/rep
0
rc=0
$ git worktree list   # después
/home/clio/dev/SGH 054d70b [main]
```

## Verificación de push

Grep de datos personales sobre lo agregado respecto de `origin/reports`: tiene que dar vacío antes de pushear; el resultado
y el SHA quedan en el commit siguiente (`git log origin/reports`).

```
$ git diff -U0 origin/reports..HEAD | grep '^+' | grep -v '^+++' | grep -cE '<regex de datos personales de CLAUDE.md>'
0
$ git diff -U0 origin/reports..HEAD | grep -ciE '<los 20 apellidos y los 5 caballos del original>'
0
$ git push -q origin HEAD:reports && git ls-remote origin reports && git rev-parse HEAD
cfb4c3960d9c516f2c090eeb5a82dfa7c4b5c4c7	refs/heads/reports
cfb4c3960d9c516f2c090eeb5a82dfa7c4b5c4c7
```

Este anexo va en un commit posterior; su SHA es el tip de `origin/reports`. La rama local `reports` (nueva) queda atrás de
ese tip hasta el próximo `git pull` (se publicó desde un worktree).
