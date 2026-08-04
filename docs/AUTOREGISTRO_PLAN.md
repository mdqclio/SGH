# Auto-registro con aprobación — plan de diseño

**Fecha**: 2026-08-04 · **Base**: `main` @ `3c2abaf` · **Proyecto**: `unlhcuanfrtpatoipwve`
**Guard**: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** ✅
**Estado**: PLAN. **Nada ejecutado** — ni schema, ni policies, ni UI.

**Regla de negocio (Fede + ajuste de Leo)**: auto-registro libre; **inscribir requiere aprobación previa de la secretaría**, una vez por persona. En el sistema se ve plata: nadie inscribe ni ve datos de otro sin que la secretaría confirme quién es.

---

## Respuesta corta a la pregunta del piloto

🔴 **El viernes 07/08 no es alcanzable de forma segura.** Quedan **3 días hábiles** (mié 5, jue 6, vie 7) y el camino crítico incluye tres cosas que hoy **no existen ni fueron probadas nunca en producción**:

1. El vínculo cuenta→ficha (`usuarios.entidad_id`) tiene **0 filas** en prod. Toda la ruta de lectura del portal (`fn_mis_entidades`, `fn_mis_spc_ids`, y las policies de `spcs`/`liquidaciones`/`recibos` que dependen de ellas) **nunca se ejerció con datos reales**.
2. La pantalla de **inscribir desde el portal no está construida** (`PORTAL_V2_PLAN` §C.2 la deja como diseño).
3. Hay **cuatro defectos de seguridad preexistentes** (§C) que este flujo activa. Sin cerrarlos, auto-registro = repartir lectura del club a cualquiera con un email.

**Propuesta**: piloto completo para **R9 (06/09)**, y para el viernes una **variante reducida y sin riesgo** (§E.5): el entrenador se registra de verdad y Yesi lo aprueba de verdad — se ejercita la mitad nueva del flujo — pero **su inscripción a R8 la carga la secretaría como siempre**. R8 no se toca.

---

## C. SEGURIDAD (va primero porque condiciona todo el diseño)

Verificado contra las policies **reales de prod**, no contra el diseño documentado.

### C.0 Punto de partida: 120 policies, todas sobre `authenticated`, ninguna sobre `anon`

```
total_policies 120 | con_anon 0 | con_authenticated 120 | con_public 0 | tablas 32
```

Un visitante sin sesión no lee nada. **Pero apenas alguien hace `signUp`, es `authenticated`** y le aplican las 120.

### C.1 🔴 BLOQUEANTE — `fn_get_user_club_id()` no chequea `activo`

```sql
CREATE FUNCTION fn_get_user_club_id() RETURNS uuid ... AS $$
  SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid();
$$;
```

**No filtra por `activo`.** Y `usuarios.club_id` es **NOT NULL**, así que *toda* fila de `usuarios` tiene club.

Consecuencia directa: si el auto-registro crea una fila en `usuarios` —aunque sea con `activo=false, estado='pendiente'`, como hace hoy `registro-profesional.html`— esa cuenta obtiene **lectura de todo el club** en las tablas cuya policy es `club_id = fn_get_user_club_id()`:

`reuniones` · `carreras` · `inscripciones` · `caballerizas` · `caballeriza_responsables` · `resultados` · `apoderados`

Es decir: **el diseño "usuario pendiente = fila en `usuarios` con `activo=false`" filtra el club entero.** Este es el hallazgo que ordena todo el resto del plan.

### C.2 🔴 `usuarios.rol` tiene DEFAULT `'operador'`, y `'operador'` es STAFF

```sql
rol rol_usuario NOT NULL DEFAULT 'operador'
fn_is_staff(): rol IN ('super_admin','secretario_carreras','operador') AND activo
```

Un INSERT en `usuarios` que omita `rol` crea **staff**. Con `activo=false` `fn_is_staff()` da false, así que hoy no explota — pero es un default hostil: cualquier futuro cambio que active la fila antes de fijar el rol convierte a un desconocido en operador. El enum ya tiene **`publico`**, que es el valor correcto para un no-aprobado.

### C.3 🟡 `performances` y `sanciones`: `USING (true)` para `authenticated`

Las únicas dos policies de lectura sin ninguna condición. **Cualquier cuenta autenticada las lee enteras**, incluida una recién registrada.

Exposición hoy: `performances` **0 filas**, `sanciones` **1 fila**. O sea, el daño actual es nulo — pero es incorrecto por defecto y crece solo. `sanciones` es, además, información sensible de personas (es "sanciones compartidas entre hipódromos").

### C.4 🟡 `registro-profesional.html` está VIVO, linkeado desde `login.html`, y viola la regla

