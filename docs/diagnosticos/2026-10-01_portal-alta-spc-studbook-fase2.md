# Portal — alta de SPC desde el Stud Book: Fase 2 (implementación en rama + sandbox, SIN aplicar en prod)

- **Fecha:** 2026-10-01
- **Rama:** `feat/portal-alta-spc-studbook` — PR **#29** (https://github.com/mdqclio/SGH/pull/29), **sin mergear**
- **SHA de la rama al correr los probes:** `a1414ef043eb7609cfad9d6f304deaffe92bbb7d` (sobre `main` `cf99bf4`)
- **Fase 1:** `docs/diagnosticos/2026-10-01_portal-alta-spc-studbook.md` (este mismo branch)
- **Decisiones aplicadas (Leo, 01/10):** opción A (la Edge Function re-consulta el Stud Book y es la única que llama la RPC);
  edad reglamentaria < 2 se rechaza, > 12 se crea pendiente con el motivo en `revision_motivos` (no en `notas`); cupo 3
  altas por usuario por día; `entrenador_id` NULL; aviso al ratificar fuera de v1; Wave Rimout y el REVOKE de `anon` son
  tareas aparte; R10 no se apura.

## Guards

```
pwd                         → /home/clio/dev/SGH
ref del proyecto            → unlhcuanfrtpatoipwve (MCP get_project_url)
SELECT count(*) FROM spcs   → 238 (recontado justo antes del commit del baseline: 238, última alta 2026-10-01 17:08:37 UTC)
```

## Qué NO se hizo (a propósito)

- **Nada aplicado en prod.** Ni `apply_migration`, ni `deploy_edge_function`, ni merge. Todo lo que escribió en una base fue
  en el sandbox local (contenedor `sgh-local-pg`, bases aparte `sgh_pa_*`, borradas al terminar; la base `sgh` del sandbox de
  siempre no se tocó).
- En prod sólo lecturas: el recuento de `spcs`, catálogo (definiciones de funciones, columnas, ENUMs, grants) para armar el
  sandbox, y los probes de sólo lectura `probe_orden_inscriptos` / `probe_aviso_jockey_repetido`. `probe_studbook_buscar_fn`
  consulta el Stud Book público (sin Supabase).
- No se corrió `probe_studbook_buscar_e2e.mjs`: prueba la función **desplegada** y hoy está la v1 (le daría 403 al portal en
  el caso 4, a propósito). Va después del deploy.

## Commits en la rama

1. `2ee36bf` — baseline de `spcs` 210 → 238 en `CLAUDE.md` (línea nueva en el historial) y en `probe_caballeriza_provisorio`
   / `probe_modificar_inscripcion_portal` (`SPCS_BASELINE`). Recontado antes de commitear: 238.
2. `a1414ef` — la feature.

```
$ git diff --stat main..a1414ef
 CHANGELOG.md                                     |  32 ++
 CLAUDE.md                                        |  20 +-
 auditoria.html                                   |   1 +
 inscripciones.html                               |  11 +-
 migrations/portal_alta_spc_studbook.sql          | 350 ++++++++++++++
 migrations/rollback_portal_alta_spc_studbook.sql |  30 ++
 portal.html                                      | 159 ++++++-
 spcs.html                                        |  87 +++-
 supabase/functions/studbook-buscar/index.ts      | 172 ++++++-
 tests/local/portal_alta_spc_md5_esperado.txt     |   7 +
 tests/local/portal_alta_spc_sandbox.sql          | 580 +++++++++++++++++++++++
 tests/probe_aviso_jockey_repetido.mjs            |   6 +-
 tests/probe_caballeriza_provisorio.mjs           |   2 +-
 tests/probe_modificar_inscripcion_portal.mjs     |   2 +-
 tests/probe_portal_alta_spc_studbook.mjs         | 333 +++++++++++++
 tests/probe_portal_alta_spc_ui.mjs               | 274 +++++++++++
 tests/probe_portal_validacion.mjs                |  10 +-
 tests/probe_studbook_buscar_e2e.mjs              |  41 +-
 tests/probe_studbook_buscar_fn.mjs               |  40 +-
 19 files changed, 2093 insertions(+), 64 deletions(-)
```

## Diseño implementado (resumen; el detalle está en el encabezado de la migración)

**Base** (`migrations/portal_alta_spc_studbook.sql`, rollback `rollback_portal_alta_spc_studbook.sql`):

