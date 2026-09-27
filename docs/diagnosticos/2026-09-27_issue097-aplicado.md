# ISSUE-097 aplicado — PR #25 mergeado, migraciones en prod, probes en verde (informe ANTES de mergear el #26)

- Fecha: 2026-09-27
- **PR #25 mergeado** → `main` = **`c8018be798b4384933c1fd14139788cbf3104db1`**
- **PR #26** re-apuntado a `main`, **sin mergear**; rama `fix/resoluciones-sanciones-autor` @
  **`806889003db2e799c628feb6fb9db99ac4d953ab`**. El merge despliega `resoluciones.html`, `sanciones.html` y
  `auditoria.html`.
- **Migraciones aplicadas en prod**, en orden: A `20260927223658 resoluciones_sanciones_autor` · B
  `20260927223701 audit_resoluciones_sanciones` · C `20260927223704 resoluciones_delete_super_admin`.
- Guards antes de aplicar: `pwd` → `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` → **210** · ref →
  `unlhcuanfrtpatoipwve`. Después: spcs 210, clubs 3.
- Anonimizado: usuarios por rol; los de los probes son sintéticos y ya no existen.

---

## Resumen

| Paso | Resultado |
|---|---|
| PR #25 | Mergeado: `c8018be`. |
| 1. Aplicar y verificar md5 | Prod **antes** = sandbox antes (**45/45**). Aplicadas A, B, C. Prod **después** = esperado del sandbox (**55/55**): función, 5 triggers, 12 políticas, columnas y los dos COMMENT. |
| 2. Probe completo contra prod | **32/32** y **4/4 mutantes de pantalla**; limpieza por estado OK. **Desvío avisado**: los 7 mutantes de base (sacar triggers, aflojar la política de borrado) **no** se corrieron en prod, porque dejarían un rato sin autor ni auditoría justo lo que el cambio cierra. Corren en el sandbox, que replica prod (antes 45/45 = prod): **33/33, 11/11**. A8 (sesión directa) se probó en prod aparte, por MCP, en una transacción revertida: `creado_por` congelado. |
| 3. Los dos probes tocados | `probe_politicas_escritura_staff --prod`: **281/281** (borrar resolución: secretario y operador 0 filas, super_admin 1). `probe_sanciones_alta --prod`: **13/13**, después de corregir su limpieza (§4). En el sandbox: 281/281 + 14/14 y 13/13 + 6/6. |
| Estado real | Las N° **39 y 40 siguen con `creado_por` NULL**, sin tocar. Sanciones: 5, 4 con autor (sin cambios). Cero restos de probes. |

**Mutante retirado (M2 de `probe_sanciones_alta`, "el alta sin `creado_por`")**: ya no puede fallar porque le saca
`creado_por` al payload de `sanciones.html`, y desde la pieza A la base pone `creado_por` con el usuario de la
sesión, ignorando lo que venga en el payload: con o sin el campo, la fila queda igual. Lo que ese mutante vigilaba
(que el alta registre quién la cargó) pasó a garantizarlo la base, y lo vigila el mutante M7 del probe nuevo (sin
`trg_sanciones_autor`), que muere.

