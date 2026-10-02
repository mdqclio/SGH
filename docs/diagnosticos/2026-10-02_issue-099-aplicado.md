# #49 — ISSUE-099: anon sin EXECUTE en las 31 funciones de `public` + default privileges: aplicado y mergeado

- Fecha: 2026-10-02
- Migración `revoke_anon_funciones_publicas`, versión `20261002225113`, aplicada a las 22:51 UTC. Sin actividad de staff desde las 21:38:09 UTC: eran las 19:51 en Argentina, fuera de horario.
- Rama `chore/revoke-anon-funciones` en `cf11806`, merge `025ede8`.
- Guards: pwd `/home/clio/dev/SGH`; proyecto `unlhcuanfrtpatoipwve`; club Dolores = 1 fila (consultado a las 22:50:46 UTC).
- Fase 1 (relevamiento): `2026-10-02_issue-099-funciones-anon-y-v-inscriptos-fase1.md`.

> En las salidas crudas de los probes, los uuid de fixtures (borrados en el teardown) van recortados a sus primeros 8 caracteres: el chequeo de datos personales
> confunde sus segmentos numéricos con teléfonos.

## Conclusión

Aplicado sin rollback. Queda así:

| | antes | después |
|---|---|---|
| funciones de `public` ejecutables por anon | 31 | **0** |
| con EXECUTE para PUBLIC (de las 31) | 23 | 0 |
| grupo A (25): authenticated / service_role | 25 / 25 | 25 / 25 |
| grupo B (6, triggers + `fn_solicitudes_guard_staff`): authenticated / service_role | 6 / 6 | **0** / 6 |
| md5 de `pg_get_functiondef` (agregado A / B) | `7a1ea99e8f6cadb366ade8c7c793658a` / `60d0ab272d06adaa88749e10585a95c7` | idénticos |
| default ACL de postgres para funciones, en `public` | anon, authenticated, service_role | authenticated, service_role |
| default ACL global de postgres para funciones | (no había entrada → PUBLIC por defecto) | `{postgres=X/postgres}` (sin PUBLIC) |
| probe `--prod` (anon por la API, 26 llamables) | 0/26 (anon entraba a las 26) | **26/26** → 401 / 42501 |
| advisor `anon_security_definer_function_executable` | 26 | **0** |
| advisor `authenticated_security_definer_function_executable` | 41 | 37 (bajan las 4 definer del grupo B) |

**Caminos con sesión real después del apply.** No se rompió nada:

| probe | resultado |
|---|---|
| `probe_v_inscriptos_cerrada` | 6/6 |
| `probe_portal_alta_spc_prod` (portal: padrón, `rpc_inscribir`, políticas con los helpers) | 14/14 |
| `probe_inscripciones_alta_spc_prod` (staff: Edge Function con `fn_is_staff`/`fn_is_portal_user` por JWT, INSERT de inscripción) | 13/13 |
| `probe_resoluciones_sanciones_autor --prod` (trigger `fn_autor_fila`, que perdió EXECUTE, disparando con sesiones staff reales) | 32/32 |
| `correr_todos.sh` | 34 verdes, 12 conocidos, 0 nuevos |

**`probe_xss_portal_nombres` dio 53/58, y no es por el apply.** El probe usa la key secreta (service_role conserva EXECUTE en las 31). Los 5 rojos son
`U2.*) fila renderizada`: el probe ubica la fila del usuario de portal por su botón "Editar", y desde `846b7b6` (27/09) `usuarios.html` no le pone
"Editar" a los usuarios de portal (`puedeEditar = !esPortal(u) && …`). Es drift previo del probe, que quedó desactualizado una hora después de escrito.
La limpieza dio OK (`usuarios probe.xss=0 · inscripciones del probe=0 · 9999 mismas inscripciones`). Hay que adaptarlo; no bloquea.

## Preguntas abiertas

1. `fn_insc_monta_oficial_guard` es una función de trigger, SECURITY DEFINER, que authenticated puede ejecutar. No estaba en las 31 porque anon no la tenía. ¿Pasa al grupo B en otra tarea?
2. El default ACL de postgres en `public` sigue dándole a **anon** `arwdDxtm` sobre **tablas** nuevas y `rwU` sobre **secuencias** nuevas. Hoy las protege
   la RLS, pero es el mismo patrón que causó ISSUE-099. ¿Se cierra también?
3. Default de funciones en el esquema `storage`: sigue con anon. No lo toqué porque no creamos funciones ahí.
4. Advisor `auth_leaked_password_protection`: deshabilitado. Es un ajuste de Auth en el dashboard, no SQL.

## Rollback (no usado)

