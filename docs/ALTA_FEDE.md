# Alta de Federico Iguacel — alta de producción por vía servidor

**Fecha:** 2026-08-07 · 04:50 UTC (01:50 ART)
**Proyecto:** `unlhcuanfrtpatoipwve` (prod)
**Resultado:** ✅ alta creada, invitación enviada, sin residuo.

Alta **real**, no un probe: sin fixtures, sin teardown, sin patrón de prueba.
Se hizo por vía servidor porque `usuarios.html` no puede invitar con ninguna de
las dos cuentas que se usan a diario (ver ISSUE-050, abajo).

---

## 1. Guards previos

| Guard | Esperado | Medido |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ `/home/clio/dev/SGH` |
| `SELECT count(*) FROM spcs` | 167 | ✅ 167 |
| `usuarios` con ese email | 0 | ✅ 0 |
| `auth.users` con ese email | 0 | ✅ 0 |
| club del caller = Dolores | sí | ✅ `0649e9c5-…b33c` |

El script aborta con exit 3 si cualquiera de los dos pre-chequeos de colisión
da distinto de 0 — no pisa nada existente.

---

## 2. Camino usado

El mismo de `tests/probe_invite_user.mjs`, sin la parte de probe:

1. **Token del caller** por Admin API `generateLink({type:'magiclink'})` +
   `verifyOtp` contra el camino anon. No manda mail y es inmune al captcha de
   Attack Protection (que desde el 04/08 bloquea `signInWithPassword` headless).
2. **`POST /functions/v1/invite-user`** con ese token en el `Authorization`.
   La Edge Function es el único lugar donde vive la key secreta server-side;
   resuelve el `club_id`, valida el rol y hace `inviteUserByEmail` + el INSERT
   en `public.usuarios` en un solo camino con compensación anti-huérfanos.
3. **Verificación** de la fila resultante y de la cuenta de Auth.

**Caller:** `dolores@sgh.com` (`secretario_carreras`, Dolores).
Su regla en el mapa de autorización de la función es `alcanceClub: 'propio'`, o
sea que el `club_id` sale de **su propia fila** y el del body sólo sirve como
verificación: si no coincidiera, la función devuelve `403 club_ajeno` **antes de
escribir nada**. Se mandó igual, explícito, por eso.

**Rol otorgado:** `secretario_carreras`. Está en el `puedeInvitar` de ese caller
(`supabase/functions/invite-user/index.ts:91`), así que no hizo falta escalar a
`super_admin`.

Script: `alta_fede.mjs` — se corrió desde el scratchpad de la sesión, **no** se
versiona en `tests/` a propósito: no es un probe y no debe volver a correrse.

---

## 3. Datos cargados

```
email            [EMAIL REDACTADO]      (normalizado a minúsculas por la función)
nombre_completo  Federico Iguacel
telefono         +5491158911520
rol              secretario_carreras
club_id          0649e9c5-9e87-4aad-842f-101458e6b33c   (Hipódromo de Dolores)
```

Respuesta de la función:

```json
HTTP 200 {"ok":true,"estado":"invitado","email":"[EMAIL REDACTADO]",
          "ya_existia":false,"reparado":false}
```

---

## 4. Verificación — fila creada

`public.usuarios`:

```json
{
  "id":              "ae243acf-1295-4e2e-a08a-7d48c142550e",
  "email":           "[EMAIL REDACTADO]",
  "nombre_completo": "Federico Iguacel",
  "telefono":        "+5491158911520",
  "rol":             "secretario_carreras",
  "club_id":         "0649e9c5-9e87-4aad-842f-101458e6b33c",
  "activo":          false,
  "estado":          "pendiente",
  "auth_user_id":    "8b2f4c83-04a7-4bb0-a23a-6ae4201f3870",
  "created_at":      "2026-08-07T04:50:25.256848+00:00"
}
```

13/13 asserts en verde:

- ✅ exactamente **1** fila en `usuarios`
- ✅ email en minúsculas · nombre_completo · telefono · rol · club_id
- ✅ `estado = 'pendiente'` y `activo = false` — se activan cuando Fede fije la
  contraseña desde el mail (§4.1 del plan, `reset-password.html`)
- ✅ cuenta creada en `auth.users` (`8b2f4c83-…3870`), **sin confirmar**
- ✅ `usuarios.auth_user_id == auth.users.id`

### `auth_user_id` — el trigger sí lo resuelve (verificado)

