# Sesión de Hardening RLS — 2026-05-14

## Resumen ejecutivo

**7/8 tablas hardenadas. 1 PENDIENTE de revisión manual (auditoria, intencional).**

2 helpers nuevas creadas: `fn_club_de_resolucion`, `fn_club_de_caballeriza`.

Cierra ISSUE-017 parcialmente — solo queda `auditoria`.

---

## Resultados por tabla

### 1. `comision_config` — ✅ OK
- **Fase:** 2A (club_id directo)
- **Policy vieja eliminada:** `dev_allow_all`
- **Policies nuevas:** `comision_config_select/insert/update/delete` → `fn_is_super_admin() OR (club_id = fn_get_user_club_id())`
- **Test RLS (dolores@sgh.com):** count = 0 (tabla vacía — legítimo)
- **RLS activa:** sí

### 2. `club_configuracion` — ✅ OK
- **Fase:** 2A (club_id directo)
- **Policy vieja eliminada:** `dev_allow_all`
- **Policies nuevas:** `club_configuracion_select/insert/update/delete` → `fn_is_super_admin() OR (club_id = fn_get_user_club_id())`
- **Test RLS (dolores@sgh.com):** count = 0 (tabla vacía — legítimo)
- **RLS activa:** sí

### 3. `spc_propietarios` — ✅ OK
- **Fase:** 3 (catálogo global — mismo shape que `propietarios`/`spcs`)
- **Justificación:** tabla puente SPC↔propietario; ambas entidades son catálogos globales sin club_id. Titularidad de caballos debe ser visible cooperativamente entre hipódromos.
- **Policy vieja eliminada:** `dev_allow_all`
- **Policies nuevas:**
  - SELECT/INSERT/UPDATE: `authenticated`, USING/WITH CHECK = `true`
  - DELETE: `fn_is_super_admin()`
- **Test RLS (dolores@sgh.com):** count = 0 (tabla vacía — legítimo para catálogo)
- **RLS activa:** sí

### 4. `novedades_reunion` — ✅ OK
- **Fase:** 2B (FK indirecta via `reunion_id`)
- **Policy vieja eliminada:** `dev_allow_all`
- **Policies nuevas:** `novedades_reunion_select/insert/update/delete` → `fn_is_super_admin() OR (fn_club_de_reunion(reunion_id) = fn_get_user_club_id())`
- **Test RLS (dolores@sgh.com):** count = 0 (tabla vacía — legítimo)
- **RLS activa:** sí

### 5. `performances` — ✅ OK (Fase 3, ver decisión)
- **Fase:** 3 (catálogo global — **decisión justificada abajo**)
- **FK confirmada:** `carrera_id UUID NULLABLE` → `carreras`
- **Decisión:** `carrera_id` es nullable. La tabla también tiene columnas `hipodromo_sigla`, `hipodromo_nombre`, `fuente` — indicadores de que registra carreras de hipódromos externos. Usar Fase 2B (`fn_club_de_carrera(carrera_id)`) haría invisibles todos los rows con `carrera_id IS NULL` (historial importado). Se trató como catálogo global (igual que `spcs`/`propietarios`): lectura y escritura abierta a authenticated, DELETE solo super_admin.
- **Pregunta pendiente para revisión:** ¿Se acepta que cualquier usuario autenticado pueda insertar/modificar performances de cualquier caballo? Si no, se puede acotar INSERT/UPDATE a `fn_is_super_admin()` (solo carga masiva por admins).
- **Policy vieja eliminada:** `dev_allow_all`
- **Policies nuevas:**
  - SELECT/INSERT/UPDATE: `authenticated`, `true`
  - DELETE: `fn_is_super_admin()`
- **Test RLS (dolores@sgh.com):** count = 3 (filas globales visibles — correcto para Fase 3)
- **RLS activa:** sí

### 6. `resolucion_entidades` — ✅ OK
- **Fase:** 2B (FK indirecta via `resolucion_id`)
- **Helper nueva creada:** `fn_club_de_resolucion` (ver sección helpers)
- **Policy vieja eliminada:** `dev_allow_all`
- **Policies nuevas:** `resolucion_entidades_select/insert/update/delete` → `fn_is_super_admin() OR (fn_club_de_resolucion(resolucion_id) = fn_get_user_club_id())`
- **Test RLS (dolores@sgh.com):** count = 0 (tabla vacía — legítimo)
- **RLS activa:** sí

