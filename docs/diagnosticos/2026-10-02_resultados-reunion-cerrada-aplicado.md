# Resultados en reunión cerrada (ISSUE-102) + oficializado_* (ISSUE-101) + ISSUE-089 — Fase 2: sandbox y prod APLICADOS

- **Fecha:** 2026-10-02, 01:58–02:12 UTC (22:58–23:12 del 01/10 en Argentina, fuera de horario)
- **Pedido:** OK fase 2, pasos 1 (sandbox) y 2 (prod). Decisiones: service_role sujeto al trigger; paso 4 (corrección con
  resolución) y estados de resolución esperan a Fede; baja de `resultados_legacy.html` en el PR del front (paso 3, después de prod);
  ISSUE nuevo para `performances`; sumar `fn_is_staff()` a las políticas de escritura de `resultados` y `resultado_posiciones`.
- **Resultado:** los 4 pasos aplicados en el orden pedido, **md5 = sandbox en cada uno**, sin rollback.
- **Guards:** pwd=/home/clio/dev/SGH · ref=unlhcuanfrtpatoipwve · spcs=238 (antes y después).

## Versiones y SHA

| Paso | Qué | Versión en prod | md5 prod = sandbox |
|---|---|---|---|
| A | `resultados_backfill_oficializado.sql` | **`20261002020753`** | — (datos: 23/23 con fecha, 20 con usuario) |
| B | `resultados_guard_cerrada.sql` | **`20261002020829`** | `fn_resultado_cerrado_guard` `24b68443d9e200e26739fb0be6806721` ✔; las 6 políticas ✔ (§3.2) |
| C | `aplicar_resultado_v2.sql` | **`20261002020924`** | `6594e5070ce82d1c90e9fed60ddd0566` ✔ (v1 era `94d46dc0…`) |
| D | `desoficializar_carrera_v2.sql` | **`20261002020946`** | `fc77286021e6ec54102f7463fd66b9bf` ✔ (v1 era `c3247d72…`) |

- Rama `feat/resultados-reunion-cerrada`: **`36151b2`** (migraciones + sandbox + probe) y **`b3811d7`** (docs: ISSUE-102,
  ISSUE-103, CHANGELOG, CLAUDE.md, encabezados con versión). PR **#34** (https://github.com/mdqclio/SGH/pull/34), **sin mergear**:
  versiona lo aplicado y no toca archivos servidos por Pages.
- `main` sin cambios: `cc594e4`.

## 1. Actividad antes de arrancar (MCP, prod)

```json
{"ahora":"2026-10-02T01:58:27.144326+00:00","insc_2h":0,"resultados_2h":0,"auditoria_2h":[{"t":"2026-10-02T00:22:32.39785+00:00","tabla":"usuarios","accion":"DELETE","usuario":null},{"t":"2026-10-02T00:22:20.702648+00:00","tabla":"usuarios","accion":"INSERT","usuario":null},{"t":"2026-10-02T00:19:25.404299+00:00","tabla":"usuarios","accion":"DELETE","usuario":null},{"t":"2026-10-02T00:19:24.574401+00:00","tabla":"usuarios","accion":"DELETE","usuario":null},{"t":"2026-10-02T00:19:23.799319+00:00","tabla":"usuarios","accion":"DELETE","usuario":null},{"t":"2026-10-02T00:19:19.60668+00:00","tabla":"usuarios","accion":"INSERT","usuario":null},{"t":"2026-10-02T00:19:10.40562+00:00","tabla":"usuarios","accion":"INSERT","usuario":null},{"t":"2026-10-02T00:19:04.281936+00:00","tabla":"usuarios","accion":"INSERT","usuario":null},{"t":"2026-10-02T00:18:49.353637+00:00","tabla":"usuarios","accion":"DELETE","usuario":null},{"t":"2026-10-02T00:18:48.602884+00:00","tabla":"usuarios","accion":"DELETE","usuario":null},{"t":"2026-10-02T00:18:39.091614+00:00","tabla":"usuarios","accion":"INSERT","usuario":null},{"t":"2026-10-02T00:18:33.525242+00:00","tabla":"usuarios","accion":"INSERT","usuario":null},{"t":"2026-10-02T00:18:24.825994+00:00","tabla":"usuarios","accion":"DELETE","usuario":null},{"t":"2026-10-02T00:18:08.625751+00:00","tabla":"usuarios","accion":"INSERT","usuario":null}],"auth_logins_2h":1,"spcs":238,"last_mig":"20261002001639","oficiales_sin_at":23}
```

