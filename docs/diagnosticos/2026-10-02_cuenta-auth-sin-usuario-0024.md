# Cuenta de Auth sin fila en `usuarios` que inició sesión el 02/10 a las 00:24 UTC (y merge del PR #34)

- **Fecha:** 2026-10-02
- **Modo:** SÓLO LECTURA (MCP `execute_sql`, sólo SELECT sobre `auth.users`, `auth.identities`, `usuarios` y `solicitudes_acceso`;
  `git grep` en todas las ramas). **No se borró ni se tocó nada.**
- **Guards:** pwd=/home/clio/dev/SGH · ref=unlhcuanfrtpatoipwve · spcs=238.
- **Merge pedido:** PR #34 → **`c39beda9969319c1eabc97b0731f172141209285`**. Sólo `migrations/`, `tests/`, `docs/`, CHANGELOG y
  CLAUDE.md: ningún archivo servido por Pages cambia, así que no hace falta verificar el deploy.

> **Datos personales:** el repo es público. En este informe el email va **enmascarado** y no van el nombre, el DNI ni el teléfono
> que la persona cargó en su solicitud. El dato completo está en la base: la consulta A.1 lo devuelve.

## Respuesta

| Dato | Valor |
|---|---|
| Email | `lo*********@gmail.com` (completo en la base, A.1) |
| `auth.users.id` | `4c13e789-aa2c-4e76-9802-284e555988d1` |
| `created_at` | **2026-10-02 00:23:20 UTC** (21:23 del 01/10, Argentina) |
| Email confirmado | 2026-10-02 00:24:20 UTC (un minuto después) |
| Último login (`last_sign_in_at`) | **2026-10-02 00:24:20 UTC**, el que entra al confirmar |
| Proveedor | **`email`** (contraseña), una sola identidad; no anónima, no invitada (`invited_at` NULL), sin ban |
| Fila en `usuarios` | **ninguna**, ni por `auth_user_id` ni por email |
| ¿La creó un probe? | **No.** El email no aparece en `tests/`, en `main`, en `reports` ni en ninguna rama remota (A.2). Los probes usan `@sgh.test` / `@sgh-probe.invalid` y la borran en el teardown |
| Qué es | Una persona que se registró por **`solicitar-acceso.html`**: dejó una **solicitud de acceso `pendiente`** como **propietario** de Dolores, creada a las 00:24:57 UTC, 37 s después de confirmar (`solicitudes_acceso.id = cb7cc84a-62f1-4127-8407-ed808ffff62c`). **Es el circuito normal**: no tiene fila en `usuarios` porque nadie aprobó todavía la solicitud |

Es el mismo patrón que el 30/09 con GARCIA SERGIO (`2026-09-30_garcia-sergio-mail-portal.md`): cuenta de Auth, mail confirmado y
solicitud esperando a la secretaría. Esta vez el mail sí llegó.

## Cuántas cuentas de Auth no tienen fila en `usuarios`

**19 de 50.** Ninguna con pinta de probe (`%probe%`, `@sgh.test`, `.invalid`):

| | Cantidad |
|---|---|
| Con solicitud `pendiente` (como ésta) | 4 |
| Con solicitud `rechazada` | 2 |
| Con solicitud `descartada` | 1 |
| **Sin ninguna solicitud** | **12** |
| Email confirmado / sin confirmar | 10 / 9 |
| Nunca iniciaron sesión | 9 |
| Creadas por mes | 2026-04: 2 · 2026-08: 1 · 2026-09: 11 · 2026-10: 5 |

Las 12 sin solicitud son cuentas que se crearon pero nunca llegaron a pedir acceso: no confirmaron el mail o no volvieron a la
pantalla. Es el hueco que describió el informe de GARCIA SERGIO ("cuenta confirmada, cero solicitud, invisible"): **la secretaría no
las ve en ningún lado.** No tienen acceso a nada: sin fila en `usuarios` no pasan `fn_is_staff` ni `fn_is_portal_user`.

## Anexo — consultas tal como se corrieron

### A.1 La cuenta