`migrations/rollback_revoke_anon_funciones_publicas.sql` vuelve al `proacl` de antes (como conjunto) y a los defaults anteriores. Está probado en el sandbox:
R1 y R2 del probe, 16/16.

## Foto ANTES (prod, 22:4x UTC)

```sql
select p.oid::regprocedure::text fn, p.proacl::text acl, md5(pg_get_functiondef(p.oid)) md5
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and p.proname in (…las 31…)
union all select '(anon ejecutables en public)', count(*)::text, '' from pg_proc … where has_function_privilege('anon', p.oid, 'EXECUTE')
union all select '(default acl postgres f) '||coalesce(defaclnamespace::regnamespace::text,'(global)'), defaclacl::text, '' from pg_default_acl
 where defaclrole='postgres'::regrole and defaclobjtype='f' order by 1;
```
```
(anon ejecutables en public)              | 31
(default acl postgres f) public           | {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
(default acl postgres f) storage          | {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
calcular_premio(numeric,jsonb,integer)    | {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} | 8e1b941432b94673d957b5ddf4d5830c
fn_autor_fila()                           | {=X/…,postgres,anon,authenticated,service_role} | b9f80c456cd3578ab5fbd11c51df7a24
fn_club_de_caballeriza(uuid)              | {=X/…} | a69d56624ecdd036e7e2291c735607aa
fn_club_de_carrera(uuid)                  | {=X/…} | b3ccb9116adea04733a35706c56fbfb8
fn_club_de_inscripcion(uuid)              | {=X/…} | 5d6597a0b3e24c3dcd180f1d85f7e589
fn_club_de_liquidacion(uuid)              | {=X/…} | 264202fd702cf0aa1e6369d30ee49e7d
fn_club_de_resolucion(uuid)               | {=X/…} | 21ff366cf1cffe0e2e90b2a46121f0d6
fn_club_de_resultado(uuid)                | {=X/…} | 8c5de2f22e29483677a236da6bad10f5
fn_club_de_reunion(uuid)                  | {=X/…} | d685bbb8e9b73c2055c4de2d7d02031a
fn_edad_reglamentaria(date,date)          | {postgres=X/postgres,anon,authenticated,service_role} (sin PUBLIC) | a1e260933b72afbd272afa60708bffcc
fn_get_user_club_id()                     | {=X/…} | 008c2ef948e422dfaae9e71646448fef
fn_is_portal_user()                       | {=X/…} | e1ec41d4ffe351e9a422f7f7452ef64f
fn_is_staff()                             | {=X/…} | 3accbc759c7e8181632acbe72a0b993c
fn_is_super_admin()                       | {=X/…} | 8883124340bc670ef2a894ea47d55cce
fn_mis_entidades()                        | {=X/…} | 562e9bb717f0f65fef1c792743e30c87
fn_mis_spc_ids()                          | {=X/…} | 91fbadbe11a8c327438e650028bf3cd9
fn_mis_spc_visibles()                     | {=X/…} | 05be1b0e005f9d1d370ed27bff473568
fn_proteger_rol_club_id_usuario()         | {=X/…} | 98ea5df016bc03c304b9268869ca66d2
fn_solicitudes_guard_staff(uuid)          | (sin PUBLIC) | 3d835871adde769ac95389b79faee882
fn_usuarios_guard_privilegios()           | {=X/…} | be16b76f45e8a9c56e037961722f01f1
fn_usuarios_set_auth_user_id()            | {=X/…} | 8917e9ece0108f3ce1d91347ca829398
rpc_aprobar_solicitud(uuid,text,uuid,boolean) | (sin PUBLIC) | 02ddc8c22659405626c96e326ecb0dc1
rpc_descartar_solicitud(uuid)             | (sin PUBLIC) | 471734db57169da8c743863e6f75a0b9
rpc_inscribir(uuid,uuid,uuid,uuid,uuid,uuid) | (sin PUBLIC) | 0605392e3ad9ed0baee9a32340f47deb
rpc_padron_profesionales()                | (sin PUBLIC) | 3dacdbcb58e7daaacdb1a957e45cc44e
rpc_padron_spcs()                         | {=X/…} | c9c1473ab69c2d832bc477bc5ef2c987
rpc_rechazar_solicitud(uuid,text)         | (sin PUBLIC) | 7d72e0ca5347a785722902b0d7b73215
rpc_solicitar_acceso(text×5,uuid,text×5)  | (sin PUBLIC) | 85e8044090b697c9d5c1bf4543489fc7
set_updated_at()                          | {=X/…} | f5a34c214a5bcc378219ccf746b9004f
siguiente_numero_publico(uuid,date)       | {=X/…} | de1c135e6a976d26b9e8d66b32161b63
validar_inscripcion(uuid,uuid)            | {=X/…} | 62e6e9da5abf6d3d21d00ec99d34c007
```
`{=X/…}` = `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`; "(sin PUBLIC)" = lo mismo sin `=X/postgres`.
Es igual, función por función, a la lista del generador (`tests/local/gen_revoke_anon_funciones.py`) medida a la mañana.

