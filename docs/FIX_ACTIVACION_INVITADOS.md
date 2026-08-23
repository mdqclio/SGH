# Activación de invitados — diagnóstico de fondo y opciones de fix

**Fecha:** 2026-08-23 · **Modo:** read-only (solo `SELECT` + lectura de código; ninguna escritura)
**Proyecto:** `unlhcuanfrtpatoipwve` · **Guard:** `pwd=/home/clio/dev/SGH`, `spcs=181` ✅
**Continúa:** `docs/DIAGNOSTICO_CUENTAS_2026-08-23.md`

---

## Punto 1 — Activación de Fede por UI: NO ejecutada, y por qué

**No la hice.** Dos razones, la segunda es la importante:

1. No tengo la contraseña de una cuenta `super_admin`. La `usuarios_insert`/`usuarios_update`
   con privilegio pasa por `fn_is_super_admin()`, y `admin@sgh.com` es la única cuenta con
   ese rol. No está en el repo (correcto que no esté).
2. **Hacerlo yo destruye justamente lo que buscás.** El pedido fue "por UI para que quede
   registrado quién lo hizo". Verifiqué cómo se registra:

```sql
-- fn_auditoria_log(), trigger trg_audit_usuarios
v_email := auth.jwt() ->> 'email';
IF v_email IS NOT NULL THEN
  SELECT id, club_id INTO v_usuario_id, v_club_id FROM usuarios WHERE email = v_email;
END IF;
```

El `auditoria.usuario_id` sale del **JWT de la sesión del navegador**. Si lo hago por MCP
(`execute_sql`) o con service_role, no hay JWT → `usuario_id = NULL` → queda un UPDATE
anónimo. Y si lo hiciera con tu sesión de `admin@sgh.com`, el log diría "admin@sgh.com",
que es una cuenta compartida: tampoco identifica a una persona.

Esto no es teórico. La reparación de Valeria del 18/08 está en la auditoría **con
`usuario_id = NULL`**: se hizo con service_role, no por la UI. Por eso nadie sabe quién
fue ni quedó registrado que pasó.

### Pasos exactos (30 segundos, en tu navegador ya logueado)

1. `https://sigh.com.ar/usuarios.html` — sesión `admin@sgh.com` (super_admin).
2. Fila **Federico Iguacel** (`fedeiguacel@gmail.com`) — badge rojo "Inactivo".
3. Botón **Activar** → confirmar el diálogo *"¿Deseas activar al usuario Federico Iguacel?"*.
4. El badge pasa a verde "Activo". Fede refresca y ya ve todo.

**Ojo con un detalle:** `toggleActivo()` (usuarios.html:488) hace
`update({ activo }).eq('id', id)` — **solo toca `activo`, no toca `estado`**. La fila de
Fede va a quedar `activo=true, estado='pendiente'`, igual que quedó la de Valeria.
Para su rol (`secretario_carreras`) es inocuo — RLS solo mira `activo`, y `login.html`
solo mira `estado` en las ramas `propietario`/`profesional`. Pero es la misma
inconsistencia cosmética que ya arrastra Valeria. Si querés dejarlo prolijo hay que
normalizar `estado` aparte.

Avisame cuando lo aprietes y verifico contra la base que quedó bien.

---

## Punto 2 — La pregunta que define el fix

> ¿El estado inactivo es deliberado —una segunda barrera para que un admin habilite— o
> simplemente nadie lo implementó?

**Ninguna de las dos. Es deliberado como estado transitorio, y SÍ está implementado —
pero no se ejecuta.** Esa es la respuesta y cambia el fix: no hay que construir la
activación automática, hay que **reparar la que ya existe**.

### Evidencia de que NO es una segunda barrera

1. **El default de la columna es `true`:**
   ```
   usuarios.activo → boolean NOT NULL DEFAULT true
   ```
   La línea de base es "activo". `false` es una excepción que alguien escribe a propósito.