```sql
select json_build_object(
 'cuenta', (select json_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at, 'email_confirmed_at', u.email_confirmed_at, 'confirmation_sent_at', u.confirmation_sent_at, 'invited_at', u.invited_at, 'provider', u.raw_app_meta_data->>'provider', 'providers', u.raw_app_meta_data->'providers', 'user_meta', u.raw_user_meta_data, 'role', u.role, 'is_anonymous', u.is_anonymous, 'banned_until', u.banned_until, 'deleted_at', u.deleted_at,
     'identities', (select json_agg(json_build_object('provider', i.provider, 'created_at', i.created_at, 'last_sign_in_at', i.last_sign_in_at)) from auth.identities i where i.user_id = u.id),
     'en_usuarios_por_auth', (select count(*) from usuarios x where x.auth_user_id = u.id),
     'en_usuarios_por_email', (select count(*) from usuarios x where lower(x.email) = lower(u.email)),
     'solicitudes', (select json_agg(row_to_json(s)) from solicitudes_acceso s where s.auth_user_id = u.id or lower(s.email) = lower(u.email)))
   from auth.users u where u.last_sign_in_at between '2026-10-02 00:20' and '2026-10-02 00:30')
) r;
```

Salida, **con datos personales enmascarados** (`[…]`: email, nombre, apellido, DNI y teléfono de la persona; también figuran en
`raw_user_meta_data`). Todo lo demás va tal cual:

```json
{"cuenta":{"id":"4c13e789-aa2c-4e76-9802-284e555988d1","email":"lo[…]@gmail.com","created_at":"2026-10-02T00:23:20.302309+00:00","last_sign_in_at":"2026-10-02T00:24:20.124057+00:00","email_confirmed_at":"2026-10-02T00:24:20.081985+00:00","confirmation_sent_at":"2026-10-02T00:23:20.324519+00:00","invited_at":null,"provider":"email","providers":["email"],"user_meta":{"sub":"4c13e789-aa2c-4e76-9802-284e555988d1","email":"lo[…]@gmail.com","email_verified":true,"phone_verified":false},"role":"authenticated","is_anonymous":false,"banned_until":null,"deleted_at":null,"identities":[{"provider":"email","created_at":"2026-10-02T00:23:20.321594+00:00","last_sign_in_at":"2026-10-02T00:23:20.321536+00:00"}],"en_usuarios_por_auth":0,"en_usuarios_por_email":0,"solicitudes":[{"id":"cb7cc84a-62f1-4127-8407-ed808ffff62c","auth_user_id":"4c13e789-aa2c-4e76-9802-284e555988d1","email":"lo[…]@gmail.com","nombre":"[…]","apellido":"[…]","documento_tipo":"DNI","documento_nro":"[…]","telefono":"[…]","rol_pedido":"propietario","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","estado":"pendiente","motivo_rechazo":null,"resuelta_por":null,"resuelta_at":null,"created_at":"2026-10-02T00:24:57.015488+00:00","origen_hipodromo":"Dolores","origen_patente_nro":null,"origen_caballeriza":"[…]"}]}}
```

(También enmascaré `origen_caballeriza`: es el nombre que dio la persona, no un dato del sistema.)

### A.2 Búsqueda del email en el repo

```
$ git fetch -q origin
$ git grep -n -i "<parte local del email>" origin/main | wc -l
0
$ git grep -n -i "<parte local del email>" origin/reports | wc -l
0
$ for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin); do n=$(git grep -i -c "<parte local del email>" $b 2>/dev/null | wc -l); [ "$n" != "0" ] && echo "$b $n"; done; echo "fin"
fin
$ grep -rli "<parte local del email>" tests/ | wc -l
0
```

(El patrón real fue la parte local del email; acá va reemplazado por `<parte local del email>` porque, junto con el dominio,
alcanza para reconstruir la dirección. Para repetir la búsqueda, tomá el email de la consulta A.1.)

### A.3 Todas las cuentas de Auth sin fila en `usuarios`

