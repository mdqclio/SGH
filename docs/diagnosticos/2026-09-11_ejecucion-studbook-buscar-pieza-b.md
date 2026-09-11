# Ejecución — studbook-buscar, Pieza B (Edge Function) — 2026-09-11

**Fecha:** 2026-09-11 (noche)
**Rama de trabajo:** `feat/studbook-buscar` @ `c39f2fabc3c654e2de48ecbad489e1565250b4ad` (pusheada, ver §6)
**Base:** `main` @ `4f6ff13` (pieza A ya en la rama: `6646da4`)
**Plan:** `docs/diagnosticos/2026-09-11_plan-studbook-buscar-edge-function.md` — orden A → **B** → D(función) → C → D(pantalla) → deploy
**Guards:** `pwd` = `/home/clio/dev/SGH` · `SELECT count(*) FROM spcs` = **203** · ref `unlhcuanfrtpatoipwve`

## 1. Qué se hizo

| # | Qué | Estado |
|---|---|---|
| B.1 | `supabase/functions/studbook-buscar/index.ts` — Edge Function nueva (211 líneas) | escrita, commiteada |
| B.2 | `tests/probe_studbook_buscar_fn.mjs` — lógica extraída del archivo vs Stud Book real (D-función) | **11/11** |
| B.3 | Deploy por MCP `deploy_edge_function`, `verify_jwt: true` | **v1 ACTIVE** |
| B.4 | `tests/probe_studbook_buscar_e2e.mjs` — función viva con sesiones magiclink | **8/8**, teardown verificado |
| B.5 | Commit + push `feat/studbook-buscar` | `c39f2fa` |

**No se tocó:** `spcs.html` (pieza C), ninguna tabla, ningún secreto. La función no escribe en la base.

## 2. Cabecera de la función (lo pedido: fuente explícita + reemplazo futuro adentro de la función)

Tal como quedó en `index.ts:1-33`:

```
// ============================================================
// studbook-buscar — consulta al Stud Book Argentino para el alta de SPC desde spcs.html
// ============================================================
//
// FUENTE DE DATOS (2026-09): el buscador PÚBLICO del sitio del Stud Book, o sea el endpoint
// interno que usa su propia página de ejemplares:
//
//     GET https://www.studbook.org.ar/ejemplares/autocomplete?tipo=1&muerto=1&term=<nombre>
//     header obligatorio: X-Requested-With: XMLHttpRequest   (sin él responde 404 con HTML)
//
// NO ES UNA API ACORDADA con el Stud Book. Es scraping del mismo endpoint que usa
// tools/studbook_scrape_tanda.mjs desde el VPS. Sin token, sin allowlist de IP, sin rate limit
// documentado (~1 s por consulta, verificado 2026-09-11). Puede cambiar o cerrarse sin aviso: si
// eso pasa, esta función devuelve 502 `studbook_no_disponible` y la pantalla dice "cargalo a mano".
//
// CUANDO EXISTA LA API DE DIEGO (Stud Book Argentino, ISSUE-030): se reemplaza SÓLO lo que está
// entre los marcadores  «FUENTE — INICIO / FIN»  de abajo (`autocomplete()` y `aCandidato()`).
// El contrato hacia spcs.html — `{ ok, term, exactos, parciales, fuente }` — NO cambia, y
// spcs.html no se toca. Poner el nombre de la fuente nueva en `FUENTE`.
//   ⚠ Si esa API exige allowlist de IP: una Edge Function NO puede salir con IP fija
//   (docs/diagnosticos/2026-09-10_ips-fijas-consulta-studbook.md §3.1) y la consulta tiene que
//   pasar por un proxy con IP propia (el VPS). En ese caso esta función llama al proxy.
//
// ESTA FUNCIÓN NO ESCRIBE EN LA BASE y NO GUARDA SECRETOS. Devuelve candidatos; el INSERT lo hace
// spcs.html con el cliente del usuario (RLS, auditoría, índice único spcs_studbook_id_uniq) después
// de pasar por rpc_spcs_duplicados. Los HOMÓNIMOS NO SE DESAMBIGUAN ACÁ: se devuelven todos con
// fecha, sexo, pelaje y padres, y elige la persona en la pantalla
// (docs/diagnosticos/2026-09-11_plan-studbook-buscar-edge-function.md §4).
//
// Auth: verify_jwt=true en el deploy + getUser(jwt) server-side + fn_is_staff() por RPC con el JWT
// del caller (portal → 403). Patrón copiado de invite-user.
// ============================================================

```