- 0 inscripciones y 0 resultados tocados en 2 h. La auditoría de 00:18–00:22 son los usuarios de prueba de mis probes de la tanda
  anterior (alta de SPC, e2e). El único inicio de sesión (`auth_logins_2h: 1`) es una cuenta de Auth **sin fila en `usuarios`**
  (00:24 UTC, sin rol): no es operación.
- Justo antes del paso A (02:07 UTC): `actividad_15min: 0`, `auditoria_15min: 0` (§3.0).

## 2. Paso 1 — sandbox

- Base aparte en el contenedor `sgh-local-pg`: `tests/local/resultados_cerrada_sandbox.sql` (columnas, constraints, políticas y
  funciones auxiliares copiadas de prod) + la **v1 exacta** de las dos RPC (sus rollbacks). **md5 de la v1 en el sandbox = prod**
  (`94d46dc0…`, `c3247d72…`), así que el sandbox es fiel.
- Primer intento de backfill en el sandbox: tomó `now()`. Lo causó el fixture: insertaba resultados con el trigger de auditoría ya
  activo y eso generaba una "última transición" falsa. Se limpia la auditoría de la carga. **La migración no cambió.**
- Probe `node tests/probe_resultados_cerrada.mjs --mutantes`: **30/30, 11/11 mutantes**. La salida completa va en §A.1.
- Rollbacks de los 4, en orden inverso: funciones con el md5 de prod, políticas iguales a las de antes y triggers originales (§A.2).

## 3. Paso 2 — prod

### 3.0 Foto previa (02:07 UTC)

```json
{"ahora":"2026-10-02T02:07:36.628723+00:00","actividad_15min":0,"auditoria_15min":0,"spcs":238,"last_mig":"20261002001639","fn":{"aplicar_resultado":"94d46dc0ed70e78329169bb3926f64c2","desoficializar_carrera":"c3247d72656833cd534e4c601900f25a"},"pol_todas":"5b99b02b65a6ce2e44422d0100509741","pol_resto":"83dfdda93688db440a9777a3f55dc523","pol_6":{"resultado_posiciones_delete":"bd37f4166c66794dab11c9d02bfcc15a","resultado_posiciones_insert":"16081d0315205252672599a9147e1621","resultado_posiciones_update":"d28bd5577a3e8b589be3f0b67ea588bf","resultados_delete":"587b51884a36ade33ad9cce638900d01","resultados_insert":"7b891a1a4336375a76afc46e861f3836","resultados_update":"1037b08a3321c674aaa9e56df5b68df4"},"trg":["resultados.resultados_set_updated_at","resultados.trg_audit_resultados"],"ofi":{"oficiales":23,"sin_at":23}}
```

### 3.1 Paso A — backfill → `{"success":true}`

