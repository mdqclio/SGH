# SECURITY_AUDIT.md — Auditoría + Remediación de seguridad SGH

| | |
|---|---|
| **Repo** | `/home/clio/dev/SGH` (github.com/mdqclio/SGH) |
| **Auditoría** | 2026-06-07 (solo lectura) |
| **Remediación** | 2026-06-07, rama `fix/security-hardening` (NO mergeada a main) |
| **Secretos** | siempre enmascarados (prefijo + cola de firma). Los 3 JWT comparten header `eyJhbGci…`. |

---

## 1. Scan de secretos (working tree + historial, 466 commits)

| Patrón | Working tree | Historial | Veredicto |
|---|---|---|---|
| `sbp_` (PATs) | 0 | **0** | ✅ el PAT comprometido nunca se commiteó |
| `sb_secret_` | 0 | 0 | ✅ |
| `sb_publishable_` | 0 (solo nombrado en docs) | — | frontend aún sin migrar (ver FASE 0) |
| JWT `anon` (`…Vmkn1SYM`) | 32 archivos | 452 commits | público por diseño; ahora DESACTIVADO → app caída hasta FASE 0 |
| JWT `service_role` (`…hQi3vQcE`) | 1 archivo (doc) | **142 commits** | 🔴 crítico; inerte solo tras desactivación. Doc scrubbeado (FASE 2). |
| JWT `anon` typo (`…Vmkb1SYM`) | 0 | 1 commit | benigno (1 char corrupto, firma muerta) |

---

## 2. Cobertura RLS (Supabase MCP)

- **37 tablas, todas RLS ON. Cero RLS OFF.** ✅
- Liquidación/recibos (`liquidaciones`, `liquidacion_detalle`, `liquidacion_config`, `recibos`, `club_secuencias`): club-scoped, limpio. ✅
- **Permisivas `USING(true)`** al auditar: 10 → **2 cerradas en FASE 1** (apuestas), **8 gateadas en FASE 3** (catálogos).
- **6 tablas RLS-ON-sin-policy**: 5 `backup_*` + `spc_entrenadores_hist` → FASE 4.

### Advisor (delta auditoría → post-remediación)