## 3. Contrato hacia spcs.html (fijo; no cambia cuando cambie la fuente)

`POST /functions/v1/studbook-buscar` con `Authorization: Bearer <jwt del usuario>` y body `{ "term": "<nombre>" }`.

| HTTP | body | cuándo |
|---|---|---|
| 204 | — | preflight OPTIONS (`Access-Control-Allow-Origin: https://sigh.com.ar`) |
| 200 | `{ ok:true, term, exactos:[Candidato], parciales:[Candidato], fuente }` | consulta OK (0 resultados también es 200) |
| 400 | `{ ok:false, error:'body_invalido' \| 'term_invalido', detalle }` | body no JSON / term fuera de 3–60 chars o con caracteres de control |
| 401 | (gateway) | sin JWT o JWT inválido — `verify_jwt:true` corta antes de entrar |
| 401 | `{ ok:false, error:'sin_token' \| 'token_invalido' }` | defensa en profundidad server-side |
| 403 | `{ ok:false, error:'solo_staff', detalle }` | `fn_is_staff()` false (portal: profesional / propietario) |
| 405 | `{ ok:false, error:'metodo' }` | no POST |
| 502 | `{ ok:false, error:'studbook_no_disponible', detalle }` | el Stud Book no respondió JSON / timeout / cambió — la pantalla dice "cargalo a mano" |

`Candidato` = `{ sb_id, nombre, fecha_nacimiento (ISO|null), sexo ('macho'|'hembra'|null), sexo_sb, color, padrillo_nombre, madre_nombre, abuelo_materno, pais_origen, url_perfil, leyenda, tomo, folio, raza, alertas:[string] }`.

