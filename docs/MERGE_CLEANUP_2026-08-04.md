# Tanda de merges de registro + limpieza de ramas

**Fecha**: 2026-08-04 · **Repo**: `/home/clio/dev/SGH`
**main antes**: `35b32c2` · **main después**: **`8fd4d1a36476641fcfe1c3f3b3f2f01cd61360ed`**
Sin force push. Sin rebase de main. Ningún conflicto.

---

## Parte 1 — Merges a main

Los 7 merges se pre-chequearon con `git merge-tree --write-tree` contra el main del momento, uno por uno, antes de ejecutarlos. Todos limpios.

| # | rama | SHA | main queda en | qué trae |
|---|---|---|---|---|
| 1 | `tmp/deploy-json-v2` | `5b933da` | `cc21f5a` | `feat/json-v2-diego` completo (el código que corre en prod como **v16**) + build de archivo único + rollback pre-staged + reporte de deploy |
| 2 | `chore/spcs-r8-circuito` | `7d8e5e7` | `b2c63a4` | circuito del scraper para las tandas de R8 |
| 3 | `tmp/rotacion-studbook` | `09f6bf2` | `d16245b` | registro de la rotación del token (sólo docs) |
| 4a | `tmp/yunta-mandil` | `d36e1c9` | `95a3ade` | relevamiento de yunta/mandil + CSV del catálogo de chapas |
| 4b | `tmp/integracion-studbook` | `f3a1162` | `cc90508` | relevamiento del estado de la integración Stud Book |
| 4c | `tmp/analisis-r6-portal` | `fa1d6d5` | `5a562ef` | análisis de R6 para el portal |
| 4d | `tmp/portal-v2-plan` | `41e1a19` | `8fd4d1a` | plan del portal v2 |

### Punto 5 — `chore/probe-invite-smtp-cuota` (`8940766`)

**No hizo falta mergearlo**: tras los merges anteriores ya era ancestro de main. Entró por partida doble, vía `tmp/analisis-r6-portal` y `tmp/portal-v2-plan`, que estaban ramificadas de un commit que ya lo contenía. Verificado con `git merge-base --is-ancestor`.

### `git log --oneline -12` de main

```
8fd4d1a Merge: plan del portal v2
5a562ef Merge: análisis de R6 para el portal
cc90508 Merge: relevamiento del estado de nuestro lado de la integración Stud Book
95a3ade Merge: relevamiento de yunta, mandil y catálogo de chapas
d16245b Merge: registro de la rotación de STUDBOOK_API_TOKEN
b2c63a4 Merge: circuito de alta incremental de SPCs para R8
cc21f5a Merge: JSON v2 del Stud Book — código en prod (v16) + build + rollback + reporte de deploy
5b933da deploy(studbook): reunion-json v2 en producción — v15 a v16, verificado
f254bb7 build(studbook): build de deploy de reunion-json + rollback pre-staged
09f6bf2 sec(studbook): STUDBOOK_API_TOKEN rotado y verificado
8f2b329 docs(sec): rotación de STUDBOOK_API_TOKEN — Fase 1 generado, Fase 2 bloqueada
222c1e2 docs(studbook): cierre del JSON v2 — cambios, verificación y casos abiertos
```

### GitHub Pages sigue sirviendo

```
git diff --stat 35b32c2..main -- '*.html'                    → vacío
git diff --stat 35b32c2..main -- '*.js' ':!tools/*' ':!tests/*' → vacío
```

**Ningún HTML ni JS de producción cambió.** Los 26 archivos tocados se reparten en `supabase/` (12), `docs/` (9), `tools/` (2), `tests/` (2), `data/` (1).

Smoke contra prod después del push:

| URL | HTTP |
|---|---|
| `https://mdqclio.github.io/SGH/` | 200 |
| `.../index.html` | 200 |
| `.../resultados.html` | 200 |

---

## Parte 2 — Limpieza

Criterio mecánico, se borra sólo si:

- **(a)** `git merge-base --is-ancestor <rama> main` → `true`, o
- **(b)** su contenido es **byte-idéntico** a algo ya en main (comparación por hash de blob).

### Ramas borradas por criterio (a) — 51 locales

Todos sus commits ya están en main.

