# PROBE RUN 1 — alta por invitación (`invite-user`)

**Fecha:** 2026-07-29
**Ejecutor:** sesión Claude Code sobre VPS Hetzner, `/home/clio/dev/SGH`
**Autorización:** OK explícito de Leo para UNA sola corrida.
**Run id del probe:** `9ph2e7`
**Ventana de la corrida (UTC):** `2026-07-29T04:05:02Z` → `2026-07-29T04:05:28Z` (26 s)
**Resultado:** `=== 36 OK · 0 FAIL ===`, exit code `0`

---

## 0. Guards previos (todos verificados ANTES de correr)

| Guard | Esperado | Medido | Estado |
|---|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | `/home/clio/dev/SGH` | ✅ |
| Branch | `main` | ver nota ⚠️ abajo | ⚠️ corregido |
| Working tree | limpio | limpio (`git status --porcelain` vacío) | ✅ |
| `SELECT count(*) FROM spcs` | ~144 | **144** | ✅ |
| Project ref | `unlhcuanfrtpatoipwve` | `unlhcuanfrtpatoipwve` | ✅ |
| Función viva conserva `esKidNilAdminApi` | sí | **sí** | ✅ |
| Función viva conserva `esTransitorioPreMail` | sí | **sí** | ✅ |

### ⚠️ Nota sobre el branch

La sesión arrancó en `tmp/deploy-report`, no en `main`. Verificado antes de tocar nada:

- `main` es ancestro de `HEAD` (`git merge-base --is-ancestor main HEAD` → true)
- `tmp/deploy-report` estaba 1 commit adelante de `main`, y ese commit es sólo
  documentación (`da51206`, el reporte del gate de deploy)
- `git diff --stat main -- tests/` → **vacío**: el probe era byte-idéntico al de `main`

Con el árbol limpio se hizo `git checkout main` y desde ahí se corrió. No hubo
cambios de código entre lo que se auditó y lo que se ejecutó.

### Estado de la función viva (Edge Function `invite-user`)

Leído por MCP `get_edge_function` justo antes de correr:

```
version:    2
status:     ACTIVE
updated_at: 1785289202711  → 2026-07-29 01:40:02 UTC
sha256:     5b6406c0c8851fa940802b77f3e4de56361b851a525e30dbe40a2a308e4e9f64
verify_jwt: true
```

Ambos predicados de la rama transitoria están presentes en el fuente vivo — **no
se revirtió sola**:

```ts
function esKidNilAdminApi(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const txt = `${err.code ?? ''} ${err.message ?? ''}`.toLowerCase();
  return txt.includes('unrecognized jwt kid')
    || (txt.includes('invalid jwt') && txt.includes('es256'));
}

function esTransitorioPreMail(
  err: { status?: number; code?: string; message?: string } | null,
): boolean {
  if (!err) return false;
  if (err.status === 502 || err.status === 503 || err.status === 504) return true;
  return esKidNilAdminApi(err);
}
```

Y los dos sitios que devuelven `503 error_transitorio` (uno en el catch de
`findAuthUserByEmail`, otro en el manejo de error de `inviteUserByEmail`) siguen
en su lugar.

---

## 1. Estado PREVIO a la corrida

Consulta (MCP `execute_sql`, `2026-07-29T04:04Z`):

```sql
SELECT 'auth.users' AS origen, id::text, email, email_confirmed_at::text, created_at::text
FROM auth.users
WHERE email ILIKE '%probe-invite%' OR email ILIKE '%sgh-probe.invalid'
   OR email ILIKE '[EMAIL REDACTADO]'
UNION ALL
SELECT 'public.usuarios', id::text, email, estado || '/' || activo::text, created_at::text
FROM usuarios
WHERE email ILIKE '%probe-invite%' OR email ILIKE '%sgh-probe.invalid'
   OR email ILIKE '[EMAIL REDACTADO]'
ORDER BY 1,3;
```

Resultado: **`[]` — cero filas**, en las dos tablas. No había residuo de corridas
anteriores. Punto de partida limpio.

---

## 2. La corrida

### 2.0 Intento abortado previo (sin efectos)

El primer `node tests/probe_invite_user.mjs` cortó en la validación de env:

```
FALTA env: INVITE_FN_URL
EXIT_CODE=2
```

`.env` del VPS sólo trae `SUPABASE_SECRET_KEY`; el probe además exige
`INVITE_FN_URL`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. El corte fue en
`requireEnv()`, en las primeras líneas del módulo: **cero llamadas de red, cero
escrituras, cero mails**. No cuenta como corrida — no llegó a tocar el proyecto.
Se completaron las tres env faltantes (las tres son valores públicos: URL del
proyecto, URL de la función, publishable key) y se corrió **una vez**.

