# REMEDIACION_RESULTADO.md — Resultado de la remediación de seguridad

| | |
|---|---|
| **Rama** | `fix/security-hardening` (NO mergeada a main) |
| **Fecha** | 2026-06-07 |
| **Estado** | FASE 0/1/2 aplicadas y verificadas · FASE 3/4 propuestas y FRENADAS · sin commit · sin merge |
| **Secretos** | enmascarados (prefijo + cola). Nunca el valor completo. |
| **Credenciales** | publishable `sb_publishable_…WgAK` (OK) · secret `sb_secret_…pU1t` (OK, leída de `.env`) · ambas legacy muertas (401 "Legacy API keys are disabled", desactivadas 2026-06-07T19:09:33Z) |

---

## Resumen ejecutivo

| Fase | Acción | Estado |
|---|---|---|
| 0 | Swap anon legacy → publishable en 30 archivos + fix typo URL | ✅ aplicada + verificada |
| 1 | Cierre anon en `carrera_apuestas` / `resultado_apuestas` | ✅ aplicada + verificada |
| 2 | Vistas invoker, search_path, grants RPC, bucket | ✅ aplicada + verificada |
| 2b | Residuales: bucket listing + 2 trigger-fns | ✅ aplicada |
| 2c | Función auditora `fn_audit_policies_permisivas` | ✅ aplicada |
| — | Doc scrub `SGH-REMEDIACION.md` | ✅ |
| — | Probe regresión `USING(true)` | ✅ PASS |
| 3 | Catálogos globales | ⏹️ PROPUESTA — FRENADA |
| 4 | Destructivo (backups, historia) | ⏹️ PROPUESTA — FRENADA |
| manual | leaked-password protection (dashboard) | ⏳ dueño |

---

# FASE 0 — RESTORE (aplicada)

**Archivos que importan `supabase.js`:** 29 HTML lo cargan (`<script src="supabase.js">`), pero cada HTML además es **autocontenido** (tiene su propio `createClient` inline con la key). Por eso el swap toca tanto `supabase.js` como las 30 páginas/JS.

**Swap:** el JWT anon legacy exacto (`eyJ…Vmkn1SYM`) → `sb_publishable_…WgAK` en **30 archivos** (1 occurrencia c/u). + typo URL en `supabase.js`.

### Diff (muestra — `supabase.js`)
```diff
-const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.Supabase.co';
-const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…rKb8…Vmkn1SYM';
+const SUPABASE_URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
+const SUPABASE_KEY = 'sb_publishable_…WgAK';
```

### Archivos tocados (30 + doc + 5 probes)
`admin, auditoria, caballerizas, calendario, carta-llamados, categorias, hipodromos, index, inscripciones, jockeys, liquidaciones, login, portal, profesionales, programa, programa-oficial, programa-oficial-color, propietarios, ratificacion, registro, registro-profesional, reset-password, resoluciones, resultados, resultados_legacy, reuniones, sanciones, spcs, usuarios` (.html) + `supabase.js`.

### Verificación FASE 0
```
publishable contra API      → HTTP 200 + []   (válida, RLS aplica)   ✅
anon legacy vieja           → HTTP 401 "Legacy API keys are disabled" ✅ muerta
URL typo Supabase.co        → 0 occurrencias restantes               ✅
JWT anon en working tree    → 0 occurrencias restantes               ✅
node --check supabase.js    → ok
```

> **Pendiente operativo (dueño):** esto está en la rama, no en prod. GitHub Pages sirve `main`, que todavía tiene la anon muerta → **prod sigue caído hasta mergear `fix/security-hardening` a main**. Ese merge lo decidís vos.
>
> **GOTCHA #2 quedó obsoleto:** decía "`sb_publishable_` da 400, usar legacy `eyJ`". Con legacy desactivada es al revés. Corregir CLAUDE.md + `docs/GOTCHAS.md`.

---

# FASE 1 — CIERRE CRÍTICO ANON (aplicada)

**Precondición verificada:** las escrituras a `carrera_apuestas` (programa.html) y `resultado_apuestas` (resultados.html, vía RPC `aplicar_resultado` con F10) corren **tras `initAuth`** = authenticated. Ningún path anon legítimo. Las vistas de impresión `programa-oficial*.html` leen `carrera_apuestas` apoyadas en la sesión de localStorage (funcionan logueado; follow-up recomendado: gate de auth explícito).

