# Auditoría — Camino portal de propietarios (onboarding self-service)

**Fecha:** 2026-06-10 · **Tipo:** read-only (sin tocar código ni DB) · **Objetivo:** que los dueños carguen ellos mismos sus caballos para la reunión R6 (20/6) vía `portal.html`.

**Camino auditado:**
`registro-profesional.html` (alta) → aprobación admin (`admin.html`) → login → `portal.html` → Nuevo SPC (`saveSpc`) → vínculo `spc_propietarios` → inscripción desde carta de llamados.

**Veredicto:** ❌ El camino **NO funciona hoy de punta a punta**. Hay **4 bloqueantes** que cortan el flujo en el primer paso (registro) y en el último (inscripción). Evidencia corroborante: `usuarios` tiene **0 filas** con rol `propietario`/`profesional` — nadie completó nunca el alta self-service.

---

## 1. Constraints reales de `spcs` (information_schema.columns)

Columnas **NOT NULL sin default** (las que el INSERT debe proveer obligatoriamente):

| Columna | Tipo | NOT NULL | Default |
|---|---|---|---|
| `nombre` | varchar | ✅ | — |
| `fecha_nacimiento` | date | ✅ | — |
| `sexo` | enum | ✅ | — |

NOT NULL **con** default (auto): `id`, `estado` (`'activo'`), `created_at`, `updated_at`, `pais_origen` (`'Argentina'`).
Nullable: `club_id`, `registro_stud_book`, `color`, `marcas`, pedigree, `caballeriza_id`, `entrenador_id`, `jockey_habitual_id`, etc.

**`registro_stud_book` es NULLABLE** (no bloquea). **`fecha_nacimiento` y `sexo` son NOT NULL**.

## 2. Form "Nuevo SPC" (`portal.html`) vs constraints

`saveSpc` (portal.html:428-461) arma el payload con `fecha_nacimiento: <valor> || null`.
El input `#mspc-nacimiento` (línea 236) **no tiene `required`** → si el dueño no la carga, el payload manda `null` → **viola NOT NULL** (Postgres 23502) → el INSERT falla.

| Campo NOT NULL | Required en form | Estado |
|---|---|---|
| `nombre` | ✅ (`required`) | OK |
| `sexo` | ✅ (`required`) | OK |
| `fecha_nacimiento` | ❌ **opcional** | **ROTO** → G2 |

## 3. RLS — ¿puede un `propietario` authenticated escribir?

RLS habilitada en las 6 tablas. Roles: todas las policies son `TO authenticated`.

| Tabla | INSERT `WITH CHECK` | ¿Propietario puede INSERT? |
|---|---|---|
| `spcs` | `true` | ✅ Sí. **`club_id` null NO bloquea** (no hay cláusula club-scoped en el check). |
| `spc_propietarios` | `true` | ✅ Sí. |
| `inscripciones` | `fn_is_super_admin() OR fn_club_de_carrera(carrera_id)=fn_get_user_club_id()` | ❌ **No** si el usuario tiene `club_id` NULL → G3 |
| `usuarios` | `fn_is_super_admin()` | ❌ **No** — un auto-registrante no es super_admin → G1 |
| `propietarios` | `true` | ✅ Sí. |
| `profesionales` | `true` | ✅ Sí. |

- `spcs`/`spc_propietarios`: el insert global con `club_id` NULL **pasa** (check = `true`). ✔️ No es un problema.
- `inscripciones`: `fn_get_user_club_id()` lee `usuarios.club_id` del JWT email. El propietario queda con `club_id=NULL` (ver G3) → `NULL ≠ club_de_carrera` → **rechazado**.
- `usuarios`: el check exige `fn_is_super_admin()` → **el propio registro no puede insertar su fila** → G1 (bloqueante raíz).

## 4. `registro-profesional.html` — qué inserta y el match por email

Inserta en 2 pasos tras `sb.auth.signUp`:
1. `usuarios` → `{email, nombre_completo, club_id: null, rol: 'propietario'|'profesional', estado:'pendiente', activo:false, telefono}`.
2. `propietarios` (`{nombre: "<nombre> <apellido>", email, ...}`) o `profesionales` (`{nombre, apellido, tipo:'entrenador', email, ...}`).

Problemas:
- **El insert de `usuarios` está bloqueado por RLS** (`with_check = fn_is_super_admin()`) → G1. El registro muere acá; los pasos 2-5 no llegan a impactar de forma útil.
- **Errores de `propietarios`/`profesionales` se tragan** (`console.warn`, no `throw`) → el usuario ve "Registro enviado" aunque la fila no se haya creado → G6.
- **Match portal→propietarios por email es case-sensitive.** Portal (portal.html:325) hace `.eq('email', session.user.email)`; Supabase Auth **normaliza el email a minúsculas**, pero `registro` guarda `propietarios.email` tal cual se tipeó (`.trim()` sin `.toLowerCase()`). Un alta con `Juan@Mail.com` → auth guarda `juan@mail.com`, propietario guarda `Juan@Mail.com` → `propietarioId = null` → no puede vincular SPC ni inscribir → G5.

## 5. Flujo de aprobación (admin)

**Existe.** `admin.html` → sección "Aprobaciones pendientes" (`loadPendientes`, línea 727) lista `usuarios WHERE estado='pendiente'`. `aprobarUsuario` (línea 760) hace:

```js
sb.from('usuarios').update({ estado: 'activo', activo: true }).eq('id', id);
```

**NO asigna `club_id`.** El propietario queda aprobado pero con `club_id=NULL` → rompe el INSERT de `inscripciones` (G3). La UI de aprobación funciona; lo que falta es setear el club.

## 6. Caballeriza — qué pasa aguas abajo

- **Confirmado:** `portal.html` (`saveSpc`) **nunca** setea `caballeriza_id` en el SPC, y `confirmarInscripcion` **nunca** lo setea en la inscripción.
- **No hay trigger/constraint de DB que exija caballeriza** en `spcs` ni en `inscripciones` (E1 no está vivo como guard de base). Los triggers presentes son: `set_updated_at`, `trg_audit_inscripciones`, `trg_insc_set_propietario`. Con E1 neutralizado, el INSERT en sí **no se rompe** por falta de caballeriza. ✔️ (como se esperaba).
- **PERO** el trigger `trg_insc_set_propietario` (`fn_inscripcion_set_propietario`, BEFORE) hace:
  ```sql
  IF NEW.caballeriza_id IS NOT NULL THEN <derivar propietario de caballeriza_responsables>
  ELSE NEW.propietario_id := NULL; END IF;
  ```
  Como la inscripción del portal **no trae caballeriza_id**, el trigger **fuerza `propietario_id = NULL`**, pisando el `propietario_id` que el portal sí mandó. → La inscripción pierde el dueño → liquidaciones/premios sin beneficiario (raíz de GOTCHA #47, `inscripciones.propietario_id` 10/95). → G4.

---

## Tabla de gaps

| # | Severidad | Gap | Fix (una línea) |
|---|---|---|---|
| **G1** | 🔴 **Bloqueante** | `registro-profesional.html` no puede insertar en `usuarios`: RLS `usuarios_insert WITH CHECK = fn_is_super_admin()`. El auto-registrante no es super_admin → alta imposible (0 filas reales lo confirman). | Agregar policy de auto-alta: `WITH CHECK (email = auth.jwt()->>'email' AND rol IN ('propietario','profesional') AND estado='pendiente' AND activo=false AND club_id IS NULL)`. |
| **G2** | 🔴 **Bloqueante** | `spcs.fecha_nacimiento` es NOT NULL pero el form "Nuevo SPC" la deja opcional → `saveSpc` manda `null` → error 23502. | Agregar `required` a `#mspc-nacimiento` en `portal.html` (o, alternativa, `ALTER TABLE spcs ALTER COLUMN fecha_nacimiento DROP NOT NULL`). |
| **G3** | 🔴 **Bloqueante** | Propietario aprobado queda con `club_id=NULL` (`aprobarUsuario` no lo setea) → RLS de `inscripciones` rechaza el INSERT (`fn_get_user_club_id()` = NULL). | En `aprobarUsuario` setear el club: `update({ estado:'activo', activo:true, club_id: CLUB_ID })`. |
| **G4** | 🔴 **Bloqueante** (liquidaciones) | Trigger `fn_inscripcion_set_propietario` fuerza `propietario_id=NULL` cuando `caballeriza_id` es NULL; el portal inscribe sin caballeriza → premios sin dueño (GOTCHA #47). | Fallback en el trigger: en la rama ELSE conservar el valor entrante en vez de NULL → `IF NEW.caballeriza_id IS NULL AND NEW.propietario_id IS NULL THEN ... ` (o derivar de `spc_propietarios`). |
| **G5** | 🟠 Molesto | Match portal→propietarios por email es case-sensitive; Auth minúsculiza, `registro` guarda tal cual → `propietarioId=null` con email mixed-case → no vincula SPC ni inscribe. | Normalizar a minúsculas: en `registro` insertar `email.toLowerCase()` y en portal consultar `.eq('email', session.user.email.toLowerCase())`. |
| **G6** | 🟠 Molesto | `registro` traga los errores de `propietarios`/`profesionales` (`console.warn`) y muestra "Registro enviado" aunque la fila falle → usuario sin registro vinculado. | Tratar `propErr`/`profErr` como fatal (`if (propErr) throw new Error(...)`), igual que `usrErr`. |
| **G7** | 🟢 Cosmético | El portal solo muestra reuniones con `estado IN ('publicada','abierta')`. Verificado: **R6 (20/6) está `publicada`** → sí aparecería. Sin acción; dejar nota de no cambiar el estado de R6 antes del 20/6. | Mantener R6 en `publicada` hasta el cierre de inscripción. |

---

## Orden de arreglo sugerido (para habilitar el camino al 20/6)

1. **G1** (policy de auto-alta en `usuarios`) — sin esto no hay registro.
2. **G3** (set `club_id` al aprobar) — sin esto no hay inscripción.
3. **G4** (fallback de `propietario_id` en el trigger) — sin esto los premios quedan huérfanos.
4. **G2** (`required` en fecha_nac) — sin esto no se crea el SPC.
5. **G5 / G6** (robustez de email/errores) — calidad del alta.

> Auditoría read-only: no se ejecutaron INSERTs de prueba ni cambios de código/DB. Las correcciones de arriba están propuestas, no aplicadas.
</content>
</invoke>