2. **Lo escribe un solo lugar, y dice para qué:**
   ```ts
   // supabase/functions/invite-user/index.ts:483
   activo: false,               // hasta que acepte la invitación (§4.1)
   ```
   *"hasta que acepte"*, no *"hasta que un admin lo habilite"*. Es un candado con llave
   propia, no con llave ajena.

3. **El otro camino de alta ni siquiera lo usa.** `rpc_aprobar_solicitud` (autorregistro
   de propietarios/profesionales) inserta directo:
   ```sql
   INSERT INTO usuarios (..., activo, estado, ...) VALUES (..., true, 'activo', ...)
   ```
   Ahí la barrera humana es la **aprobación de la solicitud**, y una vez aprobada el
   usuario nace activo. No hay segundo paso. Los dos caminos no coinciden entre sí.

4. **La barrera de verdad ya existe y está antes:** solo un super_admin puede invitar
   (`usuarios_insert WITH CHECK fn_is_super_admin()`). El acto de invitar **es** la
   habilitación. Pedir una segunda sería redundante.

5. **El plan lo dice textual** (`docs/plan_alta_invitacion.md:215`):
   > `activo` = `false` hasta que acepte la invitación; `estado` = `'pendiente'`

### Evidencia de que SÍ está implementado

`reset-password.html:270-300` — la función existe, está documentada y hace exactamente lo que falta:

```js
/**
 * Activación del invitado (§4.1 del plan, corrección C1).
 * La Edge Function invite-user deja la fila en activo=false / estado='pendiente'.
 * Acá, YA autenticado con el token del mail, el propio usuario se activa […]
 */
async function activarUsuario() {
  …
  const { data, error } = await sb.from('usuarios')
    .update({ activo: true, estado: 'activo' })
    .eq('email', email).select('id');
```

O sea: el diseño es **auto-activación al fijar la contraseña**. Está escrito, deployado
y vivo desde julio.

### Por qué no corrió para Fede — probado por auditoría

Toda la historia de su fila son **dos** eventos, y el segundo no existe:

| # | fecha | acción | activo | estado | `auditoria.usuario_id` |
|---|---|---|---|---|---|
| 1 | 2026-08-07 04:50:25 | INSERT | `false` | `pendiente` | NULL (Edge Function, service_role) |
| — | — | *(no hay UPDATE)* | — | — | — |

**Cero UPDATEs.** `activarUsuario()` nunca escribió nada. No es que falló el UPDATE:
nunca se intentó.

Y descarto la sospecha obvia: **no fue RLS**. El trigger `trg_usuarios_set_auth_user_id`
funcionó — la fila nació ya con `auth_user_id = 8b2f4c83-…`, se ve en el `datos_despues`
del INSERT. La policy vigente es:
```sql
usuarios_update USING/CHECK: fn_is_super_admin() OR auth_user_id = auth.uid()
```
La rama `auth_user_id = auth.uid()` le hubiera dado match. El UPDATE habría pasado.

**Causa (inferida, alta confianza):** `activarUsuario()` cuelga de un `if (ES_INVITE)`
(reset-password.html:328), y `ES_INVITE` sale del hash de la URL:
```js
const FLOW = new URLSearchParams(INITIAL_HASH.replace(/^#/,'')).get('type') === 'invite'
             ? 'invite' : 'recovery';
```
Fede fue invitado el **07/08 04:50** y confirmó el mail el **23/08 21:50**: **16 días
después**. Los links de invitación de GoTrue expiran (default 24 h). Su link estaba
muerto hacía dos semanas, así que casi con certeza entró por *"olvidé mi contraseña"* →
llegó con `type=recovery` → `ES_INVITE = false` → **la activación se saltea por diseño**.

Fijó su contraseña, entró, y quedó `activo=false`. El sistema hizo exactamente lo que
dice el código.

**Valeria confirma el patrón.** Su fila: INSERT 16/08 13:06 (`activo=false`), y después
un único UPDATE el **18/08 15:03** con `usuario_id = NULL` — service_role, dos días
tarde, a mano. Su auto-activación tampoco corrió. Y ese UPDATE manual dejó
`estado='pendiente'`: la firma inconfundible de un `UPDATE usuarios SET activo = true`
suelto.