### 2.1 ENV efectivo

```bash
SUPABASE_URL=https://unlhcuanfrtpatoipwve.supabase.co
INVITE_FN_URL=https://unlhcuanfrtpatoipwve.supabase.co/functions/v1/invite-user
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...       # pública, ya vive en el repo
SUPABASE_SECRET_KEY=sb_secret_...                 # de ./.env, gitignoreado
INVITE_TEST_EMAIL=[EMAIL REDACTADO]
INVITE_REINVITACIONES=0
INVITE_KEEP_TEST_USER                             # SIN setear (unset explícito)
```

### 2.2 Salida

```
=== probe_invite_user  (run 9ph2e7) ===
fn: https://unlhcuanfrtpatoipwve.supabase.co/functions/v1/invite-user
club propio: Mi Club Hípico
club ajeno:  Hipódromo de Dolores

[2] 401 — sin token                                          ✅ status 401
[3] 403 — caller rol operador                                ✅ 403 / rol_caller_no_autorizado
[4] 403 — secretario_carreras invitando a un club ajeno      ✅ 403 / club_ajeno
[4b] 403 — secretario_carreras creando un super_admin        ✅ 403 / rol_no_invitable
[6] 422 — rol inválido                                       ✅ 422 / rol_invalido
[1] 200 — invitación feliz                                   ✅ 13 asserts
[5] 409 — mismo email, sin reinvitar                         ✅ 409 / ya_existe
[7] reinvitación (x0)                                        ⏭️ SALTEADO

— Cleanup —
  limpiados: 4 filas usuarios, 4 auth users

— Reintentos —
  0 reintentos: ninguna llamada necesitó repetirse.

=== 36 OK · 0 FAIL ===
```

En los casos 3, 4, 4b y 6 el probe además verificó que **no se creó fila en
`usuarios` ni cuenta en Auth** — los rechazos son previos a cualquier escritura,
como diseña el §2.1 paso 5.

Caso 1 (feliz) verificó: `status 200`, `ok=true`, `estado=invitado`, email
normalizado a lowercase, `ya_existia=false`, fila creada en `public.usuarios` con
`estado='pendiente'` / `activo=false` / `rol='operador'`, y — lo importante —
**`club_id` = el del caller, no el del body**. La cuenta de Auth quedó creada y
**sin confirmar**.

Caso 7 salteado por `INVITE_REINVITACIONES=0`. El probe lo reporta como salteado
(no como pass), que es lo correcto: **el §2.4 del plan queda igual de sin
verificar que antes de esta corrida**.

---

## 3. ⛔ Contador de reintentos: `error_transitorio` = **0**

Esto es lo que más importa del reporte, y la respuesta es negativa.

```
— Reintentos —
  0 reintentos: ninguna llamada necesitó repetirse.
  (con el bug "kid <nil>" activo esto es POCO probable — si la corrida
   fue larga y no hubo ni uno, vale confirmar que el bug sigue vivo)
```

La instrumentación agregada en `58d90ed` marcó **cero** para todos los códigos, y
en particular **`error_transitorio` no apareció ni una vez**.

**Dicho explícitamente: la rama de retry NO se ejercitó. Esta corrida no prueba
absolutamente nada sobre el manejo de errores transitorios.** Lo que quedó
demostrado es que el camino feliz y los cinco caminos de rechazo funcionan
contra la v2 deployada — nada más que eso.

Los 503 `error_transitorio` no se pueden provocar a voluntad: dependen de que la
plataforma tire el `kid <nil>`. Para verificar esa rama hace falta un test que
inyecte el error (stub del cliente admin), no una corrida contra prod.

### 3.1 Dato lateral: el bug de plataforma puede estar apagado

La corrida hizo **≥15 llamadas a endpoints admin de GoTrue** (`POST /admin/users`
×3, `GET /admin/users` ×7+, `DELETE /admin/users` ×4, más `/token` y `/user`) y
**todas devolvieron 200**. Con la tasa medida el 24/07/2026 (~1 de cada 3
rechazadas con `kid <nil>`), la probabilidad de que 15 llamadas seguidas pasen
todas es ≈ (2/3)^15 ≈ **0,2 %**.

O el bug de plataforma ya está corregido del lado de Supabase, o su tasa bajó
muchísimo. Es una hipótesis, no una conclusión: 26 s de ventana es poca muestra.
Pero si el bug efectivamente murió, la rama de retry **nunca** se va a ejercitar
sola en prod, y confirmarla exige un test con error inyectado.

---

## 4. Logs de la ventana de la corrida

