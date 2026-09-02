# Diagnóstico — "Fede se registró en solicitar-acceso.html y no le llegó el mail de verificación"

**Fecha**: 2026-09-02 · **Branch**: `reports` · **SHA base**: `f948a0b`
**Alcance**: SOLO LECTURA. Ninguna escritura sobre producción (sólo `SELECT` + `get_logs`).

**Guards verificados**

| Guard | Esperado | Obtenido |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | `/home/clio/dev/SGH` ✅ |
| `SELECT count(*) FROM spcs` | 181 | **181** ✅ |
| ref del proyecto | `unlhcuanfrtpatoipwve` | `unlhcuanfrtpatoipwve` ✅ |

---

## Veredicto (una línea)

**Nunca se generó.** El signup del 02/09 19:18:48 UTC fue un `user_repeated_signup` sobre una cuenta
que ya existe y ya está confirmada (`fedeiguacel@gmail.com`, alta 07/08, confirmada 23/08): GoTrue
respondió 200 sin error y **sin emitir mail de confirmación** — es el comportamiento anti-enumeración
—, y `solicitar-acceso.html` igual mostró la pantalla "revisá tu correo".

---

## 1 · La solicitud en `solicitudes_acceso`

**No existe.** La tabla tiene 2 filas en total y ninguna es de Fede.

```sql
SELECT id, auth_user_id, email, nombre, apellido, rol_pedido, club_id,
       estado, created_at, resuelta_at, motivo_rechazo, origen_hipodromo
FROM solicitudes_acceso ORDER BY created_at DESC LIMIT 20;
```

```json
[{"id":"790f5be6-1cf4-4e22-ad98-c986eb4151f2","auth_user_id":"194f7e35-1647-4997-a7ad-c4b000068672","email":"hipodromodolores@gmail.com","nombre":"FABIO JOSE","apellido":"CASTRO","rol_pedido":"profesional","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"aprobada","created_at":"2026-08-19 16:15:28.085357+00","resuelta_at":"2026-08-19 16:20:49.852203+00","motivo_rechazo":null,"origen_hipodromo":null},
 {"id":"4572eccc-8821-494e-8709-8d3ccf0b67d6","auth_user_id":"2b526e1f-6785-445d-bbe9-02a2126ad646","email":"mdqclio@hotmail.com","nombre":"Leonardo","apellido":"Fernandez","rol_pedido":"propietario","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"descartada","created_at":"2026-08-04 04:28:40.590592+00","resuelta_at":"2026-08-04 04:34:08.517253+00","motivo_rechazo":null,"origen_hipodromo":null}]
```

**Cuándo**: nunca. **Con qué mail**: ninguno registrado. **Estado**: la fila no llegó a crearse.

El motivo es de diseño, no un fallo: la RPC `rpc_solicitar_acceso` (SECURITY DEFINER, única vía de
INSERT — `solicitudes_acceso` tiene RLS ON y **sólo** una policy de SELECT) exige `auth.uid()` no
nulo. Con *Confirm email* activo, `signUp` no devuelve sesión, así que la RPC recién puede correr
cuando la persona vuelve desde el mail. Sin mail → sin sesión → sin fila.

---

## 2 · Auth: qué se creó para ese mail

La cuenta **ya existía desde el 07/08/2026** — no se creó nada nuevo el 02/09.

```sql
SELECT id, email, created_at, confirmation_sent_at, confirmed_at, email_confirmed_at,
       last_sign_in_at, recovery_sent_at, invited_at, banned_until, deleted_at
FROM auth.users ORDER BY created_at DESC LIMIT 15;
```

Fila de Fede (recortada):

```json
{"id":"8b2f4c83-04a7-4bb0-a23a-6ae4201f3870",
 "email":"fedeiguacel@gmail.com",
 "created_at":"2026-08-07 04:50:23.223386+00",
 "confirmation_sent_at":null,
 "confirmed_at":"2026-08-23 21:50:48.621623+00",
 "email_confirmed_at":"2026-08-23 21:50:48.621623+00",
 "last_sign_in_at":"2026-09-02 20:47:27.794752+00",
 "recovery_sent_at":"2026-09-02 20:46:52.021586+00",
 "invited_at":"2026-08-07 04:50:23.239951+00",
 "banned_until":null,"deleted_at":null,
 "raw_user_meta_data":"{\"email_verified\": true, \"nombre_completo\": \"Federico Iguacel\"}"}
```

- **`confirmation_sent_at` = NULL**, y siempre lo fue: a esa cuenta **nunca** se le emitió un mail de
  tipo *confirm signup*. Entró por **invitación** (`invited_at` 07/08), no por auto-registro.
- `email_confirmed_at` 23/08 → el mail ya estaba verificado 10 días antes del intento del 02/09.
- Ninguna fila de `auth.users` fue creada el 02/09 (la más nueva es del 19/08).
- `auth.audit_log_entries` está **vacía** (`count=0`, `min/max` NULL) — retención en 0 en este
  proyecto; toda la evidencia temporal sale de `get_logs(auth)`, no de esa tabla.