### Bug latente adicional (encontrado de paso)

El comentario de `reset-password.html:277` dice:

> *"la policy `usuarios_update` permite la rama `email = auth.jwt()->>'email'`, así que
> no hace falta service_role"*

**Esa rama no existe en la policy vigente.** La real es
`fn_is_super_admin() OR auth_user_id = auth.uid()` (la cambió el hardening
`sec_rls_fase2b_escritura`, 01/08). Hoy funciona igual porque el trigger llena
`auth_user_id`, pero el código y la base tienen contratos distintos: si alguna vez
`auth_user_id` quedara NULL, el UPDATE devuelve 0 filas **sin error** (`motivo: 'sin_filas'`)
y el usuario aterriza exactamente en el estado de Fede. Corregir el comentario, y ojalá
también el supuesto.

---

## Las tres opciones, con su riesgo

### A — Trigger en `auth.users`

`AFTER UPDATE OF email_confirmed_at ON auth.users` → flipea `activo`/`estado` en la fila
de `usuarios` que matchee por email o `auth_user_id`.

**A favor:** es el único que cubre **cualquier** camino de entrada — invite, recovery,
magic link, link vencido, lo que sea. Es decir: es el único que hubiera atajado el caso
real de Fede sin depender de qué URL usó.

**Riesgo:**
- ⚠️ **Blast radius máximo.** Un error dentro de ese trigger rompe la confirmación de mail
  y el signup **de todo el proyecto**, no solo el alta de staff. Es la peor pieza del
  sistema para tener una excepción viva. Mitigable con cuerpo trivial y
  `EXCEPTION WHEN OTHERS THEN RETURN NEW`, pero el riesgo no baja a cero.
- El schema `auth` es de Supabase (`supabase_auth_admin`). Un upgrade de GoTrue puede
  pisarlo o dejarlo inconsistente, y no queda rastro en tus migraciones de por qué
  desapareció.
- Hay que confirmar que el MCP tenga privilegio de DDL sobre `auth` — puede no tenerlo.
- Invisible desde el código de la app: dentro de seis meses, nadie va a buscar ahí.
- No distingue "aceptó la invitación" de cualquier otra confirmación de email.

### B — Que `initAuth` lo resuelva al primer login

En `initAuth()`: si la fila propia viene con `activo=false`, hacer el UPDATE de
auto-activación antes de seguir.

**A favor:**
- **Cero privilegios nuevos.** La policy ya lo permite (`auth_user_id = auth.uid()`), y
  `reset-password.html` ya hace este mismo UPDATE hoy: no se agrega ninguna capacidad
  que el cliente no tenga.
- Cubre todos los caminos igual que (A) — invite, recovery, link vencido — porque
  engancha en el login, no en el mail.
- Queda **en la auditoría a nombre del propio usuario**, con JWT real. Trazable.
- Es código de app, en el repo, visible, revisable, revertible con un push.

**Riesgo:**
- 🔴 **`activo` está sobrecargado y ahí está el peligro.** Significa dos cosas distintas:
  "todavía no terminó el alta" y "lo dieron de baja". `usuarios.html` tiene botón
  **Desactivar** que escribe el mismo `activo=false`. Una auto-activación ingenua
  **reactivaría en el próximo login a alguien que la secretaría acaba de dar de baja** —
  convierte una baja en un placebo. Es un agujero de seguridad, no un bug cosmético.
- **Mitigación obligatoria:** condicionar el auto-UPDATE a `estado = 'pendiente'`, no a
  `activo = false` a secas. Hoy funciona porque `toggleActivo` **no toca `estado`**: un
  usuario dado de baja queda `activo=false, estado='activo'` y no calificaría. Pero eso
  es un invariante frágil sostenido por omisión — hay que **documentarlo y testearlo**, o
  mejor, separar los dos conceptos en columnas distintas.
- Corre en cada login (una lectura extra, despreciable).

### C — Que `rpc_aprobar_solicitud` lo deje activo