### 4.1 `get_logs(service='edge-function')` → **vacío** (`[]`)

Cero líneas. Consistente con la corrida: la función sólo escribe a `console.*`
en caminos de error (`lookup caller`, `lookup destinatario`,
`findAuthUserByEmail`, `inviteUserByEmail`, `COMPENSACION_FALLIDA`,
`unhandled`) o cuando la key admin sale de un fallback distinto de
`INVITE_DB_KEY`. Nada de eso ocurrió → nada que loguear.

No se puede distinguir con certeza "no hubo output" de "el colector no devolvió
nada en esta ventana". Lo que sí confirma que la función corrió son los logs de
API con user-agent `Deno/2.1.4 (variant; SupabaseEdgeRuntime/1.74.2)` (§4.3).

### 4.2 `get_logs(service='auth')` — líneas relevantes

**El único `/invite` de toda la ventana** (el mail del caso 1):

```json
{"auth_event":{"action":"user_invited","actor_id":"00000000-0000-0000-0000-000000000000",
 "actor_username":"service_role","log_type":"team",
 "traits":{"user_email":"[EMAIL REDACTADO]",
           "user_id":"e4991d57-504b-4e3e-b3b7-e06d72b9c962"}},
 "component":"api","duration":1784565713,"level":"info","method":"POST",
 "msg":"request completed","path":"/invite",
 "referer":"https://mdqclio.github.io/SGH/reset-password.html",
 "remote_addr":"35.159.194.105",
 "request_id":"019fac0c-5812-70a9-8b1b-804658648a7a",
 "status":200,"time":"2026-07-29T04:05:19Z"}
```

`status 200`, `duration` 1.78 s (el tiempo de handshake+entrega al SMTP).
`remote_addr` = IP del runtime de la Edge Function, no del VPS.

Creación de los 3 fixtures (`user_signedup`, todos 200):

```
04:05:05Z  POST /admin/users  200  probe-invite-super-9ph2e7@sgh-probe.invalid
04:05:06Z  POST /admin/users  200  probe-invite-operador-9ph2e7@sgh-probe.invalid
04:05:06Z  POST /admin/users  200  probe-invite-secretario-9ph2e7@sgh-probe.invalid
```

Logins de los fixtures (`/token`, `grant_type=password`, todos 200) a las
04:05:07–04:05:08Z.

Borrado del cleanup (`user_deleted`, todos 200):

```
04:05:27Z  DELETE /admin/users/b40ad65e...  probe-invite-super-9ph2e7@sgh-probe.invalid
04:05:27Z  DELETE /admin/users/a55ab325...  probe-invite-operador-9ph2e7@sgh-probe.invalid
04:05:28Z  DELETE /admin/users/7d9cb8bd...  probe-invite-secretario-9ph2e7@sgh-probe.invalid
04:05:28Z  DELETE /admin/users/e4991d57...  [EMAIL REDACTADO]
```

### 4.3 Búsqueda del camino transitorio / 503

Barrido de las dos fuentes de log sobre la ventana completa:

| Buscado | Ocurrencias |
|---|---|
| `503` | **0** |
| `502` / `504` | **0** |
| `error_transitorio` | **0** |
| `unrecognized jwt kid` | **0** |
| `invalid JWT` / `ES256` | **0** |
| status ≠ 2xx en cualquier log | **0** |

**No hay ni una línea del camino transitorio.** Todos los status de la ventana
son `200`, `201` o `204`. No hay evidencia de que la rama nueva se haya
ejecutado, porque no se ejecutó.

Los logs de API confirman qué llamó la función (user-agent
`Deno/…/SupabaseEdgeRuntime/1.74.2`) vs. qué llamó el probe (`node`):

```
04:05:16Z  GET  200  /auth/v1/user                       Deno/SupabaseEdgeRuntime  ← getUser del caller
04:05:17Z  GET  200  /rest/v1/usuarios?...clio+probe...  Deno/SupabaseEdgeRuntime  ← lookup destinatario
04:05:17Z  GET  200  /auth/v1/admin/users?page=1&per_page=200  Deno/…             ← findAuthUserByEmail
04:05:19Z  POST 200  /auth/v1/rest → (invite, ver 4.2)                            ← inviteUserByEmail
04:05:19Z  POST 201  /rest/v1/usuarios                   Deno/SupabaseEdgeRuntime  ← insert fila
```

La secuencia calza exactamente con el §2.4 → §2.3 del fuente: lookup destinatario
→ escaneo de Auth → `/invite` → insert. Una sola pasada, sin repeticiones.

---

## 5. Residuo — repetición del SELECT del punto 1