`migrations/security_hardening_fase1_apuestas_rls.sql`:
```sql
-- carrera_apuestas: allow_all (rol public/anon) → 4 policies authenticated club-scoped
DROP POLICY IF EXISTS "allow_all" ON public.carrera_apuestas;
CREATE POLICY carrera_apuestas_select ON public.carrera_apuestas FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id());
CREATE POLICY carrera_apuestas_insert ON public.carrera_apuestas FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id());
CREATE POLICY carrera_apuestas_update ON public.carrera_apuestas FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id());
CREATE POLICY carrera_apuestas_delete ON public.carrera_apuestas FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id());

-- resultado_apuestas: allow_all_resultado_apuestas (anon+authenticated) → idem vía fn_club_de_resultado
DROP POLICY IF EXISTS "allow_all_resultado_apuestas" ON public.resultado_apuestas;
CREATE POLICY resultado_apuestas_select ON public.resultado_apuestas FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_resultado(resultado_id) = fn_get_user_club_id());
CREATE POLICY resultado_apuestas_insert ON public.resultado_apuestas FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR fn_club_de_resultado(resultado_id) = fn_get_user_club_id());
CREATE POLICY resultado_apuestas_update ON public.resultado_apuestas FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_resultado(resultado_id) = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR fn_club_de_resultado(resultado_id) = fn_get_user_club_id());
CREATE POLICY resultado_apuestas_delete ON public.resultado_apuestas FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_resultado(resultado_id) = fn_get_user_club_id());
```

### Verificación FASE 1
```
pg_policies: 4+4 policies {authenticated}, 0 anon, 0 always-true.
Advisor: lints allow_all / allow_all_resultado_apuestas → DESAPARECIERON.

Superficie anon (curl con publishable, sin login):
  carrera_apuestas  SELECT → []     (RLS niega)   ✅
  resultado_apuestas SELECT → []                  ✅
  carrera_apuestas  INSERT → HTTP 401             ✅
  resultado_apuestas INSERT → HTTP 401            ✅

Smoke autenticado (token dolores@sgh.com minteado con secret, sin browser):
  READ anon    : carrera_apuestas = 0   (esperado 0)            ✅
  READ dolores : carrera_apuestas = 39  (su club)               ✅
  WRITE dolores: INSERT TR OK → DELETE OK (round-trip restaurado)✅
  WRITE anon   : BLOQUEADO (42501 insufficient_privilege)       ✅
  (verificado: 0 filas TR residuales en la carrera de prueba)
```

---

# FASE 2 — HARDENING REVERSIBLE (aplicada)

