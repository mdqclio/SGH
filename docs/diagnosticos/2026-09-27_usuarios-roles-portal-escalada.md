# Usuarios — personal vs portal en la lista y quién puede cambiar el rol (SOLO LECTURA)

- Fecha: 2026-09-27
- Código leído en: `main` @ `4d95511d4212bb30a7c18fb7a7045d7a2cfe458b` (`usuarios.html`, `index.html`, `supabase/functions/invite-user/index.ts`)
- Base: proyecto `unlhcuanfrtpatoipwve`, por MCP `execute_sql`, **sólo SELECT** (catálogo + `usuarios` + `auditoria`)
- Guards: `pwd` → `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` → **210** · ref → `unlhcuanfrtpatoipwve`
- No se tocó nada: ni código, ni base, ni migraciones.
- **PII**: el repo es público. En las salidas crudas de abajo los correos de personas reales van
  enmascarados (`x***@dominio`). Las cuentas genéricas que ya figuran en `CLAUDE.md`
  (`admin@sgh.com`, `dolores@sgh.com`, `yesica@sgh.com`) y las de probe (`*.invalid`, `*@sgh.test`)
  van sin enmascarar. Es la única alteración de la salida; filas y columnas están completas.

---

## Resumen

| # | Pregunta | Respuesta corta |
|---|---|---|
| 1 | Filas por club y rol | **24** filas. Dolores: 2 secretario_carreras, 3 operador, **14 profesional, 4 propietario**. Mi Club Hípico: 1 super_admin. **Portal = 18 de 23** filas de Dolores (78 %). |
| 2 | ¿Qué protege el cambio de rol? | **La base lo protege, la pantalla no.** RLS: UPDATE sólo sobre la fila propia o si sos super_admin. Además **dos** triggers BEFORE UPDATE rechazan cambiar `rol`/`club_id` (y entidad / auth_user_id) si no sos super_admin. Un operador o secretario **no puede** ponerse super_admin ni ascender a otro. |
| 3 | ¿Alguien fue ascendido? | **No.** Cero UPDATE de `usuarios` con cambio de `rol` en `auditoria` (17 UPDATE en total, ninguno toca `rol`). Los 24 usuarios vivos tienen hoy el mismo rol con el que se dieron de alta (los 20 que tienen INSERT auditado). Límite: el trigger de auditoría sobre `usuarios` registra desde el **2026-07-23**; `admin@sgh.com`, `dolores@sgh.com` y `yesica@sgh.com` son anteriores. |
| 4 | ¿Quién ve la pantalla? | **Todo el staff**, no sólo super_admin. `index.html` muestra "Usuarios" en el menú de secretario_carreras y operador. `usuarios.html` **no chequea rol** en `initAuth`: cualquier usuario con club (incluido uno de portal) la abre por URL; la RLS le devuelve sólo su propia fila. |
| 5 | Propuesta | Dos secciones (Personal / Portal), modal de rol con opciones según quién edita, rol de portal no editable desde acá. Detalle abajo. |

**Hallazgos de costado (no pedidos, relevantes):**

- **H1 — Botones placebo para secretario/operador.** "Guardar cambios" y "Desactivar/Activar" sobre
  la fila de **otra** persona: la RLS `usuarios_update` filtra la fila (USING falso) → PostgREST
  hace `UPDATE … 0 rows` **sin error** → la pantalla muestra "Usuario actualizado" / "Usuario
  desactivado" y no cambió nada. Un secretario que cree haber dado de baja a alguien **no lo dio
  de baja**. (Deducido de la política + el código de `saveEdit`/`toggleActivo`, que sólo miran
  `error`; no se ejecutó para no escribir.)
- **H2 — Sobre su propia fila** un secretario/operador sí puede escribir `nombre_completo`,
  `telefono`, `email`, `activo`, `estado`, `ultimo_login`, `created_at`, `password_hash`. Puede
  auto-desactivarse. Si en el modal cambia su propio rol, el trigger tira
  `Solo super_admin puede cambiar el rol de un usuario` (el toast muestra el mensaje).
- **H3 — `fn_is_super_admin()` no mira `activo`.** Un super_admin desactivado sigue pasando todas
  las políticas y los dos triggers. Hoy hay uno solo y está activo; es deuda, no incidente.
