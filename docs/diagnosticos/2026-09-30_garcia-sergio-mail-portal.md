# GARCIA SERGIO — "no me llega el mail para crear el usuario del portal" (SÓLO LECTURA)

- Fecha: 2026-09-30 (~21:30 UTC)
- SHA de `main` leído: `cf99bf45abdb990cda55d8f66314081ceb3f85b0`
- Guards: `pwd` = `/home/clio/dev/SGH` ✅ · ref `unlhcuanfrtpatoipwve` ✅ · `count(spcs)` = **220** (CLAUDE.md dice 210 → hubo altas desde el 14/09; no se escribió nada en la base, así que no bloquea — actualizar el baseline).
- Nada corregido. Sólo `SELECT`s. Emails de terceros y DNI **redactados** (el repo es público); el de Garcia se deja parcial para que se lo pueda identificar.

---

## Respuesta corta

1. **No existe como profesional ni como usuario.** En `profesionales` no hay ningún "SERGIO GARCIA" (el único GARCIA es MARCELO ANTONIO, entrenador, DNI terminado en 317, sin email, alta 11/05). En `usuarios` no hay nada. **Sí existe en `auth.users`**: `sergioandres…54@gmail.com`, creado **hoy 30/09 18:55:39 UTC (15:55 AR)**, `confirmation_sent_at` 80 ms después, **`email_confirmed_at` NULL**, nunca inició sesión.
2. **No hay solicitud de acceso.** Es lo esperado: la solicitud se crea recién *después* de confirmar el mail. Está trabado en el paso 1 (confirmar el correo).
3. **Circuito**: se registra solo. `login.html` → "Solicitar acceso" → `solicitar-acceso.html` → `sb.auth.signUp()` (con captcha Turnstile) → **Supabase Auth (GoTrue) manda el mail de confirmación por SMTP propio de Resend** (dominio `hipodromodolores.com`, remitente `sistema@`, según docs del 24/07) → hace clic → vuelve a la página y envía la solicitud → el staff la aprueba en `solicitudes.html` → recién ahí nace la fila en `usuarios`. La otra vía (Edge Function `invite-user` → `inviteUserByEmail`, disparada por el staff desde `usuarios.html`) **no se usó con nadie** en los últimos 21 días (`invited_at` NULL en todos).
4. **No está roto para todos.** En 21 días hubo 21 altas en Auth; **17 confirmaron**, en general entre 20 s y 3 min después del envío. La última que funcionó fue **ayer 29/09 18:29 UTC** (confirmó en 21 s). Las 4 sin confirmar: 2 con el dominio mal tipeado (`@gmail.con`), una del 27/09 (`maximinoherroz@…`, sin confirmar desde entonces — posible mismo síntoma) y **la de Garcia**. Hoy no hubo ningún otro signup, así que **no se puede probar que el envío de hoy funcione**, pero el de ayer sí.
   Último usuario de portal creado: rol `profesional`, **28/09 16:27 UTC**, por aprobación de solicitud (autoregistro).
5. **Registro de mails**: desde esta sesión, **ninguno legible**.
   - `auth.audit_log_entries`: vacío para él (y para toda la ventana de hoy) — la auditoría de Auth no se guarda en esa tabla.
   - Logs de Auth: `get_logs` → endpoint removido; `query_logs` → `You do not have permission to perform this action`.
   - **Donde sí está**: el **dashboard de Resend** (Emails → buscar la dirección: entregado / rebotado / en spam) y Supabase Dashboard → Logs → Auth. Hace falta acceso humano.

**Lo más probable, en orden**: (a) el mail está en Spam/Promociones de Gmail; (b) tipeó mal la dirección (verificar con él que sea exactamente `sergioandres…54@gmail.com`); (c) Resend lo rebotó/retuvo — se ve en el dashboard de Resend. Si pide "reenviar", volver a registrarse con el mismo mail **sí reenvía** (cuenta sin confirmar → `identities.length === 1`, comentario en `solicitar-acceso.html:599`), sujeto al rate limit de mails del proyecto.

Preguntas abiertas: ¿qué dice Resend para esa dirección hoy 18:55 UTC? ¿`maximinoherroz@…` (27/09) reclamó lo mismo?

---

## Query 1 — guard + profesionales + usuarios + auth.users + tablas candidatas

