# Gate 1 — Cerrar los huecos que el auto-registro activa

**Fecha**: 2026-08-04 · **Rama**: `sec/autoregistro-gate-1` · **Base**: `main` @ `eb61639`
**Guard**: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** antes y después ✅
**Rollback**: commiteado **antes** de aplicar → `migrations/sec_autoregistro_gate1_rollback.sql` (`2e89c1e`)
**Migración**: `migrations/sec_autoregistro_gate1.sql` (`0f18c8a`), aplicada por MCP como `sec_autoregistro_gate1`

---

## Resultado

🟢 **Los tres probes en verde.** 0 policies permisivas, canario 0a 18/18, portal sin regresión.

---

## 🔎 Hallazgo: el probe no podía ver el hueco que buscábamos

`probe_rls_no_permissive` venía dando **verde con ALLOWLIST vacía** desde el 01/08 — mientras `performances_select` y `sanciones_select` tenían `USING (true)` desde siempre.

La causa está en la función que el probe consulta:

```sql
-- ANTES
WHERE p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
```

**Auditaba sólo escrituras.** Un `SELECT` con `USING (true)` era invisible para el probe. Por eso el hueco sobrevivió a toda la pasada SEC_RLS sin que nadie lo viera: no es que se tolerara, es que no se miraba.

Corregido en el punto 6 de la migración. La ALLOWLIST sigue **vacía** y ahora es estricta también en lectura.

---

## Los seis cambios

### 1 · `performances_select` — era `USING (true)`

`performances` es el historial de carreras del ejemplar. **No tiene `club_id`**: es dato cross-club por naturaleza (`hipodromo_sigla` es texto libre), así que no se puede scopear por club.

Se copia el criterio que ya resuelve el mismo problema para los SPCs —también globales, GOTCHA #13— en `spcs_select`:

```sql
USING ( (SELECT fn_is_staff()) OR spc_id IN (SELECT s.spc_id FROM fn_mis_spc_ids() s) )
```

Staff ve todo; el usuario de portal ve lo de **sus** ejemplares. Una cuenta pendiente no es staff y `fn_mis_spc_ids()` le devuelve vacío → **0 filas**.

### 2 · `sanciones_select` — era `USING (true)`

Acá **no alcanzaba con filtrar por club**, y esa es la parte que había que pensar: la tabla existe justamente para que las sanciones se compartan entre hipódromos (CLAUDE.md). La columna `alcance` es la que dice hasta dónde llega cada una — hoy el único valor cargado es `'club'`.

Tres ramas:

| quién | ve |
|---|---|
| `super_admin` | todo |
| staff | las de su club **más** las de otros clubes con `alcance <> 'club'` (las compartidas) |
| usuario de portal | las que lo tienen a **él** como entidad sancionada: como profesional, como propietario, o por uno de sus ejemplares |
| cuenta pendiente | ninguna rama aplica → **0 filas** |

`alcance` es `NOT NULL`, así que `alcance <> 'club'` no tiene el agujero del NULL. `entidad_sancionada` = `profesional | spc | propietario | caballeriza`; **caballeriza queda afuera a propósito**: no existe vínculo cuenta→caballeriza.

### 3 · `ux_entidad_una_cuenta`

```sql
CREATE UNIQUE INDEX ux_entidad_una_cuenta ON usuarios (entidad_tipo, entidad_id)
  WHERE entidad_id IS NOT NULL AND activo;
```

Es la salvaguarda que `PORTAL_V2_PLAN` §B.3 preveía para `usuario_entidades` y que quedó sin implementar cuando el vínculo terminó viviendo en columnas de `usuarios`. Sin ella, aprobar dos solicitudes contra la misma ficha **le da a dos personas la misma plata**.

0 filas con `entidad_id` hoy → no podía fallar por datos previos.

### 4 · `fn_get_user_club_id()` + `AND activo` — defensa en profundidad (§C.1)

```sql
-- ANTES: SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid();
-- AHORA: SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid() AND activo;
```

