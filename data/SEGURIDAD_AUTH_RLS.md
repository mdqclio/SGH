# Seguridad: RLS + alta de usuarios — estado y plan de cierre

**Fecha**: 2026-07-22 · **Branch**: `chore/rls-audit`
**Estado**: **diagnóstico consolidado + plan. NADA EJECUTADO.**
El toggle de sign up no fue tocado. No se modificó ninguna policy, tabla, página ni usuario.

> ⚠️ Repo público. Estos documentos describen **estado**, no credenciales: sin keys, secrets,
> tokens, UUIDs ni datos personales. Las cuentas se referencian por rol.

## Documentos

| Doc | Contenido |
|---|---|
| **Este** | Resumen ejecutivo de los dos diagnósticos + plan de cierre por fases |
| [`rls_audit.md`](rls_audit.md) | Auditoría RLS completa: 33 tablas, policies, key del frontend, hallazgos |
| [`auth_flow_audit.md`](auth_flow_audit.md) | Flujo real de alta de usuarios: páginas, código, evidencia forense |

---

# Parte 1 — Estado

## 1.1 RLS

**33/33 tablas de `public` con RLS ON.** Todas las policies apuntan al rol `authenticated`;
**ninguna nombra a `anon`**. Por eso la superficie anónima está cerrada: RLS habilitada sin
policy para `anon` = denegado por defecto.

Verificado contra producción con la key pública del frontend, no sólo por catálogo:

| Superficie | Resultado |
|---|---|
| Lecturas sobre tablas sensibles | 0 filas |
| Escrituras | Rechazadas (`42501`) |
| Vistas (`v_*`) | 0 filas — las 4 con `security_invoker = true` |
| RPCs de negocio | No ejecutables por `anon` |
| Schema `archive` | No expuesto al REST |

La verificación de escritura usó un discriminador **no mutante**: no se escribió ni modificó
ninguna fila durante la auditoría.

## 1.2 Hallazgos abiertos

| Sev | Hallazgo | Detalle |
|---|---|---|
| 🟠 MEDIA | **Cross-tenant entre autenticados** | `spcs`, `propietarios`, `profesionales`, `spc_propietarios` con `SELECT/UPDATE USING (true)` e `INSERT WITH CHECK (true)`. Cualquier usuario logueado de cualquier hipódromo lee y **escribe** los de otro. Ya hay 2 clubes activos |
| 🟡 BAJA | 9 helpers `fn_*` SECURITY DEFINER ejecutables por `anon` | Oráculo entidad→club. Sin fuga de contenido: `fn_is_super_admin()` da `false` y `fn_get_user_club_id()` da `null` para anónimos |
| 🟡 BAJA | `spc_entrenadores_hist` con RLS ON y 0 policies | Inaccesible para todos salvo `service_role`. Sin uso en el frontend. No es fuga: es lo contrario |
| 🔵 INFO | `archive.backup_*` sin policy | Fuera del REST, sin alcance |
| 🔵 INFO | Leaked password protection desactivada | Toggle de dashboard |

## 1.3 Alta de usuarios

**Ninguna de las cuatro páginas que llaman `auth.signUp()` completa su flujo.**

Bloqueo común: `public.usuarios.password_hash` es **NOT NULL sin DEFAULT** y ninguna de las
cuatro lo incluye en su `INSERT` → `23502`. Ningún trigger lo rellena (los dos que existen
sobre la tabla son log de auditoría y un guard de UPDATE). Es un vestigio de un diseño
anterior a Supabase Auth: la autenticación real vive en `auth.users`.

| Página | Enlazada | Primitivo | Funciona |
|---|---|---|---|
| `registro.html` | **No** (huérfana) | `signUp` | No — muere insertando en `clubs` |
| `registro-profesional.html` | **Sí**, desde `login.html` | `signUp` | No — RLS + `club_id` NOT NULL + `password_hash` |
| `usuarios.html` | Sí (admin) | `signUp` | No — `password_hash` |
| `admin.html` | Sí (admin) | `signUp` | No — `password_hash` |