| rama | SHA | | rama | SHA |
|---|---|---|---|---|
| `chore/docs-julio` | `e411eaa` | | `feat/premios-display-v2` | `0fac812` |
| `chore/docs-premios-restore` | `06e45c2` | | `feat/resumen-desglose` | `f084765` |
| `chore/docs-sync-2026-06-08` | `970fe0d` | | `feat/sorteo-gateras` | `73d7f80` |
| `chore/probe-invite-smtp-cuota` | `8940766` | | `feat/vacante-manual` | `0081762` |
| `chore/schema-drift` | `c765cb5` | | `feat/vacante-vac-inline` | `e663349` |
| `chore/spcs-r8-circuito` | `7d8e5e7` | | `fix/bolsa-efectiva-display` | `b84ce3b` |
| `docs/liquidaciones-gap-analysis` | `c04f875` | | `fix/carrera-num-null-check` | `0068a51` |
| `docs/perf-audit` | `f12860d` | | `fix/chapa-4-medio` | `f9f8807` |
| `docs/sesion-2026-06-15` | `0068a51` | | `fix/edad-display-tope-abierto` | `6683309` |
| `feat/apoderados-v1` | `946ce0c` | | `fix/forfait-anulada-impreso` | `71c796d` |
| `feat/apoderados-v1.1-pagos` | `29a89ed` | | `fix/great-orpen-pedigree` | `f02fce5` |
| `feat/buscador-liquidaciones` | `f5e4ec9` | | `fix/orden-foot-forfaits` | `5b73a16` |
| `feat/carga-spcs-20j` | `a19a536` | | `fix/pdf-query-columnas` | `0fa49bb` |
| `feat/cobros-v1.1` | `106ac3e` | | `fix/security-hardening` | `59a0c6d` |
| `feat/desoficializar-rpc` | `fdc2fee` | | `perf/r1-r3-indices` | `af6f7eb` |
| `feat/fase5-resumen` | `80d9b7e` | | `sec/rls-portal-fase-0` | `e937ddc` |
| `feat/incentivos-montas` | `588c22a` | | `sec/rls-portal-fase-1` | `3ec3f91` |
| `feat/invitacion-reintento` | `636fbb4` | | `sec/rls-portal-fase-2` | `65e5c88` |
| `feat/invite-retry` | `58d90ed` | | `sec/rls-portal-fase-3` | `1b72c85` |
| `feat/json-v2-diego` | `222c1e2` | | `style/forfaits-h-negro` | `abe96e2` |
| `feat/liquidaciones-cd` | `b890f57` | | `tmp/analisis-r6-portal` | `fa1d6d5` |
| `feat/liquidaciones-fase-c` | `f80c839` | | `tmp/deploy-json-v2` | `5b933da` |
| `feat/mandil-display` | `c7651f1` | | `tmp/integracion-studbook` | `f3a1162` |
| `feat/oficializar-carrera` | `0cbb587` | | `tmp/portal-v2-plan` | `41e1a19` |
| `feat/pedigree-programa` | `2562555` | | `tmp/rotacion-studbook` | `09f6bf2` |
| | | | `tmp/yunta-mandil` | `d36e1c9` |

Se usó `git branch -d` (no `-D`) para que la propia comprobación de git actuara como segundo chequeo. **50 de 51 se borraron sin objeción.**

**Excepción documentada — `feat/buscador-liquidaciones` (`f5e4ec9`)**: `-d` se negó con
*"not deleting branch that is not yet merged to 'refs/remotes/origin/feat/buscador-liquidaciones', **even though it is merged to HEAD**"*.
No era un problema de contenido: la rama local estaba **adelantada respecto de su propio remoto**, y git chequea también contra el upstream. Contra main, `git rev-list --count main..feat/buscador-liquidaciones` = **0**. Cumple (a) sin ambigüedad, así que se borró con `-D` dejando esto asentado.

### Ramas borradas por criterio (b) — 2

Sus commits **no** están en main, pero su contenido sí, byte a byte:

| rama | SHA | archivo | blob sha1 | mismo blob en main |
|---|---|---|---|---|
| `perf/audit-escala-10-clubes` | `70bcac8` | `docs/PERF_AUDIT.md` | `e6894feb4b7718ef0440beb969a71aed315d20ef` | `docs/PERF_AUDIT.md` |
| `perf/r2a-wrap-policies` | `a751775` | `migrations/r2a_wrap_policies_initplan.sql` | `577800b66e5ba103e4f3c2c8cdc9217c62987954` | `migrations/r2a_wrap_policies_initplan.sql` |