El archivo existe y `login.html` lo enlaza. Hace exactamente lo que Leo dijo que no se debe hacer:

```js
await sb.auth.signUp({ email, password });                    // 1. crea la cuenta
await sb.from('usuarios').insert({ club_id: null, rol, estado:'pendiente', activo:false });
await sb.from('propietarios').insert({ ..., activo:false });  // 3. CREA LA FICHA SOLO
await sb.from('profesionales').insert({ ..., activo:false });
```

Tres problemas:

- **Auto-crea la ficha** de propietario/profesional sin que intervenga nadie. Es precisamente el auto-vínculo que el ajuste de Leo prohíbe.
- **Está roto**: `club_id: null` viola el NOT NULL, y las policies `usuarios_insert`/`propietarios_insert`/`profesionales_insert` exigen `fn_is_super_admin()` / `fn_is_staff()`. Los tres inserts fallan.
- **Deja basura**: el `signUp` ocurre **antes** de los inserts que fallan, así que queda una cuenta en `auth.users` sin nada del lado de la app. **Ya hay 2 huérfanas** (`auth.users` = 5, sin fila en `usuarios` = 2, creadas antes del 11/05).

Los inserts de la ficha ni siquiera cortan el flujo: están con `console.warn`. Si algún día se aflojan esas policies, vuelve a crear fichas solo.

### C.5 ✅ Lo que SÍ está bien y hay que apoyarse en ello

| mecanismo | estado |
|---|---|
| `usuarios_insert` exige `fn_is_super_admin()` | ✅ el navegador **no puede** crearse su fila. Fuerza a pasar por RPC/Edge Function |
| `trg_usuarios_guard_privilegios` (SECURITY DEFINER) | ✅ bloquea que un usuario cambie `rol`, `club_id`, `entidad_tipo`, `entidad_id` o `auth_user_id` de su propia fila |
| `trg_proteger_rol_club_id_usuario` | ✅ segunda barrera sobre `rol`/`club_id` |
| `fn_is_staff()` / `fn_is_super_admin()` / `fn_is_portal_user()` | ✅ todas exigen `activo` — fail-closed |
| `fn_mis_entidades()` | ✅ exige `activo` **y** entidad no nula |
| identidad por `auth.uid()` | ✅ el email ya no está en la ruta de identidad |
| `usuarios_select` incluye `auth_user_id = auth.uid()` | ✅ el usuario lee su propia fila — necesario para el landing |

### C.6 Rate limiting y abuso del signup abierto

**No pude leer la config de GoTrue**: requiere la Management API y el PAT ya fue borrado del VPS (higiene correcta). Queda como verificación de dashboard en el Gate 0.

Lo que GoTrue ofrece y hay que confirmar/activar:

| control | para qué | recomendación |
|---|---|---|
| **CAPTCHA** (hCaptcha / Turnstile) en signup | corta el registro automatizado en masa | **activar** — es el control que más rinde |
| **Confirmación de email** (`mailer_autoconfirm = false`) | la cuenta no sirve hasta verificar el correo | **confirmar que está activa**. Si está en autoconfirm, cualquier email inventado da cuenta usable |
| Rate limit de emails enviados | evita usar el proyecto como relay de spam | revisar el valor |
| Rate limit por IP | mitiga, no resuelve (IPs rotativas) | dejar el default |

Lo que GoTrue **no** ofrece y hay que poner del lado nuestro:

- **Una solicitud por cuenta**: `UNIQUE (auth_user_id)` en la tabla de solicitudes.
- **Tope por DNI declarado**: índice único parcial sobre solicitudes pendientes por `documento_nro`, para que el mismo DNI no genere 40 solicitudes.
- **Tope global de pendientes**: si Yesi ve 300 solicitudes, el ataque ya funcionó aunque no lea nada. Un contador y un aviso alcanzan para el piloto.

**Exposición que aceptamos, explícita**: con signup abierto + captcha + email confirmado, un atacante puede crear cuentas de a una y **no llega a ningún dato** (§C.7). El costo real del abuso es **ruido en la bandeja de Yesi**, no fuga de información.

### C.7 Qué puede hacer exactamente una cuenta pendiente — con el diseño propuesto

La decisión de diseño de §B (el pendiente **no tiene fila en `usuarios`**) hace que todo deniegue por construcción, sin tocar ninguna policy existente:

| función | valor para un pendiente | efecto |
|---|---|---|
| `fn_is_staff()` | `false` | sin acceso de staff |
| `fn_is_super_admin()` | `false` | ídem |
| `fn_is_portal_user()` | `false` | ídem |
| `fn_get_user_club_id()` | `NULL` | `club_id = NULL` nunca matchea → 0 filas |
| `fn_mis_entidades()` | vacío | `id IN (∅)` → 0 filas |
| `fn_mis_spc_ids()` | vacío | 0 filas |

