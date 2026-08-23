# Diagnóstico de cuentas — 2026-08-23

**Modo:** read-only. Ninguna escritura sobre la base (ni DDL ni DML). Solo `SELECT`.
**Proyecto:** `unlhcuanfrtpatoipwve` · **Guard:** `pwd=/home/clio/dev/SGH`, `spcs=181` ✅
**Horas:** UTC salvo aclaración. ART = UTC−3.

---

## CASO 1 — Fede (fedeiguacel@gmail.com) — CUENTA ROTA ❌

| Dato | Valor |
|---|---|
| Fila en `usuarios` | **SÍ** — `ae243acf-1295-4e2e-a08a-7d48c142550e` |
| `activo` | **`false`** ← causa del problema |
| `estado` | **`pendiente`** |
| `rol` | `secretario_carreras` |
| `club_id` | `0649e9c5-…-101458e6b33c` (Hipódromo de Dolores) ✅ |
| `auth_user_id` | `8b2f4c83-04a7-4bb0-a23a-6ae4201f3870` ✅ **coincide** con el uid de Auth |
| `nombre_completo` | Federico Iguacel |
| Fila creada | 2026-08-07 04:50:25 |

### ¿Completó la invitación?
**SÍ, hoy.** En `auth.users`:
- `invited_at` = 2026-08-07 04:50:23
- `email_confirmed_at` = **2026-08-23 21:50:48** (18:50 ART)
- `last_sign_in_at` = **2026-08-23 21:51:22** (18:51 ART)

O sea: aceptó la invitación, puso su contraseña y entró. El lado Auth está **sano**.

### Por qué no ve datos
La fila de `usuarios` **nunca se marcó como activa**. Y 72 de las 124 políticas RLS
del proyecto filtran a través de:

```sql
CREATE FUNCTION fn_get_user_club_id() RETURNS uuid AS $$
  SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid() AND activo;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

Con `activo = false` la función devuelve **NULL** → toda política que compare
`club_id = fn_get_user_club_id()` da falso → **cero filas en todas las tablas**.
La sesión es válida, la UI carga, y todo aparece vacío. Es exactamente el síntoma
reportado.

Además `login.html` **no chequea `activo`**, y solo chequea `estado = 'pendiente'`
para los roles `propietario` y `profesional` (login.html:392-399). Fede es
`secretario_carreras`: pasa el login sin ningún cartel de advertencia y aterriza
en `index.html` en blanco.

### Por qué pasó (defecto de proceso, no de datos)
No existe ningún trigger sobre `auth.users`. Los triggers de `usuarios` son cuatro
(`trg_audit_usuarios`, `trg_proteger_rol_club_id_usuario`, `trg_usuarios_guard_privilegios`,
`trg_usuarios_set_auth_user_id`) y **ninguno reacciona a la aceptación de la invitación**.
Aceptar el invite en Auth no flipea `activo`/`estado` en `usuarios`: hay que hacerlo
a mano desde `usuarios.html` (botón activar → `toggleActivo`, usuarios.html:488).
Mientras nadie lo apriete, el invitado queda con sesión válida y visión nula.

Es el mismo mecanismo que afectó a Valeria (ver abajo).

---

## CASO 2 — dolores@sgh.com — CUENTA SANA ✅

| Dato | Valor |
|---|---|
| Fila en `usuarios` | **SÍ** — `9ac2d140-faec-424c-9437-0cedeb8b8b82` |
| `activo` | **`true`** ✅ |
| `estado` | `activo` ✅ |
| `rol` | `secretario_carreras` |
| `club_id` | `0649e9c5-…-101458e6b33c` (Hipódromo de Dolores) ✅ |
| `auth_user_id` | `01c55b92-c53e-42fd-948f-ebfdb31b8d65` ✅ **coincide** |
| `nombre_completo` | **"Administrador Dolores"** |
| Creada | 2026-04-22 02:07 (día 1 del proyecto) |
| `email_confirmed_at` | 2026-04-22 02:07 |
| `invited_at` | **NULL** — nunca fue invitada; se creó a mano |

### ¿Compartida o personal?
**Compartida / genérica.** Evidencia: email de rol (no de persona), `nombre_completo`
= "Administrador Dolores", creada manualmente el día 1 junto con `admin@sgh.com`,
sin invitación. No corresponde a ninguna persona física del padrón.

### Sobre el "Last signed in 23/08 12:08"
`last_sign_in_at` = **2026-08-23 15:08:24 UTC** = **12:08:24 ART**. Coincide exacto.
Alguien con la contraseña entró hoy al mediodía. La cuenta **no tiene ningún
problema de configuración**: fila OK, activo OK, club OK, uid vinculado OK.

Si Leonardo no puede entrar, la causa **no está en la base**. Queda del lado de
credenciales/plataforma. Lo más probable, en orden:
1. **Contraseña distinta** de la que él tiene (es cuenta compartida — alguien pudo cambiarla).
2. **Turnstile / Attack Protection**: `sigh.com.ar` se puso en producción hoy
   (merge `dfd320e`). Si el hostname `sigh.com.ar` no está en los hostnames
   autorizados del widget Turnstile, el login falla con `captcha_failed`
   (ver login.html:258-275 y tarea 1 del checklist de dominio). **El sign-in de las
   12:08 fue anterior al corte de dominio de las 20:35 UTC** — así que ese login
   exitoso no prueba que el flujo actual funcione.
3. Confusión de cuenta: hoy también entraron `hipodromodolores@gmail.com` (15:02 UTC)
   y `mdqclio@hotmail.com` (21:55 UTC).

**Sugerencia:** pedirle el mensaje de error exacto. Si dice "captcha" es la (2) y es
tarea de panel; si dice credenciales inválidas es la (1).

---

## Cruce completo — 10 usuarios de Auth × tabla `usuarios`

| # | email | fila `usuarios` | activo | rol | auth_user_id cargado | veredicto |
|---|---|---|---|---|---|---|
| 1 | admin@sgh.com | SÍ | `true` | super_admin | SÍ ✅ coincide | ✅ OK |
| 2 | dolores@sgh.com | SÍ | `true` | secretario_carreras | SÍ ✅ coincide | ✅ OK (compartida) |
| 3 | sanfrancisco@sgh.com | **NO** | — | — | — | ⚠️ huérfana en Auth |
| 4 | clio@mdq.com.ar | **NO** | — | — | — | ⚠️ huérfana en Auth |
| 5 | yesica@sgh.com | SÍ | `true` | operador | SÍ ✅ coincide | ✅ OK |
| 6 | mdqclio@hotmail.com | **NO** | — | — | — | ❌ ROTA — entra y rebota |
| 7 | **fedeiguacel@gmail.com** | SÍ | **`false`** | secretario_carreras | SÍ ✅ coincide | ❌ **ROTA — no ve datos** |
| 8 | vale_0735@hotmail.com | SÍ | `true` | operador | SÍ ✅ coincide | ⚠️ `estado='pendiente'` residual |
| 9 | kiritatds@gmail.com | SÍ | `true` | operador | SÍ ✅ coincide | ✅ OK |
| 10 | hipodromodolores@gmail.com | SÍ | `true` | profesional | SÍ ✅ coincide | ✅ OK |

**No hay ninguna fila en `usuarios` sin contraparte en Auth** (query de huérfanos al revés: 0 filas).
**No hay ningún `auth_user_id` desalineado**: los 7 que tienen fila coinciden con su uid de Auth.
El único campo que rompe es `activo`.

### Detalle de las rotas

**#7 fedeiguacel@gmail.com — CRÍTICA.** `activo=false` → RLS devuelve vacío. Ver Caso 1.

**#6 mdqclio@hotmail.com — ROTA.** Existe en Auth (confirmada 04/08, entró hoy 21:55 UTC)
pero **no tiene fila en `usuarios`**. Su `solicitudes_acceso` (rol pedido: `propietario`,
DNI 99999999) fue **`descartada`** el 04/08 por Yesica. Si intenta entrar, `login.html`
lo corta con *"Tu usuario no está registrado en el sistema"*. Parece cuenta de prueba
de Leonardo — si es así, está bien que quede así; si la quiere usar, hay que crear la fila.

**#3 sanfrancisco@sgh.com y #4 clio@mdq.com.ar — huérfanas inertes.** Creadas el
22/04, **nunca confirmaron email, nunca iniciaron sesión** (`email_confirmed_at` y
`last_sign_in_at` en NULL). Restos del arranque del proyecto. No molestan, pero son
identidades de Auth sin dueño ni fila: candidatas a borrar cuando se haga limpieza.

**#8 vale_0735@hotmail.com — el precedente de Fede.** Su `activo` está en `true`
(alguien lo corrigió después del incidente), pero **`estado` quedó en `'pendiente'`**.
Para su rol (`operador`) eso es inocuo: `login.html` solo mira `estado` en las ramas
`propietario`/`profesional`, y las RLS solo miran `activo`. Es inconsistencia
cosmética, no funcional — pero confirma que el arreglo de aquella vez fue manual y
parcial, y que el agujero de proceso sigue abierto. Fede cayó por el mismo.

---

## Resumen ejecutivo

1. **Fede no ve datos porque su fila tiene `activo = false`.** Todo lo demás está bien:
   completó la invitación hoy 18:51 ART, el `auth_user_id` está cargado y coincide,
   el `club_id` es Dolores, el rol es `secretario_carreras`. Un solo booleano.
2. **dolores@sgh.com está impecable en la base.** Es cuenta compartida/genérica, no
   personal. El login de hoy 12:08 ART fue real. Lo de Leonardo es credenciales o
   Turnstile post-migración de dominio, no configuración.
3. **El agujero de fondo:** aceptar una invitación en Auth no activa la fila en
   `usuarios`. No hay trigger que lo haga. Todo invitado nuevo nace inutilizable
   hasta que un admin lo activa a mano, y **no recibe ningún error que lo indique** —
   entra a un sistema vacío. Ya pasó dos veces (Valeria, Fede). Va a volver a pasar.

## Acciones sugeridas (NO ejecutadas — esta sesión fue read-only)

**Inmediata (destraba a Fede):**
```sql
-- Requiere sesión de super_admin por los triggers de guarda de privilegios.
UPDATE usuarios SET activo = true, estado = 'activo'
WHERE id = 'ae243acf-1295-4e2e-a08a-7d48c142550e';
```
Equivalente por UI: `usuarios.html` → fila de Federico Iguacel → botón Activar.

**Higiene:** normalizar `estado` de Valeria a `'activo'` (cosmético).

**De fondo (elegir una):**
- Trigger `AFTER UPDATE OF email_confirmed_at ON auth.users` que flipee
  `activo`/`estado` en la fila correspondiente; o
- que la Edge Function `invite-user` cree la fila ya con `activo = true`
  (la aprobación se controla en el invite, no después); o
- mínimo: chequear `activo` en `login.html` para **todos** los roles y mostrar
  *"Tu cuenta está pendiente de activación"* en lugar de un dashboard vacío.

Lo tercero es barato y ataca el peor síntoma (el silencio). Lo primero es lo correcto.