Mismo hash, misma ruta. La migración de `perf/r2a-wrap-policies` había entrado a main vía `sec/rls-portal-fase-3`, como se sospechaba.

### Ramas remotas borradas — 54

Se evaluaron **por separado de las locales**, porque un ref remoto puede diverger del local. Las 54 que resultaron ancestro de main (más las 2 de criterio (b)) se borraron de `origin`.

Incluye 7 que sólo existían en el remoto y también cumplían (a): `chore/add-claude-md`, `feat/no-corrio-v3`, `feat/vacante-hibrido`, `feature/feedback-fede-2026-05-25`, `fix/marcador-divs-live-sync`, `fix/marcador-input-validation`, `fix/mf-sport-mandiles-reales`.

> **Nota de método**: el criterio inicial se aplicó a refs **locales**. El rechazo de `-d` en `feat/buscador-liquidaciones` reveló que local y remoto pueden estar desincronizados, así que los remotos se re-evaluaron desde cero contra main antes de borrar ninguno. Ningún remoto se borró en base a la evaluación de su contraparte local.

### Ramas CONSERVADAS — 13 locales / 13 remotas

Ninguna cumple (a) ni (b): tienen commits **y** contenido que no están en main.

| rama | SHA | commits fuera de main | archivos que no están en main |
|---|---|---|---|
| `audit/portal-onboarding` | `14104e7` | 1 | `docs/AUDIT_PORTAL_ONBOARDING.md` — **además, excluida por instrucción explícita** |
| `chore/cleanup-backups` | `940887c` | 4 | `REMEDIACION_RESULTADO.md`, `RESULTADO.md`, `migrations/cleanup_backups_fase4.sql` |
| `chore/prof-diff-20j` | `2b4d734` | 1 | `data/prof_diff_20j.md` |
| `chore/rls-audit` | `cd7cb4e` | 5 | `data/SEGURIDAD_AUTH_RLS.md`, `data/auth_flow_audit.md`, `data/rls_audit.md`, `docs/plan_alta_invitacion.md` |
| `chore/verif-r6` | `75c82ae` | 1 | `tmp/verif_oficializacion_r6.md` |
| `feat/asignacion-prof-20j` | `7b04b79` | 5 | 5 archivos en `data/` |
| `feat/carga-prof-20j` | `ca39cca` | 3 | 3 archivos en `data/` |
| `feat/studbook-extract` | `821dad0` | 3 | `data/studbook_26.json`, `data/studbook_26_insert_report.md`, `docs/AUDIT_PORTAL_ONBOARDING.md`, `tools/sb_extract.py` |
| `tmp/deploy-report` | `da51206` | 1 | `docs/DEPLOY_INVITE_USER_2026-07-28.md` |
| `tmp/estado-r8` | `c36b8b2` | 2 | `docs/ESTADO_R8.md`, `docs/PROBE_RUN_1.md` |
| `tmp/probe-analisis` | `e37d009` | 1 | `docs/PROBE_INVITE_USER_ANALISIS.md` |
| `tmp/probe-run-1` | `8c26c0b` | 1 | `docs/PROBE_RUN_1.md` |

Y en el remoto, **`origin/mockup/no-corrio-ui`**: cumple (a) —es ancestro de main— pero está **excluida por instrucción explícita**, así que no se tocó.

### Resumen numérico

| | antes | después |
|---|---|---|
| ramas locales (sin `main`) | 65 | **12** |
| ramas remotas (sin `main`) | 67 | **13** |
| borradas locales | — | 53 (51 por (a) + 2 por (b)) |
| borradas remotas | — | 54 |

`main` local y `origin/main` sincronizados en `8fd4d1a`.

---

## Pendientes que quedan abiertos

De las fases anteriores, sin cambios:

- Higiene de secretos en el VPS: `shred -u ~/secrets/studbook_token_2026-08.env` y `~/secrets/supabase_pat.env`.
- Entregar el token nuevo a Diego junto con el changelog de contrato del JSON v2 (`docs/DEPLOY_JSON_V2.md` §8).
- El próximo deploy de `reunion-json` debe enviar `_build/index.ts` **tal cual**: el archivo que quedó vivo tiene los comentarios condensados respecto del build generado (código ejecutable idéntico, probado por el sha256 de la respuesta).
- `tools/samples/9999_sample.json` desactualizado a propósito.
- Confirmar por dashboard si `STUDBOOK_API_TOKEN` quedó seteado también en el proyecto Cambios.
