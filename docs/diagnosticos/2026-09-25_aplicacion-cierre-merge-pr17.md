# Paso 1 (migración + cierre R6/R8) aplicado y PR #17 mergeado — el recálculo de R9 NO se corrió

- Fecha: 2026-09-25
- `main` después del merge: **`afc6af59a29c5aa76b551104616cda0791f5aa74`** (merge de PR #17; head del PR `1427e7e`)
- Guards antes de escribir: `pwd` = /home/clio/dev/SGH · `select count(*) from spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- Escrituras en prod de esta sesión, **todas**: (1) `apply_migration` `reunion_liquidacion_cerrada_issue_091`;
  (2) la prueba del INSERT sobre R6, que **rebotó**, más un usuario de auth temporal creado y borrado para esa prueba.
  **El recálculo de R9 NO se corrió** (falta la ventana de Valeria).

## Resumen

| Pedido | Resultado |
|---|---|
| Aplicar la migración (paso 1) | ✅ `20260925163044 reunion_liquidacion_cerrada_issue_091`, con el texto exacto de `migrations/reunion_liquidacion_cerrada.sql` (md5 del archivo `9fc7bcc24d702060a48fd8407f3b9188`, igual al del PR) |
| md5 de `pg_get_functiondef` de las 3 funciones contra el esperado | ✅ las tres coinciden (Q2) |
| R6 y R8 con `liquidacion_cerrada_at` | ✅ las dos con `2026-09-25 16:30:44.073618+00` y la nota de "congelada" (Q3). Son las únicas cerradas: 2 de 14 reuniones |
| R9 en NULL | ✅ (Q3) |
| INSERT sobre R6 desde la API → P0091 | ✅ `{"status":500,"error":{"code":"P0091",…}}` con una sesión `authenticated` real (Q5). No quedó ninguna fila; usuario temporal borrado |
| Líneas de R6/R8/R9 sin tocar | ✅ md5 idéntico antes y después (Q1 = Q3) |
| Merge del PR #17 | ✅ `main` = `afc6af59a29c5aa76b551104616cda0791f5aa74` |
| md5 de `liquidaciones.html` y `resultados.html` en el sitio contra `main` | ✅ los dos iguales; también `liquidaciones-engine.js` (Q7) |
| Recálculo de R9 | ⏸ **NO corrido.** Espera tu confirmación de la ventana |

**Dos cosas para decidir** (§ Hallazgos):
1. `fn_reunion_liq_cerrada` quedó ejecutable por `anon`/`authenticated` vía `/rest/v1/rpc/`. Me faltó su REVOKE. No
   lo corregí sin OK.
2. **Riesgo operativo desde ahora**: con el motor nuevo en el sitio, **cualquier** recálculo de R9 desde la UI genera
   las 69 sub-líneas **en ese momento**, sin copia previa y sin la verificación del script. Lo disparan "🔄 Recalcular"
   en Liquidaciones, oficializar una carrera de R9 o cambiar una monta en una carrera oficial de R9. Hasta que corra
   el script, conviene que nadie haga nada de eso en R9.

---

## Q0 — Estado de la rama y del archivo antes de aplicar

```
$ git fetch origin; git branch --show-current; git status --short; git rev-parse HEAD origin/feat/reparto-100-subroles origin/main
feat/reparto-100-subroles
02c94bb02d75b0c640d31fe6e0f3bb0b63c7337b
02c94bb02d75b0c640d31fe6e0f3bb0b63c7337b
a4ec2adf84c78dbaf4264f7ea561a5653d0dc35f
$ gh pr view 17 --json state,mergeable,headRefOid,baseRefName,commits
{"baseRefName":"main","headRefOid":"02c94bb02d75b0c640d31fe6e0f3bb0b63c7337b","mergeable":"MERGEABLE","n":3,"state":"OPEN"}
$ md5sum migrations/reunion_liquidacion_cerrada.sql; git show origin/feat/reparto-100-subroles:migrations/reunion_liquidacion_cerrada.sql | md5sum; wc -c …
9fc7bcc24d702060a48fd8407f3b9188  migrations/reunion_liquidacion_cerrada.sql
9fc7bcc24d702060a48fd8407f3b9188  -
8209 migrations/reunion_liquidacion_cerrada.sql
```

## Q1 — Foto de prod antes de aplicar

```sql
select (select count(*) from spcs) spcs,
 (select count(*) from information_schema.columns where table_name='reuniones' and column_name like 'liquidacion_cerrada%') cols_ya,
 (select count(*) from pg_proc where proname in ('fn_reunion_liq_cerrada','fn_liq_cerrada_guard','fn_reunion_cierre_guard')) fns_ya,
 (select md5(string_agg(d::text,'|' order by d.id)) from liquidacion_detalle d where reunion_id='b02ca761-6f44-4720-86aa-a3c3099019ea') md5_r6,
 (select md5(string_agg(d::text,'|' order by d.id)) from liquidacion_detalle d where reunion_id='7b6e003e-22e2-4629-bf55-f18560b1260f') md5_r8,
 (select md5(string_agg(d::text,'|' order by d.id)) from liquidacion_detalle d where reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9') md5_r9,
 (select count(*) from liquidacion_detalle where reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9') r9_lineas;
```
```json
[{"spcs":210,"cols_ya":0,"fns_ya":0,"md5_r6":"85051a817b77f6cda3337bee07741697","md5_r8":"fc82ef1b2a81d85eb4af7e7d369f5c44","md5_r9":"c33f00d6900252c6fd33fed3ce061aaa","r9_lineas":147}]
```

## Q2 — `apply_migration` y md5 de las funciones

`apply_migration(name='reunion_liquidacion_cerrada_issue_091', query=<el archivo entero, textual>)` → `{"success":true}`.

```sql
select p.proname, md5(pg_get_functiondef(p.oid)) md5, length(pg_get_functiondef(p.oid)) bytes, <esperado del encabezado> esperado
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('fn_reunion_liq_cerrada','fn_liq_cerrada_guard','fn_reunion_cierre_guard') order by 1;
```
```json
[{"proname":"fn_liq_cerrada_guard","md5":"e17f0c81a60afa0356fcda83819f5d4a","bytes":1042,"esperado":"e17f0c81a60afa0356fcda83819f5d4a"},{"proname":"fn_reunion_cierre_guard","md5":"e531d5094c6ca559d3e0898b38c8839c","bytes":799,"esperado":"e531d5094c6ca559d3e0898b38c8839c"},{"proname":"fn_reunion_liq_cerrada","md5":"11730b64066014745a40500ab5f97fb0","bytes":292,"esperado":"11730b64066014745a40500ab5f97fb0"}]
```

## Q3 — R6, R8 y R9 después de aplicar

```sql
select r.numero, r.id, r.liquidacion_cerrada_at, r.liquidacion_cerrada_nota,
 (select md5(string_agg(d::text,'|' order by d.id)) from liquidacion_detalle d where d.reunion_id=r.id) md5_lineas,
 (select count(*) from liquidacion_detalle d where d.reunion_id=r.id) lineas
from reuniones r where r.id in ('b02ca761-6f44-4720-86aa-a3c3099019ea','7b6e003e-22e2-4629-bf55-f18560b1260f','cafa37d6-89f4-45cb-a0d9-835bc27407e9') order by 1;
```
```json
[{"numero":6,"id":"b02ca761-6f44-4720-86aa-a3c3099019ea","liquidacion_cerrada_at":"2026-09-25 16:30:44.073618+00","liquidacion_cerrada_nota":"Congelada tal como está (saldado administrativo del 28/08): SIN el 8 % de peón/capataz/sereno y SIN las líneas de ISSUE-091. NO es la decisión final sobre esa plata: queda congelada hasta que Fede conteste. Decisión del 25/09/2026.","md5_lineas":"85051a817b77f6cda3337bee07741697","lineas":192},{"numero":8,"id":"7b6e003e-22e2-4629-bf55-f18560b1260f","liquidacion_cerrada_at":"2026-09-25 16:30:44.073618+00","liquidacion_cerrada_nota":"Congelada tal como está (saldado administrativo del 28/08): SIN el 8 % de peón/capataz/sereno y SIN las líneas de ISSUE-091. NO es la decisión final sobre esa plata: queda congelada hasta que Fede conteste. Decisión del 25/09/2026.","md5_lineas":"fc82ef1b2a81d85eb4af7e7d369f5c44","lineas":225},{"numero":9,"id":"cafa37d6-89f4-45cb-a0d9-835bc27407e9","liquidacion_cerrada_at":null,"liquidacion_cerrada_nota":null,"md5_lineas":"c33f00d6900252c6fd33fed3ce061aaa","lineas":147}]
```

```sql
select count(*) filter (where liquidacion_cerrada_at is not null) cerradas, count(*) total,
 string_agg(numero::text, ',' order by numero) filter (where liquidacion_cerrada_at is not null) cuales,
 (select version||' '||name from supabase_migrations.schema_migrations order by version desc limit 1) ultima_migracion
from reuniones;
```
```json
[{"cerradas":2,"total":14,"cuales":"6,8","ultima_migracion":"20260925163044 reunion_liquidacion_cerrada_issue_091"}]
```

## Q4 — Triggers

```sql
select t.tgname, c.relname, t.tgenabled, pg_get_triggerdef(t.oid) def from pg_trigger t join pg_class c on c.oid=t.tgrelid
where t.tgname in ('trg_liq_detalle_cerrada','trg_liquidaciones_cerrada','trg_reunion_cierre') order by 1;
```
```json
[{"tgname":"trg_liq_detalle_cerrada","relname":"liquidacion_detalle","tgenabled":"O","def":"CREATE TRIGGER trg_liq_detalle_cerrada BEFORE INSERT OR DELETE OR UPDATE ON public.liquidacion_detalle FOR EACH ROW EXECUTE FUNCTION fn_liq_cerrada_guard()"},{"tgname":"trg_liquidaciones_cerrada","relname":"liquidaciones","tgenabled":"O","def":"CREATE TRIGGER trg_liquidaciones_cerrada BEFORE INSERT OR DELETE OR UPDATE ON public.liquidaciones FOR EACH ROW EXECUTE FUNCTION fn_liq_cerrada_guard()"},{"tgname":"trg_reunion_cierre","relname":"reuniones","tgenabled":"O","def":"CREATE TRIGGER trg_reunion_cierre BEFORE INSERT OR UPDATE OF liquidacion_cerrada_at, liquidacion_cerrada_nota ON public.reuniones FOR EACH ROW EXECUTE FUNCTION fn_reunion_cierre_guard()"}]
```

## Q5 — INSERT sobre R6 desde la API (sesión `authenticated` real) → P0091

Script (scratchpad de la sesión; no está en el repo):
```js
// Prueba post-migración (25/09): un INSERT sobre R6 (cerrada) desde la API con sesión authenticated → P0091.
// Crea un usuario de auth temporal (sin fila en `usuarios`), prueba, y lo borra. Si el INSERT pasara,
// borra la fila con service_role (que el trigger deja pasar) y lo reporta como FALLA.
import { createRequire } from 'node:module';
const require = createRequire('/home/clio/dev/SGH/package.json');
const { createClient } = require('@supabase/supabase-js');
const URL = 'https://unlhcuanfrtpatoipwve.supabase.co';
const PUB = 'sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK';
const R6 = 'b02ca761-6f44-4720-86aa-a3c3099019ea';
const MARCA = 'PRUEBA-P0091-' + Date.now();
const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const email = `probe-p0091-${Date.now()}@example.invalid`;
let authId = null, falla = false;
try {
  const { data: au, error: e1 } = await admin.auth.admin.createUser({ email, password: 'Px-' + Math.random().toString(36).slice(2) + 'A9!', email_confirm: true });
  if (e1) throw e1; authId = au.user.id;
  const { data: link, error: e2 } = await admin.auth.admin.generateLink({ type: 'magiclink', email }); if (e2) throw e2;
  const user = createClient(URL, PUB, { auth: { persistSession: false } });
  const { error: e3 } = await user.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' }); if (e3) throw e3;
  const { data: sess } = await user.auth.getSession();
  console.log('sesión:', JSON.stringify({ role: sess.session?.user?.role, aud: sess.session?.user?.aud, fila_en_usuarios: false }));
  const { data: hdr } = await admin.from('liquidaciones').select('id').eq('reunion_id', R6).limit(1).single();
  const fila = { liquidacion_id: hdr.id, reunion_id: R6, concepto: MARCA, monto_bruto: 1, monto_descuento: 0,
                 concepto_tipo: 'actuacion', beneficiario_tipo: 'profesional', estado_linea: 'impago' };
  const r = await user.from('liquidacion_detalle').insert(fila).select('id');
  console.log('INSERT R6 como authenticated →', JSON.stringify({ status: r.status, error: r.error, data: r.data }));
  falla = r.error?.code !== 'P0091';
  console.log(falla ? '❌ no rebotó con P0091' : '✅ rebotó con P0091');
} finally {
  const { data: resto } = await admin.from('liquidacion_detalle').select('id').eq('concepto', MARCA);
  if (resto?.length) { falla = true; await admin.from('liquidacion_detalle').delete().eq('concepto', MARCA); }
  console.log('filas de prueba que quedaron en la base:', resto?.length ?? 'error');
  if (authId) { const { error } = await admin.auth.admin.deleteUser(authId); console.log('usuario temporal borrado:', !error, error?.message || ''); }
  const { data: chk } = await admin.from('usuarios').select('id').eq('auth_user_id', authId ?? '00000000-0000-0000-0000-000000000000');
  console.log('filas en usuarios del usuario temporal:', chk?.length ?? 'error');
}
if (falla) process.exitCode = 1;
```
Salida (`node test_insert_r6_api.mjs`):
```
sesión: {"role":"authenticated","aud":"authenticated","fila_en_usuarios":false}
INSERT R6 como authenticated → {"status":500,"error":{"code":"P0091","details":null,"hint":null,"message":"La liquidación de esta reunión está cerrada (saldada): no se puede modificar liquidacion_detalle. ISSUE-091"},"data":null}
✅ rebotó con P0091
filas de prueba que quedaron en la base: 0
usuario temporal borrado: true 
filas en usuarios del usuario temporal: 0
```
Control después:
```sql
select (select md5(string_agg(d::text,'|' order by d.id)) from liquidacion_detalle d where reunion_id='b02ca761-6f44-4720-86aa-a3c3099019ea') md5_r6,
 (select count(*) from auth.users where email like 'probe-p0091-%') usuarios_temporales,
 (select count(*) from liquidacion_detalle where concepto like 'PRUEBA-P0091-%') filas_prueba;
```
```json
[{"md5_r6":"85051a817b77f6cda3337bee07741697","usuarios_temporales":0,"filas_prueba":0}]
```

## Q6 — Probe, parte P, después de aplicar (`SOLO=P node tests/probe_reparto_100.mjs`, sólo lectura)

Ahora P6 ve el cierre **real** en la base, ya no "SIMULADO":
```
✅ P1) R9: el motor nuevo no da error y no toca líneas comprometidas (el DELETE filtra recibo NULL y ≠ pagado)
✅ P2) R9: nacen exactamente 69 líneas, todas peón/capataz/sereno (3 por caballo premiado)
✅ P3) R9: ninguna línea existente cambia de monto, estado o fecha (retenidas incluidas) y ninguna desaparece
✅ P4) R9: los 23 premiados reparten el 100 % exacto y el entrenador + personal = 18 % exacto
✅ P5) R9: la suma de las nuevas = Σ (18 % − 10 % del entrenador) por caballo, al centavo
✅ P6) R6 (cerrada en la base): el motor corta con 0 escrituras
✅ P6) R8 (cerrada en la base): el motor corta con 0 escrituras
✅ P7) md5 de las líneas de R6, R8 y R9: idéntico antes y después (el probe no escribió nada)