```json
{"por_reunion":[{"numero":6,"oficiales":7,"sin_at":0,"con_por":7},{"numero":8,"oficiales":8,"sin_at":0,"con_por":8},{"numero":9,"oficiales":5,"sin_at":0,"con_por":5},{"numero":9999,"oficiales":3,"sin_at":0,"con_por":0}],"r9_c4":{"at":"2026-09-20T18:17:24.691932+00:00","por":"Martin Juarez"},"detalle":[{"r":6,"c":1,"t":1,"at":"2026-07-22T19:21:32.815249+00:00","por":"Administrador Dolores"},{"r":6,"c":2,"t":2,"at":"2026-07-22T19:21:38.325953+00:00","por":"Administrador Dolores"},{"r":6,"c":4,"t":8,"at":"2026-07-22T19:22:48.944463+00:00","por":"Administrador Dolores"},{"r":6,"c":5,"t":11,"at":"2026-07-22T19:23:08.67285+00:00","por":"Administrador Dolores"},{"r":6,"c":6,"t":6,"at":"2026-07-22T19:22:31.023793+00:00","por":"Administrador Dolores"},{"r":6,"c":7,"t":9,"at":"2026-07-22T20:04:19.977644+00:00","por":"Administrador Dolores"},{"r":6,"c":8,"t":5,"at":"2026-07-22T19:22:18.638669+00:00","por":"Administrador Dolores"},{"r":8,"c":1,"t":2,"at":"2026-08-16T17:54:23.134748+00:00","por":"Yesica Elias"},{"r":8,"c":2,"t":12,"at":"2026-08-17T23:28:39.830823+00:00","por":"Yesica Elias"},{"r":8,"c":3,"t":4,"at":"2026-08-18T14:05:04.994915+00:00","por":"Yesica Elias"},{"r":8,"c":4,"t":5,"at":"2026-08-19T13:28:30.722342+00:00","por":"Yesica Elias"},{"r":8,"c":5,"t":10,"at":"2026-08-18T14:03:21.586076+00:00","por":"Yesica Elias"},{"r":8,"c":6,"t":11,"at":"2026-08-17T23:38:28.027639+00:00","por":"Yesica Elias"},{"r":8,"c":7,"t":3,"at":"2026-08-17T23:40:09.68645+00:00","por":"Yesica Elias"},{"r":8,"c":8,"t":8,"at":"2026-08-19T13:35:08.701128+00:00","por":"Yesica Elias"},{"r":9,"c":1,"t":1,"at":"2026-09-20T16:33:36.254563+00:00","por":"Martin Juarez"},{"r":9,"c":2,"t":4,"at":"2026-09-20T17:02:55.880672+00:00","por":"Martin Juarez"},{"r":9,"c":3,"t":6,"at":"2026-09-20T17:36:20.030455+00:00","por":"Martin Juarez"},{"r":9,"c":4,"t":5,"at":"2026-09-20T18:17:24.691932+00:00","por":"Martin Juarez"},{"r":9,"c":5,"t":7,"at":"2026-09-20T19:10:06.767175+00:00","por":"Martin Juarez"},{"r":9999,"c":null,"t":3,"at":"2026-09-22T20:48:30.484319+00:00","por":null},{"r":9999,"c":null,"t":2,"at":"2026-06-10T02:33:04.025416+00:00","por":null},{"r":9999,"c":null,"t":1,"at":"2026-09-23T01:35:46.333298+00:00","por":null}],"migs":["20261002020753 resultados_backfill_oficializado"]}
```

Nota: R8 C3 queda con la oficialización del 18/08 14:05 (Yesica), que es la **última**. En R8 hubo re-oficializaciones.

### 3.2 Paso B — trigger, auditoría y políticas → `{"success":true}`

```json
{"fn":{"aplicar_resultado":"94d46dc0ed70e78329169bb3926f64c2","desoficializar_carrera":"c3247d72656833cd534e4c601900f25a","fn_resultado_cerrado_guard":"24b68443d9e200e26739fb0be6806721"},"pol_6":{"resultado_posiciones_insert":"fdb4fc104891c324f0a08da33a951cb7","resultado_posiciones_update":"0f264c9d96edf6e8c5169816628fc2ef","resultado_posiciones_delete":"9a16503239381f0b7be6c46062530c91","resultados_insert":"1f501a4cd6d89115909b2d82853e0351","resultados_update":"5232e588f24bf123514396a183a531d9","resultados_delete":"35f84de1e92484a47f39b109ab053c7f"},"pol_resto":"83dfdda93688db440a9777a3f55dc523","trg":["resultado_apuestas.trg_audit_resultado_apuestas","resultado_apuestas.trg_resultado_cerrado","resultado_posiciones.trg_audit_resultado_posiciones","resultado_posiciones.trg_resultado_cerrado","resultados.resultados_set_updated_at","resultados.trg_audit_resultados","resultados.trg_resultado_cerrado"],"exec_guard":{"authenticated":false,"anon":false,"service_role":true},"migs":["20261002020753 resultados_backfill_oficializado","20261002020829 resultados_guard_cerrada"]}
```

