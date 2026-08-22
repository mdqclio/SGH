# `tests/probe_invite_user.mjs` — análisis previo a correrlo

**Fecha:** 2026-07-28
**Método:** SOLO lectura de código (`tests/probe_invite_user.mjs`, 532 líneas,
`supabase/functions/invite-user/index.ts`) + metadata de la Edge Function vía MCP.
**El probe NO se ejecutó.** Nada de lo que sigue viene de una corrida.

---

## 0. Lo que condiciona todo lo demás

**La función deployada en `unlhcuanfrtpatoipwve` es la de `7842ec6` (2026-07-23 22:22 UTC,
`version: 1`, `created_at == updated_at`), NO la de `636fbb4` (2026-07-25).**

Verificado por contenido, no sólo por fecha: el fuente deployado no contiene
`esKidNilAdminApi()`, ni `esTransitorioPreMail()`, ni el code `error_transitorio`, ni
ningún 503.

Consecuencia directa para la pregunta 3: **hoy la rama de retry no puede ejecutarse,
porque no está en prod.** Correr el probe ahora mide la función vieja. El probe
modificado aceptaría un 503 que la función deployada nunca va a emitir. Cualquier
plan de "juntar evidencia del retry" empieza por deployar.

---

## 1. Las cuatro preguntas

### 1.1 ¿Escribe?

**Sí. Escribe en prod, y bastante.** El encabezado del propio probe lo dice
(`⚠️ ESCRIBE EN PROD`, líneas 64-72). No hay modo lectura.

### 1.2 ¿Crea filas en `auth.users` y/o `usuarios`?

**En las dos tablas.** Por corrida:

| Qué | `auth.users` | `public.usuarios` | Quién lo crea | ¿Manda mail? |
|---|---|---|---|---|
| 3 fixtures de caller (`super_admin`, `operador`, `secretario_carreras`) | ✅ 3 | ✅ 3 | el probe, con `createUser({email_confirm: true})` | ❌ no |
| 1 invitado real (caso 1) | ✅ 1 | ✅ 1 | la Edge Function, con `inviteUserByEmail` | ✅ **sí** |
| **Total** | **4** | **4** | | **2 mails** |

Los fixtures usan dominio `.invalid` (RFC 2606) con prefijo `probe-invite-` y un sufijo
aleatorio por corrida (`RUN`, línea 143): formato válido, jamás entregable. Por eso no
consumen cuota de mail.

Los destinatarios de los casos negativos (`probe-invite-dest-*`) **no se crean**: los
casos 3, 4, 4b y 6 son rechazos, y el probe verifica explícitamente que no quedó ni fila
ni cuenta (`check(await filaUsuario(...) === null, ...)`). Ese es justamente el test de
escalada de privilegios del caso 4.

También hace un `SELECT` sobre `clubs` y **requiere ≥2 clubs** para poder probar el caso
"club ajeno" (línea 308). No los crea.

### 1.3 ¿Manda mail, y a qué dirección?

**Sí, 2 mails con los defaults, ambos a `INVITE_TEST_EMAIL`:**

1. **Caso 1** (invitación feliz) — 1 mail. Inevitable: es el caso.
2. **Caso 7** (reinvitación) — `INVITE_REINVITACIONES` mails, **default 1**.

La dirección es 100 % parametrizable: `INVITE_TEST_EMAIL` es env requerida, sin default.
El encabezado pide que sea **externa a la organización de Supabase** (§3.2 del plan): si
el mailer sólo entrega a miembros de la org, el fallo es silencioso y el probe igual
reporta 200.

Cuota: el mailer built-in de Supabase da **2 mails/hora en total**. Con los defaults la
corrida gasta exactamente esos 2. Subir `INVITE_REINVITACIONES` a 2 hace que la última
pegue contra el rate limit y vuelva 429 — resultado válido, pero deja de medir lo que el
caso 7 quiere medir (comentario del propio probe, líneas 50-57).

**El probe no puede verificar la recepción.** Lo dice él mismo en la salida
(`ℹ️ verificar A MANO que llegó el mail`): la API responde 200 aunque la entrega falle.

### 1.4 ¿Teardown propio o residuo manual?

**Teardown propio**, en un bloque `finally` (línea 527), así que corre también si el
probe explota a mitad de camino. Borra **sólo lo que creó esta corrida**: itera
`creados.usuarios` / `creados.auth`, que se pueblan a medida que se crea cada cosa.
Nunca toca datos ajenos.

**Tres formas en que igual queda residuo:**

1. **`INVITE_KEEP_TEST_USER=1` — a propósito.** Conserva la fila y la cuenta de Auth de
   `INVITE_TEST_EMAIL` para poder abrir el mail y completar el flujo por
   `reset-password.html` a mano (si el probe lo borra, el link muere). El probe avisa
   (`⏸️ CONSERVADO a propósito … Teardown pendiente`), pero **el teardown queda a cargo
   del operador**. Los fixtures `.invalid` se limpian igual.