**Dato que cambia el cuadro**: Fede ya tiene cuenta de sistema, y no de propietario.

```sql
SELECT id, auth_user_id, email, nombre_completo, rol, club_id, activo, created_at
FROM usuarios WHERE auth_user_id='8b2f4c83-04a7-4bb0-a23a-6ae4201f3870';
```

```json
[{"id":"ae243acf-1295-4e2e-a08a-7d48c142550e","auth_user_id":"8b2f4c83-04a7-4bb0-a23a-6ae4201f3870","email":"fedeiguacel@gmail.com","nombre_completo":"Federico Iguacel","rol":"secretario_carreras","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true,"created_at":"2026-08-07 04:50:25.256848+00"}]
```

Es decir: aunque el mail hubiera llegado y él hubiera confirmado, la RPC lo habría rechazado igual con
`La cuenta ya tiene acceso al sistema` (ERRCODE 23505):

```sql
IF EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = v_uid) THEN
  RAISE EXCEPTION 'La cuenta ya tiene acceso al sistema' USING ERRCODE='23505'; END IF;
```

---

## 3 · Logs de auth de las últimas horas

`get_logs(service='auth')` — ventana de 24 h. Eventos de `fedeiguacel@gmail.com` del 02/09, en orden
cronológico (UTC; ART = UTC−3):

| Hora UTC | Path | Resultado | Evento |
|---|---|---|---|
| 02:34:59 | `/recover` | 200 | `user_recovery_requested` |
| 16:34:01 | `/verify` | 303 | `email link has expired` |
| 16:34:20 | `/verify` | 303 | `email link has expired` |
| 16:35:05 | `/token` | **400** | `invalid_credentials` |
| 16:35:08 | `/token` | **400** | `invalid_credentials` |
| 16:35:26 | `/recover` (ref. `reset-password.html`) | 200 | — |
| **19:18:48** | **`/signup`** (ref. **`solicitar-acceso.html`**) | **200** | **`user_repeated_signup`** |
| 19:19:22 | `/verify` | 303 | `email link has expired` |
| 19:19:49 | `/token` | **400** | `invalid_credentials` |
| 19:20:06 | `/recover` (ref. `reset-password.html`) | 200 | — |
| 19:23:13 | `/verify` | 303 | `email link has expired` |
| 19:24:10 | `/token` | **400** | `invalid_credentials` |
| 19:24:33 | `/recover` (ref. `reset-password.html`) | 200 | — |
| 19:25:50 | `/verify` | 303 | `email link has expired` |
| 19:26:10 | `/token` (grant `password`) | 200 | **login OK** |
| 20:46:53 | `/recover` | 200 | `user_recovery_requested` |
| 20:47:27 | `/verify` | 303 | **login OK** (`login_method: implicit`) |
| 22:28:54 | `/token` (refresh) | 200 | sesión viva |

Salida cruda del evento clave:

```json
{"auth_event":{"action":"user_repeated_signup","actor_id":"8b2f4c83-04a7-4bb0-a23a-6ae4201f3870",
 "actor_username":"fedeiguacel@gmail.com","actor_via_sso":false,"log_type":"user",
 "traits":{"provider":"email"}},"component":"api","duration":677679924,"level":"info",
 "method":"POST","msg":"request completed","path":"/signup",
 "referer":"https://sigh.com.ar/solicitar-acceso.html","remote_addr":"181.21.216.26",
 "request_id":"01a0638f-40df-70f1-8773-895dd5be8422","status":200,"time":"2026-09-02T19:18:48Z"}
```

Lectura:

- **Envíos**: hay 4 `/recover` con 200 (02:34, 16:35, 19:20, 19:24, 20:46 → cinco en total). El del
  20:46:53 fue seguido a los **34 segundos** por un `/verify` 303 con login exitoso: **el mail de
  recuperación llegó y el link se abrió**. El transporte de mail funciona hoy.
- **Errores**: ninguno de envío. Los `400 invalid_credentials` son intentos de login con contraseña
  equivocada; los `email link has expired` son clicks sobre links de recuperación viejos (ya usados o
  vencidos), no fallas de entrega.
- **Rate limit**: **cero** eventos `over_email_send_rate_limit` / 429 en la ventana. No hubo throttle.
- **Del `/signup` de las 19:18:48 no sale ningún mail**: status 200, `action: user_repeated_signup`,
  sin error asociado y sin `confirmation_sent_at` en la fila del usuario. GoTrue, ante un signup
  repetido sobre cuenta ya confirmada, devuelve una respuesta indistinguible de un alta nueva (para no
  filtrar qué emails existen) y **no emite nada**.

---

## 4 · SMTP: default de Supabase o propio

**Propio: Resend**, activo desde el **24/07/2026**, sender provisorio `sistema@hipodromodolores.com`,
con SPF/DKIM/DMARC verificados. Es configuración de Dashboard (Auth → SMTP Settings), no código: el
repo no tiene ninguna dependencia ni referencia a un SDK de mail.