## Probe ANTES, en prod (`--prod`, anon por la API; rojo esperado). Salida completa

```
❌ P-calcular_premio: anon → 401 / 42501 permission denied  → 200 0
❌ P-fn_club_de_caballeriza: anon → 401 / 42501 permission denied  → 200 null
❌ P-fn_club_de_carrera: anon → 401 / 42501 permission denied  → 200 null
❌ P-fn_club_de_inscripcion: anon → 401 / 42501 permission denied  → 200 null
❌ P-fn_club_de_liquidacion: anon → 401 / 42501 permission denied  → 200 null
❌ P-fn_club_de_resolucion: anon → 401 / 42501 permission denied  → 200 null
❌ P-fn_club_de_resultado: anon → 401 / 42501 permission denied  → 200 null
❌ P-fn_club_de_reunion: anon → 401 / 42501 permission denied  → 200 null
❌ P-fn_edad_reglamentaria: anon → 401 / 42501 permission denied  → 200 0
❌ P-fn_get_user_club_id: anon → 401 / 42501 permission denied  → 200 null
❌ P-fn_is_portal_user: anon → 401 / 42501 permission denied  → 200 false
❌ P-fn_is_staff: anon → 401 / 42501 permission denied  → 200 false
❌ P-fn_is_super_admin: anon → 401 / 42501 permission denied  → 200 false
❌ P-fn_mis_entidades: anon → 401 / 42501 permission denied  → 200 []
❌ P-fn_mis_spc_ids: anon → 401 / 42501 permission denied  → 200 []
❌ P-fn_mis_spc_visibles: anon → 401 / 42501 permission denied  → 200 []
❌ P-fn_solicitudes_guard_staff: anon → 401 / 42501 permission denied  → 403 {"code":"28000","details":null,"hint":null,"message":"No autenticado"}
❌ P-rpc_aprobar_solicitud: anon → 401 / 42501 permission denied  → 403 {"code":"28000","details":null,"hint":null,"message":"No autenticado"}
❌ P-rpc_descartar_solicitud: anon → 401 / 42501 permission denied  → 403 {"code":"28000","details":null,"hint":null,"message":"No autenticado"}
❌ P-rpc_inscribir: anon → 401 / 42501 permission denied  → 400 {"code":"P0001","details":null,"hint":null,"message":"No autorizado: esta operación es para usuarios del portal."}
❌ P-rpc_padron_profesionales: anon → 401 / 42501 permission denied  → 200 []
❌ P-rpc_padron_spcs: anon → 401 / 42501 permission denied  → 400 {"code":"P0001","details":null,"hint":null,"message":"No autorizado."}
❌ P-rpc_rechazar_solicitud: anon → 401 / 42501 permission denied  → 403 {"code":"28000","details":null,"hint":null,"message":"No autenticado"}
❌ P-rpc_solicitar_acceso: anon → 401 / 42501 permission denied  → 403 {"code":"28000","details":null,"hint":null,"message":"No autenticado"}
❌ P-siguiente_numero_publico: anon → 401 / 42501 permission denied  → 200 1
❌ P-validar_inscripcion: anon → 401 / 42501 permission denied  → 200 [{"puede_inscribirse":false,"motivo":"Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría."}]

0/26 checks OK (26 llamables por la API; las 5 de trigger no las expone PostgREST)
```

## Probe en el sandbox antes del apply (`--mutantes`)