8/8 checks OK (sin la parte D: sandbox no disponible)
```

## Q7 — Merge y deploy

Antes del merge, un commit de docs en la rama (`1427e7e`): la migración pasa a figurar APLICADA en su encabezado, en
CLAUDE.md, CHANGELOG e ISSUE-091, con el recálculo de R9 como pendiente.

```
$ gh pr merge 17 --merge --subject "merge: reparto al 100 % (peón/capataz/sereno siempre, entrenador 18 %) + reuniones con la liquidación cerrada — PR #17"
$ git log --oneline -3 origin/main
afc6af5 merge: reparto al 100 % (peón/capataz/sereno siempre, entrenador 18 %) + reuniones con la liquidación cerrada — PR #17
1427e7e docs: migración reunion_liquidacion_cerrada APLICADA en prod (20260925163044) — md5 verificados, R6/R8 cerradas, R9 abierta, P0091 por la API; recálculo de R9 pendiente
02c94bb feat(liquidaciones): probe reparto 100 % (41/41, 5/5 mutantes) + recálculo de R9 con copia y rollback + docs
$ git rev-parse origin/main
afc6af59a29c5aa76b551104616cda0791f5aa74
```

md5 del sitio contra `main` (`curl -s "https://sigh.com.ar/<f>?v=$RANDOM"` vs `git show afc6af5:<f>`; coincidió al 4.º
intento, cada 20 s):
```
liquidaciones.html  main=bd2114df518a46b6fc819a45255093a1  sitio=bd2114df518a46b6fc819a45255093a1
resultados.html  main=5a3f6fef8d378112e8146b6b3bf15622  sitio=5a3f6fef8d378112e8146b6b3bf15622
liquidaciones-engine.js  main=9f9ab8830e31ea51580383c5790a5c59  sitio=9f9ab8830e31ea51580383c5790a5c59
built afc6af59a29c5aa76b551104616cda0791f5aa74 2026-09-25T16:34:06Z
```
(la última línea es `gh api repos/mdqclio/SGH/pages/builds/latest`: estado, commit, hora del build.)

## Q8 — Advisors de seguridad después del DDL (`get_advisors security`)

Se leyó la salida entera (80.519 caracteres, 74 lints) y se procesó con Python.
```
caracteres leídos: 80519 de 80519 (100 %) · lints: 74
26 ('anon_security_definer_function_executable', 'WARN')
1 ('auth_leaked_password_protection', 'WARN')
40 ('authenticated_security_definer_function_executable', 'WARN')
3 ('rls_disabled_in_public', 'ERROR')
3 ('rls_enabled_no_policy', 'INFO')
1 ('security_definer_view', 'ERROR')