- **H4 — Ni service_role puede cambiar un rol.** `fn_proteger_rol_club_id_usuario` no es SECURITY
  DEFINER y no exceptúa `auth.uid() IS NULL`: desde service_role / postgres (uid nulo)
  `fn_is_super_admin()` da false → excepción. `fn_usuarios_guard_privilegios` sí deja pasar uid
  nulo, pero el otro trigger corta igual. Consecuencia: un cambio de rol legítimo hoy sólo lo
  puede hacer un super_admin **logueado** (o una migración que deshabilite el trigger). Deducido
  del código de la función, no ejecutado.
- **H5 — Grants de tabla amplios.** `anon` y `authenticated` tienen `INSERT, UPDATE, DELETE,
  TRUNCATE, …` sobre `usuarios` (y UPDATE por columna, incluida `password_hash`). Lo que frena es
  la RLS (habilitada, **no forzada**; ninguna política para `anon`). `TRUNCATE` **no pasa por RLS**
  — ver pregunta abierta Q3.
- **H6 — XSS latente**: `renderTable` mete `nombre_completo`, `telefono`, `email` en `innerHTML`
  sin escapar, y `openEdit(${JSON.stringify(u)})` en un atributo `onclick='…'`. Los usuarios de
  portal **se dan de alta ellos mismos** (solicitar-acceso) → escriben su propio nombre → se
  renderiza en la pantalla del staff. Es ISSUE-018, pero acá la fuente es un tercero sin
  privilegios y la víctima es staff. Una comilla simple en el nombre ya rompe el `onclick`.
- **H7 — Selects de rol del modal.** Crear: secretario_carreras / operador. Editar: secretario /
  operador / **super_admin**. Para una fila `profesional`/`propietario`, `openEdit` hace
  `e-rol.value = 'profesional'`, que no es opción → el `<select>` queda **sin selección**
  (`value === ''`) y `saveEdit` manda `update({rol: ''})`. Para super_admin eso da error de enum (`invalid input value for enum
  rol_usuario: ""`) al tocar **sólo el nombre o el teléfono** de un usuario de portal. Para
  secretario, la fila es ajena → 0 filas, "actualizado" (H1). Deducido del código; no ejecutado.

---

## 1. Filas por club y rol

```sql
select c.nombre club, u.rol, count(*) n, count(*) filter (where u.activo) activos
from usuarios u left join clubs c on c.id=u.club_id group by 1,2 order by 1 nulls first,2;
```

```
club                  | rol                 | n  | activos
Hipódromo de Dolores  | secretario_carreras | 2  | 2
Hipódromo de Dolores  | operador            | 3  | 3
Hipódromo de Dolores  | profesional         | 14 | 14
Hipódromo de Dolores  | propietario         | 4  | 4
Mi Club Hípico        | super_admin         | 1  | 1
```

Totales: 24 filas. Personal (super_admin + secretario + operador) = 6. **Portal (profesional +
propietario) = 18**, todos de Dolores, todos activos. No hay `publico` ni filas sin club.

Detalle por usuario (rol de hoy vs rol con el que se auditó el INSERT):

```sql
select u.email, u.rol rol_hoy, c.nombre club, u.created_at, u.activo, u.estado,
 (select a.datos_despues->>'rol' from auditoria a where a.tabla='usuarios' and a.accion='INSERT' and a.registro_id=u.id order by a.created_at limit 1) rol_al_alta,
 u.entidad_tipo
from usuarios u left join clubs c on c.id=u.club_id order by (u.rol in ('profesional','propietario')), u.rol, u.email;
```