```
✅ P0) fixture fiel: proacl de las 31 = prod, y anon las ejecuta
✅ apply) la migración aplica sin error
✅ A1) anon no ejecuta ninguna de las 31
✅ A2) ninguna queda con EXECUTE para PUBLIC
✅ A3) grupo A (25): authenticated y service_role conservan EXECUTE
✅ A4) grupo B (6): authenticated sin EXECUTE, service_role con EXECUTE
✅ A5) md5(pg_get_functiondef) de las 31 idéntico
✅ C1) función nueva en public: sin anon ni PUBLIC; con authenticated y service_role
✅ C2) función nueva de postgres en otro esquema: sin PUBLIC
✅ T1) set_updated_at dispara para authenticated sin EXECUTE (updated_at se mueve)
✅ T2) los triggers de usuarios disparan para authenticated (el UPDATE pasa)
✅ T3) set_updated_at() directo como authenticated → permission denied
✅ G1) authenticated ejecuta fn_is_staff(); anon → permission denied
✅ rollback) aplica sin error
✅ R1) rollback: proacl de las 31 = antes (texto exacto)
✅ R2) rollback: default privileges de postgres = antes

16/16 checks OK

── mutantes ──
💀 muere MS1 sin el default global (C2)  (C1,C2)
💀 muere MS2 sin el default de esquema (C1)  (C1)
💀 muere MS3 una función del grupo A sin REVOKE  (A1,A2)
💀 muere MS4 REVOKE sólo de anon (PUBLIC sigue)  (A1,A2,G1)
💀 muere MS5 grupo B conserva authenticated  (A4,T3)
💀 muere MS6 grupo A pierde authenticated  (A3,T3)
💀 muere MR1 rollback sin devolver PUBLIC  (R1)
💀 muere MR2 rollback sin el default global  (R2)
mutantes: 8/8 muertos
```

## DESPUÉS: verificación en la base

```sql
with f as (select p.oid, p.proname, case when p.proname in ('fn_autor_fila','fn_proteger_rol_club_id_usuario','fn_solicitudes_guard_staff',
  'fn_usuarios_guard_privilegios','fn_usuarios_set_auth_user_id','set_updated_at') then 'B' else 'A' end g, md5(pg_get_functiondef(p.oid)) m
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.proname in (…las 31…))
select g, count(*) n, count(*) filter (where has_function_privilege('anon',oid,'EXECUTE')) anon_x,
 count(*) filter (where has_function_privilege('authenticated',oid,'EXECUTE')) auth_x,
 count(*) filter (where has_function_privilege('service_role',oid,'EXECUTE')) srv_x,
 count(*) filter (where (select proacl::text from pg_proc where pg_proc.oid=f.oid) ~ '[{,]=X') public_x,
 md5(string_agg(m, ',' order by proname)) md5_31
from f group by g
union all … anon ejecutables en public (total) … union all … pg_default_acl de postgres (f) … union all … schema_migrations;
```
```
A | 25 | anon 0 | auth 25 | srv 25 | public 0 | 7a1ea99e8f6cadb366ade8c7c793658a
B |  6 | anon 0 | auth 0  | srv 6  | public 0 | 60d0ab272d06adaa88749e10585a95c7
anon ejecutables en public (total) | 0
defacl (global) {postgres=X/postgres}
defacl public {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
defacl storage {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
migración 20261002225113 revoke_anon_funciones_publicas
```
El md5 agregado de antes se calculó con los md5 por función de la foto ANTES, en el mismo orden (python `hashlib.md5(','.join(…))`): A = `7a1ea99e8f6cadb366ade8c7c793658a`
y B = `60d0ab272d06adaa88749e10585a95c7`. Son iguales a los de después.

## Probe DESPUÉS, en prod (`--prod`). Salida completa

```
✅ P-calcular_premio: anon → 401 / 42501 permission denied
✅ P-fn_club_de_caballeriza: anon → 401 / 42501 permission denied
✅ P-fn_club_de_carrera: anon → 401 / 42501 permission denied
✅ P-fn_club_de_inscripcion: anon → 401 / 42501 permission denied
✅ P-fn_club_de_liquidacion: anon → 401 / 42501 permission denied
✅ P-fn_club_de_resolucion: anon → 401 / 42501 permission denied
✅ P-fn_club_de_resultado: anon → 401 / 42501 permission denied
✅ P-fn_club_de_reunion: anon → 401 / 42501 permission denied
✅ P-fn_edad_reglamentaria: anon → 401 / 42501 permission denied
✅ P-fn_get_user_club_id: anon → 401 / 42501 permission denied
✅ P-fn_is_portal_user: anon → 401 / 42501 permission denied
✅ P-fn_is_staff: anon → 401 / 42501 permission denied
✅ P-fn_is_super_admin: anon → 401 / 42501 permission denied
✅ P-fn_mis_entidades: anon → 401 / 42501 permission denied
✅ P-fn_mis_spc_ids: anon → 401 / 42501 permission denied
✅ P-fn_mis_spc_visibles: anon → 401 / 42501 permission denied
✅ P-fn_solicitudes_guard_staff: anon → 401 / 42501 permission denied
✅ P-rpc_aprobar_solicitud: anon → 401 / 42501 permission denied
✅ P-rpc_descartar_solicitud: anon → 401 / 42501 permission denied
✅ P-rpc_inscribir: anon → 401 / 42501 permission denied
✅ P-rpc_padron_profesionales: anon → 401 / 42501 permission denied
✅ P-rpc_padron_spcs: anon → 401 / 42501 permission denied
✅ P-rpc_rechazar_solicitud: anon → 401 / 42501 permission denied
✅ P-rpc_solicitar_acceso: anon → 401 / 42501 permission denied
✅ P-siguiente_numero_publico: anon → 401 / 42501 permission denied
✅ P-validar_inscripcion: anon → 401 / 42501 permission denied

26/26 checks OK (26 llamables por la API; las 5 de trigger no las expone PostgREST)
```

