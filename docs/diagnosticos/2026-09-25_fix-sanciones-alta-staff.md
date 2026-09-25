# Sanciones: fix del alta + INSERT/UPDATE sólo para staff — PR #19, sin merge ni aplicar

- Fecha: 2026-09-25
- Rama `fix/sanciones-alta-club-staff` @ `132e9b70ca65cc3b3886ad14e2f1a0f90f75a26f` (base `main` @ `d133c05`) — PR https://github.com/mdqclio/SGH/pull/19 **sin merge**
- Guards: `pwd` = /home/clio/dev/SGH · `select count(*) from spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- **En prod no se escribió nada.** Lo que escribe (probe, migración, mutantes) corrió en el **sandbox local**
  (`tests/local/`), con `sanciones` recreada idéntica a prod: las 4 políticas dan el mismo md5 (Q2). En prod sólo hubo
  SELECT por MCP.

## Resumen

| Pedido | Resultado |
|---|---|
| 1. Alta con `club_id`, `creado_por` y `alcance` | ✅ `sanciones.html`: el INSERT manda `club_id: CLUB_ID`, `creado_por: currentUser.usuario_id` (`usuarios.id`; `initAuth` ahora pide `id`) y `alcance: 'club'`. El UPDATE sigue con el payload de siempre: no cambia ni club ni autor (Q1) |
| 2. INSERT/UPDATE exigen `fn_is_staff()` | ✅ `migrations/sanciones_insert_update_staff.sql` + rollback. md5 esperado: insert `851412fcb330fce19eebb3de7055282c`, update `037b23db86ad676cb86984cac876da25`. El rollback vuelve **exacto** a los md5 de hoy en prod (`ee075422…`, `d61391593…`) (Q2) |
| 3. Probe con datos sintéticos (SPC de la 9999, fechas 2099) | ✅ Antes de la migración (réplica de prod): **11/13**. Rojos B1 (el portal inserta) y **B2b (el portal revoca una sanción sobre sí mismo)**. Después: **13/13** y **7/7 mutantes muertos** (Q3) |
| 4. Otros INSERT que perdieron `club_id` | **Ninguno.** 15 inserts sobre tablas con `club_id` revisados; sólo `sanciones` lo había perdido (Q4) |

**Lo que el probe encontró más allá del pedido**: además de insertar, un usuario de portal puede **editar una sanción
sobre sí mismo**. La de SELECT se la deja ver, y la de UPDATE sólo pide el club. En la réplica la pasó a `revocada`.
La migración también lo cierra (B2b, mutante M5).

**Para Yesi**: alcanza con el cambio de `sanciones.html` (merge). La política actual ya deja pasar a un operador que
manda el `club_id` de su club (A1 en verde en el estado de hoy). La migración es la parte de seguridad, independiente.

---

## Q1 — Cambio en `sanciones.html`

```diff
diff --git a/sanciones.html b/sanciones.html
index a36a088..c2f7a0f 100644
--- a/sanciones.html
+++ b/sanciones.html
@@ -215,7 +215,7 @@
 <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 <script>
 let sb, CLUB_ID, currentUser;
-async function initAuth(){const{createClient}=supabase;sb=createClient('https://unlhcuanfrtpatoipwve.supabase.co','sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK');const{data:{session}}=await sb.auth.getSession();if(!session){window.location.replace('login.html');return false;}const{data:usr}=await sb.from('usuarios').select('club_id,nombre_completo,rol').eq('email',session.user.email).single();if(usr.rol==='super_admin'){const urlClub=new URLSearchParams(window.location.search).get('club');CLUB_ID=urlClub||localStorage.getItem('sgh_selected_club_id')||usr.club_id||null;}else{if(!usr.club_id){await sb.auth.signOut();window.location.replace('login.html');return false;}CLUB_ID=usr.club_id;}currentUser={...session.user,nombre_completo:usr.nombre_completo,rol:usr.rol};const uEl=document.getElementById('user-name');if(uEl)uEl.textContent=usr.nombre_completo||session.user.email;document.getElementById('auth-overlay').style.display='none';return true;}
+async function initAuth(){const{createClient}=supabase;sb=createClient('https://unlhcuanfrtpatoipwve.supabase.co','sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK');const{data:{session}}=await sb.auth.getSession();if(!session){window.location.replace('login.html');return false;}const{data:usr}=await sb.from('usuarios').select('id,club_id,nombre_completo,rol').eq('email',session.user.email).single();if(usr.rol==='super_admin'){const urlClub=new URLSearchParams(window.location.search).get('club');CLUB_ID=urlClub||localStorage.getItem('sgh_selected_club_id')||usr.club_id||null;}else{if(!usr.club_id){await sb.auth.signOut();window.location.replace('login.html');return false;}CLUB_ID=usr.club_id;}currentUser={...session.user,usuario_id:usr.id,nombre_completo:usr.nombre_completo,rol:usr.rol};const uEl=document.getElementById('user-name');if(uEl)uEl.textContent=usr.nombre_completo||session.user.email;document.getElementById('auth-overlay').style.display='none';return true;}
 function logout(){sb.auth.signOut().then(()=>window.location.replace('login.html'));}
 
 // Categorías: jockey, spc, caballeriza, profesional (entrenador)