```
email                          | rol_hoy             | club                 | created_at                    | activo | estado | rol_al_alta         | entidad_tipo
admin@sgh.com                  | super_admin         | Mi Club Hípico       | 2026-04-22 00:50:10.452282+00 | true   | activo | null                | null
dolores@sgh.com                | secretario_carreras | Hipódromo de Dolores | 2026-04-22 02:07:42.769327+00 | true   | activo | null                | null
f***@gmail.com                 | secretario_carreras | Hipódromo de Dolores | 2026-08-07 04:50:25.256848+00 | true   | activo | secretario_carreras | null
k***@gmail.com                 | operador            | Hipódromo de Dolores | 2026-08-16 20:33:33.982272+00 | true   | activo | operador            | null
v***@hotmail.com               | operador            | Hipódromo de Dolores | 2026-08-16 13:06:48.885596+00 | true   | activo | operador            | null
yesica@sgh.com                 | operador            | Hipódromo de Dolores | 2026-05-11 02:46:51.159296+00 | true   | activo | null                | null
d***@gmail.com                 | profesional         | Hipódromo de Dolores | 2026-09-24 02:25:44.234639+00 | true   | activo | profesional         | profesional
f***@gmail.com                 | profesional         | Hipódromo de Dolores | 2026-09-27 19:20:00.820996+00 | true   | activo | profesional         | profesional
f***@gmail.com                 | profesional         | Hipódromo de Dolores | 2026-09-10 22:17:42.269871+00 | true   | activo | profesional         | profesional
h***@gmail.com                 | profesional         | Hipódromo de Dolores | 2026-08-19 16:20:49.852203+00 | true   | activo | profesional         | profesional
l***@gmail.com                 | profesional         | Hipódromo de Dolores | 2026-09-08 17:48:23.081555+00 | true   | activo | profesional         | profesional
l***@abc.gob.ar                | profesional         | Hipódromo de Dolores | 2026-09-10 22:14:09.761393+00 | true   | activo | profesional         | profesional
l***@gmail.com                 | profesional         | Hipódromo de Dolores | 2026-09-25 20:23:13.41878+00  | true   | activo | profesional         | profesional
m***@gmail.com                 | profesional         | Hipódromo de Dolores | 2026-09-08 17:48:56.225471+00 | true   | activo | profesional         | profesional
m***@gmail.com                 | profesional         | Hipódromo de Dolores | 2026-09-10 17:14:39.570792+00 | true   | activo | profesional         | profesional
o***@gmail.com                 | profesional         | Hipódromo de Dolores | 2026-09-10 23:12:15.405895+00 | true   | activo | profesional         | profesional
r***@hotmail.com               | profesional         | Hipódromo de Dolores | 2026-09-10 23:12:37.93376+00  | true   | activo | profesional         | profesional
r***@hotmail.com               | profesional         | Hipódromo de Dolores | 2026-09-11 15:17:09.882771+00 | true   | activo | profesional         | profesional
s***@gmail.com                 | profesional         | Hipódromo de Dolores | 2026-09-25 22:29:36.438819+00 | true   | activo | profesional         | profesional
s***@hotmail.com               | profesional         | Hipódromo de Dolores | 2026-09-10 22:15:30.34489+00  | true   | activo | profesional         | profesional
c***@gmail.com                 | propietario         | Hipódromo de Dolores | 2026-09-10 23:15:11.949781+00 | true   | activo | propietario         | propietario
f***@hotmail.com               | propietario         | Hipódromo de Dolores | 2026-09-07 21:08:09.352305+00 | true   | activo | propietario         | propietario
m***@yahoo.com.ar              | propietario         | Hipódromo de Dolores | 2026-09-08 17:48:47.849571+00 | true   | activo | propietario         | propietario
p***@gmail.com                 | propietario         | Hipódromo de Dolores | 2026-09-22 00:54:47.029768+00 | true   | activo | propietario         | propietario
```

Nota: una cuenta `profesional` usa un correo con el nombre del hipódromo (`h***@gmail.com`,
alta 2026-08-19). Puede ser una cuenta institucional dada de alta como portal por error o a
propósito — pregunta abierta Q1.

Qué ve cada perfil en la lista (política `usuarios_select`, abajo):

| Quien abre `usuarios.html` | Filas que devuelve la base |
|---|---|
| super_admin | las del club elegido en el switcher (o **todas** si no hay club) |
| secretario / operador de Dolores | las **23** de Dolores (5 personal + 18 portal) |
| profesional / propietario | sólo la suya |

---

## 2. Qué protege el cambio de rol

### 2.a Código de la pantalla (`main:usuarios.html`)

- `initAuth` (línea 205): exige sesión y fila en `usuarios`; **no mira el rol**. Sin club y no
  super_admin → afuera. Nada más.
- `load` (232): `sb.from('usuarios').select('*').order('nombre_completo')` + `.eq('club_id', CLUB_ID)`. Sin filtro por rol.
- Modal editar (185–189): opciones `secretario_carreras`, `operador`, `super_admin`. Se muestran
  igual a cualquiera que abra el modal.
- `saveEdit` (475–479): `update({nombre_completo, telefono, rol}).eq('id', id)`; sólo chequea `error`.
- `toggleActivo` (503–504): `update({activo, estado}).eq('id', id)`; sólo chequea `error`.