Resultado tabla por tabla:

| tabla | lo que ve un pendiente |
|---|---|
| `reuniones`, `carreras`, `inscripciones`, `caballerizas`, `resultados`, `apoderados`, `caballeriza_responsables` | **0 filas** (club NULL) |
| `propietarios`, `profesionales`, `spcs`, `liquidaciones`, `recibos`, `liquidacion_detalle` | **0 filas** (sin entidad) |
| `usuarios` | **0 filas** (no tiene fila propia) |
| `solicitudes_acceso` (nueva) | **sólo la suya**, y sólo lectura |
| `performances`, `sanciones` | 🟡 **todo** — hasta que se cierre C.3 |

**Único hueco real de un pendiente: `performances` + `sanciones`.** Se cierra en el Gate 1 y queda cubierto por probe.

### C.8 El matcheo por DNI lo hace SOLO la secretaría — cómo lo garantiza el diseño

Confirmado, y por construcción, no por disciplina:

1. El registrado **declara** su DNI en la solicitud. Ese valor va a `solicitudes_acceso.documento_nro` y **a ningún otro lado**.
2. **No existe ningún trigger ni RPC que vincule por coincidencia de DNI.** El único camino a `usuarios.entidad_id` es la RPC de aprobación, que es `SECURITY DEFINER` con guarda `fn_is_staff()` y **recibe el `entidad_id` como parámetro explícito** — o sea, lo elige Yesi.
3. La RPC que calcula **sugerencias** (`fn_sugerencias_match`) es de sólo lectura, la llama la bandeja de Yesi, y **no escribe nada**.
4. El pendiente **no puede leer `propietarios` ni `profesionales`** (§C.7), así que ni siquiera puede averiguar si su DNI existe en una ficha.

> Contraste con lo que hay hoy: `registro-profesional.html` **crea la ficha él mismo**. El diseño nuevo elimina esa ruta.

---

## B. MODELO DE DATOS

### B.1 ¿Alcanza `usuarios.estado`? — **No, y por qué**

La columna existe (`estado varchar DEFAULT 'activo'`, nullable) y `invite-user` ya la usa (`'pendiente'` → `'invitado'`). Pero para el **auto-registro** no alcanza, por §C.1: **cualquier fila en `usuarios` implica un `club_id` NOT NULL, y `fn_get_user_club_id()` lo devuelve sin mirar `activo`** → lectura del club entero.

Para reusar `usuarios.estado` habría que, además:
- hacer `usuarios.club_id` nullable (migración sobre una tabla central), **y**
- agregar `AND activo` a `fn_get_user_club_id()`, que participa en las policies de **7 tablas** → re-verificar todas.

Es factible, pero es cirugía sobre el corazón del modelo de permisos, a 3 días del piloto. **No lo recomiendo ahora.**

### B.2 Recomendación: tabla nueva `solicitudes_acceso`

El pendiente **no entra a `usuarios` hasta ser aprobado**. Fail-closed por construcción: sin fila en `usuarios`, todo lo existente ya deniega (§C.7), y **no se toca ni una policy vigente**.

```sql
-- PROPUESTA — no ejecutado
CREATE TABLE solicitudes_acceso (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id   uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email          varchar(150) NOT NULL,
  nombre         varchar(200) NOT NULL,
  apellido       varchar(200) NOT NULL,
  documento_tipo varchar(20)  NOT NULL DEFAULT 'DNI',
  documento_nro  varchar(30)  NOT NULL,          -- llave de matcheo. OBLIGATORIO
  telefono       varchar(50),
  rol_pedido     varchar(20)  NOT NULL CHECK (rol_pedido IN ('profesional','propietario')),
  club_id        uuid NOT NULL REFERENCES clubs(id),   -- a qué hipódromo pide entrar
  estado         varchar(20)  NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente','aprobada','rechazada')),
  motivo_rechazo text,
  resuelta_por   uuid REFERENCES usuarios(id),
  resuelta_at    timestamptz,
  created_at     timestamptz  NOT NULL DEFAULT now()
);

-- una sola solicitud pendiente por DNI y club (anti-flood)
CREATE UNIQUE INDEX ux_solicitud_pendiente_doc
  ON solicitudes_acceso (club_id, documento_nro) WHERE estado = 'pendiente';
```

Policies (las únicas nuevas):