```sql
select 'guard' k, (select count(*) from spcs)::text v
union all select 'prof', json_agg(p)::text from (select * from profesionales where nombre ilike '%garcia%' or apellido ilike '%garcia%' ) p
union all select 'usr', json_agg(u)::text from (select id, email, nombre_completo, rol, estado, club_id, created_at from usuarios where nombre_completo ilike '%garc%' or email ilike '%garc%') u
union all select 'auth', json_agg(a)::text from (select id, email, created_at, confirmation_sent_at, email_confirmed_at, invited_at, last_sign_in_at, recovery_sent_at, raw_user_meta_data from auth.users where email ilike '%garc%' or raw_user_meta_data::text ilike '%garc%') a
union all select 'tables', string_agg(table_name, ',') from information_schema.tables where table_schema='public' and (table_name ilike '%solic%' or table_name ilike '%mail%' or table_name ilike '%invit%' or table_name ilike '%registro%')
```

Salida (DNI y email redactados):

```
guard  | 220
prof   | [{"id":"28150560-a5f8-49fc-9d96-6a90a1e1c0a9","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","tipo":"entrenador","nombre":"MARCELO ANTONIO","apellido":"GARCIA","documento_tipo":"DNI","documento_nro":"[REDACTADO …317]","fecha_nacimiento":"[REDACTADO]","matricula_nro":null,"categoria_jockey":null,"peso_minimo":null,"peso_maximo":null,"caballeriza_id":null,"telefono":null,"email":null,"foto_url":null,"activo":true,"notas":null,"created_at":"2026-05-11T01:29:31.349892+00:00","updated_at":"2026-05-11T04:27:54.072779+00:00","patente":null,"hipodromo_patente":"DOL","localidad":"XX","estado":"activo"}]
usr    | null
auth   | [{"id":"57aa09a8-67a4-455e-b473-d2a409fbfe68","email":"sergioandres…54@gmail.com","created_at":"2026-09-30T18:55:39.565981+00:00","confirmation_sent_at":"2026-09-30T18:55:39.645325+00:00","email_confirmed_at":null,"invited_at":null,"last_sign_in_at":null,"recovery_sent_at":null,"raw_user_meta_data":{"sub":"57aa09a8-67a4-455e-b473-d2a409fbfe68","email":"[= email]","email_verified":false,"phone_verified":false}}]
tables | solicitudes_acceso
```

## Query 2 — solicitudes_acceso + profesionales "Sergio" + usuarios por rol

```sql
select 'cols' k, string_agg(column_name||':'||data_type, ', ' order by ordinal_position) v from information_schema.columns where table_schema='public' and table_name='solicitudes_acceso'
union all select 'sol_garcia', json_agg(s)::text from (select * from solicitudes_acceso s where s::text ilike '%garc%' or s::text ilike '%sergio%') s
union all select 'sol_ultimas', json_agg(s)::text from (select * from solicitudes_acceso order by created_at desc limit 8) s
union all select 'sol_estados', json_agg(x)::text from (select estado, count(*), max(created_at) from solicitudes_acceso group by estado) x
union all select 'prof_sergio', json_agg(p)::text from (select id,nombre,apellido,tipo,email,club_id,created_at from profesionales where nombre ilike '%sergio%' or email ilike '%sergio%') p
union all select 'usr_roles', json_agg(x)::text from (select rol, estado, count(*), max(created_at) ult from usuarios group by rol, estado order by rol) x
```

Salida (sólo columnas no personales de `sol_ultimas`; email/DNI/teléfono redactados):