## probe_v_inscriptos_cerrada (después del apply)

```
✅ C1 anon NO lee v_inscriptos_carrera — status=401 code=42501 filas=0
✅ C2 service_role: la vista sigue viva — status=206 total=457
✅ C3 anon → v_programa_reunion: 0 filas — status=200 filas=0 total=0
✅ C3 anon → v_sanciones_vigentes: 0 filas — status=200 filas=0 total=0
✅ C3 anon → v_spcs_activos: 0 filas — status=200 filas=0 total=0
✅ C4 toda CREATE [OR REPLACE] VIEW de migrations/ lleva security_invoker — 158 archivos

6/6 OK
```

## probe_portal_alta_spc_prod (después del apply)

```
✅ H) el portal.html servido tiene el flujo nuevo (traerYAnotar / botonStudBookPortal)  → https://sigh.com.ar/portal.html
✅ N1) BIEN COQUETA aparece en el buscador del padrón con "Anotar"  → BIEN COQUETA
        
          hembra
          5 años · 15/10/2021
          SB 429819
          Bien Terminado × Gritty
          
          
        
      
      Anotar
    ¿No es ninguno de esto
✅ N2) inscripción normal en prod: canal portal, inscripto_por = usuario, caballeriza/entrenador declarados  → {"id":"6dae3b21…","canal":"portal","inscripto_por":"5a237bda…","estado":"inscripto","caballeriza_id":"838d1834…","entrenador_id":"b6bfa077…"}
✅ N3) la ficha del padrón no se tocó (secretaria, sin revisión)  → {"alta_origen":"secretaria","revision_pendiente":false}
✅ T1) TROMPETERO no está en el padrón → botón "Buscar «TROMPETERO» en el Stud Book"  → Ningún caballo del padrón coincide con esa búsqueda.
           Si el ejemplar existe, buscalo en el Stud Book y anotalo desde acá:
           🔎 Buscar «TROMPETERO» en el Stud Book
           Si tamp
✅ T2) la función real devuelve el candidato (SB 128894) con "Es este — anotarlo"  → Stud Book — elegí el caballo
        
          TROMPETERO
          
            macho
            39 años · 01/12/1987
            Alazan
            El Troyano × Excentric
            SB 128894
          
        
        Es este — anotarlo
      
        Al anotarlo, el caballo queda cargado con
✅ T3) ficha nueva: TROMPETERO, portal, alta_por = usuario, pendiente, activo, club/entrenador NULL  → {"id":"c7f73b05…","nombre":"TROMPETERO","studbook_id":"128894","alta_origen":"portal","alta_por":"5a237bda…","revision_pendiente":true,"revision_motivos":["edad > 12 (112 años según el Stud Book)"],"estado":"activo","club_id":null,"entrenador_id":null,"notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde el portal por Probe ALTA murk5js5 02/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"}
✅ T4) motivo "edad > 12" en revision_motivos (no en notas) y notas con "alta desde el portal por Probe ALTA"  → [["edad > 12 (112 años según el Stud Book)"],"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde el portal por Probe ALTA murk5js5 02/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"]
✅ T5) inscripción de la nueva de corrido: canal portal, inscripto_por = usuario  → {"id":"b74131a1…","canal":"portal","inscripto_por":"5a237bda…","estado":"inscripto","caballeriza_id":"838d1834…","entrenador_id":"b6bfa077…"}
✅ T6) spcs +1 exacto durante la prueba
✅ T7) auditoría del INSERT en spcs con alta_por  → [{"accion":"INSERT","datos_despues":{"id":"c7f73b05…","sexo":"macho","color":"Alazan","notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde el portal por Probe ALTA murk5js5 02/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)","estado":"activo","marcas":null,"nombre":"TROMPETERO","club_id":null,"doc_url":null,"alta_por":"5a237bda…","foto_url":null,"created_at":"2026-10-02T22:52:30.585461+00:00","updated_at":"2026-10-02T22:52:30.585461+00:00","alta_origen":"portal","pais_origen":"Argentina","revisado_at":null,"studbook_id":"128894","madre_nombre":"Excentric","revisado_por":null,"entrenador_id":null,"abuela_materna":null,"caballeriza_id":null,"padrillo_nombre":"El Troyano","fecha_nacimiento":"1987-12-01","revision_motivos":["edad > 12 (112 años según el Stud Book)"],"ult_performances":null,"certificado_correr":false,"jockey_habitual_id":null,"registro_stud_book":null,"revision_pendiente":true}}]
✅ E) sin errores de JS en la página
✅ R1) restore: 0 filas del run (reunión, inscripciones, TROMPETERO, usuario, auth, profesional, caballeriza, auditoría)  → {"reuniones_9984":0,"inscripciones":0,"trompetero":0,"usuarios":0,"profesionales":0,"caballerizas":0,"auditoria_del_run":0,"auth":0}
✅ R2) spcs antes = después (ninguna alta real)  → 258 → 258

14/14 asserts OK
```

