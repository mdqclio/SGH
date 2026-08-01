# SEC_RLS — FASE 1: identidad por `auth.uid()`

**Fecha:** 01/08/2026
**Branch:** `sec/rls-portal-fase-1` (desde `sec/rls-portal-fase-0` @ `e937ddc`)
**Proyecto:** `unlhcuanfrtpatoipwve`
**Guard:** `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** ✅ (antes y después)

**Estado: APLICADA en producción.** Migración `sec_rls_fase1_auth_uid`.

---

## Resultado

| Chequeo | Esperado | Real |
|---|---|---|
| `usuarios` totales | 3 | **3** |
| Con `auth_user_id` | 3 | **3** |
| Sin `auth_user_id` | 0 | **0** |
| Funciones sobre `auth.uid()` | 2 | **2** |
| Funciones sobre `auth.jwt()` (email) | 0 | **0** |
| Trigger de autocompletado | 1 | **1** |
| **Canario 0a** | 18/18 | **18 OK · 0 FAIL** ✅ |

Vínculos verificados uno por uno contra `auth.users`: los 3 con `coincide_con_auth = true`.

---

## 1a — la columna y el backfill

### Pre-chequeo (read-only, antes de tocar nada)

| Métrica | Valor |
|---|---|
| `usuarios` totales | 3 |
| Con match en `auth.users` (por email, case/trim-insensitive) | **3/3** |
| Emails duplicados en `usuarios` | 0 |
| Emails duplicados en `auth.users` | 0 |
| `auth.users` huérfanos (sin fila en `usuarios`) | 2 |

**3/3 ⇒ condición de avance cumplida**, así que las funciones quedaron **sin fallback por email**, como estaba especificado.

### Los 2 huérfanos de Auth

`sanfrancisco@sgh.com` y `clio@mdq.com.ar`. Creados el 22/04/2026, `email_confirmed_at` en NULL, `last_sign_in_at` en NULL. No tienen fila en `public.usuarios`, así que no pueden operar el sistema — y eso no cambió con esta fase. La FK va `usuarios → auth.users`, de modo que un huérfano del otro lado no molesta.

No se tocaron. Si son invitaciones abandonadas conviene limpiarlas, pero es una decisión aparte.

### DDL aplicado

```sql
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS auth_user_id uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_auth_user_id
  ON public.usuarios (auth_user_id) WHERE auth_user_id IS NOT NULL;
```

Dos decisiones que no son obvias:

- **`ON DELETE SET NULL`, no `CASCADE`.** Borrar una cuenta de Auth no debe hacer desaparecer la fila de `usuarios`, que es la que lleva rol, club y el vínculo con `auditoria`. Queda huérfana y visible.
- **Índice único parcial** (`WHERE auth_user_id IS NOT NULL`) en vez de `UNIQUE` a secas: permite varias filas con NULL mientras se completa el vínculo, sin perder la garantía de unicidad donde importa.

### Guard de aborto

La migración lleva un bloque `DO` que hace `RAISE EXCEPTION` si queda alguna fila con `auth_user_id` NULL. No es decorativo: cambiar las funciones del paso 1b con filas sin vincular le sacaría el acceso a esa persona **en silencio**, y el síntoma (todo vacío) no apunta a la causa. Con 3/3 no llegó a dispararse.

---

## 1a-ter — trigger de autocompletado (agregado respecto del plan)

**Esto no estaba en el plan y conviene entender por qué está.**

`usuarios.html` y la edge function `invite-user` insertan en `public.usuarios` sin conocer la columna nueva. Después del paso 1b, una fila con `auth_user_id` NULL no resuelve club: **el próximo usuario que invitara la secretaría no vería nada**, y el síntoma no apuntaría a la causa. Con la carga de R8 proyectada al ~08/08, dejar esa mina era peor que agregar el trigger.

```sql
CREATE TRIGGER trg_usuarios_set_auth_user_id
  BEFORE INSERT OR UPDATE OF email ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.fn_usuarios_set_auth_user_id();
