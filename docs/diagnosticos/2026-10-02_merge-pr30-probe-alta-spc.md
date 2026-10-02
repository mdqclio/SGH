# Merge del PR #30 — probe del alta de SPC desde el portal en prod + ISSUE-098/099/100

- **Fecha:** 2026-10-02
- **OK:** pedido explícito ("OK, mergeá el PR #30").
- **Merge:** `fad1db8d86ae16c94c9aeaf3caf0e277387b7ea9` sobre `main` `c868ecc` (rama `chore/probe-portal-alta-spc-prod`, tip `c710339`).
- **Guards:** pwd=/home/clio/dev/SGH · ref=unlhcuanfrtpatoipwve · spcs=238 (foto del 02/10 00:22 UTC, este merge no toca la base).

## Qué entró

```
$ gh pr view 30 --json mergeable,state,headRefOid
OPEN UNKNOWN c710339625110bd4a589746cf9c3914000f20718
$ gh pr merge 30 --merge --subject "merge: probe del alta de SPC desde el portal en prod + ISSUE-098/099/100 — PR #30"
$ gh pr view 30 --json state,mergeCommit
MERGED fad1db8d86ae16c94c9aeaf3caf0e277387b7ea9
$ git diff --stat c868ecc fad1db8
 CLAUDE.md                            |   1 +
 docs/ISSUES.md                       |  31 ++++++
 tests/probe_portal_alta_spc_prod.mjs | 177 +++++++++++++++++++++++++++++++++++
 3 files changed, 209 insertions(+)
```

- `tests/probe_portal_alta_spc_prod.mjs`: el probe del paso 3 (14/14 el 02/10, informe `2026-10-02_portal-alta-spc-aplicado.md`).
- `CLAUDE.md`: la línea del probe en § Probes de regresión.
- `docs/ISSUES.md`: ISSUE-098 (`v_inscriptos_carrera` SECURITY DEFINER), ISSUE-099 (26 SECURITY DEFINER ejecutables por
  anon; diagnóstico de quién las llama antes de revocar; `authenticated` conserva `fn_is_staff`/`fn_is_portal_user`),
  ISSUE-100 (Wave Rimout duplicado).

**Archivos de la app servidos por Pages (`.html`/`.js` fuera de `tests/`) que cambian con este merge: 0.** No hace falta
verificar el deploy de pantallas: lo que sirve `sigh.com.ar` es igual que con `c868ecc` (verificado por md5 el 02/10 00:21 UTC).
No se aplicó nada en la base ni se deployó ninguna función.

## Pendientes (sin cambios)

ISSUE-098, ISSUE-099, ISSUE-100 como tareas aparte; el aviso al ratificar un caballo pendiente lo ves con Yesi.

## Verificación de push

```
$ git ls-remote origin reports
4963a188cf3c812c7da721b6e89ef24c68bb9aaf	refs/heads/reports
$ git rev-parse HEAD
4963a188cf3c812c7da721b6e89ef24c68bb9aaf
```

Coinciden. Este bloque va en un commit posterior.
