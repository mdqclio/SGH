# ISSUE-097 — autor y auditoría de resoluciones y sanciones: relevamiento y plan (GATE, SOLO LECTURA)

- Fecha: 2026-09-27
- Código leído en `main` @ `3162550f86b153fb42f772e8832a167c0d094f11` (PR #25, que abre ISSUE-097, sin mergear)
- Base: `unlhcuanfrtpatoipwve`, **sólo SELECT**. Cero escrituras en base y en `main`. No se tocó el circuito de
  pagos ni el motor.
- Guards: `pwd` → `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` → **210** · ref → `unlhcuanfrtpatoipwve`
- Anonimizado: usuarios por rol; ninguna persona nombrada.

---

## Resumen

| # | Respuesta corta |
|---|---|
| 1 | `resoluciones` y `sanciones` tienen `creado_por uuid` **nullable, sin default**, con FK a `usuarios(id)`. `resolucion_entidades` no tiene columna de autor. Ninguna tiene `updated_at` ni `updated_by`. |
| 2 | **Ninguna de las tres tiene trigger de auditoría** (ni de ningún tipo). `liquidacion_config` y `clubs` usan el mismo patrón: `AFTER INSERT OR DELETE OR UPDATE … FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()`. Se copia tal cual. |
| 3 | Pantallas: `resoluciones.html` (alta, edición, cambio de estado, borrado) y `sanciones.html` (alta, edición, borrado), con sesión de staff. **`resolucion_entidades` no la escribe ninguna pantalla.** Sin RPC que escriba. Sin sesión: 2 probes (service_role) y una migración histórica (`merge_duplicados_spc.sql`, UPDATE de `entidad_id`). Ésas quedan con autor NULL. |
| 4 | `resoluciones`: **2 filas, 0 con autor** (las N° 39 y 40). `resolucion_entidades`: 0 filas. `sanciones`: 5 filas, 4 con autor (las 4 del 25/09, todas de la misma operadora); la de mayo, sin autor. |
| 5 | Plan en 3 piezas: (A) trigger `BEFORE INSERT OR UPDATE` que **impone** `creado_por` desde la sesión en `resoluciones` y `sanciones`, ignorando el front, y lo congela en las ediciones; (B) trigger de auditoría en las tres; (C) front y probes. **`resoluciones.html` no manda `creado_por`: no hay nada que sacar.** `sanciones.html` sí lo manda; queda redundante. Rollback por pieza. Ver §5. |
| 6 | **Una resolución hoy se puede editar entera y borrar**: número, fecha, tipo, texto, reunión, estado y documento, por cualquier secretario u operador de Dolores o super_admin. El borrado se lleva en cascada sus `resolucion_entidades`. **Sin rastro.** Una sanción se puede editar entera (estado, fechas, motivo) por staff; borrar, sólo super_admin, y a un secretario u operador el botón le dice "Sanción eliminada" sin borrar nada (placebo). Ver §6. |

Hallazgo extra: la auditoría se **purga** a los 12 meses (`clubs.auditoria_retencion_meses = 12` en Dolores, con
`fn_purgar_auditoria`). Una suspensión de 2 años y medio sobrevive a su propia auditoría. `creado_por`, en cambio,
queda en la fila (Q2).

---

## 1. Columnas

```sql
select c.table_name, c.ordinal_position n, c.column_name, case when c.data_type='USER-DEFINED' then c.udt_name else c.data_type end tipo, c.is_nullable null_ok, coalesce(c.column_default,'') def
from information_schema.columns c where c.table_schema='public' and c.table_name in ('resoluciones','resolucion_entidades','sanciones') order by 1,2;
```
```
table_name           | n  | column_name       | tipo                     | null_ok | def
resolucion_entidades | 1  | id                | uuid                     | NO      | uuid_generate_v4()
resolucion_entidades | 2  | resolucion_id     | uuid                     | NO      |
resolucion_entidades | 3  | entidad_tipo      | character varying        | NO      |
resolucion_entidades | 4  | entidad_id        | uuid                     | NO      |
resolucion_entidades | 5  | descripcion       | text                     | YES     |
resoluciones         | 1  | id                | uuid                     | NO      | uuid_generate_v4()
resoluciones         | 2  | club_id           | uuid                     | NO      |
resoluciones         | 3  | reunion_id        | uuid                     | YES     |
resoluciones         | 4  | numero            | character varying        | NO      |
resoluciones         | 5  | fecha             | date                     | NO      |
resoluciones         | 6  | tipo              | character varying        | NO      |
resoluciones         | 7  | texto             | text                     | YES     |
resoluciones         | 8  | documento_url     | text                     | YES     |
resoluciones         | 9  | estado            | character varying        | NO      | 'borrador'::character varying
resoluciones         | 10 | creado_por        | uuid                     | YES     |
resoluciones         | 11 | created_at        | timestamp with time zone | NO      | now()
sanciones            | 1  | id                | uuid                     | NO      | uuid_generate_v4()
sanciones            | 2  | club_id           | uuid                     | NO      |
sanciones            | 3  | entidad_tipo      | entidad_sancionada       | NO      |
sanciones            | 4  | entidad_id        | uuid                     | NO      |
sanciones            | 5  | tipo_sancion      | character varying        | NO      |
sanciones            | 6  | motivo            | text                     | YES     |
sanciones            | 7  | codigo_resolucion | character varying        | YES     |
sanciones            | 8  | fecha_inicio      | date                     | NO      |
sanciones            | 9  | fecha_fin         | date                     | YES     |
sanciones            | 10 | alcance           | character varying        | NO      | 'club'::character varying
sanciones            | 11 | estado            | estado_sancion           | NO      | 'activa'::estado_sancion
sanciones            | 12 | resolucion_url    | text                     | YES     |
sanciones            | 13 | notas             | text                     | YES     |
sanciones            | 14 | creado_por        | uuid                     | YES     |
sanciones            | 15 | created_at        | timestamp with time zone | NO      | now()
```

Restricciones y triggers (junto a las tablas de referencia):

```sql
select c.relname, (select coalesce(string_agg(t.tgname||': '||pg_get_triggerdef(t.oid), ' ‖ '),'(ninguno)') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) triggers,
 (select string_agg(pg_get_constraintdef(k.oid), ' | ') from pg_constraint k where k.conrelid=c.oid) constraints, c.relrowsecurity rls
from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('resoluciones','resolucion_entidades','sanciones','liquidacion_config','clubs') order by 1;
```
```
relname              | triggers | constraints | rls
clubs                | trg_audit_clubs: CREATE TRIGGER trg_audit_clubs AFTER INSERT OR DELETE OR UPDATE ON public.clubs FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log() ‖ trg_clubs_updated_at: CREATE TRIGGER trg_clubs_updated_at BEFORE UPDATE ON public.clubs FOR EACH ROW EXECUTE FUNCTION set_updated_at() | CHECK (((auditoria_retencion_meses IS NULL) OR (auditoria_retencion_meses >= 0))) | PRIMARY KEY (id) | UNIQUE (sigla) | true
liquidacion_config   | trg_audit_liquidacion_config: CREATE TRIGGER trg_audit_liquidacion_config AFTER INSERT OR DELETE OR UPDATE ON public.liquidacion_config FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log() | CHECK ((((((((pct_propietario + pct_entrenador) + pct_jockey) + pct_peon) + pct_capataz) + pct_sereno) + pct_fondo_solidario) = (100)::numeric)) | FOREIGN KEY (club_id) REFERENCES clubs(id) | PRIMARY KEY (id) | true
resolucion_entidades | (ninguno) | PRIMARY KEY (id) | FOREIGN KEY (resolucion_id) REFERENCES resoluciones(id) ON DELETE CASCADE | true
resoluciones         | (ninguno) | FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE | UNIQUE (club_id, numero) | FOREIGN KEY (creado_por) REFERENCES usuarios(id) | PRIMARY KEY (id) | FOREIGN KEY (reunion_id) REFERENCES reuniones(id) | true
sanciones            | (ninguno) | FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE | FOREIGN KEY (creado_por) REFERENCES usuarios(id) | PRIMARY KEY (id) | true
```

---

## 2. Auditoría: qué hay y cómo copiarlo

Ninguna de las tres tiene trigger. El patrón de `liquidacion_config` y de `clubs` es uno solo:

```sql
CREATE TRIGGER trg_audit_liquidacion_config AFTER INSERT OR DELETE OR UPDATE ON public.liquidacion_config
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();
```

`fn_auditoria_log()` (SECURITY DEFINER; cuerpo completo en el informe del 27/09 `2026-09-27_issue093-aplicado.md`,
§6) hace esto:
- **Usuario**: `auth.jwt() ->> 'email'` → `usuarios.email` (`LIMIT 1`). Sin JWT (service_role, MCP, migración)
  → `usuario_id` NULL: en `auditoria.html` se ve "Sistema".
- **Club**: el `club_id` de la fila, si lo tiene. Si no (`resolucion_entidades`), el club del usuario. Sin sesión y
  sin `club_id` → NULL.
- Guarda `datos_antes` / `datos_despues` enteros. Un UPDATE que sólo mueve `updated_at` no se registra (acá no aplica:
  ninguna de las tres lo tiene).
- Necesita `NEW.id` / `OLD.id`: las tres tienen `id`.

`auditoria` admite `club_id`, `usuario_id` y `registro_id` NULL:

```
id uuid NOT NULL uuid_generate_v4() · club_id uuid NULL · usuario_id uuid NULL · tabla NOT NULL · registro_id uuid NULL ·
accion NOT NULL · datos_antes jsonb NULL · datos_despues jsonb NULL · ip NULL · created_at NOT NULL now()
```

Dos diferencias con lo que conviene para `creado_por`:
- la auditoría identifica por **email** y `creado_por` debería salir de `auth_user_id` (índice único
  `ux_usuarios_auth_user_id`). Con emails distintos por club dan lo mismo;
- la auditoría se **purga** a los 12 meses (`fn_purgar_auditoria`, md5 `91a5681569a87b303c2f0af84be6a0e6`; no hay
  `pg_cron`, así que corre sólo si alguien la llama). Borra por `club_id` según `clubs.auditoria_retencion_meses`
  (Dolores = 12) y las filas con `club_id` NULL a los 12 meses. `creado_por` no se purga.

---

## 3. Quién escribe hoy

```bash
git grep -n "from('<tabla>')" origin/main -- '*.html' '*.js' 'supabase/functions/*/index.ts'   # por tabla
git grep -n -i -E "(insert into|update|delete from)\s+(public\.)?<tabla>\b" origin/main -- 'migrations/*.sql'
```

| Tabla | Escritor | Operación | Sesión |
|---|---|---|---|
| `resoluciones` | `resoluciones.html:317` `saveRecord` alta | INSERT (payload **sin** `creado_por`: `:305-314`) | staff (secretario, operador) o super_admin |
| | `resoluciones.html:316` `saveRecord` edición | UPDATE de todos los campos (número, fecha, tipo, texto, reunión, estado, documento, club) | ídem |
| | `resoluciones.html:273` `cambiarEstado` | UPDATE `estado` | ídem |
| | `resoluciones.html:327` `deleteRecord` | DELETE (con `confirm`) | ídem |
| | `tests/probe_politicas_escritura_staff.mjs` | INSERT/UPDATE/DELETE de fixtures (numero `PROBE-093-…`) | sesiones de probe + **service_role** para los fixtures |
| `resolucion_entidades` | **ninguna pantalla** | — | — |
| | `tests/probe_politicas_escritura_staff.mjs` | fixtures | sesiones de probe + service_role |
| | `migrations/merge_duplicados_spc.sql:97` (23/08, histórica) | `UPDATE … SET entidad_id` | **migración (sin sesión)** |
| `sanciones` | `sanciones.html:385` alta | INSERT con `creado_por: currentUser?.usuario_id` (`:380`, desde PR #19) | staff |
| | `sanciones.html:384` edición | UPDATE de todo menos club, autor y alcance | staff |
| | `sanciones.html:395` borrado | DELETE | cualquiera ve el botón; sólo super_admin borra (§6) |
| | `tests/probe_sanciones_alta.mjs` | alta por `saveRecord` real + INSERT de super_admin con `creado_por` explícito + fixtures por service_role | sesiones de probe + service_role |
| | `migrations/merge_duplicados_spc.sql:95` (histórica) | `UPDATE … SET entidad_id` | **migración** |
| `index.html:239/256` | — | sólo cuenta sanciones activas | — |

Funciones de la base: sólo `fn_club_de_resolucion` nombra una de estas tablas, y **sólo lee**.

```sql
select t.tabla, p.proname, p.prosecdef, (p.prosrc ~* ('(insert\s+into|update|delete\s+from)\s+(public\.)?'||t.tabla||'\M')) escribe
from (values ('resoluciones'),('resolucion_entidades'),('sanciones')) t(tabla) join pg_proc p on p.pronamespace='public'::regnamespace and p.prosrc ~* ('\m'||t.tabla||'\M') order by 1,2;
```
```
tabla        | proname               | prosecdef | escribe
resoluciones | fn_club_de_resolucion | true      | false
```

**Escrituras sin sesión** (sin `auth.uid()`): los fixtures por service_role de los dos probes y las migraciones.
Ninguna tiene usuario, así que con el plan quedan con `creado_por` NULL y en la auditoría como "sin usuario". Ninguna
puede fallar por eso: la columna sigue nullable y el trigger no exige sesión.

---

## 4. Filas y autor

```sql
select 'resoluciones' t, count(*) filas, count(creado_por) con_autor, min(created_at)::text primera, max(created_at)::text ultima from resoluciones
union all select 'resolucion_entidades', count(*), null, null, null from resolucion_entidades
union all select 'sanciones', count(*), count(creado_por), min(created_at)::text, max(created_at)::text from sanciones
union all select 'sanciones_sin_autor_detalle', count(*), null, string_agg(to_char(created_at,'YYYY-MM-DD HH24:MI')||' '||entidad_tipo::text||' '||estado::text, ', '), null from sanciones where creado_por is null;
```
```
t                           | filas | con_autor | primera                       | ultima
resoluciones                | 2     | 0         | 2026-09-27 21:10:49.942007+00 | 2026-09-27 21:14:08.994978+00
resolucion_entidades        | 0     | null      | null                          | null
sanciones                   | 5     | 4         | 2026-05-05 02:55:54.366485+00 | 2026-09-25 21:07:12.009486+00
sanciones_sin_autor_detalle | 1     | null      | 2026-05-05 02:55 spc activa   | null
```

Las 4 sanciones con autor son las del 25/09 (18:04–18:07, hora argentina), todas de la misma operadora. La de mayo es
anterior al arreglo del PR #19.

---

## 5. Plan (sin aplicar)

### Pieza A — `creado_por` lo impone la base (migración `resoluciones_sanciones_autor.sql`)

```sql
-- BORRADOR, no aplicado
CREATE OR REPLACE FUNCTION public.fn_set_creado_por()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Con sesión: el usuarios.id de quien está conectado, ignorando lo que mande el cliente.
    -- Sin sesión (service_role, MCP, migración): NULL (la auditoría lo muestra como "sin usuario").
    NEW.creado_por := (SELECT u.id FROM usuarios u WHERE u.auth_user_id = auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    -- El autor no se edita desde la API. Sólo una sesión directa (migración documentada) puede corregirlo.
    IF session_user::text = 'authenticator' AND coalesce(auth.role(), '') <> 'service_role' THEN
      NEW.creado_por := OLD.creado_por;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_resoluciones_creado_por BEFORE INSERT OR UPDATE ON public.resoluciones
  FOR EACH ROW EXECUTE FUNCTION fn_set_creado_por();
CREATE TRIGGER trg_sanciones_creado_por BEFORE INSERT OR UPDATE ON public.sanciones
  FOR EACH ROW EXECUTE FUNCTION fn_set_creado_por();
```

- Criterio de "quién es service_role o migración": el mismo que ya usa `fn_liq_cerrada_guard` (ISSUE-091).
- `resolucion_entidades` no lleva autor propio (pertenece a su resolución). Queda cubierta por la auditoría (pieza B).
  Si se quiere autor también ahí, es una columna nueva (Q3).
- El trigger BEFORE corre antes del AFTER de auditoría, así que la auditoría ve el `creado_por` definitivo.
- Rollback A: `DROP TRIGGER trg_resoluciones_creado_por ON resoluciones; DROP TRIGGER trg_sanciones_creado_por ON
  sanciones; DROP FUNCTION fn_set_creado_por();`. No toca datos.

### Pieza B — auditoría en las tres (migración `audit_resoluciones_sanciones.sql`)

```sql
-- BORRADOR, no aplicado — mismo patrón que trg_audit_liquidacion_config / trg_audit_clubs
CREATE TRIGGER trg_audit_resoluciones         AFTER INSERT OR DELETE OR UPDATE ON public.resoluciones         FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();
CREATE TRIGGER trg_audit_resolucion_entidades AFTER INSERT OR DELETE OR UPDATE ON public.resolucion_entidades FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();
CREATE TRIGGER trg_audit_sanciones            AFTER INSERT OR DELETE OR UPDATE ON public.sanciones            FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();
```

- `fn_auditoria_log` no cambia.
- Rollback B: los tres `DROP TRIGGER`. Las filas de `auditoria` que se generen mientras tanto quedan (son historia).
- `auditoria.html` no ofrece estas tablas en su filtro (`:126-127` listan `categorias_carrera`, `clubs`, …). Hay que
  sumarlas para que se puedan mirar desde la pantalla (pieza C).

### Pieza C — front y probes

- `resoluciones.html`: **hoy no manda `creado_por`** (payload `:305-314`). No hay nada que sacar.
- `sanciones.html`: manda `creado_por: currentUser?.usuario_id` en el alta (`:380`). Con la pieza A es redundante; se
  puede dejar o sacar. Si se saca, el probe `tests/probe_sanciones_alta.mjs` cambia: su mutante **M2** ("el alta sin
  creado_por") deja de morir, porque la base lo completa igual. Pasa a verificar que la base lo impone.
- `auditoria.html`: sumar `resoluciones`, `resolucion_entidades` y `sanciones` al filtro y a las etiquetas.
- Probe nuevo, **en el sandbox** (GOTCHA #101; réplica de las tres tablas + `usuarios` + `fn_auditoria_log`):
  - staff inserta mandando otro `creado_por` o NULL → queda el suyo;
  - super_admin igual;
  - service_role inserta → NULL;
  - staff edita y trata de cambiar `creado_por` → no cambia;
  - migración (sesión directa) sí puede corregirlo;
  - cada INSERT/UPDATE/DELETE deja su fila en `auditoria` con el usuario correcto; el borrado de una resolución deja
    también el de sus entidades en cascada.
  - Mutantes: sin trigger A, sin la rama UPDATE, sin cada trigger B.
  - En prod, sólo lectura: md5 de las funciones y triggers después de aplicar.
- Rollback C: revert del commit de front.

**Orden**: A → B → C, cada una con su md5 verificado. **FK a tener en cuenta**: con A, las resoluciones y sanciones
que carguen los usuarios de probe tendrán su `creado_por`. `creado_por` referencia a `usuarios` sin `ON DELETE`, así
que un probe no puede borrar un usuario autor antes de borrar sus filas (mismo patrón que la auditoría; GOTCHA #101).

---

## 6. ¿Se puede editar o borrar una resolución hoy?

```sql
select c.relname tabla, p.polname, p.polcmd, pg_get_expr(p.polqual,p.polrelid) using_expr, pg_get_expr(p.polwithcheck,p.polrelid) check_expr
from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace and c.relname in ('resoluciones','resolucion_entidades','sanciones') order by 1,2;
```
```
tabla | polname | polcmd | using_expr | check_expr
resolucion_entidades | resolucion_entidades_delete | d | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))) | null
resolucion_entidades | resolucion_entidades_insert | a | null | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
resolucion_entidades | resolucion_entidades_select | r | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))) | null
resolucion_entidades | resolucion_entidades_update | w | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))) | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (fn_club_de_resolucion(resolucion_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
resoluciones | resoluciones_delete | d | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))) | null
resoluciones | resoluciones_insert | a | null | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
resoluciones | resoluciones_select | r | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))) | null
resoluciones | resoluciones_update | w | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))) | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
sanciones | sanciones_delete | d | ( SELECT fn_is_super_admin() AS fn_is_super_admin) | null
sanciones | sanciones_insert | a | null | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
sanciones | sanciones_select | r | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND ((club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)) OR ((alcance)::text <> 'club'::text))) OR ((entidad_tipo = 'profesional'::entidad_sancionada) AND (entidad_id IN ( SELECT e.entidad_id
   FROM fn_mis_entidades() e(entidad_tipo, entidad_id)
  WHERE (e.entidad_tipo = 'profesional'::text)))) OR ((entidad_tipo = 'propietario'::entidad_sancionada) AND (entidad_id IN ( SELECT e.entidad_id
   FROM fn_mis_entidades() e(entidad_tipo, entidad_id)
  WHERE (e.entidad_tipo = 'propietario'::text)))) OR ((entidad_tipo = 'spc'::entidad_sancionada) AND (entidad_id IN ( SELECT s.spc_id
   FROM fn_mis_spc_ids() s(spc_id))))) | null
sanciones | sanciones_update | w | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))) | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (( SELECT fn_is_staff() AS fn_is_staff) AND (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
```

| Qué | Quién puede hoy | Por dónde | ¿Deja rastro? |
|---|---|---|---|
| **Editar una resolución** (número, fecha, tipo, texto, reunión, estado, documento) | secretario u operador de Dolores, super_admin | `resoluciones.html` → Editar (`saveRecord`, `:316`) | **no** |
| **Cambiar el estado** (p. ej. `notificada` → `borrador`) | ídem | botones de estado (`cambiarEstado`, `:273`) | **no** |
| **Borrar una resolución** (y en cascada sus `resolucion_entidades`) | ídem | 🗑️ con `confirm` (`deleteRecord`, `:327`) | **no** |
| Editar o borrar `resolucion_entidades` | ídem | no hay pantalla; sólo por API | **no** |
| **Editar una sanción** (estado → `revocada`, `fecha_fin`, motivo, tipo) | secretario u operador de Dolores, super_admin | `sanciones.html` → Editar (`:384`) | **no** |
| **Borrar una sanción** | **sólo super_admin** | 🗑️ (`:395`) | **no** |
| Borrar una sanción siendo secretario u operador | la RLS filtra la fila: 0 filas **sin error** | el mismo botón | la pantalla dice **"Sanción eliminada"** y no borró nada (placebo, mismo patrón que `usuarios.html` antes del PR #23) |

Hoy, entonces, una resolución que suspende a una persona 2 años y medio la puede reescribir o borrar cualquier
operador del club, y no queda registro de quién ni cuándo. Con el plan, la auditoría (pieza B) registra cada edición
y cada borrado. Hacerla **inmutable** (sin UPDATE ni DELETE después de `notificada`, o sólo con super_admin y
motivo) es otra decisión: Q1.

---

## Preguntas abiertas

- **Q1** — ¿Inmutabilidad? Por ejemplo: después de `notificada`, una resolución no se edita ni se borra por la API
  (sólo se anula con otra resolución), o sólo super_admin con motivo. Lo mismo para una sanción `activa`
  (¿revocar = nueva sanción o cambio de estado?).
- **Q2** — Retención de la auditoría: ¿se excluyen `resoluciones`, `resolucion_entidades` y `sanciones` de
  `fn_purgar_auditoria`? Hoy se purgarían a los 12 meses, antes de que termine una suspensión de 2 años y medio.
- **Q3** — ¿`resolucion_entidades` necesita autor propio, o alcanza con la auditoría?
- **Q4** — Las resoluciones 39 y 40: ¿se completa `creado_por` a mano, por migración con nota, con lo que diga la
  secretaría?
- **Q5** — El placebo de borrar una sanción siendo secretario u operador: ¿se ocultan los botones que la RLS no deja
  usar (como en `usuarios.html`)? Es front, va aparte.