**El alta real es manual**: Dashboard de Auth (add user con auto-confirm) + `INSERT` directo
por SQL en `public.usuarios`. Los 3 usuarios operativos tienen esa firma. Los 2 huérfanos de
`auth.users` tienen firma de `signUp` con el insert fallido.

**Efecto vivo**: un club quedó `activo` con **0 usuarios**. Nadie puede operarlo.

## 1.4 Pregunta que ordena la prioridad

Si el registro público está habilitado, cualquiera se auto-registra, pasa a `authenticated`
y el hallazgo 🟠 deja de ser "entre hipódromos" para ser alcanzable desde internet.

`registro-profesional.html` está viva en producción y enlazada desde el login. Que hoy falle
es un accidente del schema, **no un control de seguridad**.

**Se verifica en Dashboard → Authentication → Providers → Email → "Enable sign ups".**

---

# Parte 2 — Plan de cierre

Nada de esto está ejecutado. Cada fase es independiente y reversible.

**Regla que gobierna todo el plan**: endurecer mal la RLS o el alta deja a la secretaría sin
poder trabajar. Toda fase que toque policies o auth necesita **su probe en `tests/` antes de
ir a prod**, con el patrón real-code de `tests/README.md` (sin browser, reunión descartable
y teardown en la misma corrida).

## Fase 0 — Verificación previa (sin cambios)

1. Confirmar en el Dashboard si "Enable sign ups" está prendido. Define la urgencia del resto.
2. `grep` de `.from('propietarios')` y `.from('profesionales')` en todas las páginas, para
   saber qué pantallas asumen ver todos los registros y no sólo los del club. Es el insumo
   de la Fase 4.

## Fase 1 — Edge Function de alta de usuarios

**Objetivo**: reemplazar `auth.signUp()` por invitación desde el servidor, para que el
registro público pueda quedar apagado de forma permanente.

- Edge Function que reciba `{email, nombre_completo, rol, club_id, telefono}` y ejecute
  `auth.admin.inviteUserByEmail()` (o `createUser()`), más el `INSERT` en `public.usuarios`.
- La secret key va **sólo por variable de entorno de la función** (`SUPABASE_SECRET_KEY`).
  Nunca en el repo ni en el frontend.
- Autorización dentro de la función: validar el JWT del que llama y exigir `super_admin`
  contra `public.usuarios`. **No confiar en el `club_id` que venga del cliente.**
- `usuarios.html` y `admin.html` pasan a invocar la función en lugar de `signUp`.

**Riesgo**: bajo — hoy ninguna de las dos pantallas funciona, así que no hay regresión posible.
**Verificación**: probe que invoque la función con un usuario de prueba, valide que quedó la
fila en `public.usuarios` y la invitación en `auth.users`, y borre ambos en el `finally`.
**Rollback**: revertir el commit del frontend; la función queda sin usar.

## Fase 2 — Desbloquear `password_hash`

**Objetivo**: sacar el vestigio que rompe todo `INSERT` en `usuarios`.

- Migración: `password_hash` a nullable, o con `DEFAULT ''`. La columna no se usa para
  autenticar; la decisión de fondo (dropearla) queda para una tanda propia.

**Riesgo**: nulo — hoy nadie inserta con éxito, no hay comportamiento que romper.
**Verificación**: la de Fase 1 deja de necesitar el workaround.
**Rollback**: `SET NOT NULL` de vuelta (las filas existentes ya tienen valor).

## Fase 3 — Apagar el registro público

**Objetivo**: cerrar el auto-registro anónimo.

- Dashboard → Authentication → Providers → Email → **desactivar "Enable sign ups"**.
- Sacar el enlace a `registro-profesional.html` de `login.html`.

**Riesgo**: nulo para la operación. El login usa `signInWithPassword`, **independiente del
toggle**. Las cuentas existentes no se ven afectadas.

> **Se puede adelantar a la Fase 0 sin costo alguno**, porque hoy no hay ningún flujo de
> alta que funcione y que dependa del toggle. La única razón para dejarlo después de la
> Fase 1 es no quedarse sin ninguna vía de alta en el ínterin — pero esa vía hoy es el
> Dashboard, no la app. Si se quiere cerrar la exposición cuanto antes, esta fase va primero.

