# Sanciones: migración aplicada, portal bloqueado, PR #19 mergeado

- Fecha: 2026-09-25
- `main` después del merge: **`4d95511d4212bb30a7c18fb7a7045d7a2cfe458b`** (head del PR `ea1f361`)
- Guards antes de escribir: `pwd` = /home/clio/dev/SGH · `select count(*) from spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- Escrituras en prod:
  - (1) `apply_migration` `sanciones_insert_update_staff` (`20260925205245`), con el texto exacto de
    `migrations/sanciones_insert_update_staff.sql` (md5 del archivo `c20230bc7f2d4dbf2a8056ecf6dfc28f`, igual en el PR);
  - (2) `node tests/probe_sanciones_alta.mjs --prod`: crea 4 usuarios temporales y sanciones de prueba (SPC de la
    9999, fechas 2099) y los borra. Queda todo como estaba (Q4).

## Resumen

| Pedido | Resultado |
|---|---|
| Migración primero | ✅ `20260925205245 sanciones_insert_update_staff` |
| md5 de las políticas contra el esperado | ✅ insert `851412fcb330fce19eebb3de7055282c` = esperado · update `037b23db86ad676cb86984cac876da25` = esperado · select y delete sin cambios (Q2) |
| El portal ya no puede insertar | ✅ B1: `42501` (Q3) |
| El portal ya no puede actualizar | ✅ B2b: una sanción sobre sí mismo que **ve** (control B2a) queda igual (Q3) |
| Resto del probe en prod | ✅ **13/13**: alta de un operador tipo Yesi con `club_id`/`creado_por`/`alcance`, edición, otro club rechazado, super_admin OK, limpieza |
| Merge del PR #19 | ✅ `main` = `4d95511d4212bb30a7c18fb7a7045d7a2cfe458b` |
| md5 de `sanciones.html` sitio contra `main` | ✅ `a3c13a8ca04934cc8de1388adea32add` en los dos (Q5) |

Yesi ya puede dar de alta sanciones desde `sanciones.html`, con Ctrl+Shift+R si tiene la versión vieja en caché.

---

## Q1 — Estado antes de aplicar

```
$ git rev-parse HEAD origin/fix/sanciones-alta-club-staff origin/main
132e9b70ca65cc3b3886ad14e2f1a0f90f75a26f
132e9b70ca65cc3b3886ad14e2f1a0f90f75a26f
d133c05db7c315ac2b62d7952f2553376c10619d
$ gh pr view 19 --json state,mergeable,headRefOid
OPEN MERGEABLE 132e9b70ca65cc3b3886ad14e2f1a0f90f75a26f
$ md5sum migrations/sanciones_insert_update_staff.sql; git show origin/fix/sanciones-alta-club-staff:migrations/sanciones_insert_update_staff.sql | md5sum
c20230bc7f2d4dbf2a8056ecf6dfc28f  migrations/sanciones_insert_update_staff.sql
c20230bc7f2d4dbf2a8056ecf6dfc28f  -
```
```sql
select (select count(*) from spcs) spcs, policyname, md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) md5
from pg_policies where schemaname='public' and tablename='sanciones' order by 2;
```
```json
[{"spcs":210,"policyname":"sanciones_delete","md5":"06c736d81c93b99ecdc19b348c5804d5"},{"spcs":210,"policyname":"sanciones_insert","md5":"ee075422773f3bdc4c1f562ef17c72ef"},{"spcs":210,"policyname":"sanciones_select","md5":"32f0c2e74c578a5806836d566c8dcf16"},{"spcs":210,"policyname":"sanciones_update","md5":"d61391593f16b3c8c5855054f6e496b6"}]
```

## Q2 — `apply_migration` y md5 después

`apply_migration(name='sanciones_insert_update_staff', query=<el archivo, textual>)` → `{"success":true}`.
```sql
select policyname, md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) md5, <esperado> esperado,
 (select version||' '||name from supabase_migrations.schema_migrations order by version desc limit 1) ultima_migracion