`migrations/security_hardening_fase2_reversible.sql`:
```sql
-- (a) vistas → security_invoker
ALTER VIEW public.v_spcs_activos       SET (security_invoker = true);
ALTER VIEW public.v_programa_reunion   SET (security_invoker = true);
ALTER VIEW public.v_inscriptos_carrera SET (security_invoker = true);
ALTER VIEW public.v_sanciones_vigentes SET (security_invoker = true);

-- (b) search_path=public (ALTER, sin recrear — respeta gotcha de overloads de aplicar_resultado)
ALTER FUNCTION public.calcular_premio(numeric, jsonb, integer)          SET search_path = public;
ALTER FUNCTION public.validar_inscripcion(uuid, uuid)                   SET search_path = public;
ALTER FUNCTION public.set_updated_at()                                  SET search_path = public;
ALTER FUNCTION public.fn_purgar_auditoria()                             SET search_path = public;
ALTER FUNCTION public.fn_proteger_rol_club_id_usuario()                 SET search_path = public;
ALTER FUNCTION public.aplicar_resultado(
  uuid, timestamptz, uuid, text, text, text, text, integer, jsonb, jsonb, jsonb) SET search_path = public;

-- (c) grants RPC (EXECUTE default va a PUBLIC → revocar de PUBLIC + grant selectivo)
REVOKE EXECUTE ON FUNCTION public.aplicar_resultado(
  uuid, timestamptz, uuid, text, text, text, text, integer, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_siguiente_recibo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_purgar_auditoria() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_purgar_auditoria() TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_auditoria_log() FROM PUBLIC, anon, authenticated;

-- (d) bucket: SELECT solo authenticated (luego eliminada en 2b)
DROP POLICY IF EXISTS "chaquetillas_public_read" ON storage.objects;
CREATE POLICY "chaquetillas_auth_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chaquetillas');
```
> Helpers de RLS `fn_club_de_*`, `fn_is_super_admin`, `fn_get_user_club_id` **NO tocados** (GOTCHA #26/#10): siguen ejecutables por anon a propósito (son el motor de la RLS).

`migrations/security_hardening_fase2b_residuals.sql`:
```sql
-- bucket: app solo usa getPublicUrl (caballerizas.html:515), nunca .list() → sin SELECT policy.
--         bucket público sirve URLs directas sin RLS; el advisor marca cualquier SELECT policy como "listable".
DROP POLICY IF EXISTS "chaquetillas_auth_read" ON storage.objects;
-- trigger-functions (RETURNS trigger, atadas a trg_insc_set_propietario / trg_cab_resp_set_propietario): fuera de RPC
REVOKE EXECUTE ON FUNCTION public.fn_inscripcion_set_propietario()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_caballeriza_resp_set_propietario() FROM PUBLIC, anon, authenticated;
```

`migrations/security_hardening_fase2c_audit_fn.sql`:
```sql
CREATE OR REPLACE FUNCTION public.fn_audit_policies_permisivas()
RETURNS TABLE(schemaname text, tablename text, policyname text, cmd text, roles text, qual text, with_check text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.schemaname::text, p.tablename::text, p.policyname::text, p.cmd::text,
         p.roles::text, p.qual::text, p.with_check::text
  FROM pg_policies p
  WHERE p.schemaname='public' AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
    AND (p.qual='true' OR p.with_check='true')
$$;
REVOKE EXECUTE ON FUNCTION public.fn_audit_policies_permisivas() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_audit_policies_permisivas() TO service_role;
```

### Doc scrub
`docs/auditoria/SGH-REMEDIACION.md`: token `service_role` en texto plano → `<PEGAR_SERVICE_ROLE_JWT_REVOCADA_AQUI>` (líneas 130, 145); `"14 commits"` → `"142 commits"` (×3). Fragmentos de needle de `grep` (línea 160) conservados — no son la key usable.

### Verificación FASE 2 (advisor delta)
```
security_definer_view (ERROR)            4 → 0   ✅
function_search_path_mutable             6 → 0   ✅
public_bucket_allows_listing             1 → 0   ✅
RPC sensibles ejecutables por anon:
  aplicar_resultado   → HTTP 404 (PostgREST oculta fn sin EXECUTE)  ✅
  fn_purgar_auditoria → HTTP 401                                    ✅
  fn_siguiente_recibo → HTTP 401                                    ✅
helper fn_is_super_admin (anon) → HTTP 200 body false (intacto)     ✅
ACL post-cambio:
  aplicar_resultado / fn_siguiente_recibo → authenticated + service_role
  fn_purgar_auditoria / fn_auditoria_log  → service_role only
```

---

# Probe de regresión (nueva)

`tests/probe_rls_no_permissive.mjs` — falla si queda cualquier policy de escritura `USING(true)/WITH CHECK(true)` fuera de la allowlist (las 8 de catálogos gateadas en FASE 3, marcadas "QUITAR AL APLICAR FASE 3"). Cierra el pendiente §2 de `SGH-REMEDIACION.md`. Lee `pg_policies` vía `fn_audit_policies_permisivas` (grant solo service_role).

### Salida (con SECRET)
```
Policies de escritura permisivas detectadas: 8
  · gateadas/toleradas (FASE 3): 8
  · NO toleradas (regresión):    0
✅ PASS — ninguna policy permisiva fuera de lo gateado en FASE 3.
exit=0
```

### Probes del suite migrados a keys nuevas
`smoke_t9_t16`, `probe_modelo_chapa`, `probe_dividendos_inline`, `probe_no_largo`, `probe_vacante_vac`: `SUPABASE_SERVICE_ROLE_KEY` → `process.env.SUPABASE_SECRET_KEY || …` y `SUPABASE_ANON_KEY` → publishable. Sintaxis ✅ (node --check).

> **No corren en este entorno:** `npx playwright install chromium` falla con
> `Playwright does not support chromium on ubuntu26.04-x64`. Los 5 son browser-based (Playwright) → requieren una máquina con chromium **y** servir la rama en localhost:8080 (no prod, que está caído). Quedan listos para correr ahí. El probe sin browser (`probe_rls_no_permissive`) y el smoke autenticado por REST **sí corrieron acá** (arriba). `probe_vacante_hibrido.mjs` no existe: el real es `probe_vacante_vac.mjs` (el nombre venía de la branch `feat/vacante-hibrido`).

---

# FASE 3 — CATÁLOGOS (PROPUESTA — FRENADA, no aplicada)

**Tablas:** `spcs`, `propietarios`, `profesionales`, `spc_propietarios` — INSERT/UPDATE `WITH CHECK(true)` `TO authenticated`. **anon ya está fuera** (es aislamiento entre clubs, no agujero anon).

**Flujo real verificado (no inventado):**
- `spcs.html:483` inserta `club_id: null` → SPCs **globales**, creados por el secretario (authenticated, no super_admin).
- `propietarios.html` no estampa `club_id` → propietarios **globales**.
- `jockeys.html:382` estampa `club_id: CLUB_ID` → profesionales **sí** quedan con club.
- `spc_propietarios` **no tiene columna club_id** (es link spc↔propietario).

→ Son catálogos globales **a propósito** (GOTCHA #12/#13). Un club-scope estricto rompería la creación global y no mapea sobre filas `null` ni sobre la link table.

### Opción 1 — scope suave (NO rompe el flujo) — *propuesta concreta*
Permite global + own-club; bloquea tocar filas estampadas con OTRO club. Las globales (`club_id IS NULL`) siguen editables por cualquier authenticated (limitación sin owner column).
```sql
-- patrón por tabla con columna club_id (spcs, propietarios, profesionales):
DROP POLICY IF EXISTS spcs_insert ON public.spcs;
DROP POLICY IF EXISTS spcs_update ON public.spcs;
CREATE POLICY spcs_insert ON public.spcs FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR club_id IS NULL OR club_id = fn_get_user_club_id());
CREATE POLICY spcs_update ON public.spcs FOR UPDATE TO authenticated
  USING      (fn_is_super_admin() OR club_id IS NULL OR club_id = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR club_id IS NULL OR club_id = fn_get_user_club_id());
-- idem propietarios_insert/update, profesionales_insert/update.
-- spc_propietarios (sin club_id): scope vía el spc/propietario asociado, o dejar authenticated
--   (link table; sin club_id propio el scope estricto requiere subselect a spcs/propietarios, ambos globales) →
--   en Opción 1 se mantiene authenticated con WITH CHECK(true) documentado, o se difiere a Opción 2.
```

### Opción 2 — ownership real (recomendada para multi-tenant; + trabajo)
Agregar `origen_club_id UUID` (y/o `created_by UUID`) a los 4 catálogos, estampar al crear en la UI, scope de edición al club creador o super_admin; backfill: 220 propietarios / 40 spcs / 98 profesionales → Dolores. Requiere migración + cambios de UI (`spcs.html`, `propietarios.html`, `jockeys.html`, `inscripciones.html`) + backfill. Único modelo con aislamiento real.

### Opción 3 — solo super_admin escribe
Centraliza catálogos; rompe el self-service del secretario al inscribir → requiere rediseño de UI + OK de producto.

### Recomendación
Hoy opera **1 club real** (Dolores) → riesgo cross-tenant bajo pero creciente. **Opción 1 es cosmética** para filas globales; **Opción 2 es la única correcta**. Sugerencia: **diferir** hasta que haya 2º club operativo, o ir directo a Opción 2 si se planea multi-tenant pronto. El probe `probe_rls_no_permissive` ya vigila estas 8 policies. **FRENADO — esperando tu decisión.**

---

# FASE 4 — DESTRUCTIVO (PROPUESTA — FRENADA, no ejecutada)

### Backups 0-filas → DROP seguro
```sql
DROP TABLE IF EXISTS public.backup_novedades_reunion_20260515;
DROP TABLE IF EXISTS public.backup_spc_entrenadores_hist_20260515;
DROP TABLE IF EXISTS public.backup_spc_propietarios_20260515;
```

### Backups con datos → mover a schema `archive` (recomendado) o DROP
`backup_inscripciones_20260515` (87 filas) · `backup_spcs_20260515` (52 filas).
```sql
CREATE SCHEMA IF NOT EXISTS archive;
ALTER TABLE public.backup_inscripciones_20260515 SET SCHEMA archive;
ALTER TABLE public.backup_spcs_20260515          SET SCHEMA archive;
-- (mover saca el lint rls_enabled_no_policy de public y conserva los datos; alternativa: DROP si ya no se necesitan)
```

### `spc_entrenadores_hist` (0 filas, RLS ON sin policy)
Hoy está **bloqueada a todo cliente** (solo service_role) → estado seguro. Opciones:
- **(a) Documentar bloqueo intencional** (recomendado hoy: 0 filas, feature de historial de entrenadores no en uso).
- **(b) Agregar policies** cuando se defina el modelo, espejando lo que FASE 3 decida para `spc_propietarios` (misma naturaleza: link sobre spc global).

### Reescritura de historia (service_role muerto en 142 commits)
Procedimiento documentado en `docs/auditoria/SGH-REMEDIACION.md` (§Pendiente 2). Resumen:
```bash
git clone --mirror git@github.com:mdqclio/SGH.git SGH-backup.git   # backup espejo PRIMERO
pipx install git-filter-repo
printf '%s==>SERVICE_ROLE_PURGED\n' "<JWT_SERVICE_ROLE_REVOCADA>" > /tmp/secrets.txt
git filter-repo --replace-text /tmp/secrets.txt --force
git remote add origin git@github.com:mdqclio/SGH.git
git push origin --force --all && git push origin --force --tags
# recoordinar: todo clon/fork debe reclonar; abrir ticket a GitHub para refs colgadas si hubo forks
```
**Recomendación: DIFERIR.** La key ya es **inerte** (legacy desactivada 2026-06-07T19:09:33Z, confirmado por 401). La reescritura es higiene secundaria, no urgencia, y reescribe historia compartida. **NO ejecutado.**

---

# Pendientes / decisiones tuyas

1. **Mergear `fix/security-hardening` a main** → restaura prod (hoy caído por anon muerta en main). *(lo decidís vos)*
2. **Commit** de lo aplicado a la rama *(no commiteado aún; pido OK)*.
3. **FASE 3**: elegir Opción 1 / 2 / 3 / diferir.
4. **FASE 4**: ¿DROP backups 0-filas ahora? ¿mover los 2 con datos? ¿historia? (recomiendo diferir historia).
5. **Manual (dueño)**: activar leaked-password protection en Supabase Auth; corregir GOTCHA #2 obsoleto en docs.
6. **Correr los 5 probes browser** en una máquina con chromium, sirviendo la rama en localhost:8080.
Cambio de plan: NO finalices la Opción A. Necesito liquidaciones en prod para Fede → vamos con Opción B = merge completo de fix/security-hardening → main. El merge completo no tiene los conflictos del cherry-pick (eran por aislar los commits de seguridad de su cadena) y limpia el eyJ service_role/anon muerto de tests/ en main.

BLOQUEANTE antes de pushear:
1) ¿Está en estos 11 commits el bloque HARD de ratificación caballeriza-obligatoria (el que exige caballeriza para poder inscribir)? Revisá 20fdbc7 "captura caballeriza" y los commits de Fase.
2) Si está: ¿el backfill de caballeriza de los ~40 SPCs ya está hecho? Si NO → mergear rompe inscripciones en prod para esos SPCs. FRENÁ y avisame; decidimos si revertimos ese commit en el merge o hacemos el backfill primero.
3) Si el bloque hard NO está en el set, o el backfill ya está hecho → seguí.

Si OK: git checkout main && git merge --no-ff fix/security-hardening → push origin main. Confirmá: push sin error de auth de GitHub; origin/main con sb_publishable_; sin typo Supabase.co; sin eyJ service_role en tests/.
Opción 2. Cerrá de punta a punta, avisame solo "prod arriba" o dónde te trabás.
1) En fix/security-hardening, neutralizá SOLO el bloque HARD de E1 en ratificacion.html (botón habilitado, sin guard que aborte). Hacelo como su PROPIO commit/revert, así reactivarlo tras el backfill es un revert limpio. Mantené Fix D (spcs.html id-dup) y todo lo demás.
2) Merge --no-ff fix/security-hardening → main.
3) Push origin main. Si falla por auth de GitHub, mostrame el error y pará.
4) Autoverificá: main con sb_publishable_, sin typo Supabase.co, sin eyJ service_role en tests/, ratificación sin el guard hard. Esperá ~60s y confirmá que prod sirve sb_publishable_.
5) Avisame: prod arriba + login OK.