O sea: **la pantalla no protege nada**; todo descansa en la base.

### 2.b RLS

```sql
select relrowsecurity, relforcerowsecurity from pg_class where oid='public.usuarios'::regclass;
```
```
relrowsecurity | relforcerowsecurity
true           | false
```

```sql
select polname, polcmd, polpermissive, pg_get_expr(polqual,polrelid) using_expr, pg_get_expr(polwithcheck,polrelid) check_expr, array(select rolname from pg_roles where oid=any(polroles)) roles
from pg_policy where polrelid='public.usuarios'::regclass order by 1;
```
```
polname         | cmd | permissive | using_expr                                                                                                                                                   | check_expr                                                                                   | roles
usuarios_delete | d   | true       | ( SELECT fn_is_super_admin() AS fn_is_super_admin)                                                                                                             | null                                                                                         | {authenticated}
usuarios_insert | a   | true       | null                                                                                                                                                         | ( SELECT fn_is_super_admin() AS fn_is_super_admin)                                           | {authenticated}
usuarios_select | r   | true       | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (auth_user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))) | null | {authenticated}
usuarios_update | w   | true       | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (auth_user_id = ( SELECT auth.uid() AS uid)))                                                           | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (auth_user_id = ( SELECT auth.uid() AS uid))) | {authenticated}
```

**Quién puede hacer UPDATE sobre `usuarios`:**
- `super_admin`: cualquier fila.
- cualquier otro autenticado (secretario, operador, profesional, propietario): **sólo su propia fila** (`auth_user_id = auth.uid()`).
- `anon`: ninguna (no hay política para `anon`; RLS habilitada).
- `service_role` / `postgres`: bypassean RLS (pero ver H4 con los triggers).

INSERT y DELETE: sólo super_admin (las altas normales van por la Edge Function `invite-user`
con service_role, o por el flujo de solicitudes).

### 2.c Triggers

```sql
select tgname, tgenabled, pg_get_triggerdef(t.oid) from pg_trigger t where tgrelid='public.usuarios'::regclass and not tgisinternal;
```
```
tgname                           | tgenabled | pg_get_triggerdef
trg_audit_usuarios               | O         | CREATE TRIGGER trg_audit_usuarios AFTER INSERT OR DELETE OR UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()
trg_proteger_rol_club_id_usuario | O         | CREATE TRIGGER trg_proteger_rol_club_id_usuario BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_proteger_rol_club_id_usuario()
trg_usuarios_guard_privilegios   | O         | CREATE TRIGGER trg_usuarios_guard_privilegios BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_usuarios_guard_privilegios()
trg_usuarios_set_auth_user_id    | O         | CREATE TRIGGER trg_usuarios_set_auth_user_id BEFORE INSERT OR UPDATE OF email ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_usuarios_set_auth_user_id()
```

```sql
select p.proname, p.prosecdef, md5(pg_get_functiondef(p.oid)) md5, pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('fn_proteger_rol_club_id_usuario','fn_usuarios_guard_privilegios','fn_is_super_admin','fn_is_staff','fn_get_user_club_id','fn_usuarios_set_auth_user_id') order by 1;
```