```sql
ALTER TABLE solicitudes_acceso ENABLE ROW LEVEL SECURITY;

-- el solicitante lee SÓLO la suya; el staff del club, las de su club
CREATE POLICY solicitudes_select ON solicitudes_acceso FOR SELECT TO authenticated
USING (
  auth_user_id = (SELECT auth.uid())
  OR ((SELECT fn_is_staff()) AND club_id = (SELECT fn_get_user_club_id()))
);

-- nadie escribe directo: ni el solicitante ni el staff. Todo por RPC.
-- (sin policy de INSERT/UPDATE/DELETE = denegado para authenticated)
```

> **Nada de `USING (true)`.** Y ojo: **no** se agrega policy de UPDATE ni para el staff — la aprobación va por RPC `SECURITY DEFINER`, para que el cambio de estado y la creación del vínculo sean **una sola transacción** y no dos escrituras sueltas.

### B.3 ¿Vale `usuario_entidades` del plan del portal? — **cambió el contexto**

`PORTAL_V2_PLAN` §B.3 propone una tabla `usuario_entidades` 1..N con índice único parcial. **Eso no se implementó.** Lo que quedó en prod es la versión 1..1 sobre columnas de `usuarios`:

```sql
-- REAL, en prod
CREATE FUNCTION fn_mis_entidades() RETURNS TABLE(entidad_tipo text, entidad_id uuid) ... AS $$
  SELECT u.entidad_tipo::text, u.entidad_id FROM usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.activo
    AND u.entidad_tipo IS NOT NULL AND u.entidad_id IS NOT NULL;
$$;
```

**Recomendación: para el piloto, usar lo que ya existe** (`usuarios.entidad_tipo` + `entidad_id`), y **no** construir `usuario_entidades` todavía.

Razones:
- Un entrenador de confianza es **una** ficha. El caso 1..N (alguien que es propietario *y* entrenador, o titular de dos studs) no aparece en el piloto.
- `fn_mis_entidades()` ya tiene la firma correcta (`TABLE(entidad_tipo, entidad_id)`), así que **migrar a `usuario_entidades` después es cambiar el cuerpo de una función**, sin tocar ninguna policy.
- Falta hoy, y sí conviene agregarla: el **índice único parcial** que impide que dos cuentas reclamen la misma ficha.

```sql
-- PROPUESTA — la única salvaguarda que falta del diseño original
CREATE UNIQUE INDEX ux_entidad_una_cuenta
  ON usuarios (entidad_tipo, entidad_id)
  WHERE entidad_id IS NOT NULL AND activo;
```

⚠️ **Deuda registrada**: `fn_mis_entidades()` 1..1 no cubre el caso multi-ficha. Cuando aparezca, se implementa `usuario_entidades` según `PORTAL_V2_PLAN` §B.3 y se cambia sólo el cuerpo de la función.

### B.4 Qué rol recibe el auto-registrado

| momento | dónde vive | rol | activo |
|---|---|---|---|
| **registrado, pendiente** | `solicitudes_acceso` — **no** está en `usuarios` | — (no tiene) | — |
| **aprobado** | fila nueva en `usuarios` | `'profesional'` o `'propietario'` según `rol_pedido` | `true` |
| **rechazado** | queda en `solicitudes_acceso` con `estado='rechazada'` | — | — |

**El rol `'publico'` no se usa en este flujo.** Existe en el enum y sirve para "cuenta sin privilegios con fila en `usuarios`", pero acá el pendiente no tiene fila — que es más seguro. Se deja el valor disponible para otro uso.

⚠️ En la RPC de aprobación, `rol` va **siempre explícito**. Nunca omitirlo: el default es `'operador'` = staff (§C.2).

---

## A. FLUJO, PANTALLA POR PANTALLA

### A.1 `registro.html` (nueva) — el formulario

> Nombre a definir: el archivo `registro.html` **ya existe y es otra cosa** (alta de club nuevo, crea `clubs` + `categorias_carrera`; tampoco está linkeado). Ver §D.

**Datos que pide:**

| campo | oblig. | por qué |
|---|---|---|
| email | ✅ | login |
| contraseña | ✅ | login |
| nombre / apellido | ✅ | identificación humana en la bandeja |
| **DNI** | ✅ | **llave de matcheo**. Y es el dato que le falta a la integración Stud Book: hoy sólo 103/167 profesionales lo tienen |
| tipo de documento | ✅ | default `DNI` |
| teléfono | ✅ | Yesi verifica por teléfono antes de aprobar. Sin esto, no puede |
| soy… entrenador / propietario | ✅ | define `rol_pedido` |
| hipódromo | ✅ | `club_id`. Para el piloto, fijo en Dolores |

**No pide** patente ni stud: son datos de la ficha, y la ficha la resuelve la secretaría.

**Qué pasa al enviar:**

