# FASE 4 — Limpieza de backups — RESULTADO

**Fecha:** 2026-06-07 · **Rama:** `chore/cleanup-backups` (NO main) · **Migración:** `migrations/cleanup_backups_fase4.sql`

## Bottom line

Migración **escrita y commiteada** a la rama. **NO ejecutada contra la DB**: esta sesión no
tiene ninguna vía de escritura DDL (sin Supabase MCP cargado, sin `psql`/CLI, `npx` install
bloqueado, Management API rechaza el secret key del proyecto con 401 — requiere PAT `sbp_`,
sin password de DB, sin RPC `exec_sql`). REST con service_role solo permite **leer/verificar**.
Acción del dueño: correr la migración desde el **SQL Editor de Supabase** (o pasar un PAT / restaurar el MCP).

## 1) Verificación previa (no hay referencias) — PASA

- Grep en repo (`*.html`, `*.js`, `*.json`) + `migrations/*.sql`: **0 referencias** a `backup_*_20260515` ni `spc_entrenadores_hist`.
- pg_proc en vivo (cuerpos de funciones/RPC) **no introspectado** — sin conexión DB. La fuente
  de verdad versionada de funciones no las referencia. Confirmar en el SQL Editor con:
  ```sql
  SELECT proname FROM pg_proc
  WHERE prosrc ILIKE '%backup_%20260515%' OR prosrc ILIKE '%spc_entrenadores_hist%';
  ```
  Si devuelve filas → **FRENAR**.

## 2) Row counts (REST service_role, 2026-06-07) — confirman el plan

| tabla | filas | acción |
|---|---|---|
| `backup_novedades_reunion_20260515` | 0 | DROP |
| `backup_spc_entrenadores_hist_20260515` | 0 | DROP |
| `backup_spc_propietarios_20260515` | 0 | DROP |
| `backup_inscripciones_20260515` | 87 | → `archive` (SET SCHEMA) |
| `backup_spcs_20260515` | 52 | → `archive` (SET SCHEMA) |
| `spc_entrenadores_hist` | 0 | dejar — bloqueo intencional |

## 3) Qué hace la migración

1. DROP de los 3 backups vacíos (con guard `DO` que aborta si alguno tiene filas).
2. `CREATE SCHEMA IF NOT EXISTS archive` + `ALTER TABLE … SET SCHEMA archive` para los 2 con datos.
   Datos preservados; `archive` no se expone vía PostgREST.
3. `spc_entrenadores_hist`: no se toca. `COMMENT ON TABLE` documenta el deny-all intencional
   (RLS ON sin policy = solo service_role); el lint `rls_enabled_no_policy` sobre esa tabla queda **aceptado**.

## 4) Autoverificación (pendiente — correr tras aplicar)

Queries (a)/(b)/(c) embebidas al pie de `migrations/cleanup_backups_fase4.sql`:
- (a) `public` sin ninguna `backup_*20260515` → 0 filas.
- (b) `archive.backup_inscripciones_20260515` = 87 · `archive.backup_spcs_20260515` = 52.
- (c) advisor `rls_enabled_no_policy` ya no lista las 4 backup_*; la única que puede seguir es
  `spc_entrenadores_hist` (aceptado).

## Diagnóstico MCP (2026-06-08) — root cause del bloqueo DDL

- **Servidores MCP conectados esta sesión:** `n8n`, `firebase` (+ Gmail / Calendar / Drive / claude-mem vía claude.ai). **Supabase NO conectado** (0 tools `mcp__supabase__*`).
- **Config del MCP de Supabase:** project-scoped en `~/.claude.json` (no hay `.mcp.json` en el repo). Token vía **env var** (no inline):
  ```json
  "supabase": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@supabase/mcp-server-supabase@latest", "--project-ref=unlhcuanfrtpatoipwve"],
    "env": { "SUPABASE_ACCESS_TOKEN": "***REDACTED***" }
  }
  ```
- **Por qué está caído:** el server se lanza con `npx -y @supabase/...@latest`; en esta sandbox `npx` no puede bajar el paquete (`npm ERR! canceled`) → el server nunca arranca → sin tools → sin vía DDL. El `SUPABASE_ACCESS_TOKEN` es el PAT `sbp_` que la Management API pedía (el 401 previo), pero queda encerrado en el env del MCP que no bootea.
- **Destrabar:** dar red a `npx` para bajar `@supabase/mcp-server-supabase` (o pre-instalar/cachear) + reiniciar la sesión MCP, y se corre la migración por el MCP. Alternativa: pegar el `.sql` en el SQL Editor.

## ✅ FASE 4 APLICADA Y VERIFICADA (2026-06-08)

Se destrabó el MCP de Supabase (tools `mcp__supabase__*` disponibles esta sesión). La migración `cleanup_backups_fase4.sql` quedó **aplicada en la DB** y se corrieron las 3 autoverificaciones (a)/(b)/(c) vía `execute_sql`:

```
(a) public_backups_left           = 0                       ✅ (3 vacías dropeadas)
(b) archive.backup_inscripciones  = 87                      ✅ (movida, datos intactos)
    archive.backup_spcs           = 52                      ✅ (movida, datos intactos)
(c) rls_no_policy en public       = spc_entrenadores_hist   ✅ (única, ACEPTADA deny-all)
```

Resultado: 5 backups del 2026-05-15 fuera de `public` (3 dropeadas + 2 en `archive`, fuera de la API PostgREST). El lint `rls_enabled_no_policy` ya solo lista `spc_entrenadores_hist`, que es el bloqueo intencional documentado.

## Estado

- [x] Grep repo + migrations limpio
- [x] Row counts verificados (REST)
- [x] Migración escrita y commiteada a `chore/cleanup-backups`
- [x] Rama pusheada a origin
- [x] **DDL ejecutado** — aplicado vía MCP Supabase (2026-06-08)
- [x] **Autoverificación post-aplicación** — (a)=0 · (b)=87/52 · (c)=solo spc_entrenadores_hist

## Resumen sesión (2026-06-08)

- MCP Supabase ahora conectado (estaba caído sesión anterior → bloqueaba DDL).
- FASE 4 cleanup_backups ya **aplicada en DB**, verificada 3/3:
  - 3 backups vacías dropeadas, 0 quedan en `public`
  - `archive.backup_inscripciones` (87) + `archive.backup_spcs` (52) intactas, fuera de API
  - `rls_no_policy` solo `spc_entrenadores_hist` (deny-all intencional)
- Docs commiteados + pusheados: RESULTADO.md (checkboxes DDL/verif cerrados) + cierre "PROD ARRIBA" en REMEDIACION_RESULTADO.md.
- Rama en `chore/cleanup-backups`, no main. Falta merge a main si se quiere que entre a docs de prod.