Las 6 políticas = `tests/local/resultados_cerrada_md5_esperado.txt`, una por una. `pol_resto` es igual al de antes (`83dfdda9…`):
no cambió ninguna otra política.

**En vivo** (key secreta = service_role): UPDATE **sin cambios** (`incidentes` = el mismo valor) de R8 C3:

```json
{
 "carrera_r8_c3": "355537ae-3a74-49ad-b283-26008cf6f8ba",
 "resultado": "d397ec48-c79f-4b87-83e4-9bcd0e618f79",
 "error": {
  "code": "P0092",
  "message": "La liquidación de esta reunión está cerrada (saldada): el resultado de la carrera 3 no se puede modificar. Si un fallo (p. ej. de doping) obliga a cambiarlo, lo corrige un super_admin con la resolución. ISSUE-102"
 },
 "filas": null,
 "updated_at_antes": "2026-10-02T02:07:53.017392+00:00",
 "updated_at_despues": "2026-10-02T02:07:53.017392+00:00",
 "sin_cambios": true
}
```

### 3.3 Paso C — `aplicar_resultado` v2 → `{"success":true}`

```json
{"fn":{"aplicar_resultado":"6594e5070ce82d1c90e9fed60ddd0566","desoficializar_carrera":"c3247d72656833cd534e4c601900f25a","fn_resultado_cerrado_guard":"24b68443d9e200e26739fb0be6806721"},"exec":{"authenticated":true,"anon":false,"service_role":true},"migs":["20261002020753 resultados_backfill_oficializado","20261002020829 resultados_guard_cerrada","20261002020924 aplicar_resultado_v2"]}
```

### 3.4 Paso D — `desoficializar_carrera` v2 → `{"success":true}`

```json
{"fn":{"aplicar_resultado":"6594e5070ce82d1c90e9fed60ddd0566","desoficializar_carrera":"fc77286021e6ec54102f7463fd66b9bf","fn_resultado_cerrado_guard":"24b68443d9e200e26739fb0be6806721"},"exec_desof":{"authenticated":true,"anon":false,"service_role":true},"pol_resto":"83dfdda93688db440a9777a3f55dc523","migs":["20261002020753 resultados_backfill_oficializado","20261002020829 resultados_guard_cerrada","20261002020924 aplicar_resultado_v2","20261002020946 desoficializar_carrera_v2"],"spcs":238,"ofi":{"oficiales":23,"sin_at":0,"con_por":20}}
```

**En vivo**, las dos RPC sobre R8 C3 con service_role. Va con doble seguro: `aplicar_resultado` con un `expected_updated_at` falso,
así que si el corte no estuviera caería en CONCURRENT_MODIFICATION; `desoficializar_carrera` sobre una carrera con plata
comprometida, así que caería en "pagos emitidos". Ninguna de las dos podía escribir:

```json
{
 "aplicar": {
  "code": "P0092",
  "message": "aplicar_resultado: la liquidación de esta reunión está cerrada (saldada): el resultado de la carrera 3 no se puede modificar. Si un fallo (p. ej. de doping) obliga a cambiarlo, lo corrige un super_admin con la resolución. ISSUE-102"
 },
 "desoficializar": {
  "code": "P0092",
  "message": "desoficializar_carrera: la liquidación de esta reunión está cerrada (saldada): la carrera 3 no se puede des-oficializar. Si un fallo (p. ej. de doping) obliga a cambiar el resultado, lo corrige un super_admin con la resolución. ISSUE-102"
 },
 "antes": {
  "estado": "oficial",
  "updated_at": "2026-10-02T02:07:53.017392+00:00",
  "oficializado_at": "2026-08-18T14:05:04.994915+00:00"
 },
 "despues": {
  "estado": "oficial",
  "updated_at": "2026-10-02T02:07:53.017392+00:00",
  "oficializado_at": "2026-08-18T14:05:04.994915+00:00"
 },
 "sin_cambios": true
}
```