Misma consulta, corrida a las `04:05:5x Z` (después del cleanup):

```
[]
```

**Cero filas en `auth.users` y cero en `public.usuarios`.** Idéntico al estado
previo.

| Tabla | Antes | Después | Delta |
|---|---|---|---|
| `auth.users` (patrón probe) | 0 | 0 | 0 |
| `public.usuarios` (patrón probe) | 0 | 0 | 0 |

Cruzado contra los logs: el cleanup borró 4 filas de `usuarios` (3 fixtures + el
invitado; los `DELETE /rest/v1/usuarios` 204 están en el log de API) y 4 usuarios
de Auth (los 4 `user_deleted` del §4.2). Coincide con lo que reportó el probe
(`limpiados: 4 filas usuarios, 4 auth users`).

**El teardown limpió todo. No hay residuo. No hace falta ejecutar
`tests/teardown_probe_invite_residuo.sql`** — y no se ejecutó ningún SQL de
limpieza en esta sesión.

---

## 6. Mails enviados

**Cantidad: 1 (uno).**

Un único `POST /invite` con `action: user_invited` en toda la ventana
(04:05:19Z, destinatario `[EMAIL REDACTADO]`, status 200). El caso 7 estaba
en 0, así que no hubo reenvío. Los 3 fixtures se crean con
`admin.createUser()`, que **no dispara mail**.

Consumo de cuota horaria: **1 de 30** (default de GoTrue con SMTP custom).

### Remitente

**No es observable desde los logs accesibles por MCP.** Ni `get_logs('auth')` ni
`get_logs('api')` exponen el header `From` ni el nombre del proveedor SMTP — sólo
registran que GoTrue completó el `POST /invite` con 200 y cuánto tardó (1.78 s,
consistente con una entrega SMTP real y no con un descarte inmediato).

Lo que sí está establecido por configuración (etapa 0 del plan, 24/07/2026): el
proyecto usa **SMTP propio vía Resend**, con dominio verificado, no el mailer
built-in de Supabase. El `redirectTo` del mail apunta a
`https://mdqclio.github.io/SGH/reset-password.html` (visible como `referer` en la
línea del `/invite`).

**Que el mail haya llegado, y desde qué dirección, lo confirma Leo abriendo la
casilla.** El API devuelve 200 aunque la entrega falle (§3.2 del plan) — este
reporte no puede afirmar entrega.

⚠️ Ojo: el invitado `[EMAIL REDACTADO]` **fue borrado por el cleanup** a las
04:05:28Z, ~9 s después del envío. El mail existe en la casilla, pero **el link
de invitación ya está muerto** (no hay usuario de Auth detrás). Para probar el
flujo completo por `reset-password.html` hay que correr con
`INVITE_KEEP_TEST_USER=1`, lo cual requiere OK aparte.

---

## 7. Conclusiones

1. ✅ **Guards**: todos pasados. `spcs = 144`, project ref correcto, función v2
   viva con `esKidNilAdminApi` y `esTransitorioPreMail` intactos.
2. ✅ **Corrida**: una sola, 36 OK / 0 FAIL, 26 segundos.
3. ⛔ **`error_transitorio = 0`. La rama de retry NO se ejercitó.** La corrida no
   prueba nada sobre ella. Es el hallazgo principal.
4. ℹ️ **El bug `kid <nil>` puede estar apagado**: 15+ llamadas admin, todas 200
   (p ≈ 0,2 % si el bug siguiera a la tasa medida). Hipótesis, no conclusión.
5. ✅ **Residuo: cero.** Teardown completo, verificado contra el SELECT previo y
   contra los logs. No se ejecutó SQL de limpieza.
6. ✅ **1 mail enviado**, a `[EMAIL REDACTADO]`, `/invite` 200. Remitente no
   visible en logs; por configuración es Resend. Entrega la confirma Leo.
7. ⏭️ **§2.4 (reinvitación) sigue sin verificar** — caso 7 salteado a propósito.

### Pendientes que deja esta corrida

- **Verificar la rama de retry con error inyectado** (stub del cliente admin en
  un test unitario), ya que prod no la dispara sola.
- **Confirmar si el bug de plataforma sigue vivo** antes de asumir que la rama es
  código muerto.
- **§2.4 reinvitación**: requiere una corrida con `INVITE_REINVITACIONES=1`
  (cuesta 1 mail más) — pendiente de OK.
- **Flujo end-to-end por `reset-password.html`**: requiere
  `INVITE_KEEP_TEST_USER=1` — pendiente de OK.

**No se volvió a correr el probe. No se ejecutó ningún teardown SQL. Nada se
mergeó a `main`.**