2. **Fallo de borrado en Auth.** `deleteUser` va envuelto en `reintentar()` (12 intentos
   contra el `kid <nil>`), pero si se agotan, el error se **loguea y se sigue**
   (`.catch((e) => console.error(...))`, línea 286). Quedan cuentas colgadas en
   `auth.users`. El probe no falla por eso.
3. **Fallo de borrado en `usuarios`.** Igual: `console.error` y sigue (línea 277).

O sea: el teardown es de mejor esfuerzo, no garantizado. Después de una corrida con
errores conviene chequear a mano:

```sql
SELECT email FROM usuarios WHERE email LIKE 'probe-invite-%@sgh-probe.invalid';
-- y el equivalente en auth.users
```

### 1.5 ¿Contra qué proyecto apunta?

**No lo puedo confirmar desde el código: no hay ninguna ref hardcodeada.** Es
deliberado — el repo es público y el encabezado lo dice (`TODO se lee de env vars`).

El destino sale enteramente de las env:

| Env | Requerida | Qué determina |
|---|---|---|
| `INVITE_FN_URL` | sí | a qué función se le pega |
| `SUPABASE_URL` | sí | contra qué proyecto se autentica y se verifica |
| `SUPABASE_PUBLISHABLE_KEY` | sí | `signInWithPassword` de los fixtures |
| `SUPABASE_SECRET_KEY` | sí | **bypassa RLS** — crea fixtures, verifica y limpia |
| `INVITE_TEST_EMAIL` | sí | casilla que recibe la invitación |

`requireEnv()` corta con `exit(2)` si falta alguna: no hay fallback silencioso a prod.

**Pero en la práctica apunta a `unlhcuanfrtpatoipwve`**, porque es el único proyecto que
existe en este setup — es el que documenta `CLAUDE.md` como prod y el único con la
función `invite-user` deployada. No hay staging. Así que la confirmación no la da el
código: **la da quien setea las env al invocarlo**, y hay que mirarlas antes de apretar
enter.

`SUPABASE_SECRET_KEY` es la key `sb_secret_...`, que no está en el repo y no debe estar.

---

## 2. ¿Dry-run o casilla descartable?

### Dry-run: NO existe

No hay flag de simulación. No hay forma de ejercitar el caso 1 sin que salga un mail
real: la función llama a `inviteUserByEmail` de verdad.

### Casilla descartable: SÍ, sin problema

`INVITE_TEST_EMAIL` es env requerida sin default. Cualquier casilla sirve mientras sea
**externa a la organización de Supabase** (§3.2). Sub-addressing (`algo+probe@…`) o un
inbox desechable van bien.

### Reducir el radio de impacto sin tocar código

| Palanca | Efecto | Costo |
|---|---|---|
| `INVITE_REINVITACIONES=0` | saltea las reinvitaciones del caso 7 | **1 mail en vez de 2** |
| `INVITE_KEEP_TEST_USER` sin setear | borra el invitado al final | ninguno |
| `INVITE_TEST_EMAIL` = casilla desechable | el mail productivo no se toca | ninguno |

**Mínimo alcanzable sin editar el probe: 1 mail, 4 cuentas de Auth, 4 filas de
`usuarios`, todo autolimpiado.**

⚠️ **Detalle de `INVITE_REINVITACIONES=0`:** el bucle no corre, `respuestas` queda vacío,
y entonces `todasOk` (línea 514) evalúa `respuestas.length > 0 && …` → `false`, así que
imprime el mensaje de alarma **"⚠️ GoTrue NO reenvía por esta vía. §2.4 del plan necesita
revisión"** aunque no se haya probado nada. Es engañoso, no un fallo: los `check()` del
caso 7 (1 sola fila, sigue pendiente/inactivo) sí corren y son válidos, y el exit code no
se ve afectado. Conviene ignorar esa línea si se corre con 0, o arreglar la condición.

### Lo que NO se puede evitar

Los casos 2/3/4/4b/6 no mandan mail, pero **igual crean los 3 fixtures** en `auth.users`
y `usuarios` — se arman antes de todo, en las líneas 316-318. No hay forma de correr sólo
los casos negativos.

---

## 3. Evidencia de que la rama de retry se ejecutó

### 3.1 El probe NO loguea si el retry se disparó

**Sólo pass/fail.** Los dos mecanismos de reintento son silenciosos:

- `reintentar()` (línea 121, reintentos del **probe** contra `kid <nil>`): 12 intentos,
  250 ms de espera, **sin ningún log por intento**. Sólo tira excepción si se agotan.
- `invitar()` (línea 219, reintentos contra la **función**): 10 intentos, **sin log**.
  Devuelve la última respuesta y listo.

No hay contador, ni línea de log, ni nada en el resumen final (`=== N OK · M FAIL ===`)
que diga cuántos intentos hicieron falta.