```
cols        | id, auth_user_id, email, nombre, apellido, documento_tipo, documento_nro, telefono, rol_pedido, club_id, estado, motivo_rechazo, resuelta_por, resuelta_at, created_at, origen_hipodromo, origen_patente_nro, origen_caballeriza
sol_garcia  | 1 fila, NO es él: "Sergio sebastian" "San martin", profesional, aprobada 2026-09-25 22:29 (creada 21:35)
sol_ultimas | created_at                  | rol_pedido  | estado    | resuelta_at
            | 2026-09-29 18:29:55 (Tedeschi)| propietario | pendiente | —
            | 2026-09-28 15:57:06 (Moraga)  | profesional | aprobada  | 2026-09-28 16:27:54
            | 2026-09-28 11:23:05 (Muñiz)   | profesional | pendiente | —
            | 2026-09-27 02:26:24 (Burgos)  | profesional | aprobada  | 2026-09-27 19:20:00
            | 2026-09-25 21:35:27 (San Martin)| profesional | aprobada | 2026-09-25 22:29:36
            | 2026-09-25 21:22:42 (Correa)  | propietario | rechazada | 2026-09-29 18:40:51
            | 2026-09-25 18:36:52 (Gimenez) | profesional | aprobada  | 2026-09-25 20:23:13
            | 2026-09-23 18:13:14 (Martín)  | profesional | aprobada  | 2026-09-24 02:25:44
sol_estados | pendiente 2 (max 2026-09-29 18:29:55) · rechazada 2 (max 2026-09-25 21:22:42) · aprobada 19 (max 2026-09-28 15:57:06) · descartada 1 (max 2026-08-04 04:28:40)
prof_sergio | SERGIO ESTEBAN ALDAY (entrenador, 2026-06-15) · SERGIO SEBASTIAN SAN MARTIN (entrenador, 2026-05-11) — ninguno GARCIA; ambos email null
usr_roles   | super_admin activo 1 (2026-04-22) · secretario_carreras activo 2 (2026-08-07) · operador activo 3 (2026-08-16) · profesional activo 15 (2026-09-28 16:27:54) · propietario activo 4 (2026-09-22 00:54:47)
```

## Query 3 — altas en Auth de los últimos 21 días

```sql
select a.email, a.created_at, a.confirmation_sent_at, a.email_confirmed_at, a.invited_at, a.last_sign_in_at, (s.id is not null) tiene_solicitud, (u.id is not null) tiene_usuario
from auth.users a left join solicitudes_acceso s on s.auth_user_id=a.id left join usuarios u on u.id=a.id
where a.created_at > now() - interval '21 days' order by a.created_at desc
```

Salida completa, 21 filas (email redactado a iniciales; `invited_at` NULL en las 21). `tiene_usuario` da false en todas porque `usuarios.id` no es el id de Auth — el join no sirve para esa columna, ignorarla:

```
email                 | created_at (UTC)     | confirmation_sent_at | email_confirmed_at   | last_sign_in_at      | solicitud
sergioandres…@gmail.com | 2026-09-30 18:55:39 | 2026-09-30 18:55:39 | NULL                 | NULL                 | no   ← GARCIA
negrot…@gmail.com     | 2026-09-29 18:29:14 | 2026-09-29 18:29:14 | 2026-09-29 18:29:35 | 2026-09-29 18:29:35 | sí
adrianm…@gmail.com    | 2026-09-28 15:56:32 | 2026-09-28 15:56:33 | 2026-09-28 15:56:52 | 2026-09-28 15:56:52 | sí
mjmw…@gmail.com       | 2026-09-28 11:21:50 | 2026-09-28 11:21:50 | 2026-09-28 11:22:07 | 2026-09-28 11:22:07 | sí
maximinoh…@gmail.com  | 2026-09-27 17:44:35 | 2026-09-27 17:44:35 | NULL                 | NULL                 | no
facundob…@gmail.com   | 2026-09-27 02:22:25 | 2026-09-27 02:22:25 | 2026-09-27 02:26:02 | 2026-09-27 02:26:02 | sí
sergioseb…@gmail.com  | 2026-09-25 21:34:27 | 2026-09-25 21:34:27 | 2026-09-25 21:35:05 | 2026-09-25 21:35:05 | sí
pradoj…@gmail.com     | 2026-09-25 21:19:40 | 2026-09-25 21:19:40 | 2026-09-25 21:22:29 | 2026-09-25 21:22:29 | sí
loscat…@gmail.com     | 2026-09-25 18:35:17 | 2026-09-25 18:35:17 | 2026-09-25 18:35:53 | 2026-09-25 18:35:53 | sí
joaquinh…@gmail.con   | 2026-09-25 18:13:55 | 2026-09-25 18:13:55 | NULL                 | NULL                 | no   (dominio mal tipeado)
dm73…@gmail.com       | 2026-09-23 18:11:34 | 2026-09-23 18:11:34 | 2026-09-23 18:12:11 | 2026-09-23 18:12:11 | sí
pablod…@gmail.com     | 2026-09-12 16:17:37 | 2026-09-12 16:17:37 | 2026-09-12 16:19:03 | 2026-09-12 16:19:03 | sí
cantot…@gmail.con     | 2026-09-11 13:33:48 | 2026-09-11 13:33:48 | NULL                 | NULL                 | no   (dominio mal tipeado)
cantot…@gmail.com     | 2026-09-11 13:30:08 | 2026-09-11 13:30:08 | 2026-09-11 13:31:55 | 2026-09-11 13:42:50 | no
rubenf…@hotmail.com   | 2026-09-11 12:15:16 | 2026-09-11 12:15:16 | 2026-09-11 12:15:55 | 2026-09-11 12:15:55 | sí
marcel…@gmail.com     | 2026-09-11 11:36:03 | 2026-09-11 11:36:03 | 2026-09-11 11:36:50 | 2026-09-11 11:36:50 | no
litoov…@gmail.com     | 2026-09-11 02:37:31 | 2026-09-11 02:37:32 | 2026-09-11 02:37:58 | 2026-09-11 02:37:58 | sí
ronaq…@hotmail.com    | 2026-09-10 22:18:11 | 2026-09-10 22:18:11 | 2026-09-10 22:19:53 | 2026-09-11 02:50:57 | sí
chelit…@gmail.com     | 2026-09-10 20:15:11 | 2026-09-10 20:15:11 | 2026-09-10 20:15:50 | 2026-09-10 20:15:50 | sí
maximon…@gmail.com    | 2026-09-10 13:48:46 | 2026-09-10 13:48:46 | 2026-09-10 13:49:44 | 2026-09-10 13:49:44 | sí
oscarz…@gmail.com     | 2026-09-10 13:04:58 | 2026-09-10 13:04:58 | 2026-09-10 13:07:31 | 2026-09-10 13:07:31 | sí
```