**Hallazgo del paso 3**: `probe_sanciones_alta` pasaba sus 12 chequeos funcionales pero **no podía limpiar**. Con la
auditoría nueva en `sanciones`, lo que hacen sus usuarios de prueba deja filas en `auditoria`, y la FK
`auditoria_usuario_id_fkey` impide borrarlos. Quedaron 2 usuarios sintéticos y 3 filas de auditoría: los borré, y el
probe ahora borra la auditoría de sus usuarios antes que los usuarios (mismo orden que el de ISSUE-093). Corrida
siguiente: 13/13 y limpio. Cualquier otro probe que escriba en estas tres tablas con usuarios temporales necesita lo
mismo (GOTCHA #101).

---

## 1. Aplicación y md5

### 1.a Prod antes = sandbox antes

La consulta de la foto (la misma que en el sandbox, con el filtro de esquema `public`):

```sql
select string_agg(l, E'\n' order by l) foto from (
select 'pol '||c.relname||'.'||p.polname||' '||md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'')||'|'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')) l from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace and c.relname in ('resoluciones','resolucion_entidades','sanciones')
union all select 'trg '||c.relname||'.'||t.tgname||' '||md5(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and c.relname in ('resoluciones','resolucion_entidades','sanciones') and not t.tgisinternal
union all select 'col '||table_name||'.'||column_name||' '||data_type||' '||is_nullable from information_schema.columns where table_schema='public' and table_name in ('resoluciones','resolucion_entidades','sanciones')
union all select 'fn '||proname||' '||md5(pg_get_functiondef(oid)) from pg_proc where proname in ('fn_autor_fila') and pronamespace='public'::regnamespace
union all select 'comment '||c.relname||'.'||a.attname||' '||coalesce(md5(col_description(c.oid,a.attnum)),'∅') from pg_class c join pg_attribute a on a.attrelid=c.oid where c.relnamespace='public'::regnamespace and c.relname in ('resoluciones','sanciones') and a.attname='creado_por'
) x;
```

Prod antes (45 líneas):

```
col resolucion_entidades.descripcion text YES
col resolucion_entidades.entidad_id uuid NO
col resolucion_entidades.entidad_tipo character varying NO
col resolucion_entidades.id uuid NO
col resolucion_entidades.resolucion_id uuid NO
col resoluciones.club_id uuid NO
col resoluciones.creado_por uuid YES
col resoluciones.created_at timestamp with time zone NO
col resoluciones.documento_url text YES
col resoluciones.estado character varying NO
col resoluciones.fecha date NO
col resoluciones.id uuid NO
col resoluciones.numero character varying NO
col resoluciones.reunion_id uuid YES
col resoluciones.texto text YES
col resoluciones.tipo character varying NO
col sanciones.alcance character varying NO
col sanciones.club_id uuid NO
col sanciones.codigo_resolucion character varying YES
col sanciones.creado_por uuid YES
col sanciones.created_at timestamp with time zone NO
col sanciones.entidad_id uuid NO
col sanciones.entidad_tipo USER-DEFINED NO
col sanciones.estado USER-DEFINED NO
col sanciones.fecha_fin date YES
col sanciones.fecha_inicio date NO
col sanciones.id uuid NO
col sanciones.motivo text YES
col sanciones.notas text YES
col sanciones.resolucion_url text YES
col sanciones.tipo_sancion character varying NO
comment resoluciones.creado_por ∅
comment sanciones.creado_por ∅
pol resolucion_entidades.resolucion_entidades_delete c2cb0e12ae1cff5f383e7bc3c5efee60
pol resolucion_entidades.resolucion_entidades_insert 3f38ad29c81ad76f3a9d9aa364255c97
pol resolucion_entidades.resolucion_entidades_select 7a26cdc2729437155a2514805fb17748
pol resolucion_entidades.resolucion_entidades_update c93e0192c669dd79e5ccc46ca56f92db
pol resoluciones.resoluciones_delete 9d695686b22058200e7561b36d525ed9
pol resoluciones.resoluciones_insert 851412fcb330fce19eebb3de7055282c
pol resoluciones.resoluciones_select bd6203cb2a293196a30603f45ccf2556
pol resoluciones.resoluciones_update 037b23db86ad676cb86984cac876da25
pol sanciones.sanciones_delete 06c736d81c93b99ecdc19b348c5804d5
pol sanciones.sanciones_insert 851412fcb330fce19eebb3de7055282c
pol sanciones.sanciones_select 32f0c2e74c578a5806836d566c8dcf16
pol sanciones.sanciones_update 037b23db86ad676cb86984cac876da25
```
```
$ diff <(sort f_antes.txt) <(sort prod_antes.txt) && echo "PROD ANTES = SANDBOX ANTES (45/45)"
PROD ANTES = SANDBOX ANTES (45/45)
```

### 1.b Aplicación

`apply_migration` con el **texto completo** de cada archivo de la rama (A md5 del archivo `12c176afbbe88d6ad4033360acdbeaeb`),
en orden A, B, C → `{"success":true}` ×3.

```
versiones: 20260927223658 resoluciones_sanciones_autor | 20260927223701 audit_resoluciones_sanciones | 20260927223704 resoluciones_delete_super_admin
```

A los tres archivos se les agregó después un bloque `ESTADO EN PRODUCCIÓN` (sólo comentarios; las sentencias son las
aplicadas).

### 1.c Prod después = esperado

Prod después (55 líneas):

```
col resolucion_entidades.descripcion text YES
col resolucion_entidades.entidad_id uuid NO
col resolucion_entidades.entidad_tipo character varying NO
col resolucion_entidades.id uuid NO
col resolucion_entidades.resolucion_id uuid NO
col resoluciones.club_id uuid NO
col resoluciones.creado_por uuid YES
col resoluciones.created_at timestamp with time zone NO
col resoluciones.documento_url text YES
col resoluciones.estado character varying NO
col resoluciones.fecha date NO
col resoluciones.id uuid NO
col resoluciones.modificado_at timestamp with time zone YES
col resoluciones.modificado_por uuid YES
col resoluciones.numero character varying NO
col resoluciones.reunion_id uuid YES
col resoluciones.texto text YES
col resoluciones.tipo character varying NO
col sanciones.alcance character varying NO
col sanciones.club_id uuid NO
col sanciones.codigo_resolucion character varying YES
col sanciones.creado_por uuid YES
col sanciones.created_at timestamp with time zone NO
col sanciones.entidad_id uuid NO
col sanciones.entidad_tipo USER-DEFINED NO
col sanciones.estado USER-DEFINED NO
col sanciones.fecha_fin date YES
col sanciones.fecha_inicio date NO
col sanciones.id uuid NO
col sanciones.modificado_at timestamp with time zone YES
col sanciones.modificado_por uuid YES
col sanciones.motivo text YES
col sanciones.notas text YES
col sanciones.resolucion_url text YES
col sanciones.tipo_sancion character varying NO
comment resoluciones.creado_por 208f870519eb969e9f4d7f1825a26f86
comment sanciones.creado_por 955f1853042b6b551c95a47c77e7e39a
fn fn_autor_fila b9f80c456cd3578ab5fbd11c51df7a24
pol resolucion_entidades.resolucion_entidades_delete c2cb0e12ae1cff5f383e7bc3c5efee60
pol resolucion_entidades.resolucion_entidades_insert 3f38ad29c81ad76f3a9d9aa364255c97
pol resolucion_entidades.resolucion_entidades_select 7a26cdc2729437155a2514805fb17748
pol resolucion_entidades.resolucion_entidades_update c93e0192c669dd79e5ccc46ca56f92db
pol resoluciones.resoluciones_delete 06c736d81c93b99ecdc19b348c5804d5
pol resoluciones.resoluciones_insert 851412fcb330fce19eebb3de7055282c
pol resoluciones.resoluciones_select bd6203cb2a293196a30603f45ccf2556
pol resoluciones.resoluciones_update 037b23db86ad676cb86984cac876da25
pol sanciones.sanciones_delete 06c736d81c93b99ecdc19b348c5804d5
pol sanciones.sanciones_insert 851412fcb330fce19eebb3de7055282c
pol sanciones.sanciones_select 32f0c2e74c578a5806836d566c8dcf16
pol sanciones.sanciones_update 037b23db86ad676cb86984cac876da25
trg resolucion_entidades.trg_audit_resolucion_entidades 4f82c47c477cc53f09c96fc5b5894791
trg resoluciones.trg_audit_resoluciones 72027e41bf602ad38a24f734a97a843b
trg resoluciones.trg_resoluciones_autor 50ed8be0091e9bfd074fd03c3e720da8
trg sanciones.trg_audit_sanciones 05fa0a501381d10a90a46ccb3325abc9
trg sanciones.trg_sanciones_autor 8ae7c307a7e2be70a1c9987e5b1aa5a0
```
```
$ diff <(sort prod_despues.txt) <(grep -v '^#' tests/local/resoluciones_sanciones_md5_esperado.txt | sort) && echo "PROD DESPUÉS = ESPERADO"
PROD DESPUÉS = ESPERADO (55/55)
```

Diferencia antes → después en prod (lo que cambió):

```
12a13,14
> col resoluciones.modificado_at timestamp with time zone YES
> col resoluciones.modificado_por uuid YES
27a30,31
> col sanciones.modificado_at timestamp with time zone YES
> col sanciones.modificado_por uuid YES
32,33c36,38
< comment resoluciones.creado_por ∅
< comment sanciones.creado_por ∅
---
> comment resoluciones.creado_por 208f870519eb969e9f4d7f1825a26f86
> comment sanciones.creado_por 955f1853042b6b551c95a47c77e7e39a
> fn fn_autor_fila b9f80c456cd3578ab5fbd11c51df7a24
38c43
< pol resoluciones.resoluciones_delete 9d695686b22058200e7561b36d525ed9
---
> pol resoluciones.resoluciones_delete 06c736d81c93b99ecdc19b348c5804d5
45a51,55
> trg resolucion_entidades.trg_audit_resolucion_entidades 4f82c47c477cc53f09c96fc5b5894791
> trg resoluciones.trg_audit_resoluciones 72027e41bf602ad38a24f734a97a843b
> trg resoluciones.trg_resoluciones_autor 50ed8be0091e9bfd074fd03c3e720da8
> trg sanciones.trg_audit_sanciones 05fa0a501381d10a90a46ccb3325abc9
> trg sanciones.trg_sanciones_autor 8ae7c307a7e2be70a1c9987e5b1aa5a0
```

---

## 2. Probe contra prod — `tests/probe_resoluciones_sanciones_autor.mjs --prod --mutantes`

`--prod`: usuarios sintéticos (secretario, operador, super_admin, profesional del portal en Dolores; operador en Mi Club
Hípico), cada uno con cuenta de Auth y sesión por magiclink; fixtures marcados `PROBE-097-…`; el `finally` borra
fixtures, después la auditoría de esos usuarios, después los usuarios y sus cuentas de Auth. Sin A8 (no hay sesión
directa desde node) y sin M1–M7.

```bash
set -a; . ./.env; set +a
node tests/probe_resoluciones_sanciones_autor.mjs --prod --mutantes
```
```
contexto: RUN=PROBE-097-1790548703276 · PROD (sin mutantes de base) · 5 perfiles
✅ A1) secretario crea resolución: creado_por = él (ignora el del cliente), modificado_* NULL
✅ A2) operador crea sanción sin mandar autor: creado_por = él
✅ A3) super_admin crea resolución: creado_por = él
✅ A4) service_role (sin sesión) crea resolución mandando autor: creado_por NULL
✅ A5) operador edita: creado_por congelado (secretario), modificado_por = operador, modificado_at ahora
✅ A6) secretario edita la sanción: creado_por congelado (operador), modificado_por = secretario
✅ A7) service_role edita: creado_por congelado, modificado_por NULL, modificado_at ahora
✅ B1) resolución: INSERT del secretario + UPDATE del operador + UPDATE sin sesión, con su usuario
✅ B2) sanción: INSERT del operador + UPDATE del secretario
✅ B3) INSERT sin sesión queda auditado con usuario NULL
✅ B4) resolucion_entidades: INSERT auditado con el secretario y su club
✅ C1.sec) secretario_carreras no puede borrar una resolución (0 filas, sigue)
✅ C2.sec) secretario_carreras no puede borrar una sanción (0 filas, sigue)
✅ C1.ope) operador no puede borrar una resolución (0 filas, sigue)
✅ C2.ope) operador no puede borrar una sanción (0 filas, sigue)
✅ C3) super_admin borra la resolución
✅ B5) el borrado queda auditado (resolución con super_admin + su entidad por cascada)
✅ C4) super_admin borra la sanción
✅ C5) portal: crear resolución → 42501
✅ C6) portal: crear sanción → 42501
✅ C7) portal: editar resolución → 0 filas
✅ C8) portal: borrar resolución → 0 filas
✅ C9) operador de otro club: crear resolución de Dolores → 42501
✅ D1.resoluciones.sec) botón borrar oculto para secretario_carreras
✅ D1.resoluciones.ope) botón borrar oculto para operador
✅ D1.resoluciones.sa) botón borrar visible para super_admin
✅ D2.resoluciones) deleteRecord como operador: error "no tenés permiso", nada de "eliminada", la fila sigue
✅ D1.sanciones.sec) botón borrar oculto para secretario_carreras
✅ D1.sanciones.ope) botón borrar oculto para operador
✅ D1.sanciones.sa) botón borrar visible para super_admin
✅ D2.sanciones) deleteRecord como operador: error "no tenés permiso", nada de "eliminada", la fila sigue
✅ D3) auditoria.html ofrece resoluciones, resolucion_entidades y sanciones

SUITE: 32/32
💀 muere M8 resoluciones.html muestra borrar a todos — 2/9: D1.resoluciones.sec) botón borrar oculto para secretario_carreras | D1.resoluciones.ope) botón borrar oculto para operador
💀 muere M9 resoluciones.html sin chequeo de 0 filas — 1/9: D2.resoluciones) deleteRecord como operador: error "no tenés permiso", nada de "eliminada", la fila sigue
💀 muere M10 sanciones.html muestra borrar a todos — 2/9: D1.sanciones.sec) botón borrar oculto para secretario_carreras | D1.sanciones.ope) botón borrar oculto para operador
💀 muere M11 sanciones.html sin chequeo de 0 filas — 1/9: D2.sanciones) deleteRecord como operador: error "no tenés permiso", nada de "eliminada", la fila sigue
MUTANTES: 4/4 muertos
✅ Z) limpieza: {"resoluciones":0,"sanciones":0,"entidades":0,"usuarios":0}
```

### 2.b A8 en prod (sesión directa), transacción revertida

```sql
begin;
create temp table _a8 (paso text, valor text) on commit drop;
grant all on _a8 to authenticated;
select set_config('request.jwt.claims', json_build_object('sub',(select auth_user_id from usuarios where email='dolores@sgh.com'),'role','authenticated','email','dolores@sgh.com')::text, true);
set local role authenticated;
insert into resoluciones (club_id, numero, fecha, tipo, texto) values ('0649e9c5-9e87-4aad-842f-101458e6b33c','PROBE-097-A8','2099-01-01','probe','A8');
insert into _a8 select 'creado_por tras INSERT con sesión = secretario genérico', ((select creado_por from resoluciones where numero='PROBE-097-A8') = (select id from usuarios where email='dolores@sgh.com'))::text;
reset role;
update resoluciones set creado_por = null where numero='PROBE-097-A8';
insert into _a8 select 'creado_por tras UPDATE por sesión directa (postgres) = sigue igual', ((select creado_por from resoluciones where numero='PROBE-097-A8') = (select id from usuarios where email='dolores@sgh.com'))::text;
insert into _a8 select 'modificado_por tras UPDATE sin sesión', coalesce((select modificado_por::text from resoluciones where numero='PROBE-097-A8'),'NULL');
insert into _a8 select 'auditoría de la resolución (INSERT con usuario, UPDATE sin)', (select string_agg(accion||':'||coalesce(left(usuario_id::text,8),'NULL'), ', ' order by created_at) from auditoria where tabla='resoluciones' and registro_id=(select id from resoluciones where numero='PROBE-097-A8'));
select string_agg(paso||' = '||valor, E'\n' order by ctid) resultado from _a8;
rollback;
```
```
creado_por tras INSERT con sesión = secretario genérico = true
creado_por tras UPDATE por sesión directa (postgres) = sigue igual = true
modificado_por tras UPDATE sin sesión = 9ac2d140-faec-424c-9437-0cedeb8b8b82
auditoría de la resolución (INSERT con usuario, UPDATE sin) = INSERT:9ac2d140, UPDATE:9ac2d140
```

Lectura: `creado_por` **congelado** también ante una sesión directa (lo que se quería verificar). El `modificado_por`
y el usuario del UPDATE salieron con el secretario y no NULL por un **artefacto del test**: los `request.jwt.claims`
que se setearon con `set_config(..., true)` siguen vigentes en la transacción después de `reset role`, así que
`auth.uid()` todavía lo devuelve. Una migración real no tiene claims. El caso "sin sesión → NULL" está cubierto por
A7 (service_role) en la corrida del probe. Todo revertido: `PROBE-097-A8` no existe (§5).

---

## 3. Sandbox (mutantes de base)

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=$(cat tests/local/out/jwt) LOCAL_JWT_SECRET=$(cat tests/local/out/jwt_secret) PSQL_CMD="tests/local/up.sh sql" node tests/probe_resoluciones_sanciones_autor.mjs --mutantes
```
```
contexto: RUN=PROBE-097-1790548696783 · sandbox · 5 perfiles
✅ A1) secretario crea resolución: creado_por = él (ignora el del cliente), modificado_* NULL
✅ A2) operador crea sanción sin mandar autor: creado_por = él
✅ A3) super_admin crea resolución: creado_por = él
✅ A4) service_role (sin sesión) crea resolución mandando autor: creado_por NULL
✅ A5) operador edita: creado_por congelado (secretario), modificado_por = operador, modificado_at ahora
✅ A6) secretario edita la sanción: creado_por congelado (operador), modificado_por = secretario
✅ A7) service_role edita: creado_por congelado, modificado_por NULL, modificado_at ahora
✅ A8) sesión directa (migración) tampoco cambia creado_por
✅ B1) resolución: INSERT del secretario + UPDATE del operador + UPDATE sin sesión, con su usuario
✅ B2) sanción: INSERT del operador + UPDATE del secretario
✅ B3) INSERT sin sesión queda auditado con usuario NULL
✅ B4) resolucion_entidades: INSERT auditado con el secretario y su club
✅ C1.sec) secretario_carreras no puede borrar una resolución (0 filas, sigue)
✅ C2.sec) secretario_carreras no puede borrar una sanción (0 filas, sigue)
✅ C1.ope) operador no puede borrar una resolución (0 filas, sigue)
✅ C2.ope) operador no puede borrar una sanción (0 filas, sigue)
✅ C3) super_admin borra la resolución
✅ B5) el borrado queda auditado (resolución con super_admin + su entidad por cascada)
✅ C4) super_admin borra la sanción
✅ C5) portal: crear resolución → 42501
✅ C6) portal: crear sanción → 42501
✅ C7) portal: editar resolución → 0 filas
✅ C8) portal: borrar resolución → 0 filas
✅ C9) operador de otro club: crear resolución de Dolores → 42501
✅ D1.resoluciones.sec) botón borrar oculto para secretario_carreras
✅ D1.resoluciones.ope) botón borrar oculto para operador
✅ D1.resoluciones.sa) botón borrar visible para super_admin
✅ D2.resoluciones) deleteRecord como operador: error "no tenés permiso", nada de "eliminada", la fila sigue
✅ D1.sanciones.sec) botón borrar oculto para secretario_carreras
✅ D1.sanciones.ope) botón borrar oculto para operador
✅ D1.sanciones.sa) botón borrar visible para super_admin
✅ D2.sanciones) deleteRecord como operador: error "no tenés permiso", nada de "eliminada", la fila sigue
✅ D3) auditoria.html ofrece resoluciones, resolucion_entidades y sanciones