**No aplica: ya lo hace.** Verificado en la definición viva de la función — inserta
`activo = true, estado = 'activo'`. No hay nada que arreglar ahí.

Y más importante: **es otro camino**. `rpc_aprobar_solicitud` es el autorregistro de
propietarios/profesionales por `solicitudes.html`. Fede entró por `invite-user`, el alta
de staff por invitación. Tocar (C) no mueve la aguja de este problema **ni un milímetro**.

Lo único que aporta es un dato: los dos caminos de alta ya se contradicen entre sí — uno
nace activo, el otro nace inactivo esperando un evento que no siempre llega. Esa
discrepancia es la enfermedad de fondo.

---

## Recomendación

**(B) con el gate en `estado='pendiente'`, más tres remiendos chicos.** No porque sea el
más elegante, sino porque es el único que arregla el caso real sin poner una excepción
viva en el camino de autenticación de todo el proyecto.

En orden de valor por línea de código:

1. **`login.html` — que la pantalla avise (5 líneas, hacelo aunque no hagas nada más).**
   Hoy un usuario con `activo=false` entra, ve un dashboard vacío y no tiene forma de
   saber que su cuenta no está habilitada. Ese silencio es la herida real: costó dos
   incidentes y dos llamados. Chequear `activo` para **todos** los roles y mostrar
   *"Tu cuenta está pendiente de activación. Avisale a la secretaría."* Esto vale incluso
   si después se decide que la activación siga siendo manual.

2. **`reset-password.html` — sacar el gate `ES_INVITE` de `activarUsuario()`.** Correrla
   también en el flujo `recovery`. Es inocua ahí: solo repara una fila `pendiente` del
   propio usuario autenticado. Con esto solo, Fede se hubiera activado al fijar su
   contraseña. Y corregir el comentario de la línea 277, que describe una policy que ya
   no existe.

3. **`initAuth()` — la red de contención (opción B).** Para los que ya entraron y quedaron
   colgados, y para cualquier camino futuro. Condición estricta:
   `activo = false AND estado = 'pendiente' AND auth_user_id = auth.uid()`.

4. **Higiene de datos:** normalizar `estado='activo'` en Valeria (y en Fede después de
   activarlo). Y evaluar separar `activo` (baja administrativa) de `estado` (etapa del
   alta) — hoy están enredados y esa mezcla es la que hace peligrosa a (B).

**Opcional, gratis:** subir el TTL del link de invitación en GoTrue (Auth → Providers →
Email → *Email OTP / link expiry*). Con 24 h, cualquier invitado que tarde un día
—Fede tardó dieciséis— cae sí o sí en el camino roto. No arregla la causa, pero baja
mucho la frecuencia.

**Cuándo elegiría (A):** si aparecen más caminos de alta fuera de la app (magic links,
OAuth, SSO) donde el navegador no pasa por `initAuth` ni por `reset-password`. Ahí el
trigger deja de ser sobredimensionado y pasa a ser el único lugar que ve todo. Hoy no
es el caso.

---

## Verificaciones hechas para este informe (todas read-only)

- `information_schema.columns` → default de `usuarios.activo` = `true`
- `pg_policy` sobre `usuarios` → 4 policies; `usuarios_update` sin rama por email
- `pg_get_functiondef` → `rpc_aprobar_solicitud`, `fn_solicitudes_guard_staff`,
  `fn_auditoria_log`, `fn_get_user_club_id`, `fn_usuarios_set_auth_user_id`
- `pg_trigger` sobre `usuarios` y `auth.users` → 4 triggers en `usuarios`, **0 en `auth.users`**
- `auditoria` filtrada por las filas de Fede y Valeria → historia completa de ambas
- `supabase_migrations` → `sec_autoregistro_gate1` aplicada el 04/08, **anterior** a las
  dos invitaciones (descarta "la policy cambió después")
- Código: `usuarios.html`, `login.html`, `reset-password.html`,
  `supabase/functions/invite-user/index.ts`, `docs/plan_alta_invitacion.md`

Ninguna escritura. Fede sigue inactivo hasta que apretes el botón.