- `spcs`: `alta_origen` ('secretaria' | 'portal', default 'secretaria'), `alta_por`, `revision_pendiente`, `revision_motivos text[]`,
  `revisado_por`, `revisado_at`. `estado_spc` NO se toca: la ficha del portal nace `activo` para poder inscribirse.
- `trg_spcs_alta_revision` impone esas columnas: un INSERT de `spcs.html` queda siempre 'secretaria' con `alta_por` = la
  sesión; sólo la RPC (marca de sesión `sgh.alta_portal`, sólo en su transacción) crea 'portal'. En UPDATE, `alta_*` y
  `revision_motivos` no cambian, y `revisado_por` / `revisado_at` los pone la base.
- `trg_audit_spcs` (`fn_auditoria_log`): `spcs` pasa a estar auditada. La alta del portal entra por `service_role`, sin email,
  así que en `auditoria` queda con `usuario_id` NULL y `club_id` NULL (sólo la ve super_admin en `auditoria.html`). Quién la dio
  de alta está igual en `datos_despues.alta_por` y en la ficha.
- `rpc_spc_alta_studbook_portal` — SECURITY DEFINER, `REVOKE` de PUBLIC/anon/authenticated, `GRANT` sólo a `service_role`.
  Orden: G0 service_role → G1 usuario activo del portal con entidad → V1 turno abierto (mismo texto que `rpc_inscribir`) →
  V2–V6 forma → V7 edad → lock por nombre → D1 reusa por nº SB → D2 reusa una ficha con misma fecha+padres / D3 rechaza si
  son dos o más → R1 cupo → D4 homónimo (motivo) → alertas del Stud Book (motivo) → INSERT `ON CONFLICT DO NOTHING` +
  re-SELECT. Devuelve `(spc_id, ya_existia, revision_motivos)`.

Mensajes al usuario (los que el portal muestra tal cual):

| Regla | Mensaje |
|---|---|
| G0 | `rpc_spc_alta_studbook_portal: sin permiso` (42501; no llega al portal) |
| G1 | `No autorizado: esta operación es para usuarios del portal.` (42501 → 403) |
| V1 | `La inscripción para ese turno no está abierta.` |
| V2 | `El número de Stud Book no es válido.` |
| V3 | `Ese ejemplar no figura como Sangre Pura de Carrera en el Stud Book. Consultá en secretaría.` |
| V4 | `El Stud Book no devolvió el nombre del caballo. Consultá en secretaría.` |
| V5 | `El Stud Book no tiene la fecha de nacimiento de ese caballo. Pedile a la secretaría que lo cargue.` |
| V6 | `El Stud Book no informa el sexo de ese caballo. Pedile a la secretaría que lo cargue.` |
| V7 (< 2) | `Ese caballo tiene N años según el Stud Book: revisá que hayas elegido el correcto (puede haber otro con el mismo nombre).` |
| V7 (> 12) | crea; motivo `edad > 12 (N años según el Stud Book)` |
| D3 | `Ese caballo ya está cargado más de una vez en el padrón. Buscalo por nombre en la lista o avisale a la secretaría.` |
| R1 | `Ya trajiste 3 caballos nuevos hoy. Si necesitás más, pedíselos a la secretaría.` |
| D4 | crea; motivo `homónimo de <NOMBRE> (nac. dd/mm/aaaa, id <uuid>)` |

**Edge Function** `studbook-buscar` (no deployada): buscar = staff o portal; `{accion:'traer', sb_id, nombre, carrera_id}` = sólo
portal → `autocomplete(nombre)` → el hit con `id === sb_id` (si no, 409 `no_coincide`) → `aCandidato` → RPC con la key secreta
(`resolverDbKey`, patrón invite-user: STUDBOOK_DB_KEY | INVITE_DB_KEY | SGH_SECRET_KEY | SB_SECRET_KEY |
SUPABASE_SERVICE_ROLE_KEY, descartando `eyJ…`). Errores de la RPC: 42501 → 403 `no_autorizado`; P0001/22023 → 422 `rechazado`
con el mensaje; otro → 500 sin el detalle interno.