```
fn_get_user_club_id | secdef=true | md5 008c2ef948e422dfaae9e71646448fef
CREATE OR REPLACE FUNCTION public.fn_get_user_club_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid() AND activo;
$function$

fn_is_staff | secdef=true | md5 3accbc759c7e8181632acbe72a0b993c
CREATE OR REPLACE FUNCTION public.fn_is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE auth_user_id = auth.uid()
      AND activo
      AND rol IN ('super_admin', 'secretario_carreras', 'operador')
  );
$function$

fn_is_super_admin | secdef=true | md5 8883124340bc670ef2a894ea47d55cce
CREATE OR REPLACE FUNCTION public.fn_is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE auth_user_id = auth.uid()
      AND rol = 'super_admin'
  );
$function$

fn_proteger_rol_club_id_usuario | secdef=false | md5 98ea5df016bc03c304b9268869ca66d2
CREATE OR REPLACE FUNCTION public.fn_proteger_rol_club_id_usuario()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT fn_is_super_admin() THEN
    IF NEW.rol IS DISTINCT FROM OLD.rol THEN
      RAISE EXCEPTION 'Solo super_admin puede cambiar el rol de un usuario';
    END IF;
    IF NEW.club_id IS DISTINCT FROM OLD.club_id THEN
      RAISE EXCEPTION 'Solo super_admin puede cambiar el club de un usuario';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$

fn_usuarios_guard_privilegios | secdef=true | md5 be16b76f45e8a9c56e037961722f01f1
CREATE OR REPLACE FUNCTION public.fn_usuarios_guard_privilegios()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF fn_is_super_admin() THEN RETURN NEW; END IF;

  IF NEW.rol          IS DISTINCT FROM OLD.rol
  OR NEW.club_id      IS DISTINCT FROM OLD.club_id
  OR NEW.entidad_tipo IS DISTINCT FROM OLD.entidad_tipo
  OR NEW.entidad_id   IS DISTINCT FROM OLD.entidad_id
  OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION
      'No autorizado: solo un super_admin puede cambiar rol, club, entidad o vinculo de Auth';
  END IF;

  RETURN NEW;
END;
$function$

fn_usuarios_set_auth_user_id | secdef=true | md5 8917e9ece0108f3ce1d91347ca829398
CREATE OR REPLACE FUNCTION public.fn_usuarios_set_auth_user_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.auth_user_id IS NULL AND NEW.email IS NOT NULL THEN
    SELECT a.id INTO NEW.auth_user_id
    FROM auth.users a
    WHERE lower(btrim(a.email)) = lower(btrim(NEW.email))
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$
```

### 2.d Grants

```sql
select grantee, string_agg(privilege_type, ',' order by privilege_type) privs from information_schema.role_table_grants where table_schema='public' and table_name='usuarios' group by 1 order by 1;
```
```
grantee       | privs
anon          | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
authenticated | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
postgres      | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
service_role  | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
```

```sql
select grantee, column_name, privilege_type from information_schema.column_privileges where table_schema='public' and table_name='usuarios' and grantee in ('anon','authenticated') and privilege_type='UPDATE' order by 1,2;
```
```
grantee       | column_name     | privilege_type
anon          | activo          | UPDATE
anon          | auth_user_id    | UPDATE
anon          | club_id         | UPDATE
anon          | created_at      | UPDATE
anon          | email           | UPDATE
anon          | entidad_id      | UPDATE
anon          | entidad_tipo    | UPDATE
anon          | estado          | UPDATE
anon          | id              | UPDATE
anon          | nombre_completo | UPDATE
anon          | password_hash   | UPDATE
anon          | rol             | UPDATE
anon          | telefono        | UPDATE
anon          | ultimo_login    | UPDATE
authenticated | activo          | UPDATE
authenticated | auth_user_id    | UPDATE
authenticated | club_id         | UPDATE
authenticated | created_at      | UPDATE
authenticated | email           | UPDATE
authenticated | entidad_id      | UPDATE
authenticated | entidad_tipo    | UPDATE
authenticated | estado          | UPDATE
authenticated | id              | UPDATE
authenticated | nombre_completo | UPDATE
authenticated | password_hash   | UPDATE
authenticated | rol             | UPDATE
authenticated | telefono        | UPDATE
authenticated | ultimo_login    | UPDATE
```

### 2.e Matriz resultante (qué pasa hoy si alguien aprieta "Guardar" con otro rol)

| Actor → fila | RLS UPDATE | Trigger | Resultado |
|---|---|---|---|
| operador/secretario → **su propia** fila, rol → super_admin | pasa (fila propia) | **excepción** en los dos | error, no cambia. ✅ protegido |
| operador/secretario → **otra** fila, rol → super_admin | fila filtrada (0 filas) | no corre | nada cambia, **toast "Usuario actualizado"** (H1) ✅ protegido, ❌ UI miente |
| profesional/propietario → su fila (por URL o API directa), rol → cualquiera | pasa | **excepción** | error. ✅ protegido |
| profesional/propietario → su fila, `club_id`/`entidad_*`/`auth_user_id` | pasa | excepción | ✅ protegido |
| super_admin → cualquier fila, cualquier rol | pasa | pasa | cambia. Esperado. |
| service_role / migración → cambio de rol | bypass | `fn_proteger_rol_club_id_usuario` **excepción** (uid nulo) | no se puede sin deshabilitar el trigger (H4) |
| anon | sin política | — | nada |

Conclusión 2: **hoy nadie que no sea super_admin puede ponerse ni poner a otro super_admin** (ni
ningún otro cambio de rol). La defensa es doble (RLS + dos triggers redundantes). El problema es
de pantalla: ofrece la acción, oculta que no pasó nada, y mezcla dos poblaciones.