```sql
with sin as (
  select u.id, u.email, u.created_at, u.email_confirmed_at, u.last_sign_in_at,
         (select s.estado from solicitudes_acceso s where s.auth_user_id = u.id or lower(s.email)=lower(u.email) order by s.created_at desc limit 1) as solicitud,
         (u.email ilike '%probe%' or u.email ilike '%@sgh.test' or u.email ilike '%.invalid') as pinta_probe
    from auth.users u
   where not exists (select 1 from usuarios x where x.auth_user_id = u.id)
)
select json_build_object(
 'auth_total', (select count(*) from auth.users),
 'sin_fila_en_usuarios', (select count(*) from sin),
 'pinta_probe', (select count(*) from sin where pinta_probe),
 'por_solicitud', (select json_object_agg(coalesce(solicitud,'(sin solicitud)'), n) from (select solicitud, count(*) n from sin where not pinta_probe group by 1) x),
 'confirmadas', (select count(*) from sin where not pinta_probe and email_confirmed_at is not null),
 'sin_confirmar', (select count(*) from sin where not pinta_probe and email_confirmed_at is null),
 'nunca_iniciaron_sesion', (select count(*) from sin where not pinta_probe and last_sign_in_at is null),
 'por_mes_creacion', (select json_object_agg(m, n) from (select to_char(created_at,'YYYY-MM') m, count(*) n from sin where not pinta_probe group by 1 order by 1) x),
 'mas_vieja', (select min(created_at) from sin where not pinta_probe), 'mas_nueva', (select max(created_at) from sin where not pinta_probe)
) r;
```

```json
{"auth_total":50,"sin_fila_en_usuarios":19,"pinta_probe":0,"por_solicitud":{"(sin solicitud)":12,"descartada":1,"pendiente":4,"rechazada":2},"confirmadas":10,"sin_confirmar":9,"nunca_iniciaron_sesion":9,"por_mes_creacion":{"2026-04":2,"2026-08":1,"2026-09":11,"2026-10":5},"mas_vieja":"2026-04-22T03:13:31.60625+00:00","mas_nueva":"2026-10-02T00:23:20.302309+00:00"}
```

## Preguntas abiertas

1. ¿Querés el listado de las 19, con email enmascarado, fecha y estado? Sirve para que la secretaría contacte a las 12 sin solicitud.
   No lo puse porque no lo pediste y son datos personales.
2. Las 4 solicitudes `pendiente` (ésta incluida) esperan a que alguien las apruebe en `admin.html`.

---

## Verificación de push

```
$ git ls-remote origin reports
48540aa782f058db1e52077a36d0232018b2490a	refs/heads/reports
$ git rev-parse HEAD
48540aa782f058db1e52077a36d0232018b2490a
```

Coinciden. Este bloque va en un commit posterior.

---

## ⚠ Exposición de datos personales en el historial de `reports` (error mío, decisión pendiente)

La primera versión de este informe, en el anexo A.2, mostraba el **patrón de búsqueda, que era la parte local del email**. Junto
con el dominio enmascarado (`@gmail.com`), eso alcanza para reconstruir la dirección. Ya está corregido en la versión actual, pero
**quedó en el historial público de la rama `reports`**, en estos commits ya pusheados:

```
    c464259 02:23 report: sacar la parte local del email del anexo (repo público)
    48540aa 02:23 report: cuenta de Auth sin usuario (00:24 UTC 02/10) — no es probe, solicitud pendiente; 19/50 sin fila en usuarios; merge PR #34 (c39beda)
```

(Es el único dato expuesto: el nombre, el DNI y el teléfono nunca se escribieron en ningún commit.)

Sacarlo del historial exige **reescribir `reports` y hacer force-push**, que es irreversible y cambia los SHA de los commits
posteriores, incluidos los que figuran en informes anteriores. **No lo hago sin tu OK.** Opciones:
(a) reescribir sólo esos commits con `git filter-repo --replace-text` y force-push de `reports`;
(b) dejarlo: es la parte local de un email, sin nombre ni documento asociado en el repo.
Además, GitHub puede mantener el contenido cacheado por un tiempo aunque se reescriba.