@@ -372,9 +372,17 @@ async function saveRecord() {
     estado: document.getElementById('f-estado-s').value,
     notas: document.getElementById('f-notas').value.trim()||null,
   };
+  // Alta: el club dueño, quién la carga y el alcance van SIEMPRE. `club_id` es NOT NULL sin default
+  // y la política de INSERT lo compara contra el club del usuario: sin él, el alta rebota por RLS
+  // (se perdió en 5eb0e38, 07/05; diagnóstico 2026-09-25 en reports). `creado_por` es usuarios.id, no
+  // el auth.uid(). `alcance` explícito: por ahora siempre 'club'. En la edición no se tocan: una
+  // sanción no cambia de club ni de autor.
+  // ═══ ALTA SANCION — INICIO (el probe extrae y muta este bloque por estas anclas) ═══
+  const altaPayload = { ...payload, club_id: CLUB_ID, creado_por: currentUser?.usuario_id || null, alcance: 'club' };
+  // ═══ ALTA SANCION — FIN ═══
   const { error } = id
     ? await sb.from('sanciones').update(payload).eq('id',id)
-    : await sb.from('sanciones').insert(payload);
+    : await sb.from('sanciones').insert(altaPayload);
   btn.disabled=false; btn.textContent='Guardar';
   if (error) { toast(error.message,'error'); return; }
   toast(id ? 'Sanción actualizada' : 'Sanción creada');
```

## Q2 — Migración, rollback y md5 de las políticas

```sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- SEGURIDAD — sanciones: INSERT y UPDATE exigen además fn_is_staff() (igual que SELECT)
--
-- ESTADO EN PRODUCCIÓN: **NO APLICADA.** Sólo con OK explícito (PR fix/sanciones-alta-club-staff).
--
-- Por qué: sanciones_insert y sanciones_update sólo pedían `super_admin OR club_id = fn_get_user_club_id()`.
-- Un usuario del PORTAL (profesional/propietario) con club_id — hay 16 activos, todos con club — podía
-- crear o editar sanciones de su club por la API. La de SELECT ya distingue staff. Diagnóstico:
-- docs/diagnosticos/2026-09-25_sanciones-rls-insert-yesi.md (reports).
--
-- Qué hace: reemplaza las dos políticas por `super_admin OR (fn_is_staff() AND club_id = club del usuario)`.
-- fn_is_staff() = super_admin | secretario_carreras | operador, activo (sec_rls_fase2a_catalogos, 01/08).
-- No toca SELECT ni DELETE (DELETE ya es sólo super_admin).
--
-- md5 esperado (las políticas no tienen pg_get_functiondef: se mide sobre su texto deparseado, medido
-- aplicando ESTE archivo en el sandbox tests/local/ con el fixture tests/local/sanciones_sandbox.sql):
--   sanciones_insert → md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) = 851412fcb330fce19eebb3de7055282c
--   sanciones_update → md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) = 037b23db86ad676cb86984cac876da25
--   select policyname, md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) from pg_policies
--    where schemaname='public' and tablename='sanciones' and policyname in ('sanciones_insert','sanciones_update') order by 1;
--
-- Hoy en prod (sin aplicar): sanciones_insert ee075422773f3bdc4c1f562ef17c72ef · sanciones_update d61391593f16b3c8c5855054f6e496b6.
-- Rollback: migrations/rollback_sanciones_insert_update_staff.sql (vuelve a las definiciones del 25/09: da
-- exactamente esos dos md5, medido en el sandbox).
-- Probe: tests/probe_sanciones_alta.mjs.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS sanciones_insert ON public.sanciones;
CREATE POLICY sanciones_insert ON public.sanciones
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT fn_is_super_admin())
    OR ((SELECT fn_is_staff()) AND club_id = (SELECT fn_get_user_club_id()))
  );