from pg_policies where schemaname='public' and tablename='sanciones' order by 1;
```
```json
[{"policyname":"sanciones_delete","md5":"06c736d81c93b99ecdc19b348c5804d5","esperado":"06c736d81c93b99ecdc19b348c5804d5","ultima_migracion":"20260925205245 sanciones_insert_update_staff"},{"policyname":"sanciones_insert","md5":"851412fcb330fce19eebb3de7055282c","esperado":"851412fcb330fce19eebb3de7055282c","ultima_migracion":"20260925205245 sanciones_insert_update_staff"},{"policyname":"sanciones_select","md5":"32f0c2e74c578a5806836d566c8dcf16","esperado":"32f0c2e74c578a5806836d566c8dcf16","ultima_migracion":"20260925205245 sanciones_insert_update_staff"},{"policyname":"sanciones_update","md5":"037b23db86ad676cb86984cac876da25","esperado":"037b23db86ad676cb86984cac876da25","ultima_migracion":"20260925205245 sanciones_insert_update_staff"}]
```

## Q3 — Probe contra prod (`node tests/probe_sanciones_alta.mjs --prod`)

Sesiones reales: usuario de auth + fila en `usuarios` + magiclink, una por rol. El alta y la edición usan el
`saveRecord` de `sanciones.html` de la rama (idéntico al de `main` después del merge, Q5).
```
✅ A1a) operador (como Yesi): el alta por saveRecord no da error y crea la fila
✅ A1b) club_id = Dolores
✅ A1c) creado_por = usuarios.id del operador
✅ A1d) alcance = 'club' y mandado EXPLÍCITO en el payload (no por default)
✅ A2) edición por saveRecord: OK, cambia el motivo; club_id y creado_por no se tocan
✅ B1) portal (profesional) con club Dolores: INSERT → rechazado 42501
✅ B2a) (control) el portal VE la sanción sobre sí mismo (si no, B2b no probaría nada)
✅ B2b) portal: UPDATE de una sanción sobre sí mismo → no la cambia
✅ C1) operador de otro club: INSERT con club_id Dolores → rechazado 42501
✅ C2a) (control) el operador de otro club VE la sanción compartida de Dolores
✅ C2b) operador de otro club: UPDATE de una sanción de Dolores → no la cambia
✅ D1) super_admin: INSERT con club_id Dolores → OK
✅ Z) limpieza: 0 sanciones y 0 usuarios de prueba quedaron

13/13 checks OK · PROD
```

## Q4 — Prod quedó como estaba

```sql
select (select count(*) from sanciones) sanciones, (select md5(string_agg(s::text,'|' order by s.id)) from sanciones s) md5_sanciones,
 (select count(*) from usuarios) usuarios, (select count(*) from auth.users) auth_users
 [, (select count(*) from auth.users where email like 'probe-sanciones-%') auth_prueba, (select count(*) from usuarios where nombre_completo like 'PROBE-SANCIONES-%') usuarios_prueba];
```
Antes del probe:
```json
[{"sanciones":1,"md5_sanciones":"cccd1483bd469bcb22bff9dd2826f13c","usuarios":22,"auth_users":33}]
```
Después:
```json
[{"sanciones":1,"md5_sanciones":"cccd1483bd469bcb22bff9dd2826f13c","usuarios":22,"auth_users":33,"auth_prueba":0,"usuarios_prueba":0}]
```

## Q5 — Merge y deploy

Antes del merge, un commit de docs en la rama (`ea1f361`): la migración pasa a figurar como APLICADA en su encabezado,
en CLAUDE.md y en el CHANGELOG.
```
$ gh pr merge 19 --merge --subject "merge: sanciones — el alta vuelve a mandar club_id (+ creado_por, alcance) e INSERT/UPDATE sólo para staff — PR #19"
$ git log --oneline -3 origin/main
4d95511 merge: sanciones — el alta vuelve a mandar club_id (+ creado_por, alcance) e INSERT/UPDATE sólo para staff — PR #19
ea1f361 docs: migración sanciones_insert_update_staff APLICADA (20260925205245) — md5 verificados, probe --prod 13/13
132e9b7 fix(sanciones): el alta manda club_id, creado_por y alcance; INSERT/UPDATE exigen fn_is_staff (migración sin aplicar)
$ git rev-parse origin/main
4d95511d4212bb30a7c18fb7a7045d7a2cfe458b
```
`curl -s "https://sigh.com.ar/sanciones.html?v=$RANDOM"` contra `git show 4d95511:sanciones.html` (coincidió al 3.er
intento, cada 20 s):
```
sanciones.html  main=a3c13a8ca04934cc8de1388adea32add  sitio=a3c13a8ca04934cc8de1388adea32add
altaPayload en el sitio: 2
built 4d95511d4212bb30a7c18fb7a7045d7a2cfe458b 2026-09-25T20:54:16Z
```

## Pendiente

- La Observación del informe anterior sigue abierta: otras 8 tablas con escritura para el portal de su club, entre ellas
  `liquidacion_config` y `club_secuencias`. No se tocó.

## Verificación del push (commit del informe)

```
$ git rev-parse HEAD
2bf954e95210d9a3b8c810c9d0a5f9e959aa0e2a
$ git ls-remote origin reports
2bf954e95210d9a3b8c810c9d0a5f9e959aa0e2a	refs/heads/reports
```
Este bloque va en un commit posterior ("verificación de push"): el SHA final de `reports` es el de ese commit.