No filtraba por `activo`, y como `usuarios.club_id` es **NOT NULL**, *cualquier* fila en `usuarios` —aunque fuera `activo=false, estado='pendiente'`— daba lectura de **todo el club**: reuniones, carreras, inscripciones, caballerizas, resultados, apoderados, caballeriza_responsables.

El Gate 2 evita el problema por otra vía (el pendiente no tiene fila en `usuarios`), pero dejar la función así era dejar el arma cargada.

**Sin `LIMIT`** a propósito: `ux_usuarios_auth_user_id` es UNIQUE parcial sobre `auth_user_id`, así que no puede devolver más de una fila. Un resultado ambiguo es imposible, en vez de silenciosamente arbitrario.

Verificado antes de aplicar: **los 3 usuarios de prod tienen `activo=true`** → nadie perdió acceso. Confirmado después por el canario.

### 5 · `usuarios.rol` DEFAULT `'operador'` → `'publico'` — defensa en profundidad (§C.2)

`fn_is_staff()` cuenta `'operador'` como staff. Un INSERT que omitiera el rol **creaba staff**.

Verificado: los 3 lugares que insertan en `usuarios` (`invite-user` y los dos probes de RLS) pasan `rol` **explícito**, así que el cambio no altera ningún camino vivo.

### 6 · `fn_audit_policies_permisivas()` ahora mira `SELECT`

Ver el hallazgo de arriba.

---

## Verificación

Todas las expresiones nuevas van envueltas en `(SELECT fn_...())` — optimización InitPlan de R2a. Confirmado: **0 policies sin wrap**.

### Estado de la base

| chequeo | valor |
|---|---|
| policies permisivas (auditor ampliado a SELECT) | **0** |
| `usuarios.rol` default | `'publico'::rol_usuario` |
| `ux_entidad_una_cuenta` | existe, `WHERE entidad_id IS NOT NULL AND activo` |
| `fn_get_user_club_id` tiene `AND activo` | **true** |
| policies totales | 120 (sin cambio de cantidad) |
| policies sin wrap InitPlan | **0** |
| `spcs` | **144** antes y después |

### Probes

| probe | resultado |
|---|---|
| `probe_rls_no_permissive` (ALLOWLIST vacía, ahora estricto también en lectura) | ✅ **PASS · 0 permisivas** |
| `probe_rls_secretaria` — **canario 0a** | ✅ **18 OK · 0 FAIL — CANARIO VERDE** |
| `probe_rls_portal` | ✅ **11 PASS · 0 FAIL · 2 PENDIENTE** |

Los 2 PENDIENTE del portal son los asserts 11 y 12, que dependen del RPC de inscripción del Gate 4. Ya estaban pendientes antes; no son regresión.

### Residuo

| | |
|---|---|
| `auth.users` | 5 (baseline) |
| `usuarios` | 3, los 3 activos |
| fixtures de probe (`%probe%`, `%.invalid`) en ambas tablas | **0** |

---

## Qué cambia para una cuenta pendiente

Con el Gate 1 aplicado, el cuadro de `AUTOREGISTRO_PLAN` §C.7 queda **sin huecos**:

| tabla | lo que ve un pendiente |
|---|---|
| `reuniones`, `carreras`, `inscripciones`, `caballerizas`, `resultados`, `apoderados`, `caballeriza_responsables` | 0 filas |
| `propietarios`, `profesionales`, `spcs`, `liquidaciones`, `recibos`, `liquidacion_detalle` | 0 filas |
| `usuarios` | 0 filas |
| **`performances`, `sanciones`** | **0 filas** ← cerrado en este gate |

Era el último hueco alcanzable desde una cuenta recién creada.

---

## Siguiente

**Gate 2 — solicitudes**: tabla `solicitudes_acceso` (con el estado `descartada` y la regla de los curiosos), `fn_sugerencias_match`, `fn_aprobar_solicitud`, `fn_rechazar_solicitud`, y la Edge Function `solicitar-acceso` con rollback de `auth.users`.

Su probe es la variante **"cuenta pendiente"** sumada a `probe_rls_portal` (§E.1 del plan, asserts P1–P10). El assert **P5** —pendiente lee `performances` y `sanciones` → 0 filas— ya pasaría hoy gracias a este gate.