DROP POLICY IF EXISTS sanciones_update ON public.sanciones;
CREATE POLICY sanciones_update ON public.sanciones
  FOR UPDATE TO authenticated
  USING (
    (SELECT fn_is_super_admin())
    OR ((SELECT fn_is_staff()) AND club_id = (SELECT fn_get_user_club_id()))
  )
  WITH CHECK (
    (SELECT fn_is_super_admin())
    OR ((SELECT fn_is_staff()) AND club_id = (SELECT fn_get_user_club_id()))
  );

COMMIT;
```
```sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK de migrations/sanciones_insert_update_staff.sql
--
-- Vuelve sanciones_insert y sanciones_update a sus definiciones de prod medidas el 2026-09-25
-- (pg_policies): `super_admin OR club_id = fn_get_user_club_id()`, SIN fn_is_staff(). Reabre el
-- agujero del portal: un profesional/propietario con club_id vuelve a poder insertar y editar.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS sanciones_insert ON public.sanciones;
CREATE POLICY sanciones_insert ON public.sanciones
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id())));

DROP POLICY IF EXISTS sanciones_update ON public.sanciones;
CREATE POLICY sanciones_update ON public.sanciones
  FOR UPDATE TO authenticated
  USING ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id())))
  WITH CHECK ((SELECT fn_is_super_admin()) OR (club_id = (SELECT fn_get_user_club_id())));

COMMIT;
```

md5 en prod hoy (MCP, sólo lectura):
```sql
select policyname, md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) md5 from pg_policies
where schemaname='public' and tablename='sanciones' order by 1;
```
```json
[{"policyname":"sanciones_delete","md5":"06c736d81c93b99ecdc19b348c5804d5"},{"policyname":"sanciones_insert","md5":"ee075422773f3bdc4c1f562ef17c72ef"},{"policyname":"sanciones_select","md5":"32f0c2e74c578a5806836d566c8dcf16"},{"policyname":"sanciones_update","md5":"d61391593f16b3c8c5855054f6e496b6"}]
```

Sandbox (`tests/local/up.sh sql < tests/local/sanciones_sandbox.sql`, después la migración, después el rollback):
```
== sandbox con fixture (= prod hoy?)
 sanciones_delete | 06c736d81c93b99ecdc19b348c5804d5
 sanciones_insert | ee075422773f3bdc4c1f562ef17c72ef
 sanciones_select | 32f0c2e74c578a5806836d566c8dcf16
 sanciones_update | d61391593f16b3c8c5855054f6e496b6
== después de la migración
 sanciones_delete | 06c736d81c93b99ecdc19b348c5804d5
 sanciones_insert | 851412fcb330fce19eebb3de7055282c
 sanciones_select | 32f0c2e74c578a5806836d566c8dcf16
 sanciones_update | 037b23db86ad676cb86984cac876da25
== después del rollback
 sanciones_delete | 06c736d81c93b99ecdc19b348c5804d5
 sanciones_insert | ee075422773f3bdc4c1f562ef17c72ef
 sanciones_select | 32f0c2e74c578a5806836d566c8dcf16
 sanciones_update | d61391593f16b3c8c5855054f6e496b6
```
El fixture reproduce prod exacto (4/4 md5 iguales). La migración cambia sólo INSERT y UPDATE. El rollback vuelve exacto.

## Q3 — Probe (`tests/probe_sanciones_alta.mjs`, sandbox)

Datos: una sanción sobre un SPC de la reunión 9999, fechas 2099-01-01/02 (nunca vigente), marca en `notas`, y 4
usuarios temporales (operador Dolores, profesional de portal Dolores con su `entidad_id`, operador de otro club,
super_admin) que se borran en el `finally` (check Z). `saveRecord` es el de `sanciones.html`, extraído y corrido con el
DOM stubeado y un espía que registra el payload.

**Antes de la migración** (políticas = prod de hoy):
```
$ SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=… LOCAL_JWT_SECRET=… node tests/probe_sanciones_alta.mjs
✅ A1a) operador (como Yesi): el alta por saveRecord no da error y crea la fila
✅ A1b) club_id = Dolores
✅ A1c) creado_por = usuarios.id del operador
✅ A1d) alcance = 'club' y mandado EXPLÍCITO en el payload (no por default)
✅ A2) edición por saveRecord: OK, cambia el motivo; club_id y creado_por no se tocan
❌ B1) portal (profesional) con club Dolores: INSERT → rechazado 42501
   → null