SUITE: 33/33
💀 muere M1 sin trg_resoluciones_autor — 6/24: A1) secretario crea resolución: creado_por = él (ignora el del cliente), modificado_* NULL | A3) super_admin crea resolución: creado_por = él | A4) service_role (sin sesión) crea resolución mandando autor: creado_por NULL | A5) operador edita: creado_por congelado (secretario), modificado_por = operador, modificado_at ahora | A7) service_role edita: creado_por congelado, modificado_por NULL, modificado_at ahora | A8) sesión directa (migración) tampoco cambia creado_por
💀 muere M2 fn_autor_fila no congela creado_por — 4/24: A5) operador edita: creado_por congelado (secretario), modificado_por = operador, modificado_at ahora | A6) secretario edita la sanción: creado_por congelado (operador), modificado_por = secretario | A7) service_role edita: creado_por congelado, modificado_por NULL, modificado_at ahora | A8) sesión directa (migración) tampoco cambia creado_por
💀 muere M3 sin trg_audit_resoluciones — 3/24: B1) resolución: INSERT del secretario + UPDATE del operador + UPDATE sin sesión, con su usuario | B3) INSERT sin sesión queda auditado con usuario NULL | B5) el borrado queda auditado (resolución con super_admin + su entidad por cascada)
💀 muere M4 sin trg_audit_sanciones — 1/24: B2) sanción: INSERT del operador + UPDATE del secretario
💀 muere M5 sin trg_audit_resolucion_entidades — 2/24: B4) resolucion_entidades: INSERT auditado con el secretario y su club | B5) el borrado queda auditado (resolución con super_admin + su entidad por cascada)
💀 muere M6 resoluciones_delete vuelve a staff — 4/24: C1.sec) secretario_carreras no puede borrar una resolución (0 filas, sigue) | C1.ope) operador no puede borrar una resolución (0 filas, sigue) | C3) super_admin borra la resolución | B5) el borrado queda auditado (resolución con super_admin + su entidad por cascada)
💀 muere M7 sin trg_sanciones_autor — 2/24: A2) operador crea sanción sin mandar autor: creado_por = él | A6) secretario edita la sanción: creado_por congelado (operador), modificado_por = secretario
💀 muere M8 resoluciones.html muestra borrar a todos — 2/9: D1.resoluciones.sec) botón borrar oculto para secretario_carreras | D1.resoluciones.ope) botón borrar oculto para operador
💀 muere M9 resoluciones.html sin chequeo de 0 filas — 1/9: D2.resoluciones) deleteRecord como operador: error "no tenés permiso", nada de "eliminada", la fila sigue
💀 muere M10 sanciones.html muestra borrar a todos — 2/9: D1.sanciones.sec) botón borrar oculto para secretario_carreras | D1.sanciones.ope) botón borrar oculto para operador
💀 muere M11 sanciones.html sin chequeo de 0 filas — 1/9: D2.sanciones) deleteRecord como operador: error "no tenés permiso", nada de "eliminada", la fila sigue
MUTANTES: 11/11 muertos
✅ Z) limpieza: {"resoluciones":0,"sanciones":0,"entidades":0,"usuarios":0}
```

---

## 4. Los dos probes tocados

### 4.a `probe_politicas_escritura_staff.mjs --prod` (ISSUE-093; borrar resolución = sólo super_admin)

```
contexto: RUN=PROBE-093-1790548768413 · PROD · 7 perfiles con sesión real · pool apuestas=39
✅ resoluciones.DELETE.portal) 0 filas y fixture sigue
✅ resoluciones.DELETE.portal_prop) 0 filas y fixture sigue
✅ resoluciones.DELETE.inactivo) 0 filas y fixture sigue
✅ resoluciones.DELETE.otroclub) 0 filas y fixture sigue
✅ resoluciones.DELETE.secretario) 0 filas y fixture sigue (sólo super_admin borra)
✅ resoluciones.DELETE.operador) 0 filas y fixture sigue (sólo super_admin borra)
✅ resoluciones.DELETE.superadmin) 1 fila
MATRIZ: 281/281
✅ Z) limpieza por estado: {"resolucion_entidades":0,"resoluciones":0,"caballeriza_responsables":0,"carrera_apuestas":0,"categorias_carrera":0,"club_configuracion":0,"club_secuencias":0,"comision_config":0,"hipodromos":0,"liquidacion_config":0,"novedades_reunion":0,"resultado_apuestas":0,"resultado
```

(281 celdas en verde; arriba, la línea de contexto, el total, la limpieza y las 7 celdas de DELETE de resoluciones.)
En el sandbox, con mutantes: 281/281 y 14/14, con el restore reaplicando la pieza C (informe de fase 2).

### 4.b `probe_sanciones_alta.mjs` — prod y sandbox

Primera corrida en prod (antes de corregir la limpieza):

```
❌ Z) limpieza: 0 sanciones y 0 usuarios de prueba quedaron · errores: usuarios: update or delete on table "usuarios" violates foreign key constraint "auditoria_usuario_id_fkey" on table "auditoria"; usuarios: update or delete on table "usuarios" violates foreign key constraint "auditoria_usuario_id_fkey" on table "auditoria"
12/13 checks OK · PROD
```

(Los 12 chequeos funcionales, ✅. El título del chequeo Z es fijo; el error es lo que cuenta.) Lo que quedó:

```sql
select u.id, u.rol, u.email like 'probe-sanciones-%' es_probe, (select count(*) from auditoria a where a.usuario_id=u.id) audit_rows,
 (select string_agg(distinct a.tabla||'.'||a.accion, ',') from auditoria a where a.usuario_id=u.id) que,
 (select count(*) from auth.users au where au.id=u.auth_user_id) auth_vivo,
 (select count(*) from sanciones s where s.creado_por=u.id or s.modificado_por=u.id) sanciones_ref
