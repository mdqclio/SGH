# SGH — Modelo de Seguridad

## Resumen ejecutivo

SGH implementa Row Level Security (RLS) nativa de PostgreSQL en 17 tablas para aislar datos entre hipódromos (multi-tenant por `club_id`). Cada usuario autenticado solo puede ver y modificar los registros de su propio club; los `super_admin` tienen bypass total. Catálogos nacionales (SPCs, propietarios, profesionales) mantienen acceso cooperativo abierto entre hipódromos, reflejando el modelo federativo de la hípica argentina. Un sistema de auditoría registra INSERT/UPDATE/DELETE en 8 tablas críticas con diff visual, paginación server-side y export CSV. La implementación cierra el bloqueante técnico para onboardear múltiples clientes (implementado 12/05/2026).

## Modelo: RLS por club_id con super_admin como bypass

- Cada tabla con datos de hipódromo tiene un `club_id` (directo o resolvible por FK)
- El usuario logueado se resuelve por email del JWT → `usuarios.email` → `usuarios.club_id`
- `super_admin` bypasea todas las restricciones — puede leer y escribir cualquier club
- Las policies son de tipo PERMISSIVE (default de PostgreSQL): si **alguna** policy permite, se permite
- Consecuencia crítica: una sola policy residual con `USING(true)` anula toda la RLS endurecida (ver GOTCHAS.md #25)

## Funciones helper

Todas declaradas como `STABLE SECURITY DEFINER SET search_path = public`. Son SECURITY DEFINER para evitar recursión cuando se invocan desde policies sobre tablas que ya tienen RLS activa (ver GOTCHAS.md #26).

| Función | Firma | Propósito |
|---|---|---|
| `fn_get_user_club_id()` | `() → UUID` | Devuelve `club_id` del usuario logueado vía email del JWT joineado con `usuarios` |
| `fn_is_super_admin()` | `() → BOOLEAN` | Verifica si el usuario logueado tiene `rol = 'super_admin'` |
| `fn_club_de_reunion(uuid)` | `(reunion_id UUID) → UUID` | Resuelve `club_id` desde `reuniones.id` |
| `fn_club_de_carrera(uuid)` | `(carrera_id UUID) → UUID` | Resuelve `club_id` desde `carreras.id` (vía reuniones) |
| `fn_club_de_inscripcion(uuid)` | `(inscripcion_id UUID) → UUID` | Resuelve `club_id` desde `inscripciones.id` (vía carreras → reuniones) |
| `fn_club_de_liquidacion(uuid)` | `(liquidacion_id UUID) → UUID` | Resuelve `club_id` desde `liquidaciones.id` |

## Trigger anti auto-promoción

**Función:** `fn_proteger_rol_club_id_usuario()` — `SECURITY INVOKER`, `RETURNS TRIGGER`
**Trigger:** `trg_proteger_rol_club_id_usuario` — `BEFORE UPDATE ON usuarios FOR EACH ROW`

Protege que un usuario no super_admin no pueda cambiar su propio `rol` ni su `club_id`. Lanza `RAISE EXCEPTION` si se detecta el cambio. Se implementa como trigger (BEFORE UPDATE) con SECURITY INVOKER y no como policy porque las policies de PostgreSQL no tienen acceso a `OLD` — solo el trigger puede comparar el valor anterior con el nuevo.

## Tablas endurecidas (26)

| Tabla | Patrón aplicado | Fase |
|---|---|---|
| `caballerizas` | `fn_is_super_admin() OR club_id = fn_get_user_club_id()` | 1 — piloto |
| `categorias_carrera` | `fn_is_super_admin() OR club_id = fn_get_user_club_id()` | 2A — club_id directo |
| `reuniones` | `fn_is_super_admin() OR club_id = fn_get_user_club_id()` | 2A — club_id directo |
| `liquidaciones` | `fn_is_super_admin() OR club_id = fn_get_user_club_id()` | 2A — club_id directo |
| `resoluciones` | `fn_is_super_admin() OR club_id = fn_get_user_club_id()` | 2A — club_id directo |
| `hipodromos` | `fn_is_super_admin() OR club_id = fn_get_user_club_id()` | 2A — club_id directo |
| `carreras` | `fn_is_super_admin() OR fn_club_de_carrera(id) = fn_get_user_club_id()` | 2B — FK indirecta |
| `inscripciones` | `fn_is_super_admin() OR fn_club_de_inscripcion(id) = fn_get_user_club_id()` | 2B — FK indirecta |
| `resultados` | `fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id()` | 2B — FK indirecta |
| `resultado_posiciones` | `fn_is_super_admin() OR fn_club_de_inscripcion(inscripcion_id) = fn_get_user_club_id()` | 2B — FK indirecta |
| `liquidacion_detalle` | `fn_is_super_admin() OR fn_club_de_liquidacion(liquidacion_id) = fn_get_user_club_id()` | 2B — FK indirecta |
| `spcs` | SELECT/INSERT/UPDATE: `authenticated`; DELETE: `fn_is_super_admin()` | 3 — catálogo global |
| `propietarios` | SELECT/INSERT/UPDATE: `authenticated`; DELETE: `fn_is_super_admin()` | 3 — catálogo global |
| `profesionales` | SELECT/INSERT/UPDATE: `authenticated`; DELETE: `fn_is_super_admin()` | 3 — catálogo global |
| `sanciones` | SELECT: `authenticated`; INSERT/UPDATE: `fn_is_super_admin() OR club_id = fn_get_user_club_id()`; DELETE: `fn_is_super_admin()` | 3 — especial |
| `usuarios` | SELECT: super_admin O propio email O mismo club; INSERT/DELETE: solo super_admin; UPDATE: super_admin O propio email (protegido por trigger) | 4 — hardening |
| `clubs` | SELECT: `fn_is_super_admin() OR id = fn_get_user_club_id()`; INSERT/UPDATE/DELETE: solo super_admin | 4 — hardening |
| `comision_config` | `fn_is_super_admin() OR club_id = fn_get_user_club_id()` | 2A — club_id directo |
| `club_configuracion` | `fn_is_super_admin() OR club_id = fn_get_user_club_id()` | 2A — club_id directo |
| `spc_propietarios` | SELECT/INSERT/UPDATE: `authenticated`; DELETE: `fn_is_super_admin()` | 3 — catálogo global |
| `novedades_reunion` | `fn_is_super_admin() OR fn_club_de_reunion(reunion_id) = fn_get_user_club_id()` | 2B — FK indirecta |
| `performances` | SELECT/INSERT/UPDATE: `authenticated`; DELETE: `fn_is_super_admin()` | 3 — catálogo global (carrera_id nullable) |
| `resolucion_entidades` | `fn_is_super_admin() OR fn_club_de_resolucion(resolucion_id) = fn_get_user_club_id()` | 2B — FK indirecta |
| `caballeriza_responsables` | `fn_is_super_admin() OR fn_club_de_caballeriza(caballeriza_id) = fn_get_user_club_id()` | 2B — FK indirecta |
| `auditoria` | SELECT: `fn_is_super_admin() OR club_id = fn_get_user_club_id()`; INSERT: bloqueado (triggers SECURITY DEFINER bypasean RLS); UPDATE: bloqueado; DELETE: `fn_is_super_admin()` | especial — auditoría |
| `resultado_log` | `fn_is_super_admin() OR fn_club_de_resultado(resultado_id) = fn_get_user_club_id()` | 2B — FK indirecta |

## Funciones helper (actualizado 14/05/2026)

Se agregaron helpers nuevas con el mismo shape que las existentes (`STABLE SECURITY DEFINER SET search_path = public`):

| Función | Resuelve |
|---|---|
| `fn_club_de_resolucion(uuid)` | `club_id` desde `resoluciones.id` |
| `fn_club_de_caballeriza(uuid)` | `club_id` desde `caballerizas.id` |
| `fn_club_de_resultado(uuid)` | `club_id` desde `resultados.id` (vía `fn_club_de_carrera`) |

## Sistema de auditoría

- **Función:** `fn_auditoria_log()` — `SECURITY DEFINER`, resuelve `usuario_id` vía email del JWT joineado con `usuarios`. Registra `datos_antes` y `datos_despues` como JSONB.
- **Tablas auditadas — 8 triggers AFTER INSERT OR UPDATE OR DELETE:**
  - `reuniones`, `carreras`, `inscripciones`, `resultados`
  - `liquidaciones`, `clubs`, `usuarios`, `categorias_carrera`
- **Retención configurable:** `clubs.auditoria_retencion_meses INTEGER DEFAULT 12` — cada club puede tener retención distinta
- **Purga manual:** `fn_purgar_auditoria()` — borra registros más antiguos que `auditoria_retencion_meses` meses del club correspondiente. Devuelve cantidad de filas borradas.
- **UI:** `auditoria.html` — paginación server-side, filtros (tabla/acción/usuario/fecha), diff visual con colores (rojo=antes, verde=después), modal de detalle con JSON plegable, export CSV con BOM UTF-8, botón de purga visible solo para super_admin
- **Acceso:** sidebar de `index.html`, sección Administración, visible para super_admin y secretario_carreras


## Procedimiento de rollback de emergencia

Si una policy nueva rompe un módulo en producción, pegar esto en el SQL Editor de Supabase:

```sql
-- Reemplazar [tabla] por el nombre real, ej: reuniones

-- Paso 1: eliminar todas las policies de esa tabla
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = '[tabla]' AND schemaname = 'public' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON [tabla]';
  END LOOP;
END $$;

-- Paso 2: restaurar acceso permisivo temporal
CREATE POLICY "allow_all_emergency" ON [tabla]
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Paso 3: verificar estado final
SELECT policyname, cmd, qual, with_check
FROM pg_policies WHERE tablename = '[tabla]';
```

Para auditar policies antes de cambios:
```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```