### 3.5 Regresión en la reunión abierta (9999): `node tests/probe_guard_staff_rpcs.mjs --fn <f>`

```
== --fn aplicar_resultado
✅ G-aplicar_resultado-operador) operador pasa y el efecto se produce
   → efecto=true
✅ G-aplicar_resultado-otroclub) otroclub → 42501 del guard de aplicar_resultado, y nada cambia
   → code=42501 aplicar_resultado: la carrera es de otro hipódromo
✅ G-aplicar_resultado-portal) portal → 42501 del guard de aplicar_resultado, y nada cambia
   → code=42501 aplicar_resultado: sin permiso
✅ G-aplicar_resultado-sinfila) sinfila → 42501 del guard de aplicar_resultado, y nada cambia
   → code=42501 aplicar_resultado: sin permiso
✅ G-aplicar_resultado-anon) anon → 42501 del guard de aplicar_resultado, y nada cambia
   → code=42501 permission denied for function aplicar_resultado
✅ R1) restore por estado: la 9999 quedó exactamente como al empezar
   → sin diferencias
✅ R2) no quedaron usuarios ni recibos del probe
   → usuarios=0 recibos=0

12/12 OK
== --fn desoficializar_carrera
✅ G-desoficializar_carrera-operador) operador pasa y el efecto se produce
   → efecto=true
✅ G-desoficializar_carrera-otroclub) otroclub → 42501 del guard de desoficializar_carrera, y nada cambia
   → code=42501 desoficializar_carrera: la carrera es de otro hipódromo
✅ G-desoficializar_carrera-portal) portal → 42501 del guard de desoficializar_carrera, y nada cambia
   → code=42501 desoficializar_carrera: sin permiso
✅ G-desoficializar_carrera-sinfila) sinfila → 42501 del guard de desoficializar_carrera, y nada cambia
   → code=42501 desoficializar_carrera: sin permiso
✅ G-desoficializar_carrera-anon) anon → 42501 del guard de desoficializar_carrera, y nada cambia
   → code=42501 permission denied for function desoficializar_carrera
✅ R1) restore por estado: la 9999 quedó exactamente como al empezar
   → sin diferencias
✅ R2) no quedaron usuarios ni recibos del probe
   → usuarios=0 recibos=0

12/12 OK
```

(Sale el final de cada corrida, con `tail -n 16`. Las primeras líneas de cada una, P0 de fixture y super_admin/secretario, están
contadas en el 12/12 de cada función.)

### 3.6 `get_advisors security` (leído completo)