1. `sb.auth.signUp({email, password})` → cuenta en `auth.users`, sin confirmar.
2. Con la sesión recién creada, `sb.functions.invoke('solicitar-acceso', {…})`.
3. La Edge Function valida, y **con la service key** inserta en `solicitudes_acceso` (el navegador no puede: no hay policy de INSERT).
4. Pantalla de éxito: *"Revisá tu correo para confirmar la dirección. Después la secretaría va a validar tus datos; te avisamos cuando esté."*

⚠️ **Orden invertido respecto de hoy.** El bug de §C.4 es que el `signUp` ocurre antes de un insert que falla y deja huérfanos. La Edge Function debe ser **transaccional hacia atrás**: si el insert de la solicitud falla, **borra el `auth.users`** que acaba de crear. `invite-user` ya hace exactamente eso (`admin.auth.admin.deleteUser` en el rollback) — se copia el patrón.

### A.2 `portal.html` para un pendiente — qué ve

Entra, tiene sesión, pero **no tiene fila en `usuarios`**: todas las consultas devuelven 0 filas. Hay que detectar ese estado explícitamente, no dejar la pantalla vacía.

```
┌──────────────────────────────────────────────┐
│  Tu solicitud está en revisión               │
│                                              │
│  Enviada el 04/08 · DNI 12.345.678           │
│  La secretaría valida los datos y te avisa.  │
│  Dudas: (02245) 44-xxxx                      │
├──────────────────────────────────────────────┤
│  PROGRAMA OFICIAL — R8, domingo 16/08        │
│  (público, sin datos de personas)            │
└──────────────────────────────────────────────┘
```

**Algo útil, sin datos sensibles.** El programa público **no** puede salir de `SELECT` directo (las policies lo bloquean, y está bien que lo hagan). Sale de una RPC acotada:

```sql
-- PROPUESTA — SECURITY DEFINER, sin datos de personas
CREATE FUNCTION fn_programa_publico(p_club_id uuid)
RETURNS TABLE (reunion_fecha date, numero text, premio text,
               distancia int, categoria text, hora time)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ...  -- SOLO reunión + carreras. NI competidores, NI jockeys, NI premios en $
$$;
```

Regla: **si un dato no está en el programa impreso que se pega en la puerta del hipódromo, no va acá.** Sin nombres de ejemplares, sin cuidadores, sin dividendos, sin importes.

> Alternativa más barata para el piloto: pantalla de estado solamente, sin programa. Menos superficie, menos código. **Es la que recomiendo para el Gate 3**; el programa público puede venir después.

### A.3 Bandeja de aprobación para Yesi

Pantalla nueva `solicitudes.html` (ver §D.3 sobre por qué no dentro de `usuarios.html`).

```
SOLICITUDES DE ACCESO — Hipódromo de Dolores          [Pendientes 3] [Resueltas]

┌────────────────────────────────────────────────────────────────────┐
│ Juan Pérez · DNI 12.345.678 · entrenador · 11-5555-4444            │
│ juan@mail.com · solicitado 04/08 14:20                             │
│                                                                    │
│  MATCHEO POR DNI                                                   │
│  ● EXACTO   profesionales · PEREZ, Juan · entrenador · DNI 12345678│
│             patente 4412 · La Plata                                │
│                                                                    │
│  [ Vincular a esta ficha y aprobar ]  [ Otra ficha… ]  [ Rechazar ]│
└────────────────────────────────────────────────────────────────────┘
```

**Los tres casos, y qué muestra cada uno:**

| caso | qué ve Yesi | acción |
|---|---|---|
| **Exacto** — 1 ficha con ese `documento_nro` y ese tipo | la ficha completa, marcada `EXACTO` | un click: vincular + aprobar |
| **Sugerencias** — sin match exacto, pero hay parecidos | lista de candidatos por apellido/nombre normalizado, con su DNI (o *sin DNI cargado*), ordenados por similitud. **Nunca preseleccionados** | Yesi elige una, o ninguna |
| **Sin ficha** — nada razonable | *"No hay ficha con ese DNI."* + buscador manual + **"Crear ficha nueva"** | crear ficha `profesionales`/`propietarios` con los datos declarados, y vincular |

El caso "sin ficha" es **frecuente y esperable**: 64 de 167 profesionales no tienen `documento_nro` cargado (103/167 = 62 % de cobertura). Un entrenador que existe en la base pero sin DNI **cae en "sugerencias"**, no en "exacto". Por eso la búsqueda manual por nombre es parte del flujo, no un extra.

> `propietarios` está mejor: **220/220 con DNI, todos distintos**. El matcheo exacto va a funcionar casi siempre para propietarios y a la mitad para entrenadores.