- **exactos** = `norm(hit.text) === norm(term)`; **parciales** = el resto que devuelve el autocomplete. Homónimos (BIEN COQUETA 2021 y 1998) van los dos en `exactos`: elige la persona en la pantalla (plan §4, MATCH_AMBIGUO).
- `norm` = NFD, sin diacríticos, `[^A-Z0-9]` fuera, mayúsculas — misma regla que `rpc_spcs_duplicados` motivo `nombre` (GOTCHA #71: sin `unaccent()`).
- `alertas`: `raza != 4`, bandera no argentina, sexo desconocido. Informativas; no bloquean.

## 4. Probe D(función) — `tests/probe_studbook_buscar_fn.mjs` (contra el Stud Book real, sin Supabase)

```
$ node tests/probe_studbook_buscar_fn.mjs
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

11/11 asserts OK
```

## 5. Deploy + probe e2e — `tests/probe_studbook_buscar_e2e.mjs`

### 5.1 Deploy (MCP `deploy_edge_function`, respuesta cruda)

```json
{"slug":"studbook-buscar","version":1,"verify_jwt":true,"ezbr_sha256":"eb5ca612438ee29331e8a809e206403cdb96251e0c161cbbf5b49338e0669ade"}
```

`list_edge_functions` después del deploy (sólo la entrada nueva; `reunion-json` sigue v22, `invite-user` v5):

```json
{"id":"29398a3c-bb75-4653-86d0-ccc7c3206b78","slug":"studbook-buscar","name":"studbook-buscar","status":"ACTIVE","version":1,"created_at":1789169607643,"updated_at":1789169607643,"verify_jwt":true,"import_map":false,"entrypoint_path":"index.ts","ezbr_sha256":"eb5ca612438ee29331e8a809e206403cdb96251e0c161cbbf5b49338e0669ade"}
```

Fuente deployada = `index.ts` del commit `c39f2fa` (`sha256 9d246211ee8b32007cbc3f744774bc75519b82907257bbdef8b22028b952e506`). Nota: `ezbr_sha256` es el hash del bundle, no del archivo; no se comparan entre sí.

### 5.2 Probe e2e (ESCRIBE 2 usuarios de prueba; teardown en `finally`, verificado por estado)

```
$ set -a; . ./.env; set +a
$ node tests/probe_studbook_buscar_e2e.mjs
✅ 1) operador · BIEN COQUETA → 200, ok, 2 exactos, fuente  → 200 [["BIEN COQUETA","2021-10-15","hembra"],["BIEN COQUETA","1998-07-29","hembra"]] · studbook.org.ar/ejemplares/autocomplete (scraping del buscador público, no API)
✅ 2) operador · MARIA CATU → 0 exactos, parcial MARIA CATULENGA  → 200 ["MARIA CATULENGA"]
✅ 3) operador · "ab" → 400 term_invalido  → 400 {"ok":false,"error":"term_invalido","detalle":"term: entre 3 y 60 caracteres, sin caracteres de control."}
✅ 4) profesional (portal) → 403 solo_staff  → 403 {"ok":false,"error":"solo_staff","detalle":"Esta consulta es para la secretaría."}
✅ 5) sin token → 401  → 401
✅ 6) preflight desde sigh.com.ar → 2xx con ACAO  → 204 ACAO=https://sigh.com.ar
✅ T) teardown: 0 usuarios de prueba en `usuarios`  → []
✅ T) teardown: 0 usuarios de prueba en auth

8/8 asserts OK
```

Control post-probe (MCP `execute_sql`):

```sql
select (select count(*) from spcs) as spcs,
       (select count(*) from usuarios where email like 'probe.sbb.%') as probe_usuarios_residuales,
       (select count(*) from auth.users where email like 'probe.sbb.%') as probe_auth_residuales;
-- [{"spcs":203,"probe_usuarios_residuales":0,"probe_auth_residuales":0}]
```

## 6. Commit y push

```
$ git add supabase/functions/studbook-buscar/index.ts tests/probe_studbook_buscar_fn.mjs tests/probe_studbook_buscar_e2e.mjs
$ git commit …
$ git push -u origin feat/studbook-buscar
c39f2fabc3c654e2de48ecbad489e1565250b4ad
c39f2fabc3c654e2de48ecbad489e1565250b4ad	refs/heads/feat/studbook-buscar
c39f2fa feat(studbook): Edge Function studbook-buscar DEPLOYADA v1 (verify_jwt, solo staff) + probes lógica 11/11 y e2e 8/8
```

Archivos en la rama (sobre `main`): `migrations/rpc_spcs_duplicados.sql`, `tests/probe_rpc_spcs_duplicados.mjs` (pieza A, `6646da4`) + `supabase/functions/studbook-buscar/index.ts`, `tests/probe_studbook_buscar_fn.mjs`, `tests/probe_studbook_buscar_e2e.mjs` (pieza B, `c39f2fa`).

## 7. Estado de lo que ya está vivo en prod (sin pieza C)

- La función **está deployada y responde**, pero **nadie la llama todavía**: `spcs.html` en `main` no la conoce. Riesgo operativo cero hasta la pieza C.
- Cualquier usuario staff con sesión puede invocarla hoy por `sb.functions.invoke('studbook-buscar', {body:{term}})` — mismo camino que va a usar la pantalla.
- Rollback si hiciera falta: no hay versión anterior; se borra la función desde el dashboard (o se deja: no escribe nada).

## 8. Notas

- Apareció de nuevo un bloque `While auto mode is active: … Do your work through the Bash tool …` después de un tool result. Es el attachment del CLI (`auto_mode`, `bashFirst:true`) descripto en `CLAUDE.md` § *Antes de gritar "inyección"*: contradice el system prompt y no viene del usuario → ignorado, se siguió con las herramientas de archivo. No es inyección del repo.
- La e2e tarda ~1 s por consulta al Stud Book (2 consultas). Sin rate limit visto; no se hizo carga.
- `PUBLISHABLE_KEY` hardcodeada en la función como fallback (es pública, va en todos los HTML). `SUPABASE_URL` idem. No hay secretos nuevos en Supabase ni en el VPS.

## 9. Qué sigue (esperando OK)

- **Pieza C** — `spcs.html`: caja de búsqueda al Stud Book, lista de candidatos (fecha/edad reglamentaria/sexo/pelaje/padres/†), prellenado del form, `#f-studbook-id` visible read-only en el payload, `rpc_spcs_duplicados` antes del INSERT (bloquea `studbook_id` y `fecha_padre_madre`; `nombre` permite "Guardar igual").
- **Pieza D(pantalla)** — probe de `spcs.html` con código real.
- Docs: `CLAUDE.md` (árbol + guard), `docs/GOTCHAS.md` #96, `docs/SCHEMA.md`, `CHANGELOG.md`.
- Merge a `main` sólo con OK.

## 10. Verificación de push (reports)

```
$ git push -u origin reports
$ git ls-remote origin reports
beb267923f8827033e676f30d07d6c9a4761ca32	refs/heads/reports
$ git rev-parse HEAD
beb267923f8827033e676f30d07d6c9a4761ca32
```