```

Resuelve el id contra `auth.users` por email cuando viene NULL.

**No reintroduce el vector de suplantación:** sólo un super_admin puede insertar en `usuarios` (`usuarios_insert WITH CHECK fn_is_super_admin()`), y lo que se resuelve es un id inmutable, no una credencial. El email deja de ser la identidad; pasa a ser sólo la forma de encontrar el id una vez, en el alta.

### Verificado

Probado con un INSERT real dentro de una transacción revertida, usando una de las cuentas de Auth huérfanas:

```
email=sanfrancisco@sgh.com  auth_user_id=332175cb-…  trigger_resolvio_bien=true
```

`ROLLBACK` confirmado: `usuarios` sigue en 3, sin residuo.

**Límite conocido:** si la cuenta de Auth todavía no existe cuando se inserta la fila (invitación en vuelo), queda NULL. El trigger vuelve a intentarlo en el `UPDATE OF email`, pero no hay reintento automático por otra vía. **Pendiente de FASE 2:** verificar en qué orden `invite-user` crea las dos cosas.

---

## 1b — las dos funciones

```sql
-- antes
SELECT club_id FROM usuarios WHERE email = (auth.jwt() ->> 'email') LIMIT 1;
-- después
SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid();
```

(ídem `fn_is_super_admin()`.)

Se conservan `STABLE`, `SECURITY DEFINER` y `SET search_path` — GOTCHA #10: sin `SECURITY DEFINER` las policies que las usan entran en recursión infinita.

**Desaparece el `LIMIT 1`.** No es cosmético. Antes tapaba la ambigüedad cross-club: el mismo email en dos clubes es legal (el único índice es `(club_id, email)`) y el `LIMIT 1` elegía un club **arbitrario en silencio**. Con el índice único sobre `auth_user_id`, un resultado ambiguo pasa a ser imposible en vez de improbable.

---

## Lo que esta fase NO resolvió

Honestidad sobre el alcance, porque el título "identidad por auth.uid()" promete más de lo que una fase puede dar:

**Las policies de `usuarios` siguen teniendo una rama por email.** Verificado después de aplicar:

```sql
usuarios_select USING (fn_is_super_admin()
                    OR email = auth.jwt()->>'email'      -- ← sigue acá
                    OR club_id = fn_get_user_club_id())
usuarios_update USING (fn_is_super_admin()
                    OR email = auth.jwt()->>'email')     -- ← y acá
```

La FASE 1 cambió **las funciones**, no estas dos policies. Están en el alcance de **FASE 2 paso 5**. Hasta entonces, un usuario puede seguir alcanzando su propia fila por coincidencia de email — que es mucho menos grave que el vector de §D-H1 (ahí el email lo escribía *otro*), pero no es cero.

Tampoco cambió nada de esto, que es lo esperado:

- Los 9 huecos de `probe_rls_portal.mjs` siguen abiertos. Son FASE 2.
- Ninguna policy fue tocada. El único cambio de comportamiento es *cómo* las funciones resuelven usuario → club.

---

## Rollback

Escrito y commiteado **antes** de aplicar (`d98622a`), con el fuente exacto de las dos funciones capturado de `pg_get_functiondef()`.

```bash
# migrations/sec_rls_fase1_auth_uid_rollback.sql
```

Restaura las funciones primero y dropea la columna al final, para no dejar un intervalo donde las funciones referencien algo inexistente. También elimina el trigger.

**Cuándo correrlo:** si el canario 0a se pone rojo, o si un usuario real no puede loguearse. Sin discutir: primero se revierte, después se averigua.

---

## Residuo: cero

| Chequeo | Valor |
|---|---|
| `usuarios` totales | 3 |
| Residuo del test del trigger | 0 |
| Fixtures `probe-rls-%` en `usuarios` / `auth.users` | 0 / 0 |
| Marcas `probe-rls-%` en `inscripciones` | 0 |
| `spcs` | **144** |

---

## GATE 1 — falta una sola cosa

El canario está verde, pero **usa un usuario fixture**, no una cuenta real. Las policies no distinguen qué usuario de secretaría es, así que los caminos son los mismos — pero eso no sustituye la prueba real, y el gate la exige explícitamente.

**Probá tu login en `https://mdqclio.github.io/SGH/`** y confirmá que:

1. Entrás con `admin@sgh.com` y ves el panel de super_admin.
2. Idealmente también `dolores@sgh.com` (secretaría) — es el rol que más importa para R8.
3. Se ven las reuniones y las inscripciones, no pantallas vacías.

Si algo de eso falla, es rollback inmediato: el archivo está listo y probado en su lógica.

Con tu OK arranca la **FASE 2** (cierre de los 4 `USING (true)` + escritura de portal + lectura de plata), que es donde 0b tiene que pasar de 9 FAIL a 0.