**Efecto colateral valioso**: cuando Yesi vincula una ficha sin DNI a una solicitud que sí lo declara, la UI ofrece **copiar el DNI declarado a la ficha**. Eso ataca directo el bloqueante #1 de la integración Stud Book (`INTEGRACION_STUDBOOK_ESTADO` §5): 72/125 cuidadores y 64/125 jockeys de R6 salen con `dni: null`. Cada aprobación mejora ese número.

### A.4 Aprobación → vínculo

Una sola RPC, transaccional:

```sql
-- PROPUESTA — SECURITY DEFINER, guarda fn_is_staff()
CREATE FUNCTION fn_aprobar_solicitud(
  p_solicitud_id uuid,
  p_entidad_tipo text,      -- 'profesional' | 'propietario'   ← LO ELIGE YESI
  p_entidad_id   uuid,      -- ficha destino                   ← LO ELIGE YESI
  p_copiar_documento boolean DEFAULT false
) RETURNS uuid ...
```

Hace, en una transacción:
1. `IF NOT fn_is_staff() THEN RAISE`; y valida que la solicitud sea del club del staff.
2. Valida que la ficha exista, sea del club, y **no esté ya vinculada a otra cuenta** (`ux_entidad_una_cuenta`).
3. `INSERT INTO usuarios (...)` con `auth_user_id`, `club_id`, `rol` **explícito**, `activo=true`, `estado='activo'`, `entidad_tipo`, `entidad_id`. Ojo con `password_hash NOT NULL` (columna legacy) — va un placeholder, la contraseña real vive en GoTrue.
4. Si `p_copiar_documento`, copia el DNI declarado a la ficha **sólo si la ficha lo tiene vacío** (nunca pisa un dato cargado).
5. `UPDATE solicitudes_acceso SET estado='aprobada', resuelta_por, resuelta_at`.

Desde ese instante el usuario tiene entidad → `fn_mis_entidades()` devuelve su ficha → ve sus caballos, sus inscripciones y lo que se le debe, y **sólo lo suyo**.

### A.5 Rechazo y comunicación

`fn_rechazar_solicitud(p_solicitud_id, p_motivo)` — misma guarda, marca `estado='rechazada'` + `motivo_rechazo`.

- El solicitante, al entrar, ve: *"Tu solicitud no fue aprobada. Motivo: … Consultá en secretaría: (02245) 44-xxxx."*
- **Mail automático de rechazo: fuera del piloto.** El template en español que se cargó es el de **invitación**; un mail de rechazo es otro template y otro circuito. Para el piloto, **Yesi avisa por teléfono** — que además es lo correcto para un rechazo.
- No se borra la cuenta de `auth.users`: dejarla permite corregir y re-solicitar sin re-registrarse. Un rechazo **no** libera el índice único de DNI pendiente (queda en `rechazada`, no en `pendiente`), así que puede volver a intentar.

---

## D. QUÉ SE RECICLA

### D.1 `registro-profesional.html` — **se tira la lógica, se conserva el formulario**

| parte | veredicto |
|---|---|
| CSS, layout, tabs entrenador/propietario, validación de campos, CSP | ✅ **se conserva** — está bien hecho y ahorra un día |
| los 3 inserts (`usuarios`, `propietarios`, `profesionales`) | ❌ **se borran**. Violan la regla de Leo y hoy están rotos |
| `signUp` sin rollback | ❌ se reemplaza por signUp + Edge Function con borrado en caso de fallo |
| campos patente / stud / hipódromo-patente | ❌ salen: son datos de ficha |
| **falta**: DNI obligatorio (hoy es opcional), teléfono obligatorio | ➕ se agregan |

⚠️ **Acción inmediata, independiente del piloto**: la página está **linkeada desde `login.html`** y hoy le da al usuario un `signUp` exitoso seguido de un error, dejando cuentas huérfanas. **Sacar el link o poner la página en "en construcción" es Gate 0**, no espera al resto.

### D.2 `registro.html` — **no tocar, y revisar aparte**

Es el alta de **club nuevo**: hace `signUp` e inserta en `clubs` + `usuarios` + `categorias_carrera`. No está linkeada desde ninguna página. Distinta del auto-registro de personas. **Fuera de alcance de este plan**, pero merece su propia revisión: un alta de club auto-servicio es al menos tan sensible como esto.

Por eso el formulario nuevo **no debe llamarse `registro.html`** — el nombre está tomado. Sugerencia: `solicitar-acceso.html`.

### D.3 Bandeja: pantalla nueva, no dentro de `usuarios.html`

`usuarios.html` (502 líneas) administra **usuarios ya existentes** del club: alta, edición, invitación. La bandeja de solicitudes es otro objeto (`solicitudes_acceso`), otro ciclo de vida y otra audiencia.

