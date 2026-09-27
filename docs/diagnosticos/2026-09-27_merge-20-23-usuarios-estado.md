# Merge de PR #20 y PR #23 + `usuarios.estado` (solo lectura, antes del segundo merge)

- Fecha: 2026-09-27
- Guards: `pwd` → `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` → **210** · ref → `unlhcuanfrtpatoipwve`
- Anonimizado: usuarios por rol; ids de fila sólo donde hacen falta para rastrear.

## Resumen

| Paso | Resultado |
|---|---|
| PR #20 (XSS) | **Mergeado** → `main` = **`0551d50a7e5995439d341240a7df6378b4f8869c`**. Tenía un conflicto con `main` sólo en `CHANGELOG.md` (los PR #21/#22 y el #20 agregaron su entrada al tope): resuelto dejando las dos entradas, commit `4b2199f` en la rama del PR. El diff del PR contra `main` no cambió. |
| a) Valores de `usuarios.estado` | `varchar(20)`, default `'activo'`, **CHECK** `pendiente / activo / rechazado / suspendido`. Anterior a la primera migración registrada (2026-05-14) y no aparece en ninguna de las 154 migraciones ni en el repo. **Nunca admitió `'inactivo'`**: el cambio del 23/08 no sacó nada de la base; lo que hizo fue empezar a **escribir** `'inactivo'` desde la pantalla. |
| b) Bajas fallidas | **Intentos: no se pueden contar** (un UPDATE rechazado no deja fila en `auditoria` y esta sesión no tiene acceso a los logs). **Bajas efectivas reales desde el 23/08: 0** (sólo dos bajas de usuarios del probe de hoy, ya borrados). Hoy los **24** usuarios están `activo=true, estado='activo'`: no hay forma de saber desde la base si alguno fue objeto de una baja fallida — hay que preguntarle a la secretaría. |
| c) Otras pantallas que escriban un `estado` inválido | **Ninguna.** Único caso: `toggleActivo` de `usuarios.html` (ya corregido en #23). `invite-user` devuelve `estado: 'invitado'` sólo en la respuesta JSON; a la base escribe `'pendiente'`. |
| PR #23 (pantalla Usuarios) | Re-apuntado de `fix/xss-usuarios-portal` a `main`, **mergeado** → `main` = **`b44234a2a15ad1cebfc93544b4b4325d03fd8ddd`**. |
| md5 `usuarios.html` sitio vs `main` | **Iguales**: `b783e9bb57680b35d65643db56294cbd`. También `escape-html.js`, `admin.html`, `inscripciones.html` (lo que desplegó el #20). |

---

## 1. PR #20

```
$ gh pr merge 20 --merge …
GraphQL: Pull Request has merge conflicts (mergePullRequest)
$ git checkout fix/xss-usuarios-portal && git merge --no-ff --no-commit origin/main
Auto-merging CHANGELOG.md
CONFLICT (content): Merge conflict in CHANGELOG.md
Auto-merging CLAUDE.md
Auto-merging docs/ISSUES.md
Automatic merge failed; fix conflicts and then commit the result.
```

Resolución: las dos entradas del 27/09 quedan (XSS primero, con el título "— PR #20" en vez de "sin merge"; después
ISSUE-093). Commit `4b2199f` ("merge: main en fix/xss-usuarios-portal (conflicto sólo en CHANGELOG: quedan las dos
entradas)"). Diff de la rama contra `main` después de resolver:

```
 CHANGELOG.md                       |  18 +++
 CLAUDE.md                          |   2 +
 admin.html                         |  26 +++-
 docs/ISSUES.md                     |   7 +
 escape-html.js                     |  27 ++++
 inscripciones.html                 |   4 +-
 tests/probe_xss_portal_nombres.mjs | 306 +++++++++++++++++++++++++++++++++++++
 usuarios.html                      |  18 ++-
 8 files changed, 394 insertions(+), 14 deletions(-)
```

```
$ gh pr merge 20 --merge --subject "merge: XSS — nombres del portal escapados en usuarios, admin pendientes e inscripciones (ISSUE-018) — PR #20"
$ git log --oneline -1 && git rev-parse HEAD && git ls-remote origin main
0551d50 merge: XSS — nombres del portal escapados en usuarios, admin pendientes e inscripciones (ISSUE-018) — PR #20
0551d50a7e5995439d341240a7df6378b4f8869c
0551d50a7e5995439d341240a7df6378b4f8869c	refs/heads/main
```

Quedaron dos menciones viejas de "sin merge" en docs (la entrada de ISSUE-093 en CHANGELOG dice "rama … sin
mergear" y el avance de ISSUE-018 en `docs/ISSUES.md` dice "rama `fix/xss-usuarios-portal`, sin merge"). No las toqué
(no estaban en el pedido); son de texto, se corrigen en el próximo PR de docs.

---

## 2. Relevamiento de `usuarios.estado` (SOLO LECTURA, antes del merge del #23)

### a) Qué acepta y desde cuándo

```sql
select c.conname, pg_get_constraintdef(c.oid), c.convalidated,
 (select data_type||'/'||coalesce(character_maximum_length::text,'-')||' default '||coalesce(column_default,'∅')||' nullable '||is_nullable from information_schema.columns where table_schema='public' and table_name='usuarios' and column_name='estado') columna
from pg_constraint c where c.conrelid='public.usuarios'::regclass and pg_get_constraintdef(c.oid) ilike '%estado%';
```
```
conname               | pg_get_constraintdef                                                                                                                                                  | convalidated | columna
usuarios_estado_check | CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'activo'::character varying, 'rechazado'::character varying, 'suspendido'::character varying])::text[]))) | true         | character varying/20 default 'activo'::character varying nullable YES
```

No es un ENUM: es `varchar(20)` con CHECK. Desde cuándo:

```sql
select min(version) primera_migracion, count(*) migraciones,
 (select count(*) from supabase_migrations.schema_migrations m, unnest(m.statements) s where s ~* 'usuarios_estado_check') con_nombre_check,
 (select count(*) from supabase_migrations.schema_migrations m, unnest(m.statements) s where s ~* 'alter\s+table\s+(public\.)?usuarios' ) alter_usuarios,
 (select string_agg(version||' '||name, ' | ') from supabase_migrations.schema_migrations m where exists (select 1 from unnest(m.statements) s where s ~* 'alter\s+table\s+(public\.)?usuarios')) cuales
from supabase_migrations.schema_migrations;
```
```
primera_migracion | migraciones | con_nombre_check | alter_usuarios | cuales
20260514012740    | 154         | 0                | 2              | 20260801042905 sec_rls_fase1_auth_uid | 20260804024455 sec_autoregistro_gate1
```
```sql
select version, name, (select string_agg(left(regexp_replace(s,'\s+',' ','g'),300), ' ‖ ') from unnest(statements) s where s ~* 'alter\s+table\s+(public\.)?usuarios') fragmento,
 (select bool_or(s ~* 'estado') from unnest(statements) s where s ~* 'alter\s+table\s+(public\.)?usuarios') menciona_estado
from supabase_migrations.schema_migrations where version in ('20260801042905','20260804024455');
```
```
version        | name                    | menciona_estado | fragmento
20260801042905 | sec_rls_fase1_auth_uid  | false           | ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL; CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_auth_user_id ON public.usuarios (auth_user_id) WHERE auth_user_id IS NOT NULL; UPDATE public.usuarios u SET auth_user_id = a.id FROM auth
20260804024455 | sec_autoregistro_gate1  | false           | -- Gate 1 de auto-registro — cerrar los huecos que el flujo activa. -- Ver migrations/sec_autoregistro_gate1.sql y docs/AUTOREGISTRO_PLAN.md §B.2/§A.4/§A.5. … DROP POLICY IF EXISTS performanc
```
```bash
git log --format='%h %ad %s' --date=short -S"usuarios_estado_check" main      # (vacío)
git log -S"'rechazado'" --format='%h %ad %s' --date=short main
```
```
c5bcdb9 2026-08-30 chore: plan para revocar el DELETE de recibos (ISSUE-065) — SIN APLICAR
7535a1d 2026-08-23 fix(auth): los invitados se activan solos en vez de entrar a un sistema vacío
46bb8f5 2026-04-23 Add files via upload
```

Conclusión a: el CHECK existe desde **antes del 14/05** (primera migración registrada; probablemente desde la creación
de la tabla en abril, cuando `admin.html` ya escribía `'rechazado'`), nunca se modificó en una migración registrada y
**nunca incluyó `'inactivo'`**. El commit del 23/08 (`7535a1d`) **no sacó** un valor: cambió `toggleActivo`, que antes
tocaba sólo `activo`, para que escribiera también `estado`, y eligió `'inactivo'`:

```
$ git show 7535a1d -- usuarios.html | grep -n "^[-+].*estado"
49:+ * Escribe SIEMPRE `activo` y `estado` juntos. Antes tocaba sólo `activo` y eso
50:+ * dejaba filas incoherentes (`activo=true, estado='pendiente'` — el caso de
52:+ * `estado='pendiente'`, la red de contención de activacion-pendiente.js
63:+    .update({ activo, estado: activo ? 'activo' : 'inactivo' })
```

Consecuencia: desde el 23/08, **"Desactivar" falla siempre** y **"Activar" funciona** (escribe `'activo'`).

### b) Cuántas bajas fallaron

Intentos: **no hay forma de contarlos desde la base**. El UPDATE rechazado por el CHECK se revierte entero y
`trg_audit_usuarios` (AFTER) no llega a registrar nada. Los logs de Postgres/API tendrían el error, pero:

```
query_logs(project_id='unlhcuanfrtpatoipwve', sql='select source, count(*) … from logs group by source')
→ MCP error -32600: You do not have permission to perform this action
get_logs(service='api')
→ The logs.all endpoint has been removed. Use GET /v1/projects/{ref}/analytics/endpoints/logs instead.
```

(y la retención sería de 24 h: aun con acceso, no cubriría el 23/08–26/09).

Cambios efectivos de `activo` en toda la auditoría de `usuarios`:

```sql
select a.created_at, a.registro_id, u.rol rol_hoy, u.activo activo_hoy, u.estado estado_hoy, (u.id is null) borrado,
 a.datos_antes->>'rol' rol, a.datos_antes->>'estado' estado_antes, a.datos_despues->>'estado' estado_despues,
 a.datos_antes->>'email' like '%probe%' or a.datos_antes->>'email' like '%.invalid' or a.datos_antes->>'email' like '%sgh.test' es_probe,
 ua.rol actor_rol
from auditoria a left join usuarios u on u.id=a.registro_id left join usuarios ua on ua.id=a.usuario_id
where a.tabla='usuarios' and a.accion='UPDATE' and (a.datos_antes->>'activo')::boolean is distinct from (a.datos_despues->>'activo')::boolean
order by a.created_at;
```
```
created_at                    | registro_id                          | rol_hoy             | activo_hoy | estado_hoy | borrado | rol                 | estado_antes | estado_despues | es_probe | actor_rol
2026-08-16 21:14:29.507047+00 | 2ed1427f-ef06-4f56-9a9d-75bae08047f8 | operador            | true       | activo     | false   | operador            | pendiente    | activo         | false    | operador
2026-08-18 15:03:03.030174+00 | b269e008-5d5a-444b-9f80-5f0caf0a7695 | operador            | true       | activo     | false   | operador            | pendiente    | pendiente      | false    | null
2026-08-23 22:42:55.437462+00 | ae243acf-1295-4e2e-a08a-7d48c142550e | secretario_carreras | true       | activo     | false   | secretario_carreras | pendiente    | activo         | false    | secretario_carreras
2026-09-27 20:30:24.099752+00 | 79c2690f-b1bb-4ae5-9366-1a029d7eada8 | null                | null       | null       | true    | operador            | activo       | suspendido     | true     | null
2026-09-27 20:36:55.424131+00 | e1b60b18-ebe2-4557-a7ee-4da197b07413 | null                | null       | null       | true    | operador            | activo       | suspendido     | true     | null
```

- Las tres de agosto son **activaciones** (`false → true`) de cuentas de staff invitadas (la del 18/08 por service_role).
- Las dos del 27/09 son el perfil "inactivo" del probe de ISSUE-093 (lo desactiva el probe por service_role con
  `'suspendido'`), ya borrados.
- **Bajas reales efectivas: 0** en toda la historia auditada de `usuarios` (desde 23/07).

Estado de hoy:

```sql
select estado, activo, count(*) n, string_agg(distinct rol::text, ',') roles from usuarios group by 1,2 order by 1,2;
```
```
estado | activo | n  | roles
activo | true   | 24 | operador,profesional,propietario,secretario_carreras,super_admin
```

¿Hay alguien activo hoy que alguien quiso dar de baja? **No se puede saber desde la base**: el intento no deja rastro.
Tres datos acotan: (1) antes del 23/08 "Desactivar" funcionaba (sólo tocaba `activo`) y tampoco hay bajas auditadas
entre el 23/07 y el 23/08; (2) la pantalla mostraba el error del CHECK en rojo (no fallaba en silencio), así que quien
lo intentó lo vio; (3) hasta el #23, un secretario u operador que tocaba "Desactivar" sobre otro usuario recibía
"Usuario desactivado" **sin cambio** (placebo por RLS), no el error — si lo intentaron, creen que lo lograron. La
única forma de cerrarlo es preguntarle a la secretaría si dieron de baja a alguien (Q1).

### c) Otras escrituras de `usuarios.estado`

```bash
git grep -n -A4 "from('usuarios')" main -- '*.html' '*.js' 'supabase/functions/*/index.ts' | grep -n "estado\|\.update\|\.insert\|\.upsert" | grep -v "select("
```
```
2:main:activacion-pendiente.js-77-      .update({ activo: true, estado: 'activo' })
5:main:activacion-pendiente.js-80-      .eq('estado', 'pendiente')
21:main:admin.html-872-    .eq('estado', 'pendiente')
25:main:admin.html:911:  const { error } = await sb.from('usuarios').update({ estado: 'activo', activo: true }).eq('id', id);
31:main:admin.html:920:  const { error } = await sb.from('usuarios').update({ estado: 'rechazado', activo: false }).eq('id', id);
197:main:solicitar-acceso.html-740-  // Si ya mandó la solicitud, mostrar el estado y no el formulario.
223:main:supabase/functions/invite-user/index.ts:536:    const { error: insErr } = await admin.from('usuarios').insert(filaNueva);
241:main:usuarios.html:481:  const { error } = await sb.from('usuarios').update({
248:main:usuarios.html-510-    .update({ activo, estado: activo ? 'activo' : 'inactivo' })
```

(Salida tomada sobre `main` @ `0551d50`, antes del merge del #23.)

| Quién escribe | Valor | ¿Válido? |
|---|---|---|
| `activacion-pendiente.js:77` (auto-activación) | `'activo'` | ✅ |
| `admin.html:911` (aprobar pendiente) | `'activo'` | ✅ |
| `admin.html:920` (rechazar pendiente) | `'rechazado'` | ✅ |
| `invite-user` (alta por invitación, `filaNueva`) | `'pendiente'` | ✅ — el `estado: 'invitado'` de las líneas 528 y 571 es el JSON de **respuesta**, no va a la base |
| `rpc_aprobar_solicitud` (INSERT en `usuarios`) | `'activo'` | ✅ (cuerpo de la función leído en el informe del 27/09 de usuarios) |
| `usuarios.html` `toggleActivo` | `'inactivo'` | ❌ — el único; corregido a `'suspendido'` en #23 |

`reset-password.html`, `login.html`, `portal.html`, `solicitudes.html`, `registro*.html`: sólo leen `usuarios` (o no
la tocan). Funciones de la base que hacen INSERT/UPDATE en `usuarios`:

```sql
select p.proname, p.prosecdef, (select string_agg(m[1], ' | ') from regexp_matches(p.prosrc, '(estado\s*(?:=|,)\s*''[a-z_]+''|''[a-z_]+''\s*(?=,\s*[^,]*\)\s*RETURNING))', 'gi') m) valores
from pg_proc p where p.pronamespace='public'::regnamespace and p.prosrc ~* '(insert\s+into|update)\s+(public\.)?usuarios\M' order by 1;
```
```
proname               | prosecdef | valores
rpc_aprobar_solicitud | true      | estado='aprobada'
```
(El `estado='aprobada'` que captura la regex es el UPDATE de `solicitudes_acceso`; el INSERT en `usuarios` de esa
función usa `'activo'` — cuerpo completo en el informe `2026-09-27_xss-nombres-portal.md`.)

**Conclusión c: ninguna otra pantalla ni función escribe un `estado` que la base rechace.** Nada contradice
`'suspendido'`; se siguió con el merge del #23.

---

## 3. PR #23

El PR estaba apilado sobre `fix/xss-usuarios-portal`. `gh pr edit --base` falló por la API vieja de proyectos
(`GraphQL: Projects (classic) is being deprecated …`); se re-apuntó con la REST:

```
$ gh api -X PATCH repos/mdqclio/SGH/pulls/23 -f base=main -q '.base.ref'
main
$ gh api repos/mdqclio/SGH/pulls/23 -q '.base.ref+" "+(.mergeable|tostring)+" "+.head.sha'
main true 692635939b57c9c7a07ff9e7f1d4d9dfbe1ab0a9
$ gh pr diff 23 --name-only
tests/local/usuarios_sandbox.sql
tests/probe_usuarios_pantalla.mjs
usuarios.html
$ gh pr merge 23 --merge --subject "merge: usuarios.html — personal/portal separados, acciones según rol, nunca éxito sobre 0 filas, rol sólo si cambió, baja con estado válido — PR #23"
$ git log --oneline -1 && git rev-parse HEAD && git ls-remote origin main
b44234a merge: usuarios.html — personal/portal separados, acciones según rol, nunca éxito sobre 0 filas, rol sólo si cambió, baja con estado válido — PR #23
b44234a2a15ad1cebfc93544b4b4325d03fd8ddd
b44234a2a15ad1cebfc93544b4b4325d03fd8ddd	refs/heads/main
```

## 4. Deploy — md5 del sitio contra `main`

```bash
curl -s "https://sigh.com.ar/usuarios.html?v=$RANDOM" -o prod_usuarios.html
git show b44234a:usuarios.html > main_usuarios.html
md5sum main_usuarios.html prod_usuarios.html
```
```
2026-09-27T21:04:43Z
b783e9bb57680b35d65643db56294cbd  main_usuarios.html
b783e9bb57680b35d65643db56294cbd  prod_usuarios.html
```
```
escape-html.js      sitio=a19cf0db5b4819c6d1a270f6a724b8a3 main=a19cf0db5b4819c6d1a270f6a724b8a3
admin.html          sitio=5817e82cba340462c460665f28c8d64d main=5817e82cba340462c460665f28c8d64d IGUAL
inscripciones.html  sitio=02dd9eb3504b1747fde1956b31cb5c31 main=02dd9eb3504b1747fde1956b31cb5c31 IGUAL
```

Contenido nuevo servido: `grep -c "Usuarios del portal\|'suspendido'" prod_usuarios.html` → 3.

---

## Preguntas abiertas

- **Q1** — ¿La secretaría intentó dar de baja a alguien entre el 23/08 y hoy? Si sí, hay que repetirlo ahora (desde
  un super_admin: un secretario no ve el botón en filas ajenas desde #23, ver D1 del informe anterior).
- **Q2** — Docs pendientes: CHANGELOG/CLAUDE.md del #23 (línea del probe) y las dos menciones viejas de "sin merge".
  ¿Un PR de docs chico?