Resumen: 21 altas · 17 confirmadas · 4 sin confirmar (2 `.con`, maximinoh… 27/09, Garcia hoy) · 0 invitaciones.

## Query 4 — auditoría de Auth

```sql
select created_at, payload->>'action' action, payload->>'actor_username' actor, payload->'traits' traits, ip_address from auth.audit_log_entries where payload::text ilike '%sergioandresgarcia%' or created_at > '2026-09-30 18:50' order by created_at limit 40
```

```
[]
```

## Logs de Auth

- `mcp__supabase__get_logs(service='auth')` → `The logs.all endpoint has been removed. Use GET /v1/projects/{ref}/analytics/endpoints/logs instead.`
- `mcp__claude_ai_Supabase__query_logs` (source auth, 18:40–21:30 UTC) → `MCP error -32600: You do not have permission to perform this action`

## Código (main `cf99bf4`)

```
solicitar-acceso.html:575  const { data: authData, error: authErr } = await sb.auth.signUp({
solicitar-acceso.html:577    options: { captchaToken, emailRedirectTo: window.location.href.split('?')[0] },
solicitar-acceso.html:599  //   repetida, cuenta SIN confirmar → identities.length === 1  (reenvía el mail)
solicitar-acceso.html:600  //   repetida, cuenta confirmada    → identities.length === 0  (no manda nada)
solicitar-acceso.html:613  // Con "Confirm email" activo, signUp NO devuelve sesión: hay que esperar a
login.html:249             <a href="solicitar-acceso.html" …>
supabase/functions/invite-user/index.ts:493  admin.auth.admin.inviteUserByEmail(email, {
docs/ESTADO.md:29          - **SMTP Resend** activo, dominio `hipodromodolores.com` verificado. Sender `sistema@` **provisorio**
docs/DEPLOY_INVITE_USER_2026-07-28.md:151  la config de Auth (SMTP y rate limits) no es legible por MCP ni por SQL
```

## Nota lateral

La rama `reports` **local** tiene commits sin pushear que divergen de `origin/reports` (p. ej. `cf8461c`, `dd2985f`, `3562b6c`…). No la toqué: este informe se commiteó desde un worktree sobre `origin/reports`.

## Verificación de push
```
git rev-parse HEAD (commit del informe): 3e10e1559a4430c19cdee45ddee3002b01480af3
git ls-remote origin reports: 3e10e1559a4430c19cdee45ddee3002b01480af3	refs/heads/reports
```