✅ B2a) (control) el portal VE la sanción sobre sí mismo (si no, B2b no probaría nada)
❌ B2b) portal: UPDATE de una sanción sobre sí mismo → no la cambia
   → {"motivo":"HACKEADO portal","estado":"revocada"}
✅ C1) operador de otro club: INSERT con club_id Dolores → rechazado 42501
✅ C2a) (control) el operador de otro club VE la sanción compartida de Dolores
✅ C2b) operador de otro club: UPDATE de una sanción de Dolores → no la cambia
✅ D1) super_admin: INSERT con club_id Dolores → OK
✅ Z) limpieza: 0 sanciones y 0 usuarios de prueba quedaron

11/13 checks OK · sandbox
```

**Después de la migración, con los mutantes**:
```
$ … PSQL_CMD="tests/local/up.sh sql" node tests/probe_sanciones_alta.mjs --mutantes
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
💀 M2 muerto — el alta sin creado_por (A1c, A2)
💀 M3 muerto — el alta sin alcance explícito (A1d)
💀 M4 muerto — INSERT sin fn_is_staff (B1)
💀 M5 muerto — UPDATE sin fn_is_staff (B2b)
💀 M6 muerto — INSERT sin el chequeo de club (C1)
💀 M7 muerto — UPDATE sin el chequeo de club (C2b)

7/7 mutantes muertos
```
Estado final del sandbox (el probe re-aplica la migración después de cada mutante de SQL):
```
    policyname    |               md5                
------------------+----------------------------------
 sanciones_delete | 06c736d81c93b99ecdc19b348c5804d5
 sanciones_insert | 851412fcb330fce19eebb3de7055282c
 sanciones_select | 32f0c2e74c578a5806836d566c8dcf16
 sanciones_update | 037b23db86ad676cb86984cac876da25
(4 rows)
```

Cómo mata cada mutante a su regla:

| Mutante | Regla | Lo mata |
|---|---|---|
| M1 | el alta manda `club_id` | A1a–A1d (sin `club_id` el alta rebota) |
| M2 | el alta manda `creado_por` | A1c, A2 |
| M3 | `alcance` explícito en el payload | A1d (el espía ve que no está en el payload aunque la columna tome el default) |
| M4 | INSERT exige staff | B1 |
| M5 | UPDATE exige staff | B2b (sanción sobre sí mismo, que el portal **ve**: el control B2a lo asegura) |
| M6 | INSERT exige el club | C1 |
| M7 | UPDATE exige el club | C2b (sanción de Dolores con alcance compartido, que el otro club **ve**: control C2a) |

(Los controles B2a/C2a están porque en una primera versión B2 y C2 pasaban "por casualidad": la política de SELECT
escondía la fila y la de UPDATE nunca se evaluaba, así que M5/M7 habrían quedado vivos.)

**Contra prod**: `node tests/probe_sanciones_alta.mjs --prod`, **sólo después** de aplicar la migración. Sin `--prod`,
el probe se niega a correr contra prod.

## Q4 — Otros INSERT que hayan perdido `club_id` (no se tocó ninguno)

Tablas con `club_id` en prod y su política de INSERT:
```sql
select c.table_name, c.is_nullable, coalesce(c.column_default,'—') club_id_default,
 (select string_agg(p.cmd||':'||coalesce(p.with_check, p.qual, ''), ' || ') from pg_policies p where p.schemaname='public' and p.tablename=c.table_name and p.cmd in ('INSERT','ALL')) politica_insert