from usuarios u where u.email like 'probe-sanciones-%';
```
```
id                                   | rol         | es_probe | audit_rows | que                               | auth_vivo | sanciones_ref
8d0cd776-aeae-4bdf-8205-faf99d3cf1fd | operador    | true     | 2          | sanciones.INSERT,sanciones.UPDATE | 0         | 0
17c10c85-a9d3-4816-af17-bdf304c2f0d6 | super_admin | true     | 1          | sanciones.INSERT                  | 0         | 0
```

Limpieza (service_role): `auditoria borradas: 3 · usuarios borrados: 2 · quedan: 0`. Corrección del probe: `limpiar()`
borra `auditoria` por `usuario_id` de sus usuarios antes de borrarlos (en el sandbox, sin tabla `auditoria`, se
tolera). Corridas siguientes:

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

13/13 checks OK · sandbox

── Mutantes ──
💀 M1 muerto — el alta sin club_id (A1a, A1b, A1c, A1d)
💀 M3 muerto — el alta sin alcance explícito (A1d)
💀 M4 muerto — INSERT sin fn_is_staff (B1)
💀 M5 muerto — UPDATE sin fn_is_staff (B2b)
💀 M6 muerto — INSERT sin el chequeo de club (C1)
💀 M7 muerto — UPDATE sin el chequeo de club (C2b)

6/6 mutantes muertos
```