**Rollback**: volver a prender el toggle. Inmediato.

## Fase 4 — Cerrar el cross-tenant (hallazgo 🟠)

**Objetivo**: que un hipódromo no pueda leer ni escribir los datos del otro.

Ordenado por riesgo:

| Tabla | Acción propuesta | Riesgo |
|---|---|---|
| `propietarios`, `profesionales` | Acotar a `club_id = fn_get_user_club_id()` en SELECT/UPDATE/INSERT/DELETE, con el patrón que ya usan otras 10 tablas | **Medio** — si alguna pantalla asume ver todos (p. ej. el buscador de Pagos), se vacía. Depende del grep de la Fase 0 |
| `spc_propietarios` | Acotar vía `fn_club_de_*` o por el club del propietario | Medio |
| `spcs` | **Sólo el `UPDATE`.** Dejar `SELECT USING (true)` | **Alto** — los SPCs son globales por diseño (gotcha #13) y las inscripciones cruzan hipódromos. Un filtro por club en el SELECT rompe el alta de ejemplares |

**Verificación**: probe con dos contextos (usuarios de clubes distintos) que confirme que
cada uno ve y modifica sólo lo suyo, y que las pantallas que hoy funcionan siguen cargando.
**Rollback**: las policies anteriores quedan versionadas en `migrations/`; restaurarlas es
un `DROP POLICY` + `CREATE POLICY` con el texto viejo.

## Fase 5 — Superficie anónima residual (hallazgo 🟡)

- `REVOKE EXECUTE` de los 9 helpers `fn_*` para `anon`.

**Riesgo**: bajo. Las policies los invocan como SECURITY DEFINER **desde adentro**, no vía
RPC, así que revocar el EXECUTE público no debería afectarlas.
**Verificación**: probe que confirme que las pantallas principales siguen leyendo después
del revoke. Es el chequeo que decide si esta fase es tan barata como parece.
**Rollback**: `GRANT EXECUTE` de vuelta.

## Fase 6 — Housekeeping

- **Páginas huérfanas**: decidir el destino de `registro.html` (sin enlaces) y
  `registro-profesional.html` (enlazada pero no funcional). Borrarlas o marcarlas
  explícitamente como no operativas. Actualizar `CLAUDE.md` y `docs/ISSUES.md`, que hoy
  afirman que `registro-profesional.html` "no existe" cuando está desplegada.
- **2 auth users huérfanos**: sin fila en `public.usuarios`, no pueden operar
  (`fn_get_user_club_id()` les da `null`). Borrarlos o completarles la fila.
- **Club con 0 usuarios**: decidir si se le crea su usuario administrador (con la Fase 1 ya
  hecha) o se desactiva. **Decisión de producto, para Fede.**
- **`spc_entrenadores_hist`**: darle policy o dropearla.
- **`CLUB_ID` de `supabase.js`** apunta al club de demo, que está inactivo. Confirmar si lo
  pisa un `CLUB_ID` inline en cada HTML; si alguna página usa el del archivo compartido,
  está apuntando a un club inactivo.
- **Leaked password protection**: activar en el Dashboard.

---

## Orden recomendado

```
Fase 0 (verificar)
   └─> Fase 3 (apagar sign up + sacar link)      ← se puede adelantar acá, sin costo
        └─> Fase 2 (password_hash)
             └─> Fase 1 (Edge Function + invite)
                  └─> Fase 4 (cross-tenant)      ← la más delicada, con probe de 2 contextos
                       └─> Fase 5 (revoke fn_*)
                            └─> Fase 6 (housekeeping)
```

Las fases 0, 2, 3 y 6 no tienen riesgo operativo. La 1 es construcción nueva sobre algo que
hoy no funciona. **La 4 es la única que puede dejar a Yesica o Fede sin poder trabajar**, y
es la que exige el probe más serio antes de tocar producción.