### 2.f Edge Function `invite-user` (alta, no edición) — `main:supabase/functions/invite-user/index.ts`

```
59:const ROLES_VALIDOS = [
60:  'super_admin', 'secretario_carreras', 'operador', 'profesional', 'propietario', 'publico',
86:  super_admin: {
87:    puedeInvitar: new Set<Rol>(ROLES_VALIDOS),
90:  secretario_carreras: {
92:      'secretario_carreras',
93:      'operador',
94:      // v2 (portal de propietarios): sumar 'propietario' y 'profesional' acá.
100:  // operador / profesional / propietario / publico → sin entrada = 403.
319:    // §2.1 paso 3 — resolver el rol EN LA APP, por tabla, no por el JWT.
343:    const regla = REGLAS_POR_ROL_CALLER[String(caller.rol)];
386:    if (!regla.puedeInvitar.has(rol)) {
```

Ya existe una matriz de "quién puede dar qué rol" del lado del alta: super_admin → todos;
secretario → secretario u operador; operador → nadie. La edición no la replica en ningún lado.

---

## 3. ¿Alguien fue ascendido?

```sql
select a.created_at, a.accion, a.registro_id, a.usuario_id, ua.email actor_email, ua.rol actor_rol_hoy,
 a.datos_antes->>'email' email_antes, a.datos_antes->>'rol' rol_antes, a.datos_despues->>'rol' rol_despues,
 a.datos_antes->>'club_id' club_antes, a.datos_despues->>'club_id' club_despues
from auditoria a left join usuarios ua on ua.id=a.usuario_id
where a.tabla='usuarios' and a.accion ilike 'update%' and (a.datos_antes->>'rol') is distinct from (a.datos_despues->>'rol')
order by a.created_at;
```
```
[]   (0 filas)
```

```sql
select accion, count(*), min(created_at), max(created_at) from auditoria where tabla='usuarios' group by 1;
```
```
accion | count | min                           | max
INSERT | 595   | 2026-07-23 22:25:33.361264+00 | 2026-09-27 19:20:00.820996+00
UPDATE | 17    | 2026-08-01 04:29:05.944304+00 | 2026-09-22 17:13:10.047922+00
DELETE | 574   | 2026-07-23 22:25:35.135203+00 | 2026-09-25 20:53:12.031918+00
```

Los 17 UPDATE, con los campos que cambiaron:

```sql
select a.created_at, a.registro_id, ua.email actor, a.datos_antes->>'email' email,
 (select string_agg(k, ',' order by k) from jsonb_object_keys(a.datos_despues) k where a.datos_despues->k is distinct from a.datos_antes->k) campos_cambiados
from auditoria a left join usuarios ua on ua.id=a.usuario_id
where a.tabla='usuarios' and a.accion='UPDATE' order by a.created_at;
```
```
created_at                    | registro_id                          | actor            | email                                      | campos_cambiados
2026-08-01 04:29:05.944304+00 | 3a685a1a-3ff7-45dc-8af3-88f5c5f29377 | null             | admin@sgh.com                              | auth_user_id
2026-08-01 04:29:05.944304+00 | 9ac2d140-faec-424c-9437-0cedeb8b8b82 | null             | dolores@sgh.com                            | auth_user_id
2026-08-01 04:29:05.944304+00 | a1c490f5-81ee-4d9f-acb7-d2123e99e7d3 | null             | yesica@sgh.com                             | auth_user_id
2026-08-06 15:05:15.191881+00 | 46249991-c674-4aa2-838e-237f4914f7ff | null             | probe-g4-a-061vz2@sgh-probe.invalid        | auth_user_id
2026-08-06 15:05:15.428755+00 | 9230cfc4-0912-4e2e-8094-1dc8dbb330a2 | null             | probe-g4-b-061vz2@sgh-probe.invalid        | auth_user_id
2026-08-16 21:14:29.507047+00 | 2ed1427f-ef06-4f56-9a9d-75bae08047f8 | k***@gmail.com   | k***@gmail.com                             | activo,estado
2026-08-18 15:03:03.030174+00 | b269e008-5d5a-444b-9f80-5f0caf0a7695 | null             | v***@hotmail.com                           | activo
2026-08-23 22:37:37.39058+00  | b269e008-5d5a-444b-9f80-5f0caf0a7695 | null             | v***@hotmail.com                           | estado
2026-08-23 22:42:55.437462+00 | ae243acf-1295-4e2e-a08a-7d48c142550e | f***@gmail.com   | f***@gmail.com                             | activo,estado
2026-08-30 19:32:17.62324+00  | b3316377-59c9-45e7-bda7-c57900e7484c | null             | probe.065.mtg7hc3u@sgh.test                | auth_user_id
2026-09-22 17:08:39.966553+00 | 3019c3a7-a1c1-410a-b559-9d6284fcdae3 | null             | probe.guard.superadmin.mucxh8gy@sgh.test   | auth_user_id
2026-09-22 17:08:40.46681+00  | d46d5cd1-77f6-410d-bf7b-97de7581e47e | null             | probe.guard.secretario.mucxh8gy@sgh.test   | auth_user_id
2026-09-22 17:08:40.922218+00 | c17607ac-afac-4356-bc70-374097b5d27e | null             | probe.guard.operador.mucxh8gy@sgh.test     | auth_user_id
2026-09-22 17:13:05.934806+00 | 38975b8b-2967-4a7a-ae97-be0964b13b41 | null             | probe.guard.superadmin.mucxm5uo@sgh.test   | auth_user_id
2026-09-22 17:13:06.919111+00 | 4d200770-1957-438c-bc74-78a901dfb473 | null             | probe.guard.secretario.mucxm5uo@sgh.test   | auth_user_id
2026-09-22 17:13:07.836925+00 | 99b149e4-7cf9-447d-a3a2-6c12a744c942 | null             | probe.guard.operador.mucxm5uo@sgh.test     | auth_user_id
2026-09-22 17:13:10.047922+00 | 656c0d80-55d7-47a5-94d7-f609f6a34be4 | null             | probe.guard.portal.mucxm5uo@sgh.test       | auth_user_id
```