**Pantallas:** `portal.html` (botón "Buscar en el Stud Book" cuando el padrón no tiene el caballo, y al pie de los resultados;
candidatos con edad/sexo/pelaje/padres/SB; "Ya está en el padrón — anotarlo" si el nº SB ya está; la monta se valida ANTES de
traer; después `anotar()` de siempre). `spcs.html` (chip "Por revisar" con conteo, filtro, badge, caja con quién/cuándo/motivos
y "Marcar revisado"; ✏️ abre por id). `inscripciones.html` ("🆕 ficha nueva, por revisar" en "Cargada por").
`auditoria.html` (filtro `spcs`).

**Arreglo lateral en `spcs.html`:** el ✏️ era `onclick='openModal(${JSON.stringify(r)})'` dentro de un atributo con comillas
simples. Un apóstrofo en cualquier campo de la ficha cerraba el atributo y el botón no abría nada. En prod hay 12 fichas así
(consulta abajo, en el anexo). Ahora el botón pasa el id y la ficha se busca en `allData`. Hacía falta para esta tarea: los
motivos de revisión traen texto del Stud Book.

## Mutantes — qué mata a cada uno

Ver salidas abajo. Base: 21/21. Pantallas: 8/8. M9 (sin D1) **vivió** en la primera corrida: el caso de S14 reusaba por D2
(misma fecha+padres). Se cambió el caso a "mismo nº de Stud Book con el padre escrito distinto en el padrón", que es lo que
D1 cubre de verdad, y murió.

## Problemas encontrados en el camino

1. **`probe_orden_inscriptos.mjs` falla contra prod con esta rama:** `column spcs_1.revision_pendiente does not exist`. Es
   lo esperado: corre el SELECT real de `inscripciones.html` y la columna aún no existe. **Confirma el orden de deploy:
   migración → función → HTML.** Si se mergea antes de aplicar, `inscripciones.html` se rompe.
2. **`probe_portal_validacion.mjs` ya fallaba en `main`** (`conteoJockeysActivos is not defined`: el aviso de jockey repetido
   no estaba inyectado). Arreglado y extendido a `leerMontaAnotar` (la validación de la monta pasó a esa función). Verde.