**Recomendación: `solicitudes.html` nueva**, con el contador de pendientes visible desde `index.html`. Se recicla de `usuarios.html` el layout de tabla, el `initAuth()`, el guard de rol y el `club-switcher`.

### D.4 `invite-user` — **intacto, sigue en paralelo**

El flujo por invitación **no se rompe ni se reemplaza**. Son dos puertas a la misma casa:

| | invitación (existe) | auto-registro (nuevo) |
|---|---|---|
| quién arranca | Yesi | la persona |
| cuándo | Yesi ya sabe a quién quiere adentro | alguien pide entrar |
| verificación | implícita: Yesi eligió la ficha | explícita: la bandeja |
| resultado | fila en `usuarios` + `auth.users` | idéntico, tras aprobación |

Y de `invite-user` se **copian dos patrones ya probados**: `activo:false` + `estado:'pendiente'` hasta confirmar, y el **rollback con `deleteUser`** si algo falla después de crear la cuenta.

---

## E. FASES CON GATES

Cada gate exige su probe en verde. Ningún gate avanza sin el anterior.

### Gate 0 — Contención (≈2 h, hacer YA, no depende del piloto)

| # | qué |
|---|---|
| 0.1 | **Sacar el link a `registro-profesional.html` de `login.html`** (o marcarla "en construcción"). Hoy deja cuentas huérfanas |
| 0.2 | Revisar en dashboard la config de GoTrue: `disable_signup`, `mailer_autoconfirm`, captcha. **No pude leerla** (§C.6) |
| 0.3 | Decidir qué hacer con las **2 cuentas huérfanas** de `auth.users` |

**Probe**: `grep -c 'registro-profesional' login.html` → 0.

### Gate 1 — Cerrar los huecos que este flujo activa (≈3 h) · **SCHEMA + POLICIES**

| # | qué |
|---|---|
| 1.1 | `performances_select` y `sanciones_select`: reemplazar `USING (true)` por la condición de club/staff que corresponda (§C.3) |
| 1.2 | `ux_entidad_una_cuenta` — índice único parcial sobre `usuarios(entidad_tipo, entidad_id)` (§B.3) |
| 1.3 | Migración de rollback escrita **antes**, como en las fases SEC_RLS |

**Probe**: `probe_rls_no_permissive` en verde con ALLOWLIST vacía (hoy fallaría con 2), y `probe_rls_secretaria` 18/18 sin regresión.

### Gate 2 — Solicitudes (≈4 h) · **SCHEMA + RPC**

| # | qué |
|---|---|
| 2.1 | Tabla `solicitudes_acceso` + índices + RLS + la única policy de SELECT (§B.2) |
| 2.2 | `fn_sugerencias_match(p_documento, p_nombre, p_apellido, p_tipo)` — sólo lectura, staff-only |
| 2.3 | `fn_aprobar_solicitud(...)` y `fn_rechazar_solicitud(...)` — SECURITY DEFINER, guarda `fn_is_staff()` |
| 2.4 | Edge Function `solicitar-acceso` con rollback de `auth.users` |

**Probe**: **`probe_rls_portal` extendido con la variante "cuenta pendiente"** (§E.1). Todos los asserts nuevos en verde.

### Gate 3 — UI (≈6 h) · **UI**

| # | qué |
|---|---|
| 3.1 | `solicitar-acceso.html` — reciclando el formulario de `registro-profesional.html`, con DNI y teléfono obligatorios |
| 3.2 | `portal.html`: detectar "sin fila en `usuarios`" → pantalla de estado (sin programa público en esta vuelta) |
| 3.3 | `solicitudes.html` — bandeja de Yesi con los tres casos de matcheo |
| 3.4 | Contador de pendientes en `index.html` |

**Probe**: recorrido manual completo con una cuenta de prueba: registro → pendiente → aprobación → ve sus caballos. Más `probe_rls_portal` completo en verde después de la aprobación.

### Gate 4 — Inscribir desde el portal (≈8 h) · **UI + RPC** — *el que no llega*

`PORTAL_V2_PLAN` §C.2. **No existe nada de esto todavía.** Es el que convierte "el entrenador entró" en "el entrenador se anotó".

**Probe**: assert 11/12 de `probe_rls_portal` (hoy PENDIENTES) + una inscripción real verificada contra `inscripciones`.

### E.1 Los asserts nuevos del probe de "cuenta pendiente"

`probe_rls_portal` cubre hoy 13 asserts con un cliente **propietario aprobado** (0b). Se agrega un tercer cliente, `PENDIENTE`: cuenta con `auth.users` **sin** fila en `usuarios`.