```
leído completo: 81460 caracteres; 75 hallazgos
41 authenticated_security_definer_function_executable WARN
26 anon_security_definer_function_executable WARN
6 rls_enabled_no_policy INFO
1 security_definer_view ERROR
1 auth_leaked_password_protection WARN
--- los que nombran algo de esta tarea (resultado / guard / aplicar / desoficializar):
WARN anon_security_definer_function_executable | Function `public.fn_club_de_resultado(p_resultado_id uuid)` can be executed by the `anon` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/fn_club_de_resultado`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
WARN authenticated_security_definer_function_executable | Function `public.aplicar_resultado(p_resultado_id uuid, p_expected_updated_at timestamp with time zone, p_carrera_id uuid, p_estado text, p_estado_pista text, p_tiempo_ganador text, p_incidentes text, p_favorito_mandil integer, p_redistribucion_legs jsonb, p_posiciones jsonb, p_apuestas jsonb)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/aplicar_resultado`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
WARN authenticated_security_definer_function_executable | Function `public.desoficializar_carrera(p_carrera_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/desoficializar_carrera`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
WARN authenticated_security_definer_function_executable | Function `public.fn_club_de_resultado(p_resultado_id uuid)` can be executed by the `authenticated` role as a `SECURITY DEFINER` function via `/rest/v1/rpc/fn_club_de_resultado`. Revoke `EXECUTE` or switch it to `SECURITY INVOKER` if that is not intentional.
```

Mismos 75 hallazgos que antes de la tarea. `fn_resultado_cerrado_guard` no aparece: es SECURITY DEFINER, pero sin EXECUTE para anon
ni authenticated. Los WARN de `aplicar_resultado`/`desoficializar_carrera` (authenticated) son los de siempre y son a propósito.

## 4. ISSUE-103 — `performances` vacía y de dónde sale "4 ULT. PERF."

Anotado en `docs/ISSUES.md` (PR #34). Relevado en `main` y en prod (sólo lectura):

```
$ git grep -n -i "ult\.\? *perf\|ult_performances\|ultimas\? perf\|performances\|4 ULT" origin/main -- programa.html programa-oficial.html programa-oficial-color.html
origin/main:programa-oficial-color.html:366:    sb.from('spcs').select('id,nombre,sexo,color,fecha_nacimiento,padrillo_nombre,madre_nombre,ult_performances').in('id', spcIds.length ? spcIds : EMPTY),
origin/main:programa-oficial-color.html:706:        <td>${i.performance || spc.ult_performances || ''}</td>
origin/main:programa-oficial-color.html:739:        <col style="width:64px"><!-- 4 ÚLT.: 4 performances (máx 58px); 5 envuelven -->
origin/main:programa-oficial.html:246:    sb.from('spcs').select('id,nombre,sexo,color,fecha_nacimiento,padrillo_nombre,madre_nombre,ult_performances').in('id', spcIds.length ? spcIds : EMPTY),
origin/main:programa-oficial.html:477:        <td>${i.performance || spc.ult_performances || ''}</td>
origin/main:programa-oficial.html:507:        <th>CABALLERIZA</th><th>4 ULT. PERF.</th><th>N°</th>…
origin/main:programa.html:266:  // Load performances for SPCs
origin/main:programa.html:269:    const { data: perfs } = await sb.from('performances').select('*').in('spc_id', spcIds).order('fecha_carrera', {ascending:false});
origin/main:programa.html:271:    (perfs||[]).forEach(p => { if (!performances[p.spc_id]) performances[p.spc_id]=[]; if (performances[p.spc_id].length<5) performances[p.spc_id].push(p); });
origin/main:programa.html:303:  const perfs = performances[spcId]||[];
```

(La línea 507 se recortó en el `cut` de la terminal; el resto de la fila es la cabecera de la tabla.)

```json
{"spcs_ult_perf":{"total":238,"con_ult_performances":0},"insc_performance":[{"numero":6,"ratificadas":81,"con_performance":0},{"numero":8,"ratificadas":67,"con_performance":67},{"numero":9,"ratificadas":74,"con_performance":74},{"numero":10,"ratificadas":0,"con_performance":0},{"numero":9999,"ratificadas":17,"con_performance":0}],"ejemplos_insc":["0L","4P 0L 3L 1D","7L3L0L5D","3D 7S 7S 0S","0S0L7T8L"],"ejemplos_spcs":null,"performances_total":0,"performances_cols":"id, spc_id, carrera_id, fecha_carrera, hipodromo_sigla, hipodromo_nombre, numero_carrera, categoria_codigo, categoria_simbolo, distancia_metros, tipo_pista, posicion, tiempo_ganador, diferencia, peso_llevado, jockey_id, jockey_nombre, observaciones, descalificado, fuente, created_at"}
```

- **Impreso:** `inscripciones.performance`, texto cargado a mano en Inscripciones, y si falta `spcs.ult_performances` (vacío en las
  238). R8 y R9 lo tienen completo; R6 no.
- **Pantalla `programa.html`:** tabla `performances`, que está vacía → siempre "Sin historial".
- **Por qué está vacía:** `oficializar()` escribe sin mirar el error y la política exige super_admin.

## 5. Qué NO se hizo (a propósito)

- Paso 3 (front, con la baja de `resultados_legacy.html`): después de prod, en otro PR.
- Paso 4 (`rpc_corregir_resultado`, `resultado_correcciones`, pantalla) y estados de resolución: esperan a Fede.
- Merge del PR #34: espera tu OK. Sólo versiona lo aplicado.

## 6. Para saber

- **Desde ahora, una corrección de resultado en R6/R8 no tiene camino**, ni por pantalla, ni por API, ni con la key secreta, hasta el
  paso 4. Si hiciera falta antes, la única vía es una migración (sesión directa), con su informe.
- La pantalla todavía no conoce P0092 ni P0089: muestra "Error al guardar: <mensaje>". El mensaje es legible, pero el front del
  paso 3 lo va a presentar mejor y va a cortar F10 antes.
- `aplicar_resultado` ahora toma `FOR UPDATE` sobre el resultado siempre que haya `p_resultado_id`, aunque no venga
  `p_expected_updated_at`. Es un lock de fila dentro de la misma transacción: no cambia nada visible.
- `resultado_posiciones` y `resultado_apuestas` ahora se auditan. Cada F10 escribe en `auditoria` una fila por posición y por
  apuesta, borrada y reinsertada (~20–30 filas por carrera). Es esperado.

---

## Anexo

### A.1 `node tests/probe_resultados_cerrada.mjs --mutantes` (sandbox)

```
v1 en el template (tiene que ser la de prod 94d46dc0… / c3247d72…): { "aplicar_resultado" : "94d46dc0ed70e78329169bb3926f64c2", "desoficializar_carrera" : "c3247d72656833cd534e4c601900f25a" }
✅ B1 backfill: R8 C3 = la ÚLTIMA transición (operador 23/08 11:06:06)
✅ B1 backfill: R8 C5 sin usuario en la auditoría → fecha y por NULL
✅ B1 backfill: R9 C4 (18:17:24, secretario); provisional sin tocar
✅ B2 rollback del backfill → vuelve todo a NULL
✅ G1 staff aplicar_resultado en R8 C3 → P0092 de la RPC ("aplicar_resultado: … carrera 3")
✅ G2 service_role aplicar_resultado en R8 C5 → P0092 (service_role sujeto)
✅ G2b staff aplicar_resultado nuevo en R8 turno 9 (sin nº de programa) → P0092 "carrera del turno 9"
✅ G3 staff UPDATE directo de resultados en R8 → P0092 del trigger
✅ G4 service_role UPDATE directo de resultados en R8 → P0092 del trigger
✅ G5 staff DELETE de posiciones de R8 → P0092
✅ G5 staff INSERT de posiciones en R8 → P0092
✅ G5 staff UPDATE de apuestas de R8 → P0092
✅ G6 service_role DELETE de apuestas de R8 → P0092
✅ G7 staff desoficializar R8 C5 (sin plata comprometida) → P0092 de la RPC
✅ G8 staff desoficializar R8 C3 (con plata) → P0092 antes que "pagos emitidos"
✅ G9 sesión directa (migración) puede escribir R8
✅ G10 con la marca sgh.correccion_resultado (paso 4) pasa
✅ O1 staff oficializa R9 C6 → oficializado_at = now(), oficializado_por = el secretario
✅ O2 re-aplicar oficial (otro usuario) conserva quién y cuándo
✅ O3 oficial → provisional por aplicar_resultado → P0089 "des-oficializala primero" (ISSUE-089)
✅ O4 desoficializar en R9 → provisional con oficializado_* NULL
✅ O5 provisional → provisional: oficializado_at NULL
✅ O6 resultado NUEVO directo en oficial → fecha y usuario
✅ O7 service_role oficializa → fecha, usuario NULL
✅ A1 aplicar en R9 deja auditoría de resultado_posiciones y resultado_apuestas con el usuario
✅ P1 usuario activo con club que NO es staff (rol publico) → RLS en resultados
✅ P1 rol publico → RLS en resultado_posiciones
✅ P1 portal → RLS en resultados
✅ P2 staff sigue pudiendo escribir resultados de R9 por la API
✅ P3 el resto de las políticas no cambió (md5)