Ninguno toca `rol` ni `club_id`. Los de `activo,estado` con actor = la misma persona son la
auto-activación de invitados (`activacion-pendiente.js`).

INSERT por rol y cuántos siguen vivos:

```sql
select a.datos_despues->>'rol' rol_insert, count(*), count(*) filter (where exists(select 1 from usuarios u where u.id=a.registro_id)) sigue_viva
from auditoria a where a.tabla='usuarios' and a.accion='INSERT' group by 1 order by 1;
```
```
rol_insert          | count | sigue_viva
operador            | 56    | 2
profesional         | 265   | 14
propietario         | 64    | 4
secretario_carreras | 168   | 1
super_admin         | 42    | 0
```

Los 42 INSERT de super_admin son de probes y **ninguno sigue vivo**. El único super_admin vivo
(`admin@sgh.com`) es de 2026-04-22, anterior a la auditoría de la tabla.

```sql
select min(created_at) primer_evento_auditoria, count(*) total from auditoria;
```
```
primer_evento_auditoria       | total
2026-05-13 00:08:54.037211+00 | 18299
```

Pero el primer evento de `tabla='usuarios'` es del 2026-07-23 → **antes del 23/07 no hay rastro**
de cambios en `usuarios`. Para las tres cuentas anteriores (`admin@`, `dolores@`, `yesica@`) no se
puede afirmar por auditoría que nunca cambiaron de rol antes de esa fecha; sus roles de hoy
coinciden con los documentados en `CLAUDE.md`.

Conclusión 3: **no hubo ningún ascenso (ni descenso) auditado. Cero.**

---

## 4. ¿Quién accede a la pantalla?

`main:index.html`:
- Rama `super_admin` (línea 308): menú "Administración" → Usuarios.
- Rama `else` (361, comentario "secretario_carreras, operador y cualquier otro rol con club"):
  menú "Administración" → **Usuarios**, Solicitudes, Mi Hipódromo, Auditoría. Mismo módulo card
  "Gestión de usuarios del hipódromo".
- Rama `propietario || profesional` (301): van al portal, no ven el menú.

`main:usuarios.html:205` (`initAuth`): sin chequeo de rol. Un profesional/propietario que tipee
`/usuarios.html` entra; la RLS le muestra sólo su fila; puede editar su nombre/teléfono; el rol no
(trigger).

Conclusión 4: **accesible para operador y secretario** (desde el menú), y para portal por URL.

---

## 5. Propuesta (sin implementar)

### 5.a Lista separada