La Edge Function **no** incluye `auth_user_id` en su payload de INSERT
(`index.ts:477-486`). Lo completa el trigger de la fase 1:

```
trg_usuarios_set_auth_user_id
  BEFORE INSERT OR UPDATE OF email ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_usuarios_set_auth_user_id()
```

Funciona porque el orden de la función es el correcto: primero
`inviteUserByEmail` (crea la cuenta en Auth), después el INSERT — cuando el
trigger busca por email, la cuenta ya existe. Confirmado: el valor quedó cargado
y coincide exacto con `auth.users.id`. **No hizo falta tocarlo a mano.**

---

## 5. Verificación — mail disparado

De los logs de Auth (`get_logs service=auth`):

```
POST /invite → 200
auth_event: {"action":"user_invited","actor_username":"service_role",
             "traits":{"user_email":"[EMAIL REDACTADO]",
                       "user_id":"8b2f4c83-04a7-4bb0-a23a-6ae4201f3870"}}
```

`auth.users.invited_at = 2026-08-07 04:50:23.239951+00`. Ningún error de mailer
en la ventana (1 sola entrada no-info en las últimas 100: un
`refresh_token_not_found` de otra sesión, ajeno a esto).

El proyecto usa SMTP propio (Resend) desde el 24/07, así que el `200` significa
que Resend **aceptó** el mensaje.

> ⚠️ **Pendiente humano:** la API responde 200 aunque la entrega final falle.
> Confirmar con Fede que el mail llegó a `[EMAIL REDACTADO]` (revisar spam).
> El link lleva a `https://mdqclio.github.io/SGH/reset-password.html` y al fijar
> la contraseña la fila pasa a `activo=true` / `estado='activo'`.
> Si no llegó: reinvitar desde `usuarios.html` (botón de reenvío, `reinvitar:true`)
> — el token rota, vale siempre el último mail.

---

## 6. Sin residuo de prueba

```sql
SELECT (SELECT count(*) FROM spcs)                                  -- 167 (sin cambios)
     , (SELECT count(*) FROM usuarios)                              -- 4  (era 3)
     , (SELECT count(*) FROM auth.users)                            -- 7  (era 6)
     , residuo_usuarios                                             -- 0
     , residuo_auth                                                 -- 0
```

`residuo_*` = filas cuyo email o `nombre_completo` matchea `%probe%`, `%test%`,
`%prueba%` o `%.invalid`. **Cero de los dos lados.** Los fixtures del 06/08
(`probe-rls-portal-*`, `probe-g4-*`, `probe-ui-*`) figuran en los logs como
`user_deleted`: los limpió su propio teardown.

Delta total del alta: **+1 fila en `usuarios`, +1 cuenta en `auth.users`**. Nada más.

### Efecto secundario, anotado

`auth.users.last_sign_in_at` de `dolores@sgh.com` quedó en `2026-08-07 04:50:20Z`
por el magic link que se canjeó para obtener el token del caller. Es un login
real de esa cuenta (`login_method: otp` en los logs). No cambia permisos ni
invalida la sesión que esa cuenta tenga abierta en el browser; queda dicho para
que no sorprenda en la auditoría.

---

## 7. Issue anotado — ISSUE-050

`usuarios.html` no puede invitar con ninguna de las **dos cuentas que se usan a
diario**. Detalle completo en `docs/ISSUES.md` § ISSUE-050. Resumen:

| Cuenta | Rol | Qué pasa hoy |
|---|---|---|
| `admin@sgh.com` | `super_admin` | ❌ `422 club_id_requerido` — la pantalla nunca manda `club_id` |
| `yesica@sgh.com` | `operador` | ❌ `403 rol_caller_no_autorizado` — el rol no está en el mapa |
| `dolores@sgh.com` | `secretario_carreras` | ✅ **sí funcionaría** desde la pantalla |

**Corrección al diagnóstico de partida:** no es que no pueda invitar *nadie* —
`dolores@sgh.com` sí puede, y es exactamente la cuenta que se usó acá (por vía
servidor). Importa para el alcance del fix del lunes: es un hueco de UX para el
`super_admin`, no un bloqueo total del alta.

**Fix del lunes:** selector de club para `super_admin` en `usuarios.html`, que
mande el `club_id` en el body. La función ya lo soporta
(`alcanceClub: 'cualquiera'`) y ya devuelve el code exacto para guiarlo.