30/30 asserts OK
md5 en el sandbox: {"funciones":{"aplicar_resultado":"6594e5070ce82d1c90e9fed60ddd0566","desoficializar_carrera":"fc77286021e6ec54102f7463fd66b9bf","fn_resultado_cerrado_guard":"24b68443d9e200e26739fb0be6806721"},"politicas":{"resultados_insert":"1f501a4cd6d89115909b2d82853e0351","resultados_update":"5232e588f24bf123514396a183a531d9","resultados_delete":"35f84de1e92484a47f39b109ab053c7f","resultado_posiciones_insert":"fdb4fc104891c324f0a08da33a951cb7","resultado_posiciones_update":"0f264c9d96edf6e8c5169816628fc2ef","resultado_posiciones_delete":"9a16503239381f0b7be6c46062530c91"}}

── mutantes ──
✅ muere M1 trigger exime a service_role  ← G4, G6
✅ muere M2 sin trigger en resultado_posiciones  ← G5
✅ muere M3 sin auditoría de posiciones  ← A1
✅ muere M4 aplicar_resultado sin corte de reunión cerrada  ← G1, G2
✅ muere M5 aplicar_resultado deja oficial → provisional  ← O3
✅ muere M6 oficial → oficial pisa quién y cuándo  ← O2
✅ muere M7 desoficializar sin corte de reunión cerrada  ← G7, G8
✅ muere M8 trigger sin la excepción de migración  ← B2, G9
✅ muere M9 trigger sin la marca de corrección  ← G10
✅ muere M10 política de posiciones sin fn_is_staff  ← P1
✅ muere M11 backfill toma la PRIMERA transición  ← B1, B2