## probe_inscripciones_alta_spc_prod (después del apply)

```
✅ H) el inscripciones.html tiene el alta desde el Stud Book (traerYUsarStaff / buscarEnStudBookStaff)  → https://sigh.com.ar/inscripciones.html
✅ S1) TROMPETERO no está en el padrón → "Sin resultados en el padrón" + "Buscar «TROMPETERO» en el Stud Book"  → Sin resultados en el padrón🔎 Buscar «TROMPETERO» en el Stud Book
✅ S2) studbook-buscar real (sesión staff) devuelve el candidato SB 128894 con "Es este — traerlo"  → Stud Book — elegí el caballoTROMPETEROmacho · nac. 01/12/1987 · Alazan · El Troyano × Excentric · SB 128894Es este — traerloAl traerlo queda cargado en Stud Book (SPCs) con los datos del Stud Book. Después completá caballeriza y jockey y guardá la inscripción.
✅ S3) ficha nueva: TROMPETERO, alta_origen secretaria, alta_por = operador, NO pendiente, activa  → {"id":"8442bb9a…","nombre":"TROMPETERO","studbook_id":"128894","alta_origen":"secretaria","alta_por":"1e54ef38…","revision_pendiente":false,"revision_motivos":["edad > 12 (112 años según el Stud Book)"],"estado":"activo","notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde Inscripciones por Probe STAFF murk6eto 02/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"}
✅ S4) motivo "edad > 12" informativo en revision_motivos y notas "alta desde Inscripciones por Probe STAFF"  → [["edad > 12 (112 años según el Stud Book)"],"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde Inscripciones por Probe STAFF murk6eto 02/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"]
✅ S5) queda seleccionada en el modal (f-spc-id = ficha) y el aviso muestra el motivo  → [["warning","TROMPETERO quedó cargado desde el Stud Book. Completá caballeriza y jockey y guardá. ⚠ Revisá la ficha en Stud Book (SPCs): edad > 12 (112 años según el Stud Book)"]]
✅ S6) spcs +1 exacto
✅ S7) Guardar inscribe la ficha nueva en el turno, con la caballeriza elegida  → [{"id":"e893e18d…","estado":"inscripto","caballeriza_id":"c848eddc…","spc_id":"8442bb9a…"},["ok","SPC inscripto"]]
✅ S8) auditoría del INSERT en spcs con alta_por = operador  → [{"accion":"INSERT","datos_despues":{"id":"8442bb9a…","sexo":"macho","color":"Alazan","notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde Inscripciones por Probe STAFF murk6eto 02/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)","estado":"activo","marcas":null,"nombre":"TROMPETERO","club_id":null,"doc_url":null,"alta_por":"1e54ef38…","foto_url":null,"created_at":"2026-10-02T22:52:47.147244+00:00","updated_at":"2026-10-02T22:52:47.147244+00:00","alta_origen":"secretaria","pais_origen":"Argentina","revisado_at":null,"studbook_id":"128894","madre_nombre":"Excentric","revisado_por":null,"entrenador_id":null,"abuela_materna":null,"caballeriza_id":null,"padrillo_nombre":"El Troyano","fecha_nacimiento":"1987-12-01","revision_motivos":["edad > 12 (112 años según el Stud Book)"],"ult_performances":null,"certificado_correr":false,"jockey_habitual_id":null,"registro_stud_book":null,"revision_pendiente":false}}]
✅ D1) segundo traer: ya_existia, mismo spc_id, spcs no crece  → [{"ok":true,"spc_id":"8442bb9a…","ya_existia":true,"revision_motivos":null,"nombre":"TROMPETERO"},null]
✅ E) sin errores de JS en la página
✅ R1) restore: 0 filas del run (reunión, inscripciones, TROMPETERO, usuario, auth, caballeriza, auditoría)  → {"reuniones_9983":0,"inscripciones":0,"trompetero":0,"usuarios":0,"caballerizas":0,"auditoria_del_run":0,"auth":0}
✅ R2) spcs antes = después (ninguna alta real)  → 258 → 258

13/13 asserts OK
```

