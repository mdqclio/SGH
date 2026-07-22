# Flujo real de alta de usuarios — SGH

**Fecha**: 2026-07-22 · **Tipo**: diagnóstico read-only
**Estado**: ningún cambio aplicado. El toggle de sign up NO fue tocado.
**Contexto**: complementa [`rls_audit.md`](rls_audit.md), que dejó abierta la pregunta de si
el registro público está habilitado y qué depende de él.

> ⚠️ Repo público. Describe **estado**, no credenciales: sin keys, secrets ni tokens.
> Los emails personales y los nombres de personas físicas van redactados; las cuentas
> institucionales se referencian por rol.

---

## VEREDICTO

**Apagar "Allow new users to sign up" no rompe ningún flujo que hoy funcione.**

El alta real de usuarios **no depende del registro público**: se hace a mano, fuera de la
aplicación (Dashboard de Auth + `INSERT` directo en `public.usuarios`). Ninguna de las cuatro
páginas que llaman a `auth.signUp()` completa su flujo hoy — todas fallan por un bloqueo
estructural de schema, no por RLS ni por el toggle.

El login de la secretaría usa `signInWithPassword`, que es **independiente** del toggle.
Las cuentas existentes siguen funcionando igual.

Lo que sí cierra apagarlo: la puerta de auto-registro anónimo que hoy está abierta desde la
pantalla de login. Es el vector que en `rls_audit.md` convertía el hallazgo 🟠 (cross-tenant
entre autenticados) en algo alcanzable desde internet.

**Advertencia para más adelante**: cuando se arregle el alta de usuarios, las pantallas de
admin **sí van a necesitar el toggle prendido**, porque usan `signUp`. Ver la sección final.

---

## 1. ¿Están enlazadas?

| Página | Enlace entrante desde la app | Estado |
|---|---|---|
| `registro-profesional.html` | **Sí** — desde `login.html`: *"¿Sos propietario o entrenador? Registrate acá"* | Link vivo en la pantalla de login |
| `registro.html` | **No** — cero referencias desde cualquier `.html` o `.js` | **Huérfana**: sólo alcanzable escribiendo la URL |

Las apariciones de `registro.html` en el repo son todas de documentación (`README.md`,
`docs/MODULOS.md`, `docs/ESTADO.md`, `docs/GOTCHAS.md`, `docs/DECISIONES.md`,
`docs/AUDITORIA_2026-05-19.md`). Ninguna es navegación.

**Corrección a la documentación**: `CLAUDE.md` dice *"portal.html / registro-profesional.html:
no construidos"* y `docs/ISSUES.md` (ISSUE de portal) dice *"registro-profesional.html (no
existe)"*. **Sí existe**: ~15 KB, desplegada en producción y enlazada desde el login. Esa
nota quedó vieja y conviene corregirla.

## 2. Qué hace cada una y si funciona

Las dos hacen auto-registro genuino con `auth.signUp()` y la key pública, sin admin de por medio.

### `registro.html` — alta autoservicio de hipódromo

Secuencia: `insert clubs` → `signUp` → `insert usuarios` → `insert categorias_carrera`.

**No funciona.** Falla en el paso 1: un anónimo no puede insertar en `clubs`
(`WITH CHECK fn_is_super_admin()` → falso). Aunque pasara, moriría en el paso 3 por el
bloqueo de `password_hash` (abajo).

### `registro-profesional.html` — auto-registro público de propietario/entrenador

Secuencia: `signUp` → `insert usuarios` (con `club_id: null`, `estado: 'pendiente'`,
`activo: false`) → `insert propietarios` o `profesionales`.

**No funciona, por tres motivos independientes:**

1. La policy `usuarios_insert` exige `fn_is_super_admin()` → un anónimo recibe `42501`.
2. Inserta `club_id: null`, pero **`usuarios.club_id` es NOT NULL**.
3. El bloqueo de `password_hash`.

### El bloqueo que rompe las cuatro páginas

```
public.usuarios.password_hash  →  NOT NULL, sin DEFAULT
```

**Ninguna de las cuatro páginas incluye `password_hash` en su `INSERT`.** Cualquier alta
desde la aplicación muere con `23502 null value in column "password_hash"`.

Verificado que nada lo rellene automáticamente:

- Triggers sobre `public.usuarios`: sólo `trg_audit_usuarios` (log de auditoría) y
  `trg_proteger_rol_club_id_usuario`, que es un guard de **UPDATE** (compara contra `OLD`)
  y no toca la columna.
- No hay ningún trigger sobre `auth.users` que propague a `public.usuarios`.

La columna es un **vestigio de un diseño anterior a Supabase Auth**: de los 3 usuarios
cargados, dos comparten un mismo valor corto que no tiene forma de bcrypt y el tercero tiene
string vacío. La autenticación real vive en `auth.users`; esta columna no se usa para nada.