| Lint | Antes | Después | Fase |
|---|---|---|---|
| `security_definer_view` (ERROR) | 4 | **0** | FASE 2 |
| `function_search_path_mutable` | 6 | **0** | FASE 2 |
| `rls_policy_always_true` (apuestas) | 2 | **0** | FASE 1 |
| `rls_policy_always_true` (catálogos) | 8 | 8 (gated) | FASE 3 |
| `public_bucket_allows_listing` | 1 | **0** | FASE 2b |
| `*_security_definer_function_executable` (sensibles: purgar/recibo/aplicar/auditoria/set_propietario) | sí | **revocadas de anon** | FASE 2/2b |
| `*_security_definer_function_executable` (helpers RLS `fn_club_de_*`/`fn_is_super_admin`/`fn_get_user_club_id`) | sí | intactas (GOTCHA #26) | n/a |
| `rls_enabled_no_policy` | 6 | 6 | FASE 4 |
| `auth_leaked_password_protection` | off | off | MANUAL (dashboard) |

---

## 3. Frontend (FASE 0)

- `supabase.js` + 31 páginas (30 archivos con el JWT exacto, 1 occurrencia c/u) usan la **anon legacy desactivada** → app caída.
- `supabase.js:5` tiene typo de URL `…Supabase.co` (S mayúscula).
- `sb_publishable_` no está en ningún archivo → swap pendiente.

---

# Remediación aplicada (2026-06-07)

Rama `fix/security-hardening`. DB vía Supabase MCP (`apply_migration`); cada cambio versionado en `migrations/`. **No mergeado a main.**

## ✅ FASE 1 — cierre crítico anon en apuestas (APLICADA + verificada)
`migrations/security_hardening_fase1_apuestas_rls.sql`
- `carrera_apuestas.allow_all` (rol `public`, incl. anon) y `resultado_apuestas.allow_all_resultado_apuestas` (anon+authenticated) → **reemplazadas** por 4 policies club-scoped `TO authenticated` c/u (patrón de `inscripciones`).
  - scope: `fn_club_de_carrera(carrera_id)` / `fn_club_de_resultado(resultado_id)` = `fn_get_user_club_id()` (o super_admin).
- **Precondición verificada:** las escrituras corren autenticadas (`resultados.html` F10 vía RPC, `programa.html` tras `initAuth`). anon ya no lee ni escribe apuestas/dividendos.
- **Verificación:** `pg_policies` → 4+4 policies `{authenticated}`, sin anon, sin always-true. Advisor: los 2 lints `allow_all` desaparecieron.
- ⚠️ **Cambio de comportamiento:** `programa-oficial.html` / `-color.html` no tienen gate de auth; leían `carrera_apuestas` apoyados en la sesión de localStorage. Tras FASE 0 funcionan abiertos **estando logueado** (norma actual). Recomendado follow-up: agregarles gate de auth explícito.

## ✅ FASE 2 — hardening reversible (APLICADA + verificada)
`migrations/security_hardening_fase2_reversible.sql`
- **Vistas → `security_invoker=true`:** `v_spcs_activos`, `v_programa_reunion`, `v_inscriptos_carrera`, `v_sanciones_vigentes`. (4 ERROR del advisor → 0)
- **`search_path=public`** (ALTER, sin recrear): `calcular_premio`, `validar_inscripcion`, `set_updated_at`, `fn_purgar_auditoria`, `fn_proteger_rol_club_id_usuario`, `aplicar_resultado`. (6 WARN → 0)
- **Grants RPC** (el EXECUTE default va a PUBLIC → se revoca de PUBLIC + grant selectivo):
  - `aplicar_resultado`, `fn_siguiente_recibo`: `REVOKE FROM PUBLIC, anon` → quedan authenticated + service_role (la app las necesita).
  - `fn_purgar_auditoria`: solo `service_role` (mantenimiento).
  - `fn_auditoria_log`: solo `service_role` (trigger fn, dispara sin EXECUTE).
  - **Helpers de RLS NO tocados** (`fn_club_de_*`, `fn_is_super_admin`, `fn_get_user_club_id` — GOTCHA #26).
- **Bucket `chaquetillas`:** SELECT pública amplia → restringida (luego eliminada en 2b).

`migrations/security_hardening_fase2b_residuals.sql`
- **Bucket:** SELECT policy **eliminada** (app solo usa `getPublicUrl`, nunca `.list()`; bucket público sirve URLs directas sin RLS). → lint `public_bucket_allows_listing` a 0.
- **Trigger-fns fuera de RPC:** `fn_inscripcion_set_propietario`, `fn_caballeriza_resp_set_propietario` (`RETURNS trigger`) → `REVOKE FROM PUBLIC, anon, authenticated`.

`migrations/security_hardening_fase2c_audit_fn.sql`
- **`fn_audit_policies_permisivas()`** (SECURITY DEFINER, grant solo service_role): lista policies de escritura con `USING/WITH CHECK = true`. Soporta el probe de regresión.

### Doc scrub (FASE 2)
- `docs/auditoria/SGH-REMEDIACION.md`: token `service_role` en texto plano → placeholder `<PEGAR_SERVICE_ROLE_JWT_REVOCADA_AQUI>`; `"14 commits"` → `"142 commits"` (conteo real). (Fragmentos de needle de `grep` se conservan: no son la key usable.)

### Probe de regresión
- `tests/probe_rls_no_permissive.mjs`: falla si queda cualquier policy de escritura `USING(true)/WITH CHECK(true)` fuera de una allowlist. La allowlist contiene SOLO las 8 de catálogos gateadas en FASE 3 (marcadas “QUITAR AL APLICAR FASE 3”). Cierra el pendiente §2 de SGH-REMEDIACION.md. Sintaxis ✅; corrida real requiere `SUPABASE_SECRET_KEY`.

## ✅ FASE 0 — RESTORE app (APLICADA + verificada)
- JWT anon legacy exacto → publishable (`sb_publishable_…WgAK`) en **30 archivos** (29 HTML + `supabase.js`, 1 occ. c/u); typo `Supabase.co`→`supabase.co` en `supabase.js`.
- **Verificación:** publishable contra API → 200+[] (válida, RLS aplica); anon legacy → 401 "Legacy API keys are disabled" (muerta); 0 JWT anon restantes; smoke autenticado dolores: read scope (anon 0 / dolores 39) + write round-trip OK + anon write bloqueado (42501).
- ⚠️ **En la rama, no en prod:** GitHub Pages sirve `main` (anon muerta) → **prod caído hasta mergear `fix/security-hardening`** (lo decidís vos).
- **GOTCHA #2 obsoleto:** `sb_publishable_` ahora funciona; corregir CLAUDE.md + `docs/GOTCHAS.md`.

## ⏹️ FASE 3 — CATÁLOGOS (PROPUESTA, GATEADA — requiere tu OK)
Tablas `spcs`, `propietarios`, `profesionales`, `spc_propietarios` con INSERT/UPDATE `WITH CHECK(true)` `TO authenticated` (anon ya está fuera; es aislamiento entre clubs, no agujero anon).

**Flujo real verificado:** `spcs.html` inserta `club_id: null` (global); `propietarios.html` no estampa club_id (global); `jockeys.html` estampa `club_id: CLUB_ID`; `spc_propietarios` no tiene columna club_id. → **son catálogos globales a propósito**; un club-scope estricto rompería la creación global y no mapea sobre filas null / tablas link.

**Opciones (decisión de producto):**
1. **Scope suave (sin romper flujo):** INSERT `WITH CHECK (super_admin OR club_id IS NULL OR club_id = user_club)`; UPDATE/DELETE `USING (super_admin OR club_id IS NULL OR club_id = user_club)`. Bloquea tocar filas de OTRO club; las globales (null) siguen editables por cualquier authenticated. Ganancia marginal (solo `profesionales` se estampa hoy).
2. **Ownership real (recomendada para multi-tenant, + trabajo):** agregar `origen_club_id`/`created_by` a los catálogos + link, estampar al crear, scope de edición al creador o super_admin; backfill de 220 propietarios / 40 spcs / 98 profesionales a Dolores. Requiere migración + cambios de UI.
3. **Solo super_admin escribe:** centraliza catálogos; rompe el self-service del secretario al inscribir → requiere rediseño de UI + OK de producto.

**Recomendación:** hoy opera 1 club real (Dolores) → riesgo cross-tenant bajo pero creciente. Opción 2 es la única con aislamiento real; Opción 1 es cosmética para filas globales. **FRENADO — esperando tu decisión.**

## ⏹️ FASE 4 — DESTRUCTIVO (PROPUESTA, GATEADA — no ejecutado)
- **Backups 0-filas** (`backup_novedades_reunion_20260515`, `backup_spc_entrenadores_hist_20260515`, `backup_spc_propietarios_20260515`): `DROP TABLE` seguro.
- **Backups con datos** (`backup_inscripciones_20260515` 87 filas, `backup_spcs_20260515` 52 filas): mover a schema `archive` (`CREATE SCHEMA archive; ALTER TABLE … SET SCHEMA archive;`) o dropear si ya no se necesitan. **No deberían vivir en `public`.**
- **`spc_entrenadores_hist` (0 filas, sin policy):** o agregar las 4 policies club-scoped (vía `fn_club_de_*` sobre spc → pero spc es global…) o documentar bloqueo intencional. Proponer policy `TO authenticated` análoga a `spc_propietarios` al definir el modelo.
- **Reescritura de historia** (service_role muerto en 142 commits): procedimiento en `docs/auditoria/SGH-REMEDIACION.md` (`git filter-repo --replace-text`, backup espejo, recoordinar clones/forks). **Recomendación: diferir** — la key ya es inerte tras desactivación; es higiene secundaria.

## MANUAL (dueño, dashboard)
- Activar **leaked password protection** en Supabase Auth (toggle).
- Confirmar desactivación de keys legacy y signing key HS256 (no verificable desde el repo).

---

## Estado para retomar
- **Aplicado y verificado:** FASE 0 (app/keys), FASE 1, 2, 2b, 2c. Probe regresión PASS. Smoke autenticado PASS.
- **No corre en este entorno:** 5 probes browser (chromium no soportado en ubuntu26.04) — migrados a keys nuevas, listos para máquina con chromium + rama en localhost.
- **Gateado por decisión tuya:** FASE 3, FASE 4, commit, merge a main.
- **Detalle completo:** `REMEDIACION_RESULTADO.md` (diffs, SQL, probes, propuestas FASE 3/4).