---

## 5. Estado de prod después de todo

```sql
select (select count(*) from usuarios where email like 'probe-%') usuarios_probe, (select count(*) from auth.users where email like 'probe-%') auth_probe,
 (select count(*) from resoluciones where numero like 'PROBE-%') resol_probe, (select count(*) from sanciones where coalesce(notas,'')||coalesce(motivo,'') like '%PROBE-%') sanc_probe,
 (select count(*) from clubs) clubs, (select count(*) from spcs) spcs,
 (select string_agg(numero||' '||coalesce(creado_por::text,'NULL'), ' | ') from resoluciones) resoluciones,
 (select count(*) from sanciones) sanciones_total, (select count(*) from sanciones where creado_por is not null) sanciones_con_autor;
```
```
usuarios_probe | auth_probe | resol_probe | sanc_probe | clubs | spcs | resoluciones            | sanciones_total | sanciones_con_autor
0              | 0          | 0           | 0          | 3     | 210  | 40 NULL | 39 NULL       | 5               | 4
```

Quedan en `auditoria` las filas de los fixtures que se crearon y borraron **sin sesión** (service_role, `usuario_id`
NULL), como en el resto de los probes. Las de los usuarios sintéticos se borraron con ellos.

Control de pendientes sobre la rama del #26: `tests/control_pendientes_docs.sh HEAD` → vacío (exit 0). Los "sin
aplicar" de ISSUE-097 ya dicen "aplicadas".

---

## Qué falta

- **Merge del #26** (tu OK): despliega `resoluciones.html` y `sanciones.html` (botón de borrar sólo para
  super_admin; error en vez de "eliminada") y `auditoria.html` (las tres tablas en el filtro). Hasta el merge, en
  las pantallas de prod secretario y operador **siguen viendo** el botón de borrar resolución. Ahora la base lo
  rechaza (pieza C) y la pantalla todavía dice "Resolución eliminada" sin borrar: es el placebo que el front del #26
  corrige.
- Después del merge: md5 de las tres pantallas del sitio contra `main`.