mutantes: 11/11 muertos
exit 0
```

### A.2 Migraciones + rollbacks en el sandbox (base `sgh_rc_rb`, borrada al final)

```
ANTES:
{"fn" : { "aplicar_resultado" : "94d46dc0ed70e78329169bb3926f64c2", "desoficializar_carrera" : "c3247d72656833cd534e4c601900f25a" }, "pol" : "e1b0ec5fbe3224a19339fcfece2b10a0", "trg" : ["resultados_set_updated_at", "trg_audit_resultados"], "ofi_con_at" : 0}
CON LAS 4:
{"fn" : { "aplicar_resultado" : "6594e5070ce82d1c90e9fed60ddd0566", "desoficializar_carrera" : "fc77286021e6ec54102f7463fd66b9bf", "fn_resultado_cerrado_guard" : "24b68443d9e200e26739fb0be6806721" }, "pol" : "8b2b1b2fd14d37dbb7778856d361645e", "trg" : ["resultados_set_updated_at", "trg_audit_resultado_apuestas", "trg_audit_resultado_posiciones", "trg_audit_resultados", "trg_resultado_cerrado", "trg_resultado_cerrado", "trg_resultado_cerrado"], "ofi_con_at" : 3}
TRAS LOS 4 ROLLBACKS:
{"fn" : { "aplicar_resultado" : "94d46dc0ed70e78329169bb3926f64c2", "desoficializar_carrera" : "c3247d72656833cd534e4c601900f25a" }, "pol" : "e1b0ec5fbe3224a19339fcfece2b10a0", "trg" : ["resultados_set_updated_at", "trg_audit_resultados"], "ofi_con_at" : 0}
```

---

## Verificación de push

```
$ git ls-remote origin reports
902e6eb85455e7a256d4446562d604021650da69	refs/heads/reports
$ git rev-parse HEAD
902e6eb85455e7a256d4446562d604021650da69
$ git ls-remote origin feat/resultados-reunion-cerrada
b3811d78e06b8855c81093c4c27220887fd1d6e0	refs/heads/feat/resultados-reunion-cerrada
```

Coinciden. Este bloque va en un commit posterior.