## 3. Flujo de admin para crear usuarios

Existen dos pantallas, y **ambas usan el mismo primitivo `auth.signUp()`** — no invitación,
no Admin API, no inserción directa:

| Pantalla | Qué hace | Secuencia |
|---|---|---|
| `usuarios.html` | El super_admin crea usuarios del club | `signUp` → `insert usuarios` |
| `admin.html` | Crea un hipódromo y su usuario administrador | `insert clubs` → `signUp` → `insert usuarios` → `insert categorias_carrera` |

Ninguna usa `auth.admin.createUser()` ni `inviteUserByEmail()`, y **no podrían**: esos
métodos requieren la secret key, que no puede vivir en un frontend estático servido por
GitHub Pages.

Las dos fallan hoy en el `insert usuarios` por `password_hash`. En `usuarios.html` la RLS
sí las dejaría pasar (el super_admin cumple `fn_is_super_admin()`); el bloqueo es de schema.

## 4. Cómo se crearon los usuarios existentes

Hay **5 filas en `auth.users` y 3 en `public.usuarios`**. Los metadatos separan las dos
poblaciones de forma inequívoca.

| Cuenta | Rol en la app | `confirmation_sent_at` | Email confirmado | Metadata | Último login |
|---|---|---|---|---|---|
| cuenta de administración | `super_admin` | `null` | ✅ | mínima | jun 2026 |
| cuenta de Dolores | `secretario_carreras` | `null` | ✅ | mínima | **jul 2026** |
| cuenta de operación | `operador` | `null` | ✅ | mínima | may 2026 |
| cuenta de San Francisco | **sin fila** | abr 2026 | ❌ | trae `nombre` | nunca |
| cuenta personal *(email omitido)* | **sin fila** | abr 2026 | ❌ | trae `nombre_completo` | nunca |

**Los 3 que funcionan** tienen `confirmation_sent_at = null`, el email ya confirmado y
metadata mínima (`email_verified: true` y nada más). Esa es la firma de
**Dashboard → Add user → Auto Confirm User**, acompañada de un `INSERT` directo por SQL en
`public.usuarios` — que es lo único que pudo suministrar el `password_hash` obligatorio.
**Ninguno pasó por `signUp`.**

**Los 2 huérfanos** tienen `confirmation_sent_at` seteado, el email sin confirmar y metadata
con exactamente las claves que las páginas pasan en `options.data`. Esa es la firma de
`signUp` desde la aplicación: creó el usuario de auth y después falló el `insert usuarios`,
dejando la cuenta a mitad de camino.

Se puede atribuir cada huérfano a su página de origen:

- **Cuenta de San Francisco → `registro.html`.** Es la única página que pasa la clave
  `nombre` en `options.data` (las otras usan `nombre_completo`). Y la cronología lo cierra:
  el club *"Jockey Club San Francisco"* se creó **396 ms antes** del `confirmation_sent_at`
  de esa cuenta. Es el paso 1 → paso 2 de esa página, en abril de 2026.
- **Cuenta personal → `admin.html` o `usuarios.html`.** Ambas usan `nombre_completo`; la
  metadata no permite distinguir cuál de las dos.

**Consecuencia visible que sigue en producción**: el club de San Francisco quedó `activo`
con **0 usuarios**. Nadie puede entrar a operarlo. Es el residuo de ese intento fallido.

---

## Qué hacer con esto

Orden sugerido, del más seguro al más invasivo:

| # | Acción | Rompe algo | Nota |
|---|---|---|---|
| 1 | **Apagar el sign up público** | No | Cierra el auto-registro anónimo. El login existente no se ve afectado |
| 2 | **Sacar el link a `registro-profesional.html` de `login.html`** | No | Si no, el formulario pasa a fallar con un error críptico de Auth en vez del `42501` de RLS |
| 3 | Decidir el destino de `registro.html` (huérfana) y `registro-profesional.html` | No | Borrarlas o marcarlas explícitamente como no operativas |
| 4 | `password_hash` nullable o con DEFAULT | No (hoy nadie inserta con éxito) | Desbloquea `usuarios.html` y `admin.html` |
| 5 | Mover el alta a Edge Function con `inviteUserByEmail()` / `createUser()` | — | Permite dejar el sign up apagado **para siempre** |
| 6 | Limpiar los 2 auth users huérfanos y resolver el club sin usuarios | No | Housekeeping |

**El punto 5 es el que cierra el círculo.** Si sólo se hace el 4, las pantallas de admin van
a necesitar el toggle prendido otra vez, porque siguen usando `signUp` — y eso reabre el
auto-registro público, que es justo lo que se quiere evitar. El primitivo correcto para que
un admin cree usuarios es la invitación desde el servidor, no el registro autoservicio.