Fuente: `docs/RELEVAMIENTO_EMAIL_2026-08-19.md` §"Resumen ejecutivo" y §2.1.

> | ¿Con qué mecanismo? | **SMTP propio: Resend**, activo desde el 24/07/2026. Reemplaza al mailer built-in de Supabase. Sender provisorio `sistema@hipodromodolores.com`. |

**Límite de esta verificación**: el MCP de Supabase no expone la config de Auth (no hay tool de
`get_auth_config`), así que el dato de SMTP viene del relevamiento del 19/08, no de una consulta de
hoy. Lo que sí se verificó hoy contra prod es la **entrega efectiva**: recovery a las 20:46:53 → link
abierto a las 20:47:27. Confirmar el proveedor vivo requiere entrar al Dashboard.

---

## 5 · Números de resumen

| Métrica | Valor |
|---|---|
| Solicitudes de Fede en `solicitudes_acceso` | **0** |
| Filas totales en `solicitudes_acceso` | 2 (ambas de agosto, ninguna de Fede) |
| `auth.users` creados el 02/09 | **0** |
| `confirmation_sent_at` de `fedeiguacel@gmail.com` | **NULL** (histórico, nunca tuvo valor) |
| Mails de confirmación generados por el signup de las 19:18 | **0** |
| `/recover` con 200 el 02/09 | 5 |
| Eventos de rate limit / 429 en la ventana de 24 h | **0** |
| Logins exitosos de Fede el 02/09 | 3 (19:26 password, 20:47 magic link, 22:28 refresh) |
| Rol real de Fede en `usuarios` | `secretario_carreras`, `activo=true`, club Dolores, desde 07/08 |

---

## 6 · Cadena causal

1. Fede abre `solicitar-acceso.html` **deslogueado** (si tuviera sesión, el "camino 2" de la página lo
   habría mandado a `portal.html` por tener fila en `usuarios` — `solicitar-acceso.html:521-524`).
2. Completa el form como propietario con `fedeiguacel@gmail.com` — el mismo mail de su cuenta de
   secretario.
3. `sb.auth.signUp(...)` (`solicitar-acceso.html:462`) → GoTrue detecta cuenta existente y confirmada
   → `user_repeated_signup`, 200, **sin mail y sin sesión**.
4. La página evalúa `if (authErr)`: **no hay error**. Evalúa `if (!authData.session)`: no hay sesión →
   muestra `sec-confirmar`, "revisá tu correo" (`solicitar-acceso.html:483-486`).
5. Fede espera un mail que nunca se emitió.

El bug de UX está en el paso 4: la rama de "cuenta ya existente" (`already registered`) sólo se activa
si GoTrue devuelve **error**, y en signup repetido con confirmación activa GoTrue **no devuelve
error** — devuelve un `user` obfuscado. La rama muerta es la de `solicitar-acceso.html:471`.

Señal disponible para distinguirlo, sin romper la protección anti-enumeración: en la respuesta
obfuscada de GoTrue el objeto `user` viene con `identities: []` (array vacío) y con `id` no persistido.
Un `authData.user?.identities?.length === 0` diferencia "cuenta nueva, revisá el mail" de "esa cuenta
ya existe". **No implementado — esta sesión es solo lectura.**

---

## 7 · Preguntas abiertas

1. **¿Fede quería una cuenta de propietario separada, o entró a `solicitar-acceso.html` por
   confusión?** Su cuenta actual es `secretario_carreras`. Si quiere además el rol de propietario, con
   ese mismo mail **no hay camino**: la RPC corta con "La cuenta ya tiene acceso al sistema". Necesita
   otro email, o que el rol se resuelva por dentro (¿un `usuarios.rol` mixto? ¿una entidad
   `propietarios` vinculada a su `auth_user_id`?). Decisión de producto — para Fede/Yesi.
2. **¿Se corrige el falso "revisá tu correo"?** El fix (`identities.length === 0` → mostrar "ya hay una
   cuenta con ese correo, iniciá sesión") es de una rama y cierra el agujero de UX para cualquiera que
   repita un alta. Requiere issue + probe.
3. **¿Por qué tantos `invalid_credentials` y links vencidos entre las 16:34 y las 19:26?** Fede pasó
   ~3 h peleando con el login antes de terminar en `solicitar-acceso.html`. Sugiere que el problema
   original era "no me acuerdo la contraseña", no "quiero registrarme". Vale confirmarlo con él.
4. **`auth.audit_log_entries` vacía** (retención 0): la única traza de auth es `get_logs`, con ventana
   de 24 h. Si se quiere poder diagnosticar esto a 3 días vista, hay que decidir si se persiste algo.
5. **SMTP**: confirmar en el Dashboard que Resend sigue siendo el transporte activo (no verificable
   por MCP).

---

## 8 · Qué NO se hizo

Sesión de solo lectura: no se creó ni modificó ninguna fila, no se reenvió ningún mail, no se tocó
`auth.users`, `usuarios` ni `solicitudes_acceso`, y no se cambió código de `solicitar-acceso.html`.