from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'
where c.table_schema='public' and c.column_name='club_id' order by c.is_nullable, c.table_name;
```
| tabla | club_id | política INSERT |
|---|---|---|
| apoderados, caballerizas, liquidaciones, recibos, reuniones | NOT NULL | `NOT portal AND (super_admin OR club)` |
| categorias_carrera, club_configuracion, comision_config, hipodromos, resoluciones, **sanciones** | NOT NULL | `super_admin OR club` (**sin** exclusión de portal) |
| club_secuencias, liquidacion_config | NOT NULL | política `ALL`: `super_admin OR club` (sin exclusión de portal) |
| usuarios | NOT NULL | sólo super_admin |
| solicitudes_acceso | NOT NULL | sin política de INSERT (la escribe una RPC) |
| auditoria | nullable | — |
| profesionales, propietarios, spcs | nullable | `fn_is_staff()` |

Todos los inserts del front en `main`:
```
$ git grep -n -E "\.from\('[a-z_]+'\)\s*\.(insert|upsert)\(" main -- '*.html' '*.js'   (sin tests/docs/mockups)
admin.html:559 clubs insert({
admin.html:596 categorias_carrera insert(cats
caballerizas.html:578 caballeriza_responsables insert(toInsert
caballerizas.html:733 caballerizas insert(cabPayload
carta-llamados.html:1232 carreras insert(payload
categorias.html:251 categorias_carrera insert(payload
hipodromos.html:197 hipodromos insert(payload
inscripciones.html:849 inscripciones insert(payload
jockeys.html:508 profesionales insert(payload
liquidaciones-engine.js:400 liquidaciones insert(liqPayload
liquidaciones-engine.js:411 liquidacion_detalle insert(dRows
liquidaciones.html:2531 comision_config insert(payload
liquidaciones.html:666 liquidacion_config insert(payload
profesionales.html:532 profesionales insert(payload
profesionales.html:591 apoderados insert({
programa.html:617 carrera_apuestas insert(rows
propietarios.html:451 propietarios insert(payload
propietarios.html:500 apoderados insert({
resoluciones.html:317 resoluciones insert(payload
resultados.html:1682 performances insert(perfInserts
resultados_legacy.html:595 resultados insert(resPayload
resultados_legacy.html:631 resultado_posiciones insert(posData
resultados_legacy.html:657 performances insert(perfInserts
resultados_legacy.html:661 resultado_log insert({ resultado_id: resId, usuario_id: currentUser?.id, accion: 'oficializar', datos
resultados_legacy.html:671 resultado_log insert({ resultado_id: resId, usuario_id: currentUser?.id, accion: 'modificar_despues_o
reuniones.html:444 reuniones insert(payload
sanciones.html:377 sanciones insert(payload
spcs.html:731 spcs insert(payload
spcs.html:744 spc_propietarios insert(inserts
```

Payload de cada uno sobre una tabla con `club_id` (script en Python sobre `git show main:<archivo>`; busca `club_id` entre
la definición del payload y el insert):
```
OK  admin.html:596 categorias_carrera (var cats) · club_id en el bloque: True
      admin.html:595: ].map(c=>({...c,club_id:clubId,activo:true}));
OK  categorias.html:251 categorias_carrera (var payload) · club_id en el bloque: True
      categorias.html:241: club_id:CLUB_ID,nombre,
OK  caballerizas.html:733 caballerizas (var cabPayload) · club_id en el bloque: True
      caballerizas.html:716: club_id:   CLUB_ID,
OK  hipodromos.html:197 hipodromos (var payload) · club_id en el bloque: True
      hipodromos.html:157: const { data, error } = await sb.from('hipodromos').select('*').eq('club_id', CLUB_ID).order('nombre');
      hipodromos.html:196: const payload={club_id:CLUB_ID,nombre,sigla:document.getElementById('f-sigla').value.trim()||null,tipo_pista:document.getElementById('f-tipo-pista').value,localidad:docum
OK  liquidaciones-engine.js:400 liquidaciones (var liqPayload) · club_id en el bloque: True
      liquidaciones-engine.js:395: club_id: clubId, reunion_id: rid, estado: 'borrador',
OK  liquidaciones.html:2531 comision_config (var payload) · club_id en el bloque: True
      liquidaciones.html:2516: club_id: CLUB_ID,
OK  liquidaciones.html:666 liquidacion_config (var payload) · club_id en el bloque: True
      liquidaciones.html:654: club_id: CLUB_ID,
OK  profesionales.html:591 apoderados (var {) · club_id en el bloque: True
      profesionales.html:552: .eq('id', id).eq('club_id', CLUB_ID).select('id');
      profesionales.html:571: .eq('club_id', CLUB_ID).eq('autorizante_tipo', APO_TIPO).eq('autorizante_id', autorizanteId)
      profesionales.html:592: club_id: CLUB_ID, autorizante_tipo: APO_TIPO, autorizante_id: apoAutorizanteId,
OK  propietarios.html:500 apoderados (var {) · club_id en el bloque: True
      propietarios.html:480: .eq('club_id', CLUB_ID).eq('autorizante_tipo', APO_TIPO).eq('autorizante_id', autorizanteId)
      propietarios.html:501: club_id: CLUB_ID, autorizante_tipo: APO_TIPO, autorizante_id: apoAutorizanteId,
OK  resoluciones.html:317 resoluciones (var payload) · club_id en el bloque: True
      resoluciones.html:306: club_id: CLUB_ID,
OK  reuniones.html:444 reuniones (var payload) · club_id en el bloque: True
      reuniones.html:409: const { data, error } = await sb.rpc('siguiente_numero_publico', { p_club_id: CLUB_ID, p_fecha: fecha });
      reuniones.html:425: club_id: CLUB_ID,
FALTA sanciones.html:377 sanciones (var payload) · club_id en el bloque: False
== jockeys.html:508
   15:  const payload = {
   16:    club_id: CLUB_ID,
   33:  // Con `club_id` en el payload, un update por id sobre una ficha ajena no la editaría: la
   40:    ? await sb.from('profesionales').update(payload).eq('id', id).eq('club_id', CLUB_ID).select('id')
   41:    : await sb.from('profesionales').insert(payload);
== profesionales.html:532
   15:  const payload = {
   16:    club_id: CLUB_ID,
   32:  // Con `club_id` en el payload, un update por id sobre una ficha ajena no la editaría: la
   40:    ? await sb.from('profesionales').update(payload).eq('id', id).eq('club_id', CLUB_ID).select('id')
   41:    : await sb.from('profesionales').insert(payload);
== propietarios.html:451
   12:  // club_id explícito, igual que profesionales.html:397 (ISSUE-049). La columna es nullable y
   14:  // nacía con club_id NULL — y una ficha sin club es invisible para buscarFichas() de
   15:  // solicitudes.html, que filtra .eq('club_id', CLUB_ID). Ése es el circuito que rompía: Yesi
   17:  const payload = {
   18:    club_id: CLUB_ID,
   34:  // El UPDATE va acotado por club ADEMÁS de por id. Con club_id en el payload, un update por id
   40:    ? await sb.from('propietarios').update(payload).eq('id', id).eq('club_id', CLUB_ID).select('id')
   41:    : await sb.from('propietarios').insert(payload);
== spcs.html:731
   4:  const payload = {
   5:    club_id: null,
   41:    const { data, error } = await sb.from('spcs').insert(payload).select().single();
```
- **Sólo `sanciones.html:377` no manda `club_id`.** Es lo que se arregla en este PR.
- `spcs.html:731` manda `club_id: null` a propósito: los SPC son globales (GOTCHA #13).
- `jockeys.html`, `profesionales.html` y `propietarios.html` sí lo mandan (ISSUE-049/072).
- Fuera de ese patrón:
  - `resultados_legacy.html`: `resultados`/`resultado_posiciones`/`resultado_log` no tienen `club_id`.
  - `carta-llamados.html` (`carreras`), `inscripciones.html`, `programa.html` (`carrera_apuestas`), `resultados.html`
    (`performances`) y `caballerizas.html` (`caballeriza_responsables`): tablas sin columna `club_id`.
  - `admin.html:559` (`clubs`): es la tabla de clubes.

## Observación (misma familia que la de sanciones; no se tocó)

La tabla de Q4 muestra **8 tablas más** cuya escritura exige el club pero **no** excluye al portal, igual que
`sanciones` antes de este PR:
- con política de INSERT: `categorias_carrera`, `club_configuracion`, `comision_config`, `hipodromos`, `resoluciones`;
- con política `ALL`: `club_secuencias`, `liquidacion_config`.

Un usuario de portal con club (hoy 16) podría, por la API, insertar ahí para su club. Con `ALL`, también editar y
borrar. `liquidacion_config` (los % del reparto y los incentivos) y `club_secuencias` (la numeración de recibos) son
las más sensibles. **No lo verifiqué con escrituras**: surge del texto de las políticas. Si querés, lo mido en la
réplica del sandbox, igual que hoy.

## Pendiente (con tu OK)

1. **Merge del PR #19**. Sólo el HTML ya desbloquea a Yesi.
2. **Aplicar** `migrations/sanciones_insert_update_staff.sql`, comparar los dos md5 del encabezado y correr
   `node tests/probe_sanciones_alta.mjs --prod`.
3. Decidir sobre la Observación.

## Verificación del push (commit del informe)

```
$ git rev-parse HEAD
3539547810495ad6e4a4bdc1e2773e39bc4c9830
$ git ls-remote origin reports
3539547810495ad6e4a4bdc1e2773e39bc4c9830	refs/heads/reports
```
Este bloque va en un commit posterior ("verificación de push"): el SHA final de `reports` es el de ese commit.