**Peor todavía: el retry del probe enmascara justo lo que se quiere observar.**
`error_transitorio` está en `REINTENTABLES_PRE_MAIL` (agregado por `636fbb4`), así que
cuando la función devuelve 503 el probe **lo reintenta en silencio hasta que sale bien** y
reporta ✅. Una corrida verde no prueba que la rama nunca se ejecutó — prueba lo
contrario de nada. La única forma de que un 503 se vea en la salida es que se agoten los
10 intentos, cosa muy improbable con un fallo de ~1/3.

### 3.2 Cuántas corridas harían falta

La pregunta de fondo no es la frecuencia, es la **observabilidad** — pero va el número
igual.

Cuántas llamadas a endpoints admin de GoTrue hace la **función** por corrida (que es
donde vive la rama nueva; los `reintentar()` del probe son código del probe, no de la
función):

| Caso | ¿Llega al escaneo de Auth? | Llamadas admin |
|---|---|---|
| 2 (401) | no — corta en el token | 0 |
| 3, 4, 4b (403) | no — corta en autorización, antes del lookup del destinatario | 0 |
| 6 (422) | no — corta en validación del body | 0 |
| 1 (200) | sí | `listUsers` + `inviteUserByEmail` = **2** |
| 5 (409) | sí — corta en `ya_existe`, después del escaneo | **1** |
| 7 (reinvitación ×1) | sí | **2** |
| | | **≈5 por corrida** |

Con la tasa que midió el propio probe (20-35 %, tomo 30 %):

| Corridas | P(la rama se ejecuta ≥1 vez) |
|---|---|
| 1 | ~83 % |
| 2 | ~97 % |
| 3 | ~99,5 % |

**Con 1-2 corridas alcanza de sobra para que el evento ocurra.** El problema es que
ocurre y no se ve.

### 3.3 Qué hacer en vez de contar corridas

Tres opciones, de menor a mayor esfuerzo:

1. **Leer los logs de la Edge Function** (`mcp__supabase__get_logs` o el dashboard).
   `636fbb4` deja rastro explícito:
   - `[invite-user] inviteUserByEmail transitorio: <msg>` — la rama del `/invite`
   - `[invite-user] findAuthUserByEmail: <msg>` seguido de un 503 — la rama del escaneo

   Es evidencia directa, no requiere tocar nada. **Es la opción recomendada.**

2. **Instrumentar `invitar()`** — una línea dentro del bucle:
   ```js
   if (i > 1 || ultima.status === 503) console.log(`  ↻ intento ${i}: HTTP ${ultima.status} ${ultima.payload?.code ?? ''}`);
   ```
   Da visibilidad por intento en la salida del probe. Conviene que quede permanente: un
   reintento invisible es un problema más allá de esta verificación puntual.

3. **Forzar la rama** apuntando a un endpoint que devuelva la firma del error. Sirve para
   probar el predicado `esKidNilAdminApi()` de forma determinista, sin depender del azar,
   pero no prueba el camino real contra GoTrue.

### 3.4 Orden sugerido

1. Deployar `636fbb4` (sin esto, nada de lo anterior aplica — ver §0).
2. Correr el probe con casilla descartable y `INVITE_REINVITACIONES=0` (1 mail).
3. Mirar los logs de la función buscando `transitorio` / 503.
4. Si no aparece nada, repetir. A ~83 % por corrida, dos corridas sin rastro ya sería raro
   y valdría revisar si el bug de plataforma sigue vivo.

⚠️ Cuota: 2 mails/hora. Dos corridas seguidas con 1 mail cada una entran justo; una
tercera en la misma hora va a chocar contra el 429.

---

## Resumen

| Pregunta | Respuesta |
|---|---|
| ¿Escribe? | Sí, en prod. No hay modo lectura. |
| ¿`auth.users` / `usuarios`? | Las dos. 4 cuentas + 4 filas por corrida. |
| ¿Mail? | 2 por defecto (1 con `INVITE_REINVITACIONES=0`), a `INVITE_TEST_EMAIL`. |
| ¿Teardown? | Propio, en `finally`, sólo lo de esta corrida. Mejor esfuerzo: si el borrado falla, loguea y sigue. `INVITE_KEEP_TEST_USER=1` deja residuo a propósito. |
| ¿Qué proyecto? | Sin ref hardcodeada — sale de las env. En la práctica `unlhcuanfrtpatoipwve` porque es el único que hay, pero lo confirma quien setea las env, no el código. |
| ¿Dry-run? | No existe. |
| ¿Casilla descartable? | Sí, `INVITE_TEST_EMAIL` es requerida y sin default. |
| ¿Loguea el retry? | **No.** Sólo pass/fail. Y el retry del probe se traga el 503, así que una corrida verde no dice nada sobre la rama. |
| ¿Cuántas corridas? | 1-2 bastan para que el evento ocurra (~83 % / ~97 %), pero es invisible sin leer logs o instrumentar. |