3. **`probe_aviso_jockey_repetido.mjs` ya fallaba en `main`**: (a) `escapeHtml is not defined` en el tramo A (la celda "Cargada
   por" usa `escapeHtml` desde ISSUE-018), arreglado; (b) más adelante `sb.rpc is not a function` en el tramo de `saveMontas`
   de `resultados.html`, que desde ISSUE-084 llama `rpc_cambiar_monta` y el stub del probe no tiene `rpc`. **(b) no es de esta
   rama y no lo toqué**: queda para quien mantenga ese probe.
4. La primera corrida del probe de base dio 42/49 por **datos del probe**, no por la migración: los casos de concurrencia
   commitean y compartían fecha+padres con los siguientes, entonces D2 los reusaba (bien hecho por la RPC); después R1 frenó a
   U1 por esas mismas altas (también bien). Se les dieron padres propios y se corren 2 días atrás después de S3.

## Para aplicar (cuando des el OK) — en este orden

1. `apply_migration` con el **texto exacto** de `migrations/portal_alta_spc_studbook.sql`. Inmediatamente:
   `select p.proname, md5(pg_get_functiondef(p.oid)) …` → tiene que dar `fn_spcs_alta_revision cd33a7683698ccf0704683e678bdc623`
   y `rpc_spc_alta_studbook_portal 704f4762eb9ce373aecd4be9abdd0a78` (`tests/local/portal_alta_spc_md5_esperado.txt`). Más:
   `has_function_privilege` (anon f / authenticated f / service_role t), 238 filas con `alta_origen='secretaria'` y
   `revision_pendiente=false`, `get_advisors`.
2. `deploy_edge_function studbook-buscar` (v2, `verify_jwt: true`). Confirmar que la key secreta resuelve: `INVITE_DB_KEY` ya
   existe como secret del proyecto (lo usa invite-user); si se prefiere una propia, `STUDBOOK_DB_KEY`. Correr
   `tests/probe_studbook_buscar_e2e.mjs`: no crea ejemplares (7a–7e) y verifica `count(*) FROM spcs` antes y después.
3. Merge del PR #29 → GitHub Pages; md5 de `portal.html` / `spcs.html` / `inscripciones.html` / `auditoria.html` contra
   `sigh.com.ar`. Recién ahí `probe_orden_inscriptos` vuelve a verde.
4. Pendiente aparte, antes de abrir el portal a esto: el REVOKE de `anon` (tarea separada, con diagnóstico previo). Ojo ahí:
   `authenticated` tiene que conservar EXECUTE sobre `fn_is_portal_user` y `fn_is_staff`, que esta función usa para el gate
   (hoy los tienen anon, authenticated y service_role — consulta abajo).

## Preguntas abiertas

1. ¿Secret propio `STUDBOOK_DB_KEY` o se reusa `INVITE_DB_KEY`? El código acepta los dos (gana el propio).
2. La alta del portal queda en `auditoria` con `club_id` NULL, así que el staff de Dolores no la ve en `auditoria.html`. Para la
   secretaría alcanzan la ficha y la caja de revisión. Si la quieren ver también en auditoría, se puede setear el club del
   usuario en la RPC (`set_config('request.jwt.claims', …)` con su email) — **no lo hice: es tocar la atribución de la auditoría.**

---

## Anexo — salidas crudas (completas)

### A.1 `node tests/probe_portal_alta_spc_studbook.mjs --mutantes` (sandbox)

```
✅ S1 alta + rpc_inscribir de corrido (sesión real del portal)
✅ S1 ficha: portal, alta_por=usuario, pendiente, activo, club/entrenador/caballeriza NULL, studbook_id
✅ S1 notas con SB, url, "alta desde el portal por Portal Uno", abuelo y leyenda
✅ S1 inscripción canal portal, inscripto_por = usuario
✅ S1 auditoría del INSERT en spcs con alta_por
✅ S2 mismo nº de Stud Book → reusa, ya_existia, 0 filas nuevas
✅ S3a simultáneas, mismo nombre → 1 ficha; la 2ª reusa la de la 1ª
✅ S3b simultáneas, otro nombre (sólo índice único + ON CONFLICT) → 1 ficha, la 2ª reusa
✅ S3c homónimos simultáneos → el 2º ve al 1º (motivo homónimo): lock por nombre
✅ S4 D2 fecha+padres (normalizados) de ficha sin studbook_id → la reusa, no crea, no le escribe el nº
✅ S5 D3 Wave Rimout (2 fichas) → rechazo
✅ S6 D4 homónimo → crea, motivo "homónimo de BIEN COQUETA (nac. 15/10/2021 …)"
✅ S7 V1 turno cerrado → "La inscripción para ese turno no está abierta."
✅ S7 V1 turno anulado → "La inscripción para ese turno no está abierta."
✅ S7 V1 turno inexistente → "La inscripción para ese turno no está abierta."
✅ S8 V2 nº de Stud Book "12a" → rechazo
✅ S8 V2 nº de Stud Book de 10 dígitos → rechazo
✅ S9 V3 raza 3 → rechazo
✅ S9 V3 raza NULL → rechazo
✅ S10 V4 nombre vacío → rechazo
✅ S11 V5 fecha NULL → rechazo
✅ S11 V5 fecha futura → rechazo
✅ S12 V6 sexo NULL → rechazo
✅ S12 V6 sexo "yegua" → rechazo
✅ S13 V7 edad < 2 → rechazo
✅ S13 V7 edad > 12 → crea, motivo "edad > 12 (N años según el Stud Book)" en revision_motivos
✅ S13 V7 edad 2–3 → crea sin motivos
✅ S13b alerta de bandera → motivo "alerta Stud Book: …" (las de raza/sexo no)
✅ S14 R1 4ª alta del mismo usuario en 24 h → rechazo
✅ S14 R1 otro usuario sigue pudiendo
✅ S14 R1 en el tope, un caballo YA cargado (mismo nº SB, padre escrito distinto) se reusa igual: D1 antes del cupo
✅ P1 portal (authenticated) llama la RPC → permission denied
✅ P1c postgres SIN JWT (tiene EXECUTE) → 42501 del guard 0
✅ P4 EXECUTE: anon no, authenticated no, service_role sí
✅ P5 G1 usuario inactivo → "No autorizado: esta operación es para usuarios del portal."
✅ P5 G1 usuario sin entidad → "No autorizado: esta operación es para usuarios del portal."
✅ P5 G1 usuario staff → "No autorizado: esta operación es para usuarios del portal."
✅ P5 G1 usuario uuid desconocido → "No autorizado: esta operación es para usuarios del portal."
✅ P5 G1 usuario NULL → "No autorizado: esta operación es para usuarios del portal."
✅ P5 G1 propietario del portal con entidad → OK
✅ P2 portal INSERT directo a spcs → RLS
✅ P2 portal INSERT directo a inscripciones → RLS
✅ P2 portal UPDATE directo a spcs (bajar la marca) → 0 filas, nada cambia
✅ P6 staff INSERT disfrazado de portal → secretaria, alta_por = staff, sin revisión
✅ P6 staff edita otro campo → la marca sigue pendiente
✅ P6 staff marca revisado con revisado_por/alta_por/origen/motivos falsos → base impone staff+now, conserva alta y motivos
✅ P6 las dos ediciones del staff quedan auditadas con su usuario
✅ P7 la migración no cambia ninguna política (md5 de pg_policies)
✅ P7 la migración no cambia ningún GRANT de tabla

49/49 asserts OK
md5(pg_get_functiondef) en el sandbox: {"fn_spcs_alta_revision":"cd33a7683698ccf0704683e678bdc623","rpc_spc_alta_studbook_portal":"704f4762eb9ce373aecd4be9abdd0a78"}

── mutantes ──
✅ muere M1 sin guard 0  ← P1c
✅ muere M2 G1 sin "activo"  ← P5
✅ muere M3 V1 sin ventana  ← S7
✅ muere M4 V3 raza libre  ← S9
✅ muere M5 V5 sin control de fecha  ← S11
✅ muere M6 V6 sin control de sexo  ← S12
✅ muere M7 V7 mínimo 0  ← S13
✅ muere M8 V7 sin motivo edad > 12  ← S13, P6
✅ muere M9 sin D1  ← S14
✅ muere M10 D2 crea en vez de reusar  ← S4
✅ muere M11 D3 reusa la primera  ← S5
✅ muere M12 R1 tope 99  ← S14
✅ muere M13 sin D4 (homónimo)  ← S3c, S6
✅ muere M14 sin ON CONFLICT  ← S3b
✅ muere M15 sin lock por nombre  ← S3c
✅ muere M16 nace sin revisión pendiente  ← S1, P2, P6
✅ muere M17 GRANT a authenticated  ← P1, P4
✅ muere M18 trigger INSERT no impone secretaria  ← P6
✅ muere M19 trigger UPDATE no impone revisado_por  ← P6
✅ muere M20 trigger UPDATE deja cambiar alta_por  ← P6
✅ muere M21 sin auditoría de spcs  ← S1, P6

mutantes: 21/21 muertos
exit 0
```

### A.2 `node tests/probe_portal_alta_spc_ui.mjs --mutantes`

```
✅ U1 sin resultados en el padrón → botón "Buscar «WAVE» en el Stud Book"
✅ U2 candidatos: nombre hostil escapado, sin elementos inyectados
✅ U2 el que ya está en el padrón (mismo nº SB) → "Ya está en el padrón — anotarlo"; el otro → "Es este — anotarlo"
✅ U3 sin caballeriza → no llama a traer y pide la caballeriza
✅ U4 traer con SÓLO {accion, sb_id, nombre, carrera_id}
✅ U4 recarga el padrón y anota con el spc_id devuelto (rpc_inscribir)
✅ U5 traer rechazado → mensaje de la RPC y NO se anota
✅ U6 Stud Book caído → "El Stud Book no responde ahora. Pedile a la secretaría del hipódromo que lo cargue."
✅ V1 chip "Por revisar" = 1 y visible
✅ V1 clic en el chip filtra "Por revisar (portal)" → sólo la pendiente, con badge
✅ V2 ✏️ de DEVIL'S KING (apóstrofo) abre el modal con esa ficha
✅ V2 ficha de secretaría → sin caja de revisión
✅ V3 caja de revisión: quién (escapado), motivo, botón
✅ V4 Marcar revisado → update({revision_pendiente:false}) y nada más, por id
✅ V4 0 filas → error y el modal sigue abierto
✅ V4 1 fila → cierra el modal y recarga
✅ W1 el SELECT de inscripciones pide spcs(nombre,revision_pendiente)
✅ W2 "Cargada por": portal + pendiente → "ficha nueva, por revisar"; sin pendiente → no; secretaría + pendiente → sí

18/18 asserts OK

── mutantes ──
✅ muere MU1 portal: traer sin validar la monta antes  ← U3, U4
✅ muere MU2 portal: el navegador manda la ficha entera  ← U4
✅ muere MU3 portal: candidatos sin escapar  ← U2
✅ muere MU4 portal: sin botón del Stud Book en lista vacía  ← U1, U2, U3, U4, U5, U6
✅ muere MU5 spcs: ✏️ vuelve a JSON.stringify en el atributo  ← V2
✅ muere MU6 spcs: Marcar revisado sin chequeo de 0 filas  ← V4
✅ muere MU7 spcs: chip sin conteo  ← V1
✅ muere MU8 inscripciones: sin la línea de ficha nueva  ← W2

mutantes: 8/8 muertos
exit 0
```

### A.3 `node tests/probe_studbook_buscar_fn.mjs` (Stud Book real, sin Supabase)

```
✅ 1) EL MAS SABIO → 1 exacto, 0 parciales  → 1/0
✅ 1) … macho, sb 431662, 2021-10-26, Alazan, sin alertas  → {"sb_id":"431662","nombre":"EL MAS SABIO","fecha_nacimiento":"2021-10-26","sexo":"macho","sexo_sb":"Macho","color":"Alazan","padrillo_nombre":"Il Campione (CHI)","madre_nombre":"Indigirka","abuelo_materno":"Interprete","pais_origen":"Argentina","url_perfil":"https://www.studbook.org.ar/ejemplares/perfil/431662/el-mas-sabio","leyenda":"(2021 M SP)","tomo":1242,"folio":998,"raza":4,"alertas":[]}
✅ 2) BIEN COQUETA → 2 exactos (homónimas), no se elige  → 2
✅ 2) … años 2021 y 1998, las dos hembra, con padres  → [["2021-10-15","Bien Terminado","Gritty"],["1998-07-29","Yale Twentyniner (USA)","Coquetisima"]]
✅ 3) MARIA CATU → 0 exactos, parcial MARIA CATULENGA  → ["MARIA CATULENGA"]
✅ 4) "bella doña" → 1 exacto por normalización (sb 403664)  → ["403664"]
✅ 5) ZZZZQ → 0 / 0  → 0/0
✅ 6) raza 3 + bandera extranjera → 2 alertas, pais_origen null  → ["raza != 4 (SPC): 3","bandera no argentina: /img/banderas/239.png"]
✅ 6) sexo desconocido → sexo null + alerta; fecha vacía → null  → [null,["sexo desconocido: Yegua?"],null]
✅ 7) norm("Bella Doña") === norm("BELLADONA")
✅ 7) toISO("15/10/2021") → 2021-10-15; toISO("x") → null
✅ 8) validarTraer: body válido → null
✅ 8) validarTraer: sb_id con letras / nombre corto / carrera no-UUID → error
✅ 8) elegirHit contra el Stud Book real: WAVE RIMOUT → id 397805  → {"icon":"/img/banderas/10.png","id":397805,"text":"WAVE RIMOUT","leyenda":"(2017 M SP)","padre":"Remote (GB)","madre":"Holiday Wave","abuelo_materno":"Harlan's Holiday (USA)","tomo":1209,"folio":804,"sexo":"Macho","nacimiento":"08/08/2017","pelo":"Zaino","raza":4,"url_friendly":"wave-rimout","adn":1,"pasaporte":1,"mc":1,"revisado":1}
✅ 8) elegirHit con un id que no está → null (la función responde 409 no_coincide)
✅ 8) homónimos: elegirHit devuelve el ELEGIDO por id, no el primero por nombre  → {"icon":"/img/banderas/10.png","id":216248,"text":"BIEN COQUETA","leyenda":"(1998 H SP)","padre":"Yale Twentyniner (USA)","madre":"Coquetisima","abuelo_materno":"Friul","tomo":1057,"folio":260,"sexo":"Hembra","nacimiento":"29/07/1998","pelo":"Alazan","raza":4,"url_friendly":"bien-coqueta","adn":0,"pasaporte":0,"mc":0,"revisado":0}
✅ 8) paramsAlta: los 15 parámetros de la RPC, con lo que armó la función  → {"p_auth_user_id":"a0000000-0000-0000-0000-000000000001","p_carrera_id":"b1000000-0000-0000-0000-000000000001","p_sb_id":"397805","p_nombre":"WAVE RIMOUT","p_fecha_nacimiento":"2017-08-08","p_sexo":"macho","p_color":"Zaino","p_padre":"Remote (GB)","p_madre":"Holiday Wave","p_abuelo_materno":"Harlan's Holiday (USA)","p_pais":"Argentina","p_url_perfil":"https://www.studbook.org.ar/ejemplares/perfil/397805/wave-rimout","p_leyenda":"(2017 M SP)","p_raza":4,"p_alertas":[]}
✅ 8) errorRpcAHttp: 42501→403, P0001/22023→422 con el mensaje de la RPC, otro→500 SIN el mensaje interno  → [{"status":403,"error":"no_autorizado","detalle":"No autorizado: esta operación es para usuarios del portal."},{"status":422,"error":"rechazado","detalle":"Ya trajiste 3 caballos nuevos hoy."},{"status":422,"error":"rechazado","detalle":"El número de Stud Book no es válido."},{"status":500,"error":"alta_fallida","detalle":"No se pudo dar de alta el caballo."}]

18/18 asserts OK
exit 0
```

### A.4 `node tests/probe_portal_validacion.mjs` (sin red ni base)

```

== probe_portal_validacion — el rechazo se ve en pantalla ==

  ok   A rechazo con motivo genérico (edad/sexo/sanción/cupo)
        mensaje: ❌ Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.
  ok   B duplicado en el MISMO turno (mensaje sin prefijo)
        mensaje: ❌ Ese caballo ya está anotado en ese turno.
  ok   C SPC inexistente
        mensaje: ❌ El caballo no existe.
  ok   D ventana de inscripción cerrada
        mensaje: ❌ La inscripción para ese turno no está abierta.
  ok   E el RPC no responde (fail-closed, no puede pasar por éxito)
        mensaje: ❌ network error
  ok   F caso válido — anota y refresca
  ok   G falta la caballeriza — ni siquiera llama al RPC
        mensaje: ❌ Antes de anotar tenés que elegir la caballeriza.
  ok   H sin jockey — anota igual
  ok   J suplente sin titular — ni siquiera llama al RPC
        mensaje: ❌ No se puede declarar un suplente sin jockey titular.
  ok   I falta el entrenador — ni siquiera llama al RPC
        mensaje: ❌ Antes de anotar tenés que elegir el entrenador que presenta el caballo.

✅ TODO OK — sin red y sin base: 0 filas tocadas

exit 0
```

### A.5 `node tests/probe_aviso_jockey_repetido.mjs` (prod, sólo lectura) — falla (b) ajena a esta rama, ver arriba

```
<anonymous_script>:41
    const { data, error } = await sb.rpc('rpc_cambiar_monta', { p_inscripcion_id: u.id, p_jockey_id: u.jockey_titular_id });
                                     ^

TypeError: sb.rpc is not a function
    at Object.saveMontas [as save] (eval at make (file:///home/clio/dev/SGH/tests/probe_aviso_jockey_repetido.mjs:252:16), <anonymous>:41:38)
    at file:///home/clio/dev/SGH/tests/probe_aviso_jockey_repetido.mjs:264:12
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)

Node.js v22.22.1
exit 1
```

### A.6 `node tests/probe_orden_inscriptos.mjs` (prod, sólo lectura) — falla esperada hasta aplicar la migración

```
file:///home/clio/dev/SGH/tests/probe_orden_inscriptos.mjs:107
  const toast = (msg, tipo) => { if (tipo === 'error') throw new Error(`toast error: ${msg}`); };
                                                             ^

Error: toast error: column spcs_1.revision_pendiente does not exist
    at toast (file:///home/clio/dev/SGH/tests/probe_orden_inscriptos.mjs:107:62)
    at loadInscripciones (eval at correrPantalla (file:///home/clio/dev/SGH/tests/probe_orden_inscriptos.mjs:101:15), <anonymous>:17:16)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async eval (eval at correrPantalla (file:///home/clio/dev/SGH/tests/probe_orden_inscriptos.mjs:101:15), <anonymous>:28:5)
    at async file:///home/clio/dev/SGH/tests/probe_orden_inscriptos.mjs:162:16

Node.js v22.22.1
exit 1
```

### A.7 Recuento de `spcs` antes del commit del baseline (MCP `execute_sql`, prod)

```sql
select count(*) as spcs, max(created_at) as ultima_alta from spcs;
```

```json
[{"spcs":238,"ultima_alta":"2026-10-01 17:08:37.83153+00"}]
```

### A.8 Fichas con apóstrofo (el ✏️ de `spcs.html` no abría) (MCP, prod)

```sql
select count(*) filter (where notas like '%''%' or nombre like '%''%' or padrillo_nombre like '%''%' or madre_nombre like '%''%' or abuela_materna like '%''%' or marcas like '%''%' or ult_performances like '%''%' or color like '%''%') as con_apostrofo, count(*) as total, (select json_agg(nombre) from (select nombre from spcs where notas like '%''%' or nombre like '%''%' or padrillo_nombre like '%''%' or madre_nombre like '%''%' or ult_performances like '%''%' limit 10) x) as ejemplos from spcs;
```

```json
[{"con_apostrofo":12,"total":238,"ejemplos":["BAM BAM HITS","BUEN MANUEL","PEAKY GIRL","INDIO GOLDEN","SOY ESENCIAL","UNBOTHERED","LOCA DUBAI","DEVIL'S KING","SOUTH GOTICO","ESTAS A TIEMPO"]}]
```

### A.9 EXECUTE de las funciones de rol que usa el gate de la Edge Function (MCP, prod)

```sql
select r.rolname, has_function_privilege(r.oid,'public.fn_is_portal_user()','EXECUTE') portal, has_function_privilege(r.oid,'public.fn_is_staff()','EXECUTE') staff from pg_roles r where r.rolname in ('anon','authenticated','service_role');
```

```json
[{"rolname":"authenticated","portal":true,"staff":true},{"rolname":"anon","portal":true,"staff":true},{"rolname":"service_role","portal":true,"staff":true}]
```

### A.10 Migración + rollback en el sandbox (base `sgh_pa_rb`, borrada al final)

```bash
P="docker exec -i sgh-local-pg psql -v ON_ERROR_STOP=1 -U postgres -q -tA"
$P -c "drop database if exists sgh_pa_rb" -c "drop database if exists sgh_pa_tpl" -c "create database sgh_pa_tpl"
$P -d sgh_pa_tpl < tests/local/portal_alta_spc_sandbox.sql
$P -c "create database sgh_pa_rb template sgh_pa_tpl"
Q="select md5(string_agg(column_name||data_type,',' order by column_name)) from information_schema.columns where table_name='spcs'; select count(*) from pg_trigger where tgrelid='spcs'::regclass and not tgisinternal; select count(*) from pg_proc where proname in ('rpc_spc_alta_studbook_portal','fn_spcs_alta_revision');"
echo antes; echo "$Q" | $P -d sgh_pa_rb
$P -d sgh_pa_rb < migrations/portal_alta_spc_studbook.sql
echo con migración; echo "$Q" | $P -d sgh_pa_rb
$P -d sgh_pa_rb < migrations/rollback_portal_alta_spc_studbook.sql
echo después del rollback; echo "$Q" | $P -d sgh_pa_rb
$P -c "drop database sgh_pa_rb" -c "drop database sgh_pa_tpl"
```

```
NOTICE:  database "sgh_pa_rb" does not exist, skipping
NOTICE:  database "sgh_pa_tpl" does not exist, skipping
antes:
c557dcf1ac7aa40ad74b97f11722a1fa
1
0
con migración:
e824ac2ea5d928b5dba4b62fe96f5e6e
3
2
después del rollback:
c557dcf1ac7aa40ad74b97f11722a1fa
1
0
```

Columnas de `spcs` idénticas antes y después del rollback (md5), 1 trigger propio (`trg_spcs_updated_at`) → 3 → 1, 0 → 2 → 0
funciones.

### A.11 Bases del contenedor sandbox al terminar

```
$ docker exec -i sgh-local-pg psql -U postgres -tAc "select datname from pg_database order by 1"
postgres
sgh
template0
template1
```

---

## Verificación de push

```
$ git push -q origin HEAD:reports
$ git ls-remote origin reports
07515bc442013db1a54b63ecad519ce4a1aad972	refs/heads/reports
$ git rev-parse HEAD
07515bc442013db1a54b63ecad519ce4a1aad972
```

Coinciden: el informe (commit `07515bc`) está en `origin/reports`. La rama de trabajo `feat/portal-alta-spc-studbook`
(`a1414ef`) también está pusheada (PR #29). Este bloque va en un commit posterior.