ERROR e INFO (detalle):
- INFO rls_enabled_no_policy | Table \`archive.backup_inscripciones_20260515\` has RLS enabled, but no policies exist
- INFO rls_enabled_no_policy | Table \`archive.backup_spcs_20260515\` has RLS enabled, but no policies exist
- INFO rls_enabled_no_policy | Table \`public.spc_entrenadores_hist\` has RLS enabled, but no policies exist
- ERROR security_definer_view | View \`public.v_inscriptos_carrera\` is defined with the SECURITY DEFINER property
- ERROR rls_disabled_in_public | Table \`public.bak_r8_propietario\` is public, but RLS has not been enabled.
- ERROR rls_disabled_in_public | Table \`public._gate41_backfill_tenencia\` is public, but RLS has not been enabled.
- ERROR rls_disabled_in_public | Table \`public._bak_merge_duplicados_spc\` is public, but RLS has not been enabled.
- WARN auth_leaked_password_protection | Supabase Auth prevents the use of compromised passwords by checking against HaveIBeenPwned.org. Enable this feature to enhance security.

Objetos de ESTA migración:
- WARN anon_security_definer_function_executable | Function `public.fn_reunion_liq_cerrada(p_reunion_id uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/fn_reunion_liq_cerrada`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional. | https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- WARN authenticated_security_definer_function_executable | Function `public.fn_reunion_liq_cerrada(p_reunion_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/fn_reunion_liq_cerrada`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional. | https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
```

---

## Hallazgos

1. **`fn_reunion_liq_cerrada` ejecutable por `anon`/`authenticated`** (lints 0028/0029). Es mío: la migración revoca
   las dos funciones de trigger pero no esta. Lo único que expone es si una reunión tiene la liquidación cerrada (un
   boolean). La usan sólo los triggers, que son SECURITY DEFINER, así que revocarla no rompe nada. Propuesta, para
   aplicar con OK:
   ```sql
   REVOKE ALL ON FUNCTION public.fn_reunion_liq_cerrada(uuid) FROM PUBLIC, anon, authenticated;
   ```
   (La función no cambia, así que su md5 tampoco.)
2. **Previos a este cambio, pero hay que decirlos**: tres tablas en `public` **sin RLS** (`bak_r8_propietario`,
   `_gate41_backfill_tenencia`, `_bak_merge_duplicados_spc`). Por los nombres parecen respaldos, y si tienen datos de
   personas quedan legibles por la API. Además, la vista `v_inscriptos_carrera` es SECURITY DEFINER. No se tocaron.
3. **Riesgo operativo** hasta que corra el recálculo de R9: ver el Resumen. Cualquier recálculo de R9 desde la UI
   genera ya las 69 líneas, sin la copia ni la verificación del script. Si pasa igual, el script lo va a detectar: su
   plan en seco va a dar 0 nuevas. Las líneas quedarían bien calculadas (es el mismo motor), pero sin la foto previa.

## Pendiente

- **Ventana para el recálculo de R9** (me la confirmás vos):
  `node tests/recalculo_r9_subroles.mjs --ejecutar --ventana-confirmada`.
- OK para el REVOKE del hallazgo 1.
- Qué hacer con las tablas del hallazgo 2.

## Verificación del push (commit del informe)

```
$ git rev-parse HEAD
42faff248e47ec1fc09afac05feb6dfc994a56ec
$ git ls-remote origin reports
42faff248e47ec1fc09afac05feb6dfc994a56ec	refs/heads/reports
```
Este bloque va en un commit posterior ("verificación de push"): el SHA final de `reports` es el de ese commit.