| # | assert | esperado |
|---|---|---|
| P1 | pendiente lee `propietarios`, `profesionales`, `spcs` | **0 filas** cada una |
| P2 | pendiente lee `reuniones`, `carreras`, `inscripciones`, `caballerizas`, `resultados` | **0 filas** cada una |
| P3 | pendiente lee `liquidaciones`, `recibos`, `liquidacion_detalle` | **0 filas** cada una |
| P4 | pendiente lee `usuarios` | **0 filas** |
| P5 | pendiente lee `performances`, `sanciones` | **0 filas** — 🔴 **falla hasta el Gate 1** |
| P6 | pendiente INSERT en `usuarios` | rechazado, y **verificado por relectura admin** (no por el status) |
| P7 | pendiente INSERT/UPDATE en `propietarios`/`profesionales` | ídem |
| P8 | pendiente lee `solicitudes_acceso` | **exactamente 1 fila**, la suya |
| P9 | pendiente hace UPDATE de su solicitud a `'aprobada'` | valor **sin cambiar** tras relectura admin |
| P10 | pendiente llama `fn_aprobar_solicitud` | excepción `fn_is_staff` |

⚠️ Se respeta la trampa ya documentada en el probe: **un UPDATE bloqueado por RLS devuelve éxito con 0 filas**. Todo assert de escritura es snapshot → intento → relectura con el cliente admin → comparar **valores**.

### E.2 Camino crítico y fecha

| gate | esfuerzo | acumulado |
|---|---|---|
| 0 · contención | 2 h | 2 h |
| 1 · huecos | 3 h | 5 h |
| 2 · solicitudes | 4 h | 9 h |
| 3 · UI | 6 h | 15 h |
| 4 · inscribir | 8 h | **23 h** |

**Hasta el viernes 07/08 hay 3 días hábiles.** 23 h de trabajo neto entran nominalmente — pero eso asume cero fricción en tres cosas que nunca corrieron: el vínculo entidad (0 filas en prod hoy), la ruta de lectura del portal con datos reales, y la pantalla de inscripción que no existe.

### E.3 🔴 Recomendación honesta

**No hacer el piloto de inscripción online contra R8.** No por el esfuerzo, sino por dónde caería el error: si el vínculo o las policies fallan durante la ventana de inscripción, el daño no es un bug de UI — es un entrenador que **no queda anotado** en una reunión que corre el 16/08, o peor, **datos de plata de otro** visibles para alguien.

**R8 no se arriesga**, como vos mismo planteaste.

### E.4 Recomendación: piloto completo en R9 (domingo 06/09)

Un mes de margen. Gates 0-1 esta semana (son deuda de seguridad que conviene cerrar igual), gates 2-3 la semana que viene, gate 4 con tiempo de prueba real antes de que abra la inscripción de R9.

### E.5 Lo que **sí** se puede hacer para el viernes, sin riesgo

**Piloto de media vuelta**: se ejercita la mitad nueva y R8 queda intacta.

1. **Gate 0 + Gate 1** (5 h) — deuda de seguridad, va igual.
2. **Gate 2 + Gate 3** (10 h) — el entrenador de confianza **se registra de verdad** y **Yesi lo aprueba de verdad**.
3. El entrenador entra al portal y **ve sus caballos** — primera vez que la ruta `fn_mis_entidades` corre en producción con datos reales. **Ése es el aprendizaje que vale.**
4. **Su inscripción a R8 la carga la secretaría como siempre.** Sin gate 4, sin riesgo sobre la ventana de inscripción.

Si eso sale limpio, el gate 4 para R9 arranca con el 80 % del riesgo ya despejado.

---

## Verificaciones pendientes que no pude hacer

| qué | por qué | cuándo |
|---|---|---|
| Config de GoTrue (`disable_signup`, `mailer_autoconfirm`, captcha, rate limits) | requiere Management API; el PAT ya fue borrado del VPS | Gate 0, por dashboard |
| Confirmar empíricamente que el signup está abierto | probarlo implicaría **crear una cuenta** = ejecutar un cambio | Gate 0 |
| Qué son las 2 cuentas huérfanas de `auth.users` | son anteriores al 11/05, probablemente pruebas | Gate 0 |

## Preguntas para Leo antes del Gate 2

1. **Programa público en la pantalla del pendiente**: ¿va en esta vuelta o alcanza con la pantalla de estado? (recomiendo lo segundo: menos superficie)
2. **Rechazo**: ¿alcanza con que Yesi avise por teléfono, o hace falta mail automático? (mail = template nuevo + circuito nuevo)
3. **Auto-registro de propietarios**: ¿entra desde el día uno o arrancamos sólo con entrenadores? Los propietarios matchean mejor (220/220 con DNI) pero son los que ven plata.
4. **`registro.html`** (alta de club auto-servicio): ¿lo revisamos aparte o lo damos de baja?