- Dos secciones en la misma pantalla, o dos pestañas: **Personal del hipódromo**
  (`rol in ('super_admin','secretario_carreras','operador')`) y **Usuarios del portal**
  (`rol in ('profesional','propietario','publico')`). Contador en cada una (hoy 5 / 18 en Dolores).
- Portal con columnas propias: tipo (Entrenador / Propietario), **ficha vinculada**
  (`entidad_tipo` + `entidad_id` → nombre del profesional o propietario, link a su ficha),
  estado, fecha de alta. Sin selector de rol.
- Filtro en la query (no sólo en el render), para que no dependa del orden.
- El alta de portal ya tiene su circuito (`solicitudes.html`); desde Usuarios, portal = sólo
  ver, activar/desactivar y (si hace falta) reenviar acceso.

### 5.b Quién puede asignar qué (edición = misma matriz que ya usa `invite-user` para el alta)

| Quien edita | Puede asignar | Sobre quién |
|---|---|---|
| super_admin | cualquiera | cualquiera (incluido cambiar personal ↔ portal, con confirmación explícita) |
| secretario_carreras | `secretario_carreras`, `operador` | sólo personal de **su** club; **nunca** super_admin, nunca a sí mismo |
| operador | nada | sólo ve la lista (o no ve la pantalla — decisión de producto) |
| profesional / propietario | nada | no entran a la pantalla |

Rol de portal ↔ personal: **sólo super_admin**, porque además del rol hay que desenganchar /
enganchar `entidad_tipo`/`entidad_id` y eso hoy ya está reservado a super_admin por trigger.

**Opción conservadora** (recomendada si hay que elegir ya): no abrir nada nuevo en la base —
**ningún** no-super_admin cambia roles, que es lo que la base ya hace hoy— y sólo arreglar la
pantalla: separar listas, mostrar el selector de rol **únicamente** a super_admin, sacar
"Editar"/"Desactivar" de las filas que la RLS no deja escribir, y fallar en voz alta cuando el
UPDATE devuelve 0 filas (`.select()` después del `update` y chequear longitud). Habilitar que el
secretario promueva operador → secretario requeriría una RPC con guard (no aflojar la RLS) —
decisión de producto, pendiente.

### 5.c Lo que haría falta tocar (cuando se apruebe)

1. `usuarios.html`: dos listas; selector de rol condicionado a `currentUser.rol`; opciones según
   la tabla 5.b; filas de portal sin rol editable; `update(...).select('id')` y error si 0 filas
   (H1); sacar `rol` del payload cuando no cambió (H7); escapar `innerHTML` y sacar el
   `onclick='${JSON.stringify(u)}'` (H6).
2. `usuarios.html` `initAuth`: rebotar a portal/index si el rol no es staff.
3. Base (aparte, con su migración y probe): `fn_is_super_admin` con `AND activo` (H3);
   `fn_proteger_rol_club_id_usuario` exceptuar uid nulo o fusionarla con la otra (H4); revisar
   `TRUNCATE` y grants de `anon` (H5).
4. Probe: matriz actor × fila × campo contra la base con sesiones reales (patrón de
   `probe_guard_staff_rpcs.mjs`), incluido el caso "0 filas = error visible".

---

## Preguntas abiertas

- **Q1** — La cuenta `profesional` con correo del hipódromo (`h***@gmail.com`, alta 19/08):
  ¿es un usuario real de portal o una cuenta institucional mal rotulada?
- **Q2** — ¿El operador tiene que ver la pantalla Usuarios? Hoy la ve (y los botones no le hacen nada).
- **Q3** — `TRUNCATE` concedido a `anon`/`authenticated` sobre `usuarios`: TRUNCATE **no** pasa
  por RLS. PostgREST no expone TRUNCATE, así que por la API no es explotable, pero cualquier
  función SECURITY INVOKER que ejecute SQL dinámico sí lo sería. Es el patrón por defecto de
  Supabase en todas las tablas `public`; conviene relevarlo aparte en todas, no sólo en esta.
- **Q4** — ¿El secretario debería poder promover operador ↔ secretario (paridad con el alta por
  invitación) o se queda sólo super_admin?
- **Q5** — Antes del 2026-07-23 no hay auditoría de `usuarios`. Si importa confirmar el historial
  de `admin@`, `dolores@` y `yesica@`, la única otra fuente serían los logs de Postgres/API
  (retención limitada; probablemente ya no están).