## probe_resoluciones_sanciones_autor --prod (después del apply)

```
contexto: RUN=PROBE-097-1790981585765 · PROD (sin mutantes de base) · 5 perfiles
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
✅ Z) limpieza: {"resoluciones":0,"sanciones":0,"entidades":0,"usuarios":0}
```

## probe_xss_portal_nombres (después del apply; drift previo explicado arriba)

```
fixture: tag=c4692208 · barridos de corridas anteriores=0
fixture: 5 usuarios + 5 inscripciones portal en 9999 T3
✅ U0) usuarios.html load() corre
✅ U1) usuarios.html: 0 elementos inyectados en la lista
❌ U2.simple) fila renderizada  ← 
❌ U2.doble) fila renderizada  ← 
❌ U2.script) fila renderizada  ← 
❌ U2.amp) fila renderizada  ← 
❌ U2.delia) fila renderizada  ← 
✅ A0) admin.html loadPendientes() corre
✅ A1) admin.html: 0 elementos inyectados en pendientes
✅ A2.simple) fila renderizada
✅ A3.simple) nombre y email tal cual
✅ A4.simple.Aprobar) pregunta por ESE nombre
✅ A5.simple.Aprobar) nada se ejecutó
✅ A4.simple.Rechazar) pregunta por ESE nombre
✅ A5.simple.Rechazar) nada se ejecutó
✅ A2.doble) fila renderizada
✅ A3.doble) nombre y email tal cual
✅ A4.doble.Aprobar) pregunta por ESE nombre
✅ A5.doble.Aprobar) nada se ejecutó
✅ A4.doble.Rechazar) pregunta por ESE nombre
✅ A5.doble.Rechazar) nada se ejecutó
✅ A2.script) fila renderizada
✅ A3.script) nombre y email tal cual
✅ A4.script.Aprobar) pregunta por ESE nombre
✅ A5.script.Aprobar) nada se ejecutó
✅ A4.script.Rechazar) pregunta por ESE nombre
✅ A5.script.Rechazar) nada se ejecutó
✅ A2.amp) fila renderizada
✅ A3.amp) nombre y email tal cual
✅ A4.amp.Aprobar) pregunta por ESE nombre
✅ A5.amp.Aprobar) nada se ejecutó
✅ A4.amp.Rechazar) pregunta por ESE nombre
✅ A5.amp.Rechazar) nada se ejecutó
✅ A2.delia) fila renderizada
✅ A3.delia) nombre y email tal cual
✅ A4.delia.Aprobar) pregunta por ESE nombre
✅ A5.delia.Aprobar) nada se ejecutó
✅ A4.delia.Rechazar) pregunta por ESE nombre
✅ A5.delia.Rechazar) nada se ejecutó
✅ I0) inscripciones.html loadInscripciones() corre
✅ I1) inscripciones.html: 0 elementos inyectados en la lista
✅ I2) se renderizan todas las filas de T3
✅ I3.simple) fila renderizada
✅ I4.simple) "Cargada por" = Portal + nombre tal cual
✅ I3.doble) fila renderizada
✅ I4.doble) "Cargada por" = Portal + nombre tal cual
✅ I3.script) fila renderizada
✅ I4.script) "Cargada por" = Portal + nombre tal cual
✅ I3.amp) fila renderizada
✅ I4.amp) "Cargada por" = Portal + nombre tal cual
✅ I3.delia) fila renderizada
✅ I4.delia) "Cargada por" = Portal + nombre tal cual
✅ I5) nada se ejecutó
✅ S1.usuarios.html) carga escape-html.js
✅ S1.admin.html) carga escape-html.js
✅ S1.inscripciones.html) carga escape-html.js
✅ S2) usuarios.html: Editar no serializa el objeto al atributo
✅ S3) admin.html: Aprobar/Rechazar pasan sólo el id

SUITE: 53/58
✅ Z) limpieza por estado: usuarios probe.xss=0 · inscripciones del probe=0 · 9999 mismas inscripciones (ids)=true (17)
```

## correr_todos.sh antes del merge (HEAD separado en cf11806)