### 7. `caballeriza_responsables` — ✅ OK
- **Fase:** 2B (FK indirecta via `caballeriza_id`)
- **Helper nueva creada:** `fn_club_de_caballeriza` (ver sección helpers)
- **Policy vieja eliminada:** `allow_all`
- **Policies nuevas:** `caballeriza_responsables_select/insert/update/delete` → `fn_is_super_admin() OR (fn_club_de_caballeriza(caballeriza_id) = fn_get_user_club_id())`
- **Test RLS (dolores@sgh.com):** count = 219 (número razonable — filtrado correcto)
- **RLS activa:** sí

### 8. `auditoria` — ⏸ PENDIENTE (solo propuesta, no modificada)
Ver sección propuesta abajo. `dev_allow_all` sigue activa hasta revisión manual.

---

## Helpers nuevas creadas

### `fn_club_de_resolucion(p_resolucion_id uuid) → uuid`
```sql
CREATE OR REPLACE FUNCTION public.fn_club_de_resolucion(p_resolucion_id uuid)
  RETURNS uuid
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT club_id FROM resoluciones WHERE id = p_resolucion_id LIMIT 1;
$$;
```
Shape: idéntico a `fn_club_de_liquidacion`.

### `fn_club_de_caballeriza(p_caballeriza_id uuid) → uuid`
```sql
CREATE OR REPLACE FUNCTION public.fn_club_de_caballeriza(p_caballeriza_id uuid)
  RETURNS uuid
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT club_id FROM caballerizas WHERE id = p_caballeriza_id LIMIT 1;
$$;
```
Shape: idéntico a `fn_club_de_liquidacion`.

---

## Propuesta de policies para `auditoria` (sin aplicar)

### Contexto
- `auditoria` tiene `club_id` directo (FK → clubs) — SELECT puede usar Fase 2A.
- `fn_auditoria_log()` es `SECURITY DEFINER` → los triggers corren como el owner de la función (postgres, superusuario) → **bypasean RLS completamente**. No se necesita policy de INSERT para authenticated.
- UPDATE no tiene caso de uso legítimo para usuarios.
- DELETE existe para la purga manual (`fn_purgar_auditoria()`), que debería ser solo super_admin.

### Policies propuestas

```sql
-- Eliminar política permisiva
DROP POLICY IF EXISTS "dev_allow_all" ON auditoria;

-- SELECT: club-scoped (Fase 2A)
-- super_admin ve todo; usuarios ven solo su club
CREATE POLICY "auditoria_select" ON auditoria
  FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR (club_id = fn_get_user_club_id()));

-- INSERT: sin policy para authenticated
-- fn_auditoria_log() es SECURITY DEFINER → corre como postgres (superusuario) → bypasea RLS
-- No crear policy de INSERT = usuarios autenticados NO pueden insertar directamente
-- Los triggers siguen funcionando sin restricción.

-- UPDATE: sin policy → bloqueado para todos los authenticated

-- DELETE: solo super_admin (purga manual)
CREATE POLICY "auditoria_delete" ON auditoria
  FOR DELETE TO authenticated
  USING (fn_is_super_admin());
```

### Punto a verificar antes de aplicar
Confirmar que `fn_purgar_auditoria()` también es SECURITY DEFINER (si no lo es, el DELETE policy para super_admin es suficiente de todos modos porque fn_is_super_admin() retornará true para el super_admin logueado).

---

## Issues encontrados / decisiones pendientes para revisión

1. **`performances` — ¿INSERT/UPDATE abierto a todos los authenticated?**  
   Tratado como Fase 3 por el `carrera_id` nullable. Si la carga de performances debe ser solo tarea de admins (ej. importación masiva), se puede endurecer INSERT/UPDATE a `fn_is_super_admin()` sin afectar SELECT.

2. **`auditoria` — pendiente de revisión manual** (ver propuesta arriba).