```
probe_activacion_pendiente                 🟠 rojo CONOCIDO (rc=1)                                       0s
probe_alineado_programa                    🟠 rojo CONOCIDO (rc=1)                                       5s
probe_apuestas_especiales                  🟠 rojo CONOCIDO (rc=1)                                       3s
probe_aviso_jockey_repetido                🟢 verde                                                      2s
probe_badge_overlap                        🟢 verde                                                      0s
probe_bolsa_efectiva                       🟢 verde                                                      1s
probe_carta_numero_turno                   🟢 verde                                                      2s
probe_carta_selector_reunion               🟢 verde                                                      1s
probe_chapa_4medio                         🟢 verde                                                      0s
probe_cobros_caballeriza                   🟢 verde                                                      1s
probe_condicion_sexo_r9                    🟢 verde                                                      3s
probe_cuerpos_oficial                      🟠 rojo CONOCIDO (rc=2)                                       2s
probe_edad_display                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_edad_reglamentaria                   🟠 rojo CONOCIDO (rc=1)                                      40s
probe_fmtinput_onblur                      🟢 verde                                                      1s
probe_forfait_anulada                      🟠 rojo CONOCIDO (rc=1)                                       0s
probe_ganadas_carta_llamados               🟢 verde                                                      0s
probe_inscripcion_editar_carrera           🟢 verde                                                      1s
probe_inscripciones_alta_studbook          🟢 verde                                                      6s
probe_inscripciones_listado                🟢 verde                                                      1s
probe_mandil_colores                       🟢 verde                                                      1s
probe_montas_reales                        🟢 verde                                                      2s
probe_motor_chequeo_errores                🟢 verde                                                      1s
probe_orden_carreras                       🟠 rojo CONOCIDO (rc=1)                                       5s
probe_orden_inscriptos                     🟢 verde                                                      3s
probe_orden_ui                             🟢 verde                                                      1s
probe_pagos_carrera_busqueda               🟢 verde                                                      6s
probe_pagos_vista_carrera                  🟢 verde                                                     12s
probe_pagos_vista_incentivo_pagados        🟢 verde                                                     14s
probe_portal_alta_spc_ui                   🟢 verde                                                      1s
probe_portal_carta                         🟠 rojo CONOCIDO (rc=1)                                       0s
probe_portal_validacion                    🟢 verde                                                      0s
probe_programa_null_estado                 🟢 verde                                                      1s
probe_programa_r8_imprenta                 🟢 verde                                                      2s
probe_ratificacion_aviso_revision          🟢 verde                                                      1s
probe_recibo_rol                           🟢 verde                                                      1s
probe_recibo_una_hoja                      🟢 verde                                                     39s
probe_regex_datos_personales               🟢 verde                                                      0s
probe_resultados_front_cerrada             🟢 verde                                                      2s
probe_reparto_100                          🟢 verde                                                     36s
probe_rls_no_permissive                    🟢 verde                                                      1s
probe_spcs_r9_tanda_1                      🟠 rojo CONOCIDO (rc=1)                                       2s
probe_studbook_buscar_fn                   🟠 rojo CONOCIDO (rc=1)                                       8s
probe_studbook_v2                          🟢 verde                                                      0s
probe_tapa_flyer                           🟠 rojo CONOCIDO (rc=1)                                       2s
probe_v_inscriptos_cerrada                 🟢 verde                                                      2s

Resumen: 34 verdes · 12 rojos conocidos · 0 rojos NUEVOS · 0 ausentes
Rojos conocidos (no bloquean):
  - probe_activacion_pendiente          drift del probe: su stub de sb no tiene .select() después de update().eq() (TypeError)
  - probe_alineado_programa             drift: el check de márgenes de página (10mm 8mm) del programa color no coincide — el CSS de impresión cambió desde que se escribió
  - probe_apuestas_especiales           drift: 9 checks de tarjetas (cantidad, número, nombre, rango) no coinciden con la pantalla actual
  - probe_cuerpos_oficial               drift de datos: espera 8 carreras oficiales en R6 y hay 7 (C3 está provisional desde el 14/08)
  - probe_edad_display                  drift: no encuentra el ancla de fin del bloque de edad en el HTML
  - probe_edad_reglamentaria            2/32: el Stud Book no devuelve dato para los ejemplares de R9 (fuente externa; ver studbook_buscar_fn)
  - probe_forfait_anulada               drift de extracción: ReferenceError renumerarChapas
  - probe_orden_carreras                drift de datos: 2/18 asumen R9 con 0 anuladas y sin sortear (R9 ya tiene anuladas y sorteo)
  - probe_portal_carta                  drift: no encuentra loadCarta en portal.html (hoy se llama loadLlamado)
  - probe_spcs_r9_tanda_1               evidencia histórica: asserta count(spcs) = 205 (hoy 239)
  - probe_studbook_buscar_fn            fuente externa: el Stud Book responde HTTP 403 a las búsquedas desde este servidor
  - probe_tapa_flyer                    drift de extracción: ReferenceError edadSPC
Salida completa de cada probe: <tmpdir>/<probe>.txt
```
